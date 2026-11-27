// @vitest-environment node
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { expandTalkCue, TALK_CUE_FRAMES } from '../src/voice/talkCuePcm';

/**
 * TALK-CUE-PCM against the desktop's built ELFs (MISSION OT.R146; the read pilot/sound/read-talk-cue-pcm.md s2): the table
 * held by hash only -- no byte of it is in this file. Reads `SOCOM_PC_ROOT`'s `dist-r0004/socom2_game.elf` (r0004, the
 * gameplay specification) and `dist/socom2_game.elf` (r0001), and SKIPS without them -- a skip is said, never a pass.
 */
const ROOT = process.env.SOCOM_PC_ROOT;
const elf = (dir: string): string | null => {
  const p = ROOT ? join(ROOT, dir, 'socom2_game.elf') : '';
  return p && existsSync(p) ? p : null;
};
const R4 = elf('dist-r0004'), R1 = elf('dist');
const sha = (b: Uint8Array): string => createHash('sha256').update(b).digest('hex').slice(0, 16);
const le16 = (s: Int16Array): Uint8Array => { const b = new Uint8Array(s.length * 2); const v = new DataView(b.buffer); s.forEach((x, i) => v.setInt16(2 * i, x, true)); return b; };

describe.skipIf(!R4)('r0004 (dist-r0004/socom2_game.elf at 0x2f9d10)', () => {
  const bytes = (): Uint8Array => new Uint8Array(readFileSync(R4!));
  it('the table: 2,000 bytes, sha256 ea474173cbc4e613; with the tail byte (TALK_CUE_TAIL_BYTE_READING), 2,001 bytes, 132227ee72a3cea2', () => {
    const b = bytes();
    expect(sha(b.subarray(0x2f9d10, 0x2f9d10 + TALK_CUE_FRAMES))).toBe('ea474173cbc4e613');
    expect(sha(b.subarray(0x2f9d10, 0x2f9d10 + TALK_CUE_FRAMES + 1))).toBe('132227ee72a3cea2');
  });
  it('the grant and the reversed cue (with the tail byte) match the read\'s mono s16le anchors', () => {
    const b = bytes(), t = b.slice(0x2f9d10, 0x2f9d10 + TALK_CUE_FRAMES), tail = b[0x2f9d10 + TALK_CUE_FRAMES]!;
    expect(sha(le16(expandTalkCue(t, null, 'grant')))).toBe('a7a2d4db67a7ea85');
    expect(sha(le16(expandTalkCue(t, tail, 'reversed')))).toBe('2b4f33555f63a678');
  });
});

describe.skipIf(!R1)('r0001 (dist/socom2_game.elf at 0x2ceb40)', () => {
  it('the same table; its own tail byte (the 2,001 bytes hash 73f1233c058347ce)', () => {
    const b = new Uint8Array(readFileSync(R1!));
    expect(sha(b.subarray(0x2ceb40, 0x2ceb40 + TALK_CUE_FRAMES))).toBe('ea474173cbc4e613');
    expect(sha(b.subarray(0x2ceb40, 0x2ceb40 + TALK_CUE_FRAMES + 1))).toBe('73f1233c058347ce');
  });
});
