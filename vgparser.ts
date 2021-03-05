import { FileReader } from "./lib/file_reader.ts"

import {
  List,
  Token,
  TokenValue
} from "./lib/types.ts"

const textEncoder = new TextEncoder();

const print_e = (arg: any) => {
  Deno.stderr.writeSync(
    textEncoder.encode(String(arg)),
  );
};

const puts_e = (...args: any[]) => {
  for (let arg of args) {
    print_e(String(arg) + "\n");
  }
};

// --------------------------------

function readTokens(src: string) {
  const lines = src.split("\n");
  const tokens: Token[] = [];
  lines
    .filter(line => 0 < line.length )
    .forEach(line => {
        tokens.push(Token.fromLine(line));
      });
  return tokens;
}

// --------------------------------

type Expr = string | number | List;

let tokens: Token[];
let pos = 0;

function peek(offset = 0) {
  return tokens[pos + offset];
}

function restHead() {
  return tokens
    .slice(pos, pos + 8)
    .map(t => `${t._type}<${t.value}>`);
}

function dumpState(msg = null) {
  puts_e(
    Deno.inspect(
      [
        msg,
        pos,
        restHead()
      ]
    )
  );
}

function assertValue(pos: number, exp: TokenValue) {
  const t = peek();

  if (t.value !== exp) {
    const msg = `Assertion failed: expected (${ Deno.inspect(exp) }) actual (${ Deno.inspect(t) })`
    throw new Error(msg);
  }
}

function consume(str: string) {
  assertValue(pos, str);
  pos++;
}

function isEnd(): boolean {
  return tokens.length <= pos;
}

// --------------------------------

function _parseArg() {
  const t = peek();

  if (t._type === "ident") {
    pos++;
    return t.value;
  } else if (t._type === "int") {
    pos++;
    return t.getValueAsInt();
  } else {
    throw new Error();
  }
}

function _parseArgsFirst() {
  return _parseArg();
}

function _parseArgsRest() {
  consume(",");
  return _parseArg();
}

function parseArgs(): List {
  const args = new List();

  if (peek().value === ")") {
    return args;
  }

  args.push(_parseArgsFirst());

  while (peek().value === ",") {
    args.push(_parseArgsRest());
  }

  return args;
}

function parseFunc(): List {
  consume("func");

  const t = peek();
  pos++;
  const funcName = t.value;

  consume("(");
  const args = parseArgs();
  consume(")");

  consume("{");

  const stmts = new List();
  while (peek().value !== "}") {
    const t = peek();
    if (t.value === "var") {
      stmts.push(parseVar());
    } else {
      stmts.push(parseStmt());
    }
  }

  consume("}");

  const nl = new List();
  nl.pushAll([
    "func",
    funcName,
    args,
    stmts
  ]);

  return nl;
}


function parseVarDeclare(): List {
  const t = peek();
  pos++;

  const varName = t.value;

  consume(";");

  const nl = new List();
  nl.push("var");
  nl.push(varName);

  return nl;
}

function parseVarInit(): List {
  const t = peek();
  pos++;

  const varName = t.value;

  consume("=");

  const expr = parseExpr();

  consume(";");

  const nl = new List();
  nl.push("var");
  nl.push(varName);
  nl.push(expr);

  return nl;
}

function parseVar(): List {
  consume("var");

  const t = peek(1);

  if (t.value === ";") {
    return parseVarDeclare();
  } else if (t.value === "=") {
    return parseVarInit();
  } else {
    throw new Error();
  }
}


function parseExprRight(
  exprL: Expr // TODO
): Expr {
  const t = peek();

  if (t.value === ";" || t.value === ")") {
    return exprL;
  }

  let exprR: Expr;
  let nl: List;

  switch(t.value) {
  case "+":
    consume("+");
    exprR = parseExpr();
    nl = new List();
    nl.push("+");
    nl.push(exprL);
    nl.push(exprR);
    return nl;

  case "*":
    consume("*");
    exprR = parseExpr();
    nl = new List();
    nl.push("*");
    nl.push(exprL);
    nl.push(exprR);
    return nl;

  case "==":
    consume("==");
    exprR = parseExpr();
    nl = new List();
    nl.push("eq");
    nl.push(exprL);
    nl.push(exprR);
    return nl;

  case "!=":
    consume("!=");
    exprR = parseExpr();
    nl = new List();
    nl.push("neq");
    nl.push(exprL);
    nl.push(exprR);
    return nl;

  default:
    throw new Error();
  }
}

function parseExpr(): Expr {
  const tLeft = peek();

  if (tLeft.value === "(") {
    consume("(");
    const exprL = parseExpr();
    consume(")");

    return parseExprRight(exprL);
  }

  if (tLeft._type === "int") {
    pos++;

    const exprL = tLeft.getValueAsInt();
    return parseExprRight(exprL);
  } else if (tLeft._type === "ident") {
    pos++;

    const exprL = tLeft.value;
    return parseExprRight(exprL);
  } else {
    throw new Error();
  }
}

function parseSet(): List {
  consume("set");

  const t = peek();
  pos++;
  const varName = t.value;

  consume("=");

  const expr = parseExpr();

  consume(";");

  const nl = new List();
  nl.push("set");
  nl.push(varName);
  nl.push(expr);

  return nl;
}

function parseCall(): List {
  consume("call");

  const funcall = parseFuncall();
  const funcName = funcall.getAsString(0);
  const args     = funcall.tl();

  consume(";");

  const nl = new List();
  nl.push("call");
  nl.push(funcName);
  nl.pushAll(args);

  return nl;
}

function parseFuncall(): List {
  const t = peek();
  pos++;

  const funcName = t.value;

  consume("(");
  const args = parseArgs();
  consume(")");

  const nl = new List();
  nl.push(funcName);
  nl.pushAll(args.els);

  return nl;
}

function parseCallSet(): List {
  consume("call_set");

  const t = peek();
  pos++;

  const varName = t.value;

  consume("=");

  const expr = parseFuncall();

  consume(";");

  const nl = new List();
  nl.push("call_set");
  nl.push(varName);
  nl.push(expr);

  return nl;
}

function parseReturn(): List {
  consume("return");

  const t = peek();

  if (t.value == ";") {
    consume(";");

    const nl = new List();
    nl.push("return");
    return nl;

  } else {
    const expr = parseExpr();
    consume(";");

    const nl = new List();
    nl.push("return");
    nl.push(expr);
    return nl;
  }
}

function _parseWhenClause(): List {
  consume("(");
  const expr = parseExpr();
  consume(")");

  consume("{");
  const stmts = parseStmts();
  consume("}");

  const nl = new List();
  nl.push(expr);
  nl.pushAll(stmts.els);

  return nl;
}

function parseCase(): List {
  consume("case");

  consume("{");

  const whenClauses: List[] = [];

  while (true) {
    const t = peek();
    if (t.value === "}") {
      break;
    }

    whenClauses.push(_parseWhenClause());
  }

  consume("}");

  const nl = new List();
  nl.push("case");
  for (let whenClause of whenClauses) {
    nl.push(whenClause);
  }

  return nl;
}

function parseWhile(): List {
  consume("while");

  consume("(");
  const expr = parseExpr();
  consume(")");

  consume("{");
  const stmts = parseStmts();
  consume("}");

  const nl = new List();
  nl.push("while");
  nl.push(expr);
  nl.push(stmts);

  return nl;
}

function parseVmComment(): List {
  consume("_cmt");
  consume("(");

  const t = peek();
  pos++;

  const comment = t.value;

  consume(")");
  consume(";");

  const nl = new List();
  nl.push("_cmt");
  nl.push(comment);

  return nl;
}

function parseStmt(): List {
  const t = peek();

  switch(t.value) {
  case "set": return parseSet();
  case "call": return parseCall();
  case "call_set": return parseCallSet();
  case "return": return parseReturn();
  case "while": return parseWhile();
  case "case": return parseCase();
  case "_cmt": return parseVmComment();
  default:
    throw new Error();
  }
}

function parseStmts(): List {
  const stmts = new List();

  while (true) {
    if (isEnd() || peek().value === "}") {
      break;
    }

    stmts.push(parseStmt());
  }

  return stmts;
}

function parseTopStmt(): List {
  const t = peek();

  if (t.value === "func") {
    return parseFunc();
  } else {
    throw new Error();
  }
}

function parseTopStmts(): List {
  const topStmts = new List();

  while (! isEnd()) {
    topStmts.push(parseTopStmt());
  }

  return topStmts;
}

function parse(): List {
  const stmts = parseTopStmts();

  const nl = new List();
  nl.push("top_stmts");
  nl.pushAll(stmts.els);

  return nl;
}

// --------------------------------

const src = await FileReader.readAll(Deno.args[0]);

tokens = readTokens(src);

let tree;

try {
  tree = parse();
} catch(e) {
  dumpState();
  throw e;
}

console.log(JSON.stringify(tree.toPlain(), null, "  "));
