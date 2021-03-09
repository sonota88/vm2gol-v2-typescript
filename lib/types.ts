import {
  invalidType,
  notYetImpl
} from "./utils.ts"

export type Node = string | number | List;

export class List {
  els: Node[];

  constructor() {
    this.els = [];
  }

  push(el: Node) {
    this.els.push(el);
  }

  pushAll(list: List) {
    this.els.push(... list.els);
  }

  get(i: number): Node {
    return this.els[i];
  }

  forEach(fn: (elem: Node, i: number)=> void) {
    this.els.forEach(fn);
  }

  getAsString(i: number): string {
    const el = this.get(i);
    if (typeof el === "string") {
      return el;
    } else {
      throw invalidType(el);
    }
  }

  getAsNodeList(i: number): List {
    const el = this.els[i];
    if (el instanceof List) {
      return el;
    } else {
      throw invalidType(el);
    }
  }

  size(): number {
    return this.els.length;
  }

  hd(): Node {
    return this.els[0];
  }

  tl(): List {
    return List.fromEls(this.els.slice(1));
  }

  slice(n: number): List {
    return List.fromEls(this.els.slice(1));
  }

  reverse(): List {
    const newEls = [];
    for (let i = this.size() - 1; 0 <= i; i--) {
      newEls.push(this.get(i));
    }
    return List.fromEls(newEls);
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

  static fromEls(els: Node[]): List {
    const list = new List();
    list.els = els;
    return list;
  }
}

// --------------------------------

type TokenType = "kw" | "int" | "symbol" | "ident" | "str";
export type TokenValue = string;

export class Token {
  _type: TokenType;
  value: TokenValue;

  constructor(_type: TokenType, value: TokenValue) {
    this._type = _type;
    this.value = value;
  }

  getValueAsInt(): number {
    return parseInt(this.value);
  }

  toLine(): string {
    return `${this._type}:${this.value}`;
  }

  static fromLine(line: string): Token {
    const parts = line.split(":");
    const type: TokenType = <TokenType>parts[0];
    return new Token(type, parts[1]);
  }
}
