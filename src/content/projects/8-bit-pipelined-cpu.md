---
title: 8-bit pipelined CPU, with a browser lab checked against its Verilog
summary: An 8-bit Harvard CPU with a custom 16-bit instruction set and a 5-stage pipeline, designed in 2024. The browser lab steps the pipeline cycle by cycle and lets you program the earlier single-cycle version in binary on its switches; both are checked against the original Verilog.
status: Complete
order: 2
area: hardware
metric: "330 of 330 programs match the RTL cycle for cycle"
tags: [Verilog, Vivado, Artix-7, Spartan-7, Icarus Verilog, TypeScript]
repo: https://github.com/b-clown-code/8-bit-verilog-processor
visual: cpu
lab: cpu
claims: [cpu-design, cpu-isa, cpu-boards, cpu-hazards, cpu-sim-rtl-match, cpu-front-panel]
---

## Overview

I designed this CPU in 2024, before my AI-agent work. It is an 8-bit Harvard-architecture processor with a custom 16-bit instruction set of 14 instructions and a 5-stage, MIPS-style pipeline. It started as a single-cycle design on a Nexys A7 (Artix-7) board; I then pipelined it and ported it to a Real Digital Boolean Board (Spartan-7).

The 8-bit CPU lab above runs the design in the browser, in two modes:

- **Pipeline** steps the 5-stage version, from December 2024, one clock at a time.
- **Front panel** runs the earlier single-cycle version, from November 2024, the way I first tested it: one 16-bit instruction on the switches, one press of the clock button.

Neither mode is a re-imagining of the CPU. For each version, a checker runs the original Verilog in Icarus Verilog next to the browser model and compares the two (see [Verification](#verification)). The lab is a simulator rather than an emulator: it models the hardware's internal state, not only the results a program would see.

### Reading the pipeline view

- **Chips** along the top are the instructions in flight, one per stage. A dashed chip in IF is the word being fetched; it gets a pipeline slot only when IF/ID latches it.
- **Wires** light up when they carry a value that cycle. Teal marks a forwarding path into the ALU, or the store-data bypass. Red marks a taken branch.
- **Pipeline registers** (the tall bars) turn purple when a stall holds IF/ID, and red when a taken branch flushes them.
- **Pipeline diagram.** Each row is one instruction and each column one clock. Stalls show as repeated stages, and flushed instructions show ×. Click any column to return to that cycle.
- **Data memory** slots 0 to 7 are outlined because JUMP and BEQ take their target address from them.

### Programming in binary

Before I wrote the assembler, I tested the CPU by hand. When the single-cycle version finished its stored program, it switched to switch mode: it read each instruction from the board's 16 slide switches and executed it when I pressed the centre button, BTNC. The front panel turns this into a challenge. Each of its four tasks has a par number of button presses, the reference card lists the opcodes, and the switch colours mark the instruction fields. As on the board, jumps and branches do nothing in switch mode.

## Architecture

| Unit | Description |
|---|---|
| Program counter | 8 bits. Increments every cycle unless decode stalls; a taken branch or jump loads it from data memory. |
| Instruction memory | 256 × 16-bit words, read combinationally. Address 0 holds a padding word; programs start at address 1. |
| Register file | Eight 8-bit registers, R0 to R7. Writes to R0 are discarded. Write-back data is bypassed to the decode-stage read ports. |
| ALU | AND, OR, ADD, SUB, unsigned set-less-than, NOR, set-equal. Its zero output decides BEQ. |
| Data memory | 256 bytes, combinational read and clocked write. |
| Pipeline registers | IF/ID, ID/EX, EX/MEM, MEM/WB. |

### Instruction format

Every instruction is one 16-bit word. Fields overlap: register-register instructions use RA and RB inside the immediate field.

| Bits | 15–11 | 10–8 | 7–0 | 5–3 | 2–0 |
|---|---|---|---|---|---|
| Field | funct | RT (target) | immediate | RA | RB |

## Instruction set reference

| Instruction | funct | Operation | Notes |
|---|---|---|---|
| `AND RT, RA, RB` | `00000` | RT ← RA & RB | |
| `OR RT, RA, RB` | `00001` | RT ← RA \| RB | |
| `ADD RT, RA, RB` | `00010` | RT ← RA + RB | 8-bit wrap-around |
| `SUB RT, RA, RB` | `00011` | RT ← RA − RB | |
| `SLT RT, RA, RB` | `00100` | RT ← (RA < RB) ? 1 : 0 | unsigned compare |
| `NOR RT, RA, RB` | `00101` | RT ← ~(RA \| RB) | |
| `SETEQUAL RT, RA, RB` | `00110` | RT ← (RA = RB) ? 1 : 0 | |
| `LI RT, imm` | `01000` | RT ← imm | ALU computes imm + 0 |
| `SB RT, addr` | `10000` | M[addr] ← RT | |
| `LB RT, addr` | `10001` | RT ← M[addr] | stalls a dependent instruction for one cycle |
| `LINK addr` | `10010` | M[addr] ← address of this LINK | records a loop target |
| `JUMP slot, limit` | `10011` | if limit > jumpCount: PC ← M[slot]; jumpCount ← jumpCount + 1 | jumpCount is never reset |
| `BEQ slot, RA, RB` | `10100` | if RA = RB: PC ← M[slot] | |
| `DISPLAY RT` | `11000` | no effect in the core | the board display is driven by switches |

Branch and jump targets are never encoded in the instruction. A program first stores the target address in a data-memory slot, with LINK for a backward target or with LI and SB for a forward one, and then names the slot. The examples in the lab use both patterns.

## Pipeline behaviour

- **Forwarding.** The ALU inputs take a result from the EX/MEM register when the instruction one ahead writes the register being read, and from MEM/WB when the instruction two ahead does. The decode stage also reads write-back data directly through the register-file bypass.
- **Load-use stall.** When the instruction in EX is LB and the instruction in decode reads its target register, IF/ID and the PC hold for one cycle and a bubble enters EX.
- **Branches and jumps.** BEQ and JUMP resolve in the memory stage, where the target is read from data memory. While one is in EX, fetch stalls. A taken branch or jump costs 3 cycles, and one not taken costs 1. A load-use stall also costs 1.

### Hazards the design does not cover

I wrote and tested the processor myself, but I did not build thorough testbenches for it. Later, using AI coding assistants, I ran the processor's own Verilog through a much more comprehensive set of tests in Icarus Verilog. The tests caught three bugs in my hazard logic:

- **Load-use.** The pipeline correctly stalls after a load, but forwarding passes the load instruction's ALU output instead of the byte it read. An instruction 1 or 2 places after LB therefore reads a stale value. The *Load-use stall* example in the lab shows it.
- **Store after write.** Store data is only bypassed from write-back into the memory stage. An SB 2 instructions after the instruction that writes its register stores the old value. See the *Store hazard* example.
- **Same register twice.** The register-file bypass checks RA first and RB only if RA does not match. When RA = RB, only RA gets the new value, so ADD R6, R5, R5 can add a new and an old copy of R5.

The later Boolean Board version has the same stall, forwarding and register-file logic, and gives the same results in simulation. These are simulation results; I have not reproduced them on the boards.

### How I would fix it

The RTL is kept as I wrote it, and the lab reproduces it exactly. Each fix is small:

1. **Load-use.** On the MEM/WB forwarding path, forward the write-back value (the load data for LB) instead of the ALU result.
2. **Store after write.** Forward the store data in EX through the same multiplexers as the ALU operands, instead of only bypassing write-back into the memory stage.
3. **Same register twice.** Make the two register-file bypass checks independent, so RA and RB can both receive the write-back value.

## Verification

The browser model is a TypeScript translation of the RTL at [the pinned commit](https://github.com/b-clown-code/8-bit-verilog-processor/tree/75f2f7971bfd358b03445c36ee76adcb8b560803). A checker, written by AI coding agents and reviewed by me, does the following:

- Runs the unmodified Verilog in Icarus Verilog. A small testbench zeroes every register and memory byte at start-up, as the FPGA does, and prints 35 internal signals each cycle.
- Runs the browser model on the same program and compares the two traces line by line, then compares the final data memory.
- Covers the directed hazard tests, every example in the lab and 300 seeded random programs. Each directed program runs twice, once halting at the end of instruction memory and once looping (switch 3 on).
- Checks the lab's assembler against the original Python assembler, `Pyssembler.py`, on every program written in the original syntax.

Result: 330 of 330 programs, 67,830 cycles, 0 mismatches. The assembler output matched `Pyssembler.py` on 11 of 11 programs. To confirm that the checker can fail, I had 8 deliberate bugs planted in the model, such as dropping MEM/WB forwarding or changing the LINK address, and each one was caught.

The front panel is checked the same way against the single-cycle Verilog (`Top.v`, last edited in November 2024; not yet published). The testbench makes three changes so that simulation matches the board: the 10 ms button debouncer becomes a one-clock pulse, incomplete sensitivity lists become `@(*)` as synthesis treats them, and registers start at zero as the FPGA's do. Result: 18 of 18 programs and 368 button presses match, covering the four challenge solutions, every opcode and 300 random presses. One finding from the RTL: the latched instruction keeps executing on every internal clock until the next press. An instruction that reads its own target therefore either settles (`ADD R1, R1, R1` doubles until it reaches 0) or never does (`ADD R1, R1, R2` gives a different value for a different press timing). The lab reproduces the settled values and warns about the rest. 3 deliberately planted model bugs were each caught.

## Hardware and tools

- **Boards.** The single-cycle version ran on a Nexys A7 (Artix-7), programmed through its switches in switch mode, with results on three digits of the seven-segment display. The pipelined version also ran on the Nexys A7, where switches select a register or memory address for the display, and was then ported to a Real Digital Boolean Board (Spartan-7) with a custom data bus out to a display module.
- **Toolchain.** Assemblers in C++ and Python turn assembly into the memory image. A separate tool converts text strings into assembly.

## Limits

- The pipeline view models the CPU core only. Switches, buttons, the seven-segment driver and the Boolean Board's data bus are not simulated; its display shows a register the way the board's register view does.
- The front panel starts in switch mode with an empty stored program. On the board, the CPU first ran whatever program was loaded. The last one in the project is a LINK/JUMP test whose jump counter is a combinational loop (`jumpCount = jumpCount + 1` inside `always @(*)`), so its end state is not defined by the RTL and is not modelled.
- The RTL contains latches in its decode logic and a branch signal assigned in two places. Icarus Verilog resolves these deterministically, and the lab follows Icarus. A synthesized design could behave differently in those corners.
- `DISPLAY` shows a register on the seven-segment display in the single-cycle version, but decodes to no operation in the pipelined core.

## Who did what

**I designed and built the CPU, its instruction set and the assemblers in 2024, without AI tools.** For the browser lab, I chose to keep the RTL unchanged and I reviewed the results. AI coding agents wrote the browser models, both modes of the lab, the RTL checkers and this page's first draft under my direction ([how I use AI agents](/about/#how-i-use-ai-agents)).

Code: [b-clown-code/8-bit-verilog-processor](https://github.com/b-clown-code/8-bit-verilog-processor). Files checked above, at the pinned commit: [Control.v](https://github.com/b-clown-code/8-bit-verilog-processor/blob/75f2f7971bfd358b03445c36ee76adcb8b560803/Control.v) (stall and forwarding logic), [Registers.v](https://github.com/b-clown-code/8-bit-verilog-processor/blob/75f2f7971bfd358b03445c36ee76adcb8b560803/Registers.v) (register-file bypass) and [Pyssembler.py](https://github.com/b-clown-code/8-bit-verilog-processor/blob/75f2f7971bfd358b03445c36ee76adcb8b560803/Pyssembler.py) (assembler).
