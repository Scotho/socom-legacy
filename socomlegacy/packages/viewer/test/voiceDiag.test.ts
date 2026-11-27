// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { voiceDiagMessage, voiceDiagReporter, VOICE_DIAGS_PER_LOAD_ADAPTATION, type VoiceSessionDiag } from '../src/voice/voiceDiag';

/**
 * E15 (SCOPE-E, B-58 "mics often not working"): the voice session's field diagnostic, `voicediag` on the page's beacon --
 * a browser adaptation (`VOICE_DIAG_ADAPTATION`), fixed fields only, no audio, no ids. Unit tests only.
 */

const base: VoiceSessionDiag = {
  presses: 2, firstSendMs: 412.6, sent: 30, stale: 3, asks: 2, ungranted: 1, headset: 'ok', codec: 'ready', captureRate: 8000,
};

describe('voiceDiagMessage: v1, fixed fields, each checked', () => {
  it('carries the session as numbers and fixed words, rounded', () => {
    expect(JSON.parse(voiceDiagMessage(base))).toEqual({
      v: 1, presses: 2, firstSendMs: 413, sent: 30, stale: 3, asks: 2, ungranted: 1, headset: 'ok', codec: 'ready', captureRate: 8000,
    });
  });

  it('a word outside its set reads "other"; a bad number reads null (or 0 for a count); nothing else gets through', () => {
    const m = JSON.parse(voiceDiagMessage({
      ...base, headset: 'my-name' as never, codec: 'x'.repeat(50) as never, firstSendMs: -1, captureRate: Number.NaN,
      presses: 1.5, sent: -3, stale: Infinity, asks: 'a' as never, ungranted: 2,
    }));
    expect(m).toEqual({ v: 1, presses: 0, firstSendMs: null, sent: 0, stale: 0, asks: 0, ungranted: 2, headset: 'other', codec: 'other', captureRate: null });
    expect(Object.keys(JSON.parse(voiceDiagMessage({ ...base, extra: 'secret' } as never)))).not.toContain('extra');
  });

  it('a press that never sent a frame reports firstSendMs null', () => {
    expect(JSON.parse(voiceDiagMessage({ ...base, firstSendMs: null })).firstSendMs).toBeNull();
  });
});

describe('voiceDiagReporter: at most the cap a load, and never throws', () => {
  it(`sends ${VOICE_DIAGS_PER_LOAD_ADAPTATION} and then nothing`, () => {
    const out: string[] = [];
    const report = voiceDiagReporter((m) => { out.push(m); });
    for (let i = 0; i < VOICE_DIAGS_PER_LOAD_ADAPTATION + 3; i++) report(base);
    expect(out).toHaveLength(VOICE_DIAGS_PER_LOAD_ADAPTATION);
  });

  it('a failing send adds no error', () => {
    const report = voiceDiagReporter(() => { throw new Error('beacon down'); });
    expect(() => report(base)).not.toThrow();
  });
});
