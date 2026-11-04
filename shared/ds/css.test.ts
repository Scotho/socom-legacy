import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { resolve as p, dirname } from 'path';
import { SELECTORS } from './selectors';
import { createHash } from 'crypto';
import { readTokens, parseColor, resolve as resolveToken } from './contrast';

const here = dirname(fileURLToPath(import.meta.url));
const read = (f: string) => readFileSync(p(here, f), 'utf-8');
const readme = read('README.md');
const base = read('base.css'), components = read('components.css'), fonts = read('fonts.css'), index = read('index.css'), tokensCss = read('tokens.css');
const tokens = readTokens(tokensCss + base);
/* 1.5.0: part G, the Console launcher (cx-*), is its own `@layer s2u.components` block after the "---- part G" mark,
   the owner's design export verbatim but for the token prefix. The Briefing guards below (no colour literal, the
   shadow and radius allowlists, no widened edge) are parts A-F's and read components.css up to that mark; part G is
   held by its own guards in the "1.5.0" describe (its colour literals listed by the token each derives from). */
const G_MARK = '/* ---- part G';
const componentsAF = components.indexOf(G_MARK) < 0 ? components : components.slice(0, components.indexOf(G_MARK));

/* ---- the guards: pure functions over CSS text. Each returns what it refuses (empty = clean), so the file
   tests below run them over the real stylesheets and the adversarial tests at the foot run them over a string
   that carries the hole each one closes. ---- */

/** the custom properties a script sets on an element (no default in the tokens): the reading-progress fraction and
    the shelf's ink bar position and width (1.1.0) */
const SET_BY_SCRIPT = new Set(['--s2u-progress', '--s2u-ink-x', '--s2u-ink-w']);
const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');
const outsideReducedMotion = (css: string) => strip(css).replace(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*{(?:[^{}]|{[^{}]*})*}/g, '');
/** every `selector { body }` pair, at-rule bodies included (the nested blocks read as their own rules) */
const rules = (css: string): [string, string][] => [...strip(css).matchAll(/([^{}]+){([^{}]*)}/g)].map(([, sel, body]) => [sel.trim(), body]);
/** the `prop: value` pairs of one rule body */
const declarations = (body: string): [string, string][] => body.split(';').flatMap((d) => {
  const i = d.indexOf(':');
  return i < 0 ? [] : [[d.slice(0, i).trim(), d.slice(i + 1).trim()]];
});
/** split a value on the commas that are not inside parentheses */
const topLevelParts = (value: string): string[] => {
  const parts: string[] = []; let depth = 0, start = 0;
  for (let i = 0; i < value.length; i++) {
    const c = value[i];
    if (c === '(') depth++; else if (c === ')') depth--; else if (c === ',' && depth === 0) { parts.push(value.slice(start, i)); start = i + 1; }
  }
  parts.push(value.slice(start));
  return parts.map((s) => s.trim()).filter(Boolean);
};

/* transparent, currentColor, none and the system keywords carry no hue; everything else is a literal */
const COLOUR = /(#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(|(?<![\w-])(white|black|red|green|blue|gray|grey|yellow|orange|purple|pink|silver)(?![\w-]))/i;
/** the lines that carry a colour literal (a data URI's own colours are the data-URI guard's) */
const colourLiterals = (css: string): string[] => strip(css).split('\n').filter((l) => COLOUR.test(l) && !/data:image\//.test(l));

/** every !important (any spacing, any case) outside prefers-reduced-motion */
const importants = (css: string): string[] => outsideReducedMotion(css).match(/!\s*important/gi) ?? [];

/** the --s2u-* names a stylesheet references that no token or base rule declares */
const missingTokens = (css: string, known: Map<string, string>): string[] => {
  const refs = [...strip(css).matchAll(/var\((--s2u-[a-z0-9-]+)/g)].map((m) => m[1]);
  return [...new Set(refs)].filter((r) => !known.has(r) && !SET_BY_SCRIPT.has(r));
};

/** the custom properties a page stylesheet may reference: a --s2u-* the tokens or base declare, a --pg-* its own
    first :root block declares, the wheel's --i stagger index and the progress bar's --s2u-progress (set by script).
    Anything else (an old page token such as --gutter or --max) resolves to nothing in the browser, in silence. */
const unknownVars = (css: string, known: Map<string, string>): string[] => {
  const clean = strip(css);
  const own = new Set([...(/:root\s*{([^}]*)}/.exec(clean)?.[1] ?? '').matchAll(/(--pg-[a-z0-9-]+)\s*:/g)].map((m) => m[1]));
  const refs = [...clean.matchAll(/var\((--[a-z0-9-]+)/gi)].map((m) => m[1]);
  return [...new Set(refs)].filter((r) => !(r.startsWith('--s2u-') && known.has(r)) && !own.has(r) && r !== '--i' && !SET_BY_SCRIPT.has(r));
};

const SIDE = '(top|right|bottom|left|inline-start|inline-end|block-start|block-end)';
const EDGE_PROP = new RegExp(`^border(-${SIDE})?(-width)?$`);
const BORDER_COLOUR_PROP = new RegExp(`^border(-${SIDE})?(-color)?$`);
const tokenColours = (value: string) => [...value.matchAll(/var\((--s2u-[a-z0-9-]+)\)/g)].map((m) => m[1]);
const pxWidth = (value: string) => { const m = /(?<![\w.-])(\d+(?:\.\d+)?)px/.exec(value); return m ? Number(m[1]) : 0; };
/** an edge 2px or wider in a token colour other than --s2u-warn (the EXPERIMENTAL rule's exception); a `-width`
    longhand takes its colour from the rule's other border declarations; a transparent edge names no token */
const widenedEdges = (css: string): string[] => {
  const bad: string[] = [];
  for (const [sel, body] of rules(css)) {
    const decls = declarations(body);
    const bodyColours = decls.filter(([prop]) => BORDER_COLOUR_PROP.test(prop)).flatMap(([, v]) => tokenColours(v));
    for (const [prop, value] of decls) {
      if (!EDGE_PROP.test(prop) || pxWidth(value) < 2) continue;
      const colours = (prop.endsWith('-width') ? bodyColours : tokenColours(value)).filter((c) => c !== '--s2u-warn');
      if (colours.length) bad.push(`${sel} { ${prop}: ${value} }`);
    }
  }
  return bad;
};

const SHADOW_PART = /^(var\(--s2u-(title-glow|story-glow|panel-inset|viewer-lift)\)|none|inset 0 (-1|1)px 0 var\(--s2u-panel-edge\)|inset 0 0 0 1px var\(--s2u-warn\)|0 0 0 2px var\(--s2u-panel-edge\))$/;
/** every box-shadow part (split on top-level commas) that is not a token, a 1px rule or the lamp bezel */
const shadowsOffAllowlist = (css: string): string[] => {
  const bad: string[] = [];
  for (const [sel, body] of rules(css)) for (const [prop, value] of declarations(body)) {
    if (prop !== 'box-shadow') continue;
    for (const part of topLevelParts(value)) if (!SHADOW_PART.test(part)) bad.push(`${sel} { box-shadow: … ${part} … }`);
  }
  return bad;
};

/** a consumer outside the system: no import, from, href or @import reaching /ds/, no --s2u- token, no .s2u- class */
const boundaryViolations = (text: string): string[] => text.split('\n').filter((l) =>
  (/\b(import|from)\b|href=/.test(l) && /\/ds\//.test(l)) || /--s2u-|\.s2u-/.test(l));
/** the modules a TypeScript file imports statically by a relative path, as file names */
const staticImports = (ts: string): string[] => [...ts.matchAll(/^\s*(?:import|export)[^;]*?\bfrom\s+'(\.\/[^']+)'/gm)].map((m) => `${m[1]}.ts`);

const RADIUS_PROP = /^border(-(top|bottom|start|end)-(left|right|start|end))?-radius$/;
/** every border-radius that is not a radius token or the circle */
const offRadii = (css: string): string[] => {
  const bad: string[] = [];
  for (const [sel, body] of rules(css)) for (const [prop, value] of declarations(body)) {
    if (RADIUS_PROP.test(prop) && !/^(var\(--s2u-radius-[a-z0-9-]+\)|50%)$/.test(value)) bad.push(`${sel} { ${prop}: ${value} }`);
  }
  return bad;
};

const PROPS = new RegExp(`^(color|background|background-image|background-color|border(-${SIDE})?-color|fill|stroke|box-shadow|text-shadow|outline|outline-color|accent-color|caret-color|border(-${SIDE})?|border-inline|border-block|filter|text-decoration|text-decoration-color|scrollbar-color|-webkit-text-fill-color|mask|mask-image)$`);
const ALLOWED = /var\(--s2u-[a-z0-9-]+\)|transparent|currentColor|none|inherit|initial|CanvasText|repeating-linear-gradient|linear-gradient|color-mix\(in srgb|url\("data:image\/svg\+xml[^"]*"\)|inset|solid|underline|to bottom|to right|calc\([\d\s.%a-z+*/-]*\)|blur|drop-shadow|-?\d+(\.\d+)?(px|em|%|deg)?|[\s,/()]/g;
/** every colour-bearing declaration whose value is not tokens and keywords only */
const offTokenDeclarations = (css: string): string[] => {
  const bad: string[] = [];
  for (const [sel, body] of rules(css)) for (const [prop, value] of declarations(body)) {
    if (!PROPS.test(prop)) continue;
    const rest = value.replace(ALLOWED, '').trim();
    if (rest) bad.push(`${sel} { ${prop}: ${value} } leaves "${rest}"`);
  }
  return bad;
};

/** every %23xxxxxx colour inside a data URI that is not a colour value of tokens.css */
const dataUriColoursOffTokens = (css: string, tokensText: string): string[] => {
  const known = new Set([...tokensText.matchAll(/#([0-9a-f]{6})\b/gi)].map((m) => m[1].toLowerCase()));
  return [...css.matchAll(/%23([0-9a-f]{6})/gi)].map((m) => m[1].toLowerCase()).filter((hex) => !known.has(hex)).map((hex) => `%23${hex}`);
};

/* ---- the files ---- */

describe('index.css', () => {
  it('imports the four files in layer order', () => {
    expect([...index.matchAll(/@import\s+'([^']+)'/g)].map((m) => m[1])).toEqual(['./tokens.css', './fonts.css', './base.css', './components.css']);
  });
});

describe.each([['base.css', base, 's2u.base'], ['components.css', componentsAF, 's2u.components'], ['fonts.css', fonts, 's2u.base']])('%s', (_n, css, layer) => {
  it('is wrapped in its layer', () => {
    if (layer === null) return; // home.css: not wrapped in a layer, so it stays unlayered and wins every tie
    expect(strip(css).trimStart().startsWith(`@layer ${layer} {`)).toBe(true);
  });
  it('holds no colour literal (tokens.css owns them; home.css may declare its own page tokens in one :root block)', () => {
    const bad = colourLiterals(css.replace(/:root\s*{[^}]*}/, ''));
    expect(bad, bad.join('\n')).toEqual([]);
  });
  it('uses !important only under prefers-reduced-motion', () => {
    expect(importants(css)).toEqual([]);
  });
  it('every var(--s2u-…) it references exists', () => {
    expect(missingTokens(css, tokens)).toEqual([]);
  });
  it('references no custom property but the system’s, its own --pg-* and the two the scripts set', () => {
    if (layer !== null) return; // the system's own files: missingTokens above, and they declare what they use
    const bad = unknownVars(css, tokens);
    expect(bad, bad.join('\n')).toEqual([]);
  });
  it('never widens an edge past 1px in a token colour (warn excepted)', () => {
    const bad = widenedEdges(css);
    expect(bad, bad.join('\n')).toEqual([]);
  });
  it('gives no element a shadow but the tokens, the 1px rules and the lamp bezel, in every part', () => {
    const bad = shadowsOffAllowlist(css);
    expect(bad, bad.join('\n')).toEqual([]);
  });
  it('rounds a corner only by a radius token or the circle', () => {
    const bad = offRadii(css);
    expect(bad, bad.join('\n')).toEqual([]);
  });
});

describe('the boundary', () => {
  it('gold-source is refused in components; cyan-boot only in the boot typewriter', () => {
    for (const [sel, body] of rules(components)) {
      expect(body, sel).not.toMatch(/--s2u-gold-source/);
      if (/--s2u-cyan-boot/.test(body)) expect(sel).toMatch(/^\.s2u-typed--boot/);
    }
  });
});

describe('text-dim is never set under 13px (briefing README, Colour)', () => {
  it('holds in every component rule', () => {
    for (const [sel, body] of rules(components)) {
      if (!/--s2u-text-dim/.test(body)) continue;
      const px = /font(?:-size)?:[^;]*?(\d+(?:\.\d+)?)px/.exec(body)?.[1];
      if (px) expect(+px, sel).toBeGreaterThanOrEqual(13);
      const small = /var\(--s2u-type-(stat-caption|readout-caption)\)/.test(body);
      if (small) expect(sel, `${sel} uses an 11px style with text-dim`).toMatch(/s2u-stat__k|s2u-tile|s2u-card__num|s2u-tab__what|s2u-fine|s2u-status|s2u-overlay|s2u-label/);
    }
  });
});

describe('every colour-bearing declaration is tokens and keywords only', () => {
  it.each([['base.css', base], ['components.css', componentsAF]])('%s', (_n, css) => {
    const bad = offTokenDeclarations(css);
    expect(bad, bad.join('\n')).toEqual([]);
  });
  it('every colour inside a data URI is a token colour (the select chevron is gold)', () => {
    expect(dataUriColoursOffTokens(components, tokensCss)).toEqual([]);
    expect(components).toContain('%23c4a04a');
    expect(tokensCss).toMatch(/--s2u-gold:\s*#c4a04a;/);
  });
});

describe('the spec’s selectors exist', () => {
  it.each(SELECTORS)('%s', (sel) => {
    expect(base + components).toContain(sel);
  });
});

describe('disabled states the system owns (fix round 1: the viewer lost these to the vendored rewrite)', () => {
  it.each(['.s2u-field select:disabled', '.s2u-label:disabled', '.s2u-iconbtn:disabled'])(
    'components.css has a :disabled rule reaching %s',
    (sel) => {
      const hit = rules(components).some(([s]) => s.split(',').map((part) => part.trim()).includes(sel));
      expect(hit, sel).toBe(true);
    },
  );
});

describe('the final wave: the bar’s nav shows that it scrolls, lists take the measure', () => {
  const ruleFor = (sel: string) => rules(components).filter(([s]) => s === sel).map(([, body]) => body).join(';');
  it('.s2u-bar__nav declares a mask-image (the last visible link fades instead of cutting flat)', () => {
    expect(ruleFor('.s2u-bar__nav')).toMatch(/(^|;)\s*mask-image:\s*linear-gradient\(to right/);
    expect(ruleFor('.s2u-bar__nav')).toMatch(/(^|;)\s*-webkit-mask-image:/);
  });
  it('.s2u-bar__end never shrinks under the scrolling nav', () => {
    expect(ruleFor('.s2u-bar__end')).toMatch(/(^|;)\s*flex:\s*none/);
  });
  it('the measure rule’s selector list includes .s2u-panel__body ul and ol', () => {
    const measure = rules(components).filter(([, body]) => /^\s*max-width:\s*var\(--s2u-measure\);?\s*$/.test(body)).map(([sel]) => sel.split(',').map((s) => s.trim()));
    const lists = measure.find((sels) => sels.includes('.s2u-panel__body p'));
    expect(lists, 'the measure rule on .s2u-panel__body p').toBeDefined();
    expect(lists).toContain('.s2u-panel__body ul');
    expect(lists).toContain('.s2u-panel__body ol');
  });
});

describe('the layout pass (the owner’s review of the live site, 2026-09-28)', () => {
  const ruleFor = (sel: string) => rules(components).filter(([s]) => s.split(',').map((p) => p.trim()).includes(sel)).map(([, body]) => body).join(';');
  it('.s2u-panel__body grows like .s2u-card__body, so paired panels in a grid share a height', () => {
    expect(ruleFor('.s2u-panel__body')).toMatch(/(^|;)\s*flex:\s*1\b/);
  });
  it('a link in a panel head or a card title takes the head’s gold, underlined in gold mixed against the panel, full gold when pointed at, ↗ when it leaves the site', () => {
    const rest = ruleFor('.s2u-panel__head a');
    expect(rest).toMatch(/(^|;)\s*color:\s*var\(--s2u-gold\)/);
    expect(rest).toMatch(/text-decoration-color:\s*color-mix\(in srgb, var\(--s2u-gold\) \d+%, var\(--s2u-panel\)\)/);
    expect(ruleFor('.s2u-card > h3 a')).toBe(rest);
    expect(ruleFor('.s2u-panel__head a:hover')).toMatch(/text-decoration-color:\s*var\(--s2u-gold\)/);
    expect(ruleFor('.s2u-panel__head a:focus-visible')).toMatch(/text-decoration-color:\s*var\(--s2u-gold\)/);
    expect(ruleFor('.s2u-panel__head a[target="_blank"]::after')).toMatch(/content:\s*'\s?↗'/);
  });
});

describe('1.1.0: the launcher components (MU.R19, MU.R20; launcher brief sections 2 and 4)', () => {
  const ruleFor = (sel: string, css = components) => rules(css).filter(([s]) => s.split(',').map((x) => x.trim()).includes(sel)).map(([, body]) => body).join(';');
  const partC = strip(componentsAF.slice(Math.max(0, componentsAF.indexOf('/* ---- part C'))));
  it('components.css carries the launcher as its part C', () => {
    expect(components.indexOf('/* ---- part C')).toBeGreaterThan(components.indexOf('/* ---- part B'));
  });
  it('the frame is a viewport-high grid whose rows are the layout tokens, the content row the only flexible one (2.8)', () => {
    const frame = ruleFor('.s2u-launcher');
    expect(frame).toMatch(/(^|;)\s*height:\s*100dvh/);
    expect(frame).toMatch(/(^|;)\s*overflow:\s*hidden/);
    expect(frame).toMatch(/grid-template-rows:\s*var\(--s2u-bar-h\) auto auto minmax\(0, 1fr\) var\(--s2u-action-h\)/);
    expect(ruleFor('.s2u-launcher.is-opened .s2u-shelf')).toMatch(/height:\s*var\(--s2u-shelf-h-compact\)/);
  });
  it('the content region scrolls in itself, contained, with a stable gutter', () => {
    const content = ruleFor('.s2u-launcher__content');
    expect(content).toMatch(/overflow-y:\s*auto/);
    expect(content).toMatch(/overscroll-behavior:\s*contain/);
    expect(content).toMatch(/scrollbar-gutter:\s*stable/);
    expect(ruleFor('.s2u-launcher__pane')).toMatch(/overflow-y:\s*auto/);
  });
  it('two panes from 960px, stacked under it', () => {
    expect(partC).toMatch(/@media \(min-width: 960px\)\s*{[^@]*\.s2u-launcher__panes\s*{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) minmax\(0, 1fr\)/);
  });
  it('one focus ring for keyboard and pad, on the focus tokens, in base and on the launcher\'s surfaces', () => {
    expect(ruleFor(':focus-visible', base)).toMatch(/outline:\s*var\(--s2u-focus-w\) solid var\(--s2u-focus\);\s*outline-offset:\s*var\(--s2u-focus-offset\)/);
    const ring = rules(components).find(([s]) => s.includes('.s2u-launcher') && s.includes('.is-pad-focused') && s.includes(':focus-visible'));
    expect(ring, 'a .s2u-launcher rule over :focus-visible and .is-pad-focused').toBeDefined();
    expect(ring![0]).toContain('.s2u-dialog');
    expect(ring![0]).toContain('.s2u-shelf');
    expect(ring![0]).not.toContain('.s2u-osk');   // 2.0.0 (CX-29): part C's keyboard retired
    expect(ring![1]).toMatch(/outline:\s*var\(--s2u-focus-w\) solid var\(--s2u-focus\)/);
  });
  it('a focused shelf tile is raised (the hover surface, the lift) and ringed, instantly (MU.R13 F2)', () => {
    const focused = rules(components).find(([s]) => s.includes('.s2u-shelf__tile:focus-visible') && s.includes('.s2u-shelf__tile.is-pad-focused'));
    expect(focused).toBeDefined();
    expect(focused![1]).toMatch(/background:\s*var\(--s2u-surface-hover\)/);
    expect(focused![1]).toMatch(/box-shadow:\s*var\(--s2u-viewer-lift\)/);
    expect(ruleFor('.s2u-shelf__tile')).not.toMatch(/transition:[^;]*outline/);
    expect(ruleFor('.s2u-shelf__ink')).toMatch(/transition:\s*transform var\(--s2u-dur-base\) var\(--s2u-ease\)/);
  });
  it('the prompts hide on a touch screen unless a pad is live; Circle is the text colour (MU.R20, brief Q5)', () => {
    expect(partC).toMatch(/@media \(hover: none\)\s*{\s*\.s2u-prompts:not\(\.is-pad\)\s*{\s*display:\s*none;?\s*}/);
    expect(ruleFor('.s2u-prompt__glyph--circle')).toMatch(/stroke:\s*var\(--s2u-text\)/);
    expect(ruleFor('.s2u-prompt__glyph--cross')).toMatch(/stroke:\s*var\(--s2u-glyph-cross\)/);
    expect(ruleFor('.s2u-prompt__glyph--square')).toMatch(/stroke:\s*var\(--s2u-glyph-square\)/);
    expect(ruleFor('.s2u-prompt__glyph--triangle')).toMatch(/stroke:\s*var\(--s2u-glyph-triangle\)/);
  });
  it('the live state (cyan-boot) is a lamp\'s fill only, never a text colour', () => {
    let seen = 0;
    for (const [sel, body] of rules(components)) for (const [prop, value] of declarations(body))
      if (/--s2u-state-live/.test(value)) { seen++; expect(prop, sel).toBe('background'); expect(sel).toMatch(/\.s2u-chip__lamp$/); }
    expect(seen).toBeGreaterThan(0);
  });
  it('START: disabled is the tab\'s own; armed is ground on gold; launching is the one 360ms step (MU.R13 F6)', () => {
    expect(ruleFor('.s2u-start.is-armed')).toMatch(/background:\s*var\(--s2u-gold\);\s*color:\s*var\(--s2u-ground\)/);
    expect(ruleFor('.s2u-start.is-launching')).toMatch(/background:\s*var\(--s2u-gold-display\)/);
    expect(ruleFor('.s2u-start.is-launching')).toMatch(/transition:\s*background-color var\(--s2u-dur-signature\)/);
  });
  it('part C names no literal duration: motion is the ds\'s tokens only (MU.R13 F6)', () => {
    expect(partC.length).toBeGreaterThan(0);
    const literal = partC.replace(/\d+(\.\d+)?(px|em|%|vh|dvh|vw|deg|fr)\b/g, '').match(/(?<![\w.-])\d+(\.\d+)?m?s\b/g) ?? [];
    expect(literal.filter((d) => d !== '0s')).toEqual([]);
  });
  it('under reduced motion every duration token is 0s, the signature step included', () => {
    const reduced = /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*{((?:[^{}]|{[^{}]*})*)}/.exec(strip(base))?.[1] ?? '';
    for (const t of ['--s2u-dur-fast', '--s2u-dur-base', '--s2u-dur-slow', '--s2u-dur-signature']) expect(reduced).toMatch(new RegExp(`${t}:\\s*0s`));
  });
  it('a dialog is fixed over the page on the scrim (it never pushes the frame); the z-osk token sits above it (kept in 2.0.0)', () => {
    expect(ruleFor('.s2u-dialog')).toMatch(/position:\s*fixed/);
    expect(ruleFor('.s2u-dialog')).toMatch(/background:\s*var\(--s2u-scrim\)/);
    expect(Number(tokens.get('--s2u-z-osk'))).toBeGreaterThan(Number(tokens.get('--s2u-z-overlay')));
    expect(Number(tokens.get('--s2u-z-osk'))).toBeLessThan(Number(tokens.get('--s2u-z-scan')));
  });
});

describe('1.1.0 fix round 1 (the LU-0 review)', () => {
  const ruleFor = (sel: string, css = components) => rules(css).filter(([s]) => s.split(',').map((x) => x.trim()).includes(sel)).map(([, body]) => body).join(';');
  it('a compact shelf (48px, no vertical padding, it scrolls) draws its tiles\' ring inside the tile, so it is not clipped', () => {
    for (const sel of ['.s2u-launcher.is-opened .s2u-shelf__tile', '.s2u-shelf.is-compact .s2u-shelf__tile'])
      expect(ruleFor(sel), sel).toMatch(/--s2u-focus-offset:\s*calc\(-1 \* var\(--s2u-focus-w\)\)/);
  });
  it('the phone shelf (4px vertical padding) draws its tiles\' ring inside too', () => {
    const phone = /@media \(max-width: 720px\)\s*{((?:[^{}]|{[^{}]*})*)}/.exec(strip(components.slice(components.indexOf('/* ---- part C'))))?.[1] ?? '';
    const tile = rules(phone).find(([s]) => s.split(',').map((x) => x.trim()).includes('.s2u-shelf__tile'));
    expect(tile?.[1]).toMatch(/--s2u-focus-offset:\s*calc\(-1 \* var\(--s2u-focus-w\)\)/);
  });
  it('the phone rules reach a .s2u-shelf.is-compact as they reach the opened launcher\'s shelf', () => {
    const phone = /@media \(max-width: 720px\)\s*{((?:[^{}]|{[^{}]*})*)}/.exec(strip(components.slice(components.indexOf('/* ---- part C'))))?.[1] ?? '';
    for (const [plain, compact] of [['.s2u-shelf', '.s2u-shelf.is-compact'], ['.s2u-shelf__tile', '.s2u-shelf.is-compact .s2u-shelf__tile'], ['.s2u-shelf__icon', '.s2u-shelf.is-compact .s2u-shelf__icon']]) {
      const hit = rules(phone).find(([s]) => s.split(',').map((x) => x.trim()).includes(plain));
      expect(hit?.[0].split(',').map((x) => x.trim()), plain).toContain(compact);
    }
  });
  it('the ring rule reads --s2u-focus-offset, so an element moves its ring by setting the token (the README says so)', () => {
    const ring = rules(components).find(([s]) => s.includes('.s2u-launcher') && s.includes('.is-pad-focused') && s.includes(':focus-visible'));
    expect(ring![1]).toMatch(/outline-offset:\s*var\(--s2u-focus-offset\)/);
    expect(readme).toMatch(/sets `--s2u-focus-offset` locally/);
    expect(readme).not.toMatch(/sets `outline-offset` locally/);
  });
  it('a .s2u-tile inside the launcher draws one ring (the tile\'s), never a second on its link; pad focus on the link rings the tile', () => {
    const quiet = rules(components).find(([s]) => /\.s2u-launcher/.test(s) && /\.s2u-tile h3 a:is\(:focus-visible, \.is-pad-focused\)/.test(s));
    expect(quiet, 'a launcher-scoped rule that takes the ring off a tile\'s link').toBeDefined();
    expect(quiet![1]).toMatch(/outline:\s*none/);
    const pad = rules(components).find(([s]) => /\.s2u-tile:has\(\.is-pad-focused\)/.test(s));
    expect(pad?.[1]).toMatch(/outline:\s*var\(--s2u-focus-w\) solid var\(--s2u-focus\)/);
  });
  it('the dialog is a div role="dialog" only: no <dialog>/showModal() form, whose top layer would leave the OSK under it, inert', () => {
    expect(rules(components).some(([s]) => /(^|[\s,])dialog\.s2u-dialog|::backdrop/.test(s))).toBe(false);
    expect(readme).not.toMatch(/or a `<dialog>` opened with/);
    expect(readme).toMatch(/not a `<dialog>` opened with `showModal\(\)`/);
  });
});

describe('1.2.0: the public-site adoptions (MU.R21, MU.R22; README, "From the public site")', () => {
  const ruleFor = (sel: string, css = components) => rules(css).filter(([s]) => s.split(',').map((x) => x.trim()).includes(sel)).map(([, body]) => body).join(';');
  const partD = strip(componentsAF.slice(Math.max(0, componentsAF.indexOf('/* ---- part D'))));
  const section = (h: string) => { const i = readme.indexOf(h); return i < 0 ? '' : readme.slice(i + h.length).split(/\n## /)[0]; };
  it('components.css carries the adoptions as its part D, after part C', () => {
    expect(components.indexOf('/* ---- part D')).toBeGreaterThan(components.indexOf('/* ---- part C'));
  });
  it('an action is at least 44px high, a large (primary launcher) one 48px, both by the hit tokens', () => {
    expect(ruleFor('.s2u-action')).toMatch(/min-height:\s*var\(--s2u-hit-min\)/);
    expect(ruleFor('.s2u-action--large')).toMatch(/min-height:\s*var\(--s2u-hit-primary\)/);
    expect(ruleFor('.s2u-action--tertiary')).toMatch(/min-height:\s*var\(--s2u-hit-min\)/);
  });
  it('secondary: tab fill, text-dim edge, text-strong label; hover tab-lit with a gold edge', () => {
    const rest = ruleFor('.s2u-action');
    expect(rest).toMatch(/background:\s*var\(--s2u-tab\)/);
    expect(rest).toMatch(/border:\s*1px solid var\(--s2u-text-dim\)/);
    expect(rest).toMatch(/color:\s*var\(--s2u-text-strong\)/);
    const hover = rules(components).find(([s]) => s.includes('.s2u-action:hover') && !s.includes('--primary'));
    expect(hover?.[1]).toMatch(/background-color:\s*var\(--s2u-tab-lit\)/);
    expect(hover?.[1]).toMatch(/border-color:\s*var\(--s2u-gold\)/);
  });
  it('primary: gold fill and edge, ground-deep label; hover gold-display; press text-strong', () => {
    const rest = ruleFor('.s2u-action--primary');
    expect(rest).toMatch(/background:\s*var\(--s2u-gold\)/);
    expect(rest).toMatch(/color:\s*var\(--s2u-ground-deep\)/);
    expect(partD).toMatch(/\.s2u-action--primary:hover:not\(:disabled\):not\(\[aria-disabled="true"\]\)\s*{[^}]*background-color:\s*var\(--s2u-gold-display\)[^}]*color:\s*var\(--s2u-ground-deep\)/);
    expect(partD).toMatch(/\.s2u-action--primary:active:not\(:disabled\):not\(\[aria-disabled="true"\]\)\s*{[^}]*background-color:\s*var\(--s2u-text-strong\)[^}]*color:\s*var\(--s2u-ground-deep\)/);
  });
  it('tertiary: gold-display text, a visible underline, no filled container', () => {
    const r = ruleFor('.s2u-action--tertiary');
    expect(r).toMatch(/color:\s*var\(--s2u-gold-display\)/);
    expect(r).toMatch(/text-decoration:\s*underline/);
    expect(r).toMatch(/background:\s*none/);
    expect(r).toMatch(/border:\s*0/);
  });
  it('selected (aria-pressed, aria-current, .is-on): a gold label and edge and a 2px bottom rule -- shape, not colour alone', () => {
    const sel = rules(components).find(([s]) => s.includes('.s2u-action[aria-pressed="true"]') && s.includes('.s2u-action[aria-current]') && s.includes('.s2u-action.is-on'));
    expect(sel, 'one selected rule over the three attributes').toBeDefined();
    expect(sel![1]).toMatch(/color:\s*var\(--s2u-gold-display\)/);
    expect(sel![1]).toMatch(/border-color:\s*var\(--s2u-gold\)/);
    expect(sel![1]).toMatch(/background-image:\s*linear-gradient\(var\(--s2u-gold\), var\(--s2u-gold\)\)/);
    expect(sel![1]).toMatch(/background-size:\s*100% var\(--s2u-rule-w\)/);
    expect(sel![1]).toMatch(/background-position:\s*bottom/);
  });
  it('disabled (:disabled, aria-disabled): tab fill, highlight edge, text-dim label, no glow, no hover response', () => {
    const d = rules(components).find(([s]) => s.includes('.s2u-action:disabled') && s.includes('.s2u-action[aria-disabled="true"]'));
    expect(d, 'a disabled rule over both forms').toBeDefined();
    expect(d![1]).toMatch(/background:\s*var\(--s2u-tab\)/);
    expect(d![1]).toMatch(/border-color:\s*var\(--s2u-highlight\)/);
    expect(d![1]).toMatch(/color:\s*var\(--s2u-text-dim\)/);
    expect(d![1]).toMatch(/cursor:\s*not-allowed/);
    // every hover and press rule of the action levels excludes the disabled forms
    for (const [s] of rules(components)) if (/\.s2u-action[^,]*:(hover|active)/.test(s)) expect(s, s).toContain(':not([aria-disabled="true"])');
  });
  it('every action state also draws our one ring for the pad: :focus-visible and .is-pad-focused, the focus tokens, no second style', () => {
    const ring = rules(components).find(([s]) => s.includes('.s2u-action') && s.includes('.is-pad-focused') && s.includes(':focus-visible'));
    expect(ring, 'a ring rule over .s2u-action').toBeDefined();
    expect(ring![1]).toMatch(/outline:\s*var\(--s2u-focus-w\) solid var\(--s2u-focus\)/);
    expect(ring![1]).toMatch(/outline-offset:\s*var\(--s2u-focus-offset\)/);
    expect(partD).not.toMatch(/outline-offset:\s*3px/);
    expect(ruleFor('.s2u-action')).not.toMatch(/transition:[^;]*outline/);
  });
  it('the ring goes inside only where a scroller clips: .s2u-focus-inset sets the offset token, nothing else', () => {
    expect(ruleFor('.s2u-focus-inset').trim()).toMatch(/^--s2u-focus-offset:\s*calc\(-1 \* var\(--s2u-focus-w\)\);?$/);
  });
  it('a callout is a panel with a 2px gold top rule (a gradient, not an edge) and no hover lift', () => {
    const r = ruleFor('.s2u-panel--callout > .s2u-panel__body');
    expect(r).toMatch(/background-color:\s*var\(--s2u-panel\)/);
    expect(r).toMatch(/background-image:\s*linear-gradient\(var\(--s2u-gold\), var\(--s2u-gold\)\)/);
    expect(r).toMatch(/background-size:\s*100% var\(--s2u-rule-w\)/);
    expect(r).toMatch(/background-position:\s*top/);
    for (const [s, b] of rules(components)) if (s.includes('.s2u-panel--callout')) { expect(s).not.toMatch(/:hover/); expect(b).not.toMatch(/transform|translate/); }
  });
  it('a backdrop panel: the page sets --s2u-backdrop-image; the shade is the token; the fallback is the plain panel; forced colours drop both', () => {
    const B = '.s2u-panel--backdrop > .s2u-panel__body';
    expect(ruleFor(B)).toMatch(/background-image:\s*var\(--s2u-backdrop-image\)/);
    expect(ruleFor(B)).toMatch(/background-color:\s*var\(--s2u-panel\)/);
    expect(ruleFor(B)).toMatch(/isolation:\s*isolate/);
    expect(ruleFor(B + '::before')).toMatch(/background:\s*var\(--s2u-backdrop-shade\)/);
    expect(ruleFor(B + '::before')).toMatch(/z-index:\s*-1/);
    expect(partD).toMatch(/@media \(forced-colors: active\)\s*{[^@]*__body\s*{[^}]*background-image:\s*none[^}]*}[^@]*__body::before\s*{[^}]*display:\s*none/);
    expect(ruleFor(B)).not.toMatch(/url\(/);
    // the old form covered the image with the opaque head and body and positioned every child
    expect(rules(components).some(([s]) => /\.s2u-panel--backdrop\s*>\s*\*/.test(s))).toBe(false);
    expect(rules(components).some(([s]) => s.trim() === '.s2u-panel--backdrop')).toBe(false);
  });
  it('a selected primary keeps ground-deep text and a ground-deep bar, and hover and press keep the bar (background-color only)', () => {
    const sel = rules(components).find(([s]) => s.includes('.s2u-action--primary[aria-pressed="true"]') && s.includes('.s2u-action--primary.is-on'));
    expect(sel, 'a selected-primary rule').toBeDefined();
    expect(sel![1]).toMatch(/color:\s*var\(--s2u-ground-deep\)/);
    expect(sel![1]).toMatch(/background-image:\s*linear-gradient\(var\(--s2u-ground-deep\), var\(--s2u-ground-deep\)\)/);
    expect(components.indexOf('.s2u-action--primary[aria-pressed="true"]')).toBeGreaterThan(components.indexOf('.s2u-action[aria-pressed="true"]'));
    for (const [s, b] of rules(components)) if (/\.s2u-action--primary:(hover|active)/.test(s)) expect(b, s).not.toMatch(/(^|;)\s*background:/);
  });
  it('a selected tertiary draws no bar: its underline thickens to the rule width, in text-strong', () => {
    const sel = rules(components).find(([s]) => s.includes('.s2u-action--tertiary[aria-pressed="true"]') && s.includes('.s2u-action--tertiary.is-on'));
    expect(sel, 'a selected-tertiary rule').toBeDefined();
    expect(sel![1]).toMatch(/background-image:\s*none/);
    expect(sel![1]).toMatch(/text-decoration-thickness:\s*var\(--s2u-rule-w\)/);
    expect(sel![1]).toMatch(/color:\s*var\(--s2u-text-strong\)/);
  });
  it('the reading column: the 1040px measure plus the gutters, centred', () => {
    const r = ruleFor('.s2u-reading');
    expect(r).toMatch(/max-width:\s*calc\(var\(--s2u-measure-reading\) \+ 2 \* var\(--s2u-gutter\)\)/);
    expect(r).toMatch(/padding-inline:\s*var\(--s2u-gutter\)/);
    expect(r).toMatch(/margin-inline:\s*auto/);
  });
  it('the README names what came from where (teaser@185764c3:path), the type roles, rhythm, surfaces and the voice', () => {
    const s = section('## From the public site');
    expect(s, 'a "From the public site" section').not.toBe('');
    for (const f of ['DESIGN\\.md', 'patterns\\.css', 'icons\\.ts', 'emblem\\.svg']) expect(s).toMatch(new RegExp(`teaser@185764c3:socomlegacy/packages/viewer/src/teaser/${f}`));
    for (const w of ['type-tab', 'type-subtitle', 'type-body-small', 'type-readout', 'space-12', '1040px', 'no game screenshots', 'MU.R22']) expect(s).toContain(w);
    expect(s).toMatch(/not adopted/i);
    const v = section('## Voice');
    expect(v, 'a "Voice" section').not.toBe('');
    expect(v).toMatch(/sentence case/i);
    expect(v).toMatch(/plain about what is not done/i);
  });
});

describe('1.3.0: the live site\'s launcher patterns (MU.R19, MU.R23, MU.R24; README, "From the live site")', () => {
  const ruleFor = (sel: string, css = components) => rules(css).filter(([s]) => s.split(',').map((x) => x.trim()).includes(sel)).map(([, body]) => body).join(';');
  const partE = strip(componentsAF.slice(Math.max(0, componentsAF.indexOf('/* ---- part E'))));
  const media = (q: string, css = partE) => [...css.matchAll(/@media\s*\(([^)]*)\)\s*{((?:[^{}]|{[^{}]*})*)}/g)].filter((m) => m[1].trim() === q).map((m) => m[2]).join('\n');
  const section = (h: string) => { const i = readme.indexOf(h); return i < 0 ? '' : readme.slice(i + h.length).split(/\n## /)[0]; };
  it('components.css carries the live site\'s patterns as its part E, after part D', () => {
    expect(components.indexOf('/* ---- part E')).toBeGreaterThan(components.indexOf('/* ---- part D'));
  });
  it('part E never names gold-source, a playtest or a person: the pattern, not the content (MU.R23)', () => {
    expect(partE).not.toMatch(/gold-source/);
    expect(components.slice(components.indexOf('/* ---- part E'))).not.toMatch(/playtest|frostfire|benny/i);
  });
  it('part E names no literal duration: motion is the tokens\' only', () => {
    const literal = partE.replace(/\d+(\.\d+)?(px|em|%|vh|dvh|vw|deg|fr)\b/g, '').match(/(?<![\w.-])\d+(\.\d+)?m?s\b/g) ?? [];
    expect(literal.filter((d) => d !== '0s')).toEqual([]);
  });

  /* s2u-slot: the memory-card slot (startup.css l.21-37, 133-136) */
  it('the slot: a panel with a 4px gold left edge drawn as a gradient layer, the readout label across the top under a highlight rule', () => {
    const slot = ruleFor('.s2u-slot');
    expect(slot).toMatch(/background-color:\s*var\(--s2u-panel\)/);
    expect(slot).toMatch(/background-image:\s*linear-gradient\(var\(--s2u-slot-edge\), var\(--s2u-slot-edge\)\)/);
    expect(slot).toMatch(/background-size:\s*var\(--s2u-slot-edge-w\) 100%/);
    expect(slot).toMatch(/border:\s*1px solid var\(--s2u-highlight\)/);
    expect(ruleFor('.s2u-slot__label')).toMatch(/font:\s*var\(--s2u-type-readout\)/);
    expect(ruleFor('.s2u-slot__label')).toMatch(/color:\s*var\(--s2u-gold\)/);
    expect(ruleFor('.s2u-slot__label')).toMatch(/border-bottom:\s*1px solid var\(--s2u-highlight\)/);
    expect(ruleFor('.s2u-slot__icon')).toMatch(/background:\s*var\(--s2u-ground-deep\)/);
    expect(ruleFor('.s2u-slot__icon')).toMatch(/border:\s*1px solid var\(--s2u-highlight\)/);
    expect(ruleFor('.s2u-slot__icon')).toMatch(/color:\s*var\(--s2u-gold\)/);
  });
  it('the slot\'s four states: empty (the status hidden), reading (the icon turns once per 5 x dur-slow), ready (state-ready edge, the ready fill, text-strong, the check), error (warn)', () => {
    expect(ruleFor('.s2u-slot.is-empty .s2u-slot__status')).toMatch(/display:\s*none/);
    expect(ruleFor('.s2u-slot.is-reading .s2u-slot__icon svg')).toMatch(/animation:\s*s2u-slot-turn calc\(var\(--s2u-dur-slow\) \* 5\) linear infinite/);
    expect(partE).toMatch(/@keyframes s2u-slot-turn\s*{\s*to\s*{\s*transform:\s*rotate\(360deg\);?\s*}\s*}/);
    const ready = ruleFor('.s2u-slot.is-ready');
    expect(ready).toMatch(/--s2u-slot-edge:\s*var\(--s2u-state-ready\)/);
    expect(ready).toMatch(/background-color:\s*var\(--s2u-slot-ready-fill\)/);
    expect(ready).toMatch(/border-color:\s*var\(--s2u-state-ready\)/);
    for (const s of ['.s2u-slot.is-ready .s2u-slot__title', '.s2u-slot.is-ready .s2u-slot__label', '.s2u-slot.is-ready .s2u-slot__icon']) expect(ruleFor(s), s).toMatch(/color:\s*var\(--s2u-text-strong\)/);
    expect(ruleFor('.s2u-slot__check')).toMatch(/display:\s*none/);
    expect(ruleFor('.s2u-slot.is-ready .s2u-slot__check')).toMatch(/display:\s*(block|inline)/);
    expect(ruleFor('.s2u-slot.is-ready .s2u-slot__groove')).toMatch(/display:\s*none/);
    const error = ruleFor('.s2u-slot.is-error');
    expect(error).toMatch(/--s2u-slot-edge:\s*var\(--s2u-state-alert\)/);
    expect(error).toMatch(/border-color:\s*var\(--s2u-warn\)/);
    expect(ruleFor('.s2u-slot.is-error .s2u-slot__status')).toMatch(/color:\s*var\(--s2u-warn\)/);
    expect(ruleFor('.s2u-slot.is-over')).toMatch(/outline:\s*var\(--s2u-focus-w\) solid var\(--s2u-focus\)/);
  });
  it('the slot never puts text-dim on the ready fill (3.1:1 there; tokens.test.ts)', () => {
    for (const [sel, body] of rules(partE)) if (/\.s2u-slot\.is-ready/.test(sel)) expect(body, sel).not.toMatch(/--s2u-text-dim/);
  });
  it('the slot stops turning under reduced motion, and keeps its edges under forced colours', () => {
    expect(ruleFor('.s2u-slot.is-reading .s2u-slot__icon svg', media('prefers-reduced-motion: reduce'))).toMatch(/animation:\s*none/);
    const forced = media('forced-colors: active');
    expect(ruleFor('.s2u-slot', forced)).toMatch(/border:\s*1px solid CanvasText/);
    expect(ruleFor('.s2u-slot', forced)).toMatch(/background-image:\s*none/);
  });

  /* s2u-facts: the briefing callout with fact columns (startup.css l.224-233, 243-258); the ds already has .s2u-briefing */
  it('the fact panel does not touch the existing .s2u-briefing (the tabs grid of part A): it is .s2u-facts', () => {
    for (const [sel] of rules(partE)) expect(sel).not.toMatch(/\.s2u-briefing(?![\w-])/);
  });
  it('facts: a 2px gold top rule (a gradient, not an edge) over the panel-to-tab 120deg gradient; a 240px title column; rules between columns', () => {
    const f = ruleFor('.s2u-facts');
    expect(f).toMatch(/background-image:\s*linear-gradient\(var\(--s2u-gold\), var\(--s2u-gold\)\), linear-gradient\(120deg, var\(--s2u-panel\), var\(--s2u-tab\)\)/);
    expect(f).toMatch(/background-size:\s*100% var\(--s2u-rule-w\), auto/);
    expect(f).toMatch(/grid-template-columns:\s*240px minmax\(0, 1fr\)/);
    expect(ruleFor('.s2u-facts__grid')).toMatch(/grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/);
    expect(ruleFor('.s2u-facts__col + .s2u-facts__col')).toMatch(/border-left:\s*1px solid var\(--s2u-highlight\)/);
    expect(ruleFor('.s2u-facts__title')).toMatch(/color:\s*var\(--s2u-text-strong\)/);
    expect(ruleFor('.s2u-facts__head')).toMatch(/font:\s*var\(--s2u-type-nav\)/);
    expect(ruleFor('.s2u-facts a')).toMatch(/color:\s*var\(--s2u-gold-display\)/);
  });
  it('facts: three columns, two at <= 900px, one at <= 640px (the title column stacks too)', () => {
    expect(ruleFor('.s2u-facts__grid', media('max-width: 900px'))).toMatch(/grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
    expect(ruleFor('.s2u-facts__grid', media('max-width: 640px'))).toMatch(/grid-template-columns:\s*minmax\(0, 1fr\)/);
    expect(ruleFor('.s2u-facts', media('max-width: 640px'))).toMatch(/grid-template-columns:\s*minmax\(0, 1fr\)/);
  });

  /* s2u-summary: the home's card (the brief, section 3.1) */
  it('summary: panel, 1px highlight edge, one stretched link, the one ring (keyboard focus-visible and the pad, never a mouse click), no second ring on the link', () => {
    const s = ruleFor('.s2u-summary');
    expect(s).toMatch(/position:\s*relative/);
    expect(s).toMatch(/background:\s*var\(--s2u-panel\)/);
    expect(s).toMatch(/border:\s*1px solid var\(--s2u-highlight\)/);
    expect(ruleFor('.s2u-summary__link::after')).toMatch(/inset:\s*0/);
    /* one rule, and specific enough (0,4,0) to beat part C's launcher ring (0,3,1), so the link draws none anywhere */
    const quiet = rules(partE).filter(([x]) => /\.s2u-summary__link:is\(:focus-visible, \.is-pad-focused\)$/.test(x));
    expect(quiet.map(([x]) => x)).toEqual(['.s2u-summary .s2u-summary__title .s2u-summary__link:is(:focus-visible, .is-pad-focused)']);
    expect(quiet[0][1]).toMatch(/outline:\s*none/);
    expect(rules(partE).some(([x]) => /\.s2u-summary:focus-within/.test(x)), 'no ring or lit state on :focus-within (a mouse click)').toBe(false);
    const ring = rules(partE).find(([x]) => x === '.s2u-summary:has(:focus-visible, .is-pad-focused)');
    expect(ring, 'the ring on .s2u-summary:has(:focus-visible, .is-pad-focused)').toBeDefined();
    expect(ring![1]).toMatch(/outline:\s*var\(--s2u-focus-w\) solid var\(--s2u-focus\)/);
    expect(ring![1]).toMatch(/outline-offset:\s*var\(--s2u-focus-offset\)/);
    expect(ruleFor('.s2u-summary__title')).toMatch(/font:\s*var\(--s2u-type-panel-heading\)/);
  });
  it('summary: at most three lines, the action at the foot, its Cross prompt only with the pad focus', () => {
    expect(ruleFor('.s2u-summary__lines > :nth-child(n+4)')).toMatch(/display:\s*none/);
    expect(ruleFor('.s2u-summary__lines > *')).toMatch(/text-overflow:\s*ellipsis/);
    expect(ruleFor('.s2u-summary__action')).toMatch(/margin-top:\s*auto/);
    expect(ruleFor('.s2u-summary__prompt')).toMatch(/display:\s*none/);
    expect(ruleFor('.s2u-summary:has(.is-pad-focused) .s2u-summary__prompt')).toMatch(/display:\s*inline-flex/);
  });
  it('summary: a row on a phone (icon, title, one line); the grid 3 / 2 / 1 columns', () => {
    expect(ruleFor('.s2u-summary__lines > :nth-child(n+2)', media('max-width: 720px'))).toMatch(/display:\s*none/);
    expect(ruleFor('.s2u-summaries')).toMatch(/grid-template-columns:\s*minmax\(0, 1fr\)/);
    expect(ruleFor('.s2u-summaries', media('min-width: 720px'))).toMatch(/repeat\(2, minmax\(0, 1fr\)\)/);
    expect(ruleFor('.s2u-summaries', media('min-width: 1100px'))).toMatch(/repeat\(3, minmax\(0, 1fr\)\)/);
  });

  /* s2u-navlinks: the icon-and-word project nav (patterns.css l.104-130; startup.css l.236-253) */
  it('navlinks: icon + word, 44px, the subtitle type, the ring inside the link; two rows of plain words at <= 640px', () => {
    const l = ruleFor('.s2u-navlinks__link');
    expect(l).toMatch(/min-height:\s*var\(--s2u-hit-min\)/);
    expect(l).toMatch(/font:\s*var\(--s2u-type-subtitle\)/);
    expect(l).toMatch(/gap:\s*var\(--s2u-space-2\)/);
    expect(l).toMatch(/--s2u-focus-offset:\s*calc\(-1 \* var\(--s2u-focus-w\)\)/);
    expect(ruleFor('.s2u-navlinks__link:hover')).toMatch(/color:\s*var\(--s2u-gold-display\)/);
    expect(ruleFor('.s2u-navlinks__link.is-pad-focused')).toMatch(/outline:\s*var\(--s2u-focus-w\) solid var\(--s2u-focus\)/);
    const phone = media('max-width: 640px');
    expect(ruleFor('.s2u-navlinks', phone)).toMatch(/flex:\s*1 0 100%/);
    expect(ruleFor('.s2u-navlinks', phone)).toMatch(/order:\s*3/);
    expect(ruleFor('.s2u-navlinks__link', phone)).toMatch(/font:\s*var\(--s2u-type-body-small\)/);
    expect(ruleFor('.s2u-navlinks__link', phone)).toMatch(/text-transform:\s*none/);
    expect(ruleFor('.s2u-topbar:has(> .s2u-navlinks)', phone)).toMatch(/flex-wrap:\s*wrap/);
  });

  /* s2u-start--large and the action bar (startup.css l.109-119, 247-263) */
  it('START large: 48px, at least 180px (124px at <= 640px), a CSS play triangle before the word', () => {
    const s = ruleFor('.s2u-start--large');
    expect(s).toMatch(/min-height:\s*var\(--s2u-hit-primary\)/);
    expect(s).toMatch(/min-width:\s*var\(--s2u-start-min-w\)/);
    expect(ruleFor('.s2u-start--large', media('max-width: 640px'))).toMatch(/min-width:\s*var\(--s2u-start-min-w-narrow\)/);
    const tri = ruleFor('.s2u-start--large::before');
    expect(tri).toMatch(/content:\s*''/);
    expect(tri).toMatch(/border-left:\s*10px solid currentColor/);
    expect(tri).toMatch(/border-top:\s*6px solid transparent/);
  });
  it('the action bar: a gold top rule when ready (a gradient layer), and it grows for an error without hiding its words', () => {
    const ready = ruleFor('.s2u-actionbar.is-ready');
    expect(ready).toMatch(/background-image:\s*linear-gradient\(var\(--s2u-gold\), var\(--s2u-gold\)\)/);
    expect(ready).toMatch(/background-size:\s*100% 1px/);
    expect(ready).toMatch(/box-shadow:\s*none/);
    const err = ruleFor('.s2u-actionbar.is-error');
    expect(err).toMatch(/min-height:\s*calc\(var\(--s2u-action-h-error\) \+ env\(safe-area-inset-bottom, 0px\)\)/);
    expect(err).toMatch(/height:\s*auto/);
    expect(err).toMatch(/flex-wrap:\s*wrap/);
    expect(ruleFor('.s2u-actionbar__error')).toMatch(/color:\s*var\(--s2u-warn\)/);
    expect(ruleFor('.s2u-actionbar__error')).toMatch(/white-space:\s*normal/);
    expect(ruleFor('.s2u-actionbar.is-error', media('max-width: 720px'))).toMatch(/min-height:\s*calc\(var\(--s2u-action-h-error-narrow\) \+ env\(safe-area-inset-bottom, 0px\)\)/);
    expect(ruleFor('.s2u-actionbar:not(.is-error) .s2u-actionbar__error')).toMatch(/display:\s*none/);
  });
  it('the frame takes the safe areas: the top bar the top inset, the action bar the bottom, every row the side insets; the grid rows hold them', () => {
    expect(ruleFor('.s2u-launcher')).toMatch(/grid-template-rows:\s*calc\(var\(--s2u-bar-h\) \+ env\(safe-area-inset-top, 0px\)\) auto auto minmax\(0, 1fr\) auto/);
    const top = ruleFor('.s2u-launcher > .s2u-topbar');
    expect(top).toMatch(/height:\s*calc\(var\(--s2u-bar-h\) \+ env\(safe-area-inset-top, 0px\)\)/);
    expect(top).toMatch(/padding-top:\s*env\(safe-area-inset-top, 0px\)/);
    const bar = ruleFor('.s2u-launcher > .s2u-actionbar');
    expect(bar).toMatch(/height:\s*calc\(var\(--s2u-action-h\) \+ env\(safe-area-inset-bottom, 0px\)\)/);
    expect(bar).toMatch(/padding-bottom:\s*env\(safe-area-inset-bottom, 0px\)/);
    const sides = rules(partE).find(([s]) => s.includes('.s2u-launcher > .s2u-topbar') && s.includes('.s2u-launcher__content') && s.includes('.s2u-launcher > .s2u-actionbar') && s.includes('.s2u-launcher > .s2u-shelf'));
    expect(sides, 'one rule giving every row the side insets').toBeDefined();
    expect(sides![1]).toMatch(/padding-left:\s*max\(var\(--s2u-gutter\), env\(safe-area-inset-left, 0px\)\)/);
    expect(sides![1]).toMatch(/padding-right:\s*max\(var\(--s2u-gutter\), env\(safe-area-inset-right, 0px\)\)/);
    const phone = media('max-width: 720px');
    expect(ruleFor('.s2u-launcher > .s2u-topbar', phone)).toMatch(/height:\s*calc\(var\(--s2u-bar-h-narrow\) \+ env\(safe-area-inset-top, 0px\)\)/);
    expect(ruleFor('.s2u-launcher > .s2u-actionbar', phone)).toMatch(/height:\s*calc\(var\(--s2u-action-h-narrow\) \+ env\(safe-area-inset-bottom, 0px\)\)/);
  });
  it('the content region keeps a focused control off the bars: scroll-padding-block space-6 (the phone frame: the sticky bars plus space-6)', () => {
    expect(ruleFor('.s2u-launcher__content')).toMatch(/scroll-padding-block:\s*var\(--s2u-space-6\)/);
    expect(ruleFor('.s2u-launcher', media('max-width: 720px'))).toMatch(/scroll-padding-block:\s*calc\(var\(--s2u-bar-h-narrow\) \+ var\(--s2u-shelf-h-narrow\) \+ var\(--s2u-space-6\) \+ env\(safe-area-inset-top, 0px\)\) calc\(var\(--s2u-action-h-narrow\) \+ var\(--s2u-space-6\) \+ env\(safe-area-inset-bottom, 0px\)\)/);
  });
  it('the phone frame: the sticky shelf sits under the top bar\'s inset; a top bar with navlinks at <= 640px has a token height and the shelf and the reservation follow it', () => {
    expect(ruleFor('.s2u-launcher > .s2u-shelf', media('max-width: 720px'))).toMatch(/top:\s*calc\(var\(--s2u-bar-h-narrow\) \+ env\(safe-area-inset-top, 0px\)\)/);
    const phone = media('max-width: 640px');
    expect(ruleFor('.s2u-launcher > .s2u-topbar:has(> .s2u-navlinks)', phone)).toMatch(/height:\s*calc\(var\(--s2u-bar-h-narrow-nav\) \+ env\(safe-area-inset-top, 0px\)\)/);
    expect(ruleFor('.s2u-launcher > .s2u-topbar:has(> .s2u-navlinks)', phone)).not.toMatch(/height:\s*auto/);
    expect(ruleFor('.s2u-navlinks', phone)).toMatch(/height:\s*var\(--s2u-hit-min\)/);
    expect(ruleFor('.s2u-launcher:has(> .s2u-topbar > .s2u-navlinks) > .s2u-shelf', phone)).toMatch(/top:\s*calc\(var\(--s2u-bar-h-narrow-nav\) \+ env\(safe-area-inset-top, 0px\)\)/);
    expect(ruleFor('.s2u-launcher:has(> .s2u-topbar > .s2u-navlinks)', phone)).toMatch(/scroll-padding-block:\s*calc\(var\(--s2u-bar-h-narrow-nav\) \+ var\(--s2u-shelf-h-narrow\) \+ var\(--s2u-space-6\) \+ env\(safe-area-inset-top, 0px\)\) calc\(var\(--s2u-action-h-narrow\) \+ var\(--s2u-space-6\) \+ env\(safe-area-inset-bottom, 0px\)\)/);
  });

  /* s2u-tip (ours: ground, focus edge; the live arrow only: startup.css l.205-208) */
  it('the tip keeps our look (ground, 1px focus edge, text-strong) and takes the live arrow, placed by --s2u-tip-arrow and data-side', () => {
    const t = ruleFor('.s2u-tip');
    expect(t).toMatch(/position:\s*fixed/);
    expect(t).toMatch(/z-index:\s*var\(--s2u-z-tip\)/);
    expect(t).toMatch(/background:\s*var\(--s2u-ground\)/);
    expect(t).toMatch(/border:\s*1px solid var\(--s2u-focus\)/);
    expect(t).toMatch(/color:\s*var\(--s2u-text-strong\)/);
    expect(ruleFor('.s2u-tip[hidden]')).toMatch(/display:\s*none/);
    const arrow = ruleFor('.s2u-tip[data-side]::before');
    expect(arrow).toMatch(/left:\s*var\(--s2u-tip-arrow\)/);
    expect(arrow).toMatch(/transform:\s*translateX\(-50%\) rotate\(45deg\)/);
    expect(arrow).toMatch(/background:\s*var\(--s2u-ground\)/);
    expect(ruleFor('.s2u-tip[data-side="below"]::before')).toMatch(/border-top:\s*1px solid var\(--s2u-focus\)/);
    expect(ruleFor('.s2u-tip[data-side="above"]::before')).toMatch(/border-bottom:\s*1px solid var\(--s2u-focus\)/);
    expect(ruleFor('.s2u-tip[data-side]::before', media('forced-colors: active'))).toMatch(/display:\s*none/);
  });

  /* the look card's frame guide (startup.css l.187-196) */
  it('the frame guide: a 72% x 78% ground-deep frame over a 24px panel-edge grid on panel; 46% for 4:3; no asset; forced colours drop it', () => {
    const g = ruleFor('.s2u-tile__frame.is-guide');
    expect(g).toMatch(/background-color:\s*var\(--s2u-panel\)/);
    expect(g).toMatch(/background-image:\s*linear-gradient\(var\(--s2u-ground-deep\), var\(--s2u-ground-deep\)\), repeating-linear-gradient\(0deg, transparent 0 23px, var\(--s2u-panel-edge\) 23px 24px\), repeating-linear-gradient\(90deg, transparent 0 23px, var\(--s2u-panel-edge\) 23px 24px\)/);
    expect(g).toMatch(/background-size:\s*72% 78%, auto, auto/);
    expect(g).not.toMatch(/url\(/);
    expect(ruleFor('.s2u-tile__frame--4x3.is-guide')).toMatch(/background-size:\s*46% 78%, auto, auto/);
    expect(ruleFor('.s2u-tile__frame.is-guide img:not([src])')).toMatch(/display:\s*none/);
    expect(ruleFor('.s2u-tile__frame.is-guide', media('forced-colors: active'))).toMatch(/background-image:\s*none/);
  });

  it('the README names what came from where (wt-lobby-armory@803f2671:path), each class, what is not adopted, and the next-step voice rule', () => {
    const s = section('## From the live site (1.3.0)');
    expect(s, 'a "From the live site (1.3.0)" section').not.toBe('');
    for (const f of ['src/startup.css', 'src/teaser/patterns.css', 'index.html']) expect(s).toContain(`wt-lobby-armory@803f2671:socomlegacy/packages/viewer/${f}`);
    for (const c of ['s2u-slot', 's2u-facts', 's2u-summary', 's2u-summaries', 's2u-navlinks', 's2u-start--large', 's2u-actionbar.is-ready', 's2u-actionbar.is-error', 's2u-tip', 'is-guide', 'scroll-padding-block', 'safe-area', '`server`', 'MU.R23', 'MU.R24']) expect(s, c).toContain(c);
    expect(s).toMatch(/not adopted/i);
    expect(s).toMatch(/no game screenshots/i);
    expect(s).toMatch(/--4x3`? only narrows the guide box/);
    expect(s).toMatch(/aspect ratio is the page's/);
    expect(s).toMatch(/320px[^.]*300px|300px[^.]*320px/);
    expect(section('## Voice')).toMatch(/a status says the next step/i);
  });
});

describe('1.4.0: the check list\'s drawn marks, .s2u-list--check.is-marks (the rendered design review r1, item 13)', () => {
  const ruleFor = (sel: string, css = components) => rules(css).filter(([s]) => s.split(',').map((x) => x.trim()).includes(sel)).map(([, body]) => body).join(';');
  const partF = strip(componentsAF.slice(Math.max(0, componentsAF.indexOf('/* ---- part F'))));
  const media = (q: string, css = partF) => [...css.matchAll(/@media\s*\(([^)]*)\)\s*{((?:[^{}]|{[^{}]*})*)}/g)].filter((m) => m[1].trim() === q).map((m) => m[2]).join('\n');
  const section = (h: string) => { const i = readme.indexOf(h); return i < 0 ? '' : readme.slice(i + h.length).split(/\n## /)[0]; };
  it('VERSION is at least 1.4.0 (additive: a minor bump), and components.css carries it as part F, after part E', () => {
    const [maj, min] = read('VERSION').trim().split('.').map(Number);
    expect(maj > 1 || (maj === 1 && min >= 4)).toBe(true);
    expect(components.indexOf('/* ---- part F')).toBeGreaterThan(components.indexOf('/* ---- part E'));
  });
  it('additive: the base list keeps its [X] / [ ] glyphs and its 34px indent (the reading pages use them)', () => {
    expect(ruleFor('.s2u-list--check.is-done li::before')).toMatch(/content:\s*'\[X\]'/);
    expect(ruleFor('.s2u-list--check.is-todo li::before')).toMatch(/content:\s*'\[ \]'/);
    expect(ruleFor('.s2u-list--check li')).toMatch(/padding-left:\s*34px/);
    expect(partF).not.toMatch(/\.s2u-list--check(?!\.is-marks)[^{,]*{/);
  });
  it('a grid row per item: the mark\'s 16px column beside the text\'s; every child in the text column (a fix under its text)', () => {
    const li = ruleFor('.s2u-list--check.is-marks li', partF);
    expect(li).toMatch(/display:\s*grid/);
    expect(li).toMatch(/grid-template-columns:\s*var\(--s2u-icon-16\) minmax\(0, 1fr\)/);
    expect(li).toMatch(/padding-left:\s*0/);
    expect(li).toMatch(/column-gap:\s*var\(--s2u-space-2\)/);
    const kids = ruleFor('.s2u-list--check.is-marks li > *', partF);
    expect(kids).toMatch(/grid-column:\s*2/);
    expect(kids).toMatch(/min-width:\s*0/);
  });
  it('the mark: one line high with its drawing centred, so it sits on the first line; drawn in the item\'s colour', () => {
    const m = ruleFor('.s2u-list--check.is-marks li::before', partF);
    for (const d of [/content:\s*''/, /position:\s*static/, /grid-column:\s*1/, /grid-row:\s*1/, /height:\s*1lh/, /background-color:\s*currentColor/,
      /mask-position:\s*center/, /mask-size:\s*var\(--s2u-icon-16\) var\(--s2u-icon-16\)/, /mask-repeat:\s*no-repeat/]) expect(m).toMatch(d);
  });
  it('done draws the slot\'s authored check, todo an empty ring (the slot\'s circle): a mask, no glyph', () => {
    const done = ruleFor('.s2u-list--check.is-marks.is-done li::before', partF);
    const todo = ruleFor('.s2u-list--check.is-marks.is-todo li::before', partF);
    expect(done).toMatch(/mask-image:\s*url\("data:image\/svg\+xml,[^"]*path d='m17 33 10 10 22-23'/);
    expect(todo).toMatch(/mask-image:\s*url\("data:image\/svg\+xml,[^"]*circle cx='32' cy='32' r='26'/);
    for (const r of [done, todo]) expect(r).not.toMatch(/content:\s*'\[/);
  });
  it('forced colours keep the marks (CanvasText, not adjusted away)', () => {
    const forced = ruleFor('.s2u-list--check.is-marks li::before', media('forced-colors: active'));
    expect(forced).toMatch(/forced-color-adjust:\s*none/);
    expect(forced).toMatch(/background-color:\s*CanvasText/);
  });
  it('the README names it under 1.4.0, and that the base glyphs stay', () => {
    const s = section('## The check list\'s marks (1.4.0)');
    expect(s, 'a "The check list\'s marks (1.4.0)" section').not.toBe('');
    for (const c of ['s2u-list--check', 'is-marks', '[X]', 's2u-visually-hidden', 'Done', 'To do']) expect(s, c).toContain(c);
  });
});

describe('1.5.0: the Console launcher layer, cx-*', () => {
  /* the owner's design export of 2026-10-11: components/bundle.css from its "Console launcher (cx-*), 2026-10-11"
     header to the end of its last layer block (306 lines, LF), and the component READMEs; README, "The Console
     launcher (1.5.0)" */
  const BUNDLE_HEAD = '/* ---------- Console launcher (cx-*), 2026-10-11';
  const BUNDLE_CX_SHA = '5ed488759c457ae5d30c2e1764b6afbcfd05d786681502f985e9cfd3e186e773';
  const at = components.indexOf(G_MARK);
  const partGRaw = at < 0 ? '' : components.slice(at);
  const partG = strip(partGRaw);
  const block = partGRaw.indexOf(BUNDLE_HEAD) < 0 ? '' : partGRaw.slice(partGRaw.indexOf(BUNDLE_HEAD)).replace(/\r\n/g, '\n');
  /* the tokens a stylesheet can read: tokens.css and base.css's first :root block (the engineering tokens; the
     density switch and the reduced-motion block only redefine) */
  const declared = readTokens(tokensCss + (/:root\s*{([^}]*)}/.exec(base)?.[1] ?? ''));
  const ruleFor = (sel: string, css = partG) => rules(css).filter(([s]) => s.split(',').map((x) => x.trim()).includes(sel)).map(([, body]) => body).join(';');
  const section = (h: string) => { const i = readme.indexOf(h); return i < 0 ? '' : readme.slice(i + h.length).split(/\n## /)[0]; };
  const braces = (s: string) => [...s].reduce((n, c) => n + (c === '{' ? 1 : c === '}' ? -1 : 0), 0);

  it('VERSION is at least 1.5.0 (additive: a minor bump), and components.css carries the layer as part G, after part F', () => {
    const [maj, min] = read('VERSION').trim().split('.').map(Number);
    expect(maj > 1 || (maj === 1 && min >= 5)).toBe(true);
    expect(at).toBeGreaterThan(components.indexOf('/* ---- part F'));
  });
  it('part G is its own @layer s2u.components block, opened after the block holding parts A-F has closed', () => {
    expect(braces(strip(componentsAF))).toBe(0);
    expect(partG.trimStart().startsWith('@layer s2u.components {')).toBe(true);
    expect(braces(partG)).toBe(0);
    expect(partG.match(/@layer\b/g)).toHaveLength(1);
  });
  it('is the export\'s block verbatim but for the prefix: every var(--x) reads var(--s2u-x), nothing else changed', () => {
    expect(block.startsWith(BUNDLE_HEAD)).toBe(true);
    expect(block).not.toMatch(/var\(--(?!s2u-)/);
    expect(createHash('sha256').update(block.replace(/var\(--s2u-/g, 'var(--')).digest('hex')).toBe(BUNDLE_CX_SHA);
  });
  it('every token part G reads is declared in tokens.css or base.css\'s first :root block', () => {
    const refs = [...new Set([...partG.matchAll(/var\((--[a-z0-9-]+)/g)].map((m) => m[1]))];
    expect(refs.length).toBeGreaterThan(40);
    const missing = refs.filter((r) => !declared.has(r));
    expect(missing, missing.join(' ')).toEqual([]);
    for (const t of ['--s2u-veil-strong', '--s2u-veil', '--s2u-veil-soft', '--s2u-veil-faint', '--s2u-veil-clear', '--s2u-row-veil', '--s2u-panel-veil',
      '--s2u-cx-safe-x', '--s2u-cx-safe-y', '--s2u-cx-header-h', '--s2u-cx-legend-h', '--s2u-cx-cat-pitch', '--s2u-cx-row-h', '--s2u-cx-key-h', '--s2u-cx-list-w'])
      expect(refs, t).toContain(t);
  });
  it('its only colour literals are the prototype\'s alpha-suffixed token colours, each the rgb of the token it derives from', () => {
    /* hex -> the token whose colour it carries at an alpha (the scanlines and the drawer's fade; the roll; the glows) */
    const ALLOWED: Record<string, string> = {
      '#0000': '--s2u-ground-deep', '#0000001f': '--s2u-ground-deep',
      '#dfe4e500': '--s2u-text-strong', '#dfe4e50d': '--s2u-text-strong', '#dfe4e533': '--s2u-text-strong',
      '#dcb85c66': '--s2u-gold-display', '#dcb85c55': '--s2u-gold-display', '#dcb85c8c': '--s2u-gold-display', '#dcb85cb3': '--s2u-gold-display',
      '#00293300': '--s2u-panel',
    };
    const found = [...new Set((partG.match(/#[0-9a-f]{3,8}\b/gi) ?? []).map((h) => h.toLowerCase()))];
    expect(found.length).toBeGreaterThan(0);
    expect(found.filter((h) => !(h in ALLOWED))).toEqual([]);
    const long = (h: string) => (h.length === 5 ? `#${[...h.slice(1)].map((c) => c + c).join('')}` : h);
    for (const [hex, token] of Object.entries(ALLOWED)) {
      const c = parseColor(long(hex)), t = parseColor(resolveToken(declared, token));
      expect([c.r, c.g, c.b], `${hex} is ${token}`).toEqual([t.r, t.g, t.b]);
      expect(c.a, hex).toBeLessThan(1);
    }
    expect(partG).not.toMatch(/\brgba?\(|\bhsla?\(/i);
    expect(partG).not.toMatch(/(?<![\w-])(white|black|red|green|blue|gray|grey|yellow|orange|purple|pink|silver)(?![\w-])/i);
  });
  it('no !important; it styles only cx-* (and the pad-mode focus rules on :root[data-input="pad"]); keyframes are cx-*', () => {
    expect(importants(partG)).toEqual([]);
    for (const [sel] of rules(partG)) {
      if (/^(from|to|\d+%)$/.test(sel)) continue;
      for (const s of sel.split(',').map((x) => x.trim())) expect(s).toMatch(/\.cx-|^:root\[data-input="pad"\]/);
    }
    for (const m of partG.matchAll(/@keyframes\s+([\w-]+)/g)) expect(m[1]).toMatch(/^cx-/);
  });
  /* 98 classes: the 88 the component READMEs name (ActionList, Confirm, ConsoleFrame, ConsoleHeader, ConsoleLegend,
     Crossbar, LaunchScreen, OnScreenKeyboard, OptionRows, Readout, RoomDrawer, RoomTable, ScreenHead, SignInDialog,
     Toast), and 10 of the frame's own that the bundle's frame block styles (ConsoleFrame's README names cx-app,
     cx-backdrop, cx-roll and cx-toast; all four are here) */
  const README_CLASSES = ['aside', 'bar', 'brand', 'brand__name', 'brand__sub', 'btn', 'btn--cross', 'btn--circle', 'btn--square', 'btn--triangle',
    'cat', 'cat__label', 'check', 'checks', 'chip', 'cluster', 'crossbar__hint', 'crossbar__hint--l', 'crossbar__hint--r', 'crossbar__track',
    'dialog', 'dialog__lead', 'dialog__note', 'dialog__title', 'dot', 'dpad', 'drawer', 'drawer__cta', 'drawer__map', 'drawer__name', 'empty',
    'eyebrow', 'facts', 'field', 'field__box', 'field__error', 'field__label', 'fig', 'fig__label', 'fig__n', 'filter', 'filters',
    'item', 'item__icon', 'item__state', 'item__sub', 'item__text', 'item__title', 'label', 'lampword', 'launch', 'launch__note', 'launch__title',
    'legend', 'legend__error', 'list', 'osk', 'osk__key', 'osk__row', 'persona', 'personas', 'ping', 'player', 'prompt', 'prompts',
    'readout', 'readout__figs', 'readout__head', 'readout__line', 'roller', 'room', 'rooms', 'rooms__foot', 'rooms__head', 'rows',
    'screenhead', 'scrim', 'shoulder', 'shoulders', 'sides', 'start', 'status', 'tab', 'tabs', 'tabs__hint', 'title', 'toast', 'toggle'];
  const FRAME_CLASSES = ['app', 'backdrop', 'roll', 'header', 'stage', 'home', 'crossbar', 'home__body', 'screen', 'screen__body'];
  it.each([...README_CLASSES, ...FRAME_CLASSES])('.cx-%s is styled', (c) => {
    expect(partG).toMatch(new RegExp(`\\.cx-${c.replace(/[-_]/g, (x) => `\\${x}`)}(?![\\w-])`));
  });
  it('the one class a README names that the export\'s CSS does not style is a listed gap (cx-key, ConsoleLegend and ScreenHead)', () => {
    /* the READMEs say `.cx-key` for the L1 / R1 / L2 / R2 words; the export draws them as .cx-shoulder outlines */
    for (const g of ['key']) expect(partG).not.toMatch(new RegExp(`\\.cx-${g}(?![\\w-])`));
  });
  it('the Console type roles in base.css are the layer\'s own type: font shorthand, italic and tracking', () => {
    const role = (n: string) => [declared.get(`--s2u-type-${n}`), declared.get(`--s2u-italic-${n}`), declared.get(`--s2u-tracking-${n}`)] as const;
    for (const [n, sel] of [['cx-title', '.cx-title'], ['cx-launch-title', '.cx-launch__title'], ['cx-cat', '.cx-cat__label'], ['cx-item-title', '.cx-item__title'],
      ['cx-sub', '.cx-item__sub'], ['cx-prompt', '.cx-prompt'], ['cx-caption', '.cx-fig__label'], ['cx-figure', '.cx-fig__n']]) {
      const [type, italic, tracking] = role(n);
      expect(type, n).toBeDefined();
      const body = ruleFor(sel);
      expect(body, sel).toContain(`font: ${italic === 'italic' ? 'italic ' : ''}${type}`);
      if (tracking !== '0') expect(body, sel).toContain(`letter-spacing: ${tracking}`);
    }
    const cur = ruleFor('.cx-cat.is-current .cx-cat__label');
    expect(declared.get('--s2u-type-cx-cat-current')).toBe('600 1.375rem/1.2 var(--s2u-font-label)');
    for (const d of ['font-size: 1.375rem', 'font-weight: 600', `letter-spacing: ${declared.get('--s2u-tracking-cx-cat-current')}`]) expect(cur).toContain(d);
    const foc = ruleFor('.cx-item.is-focused .cx-item__title');
    expect(declared.get('--s2u-type-cx-item-title-focused')).toBe('600 1.875rem/1.2 var(--s2u-font-label)');
    for (const d of ['font-size: 1.875rem', 'font-weight: 600']) expect(foc).toContain(d);
    expect(declared.get('--s2u-type-cx-body')).toBe('400 1.375rem/1.4 var(--s2u-font-body)');
  });
  it('the README names it under 1.5.0: what it is, the tokens it reads, patching in place, the authored backdrop, the 15 components', () => {
    const s = section('## The Console launcher (1.5.0)');
    expect(s, 'a "The Console launcher (1.5.0)" section').not.toBe('');
    for (const c of ['ConsoleFrame', 'ConsoleHeader', 'Crossbar', 'ActionList', 'Readout', 'ScreenHead', 'RoomTable', 'RoomDrawer', 'OptionRows',
      'ConsoleLegend', 'SignInDialog', 'OnScreenKeyboard', 'Confirm', 'Toast', 'LaunchScreen']) expect(s, c).toContain(c);
    for (const w of ['part G', 'cx-', '--s2u-', 'backdrops/crossroads.jpg', 'cx-key']) expect(s, w).toContain(w);
    expect(s).toMatch(/patch(es)? the DOM in place/i);
    expect(s).toMatch(/not a game (picture|screenshot)/i);
  });
  it('the backdrop is beside the system as authored project art, with its note', () => {
    const jpg = readFileSync(p(here, 'backdrops/crossroads.jpg'));
    expect(jpg.subarray(0, 3).toString('hex')).toBe('ffd8ff');
    expect(createHash('sha256').update(jpg).digest('hex')).toBe('53ee7577efa8f47865fc254ffa1ce7e8a1f2c4b296a883fe2e0f2b4088015484');
    const note = read('backdrops/README.md');
    expect(note).toMatch(/project art/i);
    expect(note).toMatch(/not a game screenshot/i);
    expect(note).toContain('346234');
  });
});

describe('1.8.0: the extraction popover, part I (DX-2 of the redotcom front-end plan, FI.R7)', () => {
  /* part I sits in the A-F block after part H, so A-F's guards above (no colour literal, the shadow and radius
     allowlists, no widened edge, tokens only) already read it; these hold what is its own. */
  const at = components.indexOf('/* ---- part I');
  // Part I alone: it ends at part J's mark (1.9.0, the home's scrolling list, placed after it; CX-LEGEND), else at G.
  const J = components.indexOf('/* ---- part J');
  const partI = at < 0 ? '' : strip(components.slice(at, J > at && J < components.indexOf(G_MARK) ? J : components.indexOf(G_MARK)));
  const ruleFor = (sel: string) => rules(partI).filter(([s]) => s.split(',').map((x) => x.trim()).includes(sel)).map(([, body]) => body).join(';');
  const section = (h: string) => { const i = readme.indexOf(h); return i < 0 ? '' : readme.slice(i + h.length).split(/\n## /)[0]; };
  const reduced = /@media \(prefers-reduced-motion: reduce\)\s*{((?:[^{}]|{[^{}]*})*)}/.exec(partI)?.[1] ?? '';

  it('VERSION is at least 1.8.0 (additive: a minor bump), and part I follows part H inside the A-F block', () => {
    const [maj, min] = read('VERSION').trim().split('.').map(Number);
    expect(maj > 1 || (maj === 1 && min >= 8)).toBe(true);
    expect(at).toBeGreaterThan(components.indexOf('/* ---- part H'));
    expect(at).toBeLessThan(components.indexOf(G_MARK));
    expect(componentsAF).toContain('/* ---- part I');
  });
  it('it styles only .cx-extract and its parts (and the bar it makes determinate), and its keyframes are cx-extract-*', () => {
    for (const [sel] of rules(partI)) {
      if (/^(from|to|\d+%)$/.test(sel)) continue;
      // and the scrim that holds the popover, by its child only (its fit at a phone's width): part G's .cx-scrim untouched
      for (const s of sel.split(',').map((x) => x.trim())) expect(s).toMatch(/^\.cx-extract|^\.cx-dialog\.cx-extract|^\.cx-bar\.cx-extract__bar|^\.cx-scrim:has\(> \.cx-extract\)$/);
    }
    const keyframes = [...partI.matchAll(/@keyframes\s+([\w-]+)/g)].map((m) => m[1]);
    expect(keyframes.sort()).toEqual(['cx-extract-flow', 'cx-extract-turn']);
  });
  it('names no literal duration: its motion is the tokens\' (so reduced motion\'s 0s reaches it too)', () => {
    const decls = rules(partI).flatMap(([, body]) => declarations(body)).filter(([prop]) => /^(animation|transition)/.test(prop));
    expect(decls.length).toBeGreaterThan(0);
    for (const [prop, value] of decls) expect(`${prop}: ${value}`).not.toMatch(/(?<![\w-])\d+(\.\d+)?m?s\b/);
  });
  it('the disc turns while it runs; the file chips stream only while a file is copied', () => {
    for (const sel of ['.cx-extract.is-plan .cx-extract__disc', '.cx-extract.is-copy .cx-extract__disc', '.cx-extract.is-verify .cx-extract__disc'])
      expect(ruleFor(sel), sel).toMatch(/animation: cx-extract-turn /);
    expect(ruleFor('.cx-extract__chip')).toContain('display: none');
    expect(ruleFor('.cx-extract.is-copy .cx-extract__chip')).toMatch(/display: block;.*animation: cx-extract-flow /s);
  });
  it('the bar is determinate: part G\'s .cx-bar with its sweep off, filled by --s2u-progress, one class more specific than part G\'s', () => {
    const fill = ruleFor('.cx-bar.cx-extract__bar i');
    expect(fill).toContain('animation: none');
    expect(fill).toContain('transform: scaleX(var(--s2u-progress, 0))');
    expect(ruleFor('.cx-extract__level')).toContain('transform: scaleY(var(--s2u-progress, 0))');
  });
  it('under reduced motion it stands still: no turning, no stream; the bar still fills (its value is the markup\'s)', () => {
    expect(reduced, 'a prefers-reduced-motion block in part I').not.toBe('');
    const still = rules(reduced);
    const off = (sel: string) => still.some(([s, body]) => s.split(',').map((x) => x.trim()).includes(sel) && /animation: none/.test(body));
    for (const sel of ['.cx-extract.is-plan .cx-extract__disc', '.cx-extract.is-copy .cx-extract__disc', '.cx-extract.is-verify .cx-extract__disc', '.cx-extract.is-copy .cx-extract__chip'])
      expect(off(sel), sel).toBe(true);
    expect(still.some(([s, body]) => s.includes('.cx-extract.is-copy .cx-extract__chip') && /display: none/.test(body))).toBe(true);
    expect(reduced).not.toMatch(/--s2u-progress|scaleX/);
  });
  it('forced colours keep the marks (CanvasText)', () => {
    expect(partI).toMatch(/@media \(forced-colors: active\)\s*{[^@]*\.cx-extract__chip[^}]*CanvasText/);
  });
  it('the README names it under 1.8.0: part I, the classes, the reduced motion, DA.R3\'s line, and that it is an adaptation', () => {
    const s = section('## The extraction popover (part I, 1.8.0)');
    expect(s, 'a "The extraction popover (part I, 1.8.0)" section').not.toBe('');
    for (const w of ['cx-extract', 'cx-extract__bar', '--s2u-progress', 'prefers-reduced-motion', 'DA.R3', 'FI.R7']) expect(s, w).toContain(w);
    expect(s).toMatch(/adaptation/i);
  });
});

describe('1.9.0: the home\'s scrolling list, part J (CX-LEGEND of the redotcom front-end plan, issue #238)', () => {
  /* part J sits in the A-F block after part I, so A-F's guards above (no colour literal, the shadow and radius
     allowlists, no widened edge, tokens only) already read it; these hold what is its own. Part G draws the crossbar
     home with no scroll above the phone rule (.cx-home laid over the stage, its body as tall as its list), so a list
     taller than the stage ran under the legend, which took its rows' pointer. */
  const at = components.indexOf('/* ---- part J');
  // Part J alone: it ends at part K's mark (2.1.0, the screen head's Back, placed after it), else at G.
  const K = components.indexOf('/* ---- part K');
  const partJ = at < 0 ? '' : strip(components.slice(at, K > at && K < components.indexOf(G_MARK) ? K : components.indexOf(G_MARK)));
  const wide = /@media \(width > 760px\)\s*{((?:[^{}]|{[^{}]*})*)}/.exec(partJ)?.[1] ?? '';
  const ruleFor = (sel: string, css = wide) => rules(css).filter(([s]) => s.split(',').map((x) => x.trim()).includes(sel)).map(([, body]) => body).join(';');
  const decl = (body: string, prop: string) => declarations(body).filter(([k]) => k === prop).map(([, v]) => v).pop() ?? null;
  const section = (h: string) => { const i = readme.indexOf(h); return i < 0 ? '' : readme.slice(i + h.length).split(/\n## /)[0]; };
  const ROOM = 'calc(var(--s2u-focus-w) + 3px)';                         // part G: the ring's width at its 3px offset

  it('VERSION is at least 1.9.0 (additive: a minor bump), and part J follows part I inside the A-F block', () => {
    const [maj, min] = read('VERSION').trim().split('.').map(Number);
    expect(maj > 1 || (maj === 1 && min >= 9)).toBe(true);
    expect(at).toBeGreaterThan(components.indexOf('/* ---- part I'));
    expect(at).toBeLessThan(components.indexOf(G_MARK));
    expect(componentsAF).toContain('/* ---- part J');
  });
  it('every rule is above the phone rule (part G\'s own 760px rule scrolls the stage there), on the home\'s body and list only', () => {
    expect(wide, 'an @media (width > 760px) block in part J').not.toBe('');
    expect(partJ.replace(/@media \(width > 760px\)\s*{((?:[^{}]|{[^{}]*})*)}/, '')).not.toMatch(/{/);
    for (const [sel] of rules(wide))
      for (const s of sel.split(',').map((x) => x.trim())) expect(s).toMatch(/^\.cx-home \.cx-home__body$|^\.cx-home__body > \.cx-list(::-webkit-scrollbar| > \*)?$/);
    expect(partJ).not.toMatch(/@keyframes|animation|transition/);
  });
  it('the body takes the room the crossbar leaves, and the list is its own scroll container, bounded by it', () => {
    const body = ruleFor('.cx-home .cx-home__body');
    expect(decl(body, 'flex')).toBe('1 1 0');
    expect(decl(body, 'min-height')).toBe('0');
    const list = ruleFor('.cx-home__body > .cx-list');
    expect(decl(list, 'align-self')).toBe('stretch');
    expect(decl(list, 'min-height')).toBe('0');
    expect(decl(list, 'overflow-y')).toBe('auto');
    expect(decl(list, 'overscroll-behavior')).toBe('contain');
    expect(decl(list, 'scrollbar-width')).toBe('none');
    expect(ruleFor('.cx-home__body > .cx-list::-webkit-scrollbar')).toMatch(/display: none/);
    expect(decl(ruleFor('.cx-home__body > .cx-list > *'), 'flex-shrink')).toBe('0');
  });
  it('the pad\'s focus ring keeps its room inside the box, and the actions keep the design\'s width and place', () => {
    const list = ruleFor('.cx-home__body > .cx-list');
    expect(decl(list, 'padding')).toBe(ROOM);
    // No room taken below: the box's bottom is the stage's, so the last row clears the legend.
    expect(decl(list, 'margin')).toBe('calc(-1 * (var(--s2u-focus-w) + 3px)) calc(-1 * (var(--s2u-focus-w) + 3px)) 0');
    expect(decl(list, 'width')).toBe('calc(var(--s2u-cx-list-w) + 2 * (var(--s2u-focus-w) + 3px))');
  });
  it('part G is untouched: the home\'s rules there are the export\'s', () => {
    const g = strip(components.slice(components.indexOf(G_MARK)));
    expect(g).toContain('.cx-home__body { margin-top: 2.25rem; margin-left: calc(var(--s2u-cx-cat-pitch) + 4rem); display: flex; gap: 6rem; align-items: flex-start; min-height: 0; }');
    expect(g).toContain('.cx-stage { position: relative; min-height: 0; }');
  });
  it('the README names it under 1.9.0: part J, the classes, the legend it clears, the ring\'s room, and that it is an adaptation', () => {
    const s = section('## The home\'s scrolling list (part J, 1.9.0)');
    expect(s, 'a "The home\'s scrolling list (part J, 1.9.0)" section').not.toBe('');
    for (const w of ['cx-home__body', 'cx-list', 'cx-legend', '760px', 'CX-LEGEND', '#238']) expect(s, w).toContain(w);
    expect(s).toMatch(/adaptation/i);
  });
});

describe('2.1.0: the screen head\'s Back, part K (CX-37 of the redotcom launcher plan)', () => {
  const at = components.indexOf('/* ---- part K');
  const partK = at < 0 ? '' : strip(components.slice(at, components.indexOf(G_MARK)));
  const section = (h: string) => { const i = readme.indexOf(h); return i < 0 ? '' : readme.slice(i + h.length).split(/\n## /)[0]; };

  it('VERSION is at least 2.1.0 (additive: a minor bump), and part K follows part J inside the A-F block', () => {
    const [maj, min] = read('VERSION').trim().split('.').map(Number);
    expect(maj > 2 || (maj === 2 && min >= 1)).toBe(true);
    expect(at).toBeGreaterThan(components.indexOf('/* ---- part J'));
    expect(at).toBeLessThan(components.indexOf(G_MARK));
    expect(componentsAF).toContain('/* ---- part K');
  });
  it('the Back control sits in the head, names no colour of its own, and part G\'s screen head is untouched', () => {
    expect(partK).toContain('.cx-screen .cx-screenhead > .cx-screenhead__id');
    expect(partK).toContain('.cx-screen .cx-back');
    expect(partK).toContain('html[data-input="pad"] .cx-screen .cx-back__pad');
    expect(partK).not.toMatch(/#[0-9a-f]{3,8}/i);
    const g = strip(components.slice(components.indexOf(G_MARK)));
    expect(g).toContain('.cx-screenhead { display: flex; align-items: flex-end; justify-content: space-between; gap: 2rem; flex-wrap: wrap; }');
  });
  it('the README names it under 2.1.0: part K, the classes, and that it is an adaptation', () => {
    const s = section('## The screen head\'s Back (part K, 2.1.0)');
    expect(s, 'a "The screen head\'s Back (part K, 2.1.0)" section').not.toBe('');
    for (const w of ['cx-back', 'cx-screenhead__id', 'Circle', 'CX-37']) expect(s, w).toContain(w);
    expect(s).toMatch(/adaptation/i);
  });
});

/* ---- the holes each guard closes, as strings ---- */

describe('the guards, adversarially', () => {
  it('edge: a 2px-or-wider border in any token colour but warn, in every form', () => {
    expect(widenedEdges('.a { border-top: 3px solid var(--s2u-gold); }')).toHaveLength(1);
    expect(widenedEdges('.b { border: 12px solid var(--s2u-panel); }')).toHaveLength(1);
    expect(widenedEdges('.c { border-inline-start: 2px solid var(--s2u-tab); }')).toHaveLength(1);
    expect(widenedEdges('.d { border-block-end-width: 2.5px; border-block-end-color: var(--s2u-text-dim); }')).toHaveLength(1);
    expect(widenedEdges('.e { border-width: 4px; border-style: solid; border-color: var(--s2u-panel-edge); }')).toHaveLength(1);
    expect(widenedEdges('.f { border-left: 2px solid var(--s2u-warn); }')).toEqual([]);
    expect(widenedEdges('.g { border: 5px solid transparent; border-left-color: var(--s2u-text-dim); }')).toEqual([]);
    expect(widenedEdges('.h { border: 1px solid var(--s2u-panel-edge); border-bottom: 0; }')).toEqual([]);
  });
  it('shadow: every part of a comma list is checked, not only the first', () => {
    expect(shadowsOffAllowlist('.a { box-shadow: var(--s2u-panel-inset), 0 4px 12px var(--s2u-gold); }')).toHaveLength(1);
    expect(shadowsOffAllowlist('.b { box-shadow: 0 0 0 2px var(--s2u-panel-edge), 0 0 0 4px var(--s2u-gold); }')).toHaveLength(1);
    expect(shadowsOffAllowlist('.c { box-shadow: inset 0 0 0 2px var(--s2u-warn); }')).toHaveLength(1);
    expect(shadowsOffAllowlist('.d { box-shadow: var(--s2u-viewer-lift), var(--s2u-panel-inset); }')).toEqual([]);
    expect(topLevelParts('a(1, 2), b, c(d(3, 4))')).toEqual(['a(1, 2)', 'b', 'c(d(3, 4))']);
  });
  it('!important: any spacing, any case, outside reduced motion only', () => {
    expect(importants('.a { color: var(--s2u-text) ! important; }')).toHaveLength(1);
    expect(importants('.b { color: var(--s2u-text)!IMPORTANT; }')).toHaveLength(1);
    expect(importants('@media (prefers-reduced-motion: reduce) { * { animation: none !important; } }')).toEqual([]);
  });
  it('boundary: a reach into ds/ on an import, from, href or @import line, or any s2u token or class', () => {
    expect(boundaryViolations("import { typeInto } from '../ds/typed';")).toHaveLength(1);
    expect(boundaryViolations("@import './ds/index.css';")).toHaveLength(1);
    expect(boundaryViolations('<link rel="stylesheet" href="/src/ds/index.css">')).toHaveLength(1);
    expect(boundaryViolations('el.classList.add(".s2u-tab");')).toHaveLength(1);
    expect(boundaryViolations('.menu { color: var(--s2u-gold); }')).toHaveLength(1);
    expect(boundaryViolations("import { move } from './roller';\n.menu { color: #c4a04a; }")).toEqual([]);
    expect(staticImports("import { a } from './roller';\nimport type { T } from './about';\nexport { X } from './github';\nimport './style.css';")).toEqual(['./roller.ts', './about.ts', './github.ts']);
  });
  it('radius: a literal radius, on the shorthand or a corner', () => {
    expect(offRadii('.a { border-radius: 6px; }')).toHaveLength(1);
    expect(offRadii('.b { border-top-left-radius: var(--s2u-space-2); }')).toHaveLength(1);
    expect(offRadii('.c { border-radius: var(--s2u-radius-viewer); } .d { border-radius: 50%; }')).toEqual([]);
  });
  it('token declarations: filter, text-decoration, scrollbar-color, fill-color, logical borders and masks are read', () => {
    expect(offTokenDeclarations('.a { filter: blur(2px) brightness(1.2); }')).toHaveLength(1);
    expect(offTokenDeclarations('.b { text-decoration: underline wavy red; }')).toHaveLength(1);
    expect(offTokenDeclarations('.c { scrollbar-color: rgb(0 0 0) auto; }')).toHaveLength(1);
    expect(offTokenDeclarations('.d { -webkit-text-fill-color: gold; }')).toHaveLength(1);
    expect(offTokenDeclarations('.e { border-inline-start: 1px solid #061a1c; }')).toHaveLength(1);
    expect(offTokenDeclarations('.f { mask-image: radial-gradient(circle, black, transparent); }')).toHaveLength(1);
    expect(offTokenDeclarations('.g { filter: blur(0.45px) drop-shadow(0 0 2px var(--s2u-gold)); text-decoration: none; border-block: 1px solid var(--s2u-panel-edge); }')).toEqual([]);
    expect(offTokenDeclarations('.h { mask-image: linear-gradient(to right, var(--s2u-ground) calc(100% - 28px), transparent); }')).toEqual([]);
    expect(offTokenDeclarations('.i { mask-image: linear-gradient(to right, #000 calc(100% - 28px), transparent); }')).toHaveLength(1);
    // a color-mix of two tokens is tokens only; a literal inside it is still a literal
    expect(offTokenDeclarations('.j { text-decoration-color: color-mix(in srgb, var(--s2u-gold) 45%, var(--s2u-panel)); }')).toEqual([]);
    expect(offTokenDeclarations('.k { text-decoration-color: color-mix(in srgb, #c4a04a 45%, var(--s2u-panel)); }')).toHaveLength(1);
  });
  it('unknown vars: an old page token, a --pg-* declared nowhere, a --s2u-* the tokens do not know', () => {
    const t = new Map([['--s2u-gutter', '24px'], ['--s2u-max', '1200px']]);
    expect(unknownVars('.hero { padding: 96px var(--gutter) 84px; }', t)).toEqual(['--gutter']);
    expect(unknownVars(':root { --pg-shade-1: rgba(0, 14, 17, 0.9); } .a { max-width: var(--max); background: var(--pg-shade-2); color: var(--s2u-nothing); }', t))
      .toEqual(['--max', '--pg-shade-2', '--s2u-nothing']);
    expect(unknownVars(':root { --pg-shade-1: rgba(0, 14, 17, 0.9); } .a { padding: var(--s2u-gutter); max-width: var(--s2u-max); background: var(--pg-shade-1); animation-delay: calc(var(--i, 0) * 60ms); width: calc(var(--s2u-progress) * 100%); }', t)).toEqual([]);
  });
  it('data URI: a colour that is not one of the tokens', () => {
    const t = ':root { --s2u-gold: #c4a04a; }';
    expect(dataUriColoursOffTokens("url(\"data:image/svg+xml,%3Cpath stroke='%23ff0000'/%3E\")", t)).toEqual(['%23ff0000']);
    expect(dataUriColoursOffTokens("url(\"data:image/svg+xml,%3Cpath stroke='%23C4A04A'/%3E\")", t)).toEqual([]);
  });
});

/**
 * 2.2.0: the console launcher's motion polish (CX-54; CX.R19, the owner, 2026-10-20: "a UI animation polish pass leaning
 * towards the sony / socom feel of it"). Short and decisive, a slight overshoot at most, compositor-only (transform and
 * opacity), no layout shift; reduced motion stops all of it (base.css's 0s durations and its transition / animation
 * stop). Additive: no earlier rule's value changes but the dialog's and the toast's curve.
 */
describe('2.2.0: the launcher motion polish (CX-54)', () => {
  const bodyOf = (sel: string) => rules(components).filter(([s]) => s.split(',').map((x) => x.trim()).includes(sel)).map(([, b]) => b).join(';');
  const keyframes = (name: string) => new RegExp(`@keyframes ${name}\\s*\\{([^}]*\\}[^}]*)\\}`).exec(components)?.[1] ?? '';
  it('one settle curve, a slight overshoot only (its y no further than 1.15), declared in base', () => {
    const m = /--s2u-ease-settle:\s*cubic-bezier\(([^)]*)\)/.exec(base);
    expect(m).not.toBeNull();
    const [, y1, , y2] = m![1]!.split(',').map(Number);
    expect(Math.max(y1!, y2!)).toBeLessThanOrEqual(1.15);
    expect(Math.max(y1!, y2!)).toBeGreaterThan(1);
  });
  it('a dialog and the toast settle in on it', () => {
    // part L's rules, one step more specific than part G's (held by hash, so not edited)
    expect(bodyOf('.cx-scrim .cx-dialog')).toMatch(/animation:\s*cx-settle-pop var\(--s2u-dur-base\) var\(--s2u-ease-settle\)/);
    expect(bodyOf('body .cx-toast')).toMatch(/animation:\s*cx-settle-in var\(--s2u-dur-base\) var\(--s2u-ease-settle\)/);
    expect(keyframes('cx-settle-pop')).toMatch(/opacity/);
  });
  it('the focused row eases in by transform alone, and pulses a token glow on a layer that takes no pointer', () => {
    expect(bodyOf('.cx-app .cx-item.is-focused')).toMatch(/animation:\s*cx-focus /);
    expect(keyframes('cx-focus')).toMatch(/transform/);
    expect(keyframes('cx-focus')).not.toMatch(/height|width|padding|margin|top|left/);
    const glow = bodyOf('.cx-app .cx-item.is-focused::after');
    expect(glow).toMatch(/box-shadow:\s*var\(--s2u-title-glow\)/);
    expect(glow).toMatch(/pointer-events:\s*none/);
    expect(glow).toMatch(/animation:\s*cx-glow /);
    expect(keyframes('cx-glow')).toMatch(/opacity/);
    expect(keyframes('cx-glow')).not.toMatch(/box-shadow|transform/);
  });
  it('a press is a slight scale (a pad\'s Cross through the root mark, a click through :active)', () => {
    for (const sel of [':root[data-press="cross"] .cx-app .cx-item.is-focused', '.cx-app .cx-item:active', '.cx-app .cx-start:active']) {
      expect(bodyOf(sel), sel).toMatch(/transform:\s*scale\(0\.98\d?\)/);
    }
  });
  it('the version is at least 2.2.0 (2.3.0, part M, follows it)', () => {
    const [maj, min] = read('VERSION').trim().split('.').map(Number);
    expect(maj > 2 || (maj === 2 && min >= 2)).toBe(true);
    expect(tokensCss).toContain(`--s2u-version: "${read('VERSION').trim()}"`);
  });
});

/**
 * 2.3.0: the launcher's themes, part M (LR-1 of socomlegacy/docs/plans/2026-10-26-launcher-redesign.md; LR.R8: the seven
 * themes as --s2u-* token sets). Part M sits in the A-F block after part L, so A-F's guards above (no colour literal, the
 * shadow and radius allowlists, no widened edge, tokens only) already read it; these hold what is its own: one rule per
 * theme on the root's `data-s2u-theme`, each setting the five live theme tokens to that theme's set and nothing else.
 */
describe("2.3.0: the launcher's themes, part M (LR-1)", () => {
  const at = components.indexOf('/* ---- part M');
  const partM = at < 0 ? '' : strip(components.slice(at, components.indexOf(G_MARK)));
  const section = (h: string) => { const i = readme.indexOf(h); return i < 0 ? '' : readme.slice(i + h.length).split(/\n## /)[0]; };
  const IDS = ['navy-gold', 'deep-water', 'blackout', 'night-ops', 'jungle', 'desert', 'frost'];
  const LIVE: [string, string][] = [['sky-top', 'top'], ['sky-bottom', 'bottom'], ['sheet', 'sheet'], ['glow', 'glow'], ['trim', 'trim']];

  it('VERSION is at least 2.3.0 (additive: a minor bump), and part M follows part L inside the A-F block', () => {
    const [maj, min] = read('VERSION').trim().split('.').map(Number);
    expect(maj > 2 || (maj === 2 && min >= 3)).toBe(true);
    expect(tokensCss).toContain(`--s2u-version: "${read('VERSION').trim()}"`);
    expect(at).toBeGreaterThan(components.indexOf('/* ---- part L'));
    expect(at).toBeLessThan(components.indexOf(G_MARK));
    expect(componentsAF).toContain('/* ---- part M');
  });
  it.each(IDS)('the theme %s: one root rule sets the five live tokens to its own set, and nothing else', (id) => {
    const hit = rules(partM).filter(([s]) => s.split(',').map((x) => x.trim()).includes(`:root[data-s2u-theme="${id}"]`));
    expect(hit, id).toHaveLength(1);
    const decls = declarations(hit[0]![1]);
    expect(decls.map(([k]) => k).sort()).toEqual(LIVE.map(([k]) => `--s2u-lx-${k}`).sort());
    for (const [live, own] of LIVE) expect(decls.find(([k]) => k === `--s2u-lx-${live}`)?.[1], `${id} ${live}`).toBe(`var(--s2u-lx-theme-${id}-${own})`);
  });
  it("part M styles nothing but the root's theme mark, and every token it names is declared", () => {
    for (const [sel] of rules(partM)) for (const s of sel.split(',').map((x) => x.trim())) expect(s).toMatch(/^:root\[data-s2u-theme="[a-z-]+"\]$/);
    expect(missingTokens(partM, tokens)).toEqual([]);
  });
  it('the README names it under 2.3.0: part M, the seven themes, data-s2u-theme, LR.R8, and that it is an adaptation', () => {
    const s = section("## The launcher's themes (part M, 2.3.0)");
    expect(s, 'a "The launcher’s themes (part M, 2.3.0)" section').not.toBe('');
    for (const w of ['data-s2u-theme', '--s2u-lx-', 'LR.R8', 'Navy & Gold', 'Deep Water', 'Blackout', 'Night Ops', 'Jungle', 'Desert', 'Frost']) expect(s, w).toContain(w);
    expect(s).toMatch(/adaptation/i);
  });
});

