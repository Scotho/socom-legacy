// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { initials, signedOutHtml } from '../../src/console/render/signedOut';
import { PAGE, value } from './cascade';

/**
 * LR-1 (the launcher redesign plan, LR.R8): the "Signed out" resting screen in the artifact's drawing
 * (`S2-Launcher-v2.dc.html`, its `signedOut` layer), with the original's Cross (LR.R5) for the artifact's "Press Enter".
 * A browser adaptation.
 */
const el = (name: string | null): HTMLElement => {
  const box = document.createElement('div');
  box.innerHTML = signedOutHtml({ name });
  return box.firstElementChild as HTMLElement;
};

describe('the Signed out screen', () => {
  it('a modal dialog named by its title; the whole screen its one target', () => {
    const s = el('WRAITH-6');
    expect(s.getAttribute('role')).toBe('dialog');
    expect(s.getAttribute('aria-modal')).toBe('true');
    expect(s.querySelector('#cx-signedout-title')!.textContent).toBe('Signed out');
    expect(s.getAttribute('aria-labelledby')).toBe('cx-signedout-title');
    expect(s.dataset['act']).toBe('signedout');
  });
  it('is focusable for LR-4 (tabindex -1: focus is moved to it on show), and its line is a real button for a keyboard or a click (review F7)', () => {
    const s = el('WRAITH-6');
    expect(s.getAttribute('tabindex')).toBe('-1');
    const line = s.querySelector('.cx-signedout__line')!;
    expect(line.tagName).toBe('BUTTON');
    expect(line.getAttribute('type')).toBe('button');
  });
  it('the ring holds the persona\'s initials; the line says Cross (the original\'s glyph) signs in as them', () => {
    const s = el('WRAITH-6');
    expect(s.querySelector('.cx-signedout__ring')!.textContent).toBe('W6');
    expect(s.querySelector('[data-menu-glyph="cross"]')).not.toBeNull();
    expect(s.querySelector('.cx-signedout__line')!.textContent!.replace(/\s+/g, ' ').trim()).toBe('Press Cross to sign in as WRAITH-6');
    expect(s.textContent).not.toMatch(/Enter|Face/);                      // LR.R5: the original's name, read by a reader
  });
  it('with none remembered: no initials, and the line only signs in', () => {
    const s = el(null);
    expect(s.querySelector('.cx-signedout__ring')!.textContent).toBe('');
    expect(s.querySelector('.cx-signedout__line')!.textContent!.replace(/\s+/g, ' ').trim()).toBe('Press Cross to sign in');
  });
  it('escapes the name', () => {
    expect(el('<b>x</b>').innerHTML).not.toContain('<b>x</b>');
  });
  it('the initials: a name\'s first letter and the first of its last part, else its first two', () => {
    expect(initials('WRAITH-6')).toBe('W6');
    expect(initials('HUSH')).toBe('HU');
    expect(initials('kilo two')).toBe('KT');
    expect(initials('a')).toBe('A');
  });
  it('the drawing: the veil and blur over the launcher, the 84 design px gold ring, the title 26, the line 15 at 65%', () => {
    const W = 1280;
    expect(value(['.cx-signedout'], 'position', W)).toBe('fixed');
    expect(value(['.cx-signedout'], 'backdrop-filter', W)).toBe('blur(10px)');
    expect(value(['.cx-signedout__ring'], 'width', W)).toBe('5.25rem');
    expect(value(['.cx-signedout__ring'], 'border', W)).toBe('2px solid var(--s2u-lx-accent)');
    expect(value(['.cx-signedout__title'], 'font', W)).toBe('400 calc(1.625rem * var(--cx-text-scale))/1.2 var(--s2u-font-body)');   // LR-46: the launcher's type token (was '400 1.625rem/1.2 var(--s2u-font-body)')
    expect(value(['.cx-signedout__line'], 'opacity', W)).toBe('0.65');
    expect(PAGE).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*:root\[data-console\] \.cx-signedout \{ animation: none; \}/);
  });
});
