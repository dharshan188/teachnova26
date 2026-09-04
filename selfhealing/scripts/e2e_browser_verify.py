"""End-to-end authenticated browser verification for BuildHub.

Uses the ALREADY RUNNING server on :3000. Logs in as operator 'arjun'.
Verifies: login, AI chat, SSE connection+snapshot, live SSE events on
MEDIUM-01 trigger, live logs, incident detail (no hydration errors),
learning endpoints, risk/health values.
"""
import json, time
from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000"
RESULTS = {}


def login(page, username="arjun", password="buildhub-demo1"):
    page.goto(f"{BASE}/login")
    page.wait_for_load_state("networkidle")
    page.fill("#identifier", username)
    page.fill("#password", password)
    page.get_by_role("button", name="Log in").click()
    page.wait_for_url(lambda url: "/login" not in url, timeout=15000)
    page.wait_for_load_state("networkidle")
    return page


def api(page, path, method="GET", body=None):
    """In-page fetch to carry the session cookie. Returns (status, data)."""
    body_expr = "undefined"
    if body is not None:
        body_expr = json.dumps(json.dumps(body))
    js = f"""async () => {{
      const res = await fetch('{path}', {{
        method: '{method}',
        headers: {{'Content-Type': 'application/json'}},
        body: {body_expr}
      }});
      let data = null;
      try {{ data = await res.json(); }} catch(e) {{ data = await res.text(); }}
      return {{ status: res.status, data: data }};
    }}"""
    r = page.evaluate(js)
    return r.get("status"), r.get("data")


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()

        console_errors = []
        page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)
        page.on("pageerror", lambda e: console_errors.append(f"PAGEERROR: {e}"))

        # ---- LOGIN ----
        t = time.time()
        login(page)
        print(f"LOGIN: OK in {(time.time()-t)*1000:.0f}ms")
        RESULTS["login"] = "PASS"

        # ---- AI CHAT ----
        for q in ["Hello", "What is the current system status?"]:
            st, d = api(page, "/api/ai/chat", "POST", {"message": q})
            mode = d.get("mode") if isinstance(d, dict) else d
            reply = (d.get("reply") if isinstance(d, dict) else d)
            print(f"AI CHAT [{q!r}] status={st} mode={mode} reply={str(reply)[:80]!r}")
            RESULTS["ai_chat"] = "PASS" if st == 200 else "FAIL"

        # ---- /ai/security baseline ----
        page.goto(f"{BASE}/ai/security")
        page.wait_for_load_state("networkidle")
        time.sleep(1)
        b_status, b = api(page, "/api/security/status")
        ov = b["overview"]
        risk_before, health_before, active_before = ov["riskScore"], ov["systemHealth"], ov["activeIncidents"]
        print(f"SECURITY STATUS BEFORE: risk={risk_before} health={health_before} active={active_before}")

        # ---- Establish SSE and wait for initial snapshot ----
        ss_js = """
        (() => {
          window.__es_events = [];
          window.__es_snapshot = false;
          window.__es_conn_open = false;
          return new Promise((resolve) => {
            window.__es = new EventSource('/api/security/events');
            const record = (type, data) => { window.__es_events.push({type, data, t: Date.now()}); };
            window.__es.addEventListener('snapshot', (e) => {
              window.__es_snapshot = true;
              record('snapshot', JSON.parse(e.data));
              resolve('snapshot-received');
            });
            window.__es.addEventListener('delivery', (e) => record('delivery', JSON.parse(e.data)));
            window.__es.addEventListener('lifecycle', (e) => record('lifecycle', JSON.parse(e.data)));
            window.__es.onopen = () => { window.__es_conn_open = true; };
            window.__es.onerror = () => { window.__es_conn_error = true; };
            setTimeout(() => resolve('timeout'), 8000);
          });
        })()
        """
        es_state = page.evaluate(ss_js)
        conn_open = page.evaluate("window.__es_conn_open === true")
        print(f"SSE state={es_state} conn_open={conn_open}")
        RESULTS["sse_connection"] = "PASS" if es_state == "snapshot-received" and conn_open else "FAIL"
        init_events = page.evaluate("window.__es_events")
        init_types = [e['type'] for e in init_events]
        print(f"SSE initial events: {init_types}")
        RESULTS["sse_initial_snapshot"] = "PASS" if 'snapshot' in init_types else "FAIL"

        # ---- Activate MEDIUM-01 ----
        f_st, f_d = api(page, "/api/faults", "POST", {"faultId": "MEDIUM-01", "action": "activate"})
        print(f"ACTIVATE MEDIUM-01 status={f_st} data={str(f_d)[:200]}")
        RESULTS["fault_activate"] = "PASS" if f_st == 200 else "FAIL"

        d_st, d = api(page, "/api/security/status")
        risk_during, health_during, active_during = d["overview"]["riskScore"], d["overview"]["systemHealth"], d["overview"]["activeIncidents"]
        print(f"SECURITY STATUS DURING: risk={risk_during} health={health_during} active={active_during}")

        # ---- Trigger MEDIUM-01: POST /api/posts (must 500) ----
        po_st, po_d = api(page, "/api/posts", "POST", {"title": "E2E verify", "body": "trigger medium-01"})
        print(f"POST /api/posts during MEDIUM-01 status={po_st} (expected 500)")
        RESULTS["medium01_500"] = "PASS" if po_st == 500 else f"FAIL (got {po_st})"

        # ---- Wait for live SSE events ----
        print("Waiting 8s for live SSE events...")
        time.sleep(8)
        events_now = page.evaluate("window.__es_events")
        new_events = [e for e in events_now[len(init_events):]]
        new_types = [e['type'] for e in new_events]
        print(f"NEW SSE events after trigger: {new_types}")
        live_refs = set()
        for e in new_events:
            dd = e['data']
            if isinstance(dd, dict):
                for inc in (dd.get('incidents') or []):
                    live_refs.add(inc['ref'])
        print(f"Incident refs in live SSE: {sorted(live_refs)}")
        has_lifecycle_after = 'lifecycle' in new_types
        RESULTS["sse_live_event"] = "PASS" if has_lifecycle_after else "FAIL"

        # ---- Live logs ----
        l_st, logs = api(page, "/api/logs")
        log_list = logs.get("logs", []) if isinstance(logs, dict) else logs
        posts_logs = [r for r in (log_list or []) if r.get("route") == "/api/posts"]
        print(f"LOGS: total={len(log_list) if log_list else 'n/a'} posts-route={len(posts_logs)}")
        for r in posts_logs[:5]:
            print(f"   {r.get('method')} {r.get('route')} status={r.get('status')} msg={r.get('message')}")
        RESULTS["live_logs"] = "PASS" if posts_logs else "FAIL"

        # ---- Incident detail (hydration) ----
        i_st, ii = api(page, "/api/incidents")
        inc_list = ii.get("incidents", []) if isinstance(ii, dict) else ii
        latest = inc_list[0] if inc_list else None
        print(f"INCIDENTS: {len(inc_list)} latest={latest.get('ref') if latest else 'none'} status={latest.get('status') if latest else ''}")
        RESULTS["incident_created"] = "PASS" if latest else "FAIL"
        if latest:
            iid = latest["id"]
            console_errors.clear()
            page.goto(f"{BASE}/ai/incidents/{iid}")
            page.wait_for_load_state("networkidle")
            time.sleep(1.5)
            hyd = [c for c in console_errors if any(k in c.lower() for k in ("hydrat", "nested", "<li>", "cannot be a descendant"))]
            print(f"INCIDENT DETAIL console errors (hydration-related): {hyd}")
            print(f"INCIDENT DETAIL all console errors: {console_errors}")
            RESULTS["incident_detail_hydration"] = "PASS" if not hyd else "FAIL"

        # ---- Status AFTER ----
        a_st, a = api(page, "/api/security/status")
        risk_after, health_after, active_after = a["overview"]["riskScore"], a["overview"]["systemHealth"], a["overview"]["activeIncidents"]
        print(f"SECURITY STATUS AFTER: risk={risk_after} health={health_after} active={active_after}")

        # ---- Learning endpoints ----
        for ep in ["/api/ai/learning", "/api/ai/experiences", "/api/ai/rl-dataset", "/api/ai/evaluate"]:
            e_st, e_d = api(page, ep)
            print(f"LEARNING {ep} status={e_st}")
            RESULTS[f"learning_{ep.split('/')[-1]}"] = "PASS" if e_st == 200 else "FAIL"

        # ---- Cross-page console/hydration check ----
        for path in ["/ai", "/ai/security", "/ai/logs", "/ai/learning"]:
            console_errors.clear()
            page.goto(f"{BASE}{path}")
            page.wait_for_load_state("networkidle")
            time.sleep(0.4)
            hyd = [c for c in console_errors if "hydrat" in c.lower()]
            print(f"CONSOLE {path}: hydration errors={len(hyd)} all={console_errors}")

        browser.close()

        print("\n============ RESULT SUMMARY ============")
        for k, v in RESULTS.items():
            print(f"{k}: {v}")
        print("=========================================")


if __name__ == "__main__":
    main()
