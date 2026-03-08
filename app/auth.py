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

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token
from loguru import logger
from pydantic import BaseModel, Field
from sqlalchemy import text

from app.config import Settings, get_settings
from app.db import get_engine
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
AUTH_SESSIONS_TABLE = "auth_sessions"

EMAIL_CODE_PURPOSE_REGISTER = "register"
EMAIL_CODE_PURPOSE_LOGIN = "login"
EMAIL_CODE_PURPOSE_PASSWORD_RESET = "password_reset"
CLIENT_PLATFORM_WEB = "web"
CLIENT_PLATFORM_MOBILE = "mobile"
DEFAULT_AVATAR_KEY = "open_peeps_01"
AVATAR_SOURCE_NAME = "DiceBear Open Peeps"
AVATAR_SOURCE_URL = "https://www.dicebear.com/styles/open-peeps"
AVATAR_LICENSE_NAME = "CC0-1.0"
AVATAR_LICENSE_URL = "https://www.dicebear.com/licenses/"
AVATAR_OPTIONS: tuple[dict[str, str], ...] = tuple(
    {
        "key": f"open_peeps_{index:02d}",
        "label": f"Avatar {index:02d}",
    }
    for index in range(1, 11)
)
AVATAR_KEY_SET = {item["key"] for item in AVATAR_OPTIONS}

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
    avatar_key: str = DEFAULT_AVATAR_KEY


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
    expires_in_seconds: int = 0
    refresh_token: Optional[str] = None


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


class AvatarOption(BaseModel):
    key: str
    label: str
    image_url: str
    source_name: str
    source_url: str
    license_name: str
    license_url: str


class AvatarOptionsResponse(BaseModel):
    items: list[AvatarOption]


class AvatarUpdateRequest(BaseModel):
    avatar_key: str = Field(min_length=3, max_length=64)


class RefreshRequest(BaseModel):
    refresh_token: Optional[str] = None


class LogoutResponse(BaseModel):
    ok: bool = True


def _normalize_username(value: str) -> str:
    return str(value or "").strip().lower()


def _normalize_email(value: str) -> str:
    return str(value or "").strip().lower()


def _normalize_email_code(value: str) -> str:
    raw = str(value or "")
    digits = "".join(ch for ch in raw if ch.isdigit())
    return digits if digits else raw.strip()


def _normalize_avatar_key(value: str) -> str:
    normalized = str(value or "").strip().lower()
    return normalized if normalized in AVATAR_KEY_SET else ""


def _avatar_image_url(base_url: str, avatar_key: str) -> str:
    base = str(base_url or "").rstrip("/")
    return f"{base}/static/avatars/{avatar_key}.png"


def _avatar_option_payload(base_url: str) -> list[AvatarOption]:
    return [
        AvatarOption(
            key=str(item["key"]),
            label=str(item["label"]),
            image_url=_avatar_image_url(base_url, str(item["key"])),
            source_name=AVATAR_SOURCE_NAME,
            source_url=AVATAR_SOURCE_URL,
            license_name=AVATAR_LICENSE_NAME,
            license_url=AVATAR_LICENSE_URL,
        )
        for item in AVATAR_OPTIONS
    ]


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


def _parse_auth_secret_fallbacks(settings: Settings) -> list[str]:
    raw_value = str(settings.auth_secret_fallbacks or "")
    parts = [item.strip() for item in raw_value.split(",") if item and item.strip()]
    deduped: list[str] = []
    seen: set[str] = set()
    for item in parts:
        if item == settings.auth_secret:
            continue
        if item in seen:
            continue
        deduped.append(item)
        seen.add(item)
    return deduped


def _access_token_ttl_seconds(settings: Settings) -> int:
    minutes = int(settings.auth_access_token_ttl_minutes or 0)
    if minutes > 0:
        return max(60, minutes * 60)
    return max(60, int(settings.auth_token_ttl_hours) * 3600)


def _refresh_token_ttl_seconds(settings: Settings) -> int:
    return max(3600, int(settings.auth_refresh_token_ttl_days) * 24 * 3600)


def _session_ttl_delta(settings: Settings) -> timedelta:
    return timedelta(seconds=_refresh_token_ttl_seconds(settings))


def _auth_secret_fingerprint(secret: str) -> str:
    digest = hashlib.sha256(str(secret or "").encode("utf-8")).hexdigest()
    return digest[:10]


def auth_secret_fingerprint(settings: Settings) -> str:
    return _auth_secret_fingerprint(settings.auth_secret)


def _auth_terminal_log(
    *,
    reason: str,
    request: Optional[Request] = None,
    detail: Optional[str] = None,
) -> None:
    request_path = "-"
    request_method = "-"
    request_id = "-"
    if request is not None:
        request_path = str(request.url.path or "-")
        request_method = str(request.method or "-")
        request_id = (
            str(request.headers.get("x-request-id") or "").strip()
            or str(request.headers.get("x-correlation-id") or "").strip()
            or "-"
        )
    logger.warning(
        "auth_401 reason={} path={} method={} instance={} request_id={} detail={}",
        str(reason or "unknown"),
        request_path,
        request_method,
        str(os.getenv("HOSTNAME") or "local"),
        request_id,
        str(detail or ""),
    )


def _raise_auth_401(
    detail: str,
    *,
    reason: str,
    request: Optional[Request] = None,
) -> None:
    _auth_terminal_log(reason=reason, request=request, detail=detail)
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=detail)


def create_access_token(user_id: int, settings: Settings, *, session_id: int) -> str:
    now_epoch = int(time.time())
    exp = now_epoch + _access_token_ttl_seconds(settings)
    payload = {
        "sub": int(user_id),
        "sid": int(session_id),
        "iat": now_epoch,
        "exp": exp,
    }
    payload_raw = json.dumps(payload, separators=(",", ":"), ensure_ascii=True).encode("utf-8")
    payload_b64 = _b64url_encode(payload_raw)
    signature = _sign_token_payload(payload_b64, settings.auth_secret)
    return f"{payload_b64}.{signature}"


def decode_access_token(token: str, settings: Settings, *, request: Optional[Request] = None) -> dict[str, Any]:
    try:
        payload_b64, signature = token.split(".", 1)
    except ValueError as exc:
        _raise_auth_401("Invalid token format", reason="invalid_format", request=request)

    candidate_secrets = [settings.auth_secret, *_parse_auth_secret_fallbacks(settings)]
    valid_signature = False
    for secret in candidate_secrets:
        expected = _sign_token_payload(payload_b64, secret)
        if hmac.compare_digest(signature, expected):
            valid_signature = True
            break
    if not valid_signature:
        _raise_auth_401("Invalid token signature", reason="invalid_signature", request=request)

    try:
        payload = json.loads(_b64url_decode(payload_b64).decode("utf-8"))
    except Exception as exc:
        _raise_auth_401("Invalid token payload", reason="invalid_payload", request=request)

    exp = int(payload.get("exp") or 0)
    if exp <= int(time.time()):
        _raise_auth_401("Token expired", reason="expired", request=request)
    return payload


def create_refresh_token() -> str:
    return secrets.token_urlsafe(64)


def hash_refresh_token(refresh_token: str) -> str:
    return hashlib.sha256(str(refresh_token or "").encode("utf-8")).hexdigest()


def _normalize_client_platform(value: str) -> str:
    normalized = str(value or "").strip().lower()
    if normalized in {CLIENT_PLATFORM_WEB, CLIENT_PLATFORM_MOBILE}:
        return normalized
    return CLIENT_PLATFORM_WEB


def _resolve_client_platform(request: Optional[Request], explicit: Optional[str] = None) -> str:
    if explicit:
        return _normalize_client_platform(explicit)
    if request is None:
        return CLIENT_PLATFORM_WEB
    header_value = str(request.headers.get("x-client-platform") or "").strip().lower()
    if header_value in {"android", "ios", "react-native", CLIENT_PLATFORM_MOBILE}:
        return CLIENT_PLATFORM_MOBILE
    return _normalize_client_platform(header_value)


def _client_user_agent(request: Optional[Request]) -> Optional[str]:
    if request is None:
        return None
    value = str(request.headers.get("user-agent") or "").strip()
    return value or None


def _client_ip_address(request: Optional[Request]) -> Optional[str]:
    if request is None:
        return None
    forwarded_for = str(request.headers.get("x-forwarded-for") or "").strip()
    if forwarded_for:
        first = forwarded_for.split(",")[0].strip()
        if first:
            return first
    forwarded_real = str(request.headers.get("x-real-ip") or "").strip()
    if forwarded_real:
        return forwarded_real
    if request.client and request.client.host:
        return str(request.client.host)
    return None


def _cookie_secure(settings: Settings, request: Optional[Request]) -> bool:
    if bool(settings.auth_cookie_secure):
        return True
    if request is None:
        return False
    forwarded_proto = str(request.headers.get("x-forwarded-proto") or "").strip().lower()
    if forwarded_proto == "https":
        return True
    return str(request.url.scheme or "").lower() == "https"


def _set_refresh_cookie(
    response: Optional[Response],
    *,
    refresh_token: str,
    settings: Settings,
    request: Optional[Request],
) -> None:
    if response is None:
        return
    response.set_cookie(
        key=str(settings.auth_refresh_cookie_name or "football_ai_refresh"),
        value=str(refresh_token),
        httponly=True,
        secure=_cookie_secure(settings, request),
        samesite=str(settings.auth_cookie_samesite or "lax").lower(),
        domain=str(settings.auth_cookie_domain).strip() if settings.auth_cookie_domain else None,
        max_age=_refresh_token_ttl_seconds(settings),
        path="/",
    )


def _clear_refresh_cookie(
    response: Optional[Response],
    *,
    settings: Settings,
    request: Optional[Request],
) -> None:
    if response is None:
        return
    response.delete_cookie(
        key=str(settings.auth_refresh_cookie_name or "football_ai_refresh"),
        path="/",
        domain=str(settings.auth_cookie_domain).strip() if settings.auth_cookie_domain else None,
        secure=_cookie_secure(settings, request),
        samesite=str(settings.auth_cookie_samesite or "lax").lower(),
    )


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


def _is_session_active(row: Optional[dict[str, Any]], *, now_utc: Optional[datetime] = None) -> bool:
    if not row:
        return False
    now_value = now_utc or _utc_now()
    expires_at = row.get("expires_at")
    if not isinstance(expires_at, datetime):
        return False
    revoked_at = row.get("revoked_at")
    if revoked_at is not None:
        return False
    return expires_at > now_value


def create_session(
    conn,
    *,
    user_id: int,
    refresh_token: str,
    settings: Settings,
    client_platform: str,
    user_agent: Optional[str] = None,
    ip_address: Optional[str] = None,
    rotated_from_id: Optional[int] = None,
) -> dict[str, Any]:
    now_utc = _utc_now()
    expires_at = now_utc + _session_ttl_delta(settings)
    refresh_hash = hash_refresh_token(refresh_token)
    row = conn.execute(
        text(
            f"""
            INSERT INTO {AUTH_SESSIONS_TABLE} (
                user_id,
                refresh_token_hash,
                client_platform,
                user_agent,
                ip_address,
                expires_at,
                rotated_from_id,
                revoked_at,
                created_at,
                updated_at,
                last_seen_at
            ) VALUES (
                :user_id,
                :refresh_token_hash,
                :client_platform,
                :user_agent,
                :ip_address,
                :expires_at,
                :rotated_from_id,
                NULL,
                :now_utc,
                :now_utc,
                :now_utc
            )
            RETURNING id, user_id, refresh_token_hash, client_platform, user_agent, ip_address, expires_at, rotated_from_id, revoked_at, created_at, updated_at, last_seen_at
            """
        ),
        {
            "user_id": int(user_id),
            "refresh_token_hash": refresh_hash,
            "client_platform": _normalize_client_platform(client_platform),
            "user_agent": str(user_agent).strip() if user_agent else None,
            "ip_address": str(ip_address).strip() if ip_address else None,
            "expires_at": expires_at,
            "rotated_from_id": int(rotated_from_id) if rotated_from_id else None,
            "now_utc": now_utc,
        },
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Session create failed")
    return dict(row)


def get_session_by_id(conn, session_id: int) -> Optional[dict[str, Any]]:
    row = conn.execute(
        text(
            f"""
            SELECT id, user_id, refresh_token_hash, client_platform, user_agent, ip_address, expires_at, rotated_from_id, revoked_at, created_at, updated_at, last_seen_at
            FROM {AUTH_SESSIONS_TABLE}
            WHERE id = :session_id
            LIMIT 1
            """
        ),
        {"session_id": int(session_id)},
    ).mappings().first()
    return dict(row) if row else None


def _get_session_by_refresh_hash(conn, refresh_hash: str) -> Optional[dict[str, Any]]:
    row = conn.execute(
        text(
            f"""
            SELECT id, user_id, refresh_token_hash, client_platform, user_agent, ip_address, expires_at, rotated_from_id, revoked_at, created_at, updated_at, last_seen_at
            FROM {AUTH_SESSIONS_TABLE}
            WHERE refresh_token_hash = :refresh_token_hash
            LIMIT 1
            """
        ),
        {"refresh_token_hash": str(refresh_hash)},
    ).mappings().first()
    return dict(row) if row else None


def _touch_session(conn, session_id: int) -> None:
    now_utc = _utc_now()
    conn.execute(
        text(
            f"""
            UPDATE {AUTH_SESSIONS_TABLE}
            SET updated_at = :now_utc,
                last_seen_at = :now_utc
            WHERE id = :session_id
            """
        ),
        {
            "session_id": int(session_id),
            "now_utc": now_utc,
        },
    )


def revoke_session(conn, session_id: int) -> None:
    now_utc = _utc_now()
    conn.execute(
        text(
            f"""
            UPDATE {AUTH_SESSIONS_TABLE}
            SET revoked_at = :now_utc,
                updated_at = :now_utc
            WHERE id = :session_id
              AND revoked_at IS NULL
            """
        ),
        {
            "session_id": int(session_id),
            "now_utc": now_utc,
        },
    )


def _revoke_user_sessions(conn, user_id: int) -> None:
    now_utc = _utc_now()
    conn.execute(
        text(
            f"""
            UPDATE {AUTH_SESSIONS_TABLE}
            SET revoked_at = :now_utc,
                updated_at = :now_utc
            WHERE user_id = :user_id
              AND revoked_at IS NULL
            """
        ),
        {
            "user_id": int(user_id),
            "now_utc": now_utc,
        },
    )


def rotate_session(
    conn,
    *,
    session_row: dict[str, Any],
    refresh_token: str,
    settings: Settings,
    client_platform: str,
    user_agent: Optional[str] = None,
    ip_address: Optional[str] = None,
) -> Optional[dict[str, Any]]:
    if not _is_session_active(session_row):
        return None
    old_session_id = int(session_row["id"])
    revoke_session(conn, old_session_id)
    return create_session(
        conn,
        user_id=int(session_row["user_id"]),
        refresh_token=refresh_token,
        settings=settings,
        client_platform=client_platform,
        user_agent=user_agent,
        ip_address=ip_address,
        rotated_from_id=old_session_id,
    )


def _extract_session_id_from_payload(payload: dict[str, Any], *, request: Optional[Request] = None) -> int:
    session_id = payload.get("sid")
    try:
        return int(session_id)
    except (TypeError, ValueError):
        _raise_auth_401("Invalid token session", reason="invalid_session", request=request)
    return 0


def _extract_user_id_from_payload(payload: dict[str, Any], *, request: Optional[Request] = None) -> int:
    user_id = payload.get("sub")
    try:
        return int(user_id)
    except (TypeError, ValueError):
        _raise_auth_401("Invalid token subject", reason="invalid_subject", request=request)
    return 0


def _resolve_refresh_token(
    refresh_request: Optional[RefreshRequest],
    *,
    request: Optional[Request],
    settings: Settings,
) -> str:
    body_token = ""
    if refresh_request is not None:
        body_token = str(refresh_request.refresh_token or "").strip()
    if body_token:
        return body_token
    if request is None:
        return ""
    cookie_name = str(settings.auth_refresh_cookie_name or "football_ai_refresh")
    return str(request.cookies.get(cookie_name) or "").strip()


def _session_response_payload(
    *,
    user: AuthUser,
    session_id: int,
    refresh_token: str,
    settings: Settings,
    client_platform: str,
) -> LoginResponse:
    access_token = create_access_token(user.id, settings, session_id=session_id)
    return LoginResponse(
        access_token=access_token,
        token_type="bearer",
        user=user,
        expires_in_seconds=_access_token_ttl_seconds(settings),
        refresh_token=refresh_token if client_platform == CLIENT_PLATFORM_MOBILE else None,
    )


def _create_login_session_payload(
    conn,
    *,
    user: AuthUser,
    settings: Settings,
    request: Optional[Request],
    response: Optional[Response],
) -> LoginResponse:
    client_platform = _resolve_client_platform(request)
    refresh_token = create_refresh_token()
    session = create_session(
        conn,
        user_id=user.id,
        refresh_token=refresh_token,
        settings=settings,
        client_platform=client_platform,
        user_agent=_client_user_agent(request),
        ip_address=_client_ip_address(request),
    )
    if client_platform == CLIENT_PLATFORM_WEB:
        _set_refresh_cookie(response, refresh_token=refresh_token, settings=settings, request=request)
    return _session_response_payload(
        user=user,
        session_id=int(session["id"]),
        refresh_token=refresh_token,
        settings=settings,
        client_platform=client_platform,
    )


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
                ALTER TABLE {AUTH_USERS_TABLE}
                ADD COLUMN IF NOT EXISTS avatar_key TEXT
                """
            )
        )
        conn.execute(
            text(
                f"""
                UPDATE {AUTH_USERS_TABLE}
                SET avatar_key = :avatar_key
                WHERE avatar_key IS NULL OR LENGTH(TRIM(avatar_key)) = 0
                """
            ),
            {"avatar_key": DEFAULT_AVATAR_KEY},
        )
        conn.execute(
            text(
                f"""
                ALTER TABLE {AUTH_USERS_TABLE}
                ALTER COLUMN avatar_key SET DEFAULT '{DEFAULT_AVATAR_KEY}'
                """
            )
        )
        conn.execute(
            text(
                f"""
                ALTER TABLE {AUTH_USERS_TABLE}
                ALTER COLUMN avatar_key SET NOT NULL
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
                CREATE TABLE IF NOT EXISTS {AUTH_SESSIONS_TABLE} (
                    id BIGSERIAL PRIMARY KEY,
                    user_id BIGINT NOT NULL REFERENCES {AUTH_USERS_TABLE}(id) ON DELETE CASCADE,
                    refresh_token_hash TEXT NOT NULL,
                    client_platform TEXT NOT NULL DEFAULT 'web',
                    user_agent TEXT,
                    ip_address TEXT,
                    expires_at TIMESTAMPTZ NOT NULL,
                    rotated_from_id BIGINT REFERENCES {AUTH_SESSIONS_TABLE}(id),
                    revoked_at TIMESTAMPTZ,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """
            )
        )
        conn.execute(
            text(
                f"""
                CREATE INDEX IF NOT EXISTS idx_{AUTH_SESSIONS_TABLE}_user_active
                ON {AUTH_SESSIONS_TABLE} (user_id, revoked_at, expires_at DESC)
                """
            )
        )
        conn.execute(
            text(
                f"""
                CREATE UNIQUE INDEX IF NOT EXISTS idx_{AUTH_SESSIONS_TABLE}_refresh_hash
                ON {AUTH_SESSIONS_TABLE} (refresh_token_hash)
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
    avatar_key_raw = str(row.get("avatar_key") or "").strip() if row else ""
    avatar_key = avatar_key_raw if avatar_key_raw in AVATAR_KEY_SET else DEFAULT_AVATAR_KEY
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
        avatar_key=avatar_key,
    )


def bootstrap_superadmin(settings: Settings) -> Optional[AuthUser]:
    engine = get_engine(settings)
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
                RETURNING id, username, email, email_verified, role, credits, is_active, created_at, updated_at, advanced_mode_enabled, avatar_key
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
            SELECT id, username, email, email_verified, role, credits, is_active, created_at, updated_at, advanced_mode_enabled, avatar_key
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
            SELECT id, username, email, email_verified, password_hash, role, credits, is_active, created_at, updated_at, advanced_mode_enabled, avatar_key, google_sub
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
            SELECT id, username, email, email_verified, role, credits, is_active, created_at, updated_at, advanced_mode_enabled, avatar_key, google_sub
            FROM {AUTH_USERS_TABLE}
            WHERE google_sub = :google_sub
            LIMIT 1
            """
        ),
        {"google_sub": normalized_sub},
    ).mappings().first()
    return dict(row) if row else None


def _extract_session_id_from_credentials(
    credentials: Optional[HTTPAuthorizationCredentials],
    *,
    settings: Settings,
    request: Optional[Request] = None,
) -> Optional[int]:
    if not credentials or not credentials.credentials:
        return None
    payload = decode_access_token(credentials.credentials, settings, request=request)
    return _extract_session_id_from_payload(payload, request=request)


def get_current_user(
    request: Request = None,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(auth_scheme),
    settings: Settings = Depends(get_settings),
) -> AuthUser:
    if not credentials or not credentials.credentials:
        _raise_auth_401("Authentication required", reason="missing_auth_header", request=request)

    payload = decode_access_token(credentials.credentials, settings, request=request)
    user_id_int = _extract_user_id_from_payload(payload, request=request)
    session_id = _extract_session_id_from_payload(payload, request=request)

    engine = get_engine(settings)
    with engine.begin() as conn:
        session_row = get_session_by_id(conn, session_id)
        if not session_row:
            _raise_auth_401("Session invalidated", reason="session_not_found", request=request)
        if int(session_row.get("user_id") or 0) != user_id_int:
            _raise_auth_401("Session invalidated", reason="session_user_mismatch", request=request)
        if not _is_session_active(session_row):
            _raise_auth_401("Session invalidated", reason="session_inactive", request=request)
        _touch_session(conn, session_id)
        user = _fetch_user_by_id(conn, user_id_int)
    if not user or not user.is_active:
        _raise_auth_401("User not found or inactive", reason="user_inactive", request=request)
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
    engine = get_engine(settings)
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

    engine = get_engine(settings)

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
def register_verify(
    request: RegisterVerifyRequest,
    http_request: Request = None,
    response: Response = None,
    settings: Settings = Depends(get_settings),
):
    email = _normalize_email(request.email)
    code = _normalize_email_code(request.code)
    if not email or not code:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email ve kod zorunludur.")

    engine = get_engine(settings)
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
                    SELECT id, username, email, email_verified, role, credits, is_active, created_at, updated_at, advanced_mode_enabled, avatar_key
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
                    RETURNING id, username, email, email_verified, role, credits, is_active, created_at, updated_at, advanced_mode_enabled, avatar_key
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
        return _create_login_session_payload(
            conn,
            user=user,
            settings=settings,
            request=http_request,
            response=response,
        )


@router.post("/register", response_model=CodeDispatchResponse)
def register_legacy_alias(request: RegisterRequest, settings: Settings = Depends(get_settings)):
    return register_request(request=request, settings=settings)


@router.post("/login", response_model=LoginResponse)
def login(
    request: LoginRequest,
    http_request: Request = None,
    response: Response = None,
    settings: Settings = Depends(get_settings),
):
    email = _normalize_email(request.email)
    if not email:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email bos olamaz.")

    engine = get_engine(settings)
    with engine.begin() as conn:
        row = _fetch_login_row(conn, email)
        if not row:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Email veya sifre hatali")
        if not bool(row.get("is_active")) or not bool(row.get("email_verified")):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Hesap aktif degil veya email dogrulanmamis",
            )
        if not verify_password(request.password, str(row.get("password_hash") or "")):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Email veya sifre hatali")

        user = _row_to_user(row)
        return _create_login_session_payload(
            conn,
            user=user,
            settings=settings,
            request=http_request,
            response=response,
        )


@router.post("/login/google", response_model=LoginResponse)
def login_google(
    request: GoogleLoginRequest,
    http_request: Request = None,
    response: Response = None,
    settings: Settings = Depends(get_settings),
):
    verified = _verify_google_id_token(request.id_token, settings=settings)
    email = verified["email"]
    google_sub = verified["sub"]

    engine = get_engine(settings)
    now_utc = _utc_now()

    with engine.begin() as conn:
        linked_row = _fetch_user_by_google_sub(conn, google_sub)
        if linked_row:
            if not bool(linked_row.get("is_active")):
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Hesap aktif degil.")
            user = _row_to_user(linked_row)
            return _create_login_session_payload(
                conn,
                user=user,
                settings=settings,
                request=http_request,
                response=response,
            )

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
                    SELECT id, username, email, email_verified, role, credits, is_active, created_at, updated_at, advanced_mode_enabled, avatar_key, google_sub
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
                    RETURNING id, username, email, email_verified, role, credits, is_active, created_at, updated_at, advanced_mode_enabled, avatar_key, google_sub
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
        return _create_login_session_payload(
            conn,
            user=user,
            settings=settings,
            request=http_request,
            response=response,
        )


@router.post("/login/code/request", response_model=CodeDispatchResponse)
def request_login_code(request: LoginWithCodeRequest, settings: Settings = Depends(get_settings)):
    email = _normalize_email(request.email)
    if not email:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email bos olamaz.")

    engine = get_engine(settings)

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
def verify_login_code(
    request: VerifyLoginCodeRequest,
    http_request: Request = None,
    response: Response = None,
    settings: Settings = Depends(get_settings),
):
    email = _normalize_email(request.email)
    code = _normalize_email_code(request.code)
    if not email or not code:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email ve kod zorunludur.")

    engine = get_engine(settings)

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
        return _create_login_session_payload(
            conn,
            user=user,
            settings=settings,
            request=http_request,
            response=response,
        )


@router.post("/password/forgot/request", response_model=ForgotPasswordResponse)
def forgot_password_request(request: ForgotPasswordCodeRequest, settings: Settings = Depends(get_settings)):
    email = _normalize_email(request.email)
    if not email:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email bos olamaz.")

    engine = get_engine(settings)

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

    engine = get_engine(settings)
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
        _revoke_user_sessions(conn, int(row["id"]))

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


@router.post("/refresh", response_model=LoginResponse)
def refresh_access_token(
    refresh_request: RefreshRequest = None,
    http_request: Request = None,
    response: Response = None,
    settings: Settings = Depends(get_settings),
):
    refresh_token = _resolve_refresh_token(refresh_request, request=http_request, settings=settings)
    if not refresh_token:
        _raise_auth_401("Authentication required", reason="refresh_missing", request=http_request)

    engine = get_engine(settings)
    with engine.begin() as conn:
        session_row = _get_session_by_refresh_hash(conn, hash_refresh_token(refresh_token))
        if not session_row:
            _raise_auth_401("Session invalidated", reason="refresh_session_not_found", request=http_request)
        if not _is_session_active(session_row):
            _raise_auth_401("Session invalidated", reason="refresh_session_inactive", request=http_request)

        user = _fetch_user_by_id(conn, int(session_row["user_id"]))
        if not user or not user.is_active:
            revoke_session(conn, int(session_row["id"]))
            _raise_auth_401("User not found or inactive", reason="refresh_user_inactive", request=http_request)

        client_platform = _resolve_client_platform(http_request, explicit=str(session_row.get("client_platform") or ""))
        next_refresh_token = create_refresh_token()
        rotated = rotate_session(
            conn,
            session_row=session_row,
            refresh_token=next_refresh_token,
            settings=settings,
            client_platform=client_platform,
            user_agent=_client_user_agent(http_request),
            ip_address=_client_ip_address(http_request),
        )
        if not rotated:
            _raise_auth_401("Session invalidated", reason="refresh_rotate_failed", request=http_request)

        if client_platform == CLIENT_PLATFORM_WEB:
            _set_refresh_cookie(response, refresh_token=next_refresh_token, settings=settings, request=http_request)

        return _session_response_payload(
            user=user,
            session_id=int(rotated["id"]),
            refresh_token=next_refresh_token,
            settings=settings,
            client_platform=client_platform,
        )


@router.post("/logout", response_model=LogoutResponse)
def logout(
    http_request: Request = None,
    response: Response = None,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(auth_scheme),
    settings: Settings = Depends(get_settings),
) -> LogoutResponse:
    engine = get_engine(settings)
    refresh_token = _resolve_refresh_token(None, request=http_request, settings=settings)

    session_id: Optional[int] = None
    try:
        session_id = _extract_session_id_from_credentials(credentials, settings=settings, request=http_request)
    except HTTPException:
        session_id = None

    with engine.begin() as conn:
        if session_id is not None:
            revoke_session(conn, session_id)
        elif refresh_token:
            session_row = _get_session_by_refresh_hash(conn, hash_refresh_token(refresh_token))
            if session_row:
                revoke_session(conn, int(session_row["id"]))

    _clear_refresh_cookie(response, settings=settings, request=http_request)
    return LogoutResponse(ok=True)


@router.post("/logout-all", response_model=LogoutResponse)
def logout_all(
    current_user: AuthUser = Depends(get_current_user),
    http_request: Request = None,
    response: Response = None,
    settings: Settings = Depends(get_settings),
) -> LogoutResponse:
    engine = get_engine(settings)
    with engine.begin() as conn:
        _revoke_user_sessions(conn, int(current_user.id))
    _clear_refresh_cookie(response, settings=settings, request=http_request)
    return LogoutResponse(ok=True)


@router.get("/avatar-options", response_model=AvatarOptionsResponse)
def avatar_options(request: Request):
    return AvatarOptionsResponse(items=_avatar_option_payload(str(request.base_url)))


@router.patch("/me/avatar", response_model=AuthUser)
def update_my_avatar(
    request: AvatarUpdateRequest,
    current_user: AuthUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    avatar_key = _normalize_avatar_key(request.avatar_key)
    if not avatar_key:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Gecersiz avatar secimi.")

    engine = get_engine(settings)
    with engine.begin() as conn:
        row = conn.execute(
            text(
                f"""
                UPDATE {AUTH_USERS_TABLE}
                SET avatar_key = :avatar_key,
                    updated_at = :now_utc
                WHERE id = :user_id
                RETURNING id, username, email, email_verified, role, credits, is_active, created_at, updated_at, advanced_mode_enabled, avatar_key
                """
            ),
            {
                "avatar_key": avatar_key,
                "now_utc": _utc_now(),
                "user_id": int(current_user.id),
            },
        ).mappings().first()
        if not row:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
        return _row_to_user(row)


@router.get("/me", response_model=AuthUser)
def me(current_user: AuthUser = Depends(get_current_user)):
    return current_user


@router.post("/advanced-mode", response_model=PreferencesResponse)
def set_advanced_mode(
    request: AdvancedModeUpdateRequest,
    current_user: AuthUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> PreferencesResponse:
    engine = get_engine(settings)
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
