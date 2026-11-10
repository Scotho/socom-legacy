import { describe, expect, it, vi } from 'vitest';
import { CustomBlending, Group, Mesh, OneMinusSrcAlphaFactor, PerspectiveCamera, Scene, SrcAlphaFactor } from 'three';
import { DEFAULT_GRID_PARAMS, type MotionClip, type MotionPart } from '@s2u/scene';
import { RemotePlayers } from '../src/remotePlayers';
import type { LoadedBody } from '../src/body';
import type { LoadedMap } from '../src/loadMap';
import type { MotionEntry } from '../src/motionTable';
import type { PlayClips } from '../src/play';
import { BinocularPose } from '../src/binocularPose';
import { CIV_ANIMS, oneShotSeconds } from '../src/locomotion';
import { HOSTAGE_FADE_READING, HOSTAGE_HANDS_PLACEHOLDER, HOSTAGE_HIDDEN_READING } from '../src/net/escortee';
import { ACTION_CODES, BodyFlag, type BodyState } from '../src/net/protocol';
import { DEFAULT_LIGHTING } from '../src/lighting';
import { LOWER_DELAY, WeaponRaise } from '../src/weaponRaise';

/**
 * HX-2 (web sprint 31; research 238 §1, §3): a hostage on another page. The room names an id an escortee (HX-1's welcome
 * list and `hostageState`); `RemotePlayers` draws it on the escortee's body (`LoadedMap.types.escortees`, `chartype.rdr`
 * order), plays the No_weapon set by the body's stance code and its speed (199 §9, §12.10: 0x17 sub 3 `civ_stand`; sub
 * 2/5 `civ_stand2crouch` once then `civ_crouch`; state 9 stance 0 and `civ_walk/jog/run` by speed), hangs no weapon and
 * raises no binoculars, and fades it at 0.75 a second once rescued, hidden at 0 (`CAiSRescued::Tick` sub 2, D:L422191-422212;
 * 199 §2, §12.3). The real `Play`, `Animator` and `buildBody` run; the body and the clips are synthetic (the disc's are
 * pinned in `locomotion.test.ts` and `body.test.ts`).
 */

/** A body of three parts (the root, the hips, the right hand the held items hang from) and one skinned triangle. */
function body(model: string, character: string): LoadedBody {
  const I = Float32Array.of(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);
  const part = (name: string, parent: number) => ({ name, parent, bindLocal: Float32Array.from(I), bindWorld: Float32Array.from(I), bbox: Float32Array.of(-1, -1, -1, 1, 1, 1) });
  return {
    character, model, dressedBy: 'character.rdr', textureAsset: 'thcivpow',
    parts: [part('skel_root', -1), part('hips', 0), part('rhand', 1)],
    subMeshes: [{
      textureName: null, fog: false, positions: Float32Array.of(0, 0, 0, 1, 0, 0, 0, 1, 0), normals: Float32Array.of(0, 0, 1, 0, 0, 1, 0, 0, 1),
      uvs: new Float32Array(6), indices: Uint32Array.of(0, 1, 2), skinIndex: new Uint16Array(12), skinWeight: Float32Array.of(1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0),
    }],
    fittings: [], missing: [], at: null, height: 19, eye: null, carries: { rifle: null, pistol: null },
    stats: { vertices: 3, triangles: 1, parts: 3, subMeshes: 1, batches: 1, maxInfluences: 1, droppedWeight: 0, fittings: 0 },
  };
}

/** A clip of `frames` keys whose root travels `speed` a second along -z (as `locomotion.test.ts`'s). */
function clip(name: string, frames: number, speed = 0): MotionClip {
  const t: number[] = [];
  for (let i = 0; i <= frames; i++) { const d = (speed / 30) * (i === frames ? 0 : i); t.push(0, 10, -d); }
  const root: MotionPart = { index: 0, name: 'skel_root', flags: 0x1c, translations: Float32Array.from(t), rotations: Float32Array.of(0, 0, 0, 1) };
  return { name, version: 5, duration: frames / 30, frameCount: frames, rate: 30, unknown10: -1, unknown14: 1, parts: [root] };
}
const entry = (e: Partial<MotionEntry>): MotionEntry => ({
  looped: null, playback: null, maxVelocity: null, blendTime: null, transitionA: null, transitionB: null, noInterrupt: null, callbacks: [], ...e,
});
/** The No_weapon set's clips as motion.rdr rules them (research 189 §7; the disc's pinned in `locomotion.test.ts`). */
const CLIPS: PlayClips = {
  clips: [
    clip(CIV_ANIMS.stand, 7), clip(CIV_ANIMS.standToCrouch, 12), clip(CIV_ANIMS.crouch, 42),
    clip(CIV_ANIMS.walk, 21, 16.7), clip(CIV_ANIMS.jog, 22, 34.1), clip(CIV_ANIMS.run, 22, 55.4),
    clip('seal_stand', 16), clip('death_buddy_stand02', 19),
    clip('seal_fallbackwards01', 10), clip('seal_landbackwards01', 20),   // LATER 354: GLOBAL's, the No_weapon set's include
  ],
  table: [
    [CIV_ANIMS.stand, entry({ looped: true, playback: 4.6, maxVelocity: -0.1, transitionA: 0, transitionB: 0.1 })],
    [CIV_ANIMS.standToCrouch, entry({ looped: false, playback: 0.65, maxVelocity: -1 })],
    [CIV_ANIMS.crouch, entry({ looped: true, playback: 5.06, maxVelocity: -0.1, blendTime: 0.5 })],
    [CIV_ANIMS.walk, entry({ looped: true, playback: 1, maxVelocity: 6.5, transitionA: 0, transitionB: 2.9 })],
    [CIV_ANIMS.jog, entry({ looped: true, playback: 1, maxVelocity: 6.5, transitionA: 1.2, transitionB: 5.6 })],
    [CIV_ANIMS.run, entry({ looped: true, playback: 1, maxVelocity: 6.5, transitionA: 3.4, transitionB: 6.5 })],
    ['seal_stand', entry({ looped: true, playback: 6, maxVelocity: -0.1 })],
    ['death_buddy_stand02', entry({ looped: false, playback: 3, maxVelocity: -1, noInterrupt: 1 })],
    ['seal_fallbackwards01', entry({ looped: false, playback: 0.5, maxVelocity: -1, noInterrupt: 1 })],
    ['seal_landbackwards01', entry({ looped: false, playback: 1, maxVelocity: -1, noInterrupt: 1 })],
  ],
};

const state = (id: number, over: Partial<BodyState> = {}): BodyState => ({
  id, feet: [0, 0, 0], yaw: 0, pitch: 0, vx: 0, vy: 0, vz: 0,
  flags: BodyFlag.Alive, stance: 0, landing: 0, jumps: 0,
  ground: 0, groundForward: 0, groundRight: 0, groundCls: -1, stickSnaps: 0,
  action: 0, actionSerial: 0, actionT: 0, actionSeconds: -1,
  overlay: 0, overlayT: 0, overlaySeconds: 0, turnRate: 0,
  trav: 0, travFrame: 0, travRootY: Number.NaN, travBlend: 0, travBlendWeight: 0, peek: 0, weapon: 255, slot: 0, ...over,
});

function rig() {
  const scene = new Scene();
  const seal = body('seal_A_des', 'mp6_seal1');
  const escortees = [body('thai_biologist01', 'mp_fem1'), body('thai_biologist02', 'mp_fem2'), body('thai_wife', 'mp_fem3')];
  const map = { body: seal, terrorist: null, types: { seal: [seal], terrorist: [], escortees }, textures: {}, textureFlags: {} } as unknown as LoadedMap;
  const kitOf = vi.fn(() => ({ rifle: { object: new Group(), points: [] }, pistol: { object: new Group(), points: [] } }));
  const remote = new RemotePlayers(scene);
  remote.setMap(map, DEFAULT_LIGHTING, kitOf);
  remote.setClips(CLIPS);
  const camera = new PerspectiveCamera();
  const run = (b: BodyState, seconds: number) => { for (let t = 0; t < seconds - 1e-9; t += 1 / 60) remote.frame(1 / 60, [b], camera); };
  const drawn = () => scene.children.filter((c) => c.name.startsWith('body '));
  const meshes = () => { const out: Mesh[] = []; drawn()[0]!.traverse((o) => { if (o instanceof Mesh) out.push(o); }); return out; };
  return { remote, run, drawn, meshes, kitOf };
}

// The area (c) review's finding 6 (after area (a)'s fix in the room): a bot is hit on its type's volumes, whatever its
// drawn appearance -- the page's rays the room's.
describe('a regional appearance never moves the hit volumes: the type’s, as the room hits it (FBA.R10, finding 6)', () => {
  it('aimDistance and aimBodies take the native type’s capsules, not the wide regional body’s', () => {
    const native = body('native', 'native'), regional = body('regional', 'regional');
    regional.parts[1]!.bbox = Float32Array.of(-6, -6, -10, 6, 6, 10);
    const map: LoadedMap = {
      archive: 'SYN', camera: null, path: 'SYN.ZDB', name: 'synthetic', lines: null, world: [], props: [],
      textures: {}, textureFlags: {}, metersPerUnit: 0.1, lightRig: null, origin: [0, 0, 0], detail: {}, grid: DEFAULT_GRID_PARAMS,
      collision: { positions: new Float32Array(0), colors: new Uint8Array(0), polygons: 0 },
      slots: [], diagnostics: [], loadMs: 0, timings: { fetch: 0, decode: 0, postedAt: 0 },
      body: native, types: { seal: [native], terrorist: [] },
      characters: { catalogue: { region: 'russia', uniform: 'Scuba', choices: [], pool: { seal: [], terrorist: [] } }, bodies: { wide: regional }, diagnostics: [] },
    };
    const remote = new RemotePlayers(new Scene()), camera = new PerspectiveCamera();
    remote.setMap(map, DEFAULT_LIGHTING, null);
    remote.setCharacter(3, 'wide');
    const frame = (): void => { remote.frame(1 / 60, [state(2, { feet: [0, 0, -80] }), state(3, { feet: [0, 0, -40] })], camera); };
    frame();
    expect(remote.appearances().find((a) => a.id === 3)?.key).toBe('wide');
    // The regional hips (radius 6) would meet a ray at x=4; the type's radius-1 hips do not.
    expect(remote.aimDistance([4, 0, 0], [0, 0, -1], 1000)).toBeNull();
    expect(remote.aimBodies([4, 0, 0], [0, 0, -1], 1000)).toEqual([]);
    // Down the middle, body 3 (at z -40) is met on its type's capsule, nearer than body 2 (at z -80).
    const hits = remote.aimBodies([0, 0, 0], [0, 0, -1], 1000);
    const three = hits.find((h) => h.id === 3), two = hits.find((h) => h.id === 2);
    expect(three!.distance).toBeGreaterThan(35);
    expect(three!.distance).toBeLessThan(two!.distance);
    expect(remote.aimDistance([0, 0, 0], [0, 0, -1], 1000)).toBeCloseTo(three!.distance, 6);
  });
});

describe('a hostage on another page (RemotePlayers.setEscortee; research 238 §3)', () => {
  it('an id set as escortee 1 is drawn on thai_biologist02 with no weapon, no sidearm and no binoculars; stance 0 plays civ_stand, stance 1 civ_stand2crouch once then civ_crouch (HOSTAGE_CROUCH_CLIP_READING); moving at 20, 40 and 60 u/s plays civ_walk, civ_jog, civ_run', () => {
    const binocs = vi.spyOn(BinocularPose.prototype, 'update');
    const { remote, run, drawn, kitOf } = rig();
    remote.setEscortee(241, 1);
    // the item byte and the binoculars bit are ignored on an escortee (HOSTAGE_HANDS_PLACEHOLDER: what 0x7e does to it is unread)
    run(state(241, { weapon: 7, flags: BodyFlag.Alive | BodyFlag.Binoculars | BodyFlag.Aiming }), 0.5);
    expect(HOSTAGE_HANDS_PLACEHOLDER).toBe('ignored');
    expect(drawn().map((g) => g.name)).toEqual(['body thai_biologist02']);
    expect(kitOf).not.toHaveBeenCalled();
    expect(remote.weaponFrame(241)).toBeNull();
    expect(binocs).not.toHaveBeenCalled();
    expect(remote.animStats(241)!.clip).toBe('civ_stand');
    // down: the transition once (its one-shot's 0.546 s), then the crouch idle
    const down = state(241, { stance: 1, flags: BodyFlag.Alive | BodyFlag.Crouched });
    run(down, 0.1);
    expect(remote.animStats(241)!.clip).toBe('civ_stand2crouch');
    run(down, oneShotSeconds(0.65, 12) + 0.05);
    expect(remote.animStats(241)!.clip).toBe('civ_crouch');
    run(down, 2);
    expect(remote.animStats(241)!.clip).toBe('civ_crouch');                     // once, not again
    // by speed on the set's own bands (FUN_0058bdf0 over the No_weapon set): the heaviest node leads
    for (const [v, lead] of [[20, 'civ_walk'], [40, 'civ_jog'], [60, 'civ_run']] as const) {
      run(state(241, { vx: v * Math.SQRT1_2, vz: -v * Math.SQRT1_2 }), 0.3);
      expect(remote.animStats(241)!.clip, `${v} u/s`).toBe(lead);
    }
    // a player's id is drawn as before: its side's body, its kit hung
    remote.setTeam(3, 'seal');
    remote.frame(1 / 60, [state(3), state(241)], new PerspectiveCamera());
    expect(drawn().map((g) => g.name).sort()).toEqual(['body seal_A_des', 'body thai_biologist02']);
    expect(kitOf).toHaveBeenCalled();
    binocs.mockRestore();
  });

  it("LATER 354: a hostage the blast threw is drawn in its knock -- Fall backwards in the air, then Land backwards, dead (the No_weapon set includes GLOBAL)", () => {
    const { remote, run } = rig();
    remote.setEscortee(241, 1);
    run(state(241), 0.2);
    expect(remote.animStats(241)!.clip).toBe('civ_stand');
    const code = (name: typeof ACTION_CODES[number]): number => ACTION_CODES.indexOf(name) + 1;
    run(state(241, { flags: BodyFlag.Airborne, vx: 40, vy: 30, action: code('fallBackwards'), actionSerial: 1, actionT: 0.1, actionSeconds: -1 }), 0.1);
    expect(remote.animStats(241)!.clip).toBe('seal_fallbackwards01');
    run(state(241, { flags: 0, action: code('landBackwards'), actionSerial: 2, actionT: 0.1, actionSeconds: 1 }), 0.1);
    expect(remote.animStats(241)!.clip).toBe('seal_landbackwards01');
  });

  it("setOpacity fades the body's materials and hides it at 0 (HOSTAGE_FADE_READING, HOSTAGE_HIDDEN_READING); a dead escortee plays its TEAMMATE clip (HOSTAGE_DEATH_LIST_READING)", () => {
    const { remote, run, drawn, meshes } = rig();
    remote.setEscortee(240, 'mp_fem3');                                         // by its character, as the welcome names it
    run(state(240), 0.1);
    expect(drawn().map((g) => g.name)).toEqual(['body thai_wife']);
    expect(meshes().every((m) => (m.material as { opacity: number }).opacity === 1)).toBe(true);
    const wasTransparent = meshes().map((m) => (m.material as { transparent: boolean }).transparent);
    // a fixed opacity (the room's word, 191 §3.2's nibble)
    remote.setOpacity(240, 0.5);
    run(state(240), 0.1);
    expect(meshes().every((m) => (m.material as { opacity: number; transparent: boolean }).opacity === 0.5 && (m.material as { transparent: boolean }).transparent)).toBe(true);
    remote.setOpacity(240, 1);
    run(state(240), 0.1);
    expect(meshes().map((m) => (m.material as { transparent: boolean }).transparent)).toEqual(wasTransparent);
    // rescued: every console runs the fade itself at 0.75 a second (CAiSRescued::Tick sub 2, D:L422191-422212)
    expect(HOSTAGE_FADE_READING).toBe(0.75);
    remote.setOpacity(240, 1, true);
    run(state(240), 1);
    expect((meshes()[0]!.material as { opacity: number }).opacity).toBeCloseTo(0.25, 1);
    expect(drawn()[0]!.visible).toBe(true);
    run(state(240), 0.4);                                                       // 1.33 s in: 0, inactive
    expect(HOSTAGE_HIDDEN_READING).toBe('inactive: unpicked, unhit, unseen');
    expect(drawn()[0]!.visible).toBe(false);
    expect(remote.aimDistance([0, 10, 50], [0, 0, -1], 1000)).toBeNull();      // unpicked by the page's aim
    // a new body for the id (a new map, a respawn of the round) is drawn at the opacity kept for it, then shown again at 1
    remote.setOpacity(240, 1);
    run(state(240), 0.1);
    expect(drawn()[0]!.visible).toBe(true);
    // dead: the room's clip, from the TEAMMATE lists (`./net/deaths` deathClip(..., 'teammate'))
    remote.died(240, 'death_buddy_stand02');
    run(state(240, { flags: 0 }), 0.2);
    expect(remote.animStats(240)!.clip).toBe('death_buddy_stand02');
  });

  it("a fading hostage's materials blend by alpha (src SrcAlpha, dst OneMinusSrcAlpha) and get their own blend back at 1", () => {
    const { remote, run, meshes } = rig();
    remote.setEscortee(242, 2);
    run(state(242), 0.1);
    type Blend = { blending: number; blendSrc: number; blendDst: number; blendSrcAlpha: number | null; blendDstAlpha: number | null; transparent: boolean; depthWrite: boolean };
    const blend = () => meshes().map((m) => { const b = m.material as unknown as Blend; return { blending: b.blending, blendSrc: b.blendSrc, blendDst: b.blendDst, blendSrcAlpha: b.blendSrcAlpha, blendDstAlpha: b.blendDstAlpha, transparent: b.transparent, depthWrite: b.depthWrite }; });
    const own = blend();
    // buildBody's opaque draw is a copy (One, Zero): opacity alone would change nothing on screen
    remote.setOpacity(242, 1, true);
    run(state(242), 0.5);
    for (const b of blend()) {
      expect(b).toMatchObject({ blending: CustomBlending, blendSrc: SrcAlphaFactor, blendDst: OneMinusSrcAlphaFactor, transparent: true, depthWrite: false });
    }
    // the canvas's alpha stays untouched as every draw's (`./world` blendFactorsFor: alpha Zero, One)
    expect(blend().map((b) => [b.blendSrcAlpha, b.blendDstAlpha])).toEqual(own.map((b) => [b.blendSrcAlpha, b.blendDstAlpha]));
    remote.setOpacity(242, 1);
    run(state(242), 0.1);
    expect(blend()).toEqual(own);
  });
});

/**
 * PAR-34 group 5 (research 252 s3; ACT.R8): the rescued fade (`CAiSRescued::Tick` sub 2, D:L422191-422212;
 * `HOSTAGE_FADE_READING` a second) counts the frame's real seconds (`RemotePlayers.frame`'s `real`), so the hostage leaves
 * the aim (`HOSTAGE_HIDDEN_READING`) after the same real time at any frame rate. A 5-fps frame: 0.2 s real, 0.1 s clamped.
 */
describe('PAR-34 group 5: the rescued fade in real time at 5 fps (research 252 s3; ACT.R8)', () => {
  it('the rescued hostage is hidden 1 / HOSTAGE_FADE_READING s of real time after the fade starts (within a frame), not twice that', () => {
    const { remote, drawn } = rig();
    const camera = new PerspectiveCamera();
    remote.setEscortee(240, 'mp_fem3');
    remote.frame(0.1, [state(240)], camera, 0.2);
    remote.setOpacity(240, 1, true);
    let real = 0, gone: number | null = null;
    for (let i = 0; i < 100 && gone === null; i++) {
      remote.frame(0.1, [state(240)], camera, 0.2);
      real += 0.2;
      if (!drawn()[0]!.visible) gone = real;
    }
    expect(gone).toBeGreaterThanOrEqual(1 / HOSTAGE_FADE_READING - 1e-9);
    expect(gone).toBeLessThanOrEqual(1 / HOSTAGE_FADE_READING + 0.2 + 1e-9);            // the lane: 2.8 s
  });
});

/**
 * PAR-34 (review F2; research 252 s3; ACT.R8): another player's rifle is lowered `LOWER_DELAY` (5 s) of real time after
 * its trigger's last edge (`FUN_00594cf0`'s `ctrl+0x234`, the page's own in group 1): `RemotePlayers.frame` hands its
 * `real` to each body's `Play.frame`, whose raise counts it; the clips keep the clamped step. ENEMY-RAISE ER-2: that
 * countdown is a copy's only on a body with no raise field -- a replay recorded before protocol 14
 * (`RemotePlayers.setRaiseField(false)`, `REMOTE_HAND_RAISE_READING`); a live copy replays its owner's state
 * (`BodyFlag.Raised`, the original's byte +0x7e: `FUN_002be150` D:L162310-162312) and runs no countdown of its own.
 */
describe("PAR-34: another player's rifle lowered in real time at 5 fps (review F2; research 252 s3; ACT.R8)", () => {
  it("a pre-14 replay's copy (no raise field): its trigger let go, the raise asks it down LOWER_DELAY of real time later at 5 fps (within a frame), not 10 s", () => {
    const request = vi.spyOn(WeaponRaise.prototype, 'request');
    const { remote } = rig();
    const camera = new PerspectiveCamera();
    remote.setRaiseField(false);                                                         // ER-2: a recording before protocol 14
    remote.setTeam(3, 'seal');
    for (let i = 0; i < 3; i++) remote.frame(0.1, [state(3, { flags: BodyFlag.Alive | BodyFlag.Trigger })], camera, 0.2);
    remote.frame(0.1, [state(3)], camera, 0.2);                                         // the release's frame: its edge resets the countdown
    let real = 0, at: number | null = null;
    for (let i = 0; i < 100 && at === null; i++) {
      const n = request.mock.calls.length;
      remote.frame(0.1, [state(3)], camera, 0.2);
      real += 0.2;
      if (request.mock.calls.slice(n).some(([t]) => t === 2)) at = real;
    }
    expect(at).toBeCloseTo(LOWER_DELAY.base, 9);                                         // the lane: 10 s
    request.mockRestore();
  });

  it('ER-2, a live copy: Raised set holds it up with no trigger; cleared, the raise asks it down on that frame and the copy is fully down 0.5 s of game time later (the envelope runs on the clamped step, not the real time)', () => {
    const request = vi.spyOn(WeaponRaise.prototype, 'request');
    const { remote } = rig();
    const camera = new PerspectiveCamera();
    remote.setTeam(3, 'seal');
    for (let i = 0; i < 10; i++) remote.frame(0.1, [state(3, { flags: BodyFlag.Alive | BodyFlag.Raised })], camera, 0.2);
    expect(request.mock.calls.some(([t]) => t === 1)).toBe(true);                       // up from the owner's state alone
    expect(request.mock.calls.some(([t]) => t === 2)).toBe(false);                      // 2 s of real time, never asked down
    const n = request.mock.calls.length;
    const raise = vi.spyOn(WeaponRaise.prototype, 'frame');                             // its answer: the eased weight
    remote.frame(0.1, [state(3)], camera, 0.2);                                         // the owner's state down (say, a grenade taken up)
    expect(request.mock.calls.slice(n).some(([t]) => t === 2)).toBe(true);               // asked down on the frame that carries it
    expect(raise.mock.results.at(-1)?.value).toBeLessThan(1);                           // falling on that frame, not held 5 s
    let down: number | null = null, game = 0.1;
    for (let i = 0; i < 20 && down === null; i++) {
      if (raise.mock.results.at(-1)?.value === 0) { down = game; break; }
      remote.frame(0.1, [state(3)], camera, 0.2);
      game += 0.1;
    }
    expect(down).not.toBeNull();
    expect(down!).toBeLessThanOrEqual(0.5 + 0.1 + 1e-9);                                 // the 0.5 s out (`FUN_005dffc0`), within a step
    request.mockRestore(); raise.mockRestore();
  });
});
