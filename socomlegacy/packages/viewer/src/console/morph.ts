/**
 * The console launcher's renderer: patch the DOM in place so the design's transitions run (the S2U Briefing design
 * system's "Console launcher" prototype, `patchAttrs` / `patchChildren` / `morph`; its Crossbar README: "The DOM must
 * be patched in place for this to run"). A node is kept when its type, its name and (for an element) its `data-key`
 * match the new markup's at the same index; otherwise it is replaced. Attributes are patched, text nodes updated,
 * children the new markup lacks removed. A property (an input's `value`) is never touched. A browser adaptation with
 * no original (the project's launcher page, OT.R28).
 */

/** Makes `a`'s attributes `b`'s: removes those `b` lacks, sets those that differ. */
export function patchAttrs(a: Element, b: Element): void {
  for (const { name } of Array.from(a.attributes)) if (!b.hasAttribute(name)) a.removeAttribute(name);
  for (const { name, value } of Array.from(b.attributes)) if (a.getAttribute(name) !== value) a.setAttribute(name, value);
}

/** Makes `a`'s children `b`'s, keeping each of `a`'s that matches by type, name and `data-key`. */
export function patchChildren(a: Node, b: Node): void {
  const an = Array.from(a.childNodes);
  const bn = Array.from(b.childNodes);
  bn.forEach((n, i) => {
    const o = an[i];
    if (!o) { a.appendChild(n); return; }
    if (o.nodeType !== n.nodeType || o.nodeName !== n.nodeName
      || (o.nodeType === 1 && (o as Element).getAttribute('data-key') !== (n as Element).getAttribute('data-key'))) {
      a.replaceChild(n, o);
      return;
    }
    if (n.nodeType !== 1) { if (o.nodeValue !== n.nodeValue) o.nodeValue = n.nodeValue; return; }
    patchAttrs(o as Element, n as Element);
    patchChildren(o, n);
  });
  for (let i = an.length - 1; i >= bn.length; i--) {
    const o = an[i]!;
    if (o.parentNode === a) a.removeChild(o);
  }
}

/** Patches `el`'s children to the markup `html`. */
export function morph(el: Element, html: string): void {
  const t = el.ownerDocument.createElement('div');
  t.innerHTML = html;
  patchChildren(el, t);
}
