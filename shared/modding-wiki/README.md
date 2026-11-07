# The SOCOM Legacy modding wiki

A static docs site for SOCOM Legacy's packs, built with [Fumadocs](https://fumadocs.dev) on Next.js and exported as
plain files (`output: 'export'`, `trailingSlash: true`), so any static host serves `out/`. Its plan is batch B205,
"The modding wiki" (the rulings MW.R1-R11).

This folder is **its own npm package, outside the repository's workspace**: the root `package.json` lists `shared`
itself as a workspace, not `shared/*`, so Next.js, React and Fumadocs never enter the game's install, the gate's
`npm ci`, its typecheck, its tests or its build. `workflow/tests/test_modding_wiki.py` (in the gate's guard tests)
holds that line.

## Run, build, check

From this folder (never from the repository root):

```bash
npm ci            # the wiki's own packages, from its own package-lock.json
npm run dev       # the dev server on http://localhost:5330
npm run build     # the static export into out/
npm run check     # the build, then scripts/check-out.mjs over out/
```

`npm run check` passes when every page of the plan's sitemap and every page under `content/docs/` was exported
and every internal `href` and `src` in every exported HTML file resolves to a file in `out/`, and when the search
index was exported to `out/api/search` and the search dialog's own client, loading that file, finds the anatomy page
for "manifest". It reads files only, with no network. A build is a heavy run on a shared host: run one at a time and end its processes when it ends.

Next.js's telemetry is off for every script (`scripts/run-next.mjs` sets `NEXT_TELEMETRY_DISABLED`).

## Layout

| path | what |
|---|---|
| `content/docs/` | the pages (MDX) and the sidebars (`meta.json` in each folder) |
| `source.config.ts` | the Fumadocs MDX collection (`content/docs/`) and its frontmatter schema: `status` and `source` on every page |
| `lib/status.ts` | the five statuses a page can have (the plan's MW.R6) |
| `components/status-badge.tsx` | the status and what owns it, drawn at the top of every page |
| `lib/source.ts` | the page tree's loader; every page sits under the site's root |
| `app/` | the Next.js app: the layout, the page route, `global.css` (the theme) |
| `scripts/sync-theme.mjs` | copies the design system's tokens and font faces, the fonts and their OFL texts, and the SL mark in from `shared/` before every dev run and build |
| `scripts/check-out.mjs` | the static check over `out/` |
| `app/api/search/route.ts` | the search index, written once at build to `out/api/search` (Fumadocs' built-in search, static) |
| `components/search.tsx` | the search dialog, searching that index in the browser |
| `scripts/check-search.mjs` | the search check over `out/` |

## A page's status

Every page's frontmatter names one `status` -- `Works`, `Test room only`, `Forge, local only`, `Format only` or
`Planned` -- and a `source`: the repository path (or a list of paths) that owns that status, a line or range after
`:`. The build refuses a page without both; `socomlegacy/tools/test/moddingWikiStatus.test.ts` (in the repository's
tools suite) refuses a source that does not exist, and a shipped-sounding phrase ("now supports", "available in
game", ...) on a `Planned` or `Format only` page; `workflow/tests/test_modding_wiki.py` refuses a source the public
export leaves out, so the status test itself reads no excluded file and ships in the public tree. The reference pages' frontmatter is
written by their generator (`socomlegacy/tools/moddingWikiReference.ts`). zod is declared for the schema; it is the
version fumadocs-mdx already installed.

## The look

The S2U design system (`shared/ds/`, `shared/fonts/`) is the one source: `scripts/sync-theme.mjs` copies
`tokens.css` and `fonts.css` into `app/` and the fonts into `public/fonts/` (all git-ignored, never edited here), and
`app/global.css` maps the tokens onto Fumadocs UI's `--color-fd-*` variables. Dark is the design system's own
theme. Light is an adaptation for the wiki (the design system has none), made from the same tokens. No font comes
from a CDN.

## What never goes in

No game data of any kind: no disc file, decoded texture, model, sound, or frame of the game or of the port. Examples
use made-up assets. The plan's MW.R7 and the repository's RS.R8 hold this.

## Pinned versions

Every dependency is pinned exactly in `package.json`, and the lockfile pins the rest. Each was at least two weeks old
when taken (2026-11-06).

| package | version | licence |
|---|---|---|
| fumadocs-core, fumadocs-ui | 16.17.7 | MIT |
| fumadocs-mdx | 15.4.9 | MIT |
| zod | 4.6.7 | MIT |
| next | 16.4.2 | MIT |
| react, react-dom | 19.3.1 | MIT |
| tailwindcss, @tailwindcss/postcss | 4.3.3 | MIT |
| postcss | 8.5.31 | MIT |
| typescript | 5.9.3 | Apache-2.0 |
| @types/react, @types/react-dom | 19.3.0 | MIT |
| @types/node | 24.13.6 | MIT |
| @types/mdx | 2.0.14 | MIT |
