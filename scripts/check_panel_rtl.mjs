// Compare the front-panel model (src/lib/cpu/single.ts) with the November 2024 single-cycle RTL in Icarus Verilog.
// Local only: needs iverilog, vvp, unzip and the owner's project zip (not committed; default ./single_cycle_8bit.zip,
// or set PANEL_RTL_ZIP). Writes content/cpu-panel-rtl-check.json.
//
// Changes made to a temporary copy of Top.v, so that simulation matches the synthesized board:
//  1. debouncer (10 ms filter) -> one-clock pulse on the rising edge of BTN, so a press costs 8 cycles, not 2 million;
//  2. always blocks with incomplete sensitivity lists -> @(*), which is how Vivado synthesizes them
//     (Icarus would otherwise honour the literal list, e.g. the display latch would miss updates);
//  3. registers start at 0, as FPGA flip-flops and block RAM do after configuration.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assemble } from '../src/lib/cpu/isa.ts';
import { panelPowerOn, clockIn, PANEL_LEDS, CHALLENGES } from '../src/lib/cpu/single.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ZIP = process.env.PANEL_RTL_ZIP || path.join(ROOT, 'single_cycle_8bit.zip');
const TOP = 'eight_bit_cpu_single_file/eight_bit_cpu_single_file.srcs/sources_1/new/Top.v';
if (!fs.existsSync(ZIP)) { console.error(`check:panel-rtl: ${ZIP} not found (set PANEL_RTL_ZIP)`); process.exit(2); }

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'panel-rtl-'));
const unzipText = (p) => execFileSync('unzip', ['-p', ZIP, p], { encoding: 'utf8' });
let top = unzipText(TOP);
const topSha = (await import('node:crypto')).createHash('sha256').update(top).digest('hex');
// Empty stored program (all zeros, as uninitialised block RAM on the FPGA): the CPU enters SWmode at PC 1.
// The project's own add3.mem is not used: its JUMP path has a combinational loop (jumpCount = jumpCount + 1
// inside always @(*)), so its end state is not defined by the RTL and Icarus would not terminate.
fs.writeFileSync(path.join(tmp, 'add3.mem'), '0000000000000000\n'.repeat(256));

// 1. debouncer -> edge pulse
const dbStart = top.indexOf('module debouncer(');
const dbEnd = top.indexOf('endmodule', dbStart) + 'endmodule'.length;
if (dbStart < 0) throw new Error('debouncer module not found');
top = top.slice(0, dbStart) + `module debouncer(output trans_dn, input switch_input, input clk);
   reg prev = 0;
   always @ (posedge clk) prev <= switch_input;
   assign trans_dn = switch_input & ~prev; // shim: one pulse per press
endmodule` + top.slice(dbEnd);
// 2. sensitivity lists -> @(*)
const lists = [/always @ \(instr,SWinstr\)/, /always @\(o_Areg, o_Breg\)/, /always @\(BCD_result_extended\)/, /always @ \(ALUop,opA, opB\)/];
for (const re of lists) { if (!re.test(top)) throw new Error(`sensitivity list not found: ${re}`); top = top.replace(re, 'always @(*)'); }
fs.writeFileSync(path.join(tmp, 'top.v'), top);

fs.writeFileSync(path.join(tmp, 'tb.v'), `\`timescale 1ns/1ps
module tb;
  reg clk = 0; always #5 clk = ~clk;
  reg [15:0] SW = 0; reg BTN = 0;
  wire [15:0] LED; wire [7:0] Seg, Display;
  Control dut (.LED(LED), .Seg(Seg), .Display(Display), .SW(SW), .BTN(BTN), .clk(clk));
  reg [15:0] prog [0:4095];
  integer n, i, k, waitc;
  task dump(input integer k);
    begin
      $write("P %0d", k);
      for (i = 0; i < 8; i = i + 1) $write(" %0d", dut.r0.regFile[i]);
      $write(" D %0d L %0d M %0d\\n", dut.hundreds * 100 + dut.tens * 10 + dut.ones, LED, dut.SWmode);
    end
  endtask
  initial begin
    for (i = 0; i < 8; i = i + 1) dut.r0.regFile[i] = 0;
    for (i = 0; i < 256; i = i + 1) dut.m0.dataMem[i] = 0;
    dut.sysClock.counter = 0; dut.sysClock.clk25reg = 0; dut.branch = 0;
    dut.ones = 0; dut.tens = 0; dut.hundreds = 0;
    if (!$value$plusargs("N=%d", n)) n = 0;
    if (!$value$plusargs("WAIT=%d", waitc)) waitc = 400;
    if (n > 0) $readmemh("stim.hex", prog);
    repeat (20 * 32) @(posedge clk);           // power-on: empty program, SWmode from PC 1
    dump(-1);
    for (k = 0; k < n; k = k + 1) begin
      SW = prog[k]; repeat (4) @(posedge clk);
      BTN = 1; repeat (4) @(posedge clk); BTN = 0;
      repeat (waitc * 32) @(posedge clk);       // waitc internal (clk/32) cycles before the next press
      dump(k);
    end
    $write("MEM"); for (i = 0; i < 256; i = i + 1) $write(" %0d", dut.m0.dataMem[i]); $write("\\n");
    $finish;
  end
endmodule
`);
execFileSync('iverilog', ['-g2012', '-o', path.join(tmp, 'sim'), path.join(tmp, 'tb.v'), path.join(tmp, 'top.v')], { cwd: tmp, stdio: ['ignore', 'pipe', 'pipe'] });

function rtl(words, wait = 400) {
  fs.writeFileSync(path.join(tmp, 'stim.hex'), words.map((w) => w.toString(16).padStart(4, '0')).join('\n') + '\n');
  const out = execFileSync('vvp', ['-n', path.join(tmp, 'sim'), `+N=${words.length}`, `+WAIT=${wait}`], { cwd: tmp, encoding: 'utf8', maxBuffer: 64 << 20 });
  const presses = [], lines = out.split('\n');
  for (const l of lines) {
    const m = /^P (-?\d+) ((?:\d+ ){8})D (\d+) L (\d+) M (\d+)/.exec(l);
    if (m) presses.push({ k: +m[1], regs: m[2].trim().split(' ').map(Number), display: +m[3], led: +m[4], swmode: +m[5] });
  }
  const memLine = lines.find((l) => l.startsWith('MEM'));
  if (!memLine || presses.length !== words.length + 1) throw new Error(`simulation output incomplete:\n${out.slice(0, 2000)}`);
  return { presses, mem: memLine.trim().split(' ').slice(1).map(Number) };
}

const results = [];
let mismatches = 0, comparedPresses = 0, skippedUnstable = 0;
function compare(name, words, { expectUnstable = false } = {}) {
  const r = rtl(words);
  let s = panelPowerOn();
  const bad = [];
  const p0 = r.presses[0];
  if (p0.regs.join() !== s.regs.join() || p0.display !== s.display || p0.led !== PANEL_LEDS || p0.swmode !== 1) bad.push(`power-on: rtl ${JSON.stringify(p0)} model regs ${s.regs} display ${s.display} led ${PANEL_LEDS}`);
  let unstableSeen = false;
  words.forEach((w, i) => {
    const { state, effect } = clockIn(s, w);
    s = state;
    if (effect.unstable) { unstableSeen = true; skippedUnstable++; return; }
    if (unstableSeen) return; // registers after an unsettled op depend on press timing
    comparedPresses++;
    const p = r.presses[i + 1];
    if (p.regs.join() !== s.regs.join() || p.display !== s.display) bad.push(`press ${i} (${w.toString(2).padStart(16, '0')}): rtl regs ${p.regs} display ${p.display}; model regs ${s.regs} display ${s.display}`);
  });
  if (!unstableSeen && r.mem.join() !== s.mem.join()) bad.push('final data memory differs');
  if (expectUnstable !== unstableSeen) bad.push(`expected unstable=${expectUnstable}`);
  mismatches += bad.length;
  results.push({ name, presses: words.length, ok: bad.length === 0 });
  console.log(bad.length ? `FAIL ${name}\n  ${bad.slice(0, 5).join('\n  ')}` : `ok   ${name} (${words.length} presses)`);
}
const asm = (src) => { const a = assemble(src); if (a.errors.length) throw new Error(JSON.stringify(a.errors)); return a.lines.map((l) => l.word); };

// challenge solutions at par
const SOLUTIONS = { show42: 'LI R1, 42\nDISPLAY R1', add: 'LI R1, 100\nLI R2, 55\nADD R3, R1, R2\nDISPLAY R3', mem: 'LI R1, 7\nSB R1, 9\nLB R5, 9\nDISPLAY R5', ff: 'NOR R1, R0, R0\nDISPLAY R1' };
for (const c of CHALLENGES) {
  compare(`challenge ${c.id}`, asm(SOLUTIONS[c.id]));
  let s = panelPowerOn(); for (const w of asm(SOLUTIONS[c.id])) s = clockIn(s, w).state;
  if (!c.done(s)) { mismatches++; console.log(`FAIL challenge ${c.id}: solution does not satisfy done()`); }
}
// ISA edge cases
compare('R0 hard-wired', asm('LI R0, 9\nDISPLAY R0\nADD R0, R1, R2\nDISPLAY R0'));
compare('wraparound and unsigned SLT', asm('LI R1, 200\nLI R2, 100\nADD R3, R1, R2\nSUB R4, R2, R1\nSLT R5, R1, R2\nSLT R6, R2, R1\nDISPLAY R4'));
compare('all ALU ops', asm('LI R1, 0xC5\nLI R2, 0x3A\nAND R3, R1, R2\nOR R4, R1, R2\nNOR R5, R1, R2\nSETEQUAL R6, R1, R2\nSETEQUAL R7, R1, R1\nDISPLAY R5'));
compare('undefined ALU op 00111 writes 0', [0b0100000100000101, 0b0011100100001010, 0b1100000100000000]);
compare('unassigned opcodes have no effect', [0b0100000100000101, 0b1010100100000000, 0b1011000100000000, 0b1011100100000000, 0b1100000100000000]);
compare('LINK, JUMP and BEQ not implemented in SWmode', asm('LI R1, 4\nLINK 0\nJUMP 0, 5\nBEQ 0, R1, R1\nSB R1, 3\nDISPLAY R1'));
compare('memory round trips', asm('LI R1, 11\nLI R2, 22\nSB R1, 0\nSB R2, 255\nLB R3, 255\nLB R4, 0\nADD R5, R3, R4\nDISPLAY R5'));
compare('DISPLAY of an unchanged value', asm('LI R4, 3\nDISPLAY R4\nLI R5, 7\nDISPLAY R5\nDISPLAY R4'));
compare('self-referencing ops that settle', asm('LI R1, 1\nADD R1, R1, R1\nLI R2, 9\nSUB R2, R2, R2\nLI R3, 6\nAND R3, R3, R3\nLI R4, 5\nSLT R4, R4, R3\nDISPLAY R4'));
compare('self-referencing op that never settles', asm('LI R2, 3\nADD R1, R1, R2\nDISPLAY R1'), { expectUnstable: true });

// The unsettled case really depends on timing: the same press with two different waits gives two values.
const unstableA = rtl(asm('LI R2, 3\nADD R1, R1, R2'), 400).presses[2].regs[1];
const unstableB = rtl(asm('LI R2, 3\nADD R1, R1, R2'), 401).presses[2].regs[1];
const timingDependent = unstableA !== unstableB;
console.log(`${timingDependent ? 'ok  ' : 'FAIL'} ADD R1, R1, R2 (R2 = 3) depends on press timing (R1 = ${unstableA} after 400 internal cycles, ${unstableB} after 401)`);
if (!timingDependent) mismatches++;

// seeded fuzz over all opcodes; words the model marks unstable are re-drawn so later presses stay comparable
let seed = 20241126;
const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
const FUNCTS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 15, 16, 17, 18, 19, 20, 21, 24, 25];
for (let run = 0; run < 4; run++) {
  const words = []; let s = panelPowerOn();
  while (words.length < 75) {
    const f = FUNCTS[rnd(FUNCTS.length)];
    const imm = rnd(4) === 0 ? rnd(16) : rnd(256);
    const w = (f << 11) | (rnd(8) << 8) | imm;
    const r = clockIn(s, w);
    if (r.effect.unstable) continue;
    s = r.state; words.push(w);
  }
  compare(`fuzz ${run + 1}`, words);
}

const summary = {
  source: 'Top.v from the owner\'s single-cycle Vivado project (created 2024-11-13, last edited 2024-11-26; not published)',
  top_v_sha256: topSha,
  simulator: execFileSync('iverilog', ['-V'], { encoding: 'utf8' }).split('\n')[0],
  shims: ['debouncer -> one-clock edge pulse', 'incomplete sensitivity lists -> @(*) (synthesis semantics)', 'registers and memories start at 0 (FPGA configuration)'],
  programs: results.length, presses_compared: comparedPresses, presses_unsettled_by_design: skippedUnstable,
  unsettled_op_timing_dependent: timingDependent, mismatches,
  checked: new Date().toISOString().slice(0, 10),
};
fs.writeFileSync(path.join(ROOT, 'content', 'cpu-panel-rtl-check.json'), JSON.stringify(summary, null, 2) + '\n');
fs.rmSync(tmp, { recursive: true, force: true });
console.log(mismatches ? `check:panel-rtl FAILED (${mismatches} mismatches)` : `check:panel-rtl ok: ${results.length}/${results.length} programs, ${comparedPresses} presses match the RTL`);
process.exit(mismatches ? 1 : 0);
