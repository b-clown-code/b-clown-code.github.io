---
title: How I verify results
summary: Case studies in catching my own wrong numbers, and the habits that make that routine.
claims: [case-bf16, case-recall, case-s2-steering, vl-audit, case-incident, case-migration, case-bf16-streams]
cases:
  - { id: bf16, tag: Training, delta: "1.645 nats lower with FP32 · 5 of 5 streams" }
  - { id: recall, tag: Retrieval, delta: "Recall@5 89.47% → 73.68% (14/19)" }
  - { id: steering, tag: Memory, delta: "32/32 passed · 100% and 98.4% same answer on other questions" }
  - { id: audit, tag: Audit, delta: "All counts matched · rated unresolvable" }
  - { id: ops, tag: Reliability, delta: "12 corruption events in 33 seconds" }
  - { id: habits, tag: Habits, kind: practice }
---

# How I verify results

Each experiment in my lab states its pass/fail rule before it runs, the protocol is pinned by a hash so it can't drift afterwards, and a result that turns out wrong is corrected in place, with the original kept. AI agents do the hands-on work in my lab. I set these rules, and I require the follow-up checks before a result is accepted. These are the cases where that caught something.

## A training bug that made every comparison unfair {#bf16}

A language-model trainer had been running for weeks. Two of its checkpoints showed something odd:

- About 40% of the model's values were bit-identical between them.
- The optimizer's second-moment estimate had decreased in **0 of 135,031,104** entries.

The cause was weights and optimizer state held entirely in BF16, a low-precision 16-bit number format. At that precision, small updates round to nothing.

The bug wasn't just patched. A pre-registered paired test came first: the same data and the same budget, with FP32 master weights against pure BF16. In one seed pair, FP32 finished **1.645 nats** lower (a nat is a unit of training loss; lower is better) at 100M tokens and was better on all 5 validation streams. Every earlier result from that trainer is now marked compromised.

<figure data-chart="bf16-gap"></figure>

**Lesson:** a run that finishes without errors is not evidence that training worked.

## A retrieval score that was too good {#recall}

A search benchmark reported Recall@5 (how often the right passage is in the top five results) of 89.47%. Later, 4,786 dense vectors were found to have been orphaned by truncated IDs, so part of the system was silently returning nothing. With the IDs fixed, the honest number is **14/19 = 73.68%**, on a small test set. The correction is dated and sits next to the original claim.

## A passed test that didn't mean what it seemed {#steering}

A memory experiment passed its registered gate cleanly: 32 of 32 episodes correct, with the shuffled control at 0%. Before claiming the model "remembered", a follow-up check ran: ask *unrelated* questions with the same memory attached. It gave the same answer to 100% of other-attribute questions and 98.4% of other-entity questions. The memory was forcing one answer, not storing facts. The pass stands, but it is now described as "steering", not memory.

## Auditing the headline numbers {#audit}

For the [Verilog project](/projects/verilog-testbench-pipeline/), an independent audit re-derived every headline count from the raw evaluator records. All counts matched. The audit still rates them "unresolvable", because the raw waveform files weren't kept, and the project page says so.

## Reliability work on the lab itself {#ops}

- **Server freeze.** The timeline was rebuilt from system logs. A userspace memory test then reproduced **12 hardware data-corruption events in 33 seconds** with no GPU running, which ruled out the GPU as the trigger. The report says plainly that the exact root cause is not proven.
- **Storage migration.** A drive-to-drive migration ran with:
  - drive-identity checks before writing,
  - an explicit, approved list of 12 files to skip,
  - post-copy verification before the source was retired.

## Habits behind these {#habits}

- **Rules first.** Pass/fail rules are written before results exist, and the protocol is pinned by a SHA-256 hash.
- **Controls.** Every comparison runs against shuffled, empty or stock baselines.
- **Precise labels.** "Null", "invalid" and "infrastructure failure" are kept apart, so a broken harness is never read as a negative result.
- **Corrections in place.** Wrong results are corrected where they stand, with a date, and the original text is kept.
