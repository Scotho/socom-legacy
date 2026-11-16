import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ico, P } from '../../src/console/icons';

/**
 * RV2-04 (the replay viewer redesign, RV2.R4; `docs/plans/2026-11-02-replay-viewer-redesign.md` §2 "Tokens and classes"):
 * the player's replay viewer is drawn by the console's sheets -- `src/console/console.css` and the viewer's own
 * `src/console/replay.css`, which the Watch adapter loads -- on the design system's tokens only (part G's guards, CX.R4,
 * CX.R7): no `--mu-*` token and no `.mur*` class in the console's sheets, every colour in the viewer's sheet a `--s2u-*`
 * token (or `transparent`, `currentColor`, `inherit`, a `color-mix` of those), the one gold the launcher's
 * `--s2u-lx-accent` (LR.R14). The camera strip's and the spectator's `eye` is drawn in the console's own set, on its grid
 * and stroke (LR.R9). A browser adaptation (OT.R53, product track).
 */
const here = dirname(fileURLToPath(import.meta.url));
const CONSOLE = resolve(here, '../../src/console');
const sheet = (name: string): string => readFileSync(resolve(CONSOLE, name), 'utf-8');
const bare = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '');

/** Each declaration's property and value, comments taken out. */
function declarations(css: string): { prop: string; value: string }[] {
  const out: { prop: string; value: string }[] = [];
  for (const block of bare(css).matchAll(/\{([^{}]*)\}/g)) {
    for (const d of block[1]!.split(';')) {
      const i = d.indexOf(':');
      if (i > 0) out.push({ prop: d.slice(0, i).trim(), value: d.slice(i + 1).trim() });
    }
  }
  return out;
}

/** A colour literal: hex, a colour function, or a named colour other than the keywords the guard allows. */
const LITERAL = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(|\b(?:white|black|red|green|blue|gold|gray|grey|silver|orange|yellow|cyan|teal|navy)\b/i;
const COLOUR_PROPS = /^(?:color|background(?:-color)?|border(?:-(?:top|right|bottom|left|block|inline))?(?:-color)?|outline(?:-color)?|box-shadow|text-shadow|fill|stroke|caret-color|accent-color|text-decoration-color|column-rule-color)$/;

describe('RV2-04: the replay viewer on the console\'s sheets', () => {
  it('the viewer\'s sheet exists and the Watch adapter loads it with the viewer', () => {
    expect(existsSync(resolve(CONSOLE, 'replay.css'))).toBe(true);
    expect(sheet('adapters/replays.ts')).toMatch(/^import '\.\.\/replay\.css';$/m);
  });

  it('no --mu- token and no .mur class in the console\'s sheets (console.css, replay.css)', () => {
    for (const name of ['console.css', 'replay.css']) {
      const css = bare(sheet(name));
      expect(css, name).not.toMatch(/--mu-/);
      expect(css, name).not.toMatch(/\.mur\b|\.mur[-_]/);
      expect(css, name).not.toMatch(/\[data-modern\]/);
    }
  });

  it('every colour of the viewer\'s sheet is a --s2u-* token: no literal, no var() but --s2u-* or the page\'s --cx-*', () => {
    const css = bare(sheet('replay.css'));
    const colours = declarations(css).filter((d) => COLOUR_PROPS.test(d.prop));
    expect(colours.length).toBeGreaterThan(10);
    expect(colours.filter((d) => LITERAL.test(d.value)).map((d) => `${d.prop}: ${d.value}`)).toEqual([]);
    for (const m of css.matchAll(/var\(\s*(--[\w-]+)/g)) expect(m[1], m[1]).toMatch(/^--(?:s2u|cx)-/);
    // The sheet declares no custom property of its own: the console's token guard reads declarations from console.css
    // and shared/ds alone (`./tokens.test.ts`).
    expect([...css.matchAll(/(^|[;{\s])(--[\w-]+)\s*:/g)].map((m) => m[2])).toEqual([]);
  });

  it('the one gold is the launcher\'s accent (LR.R14): no other gold token in the viewer\'s sheet', () => {
    const css = bare(sheet('replay.css'));
    expect(css).toMatch(/var\(--s2u-lx-accent\)/);
    expect(css).not.toMatch(/var\(--s2u-gold[\w-]*\)/);
  });

  it('the rules are the console\'s: every selector under :root[data-console] [data-cx-viewer]', () => {
    const css = bare(sheet('replay.css'));
    const selectors = [...css.matchAll(/(?:^|\})\s*([^{}@]+?)\s*\{/g)].map((m) => m[1]!.trim()).filter((s) => s && !/^(?:from|to|\d+%)$/.test(s));
    expect(selectors.length).toBeGreaterThan(10);
    /** A selector list's members: split at the commas outside any parentheses (`:is(a, b)`, `:not(a, b)` stay whole). */
    const members = (list: string): string[] => {
      const out: string[] = [];
      let depth = 0, from = 0;
      for (let i = 0; i < list.length; i++) {
        const c = list[i];
        if (c === '(') depth++;
        else if (c === ')') depth--;
        else if (c === ',' && depth === 0) { out.push(list.slice(from, i)); from = i + 1; }
      }
      return [...out, list.slice(from)];
    };
    for (const group of selectors) for (const s of members(group)) expect(s.trim(), s).toMatch(/^:root\[data-console\](?:\[[^\]]+\])* \[data-cx-viewer\]/);
  });

  // RVK polish (v0.4.21; the rendered keys list over the world, pv13_keys_list.png: the camera strip, the score pill and the
  // round clock read through its rows): the keys list's panel is opaque, on the console's own surface for a box laid over
  // content -- the dropup's (console.css `.cx-dropup`: the launcher's panel over the ring ground), never the ground at an
  // alpha. The HUD's chips stay translucent on purpose. A browser adaptation (OT.R53, product track).
  it('RVK polish: the keys list\'s panel is opaque -- the console dropup\'s surface, no transparent, no color-mix', () => {
    const block = (css: string, selector: RegExp): string => {
      const m = css.match(selector);
      expect(m, String(selector)).not.toBeNull();
      return m![1]!;
    };
    const backgroundOf = (body: string): string => declarations(`{${body}}`).filter((d) => d.prop === 'background').map((d) => d.value).join(' | ');
    const panel = backgroundOf(block(bare(sheet('replay.css')), /\.cx-replay__keys-panel\s*\{([^{}]*)\}/));
    const dropup = backgroundOf(block(bare(sheet('console.css')), /:root\[data-console\] \.cx-dropup\s*\{([^{}]*)\}/));
    expect(panel).not.toMatch(/transparent|color-mix/);
    expect(dropup).toBe('linear-gradient(var(--s2u-lx-panel), var(--s2u-lx-panel)), var(--s2u-lx-ring-ground)');
    expect(panel).toBe(dropup);
  });

  it('the console\'s set has the eye (the free camera, a spectator), on its grid with no fill of its own', () => {
    expect(P.eye).toBeTruthy();
    expect(P.eye).not.toMatch(/fill=|stroke=|style=|<image|href/);
    for (const v of [...P.eye.replace(/r="[^"]*"/g, '').matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0]))) {
      expect(v).toBeGreaterThanOrEqual(-24);
      expect(v).toBeLessThanOrEqual(24);
    }
    expect(ico('eye')).toBe(`<svg class="cx-ico " viewBox="0 0 24 24" aria-hidden="true">${P.eye}</svg>`);
  });
});
