# AGENTS.md

# BuildHub — Agent Operating Instructions

> This file defines how AI coding agents must operate inside the BuildHub repository.
>
> `AGENTS.md` = rules and operating procedure.
>
> `PLAN.md` = project state, roadmap, tasks, progress, and decisions.
>
> Skills = specialized implementation knowledge.
>
> Source code = actual implementation.
>
> Tests = evidence that the implementation works.

---

# 1. Mission

BuildHub is a production-style developer collaboration web application.

The application will eventually serve as a controlled test environment for an:

**AI Self-Healing DevOps System**

BuildHub must therefore be designed to support:

```text
Normal Application
        ↓
Monitoring
        ↓
Controlled Failure
        ↓
Error Detection
        ↓
Root Cause Analysis
        ↓
AI Repair
        ↓
Validation
        ↓
Human Approval
        ↓
Safe Patch
        ↓
Restart
        ↓
Verification
        ↓
Rollback if necessary
        ↓
Learning
```

The current priority is to build **BuildHub itself correctly**.

Do not prematurely implement the complete self-healing platform unless the user explicitly requests it.

---

# 2. Core Operating Principles

Always prioritize:

1. Correctness
2. Security
3. Simplicity
4. Maintainability
5. Testability
6. Observability
7. Recoverability
8. Performance
9. Clear architecture
10. Efficient use of agent context

The objective is NOT:

> Write as much code as possible.

The objective is:

> Make the smallest correct, tested, maintainable change that moves the project forward.

---

# 3. Source of Truth Hierarchy

When deciding how the project should behave, use this priority:

```text
1. Explicit current user instruction
2. AGENTS.md
3. Relevant skill instructions
4. PLAN.md
5. Existing project architecture
6. Existing implementation
7. General engineering conventions
```

If sources conflict:

* Follow the higher-priority source.
* Do not silently invent a resolution.
* If the conflict materially affects the implementation, report it.

---

# 4. Mandatory Startup Procedure

Before performing meaningful implementation work, follow this procedure.

```text
START
  ↓
Read AGENTS.md
  ↓
Identify requested task
  ↓
Inspect PLAN.md
  ↓
Identify current phase/task
  ↓
Identify applicable skills
  ↓
Read only relevant skills
  ↓
Inspect existing implementation
  ↓
Implement
  ↓
Test
  ↓
Update PLAN.md
  ↓
Report
```

Do not skip the planning step merely because the task appears small.

For trivial questions or simple repository queries, use judgment and avoid unnecessary context loading.

---

# 5. PLAN.md Rules

`PLAN.md` is the **living project execution plan**.

It contains:

* Project phases
* Current task
* Completed tasks
* Pending tasks
* Dependencies
* Acceptance criteria
* Failure scenarios
* Architectural decisions
* Blockers
* Known issues
* Progress

## Before coding

Read the relevant portion of `PLAN.md`.

Determine:

```text
Current Phase
Current Task
Task Status
Dependencies
Acceptance Criteria
Related Work
Known Blockers
```

Do not start a task that depends on unfinished work without checking the dependency.

---

# 6. Efficient PLAN.md Reading

Do NOT blindly reread all of `PLAN.md` for every task.

Use this strategy:

```text
Small task
    ↓
Locate relevant section
    ↓
Read relevant section
```

For a cross-cutting architectural task:

```text
Locate relevant sections
    ↓
Read related phases
    ↓
Read dependencies
    ↓
Proceed
```

Read the entire plan only when:

* The task is architectural.
* The user explicitly asks for a complete plan review.
* The current project state is unclear.
* Multiple phases are affected.

Otherwise, minimize context usage.

---

# 7. PLAN.md Must Reflect Reality

Never allow `PLAN.md` to become stale.

After meaningful implementation:

```text
Code changed
    ↓
Tests executed
    ↓
PLAN.md updated
```

Update:

* Task status
* Completed work
* Remaining work
* Tests performed
* Important discoveries
* Architectural decisions
* Blockers

Do not rewrite unrelated sections.

---

# 8. Task Status Rules

Use:

```text
[ ] Not started
[-] In progress
[x] Completed
[!] Blocked
```

### `[x] Completed`

Use only when:

* Implementation exists.
* Relevant tests were executed.
* Expected behavior was verified.
* No known blocking regression exists.

### `[-] In progress`

Use when:

* Implementation is incomplete.
* Validation is incomplete.
* More work remains.

### `[!] Blocked`

Use when:

* Work cannot continue because of a genuine blocker.

Never mark work complete simply because the code was written.

---

# 9. Skills — Mandatory Usage

Skills provide specialized instructions for implementation.

Before implementing a task, determine which skills apply.

Examples:

```text
Frontend/UI task
→ Frontend skill

Backend/API task
→ Backend skill

Database task
→ Database skill

Authentication task
→ Authentication/Security skill

Testing task
→ Testing skill

Deployment task
→ Deployment/Container skill
```

## Skill reading rule

Read the skill file **before implementing work covered by that skill**.

Do not assume that familiarity with the technology makes the skill unnecessary.

---

# 10. Efficient Skill Reading

Do NOT read every available skill for every task.

Use:

```text
Task
 ↓
Identify technical domains
 ↓
Find relevant skills
 ↓
Read only those skills
```

For example:

```text
"Fix project creation API"

Read:
- Backend/API skill
- Database skill
- Testing skill

Do not automatically read:
- UI design skill
- Deployment skill
- unrelated skills
```

---

# 11. Skill Reuse

Within the same task:

* Do not repeatedly reread an unchanged skill file.
* Continue following the skill after reading it.

Reread a skill only if:

* The skill has changed.
* The task enters a different technical area.
* The previous instructions are unclear.
* The user explicitly asks for a fresh review.

---

# 12. Never Guess Skill Locations

Do not invent skill paths.

First inspect the available skills/environment.

If a required skill is unavailable:

* Do not pretend it exists.
* Use the available project instructions.
* Report the missing skill when relevant.

---

# 13. Repository Inspection

Never assume the repository structure.

Before modifying code:

```text
Search
 ↓
Locate
 ↓
Read
 ↓
Understand
 ↓
Modify
```

Check:

* Existing files
* Existing components
* Existing routes
* Existing APIs
* Existing database models
* Existing tests
* Existing configuration
* Existing dependencies

Do not recreate functionality that already exists.

---

# 14. Context Efficiency

Context is a limited engineering resource.

Always prefer:

```text
Targeted search
    ↓
Relevant file
    ↓
Relevant function/component
    ↓
Relevant dependencies
```

Avoid:

```text
Read entire repository
Read every file
Read every skill
Read huge logs
```

---

# 15. Large Files

Do not automatically load large files completely.

Instead:

1. Search for the relevant symbol.
2. Read surrounding context.
3. Trace dependencies only when necessary.
4. Expand the context only when required.

Example:

If modifying:

```text
POST /api/projects
```

inspect:

```text
Route
 ↓
Controller
 ↓
Service
 ↓
Validation
 ↓
Database
 ↓
Tests
```

Do not read unrelated modules.

---

# 16. Existing Code Is Evidence

Before changing implementation, determine:

* What currently happens?
* Why does it happen?
* What depends on it?
* What tests cover it?
* Is the behavior intentional?

Do not change code based solely on filenames or assumptions.

---

# 17. User Changes Must Be Preserved

The repository may contain changes made by the user or another agent.

Before significant modifications:

```text
Check repository state
```

Never:

* Delete user changes.
* Overwrite unrelated work.
* Reset the repository without permission.
* Use destructive Git commands casually.
* "Clean up" unrelated modifications.

If existing changes conflict with the current task:

* Preserve them.
* Identify the conflict.
* Resolve only when safe and appropriate.

---

# 18. Implementation Discipline

Implement only what the current task requires.

Prefer:

```text
Small change
 ↓
Test
 ↓
Continue
```

Avoid:

```text
Small task
 ↓
Rewrite architecture
 ↓
Change unrelated modules
 ↓
Add many dependencies
```

Do not perform unnecessary refactoring during feature work.

---

# 19. Architecture Rules

BuildHub should maintain clear boundaries.

Preferred architecture:

```text
┌─────────────────────┐
│      Frontend       │
└──────────┬──────────┘
           ↓
┌─────────────────────┐
│       API Layer     │
└──────────┬──────────┘
           ↓
┌─────────────────────┐
│ Business / Services │
└──────────┬──────────┘
           ↓
┌─────────────────────┐
│    Data Access      │
└──────────┬──────────┘
           ↓
┌─────────────────────┐
│      Database       │
└─────────────────────┘
```

Supporting systems:

```text
Authentication
Authorization
Validation
Logging
Notifications
Background Jobs
Testing
Observability
```

Keep responsibilities separated.

---

# 20. Frontend Rules

Frontend code should:

* Use reusable components.
* Keep UI state understandable.
* Handle loading states.
* Handle error states.
* Handle empty states.
* Validate user input appropriately.
* Use the API layer instead of directly accessing the database.
* Avoid duplicated business logic.

Do not put sensitive secrets in frontend code.

---

# 21. Backend Rules

Backend code should:

* Validate input.
* Authenticate requests where required.
* Authorize resource access.
* Validate database operations.
* Return predictable responses.
* Handle failures consistently.
* Log useful information.
* Avoid leaking internal implementation details.

Do not trust the frontend for authorization.

---

# 22. Database Rules

Database changes must consider:

* Schema integrity
* Relationships
* Constraints
* Indexes where appropriate
* Data validation
* Migration strategy
* Existing data

Before changing a schema:

```text
Inspect existing schema
 ↓
Inspect dependent code
 ↓
Inspect tests
 ↓
Make migration/change
 ↓
Test
```

Never casually destroy development data or production-like state.

---

# 23. Authentication Rules

Authentication is security-critical.

Never:

* Store plaintext passwords.
* Hard-code credentials.
* Commit secrets.
* Trust client-side authentication state as proof of authorization.
* Expose tokens unnecessarily.

Authentication changes require appropriate security review and tests.

---

# 24. Authorization Rules

Authorization must be enforced server-side.

For protected resources verify:

```text
Who is the user?
 ↓
What resource are they accessing?
 ↓
Are they allowed to access it?
 ↓
Are they allowed to perform this action?
```

Never rely solely on hidden frontend buttons.

---

# 25. API Rules

APIs should use consistent behavior.

Handle appropriately:

```text
2xx Success
400 Validation Error
401 Authentication Error
403 Authorization Error
404 Not Found
409 Conflict
429 Rate Limit where applicable
5xx Server Error
```

Use the project's chosen conventions consistently.

Do not expose raw internal stack traces to users.

---

# 26. Error Handling

Errors must be:

* Detectable
* Meaningful
* Structured where appropriate
* Logged appropriately
* Testable

Never silently swallow important errors.

Avoid:

```text
try
    operation
catch
    ignore
```

unless the behavior is explicitly intentional and documented.

---

# 27. Observability

BuildHub will eventually be monitored by the self-healing system.

Therefore important operations must be observable.

Useful logs should identify:

```text
Timestamp
Severity
Component
Operation
Endpoint
Error type
Error message
Request/correlation ID
Relevant safe context
```

Never log:

* Passwords
* Authentication tokens
* API keys
* Secrets
* Sensitive private data

---

# 28. Request Correlation

Where appropriate:

* Generate request/correlation IDs.
* Propagate them through backend operations.
* Include them in logs.
* Make related failures traceable.

The future self-healing system should be able to connect:

```text
Request
 ↓
API
 ↓
Service
 ↓
Database
 ↓
Error
```

---

# 29. Health Checks

Provide health checks appropriate to the architecture.

At minimum, where applicable:

```text
Application health
Database health
Critical dependency health
```

Health checks should distinguish:

```text
Healthy
Degraded
Unavailable
```

Do not make health checks falsely report healthy when critical dependencies are unavailable.

---

# 30. Testing Is Mandatory

Tests are not optional documentation.

Tests are evidence.

For meaningful functionality, use appropriate:

* Unit tests
* Integration tests
* API tests
* Component tests
* End-to-end tests

---

# 31. Bug-Fix Testing Procedure

When fixing a bug:

```text
1. Reproduce
2. Confirm failure
3. Identify root cause
4. Implement fix
5. Run targeted test
6. Run related regression tests
7. Confirm original behavior works
8. Update PLAN.md
```

Never skip reproduction when practical.

---

# 32. Never Fake Validation

Never state:

> Tests pass

unless tests were actually run.

Never state:

> Build succeeds

unless the build was actually executed successfully.

Never state:

> Bug fixed

unless the original behavior was verified after the change.

If validation cannot be performed:

```text
Validation not performed because: <reason>
```

---

# 33. Regression Protection

Every meaningful fix should consider whether it could break existing functionality.

Check:

```text
Original failure
+
Related functionality
+
Existing tests
```

Do not weaken tests merely to make the project green.

---

# 34. Dependency Rules

Before adding a dependency:

1. Check whether the project already provides the capability.
2. Check existing dependencies.
3. Check whether a standard library solution is sufficient.
4. Add a dependency only when justified.

Avoid duplicate libraries solving the same problem.

After adding a dependency:

* Update the dependency manifest.
* Run installation/build checks.
* Run relevant tests.

---

# 35. Configuration Rules

Environment-specific configuration should remain configurable.

Use environment variables for:

```text
Database credentials
API keys
Secrets
External service URLs
Environment-specific configuration
```

Maintain:

```text
.env.example
```

with safe placeholder values.

Never commit real secrets.

---

# 36. Fault Injection Rules

Fault injection is part of the eventual BuildHub testing environment.

Fault injection must be:

* Intentional
* Controlled
* Reproducible
* Reversible
* Documented
* Isolated from normal production behavior

Do NOT introduce random bugs into the application.

Prefer:

```text
Fault scenario
 ↓
Explicit trigger
 ↓
Predictable failure
 ↓
Observable error
 ↓
Recovery
```

---

# 37. Fault Injection Separation

Keep intentional failure mechanisms separate from normal application logic wherever practical.

Conceptually:

```text
BuildHub
   │
   ├── Normal Application
   │
   └── Fault Injection Layer
            ↓
       Controlled Failure
```

This allows the future self-healing system to distinguish:

```text
Real implementation bug
vs.
Intentional test failure
```

---

# 38. Self-Healing Integration Boundary

BuildHub is the target application.

The AI Self-Healing system is a separate concern unless explicitly requested otherwise.

Avoid tightly coupling BuildHub to the AI engine.

BuildHub should expose enough information for the future system to:

* Detect failures.
* Read useful logs.
* Identify affected endpoints.
* Identify affected components.
* Run tests.
* Verify recovery.
* Restart services where appropriate.
* Restore known-good state.

---

# 39. Failure Scenario Design

Every controlled failure should document:

```text
Scenario ID
Difficulty
Target
Failure type
Expected symptom
Expected root cause
Validation method
Recovery condition
Rollback condition
```

Difficulty levels:

```text
EASY
Simple syntax/runtime/UI failures

MEDIUM
API/database/business-logic failures

DIFFICULT
Security/cascading/concurrency/regression failures
```

---

# 40. Easy Failure Philosophy

Easy scenarios should test whether the future system can:

```text
Detect
 ↓
Locate
 ↓
Understand
 ↓
Generate simple fix
 ↓
Validate
```

Examples:

* Undefined variable
* Typo
* Wrong condition
* Incorrect response field
* Simple UI failure

---

# 41. Medium Failure Philosophy

Medium scenarios should require deeper reasoning.

Examples:

* API failure
* Database query failure
* Input validation bug
* Business logic bug
* Notification failure
* Frontend/backend mismatch

Expected investigation:

```text
Frontend
 ↓
API
 ↓
Business Logic
 ↓
Database
```

---

# 42. Difficult Failure Philosophy

Difficult scenarios should test system-level reasoning.

Examples:

* Authentication failure
* Authorization failure
* Database outage
* Cascading failure
* Race condition
* Regression after repair
* Multiple related failures

These scenarios must be carefully controlled.

---

# 43. Security-Critical Changes

Changes involving:

```text
Authentication
Authorization
Payments
Secrets
Database permissions
Security-sensitive operations
```

must receive stricter review and validation.

Never make dangerous security changes merely to make a demo work.

---

# 44. Performance

Do not optimize blindly.

First identify:

```text
What is slow?
Where is it slow?
Why is it slow?
```

Then optimize the actual bottleneck.

Avoid premature optimization that makes the architecture harder to maintain.

---

# 45. UI Quality

BuildHub should look like a real modern application.

Prioritize:

* Consistent spacing
* Clear hierarchy
* Responsive layouts
* Accessible interactions
* Loading states
* Empty states
* Error states
* Clear feedback
* Consistent components

Do not sacrifice application correctness for visual effects.

---

# 46. Accessibility

Where practical:

* Use semantic HTML.
* Provide labels for inputs.
* Support keyboard navigation.
* Provide meaningful button names.
* Ensure errors are understandable.
* Avoid relying solely on color to communicate state.

---

# 47. Git Discipline

Before significant work:

```text
Check git status
```

Understand existing modifications.

After significant work:

```text
Review changed files
Run tests
Review diff
```

Do not commit automatically unless requested.

Do not use destructive commands without explicit justification.

---

# 48. Debugging Procedure

When something fails:

```text
Observe
 ↓
Read exact error
 ↓
Locate source
 ↓
Trace dependency
 ↓
Understand root cause
 ↓
Make smallest reasonable change
 ↓
Test
```

Do not repeatedly make random modifications.

---

# 49. When a Fix Does Not Work

Do NOT immediately rewrite the entire feature.

Instead:

```text
First hypothesis
 ↓
Test
 ↓
Evidence
 ↓
Update hypothesis
 ↓
Inspect deeper dependency
 ↓
Test again
```

Use evidence-driven debugging.

---

# 50. Handling Unexpected Problems

If an unrelated issue is discovered:

Do not automatically expand the task.

Instead:

```text
Current task
    ↓
Is unrelated issue blocking current task?
    │
    ├── YES → Fix or investigate as necessary
    │
    └── NO  → Record as known issue
```

Avoid scope creep.

---

# 51. Architectural Changes

Before making a major architectural change:

1. Understand the existing architecture.
2. Identify why the current architecture is insufficient.
3. Check affected modules.
4. Check tests.
5. Check dependencies.
6. Update `PLAN.md`.
7. Implement incrementally.

Record significant decisions in the Architectural Decisions section of `PLAN.md`.

---

# 52. Don't Rewrite Working Systems

Do not rewrite a working module simply because another implementation looks cleaner.

A rewrite requires a clear benefit.

Prefer incremental improvement.

---

# 53. Documentation

Update documentation when behavior changes materially.

Important documentation includes:

```text
README.md
PLAN.md
API documentation where applicable
Environment configuration
Architecture decisions
Fault scenario documentation
```

Do not create unnecessary documentation for trivial code changes.

---

# 54. Completion Protocol

Before declaring a task complete:

## Step 1 — Implementation

Verify requested functionality exists.

## Step 2 — Tests

Run relevant tests.

## Step 3 — Build

Run relevant build/type-check/lint commands where applicable.

## Step 4 — Regression

Check related functionality.

## Step 5 — PLAN.md

Update the actual project state.

## Step 6 — Review

Inspect the final diff/change set.

## Step 7 — Report

Provide:

```text
Implemented:
- ...

Tests:
- ...

Validation:
- ...

PLAN.md:
- Updated ...

Remaining:
- ...
```

---

# 55. PLAN.md Update Protocol

After meaningful work:

### Update the task

```text
[-] → [x]
```

only when genuinely complete.

### Update active tasks

Remove completed tasks.

Add remaining tasks if discovered.

### Update blockers

Add only real blockers.

### Update decisions

Record only meaningful architectural decisions.

### Update change log

Record meaningful changes to the project plan.

Do not turn `PLAN.md` into a noisy diary.

---

# 56. Context-Efficient Agent Loop

Use this as the default workflow:

```text
┌─────────────────────────────────┐
│ 1. Understand user request      │
└───────────────┬─────────────────┘
                ↓
┌─────────────────────────────────┐
│ 2. Read AGENTS.md rules         │
└───────────────┬─────────────────┘
                ↓
┌─────────────────────────────────┐
│ 3. Inspect relevant PLAN.md     │
└───────────────┬─────────────────┘
                ↓
┌─────────────────────────────────┐
│ 4. Identify applicable skills   │
└───────────────┬─────────────────┘
                ↓
┌─────────────────────────────────┐
│ 5. Read only relevant skills   │
└───────────────┬─────────────────┘
                ↓
┌─────────────────────────────────┐
│ 6. Locate relevant source code  │
└───────────────┬─────────────────┘
                ↓
┌─────────────────────────────────┐
│ 7. Implement focused change     │
└───────────────┬─────────────────┘
                ↓
┌─────────────────────────────────┐
│ 8. Run relevant validation      │
└───────────────┬─────────────────┘
                ↓
┌─────────────────────────────────┐
│ 9. Review changes               │
└───────────────┬─────────────────┘
                ↓
┌─────────────────────────────────┐
│ 10. Update PLAN.md              │
└───────────────┬─────────────────┘
                ↓
┌─────────────────────────────────┐
│ 11. Report actual results       │
└─────────────────────────────────┘
```

---

# 57. Context Efficiency Rules

## Always

* Search before reading large files.
* Read relevant plan sections.
* Read relevant skills.
* Inspect existing implementation.
* Reuse existing context.
* Run targeted tests.
* Update the plan.

## Avoid

* Reading the entire repository unnecessarily.
* Reading every skill.
* Re-reading unchanged skills.
* Re-reading unchanged source files.
* Dumping huge logs.
* Rewriting entire files unnecessarily.
* Rebuilding completed features.
* Performing unrelated refactors.

Goal:

> Maximum understanding with minimum unnecessary context.

---

# 58. Parallel Work

When tasks are independent, they may be investigated in parallel.

Example:

```text
Frontend component
       +
Backend endpoint
       +
Test setup
```

But do not parallelize changes that depend on an unfinished architectural decision.

Always respect dependencies in `PLAN.md`.

---

# 59. Before Installing Tools or Packages

Check:

```text
Existing tools
Existing skills
Existing dependencies
Existing project commands
```

Do not install duplicate tooling.

If a required capability is missing, determine whether an existing project tool already provides it.

---

# 60. Environment Safety

Development and testing should remain isolated from real production systems.

Never:

* Connect test fault injection to real production infrastructure.
* Use real credentials.
* Send test notifications to unintended recipients.
* Run destructive experiments against real data.

---

# 61. Demo Stability

The final hackathon demonstration must be deterministic.

Every demo scenario should be:

```text
Repeatable
Predictable
Recoverable
Fast enough to demonstrate
```

Avoid demos that depend on random timing or unreliable external services unless intentionally simulated.

---

# 62. Demo Priority

The project should eventually demonstrate three core scenarios:

### Demo 1

Simple bug:

```text
Failure
 ↓
Detection
 ↓
AI fix
 ↓
Validation
 ↓
Approval
 ↓
Recovery
```

### Demo 2

Bad candidate:

```text
Failure
 ↓
Multiple fixes
 ↓
Candidate testing
 ↓
Bad fix rejected
 ↓
Good fix selected
```

### Demo 3

Failed deployment:

```text
Failure
 ↓
Repair
 ↓
Deploy
 ↓
Regression
 ↓
Rollback
 ↓
Recovery
```

These scenarios are more important than adding many superficial features.

---

# 63. Project Quality Gate

Before moving from one major phase to the next:

```text
Implementation complete
        +
Relevant tests pass
        +
No known blocking regression
        +
PLAN.md updated
        +
Architecture still coherent
```

Only then proceed.

---

# 64. If the Plan Becomes Wrong

The plan is a living document.

If implementation reveals that the original plan is technically incorrect:

Do NOT blindly follow it.

Instead:

```text
Discover problem
 ↓
Understand better approach
 ↓
Update PLAN.md
 ↓
Record architectural decision if significant
 ↓
Implement corrected approach
```

The goal is project correctness, not loyalty to an outdated plan.

---

# 65. Final Rule

Always remember:

```text
AGENTS.md
= HOW TO WORK

SKILLS
= SPECIALIZED KNOWLEDGE

PLAN.md
= WHAT TO BUILD + CURRENT STATE

SOURCE CODE
= ACTUAL IMPLEMENTATION

TESTS
= EVIDENCE

BUILDHUB
= TARGET APPLICATION

SELF-HEALING SYSTEM
= FUTURE SYSTEM OPERATING ON BUILDHUB
```

The agent must maintain a disciplined loop:

```text
UNDERSTAND
   ↓
PLAN
   ↓
READ RELEVANT SKILLS
   ↓
INSPECT
   ↓
IMPLEMENT
   ↓
TEST
   ↓
VERIFY
   ↓
UPDATE PLAN
   ↓
REPORT
```

**Never sacrifice correctness for speed, and never waste context by reading information that is irrelevant to the current task.**
