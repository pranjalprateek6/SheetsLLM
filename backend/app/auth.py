"""Supabase Auth — JWT verification middleware.

Tokens are verified LOCALLY against the project's JWKS (ES256/RS256
signing keys, cached ~10 min) — this removes a blocking Supabase Auth
round-trip from every authenticated request and the hard dependency on
Supabase Auth uptime. The remote get_user() check remains as a fallback
for when local verification is unavailable (JWKS unreachable, legacy
HS256 tokens). A definitively invalid token (bad signature, expired,
wrong audience) is rejected locally without any fallback.

Tradeoff, standard for JWT auth: a deleted/banned user's token stays
valid locally until it expires (Supabase access tokens live 1 hour).
"""

from __future__ import annotations

import asyncio

import logging

import jwt as pyjwt
from fastapi import HTTPException, Request

from app.config import SUPABASE_URL, SUPABASE_SERVICE_KEY

logger = logging.getLogger("sheetsllm.auth")

_supabase = None
_jwks_client = None

# Supabase access tokens carry aud=authenticated
_EXPECTED_AUDIENCE = "authenticated"
_LOCAL_ALGORITHMS = ("ES256", "RS256")
_JWKS_CACHE_SECONDS = 600


def _get_supabase():
    global _supabase
    if _supabase is None:
        from supabase import create_client

        if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
            raise RuntimeError(
                "SUPABASE_URL and SUPABASE_SERVICE_KEY must be set"
            )
        _supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    return _supabase


def _get_jwks_client() -> pyjwt.PyJWKClient:
    global _jwks_client
    if _jwks_client is None:
        if not SUPABASE_URL:
            raise RuntimeError("SUPABASE_URL must be set")
        _jwks_client = pyjwt.PyJWKClient(
            f"{SUPABASE_URL}/auth/v1/.well-known/jwks.json",
            cache_keys=True,
            lifespan=_JWKS_CACHE_SECONDS,
        )
    return _jwks_client


def _verify_local(token: str) -> dict | None:
    """Verify the JWT against the cached JWKS.

    Returns the claims on success, or None when local verification is not
    possible for this token (e.g. legacy HS256 — the caller falls back to
    the remote check). Raises jwt.InvalidTokenError when the token is
    definitively invalid, and other exceptions on JWKS infrastructure
    failures (also handled by falling back).
    """
    header = pyjwt.get_unverified_header(token)
    alg = header.get("alg")
    if alg not in _LOCAL_ALGORITHMS:
        return None
    signing_key = _get_jwks_client().get_signing_key_from_jwt(token)
    return pyjwt.decode(
        token,
        signing_key.key,
        algorithms=[alg],
        audience=_EXPECTED_AUDIENCE,
        options={"require": ["exp", "sub"]},
    )


async def verify_token(request: Request) -> dict:
    """
    Verify Supabase JWT from Authorization header.
    Returns {"user_id": str, "email": str}.
    Raises HTTPException(401) on failure.
    """
    auth_header = request.headers.get("authorization", "")
    if not auth_header.lower().startswith("bearer "):
        raise HTTPException(
            status_code=401,
            detail={"code": "UNAUTHORIZED", "message": "Missing bearer token"},
        )

    token = auth_header[7:].strip()
    if not token:
        raise HTTPException(
            status_code=401,
            detail={"code": "UNAUTHORIZED", "message": "Empty bearer token"},
        )

    # ── Local verification (no network after the JWKS is cached) ──────
    try:
        # First call fetches the JWKS (blocking urllib) — keep it off
        # the event loop; cached calls return in microseconds.
        claims = await asyncio.to_thread(_verify_local, token)
    except pyjwt.InvalidTokenError as exc:
        # Definitively invalid: bad signature / expired / wrong audience.
        # No remote fallback — Supabase would reject it too.
        logger.warning("Token rejected locally: %s", exc)
        raise HTTPException(
            status_code=401,
            detail={"code": "UNAUTHORIZED", "message": "Invalid or expired token"},
        ) from exc
    except Exception as exc:
        # JWKS unreachable / unknown kid / misconfiguration — fall back
        # to the remote check rather than locking everyone out.
        logger.warning("Local JWT verify unavailable (%s); using Supabase", exc)
        claims = None

    if claims is not None:
        return {"user_id": claims["sub"], "email": claims.get("email", "")}

    # ── Remote fallback ────────────────────────────────────────────────
    try:
        supabase = _get_supabase()
        # Blocking network call — offload so a slow Supabase Auth response
        # can't stall the event loop for every other in-flight request.
        user_resp = await asyncio.to_thread(supabase.auth.get_user, token)
        user = user_resp.user
        return {"user_id": user.id, "email": user.email}
    except Exception as exc:
        logger.warning("Token verification failed: %s", exc)
        raise HTTPException(
            status_code=401,
            detail={"code": "UNAUTHORIZED", "message": "Invalid or expired token"},
        ) from exc


# Public routes that skip auth. The Razorpay webhook authenticates via its
# own HMAC signature header, not a JWT. /docs and /openapi.json only exist
# outside production (gated in main.py).
PUBLIC_PATHS = frozenset(
    {"/health", "/docs", "/openapi.json", "/billing/webhook"}
)
