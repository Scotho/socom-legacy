import { Frustum, Matrix4, RenderTarget, Vector2, type Camera, type ColorSpace, type Mesh, type Object3D, type PixelFormatGPU } from 'three';
import { glowTargetOptions, mainPassOf, type RendererLike } from './glowTarget';
import { fnv1a64 } from './frameDiff';
import type { SpectatorKey, SpectatorMode } from './spectatorView';

/**
 * CPS.R9 (e)'s frame identity gate (product track, a dev instrument; `docs/plans/2026-11-02-client-performance-sprint.md`,
 * "the frame byte-identical where a test can hold it"): `window.__viewer.frameHash()` renders the world scene with the
 * page's camera into a render target, reads the target back and hashes its bytes, so a same-picture performance change
 * (the shadow box, the static freeze, the uniform regroup, body culling) can show the frame did not change. A browser
 * adaptation with no original: it draws one extra frame into its own target, outside the page's frame loop, and changes
 * nothing the game draws or does -- the page's target and `autoClear` are put back, the target is disposed after the
 * read. A development build's only: `main.ts` hangs it under the dev panel's gate (`import.meta.env.DEV &&
 * devToolsEnabled(SEARCH)`, as `renderStats`), which every `vite build` folds away (`test/frameHash.test.ts`).
 *
 * **The target, not the canvas.** The target is the canvas pass's twin as `./glowTarget` makes the flashbang's
 * (`glowTargetOptions(mainPassOf(renderer))`): the renderer's `samples` (4 with `./renderer`'s `antialias: true`, 0 on
 * the Xbox backend's), its `stencil`, depth, its `outputColorSpace` (`LinearSRGBColorSpace`, `./renderer` `createRenderer`:
 * the shader's product goes out unconverted) and, under WebGPU, the canvas's own format as the colour texture's
 * `internalFormat` (`getPreferredCanvasFormat`: `bgra8unorm` on most hosts, so the bytes hashed are B, G, R, A; under
 * WebGL2 three's default RGBA8). Being the twin it links no new pipeline. But a target's framebuffer may still differ from
 * the canvas's -- the MSAA resolve, the format, WebGL2's implicit multisampled canvas -- so the gate compares target with
 * target, before and after a change, on the same backend and host, never a target with the canvas. Nor is it the page's
 * presentation: the world scene alone, drawn straight into the target -- no PS2 640 x 448 frame and its copy, no glow
 * pass, no Experimental post, no HUD or reticle (their own scenes).
 *
 * **The draws** are that render's alone: the change in three's `info.render.drawCalls` across the one `render` (three's
 * common `Info`; its `render.calls` counts `render()` calls, not draws -- `./renderStats`' header), which three resets
 * only in its animation loop, never inside a `render`. The classic renderer's `render.calls` is read when no
 * `drawCalls` is kept.
 *
 * **The hash** is FNV-1a 64 over the read bytes, row by row (`tightRows`: WebGPU's copy pads each row to 256 bytes,
 * WebGL2's `readPixels` does not; the rows are WebGPU's top-down and WebGL2's bottom-up, one more reason a hash is
 * compared only on one backend), as 16 lower-case hex digits; computed in two 32-bit halves (no BigInt in the loop).
 *
 * **What holds the frame still** (the spec, `e2e/zz-frame-identity.spec.ts`): the recording plays from its open
 * (`./replay/replayClient` `clock.play()`) and a `tick=` seek keeps it playing, so the replay mode takes `pause` beside
 * `tick=` (`./replay/mount` `replayPauseAsked`): paused at the open, then sought, the clock stands at exactly that tick,
 * and the bodies' animation runs on the replay's clock (`dtScale` 0 paused). The world's own clocks run on the page's
 * frame `dt`, which the replay does not hold: the scrolling textures (`./world` `frame`, `scrolling`), the map's ambient
 * effects and their particles (`./effects` `setData`'s ambient runs, `./particles` `emit`'s `Math.random` position block)
 * and the autostart scene programs (`./worldState` `autostartRandom`, stepped by `pageWorld.step(dt)`). The dev panel's
 * Pause (`./devClock`, `./devPanel` `scaleFrame`: the page's `dt` 0 while the panel is open) holds all three; the spec
 * presses it before the map is built and seeds the page's `Math.random`. The page's frame clock is held as well
 * (`window.__viewer.holdFrame(true)`, `./frameTime` `FrameTime.hold`; cps-frame-hash-2): the clamped `dt` and the frame's
 * real seconds, which the spectator's look, the throws' timed rules and the body's lowering read and the panel does not
 * scale, are 0 while the gate hashes.
 */

/** The size drawn and read: the canvas's drawing buffer by default. */
export interface FrameHashSize { width: number; height: number }

/**
 * cps-frame-hash-2: `keep` returns the read bytes (tight, the read's row order and channel order) beside the hash, so a
 * determinism mismatch can be located (`./frameDiff`).
 */
export interface FrameHashOptions { keep?: boolean }

/** One frame's hash: `w` x `h` RGBA (WebGPU: the canvas format's order) bytes, that render's draws, the target's samples and format. */
export interface FrameHash {
  hash: string;
  w: number;
  h: number;
  draws: number;
  samples: number;
  /** The WebGPU canvas format the target took, null under WebGL2 (three's RGBA8). */
  format: string | null;
  /** The bytes hashed, with `{ keep: true }` only. */
  bytes?: Uint8Array;
}

/** The shape of three's renderer `hashFrame` uses (the page's `WebGPURenderer`; a fake in the tests). */
export interface FrameHashRenderer extends RendererLike {
  readonly info: { readonly render: { readonly drawCalls?: number; readonly calls?: number } };
  autoClear: boolean;
  getRenderTarget(): RenderTarget | null;
  setRenderTarget(target: RenderTarget | null): void;
  render(scene: Object3D, camera: Camera): void;
  readRenderTargetPixelsAsync(target: RenderTarget, x: number, y: number, width: number, height: number): Promise<ArrayBufferView>;
  getDrawingBufferSize(target: Vector2): Vector2;
}

/** FNV-1a 64 (`./frameDiff`, which imports nothing, so the spec hashes the majority with the same function under Node). */
export { fnv1a64 } from './frameDiff';

/**
 * The read `w` x `h` texels without the readback's row padding: as given when tight (WebGL2), else each row cut from a
 * stride padded to 256 bytes (WebGPU's `copyTextureToBuffer`, three's `WebGPUTextureUtils`). Anything shorter is refused.
 */
export function tightRows(data: ArrayBufferView, w: number, h: number, bytesPerTexel = 4): Uint8Array {
  const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  const row = w * bytesPerTexel;
  if (bytes.length === row * h) return bytes;
  const stride = Math.ceil(row / 256) * 256;
  if (h < 1 || bytes.length < (h - 1) * stride + row) {
    throw new Error(`frame readback: ${bytes.length} bytes for ${w} x ${h} (neither ${row * h} tight nor rows of ${stride})`);
  }
  const out = new Uint8Array(row * h);
  for (let y = 0; y < h; y++) out.set(bytes.subarray(y * stride, y * stride + row), y * row);
  return out;
}

/**
 * Renders `scene` with `camera` into a fresh target of `size` (the drawing buffer's by default; whole pixels, at least
 * 1), cleared first (`autoClear` on for the call), back to the page's own target, then reads the target back, hashes it
 * and disposes it. The page's target and `autoClear` are put back even when the render throws. With `{ keep: true }` the
 * bytes hashed come back too (a copy of the tight rows).
 */
export async function hashFrame(renderer: FrameHashRenderer, scene: Object3D, camera: Camera, size?: FrameHashSize, options: FrameHashOptions = {}): Promise<FrameHash> {
  const at = size ?? (() => { const v = renderer.getDrawingBufferSize(new Vector2()); return { width: v.x, height: v.y }; })();
  const w = Math.max(1, Math.floor(at.width)), h = Math.max(1, Math.floor(at.height));
  const main = mainPassOf(renderer);
  const o = glowTargetOptions(main);
  const target = new RenderTarget(w, h, { samples: o.samples, depthBuffer: o.depthBuffer, stencilBuffer: o.stencilBuffer, colorSpace: o.colorSpace as ColorSpace });
  target.texture.colorSpace = o.colorSpace as ColorSpace;
  if (o.internalFormat) target.texture.internalFormat = o.internalFormat as PixelFormatGPU;
  const previous = renderer.getRenderTarget();
  const autoClear = renderer.autoClear;
  const drawn = (): number => renderer.info.render.drawCalls ?? renderer.info.render.calls ?? 0;
  try {
    let draws: number;
    try {
      renderer.setRenderTarget(target);
      renderer.autoClear = true;
      const before = drawn();
      renderer.render(scene, camera);
      draws = drawn() - before;
    } finally {
      renderer.autoClear = autoClear;
      renderer.setRenderTarget(previous);
    }
    const pixels = await renderer.readRenderTargetPixelsAsync(target, 0, 0, w, h);
    const tight = tightRows(pixels, w, h);
    const hashed: FrameHash = { hash: fnv1a64(tight), w, h, draws, samples: target.samples, format: main.canvasFormat };
    if (options.keep) hashed.bytes = tight.slice();
    return hashed;
  } finally {
    target.dispose();
  }
}

/**
 * cps-frame-hash-3 (product track, a test-only instrument): attempt 3 on the owner's PC (2026-11-03T09:48Z) hashed ticks
 * 100, 500 and 1000 of a recording to one value -- the replay's watcher is a spectator that opens in the free camera
 * (`./spectatorView` `SPECTATOR_START_READING`), stood where the page has it (`SPECTATOR_ENTRY_POSE_PLACEHOLDER`), and no
 * body the replay moves was in that view. The gate follows a seat first, so the frame it hashes holds bodies.
 */

/** The part of `./spectatorView` `SpectatorView` `followSeat` drives and reads. */
export interface FollowableSpectator {
  key(e: SpectatorKey, blocked?: boolean): boolean;
  readonly mode: SpectatorMode;
  readonly target: number | null;
}

/**
 * Follows the `n`-th living body (0 the first) in the spectator cycle's order (seat ids ascending, `./net/rules`
 * `nextFollow`) by the spectator's own control -- Right released `n + 1` times from the free camera the replay opens in
 * (`SpectatorView.key`, the page's keyup path; it wraps past the last) -- so the follow camera (`SpectatorView.frame` ->
 * `NetPageDeps.spectate` -> `FlyCamera.setPose`) stands the page's camera, the one the frame and `hashFrame` draw with,
 * behind that body. Returns the followed id, or null when nothing was followed (no living body, or not a spectator's
 * seat). Called once, at the replay's open: from follow the cycle would walk on from the body followed.
 */
export function followSeat(spectator: FollowableSpectator, n: number): number | null {
  const release: SpectatorKey = { type: 'keyup', code: 'ArrowRight', repeat: false, preventDefault: () => {} };
  for (let i = 0; i <= Math.max(0, Math.floor(n)); i++) {
    if (!spectator.key(release)) return null;
  }
  return spectator.mode === 'follow' ? spectator.target : null;
}

/** `bodiesInView`'s count: the drawn bodies in the camera's view (`ids`, their room ids), of `drawn` drawn bodies. */
export interface BodiesInView { count: number; ids: number[]; drawn: number }

const viewFrustum = new Frustum();
const viewMatrix = new Matrix4();

/**
 * The drawn bodies (`./remotePlayers` `RemotePlayers.seenForDev().bodies`) whose draw the camera would make: a body counts
 * when one of its meshes is visible (itself and every ancestor), on a layer the camera renders (`Layers.test`: the zone
 * gate takes a body off layer 0, `RemotePlayers.applyZoneGate`), and in the camera's frustum by three's own test
 * (`Mesh.intersectsFrustum`, the renderer's own call: a body's skinned sub-mesh makes its pose's bound there,
 * `./bodyCullBound`; a mesh with `frustumCulled` off counts). Reads the matrices as the last
 * frame left them, after bringing the camera's and the meshes' world matrices up to date (what a render does).
 */
export function bodiesInView(camera: Camera, bodies: readonly { readonly id: number; readonly group: Object3D }[]): BodiesInView {
  camera.updateMatrixWorld();
  viewFrustum.setFromProjectionMatrix(viewMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
  const ids: number[] = [];
  for (const b of bodies) {
    let seen = false;
    b.group.traverseVisible((o) => {
      if (seen || !(o as Mesh).isMesh || !camera.layers.test(o.layers)) return;
      if (!visibleUp(o)) return;
      o.updateWorldMatrix(true, false);
      if (!o.frustumCulled || (o as Mesh).intersectsFrustum(viewFrustum)) seen = true;   // the renderer's own call (CPS H9 body cull)
    });
    if (seen) ids.push(b.id);
  }
  return { count: ids.length, ids, drawn: bodies.length };
}

/** Visible itself and through every ancestor (`traverseVisible` starts at the body's group, whose parents it does not read). */
function visibleUp(o: Object3D): boolean {
  for (let p: Object3D | null = o; p; p = p.parent) if (!p.visible) return false;
  return true;
}
