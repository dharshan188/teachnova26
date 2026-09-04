import 'server-only'

import PDFDocument from 'pdfkit'
import type {
  AgentRunDTO,
  IncidentDetailDTO,
  LogEventDTO,
  Overview,
} from './observability'

// ---------------------------------------------------------------------------
// Phase 8 — incident PDF report generation.
//
// Maintainable approach: `pdfkit` renders directly to a buffer; no HTML or
// headless browser involved. The report only ever receives already-serialized
// DTOs (never raw DB rows, never user input), so it can neither leak
// credentials/session data nor be used to smuggle secrets into the document.
// The AI pipeline section reflects REAL Groq-backed agent runs; failed runs
// are surfaced as "AI ANALYSIS UNAVAILABLE" instead of simulating output.
// ---------------------------------------------------------------------------

const ACCENT = '#ea580c'
const INK = '#17171b'
const MUTED = '#78787a'
const LINE = '#d6d6db'
const DANGER = '#dc2626'
const SUCCESS = '#16a34a'
const WARNING = '#d97706'

export interface ReportInput {
  detail: IncidentDetailDTO
  overview: Overview
  generatedAt: string
  alerts: TelegramAlertInfo[]
}

export interface TelegramAlertInfo {
  id: string
  type: string
  severity: string | null
  deliveryStatus: string
  telegramMessageId: string | null
  error: string | null
  createdAt: string
}

function levelColor(level: string): string {
  const map: Record<string, string> = {
    INFO: '#3b82f6',
    WARN: WARNING,
    ERROR: DANGER,
    SECURITY: DANGER,
  }
  return map[level] ?? MUTED
}

function severityColor(severity: string): string {
  const map: Record<string, string> = {
    LOW: SUCCESS,
    MEDIUM: WARNING,
    HIGH: DANGER,
    CRITICAL: DANGER,
  }
  return map[severity] ?? MUTED
}

export function generateIncidentReport({
  detail,
  overview,
  generatedAt,
  alerts,
}: ReportInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 48,
      bufferPages: true,
      info: {
        Title: `BuildHub Incident Report ${detail.ref}`,
        Author: 'BuildHub Observability',
        Subject: `${detail.title}`,
        Creator: 'BuildHub Phase 8 — Security Command Center',
      },
    })

    const chunks: Buffer[] = []
    doc.on('data', (c: Buffer) => chunks.push(c))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    // Helper: metadata row
    const metaRow = (label: string, value: string) => {
      doc.font('Helvetica-Bold').fontSize(8).fillColor(MUTED).text(label.toUpperCase(), 48, doc.y, {
        continued: true,
        width: 96,
        lineBreak: false,
      })
      doc.font('Helvetica').fontSize(9).fillColor(INK).text(value)
    }

    // Helper: numbered section heading
    const section = (number: string, title: string) => {
      doc.moveDown(1.1)
      doc.font('Helvetica-Bold').fontSize(12).fillColor(ACCENT)
      doc.text(`${number}. ${title}`)
      doc.moveDown(0.35)
      doc.moveTo(48, doc.y).lineTo(547, doc.y).strokeColor(LINE).lineWidth(0.7).stroke()
      doc.moveDown(0.6)
    }

    // ------------------------- Header -------------------------
    doc.rect(48, 48, 499, 4).fill(ACCENT)
    doc.moveDown(1.6)
    doc.font('Helvetica-Bold').fontSize(20).fillColor(INK).text('BUILDHUB INCIDENT REPORT')
    doc.moveDown(0.2)
    doc.font('Helvetica').fontSize(9).fillColor(MUTED)
    doc.text(`Generated ${generatedAt} · BuildHub Observability · Phase 7`)
    doc.moveDown(0.9)

    // ------------------------- Metadata -------------------------
    metaRow('Incident ID', detail.ref)
    metaRow('Date', detail.createdAt)
    metaRow('Severity', detail.severity)
    metaRow('Risk Score', `${detail.riskScore} / 100`)
    metaRow('Cyber Safety Score', `${overview.cyberSafetyScore} / 100`)
    metaRow('Status', detail.status)
    metaRow('Endpoint', `${detail.method} ${detail.endpoint}`)
    if (detail.requestId) metaRow('Request ID', detail.requestId)
    if (detail.errorCode) metaRow('Error code', detail.errorCode)
    doc.moveDown(0.6)
    doc
      .rect(48, doc.y, 499, 0.7)
      .fillColor(LINE)
      .fill()
    doc.moveDown(0.8)

    // ------------------------- 1. Executive Summary -------------------------
    section('1', 'Executive Summary')
    doc.font('Helvetica').fontSize(10).fillColor(INK)
    doc.text(
      detail.summary && detail.summary.length > 0
        ? detail.summary
        : detail.description,
    )

    // ------------------------- 2. What Happened -------------------------
    section('2', 'What Happened')
    doc.text(detail.description)

    // ------------------------- 3. Affected Components -------------------------
    section('3', 'Affected Components')
    const services = Array.from(
      new Set(detail.logs.map((l: LogEventDTO) => l.service).filter(Boolean)),
    )
    if (services.length > 0) {
      services.forEach((s) => doc.font('Helvetica').fontSize(10).text(`• ${s}`))
    } else {
      doc.text('• API (endpoint under observation)')
    }
    doc.text('• Monitoring (incident captured in observability store)')

    // ------------------------- 4. Timeline -------------------------
    section('4', 'Timeline  (observed facts)')
    if (detail.timeline.length === 0) {
      doc.font('Helvetica').fontSize(10).fillColor(MUTED).text('No timeline recorded.')
    } else {
      detail.timeline.forEach((event) => {
        const x = 48
        doc.circle(x + 2.5, doc.y + 3.5, 2.5).fillColor(ACCENT).fill()
        doc.font('Helvetica').fontSize(9).fillColor(MUTED).text(
          event.at.slice(0, 16).replace('T', ' '),
          x + 14,
          doc.y,
          { width: 120, lineBreak: false },
        )
        doc.font('Helvetica').fontSize(9.5).fillColor(INK).text(
          event.label,
          x + 140,
          doc.y,
          { width: 359 },
        )
        doc.moveDown(0.35)
      })
    }

    // ------------------------- 5. Relevant Logs -------------------------
    section('5', 'Relevant Logs  (top entries)')
    if (detail.logs.length === 0) {
      doc.font('Helvetica').fontSize(10).fillColor(MUTED).text('No associated log events.')
    } else {
      const rows = detail.logs.slice(0, 12)
      rows.forEach((log) => {
        const level = log.level ?? 'INFO'
        const color = levelColor(level)
        doc.circle(48 + 2.5, doc.y + 3, 2.5).fillColor(color).fill()
        doc.font('Helvetica-Bold').fontSize(8).fillColor(color).text(
          level.padEnd(7),
          48 + 14,
          doc.y,
          { width: 58, lineBreak: false },
        )
        doc.font('Helvetica').fontSize(8).fillColor(MUTED).text(
          `${log.service ?? '-'}`,
          48 + 78,
          doc.y,
          { width: 70, lineBreak: false },
        )
        doc.font('Helvetica').fontSize(8).fillColor(INK).text(
          (log.method ? `${log.method} ` : '') +
            (log.route ?? '-') +
            (log.status ? ` · ${log.status}` : ''),
          48 + 154,
          doc.y,
          { width: 345 },
        )
        doc.moveDown(0.02)
        doc.font('Helvetica').fontSize(8.5).fillColor(INK).text(
          log.message.length > 110 ? `${log.message.slice(0, 110)}…` : log.message,
          48 + 14,
          doc.y,
          { indent: 14, width: 485 },
        )
        doc.moveDown(0.45)
      })
    }

    // ------------------------- 6. AI Pipeline Status -------------------------
    const failedRuns = detail.agentRuns.filter((run) => run.status === 'FAILED')
    const completedRuns = detail.agentRuns.filter((run) => run.status === 'COMPLETE')
    section('6', 'AI Pipeline Status  (REAL — Groq-backed)')
    if (failedRuns.length > 0) {
      doc
        .fillColor(WARNING)
        .rect(48, doc.y, 499, 26)
        .fill()
      doc.fillColor([23, 23, 27]).font('Helvetica-Bold').fontSize(8.5).text(
        'AI ANALYSIS UNAVAILABLE  ·  some agent runs failed against Groq.',
        58,
        doc.y + 8,
        { width: 479 },
      )
      doc.font('Helvetica').fontSize(8.5).text(
        `Completed ${completedRuns.length}, failed ${failedRuns.length}. Recommendations below reflect only the runs that succeeded.`,
        58,
        doc.y,
        { width: 479 },
      )
    } else if (detail.agentRuns.length > 0) {
      doc
        .fillColor(SUCCESS)
        .rect(48, doc.y, 499, 26)
        .fill()
      doc.fillColor([23, 23, 27]).font('Helvetica-Bold').fontSize(8.5).text(
        'REAL ANALYSIS  ·  Fixer → Critic → Judge ran against Groq.',
        58,
        doc.y + 8,
        { width: 479 },
      )
      doc.font('Helvetica').fontSize(8.5).text(
        'Candidate fixes are advisory text rendered from real model output; nothing was applied automatically.',
        58,
        doc.y,
        { width: 479 },
      )
    } else {
      doc
        .fillColor(SUCCESS)
        .rect(48, doc.y, 499, 26)
        .fill()
      doc.fillColor([23, 23, 27]).font('Helvetica-Bold').fontSize(8.5).text(
        'NO PIPELINE RUNS RECORDED  ·  the real pipeline has not been triggered for this incident.',
        58,
        doc.y + 8,
        { width: 479 },
      )
      doc.font('Helvetica').fontSize(8.5).text(
        'Once a security operator runs the pipeline, this section reflects actual Groq output.',
        58,
        doc.y,
        { width: 479 },
      )
    }
    doc.moveDown(0.9)

    if (detail.agentRuns.length === 0) {
      doc.font('Helvetica').fontSize(10).fillColor(MUTED).text('No pipeline runs recorded.')
    } else {
      detail.agentRuns.forEach((run: AgentRunDTO) => {
        doc.font('Helvetica-Bold').fontSize(9.5).fillColor(INK).text(
          run.agent.padEnd(8) +
            `/  ${run.status}` +
            (run.progress !== null && run.progress !== undefined
              ? `  ·  ${run.progress}%`
              : '') +
            (run.confidence !== null && run.confidence !== undefined
              ? `  ·  confidence ${run.confidence}%`
              : '') +
            `  ·  ${run.mode}`,
        )
        if (run.outputSummary) {
          doc.font('Helvetica').fontSize(9).fillColor(MUTED).text(run.outputSummary, { indent: 10 })
        }
        doc.moveDown(0.35)
      })
    }

    // ------------------------- 6.5 Alert Delivery (Telegram) -------------------------
    section('6.5', 'Alert Delivery  (Telegram — append-only delivery log)')
    if (alerts.length === 0) {
      doc.font('Helvetica').fontSize(10).fillColor(MUTED).text('No Telegram alerts recorded for this incident.')
    } else {
      alerts.forEach((alert) => {
        const ok = alert.deliveryStatus === 'SENT'
        const duplicate = alert.deliveryStatus === 'SKIPPED_DUPLICATE'
        doc.font('Helvetica-Bold').fontSize(9).fillColor(ok ? SUCCESS : duplicate ? WARNING : DANGER).text(
          alert.deliveryStatus.replace(/_/g, ' ').padEnd(18) +
            `  ·  ${alert.type}` +
            (alert.severity ? `  ·  ${alert.severity}` : '') +
            (alert.telegramMessageId ? `  ·  message ${alert.telegramMessageId}` : ''),
        )
        if (alert.error) {
          doc.font('Helvetica').fontSize(8.5).fillColor(DANGER).text(`Delivery error: ${alert.error}`, { indent: 10 })
        }
        doc.font('Helvetica').fontSize(8.5).fillColor(MUTED).text(
          alert.createdAt.slice(0, 16).replace('T', ' '),
          { indent: 10 },
        )
        doc.moveDown(0.3)
      })
    }

    // ------------------------- 6.6 Terminal Summary (Final Status) -------------------------
    section('6.6', 'Terminal Summary  (final status — same content as the Telegram FINAL_SUMMARY)')
    if (!detail.terminalSummary) {
      doc.font('Helvetica').fontSize(10).fillColor(MUTED).text('No terminal state reached yet (incident still open).')
    } else {
      const summary = detail.terminalSummary
      const summaryColor =
        summary.validation.result === 'pass' ? SUCCESS : summary.validation.result === 'fail' ? DANGER : WARNING
      doc.font('Helvetica-Bold').fontSize(9).fillColor(summaryColor).text(
        `${summary.finalState}  ·  validation ${summary.validation.result}`
        + (summary.validation.probes.length > 0
          ? `  ·  ${summary.validation.probes.filter((p) => p.ok).length}/${summary.validation.probes.length} probes OK`
          : ''),
      )
      if (summary.validation.detail) {
        doc.font('Helvetica').fontSize(8.5).fillColor(MUTED).text(`Validation detail: ${summary.validation.detail}`, { indent: 10 })
      }
      const hasFinalDelivery = alerts.some(
        (alert) => alert.type === 'FINAL_SUMMARY' && alert.deliveryStatus === 'SENT',
      )
      doc.font('Helvetica').fontSize(8.5).fillColor(hasFinalDelivery ? SUCCESS : WARNING).text(
        hasFinalDelivery ? 'FINAL_SUMMARY delivered to Telegram (SENT).' : 'FINAL_SUMMARY not confirmed as SENT.',
        { indent: 10 },
      )
      doc.moveDown(0.3)
      doc.font('Helvetica').fontSize(8.5).fillColor(MUTED).text(
        summary.text.replace(/<[^>]+>/g, ''),
        { indent: 10 },
      )
    }

    // ------------------------- 7. Previous Similar Incidents -------------------------
    section('7', 'Previous Similar Incidents')
    if (detail.previous.length === 0) {
      doc.font('Helvetica').fontSize(10).fillColor(MUTED).text('No similar incidents found.')
    } else {
      detail.previous.forEach((prev) => {
        doc.font('Helvetica').fontSize(9).fillColor(INK).text(
          `${prev.ref}  ·  ${prev.severity}  ·  ${prev.status}  ·  ${prev.title}  ·  ${prev.createdAt.slice(0, 10)}`,
        )
      })
    }

    // ------------------------- 8. Human Approval History -------------------------
    section('8', 'Human Approval History  (workflow history only)')
    if (detail.approvals.length === 0) {
      doc.font('Helvetica').fontSize(10).fillColor(MUTED).text('No approval decisions recorded.')
    } else {
      detail.approvals.forEach((approval) => {
        const color = approval.status === 'APPROVED' ? SUCCESS : DANGER
        doc.font('Helvetica-Bold').fontSize(9).fillColor(color).text(approval.status)
        doc.font('Helvetica').fontSize(9).fillColor(INK).text(
          `Operator ${approval.operator} · ${approval.createdAt.slice(0, 16).replace('T', ' ')}`,
        )
        doc.moveDown(0.35)
      })
    }

    // ------------------------- 9. Current Status -------------------------
    section('9', 'Current Status')
    const statusColor =
      detail.status === 'RESOLVED' || detail.status === 'ROLLED_BACK' ? SUCCESS : severityColor(detail.severity)
    doc.font('Helvetica').fontSize(10).fillColor(INK)
    doc.text(`Incident status: `, { continued: true })
    doc.font('Helvetica-Bold').fillColor(statusColor).text(detail.status)
    doc.fillColor(INK).font('Helvetica').fontSize(10)
    doc.text(`System risk score: ${overview.riskScore} / 100`)
    doc.text(`Cyber safety score: ${overview.cyberSafetyScore} / 100`)
    doc.text(`System health: ${overview.systemHealth}% · Active incidents: ${overview.activeIncidents}`)

    // ------------------------- 10. Recommended Next Step -------------------------
    section('10', 'Recommended Next Step  (advisory)')
    const recommendation = advisoryForStatus(detail)
    doc.font('Helvetica').fontSize(10).fillColor(INK).text(recommendation)

    // ------------------------- Footer -------------------------
    doc.moveDown(1.4)
    doc.moveTo(48, doc.y).lineTo(547, doc.y).strokeColor(LINE).lineWidth(0.7).stroke()
    doc.moveDown(0.5)
    doc.font('Helvetica').fontSize(7.5).fillColor(MUTED)
    doc.text(
      'OBSERVED FACTS: incident metadata, timeline, logs and approvals recorded by BuildHub observability. ' +
      'REAL AI ANALYSIS: pipeline status and recommendations reflect actual Groq calls; if an agent run failed it is reported as AI ANALYSIS UNAVAILABLE.',
      { width: 499, align: 'left' },
    )
    doc.moveDown(0.3)
    doc.text('BUILDHUB SECURITY COMMAND CENTER · PHASE 8', { align: 'center' })

    doc.end()
  })
}

function advisoryForStatus(detail: IncidentDetailDTO): string {
  if (detail.status === 'RESOLVED') {
    return 'Incident is resolved. Continue monitoring for recurrence; close the incident after the observation window is clean. OBSERVED — no action required.'
  }
  if (detail.status === 'ROLLED_BACK') {
    return 'A change was rolled back. Keep the incident open until the follow-up verification window confirms stable behavior, then resolve. OBSERVED — no action required.'
  }
  if (detail.status === 'AWAITING_REVIEW') {
    return 'Awaiting human review. The Fixer candidate was advisory text only and has not been applied; a reviewer should assess the context and decide next steps.'
  }
  return 'Investigation ongoing. Collect further context, correlate with related log events, and prepare a review package. No automated mitigation has been applied.'
}