import { FileReader } from "./lib/file_reader.ts"

import {
  invalidType,
  notYetImpl
} from "./lib/utils.ts"

import {
  NodeList
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

// --------------------------------

type NodeElem = string | number | NodeList;

type PlainElem = string | number | PlainArray;
type PlainArray = PlainElem[];

const _parse = (json: string): [NodeList, number] => {
  let pos = 1;
  const xs = new NodeList();

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
  stmtRest: NodeList
) {
  puts(`  sub_sp 1`);

  if (stmtRest.size() === 2) {
    codegenSet(fnArgNames, lvarNames, stmtRest);
  }
}

function codegenCase(
  fnArgNames: string[],
  lvarNames: string[],
  whenBlocks: NodeList
) {
  globalLabelId++;
  const labelId = globalLabelId;

  let whenIndex = -1;

  const labelEnd = `end_case_${labelId}`;
  const labelWhenHead = `when_${labelId}`;
  const labelEndWhenHead = `end_when_${labelId}`;

  for (let whenBlock of whenBlocks.get()) {
    whenIndex++;

    if (whenBlock instanceof NodeList) {
      // OK
    } else {
      throw invalidType(whenBlock);
    }
    const cond = whenBlock.getAsNodeList(0);
    const rest = whenBlock.tl();

    const condHead = cond.hd();
    // const condRest = cond.tl();

    puts(`  # 条件 ${labelId}_${whenIndex}: ${Deno.inspect(cond.toPlain())}`);

    if (condHead === "eq") {
      codegenExpr(fnArgNames, lvarNames, cond.get());

      puts(`  set_reg_b 1`);

      puts(`  compare`);
      puts(`  jump_eq ${labelWhenHead}_${whenIndex}`);
      puts(`  jump ${labelEndWhenHead}_${whenIndex}`);

      // 真の場合ここにジャンプ
      puts(`label ${labelWhenHead}_${whenIndex}`);

      codegenStmts(fnArgNames, lvarNames, rest);

      puts(`  jump ${labelEnd}`);

      // 偽の場合ここにジャンプ
      puts(`label ${labelEndWhenHead}_${whenIndex}`);
    } else {
      throw notYetImpl();
    }
  }

  puts(`label ${labelEnd}`);
}

function codegenWhile(
  fnArgNames: string[],
  lvarNames: string[],
  rest: NodeList
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

  codegenExpr(fnArgNames, lvarNames, condExpr.get());
  puts(`  set_reg_b 1`);
  puts(`  compare`);

  // true の場合ループの本体を実行
  puts(`  jump_eq ${labelTrue}`);

  // false の場合ループを抜ける
  puts(`  jump ${labelEnd}`);

  puts(`label ${labelTrue}`);
  codegenStmts(fnArgNames, lvarNames, body.get());

  // ループの先頭に戻る
  puts(`  jump ${labelBegin}`);

  puts(`label ${labelEnd}`);
  puts("");
}

function _codegenExpr_push(
  fnArgNames: string[],
  lvarNames: string[],
  expr: NodeElem
) {
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
    codegenExpr(fnArgNames, lvarNames, expr.get());
    pushArg = "reg_a";

  } else {
    throw notYetImpl(expr);
  }

  puts(`  push ${pushArg}`);
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

  puts(`  set_reg_a 0`);
  puts(`  jump ${labelEnd}`);

  puts(`label ${labelThen}`);
  puts(`  set_reg_a 1`);

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

  puts(`  set_reg_a 1`);
  puts(`  jump ${labelEnd}`);

  puts(`label ${labelThen}`);
  puts(`  set_reg_a 0`);

  puts(`label ${labelEnd}`);
}

function codegenExpr(
  fnArgNames: string[],
  lvarNames: string[],
  expr: NodeElem[]
) {
  const operator = expr[0];
  const args = expr.slice(1);

  _codegenExpr_push(fnArgNames, lvarNames, args[0]);
  _codegenExpr_push(fnArgNames, lvarNames, args[1]);

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

function _codegenCall_pushFnArg(
  fnArgNames: string[],
  lvarNames: string[],
  fnArg: NodeElem
) {
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

  puts(`  push ${pushArg}`);
}

function codegenCall(
  fnArgNames: string[],
  lvarNames: string[],
  stmtRest: NodeList
) {
  const fnName = stmtRest.getAsString(0);
  const fnArgs = stmtRest.get().slice(1);

  fnArgs.reverse().forEach((fnArg)=>{
    _codegenCall_pushFnArg(fnArgNames, lvarNames, fnArg);
  });

  codegenVmComment(`call  ${fnName}`);
  puts(`  call ${fnName}`);
  puts(`  add_sp ${fnArgs.length}`);
}

function codegenCallSet(
  fnArgNames: string[],
  lvarNames: string[],
  stmtRest: NodeList
) {
  const lvarName = stmtRest.getAsString(0);
  const fnTemp = stmtRest.getAsNodeList(1);

  const fnName = fnTemp.hd();
  const fnArgs = fnTemp.tl();

  for (let i=fnArgs.length - 1; i>=0; i--) {
    const fnArg = fnArgs[i];
    _codegenCall_pushFnArg(fnArgNames, lvarNames, fnArg);
  }

  codegenVmComment(`call_set  ${fnName}`);
  puts(`  call ${fnName}`);
  puts(`  add_sp ${fnArgs.length}`);

  const lvarRef = toLvarRef(lvarNames, lvarName);
  puts(`  cp reg_a ${lvarRef}`);
}

function codegenSet_srcVal(
  fnArgNames: string[],
  lvarNames: string[],
  arg_rest: NodeList
): string
{
  const rest = arg_rest.get();

  if (typeof rest[1] === "number") {
    return String(rest[1]);

  } else if (rest[1] instanceof NodeList) {
    const expr = NodeList.fromEls(rest).getAsNodeList(1);
    codegenExpr(fnArgNames, lvarNames, expr.els);

    return "reg_a";

  } else if (typeof rest[1] === "string") {
    if (include(fnArgNames, rest[1])) {
      const fnArgRef = toFnArgRef(fnArgNames, rest[1]);
      return fnArgRef;
    } else if (include(lvarNames, rest[1])) {
      const lvarRef = toLvarRef(lvarNames, rest[1]);
      return lvarRef;

    } else if (matchVram(rest[1]) !== "") {
      const vramParam = matchVram(rest[1]);

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

        return "reg_a";
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
  rest: NodeList
) {
  let dest = rest.getAsString(0);

  const srcVal = codegenSet_srcVal(fnArgNames, lvarNames, rest);

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
  stmtRest: NodeList
) {
  const retval = stmtRest.get()[0];

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
          puts(`  get_vram ${lvarRef} reg_a`);
        } else {
          throw notYetImpl(retval);
        }
      }

    } else if (include(lvarNames, retval)) {
      const lvarRef = toLvarRef(lvarNames, retval);
      puts(`  cp ${lvarRef} reg_a`);
      
    } else {
      throw notYetImpl(retval);
    }

  } else {
    throw notYetImpl(retval);
  }
}

function codegenVmComment(comment: string) {
  puts(`  _cmt ` + comment.replace(new RegExp(" ", "g"), "~"));
}

function codegenStmt(
  fnArgNames: string[],
  lvarNames: string[],
  stmt: NodeList
) {
  const stmtHead = stmt.hd();
  const stmtRest = stmt.tl();

  if (stmtHead === "call") {
    codegenCall(fnArgNames, lvarNames, NodeList.fromEls(stmtRest));
  } else if (stmtHead === "call_set") {
    codegenCallSet(fnArgNames, lvarNames, NodeList.fromEls(stmtRest));
  } else if (stmtHead === "set") {
    codegenSet(fnArgNames, lvarNames, NodeList.fromEls(stmtRest));
  } else if (stmtHead === "return") {
    codegenReturn(fnArgNames, lvarNames, NodeList.fromEls(stmtRest));
  } else if (stmtHead === "case") {
    codegenCase(fnArgNames, lvarNames, NodeList.fromEls(stmtRest));
  } else if (stmtHead === "while") {
    codegenWhile(fnArgNames, lvarNames, NodeList.fromEls(stmtRest));
  } else if (stmtHead === "_cmt") {
    const cmt = NodeList.fromEls(stmtRest).getAsString(0);
    codegenVmComment(cmt);
  } else {
    throw notYetImpl("stmtHead", stmtHead);
  }
}

function codegenStmts(
  fnArgNames: string[],
  lvarNames: string[],
  stmts: NodeElem[]
) {
  for (let stmt of stmts) {
    if (stmt instanceof NodeList) {
      ;
    } else {
      throw new Error("invalid type");
    }

    codegenStmt(fnArgNames, lvarNames, stmt);
  }
}

function codegenFunc_getFnArgNames(nodeElem: NodeElem): string[] {
  let fnArgNames: string[];

  if (nodeElem instanceof NodeList) {
    fnArgNames =
      nodeElem.toPlain().map((el: NodeElem) => {
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

function codegenFunc(rest: NodeElem[]) {
  const fnName = rest[0];

  const fnArgNames = codegenFunc_getFnArgNames(rest[1]);

  let body: NodeList;

  if (rest[2] instanceof NodeList) {
    body = rest[2];
  } else {
    throw new Error("invalid type");
  }

  puts(``);
  puts(`label ${fnName}`);
  puts(`  push bp`);
  puts(`  cp sp bp`);

  puts(``);
  puts(`  # 関数の処理本体`);

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

      const lvarName = NodeList.fromEls(stmtRest).getAsString(0);
      lvarNames.push(lvarName);

      codegenVar(fnArgNames, lvarNames, NodeList.fromEls(stmtRest));

    } else {
      codegenStmt(fnArgNames, lvarNames, stmt);
    }
  }

  puts(``);
  puts(`  cp bp sp`);
  puts(`  pop bp`);
  puts(`  ret`);
}

function codegenTopStmts(
  fnArgNames: string[],
  lvarNames: string[],
  rest: NodeElem[]
) {
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
      codegenFunc(stmtRest);

    } else if (stmtHead === "_cmt") {
      const cmt = NodeList.fromEls(stmtRest).getAsString(0);

      codegenVmComment(cmt);

    } else {
      throw notYetImpl("stmtHead", stmtHead);
    }
  }
}

function codegen(topStmts: NodeList) {
  puts("  call main");
  puts("  exit");

  const head = topStmts.hd();
  const rest = topStmts.tl();

  codegenTopStmts([], [], rest);
}

// --------------------------------

const src = await FileReader.readAll(Deno.args[0]);

const tree = parse(src);

codegen(tree);
