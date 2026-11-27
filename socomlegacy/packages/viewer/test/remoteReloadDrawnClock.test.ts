// test/remoteReloadDrawnClock.test.ts -- RELOAD-HITPOSE's review F1 (ONE-CLOCK; a browser adaptation -- the page's
// interpolation has no original): another body's reload is heard from the room's `reloadSound` at the take, about one interpolation delay
// (`INTERP_DELAY_MS`, `NetClient.viewTick`) before the page draws that body at the take's tick, and the room's poser is
// judged at the shooter's drawn tick (`room.ts` `drawnPastOf`). A rendered run measured the page's drawn reload 4.3-4.9
// ticks AHEAD of the room's judged pose, the bone gap up to 3.4 u. So the page stamps each such event with the newest
// snapshot tick in hand when it came (`NetClient.heardTick`, the `markSpawn` / `spawnsAt` pattern) and `RemotePlayers`
// releases it, in order, once the DRAWN tick (`NetClient.shownTick`, handed to `frame`) passes the mark -- the reload
// started with its clip run on by the drawn ticks past the mark; a flinch's reload stop and a death's after it. An event
// with no mark is released at once (the earlier behaviour, for every other caller). The real `RemotePlayers` runs; the
// body's view and `Play` are stand-ins (as `remotePlayers.test.ts`), the stand-in `Play` holding a reload as the real
// one's `stopRemoteReload` decides (a death any; a flinch only a crouched or prone still clip, `WeaponPose.stillHeld`).
import { describe, expect, it, vi } from 'vitest';
import { Group, PerspectiveCamera, Scene } from 'three';
import { partMatrix, type MotionClip, type MotionPart } from '@s2u/scene';
import { RemotePlayers } from '../src/remotePlayers';
import { WeaponPose } from '../src/weaponPose';
import type { BodyView } from '../src/bodyView';
import type { LoadedBody } from '../src/body';
import type { PlaySnapshot } from '../src/mover';
import type { LoadedMap } from '../src/loadMap';
import { BodyFlag, TICK_HZ, type BodyState } from '../src/net/protocol';
import { DEFAULT_LIGHTING } from '../src/lighting';

type Held = { posture: string | null; seconds: number; family: string | null; moving: boolean; startAt: number };
const output = vi.hoisted(() => ({ plays: [] as { reload: Held | null }[] }));
vi.mock('../src/bodyView', () => ({
  buildBody: () => ({ group: new Group(), dispose: () => {}, stats: { fittingNames: [] }, setGearVisible: () => false }),
}));
vi.mock('../src/play', async () => { const { Group: G } = await import('three'); return { Play: class {
  reload: Held | null = null;
  launcher = new G(); hand = new G();
  constructor() { output.plays.push(this); }
  launcherNode() { return this.launcher; }
  heldNode() { return this.hand; }
  setRifleStowed() {} stopVictory() {}
  setBody() {} setFlyToggle() {} setClips() {} setWeaponInput() {} setItem() {} setMounts() {}
  setWeapon() {} setSidearm() {} addPoseLayer() {} motionSource() { return null; } onEvent() {}
  respawn() { this.reload = null; }
  remoteReload(posture: string | null, seconds: number, family: string | null, moving: boolean, startAt?: number) {
    this.reload = { posture, seconds, family, moving, startAt: startAt ?? 0 };
  }
  stopRemoteReload(why: 'death' | 'flinch') {
    const r = this.reload;
    if (why === 'flinch' && !(r && !r.moving && (r.posture === 'crouch' || r.posture === 'prone'))) return;
    this.reload = null;
  }
  frame() {}
  animStats() { return null; }
} }; });

const ID = 3;
const state = (alive = true): BodyState => ({
  id: ID, feet: [0, 0, 0], yaw: 0, pitch: 0, vx: 0, vy: 0, vz: 0,
  flags: alive ? BodyFlag.Alive : 0, stance: 0, landing: 0, jumps: 0,
  ground: 0, groundForward: 0, groundRight: 0, groundCls: -1, stickSnaps: 0,
  action: 0, actionSerial: 0, actionT: 0, actionSeconds: -1,
  overlay: 0, overlayT: 0, overlaySeconds: 0, turnRate: 0,
  trav: 0, travFrame: 0, travRootY: Number.NaN, travBlend: 0, travBlendWeight: 0, peek: 0, weapon: 255, slot: 0,
});

/** The take's tick as heard: the newest snapshot tick in hand when the `reloadSound` came (`NetClient.heardTick`). */
const T = 100;
/** The page draws the others about six ticks behind what it has heard (`INTERP_DELAY_MS` at `TICK_HZ`). */
const BEHIND = 6;
const CROUCH = { posture: 'crouch' as const, seconds: 1.9, family: 'rifle' as const, moving: false };

/**
 * The calls with the mark and the drawn tick, written through `unknown` so the file compiles against the signatures
 * before the fold (`reload(id, take)`, `flinch(id, clip)`, `died(id, clip)`, `frame(dt, bodies, camera, real)`) and fails
 * on the behaviour.
 */
type Marked = {
  reload(id: number, take: typeof CROUCH | { seconds: number }, mark?: number | null): void;
  flinch(id: number, clip: string, mark?: number | null): void;
  died(id: number, clip: string | null, mark?: number | null): void;
  frame(dt: number, bodies: readonly BodyState[], camera: PerspectiveCamera, real?: number, drawnTick?: number | null): void;
};

function rig(built = true) {
  const remote = new RemotePlayers(new Scene()), camera = new PerspectiveCamera();
  remote.setMap({ body: {} } as LoadedMap, DEFAULT_LIGHTING, null);
  const marked = remote as unknown as Marked;
  let drawn = T - BEHIND - 1;
  /** One frame at the next drawn tick (or at `at`); the body's play's reload after it. */
  const frame = (at = drawn + 1, alive = true): Held | null => {
    drawn = at;
    marked.frame(1 / TICK_HZ, [state(alive)], camera, 1 / TICK_HZ, drawn);
    return output.plays.at(-1)!.reload;
  };
  if (built) frame();                                            // drawn T - 6: the body built
  return { remote, marked, frame, drawn: () => drawn };
}

describe('RELOAD-HITPOSE F1 (ONE-CLOCK): another body\'s reload starts on the drawn clock, at the mark it was heard under', () => {
  it('heard at T while drawn at T - 6: none until the drawn tick passes T, then the clip run on by the drawn ticks past T', () => {
    const { marked, frame, drawn } = rig();
    marked.reload(ID, CROUCH, T);
    expect(frame(T - BEHIND)).toBeNull();                         // the same drawn tick: not yet (today: started at once)
    for (let at = T - BEHIND + 1; at <= T; at++) expect(frame(at), `drawn ${at}`).toBeNull();
    const held = frame(T + 0.5);
    expect(held).not.toBeNull();
    expect(held).toMatchObject({ posture: 'crouch', seconds: 1.9, family: 'rifle', moving: false });
    expect(held!.startAt).toBeCloseTo((drawn() - T) / TICK_HZ, 6);
  });

  it('a flinch marked after the reload, on a crouched still take, releases after it and ends it', () => {
    const { marked, frame } = rig();
    marked.reload(ID, CROUCH, T);
    marked.flinch(ID, 'seal_crouch_flinch_front', T + 3);
    expect(frame()).toBeNull();
    expect(frame(T + 1)).not.toBeNull();                           // the reload drawn (today: the flinch ended it at once)
    expect(frame(T + 2)).not.toBeNull();
    expect(frame(T + 3)).not.toBeNull();
    expect(frame(T + 4)).toBeNull();                               // the flinch's stop, at its own mark
  });

  it('a death drops a queued reload: under the same mark it never starts; under a later one it is cut at the drawn death', () => {
    const same = rig();
    same.marked.reload(ID, CROUCH, T);
    same.marked.died(ID, 'death_stand_chest01', T);
    for (let at = T - BEHIND; at <= T + 10; at++) expect(same.frame(at), `drawn ${at}`).toBeNull();

    const later = rig();
    later.marked.reload(ID, CROUCH, T);
    later.marked.died(ID, 'death_stand_chest01', T + 3);
    expect(later.frame(T)).toBeNull();
    expect(later.frame(T + 1)).not.toBeNull();                     // drawn alive and reloading until the drawn death
    expect(later.frame(T + 3)).not.toBeNull();
    expect(later.frame(T + 4)).toBeNull();
    later.marked.reload(ID, CROUCH, T + 5);                        // nothing heard after the death starts on the corpse
    for (let at = T + 5; at <= T + 9; at++) expect(later.frame(at, false), `drawn ${at}`).toBeNull();
  });

  it("G3: a reload and a flinch, both marked, for a body not drawn yet: the copy drawn inside the clip has it ended at the flinch's mark", () => {
    const { marked, frame } = rig(false);
    marked.reload(ID, CROUCH, T);
    marked.flinch(ID, 'seal_crouch_flinch_front', T + 3);
    expect(frame(T + 1)).not.toBeNull();                           // first drawn inside the clip: the reload released
    expect(frame(T + 2)).not.toBeNull();
    expect(frame(T + 3)).not.toBeNull();
    expect(frame(T + 4)).toBeNull();                               // the crouched still clip ended, as the room ended it
  });

  it('a reload heard with no mark starts at once, as before (every caller that names none)', () => {
    const { marked, frame } = rig();
    marked.reload(ID, CROUCH);
    expect(output.plays.at(-1)!.reload).toMatchObject({ posture: 'crouch', startAt: 0 });
    expect(frame()).not.toBeNull();
  });

  it('the queue goes with the seat: a reload heard before `forget` never starts on the body built again', () => {
    const { remote, marked, frame } = rig();
    marked.reload(ID, CROUCH, T);
    remote.forget(ID);
    for (let at = T - BEHIND; at <= T + 4; at++) expect(frame(at), `drawn ${at}`).toBeNull();
  });
});

/**
 * The delta review's G1: the run-on on the REAL layer -- `WeaponPose.startReload(..., startAt)` starts the clip's clock at
 * `startAt` (its `stats().reloadFrame` the key at that time, not 0), and `Play.remoteReload` passes it through
 * (`play.ts` `remoteReload`). This file mocks `../src/play` for `RemotePlayers`; the real one is taken by `importActual`,
 * on `remoteReload.test.ts`'s headless rig (a stand-in view and a synthetic body).
 */
describe('RELOAD-HITPOSE F1 (G1): the start offset reaches the real reload layer', () => {
  const still = (name: string, frames: number): MotionClip => ({
    name, version: 5, duration: frames / 30, frameCount: frames, rate: 30, unknown10: -1, unknown14: 1,
    parts: [{ index: 0, name: 'skel_root', flags: 0x3c, translations: Float32Array.of(0, 11, 0), rotations: Float32Array.of(0, 0, 0, 1) }] as MotionPart[],
  });
  const N = 57, PERIOD = 1.9, START = 0.5;
  /** A still clip's key at `t` with no table (`weaponPose.ts` `frameOf` / `phaseOf`): end (n-1)/n, phase t / (period x end). */
  const keyAt = (t: number): number => { const end = (N - 1) / N; return Math.min(N - 1, Math.min(end, t / (PERIOD * end)) * N); };

  it("WeaponPose: the clip's time and its reloadFrame start at startAt, not 0", () => {
    const pose = new WeaponPose(new Map([['seal_crouch_reload', still('seal_crouch_reload', N)]]), null);
    const t = (): number | undefined => (pose as unknown as { reload: { t: number } | null }).reload?.t;
    pose.startReload('crouch', PERIOD, 'rifle', false);
    expect(t()).toBe(0);
    expect(pose.stats().reloadFrame).toBe(0);
    pose.startReload('crouch', PERIOD, 'rifle', false, START);
    expect(pose.stats().reload).toBe('seal_crouch_reload');
    expect(t()).toBe(START);
    expect(pose.stats().reloadFrame).toBeCloseTo(keyAt(START), 9);
    expect(pose.stats().reloadFrame).toBeGreaterThan(0);
  });

  it('Play.remoteReload passes startAt through to its layer', async () => {
    const { Play } = await vi.importActual<typeof import('../src/play')>('../src/play');
    const BODY = {
      character: null, model: 'test', dressedBy: 'test', subMeshes: [], fittings: [], missing: [], at: null, height: 20, eye: null,
      parts: [
        { name: 'skel_root', parent: -1, bindLocal: Array.from(partMatrix([0, 0, 0, 1], [0, 11, 0])), bbox: [] },
        { name: 'rhand', parent: 0, bindLocal: Array.from(partMatrix([0, 0, 0, 1], [2, 4, 0])), bbox: [] },
      ],
    } as unknown as LoadedBody;
    const snap = {
      feet: [0, 0, 0], yaw: 0, pitch: 0, vx: 0, vz: 0, vy: 0, airborne: false, crouched: true, stance: 'crouch',
      landing: null, jumps: 0, ground: { state: 'idle', forward: 0, right: 0, cls: -1 }, action: null, turnRate: 0,
      cutStick: { forward: 0, right: 0 },
    } as unknown as PlaySnapshot;
    const view = { group: new Group(), setVisible(on: boolean) { this.group.visible = on; }, place: () => undefined, setPose: () => undefined, setGearVisible: () => false, addProp: () => new Group() };
    const play = new Play();
    play.setBody(view as unknown as BodyView, BODY);
    play.setClips({ clips: [still('seal_stand', 10), still('seal_crouch', 10), still('seal_crouch_reload', N)], table: null });
    play.frame(1 / TICK_HZ, { snapshot: () => snap, view: () => 'third' as const, isDead: () => false } as never, new PerspectiveCamera());
    play.remoteReload('crouch', PERIOD, 'rifle', false, START);
    const stats = play.weaponStats().pose;
    expect(stats?.reload).toBe('seal_crouch_reload');
    expect(stats?.reloadFrame).toBeCloseTo(keyAt(START), 9);
  });
});
