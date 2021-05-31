import { FileReader } from "./lib/file_reader.ts"

import { puts_e } from "./lib/utils.ts"

import {
  List,
  Token,
  TokenValue
} from "./lib/types.ts"

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

function parseArgs(): List {
  const args = new List();

  if (peek().value === ")") {
    return args;
  }

  args.push(_parseArg());

  while (peek().value === ",") {
    consume(",");
    args.push(_parseArg());
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

  const func = new List();
  func.push("func");
  func.push(funcName);
  func.push(args);
  func.push(stmts);

  return func;
}


function parseVarDeclare(): List {
  const t = peek();
  pos++;

  const varName = t.value;

  consume(";");

  const stmt = new List();
  stmt.push("var");
  stmt.push(varName);

  return stmt;
}

function parseVarInit(): List {
  const t = peek();
  pos++;

  const varName = t.value;

  consume("=");

  const expr = parseExpr();

  consume(";");

  const stmt = new List();
  stmt.push("var");
  stmt.push(varName);
  stmt.push(expr);

  return stmt;
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


function parseExprRight(): List {
  const t = peek();

  let exprR: Expr;
  let expr: List = new List();

  switch(t.value) {
  case "+":
    consume("+");
    exprR = parseExpr();
    expr.push("+");
    expr.push(exprR);
    break;

  case "*":
    consume("*");
    exprR = parseExpr();
    expr.push("*");
    expr.push(exprR);
    break;

  case "==":
    consume("==");
    exprR = parseExpr();
    expr.push("eq");
    expr.push(exprR);
    break;

  case "!=":
    consume("!=");
    exprR = parseExpr();
    expr.push("neq");
    expr.push(exprR);
    break;

  default:
    ;
  }

  return expr;
}

function parseExpr(): Expr {
  const tLeft = peek();
  let exprL: Expr;

  if (tLeft._type === "int") {
    pos++;

    exprL = tLeft.getValueAsInt();

  } else if (tLeft._type === "ident") {
    pos++;

    exprL = tLeft.value;

  } else if (tLeft._type === "symbol") {
    consume("(");
    exprL = parseExpr();
    consume(")");

  } else {
    throw new Error();
  }

  const tail = parseExprRight();
  if (tail.size() === 0) {
    return exprL;
  }

  const expr = new List();
  expr.push(tail.get(0));
  expr.push(exprL);
  expr.push(tail.get(1));
  return expr;
}

function parseSet(): List {
  consume("set");

  const t = peek();
  pos++;
  const varName = t.value;

  consume("=");

  const expr = parseExpr();

  consume(";");

  const stmt = new List();
  stmt.push("set");
  stmt.push(varName);
  stmt.push(expr);

  return stmt;
}

function parseCall(): List {
  consume("call");

  const funcall = parseFuncall();

  consume(";");

  const stmt = new List();
  stmt.push("call");
  stmt.pushAll(funcall);

  return stmt;
}

function parseFuncall(): List {
  const t = peek();
  pos++;

  const funcName = t.value;

  consume("(");
  const args = parseArgs();
  consume(")");

  const funcall = new List();
  funcall.push(funcName);
  funcall.pushAll(args);

  return funcall;
}

function parseCallSet(): List {
  consume("call_set");

  const t = peek();
  pos++;

  const varName = t.value;

  consume("=");

  const funcall = parseFuncall();

  consume(";");

  const stmt = new List();
  stmt.push("call_set");
  stmt.push(varName);
  stmt.push(funcall);

  return stmt;
}

function parseReturn(): List {
  consume("return");

  if (peek().value == ";") {
    consume(";");

    const stmt = new List();
    stmt.push("return");
    return stmt;

  } else {
    const expr = parseExpr();
    consume(";");

    const stmt = new List();
    stmt.push("return");
    stmt.push(expr);
    return stmt;
  }
}

function _parseWhenClause(): List {
  consume("(");
  const expr = parseExpr();
  consume(")");

  consume("{");
  const stmts = parseStmts();
  consume("}");

  const whenClause = new List();
  whenClause.push(expr);
  whenClause.pushAll(stmts);

  return whenClause;
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

  const stmt = new List();
  stmt.push("case");
  for (let whenClause of whenClauses) {
    stmt.push(whenClause);
  }

  return stmt;
}

function parseWhile(): List {
  consume("while");

  consume("(");
  const expr = parseExpr();
  consume(")");

  consume("{");
  const stmts = parseStmts();
  consume("}");

  const stmt = new List();
  stmt.push("while");
  stmt.push(expr);
  stmt.push(stmts);

  return stmt;
}

function parseVmComment(): List {
  consume("_cmt");
  consume("(");

  const t = peek();
  pos++;

  const comment = t.value;

  consume(")");
  consume(";");

  const stmt = new List();
  stmt.push("_cmt");
  stmt.push(comment);

  return stmt;
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
  const topStmts = parseTopStmts();

  const tree = new List();
  tree.push("top_stmts");
  tree.pushAll(topStmts);

  return tree;
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
