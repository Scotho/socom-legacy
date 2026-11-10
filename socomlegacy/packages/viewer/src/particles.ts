import { BufferAttribute, BufferGeometry, Group, Matrix4, Mesh, Sphere, Vector3, type Camera } from 'three';
import type { MeshBasicNodeMaterial } from 'three/webgpu';
import {
  frictionFactor, GAME_FRAME_DT, PARTICLE_A, PARTICLE_B, particleColour, particleFade, particleScale, particleTextureAt, sourceVelocity,
  type EffectContext, type ParticleSource, type VelocityFrom,
} from '@s2u/scene';
import { effectMaterial } from './effectMaterials';
import { particleBucketOrder, particleSlot, type AlphaPassSource } from './alphaInterleave';
import type { EffectTexture } from './effectData';

/**
 * The particle manager the zAnim `PARTICLE_SOURCE` command drives (socomlegacy/docs/research/89 §3; `@s2u/scene`'s
 * `effectParticles` for the fields and their decomp lines):
 *
 * - **A source** is one per animation run and name (`FUN_0026ea20`): later commands of the run update it; it emits while
 *   it is active (flag A 0x1 sets it to A 0x2) and its run lives, then dies and lets its particles run out.
 * - **Emission** (`FUN_00329b40`): the first tick after activation only records where the source is; after it an
 *   accumulator gains `dt` -- or, for a per-distance source (flag A 0x4000 without 0x8000), the distance its place
 *   moved since the last tick (`PER_DISTANCE_MOVE_LIMIT`) -- times `PARTICLE_RATE_SCALE`, and every whole `interval` is
 *   an event of `perEvent` particles, spread over the frame, until the `events` allowed (-1: no end) are spent.
 * - **A particle** (`FUN_00327cd0`, `FUN_003282b0`): its size, lifetime and starting age drawn from their ranges; its
 *   velocity the base (in the node's frame) plus the world velocity plus the random box; each tick `pos += v dt`, then
 *   `v += a dt`, then the friction; it dies at its lifetime.
 * - **The draw** (`FUN_003251b0`): a camera-facing square `2 size scale(t)` across, the colour keys as the vertex colour
 *   (MODULATE: 1.0 leaves the texel), the alpha times the camera fade, back to front, no depth write, the texture's own
 *   blend (`./effectMaterials`).
 * - **The bitmap** (`FUN_00327910`, D:L225586-225589): a random-mode source's (flag A 0x4000000) drawn at the spawn and
 *   kept; a life-stepped source's (flag A 0x8000000) picked every frame by the life fraction (`particleTextureAt`,
 *   `FUN_00328a50`). A particle with none is the GS's untextured sprite, blended by its alpha (`effectMaterial`'s
 *   `vertexAlpha`; research 89 §17).
 */

type Vec3 = [number, number, number];

interface Particle {
  source: ParticleSource;
  /** Its own bitmap (lower case), drawn at the spawn; null for a life-stepped source's, picked each frame. */
  texture: string | null;
  position: Vec3;
  /**
   * Seconds it has moved since its spawn, up to one game tick: a streaked particle is drawn from where it was that long
   * ago to `position` (`FUN_00326350`; `STREAK_TICK_READING`, `tickBack`).
   */
  moved: number;
  /** A rotated particle's angle (radians), spin and the spin's acceleration (`FUN_003282b0`). */
  angle: number;
  spin: number;
  spinAccel: number;
  velocity: Vec3;
  size: number;
  age: number;
  life: number;
}

/**
 * STREAK_TICK_READING (INV-RAIN F2; research 89 §21): a streaked particle (type 3) is drawn from its place one game
 * tick ago to its place now. `FUN_00326350` projects `+0x20` (now) and `+0x10` (D:L224670-224699) and `FUN_00327cd0`
 * writes the spawn place to `+0x10` (D:L225673); the step that moves `+0x20` and copies the old place to `+0x10` is
 * `FUN_003282b0` (0x3282b0), which the decompilation does not hold -- so "one tick" is a reading, the tick
 * `GAME_FRAME_DT` (the core state ticks once a swap at 30 Hz, `@s2u/scene` `gameFrame`). The port steps its particles
 * once a browser frame, so its tail is taken back through one game tick of its own step -- the velocity the last tick
 * moved by is the one now with that tick's friction and acceleration undone -- and never past the spawn place. Was the
 * place one browser frame ago: the band shrank with the refresh rate (MP12's rain 1.67 u at 30 Hz, 1.03 u at 144 Hz).
 * Settled by a memory trace of `+0x10` / `+0x20` over two ticks, or a read of 0x3282b0 in the ELF.
 */
export const STREAK_TICK_READING = 'oneGameTickBack' as const;

/** The streak's two numbers when the source sets none (`FUN_0032ab20`'s defaults: the tail's reach and its alpha). */
export const STREAK_DEFAULT: readonly [number, number] = [1, 0.3];

interface Source {
  key: string;
  config: ParticleSource;
  active: boolean;
  /** Its node's world matrix at the command (the base velocity's frame; followed with flag A 0x10), or null. */
  node: Matrix4 | null;
  /** A fixed place (flags A 0x8 / 0x4 / 0x20), or null: at its node's origin. */
  position: Vec3 | null;
  /** The base velocity (the node's frame) and the world one, resolved against the context at the command. */
  base: Vec3;
  world: Vec3;
  alive: () => boolean;
  /** Its node's matrix now, for a source that follows it (flag A 0x10), or null. */
  follow: (() => Matrix4 | null) | null;
  started: boolean;
  /** Its place the last tick (the manager's `+4`, written at the tick's end: `FUN_00329b40` D:L227152-227156). */
  last: Vec3;
  acc: number;
  events: number;
}

/**
 * `DAT_004884c8`: the factor both of `FUN_00329b40`'s counters take -- the time a per-second source counts
 * (D:L226897) and the distance a per-distance one does (D:L226902). `FUN_00324b20` sets it to 1.0 (0x3f800000,
 * D:L223720), the decomp's only write of it (its other two lines read it); research 89 §3.
 */
export const PARTICLE_RATE_SCALE = 1;

/**
 * A per-distance source counts its place's move only when the move is under this (the squared move under 40000,
 * `FUN_00329b40` D:L226901-226902): a jump of 200 or more -- a respawn, a node carried across the map -- adds nothing,
 * and the next tick counts from the new place (D:L227152-227156). Research 89 §3.
 */
export const PER_DISTANCE_MOVE_LIMIT = 200;

/** The most particles drawn at once (the game sorts up to 5000: `FUN_00326c30`). */
export const MAX_PARTICLES = 5000;

/**
 * OBF-32 (review F1): the particle batches' `renderOrder` in three's order -- after the whole walk and before the
 * world's alpha pass. The original drains its particles inside the alpha pass `FUN_00336cb0` (D:L235146-235180),
 * which RenderWorld calls after its walk (`FUN_00339de0` D:L237235): after every walk draw, its reflection and detail
 * passes and the marks their chains carry (`FUN_003b4580` D:L307165-307190; `./fire` `WALK_DECAL_RENDER_ORDER`, 0.875,
 * just under this). So the batches sit above the walk's blended draws (`world.ts` `restOrder`, under 2^-3), their
 * detail (+0.5) and env (+0.75) passes and the decals, and below the alpha pass and the shadows
 * (`ALPHA_PASS_REST_ORDER` 1, as at 0). Was three's default 0: the walk's blended draws over the smoke. Inside the pass
 * the original interleaves the particles with the alpha list by distance (D:L235146-235180): LATER 593, built
 * (`./alphaInterleave`) -- with the world's alpha pass wired (`setAlphaPass`) each bucket takes its own number between
 * the pass's items, and this one holds only for a page with no pass to interleave with.
 */
export const PARTICLE_BATCH_RENDER_ORDER = 0.9375;

/**
 * LATER 593: the most batches one texture's particles are split into in a frame, one per run of the pass's slots
 * (`particleSlot`) -- a browser adaptation: the console drains particle by particle, one list over every texture
 * (`FUN_00324c70`), the port draws a texture's particles in one call per slot. Past this many slots the nearer runs
 * share the last batch at the nearest run's number, so the pass's items between them (their keys within that batch's
 * range of particle ranges) are drawn under its farther particles; MP12's rain and MP7's mist at the shot poses use
 * a handful (`alphaInterleaveDisc.test.ts`). Within a slot, two textures' batches are still sorted by three at their
 * clouds' centres, not particle by particle (research 89 §20's architectural limit, unchanged).
 */
export const PARTICLE_BUCKETS_PER_TEXTURE_ADAPTATION = 16;

const lerp = (r: readonly [number, number], u: number): number => r[0] + (r[1] - r[0]) * u;
/** A number an owner (a run) keys its sources by. */
const ownerIds = new WeakMap<object, number>();

export class ParticleSystem {
  readonly object = new Group();
  private readonly sources = new Map<string, Source>();
  private particles: Particle[] = [];
  private textures = new Map<string, EffectTexture>();
  /** Each texture's batches, the k-th for its k-th run of slots this frame (`draw`). */
  private readonly meshes = new Map<string, Group3[]>();
  /** The world's alpha pass the batches are numbered between (LATER 593), or null: `PARTICLE_BATCH_RENDER_ORDER`. */
  private alphaPass: AlphaPassSource | null = null;
  /** Particles emitted so far, for the hook. */
  emitted = 0;

  constructor(private readonly random: () => number = Math.random) {
    this.object.name = 'particles';
  }

  setTextures(textures: ReadonlyMap<string, EffectTexture>): void {
    this.clear();
    for (const pool of this.meshes.values()) {
      // The pool's batches share one material (`groupFor`): disposed once.
      for (const { mesh } of pool) { this.object.remove(mesh); mesh.geometry.dispose(); }
      const material = pool[0]?.material;
      material?.map?.dispose();
      material?.dispose();
    }
    this.meshes.clear();
    this.textures = new Map(textures);
  }

  clear(): void {
    this.sources.clear();
    this.particles = [];
    for (const pool of this.meshes.values()) for (const { mesh } of pool) mesh.visible = false;
  }

  /**
   * ROUND_END_EFFECTS_READING (research 283 §9): every live particle gone, the sources kept -- the round's end ages each
   * particle on the manager's live list past its life (`FUN_00326fb0` D:L225075-225083, its `+0xc` set to `+0x48` +
   * 0.01), so the next update frees them all (`FUN_003280a0`); a source still running pours again.
   */
  expire(): void {
    this.particles = [];
    for (const pool of this.meshes.values()) for (const { mesh } of pool) mesh.visible = false;
  }

  /** LATER 593: the world's alpha pass to draw the particles between, by range (`./alphaInterleave`); null, none. */
  setAlphaPass(source: AlphaPassSource | null): void {
    this.alphaPass = source;
  }

  count(): number {
    return this.particles.length;
  }

  /** Sources that are active and alive (the hook). */
  activeSources(): number {
    let n = 0;
    for (const s of this.sources.values()) if (s.active && s.alive()) n++;
    return n;
  }

  /**
   * A `PARTICLE_SOURCE` command of the run `owner` (its name keys the source): the source made or updated, switched as
   * the command says, placed at `matrix`; `alive` answers while its run lives.
   */
  emit(
    config: ParticleSource, node: Matrix4 | null, ctx: EffectContext, owner: string,
    alive: () => boolean = () => false, ownerId: unknown = null, follow: (() => Matrix4 | null) | null = null,
  ): void {
    const id = ownerId !== null && typeof ownerId === 'object' ? ownerIds.get(ownerId) ?? this.idOf(ownerId) : 0;
    const key = `${owner}|${config.name}|${id}`;
    // The place (decomp 112876-112933): the context's position, the offset, the node's origin, the random block.
    let position: Vec3 | null = null;
    const add = (v: Vec3): void => { position = position ? [position[0] + v[0], position[1] + v[1], position[2] + v[2]] : [...v]; };
    if (config.atContext && ctx.position) add(ctx.position);
    if ((config.flagsA & 0x4) !== 0) add(config.offset);
    // A source that follows its node (flag A 0x10) keeps its place in the node's frame: Blizzard's snow falls 50 ahead
    // of the camera and 20 over it wherever the camera looks [reading: +0x54 is local while the node is followed].
    if (config.atNode && node && !config.follow) add([node.elements[12]!, node.elements[13]!, node.elements[14]!]);
    if (position && config.positionBlock) {
      const { base, range } = config.positionBlock;
      add([base[0] + range[0] * this.random(), base[1] + range[1] * this.random(), base[2] + range[2] * this.random()]);
    }
    // INV-RAIN F1: the velocities this command writes, null where it writes none (`commandVelocities`).
    const { base, world } = commandVelocities(config, ctx);
    let s = this.sources.get(key);
    if (!s) {
      // A new source's velocities are zero where its first command writes none (`FUN_0032ab20` D:L227450-227473).
      s = { key, config, active: false, node: node?.clone() ?? null, position, base: base ?? [0, 0, 0], world: world ?? [0, 0, 0], alive, follow, started: false, last: [0, 0, 0], acc: 0, events: config.events };
      this.sources.set(key, s);
    } else {
      if (config.interval !== null) { s.config = config; s.events = config.events; }
      s.node = node?.clone() ?? s.node;
      s.position = position ?? s.position;
      if (base) s.base = base;
      if (world) s.world = world;
    }
    if (config.setActive !== null && config.setActive !== s.active) {
      s.active = config.setActive;
      s.started = false;
      s.acc = 0;
    }
  }

  private nextId = 0;
  private idOf(owner: unknown): number {
    if (owner === null || typeof owner !== 'object') return 0;
    const id = ++this.nextId;
    ownerIds.set(owner, id);
    return id;
  }

  update(dt: number, camera: Camera | null): void {
    for (const [key, s] of this.sources) {
      if (!s.alive()) { this.sources.delete(key); continue; }
      if (!s.active || s.config.interval === null || s.config.interval <= 0) continue;
      if (s.follow) { const m = s.follow(); if (m) s.node = m.clone(); }
      const at = this.placeOf(s), last = s.last;
      s.last = at;                                          // the tick's end records the place (D:L227152-227156)
      if (!s.started) { s.started = true; continue; }       // the first tick records the place and emits nothing
      if (s.config.perDistance) {
        // The distance the place moved since the last tick, a move under 200 only (D:L226901-226902).
        const moved = Math.hypot(at[0] - last[0], at[1] - last[1], at[2] - last[2]);
        if (moved < PER_DISTANCE_MOVE_LIMIT) s.acc += moved * PARTICLE_RATE_SCALE;
      } else {
        s.acc += dt * PARTICLE_RATE_SCALE;                   // D:L226897
      }
      let n = Math.floor(s.acc / s.config.interval + 1e-9);
      s.acc -= n * s.config.interval;
      if (s.events >= 0) { n = Math.min(n, s.events); s.events -= n; }
      for (let i = 0; i < n; i++) {
        const sub = n > 1 ? (dt * (n - 1 - i)) / n : 0;    // spread over the frame: the earliest has aged the most
        for (let k = 0; k < s.config.perEvent; k++) this.spawn(s, sub);
      }
    }
    const alive: Particle[] = [];
    for (const p of this.particles) {
      p.age += dt;
      if (p.age >= p.life) continue;
      const c = p.source;
      p.moved = Math.min(GAME_FRAME_DT, p.moved + dt);     // STREAK_TICK_READING: the tail's reach back, a tick at most
      p.position[0] += p.velocity[0] * dt; p.position[1] += p.velocity[1] * dt; p.position[2] += p.velocity[2] * dt;
      p.velocity[0] += c.accel[0] * dt; p.velocity[1] += c.accel[1] * dt; p.velocity[2] += c.accel[2] * dt;
      if (p.spin !== 0 || p.spinAccel !== 0) {
        // The angle by the spin, the spin by its acceleration -- stopped where it would change sign.
        p.angle += p.spin * dt;
        const next = p.spin + p.spinAccel * dt;
        p.spin = next * p.spin < 0 ? 0 : next;
        if (p.spin === 0) p.spinAccel = 0;
      }
      if (c.friction !== 0) {
        const d = frictionFactor(c.friction, dt);
        p.velocity[0] *= d; p.velocity[1] *= d; p.velocity[2] *= d;
      }
      alive.push(p);
    }
    this.particles = alive;
    this.draw(camera);
  }

  /**
   * The source's place now, as the tick finds it (`FUN_00329b40` D:L226869-226878): its node's matrix times its place
   * (`+0x54`) while it has a node it follows, else the place itself -- as `spawn` places a particle, the box aside.
   */
  private placeOf(s: Source): Vec3 {
    const m = s.node?.elements ?? null;
    if (s.config.follow && m) {
      const l = s.position ?? [0, 0, 0];
      return [
        m[0]! * l[0] + m[4]! * l[1] + m[8]! * l[2] + m[12]!,
        m[1]! * l[0] + m[5]! * l[1] + m[9]! * l[2] + m[13]!,
        m[2]! * l[0] + m[6]! * l[1] + m[10]! * l[2] + m[14]!,
      ];
    }
    const o = s.position ?? (m ? [m[12]!, m[13]!, m[14]!] : [0, 0, 0]);
    return [o[0]!, o[1]!, o[2]!];
  }

  private spawn(s: Source, sub: number): void {
    if (this.particles.length >= MAX_PARTICLES) return;
    const c = s.config, r = this.random;
    const life = lerp(c.lifetime, r());
    const age = lerp(c.startAge, r()) + sub;
    if (age >= life) return;
    const m = s.node?.elements ?? null;
    // The node's rotation: its matrix's basis, unit length (a node's scale does not scale a velocity).
    const local = (v: Vec3): Vec3 => {
      if (!m) return v;
      const col = (i: number): Vec3 => { const x = m[i]!, y = m[i + 1]!, z = m[i + 2]!, l = Math.hypot(x, y, z) || 1; return [x / l, y / l, z / l]; };
      const a = col(0), b = col(4), cc = col(8);
      return [v[0] * a[0] + v[1] * b[0] + v[2] * cc[0], v[0] * a[1] + v[1] * b[1] + v[2] * cc[1], v[0] * a[2] + v[1] * b[2] + v[2] * cc[2]];
    };
    const base = local(s.base);
    let rand: Vec3 = [lerp(c.randomVelocity[0], r()), lerp(c.randomVelocity[1], r()), lerp(c.randomVelocity[2], r())];
    if ((c.flagsB & PARTICLE_B.LOCAL_RANDOM) !== 0) rand = local(rand);
    const velocity: Vec3 = [base[0] + s.world[0] + rand[0], base[1] + s.world[1] + rand[1], base[2] + s.world[2] + rand[2]];
    const boxed: Vec3 = [lerp(c.box[0], r()), lerp(c.box[1], r()), lerp(c.box[2], r())];
    let at: Vec3;
    if (c.follow && m) {
      // In the followed node's frame: its place plus the box, carried by the node's matrix.
      const l: Vec3 = [(s.position?.[0] ?? 0) + boxed[0], (s.position?.[1] ?? 0) + boxed[1], (s.position?.[2] ?? 0) + boxed[2]];
      at = [
        m[0]! * l[0] + m[4]! * l[1] + m[8]! * l[2] + m[12]!,
        m[1]! * l[0] + m[5]! * l[1] + m[9]! * l[2] + m[13]!,
        m[2]! * l[0] + m[6]! * l[1] + m[10]! * l[2] + m[14]!,
      ];
    } else {
      const o = s.position ?? (m ? [m[12]!, m[13]!, m[14]!] : [0, 0, 0]);
      at = [o[0] + boxed[0], o[1] + boxed[1], o[2] + boxed[2]];
    }
    const position: Vec3 = [at[0] + velocity[0] * sub, at[1] + velocity[1] * sub, at[2] + velocity[2] * sub];
    const texture = c.textureMode === 'life' ? null : c.textureMode === 'random' && c.textures.length > 1
      ? c.textures[Math.min(c.textures.length - 1, Math.floor(r() * c.textures.length))]!.name : c.texture ?? '';
    // A rotated particle's spin (`FUN_00327cd0`); its angle is whatever the pool's slot last held: random here.
    const spin = c.spin;
    this.particles.push({
      source: c, texture: texture?.toLowerCase() ?? null, position, moved: 0, velocity, size: lerp(c.size, r()), age, life,
      angle: r() * Math.PI * 2, spin: spin ? lerp(spin.spin, r()) : 0, spinAccel: spin ? lerp(spin.accel, r()) : 0,
    });
    this.emitted++;
  }

  /**
   * A streaked particle (type 3, `FUN_00326350`, decomp 224624): a band `2 h` wide from where it was a game tick ago
   * (`tickBack`, `STREAK_TICK_READING`) to where it is, its head pushed `h` on along the travel and its tail
   * `h x streak[0]` back, the tail's alpha times `streak[1]` -- the sparks' look. False when it has not moved (drawn as
   * a square).
   */
  private streak(p: Particle, h: number, eye: Vector3, rgba: [number, number, number, number], pos: Float32Array, uv: Float32Array, col: Float32Array, q: number): boolean {
    const prev = tickBack(p);
    const d = new Vector3(p.position[0] - prev[0], p.position[1] - prev[1], p.position[2] - prev[2]);
    const view = new Vector3(p.position[0] - eye.x, p.position[1] - eye.y, p.position[2] - eye.z).normalize();
    d.addScaledVector(view, -d.dot(view));                // the travel as the screen sees it
    if (d.lengthSq() < 1e-8) return false;
    d.normalize();
    const side = new Vector3().crossVectors(view, d).normalize().multiplyScalar(h);
    const [reach, tailAlpha] = p.source.streak ?? STREAK_DEFAULT;
    const head = new Vector3(...p.position).addScaledVector(d, h);
    const tail = new Vector3(...prev).addScaledVector(d, -h * reach);
    const corners: [Vector3, number][] = [
      [tail.clone().sub(side), tailAlpha], [tail.clone().add(side), tailAlpha], [head.clone().add(side), 1], [head.clone().sub(side), 1],
    ];
    corners.forEach(([v, k], i) => {
      const o = q * 4 + i;
      pos[o * 3] = v.x; pos[o * 3 + 1] = v.y; pos[o * 3 + 2] = v.z;
      uv[o * 2] = i === 1 || i === 2 ? 1 : 0;
      uv[o * 2 + 1] = i >= 2 ? 1 : 0;
      col[o * 4] = rgba[0]; col[o * 4 + 1] = rgba[1]; col[o * 4 + 2] = rgba[2]; col[o * 4 + 3] = rgba[3] * k;
    });
    return true;
  }

  /** A drawing group for each of `textures`, made now (the pre-warm compiles their programs at the map's load). */
  warm(textures: Iterable<string>): Mesh[] {
    const out: Mesh[] = [];
    for (const t of textures) out.push(this.groupFor(t.toLowerCase(), 0, 1).mesh);
    return out;
  }

  /** The texture's `bucket`-th batch, made (sharing the texture's one material) or grown to hold `need` particles. */
  private groupFor(texture: string, bucket: number, need: number): Group3 {
    let pool = this.meshes.get(texture);
    if (!pool) this.meshes.set(texture, (pool = []));
    let g = pool[bucket];
    if (g && g.capacity >= need) return g;
    const capacity = Math.max(64, 2 ** Math.ceil(Math.log2(Math.max(1, need))));
    if (!g) {
      const material = pool[0]?.material ?? effectMaterial(this.textures.get(texture) ?? null, { fog: true, vertexAlpha: true });
      const mesh = new Mesh(new BufferGeometry(), material);
      mesh.frustumCulled = false;
      mesh.renderOrder = PARTICLE_BATCH_RENDER_ORDER;    // after the walk and its decals; between the pass's items once drawn (LATER 593)
      mesh.name = bucket === 0 ? `particles ${texture}` : `particles ${texture} #${bucket}`;
      this.object.add(mesh);
      g = { mesh, material, capacity: 0, pos: new BufferAttribute(new Float32Array(0), 3), uv: new BufferAttribute(new Float32Array(0), 2), col: new BufferAttribute(new Float32Array(0), 4) };
      pool[bucket] = g;
    }
    // Grown to a power of two: the buffers are made again only then, and rewritten in place every frame.
    const geometry = new BufferGeometry();
    g.pos = new BufferAttribute(new Float32Array(capacity * 12), 3);
    g.uv = new BufferAttribute(new Float32Array(capacity * 8), 2);
    g.col = new BufferAttribute(new Float32Array(capacity * 16), 4);
    const idx = new Uint32Array(capacity * 6);
    for (let q = 0; q < capacity; q++) idx.set([q * 4, q * 4 + 1, q * 4 + 2, q * 4, q * 4 + 2, q * 4 + 3], q * 6);
    geometry.setAttribute('position', g.pos);
    geometry.setAttribute('uv', g.uv);
    geometry.setAttribute('color', g.col);
    geometry.setIndex(new BufferAttribute(idx, 1));
    g.mesh.geometry.dispose();
    g.mesh.geometry = geometry;
    g.capacity = capacity;
    return g;
  }

  private draw(camera: Camera | null): void {
    for (const pool of this.meshes.values()) for (const { mesh } of pool) mesh.visible = false;
    if (!camera || this.particles.length === 0) return;
    const eye = new Vector3().setFromMatrixPosition(camera.matrixWorld);
    const right = new Vector3().setFromMatrixColumn(camera.matrixWorld, 0).normalize();
    const up = new Vector3().setFromMatrixColumn(camera.matrixWorld, 1).normalize();
    const byTexture = new Map<string, { p: Particle; d2: number }[]>();
    for (const p of this.particles) {
      const d2 = (p.position[0] - eye.x) ** 2 + (p.position[1] - eye.y) ** 2 + (p.position[2] - eye.z) ** 2;
      const texture = p.texture ?? (particleTextureAt(p.source, p.age / p.life) ?? '').toLowerCase();
      let list = byTexture.get(texture);
      if (!list) byTexture.set(texture, (list = []));
      list.push({ p, d2 });
    }
    // LATER 593: the alpha pass's keys from this eye, far to near; a particle's key is its plain range squared (`d2`,
    // `FUN_00327910` D:L225490-225494), drawn before every item whose key is below it (`./alphaInterleave`).
    const keys = this.alphaPass?.keys(eye) ?? null;
    const n = keys?.length ?? 0;
    for (const [texture, list] of byTexture) {
      list.sort((a, b) => b.d2 - a.d2);                  // back to front (`FUN_00326c30`)
      // The runs of one slot, far to near: the list and the keys both descend, so a run's slot never falls.
      let bucket = 0;
      for (let i = 0; i < list.length;) {
        const slot = keys ? particleSlot(keys, list[i]!.d2) : 0;
        let j = i + 1;
        if (bucket === PARTICLE_BUCKETS_PER_TEXTURE_ADAPTATION - 1) j = list.length;
        else if (keys === null) j = list.length;                  // no pass: one batch, as before (the review's F1)
        else while (j < list.length && particleSlot(keys, list[j]!.d2) === slot) j++;
        const last = keys ? particleSlot(keys, list[j - 1]!.d2) : 0;   // the run's nearest slot (the cap's merged run)
        if (this.fill(texture, bucket, list, i, j, keys ? particleBucketOrder(last, n) : PARTICLE_BATCH_RENDER_ORDER, eye, right, up)) bucket++;
        i = j;
      }
    }
  }

  /** Writes `list[from..to)` into the texture's `bucket`-th batch at `renderOrder`; false when none of them is drawn. */
  private fill(
    texture: string, bucket: number, list: readonly { p: Particle; d2: number }[], from: number, to: number, renderOrder: number,
    eye: Vector3, right: Vector3, up: Vector3,
  ): boolean {
    const CORNERS: readonly (readonly [number, number])[] = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    const g = this.groupFor(texture, bucket, to - from);
    const pos = g.pos.array as Float32Array, uv = g.uv.array as Float32Array, col = g.col.array as Float32Array;
    let q = 0;
    for (let k0 = from; k0 < to; k0++) {
      const { p, d2 } = list[k0]!;
      const t = p.age / p.life, c = p.source;
      const fade = particleFade(c, d2);
      if (fade <= 0.01) continue;
      const [r, gg, b, a] = particleColour(c, t);
      const h = p.size * particleScale(c, t);
      if (c.type === 3 && this.streak(p, h, eye, [r, gg, b, a * fade], pos, uv, col, q)) { q++; continue; }
      if (c.type === 1 || c.type === 2) {
        const corners = c.type === 1 ? rotatedCorners(p.position, h, p.angle, right, up) : flatCorners(p.position, h);
        for (let k = 0; k < 4; k++) {
          const v = q * 4 + k, [x, y, z, u, w] = corners[k]!;
          pos[v * 3] = x; pos[v * 3 + 1] = y; pos[v * 3 + 2] = z;
          uv[v * 2] = u; uv[v * 2 + 1] = w;
          col[v * 4] = r; col[v * 4 + 1] = gg; col[v * 4 + 2] = b; col[v * 4 + 3] = a * fade;
        }
        q++;
        continue;
      }
      for (let k = 0; k < 4; k++) {
        const [sx, sy] = CORNERS[k]!;
        const v = q * 4 + k;
        pos[v * 3] = p.position[0] + (right.x * sx + up.x * sy) * h;
        pos[v * 3 + 1] = p.position[1] + (right.y * sx + up.y * sy) * h;
        pos[v * 3 + 2] = p.position[2] + (right.z * sx + up.z * sy) * h;
        uv[v * 2] = (sx + 1) / 2;
        uv[v * 2 + 1] = (sy + 1) / 2;
        col[v * 4] = r; col[v * 4 + 1] = gg; col[v * 4 + 2] = b; col[v * 4 + 3] = a * fade;
      }
      q++;
    }
    if (q === 0) return false;
    g.pos.needsUpdate = true; g.uv.needsUpdate = true; g.col.needsUpdate = true;
    g.mesh.geometry.setDrawRange(0, q * 6);
    // Three sorts transparent meshes at their bounding sphere's centre, even without frustum culling.
    // Its automatic bounds include unused buffer capacity and stay cached as particles move/die.
    // Refresh from only this frame's drawn vertices so a cloud is sorted at its actual location.
    // Original particle/transparent ordering: docs/research/89-effects.md §20. A browser adaptation: three's per-object transparent sort; the original sorts per particle (§20).
    // Texture batching
    // still approximates the original per-particle interleaving; this fixes the batch's sort location.
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (let i = 0; i < q * 12; i += 3) {
      const x = pos[i]!, y = pos[i + 1]!, z = pos[i + 2]!;
      minX = Math.min(minX, x); minY = Math.min(minY, y); minZ = Math.min(minZ, z);
      maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); maxZ = Math.max(maxZ, z);
    }
    const sphere = g.mesh.geometry.boundingSphere ??= new Sphere();
    sphere.center.set((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2);
    sphere.radius = Math.hypot(maxX - minX, maxY - minY, maxZ - minZ) / 2;
    g.mesh.renderOrder = renderOrder;                    // LATER 593: its slot between the alpha pass's items
    g.mesh.visible = true;
    return true;
  }
}

/**
 * INV-RAIN F1 (research 89 §21): the base and world velocities a `PARTICLE_SOURCE` command writes, null where it writes
 * none. `FUN_00266830` writes the base (+0x90) from the context's normal (flag B 0x2), its velocity (B 0x40, reflected
 * with 0x100), its velocity reflected (B 0x100), else the fixed xyz only with flag A 0x40 (D:L112949-113039); the world
 * velocity (+0x9c) the same with B 0x4 / 0x80 / 0x200 and flag A 0x80 (D:L113041-113119). A context form whose operand
 * the context lacks writes nothing (each branch's `lVar != 0` guard). A command with none of them -- the on / off
 * commands of `rain_falling`'s WHILE loop (flags A 0x1 / 0x3) -- leaves the source's velocities as they were. Was:
 * every command re-resolved both, so the loop's first switch zeroed the rain's (0,-45,0) on MP12, and the same on every
 * re-switched source (research 89 §21's sweep).
 */
export function commandVelocities(config: ParticleSource, ctx: EffectContext): { base: Vec3 | null; world: Vec3 | null } {
  const b = config.flagsB;
  const has = (from: VelocityFrom): boolean => from === 'fixed' || (from === 'normal' ? !!ctx.normal : !!ctx.velocity);
  const baseForm = (b & (PARTICLE_B.BASE_NORMAL | PARTICLE_B.BASE_VELOCITY | PARTICLE_B.BASE_REFLECT)) !== 0;
  const worldForm = (b & (PARTICLE_B.WORLD_NORMAL | PARTICLE_B.WORLD_VELOCITY | PARTICLE_B.WORLD_REFLECT)) !== 0;
  const writesBase = baseForm ? has(config.baseFrom) : (config.flagsA & PARTICLE_A.BASE_VELOCITY) !== 0;
  const writesWorld = worldForm ? has(config.worldFrom) : (config.flagsA & PARTICLE_A.WORLD_VELOCITY) !== 0;
  return {
    base: writesBase ? sourceVelocity(config.baseFrom, config.baseVelocity, config.baseScale, config.baseUnit, ctx) : null,
    world: writesWorld ? sourceVelocity(config.worldFrom, config.worldVelocity, config.worldScale, config.worldUnit, ctx) : null,
  };
}

/**
 * STREAK_TICK_READING: where a particle was one game tick ago -- its place now less the travel of one `GAME_FRAME_DT`
 * step of `update`'s integrator (`pos += v dt`, then `v += a dt`, then the friction), the step's velocity recovered from
 * the one now -- and no further back than the time it has moved since its spawn (`moved`: the spawn place, D:L225673).
 */
export function tickBack(p: Pick<Particle, 'position' | 'velocity' | 'moved' | 'source'>): Vec3 {
  const c = p.source, t = p.moved;
  if (t <= 0) return [p.position[0], p.position[1], p.position[2]];
  const d = c.friction !== 0 ? frictionFactor(c.friction, t) : 1;
  const v = (i: 0 | 1 | 2): number => p.velocity[i] / d - c.accel[i] * t;
  return [p.position[0] - v(0) * t, p.position[1] - v(1) * t, p.position[2] - v(2) * t];
}

/**
 * A rotated particle (type 1, `FUN_00325580`, decomp 224057): a screen-aligned square turned by its angle, its
 * half-diagonal the size -- corner i at `C + size (cos(θ + iπ/2) right + sin(θ + iπ/2) down)`, uv (0,0) (0,1) (1,1) (1,0).
 */
export function rotatedCorners(c: readonly number[], size: number, angle: number, right: Vector3, up: Vector3): [number, number, number, number, number][] {
  const uvs: [number, number][] = [[0, 0], [0, 1], [1, 1], [1, 0]];
  return uvs.map(([u, v], i) => {
    const t = angle + (i * Math.PI) / 2, cx = Math.cos(t) * size, sy = -Math.sin(t) * size;   // screen y runs down
    return [c[0]! + right.x * cx + up.x * sy, c[1]! + right.y * cx + up.y * sy, c[2]! + right.z * cx + up.z * sy, u, v];
  });
}

/**
 * A flat particle (type 2, `FUN_00325cc0`, decomp 224342): a square in the world's XZ plane at the particle's height,
 * `2 size` across and square to the world's axes -- the ripples' rings; u runs along +z, v along +x.
 */
export function flatCorners(c: readonly number[], s: number): [number, number, number, number, number][] {
  const [x, y, z] = [c[0]!, c[1]!, c[2]!];
  return [[x - s, y, z - s, 0, 0], [x + s, y, z - s, 0, 1], [x + s, y, z + s, 1, 1], [x - s, y, z + s, 1, 0]];
}

export interface Group3 {
  mesh: Mesh;
  material: MeshBasicNodeMaterial;
  capacity: number;
  pos: BufferAttribute;
  uv: BufferAttribute;
  col: BufferAttribute;
}
