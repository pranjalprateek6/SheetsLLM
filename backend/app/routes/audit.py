"""GET /audit — Audit log endpoint."""

from __future__ import annotations

from fastapi import APIRouter, Query, Request

from app import db

router = APIRouter()


@router.get("/audit/{file_id}")
async def get_audit_log(
    request: Request,
    file_id: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    user_id = getattr(request.state, "user_id", "anonymous")

    # Verify file ownership
    file_rec = db.get_file(file_id, user_id)
    if not file_rec:
        from fastapi.responses import JSONResponse

        return JSONResponse(
            status_code=404,
            content={"code": "FILE_NOT_FOUND", "message": "File not found"},
        )

    result = db.list_audit_entries(file_id, page=page, page_size=page_size)
    return {
        "entries": result["items"],
        "total": result["total"],
        "page": page,
        "page_size": page_size,
    }
