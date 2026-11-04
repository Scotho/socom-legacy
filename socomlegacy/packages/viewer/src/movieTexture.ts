import { DataTexture, RGBAFormat, SRGBColorSpace, UnsignedByteType } from 'three';
import { MovieClient, ipuBlackRgba, type MovieEndMessage, type MovieFrame } from '@s2u/fmv';
import type { SourceRequest } from './worker';

/**
 * The movie's picture as a three.js texture (PLAT-19b; research 120 §7). The decoder runs in `movieWorker.ts`; its
 * pictures arrive as RGBA buffers moved across (`@s2u/fmv`'s `MovieClient`), and `present` makes each one the texture's
 * data without a copy, handing the buffer it replaces back to the worker. The compositor's movie layer (PLAT-14's, not
 * merged) draws `texture`; PLAT-21's player decides when a picture is presented and fires the script's events.
 * `onPicture` is the "new picture" callback for both. Nothing here touches the page's scene or `main.ts`.
 *
 * Rows are top first in the buffer, as the IPU writes them, so `flipY` puts row 0 at the top of the quad. The samples
 * are display values (the IPU's RGB goes to the frame buffer as it is), so the texture is tagged sRGB: three decodes
 * them on sampling and the renderer's sRGB output encodes them back unchanged. The filters are three's defaults for a
 * data texture (nearest, no mipmaps); how the layer scales the 640x448 picture is PLAT-14's.
 */

/** The disc's movies are 640x448 (research 98 §7.3's stream lines; PC research 16 §0). A picture of another size replaces the texture. */
export const MOVIE_WIDTH = 640;
export const MOVIE_HEIGHT = 448;

/** What `tick` needs of a movie: `MovieStream`'s per-tick hand-off and its buffer return. */
export interface MovieTickSource {
  tick(): MovieFrame | MovieEndMessage | null;
  release(buffer: ArrayBuffer): void;
}

export class MovieTexture {
  texture: DataTexture;
  /** The index of the picture shown, -1 before the first. */
  shown = -1;
  private fromWorker = false;
  private readonly pictureListeners = new Set<(frame: MovieFrame) => void>();
  private readonly textureListeners = new Set<(texture: DataTexture) => void>();

  constructor() {
    // Black until the first picture: research 121 §14's reading of what the layer holds, "black before any".
    this.texture = this.make(ipuBlackRgba(MOVIE_WIDTH, MOVIE_HEIGHT), MOVIE_WIDTH, MOVIE_HEIGHT);
  }

  /** The "new picture" callback: called after each picture becomes the texture's. Returns its removal. */
  onPicture(listener: (frame: MovieFrame) => void): () => void {
    this.pictureListeners.add(listener);
    return () => this.pictureListeners.delete(listener);
  }

  /** Called when a picture of another size replaced `texture` with a new one. Returns its removal. */
  onTexture(listener: (texture: DataTexture) => void): () => void {
    this.textureListeners.add(listener);
    return () => this.textureListeners.delete(listener);
  }

  /**
   * Make `frame` the texture's picture. Returns the worker's buffer it replaced (to `release` back), or null when the
   * one replaced was the texture's own. The buffer is not copied: three uploads it on the next render.
   */
  present(frame: MovieFrame): ArrayBuffer | null {
    const data = new Uint8Array(frame.rgba);
    const image = this.texture.image as { data: Uint8Array; width: number; height: number };
    const old = this.fromWorker ? image.data.buffer as ArrayBuffer : null;
    if (image.width !== frame.width || image.height !== frame.height) {
      this.texture.dispose();
      this.texture = this.make(data, frame.width, frame.height);
      for (const f of this.textureListeners) f(this.texture);
    } else {
      image.data = data;
      this.texture.needsUpdate = true;
    }
    this.fromWorker = true;
    this.shown = frame.index;
    for (const f of this.pictureListeners) f(frame);
    return old;
  }

  /**
   * One tick of the caller's clock (W9.R10): the picture that has arrived is presented ('picture'); none yet, the last
   * stays ('late'); or the movie is over ('end'). Never waits.
   */
  tick(source: MovieTickSource): 'picture' | 'late' | 'end' {
    const r = source.tick();
    if (r === null) return 'late';
    if (r.kind === 'end') return 'end';
    const old = this.present(r);
    if (old) source.release(old);
    return 'picture';
  }

  dispose(): void {
    this.texture.dispose();
  }

  private make(data: Uint8Array, width: number, height: number): DataTexture {
    const t = new DataTexture(data, width, height, RGBAFormat, UnsignedByteType);
    t.flipY = true;
    t.colorSpace = SRGBColorSpace;
    t.needsUpdate = true;
    return t;
  }
}

/**
 * Start the movie worker and its client. The decoder is `<base>fmv/libmpeg2.wasm` (the build ships it there with its
 * licence, `tools/fmvShip.ts`; the dev server serves it from `packages/fmv/wasm/out/`). A movie is opened with the
 * page's disc source: `client.open('RUN/MOVIES/COMMON/MENULOOP.PSS', source, wasm)`.
 */
export function startMovieWorker(): { worker: Worker; client: MovieClient<SourceRequest>; wasm: string } {
  const worker = new Worker(new URL('./movieWorker.ts', import.meta.url), { type: 'module' });
  return { worker, client: new MovieClient<SourceRequest>(worker), wasm: `${import.meta.env.BASE_URL}fmv/libmpeg2.wasm` };
}
