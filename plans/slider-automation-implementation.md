# Slider Otomasyon - Implementasyon Kılavuzu

## 📋 Adım Adım Implementasyon

### Adım 1: Backend - Database Migration (Opsiyonel)

Mevcut tablo yeterli, ancak ek metadata için:

```sql
-- migrations/015_slider_metadata.sql
ALTER TABLE showcase_slider_images 
ADD COLUMN IF NOT EXISTS prompt TEXT,
ADD COLUMN IF NOT EXISTS generation_mode TEXT,
ADD COLUMN IF NOT EXISTS metadata JSONB;

CREATE INDEX IF NOT EXISTS idx_showcase_slider_images_mode 
ON showcase_slider_images(generation_mode) 
WHERE is_active = true;
```

### Adım 2: Backend - Image Generation Service

**Dosya**: `app/image_generation.py`

Mevcut dosyaya eklenecek fonksiyonlar:

```python
async def generate_and_publish_slider_images(
    mode: str = "match-based",
    count: int = 3,
    settings: Optional[Settings] = None,
) -> Dict[str, Any]:
    """
    Generate slider images and automatically publish them to database.
    
    Args:
        mode: "match-based" or "general"
        count: Number of images to generate (1-5)
        settings: App settings
    
    Returns:
        Dict with generated images and publish status
    """
    if settings is None:
        settings = get_settings()
    
    from sqlalchemy import create_engine, text
    from datetime import datetime, timezone
    
    # Generate images based on mode
    if mode == "match-based":
        generated_images = await generate_match_based_slider_images(settings=settings)
    else:
        generated_images = await generate_slider_images_batch(count=count, settings=settings)
    
    if not generated_images:
        raise ImageGenerationError("No images were generated")
    
    # Publish to database
    engine = create_engine(settings.db_url)
    now_utc = datetime.now(timezone.utc)
    
    with engine.begin() as conn:
        # Deactivate old images
        conn.execute(
            text("UPDATE showcase_slider_images SET is_active = false WHERE is_active = true")
        )
        
        # Insert new images
        for idx, img in enumerate(generated_images):
            conn.execute(
                text("""
                    INSERT INTO showcase_slider_images 
                    (image_url, display_order, is_active, prompt, generation_mode, metadata, created_at, updated_at)
                    VALUES (:image_url, :display_order, true, :prompt, :mode, :metadata, :created_at, :updated_at)
                """),
                {
                    "image_url": img.get("relative_url"),
                    "display_order": idx,
                    "prompt": img.get("prompt"),
                    "mode": mode,
                    "metadata": json.dumps(img.get("metadata", {})),
                    "created_at": now_utc,
                    "updated_at": now_utc,
                }
            )
    
    return {
        "success": True,
        "generated": len(generated_images),
        "published": True,
        "mode": mode,
        "images": generated_images,
    }


async def regenerate_single_slider_image(
    image_id: int,
    mode: str = "match-based",
    index: int = 0,
    settings: Optional[Settings] = None,
) -> Dict[str, Any]:
    """
    Regenerate a single slider image.
    
    Args:
        image_id: Database ID of the image to replace
        mode: "match-based" or "general"
        index: Index for prompt selection (0-2)
        settings: App settings
    
    Returns:
        Dict with regenerated image info
    """
    if settings is None:
        settings = get_settings()
    
    from sqlalchemy import create_engine, text
    from datetime import datetime, timezone
    
    # Get appropriate prompt
    if mode == "match-based":
        from app.fixture_board import get_fixture_board_page
        
        fixtures_payload = get_fixture_board_page(
            settings=settings,
            page=1,
            page_size=10,
            target_date=None,
            sort="desc",
            game_type="all",
            featured_only=False,
        )
        
        fixtures = fixtures_payload.get("items", [])[:3]
        
        if fixtures and index < len(fixtures):
            fixture = fixtures[index]
            home_team = fixture.get("home_team_name", "Team A")
            away_team = fixture.get("away_team_name", "Team B")
            league = fixture.get("league_name", "Football League")
            match_result = fixture.get("markets", {}).get("match_result", {})
            home_odd = match_result.get("home", 0)
            away_odd = match_result.get("away", 0)
            
            prompt = (
                f"Professional sports betting advertisement banner featuring: "
                f"'{home_team} vs {away_team}' match from {league}. "
                f"Modern minimalist design with navy blue (#03132F) gradient background. "
                f"Neon lime green (#B9F738) glowing accents and text. "
                f"Include football stadium atmosphere, dramatic lighting. "
                f"Add subtle betting odds display: {home_odd:.2f} and {away_odd:.2f}. "
                f"Futuristic AI-powered sports analytics aesthetic. "
                f"Clean, professional, cinematic quality, ultra high definition. "
                f"Text overlay: 'EdgeFootball AI Predictions'."
            )
        else:
            prompts = get_default_slider_prompts()
            prompt = prompts[index % len(prompts)]
    else:
        prompts = get_default_slider_prompts()
        prompt = prompts[index % len(prompts)]
    
    # Generate single image
    new_image = await generate_football_slider_image(prompt, settings)
    
    # Update database
    engine = create_engine(settings.db_url)
    now_utc = datetime.now(timezone.utc)
    
    with engine.begin() as conn:
        conn.execute(
            text("""
                UPDATE showcase_slider_images 
                SET image_url = :image_url,
                    prompt = :prompt,
                    generation_mode = :mode,
                    metadata = :metadata,
                    updated_at = :updated_at
                WHERE id = :id
            """),
            {
                "id": image_id,
                "image_url": new_image.get("relative_url"),
                "prompt": new_image.get("prompt"),
                "mode": mode,
                "metadata": json.dumps(new_image.get("metadata", {})),
                "updated_at": now_utc,
            }
        )
    
    return {
        "success": True,
        "image_id": image_id,
        "image": new_image,
    }
```

### Adım 3: Backend - API Endpoints

**Dosya**: `app/main.py`

Mevcut dosyaya eklenecek endpoint'ler:

```python
from pydantic import BaseModel, Field
from typing import Literal

class SliderGenerateAndPublishRequest(BaseModel):
    mode: Literal["match-based", "general"] = Field(default="match-based")
    count: int = Field(default=3, ge=1, le=5)


class SliderRegenerateSingleRequest(BaseModel):
    image_id: int = Field(gt=0)
    mode: Literal["match-based", "general"] = Field(default="match-based")
    index: int = Field(default=0, ge=0, le=2)


@app.post("/admin/slider/generate-and-publish")
async def generate_and_publish_slider_endpoint(
    request: SliderGenerateAndPublishRequest,
    settings=Depends(get_settings),
    current_user=Depends(get_current_user),
):
    """
    Generate slider images and automatically publish them.
    Superadmin only.
    """
    from app.admin import _ensure_superadmin_permissions
    from app.image_generation import generate_and_publish_slider_images
    
    _ensure_superadmin_permissions(current_user)
    
    try:
        result = await generate_and_publish_slider_images(
            mode=request.mode,
            count=request.count,
            settings=settings,
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/admin/slider/regenerate-single")
async def regenerate_single_slider_endpoint(
    request: SliderRegenerateSingleRequest,
    settings=Depends(get_settings),
    current_user=Depends(get_current_user),
):
    """
    Regenerate a single slider image.
    Superadmin only.
    """
    from app.admin import _ensure_superadmin_permissions
    from app.image_generation import regenerate_single_slider_image
    
    _ensure_superadmin_permissions(current_user)
    
    try:
        result = await regenerate_single_slider_image(
            image_id=request.image_id,
            mode=request.mode,
            index=request.index,
            settings=settings,
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/admin/slider/current")
def get_current_slider_images(
    settings=Depends(get_settings),
    current_user=Depends(get_current_user),
):
    """
    Get current active slider images with full metadata.
    Superadmin only.
    """
    from app.admin import _ensure_superadmin_permissions, load_showcase_slider_images
    
    _ensure_superadmin_permissions(current_user)
    
    return load_showcase_slider_images(settings=settings, include_inactive=False)
```

### Adım 4: Frontend - Slider Management Page

**Dosya**: `web/src/pages/SuperAdminSliderPage.jsx`

```javascript
import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import ActionButton from "../components/dashboard/ActionButton";
import "./SuperAdminSliderPage.css";

const API_BASE = String(import.meta.env.VITE_API_BASE_URL || "http://localhost:8001").replace(/\/+$/, "");
const AUTH_TOKEN_KEY = "football_ai_access_token";

function readAuthToken() {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(AUTH_TOKEN_KEY) || "";
}

async function apiRequest(endpoint, options = {}) {
  const token = readAuthToken();
  const url = `${API_BASE}${endpoint}`;
  
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  
  const data = await response.json().catch(() => ({}));
  
  if (!response.ok) {
    throw new Error(data.detail || `Request failed: ${response.status}`);
  }
  
  return data;
}

export default function SuperAdminSliderPage() {
  const navigate = useNavigate();
  
  // State
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [regenerating, setRegenerating] = useState(null);
  const [draftImages, setDraftImages] = useState([]);
  const [liveImages, setLiveImages] = useState([]);
  const [activeSlide, setActiveSlide] = useState(0);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  
  // Load current slider images
  const loadCurrentSlider = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiRequest("/admin/slider/current");
      const images = data.items || [];
      setDraftImages(images);
      
      // Also load public slider
      const publicData = await apiRequest("/slider/public");
      setLiveImages(publicData.items || []);
    } catch (err) {
      setError(err.message || "Slider görselleri yüklenemedi");
    } finally {
      setLoading(false);
    }
  }, []);
  
  // Generate and publish slider images
  const handleGenerateAndPublish = async (mode) => {
    setGenerating(true);
    setMessage("");
    setError("");
    
    try {
      const result = await apiRequest("/admin/slider/generate-and-publish", {
        method: "POST",
        body: JSON.stringify({ mode, count: 3 }),
      });
      
      setMessage(`✅ ${result.generated} görsel başarıyla oluşturuldu ve canlıya alındı!`);
      await loadCurrentSlider();
    } catch (err) {
      setError(err.message || "Görseller oluşturulamadı");
    } finally {
      setGenerating(false);
    }
  };
  
  // Regenerate single image
  const handleRegenerateSingle = async (imageId, index, mode) => {
    setRegenerating(imageId);
    setMessage("");
    setError("");
    
    try {
      const result = await apiRequest("/admin/slider/regenerate-single", {
        method: "POST",
        body: JSON.stringify({ image_id: imageId, mode, index }),
      });
      
      setMessage(`✅ Görsel ${index + 1} başarıyla yenilendi!`);
      await loadCurrentSlider();
    } catch (err) {
      setError(err.message || "Görsel yenilenemedi");
    } finally {
      setRegenerating(null);
    }
  };
  
  // Auto-advance slider
  useEffect(() => {
    if (liveImages.length <= 1) return;
    
    const timer = setInterval(() => {
      setActiveSlide((prev) => (prev + 1) % liveImages.length);
    }, 4600);
    
    return () => clearInterval(timer);
  }, [liveImages.length]);
  
  // Load on mount
  useEffect(() => {
    loadCurrentSlider();
  }, [loadCurrentSlider]);
  
  const activeSlideImage = liveImages[activeSlide] || "";
  
  return (
    <div className="container slider-management-page">
      <section className="card wide">
        <div className="row spread wrap">
          <div>
            <h2>🎨 Slider Yönetimi</h2>
            <p className="help-text">
              Tek tıkla 3 adet slider görseli oluştur ve otomatik olarak canlıya al.
            </p>
          </div>
          <div className="row wrap">
            <ActionButton className="secondary" onClick={() => navigate("/admin")}>
              ← Geri Dön
            </ActionButton>
            <ActionButton 
              className="secondary" 
              loading={loading} 
              loadingText="Yenileniyor..."
              onClick={loadCurrentSlider}
            >
              🔄 Yenile
            </ActionButton>
          </div>
        </div>
        
        {/* Status Messages */}
        {error && <div className="error">{error}</div>}
        {message && <div className="success-box">{message}</div>}
        
        {/* Control Panel */}
        <div className="slider-control-panel">
          <h3>Yeni Görseller Oluştur</h3>
          <div className="row wrap" style={{ gap: "12px" }}>
            <ActionButton
              className="accent-gradient"
              loading={generating}
              loadingText="Oluşturuluyor..."
              onClick={() => handleGenerateAndPublish("match-based")}
              disabled={generating}
            >
              🏆 Maç Bazlı Oluştur (Önerilen)
            </ActionButton>
            <ActionButton
              className="secondary"
              loading={generating}
              loadingText="Oluşturuluyor..."
              onClick={() => handleGenerateAndPublish("general")}
              disabled={generating}
            >
              🎨 Genel Tasarım Oluştur
            </ActionButton>
          </div>
          <p className="help-text" style={{ marginTop: "12px", fontSize: "13px" }}>
            💡 Maç bazlı: Bugünün en önemli 3 maçını seçer ve her biri için özel tasarım oluşturur.<br />
            💡 Genel tasarım: Futbol temalı soyut ve modern görseller oluşturur.<br />
            ⚡ Görseller oluşturulduktan sonra otomatik olarak canlıya alınır.
          </p>
        </div>
        
        {/* Draft Images Section */}
        <div className="slider-draft-section">
          <h3>Oluşturulan Görseller</h3>
          {loading ? (
            <p className="small-text">Yükleniyor...</p>
          ) : draftImages.length === 0 ? (
            <div className="empty-state">
              <p>Henüz görsel oluşturulmamış.</p>
              <p className="small-text">Yukarıdaki butonları kullanarak yeni görseller oluşturabilirsiniz.</p>
            </div>
          ) : (
            <div className="draft-images-grid">
              {draftImages.map((img, index) => (
                <div key={img.id} className="draft-image-card">
                  <div className="draft-image-wrapper">
                    <img 
                      src={`${API_BASE}${img.image_url}`} 
                      alt={`Slider ${index + 1}`}
                      loading="lazy"
                    />
                  </div>
                  <div className="draft-image-info">
                    <div className="draft-image-meta">
                      <strong>Görsel {index + 1}</strong>
                      <span className="small-text">
                        {img.generation_mode === "match-based" ? "🏆 Maç Bazlı" : "🎨 Genel"}
                      </span>
                    </div>
                    {img.prompt && (
                      <p className="draft-image-prompt">{img.prompt.substring(0, 100)}...</p>
                    )}
                    <ActionButton
                      className="regenerate-btn"
                      loading={regenerating === img.id}
                      loadingText="Yenileniyor..."
                      onClick={() => handleRegenerateSingle(img.id, index, img.generation_mode || "match-based")}
                      disabled={regenerating !== null}
                    >
                      🔄 Yeniden Oluştur
                    </ActionButton>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        
        {/* Live Slider Preview */}
        <div className="slider-live-section">
          <h3>Canlı Slider Önizlemesi</h3>
          <p className="help-text">Ana sayfada kullanıcıların gördüğü slider:</p>
          
          {liveImages.length === 0 ? (
            <div className="empty-state">
              <p>Canlı slider görseli yok.</p>
            </div>
          ) : (
            <div className="live-slider-container">
              <div 
                className="live-slider-stage" 
                style={{ backgroundImage: `url(${API_BASE}${activeSlideImage})` }}
              >
                <div className="live-slider-overlay" />
                <div className="live-slider-content">
                  <div className="live-slider-controls">
                    <button
                      type="button"
                      className="live-slider-btn"
                      onClick={() => setActiveSlide((prev) => (prev - 1 + liveImages.length) % liveImages.length)}
                    >
                      ◀
                    </button>
                    <button
                      type="button"
                      className="live-slider-btn"
                      onClick={() => setActiveSlide((prev) => (prev + 1) % liveImages.length)}
                    >
                      ▶
                    </button>
                  </div>
                </div>
              </div>
              
              <div className="live-slider-dots">
                {liveImages.map((_, index) => (
                  <button
                    key={index}
                    type="button"
                    className={`live-slider-dot ${index === activeSlide ? "active" : ""}`}
                    onClick={() => setActiveSlide(index)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
```

### Adım 5: Frontend - Styles

**Dosya**: `web/src/pages/SuperAdminSliderPage.css`

```css
.slider-management-page {
  padding: 24px;
}

.slider-control-panel {
  margin: 32px 0;
  padding: 24px;
  background: rgba(185, 247, 56, 0.05);
  border-radius: 12px;
  border: 1px solid rgba(185, 247, 56, 0.2);
}

.slider-control-panel h3 {
  margin-bottom: 16px;
  color: #B9F738;
}

.slider-draft-section {
  margin: 32px 0;
}

.slider-draft-section h3 {
  margin-bottom: 16px;
}

.draft-images-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 24px;
  margin-top: 16px;
}

.draft-image-card {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.1);
  transition: transform 0.2s, box-shadow 0.2s;
}

.draft-image-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 24px rgba(185, 247, 56, 0.2);
}

.draft-image-wrapper {
  position: relative;
  width: 100%;
  padding-top: 56.25%; /* 16:9 aspect ratio */
  overflow: hidden;
  background: #000;
}

.draft-image-wrapper img {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.draft-image-info {
  padding: 16px;
}

.draft-image-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.draft-image-prompt {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
  margin: 8px 0;
  line-height: 1.4;
}

.regenerate-btn {
  width: 100%;
  margin-top: 12px;
  background: #2196F3 !important;
  font-size: 14px;
  padding: 10px 16px;
}

.regenerate-btn:hover {
  background: #1976D2 !important;
}

.slider-live-section {
  margin: 32px 0;
}

.slider-live-section h3 {
  margin-bottom: 8px;
}

.live-slider-container {
  margin-top: 16px;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
}

.live-slider-stage {
  position: relative;
  width: 100%;
  height: 400px;
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
}

.live-slider-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    to bottom,
    rgba(3, 19, 47, 0.3) 0%,
    rgba(3, 19, 47, 0.7) 100%
  );
}

.live-slider-content {
  position: relative;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.live-slider-controls {
  display: flex;
  gap: 16px;
}

.live-slider-btn {
  background: rgba(185, 247, 56, 0.9);
  color: #03132F;
  border: none;
  border-radius: 50%;
  width: 48px;
  height: 48px;
  font-size: 20px;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.live-slider-btn:hover {
  background: #B9F738;
  transform: scale(1.1);
}

.live-slider-dots {
  display: flex;
  justify-content: center;
  gap: 12px;
  padding: 16px;
  background: rgba(3, 19, 47, 0.8);
}

.live-slider-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 2px solid rgba(185, 247, 56, 0.5);
  background: transparent;
  cursor: pointer;
  transition: all 0.2s;
}

.live-slider-dot.active {
  background: #B9F738;
  border-color: #B9F738;
  transform: scale(1.2);
}

.live-slider-dot:hover {
  border-color: #B9F738;
}

.empty-state {
  text-align: center;
  padding: 48px 24px;
  color: rgba(255, 255, 255, 0.6);
}

.empty-state p {
  margin: 8px 0;
}

/* Responsive */
@media (max-width: 768px) {
  .draft-images-grid {
    grid-template-columns: 1fr;
  }
  
  .live-slider-stage {
    height: 300px;
  }
  
  .live-slider-btn {
    width: 40px;
    height: 40px;
    font-size: 16px;
  }
}
```

### Adım 6: Frontend - Routing

**Dosya**: `web/src/App.jsx`

Mevcut route'lara ekle:

```javascript
import SuperAdminSliderPage from "./pages/SuperAdminSliderPage";

// Route tanımlaması içinde:
<Route path="/admin/slider-management" element={<SuperAdminSliderPage />} />
```

### Adım 7: Navigation Link Ekleme

Admin sayfalarına link ekle (örn. `AdminHomePage.jsx` veya `SuperAdminOddsBannerPage.jsx`):

```javascript
<ActionButton 
  className="secondary" 
  onClick={() => navigate("/admin/slider-management")}
>
  🎨 Slider Yönetimi
</ActionButton>
```

## 🧪 Test Komutları

### Backend Test

```bash
# Test dosyası oluştur: tests/test_slider_automation.py
pytest tests/test_slider_automation.py -v
```

### Frontend Test

```bash
# Geliştirme sunucusunu başlat
cd web
npm run dev

# Tarayıcıda test et:
# 1. http://localhost:5173/admin/slider-management
# 2. Superadmin olarak giriş yap
# 3. "Maç Bazlı Oluştur" butonuna tıkla
# 4. Görsellerin oluşturulduğunu doğrula
# 5. Bir görseli yeniden oluştur
# 6. Ana sayfada slider'ı kontrol et
```

## 🚀 Deployment

```bash
# Backend
docker-compose up -d --build

# Frontend
cd web
npm run build
# Build dosyalarını sunucuya deploy et
```

## ✅ Checklist

- [ ] Backend fonksiyonları eklendi
- [ ] API endpoint'leri oluşturuldu
- [ ] Frontend sayfası oluşturuldu
- [ ] CSS stilleri eklendi
- [ ] Route tanımlandı
- [ ] Navigation link'i eklendi
- [ ] Superadmin yetkisi kontrol edildi
- [ ] Test edildi
- [ ] Production'a deploy edildi
