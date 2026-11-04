/**
 * The movie layer: the draw side of a dialog's movie background (web research 112 §5; the sprint 9 plan's "two movie
 * interfaces"). The background tick uploads the picture straight into the frame being drawn, before the menu's
 * planes draw over it (research 121 R121.10: `FUN_0030b740`, D:L208733-208746), so the layer is the bottom of the
 * draw list. The player (PLAT-21) is its only writer: it presents each picture its source (PLAT-19b's decoder) gives
 * for the time; the compositor only reads. Until a picture comes the layer draws black.
 */

/** A decoded picture: its size in frame pixels and whatever the viewer draws it from (a canvas, a bitmap, an RGBA buffer). */
export interface MoviePicture {
  width: number;
  height: number;
  /** Opaque to this package: the viewer that presents it knows its type. */
  image: unknown;
}

/** What the movie player writes the layer through (PLAT-21's side). */
export interface MovieLayerSink {
  /** The picture to show from now on. */
  present(picture: MoviePicture): void;
  /** Back to black: the movie stopped, or the dialog that owned it unloaded. */
  clear(): void;
}

/**
 * MOVIE_HOLD_READING (research 121): a frame with no new picture shows the last one presented, black before any --
 * the player never clears the buffer and the menu's own clear was not read.
 */
export class MovieLayer implements MovieLayerSink {
  private last: MoviePicture | null = null;
  present(picture: MoviePicture): void { this.last = picture; }
  clear(): void { this.last = null; }
  /** The picture to draw, or null for black. */
  picture(): MoviePicture | null { return this.last; }
}

/**
 * MOVIE_RECT_READING: where the picture lands -- at the frame's origin, its own size (a 640 x 448 picture covers the
 * frame 1:1; the movies research 98 decoded, SONY448 and INTRO_2, are 640 x 448). The upload's rectangle in
 * `FUN_0030b740` was not read.
 * Black, before a picture, covers the whole frame.
 */
export const MOVIE_RECT_READING = 'origin, own size' as const;
