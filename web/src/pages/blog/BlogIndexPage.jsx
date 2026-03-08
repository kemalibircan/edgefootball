import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import SeoHead from "../../components/seo/SeoHead";
import JsonLd from "../../components/seo/JsonLd";
import { getBlogCategories, getBlogPosts, getBlogTags, hasEndpoint, isMissingEndpointError } from "../../lib/api";
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

function computeReadingTimeFromExcerpt(text) {
  if (!text) return null;
  const words = String(text).split(/\s+/).filter(Boolean).length;
  if (!words) return null;
  const minutes = Math.max(1, Math.round(words / 200));
  return minutes;
}

export default function BlogIndexPage() {
  const { locale: localeParam } = useParams();
  const locale = normalizeLocale(localeParam);

  const [posts, setPosts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [tags, setTags] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [unavailable, setUnavailable] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("");
  const [activeTag, setActiveTag] = useState("");
  const [sortMode, setSortMode] = useState("newest");

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setError("");
    setUnavailable(false);
    setPage(1);

    (async () => {
      try {
        const postsSupported = await hasEndpoint("/blog/posts", { unknownAs: true });
        if (!postsSupported) {
          if (!isMounted) return;
          setUnavailable(true);
          setPosts([]);
          setCategories([]);
          setTags([]);
          return;
        }

        const [categoriesSupported, tagsSupported] = await Promise.all([
          hasEndpoint("/blog/categories", { unknownAs: true }),
          hasEndpoint("/blog/tags", { unknownAs: true }),
        ]);

        const [postsPayload, categoriesPayload, tagsPayload] = await Promise.all([
          getBlogPosts({ locale, page: 1, pageSize: 24 }),
          categoriesSupported ? getBlogCategories({ locale }) : Promise.resolve({ items: [] }),
          tagsSupported ? getBlogTags({ locale }) : Promise.resolve({ items: [] }),
        ]);

        if (!isMounted) return;
        const items = Array.isArray(postsPayload?.items) ? postsPayload.items : [];
        setPosts(items);
        setPage(postsPayload?.page || 1);
        setHasMore((postsPayload?.page || 1) < (postsPayload?.total_pages || 1));
        setCategories(Array.isArray(categoriesPayload?.items) ? categoriesPayload.items : []);
        setTags(Array.isArray(tagsPayload?.items) ? tagsPayload.items : []);
      } catch (err) {
        if (!isMounted) return;
        if (isMissingEndpointError(err)) {
          setUnavailable(true);
          setPosts([]);
          setCategories([]);
          setTags([]);
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

  async function handleLoadMore() {
    if (loading || !hasMore) return;
    const nextPage = page + 1;
    setLoading(true);
    setError("");
    try {
      const payload = await getBlogPosts({
        locale,
        page: nextPage,
        pageSize: 24,
        category: activeCategory || undefined,
        tag: activeTag || undefined,
      });
      const items = Array.isArray(payload?.items) ? payload.items : [];
      setPosts((prev) => [...prev, ...items]);
      setPage(payload?.page || nextPage);
      setHasMore((payload?.page || nextPage) < (payload?.total_pages || nextPage));
    } catch (err) {
      setError(String(err.message || "Failed to load more posts."));
    } finally {
      setLoading(false);
    }
  }

  function handleCategoryClick(key) {
    const next = activeCategory === key ? "" : key;
    setActiveCategory(next);
  }

  function handleTagClick(slug) {
    const next = activeTag === slug ? "" : slug;
    setActiveTag(next);
  }

  const title = locale === "en" ? "Football Blog | EdgeFootball" : "Futbol Blogu | EdgeFootball";
  const description =
    locale === "en"
      ? "Football analytics, xG-based match previews, AI-powered prediction methods, player profiles and data-led league analysis from EdgeFootball."
      : "EdgeFootball futbol blogu: xG tabanli mac önizlemeleri, yapay zeka destekli tahmin metodlari, oyuncu profilleri ve veri odakli lig analizleri.";

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

  const filteredAndSortedPosts = useMemo(() => {
    const query = search.trim().toLowerCase();
    let next = posts;

    if (activeCategory) {
      next = next.filter((post) => String(post.category_key || "").toLowerCase() === activeCategory);
    }
    if (activeTag) {
      next = next.filter((post) => Array.isArray(post.tags) && post.tags.includes(activeTag));
    }
    if (query) {
      next = next.filter((post) => {
        const haystack = `${post.title || ""} ${post.meta_description || ""} ${post.excerpt || ""}`.toLowerCase();
        return haystack.includes(query);
      });
    }

    const sorted = [...next];
    sorted.sort((a, b) => {
      const aDate = new Date(a.publish_date || a.updated_at || 0).getTime();
      const bDate = new Date(b.publish_date || b.updated_at || 0).getTime();
      if (sortMode === "oldest") return aDate - bDate;
      if (sortMode === "updated") {
        const aUpdated = new Date(a.updated_at || a.publish_date || 0).getTime();
        const bUpdated = new Date(b.updated_at || b.publish_date || 0).getTime();
        return bUpdated - aUpdated;
      }
      // newest
      return bDate - aDate;
    });
    return sorted;
  }, [activeCategory, activeTag, posts, search, sortMode]);

  const featuredPost = filteredAndSortedPosts[0] || null;
  const gridPosts = featuredPost ? filteredAndSortedPosts.slice(1) : filteredAndSortedPosts;

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

      <section className="glass-card" style={{ padding: 24, marginBottom: 24 }}>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
          <div style={{ flex: 2 }}>
            <h1 style={{ marginBottom: 8 }}>
              {locale === "en" ? "Football Insights Blog" : "Futbol İçgörüleri Blogu"}
            </h1>
            <p className="small-text" style={{ maxWidth: 640 }}>
              {description}
            </p>
          </div>
          <div style={{ flex: 1, maxWidth: 360 }}>
            <label className="small-text" style={{ display: "block", marginBottom: 4 }}>
              {locale === "en" ? "Search articles" : "Yazilarda ara"}
            </label>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={locale === "en" ? "xG, tactics, fixtures..." : "xG, taktik, fikstur..."}
              className="input"
              style={{ width: "100%" }}
              aria-label={locale === "en" ? "Search blog posts" : "Blog yazilarinda ara"}
            />
            <div
              className="row"
              style={{ marginTop: 8, gap: 8, justifyContent: "space-between", alignItems: "center" }}
            >
              <span className="small-text" style={{ opacity: 0.8 }}>
                {filteredAndSortedPosts.length}{" "}
                {locale === "en" ? "articles" : "yazi"}
              </span>
              <select
                value={sortMode}
                onChange={(e) => setSortMode(e.target.value)}
                className="input"
                style={{ maxWidth: 180 }}
                aria-label={locale === "en" ? "Sort articles" : "Yazilari sirala"}
              >
                <option value="newest">{locale === "en" ? "Newest" : "En yeni"}</option>
                <option value="updated">{locale === "en" ? "Recently updated" : "Güncel olanlar"}</option>
                <option value="oldest">{locale === "en" ? "Oldest" : "En eski"}</option>
              </select>
            </div>
          </div>
        </div>

        {(categories.length > 0 || tags.length > 0) && (
          <div style={{ marginTop: 16, display: "flex", flexWrap: "wrap", gap: 8 }}>
            {categories.map((category) => {
              const isActive = activeCategory === category.key;
              return (
                <button
                  key={`category-${category.key}`}
                  type="button"
                  className={isActive ? "pill pill-active" : "pill"}
                  onClick={() => handleCategoryClick(category.key)}
                >
                  {category.name}
                </button>
              );
            })}
            {tags.map((tag) => {
              const isActive = activeTag === tag.slug;
              return (
                <button
                  key={`tag-${tag.slug}`}
                  type="button"
                  className={isActive ? "pill pill-outline-active" : "pill pill-outline"}
                  onClick={() => handleTagClick(tag.slug)}
                >
                  #{tag.name}
                </button>
              );
            })}
          </div>
        )}
      </section>

      {loading && posts.length === 0 && (
        <div className="small-text">{locale === "en" ? "Loading..." : "Yükleniyor..."}</div>
      )}
      {!loading && unavailable && (
        <div className="small-text">
          {locale === "en"
            ? "Blog service is temporarily unavailable on this environment."
            : "Blog servisi bu ortamda geçici olarak kullanılamıyor."}
        </div>
      )}
      {error && <div className="error">{error}</div>}

      {!loading && !error && !unavailable && (
        <>
          {featuredPost && (
            <section className="glass-card" style={{ padding: 20, marginBottom: 24 }}>
              <div className="row" style={{ gap: 16, alignItems: "stretch", flexWrap: "wrap" }}>
                <div style={{ flex: 2, minWidth: 0 }}>
                  <div className="small-text" style={{ marginBottom: 4, textTransform: "uppercase", opacity: 0.8 }}>
                    {locale === "en" ? "Featured article" : "Öne çıkan yazi"}
                  </div>
                  <h2 style={{ marginBottom: 8 }}>{featuredPost.title}</h2>
                  <p className="small-text" style={{ marginBottom: 8 }}>
                    {featuredPost.meta_description}
                  </p>
                  <div className="small-text" style={{ opacity: 0.8, marginBottom: 12 }}>
                    {featuredPost.author_name || "-"} •{" "}
                    {formatDate(featuredPost.publish_date || featuredPost.updated_at)}{" "}
                    {(() => {
                      const minutes = computeReadingTimeFromExcerpt(
                        featuredPost.excerpt || featuredPost.meta_description,
                      );
                      if (!minutes) return null;
                      return ` • ${minutes} ${locale === "en" ? "min read" : "dk okuma"}`;
                    })()}
                  </div>
                  <Link className="btn-primary" to={`/${locale}/blog/${featuredPost.slug}`}>
                    {locale === "en" ? "Read article" : "Yaziyi oku"}
                  </Link>
                </div>
                {featuredPost.featured_image_url && (
                  <div
                    style={{
                      flex: 1,
                      minWidth: 220,
                      maxWidth: 360,
                      borderRadius: 16,
                      overflow: "hidden",
                    }}
                  >
                    <img
                      src={featuredPost.featured_image_url}
                      alt={featuredPost.title}
                      loading="lazy"
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                        display: "block",
                      }}
                    />
                  </div>
                )}
              </div>
            </section>
          )}

          <section style={{ marginBottom: 24 }}>
            {gridPosts.length === 0 && (
              <div className="small-text">{locale === "en" ? "No posts found." : "Yazi bulunamadı."}</div>
            )}
            {gridPosts.length > 0 && (
              <div
                className="blog-grid"
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                  gap: 16,
                }}
              >
                {gridPosts.map((post) => (
                  <article
                    key={`post-${post.id}`}
                    className="glass-card blog-card"
                    style={{
                      padding: 16,
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                      minHeight: 220,
                    }}
                  >
                    <div>
                      <div className="small-text" style={{ marginBottom: 4, opacity: 0.8 }}>
                        {formatDate(post.publish_date || post.updated_at)}
                      </div>
                      <h3 style={{ marginBottom: 8 }}>{post.title}</h3>
                      <p className="small-text" style={{ marginBottom: 12 }}>
                        {post.meta_description}
                      </p>
                    </div>
                    <div className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                      <div className="small-text" style={{ opacity: 0.8 }}>
                        {post.author_name || "-"}
                      </div>
                      <Link className="btn-secondary" to={`/${locale}/blog/${post.slug}`}>
                        {locale === "en" ? "Read" : "Oku"}
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          {hasMore && (
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 32 }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={handleLoadMore}
                disabled={loading}
              >
                {loading
                  ? locale === "en"
                    ? "Loading..."
                    : "Yükleniyor..."
                  : locale === "en"
                    ? "Load more"
                    : "Daha fazla yükle"}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
