#!/usr/bin/env python3
"""attack_common.py — shared, rules-limited comparison attack engine.

BuildHub "same attack" demonstration.

  WITHOUT-AI (port 3001): identical burst  ->  NO mitigation  ->  safe
      degradation latch -> /health 503 -> attack stops -> stays down
      (recovery = operator restart).
  WITH-AI (port 3000): identical burst  ->  guard detects  ->  real
      incident + agent pipeline  ->  source-IP mitigation (HTTP 429)  ->
      attack stops  ->  service recovers to /health ok.

SAFETY / LOCAL-ONLY RULES (enforced here, fail-closed):
  - `--confirm-local` is REQUIRED or the run aborts.
  - Target base URL host must be 127.0.0.1 / localhost / ::1 AND the port must
    be exactly 3000 or 3001. Anything else aborts before any request.
  - Hard caps: MAX_REQUESTS=500, MAX_DURATION=60s.
  - The engine STOPS the moment its mode's terminal signal is observed
    (WITHOUT-AI: /health unavailable; WITH-AI: sustained 429 mitigation). It
    never "blasts past" containment.
  - No process termination, no firewall/network/kernel changes, no OS-level
    commands, no remote targets, no IP spoofing. Metrics are computed only
    from real HTTP observations (no fabrications).

Stdlib only — runnable on any stock Python 3.
"""

from __future__ import annotations

import argparse
import json
import sys
import threading
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urlparse

MAX_REQUESTS = 500
MAX_DURATION = 60.0
CONCURRENCY = 4
HEALTH_POLL_INTERVAL = 0.5
HTTP_TIMEOUT = 8.0
PASSWORD = "7aX-contr0l-local"
SOURCE = "127.0.0.1"

ALLOWED = {
    ("127.0.0.1", 3001),
    ("localhost", 3001),
    ("::1", 3001),
    ("127.0.0.1", 3000),
    ("localhost", 3000),
    ("::1", 3000),
}


def login_once(base: str) -> tuple[int, int]:
    """One forged failed-login request. Returns (http_status, latency_ms)."""
    identifier = "burst{:03d}@local.invalid".format(time.time_ns() % 100000)
    body = json.dumps({"identifier": identifier, "password": PASSWORD}).encode("utf-8")
    req = urllib.request.Request(
        base + "/api/auth/login",
        data=body,
        headers={"Content-Type": "application/json", "X-Request-Id": "cd34a7-{:016d}".format(time.time_ns())},
        method="POST",
    )
    start = time.monotonic()
    try:
        with urllib.request.urlopen(req, timeout=HTTP_TIMEOUT) as resp:
            return int(resp.status), int((time.monotonic() - start) * 1000)
    except urllib.error.HTTPError as err:
        return int(err.code), int((time.monotonic() - start) * 1000)
    except Exception:
        return -1, int((time.monotonic() - start) * 1000)


def health_once(base: str) -> tuple[str, int, int]:
    """Returns (status, http_code, latency_ms); status parsed from /api/health."""
    start = time.monotonic()
    try:
        req = urllib.request.Request(base + "/api/health", method="GET")
        with urllib.request.urlopen(req, timeout=HTTP_TIMEOUT) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
            return str(payload.get("status", "unknown")), int(resp.status), int(
                (time.monotonic() - start) * 1000
            )
    except urllib.error.HTTPError as err:
        try:
            payload = json.loads(err.read().decode("utf-8"))
            return str(payload.get("status", "unavailable")), int(err.code), int(
                (time.monotonic() - start) * 1000
            )
        except Exception:
            return "unavailable", int(err.code), int((time.monotonic() - start) * 1000)
    except Exception:
        return "unreachable", 0, int((time.monotonic() - start) * 1000)


def target_allowed(base: str) -> bool:
    parsed = urlparse(base)
    host = (parsed.hostname or "").lower()
    return (host, parsed.port) in ALLOWED


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="BuildHub same-attack demo (localhost only).")
    parser.add_argument(
        "--confirm-local",
        action="store_true",
        required=True,
        help="MANDATORY confirmation that the target is loopback. Aborts without it.",
    )
    parser.add_argument("--target", default="http://127.0.0.1:3000")
    parser.add_argument("--mode", choices=("noai", "ai"), default="ai")
    parser.add_argument("--max-requests", type=int, default=MAX_REQUESTS)
    parser.add_argument("--max-duration", type=float, default=MAX_DURATION)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if not args.confirm_local:
        print("ABORT: --confirm-local is required.")
        return 2
    if not target_allowed(args.target):
        print(
            "ABORT: target must be loopback only (127.0.0.1 | localhost, ports 3000/3001). "
            "Refusing to emit traffic elsewhere."
        )
        return 2

    base = args.target.rstrip("/")
    mode = args.mode
    max_requests = min(args.max_requests, MAX_REQUESTS)
    max_duration = min(args.max_duration, MAX_DURATION)

    print("=" * 72)
    print(f"BUILDHUB SAME-ATTACK DEMO  [{mode}]  target={base}")
    print(
        f"limits: requests<={max_requests}  duration<={max_duration:.0f}s  "
        f"concurrency={CONCURRENCY}  source={SOURCE}"
    )
    print("=" * 72, flush=True)

    start = time.monotonic()
    results: list[tuple[int, int]] = []
    blocked_streak = 0
    stop_flag = threading.Event()
    reason = "max requests / duration reached"
    degradation_at_s: float | None = None
    unavailable_at_s: float | None = None

    health: list[tuple[float, str, int, int]] = []

    def watch_health() -> None:
        nonlocal degradation_at_s, unavailable_at_s, blocked_streak, reason
        while not stop_flag.is_set():
            now = time.monotonic() - start
            status, code, latency = health_once(base)
            health.append((now, status, code, latency))
            if status in ("degraded", "unavailable") and degradation_at_s is None:
                degradation_at_s = now
            if status == "unavailable" and unavailable_at_s is None:
                unavailable_at_s = now
            recent = [h[1] for h in health[-3:]]
            if mode == "noai" and len(recent) == 3 and all(h == "unavailable" for h in recent):
                reason = "noai terminal: /health UNAVAILABLE observed (3 consecutive)"
                stop_flag.set()
            if mode == "ai" and blocked_streak >= 20:
                reason = f"ai terminal: {blocked_streak} consecutive HTTP 429 (mitigation active)"
                stop_flag.set()
            stop_flag.wait(HEALTH_POLL_INTERVAL)

    watcher = threading.Thread(target=watch_health, daemon=True)
    watcher.start()

    sent = 0
    errors = 0
    peak_latency = 0
    with ThreadPoolExecutor(max_workers=CONCURRENCY) as pool:
        futures = []
        while sent < max_requests and (time.monotonic() - start) < max_duration:
            if stop_flag.is_set():
                break
            futures.append(pool.submit(login_once, base))
            sent += 1
            if len(futures) >= CONCURRENCY * 8:
                for future in futures:
                    status, latency = future.result()
                    results.append((status, latency))
                    peak_latency = max(peak_latency, latency)
                    if status >= 500 or status == -1:
                        errors += 1
                    if status == 429:
                        blocked_streak += 1
                    else:
                        blocked_streak = 0
                futures = []
        for future in futures:
            status, latency = future.result()
            results.append((status, latency))
            peak_latency = max(peak_latency, latency)
            if status >= 500 or status == -1:
                errors += 1
            if status == 429:
                blocked_streak += 1
            else:
                blocked_streak = 0

    attack_elapsed = time.monotonic() - start
    stop_flag.set()
    watcher.join(timeout=2)

    if mode == "ai" and unavailable_at_s is not None:
        print(f"UNEXPECTED: WITH-AI service became unavailable at t={unavailable_at_s:.1f}s")
        return 1

    recovery_s: float | None = None
    if mode == "ai":
        print("waiting for recovery (/health -> ok) ...", flush=True)
        deadline = time.monotonic() + 180
        while time.monotonic() < deadline:
            current_health = health_once(base)
            if current_health[0] == "ok":
                recovery_s = time.monotonic() - start
                break
            time.sleep(2.0)

    final_health = health_once(base)

    status_hist: dict[int, int] = {}
    for status, _ in results:
        status_hist[status] = status_hist.get(status, 0) + 1

    print("-" * 72)
    print(f"ATTACK STOPPED: {reason}")
    print(f"  total requests sent: {sent}   elapsed: {attack_elapsed:.1f}s")
    print(f"  responses: {dict(sorted(status_hist.items()))}")
    if mode == "ai":
        print(f"  blocked (HTTP 429) requests: {status_hist.get(429, 0)}")
    print(f"  error responses (5xx/conn): {errors}")
    print(f"  peak login latency: {peak_latency} ms")
    if degradation_at_s is not None:
        print(f"  time to first degraded health: {degradation_at_s:.1f}s")
    if unavailable_at_s is not None:
        print(f"  time to first unavailable health: {unavailable_at_s:.1f}s")
    if recovery_s is not None:
        print(f"  time to recovery (health ok): {recovery_s:.1f}s")
    print("-" * 72)
    print("FINAL HEALTH:", final_health)
    print("=" * 72)

    ok = False
    if mode == "noai":
        ok = unavailable_at_s is not None and final_health[0] == "unavailable"
    else:
        ok = status_hist.get(429, 0) >= 20 and final_health[0] != "unavailable"

    summary = {
        "mode": mode,
        "target": base,
        "requests": sent,
        "elapsed_s": round(attack_elapsed, 2),
        "status_histogram": status_hist,
        "errors": errors,
        "peak_latency_ms": peak_latency,
        "time_to_degradation_s": round(degradation_at_s, 2) if degradation_at_s is not None else None,
        "time_to_unavailable_s": round(unavailable_at_s, 2) if unavailable_at_s is not None else None,
        "recovery_s": round(recovery_s, 2) if recovery_s is not None else None,
        "final_health": final_health,
        "stopped_reason": reason,
        "expected_outcome_observed": ok,
    }
    print(json.dumps(summary, indent=2))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())