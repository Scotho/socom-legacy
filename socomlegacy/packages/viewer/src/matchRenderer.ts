import type { Presentation } from './renderer';
import type { ExperimentalSettings } from './experimentalGraphics';
import type { Camera, Material, Object3D, RenderTarget, Scene } from 'three';
import type { ShadowRenderer } from './charShadow';
import type { RatioTarget } from './matchViewport';
import type { HudRenderer } from './reticle';
import type { RendererInfoLike } from './renderStats';

/**
 * PAR-6 (web sprint PARITY-1, ruling PAR.R3; web research 255 s1): the match's renderer contract, out of the HOT
 * `./matchMount` (where it was `export interface MatchRenderer`) into a module of its own that both pages' shared parts
 * may import, and widened by what the shared parts draw through.
 *
 * **What the menu's renderer really provides.** `./renderer`'s `createRenderer` (the front end's match loads it with the
 * match, `./matchMount`) returns a `ViewerRenderer` whose `renderer` is three's `WebGPURenderer` -- WebGPU, else its own
 * WebGL2 backend: it has every render-target call `CharacterShadow.update` makes (`ShadowRenderer`), and the
 * `ViewerRenderer` has `prepare` with a target and an override (the shadow's warm-up) and the pixel ratio
 * (`setPixelRatio`, `pixelRatio`: PAR-12). The typecheck holds it: `test/charShadowMount.test.ts` assigns a
 * `ViewerRenderer` to a `MatchRenderer` and a `WebGPURenderer` to a `ShadowRenderer`. The capabilities stay optional
 * in the contract because the tests' fakes (`test/matchMount.test.ts`'s) have none; a part asks for them at a call
 * (`shadowRendererOf`, `ratioTargetOf`) and does without them.
 */

/** `ViewerRenderer.prepare`'s options a match page passes: when the jobs are stale, and the shadow map's target and override. */
export interface MatchPrepareOptions {
  stale?: () => boolean;
  /** A target of its own (the characters' shadow map, `./charShadow`), compiled for rather than the world's picture. */
  target?: RenderTarget;
  /** The scene's override material for the compile (the shadow's silhouette). */
  override?: Material;
}

/** What the match draws with: `./renderer`'s `ViewerRenderer` (its HUD pass on `renderer`), or the tests' fake. */
export interface MatchRenderer {
  render(scene: Scene, camera: Camera): void;
  resize(width: number, height: number): void;
  setClearColor(rgb: [number, number, number]): void;
  /**
   * three's renderer: the HUD's pass on it (`HudRenderer`), and -- `createRenderer`'s `WebGPURenderer` has them, the
   * tests' fakes need not -- the render targets the characters' shadow draws its map through (`ShadowRenderer`, PAR-6).
   */
  renderer: HudRenderer & Partial<ShadowRenderer> & {
    dispose?(): void;
    /** three's `renderer.info` (`./renderStats`): the match hook's `renderStats` reads it (CPS H9, a dev instrument); the tests' fakes need not have it. */
    readonly info?: RendererInfoLike;
  };
  /** `ViewerRenderer.prepare`: objects compiled ahead of their first draw (research 90); absent, none warmed. */
  prepare?(objects: readonly Object3D[], scene: Scene, camera: Camera, options?: MatchPrepareOptions): Promise<void>;
  /**
   * `ViewerRenderer.warm`: the scene compiled whole, every program and bitmap ahead of its first draw (research 90 items
   * 16 and 19; LATER 253, the map's effects with it, `./matchWarm`); absent, none warmed.
   */
  warm?(scene: Scene, camera: Camera, extras?: readonly Object3D[]): Promise<void>;
  /** `ViewerRenderer.setGlow`: the flashbang's glow over the world's frame (`./flash`, MATCH-THROW); absent, none drawn. */
  setGlow?(glow: { passes: number; fix: number }): void;
  /** `ViewerRenderer.backend`: under WebGL2 the canvas's context is let go at the close (`WEBGL_lose_context`). */
  backend?: 'webgpu' | 'webgl2';
  /** `ViewerRenderer.setPixelRatio` (PAR-12, `./matchViewport`): the native picture's device pixels per CSS pixel. */
  setPixelRatio?(ratio: number): void;
  /** `ViewerRenderer.pixelRatio`: the ratio it draws at now. */
  pixelRatio?(): number;
  /** `ViewerRenderer.setPresentation`: the PS2's 640 x 448 frame or the native one (OT.R79's PS2 picture, `./picture`); absent, native. */
  setPresentation?(mode: Presentation): void;
  /** `ViewerRenderer.setExperimental`: the test room's experimental renderer (OT.R79's EXPERIMENTAL); absent, none. */
  setExperimental?(settings: ExperimentalSettings): void;
}

/** The renderer's render targets for the characters' shadow (`CharacterShadow.update`), or null when it has none. */
export function shadowRendererOf(r: Pick<MatchRenderer, 'renderer'> | null): ShadowRenderer | null {
  const t = r?.renderer;
  if (!t) return null;
  const has = typeof t.getRenderTarget === 'function' && typeof t.setRenderTarget === 'function' && typeof t.getClearColor === 'function'
    && typeof t.getClearAlpha === 'function' && typeof t.setClearColor === 'function' && typeof t.clear === 'function';
  return has ? (t as ShadowRenderer) : null;
}

/** The renderer's pixel ratio for the shared policy (`./matchViewport` `AdaptiveRatio`, PAR-12), or null when it has none. */
export function ratioTargetOf(r: MatchRenderer | null): RatioTarget | null {
  return r && typeof r.setPixelRatio === 'function' && typeof r.pixelRatio === 'function' ? (r as RatioTarget) : null;
}
