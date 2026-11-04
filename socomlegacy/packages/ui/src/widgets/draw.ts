import type { UiClip, UiDrawItem } from '../compositor/drawList';
import { stToImage } from '../compositor/frame';
import type { UiSprite } from '../compositor/scene';
import { layoutText, type TextStyle } from '../text/layout';
import type { TextFace } from '../text/face';

/**
 * The two primitives a widget draws with -- a quad and a text -- as PLAT-14's draw list holds them (`sprite`, `glyphs`):
 * no primitive is added to the list or to its viewer drawer (W9.R6). A widget's quads are its own 2D objects
 * (`FUN_00364c50`), drawn through `FUN_00364950` (D:L261897-261932) at the node's place in the frame.
 */

/** A widget's quad at the node's place (x, y): its rectangle in the node's space, its texture corners, colour and alpha. */
export function spriteAt(node: string, s: UiSprite, x: number, y: number, clip: UiClip | null = null): UiDrawItem | null {
  if (s.textured && s.texture === null) return null;      // FUN_00364950: a textured quad with no texture is not drawn
  const [u0, v0] = stToImage(s.st[0], s.st[1]);
  const [u1, v1] = stToImage(s.st[2], s.st[3]);
  return {
    kind: 'sprite', node, texture: s.textured ? s.texture : null, x0: x + s.x, y0: y + s.y, x1: x + s.x + s.w, y1: y + s.y + s.h,
    u0, v0, u1, v1, rgba: [...s.color, s.alpha], clip,
  };
}

/** A text's glyphs at the pen (x, y), `layoutText`'s (PLAT-13's); none when there is no face or nothing to draw. */
export function glyphsAt(node: string, face: TextFace | null, codes: readonly number[], x: number, y: number, style: TextStyle, clip: UiClip | null = null): UiDrawItem | null {
  if (!face || codes.length === 0) return null;
  const run = layoutText(face, codes, x, y, style);
  return run.quads.length ? { kind: 'glyphs', node, quads: run.quads, clip } : null;
}

export const pushIf = (out: UiDrawItem[], it: UiDrawItem | null): void => { if (it) out.push(it); };
