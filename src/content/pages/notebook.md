---
title: Research notebook
summary: Open research questions, with honest status. Most results here are null or unresolved.
claims: [nb-llm3001, nb-klm, nb-s2, nb-doc-to-weights]
---

# Research notebook

These are research questions I'm exploring about how language models store and pass information. They are experiments, not products. Most outcomes so far are null, and that's recorded here as plainly as the positives.

| Question | Status | What happened |
|---|---|---|
| Can two models communicate through a learned hidden-state channel instead of text? | Null | The interface worked (0.95–0.98 accuracy over 3 seeds, controls at or below 0.05). But plain text scored 1.000 on the same task, so the latent channel lost to the simple baseline. |
| Can a compressed weight matrix be recovered by training it to imitate the original model? | Positive, narrow | Test cross-entropy improved from 6.26 (rank-64 SVD) to 2.75, against 2.33 for the original, closing 89% of the gap. Single seed, one dataset. |
| Can a frozen model use a small learned memory of earlier context? | Pass, then steering | The registered gate passed (32 of 32 episodes; shuffled control 0%). A later unregistered check showed the memory forces its answer on unrelated questions, so it is steering, not recall. The follow-up binding gate was uninterpretable. See [verification](/verification/#steering). |
| Can a network turn a document into a weight patch in one step? | Null | Pilot scale: difference −0.019, interval −0.099 to +0.057. |

The latent-channel, memory and document-to-weights studies ran under pre-registered gates, hash-pinned protocols and shuffled/empty controls, mostly as GPU jobs on [gpuq](/projects/gpu-scheduler/). The weight-recovery study is the exception. It had no pre-registration and was not run through gpuq.
