"""Requests that miss the file cache together download the file once."""
from __future__ import annotations

import threading
import time

from app import cache, storage


def test_concurrent_misses_download_once(monkeypatch, tmp_path):
    calls = []

    def slow_download(key):
        calls.append(key)
        time.sleep(0.2)
        return b"PAR1data"

    monkeypatch.setattr(storage, "download_parquet", slow_download)
    with cache._file_lock:
        cache._file_cache.pop("k-concurrent", None)
    paths: list[str] = []
    threads = [threading.Thread(target=lambda: paths.append(cache.get_local_parquet("k-concurrent"))) for _ in range(4)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert calls == ["k-concurrent"]
    assert len(set(paths)) == 1
