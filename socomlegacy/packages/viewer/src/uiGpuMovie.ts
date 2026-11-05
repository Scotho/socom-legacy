import type { MoviePicture } from '@s2u/ui';
import type { UiPlanMovie } from './uiFramePlan';

/**
 * GM-11a-3 (the GPU menus plan, `docs/plans/2026-11-01-gpu-menus.md`, row GM-11a-3 and "Architecture": "movie RGBA8UI
 * x2"; research 380 P16, P17; u2 §8): the movie picture on the GPU -- its program and the textures that hold the
 * pictures.
 *
 * **No rule of the game is here.** What a picture does to the frame is the plan's `movie` step (GM-06b; P17,
 * `MOVIE_RECT_READING`, research 380 §2 and §7): its RGB copied at the origin over the step's rectangle, each pixel
 * the picture's at `p / s` (nearest), the frame's alpha untouched; the no-picture movie (and a picture whose buffer
 * the worker has back: `movieFramePicture`'s null) is the black quad of P16, a quads step, not this module's. The
 * `movie` program is that copy: `texelFetch(u_movie, p / u_scale)` -- integer division of non-negative integers, the
 * software's `Math.floor(x / s)` -- written as `t / 255` under a colour mask of RGB only, blending off, so the
 * picture's bytes reach the RGBA8 frame as they are (the same conversion as the clear's `k / 255`, GM-11a-1; a real
 * GPU's is the box's to show, GM-11b case 8).
 *
 * **The timing is a browser adaptation that changes no pixel** (`UI_GPU_MOVIE_TEXTURES_ADAPTATION`, the row's
 * contract, held by `test/uiGpuMovie.test.ts` on a fake GL):
 * - a picture is uploaded **in the render that first shows it** (the draw of the plan holding it), never when the
 *   player presents it to the layer: a tick that is not drawn uploads nothing;
 * - it is **keyed on the picture object** (`MoviePicture`, the plan's `UiPlanMovie.picture`), not on the `Rgba` view
 *   `movieFramePicture` makes of it afresh each render: the same picture is never re-uploaded while a texture holds it.
 *   A picture's bytes do not change while it is live -- the worker hands each picture its own buffer and takes it back
 *   by a transfer, which detaches it (`frontEndMovies.ts` `movieFramePicture`);
 * - **a released (detached) buffer is never touched**: a plan whose picture's buffer is gone is refused
 *   (`releasedMovie`), and a picture once uploaded is drawn from its texture, never read again;
 * - the player presents one picture a tick (research 110 R110.1), so a render uploads at most one (`movieStats`).
 *
 * Nothing changes for players: this module is reached only through `uiGpuWebgl2.ts`, which nothing constructs outside
 * tests and the harness, behind the switch (`uiGpuSwitch.ts`) that keeps every surface `off`.
 */

/**
 * No original; bounds the browser's GPU memory for the movie. The movie's textures: two `RGBA8UI` textures, the picture on show and the one before it, so a new picture is written
 * into the texture the last frame did not draw from (no wait on a draw in flight) and a picture shown again while its
 * texture holds it is not uploaded again. A browser adaptation (the plan's "movie RGBA8UI x2"): no pixel depends on it.
 */
export const UI_GPU_MOVIE_TEXTURES_ADAPTATION = 2;

/** The texture unit the `movie` program samples (the quads' `tex` unit: the two programs never draw at once). */
export const UI_GPU_MOVIE_UNIT = 0;

/** The `movie` program's vertex shader: the step's integer rectangle as a four-vertex strip, corners on pixel edges. */
export const UI_GPU_MOVIE_VERTEX_SOURCE = `#version 300 es
precision highp float;
precision highp int;
// The copy's integer pixels xs <= x < xe, ys <= y < ye (the plan's movie rectangle, clipped to the frame) and the
// frame's size. Frame row y is GL row y; the corners are pixel edges, so every covered pixel's centre is inside them.
uniform ivec4 u_rect;
uniform vec2 u_size;
void main() {
  // A strip: (xs, ys) (xe, ys) (xs, ye) (xe, ye). No vertex buffer: the corners come from gl_VertexID.
  int v = gl_VertexID;
  float x = float((v & 1) == 0 ? u_rect.x : u_rect.z);
  float y = float(v < 2 ? u_rect.y : u_rect.w);
  gl_Position = vec4(vec2(x, y) / u_size * 2.0 - 1.0, 0.0, 1.0);
}
`;

/** The `movie` program's fragment shader: P17's copy. */
export const UI_GPU_MOVIE_FRAGMENT_SOURCE = `#version 300 es
precision highp float;
precision highp int;
precision highp usampler2D;
uniform int u_scale;
uniform usampler2D u_movie;
out vec4 o_colour;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  // The picture's texel at p / s, nearest s x s, its bytes as they are; the colour mask keeps the frame's alpha -- P17; MOVIE_RECT_READING
  uvec4 t = texelFetch(u_movie, p / u_scale, 0);
  o_colour = vec4(t) / 255.0;
}
`;

/** The movie's upload counts: every upload, the last frame's, the most in one frame, the textures made and live. */
export interface UiGpuMovieStats { uploads: number; uploadsLastFrame: number; maxUploadsInAFrame: number; textures: number }

/** Whether a planned picture's bytes are gone (its buffer handed back to the worker since the plan was made). */
export function releasedMovie(movie: UiPlanMovie): boolean {
  const { width, height, data } = movie.image;
  return data.buffer.byteLength === 0 || data.length !== width * height * 4;
}

interface Slot { picture: MoviePicture | null; texture: WebGLTexture; width: number; height: number; frame: number }

/** What the movie's textures need of the backend: a `texelFetch`-only texture of a format, and the unpack state reset. */
export interface UiGpuMovieHost {
  storage(format: number, width: number, height: number): WebGLTexture;
  unpackState(): void;
}

/** The movie's textures on one context (see `UI_GPU_MOVIE_TEXTURES_ADAPTATION`). */
export class UiGpuMovieTextures {
  private slots: Slot[] = [];
  private frame = 0;
  private stats: UiGpuMovieStats = { uploads: 0, uploadsLastFrame: 0, maxUploadsInAFrame: 0, textures: 0 };

  constructor(private readonly gl: WebGL2RenderingContext, private readonly host: UiGpuMovieHost) {}

  /** A new frame (one render): the per-frame count starts again. */
  beginFrame(): void {
    this.frame++;
    this.stats.uploadsLastFrame = 0;
  }

  get counts(): UiGpuMovieStats { return { ...this.stats, textures: this.slots.length }; }

  /**
   * The texture holding `movie`'s picture for this frame: the one that holds it already, or -- in this render, the
   * first that shows it -- the picture uploaded into the texture shown longest ago (never one this frame draws from).
   */
  texture(movie: UiPlanMovie): WebGLTexture {
    const kept = this.slots.find((s) => s.picture === movie.picture);
    if (kept) { kept.frame = this.frame; return kept.texture; }
    if (releasedMovie(movie)) throw new Error('UiGpuMovieTextures: a released picture (its buffer is back with the worker)');
    const gl = this.gl, { width: w, height: h, data } = movie.image;
    let slot: Slot | undefined;
    if (this.slots.length < UI_GPU_MOVIE_TEXTURES_ADAPTATION) {
      slot = { picture: null, texture: this.host.storage(gl.RGBA8UI, w, h), width: w, height: h, frame: this.frame };
      this.slots.push(slot);
    } else {
      slot = this.slots.filter((s) => s.frame !== this.frame).sort((a, b) => a.frame - b.frame)[0];
      if (!slot) throw new Error(`UiGpuMovieTextures: more pictures in one frame than UI_GPU_MOVIE_TEXTURES_ADAPTATION (${UI_GPU_MOVIE_TEXTURES_ADAPTATION})`);
      if (slot.width !== w || slot.height !== h) {
        gl.deleteTexture(slot.texture);
        slot.texture = this.host.storage(gl.RGBA8UI, w, h);
        slot.width = w; slot.height = h;
      }
    }
    slot.picture = null;
    this.host.unpackState();
    gl.bindTexture(gl.TEXTURE_2D, slot.texture);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, w, h, gl.RGBA_INTEGER, gl.UNSIGNED_BYTE, new Uint8Array(data.buffer, data.byteOffset, data.length));
    slot.picture = movie.picture;
    slot.frame = this.frame;
    this.stats.uploads++;
    this.stats.uploadsLastFrame++;
    this.stats.maxUploadsInAFrame = Math.max(this.stats.maxUploadsInAFrame, this.stats.uploadsLastFrame);
    return slot.texture;
  }

  /** Every texture deleted and every picture let go. */
  dispose(): void {
    for (const s of this.slots) this.gl.deleteTexture(s.texture);
    this.slots = [];
  }

  /** GM-12a: after a context loss, every picture let go and no GL call made (the textures went with the context). */
  abandon(): void {
    this.slots = [];
  }
}
