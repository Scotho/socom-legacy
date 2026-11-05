import type { DialogRecord } from '../dialog';
import { fadd, fmul, toInt } from '../text/f32';
import { layoutText, measureText, type GlyphQuad } from '../text/layout';
import { teletypeDraw } from '../text/teletype';
import { placeWrapped } from '../text/wrapped';
import { OPACITY_STACK_BASE_READING, UI_FRAME, drawnAlpha, packedAlphaByte, pushOpacity, stToImage } from './frame';
import { projectModels, type UiModelTriangle } from './models';
import type { MoviePicture } from './movieLayer';
import type { UiContent, UiNode, UiScreen, UiSprite, UiText } from './scene';

/**
 * The draw list: what the screen draws this frame, in order, in the 640 x 448 frame's pixels (web research 112 §3-§4).
 * The viewer draws it (`packages/viewer/src/uiCompositorView.ts`); nothing here draws.
 *
 * The order is the screen's tick (CMenuState's Tick 0x1f4640, read from the ELF: research 115 §7): the movie picture
 * the background tick uploaded (research 121 R121.10), then the backplane's walk (0x1f4700-0x1f4734:
 * `FUN_00336c10(0x4887c0, G+0xc4)` with the 2D flag +0x711 set), then the 3D pass (the models, when a model is set),
 * then the foreplane's walk (`FUN_00369170` D:L264251-264259). A walk (`FUN_00336a60` D:L235063-235110) visits a
 * visible node, draws its adaptors, then its children in their vector's order, depth first. With +0x711 set every
 * adaptor draws at once (`FUN_003374c0` D:L235373+): nothing is deferred or sorted by depth. So the draw order is the
 * tree's order -- the order the nodes were added -- and not a z field: the only z a plane carries is the foreplane's
 * 65534 (`DAT_004a44e0` - 1, D:L264668, `DAT_004a44e0` = 65535.0 D:L305298), which agrees with drawing it last.
 */

/** A scissor box in frame pixels, both corners inside (the GS's `SCISSOR_1`). */
export interface UiClip { x0: number; y0: number; x1: number; y1: number }

export type UiDrawItem =
  /** FRAME_CLEAR_READING: the frame starts black (what the menu clears to was not read). */
  | { kind: 'clear'; rgb: [number, number, number] }
  /** The movie layer: its picture at (x0, y0)-(x1, y1), or black there when `picture` is null. */
  | { kind: 'movie'; picture: MoviePicture | null; x0: number; y0: number; x1: number; y1: number }
  /**
   * A 2D quad: corners in frame pixels (x1, y1 exclusive), texture corners `u`/`v` on the upright image (0 .. 1, v 0
   * the top), the GS colour (128 = 1.0) and alpha. `texture` null: an untextured quad in its colour.
   */
  | { kind: 'sprite'; node: string; texture: string | null; x0: number; y0: number; x1: number; y1: number; u0: number; v0: number; u1: number; v1: number; rgba: [number, number, number, number]; clip: UiClip | null }
  /** A text's glyph quads (`layoutText`: frame pixels, texels of the upright atlas, the GS colour), in the order drawn. */
  | { kind: 'glyphs'; node: string; quads: GlyphQuad[]; clip: UiClip | null }
  /** A control PLAT-15 draws: where its node stands in the frame and the opacity the walk carries there. */
  | { kind: 'widget'; node: string; record: DialogRecord; x: number; y: number; opacity: number }
  /**
   * The 3D pass between the planes (research 95's `UI_MODEL_DRAW_ORDER_READING`, now read: Tick step 8): the shown
   * models' triangles projected onto the frame (`projectModels`), in the entries' order; without `triangles` the pass
   * was not realised (no model handed in: the marker alone, which the drawer reports undrawn).
   */
  | { kind: 'models'; triangles?: UiModelTriangle[] };

/**
 * FRAME_CLEAR_READING: black under everything. The frame's clear before the backplane was not read; a dialog with an
 * IMAGE background covers it, a movie dialog's layer covers it (black before a picture), so it shows only where a
 * dialog has no background at all.
 */
export const FRAME_CLEAR_READING: readonly [number, number, number] = [0, 0, 0];

/**
 * NODE_MATRIX_READING: a node's matrix is its parent's times its own translation times its own scale, so a child's
 * position is relative to its parent's (research 95 §2.1, proven on the ARMORY) and a scaled node scales its quad from
 * its own origin (research 95 `BAR_SCALE_ORIGIN_READING`) and its children's offsets with it. The walk passes the
 * current matrix to every quad's corners (`FUN_003643b0` D:L261637-261708, `FUN_00308640`); the matrix's own build
 * (`FUN_00307fa0`) was not read, nor any rotation (no dialog command sets one).
 */
export const NODE_MATRIX_READING = 'parent x translate x scale' as const;

/**
 * TEXT_PEN_READING: a text's pen is its node's place in the frame (the matrix's translation) plus the text's own offset;
 * the node's scale does not scale the glyphs (the text's `SCALE` does: research 111 §3). The text draw reads its pen
 * from +0x90 / +0x94 (`FUN_00362900`), whose writer was not traced; the ARMORY's texts stand on their parents' places
 * by this rule against the owner's captures (research 95 §2.7-§2.8).
 */
export const TEXT_PEN_READING = 'node place, unscaled' as const;

/**
 * WRAPPED_LINE_ALPHA_READING: a WRAPPEDTEXT's lines (one text node each, research 111 §5) draw at the object's alpha:
 * the walk writes the object's (vtable +0x34) and the lines are its own nodes, drawn by its draw `FUN_003794b0`; how
 * the write reaches them was not read.
 */
export const WRAPPED_LINE_ALPHA_READING = 'the object\'s' as const;

interface Matrix { a: number; d: number; tx: number; ty: number }
const IDENTITY: Matrix = { a: 1, d: 1, tx: 0, ty: 0 };
const local = (m: Matrix, n: UiNode): Matrix => ({ a: m.a * n.scale[0], d: m.d * n.scale[1], tx: m.tx + m.a * n.x, ty: m.ty + m.d * n.y });
const apply = (m: Matrix, x: number, y: number): [number, number] => [m.tx + m.a * x, m.ty + m.d * y];

function spriteItem(node: string, s: UiSprite, m: Matrix, f: number, clip: UiClip | null): UiDrawItem | null {
  const alpha = drawnAlpha(f, s);
  if (s.textured && s.texture === null) return null;      // FUN_00364950: a textured quad with no texture is not drawn
  const [x0, y0] = apply(m, s.x, s.y);
  const [x1, y1] = apply(m, s.x + s.w, s.y + s.h);
  const [u0, v0] = stToImage(s.st[0], s.st[1]);
  const [u1, v1] = stToImage(s.st[2], s.st[3]);
  return { kind: 'sprite', node, texture: s.textured ? s.texture : null, x0, y0, x1, y1, u0, v0, u1, v1, rgba: [...s.color, packedAlphaByte(alpha)], clip };
}

const styleOf = (t: UiText, alpha: number, extra: { scale?: number; color?: readonly [number, number, number]; bold?: boolean; linePitch?: number } = {}) => ({
  scale: extra.scale ?? t.scale, hcentered: t.hcentered, rightJustified: t.rightJustified,
  color: extra.color ?? t.color, alpha, bold: extra.bold ?? t.bold, linePitch: extra.linePitch,
});

function contentItems(out: UiDrawItem[], node: UiNode, c: UiContent, m: Matrix, f: number): void {
  switch (c.kind) {
    case 'sprite': {
      const it = spriteItem(node.name, c.sprite, m, f, null);
      if (it) out.push(it);
      return;
    }
    case 'text': {
      const alpha = drawnAlpha(f, c.text);
      if (!c.text.face || c.text.codes.length === 0) return;
      const [px, py] = apply(m, 0, 0);
      const run = layoutText(c.text.face, c.text.codes, fadd(px, c.text.x), fadd(py, c.text.y), styleOf(c.text, alpha));
      if (run.quads.length) out.push({ kind: 'glyphs', node: node.name, quads: run.quads, clip: null });
      return;
    }
    case 'wrapped': {
      const alpha = drawnAlpha(f, c.text);     // WRAPPED_LINE_ALPHA_READING
      const face = c.text.face;
      if (!face) return;
      const [px, py] = apply(m, c.text.x, c.text.y);
      const scale = fmul(c.spec.scale, face.scale);   // a line node's scale (research 111 §5, D:L273487-273492)
      const widths = c.lines.map((l) => measureText(face, l.codes, scale).width);
      const place = placeWrapped(c.spec, px, py, widths, c.scroll, c.prevRows);
      c.prevRows = place.rows;
      for (const l of place.lines) {
        if (!l.drawn) continue;
        const line = c.lines[l.index]!;
        const run = layoutText(face, line.codes, l.x, l.y, styleOf(c.text, alpha, { scale, color: line.color, bold: line.bold }));
        if (run.quads.length) out.push({ kind: 'glyphs', node: node.name, quads: run.quads, clip: place.clip });
      }
      return;
    }
    case 'teletype': {
      const alpha = drawnAlpha(f, c.text);
      const face = c.text.face;
      if (!face) return;
      const [px, py] = apply(m, c.text.x, c.text.y);
      const pen = { x: toInt(px), y: toInt(py) };
      const first = teletypeDraw(c.state, face, c.spec, pen);
      const clip = first.clip ? { x0: 0, y0: 0, x1: first.clip.x1, y1: first.clip.y1 } : null;
      const run = layoutText(face, first.codes, pen.x, pen.y, styleOf(c.text, alpha, { linePitch: c.spec.spacing }));
      if (run.quads.length) out.push({ kind: 'glyphs', node: node.name, quads: run.quads, clip });
      const { cursor } = teletypeDraw(c.state, face, c.spec, pen, run.pen.x);
      if (cursor) {
        // TELETYPE_CURSOR_READING (research 95): an untextured box in the text's colour at the cursor's alpha.
        out.push({
          kind: 'sprite', node: node.name, texture: null, x0: cursor.x0, y0: Math.min(cursor.y0, cursor.y1), x1: cursor.x1, y1: Math.max(cursor.y0, cursor.y1),
          u0: 0, v0: 0, u1: 0, v1: 0, rgba: [...c.text.color, cursor.alpha], clip,
        });
      }
      return;
    }
    case 'group':
      for (const p of c.parts) contentItems(out, node, p, m, f);
      return;
    case 'widget': {
      const [x, y] = apply(m, 0, 0);
      out.push({ kind: 'widget', node: node.name, record: c.record, x, y, opacity: f });
      return;
    }
  }
}

/** `FUN_00336a60`: a visible node's content at the stack's top, then its children in order. */
function walk(out: UiDrawItem[], node: UiNode, parent: Matrix, top: number): void {
  if (!node.visible) return;
  const f = pushOpacity(top, node.opacity);
  const m = local(parent, node);
  if (node.content) contentItems(out, node, node.content, m, f);
  for (const child of node.children) walk(out, child, m, f);
}

/**
 * GM-02 (plan 2026-11-01-gpu-menus, "Performance"): a timing probe around `composeScreen` -- an instrument of the
 * browser baseline (`packages/viewer/src/uiGpuPerf.ts`, set only on a development build under `?devmode&uiPerf`), a
 * browser adaptation with no original. It reads its own clock before and after the walk and changes nothing the walk
 * returns; null (the default) times nothing.
 */
export interface ComposeScreenProbe { now(): number; composed(ms: number): void }
let composeProbe: ComposeScreenProbe | null = null;
/** GM-02: sets (or, with null, clears) the probe `composeScreen` reports each call's time to. */
export function setComposeScreenProbe(probe: ComposeScreenProbe | null): void { composeProbe = probe; }

/** The screen's draw list this frame. The walk writes the alphas `FUN_0036d8b0` writes (`drawnAlpha`), as the engine's does. */
export function composeScreen(screen: UiScreen): UiDrawItem[] {
  const probe = composeProbe;
  if (!probe) return composeItems(screen);
  const t0 = probe.now();
  const out = composeItems(screen);
  probe.composed(probe.now() - t0);
  return out;
}

function composeItems(screen: UiScreen): UiDrawItem[] {
  const out: UiDrawItem[] = [{ kind: 'clear', rgb: [...FRAME_CLEAR_READING] }];
  if (screen.movie) {
    const picture = screen.movie.picture();
    out.push({ kind: 'movie', picture, x0: 0, y0: 0, x1: picture?.width ?? UI_FRAME.width, y1: picture?.height ?? UI_FRAME.height });
  }
  walk(out, screen.backplane, IDENTITY, OPACITY_STACK_BASE_READING);
  out.push(screen.models.length ? { kind: 'models', triangles: projectModels(screen.models) } : { kind: 'models' });
  walk(out, screen.foreplane, IDENTITY, OPACITY_STACK_BASE_READING);
  return out;
}
