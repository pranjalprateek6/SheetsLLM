"""Supabase Storage — upload, download, delete, copy Parquet files."""

from __future__ import annotations

import logging

from app.config import SUPABASE_BUCKET
from app.db import get_client

logger = logging.getLogger("sheetsllm.storage")


def _bucket():
    return get_client().storage.from_(SUPABASE_BUCKET)


def storage_key_for_file(user_id: str, file_id: str) -> str:
    """Standard path convention: {user_id}/{file_id}/original.parquet"""
    return f"{user_id}/{file_id}/original.parquet"


# Keep old name as alias so existing code doesn't break
r2_key_for_file = storage_key_for_file


def upload_parquet(key: str, parquet_bytes: bytes) -> str:
    """Upload Parquet bytes to Supabase Storage. Returns the key."""
    _bucket().upload(
        path=key,
        file=parquet_bytes,
        file_options={"content-type": "application/octet-stream"},
    )
    logger.info("Uploaded %d bytes to storage key=%s", len(parquet_bytes), key)
    return key


def download_parquet(key: str) -> bytes:
    """Download a Parquet file from Supabase Storage."""
    data = _bucket().download(key)
    logger.info("Downloaded %d bytes from storage key=%s", len(data), key)
    return data


def delete_object(key: str) -> None:
    """Delete an object from Supabase Storage."""
    _bucket().remove([key])
    logger.info("Deleted storage key=%s", key)


def copy_object(source_key: str, dest_key: str) -> str:
    """Copy an object within the bucket. Returns the dest key."""
    # Supabase storage copy expects "bucket/path" format for source
    _bucket().copy(source_key, dest_key)
    logger.info("Copied storage %s -> %s", source_key, dest_key)
    return dest_key
