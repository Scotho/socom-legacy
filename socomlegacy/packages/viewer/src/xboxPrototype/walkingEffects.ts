import { Euler, Group, Matrix4, Quaternion, Vector3, type Camera, type Object3D } from 'three';
import {
  launchMotion, launchTracer, NODE_CALLER, NODE_ROOT, probeFloor, segmentHit, stepMotion, stepTracer, tracerHead,
  GAME_FRAME_DT, TRACER_ANIM, TRACER_POOL,
  type EffectCondition, type EffectContext, type EffectOp, type EffectProgram, type Grid, type MotionState, type MotionWorld,
  type ObjectMotion, type TracerFlight, type TracerKind,
} from '@s2u/scene';
import { fixSoundName } from '@s2u/sound';
import type { EffectData, EffectTexture } from '../effectData';
import type { EffectHandle } from '../effects';
import { EffectRun, indoorsOperand, type EffectHost, type OpTick } from '../effectRunner';
import {
  impactAnimation, MAX_EFFECT_RUNS_ADAPTATION, muzzleAnimation, rangeTestHolds, TRACER_OBJECT_SCALE, valveApply, valveTest, ZANIM_GRAVITY,
} from '../effectRules';
import type { FireEvent } from '../fireCore';
import { cameraFloor } from '../floorPick';
import { ParticleGeometry } from '../particleGeometry';
import { EffectMeshFrame, EffectMeshStyle, ParticleStyle } from './particleStyle';

type Vec3 = [number, number, number];

/** A caller's node: a world matrix its owner moves in place, or one asked for afresh on each tick that places something at it. */
export type WalkingCallerNode = Matrix4 | (() => Matrix4 | null);
export interface WalkingEffectPlace extends EffectContext { node?: WalkingCallerNode | null }

/** One packet of an effect model: its lanes in its node's frame, and how it is drawn. */
interface ModelMesh { positions: Float32Array; uvs: Float32Array; colors: Float32Array; indices: ArrayLike<number>; style: EffectMeshStyle }
interface Instance { object: Object3D; model: string; draws: { node: Object3D; meshes: readonly ModelMesh[] }[] }
interface RunContext { place: WalkingEffectPlace; instance: Instance | null; ambient?: boolean; parent?: EffectRun; round?: boolean }
interface LiveTracer { kind: TracerKind; flight: TracerFlight; place: WalkingEffectPlace; pose: Matrix4; run: EffectRun }

const unit = (v: Vec3): Vec3 => { const l = Math.hypot(v[0], v[1], v[2]); return l > 0 ? [v[0] / l, v[1] / l, v[2] / l] : [0, 0, 0]; };
const rowsOf = (m: Matrix4): Vec3[] => {
  const e = m.elements;
  return [unit([e[0]!, e[1]!, e[2]!]), unit([e[4]!, e[5]!, e[6]!]), unit([e[8]!, e[9]!, e[10]!])];
};

/**
 * The lightweight match's effects (a browser memory adaptation for the Xbox class; no original): the map's zAnim effect
 * animations run by the shared sequencer (`../effectRunner`) into the shared particle simulation (`../particleGeometry`),
 * drawn by the raw particle pass (`./rawParticles`) -- the rules `../effects` runs, without its scene graph, node
 * materials or light passes. What a round, a tracer and a map's ambient animations emit, sound and move is the same code
 * and the same data; this file only stands the runs on numbers.
 *
 * The effect MODELS (the muzzle flash's quads, the ejected casing) are drawn from the same packets: each live copy's
 * triangles are carried to the world on the CPU once a frame (`meshes`, a few hundred vertices) and drawn by the
 * particle pass's program with the model material's numeric state (`./particleStyle` `EffectMeshStyle`).
 *
 * NOT DRAWN HERE YET (each counted in `stats().omitted`, never silently): a model's LINE strips (the tracer models; the
 * original draws no tracer model either, research 89 section 19), the `LIGHT` passes over the world, the bullet marks and
 * footprints, and a script's `FIRE_WEAPON` round.
 */
export function walkingEffects(d: {
  data: EffectData;
  /** The hull the casings bounce on (the walk's grid) and, off the walk, the map's own. */
  grid(): Grid | null; hull(): Grid | null;
  /** The local player's feet (`PLAYER_INDOORS`), null off the walk. */
  feet(): Vec3 | null;
  sound(name: string, at: Vec3, volume: number): void;
  projectionAspect: number | null;
  random?: () => number;
}) {
  const random = d.random ?? Math.random, data = d.data;
  const programs = new Map<string, EffectProgram>();
  for (const p of data.programs) if (!programs.has(p.name.toLowerCase())) programs.set(p.name.toLowerCase(), p);
  // Only the bitmaps a particle source names are kept: the models' and the marks' are not drawn here.
  const wanted = new Set<string>();
  for (const p of data.programs) for (const s of p.sequences) for (const o of s.ops) if (o.op === 'particles') for (const t of o.source.textures) wanted.add(t.name.toLowerCase());
  const textures = new Map<string, EffectTexture>(data.textures.filter(([name]) => wanted.has(name.toLowerCase())));
  const modelTextures = new Map<string, EffectTexture>(data.textures.map(([name, texture]) => [name.toLowerCase(), texture]));
  const styles = new Map<string, EffectMeshStyle>(), meshFrame = new EffectMeshFrame();
  /** A model's packets by its node (the holder group), in the model's own tree; a copy pairs them with its nodes in the same order. */
  const modelMeshes = new Map<Object3D, ModelMesh[]>();
  const particles = new ParticleGeometry<ParticleStyle>(random, texture => new ParticleStyle(texture));
  particles.setTextures(textures); particles.setProjectionAspect(d.projectionAspect);
  const sceneNodes = new Map(data.sceneNodes.map(([n, m]) => [n, new Matrix4().fromArray(m)]));
  const valves = new Map<string, number>(), played: Record<string, number> = {};
  const omitted = { lines: 0, lights: 0, scriptRounds: 0 };
  let modelCopies = 0;
  // A model's node tree (`../effectMaterials` `buildEffectModel`'s groups) and its height in its own frame, no geometry.
  const models = new Map<string, Group>(), heights = new Map<string, number>();
  for (const model of data.models) {
    const root = new Group(); root.name = model.name;
    const nodes = new Map<string, Object3D>([[model.name, root]]);
    const at = (path: string): Object3D => {
      const known = nodes.get(path); if (known) return known;
      const cut = path.lastIndexOf('/'), parent = cut < 0 ? root : at(path.slice(0, cut));
      const g = new Group(); g.name = path.slice(cut + 1); parent.add(g); nodes.set(path, g); return g;
    };
    let min = Infinity, max = -Infinity;
    for (const part of model.parts) {
      const holder = at(part.path.slice(0, part.path.lastIndexOf('/')) || model.name);
      omitted.lines += part.lines?.length ?? 0;
      for (const mesh of part.meshes) {
        for (let i = 1; i < mesh.positions.length; i += 3) { min = Math.min(min, mesh.positions[i]!); max = Math.max(max, mesh.positions[i]!); }
        const name = mesh.textureName?.toLowerCase() ?? null, key = `${name}|${mesh.cull}|${mesh.fog}`;
        let style = styles.get(key);
        if (!style) styles.set(key, (style = new EffectMeshStyle(name ? modelTextures.get(name) ?? null : null, mesh.cull, mesh.fog)));
        let list = modelMeshes.get(holder); if (!list) modelMeshes.set(holder, (list = []));
        list.push({ positions: mesh.positions, uvs: mesh.uvs, colors: mesh.colors, indices: mesh.indices, style });
      }
    }
    models.set(model.name, root); heights.set(model.name, Number.isFinite(max - min) ? max - min : 0);
  }
  let runs: EffectRun[] = [], tracers: LiveTracer[] = [], tracerTime = 0, camera: Camera | null = null;
  let stepping = false, hush = 0, inRound = 0, bounces = 0, cameraInside = false, playerInside = false, disposed = false;
  const context = (run: EffectRun) => run.context as RunContext;

  const indoors = (who: 'camera' | 'player'): boolean => {
    const grid = d.hull() ?? d.grid();
    if (who === 'camera') {
      if (!camera || !grid) return cameraInside;
      const at = new Vector3().setFromMatrixPosition(camera.matrixWorld);
      const floor = cameraFloor(grid, at.x, at.y, at.z)?.poly;
      if (floor) cameraInside = (floor.inside ?? 0) !== 0;
      return cameraInside;
    }
    const feet = d.feet();
    if (!feet || !grid) return playerInside;
    const floor = probeFloor(grid, feet[0], feet[1], feet[2])?.poly;
    if (floor) playerInside = (floor.inside ?? 0) !== 0;
    return playerInside;
  };
  const instanceOf = (run: EffectRun): Instance => {
    const ctx = context(run); if (ctx.instance) return ctx.instance;
    const name = run.program.nodes[run.program.root] ?? '';
    const model = run.program.root > 0 ? models.get(name) : undefined;
    const object = model ? model.clone(true) : new Group();
    if (model) modelCopies++; else object.name = run.program.name;
    object.visible = false;
    // The copy's nodes beside the model's, in the same order (`clone` keeps it): each node that holds packets.
    const draws: Instance['draws'] = [];
    if (model) {
      const pair = (source: Object3D, copy: Object3D): void => {
        const meshes = modelMeshes.get(source); if (meshes) draws.push({ node: copy, meshes });
        source.children.forEach((child, i) => pair(child, copy.children[i]!));
      };
      pair(model, object);
    }
    return (ctx.instance = { object, model: model ? name : '', draws });
  };
  const nodeOf = (run: EffectRun, node: number): Object3D | null => {
    const inst = instanceOf(run);
    if (node === NODE_ROOT) return inst.object;
    const name = run.program.nodes[node]; if (!name) return null;
    return inst.model === name ? inst.object : inst.object.getObjectByName(name) ?? null;
  };
  const callerMatrix = (run: EffectRun): Matrix4 | null => {
    const n = context(run).place.node;
    return !n ? null : typeof n === 'function' ? n() : n;
  };
  const nodeMatrix = (run: EffectRun, node: number): Matrix4 | null => {
    if (node === NODE_CALLER) return callerMatrix(run);
    if (node === 0) return null;
    const name = node === NODE_ROOT ? run.program.nodes[run.program.root] : run.program.nodes[node];
    if (name === 'camera' && camera) { camera.updateMatrixWorld(); return camera.matrixWorld; }
    const scene = name && !models.has(name) ? sceneNodes.get(name) : undefined;
    if (scene) return scene;
    const o = nodeOf(run, node); if (!o) return null;
    o.updateWorldMatrix(true, false); return o.matrixWorld;
  };
  const runPosition = (run: EffectRun): Vec3 => {
    const m = callerMatrix(run);
    return m ? [m.elements[12]!, m.elements[13]!, m.elements[14]!] : context(run).place.position ?? [0, 0, 0];
  };
  const rangePoint = (run: EffectRun, fromContext: number, node: number | null): Vector3 => {
    const p = new Vector3(), at = context(run).place.position;
    if (fromContext && at) p.set(at[0], at[1], at[2]);
    const m = node === null ? null : nodeMatrix(run, node);
    return m ? p.applyMatrix4(m) : p;
  };
  const world = (): MotionWorld | null => {
    const grid = d.grid(); if (!grid) return null;
    const soil = (byte: number): number => (byte === 0 ? data.defaultMaterial : byte);
    const facing = (n: readonly number[], a: Vec3, b: Vec3): Vec3 => {
      const dot = (b[0] - a[0]) * n[0]! + (b[1] - a[1]) * n[1]! + (b[2] - a[2]) * n[2]!;
      return dot > 0 ? [-n[0]!, -n[1]!, -n[2]!] : [n[0]!, n[1]!, n[2]!];
    };
    const probe = (a: Vec3, b: Vec3) => {
      const h = segmentHit(grid, a, b);
      return h ? { point: [...h.point] as Vec3, normal: facing(h.normal, a, b), material: soil(h.poly.material) } : null;
    };
    return { segment: probe, floor: (from: Vec3, depth: number) => probe(from, [from[0], from[1] - depth, from[2]]) };
  };
  const playSound = (raw: string, at: Vec3, volume: number): void => { if (hush === 0) d.sound(fixSoundName(raw), at, volume); };
  const tracerHolds = (run: EffectRun): boolean => tracers.some(t => t.run === run);
  const sweep = (): void => { runs = runs.filter(run => !run.finished); };
  const ambientRooted = (run: EffectRun): boolean => {
    for (let r: EffectRun | undefined = run; r; r = context(r).parent) if (context(r).ambient) return true;
    return false;
  };
  /** `../effects` `makeRoom` (MAX_EFFECT_RUNS_ADAPTATION): the rounds' oldest retired first, silently; never an ambient's or a flying tracer's. */
  const makeRoom = (): void => {
    if (!stepping) sweep();
    let left = runs.reduce((n, run) => n + Number(!run.finished), 0) - MAX_EFFECT_RUNS_ADAPTATION + 1;
    if (left <= 0) return;
    hush++;
    try {
      for (const rounds of [true, false]) for (const run of runs) {
        if (left <= 0) break;
        if (run.finished || (context(run).round === true) !== rounds || ambientRooted(run) || tracerHolds(run)) continue;
        run.stop(); left--;
      }
    } finally { hush--; }
    if (!stepping) sweep();
  };
  const start = (program: EffectProgram, place: WalkingEffectPlace, ambient = false, parent: EffectRun | null = null): EffectRun => {
    played[program.name] = (played[program.name] ?? 0) + 1;
    const round = inRound > 0 || (parent ? context(parent).round === true : false);
    const run = new EffectRun(program, host, { place, instance: null, ambient, ...(parent ? { parent } : {}), ...(round ? { round } : {}) } satisfies RunContext);
    if (runs.length >= MAX_EFFECT_RUNS_ADAPTATION) makeRoom();
    runs.push(run); run.update(0);
    return run;
  };
  const motion = (m: ObjectMotion, run: EffectRun): OpTick | void => {
    const node = nodeOf(run, m.node); if (!node) return;
    const frame = m.frame === 0 ? null : nodeMatrix(run, m.frame), inst = context(run).instance;
    const height = inst ? heights.get(inst.model) ?? 0 : 0.14;
    const state: MotionState = launchMotion(m, node.position.toArray() as Vec3, frame ? rowsOf(frame) : null, random, ZANIM_GRAVITY, height, context(run).place.velocity ?? [0, 0, 0]);
    const hullNow = world();
    const apply = (): void => {
      node.position.set(state.position[0], state.position[1], state.position[2]);
      node.quaternion.setFromEuler(new Euler(state.euler[0], state.euler[1], state.euler[2], 'YXZ'));
    };
    apply();
    return (dt: number): boolean => {
      for (const b of stepMotion(m, state, dt, hullNow)) {
        bounces++;
        if ((m.flags & 0x20) === 0) continue;
        const sound = b.entry?.sound ?? m.sound, ref = b.entry?.refSpeed ?? m.refSpeed;
        if (sound) playSound(sound, b.point, ref > 0 ? Math.min(1, b.speed / ref) : 1);
      }
      apply(); return state.done;
    };
  };
  const begin = (op: EffectOp, run: EffectRun): OpTick | void => {
    const ctx = context(run);
    switch (op.op) {
      case 'fireWeapon': omitted.scriptRounds++; return;
      case 'call': { const program = programs.get(op.anim.toLowerCase()); if (program) start(program, ctx.place, false, run); return; }
      case 'valve': valves.set(op.valve, valveApply(valves.get(op.valve) ?? 0, op.operation, op.operand)); return;
      case 'active': { const node = nodeOf(run, op.node); if (node) node.visible = op.on; return; }
      case 'translate': {
        const node = nodeOf(run, op.node); if (!node) return;
        const ref = op.ref === 0 ? null : nodeMatrix(run, op.ref), v = new Vector3();
        let set = false;
        if (op.flags & 4) { v.copy(node.position).add(new Vector3(...op.xyz)); set = true; } else if (op.flags & 1) { v.set(...op.xyz); set = true; }
        if ((op.flags & 2) && ctx.place.position) { v.add(new Vector3(...ctx.place.position)); set = true; }
        if (ref) node.position.copy(v.applyMatrix4(ref)); else if (set) node.position.copy(v);
        return;
      }
      case 'rotate': {
        const node = nodeOf(run, op.node); if (!node) return;
        const ref = op.ref === 0 ? null : nodeMatrix(run, op.ref);
        if (ref && (op.flags & 4) === 0) node.quaternion.setFromRotationMatrix(new Matrix4().extractRotation(ref));
        const e = new Quaternion().setFromEuler(new Euler(op.xyz[0], op.xyz[1], op.xyz[2], 'YXZ'));
        if (op.flags & 1) node.quaternion.copy(e);
        if (op.flags & 2) node.quaternion.multiply(e);
        return;
      }
      case 'fromTo': {
        const node = nodeOf(run, op.node); if (!node) return;
        let t = 0;
        const apply = (): void => {
          const k = op.seconds > 0 ? Math.min(1, t / op.seconds) : 1;
          node.scale.set(op.from[0] + (op.to[0] - op.from[0]) * k, op.from[1] + (op.to[1] - op.from[1]) * k, op.from[2] + (op.to[2] - op.from[2]) * k);
        };
        apply();
        return (dt) => { t += dt; apply(); return t >= op.seconds; };
      }
      case 'motion': return motion(op.motion, run);
      case 'particles': {
        const node = nodeMatrix(run, op.source.node);
        const follow = op.source.follow ? () => nodeMatrix(run, op.source.node) : null;
        const n = op.source.node, name = n === NODE_ROOT ? run.program.nodes[run.program.root] : run.program.nodes[n];
        particles.emit(op.source, node, ctx.place, run.program.name, () => !run.finished, run, follow, !!follow && name === 'camera');
        return;
      }
      case 'light': {
        // The pass over the world is not drawn (`omitted.lights`); the command still runs its length before its sequence goes on.
        omitted.lights++;
        let t = 0; const seconds = op.light.duration;
        return seconds > 0 ? (dt) => (t += dt) >= seconds : undefined;
      }
      case 'pauseAnimation': { const name = op.anim.toLowerCase(); for (const r of runs) if (r !== run && r.program.name.toLowerCase() === name) r.paused = true; return; }
      case 'stopAnimation': { const name = op.anim.toLowerCase(); for (const r of runs) if (r !== run && r.program.name.toLowerCase() === name) r.stop(); return; }
      case 'sound': {
        if (op.newPlay === false) return;
        if (ctx.ambient && op.sound.startsWith('~')) return;   // an ambient's looping sound is the audio's emitters'
        const at = op.node > 0 ? nodeMatrix(run, op.node) : null;
        playSound(op.sound, at ? [at.elements[12]!, at.elements[13]!, at.elements[14]!] : runPosition(run), op.volume);
        return;
      }
      default: return;
    }
  };
  const host: EffectHost = {
    random: () => random(),
    test: (c: EffectCondition, run: EffectRun): boolean => {
      if (c.kind === 'valve') return valveTest(valves.get(c.valve) ?? 0, c.operation, c.operand);
      if (c.kind === 'range') {
        if (!camera) return false;
        const a = rangePoint(run, c.flags & 0x04, c.flags & 0x01 ? c.node : null);
        const b = rangePoint(run, c.flags & 0x20, c.flags & 0x08 ? c.other : null);
        return rangeTestHolds(c.flags, a.distanceToSquared(b), c.rangeSquared);
      }
      const who = indoorsOperand(c);
      return who ? indoors(who) : false;
    },
    begin, answersIndoors: true,
  };

  /** `../effects` `aimTracer`: x along the shot, rolled to the world's up, scaled (`TRACER_OBJECT_SCALE`). */
  const aimTracer = (m: Matrix4, flight: TracerFlight): void => {
    const at = flight.pos, e = flight.end, x = new Vector3(e[0] - at[0], e[1] - at[1], e[2] - at[2]);
    if (x.lengthSq() < 1e-12) x.setFromMatrixColumn(m, 0);
    if (x.lengthSq() < 1e-12) x.set(1, 0, 0);
    x.normalize();
    const up = Math.abs(x.y) > 0.99 ? new Vector3(1, 0, 0) : new Vector3(0, 1, 0);
    const z = new Vector3().crossVectors(x, up).normalize(), y = new Vector3().crossVectors(z, x).normalize();
    m.makeBasis(x.multiplyScalar(TRACER_OBJECT_SCALE), y.multiplyScalar(TRACER_OBJECT_SCALE), z.multiplyScalar(TRACER_OBJECT_SCALE));
    m.setPosition(at[0], at[1], at[2]);
  };
  const placeTracer = (t: LiveTracer): void => {
    const head = tracerHead(t.flight), p = t.place.position ?? (t.place.position = [0, 0, 0]);
    p[0] = head[0]; p[1] = head[1]; p[2] = head[2];
    aimTracer(t.pose, t.flight);
  };
  const retireTracers = (): void => { tracers = []; tracerTime = 0; };
  const launch = (from: readonly number[], to: readonly number[], kind: TracerKind, range?: number): boolean => {
    const program = programs.get(TRACER_ANIM[kind].toLowerCase());
    if (!program || tracers.length >= TRACER_POOL) return false;
    const flight = launchTracer(from, to, random, range); if (!flight) return false;
    const pose = new Matrix4(); aimTracer(pose, flight);
    const head = tracerHead(flight), place: WalkingEffectPlace = { node: pose, position: [head[0], head[1], head[2]], velocity: [0, 0, 0] };
    tracers.push({ kind, flight, place, pose, run: start(program, place) });
    return true;
  };
  const play = (name: string, place: WalkingEffectPlace): boolean => {
    const program = programs.get(name.toLowerCase()); if (!program) return false;
    start(program, place); return true;
  };
  const materialName = (byte: number): string | undefined => data.materials[byte === 0 ? data.defaultMaterial : byte];
  // The mission's ambient effects start with the map, as the game starts its activation-1 animations.
  for (const name of data.ambient) { const program = programs.get(name.toLowerCase()); if (program) start(program, { node: null }, true); }

  /** The live copies' triangles carried to the world for this frame (`EffectMeshFrame`): a node hidden through any parent draws nothing. */
  const corner = new Vector3();
  const writeMeshes = (): void => {
    meshFrame.begin();
    for (const run of runs) {
      const inst = context(run).instance; if (!inst || !inst.draws.length) continue;
      let rootFresh = false;
      for (const { node, meshes } of inst.draws) {
        let shown = true;
        for (let o: Object3D | null = node; o; o = o.parent) if (!o.visible) { shown = false; break; }
        if (!shown) continue;
        if (!rootFresh) { inst.object.updateMatrixWorld(true); rootFresh = true; }
        const m = node.matrixWorld;
        for (const mesh of meshes) {
          const count = mesh.positions.length / 3, at = meshFrame.take(mesh.style, count, mesh.indices.length); if (!at) continue;
          const out = meshFrame.vertices, solid = mesh.style.texture === null;
          for (let i = 0; i < count; i++) {
            corner.set(mesh.positions[i * 3]!, mesh.positions[i * 3 + 1]!, mesh.positions[i * 3 + 2]!).applyMatrix4(m);
            const o = (at.vertex + i) * 9;
            out[o] = corner.x; out[o + 1] = corner.y; out[o + 2] = corner.z; out[o + 3] = mesh.uvs[i * 2]!; out[o + 4] = mesh.uvs[i * 2 + 1]!;
            out[o + 5] = mesh.colors[i * 4]!; out[o + 6] = mesh.colors[i * 4 + 1]!; out[o + 7] = mesh.colors[i * 4 + 2]!;
            out[o + 8] = solid ? 1 : mesh.colors[i * 4 + 3]!;   // an untextured model's colour is drawn solid (`effectMaterial`)
          }
          for (let i = 0; i < mesh.indices.length; i++) meshFrame.indices[at.index + i] = at.vertex + mesh.indices[i]!;
        }
      }
    }
  };

  return {
    /** The effect models' triangles for the frame just updated (`update`), for the raw pass. */
    meshes: meshFrame,
    /** The particles' world-space geometry, for the raw pass (`./rawParticles`): never transformed, never added to a scene. */
    object: particles.object,
    has: (name: string) => programs.has(name.toLowerCase()),
    play,
    /** As `play`, with a handle on the run (`../effects` `run`): a pouring smoke's caller stops it; null without the animation. */
    run(name: string, at: WalkingEffectPlace): EffectHandle | null {
      const program = programs.get(name.toLowerCase()); if (!program) return null;
      const r = start(program, at);
      const stop = (): void => { r.stop(); for (const other of runs) for (let up = context(other).parent; up; up = context(up).parent) if (up === r) { other.stop(); break; } };
      return { name: program.name, place: at as EffectHandle['place'], alive: () => !r.finished, get finished() { return r.finished; }, stop };
    },
    willDrawTracer: (kind: TracerKind) => programs.has(TRACER_ANIM[kind].toLowerCase()),
    /** `../effects` `onRound`: the tracer, the weapon's muzzle animation at its node, the impact by the hit's material. */
    onRound(e: FireEvent, weapon: { node: WalkingCallerNode; muzzle: Vec3 | null } | null, zoomed: boolean): void {
      if (e.type !== 'round' || disposed) return;
      inRound++;
      try {
        if (e.tracer) launch(e.tracerFrom ?? e.from, e.tracerTo ?? e.to, e.tracerKind ?? 'ally', e.weapon.range);
        const hitAnim = data.hitAnims.find(([w]) => w === e.weapon.name)?.[1] ?? 'bullet_hit';
        const dir = unit([e.to[0] - e.from[0], e.to[1] - e.from[1], e.to[2] - e.from[2]]);
        const name = muzzleAnimation(e.weapon.fireAnim, zoomed);
        if (name && weapon) play(name, { node: weapon.node, position: weapon.muzzle ?? [0, 0, 0], velocity: dir });
        if (e.hit && typeof e.material === 'number' && e.normal) {
          const anim = impactAnimation(hitAnim, materialName(e.material));
          if (anim) play(anim, { position: [...e.to], velocity: dir, normal: [...e.normal] });
        }
      } finally { inRound--; }
    },
    /** `extra`: another writer of this frame's triangles (the throw's arc, `./walkingGrenades`), after the models'. */
    update(dt: number, view: Camera | null, extra?: (frame: EffectMeshFrame) => void): void {
      if (disposed) return;
      camera = view;
      tracerTime += dt;
      const frames = Math.floor((tracerTime + 1e-9) / GAME_FRAME_DT);
      tracerTime = Math.max(0, tracerTime - frames * GAME_FRAME_DT);
      for (let k = 0; k < frames; k++) {
        tracers = tracers.filter(t => !t.flight.done);          // freed a game frame after it retired, as the pool's
        for (const t of tracers) stepTracer(t.flight, GAME_FRAME_DT);
      }
      for (const t of tracers) placeTracer(t);
      stepping = true;
      try { for (let i = 0; i < runs.length; i++) runs[i]!.update(dt); } finally { stepping = false; }
      for (const t of tracers) {
        const inst = context(t.run).instance;
        if (inst) { inst.object.matrix.copy(t.pose); inst.object.matrixAutoUpdate = false; inst.object.matrixWorldNeedsUpdate = true; }
      }
      sweep();
      writeMeshes(); extra?.(meshFrame);
      particles.update(dt, view, true);
    },
    /** `../effects` `clearRound` (ROUND_END_EFFECTS_READING): every run but the ambient ones stopped, silently; every particle gone. */
    clearRound(): void {
      retireTracers();
      hush++;
      try { for (const run of runs) if (!run.finished && !ambientRooted(run)) run.stop(); } finally { hush--; }
      if (!stepping) sweep();
      particles.expire();
    },
    /** A hidden page's return (`../effects` `retireRounds`): the rounds' runs let go at once, silently. */
    retireRounds(): void {
      retireTracers();
      hush++;
      try { for (const run of runs) if (context(run).round && !run.finished) run.stop(); } finally { hush--; }
      if (!stepping) sweep();
    },
    stats() {
      return { programs: programs.size, textures: textures.size, runs: runs.length, particles: particles.count(), sources: particles.activeSources(),
        emitted: particles.emitted, tracers: tracers.length, bounces, played: { ...played }, omitted: { ...omitted },
        models: { copies: modelCopies, vertices: meshFrame.vertexCount, batches: meshFrame.batches.length, dropped: meshFrame.dropped },
        unsupported: ['effect model line strips', 'LIGHT passes over the world', 'bullet marks and footprints', 'script FIRE_WEAPON rounds'] };
    },
    dispose(): void {
      if (disposed) return; disposed = true;
      hush++;
      for (const run of runs) run.stop();
      runs = []; tracers = []; valves.clear(); meshFrame.begin();
      for (const style of styles.values()) style.dispose();   // the raw pass frees their bitmaps on the event
      particles.setTextures(new Map());                     // the styles' dispose events free the raw pass's bitmaps
    },
  };
}
export type WalkingEffects = ReturnType<typeof walkingEffects>;
