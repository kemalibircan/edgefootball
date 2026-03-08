## SEO implementation overview

This document explains how SEO is wired through the API, web app, and blog system so you can maintain and extend it safely.

### Canonical URLs, meta tags, hreflang

- **Canonical + meta**:
  - Frontend uses `SeoHead` (`web/src/components/seo/SeoHead.jsx`) on all locale pages (home, fixtures, predictions, blog).
  - It sets:
    - `<title>` (locale-aware, falls back to **EdgeFootball**)
    - `meta[name="description"]`
    - `meta[name="robots"]`
    - `link[rel="canonical"]`
    - Open Graph (`og:title`, `og:description`, `og:type`, `og:url`, `og:image`, `og:locale`)
    - Twitter (`twitter:card`, `twitter:title`, `twitter:description`, `twitter:image`)
  - Canonical URLs are built with `buildCanonicalPath` / `toAbsoluteUrl` from `web/src/lib/seo.js`.

- **Locale and hreflang**:
  - Supported locales: **`tr`, `en`** (`SUPPORTED_LOCALES` in `web/src/lib/seo.js`).
  - `SeoHead` calls `hreflangLinks` to inject:
    - `link rel="alternate" hreflang="tr"`
    - `link rel="alternate" hreflang="en"`
    - `link rel="alternate" hreflang="x-default"`
  - Locale-prefixed routes (see `web/src/pages` and routing config):
    - `/:locale`
    - `/:locale/fixtures`
    - `/:locale/fixtures/:fixtureId/:slug?`
    - `/:locale/predictions`
    - `/:locale/predictions/:fixtureId/:slug?`
    - `/:locale/blog`
    - `/:locale/blog/category/:categorySlug`
    - `/:locale/blog/:slug`

- **Robots handling**:
  - Backend robots: `GET /robots.txt` in `app/seo.py`:
    - Allows public locale routes (`/tr`, `/en`, blog, fixtures, predictions).
    - Disallows private/auth/admin paths (`/admin`, `/auth`, `/chat`, `/kuponlarim`, `/ai-tahminlerim`, `/sonuc-tahminlerim`, `/login`, `/register`, `/forgot-password`).
    - Includes `Sitemap: {SITE_BASE_URL}/sitemap.xml`.
  - Frontend robots: `GlobalSeoManager` (`web/src/components/seo/GlobalSeoManager.jsx`):
    - On each route change, sets `meta[name="robots"]` to:
      - `noindex,nofollow` for private prefixes (same list as robots.txt).
      - `index,follow` for public routes.

### Blog SEO (bilingual content)

- **Storage**:
  - Database blog system (for production UI + sitemaps) in `app/blog.py` / migration `migrations/016_blog_system.sql`.
  - Bilingual markdown content inventory for AI/marketing at:
    - `content/blog/en/*.md`
    - `content/blog/tr/*.md`
  - Helper generator: `app/blog_content_generator.py` (idempotent; does not overwrite existing posts).

- **Blog API** (`app/blog.py`):
  - Public:
    - `GET /blog/categories`
    - `GET /blog/tags`
    - `GET /blog/posts`
    - `GET /blog/posts/{slug}`
  - Admin:
    - `POST /admin/blog/posts`
    - `PUT /admin/blog/posts/{post_id}`
    - `PUT /admin/blog/posts/{post_id}/translations/{locale}`
    - `PATCH /admin/blog/posts/{post_id}/status`
    - `DELETE /admin/blog/posts/{post_id}`
    - `POST /admin/blog/tags`
    - `PUT /admin/blog/posts/{post_id}/tags`
  - Only **`published`** posts with `publish_date <= now` are exposed publicly and included in sitemaps.
  - Each post has a **canonical UUID** (`canonical_id`) and per-locale slugs (unique per locale).
  - Detail response includes:
    - `alternate_locales`: `{ locale, slug, url }[]` used for hreflang and language switch.
    - `related_fixture_ids`: fixture IDs for internal linking from blog → predictions/fixtures.

- **Blog frontend routing**:
  - Listing: `/:locale/blog`
  - Category filter: `/:locale/blog/category/:categorySlug`
  - Detail: `/:locale/blog/:slug`
  - UI features (implemented in blog pages/components, see `web/src/pages/blog/*`):
    - Hero section on index
    - Tag filters + category filters
    - Search input (client-side, backed by `/blog/posts`)
    - Sort options (e.g. newest)
    - Related posts on detail (by category/tags)
    - Breadcrumbs on detail
    - Last updated + estimated reading time
    - Share buttons (copy link + socials)

### Sitemaps

- **Config**:
  - `site_base_url` in `app/config.py` (set via `SITE_BASE_URL` env).
  - Cache TTL: `seo_sitemap_cache_ttl_seconds` (default 900s).

- **Endpoints** (`app/seo.py`):
  - Index: `GET /sitemap.xml`
  - Static: `GET /sitemaps/static.xml`
  - Fixtures: `GET /sitemaps/fixtures.xml`, `GET /sitemaps/fixtures-{chunk}.xml`
  - Predictions: `GET /sitemaps/predictions.xml`, `GET /sitemaps/predictions-{chunk}.xml`
  - Blog: `GET /sitemaps/blog.xml`, `GET /sitemaps/blog-{chunk}.xml`

- **What is included**:
  - Static:
    - `/tr`, `/en`
    - `/tr/blog`, `/en/blog`
    - `/tr/fixtures`, `/en/fixtures`
    - `/tr/predictions`, `/en/predictions`
  - Fixtures:
    - All fixtures in a configurable date window (currently 7 days past to 21 days future) from `FIXTURE_BOARD_CACHE_TABLE`.
    - Each fixture produces **two URLs** (`/tr/fixtures/:id/:slug`, `/en/fixtures/:id/:slug`).
  - Predictions:
    - Distinct fixture IDs from `saved_predictions` (via `SAVED_PREDICTIONS_TABLE`).
    - Two URLs per fixture: `/tr/predictions/:id/:slug`, `/en/predictions/:id/:slug`.
  - Blog:
    - All `published` blog translations with `publish_date <= now`.
    - URLs: `/{locale}/blog/{slug}`.

- **Chunking and caching**:
  - Max URLs per sitemap file: `MAX_URLS_PER_SITEMAP = 45000`.
  - Index computes `*_chunks` via `_chunk_total()` and emits chunked URLs.
  - XML payloads are cached in-memory per-process with a simple TTL cache and invalidated via:
    - `invalidate_seo_cache("sitemap:")` (called by blog admin mutations and fixture refresh).

### JSON-LD schema markup

- **Renderer**: `JsonLd` component (`web/src/components/seo/JsonLd.jsx`).
  - Injects `<script type="application/ld+json">` into `<head>`.
  - Used by blog pages and key conversion pages (home, fixtures, predictions) for:
    - `WebSite` + `SearchAction` (site-wide search endpoints if enabled).
    - `Organization` (or `Person`) with logo + social links.
    - `BlogPosting` for blog detail pages.
    - `BreadcrumbList` on blog posts and structured fixture/prediction pages.

> To add new JSON-LD blocks, prefer using the shared `JsonLd` component and keep payloads minimal but valid against Google’s Rich Results Test.

### Maintaining and extending SEO

- **When you add a new public page**:
  - Make it locale-prefixed (`/:locale/...`).
  - Wrap it with `SeoHead` and, if needed, `JsonLd`.
  - Decide whether it should be linked from:
    - Static sitemap (`_static_entries` in `app/seo.py`).
    - Any JSON-LD structures (e.g. new `WebPage` types).

- **When you add new blog content**:
  - Prefer creating content through the blog admin endpoints or migrations so:
    - Slugs stay unique per locale.
    - Sitemap cache is invalidated automatically.
  - If you add Markdown under `content/blog`, keep frontmatter aligned:
    - `title`, `description`, `date`, `updated`, `lang`, `tags`, `slug`, `image`, `canonical`.

- **Crawlability self-check (manual)**:
  - After deployment, run:
    - `curl -s https://YOUR_DOMAIN/robots.txt`
    - `curl -s https://YOUR_DOMAIN/sitemap.xml`
  - Spot-check a few URLs from each sitemap chunk to confirm `200` responses and no unexpected `noindex`.

- **Crawlability self-check (scripted)**:
  - A lightweight helper script lives at `scripts/check_sitemap_links.py`.
  - Example usage:
    - `python scripts/check_sitemap_links.py --base-url https://YOUR_DOMAIN --limit 300`
  - It:
    - Reads `sitemap.xml` and nested sitemap files.
    - Probes each `<loc>` URL with `HEAD`/`GET`.
    - Reports any URLs with non-2xx status codes.
  - Intended for **staging / production smoke tests**, not as part of the main request path.



