import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import SeoHead from "../../components/seo/SeoHead";
import JsonLd from "../../components/seo/JsonLd";
import { getBlogPosts, hasEndpoint, isMissingEndpointError } from "../../lib/api";
import { normalizeLocale } from "../../lib/seo";

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

export default function BlogTagPage() {
  const { locale: localeParam, tagSlug } = useParams();
  const locale = normalizeLocale(localeParam);
  const tag = String(tagSlug || "").trim().toLowerCase();

  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setError("");
    setUnavailable(false);

    (async () => {
      try {
        const supported = await hasEndpoint("/blog/posts", { unknownAs: true });
        if (!supported) {
          if (!isMounted) return;
          setUnavailable(true);
          setPosts([]);
          return;
        }

        const payload = await getBlogPosts({ locale, tag, page: 1, pageSize: 24 });
        if (!isMounted) return;
        setPosts(Array.isArray(payload?.items) ? payload.items : []);
      } catch (err) {
        if (!isMounted) return;
        if (isMissingEndpointError(err)) {
          setUnavailable(true);
          setPosts([]);
          return;
        }
        setError(String(err.message || "Failed to load tag posts."));
      } finally {
        if (!isMounted) return;
        setLoading(false);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [locale, tag]);

  const title =
    locale === "en"
      ? `Tag: #${tag || "football"} | EdgeFootball Blog`
      : `Etiket: #${tag || "futbol"} | EdgeFootball Blog`;
  const description =
    locale === "en"
      ? `Football analytics, xG insights and AI prediction articles tagged with #${tag}, covering tactics, odds context and data-led trends.`
      : `#${tag} etiketi ile isaretlenmis futbol analizleri, xG icgörüleri, yapay zeka tahminleri ve oran baglami iceren veri odakli yazilar.`;

  const breadcrumbData = useMemo(
    () => ({
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
          name: `#${tag}`,
          item: `/${locale}/blog/tags/${tag}`,
        },
      ],
    }),
    [locale, tag],
  );

  return (
    <div className="container">
      <SeoHead
        title={title}
        description={description}
        locale={locale}
        canonicalPath={`/${locale}/blog/tags/${tag}`}
        trPath={`/tr/blog/tags/${tag}`}
        enPath={`/en/blog/tags/${tag}`}
        defaultPath={`/tr/blog/tags/${tag}`}
      />
      <JsonLd id="blog-tag-breadcrumb" data={breadcrumbData} />

      <section className="glass-card" style={{ padding: 24, marginBottom: 24 }}>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <h1 style={{ marginBottom: 0 }}>
            {locale === "en" ? "Tag" : "Etiket"}: <span style={{ opacity: 0.9 }}>#{tag}</span>
          </h1>
          <Link className="btn-secondary" to={`/${locale}/blog`}>
            {locale === "en" ? "All posts" : "Tüm yazılar"}
          </Link>
        </div>
        <p className="small-text" style={{ marginTop: 8 }}>
          {description}
        </p>
      </section>

      {loading && <div className="small-text">{locale === "en" ? "Loading..." : "Yükleniyor..."}</div>}
      {!loading && unavailable && (
        <div className="small-text">
          {locale === "en"
            ? "Blog service is temporarily unavailable on this environment."
            : "Blog servisi bu ortamda geçici olarak kullanılamıyor."}
        </div>
      )}
      {error && <div className="error">{error}</div>}

      {!loading && !error && !unavailable && (
        <section style={{ marginBottom: 32 }}>
          {posts.length === 0 && (
            <div className="small-text">{locale === "en" ? "No posts found." : "Yazı bulunamadı."}</div>
          )}
          {posts.length > 0 && (
            <div
              className="blog-grid"
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                gap: 16,
              }}
            >
              {posts.map((post) => (
                <article
                  key={post.id}
                  className="glass-card blog-card"
                  style={{
                    padding: 16,
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    minHeight: 200,
                  }}
                >
                  <div>
                    <div className="small-text" style={{ opacity: 0.8, marginBottom: 4 }}>
                      {formatDate(post.publish_date || post.updated_at)}
                    </div>
                    <h2 style={{ marginBottom: 8, fontSize: "1.05rem" }}>{post.title}</h2>
                    <p className="small-text" style={{ marginBottom: 12 }}>
                      {post.meta_description}
                    </p>
                  </div>
                  <div className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                    <span className="small-text" style={{ opacity: 0.8 }}>
                      {post.author_name || "-"}
                    </span>
                    <Link className="btn-secondary" to={`/${locale}/blog/${post.slug}`}>
                      {locale === "en" ? "Read" : "Oku"}
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}


