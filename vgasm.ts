import { FileReader } from "./lib/file_reader.ts"

type Value = string | number;

class Operation {
  words: string[];

  constructor(words: string[]){
    this.words = words;
  }

  getOperator() {
    return this.words[0];
  }

  getOperands() {
    return this.words.slice(1);
  }
}

async function readAllLines(path: string): Promise<string[]> {
  const fr = new FileReader(path);
  const lines: string[] = [];

  try {
    await fr.eachLine((line: string) => {
      lines.push(line.trim());
    });
  } finally {
    fr.close();
  }

  return lines;
}

const toOperations = (lines: string[]) => {
  const alines: Operation[] = [];

  lines.forEach(line => {
    const words = line.replace(/#.*/, "").split(/ +/);
    if (words.length === 1 && words[0] === "") {
      return;
    }
    if (words.length > 0) {
      alines.push(new Operation(words));
    }
  });

  return alines;
};

const createLabelAddrMap = (ops: Operation[]) => {
  const map = new Map<string, number>();

  let addr = 0;
  ops.forEach(op => {
    const operator = op.getOperator();
    const operands = op.getOperands();

    if (operator === "label") {
      const name = operands[0];
      map.set(name, addr);
      addr += 2;
    } else {
      addr++;
      addr += operands.length;
    }
  });

  return map;
};

// --------------------------------

const lines = await readAllLines(Deno.args[0]);
const operations = toOperations(lines);

const labelAddrMap = createLabelAddrMap(operations);

const words = new Array<Value>();

operations.forEach(op => {
  const operator = op.getOperator();
  const operands = op.getOperands();

  words.push(operator);

  if (operator === "label") {
    words.push(operands[0]);
  } else if (
    operator === "jump" ||
    operator === "jump_eq" ||
    operator === "call"
  ) {
    const labelName = operands[0];
    const addr = labelAddrMap.get(labelName);
    if (addr == null) {
      throw new Error("must not happen");
    } else {
      words.push(addr + 2);
    }
  } else {
    operands.forEach(operand => {
      if (/^-?\d+$/.test(operand)) {
        words.push(parseInt(operand));
      } else {
        words.push(operand);
      }
    });
  }
});

words.forEach(word => {
  if (typeof word === "string") {
    console.log('"' + word + '"');
  } else {
    console.log(word.toString());
  }
});
