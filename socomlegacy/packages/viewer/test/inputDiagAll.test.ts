import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  browserFamily, DIAG_MESSAGE_MAX, DIAG_SERIES_CAP_ADAPTATION, DiagRing, inputDiagMessage, InputTrack, MatchDiag, padModel, Series,
  type DiagKind, type GameInputLike, type XboxMarks,
} from '../src/matchDiag';
import type { SourcesSnapshot } from '../src/inputSources';

/**
 * I-4 (the owner's; product track, an instrument, an adaptation that changes nothing the game does): `inputdiag` on EVERY
 * page carries the first pad's model and mapping (`pd`), how often its state changes (`pr`, from `Gamepad.timestamp`), the
 * trigger (`tr`), the match's frame time (`ft`) and -- LATER 1326, from `common()`, so every report kind -- the browser's
 * family and major (`br`); never the agent string.
 */
const PC: XboxMarks = { ua: false, sraKmd: false, cls: false };
const XBOX: XboxMarks = { ua: false, sraKmd: true, cls: true };
const NO: SourcesSnapshot = { menu: { pad: 0, key: 0, ptr: 0 }, match: { pad: 0, key: 0, ptr: 0 }, last: null, connected: 0, disconnected: 0 };
const FIREFOX = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0';
const CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';
const IOS_SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const EDGE = `${CHROME} Edg/131.0`;

interface PadLike { id: string; mapping: string; timestamp?: number; buttons: { pressed: boolean }[]; axes: number[] }
const pad = (timestamp?: number, id = '054c-09cc-Wireless Controller'): PadLike =>
  ({ id, mapping: 'standard', ...(timestamp === undefined ? {} : { timestamp }), buttons: [{ pressed: false }], axes: [0, 0, 0, 0] });
const lanes = (fire: boolean): GameInputLike => ({
  moveX: 0, moveY: 0, lookX: 0, lookY: 0, jump: false, crouch: false, stance: false, boost: false, fire, zoom: false, prone: false, zoomOut: false, fireMode: false,
  action: false, leanLeft: false, leanRight: false, mode: false, swap1: false, swap2: false, inventory: false, scoreboard: false, reload: false,
});

const rig = (marks: XboxMarks, ua: string | null = FIREFOX) => {
  const sent: [DiagKind, string][] = [];
  let clock = 0;
  const d = new MatchDiag({
    marks: () => marks, backend: () => 'webgl2', sources: () => NO, page: () => ({}), clock: () => clock,
    ...(ua === null ? {} : { userAgent: () => ua }),
    send: (k, m) => { sent.push([k, m]); },
  });
  const source = { info: () => null, scale: () => 1, buffer: () => null, phase: () => 6, links: () => null };
  return { d, sent, source, at: (ms: number) => { clock = ms; } };
};
const parsed = (m: string): Record<string, any> => JSON.parse(m) as Record<string, any>;

/** A match of `frames` frames, 16 ms apart; `stamp(k)` the pad's timestamp at frame k; `fire(k)` the lane; `round(k)` a round that frame. */
function play(o: { marks?: XboxMarks; frames: number; stamp: (k: number) => number | undefined; fire?: (k: number) => boolean; round?: (k: number) => boolean; ua?: string | null }) {
  const r = rig(o.marks ?? PC, o.ua);
  r.d.begin(0, r.source);
  for (let k = 0; k < o.frames; k++) {
    const now = k * 16;
    r.at(now);
    r.d.frame(now);
    r.d.pads([pad(o.stamp(k))], now);
    r.d.gameInput(lanes(o.fire?.(k) ?? false));
    if (o.round?.(k)) r.d.round();
  }
  r.d.end(o.frames * 16);
  return { ...r, msg: parsed(r.sent.find(([k]) => k === 'inputdiag')![1]) };
}

describe('I-4: a page not Xbox-marked carries the whole compact report', () => {
  it('pd, pr, tr, ft and br, with no input summary', () => {
    const { msg } = play({ frames: 20, stamp: (k) => 1000 + 16 * k, fire: (k) => k >= 2 && k < 7, round: (k) => k === 3 });
    expect(msg['in']).toBeUndefined();
    expect(msg['pd']).toEqual({ v: '054c', p: '09cc', f: 'wireless controller', map: 'standard' });   // review fold: the new pad shape
    expect(msg['cap']).toBeUndefined();
    expect(msg['pr']).toEqual({ n: 20, m: 16, p: 16, f: 20 });
    expect(msg['tr']).toMatchObject({ e: 1, r: 1, nr: 0, hf: [5, 5], hm: [80, 80], gf: null, gm: null });
    expect(msg['ft']).toEqual([16, 16]);
    expect(msg['br']).toEqual(['Firefox', 133]);
    expect(msg['stk']).toBeDefined();                       // LATER 1001's sticks stay
  });

  it('an Xbox-marked page carries them too, beside the summary', () => {
    const { msg } = play({ marks: XBOX, frames: 10, stamp: (k) => 16 * k });
    expect(msg['in']).toBeDefined();
    expect(msg['pd']).toBeDefined();
    expect(msg['br']).toEqual(['Firefox', 133]);
  });
});

describe('I-4 (a): the pad id with nothing that names a machine', () => {
  // Review fold: the pad is vendor, product (four hex digits) and a family from a fixed list -- never the id's own text.
  it('a renamed pad (Chrome form): the ids and the family, nothing of the name', () => {
    const m = padModel("Craig's Wireless Controller (Vendor: 054c Product: 09cc)");
    expect(m).toEqual({ v: '054c', p: '09cc', f: 'wireless controller' });
    expect(JSON.stringify(m)).not.toContain('Craig');
  });
  it('Chrome\'s Xbox id, Firefox\'s leading ids, an id with neither and an unknown name', () => {
    expect(padModel('Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)')).toEqual({ v: '045e', p: '0b13', f: 'xbox' });
    expect(padModel('054c-0ce6-DualSense Wireless Controller')).toEqual({ v: '054c', p: '0ce6', f: 'dualsense' });
    const g = padModel('My Pad');
    expect(g).toEqual({ v: null, p: null, f: 'generic' });
    expect(JSON.stringify(g)).not.toContain('My');
    expect(padModel('Pad 00:1A:7D:DA:71:13 X')).toEqual({ v: null, p: null, f: 'generic' });
    expect(padModel(undefined)).toBeNull();
  });
  it('the report carries it, and a long id with a serial leaves nothing of its text', () => {
    const r = rig(PC);
    r.d.begin(0, r.source);
    r.d.pads([pad(1, `054c-09cc-Wireless Controller ${'ABCDEF0123456789'.repeat(2)} ${'x'.repeat(80)}`)], 10);
    r.d.end(1000);
    const m = parsed(r.sent[0]![1]);
    expect(m['pd']).toEqual({ v: '054c', p: '09cc', f: 'wireless controller', map: 'standard' });
    expect(r.sent[0]![1]).not.toMatch(/ABCDEF|xxxx/);
  });
});

describe('I-4 (b): how often the pad\'s state changes', () => {
  it('a pad updating at half the frame rate: 32 ms gaps over 16 ms frames', () => {
    const { msg } = play({ frames: 41, stamp: (k) => 5000 + 32 * Math.floor(k / 2) });
    expect(msg['pr']).toEqual({ n: 21, m: 32, p: 32, f: 41 });
    expect(msg['ft']).toEqual([16, 16]);
  });
  it('the median and the 95th centile by nearest rank on mixed gaps', () => {
    const s = new Series(100);
    for (let i = 1; i <= 20; i++) s.push(i);
    expect(s.at(0.5)).toBe(10);
    expect(s.at(0.95)).toBe(19);
    expect(new Series(4).at(0.5)).toBeNull();
    const stamps = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 190];     // ten gaps: nine of 10 ms and one of 100
    const { msg } = play({ frames: stamps.length, stamp: (k) => stamps[k] });
    expect(msg['pr']).toEqual({ n: 11, m: 10, p: 100, f: 11 });   // the 95th centile by nearest rank: rank 10 of 10
  });
  it('no timestamp: pr is null; a timestamp that never changes: one stamp and no gaps', () => {
    expect(play({ frames: 10, stamp: () => undefined }).msg['pr']).toBeNull();
    expect(play({ frames: 10, stamp: () => 777 }).msg['pr']).toEqual({ n: 1, m: null, p: null, f: 10 });
  });
});

describe('I-4 review fold: a series that hit its cap says so', () => {
  it('exactly the cap is whole; one more sets `cap`, in the report and the message', () => {
    const t = new InputTrack();
    for (let i = 0; i < DIAG_SERIES_CAP_ADAPTATION; i++) t.frameGap(16);
    expect(t.report().cap).toBeUndefined();
    t.frameGap(16);
    expect(t.report().cap).toBe(1);
    const c = { marks: PC, backend: 'webgl2', heapMB: null, deviceMemory: null, seats: 1, room: 1, sinceLink: 1, browser: ['Firefox', 133] } as unknown as Parameters<typeof inputDiagMessage>[0];
    expect(parsed(inputDiagMessage(c, 45, null, undefined, t.report()))['cap']).toBe(1);
  });
  it('the stamp series too', () => {
    const t = new InputTrack();
    for (let k = 0; k <= DIAG_SERIES_CAP_ADAPTATION + 1; k++) t.poll([pad(1000 + k)], k);
    expect(t.report().cap).toBe(1);
  });
});

describe('I-4 (c): the trigger', () => {
  // frames of 16 ms: a press of 5 frames that fired, a gap of 3 frames, a press of 2 frames that fired nothing, a gap of 6, a press of 4 that fired.
  const pattern = (k: number): boolean => (k >= 1 && k < 6) || (k >= 9 && k < 11) || (k >= 17 && k < 21);
  it('edges, rounds, pulls with no round, shortest and median hold, shortest and median gap', () => {
    const { msg } = play({ frames: 30, stamp: (k) => k, fire: pattern, round: (k) => k === 2 || k === 3 || k === 18 });
    expect(msg['tr']).toEqual({
      e: 3, r: 3, nr: 1,
      hf: [2, 4], hm: [32, 64],       // holds 5, 2, 4 frames: shortest 2, median 4
      gf: [3, 3], gm: [48, 48],       // gaps 3 and 6 frames (release to press): shortest 3, median (nearest rank) 3
    });
  });
  it('with no round ever counted (the fire lane not wired), rounds and no-round pulls are null, the edges still counted', () => {
    const { msg } = play({ frames: 12, stamp: (k) => k, fire: (k) => k >= 2 && k < 4 });
    expect(msg['tr']).toMatchObject({ e: 1, r: null, nr: null, hf: [2, 2] });
  });
  it('no press: no series', () => {
    expect(play({ frames: 5, stamp: (k) => k }).msg['tr']).toMatchObject({ e: 0, hf: null, hm: null, gf: null, gm: null });
  });
});

describe('I-4 (d, e): frame time and the browser family', () => {
  it('the frame time median and 95th centile', () => {
    const r = rig(PC);
    r.d.begin(0, r.source);
    let now = 0;
    for (let k = 0; k < 100; k++) { now += k % 10 === 0 ? 100 : 16; r.at(now); r.d.frame(now); }   // 100 frames, nine gaps long
    r.d.end(now);
    expect(parsed(r.sent[0]![1])['ft']).toEqual([16, 100]);
  });
  it('the family and major of a few agents; the rest is other', () => {
    expect(browserFamily(FIREFOX)).toEqual(['Firefox', 133]);
    expect(browserFamily(CHROME)).toEqual(['Chrome', 131]);
    expect(browserFamily(IOS_SAFARI)).toEqual(['Safari', 18]);
    expect(browserFamily(EDGE)).toEqual(['Edge', 131]);
    expect(browserFamily('Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/133.0 Mobile/15E148 Safari/605.1.15')).toEqual(['Firefox', 133]);
    expect(browserFamily('Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0 Mobile/15E148 Safari/604.1')).toEqual(['Chrome', 131]);
    expect(browserFamily(`${CHROME} OPR/116.0`)).toEqual(['other', null]);
    expect(browserFamily('curl/8.0')).toEqual(['other', null]);
    expect(browserFamily(undefined)).toEqual(['other', null]);
  });
  it('LATER 1326: every kind that uses common() carries br, and the agent string is in none of them', () => {
    for (const ua of [FIREFOX, CHROME, IOS_SAFARI, EDGE]) {
      const r = rig(PC, ua);
      r.d.begin(0, r.source);
      r.d.pads([pad(1)], 10);
      r.d.lost('webglcontextlost', 500);
      r.d.end(1000);
      expect(r.sent.map(([k]) => k).sort()).toEqual(['contextdiag', 'inputdiag']);
      for (const [, m] of r.sent) {
        expect(parsed(m)['br']).toEqual(browserFamily(ua));
        expect(m).not.toContain(ua);
        expect(m).not.toMatch(/Mozilla|AppleWebKit|Gecko|KHTML/);
      }
    }
  });
  it('with no agent readable, the family is other', () => {
    const r = rig(PC, '');
    r.d.begin(0, r.source);
    r.d.end(1000);
    expect(parsed(r.sent[0]![1])['br']).toEqual(['other', null]);
  });
});

describe('I-4: the message against the beacon\'s cap (BEACON_CAPS_ADAPTATION.message, 1024)', () => {
  it('a typical report is well under it', () => {
    const { sent } = play({ frames: 60, stamp: (k) => 16 * k, fire: (k) => k % 10 < 3, round: (k) => k % 10 === 1 });
    expect(sent[0]![1].length).toBeLessThan(DIAG_MESSAGE_MAX / 2);
  });
  it('at every field\'s bound, on an Xbox-marked page with the widest summary, it fits and parses', () => {
    const BIG = 99_999.9;
    const t = new InputTrack();
    t.pads = 9_999_999_999; t.padId = 'P'.repeat(500); t.mapping = 'M'.repeat(500);
    t.firstButton = 9_999_999_999; t.firstButtonT = 9_999_999_999; t.firstStickT = 9_999_999_999; t.held = 9_999_999_999; t.frames = 9_999_999_999; t.framesWithInput = 9_999_999_999;
    const summary = { id: 'P'.repeat(48), map: 'M'.repeat(12), pads: 9_999_999_999, con: 9_999_999_999, dis: 9_999_999_999, emu: 'E'.repeat(12), vis: 'V'.repeat(9) };
    const all = {
      pd: { v: '054c', p: '09cc', f: 'wireless controller', map: 'M'.repeat(12) },
      cap: 1 as const,
      pr: { n: 999_999, m: BIG, p: BIG, f: 999_999 },
      tr: { e: 999_999, r: 999_999, nr: 999_999, hf: [BIG, BIG], hm: [BIG, BIG], gf: [BIG, BIG], gm: [BIG, BIG] },
      ft: [BIG, BIG],
    };
    const s = inputDiagMessage({ marks: XBOX, backend: 'B'.repeat(50), heapMB: 999_999, deviceMemory: 999.9, seats: 999, room: 999, sinceLink: BIG, browser: ['Firefox', 999] },
      BIG, summary, { l: [1.41, 0.29], r: [1.41, 0.29] }, all);
    expect(s.length).toBeLessThanOrEqual(DIAG_MESSAGE_MAX);
    expect(() => JSON.parse(s)).not.toThrow();
    expect(DiagRing).toBeDefined();
  });
});

describe('I-4: the input path\'s outputs are byte-identical with the report\'s counters on and off', () => {
  const deepFreeze = <T,>(o: T): T => { if (o && typeof o === 'object') { Object.freeze(o); for (const v of Object.values(o)) deepFreeze(v); } return o; };
  it('MatchDiag\'s pads/gameInput/round take the pads and lanes as they are and return nothing: frozen inputs go through, unchanged', () => {
    const mk = () => ({ pads: [pad(5), pad(6, 'second')], lanes: lanes(true) });
    const before = JSON.stringify(mk());
    const frozen = deepFreeze(mk());
    const off = rig(PC);                                   // never begun: the counters are off
    const on = rig(PC);
    on.d.begin(0, on.source);
    for (const r of [off, on]) {
      expect(r.d.pads(frozen.pads, 5)).toBeUndefined();
      expect(r.d.gameInput(frozen.lanes)).toBeUndefined();
      expect(r.d.round()).toBeUndefined();
      expect(JSON.stringify(frozen)).toBe(before);
    }
    expect(off.d.input.report().tr['e']).toBe(0);          // off: nothing counted
    expect(on.d.input.report().tr['e']).toBe(1);
  });
  it('the game\'s lanes, run through the same sequence with the counters on and off, are the same bytes', () => {
    const seq = (d: MatchDiag | null): string => {
      const out: string[] = [];
      for (let k = 0; k < 40; k++) {
        const l = lanes(k % 7 < 3);                         // the lanes the game acts on
        const p = [pad(16 * k)];
        d?.pads(p, k * 16);
        d?.gameInput(l);
        if (k % 7 === 1) d?.round();
        out.push(JSON.stringify(l), JSON.stringify(p));
      }
      return out.join('|');
    };
    const on = rig(PC);
    on.d.begin(0, on.source);
    expect(seq(on.d)).toBe(seq(null));
  });
});

describe('I-4 follow-up: the report sees the merged (pad + touch) trigger, and counts rounds', () => {
  /** One frame as `./matchMount`'s `padFrame` feeds it: the pad's lanes (trigger deferred), then the merged trigger. */
  const frame = (d: MatchDiag, padFire: boolean, touchFire: boolean): void => {
    d.gameInput(lanes(padFire), true);
    d.gameFire(padFire || touchFire);
  };
  it('touch fire alone produces press edges, holds and gaps in the report', () => {
    const r = rig(PC);
    r.d.begin(0, r.source);
    const fires = [0, 1, 1, 1, 0, 0, 1, 1, 0];
    fires.forEach((f, k) => { r.at(k * 16); frame(r.d, false, f === 1); });
    const tr = r.d.input.report().tr;
    expect(tr['e']).toBe(2);
    expect(tr['hf']).toEqual([2, 2]);                     // holds 3 and 2 frames: the shortest and the median (nearest rank)
    expect(tr['gf']).toEqual([2, 2]);
  });
  it('pad and touch fire together are one trigger: counted once a frame, as the pad alone would be', () => {
    const run = (touch: boolean): unknown => {
      const r = rig(PC);
      r.d.begin(0, r.source);
      [0, 1, 1, 0, 1, 0].forEach((f, k) => { r.at(k * 16); frame(r.d, f === 1, touch && f === 1); });
      return { tr: r.d.input.report().tr, frames: r.d.input.frames };
    };
    const both = run(true) as { tr: Record<string, unknown>; frames: number };
    expect(both.tr['e']).toBe(2);
    expect(both.frames).toBe(6);                           // one frame a call pair, never two
    expect(both).toEqual(run(false));
  });
  it('rounds and no-round pulls are non-null once a round is fed, and count the pulls that fired none', () => {
    const r = rig(PC);
    r.d.begin(0, r.source);
    expect(r.d.input.report().tr['r']).toBeNull();
    [1, 1, 0, 1, 0].forEach((f, k) => { r.at(k * 16); frame(r.d, false, f === 1); if (k === 1) r.d.round(); });
    const tr = r.d.input.report().tr;
    expect(tr['r']).toBe(1);
    expect(tr['nr']).toBe(1);                              // the second pull fired none
  });
  it('two mounts in a row: the first mount unsubscribed, so leaves the second counting only its own rounds', () => {
    // The seam: a listener set as `Fire.subscribe` (it returns its unsubscribe), the mount's line, the page's one MatchDiag.
    const r = rig(PC);
    const listeners = new Set<(e: { type: string }) => void>();
    const subscribe = (l: (e: { type: string }) => void): (() => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
    const emit = (type: string): void => { for (const l of [...listeners]) l({ type }); };
    const mount = (): (() => void) => { r.d.begin(0, r.source); return subscribe((e) => { if (e.type === 'round') r.d.round(); }); };
    const off1 = mount();
    emit('round'); emit('reloadStart'); emit('round');
    off1(); r.d.end(100);
    const off2 = mount();
    emit('round');                                         // the first mount's firearm, had it leaked, would add here
    expect(listeners.size).toBe(1);
    expect(r.d.input.report().tr['r']).toBe(1);
    off2();
    expect(listeners.size).toBe(0);
  });
  it('matchMount.ts: one gameFire after the merge, the deferred pad call, and a subscription let go at teardown', () => {
    const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../src/matchMount.ts'), 'utf8');
    expect(src.match(/matchDiag\.gameInput\(pad, true\)/g)).toHaveLength(1);
    expect(src.match(/matchDiag\.gameFire\(padIn\.fire\)/g)).toHaveLength(1);
    expect(src.indexOf('matchDiag.gameFire(padIn.fire)')).toBeGreaterThan(src.indexOf('const padIn = damagePanelFrame('));
    expect(src.match(/offRounds = firearm\.fire\.subscribe\(\(e\) => \{ if \(e\.type === 'round'\) matchDiag\.round\(\); \}\)/g)).toHaveLength(1);
    expect(src.match(/offRounds\(\); offRounds = \(\) => \{\};/g)).toHaveLength(1);
    expect(src.indexOf('offRounds(); offRounds = () => {};')).toBeGreaterThan(src.indexOf('matchDiag.end(globalThis.performance'));
  });
  it('the merged input the game acts on is byte-identical with the counters on and off (the touch path included)', () => {
    const seq = (d: MatchDiag | null): string => {
      const out: string[] = [];
      for (let k = 0; k < 40; k++) {
        const padIn = lanes(k % 5 === 0);
        const touchIn = lanes(k % 7 < 3);
        const merged = { ...padIn, fire: padIn.fire || touchIn.fire };   // `mergeInput`'s fire, as the mount's
        const p = [pad(16 * k)];
        d?.pads(p, k * 16);
        d?.gameInput(padIn, true);
        d?.gameFire(merged.fire);
        if (k % 7 === 1) d?.round();
        out.push(JSON.stringify(padIn), JSON.stringify(touchIn), JSON.stringify(merged), JSON.stringify(p));
      }
      return out.join('|');
    };
    const on = rig(PC);
    on.d.begin(0, on.source);
    expect(seq(on.d)).toBe(seq(null));
    expect(on.d.input.report().tr['e']).toBeGreaterThan(0);
  });
});
