---
title: Brandon Treglown
description: A personal research lab exploring machine learning, hardware, and the questions that arise along the way.
claims: [vl-e4b-vs-stock-e4b, vl-sim-pass-definition, vl-model-sizes, cpu-sim-rtl-match, gpuq-jobs]
---

# Brandon Treglown

Computer Systems Engineering, Arizona State University (B.S.E., December 2026).

This is my personal research lab, where I work with AI assistants to build the code behind my machine-learning and hardware projects. I follow questions that interest me, look closely at the results, and explore new ways forward when an experiment or development path doesn't work out.

## Selected work

**Simulation-checked Verilog testbench generation.** A pipeline that has a local language model write testbenches, compiles and simulates every one in Icarus Verilog, and trains on the ones that run. A fine-tuned 5 GB model's testbenches ran successfully on 559 of 600 held-out designs (preliminary result), against 54 of 600 for the stock model of the same size.
*Caveat: "ran" means the simulator exited cleanly and produced a waveform, not that the testbench fully checks the design.*
[Project →](/projects/verilog-testbench-pipeline/)

**8-bit pipelined CPU, with a browser lab checked against its Verilog.** An 8-bit CPU with a custom instruction set and a 5-stage pipeline, built by hand in 2024 without AI tools. A browser lab steps it cycle by cycle, and 330 of 330 programs match the RTL cycle for cycle.
*Caveat: the lab models the CPU core only; switches, buttons, the seven-segment driver and the Boolean Board's data bus are not simulated.*
[Project →](/projects/8-bit-pipelined-cpu/)

**GPU job scheduler.** A queue for a shared two-GPU workstation with resource limits, approval rules and reboot recovery. It has scheduled 325 jobs in its first week.
*Caveat: single host; approvals are cooperative, not enforced.*
[Project →](/projects/gpu-scheduler/)

[All projects](/projects/) · [How I verify results](/verification/) · [Research notebook](/notebook/)

## Contact

[Email](mailto:brandontreglown@gmail.com) · [GitHub](https://github.com/b-clown-code) · [LinkedIn](https://www.linkedin.com/in/brandon-treglown-443910202/)
