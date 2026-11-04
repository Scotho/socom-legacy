/**
 * @s2u/fmv -- the movie player (web sprint 6, ruling W6.R2; PLAT-02).
 *
 * Will hold what reCOM keeps in `zMPEG`: the PSS demuxer (MPEG program stream, video plus SShd PCM; PLAT-18), the
 * MPEG-2 decoder's wrapper (PLAT-19b) and its real-time budget (PLAT-19c), movie audio and A/V sync (PLAT-20), and
 * the player's semantics -- open, loop, the end event, skip, the dialog background (PLAT-21).
 *
 * The boundary: pure, DOM-free, testable under Node as `IsoAssetSource` is. It may import `@s2u/archive` and
 * `@s2u/sound`; never `@s2u/viewer`, never `three`, never a browser global. The decoder's WebAssembly instance, the
 * frame's canvas and the Web Audio output enter through interfaces this package declares and the viewer fills.
 * Enforced by `tools/test/packageBoundaries.test.ts`. The spec:
 * `docs/specs/2026-10-01-web-sprint-6-package-boundaries.md`.
 *
 * Held so far: the PSS demuxer and the SShd header (`pss.ts`, PLAT-18, web research 109); the movie's audio path and
 * its sync rule (`movieAudio.ts`, PLAT-20, web research 137).
 */
export * from './pss';
export * from './decode';
export * from './player';
export * from './movieAudio';
