import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Group, Matrix4, Mesh, Object3D, Quaternion, Scene, Vector3 } from 'three';
import { freezeSceneMatrix } from '../src/sceneMatrix';

/**
 * CPS H13 (plan 2026-11-02-client-performance-sprint, Log 2026-11-03T02:52Z, "Theory 5"; a CPU-side browser adaptation,
 * product track, CPS.R9 (e): the picture unchanged). The world's statics are frozen (`world.ts` `freezeStatic`), but a
 * `Scene` left auto-updating re-composes itself each frame, `updateMatrix` sets its `matrixWorldNeedsUpdate`, and three's
 * walk then forces every descendant's `matrixWorld = parent.matrixWorld * matrix` (three r186 `Object3D.js` 1161, 1176+).
 * `freezeSceneMatrix` composes the scene once and turns its auto-update off. Every object must end each frame with the
 * very `matrixWorld` the auto-updating scene gives it, element for element (`toEqual` compares with `Object.is`: a signed
 * zero counts).
 */

interface Variant {
  /** 'auto': three's default (the reference); 'helper': `freezeSceneMatrix`; 'bare': auto-update off, no add hook. */
  scene: 'auto' | 'helper' | 'bare';
  /** `effectLights.ts` `pair`: the overlay's copied matrix flagged (the fix) or not. */
  overlayFlag: boolean;
  /** `world.ts` `later`: a revealed static flagged as it joins the frozen group (the fix) or not. */
  queueFlag: boolean;
}
const FIXED: Variant = { scene: 'helper', overlayFlag: true, queueFlag: true };

const placed = (x: number, y: number, z: number, turn: number, s: number): Matrix4 =>
  new Matrix4().compose(new Vector3(x, y, z), new Quaternion().setFromAxisAngle(new Vector3(0.3, 1, 0.2).normalize(), turn), new Vector3(s, s, s));
const named = <T extends Object3D>(o: T, name: string): T => { o.name = name; return o; };

/** `world.ts` `freezeStatic`: the local matrix composed once, auto-update off. */
const freeze = (o: Object3D): void => o.traverse((c) => { if (!c.matrixAutoUpdate || c.userData.mover) return; c.updateMatrix(); c.matrixAutoUpdate = false; });

/** A frame's matrix work as the match does it: the character shadow's chain update, then the render's scene walk. */
function walk(scene: Scene, actor: Object3D): void {
  actor.parent?.updateWorldMatrix(true, false);      // `charShadow.ts` (the batch-2 review's F1)
  actor.updateMatrixWorld(true);
  actor.updateWorldMatrix(true, true);
  if (scene.matrixWorldAutoUpdate) scene.updateMatrixWorld();   // three's `render`
}

/** Builds the match's shapes and runs three frames, returning every object's `matrixWorld` after the build and each frame. */
function run(v: Variant): Map<string, number[]>[] {
  const scene = new Scene();
  if (v.scene === 'helper') freezeSceneMatrix(scene);
  if (v.scene === 'bare') { scene.updateMatrix(); scene.matrixAutoUpdate = false; }

  // The effects' groups (auto on): a mark written straight into `.matrix` with the flag (`world.ts` rider `set`, `fire.ts`
  // `detach`), and one placed with `updateMatrixWorld(true)` itself (`fire.ts` `placeClipped`, `effects.ts` footprints).
  const effects = named(new Group(), 'effects');
  scene.add(effects);
  const rider = named(new Mesh(), 'rider');
  rider.matrixAutoUpdate = false;
  effects.add(rider);
  const mark = named(new Mesh(), 'mark');
  effects.add(mark);
  // The body (auto on) and its held weapon (`play.ts` `hangHeld` / `placeHeld`: auto off, `fromArray` with the flag).
  const body = named(new Group(), 'body');
  scene.add(body);
  const actor = named(new Group(), 'actor');
  body.add(actor);
  const held = named(new Mesh(), 'held');
  held.matrixAutoUpdate = false;
  body.add(held);

  // The world (`world.ts` `buildWorld`): the group at the map's origin (a signed zero in it), statics, a mover with a
  // detail pass at the identity under it, every static frozen and the group's world matrix computed off the scene.
  const group = named(new Group(), 'world');
  group.position.set(12.5, -0, -3.75);
  const stat = named(new Mesh(), 'static');
  placed(4, 0.5, -9, 0.7, 0.93).decompose(stat.position, stat.quaternion, stat.scale);
  group.add(stat);
  const sub = named(new Mesh(), 'static.sub');
  sub.position.set(0.25, -0, 1.5);
  stat.add(sub);
  const mover = named(new Mesh(), 'mover');
  mover.userData.mover = true;
  group.add(mover);
  const detail = named(new Mesh(), 'mover.detail');
  mover.add(detail);
  const late = named(new Mesh(), 'revealed');   // queued by `later`, added a frame after the build
  placed(-7, 2, 3.5, -1.1, 1.07).decompose(late.position, late.quaternion, late.scale);
  late.updateWorldMatrix(false, false);
  for (const o of [group, late]) freeze(o);
  group.updateMatrixWorld(true);
  late.updateWorldMatrix(false, false);         // a read between the freeze and the add clears its flag off the group

  const overlay = named(new Mesh(), 'overlay');   // `effectLights.ts` `pair`: beside the static, under its parent

  const frames: Map<string, number[]>[] = [];
  const record = (): void => {
    const m = new Map<string, number[]>();
    scene.traverse((o) => m.set(o.name || o.type, Array.from(o.matrixWorld.elements)));
    frames.push(m);
  };
  walk(scene, actor);
  record();
  for (let f = 1; f <= 3; f++) {
    if (f === 1) scene.add(group);               // the world lands after the scene's first frames
    if (f === 2) {
      group.add(late);
      if (v.queueFlag) late.matrixWorldNeedsUpdate = true;
      stat.parent!.add(overlay);
      overlay.matrixAutoUpdate = stat.matrixAutoUpdate;
      overlay.matrix.copy(stat.matrix);
      if (v.overlayFlag) overlay.matrixWorldNeedsUpdate = true;
    }
    // What moves: the mover swings, the body walks, the rider rides, the held weapon is re-posed, a mark is placed.
    placed(1 + f, 0, -2 * f, 0.4 * f, 1).decompose(mover.position, mover.quaternion, mover.scale);
    body.position.set(3 * f, 0.5, -f);
    body.rotation.y = 0.3 * f;
    actor.position.set(0, 0.1 * f, 0);
    rider.matrix.copy(placed(f, -f, 0.5, 0.2 * f, 1));
    rider.matrixWorldNeedsUpdate = true;
    held.matrix.fromArray(placed(0.1, 1.2, f * 0.01, -0.5 * f, 1).toArray());
    held.matrixWorldNeedsUpdate = true;
    mark.matrixAutoUpdate = false;
    mark.matrix.copy(placed(-f, 0.05, 2, 0, 0.6));
    mark.updateMatrixWorld(true);
    walk(scene, actor);
    record();
  }
  return frames;
}

const reference = run({ scene: 'auto', overlayFlag: false, queueFlag: false });
const differs = (frames: Map<string, number[]>[], name: string): boolean =>
  frames.some((m, i) => JSON.stringify(m.get(name)?.map((x) => (Object.is(x, -0) ? '-0' : x))) !==
    JSON.stringify(reference[i]!.get(name)?.map((x) => (Object.is(x, -0) ? '-0' : x))));

describe('CPS H13: the scene composed once -- every matrixWorld the auto-updating scene gives', () => {
  it('freezeSceneMatrix: the scene composed at the identity, auto-update off, its first walk still flagged', () => {
    const scene = new Scene();
    freezeSceneMatrix(scene);
    expect(scene.matrixAutoUpdate).toBe(false);
    expect(scene.matrixWorldNeedsUpdate).toBe(true);
    expect(Array.from(scene.matrix.elements)).toEqual(Array.from(new Matrix4().elements));
  });

  it('every object, after the build and each of three frames, element for element (Object.is)', () => {
    const fixed = run(FIXED);
    expect(fixed.length).toBe(4);
    for (let i = 0; i < reference.length; i++) {
      expect([...fixed[i]!.keys()].sort()).toEqual([...reference[i]!.keys()].sort());
      for (const [name, elements] of reference[i]!) expect(fixed[i]!.get(name), `${name}, frame ${i}`).toEqual(elements);
    }
    expect(reference[3]!.size).toBe(14);   // the scene and its thirteen objects, every one compared
  });

  it('the controls: each fix is load-bearing -- without it the frozen scene gives another matrixWorld', () => {
    // The world group added to a frozen scene with no add hook: copied off the scene, not multiplied (the signed zero).
    expect(differs(run({ ...FIXED, scene: 'bare' }), 'world')).toBe(true);
    // The overlay's copied matrix unflagged: it keeps its new object's identity world matrix.
    expect(differs(run({ ...FIXED, overlayFlag: false }), 'overlay')).toBe(true);
    // The revealed static unflagged: its world matrix is its local one, off the group's origin.
    expect(differs(run({ ...FIXED, queueFlag: false }), 'revealed')).toBe(true);
    // The same three unflagged under the auto-updating scene: no difference (the forced walk covered them), and the
    // reference run is deterministic.
    const again = run({ scene: 'auto', overlayFlag: false, queueFlag: false });
    for (const name of ['world', 'overlay', 'revealed']) expect(differs(again, name), name).toBe(false);
  });

  it('source pins: the match page and the test room freeze their scene at its creation; the two flags are in place', () => {
    const src = (f: string): string => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8');
    expect(src('matchMount.ts')).toMatch(/const scene = new Scene\(\);\r?\n\s*freezeSceneMatrix\(scene\);/);
    expect(src('main.ts')).toMatch(/const scene = new Scene\(\);\r?\nfreezeSceneMatrix\(scene\);/);
    expect(src('world.ts')).toContain('queue.push(() => { group.add(object); object.matrixWorldNeedsUpdate = true; });');
    expect(src('effectLights.ts')).toContain('if (!m.matrixAutoUpdate) { o.matrix.copy(m.matrix); o.matrixWorldNeedsUpdate = true; }');
  });
});
