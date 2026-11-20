// Cycle-level model of the 8-bit pipelined CPU (b-clown-code/8-bit-verilog-processor @ 75f2f79, Control.v).
// step() evaluates the combinational logic of one clock cycle in the order the RTL settles, then commits the
// rising edge. Every RTL quirk is kept on purpose, because the model is checked against Icarus Verilog cycle by
// cycle (scripts/check_cpu.mjs):
//  - ALUop, addressIn and PClink are latches in the decode block: opcodes that do not assign them keep the last value.
//  - Forwarding (EX/MEM -> EX, MEM/WB -> EX) carries ALU results only, never load data.
//  - The register-file bypass (Registers.v) has no R0 check, and when it matches RA it never also bypasses RB.
//  - Branches and jumps resolve in MEM; their target is dataMem[RT].
// Power-on state matches the FPGA: every register, latch and memory byte is 0.

import { F } from './isa.ts';

export interface Tag { seq: number; addr: number }
export interface IfId { instr: number; funct: number; target: number; areg: number; breg: number; immed: number; tag: Tag | null }
export interface IdEx {
  funct: number; opA: number; opB: number; memWriteData: number; addressIn: number; immed: number; aluop: number;
  targetReg: number; areg: number; breg: number; regWrite: number; memReadWrite: number; jumpEnable: number; tag: Tag | null;
}
export interface ExMem {
  funct: number; immed: number; memAddr: number; aluResult: number; memWriteData: number; zeroFlag: number;
  memReadWrite: number; regWrite: number; targetReg: number; areg: number; breg: number; jumpEnable: number; tag: Tag | null;
}
export interface MemWb { funct: number; immed: number; memData: number; aluResult: number; targetReg: number; regWrite: number; tag: Tag | null }

export interface CpuState {
  cycle: number; pc: number; jumpCount: number; nextSeq: number; retired: number;
  latch: { aluop: number; addressIn: number; pclink: number };
  ifid: IfId; idex: IdEx; exmem: ExMem; memwb: MemWb;
  regs: number[]; mem: number[];
}

// Settled combinational values for the cycle that starts in a given state.
export interface Signals {
  instr: number;
  dec: { regWrite: number; memReadWrite: number; memDataSrc: number; targetReg: number; areg: number; breg: number; jumpEnable: number; aluop: number; addressIn: number; pclink: number };
  dataA: number; dataB: number; rfBypassA: boolean; rfBypassB: boolean;
  stall: number; stallReason: '' | 'load-use' | 'control';
  forwardA: number; forwardB: number; aluA: number; aluB: number; aluResult: number; zeroFlag: number;
  memDataOut: number; storeData: number; storeBypass: boolean;
  branch: number; jumpClear: number; pcNext: number; jumpCountNext: number;
  writeData: number;
}

const zIfId = (): IfId => ({ instr: 0, funct: 0, target: 0, areg: 0, breg: 0, immed: 0, tag: null });
const zIdEx = (): IdEx => ({ funct: 0, opA: 0, opB: 0, memWriteData: 0, addressIn: 0, immed: 0, aluop: 0, targetReg: 0, areg: 0, breg: 0, regWrite: 0, memReadWrite: 0, jumpEnable: 0, tag: null });
const zExMem = (): ExMem => ({ funct: 0, immed: 0, memAddr: 0, aluResult: 0, memWriteData: 0, zeroFlag: 0, memReadWrite: 0, regWrite: 0, targetReg: 0, areg: 0, breg: 0, jumpEnable: 0, tag: null });
const zMemWb = (): MemWb => ({ funct: 0, immed: 0, memData: 0, aluResult: 0, targetReg: 0, regWrite: 0, tag: null });

export function reset(): CpuState {
  return {
    cycle: 0, pc: 0, jumpCount: 0, nextSeq: 0, retired: 0,
    latch: { aluop: 0, addressIn: 0, pclink: 0 },
    ifid: zIfId(), idex: zIdEx(), exmem: zExMem(), memwb: zMemWb(),
    regs: new Array(8).fill(0), mem: new Array(256).fill(0),
  };
}

const u8 = (n: number) => n & 255;

export function alu(op: number, a: number, b: number): number {
  switch (op) {
    case 0: return a & b;
    case 1: return a | b;
    case 2: return u8(a + b);
    case 3: return u8(a - b);
    case 4: return a < b ? 1 : 0;
    case 5: return u8(~(a | b));
    case 6: return a === b ? 1 : 0;
    default: return 0;
  }
}

export function evaluate(s: CpuState, imem: ArrayLike<number>): Signals {
  const { ifid, idex, exmem, memwb } = s;
  const instr = imem[s.pc] ?? 0;

  // decode (Control.v always @(*) case (funct[4:3]))
  const d = { regWrite: 0, memReadWrite: 0, memDataSrc: 0, targetReg: 0, areg: 0, breg: 0, jumpEnable: 0, aluop: s.latch.aluop, addressIn: s.latch.addressIn, pclink: s.latch.pclink };
  const op = ifid.funct >> 3, sub = ifid.funct & 7;
  if (op === 0) { d.aluop = sub; d.targetReg = ifid.target; d.areg = ifid.areg; d.breg = ifid.breg; d.regWrite = 1; }
  else if (op === 1) { d.regWrite = 1; d.targetReg = ifid.target; d.aluop = 2; }
  else if (op === 2) {
    if (sub === 0) { d.areg = ifid.target; d.memReadWrite = 1; d.addressIn = ifid.immed; }
    else if (sub === 1) { d.targetReg = ifid.target; d.addressIn = ifid.immed; d.regWrite = 1; }
    else if (sub === 2) { d.memReadWrite = 1; d.addressIn = ifid.immed; d.memDataSrc = 1; d.pclink = u8(s.pc - 1); }
    else if (sub === 3) { d.jumpEnable = ifid.immed > s.jumpCount ? 1 : 0; d.addressIn = ifid.target; }
    else if (sub === 4) { d.areg = ifid.areg; d.breg = ifid.breg; d.aluop = 3; d.addressIn = ifid.target; }
  }

  // write-back mux and register file read with its write-through bypass (Registers.v)
  const writeData = memwb.funct === F.LB ? memwb.memData : memwb.aluResult;
  let dataA = s.regs[d.areg], dataB = s.regs[d.breg], rfBypassA = false, rfBypassB = false;
  if (memwb.regWrite && memwb.targetReg === d.areg) { dataA = writeData; rfBypassA = true; }
  else if (memwb.regWrite && memwb.targetReg === d.breg) { dataB = writeData; rfBypassB = true; }

  // hazard unit
  let stall = 0, stallReason: Signals['stallReason'] = '';
  if (idex.funct === F.LB && (idex.targetReg === d.areg || idex.targetReg === d.breg)) { stall = 1; stallReason = 'load-use'; }
  else if (idex.funct === F.BEQ || idex.funct === F.JUMP) { stall = 1; stallReason = 'control'; }

  // forwarding unit
  const fwd = (r: number) =>
    exmem.regWrite && exmem.targetReg !== 0 && exmem.targetReg === r ? 2 :
    memwb.regWrite && memwb.targetReg !== 0 && memwb.targetReg === r ? 1 : 0;
  const forwardA = fwd(idex.areg), forwardB = fwd(idex.breg);
  let aluA: number, aluB: number;
  if (idex.funct >> 3 === 1) { aluA = idex.immed; aluB = 0; }
  else {
    aluA = forwardA === 2 ? exmem.aluResult : forwardA === 1 ? memwb.aluResult : idex.opA;
    aluB = forwardB === 2 ? exmem.aluResult : forwardB === 1 ? memwb.aluResult : idex.opB;
  }
  const aluResult = alu(idex.aluop, aluA, aluB);
  const zeroFlag = aluResult === 0 ? 1 : 0;

  // memory stage: read port, store-data bypass from WB, branch unit
  const memDataOut = s.mem[exmem.memAddr];
  const storeBypass = !!(memwb.regWrite && memwb.targetReg !== 0 && memwb.targetReg === exmem.areg);
  const storeData = storeBypass ? writeData : exmem.memWriteData;
  let branch = 0, jumpClear = 0, pcNext = u8(s.pc + 1), jumpCountNext = s.jumpCount;
  if (exmem.funct === F.BEQ) {
    branch = jumpClear = exmem.zeroFlag;
    if (branch) pcNext = memDataOut;
  } else if (exmem.funct === F.JUMP) {
    branch = jumpClear = exmem.jumpEnable;
    if (branch) pcNext = memDataOut;
    jumpCountNext = u8(s.jumpCount + 1);
  }

  return {
    instr, dec: d, dataA, dataB, rfBypassA, rfBypassB, stall, stallReason, forwardA, forwardB, aluA, aluB, aluResult, zeroFlag,
    memDataOut, storeData, storeBypass, branch, jumpClear, pcNext, jumpCountNext, writeData,
  };
}

export interface StepOptions { loop?: boolean }

// One rising clock edge. Returns the next state and the signals that were settled during the cycle.
export function step(s: CpuState, imem: ArrayLike<number>, opts: StepOptions = {}): { state: CpuState; sig: Signals } {
  const g = evaluate(s, imem);
  const { ifid, idex, exmem, memwb } = s;
  const d = g.dec;
  const clr = g.jumpClear, stall = g.stall;

  let pc: number;
  if (g.branch) pc = g.pcNext;
  else if (s.pc === 255) pc = opts.loop ? 0 : 255;
  else if (!stall) pc = g.pcNext;
  else pc = s.pc;

  let nextSeq = s.nextSeq;
  let nIfId: IfId;
  if (!stall && !clr) {
    nIfId = { instr: g.instr, funct: (g.instr >> 11) & 31, target: (g.instr >> 8) & 7, areg: (g.instr >> 3) & 7, breg: g.instr & 7, immed: g.instr & 255, tag: { seq: nextSeq++, addr: s.pc } };
  } else if (clr) nIfId = zIfId();
  else nIfId = ifid;

  const nIdEx: IdEx = !stall && !clr ? {
    funct: ifid.funct, opA: g.dataA, opB: g.dataB, memWriteData: d.memDataSrc ? d.pclink : g.dataA, addressIn: d.addressIn,
    immed: ifid.immed, aluop: d.aluop, targetReg: d.targetReg, areg: d.areg, breg: d.breg, regWrite: d.regWrite,
    memReadWrite: d.memReadWrite, jumpEnable: d.jumpEnable, tag: ifid.tag,
  } : zIdEx();

  const nExMem: ExMem = !clr ? {
    funct: idex.funct, immed: idex.immed, memAddr: idex.addressIn, aluResult: g.aluResult, memWriteData: idex.memWriteData,
    zeroFlag: g.zeroFlag, memReadWrite: idex.memReadWrite, regWrite: idex.regWrite, targetReg: idex.targetReg,
    areg: idex.areg, breg: idex.breg, jumpEnable: idex.jumpEnable, tag: idex.tag,
  } : zExMem();

  const nMemWb: MemWb = !clr ? {
    funct: exmem.funct, immed: exmem.immed, memData: g.memDataOut, aluResult: exmem.aluResult,
    targetReg: exmem.targetReg, regWrite: exmem.regWrite, tag: exmem.tag,
  } : zMemWb();

  let regs = s.regs;
  if (memwb.regWrite && memwb.targetReg !== 0) { regs = regs.slice(); regs[memwb.targetReg] = g.writeData; }
  let mem = s.mem;
  if (exmem.memReadWrite) { mem = mem.slice(); mem[exmem.memAddr] = g.storeData; }

  return {
    state: {
      cycle: s.cycle + 1, pc, jumpCount: g.jumpCountNext, nextSeq, retired: s.retired + (memwb.tag ? 1 : 0),
      latch: { aluop: d.aluop, addressIn: d.addressIn, pclink: d.pclink },
      ifid: nIfId, idex: nIdEx, exmem: nExMem, memwb: nMemWb, regs, mem,
    },
    sig: g,
  };
}

// True when nothing left can change state: fetch is in empty instruction memory and every stage holds a no-op.
// (An all-zero word is AND R0, R0, R0: it sets regWrite, but R0 is never written, so it changes nothing.)
export function drained(s: CpuState, imem: ArrayLike<number>): boolean {
  for (let a = s.pc; a < 256; a++) if (imem[a]) return false;
  const nop = (funct: number, target: number) => funct === 0 && target === 0;
  return s.ifid.instr === 0 && nop(s.idex.funct, s.idex.targetReg) && !s.idex.memReadWrite
    && nop(s.exmem.funct, s.exmem.targetReg) && !s.exmem.memReadWrite && nop(s.memwb.funct, s.memwb.targetReg);
}
