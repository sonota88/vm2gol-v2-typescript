#!/bin/bash

set -o nounset
set -o errexit

TMPDIR=z_tmp

if [ -e "$TMPDIR" ]; then
  :
else
  mkdir "$TMPDIR"
fi

bname=run
infile="$1"
tokens_file=${TMPDIR}/${bname}.tokens.txt
tree_file=${TMPDIR}/${bname}.vgt.json

deno run --allow-read \
  vglexer.ts $infile > $tokens_file

deno run --allow-read \
  vgparser.ts $tokens_file > $tree_file

deno run --allow-read \
  vgcodegen.ts $tree_file
