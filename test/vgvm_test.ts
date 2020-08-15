import { assertEquals } from "https://deno.land/std/testing/asserts.ts";

import { Vgvm, Memory, MemVal } from "../lib/vm.ts";

function createVm() {
  const stackSize = 50
  const mem = new Memory(stackSize);
  return new Vgvm(mem, stackSize);
}

function run(vm: Vgvm, words: MemVal[]) {
  vm.mem.main = words;
  vm.execute();
}

// --------------------------------

Deno.test("set_reg_a", ()=>{
  const vm = createVm();

  run(
    vm,
    ["set_reg_a", 12]
  );

  assertEquals(vm.regA, 12);
});

// --------------------------------

Deno.test("set_reg_b", ()=>{
  const vm = createVm();

  run(
    vm,
    ["set_reg_b", 12]
  );

  assertEquals(vm.regB, 12);
});

// --------------------------------

Deno.test("cp to reg_a", ()=>{
  const vm = createVm();

  run(
    vm,
    ["cp", 42, "reg_a"]
  );

  assertEquals(vm.regA, 42);
});

Deno.test("cp to reg_b", ()=>{
  const vm = createVm();

  run(
    vm,
    ["cp", 42, "reg_b"]
  );

  assertEquals(vm.regB, 42);
});

// --------------------------------

Deno.test("cp from reg_a", ()=>{
  const vm = createVm();
  vm.regA = 42;

  run(
    vm,
    ["cp", "reg_a", "reg_b"]
  );

  assertEquals(vm.regB, 42);
});

Deno.test("cp from sp", ()=>{
  const vm = createVm();
  vm.sp = 42;

  run(
    vm,
    ["cp", "sp", "reg_a"]
  );

  assertEquals(vm.regA, 42);
});

Deno.test("cp from bp", ()=>{
  const vm = createVm();
  vm.bp = 42;

  run(
    vm,
    ["cp", "bp", "reg_a"]
  );

  assertEquals(vm.regA, 42);
});

Deno.test("cp from bp+N", ()=>{
  const vm = createVm();
  vm.bp = 45;
  vm.mem.stack[vm.bp + 2] = 42;

  run(
    vm,
    ["cp", "[bp+2]", "reg_a"]
  );

  assertEquals(vm.regA, 42);
});

Deno.test("cp from bp-N", ()=>{
  const vm = createVm();
  vm.mem.stack[vm.bp - 2] = 42;

  run(
    vm,
    ["cp", "[bp-2]", "reg_a"]
  );

  assertEquals(vm.regA, 42);
});

// --------------------------------

Deno.test("cp to bp", ()=>{
  const vm = createVm();

  run(
    vm,
    ["cp", 42, "bp"]
  );

  assertEquals(vm.bp, 42);
});

Deno.test("cp to sp", ()=>{
  const vm = createVm();

  run(
    vm,
    ["cp", 42, "sp"]
  );

  assertEquals(vm.sp, 42);
});

Deno.test("cp to bp-N", ()=>{
  const vm = createVm();

  assertEquals(vm.bp, 49);

  run(
    vm,
    ["cp", 42, "[bp-2]"]
  );

  assertEquals(vm.mem.stack[49 - 2], 42);
});

// --------------------------------

Deno.test("add_ab", ()=>{
  const vm = createVm();
  vm.regA = 2;
  vm.regB = 3;

  run(
    vm,
    ["add_ab"]
  );

  assertEquals(vm.regA, 5);
});

// --------------------------------

Deno.test("mult_ab", ()=>{
  const vm = createVm();
  vm.regA = 2;
  vm.regB = 3;

  run(
    vm,
    ["mult_ab"]
  );

  assertEquals(vm.regA, 6);
});

// --------------------------------

Deno.test("add_sp", ()=>{
  const vm = createVm();
  vm.sp = 45;

  run(
    vm,
    ["add_sp", 2]
  );

  assertEquals(vm.sp, 45 + 2);
});

// --------------------------------

Deno.test("sub_sp", ()=>{
  const vm = createVm();
  assertEquals(vm.sp, 49);

  run(
    vm,
    ["sub_sp", 2]
  );

  assertEquals(vm.sp, 49 - 2);
});

// --------------------------------

Deno.test("compare (equal)", ()=>{
  const vm = createVm();
  vm.regA = 0;
  vm.regB = 0;

  run(
    vm,
    ["compare"]
  );

  assertEquals(vm.zf, Vgvm.FLAG_TRUE);
});

Deno.test("compare (not equal)", ()=>{
  const vm = createVm();
  vm.regA = 0;
  vm.regB = 1;

  run(
    vm,
    ["compare"]
  );

  assertEquals(vm.zf, Vgvm.FLAG_FALSE);
});

// --------------------------------

Deno.test("jump", ()=>{
  const vm = createVm();

  run(
    vm,
    ["jump", 3]
  );

  assertEquals(vm.pc, 3);
});

// --------------------------------

Deno.test("jump_eq (equal)", ()=>{
  const vm = createVm();
  vm.zf = Vgvm.FLAG_TRUE;
  vm.regB = 1;

  run(
    vm,
    ["jump_eq", 3]
  );

  assertEquals(vm.pc, 3);
});

Deno.test("jump_eq (not equal)", ()=>{
  const vm = createVm();
  vm.zf = Vgvm.FLAG_FALSE;
  vm.regB = 1;

  run(
    vm,
    ["jump_eq", 3]
  );

  assertEquals(vm.pc, 2);
});

// --------------------------------

Deno.test("call", ()=>{
  const vm = createVm();
  assertEquals(vm.pc, 0);
  assertEquals(vm.sp, 49);

  run(
    vm,
    ["call", 8]
  );

  assertEquals(vm.sp, 49 - 1);
  assertEquals(vm.mem.stack[vm.sp], 0 + 2);
  assertEquals(vm.pc, 8);
});

// --------------------------------

Deno.test("ret", ()=>{
  const vm = createVm();
  vm.sp = 45;
  vm.mem.stack[vm.sp] = 0;
  vm.pc = 1;

  run(
    vm,
    ["(dummy)", "ret"]
  );

  assertEquals(vm.sp, 45 + 1);
  assertEquals(vm.pc, 0);
});

// --------------------------------

Deno.test("push imm", ()=>{
  const vm = createVm();
  vm.sp = 48;

  run(
    vm,
    ["push", 42]
  );

  assertEquals(vm.sp, 48 - 1);
  assertEquals(vm.mem.stack[vm.sp], 42);
});

Deno.test("push reg_a", ()=>{
  const vm = createVm();
  vm.regA = 42;
  vm.sp = 48;

  run(
    vm,
    ["push", "reg_a"]
  );

  assertEquals(vm.sp, 48 - 1);
  assertEquals(vm.regA, 42);
});

Deno.test("push bp", ()=>{
  const vm = createVm();
  vm.sp = 48;
  assertEquals(vm.bp, 49);

  run(
    vm,
    ["push", "bp"]
  );

  assertEquals(vm.sp, 48 - 1);
  assertEquals(vm.mem.stack[vm.sp], 49);
});

Deno.test("push bp-N", ()=>{
  const vm = createVm();
  assertEquals(vm.sp, 49);
  assertEquals(vm.bp, 49);
  vm.mem.stack[49 - 2] = 42;

  run(
    vm,
    ["push", "[bp-2]"]
  );

  assertEquals(vm.sp, 49 - 1);
  assertEquals(vm.mem.stack[vm.sp], 42);
});

Deno.test("push bp+N", ()=>{
  const vm = createVm();
  vm.sp = 45;
  vm.bp = 45;
  vm.mem.stack[45 + 2] = 42;

  run(
    vm,
    ["push", "[bp+2]"]
  );

  assertEquals(vm.sp, 45 - 1);
  assertEquals(vm.mem.stack[vm.sp], 42);
});

// --------------------------------

Deno.test("pop to reg_a", ()=>{
  const vm = createVm();
  vm.sp = 45;
  vm.mem.stack[vm.sp] = 42;

  run(
    vm,
    ["pop", "reg_a"]
  );

  assertEquals(vm.sp, 45 + 1);
  assertEquals(vm.regA, 42);
});

Deno.test("pop to reg_b", ()=>{
  const vm = createVm();
  vm.sp = 45;
  vm.mem.stack[vm.sp] = 42;

  run(
    vm,
    ["pop", "reg_b"]
  );

  assertEquals(vm.sp, 45 + 1);
  assertEquals(vm.regB, 42);
});

Deno.test("pop to bp", ()=>{
  const vm = createVm();
  vm.sp = 45;
  vm.mem.stack[vm.sp] = 42;

  run(
    vm,
    ["pop", "bp"]
  );

  assertEquals(vm.sp, 45 + 1);
  assertEquals(vm.bp, 42);
});

// --------------------------------

Deno.test("set_vram bp+N", ()=>{
  const vm = createVm();
  vm.bp = 45;
  vm.mem.stack[vm.bp + 2] = 1;

  assertEquals(vm.mem.vram[0], 0);

  run(
    vm,
    ["set_vram", 0, "[bp+2]"]
  );

  assertEquals(vm.mem.vram[0], 1);
});

Deno.test("set_vram bp-N", ()=>{
  const vm = createVm();
  vm.bp = 45;
  vm.mem.stack[vm.bp - 2] = 1;

  assertEquals(vm.mem.vram[0], 0);

  run(
    vm,
    ["set_vram", 0, "[bp-2]"]
  );

  assertEquals(vm.mem.vram[0], 1);
});

Deno.test("set_vram set to vram[bp-N]", ()=>{
  const vm = createVm();
  vm.bp = 45;
  vm.mem.stack[vm.bp - 2] = 0;

  assertEquals(vm.mem.vram[0], 0);

  run(
    vm,
    ["set_vram", "[bp-2]", 1]
  );

  assertEquals(vm.mem.vram[0], 1);
});

// --------------------------------

Deno.test("get_vram imm", ()=>{
  const vm = createVm();
  vm.mem.vram[0] = 1;

  run(
    vm,
    ["get_vram", 0, "reg_a"]
  );

  assertEquals(vm.regA, 1);
});

Deno.test("get_vram bp-N", ()=>{
  const vm = createVm();
  vm.mem.vram[0] = 1;
  vm.mem.stack[vm.bp - 2] = 0;

  run(
    vm,
    ["get_vram", "[bp-2]", "reg_a"]
  );

  assertEquals(vm.regA, 1);
});
