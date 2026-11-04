/*
 * config.h for libmpeg2 0.5.1 compiled to WebAssembly by build.sh (PLAT-19a; web research 98 section 7).
 *
 * Written by hand in place of the one `configure` generates from include/config.h.in: the tarball's configure is
 * never run, so every macro the decoder sees is the list below. What is left undefined is left undefined on purpose:
 *
 * - No ARCH_* (X86, PPC, ALPHA, SPARC, ARM) and no ACCEL_DETECT: mpeg2_detect_accel() returns no acceleration, and
 *   mpeg2_idct_init() / mpeg2_mc_init() / mpeg2_cpu_state_init() select the generic C paths (idct.c's
 *   mpeg2_idct_copy_c / mpeg2_idct_add_c, motion_comp.c's mpeg2_mc_c). No SIMD, no threads.
 * - No DEBUG, no MPEG2DEC_GPROF, no LIBVO_* (the video output library and the mpeg2dec program are not built).
 */
#ifndef S2U_LIBMPEG2_CONFIG_H
#define S2U_LIBMPEG2_CONFIG_H

/* attributes.h: ATTR_ALIGN(n) aligns the decoder's critical structures to min(n, 16). */
#define ATTRIBUTE_ALIGNED_MAX 16

/* attributes.h: likely()/unlikely() through __builtin_expect (clang has it). */
#define HAVE_BUILTIN_EXPECT 1

/* The headers emscripten's libc provides. */
#define HAVE_INTTYPES_H 1
#define HAVE_STDINT_H 1
#define HAVE_STDLIB_H 1
#define HAVE_STRING_H 1
#define HAVE_STRINGS_H 1
#define HAVE_MEMORY_H 1
#define HAVE_SYS_STAT_H 1
#define HAVE_SYS_TYPES_H 1
#define HAVE_UNISTD_H 1
#define STDC_HEADERS 1

/* wasm32 is little-endian: WORDS_BIGENDIAN stays undefined. */

#define PACKAGE "libmpeg2"
#define VERSION "0.5.1"

#endif
