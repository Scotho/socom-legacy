import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * MU2-8 (the modern UI polish plan, row MU2-8; MU.R19: the design system's tokens, never a raw value where one exists):
 * a scan of every sheet under `src/modern/` -- no raw `rem`; no colour literal (`#hex`, `rgb()`, `hsl()`); an opacity
 * only a token or the ends of a fade (0, 1); a space (`gap`, `margin`, `padding`) never a raw px the system names
 * (`--s2u-space-*`: 4, 8, 12, 16, 24, 32, 48px), a corner never a raw px the system names (`--s2u-radius-viewer` 6px), a
 * duration never a raw time the system names (`--s2u-dur-fast` 120ms, `-base` 200ms, `-signature` 360ms, `-slow` 600ms).
 * A value inside a `var()` fallback is the token's stand-in, not a raw value. And the motion: every sheet that animates
 * stops or shortens it under `prefers-reduced-motion: reduce`, and every transition runs on the motion tokens (which
 * `./tokens.css` zeroes under it).
 */
const ROOT = resolve(import.meta.dirname, '../../src/modern');
const sheets = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? sheets(p) : p.endsWith('.css') ? [p] : [];
});
const FILES = sheets(ROOT);
const strip = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '');
/** A declaration's value without its `var(--x, fallback)` fallbacks (nested ones too). */
const noFallbacks = (v: string): string => { let out = v, was = ''; while (out !== was) { was = out; out = out.replace(/var\((--[\w-]+)\s*,[^()]*\)/g, 'var($1)'); } return out; };
const declarations = (css: string): { prop: string; value: string }[] =>
  [...strip(css).matchAll(/(?:^|[;{])\s*([a-z-]+)\s*:\s*([^;{}]+)/g)].map((m) => ({ prop: m[1]!, value: noFallbacks(m[2]!.trim()) }));
const SPACE_PX = new Set([4, 8, 12, 16, 24, 32, 48]);
const RADIUS_PX = new Set([6]);
const DURATIONS_MS = new Set([120, 200, 360, 600]);
const ms = (n: string, unit: string): number => (unit === 's' ? Number(n) * 1000 : Number(n));

describe('the modern UI\'s sheets speak in tokens where the design system has one (MU2-8)', () => {
  // CX-25: five sheets went with the modern shell's sections (signIn, home, news, launch, settings); eight stayed. CX-26:
  // three more went with their panels' remainder (agreement, logoff, osk); five stay.
  it('finds the sheets', () => { expect(FILES.length).toBeGreaterThanOrEqual(5); });
  it.each(FILES.map((f) => [relative(ROOT, f), f]))('%s', (_name, file) => {
    const css = readFileSync(file, 'utf-8');
    const bad: string[] = [];
    if (/\d(?:\.\d+)?rem\b/.test(strip(css))) bad.push('a raw rem');
    for (const { prop, value } of declarations(css)) {
      if (/#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?)\(/i.test(value)) bad.push(`${prop}: ${value} (a colour literal)`);
      if (prop === 'opacity' && !/^(?:var\(--[\w-]+\)|0|1)$/.test(value)) bad.push(`opacity: ${value}`);
      if (/^(?:gap|row-gap|column-gap|margin|margin-[a-z-]+|padding|padding-[a-z-]+)$/.test(prop)) {
        for (const m of value.matchAll(/(?<![\w.-])(\d+(?:\.\d+)?)px/g)) if (SPACE_PX.has(Number(m[1]))) bad.push(`${prop}: ${value} (${m[1]}px is a --s2u-space token)`);
      }
      if (/radius$/.test(prop)) for (const m of value.matchAll(/(?<![\w.-])(\d+(?:\.\d+)?)px/g)) if (RADIUS_PX.has(Number(m[1]))) bad.push(`${prop}: ${value} (the radius token)`);
      if (/^(?:transition|transition-duration|animation|animation-duration|animation-delay|transition-delay|--[\w-]*dur[\w-]*)$/.test(prop)) {
        for (const m of value.matchAll(/(?<![\w.-])(\d*\.?\d+)(ms|s)\b/g)) if (DURATIONS_MS.has(ms(m[1]!, m[2]!))) bad.push(`${prop}: ${value} (a --s2u-dur token)`);
      }
    }
    expect(bad).toEqual([]);
  });
});

describe('the motion honours prefers-reduced-motion (MU2-8)', () => {
  it.each(FILES.map((f) => [relative(ROOT, f), f]))('%s', (_name, file) => {
    const css = strip(readFileSync(file, 'utf-8'));
    const animates = /(?:^|[;{\s])animation\s*:\s*(?!none)/.test(css);
    if (animates) expect(css, 'an animating sheet has a reduced-motion block').toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
    // The one sanctioned exception, the in-game overlay's open and close (OT.R60 (e), `../../src/modern/overlay/motion.ts`):
    // its ramps run on its own product-track constants (`OVERLAY_*_MS_ADAPTATION`), written by the module as
    // `--mu-overlay-ramp-ms`, `--mu-ovp-ms` and `--mu-ovl-ms` (0ms unset), and it honours reduced motion itself -- an
    // opacity fade, no rise or stagger, a shorter ramp (`overlayRamp(..., reduced)`, held below and in overlayMotion).
    const own = /overlay[\\/]overlay\.css$/.test(file) ? '|mu-overlay-ramp-ms|mu-ovp-ms|mu-ovl-ms' : '';
    const tokens = new RegExp(`var\\(--(?:mu-fast|mu-base|s2u-dur-[a-z]+${own})\\)`);
    for (const { prop, value } of declarations(css)) {
      if (prop !== 'transition' || value === 'none') continue;
      for (const part of value.split(',')) expect(part, `${prop}: ${value}`).toMatch(tokens);
    }
  });
  it('the overlay\'s own ramps honour reduced motion (the exception above)', () => {
    const index = readFileSync(resolve(ROOT, 'overlay/index.ts'), 'utf-8');
    const motion = readFileSync(resolve(ROOT, 'overlay/motion.ts'), 'utf-8');
    expect(index).toMatch(/matchMedia\?\.\('\(prefers-reduced-motion: reduce\)'\)/);
    expect(motion).toMatch(/export function overlayRamp\([^)]*reduced: boolean\)/);
    expect(motion).toMatch(/if \(reduced\)/);
  });
  it('the motion tokens run in no time under reduced motion (./tokens.css)', () => {
    const tokens = strip(readFileSync(resolve(ROOT, 'tokens.css'), 'utf-8'));
    const block = /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*{([\s\S]*?})\s*}/.exec(tokens)?.[1] ?? '';
    expect(block).toMatch(/--mu-fast:\s*0s/);
    expect(block).toMatch(/--mu-base:\s*0s/);
  });
});
