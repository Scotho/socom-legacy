// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Group, Matrix4, PerspectiveCamera } from 'three';
import { FsAssetSource } from '@s2u/archive/node';
import { partMatrix, type MotionClip, type MotionPart } from '@s2u/scene';
import { fixture } from '../../archive/test/fixtures';
import { FlyCamera } from '../src/camera';
import { buildBody, type BodyView } from '../src/bodyView';
import type { LoadedBody } from '../src/body';
import { DEFAULT_LIGHTING } from '../src/lighting';
import { loadMap, type LoadedMap } from '../src/loadMap';
import { packGround, WalkMode, EYE_HEIGHT, type GroundData, type Stance } from '../src/walk';
import { bodySkeleton, bodyVisible, eyePoint, ownBodyRead, Play, playActions, StanceButton, STANCE_HOLD_S_PLACEHOLDER, stanceOnHold, stanceOnTap, type PlayEvent } from '../src/play';
import { noInput } from '../src/gamepad';
import { corpseShownS } from '../src/net/deaths';
import type { Rules } from '../src/net/protocol';
import type { PlaySnapshot } from '../src/mover';
import { wrapYawRad } from '../src/yaw';
import { existsSync } from 'node:fs';

/**
 * W2.2b: the play mode is the walk mode with the body. Entering walk shows the SEAL at the mover's feet, facing the
 * look; the clips drive its skeleton; leaving hides it unless the panel's body switch asks for it in fly mode.
 */

const canvas = (): HTMLCanvasElement => {
  const c = document.createElement('canvas');
  c.setPointerCapture = () => undefined;
  c.releasePointerCapture = () => undefined;
  c.hasPointerCapture = () => false;
  return c;
};

/** A flat floor at y 0 over x, z -200..200, as the probe receives it. */
const GROUND: GroundData = packGround(
  { atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 },
  [{
    modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([-200, 0, -200, 200, 0, -200, 200, 0, 200, -200, 0, 200]),
  }],
  [{ modelName: 'worldmodel', path: 'worldmodel/floor', first: 0, count: 1 }],
);

describe('the mover as the body reads it (WalkMode.snapshot)', () => {
  const made: WalkMode[] = [];
  afterEach(() => { for (const m of made.splice(0)) m.unbindKey(); });
  const setUp = () => {
    const fly = new FlyCamera(canvas());
    const mode = new WalkMode(fly);
    mode.setGround(GROUND, [0, 0, 0]);
    made.push(mode);
    return { fly, mode };
  };

  it('is null in fly mode; walking, the drawn feet under the eye, the look\'s yaw, the velocity and the stance', () => {
    const { fly, mode } = setUp();
    expect(mode.snapshot()).toBeNull();
    fly.setPose({ x: 10, y: 50, z: 20, yaw: 30, pitch: -5 });
    mode.setMode('walk');
    const s = mode.snapshot()!;
    expect(s).toMatchObject({ feet: [10, 0, 20], yaw: expect.closeTo(30, 9), vx: 0, vz: 0, vy: 0, airborne: false, crouched: false, landing: null, jumps: 0 });
    // a part tick in hand: the feet are drawn between the last two ticks, as the camera is
    mode.walkFor(0.5, { forward: 1, right: 0, boost: false });
    mode.frame(0.004);
    const t = mode.snapshot()!;
    expect(t.feet).toEqual(mode.drawnFeet());
    expect(Math.hypot(t.vx, t.vz)).toBeGreaterThan(30);
  });

  it('counts the jumps it takes and carries the action by serial, so a take-off is seen even between two frames', () => {
    const { fly, mode } = setUp();
    fly.setPose({ x: 0, y: 50, z: 0, yaw: 0, pitch: 0 });
    mode.setMode('walk');
    expect(mode.jump()).toBe(true);
    const s = mode.snapshot()!;
    // standing still it is the standing jump: the Jump action on the floor (research 80)
    expect(s).toMatchObject({ airborne: false, jumps: 1, action: { name: 'jump', reversed: false } });
    expect(mode.jump()).toBe(false);                     // the Jump action holds: not counted
    expect(mode.snapshot()!.jumps).toBe(1);
    mode.walkFor(1.2, { forward: 1, right: 0, boost: false });
    expect(mode.jump()).toBe(true);                      // running now: the running jump, off the floor
    expect(mode.snapshot()).toMatchObject({ airborne: true, jumps: 2, action: { name: 'launch' } });
    expect(mode.snapshot()!.action!.serial).toBeGreaterThan(s.action!.serial);
    mode.walkFor(1.5, { forward: 0, right: 0, boost: false });
    mode.crouch(true);
    expect(mode.snapshot()!.crouched).toBe(true);
  });
});

describe("PF-17: the motion table to the walk (WalkMode.fireAllowed's NoFire)", () => {
  it('hands the walk the table with the action roots, once each time the clips change', () => {
    const got: (ReadonlyMap<string, unknown> | null)[] = [];
    const walk = { snapshot: () => null, view: () => 'third' as const, setActionRoots: () => undefined, setMotionTable: (t: ReadonlyMap<string, unknown> | null) => { got.push(t); } };
    const play = new Play();
    const entry = { looped: false, playback: 1, maxVelocity: -1, blendTime: null, transitionA: null, transitionB: null, noInterrupt: 1, noFire: 1, callbacks: [] };
    play.setClips({ clips: [still('seal_stand', 10)], table: [['seal_stand2prone', entry]] });
    const camera = new FlyCamera(canvas()).camera;
    play.frame(1 / 60, walk, camera);
    play.frame(1 / 60, walk, camera);
    expect(got).toHaveLength(1);
    expect(got[0]!.get('seal_stand2prone')).toMatchObject({ noFire: 1 });
    play.setClips(null);
    play.frame(1 / 60, walk, camera);
    expect(got).toEqual([got[0], null]);
  });
});

describe('who sees the body (W2.2b, W2.R1)', () => {
  it('shows it in the third-person play view, hides it in the scope, and in fly mode only when the switch asks', () => {
    expect(bodyVisible('third', false)).toBe(true);
    expect(bodyVisible('third', true)).toBe(true);
    expect(bodyVisible('scope', true)).toBe(false);
    expect(bodyVisible('fly', false)).toBe(false);
    expect(bodyVisible('fly', true)).toBe(true);
  });
});

/**
 * PAR-91 (research 317 R317.2, §1.2, §1.4, §5 B3; `OWN_BODY_FADE_READING`): the dying console's own body fades over
 * `BODY_FADE_S`, 10.0 s of real time, in a respawn game (`FUN_00552780` D:L418720-418743 sets the fade,
 * `FUN_00551ec0` D:L418492-418505 steps it on the actor update's dt) and never in classic (`FUN_005979a0`
 * D:L454485-454488, the spectate branch); a classic room waiting for both sides takes the respawn rule
 * (`CLASSIC_WAITING_PLACEHOLDER`). The material has no opacity (`BODY_FADE_PLACEHOLDER`): drawn whole, then hidden. The
 * clock is the frame's real seconds (PAR-34, `./frameTime`; `RemotePlayers`' `fadeAge`), not the clamped step: each frame
 * below is stepped 0.1 s (the mounts' clamp) while its real seconds run on. The rule reaches `Play.frame` from the mounts
 * as `corpseShownS(rules, 'own', waiting)`.
 */
describe("PAR-91: the own dead body hidden BODY_FADE_S of real time after the death in a respawn game, never in classic (research 317 B3)", () => {
  const SNAP = {
    feet: [0, 0, 0], yaw: 0, pitch: 0, vx: 0, vz: 0, vy: 0, airborne: false, crouched: false, stance: 'stand',
    landing: null, jumps: 0, ground: { state: 'idle' }, action: null, turnRate: 0,
  } as unknown as PlaySnapshot;
  /** A page's play over a stand-in body and walk: `step(real)` runs one frame and answers whether the body is drawn. */
  const page = (rules: Rules, waiting = false) => {
    const view = { group: new Group(), setVisible(on: boolean) { this.group.visible = on; }, place: () => undefined, setPose: () => undefined, setGearVisible: () => false, addProp: () => new Group() };
    const play = new Play();
    play.setBody(view as unknown as BodyView, null);
    const life = { dead: false };
    const walk = { snapshot: () => SNAP, view: () => 'third' as const, isDead: () => life.dead };
    const camera = new PerspectiveCamera();
    const step = (real: number): boolean => { play.frame(0.1, walk, camera, real, corpseShownS(rules, 'own', waiting)); return view.group.visible; };
    return { life, step, play, view };
  };

  it('RSP-6: the read-only own-corpse expiry follows its real rendered hide state, requires a body and clears at respawn', () => {
    const { life, step, play, view } = page('respawn');
    expect(play.ownCorpseExpired()).toBe(false);
    life.dead = true;
    expect(step(9.9)).toBe(true);
    expect(play.ownCorpseExpired()).toBe(false);
    expect(step(0.2)).toBe(false);
    expect(play.ownCorpseExpired()).toBe(true);
    play.setBody(null, null);
    expect(play.ownCorpseExpired()).toBe(false);
    play.respawn();
    play.setBody(view as unknown as BodyView, null);
    expect(play.ownCorpseExpired()).toBe(false);
    life.dead = false; step(0.1);
    expect(play.ownCorpseExpired()).toBe(false);
  });

  it('a respawn game: drawn at 9.9 s of real time after the death, hidden at 10.1 s and after, drawn again the frame it respawns; a second death counts afresh', () => {
    const { life, step } = page('respawn');
    expect(step(0.1)).toBe(true);                          // alive
    life.dead = true;
    expect(step(0.1)).toBe(true);                          // the death's frame: 0.1 s
    expect(step(9.8)).toBe(true);                          // 9.9 s
    expect(step(0.2)).toBe(false);                         // 10.1 s: hidden
    expect(step(30)).toBe(false);                          // 40.1 s, still dead: still hidden
    life.dead = false;
    expect(step(0.1)).toBe(true);                          // the respawn's frame
    life.dead = true;
    expect(step(9.9)).toBe(true);                          // the next death: 9.9 s from it
    expect(step(0.2)).toBe(false);
  });

  it('the clock is real seconds, not frames: 101 frames of 1/60 s (1.7 s) leave it drawn; one frame of 10.1 s hides it', () => {
    const { life, step } = page('respawn');
    life.dead = true;
    for (let i = 0; i < 101; i++) expect(step(1 / 60)).toBe(true);
    expect(step(10.1)).toBe(false);
  });

  it('a classic game: drawn at 11 s and at 60 s of real time after the death (the whole round)', () => {
    const { life, step } = page('classic');
    life.dead = true;
    expect(step(0.1)).toBe(true);
    expect(step(10.9)).toBe(true);                         // 11 s
    expect(step(49)).toBe(true);                           // 60 s
  });

  it('the classic waiting room takes the respawn rule (CLASSIC_WAITING_PLACEHOLDER): drawn at 9.9 s, hidden at 10.1 s', () => {
    const { life, step } = page('classic', true);
    life.dead = true;
    expect(step(9.9)).toBe(true);
    expect(step(0.2)).toBe(false);
  });

  it('a walk that tells no death (a stand-in, the fly camera) or no rule passed: never hidden by it', () => {
    const view = { group: new Group(), setVisible(on: boolean) { this.group.visible = on; }, place: () => undefined, setPose: () => undefined, setGearVisible: () => false, addProp: () => new Group() };
    const play = new Play();
    play.setBody(view as unknown as BodyView, null);
    const camera = new PerspectiveCamera();
    play.frame(0.1, { snapshot: () => SNAP, view: () => 'third' as const }, camera, 60, corpseShownS('respawn', 'own'));
    expect(view.group.visible).toBe(true);
    play.frame(0.1, { snapshot: () => SNAP, view: () => 'third' as const, isDead: () => true }, camera, 60);
    expect(view.group.visible).toBe(true);
  });
});

describe('the pad\'s lanes in play (W2.R5): jump on the press, crouch on the release', () => {
  it('jumps when the jump lane goes down, once however long it is held', () => {
    const up = { ...noInput(), jump: true };
    expect(playActions(noInput(), up)).toEqual({ jump: true, crouch: false });
    expect(playActions(up, up).jump).toBe(false);
    expect(playActions(up, noInput()).jump).toBe(false);
  });

  it('crouches when the crouch lane comes up (docs/PLAYTEST.md step 8: the game acts on the release)', () => {
    const held = { ...noInput(), crouch: true };
    expect(playActions(noInput(), held).crouch).toBe(false);
    expect(playActions(held, held).crouch).toBe(false);
    expect(playActions(held, noInput()).crouch).toBe(true);
  });

});

describe('the stance button (owner, 2026-09-28): a tap toggles crouch, a hold goes prone, a tap from prone stands', () => {
  const FRAME = 1 / 60;
  /** Holds the button for `seconds`, lets go, and returns every stance it asked for, in order. */
  const press = (b: StanceButton, from: Stance, seconds: number): Stance[] => {
    const asked: Stance[] = [];
    let now = from;
    for (let t = 0; t < seconds - 1e-9; t += FRAME) { const go = b.update(true, FRAME, now); if (go) { asked.push(go); now = go; } }
    const go = b.update(false, FRAME, now);
    if (go) asked.push(go);
    return asked;
  };

  it('names its hold threshold, a guess of 0.4 s', () => {
    expect(STANCE_HOLD_S_PLACEHOLDER).toBe(0.4);
  });

  it('a tap acts at the release: stand to crouch, crouch to stand, prone to stand', () => {
    const b = new StanceButton();
    expect(b.update(true, FRAME, 'stand')).toBeNull();             // nothing while it is down
    expect(b.update(false, FRAME, 'stand')).toBe('crouch');
    expect(press(new StanceButton(), 'crouch', 0.1)).toEqual(['stand']);
    expect(press(new StanceButton(), 'prone', 0.1)).toEqual(['stand']);
  });

  it('a hold acts when the threshold is reached, still down, and its release then does nothing', () => {
    const b = new StanceButton();
    let asked: string | null = null;
    let t = 0;
    while (asked === null && t < 2) { asked = b.update(true, FRAME, 'stand'); t += FRAME; }
    expect(asked).toBe('prone');
    expect(t).toBeGreaterThanOrEqual(STANCE_HOLD_S_PLACEHOLDER);
    expect(t).toBeLessThan(STANCE_HOLD_S_PLACEHOLDER + 2 * FRAME);
    expect(b.update(true, FRAME, 'prone')).toBeNull();             // held on: once, however long
    expect(b.update(false, FRAME, 'prone')).toBeNull();            // and the release is not a tap
    expect(press(new StanceButton(), 'crouch', 0.6)).toEqual(['prone']);
    expect(press(new StanceButton(), 'prone', 0.6)).toEqual(['stand']);   // a hold from prone stands, as the game's full press does
  });

  it('just short of the threshold is still a tap', () => {
    expect(press(new StanceButton(), 'stand', STANCE_HOLD_S_PLACEHOLDER - 2 * FRAME)).toEqual(['crouch']);
  });

  it('the next press starts fresh', () => {
    const b = new StanceButton();
    expect(press(b, 'stand', 0.6)).toEqual(['prone']);
    expect(press(b, 'prone', 0.1)).toEqual(['stand']);
    expect(press(b, 'stand', 0.1)).toEqual(['crouch']);
  });

  it('the two rules as functions', () => {
    expect(['stand', 'crouch', 'prone'].map((s) => stanceOnTap(s as Stance))).toEqual(['crouch', 'stand', 'stand']);
    expect(['stand', 'crouch', 'prone'].map((s) => stanceOnHold(s as Stance))).toEqual(['prone', 'prone', 'stand']);
  });
});

const MP2 = fixture('RUN/MP2.ZDB');
const FIXTURES = resolve(process.env.S2U_TEST_FIXTURES || resolve(dirname(fileURLToPath(import.meta.url)), '../../../test-fixtures'));

describe.skipIf(MP2 === null)('the SEAL on the mover (Frostfire\'s fixture)', () => {
  let map: LoadedMap;
  const loaded = async (): Promise<LoadedMap> => (map ??= await loadMap(new FsAssetSource(FIXTURES), 'RUN/MP2.ZDB'));

  it('builds the scene skeleton from the body\'s parts: the same 26 slots and bind pose the page\'s bones have', async () => {
    const body = (await loaded()).body!;
    const sk = bodySkeleton(body);
    expect(sk.parts.map((p) => p.name)).toEqual(body.parts.map((p) => p.name));
    body.parts.forEach((p, i) => {
      for (let k = 0; k < 16; k++) expect(sk.bindWorld[i]![k]!).toBeCloseTo(p.bindWorld[k]!, 4);
    });
  });

  it('puts a pose on the bones part by part, and stands the body at the feet facing the yaw', async () => {
    const map = await loaded();
    const view = buildBody(map.body!, map, DEFAULT_LIGHTING);
    const sk = bodySkeleton(map.body!);
    const turn = partMatrix([Math.sin(0.3), 0, 0, Math.cos(0.3)], [1, 2, 3]);
    sk.setLocal('rthigh', turn);
    view.setPose(sk.local);
    const bone = view.group.getObjectByName('rthigh')!;
    bone.updateMatrix();
    const want = new Matrix4().fromArray(turn);
    for (let k = 0; k < 16; k++) expect(bone.matrix.elements[k]!).toBeCloseTo(want.elements[k]!, 5);
    view.place([100, 42, -7], 90);
    expect(view.group.position.toArray()).toEqual([100, 42, -7]);
    expect(view.group.rotation.y).toBeCloseTo(Math.PI / 2, 9);           // the look's yaw, in three's turn about y
    expect(view.stats.at).toEqual([100, 42, -7]);
    expect(view.stats.yaw).toBeCloseTo(Math.PI / 2, 9);
    view.dispose();
  });

  it('lights the body on the GPU from its posed normals: the colour lane is the material, unity, whatever it faces', async () => {
    // Data quadword 338, the character's colour lane, is (128,128,128,128) in every skinning dump (logs/vu1dump3): the
    // skin carries unity and the rig lights it per vertex in the shader (`./rigShading`), from the normal as skinned
    // -- a turn or a raised arm is lit where it points, not re-lit on the CPU every ten degrees of the body's yaw.
    const map = await loaded();
    const view = buildBody(map.body!, map, { ...DEFAULT_LIGHTING, rig: map.lightRig });
    const skin = view.group.children.find((o) => o.type === 'SkinnedMesh') as unknown as { geometry: { getAttribute(n: string): { array: Float32Array } | undefined } };
    const colours = (): number[] => Array.from(skin.geometry.getAttribute('color')!.array);
    expect(colours().every((v) => v === 1)).toBe(true);
    expect(skin.geometry.getAttribute('normal')).toBeDefined();
    view.place(map.body!.at!.position, (map.body!.at!.yaw * 180) / Math.PI + 180);
    expect(colours().every((v) => v === 1)).toBe(true);
    // Every drawn mesh of the body -- skin and gear -- has a normal to light.
    view.group.traverse((o) => { if ((o as { isMesh?: boolean }).isMesh) expect((o as unknown as { geometry: { getAttribute(n: string): unknown } }).geometry.getAttribute('normal'), o.name).toBeDefined(); });
    view.dispose();
  });

  it('plays: walking shows the body at the feet in its clip, fly hides it unless switched on, and the bind stays at A until played', async () => {
    const map = await loaded();
    const fly = new FlyCamera(canvas());
    const walk = new WalkMode(fly);
    walk.setGround(GROUND, [0, 0, 0]);
    const view = buildBody(map.body!, map, DEFAULT_LIGHTING);
    const play = new Play();
    play.setBody(view, map.body!);
    play.setClips({ clips: [still('seal_stand', 10), still('seal_walk', 10)], table: null });
    const slotA = [...view.group.position.toArray()];
    play.frame(1 / 60, walk, fly.camera);
    expect(view.group.visible).toBe(false);                 // fly mode, switch off
    expect(view.group.position.toArray()).toEqual(slotA);  // not played yet: W2.1's bind pose at slot A
    expect(play.animStats()).toBeNull();
    play.setFlyToggle(true);
    play.frame(1 / 60, walk, fly.camera);
    expect(view.group.visible).toBe(true);
    fly.setPose({ x: 5, y: 40, z: 6, yaw: -45, pitch: 0 });
    walk.setMode('walk');
    play.frame(1 / 60, walk, fly.camera);
    expect(view.group.visible).toBe(true);
    expect(view.group.position.toArray()).toEqual([5, 0, 6]);
    expect(view.group.rotation.y).toBeCloseTo(wrapYawRad(-Math.PI / 4), 9);   // the yaw -45 is stored as 315 (yaw.ts)
    expect(play.animStats()).toMatchObject({ clip: 'seal_stand' });
    play.setFlyToggle(false);
    walk.setMode('fly');
    play.frame(1 / 60, walk, fly.camera);
    expect(view.group.visible).toBe(false);
    play.setFlyToggle(true);
    play.frame(1 / 60, walk, fly.camera);
    expect(view.group.visible).toBe(true);
    expect(view.group.position.toArray()).toEqual([5, 0, 6]);  // where the play left it
    view.dispose();
    walk.unbindKey();
  });

  it("hands the posed root to the walk's camera (FUN_0029a950) and tells the page the take-off, the steps and the landing", async () => {
    const map = await loaded();
    const fly = new FlyCamera(canvas());
    const walk = new WalkMode(fly);
    walk.setGround(GROUND, [0, 0, 0]);
    const view = buildBody(map.body!, map, DEFAULT_LIGHTING);
    const play = new Play();
    play.setBody(view, map.body!);
    const jump = still('seal_jump', 20);
    jump.parts[0]!.translations = Float32Array.from(Array.from({ length: 21 }, (_, i) => [0, i === 20 ? 11 : 11 + 4 * Math.sin((Math.PI * i) / 19), 0]).flat());
    jump.parts[0]!.flags = 0x1c;
    const run = still('seal_run', 19);
    run.parts[0]!.translations = Float32Array.from(Array.from({ length: 20 }, (_, i) => [0, 10.3, -(i === 19 ? 0 : i) * 1.923]).flat());
    run.parts[0]!.flags = 0x1c;
    play.setClips({ clips: [still('seal_stand', 16), jump, run], table: null });
    const events: PlayEvent[] = [];
    play.onEvent((e) => events.push(e));
    fly.setPose({ x: 0, y: 40, z: 0, yaw: 0, pitch: 0 });
    walk.setMode('walk');
    const frames = (n: number): void => { for (let i = 0; i < n; i++) { walk.frame(1 / 60); play.frame(1 / 60, walk, fly.camera); } };
    frames(30);
    expect(walk.cameraState()!.rootY).toBeCloseTo(11, 5);
    walk.jump();
    let top = 0;
    for (let i = 0; i < 40; i++) { frames(1); top = Math.max(top, walk.cameraState()!.rootY); }
    expect(top).toBeGreaterThan(13);                                  // the camera rose with the jump's root
    expect(events.filter((e) => e.kind === 'takeoff')).toEqual([{ kind: 'takeoff', running: false }]);
    // run, then a running jump: steps with the foot's world point, then the landing
    fly.setPose({ yaw: -90 });
    for (let i = 0; i < 60; i++) { walk.walkFor(1 / 60, { forward: 1, right: 0, boost: false }); play.frame(1 / 60, walk, fly.camera); }
    const steps = events.filter((e) => e.kind === 'footfall');
    expect(steps.length).toBeGreaterThan(1);
    const step = steps[0] as Extract<PlayEvent, { kind: 'footfall' }>;
    expect(step.position).not.toBeNull();
    expect(Math.abs(step.position![1])).toBeLessThan(20);
    walk.jump();
    for (let i = 0; i < 90; i++) { walk.walkFor(1 / 60, { forward: 1, right: 0, boost: false }); play.frame(1 / 60, walk, fly.camera); }
    expect(events.filter((e) => e.kind === 'takeoff').map((e) => (e as { running: boolean }).running)).toEqual([false, true]);
    const land = events.find((e) => e.kind === 'land') as Extract<PlayEvent, { kind: 'land' }>;
    expect(land.speed).toBeGreaterThan(60);
    expect(land.clip).toBeNull();                                     // the stick held: the run goes on
    view.dispose();
    walk.unbindKey();
  });

  it('reports the view: the game camera in play, the scope (the body hidden) while zoomed, fly otherwise', async () => {
    const map = await loaded();
    const fly = new FlyCamera(canvas());
    const walk = new WalkMode(fly);
    walk.setGround(GROUND, [0, 0, 0]);
    const view = buildBody(map.body!, map, DEFAULT_LIGHTING);
    const play = new Play();
    play.setBody(view, map.body!);
    play.setClips({ clips: [still('seal_stand', 10)], table: null });
    play.frame(1 / 60, walk, fly.camera);
    expect(play.viewStats().kind).toBe('fly');
    fly.setPose({ x: 5, y: 40, z: 6, yaw: 0, pitch: 0 });
    walk.setMode('walk');
    play.frame(1 / 60, walk, fly.camera);
    expect(play.viewStats().kind).toBe('third');
    expect(view.group.visible).toBe(true);
    walk.setScoped(true);
    play.frame(1 / 60, walk, fly.camera);
    expect(play.viewStats().kind).toBe('scope');
    expect(view.group.visible).toBe(false);
    walk.setScoped(false);
    play.frame(1 / 60, walk, fly.camera);
    expect(play.viewStats().kind).toBe('third');
    walk.setMode('fly');
    play.frame(1 / 60, walk, fly.camera);
    expect(play.viewStats().kind).toBe('fly');
    view.dispose();
    walk.unbindKey();
  });

  // LATER 203 (reading, pending review): under the launcher set (`DAT_0044d408`, made current by the raise `FUN_005a6d30`)
  // `FUN_0057a330` adds no Fire layer (D:L438829: the raise above 0 and the set not the launcher's) and reads the aim's
  // weight as 1.0 (D:L439153-439154); the launcher set records no Fire pair at all (research 215 §8.5). The page keeps the rifle's Fire versions keyed on the rifle's clips and drives both by the raise.
  it("RED: LATER 203 -- the launcher up (the rifle stowed): no Fire layer, the aim's weight 1, whatever the raise", async () => {
    const map = await loaded();
    const fly = new FlyCamera(canvas());
    const walk = new WalkMode(fly);
    walk.setGround(GROUND, [0, 0, 0]);
    const view = buildBody(map.body!, map, DEFAULT_LIGHTING);
    const play = new Play();
    play.setBody(view, map.body!);
    play.setWeapon(new Group(), [{ name: 'firepoint', at: [7.7854, 0.8338, 0] }]);
    play.setClips({ clips: [still('seal_stand', 10), still('seal_fp_stand', 8), still('seal_reload', 30)], table: null });
    play.setWeaponInput(() => ({ trigger: true, aiming: false }));
    fly.setPose({ x: 5, y: 40, z: 6, yaw: 0, pitch: 0 });
    walk.setMode('walk');
    play.setRifleStowed(true);                                       // the launcher up (`./matchThrow` `stowRifle`)
    for (let i = 0; i < 12; i++) play.frame(1 / 60, walk, fly.camera);
    expect(play.weaponStats().pose).toMatchObject({ fireWeight: 0 });  // today: 1, the rifle's Fire clip drawn
    expect((play as unknown as { aimWeight: number }).aimWeight).toBe(1);
    play.setRifleStowed(false);                                      // the launcher down: the rifle's raise again
    play.setWeaponInput(() => ({ trigger: false, aiming: false }));
    for (let i = 0; i < 400; i++) play.frame(1 / 60, walk, fly.camera);
    expect((play as unknown as { aimWeight: number }).aimWeight).toBe(play.weaponStats().raise.weight);
    view.dispose();
    walk.unbindKey();
  });

  it('WEAPON: hangs the rifle on the hand, raises it on the trigger, plays the reload, and gives the muzzle', async () => {
    const map = await loaded();
    const fly = new FlyCamera(canvas());
    const walk = new WalkMode(fly);
    walk.setGround(GROUND, [0, 0, 0]);
    const view = buildBody(map.body!, map, DEFAULT_LIGHTING);
    const play = new Play();
    play.setBody(view, map.body!);
    const rifle = new Group();
    play.setWeapon(rifle, [{ name: 'firepoint', at: [7.7854, 0.8338, 0] }]);
    expect(rifle.parent).toBe(view.group);                    // rides its mount in the body's frame (`mountMatrix`)
    expect(rifle.matrixAutoUpdate).toBe(false);
    const pistol = new Group();
    play.setSidearm(pistol, [{ name: 'firepoint', at: [1.4723, 0.5647, 0] }]);
    expect(pistol.parent).toBe(view.group);
    const hold = still('seal_fp_stand', 8);
    play.setClips({ clips: [still('seal_stand', 10), hold, still('seal_reload', 30)], table: null });
    let trigger = false;
    play.setWeaponInput(() => ({ trigger, aiming: false }));
    play.frame(1 / 60, walk, fly.camera);
    expect(rifle.visible).toBe(false);                         // never played: the bind pose holds nothing
    expect(play.muzzle()).toBeNull();
    fly.setPose({ x: 5, y: 40, z: 6, yaw: 0, pitch: 0 });
    walk.setMode('walk');
    play.frame(1 / 60, walk, fly.camera);
    expect(rifle.visible).toBe(true);
    expect(play.weaponStats()).toMatchObject({ held: true, raise: { state: 'down', weight: 0 }, pose: { fire: null } });
    const muzzle = play.muzzle()!;
    expect(Math.hypot(muzzle[0] - 5, muzzle[2] - 6)).toBeLessThan(20);      // at the body, in the world
    trigger = true;
    for (let i = 0; i < 12; i++) play.frame(1 / 60, walk, fly.camera);
    expect(play.weaponStats()).toMatchObject({ raise: { state: 'up', weight: 1 }, pose: { fire: 'seal_fp_stand', fireWeight: 1 } });
    trigger = false;
    expect(play.reloadSeconds()).toBe(1);                      // no table: the clip's 30 keys at 30 a second
    play.weaponEvent({ type: 'reloadStart', weapon: { name: 'M4A1', id: 54, fireAnim: null, sounds: { close: null, med: null, far: null, reload: null } }, seconds: 1 });
    play.frame(1 / 60, walk, fly.camera);
    expect(play.weaponStats().pose).toMatchObject({ reload: 'seal_reload' });
    // WEAPON: the pistol drawn (`./kit`'s mounts and item): the rifle slung, the pistol's muzzle the fire point
    expect(pistol.visible).toBe(true);                         // on the hips at spawn
    play.setItem('pistol');
    play.setMounts({ rifle: 'carry', pistol: 'hand' });
    play.frame(1 / 60, walk, fly.camera);
    expect(play.weaponStats()).toMatchObject({ item: 'pistol', mounts: { rifle: 'carry', pistol: 'hand' } });
    const hip = play.muzzle()!;
    expect(Math.hypot(hip[0] - 5, hip[2] - 6)).toBeLessThan(20);
    expect(hip).not.toEqual(muzzle);
    play.setMounts({ rifle: 'swap', pistol: 'spawn' });
    expect(play.muzzle()).toBeNull();                          // the item not in the hand: no fire point
    play.setItem('rifle');
    play.setMounts({ rifle: 'hand', pistol: 'spawn' });
    // the bomb carrier's satchel, where the body is dressed (character.rdr beside the fixture)
    expect(play.setGearVisible('Satchel', true)).toBe(map.body!.fittings.some((f) => f.name === 'Satchel'));
    view.dispose();
    walk.unbindKey();
  });

  /**
   * OBF-15 (OBF.R9): the victim's own body keeps no weapon its death dropped. The original's drop is the weapon node
   * itself, taken off the body's mount and the mount cleared (`FUN_0059f730` D:L458419-458432), so the dying console's
   * corpse holds nothing where its drop lies; the page held its rifle on the corpse's hand beside the room's drop.
   */
  it("OBF-15: a weapon dropped from the page's own body (`dropHeld`) is no longer drawn on its dead body, the other kept, a live one's kept; the respawn hangs it again", async () => {
    const map = await loaded();
    const fly = new FlyCamera(canvas());
    const walk = new WalkMode(fly);
    walk.setGround(GROUND, [0, 0, 0]);
    const view = buildBody(map.body!, map, DEFAULT_LIGHTING);
    const play = new Play();
    play.setBody(view, map.body!);
    const rifle = new Group(), pistol = new Group();
    play.setWeapon(rifle, [{ name: 'firepoint', at: [7.7854, 0.8338, 0] }]);
    play.setSidearm(pistol, [{ name: 'firepoint', at: [1.4723, 0.5647, 0] }]);
    play.setClips({ clips: [still('seal_stand', 10), still('seal_fp_stand', 8)], table: null });
    fly.setPose({ x: 5, y: 40, z: 6, yaw: 0, pitch: 0 });
    walk.setMode('walk');
    let dead = false;
    const seat = { snapshot: () => walk.snapshot(), view: () => walk.view(), isDead: () => dead };
    play.frame(1 / 60, seat, fly.camera);
    expect([rifle.visible, pistol.visible]).toEqual([true, true]);
    play.dropHeld('rifle');                                    // a live exchange's old rifle: the hand is the new kit's
    play.frame(1 / 60, seat, fly.camera);
    expect([rifle.visible, pistol.visible]).toEqual([true, true]);
    dead = true;                                               // the death: the dropped rifle off the corpse
    play.frame(1 / 60, seat, fly.camera);
    expect([rifle.visible, pistol.visible]).toEqual([false, true]);
    play.dropHeld('pistol');
    play.frame(1 / 60, seat, fly.camera);
    expect([rifle.visible, pistol.visible]).toEqual([false, false]);
    dead = false;
    play.respawn();
    play.frame(1 / 60, seat, fly.camera);
    expect([rifle.visible, pistol.visible]).toEqual([true, true]);
    view.dispose();
    walk.unbindKey();
  });

  /**
   * MATCH-FIX-2 (research 91 section 21, the review's finding 1): the page's own flinch poses its body in the scope
   * too, where the body is hidden -- the muzzle the round's leg starts from (`./fire`) and the posed root the camera
   * stands on (`setPosedRoot`, `FUN_0029a950`) follow the clip, as the game's posed actor would (FLINCH_LAYER_PLACEHOLDER).
   */
  it('MATCH-FIX-2: the own flinch moves the muzzle and the posed root, in the scope as in third person', async () => {
    const map = await loaded();
    const fly = new FlyCamera(canvas());
    const walk = new WalkMode(fly);
    walk.setGround(GROUND, [0, 0, 0]);
    const view = buildBody(map.body!, map, DEFAULT_LIGHTING);
    const play = new Play();
    play.setBody(view, map.body!);
    play.setWeapon(new Group(), [{ name: 'firepoint', at: [7.7854, 0.8338, 0] }]);
    const flinch = still('seal_flinch_rarm', 20);
    flinch.parts[0]!.translations = Float32Array.of(0, 8, 0);       // the root down 3 under the stand's 11
    play.setClips({ clips: [still('seal_stand', 10), still('seal_fp_stand', 8), flinch], table: null });
    fly.setPose({ x: 5, y: 40, z: 6, yaw: 0, pitch: 0 });
    walk.setMode('walk');
    for (const kind of ['scope', 'third'] as const) {
      const roots: (number | null)[] = [];
      const seen = { snapshot: () => walk.snapshot(), view: () => kind, setPosedRoot: (r: number | null) => { roots.push(r); } };
      walk.setFlinchPose(null);
      for (let i = 0; i < 30; i++) play.frame(1 / 60, seen, fly.camera);
      const standing = play.muzzle()!;
      expect(roots.at(-1)).toBeCloseTo(11, 3);
      walk.setFlinchPose(() => ({ clip: 'seal_flinch_rarm', frame: 3, loop: false, rootY: null }));
      for (let i = 0; i < 30; i++) play.frame(1 / 60, seen, fly.camera);
      expect(view.group.visible).toBe(kind !== 'scope');               // hidden in the scope, posed all the same
      expect(roots.at(-1)).toBeCloseTo(8, 3);
      expect(play.muzzle()![1]).toBeCloseTo(standing[1] - 3, 3);       // the round's leg starts from the flinched muzzle
    }
    view.dispose();
    walk.unbindKey();
  });
});

const SERVED = resolve(dirname(fileURLToPath(import.meta.url)), '../../../public/maps');
const dressed = existsSync(resolve(SERVED, 'RUN/READERC.ZAR')) && existsSync(resolve(SERVED, 'RUN/MP2.ZDB'));

describe.skipIf(!dressed)('the aim view\'s eye on the dressed SEAL (served tree)', () => {
  it('is the eye gear through the pose: 18.16 over the feet in the bind pose (research 78 §6.3), lower crouched', async () => {
    const map = await loadMap(new FsAssetSource(SERVED), 'RUN/MP2.ZDB');
    const sk = bodySkeleton(map.body!);
    const eye = eyePoint(map.body!, sk.palette())!;
    expect(eye[1]).toBeCloseTo(map.body!.eye!, 4);
    expect(eye[1]).toBeCloseTo(18.16, 2);
    expect(eye[2]).toBeLessThan(0);                                       // ahead of the head joint, along -z
    sk.setLocal('skel_root', partMatrix([0, 0, 0, 1], [0, 5.504, 0.5334]));   // the root down at the crouch's height
    sk.update();
    expect(eyePoint(map.body!, sk.palette())![1]).toBeCloseTo(18.16 - (11.67 - 5.504), 1);
  });
});

/** A clip holding the root at 11 and every other part at the bind. */
function still(name: string, frames: number): MotionClip {
  const parts: MotionPart[] = [{
    index: 0, name: 'skel_root', flags: 0x3c, translations: Float32Array.of(0, 11, 0), rotations: Float32Array.of(0, 0, 0, 1),
  }];
  return { name, version: 5, duration: frames / 30, frameCount: frames, rate: 30, unknown10: -1, unknown14: 1, parts };
}

// Victory events use the production Play state, including delayed asset installation.
describe("PB-1: the own body's gear (the bomb carrier's satchel)", () => {
  it("keeps the gear shown across a new body: a body built while this page carries the bomb wears the Satchel, as RemotePlayers keeps it by id", () => {
    const calls: string[] = [];
    const fake = (tag: string): BodyView => ({
      group: new Group(),
      setGearVisible: (name: string, on: boolean) => { calls.push(`${tag} ${name} ${on}`); return true; },
    }) as unknown as BodyView;
    const play = new Play();
    expect(play.setGearVisible('Satchel', true)).toBe(false);              // no body yet: kept for the next one
    play.setBody(fake('a'), null);
    expect(calls).toEqual(['a Satchel true']);
    expect(play.setGearVisible('Satchel', false)).toBe(true);
    play.setBody(fake('b'), null);                                         // hidden: the new body's own HIDDEN_AT_SPAWN stands
    expect(calls).toEqual(['a Satchel true', 'a Satchel false']);
    play.setGearVisible('Satchel', true);
    play.setBody(fake('c'), null);
    expect(calls).toEqual(['a Satchel true', 'a Satchel false', 'b Satchel true', 'c Satchel true']);
  });

  it("PB.R2's goldens: shownGear() reads the gear shown beyond the body's own, a copy -- the Satchel from setGearVisible on until off; ownBodyRead adds the clips and the mounts", () => {
    const play = new Play();
    expect(play.shownGear()).toEqual([]);
    play.setGearVisible('Satchel', true);
    const shown = play.shownGear();
    expect(shown).toEqual(['Satchel']);
    shown.length = 0;                                                      // a copy: the read changes nothing
    expect(play.shownGear()).toEqual(['Satchel']);
    // PB-2b F5: the rifle's muzzle as drawn (`weaponStats().muzzle`, world; null before a pose), so both pages' specs can
    // read where the hold leaves the rifle. Was: no muzzle.
    expect(ownBodyRead(play, { stats: () => ({ clip: 'seal_place_claymore' }) })).toEqual({
      gear: ['Satchel'], clip: null, frame: null, throwClip: 'seal_place_claymore', mounts: play.weaponStats().mounts, muzzle: null,
    });
    play.setGearVisible('Satchel', false);
    expect(play.shownGear()).toEqual([]);
  });
});

describe('victory playback events', () => {
  it('deduplicates, stops on cancellation and reset, and waits for original assets without a substitute', () => {
    const play = new Play();
    expect(play.startVictory(1, 'victory_funky')).toBe(false);
    expect(play.victoryActive()).toBe(true);
    expect(play.victoryState()).toBeNull();
    play.stopVictory(); expect(play.victoryActive()).toBe(false);
    const entry = { playback: 2.5, looped: false, maxVelocity: -.1, blendTime: null, transitionA: null, transitionB: null, noInterrupt: null, callbacks: [] };
    play.setClips({ clips: [still('victory_funky', 85)], table: [['victory_funky', entry]] });
    expect(play.startVictory(1, 'victory_funky', .5)).toBe(true);
    expect(play.victoryState()).toMatchObject({ clip: 'victory_funky', frames: 85, elapsed: .5 });
    expect(play.startVictory(1, 'victory_funky')).toBe(false);
    play.stopVictory(); expect(play.victoryActive()).toBe(false);
    expect(play.startVictory(1, 'victory_funky')).toBe(false);
    play.resetVictory(); expect(play.startVictory(1, 'victory_funky')).toBe(true);
  });
});

/**
 * NU-12 B1 (research 328 R328.1-R328.4, §1.3, §2, §5 B1; the owner's NU.R4: "players are doing a stand up animation
 * instead of already being ready"): the original rebuilds the body at every spawn -- a round's start, a respawn, the next
 * match in one mount (`FUN_00598b90` -> `FUN_00599b60` D:L455158 -> `FUN_00553ea0` D:L455663, a new stack D:L419420) --
 * and pushes `Stand` in state 0 with the push's blend timer zeroed (`FUN_0058c350` D:L447984-447993; `FUN_0058c600`
 * D:L448130-448131; the second timer `+0x10d0` D:L419725): the first frame draws `seal_stand` alone, nothing of the last
 * pose (`SPAWN_FIRST_POSE_READING`, `'stand at once'`, *note only*). The page's own body meets it at the walk's spawn
 * (`WalkMode.spawns`, counted by `respawn`): the body's animation is dropped as `setBody` drops it (`Play.respawn`), so
 * the first frame after the spawn starts `idle:stand` with no frozen pose. Synthetic clips with the disc's names: the
 * root at 11 standing, 7 crouched, 3 prone, 2 lying; `seal_stand`'s `BlendTime` the golden's 0.5 (`motion-rdr.json`).
 */
describe('NU-12 B1: the own body starts its new life on seal_stand, no blend from the last pose (research 328 §5 B1)', () => {
  const ROOTS: Record<string, number> = { seal_stand: 11, seal_p_stand: 11, seal_crouch: 7, seal_p_crouch: 7, seal_prone: 3, seal_p_prone: 3, death_stand_head01: 2, death_crouch_head01: 2 };
  /** A still clip: the root at `y`, the left thigh turned `deg` about x, held over `frames` keys. */
  const posed = (name: string, frames: number, y: number, deg = 0): MotionClip => ({
    name, version: 5, duration: frames / 30, frameCount: frames, rate: 30, unknown10: -1, unknown14: 1, parts: [
      { index: 0, name: 'skel_root', flags: 0x3c, translations: Float32Array.of(0, y, 0), rotations: Float32Array.of(0, 0, 0, 1) },
      { index: 1, name: 'lthigh', flags: 0x3c, translations: Float32Array.of(1, -1, 0), rotations: Float32Array.of(Math.sin(deg * Math.PI / 360), 0, 0, Math.cos(deg * Math.PI / 360)) },
    ] as MotionPart[],
  });
  const row = (looped: boolean, blendTime: number) => ({ looped, playback: 1, maxVelocity: -1, blendTime, transitionA: null, transitionB: null, noInterrupt: null, callbacks: [] });
  const CLIPS = {
    clips: Object.entries(ROOTS).map(([name, y]) => posed(name, 10, y, name.startsWith('death') ? 80 : name.includes('_p_') ? 20 : 0)),
    table: Object.keys(ROOTS).map((name): [string, ReturnType<typeof row>] => [name, row(!name.startsWith('death'), 0.5)]),
  };
  /** skel_root -> lthigh, skel_root -> rhand: a body with the hand the held nodes hang from. */
  const BODY = {
    character: null, model: 'test', dressedBy: 'test', subMeshes: [], fittings: [], missing: [], at: null, height: 20, eye: null,
    parts: [
      { name: 'skel_root', parent: -1, bindLocal: Array.from(partMatrix([0, 0, 0, 1], [0, 11, 0])), bbox: [] },
      { name: 'lthigh', parent: 0, bindLocal: Array.from(partMatrix([0, 0, 0, 1], [1, -1, 0])), bbox: [] },
      { name: 'rhand', parent: 0, bindLocal: Array.from(partMatrix([0, 0, 0, 1], [2, 4, 0])), bbox: [] },
    ],
  } as unknown as LoadedBody;
  const STAND = {
    feet: [0, 0, 0], yaw: 0, pitch: 0, vx: 0, vz: 0, vy: 0, airborne: false, crouched: false, stance: 'stand',
    landing: null, jumps: 0, ground: { state: 'idle', forward: 0, right: 0, cls: -1 }, action: null, turnRate: 0,
  } as unknown as PlaySnapshot;
  const lying = (clip: string): PlaySnapshot => ({ ...STAND, traversal: { clip, frame: 9, loop: false, rootY: null } }) as PlaySnapshot;
  const CROUCHED = { ...STAND, stance: 'crouch', crouched: true } as PlaySnapshot;
  const PRONE = { ...STAND, stance: 'prone' } as PlaySnapshot;
  const DT = 1 / 60;

  /** A page's play over the synthetic body, and a stand-in walk whose spawns the test counts. */
  const rig = () => {
    const view = { group: new Group(), setVisible(on: boolean) { this.group.visible = on; }, place: () => undefined, setPose: () => undefined, setGearVisible: () => false, addProp: () => new Group() };
    const play = new Play();
    play.setBody(view as unknown as BodyView, BODY);
    play.setClips(CLIPS);
    const life = { snap: STAND, spawns: 0, dead: false, posed: [] as (number | null)[] };
    const walk = {
      snapshot: () => life.snap, view: () => 'third' as const, isDead: () => life.dead, spawns: () => life.spawns,
      setPosedRoot: (y: number | null) => { life.posed.push(y); },
    };
    const camera = new PerspectiveCamera();
    const run = (seconds: number): void => { for (let t = 0; t < seconds - 1e-9; t += DT) play.frame(DT, walk, camera); };
    const frame = (): void => play.frame(DT, walk, camera);
    return { play, life, run, frame };
  };
  /** The root a fresh mount's play draws on its first frame (T1's pin: no `from`). */
  const freshRoot = (): number => {
    const { play, frame } = rig();
    frame();
    expect(play.animStats()).toMatchObject({ clip: 'seal_stand', from: null, blend: 1 });
    return play.rootY()!;
  };

  it('T1 pin: a fresh mount draws seal_stand on its first frame with no from, at weight 1', () => {
    expect(freshRoot()).toBeCloseTo(11, 6);
  });

  for (const [what, before] of [['a corpse on death_stand_head01', lying('death_stand_head01')], ['a crouch idle', CROUCHED], ['a prone idle', PRONE]] as const) {
    it(`from ${what}: the first frame after the spawn draws seal_stand at weight 1, no from, the root the standing one`, () => {
      const { play, life, run, frame } = rig();
      run(0.5);
      life.snap = before; life.dead = before.traversal !== undefined;
      run(2);                                                       // the end screens: the last pose held
      expect(play.animStats()!.clip).not.toBe('seal_stand');
      life.dead = false; life.snap = STAND; life.spawns++;          // the walk's respawn: a new mover, standing
      frame();
      expect(play.animStats()).toMatchObject({ clip: 'seal_stand', from: null, blend: 1, play: 'idle:stand' });
      expect(play.rootY()).toBeCloseTo(freshRoot(), 6);
      expect(life.posed.at(-1)).toBeCloseTo(11, 6);                 // the camera's posed root: standing from that frame
    });
  }

  it('D3 pinned: a pistol death re-kitted to the rifle at the spawn (spawnKit) draws the rifle\'s seal_stand at weight 1, no second freeze', () => {
    const { play, life, run, frame } = rig();
    play.setItem('pistol');
    run(0.5);
    life.snap = lying('death_stand_head01'); life.dead = true;
    run(2);
    play.setItem('rifle');                                          // `matchFirearm` `spawnKit` at the spawn event
    life.dead = false; life.snap = STAND; life.spawns++;
    frame();
    expect(play.animStats()).toMatchObject({ clip: 'seal_stand', from: null, blend: 1, layer: null });
    expect(play.rootY()).toBeCloseTo(freshRoot(), 6);
  });

  it('keyed on the spawn: a crouched body that stands with no spawn still eases from seal_crouch over its BlendTime', () => {
    const { play, life, run, frame } = rig();
    life.snap = CROUCHED;
    run(1);
    life.snap = STAND;
    frame();
    expect(play.animStats()).toMatchObject({ clip: 'seal_stand', from: 'seal_crouch' });
    expect(play.animStats()!.blend).toBeLessThan(1);
  });
});
