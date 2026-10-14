"""SheetsLLM — FastAPI application entry point."""

from __future__ import annotations

import asyncio
import logging
import uuid

from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.responses import JSONResponse

from app.auth import PUBLIC_PATHS, PUBLIC_PREFIXES, verify_token
from app import cache
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
    "/transform/op": 90,  # one-click fixes replay every step on big files
    "/download": 60,
    "/chat": 90,
    "/insights": 30,  # a budgeted pass over the file as its steps left it
    # Everything that replays a file's steps gets the same room a fix does:
    # a recipe run, undo, reset, redo and revert, a shared link, the lookups
    "/recipes": 90,
    "/undo": 90,
    "/reset": 90,
    "/files": 90,
    "/shared": 60,
    "/schedules": 300,  # fetches and runs every recipe due today
}
_DEFAULT_TIMEOUT = 10

# What the 504 says, by what was being done. A person reads the operation,
# not the number of seconds.
_TIMEOUT_WHAT = {
    "/upload": "The upload",
    "/transform/op": "That fix",
    "/download": "The export",
    "/chat": "Chef",
    "/insights": "The look at your file",
    "/recipes": "The recipe run",
    "/undo": "Undo",
    "/reset": "Going back",
    "/files": "That step",
    "/shared": "The shared file",
    "/schedules": "The scheduled runs",
}


# ── Lifespan (cache eviction background task) ────────────────────────


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Run periodic cache cleanup while the app is alive."""
    async def _eviction_loop():
        while True:
            await asyncio.sleep(300)
            try:
                await asyncio.to_thread(cache.evict_expired)
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
        request_id = getattr(request.state, "request_id", "")
        logger.warning("Request timeout: %s %s (%ds) [%s]", request.method, path, timeout, request_id)
        what = next((w for prefix, w in _TIMEOUT_WHAT.items() if path.startswith(prefix)), "That")
        return JSONResponse(
            status_code=504,
            content={
                "code": "REQUEST_TIMEOUT",
                "message": f"{what} took more than {timeout} seconds and was stopped.",
                "request_id": request_id,
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

    if request.method == "OPTIONS" or path in PUBLIC_PATHS or path.startswith(PUBLIC_PREFIXES):
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


# ── The last line of defence ─────────────────────────────────────────


@app.exception_handler(Exception)
async def unhandled_error(request: Request, exc: Exception):
    """A crash answers in the same JSON shape as every other error, with
    the request id, so "it broke" comes back as something searchable in
    the log. Starlette logs the traceback itself."""
    request_id = getattr(request.state, "request_id", "")
    logger.error("Unhandled error on %s %s [%s]: %s", request.method, request.url.path, request_id, exc)
    import httpx

    if isinstance(exc, (httpx.TimeoutException, httpx.ConnectError)):
        # The database (or storage) did not answer: say so, the status page says the same
        return JSONResponse(
            status_code=503,
            content={
                "code": "DB_UNAVAILABLE",
                "message": "The database isn't answering right now. It may be waking up; try again in a minute.",
                "request_id": request_id,
            },
            headers={"x-request-id": request_id} if request_id else None,
        )
    return JSONResponse(
        status_code=500,
        content={
            "code": "INTERNAL",
            "message": "Something went wrong on our side. Try again; if it keeps happening, tell us the reference.",
            "request_id": request_id,
        },
        headers={"x-request-id": request_id} if request_id else None,
    )


# ── Routes ────────────────────────────────────────────────────────────
register_routes(app)
