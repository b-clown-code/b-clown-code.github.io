---
title: Simulation-checked Verilog testbench generation
summary: A pipeline that generates Verilog testbenches with a local LLM, keeps only the ones that simulate, and fine-tunes small models on them.
status: In progress
order: 1
area: ml
metric: "559 of 600 held-out designs simulate (stock model: 54 of 600)"
tags: [Python, Verilog, Icarus Verilog, LoRA, llama.cpp, ROCm]
visual: pipeline
repo: https://github.com/b-clown-code/verilog-llm
claims: [vl-paired-31b, vl-dataset-rows, vl-sim-pass-definition, vl-e4b-vs-stock-e4b, vl-e4b-passes-1-4, vl-best-stock-small, vl-vs-31b, vl-throughput, vl-abc-selection, vl-training-config, vl-verilogeval-negative, vl-distributed, vl-audit, vl-model-sizes]
---

## The problem

Writing a testbench for a hardware module is slow, and a language model's guess at one is only useful if it compiles and runs. I wanted training data where every example had actually run in a simulator, and a small model that could run on one workstation and write testbenches that compile and run in a simulator.

## What was built

<figure data-diagram="verilog-pipeline">
<figcaption>The pipeline from designs to held-out evaluation. Only testbenches that compile and simulate in Icarus Verilog go on to training.</figcaption>
</figure>


- **Generation pipeline.** It takes open-source Verilog modules, has a local model write a testbench for each, compiles and simulates it with Icarus Verilog, and keeps the passing testbenches, waveforms and explanations as training data.
- **Distributed work queue.** An HTTP coordinator hands pipeline stages to workers. Three machines ran as workers: the home server and two laptops. Workers can join mid-run and be drained and resumed without losing work.
- **Edge test.** The fine-tuned E2B model also ran on an Android phone. It was not wired in as a worker.
- **Dataset.** 11,366 training rows (48,978,720 characters) from about 3,400 distinct modules.
- **Training.** LoRA fine-tuning, a low-cost method that trains a small add-on to the model instead of the whole model: rank 16, 3 epochs, 1,452 steps. The E2B run took 2 h 39 min and the E4B run 4 h 3 min.
- **Evaluation harness.** Fresh held-out designs, balanced across four difficulty levels, scored by the same compile-and-simulate check. Paired bootstrap intervals compare models on identical designs.

## Results

**Simulation success on held-out designs** (the testbench compiled, ran and wrote a waveform; see Limits for what this does not show). Each model got the same designs. E2B and E4B are Google's small Gemma 4 models; "fine-tuned" means trained further on this project's data.

| Model | File size | Designs passed |
|---|---:|---:|
| Fine-tuned E4B | 5.2 GB | 559 / 600 (93.2%, preliminary) |
| Stock E4B | 8.7 GB | 54 / 600 (9.0%) |
| Best stock E2B build on passes 1–2 (UD-IQ3_XXS) | 2.4 GB | 214 / 600 (35.7%) |

Each model's 600 designs are two passes of 300 distinct designs.

Over four passes, the fine-tuned E4B scored 1,113 / 1,200 (92.8%, interval 91.1–94.1%).

**Against a much larger stock model.** On the same 300 designs, the 31B model (18.3 GB):

- The fine-tuned E4B scored 16.3 points higher.
- The fine-tuned E2B (IQ4_NL with imatrix build, 3.4 GB) scored 7.0 points higher, 251 vs 230 of 300. The original fine-tuned E2B build scored 233 of 300 on pass 1. Its paired interval barely excludes zero.
- The fine-tuned E2B decoded 3.4x faster (163 vs 48 tokens/s) and completed 3.2x more requests per minute (concurrency 1, same GPU).

The paired intervals are 95% bootstrap intervals from 10,000 resamples of one pass of 300 designs.

<figure data-chart="verilog-sim-passes"></figure>

<figure data-chart="verilog-paired-31b"></figure>


**What moved the number.** Changing how training loss was applied mattered more than anything else:

| Training recipe | Development success (of 300 designs) |
|---|---:|
| Loss on the whole conversation | 41.0% (123 / 300) |
| Loss on the response only | 56.3% (169 / 300) |
| Response-only loss, with training prompts matched to production prompts | 78.0% (234 / 300) |

<figure data-chart="verilog-recipes"></figure>


## Limits

- **What "pass" means.** The simulator exited cleanly and wrote a nonempty waveform. It does not show the testbench checks the design's behaviour.
- **What the comparison isolates.** Stock and fine-tuned models were quantized differently, so this is a comparison of deployable artifacts, not a measurement of training alone. The stock E4B also scored below the stock E2B. Part of its low score may be output-format failures rather than weak Verilog.
- **Audit.** An archive audit checked every headline count against the evaluator's records, and the totals matched. It still rates them "unresolvable": the raw waveform files from those runs were not kept, and some evaluation records are missing (counted as failures, not as passes).
- **No transfer to writing RTL.** On VerilogEval, a benchmark of 156 RTL-writing tasks, later testbench-specialized fine-tunes scored *below* their stock base models (E4B fine-tune 40/156 vs stock 78/156). The specialization did not carry over to writing RTL.

## Who did what

I directed the project. I set up the hardware and the three worker machines, chose what the pipeline and the experiments had to do, decided which models to train and how to compare them, and reviewed the results. AI coding agents wrote all of the code under my direction, at first in sessions I drove and later inside my [lab orchestrator](/projects/lab-orchestrator/), which also maintained the results archive and ran the audit ([how I use AI agents](/about/#how-i-use-ai-agents)).

## Evidence

The public snapshot holds one results file, at [the pinned commit](https://github.com/b-clown-code/verilog-llm/blob/21ad0d09393700fa85ba45250bfe3efb7f597f43/results/portfolio_2026-10-12/README.md). It lists the two-pass counts for the table above (559 / 600, 54 / 600, 214 / 600), the definition of a simulation pass and the quantization caveat. The coordinator and worker protocol is described in the [pipeline guide](https://github.com/b-clown-code/verilog-llm/blob/21ad0d09393700fa85ba45250bfe3efb7f597f43/docs/guides/pipeline.md). The four-pass, 31B, paired-interval and training-recipe results are not in the public snapshot.

## Code

Public, reviewed snapshot: [b-clown-code/verilog-llm](https://github.com/b-clown-code/verilog-llm) (MIT). Raw data, model weights and the full experiment history stay private.
