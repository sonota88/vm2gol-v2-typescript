import { Memory, Vgvm } from "./lib/vm.ts"

const exeFile = Deno.args[0];

const stackSize = 50;
const mem = new Memory(stackSize);
const vm = new Vgvm(mem, stackSize);
await vm.loadProgramFile(exeFile);

await vm.start();
vm.dump();
console.log("exit");
