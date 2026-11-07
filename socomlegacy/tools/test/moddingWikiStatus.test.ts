import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PAGES, STATUSES } from '../moddingWikiReference';

/**
 * Every page of the modding wiki carries one honest status (B205 MW-3, MW.R6; product track, OT.R53: a project
 * site's text, nothing the game does). It reads the wiki's committed files only (never its node_modules), so it runs
 * in the gate's tools suite with no Next.js installed:
 *
 * - each page's frontmatter names exactly one `status`, one of MW.R6's five, and any status line in the body agrees;
 * - each page's frontmatter names a `source` -- what owns the status -- and every source is a repository path that
 *   exists. That it also ships in the public export (no plan, no `HUMAN_TASKS.md`; MW.R6 names those by their ids in
 *   words, never by a link) is held by the workflow suite's `test_modding_wiki.py`, which reads the export's manifest:
 *   this test reads no file the export leaves out, so it ships in the public tree with the wiki (the MW-12 review's N1);
 * - no page whose status is Planned or Format only uses a shipped-claim phrase (`SHIPPED_CLAIMS`);
 * - the wiki's schema (`shared/modding-wiki/lib/status.ts`, read by `source.config.ts`) holds the same five values,
 *   and the page route draws the badge.
 */

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const WIKI = join(REPO, 'shared', 'modding-wiki');
const CONTENT = join(WIKI, 'content', 'docs');

/** Phrases that say a thing ships; a Planned or Format only page never uses one (lower case, matched anywhere). */
const SHIPPED_CLAIMS = [
  'now supports',
  'now supported',
  'now available',
  'available in game',
  'available in-game',
  'available in the game',
  'works in game',
  'works in-game',
  'works in the game',
  'supported in game',
  'supported in-game',
  'fully supported',
  'is live',
  'are live',
  'out now',
  'you can now',
  'ships today',
  'has shipped',
  'have shipped',
] as const;

/** The statuses that must never read as shipped. */
const UNSHIPPED = new Set<string>(['Planned', 'Format only']);

const text = (p: string): string => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

type Front = { keys: string[]; values: Record<string, unknown> };

/**
 * The frontmatter's top-level keys in order (repeats kept, so a doubled key is seen) and their values: a JSON value
 * (a double-quoted string or a flow list of them, as the generator writes) or a plain scalar; a block list
 * (`key:` then `  - item` lines) is a list.
 */
function frontmatter(src: string): { front: Front; body: string } | null {
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(src);
  if (!m) return null;
  const keys: string[] = [];
  const values: Record<string, unknown> = {};
  let listKey: string | null = null;
  for (const line of m[1]!.split('\n')) {
    const item = /^\s+-\s+(.*)$/.exec(line);
    if (item && listKey) {
      (values[listKey] as unknown[]).push(scalar(item[1]!));
      continue;
    }
    const kv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (!kv) continue;
    const [, key, raw] = kv as unknown as [string, string, string];
    keys.push(key);
    if (raw === '') {
      values[key] = [];
      listKey = key;
    } else {
      values[key] = scalar(raw);
      listKey = null;
    }
  }
  return { front: { keys, values }, body: src.slice(m[0].length) };
}

function scalar(raw: string): unknown {
  const t = raw.trim();
  if (t.startsWith('"') || t.startsWith('[')) return JSON.parse(t) as unknown;
  if (t.startsWith("'") && t.endsWith("'")) return t.slice(1, -1).replace(/''/g, "'");
  return t;
}

/** A source names a repository path, optionally with a line (`:12`, `:12-30`) or a section (`#heading`). */
function sourcePath(source: string): string {
  return source.replace(/#.*$/, '').replace(/:\d+(?:-\d+)?$/, '');
}

/** The problems with one page's status, source and wording; empty when it holds. */
function pageProblems(rel: string, src: string, repo = REPO): string[] {
  const problems: string[] = [];
  const parsed = frontmatter(src);
  if (!parsed) return [`${rel}: no frontmatter`];
  const { front, body } = parsed;
  const statusKeys = front.keys.filter((k) => k === 'status').length;
  const status = front.values['status'];
  if (statusKeys !== 1) problems.push(`${rel}: ${statusKeys} status keys, not one`);
  if (typeof status !== 'string') problems.push(`${rel}: status is not one value`);
  else if (!(STATUSES as readonly string[]).includes(status)) problems.push(`${rel}: status "${status}" is not one of MW.R6's five`);
  const lines = [...body.matchAll(/^\*\*Status: ([^*]+?)\.\*\*/gm)].map((m) => m[1]);
  if (lines.length > 1) problems.push(`${rel}: ${lines.length} status lines in the body`);
  for (const l of lines) if (l !== status) problems.push(`${rel}: the body says "${l}", the frontmatter "${String(status)}"`);

  const raw = front.values['source'];
  const sources = typeof raw === 'string' ? [raw] : Array.isArray(raw) ? raw : [];
  if (front.keys.filter((k) => k === 'source').length !== 1 || sources.length === 0) problems.push(`${rel}: no source`);
  for (const s of sources) {
    if (typeof s !== 'string' || s.trim() === '') {
      problems.push(`${rel}: an empty source`);
      continue;
    }
    const p = sourcePath(s);
    if (p.startsWith('/') || /^[A-Za-z]:/.test(p) || p.split('/').includes('..')) {
      problems.push(`${rel}: source ${s} is not a repository path`);
      continue;
    }
    if (!existsSync(join(repo, ...p.split('/')))) problems.push(`${rel}: source ${s} does not exist`);
  }

  if (typeof status === 'string' && UNSHIPPED.has(status)) {
    const words = `${String(front.values['title'] ?? '')}\n${String(front.values['description'] ?? '')}\n${body}`.toLowerCase();
    for (const claim of SHIPPED_CLAIMS) if (words.includes(claim)) problems.push(`${rel}: "${claim}" on a ${status} page`);
  }
  return problems;
}

const pages = walk(CONTENT)
  .filter((f) => /\.mdx?$/.test(f))
  .map((f) => relative(CONTENT, f).split(sep).join('/'))
  .sort();

describe('the modding wiki statuses (MW-3)', () => {
  it('finds the sitemap\'s pages', () => {
    expect(pages.length).toBeGreaterThanOrEqual(15);
    for (const p of ['index.mdx', 'anatomy.mdx', 'reference/manifest.mdx', 'publishing/thunderstore.mdx']) expect(pages).toContain(p);
  });

  it('gives every page one MW.R6 status and a source that exists, with no shipped claim on an unshipped page', () => {
    const problems = pages.flatMap((rel) => pageProblems(rel, text(join(CONTENT, rel))));
    expect(problems).toEqual([]);
  });

  it('writes the generated reference pages\' status and source into their frontmatter', () => {
    for (const page of PAGES) {
      const parsed = frontmatter(text(join(CONTENT, 'reference', `${page.slug}.mdx`)))!;
      expect(parsed.front.values['status']).toBe(page.status);
      expect(parsed.front.values['source']).toEqual(page.source);
    }
  });

  it('refuses what it should: two statuses, an unknown one, a missing source, a shipped claim', () => {
    const page = (front: string, body = 'Text.') => `---\ntitle: "T"\n${front}\n---\n\n${body}\n`;
    const ok = 'source: "socomlegacy/docs/specs/2026-10-25-pack-framework.md"';
    expect(pageProblems('a.mdx', page(`status: "Planned"\n${ok}`))).toEqual([]);
    expect(pageProblems('a.mdx', page(`status: "Works"\nsource:\n  - "socomlegacy/packages/creator-contracts/src/packs.ts:527-535"`))).toEqual([]);
    expect(pageProblems('a.mdx', page(`status: "Planned"\nstatus: "Works"\n${ok}`)).join()).toMatch(/2 status keys/);
    expect(pageProblems('a.mdx', page(`status: ["Planned", "Works"]\n${ok}`)).join()).toMatch(/not one value/);
    expect(pageProblems('a.mdx', page(`status: "Beta"\n${ok}`)).join()).toMatch(/not one of MW.R6/);
    expect(pageProblems('a.mdx', page(ok)).join()).toMatch(/0 status keys/);
    expect(pageProblems('a.mdx', page(`status: "Planned"\n${ok}`, '**Status: Works.** Text.')).join()).toMatch(/the body says "Works"/);
    expect(pageProblems('a.mdx', page('status: "Planned"')).join()).toMatch(/no source/);
    expect(pageProblems('a.mdx', page('status: "Planned"\nsource: "socomlegacy/docs/specs/no-such.md"')).join()).toMatch(/does not exist/);
    expect(pageProblems('a.mdx', page('status: "Planned"\nsource: "../outside.md"')).join()).toMatch(/not a repository path/);
    expect(pageProblems('a.mdx', page(`status: "Format only"\n${ok}`, 'The game now supports packs.')).join()).toMatch(/"now supports"/);
    expect(pageProblems('a.mdx', page(`status: "Planned"\n${ok}`, 'Available In Game today.')).join()).toMatch(/"available in game"/);
    expect(pageProblems('a.mdx', page(`status: "Works"\n${ok}`, 'The game now supports packs.'))).toEqual([]);
  });

  it('holds MW.R6\'s five statuses in the wiki\'s schema, and the page route draws the badge', () => {
    const lib = text(join(WIKI, 'lib', 'status.ts'));
    const list = /export const STATUSES = \[([^\]]*)\]/.exec(lib);
    expect(list, 'lib/status.ts exports STATUSES').not.toBeNull();
    expect([...list![1]!.matchAll(/'([^']+)'/g)].map((m) => m[1])).toEqual([...STATUSES]);
    const config = text(join(WIKI, 'source.config.ts'));
    expect(config).toMatch(/from '\.\/lib\/status'/);
    expect(config).toMatch(/status:\s*z\.enum\(STATUSES\)/);
    expect(config).toMatch(/source:/);
    const route = text(join(WIKI, 'app', '[[...slug]]', 'page.tsx'));
    expect(route).toMatch(/<StatusBadge status=\{page\.data\.status\} source=\{page\.data\.source\}/);
  });
});
