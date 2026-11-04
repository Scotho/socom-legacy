import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The modern UI's sheets, read as text (jsdom lays nothing out). Kept from `launcher.test.ts` (MU-8a 4: one focus ring,
 * the press states and reduced motion) and `launcherChrome.test.ts` (the controller's Buttons panel at 320px) when
 * CX-9b (CX.R8, the owner, 2026-10-12: the old layout disposed of, its plumbing kept where useful) deleted those files
 * with `src/modern/launcher.ts` and its sheet: these cases hold the modern sections' own sheets. CX-27 (the console
 * plan): the settings views' cards' rules (`src/startup.css`; their view retired with CX-26) are retired, no live markup
 * drawing them, and with them the controller's Buttons panel at 320px: its two cases (the panel's `.startup-fields`
 * zero floor; the `.pad-bindings` grid and each `.pad-binding` shrinking) are not carried -- the console's Buttons
 * screen is part G's rows (`.cx-item`, `.cx-roller`; `src/console/render/remap.ts`, `test/console/remap.test.ts`).
 * A browser adaptation (MU.R1).
 */
const here = dirname(fileURLToPath(import.meta.url));
const css = (rel: string): string => readFileSync(resolve(here, '../../src', rel), 'utf8');
/** The shell's sheets, read as `launcher.test.ts` read them. */
const shellRules = (text: string): { sel: string; body: string }[] =>
  [...text.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ sel: m[1]!.trim(), body: m[2]! }));

describe('one focus ring, the press states and reduced motion (MU-8a 4)', () => {
  const tokens = css('modern/tokens.css');
  it('the modern UI\'s ring is one rule over the design system\'s focus tokens', () => {
    const all = [...shellRules(tokens), ...shellRules(css('modern/modern.css'))];
    const rings = all.filter((r) => /(^|;|\s)outline\s*:/.test(r.body) && !/outline\s*:\s*none/.test(r.body));
    expect(rings.map((r) => r.sel)).toHaveLength(1);
    expect(rings[0]!.sel).toMatch(/\[data-modern\][\s\S]*:focus-visible[\s\S]*\.is-pad-focused/);
    expect(tokens).toMatch(/--mu-focus-ring\s*:\s*var\(--s2u-focus-w\) solid var\(--mu-focus\)/);
    expect(tokens).toMatch(/--mu-focus-offset\s*:\s*var\(--s2u-focus-offset\)/);
  });
  it('the stand-ins read the design system\'s names where 1.1.0 has them (MU.R19); the rail\'s and hints\' are gone', () => {
    for (const [mu, ds] of [['surface-raised', 'surface-raised'], ['surface-card', 'surface-card'], ['surface-hover', 'surface-hover'],
      ['surface-active', 'surface-active'], ['live', 'state-live'], ['ready', 'state-ready'], ['wait', 'state-wait'], ['alert', 'state-alert'],
      ['icon', 'icon-20'], ['icon-large', 'icon-40'], ['surface', 'scrim']] as const) {
      expect(tokens, mu).toMatch(new RegExp(`--mu-${mu}\\s*:\\s*var\\(--s2u-${ds}\\)`));
    }
    expect(tokens).not.toMatch(/--mu-(rail-w|glyph-cross|type-hint|tracking-hint)\s*:/);
    expect(css('modern/modern.css')).not.toMatch(/\.mu-sr\b/);
  });
  it('every transition of the shell runs on the motion tokens, and reduced motion sets them to zero', () => {
    for (const r of shellRules(css('modern/modern.css')).filter((x) => /transition\s*:/.test(x.body) && !/transition\s*:\s*none/.test(x.body))) {
      const durations = r.body.match(/transition\s*:([^;]*)/)![1]!;
      expect(durations, r.sel).not.toMatch(/\d(m?s)\b/);
    }
    const reduce = tokens.slice(tokens.indexOf('prefers-reduced-motion'));
    expect(reduce).toMatch(/--mu-fast\s*:\s*0s/);
    expect(reduce).toMatch(/--mu-base\s*:\s*0s/);
  });
});
