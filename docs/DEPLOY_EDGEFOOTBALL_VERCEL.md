# EdgeFootball Deploy Checklist

Bu proje, frontend'i Vercel'de ve backend'i kendi sunucunda (`api.edgefootball.org`) calistiracak sekilde hazirlandi.

## 1) Frontend (Vercel)

- Project Root: `web/`
- Build Command: `npm run build`
- Output Directory: `dist`
- `web/vercel.json` zaten eklendi:
  - `/api/*` -> `https://api.edgefootball.org/*`
  - `/sitemap.xml`, `/sitemaps/*`, `/robots.txt` -> backend
  - SPA route fallback -> `index.html`

Vercel Environment Variables:

```env
VITE_API_BASE_URL=/api
VITE_SITE_BASE_URL=https://edgefootball.org
VITE_GOOGLE_WEB_CLIENT_ID=<YOUR_GOOGLE_WEB_CLIENT_ID>
```

## 2) Backend (Kendi Sunucun)

Backend `.env` icin minimum production degerleri:

```env
SITE_BASE_URL=https://edgefootball.org
AUTH_COOKIE_SECURE=true
AUTH_COOKIE_SAMESITE=lax
AUTH_COOKIE_DOMAIN=.edgefootball.org
CORS_ALLOWED_ORIGINS=https://edgefootball.org,https://www.edgefootball.org
```

Notlar:

- CORS ayari artik env ile yonetiliyor (`CORS_ALLOWED_ORIGINS`, opsiyonel `CORS_ALLOW_ORIGIN_REGEX`).
- SEO URL'leri ve sitemap absolute linkleri `SITE_BASE_URL` uzerinden uretiliyor.

## 3) DNS

- `edgefootball.org` -> Vercel
- `www.edgefootball.org` -> Vercel (opsiyonel ama onerilir)
- `api.edgefootball.org` -> kendi backend sunucun

## 4) Son Kontrol

Deploy sonrasi su URL'leri test et:

- `https://edgefootball.org/`
- `https://edgefootball.org/api/health`
- `https://edgefootball.org/robots.txt`
- `https://edgefootball.org/sitemap.xml`
