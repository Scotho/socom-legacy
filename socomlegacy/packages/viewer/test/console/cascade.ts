import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rootFontPx } from '../../src/console/fit';

/**
 * The console's layout computed from its rules, for the tests that cannot measure (jsdom has no layout): the tokens
 * (`shared/ds/base.css`, `tokens.css`), the cx layer (`shared/ds/components.css`) and the page's own rules
 * (`src/console/console.css`), resolved as the cascade does (the page's unlayered rules above the cx layer, the cx layer
 * above the page's `s2u.base` rules; within a tier the later rule; media queries at the viewport's width; `var()`
 * substituted, `calc` / `min` / `max` / `clamp` evaluated, `cqw` against the stage's width) and the root font-size
 * (`src/console/fit.ts` `rootFontPx`). Moved here unchanged from `crossbar.test.ts` (CX-17) for CX-19's Disc row, which
 * computes its partition the same way. A browser adaptation with no original (OT.R28).
 */
export const here = dirname(fileURLToPath(import.meta.url));
export const bare = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '');
export const read = (p: string): string => bare(readFileSync(resolve(here, p), 'utf-8'));
export const TOKENS = read('../../../../../shared/ds/tokens.css');
export const BASE = read('../../../../../shared/ds/base.css');
export const DS = read('../../../../../shared/ds/components.css');
export const PAGE = read('../../src/console/console.css');

/* ---------- the cascade, as far as these rules need it ---------- */

export interface Rule { sel: string[]; body: string; media: string[]; layered: boolean }
/** The style rules of `css`, with the media conditions and the layer they sit in. */
export function rulesOf(css: string, media: string[] = [], layered = false, out: Rule[] = []): Rule[] {
  let i = 0;
  while (i < css.length) {
    const open = css.indexOf('{', i);
    if (open < 0) break;
    const semi = css.indexOf(';', i);
    if (semi >= 0 && semi < open) { i = semi + 1; continue; }                     // `@layer a, b;`
    const head = css.slice(i, open).trim();
    let depth = 0;
    let end = open;
    for (; end < css.length; end++) {
      if (css[end] === '{') depth++;
      else if (css[end] === '}' && --depth === 0) break;
    }
    const inner = css.slice(open + 1, end);
    if (head.startsWith('@media')) rulesOf(inner, [...media, head.slice(6).trim()], layered, out);
    // CX-ASIDE: a container query's rules are kept, their condition marked `container <name> (<query>)`; `mediaAt` holds
    // none of them (they were dropped before), and a test that needs one reads it with its own stage width.
    else if (head.startsWith('@container')) rulesOf(inner, [...media, `container ${head.slice(10).trim()}`], layered, out);
    else if (head.startsWith('@layer')) rulesOf(inner, media, true, out);
    else if (!head.startsWith('@')) out.push({ sel: head.split(',').map((s) => s.trim().replace(/^:root\[data-console\]\s+/, '')), body: inner, media, layered });
    i = end + 1;
  }
  return out;
}
export const mediaAt = (m: string, w: number): boolean => {
  let r: RegExpExecArray | null;
  if ((r = /^\(width > (\d+)px\)$/.exec(m))) return w > Number(r[1]);
  if ((r = /^\(max-width: (\d+)px\)$/.exec(m))) return w <= Number(r[1]);
  if ((r = /^\(min-width: (\d+)px\)$/.exec(m))) return w >= Number(r[1]);
  return false;                                                                    // reduced motion, forced colours, hover: none
};
/**
 * The window a media condition is read at, for the tests that read the rules at a height and an input too (LR-17 to
 * LR-21; the batch review's F3 drew their five readers into this one): the size, the pointer (a fine one hovers, a
 * coarse one does not; default fine, the matrix's browser), reduced motion (default off) and, where a test reads a
 * container query, the container's width in rem (absent, no container query holds).
 */
export interface MediaEnv { w: number; h: number; pointer?: 'fine' | 'coarse'; reduced?: boolean; stageRem?: number }
const cmp = (v: number, op: string, n: number): boolean => (op === '>' ? v > n : op === '>=' ? v >= n : op === '<' ? v < n : v <= n);
/** One media feature (`(max-height: 550px)`, `(width > 760px)`, `(500px < height <= 800px)`, ...) at `env`; an unread one throws, never misread as false. */
export function mediaFeature(raw: string, env: MediaEnv): boolean {
  const f = raw.trim().replace(/^\(/, '').replace(/\)$/, '').trim();
  const dim = (d: string): number => (d === 'width' ? env.w : env.h);
  const flip = (op: string): string => (op === '<' ? '>' : '>=');
  const pointer = env.pointer ?? 'fine';
  let m: RegExpExecArray | null;
  if ((m = /^(width|height) (>|>=|<|<=) (\d+)px$/.exec(f))) return cmp(dim(m[1]!), m[2]!, Number(m[3]));
  if ((m = /^(max|min)-(width|height): (\d+)px$/.exec(f))) return m[1] === 'max' ? dim(m[2]!) <= Number(m[3]) : dim(m[2]!) >= Number(m[3]);
  if ((m = /^(\d+)px (<|<=) (width|height)$/.exec(f))) return cmp(dim(m[3]!), flip(m[2]!), Number(m[1]));
  if ((m = /^(\d+)px (<|<=) (width|height) (<|<=) (\d+)px$/.exec(f))) return cmp(dim(m[3]!), flip(m[2]!), Number(m[1])) && cmp(dim(m[3]!), m[4]!, Number(m[5]));
  if ((m = /^orientation: (landscape|portrait)$/.exec(f))) return (env.w > env.h) === (m[1] === 'landscape');
  if ((m = /^pointer: (coarse|fine)$/.exec(f))) return pointer === m[1];
  if ((m = /^hover: (none|hover)$/.exec(f))) return (pointer === 'coarse') === (m[1] === 'none');   // a touch screen has no hover
  if (f === 'prefers-reduced-motion: reduce') return !!env.reduced;
  if (f === 'prefers-reduced-motion: no-preference') return !env.reduced;
  if (f === 'forced-colors: active') return false;
  throw new Error(`an unread media feature "${raw}"`);
}
/** A rule's condition (`rulesOf`'s: a media query's `and`-joined features, or `container <name> (width < Xrem)`) at `env`. */
export function mediaHolds(cond: string, env: MediaEnv): boolean {
  if (cond.startsWith('container ')) {
    const m = /^container [\w-]+ \(width (<|<=|>|>=) ([\d.]+)rem\)$/.exec(cond.trim());
    if (!m) throw new Error(`an unread container query "${cond}"`);
    return env.stageRem != null && cmp(env.stageRem, m[1]!, Number(m[2]));
  }
  return cond.split(/\s+and\s+/).every((p) => mediaFeature(p, env));
}
/** Whether every condition `r` sits under holds at `env`. */
export const ruleApplies = (r: Rule, env: MediaEnv): boolean => r.media.every((m) => mediaHolds(m, env));
/** The declarations of `body` in order, as [property, value]. */
export const declsOf = (body: string): [string, string][] => body.split(';').flatMap((d) => {
  const m = /^\s*([\w-]+)\s*:\s*([\s\S]+?)\s*$/.exec(d);
  return m ? [[m[1]!, m[2]!] as [string, string]] : [];
});
/** A top-level split of a value at its spaces (a function's arguments kept whole). */
export function words(v: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of v.trim()) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (/\s/.test(ch) && depth === 0) { if (cur) out.push(cur); cur = ''; } else cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

export const PAGE_RULES = rulesOf(PAGE);
/** The cascade's tiers, strongest first: the page's unlayered rules, the cx layer, the page's `s2u.base` rules. */
export const TIERS: Rule[][] = [PAGE_RULES.filter((r) => !r.layered), rulesOf(DS, [], true), PAGE_RULES.filter((r) => r.layered)];
export const declIn = (body: string, prop: string): string | null => {
  let v: string | null = null;
  for (const d of body.split(';')) {
    const m = /^\s*([\w-]+)\s*:\s*([\s\S]+?)\s*$/.exec(d);
    if (m && m[1] === prop) v = m[2]!;
  }
  return v;
};
/**
 * The size in a `font` shorthand (`400 0.875rem/1 ...`, or LR-46's `400 calc(0.875rem * var(--cx-text-scale))/1 ...`): the
 * word before the line-height's slash, a `calc()` kept whole; null where there is none.
 */
export function fontSizeOf(font: string): string | null {
  for (const w of words(font)) {
    const m = /^((?:calc\(.*\))|[\d.]+(?:rem|px|em))\//.exec(w);
    if (m) return m[1]!;
  }
  return null;
}
export function inTier(tier: Rule[], sel: string, prop: string, w: number): string | null {
  let v: string | null = null;
  for (const r of tier) {
    if (!r.sel.includes(sel) || !r.media.every((m) => mediaAt(m, w))) continue;
    const d = declIn(r.body, prop) ?? (prop === 'font-size' ? fontSizeOf(declIn(r.body, 'font') ?? '') : null);
    if (d) v = d;
  }
  return v;
}
/** The value of `prop` on the element `sels` names (most specific first) at a viewport `w` px wide, or null. */
export function value(sels: string[], prop: string, w: number): string | null {
  for (const tier of TIERS) for (const s of sels) { const v = inTier(tier, s, prop, w); if (v) return v; }
  return null;
}
export const must = (sels: string[], prop: string, w: number): string => {
  const v = value(sels, prop, w);
  if (v == null) throw new Error(`no ${prop} for ${sels.join(' / ')} at ${w}px`);
  return v;
};

/**
 * The custom properties at `w`, each name's definitions weakest first: the tokens, then any the cx layer or the page
 * declares (their scope ignored: one page, one element each). Within its own definition a name means its next weaker
 * one, as an inherited value does (`--x: min(var(--x), ...)` on a child reads the parent's).
 */
export function varsAt(w: number): Map<string, string[]> {
  const vars = new Map<string, string[]>();
  const take = (body: string) => { for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+)/g)) vars.set(m[1]!, [...(vars.get(m[1]!) ?? []), m[2]!.trim()]); };
  take(/:root\s*\{([^}]*)\}/.exec(TOKENS)?.[1] ?? '');
  take(/:root\s*\{([^}]*)\}/.exec(BASE)?.[1] ?? '');
  for (const tier of [...TIERS].reverse()) for (const r of tier) if (r.media.every((m) => mediaAt(m, w))) take(r.body);
  return vars;
}
export function expand(s: string, vars: Map<string, string[]>, ceil = new Map<string, number>()): string {
  return s
    .replace(/env\([^,()]+,\s*([^()]+)\)/g, '($1)')
    .replace(/var\((--[\w-]+)\)/g, (_, n: string) => {
      const defs = vars.get(n) ?? [];
      const k = (ceil.get(n) ?? defs.length) - 1;
      if (k < 0) throw new Error(`${n} is declared nowhere`);
      return `(${expand(defs[k]!, vars, new Map(ceil).set(n, k))})`;
    });
}

export interface At { w: number; h: number; ui: number; px: number; bar: number }
/**
 * A length in rem: `var()` and `env()` substituted, then calc / min / max / clamp / round, rem, px, cqw (the stage's
 * width) and % (a width's, against the bar).
 */
export function rem(expr: string, at: At, widthPercent = false): number {
  const s = expand(expr, varsAt(at.w));
  let i = 0;
  const ws = () => { while (/\s/.test(s[i] ?? '')) i++; };
  const sum = (): number => {
    let v = prod();
    for (;;) {
      ws();
      if (s[i] === '+') { i++; v += prod(); } else if (s[i] === '-' && /\s/.test(s[i + 1] ?? '')) { i++; v -= prod(); } else return v;
    }
  };
  const prod = (): number => {
    let v = atom();
    for (;;) {
      ws();
      if (s[i] === '*') { i++; v *= atom(); } else if (s[i] === '/') { i++; v /= atom(); } else return v;
    }
  };
  const list = (): number[] => {
    const out = [sum()];
    ws();
    while (s[i] === ',') { i++; out.push(sum()); ws(); }
    if (s[i++] !== ')') throw new Error(`unclosed in "${s}"`);
    return out;
  };
  const atom = (): number => {
    ws();
    if (s[i] === '(') { i++; const [v] = list(); return v!; }
    // CX-CROSSBAR: `round(<strategy>, A, B)` (CSS Values 4; the strategy defaults to nearest), A to a multiple of B.
    const rnd = /^round\(\s*(?:(nearest|up|down|to-zero)\s*,)?/.exec(s.slice(i));
    if (rnd) {
      i += rnd[0].length;
      const [a, b] = list();
      const q = a! / b!;
      const k = rnd[1] === 'down' ? Math.floor(q + 1e-9) : rnd[1] === 'up' ? Math.ceil(q - 1e-9) : rnd[1] === 'to-zero' ? Math.trunc(q) : Math.round(q);
      return k * b!;
    }
    const fn = /^(calc|min|max|clamp)\(/.exec(s.slice(i));
    if (fn) {
      i += fn[0].length;
      const a = list();
      return fn[1] === 'min' ? Math.min(...a) : fn[1] === 'max' ? Math.max(...a) : fn[1] === 'clamp' ? Math.max(a[0]!, Math.min(a[1]!, a[2]!)) : a[0]!;
    }
    const m = /^(-?[\d.]+)(rem|px|cqw|em|%)?/.exec(s.slice(i));
    if (!m) throw new Error(`cannot read "${s.slice(i)}" in "${expr}"`);
    i += m[0].length;
    const n = Number(m[1]);
    // `%` is a width's against the bar (the crossbar, the strip's containing block, as wide as the stage): only the
    // crossbar strip's width reads one (CX-CROSSBAR); any other `%` (a height's, a top's) is refused, never misread
    // (the review's F2) -- the caller says a width (`widthPercent`).
    if (m[2] === '%' && !widthPercent) throw new Error(`a % outside a width in "${expr}": pass widthPercent for a width`);
    return m[2] === 'px' ? n / at.px : m[2] === 'cqw' || m[2] === '%' ? (n * at.bar) / 100 : n;
  };
  const v = sum();
  ws();
  if (i < s.length) throw new Error(`trailing "${s.slice(i)}" in "${expr}"`);
  return v;
}
/** The `n`th of a 1-4 value shorthand (top, right, bottom, left), split at the top level. */
export function side(v: string, n: 0 | 1 | 2 | 3): string {
  const parts: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of v.trim()) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (/\s/.test(ch) && depth === 0) { if (cur) parts.push(cur); cur = ''; } else cur += ch;
  }
  if (cur) parts.push(cur);
  const pick = [[0, 0, 0, 0], [0, 1, 0, 1], [0, 1, 2, 1], [0, 1, 2, 3]][parts.length - 1]!;
  return parts[pick[n]!]!;
}

export const at = (w: number, h: number, ui: number): At => {
  const px = rootFontPx(w, h, ui);
  const a: At = { w, h, ui, px, bar: 0 };
  a.bar = w / px - 2 * rem(side(must(['.cx-app'], 'padding', w), 1), a);       // the stage: the frame's padding off
  return a;
};
