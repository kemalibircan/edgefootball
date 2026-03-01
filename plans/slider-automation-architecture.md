# Slider Otomasyon Sistemi - Mimari Diyagramlar

## 🏗️ Sistem Mimarisi

```mermaid
graph TB
    subgraph Frontend
        A[SuperAdminSliderPage.jsx]
        B[Oluştur Butonu]
        C[Draft Önizleme Paneli]
        D[Yenile Butonları]
        E[Canlı Slider Önizleme]
    end
    
    subgraph Backend API
        F[POST /admin/slider/generate-and-publish]
        G[POST /admin/slider/regenerate-single]
        H[GET /admin/slider/current]
        I[GET /slider/public]
    end
    
    subgraph Services
        J[image_generation.py]
        K[admin.py]
        L[DALL-E 3 API]
    end
    
    subgraph Storage
        M[(PostgreSQL)]
        N[/static/slider/]
    end
    
    subgraph Public
        O[Ana Sayfa Slider]
    end
    
    B -->|1. Tek Tık| F
    F -->|2. Oluştur| J
    J -->|3. API Call| L
    L -->|4. Görseller| J
    J -->|5. Kaydet| N
    J -->|6. DB Insert| M
    F -->|7. Response| A
    A -->|8. Güncelle| C
    
    D -->|Yenile| G
    G -->|Tek Görsel| J
    
    C -->|Önizle| E
    E -->|Yükle| H
    H -->|Aktif Görseller| M
    
    O -->|Public API| I
    I -->|Canlı Görseller| M
```

## 🔄 İş Akışı Diyagramı

```mermaid
sequenceDiagram
    participant SA as SuperAdmin
    participant FE as Frontend
    participant BE as Backend
    participant DALLE as DALL-E 3
    participant DB as Database
    participant FS as File System
    participant PU as Public User
    
    Note over SA,FS: Senaryo 1: İlk Görsel Oluşturma
    
    SA->>FE: Maç Bazlı Oluştur butonuna tıkla
    FE->>FE: setGenerating(true)
    FE->>BE: POST /admin/slider/generate-and-publish
    
    BE->>BE: Yetki kontrolü (superadmin)
    BE->>BE: Bugünün maçlarını getir
    BE->>BE: 3 prompt oluştur
    
    par Paralel Görsel Oluşturma
        BE->>DALLE: Görsel 1 isteği
        DALLE-->>BE: Görsel 1 URL
        BE->>FS: Görsel 1 kaydet
    and
        BE->>DALLE: Görsel 2 isteği
        DALLE-->>BE: Görsel 2 URL
        BE->>FS: Görsel 2 kaydet
    and
        BE->>DALLE: Görsel 3 isteği
        DALLE-->>BE: Görsel 3 URL
        BE->>FS: Görsel 3 kaydet
    end
    
    BE->>DB: Eski görselleri deaktive et
    BE->>DB: Yeni 3 görseli kaydet (active=true)
    BE-->>FE: Success + görsel listesi
    
    FE->>FE: Draft paneli güncelle
    FE->>FE: Başarı mesajı göster
    FE->>BE: GET /admin/slider/current
    BE->>DB: Aktif görselleri getir
    BE-->>FE: Canlı görseller
    FE->>FE: Canlı slider güncelle
    
    Note over SA,PU: Senaryo 2: Tek Görseli Yenileme
    
    SA->>FE: Görsel 2 için yenile butonuna tıkla
    FE->>BE: POST /admin/slider/regenerate-single
    BE->>DALLE: Yeni görsel isteği
    DALLE-->>BE: Yeni görsel URL
    BE->>FS: Yeni görseli kaydet
    BE->>DB: Görsel 2'yi güncelle
    BE-->>FE: Success + yeni görsel
    FE->>FE: Sadece görsel 2'yi güncelle
    
    Note over PU,DB: Senaryo 3: Public Kullanıcı
    
    PU->>FE: Ana sayfayı ziyaret et
    FE->>BE: GET /slider/public
    BE->>DB: is_active=true görselleri getir
    BE-->>FE: Aktif görseller
    FE->>FE: Slider'ı göster (otomatik geçiş)
```

## 🗄️ Veritabanı Şeması

```mermaid
erDiagram
    showcase_slider_images {
        bigserial id PK
        text image_url
        int display_order
        boolean is_active
        bigint created_by FK
        bigint updated_by FK
        timestamptz created_at
        timestamptz updated_at
        text prompt
        text generation_mode
        jsonb metadata
    }
    
    users {
        bigserial id PK
        text email
        text role
    }
    
    showcase_slider_images ||--o{ users : created_by
    showcase_slider_images ||--o{ users : updated_by
```

## 📊 State Yönetimi

```mermaid
stateDiagram-v2
    [*] --> Idle: Sayfa yüklendi
    
    Idle --> Generating: Oluştur butonuna tıkla
    Generating --> Success: Görseller oluşturuldu
    Generating --> Error: Hata oluştu
    
    Success --> Idle: Mesaj gösterildi
    Error --> Idle: Hata mesajı gösterildi
    
    Idle --> Regenerating: Yenile butonuna tıkla
    Regenerating --> Success: Görsel yenilendi
    Regenerating --> Error: Hata oluştu
    
    Success --> LoadingLive: Canlı slider yükle
    LoadingLive --> LiveReady: Görseller yüklendi
    LiveReady --> Idle: Slider gösteriliyor
```

## 🎯 Component Hiyerarşisi

```mermaid
graph TD
    A[SuperAdminSliderPage]
    A --> B[ControlPanel]
    A --> C[DraftImagesSection]
    A --> D[LiveSliderPreview]
    A --> E[StatusMessages]
    
    B --> B1[GenerateMatchButton]
    B --> B2[GenerateGeneralButton]
    B --> B3[RefreshButton]
    
    C --> C1[DraftImageCard]
    C --> C2[DraftImageCard]
    C --> C3[DraftImageCard]
    
    C1 --> C1A[Image]
    C1 --> C1B[RegenerateButton]
    C1 --> C1C[Metadata]
    
    D --> D1[SliderContainer]
    D1 --> D1A[SliderImage]
    D1 --> D1B[NavigationButtons]
    D1 --> D1C[DotIndicators]
    
    E --> E1[SuccessMessage]
    E --> E2[ErrorMessage]
    E --> E3[LoadingSpinner]
```

## 🔐 Güvenlik Akışı

```mermaid
graph LR
    A[İstek] --> B{Token var mı?}
    B -->|Hayır| C[401 Unauthorized]
    B -->|Evet| D{Token geçerli mi?}
    D -->|Hayır| C
    D -->|Evet| E{Superadmin mi?}
    E -->|Hayır| F[403 Forbidden]
    E -->|Evet| G{Rate limit?}
    G -->|Aşıldı| H[429 Too Many Requests]
    G -->|OK| I[İşlemi gerçekleştir]
    I --> J[200 Success]
```

## 📈 Performans Optimizasyonu

```mermaid
graph TB
    subgraph Paralel İşlemler
        A[Görsel 1 Oluştur]
        B[Görsel 2 Oluştur]
        C[Görsel 3 Oluştur]
    end
    
    subgraph Sıralı İşlemler
        D[DB Güncelle]
        E[Response Döndür]
    end
    
    A --> D
    B --> D
    C --> D
    D --> E
    
    style A fill:#4CAF50
    style B fill:#4CAF50
    style C fill:#4CAF50
    style D fill:#2196F3
    style E fill:#2196F3
```

## 🎨 UI Component Yapısı

```
SuperAdminSliderPage
├── Header
│   ├── Title: "Slider Yönetimi"
│   └── Breadcrumb: Admin > Slider
│
├── ControlPanel
│   ├── GenerateMatchButton
│   │   ├── Icon: 🏆
│   │   ├── Text: "Maç Bazlı Oluştur"
│   │   └── Loading State
│   │
│   └── GenerateGeneralButton
│       ├── Icon: 🎨
│       ├── Text: "Genel Tasarım Oluştur"
│       └── Loading State
│
├── StatusMessages
│   ├── SuccessMessage (conditional)
│   ├── ErrorMessage (conditional)
│   └── InfoMessage (conditional)
│
├── DraftSection
│   ├── SectionTitle: "Oluşturulan Görseller"
│   ├── Grid (3 columns)
│   │   ├── DraftCard 1
│   │   │   ├── Image
│   │   │   ├── Metadata (prompt, created_at)
│   │   │   └── RegenerateButton
│   │   │
│   │   ├── DraftCard 2
│   │   └── DraftCard 3
│   │
│   └── EmptyState (if no images)
│
└── LivePreviewSection
    ├── SectionTitle: "Canlı Slider Önizleme"
    ├── SliderContainer
    │   ├── SliderImage (active)
    │   ├── PrevButton
    │   ├── NextButton
    │   └── DotIndicators
    │
    └── RefreshButton
```

## 🔄 Data Flow

```mermaid
graph LR
    A[User Action] --> B[Component State]
    B --> C[API Call]
    C --> D[Backend Logic]
    D --> E[DALL-E API]
    E --> F[File System]
    D --> G[Database]
    G --> H[API Response]
    F --> H
    H --> I[Component Update]
    I --> J[UI Render]
```

## 📱 Responsive Breakpoints

```
Desktop (>1200px)
├── 3 column grid for draft images
├── Full width slider preview
└── Side-by-side buttons

Tablet (768px - 1200px)
├── 2 column grid for draft images
├── Full width slider preview
└── Stacked buttons

Mobile (<768px)
├── 1 column grid for draft images
├── Full width slider preview
└── Stacked buttons (full width)
```

## 🧪 Test Coverage

```mermaid
graph TD
    A[Test Suite]
    A --> B[Backend Tests]
    A --> C[Frontend Tests]
    A --> D[Integration Tests]
    
    B --> B1[API Endpoint Tests]
    B --> B2[Service Layer Tests]
    B --> B3[Database Tests]
    
    C --> C1[Component Tests]
    C --> C2[Hook Tests]
    C --> C3[UI Interaction Tests]
    
    D --> D1[End-to-End Tests]
    D --> D2[Performance Tests]
    D --> D3[Security Tests]
```

## 📊 Monitoring & Logging

```mermaid
graph TB
    A[User Action] --> B[Frontend Log]
    B --> C[API Request]
    C --> D[Backend Log]
    D --> E[DALL-E API Call]
    E --> F[API Response Log]
    F --> G[Database Operation Log]
    G --> H[Success/Error Log]
    H --> I[Frontend Update Log]
    
    style B fill:#FFC107
    style D fill:#FFC107
    style F fill:#FFC107
    style G fill:#FFC107
    style H fill:#FFC107
    style I fill:#FFC107
```

## 🚀 Deployment Pipeline

```mermaid
graph LR
    A[Code Push] --> B[CI/CD Trigger]
    B --> C[Run Tests]
    C --> D{Tests Pass?}
    D -->|No| E[Notify Developer]
    D -->|Yes| F[Build Backend]
    F --> G[Build Frontend]
    G --> H[Deploy to Staging]
    H --> I[Smoke Tests]
    I --> J{Tests Pass?}
    J -->|No| E
    J -->|Yes| K[Deploy to Production]
    K --> L[Health Check]
    L --> M[Monitor]
```
