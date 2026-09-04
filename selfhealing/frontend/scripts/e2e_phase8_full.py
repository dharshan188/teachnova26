"""BuildHub Phase 8 browser E2E — Security Command Center (real Groq pipeline).

Covers: guest redirect, security view (Live · Real badge, LIVE findings /
incidents banners, operator actions), incident detail with REAL agent runs,
pipeline page honesty copy, live shell status (Groq Online / Telegram
Configured), operator Test Telegram, PDF report download, and mobile overflow.

Presence verifies that Phase 7-era "Simulation mode."/[SimLabel] copy is gone.

State: works against either a clean or a smoke'd database — expectations are
derived from the authenticated /api/security/status payload right before the
page assertions.

Expected-network policy: no unexpected 4xx/5xx on authed pages and no console
errors (other than the pre-login /api/auth/me 401 tolerated on guest pages).
"""

import json
import re
import time

from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000"
passed = 0
failed = 0
problems = []


def check(name, cond, extra=""):
    global passed, failed
    if cond:
        passed += 1
        print(f"  ok  {name}")
    else:
        failed += 1
        print(f"FAIL  {name} {extra}")
        problems.append(name)


def watch(page):
    hits = {"errors": [], "http": []}

    def on_console(msg):
        if msg.type == "error":
            hits["errors"].append(msg.text)

    def on_pageerror(err):
        hits["errors"].append(str(err))

    def on_response(resp):
        url = resp.url
        status = resp.status
        if not url.startswith(BASE):
            return
        # tolerated: /api/auth/me firing 401 before login completes
        if url.endswith("/api/auth/me") and status == 401:
            return
        if status >= 400:
            hits["http"].append(f"{status} {url}")

    page.on("console", on_console)
    page.on("pageerror", on_pageerror)
    page.on("response", on_response)
    return hits


def status_via_api(ctx):
    """Grab the operator status payload through the browser context's API."""
    api = ctx.request
    api.post(f"{BASE}/api/auth/login", data={"identifier": "arjun", "password": "buildhub-demo1"})
    resp = api.get(f"{BASE}/api/security/status")
    if resp.status != 200:
        return None
    return json.loads(resp.body())


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context()
        page = ctx.new_page()
        page.set_default_timeout(20000)

        # ---- guest: /ai/security is protected ----
        page.goto(f"{BASE}/ai/security")
        page.wait_for_load_state("networkidle")
        check("Guest /ai/security redirects to /login", re.search(r"/login", page.url) is not None, page.url)
        check("Guest never sees command center content", "Mission Control" not in page.content())

        # ---- login as operator ----
        page.goto(f"{BASE}/login")
        page.get_by_label("Email or username", exact=True).fill("arjun")
        page.get_by_label("Password", exact=True).fill("buildhub-demo1")
        page.get_by_role("button", name="Log in").click()
        page.wait_for_url("**/feed")
        page.wait_for_load_state("networkidle")

        # enter Command Center shell (sidebar with Security)
        cc_link = page.get_by_role("link", name="Command Center")
        check("Sidebar exposes Command Center for authed user", cc_link.first.is_visible())
        cc_link.first.click()
        page.wait_for_url(re.compile(r"/ai$"))
        page.wait_for_load_state("networkidle")

        # ---- Security view ----
        page.get_by_role("link", name="Security").first.click()
        page.wait_for_url(re.compile(r"/ai/security$"))
        page.get_by_text("Mission Control").first.wait_for(timeout=20000)
        page.get_by_text("Live · Real", exact=True).first.wait_for(timeout=10000)
        check("Security renders 'Mission Control' heading", page.get_by_text("Mission Control").first.is_visible())
        check("Security renders H1 'Security'", page.get_by_role("heading", name="Security").first.is_visible())
        check("Live · Real badge visible", page.get_by_text("Live · Real", exact=True).first.is_visible())
        check("No 'Simulation mode.' copy on Security view", page.get_by_text(re.compile(r"Simulation\s?mode", re.I)).count() == 0)

        # derive expectations from the live status API
        status = status_via_api(ctx)
        check("Status API reachable for operator", status is not None)
        risk = (status or {}).get("overview", {}).get("riskScore", 0)
        active = (status or {}).get("overview", {}).get("activeIncidents", 0)

        if risk == 0:
            page.get_by_text("ALL SYSTEMS SECURE").first.wait_for(timeout=20000)
            check("Clean state shows ALL SYSTEMS SECURE banner", True)
        else:
            page.get_by_text(re.compile(r"RISK \d+"), exact=False).first.wait_for(timeout=20000)
            check("Active state shows risk banner", True)
        check(
            "Groq model panel visible",
            page.get_by_text(re.compile(r"Model: .*qwen|Model: .*groq|Model: .*llama", re.I)).count() > 0,
        )
        check(
            "Provider labeled groq",
            page.get_by_text(re.compile(r"provider groq", re.I)).count() > 0,
        )
        check(
            "Telegram connectivity panel",
            page.get_by_text(re.compile(r"configured → \d+", re.I)).count() > 0,
        )

        # operator-only action
        if page.get_by_role("button", name="Test Telegram").count() > 0:
            page.get_by_role("button", name="Test Telegram").click()
            page.get_by_text(re.compile(r"Test message sent \(id \d+\)|Test failed", re.I)).wait_for(timeout=30000)
            test_ok = page.get_by_text(re.compile(r"Test message sent \(id \d+\)", re.I)).count() > 0
            check("Test Telegram operator action sends a real message", test_ok)

        if active > 0:
            check("Real pipeline mode indicated", page.get_by_text("mode=REAL via Groq", exact=False).count() > 0)
            page.locator('a[href*="/ai/incidents/"]').first.wait_for(timeout=20000)
            page.locator('a[href*="/ai/incidents/"]').first.click()
            check("Incident(s) listed with refs", True)
        else:
            check("No incidents → empty state", page.get_by_text("No incidents have been promoted yet.", exact=True).count() > 0)

        net = watch(page)
        page.reload()
        page.wait_for_load_state("networkidle")
        errs = net
        check("Security view: no console errors", errs["errors"] == [], f"{errs['errors'][:3]}")
        bad_http = [h for h in errs["http"] if h.startswith(("4", "5"))]
        check("Security view: no unexpected API 4xx/5xx", not bad_http, f"{bad_http[:5]}")

        # ---- Pipeline page honesty ----
        page.get_by_role("link", name="AI Pipeline").first.click()
        page.wait_for_url(re.compile(r"/ai/pipeline$"))
        page.get_by_text("Live · Real", exact=True).first.wait_for(timeout=20000)
        check("Pipeline shows Live · Real badge", True)
        check("Pipeline: no simulation preview copy", page.get_by_text(re.compile(r"simulation preview|Simulated", re.I)).count() == 0)
        check("Pipeline shows Fixer stage", page.get_by_text(re.compile(r"FIXER", re.I)).count() > 0)
        check("Pipeline shows Critic stage", page.get_by_text(re.compile(r"CRITIC", re.I)).count() > 0)
        check("Pipeline shows Judge stage", page.get_by_text(re.compile(r"JUDGE", re.I)).count() > 0)

        # ---- Incident detail ----
        if active > 0:
            page.get_by_role("link", name="Incidents").first.click()
            page.wait_for_url(re.compile(r"/ai/incidents$"))
            page.locator('a[href*="/ai/incidents/"]').first.wait_for(timeout=20000)
            page.locator('a[href*="/ai/incidents/"]').first.click()
            page.wait_for_url(re.compile(r"/ai/incidents/"))
            page.get_by_text("AI Pipeline", exact=True).first.wait_for(timeout=20000)
            page.get_by_text("Live · Real", exact=True).first.wait_for(timeout=10000)
            check("Detail shows Live · Real badge", page.get_by_text("Live · Real", exact=True).first.is_visible())
            check("Detail: no simulation copy", page.get_by_text(re.compile(r"simulated|Simulation", re.I)).count() == 0)
            page.get_by_role("button", name=re.compile(r"Download report", re.I)).first.wait_for(timeout=10000)
            check("Detail shows Download report button", page.get_by_role("button", name=re.compile(r"Download report", re.I)).count() > 0)

        # ---- Report download on Reports page ----
        page.get_by_role("link", name="Reports").first.click()
        page.wait_for_url(re.compile(r"/ai/reports$"))
        page.get_by_text("Download PDF", exact=True).first.wait_for(timeout=20000)
        page.get_by_role("button", name="Download PDF").first.click()
        page.get_by_text(re.compile(r"Report downloaded as .*\.pdf", re.I)).wait_for(timeout=30000)
        check("Reports download success notice", True)

        # ---- shell live AI status ----
        aside = page.locator("aside").first
        check("Sidebar shows 'Groq Online'", aside.get_by_text("Groq Online", exact=True).count() > 0)
        check("Sidebar shows 'Telegram Configured'", aside.get_by_text("Configured", exact=True).count() > 0)

        # ---- mobile 375px: security view ----
        mob = ctx.new_page()
        mob.set_viewport_size({"width": 375, "height": 700})
        mob.goto(f"{BASE}/ai/security")
        mob.wait_for_url(re.compile(r"/ai/security$"))
        mob.get_by_text("Mission Control").wait_for(timeout=20000)
        ov = mob.evaluate(
            "() => document.documentElement.scrollWidth - document.documentElement.clientWidth"
        )
        check("Mobile /ai/security no horizontal overflow", ov <= 1, f"overflow={ov}")
        mob.close()

        ctx.close()
        browser.close()

    print("\n============================================")
    print(f"Phase 8 browser E2E (full): {passed} passed, {failed} failed")
    if problems:
        print("Problems:")
        for pr in problems:
            print(f"  - {pr}")
    if failed > 0:
        raise SystemExit(1)


if __name__ == "__main__":
    main()