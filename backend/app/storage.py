"""Supabase Storage — upload, download, delete, copy Parquet files.

A stored object may be at most 50 MB on Supabase's free plan (a larger one
is refused with 413), and a 5M-row file is about 113 MB of Parquet. So a
file over PART_BYTES is stored as numbered parts, `{key}.part0000`, ...,
with a small manifest at `{key}` itself. Callers never see the parts: every
function here takes and returns whole files by their key.
"""

from __future__ import annotations

import json
import logging
import os
import re

from app.config import SUPABASE_BUCKET
from app.db import get_client

logger = logging.getLogger("sheetsllm.storage")

# Under the free plan's 50 MB per object, with room to spare
PART_BYTES = int(os.getenv("STORAGE_PART_MB", "45")) * 1024 * 1024
# A manifest can never be mistaken for Parquet, which starts with "PAR1"
_MANIFEST = b"SLLM-PARTS\n"
_PART = re.compile(r"^(?P<owner>.+)\.part\d{4}$")


def _bucket():
    return get_client().storage.from_(SUPABASE_BUCKET)


def storage_key_for_file(user_id: str, file_id: str) -> str:
    """Standard path convention: {user_id}/{file_id}/original.parquet"""
    return f"{user_id}/{file_id}/original.parquet"


# Keep old name as alias so existing code doesn't break
r2_key_for_file = storage_key_for_file


def part_key(key: str, index: int) -> str:
    return f"{key}.part{index:04d}"


def part_owner(name: str) -> str | None:
    """The key a part belongs to, or None when `name` is not a part."""
    m = _PART.match(name)
    return m.group("owner") if m else None


def _put(key: str, data: bytes) -> None:
    _bucket().upload(path=key, file=data, file_options={"content-type": "application/octet-stream"})


def upload_parquet(key: str, parquet_bytes: bytes) -> str:
    """Upload Parquet bytes to Supabase Storage. Returns the key."""
    size = len(parquet_bytes)
    if size <= PART_BYTES:
        _put(key, parquet_bytes)
    else:
        view = memoryview(parquet_bytes)
        count = -(-size // PART_BYTES)
        # The parts first: a manifest is only ever written over parts that exist
        for i in range(count):
            _put(part_key(key, i), bytes(view[i * PART_BYTES : (i + 1) * PART_BYTES]))
        _put(key, _MANIFEST + json.dumps({"parts": count, "size": size}).encode())
    logger.info("Uploaded %d bytes to storage key=%s", size, key)
    return key


def download_parquet(key: str) -> bytes:
    """Download a Parquet file from Supabase Storage."""
    data = _bucket().download(key)
    if data.startswith(_MANIFEST):
        manifest = json.loads(data[len(_MANIFEST) :])
        whole = bytearray()
        for i in range(manifest["parts"]):
            whole += _bucket().download(part_key(key, i))
        if len(whole) != manifest["size"]:
            raise RuntimeError(f"storage key={key} came back {len(whole)} bytes, expected {manifest['size']}")
        data = bytes(whole)
    logger.info("Downloaded %d bytes from storage key=%s", len(data), key)
    return data


def _parts_of(keys: list[str]) -> dict[str, list[str]]:
    """Each key's stored parts, by listing each key's folder once."""
    folders: dict[str, list[str]] = {}
    for key in keys:
        folder, _, _name = key.rpartition("/")
        folders.setdefault(folder, []).append(key)
    found: dict[str, list[str]] = {key: [] for key in keys}
    for folder, owned in folders.items():
        for entry in _bucket().list(folder, {"limit": 1000}):
            name = entry.get("name") or ""
            full = f"{folder}/{name}" if folder else name
            owner = part_owner(full)
            if owner in found:
                found[owner].append(full)
    return {key: sorted(parts) for key, parts in found.items()}


def delete_object(key: str) -> None:
    """Delete an object from Supabase Storage."""
    delete_objects([key])
    logger.info("Deleted storage key=%s", key)


def delete_objects(keys: list[str]) -> None:
    """Remove several objects, and any parts they were stored as."""
    if keys:
        parts = _parts_of(keys)
        _bucket().remove(list(keys) + [p for key in keys for p in parts[key]])


def copy_object(source_key: str, dest_key: str) -> str:
    """Copy an object within the bucket. Returns the dest key."""
    # Supabase storage copy expects "bucket/path" format for source
    for part in _parts_of([source_key])[source_key]:
        _bucket().copy(part, dest_key + part[len(source_key) :])
    _bucket().copy(source_key, dest_key)
    logger.info("Copied storage %s -> %s", source_key, dest_key)
    return dest_key
