---
title: Brandon Treglown
description: A personal research lab exploring machine learning, hardware, and the questions that arise along the way.
claims: [vl-e4b-vs-stock-e4b, vl-sim-pass-definition, vl-model-sizes, gpuq-jobs, corpus-v9]
---

# Brandon Treglown

Computer Systems Engineering, Arizona State University (B.S.E., December 2026).

This is my personal research lab, where I work with AI assistants to build the code behind my machine-learning and hardware projects. I follow questions that interest me, look closely at the results, and explore new ways forward when an experiment or development path doesn't work out.

## Selected work

**Simulation-checked Verilog testbench generation.** A pipeline that has a local language model write testbenches, compiles and simulates every one in Icarus Verilog, and trains on the ones that run. A fine-tuned 5 GB model's testbenches ran successfully on 559 of 600 held-out designs, against 54 of 600 for the stock model of the same size.
*Caveat: "ran" means the simulator exited cleanly and produced a waveform, not that the testbench fully checks the design.*
[Project →](/projects/verilog-testbench-pipeline/)

**GPU job scheduler.** A queue for a shared two-GPU workstation with resource limits, approval rules and reboot recovery. It has scheduled 325 jobs in its first week.
*Caveat: single host; approvals are cooperative, not enforced.*
[Project →](/projects/gpu-scheduler/)

**A provenance-tracked corpus of ancient-language text.** A pipeline that collects, catalogs and versions texts in Greek, Latin, Sanskrit and other ancient languages into hash-pinned training releases. The current release holds 745.2M training tokens and passed 27 of 27 acceptance checks.
*Caveat: no model claims; the trained models have not had a full evaluation.*
[Project →](/projects/ancient-language-corpus/)

[All projects](/projects/) · [How I verify results](/verification/) · [Research notebook](/notebook/)

## Contact

[Email](mailto:brandontreglown@gmail.com) · [GitHub](https://github.com/b-clown-code) · [LinkedIn](https://www.linkedin.com/in/brandon-treglown-443910202/)
