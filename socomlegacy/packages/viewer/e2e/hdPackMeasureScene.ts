import { DataTexture, LinearFilter, Mesh, NearestFilter, OrthographicCamera, PlaneGeometry, RenderTarget, Scene } from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import type { Rgba } from '@s2u/gs';
import { pageBlockSupport } from '../src/hdPackBlocks';
import { HD_LIMITS, HdPackRuntime, HdTextureRegistry, hdKeyOf, type HdEntry, type HdManifest } from '../src/hdTexturePack';
import { lazyHdPackDecoders } from '../src/hdTexturePackServed';
import { createRenderer } from '../src/renderer';
import type { GraphicsBackendPreference } from '../src/graphicsBackend';

/**
 * WM-34 / H457's measurement (a test instrument, product track, a browser adaptation; no original, no game value): one
 * HD pack's payloads -- DDS as served today, or the same pack converted to KTX2 (`tools/hd-pack-ktx2.ts --out`) --
 * applied by the page's own `HdPackRuntime`, through the page's own decoders (`lazyHdPackDecoders` over
 * `HdMenuDecoder`, as the match makes them, `matchMount.ts`), to one live texture per whole entry, drawn by the page's own
 * renderer, and timed. The runtime's keys are the sha256 of disc decodes, which this page has not got: each entry is
 * re-keyed to a SYNTHETIC source of its own declared size (unique bytes, opaque), so the real payload, its real size
 * and sha256 check, alpha step, block decision and upload all run; only the match by key is stood in for. Textures are
 * made as `world.ts` `makeTexture` makes an unmipped bilinear one (flipY false, no colour space, no mip chain): the
 * case the block path takes; a mipped ground or detail texture stays on the RGBA path in the game, and is not modelled.
 * Placement entries (HD.R9 composites) are left out and counted.
 */
export interface MeasureInput { files: string[]; graphics: GraphicsBackendPreference; root: string; manifest: HdManifest }
export interface MeasureResult {
  backend: string; supported: string[]; decoderMode: string; textures: number; applied: number; skipped: number;
  skipReasons: Record<string, number>; appliedBytes: number; compressed: number; rgba: number;
  /** ms from `setPack` to every apply settled; then to the first frame drawn and read back (the uploads done). */
  ms: { apply: number; firstFrame: number; total: number };
  fetchedBytes: number; heapBefore: number | null; heapAfter: number | null;
}
declare global { interface Window { __hdMeasureKeep?: unknown[] } }

/** A synthetic source of `w` x `h`, its bytes unique to `seed`, opaque (a decode's 255). */
function source(w: number, h: number, seed: number): Rgba {
  const data = new Uint8ClampedArray(w * h * 4);
  let x = (seed * 2654435761) >>> 0 || 1;
  for (let i = 0; i < data.length; i++) { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; data[i] = (i & 3) === 3 ? 255 : x & 255; }
  return { width: w, height: h, data };
}
const heap = (): number | null => (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? null;

interface Prepared { app: Awaited<ReturnType<typeof createRenderer>>; registry: HdTextureRegistry; textures: DataTexture[]; manifest: HdManifest;
  frame: () => Promise<void>; root: string; keep: unknown[] }
let prepared: Prepared | null = null;

/** The page, its renderer and one live texture per whole entry of `input.files`, drawn once with their originals. */
export async function prepare(input: MeasureInput): Promise<{ textures: number; placedLeftOut: number; backend: string; gpuProbe: Record<string, unknown> }> {
  // Why a backend was drawn: this page's own WebGPU answer, timed, before the renderer asks (the renderer's wait is
  // `adapterWait.ts` WEBGPU_ADAPTER_WAIT_MS_ADAPTATION).
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<{ info?: { isFallbackAdapter?: boolean } } | null> } }).gpu;
  const gpuProbe: Record<string, unknown> = { userAgent: navigator.userAgent, secure: isSecureContext, gpu: !!gpu };
  if (gpu) { const t = performance.now(); try { const a = await gpu.requestAdapter(); gpuProbe['adapter'] = !!a; gpuProbe['fallback'] = a?.info?.isFallbackAdapter ?? null; } catch (e) { gpuProbe['error'] = String(e); } gpuProbe['ms'] = Math.round(performance.now() - t); }
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256; document.body.append(canvas);
  const app = await createRenderer(canvas, { graphics: input.graphics }); app.resize(256, 256); app.setPixelRatio(1);
  const want = new Set(input.files);
  const chosen = input.manifest.entries.filter(e => want.has(e.file)), wholes = chosen.filter(e => !e.placements);
  const registry = new HdTextureRegistry(), textures: DataTexture[] = [], entries: HdEntry[] = [];
  for (const [i, e] of wholes.entries()) {
    const src = source(e.width, e.height, i + 1);
    const t = new DataTexture(new Uint8Array(src.data.buffer), e.width, e.height);
    t.magFilter = t.minFilter = LinearFilter; t.flipY = false; t.needsUpdate = true;
    registry.register(t, src); textures.push(t);
    entries.push({ ...e, key: await hdKeyOf(src) });
  }
  const totalBytes = [...new Map(entries.map(e => [e.file, e.bytes])).values()].reduce((a, b) => a + b, 0);
  const { packedBytes: _packed, ...rest } = input.manifest;
  const manifest: HdManifest = { ...rest, entries, totalBytes };
  // The textures drawn before the pack: their originals uploaded, as a live world's are.
  const scene = new Scene(), camera = new OrthographicCamera(-1, 1, 1, -1, 0, 2); camera.position.z = 1;
  const geometry = new PlaneGeometry(2 / 64, 2 / 64), materials: MeshBasicNodeMaterial[] = [];
  textures.forEach((t, i) => {
    const m = new MeshBasicNodeMaterial(); m.map = t; materials.push(m);
    const mesh = new Mesh(geometry, m); mesh.position.set(-1 + (i % 64 + 0.5) / 32, -1 + (Math.floor(i / 64) % 64 + 0.5) / 32, 0); scene.add(mesh);
  });
  const target = new RenderTarget(256, 256, { minFilter: NearestFilter, magFilter: NearestFilter, depthBuffer: false });
  const frame = async () => {
    app.renderer.setRenderTarget(target); app.renderer.render(scene, camera); app.renderer.setRenderTarget(null);
    await app.renderer.readRenderTargetPixelsAsync(target, 0, 0, 1, 1);
  };
  await frame();
  prepared = { app, registry, textures, manifest, frame, root: input.root, keep: [scene, materials, geometry, target] };
  return { textures: textures.length, placedLeftOut: chosen.length - wholes.length, backend: app.backend, gpuProbe };
}

/** The pack set on the prepared textures, timed to every apply settled and then to the first frame drawn and read back. */
export async function run(): Promise<MeasureResult> {
  const p = prepared; if (!p) throw new Error('prepare first');
  let decoder: { mode: string; failure: string | null } | null = null, fetchedBytes = 0;
  const decoders = lazyHdPackDecoders(() => import('../src/hdMenuTextures').then(m => { const d = new m.HdMenuDecoder(); decoder = d; return d; }));
  const load = async (e: HdEntry): Promise<Rgba> => {
    const res = await fetch(`${p.root}${e.file}`); if (!res.ok) throw new Error(`${e.file}: ${res.status}`);
    const bytes = new Uint8Array(await res.arrayBuffer()); fetchedBytes += bytes.length;
    const size = { width: e.outWidth, height: e.outHeight };
    // As the page's own loader (`hdTexturePackServed.ts` `load`): KTX2, DDS, or PNG at the output bound (review L3).
    return e.format === 'ktx2' ? decoders.ktx2!(bytes, size) : e.format === 'dds' ? decoders.dds!(bytes, size) : decoders.png!(bytes, HD_LIMITS.outputEdge);
  };
  const runtime = new HdPackRuntime(p.registry, load, undefined, { alpha: decoders.alpha });
  const heapBefore = heap();
  const t0 = performance.now();
  const report = await runtime.setPack(p.manifest);
  const t1 = performance.now();
  await p.frame();
  const t2 = performance.now();
  const skipReasons: Record<string, number> = {};
  for (const s of report.skipped) {
    const r = String((s as { reason?: string }).reason ?? JSON.stringify(s)).replace(/[0-9a-f]{64}/g, '#').replace(/\d+/g, 'n').slice(0, 100);
    skipReasons[r] = (skipReasons[r] ?? 0) + 1;
  }
  const compressed = p.textures.filter(t => (t as unknown as { isCompressedTexture?: boolean }).isCompressedTexture === true).length;
  window.__hdMeasureKeep = [p, runtime, decoders];
  const dm = decoder as { mode: string; failure: string | null } | null;
  return {
    backend: p.app.backend, supported: [...pageBlockSupport()], decoderMode: dm ? `${dm.mode}${dm.failure ? ` (${dm.failure})` : ''}` : 'never made',
    textures: p.textures.length, applied: report.applied, skipped: report.skipped.length, skipReasons, appliedBytes: runtime.appliedBytes,
    compressed, rgba: report.applied - compressed, ms: { apply: Math.round(t1 - t0), firstFrame: Math.round(t2 - t1), total: Math.round(t2 - t0) },
    fetchedBytes, heapBefore, heapAfter: heap(),
  };
}
