// Browser controller for the pipeline view of the 8-bit CPU lab (src/components/cpu/CpuLab.astro).
// All machine behaviour comes from src/lib/cpu/core.ts; this file only keeps history and draws it.
import { assemble, decode, bin, hex, F, type AsmLine } from '../lib/cpu/isa';
import { reset, step, evaluate, drained, type CpuState, type Signals, type Tag } from '../lib/cpu/core';
import { PRESETS } from '../lib/cpu/presets';
import { seg7 } from './seg7';

const STAGE_X = { IF: 95, ID: 303, EX: 513, MEM: 717, WB: 912 } as const;
type Stage = keyof typeof STAGE_X;
const STAGES: Stage[] = ['IF', 'ID', 'EX', 'MEM', 'WB'];
const MAX_HISTORY = 20000;
const TL_COLS = 18;
const SVGNS = 'http://www.w3.org/2000/svg';

interface Program { words: number[]; lines: AsmLine[]; len: number; source: string; id: string }

export function mountLab(root: HTMLElement) {
  root.classList.add('js');
  const $ = <T extends Element = HTMLElement>(sel: string) => root.querySelector(sel) as T;
  const $$ = <T extends Element = HTMLElement>(sel: string) => [...root.querySelectorAll(sel)] as T[];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');

  let prog: Program;
  let hist: CpuState[] = [];
  let sigs: Signals[] = [];
  let ret: number[] = [];
  let cur = 0;
  let fmt: 'hex' | 'dec' = 'hex';
  let timer: number | null = null;
  let hz = 4;
  let memSel = -1;
  let haltedAt = -1;

  const led = (k: string, on: boolean) => $(`[data-led="${k}"]`)?.classList.toggle('on', on);
  const num = (n: number) => (fmt === 'hex' ? hex(n) : String(n));
  const numL = (n: number) => (fmt === 'hex' ? '0x' + hex(n) : String(n));

  // ---------- program loading ----------
  function load(source: string, id: string): boolean {
    const a = assemble(source);
    const errs = $('[data-errors]');
    errs.replaceChildren(...a.errors.map((e) => li(`Line ${e.line}: ${e.msg}`)));
    if (a.errors.length) return false;
    prog = { words: a.words, lines: a.lines, len: a.lines.length, source, id };
    $<HTMLTextAreaElement>('[data-src]').value = source;
    hist = [reset()];
    sigs = [evaluate(hist[0], prog.words)];
    ret = [0];
    cur = 0;
    haltedAt = -1;
    stop();
    $('[data-chips]').replaceChildren();
    renderListing();
    render();
    return true;
  }
  const li = (t: string) => { const e = document.createElement('li'); e.textContent = t; return e; };

  const isHalted = (s: CpuState) => drained(s, prog.words);

  // ---------- time ----------
  function forward(): boolean {
    if (cur < hist.length - 1) { cur++; return true; }
    const s = hist[cur];
    if (isHalted(s)) { haltedAt = cur; return false; }
    const r = step(s, prog.words);
    const t = s.memwb.tag;
    hist.push(r.state);
    sigs.push(evaluate(r.state, prog.words));
    ret.push(ret[cur] + (t && t.addr >= 1 && t.addr <= prog.len ? 1 : 0));
    if (hist.length > MAX_HISTORY) { hist.shift(); sigs.shift(); ret.shift(); }
    else cur++;
    if (cur > hist.length - 1) cur = hist.length - 1;
    return true;
  }
  function back() { if (cur > 0) cur--; }
  function run() {
    if (timer !== null) return stop();
    $('[data-act="run"]').textContent = 'Pause';
    led('run', true);
    const tick = () => {
      if (!forward()) { stop(); render(); return; }
      render(true);
    };
    timer = window.setInterval(tick, 1000 / hz);
  }
  function stop() {
    if (timer !== null) clearInterval(timer);
    timer = null;
    const b = root.querySelector('[data-act="run"]');
    if (b) b.textContent = 'Run';
    led('run', false);
  }
  function toEnd() {
    stop();
    for (let i = 0; i < 5000 && forward(); i++);
    render();
  }

  // ---------- rendering ----------
  const W = new Map($$<SVGPathElement>('[data-w]').map((p) => [p.dataset.w!, p]));
  const V = new Map($$<SVGTextElement>('[data-v]').map((t) => [t.getAttribute('data-v')!, t]));
  const B = new Map($$<SVGGElement>('[data-blk]').map((g) => [g.getAttribute('data-blk')!, g]));
  const BAR = new Map($$<SVGGElement>('[data-bar]').map((g) => [g.getAttribute('data-bar')!, g]));
  const SLOT = new Map($$<SVGTextElement>('[data-slot-t]').map((t) => [t.getAttribute('data-slot-t')!, t]));
  const chips = new Map<number | string, SVGGElement>();

  const setV = (k: string, t: string) => { const e = V.get(k); if (e && e.textContent !== t) e.textContent = t; };
  const wire = (k: string, cls: '' | 'on' | 'fwd' | 'br') => {
    const p = W.get(k); if (!p) return;
    p.classList.toggle('on', cls === 'on'); p.classList.toggle('fwd', cls === 'fwd'); p.classList.toggle('br', cls === 'br');
  };

  function render(running = false) {
    const s = hist[cur], g = sigs[cur], prev = cur > 0 ? hist[cur - 1] : null, pg = cur > 0 ? sigs[cur - 1] : null;
    const d = g.dec;
    const idw = decode(s.ifid.instr), exF = s.idex.funct, memF = s.exmem.funct;
    const op = s.ifid.funct >> 3;

    // readout
    $('[data-o="cycle"]').textContent = String(s.cycle);
    $('[data-o="retired"]').textContent = String(ret[cur]);
    $('[data-o="cpi"]').textContent = ret[cur] ? (s.cycle / ret[cur]).toFixed(2) : '–';
    $('[data-o="pc"]').textContent = num(s.pc);
    led('run', timer !== null);
    led('stall', !!g.stall);
    led('flush', !!g.jumpClear || !!g.branch);

    // values on the datapath
    setV('pc', numL(s.pc));
    setV('instr', hex(g.instr, 4));
    setV('instr-b', decode(g.instr).mnemonic);
    setV('pcnext', g.branch ? '' : 'PC+1');
    setV('dec', s.ifid.tag ? idw.text : '—');
    const usesA = op === 0 || s.ifid.funct === F.SB || s.ifid.funct === F.BEQ;
    const usesB = op === 0 || s.ifid.funct === F.BEQ;
    setV('ra', usesA ? `R${d.areg} = ${numL(g.dataA)}` : '');
    setV('rb', usesB ? `R${d.breg} = ${numL(g.dataB)}` : '');
    setV('rfbyp', g.rfBypassA || g.rfBypassB ? `bypass ${g.rfBypassA ? 'A' : 'B'} ← WB` : '');
    const wbWrites = s.memwb.regWrite && s.memwb.targetReg !== 0;
    setV('rfw', wbWrites ? `write R${s.memwb.targetReg}` : '');
    setV('haz', g.stall ? (g.stallReason === 'load-use' ? 'STALL · load-use' : 'STALL · branch in EX') : g.jumpClear ? 'FLUSH' : 'clear');
    const exLive = !!s.idex.tag;
    setV('alu-a', exLive ? numL(g.aluA) : '');
    setV('alu-b', exLive ? numL(g.aluB) : '');
    setV('alu', exLive ? numL(g.aluResult) : '');
    setV('aluop', exLive ? ['AND', 'OR', 'ADD', 'SUB', 'SLT', 'NOR', 'EQ', '—'][s.idex.aluop] + (exF >> 3 === 1 ? ' · imm' : '') : '');
    const memUses = memF === F.SB || memF === F.LB || memF === F.LINK || memF === F.JUMP || memF === F.BEQ;
    setV('maddr', memUses ? `addr ${numL(s.exmem.memAddr)}` : '');
    setV('mout', memF === F.LB || memF === F.JUMP || memF === F.BEQ ? `out ${numL(g.memDataOut)}` : '');
    setV('mstore', s.exmem.memReadWrite ? `write ${numL(g.storeData)}${g.storeBypass ? ' ·byp' : ''}` : '');
    setV('br', memF === F.BEQ || memF === F.JUMP ? (g.branch ? `taken → ${numL(g.pcNext)}` : 'not taken') : '');
    setV('wb', wbWrites ? `R${s.memwb.targetReg}←${num(g.writeData)}` : '');

    // wires
    wire('pc-imem', 'on');
    wire('imem-ifid', g.stall ? '' : 'on');
    wire('pc-inc', g.branch || g.stall ? '' : 'on');
    wire('ifid-dec', s.ifid.tag ? 'on' : '');
    wire('ifid-rf', usesA ? 'on' : '');
    wire('dec-idex', s.ifid.tag && !g.stall ? 'on' : '');
    wire('rf-a', usesA && !g.stall ? 'on' : '');
    wire('rf-b', usesB && !g.stall ? 'on' : '');
    const exAlu = exLive && exF >> 3 !== 1;
    wire('idex-a', exAlu && g.forwardA === 0 ? 'on' : '');
    wire('idex-b', exAlu && g.forwardB === 0 ? 'on' : '');
    wire('idex-imm', exLive && exF >> 3 === 1 ? 'on' : '');
    wire('mux-a', exLive ? 'on' : '');
    wire('mux-b', exLive ? 'on' : '');
    wire('alu-exmem', exLive ? 'on' : '');
    wire('fwd-a2', exAlu && g.forwardA === 2 ? 'fwd' : '');
    wire('fwd-b2', exAlu && g.forwardB === 2 ? 'fwd' : '');
    wire('fwd-a1', exAlu && g.forwardA === 1 ? 'fwd' : '');
    wire('fwd-b1', exAlu && g.forwardB === 1 ? 'fwd' : '');
    wire('exmem-addr', memUses ? 'on' : '');
    wire('exmem-store', s.exmem.memReadWrite && !g.storeBypass ? 'on' : '');
    wire('store-byp', s.exmem.memReadWrite && g.storeBypass ? 'fwd' : '');
    wire('exmem-alu', s.exmem.regWrite && memF !== F.LB ? 'on' : '');
    wire('dmem-memwb', memF === F.LB ? 'on' : '');
    wire('branch', g.branch ? 'br' : '');
    wire('memwb-mem', s.memwb.regWrite && s.memwb.funct === F.LB ? 'on' : '');
    wire('memwb-alu', s.memwb.regWrite && s.memwb.funct !== F.LB ? 'on' : '');
    wire('wb', wbWrites ? 'on' : '');

    // blocks and pipeline registers
    B.get('haz')!.classList.toggle('on', !!g.stall || !!g.jumpClear);
    B.get('mux-a')!.classList.toggle('fwd', exAlu && g.forwardA !== 0);
    B.get('mux-b')!.classList.toggle('fwd', exAlu && g.forwardB !== 0);
    B.get('alu')!.classList.toggle('on', exLive);
    B.get('dmem')!.classList.toggle('on', memUses);
    B.get('br')!.classList.toggle('on', !!g.branch);
    B.get('rf')!.classList.toggle('on', usesA || wbWrites);
    B.get('dec')!.classList.toggle('on', !!s.ifid.tag);
    BAR.get('ifid')!.classList.toggle('hold', !!g.stall);
    BAR.get('idex')!.classList.toggle('bubble', !!(pg && pg.stall));
    for (const k of ['ifid', 'idex', 'exmem', 'memwb']) BAR.get(k)!.classList.toggle('flush', !!g.jumpClear);

    // slot captions for empty stages
    const pending = pg && pg.jumpClear ? 'flushed' : '';
    SLOT.get('if')!.textContent = '';
    SLOT.get('id')!.textContent = s.ifid.tag ? '' : pending || 'empty';
    SLOT.get('ex')!.textContent = s.idex.tag ? '' : pg && pg.stall ? 'bubble' : pending || 'empty';
    SLOT.get('mem')!.textContent = s.exmem.tag ? '' : pending || 'empty';
    SLOT.get('wb')!.textContent = s.memwb.tag ? '' : pending || 'empty';

    renderChips(s, g, running);
    renderRegs(s, prev);
    renderMem(s, prev);
    renderIdCard(s);
    renderSeg7(s);
    markListing(s, g);
    renderTimeline();

    if (!running || cur === haltedAt) {
      const parts = [`Cycle ${s.cycle}.`, `PC ${num(s.pc)}.`];
      if (s.ifid.tag) parts.push(`Decode: ${idw.text}.`);
      if (g.stall) parts.push(`Stall, ${g.stallReason}.`);
      if (g.jumpClear) parts.push('Branch taken, pipeline flushed.');
      if (exAlu && (g.forwardA || g.forwardB)) parts.push('Forwarding into the ALU.');
      if (cur === haltedAt) parts.push('Program finished.');
      $('[data-live]').textContent = parts.join(' ');
    }
  }

  function chipEl(key: number | string, word: number): SVGGElement {
    let c = chips.get(key);
    if (c) return c;
    c = document.createElementNS(SVGNS, 'g') as SVGGElement;
    const r = document.createElementNS(SVGNS, 'rect');
    r.setAttribute('x', '-80'); r.setAttribute('y', '13'); r.setAttribute('width', '160'); r.setAttribute('height', '30'); r.setAttribute('rx', '8');
    const t = document.createElementNS(SVGNS, 'text');
    t.setAttribute('x', '0'); t.setAttribute('y', '33');
    c.append(r, t);
    $('[data-chips]').append(c);
    chips.set(key, c);
    setChip(c, word);
    return c;
  }
  function setChip(c: SVGGElement, word: number) {
    const dw = decode(word);
    const label = dw.text.length > 18 ? dw.text.replace(/, /g, ',') : dw.text;
    c.querySelector('text')!.textContent = label;
    c.setAttribute('class', `chip k-${dw.kind}`);
    c.dataset.word = String(word);
  }
  const place = (c: SVGGElement, x: number) => { c.style.transform = `translate(${x}px, 0)`; };

  function renderChips(s: CpuState, g: Signals, running: boolean) {
    const want = new Map<number | string, { x: number; word: number; held?: boolean; from?: number }>();
    const put = (tag: Tag | null, st: Stage, word: number, held = false) => {
      if (tag) want.set(tag.seq, { x: STAGE_X[st], word, held });
    };
    put(s.ifid.tag, 'ID', s.ifid.instr, !!g.stall);
    put(s.idex.tag, 'EX', hist[cur].idex.tag ? wordOf(s.idex.tag) : 0);
    put(s.exmem.tag, 'MEM', wordOf(s.exmem.tag));
    put(s.memwb.tag, 'WB', wordOf(s.memwb.tag));
    want.set('fetch', { x: STAGE_X.IF, word: g.instr });
    const animate = !reduced.matches && !(running && hz > 12);
    for (const [k, c] of chips) {
      if (!want.has(k)) {
        chips.delete(k);
        const killed = g && sigs[cur - 1]?.jumpClear && typeof k === 'number';
        if (!animate) { c.remove(); continue; }
        if (killed) c.classList.add('killed');
        else place(c, (Number(c.dataset.x) || 0) + 110);
        c.classList.add('dying');
        setTimeout(() => c.remove(), 380);
      }
    }
    for (const [k, w] of want) {
      const isNew = !chips.has(k);
      const c = chipEl(k, w.word);
      if (k === 'fetch') { setChip(c, w.word); c.classList.add('fetch'); }
      c.classList.toggle('held', !!w.held);
      if (isNew && typeof k === 'number' && animate) {
        c.style.transition = 'none';
        place(c, STAGE_X.IF);
        c.getBoundingClientRect();
        c.style.transition = '';
      }
      place(c, w.x);
      c.dataset.x = String(w.x);
    }
    if (!animate) for (const c of chips.values()) c.style.transition = 'none';
    else for (const c of chips.values()) c.style.transition = '';
  }
  const wordOf = (t: Tag | null) => (t ? prog.words[t.addr] ?? 0 : 0);

  const regItems: HTMLLIElement[] = [];
  function renderRegs(s: CpuState, prev: CpuState | null) {
    const ol = $('[data-regs]');
    if (!regItems.length) for (let r = 0; r < 8; r++) {
      const e = document.createElement('li');
      e.innerHTML = `<span class="rn">R${r}</span><span class="rv"></span>`;
      ol.append(e); regItems.push(e);
    }
    s.regs.forEach((v, r) => {
      const e = regItems[r];
      (e.lastElementChild as HTMLElement).innerHTML = `${fmt === 'hex' ? '0x' + hex(v) : v}<small>${fmt === 'hex' ? v : '0x' + hex(v)}</small>`;
      e.classList.toggle('w', !!prev && prev.regs[r] !== v);
    });
  }

  const memCells: HTMLSpanElement[] = [];
  function renderMem(s: CpuState, prev: CpuState | null) {
    const grid = $('[data-mem]');
    if (!memCells.length) for (let i = 0; i < 256; i++) {
      const e = document.createElement('span');
      e.dataset.i = String(i);
      if (i < 8) e.classList.add('slot');
      e.title = `M[${i}]`;
      grid.append(e); memCells.push(e);
    }
    const memF = s.exmem.funct;
    const readAddr = memF === F.LB || memF === F.JUMP || memF === F.BEQ ? s.exmem.memAddr : -1;
    s.mem.forEach((v, i) => {
      const e = memCells[i];
      const t = fmt === 'hex' ? hex(v) : String(v);
      if (e.textContent !== t) e.textContent = t;
      e.classList.toggle('nz', v !== 0);
      e.classList.toggle('w', !!prev && prev.mem[i] !== v);
      e.classList.toggle('r', i === readAddr);
      e.classList.toggle('sel', i === memSel);
    });
    if (memSel >= 0) $('[data-memsel]').textContent = `M[${memSel}] = 0x${hex(s.mem[memSel])} = ${s.mem[memSel]}${memSel < 8 ? ' · jump-table slot' : ''}`;
  }

  function renderIdCard(s: CpuState) {
    const w = s.ifid.instr, dw = decode(w);
    $('[data-idc-asm]').textContent = s.ifid.tag ? `${hex(s.ifid.tag.addr)}: ${dw.text}` : '—';
    const b = bin(w, 16);
    $('[data-idc-bits]').innerHTML = s.ifid.tag
      ? `<span class="bits"><span class="bf">${b.slice(0, 5)}</span> <span class="bt">${b.slice(5, 8)}</span> <span class="bi">${b.slice(8)}</span></span>`
      : '';
    $('[data-idc-rtl]').textContent = s.ifid.tag ? dw.rtl : '';
  }

  // seven-segment display: three digits, like the board's BTN0 register view
  let drawSeg: ReturnType<typeof seg7> | null = null;
  function renderSeg7(s: CpuState) {
    drawSeg ??= seg7($('[data-seg7]'));
    const r = Number($<HTMLSelectElement>('[data-segsel]').value);
    drawSeg(s.regs[r], `Seven-segment display showing R${r} = ${s.regs[r]}`);
  }

  // ---------- listing ----------
  let listItems = new Map<number, HTMLLIElement>();
  function renderListing() {
    const ol = $('[data-listing]');
    listItems = new Map();
    ol.replaceChildren(...prog.lines.map((l) => {
      const e = document.createElement('li');
      const b = bin(l.word, 16);
      e.innerHTML = `<span class="a">${hex(l.addr)}</span><span class="bits"><span class="bf">${b.slice(0, 5)}</span> <span class="bt">${b.slice(5, 8)}</span> <span class="bi">${b.slice(8)}</span></span><span class="asm"></span><span class="stg" hidden></span>`;
      (e.querySelector('.asm') as HTMLElement).textContent = decode(l.word).text;
      e.title = l.source;
      listItems.set(l.addr, e);
      return e;
    }));
  }
  function markListing(s: CpuState, g: Signals) {
    const at = new Map<number, string>();
    const add = (t: Tag | null, st: string) => { if (t) at.set(t.addr, (at.get(t.addr) ? at.get(t.addr) + ' ' : '') + st); };
    if (!g.stall && !g.jumpClear) at.set(s.pc, 'IF');
    add(s.ifid.tag, 'ID'); add(s.idex.tag, 'EX'); add(s.exmem.tag, 'MEM'); add(s.memwb.tag, 'WB');
    for (const [addr, e] of listItems) {
      const st = at.get(addr);
      const badge = e.lastElementChild as HTMLElement;
      if (st) { e.dataset.st = st; badge.hidden = false; badge.textContent = st; }
      else { delete e.dataset.st; badge.hidden = true; }
    }
    // keep the instruction in decode visible without scrolling the page
    const focus = s.ifid.tag ? listItems.get(s.ifid.tag.addr) : null;
    const box = $('[data-listing]');
    if (focus && !box.hidden) {
      const top = focus.offsetTop - box.offsetTop, h = focus.offsetHeight;
      if (top < box.scrollTop || top + h > box.scrollTop + box.clientHeight) box.scrollTop = top - box.clientHeight / 2;
    }
  }

  // ---------- pipeline diagram ----------
  function renderTimeline() {
    const tl = $('[data-tl]');
    const end = Math.max(cur, Math.min(hist.length - 1, cur));
    const start = Math.max(0, end - TL_COLS + 1);
    const cols = end - start + 1;
    const rows = new Map<number, { tag: Tag; cells: Map<number, { st: string; cls: string }> }>();
    const mark = (t: Tag | null, c: number, st: string, cls = '') => {
      if (!t) return;
      if (!rows.has(t.seq)) rows.set(t.seq, { tag: t, cells: new Map() });
      rows.get(t.seq)!.cells.set(c, { st, cls });
    };
    for (let c = start; c <= end; c++) {
      const s = hist[c], g = sigs[c];
      mark(s.ifid.tag, c, 'ID', g.stall ? 'stall' : g.jumpClear ? 'kill' : '');
      mark(s.idex.tag, c, 'EX', g.jumpClear ? 'kill' : '');
      mark(s.exmem.tag, c, 'MEM');
      mark(s.memwb.tag, c, 'WB');
      const nx = hist[c + 1];
      if (nx && nx.ifid.tag && nx.ifid.tag !== s.ifid.tag) mark(nx.ifid.tag, c, 'IF');
    }
    const sorted = [...rows.values()].sort((a, b) => a.tag.seq - b.tag.seq).slice(-12);
    tl.style.gridTemplateColumns = `auto repeat(${cols}, 42px)`;
    const frag = document.createDocumentFragment();
    const blank = document.createElement('span'); blank.className = 'n'; frag.append(blank);
    for (let c = start; c <= end; c++) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'h' + (c === cur ? ' cur' : ''); b.textContent = String(hist[c].cycle);
      b.dataset.go = String(c);
      b.setAttribute('aria-label', `Go to cycle ${hist[c].cycle}`);
      frag.append(b);
    }
    for (const r of sorted) {
      const n = document.createElement('span'); n.className = 'n';
      n.textContent = hex(r.tag.addr);
      const bEl = document.createElement('b'); bEl.textContent = decode(prog.words[r.tag.addr] ?? 0).text; n.append(bEl);
      frag.append(n);
      for (let c = start; c <= end; c++) {
        const cell = document.createElement('span');
        const v = r.cells.get(c);
        cell.className = 'c' + (v ? ` s-${v.st} ${v.cls}` + (c === cur ? ' curcol' : '') : '');
        cell.textContent = v ? (v.cls === 'kill' ? '×' : v.st) : '';
        frag.append(cell);
      }
    }
    tl.replaceChildren(frag);
    const wrap = tl.parentElement!;
    const curBtn = tl.querySelector<HTMLElement>('button.h.cur');
    if (curBtn && (curBtn.offsetLeft + curBtn.offsetWidth > wrap.scrollLeft + wrap.clientWidth || curBtn.offsetLeft < wrap.scrollLeft + 160)) wrap.scrollLeft = curBtn.offsetLeft - wrap.clientWidth + 60;
  }

  // ---------- events ----------
  root.addEventListener('click', (ev) => {
    const t = ev.target as HTMLElement;
    const act = t.closest<HTMLElement>('[data-act]')?.dataset.act;
    if (act === 'reset') { stop(); cur = 0; hist = hist.slice(0, 1); sigs = sigs.slice(0, 1); ret = ret.slice(0, 1); haltedAt = -1; render(); }
    else if (act === 'back') { stop(); back(); render(); }
    else if (act === 'step') { stop(); forward(); render(); }
    else if (act === 'run') run();
    else if (act === 'end') toEnd();
    else if (act === 'assemble') {
      const src = $<HTMLTextAreaElement>('[data-src]').value;
      if (load(src, 'custom')) { $<HTMLSelectElement>('[data-preset]').value = 'custom'; setBlurb('custom'); showTab('listing'); }
    } else if (act === 'share') share(t as HTMLButtonElement);
    const go = t.closest<HTMLElement>('[data-go]');
    if (go) { stop(); cur = Number(go.dataset.go); render(); }
    const f = t.closest<HTMLElement>('[data-fmt]');
    if (f) {
      fmt = f.dataset.fmt as 'hex' | 'dec';
      $$('[data-fmt]').forEach((b) => b.setAttribute('aria-pressed', String(b === f)));
      render();
    }
    const tab = t.closest<HTMLElement>('[data-tab]');
    if (tab) showTab(tab.dataset.tab!);
    const cell = t.closest<HTMLElement>('[data-mem] span');
    if (cell) { memSel = Number(cell.dataset.i); render(); }
  });
  function showTab(name: string) {
    $$('[data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
    $('[data-listing]').hidden = name !== 'listing';
    $('[data-editor]').hidden = name !== 'source';
  }
  function setBlurb(id: string) {
    const p = PRESETS.find((x) => x.id === id);
    $('[data-blurb]').textContent = p ? p.blurb : 'Your own program. Edit the source and assemble it again at any time.';
  }
  $<HTMLSelectElement>('[data-preset]').addEventListener('change', (e) => {
    const id = (e.target as HTMLSelectElement).value;
    const p = PRESETS.find((x) => x.id === id);
    if (p) { load(p.source, p.id); setBlurb(id); }
    else showTab('source');
  });
  $<HTMLSelectElement>('[data-segsel]').addEventListener('change', () => render());
  const speed = $<HTMLInputElement>('[data-speed]');
  speed.addEventListener('input', () => {
    hz = Number(speed.value);
    $('[data-speed-out]').textContent = `${hz} Hz`;
    if (timer !== null) { stop(); run(); }
  });
  root.addEventListener('keydown', (ev) => {
    const tag = (ev.target as HTMLElement).tagName;
    if (tag === 'TEXTAREA' || tag === 'INPUT' || tag === 'SELECT') return;
    if (root.dataset.mode !== 'pipe') return;
    if (ev.key === 'ArrowRight') { ev.preventDefault(); stop(); forward(); render(); }
    else if (ev.key === 'ArrowLeft') { ev.preventDefault(); stop(); back(); render(); }
    else if (ev.key === ' ' && tag !== 'BUTTON') { ev.preventDefault(); run(); }
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });

  async function share(btn: HTMLButtonElement) {
    const src = $<HTMLTextAreaElement>('[data-src]').value;
    const enc = btoa(String.fromCharCode(...new TextEncoder().encode(src))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const url = `${location.origin}${location.pathname}#prog=${enc}`;
    history.replaceState(null, '', `#prog=${enc}`);
    try { await navigator.clipboard.writeText(url); btn.textContent = 'Link copied'; }
    catch { btn.textContent = 'Link in address bar'; }
    setTimeout(() => { btn.textContent = 'Copy share link'; }, 2000);
  }
  function fromHash(): string | null {
    const m = /#prog=([A-Za-z0-9_-]+)/.exec(location.hash);
    if (!m) return null;
    try {
      const b = atob(m[1].replace(/-/g, '+').replace(/_/g, '/'));
      return new TextDecoder().decode(Uint8Array.from(b, (c) => c.charCodeAt(0))).slice(0, 8000);
    } catch { return null; }
  }

  // ---------- mode: closed (buttons only), pipeline view, or front panel ----------
  const modeTabs = $$<HTMLButtonElement>('[data-mode-tab]');
  const closeBtn = $<HTMLButtonElement>('[data-mode-close]');
  function setMode(m: string, focus = false) {
    if (m !== 'pipe' && m !== 'panel') m = 'none';
    stop();
    root.dataset.mode = m;
    modeTabs.forEach((b, i) => {
      const on = b.dataset.modeTab === m;
      b.setAttribute('aria-selected', String(on));
      b.tabIndex = on || (m === 'none' && i === 0) ? 0 : -1;
      if (on && focus) b.focus();
    });
    closeBtn.hidden = m === 'none';
    $$('[data-mode-panel]').forEach((p) => { p.hidden = p.dataset.modePanel !== m; });
    if (m === 'pipe') render();
    root.dispatchEvent(new CustomEvent('lab:mode', { detail: m }));
  }
  const setHash = (m: string) => {
    if (location.hash.startsWith('#prog=') && m === 'pipe') return;
    history.replaceState(null, '', m === 'panel' ? '#front-panel' : m === 'pipe' ? '#pipeline' : location.pathname);
  };
  modeTabs.forEach((b) => b.addEventListener('click', () => { setMode(b.dataset.modeTab!); setHash(b.dataset.modeTab!); }));
  closeBtn.addEventListener('click', () => { setMode('none'); setHash('none'); modeTabs[0].focus(); });
  modeTabs[0]?.parentElement?.addEventListener('keydown', (ev) => {
    if (ev.key !== 'ArrowRight' && ev.key !== 'ArrowLeft') return;
    ev.preventDefault(); ev.stopPropagation();
    const i = Math.max(0, modeTabs.indexOf(document.activeElement as HTMLButtonElement));
    const next = modeTabs[(i + 1) % modeTabs.length];
    if (root.dataset.mode === 'none') { modeTabs.forEach((b) => { b.tabIndex = b === next ? 0 : -1; }); next.focus(); }
    else setMode(next.dataset.modeTab!, true);
  });

  // ---------- start ----------
  const shared = fromHash();
  if (shared && load(shared, 'custom')) { $<HTMLSelectElement>('[data-preset]').value = 'custom'; setBlurb('custom'); }
  else { load(PRESETS[0].source, PRESETS[0].id); setBlurb(PRESETS[0].id); }
  const h = location.hash;
  setMode(h === '#front-panel' ? 'panel' : h === '#pipeline' || h.startsWith('#prog=') ? 'pipe' : 'none');
}
