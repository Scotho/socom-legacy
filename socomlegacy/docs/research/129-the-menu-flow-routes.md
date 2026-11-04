# 129 -- The menu flow's routes: the address's path as the manager's stack, a browser adaptation (ROUTE-01)

Written 2026-10-02 for ROUTE-01, under the online path's plan (`../plans/2026-10-02-online-path-target.md`, rulings
OT.R9 and OT.R10, the controller's reading of the owner's message of the day: "For now, continue to start in the
matches as we currently do, and put the menus being &menuflow param. While you're building out the menus, include a
whole stateful routing feature. / (loading screen) /main /main/online etc etc etc. our original params can continue to
exist."). **Everything in this note is a browser adaptation**: the PS2 has no address bar, and nothing here changes
what the game does -- the routes are read off the screen manager's own state (research 115) and entered by replaying
it. The flow's edges are research 128's (§1, the pin `tools/test/onlineDialogs.pinned.json`); nothing new was read
from the disc or the decompilation for this note.

The code: the table and the pure mapping `packages/ui/src/routes/menuRoutes.ts` (test
`packages/ui/test/routes/menuRoutes.test.ts`); the page's adapter `packages/viewer/src/menuRoutes.ts` (test
`packages/viewer/test/menuRoutes.test.ts`), connected by one line in `packages/viewer/src/frontEnd.ts`.

## 0. Answers

| # | finding | where | section |
|---|---|---|---|
| R129.1 | **The entry is `menuflow`** (OT.R9): PLAT-10's `frontend` renamed where it was defined (`FRONT_END_ENTRY_READING`, research 115's ledger) and read; no alias. `menuflow=<dialog>.rdr` keeps `--menu_state`'s meaning. Without it the page is the match as before, and the path is never read or written. **With it the page is the front end alone** (OT.R12, 2026-10-03): `main.ts` is never loaded. **Since OT.R19 (2026-10-04) the front end is the page's default**: no parameter asks for it, `menuflow=<dialog>.rdr` only names the start dialog, and the map viewer and the match are the page at `<base>/testroom`, a reserved segment | `frontEndMachine.ts`, `frontEnd.ts`, `pageEntry.ts`, `TEST_ROOM_SEGMENT` | §1, §7, §8 |
| R129.2 | **The stack is the path.** M's history (`MenuQueue.history`) then the dialog the host built (`MenuShell.currentName`), one segment each, under the screen before it; read only while the menu state is on top, no switch is in flight and nothing is queued | `routeSegments` | §2 |
| R129.3 | **`dlgMPswitch` has no route**: it draws nothing and its ONSTART switches on (R128.2). It stays in the history (a deep link pushes it; Forward plays it) but adds no segment | the table's `through` | §2 |
| R129.4 | **BRIEFING ROOMS is not a route**: it opens `ROOMLIST` in place on `dlgWorldOfSOCOM` (research 128 §4.7), not a dialog. A briefing room (`dlgMPBriefingRoom`) is | the table | §2 |
| R129.5 | **Back is PREVIOUS_SCREEN, Forward re-enters; the game's PREVIOUS_SCREEN is the browser's back.** A switch pushes an entry; a return to the previous entry's stack is `history.go(-1)`, its own `popstate` ignored once | the adapter | §3 |
| R129.6 | **A deep link replays the stack without its transitions**; a guarded place (a table route's guard, or a `d/` one's: under LOGIN, or an online dialog the table lacks) lands on its nearest ancestor, an unknown path or a dialog the disc lacks on `/main`; the address is then rewritten to where it landed. A reload replays the entry's own stack | `routePlan`, `routeReplay`, `routeStackOfKey` | §4 |
| R129.7 | **The served site already answers a deep path under `/socomlegacy/` with the page**; the site root's unknown paths stay 404s. Vite's development server falls back to `index.html` too (held by a test) | `shared/deploy/site/nginx.conf`, Vite 7.3.6 | §5 |

## 1. The entry and the parameters

`?menuflow` (any value, or none) mounts the front end over the page (`mountFrontEnd`); with a dialog's name
(`menuflow=dlgOptions_Menu.rdr`) the boot starts there, as the console's `--menu_state` does (`FUN_001eabd0`, research
115). The old `frontend` opens nothing (OT.R9: replaced, not aliased). *(This paragraph read "The map viewer and the
match underneath load as they always did" until OT.R12, 2026-10-03: under `menuflow` nothing of them loads, §7. Since
OT.R19, 2026-10-04, the front end needs no parameter at all and the match's page is `/testroom`: §8.)*

The query string is never written by the routes: each address they write is the base, the route's path, then
`location.search` and `location.hash` as they are at that moment, byte for byte (`devmode`, `mode`, `map`, `view`,
`online`, `server`, `mp`, `fly`, `lag`, `loss`, `menuflow` itself and any other, bare ones kept bare). The page's other
address writer, `packages/viewer/src/shareUrl.ts` `updateAddress`, writes only the query, with
`history.replaceState(history.state, '', pathname + search + hash)`: it keeps the route's path and the routes' key in
`history.state` (`s2uMenuRoute`), and the routes keep its query. Neither undoes the other; the tests hold both
directions. `shareUrl.ts` and `features.ts` needed no change: `writeShare` already passes an unknown parameter
(`menuflow`) through untouched.

## 2. The table

`/` is the root: the front end's first state, before and at its first dialog -- the page's "reading the front end"
line while the disc is read, then the boot's own first dialog `dlgIntroScreen.rdr` (MS+0x30 as the game object
writes it, `DEFAULT_MENU_SCREEN`; the card check the original shows while it loads). A boot on another dialog
(`menuflow=<dialog>.rdr`) shows that dialog's own route.

| dialog | segment | the path from the root | the screen | entered from (research 128 §1) | guard |
|---|---|---|---|---|---|
| `dlgIntroScreen` | (root) | `/` | the loading screen | the boot | -- |
| `dlgMenu` | `main` | `/main` | the main menu | `dlgIntroScreen` | -- |
| `dlgNetLogin` | `online` | `/main/online` | LOGIN TO SOCOM II ONLINE | `dlgMenu` through `dlgMPswitch` | -- |
| `dlgNetAuthenticate` | `dnas` | `/main/online/dnas` | the DNAS screen | `dlgNetLogin` | session |
| `dlgNetServerSelect` | `universe` | `.../dnas/universe` | SELECT UNIVERSE | `dlgNetAuthenticate` | session |
| `dlgNetPlayerName` | `persona` | `.../universe/persona` | the persona | `dlgNetServerSelect` | session |
| `dlgNetConnect` | `connect` | `.../persona/connect` | connect | `dlgNetPlayerName` | session |
| `dlgUsagePolicy` | `agreement` | `.../connect/agreement` | USER AGREEMENT | `dlgNetConnect` | session |
| `dlgWorldOfSOCOM` | `world` | `.../agreement/world` | SOCOM II ONLINE | `dlgUsagePolicy` | session |
| `dlgMPBriefingRoom` | `room` | `.../world/room` | a briefing room | `dlgWorldOfSOCOM` | session |
| `dlgCreateGame` | `create` | `.../room/create` | CREATE GAME | `dlgMPBriefingRoom` | session |
| `dlgGameLobby` | `lobby` | `.../room/create/lobby`, `.../room/lobby`, `.../world/lobby` | GAME LOBBY | `dlgCreateGame`, `dlgMPBriefingRoom` (JOIN), `dlgWorldOfSOCOM` (AUTOPLAY's `MP_MEDIUS_READY_TO_CONNECT`) | session |

Because the stack is the path, the path is long: the original's history keeps every screen of the online chain
(each script switch pushes the one it leaves, research 115 §1.1), and the route names exactly that. The unit test holds
each edge of the table against the pin's pairs (`dlgMenu -> dlgMPswitch` against research 128 §1's first row, since
`dlgMenu` is no online dialog).

**A dialog not in the table** is `d/<its name without .rdr>` under the screen before it (`/main/d/dlgOptions_Menu`),
so every dialog the manager can show has an address. **A table dialog entered from a screen that is not its parent**
starts again at its own place: LOGIN's TRIANGLE runs `SWITCHMENU(dlgMenu.rdr)`, which pushes LOGIN onto the history
(the history grows forward, research 128 §1's "ways back"), and the path is `/main` again, not `/main/online/main`.

**Not a route**: a popup (an overlay on its dialog: PopUpDialog and KillPopUp change no stack); a pass-through
(`dlgMPswitch`); BRIEFING ROOMS (in place, R129.4); the game states -- `LOAD_SCREEN` and the load state, the round, the
shutdown (the address stays on the screen that left the menu state; a reboot's new boot is a new screen and pushes its
route). The first segments the site serves under the base (`maps`, `assets`, `fmv`, `fonts`, `src`, `index.html`) are
refused by the table's test.

## 3. Navigation

- **A switch** (the game's own, any SwitchMenu) pushes an entry once the new dialog is built (`history.pushState`).
  The state carries the entry's depth and the route key of every entry up to it (`s2uMenuRoute: { depth, trail }`), so
  a reload keeps Back working.
- **PREVIOUS_SCREEN** (the game's) returns to the previous entry's stack: the adapter calls `history.go(-1)`, so the
  address after it equals the address before the push and the entry ahead stays for Forward; that move's `popstate`
  is the adapter's own and is not handled again (a test holds it: the entry ahead stays in the adapter's trail).
- **The browser's Back** to an earlier entry: M's history is cut to the entry's last screen (one step, a pass-through
  between, or several entries at once all land in one return) and PREVIOUS_SCREEN is sent through the SwitchMenu row
  (PLAT-08's host, so the BACK sound plays as the original's back plays it).
- **The browser's Forward** re-enters: the entry's next screen is switched to through the SwitchMenu row, one step per
  idle frame, its pass-through first (`dlgMPswitch` before LOGIN, so its ONSTART runs as the original's does).
- **Back to an entry deeper than the manager** -- after a deep link to `/main`, the game's PREVIOUS_SCREEN returns to
  the replayed root and pushes `/`; the browser's Back then goes to the `/main` entry -- re-enters it the same way
  (direction is read from the stacks, not from the entry's index), so the entry is kept, not rewritten. Re-entering a
  guarded place is refused on both sides: Forward sends the browser back, Back rewrites the entry to where the manager
  is.
- **A step that changes nothing** (no history to return to, a dialog that will not open) gives up, and the entry is
  rewritten to where the manager is. The address never shows a place the manager is not.

The game's own switches are never guarded: the routes mirror whatever the scripts do.

## 4. A deep link

At the front end's start, before its first frame, the path is read under the base: its segments walk the table from
the root, each a child of the screen before it. The stack they name is replayed -- M's history pushed in order
(`pushHistory`, pass-throughs included), the last dialog the menu state's first build -- with no transition, script or
sound of the screens before it. Then:

- **A guard.** A route may declare one (`RouteGuards`); the walk stops at the first guarded route the guards refuse and
  lands on its parent. Today's only guard is `session` (a logged-in session on our server), on every screen past LOGIN:
  those screens cannot run without the state LOGIN's own sequence makes (the DNAS step, the universe, the persona, the
  connection). No session exists in the page yet (`ROUTE_SESSION_PLACEHOLDER`), so `/main/online/...` beyond LOGIN
  lands on `/main/online`. A generic place (`d/<name>`) carries the same guard when it stands under LOGIN (any `d/`
  child of LOGIN or of a screen past it) or names one of the online dialogs the table lacks (`ROUTE_SESSION_DIALOGS`:
  the pin's `dialogs` less the table's and `dlgMPswitch`; `dlgFriendList`, `dlgCreateClan`, `dlgOnlineOptions`,
  `dlgLadderLobby` and the rest are entered only from the online chain), so `/d/dlgFriendList` lands on `/` and
  `/main/online/d/dlgFriendList` on `/main/online`. A `d/` place under LOGIN that needs no session (LOGIN's own LAN
  branch, `dlgLANPlayerName`) is refused too until its stream gives it a table route without the guard. The browser's
  Forward into a guarded place is refused the same way (the browser is sent back; the manager stays).
- **The session's owner** (SVC-03, ONL-03..ONL-07) supplies the guard's answer: `connectMenuRoutes`' `guards` option
  (absent, `NO_ROUTE_SESSION`), today not passed by `frontEnd.ts`'s one line -- that line, or the default, is theirs to
  change.
- **An unknown path** -- a segment no route has, a `d/` name that is not a dialog's (or names a table dialog or a
  pass-through, so no guard is stepped round), a dialog the disc does not have (the adapter asks the machine's own
  lookup, `FrontEndMachine.hasDialog`, before it replays: a missing one would otherwise build nothing and leave a blank
  screen no frame mirrors), a path that will not decode, a path outside the base -- lands on `/main`. Nothing throws.
- **A reload.** The entry's state (`s2uMenuRoute`) holds the route key it showed. When that key names the same path,
  can be entered directly and its dialogs are on the disc, its own stack is replayed (the pass-through put back,
  `routeStackOfKey`), not the table's: `menuflow=dlgMenu.rdr` at `/` shows `/main` on a one-screen stack
  `[dlgMenu]`, and its reload keeps `[dlgMenu]` (PREVIOUS_SCREEN alike before and after). Without such a state -- a
  link opened fresh -- the path's table stack is replayed, and **a deep path wins over the parameter's dialog**
  (`/main?menuflow=dlgOptions_Menu.rdr` opens `/main` on `[dlgIntroScreen, dlgMenu]`); the parameter's dialog is the
  boot only at `/`.
- The address is then **replaced** with where the link landed (no new entry), the query and fragment as they were.

## 5. Serving

- **The base path** (`packages/viewer/vite.config.ts` `base`, from `VIEWER_BASE`: `/socomlegacy/` on the site, `/` in
  development) prefixes every route; `/socomlegacy` and `/socomlegacy/index.html` read as the root.
- **Development**: Vite 7.3.6's dev server answers any `GET` that accepts HTML and names no file with `index.html`
  (`htmlFallbackMiddleware`, `appType: 'spa'`, the default), and rewrites the page's relative `./src/...` URLs against
  the base when the page was reached at a deeper path (`processNodeUrl`), so `/main/online?menuflow&devmode` loads the
  page. Read in `node_modules/vite/dist/node/chunks/config.js`, and held by `packages/viewer/test/menuRoutesServe.test.ts`
  (the viewer's own config, a dev server in middleware mode on the loopback: `/main/online` and
  `/main/online/d/dlgOptions_Menu`, under `/socomlegacy/` and `/`, answer 200 with the same page as the root; an
  `appType: 'mpa'` server answers 404, so the test sees the fallback). No browser run yet (the host's gate).
- **The site**: `shared/deploy/site/nginx.conf` already has `location /socomlegacy/ { try_files $uri $uri/
  /socomlegacy/index.html; }` -- a deep path under `/socomlegacy/` is answered with the page (and the internal redirect
  meets `location = /socomlegacy/index.html`'s `no-cache`). The site root's unknown paths stay real 404s
  (`location / { try_files $uri $uri/ =404; }`), which the routes never reach. So the routes need **no deploy change**;
  what they need is that the fallback stays and that nothing new is served under `/socomlegacy/` at a route's first
  segment. That is the owner's row H72 (`../HUMAN_TASKS.md`): the deploy is the owner's.

## 6. Placeholders and readings

| name | stands for | searched / reading | status |
|---|---|---|---|
| `ROUTE_SESSION_PLACEHOLDER` (`ui/src/routes/menuRoutes.ts`) | the session the `session` guard asks for | none: no session exists in the page until SVC-03 and the online screens (ONL-03..ONL-07) make one; the guard's shape (`RouteGuards.session`) is declared, its answer is the stub `NO_ROUTE_SESSION` | open |

## 7. The entry alone (added 2026-10-03, OT.R12)

The owner, 2026-10-03 ~02:05Z, verbatim: "when &menuflow is initiated, do not render the action game in any mode
behind and proceed as you were" -- an amendment to OT.R9 (`../plans/2026-10-02-online-path-target.md`, OT.R12). Until
then `index.html` loaded `src/main.ts` whole and `main.ts` called `mountFrontEnd` beside everything else, so under
`?menuflow` the WebGPU / WebGL world still booted and drew under the front end's canvas, its workers ran,
`maps/index.json` and a map were fetched and the match page's `/rooms` went out (seen on the owner's preview that
night: the FROSTFIRE playtest panel, the map behind the black canvas). A browser adaptation, like the rest of this note.

- **The page's one script is `src/entry.ts`**, which hands `location.search` to `bootPage` (`src/pageEntry.ts`).
  Without `menuflow`, `bootPage` does `import('./main')` and nothing else: today's page (OT.R9), its script now landing
  after the document's `load` event (a dynamic import; a browser spec acting at once waits for `window.__viewer`). With it:
  every element under `<body>` is removed (`#view`, the disc page, the bar, the panel with its mode switch and picker,
  the loading screen, the Controls popover, the touch layer, the tip), the body takes the page's own PS2-picture state
  (`ps2-look`: `--s2u-ground-deep`, black; the design system owns the colour, so no inline style), then
  `import('./frontEnd')` and `mountFrontEnd(search, startSource(search, maps), document)` -- the served tree still
  `?devmode`'s to grant (the owner's rule of 2026-09-29): `?menuflow` alone says "open the page with ?devmode&menuflow"
  on its canvas. `main.ts` no longer imports or mounts the front end. Removed rather than hidden: the `hidden`
  attribute loses to the chrome's own `display` rules (`.s2u-overlay`, `body.touch #touch`), and an element that is
  not in the page cannot be drawn on, listened to or tabbed to; no stylesheet or class was added.
- **Two files, not one**, so the decision can be tested: whichever module carries the top-level `bootPage(location.search)`
  cannot be imported by a test without booting, so `entry.ts` holds only that line and `pageEntry.ts` the decision with
  its two loaders injectable (`PageLoaders`). `./frontEnd` is imported statically (the decision's `frontEndEntry`, and
  so `mountFrontEnd` with it: a second, dynamic `import('./frontEnd')` of the same chunk is moot, the build says so);
  `./main` is the dynamic import, the one chunk the front end's page never loads (the build: `main-*.js` 1,535 kB
  apart from the entry's `index-*.js` 259 kB).
- **What the front end needs of the document** (read for this change; `mountFrontEnd`): `body` to append its canvas,
  `defaultView` for the menu input, the animation frame, the routes' history and the soft keyboard's keys, the
  `visibilitychange` event, and the first gesture on the document for its audio unlock. None of the viewer's markup.
- **The routes under it** (§3-§5) are unchanged: the base path, the deep-path fallback (the dev server rewrites
  `./src/entry.ts` against the base as it did `./src/main.ts`; `packages/viewer/test/menuRoutesServe.test.ts` still
  answers 200 at `/main/online`), `shareUrl`'s query writes.
- **Held by**: `packages/viewer/test/entry.test.ts` (jsdom; the two loaders injected: with `menuflow` `main` never
  imported and the front end mounted, without it `main` imported and the front end not; the chrome gone before the
  front end's module resolves; with the real front end a `fetch` spy sees nothing under `maps/index.json` or
  `/rooms`, `HTMLCanvasElement.prototype.getContext` is asked only for the front end's own `2d`, never of `#view`; the
  wiring `index.html` -> `entry.ts` -> `bootPage`, and `main.ts` free of `mountFrontEnd` and the stale `?frontend`
  comment) and `packages/viewer/e2e/menuflow.spec.ts` (a rendered browser run: `?devmode&menuflow` with Online = Local
  remembered makes no request under `maps/index.json` or `/rooms`, has no `#view` and no `window.__viewer`, its body
  is the one `canvas#front-end` of 640 x 448 over `rgb(0, 0, 0)`, and the front end has read `RUN/UI/READERC.ZAR`;
  `?devmode&fly` boots the viewer as before: the map list, `#view`, the hook, FROSTFIRE, no `#front-end`).
- **Not read**: nothing of the original; this is the page's wiring.

## 8. The front end is the page; the match at `/testroom` (added 2026-10-04, OT.R19)

The owner, 2026-10-04, verbatim: "remove the need now for &menuflow and make it the default. make all the old params
for matches only relevant to a new /testroom. the default load is the menu flow now." (OT.R19 in the online path's
plan.) A browser adaptation, the page's wiring; nothing of the original read or changed.

- **The path decides, not the query.** `entry.ts` hands `location.pathname + location.search` to `bootPage`
  (`packages/viewer/src/pageEntry.ts`), which reads the path against the page's base exactly as the routes do
  (`import.meta.env.BASE_URL`: `/socomlegacy/` on the site, `/` in development; `routeSegmentsOfPath`): a first segment
  `testroom` is the test room -- `import('./main')`, the map viewer and the match with every parameter they read, the
  page as it was -- and every other path under the base, the base itself included, is the front end alone (§7's
  page). A path outside the base is the front end's too. `readPageAddress` is the reading, never throwing.
- **`testroom` is reserved**: `@s2u/ui`'s `TEST_ROOM_SEGMENT`, in `RESERVED_ROUTE_SEGMENTS` beside `maps`, `assets`,
  `fmv`, `fonts`, `src`; no route takes it (the unit test), and a front end that met it would plan `/main` (§4).
- **What `menuflow` means now**: `menuflow=<dialog>.rdr` stays the developer's start dialog on the front end's page
  (`frontEndEntry`, `--menu_state`'s meaning, §1); a bare `menuflow` (or any other value) is accepted and means
  nothing; at `/testroom` it is ignored like any unknown parameter. `frontEndEntry` no longer answers null: the front
  end's page always has an entry. `FRONT_END_ENTRY_READING` keeps its name and value. `devmode` is the developer's
  on both pages (OT.R14); without it the base path shows the front end's disc prompt (research 148) and `/testroom`
  the viewer's, each as before.
- **Not read at the base path**: the viewer's and the match's parameters -- `map`, `mode`, `view`, `online`
  (`shareUrl.ts` `readShare`), `fly`, `nomatch` (`flyAccess.ts`), `kit` (`loadout.ts`), `noarmory` (`main.ts`),
  `mp`, `lag`, `loss` (`netPage.ts`, `online.ts`), `rules` (`rules.ts`) -- are read only by `main.ts` and its
  modules, which the front end's page never imports. `server=` on the front end's page names our match server for the online screens (the
  universe service, `universeHost.ts`, ONL-04; OT.R9's parameter, as before) and is not a match parameter there; the viewer's own use of it,
  the match's server (`netPage.ts`), is read only at `/testroom` (the controller's reading of OT.R19, 2026-10-04).
- **Serving** (§5): the dev server's SPA fallback answers `<base>testroom` and `<base>testroom/` with the page, and its
  script and stylesheet references come back absolute under the base, so none resolves under `testroom/`; the
  page's own fetches (`maps/`, `fmv/`) and workers were already absolute (`BASE_URL`) or module-relative. The site's
  `location /socomlegacy/ { try_files $uri $uri/ /socomlegacy/index.html; }` serves `/socomlegacy/testroom` the same, with no
  change; the site's default page changes at its next deploy, the owner's.
- **Held by**: `packages/viewer/test/entry.test.ts` (no parameter -> the front end; `/testroom` -> the viewer; a match
  parameter at the base path loads nothing of `main`; the base `/socomlegacy/`), `packages/viewer/test/frontEnd.test.ts`
  (`frontEndEntry` with no parameter), `packages/ui/test/routes/menuRoutes.test.ts` (the reserved segment),
  `packages/viewer/test/menuRoutesServe.test.ts` (the dev server at `testroom`), and `packages/viewer/e2e/menuflow.spec.ts`
  (a rendered browser run: the base path never requests `src/main.ts`, a match's parameters there change nothing,
  `/testroom` boots the viewer and never the front end). Every spec of the viewer and the match opens `/testroom`
  (`packages/viewer/e2e/urls.ts` `TEST_ROOM`).
