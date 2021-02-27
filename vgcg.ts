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

  hd(): NodeElem {
    return this.els[0];
  }

  tl(): NodeElem[] {
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

  size(): number {
    return this.els.length;
  }

  static fromEls(els: NodeElem[]): NodeList {
    const nl = new NodeList();
    nl.els = els;
    return nl;
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

function matchVram(str: string): string {
  if (str.match(/^vram\[(.+)\]$/)) {
    return RegExp.$1;
  } else {
    return "";
  }
}

// --------------------------------

let globalLabelId = 0;

function codegenVar(
  fnArgNames: string[],
  lvarNames: string[],
  stmtRest: NodeList
): Alines
{
  const alines = new Alines();

  alines.push(`  sub_sp 1`);

  if (stmtRest.size() === 2) {
    alines.pushAll(
      codegenSet(fnArgNames, lvarNames, stmtRest.get())
    );
  }

  return alines;
}

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

  const labelEnd = `end_case_${labelId}`;
  const labelWhenHead = `when_${labelId}`;

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
      alines.pushAll(codegenExpr(fnArgNames, lvarNames, cond.get()));

      alines.push(`  set_reg_b 1`);

      alines.push(`  compare`);
      alines.push(`  jump_eq ${labelWhenHead}_${whenIndex}`);

      const thenAlines = new Alines();
      thenAlines.push(`label ${labelWhenHead}_${whenIndex}`);
      thenAlines.pushAll(codegenStmts(fnArgNames, lvarNames, rest));
      thenAlines.push(`  jump ${labelEnd}`);
      thenBodies.push(thenAlines);
    } else {
      throw notYetImpl();
    }
  }

  alines.push(`  jump ${labelEnd}`);

  for (let thenBody of thenBodies) {
    alines.pushAll(thenBody);
  }

  alines.push(`label ${labelEnd}`);

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
  const condExpr = rest[0].get();

  const body = rest[1];
  if (body instanceof NodeList) {
    // OK
  } else {
    throw invalidType(body);
  }

  globalLabelId++;
  const labelId = globalLabelId;

  const labelBegin = `while_${labelId}`;
  const labelEnd = `end_while_${labelId}`;
  const labelTrue = `true_${labelId}`;

  alines.push("");

  // ループの先頭
  alines.push(`label ${labelBegin}`);

  alines.pushAll(codegenExpr(fnArgNames, lvarNames, condExpr));
  alines.push(`  set_reg_b 1`);
  alines.push(`  compare`);

  // true の場合ループの本体を実行
  alines.push(`  jump_eq ${labelTrue}`);

  // false の場合ループを抜ける
  alines.push(`  jump ${labelEnd}`);

  alines.push(`label ${labelTrue}`);
  alines.pushAll(codegenStmts(fnArgNames, lvarNames, body.get()));

  // ループの先頭に戻る
  alines.push(`  jump ${labelBegin}`);

  alines.push(`label ${labelEnd}`);
  alines.push("");

  return alines;
}

function _codegenExpr_push(
  fnArgNames: string[],
  lvarNames: string[],
  expr: NodeElem
): Alines
{
  const alines = new Alines();

  const emptyAlines = new Alines();
  let pushArg;

  if (typeof expr === "number") {
    pushArg = String(expr);

  } else if (typeof expr === "string") {
    if (include(fnArgNames, expr)) {
      pushArg = toFnArgRef(fnArgNames, expr);
    } else if (include(lvarNames, expr)) {
      pushArg = toLvarRef(lvarNames, expr);
    } else {
      throw notYetImpl(expr);
    }

  } else if (expr instanceof NodeList) {
    alines.pushAll(
      codegenExpr(fnArgNames, lvarNames, expr.get())
    );
    pushArg = "reg_a";

  } else {
    throw notYetImpl(expr);
  }

  alines.push(`  push ${pushArg}`);

  return alines;
}

function _codegenExpr_add(): Alines {
  const alines = new Alines();

  alines.push(`  pop reg_b`);
  alines.push(`  pop reg_a`);
  alines.push(`  add_ab`);

  return alines;
}

function _codegenExpr_mult(): Alines {
  const alines = new Alines();

  alines.push(`  pop reg_b`);
  alines.push(`  pop reg_a`);
  alines.push(`  mult_ab`);

  return alines;
}

function _codegenExpr_eq(): Alines {
  const alines = new Alines();

  globalLabelId++;
  const labelId = globalLabelId;

  const labelEnd = `end_eq_${labelId}`;
  const labelThen = `then_${labelId}`;

  alines.push(`  pop reg_b`);
  alines.push(`  pop reg_a`);

  alines.push(`  compare`);
  alines.push(`  jump_eq ${labelThen}`);

  alines.push(`  set_reg_a 0`);
  alines.push(`  jump ${labelEnd}`);

  alines.push(`label ${labelThen}`);
  alines.push(`  set_reg_a 1`);

  alines.push(`label ${labelEnd}`);

  return alines;
}

function _codegenExpr_neq(): Alines {
  const alines = new Alines();

  globalLabelId++;
  const labelId = globalLabelId;

  const labelEnd = `end_neq_${labelId}`;
  const labelThen = `then_${labelId}`;

  alines.push(`  pop reg_b`);
  alines.push(`  pop reg_a`);

  alines.push(`  compare`);
  alines.push(`  jump_eq ${labelThen}`);

  alines.push(`  set_reg_a 1`);
  alines.push(`  jump ${labelEnd}`);

  alines.push(`label ${labelThen}`);
  alines.push(`  set_reg_a 0`);

  alines.push(`label ${labelEnd}`);

  return alines;
}

function codegenExpr(
  fnArgNames: string[],
  lvarNames: string[],
  expr: NodeElem[]
): Alines
{
  const alines = new Alines();

  const operator = expr[0];
  const args = expr.slice(1);

  alines.pushAll(
    _codegenExpr_push(fnArgNames, lvarNames, args[0])
  );
  
  alines.pushAll(
    _codegenExpr_push(fnArgNames, lvarNames, args[1])
  );

  if (operator === "+") {
    alines.pushAll(_codegenExpr_add());
  } else if (operator === "*") {
    alines.pushAll(_codegenExpr_mult());
  } else if (operator === "eq") {
    alines.pushAll(_codegenExpr_eq());
  } else if (operator === "neq") {
    alines.pushAll(_codegenExpr_neq());
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

  let pushArg: number | string;

  if (typeof fnArg === "number") {
    pushArg = fnArg;
  } else if (typeof fnArg === "string") {
    if (include(fnArgNames, fnArg)) {
      const fnArgAddr = toFnArgRef(fnArgNames, fnArg);
      pushArg = fnArgAddr;
    } else if (include(lvarNames, fnArg)) {
      const lvarAddr = toLvarRef(lvarNames, fnArg);
      pushArg = lvarAddr;
    } else {
      throw notYetImpl("fnArg", fnArg);
    }
  } else {
    throw notYetImpl("fnArg", fnArg);
  }

  alines.push(`  push ${pushArg}`);

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

  alines.pushAll(codegenVmComment(`call  ${fnName}`));
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

  alines.pushAll(codegenVmComment(`call_set  ${fnName}`));
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
    const expr = rest[1];
    if (expr instanceof NodeList) {
      // ok
    } else {
      throw invalidType(expr);
    }
    alines.pushAll(codegenExpr(fnArgNames, lvarNames, expr.els));

    return [alines, "reg_a"];

  } else if (typeof rest[1] === "string") {
    if (include(fnArgNames, rest[1])) {
      const fnArgRef = toFnArgRef(fnArgNames, rest[1]);
      return [alines, fnArgRef];
    } else if (include(lvarNames, rest[1])) {
      const lvarRef = toLvarRef(lvarNames, rest[1]);
      return [alines, lvarRef];

    } else if (matchVram(rest[1]) !== "") {
      const vramParam = matchVram(rest[1]);

      if (vramParam.match(/^\d+$/)) {
        throw notYetImpl();
      } else {
        const vramParam = RegExp.$1;

        if (include(lvarNames, vramParam)) {
          const lvarRef = toLvarRef(lvarNames, vramParam);
          alines.push(`  get_vram ${lvarRef} reg_a`);
        } else {
          throw notYetImpl();
        }

        return [alines, "reg_a"];
      }

    } else {
      throw notYetImpl();
    }

  } else {
    // throw invalidType(rest[1]);
    throw invalidType(rest);
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

  if (matchVram(dest) !== "") {
    const vramParam = matchVram(dest);

    if (vramParam.match(/^\d+$/)) {
      throw notYetImpl();
    } else if (include(lvarNames, vramParam)) {
      const lvarRef = toLvarRef(lvarNames, vramParam);
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

    if (matchVram(retval) !== "") {
      const vramParam = matchVram(retval);

      if (vramParam.match(/^\d+$/)) {
        throw notYetImpl(retval);
      } else {
        if (include(lvarNames, vramParam)) {
          const lvarRef = toLvarRef(lvarNames, vramParam);
          alines.push(`  get_vram ${lvarRef} reg_a`);
        } else {
          throw notYetImpl(retval);
        }
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

function codegenVmComment(comment: string): Alines {
  const alines = new Alines();

  alines.push(`  _cmt ` + comment.replace(new RegExp(" ", "g"), "~"));

  return alines;
}

function codegenStmt(
  fnArgNames: string[],
  lvarNames: string[],
  stmt: NodeList
): Alines
{
  const alines = new Alines();

  const stmtHead = stmt.hd();
  const stmtRest = stmt.tl();

  if (stmtHead === "call") {
    alines.pushAll(codegenCall(fnArgNames, lvarNames, stmtRest));
  } else if (stmtHead === "call_set") {
    alines.pushAll(codegenCallSet(fnArgNames, lvarNames, stmtRest));

  } else if (stmtHead === "set") {
    alines.pushAll(codegenSet(fnArgNames, lvarNames, stmtRest));

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
    alines.pushAll(codegenVmComment(cmt));

  } else {
    throw notYetImpl("stmtHead", stmtHead);
  }

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

    alines.pushAll(
      codegenStmt(fnArgNames, lvarNames, stmt)
    );
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

  for (let stmt of stmts) {
    if (stmt instanceof NodeList) {
      ;
    } else {
      throw new Error("invalid type");
    }

    const stmtHead = stmt.hd();
    if (typeof stmtHead === "string") {
      ;
    } else {
      throw invalidType(stmt.hd());
    }

    if (stmtHead === "var") {
      const stmtRest: NodeElem[] = stmt.tl();

      if (typeof stmtRest[0] === "string") {
        ;
      } else {
        throw invalidType(stmtRest[0]);
      }

      lvarNames.push(stmtRest[0]);

      alines.pushAll(
        codegenVar(fnArgNames, lvarNames, NodeList.fromEls(stmtRest))
      );

    } else {
      alines.pushAll(
        codegenStmt(fnArgNames, lvarNames, stmt)
      );
    }
  }

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

      alines.pushAll(codegenVmComment(cmt));

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
