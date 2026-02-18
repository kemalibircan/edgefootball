from fastapi import HTTPException

from app.auth import create_access_token, decode_access_token, hash_password, verify_password
from app.config import Settings


def test_password_hash_roundtrip():
    plain = "StrongPass123"
    hashed = hash_password(plain)
    assert hashed != plain
    assert verify_password(plain, hashed)
    assert not verify_password("wrong-pass", hashed)


def test_access_token_roundtrip_and_tamper_detection():
    settings = Settings(auth_secret="unit-test-secret", auth_token_ttl_hours=1)
    token = create_access_token(42, settings)
    payload = decode_access_token(token, settings)
    assert int(payload["sub"]) == 42

    parts = token.split(".")
    tampered = f"{parts[0]}.broken-signature"
    try:
        decode_access_token(tampered, settings)
        assert False, "Tampered token should fail"
    except HTTPException as exc:
        assert exc.status_code == 401
