import { describe, expect, it, vi } from 'vitest';
import { Group, PerspectiveCamera, Scene } from 'three';
import { RemotePlayers } from '../src/remotePlayers';
import type { LoadedMap } from '../src/loadMap';
import { BodyFlag, type BodyState } from '../src/net/protocol';
import { bodyVolumes, placedVolumes, rayBody, type BoneBox, type StanceVolumes, type V3 } from '../src/net/hitVolumes';
import { DEFAULT_LIGHTING } from '../src/lighting';

/**
 * The others' bodies under the reticle (INT-NET-2; research 84 §19): `RemotePlayers.aimDistance`, the distance along
 * the eye's ray to the nearest living body the page draws -- the aim point `FUN_005aa6e0` takes on a body
 * (D:L464149-464170). Ported from Chris's browser-beta-v5 (`chris/browser-beta-integration` d578f347:
 * `test/remoteAim.test.ts`), re-targeted from his rendered skinned-mesh raycast to the room's capsules (`bodyVolumes`
 * / `rayBody`, what decides the hit): the page converges on the shape the room judges by. The body's view and `Play`
 * are stand-ins; the page's hit bodies are mocked empty, so each side takes the placeholder capsules -- the room's own
 * fallback (`Room.volumesOf` null), the same `bodyVolumes` either way. BONE-BOXES (research 398 s1): a laid body is
 * hand-made bone boxes now (`box`, body frame, an identity bone), where it was hand-made capsules -- the same shapes'
 * extents, so every line below meets or misses as it did.
 */
vi.mock('../src/bodyView', () => ({ buildBody: () => ({ group: new Group(), dispose: () => {} }) }));
/** HIT-POSE: what a stand-in `Play` answers for its drawn body (`Play.drawnBody`): null (never played) by default. */
const DRAWN = vi.hoisted(() => ({ caps: null as unknown }));
vi.mock('../src/play', () => ({ Play: class {
  // These stand-ins never start a victory; stopping its empty state is inert (Play.stopVictory).
  stopVictory() {}
  drawnBody() { return DRAWN.caps; }
  setBody() {} setFlyToggle() {} setClips() {} setAnimSet() {} setWeaponInput() {} setItem() {} setMounts() {}
  setWeapon() {} setSidearm() {} addPoseLayer() {} motionSource() { return null; } onEvent() {} frame() {}
} }));
/** The page's hit bodies (`hitBodiesOfPage`): empty by default (the placeholder capsules); a test may lay its own. */
const PAGE = vi.hoisted(() => ({ bodies: { seal: [] as unknown[], terrorist: [] as unknown[], escortees: [] as unknown[] } }));
vi.mock('../src/teamBody', () => ({
  bodyForTeam: (map: { body?: unknown }) => map.body ?? null,
  escorteeBody: (map: { body?: unknown }) => map.body ?? null,
  hitBodiesOfPage: () => PAGE.bodies,
}));
// A laid hit body carries its boxes outright (`volumes`), in place of a skeleton posed at its idles.
const IDENTITY = Float32Array.of(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);
/** A hand-made bone box, body frame (x right, y up, z behind), on an identity bone. */
const box = (part: number, lo: V3, hi: V3): BoneBox => ({ part, bone: 0, box: Float32Array.of(...lo, ...hi), w: IDENTITY });
vi.mock('../src/net/hitVolumes', async (original) => ({ ...(await original<typeof import('../src/net/hitVolumes')>()), stanceVolumes: (b: { volumes: unknown }) => b.volumes }));

const state = (id: number, feet: V3, over: Partial<BodyState> = {}): BodyState => ({
  id, feet, yaw: 0, pitch: 0, vx: 0, vy: 0, vz: 0,
  flags: BodyFlag.Alive, stance: 0, landing: 0, jumps: 0,
  ground: 0, groundForward: 0, groundRight: 0, groundCls: -1, stickSnaps: 0,
  action: 0, actionSerial: 0, actionT: 0, actionSeconds: -1,
  overlay: 0, overlayT: 0, overlaySeconds: 0, turnRate: 0,
  trav: 0, travFrame: 0, travRootY: Number.NaN, travBlend: 0, travBlendWeight: 0, peek: 0, weapon: 255, slot: 0, ...over,
});

function rig(bodies: BodyState[]) {
  const remote = new RemotePlayers(new Scene()), camera = new PerspectiveCamera();
  remote.setMap({ body: {} } as LoadedMap, DEFAULT_LIGHTING, null);
  remote.frame(1 / 60, bodies, camera);
  return { remote, frame: (b: BodyState[]) => remote.frame(1 / 60, b, camera) };
}

const EYE: V3 = [0, 15, 0], AHEAD: V3 = [0, 0, -1];

describe('the others\' bodies under the reticle (RemotePlayers.aimDistance)', () => {
  it("HIT-POSE (research 217 s3.6): a played copy is met on its drawn skeleton's capsules (Play.drawnCapsules), as the room meets its live pose; a hostage stays on its idle set", () => {
    // The drawn body: one box 6 u to the right of the snapshot's feet (a pose the idle set does not have).
    const drawn = placedVolumes([0, 0, -60], 0, [box(2, [4.5, 2, -1.5], [7.5, 18, 1.5])]);
    DRAWN.caps = drawn;
    try {
      const { remote } = rig([state(2, [0, 0, -60])]);
      const right: V3 = [6, 10, 0];
      expect(remote.aimDistance(right, AHEAD, 1000)).toBeCloseTo(rayBody(right, AHEAD, 1000, drawn)!.t, 6);
      expect(remote.aimDistance(EYE, AHEAD, 1000)).toBeNull();                  // the idle set's line: not the drawn body
      expect(remote.aimBodies(right, AHEAD, 1000).map((h) => h.id)).toEqual([2]);
      // A hostage (an escortee) keeps its idle set whatever its copy draws (the room's `hostageVolumes`).
      const hostage = new RemotePlayers(new Scene()), camera = new PerspectiveCamera();
      hostage.setMap({ body: {} } as LoadedMap, DEFAULT_LIGHTING, null);
      hostage.setEscortee(240, 0);
      hostage.frame(1 / 60, [state(240, [0, 0, -60])], camera);
      expect(hostage.aimDistance(EYE, AHEAD, 1000)).toBeCloseTo(rayBody(EYE, AHEAD, 1000, bodyVolumes([0, 0, -60], 0, 'stand', null))!.t, 6);
    } finally {
      DRAWN.caps = null;
    }
  });

  it('HIT-POSE: a body on a turret is met on its idle set whatever its copy draws (HIT_POSE_MOUNT_READING \'idle\', as the room meets a mounted gunner)', () => {
    const drawn = placedVolumes([0, 0, -60], 0, [box(2, [4.5, 2, -1.5], [7.5, 18, 1.5])]);
    DRAWN.caps = drawn;
    try {
      const { remote } = rig([state(2, [0, 0, -60])]);
      remote.setMountPose((id) => (id === 2 ? { clip: 'seal_turret_hold', frame: 0, loop: true, rootY: null } : null));
      expect(remote.aimDistance(EYE, AHEAD, 1000)).toBeCloseTo(rayBody(EYE, AHEAD, 1000, bodyVolumes([0, 0, -60], 0, 'stand', null))!.t, 6);
      expect(remote.aimDistance([6, 10, 0], AHEAD, 1000)).toBeNull();          // the drawn pose's line: not judged on a turret
      remote.setMountPose(null);                                                // dismounted: the drawn skeleton again
      expect(remote.aimDistance([6, 10, 0], AHEAD, 1000)).toBeCloseTo(rayBody([6, 10, 0], AHEAD, 1000, drawn)!.t, 6);
    } finally {
      DRAWN.caps = null;
    }
  });

  it('meets the drawn body on the room\'s capsules, at the distance the room\'s rayBody gives', () => {
    const { remote } = rig([state(2, [0, 0, -60])]);
    const room = rayBody(EYE, AHEAD, 1000, bodyVolumes([0, 0, -60], 0, 'stand', null))!;
    expect(room).not.toBeNull();
    expect(remote.aimDistance(EYE, AHEAD, 1000)).toBeCloseTo(room.t, 6);
    expect(remote.aimDistance(EYE, AHEAD, 1000)!).toBeLessThan(60);          // its near side
    expect(remote.aimDistance([30, 15, 0], AHEAD, 1000)).toBeNull();          // a line beside it
    expect(remote.aimDistance(EYE, AHEAD, 50)).toBeNull();                    // past the reach
  });

  it('the nearest of two; a dead body is none', () => {
    const { remote, frame } = rig([state(2, [0, 0, -60]), state(3, [0, 0, -30])]);
    expect(remote.aimDistance(EYE, AHEAD, 1000)!).toBeLessThan(30);
    frame([state(2, [0, 0, -60]), state(3, [0, 0, -30], { flags: 0 })]);
    expect(remote.aimDistance(EYE, AHEAD, 1000)!).toBeGreaterThan(50);
    frame([state(2, [0, 0, -60], { flags: 0 }), state(3, [0, 0, -30], { flags: 0 })]);
    expect(remote.aimDistance(EYE, AHEAD, 1000)).toBeNull();
  });

  it('follows the drawn posture: a prone body is under a standing eye\'s line, met low', () => {
    const { remote } = rig([state(2, [0, 0, -60], { stance: 2 })]);
    expect(remote.aimDistance(EYE, AHEAD, 1000)).toBeNull();
    const low: V3 = [0, 1.5, 0];
    expect(remote.aimDistance(low, AHEAD, 1000)).toBeCloseTo(rayBody(low, AHEAD, 1000, bodyVolumes([0, 0, -60], 0, 'prone', null))!.t, 6);
  });

  it("aimBodies lists every living drawn body the ray meets, by id, at aimDistance's distances -- the hostage order's pick (HX-4a, ORDER_PICK_READING; FUN_005aa6e0)", () => {
    const { remote, frame } = rig([state(2, [0, 0, -60]), state(240, [0, 0, -30]), state(3, [30, 0, -30])]);
    const hits = remote.aimBodies(EYE, AHEAD, 1000);
    expect(hits.map((h) => h.id).sort()).toEqual([2, 240]);
    expect(Math.min(...hits.map((h) => h.distance))).toBeCloseTo(remote.aimDistance(EYE, AHEAD, 1000)!, 6);
    expect(hits.find((h) => h.id === 2)!.distance).toBeCloseTo(rayBody(EYE, AHEAD, 1000, bodyVolumes([0, 0, -60], 0, 'stand', null))!.t, 6);
    frame([state(2, [0, 0, -60]), state(240, [0, 0, -30], { flags: 0 })]);
    expect(remote.aimBodies(EYE, AHEAD, 1000).map((h) => h.id)).toEqual([2]);
    expect(remote.aimBodies(EYE, AHEAD, 50)).toEqual([]);
  });

  it("a hostage's body in aimBodies is its own character's capsules (escorteeVolumesOf, as aimDistance and the room's hostageVolumes take it), not SEAL type 0's (HX-OBEY, research 239 s9.3)", () => {
    // The page's bodies: a narrow SEAL and a wide hostage, each one standing capsule up the spine.
    const spine = (r: number): StanceVolumes => ({ stand: [box(2, [-r, 2, -r], [r, 18, r])], crouch: [box(2, [-r, 2, -r], [r, 10, r])], prone: [box(2, [-r, 1, -r], [r, 3, r])] });
    PAGE.bodies = { seal: [{ volumes: spine(2) }], terrorist: [], escortees: [{ volumes: spine(6) }] };
    try {
      const remote = new RemotePlayers(new Scene()), camera = new PerspectiveCamera();
      remote.setMap({ body: {} } as LoadedMap, DEFAULT_LIGHTING, null);
      remote.setEscortee(240, 0);                                                // the first escortee, as the welcome names it
      remote.frame(1 / 60, [state(2, [0, 0, -60]), state(240, [0, 0, -30])], camera);
      // A line 4 u beside both bodies' axes: the wide hostage meets it, the narrow SEAL does not.
      const beside: V3 = [4, 10, 0];
      const hits = remote.aimBodies(beside, AHEAD, 1000);
      expect(hits.map((h) => h.id)).toEqual([240]);
      expect(hits[0]!.distance).toBeCloseTo(rayBody(beside, AHEAD, 1000, bodyVolumes([0, 0, -30], 0, 'stand', spine(6)))!.t, 6);
      expect(hits[0]!.distance).toBeCloseTo(remote.aimDistance(beside, AHEAD, 1000)!, 6);
      // On SEAL type 0's capsules the hostage would not be met: that was the page's offer against the room's pick.
      expect(rayBody(beside, AHEAD, 1000, bodyVolumes([0, 0, -30], 0, 'stand', spine(2)))).toBeNull();
    } finally {
      PAGE.bodies = { seal: [], terrorist: [], escortees: [] };
    }
  });

  it("LEAN-HIT (issue #752): a leaning body is met on its lean set at the snapshot's peek -- aimDistance and aimBodies, as the room's rewound body", () => {
    // The page's SEAL: one standing capsule up the spine, and its right and left lean sets 4 u to each side (body frame
    // x right): the snapshot's peek (the held peek, `net/body.ts` quantised to -1 / 0 / 1) picks the set.
    const at = (x: number): StanceVolumes['stand'] => [box(2, [x - 1.5, 2, -1.5], [x + 1.5, 18, 1.5])];
    const lean: StanceVolumes = {
      stand: at(0), crouch: at(0), prone: at(0),
      lean: { stand: { l: at(-4), r: at(4) }, crouch: { l: at(-4), r: at(4) }, prone: { l: at(-4), r: at(4) } },
      leanPivot: { stand: { l: [0, 0, 0], r: [0, 0, 0] }, crouch: { l: [0, 0, 0], r: [0, 0, 0] }, prone: { l: [0, 0, 0], r: [0, 0, 0] } },
    };
    PAGE.bodies = { seal: [{ volumes: lean }], terrorist: [{ volumes: lean }], escortees: [] };
    try {
      const remote = new RemotePlayers(new Scene()), camera = new PerspectiveCamera();
      remote.setMap({ body: {} } as LoadedMap, DEFAULT_LIGHTING, null);
      const right: V3 = [4, 10, 0];                                              // yaw 0 faces -z: its right is +x
      remote.frame(1 / 60, [state(2, [0, 0, -60], { peek: 1 })], camera);
      expect(remote.aimDistance(right, AHEAD, 1000)).toBeCloseTo(rayBody(right, AHEAD, 1000, bodyVolumes([0, 0, -60], 0, 'stand', lean, null, 1))!.t, 6);
      expect(remote.aimBodies(right, AHEAD, 1000).map((h) => h.id)).toEqual([2]);
      expect(remote.aimDistance(EYE, AHEAD, 1000)).toBeNull();                  // the upright line: the body leaned off it
      remote.frame(1 / 60, [state(2, [0, 0, -60], { peek: -1 })], camera);
      expect(remote.aimDistance(right, AHEAD, 1000)).toBeNull();
      expect(remote.aimDistance([-4, 10, 0], AHEAD, 1000)).not.toBeNull();
      remote.frame(1 / 60, [state(2, [0, 0, -60], { peek: 0 })], camera);
      expect(remote.aimDistance(right, AHEAD, 1000)).toBeNull();
      expect(remote.aimBodies(right, AHEAD, 1000)).toEqual([]);
      expect(remote.aimDistance(EYE, AHEAD, 1000)).not.toBeNull();
    } finally {
      PAGE.bodies = { seal: [], terrorist: [], escortees: [] };
    }
  });

  it('a body no longer drawn (it left the snapshots) is none', () => {
    const { remote, frame } = rig([state(2, [0, 0, -60])]);
    frame([]);
    expect(remote.aimDistance(EYE, AHEAD, 1000)).toBeNull();
  });
});
