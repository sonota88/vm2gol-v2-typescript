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
