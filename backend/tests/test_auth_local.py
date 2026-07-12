"""Local JWT verification — ES256 against JWKS, remote fallback semantics."""

from __future__ import annotations

import asyncio
import time
import types

import jwt as pyjwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi import HTTPException

from app import auth


@pytest.fixture(scope="module")
def keypair():
    private = ec.generate_private_key(ec.SECP256R1())
    return private, private.public_key()


@pytest.fixture
def local_jwks(monkeypatch, keypair):
    """Stub the JWKS client to return our test public key."""
    _, public = keypair

    class _StubJWKS:
        def get_signing_key_from_jwt(self, token):
            return types.SimpleNamespace(key=public)

    monkeypatch.setattr(auth, "_get_jwks_client", lambda: _StubJWKS())


@pytest.fixture
def remote_must_not_be_called(monkeypatch):
    def _boom():
        raise AssertionError("remote Supabase verification must not be used")
    monkeypatch.setattr(auth, "_get_supabase", _boom)


def _token(private_key, *, sub="user-123", email="u@example.com",
           aud="authenticated", exp_delta=3600, alg="ES256", **extra) -> str:
    claims = {
        "sub": sub, "email": email, "aud": aud,
        "exp": int(time.time()) + exp_delta,
        **extra,
    }
    return pyjwt.encode(claims, private_key, algorithm=alg)


def _request(token: str | None) -> types.SimpleNamespace:
    headers = {"authorization": f"Bearer {token}"} if token else {}
    return types.SimpleNamespace(headers=headers)


def _verify(token: str | None) -> dict:
    return asyncio.run(auth.verify_token(_request(token)))


class TestLocalVerify:
    def test_valid_token_verified_without_remote(
        self, keypair, local_jwks, remote_must_not_be_called
    ):
        private, _ = keypair
        user = _verify(_token(private))
        assert user == {"user_id": "user-123", "email": "u@example.com"}

    def test_expired_token_401_without_remote(
        self, keypair, local_jwks, remote_must_not_be_called
    ):
        private, _ = keypair
        with pytest.raises(HTTPException) as exc:
            _verify(_token(private, exp_delta=-60))
        assert exc.value.status_code == 401

    def test_wrong_signature_401_without_remote(
        self, keypair, local_jwks, remote_must_not_be_called
    ):
        other = ec.generate_private_key(ec.SECP256R1())
        with pytest.raises(HTTPException) as exc:
            _verify(_token(other))
        assert exc.value.status_code == 401

    def test_wrong_audience_401(self, keypair, local_jwks, remote_must_not_be_called):
        private, _ = keypair
        with pytest.raises(HTTPException) as exc:
            _verify(_token(private, aud="something-else"))
        assert exc.value.status_code == 401

    def test_missing_header_401(self, local_jwks, remote_must_not_be_called):
        with pytest.raises(HTTPException) as exc:
            _verify(None)
        assert exc.value.status_code == 401


class TestFallback:
    def test_jwks_failure_falls_back_to_remote(self, keypair, monkeypatch):
        private, _ = keypair

        def _jwks_down():
            raise RuntimeError("jwks unreachable")
        monkeypatch.setattr(auth, "_get_jwks_client", _jwks_down)

        fake_user = types.SimpleNamespace(
            user=types.SimpleNamespace(id="remote-user", email="r@example.com")
        )
        monkeypatch.setattr(auth, "_get_supabase", lambda: types.SimpleNamespace(
            auth=types.SimpleNamespace(get_user=lambda tok: fake_user)
        ))

        user = _verify(_token(private))
        assert user == {"user_id": "remote-user", "email": "r@example.com"}

    def test_hs256_token_falls_back_to_remote(self, monkeypatch):
        # Legacy HS256 tokens can't be verified via JWKS — remote handles them
        token = pyjwt.encode(
            {"sub": "legacy", "aud": "authenticated",
             "exp": int(time.time()) + 3600},
            "shared-secret", algorithm="HS256",
        )
        fake_user = types.SimpleNamespace(
            user=types.SimpleNamespace(id="legacy", email="l@example.com")
        )
        monkeypatch.setattr(auth, "_get_supabase", lambda: types.SimpleNamespace(
            auth=types.SimpleNamespace(get_user=lambda tok: fake_user)
        ))

        user = _verify(token)
        assert user["user_id"] == "legacy"

    def test_garbage_token_401(self, monkeypatch):
        # Not even a JWT — rejected locally, and the remote fallback also fails
        def _remote_rejects():
            raise RuntimeError("remote would reject too")
        monkeypatch.setattr(auth, "_get_supabase", _remote_rejects)
        with pytest.raises(HTTPException) as exc:
            _verify("not-a-jwt-at-all")
        assert exc.value.status_code == 401
