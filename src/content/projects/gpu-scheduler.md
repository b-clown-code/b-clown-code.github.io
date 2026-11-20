---
title: gpuq — a GPU job scheduler for a shared workstation
summary: A queue that runs every GPU job on two shared cards as a resource-limited systemd unit, with approval rules, budgets and reboot recovery.
status: Live
order: 2
area: infrastructure
metric: "325 jobs in its first week"
tags: [Python, SQLite, systemd, cgroups, ROCm, CUDA]
visual: queue
repo: null
claims: [gpuq-policy, gpuq-jobs, gpuq-size, gpuq-tests-pass, gpuq-cooperative, gpuq-jobs-per-day]
---

## The problem

One workstation, two GPUs (an AMD R9700 and an NVIDIA RTX 4060 Ti), and several automated agents and people who all want them. Before gpuq, jobs collided over GPU memory, a reboot silently dropped running work, and nothing stopped a long job from starting without review.

## What was built

<figure data-diagram="gpuq-states">
<figcaption>Job states in gpuq. HELD and BLOCKED are side states; an interrupted job is automatically requeued up to a fixed limit.</figcaption>
</figure>


- **One job, one unit.** Each job runs as a transient `systemd-run` unit with a memory cap and CPU quota, to limit the damage a runaway job can do to the host. The scheduler can restart without killing running jobs.
- **Approval by size.** A job's own time cap decides its tier: short jobs run automatically, and longer ones need review. Per-project daily and per-experiment weekly GPU-hour budgets back this up.
- **Approval bound to content.** An approval is tied to a hash of the command, environment, resources and script contents. If someone edits the script after approval, the job is blocked until it is amended and re-approved.
- **No self-review.** The reviewer must be a different session from the submitter.
- **Recovery.**
  - After a reboot, running jobs are marked interrupted and requeued automatically, at most three times per job.
  - The next job waits until GPU memory reads as released twice in a row.
  - Stops escalate from SIGTERM to SIGKILL after a grace period.
- **Fast lane.** Jobs of 10 minutes or less can go ahead of the queue within a time budget.

## Results

| Measure | Value |
|---|---:|
| Jobs scheduled, 2026-11-10 to 2026-11-16 | 325 |
| Completed | 234 |
| Failed (the job's own command failed) | 40 |
| Cancelled | 32 |
| Timed out | 4 |
| Interrupted by reboot | 3 |
| GPU run time | about 98 hours |

<figure data-chart="gpuq-outcomes"></figure>

<figure data-chart="gpuq-per-day"></figure>

Codebase: about 3,300 lines of Python and 88 test functions. The tests include integration tests against real systemd transient units. All 88 pass.

## Limits

- **Single host.** gpuq schedules one machine, not a cluster.
- **Cooperative approvals.** Any process running as the lab user could bypass the queue. I chose this to avoid root-owned tooling. It is a trust boundary, not a security boundary.
- **Snapshot numbers.** The job counts above come from the first week of operation.

## Who did what

I set the policy, and I made the calls on each design question as the scheduler evolved: the tiers, the budgets, binding approvals to job content, the no-self-review rule, the recovery behaviour, and keeping approvals cooperative. AI agents wrote all of the code and tests, and I reviewed them. Version 2 came from problems that agents using the queue reported.

## Code

Private. Design notes and a code walkthrough are available on request.
