# CPU RTL equivalence harness

Checks the browser simulator (`src/lib/cpu/core.ts`, `isa.ts`) against the CPU's own Verilog.

- `vendor/`: unmodified files from `b-clown-code/8-bit-verilog-processor` at `75f2f79` (`fetch_rtl.sh` re-fetches them).
- `sysClock_passthru.v`: replaces the /8 clock divider so the CPU runs on the testbench clock.
- `tb_trace.v`: zeroes every register, latch and data-memory byte (FPGA power-on), then prints one line of settled signals per cycle and the final data memory.
- `programs/*.asm`: directed hazard and ISA tests. Each runs twice: once halting at PC 255, once with SW[3] looping.
- `../check_cpu.mjs`: runs the RTL with Icarus Verilog and the model with Node, compares the traces line by line, adds 300 seeded random programs, checks the assembler against `vendor/Pyssembler.py`, and writes `content/cpu-rtl-check.json`.

Run with `npm run check:cpu`; it needs `iverilog`, `vvp` and `python3`. Options: `--fuzz N`, `--cycles N`, `--seed N`, `--only <program>`.
