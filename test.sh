#!/bin/bash

set -o nounset

readonly TMP_DIR=z_tmp

# --------------------------------

run_lexer() {
  local infile="$1"; shift
  local outfile="$1"; shift

  deno run --allow-read lexer.ts $infile > $outfile
}

run_parser() {
  local infile="$1"; shift
  local outfile="$1"; shift

  deno run --allow-read parser.ts $infile > $outfile
}

run_codegen() {
  local infile="$1"; shift
  local outfile="$1"; shift

  NO_COLOR= \
    deno run --allow-read codegen.ts $infile > $outfile
}

# --------------------------------

test_compile_nn() {
  local nn="$1"; shift

  echo "case ${nn}"

  local src_file="test/compile/${nn}.vg.txt"
  local temp_tokens_file="${TMP_DIR}/z_test.tokens.txt"
  local temp_vgt_file="${TMP_DIR}/test.vgt.json"
  local temp_vga_file="${TMP_DIR}/test.vga.txt"
  local exp_file="test/compile/exp_${nn}.vga.txt"
  local diff_file="${TMP_DIR}/test_compile_${nn}.diff"

  run_lexer $src_file $temp_tokens_file
  run_parser $temp_tokens_file $temp_vgt_file
  run_codegen $temp_vgt_file $temp_vga_file

  ruby test/diff.rb asm $exp_file $temp_vga_file > $diff_file

  local num_lines=$(wc -l ${diff_file} | cut -d " " -f 1)
  if [ $num_lines -ne 0 ]; then
    errs="${errs},compile_${nn}_diff"
    echo "test_compile ${nn} failed. For detail, run: " >&2
    echo "  cat ${diff_file}" >&2
    echo "" >&2
  fi
}

test_compile() {
  local nn=

  if [ $# -ge 1 ]; then
    nn="$(printf "%02d" $1)"
    test_compile_nn "$nn"
  else
    for n in 1 11 29; do
      nn="$(printf "%02d" $n)"
      test_compile_nn $nn
    done
  fi
}

test_all() {
  # echo "==== deno test ===="
  # deno test || errs="${errs},deno_test"

  echo "==== compile ===="
  test_compile
}

# --------------------------------

errs=""

cmd="$1"; shift
case $cmd in
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
