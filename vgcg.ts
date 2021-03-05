import { FileReader } from "./lib/file_reader.ts"

import {
  invalidType,
  notYetImpl
} from "./lib/utils.ts"

import {
  List
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

type Node = string | number | List;

type PlainElem = string | number | PlainArray;
type PlainArray = PlainElem[];

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
  stmtRest: List
) {
  puts(`  sub_sp 1`);

  if (stmtRest.size() === 2) {
    codegenSet(fnArgNames, lvarNames, stmtRest);
  }
}

function codegenCase(
  fnArgNames: string[],
  lvarNames: string[],
  whenBlocks: List
) {
  globalLabelId++;
  const labelId = globalLabelId;

  let whenIndex = -1;

  const labelEnd = `end_case_${labelId}`;
  const labelWhenHead = `when_${labelId}`;
  const labelEndWhenHead = `end_when_${labelId}`;

  whenBlocks.forEach((whenBlock)=>{
    whenIndex++;

    if (whenBlock instanceof List) {
      // OK
    } else {
      throw invalidType(whenBlock);
    }
    const cond = whenBlock.getAsNodeList(0);
    const rest = List.fromEls(whenBlock.tl());

    puts(`  # 条件 ${labelId}_${whenIndex}: ${inspect(cond)}`);

    codegenExpr(fnArgNames, lvarNames, cond);

    puts(`  cp 1 reg_b`);

    puts(`  compare`);
    puts(`  jump_eq ${labelWhenHead}_${whenIndex}`);
    puts(`  jump ${labelEndWhenHead}_${whenIndex}`);

    // 真の場合ここにジャンプ
    puts(`label ${labelWhenHead}_${whenIndex}`);

    codegenStmts(fnArgNames, lvarNames, rest);

    puts(`  jump ${labelEnd}`);

    // 偽の場合ここにジャンプ
    puts(`label ${labelEndWhenHead}_${whenIndex}`);
  });

  puts(`label ${labelEnd}`);
}

function codegenWhile(
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

  codegenExpr(fnArgNames, lvarNames, condExpr);
  puts(`  cp 1 reg_b`);
  puts(`  compare`);

  // true の場合ループの本体を実行
  puts(`  jump_eq ${labelTrue}`);

  // false の場合ループを抜ける
  puts(`  jump ${labelEnd}`);

  puts(`label ${labelTrue}`);
  codegenStmts(fnArgNames, lvarNames, body);

  // ループの先頭に戻る
  puts(`  jump ${labelBegin}`);

  puts(`label ${labelEnd}`);
  puts("");
}

function _codegenExpr_add() {
  puts(`  pop reg_b`);
  puts(`  pop reg_a`);
  puts(`  add_ab`);
}

function _codegenExpr_mult() {
  puts(`  pop reg_b`);
  puts(`  pop reg_a`);
  puts(`  mult_ab`);
}

function _codegenExpr_eq() {
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

function _codegenExpr_neq() {
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

function _codegenExpr_binary(
  fnArgNames: string[],
  lvarNames: string[],
  expr: List
) {
  const operator = expr.get(0);
  const args = expr.slice(1);

  codegenExpr(fnArgNames, lvarNames, args.get(0));
  puts(`  push reg_a`);
  codegenExpr(fnArgNames, lvarNames, args.get(1));
  puts(`  push reg_a`);

  if (operator === "+") {
    _codegenExpr_add();
  } else if (operator === "*") {
    _codegenExpr_mult();
  } else if (operator === "eq") {
    _codegenExpr_eq();
  } else if (operator === "neq") {
    _codegenExpr_neq();
  } else {
    throw notYetImpl(operator);
  }
}

function codegenExpr(
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

    } else if (matchVram(expr) !== "") {
      const vramParam = matchVram(expr);

      if (vramParam.match(/^\d+$/)) {
        throw notYetImpl();
      } else {
        const vramParam = RegExp.$1;

        if (include(lvarNames, vramParam)) {
          const lvarRef = toLvarRef(lvarNames, vramParam);
          puts(`  get_vram ${lvarRef} reg_a`);
        } else {
          throw notYetImpl();
        }
      }

    } else {
      throw notYetImpl(expr);
    }

  } else if (expr instanceof List) {
    _codegenExpr_binary(fnArgNames, lvarNames, expr);
  } else {
    throw notYetImpl(expr);
  }
}

function codegenCall(
  fnArgNames: string[],
  lvarNames: string[],
  stmtRest: List
) {
  const fnName = stmtRest.getAsString(0);
  const fnArgs = stmtRest.slice(1);

  fnArgs.reverse().forEach((fnArg)=>{
    codegenExpr(fnArgNames, lvarNames, fnArg);
    puts(`  push reg_a`);
  });

  codegenVmComment(`call  ${fnName}`);
  puts(`  call ${fnName}`);
  puts(`  add_sp ${fnArgs.size()}`);
}

function codegenCallSet(
  fnArgNames: string[],
  lvarNames: string[],
  stmtRest: List
) {
  const lvarName = stmtRest.getAsString(0);
  const fnTemp = stmtRest.getAsNodeList(1);

  codegenCall(fnArgNames, lvarNames, fnTemp);

  const lvarRef = toLvarRef(lvarNames, lvarName);
  puts(`  cp reg_a ${lvarRef}`);
}

function codegenSet(
  fnArgNames: string[],
  lvarNames: string[],
  rest: List
) {
  let dest = rest.getAsString(0);

  codegenExpr(fnArgNames, lvarNames, rest.get(1));
  const srcVal = "reg_a";

  if (matchVram(dest) !== "") {
    const vramParam = matchVram(dest);

    if (vramParam.match(/^\d+$/)) {
      throw notYetImpl();
    } else if (include(lvarNames, vramParam)) {
      const lvarRef = toLvarRef(lvarNames, vramParam);
      puts(`  set_vram ${lvarRef} ${srcVal}`);
    } else {
      throw notYetImpl();
    }

  } else {
    const lvarAddr = toLvarRef(lvarNames, dest);
    puts(`  cp ${srcVal} ${lvarAddr}`);
  }
}

function codegenReturn(
  fnArgNames: string[],
  lvarNames: string[],
  stmtRest: List
) {
  const retval = stmtRest.get(0);
  codegenExpr(fnArgNames, lvarNames, retval);
}

function codegenVmComment(comment: string) {
  puts(`  _cmt ` + comment.replace(new RegExp(" ", "g"), "~"));
}

function codegenStmt(
  fnArgNames: string[],
  lvarNames: string[],
  stmt: List
) {
  const stmtHead = stmt.hd();
  const stmtRest = List.fromEls(stmt.tl());

  if (stmtHead === "call") {
    codegenCall(fnArgNames, lvarNames, stmtRest);
  } else if (stmtHead === "call_set") {
    codegenCallSet(fnArgNames, lvarNames, stmtRest);
  } else if (stmtHead === "set") {
    codegenSet(fnArgNames, lvarNames, stmtRest);
  } else if (stmtHead === "return") {
    codegenReturn(fnArgNames, lvarNames, stmtRest);
  } else if (stmtHead === "case") {
    codegenCase(fnArgNames, lvarNames, stmtRest);
  } else if (stmtHead === "while") {
    codegenWhile(fnArgNames, lvarNames, stmtRest);
  } else if (stmtHead === "_cmt") {
    const cmt = stmtRest.getAsString(0);
    codegenVmComment(cmt);
  } else {
    throw notYetImpl("stmtHead", stmtHead);
  }
}

function codegenStmts(
  fnArgNames: string[],
  lvarNames: string[],
  stmts: List
) {
  stmts.forEach((stmt)=>{
    if (stmt instanceof List) {
      ;
    } else {
      throw new Error("invalid type");
    }

    codegenStmt(fnArgNames, lvarNames, stmt);
  });
}

function codegenFunc_getFnArgNames(nodeElem: Node): string[] {
  let fnArgNames: string[];

  if (nodeElem instanceof List) {
    fnArgNames =
      nodeElem.toPlain().map((el: Node) => {
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

function codegenFunc(rest: List) {
  const fnName = rest.getAsString(0);

  const fnArgNames = codegenFunc_getFnArgNames(rest.get(1));

  let body: List;

  body = rest.getAsNodeList(2);

  puts(``);
  puts(`label ${fnName}`);
  puts(`  push bp`);
  puts(`  cp sp bp`);

  puts(``);
  puts(`  # 関数の処理本体`);

  const lvarNames: string[] = [];

  body.forEach((stmt)=>{
    if (stmt instanceof List) {
      ;
    } else {
      throw new Error("invalid type");
    }

    const stmtHead = stmt.getAsString(0);

    if (stmtHead === "var") {
      const stmtRest: Node[] = stmt.tl();

      const lvarName = List.fromEls(stmtRest).getAsString(0);
      lvarNames.push(lvarName);

      codegenVar(fnArgNames, lvarNames, List.fromEls(stmtRest));

    } else {
      codegenStmt(fnArgNames, lvarNames, stmt);
    }
  });

  puts(``);
  puts(`  cp bp sp`);
  puts(`  pop bp`);
  puts(`  ret`);
}

function codegenTopStmts(
  fnArgNames: string[],
  lvarNames: string[],
  rest: List
) {
  rest.forEach((stmt)=>{
    let stmtHead: string;
    let stmtRest: List;

    if (stmt instanceof List) {
      const hd = stmt.hd();
      if (typeof hd === "string") {
        stmtHead = hd;
      } else {
        throw invalidType(hd);
      }
      stmtRest = List.fromEls(stmt.tl());
    } else {
      throw invalidType(stmt);
    }

    if (stmtHead === "func") {
      codegenFunc(stmtRest);

    } else if (stmtHead === "_cmt") {
      const cmt = stmtRest.getAsString(0);

      codegenVmComment(cmt);

    } else {
      throw notYetImpl("stmtHead", stmtHead);
    }
  });
}

function codegen(topStmts: List) {
  puts("  call main");
  puts("  exit");

  // const head = topStmts.hd();
  const rest = topStmts.tl();

  codegenTopStmts([], [], List.fromEls(rest));
}

// --------------------------------

const src = await FileReader.readAll(Deno.args[0]);

const tree = parse(src);

codegen(tree);
