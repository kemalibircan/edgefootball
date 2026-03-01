import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import SeoHead from "../../components/seo/SeoHead";
import JsonLd from "../../components/seo/JsonLd";
import { getBlogPosts, hasEndpoint, isMissingEndpointError } from "../../lib/api";
import { normalizeLocale } from "../../lib/seo";

export default function BlogCategoryPage() {
  const { locale: localeParam, categorySlug } = useParams();
  const locale = normalizeLocale(localeParam);
  const category = String(categorySlug || "").trim().toLowerCase();

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

        const payload = await getBlogPosts({ locale, category, page: 1, pageSize: 24 });
        if (!isMounted) return;
        setPosts(Array.isArray(payload?.items) ? payload.items : []);
      } catch (err) {
        if (!isMounted) return;
        if (isMissingEndpointError(err)) {
          setUnavailable(true);
          setPosts([]);
          return;
        }
        setError(String(err.message || "Failed to load blog category."));
      } finally {
        if (!isMounted) return;
        setLoading(false);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [category, locale]);

  const title = `${locale === "en" ? "Blog Category" : "Blog Kategori"}: ${category}`;
  const description =
    locale === "en"
      ? `Football blog posts for category: ${category}.`
      : `${category} kategorisindeki futbol blog yazilari.`;

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
          name: category,
          item: `/${locale}/blog/category/${category}`,
        },
      ],
    }),
    [category, locale],
  );

  return (
    <div className="container">
      <SeoHead
        title={title}
        description={description}
        locale={locale}
        canonicalPath={`/${locale}/blog/category/${category}`}
        trPath={`/tr/blog/category/${category}`}
        enPath={`/en/blog/category/${category}`}
        defaultPath={`/tr/blog/category/${category}`}
      />
      <JsonLd id="blog-category-breadcrumb" data={breadcrumbData} />

      <section className="card wide">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <h2>{title}</h2>
          <Link className="btn-secondary" to={`/${locale}/blog`}>
            {locale === "en" ? "All Posts" : "Tum Yazilar"}
          </Link>
        </div>

        {loading && <div className="small-text">{locale === "en" ? "Loading..." : "Yukleniyor..."}</div>}
        {!loading && unavailable && (
          <div className="small-text">
            {locale === "en"
              ? "Blog service is temporarily unavailable on this environment."
              : "Blog servisi bu ortamda gecici olarak kullanilamiyor."}
          </div>
        )}
        {error && <div className="error">{error}</div>}

        {!loading && !error && !unavailable && (
          <div className="guest-fixture-list">
            {posts.length === 0 && (
              <div className="small-text">{locale === "en" ? "No posts found." : "Yazi bulunamadi."}</div>
            )}
            {posts.map((post) => (
              <article key={`post-${post.id}`} className="guest-fixture-item" style={{ alignItems: "flex-start" }}>
                <div>
                  <strong>{post.title}</strong>
                  <div className="small-text">{post.meta_description}</div>
                </div>
                <Link className="btn-secondary" to={`/${locale}/blog/${post.slug}`}>
                  {locale === "en" ? "Read" : "Oku"}
                </Link>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
