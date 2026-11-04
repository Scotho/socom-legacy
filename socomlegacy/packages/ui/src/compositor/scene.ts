import type { DialogRecord } from '../dialog';
import { f32, fadd, fdiv, fmul, fsub } from '../text/f32';
import type { TextFace } from '../text/face';
import type { TeletypeSpec, TeletypeState } from '../text/teletype';
import type { WrappedLine, WrappedSpec } from '../text/wrapped';
import type { UiModelInstance } from './models';
import { SPRITE_ST, UI_FRAME } from './frame';
import type { MovieLayer } from './movieLayer';

/**
 * The menu's node tree, as data (web research 112 §2): a node of the engine's scene graph (constructor `FUN_00316e30`
 * D:L215806+) with the one 2D object its adaptor draws (`FUN_00370160` D:L268212-268222 wraps it; `FUN_003164e0`
 * D:L215505-215532 attaches the adaptor). The screen (`CGameMenu`, `FUN_00369b60` D:L264593-264680) holds two planes
 * under its own node: the backplane and the foreplane (research 115 §1.2).
 */

/**
 * A 2D quad (`FUN_00364c50` D:L262007-262051, the base `FUN_00365100` D:L262184-262204): the rectangle (+0x24 x,
 * +0x28 y, +0x74 w, +0x78 h: ints, in the node's own space), the texture corners (+0x50 / +0x60), the colour of both
 * corners (+0x30 / +0x40, the GS's 128 = 1.0) and the alpha (+0x3c). `textured` is +0x14 bit 3, set by the base and
 * cleared through vtable +0x20 (`FUN_00364bf0` D:L261989-262005): a textured quad with no texture draws nothing
 * (`FUN_00364950` D:L261897-261932). The draw is a SPRITE (`FUN_00364d60`'s 6) with alpha blending (vtable +0x28 with 1,
 * `FUN_00364b50`).
 */
export interface UiSprite {
  texture: string | null;
  textured: boolean;
  x: number; y: number; w: number; h: number;
  /** S0, T0, S1, T1 (`SPRITE_ST` unless a setter wrote others). */
  st: [number, number, number, number];
  color: [number, number, number];
  alpha: number;
  /** An IMAGE's `PULSE` (+0x88 the flag, +0x8c the period, +0x90 the phase): `stepImagePulse`. */
  pulse: { period: number; phase: number } | null;
}

/** `FUN_00364c50` and `FUN_003646d0(0, 0, w, h, quad, texture)` (D:L261746-261769): a quad at the node's origin. */
export function newSprite(texture: string | null, w: number, h: number, textured = true): UiSprite {
  return { texture, textured, x: 0, y: 0, w: Math.trunc(w), h: Math.trunc(h), st: [...SPRITE_ST], color: [128, 128, 128], alpha: 128, pulse: null };
}

/**
 * The IMAGE's tick `FUN_00378fc0` (D:L272892-272914; the image class 0x407950's vtable +0x38): with `PULSE` set, the
 * phase moves by dt / PULSE x 2 pi (wrapped into 0 .. 2 pi) and the alpha is set to sin(phase) x 64 + 64. `dt` in
 * seconds, from the caller's clock (PLAT-12's).
 */
export function stepImagePulse(s: UiSprite, dt: number): void {
  if (!s.pulse) return;
  const TWO_PI = f32(6.2831855);
  let p = fadd(s.pulse.phase, fmul(fdiv(dt, s.pulse.period), TWO_PI));
  if (TWO_PI < p) p = fsub(p, TWO_PI);
  if (p < 0) p = fadd(p, TWO_PI);
  s.pulse.phase = p;
  s.alpha = fadd(fmul(f32(Math.sin(p)), 64), 64);
}

/** A text object's drawing state: what `layoutText` takes, and the alpha the walk may rewrite. */
export interface UiText {
  codes: number[];
  face: TextFace | null;
  scale: number;
  hcentered: boolean;
  rightJustified: boolean;
  color: [number, number, number];
  /** +0x54, the GS scale. */
  alpha: number;
  bold: boolean;
  /** The pen's offset in the node's space (a widget's caption offset; 0 for an object's text). */
  x: number;
  y: number;
}

/** What a node's adaptor draws. `group` is several parts in order (PLAT-15's widgets, PLAT-16's popup). */
export type UiContent =
  | { kind: 'sprite'; sprite: UiSprite }
  | { kind: 'text'; text: UiText }
  /** WRAPPEDTEXT: its lines (`wrapLines`), placed and clipped at each draw (`placeWrapped`); `prevRows` is +0x44. */
  | { kind: 'wrapped'; text: UiText; lines: WrappedLine[]; spec: WrappedSpec; scroll: number; prevRows: number }
  /** TELETYPE: the typed text (`TeletypeState`, ticked by the runtime) and its cursor (`teletypeDraw`). */
  | { kind: 'teletype'; text: UiText; spec: TeletypeSpec; state: TeletypeState }
  | { kind: 'group'; parts: UiContent[] }
  /** A control this package does not draw (PLAT-15's widget set): placed, ordered and faded, its drawing left to it. */
  | { kind: 'widget'; record: DialogRecord };

/** A node: the scene graph's fields the 2D walk reads. */
export interface UiNode {
  /** +0x90 (`FUN_00314ee0`). */
  name: string;
  /** +0x30 / +0x34 (`FUN_003157d0` D:L215063-215073): relative to the parent. */
  x: number;
  y: number;
  /** The node's x / y scale: the matrix's diagonal (research 95 `BAR_SCALE_ORIGIN_READING`); [1, 1] when new. */
  scale: [number, number];
  /** +0x9c: 1.0 when new (`FUN_00316e30`). */
  opacity: number;
  /** +0x5c bit 0: the walk passes over a hidden node and everything under it (`FUN_00336a60` D:L235063-235110). */
  visible: boolean;
  content: UiContent | null;
  children: UiNode[];
  parent: UiNode | null;
}

export function newNode(name: string, content: UiContent | null = null): UiNode {
  return { name, x: 0, y: 0, scale: [1, 1], opacity: 1, visible: true, content, children: [], parent: null };
}

/**
 * The node vtable's +0x18, `FUN_00315f40` (D:L215327-215365): the child leaves its old parent (+0x1c) and is appended
 * to the children vector (+0x6c count, +0x70 data) -- the walk's order is this order.
 */
export function addChild(parent: UiNode, child: UiNode): void {
  if (child.parent === parent) return;
  if (child.parent) removeChild(child.parent, child);
  child.parent = parent;
  parent.children.push(child);
}

/** The node vtable's +0x1c, `FUN_00315e70` (D:L215293-215322): out of the vector, its parent cleared. */
export function removeChild(parent: UiNode, child: UiNode): void {
  const i = parent.children.indexOf(child);
  if (i < 0) return;
  parent.children.splice(i, 1);
  child.parent = null;
}

/**
 * The node vtable's +0x24, `FUN_00315d00` (D:L215253-215290), as `CHILDOF` and the commands use it: the children
 * whose name equals `name` (length, then `strcmp` `FUN_00198f18`: case-sensitive) first, then each child's own search
 * in turn. Null when none.
 */
export function findNode(root: UiNode, name: string): UiNode | null {
  for (const c of root.children) if (c.name === name) return c;
  for (const c of root.children) {
    const hit = findNode(c, name);
    if (hit) return hit;
  }
  return null;
}

/** The fader's node name (0x3f8de8, D:L263625) and the popup's (0x3f8df8, D:L263686): `findNode` reaches both. */
export const FADER_NAME = 'MENUFADER';
export const POPUP_NAME = 'POPUP';
/** The planes' names (`FUN_00312c20` of 0x3f8e20 and 0x3f8e40, D:L264662-264667). */
export const BACKPLANE_NAME = 'CGameMenu backplane';
export const FOREPLANE_NAME = 'CGameMenu foreplane';
/** The background's node: made through `Add2dNode` (0x3f8d00) and never named (D:L263566-263577). */
export const BACKGROUND_NAME = 'background';

/** The screen (`CGameMenu`): its node, its two planes, and the nodes the compositor reaches by role. */
export interface UiScreen {
  root: UiNode;
  /** +0xc4: the background, the controls and the objects (drawn first, tick step 7). */
  backplane: UiNode;
  /** +0xc8: MENUFADER, then POPUP (drawn last, `FUN_00369170`). */
  foreplane: UiNode;
  /** The node wrapping the fader quad (+0x170); in the foreplane once a dialog is built. */
  fader: UiNode;
  /** The `POPUP` node: the overlay PLAT-16 fills; null until a dialog is built. */
  popup: UiNode | null;
  /** The background image's node, or null (none, not found, or a movie background). */
  background: UiNode | null;
  /** The movie layer under everything, for a dialog whose background is a movie (G +0x279); else null. */
  movie: MovieLayer | null;
  /** The `MODELS` entries realised (G+0x8ec's list, `FUN_00366730`): the 3D pass between the planes (`./models`). */
  models: UiModelInstance[];
}

/**
 * The screen as `FUN_00369b60` (D:L264593-264680) makes it: the backplane then the foreplane appended to the screen's
 * node, and the fader quad -- 640 x 448 at the origin, untextured (vtable +0x20 with 0), black, alpha 128
 * (D:L264670-264673) -- not yet in a plane.
 */
export function newScreen(): UiScreen {
  const root = newNode('CGameMenu');
  const backplane = newNode(BACKPLANE_NAME), foreplane = newNode(FOREPLANE_NAME);
  addChild(root, backplane);
  addChild(root, foreplane);
  const quad = newSprite(null, UI_FRAME.width, UI_FRAME.height, false);
  quad.color = [0, 0, 0];
  const fader = newNode(FADER_NAME, { kind: 'sprite', sprite: quad });
  return { root, backplane, foreplane, fader, popup: null, background: null, movie: null, models: [] };
}

/** MENUFADER's opacity (+0x9c): the input the switch's code (research 115 §3 A4) and the scripts' fades write. */
export function setFaderOpacity(screen: UiScreen, opacity: number): void {
  screen.fader.opacity = opacity;
}
