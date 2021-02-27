#!/bin/bash

set -o nounset
set -o errexit

# --------------------------------

run_parser() {
  local infile="$1"; shift
  local outfile="$1"; shift

  deno run --allow-read vgparser.ts $infile > $outfile
}

run_codegen() {
  local infile="$1"; shift
  local outfile="$1"; shift

  NO_COLOR= \
    deno run --allow-read vgcg.ts $infile > $outfile
}

# --------------------------------

test_parser(){
  local actual=z_test.vgt.json

  run_parser gol.vg.txt $actual
  local st=$?
  if [ $st -ne 0 ]; then
    exit $st
  fi

  diff -u test/gol.vgt.json $actual
  if [ $? -ne 0 ]; then
    errs="${errs},parser"
  fi
}

test_cg(){
  local actual=z_test.vga.txt

  run_codegen test/gol.vgt.json $actual
  local st=$?
  if [ $st -ne 0 ]; then
    exit $st
  fi

  diff -uw test/gol.vga.txt $actual
  if [ $? -ne 0 ]; then
    errs="${errs},cg"
  fi
}

test_compile_nn() {
  local nn="$1"; shift

  local src_file="test/compile/${nn}.vg.txt"
  local temp_vgt_file="z_tmp/test.vgt.json"
  local temp_vga_file="z_tmp/test.vga.txt"
  local exp_vga_file="test/compile/exp_${nn}.vga.txt"

  run_parser $src_file $temp_vgt_file
  run_codegen $temp_vgt_file $temp_vga_file

  ruby test/diff.rb asm $exp_vga_file $temp_vga_file
  if [ $? -ne 0 ]; then
    errs="${errs},compile_${nn}_diff"
  fi
}

test_compile() {
  if [ $# -ge 1 ]; then
    test_compile_nn "$1"
  else
    test_compile_nn 01
    test_compile_nn 29
  fi
}

test_all() {
  echo "==== deno test ===="
  deno test || errs="${errs},deno_test"

  echo "==== parser ===="
  test_parser

  echo "==== codegen ===="
  test_cg

  echo "==== compile ===="
  test_compile
}

# --------------------------------

errs=""

cmd="$1"; shift
case $cmd in
  parse | p*)
    test_parser
    ;;
  codegen)
    test_cg
    ;;
  compile | c*)
    test_compile "$@"
    ;;
  all | a*)
    test_all
    ;;
  *)
    echo "invalid command" >&2
    exit 1
    ;;
esac

if [ "$errs" != "" ]; then
  echo $errs
  echo "FAILED"
  exit 1
fi
