import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const WORKDIR = process.cwd();
// Backend varsayılan portu 8000; env yoksa buna düş.
const API_BASE = String(process.env.VITE_API_BASE_URL || "http://localhost:8000").replace(/\/+$/, "");
const SITE_BASE = String(process.env.VITE_SITE_BASE_URL || "http://localhost:3001").replace(/\/+$/, "");
const OUTPUT_DIR = path.join(WORKDIR, "prerender");
const TEMPLATE_PATH = path.join(WORKDIR, "index.html");

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "item";
}

function escapeHtmlText(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeHtmlAttr(value) {
  return escapeHtmlText(value).replaceAll('"', "&quot;");
}

function normalizeLocaleFromPath(pathname) {
  const raw = String(pathname || "").trim();
  const match = raw.match(/^\/(tr|en)(\/|$)/i);
  return match ? match[1].toLowerCase() : "tr";
}

function ogLocale(locale) {
  return String(locale || "").toLowerCase() === "en" ? "en_US" : "tr_TR";
}

function toAbsoluteOnSite(pathOrUrl) {
  const raw = String(pathOrUrl || "").trim();
  if (!raw) return "";
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
  return `${SITE_BASE}${raw.startsWith("/") ? raw : `/${raw}`}`;
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${url}`);
  }
  return response.json();
}

function withSeoMeta(
  template,
  {
    title,
    description,
    canonical,
    locale,
    ogType = "website",
    image,
    robots = "index,follow",
    alternates,
    jsonLdBlocks,
  },
) {
  const safeLocale = String(locale || "tr").toLowerCase() === "en" ? "en" : "tr";
  const safeTitle = String(title || "EdgeFootball").trim();
  const safeDescription = String(description || "Football predictions and blog.").trim();
  const safeCanonical = String(canonical || SITE_BASE).trim();
  const safeOgType = String(ogType || "website").trim();
  const safeRobots = String(robots || "index,follow").trim();

  const normalizedImage = String(image || "").trim();
  const resolvedImage = normalizedImage ? toAbsoluteOnSite(normalizedImage) : "";

  let html = String(template || "");

  // Ensure html lang is correct for the generated route.
  html = html.replace(/<html\b([^>]*)\blang="[^"]*"/i, `<html$1 lang="${safeLocale}"`);
  if (!/^\s*<!doctype/i.test(html)) {
    // No-op safety; template should already contain doctype.
  }

  html = html.replace(/<title>.*?<\/title>/i, `<title>${escapeHtmlText(safeTitle)}</title>`);

  const metaLines = [];
  metaLines.push(`<meta name="description" content="${escapeHtmlAttr(safeDescription)}">`);
  metaLines.push(`<meta name="robots" content="${escapeHtmlAttr(safeRobots)}">`);
  metaLines.push(`<link rel="canonical" href="${escapeHtmlAttr(safeCanonical)}">`);

  // Open Graph
  metaLines.push(`<meta property="og:site_name" content="EdgeFootball">`);
  metaLines.push(`<meta property="og:title" content="${escapeHtmlAttr(safeTitle)}">`);
  metaLines.push(`<meta property="og:description" content="${escapeHtmlAttr(safeDescription)}">`);
  metaLines.push(`<meta property="og:type" content="${escapeHtmlAttr(safeOgType)}">`);
  metaLines.push(`<meta property="og:url" content="${escapeHtmlAttr(safeCanonical)}">`);
  metaLines.push(`<meta property="og:locale" content="${escapeHtmlAttr(ogLocale(safeLocale))}">`);
  if (resolvedImage) {
    metaLines.push(`<meta property="og:image" content="${escapeHtmlAttr(resolvedImage)}">`);
  }

  // Twitter
  metaLines.push(`<meta name="twitter:card" content="summary_large_image">`);
  metaLines.push(`<meta name="twitter:title" content="${escapeHtmlAttr(safeTitle)}">`);
  metaLines.push(`<meta name="twitter:description" content="${escapeHtmlAttr(safeDescription)}">`);
  if (resolvedImage) {
    metaLines.push(`<meta name="twitter:image" content="${escapeHtmlAttr(resolvedImage)}">`);
  }

  // Hreflang alternates
  const altList = Array.isArray(alternates) ? alternates : [];
  for (const item of altList) {
    if (!item?.hreflang || !item?.href) continue;
    metaLines.push(
      `<link rel="alternate" hreflang="${escapeHtmlAttr(item.hreflang)}" href="${escapeHtmlAttr(item.href)}">`,
    );
  }

  // JSON-LD blocks
  const blocks = Array.isArray(jsonLdBlocks) ? jsonLdBlocks : [];
  for (const block of blocks) {
    try {
      const json = JSON.stringify(block || {});
      metaLines.push(`<script type="application/ld+json">${escapeHtmlText(json)}</script>`);
    } catch {
      // skip invalid json-ld payload
    }
  }

  const metaBlock = metaLines.join("\n    ");

  if (html.includes("</head>")) {
    return html.replace("</head>", `    ${metaBlock}\n  </head>`);
  }
  return `${html}\n${metaBlock}`;
}

async function writeRouteHtml(template, route) {
  const normalizedPath = route.path.startsWith("/") ? route.path : `/${route.path}`;
  const outPath = path.join(OUTPUT_DIR, normalizedPath.replace(/^\//, ""), "index.html");
  const html = withSeoMeta(template, {
    title: route.title,
    description: route.description,
    canonical: `${SITE_BASE}${normalizedPath}`,
    locale: route.locale || normalizeLocaleFromPath(normalizedPath),
    ogType: route.ogType || "website",
    image: route.image || "",
    robots: route.robots || "index,follow",
    alternates: route.alternates || [],
    jsonLdBlocks: route.jsonLdBlocks || [],
  });

  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, html, "utf8");
}

async function collectRoutes() {
  const routes = new Map();

  const addRoute = (pathValue, title, description, extra = {}) => {
    const key = String(pathValue || "/").trim();
    if (!key) return;
    const locale = extra.locale || normalizeLocaleFromPath(key);
    routes.set(key, {
      path: key,
      title: String(title || "EdgeFootball"),
      description: String(description || "Football predictions and blog."),
      locale,
      ogType: extra.ogType || "website",
      image: extra.image || "",
      robots: extra.robots || "index,follow",
      alternates: Array.isArray(extra.alternates) ? extra.alternates : [],
      jsonLdBlocks: Array.isArray(extra.jsonLdBlocks) ? extra.jsonLdBlocks : [],
    });
  };

  addRoute("/tr", "EdgeFootball TR", "Futbol tahminleri, fikstur ve analiz.", {
    locale: "tr",
    alternates: [
      { hreflang: "tr", href: `${SITE_BASE}/tr` },
      { hreflang: "en", href: `${SITE_BASE}/en` },
      { hreflang: "x-default", href: `${SITE_BASE}/tr` },
    ],
  });
  addRoute("/en", "EdgeFootball EN", "Football predictions, fixtures and analysis.", {
    locale: "en",
    alternates: [
      { hreflang: "tr", href: `${SITE_BASE}/tr` },
      { hreflang: "en", href: `${SITE_BASE}/en` },
      { hreflang: "x-default", href: `${SITE_BASE}/tr` },
    ],
  });
  addRoute("/tr/blog", "Futbol Blogu | EdgeFootball", "Oyuncu, lig ve taktik analiz yazilari.", {
    locale: "tr",
    ogType: "website",
    alternates: [
      { hreflang: "tr", href: `${SITE_BASE}/tr/blog` },
      { hreflang: "en", href: `${SITE_BASE}/en/blog` },
      { hreflang: "x-default", href: `${SITE_BASE}/tr/blog` },
    ],
  });
  addRoute("/en/blog", "Football Blog | EdgeFootball", "Player, league and tactical analysis articles.", {
    locale: "en",
    ogType: "website",
    alternates: [
      { hreflang: "tr", href: `${SITE_BASE}/tr/blog` },
      { hreflang: "en", href: `${SITE_BASE}/en/blog` },
      { hreflang: "x-default", href: `${SITE_BASE}/tr/blog` },
    ],
  });
  addRoute("/tr/fixtures", "Futbol Maçlari | EdgeFootball", "Yaklasan maclar ve detaylar.", {
    locale: "tr",
    alternates: [
      { hreflang: "tr", href: `${SITE_BASE}/tr/fixtures` },
      { hreflang: "en", href: `${SITE_BASE}/en/fixtures` },
      { hreflang: "x-default", href: `${SITE_BASE}/tr/fixtures` },
    ],
  });
  addRoute("/en/fixtures", "Football Fixtures | EdgeFootball", "Upcoming fixtures and details.", {
    locale: "en",
    alternates: [
      { hreflang: "tr", href: `${SITE_BASE}/tr/fixtures` },
      { hreflang: "en", href: `${SITE_BASE}/en/fixtures` },
      { hreflang: "x-default", href: `${SITE_BASE}/tr/fixtures` },
    ],
  });
  addRoute("/tr/predictions", "Maç Tahminleri | EdgeFootball", "Yapay zeka destekli mac tahminleri.", {
    locale: "tr",
    alternates: [
      { hreflang: "tr", href: `${SITE_BASE}/tr/predictions` },
      { hreflang: "en", href: `${SITE_BASE}/en/predictions` },
      { hreflang: "x-default", href: `${SITE_BASE}/tr/predictions` },
    ],
  });
  addRoute("/en/predictions", "Match Predictions | EdgeFootball", "AI-powered match predictions.", {
    locale: "en",
    alternates: [
      { hreflang: "tr", href: `${SITE_BASE}/tr/predictions` },
      { hreflang: "en", href: `${SITE_BASE}/en/predictions` },
      { hreflang: "x-default", href: `${SITE_BASE}/tr/predictions` },
    ],
  });

  try {
    const [trPostsPayload, enPostsPayload] = await Promise.all([
      fetchJson(`${API_BASE}/blog/posts?locale=tr&page=1&page_size=200`),
      fetchJson(`${API_BASE}/blog/posts?locale=en&page=1&page_size=200`),
    ]);
    const trItems = Array.isArray(trPostsPayload.items) ? trPostsPayload.items : [];
    const enItems = Array.isArray(enPostsPayload.items) ? enPostsPayload.items : [];

    const byCanonical = new Map();
    for (const item of trItems) {
      if (!item?.canonical_id) continue;
      const key = String(item.canonical_id);
      byCanonical.set(key, { ...(byCanonical.get(key) || {}), tr: item });
    }
    for (const item of enItems) {
      if (!item?.canonical_id) continue;
      const key = String(item.canonical_id);
      byCanonical.set(key, { ...(byCanonical.get(key) || {}), en: item });
    }

    for (const [, pair] of byCanonical.entries()) {
      for (const locale of ["tr", "en"]) {
        const item = pair?.[locale];
        if (!item?.slug) continue;

        const canonicalPath = `/${locale}/blog/${item.slug}`;
        const alternates = [];
        if (pair?.tr?.slug) alternates.push({ hreflang: "tr", href: `${SITE_BASE}/tr/blog/${pair.tr.slug}` });
        if (pair?.en?.slug) alternates.push({ hreflang: "en", href: `${SITE_BASE}/en/blog/${pair.en.slug}` });
        if (pair?.tr?.slug) alternates.push({ hreflang: "x-default", href: `${SITE_BASE}/tr/blog/${pair.tr.slug}` });

        const breadcrumb = {
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            {
              "@type": "ListItem",
              position: 1,
              name: locale === "en" ? "Home" : "Ana Sayfa",
              item: `${SITE_BASE}/${locale}`,
            },
            {
              "@type": "ListItem",
              position: 2,
              name: "Blog",
              item: `${SITE_BASE}/${locale}/blog`,
            },
            {
              "@type": "ListItem",
              position: 3,
              name: item.title || "Blog",
              item: `${SITE_BASE}${canonicalPath}`,
            },
          ],
        };

        const published = item.publish_date || item.updated_at || undefined;
        const modified = item.updated_at || item.publish_date || undefined;
        const imageAbs = item.featured_image_url ? toAbsoluteOnSite(item.featured_image_url) : "";

        const blogPosting = {
          "@context": "https://schema.org",
          "@type": "BlogPosting",
          headline: item.title,
          description: item.meta_description,
          datePublished: published,
          dateModified: modified,
          inLanguage: locale,
          mainEntityOfPage: {
            "@type": "WebPage",
            "@id": `${SITE_BASE}${canonicalPath}`,
          },
          author: item.author_name
            ? { "@type": "Person", name: item.author_name }
            : { "@type": "Organization", name: "EdgeFootball" },
          publisher: { "@type": "Organization", name: "EdgeFootball" },
          image: imageAbs ? [imageAbs] : undefined,
          isPartOf: {
            "@type": "Blog",
            name: "EdgeFootball Blog",
            url: `${SITE_BASE}/${locale}/blog`,
          },
        };

        addRoute(canonicalPath, item.title || (locale === "en" ? "Blog Post" : "Blog Yazısı"), item.meta_description || "", {
          locale,
          ogType: "article",
          image: item.featured_image_url || "",
          alternates,
          jsonLdBlocks: [blogPosting, breadcrumb],
        });

        // Also collect tag + category pages for prerendering (optional but useful).
        // These are added separately below from dedicated endpoints.
      }
    }
  } catch (err) {
    console.warn(`[prerender-seo] blog route collection skipped: ${err.message}`);
  }

  // Blog category + tag pages (improves crawlability for listing pages).
  try {
    for (const locale of ["tr", "en"]) {
      const [categoriesPayload, tagsPayload] = await Promise.all([
        fetchJson(`${API_BASE}/blog/categories?locale=${locale}`),
        fetchJson(`${API_BASE}/blog/tags?locale=${locale}`),
      ]);
      const categories = Array.isArray(categoriesPayload.items) ? categoriesPayload.items : [];
      const tags = Array.isArray(tagsPayload.items) ? tagsPayload.items : [];

      categories.forEach((cat) => {
        const key = String(cat?.key || "").trim().toLowerCase();
        if (!key) return;
        const name = String(cat?.name || key);
        const routePath = `/${locale}/blog/category/${key}`;
        addRoute(
          routePath,
          locale === "en" ? `Blog Category: ${name} | EdgeFootball` : `Blog Kategori: ${name} | EdgeFootball`,
          locale === "en"
            ? `Football analytics and AI prediction articles in the ${name} category.`
            : `${name} kategorisindeki futbol analizleri ve yapay zeka tahmin yazilari.`,
          {
            locale,
            ogType: "website",
            alternates: [
              { hreflang: "tr", href: `${SITE_BASE}/tr/blog/category/${key}` },
              { hreflang: "en", href: `${SITE_BASE}/en/blog/category/${key}` },
              { hreflang: "x-default", href: `${SITE_BASE}/tr/blog/category/${key}` },
            ],
            jsonLdBlocks: [
              {
                "@context": "https://schema.org",
                "@type": "BreadcrumbList",
                itemListElement: [
                  { "@type": "ListItem", position: 1, name: locale === "en" ? "Home" : "Ana Sayfa", item: `${SITE_BASE}/${locale}` },
                  { "@type": "ListItem", position: 2, name: "Blog", item: `${SITE_BASE}/${locale}/blog` },
                  { "@type": "ListItem", position: 3, name, item: `${SITE_BASE}${routePath}` },
                ],
              },
            ],
          },
        );
      });

      tags.forEach((tag) => {
        const slug = String(tag?.slug || "").trim().toLowerCase();
        if (!slug) return;
        const name = String(tag?.name || slug);
        const routePath = `/${locale}/blog/tags/${slug}`;
        addRoute(
          routePath,
          locale === "en" ? `Tag: #${name} | EdgeFootball Blog` : `Etiket: #${name} | EdgeFootball Blog`,
          locale === "en"
            ? `Football insights, xG analysis and AI prediction articles tagged with #${name}.`
            : `#${name} etiketi ile isaretlenmis futbol analizleri ve yapay zeka tahmin yazilari.`,
          {
            locale,
            ogType: "website",
            alternates: [
              { hreflang: "tr", href: `${SITE_BASE}/tr/blog/tags/${slug}` },
              { hreflang: "en", href: `${SITE_BASE}/en/blog/tags/${slug}` },
              { hreflang: "x-default", href: `${SITE_BASE}/tr/blog/tags/${slug}` },
            ],
            jsonLdBlocks: [
              {
                "@context": "https://schema.org",
                "@type": "BreadcrumbList",
                itemListElement: [
                  { "@type": "ListItem", position: 1, name: locale === "en" ? "Home" : "Ana Sayfa", item: `${SITE_BASE}/${locale}` },
                  { "@type": "ListItem", position: 2, name: "Blog", item: `${SITE_BASE}/${locale}/blog` },
                  { "@type": "ListItem", position: 3, name: `#${name}`, item: `${SITE_BASE}${routePath}` },
                ],
              },
            ],
          },
        );
      });
    }
  } catch (err) {
    console.warn(`[prerender-seo] blog tag/category collection skipped: ${err.message}`);
  }

  try {
    const fixturePayload = await fetchJson(`${API_BASE}/fixtures/public?page=1&page_size=200&upcoming_only=true&sort=asc`);
    const fixtureItems = Array.isArray(fixturePayload.items) ? fixturePayload.items : [];
    fixtureItems.forEach((item) => {
      const fixtureId = Number(item?.fixture_id || 0);
      if (!fixtureId) return;
      const label = String(item.match_label || `${item.home_team_name || "Home"} vs ${item.away_team_name || "Away"}`);
      const slug = slugify(label);
      addRoute(`/tr/fixtures/${fixtureId}/${slug}`, `${label} | Maç Detayı`, "Futbol maç detayları.", {
        locale: "tr",
        alternates: [
          { hreflang: "tr", href: `${SITE_BASE}/tr/fixtures/${fixtureId}/${slug}` },
          { hreflang: "en", href: `${SITE_BASE}/en/fixtures/${fixtureId}/${slug}` },
          { hreflang: "x-default", href: `${SITE_BASE}/tr/fixtures/${fixtureId}/${slug}` },
        ],
      });
      addRoute(`/en/fixtures/${fixtureId}/${slug}`, `${label} | Fixture Detail`, "Football fixture details.", {
        locale: "en",
        alternates: [
          { hreflang: "tr", href: `${SITE_BASE}/tr/fixtures/${fixtureId}/${slug}` },
          { hreflang: "en", href: `${SITE_BASE}/en/fixtures/${fixtureId}/${slug}` },
          { hreflang: "x-default", href: `${SITE_BASE}/tr/fixtures/${fixtureId}/${slug}` },
        ],
      });
    });
  } catch (err) {
    console.warn(`[prerender-seo] fixture route collection skipped: ${err.message}`);
  }

  try {
    for (const locale of ["tr", "en"]) {
      const predictionPayload = await fetchJson(`${API_BASE}/predictions/public?locale=${locale}&page=1&page_size=200`);
      const predictionItems = Array.isArray(predictionPayload.items) ? predictionPayload.items : [];
      predictionItems.forEach((item) => {
        const fixtureId = Number(item?.fixture_id || 0);
        if (!fixtureId) return;
        const label = String(item.match_label || "Match");
        const slug = slugify(item.slug || label);
        const alternates = [
          { hreflang: "tr", href: `${SITE_BASE}/tr/predictions/${fixtureId}/${slug}` },
          { hreflang: "en", href: `${SITE_BASE}/en/predictions/${fixtureId}/${slug}` },
          { hreflang: "x-default", href: `${SITE_BASE}/tr/predictions/${fixtureId}/${slug}` },
        ];
        addRoute(
          `/${locale}/predictions/${fixtureId}/${slug}`,
          `${label} | ${locale === "en" ? "Prediction" : "Tahmin"}`,
          locale === "en" ? "Public match prediction detail." : "Acik mac tahmin detayi.",
          { locale, alternates },
        );
      });
    }
  } catch (err) {
    console.warn(`[prerender-seo] prediction route collection skipped: ${err.message}`);
  }

  return [...routes.values()];
}

async function main() {
  const template = await fs.readFile(TEMPLATE_PATH, "utf8");
  const routes = await collectRoutes();

  await fs.rm(OUTPUT_DIR, { recursive: true, force: true });
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  for (const route of routes) {
    await writeRouteHtml(template, route);
  }

  await fs.writeFile(path.join(OUTPUT_DIR, "routes.json"), JSON.stringify(routes, null, 2), "utf8");
  console.log(`[prerender-seo] generated ${routes.length} route files in ${OUTPUT_DIR}`);
}

main().catch((err) => {
  console.error(`[prerender-seo] failed: ${err.stack || err.message}`);
  process.exitCode = 1;
});
