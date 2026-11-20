#!/usr/bin/env node
// Checks the browser CPU model (src/lib/cpu/core.ts) against the CPU's own Verilog in Icarus Verilog, cycle by cycle,
// and the lab assembler (src/lib/cpu/isa.ts) against the original Pyssembler.py.
// Needs iverilog/vvp and python3 on PATH. Writes content/cpu-rtl-check.json.
//   node scripts/check_cpu.mjs [--fuzz N] [--cycles N] [--seed N] [--only name]
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assemble, toMemFile } from '../src/lib/cpu/isa.ts';
import { reset, step } from '../src/lib/cpu/core.ts';
import { PRESETS } from '../src/lib/cpu/presets.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RTL = path.join(ROOT, 'scripts/cpu-rtl');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i < 0 ? d : args[i + 1]; };
const FUZZ = Number(opt('--fuzz', 300));
const CYCLES = Number(opt('--cycles', 200));
const SEED = Number(opt('--seed', 20261119));
const ONLY = opt('--only', null);

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'cpu-rtl-'));
const vvpBin = path.join(work, 'cpu.vvp');
const V = ['ALU.v', 'Control.v', 'EX_MEM.v', 'ID_EX.v', 'IF_ID.v', 'Instruction_Memory.v', 'MEM_WB.v', 'Registers.v', 'dataMem.v',
  'bin2bcd.v', 'debouncer.v', 'decoder_7_seg.v', 'timer_display.v'].map((f) => path.join(RTL, 'vendor', f));
execFileSync('iverilog', ['-g2005', '-o', vvpBin, '-s', 'tb_trace', path.join(RTL, 'tb_trace.v'), path.join(RTL, 'sysClock_passthru.v'), ...V], { stdio: ['ignore', 'ignore', 'pipe'] });

const h = (n, d = 2) => n.toString(16).padStart(d, '0');
const b = (n, d) => n.toString(2).padStart(d, '0');

function jsTrace(words, cycles, loop) {
  let s = reset();
  const lines = [];
  for (let c = 0; c <= cycles; c++) {
    const { state, sig: g } = step(s, words, { loop });
    const L = g.dec;
    lines.push(`C ${c} pc=${h(s.pc)} if=${h(g.instr, 4)} id=${h(s.ifid.instr, 4)} ex=${h(s.idex.funct)} mem=${h(s.exmem.funct)} wb=${h(s.memwb.funct)} ` +
      `stall=${g.stall} clr=${g.jumpClear} br=${g.branch} pcn=${h(g.pcNext)} fa=${b(g.forwardA, 2)} fb=${b(g.forwardB, 2)} ` +
      `a=${h(g.aluA)} b=${h(g.aluB)} alu=${h(g.aluResult)} z=${g.zeroFlag} we=${s.exmem.memReadWrite} ma=${h(s.exmem.memAddr)} ` +
      `md=${h(g.storeData)} mo=${h(g.memDataOut)} rw=${s.memwb.regWrite} rt=${s.memwb.targetReg} wd=${h(g.writeData)} jc=${h(s.jumpCount)} ` +
      `lat=${L.aluop},${h(L.addressIn)},${h(L.pclink)} r=${s.regs.map((r) => h(r)).join(',')}`);
    s = state;
  }
  // the RTL testbench dumps memory after the last sampled cycle plus one more edge
  return { lines, mem: 'M ' + s.mem.map((m) => h(m)).join(' '), final: s };
}

function rtlTrace(words, cycles, loop) {
  const dir = fs.mkdtempSync(path.join(work, 'run-'));
  fs.writeFileSync(path.join(dir, 'memory.mem'), toMemFile(words));
  const out = execFileSync('vvp', ['-n', vvpBin, `+cycles=${cycles}`, ...(loop ? ['+loop'] : [])], { cwd: dir, encoding: 'utf8' });
  fs.rmSync(dir, { recursive: true });
  const all = out.split('\n');
  return { lines: all.filter((l) => l.startsWith('C ')), mem: (all.find((l) => l.startsWith('M ')) ?? '').trim() };
}

function compare(name, words, cycles, loop = false) {
  const js = jsTrace(words, cycles, loop), rtl = rtlTrace(words, cycles, loop);
  for (let c = 0; c <= cycles; c++) {
    if (js.lines[c] !== rtl.lines[c]) {
      const a = (js.lines[c] ?? '').split(' '), r = (rtl.lines[c] ?? '').split(' ');
      const diff = a.map((f, i) => (f !== r[i] ? `${f} (js) vs ${r[i]} (rtl)` : null)).filter(Boolean);
      return { name, ok: false, cycle: c, diff, js: js.lines[c], rtl: rtl.lines[c] };
    }
  }
  if (js.mem !== rtl.mem) return { name, ok: false, cycle: cycles + 1, diff: ['final data memory'] };
  return { name, ok: true, cycles: cycles + 1, final: js.final };
}

// Pyssembler parity, for programs written in the original syntax only
const ORIGINAL = /^(?:(?:AND|OR|ADD|SUB|SLT|NOR|SETEQUAL) R[0-7], R[0-7], R[0-7]|(?:SB|LB|LI) R[0-7], \d+|DISPLAY R[0-7]|LINK \d+|JUMP [0-7], \d+|BEQ [0-7], R[0-7], R[0-7])$/;
function pyssemblerWords(lines) {
  const dir = fs.mkdtempSync(path.join(work, 'py-'));
  fs.writeFileSync(path.join(dir, 'program.txt'), lines.join('\n') + '\n');
  execFileSync('python3', ['-I', path.join(RTL, 'vendor/Pyssembler.py')], { cwd: dir });
  const mem = fs.readFileSync(path.join(dir, 'memory.mem'), 'utf8');
  fs.rmSync(dir, { recursive: true });
  return mem.split('\n').map((l) => l.replace(/\/\/.*/, '').trim()).filter(Boolean).map((l) => parseInt(l, 2));
}

// seeded fuzz programs: random words biased toward meaningful opcodes, with jump-table slots seeded first
function rng(seed) { let x = seed >>> 0; return () => ((x = (Math.imul(x ^ (x >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) >>> 0) / 2 ** 32); }
function fuzzProgram(r) {
  const words = new Array(256).fill(0);
  const n = 8 + Math.floor(r() * 60);
  const pick = (k) => Math.floor(r() * k);
  let a = 1;
  for (let slot = 0; slot < 4; slot++) { // LI R7, target ; SB R7, slot
    words[a++] = (0b01000 << 11) | (7 << 8) | (1 + pick(n + 12));
    words[a++] = (0b10000 << 11) | (7 << 8) | slot;
  }
  for (let i = 0; i < n && a < 254; i++) {
    const k = r();
    let w;
    if (k < 0.35) w = (pick(8) << 11) | (pick(8) << 8) | (pick(8) << 3) | pick(8);            // ALU incl. 00111
    else if (k < 0.5) w = ((8 | pick(8)) << 11) | (pick(8) << 8) | pick(256);                   // LI (any 01xxx)
    else if (k < 0.6) w = (0b10000 << 11) | (pick(8) << 8) | pick(12);                          // SB
    else if (k < 0.7) w = (0b10001 << 11) | (pick(8) << 8) | pick(12);                          // LB
    else if (k < 0.75) w = (0b10010 << 11) | pick(8);                                           // LINK
    else if (k < 0.82) w = (0b10011 << 11) | (pick(4) << 8) | pick(6);                          // JUMP
    else if (k < 0.9) w = (0b10100 << 11) | (pick(4) << 8) | (pick(8) << 3) | pick(8);          // BEQ
    else if (k < 0.95) w = ((24 | pick(8)) << 11) | (pick(8) << 8) | pick(256);                 // 11xxx
    else w = pick(65536);                                                                       // anything
    words[a++] = w;
  }
  return words;
}

const results = [];
let pyChecked = 0;
const progDir = path.join(RTL, 'programs');
const sources = [
  ...fs.readdirSync(progDir).filter((f) => f.endsWith('.asm')).sort().map((f) => [f.replace(/\.asm$/, ''), fs.readFileSync(path.join(progDir, f), 'utf8')]),
  ...PRESETS.map((p) => ['preset-' + p.id, p.source]),
];
for (const [name, src] of sources) {
  if (ONLY && name !== ONLY) continue;
  const asm = assemble(src);
  if (asm.errors.length) { results.push({ name, ok: false, diff: asm.errors.map((e) => `line ${e.line}: ${e.msg}`) }); continue; }
  const stripped = asm.lines.map((l) => l.source);
  if (stripped.every((l) => ORIGINAL.test(l))) {
    const py = pyssemblerWords(stripped);
    const mine = asm.words.slice(0, py.length);
    const bad = py.findIndex((w, i) => w !== mine[i]);
    if (bad >= 0) results.push({ name: name + ' (assembler)', ok: false, diff: [`word ${bad}: ${mine[bad]?.toString(2)} vs Pyssembler ${py[bad].toString(2)}`] });
    else pyChecked++;
  }
  results.push(compare(name, asm.words, CYCLES));
  results.push(compare(name + ' (SW3 loop)', asm.words, 300, true));
}
if (!ONLY) {
  const r = rng(SEED);
  for (let i = 0; i < FUZZ; i++) results.push(compare(`fuzz-${i}`, fuzzProgram(r), CYCLES, r() < 0.2));
}
fs.rmSync(work, { recursive: true });

const failed = results.filter((x) => !x.ok);
for (const f of failed.slice(0, 5)) {
  console.log(`MISMATCH ${f.name} at cycle ${f.cycle}:\n  ${f.diff.join('\n  ')}`);
  if (f.js) console.log(`  js : ${f.js}\n  rtl: ${f.rtl}`);
}
const runs = results.filter((x) => x.cycles !== undefined || x.cycle !== undefined);
const cycles = results.reduce((n, x) => n + (x.cycles ?? 0), 0);
const directed = results.filter((x) => !x.name.startsWith('fuzz-') && !x.name.endsWith('(assembler)'));
console.log(`check:cpu ${failed.length ? 'FAILED' : 'ok'}: ${runs.length - failed.length}/${runs.length} programs match the RTL ` +
  `(${cycles} cycles compared; ${directed.length} directed runs, ${runs.length - directed.length} fuzz), assembler matches Pyssembler on ${pyChecked} programs`);

if (!ONLY && !failed.length) {
  const finals = Object.fromEntries(directed.filter((x) => !x.name.includes('(SW3')).map((x) => [x.name, {
    cycles: x.cycles, retired: x.final.retired, regs: x.final.regs, mem: Object.fromEntries(x.final.mem.map((v, i) => [i, v]).filter(([, v]) => v)),
  }]));
  fs.writeFileSync(path.join(ROOT, 'content/cpu-rtl-check.json'), JSON.stringify({
    rtl: 'b-clown-code/8-bit-verilog-processor@75f2f7971bfd358b03445c36ee76adcb8b560803',
    simulator: 'Icarus Verilog ' + execFileSync('iverilog', ['-V'], { encoding: 'utf8' }).split('\n')[0].replace(/^Icarus Verilog version /, ''),
    seed: SEED, programs: runs.length, directed: directed.length, fuzz: runs.length - directed.length,
    cycles_compared: cycles, mismatches: 0, assembler_parity_programs: pyChecked, directed_final_state: finals,
  }, null, 1) + '\n');
}
process.exit(failed.length ? 1 : 0);
