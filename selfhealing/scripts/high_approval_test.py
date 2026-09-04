"""Verify HIGH-fault approval flow for BuildHub via authenticated browser.

Flow: activate HIGH-02 -> run pipeline -> WAITING_FOR_APPROVAL (no patch)
-> PROCEED -> patch applied -> resolved (or rolled back on validation fail).
"""
import json, time
import urllib.request
from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000"
RESULTS = {}


def warmup(url=BASE + "/login"):
    try:
        urllib.request.urlopen(url, timeout=60)
    except Exception:
        pass


def login(page):
    warmup()
    for attempt in range(3):
        try:
            page.goto(f"{BASE}/login", timeout=60000)
            page.wait_for_load_state("networkidle")
            break
        except Exception as e:
            print(f"login goto attempt {attempt+1}: {e}")
            time.sleep(3)
    page.fill("#identifier", "arjun")
    page.fill("#password", "buildhub-demo1")
    page.get_by_role("button", name="Log in").click()
    page.wait_for_url(lambda url: "/login" not in url, timeout=60000)
    page.wait_for_load_state("networkidle")


def api(page, path, method="GET", body=None):
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


def incident(page, iid):
    """Return the incident detail object from /api/incidents/{iid}."""
    st, d = api(page, f"/api/incidents/{iid}")
    if isinstance(d, dict) and isinstance(d.get("incident"), dict):
        return st, d["incident"]
    return st, d


def poll_status(page, iid, targets, timeout=180, interval=4):
    deadline = time.time() + timeout
    last = None
    while time.time() < deadline:
        st, d = incident(page, iid)
        last = d
        status = d.get("status") if isinstance(d, dict) else None
        if status in targets:
            return ("done", status, d)
        time.sleep(interval)
    return ("timeout", last.get("status") if isinstance(last, dict) else last, last)


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        login(page)
        print("logged in")

        # ---- Activate HIGH-01 ----
        f_st, f_d = api(page, "/api/faults", "POST", {"faultId": "HIGH-01", "action": "activate"})
        print(f"ACTIVATE HIGH-01 status={f_st} data={json.dumps(f_d, default=str)[:300]}")
        inc = (f_d or {}).get("incident") or {}
        iid = inc.get("id")
        ref = inc.get("ref")
        print(f"HIGH-01 incident: {ref} id={iid}")

        st, d = incident(page, iid)
        print(f"INCIDENT status right after activation: {d.get('status') if isinstance(d,dict) else d}")

        # ---- Run repair pipeline ----
        print("Running repair pipeline (real Groq)... may take time")
        r_st, r_d = api(page, "/api/security/run", "POST", {"incidentId": iid})
        print(f"RUN PIPELINE status={r_st}")
        print(f"RUN result: {json.dumps(r_d, default=str)[:400]}")

        # ---- Poll until approval or terminal ----
        st_code, status, data = poll_status(page, iid, ("WAITING_FOR_APPROVAL", "WAITING_APPROVAL", "RESOLVED", "ROLLED_BACK", "AI_REPAIR_FAILED"))
        print(f"POLL: {st_code} status={status}")

        if isinstance(data, dict):
            approvals = data.get("approvals") or []
            patch = data.get("patch")
            print(f"APPROVALS count={len(approvals)} {json.dumps(approvals, default=str)[:300]}")
            print(f"PATCH before proceed: {json.dumps(patch, default=str)[:200]}")
            RESULTS["high_final_status_after_pipeline"] = status

            if status in ("WAITING_FOR_APPROVAL", "WAITING_APPROVAL"):
                RESULTS["high_waiting_approval"] = "PASS"
                RESULTS["high_no_patch_before_approve"] = "PASS" if not patch else "FAIL(patch present)"
                ap = approvals[0] if approvals else None
                apid = (ap.get("approvalId") or ap.get("id")) if isinstance(ap, dict) else None
                print(f"APPROVAL ID: {apid} status={ap.get('status') if isinstance(ap,dict) else ''}")

                # ---- Send PROCEED ----
                if apid:
                    pr_st, pr_d = api(page, "/api/approvals/proceed", "POST", {"approvalId": apid, "action": "proceed"})
                    print(f"PROCEED status={pr_st} result={json.dumps(pr_d, default=str)[:400]}")
                    s2, st2, d2 = poll_status(page, iid, ("RESOLVED", "ROLLED_BACK", "AI_REPAIR_FAILED"))
                    print(f"AFTER PROCEED: {s2} status={st2}")
                    if st2 == "RESOLVED":
                        RESULTS["high_approval_resolved"] = "PASS"
                        RESULTS["high_patch_applied"] = "PASS" if (d2.get("patch") if isinstance(d2,dict) else None) else "FAIL(no patch)"
                    elif st2 == "ROLLED_BACK":
                        RESULTS["high_approval_resolved"] = "ROLLED_BACK"
                        RESULTS["rollback_triggered"] = "PASS"
                    else:
                        RESULTS["high_approval_resolved"] = st2
            else:
                RESULTS["high_waiting_approval"] = f"FAIL(status={status})"

        # ---- Cleanup ----
        api(page, "/api/faults", "POST", {"faultId": "HIGH-01", "action": "deactivate"})
        print("HIGH-01 deactivated")

        browser.close()
        print("\n===== HIGH APPROVAL RESULT =====")
        for k, v in RESULTS.items():
            print(f"{k}: {v}")
        print("================================")


if __name__ == "__main__":
    main()
