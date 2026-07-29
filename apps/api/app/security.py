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


def encrypt_google_token(token: str) -> str:
    """Encrypt a Google refresh token with the configured Fernet key."""
    from cryptography.fernet import Fernet

    settings = get_settings()
    if not settings.google_token_encryption_key:
        raise RuntimeError("GOOGLE_TOKEN_ENCRYPTION_KEY is not configured")
    return Fernet(settings.google_token_encryption_key.encode()).encrypt(token.encode()).decode()


def decrypt_google_token(encrypted: str) -> str:
    """Decrypt a Google refresh token. Returns "" if the key or token is invalid."""
    from cryptography.fernet import Fernet, InvalidToken

    settings = get_settings()
    if not settings.google_token_encryption_key:
        return ""
    try:
        fernet = Fernet(settings.google_token_encryption_key.encode())
        return fernet.decrypt(encrypted.encode()).decode()
    except (InvalidToken, ValueError):
        return ""


def encrypt_finance_value(value: str) -> str:
    """Encrypt a Finance identifier without reusing another integration's key."""
    from cryptography.fernet import Fernet

    settings = get_settings()
    if not settings.finance_encryption_key:
        raise RuntimeError("FINANCE_ENCRYPTION_KEY is not configured")
    try:
        fernet = Fernet(settings.finance_encryption_key.encode())
    except ValueError as exc:
        raise RuntimeError("FINANCE_ENCRYPTION_KEY is invalid") from exc
    return fernet.encrypt(value.encode()).decode()


def decrypt_finance_value(encrypted: str) -> str:
    """Decrypt a Finance identifier, returning an empty string on invalid input."""
    from cryptography.fernet import Fernet, InvalidToken

    settings = get_settings()
    if not settings.finance_encryption_key:
        return ""
    try:
        return Fernet(settings.finance_encryption_key.encode()).decrypt(encrypted.encode()).decode()
    except (InvalidToken, ValueError):
        return ""
