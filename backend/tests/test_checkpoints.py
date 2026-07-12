"""Chain checkpointing — bounded replays with content-addressed Parquet
checkpoints. Correctness first: every result must equal the full replay."""

from __future__ import annotations

import time
from pathlib import Path

import duckdb
import pytest

from app import cache, engine


@pytest.fixture(autouse=True)
def _small_interval(monkeypatch):
    monkeypatch.setattr(engine, "CHECKPOINT_EVERY_N_STEPS", 3)


@pytest.fixture(autouse=True)
def _clean_checkpoints():
    def _clear():
        with cache._checkpoint_lock:
            entries = list(cache._checkpoints.values())
            cache._checkpoints.clear()
        for path, _ in entries:
            Path(path).unlink(missing_ok=True)
    _clear()
    yield
    _clear()


@pytest.fixture
def base_parquet(tmp_path):
    path = tmp_path / "base.parquet"
    duckdb.connect().execute(
        f"COPY (SELECT * FROM range(1, 6) t(a)) "
        f"TO '{str(path).replace(chr(92), '/')}' (FORMAT PARQUET)"
    )
    return str(path)


def _steps(n: int) -> list[dict]:
    """n steps, each incrementing column a by 1 → final a = base + n."""
    return [
        {"step_number": i + 1, "instruction": f"inc {i}", "sql_query": "SELECT a + 1 AS a FROM data"}
        for i in range(n)
    ]


def _values(result: dict) -> list[int]:
    return sorted(r["a"] for r in result["preview"])


def _checkpoint_count() -> int:
    with cache._checkpoint_lock:
        return len(cache._checkpoints)


class TestCorrectness:
    def test_long_chain_replays_correctly_and_checkpoints(self, base_parquet):
        result = engine.replay_transformations_local(base_parquet, _steps(7))
        assert _values(result) == [8, 9, 10, 11, 12]  # 1..5 + 7
        assert _checkpoint_count() >= 1  # materialized at step 6

    def test_short_chain_never_checkpoints(self, base_parquet):
        result = engine.replay_transformations_local(base_parquet, _steps(2))
        assert _values(result) == [3, 4, 5, 6, 7]
        assert _checkpoint_count() == 0

    def test_exact_multiple_chain(self, base_parquet):
        result = engine.replay_transformations_local(base_parquet, _steps(6))
        assert _values(result) == [7, 8, 9, 10, 11]

    def test_bulk_jump_like_recipe_apply(self, base_parquet):
        # 12 steps at once (recipe apply) — checkpoint far ahead in one go
        result = engine.replay_transformations_local(base_parquet, _steps(12))
        assert _values(result) == [13, 14, 15, 16, 17]

    def test_up_to_revert_is_correct(self, base_parquet):
        steps = _steps(8)
        engine.replay_transformations_local(base_parquet, steps)  # warm checkpoints
        reverted = engine.replay_transformations_local(base_parquet, steps, up_to=4)
        assert _values(reverted) == [5, 6, 7, 8, 9]  # 1..5 + 4

    def test_divergent_chain_misses_checkpoint(self, base_parquet):
        engine.replay_transformations_local(base_parquet, _steps(7))
        # Same length, different SQL in step 2 → must NOT reuse the checkpoint
        altered = _steps(7)
        altered[1] = {"step_number": 2, "instruction": "double",
                      "sql_query": "SELECT a * 2 AS a FROM data"}
        result = engine.replay_transformations_local(base_parquet, altered)
        # (((1..5)+1)*2) + 5 more increments
        assert _values(result) == [9, 11, 13, 15, 17]

    def test_full_result_uses_checkpoints_too(self, base_parquet):
        rows = engine.execute_full_result_local(base_parquet, _steps(7)).fetchall()
        assert sorted(r[0] for r in rows) == [8, 9, 10, 11, 12]
        assert _checkpoint_count() >= 1


class TestReuse:
    def test_incremental_steps_reuse_checkpoint(self, base_parquet, monkeypatch):
        materializations = []
        original = engine._materialize_segment

        def _spy(source, steps, out):
            materializations.append(len(steps))
            return original(source, steps, out)

        monkeypatch.setattr(engine, "_materialize_segment", _spy)

        engine.replay_transformations_local(base_parquet, _steps(7))
        assert materializations == [6]  # one checkpoint at step 6, from base

        engine.replay_transformations_local(base_parquet, _steps(8))
        assert materializations == [6]  # k still 6 — reused, nothing new

        engine.replay_transformations_local(base_parquet, _steps(9))
        # k advanced to 9: materialized FROM the step-6 checkpoint (3 steps)
        assert materializations == [6, 3]

    def test_schema_after_steps_uses_checkpoint(self, base_parquet):
        engine.replay_transformations_local(base_parquet, _steps(7))
        schema = engine.get_schema_after_steps(base_parquet, _steps(7))
        assert schema["columns"] == [{"name": "a", "dtype": "BIGINT"}]


class TestFailOpen:
    def test_checkpoint_cache_error_falls_back(self, base_parquet, monkeypatch):
        def _boom(*a, **kw):
            raise RuntimeError("cache exploded")
        monkeypatch.setattr(cache, "get_checkpoint", _boom)
        result = engine.replay_transformations_local(base_parquet, _steps(7))
        assert _values(result) == [8, 9, 10, 11, 12]

    def test_disabled_interval_means_full_replay(self, base_parquet, monkeypatch):
        monkeypatch.setattr(engine, "CHECKPOINT_EVERY_N_STEPS", 0)
        result = engine.replay_transformations_local(base_parquet, _steps(7))
        assert _values(result) == [8, 9, 10, 11, 12]
        assert _checkpoint_count() == 0


class TestCheckpointCache:
    def test_expired_checkpoint_dropped(self, tmp_path):
        p = tmp_path / "cp.parquet"
        p.write_bytes(b"x")
        cache.set_checkpoint("k1", str(p))
        with cache._checkpoint_lock:
            path, _ = cache._checkpoints["k1"]
            cache._checkpoints["k1"] = (path, time.monotonic() - 1)
        assert cache.get_checkpoint("k1") is None
        assert not p.exists()

    def test_capacity_evicts_oldest(self, tmp_path):
        for i in range(cache._MAX_CHECKPOINTS + 2):
            p = tmp_path / f"cp{i}.parquet"
            p.write_bytes(b"x")
            cache.set_checkpoint(f"k{i}", str(p))
        with cache._checkpoint_lock:
            assert len(cache._checkpoints) == cache._MAX_CHECKPOINTS

    def test_key_is_content_addressed(self):
        a = cache.checkpoint_key("/base.parquet", _steps(3))
        b = cache.checkpoint_key("/base.parquet", _steps(3))
        c = cache.checkpoint_key("/base.parquet", _steps(4))
        d = cache.checkpoint_key("/other.parquet", _steps(3))
        assert a == b
        assert a != c and a != d
