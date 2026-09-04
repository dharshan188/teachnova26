import 'server-only'

// Phase 9 — Controlled Fault Injection Layer
//
// This module provides a localhost-only, controlled fault injection system
// for testing the self-healing pipeline. Faults are only active when
// FAULT_INJECTION_ENABLED=true environment variable is set.

import { NextResponse } from 'next/server'
import { z } from 'zod'

export interface FaultConfig {
  id: string
  name: string
  difficulty: 'EASY' | 'MEDIUM' | 'DIFFICULT'
  target: {
    file: string
    line: number
    function: string
  }
  originalCode: string
  faultCode: string
  trigger: {
    method: string
    endpoint: string
  }
  expectedError: string
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH'
  riskReason: string
  aiExpectedFix: string
  validation: string
  rollback: string
  active: boolean
}

// Fault registry — all 9 defined faults
export const FAULT_REGISTRY: Record<string, FaultConfig> = {
  'LOW-01': {
    id: 'LOW-01',
    name: 'Undefined Variable in Post Creation',
    difficulty: 'EASY',
    target: {
      file: 'frontend/app/api/posts/route.ts',
      line: 45,
      function: 'POST handler'
    },
    originalCode: 'const authorId = session.user.id;',
    faultCode: 'const authorId = session.user.undefinedProperty;',
    trigger: { method: 'POST', endpoint: '/api/posts' },
    expectedError: 'TypeError: Cannot read property',
    riskLevel: 'LOW',
    riskReason: 'Single file, single function, 1 line, no security impact, high test coverage',
    aiExpectedFix: 'Restore session.user.id',
    validation: 'POST /api/posts → 201, post appears in feed',
    rollback: 'Restore original line',
    active: false
  },
  'LOW-02': {
    id: 'LOW-02',
    name: 'Field Typo in Post Response',
    difficulty: 'EASY',
    target: {
      file: 'frontend/app/api/posts/[id]/route.ts',
      line: 62,
      function: 'GET handler'
    },
    originalCode: 'return NextResponse.json({ post: serialized });',
    faultCode: 'return NextResponse.json({ poost: serialized });',
    trigger: { method: 'GET', endpoint: '/api/posts/[id]' },
    expectedError: 'Frontend: post is undefined',
    riskLevel: 'LOW',
    riskReason: 'Single file, single function, 1 line, no security impact, UI-only',
    aiExpectedFix: 'Fix property name to post',
    validation: 'GET /api/posts/[id] → 200, { post: {...} }, UI renders',
    rollback: 'Restore original property name',
    active: false
  },
  'LOW-03': {
    id: 'LOW-03',
    name: 'Incorrect Validation Condition',
    difficulty: 'EASY',
    target: {
      file: 'frontend/lib/server/validation.ts',
      line: 28,
      function: 'postContentSchema'
    },
    originalCode: ".min(1, 'Content is required').max(1000)",
    faultCode: ".min(1001, 'Content is required').max(1000)",
    trigger: { method: 'POST', endpoint: '/api/posts' },
    expectedError: '400: Content must be at least 1001 characters',
    riskLevel: 'LOW',
    riskReason: 'Single file, single function, 1 line, validation logic only, high test coverage',
    aiExpectedFix: 'Restore .min(1, ...)',
    validation: 'POST /api/posts with 50-char content → 201',
    rollback: 'Restore original min value',
    active: false
  },
  'MEDIUM-01': {
    id: 'MEDIUM-01',
    name: 'Broken Post API (Server Error)',
    difficulty: 'MEDIUM',
    target: {
      file: 'frontend/app/api/posts/route.ts',
      line: 38,
      function: 'POST handler'
    },
    originalCode:
      '        const post = await prisma.post.create({\n          data: {\n            content,\n            authorId: user.id,\n            projectId: projectId ?? null,\n            tags: tags ?? [],\n          },\n          include: postInclude(user.id),\n        })',
    faultCode: "throw new Error('Injected DB failure')",
    trigger: { method: 'POST', endpoint: '/api/posts' },
    expectedError: '500: Internal Server Error',
    riskLevel: 'MEDIUM',
    riskReason: 'Single file, API endpoint, server error, affects all post creation, reversible',
    aiExpectedFix: 'Remove thrown error, restore prisma.create',
    validation: 'POST /api/posts → 201, post created, appears in feed',
    rollback: 'Restore original code',
    active: false
  },
  'MEDIUM-02': {
    id: 'MEDIUM-02',
    name: 'Database Query Failure in Feed',
    difficulty: 'MEDIUM',
    target: {
      file: 'frontend/app/api/posts/route.ts',
      line: 85,
      function: 'GET handler'
    },
    originalCode:
      '          prisma.post.findMany({\n            where,\n            include: postInclude(currentUser?.id),\n            orderBy: { createdAt: \'desc\' },\n            skip: (page - 1) * pageSize,\n            take: pageSize,\n          }),',
    faultCode: "throw new Error('Injected DB query failure')",
    trigger: { method: 'GET', endpoint: '/api/posts' },
    expectedError: '500: Internal Server Error',
    riskLevel: 'MEDIUM',
    riskReason: 'Single file, read endpoint, affects feed for all users, reversible',
    aiExpectedFix: 'Remove thrown error, restore prisma.findMany',
    validation: 'GET /api/posts → 200, posts array returned',
    rollback: 'Restore original code',
    active: false
  },
  'MEDIUM-03': {
    id: 'MEDIUM-03',
    name: 'Business Logic Error in Project Update',
    difficulty: 'MEDIUM',
    target: {
      file: 'frontend/app/api/projects/[id]/route.ts',
      line: 72,
      function: 'PATCH handler'
    },
    originalCode: 'if (project.ownerId !== user.id) return 403',
    faultCode: 'if (project.ownerId === user.id) return 403',
    trigger: { method: 'PATCH', endpoint: '/api/projects/[id]' },
    expectedError: '403: Forbidden (owner incorrectly denied)',
    riskLevel: 'MEDIUM',
    riskReason: 'Authz logic, single file, business logic bug (not exception), reversible',
    aiExpectedFix: 'Restore !== comparison',
    validation: 'Owner PATCH own project → 200, non-owner → 403',
    rollback: 'Restore original condition',
    active: false
  },
  'HIGH-01': {
    id: 'HIGH-01',
    name: 'Authentication Bypass',
    difficulty: 'DIFFICULT',
    target: {
      file: 'frontend/app/api/auth/login/route.ts',
      line: 55,
      function: 'POST handler'
    },
    originalCode: 'if (!user || !verifyPassword) return 401',
    faultCode: 'if (!user) return 401',
    trigger: { method: 'POST', endpoint: '/api/auth/login' },
    expectedError: '200: Login successful (with wrong password)',
    riskLevel: 'HIGH',
    riskReason: 'Authentication bypass, security-critical, affects all users, low reversibility',
    aiExpectedFix: 'Restore password verification check',
    validation: 'Wrong password → 401, correct password → 200',
    rollback: 'Automatic on validation failure',
    active: false
  },
  'HIGH-02': {
    id: 'HIGH-02',
    name: 'Authorization Bypass in Project Deletion',
    difficulty: 'DIFFICULT',
    target: {
      file: 'frontend/app/api/projects/[id]/route.ts',
      line: 45,
      function: 'DELETE handler'
    },
    originalCode: 'if (project.ownerId !== user.id) return 403',
    faultCode: '// if (project.ownerId !== user.id) return 403',
    trigger: { method: 'DELETE', endpoint: '/api/projects/[id]' },
    expectedError: '200: Deleted (non-owner incorrectly allowed)',
    riskLevel: 'HIGH',
    riskReason: 'Authorization bypass, data destruction, security-critical, affects project ownership',
    aiExpectedFix: 'Restore ownership check',
    validation: 'Non-owner DELETE → 403, owner DELETE → 200',
    rollback: 'Automatic on validation failure',
    active: false
  },
  'HIGH-03': {
    id: 'HIGH-03',
    name: 'Database Connectivity Failure',
    difficulty: 'DIFFICULT',
    target: {
      file: 'frontend/lib/server/db.ts',
      line: 11,
      function: 'createPrismaClient()'
    },
    originalCode: 'const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })',
    faultCode: "const adapter = new PrismaPg({ connectionString: 'postgresql://invalid:invalid@localhost:5432/invalid' })",
    trigger: { method: 'ANY', endpoint: '/*' },
    expectedError: '500: Database connection failed',
    riskLevel: 'HIGH',
    riskReason: 'Infrastructure failure, cascading, affects entire application, low reversibility',
    aiExpectedFix: 'Restore correct DATABASE_URL',
    validation: 'GET /api/health → database: healthy, GET /api/posts → 200',
    rollback: 'Automatic on validation failure',
    active: false
  }
}

const activeFaults: Set<string> = new Set()

// A fault that was repaired but whose fix has not been verified/disarmed yet is
// "disarmed": the runtime guard is bypassed so the real validation probe can
// observe whether the underlying behavior was restored. Disarm is only applied
// after the deterministic patch engine confirms the candidate matches the
// documented healthy baseline, and it is always reversible.
const disarmedFaults: Set<string> = new Set()

export function isFaultInjectionEnabled(): boolean {
  return process.env.FAULT_INJECTION_ENABLED === 'true'
}

/** True only while the guard is actively firing (fault active AND not disarmed). */
export function isFaultGaurded(faultId: string): boolean {
  return isFaultInjectionEnabled() && activeFaults.has(faultId) && !disarmedFaults.has(faultId)
}

export function disarmFault(faultId: string): void {
  disarmedFaults.add(faultId)
}

export function rearmFault(faultId: string): void {
  disarmedFaults.delete(faultId)
}

export function isFaultDisarmed(faultId: string): boolean {
  return disarmedFaults.has(faultId)
}

export function resetFaultDisarms(): void {
  disarmedFaults.clear()
}

export function getFaultRegistry(): FaultConfig[] {
  return Object.values(FAULT_REGISTRY)
}

export function getFault(faultId: string): FaultConfig | null {
  return FAULT_REGISTRY[faultId] ?? null
}

export function isFaultActive(faultId: string): boolean {
  return activeFaults.has(faultId)
}

export function activateFault(faultId: string): { ok: boolean; error?: string } {
  if (!isFaultInjectionEnabled()) {
    return { ok: false, error: 'Fault injection not enabled (FAULT_INJECTION_ENABLED=true required)' }
  }
  const fault = FAULT_REGISTRY[faultId]
  if (!fault) {
    return { ok: false, error: `Fault ${faultId} not found` }
  }
  if (fault.active) {
    return { ok: false, error: `Fault ${faultId} already active` }
  }
  fault.active = true
  activeFaults.add(faultId)
  return { ok: true }
}

export function deactivateFault(faultId: string): { ok: boolean; error?: string } {
  const fault = FAULT_REGISTRY[faultId]
  if (!fault) {
    return { ok: false, error: `Fault ${faultId} not found` }
  }
  if (!fault.active) {
    return { ok: false, error: `Fault ${faultId} not active` }
  }
  fault.active = false
  activeFaults.delete(faultId)
  disarmedFaults.delete(faultId)
  return { ok: true }
}

export function deactivateAllFaults(): void {
  for (const fault of Object.values(FAULT_REGISTRY)) {
    fault.active = false
  }
  activeFaults.clear()
  disarmedFaults.clear()
}

export function getActiveFaults(): FaultConfig[] {
  return Array.from(activeFaults).map(id => FAULT_REGISTRY[id]).filter(Boolean)
}

// Runtime fault application — called by target code to check if fault should apply
export function shouldApplyFault(faultId: string): boolean {
  return isFaultGaurded(faultId)
}

// For file-based injection (using dynamic import / require cache manipulation)
const faultPatches = new Map<string, { original: string; fault: string }>()

export function applyFaultPatch(faultId: string): boolean {
  const fault = FAULT_REGISTRY[faultId]
  if (!fault || !fault.active) return false
  
  // Store the patch for reference
  faultPatches.set(faultId, {
    original: fault.originalCode,
    fault: fault.faultCode
  })
  return true
}

export function getFaultPatch(faultId: string): { original: string; fault: string } | null {
  return faultPatches.get(faultId) ?? null
}

export function clearFaultPatches(): void {
  faultPatches.clear()
}