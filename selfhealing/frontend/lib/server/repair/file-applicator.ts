import 'server-only'

// Phase 9 — file-edit safety gate. The patch engine may ONLY write inside the
// frontend tree (the Next.js process cwd) and only under whitelisted
// directories. Any attempt to write elsewhere is refused.

export function canApplyToRealFile(relativePath: string): boolean {
  const normalized = relativePath.replace(/\\/g, '/').replace(/^\.?\//, '')
  if (normalized.includes('..') || normalized.startsWith('/')) return false
  return /^(app|lib|prisma|components)\//.test(normalized)
}