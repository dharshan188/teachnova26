// Demo seed data for BuildHub.
//
// Run with:  npx prisma db seed
//
// Content is loaded from a real Postgres database into the API and then the UI
// — nothing here is hardcoded in components. The seed is idempotent: it only
// creates the demo users once (keyed by the primary user `arjun`); re-running
// it is a safe no-op.
//
// Demo accounts all share the same password (documented in the demo flow):
//   buildhub-demo1
//
// Note: this file is intentionally plain ESM (not TypeScript) so it can be
// executed directly by Node via the `prisma` seed configuration.

import 'dotenv/config'

import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import argon2 from 'argon2'

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  throw new Error('DATABASE_URL is required to seed.')
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
})

const DEMO_PASSWORD = 'buildhub-demo1'

// Deterministic PRNG so seeded likes are stable across runs.
function mulberry32(seed) {
  let a = seed >>> 0
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const daysAgo = (days) => new Date(Date.now() - days * 24 * 60 * 60 * 1000)

const users = [
  {
    username: 'arjun',
    name: 'Arjun Mehta',
    bio: 'Roboticist. Building perception and control stacks that run on real hardware, not just slides.',
    avatar: null,
    createdAt: daysAgo(210),
  },
  {
    username: 'meera',
    name: 'Meera Krishnan',
    bio: 'Computer vision & edge ML. Currently obsessed with making models fast enough to be useful.',
    avatar: null,
    createdAt: daysAgo(198),
  },
  {
    username: 'karthik',
    name: 'Karthik Iyer',
    bio: 'Full-stack engineer. I like typed configs, boring infrastructure, and CI that fails fast.',
    avatar: null,
    createdAt: daysAgo(176),
  },
  {
    username: 'ananya',
    name: 'Ananya Rao',
    bio: 'Data scientist working on energy forecasting. Mostly time series, a bit of weird data.',
    avatar: null,
    createdAt: daysAgo(150),
  },
  {
    username: 'rahul',
    name: 'Rahul Verma',
    bio: 'Distributed systems & security. Gossip > hub-and-spoke, threat models > prayer.',
    avatar: null,
    createdAt: daysAgo(142),
  },
  {
    username: 'priya',
    name: 'Priya Raman',
    bio: 'IoT engineer. Soil sensors, gateways, and the occasional very annoyed farmer.',
    avatar: null,
    createdAt: daysAgo(120),
  },
]

const projects = [
  {
    owner: 'arjun',
    name: 'RoboNav',
    description:
      'Autonomous indoor navigation stack for differential-drive robots: SLAM, global path planning and local obstacle avoidance, tested for weeks of continuous running.',
    tags: ['ros2', 'opencv', 'cpp', 'navigation', 'slam'],
    status: 'ACTIVE',
    createdAt: daysAgo(120),
  },
  {
    owner: 'meera',
    name: 'EdgeVision',
    description:
      'On-device object detection pipeline for the Raspberry Pi-based edge rig, quantised down to a 9ms per-frame inference budget.',
    tags: ['python', 'edge-ai', 'opencv', 'tensorrt'],
    status: 'ACTIVE',
    createdAt: daysAgo(98),
  },
  {
    owner: 'karthik',
    name: 'BuildFlow',
    description:
      'Typed, validated CI/CD workflows on GitHub Actions. Configuration mistakes surface in the pull request, never in production.',
    tags: ['nextjs', 'typescript', 'github-actions', 'automation'],
    status: 'COMPLETED',
    createdAt: daysAgo(160),
  },
  {
    owner: 'ananya',
    name: 'GreenGrid',
    description:
      'Campus microgrid load forecasting. Blends gradient boosting on lag features with weather data: a pragmatic 48-hour forecast within 4% of actual demand.',
    tags: ['python', 'postgresql', 'forecasting', 'energy'],
    status: 'ACTIVE',
    createdAt: daysAgo(110),
  },
  {
    owner: 'meera',
    name: 'MedAssist',
    description:
      'Clinician-validated prototype for structured radiology reading workflow. Purposefully boring UI — it survived review because it matches how radiologists actually work.',
    tags: ['healthcare', 'prototype', 'ux', 'python'],
    status: 'COMPLETED',
    createdAt: daysAgo(190),
  },
  {
    owner: 'rahul',
    name: 'SecureMesh',
    description:
      'Resilient mesh networking with gossip-based convergence: nodes rebuild a healthy topology in ~3 seconds after a partition, with per-node threat models documented.',
    tags: ['rust', 'distributed-systems', 'networking', 'resilience'],
    status: 'ACTIVE',
    createdAt: daysAgo(85),
  },
  {
    owner: 'priya',
    name: 'AgriSense',
    description:
      'IoT soil-moisture monitoring across a full growing season. Zone-based sampling after the data showed variance is spatial more than temporal.',
    tags: ['iot', 'python', 'postgresql', 'data-analysis'],
    status: 'ACTIVE',
    createdAt: daysAgo(140),
  },
  {
    owner: 'karthik',
    name: 'VisionForge',
    description:
      'Dataset management for computer vision teams: versioned annotations with one-click export to COCO and YOLO formats.',
    tags: ['datasets', 'mlops', 'typescript', 'launch'],
    status: 'ACTIVE',
    createdAt: daysAgo(45),
  },
]

const posts = [
  {
    key: 'nav-stable',
    author: 'arjun',
    project: 'RoboNav',
    content:
      'Navigation stack finally stable for long indoor runs\n\nThe biggest win came from separating local obstacle avoidance from global path planning. The planner now replans around a whole corridor instead of dodging every pole individually — and the robot stops oscillating in doorways.',
    tags: ['navigation', 'mapping', 'field-testing'],
    createdAt: daysAgo(12),
  },
  {
    key: 'tf-config',
    author: 'arjun',
    project: 'RoboNav',
    content:
      'TF config: the boring fix that saved the week\n\nWe were chasing intermittent odometry drift in tight corridors. The root cause was a mixed transform tree — some nodes published in base_link, others in odom. A consistent frame adoption everywhere and the drift vanished.',
    tags: ['slam', 'odometry', 'debugging'],
    createdAt: daysAgo(6),
  },
  {
    key: 'latency',
    author: 'meera',
    project: 'EdgeVision',
    content:
      'Cutting inference latency from 24ms to 9ms per frame\n\nTwo changes: int8 quantisation on the detection head, and a fused resize path so we never drop back to CPU copies. The model barely lost AP and the edge rig now keeps up with the camera feed.',
    tags: ['quantization', 'edge-ai', 'tensorrt'],
    createdAt: daysAgo(9),
  },
  {
    key: 'nms-numpy',
    author: 'meera',
    project: 'EdgeVision',
    content:
      'Deceptively slow: NMS in NumPy\n\nPure-NumPy NMS looked fast in isolation and wrecked the pipeline under load. Switched to a vectorised prefilter plus C++ NMS and freed the CPU for the depth stage. Measure end-to-end, always.',
    tags: ['performance', 'opencv', 'profiling'],
    createdAt: daysAgo(3),
  },
  {
    key: 'buildflow-v1',
    author: 'karthik',
    project: 'BuildFlow',
    content:
      'BuildFlow v1.0 is out\n\nEverything runs on typed, validated configs. A malformed workflow is rejected in the pull request by a schema check before any job starts — mistakes surface before they can ever reach production.',
    tags: ['launch', 'github-actions', 'typescript'],
    createdAt: daysAgo(20),
  },
  {
    key: 'event-driven',
    author: 'karthik',
    project: 'BuildFlow',
    content:
      'Architecture note: from cron sweeper to event-driven queue\n\nState transitions now come from the events themselves, so queued → running → passed is auditable end-to-end. The cron sweeper became a safety net instead of a supervisor.',
    tags: ['architecture', 'queues', 'reliability'],
    createdAt: daysAgo(8),
  },
  {
    key: 'forecast-4pct',
    author: 'ananya',
    project: 'GreenGrid',
    content:
      '48h campus load forecast is within 4%\n\nThe model that wins is embarrassingly simple: gradient boosting on lag features plus weather. Not a giant LSTM. We re-checked the baseline twice because we did not believe the residuals look like noise.',
    tags: ['forecasting', 'gradient-boosting', 'energy'],
    createdAt: daysAgo(11),
  },
  {
    key: 'meter-id',
    author: 'ananya',
    project: 'GreenGrid',
    content:
      'Data quality bug: one meter id, two feeders\n\nNight-time demand looked half of reality because two feeders shared a meter id. After re-keying the time series the model residuals finally look like noise — which is the point of the exercise.',
    tags: ['data-quality', 'debugging', 'timeseries'],
    createdAt: daysAgo(4),
  },
  {
    key: 'medassist-review',
    author: 'meera',
    project: 'MedAssist',
    content:
      'MedAssist cleared the clinician review\n\nThe UI that survived is boring on purpose: a radiology workflow, not a dashboard. Simplicity beats feature count on day one. Next up is per-study batching with hard timeouts so report generation never silently drops work.',
    tags: ['prototype', 'ux', 'healthcare'],
    createdAt: daysAgo(15),
  },
  {
    key: 'medassist-batching',
    author: 'meera',
    project: 'MedAssist',
    content:
      'Per-study batching fixes silent report drops\n\nVariance in batch sizes kept blowing the report generator. Now each study is its own unit with a hard timeout, and overflow backlogs instead of disappearing. Reliability > cleverness.',
    tags: ['reliability', 'batch-jobs', 'architecture'],
    createdAt: daysAgo(2),
  },
  {
    key: 'mesh-converge',
    author: 'rahul',
    project: 'SecureMesh',
    content:
      'Mesh converges in ~3s after a partition\n\nGossip-based periodic state reconciliation beat relying on fanout ACKs on lossy links. Partial partitions now heal on their own; we only have to intervene when a node is fully offline.',
    tags: ['gossip', 'distributed-systems', 'resilience'],
    createdAt: daysAgo(7),
  },
  {
    key: 'threat-model',
    author: 'rahul',
    project: 'SecureMesh',
    content:
      'Publishing the threat model this week\n\nBiggest open question is key rotation at the edge gateways. We are not willing to trade away offline operation for it, so rotation has to work without a reachable KMS.',
    tags: ['security', 'threat-model', 'cryptography'],
    createdAt: daysAgo(1),
  },
  {
    key: 'agriseason',
    author: 'priya',
    project: 'AgriSense',
    content:
      'First full season of AgriSense data is in\n\nSoil-moisture variance turned out to be more spatial than temporal. Our sampling grid was over-fitting single points — we re-mapped to zones and the per-zone averages actually mean something.',
    tags: ['iot', 'data-analysis', 'sensors'],
    createdAt: daysAgo(13),
  },
  {
    key: 'snapshot-endpoint',
    author: 'priya',
    project: 'AgriSense',
    content:
      'Public snapshot endpoint for the demo deployment\n\nA 1Hz aggregate feed per zone, backed by a single Postgres row per minute. Cheap, easy to reason about, and something the demo can show without a dashboard frankenstein.',
    tags: ['fastapi', 'postgresql', 'demos'],
    createdAt: daysAgo(5),
  },
  {
    key: 'coco-yolo',
    author: 'karthik',
    project: 'VisionForge',
    content:
      'VisionForge now exports to COCO and YOLO directly\n\nTeams can skip the dataset-conversion weekend entirely. Versioned annotations in, COCO or YOLO out, all validated against your label schema before export.',
    tags: ['datasets', 'mlops', 'announcement'],
    createdAt: daysAgo(5),
  },
  {
    key: 'versioned-annotations',
    author: 'karthik',
    project: 'VisionForge',
    content:
      'Why versioned annotations matter more than the models\n\nEvery label change is a commit you can diff, review and roll back. Your training-data history ends up as auditable as your code history — and that is what makes a team reproducible.',
    tags: ['datasets', 'workflow', 'training'],
    createdAt: daysAgo(2),
  },
]

const comments = [
  {
    postKey: 'latency',
    author: 'karthik',
    body: 'Have you measured the quantised model on the slower board? Curious what the ceiling is at lower TDP.',
    createdAt: daysAgo(8),
  },
  {
    postKey: 'latency',
    author: 'ananya',
    body: 'Nice win. Did the fused resize path break any custom kernels?',
    createdAt: daysAgo(8),
  },
  {
    postKey: 'buildflow-v1',
    author: 'meera',
    body: 'Congratulations! The typed-config validation in CI is a genuinely good idea.',
    createdAt: daysAgo(19),
  },
  {
    postKey: 'mesh-converge',
    author: 'arjun',
    body: 'Gossip is the right call for lossy links. Do you keep ACK-based delivery for point-to-point links?',
    createdAt: daysAgo(7),
  },
  {
    postKey: 'forecast-4pct',
    author: 'priya',
    body: 'Did you compare a per-feeder model against the single campus-wide one? Curious where the 4% comes from.',
    createdAt: daysAgo(10),
  },
  {
    postKey: 'medassist-review',
    author: 'karthik',
    body: 'Totally agree — boring UI wins clinical pilots. The batching plan sounds right.',
    createdAt: daysAgo(14),
  },
  {
    postKey: 'agriseason',
    author: 'meera',
    body: 'Zonal re-mapping paid off. Are you doing spatial interpolation between sensors yet?',
    createdAt: daysAgo(12),
  },
]

// ---------------------------------------------------------------------------
// Phase 7 — observability demo data.
//
// These rows are what the AI Command Center reads. The counts are deliberate
// and deterministic so the live overview scores land on fixed values:
//
//   WARN events            = 9  → warning pressure     9   (cap 15)
//   ERROR events           = 6  → error pressure      12   (6 × 2, cap 20)
//   security findings      = 3  → security pressure   15   (3 × 5, cap 15)
//   active incident base   = 36 (HIGH 24 + MEDIUM 12)
//
//   Risk score    = 36 + 9 + 12 + 15            = 72
//   Cyber safety  = 100 − (HIGH 4 + MEDIUM 2)   = 94
//   System health = degraded Authentication only → (4×1 + 0.9) / 5 = 98%
//   Active        = INC-00021 (INVESTIGATING) + INC-00022 (DETECTED) = 2
//
// The health/Authentication degraded + "Repeated authentication failures"
// finding both come from exactly the 3 AUTH_FAILED WARN rows below. Do not
// add 400-status logs here (they would create an invalid-request finding and
// shift the risk score) and keep every route below 24 requests/window.
// ---------------------------------------------------------------------------

const minutesAgo = (minutes) => new Date(Date.now() - minutes * 60 * 1000)

const incidentSeeds = [
  {
    ref: 'INC-00021',
    status: 'INVESTIGATING',
    severity: 'HIGH',
    riskScore: 24,
    cyberSafetyImpact: 4,
    title: 'Repeated unauthorized API requests',
    description:
      'Multiple failed sign-in attempts were observed together with unauthorized requests to protected project endpoints during the observation window. Authentication surfaced as degraded; no application fault could be reproduced from the behaviour, pointing to a scripted access attempt rather than a defect.',
    summary:
      'Three failed sign-in attempts correlated with unauthorized /api/projects traffic. Investigation in progress; no application fault reproduced.',
    endpoint: '/api/projects',
    method: 'POST',
    requestId: '7c1c6b45-8fae-4f3e-b23d-1e90a1c0f6ad',
    errorCode: 'AUTH_FAILED',
    expectedRootCause:
      'Suspected automated credential attempt; no application defect reproduced during investigation.',
    resolvedAt: null,
    createdAt: minutesAgo(96),
    logKeys: ['warn-auth-1', 'warn-auth-2', 'warn-auth-3'],
    events: [
      {
        stage: 'DETECTED',
        at: minutesAgo(96),
        label: 'Incident detected',
        detail: 'Monitoring observed repeated authentication anomalies across the sign-in endpoint.',
      },
      {
        stage: 'INVESTIGATING',
        at: minutesAgo(88),
        label: 'Investigation started',
        detail: 'Failed sign-ins correlated with unauthorized requests to /api/projects.',
      },
    ],
    agentRuns: [
      {
        agent: 'FIXER',
        role: 'Candidate generator',
        status: 'ANALYZING',
        progress: 68,
        currentActivity: 'Correlating failed sign-ins with endpoint access',
        inputSummary: '3 AUTH_FAILED login attempts + unauthorized /api/projects traffic in window',
        outputSummary: null,
        confidence: null,
        mode: 'SIMULATION',
        completedAt: null,
        createdAt: minutesAgo(60),
      },
      {
        agent: 'CRITIC',
        role: 'Candidate reviewer',
        status: 'WAITING',
        progress: 12,
        currentActivity: 'Queued behind Fixer output',
        inputSummary: null,
        outputSummary: null,
        confidence: null,
        mode: 'SIMULATION',
        completedAt: null,
        createdAt: minutesAgo(58),
      },
      {
        agent: 'JUDGE',
        role: 'Final arbiter',
        status: 'WAITING',
        progress: 0,
        currentActivity: 'Waiting for candidate approval',
        inputSummary: null,
        outputSummary: null,
        confidence: null,
        mode: 'SIMULATION',
        completedAt: null,
        createdAt: minutesAgo(56),
      },
    ],
    approvals: [],
  },
  {
    ref: 'INC-00022',
    status: 'DETECTED',
    severity: 'MEDIUM',
    riskScore: 12,
    cyberSafetyImpact: 2,
    title: 'Repeated server errors on post creation',
    description:
      'A spike of unexpected server errors was observed on the post creation endpoint within the validation window. The errors followed a burst of POST /api/posts traffic and have been attached to an incident for investigation.',
    summary:
      'Six 5xx responses observed on POST /api/posts. Freshly detected; awaiting investigation.',
    endpoint: '/api/posts',
    method: 'POST',
    requestId: '93ab3c2d-51ee-4faa-8bcd-f19ad0f2be44',
    errorCode: 'POST_CREATION_5XX',
    expectedRootCause:
      'Unhandled error path in post creation surfaced during a rapid burst of requests.',
    resolvedAt: null,
    createdAt: minutesAgo(50),
    logKeys: [
      'err-5xx-1',
      'err-5xx-2',
      'err-5xx-3',
      'err-5xx-4',
      'err-5xx-5',
      'err-5xx-6',
    ],
    events: [
      {
        stage: 'DETECTED',
        at: minutesAgo(50),
        label: 'Incident detected',
        detail: 'Monitoring observed a 5xx spike on the post creation endpoint.',
      },
    ],
    agentRuns: [
      {
        agent: 'FIXER',
        role: 'Candidate generator',
        status: 'QUEUED',
        progress: 0,
        currentActivity: 'Awaiting gatherer output',
        inputSummary: null,
        outputSummary: null,
        confidence: null,
        mode: 'SIMULATION',
        completedAt: null,
        createdAt: minutesAgo(50),
      },
      {
        agent: 'CRITIC',
        role: 'Candidate reviewer',
        status: 'QUEUED',
        progress: 0,
        currentActivity: 'Waiting for Fixer candidate',
        inputSummary: null,
        outputSummary: null,
        confidence: null,
        mode: 'SIMULATION',
        completedAt: null,
        createdAt: minutesAgo(50),
      },
      {
        agent: 'JUDGE',
        role: 'Final arbiter',
        status: 'QUEUED',
        progress: 0,
        currentActivity: 'Waiting for critic recommendation',
        inputSummary: null,
        outputSummary: null,
        confidence: null,
        mode: 'SIMULATION',
        completedAt: null,
        createdAt: minutesAgo(50),
      },
    ],
    approvals: [],
  },
  {
    // History — resolved via human-approved candidate (Demo 1 / Demo 3 happy path).
    ref: 'INC-00014',
    status: 'RESOLVED',
    severity: 'LOW',
    riskScore: 6,
    cyberSafetyImpact: 1,
    title: 'Validation failure on post creation',
    description:
      'Post creation intermittently rejected valid content after a validation change. A candidate fix tightened validation handling; the human-approved deployment passed regression and the incident was resolved.',
    summary:
      'Resolved. Fix approved by human reviewer and deployed successfully; regression suite green.',
    endpoint: '/api/posts',
    method: 'POST',
    requestId: '5a8fbb10-c41d-4f20-9c3e-77a6d0042b19',
    errorCode: 'VALIDATION_FAILURE',
    expectedRootCause:
      'Validation update inadvertently narrowed acceptable post content.',
    resolvedAt: daysAgo(20),
    createdAt: daysAgo(21),
    logKeys: ['hist-valid-1', 'hist-valid-2'],
    events: [
      { stage: 'DETECTED', at: daysAgo(21), label: 'Incident detected', detail: 'Validation errors on POST /api/posts.' },
      { stage: 'INVESTIGATING', at: daysAgo(20.9), label: 'Investigation started', detail: 'Validation change identified as likely cause.' },
      { stage: 'AWAITING_REVIEW', at: daysAgo(20.4), label: 'Awaiting human review', detail: 'Candidate prepared; routed for approval.' },
      { stage: 'RESOLVED', at: daysAgo(20), label: 'Human approved · deployed', detail: 'Fix verified; regression passed.' },
    ],
    agentRuns: [
      {
        agent: 'FIXER', role: 'Candidate generator', status: 'COMPLETE', progress: 100,
        currentActivity: null, inputSummary: 'Validation error cluster on /api/posts',
        outputSummary: 'Tightened post validation handling',
        confidence: 96, mode: 'SIMULATION', completedAt: daysAgo(20.6), createdAt: daysAgo(21),
      },
      {
        agent: 'CRITIC', role: 'Candidate reviewer', status: 'COMPLETE', progress: 100,
        currentActivity: null, inputSummary: 'Fixer candidate for validation issue',
        outputSummary: 'Candidate is minimal and safe; regression suite green',
        confidence: 92, mode: 'SIMULATION', completedAt: daysAgo(20.5), createdAt: daysAgo(20.7),
      },
      {
        agent: 'JUDGE', role: 'Final arbiter', status: 'COMPLETE', progress: 100,
        currentActivity: null, inputSummary: 'Critic recommendation: safe',
        outputSummary: 'Approved candidate for human review',
        confidence: 98, mode: 'SIMULATION', completedAt: daysAgo(20.5), createdAt: daysAgo(20.6),
      },
    ],
    approvals: [
      {
        decision: 'APPROVED',
        reviewer: 'BuildHub Platform Lead',
        reason: 'Fix aligns with schema and validation contract; regression suite passed.',
        outcome: 'Deployed successfully — issue resolved.',
        createdAt: daysAgo(20),
      },
    ],
  },
  {
    // History — deployment rejected and rolled back (Demo 3 rollback path).
    ref: 'INC-00009',
    status: 'ROLLED_BACK',
    severity: 'HIGH',
    riskScore: 24,
    cyberSafetyImpact: 4,
    title: 'Database query timeout',
    description:
      'Project queries began timing out against the database. A candidate changed query semantics unexpectedly; the human reviewer rejected the deployment and the change was rolled back, restoring healthy behaviour.',
    summary:
      'Change rolled back after human rejection of the candidate. System returned to stable baseline.',
    endpoint: '/api/projects',
    method: 'GET',
    requestId: 'f44d7a1e-0381-4ab2-9d7e-6b98cc1a25d0',
    errorCode: 'DB_TIMEOUT',
    expectedRootCause:
      'Candidate altered query semantics; rejected candidate changed index usage.',
    resolvedAt: daysAgo(12),
    createdAt: daysAgo(14),
    logKeys: ['hist-db-1', 'hist-db-2'],
    events: [
      { stage: 'DETECTED', at: daysAgo(14), label: 'Incident detected', detail: 'Project list queries timing out.' },
      { stage: 'INVESTIGATING', at: daysAgo(13.5), label: 'Investigation started', detail: 'Query plan regression suspected.' },
      { stage: 'AWAITING_REVIEW', at: daysAgo(12.6), label: 'Awaiting human review', detail: 'Candidate ready; flagged for manual approval.' },
      { stage: 'ROLLED_BACK', at: daysAgo(12), label: 'Human rejected · rolled back', detail: 'Candidate changed query semantics unexpectedly; reverted.' },
    ],
    agentRuns: [
      {
        agent: 'FIXER', role: 'Candidate generator', status: 'COMPLETE', progress: 100,
        currentActivity: null, inputSummary: 'Database query timeout cluster on /api/projects',
        outputSummary: 'Rewrote project query with changed semantics',
        confidence: 88, mode: 'SIMULATION', completedAt: daysAgo(12.9), createdAt: daysAgo(13.5),
      },
      {
        agent: 'CRITIC', role: 'Candidate reviewer', status: 'COMPLETE', progress: 100,
        currentActivity: null, inputSummary: 'Fixer candidate for query timeout',
        outputSummary: 'Candidate reduces latency but changes semantics — risky',
        confidence: 61, mode: 'SIMULATION', completedAt: daysAgo(12.8), createdAt: daysAgo(12.95),
      },
      {
        agent: 'JUDGE', role: 'Final arbiter', status: 'COMPLETE', progress: 100,
        currentActivity: null, inputSummary: 'Critic flagged semantic risk',
        outputSummary: 'Passed to human review with risk summary',
        confidence: 74, mode: 'SIMULATION', completedAt: daysAgo(12.7), createdAt: daysAgo(12.82),
      },
    ],
    approvals: [
      {
        decision: 'REJECTED',
        reviewer: 'BuildHub Platform Lead',
        reason: 'Candidate changed query semantics unexpectedly; regression risk judged too high.',
        outcome: 'Change rolled back — incident marked rolled back after follow-up verification.',
        createdAt: daysAgo(12),
      },
    ],
  },
]

const logSeeds = [
  // AUTH_FAILED (WARN × 3) — drives Authentication degraded + auth-failure finding.
  ...['7c1c6b45-8fae-4f3e-b23d-1e90a1c0f6ad', 'b3a1c2d4-9e8f-4a1c-8d2e-0f5b4c3a2d91', 'ea2d3f4b-c5a6-4f0d-b7e8-1f2a8b9c6d34'].map(
    (requestId, i) => ({
      key: `warn-auth-${i + 1}`,
      level: 'WARN',
      service: 'auth',
      message: 'Authentication failed',
      route: '/api/auth/login',
      method: 'POST',
      status: 401,
      requestId,
      errorCode: 'AUTH_FAILED',
      minutesAgo: 96 - i * 4,
      incidentRef: 'INC-00021',
    }),
  ),
  // NOT_FOUND (WARN × 6) — drives not-found finding. No incident link.
  ...[
    ['GET', '/api/nonexistent/posts'],
    ['POST', '/api/nonexistent/projects'],
    ['GET', '/api/nonexistent/users/unknown'],
    ['DELETE', '/api/nonexistent/comments/1'],
    ['PUT', '/api/nonexistent/incidents'],
    ['PATCH', '/api/nonexistent/logs'],
  ].map(([method, route], i) => ({
    key: `warn-404-${i + 1}`,
    level: 'WARN',
    service: 'api',
    message: 'Resource not found',
    route,
    method,
    status: 404,
    requestId: `9f8e2d${i}4-3c1b-4f2a-9d8e-7a6b5c4d3e2f`,
    errorCode: 'NOT_FOUND',
    minutesAgo: 84 - i * 4,
    incidentRef: null,
  })),
  // SERVER ERROR (ERROR × 6) — drives 5xx finding + error pressure. Linked to INC-00022.
  ...[1, 2, 3, 4, 5, 6].map((i) => ({
    key: `err-5xx-${i}`,
    level: 'ERROR',
    service: 'api',
    message: 'Unexpected server error during post creation',
    route: '/api/posts',
    method: 'POST',
    status: 500,
    requestId: `2d9c8b7a-${i}5f4-4e3d-4c2b-a1f0-e9d8c7b6a54${i}`,
    errorCode: 'POST_CREATION_5XX',
    minutesAgo: 50 - i * 3,
    incidentRef: 'INC-00022',
  })),
  // History-attached rows (outside the pressure window's severity maths:
  // these are old, but they stay safely under every finding threshold).
  ...[
    { key: 'hist-valid-1', level: 'WARN', service: 'api', message: 'Validation rejected a post', route: '/api/posts', method: 'POST', status: 422, requestId: '5a8fbb10-c41d-4f20-9c3e-77a6d0042b19', errorCode: 'VALIDATION_FAILURE', minutesAgo: 21 * 24 * 60, incidentRef: 'INC-00014' },
    { key: 'hist-valid-2', level: 'INFO', service: 'api', message: 'Post created', route: '/api/posts', method: 'POST', status: 201, requestId: '5a8fbb10-c41d-4f20-9c3e-77a6d0042b19', errorCode: null, minutesAgo: 20 * 24 * 60, incidentRef: 'INC-00014' },
    { key: 'hist-db-1', level: 'ERROR', service: 'api', message: 'Project query timed out', route: '/api/projects', method: 'GET', status: 504, requestId: 'f44d7a1e-0381-4ab2-9d7e-6b98cc1a25d0', errorCode: 'DB_TIMEOUT', minutesAgo: 14 * 24 * 60, incidentRef: 'INC-00009' },
    { key: 'hist-db-2', level: 'INFO', service: 'api', message: 'Project query healthy', route: '/api/projects', method: 'GET', status: 200, requestId: 'f44d7a1e-0381-4ab2-9d7e-6b98cc1a25d0', errorCode: null, minutesAgo: 12 * 24 * 60, incidentRef: 'INC-00009' },
  ],
  // INFO spread (no score impact) — keeps recent activity + route volume lively.
  ...[1, 2, 3, 4].map((i) => ({
    key: `info-health-${i}`,
    level: 'INFO',
    service: 'health',
    message: 'Health check: all systems operational',
    route: '/api/health',
    method: 'GET',
    status: 200,
    requestId: `c3d4e5f6-1a2b-3c4d-5e6f-7a8b9c0d1e2f`,
    errorCode: null,
    minutesAgo: 55 - i * 10,
    incidentRef: null,
  })),
  { key: 'info-auth-login', level: 'INFO', service: 'auth', message: 'User authenticated', route: '/api/auth/login', method: 'POST', status: 200, requestId: '0a1b2c3d-4e5f-6a7b-8c9d-0e1f2a3b4c5d', errorCode: null, minutesAgo: 42, incidentRef: null },
  { key: 'info-auth-register', level: 'INFO', service: 'auth', message: 'User registered', route: '/api/auth/register', method: 'POST', status: 201, requestId: '1b2c3d4e-5f6a-7b8c-9d0e-1f2a3b4c5d6e', errorCode: null, minutesAgo: 32, incidentRef: null },
  { key: 'info-inc-list', level: 'INFO', service: 'api', message: 'Incident list fetched: 4 returned', route: '/api/incidents', method: 'GET', status: 200, requestId: '2c3d4e5f-6a7b-8c9d-0e1f-2a3b4c5d6e7f', errorCode: null, minutesAgo: 28, incidentRef: null },
  { key: 'info-inc-detail', level: 'INFO', service: 'api', message: 'Incident detail fetched: INC-00021', route: '/api/incidents/INC-00021', method: 'GET', status: 200, requestId: '3d4e5f6a-7b8c-9d0e-1f2a-3b4c5d6e7f80', errorCode: null, minutesAgo: 24, incidentRef: null },
  { key: 'info-summary', level: 'INFO', service: 'api', message: 'Observability summary fetched', route: '/api/observability/summary', method: 'GET', status: 200, requestId: '4e5f6a7b-8c9d-0e1f-2a3b-4c5d6e7f809a', errorCode: null, minutesAgo: 20, incidentRef: null },
  { key: 'info-logs', level: 'INFO', service: 'api', message: 'Log events fetched: 12 returned', route: '/api/logs', method: 'GET', status: 200, requestId: '5f6a7b8c-9d0e-1f2a-3b4c-5d6e7f809ab1', errorCode: null, minutesAgo: 16, incidentRef: null },
  { key: 'info-post', level: 'INFO', service: 'api', message: 'Post created', route: '/api/posts', method: 'POST', status: 201, requestId: '6a7b8c9d-0e1f-2a3b-4c5d-6e7f809ab1c2', errorCode: null, minutesAgo: 8, incidentRef: null },
]

async function seedObservability() {
  const existingIncident = await prisma.incident.findUnique({
    where: { ref: 'INC-00021' },
  })
  if (existingIncident) {
    console.log('Observability demo data already present — nothing to do.')
    return
  }

  const refMap = {}
  for (const seed of incidentSeeds) {
    const incident = await prisma.incident.create({
      data: {
        ref: seed.ref,
        status: seed.status,
        severity: seed.severity,
        riskScore: seed.riskScore,
        cyberSafetyImpact: seed.cyberSafetyImpact,
        title: seed.title,
        description: seed.description,
        summary: seed.summary,
        endpoint: seed.endpoint,
        method: seed.method,
        requestId: seed.requestId,
        errorCode: seed.errorCode,
        expectedRootCause: seed.expectedRootCause,
        resolvedAt: seed.resolvedAt,
        createdAt: seed.createdAt,
      },
    })
    refMap[seed.ref] = incident.id

    for (const event of seed.events) {
      await prisma.incidentEvent.create({
        data: {
          incidentId: incident.id,
          stage: event.stage,
          label: event.label,
          detail: event.detail,
          at: event.at,
        },
      })
    }

    for (const run of seed.agentRuns) {
      await prisma.agentRun.create({
        data: {
          incidentId: incident.id,
          agent: run.agent,
          role: run.role,
          status: run.status,
          progress: run.progress,
          currentActivity: run.currentActivity,
          inputSummary: run.inputSummary,
          outputSummary: run.outputSummary,
          confidence: run.confidence,
          mode: run.mode,
          completedAt: run.completedAt,
          createdAt: run.createdAt,
        },
      })
    }

    for (const approval of seed.approvals) {
      await prisma.approval.create({
        data: {
          incidentId: incident.id,
          decision: approval.decision,
          reviewer: approval.reviewer,
          reason: approval.reason,
          outcome: approval.outcome,
          createdAt: approval.createdAt,
        },
      })
    }
  }

  for (const log of logSeeds) {
    await prisma.logEvent.create({
      data: {
        level: log.level,
        service: log.service,
        message: log.message,
        route: log.route,
        method: log.method,
        status: log.status,
        requestId: log.requestId,
        errorCode: log.errorCode,
        incidentId: log.incidentRef ? refMap[log.incidentRef] : null,
        createdAt: minutesAgo(log.minutesAgo),
      },
    })
  }

  const active = incidentSeeds.filter((s) =>
    ['DETECTED', 'INVESTIGATING', 'AWAITING_REVIEW'].includes(s.status),
  )
  console.log(
    `Created ${incidentSeeds.length} demo incidents, ${logSeeds.length} log events, ` +
      `${active.length} active (${active.map((s) => s.ref).join(', ')}).`,
  )
}

async function main() {
  const existing = await prisma.user.findUnique({ where: { username: 'arjun' } })
  if (existing) {
    console.log('Demo user data already present — skipping user/project/post creation.')
  } else {
    await seedCore()
  }

  // Phase 7 observability demo rows are NO LONGER seeded by default: they are
  // hardcoded incidents/logs that conflict with Phase 8's no-fake-data rule.
  // Opt back in with SEED_OBSERVABILITY=1 only for Phase 7 regression checks.
  if (process.env.SEED_OBSERVABILITY === '1') {
    await seedObservability()
  }

  console.log('\nSeed complete. Demo login: username `arjun` / password `buildhub-demo1` (and all other demo accounts).')
}

async function seedCore() {
  const passwordHash = await argon2.hash(DEMO_PASSWORD)

  const created = {}
  for (const u of users) {
    created[u.username] = await prisma.user.create({
      data: { ...u, email: `${u.username}@buildhub.dev`, passwordHash },
    })
  }
  console.log(`Created ${users.length} demo users.`)

  const projectMap = {}
  for (const p of projects) {
    projectMap[p.name] = await prisma.project.create({
      data: {
        name: p.name,
        slug: `${p.owner}-${p.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
        description: p.description,
        tags: p.tags,
        status: p.status,
        ownerId: created[p.owner].id,
        createdAt: p.createdAt,
      },
    })
  }
  console.log(`Created ${projects.length} demo projects.`)

  const postMap = {}
  for (const po of posts) {
    const project = projectMap[po.project]
    const author = created[po.author]
    const post = await prisma.post.create({
      data: {
        content: po.content,
        tags: po.tags,
        authorId: author.id,
        projectId: project.id,
        createdAt: po.createdAt,
      },
    })
    postMap[po.key] = post
  }
  console.log(`Created ${posts.length} demo posts.`)

  for (const c of comments) {
    const post = postMap[c.postKey]
    if (!post) continue
    await prisma.comment.create({
      data: {
        content: c.body,
        authorId: created[c.author].id,
        postId: post.id,
        createdAt: c.createdAt,
      },
    })
  }
  console.log(`Created ${comments.length} demo comments.`)

  // Likes follow a realistic, deterministic distribution: the newest posts
  // (less than ~4 days old) have not accumulated likes yet — some sit at 0 —
  // while older, more established posts carry a few likes from the other demo
  // users. Like counts are real DB rows (not hardcoded values).
  const rng = mulberry32(42)
  const byNewest = [...posts].sort((a, b) => b.createdAt - a.createdAt)
  const newestCount = (po) => byNewest.indexOf(po)
  for (const po of posts) {
    const author = created[po.author]
    const candidates = Object.values(created).filter((u) => u.id !== author.id)
    const rank = newestCount(po)
    let count = 0
    if (rank >= 2) {
      // 3 newest (rank 0,1) stay at 0; older posts get 1-3 likes.
      const cap = Math.min(3, candidates.length)
      const fromRandom = Math.floor(rng() * cap) + 1
      count = Math.min(cap, fromRandom)
    }
    const shuffled = [...candidates].sort(() => rng() - 0.5).slice(0, count)
    for (const wouldBeLikeAuthor of shuffled) {
      await prisma.like.create({
        data: {
          userId: wouldBeLikeAuthor.id,
          postId: postMap[po.key].id,
        },
      })
    }
  }
  console.log('Created seeded likes across demo posts.')
}

main()
  .catch((err) => {
    console.error('Seed failed:', err)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })