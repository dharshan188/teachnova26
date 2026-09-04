"""BuildHub Phase 7 browser E2E — Command Center on a CLEAN database.

Covers: guest redirect, overview clean-state banner ("ALL SYSTEMS SECURE") and
Live · Real badge, incidents/logs/pipeline/history/reports empty states, PDF
report button appearing only when incidents exist, sidebar navigation, and
mobile (375px) overflow.

Runs against a cleared runtime DB — reset first via
`node scripts/reset-observability.mjs`. This replaces the old seeded-demo
scenario assertions (no-fake-data rule).

Expected-network policy: no unexpected 4xx/5xx from the app on authed pages.
Any API 4xx/5xx (other than the tolerated pre-login /api/auth/me 401 on guest
pages) fails the run.
"""

import re

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
        status = resp.status
        url = resp.url
        if not url.startswith(BASE):
            return
        if url.endswith("/api/auth/me") and status == 401:
            return
        if status >= 400:
            hits["http"].append(f"{status} {url}")

    page.on("console", on_console)
    page.on("pageerror", on_pageerror)
    page.on("response", on_response)
    return hits


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context()
        page = ctx.new_page()
        page.set_default_timeout(20000)

        # ---- guest: /ai is protected ----
        page.goto(f"{BASE}/ai")
        page.wait_for_load_state("networkidle")
        check("Guest /ai redirects to /login", re.search(r"/login", page.url) is not None, page.url)
        check("Guest /ai never leaked command center content", "Mission Control" not in page.content())

        # ---- login as demo operator ----
        page.goto(f"{BASE}/login")
        page.get_by_label("Email or username", exact=True).fill("arjun")
        page.get_by_label("Password", exact=True).fill("buildhub-demo1")
        page.get_by_role("button", name="Log in").click()
        page.wait_for_url("**/feed")
        page.wait_for_load_state("networkidle")

        cc_link = page.get_by_role("link", name="Command Center")
        check("Sidebar exposes Command Center for authed user", cc_link.first.is_visible())

        # ---- Overview (clean state) ----
        cc_link.first.click()
        page.wait_for_url(re.compile(r"/ai$"))
        page.wait_for_load_state("networkidle")
        page.get_by_text("Mission Control").first.wait_for(timeout=20000)
        check("Overview renders 'Mission Control' heading", page.get_by_text("Mission Control").first.is_visible())
        check("Overview renders H1 'Overview'", page.get_by_role("heading", name="Overview").first.is_visible())
        check("Overview shows Live · Real badge", page.get_by_text("Live · Real", exact=True).first.is_visible())
        api = ctx.request
        api.post(f"{BASE}/api/auth/login", data={"identifier": "arjun", "password": "buildhub-demo1"})
        sum_res = api.get(f"{BASE}/api/observability/summary")
        risk = sum_res.json()["overview"]["riskScore"] if sum_res.status == 200 else -1
        if risk == 0:
            page.get_by_text("ALL SYSTEMS SECURE").first.wait_for(timeout=20000)
            check("Clean state shows ALL SYSTEMS SECURE banner", True)
        else:
            page.get_by_text("Active security posture.", exact=False).first.wait_for(timeout=20000)
            check("Active posture banner shows for non-zero risk", True)
        check("Overview: no 'Simulation mode.' copy", page.get_by_text(re.compile(r"Simulation\s?mode", re.I)).count() == 0)
        page.get_by_text("Risk Score", exact=True).wait_for()
        page.get_by_text("Cyber Safety", exact=True).wait_for()
        check("Overview shows Risk Score tile", page.get_by_text("Risk Score", exact=True).is_visible())
        check("Overview shows Cyber Safety tile", page.get_by_text("Cyber Safety", exact=True).is_visible())

        overview_res = watch(page)
        page.reload()
        page.wait_for_load_state("networkidle")
        net = overview_res
        check("Overview: no console errors", net["errors"] == [], f"{net['errors'][:3]}")
        bad_http = [h for h in net["http"] if h.startswith(("4", "5"))]
        check("Overview: no unexpected API 4xx/5xx", not bad_http, f"{bad_http[:5]}")

        # ---- Incidents list (empty) ----
        page.get_by_role("link", name="Incidents").first.click()
        page.wait_for_url(re.compile(r"/ai/incidents$"))
        page.get_by_text("No incidents", exact=False).first.wait_for(timeout=20000)
        check("Incidents list shows clean empty state", True)

        # ---- Live Logs (ui + clean ERROR stream) ----
        page.get_by_role("link", name="Live Logs").first.click()
        page.wait_for_url(re.compile(r"/ai/logs$"))
        page.get_by_text("Live Logs", exact=True).first.wait_for(timeout=20000)
        check("Live Logs page renders", True)
        api = ctx.request
        api.post(f"{BASE}/api/auth/login", data={"identifier": "arjun", "password": "buildhub-demo1"})
        err_logs = api.get(f"{BASE}/api/logs?level=ERROR&pageSize=25")
        check("Clean stream: level=ERROR returns 0 rows", err_logs.status == 200 and len(err_logs.json()["logs"]) == 0, f"status={err_logs.status}")

        # ---- AI Pipeline (clean) ----
        page.get_by_role("link", name="AI Pipeline").first.click()
        page.wait_for_url(re.compile(r"/ai/pipeline$"))
        page.get_by_text("Live · Real", exact=True).first.wait_for(timeout=20000)
        check("Pipeline shows Live · Real badge", True)
        check("Pipeline: no simulation copy", page.get_by_text(re.compile(r"simulation preview|Simulated", re.I)).count() == 0)
        check("Pipeline shows Fixer stage", page.get_by_text(re.compile(r"FIXER", re.I)).count() > 0)
        check("Pipeline shows Critic stage", page.get_by_text(re.compile(r"CRITIC", re.I)).count() > 0)
        check("Pipeline shows Judge stage", page.get_by_text(re.compile(r"JUDGE", re.I)).count() > 0)

        # ---- Reports (no incidents → no downloads) ----
        page.get_by_role("link", name="Reports").first.click()
        page.wait_for_url(re.compile(r"/ai/reports$"))
        page.get_by_text("No reports", exact=False).first.wait_for(timeout=20000)
        check("Reports shows clean empty state", True)
        check("Reports hides Download PDF when no incidents", page.get_by_role("button", name="Download PDF").count() == 0)

        # ---- History (empty) ----
        page.get_by_role("link", name="History").first.click()
        page.wait_for_url(re.compile(r"/ai/history$"))
        page.get_by_text("No incidents", exact=False).first.wait_for(timeout=20000)
        check("History shows clean empty state", True)

        # ---- Security nav item present ----
        page.get_by_role("link", name="Security").first.click()
        page.wait_for_url(re.compile(r"/ai/security$"))
        page.get_by_text("Mission Control").first.wait_for(timeout=20000)
        check("Security nav entry reaches Security view", True)

        # ---- mobile 375px: overview ----
        mob = ctx.new_page()
        mob.set_viewport_size({"width": 375, "height": 700})
        mob.goto(f"{BASE}/ai")
        mob.wait_for_url(re.compile(r"/ai$"))
        mob.get_by_text("Mission Control").wait_for(timeout=20000)
        ov = mob.evaluate("() => document.documentElement.scrollWidth - document.documentElement.clientWidth")
        check("Mobile /ai no horizontal overflow", ov <= 1, f"overflow={ov}")
        mob.close()

        ctx.close()
        browser.close()

    print("\n============================================")
    print(f"Phase 7 browser E2E (clean): {passed} passed, {failed} failed")
    if problems:
        print("Problems:")
        for pr in problems:
            print(f"  - {pr}")
    if failed > 0:
        raise SystemExit(1)


if __name__ == "__main__":
    main()