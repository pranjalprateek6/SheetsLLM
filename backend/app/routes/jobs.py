"""GET /jobs/{job_id} — Poll async job status."""

from __future__ import annotations

import json

from fastapi import APIRouter, Request, Response

from app import jobs

router = APIRouter()


def _json_response(status: int, code: str, message: str) -> Response:
    payload = {"code": code, "message": message}
    return Response(
        json.dumps(payload), status_code=status, media_type="application/json"
    )


@router.get("/jobs/{job_id}")
async def get_job(request: Request, job_id: str):
    user_id = getattr(request.state, "user_id", "anonymous")
    job = jobs.get_job(job_id, user_id=user_id)
    if not job:
        return _json_response(404, "JOB_NOT_FOUND", "Job not found")
    return job
