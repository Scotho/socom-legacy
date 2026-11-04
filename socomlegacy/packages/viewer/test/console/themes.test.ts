// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bootConsole, type ConsolePage } from '../../src/console/app';
import { sampleAdapters } from '../../src/console/sampleAdapters';
import { APPEARANCE, applyTheme, clock24, hex, pictureOn, THEMES, themeOf } from '../../src/console/render/theme';
import { mountShell } from './shell';

/**
 * LR-1 (the launcher redesign plan, LR.R8): the seven themes of the owner's Claude Design artifact
 * (`docs/specs/launcher-redesign/S2-Launcher-v2.dc.html`, its THEMES and THEME_NOTES), as the page's table and as the
 * design system's `--s2u-lx-theme-*` token sets (`shared/ds/base.css`, part M). A browser adaptation.
 */
const BASE = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../../../../shared/ds/base.css'), 'utf-8');
const token = (name: string): string | undefined => new RegExp(`${name}:\\s*([^;]+);`).exec(BASE)?.[1]?.trim();

let page: ConsolePage | null = null;
beforeEach(() => { mountShell(document); delete document.documentElement.dataset['s2uTheme']; });
afterEach(() => { page?.dispose(); page = null; });

describe('the themes table', () => {
  it('is the artifact\'s seven, in its order, Navy & Gold first (the default) with their notes', () => {
    expect(THEMES.map((t) => t.label)).toEqual(['Navy & Gold', 'Deep Water', 'Blackout', 'Night Ops', 'Jungle', 'Desert', 'Frost']);
    expect(THEMES.map((t) => t.id)).toEqual(['navy-gold', 'deep-water', 'blackout', 'night-ops', 'jungle', 'desert', 'frost']);
    expect(THEMES[0]!.note).toBe('Default · SOCOM II');
    expect(THEMES.map((t) => t.note)).toEqual(['Default · SOCOM II', 'Brighter navy', 'Near-black, low light', 'Steel blue', 'Olive and moss', 'Sand and amber', 'Pale ice']);
    expect(THEMES[0]).toMatchObject({ top: '#03080e', bottom: '#000000', sheet: [38, 146, 212], glow: [16, 96, 160], gold: true });
    expect(THEMES[6]).toMatchObject({ top: '#17222c', bottom: '#05080c', sheet: [205, 228, 248], glow: [60, 90, 120], gold: false });
  });
  it.each(THEMES.map((t) => [t.id, t] as const))('%s is the design system\'s token set, value for value', (id, t) => {
    expect(token(`--s2u-lx-theme-${id}-top`)).toBe(t.top);
    expect(token(`--s2u-lx-theme-${id}-bottom`)).toBe(t.bottom);
    expect(token(`--s2u-lx-theme-${id}-sheet`)).toBe(hex(t.sheet));
    expect(token(`--s2u-lx-theme-${id}-glow`)).toBe(hex(t.glow));
    expect(token(`--s2u-lx-theme-${id}-trim`)).toBe(t.gold ? 'var(--s2u-lx-accent)' : 'transparent');
  });
});

describe('the Appearance reads (LR-5 draws their rows; the ids and value orders are fixed here)', () => {
  const opts = (values: Record<string, number>) => ({ options: { value: (id: string) => values[id] ?? 0 } });
  it('the theme is the option\'s index into the table; unknown or out of range is Navy & Gold', () => {
    expect(APPEARANCE).toEqual({ theme: 'theme', picture: 'backdrop', clock: 'clock' });
    expect(themeOf(opts({})).id).toBe('navy-gold');
    expect(themeOf(opts({ theme: 3 })).id).toBe('night-ops');
    expect(themeOf(opts({ theme: 99 })).id).toBe('navy-gold');
    expect(themeOf(opts({ theme: -1 })).id).toBe('navy-gold');
  });
  it('the picture behind the sheets is off by default (the artifact\'s "None · Wave only"), on at 1 (Crossroads)', () => {
    expect(pictureOn(opts({}))).toBe(false);
    expect(pictureOn(opts({ backdrop: 1 }))).toBe(true);
  });
  it('the clock is 24-hour by default (the artifact\'s clock24: true), 12-hour at 1', () => {
    expect(clock24(opts({}))).toBe(true);
    expect(clock24(opts({ clock: 1 }))).toBe(false);
  });
});

describe('the page wears the theme', () => {
  it('applyTheme marks the root for part M', () => {
    applyTheme(document, THEMES[4]!);
    expect(document.documentElement.dataset['s2uTheme']).toBe('jungle');
  });
  it('every draw marks the root with the chosen theme, and a change is drawn at the next render', () => {
    const a = sampleAdapters();
    page = bootConsole(document, window, a, { keymap: false });
    expect(document.documentElement.dataset['s2uTheme']).toBe('navy-gold');
    a.options.set('theme', 5);
    page.render();
    expect(document.documentElement.dataset['s2uTheme']).toBe('desert');
  });
});
