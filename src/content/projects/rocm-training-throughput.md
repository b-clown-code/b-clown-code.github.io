---
title: Training throughput on an AMD GPU
summary: Measured which kernel and memory options actually speed up model training on an AMD R9700 under ROCm, with correctness checks on every change.
status: Complete
order: 5
area: ml
metric: "1.289× training speed at 0.867× memory"
tags: [PyTorch, ROCm, Liger kernels, profiling]
repo: null
claims: [rocm-baseline, rocm-liger, rocm-rejected]
---

## The problem

Most training-performance advice is written for NVIDIA GPUs. I needed to know which optimizations actually help on an AMD R9700 running ROCm, and none of them could change the model's numerical behaviour.

## What was built

- **Benchmark harness.** It trains a fixed 355.6M-parameter model under different kernel and memory settings and records throughput, peak memory and power.
- **Correctness gates.** Every candidate had to pass three checks before its speed counted:
  - loss parity over 100 steps,
  - gradient agreement (cosine ≥ 0.99997),
  - a bit-identical result after resuming from a checkpoint.

## Results

Every configuration is one seed, run for up to 300 steps; only the baseline was repeated (3 runs).

| Configuration | Speed | Peak memory | Adopted |
|---|---:|---:|---|
| Baseline (12,985 tokens/s; 3 runs within 0.21%) | 1.00x | 1.00x | — |
| Fused RMSNorm + RoPE + SwiGLU kernels | 1.289x | 0.867x | Yes, for speed |
| The same, plus feed-forward checkpointing | 1.179x | 0.669x | Yes, for memory |
| TunableOp GEMM tuning | 1.044x | — | No: below the adoption bar, and tuning stalled |
| BLAS backend selection | ~1.00x | — | No effect |

<figure data-chart="rocm-speed"></figure>

<figure data-chart="rocm-memory"></figure>


## Limits

- **Single seed.** Runs were one seed and up to 300 steps each.
- **One model size.** Results are for a single model size on a single GPU.

## Who did what

I chose the questions and set the adoption rules. AI agents in my lab wrote the harness and ran the measurements, and I reviewed the results.
