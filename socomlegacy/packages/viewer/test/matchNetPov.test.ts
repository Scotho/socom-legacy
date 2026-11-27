import { describe, expect, it } from 'vitest';
import { buildGrid, probeGround, selectFloor, type Grid, type WorldPoly } from '@s2u/scene';
import { TESTROOM_CAPABILITIES } from '../src/matchCore';
import { matchNetDeps, type MatchNetParts, type PovNet } from '../src/matchNet';
import { probeLiftOf, rootY } from '../src/mover';
import { BodyFlag, STANCE_CODES, TICK_HZ, type BodyState } from '../src/net/protocol';
import { PovCamera, type PovBody, type PovPose, type PovSource } from '../src/povCamera';
import { asNetClient, ReplayClient, type LoadedSegment } from '../src/replay/replayClient';
import type { ReplayRecord } from '../../match/src/replay/format';
import type { NetPageDeps } from '../src/netPage';
import type { SpectatorBody } from '../src/spectatorView';
import { ALPHA, body as fixtureBody, BRAVO, header } from './replayFixture';

/**
 * PV-5b (the player's-view lane; product track, a labelled browser adaptation -- research 402, plan PV.R3, PV.R6): the
 * page's half of the player's view's camera, `matchNetDeps`' `spectatePov` (and its warm call and reset), driven here
 * through fakes for `fly`, `remote` and `walk` and a scripted net (`PovNet`), in the style of `matchNet.test.ts`'s
 * WALL-CAM cases and `watchedEase.test.ts`. Nothing here claims a value of the original: the rig's pose is compared with
 * a `PovCamera` driven by the same samples (the rig's own equivalence with the owner's page is `povCamera.test.ts`'s).
 */

const ASPECT = 16 / 9;
const ALIVE = BodyFlag.Alive;

// ---- a floor, a ramp (the prone eye's tilt) and a wall behind the body (the pass's history) ----

const poly = (path: string, ditype: number, points: number[]): WorldPoly => ({
  modelName: 'worldmodel', path, region: 0, ditype, material: 25, ptcount: 4, cameratype: 0, appflags: 0, points: Float32Array.from(points),
});
function world(): Grid {
  const polys = [
    poly('floor', 3, [-190, 0, 190, 100, 0, 190, 100, 0, -190, -190, 0, -190]),
    poly('ramp', 3, [100, 0, -190, 190, 30, -190, 190, 30, 190, 100, 0, 190]),   // rising 1 in 3 toward +x
    poly('wall', 2, [-190, 0, 40, 190, 0, 40, 190, 60, 40, -190, 60, 40]),
  ];
  return buildGrid({ atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 }, [], [], polys,
    polys.map((p, i) => ({ modelName: p.modelName, path: p.path, first: i, count: 1 })));
}

// ---- the scripted subject and net ----

/** The subject after command k: walking back toward the wall, a lean left from command 8, the over-rides given. */
type Script = (k: number) => BodyState | null;
const subject = (over: (k: number) => Partial<BodyState> = () => ({})): Script => (k) => ({
  ...fixtureBody(7, 0), feet: [0, 0, 10 + 0.4 * k], yaw: 3 * Math.sin(k / 9), pitch: -6 + Math.cos(k / 7), flags: ALIVE,
  peek: k >= 8 ? -1 : 0, view: 0, swayX: 0, swayY: 0, clock: k & 15, ...over(k),
});

interface Net extends PovNet {
  calls: [number | null, boolean][];
  clock: { cmd: number; epoch: number } | null;
  script: Script;
  /** How many commands below the clock's the net keeps (Infinity: every one). */
  history: number;
  /** How many commands the newest kept sample stands below the clock's (0: the clock's own is kept). */
  lag: number;
}
function scripted(script: Script, cmd = 5.5, epoch = 1): Net {
  const net: Net = {
    calls: [], clock: { cmd, epoch }, script, history: 1, lag: 0,
    setCommandClockBody(id, drawn = false) { net.calls.push([id, drawn]); },
    commandClock() { return net.clock; },
    bodyAtCommand(k) {
      const top = net.clock ? Math.floor(net.clock.cmd) : -Infinity;
      return k > top - net.lag || k < top - net.history ? null : net.script(k);
    },
  };
  return net;
}

/** The PovBody the page should hand the rig for one sample (the transcription the test holds the dep to). */
function toPov(b: BodyState, root: number, posed: boolean, grid: Grid | null): PovBody {
  const stance = STANCE_CODES[b.stance] ?? 'stand';
  const floor = stance === 'prone' && grid ? selectFloor(probeGround(grid, b.feet[0], b.feet[2]), b.feet[1] + probeLiftOf(stance), b.feet[1]) : null;
  return {
    feet: b.feet, yaw: b.yaw, pitch: b.pitch, peek: (Math.sign(b.peek) as -1 | 0 | 1), root, posed, view: b.view ?? 0,
    sway: [b.swayX ?? 0, b.swayY ?? 0], floorNormalY: floor ? floor.normal[1] : 1, stance,
  };
}
/** The net's samples as the rig's source, through `toPov`, the root the drawn body's stance's. */
function sourceOf(net: Net, drawnStance: number, grid: Grid | null, root?: number): PovSource {
  const r = root ?? rootY(STANCE_CODES[drawnStance] ?? 'stand');
  return { at: (k) => { const b = net.bodyAtCommand(k); return b ? toPov(b, r, root !== undefined, grid) : null; } };
}

// ---- the page's parts, as fakes ----

type Rec = { name: string; args: unknown[] };
function page(net: Net | null, grid: Grid | null = world()) {
  const writes: Rec[] = [];
  const rec = (name: string) => (...args: unknown[]): void => { writes.push({ name, args }); };
  let mode: 'walk' | 'fly' = 'fly';
  let root: number | null = null;
  let mounted = false;
  let map = { scenicViews: [], arsenal: null } as never;
  let ground = grid;
  const p = {
    caps: TESTROOM_CAPABILITIES,
    walk: { gridOfGround: () => ground, mode: () => mode } as unknown as NetPageDeps['walk'],
    remote: {
      cameraRoot: () => root, setPovHidden: rec('setPovHidden'), mounted: () => mounted,
    } as unknown as NetPageDeps['remote'],
    hud: {} as NetPageDeps['hud'],
    fly: {
      setPose: rec('setPose'), placeView: rec('placeView'), setViewNear: rec('setViewNear'), setSubjectOffset: rec('setSubjectOffset'),
      aspect: () => ASPECT,
    },
    loadouts: { picks: () => [], type: () => 0, seated: () => null, setType: () => true, unseated: () => {}, roomAnswer: () => {} },
    firearm: {
      records: () => [], roundEffects: () => {}, roundImpact: () => {}, died: () => {}, spawnKit: () => {},
      fire: { undoReload: () => true, restoreReload: () => true, refundRound: () => true },
    },
    clips: () => null, map: () => map, side: () => 'seal', followTeam: () => {}, menuOpen: () => false,
    povNet: () => net,
  } as unknown as MatchNetParts;
  const rest = {
    remoteGrenade: () => {}, ownProjectiles: () => true, staleThrow: () => {}, tagOwnProjectile: () => {}, detonateProjectile: () => {},
    whiteOut: () => {}, sceneRound: () => {}, reloadSound: () => {}, deathVoice: () => {}, hurtVoice: () => {}, ring: () => {},
    roundAudio: {} as never, objective: () => null, escorteeVoice: () => {}, taunt: () => {}, communication: () => {},
    voiceFloor: () => {}, voiceFrame: () => {}, drops: { place: () => {}, remove: () => {}, replaceAll: () => {} }, kitChanged: () => {},
    hostageState: () => {}, armory: true, armoryOpen: () => false, joined: () => {}, newRound: () => {}, abandoned: () => {}, client: null,
  } as Partial<NetPageDeps>;
  const d = matchNetDeps(p, { answered: () => {} }, rest as never);
  const pov = (b: SpectatorBody, dt = 1 / 60, watched = false): boolean => d.spectatePov!(b, dt, watched);
  const warm = (b: SpectatorBody, dt = 1 / 60, watched = false): void => d.spectatePovWarm!(b, dt, watched);
  const camera = () => writes.filter((w) => w.name !== 'setPovHidden');
  const placed = (): { eye: [number, number, number]; target: [number, number, number] } => {
    const w = writes.filter((x) => x.name === 'placeView').at(-1)!;
    return { eye: w.args[0] as [number, number, number], target: w.args[1] as [number, number, number] };
  };
  return {
    p, d, pov, warm, writes, camera, placed,
    setMode: (m: 'walk' | 'fly') => { mode = m; }, setRoot: (r: number | null) => { root = r; },
    setMounted: (on: boolean) => { mounted = on; }, newMap: () => { map = { scenicViews: [], arsenal: null } as never; },
    newGrid: () => { ground = world(); return ground; }, grid: () => ground,
  };
}

/** The body the spectator hands (`bodies()`'s entry for the subject): its drawn pose. */
const drawnBody = (net: Net, over: Partial<SpectatorBody> = {}): SpectatorBody => {
  const b = net.script(Math.floor(net.clock?.cmd ?? 0))!;
  return { id: b.id, feet: b.feet, yaw: b.yaw, flags: b.flags, pitch: b.pitch, stance: b.stance, peek: b.peek, travRootY: b.travRootY, ...over };
};
/** The writes as names (a `setPose` by name alone): what a frame not drawn gives back, in its order. */
const undrawn = (ws: readonly Rec[]): string[] => ws.map((w) => (w.name === 'setPose' ? 'setPose' : `${w.name}(${w.args.join(',')})`));
const UNDRAW = ['setPose', 'setViewNear()', 'setSubjectOffset(0,0)', 'setPovHidden()'];
const close = (a: readonly number[], b: readonly number[], tol = 1e-9): void => {
  for (let i = 0; i < 3; i++) expect(Math.abs(a[i]! - b[i]!)).toBeLessThan(tol);
};

describe('PV-5b: no view and no camera write when the subject cannot be drawn (PV.R6: the caller falls back)', () => {
  it('a dead subject, a clockless one, an absent one, no client: false, nothing written to the camera or the hide', () => {
    for (const why of ['dead', 'clockless', 'absent', 'no client'] as const) {
      const net = scripted(subject());
      const g = page(why === 'no client' ? null : net);
      const b = drawnBody(net, why === 'dead' ? { flags: 0 } : {});
      if (why === 'clockless') net.clock = null;
      if (why === 'absent') net.script = () => null;
      expect(g.pov(b), why).toBe(false);
      expect(g.writes, why).toEqual([]);
      for (const [, drawn] of net.calls) expect(drawn, why).toBe(false);   // never drawn on the command clock
      if (why !== 'no client') expect(net.calls.at(-1), why).toEqual([7, false]);   // watched, so the clock is fed
    }
  });

  it('a living, walking page never draws the body on the command clock, whatever its spectator asks', () => {
    const net = scripted(subject());
    const g = page(net);
    g.setMode('walk');
    for (let i = 0; i < 5; i++) { net.clock = { cmd: 5.5 + i, epoch: 1 }; expect(g.pov(drawnBody(net))).toBe(false); }
    g.warm(drawnBody(net));
    expect(net.calls.some(([, drawn]) => drawn)).toBe(false);
    expect(g.writes).toEqual([]);
  });

  it('LATER 897 (PV.R6): a head view on a turret falls back; a third-person view on one is drawn', () => {
    const net = scripted(subject(() => ({ view: 1 })));
    const g = page(net);
    g.setMounted(true);
    expect(g.pov(drawnBody(net))).toBe(false);
    expect(g.camera()).toEqual([]);
    net.script = subject((k) => ({ view: k < 6 ? 1 : 0 }));
    net.clock = { cmd: 6.5, epoch: 1 };                                // the next command: third person
    expect(g.pov(drawnBody(net))).toBe(true);
    expect(g.writes.filter((w) => w.name === 'setPovHidden').at(-1)!.args).toEqual([null]);
  });
});

describe('PV-5b: the pose placed', () => {
  it('by placeView(eye, target), never setPose; the clock drawn on that frame only; the rig\'s pose for the samples', () => {
    const net = scripted(subject());
    net.history = Infinity;
    const g = page(net);
    const ref = new PovCamera({ grid: g.grid() });
    for (let i = 0; i < 12; i++) {
      net.clock = { cmd: 5.5 + i * 0.75, epoch: 1 };
      net.calls.length = 0;
      expect(g.pov(drawnBody(net))).toBe(true);
      expect(net.calls.at(-1)).toEqual([7, true]);
      const want = ref.frame(sourceOf(net, 0, g.grid()), net.clock.cmd, ASPECT)!;
      close(g.placed().eye, want.eye);
      close(g.placed().target, want.target);
    }
    expect(g.writes.some((w) => w.name === 'setPose')).toBe(false);
  });

  it('the root and its posed flag as spectateFollow passes them: the posed skeleton\'s, else the traversal\'s, else the stance\'s', () => {
    for (const how of ['posed', 'traversal', 'stance'] as const) {
      const net = scripted(subject(() => ({ stance: 1 })));
      const g = page(net);
      if (how === 'posed') g.setRoot(15.5);
      const b = drawnBody(net, how === 'traversal' ? { travRootY: 9.25 } : { travRootY: Number.NaN });
      expect(g.pov(b)).toBe(true);
      const root = how === 'posed' ? 15.5 : how === 'traversal' ? 9.25 : rootY('crouch');
      const src: PovSource = { at: (k) => { const s = net.bodyAtCommand(k); return s ? toPov(s, root, how === 'posed', g.grid()) : null; } };
      close(g.placed().eye, new PovCamera({ grid: g.grid() }).frame(src, net.clock!.cmd, ASPECT)!.eye);
    }
  });

  it('prone on the ramp: the floor normal under each command\'s feet (the walker\'s floor pick), 1 off the grid', () => {
    const net = scripted(subject(() => ({ stance: 2, view: 1, feet: [150, 50 / 3, 10] })));   // on the ramp's face
    const g = page(net);
    expect(g.pov(drawnBody(net))).toBe(true);
    const want = new PovCamera({ grid: g.grid() }).frame(sourceOf(net, 2, g.grid()), net.clock!.cmd, ASPECT)!;
    close(g.placed().eye, want.eye);
    const flat = new PovCamera({ grid: g.grid() }).frame({ at: (k) => { const s = net.bodyAtCommand(k); return s ? { ...toPov(s, rootY('prone'), false, null) } : null; } }, net.clock!.cmd, ASPECT)!;
    expect(Math.abs(flat.eye[1] - want.eye[1]) + Math.abs(flat.eye[2] - want.eye[2])).toBeGreaterThan(1e-3);   // the ramp's tilt is in it
  });
});

describe('PV-5b: one rig, rebuilt as the follow\'s is and at a reset of the clock\'s numbers', () => {
  /**
   * The net keeps two commands (no history), so a rebuild settles the lean at its held side at once while a rig carried
   * on is still easing it: the two poses differ, and the placed one says which happened.
   */
  type Change = (g: ReturnType<typeof page>, net: Net) => void;
  function run(change: Change) {
    const net = scripted(subject());
    const g = page(net);
    const carried = new PovCamera({ grid: g.grid() });
    for (let cmd = 5.5; cmd <= 12.5; cmd++) {
      net.clock = { cmd, epoch: 1 };
      g.pov(drawnBody(net));
      carried.frame(sourceOf(net, 0, g.grid()), cmd, ASPECT);
    }
    net.clock = { cmd: 13.5, epoch: 1 };
    change(g, net);
    g.pov(drawnBody(net));
    const src = sourceOf(net, 0, g.grid());
    const fresh = new PovCamera({ grid: g.grid() }).frame(src, net.clock.cmd, ASPECT)!;
    const kept = carried.frame(src, net.clock.cmd, ASPECT)!;
    expect(Math.abs(fresh.eye[0] - kept.eye[0]) + Math.abs(fresh.eye[2] - kept.eye[2])).toBeGreaterThan(1e-3);   // the case tells them apart
    return { placed: g.placed().eye, fresh: fresh.eye, kept: kept.eye };
  }
  it('nothing changed: carried on (no rebuild)', () => {
    const r = run(() => {});
    close(r.placed, r.kept);
  });
  const changes: [string, Change][] = [
    ['the id', (_g, net) => { const s = net.script; net.script = (k) => { const b = s(k); return b ? { ...b, id: 8 } : null; }; }],
    ['the ground\'s grid', (g) => { g.newGrid(); }],
    ['the map', (g) => { g.newMap(); }],
    ['the clock\'s epoch', (_g, net) => { net.clock = { cmd: 13.5, epoch: 2 }; }],
  ];
  it.each(changes)('%s changed: rebuilt', (_name, change) => {
    const r = run(change);
    close(r.placed, r.fresh);
  });
  it('resetFollow (the watch ended) drops the rig, sets the clock to none and restores the camera', () => {
    const r = run((g, net) => {
      g.d.spectateFollowReset!();
      expect(net.calls.at(-1)).toEqual([null, false]);
    });
    close(r.placed, r.fresh);
  });
  it('spectatePovReset drops the rig the same way', () => {
    const r = run((g, net) => {
      g.d.spectatePovReset!();
      expect(net.calls.at(-1)).toEqual([null, false]);
    });
    close(r.placed, r.fresh);
  });

  it('a hole that will never fill (the clock reset under the rig): rebuilt at the new epoch, not held for ever', () => {
    const net = scripted(subject());
    net.history = Infinity;
    const g = page(net);
    for (let cmd = 5.5; cmd <= 40.5; cmd++) { net.clock = { cmd, epoch: 1 }; g.pov(drawnBody(net)); }
    // The reset: the same body standing somewhere else, its commands numbered from 45 on, the newest kept one below the
    // clock's (each snapshot's edge) and nothing kept at 41: by the gap rule alone (`PovCamera.frame`: at(41) unknown,
    // at(n) unknown) the old rig would hold its command-40 pose on every frame.
    net.script = subject((k) => ({ feet: [60, 0, -40 - k] }));
    net.history = 3;
    net.lag = 1;
    const held = new PovCamera({ grid: g.grid() });
    const old = scripted(subject());
    old.history = Infinity;
    for (let cmd = 5.5; cmd <= 40.5; cmd++) { old.clock = { cmd, epoch: 1 }; held.frame(sourceOf(old, 0, g.grid()), cmd, ASPECT); }
    for (let cmd = 45.5; cmd <= 50.5; cmd++) {
      net.clock = { cmd, epoch: 2 };
      expect(held.frame(sourceOf(net, 0, g.grid()), cmd, ASPECT)!.eye[0]).toBeLessThan(10);   // the old rig: held at the old place
      expect(g.pov(drawnBody(net, { feet: [60, 0, -40 - Math.floor(cmd)] }))).toBe(true);
      expect(g.placed().eye[0]).toBeGreaterThan(30);                    // on the new samples, never the old place
    }
  });
});

describe('PV-5b: the warm call (the follow shows; the rig keeps the owner\'s history)', () => {
  it('writes nothing to the camera or the hide, never draws on the clock, and the view shown after it carries the history', () => {
    const net = scripted(subject());
    const g = page(net);
    const carried = new PovCamera({ grid: g.grid() });
    for (let cmd = 5.5; cmd <= 12.5; cmd++) {
      net.clock = { cmd, epoch: 1 };
      g.warm(drawnBody(net));
      carried.frame(sourceOf(net, 0, g.grid()), cmd, ASPECT);
    }
    expect(g.writes).toEqual([]);
    expect(net.calls.every(([id, drawn]) => id === 7 && !drawn)).toBe(true);
    net.clock = { cmd: 13.5, epoch: 1 };
    expect(g.pov(drawnBody(net))).toBe(true);
    close(g.placed().eye, carried.frame(sourceOf(net, 0, g.grid()), 13.5, ASPECT)!.eye);   // no rebuild: the warm rig
  });
  it('after a drawn frame, the warm call (the sub-mode off) restores the near plane, the offset and the hide once', () => {
    const net = scripted(subject(() => ({ view: 6, swayX: 3, swayY: -2 })));
    const g = page(net);
    expect(g.pov(drawnBody(net))).toBe(true);
    g.writes.length = 0;
    g.warm(drawnBody(net));
    expect(undrawn(g.writes)).toEqual(UNDRAW);   // review F2: the stored pose handed back first, then the restores
    g.writes.length = 0;
    g.warm(drawnBody(net));
    expect(g.writes).toEqual([]);
  });
});

describe('PV-5b: the near plane, the sway\'s offset and the hide', () => {
  it('a scope: the head\'s near, the offset scopeViewOffset gives, the subject hidden; the first frame not drawn restores each once', () => {
    const net = scripted(subject(() => ({ view: 6, swayX: 3, swayY: -2 })));
    const g = page(net);
    expect(g.pov(drawnBody(net))).toBe(true);
    const want: PovPose = new PovCamera({ grid: g.grid() }).frame(sourceOf(net, 0, g.grid()), net.clock!.cmd, ASPECT)!;
    expect(want.head).toBe(true);
    expect(g.writes.find((w) => w.name === 'setViewNear')!.args).toEqual([want.near]);
    expect(g.writes.find((w) => w.name === 'setSubjectOffset')!.args).toEqual([3, 2]);
    expect(g.writes.find((w) => w.name === 'setPovHidden')!.args).toEqual([7]);
    g.writes.length = 0;
    expect(g.pov(drawnBody(net, { flags: 0 }))).toBe(false);          // dead: the follow
    expect(undrawn(g.writes)).toEqual(UNDRAW);   // review F2: the stored pose handed back first, then the restores
    g.writes.length = 0;
    expect(g.pov(drawnBody(net, { flags: 0 }))).toBe(false);
    expect(g.writes).toEqual([]);                                      // restored once, not every frame
  });
  it('third person: the map\'s near (null), no offset, no body hidden', () => {
    const net = scripted(subject());
    const g = page(net);
    expect(g.pov(drawnBody(net))).toBe(true);
    expect(g.writes.find((w) => w.name === 'setViewNear')!.args).toEqual([null]);
    expect(g.writes.find((w) => w.name === 'setSubjectOffset')!.args).toEqual([0, 0]);
    expect(g.writes.find((w) => w.name === 'setPovHidden')!.args).toEqual([null]);
  });
  it('from the head to third person: the hide lets go of the body that frame', () => {
    const net = scripted(subject((k) => ({ view: k < 6 ? 1 : 0 })));
    const g = page(net);
    expect(g.pov(drawnBody(net))).toBe(true);
    expect(g.writes.filter((w) => w.name === 'setPovHidden').at(-1)!.args).toEqual([7]);
    net.clock = { cmd: 6.5, epoch: 1 };
    expect(g.pov(drawnBody(net))).toBe(true);
    expect(g.writes.filter((w) => w.name === 'setPovHidden').at(-1)!.args).toEqual([null]);
  });
});

describe('PV-5b: the same dep against a replay (ReplayClient through asNetClient, unchanged)', () => {
  /** 6 s of a protocol-16 recording: Alpha's commands one a tick, at x = n after command n, the nibble n's. */
  function segment(): LoadedSegment {
    const records: ReplayRecord[] = [{ kind: 'header', header: header() }, { kind: 'players', tick: 0, players: [ALPHA, BRAVO] }];
    for (let t = 0; t <= 6 * TICK_HZ; t += 2) {
      records.push({ kind: 'snap', tick: t, bodies: [{ ...fixtureBody(ALPHA.id, t), clock: t & 15 }, { ...fixtureBody(BRAVO.id, -t), clock: t & 15 }] });
    }
    records.push({ kind: 'end', tick: 6 * TICK_HZ, reason: 'closed' });
    return { header: header(), records, truncated: false };
  }
  it('places the view from the replay\'s own clock and samples', async () => {
    let now = 10_000;
    const c = new ReplayClient(Promise.resolve(segment()), { name: 'Watcher', map: 'MP2', now: () => now });
    await c.ready;
    const client = asNetClient(c);
    const g = page(client as unknown as Net);
    let drawn = 0;
    for (let i = 0; i < 120; i++) {
      now += 1000 / 60;
      const b = client.bodies().find((x) => x.id === ALPHA.id)!;
      if (g.pov({ ...b })) drawn++;
    }
    expect(drawn).toBeGreaterThan(100);
    const cc = client.commandClock()!;
    expect(cc).not.toBeNull();
    // Drawn on the clock: bodies() moves Alpha to his command time (PV-4b), the camera stands behind him there.
    const eye = g.placed().eye, at = client.bodyAtCommand(cc.cmd)!;
    expect(Math.abs(eye[0] - at.feet[0])).toBeLessThan(20);
  });
});

/**
 * PV-5b's review (the controller's fold): a frame the view is drawn returns before `SpectatorHost.follow`
 * (`./spectatorView` `follow`, `followWatched`), so `spectateFollow` runs only on frames it was not -- and must give the
 * view back itself (F1), start the follow's camera fresh after it (F3), and leave the fly camera's stored pose at what
 * was on screen for the free camera (F2).
 */
describe("PV-5b review: the follow after the view (F1, F2, F3)", () => {
  const follow = (g: ReturnType<typeof page>, b: SpectatorBody, ease?: boolean): void => g.d.spectateFollow!(b, 1 / 60, ease);
  const lastPose = (g: ReturnType<typeof page>) => g.writes.filter((w) => w.name === 'setPose').at(-1)!.args[0] as Record<string, number>;

  it('F1: a page that never drew the view: the follow\'s pose is today\'s exactly, with or without a client, and nothing else is written', () => {
    const net = scripted(subject());
    const withNet = page(net), without = page(null);
    for (let cmd = 5.5; cmd <= 9.5; cmd++) {
      net.clock = { cmd, epoch: 1 };
      const b = drawnBody(net);
      follow(withNet, b, true);
      follow(without, b, true);
      expect(lastPose(withNet)).toEqual(lastPose(without));
    }
    expect(withNet.writes.every((w) => w.name === 'setPose')).toBe(true);
    expect(net.calls).toEqual([]);                                     // the client untouched by the follow
  });

  it('F1: the first follow frame after a drawn head view gives back the hide, the offset and the near plane, and undraws the clock', () => {
    const net = scripted(subject(() => ({ view: 6, swayX: 3, swayY: -2 })));
    const g = page(net);
    expect(g.pov(drawnBody(net))).toBe(true);
    expect(net.calls.at(-1)).toEqual([7, true]);
    g.writes.length = 0;
    follow(g, drawnBody(net), true);                                   // the hold of X let go: the follow, no `pov` call
    expect(undrawn(g.writes)).toEqual([...UNDRAW, 'setPose']);         // given back, then the follow's own pose
    expect(net.calls.at(-1)).toEqual([7, false]);                      // watched, not drawn: the rig's clock kept
    g.writes.length = 0;
    follow(g, drawnBody(net), true);
    expect(undrawn(g.writes)).toEqual(['setPose']);                    // once
  });

  it('F3 and F2: the follow after N drawn frames is a fresh follow of the body where it now stands -- not eased from before, and not moved by the hand-back', () => {
    const net = scripted(subject((k) => ({ feet: [0, 0, 10 - 6 * k] })));   // running fast down -z
    net.history = Infinity;
    const g = page(net);
    net.clock = { cmd: 5.5, epoch: 1 };
    for (let i = 0; i < 5; i++) follow(g, drawnBody(net), true);       // the eased follow stands at command 5
    for (let cmd = 6.5; cmd <= 30.5; cmd++) { net.clock = { cmd, epoch: 1 }; expect(g.pov(drawnBody(net))).toBe(true); }
    net.clock = { cmd: 31.5, epoch: 1 };
    const b = drawnBody(net);
    follow(g, b, true);
    const fresh = page(null);
    follow(fresh, b, true);                                            // a new bind: written straight, no ease
    const got = lastPose(g), want = lastPose(fresh);
    for (const k of ['x', 'y', 'z', 'yaw', 'pitch']) expect(got[k]!).toBeCloseTo(want[k]!, 9);
  });

  it('F2: the view given back with no follow after it (the free camera\'s path): the fly camera stands at the last drawn eye and look', () => {
    for (const end of ['spectateFollowReset', 'spectatePovReset', 'warm'] as const) {
      const net = scripted(subject((k) => ({ view: k < 9 ? 6 : 0 })));
      net.history = Infinity;
      const g = page(net);
      const ref = new PovCamera({ grid: g.grid() });
      let pose: PovPose | null = null;
      for (let cmd = 5.5; cmd <= 10.5; cmd++) {                        // a scope, then third person
        net.clock = { cmd, epoch: 1 };
        expect(g.pov(drawnBody(net))).toBe(true);
        pose = ref.frame(sourceOf(net, 0, g.grid()), cmd, ASPECT);
      }
      g.writes.length = 0;
      if (end === 'warm') g.warm(drawnBody(net)); else g.d[end]!();
      expect(undrawn(g.writes), end).toEqual(UNDRAW);
      const stood = lastPose(g);
      expect(stood.x).toBeCloseTo(pose!.eye[0], 9);
      expect(stood.y).toBeCloseTo(pose!.eye[1], 9);
      expect(stood.z).toBeCloseTo(pose!.eye[2], 9);
      expect(stood.yaw).toBeCloseTo(pose!.yaw, 9);
      expect(stood.pitch).toBeCloseTo(pose!.pitch, 9);
    }
  });

  it('PV-SPAWN-FACING (the owner\'s report, 2026-11-14): the view given back at the watcher\'s own spawn writes no pose -- the walk\'s respawn has set the spawn\'s facing', () => {
    const net = scripted(subject(() => ({ view: 6, swayX: 3, swayY: -2 })));
    net.history = Infinity;
    const g = page(net);
    const firearm = g.p.firearm as unknown as { setSubjectView?: (v: unknown) => void };
    firearm.setSubjectView = (...args: unknown[]): void => { g.writes.push({ name: 'setSubjectView', args }); };
    for (let cmd = 5.5; cmd <= 9.5; cmd++) {                         // dead and benched: the view drawn under the round screen
      net.clock = { cmd, epoch: 1 };
      expect(g.pov(drawnBody(net))).toBe(true);
    }
    g.writes.length = 0;
    g.setMode('walk');                                                 // `client.spawned` -> `walk.respawn`: walking again
    g.d.spectateFollowReset!();                                        // the page's `spawn` -> `unbench` -> `SpectatorView.reset`
    expect(g.writes.some((w) => w.name === 'setPose')).toBe(false);    // the spawn's facing stands
    expect(undrawn(g.writes)).toEqual(['setViewNear()', 'setSubjectOffset(0,0)', 'setPovHidden()', 'setSubjectView()']);
    g.writes.length = 0;
    g.d.spectateFollowReset!();
    expect(g.writes).toEqual([]);                                      // given back once
  });
});

describe('PV-10a (finding 6, the exit side): `spectatePovIdle` -- the body given back to today\'s clock before the frame\'s bodies', () => {
  it('after a drawn frame: `setCommandClockBody(id, false)` and nothing else; the follow later gives the rest back, once', () => {
    const net = scripted(subject());
    const g = page(net);
    expect(g.pov(drawnBody(net))).toBe(true);
    expect(net.calls.at(-1)).toEqual([7, true]);
    g.writes.length = 0;
    net.calls.length = 0;
    g.d.spectatePovIdle!();
    expect(net.calls).toEqual([[7, false]]);                       // never `true`: PV-4b's binding untouched
    expect(g.writes).toEqual([]);                                  // no setPose, near plane, offset or hide here
    net.clock = { cmd: 6.5, epoch: 1 };
    g.d.spectateFollow!(drawnBody(net), 1 / 60, false);            // the same frame's follow: today's undraw, once
    expect(undrawn(g.writes).slice(0, 4)).toEqual(UNDRAW);
    expect(g.writes.filter((w) => w.name === 'setPovHidden')).toHaveLength(1);
    net.calls.length = 0;
    g.d.spectatePovIdle!();                                        // nothing drawn any more: nothing
    expect(net.calls).toEqual([]);
  });

  it('no view drawn (a page that only follows, or none at all): nothing asked of the client, nothing written', () => {
    const net = scripted(subject());
    const g = page(net);
    g.d.spectatePovIdle!();
    g.warm(drawnBody(net));
    net.calls.length = 0;
    g.d.spectatePovIdle!();
    expect(net.calls).toEqual([]);
    expect(g.writes).toEqual([]);
  });
});

/**
 * R4P-220 (POV_SHAKE_ADAPTATION, the owner's criterion: the Player View receives every event a living player does): a
 * drawn frame hands the camera the watched body's feet (`FlyCamera.setSubjectFeet`), which a blast's distance is taken
 * from (`./matchThrow`); the first frame not drawn -- the body dead, the follow -- takes them back (null), once.
 */
describe("R4P-220: the drawn body's feet handed to the camera for the view's own shake", () => {
  it('drawn on a living body: its feet each drawn frame; not drawn (dead): null, once', () => {
    const net = scripted(subject());
    const g = page(net);
    const feet: unknown[] = [];
    (g.p.fly as { setSubjectFeet?: (f: unknown) => void }).setSubjectFeet = (f) => { feet.push(f); };
    const b = drawnBody(net);
    expect(g.pov(b)).toBe(true);
    expect(feet).toEqual([b.feet]);
    expect(g.pov(drawnBody(net, { flags: 0 }))).toBe(false);
    expect(feet).toEqual([b.feet, null]);
    expect(g.pov(drawnBody(net, { flags: 0 }))).toBe(false);
    expect(feet).toEqual([b.feet, null]);
  });
});
