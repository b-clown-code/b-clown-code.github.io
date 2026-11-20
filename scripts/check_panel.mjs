// Tests for the front-panel (single-cycle, SWmode) model in src/lib/cpu/single.ts. No simulator needed;
// scripts/check_panel_rtl.mjs compares the same model with the November 2024 RTL in Icarus Verilog.
// Each challenge is solved with its par number of words, and the ISA edge cases behave as documented.
import assert from 'node:assert/strict';
import { assemble } from '../src/lib/cpu/isa.ts';
import { panelPowerOn, clockIn, CHALLENGES } from '../src/lib/cpu/single.ts';

const run = (src, s = panelPowerOn()) => {
  const a = assemble(src);
  assert.equal(a.errors.length, 0, `assembly errors: ${JSON.stringify(a.errors)}`);
  const effects = [];
  for (const l of a.lines) { const r = clockIn(s, l.word); s = r.state; effects.push(r.effect); }
  return { s, effects, n: a.lines.length };
};
const ch = Object.fromEntries(CHALLENGES.map((c) => [c.id, c]));
let n = 0;
const t = (name, fn) => { fn(); n++; console.log('ok', name); };

t('show42 at par', () => { const { s, n } = run('LI R1, 42\nDISPLAY R1'); assert.ok(ch.show42.done(s)); assert.equal(n, ch.show42.par); });
t('add at par', () => { const { s, n } = run('LI R1, 100\nLI R2, 55\nADD R3, R1, R2\nDISPLAY R3'); assert.ok(ch.add.done(s)); assert.equal(n, ch.add.par); });
t('add rejects LI 155', () => { const { s } = run('LI R1, 155\nDISPLAY R1'); assert.ok(!ch.add.done(s)); });
t('mem at par', () => { const { s, n } = run('LI R1, 7\nSB R1, 9\nLB R5, 9\nDISPLAY R5'); assert.ok(ch.mem.done(s)); assert.equal(n, ch.mem.par); });
t('mem rejects display of the source register', () => { const { s } = run('LI R1, 7\nSB R1, 9\nDISPLAY R1'); assert.ok(!ch.mem.done(s)); });
t('ff at par', () => { const { s, n } = run('NOR R1, R0, R0\nDISPLAY R1'); assert.ok(ch.ff.done(s)); assert.equal(n, ch.ff.par); });
t('ff rejects LI 255', () => { const { s } = run('LI R1, 255\nDISPLAY R1'); assert.ok(!ch.ff.done(s)); });
t('R0 stays 0', () => { const { s, effects } = run('LI R0, 9\nDISPLAY R0'); assert.equal(s.regs[0], 0); assert.equal(s.display, 0); assert.ok(effects[0].noEffect); });
t('8-bit wraparound', () => { const { s } = run('LI R1, 200\nLI R2, 100\nADD R3, R1, R2\nSUB R4, R2, R1'); assert.equal(s.regs[3], 44); assert.equal(s.regs[4], 156); });
t('SLT is unsigned', () => { const { s } = run('LI R1, 3\nLI R2, 200\nSLT R3, R1, R2\nSLT R4, R2, R1'); assert.equal(s.regs[3], 1); assert.equal(s.regs[4], 0); });
t('SETEQUAL', () => { const { s } = run('LI R1, 5\nLI R2, 5\nSETEQUAL R3, R1, R2'); assert.equal(s.regs[3], 1); });
t('control flow has no effect', () => { const { s, effects } = run('LI R1, 1\nLINK 0\nJUMP 0, 5\nBEQ 0, R1, R1'); assert.deepEqual(s.mem.slice(0, 8), Array(8).fill(0)); assert.ok(effects.slice(1).every((e) => e.noEffect)); });
t('power-on: SWmode, cleared registers, display 0', () => { const s = panelPowerOn(); assert.deepEqual(s.regs, Array(8).fill(0)); assert.equal(s.display, 0); assert.equal(s.clocks, 0); });
t('self-referencing op that settles: ADD R1,R1,R1 doubles to 0', () => { const { s, effects } = run('LI R1, 1\nADD R1, R1, R1'); assert.equal(s.regs[1], 0); assert.equal(effects[1].settledAfter, 8); });
t('self-referencing op that never settles: ADD R1,R1,R2 with R2=2', () => { const { effects } = run('LI R2, 2\nADD R1, R1, R2'); assert.ok(effects[1].unstable); });
t('self-referencing op stable after one run: AND R2,R2,R2', () => { const { s, effects } = run('LI R2, 2\nAND R2, R2, R2'); assert.equal(s.regs[2], 2); assert.ok(!effects[1].unstable && !effects[1].settledAfter); });
t('SUB R3,R3,R3 settles at 0', () => { const { s } = run('LI R3, 9\nSUB R3, R3, R3'); assert.equal(s.regs[3], 0); });
t('NOR R1,R1,R1 toggles forever', () => { const { effects } = run('NOR R1, R1, R1'); assert.ok(effects[0].unstable); });
t('clock count', () => { const { s } = run('LI R1, 1\nLI R2, 2\nLI R3, 3'); assert.equal(s.clocks, 3); });
t('state is not mutated in place', () => { const a = panelPowerOn(); clockIn(a, 0b0100000100000101); assert.equal(a.regs[1], 0); });

console.log(`check:panel ok (${n} tests)`);
