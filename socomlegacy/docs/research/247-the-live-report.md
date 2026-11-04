# 247 -- The live report

Written 2026-10-07 for PT-12 of web sprint 34 (the plan `docs/plans/2026-10-07-web-sprint-34-the-session-and-the-briefing.md`;
the design `docs/specs/2026-10-06-playtest-and-replay-design.md` §4.5, "the report"). The code:
`packages/playtest/src/report/page.ts` (the template), `packages/playtest/src/report/http.ts` (the routes),
`packages/playtest/src/report/sse.ts` (the events), one mount line in `packages/playtest/src/service.ts`, the store's
`onChange` in `packages/playtest/src/session.ts`, and the export's default report in `packages/playtest/src/exportSession.ts`.
The tests: `packages/playtest/test/reportPage.test.ts` (jsdom: the DOM the template gives) and
`packages/playtest/test/reportHttp.test.ts` (a real `SessionService` on port 0). **A playtest instrument with no
original** (PLAYTEST_INSTRUMENT_ADAPTATION): nothing here reads or changes a game value or behaviour (PT.R3), so nothing
here is a parity finding. No game, browser or dev server was run for this note; the page was checked as a DOM in jsdom
and over HTTP from Node, never rendered in a browser -- its look on the design system is not yet seen.

## 1. The page: one document, no framework (W34.R2)

The report is what the player keeps open beside the game while a session runs, and what the export carries away
afterwards. It is one HTML document produced by one template function, `renderReport(record, mode)`, served by the
session service at `/report`. There is no framework and no bundler (W34.R2): the service is plain `node:http`, not Vite,
so a page that needed building would need a second toolchain inside a process whose job is to keep the record. A
template and the DOM's own `fetch`, `EventSource` and `DOMParser` are enough for one page of cards.

The routes, each mounted ahead of the service's own as `mountVerbs` does, so `service.ts` holds one line for them:

| route | answers |
|---|---|
| `GET /report` | the live page, `text/html` |
| `GET /report/events` | Server-Sent Events: `event: record` with the record as JSON after every `store.update`; a comment every `SSE_KEEPALIVE_S` |
| `GET /ds/<name>` | the design system from `shared/ds`, `text/css`: `index.css` and each file it `@import`s (read from `index.css`, not listed by hand); `..` or a slash 403, any other name 404 |
| `GET /evidence/<obs>/<file>` | one of a mark's three files, `frame.png`, `clip.webm` or `telemetry.json`, under the session's `marks/<obs>/`, with its type; `<obs>` must match the id's form `PT-<YYYYMMDD>-<4 hex>-<n>` and the file one of the three names, checked before any path is resolved (else 403: the review found `D:` reached another drive's root, F1); a valid one not there 404 |
| `POST /verb` | PT-11's, unchanged: the page's Send posts `{ verb: 'observe', args: { text, at?, by: 'player' } }` |

**The update.** The store tells its listeners after each write (`SessionStore.onChange`, one method, additive). The
event carries the record through the export's privacy filter (`exportRecord`), so the stream holds no host path or
address either. The page compares each observation's JSON with the last it saw; for those that changed it fetches
`/report` again and swaps in their card bodies (a new card is appended), and the header and the roll-up. The template
lives in the service, so the page re-reads it rather than carry a second renderer in its script. A card's typed text
sits outside the body that is swapped, so an update never eats what the player is typing. Once the record is closed
the inputs go (a player's write after `closedAt` is PT-13's to refuse). A change of the session's own fields (closing above all, which
brings the seek links) swaps every card. Two events close together can have their `/report` answers arrive out of
order: only the answer to the latest event is applied, and the cards an earlier event named stay pending until one is
(review F2, F3).

**Stopping.** `server.close()` waits for every open connection, and an event stream never ends by itself; `mountReport`
returns `close`, which `SessionService.stop` calls first, so a page left open does not hold the stop.

**Static mode**, the export's `report/index.html` (PT-17): the same cards with no form and no script, the evidence by
relative path, and the design system inlined in one `<style>` (no service serves `/ds/` from a ZIP). The ZIP holds
`report/index.html` beside `marks/`, so the relative path is `../marks/<id>/frame.png` (the brief wrote
`marks/<id>/...`, which from inside `report/` would resolve to `report/marks/`, a file the ZIP does not have). In the
inlined stylesheet a scheme's `://` is written `\://` -- the same string to CSS -- so the export's host-path scan does
not read the SVG chevron's namespace (`http://www.w3.org/...`) as a drive (`p:/`). The fonts the design system names
at `/fonts/` are not served by the service nor carried by the export: the page falls back to the design system's
fallback faces (an open point, not a placeholder; see §3).

## 2. The cards, the state phrases, and provenance

Media first (spec 4.5). The header names the build -- its branch with an `agent/` prefix dropped (or "this build" when
only an internal name is known) at its short commit, "with local changes" when dirty -- the map, the mode, offline or
online, when it started, and "live" or when and why it ended ("you ended it", "closed after a long time with no
input"). Then the roll-up: the number of observations and a count for each state present. Then one card per
observation, in the record's order:

1. the mark's frame as the lead image, when `evidence.frame`;
2. the clip as `<video controls>`, when `evidence.clip`;
3. **Your words**: every entry of `player[]`, each a `<blockquote>`, verbatim (escaped, never edited);
4. **The harness says**: the harness's notes, each marked "the harness says", kept in their own section;
5. the state as a plain phrase, the finding, the decision ("not decided yet", or its plain disposition, reference, who
   and when), the next action, and -- once the session is closed and the observation has a tick -- the seek link
   `?replay=<segment>&tick=<tick>` that sprint 35 wires;
   > Superseded by PT-20 (research 244 §4, 2026-10-08): there is no seek link. Once the session is closed and the
   > observation has a tick, the live page's card carries a button, "See this moment in the replay", that posts
   > `{ type: 's2u-replay-seek', segment, tick }` to the embedded replay (`report/page.ts` `card`); a page with no
   > embedded replay -- the static export's always -- says the moment as a plain line, "In the recording: segment
   > <n>, tick <t>".
6. the history, each line dated with who wrote it (`HistoryBy`, W34.R6) where the record says;
7. live and open only: a text input whose Send posts `observe` at this card. One more input above the cards posts a
   session-wide `observe`.

| state | the phrase | the next action (while undecided) |
|---|---|---|
| `captured` | captured | being looked at next |
| `investigating` | being looked at | being looked at now |
| `reproduced` | reproduced | its cause is being looked for |
| `understood` | reproduced and understood | a decision on what to do comes next |
| `narrowing` | still being narrowed | more tries to narrow it down |
| `notReproduced` | not reproduced yet | more tries to reproduce it |
| `needsSetup` | needs a particular set-up | needs a particular set-up to reproduce |
| `known` | already known | already known: nothing new to do |
| `contradicted` | the evidence says otherwise | to be talked over with you |
| `blocked` | waiting on something | waits until what holds it up is cleared |

With a decision, the next action is the decision's: "decided -- to be fixed now" (`fixNow`), "kept for later",
"to be researched", "needs a ruling", "already known", "no action".

**The provenance rule, shown.** The player's words and the harness's are never in one section: a reader can always
tell which sentence the player said. The player's words are shown as said, escaped and never altered -- a player who
writes `<script>` sees `<script>` as text (the test). Everything else written by the harness, the controller or an
investigator -- notes, the finding, the decision's reference, the history -- passes `scrub`, which withholds a URL, a
drive or home path, a host port (`:` and four or five digits; a time's two digits are not one), a worktree's name
(`wt-...`) and an agent branch (`agent/...`) as "(withheld)": the report shows no internals (spec 4.5, 4.10). The test
scans the live and the static page for `:53`, `C:/`, `wt-` and `agent/`.

## 3. Placeholders

One chosen value, with no original (a playtest instrument has none). It carries no suffix because it stands for no value
the original holds; it is listed so the choice is on record (as research 242 §3 lists its own).

| name | value | where | status |
|---|---|---|---|
| `SSE_KEEPALIVE_S` | 15 s between the event stream's keep-alive comments | `packages/playtest/src/report/sse.ts` | a chosen value, the brief's number; an owner may change it |

~~Open, not a value: the design system's fonts (`/fonts/*.woff2`, named by `shared/ds/fonts.css`) are not served at
`/fonts/` by the service nor carried in the export, so the report uses the fallback faces until a task serves them.~~

**Closed for the live report by PT-20 (web sprint 35, 2026-10-08; research 244 §4).** The service serves `GET
/fonts/<name>` (`packages/playtest/src/report/http.ts`) from `shared/fonts/` as `font/woff2`, for exactly the names the
whitelisted design-system CSS gives in its `url('/fonts/<name>')`s (`dsFontNames` in `report/page.ts`: read from the
CSS that `/ds/` already serves, never a walk of the directory), so the licences and any other file there are 404, a
name with `..` or a slash is 403, and `/ds/../x` stays 403 (`reportHttp.test.ts`). §1's sentence that the service does
not serve them is superseded by this. The export's static page still carries no fonts and falls back to the fallback
faces (a choice left as it is: the ZIP's size and the fonts' licences travelling with it are a later question).
