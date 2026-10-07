"""Test-only visibility into the fake LLM.

Registered only when LLM_PROVIDER=fake (see routes/__init__.py), which the
factory refuses in production, so these paths never exist on a real deploy.
End-to-end runs pair the fake with ALLOW_ANONYMOUS=true, which is what lets a
test reach them without a session.
"""
from fastapi import APIRouter

from app.llm import fake

router = APIRouter(prefix="/__fake_llm", tags=["test-only"])


@router.get("/calls")
def list_calls():
    recorded = fake.calls()
    return {"count": len(recorded), "calls": recorded}


@router.delete("/calls")
def clear_calls():
    fake.reset_calls()
    return {"count": 0}
