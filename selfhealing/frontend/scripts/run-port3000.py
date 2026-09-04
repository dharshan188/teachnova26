#!/usr/bin/env python3
"""run-port3000.py — SAME-ATTACK, WITH-AI side (BuildHub, port 3000).

TEST 2: identical forged-login burst against the WITH-AI build.

  EXPECTED:
    ATTACK  ->  source-IP guard logs + detects the burst  ->  real
    SecurityFinding -> Incident -> REAL agent pipeline (Fixer/Critic/Judge)
  ->  temporary source-IP mitigation (HTTP 429)  ->  the engine STOPS  ->
  ->  the service RECOVERS and /health returns to ok/healthy without an
      operator restart (the AI handled containment).

The engine refuses to touch anything but loopback:3000, never changes the OS,
never kills processes and never restarts the server. All metrics come from the
real /api/demo/attack telemetry of the WITH-AI build.

Usage:
  python3 scripts/run-port3000.py --confirm-local
"""

from __future__ import annotations

import json
import sys
import urllib.request

sys.path.insert(0, __file__.rpartition("/")[0])
import attack_common  # noqa: E402

TARGET = "http://127.0.0.1:3000"


def telemetry_ai() -> dict:
    try:
        req = urllib.request.Request(TARGET + "/api/demo/attack", method="GET")
        with urllib.request.urlopen(req, timeout=5) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except Exception as err:
        return {"error": str(err)}


def main() -> int:
    sys.argv = [sys.argv[0], "--confirm-local", "--target", TARGET, "--mode", "ai"]
    code = attack_common.main()

    print("\n" + "=" * 72)
    print("WITH-AI TELEMETRY (real /api/demo/attack state)")
    telemetry = telemetry_ai()
    if "error" in telemetry:
        print("  telemetry unreachable:", telemetry["error"])
        return code
    print(f"  phase            : {telemetry.get('phase')}")
    state = telemetry.get("state", {})
    print(f"  threshold        : {state.get('failCount')} failures / "
          f"{state.get('threshold')} within {state.get('windowMs', 0) / 1000:.0f}s window")
    print(f"  blocked          : {state.get('blocked')}  until {state.get('blockedUntil')}")
    print(f"  blocked requests : {state.get('blockedCount')} (HTTP 429)")
    health = telemetry.get("health", {})
    print(f"  final health     : {health.get('status')} (systemHealth "
          f"{health.get('systemHealth')})")
    incident = telemetry.get("incident")
    if incident:
        print(f"  incident         : {incident.get('ref')} · {incident.get('severity')} · "
              f"{incident.get('status')} · riskScore {incident.get('riskScore')}")
    else:
        print("  incident         : none yet")
    runs = telemetry.get("agentRuns") or []
    if runs:
        rounds = sorted({r.get("round", 1) for r in runs})
        print(f"  agent runs       : {len(runs)} runs across rounds {rounds}")
        for run in runs:
            print(f"      {run.get('agent')}: status={run.get('status')} "
                  f"progress={run.get('progress')} · {run.get('currentActivity')}")
    timestamps = telemetry.get("timestamps") or {}
    first = timestamps.get("firstFailureAt")
    detected = timestamps.get("detectedAt")
    mitigated = timestamps.get("mitigatedAt")
    if first and detected:
        print(f"  detection        : detected {_delta(first, detected):.1f}s after first failure")
    if first and mitigated:
        print(f"  mitigation       : blocked {_delta(first, mitigated):.1f}s after first failure")
    print("=" * 72)
    return code


def _delta(earlier_iso: str, later_iso: str) -> float:
    from datetime import datetime, timezone

    def parse(iso: str):
        try:
            return datetime.fromisoformat(iso.replace("Z", "+00:00"))
        except Exception:
            return datetime.fromisoformat(iso)

    earlier = parse(earlier_iso)
    later = parse(later_iso)
    if earlier.tzinfo is None:
        earlier = earlier.replace(tzinfo=timezone.utc)
    if later.tzinfo is None:
        later = later.replace(tzinfo=timezone.utc)
    return (later - earlier).total_seconds()


if __name__ == "__main__":
    sys.exit(main())