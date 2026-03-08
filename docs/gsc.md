## Google Search Console integration

This document explains how to connect the site to Google Search Console (GSC), which verification methods are recommended, and how to submit the sitemap.

### 1. Choose property type

- **Recommended**: **Domain property**
  - Covers all protocols and subdomains (e.g. `https://edgefootball.ai`, `https://www.edgefootball.ai`, `http://...`).
  - Requires a **DNS TXT record**.
- **Alternative**: **URL-prefix property**
  - Covers only a specific prefix (e.g. `https://edgefootball.ai/`).
  - Can use DNS, HTML file, meta tag or Google Analytics/Tag Manager.

> For production we recommend a **Domain** property whenever you control DNS. Use URL-prefix only if DNS access is limited.

### 2. Recommended verification: DNS TXT record

1. Go to **Google Search Console** and click **“Add property”**.
2. Choose **“Domain”** and enter your root domain (e.g. `edgefootball.ai`).
3. GSC will show a **TXT record** value, something like:
   - `google-site-verification=xxxxxxxxxxxxxxxxxxxx`
4. In your DNS provider (Cloudflare, Route 53, etc.):
   - Create a new **TXT** record:
     - **Name**: `@` (or root, depending on provider UI)
     - **Value**: the exact string from GSC.
5. Wait for DNS to propagate (usually a few minutes; can take longer).
6. Back in GSC, click **Verify**.

This method is **fully decoupled from deploys** (no repo changes when GSC rotates tokens).

### 3. Alternative: HTML file verification (if DNS not available)

If you must use HTML verification:

1. In GSC, choose **URL-prefix** property for your HTTPS origin (e.g. `https://edgefootball.ai/`).
2. Select **HTML file** verification.
3. Download the file `googleXXXXXXXXXXXX.html`.
4. Add the file to the public web root of this project:
   - Place it under `web/app/static/` so it is served at:
     - `https://edgefootball.ai/googleXXXXXXXXXXXX.html`
   - Keep the filename and file contents **exactly as provided** by Google.
5. Redeploy the site.
6. Click **Verify** in GSC.

> Do **not** rename or edit the file content; Google validates the exact path and body.

### 4. Sitemap configuration

- Backend exposes sitemaps via `app/seo.py`:
  - Index: `https://YOUR_DOMAIN/sitemap.xml`
  - Static: `https://YOUR_DOMAIN/sitemaps/static.xml`
  - Fixtures: `https://YOUR_DOMAIN/sitemaps/fixtures.xml` (and chunked variants)
  - Predictions: `https://YOUR_DOMAIN/sitemaps/predictions.xml` (and chunked variants)
  - Blog: `https://YOUR_DOMAIN/sitemaps/blog.xml` (and chunked variants)
- `robots.txt` already includes:
  - `Sitemap: https://YOUR_DOMAIN/sitemap.xml`

**After first verification:**

1. In GSC, select the verified property.
2. Go to **“Sitemaps”** in the left navigation.
3. Enter the sitemap index URL:
   - `sitemap.xml`
4. Click **Submit**.
5. Confirm that GSC reports:
   - Status: **Success**
   - Discovered URLs > 0 (after crawling).

### 5. Ongoing checks and maintenance

- After each major release:
  - Confirm `https://YOUR_DOMAIN/robots.txt` returns **200**.
  - Confirm `https://YOUR_DOMAIN/sitemap.xml` returns **200** and references all child sitemaps.
- In GSC:
  - Check **Coverage / Pages** for:
    - Unexpected `noindex` pages.
    - 404s for important blog or prediction URLs.
  - Check **Enhancements** (Core Web Vitals, Mobile Usability) and use this repo’s `docs/performance.md` as a reference when fixing issues.

### 6. Where this is wired in the repo

- **Config**:
  - `SITE_BASE_URL` in backend (see `app/config.py`).
  - `VITE_SITE_BASE_URL` in frontend (see `web/.env.example`).
- **Sitemaps & robots**:
  - Implementation: `app/seo.py`
  - Robots rules reference the same sitemap index used by GSC.

> Once DNS (or HTML) verification is in place, future code changes generally do **not** require touching GSC, as long as `SITE_BASE_URL` continues to match the verified origin.













