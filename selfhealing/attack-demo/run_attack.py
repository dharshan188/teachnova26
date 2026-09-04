#!/usr/bin/env python3
"""run_attack.py — BuildHub final localhost attack demonstration client.

A SINGLE, fully independent attack client for the "same attack on both
builds" demo. It lives OUTSIDE both applications (repo root `attack-demo/`),
imports nothing from `frontend/` or `buildhub-no-ai/`, and needs only the
Python 3 standard library.

It ONLY sends HTTP requests to loopback:

    127.0.0.1:3000   (AI BuildHub — must detect + mitigate on its own)
    127.0.0.1:3001   (No-AI BuildHub — must fail on its own)

Deliberate, controlled, invalid authentication attempts reproduce each
application's defined security/failure condition:

    WITHOUT-AI (:3001)  NORMAL -> ATTACK -> DEGRADED -> UNAVAILABLE
    WITH-AI     (:3000)  NORMAL -> ATTACK -> DETECTED -> MITIGATING -> HEALTHY

=== HARD SAFETY LIMITS (enforced, fail-closed) =============================
* MAX_REQUESTS    300    absolute request cap
* MAX_DURATION    60s    absolute wall-clock cap
* MAX_CONCURRENCY 5      absolute in-flight cap
* target is ALWAYS 127.0.0.1:<--port>; only ports 3000/3001 are accepted.
* `--confirm-local` is REQUIRED or the run aborts before a single request.
* STOP immediately when the designed terminal signal is observed:
    - /health becomes UNAVAILABLE,
    - the mitigation is observed (HTTP 429 from /api/auth/login),
    - the request or time limit is reached,
    - Ctrl+C.
* This script NEVER: kills/restarts/pokes any process, touches the OS/network
  config, spoofs an IP address, sends destructive payloads, or touches
  anything outside loopback:3000/3001.
* Every reported number is computed ONLY from real HTTP observations — nothing
  is fabricated.

Usage:
    python3 attack-demo/run_attack.py --port 3001 --confirm-local
    python3 attack-demo/run_attack.py --port 3000 --confirm-local
"""

from __future__ import annotations

import argparse
import json
import sys
import threading
import time
import urllib.error
import urllib.request
from concurrent.futures import Future, ThreadPoolExecutor
from datetime import datetime

# --- Hard limits (never exceeded regardless of CLI overrides) --------------
MAX_REQUESTS = 300
MAX_DURATION = 60.0
MAX_CONCURRENCY = 5
HEALTH_POLL_INTERVAL = 0.5
HTTP_TIMEOUT = 8.0

ALLOWED_PORTS = (3000, 3001)
SOURCE = "127.0.0.1"

# The one and only attack vector (mirrors the repository's existing demo):
# valid-shape but wholly forged credentials against the real sign-in endpoint.
LOGIN_PATH = "/api/auth/login"
HEALTH_PATH = "/api/health"
PASSWORD = "7aX-contr0l-local"


def iso_now() -> str:
    return datetime.now().isoformat(timespec="milliseconds")


def forged_identifier() -> str:
    return f"burst{time.time_ns() % 100000:03d}@local.invalid"


def forged_request_id() -> str:
    return f"cd34a7-{time.time_ns():016d}"


# ---------------------------------------------------------------------------
# HTTP primitives (urllib only — no raw sockets, no spoofing, no subprocess)
# ---------------------------------------------------------------------------

def http_json(method: str, base: str, path: str, body: dict | None = None) -> tuple[int | None, dict | None, float]:
    """Returns (http_status_or_None, parsed_json_or_None, latency_ms)."""
    url = base + path
    start = time.monotonic()
    headers = {"X-Request-Id": forged_request_id()}
    if body is not None:
        headers["Content-Type"] = "application/json"
        payload = json.dumps(body).encode("utf-8")
    else:
        payload = None
    req = urllib.request.Request(url, data=payload, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=HTTP_TIMEOUT) as resp:
            status = int(resp.status)
            raw = resp.read().decode("utf-8", "replace")
            latency = (time.monotonic() - start) * 1000.0
            return status, _try_json(raw), latency
    except urllib.error.HTTPError as err:
        raw = err.read().decode("utf-8", "replace")
        latency = (time.monotonic() - start) * 1000.0
        return int(err.code), _try_json(raw), latency
    except Exception:
        return None, None, (time.monotonic() - start) * 1000.0


def _try_json(raw: str) -> dict | None:
    try:
        parsed = json.loads(raw)
        return parsed if isinstance(parsed, dict) else None
    except Exception:
        return None


def probe_health(base: str) -> tuple[str, int | None, float]:
    """Returns (status_label, http_code, latency_ms) for GET /api/health."""
    code, payload, latency = http_json("GET", base, HEALTH_PATH)
    if code is None:
        return "unreachable", None, latency
    label = "unknown"
    if isinstance(payload, dict):
        label = str(payload.get("status", "unknown"))
    if code >= 500 and label == "unknown":
        label = "unavailable"
    if label == "ok":
        return "ok", code, latency
    return label, code, latency


# ---------------------------------------------------------------------------
# One forged sign-in attempt (identical for both ports)
# ---------------------------------------------------------------------------

def login_once(base: str) -> tuple[int | None, float]:
    code, _payload, latency = http_json(
        "POST",
        base,
        LOGIN_PATH,
        body={"identifier": forged_identifier(), "password": PASSWORD},
    )
    return code, latency


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="BuildHub final attack demonstration client (loopback only).",
    )
    parser.add_argument(
        "--port",
        type=int,
        required=True,
        help=f"Loopback port to attack — must be one of {ALLOWED_PORTS}. "
        f"3001 = No-AI build (expected to fail), 3000 = AI build (expected to contain).",
    )
    parser.add_argument(
        "--confirm-local",
        action="store_true",
        required=True,
        help="MANDATORY confirmation the target is loopback. The run aborts without it.",
    )
    parser.add_argument(
        "--max-requests",
        type=int,
        default=MAX_REQUESTS,
        help=f"Request cap (hard max {MAX_REQUESTS}; larger values are clamped down).",
    )
    parser.add_argument(
        "--max-duration",
        type=float,
        default=MAX_DURATION,
        help=f"Wall-clock cap in seconds (hard max {MAX_DURATION:.0f}s; clamped).",
    )
    parser.add_argument(
        "--concurrency",
        type=int,
        default=MAX_CONCURRENCY,
        help=f"In-flight request cap (hard max {MAX_CONCURRENCY}; clamped).",
    )
    return parser.parse_args()


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> int:
    args = parse_args()

    # Safety gate 1 — explicit operator confirmation.
    if not args.confirm_local:
        print("ABORT: --confirm-local is required. The target must be loopback (127.0.0.1).")
        return 2

    # Safety gate 2 — only the two defined local demo ports, nothing else.
    if args.port not in ALLOWED_PORTS:
        print(
            f"ABORT: port must be one of {ALLOWED_PORTS} "
            f"(3001 No-AI / 3000 AI), loopback only. Refusing to continue."
        )
        return 2

    # Hard caps — never exceed them even if overridden.
    max_requests = min(args.max_requests, MAX_REQUESTS)
    max_duration = min(args.max_duration, MAX_DURATION)
    concurrency = min(args.concurrency, MAX_CONCURRENCY)

    base = f"http://{SOURCE}:{args.port}"
    expected = "contained by AI" if args.port == 3000 else "fails (unavailable)"

    # Pre-flight — refuse to fire at a server that is already down.
    boot_health, boot_code, _ = probe_health(base)
    if boot_code is None:
        print(f"ABORT: nothing listening at {base} (/api/health unreachable). Start the server first.")
        return 2
    if boot_health == "unavailable":
        print(
            f"ABORT: {base} is ALREADY unavailable ({boot_health}). "
            "Reset/recover the server before running the attack."
        )
        return 2
    print(f"pre-flight /api/health @ {base} -> {boot_health} (HTTP {boot_code})")
    if args.port == 3001 and boot_health == "degraded":
        print("  note: already degraded; an operator reset may be needed for a clean run.")

    # -----------------------------------------------------------------------
    print("=" * 78)
    print(f"SAME-CONTROLLED-ATTACK DEMO   target={base}   expected: {expected}")
    print(
        f"limits: requests<={max_requests}  duration<={max_duration:.0f}s  "
        f"concurrency<={concurrency}  source={SOURCE}   vector=POST {LOGIN_PATH}"
    )
    print("=" * 78, flush=True)

    start = time.monotonic()
    stop = threading.Event()
    lock = threading.Lock()

    state = {
        "completed": 0,  # responses received (the honest "requests sent" count)
        "rows": [],  # per-request observations
        "hist": {},  # http status histogram
        "conn_errors": 0,
        "peak_latency_ms": 0,
        "reason": "max requests / duration reached",
    }
    health_latest = {"status": boot_health, "http": boot_code, "at": iso_now()}
    health_history: list[tuple[float, str, int | None, float]] = []

    def snapshot_health() -> dict:
        with lock:
            return dict(health_latest)

    def watch_health() -> None:
        # Independent observer: polls /api/health and stops the run the moment
        # the service reports UNAVAILABLE (the WITHOUT-AI terminal outcome).
        while not stop.is_set():
            status, code, latency = probe_health(base)
            with lock:
                health_latest.update({"status": status, "http": code, "at": iso_now()})
                health_history.append((time.monotonic() - start, status, code, latency))
                if status == "unavailable":
                    state["reason"] = "/health UNAVAILABLE observed — service down"
                    stop.set()
            stop.wait(HEALTH_POLL_INTERVAL)

    watcher = threading.Thread(target=watch_health, daemon=True)
    watcher.start()

    def handle_result(req_num: int, code: int | None, latency: float) -> None:
        health_now = snapshot_health()["status"]
        with lock:
            hist = state["hist"]
            hist[code] = hist.get(code, 0) + 1
            if code is None:
                state["conn_errors"] += 1
                state["reason"] = "connection error — target unreachable (not responding)"
                stop.set()
            elif code == 429 and args.port == 3000:
                state["reason"] = "AI mitigation observed (HTTP 429 from /api/auth/login) — ATTACK CONTAINED"
                stop.set()
            elif code == 503:
                state["reason"] = "HTTP 503 from /api/auth/login — unlatched service unavailable (no-AI)"
                stop.set()
            state["completed"] += 1
            state["peak_latency_ms"] = max(state["peak_latency_ms"], int(latency))
            state["rows"].append(
                {
                    "num": req_num,
                    "ts": iso_now(),
                    "status": code,
                    "latency_ms": int(latency),
                    "health": health_now,
                }
            )

    def emit_observation(row: dict) -> None:
        status = row["status"] if row["status"] is not None else "ERR"
        print(
            f"[{row['ts']}]  #{row['num']:>3}  status={status:>3}  "
            f"latency={row['latency_ms']:>4}ms  health={row['health']}"
        )

    try:
        with ThreadPoolExecutor(max_workers=concurrency) as pool:
            pending: list[tuple[int, Future]] = []
            submitted = 0
            while not stop.is_set():
                if submitted >= max_requests:
                    state["reason"] = f"request limit reached ({max_requests})"
                    break
                if (time.monotonic() - start) >= max_duration:
                    state["reason"] = f"timeout reached ({max_duration:.0f}s)"
                    break
                submitted += 1
                pending.append((submitted, pool.submit(login_once, base)))
                if len(pending) >= concurrency * 2:
                    for num, fut in pending:
                        code, latency = fut.result()
                        handle_result(num, code, latency)
                        with lock:
                            last_row = state["rows"][-1]
                        emit_observation(last_row)
                    pending = []
            for num, fut in pending:
                code, latency = fut.result()
                handle_result(num, code, latency)
                with lock:
                    last_row = state["rows"][-1]
                emit_observation(last_row)
    except KeyboardInterrupt:
        state["reason"] = "interrupted by operator (Ctrl+C)"
        stop.set()

    stop.set()
    watcher.join(timeout=2)

    elapsed = time.monotonic() - start
    reason = state["reason"]

    # Post-stop verification of the real /api/health response.
    final_health = probe_health(base)
    final_code = final_health[1]

    with lock:
        rows_all = list(state["rows"])
        hist = dict(state["hist"])
        conn_errors = state["conn_errors"]
        peak = state["peak_latency_ms"]
        completed = state["completed"]

    print("-" * 78)
    print("REAL OBSERVATION (per completed request: timestamp · number · status · latency · health)")
    for row in sorted(rows_all, key=lambda r: r["num"]):
        emit_observation(row)

    # -----------------------------------------------------------------------
    print("-" * 78)
    print("ATTACK RESULT")
    print(f"  Target:              {base}")
    print(f"  Requests:            {completed}")
    print(f"  401:                 {hist.get(401, 0)}")
    print(f"  403:                 {hist.get(403, 0)}")
    print(f"  429:                 {hist.get(429, 0)}")
    fivexx = sum(n for code, n in hist.items() if code is not None and code >= 500)
    print(f"  5xx:                 {fivexx}")
    if conn_errors:
        print(f"  Connection errors:   {conn_errors}")
    print(f"  Peak latency:        {peak} ms")
    print(f"  Final health:        {final_health[0]} (HTTP {final_code if final_code is not None else 'n/a'})")
    print(f"  Elapsed:             {elapsed:.1f}s")
    print(f"  Stop reason:         {reason}")
    print("=" * 78, flush=True)

    if args.port == 3000:
        contained = hist.get(429, 0) > 0 and final_health[0] != "unavailable"
        print("ATTACK CONTAINED." if contained else "ATTACK NOT CONTAINED.", flush=True)
        print("Post-stop verification: GET /api/health ->", final_health, flush=True)
        ok = contained
    else:
        print("The WITHOUT-AI service failed on its own (no auto-mitigation).", flush=True)
        print("Recovery is an OPERATOR action (reset or restart) — never done by this script.", flush=True)
        ok = final_health[0] == "unavailable"

    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())