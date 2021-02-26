import { FileReader } from "./lib/file_reader.ts"

import {
  invalidType,
  notYetImpl
} from "./lib/utils.ts"

function include<T>(xs: T[], x: T): boolean {
  for (let _x of xs) {
    if (_x === x) {
      return true;
    }
  }
  return false;
}

// --------------------------------

type NodeElem = string | number | NodeList;

type PlainElem = string | number | PlainArray;
type PlainArray = PlainElem[];

class NodeList {
  els: NodeElem[];

  constructor() {
    this.els = [];
  }

  append(el: NodeElem) {
    this.els.push(el);
  }

  hd() {
    return this.els[0];
  }

  tl() {
    return this.els.slice(1);
  }

  toPlain(): PlainArray {
    return this.els.map(el => {
      if (typeof el === "number") {
        return el;
      } else if (typeof el === "string") {
        return el;
      } else {
        return el.toPlain();
      }
    });
  }

  get() {
    return this.els;
  }

}

// Assembly lines
class Alines {
  alines: string[];

  constructor() {
    this.alines = [];
  }

  push(line: string) {
    this.alines.push(line);
  }

  pushAll(lines: Alines) {
    lines.get().forEach(line => this.push(line));
  }

  get() {
    return this.alines;
  }
}

const _parse = (json: string): [NodeList, number] => {
  let pos = 1;
  const xs = new NodeList();

  while (pos <= json.length - 1) {
    const rest = json.slice(pos);

    if (rest[0] == "[") {
      const [childXs, size] = _parse(rest);
      xs.append(childXs);
      pos += size;
    } else if (rest[0] == "]") {
      pos++;
      break;
    } else if (
      rest[0] == " " ||
      rest[0] == "\n" ||
      rest[0] == ","
    ) {
      pos++;
    } else if (rest.match(/^(-?\d+)/)) {
      const m1 = RegExp.$1;
      xs.append(parseInt(m1));
      pos += m1.length;
    } else if (rest.match(/^"(.*?)"/)) {
      const m1 = RegExp.$1;
      xs.append(m1);
      pos += m1.length + 2;
    } else {
      throw notYetImpl(xs);
    }
  }
  return [xs, pos];
};

const parse = (json: string): NodeList => {
  const jsonWithoutComment = json.split("\n")
        .filter((line: string) => ! /^ *\/\//.test(line))
        .join("\n");
  const root = _parse(jsonWithoutComment);
  return root[0];
};

// --------------------------------

function toFnArgRef(
  fnArgNames: string[],
  fnArgName: string
): string
{
  const index = fnArgNames.indexOf(fnArgName);
  return `[bp+${index + 2}]`;
}

function toLvarRef(
  lvarNames: string[],
  lvarName: string
): string
{
  const index = lvarNames.indexOf(lvarName);
  return `[bp-${index + 1}]`;
}

// --------------------------------

let globalLabelId = 0;

function codegenCase(
  fnArgNames: string[],
  lvarNames: string[],
  whenBlocks: NodeElem[]
): Alines
{
  const alines = new Alines();

  globalLabelId++;
  const labelId = globalLabelId;

  let whenIndex = -1;
  const thenBodies: Alines[] = [];

  for (let whenBlock of whenBlocks) {
    whenIndex++;

    if (whenBlock instanceof NodeList) {
      // OK
    } else {
      throw invalidType(whenBlock);
    }
    const cond = whenBlock.hd();
    if (cond instanceof NodeList) {
      // OK
    } else {
      throw invalidType(cond);
    }
    const rest = whenBlock.tl();

    const condHead = cond.hd();
    // const condRest = cond.tl();

    alines.push(`  # 条件 ${labelId}_${whenIndex}: ${Deno.inspect(cond.toPlain())}`);

    if (condHead === "eq") {
      alines.pushAll(codegenExp(fnArgNames, lvarNames, cond.get()));

      alines.push(`  set_reg_b 1`);

      alines.push(`  compare`);
      alines.push(`  jump_eq when_${labelId}_${whenIndex}`);

      const thenAlines = new Alines();
      thenAlines.push(`label when_${labelId}_${whenIndex}`);
      thenAlines.pushAll(codegenStmts(fnArgNames, lvarNames, rest));
      thenAlines.push(`  jump end_case_${labelId}`);
      thenBodies.push(thenAlines);
    } else {
      throw notYetImpl();
    }
  }

  alines.push(`  jump end_case_${labelId}`);

  for (let thenBody of thenBodies) {
    alines.pushAll(thenBody);
  }

  alines.push(`label end_case_${labelId}`);

  return alines;
}

function codegenWhile(
  fnArgNames: string[],
  lvarNames: string[],
  rest: NodeElem[]
): Alines
{
  const alines = new Alines();

  if (rest[0] instanceof NodeList) {
    // OK
  } else {
    throw invalidType(rest[0]);
  }
  const condExp = rest[0].get();

  const body = rest[1];
  if (body instanceof NodeList) {
    // OK
  } else {
    throw invalidType(body);
  }

  globalLabelId++;
  const labelId = globalLabelId;

  alines.push("");

  // ループの先頭
  alines.push(`label while_${labelId}`);

  alines.pushAll(codegenExp(fnArgNames, lvarNames, condExp));
  alines.push(`  set_reg_b 1`);
  alines.push(`  compare`);

  // true の場合ループの本体を実行
  alines.push(`  jump_eq true_${labelId}`);

  // false の場合ループを抜ける
  alines.push(`  jump end_while_${labelId}`);

  alines.push(`label true_${labelId}`);
  alines.pushAll(codegenStmts(fnArgNames, lvarNames, body.get()));

  // ループの先頭に戻る
  alines.push(`  jump while_${labelId}`);

  alines.push(`label end_while_${labelId}`);
  alines.push("");

  return alines;
}

function codegenExp_left(
  fnArgNames: string[],
  lvarNames: string[],
  arg: NodeElem
): [string, Alines]
{
  const emptyAlines = new Alines();

  if (typeof arg === "number") {
    return [String(arg), emptyAlines];

  } else if (typeof arg === "string") {
    if (include(fnArgNames, arg)) {
      return [toFnArgRef(fnArgNames, arg), emptyAlines];
    } else if (include(lvarNames, arg)) {
      return [toLvarRef(lvarNames, arg), emptyAlines];
    } else {
      throw notYetImpl(arg);
    }

  } else if (arg instanceof NodeList) {
    const alines = codegenExp(fnArgNames, lvarNames, arg.get());
    return ["reg_a", alines];

  } else {
    throw notYetImpl(arg);
  }
}

function codegenExp_right(
  fnArgNames: string[],
  lvarNames: string[],
  arg: NodeElem
): [string, Alines]
{
  const emptyAlines = new Alines();

  if (typeof arg === "number") {
    return [String(arg), emptyAlines];

  } else if (typeof arg === "string") {
    if (include(fnArgNames, arg)) {
      return [toFnArgRef(fnArgNames, arg), emptyAlines];
    } else if (include(lvarNames, arg)) {
      return [toLvarRef(lvarNames, arg), emptyAlines];
    } else {
      throw notYetImpl(arg);
    }

  } else if (arg instanceof NodeList) {
    const alines = codegenExp(fnArgNames, lvarNames, arg.get());
    return ["reg_a", alines];

  } else {
    throw notYetImpl(arg);
  }
}

function codegenExp(
  fnArgNames: string[],
  lvarNames: string[],
  exp: NodeElem[]
): Alines
{
  const alines = new Alines();

  const operator = exp[0];
  const args = exp.slice(1);

  const [left, leftAlines] = codegenExp_left(fnArgNames, lvarNames, args[0]);
  alines.pushAll(leftAlines);
  alines.push(`  push ${left}`);
  
  const [right, rightAlines] = codegenExp_right(fnArgNames, lvarNames, args[1]);
  alines.pushAll(rightAlines);
  alines.push(`  push ${right}`);

  if (operator === "+") {
    alines.push(`  pop reg_b`);
    alines.push(`  pop reg_a`);
    alines.push(`  add_ab`);

  } else if (operator === "*") {
    alines.push(`  pop reg_b`);
    alines.push(`  pop reg_a`);
    alines.push(`  mult_ab`);

  } else if (operator === "eq") {
    globalLabelId++;
    const labelId = globalLabelId;

    alines.push(`  pop reg_b`);
    alines.push(`  pop reg_a`);

    alines.push(`  compare`);
    alines.push(`  jump_eq then_${labelId}`);

    alines.push(`  set_reg_a 0`);
    alines.push(`  jump end_eq_${labelId}`);

    alines.push(`label then_${labelId}`);
    alines.push(`  set_reg_a 1`);

    alines.push(`label end_eq_${labelId}`);

  } else if (operator === "neq") {
    globalLabelId++;
    const labelId = globalLabelId;

    alines.push(`  pop reg_b`);
    alines.push(`  pop reg_a`);

    alines.push(`  compare`);
    alines.push(`  jump_eq then_${labelId}`);

    alines.push(`  set_reg_a 1`);
    alines.push(`  jump end_neq_${labelId}`);

    alines.push(`label then_${labelId}`);
    alines.push(`  set_reg_a 0`);

    alines.push(`label end_neq_${labelId}`);

  } else {
    throw notYetImpl(operator);
  }
  
  return alines;
}

function _codegenCall_pushFnArg(
  fnArgNames: string[],
  lvarNames: string[],
  fnArg: NodeElem
): Alines
{
  const alines = new Alines();

  if (typeof fnArg === "number") {
    alines.push(`  push ${fnArg}`);
  } else if (typeof fnArg === "string") {
    if (include(fnArgNames, fnArg)) {
      const fnArgAddr = toFnArgRef(fnArgNames, fnArg);
      alines.push(`  push ${fnArgAddr}`);
    } else if (include(lvarNames, fnArg)) {
      const lvarAddr = toLvarRef(lvarNames, fnArg);
      alines.push(`  push ${lvarAddr}`);
    } else {
      throw notYetImpl("fnArg", fnArg);
    }
  } else {
    throw notYetImpl("fnArg", fnArg);
  }

  return alines;
}

function codegenCall(
  fnArgNames: string[],
  lvarNames: string[],
  stmtRest: NodeElem[]
): Alines
{
  const alines = new Alines();

  const fnName = stmtRest[0];
  const fnArgs = stmtRest.slice(1);

  fnArgs.reverse().forEach((fnArg)=>{
    alines.pushAll(_codegenCall_pushFnArg(fnArgNames, lvarNames, fnArg));
  });

  alines.pushAll(codegenComment(`call  ${fnName}`));
  alines.push(`  call ${fnName}`);
  alines.push(`  add_sp ${fnArgs.length}`);

  return alines;
}

function codegenCallSet(
  fnArgNames: string[],
  lvarNames: string[],
  stmtRest: NodeElem[]
): Alines
{
  const alines = new Alines();

  const lvarName = stmtRest[0];
  const fnTemp = stmtRest[1];
  if (fnTemp instanceof NodeList) {
    // OK
  } else {
    throw invalidType(fnTemp);
  }

  const fnName = fnTemp.hd();
  const fnArgs = fnTemp.tl();

  for (let i=fnArgs.length - 1; i>=0; i--) {
    const fnArg = fnArgs[i];
    alines.pushAll(_codegenCall_pushFnArg(fnArgNames, lvarNames, fnArg));
  }

  alines.pushAll(codegenComment(`call_set  ${fnName}`));
  alines.push(`  call ${fnName}`);
  alines.push(`  add_sp ${fnArgs.length}`);

  if (typeof lvarName !== "string") {
    throw invalidType(lvarName);
  }
  const lvarRef = toLvarRef(lvarNames, lvarName);
  alines.push(`  cp reg_a ${lvarRef}`);

  return alines;
}

function codegenSet_srcVal(
  fnArgNames: string[],
  lvarNames: string[],
  rest: NodeElem[]
): [Alines, string]
{
  const alines = new Alines();

  if (typeof rest[1] === "number") {
    return [alines, String(rest[1])];

  } else if (rest[1] instanceof NodeList) {
    const exp = rest[1];
    if (exp instanceof NodeList) {
      // ok
    } else {
      throw invalidType(exp);
    }
    alines.pushAll(codegenExp(fnArgNames, lvarNames, exp.els));

    return [alines, "reg_a"];

  } else if (typeof rest[1] === "string") {
    if (include(fnArgNames, rest[1])) {
      const fnArgRef = toFnArgRef(fnArgNames, rest[1]);
      return [alines, fnArgRef];
    } else if (include(lvarNames, rest[1])) {
      const lvarRef = toLvarRef(lvarNames, rest[1]);
      return [alines, lvarRef];

    } else if (rest[1].match(/^vram\[(\d+)\]$/)) {
      throw notYetImpl();
    } else if (rest[1].match(/^vram\[([a-z_][a-z0-9_]*)\]$/)) {
      const varName = RegExp.$1;

      if (include(lvarNames, varName)) {
        const lvarRef = toLvarRef(lvarNames, varName);
        alines.push(`  get_vram ${lvarRef} reg_a`);
      } else {
        throw notYetImpl();
      }

      return [alines, "reg_a"];

    } else {
      throw notYetImpl();
    }

  } else {
    throw invalidType(rest[1]);
  }
}

function codegenSet(
  fnArgNames: string[],
  lvarNames: string[],
  rest: NodeElem[]
):Alines
{
  const alines = new Alines();

  let dest: string;
  if (typeof rest[0] === "string") {
    dest = rest[0];
  } else {
    throw invalidType(rest[0]);
  }

  const [_alines, _srcVal] = codegenSet_srcVal(fnArgNames, lvarNames, rest);
  alines.pushAll(_alines);
  let srcVal = _srcVal;

  if (dest.match(/^vram\[(.+)\]$/)) {
    const vramAddr = RegExp.$1;

    if (vramAddr.match(/^\d+$/)) {
      throw notYetImpl();
    } else if (include(lvarNames, vramAddr)) {
      const lvarRef = toLvarRef(lvarNames, vramAddr);
      alines.push(`  set_vram ${lvarRef} ${srcVal}`);
    } else {
      throw notYetImpl();
    }

  } else {
    const lvarAddr = toLvarRef(lvarNames, dest);
    alines.push(`  cp ${srcVal} ${lvarAddr}`);
  }

  return alines;
}

function codegenReturn(
  fnArgNames: string[],
  lvarNames: string[],
  stmtRest: NodeElem[]
):Alines
{
  const alines = new Alines();

  const retval = stmtRest[0];

  if (typeof retval === "number") {
    throw notYetImpl(retval);
  } else if (typeof retval === "string") {

    if (retval.match(/^vram\[([a-z0-9_]+)\]$/)) {
      const varName = RegExp.$1;
      if (include(lvarNames, varName)) {
        const lvarRef = toLvarRef(lvarNames, varName);
        alines.push(`  get_vram ${lvarRef} reg_a`);
      } else {
        throw notYetImpl(retval);
      }

    } else if (include(lvarNames, retval)) {
      const lvarRef = toLvarRef(lvarNames, retval);
      alines.push(`  cp ${lvarRef} reg_a`);
      
    } else {
      throw notYetImpl(retval);
    }

  } else {
    throw notYetImpl(retval);
  }

  return alines;
}

function codegenComment(comment: string): Alines {
  const alines = new Alines();

  alines.push(`  _cmt ` + comment.replace(new RegExp(" ", "g"), "~"));

  return alines;
}

function codegenStmts(
  fnArgNames: string[],
  lvarNames: string[],
  stmts: NodeElem[]
): Alines
{
  const alines = new Alines();

  for (let stmt of stmts) {
    if (stmt instanceof NodeList) {
      ;
    } else {
      throw new Error("invalid type");
    }
    const stmtHead = stmt.hd();
    const stmtRest = stmt.tl();
    
    if (stmtHead === "call") {
      alines.pushAll(codegenCall(fnArgNames, lvarNames, stmtRest));
    } else if (stmtHead === "call_set") {
      alines.pushAll(codegenCallSet(fnArgNames, lvarNames, stmtRest));

    } else if (stmtHead === "var") {
      if (typeof stmtRest[0] === "string") {
        lvarNames.push(stmtRest[0]);
      } else {
        throw invalidType(stmtRest[0]);
      }
      alines.push(`  sub_sp 1`);
      if (stmtRest.length == 2) {
        alines.pushAll(codegenSet(fnArgNames, lvarNames, stmtRest));
      }

    } else if (stmtHead === "set") {
      alines.pushAll(codegenSet(fnArgNames, lvarNames, stmtRest));

    } else if (stmtHead === "eq") {
      throw notYetImpl();

    } else if (stmtHead === "return") {
      alines.pushAll(codegenReturn(fnArgNames, lvarNames, stmtRest));

    } else if (stmtHead === "case") {
      alines.pushAll(codegenCase(fnArgNames, lvarNames, stmtRest));

    } else if (stmtHead === "while") {
      alines.pushAll(codegenWhile(fnArgNames, lvarNames, stmtRest));

    } else if (stmtHead === "_cmt") {
      const cmt = stmtRest[0];
      if (typeof cmt === "string") {
        // OK
      } else{
        throw invalidType(cmt);
      }
      alines.pushAll(codegenComment(cmt));

    } else {
      throw notYetImpl("stmtHead", stmtHead);
    }
    ;
  }

  return alines;
}

function codegenFunc_getFnArgNames(nodeElem: NodeElem): string[] {
  let fnArgNames: string[];

  if (nodeElem instanceof NodeList) {
    fnArgNames =
      nodeElem.toPlain().map(el => {
        if (typeof el === "string") {
          return el;
        } else {
          throw invalidType(el);
        }
      });
  } else {
    throw invalidType(nodeElem);
  }

  return fnArgNames;
}

function codegenFunc(rest: NodeElem[]): Alines {
  const alines = new Alines();

  const fnName = rest[0];

  const fnArgNames = codegenFunc_getFnArgNames(rest[1]);

  let body: NodeList;

  if (rest[2] instanceof NodeList) {
    body = rest[2];
  } else {
    throw new Error("invalid type");
  }

  alines.push(``);
  alines.push(`label ${fnName}`);
  alines.push(`  push bp`);
  alines.push(`  cp sp bp`);

  alines.push(``);
  alines.push(`  # 関数の処理本体`);

  const lvarNames: string[] = [];

  const stmts: NodeElem[] = body.get();

  alines.pushAll(codegenStmts(fnArgNames, lvarNames, stmts));

  alines.push(``);
  alines.push(`  cp bp sp`);
  alines.push(`  pop bp`);
  alines.push(`  ret`);

  return alines;
}

function codegenTopStmts(
  fnArgNames: string[],
  lvarNames: string[],
  rest: NodeElem[]
): Alines
{
  let alines = new Alines();

  for (let stmt of rest) {
    let stmtHead: string;
    let stmtRest: NodeElem[];

    if (stmt instanceof NodeList) {
      const hd = stmt.hd();
      if (typeof hd === "string") {
        stmtHead = hd;
      } else {
        throw invalidType(hd);
      }
      stmtRest = stmt.tl();
    } else {
      throw invalidType(stmt);
    }

    if (stmtHead === "func") {
      alines.pushAll(codegenFunc(stmtRest));

    } else if (stmtHead === "_cmt") {
      const cmt = stmtRest[0];
      if (typeof cmt === "string") {
        // OK
      } else {
        throw invalidType(stmtRest);
      }

      alines.pushAll(codegenComment(cmt));

    } else {
      throw notYetImpl("stmtHead", stmtHead);
    }
  }

  return alines;
}

function codegen(topStmts: NodeList) {
  let alines = new Alines();

  alines.push("  call main");
  alines.push("  exit");

  const head = topStmts.hd();
  const rest = topStmts.tl();

  alines.pushAll(codegenTopStmts([], [], rest));

  return alines;
}

// --------------------------------

const src = await FileReader.readAll(Deno.args[0]);

const tree = parse(src);

const alines = codegen(tree);

for (let aline of alines.get()) {
  console.log(aline);
}
