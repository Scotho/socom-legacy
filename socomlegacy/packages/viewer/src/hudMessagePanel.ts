/**
 * OT.R82 (LATER 385; product track, a browser adaptation -- the owner, 2026-10-24: "the top menu ... should extend 20-30%
 * wider as a max-width (default should stay where at is) when it won't collide with anything"): the message window's
 * panel (`HUD_LAYOUT.message.panel`, the kill and message feed at the top) keeps the original's width, and widens about
 * its centre only for a line its default does not hold, by at most `KILL_FEED_MAX_WIDTH_ADAPTATION`, and never into an
 * element the HUD has already laid in the panel's rows (the compass and its marks; the binoculars' RANGE line; whatever
 * else stands there), nor into a touch control over the picture (`touchKeepClear`, told by the page each frame). The
 * lines themselves are the original's, drawn as before.
 *
 * The room is the same whatever the heading and wherever the marks are, so the panel never breathes in a round: the
 * compass counts as its whole reach (`KILL_FEED_COMPASS_REACH_ADAPTATION`), its marks inside it, and every element as
 * its own w x h unturned. In the PS2 frame that reach already meets the default panel (565 - 80 = 485 < 492), so the
 * PS2 picture and a 4:3 window keep the original's width; a wider frame, its corners anchored to the edges, has room.
 */

import { botDisplayName, botTextCharacters } from './botPresentation';
import { textWidth } from './hudFont';

/** The widest the panel goes, a share of its own width (the owner's 20-30%: 25%). */
export const KILL_FEED_MAX_WIDTH_ADAPTATION = 1.25;
/** The space kept between the longest line's ends and the panel's edges, in the 640 x 448 frame's units. */
export const KILL_FEED_TEXT_INSET_ADAPTATION = 10;
/** The space kept between the widened panel and the nearest element in its rows, in the frame's units. */
export const KILL_FEED_CLEARANCE_ADAPTATION = 4;
/**
 * The compass's reach from its centre, in the frame's units: the pinned marks' radius 64 (`FUN_00211510`; `./hud`'s
 * marks) and 16 more for a mark drawn there at 1.2x.
 */
export const KILL_FEED_COMPASS_REACH_ADAPTATION = 80;

/** An element laid on the frame: centred at (x, y), w x h (`./hud` `HudQuad`'s). */
export interface PanelNeighbour { element: string; x: number; y: number; w: number; h: number }

/** A page control over the picture, as shares of the canvas's box (0..1 across, 0..1 down). */
export interface KeepClear { x0: number; y0: number; x1: number; y1: number }

/**
 * The touch controls drawn over the match's picture (`./touchMarkup`'s buttons and stick rests, the modern UI's touch
 * menu), each as shares of `canvas`'s box: what the panel must not grow into on a touch screen (the merge controller,
 * after the owner's "when it won't collide with anything"). A control not drawn (the layer hidden: no touch, a pad on,
 * the ARMORY) has an empty box and is left out; so is one wholly off the canvas.
 */
// The layer by its id attribute, not `#touch`: a selector engine may answer `#id` through the document's `getElementById`
// (jsdom's does), and the menu match reads none of the document's markup (`test/matchMount.test.ts`).
const TOUCH_LAYER = '[id="touch"]';
export const TOUCH_KEEP_CLEAR_SELECTOR = `${TOUCH_LAYER} button, ${TOUCH_LAYER} .touch-stick-rest, .mu-touch-menu`;
export function touchKeepClear(doc: ParentNode, canvas: Element): KeepClear[] {
  const c = canvas.getBoundingClientRect();
  if (c.width <= 0 || c.height <= 0) return [];
  const out: KeepClear[] = [];
  for (const el of doc.querySelectorAll(TOUCH_KEEP_CLEAR_SELECTOR)) {
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0 || r.right <= c.left || r.left >= c.right || r.bottom <= c.top || r.top >= c.bottom) continue;
    out.push({ x0: (r.left - c.left) / c.width, y0: (r.top - c.top) / c.height, x1: (r.right - c.left) / c.width, y1: (r.bottom - c.top) / c.height });
  }
  return out;
}

/** The page's watch over its touch controls (`keepClearWatch`). */
export interface KeepClearWatch {
  /** The controls' boxes, measured again only if something changed since the last ask (the pages ask each frame). */
  get(): readonly KeepClear[];
  /** Every listener and observer off. */
  dispose(): void;
}

/**
 * The touch controls' boxes kept between changes, so a frame reads no layout (the merge controller: a layout read each
 * frame costs a phone frames). Marked stale -- and measured at the next `get` -- by the window's resize, orientation change
 * and storage event (a touch layout saved, `./mobileLayout`), a class or `hidden` change on the touch layer or any
 * element over it (touch on or off, a pad connecting, the ARMORY, the walk), and a resize of the canvas, the layer or a
 * touch menu. `root` is where the page's touch layer is (`./matchTouch` `mountTouch`'s root: the document's body, or
 * the menu match's own element -- read through it, never the document's markup); `measure` is `touchKeepClear` (a test
 * counts it).
 */
export function keepClearWatch(
  root: Document | Element, canvas: Element, measure: (root: ParentNode, canvas: Element) => KeepClear[] = touchKeepClear,
): KeepClearWatch {
  let stale = true, kept: readonly KeepClear[] = [];
  const mark = (): void => { stale = true; };
  const doc = root instanceof Element ? root.ownerDocument : root;
  const win = doc.defaultView;
  const events = ['resize', 'orientationchange', 'storage'] as const;
  for (const e of events) win?.addEventListener(e, mark);
  const offs: (() => void)[] = [];
  const layer = root.querySelector(TOUCH_LAYER);
  if (win && 'MutationObserver' in win) {
    const watch = new win.MutationObserver(mark);
    for (let el: Element | null = layer ?? (root instanceof Element ? root : doc.body); el; el = el.parentElement) {
      watch.observe(el, { attributes: true, attributeFilter: ['class', 'hidden'] });
    }
    offs.push(() => { watch.disconnect(); });
  }
  if (win && 'ResizeObserver' in win) {
    const sizes = new (win as unknown as { ResizeObserver: typeof ResizeObserver }).ResizeObserver(mark);
    for (const el of [canvas, layer, ...root.querySelectorAll('.mu-touch-menu')]) if (el) sizes.observe(el);
    offs.push(() => { sizes.disconnect(); });
  }
  return {
    get(): readonly KeepClear[] {
      if (stale) { stale = false; kept = measure(root, canvas); }
      return kept;
    },
    dispose(): void {
      for (const e of events) win?.removeEventListener(e, mark);
      for (const off of offs) off();
    },
  };
}

/** The page's controls (`touchKeepClear`) as neighbours on a frame of `width` x `height`. */
export function keepClearNeighbours(frame: { width: number; height: number }, clear: readonly KeepClear[]): PanelNeighbour[] {
  return clear.map((k) => ({
    element: 'touch', x: (k.x0 + k.x1) / 2 * frame.width, y: (k.y0 + k.y1) / 2 * frame.height,
    w: (k.x1 - k.x0) * frame.width, h: (k.y1 - k.y0) * frame.height,
  }));
}

/**
 * The panel's span on the frame: `x` its left edge and `w` its width, in frame pixels. `x` and `w` are the default's
 * (the original's place at this frame), `y0`..`y1` its rows, `s` the frame's pixels per unit, `longest` the pen's travel
 * over the longest line shown in units (`./hudFont` `textWidth`). Wider only when the longest line needs it, then by
 * no more than the cap and the room to the nearest neighbour on either side; a HUD element across the centre (a whole
 * frame's layer) is not one to make room from, a touch control across it leaves no room. Never narrower than the default.
 */
export function messagePanelSpan(
  panel: { x: number; w: number; y0: number; y1: number }, s: number, longest: number, neighbours: readonly PanelNeighbour[],
): { x: number; w: number } {
  const cx = panel.x + panel.w / 2, half = panel.w / 2;
  const need = (longest / 2 + KILL_FEED_TEXT_INSET_ADAPTATION) * s;
  if (need <= half) return { x: panel.x, w: panel.w };
  let room = half * KILL_FEED_MAX_WIDTH_ADAPTATION;
  for (const q of neighbours) {
    if (q.element === 'marks') continue;                                     // inside the compass's reach
    const reach = q.element === 'compass' ? KILL_FEED_COMPASS_REACH_ADAPTATION * s : null;
    const hw = reach ?? q.w / 2, hh = reach ?? q.h / 2;
    if (q.y + hh <= panel.y0 || q.y - hh >= panel.y1) continue;           // not in the panel's rows
    const x0 = q.x - hw, x1 = q.x + hw;
    if (x0 >= cx) room = Math.min(room, x0 - cx - KILL_FEED_CLEARANCE_ADAPTATION * s);
    else if (x1 <= cx) room = Math.min(room, cx - x1 - KILL_FEED_CLEARANCE_ADAPTATION * s);
    else if (q.element === 'touch') room = half;                            // a control across the centre: no wider
  }
  const grown = Math.max(half, Math.min(need, room));
  return { x: cx - grown, w: grown * 2 };
}

/*
 * TAUNT-WRAP (task 8mqnCJBx; simulation track; reading, pending review; research 87 §14.1): the message window's line
 * width -- the original's, not an adaptation. `FUN_002b6530` (D:L157901), the post into a message window, measures the
 * text at the scale it draws it (`messageMeasureScale`; `FUN_00362b70`, the text's +0x3c) and, when the window has a `maxlength` and the text is
 * wider than `int(DAT_003de6f8 + maxlength - 2 x XMargin)` and holds a space (D:L158010-158012), breaks it: it appends
 * the text a character at a time until the prefix reaches the limit (D:L158015-158020), backs off any spaces there
 * (D:L158021-158022), and looks back up to `DAT_003de700` characters for a space (D:L158023-158027); found, the line ends
 * before it; not found, it ends at `DAT_003de708` characters when the text is longer than that, else where the limit was
 * reached (D:L158028-158032). A break at 0 posts nothing (D:L158033-158043); else the piece is pushed as one line node of
 * the window (D:L158044-158051) and the rest posted again the same way (D:L158052-158055), its leading spaces skipped for
 * the line's text (D:L157930). Each piece is its own line of the window: it counts toward `maxsize` and fades on its own
 * clock from the same post. The OT.R82 widening above is the port's, and with the wrap it takes only a line the window
 * cannot break (one with no space).
 */

/** `messages.rdr`'s `maxlength` (`FUN_002b6fc0` reads it into the window's +0x430, D:L158227; research 87 §8). */
export const MESSAGE_WINDOW_MAX_LENGTH = 325;
/** `messages.rdr`'s background `XMargin` (`FUN_002b6fc0` D:L158236, the window's +0x444). */
export const MESSAGE_WINDOW_X_MARGIN = 10;
/** `DAT_003de6f8`: -8, an int added to the line's room (D:L158010; the ELF's word 0xfffffff8). */
export const MESSAGE_WRAP_SLACK = -8;
/** `DAT_003de700`: how many characters back the break looks for a space (D:L158027; the ELF's word 24). */
export const MESSAGE_WRAP_BACK = 24;
/** `DAT_003de708`: the hard break, in characters, when no space is near (D:L158016, D:L158028-158032; the ELF's word 32). */
export const MESSAGE_WRAP_HARD = 32;
/** The widest a message window line is drawn before it wraps, in the frame's units at its scale: 297. */
export const MESSAGE_WRAP_WIDTH = Math.trunc(MESSAGE_WRAP_SLACK + (MESSAGE_WINDOW_MAX_LENGTH - 2 * MESSAGE_WINDOW_X_MARGIN));
/**
 * `messages.rdr`'s `scale` 0.9 (`FUN_002b6fc0` D:L158210, the window's +0x400): the scale of a post whose own is 0
 * (D:L157983-157984) -- the taunts' (D:L498230), the kill feed's (D:L412893, D:L412970), the chat's and comms', the
 * claymore's refusal (`./matchMessages` `CLAYMORE_REFUSAL_SCALE_READING`).
 */
export const MESSAGE_WINDOW_SCALE = 0.9;
/** A post's own scale is drawn and measured times 1.1429 (D:L157986): a script's `MESSAGE` (`FUN_00267760` D:L113376). */
export const MESSAGE_POST_SCALE_FACTOR = 1.1429;
/**
 * The rest of the measure's scale: `FUN_00362b70` multiplies the text's +0x40 (the post's scale above) by its +0x78 and
 * the font's +0x34 (D:L260748-260750, D:L260794). The font's +0x34 is the face's `scale`, 1 for `font_text_01`
 * (`fonts.rdr`; research 111 §1.1, research 87 §3); +0x78 is written 1.0 by the text's setter (`FUN_003631f0`
 * D:L261029), just after a locale lookup (`FUN_003a3700`, `FUN_003a32f0`) whose result the decompilation drops -- so a
 * per-string scale from the locale entry is not ruled out. The Vigilance frames (research 87 §8) draw the round start's
 * 0.9 post (1.0286 by the code) at the port's 1.0 and the objective's 0.7 (0.8) at 0.765: 0.97 and 0.96 of the code's,
 * which this reading does not explain. Settled by the disassembly of `FUN_003631f0`'s +0x78 store, or a frame of a line
 * posted at a known scale measured against `textWidth`.
 */
export const MESSAGE_TEXT_SCALE_READING = 1;
/**
 * The scale `FUN_002b6530` measures a post at, by the scale it was posted with (`post`, its `param_1`): the window's 0.9
 * for 0, else `post` x 1.1429 (D:L157983-157987), times `MESSAGE_TEXT_SCALE_READING`. The port's drawn scale of a line
 * is the page's (a frame fit for the round start, the script's own scale for a script's post); the wrap takes the
 * original's, so the pieces are where the original breaks them.
 */
export function messageMeasureScale(post: number): number {
  return (post === 0 ? MESSAGE_WINDOW_SCALE : post * MESSAGE_POST_SCALE_FACTOR) * MESSAGE_TEXT_SCALE_READING;
}
/**
 * No space within `MESSAGE_WRAP_BACK` characters: the decompiled break (D:L158028-158032) ends the line at
 * `MESSAGE_WRAP_HARD` characters when the text is longer than that, else where the limit was reached -- transcribed as
 * decompiled, not checked against the instructions. Settled by the disassembly before `LAB_002b6978`.
 */
export const MESSAGE_WRAP_HARD_BREAK_READING = 'as decompiled: 32 characters when longer, else at the limit' as const;

interface WrapChar { char: string; raw: string }
const joinChars = (cs: readonly WrapChar[]): string => cs.map((c) => c.raw).join('');

/** One post's pieces, as `FUN_002b6530` breaks it, pushed onto `out`; the bot marker kept on its character. */
function wrapPost(cs: readonly WrapChar[], scale: number, limit: number, out: string[]): void {
  let lead = 0;
  while (cs[lead]?.char === ' ') lead++;                                       // D:L157930
  const whole = joinChars(cs.slice(lead));
  if (!(limit < textWidth(whole, scale) && cs.some((c) => c.char === ' '))) { out.push(whole); return; }   // D:L158011-158012
  // Each prefix measured whole: `FUN_00362b70` re-measures the text right after each append (D:L158018-158019).
  const width = (n: number): number => textWidth(joinChars(cs.slice(0, n)), scale);
  let n = 0;
  while (n < cs.length && width(n) < limit) n++;                              // D:L158015-158020
  while (n > 0 && cs[n]?.char === ' ') n--;                                    // D:L158021-158022
  let m = n, found = false;
  do {                                                                          // D:L158023-158027
    if (cs[m]?.char === ' ' || m < 1) { found = true; break; }
    m--;
  } while (n - m <= MESSAGE_WRAP_BACK);
  if (!found) m = cs.length > MESSAGE_WRAP_HARD ? MESSAGE_WRAP_HARD : n;        // MESSAGE_WRAP_HARD_BREAK_READING
  if (m === 0) return;                                                          // D:L158034-158043: nothing posted
  out.push(joinChars(cs.slice(0, m)));
  if (m < cs.length) wrapPost(cs.slice(m), scale, limit, out);                  // D:L158052-158055
}

/**
 * A posted text's lines in the message window, measured at `scale` (`messageMeasureScale` of the post's scale): one
 * line, unchanged, when it fits; else `FUN_002b6530`'s pieces. Empty when the break falls at 0.
 */
export function wrapMessageLine(text: string, scale: number, limit: number = MESSAGE_WRAP_WIDTH): string[] {
  if (textWidth(text, scale) <= limit && !text.startsWith(' ')) return [text];
  const cs = [...botTextCharacters(text)].map(({ char, rgb }) => ({ char, raw: rgb ? botDisplayName(char, true) : char }));
  const out: string[] = [];
  wrapPost(cs, scale, limit, out);
  return out;
}
