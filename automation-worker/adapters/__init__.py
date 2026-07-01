"""Sandbox adapter — simulates DOM/BOM sends without a real browser."""

from __future__ import annotations

import time
import uuid
from typing import Any

from .base import BrowserAdapter, InboundEvent, SendResult, SessionStatus


class SandboxBrowserAdapter(BrowserAdapter):
    adapter_id = "sandbox"

    async def ensure_session(self) -> SessionStatus:
        return SessionStatus(status="logged_in", logged_in=True, detail="sandbox session")

    async def send_sms(self, to: str, text: str) -> SendResult:
        return SendResult(
            ok=True,
            provider_message_id=f"browser_mock_{int(time.time())}_{uuid.uuid4().hex[:8]}",
            status="sent",
            mode="sandbox",
            raw={"simulated": True, "to": to, "text": text[:120]},
        )

    async def poll_inbound(self) -> list[InboundEvent]:
        return []


def get_adapter(profile: dict[str, Any]) -> BrowserAdapter:
    adapter_id = profile.get("adapterId") or "sandbox"
    engine = profile.get("engine") or "playwright_persistent"

    if _sandbox_mode():
        return SandboxBrowserAdapter(profile)

    if adapter_id == "google_voice":
        from .google_voice import GoogleVoiceAdapter

        return GoogleVoiceAdapter(profile)

    if adapter_id in ("advertiser", "browser_advertiser"):
        from .generic_web_dialer import GenericWebDialerAdapter

        return GenericWebDialerAdapter(profile)

    from .generic_web_dialer import GenericWebDialerAdapter

    return GenericWebDialerAdapter(profile)


def _sandbox_mode() -> bool:
    import os

    if os.environ.get("WORKER_SANDBOX_MODE", "true").lower() == "false":
        return False
    # Use sandbox when Playwright is unavailable
    try:
        import playwright  # noqa: F401

        return os.environ.get("WORKER_SANDBOX_MODE", "true").lower() != "false"
    except ImportError:
        return True
