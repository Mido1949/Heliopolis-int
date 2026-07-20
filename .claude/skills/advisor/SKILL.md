---
name: advisor
description: Use when Mido asks for an audit review, second opinion, health check, or to "advise" on a claim about the app or codebase — before proposing or applying any change
---

# Advisor

## Overview

Advisory mode: the deliverable is a verified assessment, not a fix. Every claim gets traced in source or data before it is echoed back.

## Output contract

The response IS, in this order:

1. **Verdict first** — one or two sentences: is the claim/audit right overall, and what changes as a result.
2. **Findings** — one per claim, each labeled:
   - `Confirmed` — claim verified as stated
   - `Corrected` — symptom real, stated mechanism wrong; say exactly what the claim got wrong
   - `New` — defect discovered during verification that the claim missed
   - `Unverified` — could not be checked cheaply; say why, never assert it

   Each finding anchors to evidence: a repo-relative clickable reference like [tasks/page.tsx:68-72](app/(dashboard)/tasks/page.tsx#L68-L72) — always the full path, never a bare line number — or the exact read-only query that was run.
3. **Recommendation** — prioritized fix order with effort notes; name anything that should be batched to OpenCode.
4. **Stop** — end by offering to implement. Do not edit files, run migrations, or write to the database in this mode.

## Method

- Verify inline with Grep/Read/read-only SQL; no subagents (see the goal skill).
- Trace the stated root cause yourself — audits are often right about the symptom and wrong about the mechanism (wrong variable, wrong layer, wrong default).
- Prod Supabase contains real customer names/phones: SELECT only, and never paste customer rows into the response.
