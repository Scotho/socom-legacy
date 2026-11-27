import { DataTexture, Mesh, NearestFilter, OrthographicCamera, PlaneGeometry, RenderTarget, Scene } from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import { BC_KINDS, HD_BLOCK_DECODE_TOLERANCE_ADAPTATION, ktx2Level0Rgba, pageBlockSupport, withBlocks, type BcKind } from '../src/hdPackBlocks';
import { HdPackRuntime, HdTextureRegistry, hdKeyOf, type HdEntry, type HdManifest, type HdRuntimeOptions } from '../src/hdTexturePack';
import type { Ktx2Image } from '../src/ktx2';
import { createRenderer } from '../src/renderer';
import type { GraphicsBackendPreference } from '../src/graphicsBackend';
import { gradientBlocks, patternBlocks as blocks, tightRows, worstCaseBlocks } from './hdPackBlocksPicture';

/**
 * WM-PACK-2 RUNTIME's browser check (a test instrument, product track; no original): one 8x8 KTX2 payload per BC kind
 * applied by HdPackRuntime over a 4x4 original, drawn by the page's own renderer into an 8x8 target and read back --
 * once on the block path (the renderer's probe), once forced to the RGBA path -- so a block upload's pixels are held to
 * the RGBA path's. Synthetic blocks; no disc, no pack.
 */
const SIZE = 8;

export interface BlockRun { kind: BcKind; compressed: boolean; pixels: number[] }
export interface BlockSceneResult { backend: string; supported: BcKind[]; runs: { blocks: BlockRun[]; rgba: BlockRun[] }; texels: Record<string, number[]>; tolerance: number;
  /** A plain RGBA DataTexture (no pack, no blocks: today's path) drawn and read back the same way: its texels, its read-back. */
  control: { texels: number[]; pixels: number[] } }

/** One drawing of one payload: the renderer, its target and camera at `size`. */
interface Stage { app: Awaited<ReturnType<typeof createRenderer>>; target: RenderTarget; camera: OrthographicCamera; size: number }
async function stage(graphics: GraphicsBackendPreference, size: number): Promise<Stage> {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = size; document.body.append(canvas);
  const app = await createRenderer(canvas, { graphics });
  app.resize(size, size); app.setPixelRatio(1);
  const target = new RenderTarget(size, size, { minFilter: NearestFilter, magFilter: NearestFilter, depthBuffer: false });
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 2); camera.position.z = 1;
  return { app, target, camera, size };
}
/**
 * `material` drawn over the whole target, nearest, and read back as tight rows (`tightRows`: WebGPU's read-back is
 * 256-byte strided, WebGL's tight); row order as the backend reads it (WebGL bottom first).
 */
async function readBack(s: Stage, material: MeshBasicNodeMaterial): Promise<number[]> {
  const scene = new Scene(); scene.add(new Mesh(new PlaneGeometry(2, 2), material));
  s.app.renderer.setRenderTarget(s.target); s.app.renderer.render(scene, s.camera); s.app.renderer.setRenderTarget(null);
  const raw = await s.app.renderer.readRenderTargetPixelsAsync(s.target, 0, 0, s.size, s.size) as Uint8Array;
  return Array.from(tightRows(raw, s.size, s.size));
}
/**
 * `data` (`kind` blocks of `s.size` square) applied by HdPackRuntime over a 4x4 original with `options` (none: the
 * renderer's probe decides; `blocks: () => new Set()`: forced to the RGBA path), drawn nearest into the target and read
 * back; the payload's software decode beside it.
 */
async function draw(s: Stage, kind: BcKind, data: Uint8Array, options: HdRuntimeOptions): Promise<BlockRun & { texels: number[] }> {
  const n = s.size, img: Ktx2Image = { kind, vkFormat: 0, width: n, height: n, levels: [{ width: n, height: n, data }] };
  const decoded = { width: n, height: n, data: ktx2Level0Rgba(img) };
  const src = { width: 4, height: 4, data: new Uint8ClampedArray(64).map((_, i) => (i & 3) === 3 ? 255 : 40 + i) };
  const registry = new HdTextureRegistry(), texture = new DataTexture(src.data, 4, 4);
  texture.magFilter = texture.minFilter = NearestFilter; texture.needsUpdate = true; registry.register(texture, src);
  const entry: HdEntry = { key: await hdKeyOf(src), width: 4, height: 4, file: '0.ktx2', format: 'ktx2', outWidth: n, outHeight: n,
    bytes: n * n * 4, sha256: await hdKeyOf({ ...decoded, data: new Uint8ClampedArray(decoded.data) }), tier: 'A', source: 'synthetic' };
  const manifest: HdManifest = { format: 's2u-hd-texture-pack', version: 1, localOnly: true, game: 'SCUS-97275', name: 'blocks', method: 'synthetic', entries: [entry], totalBytes: entry.bytes };
  const runtime = new HdPackRuntime(registry, async () => withBlocks({ width: n, height: n, data: new Uint8ClampedArray(decoded.data) }, img), undefined, options);
  await runtime.setPack(manifest);
  const material = new MeshBasicNodeMaterial(); material.map = texture;
  const pixels = await readBack(s, material);
  const compressed = (texture as unknown as { isCompressedTexture?: boolean }).isCompressedTexture === true;
  await runtime.setPack(null); material.dispose(); texture.dispose();
  return { kind, compressed, pixels, texels: Array.from(decoded.data) };
}

export async function blockScene(graphics: GraphicsBackendPreference): Promise<BlockSceneResult> {
  const s = await stage(graphics, SIZE), texels: Record<string, number[]> = {};
  // The control: today's RGBA upload of known texels, through the same draw and read-back, before any pack.
  const known = new Uint8ClampedArray(SIZE * SIZE * 4).map((_, i) => (i & 3) === 3 ? 255 : (i * 37 + (i >> 5) * 11) & 255);
  const plain = new DataTexture(known, SIZE, SIZE); plain.magFilter = plain.minFilter = NearestFilter; plain.needsUpdate = true;
  const plainMaterial = new MeshBasicNodeMaterial(); plainMaterial.map = plain;
  const control = { texels: Array.from(known), pixels: await readBack(s, plainMaterial) };
  plainMaterial.dispose(); plain.dispose();
  const supported = [...pageBlockSupport()];
  const runs = { blocks: [] as BlockRun[], rgba: [] as BlockRun[] };
  for (const kind of BC_KINDS) {
    const b = await draw(s, kind, blocks(kind), {});                         // the renderer's probe (`pageBlockSupport`)
    const r = await draw(s, kind, blocks(kind), { blocks: () => new Set() }); // forced to the RGBA path
    texels[kind] = b.texels;
    runs.blocks.push({ kind, compressed: b.compressed, pixels: b.pixels }); runs.rgba.push({ kind, compressed: r.compressed, pixels: r.pixels });
  }
  return { backend: s.app.backend, supported, runs, texels, tolerance: HD_BLOCK_DECODE_TOLERANCE_ADAPTATION, control };
}

/** The picture mode's edge: a 64x64 synthetic gradient, 16x16 blocks. */
export const PICTURE_SIZE = 64;
export type PicturePanel = 'gradient' | 'worst-case';
export interface PictureRun { panel: PicturePanel; kind: 'bc1' | 'bc2' | 'bc3'; blocksCompressed: boolean; rgbaCompressed: boolean; blocks: number[]; rgba: number[] }
export interface PictureResult { backend: string; supported: BcKind[]; size: number; tolerance: number; runs: PictureRun[] }
/**
 * The picture mode, every panel SYNTHETIC (no HD pack on the box), each uploaded both ways on this one page -- the
 * renderer's probe, and forced to the RGBA path -- and read back: `gradient`, a smooth ramp hand-encoded as BC3 and BC1
 * (`gradientBlocks`: the everyday case, about 1 in 255 apart); `worst-case`, the first test's own block patterns tiled
 * over the panel as BC1, BC2 and BC3 (`worstCaseBlocks`: wide endpoint spans, the texels PC 2's decoder put 5-6 apart).
 */
export async function pictureScene(graphics: GraphicsBackendPreference): Promise<PictureResult> {
  const s = await stage(graphics, PICTURE_SIZE), runs: PictureRun[] = [];
  const panels: [PicturePanel, 'bc1' | 'bc2' | 'bc3', Uint8Array][] = [
    ['gradient', 'bc3', gradientBlocks('bc3', PICTURE_SIZE, PICTURE_SIZE)], ['gradient', 'bc1', gradientBlocks('bc1', PICTURE_SIZE, PICTURE_SIZE)],
    ...(['bc1', 'bc2', 'bc3'] as const).map((k): [PicturePanel, 'bc1' | 'bc2' | 'bc3', Uint8Array] => ['worst-case', k, worstCaseBlocks(k, PICTURE_SIZE, PICTURE_SIZE)]),
  ];
  for (const [panel, kind, data] of panels) {
    const b = await draw(s, kind, data, {}), r = await draw(s, kind, data, { blocks: () => new Set() });
    runs.push({ panel, kind, blocksCompressed: b.compressed, rgbaCompressed: r.compressed, blocks: b.pixels, rgba: r.pixels });
  }
  return { backend: s.app.backend, supported: [...pageBlockSupport()], size: PICTURE_SIZE, tolerance: HD_BLOCK_DECODE_TOLERANCE_ADAPTATION, runs };
}
