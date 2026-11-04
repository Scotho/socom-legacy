# 242 -- The playtest session service (`@s2u/playtest`)

Written 2026-10-06 for PT-07 of web sprint 33 (the plan `docs/plans/2026-10-06-web-sprint-33-recording-and-the-room.md`;
the design `docs/specs/2026-10-06-playtest-and-replay-design.md` §4.4). The code: `packages/playtest/src/`
(`session.ts`, `target.ts`, `evidence.ts`, `service.ts`, `readySheet.ts`, `inactivity.ts`, `cli.ts`, `index.ts`). The
tests: `packages/playtest/test/` (`session`, `target`, `readySheet`, `inactivity`, `service`). **A playtest instrument
with no original** (PLAYTEST_INSTRUMENT_ADAPTATION): nothing here reads or changes a game value or behaviour (PT.R3), so
nothing here is a parity finding. No game, emulator, browser or dev server was run for this note; the tests start the
service on a free loopback port and talk to it over its own socket.

## 1. The service

A local Node process per session, on the lane's port **5303** (W33.R4; a test passes 0 for a free one), listening on
`127.0.0.1` only. Both harnesses drive it through one CLI, run from `socomlegacy/`:
`npx tsx packages/playtest/src/cli.ts <verb>` (or `npm run cli -w @s2u/playtest -- <verb>`).

| verb | what PT-07 does |
|---|---|
| `start [--target current\|main\|<ref>] [--map <stem>] [--online] [--opt k=v ...]` | resolves the target (`target.ts`), creates the session under `socomlegacy/.playtest/<id>/` (`session.ts`), starts the service on 5303, starts Vite's dev server for the target's tree on 5304 (`strictPort`; the tree's own `packages/viewer/vite.config.ts`), with `--online` the match server as a child (`PORT=5305`, `REPLAYS_DIR=<session>/segments`, `MAPS=<stem>`; it prints "recording online waits for PT-04" until that task lands), opens Chrome through Playwright's `chromium` at `/testroom?devmode&mode=play&map=<stem>&playtest=ws://127.0.0.1:5303/session` plus the options (and, online, `server=ws://127.0.0.1:5305/ws` and `online`: the page takes a match server only from `mp` or `server`, else the player's stored choice; `launchUrl.ts`). An option naming one of the page's own keys (`map`, `mode`, `devmode`, `playtest`, `server`, `online`) is refused (exit 2). A start that fails (the service, Vite, the match server, the browser, the first navigation) stops what it started and writes `closedAt` with `closeReason` null, so the record is not left open; waits up to 60 s for `window.__viewer?.playtest?.()` (if it never answers, it prints "the page did not report its instruments" and the sheet anyway), then prints the **ready sheet** |
| `status` | `GET /status`, summarised: the id, the close, the map, the options, the segments, the observations and their states, the last human input |
| `set k=v ...` | sends `{ type: 'set', options, from: 'cli' }` on the socket; the service merges it into `launch.options` and the `start` process, which holds the page, navigates it to the merged address |

The other verbs of the design's table (`observe`, `note`, `state`, `decide`, `pin`, `close`, `export`, `handoff`,
`dispose`) are sprint 34's. The inactivity clock already calls a minimal `closeNow()`: it stops the browser, the dev
server, the match server and the service, and writes `closedAt` and `closeReason`.

**The target** (`resolveTarget`). `current` is HEAD of the tree the CLI runs in; `main` is `origin/main`'s commit; any
other word is a ref. `main` and a ref are served only from a worktree that already has them checked out (`git worktree
list --porcelain`, matched by branch, else by commit) -- there is no branch switching; none found is an error the
skill relays. A tree whose `git status --porcelain` is not empty is **dirty**: the record keeps the HEAD commit with
`dirty: true` and `dirtyHash`, the sha256 of that output, so a dirty tree is never recorded as the clean commit (the
plan's review focus 4; `test/target.test.ts`). `branchCreated` comes only from `.playtest/branches.json` (written by
sprint 35's fix-now when it makes a branch), else null -- shown as `Created: unknown`, never invented.

**The page socket** `/session`. An upgrade is taken from no Origin (the CLI, the tests) or a page on this host
(`http://localhost:*`, `http://127.0.0.1:*`) only, so another site open in the same browser cannot reach it.

| page to service | service's answer and effect |
|---|---|
| (open) | `{ type: 'session', id, segment, badge }`, the badge `{ branch, created, commit, dirty }` from the target (`created` = `branchCreated`, null for unknown; `commit` the first 7 characters); `segment` the open segment's index, 0 before any |
| `{ type: 'mark', bundle: { observation, at, segment, tick, frame, telemetry } }` | the observation `PT-<session>-<n>` appended first, with its evidence paths, then the frame (a `data:image/png;base64,` URL, decoded) written to `marks/<obs>/frame.png` and the telemetry to `marks/<obs>/telemetry.json`; a file that fails is logged and its path set back to null, and a record write that fails writes no file and answers nothing, so no observation points at a missing file and no file is without its observation (`source: 'mark'`, state `captured`, the paths relative to the session directory); answers `{ type: 'marked', observation, local }`; counts as human input. A frame that is not a PNG data URL is not written and the observation keeps `frame: null` |
| `{ type: 'input' }` | human input: `lastHumanInputAt` written, the inactivity clock reset |
| `{ type: 'set', options, from? }` | merged into `launch.options` (string values only); answers `{ type: 'setDone', options }`; a page's own change counts as human input |
| `{ type: 'segment', ... }`, binary frames | PT-03's |
| (service to page) `{ type: 'inactivity', closesInMinutes }` | the grace warning, sent to every open page |

A malformed message is dropped and the service stays up. HTTP: `GET /status` answers the record; anything else 404.

**The ready sheet** (`readySheet`), plain words for the controller to relay: the build (branch and short commit, "with
local changes not yet committed" when dirty), the map, the mode with offline or online, the options that are not the
defaults ("none" otherwise), that the recording and the video ring are running and how to mark a moment, and the
inactivity rule (45 minutes, a 2-minute warning). It carries no port, no host path and no worktree name: a value that
looks like one (`:<digit>`, a drive letter, `://`, `wt-`, a leading slash) is printed as "(withheld)"
(`test/readySheet.test.ts`).

## 2. The record

One directory per session, `socomlegacy/.playtest/<session id>/`, git-ignored (the root `.gitignore`'s
`/socomlegacy/.playtest/` line), never committed:

```
session.json                    the record (SessionRecord), rewritten whole at every change
marks/<obs id>/frame.png        a mark's frame grab
marks/<obs id>/telemetry.json   a mark's telemetry snapshot, as the page sent it
marks/<obs id>/clip.webm        a mark's video clip (PT-06's ring; kept by PT-03): the binary frame after a `clip` message
segments/<n>.s2r                the replays (PT-03, PT-04)
```

**The clip** (PT-03): the binary frame that follows a `clip` message is written to `marks/<obs id>/clip.webm` (the
page's `local-<n>` resolved through the `marked` reply's mapping; an unknown observation's bytes dropped and logged),
then `evidence.clip` is set and a history line `clip kept: <from>-<to>s, cut=<bool>, <bytes> bytes, <mime>` appended;
a failed write is logged, its partial removed, `evidence.clip` left null. A clip's bytes never enter a segment.

**The session id** is `YYYYMMDD-<4 hex>`: the date of `now` in UTC and `floor(random() * 0x10000)` in four hex digits.
A directory already there is drawn again (up to 16 draws, then refused), so an id is never reused (PT.R7). **An
observation** is `PT-<session id>-<n>`, n counting from 1 in the order the service keeps them.

**The atomic write.** Every change reads the record, applies the change and writes it to `session.json.tmp`, flushes
it to the disk (`fsync`), then renames it over `session.json`: a reader sees the previous record or the next, never
part of one. The service is one process with one writer, so a change is a read-modify-write on one thread.

**The fields** are the plan's `SessionRecord` and `Observation` as written (PT-03, PT-08 and sprint 34 consume them):
the target (`asked`, `commit`, `dirty`, `dirtyHash`, `branch`, `branchCreated`), the launch (`map`, `mode`, `online`,
`options`, `url`), the segments, the observations (the player's words, the evidence paths, the harness's notes, state
and finding kept apart from the player's, the decision, the history), `lastHumanInputAt`, `closedAt` and `closeReason`.
The launch `url` holds the local address and its ports; the report and the export of sprint 34 strip it.

## 3. Placeholders

Chosen values with no original (a playtest instrument has none): the owner's brief's numbers, which an owner may
change. They carry no suffix because they are not stand-ins for a value the original holds; they are listed here so
the choice is on record.

| name | value | where | status |
|---|---|---|---|
| `INACTIVITY_MINUTES` | 45 minutes without human input before the warning | `packages/playtest/src/inactivity.ts` | a chosen value, the owner's brief's number; an owner may change it |
| `INACTIVITY_GRACE_MINUTES` | 2 minutes from the warning to the close | `packages/playtest/src/inactivity.ts` | a chosen value, the owner's brief's number; an owner may change it |
| `MERGE_WINDOW_S` | 15 s: a spoken report within it (either side) of a mark with no words merges with that mark (spec 4.5; §5) | `packages/playtest/src/observations.ts` | a chosen value, the design's number (PT-11); an owner may change it |
| `CLOSE_FLUSH_S` | 5 s: how long the closeout waits for the page's `flushed` (its pinned clip in flight sent) before it goes on (§6) | `packages/playtest/src/closeout.ts` | a chosen value, the brief's number (PT-13): long enough for a clip of a few megabytes over loopback; an owner may change it |

## 4. Map names and the URL state

Written 2026-10-06 for PT-08. The code: `packages/playtest/src/mapName.ts`, `packages/playtest/src/urlState.ts`, and
their use in `launchUrl.ts` and `cli.ts`. The tests: `packages/playtest/test/mapName.test.ts`, `urlState.test.ts`,
`launchUrl.test.ts`. Still a playtest instrument with no original (PLAYTEST_INSTRUMENT_ADAPTATION): it chooses which
map and which address the page opens at; it reads and changes no game value. No browser or dev server was run for it.

**How a map name resolves.** `start --map <name|stem>` is resolved against the application's own index: once Vite is
up, the CLI fetches `maps/index.json` from it and reads it with `parseServedIndex` of `@s2u/archive`
(`packages/archive/src/mapIndex.ts`), whose `MapInfo.name` is each map's `mission.rdr` description (`listMaps`;
Frostfire is MP2). There is no second table of maps. `resolveMapName(asked, index)`:

- a stem (`MP<n>`) matches the index's `archive` exactly, case aside -- as the page reads `?map=`
  (`packages/viewer/src/main.ts` `wantedArchive`); a stem not in the index is refused (no candidates), never matched as
  part of a longer stem;
- a name matches after the viewer picker's normalisation, `normaliseName` of `packages/viewer/src/mapOrder.ts`
  (lower case, every character but `a-z0-9` dropped: "Rat's Nest" -> `ratsnest`). It is mirrored in `mapName.ts`, not
  imported: `@s2u/viewer` is the page's application and exports no module a Node service depends on (and the playtest
  tsconfig's `rootDir` keeps sources outside the package out). The one line is kept identical; the test holds the
  viewer's own samples. One whole normalised name is the map;
- a part of a name is **asked, never guessed**: the maps whose normalised name begins with it, then those that hold it
  elsewhere, come back as candidates -- one or several -- and the CLI prints them and exits 2. A wrong map makes every
  observation of the session about the wrong place, and the asker is a person at the pad: one question costs less.
  Nothing like it is `candidates: []`, also exit 2.

The CLI's branch is `chooseMap(asked, index | null)` (`mapName.ts`, tested without a server). When the index cannot be
fetched or read (a tree with no served maps -- the page then offers its own disc picker, `packages/viewer/src/main.ts`),
it is `null`: a typed stem launches as given, upper-cased, with one warning ("the served map index was not readable;
launching the stem as given"), as a stem launched before this task; a name exits 2 ("the map index is needed to resolve
a name"), since it cannot be resolved and is not guessed. With the index readable, an unknown or ambiguous ask still
exits 2.

The record is written before the dev server is up, with the map as asked; the resolved stem then replaces it with the
URL (`launch.map`, `launch.url`), before the match server (its `MAPS` allowlist) and the browser start. The index is
read at the dev server's own resolved address (`vite.resolvedUrls.local[0]`, `http://localhost:5304/` by default), the
host the page itself is opened at.

**The URL state.** `urlState(opts)` writes the search the test room opens at: always `?devmode&mode=play`, then `map`
when given, then the other keys in the order asked. The vocabulary (`URL_KEYS`) is the keys the test room reads, at
their readers in `packages/viewer/src`:

| key | kind | read by |
|---|---|---|
| `map` | value (a stem) | `main.ts` `wantedArchive`, `shareUrl.ts` `readShare` |
| `mode` | value, always `play` here | `shareUrl.ts` |
| `view` | value (`modern`, `ps2`) | `shareUrl.ts` |
| `online` | value (`off`, `shared`, `local`) | `shareUrl.ts` `readShare`, `multiplayer.ts` |
| `fly` | flag | `flyAccess.ts` (`FLY_PARAM`) |
| `kit` | value | `loadout.ts` |
| `noarmory` | flag | `main.ts` (`NO_ARMORY`) |
| `nomatch` | flag | `flyAccess.ts` (`NO_MATCH_PARAM`) |
| `mp` | flag | `netPage.ts` `netSettings` |
| `lag`, `loss` | value (ms; per cent) | `netPage.ts` `netSettings` |
| `server` | value (a socket URL) | `netPage.ts` `netSettings`, `universeHost.ts` |

A flag (`FLAG_KEYS`: `fly`, `noarmory`, `nomatch`, `mp`) is read by its presence only (`has`), so it is written bare
(`&fly`), as the page's own `writeShare` keeps it; a value is `k=v`, form-encoded as `URLSearchParams` writes it.
`online` is not a flag: nothing in `packages/viewer/src` reads it by presence, and `shareUrl.ts` takes only `off`,
`shared` or `local` (a bare `&online` reads as no choice). The bare `&online` that PT-07's `pageUrl` appends for an
online launch is therefore read by nothing; the online session's match server is chosen by its `server=`, which is
read. Recorded, not changed here.

**What is refused, and why.** A key outside the vocabulary is refused by name (`{ ok: false, unknown }`), every one of
them at once: the page would ignore it, and the session would record a condition that was never in force. A flag given
any value (`fly=0`, `nomatch=false`) is refused by name the same way (the CLI says "a flag takes no value: fly"): the
page reads presence only, so `fly=0` would turn the flag on while the record said `0`. No spelling (`1`, `true`, `on`)
is taken as the bare flag -- one way to say it, and no guess at what a value meant (PT-08 review F1). `mode` other
than `play` is refused by name too: a session is a play session (`launch.mode`). `pageUrl` (`launchUrl.ts`) now builds
on `urlState` -- one builder -- after its own refusal of the session's reserved keys (`RESERVED_KEYS`: `map`, `mode`,
`devmode`, `playtest`, `server`, `online` may not be set by an option; the session sets them), and appends the
session's own `playtest=` and, online, `&online`. The CLI's `start --opt` and `set k=v` validate through both before
anything starts or is sent: a refusal prints the names and exits 2. The PT-07 test example `night=1` was not a key the
page reads; the launch test now uses `lag` and `fly`, and holds that an unknown option is refused.

No chosen value is added by this section; §3's table is unchanged.

Owed (PT-08 review, a latent note): `service.ts` merges any keys of a page's `set` into `launch.options`, and a later
CLI `set` rebuilds the URL through `pageUrl`, which now refuses a key outside `URL_KEYS`. No page sends `set` yet; the
task that adds the sender (sprint 34's PT-11/PT-13) must validate through `urlState` first. *Done 2026-10-10 (`ccr-ef8214e9-7mkm9s`, pending
review): a page's `set` is refused unless `urlState` and the reserved session keys (`checkOptions`) take it
(`pageSetRefusal`); the CLI's path unchanged; `service.test.ts`.*

## 5. Observations and the verbs

Written 2026-10-07 for PT-11 of web sprint 34 (the plan `docs/plans/2026-10-07-web-sprint-34-the-session-and-the-briefing.md`;
the design §4.4's verbs and §4.5's observation). The code: `packages/playtest/src/observations.ts` (pure),
`packages/playtest/src/verbs.ts` (the HTTP side), one mount line in `service.ts`, the verbs in `cli.ts`, two additive
fields in `session.ts`. The tests: `packages/playtest/test/observations.test.ts`, `test/verbs.test.ts` (a real
`SessionService` on port 0). Still a playtest instrument with no original (PLAYTEST_INSTRUMENT_ADAPTATION): it keeps
what the player said and what the harness found; it reads and changes no game value. No browser, game or dev server
was run for it.

**The operations** (`observations.ts`) are pure: each takes the record and returns a new one, the input untouched, and
the service applies it inside `SessionStore.update`, so an operation that refuses (throws) writes nothing.

| operation | what it does | refuses |
|---|---|---|
| `addSpoken(r, words, at, { at?, now, by? })` | the player's words: into the observation `--at` names (any time apart), else into the newest mark within `MERGE_WINDOW_S` that has no words yet, else a new observation `PT-<session>-<n>` (`source: 'spoken'`, the last segment, `tick: null`, state `captured`, no evidence) | empty words; an `--at` that names no observation (404) |
| `addNote(r, obs, text, at, by = 'controller')` | `harness.notes` gains `{ text, at }` | empty text; an unknown observation |
| `setState(r, obs, state, at, by)` | `harness.state`, the line `state: <old> -> <new>` | a state outside the ten of spec 4.5 |
| `decide(r, obs, { disposition, ref, by, at })` | `decision`, the line `decided: <disposition> (<ref>)` | a disposition outside the six of spec 4.7; an empty ref; **an observation that has a decision** (`DecisionExistsError`, 409) |
| `redecide(r, obs, d, reason)` | the explicit change: the new `decision`, the line `redecided: <old disposition> (<old ref>; by <who> at <when>) -> <new> (<ref>); reason: <reason>` | no decision yet (`NoDecisionError`, 409: decide first); an empty reason |
| `pin(r, from, to, at, by = 'investigator')` | the record's `pins` gains `{ from, to, at, by }` (ticks); the page acts on it once the report forwards it (PT-12) | not whole ticks, negative, or `to < from` |

**The merge rule.** A spoken report merges with a mark when the controller names the mark (`observe --at <mark id>`:
any time apart, and into words already there) or when it arrives within `MERGE_WINDOW_S` (15 s, a chosen value, §3)
of a mark that has no words yet -- the newest such mark, measured between the report's time and the mark's
`createdAt` (both the service's clock), either side. The window is inclusive, either side of the mark: 15.000 s merges
and 15.001 s does not, and a mark that lands 10 s after the words merges with them (tested). The merge keeps both: the mark's evidence stays, the words are
appended to `player`, and `source` becomes `both`. 14 s after a mark merges; 16 s is its own observation
(`test/observations.test.ts`, the plan's review focus 1). A mark that already has words is never merged into by the
window -- only by name. `--at now` is the same as no `--at`: the window applies.

**The provenance rule.** `player` is the player's wording, append-only: only `addSpoken` writes it, and only by
appending `{ words, saidAt }`. The harness's notes, state and finding are kept apart in `harness`; `addNote` leaves
`player` as it was (tested). A decision is history: a second `decide` is refused, never an overwrite (review focus 2),
and `redecide` is the one way to change it, keeping the old decision and the reason in `history`.

**The history line** is `{ at, what, by }`, `by` being `player`, `controller` or `investigator` (`HistoryBy`,
`session.ts`). The service's own lines (a mark, a clip) carry no `by` -- the field is additive and optional, so a
record written before PT-11 still reads. The defaults: `observe` is the player's (whoever relays it), `note`,
`state`, `decide` and `redecide` the controller's (W34.R5: the investigator returns a finding and the controller
writes it), `pin` the investigator's; a request may name another of the three, and anything else is refused (400).

**The verbs' HTTP contract** (W34.R1). Each CLI invocation is its own process and only the `start` process holds the
page, so a verb is a request to the running service: `POST /verb` on `127.0.0.1:<service port>`, the body
`{ verb, args }` in JSON, the verbs `observe` (`text`, `at?`), `note` (`obs`, `text`), `state` (`obs`, `state`),
`decide` (`obs`, `disposition`, `ref`), `redecide` (the same and `reason`), `pin` (`from`, `to`), `status`, each with an
optional `by`. Answers, always JSON:

| status | when |
|---|---|
| 200 `{ ok: true, record }` | done; `observe` adds `observation` (its id) and `merged` |
| 400 `{ ok: false, error }` | the body is not JSON or not `{ verb, args }`, an unknown verb, an argument of the wrong type or refused by the operation, a body over 256 KiB |
| 403 | a peer that is not loopback (`127.0.0.1`, `::1`, `::ffff:127.0.0.1`), or an `Origin` that is not a page on this host (`http://localhost:*`, `http://127.0.0.1:*`) |
| 404 | an unknown observation |
| 405 | a method other than POST on `/verb` |
| 409 | `decide` with a decision there; `redecide` with none |

Why POST on loopback: the service listens on `127.0.0.1` only, and the check is the socket's (§1): no Origin is the
CLI, this host's page is the report (PT-12 posts the player's input to the same route), and any other site open in
the same browser -- which sends its Origin on a cross-site POST -- is refused before the body is read. A write through
a GET would be reachable from an image tag; a POST with the Origin check is not. The route is mounted ahead of the
server's other routes (`mountVerbs` takes the server's request listeners and calls them for any other path), so
`GET /status` and the 404 are unchanged and the next mount (the report) is one line too.

**The port file.** `start` writes `service.json` (`{ port, pid }`) in the session's directory once its service
listens. A verb from another shell (`observe`, `note`, `state`, `decide`, `redecide`, `pin`, and now `status` and
`set`) uses `--port <n>` when given, else the port of the newest `service.json` (by its file time) of a session whose
record is not closed and whose `start` process is alive (`findServicePort`), else the lane's 5303. Liveness is the
file's `pid` under `process.kill(pid, 0)`; any error (ESRCH, EPERM) counts as gone, and a stale file -- a `start` that
died without closing, which leaves `closedAt` null -- is skipped with the line `a stale service.json skipped: <session
id>` rather than costing every verb the 10 s timeout. The service removes its `service.json` when it stops
(`SessionService.stop`, which the CLI's close runs). The CLI prints the answer in plain words ("kept as
PT-...-3, a new observation", "added to PT-...-1, with its mark", "PT-...-1 decided: later (issue #12)"); a refusal
prints the service's reason and exits 1, as does a service that does not answer within 10 s (`callVerb`'s timeout: on
this Windows host a connect to a closed loopback port was seen to hang rather than be refused).

Not here: the verbs do not count as human input (the inactivity clock is reset by the page's input, a mark or a
setting, §1); a player's `observe` through the report should, and that wiring is owed to the task that mounts the
report (PT-12) or the closeout (PT-13), with `onInput`. The frozen record (writes after `closedAt`) is PT-13's. PT-11
adds no page `set` sender, so §4's owed note on validating one through `urlState` stands.

§3's `MERGE_WINDOW_S` row is moved from "note only" to its constant. No other chosen value is added.

## 6. Closeout

Written 2026-10-07 for PT-13 of web sprint 34 (the plan `docs/plans/2026-10-07-web-sprint-34-the-session-and-the-briefing.md`;
the design §4.6, and §4.4's `close` and `dispose`). The code: `packages/playtest/src/closeout.ts`, `src/summary.ts`, the
freeze rule in `src/session.ts` (`checkFrozen`, `FrozenError`), the `close` and `dispose` verbs in `src/verbs.ts`, the
service's side in `src/service.ts` (`makeCloseResources`, the `flushed` message, `humanInput`, `onDispose`), the CLI's
`close` and `dispose` in `src/cli.ts`, and the page's answer in `packages/viewer/src/playtestSession.ts`. The tests:
`packages/playtest/test/closeout.test.ts`, `test/summary.test.ts`, `test/session.test.ts` (the frozen record),
`test/service.test.ts` (the verbs over a real service on port 0), `test/verbs.test.ts` (the port file), and
`packages/viewer/test/playtestSession.test.ts` (`closing` -> `flushed`). A playtest instrument with no original
(PLAYTEST_INSTRUMENT_ADAPTATION): it stops the session's own processes and freezes its record; nothing of the game is
read or changed. No browser, game or dev server was run for it.

**Where it runs.** The `start` process owns the browser, the dev server and the match server, so the closeout runs
there: the CLI registers a `CloseResources` on its service (`svc.closeResources`), and both the `close` verb (from any
shell, over `POST /verb`) and the inactivity clock's close run `closeout()` on that same object. A second close -- or
the verb and the clock at once -- returns the frozen record and does nothing (a closeout per resources, and a record
already closed returned as it is).

**The order, and why** (each step one line in the record's own `history`, dated):

| step | what | why here |
|---|---|---|
| 1 | the page is told `{ type: 'closing' }`; the closeout waits up to `CLOSE_FLUSH_S` (5 s, §3) for `{ type: 'flushed' }` or for the page's socket to close | the page holds the video ring: on `closing` it stops the ring (an open pin resolves `cut` with what was recorded), sends the pinned clip in flight, then answers `flushed`. Asked first, while the page is still alive, so no pinned clip is lost |
| 2 | the browser is closed | the page has nothing left to send |
| 3 | the session's servers are stopped (the dev server, then the match server, killed and its exit waited for up to 5 s); one that fails is a history line and the close goes on | a server's failure must not leave the record open |
| 4 | the open segment, if any, is closed: `closed` when the page confirmed in step 1, `socket-closed` otherwise | from `closing` on, a page socket that closes leaves the segment to the closeout (the browser's close in step 2 would otherwise close it `socket-closed` first), so the reason says whether the page confirmed |
| 5 | the record is frozen: `closedAt`, `closeReason` (`player` or `inactivity`) | last, so every earlier step is written before the freeze |

> Superseded in part by W35.R3 and research 244 §4 (2026-10-08): the closeout keeps the dev server for the report's replay; `dispose` stops it.

The static summary is printed after it (the `close` verb answers it as `summary`; the inactivity close prints it in the
`start` process's terminal). **Investigators are not waited for** (the plan's review focus 3): the summary is "as of
closeout", and the session service is **not** stopped by the closeout -- it keeps answering the report and the
investigators' later `note`, `state` and `decide` until `dispose`. A closed record opens no new segment.

**The freeze rule** (`SessionStore.update`, `checkFrozen`). Once `closedAt` is set, an update is compared with the record
it started from, and one that changes any of these throws `FrozenError` and writes nothing (the verbs answer 409): an
observation's `player` or `evidence`, or its capture facts (`id`, `createdAt`, `segment`, `tick`, `source`); the list of
observations (one added or removed); `launch`, `target`, the session's `id`, `createdAt`, `closedAt`, `closeReason`,
`retestOf` (PT-22: a retest's link is a launch fact); the list of segments, or a segment's `file`, `index`, `map`,
`online`, `startedAt`. Still writable: each observation's `harness` (notes, state, finding), `decision`, `history`,
`card`, `fix` (PT-21) and `retests` (PT-22); the record's `history`, `pins` and `lastHumanInputAt`; a segment's
`endedAt`, `reason` and `ticks`. So a note an investigator writes after the close is kept, and the player's
words and the evidence are as they were at the close (tested both ways). The capture facts, the session's identity and
the close fields are frozen beyond the brief's list: they are what the record says happened, not the harness's reading
of it.

**`dispose`** (spec 4.4: "after the gate: stops what is left, removes nothing from the evidence directory"). The CLI's
`dispose` is a verb to the running service -- the CLI process holds none of the session's processes -- and the `start`
process then stops what is still running (the browser, the dev server, the match server if the closeout left any, the
inactivity clock, and the service itself, whose `service.json` goes) and exits. It removes nothing from the session's
directory. It is refused (409) before the close. It does not check the durability gate itself: the gate is PT-14's
(`handoff`), and the skill orders `handoff` before `dispose`. A `dispose` with no service answering prints that nothing
is running. Ctrl-C in the `start` process closes (`player`) and then disposes. The answer names what was actually
stopped (review F5): the `start` process stops what is still running besides the service, then answers with that list
and the service, which stops once the answer is sent. The CLI's `close` waits up to 60 s for its answer (the flush,
the match server's exit and the browser's and dev server's closes exceed `callVerb`'s 10 s default; review F4), and on
that limit says the close is still finishing and to run `close` again for the summary.

**The port file after the close.** Since the service outlives the closeout, `findServicePort` still finds a closed
session's service while its process is alive -- after any open session's -- so `note`, `decide` and `dispose` reach it
(tested). A closed session's stale `service.json` is skipped without a line.

**The static summary** (`renderSummary`). Plain words, and it asks nothing (no question mark of its own): why it ended
("you closed it", or "it closed itself after 45 minutes without input"); the context (the build's branch and short
commit, local changes said in words, the map, the mode, offline or online); each observation in the player's own words
(a mark with none is "a moment you marked, with no words") with its state as a phrase -- `captured` "not looked at
yet", `investigating` "being looked into", `reproduced`, `understood`, `narrowing` "being narrowed down",
`notReproduced` "not reproduced so far", `needsSetup` "needs a particular setup to reproduce", `known` "already known",
`contradicted` "the evidence does not bear it out", `blocked` "blocked for now" -- and its finding on one line ("No
finding yet." without one); the roll-up of the states; the next action (the undecided observations get a decision,
then the record is written down; anything still being looked into carries on). The ready sheet's rule, extended (spec
4.10): no port, no host path, no worktree name, and no agent's name. A port is withheld only after a host
(`localhost`, `127.0.0.1`, `[::1]` or a dotted name): a bare time in the player's words ("at 12:30") is theirs and is
kept (review F2). A single value that is one (the map, the branch)
is withheld whole; in the player's words and a finding only the offending word is withheld, and an agent's name
(`playtest-investigator`, `investigator`, `implementer`, `reviewer`, `subagent`) is said as "the team". Tested with
inputs that carry each.

**The page's side** (`packages/viewer/src/playtestSession.ts`). On `closing` the page stops its video ring, waits for
every clip still in flight (a mark's pin until its clip is sent, or found to have no bytes), then sends
`{ type: 'flushed' }`. It answers after a dispose too: the socket outlives the mount, as a sent mark's clip does. A mark
still grabbing its frame when `closing` arrives has no pin yet; its pin then resolves at once from the stopped ring
(no clip), so it does not hold the answer; the mark itself, if it reaches the service after the freeze, is refused by
the frozen record and logged (a new observation after the close is history's to refuse). A clip that reaches the
service after the freeze is dropped before any file is written ("a clip after the close dropped: <obs>"; review F3),
so no `clip.webm` exists that the record does not name.

**Owed by PT-11, done here: a player's verb is human input.** A verb whose writer is the player (`observe`'s default;
any verb that names `by: 'player'`) resets the inactivity clock as the page's input does (`svc.humanInput()`: the
record's `lastHumanInputAt`, then the CLI's `onInput`); a controller's or an investigator's write does not (tested).

§3 gains `CLOSE_FLUSH_S`. No other chosen value is added.
