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
  setBody() {} setFlyToggle() {} setClips() {} setWeaponInput() {}
  setItem(item: string) { output.items.push(item); }
  setMounts(m: { rifle: string; pistol: string }) { output.mounts.push({ ...m }); }
  setWeapon(o: Object3D | null) { output.weapons.push(o); }
  setSidearm(o: Object3D | null) { output.sidearms.push(o); }
  addPoseLayer() {} motionSource() { return output.sources[0] ?? null; } onEvent() {}
  respawn() { output.respawns.push(output.plays.indexOf(this)); }
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
  remote.setMap({ body: {} } as LoadedMap, DEFAULT_LIGHTING, null);
  const frame = (alive: boolean, dt = 0.25): void => { remote.frame(dt, [state(3, alive)], camera); };
  return { remote, frame };
}

describe('regional bot appearances retain the native remote actor path (FBA.R10)', () => {
  const body = (character: string, model: string): LoadedBody => ({
    character, model, dressedBy: 'character.rdr', parts: [], subMeshes: [], fittings: [], missing: [], at: null,
    height: 20, eye: 18, stats: { vertices: 0, triangles: 0, parts: 0, subMeshes: 0, batches: 0, maxInfluences: 0, droppedWeight: 0, fittings: 0 },
  });
  const native = body('mp2_seal1', 'seal_A_scuba'), typed = body('mp2_seal2', 'seal_B_scuba');
  const regional = body('scuba_B83', 'seal_B_scuba');
  function appeared() {
    const remote = new RemotePlayers(new Scene()), camera = new PerspectiveCamera();
    const map: LoadedMap = {
      archive: 'SYN', camera: null, path: 'SYN.ZDB', name: 'synthetic', lines: null, world: [], props: [],
      textures: {}, textureFlags: {}, metersPerUnit: 0.1, lightRig: null, origin: [0, 0, 0], detail: {}, grid: DEFAULT_GRID_PARAMS,
      collision: { positions: new Float32Array(0), colors: new Uint8Array(0), polygons: 0 },
      slots: [], diagnostics: [], loadMs: 0, timings: { fetch: 0, decode: 0, postedAt: 0 },
      body: native, types: { seal: [native, typed], terrorist: [native] },
      characters: { catalogue: { region: 'russia', uniform: 'Scuba', choices: [], pool: { seal: [], terrorist: [] } }, bodies: { jester: regional }, diagnostics: [] },
    };
    remote.setMap(map, DEFAULT_LIGHTING, null);
    const frame = (): void => { remote.frame(1 / 60, [state(3, true)], camera); };
    return { remote, map, frame };
  }

  it('renders a named appearance through the existing body/play path and reports the actual definition/model', () => {
    const { remote, frame } = appeared();
    remote.setType(3, 1);
    remote.setCharacter(3, 'jester');
    frame();
    expect(output.bodies.at(-1)).toBe(regional);
    expect(remote.playerType(3)).toBe(1);
    expect(remote.appearances()).toEqual([{ id: 3, key: 'jester', definition: 'scuba_B83', model: 'seal_B_scuba' }]);
    const group = remote.seenForDev().bodies[0]!.group;
    remote.setCharacter(3, 'jester');
    frame();
    expect(remote.seenForDev().bodies[0]!.group).toBe(group);
  });

  // The area (c) review's finding 6, after area (a)'s fix (bf's 06a87e7d3: the room hits a bot on its type's volumes): the
  // page's rays take the same -- the type's stance volumes, never the drawn appearance's, so the aim converges on the
  // shape the room judges the hit by.
  it('the aim ray takes the type\'s volumes, never the regional appearance\'s (the room\'s rule)', () => {
    const { remote, map, frame } = appeared();
    remote.setType(3, 1);
    remote.setCharacter(3, 'jester');
    frame();
    // The type's volumes need the skeleton, which this file's play mock leaves out: the type's builder answers none here.
    let typed = 0;
    (remote as unknown as { volumesOf: () => null }).volumesOf = () => { typed++; return null; };
    let asked = 0;
    const bodies = map.characters!.bodies;
    Object.defineProperty(map.characters!, 'bodies', { get: () => { asked++; return bodies; }, configurable: true });
    remote.aimDistance([0, 0, 0], [0, 0, -1], 1000);
    expect(asked).toBe(0);
    expect(typed).toBe(1);
  });

  // The area (c) review's finding 5, the merge controller's ruling: the appearance rebuilds the body only. A bot dead
  // when its character arrives keeps the seat's death -- its clip, its age, heard (NU-11b H1) -- never a ghost.
  it('an appearance arriving for a dead bot rebuilds its body and keeps its heard death: the clip and its age, no ghost', () => {
    const { remote } = appeared();
    const camera = new PerspectiveCamera();
    remote.setType(3, 1);
    remote.frame(1 / 60, [state(3, true)], camera);
    remote.died(3, 'seal_death_back');
    for (let i = 0; i < 30; i++) remote.frame(1 / 60, [state(3, false)], camera);
    const before = remote.seenForDev().bodies.find((b) => b.id === 3)!;
    expect(before.deathClip).toBe('seal_death_back');
    remote.setCharacter(3, 'jester');
    remote.frame(1 / 60, [state(3, false)], camera);
    const after = remote.seenForDev();
    const body = after.bodies.find((b) => b.id === 3)!;
    expect(remote.appearances()[0]!.key).toBe('jester');
    expect(after.ghosts).not.toContain(3);
    expect(body.deathClip).toBe('seal_death_back');
    expect(body.deadFor).toBeGreaterThanOrEqual(before.deadFor);
  });

  it('missing or cleared appearances fall back to the native selected type, with no stale diagnostics', () => {
    const { remote, frame } = appeared();
    remote.setType(3, 1);
    for (const key of ['missing', '__proto__', 'jester', null]) {
      remote.setCharacter(3, key);
      frame();
      expect(output.bodies.at(-1)).toBe(key === 'jester' ? regional : typed);
      expect(remote.appearances()[0]).toEqual({ id: 3, key,
        definition: key === 'jester' ? 'scuba_B83' : 'mp2_seal2', model: 'seal_B_scuba' });
    }
    const seen = remote.appearances();
    seen[0]!.key = 'jester';
    expect(remote.appearances()[0]!.key).toBeNull();
  });

  it.each(['forget', 'clear', 'setMap'] as const)('%s discards the previous room or seat appearance', (reset) => {
    const { remote, frame, map } = appeared();
    remote.setCharacter(3, 'jester');
    frame();
    if (reset === 'forget') remote.forget(3);
    else if (reset === 'clear') remote.clear();
    else remote.setMap(map, DEFAULT_LIGHTING, null);
    expect(remote.appearances()).toEqual([]);
    frame();
    expect(output.bodies.at(-1)).toBe(native);
    expect(remote.appearances()).toEqual([{ id: 3, key: null, definition: 'mp2_seal1', model: 'seal_A_scuba' }]);
  });
});

describe('PAR-41: the others as the dev read sees them (RemotePlayers.seenForDev)', () => {
  it('nothing drawn: no bodies, no ghosts, no gear', () => {
    const { remote } = rig();
    expect(remote.seenForDev()).toEqual({ bodies: [], ghosts: [], gearShown: new Map() });
  });

  it('the ghosts (markGhost) and the gear asked (setGearVisible), by id, before any body is drawn', () => {
    const { remote } = rig();
    remote.markGhost(7);
    remote.setGearVisible(3, 'Satchel', true);
    const seen = remote.seenForDev();
    expect(seen.ghosts).toEqual([7]);
    expect(seen.gearShown).toEqual(new Map([[3, ['Satchel']]]));
    remote.setGearVisible(3, 'Satchel', false);
    expect(remote.seenForDev().gearShown).toEqual(new Map());
  });

  it('a drawn body: its id, escortee, life, death clip and age, its clip and key, its group and fittings', () => {
    const { remote, frame } = rig();
    remote.setGearVisible(3, 'Satchel', true);
    frame(true);
    remote.died(3, 'seal_death_back');
    frame(false);
    const seen = remote.seenForDev();
    expect(seen.bodies).toHaveLength(1);
    const body = seen.bodies[0]!;
    expect({ ...body, group: undefined }).toEqual({
      id: 3, escortee: null, alive: false, deadFor: 0.25, deathClip: 'seal_death_back',
      anim: { clip: 'seal_death_back', frame: 12.5 }, group: undefined, fittingNames: ['Satchel', 'Absent'],
    });
    expect(body.group.visible).toBe(true);                        // dead 0.25 s: under BODY_FADE_S, drawn
    expect(body.group.getObjectByName('Satchel')!.visible).toBe(true);
    expect(seen.gearShown).toEqual(new Map([[3, ['Satchel']]]));
  });

  it('read-only: a copy -- writing what it returned changes nothing kept, and nothing the next read sees', () => {
    const { remote, frame } = rig();
    remote.markGhost(7);
    remote.setGearVisible(3, 'Satchel', true);
    frame(true);
    const first = remote.seenForDev();
    const fittings = first.bodies[0]!.fittingNames;
    (first.ghosts as number[]).push(9);
    (first.gearShown.get(3) as string[]).push('Detonator');
    (first.gearShown as Map<number, readonly string[]>).set(5, ['Satchel']);
    (fittings as string[]).push('Detonator');
    (first.bodies as SeenRemoteBody[]).length = 0;
    const again = remote.seenForDev();
    expect(again.ghosts).toEqual([7]);
    expect(again.gearShown).toEqual(new Map([[3, ['Satchel']]]));
    expect(again.bodies.map((b) => b.id)).toEqual([3]);
    expect(again.bodies[0]!.fittingNames).toEqual(['Satchel', 'Absent']);
    expect(remote.count()).toBe(1);
    // The class's own set took none of those writes: 9 is a ghost once markGhost names it, not before.
    remote.markGhost(9);
    expect(remote.seenForDev().ghosts).toEqual([7, 9]);
  });
});

/**
 * NU-9 (c) T2 (research 329 §5 T2, §1.3): the over-head tag's anchor is the actor's skeleton node named `head` (0x65c500,
 * `FUN_00553ea0` D:L419621) in world space (`FUN_005a3070` D:L460118-460121) -- `RemotePlayers.headAt`, the body's bone of
 * that name, null for a body not drawn; and the tag's fade clock, `deathAge` -- the drawn death's real seconds (PAR-34's
 * `fadeAge`), null while alive (`FUN_00548050` D:L413162-413174: 0 alive, else the clock since the death).
 */
describe('NU-9 T2: the head point and the death\'s age of the others\' bodies (RemotePlayers.headAt, deathAge)', () => {
  it('a drawn body\'s headAt is its `head` bone\'s world position; lowered (a crouch\'s pose), lower', () => {
    const { remote, frame } = rig();
    expect(remote.headAt(3)).toBeNull();                          // no body yet
    frame(true);
    const group = remote.seenForDev().bodies[0]!.group;
    group.position.set(10, 0, 5);                                 // the stand-in Play places nothing: the body moved by hand
    expect(remote.headAt(3)).toEqual([10, 55, 7]);
    const head = group.getObjectByName('head')!;
    head.position.y = 10;                                         // the pose lowers the head
    expect(remote.headAt(3)![1]).toBe(40);
  });

  it('a body not drawn has none: a ghost (markGhost), an unknown id', () => {
    const { remote, frame } = rig();
    remote.markGhost(3);
    frame(false);
    expect(remote.seenForDev().bodies[0]!.group.visible).toBe(false);
    expect(remote.headAt(3)).toBeNull();
    expect(remote.headAt(99)).toBeNull();
  });

  it('deathAge: null alive; the drawn death\'s real seconds once dead; 0 again at a kill (died); null with no body', () => {
    const { remote, frame } = rig();
    expect(remote.deathAge(3)).toBeNull();
    frame(true);
    expect(remote.deathAge(3)).toBeNull();
    frame(false, 0.25);
    expect(remote.deathAge(3)).toBeCloseTo(0.25, 9);
    remote.died(3, 'seal_death_back');
    expect(remote.deathAge(3)).toBe(0);
    frame(false, 0.1);
    remote.frame(0.1, [state(3, false)], new PerspectiveCamera(), 2);   // real seconds count, not the clamped step
    expect(remote.deathAge(3)).toBeCloseTo(2.1, 9);
    frame(true);
    expect(remote.deathAge(3)).toBeNull();
  });
});

/**
 * NU-6 P1 (research 324 §1.1, §1.2, §1.4, §6 P1; NU.R1: "SEALs and Terrorists display the correct equipped weapon
 * models, including picked-up weapons"): the rules the page draws the others' firearms by, pinned before P2 and P3
 * touch the same functions -- no behaviour change, these pass on the code as it stood. The original reads no side on
 * this path (`FUN_005c6a40` D:L479768-479879, `FUN_005c6da0` D:L479884-479990: the kit's first primary on the rifle
 * node, its first pistol on the pistol node), so a SEAL body and a Terrorist body are drawn by one rule from their own
 * kits: slot 0's model and slot 1's (the port's kit keeps the primary in 0 and the pistol in 1), the hand by the
 * replicated slot. A pick-up re-hangs at the accept with no clip on the taker (`FUN_0059f0c0` D:L458217-458235,
 * D:L458293-458294; `REMOTE_PICKUP_REMOUNT_READING`, note only) -- the page's `taken.kit` through `setKit`.
 */
describe('NU-6 P1: a SEAL body and a Terrorist body draw their own kit\'s models, after a swap and a pick-up (research 324 §6 P1)', () => {
  /** A held model per item id, named for it: the stub `SideKit` resolves each firearm slot's model by its id. */
  const ref = (id: number): HeldRef => { const g = new Group(); g.name = `model${id}`; return { object: g, points: [] }; };
  /** The SEAL's M4A1 (54) and the Terrorist's AK-47 (58), each with the Mark 23 (15) and an M67 (121). */
  const KITS: Record<Team, number[]> = { seal: [54, 15, 121, 255, 255], terrorist: [58, 15, 121, 255, 255] };
  const kitOf: SideKit = (team, kit) => {
    const k = kit ?? KITS[team];
    return { rifle: ref(k[0]!), pistol: ref(k[1]!), loadout: k, ids: [k[0]!, k[1]!], launcher: launcherRef(k) };
  };
  const SEAL_BODY = { name: 'seal body' }, TERRORIST_BODY = { name: 'terrorist body' };
  const swapCode = ACTION_CODES.indexOf('swapStand') + 1;
  /** A living body standing, `slot` in the hand (`item` its id), or mid-swap at `progress` of a 1.2 s standing swap. */
  const body = (slot: 0 | 1, item: number, swap?: { progress: number; reversed: boolean }): BodyState => ({
    ...state(3, true), slot, weapon: item,
    ...(swap ? {
      flags: BodyFlag.Alive | (swap.reversed ? BodyFlag.ActionReversed : 0),
      action: swapCode, actionSerial: 1, actionT: swap.progress * 1.2, actionSeconds: 1.2,
    } : {}),
  });

  function sided(team: Team) {
    for (const list of Object.values(output)) list.length = 0;
    const remote = new RemotePlayers(new Scene()), camera = new PerspectiveCamera();
    remote.setMap({ body: SEAL_BODY, terrorist: TERRORIST_BODY } as unknown as LoadedMap, DEFAULT_LIGHTING, kitOf);
    remote.setTeam(3, team);
    remote.setKit(3, KITS[team]);                                // the spawn's kit (`spawn.kit`, protocol 7)
    const frame = (b: BodyState): void => { remote.frame(1 / 60, [b], camera); };
    const hung = () => ({ rifle: output.weapons.at(-1)?.name ?? null, pistol: output.sidearms.at(-1)?.name ?? null });
    return { remote, frame, hung, kit: KITS[team] };
  }

  it("K1 (research 324 §2, R324.9): the moment another console takes up a player's kit is read -- REMOTE_KIT_APPLY_READING 'spawn' (was REMOTE_KIT_APPLY_PLACEHOLDER)", () => {
    const exported = remotePlayers as unknown as Record<string, unknown>;
    expect(exported.REMOTE_KIT_APPLY_READING).toBe('spawn');
    expect(exported.REMOTE_KIT_APPLY_PLACEHOLDER).toBeUndefined();
  });

  for (const team of ['seal', 'terrorist'] as const) {
    it(`${team}: spawned with its kit, slot 0's model in the hand and slot 1's on the holster; slot 1 in the hand, the pistol in the hand and the rifle carried -- its own side's body`, () => {
      const s = sided(team);
      s.frame(body(0, s.kit[0]!));
      expect(output.bodies).toEqual([team === 'seal' ? SEAL_BODY : TERRORIST_BODY]);
      expect(s.hung()).toEqual({ rifle: `model${s.kit[0]}`, pistol: `model${s.kit[1]}` });
      expect(output.mounts.at(-1)).toEqual({ rifle: 'hand', pistol: 'holster' });
      s.frame(body(1, s.kit[1]!));
      expect(output.mounts.at(-1)).toEqual({ rifle: 'carry', pistol: 'hand' });
      expect(output.items.at(-1)).toBe('pistol');
      expect(s.hung()).toEqual({ rifle: `model${s.kit[0]}`, pistol: `model${s.kit[1]}` });   // the same models: no re-hang at a swap
      expect(output.weapons).toHaveLength(2);                     // the null take-off and the one hang
    });

    it(`${team}: a swap each way hands the pistol off at the clip's phase (HAND_OFF_READING), the rifle on the swap mount meanwhile, the models unchanged`, () => {
      const s = sided(team);
      s.frame(body(0, s.kit[0]!));
      const mounts = (): { rifle: Mount; pistol: Mount } => output.mounts.at(-1) as { rifle: Mount; pistol: Mount };
      s.frame(body(1, s.kit[1]!, { progress: 0.1, reversed: false }));   // the room's slot moved at the press
      expect(mounts()).toEqual({ rifle: 'swap', pistol: 'holster' });
      s.frame(body(1, s.kit[1]!, { progress: 0.95, reversed: false }));
      expect(mounts()).toEqual({ rifle: 'swap', pistol: 'hand' });
      s.frame(body(1, s.kit[1]!));
      expect(mounts()).toEqual({ rifle: 'carry', pistol: 'hand' });
      s.frame(body(0, s.kit[0]!, { progress: 0.1, reversed: true }));    // back to the rifle: the clip reversed
      expect(mounts()).toEqual({ rifle: 'swap', pistol: 'hand' });
      s.frame(body(0, s.kit[0]!, { progress: 0.95, reversed: true }));
      expect(mounts()).toEqual({ rifle: 'swap', pistol: 'holster' });
      s.frame(body(0, s.kit[0]!));
      expect(mounts()).toEqual({ rifle: 'hand', pistol: 'holster' });
      expect(s.hung()).toEqual({ rifle: `model${s.kit[0]}`, pistol: `model${s.kit[1]}` });
      expect(output.weapons).toHaveLength(2);
    });

    it(`${team}: a pick-up into the hand's slot (taken.kit) re-hangs the hand's model at once, no action drawn; into the stowed slot, the carried model`, () => {
      const s = sided(team);
      const other = team === 'seal' ? 58 : 54;                   // the other side's primary, off the ground
      s.frame(body(0, s.kit[0]!));
      const taken = [other, ...s.kit.slice(1)];
      s.remote.setKit(3, taken);                                 // `taken { did, by, kit }` -> setKit (netPage)
      expect(s.hung().rifle).toBe(`model${other}`);              // at the accept, before the next snapshot
      expect(s.remote.playerKit(3)).toEqual(taken);
      s.frame(body(0, other));                                   // the room's body item follows the live kit
      expect(output.mounts.at(-1)).toEqual({ rifle: 'hand', pistol: 'holster' });
      expect((output.snapshots.at(-1) as PlaySnapshot).action).toBeNull();
      const hangs = output.weapons.length;
      s.frame(body(0, other));
      expect(output.weapons).toHaveLength(hangs);                // the item agrees with the kit: nothing re-hung
      // The pistol in the hand: a primary taken into the stowed slot is the carried model, the pistol kept.
      const t = sided(team);
      t.frame(body(1, t.kit[1]!));
      t.remote.setKit(3, taken);
      t.frame(body(1, t.kit[1]!));
      expect(t.hung()).toEqual({ rifle: `model${other}`, pistol: `model${t.kit[1]}` });
      expect(output.mounts.at(-1)).toEqual({ rifle: 'carry', pistol: 'hand' });
      expect((output.snapshots.at(-1) as PlaySnapshot).action).toBeNull();
    });
  }
});

/**
 * NU-6 P2 (research 324 §1.6, R324.7, §6 P2): a rocket launcher is drawn on every body whose kit carries one -- the
 * body's `launcher` node under `spinehi` takes the kit's first rocket launcher's model (`FUN_005c6a40`
 * D:L479823 / D:L479872-479876, `FUN_003d1cb0` class 0x91; `FUN_005c6da0` the same), at the `launcher` gear's offset
 * (`REMOTE_LAUNCHER_MOUNT_READING`, `./heldItem`), and hidden at a remote's death with the firearms (`FUN_00547af0`
 * D:L413131-413134, `+0x3a8`). Was: no launcher on a remote body (no mount, `heldItem.ts`'s `Mount`).
 */
describe("NU-6 P2: the carried rocket launcher on the others' bodies (research 324 §6 P2)", () => {
  const ref = (id: number): HeldRef => { const g = new Group(); g.name = `model${id}`; return { object: g, points: [] }; };
  const kitOf: SideKit = (team, kit) => {
    const k = kit ?? (team === 'seal' ? [54, 15, 121, 255, 255] : [58, 15, 121, 255, 255]);
    return { rifle: ref(k[0]!), pistol: ref(k[1]!), loadout: k, ids: [k[0]!, k[1]!], launcher: launcherRef(k) };
  };
  /** A SEAL with a LAW (145) and its HEAT round (185); a Terrorist with an RPG-7 (146) and its round (186). */
  const LAUNCHER_KITS: Record<Team, number[]> = { seal: [54, 15, 145, 185, 255], terrorist: [58, 15, 146, 186, 255] };
  const body = (alive: boolean, slot: 0 | 1, item: number): BodyState => ({ ...state(3, alive), slot, weapon: item });

  function drawn(team: Team, kit: number[]) {
    for (const list of Object.values(output)) list.length = 0;
    const remote = new RemotePlayers(new Scene()), camera = new PerspectiveCamera();
    remote.setMap({ body: {}, terrorist: {} } as unknown as LoadedMap, DEFAULT_LIGHTING, kitOf);
    remote.setTeam(3, team);
    remote.setKit(3, kit);
    const frame = (b: BodyState): void => { remote.frame(1 / 60, [b], camera); };
    frame(body(true, 0, kit[0]!));
    return { remote, frame, play: output.plays.at(-1)! };
  }
  const carried = (play: { launcher: Object3D }): Object3D[] => [...play.launcher.children];

  for (const team of ['seal', 'terrorist'] as const) {
    const id = team === 'seal' ? 145 : 146;
    it(`${team}: the kit's ${id === 145 ? 'LAW' : 'RPG-7'} hangs on the launcher node at the launcher gear's offset, not in the hand; the firearms as they were`, () => {
      const d = drawn(team, LAUNCHER_KITS[team]);
      expect(carried(d.play).map((o) => o.name)).toEqual([`model${id}`]);
      expect(d.play.hand.children).toEqual([]);
      const o = carried(d.play)[0]!;
      o.updateMatrix();
      const want = (heldItem as unknown as { launcherCarryMatrix(): Float32Array }).launcherCarryMatrix();
      for (let i = 0; i < 16; i++) expect(o.matrix.elements[i]).toBeCloseTo(want[i]!, 5);
      expect(o.position.toArray().map((v) => Math.round(v * 1e4) / 1e4 + 0)).toEqual([0, -1.61, -1.5]);
      expect(o.visible).toBe(true);
      expect(output.weapons.at(-1)?.name).toBe(`model${LAUNCHER_KITS[team][0]}`);
      expect(output.mounts.at(-1)).toEqual({ rifle: 'hand', pistol: 'holster' });
    });
  }

  it('a kit with none draws none; a taken.kit that drops the launcher takes it off, and one that carries it hangs it again', () => {
    const d = drawn('seal', [54, 15, 121, 255, 255]);
    expect(carried(d.play)).toEqual([]);
    d.remote.setKit(3, LAUNCHER_KITS.seal);
    expect(carried(d.play).map((o) => o.name)).toEqual(['model145']);
    d.remote.setKit(3, [54, 15, 121, 255, 255]);
    d.frame(body(true, 0, 54));
    expect(carried(d.play)).toEqual([]);
  });

  it('a corpse draws none: the launcher hidden at the death with the firearms, shown again once its seat is alive', () => {
    const d = drawn('terrorist', LAUNCHER_KITS.terrorist);
    d.remote.died(3, null);
    d.frame(body(false, 0, 58));
    expect(carried(d.play).map((o) => o.visible)).toEqual([false]);
    d.frame(body(true, 0, 58));
    expect(carried(d.play).map((o) => o.visible)).toEqual([true]);
  });
});

/**
 * NU-6 P3 (research 324 §1.6, R324.7, §6 P3): a raised rocket launcher keeps the kit -- the body's item names the
 * launcher with the slot still 0 or 1 (`room.ts` `body`: `p.held ?? p.loadout[slot]`), and an item of the rocket
 * launcher class is not written into kit slot 0 / 1 (the install-if-absent, D:L162373-162378, is the firearms'), so the
 * firearms stay hung and `playerKit` unchanged; the launcher is drawn in the hand (the hand's node), the firearm stowed,
 * and at the lower the rifle is in the hand with no re-hang. Was: the launcher's model hung into slot 0 / 1 and drawn in
 * the rifle's (or the pistol's) grip, the stored kit overwritten until the lower (`remotePlayers.ts:688-694`).
 */
describe("NU-6 P3: a raised launcher keeps the others' kit (research 324 §6 P3)", () => {
  const ref = (id: number): HeldRef => { const g = new Group(); g.name = `model${id}`; return { object: g, points: [] }; };
  const kitOf: SideKit = (_team, kit) => {
    const k = kit ?? [54, 15, 121, 255, 255];
    return { rifle: ref(k[0]!), pistol: ref(k[1]!), loadout: k, ids: [k[0]!, k[1]!], launcher: launcherRef(k) };
  };
  const LAUNCHER_KITS: Record<Team, number[]> = { seal: [54, 15, 145, 185, 255], terrorist: [58, 15, 146, 186, 255] };
  const body = (slot: 0 | 1, item: number): BodyState => ({ ...state(3, true), slot, weapon: item });

  for (const team of ['seal', 'terrorist'] as const) {
    const kit = LAUNCHER_KITS[team], id = kit[2]!;
    it(`${team}: the snapshot's item becomes ${id} with slot 0 -- the rifle's model stays on the rifle, playerKit unchanged, the launcher in the hand and the rifle stowed; at the lower the rifle is in the hand with no re-hang`, () => {
      for (const list of Object.values(output)) list.length = 0;
      const remote = new RemotePlayers(new Scene()), camera = new PerspectiveCamera();
      remote.setMap({ body: {}, terrorist: {} } as unknown as LoadedMap, DEFAULT_LIGHTING, kitOf);
      remote.setTeam(3, team);
      remote.setKit(3, kit);
      const frame = (b: BodyState): void => { remote.frame(1 / 60, [b], camera); };
      frame(body(0, kit[0]!));
      const play = output.plays.at(-1)!, hangs = output.weapons.length;
      frame(body(0, id));                                        // raised: the item the launcher's, slot 0
      expect(remote.playerKit(3)).toEqual(kit);
      expect(output.weapons).toHaveLength(hangs);                // nothing hung again
      expect(output.weapons.at(-1)?.name).toBe(`model${kit[0]}`);
      expect(play.hand.children.map((o) => o.name)).toEqual([`model${id}`]);
      expect(play.launcher.children).toEqual([]);
      expect(output.stowed.at(-1)).toBe(true);
      expect(output.mounts.at(-1)).toEqual({ rifle: 'hand', pistol: 'holster' });
      frame(body(0, kit[0]!));                                   // lowered (the moving lower: no action on the body)
      expect(remote.playerKit(3)).toEqual(kit);
      expect(output.weapons).toHaveLength(hangs);
      expect(play.hand.children).toEqual([]);
      expect(play.launcher.children.map((o) => o.name)).toEqual([`model${id}`]);
      expect(output.stowed.at(-1)).toBe(false);
      expect(output.mounts.at(-1)).toEqual({ rifle: 'hand', pistol: 'holster' });
    });
  }
});

/**
 * NU-6 F2 (the review of 384b7d288): the launcher's model is the kit callback's own `launcher` (`SideKit`), never a
 * firearm slot's model asked for a kit with the launcher in it -- a map whose table names no launcher model (or none at
 * all, the baked pair's fallback) draws no launcher, where it drew a rifle on `spinehi`.
 */
describe("NU-6 F2: the launcher's model from the kit callback's own field", () => {
  const named = (name: string): HeldRef => { const g = new Group(); g.name = name; return { object: g, points: [] }; };
  const body = (item: number): BodyState => ({ ...state(3, true), slot: 0, weapon: item });
  function drawn(kitOf: SideKit) {
    for (const list of Object.values(output)) list.length = 0;
    const remote = new RemotePlayers(new Scene()), camera = new PerspectiveCamera();
    remote.setMap({ body: {} } as LoadedMap, DEFAULT_LIGHTING, kitOf);
    remote.setKit(3, [54, 15, 145, 185, 255]);
    remote.frame(1 / 60, [body(54)], camera);
    const play = output.plays.at(-1)!;
    const raised = () => { remote.frame(1 / 60, [body(145)], camera); return play.hand.children.map((o) => o.name); };
    return { back: play.launcher.children.map((o) => o.name), raised };
  }

  it("the callback's launcher on the back and, raised, in the hand", () => {
    const d = drawn((_t, kit) => ({ rifle: named(`rifle${kit?.[0]}`), pistol: named('pistol'), launcher: named('AT4') }));
    expect(d.back).toEqual(['AT4']);
    expect(d.raised()).toEqual(['AT4']);
  });

  it('a callback that names no launcher draws none -- not the firearm slot\'s model of a kit with the launcher in it', () => {
    const d = drawn((_t, kit) => ({ rifle: named(`rifle${kit?.[0]}`), pistol: named('pistol'), launcher: null }));
    expect(d.back).toEqual([]);
    expect(d.raised()).toEqual([]);
  });
});

/**
 * NU-12 B2 (research 328 R328.1, R328.7, §4.3 D5, §5 B2; the build brief's F3, F4): every console rebuilds every copy at
 * the round's reload (`FUN_00223680` D:L75920-75931, `FUN_00598b90` D:L455072-455081) and at its owner's respawn
 * (`REMOTE_RESPAWN_REBUILD_READING`: `FUN_00544210` D:L410551-410563 -> `FUN_00547350` -> `FUN_00598b90(copy, 1)`). The
 * page keys the copy's rebuild on the room's `spawn` event for its seat, counted on the body the view tick draws
 * (`spawns`: `./net/client` `bodies`), with a dead-to-alive change as a respawn where no count comes: the copy's `Play`
 * rebuilt (`Play.respawn`, here a stand-in that counts it) and its binoculars layer stopped, so a survivor's copy plays
 * no stance's raise backwards over the new body.
 */
describe('NU-12 B2: the copy rebuilt at its seat\'s spawn (RemotePlayers.frame; research 328 §5 B2)', () => {
  const at = (alive: boolean, spawns: number | undefined, extra: Partial<BodyState> = {}): BodyState & { spawns?: number } =>
    ({ ...state(3, alive), ...extra, ...(spawns === undefined ? {} : { spawns }) });
  const fresh = () => {
    for (const list of Object.values(output)) list.length = 0;
    const remote = new RemotePlayers(new Scene()), camera = new PerspectiveCamera();
    remote.setMap({ body: {} } as LoadedMap, DEFAULT_LIGHTING, null);
    const frame = (b: BodyState & { spawns?: number }, dt = 1 / 60): void => remote.frame(dt, [b], camera);
    return { remote, frame };
  };

  it('a survivor at a round\'s start (alive to alive, the seat\'s spawn counted): rebuilt once, on the frame that draws the spawn', () => {
    const { frame } = fresh();
    for (let i = 0; i < 10; i++) frame(at(true, 4, { stance: 1 }));     // crouched at the round's end
    expect(output.respawns).toEqual([]);
    frame(at(true, 5));                                               // the spawn's body: standing at its slot
    expect(output.respawns).toEqual([0]);
    for (let i = 0; i < 10; i++) frame(at(true, 5));
    expect(output.respawns).toEqual([0]);
  });

  it('a corpse alive again (a respawn, REMOTE_RESPAWN_REBUILD_READING): rebuilt -- counted or not', () => {
    const counted = fresh();
    counted.frame(at(true, 0));
    counted.remote.died(3, 'seal_death_back');
    for (let i = 0; i < 10; i++) counted.frame(at(false, 0));
    counted.frame(at(true, 1));
    expect(output.respawns).toEqual([0]);
    const uncounted = fresh();
    uncounted.frame(at(true, undefined));
    for (let i = 0; i < 10; i++) uncounted.frame(at(false, undefined));
    uncounted.frame(at(true, undefined));
    expect(output.respawns).toEqual([0]);
    expect(remotePlayers.REMOTE_RESPAWN_REBUILD_READING).toBe('rebuilt');
  });

  it('no spawn, no rebuild: a body first seen, its stance changes, a source that counts none', () => {
    const { frame } = fresh();
    frame(at(true, 7));
    frame(at(true, 7, { stance: 2 }));
    frame(at(true, 7, { stance: 0 }));
    frame(at(true, undefined));
    frame(at(true, undefined, { stance: 1 }));
    expect(output.respawns).toEqual([]);
  });

  it('the review\'s F2: a living seat re-placed (its spawn counted): its flinch dropped and its hands\' layer stopped, as the new stack pops both', () => {
    const { remote, frame } = fresh();
    const flinch = { name: 'seal_flinch_x', version: 5, duration: 1, frameCount: 30, rate: 30, unknown10: -1, unknown14: 1, parts: [] };
    remote.setClips({ clips: [flinch], table: [[flinch.name, { looped: false, playback: 2, maxVelocity: -1, blendTime: null, transitionA: null, transitionB: null, noInterrupt: null, callbacks: [] }]] } as never);
    frame(at(true, 1));
    remote.flinch(3, flinch.name);
    const r = (remote as unknown as { remotes: Map<number, { flinch: unknown; hands: { stop(): void } }> }).remotes.get(3)!;
    const stop = vi.spyOn(r.hands, 'stop');
    frame(at(true, 1));                                               // no spawn: the flinch plays on, the hands untouched
    expect(r.flinch).not.toBeNull();
    expect(stop).not.toHaveBeenCalled();
    frame(at(true, 2));                                               // the spawn's body
    expect(r.flinch).toBeNull();
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('the review\'s F4: a survivor\'s binoculars up at the round\'s end are stopped at the spawn -- no raise played backwards', () => {
    const clip = { name: 'seal_stand2binocular', version: 5, duration: 1, frameCount: 30, rate: 30, unknown10: -1, unknown14: 1, parts: [] };
    const source = { clips: new Map([[clip.name, clip]]), table: null };
    const binocs = (remote: RemotePlayers) => (remote as unknown as { remotes: Map<number, { binocs: { stats(): { clip: string | null; weight: number; up: boolean } } }> }).remotes.get(3)!.binocs.stats();
    const up = (spawns: number) => at(true, spawns, { flags: BodyFlag.Alive | BodyFlag.Binoculars });
    const spawned = fresh();
    output.sources.push(source);
    for (let i = 0; i < 60; i++) spawned.frame(up(1));                 // a second up: the raise held at its last key
    expect(binocs(spawned.remote)).toMatchObject({ clip: 'seal_stand2binocular', up: true });
    expect(binocs(spawned.remote).weight).toBeGreaterThan(0);
    spawned.frame(at(true, 2));                                       // the spawn: the flag down, the body new
    expect(binocs(spawned.remote)).toEqual({ clip: null, phase: 0, weight: 0, up: false });
    // Without a spawn the same flag's fall lowers it the way down (`BINOCULAR_LOWER_READING`): the raise reversed.
    const lowered = fresh();
    output.sources.push(source);
    for (let i = 0; i < 60; i++) lowered.frame(up(1));
    lowered.frame(at(true, 1));
    expect(binocs(lowered.remote)).toMatchObject({ clip: 'seal_stand2binocular', up: false });
    expect(binocs(lowered.remote).weight).toBeGreaterThan(0);
  });
});
