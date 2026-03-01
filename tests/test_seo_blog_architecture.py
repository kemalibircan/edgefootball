from fastapi import HTTPException

from app import blog, seo
from app.config import Settings


def test_seo_and_blog_router_paths_present():
    seo_paths = {getattr(route, "path", "") for route in seo.router.routes}
    blog_paths = {getattr(route, "path", "") for route in blog.router.routes}

    assert "/sitemap.xml" in seo_paths
    assert "/sitemaps/static.xml" in seo_paths
    assert "/sitemaps/fixtures.xml" in seo_paths
    assert "/sitemaps/predictions.xml" in seo_paths
    assert "/sitemaps/blog.xml" in seo_paths
    assert "/robots.txt" in seo_paths
    assert "/blog/posts" in blog_paths
    assert "/blog/posts/{slug}" in blog_paths
    assert "/blog/categories" in blog_paths
    assert "/blog/tags" in blog_paths


def test_robots_txt_contains_sitemap_and_private_disallows():
    settings = Settings(site_base_url="https://footballai.example")
    payload = seo.robots_txt(settings=settings)

    assert "User-agent: *" in payload
    assert "Disallow: /admin" in payload
    assert "Disallow: /auth" in payload
    assert "Sitemap: https://footballai.example/sitemap.xml" in payload


def test_blog_locale_validation_rejects_invalid_locale():
    try:
        blog._normalize_locale("de")
    except HTTPException as exc:
        assert exc.status_code == 400
    else:
        raise AssertionError("Expected HTTPException for invalid locale")


def test_blog_slugify_generates_ascii_slug():
    slug = blog._slugify("Galatasaray vs Fenerbahce: Derbi!")
    assert slug == "galatasaray-vs-fenerbahce-derbi"
