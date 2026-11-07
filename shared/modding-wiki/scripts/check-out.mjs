// The wiki's static check over out/ (MW-1; the plan's MW.R8): no network, files only.
//   1. every page of the plan's sitemap, and every page under content/docs/, was exported (out/<slug>/index.html);
//   2. every internal href and src in every exported HTML file resolves to a file in out/;
//   3. every route's prefetch segment files sit at the flat names the client router requests
//      (`<route>/__next.<segment path, '/' as '.'>.txt`, scripts/flatten-segments.mjs): no nested `__next.*` folder,
//      and each route with a `__next._tree.txt` holds its page segment, `__next.<...>__PAGE__.txt`.
// Exit 0 with a one-line summary; exit 1 naming each missing page and each broken link.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, posix, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { flatNames, nestedSegmentDirs } from './flatten-segments.mjs';

const wiki = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(wiki, 'out');
const content = join(wiki, 'content', 'docs');

// The plan's sitemap (socomlegacy/docs/plans/2026-11-06-modding-wiki.md, "The sitemap"), as URL paths.
export const SITEMAP = [
  '/',
  '/what-is-a-pack/',
  '/anatomy/',
  '/reference/manifest/',
  '/reference/bounds/',
  '/reference/codes/',
  '/kinds/',
  '/kinds/earlier-formats/',
  '/guides/first-pack/',
  '/guides/test-locally/',
  '/publishing/thunderstore/',
  '/rules-and-limits/',
  '/troubleshooting/',
  '/changelog/',
  '/contributing/',
];

function walk(dir) {
  const files = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) files.push(...walk(p));
    else files.push(p);
  }
  return files;
}

const toPosix = (p) => p.split(sep).join('/');

/** content/docs/a/b.mdx -> /a/b/, content/docs/a/index.mdx -> /a/ */
function urlOfContent(file) {
  let rel = toPosix(relative(content, file)).replace(/\.mdx?$/, '');
  if (rel === 'index') return '/';
  if (rel.endsWith('/index')) rel = rel.slice(0, -'/index'.length);
  return `/${rel}/`;
}

/** The file a site path names in a trailing-slash static export, or null. */
function fileOf(path) {
  const clean = decodeURIComponent(path);
  const candidates = clean.endsWith('/')
    ? [join(out, clean, 'index.html')]
    : [join(out, clean), join(out, clean, 'index.html'), join(out, `${clean}.html`)];
  return candidates.find((c) => existsSync(c) && statSync(c).isFile()) ?? null;
}

if (!existsSync(out)) {
  console.error('check-out: out/ is missing -- run `npm run build` first');
  process.exit(1);
}

const problems = [];
const expected = new Set(SITEMAP);
for (const f of walk(content)) if (/\.mdx?$/.test(f)) expected.add(urlOfContent(f));
for (const url of [...expected].sort()) {
  if (!fileOf(url)) problems.push(`missing page: ${url}`);
}

const html = walk(out).filter((f) => f.endsWith('.html'));
const ATTR = /\s(?:href|src)\s*=\s*"([^"]*)"/g;
let links = 0;
for (const file of html) {
  const page = `/${toPosix(relative(out, file))}`;
  const base = posix.dirname(page);
  const text = readFileSync(file, 'utf8');
  for (const m of text.matchAll(ATTR)) {
    const raw = m[1].replace(/&amp;/g, '&');
    if (raw === '' || raw.startsWith('#')) continue;
    if (/^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.startsWith('//')) continue; // external: not this check's
    const target = raw.split('#')[0].split('?')[0];
    if (target === '') continue;
    const abs = target.startsWith('/') ? target : posix.join(base, target) + (target.endsWith('/') ? '/' : '');
    links += 1;
    if (!fileOf(abs)) problems.push(`broken link: ${page} -> ${raw}`);
  }
}

// 3. The client router's prefetch files: a static host serves only the flat names it requests.
let routes = 0;
const nestedRoutes = new Set();
for (const segDir of nestedSegmentDirs(out)) {
  nestedRoutes.add(dirname(segDir));
  for (const { from, to } of flatNames(segDir)) {
    problems.push(
      `prefetch file missing: /${toPosix(relative(out, to))} (the build wrote it nested, at ` +
        `/${toPosix(relative(out, from))}; run scripts/flatten-segments.mjs)`,
    );
  }
}
for (const tree of walk(out).filter((f) => f.endsWith(`${sep}__next._tree.txt`))) {
  const dir = dirname(tree);
  if (toPosix(relative(out, dir)).startsWith('_next')) continue;
  routes += 1;
  if (nestedRoutes.has(dir)) continue; // named above, file by file
  const page = readdirSync(dir).some((n) => /^__next\..*__PAGE__\.txt$/.test(n) && statSync(join(dir, n)).isFile());
  const route = toPosix(relative(out, dir));
  if (!page) problems.push(`prefetch file missing: /${route ? `${route}/` : ''}__next.<segment>.__PAGE__.txt`);
}

if (problems.length) {
  for (const p of problems) console.error(`check-out: ${p}`);
  console.error(`check-out: FAILED -- ${problems.length} problem(s) over ${html.length} HTML files`);
  process.exit(1);
}
console.log(
  `check-out: OK -- ${expected.size} pages present (${SITEMAP.length} in the sitemap), ` +
    `${html.length} HTML files, ${links} internal links, 0 broken, ${routes} routes' prefetch files flat`,
);
