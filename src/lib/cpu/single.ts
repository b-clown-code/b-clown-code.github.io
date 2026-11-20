// Front-panel mode: the single-cycle CPU from November 2024 (owner's Vivado project, Top.v, last edited
// 2024-11-26), before the assembler existed. On the board the CPU first ran its stored program, then entered
// SWmode: each debounced press of BTNC latches the 16 switches as the next instruction. Here the stored
// program is empty, so the panel starts in SWmode with cleared registers, as the board does with empty
// instruction memory. Behaviour follows Top.v and is compared with it in Icarus Verilog by
// scripts/check_panel_rtl.mjs. Pure functions, no DOM.
import { decode, F } from './isa.ts';
import { alu } from './core.ts';

export interface PanelState {
  regs: number[];
  mem: number[];
  /** Value on the three-digit display (bin2bcd of the last DISPLAYed register). */
  display: number;
  /** Mnemonic of the instruction that last wrote each register (challenges use it). */
  src: string[];
  /** Mnemonic that produced the displayed value. */
  displaySrc: string;
  /** Button presses since power-on. */
  clocks: number;
}

export interface Effect {
  text: string;
  wrote?: number;
  memAddr?: number;
  displayed?: boolean;
  noEffect?: boolean;
  /** The board re-ran the instruction on every internal clock and the value never settled. */
  unstable?: boolean;
  /** The board re-ran the instruction and the value settled after this many runs (> 1). */
  settledAfter?: number;
}

/** LEDs in SWmode with an empty stored program: LED[15] = SWmode, LED[14:12] = jumpCount (0), LED[11:9] = jumpLimit[2:0]
 *  (initialised to 0xFF), LED[8] = branch (0), LED[7:0] = PC (held at 0 in SWmode). */
export const PANEL_LEDS = 0b1000_1110_0000_0000;

function blank(): PanelState {
  return { regs: Array(8).fill(0), mem: Array(256).fill(0), display: 0, src: Array(8).fill(''), displaySrc: '', clocks: 0 };
}

/** State after power-on with an empty stored program: SWmode, registers and memory 0, display 000. */
export function panelPowerOn(): PanelState { return blank(); }

/**
 * In SWmode the latched instruction stays decoded, and the register file is written on every internal clock
 * (100 MHz / 32) until the next press. An ALU op whose target is also a source therefore runs over and over.
 * Returns the settled value, or the first result with stable = false if the values cycle.
 */
function settle(op: number, rt: number, ra: number, rb: number, regs: number[]): { value: number; runs: number; stable: boolean } {
  const r = [...regs];
  const first = alu(op, r[ra], r[rb]);
  for (let i = 1; i <= 300; i++) {
    const v = alu(op, r[ra], r[rb]);
    if (i > 1 && v === r[rt]) return { value: v, runs: i - 1, stable: true };
    r[rt] = v;
  }
  return { value: first, runs: 0, stable: false };
}

/** Execute one instruction word, as one press of BTNC in SWmode. Returns the new state and what happened. */
export function clockIn(s: PanelState, word: number): { state: PanelState; effect: Effect } {
  const d = decode(word & 0xffff);
  const st: PanelState = { ...s, regs: [...s.regs], mem: [...s.mem], src: [...s.src], clocks: s.clocks + 1 };
  const write = (r: number, v: number, m: string): Effect => {
    if (r === 0) return { text: 'R0 is hard-wired to 0; the write is discarded', noEffect: true };
    st.regs[r] = v & 255; st.src[r] = m;
    return { text: `R${r} ← ${v & 255}`, wrote: r };
  };
  const op = d.funct >> 3;
  let effect: Effect;
  if (op === 0) {
    const sub = d.funct & 7;
    if (sub === 7) effect = write(d.rt, 0, d.mnemonic);
    else if (d.rt !== 0 && (d.rt === d.ra || d.rt === d.rb)) {
      const k = settle(sub, d.rt, d.ra, d.rb, s.regs);
      effect = write(d.rt, k.value, d.mnemonic);
      if (!k.stable) {
        effect.unstable = true;
        effect.text += `, but on the board this kept re-running until the next press, so R${d.rt} never settled`;
      } else if (k.runs > 1) {
        effect.settledAfter = k.runs;
        effect.text += ` (re-run on every internal clock, it settles after ${k.runs} runs)`;
      }
    } else effect = write(d.rt, alu(sub, s.regs[d.ra], s.regs[d.rb]), d.mnemonic);
  } else if (op === 1) {
    effect = write(d.rt, d.imm, 'LI');
  } else if (op === 3) {
    st.display = s.regs[d.rt]; st.displaySrc = s.src[d.rt];
    effect = { text: `display ← R${d.rt} = ${s.regs[d.rt]}`, displayed: true };
  } else if (d.funct === F.SB) {
    st.mem[d.imm] = s.regs[d.rt];
    effect = { text: `M[${d.imm}] ← R${d.rt} = ${s.regs[d.rt]}`, memAddr: d.imm };
  } else if (d.funct === F.LB) {
    effect = write(d.rt, s.mem[d.imm], 'LB');
    effect.memAddr = d.imm;
  } else if (d.funct === F.LINK || d.funct === F.JUMP || d.funct === F.BEQ) {
    effect = { text: `${d.mnemonic} is not implemented in switch mode: no effect`, noEffect: true };
  } else {
    effect = { text: 'unassigned opcode: no effect', noEffect: true };
  }
  return { state: st, effect };
}

export interface Challenge { id: string; title: string; goal: string; par: number; hint: string; done: (s: PanelState) => boolean }

export const CHALLENGES: Challenge[] = [
  {
    id: 'show42', title: 'Light the display', goal: 'Make the display show 42.', par: 2,
    hint: 'Load an immediate into a register with LI (funct 01000), then DISPLAY it (11000). The immediate is the low 8 bits.',
    done: (s) => s.display === 42,
  },
  {
    id: 'add', title: 'Add two numbers', goal: 'Show 100 + 55, computed by ADD.', par: 4,
    hint: 'Two LIs into different registers, then ADD (00010) into a third register, with RA in bits 5:3 and RB in bits 2:0. Then DISPLAY it.',
    done: (s) => s.display === 155 && s.displaySrc === 'ADD',
  },
  {
    id: 'mem', title: 'Round trip through memory', goal: 'Store 7 at address 9, load it back into another register, and show it.', par: 4,
    hint: 'SB (10000) writes RT to M[imm]; LB (10001) reads M[imm] into RT. Load into a different register from the one you stored.',
    done: (s) => s.mem[9] === 7 && s.display === 7 && s.displaySrc === 'LB',
  },
  {
    id: 'ff', title: 'All ones', goal: 'Show 255 without typing 255 into an immediate.', par: 2,
    hint: 'R0 always reads 0. What is NOT (0 OR 0) in 8 bits? NOR is funct 00101.',
    done: (s) => s.display === 255 && s.displaySrc !== 'LI' && s.displaySrc !== '',
  },
];
