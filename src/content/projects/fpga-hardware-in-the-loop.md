---
title: FPGA hardware-in-the-loop data path
summary: A custom streaming core on a Zynq board, verified word for word against simulation.
status: In progress
order: 4
area: hardware
metric: "5 × 20,000 windows, 0 mismatched words"
tags: [Verilog, Vivado, Zynq-7020, PYNQ, Python]
repo: null
claims: [fpga-sim, fpga-capture, fpga-timing, fpga-commissioning]
---

## 1. Streaming core on a PYNQ-Z2 board

### The problem

I wanted to stream data from custom programmable-logic hardware into host software for experiments. Before trusting any experiment built on top of it, the data path itself had to be shown to be correct: no dropped, reordered or corrupted words.

### What was built

<figure data-diagram="fpga-data-path">
<figcaption>Data path from the signal generator core on the board to the host. Golden vectors from simulation are the reference for the parity check.</figcaption>
</figure>

<figure class="photo">
<img src="/img/pynq-z2-board.jpg" alt="Photograph of a red PYNQ-Z2 development board with a Zynq-7020 chip under a heat sink, viewed from above." width="1050" height="1400" loading="lazy">
<figcaption>PYNQ-Z2 board used for the hardware-in-the-loop tests</figcaption>
</figure>


- **Hardware.** A Verilog streaming core with a pseudo-random (LFSR) signal source, built into a Zynq block design in Vivado 2024.1.
- **Golden reference.** A simulation testbench that compares the core against reference vectors.
- **Host tooling.** Python tooling to deploy bitstreams, capture streams over the network and check every captured word against the expected sequence.
- **Commissioning.** The board was commissioned before use: network throughput, a thermal soak, and a numbered evidence log for each step.

### Results

| Check | Result |
|---|---|
| Simulation against golden vectors | Pass, 16,195 checks |
| Timing at 100 MHz (Vivado) | Met, +1.657 ns slack; the board ran at 62.5 MHz |
| On-board captures | 5 × 20,000 windows: 0 mismatched words, 0 sequence gaps, 0 overflows |
| Repeat of the same seed | Bit-identical to the first capture |
| Board network throughput | About 645 / 525 Mbit/s raw TCP |
| 30-minute thermal soak | Pass, 52.9–56.4 °C |

<dl class="stats">
  <div><dt>captures</dt><dd>5</dd></div>
  <div><dt>windows</dt><dd>5 × 20,000</dd></div>
  <div><dt>mismatched words</dt><dd>0</dd></div>
  <div><dt>sequence gaps</dt><dd>0</dd></div>
</dl>

### Limits

- **What it proves.** The plumbing is correct. The physical-computing hypothesis it was built for has not been tested yet.
- **Single runs.** Throughput and soak figures are from one run each.
- **Clock.** Timing was closed for 100 MHz, but the board's fabric clock read back as 62.5 MHz (cause not investigated), so the captures ran at 62.5 MHz. 100 MHz operation has not been tested on the board.

### Who did what

I set up and commissioned the board, installed the hardware wrapper, and decided what the data path had to prove before anything was built on it. AI agents in my lab wrote the Verilog core, the testbench and the host tooling, and I reviewed the evidence.

## 2. 8-bit pipelined CPU (2024)

My earlier FPGA work, an 8-bit pipelined CPU with its own instruction set, now has its own page with an interactive lab: [8-bit pipelined CPU](/projects/8-bit-pipelined-cpu/).
