// Instruction set of the 8-bit pipelined CPU (b-clown-code/8-bit-verilog-processor @ 75f2f79).
// 16-bit words: funct[15:11] RT[10:8] imm[7:0], with RA[5:3] RB[2:0] overlapping the immediate.
// Pure functions, no DOM: shared by the browser lab and scripts/check_cpu.mjs.

export const F = {
  AND: 0b00000, OR: 0b00001, ADD: 0b00010, SUB: 0b00011, SLT: 0b00100, NOR: 0b00101, SETEQUAL: 0b00110,
  LI: 0b01000, SB: 0b10000, LB: 0b10001, LINK: 0b10010, JUMP: 0b10011, BEQ: 0b10100, DISPLAY: 0b11000,
} as const;
export type Mnemonic = keyof typeof F;

type Form = 'rrr' | 'ri' | 'i' | 'r' | 'beq';
const FORM: Record<Mnemonic, Form> = {
  AND: 'rrr', OR: 'rrr', ADD: 'rrr', SUB: 'rrr', SLT: 'rrr', NOR: 'rrr', SETEQUAL: 'rrr',
  LI: 'ri', SB: 'ri', LB: 'ri', LINK: 'i', JUMP: 'ri', BEQ: 'beq', DISPLAY: 'r',
};
const ALU_SYM = ['&', '|', '+', '-', '<', 'NOR', '=='];

export interface Decoded {
  word: number; funct: number; rt: number; ra: number; rb: number; imm: number;
  mnemonic: string; text: string; rtl: string; kind: 'alu' | 'li' | 'mem' | 'ctrl' | 'io' | 'nop' | 'none';
}

export function fields(word: number) {
  return { funct: (word >> 11) & 31, rt: (word >> 8) & 7, imm: word & 255, ra: (word >> 3) & 7, rb: word & 7 };
}

export function decode(word: number): Decoded {
  const { funct, rt, ra, rb, imm } = fields(word);
  const op = funct >> 3, sub = funct & 7;
  const base = { word, funct, rt, ra, rb, imm };
  if (word === 0) return { ...base, mnemonic: 'NOP', text: 'NOP', rtl: 'no effect (AND R0, R0, R0)', kind: 'nop' };
  if (op === 0) {
    const names = ['AND', 'OR', 'ADD', 'SUB', 'SLT', 'NOR', 'SETEQUAL'];
    if (sub === 7) return { ...base, mnemonic: '(00111)', text: `.word 0x${hex(word, 4)}`, rtl: `R${rt} ← 0 (undefined ALU op)`, kind: 'alu' };
    const m = names[sub];
    const expr = sub === 4 ? `(R${ra} < R${rb}) ? 1 : 0` : sub === 5 ? `~(R${ra} | R${rb})` : sub === 6 ? `(R${ra} == R${rb}) ? 1 : 0` : `R${ra} ${ALU_SYM[sub]} R${rb}`;
    return { ...base, mnemonic: m, text: `${m} R${rt}, R${ra}, R${rb}`, rtl: `R${rt} ← ${expr}`, kind: 'alu' };
  }
  if (op === 1) return { ...base, mnemonic: 'LI', text: `LI R${rt}, ${imm}`, rtl: `R${rt} ← ${imm}`, kind: 'li' };
  if (op === 3) return { ...base, mnemonic: 'DISPLAY', text: `DISPLAY R${rt}`, rtl: 'no pipeline effect (board display is switch-driven)', kind: 'io' };
  switch (sub) {
    case 0: return { ...base, mnemonic: 'SB', text: `SB R${rt}, ${imm}`, rtl: `M[${imm}] ← R${rt}`, kind: 'mem' };
    case 1: return { ...base, mnemonic: 'LB', text: `LB R${rt}, ${imm}`, rtl: `R${rt} ← M[${imm}]`, kind: 'mem' };
    case 2: return { ...base, mnemonic: 'LINK', text: `LINK ${imm}`, rtl: `M[${imm}] ← address of this LINK`, kind: 'ctrl' };
    case 3: return { ...base, mnemonic: 'JUMP', text: `JUMP ${rt}, ${imm}`, rtl: `if (${imm} > jumpCount) PC ← M[${rt}]; jumpCount ← jumpCount + 1`, kind: 'ctrl' };
    case 4: return { ...base, mnemonic: 'BEQ', text: `BEQ ${rt}, R${ra}, R${rb}`, rtl: `if (R${ra} == R${rb}) PC ← M[${rt}]`, kind: 'ctrl' };
    default: return { ...base, mnemonic: `(${funct.toString(2).padStart(5, '0')})`, text: `.word 0x${hex(word, 4)}`, rtl: 'no effect (unassigned opcode)', kind: 'none' };
  }
}

export function hex(n: number, digits = 2) { return n.toString(16).toUpperCase().padStart(digits, '0'); }
export function bin(n: number, digits: number) { return n.toString(2).padStart(digits, '0'); }

export interface AsmLine { addr: number; line: number; source: string; word: number }
export interface AsmError { line: number; msg: string }
export interface AsmResult { words: number[]; lines: AsmLine[]; errors: AsmError[]; extended: boolean }

const ALIASES: Record<string, Mnemonic> = { SW: 'SB', LW: 'LB' };
export const MAX_PROGRAM = 254; // address 0 is padding; PC stops at 255

// Accepts the original Pyssembler/Assembler.cpp syntax ("ADD R5, R4, R3", "JUMP 4, 5", "LINK 4"), plus lab
// extensions: comments (; // #), blank lines, NOP, .word, SW/LW aliases, and hex (0x) / binary (0b) immediates.
// `extended` reports whether any extension was used (the original assemblers would reject such a file).
export function assemble(src: string): AsmResult {
  const words = new Array<number>(256).fill(0);
  const lines: AsmLine[] = [];
  const errors: AsmError[] = [];
  let addr = 1, extended = false;
  src.split(/\r?\n/).forEach((raw, i) => {
    const ln = i + 1;
    const code = raw.replace(/(;|\/\/|#).*$/, '').trim();
    if (code !== raw.trim()) extended = true;
    if (!code) return;
    const toks = code.split(/[\s,]+/).filter(Boolean);
    let m = toks[0].toUpperCase();
    const args = toks.slice(1);
    const err = (msg: string) => { errors.push({ line: ln, msg }); };
    if (addr > MAX_PROGRAM) { err(`program longer than ${MAX_PROGRAM} instructions`); return; }
    let word: number | null = null;
    if (m === 'NOP') { extended = true; if (args.length) return err('NOP takes no operands'); word = 0; }
    else if (m === '.WORD') {
      extended = true;
      const v = num(args[0], 0xffff);
      if (args.length !== 1 || v === null) return err('.word needs one value 0..65535');
      word = v;
    } else {
      if (ALIASES[m]) { m = ALIASES[m]; extended = true; }
      if (!(m in F)) return err(`unknown instruction "${toks[0]}"`);
      const mn = m as Mnemonic, f = F[mn], form = FORM[mn];
      const need = { rrr: 3, ri: 2, i: 1, r: 1, beq: 3 }[form];
      if (args.length !== need) return err(`${mn} takes ${need} operand${need > 1 ? 's' : ''}`);
      const R = (t: string) => { const r = reg(t); if (r === null) err(`"${t}" is not a register R0..R7`); return r ?? 0; };
      const N = (t: string, max: number, what: string) => {
        const v = num(t, max);
        if (v === null) err(`"${t}" is not a valid ${what} (0..${max})`);
        else if (!/^\d+$/.test(t)) extended = true;
        return v ?? 0;
      };
      const S = (t: string) => { // JUMP/BEQ slot: the original syntax writes a bare number; accept "R4" too
        const v = /^\d+$/.test(t) ? num(t, 7) : reg(t);
        if (v === null) err(`"${t}" is not a jump-table slot 0..7`);
        return v ?? 0;
      };
      if (form === 'rrr') word = (f << 11) | (R(args[0]) << 8) | (R(args[1]) << 3) | R(args[2]);
      else if (form === 'beq') word = (f << 11) | (S(args[0]) << 8) | (R(args[1]) << 3) | R(args[2]);
      else if (form === 'r') word = (f << 11) | (R(args[0]) << 8);
      else if (form === 'i') word = (f << 11) | N(args[0], 255, 'address');
      else if (mn === 'JUMP') word = (f << 11) | (S(args[0]) << 8) | N(args[1], 255, 'jump limit');
      else word = (f << 11) | (R(args[0]) << 8) | N(args[1], 255, mn === 'LI' ? 'value' : 'address');
    }
    if (errors.length && errors[errors.length - 1].line === ln) return;
    words[addr] = word!;
    lines.push({ addr, line: ln, source: code, word: word! });
    addr++;
  });
  return { words, lines, errors, extended };
}

function reg(t: string): number | null {
  const m = /^[Rr]([0-7])$/.exec(t);
  return m ? Number(m[1]) : null;
}
function num(t: string | undefined, max: number): number | null {
  if (t === undefined) return null;
  let v: number;
  if (/^\d+$/.test(t)) v = parseInt(t, 10);
  else if (/^0x[0-9a-f]+$/i.test(t)) v = parseInt(t.slice(2), 16);
  else if (/^0b[01]+$/i.test(t)) v = parseInt(t.slice(2), 2);
  else return null;
  return v <= max ? v : null;
}

// memory.mem text in the format $readmemb expects (and Pyssembler writes): one 16-bit binary word per line.
export function toMemFile(words: number[]): string {
  return words.map((w) => bin(w, 16)).join('\n') + '\n';
}
