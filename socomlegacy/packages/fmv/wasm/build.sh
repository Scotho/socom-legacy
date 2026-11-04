#!/usr/bin/env bash
# Build libmpeg2 0.5.1 to WebAssembly: PLAT-19a's spike (web research 98 section 7), the page's decoder since PLAT-19b
# (web research 120). Dev host only; nothing here runs in CI and nothing it writes is committed.
#
#   bash packages/fmv/wasm/build.sh <path/to/mpeg2dec_0.5.1.orig.tar.gz>
#
# The script fetches nothing. The tarball is upstream's libmpeg2-0.5.1 release as Debian archives it (the `mpeg2dec`
# source package): https://deb.debian.org/debian/pool/main/m/mpeg2dec/mpeg2dec_0.5.1.orig.tar.gz, 524,776 bytes,
# sha256 pinned below and checked against the `.dsc`'s Checksums-Sha256 (mpeg2dec_0.5.1-11.dsc). Debian's patches
# are NOT applied: upstream's C files are compiled as they are. The `SHA256=` and `BYTES=` lines below are the pin's one
# place: `tools/fmvShip.ts` reads them to check the tarball it ships beside the wasm (OT.R66).
#
# The tarball's `configure` and scripts are never run: the C files of the decoder core (libmpeg2/Makefile.am's
# libmpeg2_la_SOURCES plus cpu_accel.c and cpu_state.c, which hold mpeg2_detect_accel / mpeg2_cpu_state_init and
# compile to the no-acceleration path without an ARCH_* macro) are compiled directly with `emcc`, against the
# hand-written config.h beside this script. These flags are the whole build.
#
# Written against emcc 6.0.10 (d6c521a7f05449857c76bd99e396895583cf2083), emsdk at ~/emsdk on the
# dev host: `source <emsdk>/emsdk_env.sh` first (the script refuses without emcc on PATH).
#
# Output: packages/fmv/wasm/out/ (git-ignored by .gitignore beside this file): src/ (the unpacked tarball),
# mpeg2dec_0.5.1.orig.tar.gz (the tarball given, once checked: the build ships it beside the wasm, OT.R66),
# libmpeg2.wasm (standalone: no JS glue, no imports but what the line below prints), and build.txt (emcc's version,
# the flags, the sizes).
set -euo pipefail

SHA256=dee22e893cb5fc2b2b6ebd60b88478ab8556cb3b93f9a0d7ce8f3b61851871d4
BYTES=524776
HERE=$(cd "$(dirname "$0")" && pwd)
OUT=$HERE/out
TARBALL=${1:?usage: build.sh <mpeg2dec_0.5.1.orig.tar.gz>}
OPT=${S2U_FMV_OPT:--O3}   # the spike's build; S2U_FMV_OPT=-Oz measures the size-optimised one

command -v emcc >/dev/null || { echo "build.sh: emcc not on PATH (source the emsdk's emsdk_env.sh)" >&2; exit 2; }
got=$(sha256sum "$TARBALL" | cut -d' ' -f1)
[ "$got" = "$SHA256" ] || { echo "build.sh: $TARBALL sha256 $got, expected $SHA256" >&2; exit 3; }
size=$(wc -c < "$TARBALL" | tr -d ' ')
[ "$size" = "$BYTES" ] || { echo "build.sh: $TARBALL is $size bytes, expected $BYTES" >&2; exit 3; }

# Keep the checked tarball beside the wasm: the build ships it with it (tools/fmvShip.ts), and a later build finds it.
mkdir -p "$OUT"
[ "$TARBALL" -ef "$OUT/mpeg2dec_0.5.1.orig.tar.gz" ] || cp "$TARBALL" "$OUT/mpeg2dec_0.5.1.orig.tar.gz"

rm -rf "$OUT/src"
mkdir -p "$OUT/src"
tar xzf "$TARBALL" -C "$OUT/src"
SRC=$OUT/src/libmpeg2-0.5.1

CORE="alloc.c header.c decode.c slice.c motion_comp.c idct.c cpu_accel.c cpu_state.c"
EXPORTS=s2u_fmv_open,s2u_fmv_buffer,s2u_fmv_feed,s2u_fmv_feed_tagged,s2u_fmv_tag,s2u_fmv_tagged,s2u_fmv_next,s2u_fmv_flush,s2u_fmv_plane,s2u_fmv_index,s2u_fmv_type
EXPORTS=$EXPORTS,s2u_fmv_flags,s2u_fmv_temporal_reference,s2u_fmv_nb_fields,s2u_fmv_invalid,s2u_fmv_ended
EXPORTS=$EXPORTS,s2u_fmv_width,s2u_fmv_height,s2u_fmv_chroma_width,s2u_fmv_chroma_height,s2u_fmv_release,s2u_fmv_close,s2u_fmv_reset
EXPORTED=$(echo "$EXPORTS" | sed 's/[^,]*/_&/g')

FLAGS=(
  "$OPT"
  -std=gnu99                      # upstream's code is C89/C99 with gcc extensions (__attribute__)
  -I "$HERE" -I "$SRC/include" -I "$SRC/libmpeg2"
  -sSTANDALONE_WASM=1 --no-entry  # a bare .wasm: WebAssembly.instantiate in Node or a worker, no generated JS
  -sEXPORTED_FUNCTIONS="$EXPORTED"
  -sALLOW_MEMORY_GROWTH=1         # three 640x448 frame buffers plus the chunk buffer outgrow the default heap
  -sINITIAL_MEMORY=4194304
  -sFILESYSTEM=0
)

( cd "$SRC/libmpeg2" && emcc "${FLAGS[@]}" $CORE "$HERE/glue.c" -o "$OUT/libmpeg2.wasm" )

{
  emcc --version | head -1
  echo "flags: ${FLAGS[*]}"
  echo "sources: $CORE glue.c"
  echo "libmpeg2.wasm: $(stat -c %s "$OUT/libmpeg2.wasm") bytes raw, $(gzip -9c "$OUT/libmpeg2.wasm" | wc -c) gzip -9"
} | tee "$OUT/build.txt"
