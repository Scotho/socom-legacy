// test/remoteRaiseWire.test.ts -- ENEMY-RAISE ER-2 (SCOPE.md s3.4 test 10's wiring; reading, pending review): a copy's
// raise takes its owner's state off the body (`BodyFlag.Raised`, the original's byte +0x7e: `FUN_002bd640` D:L161978,
// `FUN_002be150` D:L162310-162312), which `RemotePlayers` hands its `Play` as `WeaponInput.raised`; a body with no raise
// field (a replay recorded before protocol 14: `setRaiseField(false)`) hands none, and keeps the inference. The real
// `RemotePlayers` runs; only the body's view and `Play` are stand-ins (no body on disc here), as in `remotePlayers.test.ts`.
import { describe, expect, it, vi } from 'vitest';
import { Group, PerspectiveCamera, Scene } from 'three';
import { RemotePlayers } from '../src/remotePlayers';
import type { LoadedMap } from '../src/loadMap';
import { BodyFlag, type BodyState } from '../src/net/protocol';
import { DEFAULT_LIGHTING } from '../src/lighting';
import type { WeaponInput } from '../src/play';

const output = vi.hoisted(() => ({ readers: [] as (() => WeaponInput)[] }));
vi.mock('../src/bodyView', () => ({
  buildBody: () => ({ group: new Group(), dispose: () => {}, stats: { fittingNames: [] }, setGearVisible: () => {} }),
}));
vi.mock('../src/play', async () => { const { Group: G } = await import('three'); return { Play: class {
  launcher = new G(); hand = new G();
  launcherNode() { return this.launcher; }
  heldNode() { return this.hand; }
  setRifleStowed() {} stopVictory() {}
  setBody() {} setFlyToggle() {} setClips() {}
  setWeaponInput(read: () => WeaponInput) { output.readers.push(read); }
  setItem() {} setMounts() {} setWeapon() {} setSidearm() {}
  addPoseLayer() {} motionSource() { return null; } onEvent() {} respawn() {}
  frame() {}
  animStats() { return { clip: 'seal_idle', frame: 0, frames: 1 }; }
} }; });

const state = (flags: number): BodyState => ({
  id: 3, feet: [0, 0, 0], yaw: 0, pitch: 0, vx: 0, vy: 0, vz: 0,
  flags: BodyFlag.Alive | flags, stance: 0, landing: 0, jumps: 0,
  ground: 0, groundForward: 0, groundRight: 0, groundCls: -1, stickSnaps: 0,
  action: 0, actionSerial: 0, actionT: 0, actionSeconds: -1,
  overlay: 0, overlayT: 0, overlaySeconds: 0, turnRate: 0,
  trav: 0, travFrame: 0, travRootY: Number.NaN, travBlend: 0, travBlendWeight: 0, peek: 0, weapon: 255, slot: 0,
});

describe("ER-2: a copy's weapon input carries its owner's raise state", () => {
  it('RED 10: Raised on the body is `raised` to the copy\'s raise, beside the trigger and aim; cleared, down', () => {
    output.readers.length = 0;
    const remote = new RemotePlayers(new Scene()), camera = new PerspectiveCamera();
    remote.setMap({ body: {} } as LoadedMap, DEFAULT_LIGHTING, null);
    remote.frame(1 / 30, [state(BodyFlag.Raised)], camera);
    const read = output.readers.at(-1)!;
    expect(read()).toMatchObject({ trigger: false, aiming: false, raised: true });
    remote.frame(1 / 30, [state(BodyFlag.Aiming)], camera);              // the owner's take-up: its state down
    expect(read()).toMatchObject({ aiming: true, raised: false });
  });

  it('a replay before protocol 14 (setRaiseField(false)): no raise field, the copy infers from the trigger and aim', () => {
    output.readers.length = 0;
    const remote = new RemotePlayers(new Scene()), camera = new PerspectiveCamera();
    remote.setMap({ body: {} } as LoadedMap, DEFAULT_LIGHTING, null);
    remote.setRaiseField(false);
    remote.frame(1 / 30, [state(BodyFlag.Raised | BodyFlag.Trigger)], camera);
    const read = output.readers.at(-1)!;
    expect(read()).toEqual({ trigger: true, aiming: false });
    remote.setRaiseField(true);
    expect(read()).toMatchObject({ trigger: true, raised: true });
  });
});
