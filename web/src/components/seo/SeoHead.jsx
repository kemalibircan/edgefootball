import { useEffect } from "react";
import {
  buildCanonicalPath,
  hreflangLinks,
  localeToOgLocale,
  normalizeLocale,
  toAbsoluteUrl,
} from "../../lib/seo";

function removeElement(selector) {
  if (typeof document === "undefined") return;
  const head = document.head;
  if (!head) return;
  const element = head.querySelector(selector);
  element?.remove();
}

function upsertMeta(selector, attributes = {}) {
  if (typeof document === "undefined") return;
  const head = document.head;
  if (!head) return;

  let element = head.querySelector(selector);
  if (!element) {
    element = document.createElement("meta");
    head.appendChild(element);
  }

  Object.entries(attributes).forEach(([key, value]) => {
    if (value === null || value === undefined || value === "") {
      element.removeAttribute(key);
      return;
    }
    element.setAttribute(key, String(value));
  });
}

function upsertLink(selector, attributes = {}) {
  if (typeof document === "undefined") return;
  const head = document.head;
  if (!head) return;

  let element = head.querySelector(selector);
  if (!element) {
    element = document.createElement("link");
    head.appendChild(element);
  }

  Object.entries(attributes).forEach(([key, value]) => {
    if (value === null || value === undefined || value === "") {
      element.removeAttribute(key);
      return;
    }
    element.setAttribute(key, String(value));
  });
}

function clearHreflangLinks() {
  if (typeof document === "undefined") return;
  const head = document.head;
  if (!head) return;
  const links = head.querySelectorAll("link[data-seo-hreflang='true']");
  links.forEach((link) => link.remove());
}

function appendHreflangLink({ hreflang, href }) {
  if (typeof document === "undefined") return;
  const head = document.head;
  if (!head) return;

  const element = document.createElement("link");
  element.setAttribute("rel", "alternate");
  element.setAttribute("hreflang", String(hreflang));
  element.setAttribute("href", String(href));
  element.setAttribute("data-seo-hreflang", "true");
  head.appendChild(element);
}

export default function SeoHead({
  title,
  description,
  locale = "tr",
  canonicalPath,
  canonicalUrl,
  trPath,
  enPath,
  defaultPath,
  ogType = "website",
  image,
  robots = "index,follow",
  twitterCard = "summary_large_image",
}) {
  useEffect(() => {
    const safeLocale = normalizeLocale(locale);
    const resolvedTitle = String(title || "EdgeFootball").trim();
    const resolvedDescription = String(description || "Football predictions, fixtures and analysis.").trim();

    if (typeof document !== "undefined") {
      document.title = resolvedTitle;
      document.documentElement.setAttribute("lang", safeLocale);
    }

    const resolvedCanonicalUrl = canonicalUrl
      ? toAbsoluteUrl(canonicalUrl)
      : toAbsoluteUrl(buildCanonicalPath(canonicalPath || (typeof window !== "undefined" ? window.location.pathname : "/")));

    upsertMeta('meta[name="description"]', {
      name: "description",
      content: resolvedDescription,
    });

    upsertMeta('meta[name="robots"]', {
      name: "robots",
      content: robots,
    });

    upsertLink('link[rel="canonical"]', {
      rel: "canonical",
      href: resolvedCanonicalUrl,
    });

    upsertMeta('meta[property="og:title"]', {
      property: "og:title",
      content: resolvedTitle,
    });

    upsertMeta('meta[property="og:description"]', {
      property: "og:description",
      content: resolvedDescription,
    });

    upsertMeta('meta[property="og:type"]', {
      property: "og:type",
      content: ogType,
    });

    upsertMeta('meta[property="og:url"]', {
      property: "og:url",
      content: resolvedCanonicalUrl,
    });

    upsertMeta('meta[property="og:locale"]', {
      property: "og:locale",
      content: localeToOgLocale(safeLocale),
    });

    upsertMeta('meta[name="twitter:card"]', {
      name: "twitter:card",
      content: twitterCard,
    });

    upsertMeta('meta[name="twitter:title"]', {
      name: "twitter:title",
      content: resolvedTitle,
    });

    upsertMeta('meta[name="twitter:description"]', {
      name: "twitter:description",
      content: resolvedDescription,
    });

    const resolvedImage = image ? toAbsoluteUrl(image) : "";

    if (resolvedImage) {
      upsertMeta('meta[property="og:image"]', {
        property: "og:image",
        content: resolvedImage,
      });
      upsertMeta('meta[name="twitter:image"]', {
        name: "twitter:image",
        content: resolvedImage,
      });
    } else {
      removeElement('meta[property="og:image"]');
      removeElement('meta[name="twitter:image"]');
    }

    clearHreflangLinks();
    const hreflangs = hreflangLinks({ trPath, enPath, defaultPath });
    hreflangs.forEach(appendHreflangLink);
  }, [canonicalPath, canonicalUrl, defaultPath, description, enPath, image, locale, ogType, robots, title, trPath, twitterCard]);

  return null;
}
