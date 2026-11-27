import { createHash } from 'node:crypto';
import { AN_M8, buildGrid, CLAYMORE, HE, M67, MARK141, type ThrowableRecord, type V3, type WorldPoly } from '@s2u/scene';
import type { EffectHandle } from '../../src/effects';
import type { GrenadeThrower, GrenadeSource, GrenadeEvents } from '../../src/grenade';
import type { PlaySnapshot } from '../../src/walk';

/** Synthetic code-behavior comparison, not a console capture. The charge
 * records/hull reproduce grenade.test.ts's PAR-96 fixture; the frame schedule
 * deliberately includes a real-time hitch and a separate short animation step.
 * No production timing, physics or damage value is configured by this fixture.
 * Its actor list is empty and its view is third-person: these six hashes do not
 * cover proximity trips, water/climb gates, mounted launcher paths or drawn
 * scorch attachments. The existing targeted suites remain required beside it.
 */
export const GRENADE_TRACE_MODES = ['hold', 'fallback', 'effects', 'effect-fallback', 'charges', 'hydrate'] as const;
export type GrenadeTraceMode = typeof GRENADE_TRACE_MODES[number];
export type GrenadeTraceEngine = Pick<GrenadeThrower,
  'on' | 'setKit' | 'setRecords' | 'setWorld' | 'setEffectPlayer' | 'select' | 'pull' | 'release' | 'update' |
  'stats' | 'diag' | 'giveBack' | 'setLeft' | 'takeKit' | 'refill' | 'reset' | 'clearAir' | 'clearSmokes' |
  'clearRoundEffects' | 'cancelMenuHold' | 'noteHoldEnd' | 'plantC4' | 'tagOwn' | 'detonateRemote' |
  'detonateCharges' | 'launchRemote' | 'launchRound' | 'fireScene'>;
export type GrenadeTraceFactory = (source: GrenadeSource, random: () => number) => GrenadeTraceEngine;
const EVENTS: readonly (keyof GrenadeEvents)[] = ['equip', 'throwStart', 'place', 'throw', 'cut', 'mountTaken',
  'mountHandedBack', 'remoteRelease', 'remoteLaunch', 'rocketPast', 'bounce', 'explode', 'refuse', 'detonate'];
const DI = 'worldmodel/access1=access1/good_parts/di_good';
const PMN: ThrowableRecord = { ...CLAYMORE, name: 'PMN Mine', id: 158, fuse: 8, removal: 10, explosionDamage: 6.5,
  explosionRadius: 40, proximity: 10, model: 'pmn', icon: 'pmn.tif', capacity: 4 };
const C4: ThrowableRecord = { ...CLAYMORE, name: 'C4', id: 151, fuse: 6, removal: 0.1, explosionDamage: 18,
  explosionRadius: 50, model: 'c4', icon: 'c4.tif', capacity: 4 };
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export function grenadeCoreTrace(make: GrenadeTraceFactory, mode: GrenadeTraceMode) {
  const calls: unknown[] = [], events: { kind: keyof GrenadeEvents; args: unknown[] }[] = [], states: unknown[] = [];
  let seed = 1;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const value = seed / 4294967296; calls.push(['random', value]); return value;
  };
  const floor: WorldPoly = { modelName: 'worldmodel', path: 'worldmodel/f', region: 0, ditype: 3,
    material: 7, ptcount: 4, cameratype: 0,
    points: Float32Array.from([-2000, 50, 2000, 2000, 50, 2000, 2000, 50, -2000, -2000, 50, -2000]) };
  const wall: WorldPoly = { ...floor, path: DI, ditype: 2,
    points: Float32Array.from([130, 50, 150, 130, 50, 250, 130, 110, 250, 130, 110, 150]) };
  const grid = buildGrid({ atomCount: 8192, posts: 16, cellDim: 500, cellsX: 8, cellsZ: 8, originX: -2000, originZ: -2000 },
    [], [], [floor, wall], [{ modelName: 'worldmodel', path: floor.path, first: 0, count: 1 },
      { modelName: 'worldmodel', path: DI, first: 1, count: 1 }]);
  let dead = false, online = false, fireAllowed = true, present = true, tick = 0;
  let snap = { feet: [100, 50, 200], yaw: 0, pitch: 0, vx: 0, vy: 0, vz: 0, airborne: false,
    crouched: false, stance: 'stand', landing: null, jumps: 0 } as PlaySnapshot;
  const source: GrenadeSource = { grid: () => present ? grid : null, hullGrid: () => grid,
    snapshot: () => present ? snap : null, view: () => 'third',
    handPoint: (part, point) => { calls.push(['hand', part, [...point]]); return [102, 62, 192]; },
    aim: () => ({ eye: [100, 62, 200], far: [400, 62, 200] }), actors: () => [], listenerFeet: () => [100, 50, 200],
    dead: () => dead, online: () => online, fireAllowed: () => fireAllowed, simTick: () => tick };
  const g = make(source, random);
  for (const kind of EVENTS) g.on(kind, ((...args: unknown[]) => {
    events.push({ kind, args: copy(args) }); calls.push(['event', kind, copy(args)]);
  }) as never);
  g.setRecords([PMN, C4]);
  g.setWorld(() => ({ health: {
    c4TargetAt: (path, damage) => path === DI && damage >= 17 ? 0 : null,
    blastAt: (pos, damage, radius) => { calls.push(['blast', [...pos], damage, radius]); return []; },
    hitAt: (owner, hit) => { calls.push(['contact', owner, copy(hit)]); return { applied: false, died: false }; },
  } }));
  let handleId = 0;
  if (mode === 'effects' || mode === 'effect-fallback' || mode === 'hydrate') g.setEffectPlayer((anim, at) => {
    calls.push(['effect', anim, copy(at)]); random();
    if (mode === 'effect-fallback') return false;
    const id = ++handleId;
    return { stop: () => { calls.push(['stop-effect', id]); random(); } } as unknown as EffectHandle;
  });
  const sample = (label: string) => {
    // These fields depend on the adapter's graphics, not projectile/kit rules.
    const { inHand: _h, effects: _e, model: _m, scorchShade: _s, scorchTriangles: _t, ...state } = g.stats();
    // LANE-KILL B-06: the diag's latch read-out (`selectPosture`, `latchH`, an instrument added after the pins) is left out,
    // so the pins still hold the state they were taken on. Issue #858: the same for `lastAbort` (THROW_DIAG_ADAPTATION).
    const { selectPosture: _p, latchH: _l, lastAbort: _a, ...diag } = g.diag();
    states.push(copy({ label, state, diag }));
  };
  const step = (count: number, dt = 1 / 60, real = dt) => {
    for (let i = 0; i < count; i++) { tick++; g.update(dt, real); sample('frame'); }
  };
  const result = (label: string, value: unknown) => { calls.push(['result', label, copy(value)]); sample(label); };
  sample('initial');
  if (mode === 'hold') {
    g.setKit(['M67', 'M67', 'HE']); result('duplicate-slot', g.select('M67', 3));
    g.pull(); step(18); g.release(); step(90); result('refund-exact-slot', g.giveBack('M67', 3));
    g.setLeft({ M67: 2, HE: 1 }); g.takeKit(['M67', 'M67', 'HE']); sample('authoritative-pouch');
    g.refill(); g.select('HE'); g.pull(); step(8); g.cancelMenuHold(); g.release(); step(2); sample('menu-cancel');
    g.pull(); step(6); snap = { ...snap, airborne: true }; step(1); g.release(); step(3);
    snap = { ...snap, airborne: false }; step(90); sample('air-release');
    g.refill(); g.select('M67'); g.pull(); step(1, 1 / 60, 0.75); sample('power-real-hitch');
    fireAllowed = false; step(2); g.release(); step(2); fireAllowed = true; step(90);
    g.refill(); g.select('M67'); g.pull(); step(6); dead = true; step(1); sample('death-cut');
    dead = false; g.refill(); g.select('M67'); g.pull(); step(2); present = false; step(1); sample('left-walk');
    present = true;
  } else if (mode === 'charges') {
    g.setKit(['Claymore', 'PMN Mine', 'C4']);
    result('take-claymore', g.select('Claymore')); g.pull(); step(180);
    result('detonate-local', g.detonateCharges()); step(2);
    result('take-pmn', g.select('PMN Mine')); g.pull(); step(180);
    g.select('rifle'); step(12); result('plant-c4', g.plantC4()); step(90);
    const placed = events.filter(event => event.kind === 'place').at(-1)?.args[0] as { item: string; pos: V3 } | undefined;
    if (placed?.item === 'C4') g.tagOwn('C4', placed.pos, 91);
    online = true; step(1, 1 / 60, 8); sample('server-fuse-held');
    g.detonateRemote(91); step(2); sample('server-detonation');
    g.fireScene('C4', [110, 50, 190]); step(1); sample('scene-round');
  } else if (mode === 'hydrate') {
    online = true;
    const smoke = { pid: 7, state: 'detonated' as const, age: 5, fuse: -2, removal: 20, bounces: 1 };
    g.launchRemote('AN-M8', [80, 50, 200], [0, 0, 0], 2, smoke); sample('smoke-join');
    g.launchRemote('AN-M8', [80, 50, 200], [0, 0, 0], 2, smoke); sample('smoke-rejoin');
    g.clearSmokes(); g.launchRemote('AN-M8', [80, 50, 200], [0, 0, 0], 2, smoke); sample('smoke-after-clear');
    g.launchRemote('M67', [90, 80, 200], [0, 0, -100], 2, { pid: 8 }, 30); step(4);
    g.launchRemote('Claymore', [80, 50, 210], [0, 0, -1], 2, { pid: 9 });
    g.launchRemote('Detonator', [100, 50, 200], [0, 0, 0], 3); sample('other-owner-detonator');
    g.launchRemote('Detonator', [100, 50, 200], [0, 0, 0], 2); step(2);
    g.launchRemote('C4', [110, 50, 200], [0, 0, -1], 2, { pid: 10 });
    step(1, 1 / 60, 8); g.detonateRemote(10); step(2); sample('remote-c4');
    present = false; step(60); sample('spectator-flight');
  } else {
    for (const [i, record] of [M67, HE, AN_M8, MARK141].entries())
      g.launchRound(record, [70 + i * 10, 55, 200], [0, 0, 0]);
    step(240); sample('four-detonations');
    step(1, 1 / 60, 3); sample('smoke-real-hitch');
    g.clearSmokes(); sample('smoke-stop');
  }
  g.clearAir(); sample('clear-air'); g.clearRoundEffects(); sample('clear-effects'); g.reset(); sample('reset');
  return { calls, events, states };
}

export const grenadeTraceDigest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function grenadeTraceSummary(trace: ReturnType<typeof grenadeCoreTrace>) {
  return { digest: grenadeTraceDigest(trace), frames: trace.states.length,
    events: Object.fromEntries(EVENTS.map(kind => [kind, trace.events.filter(event => event.kind === kind).length])),
    randomDraws: trace.calls.filter(call => (call as unknown[])[0] === 'random').length };
}
