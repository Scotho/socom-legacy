import type { Camera, Material, Object3D } from 'three';
import {
  AddEquation, BufferGeometry, Color, CustomBlending, Float32BufferAttribute, Group, InstancedMesh, LinearFilter, LinearSRGBColorSpace, LineSegments, Mesh,
  NearestFilter, OneFactor, OrthographicCamera, RenderTarget, Scene, SkinnedMesh, Vector2, type Texture,
} from 'three';
import { MeshBasicNodeMaterial, WebGPURenderer } from 'three/webgpu';
import { experimentalPass } from './experimentalPass';
import {experimentalFxaa} from './experimentalFxaa';
import {setWorldSamplingMaximum} from './experimentalWorldSampling';
import type {ResolveFilter} from './experimentalResolve';
import { experimentalPostVariant, POST_COLOUR } from './experimentalColour';
import { updateExperimentalAssets } from './experimentalAssets';
import { experimentalBloom } from './experimentalBloom';
import type { ExperimentalSettings } from './experimentalGraphics';
import { experimentalFrameSize, EXPERIMENTAL_MAX_SCALE } from './experimentalResolution';
import { CompileQueue, firstOfEachKind } from './compileQueue';
import { LinkLog, type PipelineBackend } from './linkLog';
import { positionGeometry, texture as textureNode, uniform, uv, vec2, vec4 } from 'three/tsl';
import { webgpuAnswers, type GpuLike } from './adapterWait';
import { asksForWebGPU, readGraphicsBackend } from './graphicsBackend';
import { watchGraphicsErrors, watchGraphicsLost } from './graphicsLost';
import { glowGain, glowHalfSize } from './flash';
import { GlowFrame, mainPassOf, type RendererLike } from './glowTarget';
import { bindVisualPostSeam, createPostSlot, type VisualPostPass } from './visualPostSeam';
import { trueColourScaleRow } from './trueColourScale';

/**
 * FLASH_CLEAR_FRAME_READING: the clear takes this frame's wash. The original submits its clear packet
 * (`FUN_003b1160(1)`, D:L50822) before this frame's camera colour is written into it (`FUN_00339de0`, D:L50840), so
 * the console's clear likely carries the previous frame's wash -- one frame later at a flash's onset and end; DMA
 * timing not read (research 202 section 9). Owed: a capture of the original's onset frame.
 */
export const FLASH_CLEAR_FRAME_READING = 'current-frame' as const;

/** Which GPU API the pictures actually came out of, for the status line and the screenshot record. */
export type Backend = 'webgpu' | 'webgl2';

/**
 * How the frame is put on the screen. `native` draws at the canvas's own size and pixel ratio. `ps2`
 * draws the frame the console drew -- 640 by 448, the size `zVid_Init` sets and the NTSC field mode
 * displays -- and lets the page stretch it onto a 4:3 box, which is what the television did (the
 * DISPLAY register's 640 visible pixels on a 4:3 set are 0.93 wide each).
 */
export type Presentation = 'native' | 'ps2';
export const PS2_FRAME = { width: 640, height: 448 } as const;

export interface ViewerRenderer {
  renderer: WebGPURenderer;
  backend: Backend;
  render(scene: Scene, camera: Camera): void;
  /**
   * The Forge's split views (`./forge/splitViews`; a browser adaptation with no original): `scene` drawn once a view, each
   * into its own share of the picture (`rect`, fractions of it from its top-left corner), `before(i)` run ahead of view
   * `i`'s draw so its camera-facing work and its marks are its own. The picture is cleared once, then each view drawn over
   * its rectangle only. The flashbang's glow and the experiment's passes are a single picture's and are not drawn under a
   * split; the `visual.post` pass is drawn once over the whole.
   */
  renderViews(scene: Scene, views: readonly SplitViewDraw[], before?: (index: number) => void): void;
  /** The canvas's CSS size; what the backing store becomes depends on the presentation and the pixel ratio. */
  resize(width: number, height: number): void;
  /** The device pixels per CSS pixel the native presentation draws at; clamped to the device's own. */
  setPixelRatio(ratio: number): void;
  pixelRatio(): number;
  setPresentation(mode: Presentation): void;
  presentation(): Presentation;
  /**
   * The background. reCOM clears to the fog colour (`zrndr_pipe.cpp:157`,
   * `zVid_ClearColor(camera->m_fog_color.xyz)`), so the horizon a map fades into is the same colour it
   * fades with; there is no separate sky colour, the sky is a textured dome.
   */
  setClearColor(rgb: [number, number, number]): void;
  /**
   * The flashbang's `BLUR3D` glow (`./flash`, PF-07b): `passes` additive passes at `fix` (0..255) over the world's
   * frame from the next `render` on, until set to 0. The HUD's passes, drawn after, are not glowed.
   */
  setGlow(glow: { passes: number; fix: number }): void;
  /** Local test-room experiment, disabled in every ordinary picture mode. */
  setExperimental(settings: ExperimentalSettings): void;
  /**
   * Compiles every program and uploads every texture and buffer the scene can draw, before it is asked to: each
   * object shown for the call whatever its visibility (a LOD copy out of range, the body in fly mode, a pass
   * switched off) and whatever the camera sees, plus `extras` (a map's fading twins, built only when a copy fades),
   * then everything put back. Without it the first frame that turns toward a new texture or brings a LOD copy or the
   * SEAL into view pays for its compile then: one frame of 250-1,550 ms on Desert Glory, 380 ms on Crossroads.
   */
  warm(scene: Scene, camera: Camera, extras?: readonly Object3D[]): Promise<void>;
  /**
   * Compiles `objects` as `scene` will draw them, off the draw's critical path: three's `compileAsync` links each
   * program with `KHR_parallel_shader_compile` and yields between objects, where the draw that first meets an object
   * links its program synchronously (20 ms a program on ANGLE's D3D11, 181 of them on Guidance: 3.6 s of stalls
   * through the first seconds of play, research 90 item 17). Every draw under `objects` is compiled as `scene` draws
   * it, shown for the call, a few at a time in the order asked (a page-wide queue, so what is asked first links
   * first); an object not yet in the scene is parked in a scratch group until it is added. `screen` compiles for the
   * canvas (the HUD's passes) rather than for the world's picture (the PS2 look's target), `target` for a target of
   * its own (the characters' shadow map) with `override` as the scene's override material; `stale` drops the jobs
   * of a map already replaced.
   */
  prepare(objects: readonly Object3D[], scene: Scene, camera: Camera, options?: PrepareOptions): Promise<void>;
  /** Every program link, and whether a frame waited for it (`./linkLog`: research 90 issues #21 and #23). */
  links: LinkLog;
  // The `visual.post` seam (`./visualPostSeam`, FCW-07b; a browser adaptation) is not a property: it is reached only
  // through `visualPostSeams(renderer)`, handed once to the extension host (FCW-07b-2, B2-4).
}

/** One split view's draw (`ViewerRenderer.renderViews`): its camera, and its rectangle as fractions of the picture. */
export interface SplitViewDraw { camera: Camera; rect: { x: number; y: number; w: number; h: number } }

/**
 * A guess at which draws share a program, for `prepare`'s order only: the object's kind, its material's class, name
 * stem (the viewer names a material by what builds it -- `body x.tif`, `env y.tif`) and cache key, and its geometry's
 * attributes. A wrong guess costs a later link, never a wrong picture.
 */
function kindOf(o: Object3D): string {
  const m = (o as Object3D & { material?: Material | Material[] }).material;
  const material = Array.isArray(m) ? m[0] : m;
  const g = (o as Object3D & { geometry?: { attributes: Record<string, unknown> } }).geometry;
  const stem = (material?.name ?? '').split(' ')[0];
  return [o.type, material?.type, stem, material?.customProgramCacheKey?.(), Object.keys(g?.attributes ?? {}).sort().join(',')].join('|');
}

/** How many of `prepare`'s compiles are in flight at once. */
const PREPARE_LANES = 2;

/** `prepare`'s options: where the draws will go, and when they are no longer wanted. */
export interface PrepareOptions {
  /** How many compiles may be in flight while this call's jobs lead the queue (`PREPARE_LANES` by default). */
  lanes?: number;
  screen?: boolean;
  target?: RenderTarget;
  override?: Material;
  stale?: () => boolean;
}

/** One draw for `prepare`'s queue. */
interface PrepareJob extends PrepareOptions {
  draw: Object3D;
  scene: Scene;
  camera: Camera;
}

/** What three draws: a mesh, a line, points or a sprite. */
const DRAWN = (o: Object3D): boolean => {
  const f = o as Object3D & { isMesh?: boolean; isLine?: boolean; isPoints?: boolean; isSprite?: boolean };
  return f.isMesh === true || f.isLine === true || f.isPoints === true || f.isSprite === true;
};

/** three's own backend flag. The base `Backend` type does not carry it, so it is read through this shape. */
interface BackendFlags { isWebGPUBackend?: boolean }

const BACKGROUND = 0x14161a;

/**
 * three's `WebGPURenderer`, on WebGPU when the choice asks for it (`asksForWebGPU`: WebGPU, or Automatic while
 * `DEFAULT_GRAPHICS_BACKEND_ADAPTATION` is 'webgpu') and the browser offers an adapter within
 * `WEBGPU_ADAPTER_WAIT_MS_ADAPTATION`, and on WebGL2 otherwise (LATER 128: the wait bounded, so a stalled adapter request no longer leaves the page
 * undrawn) -- headless Chromium usually lands on WebGL2 through SwiftShader. The viewer asks for nothing
 * WebGPU-specific, so the two paths draw the same scene; only the reported backend differs.
 */
/**
 * `createRenderer`'s options. `trackTimestamp` (CPS GPU time, product track, a dev-only instrument): three's GPU timer on
 * the passes (`./gpuStats`); only the match asks for it, only on a development build under `?devmode&gputime`. Absent or
 * false, three is constructed as before (its own default).
 */
export interface RendererOptions { trackTimestamp?: boolean }

export async function createRenderer(canvas: HTMLCanvasElement, options: RendererOptions = {}): Promise<ViewerRenderer> {
  // Only a choice that asks for WebGPU requests an adapter; Compatibility, Xbox and (WEBGL2-DEFAULT, LATER 708) Automatic
  // bypass WebGPU entirely (browser adaptation).
  const graphics = readGraphicsBackend();
  const webgpu = asksForWebGPU(graphics) && await webgpuAnswers((globalThis.navigator as Navigator & { gpu?: GpuLike } | undefined)?.gpu);
  // An opaque WebGPU canvas; the WebGL2 fallback ignores it (three's WebGLBackend forces alpha on), so
  // the real fix is that no world draw writes alpha (`blendFactorsFor`, `world.ts`).
  const renderer = new WebGPURenderer({ canvas, antialias: graphics !== 'xbox', forceWebGL: !webgpu, alpha: false, trackTimestamp: options.trackTimestamp === true });
  watchGraphicsLost(renderer);                          // PR #631: a lost context or device names its reason on the page (browser adaptation)
  watchGraphicsErrors(renderer);                        // 2026-11-05: an uncaptured GPU error kept, counted and named on the page (the same adaptation)
  // The GS wrote its 8-bit result straight to the framebuffer, so the shader's product goes out
  // unconverted; the textures are read the same way (`world.ts`, `makeTexture`). Set this before init:
  // three chooses the WebGL context's immutable antialias flag from currentSamples. With its default
  // sRGB output it expects an offscreen conversion target and creates the canvas without MSAA;
  // changing to linear output afterwards bypasses that target and leaves native edges unsmoothed.
  renderer.outputColorSpace = LinearSRGBColorSpace;
  await renderer.init();
  setWorldSamplingMaximum(renderer.getMaxAnisotropy?.() ?? 1);
  const links = new LinkLog();
  links.watch(renderer.backend as unknown as PipelineBackend);
  let ratio = Math.min(globalThis.devicePixelRatio, 2);
  let mode: Presentation = 'native';
  let cssWidth = 1;
  let cssHeight = 1;
  const apply = (): void => {
    if (mode === 'ps2') {
      renderer.setPixelRatio(1);
      renderer.setSize(PS2_FRAME.width, PS2_FRAME.height, false);
    } else {
      renderer.setPixelRatio(ratio);
      renderer.setSize(cssWidth, cssHeight, false);
    }
  };
  renderer.setPixelRatio(ratio);
  const baseClear = new Color(BACKGROUND), washedClear = new Color();
  // The original writes the same washed camera RGB to FOGCOL and the clear sprite
  // (FUN_00339de0 D:L236765-236774; research 202 section 9). Keep the base separate:
  // reapplying a wash to the previous frame's clear would accumulate instead of fading. The frame: FLASH_CLEAR_FRAME_READING.
  const applyClear = (): void => {
    const row = trueColourScaleRow();
    if (row) washedClear.setRGB(baseClear.r * row[0] + row[3] / 255,
      baseClear.g * row[1] + row[3] / 255, baseClear.b * row[2] + row[3] / 255);
    else washedClear.copy(baseClear);
    renderer.setClearColor(washedClear, 1);
  };
  applyClear();
  const backend: Backend = (renderer.backend as BackendFlags).isWebGPUBackend === true ? 'webgpu' : 'webgl2';
  // The PS2 presentation draws the world as the GS did, with no antialiasing (the GS has none; the static
  // packet at 0x3E0880 sets DTHE 0 and nothing else smooths an edge): into a 640x448 target with no samples,
  // copied texel for texel onto the canvas. The canvas keeps its multisampling for the Modern picture -- it
  // is fixed when the context is made under WebGL2 -- and the HUD passes that follow draw onto the copy.
  const frame = new RenderTarget(PS2_FRAME.width, PS2_FRAME.height, { samples: 0, depthBuffer: true });
  frame.texture.minFilter = NearestFilter;
  frame.texture.magFilter = NearestFilter;
  const copy = new MeshBasicNodeMaterial();
  copy.colorNode = vec4(textureNode(frame.texture, uv()).rgb, 1);   // opaque: the page must never show through
  copy.depthTest = false;
  copy.depthWrite = false;
  copy.fog = false;
  copy.vertexNode = vec4(positionGeometry.xy, 0, 1);   // clip space as given: the camera is not asked
  // The copy is an ordinary mesh, not three's `QuadMesh`. A `QuadMesh` is a fullscreen pass, which three's WebGPU
  // backend draws with no multisampling straight into the canvas texture; the reticle and the HUD then draw over it with
  // `autoClear` off in a multisampled pass that loads the canvas's multisample buffer -- which never held the copy --
  // and resolves over it, so the world went black under the HUD in walk mode (owner, 2026-09-29; WebGL2's implicit
  // multisampled framebuffer hid it). As a mesh the copy goes through the same multisampled pass as the overlays. The
  // triangle and its coordinates are `QuadMesh`'s own (one triangle over the frame, the target's rows top-down), and a
  // quad's only edges are the frame's, so the picture is the same texel for texel.
  const copyGeometry = new BufferGeometry();
  copyGeometry.setAttribute('position', new Float32BufferAttribute([-1, 3, 0, -1, -1, 0, 3, -1, 0], 3));
  copyGeometry.setAttribute('uv', new Float32BufferAttribute([0, -1, 0, 1, 2, 1], 2));
  const blitMesh = new Mesh(copyGeometry, copy);
  blitMesh.frustumCulled = false;
  const blitScene = new Scene();
  blitScene.add(blitMesh);
  const blitCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  // The flashbang's glow (`./flash`; `BLUR3D`, `FUN_00264a40` D:L111838-111903, its pass packet `FUN_0033b570` ->
  // `FUN_003b0d70`; research 202 §3.9, V7 §8.2). Each pass: draw 1, the frame into a half-size buffer, bilinear, no
  // blending -- here the four source texels a half-size texel covers, averaged (a bilinear tap at their shared corner,
  // whatever the frame's own filter); draw 2, that buffer back over the whole frame, bilinear, `Cs x FIX / 128 + Cd`
  // (ALPHA 0x68, colour unity), clamped as the 8-bit target clamps. The next pass reads the frame as the last left it.
  // The PS2 picture glows its 640 x 448 frame (a 320 x 224 buffer, the console's); the native one draws its world into
  // `glowFrame` while a glow runs -- the canvas pass's twin in format, samples, depth and colour space, so the world's
  // pipelines are the canvas's own (`./glowTarget`), sized at the flash's start and freed at its end -- and copies it on.
  // [reading, owed: a playtest] The native buffer is half the canvas, so its blur is narrower in screen terms than the
  // console's 320 x 224 at a high resolution (research 85 §10).
  let glowPasses = 0;
  const glowFix = uniform(0);
  const glowTexel = uniform(new Vector2(1, 1));
  const glowFrame = new GlowFrame(mainPassOf(renderer as unknown as RendererLike));
  const glowTarget = glowFrame.object;
  const half = new RenderTarget(1, 1, { samples: 0, depthBuffer: false });
  half.texture.minFilter = LinearFilter;
  half.texture.magFilter = LinearFilter;
  const screenMaterials = new Set<MeshBasicNodeMaterial>();
  let transientHalf = false;
  const screenMesh = (colour: ReturnType<typeof vec4>, additive: boolean): Scene => {
    const m = new MeshBasicNodeMaterial();
    screenMaterials.add(m);
    m.colorNode = colour;
    m.depthTest = false;
    m.depthWrite = false;
    m.fog = false;
    m.vertexNode = vec4(positionGeometry.xy, 0, 1);
    if (additive) {
      m.transparent = true;
      m.blending = CustomBlending;
      m.blendEquation = AddEquation;
      m.blendSrc = OneFactor;
      m.blendDst = OneFactor;
      m.blendEquationAlpha = AddEquation;
      m.blendSrcAlpha = OneFactor;
      m.blendDstAlpha = OneFactor;
    }
    const mesh = new Mesh(copyGeometry, m);
    mesh.frustumCulled = false;
    const sc = new Scene();
    sc.add(mesh);
    return sc;
  };
  const downOf = (source: Texture): Scene => {
    const at = (dx: number, dy: number) => textureNode(source, uv().add(vec2(dx, dy).mul(glowTexel))).rgb;
    return screenMesh(vec4(at(-0.5, -0.5).add(at(0.5, -0.5)).add(at(-0.5, 0.5)).add(at(0.5, 0.5)).mul(0.25), 1), false);
  };
  const downPs2 = downOf(frame.texture);
  const downNative = downOf(glowTarget.texture);
  const up = screenMesh(vec4(textureNode(half.texture, uv()).rgb.mul(glowFix), 1), true);
  const glowBlit = screenMesh(vec4(textureNode(glowTarget.texture, uv()).rgb, 1), false);
  // No experimental targets, materials or graphs on ordinary pages, or for asset-only adjustments.
  const createExperiment = () => {
    const frame = new GlowFrame(mainPassOf(renderer as unknown as RendererLike));
    const bloom = experimentalBloom(frame.object.texture, (colour) => screenMesh(colour, false), blitCamera);
    const createPost = (key: number) => {
      const variant = key % 16;
      const resolve = ([null, 'nearest', 'bilinear', 'bicubic'] as const)[Math.floor(key / 16)] ?? null;
      const pass = experimentalPass(frame.object.texture, undefined, (variant & POST_COLOUR.rollOff) !== 0, variant, resolve);
      const bloomPass = experimentalPass(frame.object.texture, bloom.texture, (variant & POST_COLOUR.rollOff) !== 0, variant, resolve);
      return {pass, bloomPass, blit: screenMesh(pass.colour, false), bloomBlit: screenMesh(bloomPass.colour, false)};
    };
    // The bypass variant keeps the exact prior shader. Switching back reuses its materials.
    const variants = new Map<number, ReturnType<typeof createPost>>();
    const post = (key: number) => {
      let variant = variants.get(key);
      if (!variant) { variant = createPost(key); variants.set(key, variant); }
      return variant;
    };
    return {frame, bloom, post, down: downOf(frame.object.texture)};
  };
  let experimentResources: ReturnType<typeof createExperiment> | null = null;
  let fxaaResources: ReturnType<typeof experimentalFxaa> | null = null;
  let fxaaOn = false;
  let blooming = false, experimenting = false, postVariant = 0, experimentalScale = 1;
  // The underlying renderer is the public lifetime owner; release our targets/materials before its backend.
  const disposeRenderer = renderer.dispose.bind(renderer);
  let disposed = false;
  // three's own dispose already returns Promise<void>; preserve that contract (including backend failures).
  renderer.dispose = async () => {
    if (disposed) return;
    disposed = true;
    experimentResources?.frame.release(); experimentResources?.bloom.release();
    experimentResources = null;
    fxaaResources?.release(); fxaaResources = null;
    glowFrame.release(); half.dispose(); transientHalf = false; frame.dispose();
    for (const material of screenMaterials) material.dispose();
    screenMaterials.clear(); copy.dispose(); copyGeometry.dispose();
    await disposeRenderer();
  };
  const drawingSize = new Vector2();
  /** The glow's passes over `target` (the world's frame, just drawn), then the render target put back. */
  const glowOver = (target: RenderTarget, down: Scene): void => {
    const [hw, hh] = glowHalfSize(target.width, target.height);
    // Keep the ordinary PS2 buffer between flashes, as the base does.
    if (target !== frame) transientHalf = true;
    if (half.width !== hw || half.height !== hh) half.setSize(hw, hh);   // the target's size is fixed through a flash
    glowTexel.value.set(1 / target.width, 1 / target.height);
    const autoClear = renderer.autoClear;
    try {
      for (let i = 0; i < glowPasses; i++) {
        renderer.setRenderTarget(half);
        renderer.autoClear = true;
        renderer.render(down, blitCamera);
        renderer.setRenderTarget(target);
        renderer.autoClear = false;
        renderer.render(up, blitCamera);
      }
    } finally {
      renderer.autoClear = autoClear;
    }
  };
  /**
   * The glow's own draws compiled with the map (PF-07b review finding 1), so the first flash links nothing: the two
   * downsamples into the half-size buffer, the additive pass onto the PS2 frame and onto the canvas -- the native glow
   * target's twin, whose pipelines are therefore the same -- and the copy back. A failure costs only a later link: it
   * never fails the map's warm.
   */
  const warmGlow = (): Promise<unknown>[] => {
    const previous = renderer.getRenderTarget();
    const jobs: Promise<unknown>[] = [];
    const add = (sc: Scene): void => { jobs.push(renderer.compileAsync(sc, blitCamera).catch(() => undefined)); };
    try {
      renderer.setRenderTarget(half);
      add(downPs2);
      add(downNative);
      renderer.setRenderTarget(frame);
      add(up);
      renderer.setRenderTarget(null);
      add(up);
      add(glowBlit);
    } finally {
      renderer.setRenderTarget(previous);
    }
    return jobs;
  };
  // `prepare`'s queue (`./compileQueue`), and where it parks what is not yet in a scene.
  const scratch = new Group();
  const queue = new CompileQueue(PREPARE_LANES);
  const compileOne = (job: PrepareJob): Promise<void> => {
    const { draw, scene, camera, screen, target, override } = job;
    // Shown and unculled for the call, its children hidden (each is a job of its own): compileAsync gathers its list
    // synchronously, before its first await, so the flags are back before any frame can draw a hidden object. The
    // render context is fixed there too: the PS2 picture's target for the world, the canvas for the HUD's passes.
    const visible = draw.visible, culled = draw.frustumCulled;
    const kids = draw.children.filter((c) => c.visible);
    draw.visible = true;
    draw.frustumCulled = false;
    for (const c of kids) c.visible = false;
    const previous = renderer.getRenderTarget();
    const previousOverride = scene.overrideMaterial;
    renderer.setRenderTarget(target ?? (mode === 'ps2' && !screen ? frame : null));
    if (override) scene.overrideMaterial = override;
    try {
      return renderer.compileAsync(draw, camera, scene);
    } finally {
      renderer.setRenderTarget(previous);
      scene.overrideMaterial = previousOverride;
      for (const c of kids) c.visible = true;
      draw.visible = visible;
      draw.frustumCulled = culled;
    }
  };
  // The `visual.post` seam (FCW-07b), claimed here and nowhere else: its pass is drawn after whichever path below drew
  // the frame, on the target that path ended on, before the caller's HUD. `snapshot` is this renderer's draw
  // configuration, so an install and its uninstall can be compared whole.
  const postSlot = createPostSlot(() => ({
    presentation: mode, pixelRatio: ratio, cssWidth, cssHeight, autoClear: renderer.autoClear,
    renderTarget: renderer.getRenderTarget() !== null, glowPasses, glowFix: glowFix.value, transientHalf,
    experimenting, blooming, fxaaOn, postVariant, experimentalScale,
    experimentResources: experimentResources !== null, fxaaResources: fxaaResources !== null,
    screenMaterials: screenMaterials.size, disposed,
  }));
  const drawPost = (pass: VisualPostPass): void => {
    const autoClear = renderer.autoClear;
    renderer.autoClear = false;
    try { renderer.render(pass.scene, blitCamera); } finally { renderer.autoClear = autoClear; }
  };
  const drawFrame = (scene: Scene, camera: Camera): void => {
    const glowing = glowPasses > 0;
    if (mode !== 'ps2' && experimenting) {
      const experiment = experimentResources!;
      const previous = renderer.getRenderTarget();
      renderer.getDrawingBufferSize(drawingSize);
      // Keep the scale uniform and bound this local experiment's target allocation.
      const {width, height} = experimentalFrameSize(drawingSize.x, drawingSize.y, experimentalScale);
      const target = experiment.frame.acquire(width, height);
      if (target.width !== width || target.height !== height) target.setSize(width, height);
      const post = experiment.post(postVariant);
      post.pass.resize(target.width, target.height);
      post.bloomPass.resize(target.width, target.height);
      try {
        renderer.setRenderTarget(target);
        renderer.render(scene, camera);
        if (glowing) glowOver(target, experiment.down);
      } finally { renderer.setRenderTarget(previous); }
      // The gameplay flashbang already blooms; don't amplify it with the optional picture effect.
      const showBloom = blooming && !glowing;
      if (showBloom) experiment.bloom.render(renderer, target.width, target.height);
      const postScene = showBloom ? post.bloomBlit : post.blit;
      if (fxaaOn) {
        const aa = fxaaResources ??= experimentalFxaa(colour => screenMesh(colour, false));
        aa.acquire(drawingSize.x, drawingSize.y);
        try {
          renderer.setRenderTarget(aa.target);
          renderer.render(postScene, blitCamera);
        } finally { renderer.setRenderTarget(previous); }
        renderer.render(aa.scene, blitCamera);
      } else renderer.render(postScene, blitCamera);
      return;
    }
    if (mode !== 'ps2' && !glowing) { renderer.render(scene, camera); return; }
    const previous = renderer.getRenderTarget();
    if (mode === 'ps2') {
      renderer.setRenderTarget(frame);
      renderer.render(scene, camera);
      if (glowing) glowOver(frame, downPs2);
      renderer.setRenderTarget(previous);
      renderer.render(blitScene, blitCamera);
      return;
    }
    renderer.getDrawingBufferSize(drawingSize);
    const target = glowFrame.acquire(drawingSize.x, drawingSize.y);   // the flash's first size, to its end
    renderer.setRenderTarget(target);
    renderer.render(scene, camera);
    glowOver(target, downNative);
    renderer.setRenderTarget(previous);
    renderer.render(glowBlit, blitCamera);
  };
  /**
   * `fn` run with every object of `scene` shown and its frustum test off, the flags put back after: compileAsync gathers
   * its list synchronously, before its first await, so no frame can draw a hidden object.
   */
  const shown = <T>(scene: Scene, fn: () => T): T => {
    const flags: { object: Object3D; visible: boolean; culled: boolean }[] = [];
    scene.traverse((o) => { flags.push({ object: o, visible: o.visible, culled: o.frustumCulled }); o.visible = true; o.frustumCulled = false; });
    try { return fn(); } finally { for (const { object, visible, culled } of flags) { object.visible = visible; object.frustumCulled = culled; } }
  };
  /**
   * L3lsGcIs fix 1 (product track, a renderer warm-up; no game timing touched): the native picture's first glowing frame
   * draws the world into the glow target and the glow's additive pass (`up`) onto it (`drawFrame`, `glowOver`), and
   * three r186 keys a render object on its render context -- the target's attachments, not its size
   * (`RenderContexts.get`) -- so a world warmed only for the canvas built every mesh's render objects and bindings
   * inside that frame (seat 70's finding, the flashbang freeze). Both compiled under a 1 x 1 twin of the glow target,
   * freed once those compiles settle; never the fading twins' stand-ins, which are never drawn there (the review's
   * finding 1). Each compile caught: a failure costs only a later build, never the map's warm.
   */
  const warmGlowWorld = (scene: Scene, camera: Camera): Promise<unknown>[] => {
    const twin = glowFrame.twin();
    const previous = renderer.getRenderTarget();
    let jobs: Promise<unknown>[];
    try {
      renderer.setRenderTarget(twin);
      jobs = [
        shown(scene, () => renderer.compileAsync(scene, camera)).catch(() => undefined),
        renderer.compileAsync(up, blitCamera).catch(() => undefined),
      ];
    } finally {
      renderer.setRenderTarget(previous);
    }
    void Promise.all(jobs).then(() => { twin.dispose(); });   // each caught: settles, the twin freed
    return jobs;
  };
  /**
   * The review's finding 3: the last warm ran in the PS2 picture, so nothing compiled the glow context; the first switch
   * to native compiles it then, once a warm (fire-and-forget, caught: no frame waits on it).
   */
  let glowOwed: { scene: Scene; camera: Camera } | null = null;
  const viewer: ViewerRenderer = {
    renderer,
    backend,
    links,
    render: (scene, camera) => {
      applyClear();
      drawFrame(scene, camera);
      const pass = postSlot.current();
      if (pass) drawPost(pass);
    },
    renderViews: (scene, views, before) => {
      applyClear();
      const target = mode === 'ps2' ? frame : null;          // the PS2 picture's own target, else the canvas
      const previous = renderer.getRenderTarget();
      const autoClear = renderer.autoClear;
      renderer.getSize(drawingSize);
      const width = target ? target.width : drawingSize.x, height = target ? target.height : drawingSize.y;
      const place = (x: number, y: number, w: number, h: number): void => {
        if (target) { target.viewport.set(x, y, w, h); target.scissor.set(x, y, w, h); }
        else { renderer.setViewport(x, y, w, h); renderer.setScissor(x, y, w, h); }
      };
      renderer.setRenderTarget(target);
      try {
        renderer.clear();                                      // once, whole: a view's draw loads what is there
        renderer.autoClear = false;
        renderer.setScissorTest(true);
        views.forEach((v, i) => {
          const x = Math.round(v.rect.x * width), y = Math.round(v.rect.y * height);
          place(x, y, Math.max(1, Math.round((v.rect.x + v.rect.w) * width) - x), Math.max(1, Math.round((v.rect.y + v.rect.h) * height) - y));
          before?.(i);
          renderer.render(scene, v.camera);
        });
      } finally {
        renderer.setScissorTest(false);
        place(0, 0, width, height);
        renderer.autoClear = autoClear;
        renderer.setRenderTarget(previous);
      }
      if (target) renderer.render(blitScene, blitCamera);
      const pass = postSlot.current();
      if (pass) drawPost(pass);
    },
    setExperimental: (settings) => {
      updateExperimentalAssets(settings);
      experimentalScale = Math.max(1, Math.min(EXPERIMENTAL_MAX_SCALE, settings.renderScale));
      blooming = settings.enabled && settings.bloom && settings.bloomStrength > 0;
      postVariant = experimentalPostVariant(settings);
      const resolve = settings.enabled && settings.resolveFiltering && experimentalScale > 1 ? settings.resolveFilter : null;
      const resolveKey = ([null,'nearest','bilinear','bicubic'] as readonly (ResolveFilter | null)[]).indexOf(resolve);
      postVariant += Math.max(0, resolveKey) * 16;
      fxaaOn = !!(settings.enabled && settings.fxaa);
      if (!fxaaOn) fxaaResources?.release();
      experimenting = settings.enabled && (fxaaOn || blooming || postVariant !== 0 || experimentalScale !== 1 || (settings.sharpen && settings.sharpness > 0)
        || (settings.grade && (settings.exposure !== 0 || settings.contrast !== 1 || settings.saturation !== 1)));
      if (experimenting) {
        const experiment = experimentResources ??= createExperiment();
        const post = experiment.post(postVariant);
        post.pass.update(settings); post.bloomPass.update(settings); experiment.bloom.update(settings);
      } else experimentResources?.frame.release();
      if (!blooming) experimentResources?.bloom.release();
    },
    setGlow: ({ passes, fix }) => {
      glowPasses = fix > 0 ? Math.max(0, Math.floor(passes)) : 0;
      glowFix.value = glowGain(fix);
      if (glowPasses === 0) {
        // Native and experimental flash buffers are temporary; PS2 keeps its original small buffer.
        glowFrame.release();
        if (transientHalf) { half.dispose(); transientHalf = false; }
      }
    },
    resize: (width, height) => { cssWidth = width; cssHeight = height; apply(); },
    setPixelRatio: (r) => {
      const next = Math.max(0.25, Math.min(globalThis.devicePixelRatio || 1, r));
      if (next === ratio) return;
      ratio = next;
      apply();
    },
    pixelRatio: () => ratio,
    setPresentation: (m) => {
      if (m === mode) return;
      mode = m;
      apply();
      if (mode !== 'ps2' && glowOwed) { const { scene, camera } = glowOwed; glowOwed = null; void warmGlowWorld(scene, camera); }
    },
    presentation: () => mode,
    warm: async (scene, camera, extras = []) => {
      const previous = renderer.getRenderTarget();
      if (mode === 'ps2') renderer.setRenderTarget(frame);
      // Everything in the scene, the live objects in their own scene -- a program is specific to more than the
      // material and the geometry, and a stand-in in a scene of its own linked a different one (the SEAL's gear, the
      // jungle's trees). Shown for the call and the frustum test off: compileAsync gathers its list synchronously
      // before its first await, so the flags are put back before any frame can draw a hidden object.
      const live = shown(scene, () => renderer.compileAsync(scene, camera));
      // What is not in the scene at all -- the fading twins (`extras`) -- through stand-ins in a scene of their own.
      const proxies = new Scene();
      proxies.fog = scene.fog;
      proxies.fogNode = scene.fogNode;
      const add = (o: Object3D): void => {
        let proxy: Object3D | null = null;
        if (o instanceof SkinnedMesh) {
          const m = new SkinnedMesh(o.geometry, o.material);
          m.bind(o.skeleton, o.bindMatrix);
          proxy = m;
        } else if (o instanceof InstancedMesh) {
          const m = new InstancedMesh(o.geometry, o.material, o.count);
          m.instanceMatrix = o.instanceMatrix;
          proxy = m;
        } else if (o instanceof Mesh) proxy = new Mesh(o.geometry, o.material);
        else if (o instanceof LineSegments) proxy = new LineSegments(o.geometry, o.material);
        if (!proxy) return;
        o.updateWorldMatrix(true, false);
        proxy.matrixAutoUpdate = false;
        proxy.matrix.copy(o.matrixWorld);
        proxy.matrixWorld.copy(o.matrixWorld);
        proxy.frustumCulled = false;
        proxies.add(proxy);
      };
      for (const e of extras) e.traverse(add);
      let stand: Promise<void>;
      try {
        stand = renderer.compileAsync(proxies, camera);
      } finally {
        renderer.setRenderTarget(previous);
      }
      // L3lsGcIs fix 1: the glow context's warm (`warmGlowWorld`), in the native picture; the PS2 picture's world draws
      // into `frame`, its own, and owes it to the first switch to native (the review's finding 3).
      glowOwed = mode === 'ps2' ? { scene, camera } : null;
      const glowJobs = mode === 'ps2' ? [] : warmGlowWorld(scene, camera);
      await Promise.all([live, stand, ...glowJobs, ...warmGlow()]);
    },
    prepare: (objects, scene, camera, options = {}) => {
      const draws: Object3D[] = [];
      const parked: Object3D[] = [];
      for (const o of objects) {
        if (o !== scene && !o.parent) { scratch.add(o); parked.push(o); }   // not yet in a scene: parked for the call
        o.traverse((c) => { if (DRAWN(c)) draws.push(c); });
      }
      // One draw of each kind first: the SEAL's two dozen parts are a handful of programs.
      return queue.add(firstOfEachKind(draws, kindOf).map((draw) => {
        const job: PrepareJob = { ...options, draw, scene, camera };
        return { lanes: options.lanes, stale: options.stale, run: () => compileOne(job) };
      })).then(() => { for (const o of parked) if (o.parent === scratch) scratch.remove(o); });   // as they came
    },
    setClearColor: ([r, g, b]) => {
      // setRGB on the working space, not setHex: FOGCOL is a raw register value and must not be decoded.
      baseClear.setRGB(r / 255, g / 255, b / 255);
      applyClear();
    },
  };
  bindVisualPostSeam(viewer, postSlot);   // the seam's one claim, held by the seam module, not a property (B2-4)
  return viewer;
}
