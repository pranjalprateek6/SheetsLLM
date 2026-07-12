"""Supabase Auth — JWT verification middleware."""

from __future__ import annotations

import asyncio

import logging

from fastapi import HTTPException, Request

from app.config import SUPABASE_URL, SUPABASE_SERVICE_KEY

logger = logging.getLogger("sheetsllm.auth")

_supabase = None


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
