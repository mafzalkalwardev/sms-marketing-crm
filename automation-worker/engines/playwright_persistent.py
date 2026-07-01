"""Playwright persistent-context engine for headless DOM/BOM automation."""

from __future__ import annotations

import os
import uuid
from pathlib import Path
from typing import Any

from adapters.base import SessionStatus


class PlaywrightEngine:
    def __init__(self, profile: dict[str, Any]):
        self.profile = profile
        self.profile_id = profile.get("profileId")
        self.available = False
        try:
            from playwright.async_api import async_playwright  # noqa: F401

            self.available = os.environ.get("WORKER_SANDBOX_MODE", "true").lower() == "false"
        except ImportError:
            self.available = False

    def _profile_dir(self) -> Path:
        root = Path(os.environ.get("WORKER_PROFILES_DIR", "./profiles"))
        rel = self.profile.get("profilePath") or f"profile_{self.profile_id}"
        path = root / rel
        path.mkdir(parents=True, exist_ok=True)
        return path

    async def _with_page(self, url: str, callback):
        from playwright.async_api import async_playwright

        async with async_playwright() as p:
            context = await p.chromium.launch_persistent_context(
                user_data_dir=str(self._profile_dir()),
                headless=os.environ.get("WORKER_HEADLESS", "true").lower() != "false",
            )
            page = context.pages[0] if context.pages else await context.new_page()
            await page.goto(url, wait_until="domcontentloaded")
            try:
                return await callback(page)
            finally:
                await context.close()

    async def _detect_login(self, page, selectors: dict[str, str]) -> SessionStatus:
        login_form = selectors.get("login_form")
        if login_form and await page.locator(login_form).count() > 0:
            return SessionStatus(status="logged_out", logged_in=False, detail="login form visible")

        login_indicator = selectors.get("login_indicator")
        if login_indicator:
            logged_in = await page.locator(login_indicator).count() > 0
            return SessionStatus(
                status="logged_in" if logged_in else "logged_out",
                logged_in=logged_in,
                detail=None if logged_in else "login indicator missing",
            )

        return SessionStatus(status="unknown", logged_in=False, detail="no login selectors configured")

    async def ensure_session(self, url: str, selectors: dict[str, str]) -> SessionStatus:
        if not self.available:
            return SessionStatus(status="sandbox", logged_in=True, detail="playwright disabled")

        return await self._with_page(url, lambda page: self._detect_login(page, selectors))

    async def send_message(self, url: str, selectors: dict[str, str], to: str, text: str) -> dict[str, Any]:
        if not self.available:
            raise RuntimeError("Playwright engine not available — set WORKER_SANDBOX_MODE=false and install playwright")

        async def run(page):
            session = await self._detect_login(page, selectors)
            if not session.logged_in:
                raise RuntimeError(session.detail or "session not logged in")

            compose = selectors.get("compose_button")
            if compose:
                await page.locator(compose).first.click()

            to_input = selectors.get("to_input")
            if to_input:
                await page.locator(to_input).first.fill(to)

            msg_input = selectors.get("message_input")
            if msg_input:
                await page.locator(msg_input).first.fill(text)

            send_btn = selectors.get("send_button")
            if send_btn:
                await page.locator(send_btn).first.click()

            return {
                "providerMessageId": f"pw_{uuid.uuid4().hex[:12]}",
                "to": to,
                "text": text,
            }

        return await self._with_page(url, run)

    async def poll_messages(self, url: str, selectors: dict[str, str]) -> tuple[SessionStatus, list[dict[str, Any]]]:
        if not self.available:
            return SessionStatus(status="sandbox", logged_in=True), []

        async def run(page):
            session = await self._detect_login(page, selectors)
            if not session.logged_in:
                return session, []

            thread_sel = selectors.get("thread_messages")
            rows: list[dict[str, Any]] = []
            if thread_sel:
                locators = page.locator(thread_sel)
                count = await locators.count()
                for i in range(min(count, 10)):
                    txt = await locators.nth(i).inner_text()
                    rows.append({"text": txt, "id": f"poll_{uuid.uuid4().hex[:8]}"})
            return session, rows

        return await self._with_page(url, run)
