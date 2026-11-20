// Compact pipeline view for the home-page teaser: the five stages and a short pipeline diagram.
// frameHTML() is used at build time (static frame) and in the browser (animation), so both render the same markup.
import { assemble, decode } from './isa.ts';
import { reset, step, evaluate, drained, type CpuState, type Signals, type Tag } from './core.ts';
import { PRESETS } from './presets.ts';

export interface Run { words: number[]; states: CpuState[]; sigs: Signals[] }

export function simulate(presetId = 'fibonacci', max = 600): Run {
  const p = PRESETS.find((x) => x.id === presetId) ?? PRESETS[0];
  const words = assemble(p.source).words;
  let s = reset();
  const states = [s], sigs = [evaluate(s, words)];
  for (let c = 0; c < max && !drained(s, words); c++) {
    s = step(s, words).state;
    states.push(s);
    sigs.push(evaluate(s, words));
  }
  return { words, states, sigs };
}

const COLS = 9, ROWS = 5;
const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');

export function frameHTML(run: Run, c: number): string {
  const { words, states, sigs } = run;
  const s = states[c], g = sigs[c];
  const stage = (name: string, tag: Tag | null, word: number, note = '') => {
    const d = decode(word);
    const body = tag || name === 'IF' ? `<b class="tz-k k-${d.kind}">${esc(d.text)}</b>` : '<b class="tz-k k-empty">—</b>';
    return `<li class="${note ? 'tz-' + note : ''}"><span class="tz-n">${name}</span>${body}</li>`;
  };
  const wordAt = (t: Tag | null) => (t ? words[t.addr] ?? 0 : 0);
  const strip = [
    stage('IF', null, g.instr, g.stall ? 'hold' : ''),
    stage('ID', s.ifid.tag, s.ifid.instr, g.stall ? 'hold' : g.jumpClear ? 'kill' : ''),
    stage('EX', s.idex.tag, wordAt(s.idex.tag), (g.forwardA || g.forwardB) && s.idex.funct >> 3 !== 1 ? 'fwd' : g.jumpClear ? 'kill' : ''),
    stage('MEM', s.exmem.tag, wordAt(s.exmem.tag), g.branch ? 'br' : ''),
    stage('WB', s.memwb.tag, wordAt(s.memwb.tag)),
  ].join('');
  const event = g.jumpClear ? 'Branch taken: younger instructions flushed'
    : g.stall ? (g.stallReason === 'load-use' ? 'Load-use stall: decode holds one cycle' : 'Branch in EX: fetch stalls')
    : (g.forwardA || g.forwardB) && s.idex.funct >> 3 !== 1 ? `Forwarding into the ALU from ${Math.max(g.forwardA, g.forwardB) === 2 ? 'EX/MEM' : 'MEM/WB'}`
    : 'Steady state: one instruction per clock';

  // pipeline diagram for the last COLS cycles
  const start = Math.max(0, c - COLS + 1);
  const rows = new Map<number, { addr: number; cells: Map<number, string> }>();
  const mark = (t: Tag | null, col: number, v: string) => {
    if (!t) return;
    if (!rows.has(t.seq)) rows.set(t.seq, { addr: t.addr, cells: new Map() });
    rows.get(t.seq)!.cells.set(col, v);
  };
  for (let k = start; k <= c; k++) {
    const st = states[k], sg = sigs[k];
    mark(st.ifid.tag, k, sg.stall ? 'ID s' : sg.jumpClear ? '× k' : 'ID');
    mark(st.idex.tag, k, sg.jumpClear ? '× k' : 'EX');
    mark(st.exmem.tag, k, 'MEM');
    mark(st.memwb.tag, k, 'WB');
    const nx = states[k + 1];
    if (nx && k < c && nx.ifid.tag && nx.ifid.tag !== st.ifid.tag) mark(nx.ifid.tag, k, 'IF');
  }
  const list = [...rows.entries()].sort((a, b) => a[0] - b[0]).slice(-ROWS);
  let grid = '';
  for (const [, r] of list) {
    grid += `<span class="tz-l">${esc(decode(words[r.addr] ?? 0).text)}</span>`;
    for (let k = start; k < start + COLS; k++) {
      const v = r.cells.get(k);
      if (!v) { grid += '<span></span>'; continue; }
      const [label, flag] = v.split(' ');
      grid += `<span class="tz-c c-${label === '×' ? 'X' : label}${flag ? ' f-' + flag : ''}">${label}</span>`;
    }
  }
  return `<ol class="tz-strip" aria-hidden="true">${strip}</ol>
<p class="tz-ev"><span class="tz-cyc">Cycle ${s.cycle}</span>${esc(event)}</p>
<div class="tz-grid" aria-hidden="true" style="--cols:${COLS}">${grid}</div>`;
}
