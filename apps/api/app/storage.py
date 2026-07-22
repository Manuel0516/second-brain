"""MinIO / S3-compatible file storage client.

Initialised lazily from the Settings singleton. One bucket is created on
first use if it does not already exist.
"""

from functools import lru_cache
from urllib.parse import urlparse

from minio import Minio

from app.config import get_settings

_ALLOWED_CONTENT_TYPES: set[str] = {
    "image/png",
    "image/jpeg",
    "image/gif",
    "image/webp",
    "image/svg+xml",
}
_MAX_FILE_SIZE = 50 * 1024 * 1024  # 50 MB


def allowed_content_type(content_type: str) -> bool:
    return content_type in _ALLOWED_CONTENT_TYPES


def max_file_size() -> int:
    return _MAX_FILE_SIZE


@lru_cache
def _client() -> Minio:
    settings = get_settings()
    # Minio() wants bare host:port; accept URL-style endpoints from config
    # (e.g. "http://localhost:9000") and derive TLS from the scheme.
    endpoint = settings.minio_endpoint
    secure = settings.minio_secure
    if "://" in endpoint:
        parsed = urlparse(endpoint)
        endpoint = parsed.netloc
        secure = parsed.scheme == "https"
    client = Minio(
        endpoint,
        access_key=settings.minio_access_key,
        secret_key=settings.minio_secret_key,
        secure=secure,
    )
    bucket = settings.minio_bucket
    if not client.bucket_exists(bucket):
        client.make_bucket(bucket)
    return client


def object_key(user_id: str, file_id: str) -> str:
    return f"{user_id}/{file_id}"


def upload(user_id: str, file_id: str, data: bytes, content_type: str) -> str:
    """Upload bytes to MinIO. Returns the object key."""
    from io import BytesIO

    client = _client()
    settings = get_settings()
    key = object_key(user_id, file_id)
    client.put_object(
        settings.minio_bucket,
        key,
        BytesIO(data),
        length=len(data),
        content_type=content_type,
    )
    return key


def download(user_id: str, file_id: str) -> tuple[bytes, str]:
    """Download bytes from MinIO. Returns (data, content_type)."""
    client = _client()
    settings = get_settings()
    key = object_key(user_id, file_id)
    response = client.get_object(settings.minio_bucket, key)
    data = response.read()
    ct = response.headers.get("content-type", "application/octet-stream")
    response.close()
    response.release_conn()
    return data, ct


def remove(user_id: str, file_id: str) -> None:
    """Delete an object from MinIO."""
    client = _client()
    settings = get_settings()
    key = object_key(user_id, file_id)
    client.remove_object(settings.minio_bucket, key)
