import { describe, expect, it } from 'vitest';
import { noInput, type Input } from '../src/gamepad';
import type { ScenicView } from '../src/mapMeta';
import type { Rules, Team } from '../src/net/protocol';
import * as spectatorModule from '../src/spectatorView';
import {
  SpectatorView, type SpectatorBody, type SpectatorHost, type SpectatorKey, type SpectatorPose, type SpectatorSeat,
} from '../src/spectatorView';

/**
 * PV-6a (the player's-view lane; plan PV.R3, PV.R5, PV.R6): the hold on Cross and the player's-view sub-mode of the
 * follow, a labelled browser adaptation with no original -- the original's X acts at its release only, for a spectator
 * only (research 248 s2). These pin the hold, the swallowed release, the voids, the sub-mode's life and the host seam,
 * and that a watcher who never holds Cross sees exactly today's calls. Unit tests.
 *
 * The page's order is `frame` then `pad` (`main.ts`:2176 `net.frame(...)` before :2218 `net.spectatorPad(...)`;
 * `matchMount.ts`:1367 before :1411), and the frame's real seconds are not clamped: in that order the hold's seconds are
 * the time between pad samples (the long-frame cases (a)-(c) pin it). The hold cases also run pad first (`padFirst`)
 * to pin the logic's edges (the threshold, the swallow, the voids) -- not that order's timing: a pad-first caller would
 * credit a press with the frame it began in, and no page calls them so.
 */

const ALIVE = 64;
const body = (id: number, feet: [number, number, number], alive = true, yaw = 0): SpectatorBody => ({ id, feet, yaw, flags: alive ? ALIVE : 0 });
const EYE = { position: [0, 0, 0], forward: [0, 0, -1], far: 1000 } as const;

type Call = [string, ...unknown[]];
type Order = 'page' | 'padFirst';
const ORDERS: readonly Order[] = ['page', 'padFirst'];

interface RigOptions {
  role?: 'player' | 'spectator'; self?: number | null; team?: Team | null; teams?: [number, Team][]; rules?: Rules;
  bodies?: SpectatorBody[]; views?: readonly ScenicView[];
  /** The host's `pov` member: absent (undefined), or what it returns. */
  pov?: boolean | (() => boolean);
  /** Which of the page's two calls a step makes first (default the page's: `frame`, then `pad`). */
  order?: Order;
  /** PV-6b: the host's `povWarm` member, recorded as a call (absent when not set). */
  warm?: boolean;
  /** PV-6b: the host's `povCarried` member: absent (undefined), or what it returns. */
  carried?: boolean | (() => boolean);
  /** PV-7b F4: the host's `povRelease` member, recorded as a call (absent when not set). */
  release?: boolean;
}

function rig(o: RigOptions = {}) {
  const calls: Call[] = [];
  const order = o.order ?? 'page';
  const state = { bodies: o.bodies ?? [], pov: o.pov, carried: o.carried };
  const seat = (): SpectatorSeat => ({
    role: o.role ?? 'spectator', self: o.self ?? null, team: o.team ?? null, teams: new Map(o.teams ?? []), rules: o.rules ?? 'classic', ghost: false,
  });
  const host: SpectatorHost & { pov?: (b: SpectatorBody, dt: number, watched: boolean) => boolean } = {
    bodies: () => state.bodies, seat,
    spectate: (p: SpectatorPose | null) => { calls.push(['spectate', p]); },
    follow: (b, dt, ease) => { calls.push(['follow', b.id, dt, ease]); },
    resetFollow: () => { calls.push(['resetFollow']); },
    leaveSelf: () => { calls.push(['leaveSelf']); },
    returnSelf: () => { calls.push(['returnSelf']); },
    views: () => o.views ?? [],
    magnify: (m) => { calls.push(['magnify', m]); },
  };
  if (o.pov !== undefined) {
    host.pov = (b, dt, watched) => {
      const shown = typeof state.pov === 'function' ? state.pov() : state.pov === true;
      calls.push(['pov', b.id, dt, watched, shown]);
      return shown;
    };
  }
  if (o.warm) host.povWarm = (b, dt, watched) => { calls.push(['warm', b.id, dt, watched]); };
  if (o.carried !== undefined) host.povCarried = () => (typeof state.carried === 'function' ? state.carried() : state.carried === true);
  if (o.release) host.povRelease = () => { calls.push(['release']); };
  const view = new SpectatorView(host);
  /**
   * One page frame of `dt` seconds and one pad sample. The page's order (`order: 'page'`): `frame` then `pad`
   * (`main.ts`:2176 then :2218; `matchMount.ts`:1367 then :1411); `padFirst` the other.
   */
  const step = (held: Partial<Input> = {}, dt = 0.1, blocked = false): void => {
    const sample = (): void => view.pad({ ...noInput(), ...held }, blocked);
    if (order === 'page') { view.frame(EYE, dt); sample(); } else { sample(); view.frame(EYE, dt); }
  };
  /**
   * Cross down, `seconds` of frames (chunks of `dt`) with a pad sample still showing it down after the last of them,
   * then released: the helper places the samples so that, in each order, the last down sample has counted exactly
   * `seconds` (in pad-first that includes the press's own frame, which a real pad-first caller would also credit).
   */
  const hold = (seconds: number, dt = 0.1): void => {
    if (order === 'page') step({ action: true }, dt);                 // the press's sample
    let t = 0;
    while (t + 1e-9 < seconds) { const d = Math.min(dt, seconds - t); step({ action: true }, d); t += d; }
    if (order === 'padFirst') step({ action: true }, dt);             // the sample after the last counted frame
    step({}, dt);
  };
  const tap = (flag: keyof Input): void => { step({ [flag]: true }); step(); };
  return { view, calls, step, hold, tap, state };
}

const key = (type: 'keydown' | 'keyup', code: string): SpectatorKey & { prevented: boolean } => {
  const e = { type, code, repeat: false, prevented: false, preventDefault() { e.prevented = true; } };
  return e;
};

const VIEWS: ScenicView[] = [
  { name: 'SEAL Start', at: [979, 236, 689], pitch: -26, yaw: 53, roll: 0 },
  { name: 'Middle Passage', at: [749, 206, 647], pitch: -16, yaw: 155, roll: 0 },
];

/** A spectator following body 3 (Right from the start, free). */
function following(o: RigOptions = {}) {
  const r = rig({ bodies: [body(3, [0, 0, 0]), body(5, [10, 0, 0]), body(9, [20, 0, 0])], views: VIEWS, ...o });
  r.tap('leanRight');
  expect([r.view.mode, r.view.target]).toEqual(['follow', 3]);
  return r;
}

/** A benched dead player (self 1) watching teammate 2. */
function watching(o: RigOptions = {}) {
  const r = rig({
    role: 'player', self: 1, team: 'seal', rules: 'classic',
    teams: [[1, 'seal'], [2, 'seal'], [4, 'seal'], [3, 'terrorist']],
    bodies: [body(1, [0, 0, 0], false), body(2, [5, 0, 0]), body(3, [6, 0, 0]), body(4, [7, 0, 0])], ...o,
  });
  r.view.bench();
  r.tap('leanRight');
  expect(r.view.watching).toBe(2);
  return r;
}

describe('PV-6a: the names (a browser adaptation, PV.R3, PV.R5)', () => {
  it('POV_HOLD_S_ADAPTATION is 0.4 s; POV_VIEW_ADAPTATION names the view as no original', () => {
    expect((spectatorModule as Record<string, unknown>).POV_HOLD_S_ADAPTATION).toBe(0.4);
    expect(typeof (spectatorModule as Record<string, unknown>).POV_VIEW_ADAPTATION).toBe('string');
  });
});

describe.each(ORDERS)('PV-6a: the hold on Cross (PV.R5), order %s', (order) => {
  it('a spectator in follow: 0.39 s then released goes free as today, pov off', () => {
    const r = following({ order });
    r.hold(0.39);
    expect(r.view.mode).toBe('free');
    expect(r.view.pov).toBe(false);
  });

  it('0.41 s: pov on at the first down sample past the threshold, before the release; the release does not go free; a second hold turns it off', () => {
    const r = following({ order });
    if (order === 'page') r.step({ action: true }, 0.1);   // the press's sample
    r.step({ action: true }, 0.2);
    r.step({ action: true }, 0.19);
    if (order === 'padFirst') r.step({ action: true }, 0.02);
    expect(r.view.pov).toBe(false);
    r.step({ action: true }, order === 'page' ? 0.02 : 0.1);   // the sample that has seen 0.41 s
    expect(r.view.pov).toBe(true);
    expect(r.view.mode).toBe('follow');
    r.step({}, 0.1);                                 // the release: swallowed
    expect([r.view.mode, r.view.pov]).toEqual(['follow', true]);
    r.hold(0.5);
    expect([r.view.mode, r.view.pov]).toEqual(['follow', false]);
    // A short press after it: today's release, to free.
    r.hold(0.1);
    expect(r.view.mode).toBe('free');
  });

  it('one flip a hold, however long (2 s = one flip)', () => {
    const r = following({ order });
    r.hold(2);
    expect([r.view.mode, r.view.pov]).toEqual(['follow', true]);
  });

  it('in free and in scenic a 1 s hold then release is exactly today\'s release, pov unchanged', () => {
    const r = following({ order });
    r.hold(0.1);
    expect([r.view.mode, r.view.remembered]).toEqual(['free', 'follow']);
    r.hold(1);
    expect([r.view.mode, r.view.pov]).toEqual(['follow', false]);   // free -> the remembered follow
    r.tap('zoom');
    expect(r.view.mode).toBe('scenic');
    r.hold(1);
    expect([r.view.mode, r.view.remembered, r.view.pov]).toEqual(['free', 'scenic', false]);
  });

  it('a benched watcher on a teammate: a hold turns pov on; on its own body (nothing watched): nothing', () => {
    const r = watching({ order });
    r.hold(0.5);
    expect(r.view.pov).toBe(true);
    const own = rig({ order, role: 'player', self: 1, team: 'seal', teams: [[1, 'seal'], [2, 'seal']], bodies: [body(1, [0, 0, 0], false), body(2, [5, 0, 0])] });
    own.view.bench();
    own.hold(0.5);
    expect(own.view.pov).toBe(false);
  });

  it('a blocked frame mid-hold voids the flip; the release then acts as today; the next fresh press works', () => {
    const r = following({ order });
    r.step({ action: true }, 0.1);
    r.step({ action: true }, 0.2);
    r.step({ action: true }, 0.1, true);             // the menu: blocked
    r.step({ action: true }, 0.3);
    r.step({ action: true }, 0.3);
    expect(r.view.pov).toBe(false);
    r.step({}, 0.1);                                 // today: a release after a blocked frame still acts
    expect(r.view.mode).toBe('free');
    r.hold(0.1);
    expect(r.view.mode).toBe('follow');
    r.hold(0.5);
    expect([r.view.mode, r.view.pov]).toEqual(['follow', true]);
  });

  it('voidHold() voids the running hold the same way; the next fresh press works', () => {
    const r = following({ order });
    r.step({ action: true }, 0.1);
    r.step({ action: true }, 0.2);
    r.view.voidHold();
    r.step({ action: true }, 0.3);
    r.step({ action: true }, 0.3);
    expect(r.view.pov).toBe(false);
    r.step({}, 0.1);
    expect(r.view.mode).toBe('free');                // not consumed: today's release
    r.hold(0.1);
    r.hold(0.5);
    expect([r.view.mode, r.view.pov]).toEqual(['follow', true]);
  });
});

describe('PV-6a: one long frame (the review\'s F1: real seconds are not clamped)', () => {
  it('(a) the page\'s order: Cross down, one 5 s frame, Cross up -> free exactly as main, pov off, nothing swallowed', () => {
    const r = following();
    r.step({ action: true }, 0.1);
    r.step({}, 5);
    expect([r.view.mode, r.view.remembered, r.view.pov]).toEqual(['free', 'follow', false]);
    r.hold(0.1);
    expect(r.view.mode).toBe('follow');              // the next short press: back, as today
  });

  it('(b) Cross down, a 5 s frame, Cross still down at the next sample -> one flip (the button really is held)', () => {
    const r = following();
    r.step({ action: true }, 0.1);
    r.step({ action: true }, 5);
    expect([r.view.mode, r.view.pov]).toEqual(['follow', true]);
    r.step({ action: true }, 5);
    expect(r.view.pov).toBe(true);                   // once a hold
    r.step({}, 0.1);                                 // the release: swallowed
    expect([r.view.mode, r.view.pov]).toEqual(['follow', true]);
  });
});

describe('PV-6a: the host seam (PV.R6)', () => {
  it('pov on and host.pov true: no follow call that frame, povShown true', () => {
    const r = following({ pov: true });
    r.hold(0.5);
    r.calls.length = 0;
    r.step({}, 0.05);
    expect(r.calls.filter((c) => c[0] === 'follow')).toEqual([]);
    expect(r.calls).toContainEqual(['pov', 3, 0.05, false, true]);
    expect(r.view.povShown).toBe(true);
  });

  it('host.pov false: today\'s follow call, povShown false, pov kept', () => {
    const r = following({ pov: false });
    r.hold(0.5);
    r.calls.length = 0;
    r.step({}, 0.05);
    expect(r.calls).toEqual([['pov', 3, 0.05, false, false], ['follow', 3, 0.05, undefined]]);
    expect([r.view.povShown, r.view.pov]).toEqual([false, true]);
  });

  it('the watched teammate: host.pov is asked with watched true; false falls back to the eased follow', () => {
    const r = watching({ pov: false });
    r.hold(0.5);
    r.calls.length = 0;
    r.step({}, 0.05);
    expect(r.calls).toEqual([['pov', 2, 0.05, true, false], ['follow', 2, 0.05, true]]);
    r.state.pov = true;
    r.calls.length = 0;
    r.step({}, 0.05);
    expect(r.calls).toEqual([['pov', 2, 0.05, true, true]]);
    expect(r.view.povShown).toBe(true);
  });

  it('a host without pov: the same follow calls as a run with pov never touched', () => {
    const a = following(), b = following();
    a.calls.length = 0; b.calls.length = 0;
    for (const dt of [0.25, 0.25, 0.25]) a.step({ action: true }, dt);   // a consumed hold: pov on
    a.step({}, 0.05); a.step({}, 0.05);
    expect(a.view.pov).toBe(true);                   // the choice is held; no host draws it
    for (const dt of [0.25, 0.25, 0.25, 0.05, 0.05]) b.step({}, dt);     // pov never touched
    expect(b.view.pov).toBe(false);
    expect(a.calls).toEqual(b.calls);
    expect(a.calls).toEqual([0.25, 0.25, 0.25, 0.05, 0.05].map((dt) => ['follow', 3, dt, undefined]));
    expect(a.view.povShown).toBe(false);
  });

  it('povShown is false on a frame the host did not draw it (free)', () => {
    const r = following({ pov: true });
    r.hold(0.5);
    r.step({}, 0.05);
    expect(r.view.povShown).toBe(true);
    r.hold(0.1);                                     // to free
    r.step({}, 0.05);
    expect([r.view.mode, r.view.pov, r.view.povShown]).toEqual(['free', true, false]);
  });

  it('(F3) povShown clears at once when the dev key or setPov(false) turns the view off between frames', () => {
    const r = following({ pov: true });
    r.hold(0.5);
    r.step({}, 0.05);
    expect(r.view.povShown).toBe(true);
    expect(r.view.key(key('keyup', 'KeyU'))).toBe(true);
    expect([r.view.pov, r.view.povShown]).toEqual([false, false]);
    r.view.setPov(true);
    r.step({}, 0.05);
    expect(r.view.povShown).toBe(true);
    r.view.setPov(false);
    expect([r.view.pov, r.view.povShown]).toEqual([false, false]);
  });
});

describe('PV-6a: the sub-mode\'s life (PV.R5)', () => {
  it('stays through a Right cycle and a free <-> follow round trip; cleared when the bench ends', () => {
    const r = following();
    r.hold(0.5);
    r.tap('leanRight');
    expect([r.view.target, r.view.pov]).toEqual([5, true]);
    r.hold(0.1); r.hold(0.1);
    expect([r.view.mode, r.view.pov]).toEqual(['follow', true]);
    const w = watching();
    w.hold(0.5);
    w.tap('leanRight');
    expect([w.view.watching, w.view.pov]).toEqual([4, true]);
    w.view.reset();                                  // the bench ends (a spawn, a round)
    expect(w.view.pov).toBe(false);
    r.view.reset();                                  // a spectator's turnover
    expect(r.view.pov).toBe(false);
  });

  it('setPov(true) in free does nothing; setPov(false) always works; setPov(true) in follow turns it on', () => {
    const r = following();
    r.hold(0.1);
    expect(r.view.mode).toBe('free');
    r.view.setPov(true);
    expect(r.view.pov).toBe(false);
    r.hold(0.1);
    r.view.setPov(true);
    expect(r.view.pov).toBe(true);
    r.hold(0.1);                                     // free, the choice kept
    r.view.setPov(false);
    expect(r.view.pov).toBe(false);
  });

  it('the developers\' key (KeyU, keyup) toggles as a consumed hold does; nothing in free', () => {
    const r = following();
    const down = key('keydown', 'KeyU');
    expect(r.view.key(down)).toBe(false);
    const up = key('keyup', 'KeyU');
    expect(r.view.key(up)).toBe(true);
    expect([r.view.pov, up.prevented]).toEqual([true, true]);
    expect(r.view.key(key('keyup', 'KeyU'))).toBe(true);
    expect(r.view.pov).toBe(false);
    expect(r.view.key(key('keyup', 'KeyU'), true)).toBe(false);   // blocked: no key acts
    r.hold(0.1);
    expect(r.view.key(key('keyup', 'KeyU'))).toBe(false);          // free: nothing
    expect(r.view.pov).toBe(false);
  });
});

describe('PV-6a: the no-change pin (a watcher who never holds Cross 0.4 s)', () => {
  const scenic0 = { x: 979, y: 236, z: 689, yaw: 53, pitch: -26 };

  it('pad first: the full host-call sequence of a short-press script is today\'s', () => {
    const r = rig({ bodies: [body(3, [0, 0, 0]), body(5, [10, 0, 0])], views: VIEWS, pov: true, order: 'padFirst' });
    r.step({ leanRight: true }, 0.1);
    r.step({}, 0.1);                                 // Right: follow 3
    r.step({ action: true }, 0.2);
    r.step({ action: true }, 0.15);
    r.step({}, 0.1);                                 // a 0.35 s press: free
    r.step({ action: true }, 0.1);
    r.step({}, 0.1);                                 // back to follow 3
    r.step({ zoom: true }, 0.1);
    r.step({}, 0.1);                                 // Up: scenic 0
    expect(r.calls).toEqual([
      ['magnify', 1], ['resetFollow'],
      ['follow', 3, 0.1, undefined],
      ['follow', 3, 0.2, undefined],
      ['follow', 3, 0.15, undefined],
      ['spectate', null], ['resetFollow'],
      ['resetFollow'],
      ['follow', 3, 0.1, undefined],
      ['follow', 3, 0.1, undefined],
      ['spectate', scenic0], ['spectate', scenic0], ['resetFollow'],
    ]);
  });

  it('(c) the page\'s order, one 2 s frame between a press and its release: the host-call sequence is today\'s', () => {
    const r = rig({ bodies: [body(3, [0, 0, 0]), body(5, [10, 0, 0])], views: VIEWS, pov: true });
    r.step({ leanRight: true }, 0.1);
    r.step({}, 0.1);                                 // Right: follow 3
    r.step({ action: true }, 0.1);                   // Cross down
    r.step({}, 2);                                   // one 2 s frame, then Cross up: free, as today
    r.step({ action: true }, 0.1);
    r.step({}, 0.1);                                 // back to follow 3
    r.step({ zoom: true }, 0.1);
    r.step({}, 0.1);                                 // Up: scenic 0
    r.step({}, 0.1);
    expect(r.calls).toEqual([
      ['magnify', 1], ['resetFollow'],
      ['resetFollow'],
      ['follow', 3, 0.1, undefined],
      ['follow', 3, 2, undefined],
      ['spectate', null],
      ['resetFollow'],
      ['resetFollow'],
      ['follow', 3, 0.1, undefined],
      ['follow', 3, 0.1, undefined],
      ['spectate', scenic0],
      ['spectate', scenic0], ['resetFollow'],
    ]);
    expect([r.view.mode, r.view.pov]).toEqual(['scenic', false]);
  });
});

describe('PV-6b: the warm call (POV_VIEW_ADAPTATION; the rig kept warm while the follow shows)', () => {
  it('a follow frame with the sub-mode off: today\'s follow first, with the same arguments, then the warm call', () => {
    const r = following({ pov: true, warm: true });
    r.calls.length = 0;
    r.step({}, 0.05);
    expect(r.calls).toEqual([['follow', 3, 0.05, undefined], ['warm', 3, 0.05, false]]);
  });

  it('a fallback frame (the sub-mode on, the host could not draw it): the draw tried, today\'s follow, then the warm call', () => {
    const r = following({ pov: false, warm: true });
    r.hold(0.5);
    expect(r.view.pov).toBe(true);
    r.calls.length = 0;
    r.step({}, 0.05);
    expect(r.calls).toEqual([['pov', 3, 0.05, false, false], ['follow', 3, 0.05, undefined], ['warm', 3, 0.05, false]]);
  });

  it('never on a frame the view was drawn', () => {
    const r = following({ pov: true, warm: true });
    r.hold(0.5);
    r.calls.length = 0;
    r.step({}, 0.05);
    expect(r.calls).toEqual([['pov', 3, 0.05, false, true]]);
    expect(r.view.povShown).toBe(true);
  });

  it('the watched teammate: the eased follow first, then the warm call with watched true; none on a drawn frame', () => {
    const r = watching({ pov: false, warm: true });
    r.calls.length = 0;
    r.step({}, 0.05);
    expect(r.calls).toEqual([['follow', 2, 0.05, true], ['warm', 2, 0.05, true]]);
    r.hold(0.5);
    r.state.pov = true;
    r.calls.length = 0;
    r.step({}, 0.05);
    expect(r.calls).toEqual([['pov', 2, 0.05, true, true]]);
  });

  it('never in free or scenic, nor for a benched player on his own body', () => {
    const r = following({ pov: true, warm: true });
    r.hold(0.1);                                     // free
    expect(r.view.mode).toBe('free');
    r.calls.length = 0;                              // the hold's own frames were follow frames
    r.step({}, 0.05);
    r.tap('zoom');                                   // scenic
    r.step({}, 0.05);
    expect(r.view.mode).toBe('scenic');
    expect(r.calls.filter((c) => c[0] === 'warm' || c[0] === 'follow')).toEqual([]);
    const own = rig({ role: 'player', self: 1, team: 'seal', teams: [[1, 'seal'], [2, 'seal']], bodies: [body(1, [0, 0, 0], false), body(2, [5, 0, 0])], warm: true });
    own.view.bench();
    own.step({}, 0.05);
    expect(own.calls.filter((c) => c[0] === 'warm')).toEqual([]);
  });

  it('none where the page does not carry the view (povCarried false): today\'s follow alone', () => {
    const r = following({ pov: true, warm: true, carried: false });
    r.calls.length = 0;
    r.step({}, 0.05);
    expect(r.calls).toEqual([['follow', 3, 0.05, undefined]]);
  });

  it('a host without povWarm: exactly the calls of PV-6a (the existing follow tests\' sequence)', () => {
    const a = following({ pov: true }), b = following({ pov: true, warm: true });
    a.calls.length = 0; b.calls.length = 0;
    for (const dt of [0.1, 0.2]) { a.step({}, dt); b.step({}, dt); }
    expect(a.calls).toEqual([['follow', 3, 0.1, undefined], ['follow', 3, 0.2, undefined]]);
    expect(b.calls.filter((c) => c[0] !== 'warm')).toEqual(a.calls);
  });
});

describe('PV-6b: the view not offered where the page\'s client does not carry it (PV.R6; povCarried false)', () => {
  it('a hold of X switches nothing and its release is today\'s (to free); the getter reads undefined (the HUD\'s line absent)', () => {
    const r = following({ pov: true, carried: false });
    expect(r.view.pov).toBeUndefined();
    r.hold(0.5);
    expect([r.view.mode, r.view.pov, r.view.povShown]).toEqual(['free', undefined, false]);
  });

  it('setPov(true) is refused and the developers\' key does nothing', () => {
    const r = following({ pov: true, carried: false });
    r.view.setPov(true);
    expect(r.view.pov).toBeUndefined();
    const up = key('keyup', 'KeyU');
    expect(r.view.key(up)).toBe(false);
    expect(up.prevented).toBe(false);
    r.step({}, 0.05);
    expect([r.view.pov, r.view.povShown]).toEqual([undefined, false]);
    expect(r.calls.filter((c) => c[0] === 'pov')).toEqual([]);
  });

  it('carried true, or no povCarried at all: offered as PV-6a has it', () => {
    for (const carried of [true, undefined]) {
      const r = following({ pov: true, carried });
      expect(r.view.pov).toBe(false);
      r.hold(0.5);
      expect([r.view.mode, r.view.pov]).toEqual(['follow', true]);
    }
  });

  it('a client that stops carrying it: the view is off on the next frame and never drawn', () => {
    let carried = true;
    const r = following({ pov: true, carried: () => carried });
    r.hold(0.5);
    r.step({}, 0.05);
    expect([r.view.pov, r.view.povShown]).toEqual([true, true]);
    carried = false;
    r.calls.length = 0;
    r.step({}, 0.05);
    expect([r.view.pov, r.view.povShown]).toEqual([undefined, false]);
    expect(r.calls).toEqual([['follow', 3, 0.05, undefined]]);
    carried = true;
    expect(r.view.pov).toBe(false);                  // not turned back on by itself
  });
});

describe('PV-6b F1: the view offered only over a followed or watched body in the list and alive; a mode already on kept', () => {
  const dead = (b: SpectatorBody): SpectatorBody => ({ ...b, flags: 0 });
  /** The two ways the body is lost: gone from the room's list, or dead in it. */
  const LOSSES = {
    removed: (bodies: SpectatorBody[], id: number) => bodies.filter((b) => b.id !== id),
    dead: (bodies: SpectatorBody[], id: number) => bodies.map((b) => (b.id === id ? dead(b) : b)),
  } as const;
  const lose = (r: ReturnType<typeof rig>, how: keyof typeof LOSSES, id: number): void => { r.state.bodies = LOSSES[how](r.state.bodies, id); };

  describe.each(Object.keys(LOSSES) as (keyof typeof LOSSES)[])('the body %s', (how) => {
    it('follow: not offered (pov undefined), setPov(true) and KeyU refused, a hold void with today\'s release (to free)', () => {
      const r = following({ pov: true });
      lose(r, how, 3);
      r.step({}, 0.05);
      expect([r.view.mode, r.view.target, r.view.pov]).toEqual(['follow', 3, undefined]);
      r.view.setPov(true);
      expect(r.view.pov).toBeUndefined();
      const up = key('keyup', 'KeyU');
      expect([r.view.key(up), up.prevented, r.view.pov]).toEqual([false, false, undefined]);
      r.hold(0.5);
      expect([r.view.mode, r.view.pov]).toEqual(['free', false]);
      expect(r.calls.filter((c) => c[0] === 'pov')).toEqual([]);
    });

    it('watched: not offered (pov undefined), setPov(true) and KeyU refused, a hold void with today\'s release (nothing)', () => {
      const r = watching({ pov: true });
      lose(r, how, 2);
      r.step({}, 0.05);
      expect([r.view.watching, r.view.pov]).toEqual([2, undefined]);
      r.view.setPov(true);
      expect(r.view.pov).toBeUndefined();
      expect(r.view.key(key('keyup', 'KeyU'))).toBe(false);
      r.hold(0.5);
      expect([r.view.watching, r.view.pov]).toEqual([2, undefined]);
      expect(r.calls.filter((c) => c[0] === 'pov')).toEqual([]);
    });

    it('follow, the mode on before: kept, the follow\'s fallback drawn, a hold leaves it (release swallowed); setPov(false) too; a cycle to a living body draws it again', () => {
      const r = following({ pov: true });
      r.hold(0.5);
      r.step({}, 0.05);
      expect(r.view.povShown).toBe(true);
      lose(r, how, 3);
      r.state.pov = false;                                   // no view of a body gone or dead: the host falls back
      r.calls.length = 0;
      r.step({}, 0.05);
      expect([r.view.pov, r.view.povShown]).toEqual([true, false]);
      if (how === 'dead') expect(r.calls).toContainEqual(['follow', 3, 0.05, undefined]);
      r.hold(0.5);
      expect([r.view.mode, r.view.pov]).toEqual(['follow', undefined]);   // left (release swallowed); not offered over it
      r.view.setPov(true);
      expect(r.view.pov).toBeUndefined();                    // and not entered again over it
      const s = following({ pov: true });
      s.hold(0.5);
      lose(s, how, 3);
      s.step({}, 0.05);
      s.view.setPov(false);
      expect(s.view.pov).toBeUndefined();
      const k = following({ pov: true });
      k.hold(0.5);
      lose(k, how, 3);
      k.step({}, 0.05);
      expect(k.view.key(key('keyup', 'KeyU'))).toBe(true);   // the developers' key leaves it too
      expect(k.view.pov).toBeUndefined();
      const c = following({ pov: true });
      c.hold(0.5);
      lose(c, how, 3);
      c.state.pov = false;
      c.step({}, 0.05);
      c.tap('leanRight');                                    // to 5, living, the mode still on
      expect([c.view.target, c.view.pov]).toEqual([5, true]);
      c.state.pov = true;
      c.step({}, 0.05);
      expect(c.view.povShown).toBe(true);
    });

    it('watched, the mode on before: kept, the eased fallback, a hold leaves it; setPov(false) too; a cycle to a living teammate draws it again', () => {
      const r = watching({ pov: true });
      r.hold(0.5);
      r.step({}, 0.05);
      expect(r.view.povShown).toBe(true);
      lose(r, how, 2);
      r.state.pov = false;
      r.calls.length = 0;
      r.step({}, 0.05);
      expect([r.view.pov, r.view.povShown]).toEqual([true, false]);
      if (how === 'dead') expect(r.calls).toContainEqual(['follow', 2, 0.05, true]);
      r.hold(0.5);
      expect([r.view.watching, r.view.pov]).toEqual([2, undefined]);
      const s = watching({ pov: true });
      s.hold(0.5);
      lose(s, how, 2);
      s.view.setPov(false);
      expect(s.view.pov).toBeUndefined();
      const c = watching({ pov: true });
      c.hold(0.5);
      lose(c, how, 2);
      c.state.pov = false;
      c.step({}, 0.05);
      c.tap('leanRight');                                    // to 4, living, the mode still on
      expect([c.view.watching, c.view.pov]).toEqual([4, true]);
      c.state.pov = true;
      c.step({}, 0.05);
      expect(c.view.povShown).toBe(true);
    });
  });
});

describe('PV-7b review F4: a followed or watched body in neither the list nor the retired queue -- the view given back (povRelease)', () => {
  const removed = (r: ReturnType<typeof rig>, id: number): void => { r.state.bodies = r.state.bodies.filter((b) => b.id !== id); };

  it('watched, the view drawn: removed -> povRelease that frame, no resetFollow, no spectate; back -> drawn again (the mode on)', () => {
    const r = watching({ pov: true, release: true });
    r.hold(0.5);
    r.step({}, 0.05);
    expect(r.view.povShown).toBe(true);
    const back = r.state.bodies.find((b) => b.id === 2)!;
    removed(r, 2);
    r.calls.length = 0;
    r.step({}, 0.05);
    expect(r.calls).toEqual([['release']]);
    expect([r.view.watching, r.view.pov]).toEqual([2, true]);   // the bind and the mode kept, as today
    r.state.bodies = [...r.state.bodies, back];
    r.calls.length = 0;
    r.step({}, 0.05);
    expect(r.calls).toEqual([['pov', 2, 0.05, true, true]]);
    expect(r.view.povShown).toBe(true);
  });

  it('follow, the view drawn: once the retired queue lets the body go, povRelease each such frame -- never resetFollow nor spectate', () => {
    const r = following({ pov: true, release: true });
    r.hold(0.5);
    r.step({}, 0.05);
    expect(r.view.povShown).toBe(true);
    removed(r, 3);
    r.state.pov = false;                                    // a retired (dead) body: the host draws no view of it
    r.calls.length = 0;
    for (let i = 0; i < 4; i++) r.step({}, 0.05);
    expect(r.calls.some((c) => c[0] === 'release')).toBe(true);
    expect(r.calls.filter((c) => c[0] === 'resetFollow' || c[0] === 'spectate')).toEqual([]);
    expect([r.view.mode, r.view.target]).toEqual(['follow', 3]);
  });

  it('a body in the list: never povRelease; a host without the member: the same calls as before', () => {
    const r = watching({ pov: true, release: true });
    for (let i = 0; i < 5; i++) r.step({}, 0.05);
    expect(r.calls.filter((c) => c[0] === 'release')).toEqual([]);
    const a = watching({ pov: true, release: true }), b = watching({ pov: true });
    removed(a, 2); removed(b, 2);
    a.calls.length = 0; b.calls.length = 0;
    for (let i = 0; i < 3; i++) { a.step({}, 0.05); b.step({}, 0.05); }
    expect(a.calls.filter((c) => c[0] !== 'release')).toEqual(b.calls);
  });
});

/**
 * The built viewer must not contain the dev hook's name `holdFrame` (`test/holdFrame.test.ts`, cps-frame-hash-2; OT.R29),
 * and a minifier keeps a method's name: PV-6a's hold timer was a private method of that name, which a build box found in
 * `dist/viewer/assets` once the pages reached it (2026-11-12, the lane's 1a15283974). Held here without a build.
 */
describe("PV-6a: the hold timer does not carry the dev hook's name into the build", () => {
  it('no identifier `holdFrame` in spectatorView.ts, povCamera.ts, povLens.ts or matchNet.ts', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    for (const f of ['spectatorView.ts', 'povCamera.ts', 'povLens.ts', 'matchNet.ts']) {
      const code = readFileSync(resolve(import.meta.dirname, '../src', f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      expect(code.includes('holdFrame'), f).toBe(false);
    }
  });
});
