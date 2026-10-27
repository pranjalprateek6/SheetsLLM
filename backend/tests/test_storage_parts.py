"""A file over the per-object cap is stored as parts behind a manifest, and
comes back, copies and deletes whole."""

import os

import pytest

from app import storage


class _Bucket:
    """Supabase Storage as far as storage.py uses it, refusing objects over
    `cap` bytes the way the free plan refuses anything over 50 MB."""

    def __init__(self, cap: int):
        self.cap = cap
        self.objects: dict[str, bytes] = {}

    def upload(self, path, file, file_options=None):
        if len(file) > self.cap:
            raise RuntimeError("413 The object exceeded the maximum allowed size")
        if path in self.objects:
            raise RuntimeError("409 Duplicate")
        self.objects[path] = bytes(file)

    def download(self, path):
        return self.objects[path]

    def list(self, folder, options=None):
        prefix = f"{folder}/" if folder else ""
        return [{"name": k[len(prefix):]} for k in self.objects if k.startswith(prefix) and "/" not in k[len(prefix):]]

    def remove(self, paths):
        for p in paths:
            self.objects.pop(p, None)

    def copy(self, src, dst):
        self.objects[dst] = self.objects[src]


@pytest.fixture
def bucket(monkeypatch):
    b = _Bucket(cap=100)
    monkeypatch.setattr(storage, "_bucket", lambda: b)
    monkeypatch.setattr(storage, "PART_BYTES", 90)
    return b


def test_a_small_file_is_one_object(bucket):
    storage.upload_parquet("u/f/original.parquet", b"PAR1" + b"x" * 50)
    assert list(bucket.objects) == ["u/f/original.parquet"]
    assert storage.download_parquet("u/f/original.parquet") == b"PAR1" + b"x" * 50


def test_a_file_over_the_cap_is_stored_in_parts_and_comes_back_whole(bucket):
    data = b"PAR1" + os.urandom(400)
    storage.upload_parquet("u/f/original.parquet", data)
    assert sorted(bucket.objects) == ["u/f/original.parquet"] + [f"u/f/original.parquet.part000{i}" for i in range(5)]
    assert all(len(v) <= bucket.cap for v in bucket.objects.values())
    assert storage.download_parquet("u/f/original.parquet") == data


def test_a_missing_part_is_an_error_not_a_short_file(bucket):
    storage.upload_parquet("u/f/original.parquet", b"PAR1" + os.urandom(200))
    bucket.objects["u/f/original.parquet.part0002"] = b""
    with pytest.raises(RuntimeError, match="expected"):
        storage.download_parquet("u/f/original.parquet")


def test_deleting_a_file_removes_its_parts_and_nothing_else(bucket):
    storage.upload_parquet("u/f/original.parquet", b"PAR1" + os.urandom(300))
    storage.upload_parquet("u/g/original.parquet", b"PAR1" + os.urandom(300))
    storage.delete_object("u/f/original.parquet")
    assert all(k.startswith("u/g/") for k in bucket.objects)
    storage.delete_objects(["u/g/original.parquet"])
    assert bucket.objects == {}


def test_copying_a_file_copies_its_parts(bucket):
    data = b"PAR1" + os.urandom(300)
    storage.upload_parquet("u/f/original.parquet", data)
    storage.copy_object("u/f/original.parquet", "u/h/original.parquet")
    assert storage.download_parquet("u/h/original.parquet") == data
    storage.delete_object("u/f/original.parquet")
    assert storage.download_parquet("u/h/original.parquet") == data


def test_a_part_knows_its_file():
    assert storage.part_owner("u/f/original.parquet.part0003") == "u/f/original.parquet"
    assert storage.part_owner("u/f/original.parquet") is None
    assert storage.part_owner("u/f/original.parquet.part12") is None
