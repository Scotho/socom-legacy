import { describe, expect, it } from 'vitest';
import {
  expandTalkCue, toStereoFrames, TALK_CUE_FRAMES, TALK_CUE_RATE, talkCueSample,
} from '../src/voice/talkCuePcm';

/**
 * TALK-CUE-PCM (MISSION OT.R146, the owner's "B" 2026-11-24T03:39:43Z; research 170 s5.4; the read
 * pilot/sound/read-talk-cue-pcm.md, reading, pending review): the original's online talk cue, expanded from its 2,000-byte
 * table. Transcription tests on SYNTHETIC tables -- no byte of the game's table is in this file; the real table's
 * identity is held by `talkCuePcm.devdata.test.ts` against the local ELF, by hash.
 */

/** A synthetic 2,000-byte table: byte i = i mod 256 (every byte value, in order). */
const synthetic = (): Uint8Array => Uint8Array.from({ length: TALK_CUE_FRAMES }, (_, i) => i & 0xff);
const int8 = (b: number): number => ((b & 0xff) ^ 0x80) - 0x80;

describe('the sample rule: a table byte is the high byte of a signed 16-bit sample (r0004 0x0032c428-0x0032c4a4)', () => {
  it('int8(b) x 256 for every byte value, the low byte always 0', () => {
    for (let b = 0; b < 256; b++) {
      expect(talkCueSample(b)).toBe(int8(b) * 256);
      expect(talkCueSample(b) & 0xff).toBe(0);
    }
    expect([0x00, 0x30, 0x7f, 0x80, 0xad, 0xff].map(talkCueSample)).toEqual([0, 12288, 32512, -32768, -21248, -256]);
  });
});

describe('the grant: indices 0..1999 forward (r0001 FUN_0030ec10 D:L211145-211161; r0004 0x0032c418)', () => {
  it('grant[i] = sample(table[i]), 2,000 samples', () => {
    const t = synthetic();
    const g = expandTalkCue(t, 0x21, 'grant');
    expect(g.length).toBe(TALK_CUE_FRAMES);
    for (let i = 0; i < TALK_CUE_FRAMES; i++) expect(g[i]).toBe(talkCueSample(t[i]!));
  });
  it('the tail byte does not reach the grant', () => {
    const t = synthetic();
    expect(Array.from(expandTalkCue(t, 0x21, 'grant'))).toEqual(Array.from(expandTalkCue(t, 0x01, 'grant')));
  });
});

describe('the release, a loss, the 10 s cap: indices 2000..1 reversed, index 2000 the byte past the table (r0004 0x0032c6c0, 0x0032c9d0)', () => {
  it('rev[0] is the tail byte; rev[i] = sample(table[2000 - i]) for i = 1..1999', () => {
    const t = synthetic();
    const r = expandTalkCue(t, 0x21, 'reversed');
    expect(r.length).toBe(TALK_CUE_FRAMES);
    expect(r[0]).toBe(8448);
    for (let i = 1; i < TALK_CUE_FRAMES; i++) expect(r[i]).toBe(talkCueSample(t[TALK_CUE_FRAMES - i]!));
    expect(r[TALK_CUE_FRAMES - 1]).toBe(talkCueSample(t[1]!));
  });
  it('table[0] is never read: poisoning it changes nothing; the tail byte changes rev[0] only', () => {
    const t = synthetic(), p = synthetic();
    p[0] = 0x7f;
    expect(Array.from(expandTalkCue(p, 0x21, 'reversed'))).toEqual(Array.from(expandTalkCue(t, 0x21, 'reversed')));
    const a = expandTalkCue(t, 0x21, 'reversed'), b = expandTalkCue(t, 0x33, 'reversed');
    expect(a[0]).toBe(8448);
    expect(b[0]).toBe(13056);
    expect(Array.from(a.subarray(1))).toEqual(Array.from(b.subarray(1)));
  });
  it('is NOT the obvious reversal 1999..0', () => {
    const t = synthetic();
    const obvious = Int16Array.from({ length: TALK_CUE_FRAMES }, (_, i) => talkCueSample(t[TALK_CUE_FRAMES - 1 - i]!));
    expect(Array.from(expandTalkCue(t, 0x21, 'reversed'))).not.toEqual(Array.from(obvious));
  });
});

describe('the frames: stereo with L = R, 8,000 Hz, 0.25 s (r0001 FUN_0030f5f0 D:L211310-211352, FUN_003102e0 D:L211846-211854)', () => {
  it('2,000 frames of L = R = the mono sample', () => {
    const mono = expandTalkCue(synthetic(), 0x21, 'grant');
    const st = toStereoFrames(mono);
    expect(st.length).toBe(2 * TALK_CUE_FRAMES);
    for (let i = 0; i < TALK_CUE_FRAMES; i++) { expect(st[2 * i]).toBe(mono[i]); expect(st[2 * i + 1]).toBe(mono[i]); }
    expect(TALK_CUE_RATE).toBe(8000);
    expect(TALK_CUE_FRAMES / TALK_CUE_RATE).toBe(0.25);
  });
});

describe('the constants', () => {
  it('a null tail (a silent first sample) keeps the length and every other sample', () => {
    const t = synthetic();
    const d = expandTalkCue(t, null, 'reversed'), f = expandTalkCue(t, 0x21, 'reversed');
    expect(d.length).toBe(TALK_CUE_FRAMES);
    expect(d[0]).toBe(0);
    expect(Array.from(d.subarray(1))).toEqual(Array.from(f.subarray(1)));
  });
  it('refuses a table that is not 2,000 bytes', () => {
    expect(() => expandTalkCue(new Uint8Array(1999), 0x21, 'grant')).toThrow();
  });
});
