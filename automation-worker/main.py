"""SignalMint browser automation worker (Lane B) — Google Voice & web dialers."""

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel

app = FastAPI(title="SignalMint Automation Worker", version="0.1.0")


class SendRequest(BaseModel):
    profileId: int
    to: str
    text: str


@app.get("/health")
def health():
    return {"ok": True, "service": "automation-worker"}


@app.post("/send")
def send_sms(body: SendRequest, authorization: str | None = Header(default=None)):
    token = (authorization or "").replace("Bearer ", "").strip()
    expected = __import__("os").environ.get("WORKER_SERVICE_TOKEN", "")
    if expected and token != expected:
        raise HTTPException(status_code=401, detail="Unauthorized")

    # Placeholder until Playwright/PyQt6 profile automation is wired per PRD §5.4
    return {
        "ok": False,
        "status": "failed",
        "error": "Browser automation worker scaffold — configure profile and adapter",
        "profileId": body.profileId,
    }
