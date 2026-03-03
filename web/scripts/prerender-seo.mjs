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

async function fetchJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${url}`);
  }
  return response.json();
}

function withSeoMeta(template, { title, description, canonical }) {
  const safeTitle = String(title || "EdgeFootball");
  const safeDescription = String(description || "Football predictions and blog.");
  const safeCanonical = String(canonical || SITE_BASE);

  const titleReplaced = template.replace(/<title>.*?<\/title>/i, `<title>${safeTitle}</title>`);
  const metaBlock = [
    `<meta name="description" content="${safeDescription}">`,
    `<link rel="canonical" href="${safeCanonical}">`,
  ].join("\n    ");

  if (titleReplaced.includes("</head>")) {
    return titleReplaced.replace("</head>", `    ${metaBlock}\n  </head>`);
  }
  return `${titleReplaced}\n${metaBlock}`;
}

async function writeRouteHtml(template, route) {
  const normalizedPath = route.path.startsWith("/") ? route.path : `/${route.path}`;
  const outPath = path.join(OUTPUT_DIR, normalizedPath.replace(/^\//, ""), "index.html");
  const html = withSeoMeta(template, {
    title: route.title,
    description: route.description,
    canonical: `${SITE_BASE}${normalizedPath}`,
  });

  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, html, "utf8");
}

async function collectRoutes() {
  const routes = new Map();

  const addRoute = (pathValue, title, description) => {
    const key = String(pathValue || "/").trim();
    if (!key) return;
    routes.set(key, {
      path: key,
      title: String(title || "EdgeFootball"),
      description: String(description || "Football predictions and blog."),
    });
  };

  addRoute("/tr", "EdgeFootball TR", "Futbol tahminleri, fikstur ve analiz.");
  addRoute("/en", "EdgeFootball EN", "Football predictions, fixtures and analysis.");
  addRoute("/tr/blog", "Futbol Blogu", "Oyuncu, lig ve taktik analiz yazilari.");
  addRoute("/en/blog", "Football Blog", "Player, league and tactical analysis articles.");
  addRoute("/tr/fixtures", "Futbol Maclari", "Yaklasan maclar ve detaylar.");
  addRoute("/en/fixtures", "Football Fixtures", "Upcoming fixtures and details.");
  addRoute("/tr/predictions", "Mac Tahminleri", "Yapay zeka destekli mac tahminleri.");
  addRoute("/en/predictions", "Match Predictions", "AI-powered match predictions.");

  try {
    for (const locale of ["tr", "en"]) {
      const payload = await fetchJson(`${API_BASE}/blog/posts?locale=${locale}&page=1&page_size=200`);
      const items = Array.isArray(payload.items) ? payload.items : [];
      items.forEach((item) => {
        if (!item?.slug) return;
        addRoute(
          `/${locale}/blog/${item.slug}`,
          item.title || "Blog Post",
          item.meta_description || "Football analysis article.",
        );
      });
    }
  } catch (err) {
    console.warn(`[prerender-seo] blog route collection skipped: ${err.message}`);
  }

  try {
    const fixturePayload = await fetchJson(`${API_BASE}/fixtures/public?page=1&page_size=200&upcoming_only=true&sort=asc`);
    const fixtureItems = Array.isArray(fixturePayload.items) ? fixturePayload.items : [];
    fixtureItems.forEach((item) => {
      const fixtureId = Number(item?.fixture_id || 0);
      if (!fixtureId) return;
      const label = String(item.match_label || `${item.home_team_name || "Home"} vs ${item.away_team_name || "Away"}`);
      const slug = slugify(label);
      addRoute(`/tr/fixtures/${fixtureId}/${slug}`, `${label} | Mac Detayi`, "Futbol mac detaylari.");
      addRoute(`/en/fixtures/${fixtureId}/${slug}`, `${label} | Fixture Detail`, "Football fixture details.");
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
        addRoute(
          `/${locale}/predictions/${fixtureId}/${slug}`,
          `${label} | ${locale === "en" ? "Prediction" : "Tahmin"}`,
          locale === "en" ? "Public match prediction detail." : "Acik mac tahmin detayi.",
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
