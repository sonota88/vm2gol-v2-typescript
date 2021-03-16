import { FileReader } from "./lib/file_reader.ts"

import {
  invalidType,
  notYetImpl
} from "./lib/utils.ts"

import {
  List,
  Node
} from "./lib/types.ts"

function puts(msg: string) {
  console.log(msg);
}

function include<T>(xs: T[], x: T): boolean {
  for (let _x of xs) {
    if (_x === x) {
      return true;
    }
  }
  return false;
}

function inspect(xs: List): string {
  let s = ""
  xs.forEach((x, i) => {
    if (1 <= i) {
      s += ", ";
    }
    if (typeof x === "string") {
      s += `"${x}"`;
    } else {
      s += x;
    }
  });
  return `[ ${s} ]`;
}

// --------------------------------

const _parse = (json: string): [List, number] => {
  let pos = 1;
  const xs = new List();

  while (pos <= json.length - 1) {
    const rest = json.slice(pos);

    if (rest[0] == "[") {
      const [childXs, size] = _parse(rest);
      xs.push(childXs);
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
      xs.push(parseInt(m1));
      pos += m1.length;
    } else if (rest.match(/^"(.*?)"/)) {
      const m1 = RegExp.$1;
      xs.push(m1);
      pos += m1.length + 2;
    } else {
      throw notYetImpl(xs);
    }
  }
  return [xs, pos];
};

const parse = (json: string): List => {
  const jsonWithoutComment = json.split("\n")
        .filter((line: string) => ! /^ *\/\//.test(line))
        .join("\n");
  const root = _parse(jsonWithoutComment);
  return root[0];
};

// --------------------------------

function asmPrologue() {
  puts("  push bp");
  puts("  cp sp bp");
}

function asmEpilogue() {
  puts("  cp bp sp");
  puts("  pop bp");
}

// --------------------------------

function toFnArgRef(
  fnArgNames: string[],
  fnArgName: string
): string
{
  const index = fnArgNames.indexOf(fnArgName);
  return `[bp:${index + 2}]`;
}

function toLvarRef(
  lvarNames: string[],
  lvarName: string
): string
{
  const index = lvarNames.indexOf(lvarName);
  return `[bp:-${index + 1}]`;
}

// --------------------------------

let globalLabelId = 0;

function genVar(
  fnArgNames: string[],
  lvarNames: string[],
  stmtRest: List
) {
  puts(`  sub_sp 1`);

  if (stmtRest.size() === 2) {
    genSet(fnArgNames, lvarNames, stmtRest);
  }
}

function _genExpr_add() {
  puts(`  pop reg_b`);
  puts(`  pop reg_a`);
  puts(`  add_ab`);
}

function _genExpr_mult() {
  puts(`  pop reg_b`);
  puts(`  pop reg_a`);
  puts(`  mult_ab`);
}

function _genExpr_eq() {
  globalLabelId++;
  const labelId = globalLabelId;

  const labelEnd = `end_eq_${labelId}`;
  const labelThen = `then_${labelId}`;

  puts(`  pop reg_b`);
  puts(`  pop reg_a`);

  puts(`  compare`);
  puts(`  jump_eq ${labelThen}`);

  puts(`  cp 0 reg_a`);
  puts(`  jump ${labelEnd}`);

  puts(`label ${labelThen}`);
  puts(`  cp 1 reg_a`);

  puts(`label ${labelEnd}`);
}

function _genExpr_neq() {
  globalLabelId++;
  const labelId = globalLabelId;

  const labelEnd = `end_neq_${labelId}`;
  const labelThen = `then_${labelId}`;

  puts(`  pop reg_b`);
  puts(`  pop reg_a`);

  puts(`  compare`);
  puts(`  jump_eq ${labelThen}`);

  puts(`  cp 1 reg_a`);
  puts(`  jump ${labelEnd}`);

  puts(`label ${labelThen}`);
  puts(`  cp 0 reg_a`);

  puts(`label ${labelEnd}`);
}

function _genExpr_binary(
  fnArgNames: string[],
  lvarNames: string[],
  expr: List
) {
  const operator = expr.getAsString(0);
  const args = expr.slice(1);

  genExpr(fnArgNames, lvarNames, args.get(0));
  puts(`  push reg_a`);
  genExpr(fnArgNames, lvarNames, args.get(1));
  puts(`  push reg_a`);

  if (operator === "+") {
    _genExpr_add();
  } else if (operator === "*") {
    _genExpr_mult();
  } else if (operator === "eq") {
    _genExpr_eq();
  } else if (operator === "neq") {
    _genExpr_neq();
  } else {
    throw notYetImpl(operator);
  }
}

function genExpr(
  fnArgNames: string[],
  lvarNames: string[],
  expr: Node
) {
  if (typeof expr === "number") {
    puts(`  cp ${expr} reg_a`);

  } else if (typeof expr === "string") {
    if (include(fnArgNames, expr)) {
      const cpSrc = toFnArgRef(fnArgNames, expr);
      puts(`  cp ${cpSrc} reg_a`);
    } else if (include(lvarNames, expr)) {
      const cpSrc = toLvarRef(lvarNames, expr);
      puts(`  cp ${cpSrc} reg_a`);
    } else {
      throw notYetImpl(expr);
    }

  } else if (expr instanceof List) {
    _genExpr_binary(fnArgNames, lvarNames, expr);
  } else {
    throw notYetImpl(expr);
  }
}

function genCall(
  fnArgNames: string[],
  lvarNames: string[],
  stmtRest: List
) {
  const fnName = stmtRest.getAsString(0);
  const fnArgs = stmtRest.slice(1);

  fnArgs.reverse().forEach((fnArg)=>{
    genExpr(fnArgNames, lvarNames, fnArg);
    puts(`  push reg_a`);
  });

  genVmComment(`call  ${fnName}`);
  puts(`  call ${fnName}`);
  puts(`  add_sp ${fnArgs.size()}`);
}

function genCallSet(
  fnArgNames: string[],
  lvarNames: string[],
  stmtRest: List
) {
  const lvarName = stmtRest.getAsString(0);
  const fnTemp = stmtRest.getAsNodeList(1);

  genCall(fnArgNames, lvarNames, fnTemp);

  const lvarRef = toLvarRef(lvarNames, lvarName);
  puts(`  cp reg_a ${lvarRef}`);
}

function genSet(
  fnArgNames: string[],
  lvarNames: string[],
  rest: List
) {
  let dest = rest.getAsString(0);

  genExpr(fnArgNames, lvarNames, rest.get(1));
  const srcVal = "reg_a";

  if (include(lvarNames, dest)) {
    const lvarAddr = toLvarRef(lvarNames, dest);
    puts(`  cp ${srcVal} ${lvarAddr}`);
  } else {
    throw notYetImpl("dest", dest);
  }
}

function genReturn(
  fnArgNames: string[],
  lvarNames: string[],
  stmtRest: List
) {
  const retval = stmtRest.get(0);
  genExpr(fnArgNames, lvarNames, retval);
}

function genWhile(
  fnArgNames: string[],
  lvarNames: string[],
  rest: List
) {
  const condExpr = rest.getAsNodeList(0);
  const body = rest.getAsNodeList(1);

  globalLabelId++;
  const labelId = globalLabelId;

  const labelBegin = `while_${labelId}`;
  const labelEnd = `end_while_${labelId}`;
  const labelTrue = `true_${labelId}`;

  puts("");

  // ループの先頭
  puts(`label ${labelBegin}`);

  genExpr(fnArgNames, lvarNames, condExpr);
  puts(`  cp 1 reg_b`);
  puts(`  compare`);

  // true の場合ループの本体を実行
  puts(`  jump_eq ${labelTrue}`);

  // false の場合ループを抜ける
  puts(`  jump ${labelEnd}`);

  puts(`label ${labelTrue}`);
  genStmts(fnArgNames, lvarNames, body);

  // ループの先頭に戻る
  puts(`  jump ${labelBegin}`);

  puts(`label ${labelEnd}`);
  puts("");
}

function genCase(
  fnArgNames: string[],
  lvarNames: string[],
  whenClauses: List
) {
  globalLabelId++;
  const labelId = globalLabelId;

  let whenIndex = -1;

  const labelEnd = `end_case_${labelId}`;
  const labelWhenHead = `when_${labelId}`;
  const labelEndWhenHead = `end_when_${labelId}`;

  whenClauses.forEach((whenClause)=>{
    whenIndex++;

    if (!(whenClause instanceof List)) {
      throw invalidType(whenClause);
    }
    const cond = whenClause.getAsNodeList(0);
    const rest = whenClause.tl();

    puts(`  # 条件 ${labelId}_${whenIndex}: ${inspect(cond)}`);

    genExpr(fnArgNames, lvarNames, cond);

    puts(`  cp 1 reg_b`);

    puts(`  compare`);
    puts(`  jump_eq ${labelWhenHead}_${whenIndex}`);
    puts(`  jump ${labelEndWhenHead}_${whenIndex}`);

    // 真の場合ここにジャンプ
    puts(`label ${labelWhenHead}_${whenIndex}`);

    genStmts(fnArgNames, lvarNames, rest);

    puts(`  jump ${labelEnd}`);

    // 偽の場合ここにジャンプ
    puts(`label ${labelEndWhenHead}_${whenIndex}`);
  });

  puts(`label ${labelEnd}`);
}

function genVmComment(comment: string) {
  puts(`  _cmt ` + comment.replace(new RegExp(" ", "g"), "~"));
}

function genStmt(
  fnArgNames: string[],
  lvarNames: string[],
  stmt: List
) {
  const stmtHead = stmt.getAsString(0);
  const stmtRest = stmt.tl();

  if (stmtHead === "call") {
    genCall(fnArgNames, lvarNames, stmtRest);
  } else if (stmtHead === "call_set") {
    genCallSet(fnArgNames, lvarNames, stmtRest);
  } else if (stmtHead === "set") {
    genSet(fnArgNames, lvarNames, stmtRest);
  } else if (stmtHead === "return") {
    genReturn(fnArgNames, lvarNames, stmtRest);
  } else if (stmtHead === "while") {
    genWhile(fnArgNames, lvarNames, stmtRest);
  } else if (stmtHead === "case") {
    genCase(fnArgNames, lvarNames, stmtRest);
  } else if (stmtHead === "_cmt") {
    const cmt = stmtRest.getAsString(0);
    genVmComment(cmt);
  } else {
    throw notYetImpl("stmtHead", stmtHead);
  }
}

function genStmts(
  fnArgNames: string[],
  lvarNames: string[],
  stmts: List
) {
  stmts.forEach((stmt)=>{
    if (!(stmt instanceof List)) {
      throw invalidType(stmt);
    }

    genStmt(fnArgNames, lvarNames, stmt);
  });
}

function genFunc_getFnArgNames(nodeElem: Node): string[] {
  if (!(nodeElem instanceof List)) {
    throw invalidType(nodeElem);
  }

  const fnArgNames: string[] =
    nodeElem.toPlain().map((el: Node) => {
      if (!(typeof el === "string")) {
        throw invalidType(el);
      }

      return el;
    });

  return fnArgNames;
}

function genFunc(rest: List) {
  const fnName = rest.getAsString(0);
  const fnArgNames = genFunc_getFnArgNames(rest.get(1));
  const body = rest.getAsNodeList(2);

  puts(``);
  puts(`label ${fnName}`);
  asmPrologue();

  puts(``);
  puts(`  # 関数の処理本体`);

  const lvarNames: string[] = [];

  body.forEach((stmt)=>{
    if (!(stmt instanceof List)) {
      throw invalidType(stmt);
    }

    const stmtHead = stmt.getAsString(0);

    if (stmtHead === "var") {
      const stmtRest = stmt.tl();

      const lvarName = stmtRest.getAsString(0);
      lvarNames.push(lvarName);

      genVar(fnArgNames, lvarNames, stmtRest);

    } else {
      genStmt(fnArgNames, lvarNames, stmt);
    }
  });

  puts(``);
  asmEpilogue();
  puts(`  ret`);
}

function genTopStmts(
  fnArgNames: string[],
  lvarNames: string[],
  rest: List
) {
  rest.forEach((stmt)=>{
    if (!(stmt instanceof List)) {
      throw invalidType(stmt);
    }

    const stmtHead = stmt.getAsString(0);
    const stmtRest = stmt.tl();

    if (stmtHead === "func") {
      genFunc(stmtRest);

    } else if (stmtHead === "_cmt") {
      const cmt = stmtRest.getAsString(0);
      genVmComment(cmt);

    } else {
      throw notYetImpl("stmtHead", stmtHead);
    }
  });
}

function genBuiltinSetVram() {
  puts("");
  puts("label set_vram");
  asmPrologue();
  puts("  set_vram [bp:2] [bp:3]"); // vram_addr value
  asmEpilogue();
  puts("  ret");
}

function genBuiltinGetVram() {
  puts("");
  puts("label get_vram");
  asmPrologue();
  puts("  get_vram [bp:2] reg_a"); // vram_addr dest
  asmEpilogue();
  puts("  ret");
}

function codegen(topStmts: List) {
  puts("  call main");
  puts("  exit");

  // const head = topStmts.hd();
  const rest = topStmts.tl();

  genTopStmts([], [], rest);

  genBuiltinSetVram();
  genBuiltinGetVram();
}

// --------------------------------

const src = await FileReader.readAll(Deno.args[0]);

const tree = parse(src);

codegen(tree);
