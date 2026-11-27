// test/hostageFlinchPage.test.ts -- LATER 1186 (research 447 s9.1): the page's side of a hostage's flinch. Its stand-ins
// are `remotePlayers.test.ts`'s (copied: a body's view and `Play`), the header below theirs. Was:
// test/remotePlayers.test.ts -- PAR-41 (PARITY-2; RE-5's dev read, `./devSeen`): what the development instrument reads
// of the others' bodies goes through `RemotePlayers.seenForDev`, a public read-only accessor, not the class's private
// fields by a cast -- so a rename inside the class is a type error, not a broken read in the browser. A copy of each
// drawn body's fields (its group the node drawn, read never written), the ghosts and the gear asked by id. A browser
// adaptation: a playtest instrument with no original, changing nothing the game does. The real `RemotePlayers` runs;
// only the body's view and `Play` are stand-ins (no body on disc here), as in `remoteDeath.test.ts`.
import { describe, expect, it, vi } from 'vitest';
import { Group, PerspectiveCamera, Scene, type Object3D } from 'three';
import { DEFAULT_GRID_PARAMS } from '@s2u/scene';
import * as remotePlayers from '../src/remotePlayers';
import { firstLauncher, RemotePlayers, type HeldRef, type SeenRemoteBody, type SideKit } from '../src/remotePlayers';
import type { LoadedMap } from '../src/loadMap';
import * as heldItem from '../src/heldItem';
import type { Mount } from '../src/heldItem';
import type { PlaySnapshot } from '../src/mover';
import { ACTION_CODES, BodyFlag, type BodyState, type Team } from '../src/net/protocol';
import { DEFAULT_LIGHTING } from '../src/lighting';
import type { LoadedBody } from '../src/body';

/**
 * NU-6 (research 324 §6 P1): what each body's stand-in `Play` was handed -- the firearms hung (`setWeapon` /
 * `setSidearm`), the item and the mounts each frame, the snapshot it played, and the body each view was built from.
 */
/** NU-6 F2: the stub callback's `launcher` -- the kit's first rocket launcher's model, named for its id, or null. */
const launcherRef = (k: readonly number[]): HeldRef | null => {
  const id = firstLauncher(k);
  if (id === null) return null;
  const g = new Group(); g.name = `model${id}`;
  return { object: g, points: [] };
};

const output = vi.hoisted(() => ({
  weapons: [] as (Object3D | null)[], sidearms: [] as (Object3D | null)[], items: [] as string[],
  mounts: [] as { rifle: string; pistol: string }[], snapshots: [] as unknown[], bodies: [] as unknown[],
  /** NU-6 P2, P3: each stand-in `Play` made (its `launcher` node on spinehi, its hand's node), and its stowed rifle. */
  plays: [] as { launcher: Object3D; hand: Object3D }[], stowed: [] as boolean[],
  /** NU-12 B2: each stand-in `Play`'s rebuilds (`respawn`), by its index in `plays`; the clip source its layers read. */
  respawns: [] as number[], sources: [] as unknown[],
  /** REMOTE-RELOAD: each stand-in `Play`'s `remoteReload` (its index, then the arguments) and `stopRemoteReload` (its index). */
  reloads: [] as unknown[][], reloadStops: [] as unknown[][],
}));
vi.mock('../src/bodyView', () => ({
  buildBody: (loaded: unknown) => {
    output.bodies.push(loaded);
    const group = new Group(), satchel = new Group(), hips = new Group(), head = new Group();
    satchel.name = 'Satchel';
    satchel.visible = false;                                      // `HIDDEN_AT_SPAWN`: shown only when asked
    group.add(satchel);
    // NU-9 T2: a bone named `head` under another, as `buildBody` names each bone by its part (`bodyView.ts`).
    hips.name = 'hips'; head.name = 'head';
    hips.position.set(0, 30, 0); head.position.set(0, 25, 2);
    hips.add(head); group.add(hips);
    return {
      group, dispose: () => {}, stats: { fittingNames: ['Satchel', 'Absent'] },
      setGearVisible: (name: string, on: boolean) => { const n = group.getObjectByName(name); if (n) n.visible = on; },
    };
  },
}));
vi.mock('../src/play', async () => { const { Group: G } = await import('three'); return { Play: class {
  launcher = Object.assign(new G(), { name: 'launcher' });
  hand = Object.assign(new G(), { name: 'rifle' });
  constructor() { output.plays.push(this); }
  launcherNode() { return this.launcher; }
  heldNode() { return this.hand; }
  setRifleStowed(on: boolean) { output.stowed.push(on); }
  stopVictory() {}
  setBody() {} setFlyToggle() {} setClips() {} setWeaponInput() {} setAnimSet() {}   // LATER 1186: the escortee path's
  setItem(item: string) { output.items.push(item); }
  setMounts(m: { rifle: string; pistol: string }) { output.mounts.push({ ...m }); }
  setWeapon(o: Object3D | null) { output.weapons.push(o); }
  setSidearm(o: Object3D | null) { output.sidearms.push(o); }
  addPoseLayer() {} motionSource() { return output.sources[0] ?? null; } onEvent() {}
  respawn() { output.respawns.push(output.plays.indexOf(this)); }
  remoteReload(...args: unknown[]) { output.reloads.push([output.plays.indexOf(this), ...args]); }
  stopRemoteReload(why: string) { output.reloadStops.push([output.plays.indexOf(this), why]); }
  frame(_dt: number, walk: { snapshot(): unknown }) { output.snapshots.push(walk.snapshot()); }
  animStats() { return { clip: 'seal_death_back', frame: 12.5, frames: 40 }; }
} }; });

const state = (id: number, alive: boolean): BodyState => ({
  id, feet: [0, 0, 0], yaw: 0, pitch: 0, vx: 0, vy: 0, vz: 0,
  flags: alive ? BodyFlag.Alive : 0, stance: 0, landing: 0, jumps: 0,
  ground: 0, groundForward: 0, groundRight: 0, groundCls: -1, stickSnaps: 0,
  action: 0, actionSerial: 0, actionT: 0, actionSeconds: -1,
  overlay: 0, overlayT: 0, overlaySeconds: 0, turnRate: 0,
  trav: 0, travFrame: 0, travRootY: Number.NaN, travBlend: 0, travBlendWeight: 0, peek: 0, weapon: 255, slot: 0,
});

function rig() {
  const remote = new RemotePlayers(new Scene()), camera = new PerspectiveCamera();
  // A map with one escortee body (`teamBody` `escorteeBody` reads `types.escortees`), so the page builds the hostage.
  const fem = { character: 'mp_fem1', model: 'fem', dressedBy: 'character.rdr', parts: [], subMeshes: [], fittings: [], missing: [], at: null,
    height: 20, eye: 18, stats: { vertices: 0, triangles: 0, parts: 0, subMeshes: 0, batches: 0, maxInfluences: 0, droppedWeight: 0, fittings: 0 } } as unknown as LoadedBody;
  remote.setMap({ body: {}, types: { seal: [], terrorist: [], escortees: [fem] } } as unknown as LoadedMap, DEFAULT_LIGHTING, null);
  const flinch = { name: 'seal_flinch_x', version: 5, duration: 1, frameCount: 30, rate: 30, unknown10: -1, unknown14: 1, parts: [] };
  remote.setClips({ clips: [flinch], table: [[flinch.name, { looped: false, playback: 2, maxVelocity: -1, blendTime: null, transitionA: null, transitionB: null, noInterrupt: null, callbacks: [] }]] } as never);
  const frame = (bodies: BodyState[], dt = 1 / 60): void => { remote.frame(dt, bodies, camera); };
  const flinchOf = (id: number): unknown => (remote as unknown as { remotes: Map<number, { flinch: unknown }> }).remotes.get(id)?.flinch ?? null;
  return { remote, frame, flinchOf, clip: flinch.name };
}

/**
 * LATER 1186 (research 447 s9.1: the host's `FUN_005a2690` pushes a hostage's flinch to every console as a Push Blend 0xf,
 * replayed there by `FUN_005a2390`): the room's `flinch` event now names a hostage's id too (its meaning widened, no wire
 * change: `../src/net/protocol` `flinch`). The page's handler hands every other id to `RemotePlayers.flinch`, which holds the
 * hostages' bodies (`setEscortee`) beside the players' -- so a hostage plays it as a player does; an id it draws no body for
 * plays nothing.
 */
describe('LATER 1186: the page plays a hostage\'s flinch; an id it holds no body for is a no-op', () => {
  const HOSTAGE = 240;

  it('a hostage\'s body (an escortee entry) takes the flinch, as a player\'s does, and plays it over the next frame', () => {
    const { remote, frame, flinchOf, clip } = rig();
    remote.setEscortee(HOSTAGE, 0);
    frame([state(HOSTAGE, true)]);
    expect(flinchOf(HOSTAGE)).toBeNull();
    remote.flinch(HOSTAGE, clip);
    expect(flinchOf(HOSTAGE)).toMatchObject({ clip });
    frame([state(HOSTAGE, true)]);
    expect(flinchOf(HOSTAGE)).not.toBeNull();                          // still running (1 s clip, one frame in)
  });

  it('a dead hostage takes none; an id with no body drawn (an older or another page\'s view) is ignored -- nothing made, nothing thrown', () => {
    const { remote, frame, flinchOf, clip } = rig();
    remote.setEscortee(HOSTAGE, 0);
    frame([state(HOSTAGE, false)]);
    remote.flinch(HOSTAGE, clip);
    expect(flinchOf(HOSTAGE)).toBeNull();
    expect(() => remote.flinch(HOSTAGE + 5, clip)).not.toThrow();
    expect((remote as unknown as { remotes: Map<number, unknown> }).remotes.has(HOSTAGE + 5)).toBe(false);
  });
});
