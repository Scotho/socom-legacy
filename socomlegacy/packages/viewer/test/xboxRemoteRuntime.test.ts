import { expect, it } from 'vitest';
import { Matrix4, PerspectiveCamera } from 'three';
import { ITEM, type Loadout, type MotionClip } from '@s2u/scene';
import { BAKED_LOADOUT } from '../src/loadout';
import { BodyFlag, type BodyState, type ServerEvent } from '../src/net/protocol';
import { prototypeRemotes } from '../src/xboxPrototype/remoteRuntime';
import type { BodyRig, WalkingMap } from '../src/xboxPrototype/runtimeAssets';

const clip = (name: string, y: number): MotionClip => ({ name, version: 5, duration: 1, frameCount: 30, rate: 30, unknown10: -1, unknown14: 1,
  parts: [{ index: 0, name: 'skel_root', flags: 0x3c, translations: Float32Array.of(0, y, 0), rotations: Float32Array.of(0, 0, 0, 1) }] });
const body: BodyRig = { model: 'test', at: null, height: 20,
  fittings: [{ name: 'Satchel', model: 'satchel', part: 0, offset: new Float32Array(new Matrix4().elements) }],
  parts: ['skel_root', 'head', 'neck', 'rhand'].map((name, i) => ({ name, parent: i ? 0 : -1,
    bindLocal: new Float32Array(new Matrix4().elements), bindWorld: new Float32Array(new Matrix4().elements), bbox: new Float32Array([-1, -1, -1, 1, 1, 1]) })) };
const state = (alive: boolean): BodyState => ({ id: 2, feet: [0, 0, -50], yaw: 0, pitch: 0, vx: 0, vy: 0, vz: 0,
  flags: alive ? BodyFlag.Alive | BodyFlag.Raised : 0, stance: 0, landing: 0, jumps: 0, ground: 0, groundForward: 0, groundRight: 0, groundCls: -1,
  stickSnaps: 0, action: 0, actionSerial: 0, actionT: 0, actionSeconds: -1, overlay: 0, overlayT: 0, overlaySeconds: 0, turnRate: 0,
  trav: 0, travFrame: 0, travRootY: Number.NaN, travBlend: 0, travBlendWeight: 0, peek: 0, weapon: BAKED_LOADOUT[0], slot: 0 });
function rig(death = clip('death_stand_head01', 2)) {
  let kit: Loadout = [...BAKED_LOADOUT];
  const remotes = prototypeRemotes({ map: {} as WalkingMap, models: [body],
    clips: { clips: [clip('seal_stand', 11), clip('seal_fp_stand', 11), death], table: null },
    ownId: () => 1, team: () => 'terrorist', kit: () => kit, setKit(_id, next) { kit = next; }, grid: () => null, step() {} });
  const camera = new PerspectiveCamera();
  return { remotes, kit: () => kit,
    deadFrame: (dt: number, real: number) => remotes.frame(dt, [state(false)], camera, [0, 0, 0], real)[0]!,
    frame: (alive: boolean, spawns?: number, weapon = BAKED_LOADOUT[0]) => remotes.frame(0.1, [{ ...state(alive), spawns, weapon }], camera, [0, 0, 0]) };
}
it('draws shared Play death poses and rebuilds a survivor on a counted spawn', () => {
  const { remotes, frame } = rig();
  frame(true, 1); expect(remotes.targets.alive(2)).toBe(true);
  remotes.event({ type: 'kill', victim: 2, killer: 1, weapon: null, how: 'rifle', clip: 'death_stand_head01' } as unknown as ServerEvent);
  // As the existing remoteSpawnPose regression, let the ordinary death play's
  // blend and one-shot reach its final key before checking the lying pose.
  let dead = frame(false, 1)[0]!;
  for (let i = 0; i < 20; i++) dead = frame(false, 1)[0]!;
  expect(dead.visible).toBe(true); expect(dead.held).toEqual([]); expect(remotes.targets.alive(2)).toBe(false);
  expect(dead.world[0]![13]).toBeCloseTo(2);
  const spawned = frame(true, 2)[0]!;
  expect(spawned.world[0]![13]).toBeCloseTo(11); expect(remotes.targets.alive(2)).toBe(true);
  remotes.dispose(); expect(remotes.targets.node(2, 'head')).toBeNull();
});
it('hides never-spawned ghosts and excludes hostage ids instead of drawing them as players', () => {
  const { remotes, frame } = rig();
  expect(frame(false)[0]!.visible).toBe(false);
  remotes.event({ type: 'welcome', hostages: [{ id: 2 }], turrets: [] } as unknown as ServerEvent);
  expect(frame(true)).toEqual([]); expect(remotes.report().unsupportedHostages).toEqual([2]);
  remotes.dispose();
});
it('reconciles a snapshot firearm pickup without writing a raised launcher into the firearm slot', () => {
  const { remotes, frame, kit } = rig();
  frame(true, 1, ITEM.M16_203); expect(kit()[0]).toBe(ITEM.M16_203);
  frame(true, 1, ITEM.LAW); expect(kit()[0]).toBe(ITEM.M16_203);
  remotes.dispose();
});
it('keeps a remote corpse through a real-time hitch while its death play advances only by simulation dt', () => {
  const death = clip('death_stand_head01', 2);
  death.parts[0]!.flags = 0x1c;
  death.parts[0]!.translations = Float32Array.from(Array.from({ length: 31 }, (_, frame) => [0, frame, 0]).flat());
  const normal = rig(death), hitch = rig(death);
  for (const test of [normal, hitch]) {
    test.frame(true, 1);
    test.remotes.event({ type: 'kill', victim: 2, killer: 1, weapon: null, how: 'rifle', clip: death.name } as unknown as ServerEvent);
    for (let i = 0; i < 6; i++) test.deadFrame(0.1, 0.1);
  }
  const before = hitch.remotes.root(2)!;
  const expected = normal.deadFrame(0.01, 0.01), actual = hitch.deadFrame(0.01, 20);
  // corpseShownS(..., 'other') is Infinity even in respawn: only the own corpse expires.
  expect(actual.visible).toBe(true);
  expect(actual.palette).toEqual(expected.palette);
  expect(hitch.remotes.root(2)).toBeGreaterThan(before);
  expect(hitch.remotes.root(2)).toBeLessThan(29);
  normal.remotes.dispose(); hitch.remotes.dispose();
});
it('keeps carrier gear arriving before a peer pose and across body rebuilds, then clears it when the seat leaves', () => {
  const { remotes, frame } = rig();
  remotes.setGearVisible(2, 'Satchel', true);
  expect(frame(true, 1)[0]!.gear?.get('Satchel')).toBe(true);
  remotes.frame(0.1, [], new PerspectiveCamera(), null);
  expect(frame(true, 2)[0]!.gear?.get('Satchel')).toBe(true);
  remotes.setGearVisible(2, 'Satchel', false);
  expect(frame(true, 2)[0]!.gear?.get('Satchel')).toBe(false);
  remotes.setGearVisible(2, 'Satchel', true);
  remotes.event({ type: 'left', id: 2 });
  expect(frame(true, 3)[0]!.gear?.get('Satchel')).toBe(false);
  remotes.dispose();
});
