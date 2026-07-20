---
name: goal
description: Use at session start, when Mido invokes /goal, or before spawning any subagent while working in this project
---

# Session Goals & Cost Discipline

## Overview

96% of this plan's usage came from subagent-heavy sessions. Each subagent is a cold start that re-derives context and bills its own requests — spawning is the expensive path.

## Rules

- Default to inline tools (Grep/Read/Edit/Bash). Spawning a subagent requires one of: Mido asked for it, true parallelism across independent tasks, or worktree isolation is needed.
- When a subagent is justified but the task is simple (search, file listing, mechanical edits, single-scenario verification), pass `model: "haiku"`; use `model: "sonnet"` for mid-complexity work. Let it inherit Fable/Opus only when the task genuinely needs frontier reasoning.
- Heavy code generation is delegated to the OpenCode CLI (`deepseek-v4-flash-free`, small scoped runs), not to subagents.
- The production Supabase DB contains real customer names and phone numbers: SELECT only, never write, unless Mido explicitly requests a migration — and never paste customer rows into responses or files.
- Session priorities live in auto-memory (MEMORY.md), not in this skill — check there before starting work.

## Red flags

- "I'll spawn an agent to explore the codebase" → Grep/Glob inline first.
- An Agent call for a simple task with no `model` override.
- Polling or babysitting a subagent you didn't need to spawn.
