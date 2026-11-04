import { f32, fmul } from '../text/f32';

/**
 * The 2D frame the dialogs draw on, and the rules every 2D node's draw shares (web research 112 §1-§3;
 * `D:L<line>` = a line of `socom2_game.elf.decomp.c`).
 */

/** The front end's frame: `FUN_003b1200(0)` (D:L305271-305395) sets 640 x 448, both factors 1.0 (research 111 §3.3). */
export const UI_FRAME = { width: 640, height: 448 } as const;

/**
 * A 2D quad's texture corners as its constructor `FUN_00364c50` writes them (D:L262025-262030): S 0.01 .. 0.99
 * across, T -0.01 .. -0.99 down (the corner setter `FUN_00364830` D:L261808-261817 stores T negated too). Q is 1.
 */
export const SPRITE_ST: readonly [number, number, number, number] = [f32(0.01), f32(-0.01), f32(0.99), f32(-0.99)];

/**
 * UV_REPEAT_READING: the 2D quads' texture wraps (the GS's REPEAT), so T -0.01 samples the stored texture at 0.99 of
 * its height. The quads' `CLAMP_1` setting was not read; REPEAT is the reading under which a 2D bitmap -- stored
 * bottom row first (research 95 §5.2, `flipRows`) -- stands upright, as the ARMORY's bitmaps do against the owner's
 * captures (research 95 §2.8).
 */
export const UV_REPEAT_READING = 'repeat' as const;

/**
 * A quad's (S, T) to the upright image's (u, v), both 0 .. 1 with v = 0 the image's top row: the stored texture is
 * addressed bottom row first, so v = 1 - the wrapped T (UV_REPEAT_READING). S 0.01 / T -0.01 is the image's
 * top-left at (0.01, 0.01), S 0.99 / T -0.99 its bottom-right at (0.99, 0.99): a 1% inset on every side.
 */
export function stToImage(s: number, t: number): [number, number] {
  const wrap = (x: number): number => x - Math.floor(x);
  return [wrap(s), 1 - wrap(t)];
}

/**
 * `FUN_00336a10` (D:L235048-235058): a node pushes its opacity on the walk's stack only when it is under this (127/128);
 * the pushed value is its opacity times the stack's top (`FUN_00336980` D:L235028-235043), popped after its children.
 */
export const OPACITY_PUSH_BELOW = 0.9921875;

/**
 * OPACITY_STACK_BASE_READING: the stack's bottom entry, the opacity of a node under no pushing ancestor. Where the
 * renderer at 0x4887c0 fills +0x668[0] was not found; 1.0 is the reading under which an undimmed dialog draws at its
 * own alpha, as every capture of a menu shows.
 */
export const OPACITY_STACK_BASE_READING = 1;

/** The walk's stack: `own` pushed over `top` when it is under `OPACITY_PUSH_BELOW`, else `top` unchanged. */
export function pushOpacity(top: number, own: number): number {
  return own < OPACITY_PUSH_BELOW ? fmul(own, top) : top;
}

/** `FUN_0036d8b0`'s literal: an opacity of 0.99 draws as fully opaque. */
export const FULL_FADE = f32(0.99);

/**
 * The 2D adaptor's draw `FUN_0036d8b0` (D:L266729-266747; vtable 0x4072d0 +0xc, the adaptor of every node
 * `Add2dNode` makes): with f the stack's top, when f < 1 the object's alpha is SET to f x 128 -- 128 when f is 0.99 --
 * through its vtable +0x34, and kept there; when f >= 1 nothing is written and the object draws at the alpha it holds.
 * So an alpha a fade wrote stays after the fade ends at 1.0 (`TEXT_FADE_ALPHA_READING`, research 95, read further).
 */
export function drawnAlpha(f: number, held: { alpha: number }): number {
  if (f < 1) held.alpha = fmul(f === FULL_FADE ? 1 : f, 128);
  return held.alpha;
}

/**
 * The alpha as the GS takes it from a 2D quad's packet (BOOT-06; web research 141 §2): `FUN_003643b0`
 * (D:L261637-261708) converts the quad's colour vector (+0x30 .. +0x3c, the alpha last) with `vftoi0`
 * (`FUN_001bfef8` D:L40841-40853: each float truncated toward zero to a 32-bit integer) into a GIF packet whose
 * register list is 0x512 -- ST, RGBAQ, XYZ2, PACKED -- and a PACKED RGBAQ keeps bits 7:0 of each word. So an opacity
 * under 0 (dlgMenu's two fades on MENUFADER, research 139 §9) reaches the GS as a large alpha -- -6 is 250 -- not as a
 * negative one: under the source blend the black fader then covers the frame (the blend's result clamped,
 * `GS_MODULATE_BLEND_READING`). On dlgMenu itself the blend is not the source one: the fader, untextured, draws with
 * the roller's additive bind and nothing of it shows at any byte (MENU-FADE, research 141 §2 "The blend"; the viewer's
 * `uiCompositorView.ts`).
 */
export function packedAlphaByte(alpha: number): number {
  return Math.trunc(alpha) & 0xff;
}
