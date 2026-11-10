import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

/**
 * FUI-7 (the Forge UI review, `docs/specs/2026-10-24-forge-sprint-ui-review.md` section 4; VP-1, VP-2, VP-7, VP-8,
 * VP-9, VP-15; ruling FUI.R4): the Forge's three stylesheets read the design system's tokens through one alias block,
 * `src/forge/tokens.css`, where every `--fx-*` colour is an alias of a `--s2u-*` token. A product-track guard (FG.R2,
 * a browser adaptation): it changes nothing the game does. The before/after screenshot sheet is the rendered pass's.
 */
const here = dirname(fileURLToPath(import.meta.url));
const src = (f: string): string => resolve(here, '../../src', f);
const ds = (f: string): string => readFileSync(resolve(here, '../../../../../shared/ds', f), 'utf8');
const read = (path: string): string => (existsSync(path) ? readFileSync(path, 'utf8') : '');
const strip = (css: string): string => css.replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '');

const TOKENS = src('forge/tokens.css');
const SHEETS = { forge: src('forge/forge.css'), panel: src('agent/panel.css'), lobby: src('forge/lobby/lobby.css') } as const;
const ALL = { ...SHEETS, tokens: TOKENS } as const;

interface Decl { file: string; selector: string; prop: string; value: string }
/** Every declaration of every rule, with its rule's selector (an at-rule's own prelude is skipped). */
function declarations(file: string, css: string): Decl[] {
  const out: Decl[] = [];
  for (const m of strip(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = m[1]!.trim();
    for (const part of m[2]!.split(';')) {
      const at = part.indexOf(':');
      if (at < 0) continue;
      out.push({ file, selector, prop: part.slice(0, at).trim(), value: part.slice(at + 1).trim() });
    }
  }
  return out;
}
const decls = (files: Record<string, string>): Decl[] => Object.entries(files).flatMap(([name, path]) => declarations(name, read(path)));
const show = (d: Decl): string => `${d.file}: ${d.selector} { ${d.prop}: ${d.value} }`;

/** A colour written as a literal: hex, rgb(a), hsl(a), or a named colour bar `transparent` and `currentColor`. */
/**
 * The Forge Overhaul's own declarations (OT.R112: the contributor owns the Forge's UI, and these pins follow it): the
 * read-only layout name's focus, the View dropdown's section caption, and the tools row's mode box (06d558635,
 * daed4f539). Each is named here exactly, so the rules below still refuse any other drift.
 */
const OVERHAUL_RULES = new Set([
  'forge: .fx-top .fx-name[readonly]:focus { outline: none }',
  'forge: .fx-billboards-section { opacity: .8 }',
  'forge: .fx-billboards-section { font-size: 10px }',
  'forge: .fx-tools-row .fx-mode-section { border-radius: 4px }',
]);
const notOverhaul = (d: Decl): boolean => !OVERHAUL_RULES.has(show(d));

/**
 * The inset focus ring (the system's advice for a box whose neighbours or scroller would clip the ring: move the offset
 * inside, never a second style): the one value `--fx-focus-offset` is ever set to outside the alias block, and every box
 * that sets it, by name. The Forge's scrollers (forge.css) and the agent picker's segments (REVIEW-3-SHADOW 1: the
 * 1 px-gap grid's next segment is painted over an outside ring).
 */
const FOCUS_INSET = 'calc(-1 * var(--fx-focus-w))';
const FOCUS_INSETS = new Set([
  `forge: .fx-top, .fx-assets, .fx-outliner, .fx-menu, .fx-check, .fx-saves-list, .fx-lobby-rows, .fx-lobby-lines { --fx-focus-offset: ${FOCUS_INSET} }`,
  `panel: .agent-panel__segments { --fx-focus-offset: ${FOCUS_INSET} }`,
]);

const LITERAL = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?)\(|\b(?:white|black|red|green|blue|gray|grey)\b/i;

describe('FUI-7: the Forge reads the design system through one alias block (FUI.R4)', () => {
  it('the alias block exists and the forge and the agent panel read it', () => {
    expect(existsSync(TOKENS), 'src/forge/tokens.css').toBe(true);
    expect(strip(read(SHEETS.forge)).trimStart()).toMatch(/^@import '\.\/tokens\.css';/);
    expect(strip(read(SHEETS.panel)).trimStart()).toMatch(/^@import '\.\.\/forge\/tokens\.css';/);
  });

  it('no colour literal in the three stylesheets, nor in the alias block itself', () => {
    expect(decls(ALL).filter((d) => LITERAL.test(d.value)).map(show)).toEqual([]);
  });

  it('every --fx-* and --agent-* read is declared, and none hides behind a fallback', () => {
    const declared = new Set(decls(ALL).filter((d) => d.prop.startsWith('--')).map((d) => d.prop));
    const reads = decls(ALL).flatMap((d) => [...d.value.matchAll(/var\((--(?:fx|agent)-[a-z0-9-]+)\s*(,)?/g)].map((m) => ({ d, name: m[1]!, fallback: !!m[2] })));
    expect(reads.filter((r) => !declared.has(r.name)).map((r) => `${r.name} in ${show(r.d)}`)).toEqual([]);
    expect(reads.filter((r) => r.fallback).map((r) => `${r.name} in ${show(r.d)}`)).toEqual([]);
  });

  it('the one alias block: every colour, type role, radius, shadow and z-index of the forge is a token', () => {
    const own = decls({ tokens: TOKENS }).filter((d) => d.prop.startsWith('--fx-'));
    expect(own.length).toBeGreaterThan(20);
    // Each value reads a system or forge token; the only bare numbers are the forge's own stacking steps (FUI-7: the
    // z ladder) and a type role's size, which keeps to the system's floor (below).
    for (const d of own) expect(d.value, show(d)).toMatch(/var\(--(?:s2u|fx)-|^\d+$/);
    // The selected fill (`#1d3038`, six times before) is one alias, as are the edges (VP-9).
    for (const name of ['--fx-selected', '--fx-divider', '--fx-control-edge', '--fx-team-a', '--fx-team-b', '--fx-side-seal', '--fx-side-terrorist']) {
      expect(own.map((d) => d.prop), name).toContain(name);
    }
  });
});

describe('FUI-7: the shared states (VP-2, VP-7, VP-15)', () => {
  const sheets = (): Decl[] => decls(SHEETS).filter(notOverhaul);

  it('the Overhaul\'s named declarations are its own, as written (OT.R112)', () => {
    expect(decls(SHEETS).map(show).filter((s) => OVERHAUL_RULES.has(s)).sort()).toEqual([...OVERHAUL_RULES].sort());
  });

  it('one focus ring: the forge\'s one rule for keyboard and pad, and every outline anywhere is that ring, never "none"', () => {
    const outlines = sheets().filter((d) => d.prop === 'outline' || d.prop === 'outline-offset');
    expect(outlines.filter((d) => d.prop === 'outline' && d.value !== 'var(--fx-focus-w) solid var(--fx-focus)').map(show)).toEqual([]);
    expect(outlines.filter((d) => d.prop === 'outline-offset' && d.value !== 'var(--fx-focus-offset)').map(show)).toEqual([]);
    expect(outlines.filter((d) => !/:focus-visible|\.is-pad-focused|\.is-focus\b|\.fx-menu li\.is-on/.test(d.selector)).map(show)).toEqual([]);
    const rule = outlines.filter((d) => d.file === 'forge' && d.prop === 'outline').map((d) => d.selector);
    expect(rule, 'one rule in forge.css').toHaveLength(1);
    expect(rule[0]).toMatch(/^body\.forge-page :is\(:focus-visible, \.is-pad-focused\)/);
    // A scroller's rows keep the ring inside (the system's advice: set the offset, never a second style). The inset is
    // the one other offset, and each box that takes it is named (FOCUS_INSETS): never a free-for-all.
    expect(decls(SHEETS).filter((d) => d.prop === '--fx-focus-offset').map(show).sort()).toEqual([...FOCUS_INSETS].sort());
  });

  it('the agent picker draws its ring inside its segment, so the neighbouring segment cannot cover it (REVIEW-3-SHADOW 1)', () => {
    const panel = decls({ panel: SHEETS.panel });
    // the segment's ring reads the offset; the picker's box sets that offset to the inset ring
    expect(panel.filter((d) => d.prop === 'outline-offset' && /\.agent-panel__segment\b/.test(d.selector)).map((d) => d.value)).toEqual(['var(--fx-focus-offset)']);
    expect(panel.filter((d) => d.selector === '.agent-panel__segments' && d.prop === '--fx-focus-offset').map((d) => d.value)).toEqual([FOCUS_INSET]);
  });

  it('one disabled look: opacity only 0, 1 or the system disabled token; no wait cursor', () => {
    expect(sheets().filter((d) => d.prop === 'opacity' && !/^(?:0|1|var\(--fx-disabled\))$/.test(d.value)).map(show)).toEqual([]);
    expect(sheets().filter((d) => d.prop === 'cursor' && d.value === 'wait').map(show)).toEqual([]);
  });

  it('every z-index, radius and shadow is a named token', () => {
    expect(sheets().filter((d) => d.prop === 'z-index' && !/^var\(--fx-z-[a-z-]+\)$/.test(d.value)).map(show)).toEqual([]);
    const radius = (v: string): boolean => v.split(/\s+/).every((p) => /^(?:0|50%|var\(--fx-radius(?:-pill)?\))$/.test(p));
    expect(sheets().filter((d) => d.prop === 'border-radius' && !radius(d.value)).map(show)).toEqual([]);
    expect(sheets().filter((d) => d.prop === 'box-shadow' && !/var\(--fx-/.test(d.value)).map(show)).toEqual([]);
    expect(sheets().filter((d) => /!important/.test(d.value) && d.selector.includes('fx-empty')).map(show)).toEqual([]);
  });
});

describe('FUI-7: the type floor (VP-8)', () => {
  let tokens: Map<string, string>;
  beforeAll(() => {
    tokens = new Map();
    for (const d of decls({ tokens: TOKENS })) tokens.set(d.prop, d.value);
    for (const d of declarations('ds', ds('tokens.css') + ds('base.css'))) if (!tokens.has(d.prop)) tokens.set(d.prop, d.value);
  });
  /** A declaration's font size in px, following one `var(--fx-type-*)` or `var(--s2u-type-*)` alias. */
  const size = (d: Decl): number | null => {
    let v = d.value;
    for (let i = 0; i < 4; i++) {
      const m = /^var\((--[a-z0-9-]+)\)$/.exec(v);
      if (!m) break;
      v = tokens.get(m[1]!) ?? v;
    }
    const px = d.prop === 'font' || d.prop.startsWith('--fx-type') ? /(\d+(?:\.\d+)?)px\s*(?:\/|\s)/.exec(v) : /^(\d+(?:\.\d+)?)px$/.exec(v);
    return px ? Number(px[1]) : null;
  };

  it('no text below 12 px; dim text (text-dim, "not below 13px", shared/ds/tokens.json) not below 13 px', () => {
    const all = decls(ALL).filter(notOverhaul);
    const typed = all.filter((d) => d.prop === 'font-size' || d.prop === 'font' || d.prop.startsWith('--fx-type'));
    expect(typed.filter((d) => (size(d) ?? 99) < 12).map(show)).toEqual([]);
    const dim = (d: Decl): boolean => /\.fx-dim\b/.test(d.selector) || (d.prop === 'color' && /var\(--(?:fx|agent)-dim\)/.test(d.value));
    const dimRules = new Set(all.filter(dim).map((d) => `${d.file}|${d.selector}`));
    expect(typed.filter((d) => dimRules.has(`${d.file}|${d.selector}`) && (size(d) ?? 99) < 13).map(show)).toEqual([]);
  });

  it('dim text in the agent card names its own 13 px, never inheriting a 12 px list or summary (REVIEW-3-SHADOW 3)', () => {
    // The check above reads a size set in the dim rule itself; a dim rule that sets none inherits its parent's, and the
    // note list and the disclosure summary are 12 px (`--fx-type-control`). Two dim rules sit straight in the card's
    // own 13 px body (`.agent-panel`), named here; every other dim rule of the card sets its size.
    const INHERITS_CARD_BODY = new Set(['.agent-panel__intro', '.agent-panel__permission[data-state="not-requested"] .agent-panel__permission-label']);
    const panel = decls({ panel: SHEETS.panel });
    const sized = new Set(panel.filter((d) => (d.prop === 'font' || d.prop === 'font-size') && (size(d) ?? 0) >= 13).map((d) => d.selector));
    const dimText = panel.filter((d) => d.prop === 'color' && /var\(--agent-dim\)/.test(d.value)).map((d) => d.selector);
    expect(dimText.filter((s) => !sized.has(s) && !INHERITS_CARD_BODY.has(s))).toEqual([]);
  });
});

describe('FUI-7: the contrast pairs of the forge aliases (shared/ds/contrast.ts)', () => {
  // The ds's own contrast helper, loaded by path as `../projectSiteLook.test.ts` does: a static import would put the ds
  // file under this package's stricter compiler options.
  interface Rgba { r: number; g: number; b: number; a: number }
  interface Helper { contrast(a: Rgba, b: Rgba): number; parseColor(s: string): Rgba; readTokens(css: string): Map<string, string>; resolve(t: Map<string, string>, n: string): string }
  let helper: Helper;
  let tokens: Map<string, string>;
  beforeAll(async () => {
    helper = await import(/* @vite-ignore */ resolve(here, '../../../../../shared/ds/contrast.ts')) as Helper;
    tokens = helper.readTokens(ds('tokens.css') + (/:root\s*{([^}]*)}/.exec(ds('base.css'))?.[1] ?? '') + strip(read(TOKENS)));
  });
  const ratio = (fg: string, bg: string): number => helper.contrast(helper.parseColor(helper.resolve(tokens, fg)), helper.parseColor(helper.resolve(tokens, bg)));

  const SURFACES = ['--fx-bg', '--fx-panel', '--fx-panel-2', '--fx-selected'];
  it('text and the placed things\' hues clear 4.5:1 on every forge surface', () => {
    const inks = ['--fx-text', '--fx-dim', '--fx-gold', '--fx-team-a', '--fx-team-b', '--fx-side-seal', '--fx-side-terrorist', '--fx-alert', '--fx-danger', '--fx-ready'];
    for (const fg of inks) for (const bg of SURFACES) expect(ratio(fg, bg), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
    for (const fg of ['--fx-text', '--fx-dim', '--fx-gold']) expect(ratio(fg, '--fx-hover'), `${fg} on --fx-hover`).toBeGreaterThanOrEqual(4.5);
  });

  it('a control\'s edge clears 3:1 on the surfaces behind it (VP-9)', () => {
    for (const bg of SURFACES) expect(ratio('--fx-control-edge', bg), `--fx-control-edge on ${bg}`).toBeGreaterThanOrEqual(3);
  });

  it('the label on a filled control clears 4.5:1 (primary, Play, the axis tags, talking)', () => {
    for (const bg of ['--fx-gold', '--fx-gold-hi', '--fx-ready', '--fx-axis-x', '--fx-axis-y', '--fx-axis-z']) {
      expect(ratio('--fx-on-accent', bg), `--fx-on-accent on ${bg}`).toBeGreaterThanOrEqual(4.5);
    }
  });
});
