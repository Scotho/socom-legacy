// @vitest-environment node
//
// Node, not the project default jsdom: under jsdom, Vite's static-analysis transform for
// `new URL(dynamicTemplate, import.meta.url)` mis-resolves the base to a path missing the repo's root
// segments (a Vite/jsdom interaction, not a bug in this file's logic -- confirmed by a minimal repro:
// the same expression resolves correctly under `node`). This file is fs/crypto only, no DOM.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { createHash } from 'crypto';
import { parseColor, composite, contrast, readTokens, resolve } from './contrast';
import { generate } from '../tools/gen-tokens.mjs';

const here = (f: string) => new URL(`./${f}`, import.meta.url);
const json = readFileSync(here('tokens.json'), 'utf-8');
const css = readFileSync(here('tokens.css'), 'utf-8');
const base = readFileSync(here('base.css'), 'utf-8');
const version = readFileSync(here('VERSION'), 'utf-8').trim();
/* the engineering tokens the artifact does not define live in base.css's first :root block (spec 4.2); only that
   block is read, so the density switch and the reduced-motion block (which redefine tokens) do not win "last". */
const baseRoot = /:root\s*{([^}]*)}/.exec(base)?.[1] ?? '';
const tokens = readTokens(css + baseRoot);
const ARTIFACT_SHA = '85a909c21044a95c7f73e97cd34c96f8877a9ad0de3c2c753b3ee66d5fdbcdf1';

const solid = (name: string, over = '--s2u-ground') => {
  const c = parseColor(resolve(tokens, name));
  return c.a === 1 ? c : composite(c, parseColor(resolve(tokens, over)));
};

/* spec 4.3: [foreground, surface, bar] */
const PAIRS: [string, string, number][] = [];
for (const fg of ['--s2u-gold', '--s2u-gold-display', '--s2u-text', '--s2u-text-strong', '--s2u-text-dim', '--s2u-glyph-triangle', '--s2u-glyph-cross', '--s2u-warn'])
  for (const bg of ['--s2u-ground', '--s2u-panel', '--s2u-tab', '--s2u-tab-lit']) PAIRS.push([fg, bg, 4.5]);
for (const bg of ['--s2u-ground', '--s2u-panel', '--s2u-tab', '--s2u-tab-lit']) PAIRS.push(['--s2u-glyph-square', bg, 3], ['--s2u-focus', bg, 3]);
PAIRS.push(['--s2u-text-strong', '--s2u-highlight', 4.5], ['--s2u-focus', '--s2u-highlight', 3]);
PAIRS.push(['--s2u-cyan-boot', '--s2u-ground-deep', 4.5], ['--s2u-ground', '--s2u-gold', 4.5]);
/* 1.1.0, the launcher (MU.R19, MU.R20; launcher brief section 4): every text and mark the new components draw, on
   every surface they draw it on, by the new names. Surfaces: the text colours at 4.5 on the four new surfaces but
   `active` (highlight), where only text-strong reads, as before. */
const SURFACES = ['--s2u-surface-raised', '--s2u-surface-card', '--s2u-surface-hover'];
for (const fg of ['--s2u-gold', '--s2u-gold-display', '--s2u-text', '--s2u-text-strong', '--s2u-text-dim', '--s2u-glyph-triangle', '--s2u-glyph-cross', '--s2u-warn'])
  for (const bg of SURFACES) PAIRS.push([fg, bg, 4.5]);
PAIRS.push(['--s2u-text-strong', '--s2u-surface-active', 4.5], ['--s2u-focus', '--s2u-surface-active', 3]);
for (const bg of SURFACES) PAIRS.push(['--s2u-glyph-square', bg, 3], ['--s2u-focus', bg, 3]);
/* 1.7.0, the ○ glyph (the owner's red, 2026-10-16): a mark, 3:1 on every ground a glyph sits on */
for (const bg of ['--s2u-ground', '--s2u-panel', '--s2u-tab', '--s2u-tab-lit', ...SURFACES]) PAIRS.push(['--s2u-glyph-circle', bg, 3]);
/* 1.8.0, the extraction popover (part I; DX-2, FI.R7): its words on the dialog's panel -- the file's path and the figures
   text-strong, the lines text, the captions and notes text-dim, a refusal warn; its marks (the disc and the chips gold,
   the box text, the bar's fill gold) 3:1 on the panel and on the bar's and the lane's tab */
for (const fg of ['--s2u-text-strong', '--s2u-text', '--s2u-text-dim', '--s2u-warn', '--s2u-gold']) PAIRS.push([fg, '--s2u-panel', 4.5]);
for (const bg of ['--s2u-panel', '--s2u-tab']) for (const fg of ['--s2u-gold', '--s2u-gold-display', '--s2u-text']) PAIRS.push([fg, bg, 3]);
/* the states: a chip's lamp (a mark, 3:1) on every surface a chip or the bars sit on; ready, wait and alert are also
   words (a status line), so 4.5 on the same; live (cyan-boot) is a lamp only (css.test.ts refuses it as `color`) */
const STATE_GROUNDS = ['--s2u-ground', '--s2u-panel', '--s2u-tab', '--s2u-tab-lit', '--s2u-surface-raised'];
for (const bg of STATE_GROUNDS) {
  PAIRS.push(['--s2u-state-live', bg, 3]);
  for (const fg of ['--s2u-state-ready', '--s2u-state-wait', '--s2u-state-alert']) PAIRS.push([fg, bg, 4.5]);
}
/* START armed (ground on gold, the existing skip-link pair) and launching (ground on gold-display) */
PAIRS.push(['--s2u-ground', '--s2u-gold-display', 4.5]);

/* 1.2.0, the public site's action levels (MU.R21): the label on each fill and edge the new states draw. Primary: ground-deep
   on gold (rest), gold-display (hover), text-strong (press); secondary: text-strong on tab, tab-lit, highlight-pressed;
   selected: gold-display on tab; disabled: text-dim on tab; the edges (text-dim and gold on tab, 3:1); tertiary:
   gold-display on every ground it sits on. */
for (const bg of ['--s2u-gold', '--s2u-gold-display', '--s2u-text-strong']) PAIRS.push(['--s2u-ground-deep', bg, 4.5]);
for (const bg of ['--s2u-tab', '--s2u-tab-lit', '--s2u-highlight-pressed']) PAIRS.push(['--s2u-text-strong', bg, 4.5]);
PAIRS.push(['--s2u-ground-deep', '--s2u-gold', 4.5], ['--s2u-text-strong', '--s2u-tab', 4.5], ['--s2u-gold-display', '--s2u-tab', 4.5], ['--s2u-text-dim', '--s2u-tab', 3], ['--s2u-gold', '--s2u-tab', 3]);
for (const bg of ['--s2u-ground', '--s2u-panel', '--s2u-tab', '--s2u-surface-raised']) PAIRS.push(['--s2u-gold-display', bg, 4.5]);

/** a length token in px: a literal, a var chain, or a calc() of + and * over them (the launcher's layout tokens) */
const px = (name: string): number => {
  const v = resolve(tokens, name);
  const expr = v.replace(/^calc\((.*)\)$/, '$1').replace(/var\((--[a-z0-9-]+)\)/g, (_m, n: string) => String(px(n))).replace(/px/g, '');
  if (!/^[\d\s.+*]+$/.test(expr)) throw new Error(`${name} is not a px sum: ${v}`);
  return expr.split('+').reduce((sum, term) => sum + term.split('*').reduce((p, f) => p * Number(f.trim()), 1), 0);
};

describe('tokens.json', () => {
  it('is the artifact’s file, byte for byte', () => {
    expect(createHash('sha256').update(json).digest('hex')).toBe(ARTIFACT_SHA);
  });
});

describe('tokens.css', () => {
  it('is exactly what gen-tokens.mjs writes from tokens.json (never edit it by hand)', () => {
    expect(css).toBe(generate(JSON.parse(json), version));
  });
  it('declares the cascade layer order first', () => {
    expect(css.trimStart().startsWith('@layer s2u.tokens, s2u.base, s2u.components;')).toBe(true);
  });
  it('carries the VERSION', () => {
    expect(/^\d+\.\d+\.\d+$/.test(version)).toBe(true);
    expect(resolve(tokens, '--s2u-version')).toBe(`"${version}"`);
  });
  it('names every token --s2u-*', () => {
    for (const k of tokens.keys()) expect(k.startsWith('--s2u-')).toBe(true);
  });
  it.each(['--s2u-ground', '--s2u-panel', '--s2u-tab', '--s2u-tab-lit', '--s2u-highlight', '--s2u-gold', '--s2u-gold-display', '--s2u-text', '--s2u-text-strong', '--s2u-text-dim', '--s2u-focus', '--s2u-warn', '--s2u-panel-edge'])('%s is a colour', (n) => {
    expect(() => parseColor(resolve(tokens, n))).not.toThrow();
  });
  it.each(PAIRS)('%s on %s clears %s:1', (fg, bg, bar) => {
    expect(contrast(solid(fg, bg), solid(bg))).toBeGreaterThanOrEqual(bar);
  });
  it('gold-source fails on panel, by design, so the guard can name it', () => {
    expect(contrast(solid('--s2u-gold-source'), solid('--s2u-panel'))).toBeLessThan(4.5);
  });
  it('generates the type styles as shorthands', () => {
    expect(resolve(tokens, '--s2u-type-tab')).toBe('600 18px/24px var(--s2u-font-label)');
    expect(resolve(tokens, '--s2u-tracking-tab')).toBe('0.08em');
    expect(resolve(tokens, '--s2u-italic-screen-title')).toBe('italic');
    expect(resolve(tokens, '--s2u-italic-body')).toBe('normal');
    expect(resolve(tokens, '--s2u-tracking-body')).toBe('0');
    expect(resolve(tokens, '--s2u-type-readout')).toBe('500 13px/18px var(--s2u-font-mono)');
  });
  it('carries the families, spacing, radius, shadow and opacity', () => {
    expect(resolve(tokens, '--s2u-font-label')).toContain('Oswald');
    expect(resolve(tokens, '--s2u-font-display')).toContain('Saira Condensed Fallback');
    expect(resolve(tokens, '--s2u-space-4')).toBe('16px');
    expect(resolve(tokens, '--s2u-tab-w')).toBe('230px');
    expect(resolve(tokens, '--s2u-radius-0')).toBe('0px');
    expect(resolve(tokens, '--s2u-panel-inset')).toBe('inset 0 0 0 1px #061a1c');
    expect(resolve(tokens, '--s2u-scanline')).toBe('0.10');
    expect(resolve(tokens, '--s2u-disabled')).toBe('0.45');
  });
});

describe('1.1.0: the launcher tokens (MU.R19, MU.R20; launcher brief section 4), engineering tokens in base.css', () => {
  it('shared/package.json and the root lock\'s "shared" entry carry the same version as VERSION', () => {
    expect(JSON.parse(readFileSync(here('../package.json'), 'utf-8')).version).toBe(version);
    expect(JSON.parse(readFileSync(here('../../package-lock.json'), 'utf-8')).packages.shared.version).toBe(version);
  });
  it('VERSION is at least 1.1.0 (additive: a minor bump)', () => {
    const [maj, min] = version.split('.').map(Number);
    expect(maj > 1 || (maj === 1 && min >= 1)).toBe(true);
  });
  it('the layout heights, each built on the spacing scale', () => {
    expect(resolve(tokens, '--s2u-bar-h')).toBe('calc(var(--s2u-space-12) + var(--s2u-space-2))');
    expect(px('--s2u-bar-h')).toBe(56);
    expect(px('--s2u-shelf-h')).toBe(128);
    expect(resolve(tokens, '--s2u-shelf-h-compact')).toBe('48px');
    expect(tokens.get('--s2u-shelf-h-compact')).toBe('var(--s2u-space-12)');
    expect(px('--s2u-action-h')).toBe(64);
    expect(resolve(tokens, '--s2u-hero-h')).toBe('clamp(200px, 38vh, 360px)');
    expect([px('--s2u-bar-h-narrow'), px('--s2u-shelf-h-narrow'), px('--s2u-action-h-narrow')]).toEqual([48, 64, 88]);
  });
  it('opened at 1440x900 the content region is 732px (900 - bar - compact shelf - action bar; brief 2.3)', () => {
    expect(900 - px('--s2u-bar-h') - px('--s2u-shelf-h-compact') - px('--s2u-action-h')).toBe(732);
  });
  it('icons, focus and the signature motion step', () => {
    expect(['--s2u-icon-16', '--s2u-icon-20', '--s2u-icon-24', '--s2u-icon-40'].map(px)).toEqual([16, 20, 24, 40]);
    expect(resolve(tokens, '--s2u-focus-w')).toBe('2px');
    expect(resolve(tokens, '--s2u-focus-offset')).toBe('2px');
    expect(resolve(tokens, '--s2u-dur-signature')).toBe('360ms');
    expect(resolve(tokens, '--s2u-dur-fast')).toBe('120ms');
    expect(resolve(tokens, '--s2u-dur-base')).toBe('200ms');
  });
  it.each([
    ['--s2u-state-live', '--s2u-cyan-boot'], ['--s2u-state-ready', '--s2u-glyph-triangle'], ['--s2u-state-wait', '--s2u-text-dim'], ['--s2u-state-alert', '--s2u-warn'],
    ['--s2u-status-operational', '--s2u-state-live'], ['--s2u-status-degraded', '--s2u-state-alert'], ['--s2u-status-maintenance', '--s2u-gold'],
    ['--s2u-status-down', '--s2u-glyph-circle'], ['--s2u-status-unknown', '--s2u-state-wait'], ['--s2u-status-unreachable', '--s2u-glyph-cross'],
    ['--s2u-surface-raised', '--s2u-panel-edge'], ['--s2u-surface-card', '--s2u-tab'], ['--s2u-surface-hover', '--s2u-tab-lit'], ['--s2u-surface-active', '--s2u-highlight'],
  ])('%s is an alias of %s, not a new colour', (alias, of) => {
    expect(tokens.get(alias)).toBe(`var(${of})`);
  });
  it('the scrim is ground mixed against transparent, and every text colour clears 4.5:1 on it over pure white (the worst backdrop)', () => {
    const m = /^color-mix\(in srgb, var\((--s2u-[a-z-]+)\) (\d+)%, transparent\)$/.exec(resolve(tokens, '--s2u-scrim'));
    expect(m, resolve(tokens, '--s2u-scrim')).not.toBeNull();
    const scrim = { ...parseColor(resolve(tokens, m![1])), a: Number(m![2]) / 100 };
    for (const over of ['#ffffff', '#000000']) {
      const bg = composite(scrim, parseColor(over));
      for (const fg of ['--s2u-gold', '--s2u-gold-display', '--s2u-text', '--s2u-text-strong', '--s2u-text-dim'])
        expect(contrast(solid(fg), bg), `${fg} on scrim over ${over}`).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('1.2.0: the public-site tokens (MU.R21, MU.R22; README, "From the public site"), engineering tokens in base.css', () => {
  it('VERSION is at least 1.2.0 (additive: a minor bump)', () => {
    const [maj, min] = version.split('.').map(Number);
    expect(maj > 1 || (maj === 1 && min >= 2)).toBe(true);
  });
  it('the minimum hit areas: 44px, and 48px for a primary launcher button (an alias of the 48px space-12)', () => {
    expect(px('--s2u-hit-min')).toBe(44);
    expect(px('--s2u-hit-primary')).toBe(48);
    expect(tokens.get('--s2u-hit-primary')).toBe('var(--s2u-space-12)');
  });
  it('the reading measure is 1040px; the selected and callout rule is 2px', () => {
    expect(px('--s2u-measure-reading')).toBe(1040);
    expect(px('--s2u-rule-w')).toBe(2);
  });
  it('the backdrop shade is the scrim (88% ground, inside the guide 82 to 92%), and the image defaults to none', () => {
    expect(tokens.get('--s2u-backdrop-shade')).toBe('var(--s2u-scrim)');
    expect(tokens.get('--s2u-backdrop-image')).toBe('none');
  });
  it('the shade holds every text colour at 4.5:1 even at 82% over pure white (the guide lightest overlay)', () => {
    const scrim = { ...parseColor(resolve(tokens, '--s2u-ground')), a: 0.82 };
    const bg = composite(scrim, parseColor('#ffffff'));
    for (const fg of ['--s2u-gold', '--s2u-gold-display', '--s2u-text', '--s2u-text-strong'])
      expect(contrast(solid(fg), bg), fg).toBeGreaterThanOrEqual(4.5);
  });
  it('text-dim holds 4.5:1 on the shade as it is (88%) over white but not at 82%, so the claim is for the 88% shade only', () => {
    const at = (a: number) => composite({ ...parseColor(resolve(tokens, '--s2u-ground')), a }, parseColor('#ffffff'));
    expect(contrast(solid('--s2u-text-dim'), at(0.88))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(solid('--s2u-text-dim'), at(0.82))).toBeLessThan(4.5);
  });
  it('the icon scale and the focus offset are unchanged (16, 20, 24, 40 and 2px; the guide 18, 28 and 3px are not adopted)', () => {
    expect(['--s2u-icon-16', '--s2u-icon-20', '--s2u-icon-24', '--s2u-icon-40'].map(px)).toEqual([16, 20, 24, 40]);
    expect(resolve(tokens, '--s2u-focus-offset')).toBe('2px');
  });
});

describe('1.3.0: the live site\'s launcher patterns (MU.R19, MU.R23, MU.R24; README, "From the live site"), engineering tokens in base.css', () => {
  /** an opaque `color-mix(in srgb, var(A) P%, var(B))`: A at P% composited over B (the same sRGB interpolation) */
  const mixed = (name: string) => {
    const m = /^color-mix\(in srgb, var\((--s2u-[a-z-]+)\) (\d+)%, var\((--s2u-[a-z-]+)\)\)$/.exec(resolve(tokens, name));
    expect(m, `${name} = ${resolve(tokens, name)}`).not.toBeNull();
    return composite({ ...solid(m![1]), a: Number(m![2]) / 100 }, solid(m![3]));
  };
  it('VERSION is at least 1.3.0 (additive: a minor bump)', () => {
    const [maj, min] = version.split('.').map(Number);
    expect(maj > 1 || (maj === 1 && min >= 3)).toBe(true);
  });
  it('START large: at least 180px, 124px at <= 640px (startup.css l.113, 263)', () => {
    expect(px('--s2u-start-min-w')).toBe(180);
    expect(px('--s2u-start-min-w-narrow')).toBe(124);
  });
  it('the action bar grows by space-12 for an error (the live 80 -> 128 and 160 -> 208): 112px, 88 -> 136px narrow', () => {
    expect(tokens.get('--s2u-action-h-error')).toBe('calc(var(--s2u-action-h) + var(--s2u-space-12))');
    expect(px('--s2u-action-h-error')).toBe(112);
    expect(px('--s2u-action-h-error-narrow')).toBe(136);
  });
  it('a phone top bar with the navlinks row: the narrow bar plus one 44px row (hit-min) = 92px', () => {
    expect(tokens.get('--s2u-bar-h-narrow-nav')).toBe('calc(var(--s2u-bar-h-narrow) + var(--s2u-hit-min))');
    expect(px('--s2u-bar-h-narrow-nav')).toBe(92);
  });
  it('the slot: a 4px edge in gold by default (the live border-left), its ready fill highlight-pressed 85% over ground (startup.css l.21, 24)', () => {
    expect(px('--s2u-slot-edge-w')).toBe(4);
    expect(tokens.get('--s2u-slot-edge')).toBe('var(--s2u-gold)');
    expect(tokens.get('--s2u-slot-ready-fill')).toBe('color-mix(in srgb, var(--s2u-highlight-pressed) 85%, var(--s2u-ground))');
  });
  it('the tip: its arrow at 50% unless the page sets --s2u-tip-arrow; its z over the OSK, under the scanlines', () => {
    expect(tokens.get('--s2u-tip-arrow')).toBe('50%');
    expect(Number(tokens.get('--s2u-z-tip'))).toBeGreaterThan(Number(tokens.get('--s2u-z-osk')));
    expect(Number(tokens.get('--s2u-z-tip'))).toBeLessThan(Number(tokens.get('--s2u-z-scan')));
  });
  it.each([
    ['--s2u-text-strong', 4.5], ['--s2u-text', 4.5], ['--s2u-state-ready', 3],
  ])('%s on the slot\'s ready fill clears %s:1 (the title, label and icon; the status; the edge)', (fg, bar) => {
    expect(contrast(solid(fg), mixed('--s2u-slot-ready-fill'))).toBeGreaterThanOrEqual(bar);
  });
  it('text-dim on the ready fill fails 4.5:1, so the slot never sets it there (css.test.ts)', () => {
    expect(contrast(solid('--s2u-text-dim'), mixed('--s2u-slot-ready-fill'))).toBeLessThan(4.5);
  });
  it.each([
    ['--s2u-gold', '--s2u-ground-deep', 4.5], ['--s2u-text-strong', '--s2u-ground-deep', 4.5],
    ['--s2u-gold', '--s2u-panel', 4.5], ['--s2u-warn', '--s2u-panel', 4.5], ['--s2u-state-alert', '--s2u-panel', 3], ['--s2u-gold', '--s2u-highlight', 3],
    ['--s2u-text-strong', '--s2u-tab', 4.5], ['--s2u-gold-display', '--s2u-panel', 4.5], ['--s2u-text-dim', '--s2u-panel', 4.5],
    ['--s2u-warn', '--s2u-ground', 4.5], ['--s2u-focus', '--s2u-ground', 3], ['--s2u-gold', '--s2u-ground', 3],
  ])('%s on %s clears %s:1 (the slot\'s icon tile at rest and ready; its label, error and edges; the fact panel; the bar\'s error line; the tip; the ready rule)', (fg, bg, bar) => {
    expect(contrast(solid(fg, bg), solid(bg))).toBeGreaterThanOrEqual(bar);
  });
});

describe('1.5.0: the Console launcher tokens (the owner\'s design export of 2026-10-11, tokens.json 1.5.0), engineering tokens in base.css', () => {
  /* transcribed from the export's tokens.json 1.5.0 (color.tokens, layout.tokens, type.groups "Console"); tokens.json
     here stays the artifact's v1 file, so these are base.css's, prefixed like every other token */
  it('VERSION is at least 1.5.0 (additive: a minor bump)', () => {
    const [maj, min] = version.split('.').map(Number);
    expect(maj > 1 || (maj === 1 && min >= 5)).toBe(true);
  });
  it.each([
    ['--s2u-veil-strong', '#000e11f2', '--s2u-ground', 95], ['--s2u-veil', '#000e11cc', '--s2u-ground', 80], ['--s2u-veil-soft', '#000e1166', '--s2u-ground', 40],
    ['--s2u-veil-faint', '#000e1140', '--s2u-ground', 25], ['--s2u-veil-clear', '#000e1100', '--s2u-ground', 0],
    ['--s2u-row-veil', '#032326f2', '--s2u-tab', 95], ['--s2u-panel-veil', '#002933f2', '--s2u-panel', 95],
  ])('%s is %s: %s at %s per cent, never a new colour', (name, hex, of, pct) => {
    expect(tokens.get(name)).toBe(hex);
    const c = parseColor(hex), t = parseColor(resolve(tokens, of));
    expect([c.r, c.g, c.b]).toEqual([t.r, t.g, t.b]);
    expect(Math.abs(c.a - (pct as number) / 100)).toBeLessThanOrEqual(1 / 255);
  });
  it.each([
    ['--s2u-cx-safe-x', '6rem', 96], ['--s2u-cx-safe-y', '3.375rem', 54], ['--s2u-cx-header-h', '3.5rem', 56], ['--s2u-cx-legend-h', '4.5rem', 72],
    ['--s2u-cx-cat-pitch', '10.5rem', 168], ['--s2u-cx-row-h', '4.5rem', 72], ['--s2u-cx-key-h', '3.75rem', 60], ['--s2u-cx-list-w', '42.5rem', 680],
  ])('%s is %s (%s design px at 1rem = 16)', (name, rem, designPx) => {
    expect(tokens.get(name)).toBe(rem);
    expect(Number(rem.replace('rem', '')) * 16).toBe(designPx);
  });
  it('the safe areas are 5% of the 1920x1080 stage', () => {
    expect(Number(tokens.get('--s2u-cx-safe-x')!.replace('rem', '')) * 16).toBe(1920 * 0.05);
    expect(Number(tokens.get('--s2u-cx-safe-y')!.replace('rem', '')) * 16).toBe(1080 * 0.05);
  });
  it.each([
    ['cx-title', '800 4.5rem/0.95 var(--s2u-font-display)', 'italic', '0.02em'],
    ['cx-launch-title', '800 7.5rem/0.9 var(--s2u-font-display)', 'italic', '0.02em'],
    ['cx-cat', '500 1rem/1.2 var(--s2u-font-label)', 'normal', '0.18em'],
    ['cx-cat-current', '600 1.375rem/1.2 var(--s2u-font-label)', 'normal', '0.12em'],
    ['cx-item-title', '500 1.5rem/1.2 var(--s2u-font-label)', 'normal', '0.06em'],
    ['cx-item-title-focused', '600 1.875rem/1.2 var(--s2u-font-label)', 'normal', '0.06em'],
    ['cx-body', '400 1.375rem/1.4 var(--s2u-font-body)', 'normal', '0'],
    ['cx-sub', '400 1.125rem/1.35 var(--s2u-font-body)', 'normal', '0'],
    ['cx-prompt', '600 1.125rem/1 var(--s2u-font-label)', 'normal', '0.1em'],
    ['cx-caption', '500 1rem/1.2 var(--s2u-font-label)', 'normal', '0.18em'],
    ['cx-figure', '500 4.5rem/1 var(--s2u-font-mono)', 'normal', '0'],
  ])('the Console type role %s, in the generator\'s three tokens', (n, type, italic, tracking) => {
    expect(tokens.get(`--s2u-type-${n}`)).toBe(type);
    expect(tokens.get(`--s2u-italic-${n}`)).toBe(italic);
    expect(tokens.get(`--s2u-tracking-${n}`)).toBe(tracking);
  });
  /* the contrast table over the art: a veil composited over pure white (the worst picture) and pure black */
  const over = (veil: string, art: string) => composite(parseColor(resolve(tokens, veil)), parseColor(art));
  const TEXT = ['--s2u-gold', '--s2u-gold-display', '--s2u-text', '--s2u-text-strong', '--s2u-text-dim', '--s2u-warn'];
  const MARKS = ['--s2u-state-ready', '--s2u-focus', '--s2u-glyph-cross', '--s2u-glyph-square', '--s2u-glyph-triangle'];
  const VEIL_PAIRS: [string, string, string, number][] = [];
  for (const veil of ['--s2u-row-veil', '--s2u-panel-veil', '--s2u-veil-strong']) for (const art of ['#ffffff', '#000000']) {
    for (const fg of TEXT) VEIL_PAIRS.push([fg, veil, art, 4.5]);
    for (const fg of MARKS) VEIL_PAIRS.push([fg, veil, art, 3]);
  }
  it.each(VEIL_PAIRS)('%s on %s over %s art clears %s:1', (fg, veil, art, bar) => {
    expect(contrast(solid(fg), over(veil, art))).toBeGreaterThanOrEqual(bar);
  });
  it('the export\'s own figures: on row-veil over white art text-dim clears 4.9 and gold 5.5; on panel-veil text-dim 4.5', () => {
    expect(contrast(solid('--s2u-text-dim'), over('--s2u-row-veil', '#ffffff'))).toBeGreaterThanOrEqual(4.9);
    expect(contrast(solid('--s2u-gold'), over('--s2u-row-veil', '#ffffff'))).toBeGreaterThanOrEqual(5.5);
    expect(contrast(solid('--s2u-text-dim'), over('--s2u-panel-veil', '#ffffff'))).toBeGreaterThanOrEqual(4.5);
  });
  it('text-strong on highlight (a selected room, the focused roller\'s value, a focused key) clears 4.5:1', () => {
    expect(contrast(solid('--s2u-text-strong'), solid('--s2u-highlight'))).toBeGreaterThanOrEqual(4.5);
  });
  it('the plain veil carries no text by design: text-dim on it over white art fails, so text there sits on a row or panel veil', () => {
    expect(contrast(solid('--s2u-text-dim'), over('--s2u-veil', '#ffffff'))).toBeLessThan(4.5);
  });
});

/**
 * 2.3.0: the launcher redesign's look (LR-1 of socomlegacy/docs/plans/2026-10-26-launcher-redesign.md; LR.R8: every
 * colour a --s2u-* token). Engineering tokens in base.css's first :root block, as 1.5.0's are, because tokens.json stays
 * the artifact's v1 file. The values are the owner's Claude Design artifact's (socomlegacy/docs/specs/launcher-redesign/
 * S2-Launcher-v2.dc.html: its THEMES table and its inline colours), transcribed as hex. A browser adaptation.
 */
describe('2.3.0: the launcher redesign tokens (LR-1; the artifact\'s THEMES and palette), engineering tokens in base.css', () => {
  it('VERSION is at least 2.3.0 (additive: a minor bump)', () => {
    const [maj, min] = version.split('.').map(Number);
    expect(maj > 2 || (maj === 2 && min >= 3)).toBe(true);
  });
  it.each([
    ['--s2u-lx-accent', '#f2b43a'], ['--s2u-lx-accent-hi', '#ffd27a'], ['--s2u-lx-on-accent', '#140d02'],
    ['--s2u-lx-ink', '#eef2f5'], ['--s2u-lx-ink-hi', '#f4f7f9'], ['--s2u-lx-good', '#8fd3a0'], ['--s2u-lx-bad', '#ff8a7a'],
    ['--s2u-lx-section', '#6fb6e0'], ['--s2u-lx-panel', '#02060aeb'], ['--s2u-lx-panel-from', '#02080e73'],
    ['--s2u-lx-toast', '#02080eeb'], ['--s2u-lx-edge', '#3ca0dc24'], ['--s2u-lx-ring-ground', '#03080d'], ['--s2u-lx-meter', '#3a9ad6'],
  ])('the palette role %s is the artifact\'s %s', (name, hex) => {
    expect(baseRoot).toContain(`${name}: ${hex};`);
    expect(() => parseColor(resolve(tokens, name))).not.toThrow();
  });
  /* the artifact's THEMES: top, bot, line (the sheets' rgb), glow (the radial light's rgb), gold (the gold trim line) */
  const THEMES: [string, string, string, string, string, boolean][] = [
    ['navy-gold', '#03080e', '#000000', '#2692d4', '#1060a0', true],
    ['deep-water', '#04172a', '#01050a', '#46afeb', '#146eb4', false],
    ['blackout', '#030405', '#000000', '#6e8296', '#1e2832', true],
    ['night-ops', '#0b1622', '#02050a', '#82c3eb', '#1e5078', false],
    ['jungle', '#131c0f', '#030503', '#afcd7d', '#32501e', true],
    ['desert', '#21170c', '#060402', '#ebb973', '#6e4614', false],
    ['frost', '#17222c', '#05080c', '#cde4f8', '#3c5a78', false],
  ];
  it.each(THEMES)('the theme %s: sky %s to %s, sheets %s, glow %s, gold trim %s', (id, top, bottom, sheet, glow, gold) => {
    expect(tokens.get(`--s2u-lx-theme-${id}-top`)).toBe(top);
    expect(tokens.get(`--s2u-lx-theme-${id}-bottom`)).toBe(bottom);
    expect(tokens.get(`--s2u-lx-theme-${id}-sheet`)).toBe(sheet);
    expect(tokens.get(`--s2u-lx-theme-${id}-glow`)).toBe(glow);
    expect(tokens.get(`--s2u-lx-theme-${id}-trim`)).toBe(gold ? 'var(--s2u-lx-accent)' : 'transparent');
  });
  it('the live theme tokens default to Navy & Gold (the artifact\'s default)', () => {
    for (const k of ['top', 'bottom', 'sheet', 'glow', 'trim']) expect(tokens.get(`--s2u-lx-${k === 'top' ? 'sky-top' : k === 'bottom' ? 'sky-bottom' : k}`)).toBe(`var(--s2u-lx-theme-navy-gold-${k})`);
  });
  it('the artifact\'s motion: the slide 450ms, the fade 350ms, an item 380ms on its overshoot; each 0s under reduced motion', () => {
    expect(tokens.get('--s2u-dur-lx-slide')).toBe('450ms');
    expect(tokens.get('--s2u-dur-lx-fade')).toBe('350ms');
    expect(tokens.get('--s2u-dur-lx-item')).toBe('380ms');
    expect(tokens.get('--s2u-ease-lx-pop')).toBe('cubic-bezier(0.2, 0.9, 0.25, 1.08)');
    expect(tokens.get('--s2u-ease')).toBe('cubic-bezier(0.2, 0.7, 0.2, 1)');
    const reduced = /@media \(prefers-reduced-motion: reduce\)\s*{[^{]*?:root\s*{([^}]*)}/.exec(base)?.[1] ?? '';
    for (const t of ['--s2u-dur-lx-slide', '--s2u-dur-lx-fade', '--s2u-dur-lx-item']) expect(reduced, t).toContain(`${t}: 0s`);
  });
  it('the radii the artifact draws: a row\'s and a key\'s 4px, a check tile\'s 10px', () => {
    expect(tokens.get('--s2u-radius-lx-row')).toBe('4px');
    expect(tokens.get('--s2u-radius-lx-tile')).toBe('10px');
  });
  /* the panel and the toast are translucent: composited over every theme's sky (the darkest the canvas draws there is
     its top; the lit sheets sit lower) and over white (the worst picture behind, the Crossroads option) */
  const TEXT = ['--s2u-lx-ink', '--s2u-lx-ink-hi', '--s2u-lx-accent', '--s2u-lx-accent-hi', '--s2u-lx-good', '--s2u-lx-bad', '--s2u-lx-section'];
  const PANEL_PAIRS: [string, string, string][] = [];
  for (const veil of ['--s2u-lx-panel', '--s2u-lx-toast']) for (const sky of [...THEMES.map((t) => t[1]), '#ffffff']) for (const fg of TEXT) PANEL_PAIRS.push([fg, veil, sky]);
  it.each(PANEL_PAIRS)('%s on %s over %s clears 4.5:1', (fg, veil, sky) => {
    const bg = composite(parseColor(resolve(tokens, veil)), parseColor(sky));
    expect(contrast(solid(fg), bg)).toBeGreaterThanOrEqual(4.5);
  });
  it('the label on the gold (a focused chip, Deploy) clears 4.5:1, and the gold on the check ring\'s ground', () => {
    expect(contrast(solid('--s2u-lx-on-accent'), solid('--s2u-lx-accent'))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(solid('--s2u-lx-on-accent'), solid('--s2u-lx-accent-hi'))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(solid('--s2u-lx-accent'), solid('--s2u-lx-ring-ground'))).toBeGreaterThanOrEqual(4.5);
  });
});
