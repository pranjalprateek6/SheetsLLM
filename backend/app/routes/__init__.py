"""Route registration — import all routers and attach to the app."""

from fastapi import FastAPI

from .audit import router as audit_router
from .download import router as download_router
from .files import router as files_router
from .health import router as health_router
from .jobs import router as jobs_router
from .reset import router as reset_router
from .transform import router as transform_router
from .undo import router as undo_router
from .insights import router as insights_router
from .upload import router as upload_router
from .chat import router as chat_router
from .usage import router as usage_router
from .recipes import router as recipes_router
from .settings import router as settings_router


def register_routes(app: FastAPI) -> None:
    app.include_router(health_router)
    app.include_router(upload_router)
    app.include_router(transform_router)
    app.include_router(undo_router)
    app.include_router(reset_router)
    app.include_router(download_router)
    app.include_router(files_router)
    app.include_router(audit_router)
    app.include_router(insights_router)
    app.include_router(jobs_router)
    app.include_router(chat_router)
    app.include_router(usage_router)
    app.include_router(recipes_router)
    app.include_router(settings_router)
