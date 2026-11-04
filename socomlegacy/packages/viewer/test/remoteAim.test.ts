import { describe, expect, it, vi } from 'vitest';
import { Group, PerspectiveCamera, Scene } from 'three';
import { RemotePlayers } from '../src/remotePlayers';
import type { LoadedMap } from '../src/loadMap';
import { BodyFlag, type BodyState } from '../src/net/protocol';
import { bodyVolumes, rayBody, type StanceVolumes, type V3 } from '../src/net/hitVolumes';
import { DEFAULT_LIGHTING } from '../src/lighting';

/**
 * The others' bodies under the reticle (INT-NET-2; research 84 §19): `RemotePlayers.aimDistance`, the distance along
 * the eye's ray to the nearest living body the page draws -- the aim point `FUN_005aa6e0` takes on a body
 * (D:L464149-464170). Ported from Chris's browser-beta-v5 (`chris/browser-beta-integration` d578f347:
 * `test/remoteAim.test.ts`), re-targeted from his rendered skinned-mesh raycast to the room's capsules (`bodyVolumes`
 * / `rayBody`, what decides the hit): the page converges on the shape the room judges by. The body's view and `Play`
 * are stand-ins; the page's hit bodies are mocked empty, so each side takes the placeholder capsules -- the room's own
 * fallback (`Room.volumesOf` null), the same `bodyVolumes` either way.
 */
vi.mock('../src/bodyView', () => ({ buildBody: () => ({ group: new Group(), dispose: () => {} }) }));
vi.mock('../src/play', () => ({ Play: class {
  // These stand-ins never start a victory; stopping its empty state is inert (Play.stopVictory).
  stopVictory() {}
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
// A laid hit body carries its capsules outright (`volumes`), in place of a skeleton posed at its idles.
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
    const spine = (r: number): StanceVolumes => ({ stand: [{ part: 2, a: [0, 2, 0], b: [0, 18, 0], r }], crouch: [{ part: 2, a: [0, 2, 0], b: [0, 10, 0], r }], prone: [{ part: 2, a: [0, 1, 0], b: [0, 3, 0], r }] });
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

  it('a body no longer drawn (it left the snapshots) is none', () => {
    const { remote, frame } = rig([state(2, [0, 0, -60])]);
    frame([]);
    expect(remote.aimDistance(EYE, AHEAD, 1000)).toBeNull();
  });
});
