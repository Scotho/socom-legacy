/**
 * RB-4 (the replay batch plan, `docs/plans/2026-11-08-replay-batch.md`): the launcher's motion foundation -- the design
 * system's launcher motion tokens (`shared/ds/base.css`, `--s2u-dur-lx-*`, LR.R11: the design's timing is the bar) read
 * by script, and how long a node's exit runs (`data-exit`, read by `./morph`'s keyed exit). Reduced motion is honoured:
 * base.css sets each token to 0s under `prefers-reduced-motion: reduce`, and the media query is asked here as well, so a
 * page without the stylesheet stands still too. A browser adaptation with no original (the project's launcher page,
 * OT.R28); nothing of the game.
 */

/**
 * The launcher's motion tokens, in ms, as `shared/ds/base.css` declares them (`--s2u-dur-lx-slide` 450ms: the rail's
 * slide and the panel's entry; `--s2u-dur-lx-fade` 350ms: the label's fade; `--s2u-dur-lx-item` 380ms: an item's
 * settle). The fallback where the page's stylesheet is not loaded; held equal to base.css by `test/console/motion.test.ts`.
 */
export const LX_MOTION_MS = { slide: 450, fade: 350, item: 380 } as const;

export type LxToken = keyof typeof LX_MOTION_MS;

/** A pushed screen's way: deeper (`forward`) or out toward Home (`back`); `./morph` writes it as `data-dir`. */
export type MotionDir = 'forward' | 'back';

/** Whether the document's window asks for reduced motion (false with no window or no media query). */
export function reducedMotion(doc: Document): boolean {
  return doc.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
}

/** A CSS time (`450ms`, `.45s`, `0s`) in ms; null when it is none. */
function cssMs(v: string): number | null {
  const m = /^\s*(\d*\.?\d+)(ms|s)\s*$/.exec(v);
  if (!m) return null;
  const n = Number(m[1]) * (m[2] === 's' ? 1000 : 1);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

/** The token `name`'s duration in ms: the page's live `--s2u-dur-lx-<name>`, else its fallback; 0 under reduced motion. */
export function lxMs(doc: Document, name: LxToken): number {
  if (reducedMotion(doc)) return 0;
  let live = '';
  try { live = doc.defaultView?.getComputedStyle(doc.documentElement).getPropertyValue(`--s2u-dur-lx-${name}`) ?? ''; } catch { /* no styles */ }
  return cssMs(live) ?? LX_MOTION_MS[name];
}

/**
 * How long `el`'s exit runs, in ms, from its `data-exit`: a token's name (`slide`, `fade`, `item`) or a whole number of
 * ms (a design time with no token, as the viewer's 420ms close, `D:833`); 0 -- no exit, it leaves at once -- for anything
 * else, for an element without the attribute, and under reduced motion.
 */
export function exitMs(el: Element): number {
  const v = el.getAttribute('data-exit');
  if (v === null) return 0;
  if (v in LX_MOTION_MS) return lxMs(el.ownerDocument, v as LxToken);
  if (!/^\d+$/.test(v)) return 0;
  return reducedMotion(el.ownerDocument) ? 0 : Number(v);
}
