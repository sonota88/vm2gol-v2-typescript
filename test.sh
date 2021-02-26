#!/bin/bash

set -o nounset
set -o errexit

# --------------------------------

test_cg(){
  local actual=z_test.vga.txt

  NO_COLOR= \
    deno run --allow-read vgcg.ts test/gol.vgt.json > $actual
  local st=$?
  if [ $st -ne 0 ]; then
    exit $st
  fi

  diff -uw test/gol.vga.txt $actual
  if [ $? -ne 0 ]; then
    errs="${errs},cg"
  fi
}

test_parser(){
  local actual=z_test.vgt.json

  deno run --allow-read vgparser.ts gol.vg.txt > $actual
  local st=$?
  if [ $st -ne 0 ]; then
    exit $st
  fi

  diff -u test/gol.vgt.json $actual
  if [ $? -ne 0 ]; then
    errs="${errs},parser"
  fi
}

test_all() {
  deno test || errs="${errs},deno_test"
  test_cg
  test_parser
}

# --------------------------------

errs=""

cmd="$1"; shift
case $cmd in
  parse | p*)
    test_parser
    ;;
  codegen | c*)
    test_cg
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
