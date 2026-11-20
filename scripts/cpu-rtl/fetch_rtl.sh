#!/usr/bin/env bash
# Re-fetch the CPU RTL at the pinned commit into vendor/ (owner's public repo).
set -euo pipefail
SHA=75f2f7971bfd358b03445c36ee76adcb8b560803
cd "$(dirname "$0")/vendor"
for f in ALU.v Control.v EX_MEM.v ID_EX.v IF_ID.v Instruction_Memory.v MEM_WB.v Registers.v dataMem.v \
         bin2bcd.v debouncer.v decoder_7_seg.v timer_display.v sysClock.v Pyssembler.py memory.mem program.txt README.md; do
  gh api "repos/b-clown-code/8-bit-verilog-processor/contents/$f?ref=$SHA" --jq .content | base64 -d > "$f"
done
