import { RenderTarget, type ColorSpace, type PixelFormatGPU } from 'three';

/**
 * The flashbang glow's world target in the native picture (`./renderer`, `./flash`; PF-07b and its review's findings 1
 * and 2). While a glow runs the world is drawn here rather than onto the canvas, so the glow's passes can read it.
 *
 * - **The main pass's twin.** three's WebGPU backend keys a render pipeline on the target's colour format, sample count,
 *   depth-stencil format and colour space (`WebGPUBackend.needsRenderUpdate`); a target that differs from the canvas in
 *   any of them links a new pipeline for every object the first flash draws. So the target takes the renderer's
 *   `samples`, its `stencil` (the depth texture's format follows: `DepthFormat`/`UnsignedIntType` as the canvas's depth
 *   buffer, or the stencil pair), its `outputColorSpace`, and under WebGPU the canvas's own format as the colour
 *   texture's `internalFormat` (three's `WebGPUTextureUtils.createTexture` takes it before its own mapping). WebGL2
 *   links programs by their code, not by the target, so no format is forced there.
 * - **One size a flash.** It is allocated at a flash's first glowing frame at the drawing buffer's size (half of it each
 *   way on a weak GPU: GLOW-STEPDOWN, `./glowScale`, a browser adaptation), kept at that
 *   size to the flash's end (a pixel-ratio step mid-flash finishes at the old size, drawn stretched), and disposed when
 *   the glow ends: no memory held between flashes, no reallocation inside one.
 */

/** What the canvas's own pass is drawn with: the renderer's samples, stencil, output colour space, its canvas format. */
export interface MainPass {
  samples: number;
  stencil: boolean;
  outputColorSpace: string;
  /** The WebGPU canvas's format (`getPreferredCanvasFormat`), null under WebGL2. */
  canvasFormat: string | null;
}

/** The shape of three's renderer this reads. */
export interface RendererLike {
  samples: number;
  stencil: boolean;
  outputColorSpace: string;
  backend: { isWebGPUBackend?: boolean; isWebGLBackend?: boolean; utils?: { getPreferredCanvasFormat?: () => string } };
}

export function mainPassOf(r: RendererLike): MainPass {
  const format = r.backend.isWebGPUBackend === true ? r.backend.utils?.getPreferredCanvasFormat?.() ?? null : null;
  return { samples: r.samples, stencil: r.stencil, outputColorSpace: r.outputColorSpace, canvasFormat: format };
}

/** The target's options: the main pass's samples, depth with its stencil, colour space and (WebGPU) colour format. */
export function glowTargetOptions(main: MainPass): {
  samples: number; depthBuffer: true; stencilBuffer: boolean; colorSpace: string; internalFormat: string | null;
} {
  return { samples: main.samples, depthBuffer: true, stencilBuffer: main.stencil, colorSpace: main.outputColorSpace, internalFormat: main.canvasFormat };
}

/** A 1 x 1 target made with `glowTargetOptions`: the glow target, and its warm-up twin, are both made here. */
function glowTargetOf(main: MainPass): RenderTarget {
  const o = glowTargetOptions(main);
  const t = new RenderTarget(1, 1, { samples: o.samples, depthBuffer: o.depthBuffer, stencilBuffer: o.stencilBuffer, colorSpace: o.colorSpace as ColorSpace });
  t.texture.colorSpace = o.colorSpace as ColorSpace;
  if (o.internalFormat) t.texture.internalFormat = o.internalFormat as PixelFormatGPU;
  return t;
}

/**
 * The target's life: `acquire` at a glowing frame, `release` when the glow ends. One `RenderTarget` object throughout (so
 * the passes' texture nodes keep their binding); `release` disposes its GPU textures, which three makes again at the
 * next `acquire`'s first draw.
 */
export class GlowFrame {
  private target: RenderTarget | null = null;
  private active = false;

  constructor(private readonly main: MainPass) {}

  /** The one target object (unallocated on the GPU until a flash draws into it). */
  get object(): RenderTarget {
    if (!this.target) this.target = glowTargetOf(this.main);
    return this.target;
  }

  /**
   * L3lsGcIs fix 1 (product track, a renderer warm-up): a new 1 x 1 target with the glow target's attachments, for the
   * map's warm to compile the world under the glow's render context (three r186 keys the context on the attachments,
   * not the size: `RenderContexts.get`). The caller disposes it when its compiles settle.
   */
  twin(): RenderTarget { return glowTargetOf(this.main); }

  /**
   * The target for this glowing frame: sized `width` x `height` times `scale` at a flash's first, kept at that size to
   * its end. `scale` is GLOW-STEPDOWN's (`./glowScale`, a browser adaptation: 0.5 on a weak GPU, else 1).
   */
  acquire(width: number, height: number, scale = 1): RenderTarget {
    const t = this.object;
    if (!this.active) {
      t.setSize(Math.max(1, Math.floor(width * scale)), Math.max(1, Math.floor(height * scale)));
      this.active = true;
    }
    return t;
  }

  /** The target while a flash holds it, else null. */
  held(): RenderTarget | null { return this.active ? this.target : null; }

  /** The glow is over: the target's GPU textures disposed (freed) until the next flash. */
  release(): void {
    if (!this.active) return;
    this.active = false;
    this.target?.dispose();
  }
}
