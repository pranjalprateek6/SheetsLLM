"""SheetsLLM — FastAPI application entry point."""

from __future__ import annotations

import asyncio
import logging
import uuid

from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.responses import JSONResponse

from app.auth import PUBLIC_PATHS, verify_token
from app import cache, jobs
from app.config import ALLOW_ANONYMOUS, ALLOWED_ORIGINS, IS_PRODUCTION
from app.routes import register_routes

# ── Logging ───────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s — %(message)s",
)
logger = logging.getLogger("sheetsllm")

# ── Per-route timeout map (seconds) ──────────────────────────────────
# LLM routes must be able to outlast their worst legitimate case: one
# 40s Gemini call, a 2s backoff, and one retry (see llm/adapter.py and
# the 40s client timeout in gemini_client.py) — otherwise the middleware
# kills requests that are still working and the user sees a generic
# timeout instead of an answer.
_ROUTE_TIMEOUTS = {
    "/upload": 120,
    "/transform": 90,
    "/download": 60,
    "/chat": 90,
}
_DEFAULT_TIMEOUT = 10


# ── Lifespan (cache eviction background task) ────────────────────────


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Run periodic cache/job cleanup while the app is alive."""
    # Any persisted job still "processing" belonged to the previous
    # (dead) process — fail it so pollers stop waiting.
    try:
        await asyncio.to_thread(jobs.sweep_orphaned)
    except Exception:
        pass

    async def _eviction_loop():
        while True:
            await asyncio.sleep(300)
            try:
                await asyncio.to_thread(cache.evict_expired)
                await asyncio.to_thread(jobs.evict_expired)
            except Exception:
                pass

    task = asyncio.create_task(_eviction_loop())
    yield
    task.cancel()


# ── App ───────────────────────────────────────────────────────────────
# API docs are a dev convenience; in production they just map the attack
# surface for free. Gating openapi_url disables /docs and /redoc with it.
app = FastAPI(
    title="SheetsLLM",
    version="1.0.0",
    lifespan=lifespan,
    docs_url=None if IS_PRODUCTION else "/docs",
    redoc_url=None,
    openapi_url=None if IS_PRODUCTION else "/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Middleware ────────────────────────────────────────────────────────


@app.middleware("http")
async def security_headers_middleware(request: Request, call_next):
    """Add security headers to all responses."""
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Strict-Transport-Security"] = (
        "max-age=31536000; includeSubDomains"
    )
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = (
        "camera=(), microphone=(), geolocation=()"
    )
    return response


@app.middleware("http")
async def request_timeout_middleware(request: Request, call_next):
    """Enforce per-route request timeouts."""
    path = request.url.path.rstrip("/")
    timeout = _DEFAULT_TIMEOUT
    for route_prefix, t in _ROUTE_TIMEOUTS.items():
        if path.startswith(route_prefix) or path.endswith(route_prefix):
            timeout = t
            break

    try:
        response = await asyncio.wait_for(call_next(request), timeout=timeout)
        return response
    except asyncio.TimeoutError:
        logger.warning("Request timeout: %s %s (%ds)", request.method, path, timeout)
        return JSONResponse(
            status_code=504,
            content={
                "code": "REQUEST_TIMEOUT",
                "message": f"Request exceeded {timeout}s time limit",
            },
        )


@app.middleware("http")
async def request_id_middleware(request: Request, call_next):
    """Attach a unique request ID to every request."""
    request_id = str(uuid.uuid4())
    request.state.request_id = request_id
    response = await call_next(request)
    response.headers["x-request-id"] = request_id
    return response


@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    """Verify Supabase JWT for protected routes."""
    path = request.url.path.rstrip("/")

    if request.method == "OPTIONS" or path in PUBLIC_PATHS:
        return await call_next(request)

    try:
        user = await verify_token(request)
        request.state.user_id = user["user_id"]
        request.state.email = user.get("email", "")
    except Exception as exc:
        if ALLOW_ANONYMOUS:
            # Explicit dev-mode opt-in: proceed as "anonymous"
            request.state.user_id = "anonymous"
            request.state.email = ""
        else:
            if isinstance(exc, HTTPException) and isinstance(exc.detail, dict):
                status, detail = exc.status_code, exc.detail
            else:
                logger.warning("Auth failure on %s: %s", path, exc)
                status = 401
                detail = {"code": "UNAUTHORIZED", "message": "Authentication required"}
            return JSONResponse(status_code=status, content=detail)

    return await call_next(request)


# ── Routes ────────────────────────────────────────────────────────────
register_routes(app)
