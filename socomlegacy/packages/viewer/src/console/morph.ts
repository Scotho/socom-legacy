/**
 * The console launcher's renderer: patch the DOM in place so the design's transitions run (the S2U Briefing design
 * system's "Console launcher" prototype, `patchAttrs` / `patchChildren` / `morph`; its Crossbar README: "The DOM must
 * be patched in place for this to run"). A node is kept when its type, its name and (for an element) its `data-key`
 * match the new markup's at the same index; otherwise it is replaced. Attributes are patched, text nodes updated,
 * children the new markup lacks removed. A property (an input's `value`) is never touched. A browser adaptation with
 * no original (the project's launcher page, OT.R28).
 *
 * RB-4 (the replay batch plan; LR.R11, the design's motion is the bar): **the keyed exit.** An element with a `data-key`
 * that opts in with `data-exit` (`./motion` `exitMs`: a token's name or ms) is not removed when the new markup drops or
 * replaces it: it stays mounted, marked `data-leaving` (and `inert`, `aria-hidden`, so neither the pointer, the keyboard
 * nor a reader reaches it), for its exit's duration, then leaves. A leaving node is outside the index match, so the next
 * draw patches the live nodes only; a replacement is put before it, so the live node is the document's first; the same
 * key drawn again while it leaves is revived in place (its removal cancelled), never doubled. Under reduced motion the
 * duration is 0 and the node leaves at once, as every node without `data-exit` does. **The direction:** `morph`'s `dir`
 * is written on the host as `data-dir` (kept until another is given), and on a node as it starts to leave, frozen there,
 * so its exit runs the way of the move that dropped it (the design's reversed exit, `D:748`).
 */

import { exitMs, type MotionDir } from './motion';

/** The pending removal of each leaving node. */
const leaving = new WeakMap<Element, ReturnType<typeof setTimeout>>();

const isLeaving = (n: Node): boolean => n.nodeType === 1 && (n as Element).hasAttribute('data-leaving');

/** Makes `a`'s attributes `b`'s: removes those `b` lacks, sets those that differ. */
export function patchAttrs(a: Element, b: Element): void {
  for (const { name } of Array.from(a.attributes)) if (!b.hasAttribute(name)) a.removeAttribute(name);
  for (const { name, value } of Array.from(b.attributes)) if (a.getAttribute(name) !== value) a.setAttribute(name, value);
}

/** Takes `o` out of `a`: at once, or -- a keyed node with an exit -- after its exit, marked leaving meanwhile. */
function drop(a: Node, o: Node, dir: MotionDir | undefined): void {
  const el = o.nodeType === 1 ? o as Element : null;
  const ms = el && el.hasAttribute('data-key') ? exitMs(el) : 0;
  if (!el || ms <= 0) { if (o.parentNode === a) a.removeChild(o); return; }
  el.setAttribute('data-leaving', '');
  el.setAttribute('inert', '');
  el.setAttribute('aria-hidden', 'true');
  if (dir) el.setAttribute('data-dir', dir);
  const view = el.ownerDocument.defaultView;
  const t = (view ?? globalThis).setTimeout(() => {
    leaving.delete(el);
    if (el.hasAttribute('data-leaving') && el.parentNode === a) a.removeChild(el);
  }, ms);
  leaving.set(el, t);
}

/** The leaving child of `a` that `n` would draw again (the same name and `data-key`), its removal cancelled; else null. */
function revive(a: Node, n: Node): Element | null {
  if (n.nodeType !== 1) return null;
  const key = (n as Element).getAttribute('data-key');
  if (key === null) return null;
  for (const c of Array.from(a.childNodes)) {
    if (!isLeaving(c) || c.nodeName !== n.nodeName || (c as Element).getAttribute('data-key') !== key) continue;
    const el = c as Element;
    const t = leaving.get(el);
    if (t !== undefined) { (el.ownerDocument.defaultView ?? globalThis).clearTimeout(t); leaving.delete(el); }
    return el;
  }
  return null;
}

/**
 * Makes `a`'s children `b`'s, keeping each of `a`'s that matches by type, name and `data-key`; a leaving child is out of
 * the match, a dropped keyed child with an exit leaves after it (above). `dir`: frozen on a child as it starts to leave.
 */
export function patchChildren(a: Node, b: Node, dir?: MotionDir): void {
  const an = Array.from(a.childNodes).filter((n) => !isLeaving(n));
  const bn = Array.from(b.childNodes);
  let prev: Node | null = null;                                       // the last live child placed
  bn.forEach((n, i) => {
    const o = an[i];
    if (o && o.nodeType === n.nodeType && o.nodeName === n.nodeName
      && (o.nodeType !== 1 || (o as Element).getAttribute('data-key') === (n as Element).getAttribute('data-key'))) {
      if (n.nodeType !== 1) { if (o.nodeValue !== n.nodeValue) o.nodeValue = n.nodeValue; }
      else { patchAttrs(o as Element, n as Element); patchChildren(o, n, dir); }
      prev = o;
      return;
    }
    const back = revive(a, n);
    const put: Node = back ?? n;
    // In `o`'s place, or after the last live child placed: before any leaving child there, so the live one comes first.
    a.insertBefore(put, o ?? (prev ? prev.nextSibling : a.firstChild));
    if (back) { patchAttrs(back, n as Element); patchChildren(back, n, dir); }
    if (o) drop(a, o, dir);
    prev = put;
  });
  for (let i = an.length - 1; i >= bn.length; i--) drop(a, an[i]!, dir);
}

/** Patches `el`'s children to the markup `html`; `dir`, when given, written on `el` as `data-dir` (RB-4, above). */
export function morph(el: Element, html: string, opts?: { dir?: MotionDir }): void {
  const dir = opts?.dir;
  if (dir && el.getAttribute('data-dir') !== dir) el.setAttribute('data-dir', dir);
  const t = el.ownerDocument.createElement('div');
  t.innerHTML = html;
  patchChildren(el, t, dir);
}
