# SEO + Bilingual Blog System Architecture

## Scope
This document defines the implementation architecture for:
- XML sitemap generation for static, fixture, prediction, and blog URLs
- bilingual blog system (`tr`, `en`)
- SEO meta tags, canonical URLs, hreflang, Open Graph, robots policy, JSON-LD
- locale-prefixed public routes

## Implemented Backend Modules
- `app/blog.py`
  - public endpoints:
    - `GET /blog/posts`
    - `GET /blog/posts/{slug}`
    - `GET /blog/categories`
    - `GET /blog/tags`
  - admin endpoints:
    - `POST /admin/blog/posts`
    - `PUT /admin/blog/posts/{post_id}`
    - `PUT /admin/blog/posts/{post_id}/translations/{locale}`
    - `PATCH /admin/blog/posts/{post_id}/status`
    - `DELETE /admin/blog/posts/{post_id}`
    - `POST /admin/blog/tags`
    - `PUT /admin/blog/posts/{post_id}/tags`
- `app/seo.py`
  - sitemap endpoints:
    - `GET /sitemap.xml`
    - `GET /sitemaps/static.xml`
    - `GET /sitemaps/fixtures.xml`
    - `GET /sitemaps/fixtures-{chunk}.xml`
    - `GET /sitemaps/predictions.xml`
    - `GET /sitemaps/predictions-{chunk}.xml`
    - `GET /sitemaps/blog.xml`
    - `GET /sitemaps/blog-{chunk}.xml`
  - robots endpoint:
    - `GET /robots.txt`
  - public prediction SEO endpoints:
    - `GET /predictions/public`
    - `GET /predictions/public/{fixture_id}`
  - public fixture summary endpoint:
    - `GET /fixtures/public/{fixture_id}`

## Main App Integration
`app/main.py` includes:
- `blog_router`
- `blog_admin_router`
- `seo_router`

## Config Additions
`app/config.py`:
- `site_base_url: str = "http://localhost:3001"`
- `seo_default_locale: str = "tr"`
- `seo_sitemap_cache_ttl_seconds: int = 900`

Env updates:
- `.env.example`: `SITE_BASE_URL`
- `web/.env.example`: `VITE_SITE_BASE_URL`
- `docker-compose.yml`: passes `SITE_BASE_URL` to api, `VITE_SITE_BASE_URL` to web

## Blog Migration SQL
File: `migrations/016_blog_system.sql`

Creates and indexes:
- `blog_categories`
- `blog_posts`
- `blog_post_translations`
- `blog_tags`
- `blog_post_tags`
- `blog_post_fixtures`

Category seeds:
- `player-profiles`
- `team-analysis`
- `match-predictions`
- `football-tactics`
- `league-reviews`

## Sitemap Design
Sitemap index (`/sitemap.xml`) references:
- static sitemap
- fixture sitemap chunks
- prediction sitemap chunks
- blog sitemap chunks

Design details:
- max URLs per sitemap file: `45,000`
- TTL cache for sitemap payloads
- explicit invalidation hook: `invalidate_seo_cache("sitemap:")`
- invalidation called from:
  - blog admin mutations
  - fixture cache refresh completion (`app/fixture_board.py`)

## Robots Policy
`/robots.txt` allows locale public content and blocks private/auth/admin paths.
Includes `Sitemap: {SITE_BASE_URL}/sitemap.xml`.

## Frontend SEO Architecture
### Added Components
- `web/src/components/seo/SeoHead.jsx`
- `web/src/components/seo/JsonLd.jsx`
- `web/src/components/seo/GlobalSeoManager.jsx`

### Added SEO Utilities
- `web/src/lib/seo.js`

### Added Pages
- `web/src/pages/LocaleHomePage.jsx`
- `web/src/pages/fixtures/PublicFixturesPage.jsx`
- `web/src/pages/fixtures/PublicFixtureDetailPage.jsx`
- `web/src/pages/predictions/PublicPredictionsPage.jsx`
- `web/src/pages/predictions/PublicPredictionDetailPage.jsx`
- `web/src/pages/blog/BlogIndexPage.jsx`
- `web/src/pages/blog/BlogCategoryPage.jsx`
- `web/src/pages/blog/BlogPostPage.jsx`

### Added Routing Helpers
- `web/src/routes/guards/LocaleGate.jsx`
- `web/src/pages/routing/LegacyFixtureRedirect.jsx`

### Route Model
Locale-prefixed routes:
- `/:locale` (home)
- `/:locale/fixtures`
- `/:locale/fixtures/:fixtureId/:slug?`
- `/:locale/predictions`
- `/:locale/predictions/:fixtureId/:slug?`
- `/:locale/blog`
- `/:locale/blog/category/:categorySlug`
- `/:locale/blog/:slug`

Redirects:
- `/ -> /tr`
- `/fixture/:fixtureId -> /tr/fixtures/:fixtureId`

## Prerender Pipeline
Added script:
- `web/scripts/prerender-seo.mjs`

Package scripts:
- `npm run prerender:seo`
- `npm run build:seo`

The prerender script:
- collects route candidates from API
- generates static HTML stubs with canonical + description
- writes output under `web/prerender/`

## Public API Type Contract
```ts
type Locale = "tr" | "en";
type BlogPostStatus = "draft" | "scheduled" | "published" | "archived";

type BlogCategoryKey =
  | "player-profiles"
  | "team-analysis"
  | "match-predictions"
  | "football-tactics"
  | "league-reviews";

interface BlogPostListItem {
  id: number;
  canonical_id: string;
  locale: Locale;
  slug: string;
  title: string;
  excerpt: string | null;
  meta_description: string;
  featured_image_url: string | null;
  category_key: BlogCategoryKey;
  tags: string[];
  author_name: string;
  publish_date: string;
  updated_at: string;
}

interface BlogPostDetail extends BlogPostListItem {
  content_markdown: string;
  meta_title: string | null;
  alternate_locales: Array<{ locale: Locale; slug: string; url: string }>;
  related_fixture_ids: number[];
}
```

## Content Topic Inventory (25)
1. Lionel Messi'nin Son 5 Sezonda Oyun Kurucudan Bitiriciye Evrimi
2. Cristiano Ronaldo's Penalty-Box Movement Patterns in Late Career
3. Erling Haaland'in Ceza Sahasi Kosu Haritasi ve Bitiricilik Profili
4. Kylian Mbappe in Transition: Why Open-Field Defending Fails
5. Jude Bellingham'in Gec Kosulari ve Ikinci Dalga Tehdidi
6. Arda Guler Role Projection: Advanced 8 vs Right Half-Space Creator
7. Premier League Sampiyonluk Yarisinda Baski ve Top Kazanma Karsilastirmasi
8. La Liga Possession Structures: Vertical vs Control-Dominant Teams
9. Serie A'da Dusuk Blok Savunmasi ve Gecis Hucumu Dengesi
10. Bundesliga Pressing Intensity Rankings by Zone and Minute
11. Trendyol Super Lig'de Ic Saha Avantaji Gercekten Ne Kadar?
12. 4-3-3 vs 4-2-3-1: Matchup Triggers That Decide Midfield Control
13. Rest Defense Nedir? Top Kaybinda 5 Saniye Kuralinin Etkisi
14. Breaking a Back Five: Wide Overloads and Far-Post Occupation
15. False 9 Geri Dondu mu? Modern Kullanimi ve Riskleri
16. How Poisson + Market Odds Improves Match Outcome Calibration
17. Mac Tahmini Icin xG, Form ve Oran Verisini Nasil Birlikte Okuruz?
18. Referee and Weather Factors in Pre-Match Probability Shifts
19. Monte Carlo Simulasyonu Futbolda Ne Ise Yarar? Ornekli Anlatim
20. Avoiding Recency Bias in Weekly Prediction Models
21. 2005 Istanbul Finali: Taktik Kirma Noktalari
22. 2014 Germany 7-1 Brazil: Structural Collapse Explained
23. Leicester 2015-16: Beklenmeyen Sampiyonlugun Veri Hikayesi
24. Turkey at Euro 2008: Comeback Patterns and Game-State Psychology
25. 2022 Dunya Kupasi Finali: Momentum Dalgalanmasinin Taktik Okumasi

## Test Checklist
Backend:
- migration creates blog tables and constraints
- slug uniqueness enforcement per locale
- public list/detail filters only published content
- sitemap index includes all sitemap targets
- blog sitemap excludes drafts/scheduled future rows
- fixture sitemap emits localized fixture links
- robots includes sitemap and disallow paths

Frontend:
- locale routes resolve and render
- SeoHead applies title/description/canonical/hreflang/og/twitter
- JsonLd renders for blog article and sports event pages
- GlobalSeoManager applies `noindex,nofollow` for private/auth routes
- prerender script generates route HTML artifacts
