import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The parity registry (the test-architecture plan's TA.R4, `docs/plans/2026-10-02-test-architecture.md`; the schema
 * and its rules: `docs/parity/registry/README.md`). One JSON file per area under `docs/parity/registry/`; each entry is
 * one claim about what the original does, at a level (MISSION's proven or reading, or "drift" where the port's code
 * differs from its note), with its source, its research note and the tests that hold it, each test named by file and
 * exact it() title and marked by the data it needs. Every path is relative to `socomlegacy/`.
 *
 * Pure: the loader reads a directory; the validator and the summary take their file access as a parameter, so their
 * rules are unit-tested on planted entries (`tools/test/parityRegistry.test.ts`), and `tools/parity-report.ts` prints
 * the same summary as markdown.
 */

/** Where the registry lives, relative to `redotcom`. */
export const REGISTRY_DIR = 'docs/parity/registry';

export const LEVELS = ['proven', 'reading', 'drift'] as const;
export type Level = (typeof LEVELS)[number];
/** What a test needs to run: nothing (it runs on CI), the extracted fixtures, the disc (or the PC project), a capture. */
export const DATA = ['none', 'fixture', 'disc', 'capture'] as const;
export type Data = (typeof DATA)[number];

export interface RegistryTest { file: string; name: string; data: Data }
export interface RegistryEntry {
  id: string; claim: string; level: Level; source: string; note: string; tests: RegistryTest[]; owed?: string;
}
export interface RegistryFile { file: string; area: string; notes: string[]; entries: RegistryEntry[] }
/** An entry with the area and the file it was read from. */
export interface LoadedEntry extends RegistryEntry { area: string; file: string }
/** File access, paths relative to `redotcom`. */
export interface RegistryIo { exists(path: string): boolean; readText(path: string): string }

/** Every `*.json` of `dir`, by name; an absent directory is an empty registry. */
export function loadRegistry(dir: string): RegistryFile[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((n) => n.endsWith('.json')).sort().map((n) => {
    const raw = JSON.parse(readFileSync(join(dir, n), 'utf8')) as Partial<RegistryFile>;
    return { file: n, area: raw.area as string, notes: raw.notes as string[], entries: raw.entries as RegistryEntry[] };
  });
}

export function entriesOf(files: readonly RegistryFile[]): LoadedEntry[] {
  return files.flatMap((f) => (Array.isArray(f.entries) ? f.entries : []).map((e) => ({ ...e, area: f.area, file: f.file })));
}

const isText = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';
const ID = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/;
/** A test that runs with no game data (a malformed test, reported by `validate`, is not one). */
const isCiTest = (t: unknown): boolean => typeof t === 'object' && t !== null && (t as RegistryTest).data === 'none';

/** The file-level rules (the area is the file's name, the notes exist, the entries a list), then `validate`. */
export function validateFiles(files: readonly RegistryFile[], io: RegistryIo): string[] {
  const out: string[] = [];
  for (const f of files) {
    const base = f.file.replace(/\.json$/, '');
    if (f.area !== base) out.push(`${f.file}: area "${String(f.area)}" is not the file's name "${base}"`);
    if (!Array.isArray(f.notes)) out.push(`${f.file}: "notes" is not a list`);
    else for (const n of f.notes) if (!isText(n) || !io.exists(n)) out.push(`${f.file}: note ${String(n)} does not exist`);
    if (!Array.isArray(f.entries)) out.push(`${f.file}: "entries" is not a list`);
  }
  return out.concat(validate(entriesOf(files), io));
}

/** Every problem of `entries`, one line each; an empty list is a valid registry. */
export function validate(entries: readonly LoadedEntry[], io: RegistryIo): string[] {
  const out: string[] = [];
  const calls = new Map<string, TestCall[]>();
  /**
   * Whether every test of `file` whose title matches `name` (exactly, or a template's segments) sits behind skipIf /
   * runIf; undefined when none matches.
   */
  const conditionalOf = (file: string, name: string): boolean | undefined => {
    let t = calls.get(file);
    if (!t) calls.set(file, (t = testCalls(io.readText(file))));
    const hits = t.filter((c) => titleMatches(c, name));
    return hits.length === 0 ? undefined : hits.every((c) => c.conditional);
  };
  const seen = new Map<string, string>();
  for (const e of entries) {
    const at = `${e.file}: ${String(e.id)}`;
    if (!isText(e.id)) { out.push(`${e.file}: an entry with no id`); continue; }
    const before = seen.get(e.id);
    if (before !== undefined) out.push(`${at}: duplicate id ${e.id} (also in ${before})`);
    seen.set(e.id, e.file);
    if (!ID.test(e.id)) out.push(`${at}: the id is not lower-case words joined by dots`);
    if (!e.id.startsWith(`${e.area}.`)) out.push(`${at}: the id is not prefixed by its area "${e.area}."`);
    if (!isText(e.claim)) out.push(`${at}: no claim`);
    if (!isText(e.source)) out.push(`${at}: no source`);
    if (!(LEVELS as readonly string[]).includes(e.level)) out.push(`${at}: unknown level "${String(e.level)}"`);
    if (!isText(e.note) || !io.exists(e.note)) out.push(`${at}: note ${String(e.note)} does not exist`);
    const tests = Array.isArray(e.tests) ? e.tests : [];
    if (!Array.isArray(e.tests)) out.push(`${at}: "tests" is not a list`);
    for (const t of tests) {
      if (t === null || typeof t !== 'object' || Array.isArray(t)) { out.push(`${at}: a test that is not an object (${JSON.stringify(t)})`); continue; }
      if (!(DATA as readonly string[]).includes(t.data)) out.push(`${at}: unknown data "${String(t.data)}" for ${String(t.file)}`);
      if (!isText(t.file) || !io.exists(t.file)) { out.push(`${at}: test file ${String(t.file)} does not exist`); continue; }
      const conditional = isText(t.name) ? conditionalOf(t.file, t.name) : undefined;
      if (conditional === undefined) out.push(`${at}: ${t.file} has no it() titled "${String(t.name)}"`);
      else if (conditional && t.data === 'none') {
        out.push(`${at}: data "none" but "${t.name}" is behind skipIf/runIf (its own or a describe's): name the data it needs`);
      }
    }
    const inCi = tests.some(isCiTest);
    // `owed` is required when no no-data test holds the entry; on an entry held in CI it is allowed, and says what
    // further test is owed (TA.R4, amended 2026-10-02). Either way it says something.
    if (!isText(e.owed)) {
      if (tests.length === 0) out.push(`${at}: no test and no "owed"`);
      else if (!inCi) out.push(`${at}: every test needs data and no "owed" says what unit test is owed`);
      else if (e.owed !== undefined) out.push(`${at}: "owed" is empty: say which further test is owed, or drop it`);
    }
  }
  return out;
}

/**
 * Whether a registry name is a test's title: the same string, or, for a title with holes (`segments`), the static
 * segments in order, each hole one or more characters, anchored at both ends.
 */
export function titleMatches(call: TestCall, name: string): boolean {
  if (!call.segments) return call.title === name;
  const esc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${call.segments.map(esc).join('[\\s\\S]+')}$`).test(name);
}

/** A piece of a title: static text, or a hole (`null`). */
type Piece = string | null;

/** An it.each / .for title's formats (`%s`, `%d`, ..., `%#`, `%$`, `$name`) as holes; `%%` is a `%`. */
const FORMAT = /%%|%[sdifjoOc#$]|\$[A-Za-z_$][\w$]*(?:\.[\w$]+)*/g;
function formatPieces(text: string): Piece[] {
  const out: Piece[] = [];
  let at = 0;
  for (const m of text.matchAll(FORMAT)) {
    out.push(text.slice(at, m.index), m[0] === '%%' ? '%' : null);
    at = m.index + m[0].length;
  }
  out.push(text.slice(at));
  return out;
}

/** Pieces to segments: the static text between holes (n holes, n + 1 segments). */
function segmentsOf(pieces: readonly Piece[]): string[] {
  const out = [''];
  for (const p of pieces) if (p === null) out.push(''); else out[out.length - 1] += p;
  return out;
}

/** The index after the `}` closing the template hole whose `{` is at `src[i]`, stepping over nested code. */
function holeEnd(src: string, i: number): number {
  let depth = 0;
  for (let k = i; k < src.length; k++) {
    const skip = skipNonCode(src, k);
    if (skip >= 0) { k = skip - 1; continue; }
    if (src[k] === '{') depth++;
    else if (src[k] === '}' && --depth === 0) return k + 1;
  }
  return src.length;
}

/**
 * The end of the string literal opening at `src[i]` (a quote) and its pieces: static text, escapes read, and for a
 * template a hole (`null`) for each `${...}`.
 */
function literal(src: string, i: number): { end: number; pieces: Piece[] } {
  const q = src[i];
  const pieces: Piece[] = [];
  let text = '';
  for (let k = i + 1; k < src.length; k++) {
    const c = src[k]!;
    if (c === '\\') {
      const n = src[k + 1] ?? '';
      text += n === 'n' ? '\n' : n === 't' ? '\t' : n;
      k++;
    } else if (c === q) {
      pieces.push(text);
      return { end: k + 1, pieces };
    } else if (q === '`' && c === '$' && src[k + 1] === '{') {
      pieces.push(text, null);
      text = '';
      k = holeEnd(src, k + 1) - 1;
    } else {
      text += c;
    }
  }
  pieces.push(text);
  return { end: src.length, pieces };
}

/** Words after which an expression starts, so a slash opens a regex literal. */
const EXPR_KEYWORDS = new Set(['return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw', 'case',
  'do', 'else', 'yield', 'await']);

/**
 * Whether a slash at `src[i]` opens a regex literal: an expression starts there -- at the start, at a line start, after
 * an operator or an opening bracket (`( , = : [ ! & | ? { } ;` and the arithmetic ones), or after a keyword such as
 * `return` or `typeof`. After a name, a number, a closing bracket or a literal it is a division.
 */
function regexMayStart(src: string, i: number): boolean {
  let k = i - 1, newline = false;
  while (k >= 0 && /\s/.test(src[k]!)) { if (src[k] === '\n') newline = true; k--; }
  if (k < 0 || newline) return true;
  const c = src[k]!;
  if (/[(,=:[!&|?{};+\-*%<>~^]/.test(c)) return true;
  if (!/[\w$]/.test(c)) return false;
  let s = k;
  while (s > 0 && /[\w$]/.test(src[s - 1]!)) s--;
  return src[s - 1] !== '.' && EXPR_KEYWORDS.has(src.slice(s, k + 1));
}

/** The index after the comment, string, template or regex literal starting at `src[i]`, or -1 when none starts there. */
function skipNonCode(src: string, i: number): number {
  const c = src[i], n = src[i + 1];
  if (c === '/' && n === '/') { const e = src.indexOf('\n', i); return e < 0 ? src.length : e; }
  if (c === '/' && n === '*') { const e = src.indexOf('*/', i + 2); return e < 0 ? src.length : e + 2; }
  if (c === '\'' || c === '"' || c === '`') return literal(src, i).end;
  if (c === '/' && regexMayStart(src, i)) {
    let inClass = false;
    for (let k = i + 1; k < src.length; k++) {
      const d = src[k]!;
      if (d === '\\') k++;
      else if (d === '\n') return k;
      else if (d === '[') inClass = true;
      else if (d === ']') inClass = false;
      else if (d === '/' && !inClass) return k + 1;
    }
    return src.length;
  }
  return -1;
}

/** The index after the parenthesis that closes the one at `src[i]`, stepping over comments and literals. */
function closeParen(src: string, i: number): number {
  let depth = 0;
  for (let k = i; k < src.length; k++) {
    const skip = skipNonCode(src, k);
    if (skip >= 0) { k = skip - 1; continue; }
    const c = src[k]!;
    if (c === '(') depth++;
    else if (c === ')' && --depth === 0) return k + 1;
  }
  return src.length;
}

/**
 * One test call that runs: its title, and whether it (or an enclosing describe) sits behind skipIf / runIf. A title
 * with holes -- a template's `${...}`, or an it.each / .for title's `%s` / `$name` formats -- carries its static
 * `segments` (n holes, n + 1 segments; `titleMatches` reads them), and its `title` is the segments joined by `${}`.
 */
export interface TestCall { title: string; conditional: boolean; segments?: string[] }

const WORD = /[\w$]+/y;
const MOD = /\.\s*([A-Za-z]+)/y;

/**
 * The tests of `src` that run: the first argument of `it(` / `test(`, through any modifiers (`it.skipIf(...)(`,
 * `it.fails(`, `it.concurrent.skipIf(...)(`), in single, double or back quotes, escapes read. Code only: a call in a
 * comment, a string or a regex is not one. Not a test: a `describe`; `.skip` / `.todo` (nor anything inside a
 * `describe.skip`). A template's `${...}`, and an it.each / .for title's formats, are holes (`TestCall.segments`).
 * `conditional` marks a test whose own call, or an enclosing describe's, carries `skipIf` / `runIf` -- a test that may
 * not run where the data is absent.
 */
export function testCalls(src: string): TestCall[] {
  const out: TestCall[] = [];
  /** Per open parenthesis: whether the code inside it is conditional, and whether it is skipped. */
  const stack: { cond: boolean; skip: boolean }[] = [];
  const top = (): { cond: boolean; skip: boolean } => stack[stack.length - 1] ?? { cond: false, skip: false };
  const ws = (k: number): number => { while (k < src.length && /\s/.test(src[k]!)) k++; return k; };
  let prev = '';
  for (let k = 0; k < src.length; k++) {
    const skip = skipNonCode(src, k);
    if (skip >= 0) { k = skip - 1; prev = 'x'; continue; }
    const c = src[k]!;
    if (c === '(') { stack.push(top()); prev = c; continue; }
    if (c === ')') { stack.pop(); prev = c; continue; }
    if (!/[A-Za-z_$]/.test(c)) { if (!/\s/.test(c)) prev = c; continue; }
    WORD.lastIndex = k;
    const word = WORD.exec(src)![0];
    const after = k + word.length;
    const member = prev === '.';
    prev = 'x';
    if (member || !['it', 'test', 'describe'].includes(word)) { k = after - 1; continue; }
    let j = ws(after), cond = false, skipped = false, formatted = false;
    while (src[j] === '.') {
      MOD.lastIndex = j;
      const mod = MOD.exec(src);
      if (!mod) break;
      const name = mod[1]!;
      if (name === 'skipIf' || name === 'runIf') cond = true;
      if (name === 'skip' || name === 'todo') skipped = true;
      if (name === 'each' || name === 'for') formatted = true;
      j = ws(j + mod[0].length);
      if (src[j] === '(' && ['skipIf', 'runIf', 'each', 'for'].includes(name)) j = ws(closeParen(src, j));
    }
    if (src[j] !== '(') { k = after - 1; continue; }
    const scope = { cond: top().cond || cond, skip: top().skip || skipped };
    stack.push(scope);
    let a = ws(j + 1);
    const q = src[a];
    if (q === '\'' || q === '"' || q === '`') {
      const lit = literal(src, a);
      if (word !== 'describe' && !scope.skip) {
        const pieces = formatted ? lit.pieces.flatMap((p) => (p === null ? [p] : formatPieces(p))) : lit.pieces;
        const segments = segmentsOf(pieces);
        out.push(segments.length === 1
          ? { title: segments[0]!, conditional: scope.cond }
          : { title: segments.join('${}'), conditional: scope.cond, segments });
      }
      a = lit.end;
    }
    k = a - 1;
    prev = 'x';
  }
  return out;
}

/** The static titles (no hole) of the tests of `src` that run. */
export function testTitles(src: string): string[] {
  return testCalls(src).filter((t) => !t.segments).map((t) => t.title);
}

export interface Counts { entries: number; heldInCi: number; heldOnlyWithData: number; owed: number; drift: number }
export interface Summary { byArea: Record<string, Counts>; byLevel: Record<string, Counts>; total: Counts }

const zero = (): Counts => ({ entries: 0, heldInCi: 0, heldOnlyWithData: 0, owed: 0, drift: 0 });

/**
 * Per area and per level: the entries; those held in CI (at least one test with data "none"); those held only with
 * data (tests, none of them runnable without data); those owed (no test at all); and the drift entries.
 */
export function summarize(entries: readonly LoadedEntry[]): Summary {
  const s: Summary = { byArea: {}, byLevel: {}, total: zero() };
  for (const e of entries) {
    const tests = Array.isArray(e.tests) ? e.tests : [];
    for (const c of [(s.byArea[e.area] ??= zero()), (s.byLevel[e.level] ??= zero()), s.total]) {
      c.entries++;
      if (tests.some(isCiTest)) c.heldInCi++;
      else if (tests.length > 0) c.heldOnlyWithData++;
      else c.owed++;
      if (e.level === 'drift') c.drift++;
    }
  }
  return s;
}

const HEAD = ['entries', 'held in CI', 'held only with data', 'owed (no test)', 'drift'] as const;
const cells = (c: Counts): number[] => [c.entries, c.heldInCi, c.heldOnlyWithData, c.owed, c.drift];
function rows(s: Summary): [string, string, Counts][] {
  return [
    ...Object.keys(s.byArea).sort().map((a) => ['area', a, s.byArea[a]!] as [string, string, Counts]),
    ...LEVELS.filter((l) => s.byLevel[l]).map((l) => ['level', l, s.byLevel[l]!] as [string, string, Counts]),
    ['', 'total', s.total],
  ];
}

/** The summary as a plain-text table (the test prints it). */
export function summaryTable(s: Summary): string {
  const table = [['', '', ...HEAD], ...rows(s).map(([k, n, c]) => [k, n, ...cells(c).map(String)])];
  const width = table[0]!.map((_, i) => Math.max(...table.map((r) => r[i]!.length)));
  return table.map((r) => r.map((v, i) => (i < 2 ? v.padEnd(width[i]!) : v.padStart(width[i]!))).join('  ').trimEnd()).join('\n');
}

/** The summary as markdown: one table by area, one by level, the total last in each. */
export function summaryMarkdown(s: Summary): string {
  const md = (key: 'area' | 'level'): string => [
    `| ${key} | ${HEAD.join(' | ')} |`, `|---|${HEAD.map(() => '---:').join('|')}|`,
    ...rows(s).filter(([k]) => k === key || k === '').map(([, n, c]) => `| ${n} | ${cells(c).join(' | ')} |`),
  ].join('\n');
  return `${md('area')}\n\n${md('level')}`;
}

/**
 * The report `tools/parity-report.ts` prints, as markdown: the summary by area and by level; every entry with an
 * `owed` (marked held in CI, held only with data, or no test -- an entry held in CI may still owe a further test); the
 * drift entries; then every problem the validator finds. A malformed entry is a printed problem, never a throw.
 */
export function report(files: readonly RegistryFile[], io: RegistryIo): { text: string; problems: string[] } {
  const entries = entriesOf(files);
  const out: string[] = [`# The parity registry (${REGISTRY_DIR}, ${files.length} files, ${entries.length} entries)`, ''];
  out.push(summaryMarkdown(summarize(entries)), '');
  const owed = entries.filter((e) => isText(e.owed));
  out.push(`## Owed (${owed.length})`, '');
  for (const e of owed) {
    const tests: unknown[] = Array.isArray(e.tests) ? e.tests : [];
    const data = tests.map((t) => (typeof t === 'object' && t !== null ? String((t as RegistryTest).data) : 'not a test'));
    const held = tests.some(isCiTest) ? 'held in CI' : tests.length === 0 ? 'no test' : `held only with data (${data.join(', ')})`;
    out.push(`- \`${e.id}\` (${e.level}; ${held}): ${e.owed}`);
  }
  const drift = entries.filter((e) => e.level === 'drift');
  out.push('', `## Drift (${drift.length})`, '');
  for (const e of drift) out.push(`- \`${e.id}\`: ${e.claim} (${e.note}; ${e.source})`);
  const problems = validateFiles(files, io);
  out.push('', `## Problems (${problems.length})`, '', ...problems.map((p) => `- ${p}`));
  return { text: out.join('\n'), problems };
}
