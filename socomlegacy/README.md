# SOCOM Legacy: SOCOM II in the browser

**The mission** (the owner, 2026-10-01; the whole of it is [`docs/MISSION.md`](docs/MISSION.md)): a 1:1 "spiritual"
three.js/TypeScript port of SOCOM U.S. Navy SEALs II (PS2, US) -- enough of Zipper Interactive's zEngine to run SOCOM II
in a browser, from the opening Zipper Interactive text, the intro movie, the main menu, the options and the online
feature, through the game itself. Every menu as the original displays it and behaving as the original does; the PS2
memory card simulated in the browser's local storage; options a browser cannot have still shown, with a screen saying
they are "available in the desktop recompilation or with emulators". **Validation is our confidence measure**: every
answer derives from a source, in the order MISSION.md gives, and nothing that departs from the original is a judgement
call. **The single-player campaign is out of scope for now** (the owner, 2026-10-01): the desktop recompilation plays it.

**What runs today**, as the repository's own record scores it ([`docs/STATUS.md`](docs/STATUS.md), as of its last
re-score, 2026-10-24 at `c5a6ccaac`: 214 items done, 66 partial, 30 to do -- 80% of the way to the r0001 client's
multiplayer on our own server). The launcher at `/` takes **your own copy of the disc** (read in the browser, never
uploaded) and hands over to the game's front end: the opener's movies, the main menu, OPTIONS, and the online path --
LOGIN, the briefing rooms, CREATE GAME, the game lobby and its ARMORY, chat, friends, clans, the rankings -- into a
round on our match server. The round is all 22 multiplayer maps drawn from the disc's archives with three.js, and the
SEAL's movement, the weapons (grenades, launchers, turrets, WEAPON EXCHANGE), the HUD, sound and voice, scoring and the
round screens, online or offline (STATUS, "Game · match"). Almost all of it is a **reading** -- transcribed from the
game's decompiled code or its disc data and held by tests -- and only a few values are **proven** against the original
running: the capture and trace windows that would prove the front end and the online flow have not been run (STATUS;
HUMAN_TASKS H24-H27). Partial or still to do, by STATUS: the memory card's own screens, EXTRAS, the boot's other
branches, the lobby ARMORY's selection rows (ONL-17, PLAT-34), most maps' own objective work (the airstrikes, the
autostart, the three HDD maps), and the feel values that stand on named placeholders (recoil, spread, reload). Since
that re-score `main` has landed, not yet in STATUS's count: the launcher's redesign (v0.3.0, PR #521), r0004 as the
specification for gameplay and the front end (MISSION OT.R97; its rows land one at a time as **reading, pending
review**, [the r0004 plan](docs/plans/r0004-option-b.md)), the redesigned replay viewer (RV2, PR #637) and an HD
texture pack built but held off (HD-HOLD, `ccc46f055`). Outside STATUS's count, as adaptations: the Forge's creator
(no original, PR #520) and the authored multiplayer CPUs (MISSION OT.R81; STATUS leaves the lobby bots out). Nothing is pre-baked, and the repository holds no game asset beyond the small test
fixtures RS.R8 allows (H71).

SOCOM 2 Legacy is a separate spin-off / sister project of [SOCOM Unzipped](https://github.com/Scotho/socom-unzipped).
This repository owns its own browser site, research and match server. The repository root is one npm workspace: this
application and the shared design system in `../shared` ([`../shared/ds`](../shared/ds/README.md)); the inherited
sister-project landing site and publishing stack have been retired (2026-10-04, OT.R30). Nothing here publishes by
itself: the deploy files are `deploy/`, and which build a host serves is the owner's (MISSION, OT.R31 with OT.R46 and
OT.R94). It needs nothing from the recompilation and the recompilation needs nothing from it (see
[What the viewer takes from the rest of the repository](#what-the-viewer-takes-from-the-rest-of-the-repository)).

The project pages -- `/news`, `/roadmap`, `/journey`, `/archive`, `/server` and `/status` -- are Vite inputs of their own
beside the launcher (`packages/viewer/vite.config.ts`): independent entry points that import no gameplay or device
bootstrap. Add future content through the [typed collection guide](packages/viewer/src/projectSite/README.md).

## Before starting

**How the page starts.** At the page's base path the first screen is the **console launcher** (CX.R8, the owner,
2026-10-12: the console layout "becomes the new launcher default"; CX-9, PRs #157 and #158), restyled by the launcher
redesign of v0.3.0 (PR #521; [its plan](docs/plans/2026-10-26-launcher-redesign.md)) -- a browser adaptation with no
original. Its categories are **Profile / Settings / Home / Online / Experiments**, Home the default (LR.R2). The old
setup page of OT.R28 (its DISC LOADED panel and START GAME) is gone with CX-9b; `<base>setup` is now the plain disc
page, where an image that opens mounts the front end at once (`packages/viewer/src/pageEntry.ts`).

**The disc.** Choose your SOCOM II disc image (.iso) or a folder holding the disc (DA-1, CX-10a) from the disc mark in
Home's bottom row, which opens the disc's source menu (LR-24, LR.R23; Square on Play opens it too). The Disc row's
cog (CX-16, CX-19) remains only in the launcher's overlay over a game (`packages/viewer/src/console/state.ts`, the
source menu's open test; `console/grammar.ts`, LR-23's Square). Any disc but SCUS-97275 is refused (DA-2). It is read in this browser and never uploaded:
the launcher extracts it into the browser's storage (DX-1, PR #234), so a later visit starts from it with no prompt
and asks again only when that storage is cleared (DX-3, PR #239). Home's **Play** then mounts the game's front end:
the opener's screens and movies, then the main menu (CX-6; OT.R19's menu flow). The remembered-disc and kept-copy
controls are still to do, on the owner's H199 (STATUS, CX-10b, DA-7, DA-8).

**Controller first.** Play needs a connected controller, or a touch device's own controls (LR-31, LR.R25: "as on the
disc"; keys and clicks do not start it). The launcher's own menus also answer WASD, the arrows, Enter and Escape on
every build (LR-30, LR.R24). **In the game the keyboard is for local testing only** (OT.R29): in a development build
(the dev server, the owner's preview) a key pressed in the page stands in for the controller, and the menus, the soft
keyboard and the match keep their keys; every `vite build` (the release, a demo) leaves all of it out
(`packages/viewer/src/keyboardTesting.ts`, `test/keyboardGate.test.ts`, `test/build_keyboard.test.ts`).

**Button mapping** is the launcher's (CX-14, kept by LR.R4): the Controller settings' **Button mapping** row -- the
actions round the controller picture, the dead zone, the crouch shortcut, hold-to-bind, and a pass that teaches
a pad the browser does not map as standard (LATER 380). The game reads those choices: the menus and the match poll the
chosen pad (or the first standard pad when it is gone) through its saved bindings, dead zone and crouch shortcut
(`packages/viewer/src/setupPad.ts`); nothing customised, the original's layout. A button held as the menus first read
the pad is ignored until released.

**The picture.** OPTIONS' VIDEO MODE offers **Modern** (the default: the world at the window's size) and **PS2** (the
640×448 frame on a 4:3 box), an intended divergence on the owner's ruling (OT.R79; `packages/viewer/src/picture.ts`).
Its third choice, the HD texture pack's picture, is in the build but cannot be turned on (HD-HOLD, the owner,
2026-11-01, `ccc46f055`: `VIDEO_PICTURE_HD_OFFERED` false, until the GPU work is done). The front end's menus are the
original's 640×448 UI frame, drawn whole and letterboxed in the window under both: the dialogs are 4:3 by design, so
Modern does not widen them. The test room keeps its own **Picture** setting (`s2u.viewer.look`).

**The microphone** is optional. The launcher's microphone item asks the browser for it only when turned on, and the
chosen device is what the game's voice uses: its one source is `packages/viewer/src/gameMicrophone.ts`
`getGameMicrophone()` (the device, the default when it is gone, nothing when off), which opens nothing until voice
begins (SVC-20b; `packages/viewer/src/console/adapters/mic.ts`).

`/testroom`, the map viewer and the match with all their parameters, keeps its direct path for development: only the
disc section shows there, and an image loads at once.

Run `npm run e2e:startup` for the startup checks in Chromium, Firefox, WebKit and emulated Android/iPhone layouts
(`npx playwright install chromium firefox webkit` installs the matching test engines). Those device layouts and
synthetic controller/permission tests do not replace testing physical devices. The implementation and validation
record is in the [startup options plan](docs/plans/2026-10-03-startup-options.md).

The setup page's startup media (the menu movie, its poster and the Crossroads captures under the ignored
`public/startup/`) is gone with its pipeline (CX-13, 2026-10-17): nothing on any page has read it since CX-9b, so no
tool makes it and no build ships it, the owner's OT.R34 exception unused. `public/maps` is never copied. The button mapping
screen's controller drawing is Sony's DUALSHOCK 4 line art (LATER 380, H313); Sony's source and usage notice is in
`packages/viewer/src/assets/sony/NOTICE.txt` and ships as `licenses/sony-controller.txt`.

## What it is today

What follows is each part's state by [`docs/STATUS.md`](docs/STATUS.md) (as of 2026-10-24); "read from the game" means
a **reading** -- transcribed from the disc or the decompilation and tested -- unless STATUS's Level column says proven.

- **The game's front end and online path.** The opener, the main menu, OPTIONS (every row but HDD, OPT-09) and the
  online screens from LOGIN through the briefing rooms, CREATE GAME (classic or RESPAWN), the game lobby, chat, friends,
  clans and the rankings to the round and back to the lobby, on our own server (STATUS, "Game · front end" 64%,
  "Game · online" 92%). The memory card's state screens, EXTRAS and the boot's other branches are still to do there.
- **A map viewer.** All 22 multiplayer maps -- geometry, textures, lighting, fog, LOD, detail textures, collision,
  spawns -- decoded from the disc's archives and drawn as the console's Graphics Synthesizer drew them, on WebGPU or
  WebGL2, with a free-flying camera and a PS2 presentation (the console's 640x448 frame stretched as a television did).
- **reCOM mode.** Walk the maps as a SEAL: the game's third-person camera and movement law, the SEAL's own model and
  motion clips, jumps, stances, ladders, climbing, peeking and wading; the 63 in-scope weapons and items driven by their
  `ZWEAPON` records -- firearms, grenades, launchers, rockets, explosives, the turrets -- with the game's accuracy and
  recoil (the recoil, spread and reload feel still on named placeholders: STATUS, "Weapons & equipment"); the game's
  HUD, sounds and effects. The views are third person, first person, the
  binoculars and the scope, stepped by the zoom (first person and the binoculars restored by the owner, 2026-10-01). reCOM mode is the settings' **Mode** switch's **Play**, on every page, and opens
  on foot. Offline it plays a match on its own -- the match server's room run in the page
  ([Offline match](#offline-match)); `&nomatch` keeps the free walk.
- **Multiplayer.** Classic matches (respawn off, the game's create-game default: 11 rounds, first to 6) and, since
  OT.R71, respawn matches (the game's RESPAWN: one 20-minute round, on SUPPRESSION maps) of up to 16
  players plus spectators on our Node server -- the games players create through the front end, and in the test room
  one standing match per map -- the round's damage, death, teams, scoring and scoreboard read from the game; the
  mission modes' map-specific work (EXTRACTION's hostages, ESCORT, BREACH's airstrikes and gates) is partial in STATUS
  ([Multiplayer server](#multiplayer-server-web-sprint-3)). Off in a static single-player build (`VITE_S2U_MULTIPLAYER=off`); on in
  `npm run dev` and a plain build.
- **A worked example of recreating a PS2 game in the browser** from its own data: see
  [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for which parts are general PS2 and where to start with another game.

## What it is not

- **Not an emulator.** No PS2 code runs; the engine's data paths and rules are re-implemented in TypeScript.
- **Not yet the whole game, and not yet proven.** The launcher, the front end, the online path and the round run (above),
  but the memory card's screens, EXTRAS, the boot's other branches and much of the maps' own objective work are still
  to do or partial ([`docs/STATUS.md`](docs/STATUS.md); [`docs/MISSION.md`](docs/MISSION.md)), and almost every built
  value is a reading, not yet measured against the original running (STATUS; HUMAN_TASKS H24-H27). There is no
  recovered campaign enemy AI or original online service. Optional authored multiplayer CPUs -- their decisions an
  adaptation (MISSION OT.R81) -- play Frostfire (MP2) and Vigilance (MP51) respawn games only (`BOT_MAPS`,
  `packages/match/src/botGates.ts`; B183, PR #606), on a host with the prepared bot
  navigation graph ([BOTS-LAND](docs/plans/2026-10-24-bots-land.md); setup: [research 364 §2](docs/research/364-authored-multiplayer-bots.md#2-navigation-and-boundaries)). The campaign is out of scope for
  now. It does not connect to anyone else's server.
- **Not a source of game data.** You supply your own disc (the page opens your `.iso` in the browser; nothing is
  uploaded). The repository ships no archives, textures, models, sounds or code from the game.
- **Not affiliated** with Sony Interactive Entertainment or Zipper Interactive.

## Documentation

| read | for |
|---|---|
| [`docs/MISSION.md`](docs/MISSION.md) | the mission: the scope from boot to online, the sources of truth in order, validation, the campaign out of scope |
| this README | running it, the controls, what the picture is made of, the known gaps |
| [`docs/roadmap/`](docs/roadmap/README.md) | the mission as segments and tasks, the owner's calls; [`SPRINTS.md`](docs/roadmap/SPRINTS.md): the order, the two seats, the owner windows |
| [`docs/HUMAN_TASKS.md`](docs/HUMAN_TASKS.md) | what only the owner can do or decide, with its source and what waits on it |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | the packages, their boundaries, the sim shared by page and server, the front end's packages and its state flow as built, adapting it to another PS2 game |
| [`docs/DATA_SOURCES.md`](docs/DATA_SOURCES.md) | every kind of data: where it comes from, the code that reads it, how it was verified; the legal stance |
| [`docs/PROCESS.md`](docs/PROCESS.md) | the stack and the development process: ground truth, research notes, rulings, AI agents |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | the web project's conventions (the repository's rules are [`../CONTRIBUTING.md`](../CONTRIBUTING.md)) |
| [`docs/corpus/llms.txt`](docs/corpus/llms.txt) | the same knowledge as structured records for an AI assistant |
| [`docs/research/`](docs/research/) | the evidence: the web project's research notes, from 71, each citing the disc files and decompiled functions it read |
| [`docs/specs/`](docs/specs/), [`docs/plans/`](docs/plans/) | the sprints' specs and plans ([the plans' index](docs/plans/README.md)); a plan's Log is the record of every task and number |

**Start here if you are a new agent or contributor:** read [`docs/MISSION.md`](docs/MISSION.md) first, then
[`docs/STATUS.md`](docs/STATUS.md) for what is built, the roadmap ([`docs/roadmap/README.md`](docs/roadmap/README.md)),
and [`docs/HANDOFF.md`](docs/HANDOFF.md) with the open plans ([the plans' index](docs/plans/README.md)) for what is in
flight; a plan's `## Log` is its live state. The match side's first sprints, kept as the record, are web sprint 5, "the armory" ([plan](docs/plans/2026-09-30-web-sprint-5-armory.md)), and web sprint 4, "the
arsenal" ([spec](docs/specs/2026-09-30-web-sprint-4-arsenal-design.md), [plan](docs/plans/2026-09-30-web-sprint-4-arsenal.md));
before them, web sprint 3, "the round"
([spec](docs/specs/2026-09-29-web-sprint-3-multiplayer-design.md), [plan](docs/plans/2026-09-29-web-sprint-3-multiplayer.md)),
web sprint 2, "the SEAL in the world"
([spec](docs/specs/2026-09-28-web-sprint-2-the-seal-in-the-world-design.md), [plan](docs/plans/2026-09-28-web-sprint-2.md)),
web sprint 1, "the engine's world" ([spec](docs/specs/2026-09-28-web-sprint-1-the-engines-world-design.md),
[plan](docs/plans/2026-09-28-web-sprint-1.md)), and the viewer's first design and polish
([design](docs/specs/2026-09-20-web-map-viewer-design.md), [polish](docs/specs/2026-09-26-web-map-viewer-polish-design.md)).
The byte-level format authority is [`docs/research/72-mp-map-archive-anatomy.md`](docs/research/72-mp-map-archive-anatomy.md),
and the meaning of every vertex lane is [`packages/mesh/SEMANTICS.md`](packages/mesh/SEMANTICS.md). Comments in the
code cite research notes by number (`research 84 §3` is a note in `docs/research/` here, from 71 up; `PC research NN` is
the desktop's, `desktop@be557831:docs/research/`, whose numbers overlap these) and the decompilation's Ghidra function names
(`FUN_00xxxxxx`). The behaviour every change is checked against, maps and pictures included, is pinned down in the
Playwright specs under [`packages/viewer/e2e/`](packages/viewer/e2e/) (`npm run e2e`); the viewer's chrome is the s2u
design system, read in place from `../shared/ds/` (`index.html` links `/src/ds/index.css`, which
`packages/viewer/vite.config.ts` aliases there; no copy since 2026-09-29).

**Licence:** GPL-3.0, the repository's ([`LICENSE`](../LICENSE)); see [Licence](#licence).

## How it works (one paragraph)

`@s2u/archive` reads the ZDB table of contents and the ZAR/ZED containers inside it. `@s2u/scene`
reads the map's scene graph (`MP*_GEO.ZED`) into nodes with matrices, walks it the way the engine did,
and places every model, plus the clutter from `CLUTTER.ZAR` and the collision hull. `@s2u/mesh` walks
each model's DMA chain, decodes the VIF1 unpacks into vertices exactly as VU1 would have, and reads the
GIFtag templates for what the packet was (a mesh, a line strip) and how it was to be drawn.
`@s2u/gs` decodes the textures and palettes (PSMT8 with CT16/CT32 CLUTs, PSMCT16 and PSMCT32) and the
GS state block each texture's bind packet sets. `viewer` builds three.js objects from all of that in a
worker, draws them with a shading graph that does the GS's own arithmetic (modulate, clamp, fog,
brighten, blend) in the order the engine drew them, and puts a fly camera in front of it.

## Build

### Prerequisites

- **Node 22** or newer (the tools use `import.meta.dirname` and top-level `await`; the images and the systemd host run 22).
- **A disc tree**: a directory with `RUN/MP*.ZDB` in it, from your own SOCOM II disc (US retail,
  SCUS-97275). The viewer needs only those 22 archives, about 224 MB. See the next section for where
  to get them. A player needs neither: since web sprint 1 the page opens the `.iso` itself
  (the setup page's **Choose disc image**, or drop the file on the page; the test room's disc section the same) and reads the archives out of it as ISO9660 in
  the browser, byte for byte what the served tree would hold, nothing uploaded anywhere.

### What the viewer takes from the rest of the repository

The viewer needs **no recompiled game, no toolchain and no emulator** — nothing from the
recompilation's build (`build.sh`, `recomp/`, `third_party/`, `tools/`). What it does take:

1. **The disc tree.** The recompilation's launcher and tooling read the game out of your own ISO into
   `game/disc/` ([the root README](../README.md), "The user supplies their own disc image");
   `tools/extract-maps.ts` defaults to that location. You do not have to go through the
   recompilation to get one: mounting the ISO (double-click on Windows, `hdiutil` on a Mac,
   `mount -o loop` on Linux) gives you the same `RUN/` directory, and that is all the extractor reads.
2. **The research.** The format is documented in `desktop@be557831:docs/research/` — `36` for the
   archives, `13` for the VU1 world-object program the vertex decode mirrors, `31` for the brighten
   and the blend equations, `26` for the GS state — and the design specs in `socomlegacy/docs/`. The code
   cites the notes by number.
3. **reCOM**, the open-source reconstruction of the engine ([Credits](#credits); a git-ignored local clone, not
   part of the tree), which is where the engine's draw order (`zRender/zrndr_pipe.cpp`) and the scene-graph hookup
   (`zVisual/vis_main.cpp`) were read.

### Commands

Run from `socomlegacy/` (npm finds the workspace root, the repository's, itself; from the root add `-w @s2u/socomlegacy`):

| command | what it does |
|---|---|
| `npm install` | workspace install (redotcom's sixteen packages plus `tools`, and `shared`) |
| `SOCOM_DISC=/path/to/disc npm run extract-maps` | disc tree → `public/maps/RUN/*.ZDB`, the shared archives beside them (`COMMON_ARCHIVES`: `READERC.ZAR`, `ZWEAPON.ZAR`, the motion packs, and the sound's `SOUNDRDR.ZAR`, `SOUNDS/BNKSTORE.ZAR` and `IRX/LIBSD.IRX`), `index.json`, and three test fixtures. **Run this first.** (`SOCOM_DISC` defaults to the repository's `game/disc`, two levels above `socomlegacy/`.) |
| `npm test` | vitest over every package; the fixture-backed tests skip when the extractor has not run |
| `npm run typecheck` | `tsc` over every package under `packages/` and `tools` (`package.json`'s `typecheck`) |
| `npm run dev` | Vite at `http://localhost:5173`: the menus at `/`, the map viewer and the match at `/testroom` (below) |
| `npm run local` | local development stack; its CREATE GAME offers RESPAWN as every server's does (OT.R71) -- open its printed link in two windows with distinct accounts |
| `npm run build` | the viewer as a self-contained static site in `dist/viewer/` (the launcher, the old page at `/setup` and the project pages) |
| `VIEWER_BASE=/socomlegacy/ npm run build` | the same, to be served under a path prefix (the site's, `/socomlegacy/`) |
| `VITE_S2U_MULTIPLAYER=off npm run build` | the same, single player: multiplayer off in this build (a local single-player build; see **Multiplayer off** below) |
| `VITE_S2U_MAP_ALLOWLIST=MP2,MP51 npm run build` | the same, its map picker limited to those maps (the match server reads the same variable; see **The map allowlist** under **Multiplayer server**) |
| `npm run e2e` | Playwright: loads all three fixture maps, asserts the stats, toggles the overlays, writes screenshots |

CREATE GAME offers RESPAWN on every server that hosts games (OT.R71, the owner 2026-10-22). To play a respawn match
on the local stack, which needs the served extract above and `SOCOM_DISC` naming the disc directory that contains
`RUN/`: use its printed link (`devmode` and the loopback server); in CREATE GAME set RESPAWN to ON, choose FROSTFIRE,
then create. The second window logs in with a different account, joins the game, switches teams if needed, and both
players select READY. The native respawn setting uses one 20-minute round. `--respawn` is still accepted (it was the
development opt-in before OT.R71) and changes nothing; it and the respawn game work with `--split` too. Ctrl+C in the
stack's terminal stops its own children.

**The page and the test room** (the owner, 2026-10-04, OT.R19 in [the online path's plan](docs/plans/2026-10-02-online-path-target.md):
"the default load is the menu flow now"). At its base path (`http://localhost:5173/`, `/socomlegacy/` on the site) and
every path under it but `/testroom` (and, on a development build, `/playtest`), the page is the game's front end alone -- the opener, the menus, the online path, the
address's path following the menus (`/main`, `/main/online`, ...; [research 129](docs/research/129-the-menu-flow-routes.md))
-- with no parameter asking for it, and none of the parameters below is read there. The map viewer and the match, with
every parameter this README names (`map`, `mode`, `view`, `online`, `fly`, `kit`, `noarmory`, `nomatch`, `mp`,
`lag`, `loss`, `rules`, and the match's `server`), are the page at **`/testroom`** (`/socomlegacy/testroom` on the site), and only there:
`http://localhost:5173/testroom?devmode&map=MP2&mode=play`. On the front end's page `menuflow=<dialog>.rdr` starts on that
dialog (a developer's deep link, `?devmode&menuflow=dlgNetLogin.rdr`); a bare `menuflow` means nothing. `server=` on the front end's page names our match server for the online
screens (OT.R9's parameter); it is not a match parameter there, and the viewer's own use of it, the match's server, is read only at `/testroom`. `devmode` works on both. `packages/viewer/src/pageEntry.ts` decides. On a development build only (sprint 37, PTT-9,
W37.R6), a bare `/testroom` -- no parameter, or `?launch` -- first shows the **launch settings** sheet (every parameter
above, grouped, with named presets kept in the browser), and **`/playtest`** shows the same sheet in playtest mode (the
exact `start` command, or a join of a running session at its own link); a link with parameters is the page it was, and
the release build carries none of it (`packages/viewer/src/launchSettings/`).

**For developers: `?devmode`.** Opened by its plain address the page reads only the visitor's own disc image: it shows
the setup page (the test room its disc section) and makes no request under `maps/`. Add `?devmode` (its presence is enough) and it reads the served,
extracted tree from `public/maps/` as it always did, falling back to the setup page (OT.R28) when `maps/index.json` does not
answer (`packages/viewer/src/source.ts`). The e2e specs and the measuring tools under `tools/` open `/testroom` and add it to their URLs (`tools/pageUrls.ts` `testRoomUrl`
joins the base and `testroom`, written once; a `VIEWER_URL` or a base argument names the base, with or without `/testroom`); do
the same by hand, e.g. `http://localhost:5173/testroom?map=MP2&mode=play&devmode`. It is not shown anywhere in the page.
`?devmode` is three switches at once, and each has its own word (`packages/viewer/src/source.ts` `devSwitches`):
`?served`, the served tree in place of the visitor's disc; `?flyok`, the fly toggle in Play (the Fly / Walk switch, `G`,
the pad's Start and `&fly`), on the visitor's own disc; `?devtools`, the developer's tools below (the kit, `noarmory`,
the teleport, the playtest overlay, the taunt editor, the replay, and `server=` for the account requests). The three
words work only in a development build (`import.meta.env.DEV`: the dev server, and the nightly, built with
`NODE_ENV=development`); a production build ignores them. `?devmode` turns on all three, and since OT.R94 (the owner,
2026-10-31: "no ?devmode in release mode anymore", answering H152) it too counts only on a development build. With any switch on, the test room shows a DEV chip naming the ones that are on.
With the tools on, `&kit=<id>,<id>,...` (up to five `zweapon.rdr` item ids, slot order primary, secondary, equipment 1-3; the
rest empty) is the kit the player spawns with on every map and side instead of its character type's -- what a spec
that pins a weapon asks for: `&kit=62,15,121,126,255` is the M4A1 SD, the Mark 23, the M67 and the HE without 2X, the
kit the sprint 2-3 specs were measured on (`packages/viewer/src/loadout.ts` `kitParam`; the page's own match carries it
too). The hook's `loadout()` reads the kit on the body, `setLoadout([...])` makes a pick for the next spawn.
`&noarmory` (with it) keeps the ARMORY shut -- the page's hello does not ask the room to hold its seats for it, so they
spawn at once -- for the specs that play a match without it (`e2e/armory.spec.ts` plays it). With `?devmode` a **playtest
overlay** sits in the corner (`packages/viewer/src/playtestReport.ts`, loaded only then): the display's frame rate, the
round trip, the snapshot rate, the corrections and the connection's drops, each second, and **Save test report**, a JSON
file of the last hour of them with the build, the map and the renderer -- made in the page and saved by you; it sends
nothing anywhere and records no address, name or disc byte (a browser adaptation, from Chris's browser-beta-v5). In a
match whose server runs with `COMBAT_REPORT=1` (the LAN tool's host does) the file also holds a `combat` section: the
last 1,024 combat reports the room sent this page and how many were let go (`docs/research/127-the-combat-report.md`).
| `npm run dump-textures -- RUN/MP2.ZDB` | every texture to PNG, both pixel orders and both CLUT orders, plus contact sheets |
| `npm run dump-sounds -- MP2 [dir] [.STEP_STONE ...]` | a map's 989snd sounds rendered to WAV, with each one's length, peak and RMS (`docs/research/81-sounds.md` §11) |
| `npm run export-gltf -- RUN/MP2.ZDB` | one map's world mesh to a `.glb`, for Blender or a glTF validator |

**The playtest room** (web sprint 33, [the design](docs/specs/2026-10-06-playtest-and-replay-design.md); a playtest
instrument with no original, a development build's only): with `?devmode&playtest=<the session service's socket>` the
page shows a build-context badge, **Mark this moment** (F8, the button, a pad chord placeholder) keeps the frame, a
clip from a rolling video buffer and the telemetry, and the page's own room is recorded as `.s2r` replay segments
(research 240, 241). The session service is `npx tsx packages/playtest/src/cli.ts start [--map <name|stem>] [--online]`
from `socomlegacy/` (research 242): it resolves the target to a commit, starts the dev server and the browser on its own
ports, keeps everything under the git-ignored `socomlegacy/.playtest/<session>/`, prints the ready sheet and closes after 45
minutes without input. The match server records every room when `REPLAYS_DIR` is set (`packages/server`, research
240 §6). Web sprint 34 added the session's verbs (`observe`, `note`, `state`, `decide`, `close`, `export`, `handoff`,
`dispose`), the live media-first report and the durability gate (`docs/playtests/`, research 242, 243, 246, 247). Web
sprint 35 added the **replay mode** (`/testroom?devmode&replay=<a segment's localhost URL>`: a recorded segment drawn
as a spectator sees a match -- play, pause, 0.25-4x, step, seek, the spectator's three modes; research 244), the replay
embedded in the closed session's report with a seek per observation and a timeline, **fix now** (`formalise`,
`fixnow`, `fix`: a prepared branch and brief, five result states) and the **focused retest** (`start --retest <obs>`,
`confirm`: human confirmation as its own evidence kind; research 243 §6-7). Web sprint 36 records **every hosted match** when `REPLAYS_DIR` is set (`packages/server`: a
`.s2r` and a sidecar per match, swept by `REPLAYS_BUDGET_MB` and `REPLAYS_KEEP_DAYS`, listed and fetched at `/replays` and
`/replays/<id>` by its participants' accounts and the operator; research 245); where players find them is the owner's
row, and until then the test room's replay mode opens a hosted one by its URL. Web sprint 37 made the tooling one
command: `start --online` launches its own match server with the session's own accounts (`DATA_DIR` under the session),
both servers and the printed link on loopback (`127.0.0.1`), one account per window; a page on another server is warned
and its segment marked "not recorded"; `words` keeps what the player says after the close; `close --dir` closes a
session whose process died (`abandoned`); a replay's seek restores the state at the target, but for the hostages, a running dance and a placed charge (research 243 §9, 244 §7, §7.2).

### Deploying

`dist/viewer/` is a static site. The page reads the visitor's own disc image in the browser and asks the server for no
game data: OT.R34's exception, the setup page's background video, is unused since CX-13 (no build ships it), and since
OT.R94 no public host serves the extracted maps. On a development build `?devmode` reads a `maps/` directory beside it instead, holding what `extract-maps`
wrote from your own disc (`maps/index.json`, `maps/RUN/*.ZDB`, and since web sprint 2 `maps/RUN/READERC.ZAR` and
`maps/RUN/ZWEAPON.ZAR`, the SEAL's tuning and the weapon table; with the sound, `maps/RUN/SOUNDRDR.ZAR` and
`maps/RUN/SOUNDS/BNKSTORE.ZAR`, and `maps/RUN/IRX/LIBSD.IRX` for the SPU2's reverb presets). The archives are the game's and are never part of the build. The sound banks are read
**by range** -- a map's three banks and `HUDUI.bnk` (about 1.9 MB for Frostfire), plus a lent bank or two, not the
67 MB store -- so the server must answer HTTP `Range` requests
(nginx and Vite do); one that does not still works, fetching the whole store.

The standalone static serving example is in `../shared/deploy/site/`. The match server's and the hosts' deploy files
are `deploy/`; which build a host serves, and where, is the owner's (MISSION, OT.R46, OT.R94). No disc archive is ever
part of a build or a deploy.

**Multiplayer off: `VITE_S2U_MULTIPLAYER=off`** (owner, 2026-09-30: SOCOM Legacy goes out on the site "in its current
state with multiplayer disabled"; `packages/viewer/src/multiplayer.ts`). One build-time switch, on unless it says `off`
(`0`, `false` and `no` too): `npm run dev` and a plain build keep multiplayer; a static-only build is
`VITE_S2U_MULTIPLAYER=off npm run build` (the old site's publishing script is retired, OT.R30; socomunzipped.com is served from Scotho/socom-unzipped, OT.R31). **Multiplayer is off in that build**: the settings' **Online** section
(the switch, its line, the name) is not in the page; the panel's kicker is the plain title `Socom 2 Legacy`, with no PLAYERS
ONLINE count; the `/rooms` poll never starts, so the page asks nothing of a match server;
`online=`, `mp` and `server=` in the address are ignored and taken out of it; no match server is ever joined; and both
Controls lists end with "Multiplayer · off in this build". The **offline match** (reCOM mode against yourself, the match
server's room run in the page, `packages/viewer/src/net/loopback.ts`) stays: it is single player and needs no network --
WEAPON EXCHANGE and its `loadout` request included, which go to that room and never to a socket
(`test/multiplayer.test.ts`). Set the multiplayer flag explicitly for each future release; the project pages
deploy nothing.

**Deploy the viewer before the maps.** Since web sprint 2 `index.json` is `{ maps, common }` -- the map list and
the shared archives -- rather than a bare array. The new viewer reads both forms; an old viewer fails on the new
index. So a server moving to web sprint 2 takes `dist/viewer/` first and the re-extracted `maps/` after it.

## Layout

Everything below is relative to `socomlegacy/`.

| Path | What |
|---|---|
| `packages/archive` | ZDB table of contents, ZAR/ZED v2, compiled `.rdr`, and the `AssetSource` the rest read through (`/node` for the file system, `http` for the browser) |
| `packages/gs` | GS texture and palette decode, and the GS state block (`ALPHA`, `TEX1`, `TEST`, `CLAMP`) per texture |
| `packages/mesh` | the DMA-chain walk, the VIF1 unpack, and the vertex-lane interpretation that yields `MeshData` and `LineStrip`; `SEMANTICS.md` is the authority |
| `packages/sound` | the sound (`docs/research/81-sounds.md`): 989snd banks out of `BNKSTORE.ZAR`, SPU ADPCM, the grain sequencer and voices rendered at the game's volume and pan, `sounds.rdr`, the `SOILS` materials' step sounds, the weapons' and zAnim callbacks' sounds, and the rules for when a step, a landing or a round sounds |
| `packages/scene` | world root, scene graph and node matrices, the engine's walk order, clutter, collision, the measured spawn table, the SEAL's tuning off `READERC.ZAR` (`tuning.ts`), the weapon table off `ZWEAPON.ZAR` (`weapons.ts`), the engine's segment test (`segment.ts`), the zAnim effect commands, the thrown casing's flight, the particle sources and the effect models (`effects.ts`, `effectMotion.ts`, `effectParticles.ts`, `effectModels.ts`) |
| `packages/viewer` | the Vite app: renderer, shading graph, fly camera, map picker, overlays, diagnostics panel, the Playwright e2e |
| `packages/central`, `packages/match`, `packages/host` | the multiplayer server, split by the server split (`docs/plans/2026-10-17-server-split.md`, landed by PR #296): `match` the rooms and the game (one process a game after SA-7), running the viewer's shared sim (`packages/viewer/src/sim.ts`), classic and, since OT.R71, respawn (`RESPAWN_RULES_ENABLED` on); `central` the services, the lobby, the store and the process's entry (`src/main.ts`); `host` a community host's supervisor (Node, `ws`; `src/main.ts`, `src/supervisor.ts`): its node key, its door and the games it runs |
| `tools/` | the extractor, the dump/export tools, the comparison instruments, the release sweep, the bot load test, `build-corpus.ts` |
| `docs/research/`, `docs/corpus/` | the research notes (from 71) and the AI-readable corpus built from them (`llms.txt`, `records.jsonl`, `sections.jsonl`) |
| `deploy/` | the multiplayer server's Docker image, Compose with Caddy, systemd unit and `deploy.sh` |
| `docs/specs/`, `docs/plans/` | the viewer's own design specs and plan, kept here rather than in the repository's `docs/superpowers/` so the recomp's agents do not have to read past them |
| `public/maps/`, `test-fixtures/` (ignored) | your extracted game data; never committed |

## Controls

The camera flies like a creative-mode build camera: momentum, not teleporting. The page lists only the controls of the
mode you are in, in the **Controls** popover in the top bar (hover it, focus it, or click or tap it; **Esc** closes it).
It has two tabs, **Controller** and **Mouse & Keyboard** (owner, 2026-09-29), each the action and its button or key and
nothing else -- no sources, readings or debug keys, which live in this README's tables below. The tab chosen is remembered
(`s2u.viewer.controlsTab`); with nothing chosen it opens on Controller when a pad is connected, else on Mouse & Keyboard
(`viewer/src/controlsList.ts`, `padControlGroups`, `controlGroups`, `chooseTab`). The Mouse & Keyboard tab describes a local
build: a release build has no keyboard input (OT.R29) and no mouse look (OT.R38, "Controller only": no pointer lock, no
locked click, no mouse drag, no Mouse look section), so there its keys and its mouse do nothing; a finger's drag on a touch
screen still looks, at most at the full stick's rate (a browser adaptation, OT.R38). In a match the room holds every
look to the stick's law whatever the input (research 223 §8).

**Playing as a SEAL is reCOM mode**, the settings' **Mode** switch (**Explore** / **Play**, owner 2026-09-29). In
reCOM mode the page also has walk mode, the SEAL's body, the rifle, the HUD, the Sound and Mouse look sections and the
touch stance and fire buttons. In the map viewer none of that is rendered, bound or answered: no `G`, no Start, no Fly /
Walk switch, no walk in the Controls popover, and the debug hook's `setMode('walk')` returns false. The switch works at
run time, both ways, without a reload (the disc you opened stays open), and is remembered in this browser
(`s2u.viewer.recom`); the address's `mode=play` / `mode=explore` beats that for the visit, and Explore is the default.
The switch is on every page load: no flag gates it (owner, 2026-09-29: "&redotcom can die now. The mode replaces it"),
and an old link's `redotcom` has no effect and is taken out of the address (see **Shareable links** below; `viewer/src/features.ts` `PlayUi`,
`viewer/src/shareUrl.ts`). reCOM mode **opens on foot** (owner, 2026-09-29): the map starts walking once its body and clips are ready.

**The fly camera is Explore's** (owner, 2026-09-29: "Block the fly automatically and disable it while in play mode";
`viewer/src/flyAccess.ts`). In Play a player cannot reach it: there is no Fly / Walk switch, `G` and the pad's Start do
not toggle, the Controls lists name no toggle, the debug hook's `setMode('fly')` returns false, and a `fly` in the
address is ignored and taken out of it. The developer's `?devmode` keeps all of that: `&fly&devmode` opens Play on the
free camera (the e2e specs and the measuring tools do, and enter the walk themselves), and `G`, Start and the switch
toggle walk and fly as before.

The settings panel starts folded on every device, so a first visit is the map and a small bar. **Settings** (the cog),
**Controls** and **GitHub** sit together at the right of the bar in that order (owner, 2026-09-29), one size; the cog
folds the panel away and back, and the choice is remembered. A failed load unfolds the panel so the error is seen.

The panel (polished 2026-09-29 at the owner's ask, for usability and readability) is one column of sections in the
order a player reaches for them -- **Mode** first, since it decides which sections follow, then **Map**, **Picture**,
**Mouse look** and **Sound** (Play's own), **Online**, and the developer's **Advanced** -- each a heading and at most a
line of plain help. A choice of a few options is always a segmented switch, an on / off always a switch, an amount always
a slider with its value beside it; each switch's tooltip says which option is the default. On a touch screen every
control is at least 44 px tall. The **Controls** popover's two lists are grouped (Move, Combat, Stance & action,
Weapons, Weapon select, General; the fly lists are Move and General). In a build with multiplayer off (`VITE_S2U_MULTIPLAYER=off`, the
site's; **Multiplayer off** under **Deploying**) there is no **Online** section, and both lists' General group ends with
"Multiplayer · off in this build".

The panel's first line is **PLAYERS ONLINE** (owner, 2026-09-29; `packages/viewer/src/playersOnline.ts`): the players --
not the watchers, the Explore pages that only look on -- in the matches of the Shared service -- a deployed page's own
origin's `/rooms`, a local page's local stack's (TRS-1, TRS-2; `sharedRooms`) -- or on the local server (`http://localhost:8787/rooms`) when Online is Local. It
shows a dash while the count is not known (the server not answering), never 0. The **Map** picker says the same count
after a map's name when anyone is on it (`FROSTFIRE · Suppression (MP2) · 3 playing`; nothing for none), in the option's
own text, so a screen reader hears it with the map. The page asks about every 20 s while it is visible, not at all while
it is hidden (once at once when shown again, if one fell due), never two requests at a time, backing off to 2 minutes
while the server does not answer, and stops when the page goes. The request is a plain cross-origin GET with
`cache: 'no-cache'`: the browser revalidates with the server's ETag, so an unchanged list is a 304. A build with
`VITE_S2U_ROOMS=off` reads no shared list (the e2e run's, `playwright.config.ts`, while the shared server is not live);
a URL there replaces the shared one. A build with multiplayer off (`VITE_S2U_MULTIPLAYER=off`, the site's) has no count
and no poll at all: the kicker is the plain title `Socom 2 Legacy`.

The settings, in the panel's order:

| setting | choices (default first) | in the address | remembered as |
|---|---|---|---|
| **Mode** | Explore (free camera) · Play (as a SEAL) | `mode=explore` · `mode=play` | `s2u.viewer.recom` |
| **Map** | the picker; or open your own disc (.iso) | `map=MP2` | `s2u.viewer.lastMap` |
| **Picture** | Modern (fits your screen) · PS2 (640x448 on 4:3) | `view=modern` · `view=ps2` | `s2u.viewer.look` |
| **Mouse look** (Play; a local build only, OT.R38) | sensitivity 0.05-4x (1x); invert up / down (off); equal up / down (off) | -- | `s2u.viewer.mouseLook` |
| **Sound** (Play) | volume 0-100% (100%); mute (off) | -- | `s2u.viewer.volume`, `s2u.viewer.muted` |
| **Online** | Off · Shared (a deployed page's own origin's `/ws`; on a local page the local stack's, `ws://127.0.0.1:5340/ws`, `npm run dev:stack`; TRS-1, TRS-2, `packages/viewer/src/online.ts`) · Local (`ws://localhost:8787/ws`, `npm start -w @s2u/central`; offered only on a local page) | `online=off` · `shared` · `local` | `s2u.viewer.online` |
| **Your name** (Online) | up to 30 characters; blank is the game's `Player####` guest name | -- | `s2u.mp.name` |
| **Advanced** | the developer's diagnostic switches, lighting and fog | -- | not remembered |

The Sound, Mouse look and name choices are kept in this browser only (`localStorage`) and start from the defaults on a
first visit. The fold of the panel itself is remembered (`s2u.viewer.panelOpen`), and so is the Controls tab
(`s2u.viewer.controlsTab`).

**Shareable links** (owner, 2026-09-29; `viewer/src/shareUrl.ts`; at `/testroom` since OT.R19). The page's state lives in its address and follows every
change (`history.replaceState`: no reload, no history entries), so copying the address bar gives a friend the same setup:
`mode=play` or `mode=explore`, `map=MP2`, `view=modern` or `view=ps2`, `online=off`, `shared` or `local`. On load the
address beats what the browser remembers; a setting the address leaves out takes the remembered choice, which is then
written in. A value the page does not know is ignored. `devmode`, `mp`, `server=`, `lag=` and `loss=` work as before
and pass through untouched (never added), and so do `fly` and `kit=` with `devmode` (without it they are ignored and
taken out); `server=` (or `mp`) beats `online=` and implies it. `rules=classic` or `rules=respawn` (OT.R71) picks the
match's rules ahead of the test room's remembered Rules choice, and passes through untouched. The retired `redotcom`
parameter has no effect and is taken out.
A link with `online=shared` drops the friend into the same map's match -- as a player with `mode=play`, watching with
`mode=explore`.

**Online** joins the map's match on that server: in reCOM mode as a player, in the map viewer as a spectator who watches
(Space follows the next player, V the free camera) and never takes a player's place. The line under it says what the
connection is doing -- connecting, online and the number of players, or "server unreachable" and when it retries (2, 4,
8 ... 60 s to a server never reached; at once, then 2, 4, 8 ... 10 s after a drop) -- and a toast says when it comes up or goes
away. With Local and nothing on 8787 the line says "no local match server · start it with npm start -w @s2u/central" and
the page tries again every 3 s, so it joins a few seconds after the server starts. A classic room with one side seated
posts "There must be players on both teams to launch" (the original's lobby line) rather than the round's banner.
`&mp` and `&server=` in the address still override it (`viewer/src/online.ts`). The server logs every refusal and every
connection closed before its welcome, with the reason (`msg: 'refused'`, `msg: 'closed before welcome'`).

**Local is offered only on a local page** (owner, 2026-09-29): a page served from `localhost`, `127.0.0.1`, `[::1]` or a
`.localhost` name shows Off · Shared · Local; anywhere else -- a deployed build -- the Local option is not rendered at
all, the switch shows Off · Shared, and an `online=local` link or a remembered Local falls back to Off (written back
into the address as `online=off`).

### Flying (Explore; in Play only with `?devmode`)

| input | what it does |
|---|---|
| click the canvas | captures the mouse (a local build only, OT.R38); look is then free. **Esc** gives it back |
| drag | looks, for touch screens and anywhere pointer lock is refused |
| `W`/`S` | fly along the look direction — nose down and `W` descends |
| `A`/`D` | strafe, always level with the horizon whatever the pitch |
| `Space` / `Shift` | up and down in world space |
| double-tap `W`, held | boost, with the field of view widening to match. **Flying only**: there is no sprint in walk mode from any input (double-tap `W`, the pad's R3, the touch stick's rim-hold). Nothing is bound to `Ctrl`: `Ctrl+W` closes the tab and no page can prevent it |
| wheel | trims the fly speed between 0.1x and 16x; the Controls popover shows the trim |
| `Q`/`E` | down and up, kept from the earlier bindings |
| arrow keys | look, at a steady rate, for a keyboard with no mouse to hand |
| `F` | fullscreen, and back (also the button under the frame counter) |
| `` ` `` | hides and shows the panel and the frame counter, for a clean look at the map; the site bar stays |

### Walking (reCOM mode)

| input | what it does |
|---|---|
| `G` (`?devmode` only) | walk and fly. Walk stands the SEAL on the game's own collision hull, sliding along walls at a body radius of 3.5 (prone 8.0 ahead along the crawl), met at the feet + 6.5 (prone + 3.0) and at the head + 2 -- no column between, so a bar from 7 to 10 is walked under (research 217 §2), seen through the game's own third-person camera; the panel's **Fly / Walk** switch (the Modern / PS2 switch's own markup) mirrors it, and entering walk drops you onto the floor under the camera, or onto spawn A |
| `W`/`S`, `A`/`D` | run and back up, strafe, at the game's speeds; a touch stick pushed part way is a part stick, as a pad's is |
| mouse (captured; a local build only, OT.R38) | turns the SEAL (yaw) and tilts the camera (pitch, between the game's aim limits) |
| `Space` | jump |
| `C` | the stance: a tap toggles stand and crouch (from prone, a tap crouches); held 0.4 s, prone (`STANCE_HOLD_S_PLACEHOLDER`, the pad's Triangle's too); `Ctrl+C` stays the browser's. On a touch screen, the **C** button beside the lift buttons is `C`: tap and hold alike, its release the tap, a cancelled touch nothing (the walk's touch layout hides it and puts Triangle, the pad's rule, in its place, so today it shows only in the fly camera, where it does nothing) |
| right button | steps the zoom: third person → first person (the game's view state 1, 1.01x) → the scope's levels, or the **binoculars** (state 4, 9x) for a weapon without a scope → third person; first person, the binoculars and the scope are drawn from the SEAL's eyes, the body hidden (the owner, 2026-10-01: first person back, superseding the 2026-09-29 "no first person", and the binoculars back as the original draws them). A weapon of fewer than two `ZoomMode`s (the Mark 23 and every pistol, the M16A2, the AK-47, the MGs, the shotguns, the MGL, the M79) and an item in the hand go from first person into the binoculars -- the full-screen two-lens `ret_binocs` mask, no reticle, "ZOOM: 9.0x", the look slowed to 1/1.5 × 0.2 and the walk to 0.2 -- and while they are up nothing fires, throws or reloads (`FUN_005be9a0`, `FUN_005c2a90`); the others see the body raise them. A raised launcher and a launcher round stay at first person. On a night map first person steps into the night vision, which a weapon without a scope does not leave inward (the game's rule). On a wide screen the scope's and the binoculars' black fills the frame beside them |
| left click (captured) | fires the rifle; held, it fires at the rifle's rate. The click that captures the mouse does not fire. On a touch screen, **SHOOT** |
| `R` | reloads (the pad's R3); an empty magazine waits for it |
| walking into a ladder | climbs it, as the game does with no button: the stick climbs and descends at the game's 13.5 a second, the head and the foot step off ([research 86](docs/research/86-traversal.md)) |
| `X` | the action, the pad's Cross: opens or shuts the door under the reticle (the door icon shows it; [research 92](docs/research/92-doors.md)), climbs the crate, container or fence the climb icon offers (in the air too: jump, then `X`), and slides down a ladder |
| `Q` / `E` held | peeks left / right, standing still, as the game's d-pad does |
| `1` / `2` | the main weapon (the rifle) / the sidearm (the Mark 23), as L1 / L2: the game's swap clip plays |
| `3` / `4` / `5` | the kit's three equipment slots, in the kit's order (`mp_seal1`: the M67, the HE, 2X); `5` is web sprint 4's ruling (W4.R5) for the owner to confirm. A slot the game never takes up (2X, the thermal scope, C4, a launcher's round) does nothing; R2 on the pad steps through the kit's items |
| `X` at a C4 target | plants C4 (the Action button, as the game does: research 94 §C5.1), after any door in reach: the target is a destructible under the reticle that takes the charge (Vigilance's access barriers; never Crossroads' bases), within 32 units, held under the reticle 0.2 s (moving or not; never on an `INVISIBLE_DI` surface) -- the HUD shows the C4 prompt, and the charge is down 1.098 s into the plant (research 210 §9) |
| `X` at a weapon on the ground (a classic round) | takes it, as the game's Action does (PF-34, [research 234](docs/research/234-the-inventory-as-built.md)): a classic death leaves the body's weapons and one bundle of its exact remaining magazines where it fell; a weapon of the same slot (a rifle for your rifle, a pistol for your pistol) within 20 units, in front, while you could fire and move under 32 units a second, replaces yours, which drops at your feet with its magazines -- it arrives empty, and the magazines are picked up by walking over them (within 20 units, whole magazines into empty slots of a weapon you carry); the prompt rests 3 s after a pickup; your saved pick is not changed. The room decides every pickup now; the page's prompt and the weapons on the ground arrive with sprint 30's wiring |
| `X` at a hostage (EXTRACTION maps) | **FOLLOW!** on an unled hostage, **HOLD POSITION** on one you lead (the `action_escortee.tif` prompt; HX-4a, [research 239](docs/research/239-orders-the-rescue-the-score-and-the-hud-as-built.md)): the hostage under the reticle, alive, nothing that blocks the aim between -- the jail's bars always do for now, the door open or shut (the room's map holds both bar sets on the same faces and nothing swaps them when the door opens: `BARS_SWAP_PLACEHOLDER`, until the door's helper calls run), so a hostage in the cell is ordered from inside it or through the doorway -- under 20 AI cells (Manhattan, 10 units each) away -- either side may lead; the room runs the same test. After the action's other contexts but before the bomb's drop. The order, prompt and hostage's YES are wired into the test room and menu match; map release validation remains H133 |
| `I` (dead, in a match) | **WEAPON EXCHANGE**, the dead player's weapon select (below): opens it, and closes its slot list (`WEAPON_SELECT_KEY_READING`, the game's `Inventory`: a reading for the owner, O-S4-3) |
| `I` / R2 / **INV** in a match | never **the ARMORY** (the owner's ruling, 2026-10-02: in game the swap is the in-game one, the ARMORY the lobby's): alive -- in a round, between rounds, waiting for one -- R2 opens the game's item menu (`CWeaponSel`, the owner 2026-10-04: the original is the controls' source; research 94 §4.6, `viewer/src/inventoryMenu.ts`): on the item in the hand, d-pad Up / Down step the kit's slots, Cross or a new R2 takes the item up, L1 / L2 put it on that shoulder, Triangle closes it unchosen (with no stance change: while the menu is open Triangle, Square and Cross do nothing else, as in the original), 5 s without a step closes it; a refused take (in the air, say) leaves it open; it draws as the original's -- a column above the weapon box with three item icons, two arrows, the item's name, rounds and magazines and its QUICK 1 / QUICK 2 tag (research 212); a new map's first body starts with L1 / L2 on the main weapon / sidearm, and a respawn or a round's restart keeps them, as the original's; L1 / L2 take the item on them (the main weapon / sidearm until set; `1` / `2` on the keyboard always those two; in a development build `I` opens the menu too, the arrows, Enter, Backspace and Page Up / Down inside); dead, WEAPON EXCHANGE. The ARMORY opens only when you take a seat (below), the only place to change your character type until the lobby |
| `Tab` (held) | the round's scoreboard, as SELECT held on the console ([`docs/research/87-hud.md`](docs/research/87-hud.md) §12); the pad's Select too. In the Modern picture the board stands a little higher and is shrunk, uniformly and no more than it must (never below 0.75), to keep 4 frame pixels clear of the bottom HUD (owner, 2026-09-29; `viewer/src/hud.ts` `modernScoreboardFit`); the PS2 picture keeps the game's place |
| `M` | the tactical map, and back (SELECT on the console; SOCOM II's single-player map over the map's `AIMAPS.MPS`, heading-up, drawn over the world with the HUD hidden: [`docs/research/87-hud.md`](docs/research/87-hud.md) §9); `-` / `=` held zoom it out and in |

### WEAPON EXCHANGE: the weapon select (web sprint 4, M8/M9)

SOCOM II's dead player's menu ([research 94](docs/research/94-the-arsenal.md) part 2; `packages/viewer/src/weaponExchange.ts`,
`weaponSelect.ts`, `weaponSelectState.ts`): in a match -- the offline match or a server's, never `&nomatch`'s free walk --
dead (or a ghost), the camera on yourself and not a spectator, the prompt "You have died.  [I] Select new weapons." (the
pad's R2 glyph, the touch button's `[INV]`; the game's d-pad right and left glyphs in its "directional buttons" line,
all from the disc's `font_special_01.tif`) is drawn over the HUD and the menu opens. Five rows (primary, sidearm, equipment
1-3; a locked slot dimmed and skipped), a picker per slot with the side's own items only, silent, as the game's. Each
confirm sends the side's picks to the room (the `loadout` request, protocol 9), which replays them through the game's
rules and answers with the kit you will spawn with at the next round -- what the menu then shows. While it is open the
game's keys and buttons do nothing (the HUD's mode 1). The PC key, the touch control and the keys inside are the
viewer's choice, readings for the owner (O-S4-3): `WEAPON_SELECT_KEY_READING`, `WEAPON_SELECT_TOUCH_READING`,
`WEAPON_SELECT_MENU_KEYS_READING`.

| input | inside the menu |
|---|---|
| `W` / `S`, Up / Down arrows (pad: d-pad Up / Down) | the previous / next slot; in the picker, the previous / next item |
| `A` / `D`, Left / Right arrows (pad: d-pad Left / Right) | the picker's previous / next category |
| `X` or `Enter` (pad: Cross) | opens the picker on the slot; in the picker, confirms the item |
| `Backspace` (pad: Triangle or Start) | back: the picker to the list, the list closed |
| `I` (pad: R2) | closes the slot list |
| **INV** (touch, shown with the prompt) | opens and closes it; a tap on a row opens its picker, on the middle card confirms, on the others or the arrows steps |

### The ARMORY: the pre-round loadout (web sprint 5, S3)

SOCOM II's lobby ARMORY ([research 95](docs/research/95-the-armory.md); `packages/viewer/src/armory.ts`,
`armoryState.ts`, `armoryLayout.ts`, `armoryView.ts`, `uiScript.ts`), rebuilt from the disc: the dialog
`RUN/UI/READERC.ZAR/dlg_equipment_mp.rdr` drawn object by object on the game's 640x448 frame (scaled like the HUD, in the
Modern and PS2 views), moved, shown and captioned by the game's own `RUN/UIZANIM.ZAR` scripts -- the 4-3-2-1 slide of
the four columns, the chosen column's slide and its panes rising into the loadout window, the arrows' pulse, the
padlocks (the shipped SEAL 3 / SEAL 4 swap kept) -- with the portraits, the strings (`UIMnLOC`) and the two fonts of
the disc. The viewer has no Game Lobby, so the ARMORY stands in for it (W5.R1): it **opens by itself when you take a
seat** -- joining a match, as a ghost joining a classic round in play, in the waiting room, or promoted from the
spectators' line; never when a dropped connection, a reload or a second window of the same tab takes a seat back, in
any room (if the screen is still open as the page rejoins, it stays open and the seat stays held) -- and the room
holds your first spawn until you leave it (DONE, Back on the character select, or the round's start); offline it opens
once a map, before the page's own room is made. **Nothing in a match opens it again** (the owner's ruling,
2026-10-02): the ARMORY is the game's lobby screen -- the front end's GAME LOBBY opens it (ONL-16a, ONL-17; the test
room has no lobby) -- and in game the `I` key, R2
and the **INV** button are the swap's and WEAPON EXCHANGE's -- so taking a seat is, for now, the only place to change
your **character type** (WEAPON EXCHANGE changes the kit, never the type). A seat taken in the round-end interval sees
the game's popup 5 s before the next round ("taken back to the game lobby in 5 seconds"), and the round's start
closes it. Every choice counts **as you make it**, as the game's own do: the character type you
commit and each item you step to go to the room at once (protocol 9) for your next spawn, so leaving is only leaving
(a choice made in the last instant before a round starts can miss it: `ARMORY_ROUND_START_RACE_READING` in research 95).
While it is open the game's keys, the pad's sticks and buttons and the touch layer do nothing: you do not walk, look,
peek, crouch, reload, open the map or the scoreboard behind it -- on a touch screen the sticks and buttons are hidden
until you leave it, so every tap is the screen's. If the match is **abandoned** while it is open (the other side left),
it stays open: the room waits for both sides again, your choices still count, and you take your spawn when you leave
it (`ARMORY_ABANDON_READING`).

- **Character select**: Left / Right the column (SEAL 1-4 or TERRORIST 1-4, each its own body and kit), Cross takes it.
- **The rows** (primary, secondary, equipment 1-3, DONE): Up / Down the row, Left / Right the item (the side's own,
  by the map's valves and the game's slot rules), applied at once; Square **stores the loadout** in this browser, per
  map and side, and the next visit opens on it ("CUSTOM"); Circle restores the type's **default kit**; Triangle asks
  to go back to the character select (the kit kept).
- The pad's buttons are the game's; the keys and the taps are the viewer's choice, readings for the owner
  (`ARMORY_MENU_KEYS_READING`, `ARMORY_TOUCH_READING`). On a keyboard the lines name
  the keys in place of the pad's glyphs; on a pad and a touch screen they keep the game's glyphs (tap either half of
  the line for the press its glyph names).

| input | inside the ARMORY |
|---|---|
| `W` / `S`, Up / Down arrows (pad: d-pad Up / Down) | the previous / next row |
| `A` / `D`, Left / Right arrows (pad: d-pad Left / Right) | the previous / next column; on a row, the previous / next item |
| `Enter`, `X` or `Space` (pad: Cross) | takes the column; on DONE, leaves (the loadout is already yours) |
| `V` (pad: Square) | stores the loadout for this map and side |
| `R` (pad: Circle) | the type's default kit |
| `Backspace` (pad: Triangle) | back: from the rows to the character select (asks first), from there out |
| a tap or a click | a column (twice to take it), an arrow, a row's pane, the line's two glyphs (Square and Circle on a row, Cross and Circle on DONE), "BACK", a popup's button |

**The weapon view** (S3 part 2; `armoryText.ts`, `armoryView.ts`): on a row the item's own **3D model** spins in the
weapon window -- the disc's `RUN/UI/UI_GEO.ZED`/`UI_MDL.ZED` model named by the dialog's `MODELS` entry, at that
entry's `AZIMUTH`/`ELEV`/`DISTANCE`, turned 178.97 degrees about its vertical axis every 3 s as the script turns it,
textured from `UI_TXR` (`MODEL_CAMERA_READING`, `UI_MODEL_LIT_READING`). For a gun the four **stat bars** (VOLUME,
ACCURACY, RANGE, FIRE RATE) fill from their left edge to the script's value for that weapon, with its **FIRE MODES**
and its name; for equipment the bars go and the **WEAPON DATA** description is typed out as the game types it (1197
px a second at the dialog's scale, whole words wrapped at 230 px, the newest five lines kept, a pulsing cursor, a
`.TYPE` tick). The **WEAPON TIPS** box wraps the item's tip. The arrows pulse (`arrow_lft`, `arrow_top`; their
partners keep their own opacity, `CHILD_OPACITY_INHERIT_READING`). The sounds are the UI bank's (`HUDUI.bnk`):
`.DINK` on the moves and choices, `.SLIDE` on each item step, `.NEG` on a refused pick, none on Circle. The ARMORY
draws no countdown of its own (the source's is the pull-out's popup) and its mode line (`OnlyModes`: "Pistols Only" ...)
stays blank, as the viewer's matches are unrestricted. Its windows lie beneath the text and bars they frame, as the
game builds the dialog (`UI_DRAW_ORDER_READING`).

### The controller

The Gamepad API's standard mapping, read as the PS2 pad by position. The left stick moves and the right looks, flying and
walking alike. The layout is the owner's word of 2026-09-28 where it says so; a row marked *assumed* in the page is one
neither the owner nor the repository documents (`viewer/src/gamepad.ts`, `PAD_LAYOUT`).

| button | walking (reCOM mode) | flying |
|---|---|---|
| left stick / right stick | move / look | fly along the look / look |
| Square | jump | up |
| Cross | action: the door under the reticle ([research 92](docs/research/92-doors.md)), the climb the icon offers, the ladder's slide ([research 86](docs/research/86-traversal.md)) | — |
| d-pad Left / Right (held) | peek left / right, standing still | — |
| R1 | fire (held fires at the rifle's rate; let go stops) | — |
| Triangle | stance: a tap toggles crouch, a hold goes prone, a tap from prone stands up | down |
| L1 | the rifle (the game's SwapWeapon1); no held aim | — |
| d-pad Up / Down | zoom in / out, a step a press: third person, first person, the binoculars or the scope (research 84) | — |
| Start | in a match, the game's START menu (MATCH-01: `viewer/src/startMenu.ts`, research 266 §8); outside one, with `?devmode` only, fly (as `G`) | walk (as `G`, `?devmode` only) |
| L3 | fire mode (research 84 section 6) | — |
| R3 | reload, as `R` (the owner's ruling, 2026-09-29, and the game's own: `controller.rdr`'s Default binds R3 to Reload) | — |
| Circle | in a match, the game's TeamCommand: TACTICAL ORDERS, TAUNTS, RADIO, TEAMMATES, MESSAGES and, while a spectator is present, SPECTATORS (`viewer/src/tauntMenu.ts`, `matchTaunts.ts`; research 301, research 264 §4.5) | boost (on R3 until R3 became the reload) |

Triangle's hold length is a guess, `STANCE_HOLD_S_PLACEHOLDER` (0.4 s, `viewer/src/stanceButton.ts`, `C`'s too): the game
reads the button's pressure, which a browser pad does not give. Triangle keeps the game's own rule, where a tap from prone
stands up; `C` and the touch **C** button take the owner's PC rule (2026-09-29), where a tap from prone crouches.

**Walking is the game's player** (web sprint 2): the camera behind and over the SEAL's shoulder, the game's speeds
and fall, a stand-in body, the game's reticle and rifle. The numbers and where each came from are under
[What the picture is made of](#what-the-picture-is-made-of), "The player". In short: 65 units a second running, 37
backing up, 14 crouched, 11 prone; a step up to 6.5 units is climbed, a drop of more than 8 is a fall. `Space` jumps
as the game does ([research 80](docs/research/80-the-jump.md)): under 15 units a second the standing jump, a clip on the
floor (`seal_jump`, 0.99 s, the body's root and the camera rising 3.6); from 15 the running jump, 79.9 up 0.1 s after
the take-off under the 235 fall, stepped at the game's 30 Hz frame -- 11.5 units (1.1 m) high, 0.73 s in the air, the take-off's speed carried; prone cannot. The
clips are the game's pick and blend: the stick's speed picks each set's clip by its transition band, the forward and
strafe sets share the stick's angle, every clip plays at the rate its root needs. While walking, the game's own HUD is drawn
over the picture (`viewer/src/hud.ts`, [`docs/research/87-hud.md`](docs/research/87-hud.md)): the ammo box, the
compass turned by the heading, the info box (health, a static round timer, the range), the stance word on a change and
the context prompt (the climb icon, a door's within its 30 units); the round start as the console plays it (a fade from
black, "STARTING ROUND 1 OF 11", then the objective); the compass's nav marks (the map's own nav points, C..Z); hidden in
flight.

**The walk sounds** with the game's own sounds, decoded from the map's banks (`docs/research/81-sounds.md`): a
footstep per foot of every run or walk cycle, in the sound of the surface underfoot (the collision polygon's material:
metal on Frostfire's rig, sand in Desert Glory), the stealth step at a light stick and the crawl prone; the jump's
whoosh and the landing (the surface's, or a bone's crack from a deadly height); the M4A1 SD's suppressed round and its
reload; the SPU2's own reverb at the mission's indoor and outdoor depths; the mission's ambience beds and its looping
emitters (a fan, a river, insects at a lamp). Where a map's banks lack a sound its floors or grenades ask for, the same
sound is lent from another map's bank (a placeholder, research 81 §7). The browser starts sound on the first click or
key press; `window.__viewer.audio()` reports what played, what was dropped and why.

**The rounds show** with the game's own effects (`docs/research/89-effects.md`). Each round plays the weapon's zAnim
muzzle animation out of the map's `CZANIM.ZAR`. For the M4A1 SD that is the brass casing thrown to the rifle's right,
tumbling, bouncing on the hull with its surface's sound and gone at rest or at 1.2 s. It shows no flash and no tracer,
and no smoke: its smoke source is switched off in the retail data. Where the round lands, the surface's own impact
plays out of the map's `MZANIM.ZAR`: sparks off metal, dust and chunks off stone, a puff off sand, a splash off water.
The surface's own mark comes from `decals.rdr`, the metal's, the stone's, the sand's or the wood's, and none where the
game has none. `window.__viewer.effects()` reports what played; `playEffect(name)` plays any of the map's effects.

In a local build only (OT.R38; a release and a demo have no mouse look), the mouse is captured with `unadjustedMovement` where the browser offers it, so the OS's pointer
acceleration stays out of the look. The mouse's look is always raw -- the same turn for the same movement -- and a
controller's always the game's stick curve (`viewer/src/look.ts`); there is no setting for it (owner hotfix,
2026-09-30), and a `mouse: 'stick'` remembered from before reads as raw. `?map=MP7` opens a map by its archive, the picker writes the URL,
and the last map picked is remembered for the next visit.

Starts ramp and stops glide rather than snapping. The velocity is integrated in closed form, so the camera
covers the same ground per second at 30 fps as at 240 — and `setCamera` from the debug hook clears the
momentum outright, which is what keeps the Playwright poses exact. `test/camera.test.ts` pins the motion
model — ramp, glide, frame-rate independence, which axis each key moves along — rather than the tuning
constants, which are meant to be tuned.

## On a touch screen

**Two floating sticks** (owner, 2026-09-29). A finger landing on the left half of the screen is the move stick: a circle
appears where the thumb lands, its knob follows the thumb clamped to the circle, and it goes on the lift. While walking a
finger landing on the right half is the look stick, the same way; flying, the right half keeps the canvas's one-finger
drag. Each half tracks its own finger, so both are held at once. The sticks are a pad: their knobs are the Gamepad API's
standard axes 0/1 and 2/3 (`sticksPad` in `viewer/src/touch.ts`), read by the pad's own `padInput` -- the same dead zone
(0.15), rescale and y flip, and from there the same path a pad's sticks take (the walk's stick law, the mover's analog
run, the look's turn rate). There is no second touch pipeline: `stickInput` is `padInput` of the two knobs, and
`test/dualStick.test.ts` pins that it is, and that the old single stick's shaping is unchanged pixel for pixel. The move
stick held at its rim for 400 ms is still the fly camera's boost.

**Walking on a phone** (reCOM mode) shows the buttons a player needs, tidied, for a phone held sideways: a large
**SHOOT** (R1) at the right edge and **JUMP** (Square) beside it, under the right thumb; the stance (Triangle: a tap
crouches, a hold goes prone) over JUMP and the action (Cross: doors, climb, ladders) over SHOOT; and a row under the
compass with **RELOAD** at the edge, **NEXT** (R2: opens the item menu; the zoom buttons step it, the action or NEXT again takes the item), and zoom out and in (d-pad
Down and Up). The fire mode, the weapon slots, the peek and the scoreboard are a pad's or a keyboard's. The buttons lie
above the stick zones: a press on a button never starts a stick, and a stick holds its finger, so dragging it across a
button presses nothing. Every button holds the lane the pad's button holds (`touchInput`, merged with the pad's in
`padFrame`, `viewer/src/touch.ts` `attachWalkTouch`), so the behaviour is the pad's; each owns its pointer, so SHOOT and
JUMP can be held at once. No two buttons overlap and the HUD keeps its corners (the ammo box, the compass, the range and
timer strip) at 812x375, 667x375 and 915x412 (`e2e/touch.spec.ts`). Held upright the page asks for a turn and lifts the
cluster off the HUD's tall bottom strip. Flying keeps the lift buttons, the **C** button (`C`'s rule: a tap stands or
crouches, from prone crouches; held 0.4 s, prone) and a round **fire** button.

**A controller on a phone.** A pad connected hides the whole touch layer (`body.pad-on`) and plays exactly as on a desktop
(the Gamepad API path is shared); disconnecting it brings the touch layer back. **The tip**: on a touch device a notice
recommends a controller and landscape, once a visit (the tab's session) and again on each turn to portrait, until its
close button dismisses it for good (`s2u.viewer.mobileTipDismissed`; `viewer/src/mobileTip.ts`).

The touch controls appear on a coarse pointer, or at the first touch event for a hybrid a media query gets wrong, and not
at all on a mouse. A touch drag turns twice as far per pixel as a mouse drag, because a thumb has a phone's width to work
with; a round fullscreen button sits above the lift buttons (at the left edge while walking), which on a phone also asks
for a landscape lock. The canvas is `100dvh`, so the picture's centre is the screen's whether or not the browser bar is
showing, and the pixel ratio starts at 1.5 on a coarse pointer and adapts (`main.ts`, `adapt`): frames over 24 ms step it
down to 0.75, frames under 12 ms step it back up.

Everything the viewer draws over the map goes in one strip along the top: the site bar (the back link, then Settings,
Controls and GitHub, one size, each its mark alone under 480px), with the panel or the Controls popover beneath it. The
panel starts folded everywhere, leaving only the bar (a remembered choice still wins), its body scrolls inside itself;
on a phone held sideways, open, it docks in the top middle band -- right of the fullscreen button, left of the pill row
under the compass, above the SHOOT / JUMP cluster -- so no touch button is under it (it lies over the stick zones, open
ground a thumb on the panel does not reach) (`e2e/phonePanel.spec.ts`, at 812x375, 667x375 and
915x412); upright it is the full width under the bar, as before. The
status line is two dim lines whose whole text is its tooltip. The lift buttons clear the browser's own bottom
bar with `env(safe-area-inset-bottom)`.

## Loading a map without freezing the page

Switching maps used to take one 690–1,703 ms frame, and the whole of it was the *first frame that drew
the new map*: `buildWorld` costs 14–20 ms, and then three uploads every texture and geometry and
compiles every program at once. So the build still happens in one go and what is spread out is the
showing — `buildWorld` returns its objects in two queues and `viewer/src/scheduler.ts` hands them to
the scene a few per frame. The world's own meshes go first and the previous map stays up until they
start landing; the props follow behind a map that is already drawn and flyable.

The budget that does the work is a **count**, not a clock: adding a mesh to a group costs about a
hundredth of a millisecond, and the 400 ms is spent in the render that follows, where a time budget
cannot see it. The collision hull — tens of thousands of segments on the larger maps, and off by
default — is likewise held as arrays and only made into an object the first time it is switched on.

Meanwhile the overlay says what is happening: bytes fetched (the archive is read a chunk at a time so
the bar has a real denominator), then the worker's own stages, then the scene build. The map picker is
the only control taken away while a load runs.

## What the picture is made of

Settled on 2026-09-26 (the polish spec linked at the top):

- **The world is drawn unlit, and a multiplayer frame is not brightened.** The EE emits the VU1 light command only
  for a node flagged `m_dynamic_motion` or `m_dynamic_light`; on most maps that is nobody, and the
  vertex colours the exporter baked go to the GS untouched (`viewer/src/lighting.ts`). The campaign's post-process
  multiplies every pixel, fog included, by `1 + FIX/128` twice (FIX 89-93 on the Seeding Chaos spawn), but a
  multiplayer round has it switched off -- the exposure block at `0x488e48` reads enable 0 and pass count 0 on a live
  Frostfire round -- and PCSX2's Vigilance and the recompiled Frostfire agree with the bare frame band for band
  (`docs/research/82-map-fidelity-audit.md`, D1). The viewer opens at FIX 0; the slider keeps the campaign's look.
  The rig is transcribed from `GlobalLighting` (a reading) and is applied to the flagged nodes only.
- **The GS state is read off each texture's bind packet** (`gs/src/gsState.ts`, `viewer/src/materialSpec.ts`):
  the blend equation (source alpha, additive on 212 glows, none on the cutouts), the alpha test and its
  reference (`GREATER 64`, exactly half), the filtering and mipmap request, and the wrap mode per axis.
  Nothing about a texture's alpha is guessed from its pixels any more, except whether it has any.
- **Fog is the GS's linear ramp with the altitude band**, as a fog node of its own (`viewer/src/fog.ts`):
  `F = clamp(w*scale + offset) * clamp((y - bottom)/(top - bottom))`, the second term read off the EE's
  own setup and parked at the engine's off values (`-10000`, `0.001`) on the sixteen maps without it.
  A packet whose GIFtag clears `FGE` — every sky, moon, star, water plane and self-lit surface on every
  map (`tools/dump-fge.ts`) — takes no fog, which is what puts the horizon back.
- **The camera is the map's**: a 49° vertical field (`m_vfov`, a half-angle of 24.5°), 46° on Rat's Nest, kept at any
  screen shape, so a wider screen sees wider (78° across on 16:9) -- the owner's ruling of 2026-09-29; the console's 70°
  crop and a 1.537:1 pillarbox stay on the record (research 88), not in the panel.
- **The PS2 picture** (the Modern / PS2 switch at the top of the panel): the 640×448 frame the console
  drew, projected with the map's own half-angles and stretched onto a 4:3 box the way the television
  did, smooth (the owner's ruling of 2026-09-29; not nearest-neighbour). The choice is remembered. Everything else the panel offers is under **Advanced**.
- **Backface culling is the visual's own flag.** Bit 3 of each visual's `vparams` word is the cull
  the EE emits (`FUN_003b5f20`, `flags & 8`; `VISUAL_FLAG_CULL` in `scene`). Across the maps it is
  clear on exactly the things drawn from both sides -- Frostfire's ladders, whose rungs used to vanish
  from behind, grates, fan blades, Bitter Jungle's foliage, Desert Glory's grass, rugs, the glow quads
  -- and set on the solid objects. It replaces the old rule that culled wherever the texture was solid.
- **One state per object.** A map's graph holds every state of a destructible (`healthy` beside
  `whats_left` and the debris `parts`), a lamp beside its `nolight` copy, and the crates' pulsing
  objective ribbon. The game switches them by play; drawn together they z-fight. The viewer draws the
  intact, lit ones and hides the rest (`LoadedMesh.alternate`, "alternate states" in `options` shows them).
- **Each placement draws its own baked light.** A model instanced in several places carries a chunk per instance
  context, differing only in its prelit vertex colours; `hookupVisuals` numbers the contexts in load order, the copies
  inside the prototypes first and the world's placements after them (`contextsBefore` in `scene`), and each placement
  draws its own (`instanceShades` in `loadMap.ts`). Frostfire's tank rails drew the prototype's bare material colour
  before, neon beside the prelit bridges (`docs/research/82-map-fidelity-audit.md`, D2).
- **The mip level is the GS's.** A mipmapped texture samples the level `TEX1` gives off the depth,
  `(log2(w) << L) + K` clamped to `0..MXL`, not the GPU's derivative LOD; with the corpus's K of -12 to -6.5 most never
  leave the base level (`gsMipLod`, `world.ts`'s `gsTexel`; research 82, D3).
- **The mip levels are the disc's, and the reflective surfaces get their pass.** A mipmapped texture uploads the records
  its `MIPTBP1` names (a detail texture's level 1 is transparent: the detail fades with distance). A draw whose visual
  names a textured `Material_Palette` entry -- the water, glass, ice -- gets VU1 `0x34`'s environment-map pass: a sphere
  map of the reflected eye ray in the entry's texture and colour, faded by its rim alpha (`world.ts`, `envVertex`).
  The PS2 picture renders with no antialiasing, as the GS did (research 82, D3b, D5, D6).
- **LOD by range.** `READERM.ZAR/lod.rdr` pairs models into bands with fade-in and fade-out ranges
  (`railings_high` out at 100-120 units where `railings_low` comes in, on the same rails), and the
  world root's `LOD_Object` holds the same numbers squared for `CVisual::DrawLOD` to compare the
  camera's range against. Each placement of a banded model is its own mesh and fades across its band as
  `DrawLOD` scales it: the ramp is linear in the range *squared* (the disc stores `1 / (far² − near²)`),
  so the two copies of a pair sum to one across the crossover and each is at half at 110.45 units, not
  110 (`lodOpacity` in `scene`; a copy at rest keeps its shared material and only a fading one takes a
  blended twin, `viewer/src/lodFade.ts`). The "scaled" range `GetScaledRangeSquared`, a stub in reCOM,
  is SOCOM II's range squared over the magnification on screen (`FUN_00290aa0`; `LOD_SCALE_READING`), so
  at 9x the bands act as if the camera were 3x closer; night vision and the binoculars push the fog's far
  end and the far clip out by 200 units, every scope by 300, restored on leaving (`FUN_001f1470`;
  `VIEW_RANGE_EXTRA_READING`). The world takes both as the frame's render view (`zoom.ts` `renderView`);
  the two frame loops pass it once their one-line wiring lands (research 232 §7), plain range until then.
  The last copy at a spot stays drawn at every range by the owner's word (H92), where the game culls it.
- **Facades face the camera because the disc says so.** `m_facade` (node flags bits 8-9) marks the
  lamp flares, the stars, the moon and the sun -- 41 nodes over 22 maps -- and applies to everything
  under a flagged node, as the engine's matrix stack does. It replaces the old guess that turned
  every graded single quad, which also turned the drop shadows.
- **Scrolling textures scroll.** The world root's `TextureScroll_Object` names the nodes whose uvs
  the engine steps each tick (Frostfire's `ocean_1..3` and `skyhorizon`, by 0.02-0.04); those chunks
  get a uv offset the viewer advances at the field rate (`SCROLL_TICKS_PER_SECOND`, an assumption
  until a capture settles it).
- **Drop shadows are a decal pass** ("prop shadows" in `options`, on by default): every draw whose
  texture is a `shadow*.tif`, blended source-over after the world with no depth written and a polygon
  offset off its ground, whatever the draw-order mode.
- **The engine's grid is built, and its draw order is a switch.** `grid_params` in every world root is
  reCOM's `tag_GRID_PARAMS` (atom count 8192, posts 16, the cell dimension, the cells across and down; no
  origin is stored, it is always 0): Frostfire is 160 units, 8 × 9. `scene/grid.ts` generates the cells as
  `CGrid::Create` does, files every placement, clutter instance and collision-owning node into each cell its
  bounds cover -- one atom per cell, the bound chopped to single precision as the EE chops it, which is what
  reproduces the console's census of 414 world atoms and 117 prop atoms on Frostfire -- and walks the rings
  outward from a cell in reCOM's diamond (`|dx| + |dz|`). `CPipe::RenderWorld` draws in that walk with depth
  written under every blend (`ZMSK = 0`, research 26 §2); the viewer can ("engine draw order" under
  Advanced, recomputed when the camera crosses a cell, shadows and decals after the last ring). It is off by
  default: the 22-map sweep is identical either way, but near-first with depth under every blend makes a lamp
  flare drawn before the pipe behind it cut a rectangle out of it, so that is not the whole of what the
  console did for the flares, and their pass is the open question. By default blended draws go to three's
  back-to-front sort with no depth written; each draw's place in the scene-graph walk (`LoadedMesh.order`)
  stays as the tie-break.
- **The detail texture pass is drawn.** `mp<N>_lib.rdr`'s `detail{name, uv, range, bmode}` per texture is
  the record the engine compiles into every visual (2,395 of 2,395 visuals with a bound texture carry one);
  the viewer draws a second mesh over the base's geometry with the detail texture at `uv` times the base's
  uvs (8 on Frostfire's oil-grime floor, 2 to 10 across the disc, not the 4.0 the mission dumps showed),
  blended as `bmode` says (`COLORBLEND` is `ALPHA 0x44`, `ADDITIVE` is `0x48`), depth less-or-equal (the
  records' own `GEQUAL`) with no depth write. As the engine does, the pass is on or off for a whole visual,
  with no fade: on while its centroid's range squared, over the zoom's magnification, is within the visual's
  own `detail_buff` range (500 u on Frostfire's oil grime, 450 u on Desert Glory's ground), and never on a visual
  whose `vparams` lacks bit 14 -- each visual's centroid rides the merged draws' vertices (web sprint 29 PF-30,
  `docs/research/232-the-view-as-built.md` §4; the per-fragment fade of W1.R7 is retired). "detail pass" under
  Advanced.
- **The spawns come from the disc.** `AIMAPS.MPS` -- not a ZAR -- is fully decoded (`scene/aimaps.ts`,
  `docs/research/75-aimaps-mps.md`): a head, per sub-map a header, the cells as row spans and eight counted
  tables, and a trailer with the spawn list of 24 slots a side, each a cell with a side bit and a facing.
  `PlayerStart` turned out to be one named cell, not a region. The slots are drawn under the **spawns** toggle
  as a cell outline and a facing arrow per side, each standing on the probe's floor under its centre (all 1,058
  do), beside the measured A and B; the camera opens at A's (x, z), 20 units over the probe's floor there (on
  the 20 maps whose A is the orbit camera's position that is 12.7-31.2 units lower than the recorded y + 20 it
  used to stand at), and which of the 24 a player gets is game logic (A was always side 0's first slot and B
  side 1's second in the recorded rounds).
- **The ground is the engine's.** `scene/probe.ts` is the game's ground probe (`FUN_002d3030`'s per-model
  gate, the vertical line, first hit per model in surface order, the pick chosen as research 24 §2 says),
  over the grid's collision atoms: 3,318 world-space polygons on Frostfire, the engine's own count once the
  `di` the exporter copies onto nested instance nodes -- which the engine never keeps -- is dropped. The four
  actor-measured spawns land within [−3, +1] of it; the forty online-sweep rows in `spawns.ts` turned out to
  be the orbit camera, 25 units above the floor and 23 behind the actor. The walk (`viewer/src/walk.ts`) is a
  60 Hz fixed-step mover on that floor.
- **The shading is the GS's modulate, in the GS's order** (`world.ts`): `(texel * vertex) >> 7`, the
  product clamped by `COLCLAMP` *before* the fog is mixed in, then the post-process's `1 + FIX/128` as a
  uniform on every material rather than a factor baked into the vertex — so an overbright vertex under
  fog comes out as the hardware had it, and moving the brighten slider rewrites nothing. The
  `(Cd - 0) * As + Cd` light maps are drawn with their own equation: the shader emits `As` and the blend
  is `Cs * Cd + Cd`, the fix the game's own GL backend made (research 31 §12).
- **The line strips are drawn** (`options`, on by default): one pixel wide, textured along the strip
  with the uvs the packet carries (they run well past 0..1, so the texture repeats along a rope),
  gouraud, fogged and blended — `PRIM = IIP|TME|FGE|ABE` on all 194 packets — as one `LineSegments`
  per (texture, fog) with the same shading graph the meshes use. Desert Glory's power lines and lamp
  brackets, Crossroads' tent ropes and light filaments.

### The player

Settled in web sprint 2 (the sprint 2 spec's §7, cited by finding):

**The speeds are the game's file, the ramp and the fall its code** ("The game's movement law: the ramp is on the
stick, the speed is linear in it, the fall is 2.4 g"). `READERC.ZAR/motion.rdr` gives each SEAL clip a
`max_velocity` in metres a second (`scene/src/tuning.ts`, pinned against the disc's file): at `MetersPerUnit` 0.1
that is 65 units a second forward at a full stick, 37 back, 65 strafing; the crouch bands 14.8, 13.5 and 15, which
the crouch plays at 0.946 of them whatever the push (14.0 ahead, 12.8 back, 14.2 aside); prone 11 crawling and 5.5
sideways, along one axis, from the first tick. The ramp is on the stick, not the speed (`FUN_00586c10`): each axis
moves toward the pad at 2 to 5 stick units a second, so a full push is at 90 % on tick 11 and full on tick 12, a
fifth of a second; the speed is linear in the stick (`FUN_0058bdf0`), a released stick stops at once, and a full
push in crouch (0.838 or more, with 19 units of headroom) stands the SEAL up and runs (`FUN_00584c60`). A stance
change is gated as `FUN_00552ec0` gates it, on the page and in the room alike: prone is refused with an obstacle 11.2
ahead or 8 behind, crouch with one within the firepoint's reach (10.8 standing, 15.1 prone) ahead or 7 behind, and
standing needs headroom to 19 over the feet (12 from prone to crouch), the ray from the hips + 2; the running dive
asks none of them (research 217 section 1). A drop of
more than 8 is a fall under `dynamics.rdr`'s gravity 235 units a second squared, 2.4 g (`FUN_0059b440`), the
horizontal speed held from the edge: a 42-unit drop lands in 0.60 s (`viewer/src/walk.ts`).

**The camera is `FUN_0029a950` and `FUN_0029bf70`, nothing fitted** ("The game's camera: the pitch pulls the eye
in, there is no tether, and the console's eye falls out to 0.001"; `viewer/src/playerCamera.ts`). The target is
the skeleton root's height plus a ramp that saturates at 10 above a root of 5.6; the eye lies along the look,
pitched, `28 − 14 × |n.y|` from it, so it comes in as the camera looks down or up; the rest pitch is
`init_aim_pitch`, −9.167°. There is no tether (`cam_tether_stiff` has no reader): the collision pass pulls the eye
in at once to 0.75 short of the hull and lets it out at 3 % a game frame (30 Hz: a time constant of 1.09 s) after 1.5 s. Crouched at the spawn that puts
the target 15.378 over the feet and the eye 19.603 over them and 24.906 behind -- the console's placed eye on the
spawn dump, to 0.0003; standing, the target is 21.484 and the eye 25.709 up.

**The stances and the body are measured on the console's dump and frame** ("The SEAL is 19.6 units tall, and the
console's spawn dump holds a crouched player"). The skeleton root is 11.484 over the feet standing (the 24 actors at
the bind pose) and 5.504 crouched -- the dump's player is crouched: its root under the game's own stance test of 9.0,
a knee on the ground; prone 2.168 (555/256) is `seal_prone`'s own root off the disc. The body (`viewer/src/body.ts`, `bodyView.ts`) is the game's own:
the map's player character out of `CLIB_MDL.ZED`, skinned on its `CLIB_GEO.ZED` skeleton, its gear hung where
`READERC.ZAR/character.rdr` says, played by the game's clips out of `MOTION_P.ZAR`
([research 78](docs/research/78-character-mesh-and-skeleton.md), [research 77](docs/research/77-motion-format.md));
the bind-pose SEAL is 19.431 units tall. (Web sprint 2 began with a 19.6-unit stand-in measured on the frame; the
real model replaced it.) The scope's eye, 18.3, is an estimate.

**The reticle and the rifle are the disc's** ("The console's reticle: two bitmaps at one texel per pixel, a
65-pixel cross on the frame's centre"; "The SEAL's rifle and the game's own bullet mark"). `HUD2_TXR.ZED`'s
`ret_rifle_01.tif` (a 64×64 ring and dot) and `ret_rifle_02.tif` (a 32×32 arm, drawn four times) at the console
frame's size, one texel to a PS2 pixel, scaled by the height / 448 in the Modern picture (`viewer/src/reticle.ts`).
The rifle is `ZWEAPON.ZAR`'s M4A1, first in every `mp_seal1` kit (`scene/src/weapons.ts`): `FireWait` 0.12 s (500
rounds a minute), 30 rounds and three magazines -- the console's "30/30 · 2 MAGS" -- and a 1000-unit ray against
every polygon of the hull (`viewer/src/fire.ts`); where it lands goes `decals.rdr`'s `bullet_mark_stone.tif` off
`EFFE_TXR.ZED`, 1 to 1.8 units wide.

**The kit is the character type's** (web sprint 4, M3/M4; [research 94](docs/research/94-the-arsenal.md)): the page
reads `RUN/ZWEAPON.ZAR` beside `READERC.ZAR` (the served tree with `?devmode`, or the disc image) and the map's own
`READERM.ZAR`, and the player spawns with its side's first type's `default_weapons` -- on Frostfire `mp2_seal1`'s
M4A1, Mark 23, M67, HE and Double Ammo Load; the Terrorists' `mp2_terror1` the 552 and the M9 -- a `Loadout` of five
item ids (`packages/viewer/src/loadout.ts`). L1 and L2 take up its primary and secondary, each with its own record
(rate, modes, magazines, zoom, reticle set, cone, kick, muzzle animation, sounds), its own model at its own grip (every
firearm model of the map's weapon library, decoded once with the map, built on first use) and its own HUD icon
(`IconTextureName`); 2X doubles the firearms' magazines, at most ten (`FUN_005c75f0`, research 94 §A7). A pick (WEAPON
EXCHANGE, above; the hook's `setLoadout`) waits for the next spawn -- in classic, the next round. The match's room owns
the kit (W4.R6): it replays the picks, holds the kit, keys its rate, reload lock, cone, damage and falloff by the player's
own slot records -- never the page's claim -- the arsenal read from `SOCOM_DISC` at the server's start; the others are
drawn with the kit their spawn named and the item their body holds. Without `ZWEAPON.ZAR` the kit is the baked M4A1
SD and Mark 23 of before. **The equipment follows the loadout** (web sprint 4 M7, research 94 §C4-§C5): the pouch is the
three equipment slots' (`viewer/src/equipment.ts`); the LAW and the RPG-7 are raised from their slot and fire their
rocket straight at the reticle's point (980 u/s^2, no fall, a dud inside 10 m, 20 in 15 m) with the backblast behind
(6 in 7 m, its 45-degree cone); the claymore is placed and set off by its Detonator, the PMN arms after 8 s and trips
within 1 m, C4 is planted on a destructible that takes it (an access barrier) by the Action button and goes off 6 s later -- and the room flies, places and
detonates each of them, all through the `throw` message by the item's name (no new wire message).

**The gunplay is the game's** ([research 84](docs/research/84-accuracy-and-recoil.md)): the SEAL's rifle -- the M4A1 SD
(`HELD_RIFLE`) the specs pin by `&kit=` -- fires to `Maximum_Range` x 10 units; its reticle opens with the walk, the look and each round and closes
at the weapon's own per-stance rates (`viewer/src/accuracy.ts`), halved in third person; a round climbs the whole
reticle up the screen (the recoil you see unscoped -- the camera does not kick there) and goes inside it by the
game's cone; semi, burst and automatic (`B`, L3; burst at spawn); the right button steps the view third person -> first
person -> the 3x scope and back (first person restored by the owner, 2026-10-01), d-pad Up and Down step it in and out (`viewer/src/zoom.ts`, the scope's tube and dashed cross off `HUD2_TXR`); the Mark 23 steps from first person into the 9x binoculars (`ret_binocs` / `ret_binocs2`, `reticle.ts` `binocularsLayout`), the others seeing the body's `*2binocular` clip (`binocularPose.ts`).

**The rifle is in the SEAL's hands, raised to fire as the game raises it** (the sprint 2 player spec's §6, "The rifle
in the hands, the Fire set, the kick and the satchel"). The body makes a `rifle` node under `rhand` with the rifle in
hand (`FUN_00553290`); the clips' `rifle` track (`weapon` in the few SOCOM 1-named ones) poses it and the M4A1 SD
hangs on it at its grip (`viewer/src/heldItem.ts`). The trigger raises the rifle over 0.1 s and it stays up 5 s after
the last round, then falls over 0.5 s (`FUN_005dfe30`, `FUN_005dfc80`, the controller's 5.0 s at `FUN_00598280`;
`viewer/src/weaponRaise.ts`); while up, each clip's **Fire** version (`seal_fp_stand`, `seal_fp_walk`,
`seal_fp_crouch` ... twelve pairs, `FUN_005e0690`) blends in at that weight (`viewer/src/weaponPose.ts`, a pose layer
over the clips). A round leaves the posed weapon's `firepoint` toward the point under the reticle; in a scope the
first round of a pull kicks the aim's pitch by the stance's `FireRifleKick*` (`FUN_005b91c0`/`FUN_005b9280`, on in the
image, gated to the scope as the game gates it: research 84 section 8; `viewer/src/rifleKick.ts`) -- while it falls, a pad
pushed up (or the up arrow) lifts the pitch it falls back to by 0.04 x the push a game frame (`DAT_00650980`), the
mouse not at all -- and `R` plays the stance's reload clip for its `motion.rdr` playback (1.6 s standing).
The satchel is hung but hidden, as the game hides it until the SEAL picks up the bomb (`FUN_0059df60`). `Fire`'s
`subscribe` is the audio's hook: a `round` event (the weapon's name, id, muzzle animation and sound names, the fire
point in the world, the end, the hit, the rounds left), `reloadStart` (its seconds) and `reloadEnd`.

**The sidearm is the kit's Mark 23, on L2** (the player spec's §6, "The sidearm, the swap and the reload"). Every
`mp_seal1` kit is M4A1, Mark 23, M67, HE: the controller's L1 and L2 slots are 0 and 1 (`FUN_00598280`), so L1 (`1`)
takes the rifle and L2 (`2`) the Mark 23 (`a_mark23`, `scene/src/weapons.ts` `HELD_SIDEARM`: 12 rounds, semi, `FireWait`
0.2, reticle set 0, `mark23_icon.tif`, `.MARK_23`); R2's item menu reaches them and the throwables (research 94 §4.6), and the
M67 is no longer on L2 (`viewer/src/kit.ts`); on the PC `3` and `4` take up the kit's equipment slots 1 and 2 (the M67
and the HE, `grenade.ts` `equipmentSlots`). The Mark 23 zooms to first person and on into the binoculars, as the disc's
own `M62_BINOC` tutorial walks it (`zoom.ts`: the game's one-mode rule, `FUN_005445b0` 0x54480c; the binoculars are not
a scope, so the 2026-09-29 "no pistol scope" ruling stands beside the owner's 2026-10-01 yes to them). The
swap plays the game's clip (the MOTION workstream's
`WalkMode.swapWeapon`): the rifle rides `spinelo` on the clip's own track and is slung at `character.rdr`'s offset, the
pistol comes out of the hips or the holster at the clip's hand-off (0.72 standing) and goes back into the `rthigh`
holster. The kit runs on the walk's own clock for the clip (`WalkMode.swapProgress`), so a standing swap the stick
turns into the moving one carries on at its phase; each weapon hangs from its clip's own track, never a cross-fade of
the hand's and the back's (`Animator.heldLocal`), and goes onto its new mount at once when its mount changes, as the
game re-parents it (`heldItem.ts` `HeldMounts`; research 181 §3.5): only the body's 0.4 s pose cross-fade smooths the
swap (the owner's ruling, 2026-10-04, over the 2026-09-29 ease). The swap is refused in the 9x view or a scope (zoom
4 and up, `FUN_005c4fd0`) and taken during a stance change, the new stance's clip in its place, on the page and in the
room alike ([research 211](docs/research/211-the-weapon-swap-by-state.md) §2). On the move the swap is the second
channel's: laid over the Fire pose at 1.0, on its own 1.257 s clock, the body easing 0.4 s from the pose on screen at its
start and after its last key (research 150 §3.5; 211 §4). The pistol's clips (`seal_p_*`), Fire versions (`seal_pfp_*`) and reloads (`seal_p_reload` ...) follow
`m_item`. A reload puts the next magazine in at its start and keeps a part-used one in the ring; an empty magazine
reloads by itself 0.01 s later, a dry trigger clicks (`dry`); walking faster than 20 a second turns a still reload
into the moving one. The accuracy pip (`ret_accuracy`) marks a raised muzzle blocked short of the point under the
reticle (`FUN_005aa6e0`, `FUN_00215250`). In first person, the binoculars and the scope the page draws none of the SEAL, as the game draws none in its views from the eye; first person keeps the class's reticle at full size (halved only in third person, `FUN_00215250`) and the look and move at 1 (`FUN_005966a0` at 1.01).

**The HUD is the game's** ([`docs/research/87-hud.md`](docs/research/87-hud.md)): `CHUD`'s own rectangles read out
of the ELF -- the ammo box's `newweapnbkrnd.tif` over x -10..160, y 364..439, the weapon icon at (20, 389), "30/30" and
"2 MAGS" at scale 0.9 on the baseline 382, the fire-mode rounds at x 10, 51, 87, the compass ring `compass_lo.tif` at
96x96 on (565, 90) turned by the heading, the info box's health bar at (488, 396) -- drawn from `HUD_TXR`, `HUD2_TXR`,
`HUDW_TXR` and `FONT_TXR` (the font a PSMT4 texture `@s2u/gs` now reads, every HUD bitmap stored bottom row first) with
`fonts.rdr`'s `font_text_01` glyphs; each element's pixels within a pixel of the console frame's (`e2e/hud.spec.ts`).

## Known gaps

- **The swap's hand-off phases are a reading.** The phases at which a weapon changes hands (0.72 / 0.82 / 0.62 /
  0.79) are the code's own constants (`FUN_00588bc0`, `FUN_0057a010`; research 181 §2.7, 211 §1), read and pending
  review (the weapon's re-parent itself is instant, as the game's: the owner's ruling, 2026-10-04). The scoped sway moves the rounds but nothing on screen, as in the game as far as it was read
  (no reader of it that draws was found: [research 84](docs/research/84-accuracy-and-recoil.md) section 8); a
  console check would confirm.
- **Some effects are open.** The tracer's travelling model, a lifetime count-down on marks and footprints, and the
  skinned body under a light's pass (research 89 section 8). Maps with no game explosion effect show stand-in
  sprites for a grenade's blast.
- **The walk is the decompilation's reading, not yet measured on the console.** The speeds, the ramp and the fall
  are the game's tables and the decompilation's law (`viewer/src/walk.ts`'s header); the console measurement
  (W2.2c: the instruments and the recipe are in the tree, PC research 79, `desktop@be557831:docs/research/79-seal-speed-on-the-console.md`)
  waits for a window the owner names. Until it runs the scope's eye
  heights (the eye 18.3 standing, and the crouched and prone eyes derived from it) and the crouch and prone body
  columns are estimates, and two numbers are readings only: the crouch diagonal's speed-up along its axis (19.8 at
  45°) and the headroom ray's start (the stance's idle hips + 2: 7.5 crouched, 4.2 prone). The steep-ground slide is research 201 §3's law (`steepSlide.ts`): ground whose normal's y is under cos 50° slides when the face is at least 4 tall, or the body is prone, or the height cannot be read, gaining `(1 − n_y) × 235` a second from an entry of `n_y` times the horizontal velocity along the fall line. How that height is measured is a named reading (`SLIDE_SPAN_MEASURE_READING`); a capture is still owed.
- **A kerb between 6 and 6.5 units over a lower floor is stepped onto, as a reading.** The mover's probe origin --
  the grounded step's, the spawn's and the fall's -- is the feet + 5.5 (`STEP_PROBE_LIFT_READING`, the console's
  spawn origin), so its pick reaches step_height (research 86 section 6.5; until 2026-10-02 it was walked under). The
  record's layer mask is probed as all layers (the literal reading contradicts research 24's own walk); and the slot
  outlines are drawn without a depth test because a slot's cell is flat where its ground is not (362 of 1,058 have a
  corner more than a unit off the floor under the centre).
- **The HUD pass has not been seen under WebGPU.** The reticle's layer is pinned by the e2e, but no one has yet
  looked at it on a WebGPU browser (W2.4's review); that look is owed.
- **Region culling, the flares' place in the engine order, the LOD twin.** The per-node region bits (node flags
  13-17) are on the disc on 8 maps and the collision polygons carry masks over the same bits on 6, but the
  world's own nodes are still not culled by region. Since LATER 415 and LATER 489 (reading, pending review) the camera's
  region masks are read (research 329 §1.2; `viewer/src/regionCull.ts`, its switch `REGION_GATE_READING`) and gate the
  teammates' name tags (LATER 415) and the bodies (LATER 489, `RemotePlayers.applyZoneGate`) only; and the engine draw order stays a switch until the pass that keeps a flare from cutting
  the wall behind it is found (the sprint 1 spec's §7), the LOD twin under that order with it. The two facade
  modes are drawn alike, reCOM's `ComputeFacadeMatrix` being a stub.
- **Some animated map objects are partial.** The doors swing (`actions.rdr`'s `DOOR` records and their `MZANIM.ZAR`
  animations, [research 92](docs/research/92-doors.md)), and the room now drives the destructibles'
  states, Death Trap's and Enowapi's lever gates and Chain Reaction's hooks (STATUS, "The mutable world", partial:
  MAP-01..03, 06, 07; the airstrikes and the autostart still to do); the destructibles' particles (A12) and
  the other particle effects (`COMMON/EFFE_*`:
  `fire_hardedge.tif` and the smoke sprites) are driven by game code the viewer does not run; the
  flames are effect emitters, not map geometry.
- **The one EE-animated `FIX` glow** (`lightglow.tif` on MP61, `(Cs - 0) * FIX + Cd`) is drawn additive:
  its factor is game logic, and at rest it draws nothing.
- **The auto-exposure is a slider.** A multiplayer round never runs it (the viewer opens at FIX 0, as the round
  draws); the campaign meters `FIX` per frame from a grid of frame pixels and applies it twice, which the viewer
  leaves to the slider.
- **The ISO source is tested on one retail disc** (a dev-disc test, not a measurement of the original). It reads ISO9660 (the primary volume at sector 16, `;1` names,
  files by LBN), was checked against images written by an independent library in four flavours (plain, Joliet with
  Rock Ridge, a UDF bridge, El Torito), and has read the retail US image (4,380,753,920 bytes): one volume of
  2,139,040 blocks, 349 files, all 22 `RUN/MP*.ZDB` named; the gated test runs with `SOCOM_ISO` set to the image
  ([research 93](docs/research/93-data-hardening.md) section 3). An image shorter than its volume is refused at open,
  naming the two causes: a truncated file, or a Node `fs.openAsBlob` Blob over a file above 4 GiB, whose size Node
  reports modulo 2^32 (a browser's `File.size` is exact). A dual-layer dump's second volume is read where the first
  lacks a path, as PCSX2 and Open PS2 Loader find it (tested on a synthetic image only: no SOCOM II disc is
  dual-layer). A raw 2352-byte `.bin`, a multi-extent file and an interleaved one are refused by name rather than
  read.

## Game data and the repository

`public/maps/` is git-ignored, and so is everything the tools write into it and into `test-fixtures/` —
archives, PNGs, `.glb` files and Playwright screenshots — regenerated from your disc by `npm run extract-maps`
and never committed. The one exception is `test-fixtures/`' small committed tier that RS.R8 allows (H71; its
list is `test-fixtures/MANIFEST.json`); nothing else from the disc is in the repository. SOCOM II: U.S. Navy SEALs and all of its assets — models,
textures, maps, audio — are the property of Sony Interactive Entertainment, developed by Zipper
Interactive. This project is not affiliated with, endorsed by, or connected to Sony Interactive
Entertainment.

## Credits

- **reCOM** ([github.com/Not-Enough-Photons/reCOM](https://github.com/Not-Enough-Photons/reCOM)), the reverse-engineering
  project that reconstructs the SOCOM games and their engine: thank you. It inspired this project and was a valuable
  starting point -- the engine's draw order, its scene graph, its grid and its names were read there first.
- SOCOM II: U.S. Navy SEALs was developed by Zipper Interactive and belongs to Sony Interactive Entertainment (see
  [Game data and the repository](#game-data-and-the-repository)).

## Licence

GPL-3.0, the repository's ([`LICENSE`](../LICENSE)); contributions are accepted under GPL-3.0-compatible terms
([`CONTRIBUTING.md`](CONTRIBUTING.md), [`../CONTRIBUTING.md`](../CONTRIBUTING.md)). The licence covers this project's
code and documentation only, never the game or its data. There is no CI: the checks are the git hooks and the
local gate, `bash workflow/gate.sh` from the repository root (`--no-data` reproduces a host without game data).

## Multiplayer server (web sprint 3)

`packages/central` (composing `packages/match`'s rooms) is the match server behind the viewer's **Online** setting (and `&mp`): a classic match per map, HTTP
`/health`, `/metrics` (host only) and
`/rooms` (each room's map, rules, players, spectators and round: anonymous counts, public by the owner's ruling, with
an ETag answered by 304 and `Cache-Control: public, max-age=10` for the viewer's PLAYERS ONLINE poll), `/maps`
(`{"maps": [...]}`, the stems it plays, with `/rooms`' headers; MAPS-4) and a WebSocket
on `/ws`, all on one port. It reads `RUN/` (`MP*.ZDB`, `MOTION_P.ZAR`,
`READERC.ZAR`) from `SOCOM_DISC`, your own copy of the disc, which it never serves. It plays every map that copy
holds, or those of them `MAPS` names (OT.R45: the default list is what CREATE GAME offers, not a wall).

```
SOCOM_DISC=/path/to/disc npm start -w @s2u/central        # PORT 8787; MAPS, IDLE_KICK_MS, ROUND_SECONDS, MAX_ROUNDS, RULES, SERVER_NAME, TRUST_PROXY
```

**Respawn is a match option** (OT.R71, the owner 2026-10-22, lifting the ruling of 2026-09-29 that had made every room
classic). A created game's own RESPAWN (its RulesSet bit 1) decides its rules; a join names its rules (the test room's
Rules setting, `rules=`), and one naming none joins the map's classic room -- the original's default, respawn off
(research 163 R163.2) -- which `RULES` may change. `RESPAWN_RULES_ENABLED` in `packages/viewer/src/net/protocol.ts` is
the switch, on; a test may turn it off. Split hosts say they play respawn, and central places a respawn game only on
one that does (a host of the release before would play it classic). `MAX_ROUNDS` is the game's `mp_max_rounds` (11,
the create-game default): the match length and the count the round-start banner shows.

Join from the viewer with Settings > Online > **Local** (this server on its default port), or with
`/testroom?mode=play&mp&server=ws://localhost:8787/ws` (`wss://` behind TLS). A hello with `watch: true` (the map viewer's) joins
as a spectator outside the queue: never promoted, sharing the spectators' room with it.

To run it on a host, `deploy/` holds a Dockerfile (an esbuild bundle in a slim Node 22 image, build context the repository root), a
compose file with Caddy for HTTPS, a systemd unit for the no-Docker case, and `deploy.sh`. The owner's steps, the
Lightsail size and the firewall are in [`deploy/README.md`](deploy/README.md). The disc is mounted read-only at run
time and is never part of an image.

### Playing a match

Choose Settings > Online (Shared, or Local on a local page) in reCOM mode, or open the test room with `/testroom?mode=play&mp` (the
server at this page's host, `/ws`) or `/testroom?mode=play&mp&server=wss://host/ws`, on the map you want: each map is its own match. The page joins as a SEAL or a Terrorist by the game's join rule (research 91
§7); past 16 players it spectates, and is moved in, first come first served, when a place frees up.

| key | in the match |
|---|---|
| the walk's keys | as in single play: the page predicts its own SEAL and the server agrees (W3.R8) |
| Tab / Select | the scoreboard: every player, the game's sort, the dead dimmed, the spectators; online, its GAME DETAILS are the lobby's name, the game's and the type (ONL-19, research 269 §5) |
| Start | the game's START menu (MATCH-01, research 266 §8): a player's or a spectator's online rows, the round running on under it; ABORT's confirm (NO the default), then, in the front end's match, back to SOCOM II ONLINE (MATCH-02, research 266 §8.10); `/testroom` closes its client and posts the abort's two lines instead (`TESTROOM_ABORT_ADAPTATION`) |
| the message window | the round's chat (SVC-19, research 266 §3): the game chat's lines in scope -- all, or a side's "(Team)" -- and, online, the lobby server's whispers and universe lines (EXTERNAL WHISPERS) |
| a USB keyboard: type, then Enter | in an online round (the lobby-launched match, and `/testroom`'s served round): the round's text line, `/w <name> <message>` a whisper -- sent in the lobby's match, echoed and unsent on `/testroom` (no lobby) -- any other line cleared unsent; a development build opens the line with Enter first (`ROUND_TEXT_LINE_DEV_OPEN_ADAPTATION`) (KEYBOARD-WHISPER, OT.R48, research 266 §3.9) |
| K, then 1-9 | the vote to remove a teammate (TEAMMATES, VOTE RETAIN / REMOVE; passes on more than half the team, at the round's end) |
| Space / V | spectating (PF-31), each on its release: d-pad Right / Left the next / previous living player (the arrows, Space kept beside ArrowRight), Up / Down the map's fixed views, Cross (X, V too) the free camera and back, Triangle (C) the player nearest the view's centre -- Triangle never lowers the free camera while you spectate |
| Space (classic, dead) | the next living teammate to watch until the next round, on its release; d-pad Right / Left, released, the next / previous (no escortee) |
| `I` / R2 / **INV** (dead) | WEAPON EXCHANGE: the kit for the next round (see **WEAPON EXCHANGE** under **Controls**) |
| Settings > Online > name | your name, 30 characters at most; blank is the game's `Player####` |

A match is **classic** by default (respawn off, the game's create-game default), online and in the offline match
alike; the test room's **Rules** setting (or a link's `rules=respawn`) picks the game's RESPAWN instead (OT.R71): on a
SUPPRESSION map one 20-minute round, the dead pressing Action to come back (research 91 section 4, research 352-357);
other maps play classic. A classic match starts once both sides
have a player: 11 rounds, first to 6. A round
ends when a side has no living player (tested from 15 s in; "ALL TERRORISTS ELIMINATED" / "SEALS VICTORIOUS!", 23 s
more, then ROUND COMPLETE) or at 00:00 as a draw. In classic there is no respawn. The dead see "You have died.  [I] Select new
weapons.", may pick the next round's kit in WEAPON EXCHANGE, and watch their living teammates (Space) until the next round. A player who joins mid-round is a ghost until then. Level after round
11 plays a tiebreaker ("PLAYING TIEBREAKER ROUND"), and another while it is drawn. Every round starts everyone at the
side's start slots with a full kit. Scoring: +2 a kill, +1 alive at the end, +5 each on the winning side. The rules and their sources are in research 91 section 19.

**Desert Glory plays EXTRACTION** (web sprint 31, HX-1; research 237): three hostages stand in the jail at each round's
start, bodies the server owns. Either side can shoot one, whatever the friendly-fire setting, and they never count
for the elimination. Two rescued with all three resolved wins the SEALs the round after 25 s; two killed by SEALs wins
the Terrorists after 23 s; 00:00 is a draw even with two out. A SEAL's hostage kill takes a minute off the round's
total (never below 1 s), and a hostage's death posts no kill line. Shared AI-map planning and following now run on Desert Glory, Blood Lake, Death Trap and Fish Hook
([research 333](docs/research/333-hostage-follow-pathing.md), [334](docs/research/334-hostage-follow-motion.md),
[335](docs/research/335-hostage-obstacles.md)). Normal route steering, live-actor occupancy stamps, obstacle probes
and recovery, actor-probe eligibility/short stops, and recovery retry/climb-permission lifecycle have source-reviewed implementations. Physical tests pass all 15 start-to-zone routes, including Fish Hook contact climbing; rendered FOLLOW/HOLD
checks have passed on all four maps (latest matrix 3/4, unchanged Death Trap repeat passed; timeout cause unestablished). Remaining controller, physical actor-contact/delayed-yield and vehicle-binding gaps are named
in those notes. Full repository gates and an original capture comparison remain separate validation. The rescue, score and HUD are wired (research 239).

### Offline match

Offline (Online off), reCOM mode plays the match on its own: the page runs the match server's own `Room`
(`packages/match/src/room.ts`, imported as it is) behind a socket that never leaves the page
(`viewer/src/net/loopback.ts`), and joins it with the same client a match uses -- so the round's clock and banners,
the game's damage (rounds, falls, grenades), deaths, scores and the scoreboard are the online match's, one
implementation. The match is classic by default, as online (no respawn; the Rules setting's Respawn plays the game's
RESPAWN offline too). The player is the host's side, the SEALs; nobody
is kicked for idling; the round starts with the one player and runs to its clock unless the SEAL dies -- then the SEALs
are eliminated and the Terrorists take the round ("ALL SEALS ELIMINATED" / "TERRORISTS WIN!"), and the next round
stands a fresh SEAL at the SEAL start slot (`SOLO_ROUND_PLACEHOLDER`: the game launches only with both sides seated,
so it has no one-player round; the empty Terrorist side is never eliminated).

**A grenade hurts, knocks and rings the player**, offline as online (research 85 section 12): the blast's fragments
strike head, body and limbs by the game's `.data` tables, a standing or crouched SEAL is thrown (`Fall forward` /
`Fall backwards`, then the landing and the get-up; a dead one stays down), and the ears ring -- the mix held at 0.35
for 5 s, then faded back over 5 s (`viewer/src/ringingEars.ts`). A killed player sees the game's network death camera
(the orbit about the body, `viewer/src/deathCamera.ts`; the single-player match takes the network branch,
`SOLO_IS_NETWORK_READING`).

The match is off with `&nomatch` (the free walk of before), or with `&fly` together with `?devmode` (the developer's
free camera: without `?devmode` a `fly` in the address is ignored); `e2e/soloMatch.spec.ts`, `e2e/armory.spec.ts` and the WEAPON EXCHANGE
specs (`weaponExchange*.spec.ts`: the menu is a match's) play it on purpose, and every other spec opens with one of the two. The rules and their sources: [research 91](docs/research/91-the-round.md)
section 20.

**Protocol 13** (`packages/viewer/src/net/protocol.ts`, `PROTOCOL_VERSION`, since bc95941ba, 2026-11-02): a page and a
server of another version refuse each other at the hello, and the old page is told to update. Protocol 13 (PLANT-AIM)
makes the bomb's plant need the page's own pick, which a 12 page never sends; the binary wire is 12's, so a `.s2r` of
protocol 12 plays on the live decoders, and the `shot`'s `through` and `end` and the `grenade` event's `age` are
additive since, the version kept. Protocol 12 (since ec51d1902; SEP-POP, OT.R93) carries the command's `separate`, bit 3 of the stance byte -- the page's stance mode, which the room's
mover reads every tick; the snapshot is unchanged, and a `.s2r` of protocol 11 still plays (`packages/match/src/replay/format.ts`,
`DECODERS`: no 11 writer set the bit). Protocol 11 (since e04fcc4bd)
carries a frame-type byte, the feet as an i16 from the map's bounds, the environment only on change, `BodyState.flags`
as a u32 and the own state's facing; a `.s2r` of protocol 10 still plays. Protocol 10 (web sprint 26 MAP-03; research 209
§11) carries the world: every snapshot ends with the room's environment (its revision, the round epoch, each placed
instance off its opening state; 8 bytes with none, so a snapshot of 15 on Frostfire is 890 bytes), the welcome carries
it with the round epoch, the round's start tick and the map's game type, and the page lays it on its world before the
snapshot corrects its prediction -- a joiner silently. Protocol 9 (web sprint 5 S2) carries the
character type -- the side's ARMORY column, each its own body, kit and hit volumes (research 95 §6): the hello names the
page's type for each side, a `loadout` request the type its picks replay from, a `spawn` and the welcome's players the
type the body was rebuilt as. Protocol 8 before it: two branches each took 7 -- the launch branch for
the `abandoned` event and the `orphan` kill (research 91 §17.2), web sprint 4 (M9) for the arsenal -- and the merge
carries both at 8. From web sprint 4: the `loadout` request
-- the side's weapon-select picks since the match began, in order, the whole list each time (so a rejoin sends it again
and lands on the same kit) -- and its answer, the kit the room holds for the next round or the refusal (`slot`,
`unknown`, `locked`, `refused`: the other side's item, a second primary, a locked slot); a body carries the id of the
item in its hand (56 bytes a body, 882 bytes a snapshot of 15 on Frostfire until protocol 10); a `spawn` and the welcome's players carry
the kit; a `shot` names its item; a kill line names the weapon by its `DisplayName` ("12 GAUGE PUMP", "2X AMMO"; research
91 §10). Whether a build carries multiplayer is its `VITE_S2U_MULTIPLAYER` (**Multiplayer off** under **Deploying**);
which build a public host serves is the owner's (MISSION, OT.R94).

`?lag=100&loss=2` runs the page's latency and
loss injector (ms each way, % of frames). `npx tsx tools/mp-bots.ts --spawn-server --disc test-fixtures` measures a
server under 16 bots and 8 spectators.

### The map allowlist

**`VITE_S2U_MAP_ALLOWLIST`** (comma-separated stems, `MP2,MP7,MP51,MP72`; a deployment switch with no original -- the
original picks a game's map in CREATE GAME, built since ONL-13): one variable, read by the viewer's build for its map
picker and by the match server for the maps it accepts (`packages/viewer/src/multiplayerMaps.ts`, the one parser both
use). **Unset or blank, every map**: the default build and server keep all 22. Export it once, then build and start
with it, and the picker never offers a map the server refuses; `MAPS`, the server's older name for the same list (the
deploy's `env.example`), may be set beside it only to the same maps, and a token that is no map stem stops the server.
The picker shows each map's own label either way. From Chris's browser-beta-v5, where it held his LAN package to the
three maps he had checked.

### LAN playtest (a developer tool)

`tools/lan-playtest.ts` plays a match between two computers on one home network, on our match server (a browser / LAN
adaptation with no original, from Chris's browser-beta-v5 launcher; not a player-facing package, and no ZIP):

```
npx tsx tools/lan-playtest.ts host --disc /path/to/disc [--maps MP2,MP51] --build   # the computer with the disc
npx tsx tools/lan-playtest.ts join --address <an address host printed> [--maps MP2,MP51] --build
```

`host` checks the disc for what the server reads, starts `packages/central/src/main.ts` on port 8787 of every interface
with the allowlist, and prints its home-network addresses; `join` takes one of them -- an address on the home network
only (10/8, 172.16/12, 192.168/16, 169.254/16), so the tool reaches our own server there and nothing else -- and checks
the server's `/health`. Each then serves the viewer it built (`--build`: `dist/lan-playtest/`, with the same allowlist
and no `/rooms` poll) on `127.0.0.1:5174` only: GET and HEAD, nothing outside the site, `no-store`, and a CSP that lets
the page reach itself and the host's server alone. It prints the page's address and what to do: choose your own disc
image, take a seat (the ARMORY, on the seat only), alive swap in game (R2's item menu, L1 / L2 or `1` / `2` the main
weapon / sidearm), and dead use WEAPON EXCHANGE, as in any match. The host's server runs with the combat report on
(`COMBAT_REPORT=1`, research 127: each hit, miss and refusal to its own players only, saved in the `&devmode` playtest
report); `host --no-combat-report` leaves it off, and the ready message says which. `--map`, `--port`, `--site-port` and
`--no-open` are in the tool's header. While it runs, the host's `/metrics` answers on the home network too; `host --loopback` binds the
server to 127.0.0.1 instead (both seats on one computer: `join --address 127.0.0.1` with another `--site-port`, and
without `--build`, which would empty the `dist/lan-playtest/` the host is serving). The page each player opens is the test room, `http://127.0.0.1:5174/testroom?mode=play&map=...&server=...` (OT.R19: the
base path is the menus, and the site's server answers `/testroom` with the built page). The browser it opens is the bare site address, which redirects to that play address (cmd.exe would split
the full one at its `&`).
