// The wiki's shape held (FP-12a, FP.R9; product track, OT.R53: a project site's text, nothing the game does).
//
// Run from this folder with plain Node, no install: `node --test scripts/drift.test.mjs`. It reads files only (fs and
// JSON), so it runs where the wiki's own node_modules is absent. It fails when:
//   - a page under content/docs/ is missing from public/llms.txt (the plain-text index served at /llms.txt), or
//     llms.txt links a page that does not exist;
//   - a page is missing from the wiki map (content/docs/map.mdx, the information architecture), or the map links a
//     page that does not exist;
//   - a page lacks its agent block: one `## For agents` heading, the page's last section, holding one fenced `json`
//     block whose object has exactly {page, audience, summary, inputs, outputs, see_also}, `page` the page's own
//     address, `audience` drawn from players / creators / agents, and every `see_also` an existing page.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const WIKI = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT = join(WIKI, 'content', 'docs');
const LLMS = join(WIKI, 'public', 'llms.txt');
const MAP = 'map.mdx';

export const AUDIENCES = ['players', 'creators', 'agents'];
export const KEYS = ['page', 'audience', 'summary', 'inputs', 'outputs', 'see_also'];
export const HEADING = '## For agents';

const read = (p) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

/** Every page under content/docs/, as a path relative to it with forward slashes, sorted. */
export function pageFiles(dir = CONTENT) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...pageFiles(p));
    else if (/\.mdx?$/.test(name)) out.push(relative(CONTENT, p).split(sep).join('/'));
  }
  return out.sort();
}

/** A page's address on the site (lib/source.ts: every page under the root; trailingSlash): `kinds/index.mdx` -> `/kinds/`. */
export function route(rel) {
  const stem = rel.replace(/\.mdx?$/, '').replace(/(^|\/)index$/, '');
  return stem === '' ? '/' : `/${stem}/`;
}

/** The root-relative page addresses a Markdown text links (`](/x/)` or `](/x/#y)`), with a trailing slash. */
export function links(text) {
  const out = new Set();
  for (const m of text.matchAll(/\]\((\/[^)#\s]*)(?:#[^)]*)?\)/g)) {
    const url = m[1];
    if (/\.[a-z0-9]+$/i.test(url)) continue; // a file (/llms.txt), not a page
    out.add(url.endsWith('/') ? url : `${url}/`);
  }
  return out;
}

/** The text with every fenced code block blanked, so a heading inside a code example is not read as one. */
const unfenced = (text) => text.replace(/^```[^\n]*\n[\s\S]*?^```[ \t]*$/gm, '');

/**
 * The problems with one page's agent block (empty when it holds), and the block. `routes` is every page's address.
 */
export function agentBlockProblems(rel, text, routes) {
  const problems = [];
  const outside = unfenced(text);
  const headings = [...outside.matchAll(/^## .*$/gm)].map((m) => m[0].trim());
  const count = headings.filter((h) => h === HEADING).length;
  if (count !== 1) return { problems: [`${rel}: ${count} "${HEADING}" headings, not one`], block: null };
  if (headings.at(-1) !== HEADING) problems.push(`${rel}: "${HEADING}" is not the page's last section`);
  const after = text.slice(text.indexOf(`\n${HEADING}\n`) + HEADING.length + 2);
  const fence = /^\s*```json[ \t]*\n([\s\S]*?)\n```[ \t]*$/m.exec(after);
  if (!fence || after.slice(0, fence.index).trim() !== '') {
    return { problems: [...problems, `${rel}: no fenced json block right under "${HEADING}"`], block: null };
  }
  let block;
  try {
    block = JSON.parse(fence[1]);
  } catch (e) {
    return { problems: [...problems, `${rel}: the agent block is not JSON (${e.message})`], block: null };
  }
  if (block === null || typeof block !== 'object' || Array.isArray(block)) {
    return { problems: [...problems, `${rel}: the agent block is not a JSON object`], block: null };
  }
  const keys = Object.keys(block);
  for (const k of KEYS) if (!keys.includes(k)) problems.push(`${rel}: the agent block has no "${k}"`);
  for (const k of keys) if (!KEYS.includes(k)) problems.push(`${rel}: the agent block has an unknown key "${k}"`);
  if (block.page !== route(rel)) problems.push(`${rel}: "page" is ${JSON.stringify(block.page)}, not "${route(rel)}"`);
  const aud = block.audience;
  if (!Array.isArray(aud) || aud.length === 0) problems.push(`${rel}: "audience" is not a non-empty list`);
  else {
    for (const a of aud) if (!AUDIENCES.includes(a)) problems.push(`${rel}: unknown audience ${JSON.stringify(a)}`);
    if (new Set(aud).size !== aud.length) problems.push(`${rel}: an audience named twice`);
  }
  if (typeof block.summary !== 'string' || block.summary.trim() === '' || /\n/.test(block.summary)) {
    problems.push(`${rel}: "summary" is not one non-empty line`);
  }
  for (const k of ['inputs', 'outputs', 'see_also']) {
    const v = block[k];
    if (!Array.isArray(v) || v.some((x) => typeof x !== 'string' || x.trim() === '')) {
      problems.push(`${rel}: "${k}" is not a list of non-empty strings`);
    }
  }
  if (Array.isArray(block.see_also)) {
    for (const s of block.see_also) {
      if (typeof s === 'string' && !routes.has(s)) problems.push(`${rel}: see_also ${JSON.stringify(s)} is no page`);
    }
  }
  return { problems, block };
}

/** The pages an index (llms.txt or the map) misses, and the addresses it links that are no page. */
export function indexProblems(name, text, routes, skip = new Set()) {
  const linked = links(text);
  const problems = [];
  for (const r of routes) if (!skip.has(r) && !linked.has(r)) problems.push(`${name}: does not list ${r}`);
  for (const l of linked) if (!routes.has(l)) problems.push(`${name}: links ${l}, which is no page`);
  return problems;
}

// ---------------------------------------------------------------------------------------------------------------------

const files = pageFiles();
const routes = new Set(files.map(route));

test('the checker refuses what it should and passes a whole block', () => {
  const r = new Set(['/', '/anatomy/']);
  const good = { page: '/anatomy/', audience: ['creators'], summary: 'S.', inputs: [], outputs: ['x'], see_also: ['/'] };
  const page = (block, tail = '') => `---\ntitle: "T"\n---\n\n## One\n\nText.\n\n${HEADING}\n\n\`\`\`json\n${block}\n\`\`\`\n${tail}`;
  const ok = (b) => agentBlockProblems('anatomy.mdx', page(JSON.stringify(b, null, 2)), r).problems;
  assert.deepEqual(ok(good), []);
  assert.match(agentBlockProblems('anatomy.mdx', '## One\n\nText.\n', r).problems.join(), /0 "## For agents" headings/);
  assert.match(agentBlockProblems('anatomy.mdx', page(JSON.stringify(good)) + `\n${HEADING}\n`, r).problems.join(), /2 "## For agents"/);
  assert.match(agentBlockProblems('anatomy.mdx', page(JSON.stringify(good), '\n## Later\n'), r).problems.join(), /not the page's last/);
  assert.match(agentBlockProblems('anatomy.mdx', page('{"page": '), r).problems.join(), /not JSON/);
  assert.match(agentBlockProblems('anatomy.mdx', `## One\n\n${HEADING}\n\nNo block.\n`, r).problems.join(), /no fenced json/);
  const { see_also: _drop, ...noSee } = good;
  assert.match(ok(noSee).join(), /has no "see_also"/);
  assert.match(ok({ ...good, extra: 1 }).join(), /unknown key "extra"/);
  assert.match(ok({ ...good, page: '/other/' }).join(), /"page" is "\/other\/"/);
  assert.match(ok({ ...good, audience: ['modders'] }).join(), /unknown audience/);
  assert.match(ok({ ...good, audience: [] }).join(), /not a non-empty list/);
  assert.match(ok({ ...good, summary: '' }).join(), /"summary" is not one/);
  assert.match(ok({ ...good, inputs: [3] }).join(), /"inputs" is not a list/);
  assert.match(ok({ ...good, see_also: ['/gone/'] }).join(), /"\/gone\/" is no page/);
  assert.deepEqual(indexProblems('i', '- [A](/anatomy/)\n- [H](/)', r), []);
  assert.match(indexProblems('i', '- [A](/anatomy/)', r).join(), /does not list \//);
  assert.match(indexProblems('i', '- [A](/anatomy/) [H](/) [G](/gone/#x)', r).join(), /links \/gone\//);
  assert.equal(route('index.mdx'), '/');
  assert.equal(route('kinds/index.mdx'), '/kinds/');
  assert.equal(route('guides/first-pack.mdx'), '/guides/first-pack/');
});

test('finds the wiki\'s pages, the map among them', () => {
  assert.ok(files.length >= 16, `${files.length} pages`);
  assert.ok(files.includes(MAP), 'content/docs/map.mdx (the information architecture) is missing');
});

test('every page ends with a valid "For agents" block', () => {
  const problems = files.flatMap((rel) => agentBlockProblems(rel, read(join(CONTENT, rel)), routes).problems);
  assert.deepEqual(problems, []);
});

test('llms.txt lists every page and links no missing one', () => {
  let text = '';
  try {
    text = read(LLMS);
  } catch {
    assert.fail('public/llms.txt is missing');
  }
  assert.match(text, /^# /, 'llms.txt opens with its title');
  assert.deepEqual(indexProblems('llms.txt', text, routes), []);
});

test('the wiki map links every page and no missing one', () => {
  const text = read(join(CONTENT, MAP));
  assert.deepEqual(indexProblems(MAP, text, routes, new Set([route(MAP)])), []);
});
