---
title: Brandon Treglown
description: A personal research lab exploring machine learning, hardware, and the questions that arise along the way.
claims: [vl-e4b-vs-stock-e4b, vl-sim-pass-definition, vl-model-sizes, cpu-sim-rtl-match, fpga-capture, gpuq-jobs]
---

# Brandon Treglown

Computer Systems Engineering, Arizona State University (B.S.E., December 2026).

This is my personal research lab. My focus is hardware and the systems around it, including digital design, verification and validation. I build the lab's code with AI agents, check the results closely, and look for a new way forward when an experiment doesn't work out.

## Selected work

**Simulation-checked Verilog testbench generation.** A pipeline that has a local language model write testbenches, compiles and simulates every one in Icarus Verilog, and trains on the ones that run. A fine-tuned 5 GB model's testbenches ran successfully on 559 of 600 held-out designs (preliminary result), against 54 of 600 for the stock model of the same size.
*Caveat: "ran" means the simulator exited cleanly and produced a waveform, not that the testbench fully checks the design.*
[Project →](/projects/verilog-testbench-pipeline/)

**8-bit pipelined CPU, with a browser lab checked against its Verilog.** An 8-bit CPU with a custom instruction set and a 5-stage pipeline, built by hand in 2024 without AI tools. A browser lab steps it cycle by cycle, and 330 of 330 programs match the RTL cycle for cycle.
*Caveat: the lab models the CPU core only; switches, buttons, the seven-segment driver and the Boolean Board's data bus are not simulated.*
[Project →](/projects/8-bit-pipelined-cpu/)

**FPGA hardware-in-the-loop data path.** A custom streaming core on a Zynq board, verified word for word against simulation. Five captures of 20,000 windows each showed 0 mismatched words.
*Caveat: the plumbing is correct, but the physical-computing hypothesis it was built for has not been tested yet.*
[Project →](/projects/fpga-hardware-in-the-loop/)

**GPU job scheduler.** A queue for a shared two-GPU workstation with resource limits, approval rules and reboot recovery. It has scheduled 325 jobs in its first week.
*Caveat: single host; approvals are cooperative, not enforced.*
[Project →](/projects/gpu-scheduler/)

[All projects](/projects/) · [How I verify results](/verification/) · [Research notebook](/notebook/)

## Contact

[Email](mailto:brandontreglown@gmail.com) · [GitHub](https://github.com/b-clown-code) · [LinkedIn](https://www.linkedin.com/in/brandon-treglown-443910202/)
