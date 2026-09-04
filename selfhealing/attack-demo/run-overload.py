#!/usr/bin/env python3
"""run-overload.py — BuildHub hard-overload attack demonstration client.

An INDEPENDENT, localhost-only overload client for the final BEFORE/AFTER demo.
It lives OUTSIDE both applications (repo root `attack-demo/`), imports nothing
from `frontend/` or `buildhub-no-ai/`, and needs only the Python 3 standard
library.

It sends a bounded, multi-endpoint HTTP workload to loopback ONLY:

    127.0.0.1:3000   (AI BuildHub — must detect + contain on its own)
    127.0.0.1:3001   (No-AI BuildHub — must degrade + become unavailable on its own)

Workload (identical on both ports — only the port changes):

    POST /api/auth/login   forged credentials, rate-bounded (default 12/s)
    GET  /api/posts        unauthenticated probing (sustained traffic)
    GET  /api/projects     unauthenticated probing (sustained traffic)
    GET  /api/health       live probes

=== HARD SAFETY LIMITS (enforced, fail-closed) =============================
* MAX_DURATION    20 s      absolute wall-clock cap
* MAX_REQUESTS    3000      default request cap (4000 hard ceiling)
* MAX_CONCURRENCY 16        absolute in-flight cap
* login stream is rate-bounded (DEFAULT_LOGIN_RATE = 12 forged sign-ins/s,
  hard ceiling 100/s) so the legitimate-looking GET traffic dominates
  and the applications' designed thresholds unfold over visible seconds.
* host is ALWAYS one of {127.0.0.1, localhost, ::1}; port one of {3000, 3001}.
* `--confirm-local` is REQUIRED or the run aborts before a single request.
* STOP immediately when a terminal signal is observed:
    - /api/health reports UNAVAILABLE (WITHOUT-AI terminal state),
    - HTTP 429 from /api/auth/login (WITH-AI mitigation / containment),
    - the request or time cap is reached,
    - Ctrl+C.
* This script NEVER kills/restarts/pokes any process, never touches OS/network
  configuration, never writes files/databases, never spoofs addresses, scans
  networks, or sends destructive payloads.
* Every number in the timeline and the ATTACK RESULT is a REAL observation of
  the traffic and the applications' real responses — nothing is fabricated.

Usage:
    python3 attack-demo/run-overload.py --port 3001 --confirm-local
    python3 attack-demo/run-overload.py --port 3000 --confirm-local
"""

from __future__ import annotations

import argparse
import http.client
import json
import sys
import threading
import time
from datetime import datetime

# --- Hard limits (never exceeded regardless of CLI overrides) --------------
MAX_DURATION = 20.0
MAX_REQUESTS = 3000
MAX_REQUESTS_CEILING = 4000
MAX_CONCURRENCY = 16
HEALTH_POLL_INTERVAL = 0.5
HTTP_TIMEOUT = 8.0
DEFAULT_LOGIN_RATE = 12.0
LOGIN_RATE_CEILING = 100.0

SOURCE_HOST = "127.0.0.1"
ALLOWED_HOSTS = ("127.0.0.1", "localhost", "::1")
ALLOWED_PORTS = (3000, 3001)

HEALTH_PATH = "/api/health"
LOGIN_PATH = "/api/auth/login"
POSTS_PATH = "/api/posts"
PROJECTS_PATH = "/api/projects"
TELEMETRY_PATH = "/api/demo/attack"
PASSWORD = "7aX-contr0l-local"

PROBE_INTERVAL = 1.5
MIN_RECONNECT_DELAY = 0.02

# Sustained (GET) workload endpoints — identical on both ports.
GET_ENDPOINTS = (
    ("posts", "GET", POSTS_PATH),
    ("projects", "GET", PROJECTS_PATH),
    ("health", "GET", HEALTH_PATH),
)
GET_NAMES = tuple(name for name, _, _ in GET_ENDPOINTS)


def forged_identifier() -> str:
    return f"burst{time.time_ns() % 100000:03d}@local.invalid"


def forged_request_id() -> str:
    return f"cd34a7-{time.time_ns():016d}"


def _try_json(raw: str) -> dict | None:
    try:
        parsed = json.loads(raw)
        return parsed if isinstance(parsed, dict) else None
    except Exception:
        return None


class Conn:
    """Thin keep-alive wrapper over http.client (stdlib only)."""

    def __init__(self, host: str, port: int) -> None:
        self.host = host
        self.port = port
        self.conn = http.client.HTTPConnection(host, port, timeout=HTTP_TIMEOUT)

    def request(self, method: str, path: str, body: dict | None = None) -> tuple[int | None, dict | None, float]:
        headers = {"X-Request-Id": forged_request_id()}
        payload = None
        if body is not None:
            headers["Content-Type"] = "application/json"
            payload = json.dumps(body).encode("utf-8")
        start = time.monotonic()
        try:
            self.conn.request(method, path, body=payload, headers=headers)
            resp = self.conn.getresponse()
            raw = resp.read().decode("utf-8", "replace")
            latency = (time.monotonic() - start) * 1000.0
            return int(resp.status), _try_json(raw), latency
        except Exception:
            latency = (time.monotonic() - start) * 1000.0
            self._reopen()
            return None, None, latency

    def _reopen(self) -> None:
        try:
            self.conn.close()
        except Exception:
            pass
        self.conn = http.client.HTTPConnection(self.host, self.port, timeout=HTTP_TIMEOUT)

    def close(self) -> None:
        try:
            self.conn.close()
        except Exception:
            pass


def probe_health(host: str, port: int) -> tuple[str, int | None, float]:
    conn = Conn(host, port)
    try:
        code, payload, latency = conn.request("GET", HEALTH_PATH)
    finally:
        conn.close()
    if code is None:
        return "unreachable", None, latency
    label = "unknown"
    if isinstance(payload, dict):
        label = str(payload.get("status", "unknown"))
    if code >= 500 and label in ("unknown", "ok"):
        label = "unavailable"
    return label, code, latency


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="BuildHub hard-overload demo client (loopback only).",
    )
    parser.add_argument(
        "--port",
        type=int,
        required=True,
        help=f"Loopback port — one of {ALLOWED_PORTS}. 3001 = No-AI (fails), 3000 = AI (contained).",
    )
    parser.add_argument(
        "--host",
        default=SOURCE_HOST,
        help=f"Loopback host — one of {ALLOWED_HOSTS} (default {SOURCE_HOST}).",
    )
    parser.add_argument(
        "--confirm-local",
        action="store_true",
        required=True,
        help="MANDATORY confirmation the target is loopback. The run aborts without it.",
    )
    parser.add_argument(
        "--max-duration",
        type=float,
        default=MAX_DURATION,
        help=f"Wall-clock cap in seconds (hard max {MAX_DURATION:.0f}s; clamped).",
    )
    parser.add_argument(
        "--max-requests",
        type=int,
        default=MAX_REQUESTS,
        help=f"Request cap (default {MAX_REQUESTS}; hard ceiling {MAX_REQUESTS_CEILING}; clamped).",
    )
    parser.add_argument(
        "--concurrency",
        type=int,
        default=9,
        help=f"In-flight request cap (default 9; hard max {MAX_CONCURRENCY}; clamped).",
    )
    parser.add_argument(
        "--login-rate",
        type=float,
        default=DEFAULT_LOGIN_RATE,
        help=f"Forged sign-in rate cap per second (default {DEFAULT_LOGIN_RATE:.0f}; ceiling {LOGIN_RATE_CEILING:.0f}; 0 disables).",
    )
    for name in GET_NAMES:
        parser.add_argument(
            f"--w-{name}",
            type=float,
            help=f"sustained-traffic share for /{name} as a fraction (e.g. 0.4); non-negative, sum > 0.",
        )
    return parser.parse_args()


def normalize_weights(args: argparse.Namespace) -> dict[str, float]:
    defaults = {"posts": 0.45, "projects": 0.33, "health": 0.22}
    values = {
        name: float(getattr(args, f"w_{name}")) if getattr(args, f"w_{name}") is not None else defaults[name]
        for name in GET_NAMES
    }
    for name, value in values.items():
        if value < 0:
            print(f"ABORT: workload weight for /{name} must be >= 0 (loopback demo only).")
            return {}
    total = sum(values.values())
    if total <= 0:
        print("ABORT: workload weights must sum to more than 0.")
        return {}
    return {name: value / total for name, value in values.items()}


def pick_get_endpoint(index: int, cum: list[tuple[str, float]]) -> str:
    point = ((index * 2654435761) % (2**32)) / float(2**32)
    for name, bound in cum:
        if point < bound:
            return name
    return cum[-1][0]


class LoginScheduler:
    """Rate-limits the forged-sign-in stream to <= max_per_second (shared, thread-safe)."""

    def __init__(self, max_per_second: float) -> None:
        self.max_per_second = max(0.0, min(max_per_second, LOGIN_RATE_CEILING))
        self.lock = threading.Lock()
        self.window: list[float] = []

    def acquire(self) -> bool:
        if self.max_per_second <= 0:
            return False
        with self.lock:
            now = time.monotonic()
            self.window = [t for t in self.window if now - t < 1.0]
            if len(self.window) < self.max_per_second:
                self.window.append(now)
                return True
            return False


# ---------------------------------------------------------------------------
# The overload run
# ---------------------------------------------------------------------------

class Overload:
    def __init__(self, host: str, port: int, args: argparse.Namespace) -> None:
        self.host = host
        self.port = port
        self.max_duration = min(args.max_duration, MAX_DURATION)
        self.max_requests = min(args.max_requests, MAX_REQUESTS_CEILING)
        self.concurrency = min(args.concurrency, MAX_CONCURRENCY)
        self.stop = threading.Event()
        self.lock = threading.Lock()
        self.state = {
            "issued": 0,
            "completed": 0,
            "conn_errors": 0,
            "hist": {},
            "per_endpoint": {},
            "latencies": [],
            "peak_latency_ms": 0,
            "reason": "duration or request cap reached (no terminal signal observed)",
        }
        self.health_latest = {"status": "unknown", "http": None}
        self.emitted: set[str] = set()
        self.timeline: list[tuple[float, str]] = []
        self.started = 0.0
        self.first_429_at: float | None = None
        self.first_503_at: float | None = None
        self.seen_unavailable = False

    def emit(self, key: str, text: str) -> None:
        if key in self.emitted:
            return
        with self.lock:
            if key in self.emitted:
                return
            self.emitted.add(key)
            elapsed = time.monotonic() - self.started
            self.timeline.append((elapsed, text))
        print(f"{elapsed:5.1f}s  {text}", flush=True)

    def record(self, code: int | None, latency: float, name: str) -> None:
        with self.lock:
            self.state["hist"][code] = self.state["hist"].get(code, 0) + 1
            self.state["completed"] += 1
            self.state["per_endpoint"][name] = self.state["per_endpoint"].get(name, 0) + 1
            self.state["latencies"].append(latency)
            self.state["peak_latency_ms"] = max(self.state["peak_latency_ms"], int(latency))
            if code is None:
                self.state["conn_errors"] += 1
        if code == 429 and name == "login":
            self.first_429_at = time.monotonic()
            self.state["reason"] = "AI mitigation observed (HTTP 429 from /api/auth/login) — ATTACK CONTAINED"
            self.emit(
                "mitigation-429",
                "First HTTP 429 from POST /api/auth/login — AI mitigation (temporary source block active)",
            )
            self.stop.set()
        elif code is not None and code >= 500 and name == "login":
            self.first_503_at = time.monotonic()
            self.state["reason"] = "HTTP 503 from /api/auth/login — WITHOUT-AI service unavailable"
            self.emit("login-503", "First HTTP 503 from POST /api/auth/login — WITHOUT-AI service latched UNAVAILABLE")
            self.stop.set()

    def snapshot(self) -> dict:
        with self.lock:
            return {
                "issued": self.state["issued"],
                "completed": self.state["completed"],
                "hist": dict(self.state["hist"]),
                "errs": self.state["conn_errors"],
                "latencies": list(self.state["latencies"]),
            }


def main() -> int:
    args = parse_args()

    if not args.confirm_local:
        print("ABORT: --confirm-local is required. The target must be loopback (127.0.0.1).")
        return 2
    if args.host not in ALLOWED_HOSTS:
        print(f"ABORT: host must be one of {ALLOWED_HOSTS} (loopback only). Refusing to continue.")
        return 2
    if args.port not in ALLOWED_PORTS:
        print(f"ABORT: port must be one of {ALLOWED_PORTS} (3001 No-AI / 3000 AI). Refusing to continue.")
        return 2
    if args.login_rate < 0:
        print("ABORT: --login-rate must be >= 0 (rate-bounded forged sign-in stream).")
        return 2

    weights = normalize_weights(args)
    if not weights:
        return 2
    cum: list[tuple[str, float]] = []
    acc = 0.0
    for name in GET_NAMES:
        acc += weights[name]
        cum.append((name, acc))
    login_sched = LoginScheduler(args.login_rate)

    run = Overload(args.host, args.port, args)
    base = f"http://{args.host}:{args.port}"
    expected = "contained by AI" if args.port == 3000 else "fails (unavailable)"

    boot_health, boot_code, _ = probe_health(args.host, args.port)
    if boot_code is None:
        print(f"ABORT: nothing listening at {base} (/api/health unreachable). Start the server first.")
        return 4
    if boot_health == "unavailable":
        print(f"ABORT: {base} is ALREADY unavailable ({boot_health}). Reset/recover first.")
        return 4
    if args.port == 3001 and boot_health == "degraded":
        print("pre-flight: already degraded — an operator reset is recommended for a clean run.")
    else:
        print(f"pre-flight /api/health @ {base} -> {boot_health} (HTTP {boot_code})")

    if args.port == 3000:
        conn = Conn(args.host, args.port)
        try:
            code, payload, _ = conn.request("GET", TELEMETRY_PATH)
        finally:
            conn.close()
        prior = (payload or {}).get("state") or {}
        if code == 200 and (prior.get("blockedCount") or 0) > 0:
            print(
                "  note: AI telemetry shows a prior blockedCount="
                f"{prior.get('blockedCount')} — an operator POST /api/demo/attack "
                "{action:reset} is recommended for a clean run."
            )

    print("=" * 78)
    print(f"HARD-OVERLOAD DEMO   target={base}   expected: {expected}")
    print(
        f"limits: duration<={run.max_duration:.0f}s  requests<={run.max_requests}  "
        f"concurrency<={run.concurrency}  host={args.host}  ports={ALLOWED_PORTS}"
    )
    wl = "  ·  ".join(f"{name.upper()} /{name} {weights[name] * 100:.0f}%" for name in GET_NAMES)
    print(f"workload: LOGIN /login <= {login_sched.max_per_second:.0f}/s  ·  " + wl)
    print("=" * 78, flush=True)

    run.started = time.monotonic()
    start = run.started

    def health_watcher() -> None:
        while not run.stop.is_set():
            status, code, _ = probe_health(args.host, args.port)
            degraded = False
            unavailable = False
            with run.lock:
                run.health_latest = {"status": status, "http": code}
                if status == "degraded":
                    degraded = "health-degraded" not in run.emitted
                elif status == "unavailable":
                    unavailable = "health-unavailable" not in run.emitted
                    run.seen_unavailable = True
                    run.state["reason"] = "/api/health UNAVAILABLE — service down"
                    run.stop.set()
            if degraded:
                run.emit("health-degraded", f"Health first reported DEGRADED (GET /api/health -> {status} HTTP {code})")
            if unavailable:
                run.emit("health-unavailable", f"Health first reported UNAVAILABLE (GET /api/health -> {status} HTTP {code})")
            run.stop.wait(HEALTH_POLL_INTERVAL)

    def worker(wid: int) -> None:
        idx = 0
        conn = Conn(args.host, args.port)
        try:
            while not run.stop.is_set():
                with run.lock:
                    if run.state["issued"] >= run.max_requests:
                        break
                    run.state["issued"] += 1
                idx += 1
                if login_sched.acquire():
                    code, _payload, latency = conn.request(
                        "POST", LOGIN_PATH, {"identifier": forged_identifier(), "password": PASSWORD}
                    )
                    name = "login"
                else:
                    name = pick_get_endpoint(idx, cum)
                    method = path = None
                    for n, m, p in GET_ENDPOINTS:
                        if n == name:
                            method, path = m, p
                            break
                    code, _payload, latency = conn.request(method or "GET", path or HEALTH_PATH)
                run.record(code, latency, name)
                if code is None:
                    time.sleep(MIN_RECONNECT_DELAY)
        finally:
            conn.close()

    def reporter() -> None:
        while not run.stop.is_set():
            run.stop.wait(PROBE_INTERVAL)
            snap = run.snapshot()
            if run.stop.is_set() and snap["completed"] >= snap["issued"]:
                break
            elapsed = time.monotonic() - start
            lats = snap["latencies"]
            avg = sum(lats) / len(lats) if lats else 0.0
            p95 = sorted(lats)[int(len(lats) * 0.95)] if lats else 0.0
            fivexx = sum(n for c, n in snap["hist"].items() if c is not None and c >= 500)
            fourxx = sum(n for c, n in snap["hist"].items() if c is not None and 400 <= c < 500)
            print(
                f"{elapsed:5.1f}s  live  sent={snap['issued']} done={snap['completed']} "
                f"rps~{int(snap['issued'] / elapsed) if elapsed else 0}  "
                f"avg={avg:5.0f}ms p95={p95:5.0f}ms  2xx={snap['hist'].get(200, 0)} "
                f"4xx={fourxx} 5xx={fivexx} err={snap['errs']}",
                flush=True,
            )

    workers = [threading.Thread(target=worker, args=(w,), daemon=True) for w in range(run.concurrency)]
    for w in workers:
        w.start()
    watch = threading.Thread(target=health_watcher, daemon=True)
    watch.start()
    rep = threading.Thread(target=reporter, daemon=True)
    rep.start()

    run.emit("start", "Attack started")
    full_emitted = False
    hundred_emitted = False

    try:
        while not run.stop.is_set():
            with run.lock:
                issued = run.state["issued"]
            if issued >= run.max_requests:
                run.state["reason"] = f"request cap reached ({run.max_requests})"
                run.stop.set()
                break
            if time.monotonic() - start >= run.max_duration:
                run.state["reason"] = f"duration cap reached ({run.max_duration:.0f}s)"
                run.stop.set()
                break
            if not full_emitted and issued >= run.concurrency:
                full_emitted = True
                run.emit("full-concurrency", f"Traffic at full concurrency ({run.concurrency} workers)")
            if not hundred_emitted and issued >= 100:
                hundred_emitted = True
                run.emit("traffic-100", "Traffic increasing — 100 requests issued")
            time.sleep(0.02)
    except KeyboardInterrupt:
        run.state["reason"] = "interrupted by operator (Ctrl+C)"
        run.stop.set()

    run.stop.set()
    for w in workers:
        w.join(timeout=HTTP_TIMEOUT + 1)
    watch.join(timeout=2)
    rep.join(timeout=2)

    elapsed = time.monotonic() - start
    final_health, final_code, _ = probe_health(args.host, args.port)
    if final_health == "unavailable":
        run.seen_unavailable = True

    inc: dict | None = None
    ai_runs: list[dict] = []
    if args.port == 3000 and run.first_429_at is not None:
        inc, ai_runs = verify_ai_pipeline(run)

    snap = run.snapshot()
    with run.lock:
        per_endpoint = dict(run.state["per_endpoint"])
        peak = run.state["peak_latency_ms"]
        reason = run.state["reason"]

    print("-" * 78)
    print("RUN TIMELINE (real observations only, in observed order)")
    for ts, text in sorted(run.timeline):
        print(f"  {ts:5.1f}s  {text}")

    print("-" * 78)
    print("ATTACK RESULT")
    print(f"  Target:              {base}")
    print(f"  Requests issued:     {snap['issued']}")
    print(f"  Responses received:  {snap['completed']}")
    if snap["errs"]:
        print(f"  Connection errors:   {snap['errs']}")
    print(f"  Elapsed:             {elapsed:.1f}s")
    print(f"  Peak latency:        {peak} ms")
    lats = snap["latencies"]
    if lats:
        print(f"  Avg latency:         {sum(lats) / len(lats):.0f} ms    p95: {sorted(lats)[int(len(lats) * 0.95)]:.0f} ms")
    fivexx = sum(n for c, n in snap["hist"].items() if c is not None and c >= 500)
    fourxx = sum(n for c, n in snap["hist"].items() if c is not None and 400 <= c < 500)
    print(f"  2xx: {snap['hist'].get(200, 0)}    4xx: {fourxx}    5xx: {fivexx}")
    code_row = "  ".join(
        f"{c}={n}" for c, n in sorted((k, v) for k, v in snap["hist"].items() if k is not None)
    )
    print(f"  Status by code:      {code_row}")
    if per_endpoint:
        print("  By endpoint:         " + "  ".join(f"{n}={c}" for n, c in per_endpoint.items()))
    print(f"  Final health:        {final_health} (HTTP {final_code})")
    print(f"  Stop reason:         {reason}")
    print("=" * 78)

    if args.port == 3001:
        down = run.seen_unavailable or final_health == "unavailable"
        print(
            "VERDICT: WITHOUT-AI reached UNAVAILABLE on its own (no auto-mitigation)."
            if down
            else "VERDICT: WITHOUT-AI did NOT reach UNAVAILABLE — check the latch + DEMO_AUTH_* env."
        )
        print("Recovery is an OPERATOR action (signed-in reset or restart) — never done here.")
        ok = bool(down)
    else:
        contained = run.first_429_at is not None and final_health != "unavailable"
        print("ATTACK CONTAINED." if contained else "ATTACK NOT CONTAINED.")
        if contained:
            print("Post-stop verification: GET /api/health ->", (final_health, final_code))
            if inc:
                print(
                    f"  Incident {inc.get('ref')} · {inc.get('status')} · {inc.get('severity')} · "
                    f"risk {inc.get('riskScore')} · {inc.get('title')}"
                )
            for r in ai_runs:
                print(f"  Pipeline {r.get('agent')} {r.get('status')} (round {r.get('round')})")
        ok = bool(contained)

    return 0 if ok else 3


def verify_ai_pipeline(run: Overload) -> tuple[dict | None, list[dict]]:
    """Reads the REAL WITH-AI pipeline state via its public telemetry (observation only)."""
    conn = Conn(run.host, run.port)
    incident: dict | None = None
    runs: list[dict] = []
    seen: set[tuple[str, int]] = set()
    try:
        for _ in range(16):
            code, payload, _ = conn.request("GET", TELEMETRY_PATH)
            if code != 200 or not isinstance(payload, dict):
                time.sleep(0.5)
                continue
            state = payload.get("state") or {}
            if not incident and payload.get("incident"):
                incident = payload["incident"]
                run.emit(
                    "incident-created",
                    f"Incident {incident.get('ref')} created · {incident.get('severity')} · "
                    f"risk {incident.get('riskScore')} · {incident.get('title')}",
                )
            if (state.get("blockedCount") or 0) > 0 and not incident:
                run.emit(
                    "mitigation-active",
                    f"Mitigation active — temporary source block (429) until {state.get('blockedUntil') or '?'}",
                )
            for r in payload.get("agentRuns") or []:
                key = (str(r.get("agent")), int(r.get("round") or 0))
                if key in seen:
                    continue
                seen.add(key)
                runs.append(r)
                if str(r.get("status")) == "COMPLETE":
                    run.emit(
                        f"agent-{r.get('agent')}-{r.get('round')}",
                        f"Pipeline {r.get('agent')} COMPLETE (round {r.get('round')})",
                    )
            if any(str(r.get("agent")) == "JUDGE" and str(r.get("status")) == "COMPLETE" for r in runs):
                break
            time.sleep(0.5)
    finally:
        conn.close()
    return incident, runs


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print("\ninterrupted by operator (Ctrl+C).")
        sys.exit(130)