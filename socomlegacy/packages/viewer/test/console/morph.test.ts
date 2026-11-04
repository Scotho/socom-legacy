// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { morph, patchAttrs, patchChildren } from '../../src/console/morph';

/**
 * The console launcher's update-in-place renderer (the S2U Briefing design system's "Console launcher" prototype,
 * `patchAttrs` / `patchChildren` / `morph`): a re-render keeps the elements it can, so the CSS transitions run. A
 * browser adaptation with no original (the project's own launcher page, OT.R28); nothing of the game.
 */
describe('morph (the prototype\'s patch-in-place renderer)', () => {
  it('keeps an element of the same tag and data-key: identity kept, attributes patched, text updated', () => {
    const host = document.createElement('div');
    morph(host, '<section data-key="home" class="a" title="t"><span>one</span></section>');
    const before = host.firstElementChild!;
    const span = before.firstElementChild!;
    morph(host, '<section data-key="home" class="b" aria-label="x"><span>two</span></section>');
    expect(host.firstElementChild).toBe(before);
    expect(before.firstElementChild).toBe(span);
    expect(before.getAttribute('class')).toBe('b');
    expect(before.hasAttribute('title')).toBe(false);
    expect(before.getAttribute('aria-label')).toBe('x');
    expect(span.textContent).toBe('two');
  });

  it('replaces an element whose data-key differs', () => {
    const host = document.createElement('div');
    morph(host, '<section data-key="home"><p>a</p></section>');
    const before = host.firstElementChild!;
    morph(host, '<section data-key="rooms"><p>a</p></section>');
    expect(host.firstElementChild).not.toBe(before);
    expect(host.firstElementChild!.getAttribute('data-key')).toBe('rooms');
  });

  it('replaces an element whose tag differs, and removes the children the new markup lacks', () => {
    const host = document.createElement('div');
    morph(host, '<ul><li>1</li><li>2</li><li>3</li></ul><p>tail</p>');
    const list = host.firstElementChild!;
    morph(host, '<ul><li>1</li></ul><div>tail</div>');
    expect(host.firstElementChild).toBe(list);
    expect(list.children).toHaveLength(1);
    expect(host.lastElementChild!.tagName).toBe('DIV');
    expect(host.childNodes).toHaveLength(2);
  });

  it('appends the children the old tree lacks; an empty string clears', () => {
    const host = document.createElement('div');
    morph(host, '<i>1</i>');
    morph(host, '<i>1</i><i>2</i>');
    expect(host.children).toHaveLength(2);
    morph(host, '');
    expect(host.childNodes).toHaveLength(0);
  });

  it('patchAttrs and patchChildren are usable on their own', () => {
    const a = document.createElement('b');
    a.setAttribute('x', '1');
    const b = document.createElement('b');
    b.setAttribute('y', '2');
    patchAttrs(a, b);
    expect([a.hasAttribute('x'), a.getAttribute('y')]).toEqual([false, '2']);
    const p = document.createElement('p');
    p.textContent = 'old';
    const q = document.createElement('p');
    q.textContent = 'new';
    const text = p.firstChild;
    patchChildren(p, q);
    expect(p.firstChild).toBe(text);
    expect(p.textContent).toBe('new');
  });
});
