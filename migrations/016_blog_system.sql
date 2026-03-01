BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS blog_categories (
    id SMALLSERIAL PRIMARY KEY,
    key TEXT NOT NULL UNIQUE,
    name_tr TEXT NOT NULL,
    name_en TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO blog_categories (key, name_tr, name_en) VALUES
('player-profiles', 'Oyuncu Profilleri', 'Player Profiles'),
('team-analysis', 'Takim Analizi', 'Team Analysis'),
('match-predictions', 'Mac Tahminleri', 'Match Predictions'),
('football-tactics', 'Futbol Taktikleri', 'Football Tactics'),
('league-reviews', 'Lig Incelemeleri', 'League Reviews')
ON CONFLICT (key) DO UPDATE
SET name_tr = EXCLUDED.name_tr,
    name_en = EXCLUDED.name_en;

CREATE TABLE IF NOT EXISTS blog_posts (
    id BIGSERIAL PRIMARY KEY,
    canonical_id UUID NOT NULL DEFAULT gen_random_uuid(),
    author_id BIGINT NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
    category_id SMALLINT NOT NULL REFERENCES blog_categories(id) ON DELETE RESTRICT,
    status TEXT NOT NULL DEFAULT 'draft',
    publish_date TIMESTAMPTZ,
    featured_image_url TEXT,
    is_featured BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_blog_posts_status CHECK (status IN ('draft', 'scheduled', 'published', 'archived')),
    CONSTRAINT uq_blog_posts_canonical UNIQUE (canonical_id)
);

CREATE INDEX IF NOT EXISTS idx_blog_posts_status_publish_date
    ON blog_posts (status, publish_date DESC);

CREATE INDEX IF NOT EXISTS idx_blog_posts_author_created
    ON blog_posts (author_id, created_at DESC);

CREATE TABLE IF NOT EXISTS blog_post_translations (
    id BIGSERIAL PRIMARY KEY,
    post_id BIGINT NOT NULL REFERENCES blog_posts(id) ON DELETE CASCADE,
    locale TEXT NOT NULL,
    title TEXT NOT NULL,
    slug TEXT NOT NULL,
    content_markdown TEXT NOT NULL,
    meta_title TEXT,
    meta_description TEXT NOT NULL,
    featured_image_url TEXT,
    excerpt TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_blog_post_translations_locale CHECK (locale IN ('tr', 'en')),
    CONSTRAINT uq_blog_post_translation_locale UNIQUE (post_id, locale),
    CONSTRAINT uq_blog_post_slug_locale UNIQUE (locale, slug)
);

CREATE INDEX IF NOT EXISTS idx_blog_post_translations_locale_slug
    ON blog_post_translations (locale, slug);

CREATE INDEX IF NOT EXISTS idx_blog_post_translations_post_locale
    ON blog_post_translations (post_id, locale);

CREATE TABLE IF NOT EXISTS blog_tags (
    id BIGSERIAL PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    name_tr TEXT NOT NULL,
    name_en TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS blog_post_tags (
    post_id BIGINT NOT NULL REFERENCES blog_posts(id) ON DELETE CASCADE,
    tag_id BIGINT NOT NULL REFERENCES blog_tags(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (post_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_blog_post_tags_tag_post
    ON blog_post_tags (tag_id, post_id);

CREATE TABLE IF NOT EXISTS blog_post_fixtures (
    post_id BIGINT NOT NULL REFERENCES blog_posts(id) ON DELETE CASCADE,
    fixture_id BIGINT NOT NULL,
    relation_type TEXT NOT NULL DEFAULT 'preview',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (post_id, fixture_id),
    CONSTRAINT chk_blog_post_fixture_relation_type CHECK (
        relation_type IN ('preview', 'review', 'tactical_breakdown')
    )
);

CREATE INDEX IF NOT EXISTS idx_blog_post_fixtures_fixture_post
    ON blog_post_fixtures (fixture_id, post_id);

COMMIT;
