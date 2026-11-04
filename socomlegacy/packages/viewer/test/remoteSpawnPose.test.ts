// test/remoteSpawnPose.test.ts -- NU-12 B2 (research 328 R328.1-R328.3, §4.3 D5, §5 B2) through the real `Play`: another
// seat's copy at its seat's spawn draws `seal_stand` alone on the first frame that draws the spawn, as the original's
// rebuilt copy does (`FUN_00598b90` D:L455072-455081 at the round's reload, `FUN_00223680` D:L75920-75931; at a respawn
// `REMOTE_RESPAWN_REBUILD_READING`), its new stack's first play `Stand` with the push's blend timer zeroed
// (`FUN_0058c350` D:L447984-447993, `FUN_0058c600` D:L448130-448131). Only the body's view is a stand-in (no body on disc
// here, as `remotePlayers.test.ts`); the clips are synthetic with the disc's names: the root at 11 standing, 7 crouched,
// 2 lying; `seal_stand`'s `BlendTime` the golden's 0.5 (`motion-rdr.json`).
import { describe, expect, it, vi } from 'vitest';
import { Group, PerspectiveCamera, Scene } from 'three';
import { partMatrix, type MotionClip, type MotionPart } from '@s2u/scene';
import { RemotePlayers } from '../src/remotePlayers';
import type { LoadedBody } from '../src/body';
import type { LoadedMap } from '../src/loadMap';
import { BodyFlag, type BodyState } from '../src/net/protocol';
import { DEFAULT_LIGHTING } from '../src/lighting';

vi.mock('../src/bodyView', () => ({
  buildBody: () => {
    const group = new Group();
    return {
      group, dispose: () => {}, stats: { fittingNames: [] }, setGearVisible: () => false, setOpacity: () => {},
      setVisible: (on: boolean) => { group.visible = on; }, place: () => {}, setPose: () => {}, addProp: () => new Group(),
    };
  },
}));

const ROOTS: Record<string, number> = { seal_stand: 11, seal_crouch: 7, death_stand_chest01: 2 };
/** A still clip: the root at `y`, the left thigh turned `deg` about x. */
const posed = (name: string, y: number, deg = 0): MotionClip => ({
  name, version: 5, duration: 10 / 30, frameCount: 10, rate: 30, unknown10: -1, unknown14: 1, parts: [
    { index: 0, name: 'skel_root', flags: 0x3c, translations: Float32Array.of(0, y, 0), rotations: Float32Array.of(0, 0, 0, 1) },
    { index: 1, name: 'lthigh', flags: 0x3c, translations: Float32Array.of(1, -1, 0), rotations: Float32Array.of(Math.sin(deg * Math.PI / 360), 0, 0, Math.cos(deg * Math.PI / 360)) },
  ] as MotionPart[],
});
const row = (looped: boolean) => ({ looped, playback: 1, maxVelocity: -1, blendTime: 0.5, transitionA: null, transitionB: null, noInterrupt: null, callbacks: [] });
const CLIPS = {
  clips: Object.entries(ROOTS).map(([name, y]) => posed(name, y, name.startsWith('death') ? 80 : 0)),
  table: Object.keys(ROOTS).map((name): [string, ReturnType<typeof row>] => [name, row(!name.startsWith('death'))]),
};
const BODY = {
  character: null, model: 'test', dressedBy: 'test', subMeshes: [], fittings: [], missing: [], at: null, height: 20, eye: null,
  parts: [
    { name: 'skel_root', parent: -1, bindLocal: Array.from(partMatrix([0, 0, 0, 1], [0, 11, 0])), bbox: [] },
    { name: 'lthigh', parent: 0, bindLocal: Array.from(partMatrix([0, 0, 0, 1], [1, -1, 0])), bbox: [] },
    { name: 'rhand', parent: 0, bindLocal: Array.from(partMatrix([0, 0, 0, 1], [2, 4, 0])), bbox: [] },
  ],
} as unknown as LoadedBody;

/** Seat 3's body as the client draws it: alive or dead, its stance code, where, and its seat's spawns counted. */
const body = (alive: boolean, stance: number, x: number, spawns: number): BodyState & { spawns: number } => ({
  id: 3, feet: [x, 0, 0], yaw: 0, pitch: 0, vx: 0, vy: 0, vz: 0,
  flags: alive ? BodyFlag.Alive : 0, stance, landing: 0, jumps: 0,
  ground: 0, groundForward: 0, groundRight: 0, groundCls: -1, stickSnaps: 0,
  action: 0, actionSerial: 0, actionT: 0, actionSeconds: -1,
  overlay: 0, overlayT: 0, overlaySeconds: 0, turnRate: 0,
  trav: 0, travFrame: 0, travRootY: Number.NaN, travBlend: 0, travBlendWeight: 0, peek: 0, weapon: 255, slot: 0, spawns,
});

function rig() {
  const remote = new RemotePlayers(new Scene()), camera = new PerspectiveCamera();
  remote.setMap({ body: BODY } as unknown as LoadedMap, DEFAULT_LIGHTING, null);
  remote.setClips(CLIPS);
  const run = (b: BodyState & { spawns: number }, seconds: number): void => {
    for (let t = 0; t < seconds - 1e-9; t += 1 / 60) remote.frame(1 / 60, [b], camera);
  };
  return { remote, run, frame: (b: BodyState & { spawns: number }) => remote.frame(1 / 60, [b], camera) };
}

describe('NU-12 B2: the copy at its seat\'s spawn draws seal_stand alone, through the real Play (research 328 §5 B2)', () => {
  it('a corpse\'s copy (death_stand_chest01 at its last key), its seat spawned elsewhere: seal_stand at weight 1, no from', () => {
    const { remote, run, frame } = rig();
    run(body(true, 0, 0, 0), 0.5);
    remote.died(3, 'death_stand_chest01');
    run(body(false, 0, 0, 0), 2);                                    // the end screens: the corpse at its last key
    expect(remote.animStats(3)!.clip).toBe('death_stand_chest01');
    frame(body(true, 0, 400, 1));                                     // the spawn's body, at its slot
    expect(remote.animStats(3)).toMatchObject({ clip: 'seal_stand', from: null, blend: 1, play: 'idle:stand' });
  });

  it('a crouched survivor\'s copy at a round\'s start (alive to alive): seal_stand at weight 1, no from', () => {
    const { remote, run, frame } = rig();
    run(body(true, 1, 0, 4), 2);
    expect(remote.animStats(3)!.clip).toBe('seal_crouch');
    frame(body(true, 0, 400, 5));
    expect(remote.animStats(3)).toMatchObject({ clip: 'seal_stand', from: null, blend: 1, play: 'idle:stand' });
  });

  it('keyed on the spawn: a crouched copy standing up with no spawn still eases from seal_crouch', () => {
    const { remote, run, frame } = rig();
    run(body(true, 1, 0, 4), 2);
    frame(body(true, 0, 0, 4));
    expect(remote.animStats(3)).toMatchObject({ clip: 'seal_stand', from: 'seal_crouch' });
    expect(remote.animStats(3)!.blend).toBeLessThan(1);
  });
});
