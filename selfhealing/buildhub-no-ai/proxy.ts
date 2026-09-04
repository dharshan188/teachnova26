import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Phase 7 — request correlation.
//
// Provides a request/correlation ID for every API and command-center request:
//   - reuses a safe incoming X-Request-ID if present,
//   - otherwise generates one (Web Crypto `randomUUID` works on every runtime),
//   - propagates it to the route handler via the request headers and echoes it
//     back on the response so clients can correlate failures.
//
// Safe incoming IDs are limited to opaque [A-Za-z0-9._-] characters so a value
// from a client can never smuggle characters into logs. The ID is attached to
// structured log events and incidents by lib/server/logger.ts.
const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{1,128}$/

export function proxy(request: NextRequest) {
  const incoming = request.headers.get('x-request-id')
  const requestId =
    incoming && SAFE_REQUEST_ID.test(incoming) ? incoming : crypto.randomUUID()

  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-request-id', requestId)

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  })
  response.headers.set('x-request-id', requestId)
  return response
}

export const config = {
  matcher: ['/api/:path*'],
}