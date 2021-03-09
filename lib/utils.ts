const textEncoder = new TextEncoder();

const print_e = (arg: any) => {
  Deno.stderr.writeSync(
    textEncoder.encode(String(arg)),
  );
};

export const puts_e = (...args: any[]) => {
  for (let arg of args) {
    print_e(String(arg) + "\n");
  }
};

// --------------------------------

export function notYetImpl(...args: any[]) {
  const msg = "Not yet implemented" +
    args
      .map(arg => ` (${ Deno.inspect(arg) })`)
      .join("");
  return new Error(msg);
}

export function invalidType(...args: any[]) {
  const msg = "Invalid type" +
    args
      .map(arg => ` (${ Deno.inspect(arg) }: ${typeof arg})`)
      .join("");
  return new Error(msg);
}
