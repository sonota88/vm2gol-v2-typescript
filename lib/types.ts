import {
  invalidType,
  notYetImpl
} from "./utils.ts"

type NodeElem = string | number | NodeList;

export class NodeList {
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

  get() {
    return this.els;
  }

  forEach(fn: (elem: NodeElem, i: number)=> void) {
    this.els.forEach(fn);
  }

  getAsString(i: number): string {
    const el = this.get()[i];
    if (typeof el === "string") {
      return el;
    } else {
      throw invalidType(el);
    }
  }

  getAsNodeList(i: number): NodeList {
    const el = this.els[i];
    if (el instanceof NodeList) {
      return el;
    } else {
      throw invalidType(el);
    }
  }

  size(): number {
    return this.els.length;
  }

  hd(): NodeElem {
    return this.els[0];
  }

  tl(): NodeElem[] {
    return this.els.slice(1);
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

  static fromEls(els: NodeElem[]): NodeList {
    const nl = new NodeList();
    nl.els = els;
    return nl;
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
