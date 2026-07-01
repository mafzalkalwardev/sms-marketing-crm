"""Browser adapter base contract — DOM/BOM automation."""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any


@dataclass
class SendResult:
    ok: bool
    provider_message_id: str | None = None
    status: str = "sent"
    error: str | None = None
    mode: str = "browser"
    raw: dict[str, Any] = field(default_factory=dict)


@dataclass
class InboundEvent:
    from_number: str
    to_number: str
    text: str
    provider_message_id: str | None = None


@dataclass
class SessionStatus:
    status: str
    logged_in: bool
    detail: str | None = None


class BrowserAdapter(ABC):
    adapter_id: str = "base"

    def __init__(self, profile: dict[str, Any]):
        self.profile = profile
        self.selectors = profile.get("selectors") or {}
        self.base_url = profile.get("baseUrl") or ""
        self.profile_path = profile.get("profilePath") or ""

    @abstractmethod
    async def ensure_session(self) -> SessionStatus:
        raise NotImplementedError

    @abstractmethod
    async def send_sms(self, to: str, text: str) -> SendResult:
        raise NotImplementedError

    @abstractmethod
    async def poll_inbound(self) -> list[InboundEvent]:
        raise NotImplementedError

    async def health(self) -> dict[str, Any]:
        session = await self.ensure_session()
        return {
            "ok": True,
            "adapterId": self.adapter_id,
            "sessionStatus": session.status,
            "loggedIn": session.logged_in,
        }
