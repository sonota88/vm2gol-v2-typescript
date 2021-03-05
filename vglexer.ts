import { FileReader } from "./lib/file_reader.ts"

import {
  List,
  Token
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
      tokens.push(new Token("int", str));
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

const src = await FileReader.readAll(Deno.args[0]);

const tokens = tokenize(src);

tokens.forEach(token => {
  console.log(token.toLine());
});
