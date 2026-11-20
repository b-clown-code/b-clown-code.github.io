---
title: labctl — running a research lab with AI agents
summary: A deterministic daemon that wakes short-lived AI agents from durable state, with fencing, idempotent writes, crash recovery and fault injection.
status: In progress
order: 3
area: infrastructure
metric: "533 agent wakes in 5.92 days"
tags: [Python (stdlib), SQLite, systemd, event sourcing]
repo: null
claims: [labctl-wakes, labctl-size, labctl-tests-pass, labctl-wakes-detail]
---

## The problem

I run several research projects at once, with AI coding agents doing all of the implementation. Long-running agent sessions drift, lose context and fail in ways that are hard to detect. I wanted the agents to be disposable and the *state* to be durable. Then a crash, a reboot or a bad agent could not corrupt the lab's record of what was decided and what was run.

## What was built

<figure data-diagram="labctl-architecture">
<figcaption>Owner, Director, one Lead per project, and their Tracks. A daemon that makes no model calls dispatches wakes from a durable event log; GPU access goes only through gpuq.</figcaption>
</figure>


- **Deterministic core.** A daemon with no AI model calls decides when to wake an agent, based on an event-sourced record in SQLite. Every wake starts a fresh session, with a briefing rebuilt from that durable state.
- **Fencing.** Each wake carries a capability token. Commands that change state are refused unless that wake is still the live one. This stops a stale or restarted agent from writing over newer work.
- **Idempotent writes.** Tasks and reports carry a unique key per creator, so a retried command cannot create a duplicate.
- **Crash recovery.**
  - The result is written before state is updated.
  - Agent processes survive a daemon restart.
  - The daemon tells a reboot apart from a crash.
  - Unacknowledged messages are redelivered.
  - Three failures in a row put an agent on hold and ask me for a decision.
- **Fault injection.** A test hook kills a wake right after a named operation. Scenario tests then check that the system recovers.
- **Guard rails.**
  - At most two live agents, and one per repository.
  - A usage budget gate.
  - Agents can't push to git, and get GPU access only through [gpuq](/projects/gpu-scheduler/).
  - A read-only web status board bound to localhost.

## Results

| Measure | Value |
|---|---:|
| Agent wakes, 2026-11-10 to 2026-11-15 (5.9 days) | 533 |
| GPU-job-completion wakes | 79 |
| Code | about 6,500 lines of standard-library Python |
| Tests | 425 passing (372 test functions, some parametrized) |

<figure data-chart="labctl-wakes-role"></figure>

<figure data-chart="labctl-triggers"></figure>

<figure class="shot">
<img src="/img/labctl-board.png" alt="Screenshot of the labctl status board showing a summary banner and a "Needs you" list with a pending decision and a GPU approval request, each with a copyable command." width="1080" height="590" loading="lazy">
<figcaption>The read-only status board (test data)</figcaption>
</figure>


## Limits

- **Young.** It has run for about a week. The "before" metrics are a baseline for a planned streamlining pass, not a record of long-term reliability.
- **Same-user process model.** Agents run as the same OS user, so the guard rails are policy, not isolation. Prompt injection is a known, unmitigated risk.
- **Not built yet.** Several designed features are not built: quotas, session resume and a randomized chaos suite.

## Who did what

I decided how the lab should run:
- the role hierarchy,
- what is durable and what is disposable,
- the admission limits,
- what agents may and may not do.

I approve the design changes and review the results. AI agents wrote all of the code and tests.

## Code

Private. Available to walk through in an interview.
