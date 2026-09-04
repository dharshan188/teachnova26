import { NextResponse } from 'next/server'

// Server-side bridge: lets the WITHOUT-AI frontend (port 3001) read the live
// WITH-AI telemetry (port 3000) without exposing CORS. The AI build URL is
// configurable and defaults to the local loopback companion server.
//
// Public, read-only, no-store. Only real values from /api/demo/attack are
// forwarded. When the AI build is unreachable the bridge answers 502 with an
// honest "down" payload so the demo page can render the AI side as DOWN.

function aiBaseUrl(): string {
  const configured = process.env.AI_DEMO_BASE_URL?.trim()
  return configured || 'http://127.0.0.1:3000'
}

export async function GET() {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 4000)
    try {
      const response = await fetch(`${aiBaseUrl()}/api/demo/attack`, {
        signal: controller.signal,
        headers: { 'Cache-Control': 'no-store' },
        cache: 'no-store',
      })
      const payload = (await response.json()) as Record<string, unknown>
      return NextResponse.json(payload, {
        status: response.ok ? 200 : response.status,
        headers: { 'Cache-Control': 'no-store' },
      })
    } finally {
      clearTimeout(timer)
    }
  } catch {
    return NextResponse.json(
      {
        build: 'ai',
        port: 3000,
        source: '127.0.0.1',
        phase: 'down',
        health: {
          status: 'unavailable',
          availability: 'unavailable',
          checkedAt: new Date().toISOString(),
          detail: 'AI build unreachable from bridge',
        },
        error: 'AI build unreachable',
      },
      { status: 502, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}