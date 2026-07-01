import os
import time
import uuid
from typing import Any

from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

from adapters import get_adapter
from session_store import get_session, update_session

load_dotenv()

app = FastAPI(title="SignalMint Automation Worker", version="1.1.0")


class ProfilePayload(BaseModel):
    profileId: int
    providerId: int | None = None
    adapterId: str = "google_voice"
    engine: str = "playwright_persistent"
    baseUrl: str = ""
    selectors: dict[str, str] = Field(default_factory=dict)
    profilePath: str = ""
    to: str = ""
    text: str = ""
    rateLimitPerSecond: int = 1
    dailyCap: int | None = None


def verify_token(authorization: str | None) -> None:
    expected = os.environ.get("WORKER_SERVICE_TOKEN", "")
    if not expected:
        return
    token = (authorization or "").replace("Bearer ", "").strip()
    if token != expected:
        raise HTTPException(status_code=401, detail="Unauthorized")


@app.get("/health")
def health():
    sandbox = os.environ.get("WORKER_SANDBOX_MODE", "true").lower() != "false"
    playwright = False
    try:
        import playwright  # noqa: F401

        playwright = True
    except ImportError:
        playwright = False
    return {
        "ok": True,
        "service": "automation-worker",
        "version": "1.1.0",
        "sandboxMode": sandbox,
        "playwrightInstalled": playwright,
        "engines": ["playwright_persistent", "sandbox"],
        "adapters": ["google_voice", "advertiser", "generic_web_dialer"],
        "profilesDir": os.environ.get("WORKER_PROFILES_DIR", "./profiles"),
    }


@app.get("/adapters")
def list_adapters():
    return {
        "adapters": [
            {"id": "google_voice", "baseUrl": "https://voice.google.com", "lane": "browser"},
            {"id": "advertiser", "baseUrl": "", "lane": "browser"},
        ]
    }


@app.post("/send")
async def send_sms(body: ProfilePayload, authorization: str | None = Header(default=None)):
    verify_token(authorization)
    adapter = get_adapter(body.model_dump())
    result = await adapter.send_sms(body.to, body.text)
    if result.raw.get("needsRelogin"):
        update_session(body.profileId, result.raw.get("sessionStatus", "logged_out"), False, result.error)
    elif result.ok:
        update_session(body.profileId, "logged_in", True)
    return {
        "ok": result.ok,
        "status": result.status,
        "providerMessageId": result.provider_message_id,
        "mode": result.mode,
        "error": result.error,
        "adapterId": body.adapterId,
        "profileId": body.profileId,
        "needsRelogin": bool(result.raw.get("needsRelogin")),
        "sessionStatus": result.raw.get("sessionStatus"),
        "raw": result.raw,
    }


@app.post("/session/login")
async def session_login(body: ProfilePayload, authorization: str | None = Header(default=None)):
    verify_token(authorization)
    adapter = get_adapter(body.model_dump())
    session = await adapter.ensure_session()
    update_session(body.profileId, session.status, session.logged_in, session.detail)
    return {
        "ok": True,
        "sessionStatus": session.status,
        "loggedIn": session.logged_in,
        "detail": session.detail,
        "profileId": body.profileId,
        "adapterId": body.adapterId,
        "note": "Complete login in browser profile if interactive 2FA is required",
    }


@app.post("/session/status")
async def session_status(body: ProfilePayload, authorization: str | None = Header(default=None)):
    verify_token(authorization)
    adapter = get_adapter(body.model_dump())
    session = await adapter.ensure_session()
    update_session(body.profileId, session.status, session.logged_in, session.detail)
    cached = get_session(body.profileId) or {}
    return {
        "ok": True,
        "profileId": body.profileId,
        "sessionStatus": session.status,
        "loggedIn": session.logged_in,
        "detail": session.detail,
        "checkedAt": cached.get("checkedAt"),
        "mode": "sandbox" if session.status == "sandbox" else "browser",
    }


@app.get("/session/{profile_id}/status")
async def session_status_legacy(profile_id: int, authorization: str | None = Header(default=None)):
    verify_token(authorization)
    cached = get_session(profile_id)
    if cached:
        return {"ok": True, "profileId": profile_id, **cached, "mode": "cached"}
    return {
        "ok": True,
        "profileId": profile_id,
        "sessionStatus": "unknown",
        "note": "POST /session/status with full profile payload for live session checks",
    }


@app.post("/poll/inbound")
async def poll_inbound(body: ProfilePayload, authorization: str | None = Header(default=None)):
    verify_token(authorization)
    adapter = get_adapter(body.model_dump())
    session = await adapter.ensure_session()
    update_session(body.profileId, session.status, session.logged_in, session.detail)

    if not session.logged_in and session.status != "sandbox":
        return {
            "ok": True,
            "adapterId": body.adapterId,
            "profileId": body.profileId,
            "sessionStatus": session.status,
            "needsRelogin": True,
            "inbound": [],
        }

    events = await adapter.poll_inbound()
    last_session = getattr(adapter, "last_session", None)
    if last_session:
        update_session(body.profileId, last_session.status, last_session.logged_in, last_session.detail)
        session_status = last_session.status
    else:
        session_status = session.status

    return {
        "ok": True,
        "adapterId": body.adapterId,
        "profileId": body.profileId,
        "sessionStatus": session_status,
        "inbound": [
            {
                "from": e.from_number,
                "to": e.to_number,
                "text": e.text,
                "providerMessageId": e.provider_message_id or f"in_{uuid.uuid4().hex[:8]}",
            }
            for e in events
        ],
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", "5055")))
