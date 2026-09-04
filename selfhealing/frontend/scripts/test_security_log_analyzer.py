#!/usr/bin/env python3
"""Unit tests for security_log_analyzer.py (stdlib unittest).

Run: python3 scripts/test_security_log_analyzer.py
"""

from __future__ import annotations

import unittest

from security_log_analyzer import analyze, build_finding

START_MS = 1_700_000_000_000


def ev(offset_ms: int, *, level="INFO", service="api", status=None,
       route="/api/posts", method="GET", error_code=None,
       request_id="req-0000") -> dict:
    return {
        "ts": START_MS + offset_ms,
        "level": level,
        "service": service,
        "message": "test event",
        "route": route,
        "method": method,
        "status": status,
        "error_code": error_code,
        "request_id": request_id,
    }


def has_rule(findings, rule_id):
    return [f for f in findings if f["ruleId"] == rule_id]


def count_at_least(findings, rule_id, n):
    return len(has_rule(findings, rule_id)) >= n


class RuleTests(unittest.TestCase):
    def test_benign_traffic_no_findings(self):
        events = [ev(i * 60_000) for i in range(10)]
        self.assertEqual(analyze(events), [])

    def test_auth_failure_burst(self):
        events = [ev(i * 10_000, service="auth", status=401, route="/api/auth/login",
                     method="POST", error_code="AUTH_FAILED", request_id=f"auth-{i}")
                  for i in range(3)]
        findings = analyze(events)
        self.assertTrue(count_at_least(findings, "auth-failure-burst", 1))
        rule = has_rule(findings, "auth-failure-burst")[0]
        self.assertEqual(rule["severity"], "HIGH")
        self.assertEqual(rule["count"], 3)
        self.assertEqual(rule["endpoint"], "/api/auth/login")
        self.assertIn("auth-0", rule["requestIds"])

    def test_repeated_401(self):
        events = [ev(i * 120_000, status=401, request_id=f"r401-{i}") for i in range(5)]
        self.assertTrue(count_at_least(analyze(events), "repeated-401", 1))

    def test_repeated_403(self):
        events = [ev(i * 120_000, status=403) for i in range(5)]
        rule = has_rule(analyze(events), "repeated-403")[0]
        self.assertEqual(rule["severity"], "HIGH")

    def test_not_found_burst(self):
        events = [ev(i * 30_000, status=404) for i in range(8)]
        rule = has_rule(analyze(events), "not-found-burst")[0]
        self.assertEqual(rule["severity"], "MEDIUM")

    def test_server_error_spike(self):
        events = [ev(i * 30_000, level="ERROR", status=500) for i in range(5)]
        rule = has_rule(analyze(events), "server-error-spike")[0]
        self.assertEqual(rule["severity"], "HIGH")

    def test_invalid_request_burst(self):
        events = [ev(i * 30_000, status=400) for i in range(10)]
        self.assertTrue(count_at_least(analyze(events), "invalid-request-burst", 1))

    def test_request_frequency_anomaly(self):
        events = [ev(i * 500) for i in range(61)]
        self.assertTrue(count_at_least(analyze(events), "request-frequency-anomaly", 1))

    def test_endpoint_abuse_pattern(self):
        events = [ev(i * 30_000, status=401 if i % 2 else 403) for i in range(15)]
        self.assertTrue(count_at_least(analyze(events), "endpoint-abuse-pattern", 1))

    def test_repeated_unauthorized_mutations(self):
        events = [ev(i * 60_000, status=403, route="/api/posts", method="POST")
                  for i in range(5)]
        rule = has_rule(analyze(events), "repeated-unauthorized-mutations")[0]
        self.assertEqual(rule["severity"], "HIGH")


class OutputContractTests(unittest.TestCase):
    def test_finding_contract_keys(self):
        finding = build_finding(
            "rule-1", "Title", "HIGH",
            [ev(0, request_id="req-a"), ev(1000, request_id="req-b")],
            "global", "details",
        )
        self.assertEqual(
            set(finding.keys()),
            {"ruleId", "title", "severity", "endpoint", "method", "detail",
             "windowStartMs", "bucketKey", "count", "requestIds"},
        )

    def test_burst_windows_do_not_duplicate(self):
        events = [ev(i * 10_000, status=401) for i in range(15)]
        findings = analyze(events)
        self.assertLessEqual(len(has_rule(findings, "repeated-401")), 1)


if __name__ == "__main__":
    unittest.main(verbosity=2)