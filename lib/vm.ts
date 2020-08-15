import { BufReader } from "https://deno.land/std@0.65.0/io/bufio.ts";
import { TextProtoReader } from "https://deno.land/std@0.65.0/textproto/mod.ts";

import { FileReader } from "./file_reader.ts"

import {
  invalidType,
  notYetImpl
} from "./utils.ts"

const stdinReader = new TextProtoReader(new BufReader(Deno.stdin));

async function waitInput(){
  await stdinReader.readLine();
}

async function sleep(msec: number): Promise<void> {
  return new Promise(resolve => {
    setTimeout(()=>{
      resolve();
    }, msec);
  });
}

// --------------------------------

export type MemVal = string | number;
type RegVal = number;

class Insn {
  addr: number;
  values: MemVal[];

  constructor(addr: number, values: MemVal[]) {
    this.addr = addr;
    this.values = values;
  }

  getOp(): string {
    const x0 = this.values[0];
    if (typeof x0 === "string") {
      return x0;
    } else {
      throw invalidType(x0);
    }
  }
}

export class Memory {
  main: Array<MemVal>;
  stack: Array<number>;
  vram: Array<number>;

  readonly MAIN_DUMP_WIDTH = 30;

  constructor(stackSize: number){
    this.main = [];
    this.stack = new Array(stackSize);

    this.vram = new Array(50);
    for (let i=0; i<this.vram.length; i++) {
      this.vram[i] = 0;
    }
  }

  _dumpMain_getInsns() {
    const insns = [];
    let addr = 0;

    while (addr < this.main.length) {
      const op = this.main[addr];
      if (typeof op !== "string") {
        throw invalidType(op);
      }
      const numArgs = Vgvm.numArgsFor(op);
      insns.push(
        new Insn(
          addr,
          this.main.slice(addr, addr + numArgs + 1)
        )
      );
      addr += 1 + numArgs;
    }

    return insns;
  }

  _dumpMain_head(insn: Insn, pc: number): string {
    if (insn.addr === pc) {
      return "pc =>";
    } else {
      return "     ";
    }
  }

  // TODO
  _dumpMain_color(insn: Insn): string {
    // const op = insn.getOp();
    // if (
    //   ["exit", "call", "ret", "jump", "jump_eq"].includes(insn.getOp())
    // ) {
    //   return "\e[0;31m"; // red
    // } else if (op === "_cmt") {
    //   return "\e[0;34m"; // blue
    // } else {
    //   return "";
    // }
    return "";
  }

  _dumpMain_indent(op: string): string {
    return op === "label" ? "" : "  ";
  }

  dumpMain(pc: number) {
    const insns = this._dumpMain_getInsns();

    return insns
      .filter(insn =>
              pc - this.MAIN_DUMP_WIDTH <= insn.addr &&
              insn.addr <= pc + this.MAIN_DUMP_WIDTH
             )
      .map(insn => {
        return [
          this._dumpMain_head(insn, pc),
          " " + insn.addr,
          " " + this._dumpMain_color(insn),
          this._dumpMain_indent(insn.getOp()),
          Deno.inspect(insn.values),
        ].join("");
      })
      .join("\n");
  }

  _dumpStack_buildHead(addr: number, sp: number, bp: number) {
    if (addr === sp) {
      if (sp === bp) {
        return "sp bp => ";
      } else {
        return "sp    => ";
      }
    } else if (addr === bp)  {
      return "   bp => ";
    } else {
      return "         ";
    }
  }

  dumpStack(sp: number, bp: number) {
    const lines: string[] = [];

    let addr = -1;
    for (let val of this.stack) {
      addr++;

      if (addr < sp - 8) {
        continue;
      }
      if (addr > sp + 8) {
        continue;
      }

      const head = this._dumpStack_buildHead(addr, sp, bp);

      lines.push(head + `${addr} ${Deno.inspect(val)}`);
    }

    return lines.join("\n");
  }

  dumpVram() {
    const main = [];

    for (let i=0; i<5; i++) {
      let offset = i * 5;
      main.push(this.vram.slice(offset, offset + 5));
    }

    let s =
      main.map(row => {
        return row.map((val: number) =>
                       val === 1 ? "@" : "."
                      ).join("");
      })
      .join("\n");

    return s;
  }
}

export class Vgvm {
  regA: RegVal;
  regB: RegVal;

  zf: RegVal;

  mem: Memory;

  pc: number;

  sp: number;
  bp: number;

  step: number;

  static FLAG_TRUE: 1 = 1;
  static FLAG_FALSE: 0 = 0;

  static NUM_ARGS_MAP = new Map<string, number>([
    ["cp"       , 2],
    ["set_vram" , 2],
    ["get_vram" , 2],

    ["set_reg_a" , 1],
    ["set_reg_b" , 1],
    ["label"     , 1],
    ["call"      , 1],
    ["push"      , 1],
    ["pop"       , 1],
    ["add_sp"    , 1],
    ["sub_sp"    , 1],
    ["jump_eq"   , 1],
    ["jump"      , 1],
    ["_cmt"      , 1],

    ["ret"     , 0],
    ["exit"    , 0],
    ["add_ab"  , 0],
    ["compare" , 0],
    ["mult_ab" , 0],
  ]);

  constructor(mem: Memory, stackSize: number){
    this.regA = 0;
    this.regB = 0;
    this.zf = 0;
    this.mem = mem;
    this.pc = 0;
    this.sp = stackSize - 1;
    this.bp = stackSize - 1;

    this.step = 0;
  }

  ctor(){
    return Vgvm;
  }

  setSp(addr: number) {
    if (addr < 0) {
      throw new Error("Stack overflow");
    }
    this.sp = addr;
  }

  setWords(words: MemVal[]){
    this.mem.main = words;
  }

  execute(){
    const op = this.mem.main[this.pc];
    if (typeof op !== "string") {
      throw invalidType(op);
    }

    let arg: MemVal;

    const pcDelta: number = 1 + Vgvm.numArgsFor(op);

    switch(op){
    case "set_reg_a":
      arg = this.mem.main[this.pc + 1];
      this.setRegA(arg);
      this.pc += pcDelta;
      break;

    case "set_reg_b":
      arg = this.mem.main[this.pc + 1];
      this.setRegB(arg);
      this.pc += pcDelta;
      break;

    case "cp":
      this.copy(
        this.mem.main[this.pc + 1],
        this.mem.main[this.pc + 2]
      );
      this.pc += pcDelta;
      break;

    case "add_ab":
      this.addAB();
      this.pc += pcDelta;
      break;

    case "mult_ab":
      this.multAB();
      this.pc += pcDelta;
      break;

    case "add_sp":
      this.addSp();
      this.pc += pcDelta;
      break;

    case "sub_sp":
      this.subSp();
      this.pc += pcDelta;
      break;

    case "compare":
      this.compare();
      this.pc += pcDelta;
      break;

    case "label":
      this.pc += pcDelta;
      break;

    case "jump":
      this.jump();
      break;

    case "jump_eq":
      this.jumpEq();
      break;

    case "call":
      this._call();
      break;

    case "ret":
      this.ret();
      break;

    case "push":
      this.push();
      this.pc += pcDelta;
      break;

    case "pop":
      this.pop();
      this.pc += pcDelta;
      break;

    case "set_vram":
      this.setVram();
      this.pc += pcDelta;
      break;

    case "get_vram":
      this.getVram();
      this.pc += pcDelta;
      break;

    case "_cmt":
      this.pc += pcDelta;
      break;

    case "exit":
      return;

    default:
      throw notYetImpl(op);
    }
  }

  async start(){
    this.dump();
    console.log("Press enter key to start");
    await waitInput();

    while(true){
      this.step++;
      this.execute();

      if (this.step % 1000 === 0) {
        this.dump();
        // await waitInput();
        await sleep(20);
      }
    }
  }

  static numArgsFor(operator : string): number {
    if (this.NUM_ARGS_MAP.has(operator)) {
      const n = this.NUM_ARGS_MAP.get(operator);
      if (typeof n === "number") {
        return n;
      } else {
        throw invalidType(n);
      }
    } else {
      throw new Error(`Invalid operator (${operator})`);
    }
  }

  copy(arg1: MemVal, arg2: MemVal) {
    let srcVal: number;

    if (typeof arg1 === "number") {
      srcVal = arg1;
    } else if (typeof arg1 === "string") {
      if (arg1 === "reg_a") {
        srcVal = this.regA;
      } else if (arg1 === "sp") {
        srcVal = this.sp;
      } else if (arg1 === "bp") {
        srcVal = this.bp;
      } else if (arg1.match(/^\[bp\+(\d+)\]$/)) {
        const n = parseInt(RegExp.$1);
        srcVal = this.mem.stack[this.bp + n];
      } else if (arg1.match(/^\[bp-(\d+)\]$/)) {
        const n = parseInt(RegExp.$1);
        srcVal = this.mem.stack[this.bp - n];
      } else {
        throw notYetImpl(arg1);
      }
    } else {
      throw invalidType(arg1);
    }

    if (typeof arg2 === "string") {
      if (arg2 === "reg_a") {
        this.regA = srcVal;
      } else if (arg2 === "reg_b") {
        this.regB = srcVal;
      } else if (arg2 === "bp") {
        this.bp = srcVal;
      } else if (arg2 === "sp") {
        this.setSp(srcVal);
      } else if(arg2.match(/^\[bp-(\d+)\]$/)) {
        const n = parseInt(RegExp.$1);
        this.mem.stack[this.bp - n] = srcVal;
      } else {
        throw notYetImpl(arg2);
      }
    } else {
      throw invalidType(arg2);
    }
  }

  setRegA(val: MemVal){
    if (typeof val === 'number') {
      this.regA = val;
    } else {
      throw invalidType(val);
    }
  }

  setRegB(val: MemVal){
    if (typeof val === 'number') {
      this.regB = val;
    } else {
      throw invalidType(val);
    }
  }

  addAB(){
    this.regA = this.regA + this.regB;
  }

  multAB(){
    this.regA = this.regA * this.regB;
  }

  addSp() {
    const val = this.mem.main[this.pc + 1];
    if (typeof val !== "number") { throw invalidType(val); }

    this.setSp(this.sp + val);
  }

  subSp() {
    const val = this.mem.main[this.pc + 1];
    if (typeof val !== "number") { throw invalidType(val); }

    this.setSp(this.sp - val);
  }

  compare() {
    if (this.regA === this.regB) {
      this.zf = this.ctor().FLAG_TRUE;
    } else {
      this.zf = this.ctor().FLAG_FALSE;
    }
  }

  jump() {
    const addr = this.mem.main[this.pc + 1];
    if (typeof addr !== "number") { throw invalidType(addr); }

    this.pc = addr;
  }

  jumpEq() {
    const addr = this.mem.main[this.pc + 1];
    if (typeof addr !== "number") { throw invalidType(addr); }

    if (this.zf == this.ctor().FLAG_TRUE) {
      this.pc = addr;
    } else {
      this.pc += 2;
    }
  }

  push() {
    const arg = this.mem.main[this.pc + 1];
    let valToPush: MemVal;

    if (typeof arg === "number") {
      valToPush = arg;
    } else if (typeof arg === "string") {
      if (arg === "reg_a") {
        valToPush = this.regA;
      } else if (arg === "bp") {
        valToPush = this.bp;
      } else if (arg.match(/^\[bp\-(\d+)\]$/)) {
        const n = parseInt(RegExp.$1);
        const stackAddr = this.bp - n;
        valToPush = this.mem.stack[stackAddr];
      } else if (arg.match(/^\[bp\+(\d+)\]$/)) {
        const n = parseInt(RegExp.$1);
        const stackAddr = this.bp + n;
        valToPush = this.mem.stack[stackAddr];
      } else {
        throw notYetImpl(arg);
      }
    } else {
      throw invalidType(arg);
    }

    this.setSp(this.sp - 1);
    this.mem.stack[this.sp] = valToPush;
  }

  pop() {
    const arg = this.mem.main[this.pc + 1];

    if (arg === "reg_a") {
      this.regA = this.mem.stack[this.sp];
    } else if (arg === "reg_b") {
      this.regB = this.mem.stack[this.sp];
    } else if (arg === "bp") {
      this.bp = this.mem.stack[this.sp];
    } else {
      throw notYetImpl(arg);
    }

    this.setSp(this.sp + 1);
  }

  setVram() {
    const arg1 = this.mem.main[this.pc + 1]; // vram pos
    const arg2 = this.mem.main[this.pc + 2]; // src val

    let srcVal: MemVal;

    if (typeof arg2 === "number") {
      srcVal = arg2;
    } else if (typeof arg2 === "string") {
      if (arg2.match(/^\[bp\+(\d+)\]$/)) {
        const n = parseInt(RegExp.$1);
        const stackAddr = this.bp + n;
        srcVal = this.mem.stack[stackAddr];
      } else if (arg2.match(/^\[bp\-(\d+)\]$/)) {
        const n = parseInt(RegExp.$1);
        const stackAddr = this.bp - n;
        srcVal = this.mem.stack[stackAddr];
      } else {
        throw notYetImpl(arg2);
      }
    } else {
      throw invalidType(arg2);
    }

    if (typeof arg1 === "number") {
      this.mem.vram[arg1] = srcVal;
    } else if (typeof arg1 === "string") {
      if (arg1.match(/^\[bp\-(\d+)\]$/)) {
        const n = parseInt(RegExp.$1);
        const stackAddr = this.bp - n;
        const vramAddr = this.mem.stack[stackAddr];
        this.mem.vram[vramAddr] = srcVal;
      } else {
        throw notYetImpl(arg1);
      }
    } else {
      throw invalidType(arg1);
    }
  }

  getVram() {
    const arg1 = this.mem.main[this.pc + 1];
    const arg2 = this.mem.main[this.pc + 2];

    let vramAddr: number;

    if (typeof arg1 === "number") {
      vramAddr = arg1;
    } else if (typeof arg1 === "string") {
      if (arg1.match(/^\[bp\-(\d+)\]$/)) {
        const n = parseInt(RegExp.$1);
        const stackAddr = this.bp - n;
        vramAddr = this.mem.stack[stackAddr];
      } else {
        throw notYetImpl(arg1);
      }
    } else {
      throw invalidType(arg1);
    }

    const val = this.mem.vram[vramAddr];

    if (arg2 === "reg_a") {
      this.regA = val;
    } else {
      throw notYetImpl(arg2);
    }
  }

  _call() {
    this.setSp(this.sp - 1);
    this.mem.stack[this.sp] = this.pc + 2;
    const nextAddr = this.mem.main[this.pc + 1];
    if (typeof nextAddr !== "number") { throw invalidType(nextAddr); }

    this.pc = nextAddr;
  }

  ret() {
    const retAddr = this.mem.stack[this.sp];
    this.pc = retAddr;
    this.setSp(this.sp + 1);
  }

  dumpReg() {
    return [
      `reg_a(${ this.regA })`,
      `reg_b(${ this.regB })`,
    ].join(" ");
  }

  dump() {
    console.log("================================");
    console.log(`${ this.step }: ${ this.dumpReg() } zf(${ this.zf })`);
    console.log("---- memory (main) ----");
    console.log( this.mem.dumpMain(this.pc) );
    console.log("---- memory (stack) ----");
    console.log( this.mem.dumpStack(this.sp, this.bp) );
    console.log("---- memory (vram) ----");
    console.log( this.mem.dumpVram() );
  }

  async readExeFile(path: string): Promise<MemVal[]> {
    const fr = new FileReader(path);
    const words: MemVal[] = [];

    await fr.eachLine(line => {
      const line2 = line.replace(/\n$/, "");
      if (/^-?\d+$/.test(line2)) {
        words.push(parseInt(line2));
      } else if (line2.match(/^"(.+)"$/)) {
        words.push(RegExp.$1);
      } else {
        // ignore
      }
    });

    fr.close();

    return words;
  }

  loadProgram(words: MemVal[]) {
    this.mem.main = words;
  }

  async loadProgramFile(path: string) {
    const words = await this.readExeFile(path);
    this.loadProgram(words);
  }
}
