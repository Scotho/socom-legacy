import { describe, expect, it } from 'vitest';
import { DIAG_MESSAGE_MAX, inputDiagMessage, InputTrack, MatchDiag, STICK_REST_BELOW_ADAPTATION, type DiagKind, type XboxMarks } from '../src/matchDiag';
import type { SourcesSnapshot } from '../src/inputSources';

/**
 * PZG (2) (67's brief 2026-11-13, finding 14; product track, the XBOX-DIAG instrument): `inputdiag` carries each stick's
 * largest push and its resting value, read off the first pad's raw axes (before the browser's guard) from the mount to
 * the report -- `stk: { l: [max, rest], r: [max, rest] }`, the rest the most-read push under
 * `STICK_REST_BELOW_ADAPTATION` (a 0.01 bin's lower edge; null when the stick never read under it). Sent where
 * `inputdiag` goes: once a match, on an Xbox-marked page only.
 */
const pad = (lx: number, ly: number, rx = 0, ry = 0) => ({ id: 'pad', mapping: 'standard', buttons: [{ pressed: false }], axes: [lx, ly, rx, ry] });

describe('PZG (2): the sticks in inputdiag', () => {
  it('the largest push and the resting value of each stick, the first pad only', () => {
    const t = new InputTrack();
    for (let i = 0; i < 100; i++) t.poll([pad(0.086, 0.086, 0.02, 0)], i / 30);      // a drifting left stick at rest (0.1216)
    for (let i = 0; i < 10; i++) t.poll([pad(1, 0, 0, -0.9)], 4);                     // pushes
    for (let i = 0; i < 20; i++) t.poll([pad(0.3, 0.2, 0.02, 0)], 5);                // moving, not rest
    t.poll([pad(0, 0), pad(1, 1, 1, 1)], 6);                                        // a second pad is not read
    expect(t.sticks()).toEqual({ l: [1, 0.12], r: [0.9, 0.02] });
    t.reset();
    expect(t.sticks()).toEqual({ l: [0, null], r: [0, null] });
  });

  it('a corner past the rim is kept to 1.5; a stick that never rests is null', () => {
    const t = new InputTrack();
    t.poll([pad(1, 1, 0.5, 0.5)], 1);
    expect(t.sticks()).toEqual({ l: [1.41, null], r: [0.71, null] });
    expect(STICK_REST_BELOW_ADAPTATION).toBe(0.3);
  });

  it('inputdiag carries them, under the beacon\'s cap at their widest', () => {
    const XBOX: XboxMarks = { ua: false, sraKmd: true, cls: true };
    const NO: SourcesSnapshot = { menu: { pad: 0, key: 0, ptr: 0 }, match: { pad: 0, key: 0, ptr: 0 }, last: null, connected: 0, disconnected: 0 };
    const sent: [DiagKind, Record<string, unknown>][] = [];
    const d = new MatchDiag({ marks: () => XBOX, backend: () => 'webgl2', sources: () => NO, page: () => ({}), send: (k, m) => { sent.push([k, JSON.parse(m) as Record<string, unknown>]); } });
    const source = { info: () => null, scale: () => 1, buffer: () => null, phase: () => 6, links: () => null };
    d.begin(0, source);
    d.pads([pad(0.05, 0, 0.9, 0)], 100);
    d.end(1000);
    expect(sent[0]![1]['stk']).toEqual({ l: [0.05, 0.05], r: [0.9, null] });
    const wide = inputDiagMessage({ marks: XBOX, backend: 'webgl2', heapMB: 999_999, deviceMemory: 999.9 }, 99_999.9, { id: 'x'.repeat(200) }, { l: [1.41, 0.29], r: [1.41, 0.29] });
    expect(wide.length).toBeLessThanOrEqual(DIAG_MESSAGE_MAX);
  });
});
