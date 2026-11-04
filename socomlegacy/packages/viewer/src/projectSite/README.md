# SOCOM II Legacy project pages

`/news`, `/roadmap`, `/journey`, `/archive` and `/server` are independent Vite HTML entry points. They share the design system with the
launcher, but import no game bootstrap, disc reader, controller, microphone or renderer. The small navigation row
inside `#disc-page` opens them in new tabs so the selected disc and setup stay in place; it disappears with the launcher.
Project pages have their own navigation and PLAY, the link back to the launcher. All links honor `BASE_URL`.

## Add content

Edit the typed collections under `content/`; page layouts do not need changing. Text is rendered with `textContent`,
not HTML. Use stable, unique lowercase IDs for article, phase and artifact permalinks. External source links open in
new tabs with `noopener noreferrer` and an accessible label.

- `news.ts`: published updates only. The initial collection is deliberately empty. Each record has a date (`YYYY-MM-DD`),
  kind, summary, optional version, change sections and optional source links. Posts sort newest first and can be filtered
  by kind. Dates use UTC to avoid changing the publication day with the visitor's time zone.
- `roadmap.ts`: ordered phases with milestones, status, summary and a criterion for moving on. Keep original parity,
  release validation and extensions separate. Statuses describe direction, not dates or completion percentages.
- `archive.ts`: catalog artifacts with period, format, original credit, preservation provenance and search tags. An
  `Available` record requires an HTTPS source and a checked date. A `Seeking` record cannot have a source or checked date.
  Confirm an archived item's exact capture URL and original URL before marking it available; a Wayback homepage is a
  research destination, not a recovered artifact. Do not embed tracking players or automatically download artifacts.
- `journey.ts` (`/journey`, TS-2): the project's own story in chapters and "How it's built" -- editorial, no person
  named, no outside link, no figure. Its figures (days, maps, tests passed, capture scores) are the generator's
  `journey` block in `siteData.json` (`tools/sitePages.ts`, each with its source); a figure the generator cannot back
  is left out, never typed here. No screenshots (MU.R22).

Example patch-note record (illustrative; not published):

```ts
{
  id: 'example-release', title: 'Example release', date: '2026-10-04', kind: 'Patch notes', version: 'example',
  summary: 'A short description of the actual released changes.',
  sections: [
    { title: 'Changed', items: ['Describe the player-visible change.'] },
    { title: 'Known issues', items: ['Describe any outstanding limitations.'] },
  ],
}
```

## The look (TS-3; MU.R21, MU.R22)

The public site's look (teaser@185764c3 `projectSite/`), built on `shared/ds` 1.2.0's part D with no local token: the shell
is the ds reading column (`s2u-reading`); the header holds the ds emblem (inline, `role="img"`, named "SOCOM II Legacy") in the
link home, the five pages' text nav (Server kept, Journey included) and PLAY (`s2u-action--primary`) back to the launcher;
the footer keeps the generated commit. Filters and tiles are `s2u-action` (pressed when chosen), "Clear filters", source and
"→" links `s2u-action--tertiary`; anything else a player can reach carries `project-tap` (the ds 44px). One ring for
keyboard and pad (`:focus-visible`, `.is-pad-focused`) at the ds focus tokens. The news aside, the roadmap note and the
archive's closing call are `s2u-panel--callout`. The archive is a hall per category (`ARCHIVE_HALLS`: number and a line),
each banner a plain `s2u-panel` -- no image is planned, no game screenshot (MU.R22) -- each tile's counts its
`aria-describedby`, and each exhibit stamped "On display" (Available) or "Wanted" (Seeking), its colour tested at 4.5:1; a wanted one says how to help without a link (no social links). Not taken
from the teaser: its screenshots, its community row and brand marks, the nav icons (the ds has no Server mark), hover
lifts. The journey's figures keep their sources as a quiet caption: a short label (`sourceLabel`), the full source in
the title. `test/projectSiteLook.test.ts` holds each line here.

`components.ts` provides the shell, badges, filters, empty states, source links and section headings.
`newsCard`, `roadmapPhase`, and `archiveCard` are reusable record renderers. The archive combines category, multi-term
search and availability filters; its query string is shareable and survives a reload. Clear filters resets all three.

## Generated from the repository (MU.R7)

`/server` is the game server's page, and the roadmap's sprint list, the news page's "Where the work stands", the issues
section, the server page's online roadmap and every footer's commit are **generated**, never written by hand:
`socomlegacy/tools/sitePages.ts` reads `docs/roadmap/SPRINTS.md`, HANDOFF's section 2, the plans' headers and an optional issues
snapshot, and writes `src/site/siteData.json`, which `generated.ts` renders. Run it from `socomlegacy/` after those documents change
and commit the file:

```
npm run site:pages -- [--issues FILE] [--commit SHA]     # = npx tsx tools/sitePages.ts
gh issue list --state all --limit 500 --json number,title,state,labels,milestone > issues.json   # the snapshot, outside the tree
```

Without `--issues` the issues section says it is not included in this build. The generator needs neither `gh` nor the network, keeps
only an issue's number, title, labels and milestone, and strips absolute paths and e-mail addresses from every text
(`tools/test/sitePages.test.ts`). The editorial content below (`news.ts`, `roadmap.ts` phases, `archive.ts`) stays hand-written: it
is direction and a catalogue, not repository facts. The server page reads the same-origin `/health` and `/rooms` live and shows
"not reachable" when served without the server.

The research wave (TS-4) added, each in `siteData.json` with its source and tested from fixtures and against the live documents:
`news` (each plan whose `## Log` records its landing on main or its close, at that entry's date, newest first -- the news page's
"From the project's plans"), `milestones` (the roadmap's first-phase milestone states, from the sprints and plans
`ROADMAP_MILESTONES` names), the sprint rows' `source` (SPRINTS' Status line first; a running or unstated sprint a plan's Log
has closed is closed; an unstated one HANDOFF section 2 names takes HANDOFF's state), and the journey's `chapters` (each
chapter's dates, from the plans `JOURNEY_CHAPTERS` names) and `now` (the running and scheduled sprints, and the work in
development `IN_DEVELOPMENT` lists while its plan records no close). No text names a person or an account (`sanitise`). The
content files state no figure, no date and no status (`test/journeyPage.test.ts` guards journey, news, archive and the
roadmap's first phase).

## Run and validate

From the repository root: `npm run dev`, `npm run typecheck`, `npm run build`.
Run the page tests from `socomlegacy/` with `npx vitest run packages/viewer/test/projectSite.test.ts`.
`e2e/project_site.py` is a Python Playwright check for a running dev/preview server; see its `--help` for the URL.
Test `/news`, `/roadmap`, `/archive` and their slash forms, keyboard focus, 320/390px layouts, filter reloads and links.

The default build is a standalone Legacy site rooted at `/`; output is `dist/viewer/`. A host must resolve each clean
route to its directory's `index.html`, answer a missing file with a real 404, and send every other path to the
page's `index.html` -- the base path is the menu flow and its routes, `/testroom` the viewer (OT.R10, OT.R19).
See `shared/deploy/site/nginx.conf`.
The old sister-project landing pages, site artwork, metadata, inbox and publishing stack are retired. No publishing
destination is configured and this change is not a deployment. Research provenance and original game evidence remain
in the research corpus; they are not public site marketing.
