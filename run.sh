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
tree_file=${TMPDIR}/${bname}.vgt.json

deno run --allow-read \
  vgparser.ts $infile > $tree_file

deno run --allow-read \
  vgcg.ts $tree_file
