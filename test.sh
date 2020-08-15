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
}

test_parser(){
  local actual=z_test.vgt.json

  deno run --allow-read vgparser.ts gol.vg.txt > $actual
  local st=$?
  if [ $st -ne 0 ]; then
    exit $st
  fi

  diff -u test/gol.vgt.json $actual
}

# --------------------------------

errs=""

deno test || errs="${errs},deno_test"
test_cg || errs="${errs},cg"
test_parser || errs="${errs},parser"

if [ "$errs" != "" ]; then
  echo $errs
  echo "FAILED"
  exit 1
fi
