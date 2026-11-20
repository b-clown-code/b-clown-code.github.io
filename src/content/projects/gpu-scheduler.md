---
title: gpuq — a GPU job scheduler for a shared workstation
summary: A queue that runs every GPU job on two shared cards as a resource-limited systemd unit, with approval rules, budgets and reboot recovery.
status: Complete
order: 4
area: infrastructure
metric: "325 jobs in its first week"
tags: [Python, SQLite, systemd, cgroups, ROCm, CUDA]
visual: queue
repo: null
claims: [gpuq-policy, gpuq-jobs, gpuq-size, gpuq-cooperative, gpuq-jobs-per-day, gpuq-features]
---

## The problem

One workstation, two GPUs (an AMD R9700 and an NVIDIA RTX 4060 Ti), and several automated agents and people who all want them. Before gpuq, jobs collided over GPU memory, a reboot silently dropped running work, and nothing stopped a long job from starting without review.

## What was built

<figure data-diagram="gpuq-states">
<figcaption>Job states in gpuq. HELD and BLOCKED are side states; an interrupted job is automatically requeued up to a fixed limit.</figcaption>
</figure>


- **One job, one unit.** Each job runs as a transient `systemd-run` unit with a memory cap and CPU quota, to limit the damage a runaway job can do to the host. The scheduler can restart without killing running jobs.
- **Approval by size.** A job's own time cap decides its tier: jobs capped at 6 hours or less run automatically, and longer ones need owner approval. Per-project daily and per-experiment weekly GPU-hour budgets back this up.
- **Approval bound to content.** An approval is tied to a hash of the command, environment, resources and script contents. If someone edits the script after approval, the job is blocked until it is amended and re-approved.
- **No self-review.** The reviewer must be a different session from the submitter.
- **Recovery.**
  - After a reboot, running jobs are marked interrupted and requeued automatically, at most three times per job.
  - The next job waits until GPU memory reads as released twice in a row.
  - Stops escalate from SIGTERM to SIGKILL after a grace period.
- **Fast lane.** Jobs of 10 minutes or less can go ahead of the queue within a time budget.
- **Night window.** Between 00:00 and 08:00 local time, a job still waiting for approval starts without it, once the card is free.
- **RAM admission.** A job starts only if its memory reservation fits the host's reservable RAM and the free memory (counting some swap) covers the request plus a headroom.
- **Long Bake.** A preemptible training campaign that spans many sessions. It uses idle GPU hours and gives the card back when regular work needs it, resuming from verified checkpoints. One owner approval covers the whole campaign.

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

Codebase: about 4,950 lines of Python and 145 test functions, counted 2026-11-19, after the Long Bake and RAM-admission additions. The tests include integration tests against real systemd transient units. The suite was not re-run for this count.

## Limits

- **Single host.** gpuq schedules one machine, not a cluster.
- **Cooperative approvals.** Any process running as the lab user could bypass the queue. I chose this to avoid root-owned tooling. It is a trust boundary, not a security boundary.
- **Snapshot numbers.** The job counts above come from the first week of operation, up to 2026-11-16 17:00 Arizona time (2026-11-17 00:00 UTC). The 12 jobs still queued or running at that moment are not in the outcome counts.

## Who did what

I set the policy, and I made the calls on each design question as the scheduler evolved: the tiers, the budgets, binding approvals to job content, the no-self-review rule, the recovery behaviour, and keeping approvals cooperative. I reviewed the code and tests. Version 2 came from problems that agents using the queue reported. AI coding agents wrote all of the code and tests under my direction ([how I use AI agents](/about/#how-i-use-ai-agents)).

## Code

Private. Design notes and a code walkthrough are available on request.
