## Performance & Core Web Vitals

This document captures the main performance strategies used in the app and how to keep Core Web Vitals healthy as the product evolves.

### Overall strategy

- **Server-side data preparation**:
  - API endpoints are designed to deliver **ready-to-render JSON** with minimal client-side computation.
  - Heavy operations (model inference, aggregation, joins) run on the backend; the web app focuses on rendering.

- **Static + CSR hybrid**:
  - The web frontend is built with Vite and a CSR router, but SEO-critical routes are **pre-rendered** using:
    - `web/scripts/prerender-seo.mjs`
    - NPM scripts: `npm run prerender:seo`, `npm run build:seo`
  - The prerender script calls the API to:
    - Discover important URLs (home, fixtures, predictions, blog, some details).
    - Write static HTML shells including canonical and meta tags.
  - This reduces **TTFB** and **INP** for first loads on key entry pages.

### Core Web Vitals focus

- **LCP (Largest Contentful Paint)**:
  - Critical content (hero, top fixtures, main blog cards) is rendered **above the fold** with:
    - Predictable image dimensions (width/height or aspect-ratio to avoid layout shift).
    - Lightweight hero backgrounds and gradients instead of large images where possible.
  - Fonts:
    - Use system fonts or preloaded primary font via Vite where appropriate.
    - Avoid blocking font loads in the critical path.

- **CLS (Cumulative Layout Shift)**:
  - Image and card grids reserve space:
    - Blog cards, fixture rows and hero sections use fixed/min heights to avoid jumping on load.
  - Async content:
    - Skeleton loaders and reserved containers are used for fixture/prediction/blog lists so late data does not push the layout.

- **INP / responsiveness**:
  - Input-heavy areas (filters, search, tabs) are implemented with:
    - Debounced search where applicable.
    - Pure CSS transitions for micro-interactions; avoid heavy JS animations.
  - Navigation:
    - React Router-based navigation avoids full page reloads.
    - Internal links to high-traffic pages can use `prefetch`/`preload` hints in the layout where helpful.

### Mobile friendliness

- **Layout**:
  - All new blog and public SEO pages are built **mobile-first**:
    - Single-column layouts on small screens, with sensible max-width on desktop.
    - No horizontal scrolling; components are constrained with responsive `max-width` and padding.
  - Tap targets:
    - Buttons, pills and navigation items have touch-friendly height and spacing.
  - Viewport:
    - Standard `meta viewport` is set in the Vite HTML template.

### HTTPS & transport

- **Internal URLs**:
  - All canonical URL and sitemap URLs are built with `SITE_BASE_URL` / `VITE_SITE_BASE_URL` envs.
  - Always use `https://` in production for these envs.

- **HSTS (deployment note)**:
  - Enable HSTS at the edge/load balancer (not in the app code) with at least:
    - `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`
  - Document this in your infrastructure configuration; it is intentionally not hard-coded here.

### TTFB and caching

- **API-level caching**:
  - `app/seo.py` uses an in-process TTL cache for:
    - Sitemap index and sitemap chunks.
  - Blog admin operations and fixture refreshes call:
    - `invalidate_seo_cache("sitemap:")` to flush only sitemap-related cache keys.
  - This minimizes DB load and TTFB spikes when bots crawl sitemaps.

- **Database access patterns**:
  - Blog endpoints:
    - List and detail queries are index-optimised (status/publish_date, locale/slug).
    - Only published and currently visible posts are fetched.
  - Prediction/fixture endpoints:
    - Use `DISTINCT ON` and appropriate indexes to avoid scanning entire tables.

> When extending endpoints, keep queries tight, avoid N+1 patterns, and index fields used in filters, joins and sorts.

### Performance budget & guidelines

- **Client bundle**:
  - Keep new dependencies minimal; prefer:
    - Native browser APIs.
    - Shared utility modules over duplicate helpers.
  - Consider code-splitting for:
    - Low-traffic, heavy pages (admin tools, rarely used visualizations).

- **Images**:
  - Keep hero and blog images compressed and sized to realistic viewport needs.
  - Prefer modern formats (WebP/AVIF) where hosting/CDN supports them.
  - Lazy-load below-the-fold images using `loading="lazy"` on `<img>` or equivalent in React components.

- **What to measure after changes**:
  - Use **Lighthouse** or **PageSpeed Insights** on:
    - `/tr` and `/en`
    - `/tr/blog` and a few `/tr/blog/:slug`
    - `/tr/predictions` and a busy prediction detail page
  - Track:
    - LCP < 2.5s
    - CLS ≈ 0
    - INP well under 200ms on modern devices

### How to safely extend

- When adding a new page:
  - Check it on mobile first (DevTools device emulation).
  - Keep primary content high in the DOM and avoid large blocking scripts.
  - Reuse existing layout/spacing components from the design system to stay consistent and lean.

- When adding a heavy feature:
  - Ask:
    - Can this be lazy-loaded behind a user interaction?
    - Can we precompute part of the data server-side?
  - Avoid shipping large visualizations or libraries to every page if only one route needs them.













