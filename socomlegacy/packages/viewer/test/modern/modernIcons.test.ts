// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { ICON_NAMES, icon, iconSvg, type IconName } from '../../src/modern/icons';

/**
 * MU-1's icon set (`src/modern/icons.ts`): authored in this repository (no third-party copy, so no licence), on a
 * 24px grid with a 2px round stroke in `currentColor`. A browser adaptation (MU.R1): nothing of the game.
 */
const REQUIRED: IconName[] = ['lobby', 'user', 'settings', 'replay', 'server', 'sign-in', 'sign-out', 'launch', 'disc', 'lock', 'players', 'signal'];

describe('the modern icon set', () => {
  it('has at least the twelve the shell names', () => {
    for (const name of REQUIRED) expect(ICON_NAMES).toContain(name);
  });
  it.each(REQUIRED)('%s is a 24px, 2px round-stroke, currentColor SVG with at least one shape', (name) => {
    const svg = icon(name);
    expect(svg).toBeInstanceOf(SVGSVGElement);
    expect(svg.namespaceURI).toBe('http://www.w3.org/2000/svg');
    expect(svg.getAttribute('viewBox')).toBe('0 0 24 24');
    expect(svg.getAttribute('fill')).toBe('none');
    expect(svg.getAttribute('stroke')).toBe('currentColor');
    expect(svg.getAttribute('stroke-width')).toBe('2');
    expect(svg.getAttribute('stroke-linecap')).toBe('round');
    expect(svg.getAttribute('stroke-linejoin')).toBe('round');
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.querySelectorAll('path, circle, rect, line, polyline').length).toBeGreaterThan(0);
  });
  it('every icon has a distinct drawing', () => {
    const drawn = ICON_NAMES.map((n) => icon(n).innerHTML);
    expect(new Set(drawn).size).toBe(ICON_NAMES.length);
  });
  it('the coordinates stay on the 24px grid (0..24)', () => {
    for (const name of ICON_NAMES) {
      const nums = (iconSvg(name).match(/(?<=[\s"MLHVCSQTAZmlhvcsqtaz,(-])-?\d+(\.\d+)?/g) ?? []).map(Number);
      const svg = icon(name);
      for (const el of svg.querySelectorAll('circle, rect, line')) for (const a of ['cx', 'cy', 'x', 'y', 'x1', 'y1', 'x2', 'y2'])
        if (el.hasAttribute(a)) { const v = Number(el.getAttribute(a)); expect(v, `${name} ${a}`).toBeGreaterThanOrEqual(0); expect(v, `${name} ${a}`).toBeLessThanOrEqual(24); }
      expect(nums.length, name).toBeGreaterThan(0);
    }
  });
  it('a label makes it an image with that name; the string form is the same drawing', () => {
    const svg = icon('server', { label: 'Server' });
    expect(svg.getAttribute('role')).toBe('img');
    expect(svg.getAttribute('aria-label')).toBe('Server');
    expect(svg.hasAttribute('aria-hidden')).toBe(false);
    const holder = document.createElement('div');
    holder.innerHTML = iconSvg('server');
    expect(holder.querySelector('svg')!.innerHTML).toBe(icon('server').innerHTML);
  });
  it('a class is carried', () => {
    expect(icon('disc', { className: 'mu-icon' }).getAttribute('class')).toBe('mu-icon');
  });
});
