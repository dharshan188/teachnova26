#!/usr/bin/env python3
"""run-port3001.py — SAME-ATTACK, WITHOUT-AI side (BuildHub — No-AI, port 3001).

TEST 1: identical forged-login burst against the WITHOUT-AI build.

  EXPECTED:
    ATTACK  ->  NO auto-mitigation  ->  safe degradation latch  ->
    /health reports unavailable (HTTP 503)  ->  the engine STOPS  ->
    the service REMAINS unavailable (recovery = operator restart).

The engine refuses to touch anything but loopback:3001, never changes the OS,
never kills processes and never restarts the server (recorded below).

Usage:
  python3 scripts/run-port3001.py --confirm-local
"""

from __future__ import annotations

import json
import sys
import time
import urllib.error
import urllib.request

sys.path.insert(0, __file__.rpartition("/")[0])
import attack_common  # noqa: E402

TARGET = "http://127.0.0.1:3001"


def telemetry_noai() -> dict:
    try:
        req = urllib.request.Request(TARGET + "/api/demo/attack", method="GET")
        with urllib.request.urlopen(req, timeout=5) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except Exception as err:
        return {"error": str(err)}


def main() -> int:
    sys.argv = [sys.argv[0], "--confirm-local", "--target", TARGET, "--mode", "noai"]
    code = attack_common.main()

    print("\n" + "=" * 72)
    print("WITHOUT-AI TELEMETRY (real /api/demo/attack state)")
    telemetry = telemetry_noai()
    if "error" in telemetry:
        print("  telemetry unreachable:", telemetry["error"])
    else:
        print(f"  phase            : {telemetry.get('phase')}")
        state = telemetry.get("state", {})
        print(f"  failed logins    : {state.get('failCount')} "
              f"(threshold degrade {state.get('degradeThreshold')} / fail {state.get('failThreshold')})")
        print(f"  degraded at      : {state.get('degradedAt')}")
        print(f"  unavailable at   : {state.get('unavailableAt')}")
        health = telemetry.get("health", {})
        print(f"  final health     : {health.get('status')}")
    print("-" * 72)
    print("As designed, the WITHOUT-AI build was NOT restarted by this script.")
    print("Recovery requires an operator restart of the No-AI server (state is")
    print("process-local and a fresh start is clean).")
    print("=" * 72)
    return code


if __name__ == "__main__":
    sys.exit(main())