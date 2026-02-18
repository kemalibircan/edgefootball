from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import secrets
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token
from pydantic import BaseModel, Field
from sqlalchemy import create_engine, text

from app.config import Settings, get_settings
from app.mailer import MailDeliveryError, send_email

ROLE_USER = "user"
ROLE_ADMIN = "admin"
ROLE_SUPERADMIN = "superadmin"
VALID_ROLES = {ROLE_USER, ROLE_ADMIN, ROLE_SUPERADMIN}
MANAGER_ROLES = {ROLE_ADMIN, ROLE_SUPERADMIN}

AUTH_USERS_TABLE = "app_users"
CREDIT_TX_TABLE = "credit_transactions"
PASSWORD_RESET_REQUESTS_TABLE = "password_reset_requests"  # Legacy table kept for compatibility.
AUTH_EMAIL_CHALLENGES_TABLE = "auth_email_challenges"

EMAIL_CODE_PURPOSE_REGISTER = "register"
EMAIL_CODE_PURPOSE_LOGIN = "login"
EMAIL_CODE_PURPOSE_PASSWORD_RESET = "password_reset"

router = APIRouter(prefix="/auth", tags=["auth"])
auth_scheme = HTTPBearer(auto_error=False)


class AuthUser(BaseModel):
    id: int
    username: str
    email: str = ""
    email_verified: bool = False
    role: str
    credits: int
    is_active: bool
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    advanced_mode_enabled: bool = False


class LoginRequest(BaseModel):
    email: str = Field(min_length=5, max_length=254)
    password: str = Field(min_length=6, max_length=200)


class LoginWithCodeRequest(BaseModel):
    email: str = Field(min_length=5, max_length=254)


class VerifyLoginCodeRequest(BaseModel):
    email: str = Field(min_length=5, max_length=254)
    code: str = Field(min_length=4, max_length=12)


class GoogleLoginRequest(BaseModel):
    id_token: str = Field(min_length=50, max_length=8192)


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: AuthUser


class RegisterRequest(BaseModel):
    email: str = Field(min_length=5, max_length=254)
    password: str = Field(min_length=6, max_length=200)


class RegisterVerifyRequest(BaseModel):
    email: str = Field(min_length=5, max_length=254)
    code: str = Field(min_length=4, max_length=12)


class ForgotPasswordCodeRequest(BaseModel):
    email: str = Field(min_length=5, max_length=254)


class ForgotPasswordConfirmRequest(BaseModel):
    email: str = Field(min_length=5, max_length=254)
    code: str = Field(min_length=4, max_length=12)
    new_password: str = Field(min_length=6, max_length=200)


class LegacyForgotPasswordRequest(BaseModel):
    email: Optional[str] = None
    username: Optional[str] = None
    contact: Optional[str] = None
    note: Optional[str] = None


class CodeDispatchResponse(BaseModel):
    ok: bool = True
    message: str
    expires_in_seconds: int
    resend_after_seconds: int


class ForgotPasswordResponse(BaseModel):
    ok: bool = True
    message: str


class AdvancedModeUpdateRequest(BaseModel):
    enabled: bool


class PreferencesResponse(BaseModel):
    advanced_mode_enabled: bool


def _normalize_username(value: str) -> str:
    return str(value or "").strip().lower()


def _normalize_email(value: str) -> str:
    return str(value or "").strip().lower()


def _normalize_email_code(value: str) -> str:
    raw = str(value or "")
    digits = "".join(ch for ch in raw if ch.isdigit())
    return digits if digits else raw.strip()


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _username_from_email(email: str) -> str:
    normalized = _normalize_email(email)
    return normalized or "unknown@example.local"


def hash_password(password: str, iterations: int = 240_000) -> str:
    salt = os.urandom(16)
    derived = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
    return f"pbkdf2_sha256${iterations}${salt.hex()}${derived.hex()}"


def verify_password(password: str, stored_hash: str) -> bool:
    try:
        scheme, iter_raw, salt_hex, digest_hex = stored_hash.split("$", 3)
        if scheme != "pbkdf2_sha256":
            return False
        iterations = int(iter_raw)
        salt = bytes.fromhex(salt_hex)
        expected = bytes.fromhex(digest_hex)
    except Exception:
        return False
    actual = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
    return hmac.compare_digest(actual, expected)


def _b64url_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("utf-8").rstrip("=")


def _b64url_decode(raw: str) -> bytes:
    padding = "=" * ((4 - len(raw) % 4) % 4)
    return base64.urlsafe_b64decode(raw + padding)


def _sign_token_payload(payload_b64: str, secret: str) -> str:
    digest = hmac.new(secret.encode("utf-8"), payload_b64.encode("utf-8"), hashlib.sha256).digest()
    return _b64url_encode(digest)


def create_access_token(user_id: int, settings: Settings) -> str:
    exp = int(time.time()) + int(settings.auth_token_ttl_hours * 3600)
    payload = {"sub": int(user_id), "exp": exp}
    payload_raw = json.dumps(payload, separators=(",", ":"), ensure_ascii=True).encode("utf-8")
    payload_b64 = _b64url_encode(payload_raw)
    signature = _sign_token_payload(payload_b64, settings.auth_secret)
    return f"{payload_b64}.{signature}"


def decode_access_token(token: str, settings: Settings) -> dict[str, Any]:
    try:
        payload_b64, signature = token.split(".", 1)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token format") from exc

    expected = _sign_token_payload(payload_b64, settings.auth_secret)
    if not hmac.compare_digest(signature, expected):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token signature")

    try:
        payload = json.loads(_b64url_decode(payload_b64).decode("utf-8"))
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload") from exc

    exp = int(payload.get("exp") or 0)
    if exp <= int(time.time()):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token expired")
    return payload


def _hash_email_code(settings: Settings, *, email: str, purpose: str, code: str) -> str:
    normalized_code = _normalize_email_code(code)
    raw = f"{_normalize_email(email)}|{purpose}|{normalized_code}"
    return hmac.new(settings.auth_secret.encode("utf-8"), raw.encode("utf-8"), hashlib.sha256).hexdigest()


def _generate_email_code() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def _email_code_ttl_seconds(settings: Settings) -> int:
    return max(60, int(settings.auth_code_ttl_minutes) * 60)


def _email_code_resend_seconds(settings: Settings) -> int:
    return max(5, int(settings.auth_code_resend_cooldown_seconds))


def _email_code_max_attempts(settings: Settings) -> int:
    return max(1, int(settings.auth_code_max_attempts))


def _parse_google_client_ids(settings: Settings) -> list[str]:
    raw = str(settings.google_oauth_client_ids or "")
    parsed = [item.strip() for item in raw.split(",") if item.strip()]
    return list(dict.fromkeys(parsed))


def _is_truthy_claim(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    return str(value or "").strip().lower() in {"1", "true", "yes"}


def _verify_google_id_token(raw_id_token: str, *, settings: Settings) -> dict[str, str]:
    allowed_audiences = _parse_google_client_ids(settings)
    if not allowed_audiences:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google login servisi henuz yapilandirilmamis.",
        )

    token_value = str(raw_id_token or "").strip()
    if not token_value:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Google id_token zorunludur.")

    try:
        payload = google_id_token.verify_oauth2_token(
            token_value,
            google_requests.Request(),
            audience=None,
        )
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Google token dogrulanamadi.") from exc

    aud_raw = payload.get("aud")
    if isinstance(aud_raw, (list, tuple, set)):
        token_audiences = {str(item).strip() for item in aud_raw if str(item).strip()}
    else:
        normalized_aud = str(aud_raw or "").strip()
        token_audiences = {normalized_aud} if normalized_aud else set()
    if not token_audiences or not any(item in token_audiences for item in allowed_audiences):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Google token audience gecersiz.")

    issuer = str(payload.get("iss") or "").strip()
    if issuer not in {"accounts.google.com", "https://accounts.google.com"}:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Google token issuer gecersiz.")

    email = _normalize_email(payload.get("email"))
    if not email:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Google token email bilgisi gecersiz.")
    if not _is_truthy_claim(payload.get("email_verified")):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Google email dogrulanmamis.")

    google_sub = str(payload.get("sub") or "").strip()
    if not google_sub:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Google token subject gecersiz.")

    return {"email": email, "sub": google_sub}


def _challenge_payload(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        text_value = value.strip()
        if not text_value:
            return {}
        try:
            parsed = json.loads(text_value)
            return parsed if isinstance(parsed, dict) else {}
        except Exception:
            return {}
    return {}


def _challenge_email_subject(purpose: str) -> str:
    if purpose == EMAIL_CODE_PURPOSE_REGISTER:
        return "Football AI - Kayit Onay Kodu"
    if purpose == EMAIL_CODE_PURPOSE_LOGIN:
        return "Football AI - Giris Kodu"
    if purpose == EMAIL_CODE_PURPOSE_PASSWORD_RESET:
        return "Football AI - Sifre Sifirlama Kodu"
    return "Football AI - Guvenlik Kodu"


def _challenge_email_text(*, purpose: str, code: str, ttl_minutes: int) -> str:
    safe_code = str(code or "").strip()
    safe_ttl = max(1, int(ttl_minutes))
    if purpose == EMAIL_CODE_PURPOSE_REGISTER:
        title = "Kayit islemini tamamlamak icin kodunuz:"
    elif purpose == EMAIL_CODE_PURPOSE_LOGIN:
        title = "Hesabiniza giris icin kodunuz:"
    elif purpose == EMAIL_CODE_PURPOSE_PASSWORD_RESET:
        title = "Sifre sifirlama kodunuz:"
    else:
        title = "Guvenlik kodunuz:"

    return (
        f"{title}\n\n"
        f"{safe_code}\n\n"
        f"Kod {safe_ttl} dakika gecerlidir ve tek kullanimliktir.\n"
        f"Bu islemi siz yapmadiysaniz bu e-postayi dikkate almayin."
    )


def _send_email_code(settings: Settings, *, email: str, purpose: str, code: str) -> None:
    send_email(
        settings,
        to_address=email,
        subject=_challenge_email_subject(purpose),
        text_body=_challenge_email_text(
            purpose=purpose,
            code=code,
            ttl_minutes=max(1, int(settings.auth_code_ttl_minutes)),
        ),
    )


def _latest_challenge(conn, *, email: str, purpose: str) -> Optional[dict]:
    row = conn.execute(
        text(
            f"""
            SELECT id, email, purpose, code_hash, payload_json, expires_at, consumed_at, attempt_count, created_at
            FROM {AUTH_EMAIL_CHALLENGES_TABLE}
            WHERE LOWER(email) = :email
              AND purpose = :purpose
            ORDER BY created_at DESC, id DESC
            LIMIT 1
            """
        ),
        {
            "email": _normalize_email(email),
            "purpose": str(purpose),
        },
    ).mappings().first()
    return dict(row) if row else None


def _assert_resend_allowed(conn, *, email: str, purpose: str, settings: Settings) -> None:
    latest = _latest_challenge(conn, email=email, purpose=purpose)
    if not latest:
        return
    created_at = latest.get("created_at")
    if not isinstance(created_at, datetime):
        return
    now_utc = _utc_now()
    cooldown = _email_code_resend_seconds(settings)
    remaining = int((created_at + timedelta(seconds=cooldown) - now_utc).total_seconds())
    if remaining > 0:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Kod tekrar gonderimi icin {remaining} saniye bekleyin.",
        )


def _create_email_challenge(
    conn,
    *,
    email: str,
    purpose: str,
    payload: Optional[dict[str, Any]],
    settings: Settings,
) -> str:
    _assert_resend_allowed(conn, email=email, purpose=purpose, settings=settings)

    code = _generate_email_code()
    code_hash = _hash_email_code(settings, email=email, purpose=purpose, code=code)
    now_utc = _utc_now()
    expires_at = now_utc + timedelta(seconds=_email_code_ttl_seconds(settings))

    conn.execute(
        text(
            f"""
            INSERT INTO {AUTH_EMAIL_CHALLENGES_TABLE} (
                email,
                purpose,
                code_hash,
                payload_json,
                expires_at,
                consumed_at,
                attempt_count,
                created_at
            ) VALUES (
                :email,
                :purpose,
                :code_hash,
                CAST(:payload_json AS JSONB),
                :expires_at,
                NULL,
                0,
                :created_at
            )
            """
        ),
        {
            "email": _normalize_email(email),
            "purpose": str(purpose),
            "code_hash": code_hash,
            "payload_json": json.dumps(payload or {}, ensure_ascii=False, separators=(",", ":")),
            "expires_at": expires_at,
            "created_at": now_utc,
        },
    )
    return code


def _consume_email_code(
    conn,
    *,
    email: str,
    purpose: str,
    code: str,
    settings: Settings,
) -> dict[str, Any]:
    row = conn.execute(
        text(
            f"""
            SELECT id, email, purpose, code_hash, payload_json, expires_at, consumed_at, attempt_count, created_at
            FROM {AUTH_EMAIL_CHALLENGES_TABLE}
            WHERE LOWER(email) = :email
              AND purpose = :purpose
              AND consumed_at IS NULL
            ORDER BY created_at DESC, id DESC
            LIMIT 1
            """
        ),
        {
            "email": _normalize_email(email),
            "purpose": str(purpose),
        },
    ).mappings().first()

    if not row:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Kod gecersiz veya suresi dolmus.")

    challenge_id = int(row["id"])
    now_utc = _utc_now()
    expires_at = row.get("expires_at")
    if not isinstance(expires_at, datetime) or expires_at <= now_utc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Kod gecersiz veya suresi dolmus.")

    attempts = int(row.get("attempt_count") or 0)
    max_attempts = _email_code_max_attempts(settings)
    if attempts >= max_attempts:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Kod deneme limiti asildi.")

    expected_hash = str(row.get("code_hash") or "")
    actual_hash = _hash_email_code(settings, email=email, purpose=purpose, code=code)
    if not hmac.compare_digest(actual_hash, expected_hash):
        conn.execute(
            text(
                f"""
                UPDATE {AUTH_EMAIL_CHALLENGES_TABLE}
                SET attempt_count = attempt_count + 1
                WHERE id = :challenge_id
                """
            ),
            {"challenge_id": challenge_id},
        )
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Kod gecersiz veya suresi dolmus.")

    conn.execute(
        text(
            f"""
            UPDATE {AUTH_EMAIL_CHALLENGES_TABLE}
            SET consumed_at = :consumed_at
            WHERE id = :challenge_id
            """
        ),
        {
            "challenge_id": challenge_id,
            "consumed_at": now_utc,
        },
    )
    return _challenge_payload(row.get("payload_json"))


def ensure_auth_tables(engine) -> None:
    with engine.begin() as conn:
        conn.execute(
            text(
                f"""
                CREATE TABLE IF NOT EXISTS {AUTH_USERS_TABLE} (
                    id BIGSERIAL PRIMARY KEY,
                    username TEXT NOT NULL UNIQUE,
                    email TEXT,
                    email_verified BOOLEAN NOT NULL DEFAULT FALSE,
                    password_hash TEXT NOT NULL,
                    role TEXT NOT NULL,
                    credits INT NOT NULL DEFAULT 100,
                    is_active BOOLEAN NOT NULL DEFAULT TRUE,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """
            )
        )
        conn.execute(
            text(
                f"""
                ALTER TABLE {AUTH_USERS_TABLE}
                ADD COLUMN IF NOT EXISTS advanced_mode_enabled BOOLEAN NOT NULL DEFAULT FALSE
                """
            )
        )
        conn.execute(
            text(
                f"""
                ALTER TABLE {AUTH_USERS_TABLE}
                ADD COLUMN IF NOT EXISTS email TEXT
                """
            )
        )
        conn.execute(
            text(
                f"""
                ALTER TABLE {AUTH_USERS_TABLE}
                ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE
                """
            )
        )
        conn.execute(
            text(
                f"""
                ALTER TABLE {AUTH_USERS_TABLE}
                ADD COLUMN IF NOT EXISTS google_sub TEXT
                """
            )
        )
        conn.execute(
            text(
                f"""
                CREATE UNIQUE INDEX IF NOT EXISTS idx_{AUTH_USERS_TABLE}_email_lower
                ON {AUTH_USERS_TABLE} (LOWER(email))
                """
            )
        )
        conn.execute(
            text(
                f"""
                CREATE UNIQUE INDEX IF NOT EXISTS idx_{AUTH_USERS_TABLE}_google_sub
                ON {AUTH_USERS_TABLE} (google_sub)
                WHERE google_sub IS NOT NULL
                """
            )
        )
        conn.execute(
            text(
                f"""
                CREATE INDEX IF NOT EXISTS idx_{AUTH_USERS_TABLE}_username
                ON {AUTH_USERS_TABLE} (username)
                """
            )
        )
        conn.execute(
            text(
                f"""
                CREATE INDEX IF NOT EXISTS idx_{AUTH_USERS_TABLE}_email
                ON {AUTH_USERS_TABLE} (LOWER(email))
                """
            )
        )

        conn.execute(
            text(
                f"""
                CREATE TABLE IF NOT EXISTS {AUTH_EMAIL_CHALLENGES_TABLE} (
                    id BIGSERIAL PRIMARY KEY,
                    email TEXT NOT NULL,
                    purpose TEXT NOT NULL,
                    code_hash TEXT NOT NULL,
                    payload_json JSONB,
                    expires_at TIMESTAMPTZ NOT NULL,
                    consumed_at TIMESTAMPTZ,
                    attempt_count INT NOT NULL DEFAULT 0,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """
            )
        )
        conn.execute(
            text(
                f"""
                CREATE INDEX IF NOT EXISTS idx_{AUTH_EMAIL_CHALLENGES_TABLE}_lookup
                ON {AUTH_EMAIL_CHALLENGES_TABLE} (LOWER(email), purpose, created_at DESC)
                """
            )
        )
        conn.execute(
            text(
                f"""
                CREATE INDEX IF NOT EXISTS idx_{AUTH_EMAIL_CHALLENGES_TABLE}_expires
                ON {AUTH_EMAIL_CHALLENGES_TABLE} (purpose, expires_at DESC)
                """
            )
        )

        conn.execute(
            text(
                f"""
                CREATE TABLE IF NOT EXISTS {PASSWORD_RESET_REQUESTS_TABLE} (
                    id BIGSERIAL PRIMARY KEY,
                    username TEXT NOT NULL,
                    contact TEXT NOT NULL,
                    note TEXT,
                    status TEXT NOT NULL DEFAULT 'pending',
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """
            )
        )

        conn.execute(
            text(
                f"""
                CREATE TABLE IF NOT EXISTS {CREDIT_TX_TABLE} (
                    id BIGSERIAL PRIMARY KEY,
                    user_id BIGINT NOT NULL REFERENCES {AUTH_USERS_TABLE}(id) ON DELETE CASCADE,
                    delta INT NOT NULL,
                    reason TEXT,
                    created_by BIGINT REFERENCES {AUTH_USERS_TABLE}(id),
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """
            )
        )
        conn.execute(
            text(
                f"""
                CREATE INDEX IF NOT EXISTS idx_{CREDIT_TX_TABLE}_user_id_created_at
                ON {CREDIT_TX_TABLE} (user_id, created_at DESC)
                """
            )
        )


def _row_to_user(row: Any) -> AuthUser:
    email = _normalize_email(str(row.get("email") or "")) if row else ""
    username = str(row.get("username") or "").strip() if row else ""
    return AuthUser(
        id=int(row["id"]),
        username=username or email or f"user-{int(row['id'])}",
        email=email,
        email_verified=bool(row.get("email_verified") or False),
        role=str(row["role"]),
        credits=int(row["credits"] or 0),
        is_active=bool(row["is_active"]),
        created_at=row.get("created_at"),
        updated_at=row.get("updated_at"),
        advanced_mode_enabled=bool(row.get("advanced_mode_enabled") or False),
    )


def bootstrap_superadmin(settings: Settings) -> Optional[AuthUser]:
    engine = create_engine(settings.db_url)
    ensure_auth_tables(engine)
    with engine.begin() as conn:
        count = int(conn.execute(text(f"SELECT COUNT(*) FROM {AUTH_USERS_TABLE}")).scalar_one())
        if count > 0:
            return None

        email = _normalize_email(settings.bootstrap_superadmin_email)
        if not email:
            fallback = _normalize_username(settings.bootstrap_superadmin_username)
            email = f"{fallback or 'superadmin'}@footballai.local"
        username = _username_from_email(email)
        password_hash = hash_password(settings.bootstrap_superadmin_password)

        row = conn.execute(
            text(
                f"""
                INSERT INTO {AUTH_USERS_TABLE} (
                    username, email, email_verified, password_hash, role, credits, is_active, created_at, updated_at
                ) VALUES (
                    :username, :email, TRUE, :password_hash, :role, :credits, TRUE, :now_utc, :now_utc
                )
                RETURNING id, username, email, email_verified, role, credits, is_active, created_at, updated_at, advanced_mode_enabled
                """
            ),
            {
                "username": username,
                "email": email,
                "password_hash": password_hash,
                "role": ROLE_SUPERADMIN,
                "credits": int(settings.auth_initial_credits),
                "now_utc": _utc_now(),
            },
        ).mappings().first()
        if not row:
            return None

        conn.execute(
            text(
                f"""
                INSERT INTO {CREDIT_TX_TABLE} (user_id, delta, reason, created_by)
                VALUES (:user_id, :delta, :reason, :created_by)
                """
            ),
            {
                "user_id": int(row["id"]),
                "delta": int(settings.auth_initial_credits),
                "reason": "bootstrap_initial_credits",
                "created_by": int(row["id"]),
            },
        )
        return _row_to_user(row)


def _fetch_user_by_id(conn, user_id: int) -> Optional[AuthUser]:
    row = conn.execute(
        text(
            f"""
            SELECT id, username, email, email_verified, role, credits, is_active, created_at, updated_at, advanced_mode_enabled
            FROM {AUTH_USERS_TABLE}
            WHERE id = :user_id
            LIMIT 1
            """
        ),
        {"user_id": int(user_id)},
    ).mappings().first()
    return _row_to_user(row) if row else None


def _fetch_login_row(conn, email: str) -> Optional[dict[str, Any]]:
    row = conn.execute(
        text(
            f"""
            SELECT id, username, email, email_verified, password_hash, role, credits, is_active, created_at, updated_at, advanced_mode_enabled, google_sub
            FROM {AUTH_USERS_TABLE}
            WHERE LOWER(email) = :email
            LIMIT 1
            """
        ),
        {"email": _normalize_email(email)},
    ).mappings().first()
    return dict(row) if row else None


def _fetch_user_by_google_sub(conn, google_sub: str) -> Optional[dict[str, Any]]:
    normalized_sub = str(google_sub or "").strip()
    if not normalized_sub:
        return None
    row = conn.execute(
        text(
            f"""
            SELECT id, username, email, email_verified, role, credits, is_active, created_at, updated_at, advanced_mode_enabled, google_sub
            FROM {AUTH_USERS_TABLE}
            WHERE google_sub = :google_sub
            LIMIT 1
            """
        ),
        {"google_sub": normalized_sub},
    ).mappings().first()
    return dict(row) if row else None


def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(auth_scheme),
    settings: Settings = Depends(get_settings),
) -> AuthUser:
    if not credentials or not credentials.credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")

    payload = decode_access_token(credentials.credentials, settings)
    user_id = payload.get("sub")
    try:
        user_id_int = int(user_id)
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token subject") from exc

    engine = create_engine(settings.db_url)
    ensure_auth_tables(engine)
    with engine.connect() as conn:
        user = _fetch_user_by_id(conn, user_id_int)
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found or inactive")
    return user


def require_roles(*roles: str):
    allowed = {str(role) for role in roles}
    invalid_roles = allowed - VALID_ROLES
    if invalid_roles:
        raise RuntimeError(f"Invalid role dependency: {sorted(invalid_roles)}")

    def _dependency(current_user: AuthUser = Depends(get_current_user)) -> AuthUser:
        if current_user.role not in allowed:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
        return current_user

    return _dependency


def resolve_credit_cost(settings: Settings, reason: str) -> int:
    normalized = str(reason or "").strip().lower()
    if normalized == "simulate":
        return max(0, int(settings.simulation_credit_cost))
    if normalized == "coupon_generate":
        return max(0, int(settings.coupon_generation_credit_cost))
    if normalized in {"ai_commentary", "prediction_save_ai_commentary"}:
        return max(0, int(settings.ai_commentary_credit_cost))
    if normalized == "model_training":
        return max(0, int(settings.model_training_credit_cost))
    return max(0, int(settings.ai_query_credit_cost))


def consume_ai_credits(settings: Settings, user_id: int, *, reason: str = "ai_commentary") -> int:
    engine = create_engine(settings.db_url)
    ensure_auth_tables(engine)
    credit_cost = resolve_credit_cost(settings, reason)

    with engine.begin() as conn:
        row = conn.execute(
            text(
                f"""
                UPDATE {AUTH_USERS_TABLE}
                SET credits = credits - :credit_cost,
                    updated_at = :now_utc
                WHERE id = :user_id
                  AND is_active = TRUE
                  AND credits >= :credit_cost
                RETURNING credits
                """
            ),
            {
                "user_id": int(user_id),
                "credit_cost": credit_cost,
                "now_utc": _utc_now(),
            },
        ).mappings().first()
        if not row:
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail=f"Yetersiz kredi. Bu islem icin {credit_cost} kredi gerekir.",
            )

        conn.execute(
            text(
                f"""
                INSERT INTO {CREDIT_TX_TABLE} (user_id, delta, reason, created_by)
                VALUES (:user_id, :delta, :reason, :created_by)
                """
            ),
            {
                "user_id": int(user_id),
                "delta": -credit_cost,
                "reason": reason,
                "created_by": int(user_id),
            },
        )
        return int(row["credits"])


def _code_dispatch_response(message: str, settings: Settings) -> CodeDispatchResponse:
    return CodeDispatchResponse(
        message=message,
        expires_in_seconds=_email_code_ttl_seconds(settings),
        resend_after_seconds=_email_code_resend_seconds(settings),
    )


def _register_challenge_payload(*, settings: Settings, password: str) -> dict[str, Any]:
    return {
        "source": "self_register",
        "password_hash": hash_password(password),
        "role": ROLE_USER,
        "credits": int(settings.auth_initial_credits),
    }


@router.post("/register/request", response_model=CodeDispatchResponse)
def register_request(request: RegisterRequest, settings: Settings = Depends(get_settings)):
    email = _normalize_email(request.email)
    if not email:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email bos olamaz.")

    engine = create_engine(settings.db_url)
    ensure_auth_tables(engine)

    try:
        with engine.begin() as conn:
            existing = _fetch_login_row(conn, email)
            if existing and bool(existing.get("email_verified")):
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Bu email zaten kullaniliyor.")

            payload = _register_challenge_payload(settings=settings, password=request.password)
            code = _create_email_challenge(
                conn,
                email=email,
                purpose=EMAIL_CODE_PURPOSE_REGISTER,
                payload=payload,
                settings=settings,
            )
            _send_email_code(settings, email=email, purpose=EMAIL_CODE_PURPOSE_REGISTER, code=code)
    except MailDeliveryError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=f"Mail gonderimi basarisiz: {exc}")

    return _code_dispatch_response("Dogrulama kodu e-posta adresinize gonderildi.", settings)


@router.post("/register/verify", response_model=LoginResponse)
def register_verify(request: RegisterVerifyRequest, settings: Settings = Depends(get_settings)):
    email = _normalize_email(request.email)
    code = _normalize_email_code(request.code)
    if not email or not code:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email ve kod zorunludur.")

    engine = create_engine(settings.db_url)
    ensure_auth_tables(engine)
    now_utc = _utc_now()

    with engine.begin() as conn:
        payload = _consume_email_code(
            conn,
            email=email,
            purpose=EMAIL_CODE_PURPOSE_REGISTER,
            code=code,
            settings=settings,
        )
        row = _fetch_login_row(conn, email)
        if row and bool(row.get("email_verified")):
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Bu email zaten dogrulandi.")

        password_hash = str(payload.get("password_hash") or "").strip()
        role = str(payload.get("role") or ROLE_USER).strip().lower() or ROLE_USER
        if role not in VALID_ROLES:
            role = ROLE_USER

        if row:
            if payload.get("user_id") is not None and int(payload.get("user_id")) != int(row["id"]):
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Dogrulama kaydi gecersiz.")

            if password_hash:
                conn.execute(
                    text(
                        f"""
                        UPDATE {AUTH_USERS_TABLE}
                        SET password_hash = :password_hash,
                            email_verified = TRUE,
                            is_active = TRUE,
                            updated_at = :updated_at
                        WHERE id = :user_id
                        """
                    ),
                    {
                        "password_hash": password_hash,
                        "updated_at": now_utc,
                        "user_id": int(row["id"]),
                    },
                )
            else:
                conn.execute(
                    text(
                        f"""
                        UPDATE {AUTH_USERS_TABLE}
                        SET email_verified = TRUE,
                            is_active = TRUE,
                            updated_at = :updated_at
                        WHERE id = :user_id
                        """
                    ),
                    {
                        "updated_at": now_utc,
                        "user_id": int(row["id"]),
                    },
                )

            updated = conn.execute(
                text(
                    f"""
                    SELECT id, username, email, email_verified, role, credits, is_active, created_at, updated_at, advanced_mode_enabled
                    FROM {AUTH_USERS_TABLE}
                    WHERE id = :user_id
                    LIMIT 1
                    """
                ),
                {"user_id": int(row["id"])}
            ).mappings().first()
            if not updated:
                raise HTTPException(status_code=500, detail="Kayit dogrulama tamamlanamadi.")
            user = _row_to_user(updated)
        else:
            if not password_hash:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Kayit kaydi gecersiz.")

            initial_credits = int(payload.get("credits") or settings.auth_initial_credits)
            inserted = conn.execute(
                text(
                    f"""
                    INSERT INTO {AUTH_USERS_TABLE} (
                        username,
                        email,
                        email_verified,
                        password_hash,
                        role,
                        credits,
                        is_active,
                        created_at,
                        updated_at
                    ) VALUES (
                        :username,
                        :email,
                        TRUE,
                        :password_hash,
                        :role,
                        :credits,
                        TRUE,
                        :created_at,
                        :updated_at
                    )
                    RETURNING id, username, email, email_verified, role, credits, is_active, created_at, updated_at, advanced_mode_enabled
                    """
                ),
                {
                    "username": _username_from_email(email),
                    "email": email,
                    "password_hash": password_hash,
                    "role": role,
                    "credits": initial_credits,
                    "created_at": now_utc,
                    "updated_at": now_utc,
                },
            ).mappings().first()
            if not inserted:
                raise HTTPException(status_code=500, detail="Kayit dogrulama tamamlanamadi.")

            if initial_credits != 0:
                conn.execute(
                    text(
                        f"""
                        INSERT INTO {CREDIT_TX_TABLE} (user_id, delta, reason, created_by)
                        VALUES (:user_id, :delta, :reason, :created_by)
                        """
                    ),
                    {
                        "user_id": int(inserted["id"]),
                        "delta": initial_credits,
                        "reason": "self_signup_initial_credits",
                        "created_by": int(inserted["id"]),
                    },
                )
            user = _row_to_user(inserted)

    token = create_access_token(user.id, settings)
    return LoginResponse(access_token=token, user=user)


@router.post("/register", response_model=CodeDispatchResponse)
def register_legacy_alias(request: RegisterRequest, settings: Settings = Depends(get_settings)):
    return register_request(request=request, settings=settings)


@router.post("/login", response_model=LoginResponse)
def login(request: LoginRequest, settings: Settings = Depends(get_settings)):
    email = _normalize_email(request.email)
    if not email:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email bos olamaz.")

    engine = create_engine(settings.db_url)
    ensure_auth_tables(engine)
    with engine.connect() as conn:
        row = _fetch_login_row(conn, email)
    if not row:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Email veya sifre hatali")
    if not bool(row.get("is_active")) or not bool(row.get("email_verified")):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Hesap aktif degil veya email dogrulanmamis")
    if not verify_password(request.password, str(row.get("password_hash") or "")):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Email veya sifre hatali")

    user = _row_to_user(row)
    token = create_access_token(user.id, settings)
    return LoginResponse(access_token=token, user=user)


@router.post("/login/google", response_model=LoginResponse)
def login_google(request: GoogleLoginRequest, settings: Settings = Depends(get_settings)):
    verified = _verify_google_id_token(request.id_token, settings=settings)
    email = verified["email"]
    google_sub = verified["sub"]

    engine = create_engine(settings.db_url)
    ensure_auth_tables(engine)
    now_utc = _utc_now()

    with engine.begin() as conn:
        linked_row = _fetch_user_by_google_sub(conn, google_sub)
        if linked_row:
            if not bool(linked_row.get("is_active")):
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Hesap aktif degil.")
            user = _row_to_user(linked_row)
            token = create_access_token(user.id, settings)
            return LoginResponse(access_token=token, user=user)

        existing = _fetch_login_row(conn, email)
        if existing:
            if not bool(existing.get("is_active")):
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Hesap aktif degil.")

            existing_sub = str(existing.get("google_sub") or "").strip()
            if existing_sub and existing_sub != google_sub:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Bu email farkli bir Google hesabi ile eslesmis.",
                )

            if not existing_sub:
                conn.execute(
                    text(
                        f"""
                        UPDATE {AUTH_USERS_TABLE}
                        SET google_sub = :google_sub,
                            email_verified = TRUE,
                            updated_at = :updated_at
                        WHERE id = :user_id
                        """
                    ),
                    {
                        "google_sub": google_sub,
                        "updated_at": now_utc,
                        "user_id": int(existing["id"]),
                    },
                )

            refreshed = conn.execute(
                text(
                    f"""
                    SELECT id, username, email, email_verified, role, credits, is_active, created_at, updated_at, advanced_mode_enabled, google_sub
                    FROM {AUTH_USERS_TABLE}
                    WHERE id = :user_id
                    LIMIT 1
                    """
                ),
                {"user_id": int(existing["id"])},
            ).mappings().first()
            if not refreshed:
                raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Kullanici bulunamadi.")
            user = _row_to_user(refreshed)
        else:
            initial_credits = int(settings.auth_initial_credits)
            random_password = secrets.token_urlsafe(32)
            inserted = conn.execute(
                text(
                    f"""
                    INSERT INTO {AUTH_USERS_TABLE} (
                        username,
                        email,
                        email_verified,
                        password_hash,
                        role,
                        credits,
                        is_active,
                        google_sub,
                        created_at,
                        updated_at
                    ) VALUES (
                        :username,
                        :email,
                        TRUE,
                        :password_hash,
                        :role,
                        :credits,
                        TRUE,
                        :google_sub,
                        :created_at,
                        :updated_at
                    )
                    RETURNING id, username, email, email_verified, role, credits, is_active, created_at, updated_at, advanced_mode_enabled, google_sub
                    """
                ),
                {
                    "username": _username_from_email(email),
                    "email": email,
                    "password_hash": hash_password(random_password),
                    "role": ROLE_USER,
                    "credits": initial_credits,
                    "google_sub": google_sub,
                    "created_at": now_utc,
                    "updated_at": now_utc,
                },
            ).mappings().first()
            if not inserted:
                raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Kullanici olusturulamadi.")

            if initial_credits != 0:
                conn.execute(
                    text(
                        f"""
                        INSERT INTO {CREDIT_TX_TABLE} (user_id, delta, reason, created_by)
                        VALUES (:user_id, :delta, :reason, :created_by)
                        """
                    ),
                    {
                        "user_id": int(inserted["id"]),
                        "delta": initial_credits,
                        "reason": "google_signup_initial_credits",
                        "created_by": int(inserted["id"]),
                    },
                )
            user = _row_to_user(inserted)

    token = create_access_token(user.id, settings)
    return LoginResponse(access_token=token, user=user)


@router.post("/login/code/request", response_model=CodeDispatchResponse)
def request_login_code(request: LoginWithCodeRequest, settings: Settings = Depends(get_settings)):
    email = _normalize_email(request.email)
    if not email:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email bos olamaz.")

    engine = create_engine(settings.db_url)
    ensure_auth_tables(engine)

    try:
        with engine.begin() as conn:
            row = _fetch_login_row(conn, email)
            if row and bool(row.get("is_active")) and bool(row.get("email_verified")):
                try:
                    code = _create_email_challenge(
                        conn,
                        email=email,
                        purpose=EMAIL_CODE_PURPOSE_LOGIN,
                        payload={"user_id": int(row["id"])},
                        settings=settings,
                    )
                    _send_email_code(settings, email=email, purpose=EMAIL_CODE_PURPOSE_LOGIN, code=code)
                except HTTPException as exc:
                    if int(exc.status_code) != status.HTTP_429_TOO_MANY_REQUESTS:
                        raise
    except MailDeliveryError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=f"Mail gonderimi basarisiz: {exc}")

    return _code_dispatch_response("Eger email kayitliysa giris kodu gonderildi.", settings)


@router.post("/login/code/verify", response_model=LoginResponse)
def verify_login_code(request: VerifyLoginCodeRequest, settings: Settings = Depends(get_settings)):
    email = _normalize_email(request.email)
    code = _normalize_email_code(request.code)
    if not email or not code:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email ve kod zorunludur.")

    engine = create_engine(settings.db_url)
    ensure_auth_tables(engine)

    with engine.begin() as conn:
        payload = _consume_email_code(
            conn,
            email=email,
            purpose=EMAIL_CODE_PURPOSE_LOGIN,
            code=code,
            settings=settings,
        )
        row = _fetch_login_row(conn, email)
        if not row:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Hesap bulunamadi.")
        if payload.get("user_id") is not None and int(payload.get("user_id")) != int(row["id"]):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Kod gecersiz.")
        if not bool(row.get("is_active")) or not bool(row.get("email_verified")):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Hesap aktif degil veya email dogrulanmamis")

    user = _row_to_user(row)
    token = create_access_token(user.id, settings)
    return LoginResponse(access_token=token, user=user)


@router.post("/password/forgot/request", response_model=ForgotPasswordResponse)
def forgot_password_request(request: ForgotPasswordCodeRequest, settings: Settings = Depends(get_settings)):
    email = _normalize_email(request.email)
    if not email:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email bos olamaz.")

    engine = create_engine(settings.db_url)
    ensure_auth_tables(engine)

    try:
        with engine.begin() as conn:
            row = _fetch_login_row(conn, email)
            if row:
                try:
                    code = _create_email_challenge(
                        conn,
                        email=email,
                        purpose=EMAIL_CODE_PURPOSE_PASSWORD_RESET,
                        payload={"user_id": int(row["id"])},
                        settings=settings,
                    )
                    _send_email_code(settings, email=email, purpose=EMAIL_CODE_PURPOSE_PASSWORD_RESET, code=code)
                except HTTPException as exc:
                    if int(exc.status_code) != status.HTTP_429_TOO_MANY_REQUESTS:
                        raise
    except MailDeliveryError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=f"Mail gonderimi basarisiz: {exc}")

    return ForgotPasswordResponse(message="Eger email kayitliysa sifre sifirlama kodu gonderildi.")


@router.post("/password/forgot/confirm", response_model=ForgotPasswordResponse)
def forgot_password_confirm(request: ForgotPasswordConfirmRequest, settings: Settings = Depends(get_settings)):
    email = _normalize_email(request.email)
    code = _normalize_email_code(request.code)
    if not email or not code:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email ve kod zorunludur.")

    engine = create_engine(settings.db_url)
    ensure_auth_tables(engine)
    now_utc = _utc_now()

    with engine.begin() as conn:
        payload = _consume_email_code(
            conn,
            email=email,
            purpose=EMAIL_CODE_PURPOSE_PASSWORD_RESET,
            code=code,
            settings=settings,
        )
        row = _fetch_login_row(conn, email)
        if not row:
            # Keep generic result to avoid user enumeration.
            return ForgotPasswordResponse(message="Sifre guncelleme islemi tamamlandi.")

        if payload.get("user_id") is not None and int(payload.get("user_id")) != int(row["id"]):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Kod gecersiz.")

        conn.execute(
            text(
                f"""
                UPDATE {AUTH_USERS_TABLE}
                SET password_hash = :password_hash,
                    updated_at = :updated_at
                WHERE id = :user_id
                """
            ),
            {
                "password_hash": hash_password(request.new_password),
                "updated_at": now_utc,
                "user_id": int(row["id"]),
            },
        )

    return ForgotPasswordResponse(message="Sifre guncelleme islemi tamamlandi.")


@router.post("/forgot-password", response_model=ForgotPasswordResponse)
def forgot_password_legacy_alias(request: LegacyForgotPasswordRequest, settings: Settings = Depends(get_settings)):
    email_candidates = [
        request.email,
        request.contact if request.contact and "@" in str(request.contact) else None,
        request.username if request.username and "@" in str(request.username) else None,
    ]
    email = ""
    for item in email_candidates:
        normalized = _normalize_email(str(item or ""))
        if normalized:
            email = normalized
            break

    if not email:
        return ForgotPasswordResponse(message="Eger email kayitliysa sifre sifirlama kodu gonderildi.")

    return forgot_password_request(ForgotPasswordCodeRequest(email=email), settings)


@router.get("/me", response_model=AuthUser)
def me(current_user: AuthUser = Depends(get_current_user)):
    return current_user


@router.post("/advanced-mode", response_model=PreferencesResponse)
def set_advanced_mode(
    request: AdvancedModeUpdateRequest,
    current_user: AuthUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> PreferencesResponse:
    engine = create_engine(settings.db_url)
    ensure_auth_tables(engine)
    with engine.begin() as conn:
        current_row = conn.execute(
            text(
                f"""
                SELECT advanced_mode_enabled
                FROM {AUTH_USERS_TABLE}
                WHERE id = :user_id
                LIMIT 1
                """
            ),
            {"user_id": int(current_user.id)},
        ).mappings().first()
        if not current_row:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

        current_enabled = bool(current_row.get("advanced_mode_enabled") or False)
        requested_enabled = bool(request.enabled)
        if requested_enabled and not current_enabled:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    f"Advanced Mode self-service acilamaz. "
                    f"Odeme bildirimi onayi gerekir ({int(settings.advanced_mode_price_tl)} TL)."
                ),
            )

        if requested_enabled == current_enabled:
            return PreferencesResponse(advanced_mode_enabled=current_enabled)

        row = conn.execute(
            text(
                f"""
                UPDATE {AUTH_USERS_TABLE}
                SET advanced_mode_enabled = :enabled,
                    updated_at = :now_utc
                WHERE id = :user_id
                RETURNING advanced_mode_enabled
                """
            ),
            {
                "user_id": int(current_user.id),
                "enabled": requested_enabled,
                "now_utc": _utc_now(),
            },
        ).mappings().first()
        if not row:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
        return PreferencesResponse(advanced_mode_enabled=bool(row["advanced_mode_enabled"]))
