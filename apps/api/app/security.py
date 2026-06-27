from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import uuid4

import jwt
import pyotp
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError

from app.config import get_settings

_hasher = PasswordHasher()


def hash_password(password: str) -> str:
    """Hash a password using Argon2."""
    return _hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    """Verify a password against its hash."""
    try:
        _hasher.verify(password_hash, password)
        return True
    except VerifyMismatchError:
        return False


def generate_jwt(user_id: str, token_type: str, expires_in_minutes: int) -> str:
    """Generate a JWT token."""
    settings = get_settings()
    now = datetime.now(UTC)
    expires_at = now + timedelta(minutes=expires_in_minutes)

    payload = {
        "user_id": user_id,
        "type": token_type,
        "iat": now,
        "exp": expires_at,
        "jti": str(uuid4()),
    }

    return jwt.encode(payload, settings.jwt_secret_key, algorithm="HS256")


def decode_jwt(token: str) -> dict[str, Any]:
    """Decode and validate a JWT token."""
    settings = get_settings()
    try:
        return jwt.decode(token, settings.jwt_secret_key, algorithms=["HS256"])
    except jwt.InvalidTokenError:
        return {}


def generate_totp_secret() -> str:
    """Generate a TOTP secret for 2FA."""
    return pyotp.random_base32()


def get_totp_uri(email: str, secret: str) -> str:
    """Get the provisioning URI for TOTP (for QR code generation)."""
    totp = pyotp.TOTP(secret)
    return totp.provisioning_uri(name=email, issuer_name="Second Brain")


def verify_totp(secret: str, code: str) -> bool:
    """Verify a TOTP code."""
    totp = pyotp.TOTP(secret)
    return totp.verify(code)
