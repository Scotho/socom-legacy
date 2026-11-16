// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { holdEarlyPresses } from '../../src/forge/shell/earlyPress';

/**
 * The Forge's early press (product track, a browser adaptation with no original -- the game has no editor): a press on
 * the shell's toolbar made before the page has wired its listeners (the renderer still starting) is held, and pressed
 * once the page is wired (`./shell/earlyPress`). The defect it answers: shadow's GPU trace at 1da70bdac, the menu button
 * tapped while WebGPU started and the menu never opened (e2e `forgeMenuPointer.spec.ts`).
 */

function toolbar(): { root: HTMLElement; a: HTMLButtonElement; b: HTMLButtonElement; wired: HTMLButtonElement } {
  document.body.innerHTML = '';
  const root = document.createElement('header');
  const mk = (name: string): HTMLButtonElement => { const x = document.createElement('button'); x.type = 'button'; x.dataset['name'] = name; root.append(x); return x; };
  const a = mk('a');
  const b = mk('b');
  const wired = mk('wired');
  document.body.append(root);
  return { root, a, b, wired };
}

describe('holdEarlyPresses: a press before the page is wired is held, then pressed', () => {
  it('a press held is pressed at release, after the listener the page wires meanwhile', () => {
    const { root, a } = toolbar();
    const early = holdEarlyPresses(root);
    a.click();                                     // no listener yet: lost without the hold
    expect(early.pending()).toEqual([a]);
    const seen: string[] = [];
    a.addEventListener('click', () => seen.push('a'));
    early.release();
    expect(seen).toEqual(['a']);
    expect(early.pending()).toEqual([]);
  });

  it('presses are pressed in their order; nothing is held or pressed after the release', () => {
    const { root, a, b } = toolbar();
    const early = holdEarlyPresses(root);
    a.click();
    b.click();
    const seen: string[] = [];
    a.addEventListener('click', () => seen.push('a'));
    b.addEventListener('click', () => seen.push('b'));
    early.release();
    expect(seen).toEqual(['a', 'b']);
    a.click();                                     // wired now: its own listener only, never a second press
    expect(seen).toEqual(['a', 'b', 'a']);
    early.release();                               // a second release does nothing
    expect(seen).toEqual(['a', 'b', 'a']);
  });

  it('a button already wired is not held (its own listener answered it); a disabled or inert one at release is not pressed', () => {
    const { root, a, b, wired } = toolbar();
    const early = holdEarlyPresses(root, [wired]);
    wired.click();
    a.click();
    b.click();
    expect(early.pending()).toEqual([a, b]);
    const seen: string[] = [];
    a.addEventListener('click', () => seen.push('a'));
    b.addEventListener('click', () => seen.push('b'));
    wired.addEventListener('click', () => seen.push('wired'));
    a.disabled = true;
    b.toggleAttribute('inert', true);
    early.release();
    expect(seen).toEqual([]);
  });

  it('a button inert at its press is not held, so not pressed when the page lifts inert before the release (review finding 3)', () => {
    const { root, a, b } = toolbar();
    const early = holdEarlyPresses(root);
    a.toggleAttribute('inert', true);              // as the page's scene controls until wired (jsdom does not stop the click)
    a.click();
    b.click();
    expect(early.pending()).toEqual([b]);
    const seen: string[] = [];
    a.addEventListener('click', () => seen.push('a'));
    b.addEventListener('click', () => seen.push('b'));
    a.toggleAttribute('inert', false);             // the page lifts inert, then releases
    early.release();
    expect(seen).toEqual(['b']);
  });

  it('a press outside the root is not held', () => {
    const { root } = toolbar();
    const other = document.createElement('button');
    document.body.append(other);
    const early = holdEarlyPresses(root);
    other.click();
    expect(early.pending()).toEqual([]);
  });

  it('a caught press on a button taken off the page before the release is not pressed (control, unchanged by FC2-6)', () => {
    const { root, a, b } = toolbar();
    const early = holdEarlyPresses(root);
    a.click();
    b.click();
    const seen: string[] = [];
    a.addEventListener('click', () => seen.push('a'));
    b.addEventListener('click', () => seen.push('b'));
    a.remove();
    early.release();
    expect(seen).toEqual(['b']);
  });
});

/**
 * FC2-6, the Forge menu's early press from Controls: the help card's "Forge menu (M)" presses the menu's own button, which
 * is never on the page (EDITOR-MAP T1) and whose listener the page wires only after the renderer starts. `press` names such
 * a button: held in order with the caught presses, pressed at the release whether or not it is on the page.
 */
describe('holdEarlyPresses: press(), a press the page makes itself (FC2-6)', () => {
  it('press() while holding queues the button in order with the caught presses; a button never on the page is pressed at release', () => {
    const { root, a, b } = toolbar();
    const offPage = document.createElement('button');   // never attached, as the forge menu's button
    offPage.type = 'button';
    const early = holdEarlyPresses(root);
    a.click();
    early.press(offPage);
    b.click();
    expect(early.pending()).toEqual([a, offPage, b]);
    const seen: string[] = [];
    a.addEventListener('click', () => seen.push('a'));
    offPage.addEventListener('click', () => seen.push('offPage'));
    b.addEventListener('click', () => seen.push('b'));
    expect(seen, 'nothing pressed while holding').toEqual([]);
    early.release();
    expect(seen).toEqual(['a', 'offPage', 'b']);
    expect(early.pending()).toEqual([]);
  });

  it('press() after the release presses the button at once', () => {
    const { root } = toolbar();
    const offPage = document.createElement('button');
    const early = holdEarlyPresses(root);
    early.release();
    const seen: string[] = [];
    offPage.addEventListener('click', () => seen.push('offPage'));
    early.press(offPage);
    expect(seen).toEqual(['offPage']);
    expect(early.pending()).toEqual([]);
  });

  it('a button queued by press() that is disabled or inert at the release is not pressed', () => {
    const { root } = toolbar();
    const off = document.createElement('button');        // off the page, disabled by release
    const host = document.createElement('div');           // off the page, under an inert ancestor by release
    const inner = document.createElement('button');
    host.append(inner);
    const early = holdEarlyPresses(root);
    early.press(off);
    early.press(inner);
    expect(early.pending()).toEqual([off, inner]);
    const seen: string[] = [];
    off.addEventListener('click', () => seen.push('off'));
    inner.addEventListener('click', () => seen.push('inner'));
    off.disabled = true;
    host.toggleAttribute('inert', true);
    early.release();
    expect(seen).toEqual([]);
  });
});
