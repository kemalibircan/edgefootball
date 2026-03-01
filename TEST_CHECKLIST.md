# Football AI Web Platform - Testing Checklist

## Pre-Testing Setup

- [ ] Backend running on port 8001
- [ ] Frontend running on port 3001
- [ ] OpenAI API key configured in `.env`
- [ ] Database accessible
- [ ] Browser cache cleared

---

## 🎨 Design System Tests

### Color Palette
- [ ] Navy background displays correctly (#03132F)
- [ ] Neon lime accents visible (#B9F738)
- [ ] Gradient backgrounds smooth
- [ ] Glass cards have blur effect
- [ ] Neon glow animations work

### Dark Mode
- [ ] Click sun icon → Changes to moon icon
- [ ] Background darkens smoothly
- [ ] Text remains readable
- [ ] Neon lime stays vibrant
- [ ] Glass effects adjust correctly
- [ ] Refresh page → Theme persists
- [ ] Check localStorage: `football_ai_theme: "dark"`

### Light Mode
- [ ] Click moon icon → Changes to sun icon
- [ ] Background lightens smoothly
- [ ] Text color changes
- [ ] All elements visible
- [ ] Refresh page → Theme persists
- [ ] Check localStorage: `football_ai_theme: "light"`

---

## 🌍 Language Tests

### Turkish (Default)
- [ ] Page loads in Turkish
- [ ] Header shows: "Ana Sayfa", "Giriş Yap", etc.
- [ ] Hero says: "Daha net maç analizi..."
- [ ] Buttons say: "Detay Gör", "AI'a Sor"

### English Switch
- [ ] Click "EN" button
- [ ] All text changes to English
- [ ] Header shows: "Home", "Login", etc.
- [ ] Hero says: "Sharper match analysis..."
- [ ] Buttons say: "Details", "Ask AI"
- [ ] Refresh page → Language persists
- [ ] Check localStorage: `football_ai_locale: "en"`

### Turkish Switch Back
- [ ] Click "TR" button
- [ ] All text returns to Turkish
- [ ] Persists after refresh

---

## 💬 Chat Sidebar Tests

### Opening/Closing
- [ ] Click chat icon in header → Sidebar slides in from right
- [ ] Click backdrop → Sidebar closes
- [ ] Press Escape key → Sidebar closes
- [ ] Click X button → Sidebar closes
- [ ] Animations smooth (0.3s)

### Search Fixtures
- [ ] Type "Galatasaray" in search box
- [ ] Results appear after 300ms delay
- [ ] Each result shows team logos
- [ ] League name and kickoff time visible
- [ ] Click result → Fixture selected for chat

### Thread History
- [ ] Previous conversations listed (if any)
- [ ] Each shows team logos
- [ ] Last message preview visible
- [ ] Timestamp shown
- [ ] Click thread → Opens conversation

### Sending Messages
- [ ] Select a match (from search or history)
- [ ] Top shows team logos + match name
- [ ] Type question: "Bu maçı analiz et"
- [ ] Press Enter or click send button
- [ ] User message appears (right, lime green)
- [ ] Typing indicator shows (3 animated dots)
- [ ] AI response appears (left, navy background)
- [ ] Markdown formatted correctly
- [ ] Timestamps shown

### Ask AI from Match Card
- [ ] Go to homepage
- [ ] Find match in "Maç Tahmin Merkezi"
- [ ] Click "AI'a Sor" button
- [ ] Chat sidebar opens automatically
- [ ] Match context loaded
- [ ] Default question sent
- [ ] Notification appears bottom-right
- [ ] Click notification → Opens chat

### Mobile Responsive
- [ ] Resize to 375px width
- [ ] Chat sidebar becomes full-screen
- [ ] All content readable
- [ ] Scrolling works smoothly

---

## 🏠 Homepage Tests

### Hero Section (Guests Only)
- [ ] Animated particles visible
- [ ] Hero text clear and readable
- [ ] "Giriş Yap" button works → /login
- [ ] "Kayıt Ol" button works → /register
- [ ] Mobile: Text sizes adjust, buttons stack

### Slider Showcase
- [ ] 3 images display (default or DALL-E generated)
- [ ] Auto-rotates every 4 seconds
- [ ] Click next arrow → Advances slide
- [ ] Click prev arrow → Goes back
- [ ] Click dots → Jumps to specific slide
- [ ] Smooth fade transitions
- [ ] Mobile: Slider height adjusts

### AI Featured Highlights
- [ ] Shows top 4 matches
- [ ] Team logos display (or initials fallback)
- [ ] Odds shown (1, X, 2)
- [ ] AI confidence bar animates
- [ ] Click card → Goes to fixture detail page
- [ ] "AI Powered" badge glows
- [ ] Mobile: Cards stack vertically

### Maç Tahmin Merkezi
- [ ] All today's matches listed
- [ ] League filters work (Süper Lig, La Liga, etc.)
- [ ] "Tüm Ligler" shows all matches
- [ ] Search box filters by team name
- [ ] Pagination works (if > 12 matches)
- [ ] "Detay Gör" → Opens fixture detail
- [ ] "AI'a Sor" → Opens chat sidebar
- [ ] Mobile: Cards full-width, filters scroll horizontally

### İddia Oranları
- [ ] Featured odds display
- [ ] Team logos visible
- [ ] Odds clickable
- [ ] Cards have hover effects
- [ ] Mobile: Single column

---

## 📄 Fixture Detail Page Tests

### Navigation
- [ ] From homepage, click "Detay Gör" on a match
- [ ] URL changes to `/fixture/{id}`
- [ ] Page loads without errors
- [ ] Click "Geri" button → Returns to previous page

### Match Information Display
- [ ] Both team logos (large size, 64x64)
- [ ] Team names prominent
- [ ] League name with icon
- [ ] Kickoff time in correct format (localized)
- [ ] "VS" separator visible

### Odds Section
- [ ] Three odds displayed (1, X, 2)
- [ ] Decimal values (e.g., 2.08)
- [ ] Probability percentages calculated
- [ ] Hover effects on odds cards
- [ ] Neon glow on hover

### AI Simulation
- [ ] "AI Simülasyonu Çalıştır" button visible
- [ ] Click button (must be logged in)
- [ ] Button shows "Simülasyon Yapılıyor..." during request
- [ ] Results appear below:
  - Win/draw/loss percentages
  - Top 5 scorelines with probabilities
- [ ] Credits deducted (check header)

### Ask AI Integration
- [ ] "Bu Maç Hakkında AI'a Sor" button visible
- [ ] Click button → Chat sidebar opens
- [ ] Match context loaded in chat
- [ ] Can immediately ask questions

### Mobile View
- [ ] Teams stack vertically
- [ ] Odds in single column
- [ ] Buttons full-width
- [ ] All content readable

---

## 🔐 Authentication Tests

### Login Page
- [ ] Navigate to `/login`
- [ ] Navy + lime design applied
- [ ] Email/password mode works
- [ ] Email code mode works
- [ ] Google OAuth button present
- [ ] "Kayıt Ol" link → /register
- [ ] "Şifremi Unuttum" link → /forgot-password
- [ ] Success → Redirects to /
- [ ] Errors display in red

### Register Page
- [ ] Navigate to `/register`
- [ ] Modern design applied
- [ ] Request code → Email sent
- [ ] Enter code + password → Registers
- [ ] Password validation (min 6 chars)
- [ ] Password confirmation validation
- [ ] Success → Redirects to /
- [ ] Errors display clearly

### Forgot Password
- [ ] Navigate to `/forgot-password`
- [ ] Request code → Email sent
- [ ] Enter code + new password → Updates
- [ ] Validation works
- [ ] Success → Redirects to /login

---

## ⚙️ Admin Panel Tests

### Access
- [ ] Login as superadmin
- [ ] Navigate to `/admin/vitrin`
- [ ] Page loads without errors

### DALL-E Slider Generation
- [ ] Section titled "DALL-E 3 Slider Görselleri"
- [ ] Button: "3 Slider Görseli Oluştur"
- [ ] Click button → Disabled during generation
- [ ] Text changes to "Görseller Oluşturuluyor..."
- [ ] Wait 30-60 seconds
- [ ] Success message appears
- [ ] 3 images display in grid
- [ ] Each image shows prompt text
- [ ] Images are high quality (HD)
- [ ] Visit homepage → Images in slider

### Daily Highlights Generation
- [ ] Button: "Bugünün Öne Çıkanlarını Oluştur"
- [ ] Click button
- [ ] Success message appears
- [ ] Featured matches update (check homepage)

### Existing Features
- [ ] Odds banner management still works
- [ ] Featured odds list still works
- [ ] Image uploads still work
- [ ] Save button still works

---

## 📱 Responsive Design Tests

### Desktop (1280px+)
- [ ] Header: All items in single row
- [ ] Match grid: 3-4 columns
- [ ] Chat sidebar: 400px fixed width
- [ ] All sections properly spaced

### Tablet (768px - 1024px)
- [ ] Header: May wrap to 2 rows
- [ ] Match grid: 2 columns
- [ ] Chat sidebar: 400px or full-screen
- [ ] Touch interactions work

### Mobile (< 768px)
- [ ] Header: Stacks vertically, items wrap
- [ ] Match grid: 1 column
- [ ] Chat sidebar: Full-screen overlay
- [ ] All buttons full-width where appropriate
- [ ] Text sizes readable
- [ ] No horizontal scroll

### Specific Mobile Tests
- [ ] Hero: Title smaller, CTAs stack
- [ ] Slider: Height adjusts (300px)
- [ ] Match cards: Full width
- [ ] Fixture detail: Teams stack
- [ ] Forms: Inputs full-width
- [ ] Chat: Full-screen, back button visible

---

## ⚡ Performance Tests

### Load Times
- [ ] Homepage loads in < 2 seconds
- [ ] Fixture detail loads in < 1 second
- [ ] Chat opens instantly
- [ ] Theme switch instant
- [ ] Language switch instant

### Lazy Loading
- [ ] Open DevTools Network tab
- [ ] Visit homepage → Core bundles load
- [ ] Navigate to `/admin/vitrin` → Admin chunk loads
- [ ] Navigate to `/fixture/123` → Fixture chunk loads
- [ ] Only necessary code loaded per route

### Image Loading
- [ ] Team logos load progressively
- [ ] Slider images load on demand
- [ ] Fallback initials appear if logo fails

### Interactions
- [ ] No lag when typing in chat
- [ ] Smooth scroll in message list
- [ ] Debounced search (no stutter)
- [ ] Animations don't block UI

---

## 🔍 Browser Compatibility

### Chrome/Edge (Chromium)
- [ ] All features work
- [ ] Animations smooth
- [ ] CSS grid layouts correct

### Firefox
- [ ] All features work
- [ ] Backdrop-filter works (glassmorphism)
- [ ] Animations smooth

### Safari (macOS/iOS)
- [ ] All features work
- [ ] Webkit-specific styles work
- [ ] Touch gestures work (mobile)

---

## 🧪 Scenario Tests

### Scenario 1: New User Journey
1. [ ] Visit homepage (guest view)
2. [ ] See hero section
3. [ ] Scroll through slider
4. [ ] View featured highlights
5. [ ] Browse match center
6. [ ] Click "AI'a Sor" on a match
7. [ ] Redirected to login (not logged in)
8. [ ] Register new account
9. [ ] Return to homepage
10. [ ] Click "AI'a Sor" again
11. [ ] Chat opens with match context
12. [ ] Send question
13. [ ] Receive AI response
14. [ ] Check notification system

### Scenario 2: Admin Content Management
1. [ ] Login as superadmin
2. [ ] Go to `/admin/vitrin`
3. [ ] Generate 3 slider images
4. [ ] Wait for completion
5. [ ] Verify images display
6. [ ] Generate daily highlights
7. [ ] Visit homepage (logout or incognito)
8. [ ] Verify slider shows new images
9. [ ] Verify highlights updated

### Scenario 3: Match Analysis Flow
1. [ ] Login as regular user
2. [ ] Browse "Maç Tahmin Merkezi"
3. [ ] Filter by "Süper Lig"
4. [ ] Click "Detay Gör" on a match
5. [ ] Review odds and match info
6. [ ] Click "AI Simülasyonu Çalıştır"
7. [ ] View simulation results
8. [ ] Click "Bu Maç Hakkında AI'a Sor"
9. [ ] Chat opens with context
10. [ ] Ask follow-up question
11. [ ] Receive detailed analysis

### Scenario 4: Multi-Device Experience
1. [ ] Desktop: Full experience
2. [ ] Switch to mobile (DevTools)
3. [ ] Chat becomes full-screen
4. [ ] All interactions still work
5. [ ] Back to desktop
6. [ ] State preserved (theme, language)

---

## ✅ Success Criteria

### Must Pass
- [x] Build completes without errors ✓
- [x] No linter errors ✓
- [ ] All routes accessible
- [ ] Theme toggle functional
- [ ] Language toggle functional
- [ ] Chat sidebar operational
- [ ] AI responses received
- [ ] Mobile responsive

### Should Pass
- [ ] All animations smooth (60fps)
- [ ] Images load efficiently
- [ ] No console errors
- [ ] No 404s in Network tab
- [ ] Credits system works
- [ ] Simulation consumes credits correctly

### Nice to Have
- [ ] DALL-E images generated successfully
- [ ] Daily scheduler runs
- [ ] All edge cases handled
- [ ] Error messages helpful
- [ ] Loading states polished

---

## 🐛 Bug Report Template

If you find issues:

```markdown
**Issue:** Brief description
**Steps to Reproduce:**
1. Step one
2. Step two
3. ...

**Expected:** What should happen
**Actual:** What actually happened
**Browser:** Chrome 120 / Firefox 121 / Safari 17
**Viewport:** 1920×1080 / 375×667 / etc.
**Theme:** Light / Dark
**Language:** TR / EN
**Console Errors:** (Paste any errors)
**Screenshots:** (Attach if relevant)
```

---

## 📊 Performance Benchmarks

### Target Metrics
- [ ] First Contentful Paint: < 1.5s
- [ ] Largest Contentful Paint: < 2.5s
- [ ] Time to Interactive: < 3.5s
- [ ] Cumulative Layout Shift: < 0.1
- [ ] First Input Delay: < 100ms

### Measure With
1. Chrome DevTools → Lighthouse
2. Run performance audit
3. Check scores:
   - Performance: > 90
   - Accessibility: > 90
   - Best Practices: > 90
   - SEO: > 80

---

## 🔒 Security Tests

- [ ] API requires auth for protected endpoints
- [ ] Admin endpoints require admin role
- [ ] CSRF protection works
- [ ] No sensitive data in console logs
- [ ] No API keys exposed in frontend
- [ ] localStorage uses appropriate keys

---

## ♿ Accessibility Tests

- [ ] All interactive elements have ARIA labels
- [ ] Keyboard navigation works (Tab, Enter, Escape)
- [ ] Focus indicators visible
- [ ] Color contrast sufficient (WCAG AA)
- [ ] Screen reader friendly (test with VoiceOver/NVDA)
- [ ] Images have alt text

---

## 🎯 User Acceptance Tests

### For Regular Users
- [ ] Can I find today's matches easily?
- [ ] Can I understand the odds?
- [ ] Can I ask AI about a match?
- [ ] Do I receive helpful responses?
- [ ] Is the interface intuitive?
- [ ] Does it feel modern and professional?

### For Admins
- [ ] Can I generate slider images?
- [ ] Can I control daily content?
- [ ] Are the admin tools clear?
- [ ] Is the workflow efficient?

### For Mobile Users
- [ ] Is everything accessible on my phone?
- [ ] Are buttons large enough to tap?
- [ ] Is text readable without zooming?
- [ ] Does chat work well on mobile?

---

## 📈 Regression Tests

### Existing Features (Should Still Work)
- [ ] User registration
- [ ] User login
- [ ] Password reset
- [ ] Profile management
- [ ] Credit purchases
- [ ] Token notifications
- [ ] Model management (admin)
- [ ] Saved predictions
- [ ] Fixture board
- [ ] Monte Carlo simulation
- [ ] AI commentary generation

---

## 🎬 Final Verification

Before going live:
- [ ] All tests passed
- [ ] No critical bugs
- [ ] Performance acceptable
- [ ] Mobile experience good
- [ ] Admin features working
- [ ] Documentation complete
- [ ] Environment variables set
- [ ] Database migrations run
- [ ] Backup created
- [ ] Rollback plan ready

---

**Testing Status:** ⏳ In Progress / ✅ Passed / ❌ Failed

**Tested By:** _______________
**Date:** _______________
**Notes:** _______________
