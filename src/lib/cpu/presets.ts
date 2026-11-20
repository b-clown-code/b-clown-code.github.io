// Example programs for the CPU lab. Every preset is run against the RTL by scripts/check_cpu.mjs.
export interface Preset { id: string; title: string; blurb: string; source: string }

export const PRESETS: Preset[] = [
  {
    id: 'fibonacci',
    title: 'Fibonacci',
    blurb: 'Ten iterations of a LINK/JUMP loop; BEQ exits through a jump-table slot. The result, 89, is stored at M[16].',
    source: `; Fibonacci: ten iterations, result stored at M[16]
LI R1, 0
LI R2, 1
LI R4, 10        ; iteration count
LI R5, 1
LI R7, 14        ; exit address
SB R7, 1         ; jump table slot 1 = exit
LINK 0           ; slot 0 = loop top (this LINK)
ADD R3, R1, R2
ADD R1, R2, R0
ADD R2, R3, R0
SUB R4, R4, R5
BEQ 1, R4, R0    ; done? -> M[1]
JUMP 0, 255      ; loop -> M[0]
SB R2, 16
`,
  },
  {
    id: 'forwarding',
    title: 'Forwarding paths',
    blurb: 'Dependent ALU operations issued back to back. Watch EX: R3 arrives through EX/MEM at distance 1, R1 through MEM/WB at distance 2. Result: R3 = 8, R4 = 13, R5 = 5.',
    source: `; Forwarding: producer and consumer at distance 1 (EX/MEM) and 2 (MEM/WB)
LI R1, 5         ; addr 1
LI R2, 3         ; addr 2
ADD R3, R1, R2   ; addr 3: R2 from EX/MEM (distance 1), R1 from MEM/WB (distance 2) -> 8
ADD R4, R3, R1   ; addr 4: R3 from EX/MEM -> 13
SUB R5, R4, R3   ; addr 5: R4 from EX/MEM, R3 from MEM/WB -> 5
NOP              ; addr 6
NOP              ; addr 7
SB R5, 10        ; addr 8: M[10] = 5
`,
  },
  {
    id: 'load-use',
    title: 'Load-use stall',
    blurb: 'LB followed by a dependent ADD stalls one cycle, then reads a stale value: a hazard in the original RTL. The same sequence padded with NOPs reads the loaded 42 correctly.',
    source: `; Load-use: the consumer one instruction after LB stalls 1 cycle and still reads a stale value
LI R1, 42        ; addr 1
SB R1, 10        ; addr 2: M[10] = 42
LB R2, 10        ; addr 3
ADD R3, R2, R2   ; addr 4: stalls 1 cycle; RTL hazard: R3 = 0, not 84
LB R4, 10        ; addr 5
NOP              ; addr 6
NOP              ; addr 7
NOP              ; addr 8
ADD R5, R4, R4   ; addr 9: padded, no stall, R5 = 84
`,
  },
  {
    id: 'branch-flush',
    title: 'Branch and flush',
    blurb: 'A taken BEQ redirects the PC through jump-table slot 1 and flushes the wrong-path LI instructions (R4 and R5 stay 0). A following not-taken BEQ costs a single stall cycle.',
    source: `; Branch flush: taken BEQ discards wrong-path instructions, not-taken BEQ costs 1 stall
LI R1, 4         ; addr 1
LI R2, 4         ; addr 2
LI R7, 10        ; addr 3: branch target
SB R7, 1         ; addr 4: slot 1 = 10
BEQ 1, R1, R2    ; addr 5: equal, taken -> M[1]
LI R3, 99        ; addr 6: wrong path, flushed (R3 is rewritten at addr 10)
LI R4, 99        ; addr 7: wrong path, flushed
LI R5, 99        ; addr 8: wrong path, flushed
LI R6, 99        ; addr 9: wrong path, flushed
LI R3, 1         ; addr 10: branch target
BEQ 1, R1, R3    ; addr 11: 4 != 1, not taken
LI R6, 7         ; addr 12
`,
  },
  {
    id: 'jump-limit',
    title: 'Jump limit',
    blurb: 'JUMP 0, 3 takes the branch while the limit exceeds jumpCount, which increments on every JUMP and is never reset. The body runs four times: R1 = 4 is stored at M[10] and jumpCount ends at 4.',
    source: `; Jump limit: JUMP is taken while 3 > jumpCount (jumpCount = 0, 1, 2), then falls through
LI R2, 1         ; addr 1
LINK 0           ; addr 2: slot 0 = loop top
ADD R1, R1, R2   ; addr 3
JUMP 0, 3        ; addr 4: taken 3 times
NOP              ; addr 5
SB R1, 10        ; addr 6: M[10] = 4 (NOP above avoids the distance-2 store hazard)
`,
  },
  {
    id: 'store-hazard',
    title: 'Store hazard',
    blurb: 'SB of a register written 1, 2 and 3 instructions earlier. At distance 2 the stored value is stale: a hazard in the original RTL. Distances 1 and 3 store 9 and 13 correctly; distance 2 stores 0 instead of 11.',
    source: `; Store hazard: SB at distance 1 (correct), 2 (stale), 3 (correct)
LI R1, 9         ; addr 1
SB R1, 20        ; addr 2: distance 1, M[20] = 9
LI R2, 11        ; addr 3
NOP              ; addr 4
SB R2, 21        ; addr 5: distance 2, RTL hazard: stale R2 (0) stored, M[21] = 0
LI R3, 13        ; addr 6
NOP              ; addr 7
NOP              ; addr 8
SB R3, 22        ; addr 9: distance 3, M[22] = 13
`,
  },
  {
    id: 'repo-program',
    title: 'Repository program',
    blurb: 'The original test program from the CPU repository, unmodified. Each of the 14 instructions appears once in the source; JUMP 4, 5 sends execution back to the LINK five times before it falls through.',
    source: `; Original test program from the CPU repository (program.txt), verbatim
SB R1, 1
LB R1, 1
LI R2, 2
DISPLAY R3
LINK 4
JUMP 4, 5
BEQ 4, R1, R2
AND R3, R1, R2
OR R7, R6, R5
ADD R5, R4, R3
SUB R7, R1, R7
SLT R5, R3, R2
NOR R1, R2, R3
SETEQUAL R2, R3, R4
`,
  },
];
