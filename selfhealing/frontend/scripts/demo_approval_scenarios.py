"""BuildHub approval demo scenarios B/C/D for the canonical briefing (ADR-017).

Drives the HIGH-risk approval lifecycle end to end against a running TEST-mode
server (SELF_HEALING_TEST_MODE=true AI_PROVIDER=test) and asserts the canonical
Telegram progression for each terminal state:

  B) HIGH fault -> HIGH_RISK_APPROVAL_REQUIRED -> operator PROCEED
     -> apply + validate -> terminalFinal=RESOLVED
  C) HIGH fault -> HIGH_RISK_APPROVAL_REQUIRED -> operator REJECT
     -> rejected terminal (finalState REJECTED)
  D) HIGH fault -> HIGH_RISK_APPROVAL_REQUIRED -> expiresAt backdated in pg
     -> operator PROCEED -> EXPIRED terminal

Assertions: activation creates incident + SENT INCIDENT alert, exactly one SENT
HIGH_RISK_APPROVAL_REQUIRED, a terminalSummary carrying System Health / Cyber
Score / Site Risk, and the per-state outcome line. Final state of each scenario
is the authoritative human-decision terminal.

Requires: running server (localhost:3000), real TELEGRAM creds in frontend/.env,
buildhub-pg container. Run: python3 scripts/demo_approval_scenarios.py
"""

import json
import re
import subprocess
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


def login_api(ctx, identifier="arjun", password="buildhub-demo1"):
    ctx.request.post(f"{BASE}/api/auth/login", data={"identifier": identifier, "password": password})


def post(ctx, path, data):
    resp = ctx.request.post(f"{BASE}{path}", data=data)
    body = json.loads(resp.body()) if resp.body() else {}
    return resp.status, body


def get(ctx, path):
    resp = ctx.request.get(f"{BASE}{path}")
    return resp.status, json.loads(resp.body()) if resp.body() else {}


def poll_until(fn, timeout=120, interval=2):
    deadline = time.time() + timeout
    last = None
    while time.time() < deadline:
        try:
            last = fn()
            if last:
                return last
        except Exception as exc:  # noqa: BLE001
            last = exc
        time.sleep(interval)
    return last


def pending_approval(resp):
    status, body = resp
    incident = body.get("incident") or {}
    approvals = incident.get("approvals") or []
    return next((a for a in approvals if a.get("status") == "PENDING"), None)


def approval_delivered(ctx, incident_id):
    _, body = get(ctx, f"/api/incidents/{incident_id}")
    deliveries = (body.get("incident", {}) or {}).get("telegram", {}).get("deliveries", [])
    return [d for d in deliveries if d.get("type") == "HIGH_RISK_APPROVAL_REQUIRED" and d.get("deliveryStatus") == "SENT"]


def approval_message_db(incident_id):
    row = subprocess.run(
        [
            "docker", "exec", "buildhub-pg", "psql", "-U", "buildhub", "-d", "buildhub", "-tAc",
            f"SELECT message FROM telegram_notifications WHERE \"incidentId\" = '{incident_id}' AND \"type\" = 'HIGH_RISK_APPROVAL_REQUIRED' AND \"deliveryStatus\" = 'SENT'",
        ],
        capture_output=True, text=True, check=True,
    )
    return row.stdout or ""


def terminal(ctx, incident_id):
    _, body = get(ctx, f"/api/incidents/{incident_id}")
    return (body.get("incident", {}) or {}).get("terminalSummary")


def run_high(ctx, label, decision, backdate=False):
    print(f"\n=== {label} (HIGH-01) ===")
    login_api(ctx)
    status, act = post(ctx, "/api/faults", {"faultId": "HIGH-01", "action": "activate"})
    check(f"{label}: activate HIGH-01 -> 200", status == 200, f"status={status}")
    incident = act.get("incident") or {}
    incident_id = incident.get("id")
    check(f"{label}: activation created an incident", bool(incident_id), str(act)[:200])

    # Fire the defect path: auth bypass -> wrong password must NOT return 401.
    # HIGH-01 only skips the password check, so the user must exist (arjun).
    login_api(ctx)  # operator session first so the fault guard evaluates its frame
    trigger = ctx.request.post(
        f"{BASE}/api/auth/login",
        data={"identifier": "arjun", "password": "wrong-password-for-demo"},
    )
    check(f"{label}: HIGH-01 defect fired (POST /api/auth/login)", trigger.status == 200, f"status={trigger.status}")

    # Run the self-healing repair pipeline; HIGH risk must halt awaiting approval.
    status, run = post(ctx, "/api/security/run", {"incidentId": incident_id})
    check(f"{label}: POST /api/security/run -> 200", status == 200, f"status={status}")

    appr = poll_until(lambda: pending_approval(get(ctx, f"/api/incidents/{incident_id}")), timeout=120, interval=2)
    check(f"{label}: approval created and PENDING", bool(appr), str(appr))
    approval_id = appr.get("approvalId") if appr else None
    check(f"{label}: approval id present", bool(approval_id), str(appr))

    sent_approval = poll_until(lambda: approval_delivered(ctx, incident_id), timeout=60, interval=2)
    check(f"{label}: exactly one SENT HIGH_RISK_APPROVAL_REQUIRED", len(sent_approval) == 1, f"count={len(sent_approval)}")
    approval_text = approval_message_db(incident_id) if incident_id else ""
    check(
        f"{label}: approval message carries PROCEED/REJECT instructions",
        bool(re.search(r"PROCEED (APR-\d+)", approval_text)) and "REJECT" in approval_text and approval_id in approval_text,
        f"approval_id={approval_id} msg={approval_text[:90]}",
    )

    if backdate and approval_id:
        row = subprocess.run(
            [
                "docker", "exec", "buildhub-pg", "psql", "-U", "buildhub", "-d", "buildhub", "-tAc",
                f"UPDATE approvals SET \"expiresAt\" = now() - interval '1 minute' WHERE \"approvalId\" = '{approval_id}' RETURNING 1",
            ],
            capture_output=True, text=True, check=True,
        )
        check(f"{label}: expiresAt backdated via pg", row.stdout.splitlines()[0] if row.stdout else "" == "1", row.stdout or row.stderr)

    if backdate:
        status, resp = post(ctx, "/api/approvals/proceed", {"approvalId": approval_id, "action": "proceed"})
        check(f"{label}: proceed on expired approval -> expired:true", status == 200 and resp.get("expired") is True, f"status={status} body={str(resp)[:160]}")
        expected = "EXPIRED"
    elif decision == "reject":
        status, resp = post(ctx, "/api/approvals/proceed", {"approvalId": approval_id, "action": "reject"})
        check(f"{label}: reject approval -> 200", status == 200, f"status={status} {str(resp)[:160]}")
        expected = "REJECTED"
    else:
        status, resp = post(ctx, "/api/approvals/proceed", {"approvalId": approval_id, "action": "proceed"})
        check(f"{label}: proceed approval -> 200", status == 200, f"status={status} {str(resp)[:160]}")
        expected = "RESOLVED"

    ts = poll_until(lambda: terminal(ctx, incident_id), timeout=120, interval=2)
    check(f"{label}: terminal summary present", bool(ts), "missing")
    if ts:
        text = ts.get("text", "")
        check(f"{label}: terminal finalState = {expected}", ts.get("finalState") == expected, str(ts.get("finalState")))
        check(f"{label}: terminal carries System Health / Cyber Score / Site Risk", all(k in text for k in ("System Health", "Cyber Score", "Site Risk")), text[:80])

    # Cleanup: deactivate the fault (source restored).
    status, _ = post(ctx, "/api/faults", {"faultId": "HIGH-01", "action": "deactivate"})
    check(f"{label}: HIGH-01 deactivate -> 200", status == 200, f"status={status}")
    return incident_id, expected


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context()
        login_api(ctx)
        ctx.request.post(f"{BASE}/api/faults", data={"action": "deactivate-all"})
        print("# BuildHub approval demo scenarios (B/C/D)")
        outcomes = []
        outcomes.append(run_high(ctx, "Scenario B  PROCEED", "proceed"))
        outcomes.append(run_high(ctx, "Scenario C  REJECT", "reject"))
        outcomes.append(run_high(ctx, "Scenario D  EXPIRY", "proceed", backdate=True))
        ctx.request.post(f"{BASE}/api/faults", data={"action": "deactivate-all"})
        browser.close()

    print("\n" + "=" * 52)
    for incident_id, state in outcomes:
        print(f"  INCIDENT {incident_id:<12} terminal={state}")
    print("=" * 52)
    print(f"Demo scenarios: {passed} passed, {failed} failed")
    if failed:
        print("Failed checks: " + ", ".join(problems))
        raise SystemExit(1)


if __name__ == "__main__":
    main()