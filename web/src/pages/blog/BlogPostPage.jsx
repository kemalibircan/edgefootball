import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import SeoHead from "../../components/seo/SeoHead";
import JsonLd from "../../components/seo/JsonLd";
import { getBlogPostDetail, hasEndpoint, isMissingEndpointError } from "../../lib/api";
import { normalizeLocale, toAbsoluteUrl } from "../../lib/seo";

export default function BlogPostPage() {
  const { locale: localeParam, slug } = useParams();
  const locale = normalizeLocale(localeParam);

  const [post, setPost] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [unavailable, setUnavailable] = useState(false);

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

  const title = String(post?.meta_title || post?.title || (locale === "en" ? "Blog Post" : "Blog Yazisi"));
  const description = String(post?.meta_description || (locale === "en" ? "Football blog post detail." : "Futbol blog yazisi detayi."));

  const trAlternate = post?.alternate_locales?.find((item) => item.locale === "tr");
  const enAlternate = post?.alternate_locales?.find((item) => item.locale === "en");

  const trPath = trAlternate?.slug ? `/tr/blog/${trAlternate.slug}` : locale === "tr" && post?.slug ? `/tr/blog/${post.slug}` : "/tr/blog";
  const enPath = enAlternate?.slug ? `/en/blog/${enAlternate.slug}` : locale === "en" && post?.slug ? `/en/blog/${post.slug}` : "/en/blog";

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

      <section className="card wide">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <h2>{post?.title || (locale === "en" ? "Blog Post" : "Blog Yazisi")}</h2>
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

        {!loading && !error && !unavailable && post && (
          <div>
            <div className="small-text" style={{ marginBottom: 12 }}>
              {(post.author_name || "-")} | {post.publish_date || "-"}
            </div>
            {post.featured_image_url && (
              <img
                src={post.featured_image_url}
                alt={post.title}
                style={{ width: "100%", borderRadius: 12, marginBottom: 12 }}
              />
            )}
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{String(post.content_markdown || "")}</ReactMarkdown>
          </div>
        )}
      </section>
    </div>
  );
}
