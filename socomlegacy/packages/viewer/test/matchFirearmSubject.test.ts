// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Scene, Vector3, type Vector2 } from 'three';
import { EMPTY_ITEM, HELD_RIFLE, HELD_SIDEARM, ITEM, itemClass, readKitTable, type KitTable, type WeaponRecord } from '@s2u/scene';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { FlyCamera } from '../src/camera';
import { Effects } from '../src/effects';
import { Hud } from '../src/hud';
import { BAKED_LOADOUT, PlayerLoadout } from '../src/loadout';
import { TESTROOM_CAPABILITIES } from '../src/matchCore';
import { mountFirearm, type FirearmHands, type FirearmSound, type MatchFirearm, type MatchFirearmDeps, type SubjectView } from '../src/matchFirearm';
import { matchNetDeps, type MatchNetParts, type PovNet } from '../src/matchNet';
import { BodyFlag, type BodyState } from '../src/net/protocol';
import type { NetPageDeps } from '../src/netPage';
import { Play } from '../src/play';
import { POV_MAX_TICKS_ADAPTATION, type PovPose } from '../src/povCamera';
import { PovLens } from '../src/povLens';
import { RemotePlayers } from '../src/remotePlayers';
import { handReticleType, type Reticle } from '../src/reticle';
import type { SpectatorBody } from '../src/spectatorView';
import { WalkMode, type PlaySnapshot } from '../src/walk';
import { BINOCULARS, lensOf } from '../src/zoom';
import type { LoadedMap } from '../src/loadMap';

/** PV-7b review F3: the lit colours' two writers (`./nightVision`), recorded into a leg's log when one is set. */
const sink = vi.hoisted(() => ({ log: null as null | [string, unknown[]][] }));
vi.mock('../src/nightVision', async (importOriginal) => {
  const m = await importOriginal<typeof import('../src/nightVision')>();
  return {
    ...m,
    setLensRows: (rows: Parameters<typeof m.setLensRows>[0]) => { sink.log?.push(['setLensRows', [rows]]); m.setLensRows(rows); },
    setNightVision: (lens: Parameters<typeof m.setNightVision>[0]) => { sink.log?.push(['setNightVision', [lens]]); m.setNightVision(lens); },
  };
});

/**
 * PV-7b (the player's view; product track, a browser adaptation with no original -- research 402 s2, plan PV-7): while,
 * and only while, the player's view is drawn (`MatchFirearm.setSubjectView`), the watcher's page shows the watched
 * player's zoom, far range, lens, overlays, "ZOOM" readout and reticle; the watcher's own gun runs on underneath.
 *
 * The fakes are `./matchFirearm.test.ts`'s `rig` (the real `FlyCamera`, `WalkMode`, `Play`, `RemotePlayers`, `Hud` and
 * `PlayerLoadout` on a jsdom canvas), with every write the task's readers make recorded in one ordered log.
 */

afterEach(() => { vi.restoreAllMocks(); sink.log = null; });

const DT = 1 / 60;
const PS2 = { autoClear: true, getDrawingBufferSize: (v: Vector2) => v.set(640, 448), render: () => {} };
const ZWEAPON = fixture('RUN/ZWEAPON.ZAR');

const hands = (over: Partial<FirearmHands> = {}): FirearmHands => ({
  launcherUp: () => false, launcherRoundIcon: () => null, itemUp: () => false, busy: () => false, takeable: () => true,
  putAway: () => {}, spawned: () => {}, trigger: () => false, launched: () => {}, icon: () => null, magazine: () => null,
  mounted: () => false, ...over,
});

type Log = [string, unknown[]][];

/** `./matchFirearm.test.ts`'s `rig`, with the readers' writes recorded (`log`), a kit table and a spawn's kit. */
function rig(o: { extra?: Partial<MatchFirearmDeps>; table?: KitTable | null; kit?: readonly number[] | null } = {}) {
  const scene = new Scene();
  const fly = new FlyCamera(document.createElement('canvas'));
  const walk = new WalkMode(fly);
  const play = new Play();
  const remote = new RemotePlayers(scene);
  const hud = new Hud();
  const loadouts = new PlayerLoadout();
  if (o.table) loadouts.setMap(o.table, null);
  const log: Log = [];
  const sound: FirearmSound = {
    fireEvent: () => {}, effect: () => {}, roundFired: () => {},
    goggles: (on) => { log.push(['sound.goggles', [on]]); },
  };
  const firearm = mountFirearm({
    scene, fly, walk, play, remote, hud, loadouts, view: () => null, map: () => null, body: () => null, net: () => null,
    blocked: () => false, refreshFog: (lens) => { log.push(['refreshFog', [lens]]); }, sound, ...o.extra,
  });
  if (o.kit) firearm.spawnKit('seal', o.kit);
  const spy = (obj: object, name: string, label: string): void => {
    const target = obj as Record<string, (...a: unknown[]) => unknown>;
    const orig = target[name]!.bind(obj);
    vi.spyOn(target, name).mockImplementation((...a: unknown[]) => { log.push([label, a]); return orig(...a); });
  };
  for (const m of ['setFov', 'setZoom', 'setKitOffset', 'setBody'] as const) spy(fly, m, `fly.${m}`);
  spy(hud, 'setZoom', 'hud.setZoom');
  const ret: Reticle = firearm.reticle;
  for (const m of ['setMode', 'setSet', 'setTube', 'setNight', 'setSize', 'setAimPoint', 'setScopeBitmaps', 'setVisible', 'setThreatGate',
    'setThreat', 'setPip', 'setColour', 'setTarget', 'setMeter'] as const) spy(ret, m, `reticle.${m}`);
  return { scene, fly, walk, play, remote, hud, loadouts, firearm, log };
}
type Rig = ReturnType<typeof rig>;

/** The last recorded call of `label`'s arguments (undefined: none). */
const last = (log: Log, label: string): unknown[] | undefined => { for (let i = log.length - 1; i >= 0; i--) if (log[i]![0] === label) return log[i]![1]; return undefined; };
const calls = (log: Log, label: string): unknown[][] => log.filter((e) => e[0] === label).map((e) => e[1]);

/** A log's digest: its length and an FNV-1a hash of its JSON, the numbers at 1e-6. */
function digest(log: Log): string {
  const s = JSON.stringify(log, (_k, v: unknown) => (typeof v === 'number' ? Math.round(v * 1e6) / 1e6 : v));
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return `${log.length}:${h.toString(16)}`;
}

const STILL = { stance: 'stand', vx: 0, vy: 0, vz: 0, airborne: false } as unknown as PlaySnapshot;
const EYE: [number, number, number] = [0, 50, 0];

/** A point 1000 along the camera's look from its eye (`FUN_00297410`'s aim point; the rig's `pose.target`). */
function ahead(fly: FlyCamera): [number, number, number] {
  fly.camera.updateMatrixWorld();
  const d = fly.camera.getWorldDirection(new Vector3());
  const p = fly.camera.position;
  return [p.x + d.x * 1000, p.y + d.y * 1000, p.z + d.z * 1000];
}

/** A walking owner (the page's own player): his snapshot still, his aim straight ahead, `main.ts`'s frame order. */
function owner(o: Parameters<typeof rig>[0] = {}) {
  const r = rig(o);
  r.fly.setPose({ x: EYE[0], y: EYE[1], z: EYE[2], yaw: 0, pitch: 0 });
  vi.spyOn(r.walk, 'mode').mockReturnValue('walk');
  vi.spyOn(r.walk, 'snapshot').mockReturnValue(STILL);
  const aim = ahead(r.fly);
  vi.spyOn(r.walk, 'aim').mockReturnValue(aim);
  const frame = (): void => {
    r.firearm.beforeMove();
    r.firearm.gunFrame(DT, true);
    r.firearm.aimReticle(DT);
    r.firearm.showReticle(PS2, true, false, false, true);
    r.firearm.feedHud(true);
  };
  return { ...r, frame, aim };
}

/** A body of the watched seat at a command: alive, standing, still, the view state and the item in the hand given. */
function bodyOf(view: number, over: Partial<BodyState> = {}): BodyState {
  return {
    id: 7, feet: [0, 0, 0], yaw: 0, pitch: 0, vx: 0, vy: 0, vz: 0, flags: BodyFlag.Alive, stance: 0, landing: 0, jumps: 0,
    ground: 0, groundForward: 0, groundRight: 0, groundCls: 0, action: 0, actionSerial: 0, actionT: 0, actionSeconds: -1,
    overlay: 0, overlayT: 0, overlaySeconds: 0, turnRate: 0, trav: 0, travFrame: 0, travRootY: Number.NaN, travBlend: 0,
    travBlendWeight: 0, peek: 0, weapon: HELD_RIFLE.id, slot: 0, view, ...over,
  };
}

/**
 * A watcher (dead, or a spectator): never walking. Each frame `main.ts`'s order -- the gun, then the net's frame, where
 * PV-5b's `spectatePov` places the camera and (PV-7b) hands the subject, then the reticle and the HUD. `script(k)` is
 * the subject's body after command k (null: not kept); its command clock steps one command a frame from 100.
 */
function watcher(o: Parameters<typeof rig>[0] & { dead?: boolean; script?: (k: number) => BodyState | null; id?: number; named?: readonly number[] | null } = {}) {
  const r = rig(o);
  // The kit the room named for the watched seats (7, and 9 where a case switches subject); null: none (F1's guess).
  const named = o.named === undefined ? BAKED_LOADOUT : o.named;
  if (named) for (const id of [7, 9]) r.remote.setKit(id, named);
  r.fly.setPose({ x: EYE[0], y: EYE[1], z: EYE[2], yaw: 0, pitch: 0 });
  if (o.dead) { vi.spyOn(r.walk, 'isDead').mockReturnValue(true); r.firearm.died(); }
  const target = ahead(r.fly);
  const script: (k: number) => BodyState | null = o.script ?? (() => bodyOf(0));
  const state = { cmd: 100, epoch: 1, id: o.id ?? 7, script, drawn: true, spawns: 0 };
  const pose = (): PovPose => {
    const b = state.script(Math.floor(state.cmd));
    const head = lensOf(b?.view ?? 0);
    return { eye: EYE, target, yaw: 0, pitch: 0, near: head ? 2 : null, head, offset: [0, 0] };
  };
  const subject = (): SubjectView => ({
    id: state.id, cmd: state.cmd, epoch: state.epoch, pose: pose(),
    at: (k) => (k >= 0 ? state.script(k) : null), spawns: () => state.spawns,
  });
  /** PV-5b's undraw: `setPose` (the FOV at rest), then the subject let go -- the one place `null` is handed. */
  const undraw = (): void => {
    r.fly.setPose({ x: EYE[0], y: EYE[1], z: EYE[2], yaw: 0, pitch: 0 });
    r.firearm.setSubjectView(null);
  };
  let was = false;
  const frame = (): void => {
    r.firearm.beforeMove();
    r.firearm.gunFrame(DT, false);
    if (state.drawn) {                            // the net's frame: the view drawn this frame
      r.fly.placeView(EYE, target);
      r.firearm.setSubjectView(subject());
      was = true;
    } else if (was) { undraw(); was = false; }
    r.firearm.aimReticle(DT);
    r.firearm.showReticle(PS2, false, false, false, true);
    r.firearm.feedHud(false);
    state.cmd += 1;
  };
  return { ...r, frame, state, target, subject, undraw };
}

/** What the page shows of the view: the FOV, the look's divisor, the readout, the lens, the range and the reticle. */
function picture(r: Rig) {
  return {
    fov: r.fly.camera.fov, zoom: last(r.log, 'fly.setZoom'), readout: last(r.log, 'hud.setZoom'), lens: r.firearm.lens(),
    mode: last(r.log, 'reticle.setMode'), set: last(r.log, 'reticle.setSet'), tube: last(r.log, 'reticle.setTube'),
    night: last(r.log, 'reticle.setNight'), bitmaps: last(r.log, 'reticle.setScopeBitmaps'), visible: last(r.log, 'reticle.setVisible'),
  };
}
const pictureOf = (r: Rig & { firearm: MatchFirearm }) => ({ ...picture(r), render: r.firearm.renderView() });

describe('PV-7b: nothing set -- every write as before, for a walking player, a dead one and a spectator over a scripted minute', () => {
  // The digests are the RED run's, taken on the firearm without PV-7b (its base, `agent/player-view` 25ddb9bdb8): the
  // same calls with the same arguments in the same order.
  const minute = (kind: 'walking' | 'dead' | 'spectator', nulls: boolean): string => {
    const r = rig();
    r.fly.setPose({ x: EYE[0], y: EYE[1], z: EYE[2], yaw: 0, pitch: 0 });
    const walking = kind === 'walking';
    vi.spyOn(r.walk, 'mode').mockReturnValue(walking ? 'walk' : 'fly');
    vi.spyOn(r.walk, 'snapshot').mockReturnValue(walking ? STILL : null);
    vi.spyOn(r.walk, 'aim').mockReturnValue(walking ? ahead(r.fly) : null);
    vi.spyOn(r.walk, 'isDead').mockReturnValue(kind === 'dead');
    if (kind === 'dead') r.firearm.died();
    const round = { type: 'round', weapon: { name: 'M4A1', id: 54 }, from: [0, 50, -100], to: [0, 50, 100], hit: false, rounds: 0, normal: null, material: null } as never;
    for (let f = 0; f < 3600; f++) {
      if (walking && f === 60) r.firearm.stepZoom('in');
      if (walking && (f === 300 || f === 900)) r.firearm.stepZoom('in');
      if (walking && (f === 1500 || f === 2100 || f === 2700)) r.firearm.stepZoom('out');
      if (f % 450 === 0) r.firearm.roundEffects(round, 3);
      r.firearm.beforeMove();
      r.firearm.gunFrame(DT, walking);
      if (nulls) (r.firearm as { setSubjectView?(s: null): void }).setSubjectView?.(null);   // a page that passes null each frame
      r.firearm.aimReticle(DT);
      r.firearm.showReticle(PS2, walking, false, false, true);
      r.firearm.feedHud(walking);
    }
    return digest(r.log);
  };
  const BEFORE = { walking: '61232:1a87dd7f', dead: '28801:2a11ec9c', spectator: '28801:54b5528c' } as const;
  for (const kind of ['walking', 'dead', 'spectator'] as const) {
    it(`${kind}: the minute's writes are the base's (digest ${BEFORE[kind]})`, () => {
      expect(minute(kind, false)).toBe(BEFORE[kind]);
    });
    it(`${kind}: and the same with null handed every frame`, () => {
      expect(minute(kind, true)).toBe(BEFORE[kind]);
    });
  }

  /**
   * PV-7b review F3: the richer minute -- a NIGHT map (the goggles, their fog and sound, the scope's lens rows), the lit
   * colours' writers recorded (`sink`), an item up, a weapon switch, the tactical map and the scoreboard up, the rounds'
   * muzzle `zoomed` argument and each `Reticle.render` (with the reticle's visibility). Its digests were taken on the
   * BASE firearm (25ddb9bdb8's `matchFirearm.ts` put in place, these legs run alone, the file restored).
   */
  const NIGHT = { night: { mission: true, lens: [0.2, 0.9, 0.3, 1] } } as unknown as LoadedMap;
  const richMinute = (kind: 'walking' | 'dead' | 'spectator', nulls: boolean): string => {
    let itemOn = false;
    const r = rig({ extra: { map: () => NIGHT, hands: hands({ itemUp: () => itemOn, handItem: () => (itemOn ? 121 : null) }) } });
    sink.log = r.log;
    r.firearm.setView(NIGHT);
    r.fly.setPose({ x: EYE[0], y: EYE[1], z: EYE[2], yaw: 0, pitch: 0 });
    const walking = kind === 'walking';
    vi.spyOn(r.walk, 'mode').mockReturnValue(walking ? 'walk' : 'fly');
    vi.spyOn(r.walk, 'snapshot').mockReturnValue(walking ? STILL : null);
    vi.spyOn(r.walk, 'aim').mockReturnValue(walking ? ahead(r.fly) : null);
    vi.spyOn(r.walk, 'isDead').mockReturnValue(kind === 'dead');
    const onRound = Effects.prototype.onRound;
    vi.spyOn(Effects.prototype, 'onRound').mockImplementation(function (this: Effects, e, w, zoomed) {
      r.log.push(['effects.onRound', [zoomed]]);
      onRound.call(this, e, w, zoomed);
    });
    const ret = r.firearm.reticle, render = ret.render.bind(ret);
    vi.spyOn(ret, 'render').mockImplementation((x) => { r.log.push(['reticle.render', [ret.state().visible, ret.state().mode]]); render(x); });
    if (kind === 'dead') r.firearm.died();
    const round = { type: 'round', weapon: { name: 'M4A1', id: 54 }, from: [0, 50, -100], to: [0, 50, 100], hit: false, rounds: 0, normal: null, material: null } as never;
    for (let f = 0; f < 3600; f++) {
      if (walking && (f === 60 || f === 120 || f === 300 || f === 900)) r.firearm.stepZoom('in');   // 1, 3 (the goggles), 5
      if (walking && (f === 600 || f === 700 || f === 2500 || f === 2700)) r.firearm.stepZoom('out');
      if (f === 1000) itemOn = true;
      if (f === 1300) itemOn = false;
      if (f === 1400) r.firearm.selectFirearm('pistol');
      if (f === 2200) r.firearm.selectFirearm('rifle');
      if (f % 450 === 0) r.firearm.roundEffects(round, 3);
      const tacMap = f >= 1800 && f < 1900, scoreboard = f >= 2000 && f < 2100;
      r.firearm.beforeMove();
      r.firearm.gunFrame(DT, walking);
      r.firearm.kitFrame(DT, walking);
      if (nulls) (r.firearm as { setSubjectView?(s: null): void }).setSubjectView?.(null);
      r.firearm.aimReticle(DT);
      r.firearm.showReticle(PS2, walking, tacMap, scoreboard, true);
      r.firearm.feedHud(walking);
    }
    if (walking) {                                       // not vacuous: the night's writers and the screens ran
      for (const label of ['sound.goggles', 'setNightVision', 'setLensRows', 'refreshFog', 'effects.onRound']) expect(calls(r.log, label).length, label).toBeGreaterThan(0);
      expect(calls(r.log, 'reticle.render').some((a) => a[0] === false)).toBe(true);
    }
    return digest(r.log);
  };
  const BEFORE_RICH = { walking: '64859:5e646ea6', dead: '32410:4dfa6cc1', spectator: '32410:aa56f911' } as const;
  for (const kind of ['walking', 'dead', 'spectator'] as const) {
    it(`F3 ${kind}: the night map's minute with an item, a switch and the screens is the base's (digest ${BEFORE_RICH[kind]})`, () => {
      expect(richMinute(kind, false)).toBe(BEFORE_RICH[kind]);
    });
    it(`F3 ${kind}: and the same with null handed every frame`, () => {
      expect(richMinute(kind, true)).toBe(BEFORE_RICH[kind]);
    });
  }
});

describe('PV-7b: the subject at each view state 0-12 gives the owner\'s picture (the task\'s proof: one command script, two pages)', () => {
  /**
   * The owner sets the state (`setZoom`) at frame 0 and walks still; the watched body carries that state from command
   * 100. Each frame the discrete picture is compared -- the readout, the look's divisor, the lens, the reticle's mode, set,
   * tube, night and scope bitmaps, its visibility, the far range -- and once the owner's run has settled (3 s), the FOV,
   * the magnification and the bloom's size too.
   */
  const compare = (record: WeaponRecord | null, state: number, o: { table?: KitTable; kit?: readonly number[]; ownerHands?: FirearmHands; weapon?: number; watcherKit?: readonly number[] | null; bloom?: false } = {}): void => {
    const own = owner({ table: o.table ?? null, kit: o.kit ?? null, extra: o.ownerHands ? { hands: o.ownerHands } : {} });
    const weapon = o.weapon ?? record?.id ?? HELD_RIFLE.id;
    // The kit the room named for the subject (protocol 7): the owner's own, unless the case names another or none.
    const named = o.watcherKit === undefined ? o.kit ?? BAKED_LOADOUT : o.watcherKit;
    const w = watcher({ dead: true, table: o.table ?? null, script: () => bodyOf(state, { weapon }), named });
    own.firearm.setZoom(state);
    for (let f = 0; f < 180; f++) {
      own.frame();
      w.frame();
      const a = picture(own), b = picture(w);
      const discrete = (p: ReturnType<typeof picture>) => ({ ...p, fov: undefined });
      expect(discrete(b), `state ${state}, frame ${f}`).toEqual(discrete(a));
      expect(w.firearm.renderView().farExtra, `state ${state}, frame ${f}`).toBe(own.firearm.renderView().farExtra);
    }
    expect(pictureOf(w), `state ${state}`).toEqual(pictureOf(own));
    expect(w.fly.camera.fov).toBeCloseTo(own.firearm.zoom.fov(own.firearm.baseFov()), 9);
    if (state < BINOCULARS && o.bloom !== false) {
      const [sa, oa] = last(own.log, 'reticle.setSize') as [number, [number, number]];
      const [sb, ob] = last(w.log, 'reticle.setSize') as [number, [number, number]];
      expect(sb, `state ${state}: the bloom at rest`).toBeCloseTo(sa, 6);
      expect(ob).toEqual(oa);
    }
    const [ax, ay] = last(own.log, 'reticle.setAimPoint') as [number, number];
    const [bx, by] = last(w.log, 'reticle.setAimPoint') as [number, number];
    expect(bx).toBeCloseTo(ax, 9);
    expect(by).toBeCloseTo(ay, 9);
  };

  for (let state = 0; state <= 12; state++) {
    it(`state ${state}: the baked M4A1 SD (ZoomMode 1.5, 3): the owner's FOV, readout, lens and reticle`, () => {
      compare(null, state);
    });
  }

  const table = ZWEAPON ? readKitTable(ZWEAPON) : null;
  const sniper = table ? [...table.records.values()].find((r) => itemClass(r.id) === 'sniper' && r.zoomModes.length >= 3) ?? null : null;
  for (let state = 0; state <= 12; state++) {
    it.skipIf(!sniper)(`state ${state}: a sniper off the kit table (three levels) -- and with the thermal scope in the kit${sniper ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
      compare(sniper, state, { table: table!, kit: [sniper!.id, HELD_SIDEARM.id, 121, 126, EMPTY_ITEM] });
      compare(sniper, state, { table: table!, kit: [sniper!.id, HELD_SIDEARM.id, ITEM.THERMAL, 121, EMPTY_ITEM] });
    });
  }

  // PV-7b review F1: the record is the wire's firearm id's (`BodyState.weapon` through the page's table), whatever kit the
  // page holds for the subject -- /testroom's remote stand-in names none, so there it was the side's type-0 kit's.
  for (let state = 0; state <= 12; state++) {
    it.skipIf(!sniper)(`F1 state ${state}: no named kit, the sniper's id on the wire: the sniper's FOV, range and bitmaps${sniper ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
      compare(sniper, state, { table: table!, kit: [sniper!.id, HELD_SIDEARM.id, 121, 126, EMPTY_ITEM], watcherKit: null });
    });
  }

  it.skipIf(!table)(`F1: no named kit and an item up: the side's kit's firearm stands in (states 0-3 read no scope)${table ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
    for (const state of [0, 1, 3]) {
      // `bloom: false`: with the kit table, the owner's bloom under an item closes at the item's own reticle (BLOOM-SWAP,
      // `itemReticleOf`), which the room's cone the lens runs does not (a known limit, reported); set 4 draws the meter.
      compare(null, state, { table: table!, ownerHands: hands({ itemUp: () => true, handItem: () => 121 }), weapon: 121, watcherKit: null, bloom: false });
    }
  });

  it('F1: no named kit and an id no table knows: a guessed scope is not drawn -- first person in its place', () => {
    const unknown = table ? Array.from({ length: 117 }, (_, i) => i + 4).find((id) => !table.records.has(id))! : 120;
    for (const t of [table, null]) {
      const w = watcher({ dead: true, table: t, script: () => bodyOf(5, { weapon: t ? unknown : HELD_RIFLE.id }), named: null });
      w.frame();
      expect([w.firearm.lens(), w.firearm.renderView(), last(w.log, 'hud.setZoom'), last(w.log, 'reticle.setMode')])
        .toEqual([null, { magnification: 1.01, farExtra: 0 }, [0, false], ['reticle']]);
      // with the room's kit named the kit's firearm stands in, scope and all (the slot's record, as before)
      const n = watcher({ dead: true, table: t, script: () => bodyOf(5, { weapon: t ? unknown : HELD_RIFLE.id }) });
      n.frame();
      expect(last(n.log, 'reticle.setMode')).toEqual(['scope']);
    }
  });

  it('an item up (an M67 in the hand): its set 4 and no lens, as the owner\'s page with the grenade up', () => {
    for (const state of [0, 1, 3]) {
      compare(null, state, { ownerHands: hands({ itemUp: () => true, handItem: () => 121 }), weapon: 121 });
    }
    const w = watcher({ dead: true, script: () => bodyOf(1, { weapon: 121 }) });
    w.frame();
    expect(last(w.log, 'reticle.setSet')).toEqual([handReticleType(121, HELD_RIFLE.id, 1, 1.01)]);
  });

  it('a raised launcher (the LAW): the carrier\'s set 3, as the owner\'s with the launcher up', () => {
    compare(null, 1, { ownerHands: hands({ launcherUp: () => true }), weapon: ITEM.LAW });
  });

  it('mounted: the turret\'s id is not on the wire nor in the firearm\'s deps -- the firearm\'s cone and set, named in the report', () => {
    // A head view on a turret is the follow (PV-5b, LATER 897): only third person reaches here.
    const w = watcher({ dead: true, script: () => bodyOf(0) });
    w.frame();
    expect(last(w.log, 'reticle.setSet')).toEqual([handReticleType(null, HELD_RIFLE.id, 0, 1)]);
  });

  it('the muzzle flash: the zoomed animation for the subject\'s own round while it is drawn from the head, as the owner\'s own', () => {
    const onRound = vi.spyOn(Effects.prototype, 'onRound');
    const round = { type: 'round', weapon: { name: 'M4A1', id: 54 }, from: [0, 50, -100], to: [0, 50, 100], hit: false, rounds: 0, normal: null, material: null } as never;
    for (let state = 0; state <= 12; state++) {
      const own = owner();
      own.firearm.setZoom(state);
      own.frame();
      own.firearm.viewLanes(true);                   // the owner's walk lines: the scope's view from the head
      const ownerZoomed = own.walk.view() === 'scope';
      const w = watcher({ dead: true, script: () => bodyOf(state) });
      w.frame();
      onRound.mockClear();
      w.firearm.roundEffects(round, 7);
      w.firearm.roundEffects(round, 8);                 // another body: today's
      expect(onRound.mock.calls.map((c) => c[2]), `state ${state}`).toEqual([ownerZoomed, false]);
      expect(ownerZoomed).toBe(state > 0);
      w.state.drawn = false;
      w.frame();                                         // the view let go: today's for every body
      onRound.mockClear();
      w.firearm.roundEffects(round, 7);
      expect(onRound.mock.calls.map((c) => c[2])).toEqual([false]);
    }
  });
});

describe('PV-7b: the lens\'s ticks', () => {
  it('one tick per whole command crossed, oldest first; none on a frame that crosses none', () => {
    const tick = vi.spyOn(PovLens.prototype, 'tick');
    const seen: number[] = [];
    const w = watcher({ dead: true, script: (k) => { seen.push(k); return bodyOf(0); } });
    w.frame();                                          // the first: one tick, placed at once
    expect(tick).toHaveBeenCalledTimes(1);
    tick.mockClear();
    w.state.cmd += 2.5;                                 // 101 (the frame's own step) -> 103.5: 101, 102, 103
    w.frame();
    expect(tick.mock.calls.map((c) => c[0].view)).toEqual([0, 0, 0]);
    expect(seen.slice(-3)).toEqual([101, 102, 103]);
    tick.mockClear();
    w.state.cmd -= 0.75;                                // 104.5 -> 103.75: no whole command crossed
    w.frame();
    expect(tick).toHaveBeenCalledTimes(0);
  });

  it(`the cap: past ${POV_MAX_TICKS_ADAPTATION} commands in a frame, reset and the newest alone (the lens settles at once)`, () => {
    const tick = vi.spyOn(PovLens.prototype, 'tick');
    const reset = vi.spyOn(PovLens.prototype, 'reset');
    const w = watcher({ dead: true, script: () => bodyOf(5) });
    w.frame();
    tick.mockClear(); reset.mockClear();
    w.state.cmd += POV_MAX_TICKS_ADAPTATION - 1;        // exactly the cap: ticked whole
    w.frame();
    expect([tick.mock.calls.length, reset.mock.calls.length]).toEqual([POV_MAX_TICKS_ADAPTATION, 0]);
    tick.mockClear();
    w.state.cmd += POV_MAX_TICKS_ADAPTATION;            // one past it
    w.frame();
    expect([tick.mock.calls.length, reset.mock.calls.length]).toEqual([1, 1]);
  });

  it('reset on a change of the clock\'s epoch or of the subject\'s id; not otherwise', () => {
    const reset = vi.spyOn(PovLens.prototype, 'reset');
    const w = watcher({ dead: true, script: () => bodyOf(5) });
    w.frame(); w.frame();
    const before = reset.mock.calls.length;
    w.state.epoch = 2;
    w.frame();
    expect(reset.mock.calls.length).toBe(before + 1);
    w.frame();
    expect(reset.mock.calls.length).toBe(before + 1);
    w.state.id = 9;
    w.frame();
    expect(reset.mock.calls.length).toBe(before + 2);
  });

  it('the inputs: the body\'s view, look, velocity, flags, stance, kit (the firearm slot\'s record, the item, the thermal)', () => {
    const tick = vi.spyOn(PovLens.prototype, 'tick');
    const w = watcher({ dead: true, script: () => bodyOf(5, { yaw: 30, pitch: -4, vx: 1, vy: 2, vz: 3, stance: 1, slot: 1, weapon: 121, flags: BodyFlag.Alive | BodyFlag.Airborne | BodyFlag.Trigger }) });
    w.remote.setKit(7, [HELD_RIFLE.id, HELD_SIDEARM.id, ITEM.THERMAL, 121, EMPTY_ITEM]);
    w.frame();
    const input = tick.mock.calls[0]![0];
    expect(input).toMatchObject({
      view: 5, yaw: 30, pitch: -4, velocity: [1, 2, 3], alive: true, airborne: true, trigger: true, posture: 'crouch',
      thermal: true, itemUp: true, mapNight: false, spawns: 0,
    });
    expect(input.record.id).toBe(HELD_SIDEARM.id);       // the selected FIREARM slot's record, never the item's
    expect(input.coneRecord).toBe(input.record);
  });

  it('a subject\'s round blooms its lens once the clock has run past the body that carried it; another\'s never', () => {
    const shot = vi.spyOn(PovLens.prototype, 'shot');
    const w = watcher({ dead: true, script: (k) => (k <= 106 ? bodyOf(1) : null) });   // bodies kept to 106
    w.frame();                                           // at 100
    const round = { type: 'round', weapon: { name: 'M4A1', id: 54 }, from: [0, 50, -100], to: [0, 50, 100], hit: false, rounds: 0, normal: null, material: null } as never;
    w.state.script = (k) => (k <= 106 ? bodyOf(1) : null);
    w.firearm.roundEffects(round, 7);
    w.firearm.roundEffects(round, 8);
    for (let f = 0; f < 5; f++) w.frame();               // 101-105: not yet past 106
    expect(shot).toHaveBeenCalledTimes(0);
    w.frame();                                           // 106
    expect(shot).toHaveBeenCalledTimes(1);
    for (let f = 0; f < 5; f++) w.frame();
    expect(shot).toHaveBeenCalledTimes(1);
  });
});

describe('PV-7b: what the subject\'s view hides and what stays the watcher\'s', () => {
  it('hidden: the pip, the target and its colour, the threat marks, the meter; the bob off; the watcher\'s kit offset never written', () => {
    const w = watcher({ dead: true, script: () => bodyOf(5) });
    w.frame();                                           // drawn from this frame's net on: what follows is the subject's
    w.log.length = 0;
    for (let f = 0; f < 30; f++) w.frame();
    expect(calls(w.log, 'fly.setKitOffset')).toEqual([]);
    expect(calls(w.log, 'fly.setBody').every((a) => a[0] === false)).toBe(true);
    expect(calls(w.log, 'reticle.setThreatGate').every((a) => a[0] === false)).toBe(true);
    expect(calls(w.log, 'reticle.setPip').every((a) => a[0] === null)).toBe(true);
    expect(calls(w.log, 'reticle.setTarget').every((a) => a[0] === null && a[1] === null)).toBe(true);
    expect(calls(w.log, 'reticle.setColour').every((a) => a[0] === 'rest')).toBe(true);
    expect(calls(w.log, 'reticle.setMeter').every((a) => a[0] === 0)).toBe(true);
    expect(w.firearm.reticle.state().pip.alpha).toBe(0);
    expect(last(w.log, 'reticle.setVisible')).toEqual([true]);
  });

  it('review F2: every screen that hides the watcher\'s reticle hides the subject\'s -- the ARMORY, the tactical map, the scoreboard, a round screen', () => {
    const screen = { armory: false, round: false };
    const w = watcher({
      dead: true, script: () => bodyOf(1),
      // the pages' `blocked` (the ARMORY among them) and the round screens (`NetPage.screenUp`)
      extra: { blocked: () => screen.armory, net: () => (screen.round ? { screenUp: () => true } : null) as never },
    });
    w.frame();
    // `spawned` as `./main` hands it: `pageSpawned` -- false under the ARMORY, and for a page the room never spawned
    const shown = (o: { tacMap?: boolean; scoreboard?: boolean; spawned?: boolean }): unknown => {
      w.firearm.showReticle(PS2, false, o.tacMap ?? false, o.scoreboard ?? false, o.spawned ?? !screen.armory);
      return last(w.log, 'reticle.setVisible')![0];
    };
    expect(shown({})).toBe(true);
    expect(shown({ spawned: false })).toBe(true);            // a spectator the room never spawned: the subject's view shows
    screen.armory = true;
    expect(shown({})).toBe(false);                            // the ARMORY (PAR-94 B2)
    screen.armory = false;
    expect(shown({ tacMap: true })).toBe(false);
    expect(shown({ scoreboard: true })).toBe(false);
    screen.round = true;
    expect(shown({})).toBe(false);
    screen.round = false;
    expect(shown({})).toBe(true);
  });

  it('kept the watcher\'s: its own zoom and bloom tick, and nothing of the subject reaches its fire', () => {
    const w = watcher({ dead: false, script: () => bodyOf(5) });
    const zoomUpdate = vi.spyOn(w.firearm.zoom, 'update'), accUpdate = vi.spyOn(w.firearm.accuracy, 'update');
    for (let f = 0; f < 10; f++) w.frame();
    expect(zoomUpdate).toHaveBeenCalledTimes(10);       // the watcher's own `Zoom` runs on (not walking: 0)
    expect(w.firearm.zoom.state()).toBe(0);
    expect(accUpdate).toHaveBeenCalledTimes(0);         // not walking: no bloom tick, as before
    expect(w.firearm.zoom.renderView().farExtra).toBe(0);
    expect(w.firearm.renderView().farExtra).toBeGreaterThan(0);   // the page's reader: the subject's scope
  });
});

describe('PV-7b: firearm.renderView() -- the world frame\'s reader (main.ts, matchMount.ts; PF-29\'s pin moved to it)', () => {
  it('no subject set: the page\'s own zoom\'s at each of its view states; the subject\'s lens\'s while set; the page\'s again the frame after', () => {
    const own = owner();
    for (let state = 0; state <= 12; state++) {
      own.firearm.setZoom(state);
      for (let f = 0; f < 3; f++) {
        own.frame();
        expect(own.firearm.renderView(), `state ${state}`).toEqual(own.firearm.zoom.renderView());
      }
    }
    const w = watcher({ dead: true, script: () => bodyOf(5) });
    w.frame();
    expect(w.firearm.renderView()).toEqual({ magnification: 3, farExtra: 300 });   // the subject's 3x scope (ZoomMode 3)
    expect(w.firearm.renderView()).not.toEqual(w.firearm.zoom.renderView());
    w.state.drawn = false;
    w.frame();
    expect(w.firearm.renderView()).toEqual(w.firearm.zoom.renderView());
  });
});

describe('PV-7b: on -> off -> on, and the goggles\' sound', () => {
  it('leaving: the same frame the FOV is the watcher\'s own through the one writer, the lens, readout, range and reticle the watcher\'s', () => {
    const w = watcher({ dead: true, script: () => bodyOf(5) });
    for (let f = 0; f < 5; f++) w.frame();
    const on = pictureOf(w);
    expect(on.fov).toBeLessThan(w.firearm.baseFov() - 1);
    expect(on.readout).toEqual([3, false]);
    expect(on.render).toEqual({ magnification: 3, farExtra: 300 });   // the far range and the detail: the subject's scope
    w.state.drawn = false;
    // The frame the view is let go: the gun first (the subject still set), then PV-5b's undraw -- `setPose` and null.
    const mark = w.log.length;
    w.frame();
    expect(w.fly.camera.fov).toBeCloseTo(w.firearm.zoom.fov(w.firearm.baseFov()), 9);
    const fovs = calls(w.log.slice(mark), 'fly.setFov');
    expect(fovs.at(-1)![0]).toBeCloseTo(w.firearm.baseFov(), 9);   // the last FOV write this frame: the watcher's
    const off = pictureOf(w);
    expect(off.lens).toBeNull();
    expect(off.readout).toEqual([0, false]);
    expect(off.render).toEqual(w.firearm.zoom.renderView());
    expect(off.render).toEqual({ magnification: 1, farExtra: 0 });   // the watcher's own (dead: third person)
    expect(off.visible).toEqual([false]);               // a dead watcher's reticle: hidden, as before
    expect(calls(w.log, 'reticle.setThreatGate').at(-1)).toEqual([false, true]);
    for (let f = 0; f < 3; f++) w.frame();
    expect(pictureOf(w)).toEqual(off);
    w.state.drawn = true;
    w.state.cmd += 600;                                  // back much later: the lens settles at once
    w.frame();
    const again = pictureOf(w);
    for (const k of Object.keys(on) as (keyof typeof on)[]) expect(again[k], k).toEqual(on[k]);
  });

  it('into a view already in night vision: no goggles sound; the subject\'s own switches while drawn: their sound; out: none', () => {
    let view = 3;
    const w = watcher({ dead: true, script: () => bodyOf(view) });
    w.frame();
    expect(w.firearm.lens()).toBe('goggles');
    expect(calls(w.log, 'sound.goggles')).toEqual([]);
    expect(calls(w.log, 'refreshFog').length).toBe(1);   // the fog follows the lens whoever's it is
    view = 1;
    w.frame();
    expect(calls(w.log, 'sound.goggles')).toEqual([[false]]);
    view = 3;
    w.frame();
    expect(calls(w.log, 'sound.goggles')).toEqual([[false], [true]]);
    w.state.drawn = false;
    w.frame();
    expect(w.firearm.lens()).toBeNull();
    expect(calls(w.log, 'sound.goggles')).toEqual([[false], [true]]);
    expect(calls(w.log, 'refreshFog').length).toBe(4);
    w.state.id = 9;                                       // another subject already in night vision: no sound
    w.state.drawn = true;
    w.frame();
    expect(calls(w.log, 'sound.goggles')).toEqual([[false], [true]]);
  });

  it("let go at the page's own spawn (the walk already walking when PV-5b's undraw runs): the fog follows, no goggles' sound", () => {
    const w = watcher({ dead: true, script: () => bodyOf(3) });
    w.frame();
    expect(w.firearm.lens()).toBe('goggles');
    const mode = vi.spyOn(w.walk, 'mode').mockReturnValue('walk');   // the spawn's event: the walk stood again first
    const fog = calls(w.log, 'refreshFog').length;
    w.undraw();
    expect(w.firearm.lens()).toBeNull();
    expect(calls(w.log, 'refreshFog').length).toBe(fog + 1);
    expect(calls(w.log, 'sound.goggles')).toEqual([]);
    // and the next walking frame: the walker's own, nothing stepped, nothing heard
    vi.spyOn(w.walk, 'snapshot').mockReturnValue(STILL);
    w.firearm.gunFrame(DT, true);
    expect(calls(w.log, 'sound.goggles')).toEqual([]);
    expect(w.fly.camera.fov).toBeCloseTo(w.firearm.baseFov(), 9);
    mode.mockRestore();
  });

  it("dropped by a frame with no subject handed while the page walks: no goggles' sound either", () => {
    const w = watcher({ dead: true, script: () => bodyOf(3) });
    w.frame();
    vi.spyOn(w.walk, 'mode').mockReturnValue('walk');
    vi.spyOn(w.walk, 'snapshot').mockReturnValue(STILL);
    w.firearm.gunFrame(DT, true);
    w.firearm.gunFrame(DT, true);                         // the second: none handed since the first -- let go
    expect(w.firearm.lens()).toBeNull();
    expect(calls(w.log, 'sound.goggles')).toEqual([]);
  });

  it('a page that stops handing the subject (no undraw ran: the net let go): the next frame is a null one', () => {
    const w = watcher({ dead: true, script: () => bodyOf(5) });
    w.frame();
    expect(w.firearm.renderView().farExtra).toBeGreaterThan(0);
    w.firearm.gunFrame(DT, false);                        // a frame with no net
    w.firearm.gunFrame(DT, false);
    expect(w.firearm.renderView()).toEqual(w.firearm.zoom.renderView());
    expect(w.firearm.lens()).toBeNull();
    expect(w.fly.camera.fov).toBeCloseTo(w.firearm.baseFov(), 9);
  });
});

// ---- the seam's two lines in PV-5b's dep (`./matchNet` `spectatePov`, `povUndraw`) ----

/**
 * `./matchNetPov.test.ts`'s `page` fakes, cut to what the seam reads: a scripted net (`PovNet`), the camera's writes and
 * the firearm's `setSubjectView` recorded in one ordered list.
 */
function netPage(script: (k: number) => BodyState | null, life?: (k: number) => number | null) {
  const writes: { name: string; args: unknown[] }[] = [];
  const rec = (name: string) => (...args: unknown[]): void => { writes.push({ name, args }); };
  const clock = { cmd: 40.5, epoch: 3 };
  let mode: 'walk' | 'fly' = 'fly';
  const net: PovNet = {
    setCommandClockBody: () => {},
    commandClock: () => clock,
    bodyAtCommand: (k) => (k <= Math.floor(clock.cmd) && k >= Math.floor(clock.cmd) - 20 ? script(k) : null),
    ...(life ? { lifeAtCommand: life } : {}),
  };
  const p = {
    caps: TESTROOM_CAPABILITIES,
    walk: { gridOfGround: () => null, mode: () => mode } as unknown as NetPageDeps['walk'],
    remote: { cameraRoot: () => null, setPovHidden: rec('setPovHidden'), mounted: () => false } as unknown as NetPageDeps['remote'],
    hud: {} as NetPageDeps['hud'],
    fly: {
      setPose: rec('setPose'), placeView: rec('placeView'), setViewNear: rec('setViewNear'), setSubjectOffset: rec('setSubjectOffset'),
      aspect: () => 16 / 9,
    },
    loadouts: { picks: () => [], type: () => 0, seated: () => null, setType: () => true, unseated: () => {}, roomAnswer: () => {} },
    firearm: {
      records: () => [], roundEffects: () => {}, roundImpact: () => {}, died: () => {}, spawnKit: () => {},
      fire: { undoReload: () => true, restoreReload: () => true, refundRound: () => true },
      setSubjectView: rec('setSubjectView'),
    },
    clips: () => null, map: () => ({ scenicViews: [], arsenal: null }) as never, side: () => 'seal', followTeam: () => {}, menuOpen: () => false,
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
  const b = script(Math.floor(clock.cmd))!;
  const drawn: SpectatorBody = { id: b.id, feet: b.feet, yaw: b.yaw, flags: b.flags, pitch: b.pitch, stance: b.stance, peek: b.peek, travRootY: b.travRootY };
  return { d, net, writes, clock, drawn, setMode: (m: 'walk' | 'fly') => { mode = m; } };
}

describe('PV-7b: the seam in PV-5b\'s dep -- the subject handed after the camera is placed, null after the undraw\'s setPose', () => {
  const script = (k: number): BodyState | null => bodyOf(5, { feet: [0, 0, 10 + k] });

  it('a drawn frame: placeView, then the subject -- his id, the clock\'s time and epoch, the net\'s bodies and the rig\'s pose', () => {
    const g = netPage(script);
    expect(g.d.spectatePov!(g.drawn, DT, true)).toBe(true);
    const names = g.writes.map((w) => w.name);
    expect(names.indexOf('placeView')).toBeLessThan(names.indexOf('setSubjectView'));
    const s = g.writes.find((w) => w.name === 'setSubjectView')!.args[0] as SubjectView;
    expect([s.id, s.cmd, s.epoch]).toEqual([7, 40.5, 3]);
    expect(s.at(40)).toEqual(script(40));
    expect(s.at(41)).toBeNull();                         // ahead of the clock: as the net has it
    expect(s.spawns(40)).toBe(0);                        // a live client's body carries no spawn count: 0
    const placed = g.writes.find((w) => w.name === 'placeView')!.args;
    expect([s.pose.eye, s.pose.target]).toEqual([placed[0], placed[1]]);
  });

  it('LATER 1015: the lens is handed the seat spawn count the client keeps (lifeAtCommand), so a spawn with no death is a spawn to it', () => {
    const lives = (k: number): number | null => (k <= 40 && k >= 20 ? (k >= 35 ? 6 : 5) : null);
    const g = netPage(script, lives);
    expect(g.d.spectatePov!(g.drawn, DT, true)).toBe(true);
    const s = g.writes.find((w) => w.name === 'setSubjectView')!.args[0] as SubjectView;
    expect([s.spawns(30), s.spawns(34), s.spawns(35), s.spawns(40)]).toEqual([5, 5, 6, 6]);   // the client's count, at each command
    expect(s.spawns(41)).toBe(0);                        // none kept there: 0, as before
  });

  it('the first frame not drawn: PV-5b\'s give-back with setPose first and null last; nothing on a frame with nothing drawn', () => {
    const g = netPage(script);
    g.d.spectatePov!(g.drawn, DT, true);
    g.writes.length = 0;
    g.d.spectatePovWarm!(g.drawn, DT, true);             // the sub-mode turned off: the warm call gives the view back
    expect(g.writes.map((w) => (w.name === 'setSubjectView' ? `setSubjectView(${String(w.args[0])})` : w.name)))
      .toEqual(['setPose', 'setViewNear', 'setSubjectOffset', 'setPovHidden', 'setSubjectView(null)']);
    g.writes.length = 0;
    g.d.spectatePovWarm!(g.drawn, DT, true);
    g.d.spectateFollowReset!();
    expect(g.writes.filter((w) => w.name === 'setSubjectView')).toEqual([]);
  });

  it('review F4: the reset with no view drawn (a no-body frame never drawn) touches nothing -- near plane, offset, hide, the subject', () => {
    const g = netPage(script);
    g.d.spectatePovWarm!(g.drawn, DT, true);             // the rig warmed, never drawn
    g.writes.length = 0;
    g.d.spectatePovReset!();
    expect(g.writes).toEqual([]);
    g.d.spectatePov!(g.drawn, DT, true);                 // drawn, then the body gone: the reset gives it all back
    g.writes.length = 0;
    g.d.spectatePovReset!();
    expect(g.writes.map((w) => (w.name === 'setSubjectView' ? `setSubjectView(${String(w.args[0])})` : w.name)))
      .toEqual(['setPose', 'setViewNear', 'setSubjectOffset', 'setPovHidden', 'setSubjectView(null)']);
  });

  it('a walking page: the view is never drawn, so no subject is ever handed', () => {
    const g = netPage(script);
    g.setMode('walk');
    for (let i = 0; i < 5; i++) { g.clock.cmd += 1; expect(g.d.spectatePov!(g.drawn, DT, true)).toBe(false); }
    expect(g.writes.filter((w) => w.name === 'setSubjectView' && w.args[0] !== null)).toEqual([]);
  });
});
