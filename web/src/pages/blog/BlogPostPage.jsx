import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import SeoHead from "../../components/seo/SeoHead";
import JsonLd from "../../components/seo/JsonLd";
import { getBlogPostDetail, getBlogPosts, hasEndpoint, isMissingEndpointError } from "../../lib/api";
import { normalizeLocale, slugify, toAbsoluteUrl } from "../../lib/seo";

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function computeReadingTime(text) {
  if (!text) return null;
  const words = String(text).split(/\s+/).filter(Boolean).length;
  if (!words) return null;
  const minutes = Math.max(1, Math.round(words / 220));
  return minutes;
}

function extractTocFromMarkdown(markdown) {
  if (!markdown) return [];
  const lines = String(markdown).split("\n");
  const toc = [];
  lines.forEach((line) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("## ")) {
      const text = trimmed.replace(/^##\s+/, "").trim();
      if (!text) return;
      toc.push({ id: slugify(text), text, level: 2 });
    } else if (trimmed.startsWith("### ")) {
      const text = trimmed.replace(/^###\s+/, "").trim();
      if (!text) return;
      toc.push({ id: slugify(text), text, level: 3 });
    }
  });
  return toc;
}

export default function BlogPostPage() {
  const { locale: localeParam, slug } = useParams();
  const locale = normalizeLocale(localeParam);

  const [post, setPost] = useState(null);
  const [relatedPosts, setRelatedPosts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [unavailable, setUnavailable] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!slug) return;

    let isMounted = true;
    setLoading(true);
    setError("");
    setUnavailable(false);

    (async () => {
      try {
        const supported = await hasEndpoint("/blog/posts/{slug}", { unknownAs: true });
        if (!supported) {
          if (!isMounted) return;
          setUnavailable(true);
          setPost(null);
          return;
        }

        const payload = await getBlogPostDetail(slug, { locale });
        if (!isMounted) return;
        setPost(payload || null);
      } catch (err) {
        if (!isMounted) return;
        if (isMissingEndpointError(err)) {
          setUnavailable(true);
          setPost(null);
          return;
        }
        setError(String(err.message || "Failed to load blog post."));
      } finally {
        if (!isMounted) return;
        setLoading(false);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [slug, locale]);

  useEffect(() => {
    let isMounted = true;
    if (!post || !post.category_key) {
      setRelatedPosts([]);
      return () => {
        isMounted = false;
      };
    }

    (async () => {
      try {
        const payload = await getBlogPosts({
          locale,
          category: post.category_key,
          page: 1,
          pageSize: 6,
        });
        if (!isMounted) return;
        const items = Array.isArray(payload?.items) ? payload.items : [];
        const filtered = items.filter((item) => item.slug !== post.slug);
        setRelatedPosts(filtered);
      } catch {
        if (!isMounted) return;
        setRelatedPosts([]);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [locale, post]);

  const title = String(post?.meta_title || post?.title || (locale === "en" ? "Blog Post" : "Blog Yazisi"));
  const description = String(post?.meta_description || (locale === "en" ? "Football blog post detail." : "Futbol blog yazisi detayi."));

  const trAlternate = post?.alternate_locales?.find((item) => item.locale === "tr");
  const enAlternate = post?.alternate_locales?.find((item) => item.locale === "en");

  const trPath = trAlternate?.slug ? `/tr/blog/${trAlternate.slug}` : locale === "tr" && post?.slug ? `/tr/blog/${post.slug}` : "/tr/blog";
  const enPath = enAlternate?.slug ? `/en/blog/${enAlternate.slug}` : locale === "en" && post?.slug ? `/en/blog/${post.slug}` : "/en/blog";

  const toc = useMemo(() => extractTocFromMarkdown(post?.content_markdown || ""), [post?.content_markdown]);

  const breadcrumbData = useMemo(
    () =>
      post
        ? {
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              {
                "@type": "ListItem",
                position: 1,
                name: locale === "en" ? "Home" : "Ana Sayfa",
                item: `/${locale}`,
              },
              {
                "@type": "ListItem",
                position: 2,
                name: "Blog",
                item: `/${locale}/blog`,
              },
              {
                "@type": "ListItem",
                position: 3,
                name: post.title,
                item: `/${locale}/blog/${post.slug}`,
              },
            ],
          }
        : null,
    [locale, post],
  );

  const articleJsonLd = useMemo(() => {
    if (!post) return null;
    return {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: post.title,
      description: post.meta_description,
      author: {
        "@type": "Person",
        name: post.author_name || "EdgeFootball",
      },
      datePublished: post.publish_date,
      dateModified: post.updated_at,
      image: post.featured_image_url ? toAbsoluteUrl(post.featured_image_url) : undefined,
      inLanguage: locale,
      mainEntityOfPage: toAbsoluteUrl(`/${locale}/blog/${post.slug}`),
    };
  }, [post, locale]);

  const readingTimeMinutes = useMemo(() => computeReadingTime(post?.content_markdown || ""), [post?.content_markdown]);

  function handleCopyLink() {
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    const url = toAbsoluteUrl(`/${locale}/blog/${post?.slug || slug}`);
    navigator.clipboard.writeText(url).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      },
      () => {
        setCopied(false);
      },
    );
  }

  const markdownComponents = useMemo(
    () => ({
      h2({ node, children, ...props }) {
        const text = String(children?.[0] || "");
        const id = slugify(text);
        return (
          <h2 id={id} {...props}>
            {children}
          </h2>
        );
      },
      h3({ node, children, ...props }) {
        const text = String(children?.[0] || "");
        const id = slugify(text);
        return (
          <h3 id={id} {...props}>
            {children}
          </h3>
        );
      },
      code({ inline, className, children, ...props }) {
        const content = String(children || "");
        if (inline) {
          return (
            <code className={className} {...props}>
              {content}
            </code>
          );
        }
        return (
          <pre className={className || "code-block"} {...props}>
            <code>{content}</code>
          </pre>
        );
      },
    }),
    [],
  );

  return (
    <div className="container">
      <SeoHead
        title={title}
        description={description}
        locale={locale}
        canonicalPath={`/${locale}/blog/${post?.slug || slug}`}
        trPath={trPath}
        enPath={enPath}
        defaultPath={trPath}
        ogType="article"
        image={post?.featured_image_url || ""}
      />
      {articleJsonLd && <JsonLd id="blog-article" data={articleJsonLd} />}
      {breadcrumbData && <JsonLd id="blog-breadcrumb" data={breadcrumbData} />}

      <section className="blog-layout">
        <div className="blog-main glass-card">
          <div
            className="blog-header"
            style={{
              padding: 24,
              borderBottom: "1px solid var(--glass-border)",
            }}
          >
            <nav aria-label={locale === "en" ? "Breadcrumb" : "Gezinme yolu"} className="small-text">
              <Link to={`/${locale}`} className="link-muted">
                {locale === "en" ? "Home" : "Ana Sayfa"}
              </Link>{" "}
              /{" "}
              <Link to={`/${locale}/blog`} className="link-muted">
                Blog
              </Link>{" "}
              / <span>{post?.title || (locale === "en" ? "Blog Post" : "Blog Yazısı")}</span>
            </nav>
            <div
              className="row"
              style={{
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: 16,
                marginTop: 12,
              }}
            >
              <div style={{ flex: 3 }}>
                <h1 style={{ marginBottom: 8 }}>{post?.title || (locale === "en" ? "Blog Post" : "Blog Yazısı")}</h1>
                <div className="small-text" style={{ opacity: 0.85 }}>
                  {(post?.author_name || "-")} •{" "}
                  {post?.publish_date ? formatDate(post.publish_date) : "-"}
                  {post?.updated_at && (
                    <> • {locale === "en" ? "Updated" : "Güncellendi"} {formatDate(post.updated_at)}</>
                  )}
                  {readingTimeMinutes && (
                    <>
                      {" "}
                      •{" "}
                      {readingTimeMinutes}{" "}
                      {locale === "en" ? "min read" : "dk okuma"}
                    </>
                  )}
                </div>
              </div>
              <div
                className="blog-share"
                style={{
                  flex: 2,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-end",
                  gap: 8,
                }}
              >
                <Link className="btn-secondary" to={`/${locale}/blog`}>
                  {locale === "en" ? "All posts" : "Tüm yazılar"}
                </Link>
                <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={handleCopyLink}
                    aria-label={locale === "en" ? "Copy article link" : "Yazı bağlantısını kopyala"}
                  >
                    {copied
                      ? locale === "en"
                        ? "Copied"
                        : "Kopyalandı"
                      : locale === "en"
                        ? "Copy link"
                        : "Bağlantıyı kopyala"}
                  </button>
                  <a
                    className="btn-secondary"
                    href={`https://twitter.com/intent/tweet?url=${encodeURIComponent(
                      toAbsoluteUrl(`/${locale}/blog/${post?.slug || slug}`),
                    )}&text=${encodeURIComponent(title)}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {locale === "en" ? "Share on X" : "X'te paylaş"}
                  </a>
                </div>
              </div>
            </div>
          </div>

          <div style={{ padding: 24 }}>
            {loading && <div className="small-text">{locale === "en" ? "Loading..." : "Yükleniyor..."}</div>}
            {!loading && unavailable && (
              <div className="small-text">
                {locale === "en"
                  ? "Blog service is temporarily unavailable on this environment."
                  : "Blog servisi bu ortamda geçici olarak kullanılamıyor."}
              </div>
            )}
            {error && <div className="error">{error}</div>}

            {!loading && !error && !unavailable && post && (
              <>
                {post.featured_image_url && (
                  <div
                    style={{
                      marginBottom: 24,
                      borderRadius: 16,
                      overflow: "hidden",
                      boxShadow: "var(--shadow-md)",
                    }}
                  >
                    <img
                      src={post.featured_image_url}
                      alt={post.title}
                      loading="lazy"
                      style={{ width: "100%", height: "auto", display: "block" }}
                    />
                  </div>
                )}

                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={markdownComponents}
                >
                  {String(post.content_markdown || "")}
                </ReactMarkdown>

                <div
                  className="glass-card"
                  style={{
                    marginTop: 32,
                    padding: 16,
                    borderLeft: "4px solid var(--accent-lime)",
                  }}
                >
                  <h3 style={{ marginBottom: 8 }}>
                    {locale === "en" ? "Use predictions responsibly" : "Tahminleri sorumlu kullan"}
                  </h3>
                  <p className="small-text">
                    {locale === "en"
                      ? "Our AI predictions are informational signals, not guarantees. Always combine them with your own judgment and avoid risking more than you can afford to lose."
                      : "Yapay zeka tahminleri garanti değil, bilgi amaçlı sinyallerdir. Kendi yorumunuzu mutlaka ekleyin ve asla kaybetmeyi göze alabileceğinizden fazlasını riske etmeyin."}
                  </p>
                </div>

                <div
                  className="row"
                  style={{
                    marginTop: 24,
                    gap: 12,
                    flexWrap: "wrap",
                  }}
                >
                  <Link className="btn-primary" to={`/${locale}/predictions`}>
                    {locale === "en" ? "See today’s AI predictions" : "Bugünün yapay zeka tahminlerine bak"}
                  </Link>
                  <Link className="btn-secondary" to={`/${locale}/fixtures`}>
                    {locale === "en" ? "Browse fixtures" : "Fikstürü incele"}
                  </Link>
                </div>
              </>
            )}
          </div>
        </div>

        <aside className="blog-aside">
          <div className="glass-card blog-toc">
            <button
              type="button"
              className="small-text"
              aria-expanded="true"
              style={{
                width: "100%",
                textAlign: "left",
                padding: 12,
                borderBottom: "1px solid var(--glass-border)",
              }}
            >
              {locale === "en" ? "On this page" : "Bu sayfada"}
            </button>
            <div style={{ maxHeight: 320, overflowY: "auto", padding: 12 }}>
              {toc.length === 0 && (
                <div className="small-text" style={{ opacity: 0.8 }}>
                  {locale === "en" ? "Sections appear here for longer articles." : "Uzun yazılarda başlıklar burada görünür."}
                </div>
              )}
              {toc.length > 0 && (
                <ul
                  style={{
                    listStyle: "none",
                    padding: 0,
                    margin: 0,
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                  }}
                >
                  {toc.map((item) => (
                    <li key={item.id} style={{ marginLeft: item.level === 3 ? 12 : 0 }}>
                      <a
                        href={`#${item.id}`}
                        className="small-text link-muted"
                        style={{ display: "inline-block", padding: "2px 0" }}
                      >
                        {item.text}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {relatedPosts.length > 0 && (
            <div className="glass-card" style={{ padding: 16, marginTop: 16 }}>
              <h3 style={{ marginBottom: 8 }}>
                {locale === "en" ? "Related posts" : "Benzer yazılar"}
              </h3>
              <ul
                style={{
                  listStyle: "none",
                  padding: 0,
                  margin: 0,
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                }}
              >
                {relatedPosts.map((item) => (
                  <li key={item.id}>
                    <Link className="link-muted" to={`/${locale}/blog/${item.slug}`}>
                      <strong style={{ display: "block" }}>{item.title}</strong>
                      <span className="small-text" style={{ opacity: 0.8 }}>
                        {formatDate(item.publish_date || item.updated_at)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </section>
    </div>
  );
}
