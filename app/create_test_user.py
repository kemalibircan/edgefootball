from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import text

from app.config import get_settings
from app.db import get_engine
from app.auth import (
    AUTH_USERS_TABLE,
    ROLE_SUPERADMIN,
    hash_password,
    ensure_auth_tables,
)


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def create_or_update_test_user() -> None:
    """
    Create or update a fully privileged test user:
      email:    test@gmail.com
      username: test123
      password: test123
      role:     superadmin
    """
    settings = get_settings()
    engine = get_engine(settings)

    # Ensure auth tables exist
    ensure_auth_tables(engine)

    email = "test@gmail.com"
    username = "test123"
    plain_password = "test123"
    password_hash = hash_password(plain_password)
    now_utc = _utc_now()

    with engine.begin() as conn:
        existing = conn.execute(
            text(
                f"""
                SELECT id
                FROM {AUTH_USERS_TABLE}
                WHERE LOWER(email) = :email
                LIMIT 1
                """
            ),
            {"email": email.lower()},
        ).mappings().first()

        if existing:
            user_id = int(existing["id"])
            conn.execute(
                text(
                    f"""
                    UPDATE {AUTH_USERS_TABLE}
                    SET
                        username = :username,
                        password_hash = :password_hash,
                        role = :role,
                        email_verified = TRUE,
                        is_active = TRUE,
                        credits = GREATEST(credits, :min_credits),
                        updated_at = :updated_at
                    WHERE id = :user_id
                    """
                ),
                {
                    "user_id": user_id,
                    "username": username,
                    "password_hash": password_hash,
                    "role": ROLE_SUPERADMIN,
                    "min_credits": int(settings.auth_initial_credits),
                    "updated_at": now_utc,
                },
            )
            print(f"Updated existing user #{user_id} as superadmin ({email}).")
        else:
            row = conn.execute(
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
                    RETURNING id
                    """
                ),
                {
                    "username": username,
                    "email": email,
                    "password_hash": password_hash,
                    "role": ROLE_SUPERADMIN,
                    "credits": int(settings.auth_initial_credits),
                    "created_at": now_utc,
                    "updated_at": now_utc,
                },
            ).mappings().first()
            user_id = int(row["id"])
            print(f"Created test superadmin user #{user_id} ({email}).")


if __name__ == "__main__":
    create_or_update_test_user()














