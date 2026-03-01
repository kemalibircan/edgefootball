import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import SeoHead from "../../components/seo/SeoHead";
import JsonLd from "../../components/seo/JsonLd";
import { getBlogCategories, getBlogPosts, hasEndpoint, isMissingEndpointError } from "../../lib/api";
import { normalizeLocale } from "../../lib/seo";

export default function BlogIndexPage() {
  const { locale: localeParam } = useParams();
  const locale = normalizeLocale(localeParam);

  const [posts, setPosts] = useState([]);
  const [categories, setCategories] = useState([]);
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
        const postsSupported = await hasEndpoint("/blog/posts", { unknownAs: true });
        if (!postsSupported) {
          if (!isMounted) return;
          setUnavailable(true);
          setPosts([]);
          setCategories([]);
          return;
        }

        const categoriesSupported = await hasEndpoint("/blog/categories", { unknownAs: true });
        const [postsPayload, categoriesPayload] = await Promise.all([
          getBlogPosts({ locale, page: 1, pageSize: 24 }),
          categoriesSupported ? getBlogCategories({ locale }) : Promise.resolve({ items: [] }),
        ]);

        if (!isMounted) return;
        setPosts(Array.isArray(postsPayload?.items) ? postsPayload.items : []);
        setCategories(Array.isArray(categoriesPayload?.items) ? categoriesPayload.items : []);
      } catch (err) {
        if (!isMounted) return;
        if (isMissingEndpointError(err)) {
          setUnavailable(true);
          setPosts([]);
          setCategories([]);
          return;
        }
        setError(String(err.message || "Failed to load blog."));
      } finally {
        if (!isMounted) return;
        setLoading(false);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [locale]);

  const title = locale === "en" ? "Football Blog | EdgeFootball" : "Futbol Blogu | EdgeFootball";
  const description =
    locale === "en"
      ? "Player profiles, tactical analysis, match prediction methods and league reviews."
      : "Oyuncu profilleri, taktik analiz, mac tahmin metodlari ve lig incelemeleri.";

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
      ],
    }),
    [locale],
  );

  return (
    <div className="container">
      <SeoHead
        title={title}
        description={description}
        locale={locale}
        canonicalPath={`/${locale}/blog`}
        trPath="/tr/blog"
        enPath="/en/blog"
        defaultPath="/tr/blog"
        ogType="website"
      />
      <JsonLd id="blog-breadcrumb" data={breadcrumbData} />

      <section className="card wide">
        <h2>{locale === "en" ? "Football Insights Blog" : "Futbol Icgoruleri Blogu"}</h2>
        <p className="small-text">{description}</p>

        {categories.length > 0 && (
          <div className="row wrap" style={{ gap: 8, marginBottom: 12 }}>
            {categories.map((category) => (
              <Link
                key={`category-${category.key}`}
                className="btn-secondary"
                to={`/${locale}/blog/category/${category.key}`}
              >
                {category.name}
              </Link>
            ))}
          </div>
        )}

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
                  <div className="small-text">{post.author_name || "-"}</div>
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
