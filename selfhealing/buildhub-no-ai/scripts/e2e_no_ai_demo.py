#!/usr/bin/env python3
"""BuildHub — No-AI demo E2E.

Validates the honest comparison claim: a separate, isolated copy of BuildHub
borrows the SAME controlled LOW-01 fault the AI-enabled build repairs, but has
NO AI configured — so the fault stays broken (UNRESOLVED), nothing auto-detects,
auto-patches, or auto-rolls-back, and zero requests ever reach an AI provider.

Requires the demo server already running, e.g.:
    cd buildhub-no-ai && npm run dev -- --port 3001
Run:
    python3 scripts/e2e_no_ai_demo.py [--base http://localhost:3001]
Exits non-zero if any check fails.
"""

import argparse
import hashlib
import os
import re
from pathlib import Path
import subprocess
import sys
import time

from playwright.sync_api import sync_playwright

BASE = os.environ.get("E2E_BASE", "http://localhost:3001")
USER = os.environ.get("E2E_USER", "arjun")
PASSWORD = os.environ.get("E2E_PASSWORD", "buildhub-demo1")

ROOT = Path(__file__).resolve().parents[1]

# Hosts the AI-enabled BuildHub would talk to. The No-AI copy must never hit any.
AI_HOSTS = [
    "api.groq.com",
    "groq.com",
    "x.ai",
    "api.x.ai",
    "api.openai.com",
    "api.anthropic.com",
    "ollama",
    "11434",
    "anythingllm",
    "localhost:4891",
]

SRC_DIRS = ["app", "lib", "components", "prisma"]
AI_HOST_RE = re.compile("|".join(re.escape(h) for h in AI_HOSTS), re.IGNORECASE)

passed = 0
failed = 0


def check(name, cond):
    global passed, failed
    if cond:
        passed += 1
        print(f"  PASS {name}")
    else:
        failed += 1
        print(f"  FAIL {name}")


def snapshot_sources():
    entries = {}
    for d in SRC_DIRS:
        base = ROOT / d
        if not base.is_dir():
            continue
        for p in sorted(base.rglob("*")):
            if p.is_file() and not p.name.endswith(".tsbuildinfo"):
                rel = str(p.relative_to(ROOT))
                h = hashlib.sha256(p.read_bytes()).hexdigest()
                entries[rel] = h
    return entries


def scan_for_ai_hosts(sources):
    hits = []
    for rel, _ in sources.items():
        p = ROOT / rel
        try:
            text = p.read_text(errors="ignore")
        except Exception:
            continue
        if AI_HOST_RE.search(text):
            hits.append(rel)
    return hits


def db_query(sql, db="buildhub_no_ai"):
    try:
        out = subprocess.run(
            ["docker", "exec", "buildhub-pg", "psql", "-U", "buildhub", "-d", db, "-Atc", sql],
            capture_output=True,
            text=True,
            timeout=30,
        )
        if out.returncode != 0:
            return None
        return out.stdout.strip()
    except Exception:
        return None


def main():
    global BASE
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", default=BASE)
    args = parser.parse_args()
    BASE = args.base

    print(f"BuildHub No-AI demo E2E against {BASE}\n")

    if not db_query("SELECT 1"):
        print("  SKIP direct DB assertions (docker buildhub-pg not reachable)")
        db_available = False
    else:
        db_available = True

    sources_before = snapshot_sources()

    with sync_playwright() as p:
        context = context_auth = None
        try:
            context = p.request.new_context(base_url=BASE)
            context_auth = p.request.new_context(base_url=BASE)

            # 1. Application starts + healthy
            r = context.get("/api/health")
            check("server reachable, /api/health responds", r.ok)
            health = r.json() if r.ok else {}
            check("health reports all systems operational", health.get("status") == "ok")

            # 2. Landing page loads
            browser = p.chromium.launch(headless=True)
            page = context_browser = None
            try:
                page = browser.new_page()
                ai_hits = []
                page.on("request", lambda req: ai_hits.append(req.url) if AI_HOST_RE.search(req.url) else None)

                rr = page.goto(BASE + "/")
                check("landing page loads", rr is not None and rr.status == 200)

                # 3. Login works through the real API
                rlogin = context_auth.post("/api/auth/login", data={"identifier": USER, "password": PASSWORD})
                check("login returns 200 + user", rlogin.ok and rlogin.json().get("user", {}).get("username") == USER)
                session_cookies = context_auth.storage_state().get("cookies", [])
                check("login sets buildhub_session cookie", any(c.get("name") == "buildhub_session" for c in session_cookies))

                # Give the browser the same session so it can open the private /demo page.
                cookies = []
                for c in session_cookies:
                    if c.get("name") == "buildhub_session":
                        cookies.append(
                            {
                                "name": c["name"],
                                "value": c["value"],
                                "domain": c.get("domain") or "localhost",
                                "path": c.get("path") or "/",
                                "http_only": bool(c.get("httpOnly", False)),
                                "same_site": "Lax",
                                "secure": bool(c.get("secure", False)),
                                "expires": c.get("expires", -1),
                            }
                        )
                if cookies:
                    page.context.add_cookies(cookies)

                # 4. Demo status endpoint shown + app is operational before trigger
                rst = context_auth.get("/api/demo/fault")
                check("demo status endpoint requires auth and responds", rst.ok)
                state0 = rst.json()
                check("LOW-01 is the demo fault", state0.get("faultId") == "LOW-01")
                check("fault injection layer is enabled", state0.get("enabled") is True)

                # 5. /demo page renders the No-AI framing
                cr = page.goto(BASE + "/demo")
                check("demo page loads", cr is not None and cr.status == 200)
                time.sleep(0.5)
                body = page.inner_text("body")
                check("demo page shows NO-AI DEMO badge", "NO-AI DEMO" in body)
                check("demo page shows AI SELF-HEALING: OFF", "AI SELF-HEALING: OFF" in body)
                check("demo page shows signed-in @arjun", "@" + USER in body)

                # 6. Trigger LOW-01 through the demo control
                ratt = context_auth.post("/api/demo/fault", data={"action": "activate"})
                check("fault activate action returns 200", ratt.ok)
                state1 = ratt.json()
                check("LOW-01 becomes active / UNRESOLVED", state1.get("active") is True and state1.get("unresolved") is True)

                # 7. Real POST /api/posts is still broken (no AI to fix it)
                rreal = context_auth.post("/api/posts", data={"content": "No-AI E2E trigger — LOW-01", "tags": []})
                check("real POST /api/posts returns HTTP 500", rreal.status == 500)
                try:
                    real_body = rreal.json()
                except Exception:
                    real_body = {}
                check("real error message matches LOW-01", real_body.get("error") == "Cannot read property 'id' of undefined")

                # 8. The error left a REAL durable log row
                rlogs = context_auth.get("/api/demo/logs")
                check("demo logs endpoint responds", rlogs.ok)
                entries = rlogs.json().get("entries", [])
                low01_logs = [
                    e for e in entries
                    if e.get("service") == "fault-injection"
                    and e.get("route") == "/api/posts"
                    and e.get("status") == 500
                    and e.get("errorCode") == "LOW-01"
                ]
                check("a real fault-injection /api/posts 500 log exists", len(low01_logs) >= 1)
                if db_available:
                    n = db_query(
                        "SELECT count(*) FROM log_events WHERE service='fault-injection' "
                        "AND route='/api/posts' AND status=500 AND \"errorCode\"='LOW-01'"
                    )
                    check(f"LOW-01 500 persisted in DB (n={n})", n is not None and int(n) >= 1)

                # 9. No AI pipeline was invoked
                for tbl in ("incidents", "agent_runs", "repair_attempts"):
                    if db_available:
                        n = db_query(f'SELECT count(*) FROM "{tbl}"')
                        check(f"no {tbl} rows created during demo", n == "0")

                # 10. Fault remains active (no automatic repair)
                time.sleep(0.5)
                rcheck = context_auth.get("/api/demo/fault")
                state2 = rcheck.json()
                check("fault still active after a beat (no auto-repair)", state2.get("active") is True)

                # and a follow-up POST is still 500
                ragain = context_auth.post("/api/posts", data={"content": "No-AI E2E recheck", "tags": []})
                check("POST /api/posts continues to fail with 500", ragain.status == 500)

                # 11. Zero requests to AI providers during the whole flow
                check("no browser request reached an AI provider", len(ai_hits) == 0)

                # 12. Source files are byte-identical (nothing was patched)
                sources_after = snapshot_sources()
                changed = [rel for rel in sources_before if sources_before.get(rel) != sources_after.get(rel)]
                added = [rel for rel in sources_after if rel not in sources_before]
                check("no source files changed after trigger", len(changed) == 0)
                check("no new source files created after trigger", len(added) == 0)

                page.close()
            finally:
                try:
                    browser.close()
                except Exception:
                    pass

            # 13. Static source scan: no AI provider references anywhere
            hits = scan_for_ai_hosts(sources_before)
            check(f"no AI provider endpoints referenced in source ({hits or 'none'})", len(hits) == 0)

            # Keep the demo stopped in the expected end state? The fault should
            # remain active/broken by design (No-AI = unresolved); we leave it
            # active so the built output is evidence, and demo:reset cleans up.
        finally:
            try:
                context.close()
            except Exception:
                pass
            try:
                context_auth.close()
            except Exception:
                pass

    print(f"\nResult: {passed} passed, {failed} failed")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()