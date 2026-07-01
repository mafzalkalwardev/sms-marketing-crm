"""Google Voice DOM/BOM adapter — voice.google.com."""

from __future__ import annotations

import uuid

from .base import BrowserAdapter, InboundEvent, SendResult, SessionStatus
from .sandbox import SandboxBrowserAdapter
from engines.playwright_persistent import PlaywrightEngine


class GoogleVoiceAdapter(BrowserAdapter):
    adapter_id = "google_voice"

    def __init__(self, profile):
        super().__init__(profile)
        self.engine = PlaywrightEngine(profile)
        self._fallback = SandboxBrowserAdapter(profile)

    async def ensure_session(self) -> SessionStatus:
        if not self.engine.available:
            return await self._fallback.ensure_session()
        return await self.engine.ensure_session(self.base_url or "https://voice.google.com", self.selectors)

    async def send_sms(self, to: str, text: str) -> SendResult:
        if not self.engine.available:
            result = await self._fallback.send_sms(to, text)
            result.raw["adapter"] = self.adapter_id
            return result

        session = await self.ensure_session()
        if not session.logged_in and session.status != "sandbox":
            return SendResult(
                ok=False,
                status="failed",
                error=session.detail or "session logged out — re-login required",
                mode="browser",
                raw={"needsRelogin": True, "sessionStatus": session.status},
            )

        try:
            page_result = await self.engine.send_message(
                url=self.base_url or "https://voice.google.com",
                selectors=self.selectors,
                to=to,
                text=text,
            )
            return SendResult(
                ok=True,
                provider_message_id=page_result.get("providerMessageId") or f"gv_{uuid.uuid4().hex[:12]}",
                status="sent",
                mode="browser",
                raw=page_result,
            )
        except Exception as exc:  # noqa: BLE001
            return SendResult(ok=False, status="failed", error=str(exc), mode="browser")

    async def poll_inbound(self) -> list[InboundEvent]:
        if not self.engine.available:
            return []
        session, rows = await self.engine.poll_messages(
            url=self.base_url or "https://voice.google.com",
            selectors=self.selectors,
        )
        self._last_session = session
        return [
            InboundEvent(
                from_number=row.get("from", ""),
                to_number=row.get("to", ""),
                text=row.get("text", ""),
                provider_message_id=row.get("id"),
            )
            for row in rows
        ]

    @property
    def last_session(self) -> SessionStatus | None:
        return getattr(self, "_last_session", None)
