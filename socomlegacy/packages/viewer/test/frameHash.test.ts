import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BoxGeometry, Group, LinearSRGBColorSpace, Mesh, RenderTarget, Scene, PerspectiveCamera, type Vector2 } from 'three';
import { bodiesInView, fnv1a64, followSeat, hashFrame, tightRows, type FrameHashRenderer } from '../src/frameHash';
import { followPose, SpectatorView, type SpectatorBody, type SpectatorPose } from '../src/spectatorView';
import { BodyFlag } from '../src/net/protocol';
import { diffFrames, describeFrameDiff, framePpm, frameDiffPpm } from '../src/frameDiff';
import { ReplayClock } from '../src/replay/clock';
import { builtTitle, readBuiltDist, VIEWER_DIST } from './builtDist';

/**
 * CPS.R9 (e)'s frame identity gate (product track, a dev instrument; `docs/plans/2026-11-02-client-performance-sprint.md`):
 * `window.__viewer.frameHash()` -- the world scene rendered with the page's camera into a render target, read back and
 * hashed. Here: the pure parts (FNV-1a 64 against its published vectors and a BigInt reference; the readback's row
 * padding stripped), `hashFrame` over a fake renderer (no GPU: what it sets, renders, reads and restores), the replay
 * clock's hold the spec rests on (`tick=` opens paused), and the hook's gate (a development build's only, as
 * `renderStats`'). The browser spec (`e2e/zz-frame-identity.spec.ts`) is run on request, not here.
 */
const here = dirname(fileURLToPath(import.meta.url));
const src = (f: string): string => readFileSync(resolve(here, '../src', f), 'utf-8');
const bytes = (s: string): Uint8Array => new TextEncoder().encode(s);

/** FNV-1a 64 by BigInt, the reference the two-half implementation is checked against. */
function reference(b: Uint8Array): string {
  let h = 0xcbf29ce484222325n;
  for (const x of b) { h ^= BigInt(x); h = (h * 0x100000001b3n) & 0xffffffffffffffffn; }
  return h.toString(16).padStart(16, '0');
}

describe('CPS.R9 (e): fnv1a64, the frame\'s hash', () => {
  it('the published FNV-1a 64 vectors: "", "a", "foobar"', () => {
    expect(fnv1a64(bytes(''))).toBe('cbf29ce484222325');
    expect(fnv1a64(bytes('a'))).toBe('af63dc4c8601ec8c');
    expect(fnv1a64(bytes('foobar'))).toBe('85944171f73967e8');
  });
  it('equals the BigInt reference over every byte value and a frame-sized run (carries across the halves)', () => {
    const all = new Uint8Array(256 * 4);
    for (let i = 0; i < all.length; i++) all[i] = (i * 37 + (i >> 8)) & 0xff;
    expect(fnv1a64(all)).toBe(reference(all));
    const frame = new Uint8Array(64 * 48 * 4);
    let s = 0x1234567;
    for (let i = 0; i < frame.length; i++) { s = (Math.imul(s, 1103515245) + 12345) >>> 0; frame[i] = s >>> 24; }
    expect(fnv1a64(frame)).toBe(reference(frame));
  });
  it('one byte changed changes the hash; 16 lower-case hex digits always', () => {
    const a = new Uint8Array(1024), b = new Uint8Array(1024);
    b[700] = 1;
    expect(fnv1a64(a)).not.toBe(fnv1a64(b));
    expect(fnv1a64(a)).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe('CPS.R9 (e): tightRows, the readback without its row padding', () => {
  it('a tight buffer (WebGL2\'s readPixels) is the same bytes', () => {
    const t = Uint8Array.from({ length: 3 * 2 * 4 }, (_, i) => i);
    expect([...tightRows(t, 3, 2)]).toEqual([...t]);
  });
  it('a WebGPU copy\'s rows padded to 256 bytes are cut to w x 4 each', () => {
    const w = 3, h = 2, stride = 256;
    const padded = new Uint8Array((h - 1) * stride + w * 4).fill(0xee);
    for (let y = 0; y < h; y++) for (let i = 0; i < w * 4; i++) padded[y * stride + i] = y * 100 + i;
    expect([...tightRows(padded, w, h)]).toEqual([...Array.from({ length: 12 }, (_, i) => i), ...Array.from({ length: 12 }, (_, i) => 100 + i)]);
  });
  it('a buffer too short for either layout is refused', () => {
    expect(() => tightRows(new Uint8Array(10), 3, 2)).toThrow(/frame readback/);
  });
});

/** A fake of three's renderer: records what `hashFrame` does to it. */
function fake(o: { drawingBuffer?: [number, number]; drawsPerRender?: number; previous?: RenderTarget | null; webgpu?: boolean } = {}) {
  const log: string[] = [];
  let target: RenderTarget | null = o.previous ?? null;
  const info = { render: { drawCalls: 40, calls: 9 } };
  const r = {
    samples: 4, stencil: false, outputColorSpace: LinearSRGBColorSpace,
    backend: o.webgpu ? { isWebGPUBackend: true, utils: { getPreferredCanvasFormat: () => 'bgra8unorm' } } : { isWebGLBackend: true },
    info, autoClear: false,
    getRenderTarget: () => target,
    setRenderTarget: (t: RenderTarget | null) => { target = t; log.push(t === null ? 'target canvas' : t === o.previous ? 'target previous' : `target ${t.width}x${t.height} s${t.samples}`); },
    render: (scene: unknown, camera: unknown) => {
      log.push(`render autoClear=${r.autoClear} scene=${scene === theScene} camera=${camera === theCamera}`);
      info.render.drawCalls += o.drawsPerRender ?? 7;
      info.render.calls++;
    },
    readRenderTargetPixelsAsync: async (t: RenderTarget, x: number, y: number, w: number, h: number) => {
      log.push(`read ${x},${y} ${w}x${h} same=${t === lastTarget}`);
      return new Uint8Array(w * h * 4).fill(3);
    },
    getDrawingBufferSize: (v: Vector2) => { const [x, y] = o.drawingBuffer ?? [8, 6]; return v.set(x, y); },
  };
  let lastTarget: RenderTarget | null = null;
  const realSet = r.setRenderTarget;
  r.setRenderTarget = (t) => {
    if (t && t !== o.previous && t !== lastTarget) { lastTarget = t; t.addEventListener('dispose', () => { log.push('dispose'); }); }
    realSet(t);
  };
  return { r: r as unknown as FrameHashRenderer, log, last: () => lastTarget, info };
}
const theScene = new Scene();
const theCamera = new PerspectiveCamera();

describe('CPS.R9 (e): hashFrame over a fake renderer', () => {
  it('renders the scene with the camera into a target of the drawing buffer\'s size, reads it, and goes back to the canvas', async () => {
    const f = fake({ drawingBuffer: [8, 6] });
    const got = await hashFrame(f.r, theScene, theCamera);
    expect(f.log).toEqual(['target 8x6 s4', 'render autoClear=true scene=true camera=true', 'target canvas', 'read 0,0 8x6 same=true', 'dispose']);
    expect(got).toEqual({ hash: fnv1a64(new Uint8Array(8 * 6 * 4).fill(3)), w: 8, h: 6, draws: 7, samples: 4, format: null });
  });
  it('a given size is used instead; the draws are that render\'s alone (the frame\'s counts before it are not counted)', async () => {
    const f = fake({ drawsPerRender: 312 });
    const got = await hashFrame(f.r, theScene, theCamera, { width: 960.7, height: 540 });
    expect([got.w, got.h, got.draws]).toEqual([960, 540, 312]);
    expect(f.info.render.drawCalls).toBe(40 + 312);
  });
  it('{ keep: true } returns the read bytes, tight, beside the hash; without it no bytes are kept', async () => {
    const kept = await hashFrame(fake().r, theScene, theCamera, { width: 3, height: 2 }, { keep: true });
    expect([...kept.bytes!]).toEqual(new Array(3 * 2 * 4).fill(3));
    expect(kept.hash).toBe(fnv1a64(kept.bytes!));
    const plain = await hashFrame(fake().r, theScene, theCamera, { width: 3, height: 2 });
    expect('bytes' in plain).toBe(false);
  });
  it('the target is the main pass\'s twin (samples, colour space; WebGPU: the canvas format) and is disposed after the read', async () => {
    const f = fake({ webgpu: true });
    const got = await hashFrame(f.r, theScene, theCamera);
    const t = f.last()!;
    expect(t.samples).toBe(4);
    expect(t.depthBuffer).toBe(true);
    expect(t.texture.colorSpace).toBe(LinearSRGBColorSpace);
    expect(t.texture.internalFormat).toBe('bgra8unorm');
    expect(got.format).toBe('bgra8unorm');
    expect(f.log.at(-1)).toBe('dispose');
  });
  it('the page\'s own target and autoClear are put back, even when the render throws', async () => {
    const previous = new RenderTarget(2, 2);
    const f = fake({ previous });
    const r = f.r as unknown as { render: () => void; autoClear: boolean };
    r.render = () => { throw new Error('lost'); };
    await expect(hashFrame(f.r, theScene, theCamera)).rejects.toThrow('lost');
    expect(f.r.getRenderTarget()).toBe(previous);
    expect(r.autoClear).toBe(false);
  });
});

describe('CPS.R9 (e): the replay holds its frame at tick=&pause (the spec\'s hold)', () => {
  it('a paused replay clock seeks to the exact tick and stays there: two reads at any wall time are the same tick', () => {
    let wall = 0;
    const c = new ReplayClock({ tickHz: 30, start: 0, end: 9000, snaps: [0, 100, 200], now: () => wall });
    c.play();
    wall = 1234;
    c.pause();
    expect(c.playing).toBe(false);
    c.seek(500);
    wall = 10_000;
    expect(c.tick()).toBe(500);
    wall = 20_000;
    expect(c.tick()).toBe(500);
    expect(c.dtScale()).toBe(0);
  });
  it('the replay mount pauses at the open on `pause`, registered before the tick= seek (`test/replayPause.test.ts` drives it)', () => {
    expect(src('replay/mount.ts')).toMatch(/\n {4}if \(replayPauseAsked\(search\)\) void client\.ready\.then\(\(\) => \{ if \(client\.state === 'open'\) client\.pause\(\); \}\);\n {4}seekOnOpen\(search, client\);/);
  });
});

describe('CPS.R9 (e): the hook\'s frameHash is a development build\'s only', () => {
  it('main.ts hangs it under the dev panel\'s gate, beside renderStats, over the world scene and the page camera', () => {
    const main = src('main.ts');
    expect(main).toMatch(/\n {2}if \(import\.meta\.en[v]\.DEV && devToolsEnabled\(SEARCH\)\) window\.__viewer\.frameHash = \(size, options\) => hashFrame\(created\.renderer as unknown as FrameHashRenderer, scene, fly\.camera, size, options\);/);
    expect(main.match(/frameHash/g)?.length).toBe(2);        // the import and that one line
  });
  it('the hook declares it optional (absent in a release and without ?devmode)', () => {
    expect(src('hook.ts')).toMatch(/\n {2}frameHash\?\(size\?: FrameHashSize, options\?: FrameHashOptions\): Promise<FrameHash>;/);
  });
  it('the spec is guarded off the gate\'s --e2e (S2U_FRAME_IDENTITY)', () => {
    const spec = readFileSync(resolve(here, '../e2e/zz-frame-identity.spec.ts'), 'utf-8');
    expect(spec).toMatch(/test\.skip\(!process\.en[v]\['S2U_FRAME_IDENTITY'\], /);   // en[v]: the leak check reads a dot and "env" as a dotenv name
  });
});

/** A `w` x `h` RGBA frame of one colour, then `set` pixels painted. */
function frameOf(w: number, h: number, fill: [number, number, number, number], set: [number, number, [number, number, number, number]][] = []): Uint8Array {
  const b = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) b.set(fill, i * 4);
  for (const [x, y, c] of set) b.set(c, (y * w + x) * 4);
  return b;
}

describe('cps-frame-hash-2: diffFrames, a determinism mismatch located (count, box, first pixels)', () => {
  const W = 16, H = 8, grey: [number, number, number, number] = [10, 20, 30, 255];
  it('two equal frames: no bytes, no pixels, no box', () => {
    const d = diffFrames(frameOf(W, H, grey), frameOf(W, H, grey), W, H);
    expect([d.bytes, d.pixels, d.bbox, d.first]).toEqual([0, 0, null, []]);
  });
  it('known pixels changed: the differing bytes, the pixels, the box (inclusive, in pixels) and the first in row order with both colours', () => {
    const a = frameOf(W, H, grey);
    const b = frameOf(W, H, grey, [[5, 2, [10, 21, 30, 255]], [3, 6, [0, 0, 0, 0]], [12, 4, [11, 20, 31, 255]]]);
    const d = diffFrames(a, b, W, H);
    expect(d.bytes).toBe(1 + 4 + 2);            // one channel, all four, two
    expect(d.pixels).toBe(3);
    expect(d.bbox).toEqual({ x0: 3, y0: 2, x1: 12, y1: 6, w: 10, h: 5 });
    expect(d.first).toEqual([
      { x: 5, y: 2, a: [10, 20, 30, 255], b: [10, 21, 30, 255] },
      { x: 12, y: 4, a: [10, 20, 30, 255], b: [11, 20, 31, 255] },
      { x: 3, y: 6, a: [10, 20, 30, 255], b: [0, 0, 0, 0] },
    ]);
    expect(d.maxDelta).toBe(255);
  });
  it('the first pixels stop at 8 (or the count asked); the coarse grid counts every differing pixel by cell', () => {
    const many: [number, number, [number, number, number, number]][] = Array.from({ length: 12 }, (_, i) => [i, 7, [0, 0, 0, 255]]);
    const d = diffFrames(frameOf(W, H, grey), frameOf(W, H, grey, many), W, H, { grid: 4 });
    expect(d.first).toHaveLength(8);
    expect(d.first.map((p) => p.x)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(diffFrames(frameOf(W, H, grey), frameOf(W, H, grey, many), W, H, { first: 2 }).first).toHaveLength(2);
    expect(d.grid).toEqual({ cols: 4, rows: 4, cellW: 4, cellH: 2, counts: [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [4, 4, 4, 0]] });
  });
  it('frames of different lengths are refused', () => {
    expect(() => diffFrames(new Uint8Array(8), new Uint8Array(12), 2, 1)).toThrow(/frame diff/);
  });
  it('the message names the count, the box and the first pixels', () => {
    const a = frameOf(W, H, grey), b = frameOf(W, H, grey, [[5, 2, [10, 21, 30, 255]]]);
    const text = describeFrameDiff(diffFrames(a, b, W, H), 'rows top-down');
    expect(text).toContain('1 of 512 bytes differ (1 of 128 pixels)');
    expect(text).toContain('box x 5..5, y 2..2 (1 x 1 px; rows top-down)');
    expect(text).toContain('(5,2) 10,20,30,255 -> 10,21,30,255');
    expect(describeFrameDiff(diffFrames(a, a, W, H), 'rows top-down')).toBe('no bytes differ');
  });
  it('a frame as a binary PPM (P6), top row first, in RGB whatever the read order; the mismatch mask as one', () => {
    const a = frameOf(2, 2, [1, 2, 3, 255], [[1, 0, [7, 8, 9, 255]]]);
    const head = (b: Uint8Array): string => new TextDecoder().decode(b.subarray(0, 11));
    const rgba = framePpm(a, 2, 2, { bgra: false, bottomUp: false });
    expect(head(rgba)).toBe('P6\n2 2\n255\n');
    expect([...rgba.subarray(11)]).toEqual([1, 2, 3, 7, 8, 9, 1, 2, 3, 1, 2, 3]);
    expect([...framePpm(a, 2, 2, { bgra: true, bottomUp: true }).subarray(11)]).toEqual([3, 2, 1, 3, 2, 1, 3, 2, 1, 9, 8, 7]);
    const b = frameOf(2, 2, [1, 2, 3, 255]);
    expect([...frameDiffPpm(a, b, 2, 2, { bottomUp: false }).subarray(11)]).toEqual([0, 0, 0, 255, 0, 255, 0, 0, 0, 0, 0, 0]);
  });
});

const dist = readBuiltDist(VIEWER_DIST);
describe.skipIf(!dist.built)(builtTitle('the built viewer has no frameHash (CPS.R9 e; OT.R29\'s rule for dev tools)', dist), () => {
  it('its hook name is absent from dist/viewer/assets/*.js', () => {
    expect(dist.js).not.toContain('frameHash');
  });
});

/**
 * cps-frame-hash-3 (attempt 3 on the owner's PC, 2026-11-03T09:48Z: ticks 100, 500 and 1000 of a recording hashed to one
 * value): the replay's watcher opens in the free camera (`SPECTATOR_START_READING`) where the page stands it
 * (`SPECTATOR_ENTRY_POSE_PLACEHOLDER`), and nothing the replay moves was in that view. `followSeat` binds the spectator's
 * own follow through its own control (Right released, the cycle in seat order), so the hashed frame -- the page's camera,
 * which the follow stands -- holds a body; `bodiesInView` counts the drawn bodies in that camera's view and layers.
 */
describe('cps-frame-hash-3: the bodies in the hashed frame', () => {
  const body = (id: number, feet: [number, number, number], alive = true, yaw = 30): SpectatorBody => ({ id, feet, yaw, flags: alive ? BodyFlag.Alive : 0 });
  function rig(bodies: SpectatorBody[], role: 'spectator' | 'player' = 'spectator') {
    const poses: (SpectatorPose | null)[] = [];
    const view = new SpectatorView({
      bodies: () => bodies, seat: () => ({ role, self: null, team: null, teams: new Map(), rules: 'classic', ghost: false }),
      spectate: (p) => poses.push(p), leaveSelf: () => {},
    });
    return { view, poses };
  }
  it('followSeat(n) from the free camera follows the n-th living body in seat order, and the frame stands the camera behind it', () => {
    const bodies = [body(7, [70, 0, 0]), body(3, [30, 0, 0]), body(4, [40, 0, 0], false), body(5, [50, 0, 0])];
    const a = rig(bodies);
    expect(a.view.mode).toBe('free');
    expect(followSeat(a.view, 0)).toBe(3);
    expect(a.view.mode).toBe('follow');
    a.view.frame();
    expect(a.poses.at(-1)).toEqual(followPose(bodies[1]!));
    const b = rig(bodies);
    expect(followSeat(b.view, 2)).toBe(7);           // 3, 5, 7: the dead 4 is not a candidate
  });
  it('no living body, or a seat that is not a spectator\'s: null, nothing followed', () => {
    const none = rig([body(1, [0, 0, 0], false)]);
    expect(followSeat(none.view, 0)).toBeNull();
    expect(none.view.mode).toBe('free');
    const player = rig([body(1, [0, 0, 0])], 'player');
    expect(followSeat(player.view, 0)).toBeNull();
  });
  it('bodiesInView counts a visible body on the camera\'s layers in its frustum: behind, hidden or off layer 0 (the zone gate) is not', () => {
    const camera = new PerspectiveCamera(60, 16 / 9, 1, 1000);     // at the origin, looking down -z
    camera.updateMatrixWorld();
    const at = (id: number, z: number): { id: number; group: Group } => {
      const group = new Group();
      group.add(new Mesh(new BoxGeometry(1, 2, 1)));
      group.position.set(0, 0, z);
      group.updateMatrixWorld(true);
      return { id, group };
    };
    const ahead = at(1, -10), behind = at(2, 10), hidden = at(3, -10), gated = at(4, -20), far = at(5, -5000);
    hidden.group.visible = false;
    gated.group.traverse((o) => o.layers.disable(0));                // `RemotePlayers.applyZoneGate`'s off verdict
    expect(bodiesInView(camera, [ahead, behind, hidden, gated, far])).toEqual({ count: 1, ids: [1], drawn: 5 });
    expect(bodiesInView(camera, [])).toEqual({ count: 0, ids: [], drawn: 0 });
  });
  it('main.ts hashes with the camera the frame draws with (fly.camera, which the spectator\'s follow stands), and hangs both under the dev gate', () => {
    const main = src('main.ts');
    expect(main).toMatch(/remote\.applyZoneGate\([^\n]*\n[^\n]*\n {6}render\(scene, fly\.camera\);/);   // the frame's world render
    expect(main).toMatch(/hashFrame\(created\.renderer as unknown as FrameHashRenderer, scene, fly\.camera, size, options\)/);
    expect(src('matchNet.ts')).toMatch(/spectate: \(pose\) => \{ resetFollow\(\); if \(pose\) p\.fly\.setPose\(pose\); \},/);
    expect(main).toMatch(/\n {2}if \(import\.meta\.en[v]\.DEV && devToolsEnabled\(SEARCH\)\) window\.__viewer\.followSeat = \(n\) => \(net \? followSeat\(net\.spectator, n\) : null\);/);
    expect(main).toMatch(/\n {2}if \(import\.meta\.en[v]\.DEV && devToolsEnabled\(SEARCH\)\) window\.__viewer\.bodiesInView = \(\) => bodiesInView\(fly\.camera, remote\.seenForDev\(\)\.bodies\);/);
    expect(main.indexOf('window.__viewer.followSeat')).toBeGreaterThan(main.indexOf('window.__viewer.holdFrame'));
    const hook = src('hook.ts');
    expect(hook).toMatch(/\n {2}followSeat\?\(n: number\): number \| null;/);
    expect(hook).toMatch(/\n {2}bodiesInView\?\(\): BodiesInView;/);
  });
  it('the spec follows a seat before it hashes, requires a body in view, and requires the ticks\' hashes to differ', () => {
    const spec = readFileSync(resolve(here, '../e2e/zz-frame-identity.spec.ts'), 'utf-8');
    expect(spec).toMatch(/window\.__viewer\.followSeat!\(/);
    expect(spec).toMatch(/window\.__viewer\.bodiesInView!\(\)/);
    expect(spec).toMatch(/the ticks' frames differ/);
  });
});

describe.skipIf(!dist.built)(builtTitle('the built viewer has no followSeat or bodiesInView (cps-frame-hash-3)', dist), () => {
  it('their hook names are absent from dist/viewer/assets/*.js', () => {
    expect(dist.js).not.toContain('followSeat');
    expect(dist.js).not.toContain('bodiesInView');
  });
});
