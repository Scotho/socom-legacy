import { HudFrameStorage } from './hudFrameStorage';
import {
  HudState,
} from './hudState';
import {
  UiTextureExperiment,
} from './experimentalUiTextures';
import {
  integerFit, type UiSamplingSettings,
} from './experimentalUiSampling';
import {
  BufferAttribute, BufferGeometry, DataTexture, DoubleSide, LinearFilter, Mesh,
  OrthographicCamera, RGBAFormat, Scene, UnsignedByteType, Vector2,
} from 'three';
import {
  MeshBasicNodeMaterial,
} from 'three/webgpu';
import {
  texture as textureNode, uv, vec4, vertexColor,
} from 'three/tsl';
import type {
  Rgba,
} from '@s2u/gs';

import {
  HUD_LIBRARIES, NOT_ICONS, type HudBitmaps,
} from './hudAssets';
import {
  FONT_TEXT_01,
} from './hudFont';

import type {
  HudRenderer,
} from './reticle';


import {
  ROUND_SCREEN_BITMAPS,
} from './roundScreens';







import {
  hdTextures,
} from './hdTexturePack';
import {
  PS2_H, WHITE, hudPass, GS_SAMPLE_OFFSET,
} from './hudLayout';
import type {
  HudQuad, HudTri,
} from './hudLayout';
export * from './hudLayout';
import { MESSAGE_SCALE, hudChipDrawer } from './hudLayout';
import { seatKillFeedPreview } from './killFeed';


function makeTexture(rgba: Rgba): DataTexture {
  // `./hudAssets` hands the bitmaps over top row first; the HUD camera looks with y down, so they go up unflipped.
  const t = new DataTexture(rgba.data, rgba.width, rgba.height, RGBAFormat, UnsignedByteType);
  hdTextures.register(t, rgba, true);   // OT.R92 (HD-3): inert until the test room's HD pack is set; `flipRows`'d, keyed turned back
  t.magFilter = LinearFilter;
  t.minFilter = LinearFilter;
  t.generateMipmaps = false;
  t.flipY = false;
  t.needsUpdate = true;
  return t;
}

/** One batch per layer and bitmap: a dynamic quad list drawn in one call. */
/**
 * `sent`: the geometry's attributes have been flagged for upload once; `count`: the quads (triangles) last written. CPS
 * (plan 2026-11-02; product track, the same picture): a frame flags its attributes only when what it wrote changed them.
 */
interface Batch { mesh: Mesh; geometry: BufferGeometry; capacity: number; size: { width: number; height: number }; sent: boolean; count: number }
/** One layer's untextured triangles (`sent`, `count` as `Batch`'s). */
interface Shapes { mesh: Mesh; geometry: BufferGeometry; capacity: number; sent: boolean; count: number }
/** The layers the pass draws, in order: the in-round HUD, the tactical map. */
export const HUD_LAYERS = 2;

/**
 * The HUD pass: an orthographic scene in frame pixels (y down) drawn after the world and the reticle with
 * `autoClear` off and no depth test. The page feeds it (`feed`, once a frame) and calls `render` after the reticle's.
 */
export class Hud extends HudState {
  protected hasDrawables(): boolean { return this.batches.size > 0; }

  private readonly sampling = new UiTextureExperiment();
  /** WM-DATA-FEED's capture (a test instrument, `./killFeed` `seatKillFeedPreview`): a development build's `?devmode` only. */
  constructor() { super(); if (import.meta.env.DEV) seatKillFeedPreview(this, MESSAGE_SCALE); }
  /** Test-room-only browser experiment (research 260); state and layout boxes remain the original's. */
  setExperimentalSampling(settings: UiSamplingSettings): void { this.sampling.set(settings); }
  private readonly scene = new Scene();
  private readonly camera = new OrthographicCamera(0, 1, 0, 1, -1, 1);
  private batches = new Map<string, Batch>();
  private readonly frameStorage = new HudFrameStorage();
  private shapes: Shapes[] = [];
  private maps = new Map<string, { texture: DataTexture; size: { width: number; height: number } }>();
  private textures: DataTexture[] = [];
  private materials: MeshBasicNodeMaterial[] = [];
  private readonly size = new Vector2();
  /** The arsenal's icons' batches not made yet, by `layer:name`, each with its place in the draw order. */
  private readonly later = new Map<string, { layer: number; name: string; order: number }>();

  protected build(): void {
    this.clear();
    if (!this.base) return;
    const bitmaps: HudBitmaps = { ...this.extra, ...this.base };
    // The draw order: the round screens' background and panels, the panels, what sits on them, the compass, the
    // prompt, the text last.
    const names = Object.keys(bitmaps);
    const order = [
      ROUND_SCREEN_BITMAPS.background, ROUND_SCREEN_BITMAPS.panel, 'newweapnbkrnd.tif', WHITE, ...names.filter((n) => !NOT_ICONS.has(n)), 'firemode.tif', 'compass_lo.tif',
      ...names.filter((n) => n.startsWith('action_')), FONT_TEXT_01.texture,
    ];
    const all: Record<string, Rgba> = { ...bitmaps, [WHITE]: { width: 1, height: 1, data: new Uint8ClampedArray([255, 255, 255, 255]) } };
    const drawn = [...new Set([...order, ...names])].filter((n) => all[n]);
    for (const name of drawn) {
      const texture = makeTexture(all[name]!);
      this.textures.push(texture);
      this.maps.set(name, { texture, size: { width: all[name]!.width, height: all[name]!.height } });
    }
    // Each layer: its shapes, then one batch per bitmap in the draw order above. The arsenal's weapon icons beyond the
    // HUD's own (`readHud`'s `weaponIcons`, some forty a map, web sprint 4) get theirs when first drawn (`render`), in
    // their place of the order: a material each is a batch to fill every frame and a program for the walk's warm-up.
    const own = new Set<string>([...HUD_LIBRARIES.HUDW]);
    const stride = drawn.length + 1;
    for (let layer = 0; layer < HUD_LAYERS; layer++) {
      this.addShapes(layer * stride);
      drawn.forEach((name, i) => {
        const order = layer * stride + 1 + i;
        if (NOT_ICONS.has(name) || own.has(name) || !name.endsWith('.tif')) this.addBatch(layer, name, order);
        else this.later.set(`${layer}:${name}`, { layer, name, order });
      });
    }
  }

  /** The pass's scene and camera, for the page's warm-up (`ViewerRenderer.prepare`): its programs linked before the walk. */
  warmTarget(): { scene: Scene; camera: OrthographicCamera } { return { scene: this.scene, camera: this.camera }; }

  /** Draws the HUD over whatever the renderer last drew: nothing is cleared. */
  render(renderer: HudRenderer): void {
    const now = performance.now() / 1000;
    const real = this.last < 0 ? 0 : Math.max(0, now - this.last);   // PAR-34: the round's clock counts it; the animations the 0.1 s clamp
    this.step(Math.min(0.1, real), real);
    this.last = now;
    renderer.getDrawingBufferSize(this.size);
    this.frame = { width: this.size.x, height: this.size.y };
    if ((!this.on && !this.model.spectator) || this.batches.size === 0) return;   // PAR-48: a view draws alone
    this.sampling.apply(this.textures);
    const { width, height } = this.frame;
    this.camera.left = 0; this.camera.right = width; this.camera.top = 0; this.camera.bottom = height;
    this.camera.updateProjectionMatrix();
    const { quads: all, tris } = hudPass(this.frame, this.model, this.sizes(), this.timing(), this.tacOpen, this.overlay, this.presentation, this.frameStorage);
    const chipDrawer = hudChipDrawer();
    if (chipDrawer) all.push(...chipDrawer(this.frame, this.sizes()));   // WM-PACKS-CHIP: the pack's chip over all, layer 1 (an adaptation)
    const byKey = new Map<string, HudQuad[]>();
    for (const q of all) {
      const key = `${q.layer ?? 0}:${q.texture}`;
      const list = byKey.get(key);
      if (list) list.push(q); else byKey.set(key, [q]);
    }
    const half = GS_SAMPLE_OFFSET * (height / PS2_H);
    for (const key of byKey.keys()) {
      const later = this.later.get(key);
      if (later) { this.later.delete(key); this.addBatch(later.layer, later.name, later.order); }
    }
    for (const [key, batch] of this.batches) this.fill(batch, byKey.get(key) ?? [], half);
    this.shapes.forEach((shapes, layer) => this.fillShapes(shapes, tris.filter((t) => t.layer === layer)));
    const autoClear = renderer.autoClear;
    renderer.autoClear = false;
    try { renderer.render(this.scene, this.camera); } finally { renderer.autoClear = autoClear; }
  }

  /** Each bitmap's texel size, for the layouts. */
  sizes(): Record<string, { width: number; height: number }> {
    const out: Record<string, { width: number; height: number }> = {};
    for (const [name, m] of this.maps) out[name] = m.size;
    return out;
  }

  private fillShapes(shapes: Shapes, tris: HudTri[]): void {
    if (tris.length > shapes.capacity) {
      const capacity = Math.max(tris.length, shapes.capacity * 2);
      const geometry = triGeometry(capacity);
      shapes.mesh.geometry = geometry;
      shapes.geometry.dispose();
      shapes.geometry = geometry;
      shapes.capacity = capacity;
      shapes.sent = false;
    }
    const pos = shapes.geometry.getAttribute('position') as BufferAttribute;
    const col = shapes.geometry.getAttribute('color') as BufferAttribute;
    const P = pos.array as Float32Array, C = col.array as Float32Array;
    // CPS: written as before, each slot through `put`; flagged only on a change, a new count or a fresh geometry.
    let changed = !shapes.sent || shapes.count !== tris.length;
    tris.forEach((t, i) => {
      for (let k = 0; k < 3; k++) {
        const n = i * 3 + k;
        if (put(P, n * 3, t.p[k * 2]!)) changed = true;
        if (put(P, n * 3 + 1, t.p[k * 2 + 1]!)) changed = true;
        if (put(P, n * 3 + 2, 0)) changed = true;
        for (let j = 0; j < 4; j++) if (put(C, n * 4 + j, t.rgba[j]!)) changed = true;
      }
    });
    if (changed) { pos.needsUpdate = true; col.needsUpdate = true; shapes.sent = true; }
    shapes.count = tris.length;
    shapes.geometry.setDrawRange(0, tris.length * 3);
    shapes.mesh.visible = tris.length > 0;
  }

  private addShapes(order: number): void {
    const material = new MeshBasicNodeMaterial();
    material.name = 'hud shapes';
    material.vertexColors = false;
    material.colorNode = vec4(vertexColor()).clamp(0, 1);
    material.transparent = true;
    material.depthTest = false;
    material.depthWrite = false;
    material.side = DoubleSide;
    material.fog = false;
    material.toneMapped = false;
    this.materials.push(material);
    const capacity = 64;
    const geometry = triGeometry(capacity);
    const mesh = new Mesh(geometry, material);
    mesh.frustumCulled = false;
    mesh.renderOrder = order;
    mesh.visible = false;
    this.scene.add(mesh);
    this.shapes.push({ mesh, geometry, capacity, sent: false, count: 0 });
  }

  private fill(batch: Batch, quads: HudQuad[], half: number): void {
    if (quads.length > batch.capacity) this.grow(batch, quads.length);
    const pos = batch.geometry.getAttribute('position') as BufferAttribute;
    const tex = batch.geometry.getAttribute('uv') as BufferAttribute;
    const col = batch.geometry.getAttribute('color') as BufferAttribute;
    const P = pos.array as Float32Array, T = tex.array as Float32Array, C = col.array as Float32Array;
    const { width, height } = batch.size;
    // CPS: written as before, each slot through `put`; flagged only on a change, a new count or a fresh geometry.
    let changed = !batch.sent || batch.count !== quads.length;
    quads.forEach((q, i) => {
      if (this.sampling.settings.enabled && this.sampling.settings.mode === 'integer' && q.texture !== WHITE) {
        const sourceW = Math.abs(q.u1-q.u0), sourceH = Math.abs(q.v1-q.v0);
        const scaleX = Math.abs(q.w)/sourceW, scaleY = Math.abs(q.h)/sourceH;
        // Letterbox uniformly scaled bitmap content only. Layout fills (including the health bar,
        // fader and stretched panels) must retain their full coverage, independent of sampling.
        if (sourceW > 0 && sourceH > 0 && Math.abs(scaleX-scaleY) <= 1e-6*Math.max(scaleX, scaleY)) {
          const fit = integerFit(sourceW, sourceH, Math.abs(q.w), Math.abs(q.h), this.sampling.settings.snap);
          q = {...q, w: Math.sign(q.w)*fit.width, h: Math.sign(q.h)*fit.height};
        }
      }
      const c = Math.cos(q.turn), sn = Math.sin(q.turn);
      // The GS's corner sampling (`GS_SAMPLE_OFFSET`): the screen's (-half, -half) in the quad's own axes, in texels.
      const lx0 = -half * c - half * sn, ly0 = half * sn - half * c;
      const du = (lx0 / q.w) * (q.u1 - q.u0), dv = (ly0 / q.h) * (q.v1 - q.v0);
      // Same four corners and arithmetic, without five temporary arrays per quad.
      for (let k = 0; k < 4; k++) {
        const right = k === 1 || k === 2, bottom = k >= 2;
        const cx = right ? 0.5 : -0.5, cy = bottom ? 0.5 : -0.5;
        const u = right ? q.u1 : q.u0, v = bottom ? q.v1 : q.v0;
        const lx = cx * q.w, ly = cy * q.h, n = i * 4 + k;
        // A clockwise turn on a y-down screen: the game's own (x cos - y sin, x sin + y cos), `FUN_00358730`.
        if (put(P, n * 3, q.x + lx * c - ly * sn)) changed = true;
        if (put(P, n * 3 + 1, q.y + lx * sn + ly * c)) changed = true;
        if (put(P, n * 3 + 2, 0)) changed = true;
        if (put(T, n * 2, (u + du) / width)) changed = true;
        if (put(T, n * 2 + 1, (v + dv) / height)) changed = true;
        if (put(C, n * 4, q.rgba[0])) changed = true;
        if (put(C, n * 4 + 1, q.rgba[1])) changed = true;
        if (put(C, n * 4 + 2, q.rgba[2])) changed = true;
        if (put(C, n * 4 + 3, cx > 0 ? q.alphaRight ?? q.rgba[3] : q.rgba[3])) changed = true;
      }
    });
    if (changed) { pos.needsUpdate = true; tex.needsUpdate = true; col.needsUpdate = true; batch.sent = true; }
    batch.count = quads.length;
    batch.geometry.setDrawRange(0, quads.length * 6);
    batch.mesh.visible = quads.length > 0;
  }

  private grow(batch: Batch, need: number): void {
    const capacity = Math.max(need, batch.capacity * 2);
    const geometry = quadGeometry(capacity);
    batch.mesh.geometry = geometry;
    batch.geometry.dispose();
    batch.geometry = geometry;
    batch.capacity = capacity;
    batch.sent = false;
  }

  private addBatch(layer: number, name: string, order: number): void {
    const { texture: map, size } = this.maps.get(name)!;
    const material = new MeshBasicNodeMaterial();
    material.name = `hud ${layer} ${name}`;
    material.vertexColors = false;
    // The GS's MODULATE: the texel times the vertex colour, alpha included, blended over the frame. The colour may go
    // over 1 (the action pulse's green peak, 160/128: 24 + 80), and the GS clamps.
    material.colorNode = vec4(textureNode(map, uv()).mul(vertexColor())).clamp(0, 1);
    material.transparent = true;
    material.depthTest = false;
    material.depthWrite = false;
    material.side = DoubleSide;
    material.fog = false;
    material.toneMapped = false;
    this.materials.push(material);
    const capacity = name === FONT_TEXT_01.texture ? 96 : 4;
    const geometry = quadGeometry(capacity);
    const mesh = new Mesh(geometry, material);
    mesh.frustumCulled = false;
    mesh.renderOrder = order;
    mesh.visible = false;
    this.scene.add(mesh);
    this.batches.set(`${layer}:${name}`, { mesh, geometry, capacity, size, sent: false, count: 0 });
  }

  protected clear(): void {
    this.frameStorage.clear();
    this.sampling.clear();
    for (const b of [...this.batches.values(), ...this.shapes]) { this.scene.remove(b.mesh); b.geometry.dispose(); }
    for (const m of this.materials) m.dispose();
    for (const t of this.textures) t.dispose();
    this.batches.clear(); this.later.clear(); this.shapes = []; this.maps.clear();
    this.materials = []; this.textures = [];
  }
}


/**
 * CPS (plan 2026-11-02; product track, the same picture): stores `v` at `a[j]` and says whether the slot's bytes changed
 * -- the float32 the store rounds `v` to (`Math.fround`, the typed array's own conversion) against the slot's, a zero's
 * sign told apart; a NaN always counts as a change.
 */
function put(a: Float32Array, j: number, v: number): boolean {
  const f = Math.fround(v), old = a[j]!;
  if (old === f && (f !== 0 || 1 / old === 1 / f)) return false;
  a[j] = f;
  return true;
}

/** `capacity` triangles' worth of vertices, unindexed. */
function triGeometry(capacity: number): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(capacity * 9), 3));
  geometry.setAttribute('color', new BufferAttribute(new Float32Array(capacity * 12), 4));
  geometry.setDrawRange(0, 0);
  return geometry;
}

/** `capacity` quads' worth of vertices (four each) and indices (two triangles each). */
function quadGeometry(capacity: number): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(capacity * 12), 3));
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array(capacity * 8), 2));
  geometry.setAttribute('color', new BufferAttribute(new Float32Array(capacity * 16), 4));
  const index = new Uint16Array(capacity * 6);
  for (let i = 0; i < capacity; i++) index.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
  geometry.setIndex(new BufferAttribute(index, 1));
  geometry.setDrawRange(0, 0);
  return geometry;
}
