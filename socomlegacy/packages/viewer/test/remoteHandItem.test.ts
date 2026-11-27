// test/remoteHandItem.test.ts -- BUG-B67 (closed as the original's behaviour; the controller's option (a), 2026-11-24):
// a pin, no behaviour change. Another page draws a body whose owner has a hand grenade up with the firearm still in
// the hand and nothing hung on the hand's held node. The real `RemotePlayers` runs; only the body's view and `Play` are
// stand-ins recording what the frame asks of them (as in `remoteLauncher.test.ts`).
//
// The reading pinned: research 326 §1.1 -- the take-up from a firearm to a throwable (class 3) takes `FUN_005a64c0`'s
// snapshot branch with no push and no re-parent (D:L461887-461920): the firearm stays in the hand (`./heldItem`
// `ITEM_NODE`'s note says the same). What the original shows in the hand before the launch is still open
// (`THROW_HAND_MODEL_READING`, research 326 §7, R326.4, D4; settles: capture NU8-1 or `FUN_005c6980`'s index read whole):
// until it is settled no grenade model is hung on a copy (research 326 §6 B5: "read first, not built").
//
// Today's path, pinned as it is: `BodyState.hand` (protocol 17, HAND_WIRE_ADAPTATION) does not reach the copy -- `./net/body`
// `snapshotOf` does not carry it, and `RemotePlayers` reads none. This pin does not change `snapshotOf`: if a later task
// carries `hand` to the copy, this test still holds what the copy must draw (the firearm in the hand; no grenade model
// until B5 settles THROW_HAND_MODEL_READING). The control below cannot fail while the copy reads no `hand` (a non-author
// re-read's note); it becomes a real control once a later task carries the byte.
import { describe, expect, it, vi } from 'vitest';
import { Group, PerspectiveCamera, Scene, type Object3D } from 'three';
import { RemotePlayers, type HeldRef, type SideKit } from '../src/remotePlayers';
import type { LoadedMap } from '../src/loadMap';
import type { PlayClips } from '../src/play';
import type { PlaySnapshot } from '../src/mover';
import { BodyFlag, type BodyState } from '../src/net/protocol';
import { DEFAULT_LIGHTING } from '../src/lighting';

const output = vi.hoisted(() => ({
  snapshots: [] as PlaySnapshot[], weapons: [] as (Object3D | null)[], stowed: [] as boolean[], items: [] as string[],
  mounts: [] as { rifle: string; pistol: string }[], plays: [] as { hand: Object3D }[],
}));
vi.mock('../src/bodyView', () => ({ buildBody: () => ({ group: new Group(), dispose: () => {} }) }));
vi.mock('../src/play', async () => { const { Group: G } = await import('three'); return { Play: class {
  launcher = Object.assign(new G(), { name: 'launcher' });
  hand = Object.assign(new G(), { name: 'rifle' });
  constructor() { output.plays.push(this); }
  launcherNode() { return this.launcher; }
  heldNode() { return this.hand; }
  setRifleStowed(on: boolean) { output.stowed.push(on); }
  setItem(item: string) { output.items.push(item); }
  setMounts(m: { rifle: string; pistol: string }) { output.mounts.push({ ...m }); }
  stopVictory() {}
  setBody() {} setFlyToggle() {} setClips() {} setWeaponInput() {} setAnimSet() {}
  setWeapon(o: Object3D | null) { output.weapons.push(o); } setSidearm() {} addPoseLayer() {} motionSource() { return null; } onEvent() {}
  frame(_dt: number, walk: { snapshot(): PlaySnapshot }) { output.snapshots.push(walk.snapshot()); }
} }; });

/** A held model per item id, named for it (the stub `SideKit`). */
const ref = (id: number): HeldRef => { const g = new Group(); g.name = `model${id}`; return { object: g, points: [] }; };
const kitOf: SideKit = (_team, kit) => {
  const k = kit ?? KIT;
  return { rifle: ref(k[0]!), pistol: ref(k[1]!), loadout: k, ids: [k[0]!, k[1]!], launcher: null };
};
/** The rifle (54) in slot 0, a sidearm (15), the M67 (121, research 320 section 1's id) in an equipment slot. */
const KIT = [54, 15, 121, 255, 255];
const M67 = 121;

/** A living body standing still, the rifle in the hand (slot 0, item 54), no action and no hold; `hand` the wire's byte. */
const state = (hand: number): BodyState => ({
  id: 2, feet: [0, 0, 0], yaw: 0, pitch: 0, vx: 0, vy: 0, vz: 0,
  flags: BodyFlag.Alive, stance: 0, landing: 0, jumps: 0,
  ground: 0, groundForward: 0, groundRight: 0, groundCls: -1, stickSnaps: 0,
  action: 0, actionSerial: 0, actionT: 0, actionSeconds: -1,
  overlay: 0, overlayT: 0, overlaySeconds: 0, turnRate: 0,
  trav: 0, travFrame: 0, travRootY: Number.NaN, travBlend: 0, travBlendWeight: 0, peek: 0, weapon: KIT[0]!, slot: 0,
  hand,
});

function drawn(hand: number) {
  for (const list of Object.values(output)) list.length = 0;
  const remote = new RemotePlayers(new Scene()), camera = new PerspectiveCamera();
  remote.setMap({ body: {} } as LoadedMap, DEFAULT_LIGHTING, kitOf);
  remote.setClips({ clips: [], table: null } as unknown as PlayClips);
  remote.setKit(2, KIT);
  for (let i = 0; i < 10; i++) remote.frame(1 / 60, [state(hand)], camera);
  const play = output.plays.at(-1)!;
  return {
    items: [...output.items], mounts: output.mounts.at(-1), stowed: output.stowed.at(-1) ?? false,
    inHand: play.hand.children.map((o) => o.name), hung: output.weapons.filter((o) => o !== null).map((o) => o!.name),
    snap: output.snapshots.at(-1)!, kit: remote.playerKit(2),
  };
}

describe('BUG-B67 pin: a copy whose owner has a grenade up keeps the firearm in the hand (research 326 §1.1; THROW_HAND_MODEL_READING open)', () => {
  it('rifle in slot 0, hand = the M67 (121), no hold: the rifle in the hand, not stowed, nothing on the held node', () => {
    const d = drawn(M67);
    expect(d.items.filter((i) => i !== 'rifle')).toEqual([]);   // the item never changed off the rifle (a new body's own)
    expect(d.mounts).toEqual({ rifle: 'hand', pistol: 'holster' });
    expect(d.stowed).toBe(false);                                // FUN_005a64c0 re-parents nothing (D:L461887-461920)
    expect(d.inHand).toEqual([]);                                // no grenade model: THROW_HAND_MODEL_READING open (B5)
    expect(d.hung).toContain('model54');                         // the rifle's model is the one hung
    expect(d.hung).not.toContain(`model${M67}`);
    expect(d.kit).toEqual(KIT);                                  // the kit never written with the grenade
    expect(d.snap.hold ?? null).toBeNull();
  });

  it('the control, hand = 0: drawn the same', () => {
    const a = drawn(M67), b = drawn(0);
    expect({ ...b, snap: null }).toEqual({ ...a, snap: null });
  });
});
