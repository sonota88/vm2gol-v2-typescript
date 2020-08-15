#!/bin/bash

set -o nounset
set -o errexit

TMPDIR=z_tmp

if [ -e "$TMPDIR" ]; then
  :
else
  mkdir "$TMPDIR"
fi

tree_file=${TMPDIR}/gol.vgt.json
asm_file=${TMPDIR}/gol.vga.txt
exe_file=${TMPDIR}/gol.vge.txt

deno run --allow-read \
  vgparser.ts "gol.vg.txt" > $tree_file

deno run --allow-read \
  vgcg.ts $tree_file > $asm_file

deno run --allow-read \
  vgasm.ts $asm_file > $exe_file

deno run --allow-read \
  vgvm.ts $exe_file
