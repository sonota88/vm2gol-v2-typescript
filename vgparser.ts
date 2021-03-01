import { FileReader } from "./lib/file_reader.ts"

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

type TokenType = "kw" | "int" | "symbol" | "ident" | "str";
type TokenValue = string | number;

class Token {
  _type: TokenType;
  value: TokenValue;

  constructor(_type: TokenType, value: TokenValue) {
    this._type = _type;
    this.value = value;
  }
}

function tokenize(src: string) {
  const tokens = [];
  let pos = 0;

  while (pos < src.length) {
    const rest = src.slice(pos);

    if (rest.match(/^([ \n]+)/)) {
      const str = RegExp.$1;
      pos += str.length;

    } else if (rest.match(/^(\/\/.*)/)) {
      const str = RegExp.$1;
      pos += str.length;

    } else if (rest.match(/^"(.*?)"/)) {
      const str = RegExp.$1;
      tokens.push(new Token("str", str));
      pos += str.length + 2;

    } else if (rest.match(/^(func)[^a-z_]/)) {
      const str = RegExp.$1;
      tokens.push(new Token("kw", str));
      pos += str.length;

    } else if (rest.match(/^(-?[0-9]+)/)) {
      const str = RegExp.$1;
      tokens.push(new Token("int", parseInt(str)));
      pos += str.length;

    } else if (rest.match(/^(==|!=|[\(\)\{\}=;\+\*,])/)) {
      const str = RegExp.$1;
      tokens.push(new Token("symbol", str));
      pos += str.length;

    } else if (rest.match(/^([a-z_][a-z0-9_\[\]]*)/)) {
      const str = RegExp.$1;
      tokens.push(new Token("ident", str));
      pos += str.length;

    } else {
      const msg = "rest=\n>>" + rest.substring(0, 50) + "<<";
      throw new Error("not yet impl: " + msg);
    }
  }

  return tokens;
}

// --------------------------------

type NodeElem = string | number | NodeList;

class NodeList {
  els: NodeElem[];

  constructor() {
    this.els = [];
  }

  push(el: NodeElem) {
    this.els.push(el);
  }

  pushAll(els: NodeElem[]) {
    this.els.push(... els);
  }

  toPlain(): any {
    return this.els.map(el => {
      if (typeof el === "string" ||
          typeof el === "number"
         ) {
        return el;
      } else {
        return el.toPlain();
      }
    });
  }
}

// --------------------------------

type Expr = string | number | NodeList;

class Parser {
  tokens: Token[];
  pos: number;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
    this.pos = 0;
  }

  peek(offset = 0) {
    return this.tokens[this.pos + offset];
  }

  restHead() {
    return this.tokens
      .slice(this.pos, this.pos + 8)
      .map(t => `${t._type}<${t.value}>`);
  }

  dumpState(msg = null) {
    puts_e(
      Deno.inspect(
        [
          msg,
          this.pos,
          this.restHead()
        ]
      )
    );
  }

  assertValue(pos: number, exp: TokenValue) {
    const t = this.peek();

    if (t.value !== exp) {
      const msg = `Assertion failed: expected (${ Deno.inspect(exp) }) actual (${ Deno.inspect(t) })`
      throw new Error(msg);
    }
  }

  consume(str: string) {
    this.assertValue(this.pos, str);
    this.pos++;
  }

  isEnd(): boolean {
    return this.tokens.length <= this.pos;
  }

  // --------------------------------

  _parseArg() {
    const t = this.peek();

    if (t._type === "ident") {
      this.pos++;
      return t.value;
    } else if (t._type === "int") {
      this.pos++;
      return t.value;
    } else {
      throw new Error();
    }
  }

  _parseArgsFirst() {
    return this._parseArg();
  }

  _parseArgsRest() {
    this.consume(",");
    return this._parseArg();
  }

  parseArgs(): NodeList {
    const args = new NodeList();

    if (this.peek().value === ")") {
      return args;
    }

    args.push(this._parseArgsFirst());

    while (this.peek().value === ",") {
      args.push(this._parseArgsRest());
    }

    return args;
  }

  parseFunc(): NodeList {
    this.consume("func");

    const t = this.peek();
    this.pos++;
    const funcName = t.value;

    this.consume("(");
    const args = this.parseArgs();
    this.consume(")");

    this.consume("{");

    const stmts = new NodeList();
    while (this.peek().value !== "}") {
      const t = this.peek();
      if (t.value === "var") {
        stmts.push(this.parseVar());
      } else {
        const stmt = this.parseStmt();
          stmts.push(stmt);
      }
    }

    this.consume("}");

    const nl = new NodeList();
    nl.pushAll([
      "func",
      funcName,
      args,
      stmts
    ]);

    return nl;
  }


  parseVarDeclare(): NodeList {
    const t = this.peek();
    this.pos++;

    const varName = t.value;
    
    this.consume(";");

    const nl = new NodeList();
    nl.push("var");
    nl.push(varName);

    return nl;
  }

  parseVarInit(): NodeList {
    const t = this.peek();
    this.pos++;

    const varName = t.value;
    
    this.consume("=");

    const expr = this.parseExpr();

    this.consume(";");

    const nl = new NodeList();
    nl.push("var");
    nl.push(varName);
    nl.push(expr);

    return nl;
  }

  parseVar(): NodeList {
    this.consume("var");

    const t = this.peek(1);

    if (t.value === ";") {
      return this.parseVarDeclare();
    } else if (t.value === "=") {
      return this.parseVarInit();
    } else {
      throw new Error();
    }
  }


  parseExprRight(
    exprL: Expr // TODO
  ): Expr {
    const t = this.peek();

    if (t.value === ";" || t.value === ")") {
      return exprL;
    }

    let exprR: Expr;
    let nl: NodeList;

    switch(t.value) {
    case "+":
      this.consume("+");
      exprR = this.parseExpr();
      nl = new NodeList();
      nl.push("+");
      nl.push(exprL);
      nl.push(exprR);
      return nl;

    case "*":
      this.consume("*");
      exprR = this.parseExpr();
      nl = new NodeList();
      nl.push("*");
      nl.push(exprL);
      nl.push(exprR);
      return nl;

    case "==":
      this.consume("==");
      exprR = this.parseExpr();
      nl = new NodeList();
      nl.push("eq");
      nl.push(exprL);
      nl.push(exprR);
      return nl;

    case "!=":
      this.consume("!=");
      exprR = this.parseExpr();
      nl = new NodeList();
      nl.push("neq");
      nl.push(exprL);
      nl.push(exprR);
      return nl;

    default:
      throw new Error();
    }
  }

  parseExpr(): Expr {
    const tLeft = this.peek();

    if (tLeft.value === "(") {
      this.consume("(");
      const exprL = this.parseExpr();
      this.consume(")");

      return this.parseExprRight(exprL);
    }

    if (
      tLeft._type === "int" ||
        tLeft._type === "ident"
    ) {
      this.pos++;

      const exprL = tLeft.value;
      return this.parseExprRight(exprL);
    } else {
      throw new Error();
    }
  }

  parseSet(): NodeList {
    this.consume("set");

    const t = this.peek();
    this.pos++;
    const varName = t.value;

    this.consume("=");

    const expr = this.parseExpr();

    this.consume(";");

    const nl = new NodeList();
    nl.push("set");
    nl.push(varName);
    nl.push(expr);

    return nl;
  }

  parseCall(): NodeList {
    this.consume("call");

    const t = this.peek();
    this.pos++;
    const funcName = t.value;

    this.consume("(");

    const args = this.parseArgs();

    this.consume(")");
    this.consume(";");

    const nl = new NodeList();
    nl.push("call");
    nl.push(funcName);
    nl.pushAll(args.els);

    return nl;
  }

  parseFuncall(): NodeList {
    const t = this.peek();
    this.pos++;

    const funcName = t.value;

    this.consume("(");
    const args = this.parseArgs();
    this.consume(")");

    const nl = new NodeList();
    nl.push(funcName);
    nl.pushAll(args.els);

    return nl;
  }

  parseCallSet(): NodeList {
    this.consume("call_set");

    const t = this.peek();
    this.pos++;

    const varName = t.value;

    this.consume("=");

    const expr = this.parseFuncall();

    this.consume(";");

    const nl = new NodeList();
    nl.push("call_set");
    nl.push(varName);
    nl.push(expr);

    return nl;
  }

  parseReturn(): NodeList {
    this.consume("return");

    const t = this.peek();

    if (t.value == ";") {
      this.consume(";");

      const nl = new NodeList();
      nl.push("return");
      return nl;
      
    } else {
      const expr = this.parseExpr();
      this.consume(";");

      const nl = new NodeList();
      nl.push("return");
      nl.push(expr);
      return nl;
    }
  }

  _parseWhenClause(): NodeList {
    this.consume("(");
    const expr = this.parseExpr();
    this.consume(")");

    this.consume("{");
    const stmts = this.parseStmts();
    this.consume("}");

    const nl = new NodeList();
    nl.push(expr);
    nl.pushAll(stmts.els);

    return nl;
  }

  parseCase(): NodeList {
    this.consume("case");

    this.consume("{");

    const whenClauses: NodeList[] = [];

    while (true) {
      const t = this.peek();
      if (t.value === "}") {
        break;
      }

      whenClauses.push(this._parseWhenClause());
    }

    this.consume("}");

    const nl = new NodeList();
    nl.push("case");
    for (let whenClause of whenClauses) {
      nl.push(whenClause);
    }

    return nl;
  }

  parseWhile(): NodeList {
    this.consume("while");

    this.consume("(");
    const expr = this.parseExpr();
    this.consume(")");

    this.consume("{");
    const stmts = this.parseStmts();
    this.consume("}");

    const nl = new NodeList();
    nl.push("while");
    nl.push(expr);
    nl.push(stmts);

    return nl;
  }

  parseVmComment(): NodeList {
    this.consume("_cmt");
    this.consume("(");

    const t = this.peek();
    this.pos++;

    const comment = t.value;

    this.consume(")");
    this.consume(";");

    const nl = new NodeList();
    nl.push("_cmt");
    nl.push(comment);

    return nl;
  }

  parseStmt(): NodeList {
    const t = this.peek();

    switch(t.value) {
    case "set": return this.parseSet();
    case "call": return this.parseCall();
    case "call_set": return this.parseCallSet();
    case "return": return this.parseReturn();
    case "while": return this.parseWhile();
    case "case": return this.parseCase();
    case "_cmt": return this.parseVmComment();
    default:
      throw new Error();
    }
  }

  parseStmts(): NodeList {
    const stmts = new NodeList();

    while (true) {
      if (this.isEnd() || this.peek().value === "}") {
        break;
      }

      const stmt = this.parseStmt();
      stmts.push(stmt);
    }

    return stmts;
  }

  parseTopStmt(): NodeList {
    const t = this.peek();

    if (t.value === "func") {
      return this.parseFunc();
    } else {
      throw new Error();
    }
  }

  parseTopStmts(): NodeList {
    const topStmts = new NodeList();

    while (! this.isEnd()) {
      topStmts.push(this.parseTopStmt());
    }

    return topStmts;
  }

  parse(): NodeList {
    const stmts = this.parseTopStmts();

    const nl = new NodeList();
    nl.push("top_stmts");
    nl.pushAll(stmts.els);

    return nl;
  }
}

// --------------------------------

const src = await FileReader.readAll(Deno.args[0]);

const tokens = tokenize(src);

const parser = new Parser(tokens);

let tree;

try {
  tree = parser.parse();
} catch(e) {
  parser.dumpState();
  throw e;
}

console.log(JSON.stringify(tree.toPlain(), null, "  "));
