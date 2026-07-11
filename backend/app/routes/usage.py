"""GET /usage — current month's usage counters and tier limits."""

from __future__ import annotations

from fastapi import APIRouter, Request

from app import usage

router = APIRouter()


@router.get("/usage")
async def get_usage(request: Request):
    user_id = getattr(request.state, "user_id", "anonymous")
    return usage.summary(user_id)
