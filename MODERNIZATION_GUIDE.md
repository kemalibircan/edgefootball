# Football AI Web Platform Modernization Guide

## Overview

The web platform has been completely modernized with a navy + neon lime design system, dark/light mode, multi-language support (TR/EN), AI-powered content generation, and a chat sidebar feature.

## New Features

### 1. Design System

**Color Palette:**
- Navy Deep: `#03132F` (83-85% coverage)
- Neon Lime: `#B9F738` (14-16% coverage)
- Gradient backgrounds and glassmorphism effects
- Dark mode support with theme toggle

**CSS Variables:**
- All colors are now theme-aware via CSS custom properties
- Smooth transitions between light/dark modes
- Neon glow effects and animations

### 2. Multi-Language Support

**Available Languages:**
- Turkish (TR) - Default
- English (EN)

**Implementation:**
- Language switcher in header
- All UI text is translated
- Persisted in localStorage

**Files:**
- `web/src/i18n/terms.tr.ts` - Turkish translations
- `web/src/i18n/terms.en.ts` - English translations
- `web/src/contexts/LanguageContext.jsx` - Language state management

### 3. Chat Sidebar

**Features:**
- Thread-based chat per match
- Team logos in history
- Markdown message rendering
- AI typing indicator
- Search fixtures
- Notification system when AI responds

**How to Use:**
1. Click chat icon in header
2. Search for a match or select from history
3. Ask questions about the match
4. AI responds with analysis

**Components:**
- `web/src/contexts/ChatContext.jsx` - Chat state
- `web/src/components/chat/ChatSidebar.jsx` - Main sidebar
- `web/src/components/chat/ChatHistoryPanel.jsx` - Thread list
- `web/src/components/chat/ChatMessageList.jsx` - Message display
- `web/src/components/chat/ChatComposer.jsx` - Input area
- `web/src/components/chat/ChatNotification.jsx` - Toast notifications

### 4. OpenAI DALL-E 3 Integration

**Backend:**
- Automatic slider image generation
- 3 images per batch
- HD quality (1792x1024)
- Saves to `app/static/slider/`

**API Endpoints:**
- `POST /admin/slider/generate` - Generate images (admin only)
- `POST /admin/daily-highlights/generate` - Generate daily highlights
- `POST /admin/odds-analysis/generate` - Generate odds analysis

**Files:**
- `app/image_generation.py` - DALL-E 3 integration
- `app/scheduler.py` - Scheduled tasks (daily at 6 AM)

**Admin Usage:**
1. Go to `/admin/vitrin`
2. Click "3 Slider Görseli Oluştur"
3. Wait for generation (30-60 seconds)
4. Images appear on homepage slider

### 5. Modernized Homepage

**New Sections (in order):**

1. **Hero Section** (guests only)
   - Modern animated background
   - CTA buttons (Login, Register)

2. **AI-Generated Slider**
   - Auto-rotating carousel
   - DALL-E generated images
   - Manual navigation

3. **Bugünün Öne Çıkan AI Kazanma Oranları**
   - Top 4 featured matches
   - AI confidence scores
   - Click to view details

4. **Maç Tahmin Merkezi**
   - All today's matches
   - League filters
   - Search functionality
   - "AI'a Sor" buttons

5. **İddia Oranları**
   - Featured odds display
   - Quick navigation to details

**Components:**
- `web/src/components/home/HeroSection.jsx`
- `web/src/components/home/SliderShowcase.jsx`
- `web/src/components/home/AiFeaturedHighlights.jsx`
- `web/src/components/home/MatchPredictionCenter.jsx`
- `web/src/components/home/OddsAnalysisBoard.jsx`

### 6. Fixture Detail Page

**Route:** `/fixture/:fixtureId`

**Features:**
- Full match information
- Team logos and names
- Odds display with probabilities
- "Run AI Simulation" button
- "Ask AI About This Match" button
- Simulation results display

**File:** `web/src/pages/FixtureDetailPage.jsx`

## Configuration

### Backend Environment Variables

Add to `.env`:

```bash
# OpenAI API
OPENAI_API_KEY=sk-your-api-key-here
OPENAI_MODEL=gpt-4o
DALLE_MODEL=dall-e-3
DAILY_GENERATION_ENABLED=true
```

### Frontend Environment Variables

Add to `web/.env.development`:

```bash
VITE_API_BASE_URL=http://localhost:8001
VITE_DEFAULT_LOCALE=tr
VITE_DEFAULT_THEME=light
```

## Installation

### Backend

```bash
# Install new dependencies
pip install -r requirements.txt

# Verify OpenAI API key is set
echo $OPENAI_API_KEY

# Start server
uvicorn app.main:app --reload --host 0.0.0.0 --port 8001
```

### Frontend

```bash
cd web

# Dependencies already installed (react-markdown, remark-gfm)
# If needed: npm install

# Start dev server
npm run dev
```

## Usage Guide

### Theme Toggle

1. Click sun/moon icon in header
2. Theme switches between light/dark
3. Preference saved in localStorage

### Language Switcher

1. Click TR/EN buttons in header
2. All UI text updates immediately
3. Preference saved in localStorage

### Chat Feature

1. **From Homepage:**
   - Click "AI'a Sor" on any match card
   - Chat sidebar opens with match context
   - Ask questions about the match

2. **From Header:**
   - Click chat icon
   - Search for a match
   - Select and start chatting

3. **Notifications:**
   - When AI responds from another page
   - Notification appears bottom-right
   - Click to open chat sidebar

### Admin: Generate Slider Images

1. Login as superadmin
2. Navigate to `/admin/vitrin`
3. Click "3 Slider Görseli Oluştur"
4. Wait 30-60 seconds
5. Images appear in preview
6. Automatically added to homepage slider

### Admin: Daily Content

The scheduler runs automatically at 6:00 AM UTC daily:
- Generates 3 new slider images
- Creates featured highlights
- Analyzes odds

Manual trigger available in admin panel.

## Architecture Changes

### Context Providers (App.jsx)

```
ThemeProvider
  ├─ LanguageProvider
      ├─ ChatProvider
          └─ BrowserRouter
              └─ Routes
```

All contexts are now at the root level for global access.

### Removed Components

- `StickyCouponDock` - Replaced with integrated design
- `StickyAiChatDock` - Replaced with ChatSidebar
- Old chat contexts from `state/` folder

### New Routing

- `/` - Homepage (guest or authenticated)
- `/fixture/:fixtureId` - Fixture detail page (new)
- All other routes unchanged

## Styling Best Practices

### Using the New Design System

```jsx
// Buttons
<button className="btn-primary">Primary Action</button>
<button className="btn-secondary">Secondary Action</button>
<button className="btn-ghost">Subtle Action</button>

// Cards
<div className="glass-card">Content with glassmorphism</div>
<div className="glass-card neon-border">Card with neon glow</div>

// Text Colors
<p className="text-primary">Primary text</p>
<p className="text-secondary">Secondary text</p>
<p className="text-muted">Muted text</p>
<p className="text-lime">Accent text</p>

// Backgrounds
<div className="bg-navy-deep">Deep navy background</div>
<div className="bg-navy-light">Light navy background</div>
```

### Responsive Design

All components are mobile-first and responsive:
- Mobile: < 640px (full-width, stacked)
- Tablet: 640px - 1024px (2-column grids)
- Desktop: > 1024px (3+ column grids)

## Testing Checklist

- [ ] Theme toggle works (light/dark)
- [ ] Language switcher works (TR/EN)
- [ ] Chat sidebar opens/closes
- [ ] Search fixtures in chat
- [ ] Send message to AI
- [ ] Notification appears when AI responds
- [ ] Homepage displays all sections
- [ ] Fixture detail page loads
- [ ] AI simulation works
- [ ] Admin slider generation works
- [ ] Mobile responsiveness (test at 375px, 768px, 1024px)

## Performance Optimizations

1. **Lazy Loading:**
   - Admin pages
   - Fixture detail page
   - Token purchase
   - Saved predictions

2. **Code Splitting:**
   - React.lazy() for route-based splitting
   - Suspense boundaries

3. **Image Optimization:**
   - Team logos: 32x32 default, lazy loading
   - Slider images: 1792x1024 HD WebP
   - DALL-E images cached locally

4. **API Caching:**
   - Slider: 1 hour
   - Fixtures: 5 minutes
   - Chat: Real-time (no cache)

## Troubleshooting

### Chat Not Working

- Check if ChatContext is imported correctly
- Verify `/coupons/chat/*` endpoints are accessible
- Check browser console for errors

### Theme Not Persisting

- Check localStorage: `football_ai_theme`
- Verify ThemeContext is at root level
- Check `data-theme` attribute on `<html>`

### DALL-E Generation Fails

- Verify `OPENAI_API_KEY` is set correctly
- Check OpenAI API quota/billing
- Review server logs for errors
- Ensure `app/static/slider/` directory exists

### Images Not Displaying

- Check `/static` mount in main.py
- Verify image URLs use correct `/static/slider/` path
- Check file permissions on `app/static/slider/`

## Next Steps

1. **Test on staging** - Deploy and test all features
2. **Monitor DALL-E costs** - Track API usage
3. **Gather user feedback** - A/B test designs
4. **Performance monitoring** - Check load times
5. **Mobile testing** - Test on real devices

## Credits

- Design inspiration: iddia.com, nesine.com, bets10
- Color palette: Custom navy + neon lime (#03132F + #B9F738)
- Icons: Custom SVG icons
- Fonts: Sora, Space Grotesk (unchanged)
