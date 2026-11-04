import { describe, expect, it, vi } from 'vitest';
import { Group, PerspectiveCamera, Scene } from 'three';
import { RemotePlayers, type SpawnedBodyState } from '../src/remotePlayers';
import type { LoadedMap } from '../src/loadMap';
import type { PlayClips } from '../src/play';
import type { PlaySnapshot } from '../src/mover';
import { BodyFlag } from '../src/net/protocol';
import { DEFAULT_LIGHTING } from '../src/lighting';

/**
 * NU-11b H1 (research 314 §4.3; the owner's playtest, NU.R4: "Player that joined in has a visible model"): a ghost's body
 * is drawn on no console -- the level puts the ghost's actor straight into the death state with its body node's opacity
 * 0, made inactive, and publishes the opacity nibble 15 to every console (`FUN_002b7d60` D:L158634-158638 ->
 * `FUN_00543d50` D:L410437-410441, D:L410444-410445, D:L410457-410459). The port hid a ghost only for a page told so by
 * its welcome's envelope (`markGhost`, PF-28); a page already in the round sees the new seat's body arrive dead with no
 * death (the room's wire, server `roomGhost.test.ts`) and, with no death clip and the classic corpse rule (`Infinity`),
 * drew it standing. The rule: a body first seen dead whose death this page never heard is a ghost
 * (`GHOST_BODY_READING`'s "dead with no death"), drawn as nothing until alive. The gameplay seat's conditions: the heard
 * death is dropped at the seat's spawn, beside NU-12's copy rebuild (1); a welcome's corpse (`hydrateCorpse`) counts as
 * heard (2). The departure agreed with the seat: the heard death outlives a rebuild of the copy (`remove`, from
 * `setTeam` / `setType` / `setEscortee` / a frame without the body) and is dropped when the seat leaves (`forget`) or the
 * room changes (`clear`). The real `RemotePlayers` runs; its body view and `Play` are stand-ins (as `remoteDeath.test.ts`).
 */
const output = vi.hoisted(() => ({ snapshots: [] as PlaySnapshot[] }));
vi.mock('../src/bodyView', () => ({ buildBody: () => ({ group: new Group(), dispose: () => {}, setGearVisible: () => false, stats: { fittingNames: [] } }) }));
vi.mock('../src/play', () => ({ Play: class {
  stopVictory() {}
  setBody() {} setFlyToggle() {} setClips() {} setWeaponInput() {} setItem() {} setMounts() {} setAnimSet() {}
  setWeapon() {} setSidearm() {} addPoseLayer() {} motionSource() { return null; } onEvent() {} animStats() { return null; }
  frame(_dt: number, walk: { snapshot(): PlaySnapshot }) { output.snapshots.push(walk.snapshot()); }
} }));

const clip = 'death_stand_chest01';
/** One body's state: `id`, alive or dead, and its seat's spawns as counted on the client (NU-12 B2), or none. */
const state = (id: number, alive: boolean, spawns?: number): SpawnedBodyState => ({
  id, feet: [0, 0, 0], yaw: 0, pitch: 0, vx: 0, vy: 0, vz: 0,
  flags: alive ? BodyFlag.Alive : 0, stance: 0, landing: 0, jumps: 0,
  ground: 0, groundForward: 0, groundRight: 0, groundCls: -1, stickSnaps: 0,
  action: 0, actionSerial: 0, actionT: 0, actionSeconds: -1,
  overlay: 0, overlayT: 0, overlaySeconds: 0, turnRate: 0,
  trav: 0, travFrame: 0, travRootY: Number.NaN, travBlend: 0, travBlendWeight: 0, peek: 0, weapon: 255, slot: 0,
  ...(spawns === undefined ? {} : { spawns }),
});

function rig(map: LoadedMap = { body: {} } as LoadedMap) {
  output.snapshots.length = 0;
  const remote = new RemotePlayers(new Scene()), camera = new PerspectiveCamera();
  remote.setMap(map, DEFAULT_LIGHTING, null);
  remote.setRules('classic');
  remote.setClips({ clips: [{ name: clip, frameCount: 60, parts: [] }], table: null } as unknown as PlayClips);
  /** One frame of these bodies; whether body `id` was drawn in it (its node visible, PAR-41's read). */
  const drawn = (id: number, bodies: SpawnedBodyState[]): boolean => {
    remote.frame(1 / 60, bodies, camera);
    return remote.seenForDev().bodies.find((b) => b.id === id)?.group.visible === true;
  };
  const heard = (id: number): boolean => (remote as unknown as { deathsHeard: Set<number> }).deathsHeard.has(id);
  return { remote, camera, drawn, heard };
}

describe('NU-11b H1: a ghost seated while this page is in the round is drawn as nothing (remotePlayers.ts)', () => {
  it('a body first seen dead with no death heard: not drawn while dead, drawn once alive; a death heard later draws its corpse', () => {
    const { remote, drawn } = rig();
    expect(drawn(3, [state(2, true)])).toBe(false);                  // the round: one living other (2), no 3 yet
    for (let i = 0; i < 30; i++) expect(drawn(3, [state(2, true), state(3, false)])).toBe(false);   // the ghost arrives dead, no kill
    expect(remote.seenForDev().ghosts).toEqual([3]);
    expect(drawn(3, [state(2, true), state(3, true)])).toBe(true);   // the next round: alive, drawn
    remote.died(3, clip);
    expect(drawn(3, [state(2, true), state(3, false)])).toBe(true);  // a later death: its corpse lies (NU-4)
  });

  it('a body seen alive first and then dead is a corpse, never a ghost; a death heard before the first frame (a kill racing the snapshot) too', () => {
    const r = rig();
    expect(r.drawn(4, [state(4, true)])).toBe(true);
    r.remote.died(4, clip);
    expect(r.drawn(4, [state(4, false)])).toBe(true);
    const k = rig();
    k.remote.died(5, null);
    expect(k.drawn(5, [state(5, false)])).toBe(true);
    expect(k.remote.seenForDev().ghosts).toEqual([]);
  });

  it('condition 2: a welcome\'s corpses (`hydrateCorpse`, with a clip or none) count as heard -- a late-joining page draws them', () => {
    const { remote, drawn } = rig();
    remote.hydrateCorpse(6, clip, 9);
    remote.hydrateCorpse(7, null, 2);
    remote.markGhost(8);                                             // the welcome's ghost: still nothing (PF-28)
    const bodies = [state(6, false), state(7, false), state(8, false)];
    expect([drawn(6, bodies), drawn(7, bodies), drawn(8, bodies)]).toEqual([true, true, false]);
    for (let i = 0; i < 30; i++) remote.frame(1 / 60, bodies, new PerspectiveCamera());
    expect([drawn(6, bodies), drawn(7, bodies), drawn(8, bodies)]).toEqual([true, true, false]);
  });

  it('condition 1: the seat\'s spawn (NU-12\'s count, beside the copy rebuild) drops the heard death; a ghost that spawns at the next round is drawn', () => {
    const { remote, drawn, heard } = rig();
    expect(drawn(3, [state(3, true, 1)])).toBe(true);
    remote.died(3, clip);
    expect(drawn(3, [state(3, false, 1)])).toBe(true);               // the corpse
    expect(heard(3)).toBe(true);
    expect(drawn(3, [state(3, true, 2)])).toBe(true);                // the next round's spawn
    expect(heard(3)).toBe(false);
    // The ghost (never a heard death) spawned at the next round: drawn from its spawn's frame.
    for (let i = 0; i < 5; i++) expect(drawn(9, [state(9, false, 0)])).toBe(false);
    expect(drawn(9, [state(9, true, 1)])).toBe(true);
    expect(remote.seenForDev().ghosts).toEqual([]);
  });

  it('the review\'s pin: a hostage is never made a ghost -- an escortee first seen dead with no death heard is drawn (its opacity is its own, HX-2)', () => {
    const { remote, drawn } = rig({ body: {}, types: { escortees: [{}] } } as unknown as LoadedMap);
    remote.setEscortee(5, 0);
    expect(drawn(5, [state(5, false)])).toBe(true);
    expect(remote.seenForDev().ghosts).toEqual([]);
  });

  it('the agreed departure: a heard death outlives a rebuild of the copy (`setType`, `setTeam`); a seat that left (`forget`) or another room (`clear`) forgets it', () => {
    const { remote, drawn } = rig();
    expect(drawn(3, [state(3, true)])).toBe(true);
    remote.died(3, clip);
    expect(drawn(3, [state(3, false)])).toBe(true);
    remote.setType(3, 1);                                            // the copy rebuilt as another type: first seen again, dead
    expect(drawn(3, [state(3, false)])).toBe(true);                  // still the corpse
    remote.setTeam(3, 'terrorist');
    expect(drawn(3, [state(3, false)])).toBe(true);
    // A frame without the body takes the copy away (`remove`); seen again dead, still the corpse.
    remote.frame(1 / 60, [], new PerspectiveCamera());
    expect(drawn(3, [state(3, false)])).toBe(true);
    // The seat leaves; a new seat of that id seated as the ghost of the round in play: nothing.
    remote.forget(3);
    expect(drawn(3, [state(3, false)])).toBe(false);
    // Another room: what this one heard is forgotten (remoteDeath.test.ts's PF-28 `clear()` case).
    const c = rig();
    c.remote.died(4, clip);
    c.remote.clear();
    expect(c.drawn(4, [state(4, false)])).toBe(false);
  });
});
