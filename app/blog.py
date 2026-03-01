from __future__ import annotations

import math
import unicodedata
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import bindparam, create_engine, text
from sqlalchemy.exc import IntegrityError

from app.admin import require_admin
from app.auth import AuthUser, ensure_auth_tables
from app.config import Settings, get_settings
from app.seo import invalidate_seo_cache

BLOG_CATEGORIES_TABLE = "blog_categories"
BLOG_POSTS_TABLE = "blog_posts"
BLOG_POST_TRANSLATIONS_TABLE = "blog_post_translations"
BLOG_TAGS_TABLE = "blog_tags"
BLOG_POST_TAGS_TABLE = "blog_post_tags"
BLOG_POST_FIXTURES_TABLE = "blog_post_fixtures"

VALID_LOCALES = {"tr", "en"}
VALID_STATUSES = {"draft", "scheduled", "published", "archived"}

BLOG_SEED_TAGS: dict[str, dict[str, str]] = {
    "messi": {"name_tr": "Messi", "name_en": "Messi"},
    "ronaldo": {"name_tr": "Ronaldo", "name_en": "Ronaldo"},
    "haaland": {"name_tr": "Haaland", "name_en": "Haaland"},
    "mbappe": {"name_tr": "Mbappe", "name_en": "Mbappe"},
    "tactics": {"name_tr": "Taktik", "name_en": "Tactics"},
    "formations": {"name_tr": "Formasyon", "name_en": "Formations"},
    "xg": {"name_tr": "xG", "name_en": "xG"},
    "analytics": {"name_tr": "Veri Analizi", "name_en": "Analytics"},
    "premier-league": {"name_tr": "Premier League", "name_en": "Premier League"},
    "super-lig": {"name_tr": "Super Lig", "name_en": "Super Lig"},
}

BLOG_SEED_POSTS: list[dict[str, Any]] = [
    {
        "category_key": "player-profiles",
        "days_ago": 2,
        "tags": ["messi", "analytics"],
        "translations": {
            "tr": {
                "title": "Lionel Messi Son Donem Oyun Evrimi",
                "slug": "lionel-messi-son-donem-oyun-evrimi",
                "meta_title": "Lionel Messi Oyun Evrimi",
                "meta_description": "Messi'nin son yillarda oyun kurulumunda ustlendigi rollerin veri odakli analizi.",
                "excerpt": "Messi'nin pas baglantilari ve bitiricilik dengesi.",
                "content_markdown": (
                    "## Messi'nin Son Donem Profili\n\n"
                    "Messi artik sadece bitirici degil, ayni zamanda pas akisini yoneten bir oyun kurucu.\n\n"
                    "- Ceza sahasi disi anahtar pas hacmi\n"
                    "- Yari alan degistirme etkisi\n"
                    "- Set hucumunda tempo kontrolu\n\n"
                    "Bu profil, yas ilerledikce karar kalitesinin nasil deger yarattigini gosteriyor."
                ),
            },
            "en": {
                "title": "Lionel Messi's Late-Career Playmaking Evolution",
                "slug": "lionel-messi-late-career-playmaking-evolution",
                "meta_title": "Lionel Messi Tactical Evolution",
                "meta_description": "A data-driven breakdown of Messi's transition from pure finisher to elite playmaking hub.",
                "excerpt": "How Messi balances chance creation and finishing output.",
                "content_markdown": (
                    "## Messi in the Current Phase\n\n"
                    "Messi now drives tempo and progression in addition to final-third finishing.\n\n"
                    "- High-value key-pass zones\n"
                    "- Half-space receiving patterns\n"
                    "- Set-possession control\n\n"
                    "The profile highlights decision quality as a late-career force multiplier."
                ),
            },
        },
    },
    {
        "category_key": "match-predictions",
        "days_ago": 4,
        "tags": ["xg", "analytics"],
        "translations": {
            "tr": {
                "title": "Mac Tahmininde xG ve Piyasa Orani Birlikte Nasil Okunur",
                "slug": "mac-tahmininde-xg-ve-piyasa-orani-nasil-okunur",
                "meta_title": "xG ve Oran ile Mac Tahmini",
                "meta_description": "xG metriklerini piyasa oranlariyla birlestirerek daha dengeli tahmin modeline gecis rehberi.",
                "excerpt": "Model olasiliklari ile market sinyallerini birlestirme.",
                "content_markdown": (
                    "## xG + Oran Yaklasimi\n\n"
                    "Tek kaynaga bagli tahminler kalibrasyon hatasi uretebilir.\n\n"
                    "1. xG tabanli beklenti dagilimini kur.\n"
                    "2. Piyasa oranindan implied probability cikar.\n"
                    "3. Agirlikli birlestirme ile final olasiligi hesapla.\n\n"
                    "Bu yontem, ozellikle hafta ici fiksturde surpriz varyansi dengeler."
                ),
            },
            "en": {
                "title": "How to Combine xG and Market Odds for Match Prediction",
                "slug": "combine-xg-and-market-odds-for-match-prediction",
                "meta_title": "xG + Market Odds Prediction Method",
                "meta_description": "A practical framework for blending model probabilities with market odds in football forecasting.",
                "excerpt": "Use model calibration and market signals together.",
                "content_markdown": (
                    "## Blending Model and Market\n\n"
                    "Single-source forecasts often drift under uncertainty.\n\n"
                    "1. Build baseline probabilities from xG.\n"
                    "2. Convert odds to implied probabilities.\n"
                    "3. Apply weighted calibration and validate weekly.\n\n"
                    "This approach improves stability in congested fixture periods."
                ),
            },
        },
    },
    {
        "category_key": "football-tactics",
        "days_ago": 6,
        "tags": ["tactics", "formations"],
        "translations": {
            "tr": {
                "title": "4-3-3 ve 4-2-3-1: Orta Sahada Kontrolu Ne Belirler",
                "slug": "4-3-3-ve-4-2-3-1-orta-sahada-kontrol",
                "meta_title": "4-3-3 vs 4-2-3-1 Taktik Karsilastirma",
                "meta_description": "Iki populer formasyonun pres tetikleyicileri ve merkez koridor kontrolu uzerinden analizi.",
                "excerpt": "Formasyon secimi yerine rol uyumu neden kritik.",
                "content_markdown": (
                    "## Formasyon Karsilastirmasi\n\n"
                    "4-3-3 genislikte ustunluk, 4-2-3-1 ise merkezde denge saglar.\n\n"
                    "- Beklerin yukselme zamani\n"
                    "- Cift pivotun pres kirma etkisi\n"
                    "- On numaranin ikinci forvet rolune kaymasi\n\n"
                    "Macin ritmi, kagit ustu formasyondan cok bu tetikleyicilerle belirlenir."
                ),
            },
            "en": {
                "title": "4-3-3 vs 4-2-3-1: What Decides Midfield Control",
                "slug": "4-3-3-vs-4-2-3-1-midfield-control",
                "meta_title": "4-3-3 vs 4-2-3-1 Tactical Guide",
                "meta_description": "Comparing two core systems through pressing triggers, spacing, and central-lane control.",
                "excerpt": "Roles and triggers matter more than formation labels.",
                "content_markdown": (
                    "## Tactical Matchup Principles\n\n"
                    "4-3-3 often wins width while 4-2-3-1 protects central transitions.\n\n"
                    "- Fullback timing and rest-defense shape\n"
                    "- Double pivot progression value\n"
                    "- No.10 occupation of half-spaces\n\n"
                    "The better trigger discipline usually wins midfield control."
                ),
            },
        },
    },
    {
        "category_key": "league-reviews",
        "days_ago": 8,
        "tags": ["premier-league", "super-lig"],
        "translations": {
            "tr": {
                "title": "Super Lig ve Premier League Tempo Karsilastirmasi",
                "slug": "super-lig-ve-premier-league-tempo-karsilastirmasi",
                "meta_title": "Super Lig ve Premier League Analizi",
                "meta_description": "Iki ligin tempo, gecis oyunu ve fiziksel temas yogunlugu acisindan karsilastirmali incelemesi.",
                "excerpt": "Tempo profili oyuncu adaptasyonunu nasil etkiliyor.",
                "content_markdown": (
                    "## Lig Profilleri\n\n"
                    "Premier League daha yuksek tempo ve daha sik gecis sekansi uretiyor.\n\n"
                    "- Topa sahip olma suresi\n"
                    "- Direkt atak frekansi\n"
                    "- Savunma cizgisi yuksekligi\n\n"
                    "Super Lig'de oyun kirilmalari daha belirgin oldugu icin momentum salinimi daha serttir."
                ),
            },
            "en": {
                "title": "Premier League vs Super Lig: Tempo and Transition Profile",
                "slug": "premier-league-vs-super-lig-tempo-transition-profile",
                "meta_title": "Premier League vs Super Lig Review",
                "meta_description": "A comparative review of tempo, transition frequency, and defensive line behavior across two leagues.",
                "excerpt": "Why league tempo changes player adaptation curves.",
                "content_markdown": (
                    "## Cross-League Style Comparison\n\n"
                    "The Premier League generally sustains higher pace with frequent transition bursts.\n\n"
                    "- Possession duration under pressure\n"
                    "- Direct attack frequency\n"
                    "- Defensive line aggression\n\n"
                    "Super Lig matches often swing harder in game-state momentum."
                ),
            },
        },
    },
    {
        "category_key": "team-analysis",
        "days_ago": 10,
        "tags": ["analytics", "tactics"],
        "translations": {
            "tr": {
                "title": "Baski Yogunlugu Yuksek Takimlar Neden Daha Cok Pozisyon Uretiyor",
                "slug": "baski-yogunlugu-yuksek-takimlar-neden-cok-pozisyon-uretiyor",
                "meta_title": "Takim Analizi: Baski ve Pozisyon Uretimi",
                "meta_description": "Yuksek pres yapan takimlarin top kazanma bolgesi ve sut kalitesi etkisini aciklayan analiz.",
                "excerpt": "Baski sadece savunma degil, hucum kalitesini de belirler.",
                "content_markdown": (
                    "## Pres ve Hucum Iliskisi\n\n"
                    "Ileri bolgede top kazanmak, daha kisa aksiyonla daha yuksek xG uretebilir.\n\n"
                    "- Kazanilan topun saha bolgesi\n"
                    "- Ilk 8 saniyedeki pas sayisi\n"
                    "- Sonuc aksiyonunun kalite katsayisi\n\n"
                    "Bu nedenle iyi pres yapan ekipler, sadece az gol yemez; daha iyi firsat da uretir."
                ),
            },
            "en": {
                "title": "Why High-Press Teams Generate Better Chances",
                "slug": "why-high-press-teams-generate-better-chances",
                "meta_title": "Team Analysis: Pressing and Chance Quality",
                "meta_description": "Explaining how high pressing improves ball-winning zones and shot quality in modern football.",
                "excerpt": "Pressing quality strongly shapes attacking output.",
                "content_markdown": (
                    "## Pressing as an Attacking Lever\n\n"
                    "Winning the ball high shortens distance to goal and raises expected chance value.\n\n"
                    "- Recovery zone profile\n"
                    "- Actions within the first 8 seconds\n"
                    "- Shot quality after regain\n\n"
                    "Strong pressing systems defend forward and attack with better context."
                ),
            },
        },
    },
]

router = APIRouter(tags=["blog"])
admin_router = APIRouter(prefix="/admin/blog", tags=["blog"])


class BlogTranslationInput(BaseModel):
    locale: str = Field(min_length=2, max_length=2)
    title: str = Field(min_length=3, max_length=220)
    slug: Optional[str] = Field(default=None, max_length=240)
    content_markdown: str = Field(min_length=1)
    meta_title: Optional[str] = Field(default=None, max_length=260)
    meta_description: str = Field(min_length=20, max_length=320)
    featured_image_url: Optional[str] = None
    excerpt: Optional[str] = None


class BlogPostCreateRequest(BaseModel):
    category_key: str = Field(min_length=3, max_length=120)
    status: str = Field(default="draft", min_length=5, max_length=16)
    publish_date: Optional[datetime] = None
    featured_image_url: Optional[str] = None
    is_featured: bool = False
    translations: list[BlogTranslationInput] = Field(default_factory=list)


class BlogPostUpdateRequest(BaseModel):
    category_key: Optional[str] = None
    publish_date: Optional[datetime] = None
    featured_image_url: Optional[str] = None
    is_featured: Optional[bool] = None


class BlogStatusUpdateRequest(BaseModel):
    status: str = Field(min_length=5, max_length=16)
    publish_date: Optional[datetime] = None


class BlogTagCreateRequest(BaseModel):
    slug: Optional[str] = Field(default=None, max_length=140)
    name_tr: str = Field(min_length=2, max_length=140)
    name_en: str = Field(min_length=2, max_length=140)


class BlogPostTagsReplaceRequest(BaseModel):
    tag_slugs: list[str] = Field(default_factory=list)


class BlogTranslationUpsertRequest(BaseModel):
    title: str = Field(min_length=3, max_length=220)
    slug: Optional[str] = Field(default=None, max_length=240)
    content_markdown: str = Field(min_length=1)
    meta_title: Optional[str] = Field(default=None, max_length=260)
    meta_description: str = Field(min_length=20, max_length=320)
    featured_image_url: Optional[str] = None
    excerpt: Optional[str] = None


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _to_iso(value: Any) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, datetime):
        dt = value if value.tzinfo else value.replace(tzinfo=timezone.utc)
        return dt.isoformat()
    text_value = str(value).strip()
    return text_value or None


def _normalize_locale(value: str) -> str:
    locale = str(value or "").strip().lower()
    if locale not in VALID_LOCALES:
        raise HTTPException(status_code=400, detail="locale must be 'tr' or 'en'.")
    return locale


def _normalize_status(value: str) -> str:
    status_value = str(value or "").strip().lower()
    if status_value not in VALID_STATUSES:
        allowed = ", ".join(sorted(VALID_STATUSES))
        raise HTTPException(status_code=400, detail=f"status must be one of: {allowed}")
    return status_value


def _slugify(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", str(value or "").strip())
    ascii_text = normalized.encode("ascii", "ignore").decode("ascii")
    lowered = ascii_text.lower()
    out: list[str] = []
    prev_dash = False
    for ch in lowered:
        if ch.isalnum():
            out.append(ch)
            prev_dash = False
        elif not prev_dash:
            out.append("-")
            prev_dash = True
    slug = "".join(out).strip("-")
    return slug or "post"


def ensure_blog_tables(engine) -> None:
    ensure_auth_tables(engine)
    try:
        with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as conn:
            conn.execute(text("CREATE EXTENSION IF NOT EXISTS pgcrypto"))
    except IntegrityError as exc:
        if "pg_extension_name_index" not in str(exc):
            raise

    with engine.begin() as conn:
        conn.execute(
            text(
                f"""
                CREATE TABLE IF NOT EXISTS {BLOG_CATEGORIES_TABLE} (
                    id SMALLSERIAL PRIMARY KEY,
                    key TEXT NOT NULL UNIQUE,
                    name_tr TEXT NOT NULL,
                    name_en TEXT NOT NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """
            )
        )
        conn.execute(
            text(
                f"""
                INSERT INTO {BLOG_CATEGORIES_TABLE} (key, name_tr, name_en) VALUES
                ('player-profiles', 'Oyuncu Profilleri', 'Player Profiles'),
                ('team-analysis', 'Takim Analizi', 'Team Analysis'),
                ('match-predictions', 'Mac Tahminleri', 'Match Predictions'),
                ('football-tactics', 'Futbol Taktikleri', 'Football Tactics'),
                ('league-reviews', 'Lig Incelemeleri', 'League Reviews')
                ON CONFLICT (key) DO UPDATE
                SET name_tr = EXCLUDED.name_tr,
                    name_en = EXCLUDED.name_en
                """
            )
        )
        conn.execute(
            text(
                f"""
                CREATE TABLE IF NOT EXISTS {BLOG_POSTS_TABLE} (
                    id BIGSERIAL PRIMARY KEY,
                    canonical_id UUID NOT NULL DEFAULT gen_random_uuid(),
                    author_id BIGINT NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
                    category_id SMALLINT NOT NULL REFERENCES {BLOG_CATEGORIES_TABLE}(id) ON DELETE RESTRICT,
                    status TEXT NOT NULL DEFAULT 'draft',
                    publish_date TIMESTAMPTZ,
                    featured_image_url TEXT,
                    is_featured BOOLEAN NOT NULL DEFAULT FALSE,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    CONSTRAINT chk_blog_posts_status CHECK (
                        status IN ('draft', 'scheduled', 'published', 'archived')
                    ),
                    CONSTRAINT uq_blog_posts_canonical UNIQUE (canonical_id)
                )
                """
            )
        )
        conn.execute(
            text(
                f"""
                CREATE INDEX IF NOT EXISTS idx_blog_posts_status_publish_date
                ON {BLOG_POSTS_TABLE} (status, publish_date DESC)
                """
            )
        )
        conn.execute(
            text(
                f"""
                CREATE INDEX IF NOT EXISTS idx_blog_posts_author_created
                ON {BLOG_POSTS_TABLE} (author_id, created_at DESC)
                """
            )
        )
        conn.execute(
            text(
                f"""
                CREATE TABLE IF NOT EXISTS {BLOG_POST_TRANSLATIONS_TABLE} (
                    id BIGSERIAL PRIMARY KEY,
                    post_id BIGINT NOT NULL REFERENCES {BLOG_POSTS_TABLE}(id) ON DELETE CASCADE,
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
                )
                """
            )
        )
        conn.execute(
            text(
                f"""
                CREATE INDEX IF NOT EXISTS idx_blog_post_translations_locale_slug
                ON {BLOG_POST_TRANSLATIONS_TABLE} (locale, slug)
                """
            )
        )
        conn.execute(
            text(
                f"""
                CREATE INDEX IF NOT EXISTS idx_blog_post_translations_post_locale
                ON {BLOG_POST_TRANSLATIONS_TABLE} (post_id, locale)
                """
            )
        )
        conn.execute(
            text(
                f"""
                CREATE TABLE IF NOT EXISTS {BLOG_TAGS_TABLE} (
                    id BIGSERIAL PRIMARY KEY,
                    slug TEXT NOT NULL UNIQUE,
                    name_tr TEXT NOT NULL,
                    name_en TEXT NOT NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """
            )
        )
        conn.execute(
            text(
                f"""
                CREATE TABLE IF NOT EXISTS {BLOG_POST_TAGS_TABLE} (
                    post_id BIGINT NOT NULL REFERENCES {BLOG_POSTS_TABLE}(id) ON DELETE CASCADE,
                    tag_id BIGINT NOT NULL REFERENCES {BLOG_TAGS_TABLE}(id) ON DELETE RESTRICT,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    PRIMARY KEY (post_id, tag_id)
                )
                """
            )
        )
        conn.execute(
            text(
                f"""
                CREATE INDEX IF NOT EXISTS idx_blog_post_tags_tag_post
                ON {BLOG_POST_TAGS_TABLE} (tag_id, post_id)
                """
            )
        )
        conn.execute(
            text(
                f"""
                CREATE TABLE IF NOT EXISTS {BLOG_POST_FIXTURES_TABLE} (
                    post_id BIGINT NOT NULL REFERENCES {BLOG_POSTS_TABLE}(id) ON DELETE CASCADE,
                    fixture_id BIGINT NOT NULL,
                    relation_type TEXT NOT NULL DEFAULT 'preview',
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    PRIMARY KEY (post_id, fixture_id),
                    CONSTRAINT chk_blog_post_fixture_relation_type CHECK (
                        relation_type IN ('preview', 'review', 'tactical_breakdown')
                    )
                )
                """
            )
        )
        conn.execute(
            text(
                f"""
                CREATE INDEX IF NOT EXISTS idx_blog_post_fixtures_fixture_post
                ON {BLOG_POST_FIXTURES_TABLE} (fixture_id, post_id)
                """
            )
        )


def _resolve_seed_author_id(conn, settings: Settings) -> Optional[int]:
    preferred_email = str(getattr(settings, "bootstrap_superadmin_email", "") or "").strip().lower()
    if preferred_email:
        row = conn.execute(
            text("SELECT id FROM app_users WHERE LOWER(email) = :email LIMIT 1"),
            {"email": preferred_email},
        ).mappings().first()
        if row and row.get("id"):
            return int(row["id"])

    row = conn.execute(
        text(
            """
            SELECT id
            FROM app_users
            WHERE role IN ('superadmin', 'admin')
            ORDER BY
                CASE WHEN is_active THEN 0 ELSE 1 END,
                id ASC
            LIMIT 1
            """
        )
    ).mappings().first()
    if row and row.get("id"):
        return int(row["id"])

    row = conn.execute(text("SELECT id FROM app_users ORDER BY id ASC LIMIT 1")).mappings().first()
    if row and row.get("id"):
        return int(row["id"])
    return None


def _ensure_blog_seed_content(conn, settings: Settings) -> None:
    if not bool(getattr(settings, "blog_auto_seed", True)):
        return

    existing_count = int(conn.execute(text(f"SELECT COUNT(*) FROM {BLOG_POSTS_TABLE}")).scalar_one() or 0)
    if existing_count > 0:
        return

    author_id = _resolve_seed_author_id(conn, settings)
    if author_id is None:
        return

    category_rows = conn.execute(
        text(f"SELECT id, key FROM {BLOG_CATEGORIES_TABLE}")
    ).mappings().all()
    category_by_key = {str(row.get("key") or ""): int(row.get("id") or 0) for row in category_rows}

    for slug, names in BLOG_SEED_TAGS.items():
        conn.execute(
            text(
                f"""
                INSERT INTO {BLOG_TAGS_TABLE} (slug, name_tr, name_en, created_at)
                VALUES (:slug, :name_tr, :name_en, :now_utc)
                ON CONFLICT (slug) DO UPDATE
                SET name_tr = EXCLUDED.name_tr,
                    name_en = EXCLUDED.name_en
                """
            ),
            {
                "slug": str(slug).strip().lower(),
                "name_tr": str(names.get("name_tr") or slug),
                "name_en": str(names.get("name_en") or slug),
                "now_utc": _utc_now(),
            },
        )

    tag_slugs = [str(key).strip().lower() for key in BLOG_SEED_TAGS.keys()]
    tag_by_slug: dict[str, int] = {}
    if tag_slugs:
        tag_query = (
            text(f"SELECT id, slug FROM {BLOG_TAGS_TABLE} WHERE slug IN :slugs")
            .bindparams(bindparam("slugs", expanding=True))
        )
        tag_rows = conn.execute(tag_query, {"slugs": tag_slugs}).mappings().all()
        tag_by_slug = {str(row.get("slug") or ""): int(row.get("id") or 0) for row in tag_rows}

    now = _utc_now()
    for seed_post in BLOG_SEED_POSTS:
        category_key = str(seed_post.get("category_key") or "").strip().lower()
        category_id = category_by_key.get(category_key)
        if not category_id:
            continue

        days_ago = int(seed_post.get("days_ago") or 0)
        publish_date = now - timedelta(days=max(0, days_ago))
        post_row = conn.execute(
            text(
                f"""
                INSERT INTO {BLOG_POSTS_TABLE} (
                    author_id,
                    category_id,
                    status,
                    publish_date,
                    featured_image_url,
                    is_featured,
                    created_at,
                    updated_at
                ) VALUES (
                    :author_id,
                    :category_id,
                    'published',
                    :publish_date,
                    NULL,
                    FALSE,
                    :now_utc,
                    :now_utc
                )
                RETURNING id
                """
            ),
            {
                "author_id": int(author_id),
                "category_id": int(category_id),
                "publish_date": publish_date,
                "now_utc": now,
            },
        ).mappings().first()
        if not post_row or not post_row.get("id"):
            continue
        post_id = int(post_row["id"])

        translations = seed_post.get("translations") or {}
        for locale, translation in translations.items():
            locale_value = str(locale).strip().lower()
            if locale_value not in VALID_LOCALES:
                continue
            title = str(translation.get("title") or "").strip()
            if not title:
                continue
            resolved_slug = _resolve_unique_slug(
                conn,
                locale=locale_value,
                requested_slug=str(translation.get("slug") or "").strip() or None,
                title=title,
                exclude_post_id=post_id,
            )
            conn.execute(
                text(
                    f"""
                    INSERT INTO {BLOG_POST_TRANSLATIONS_TABLE} (
                        post_id,
                        locale,
                        title,
                        slug,
                        content_markdown,
                        meta_title,
                        meta_description,
                        featured_image_url,
                        excerpt,
                        created_at,
                        updated_at
                    ) VALUES (
                        :post_id,
                        :locale,
                        :title,
                        :slug,
                        :content_markdown,
                        :meta_title,
                        :meta_description,
                        NULL,
                        :excerpt,
                        :now_utc,
                        :now_utc
                    )
                    ON CONFLICT (post_id, locale) DO UPDATE
                    SET title = EXCLUDED.title,
                        slug = EXCLUDED.slug,
                        content_markdown = EXCLUDED.content_markdown,
                        meta_title = EXCLUDED.meta_title,
                        meta_description = EXCLUDED.meta_description,
                        excerpt = EXCLUDED.excerpt,
                        updated_at = EXCLUDED.updated_at
                    """
                ),
                {
                    "post_id": int(post_id),
                    "locale": locale_value,
                    "title": title,
                    "slug": resolved_slug,
                    "content_markdown": str(translation.get("content_markdown") or "").strip(),
                    "meta_title": str(translation.get("meta_title") or "").strip() or None,
                    "meta_description": str(translation.get("meta_description") or "").strip(),
                    "excerpt": str(translation.get("excerpt") or "").strip() or None,
                    "now_utc": now,
                },
            )

        for tag_slug in seed_post.get("tags") or []:
            safe_tag_slug = str(tag_slug or "").strip().lower()
            tag_id = tag_by_slug.get(safe_tag_slug)
            if not tag_id:
                continue
            conn.execute(
                text(
                    f"""
                    INSERT INTO {BLOG_POST_TAGS_TABLE} (post_id, tag_id, created_at)
                    VALUES (:post_id, :tag_id, :now_utc)
                    ON CONFLICT (post_id, tag_id) DO NOTHING
                    """
                ),
                {
                    "post_id": int(post_id),
                    "tag_id": int(tag_id),
                    "now_utc": now,
                },
            )


def _resolve_category_id(conn, category_key: str) -> int:
    key = str(category_key or "").strip().lower()
    row = conn.execute(
        text(f"SELECT id FROM {BLOG_CATEGORIES_TABLE} WHERE key = :key LIMIT 1"),
        {"key": key},
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=400, detail=f"Unknown category_key: {category_key}")
    return int(row["id"])


def _slug_exists(conn, *, locale: str, slug: str, exclude_post_id: Optional[int]) -> bool:
    row = conn.execute(
        text(
            f"""
            SELECT post_id
            FROM {BLOG_POST_TRANSLATIONS_TABLE}
            WHERE locale = :locale AND slug = :slug
            LIMIT 1
            """
        ),
        {"locale": locale, "slug": slug},
    ).mappings().first()
    if not row:
        return False
    if exclude_post_id is not None and int(row.get("post_id") or 0) == int(exclude_post_id):
        return False
    return True


def _resolve_unique_slug(
    conn,
    *,
    locale: str,
    requested_slug: Optional[str],
    title: str,
    exclude_post_id: Optional[int] = None,
) -> str:
    base_slug = _slugify(requested_slug or title)
    candidate = base_slug
    suffix = 2
    while _slug_exists(conn, locale=locale, slug=candidate, exclude_post_id=exclude_post_id):
        candidate = f"{base_slug}-{suffix}"
        suffix += 1
    return candidate


def _extract_post_tags(conn, post_ids: list[int], locale: str) -> dict[int, list[str]]:
    if not post_ids:
        return {}

    query = (
        text(
            f"""
            SELECT pt.post_id,
                   CASE WHEN :locale = 'en' THEN t.name_en ELSE t.name_tr END AS tag_name
            FROM {BLOG_POST_TAGS_TABLE} pt
            JOIN {BLOG_TAGS_TABLE} t ON t.id = pt.tag_id
            WHERE pt.post_id IN :post_ids
            ORDER BY pt.post_id ASC, t.slug ASC
            """
        )
        .bindparams(bindparam("post_ids", expanding=True))
    )
    rows = conn.execute(query, {"locale": locale, "post_ids": post_ids}).mappings().all()
    out: dict[int, list[str]] = {}
    for row in rows:
        post_id = int(row.get("post_id") or 0)
        out.setdefault(post_id, []).append(str(row.get("tag_name") or ""))
    return out


@router.get("/blog/categories")
def blog_categories(locale: str = "tr", settings: Settings = Depends(get_settings)):
    locale_norm = _normalize_locale(locale)
    engine = create_engine(settings.db_url)
    ensure_blog_tables(engine)
    with engine.begin() as conn:
        _ensure_blog_seed_content(conn, settings)

    query = text(
        f"""
        SELECT id, key,
               CASE WHEN :locale = 'en' THEN name_en ELSE name_tr END AS name
        FROM {BLOG_CATEGORIES_TABLE}
        ORDER BY id ASC
        """
    )

    with engine.connect() as conn:
        rows = conn.execute(query, {"locale": locale_norm}).mappings().all()

    return {
        "locale": locale_norm,
        "items": [
            {
                "id": int(row.get("id") or 0),
                "key": row.get("key"),
                "name": row.get("name"),
            }
            for row in rows
        ],
    }


@router.get("/blog/tags")
def blog_tags(locale: str = "tr", settings: Settings = Depends(get_settings)):
    locale_norm = _normalize_locale(locale)
    engine = create_engine(settings.db_url)
    ensure_blog_tables(engine)
    with engine.begin() as conn:
        _ensure_blog_seed_content(conn, settings)

    query = text(
        f"""
        SELECT id, slug,
               CASE WHEN :locale = 'en' THEN name_en ELSE name_tr END AS name
        FROM {BLOG_TAGS_TABLE}
        ORDER BY slug ASC
        """
    )

    with engine.connect() as conn:
        rows = conn.execute(query, {"locale": locale_norm}).mappings().all()

    return {
        "locale": locale_norm,
        "items": [
            {
                "id": int(row.get("id") or 0),
                "slug": row.get("slug"),
                "name": row.get("name"),
            }
            for row in rows
        ],
    }


@router.get("/blog/posts")
def list_blog_posts(
    locale: str = "tr",
    category: Optional[str] = None,
    tag: Optional[str] = None,
    page: int = 1,
    page_size: int = 12,
    settings: Settings = Depends(get_settings),
):
    locale_norm = _normalize_locale(locale)
    safe_page = max(1, int(page))
    safe_page_size = max(1, min(int(page_size), 50))
    offset_rows = (safe_page - 1) * safe_page_size

    engine = create_engine(settings.db_url)
    ensure_blog_tables(engine)

    where_parts = [
        "t.locale = :locale",
        "p.status = 'published'",
        "(p.publish_date IS NULL OR p.publish_date <= :now_utc)",
    ]
    params: dict[str, Any] = {
        "locale": locale_norm,
        "now_utc": _utc_now(),
        "limit_rows": safe_page_size,
        "offset_rows": offset_rows,
    }

    if category:
        where_parts.append("c.key = :category_key")
        params["category_key"] = str(category or "").strip().lower()

    if tag:
        where_parts.append(
            f"""
            EXISTS (
                SELECT 1
                FROM {BLOG_POST_TAGS_TABLE} pt
                JOIN {BLOG_TAGS_TABLE} tg ON tg.id = pt.tag_id
                WHERE pt.post_id = p.id AND tg.slug = :tag_slug
            )
            """
        )
        params["tag_slug"] = str(tag or "").strip().lower()

    where_clause = " AND ".join(f"({item})" for item in where_parts)

    count_sql = text(
        f"""
        SELECT COUNT(*)
        FROM {BLOG_POSTS_TABLE} p
        JOIN {BLOG_POST_TRANSLATIONS_TABLE} t ON t.post_id = p.id
        JOIN {BLOG_CATEGORIES_TABLE} c ON c.id = p.category_id
        WHERE {where_clause}
        """
    )
    rows_sql = text(
        f"""
        SELECT
            p.id,
            p.canonical_id,
            p.publish_date,
            p.updated_at AS post_updated_at,
            p.featured_image_url AS post_featured_image,
            c.key AS category_key,
            u.username AS author_name,
            t.locale,
            t.slug,
            t.title,
            t.excerpt,
            t.meta_description,
            t.featured_image_url,
            t.updated_at AS translation_updated_at
        FROM {BLOG_POSTS_TABLE} p
        JOIN {BLOG_POST_TRANSLATIONS_TABLE} t ON t.post_id = p.id
        JOIN {BLOG_CATEGORIES_TABLE} c ON c.id = p.category_id
        JOIN app_users u ON u.id = p.author_id
        WHERE {where_clause}
        ORDER BY COALESCE(p.publish_date, p.created_at) DESC, p.id DESC
        LIMIT :limit_rows OFFSET :offset_rows
        """
    )

    with engine.begin() as conn:
        _ensure_blog_seed_content(conn, settings)
        total = int(conn.execute(count_sql, params).scalar_one() or 0)
        rows = conn.execute(rows_sql, params).mappings().all()
        post_ids = [int(row.get("id") or 0) for row in rows]
        tags_map = _extract_post_tags(conn, post_ids, locale_norm)

    items: list[dict[str, Any]] = []
    for row in rows:
        post_id = int(row.get("id") or 0)
        updated_at = _to_iso(row.get("translation_updated_at") or row.get("post_updated_at"))
        items.append(
            {
                "id": post_id,
                "canonical_id": str(row.get("canonical_id") or ""),
                "locale": locale_norm,
                "slug": row.get("slug"),
                "title": row.get("title"),
                "excerpt": row.get("excerpt"),
                "meta_description": row.get("meta_description"),
                "featured_image_url": row.get("featured_image_url") or row.get("post_featured_image"),
                "category_key": row.get("category_key"),
                "tags": tags_map.get(post_id, []),
                "author_name": row.get("author_name"),
                "publish_date": _to_iso(row.get("publish_date")),
                "updated_at": updated_at,
            }
        )

    total_pages = max(1, math.ceil(total / safe_page_size)) if total else 1
    return {
        "page": safe_page,
        "page_size": safe_page_size,
        "total": total,
        "total_pages": total_pages,
        "items": items,
    }


@router.get("/blog/posts/{slug}")
def blog_post_detail(slug: str, locale: str = "tr", settings: Settings = Depends(get_settings)):
    locale_norm = _normalize_locale(locale)
    slug_norm = _slugify(slug)

    engine = create_engine(settings.db_url)
    ensure_blog_tables(engine)

    detail_sql = text(
        f"""
        SELECT
            p.id,
            p.canonical_id,
            p.publish_date,
            p.updated_at AS post_updated_at,
            p.featured_image_url AS post_featured_image,
            c.key AS category_key,
            u.username AS author_name,
            t.locale,
            t.slug,
            t.title,
            t.content_markdown,
            t.meta_title,
            t.meta_description,
            t.featured_image_url,
            t.excerpt,
            t.updated_at AS translation_updated_at
        FROM {BLOG_POSTS_TABLE} p
        JOIN {BLOG_POST_TRANSLATIONS_TABLE} t ON t.post_id = p.id
        JOIN {BLOG_CATEGORIES_TABLE} c ON c.id = p.category_id
        JOIN app_users u ON u.id = p.author_id
        WHERE t.locale = :locale
          AND t.slug = :slug
          AND p.status = 'published'
          AND (p.publish_date IS NULL OR p.publish_date <= :now_utc)
        LIMIT 1
        """
    )
    alternate_sql = text(
        f"""
        SELECT locale, slug
        FROM {BLOG_POST_TRANSLATIONS_TABLE}
        WHERE post_id = :post_id
        ORDER BY locale ASC
        """
    )
    related_sql = text(
        f"""
        SELECT fixture_id
        FROM {BLOG_POST_FIXTURES_TABLE}
        WHERE post_id = :post_id
        ORDER BY fixture_id ASC
        """
    )

    with engine.begin() as conn:
        _ensure_blog_seed_content(conn, settings)
        row = conn.execute(
            detail_sql,
            {
                "locale": locale_norm,
                "slug": slug_norm,
                "now_utc": _utc_now(),
            },
        ).mappings().first()

        if not row:
            raise HTTPException(status_code=404, detail="Blog post not found.")

        post_id = int(row.get("id") or 0)
        alternates = conn.execute(alternate_sql, {"post_id": post_id}).mappings().all()
        related_rows = conn.execute(related_sql, {"post_id": post_id}).mappings().all()
        tags_map = _extract_post_tags(conn, [post_id], locale_norm)

    alternate_locales: list[dict[str, str]] = []
    base_url = str(settings.site_base_url or "http://localhost:3001").rstrip("/")
    for item in alternates:
        item_locale = str(item.get("locale") or "").strip().lower()
        item_slug = str(item.get("slug") or "").strip()
        if item_locale not in VALID_LOCALES or not item_slug:
            continue
        alternate_locales.append(
            {
                "locale": item_locale,
                "slug": item_slug,
                "url": f"{base_url}/{item_locale}/blog/{item_slug}",
            }
        )

    updated_at = _to_iso(row.get("translation_updated_at") or row.get("post_updated_at"))
    return {
        "id": post_id,
        "canonical_id": str(row.get("canonical_id") or ""),
        "locale": locale_norm,
        "slug": row.get("slug"),
        "title": row.get("title"),
        "excerpt": row.get("excerpt"),
        "meta_description": row.get("meta_description"),
        "featured_image_url": row.get("featured_image_url") or row.get("post_featured_image"),
        "category_key": row.get("category_key"),
        "tags": tags_map.get(post_id, []),
        "author_name": row.get("author_name"),
        "publish_date": _to_iso(row.get("publish_date")),
        "updated_at": updated_at,
        "content_markdown": row.get("content_markdown"),
        "meta_title": row.get("meta_title"),
        "alternate_locales": alternate_locales,
        "related_fixture_ids": [int(item.get("fixture_id") or 0) for item in related_rows if item.get("fixture_id")],
    }


def _upsert_translation(
    conn,
    *,
    post_id: int,
    locale: str,
    title: str,
    requested_slug: Optional[str],
    content_markdown: str,
    meta_title: Optional[str],
    meta_description: str,
    featured_image_url: Optional[str],
    excerpt: Optional[str],
) -> dict[str, Any]:
    resolved_locale = _normalize_locale(locale)
    resolved_slug = _resolve_unique_slug(
        conn,
        locale=resolved_locale,
        requested_slug=requested_slug,
        title=title,
        exclude_post_id=int(post_id),
    )

    row = conn.execute(
        text(
            f"""
            INSERT INTO {BLOG_POST_TRANSLATIONS_TABLE} (
                post_id,
                locale,
                title,
                slug,
                content_markdown,
                meta_title,
                meta_description,
                featured_image_url,
                excerpt,
                created_at,
                updated_at
            ) VALUES (
                :post_id,
                :locale,
                :title,
                :slug,
                :content_markdown,
                :meta_title,
                :meta_description,
                :featured_image_url,
                :excerpt,
                :now_utc,
                :now_utc
            )
            ON CONFLICT (post_id, locale) DO UPDATE
            SET title = EXCLUDED.title,
                slug = EXCLUDED.slug,
                content_markdown = EXCLUDED.content_markdown,
                meta_title = EXCLUDED.meta_title,
                meta_description = EXCLUDED.meta_description,
                featured_image_url = EXCLUDED.featured_image_url,
                excerpt = EXCLUDED.excerpt,
                updated_at = EXCLUDED.updated_at
            RETURNING id, post_id, locale, title, slug, updated_at
            """
        ),
        {
            "post_id": int(post_id),
            "locale": resolved_locale,
            "title": str(title or "").strip(),
            "slug": resolved_slug,
            "content_markdown": str(content_markdown or "").strip(),
            "meta_title": str(meta_title or "").strip() or None,
            "meta_description": str(meta_description or "").strip(),
            "featured_image_url": str(featured_image_url or "").strip() or None,
            "excerpt": str(excerpt or "").strip() or None,
            "now_utc": _utc_now(),
        },
    ).mappings().first()

    return dict(row or {})


@admin_router.post("/posts")
def create_blog_post(
    request: BlogPostCreateRequest,
    settings: Settings = Depends(get_settings),
    current_user: AuthUser = Depends(require_admin),
):
    status_value = _normalize_status(request.status)
    publish_date = request.publish_date
    if status_value == "published" and publish_date is None:
        publish_date = _utc_now()

    engine = create_engine(settings.db_url)
    ensure_blog_tables(engine)

    try:
        with engine.begin() as conn:
            category_id = _resolve_category_id(conn, request.category_key)
            post_row = conn.execute(
                text(
                    f"""
                    INSERT INTO {BLOG_POSTS_TABLE} (
                        author_id,
                        category_id,
                        status,
                        publish_date,
                        featured_image_url,
                        is_featured,
                        created_at,
                        updated_at
                    ) VALUES (
                        :author_id,
                        :category_id,
                        :status,
                        :publish_date,
                        :featured_image_url,
                        :is_featured,
                        :now_utc,
                        :now_utc
                    )
                    RETURNING id, canonical_id
                    """
                ),
                {
                    "author_id": int(current_user.id),
                    "category_id": int(category_id),
                    "status": status_value,
                    "publish_date": publish_date,
                    "featured_image_url": str(request.featured_image_url or "").strip() or None,
                    "is_featured": bool(request.is_featured),
                    "now_utc": _utc_now(),
                },
            ).mappings().first()

            if not post_row:
                raise HTTPException(status_code=500, detail="Failed to create blog post.")

            post_id = int(post_row["id"])
            translation_rows: list[dict[str, Any]] = []
            for item in request.translations:
                translation_rows.append(
                    _upsert_translation(
                        conn,
                        post_id=post_id,
                        locale=item.locale,
                        title=item.title,
                        requested_slug=item.slug,
                        content_markdown=item.content_markdown,
                        meta_title=item.meta_title,
                        meta_description=item.meta_description,
                        featured_image_url=item.featured_image_url,
                        excerpt=item.excerpt,
                    )
                )

    except IntegrityError as exc:
        raise HTTPException(status_code=409, detail=f"Blog post create conflict: {exc}") from exc

    invalidate_seo_cache("sitemap:")
    return {
        "id": int(post_row["id"]),
        "canonical_id": str(post_row["canonical_id"]),
        "status": status_value,
        "translation_count": len(request.translations),
    }


@admin_router.put("/posts/{post_id}")
def update_blog_post(
    post_id: int,
    request: BlogPostUpdateRequest,
    settings: Settings = Depends(get_settings),
    current_user: AuthUser = Depends(require_admin),
):
    if int(post_id) <= 0:
        raise HTTPException(status_code=400, detail="post_id must be positive.")

    engine = create_engine(settings.db_url)
    ensure_blog_tables(engine)

    updates: list[str] = []
    params: dict[str, Any] = {
        "post_id": int(post_id),
        "now_utc": _utc_now(),
    }

    with engine.begin() as conn:
        exists = conn.execute(
            text(f"SELECT id FROM {BLOG_POSTS_TABLE} WHERE id = :post_id LIMIT 1"),
            {"post_id": int(post_id)},
        ).mappings().first()
        if not exists:
            raise HTTPException(status_code=404, detail="Blog post not found.")

        if request.category_key is not None:
            params["category_id"] = _resolve_category_id(conn, request.category_key)
            updates.append("category_id = :category_id")
        if request.publish_date is not None:
            params["publish_date"] = request.publish_date
            updates.append("publish_date = :publish_date")
        if request.featured_image_url is not None:
            params["featured_image_url"] = str(request.featured_image_url or "").strip() or None
            updates.append("featured_image_url = :featured_image_url")
        if request.is_featured is not None:
            params["is_featured"] = bool(request.is_featured)
            updates.append("is_featured = :is_featured")

        if not updates:
            raise HTTPException(status_code=400, detail="No update fields provided.")

        updates.append("updated_at = :now_utc")
        row = conn.execute(
            text(
                f"""
                UPDATE {BLOG_POSTS_TABLE}
                SET {", ".join(updates)}
                WHERE id = :post_id
                RETURNING id, status, publish_date, updated_at
                """
            ),
            params,
        ).mappings().first()

    invalidate_seo_cache("sitemap:")
    return {
        "id": int(row.get("id") or 0),
        "status": row.get("status"),
        "publish_date": _to_iso(row.get("publish_date")),
        "updated_at": _to_iso(row.get("updated_at")),
    }


@admin_router.put("/posts/{post_id}/translations/{locale}")
def upsert_blog_translation(
    post_id: int,
    locale: str,
    request: BlogTranslationUpsertRequest,
    settings: Settings = Depends(get_settings),
    current_user: AuthUser = Depends(require_admin),
):
    if int(post_id) <= 0:
        raise HTTPException(status_code=400, detail="post_id must be positive.")
    locale_norm = _normalize_locale(locale)

    engine = create_engine(settings.db_url)
    ensure_blog_tables(engine)

    try:
        with engine.begin() as conn:
            exists = conn.execute(
                text(f"SELECT id FROM {BLOG_POSTS_TABLE} WHERE id = :post_id LIMIT 1"),
                {"post_id": int(post_id)},
            ).mappings().first()
            if not exists:
                raise HTTPException(status_code=404, detail="Blog post not found.")

            row = _upsert_translation(
                conn,
                post_id=int(post_id),
                locale=locale_norm,
                title=request.title,
                requested_slug=request.slug,
                content_markdown=request.content_markdown,
                meta_title=request.meta_title,
                meta_description=request.meta_description,
                featured_image_url=request.featured_image_url,
                excerpt=request.excerpt,
            )

            conn.execute(
                text(
                    f"""
                    UPDATE {BLOG_POSTS_TABLE}
                    SET updated_at = :now_utc
                    WHERE id = :post_id
                    """
                ),
                {"post_id": int(post_id), "now_utc": _utc_now()},
            )

    except IntegrityError as exc:
        raise HTTPException(status_code=409, detail=f"Translation conflict: {exc}") from exc

    invalidate_seo_cache("sitemap:")
    return {
        "id": int(row.get("id") or 0),
        "post_id": int(row.get("post_id") or 0),
        "locale": row.get("locale"),
        "title": row.get("title"),
        "slug": row.get("slug"),
        "updated_at": _to_iso(row.get("updated_at")),
    }


@admin_router.patch("/posts/{post_id}/status")
def update_blog_post_status(
    post_id: int,
    request: BlogStatusUpdateRequest,
    settings: Settings = Depends(get_settings),
    current_user: AuthUser = Depends(require_admin),
):
    if int(post_id) <= 0:
        raise HTTPException(status_code=400, detail="post_id must be positive.")

    status_value = _normalize_status(request.status)
    publish_date = request.publish_date
    if status_value == "published" and publish_date is None:
        publish_date = _utc_now()

    engine = create_engine(settings.db_url)
    ensure_blog_tables(engine)

    with engine.begin() as conn:
        row = conn.execute(
            text(
                f"""
                UPDATE {BLOG_POSTS_TABLE}
                SET status = :status,
                    publish_date = :publish_date,
                    updated_at = :now_utc
                WHERE id = :post_id
                RETURNING id, status, publish_date, updated_at
                """
            ),
            {
                "post_id": int(post_id),
                "status": status_value,
                "publish_date": publish_date,
                "now_utc": _utc_now(),
            },
        ).mappings().first()

    if not row:
        raise HTTPException(status_code=404, detail="Blog post not found.")

    invalidate_seo_cache("sitemap:")
    return {
        "id": int(row.get("id") or 0),
        "status": row.get("status"),
        "publish_date": _to_iso(row.get("publish_date")),
        "updated_at": _to_iso(row.get("updated_at")),
    }


@admin_router.delete("/posts/{post_id}")
def archive_blog_post(
    post_id: int,
    settings: Settings = Depends(get_settings),
    current_user: AuthUser = Depends(require_admin),
):
    if int(post_id) <= 0:
        raise HTTPException(status_code=400, detail="post_id must be positive.")

    engine = create_engine(settings.db_url)
    ensure_blog_tables(engine)

    with engine.begin() as conn:
        row = conn.execute(
            text(
                f"""
                UPDATE {BLOG_POSTS_TABLE}
                SET status = 'archived',
                    updated_at = :now_utc
                WHERE id = :post_id
                RETURNING id, status, updated_at
                """
            ),
            {
                "post_id": int(post_id),
                "now_utc": _utc_now(),
            },
        ).mappings().first()

    if not row:
        raise HTTPException(status_code=404, detail="Blog post not found.")

    invalidate_seo_cache("sitemap:")
    return {
        "id": int(row.get("id") or 0),
        "status": row.get("status"),
        "updated_at": _to_iso(row.get("updated_at")),
    }


@admin_router.post("/tags")
def create_blog_tag(
    request: BlogTagCreateRequest,
    settings: Settings = Depends(get_settings),
    current_user: AuthUser = Depends(require_admin),
):
    engine = create_engine(settings.db_url)
    ensure_blog_tables(engine)

    slug = _slugify(request.slug or request.name_en or request.name_tr)

    with engine.begin() as conn:
        row = conn.execute(
            text(
                f"""
                INSERT INTO {BLOG_TAGS_TABLE} (slug, name_tr, name_en, created_at)
                VALUES (:slug, :name_tr, :name_en, :now_utc)
                ON CONFLICT (slug) DO UPDATE
                SET name_tr = EXCLUDED.name_tr,
                    name_en = EXCLUDED.name_en
                RETURNING id, slug, name_tr, name_en
                """
            ),
            {
                "slug": slug,
                "name_tr": str(request.name_tr or "").strip(),
                "name_en": str(request.name_en or "").strip(),
                "now_utc": _utc_now(),
            },
        ).mappings().first()

    return {
        "id": int(row.get("id") or 0),
        "slug": row.get("slug"),
        "name_tr": row.get("name_tr"),
        "name_en": row.get("name_en"),
    }


@admin_router.put("/posts/{post_id}/tags")
def replace_blog_post_tags(
    post_id: int,
    request: BlogPostTagsReplaceRequest,
    settings: Settings = Depends(get_settings),
    current_user: AuthUser = Depends(require_admin),
):
    if int(post_id) <= 0:
        raise HTTPException(status_code=400, detail="post_id must be positive.")

    normalized_slugs: list[str] = []
    seen: set[str] = set()
    for raw in request.tag_slugs:
        slug = _slugify(raw)
        if not slug or slug in seen:
            continue
        seen.add(slug)
        normalized_slugs.append(slug)

    engine = create_engine(settings.db_url)
    ensure_blog_tables(engine)

    with engine.begin() as conn:
        exists = conn.execute(
            text(f"SELECT id FROM {BLOG_POSTS_TABLE} WHERE id = :post_id LIMIT 1"),
            {"post_id": int(post_id)},
        ).mappings().first()
        if not exists:
            raise HTTPException(status_code=404, detail="Blog post not found.")

        tag_ids: list[int] = []
        if normalized_slugs:
            query = (
                text(
                    f"""
                    SELECT id, slug
                    FROM {BLOG_TAGS_TABLE}
                    WHERE slug IN :slugs
                    """
                )
                .bindparams(bindparam("slugs", expanding=True))
            )
            rows = conn.execute(query, {"slugs": normalized_slugs}).mappings().all()
            found_map = {str(item.get("slug") or ""): int(item.get("id") or 0) for item in rows}
            missing = [slug for slug in normalized_slugs if slug not in found_map]
            if missing:
                raise HTTPException(status_code=400, detail=f"Unknown tag slugs: {', '.join(missing)}")
            tag_ids = [found_map[slug] for slug in normalized_slugs]

        conn.execute(
            text(f"DELETE FROM {BLOG_POST_TAGS_TABLE} WHERE post_id = :post_id"),
            {"post_id": int(post_id)},
        )

        for tag_id in tag_ids:
            conn.execute(
                text(
                    f"""
                    INSERT INTO {BLOG_POST_TAGS_TABLE} (post_id, tag_id, created_at)
                    VALUES (:post_id, :tag_id, :now_utc)
                    ON CONFLICT (post_id, tag_id) DO NOTHING
                    """
                ),
                {
                    "post_id": int(post_id),
                    "tag_id": int(tag_id),
                    "now_utc": _utc_now(),
                },
            )

        conn.execute(
            text(
                f"""
                UPDATE {BLOG_POSTS_TABLE}
                SET updated_at = :now_utc
                WHERE id = :post_id
                """
            ),
            {
                "post_id": int(post_id),
                "now_utc": _utc_now(),
            },
        )

    invalidate_seo_cache("sitemap:")
    return {
        "post_id": int(post_id),
        "tag_slugs": normalized_slugs,
    }
