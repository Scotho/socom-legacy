// The wiki's search check over out/ (MW-9; the plan's MW.R8): no network, files only.
//   1. the static search index was exported where the search dialog fetches it (out/api/search, the route
//      app/api/search/route.ts's `staticGET`);
//   2. the dialog's own client (fumadocs-core's `staticClient`, the one components/search.tsx uses) loads that file and
//      a query for each QUERIES entry finds its page.
// Exit 0 with a one-line summary; exit 1 naming each failure.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const wiki = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(wiki, 'out');

/** Where the dialog fetches the index (components/search.tsx's `from`), as a site path. */
export const SEARCH_INDEX = '/api/search';

/** Each query and the page (a site path, no trailing slash) it must find. */
export const QUERIES = [{ query: 'manifest', page: '/anatomy' }];

const fail = (problems) => {
  for (const p of problems) console.error(`check-search: ${p}`);
  console.error(`check-search: FAILED -- ${problems.length} problem(s)`);
  process.exit(1);
};

if (!existsSync(out)) fail(['out/ is missing -- run `npm run build` first']);

const indexFile = join(out, ...SEARCH_INDEX.split('/').filter(Boolean));
if (!existsSync(indexFile) || !statSync(indexFile).isFile()) {
  fail([`no search index at out${SEARCH_INDEX} -- the static search route (app/api/search/route.ts) was not exported`]);
}
let data;
try {
  data = JSON.parse(readFileSync(indexFile, 'utf8'));
} catch (e) {
  fail([`out${SEARCH_INDEX} is not JSON: ${e.message}`]);
}

// The client fetches the index by its site path; here a site path is a file under out/ (no server, no network).
globalThis.fetch = async (url) => {
  const path = String(url);
  if (!path.startsWith('/')) throw new Error(`check-search: refused a fetch outside out/: ${path}`);
  const file = join(out, ...path.split('?')[0].split('/').filter(Boolean));
  if (!existsSync(file) || !statSync(file).isFile()) return new Response('not found', { status: 404 });
  return new Response(readFileSync(file), { status: 200, headers: { 'content-type': 'application/json' } });
};

const { staticClient } = await import('fumadocs-core/search/client/orama-static');
const client = staticClient({ from: SEARCH_INDEX });

const pageOf = (url) => {
  const p = String(url).split('#')[0].split('?')[0];
  return p.length > 1 ? p.replace(/\/$/, '') : p;
};

const problems = [];
let hits = 0;
for (const { query, page } of QUERIES) {
  const results = await client.search(query);
  hits += results.length;
  const pages = [...new Set(results.map((r) => pageOf(r.url)))];
  if (!pages.includes(page)) {
    problems.push(`"${query}" does not find ${page} (found: ${pages.join(', ') || 'nothing'})`);
  }
}
if (problems.length) fail(problems);
console.log(
  `check-search: OK -- index out${SEARCH_INDEX} (${data.type ?? 'unknown'}), ${QUERIES.length} quer${QUERIES.length === 1 ? 'y' : 'ies'}, ` +
    `${hits} result(s), every expected page found`,
);
