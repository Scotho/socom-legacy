/**
 * OPT-11 BRIGHTNESS (research 358; reading): the original's picture brightness, the OPTIONS > VIDEO
 * slider's `BRIGHTNESS` UI variable (`InitSystemTuners` FUN_0038a7a0's tuner, default 0.5, D:L282295-282320).
 *
 * What the original does: the variable's tuner (`CBrightnessTuner`, vtable 0x408040) is told each change through its
 * update slot FUN_0038a000 (vtable 0x40804c; not decompiled, disassembled: the value read as a real, an int converted,
 * anything else 0), which tail-calls FUN_003afbe0 (disassembled). That sets the alpha A of a full-screen pass held in a
 * GS packet at 0x3e0a80 (eight quadwords, the ELF's data: TEST_1 always, ZBUF_1 masked, ALPHA_1, PRIM sprite with
 * blending, RGBAQ black with A, the sprite 0,0..640,448):
 * - b == 0.5: A = 0x80 (DAT_003e1408), the sentinel: no pass is sent (FUN_003afba0 sends only when A != 0x80);
 * - b < 0.5: A = trunc(204.8 x (0.5 - b)) (f32; `cvt.w.s`, toward zero), ALPHA_1 = 0x46 -- (0 - Cd) x As + Cd, the
 *   picture darkened to Cd x (1 - A/128); an A of 0 is set back to 0x80, no pass;
 * - b > 0.5: A = trunc(204.8 x (b - 0.5)), ALPHA_1 = 0x49 -- (Cd - 0) x As + Cd, brightened to Cd x (1 + A/128).
 * The pass is sent by FUN_003afba0 from the frame's closing flush FUN_00350cd0 (D:L250150), after the frame's world and
 * HUD (FUN_001ebed0's call at D:L50807), so it scales the whole picture. At the slider's ends A is 102: 0.203x and
 * 1.797x, clamped.
 *
 * In the browser: the same factor as a CSS `brightness()` filter on the game's screens (a per-channel multiply in the
 * picture's own space, clamped, as the GS blend is). A browser adaptation of the pass's rendering, not of its rule:
 * the GS shifts (`>> 7`) where CSS rounds, at most one step of 256 per channel. Only the game's own screens take it --
 * the front end's frame, a match's canvas, the original loading screen -- never the launcher's chrome.
 */

/** The pass's scale: the f32 204.8 (0x434CCCCD, `lui 0x434c; ori 0xcccd` at 0x3afc1c; research 358 §3). */
export const BRIGHTNESS_SCALE = Math.fround(204.8);
/** DAT_003e1408's "no pass" value (its initial 0x80, written back at b == 0.5 and at a darkening A of 0). */
export const BRIGHTNESS_OFF = 0x80;
/** `InitSystemTuners`' BRIGHTNESS default (D:L282310-282320: 0x3F000000). */
export const BRIGHTNESS_DEFAULT = 0.5;

export type BrightnessPass = { mode: 'none' | 'darken' | 'brighten'; alpha: number };

/**
 * FUN_003afbe0 on a value b: the pass's mode and its alpha, in f32 with `cvt.w.s`'s truncation. `Math.fround` rounds to
 * nearest where the EE FPU's `sub.s` / `mul.s` round toward zero (research 358 §6); over the slider's 0.00-1.00 in steps
 * of 0.01 no alpha differs (the review's simulation).
 */
export function brightnessAlpha(b: number): BrightnessPass {
  const v = Math.fround(Number.isFinite(b) ? b : BRIGHTNESS_DEFAULT);
  const half = Math.fround(BRIGHTNESS_DEFAULT);
  if (v === half) return { mode: 'none', alpha: BRIGHTNESS_OFF };
  const d = Math.fround(v - half);
  const alpha = Math.trunc(Math.fround(BRIGHTNESS_SCALE * Math.abs(d)));
  if (d < 0) return alpha === 0 ? { mode: 'none', alpha: BRIGHTNESS_OFF } : { mode: 'darken', alpha };
  return { mode: 'brighten', alpha };
}

/** The picture's factor: Cd x (1 - A/128) darkening, Cd x (1 + A/128) brightening, 1 without a pass. */
export function brightnessFactor(b: number): number {
  const p = brightnessAlpha(b);
  if (p.mode === 'none') return 1;
  return p.mode === 'darken' ? 1 - p.alpha / 128 : 1 + p.alpha / 128;
}

/** The factor as a CSS filter: `none` at 1 (no layer at the default), `brightness(k)` otherwise. */
export function brightnessFilter(b: number): string {
  const k = brightnessFactor(b);
  return k === 1 ? 'none' : `brightness(${k})`;
}

/**
 * A tuner manager's BRIGHTNESS as 0x38a000 reads it (research 358 §2): a real as it is, an int converted, any other type
 * 0.0. No variable at all is the tuner never told (`InitSystemTuners` makes it at 0.5): the default. (`./audio`
 * `TunerVars`' shape.)
 */
export function brightnessOfVars(vars: { find(name: string): { value: unknown } | undefined } | null | undefined): number {
  const v = vars?.find('BRIGHTNESS')?.value as { type?: string; value?: unknown } | undefined;
  if (v === undefined) return BRIGHTNESS_DEFAULT;
  return (v.type === 'real' || v.type === 'int') && typeof v.value === 'number' ? v.value : 0;
}

const screens = new Set<HTMLElement>();
let filter = 'none';
/** VS-5 (VS.R6, `./colourFilter`, a browser adaptation): a screen's own term after the brightness, composed, never replacing it. */
const tails = new WeakMap<HTMLElement, string>();

/** One screen's filter: at the default no inline style at all (the screens are placed by CSS, `./styles.css`), else the factor. */
function apply(el: HTMLElement, b: string): void {
  const tail = tails.get(el) ?? 'none';
  const f = b === 'none' ? tail : tail === 'none' ? b : `${b} ${tail}`;
  if (f === 'none') { if (el.style.filter) el.style.removeProperty('filter'); }
  else if (el.style.filter !== f) el.style.filter = f;
}

/**
 * VS-5 (`./colourFilter`): the term composed after the brightness on one element (`none` removes it); the brightness
 * is the page's on a registered screen, none on another element.
 */
export function setScreenFilterTail(el: HTMLElement, tail: string): void {
  if (tail === 'none') tails.delete(el); else tails.set(el, tail);
  apply(el, screens.has(el) ? filter : 'none');
}

/** Register one of the game's own screens: it takes the current filter now and every change after (until removed). */
export function frameCanvas(el: HTMLElement): void {
  screens.add(el);
  apply(el, filter);
}

/** The page's brightness: every registered screen still in its document takes the new filter; a removed one is dropped. */
export function setBrightness(b: number): void {
  filter = brightnessFilter(b);
  for (const el of [...screens]) {
    if (!el.isConnected) { screens.delete(el); continue; }
    apply(el, filter);
  }
}
