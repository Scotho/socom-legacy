import { TALK_CUE_FRAMES } from './talkCuePcm';

/**
 * TALK-CUE-PCM's table (MISSION OT.R146 as amended, the owner's (2)), as the page carries it: `./talkCueTable.generated.ts`
 * in the PRIVATE repo, written only by `socomlegacy/tools/talkCueDerive.mjs` from the desktop's built ELF (r0004's at file
 * offset 0x2f9d10), never by hand. The public export excludes it (`workflow/public-export.json`), so it is reached
 * through an optional glob, never an import: a tree without it -- the public edition -- has no table, and the talk cue
 * is silent there (said in research 170 s5.4, never a fallback sound).
 */

/** The generated module's shape: the table and the byte past it (MISSION OT.R146 as amended: both in this module only). */
export interface TalkCueTableModule { TALK_CUE_TABLE?: unknown; TALK_CUE_TAIL?: unknown }

/** The table from a generated module: exactly 2,000 bytes, else null. */
export function talkCueTableOf(mod: TalkCueTableModule | undefined): Uint8Array | null {
  const t = mod?.TALK_CUE_TABLE;
  return t instanceof Uint8Array && t.length === TALK_CUE_FRAMES ? t : null;
}

/** The tail byte from a generated module: an integer 0..255, else null. */
export function talkCueTailOf(mod: TalkCueTableModule | undefined): number | null {
  const b = mod?.TALK_CUE_TAIL;
  return typeof b === 'number' && Number.isInteger(b) && b >= 0 && b <= 255 ? b : null;
}

/** The optional generated module: an empty map where the build host did not derive it. */
const generated = import.meta.glob<TalkCueTableModule>('./talkCueTable.generated.ts', { eager: true });

/** The page's talk-cue table, or null where this build carries none. */
export const TALK_CUE_TABLE: Uint8Array | null = talkCueTableOf(Object.values(generated)[0]);
/**
 * The page's tail byte (`TALK_CUE_TAIL_BYTE_READING`, research 170 s10: r0004's static byte at table index 2000, which the
 * reversed cue plays first), or null where this build carries none -- then the release cue's first sample is silent.
 */
export const TALK_CUE_TAIL_BYTE: number | null = talkCueTailOf(Object.values(generated)[0]);
