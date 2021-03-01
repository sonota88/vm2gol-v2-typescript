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
