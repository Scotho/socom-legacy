# 100 -- The load budget: the phase marks and the table, today's phases measured (web sprint 6, PLAT-29a)

Written 2026-10-01 for web sprint 6 (plan `../plans/2026-10-01-web-sprint-6-foundations.md`, task PLAT-29a, ruling
**W6.R4**; the block is `../roadmap/01-platform.md` "PLAT-29a"). W6.R4: the Sony frame and the main menu are sprints 12
and 11, so this sprint lands the phase-mark API and the table with today's phases measured -- the first byte, the disc
indexed, the map's first frame, from the ISO and from the served tree -- and writes the rows not built yet as
**owed**, each naming its sprint. **No threshold**: the owner's 30 s first-load rule (web research 71 §1.7 cites it) is
PLAT-29b's, which needs PLAT-19c's movie cost too.

The code: `packages/ui/src/loadPhases.ts` (`LOAD_PHASES`, `PhaseMarks`, `budgetTable`; pure, the clock a parameter,
W6.R2), pinned by `packages/ui/test/loadPhases.test.ts`; the viewer's glue `packages/viewer/src/loadBudget.ts`
(`pageMarks`, `firstByteOf`; `packages/viewer/test/loadBudget.test.ts`), marked in `packages/viewer/src/main.ts` and read
through `window.__viewer.phases()` (`src/hook.ts`); the perf spec `packages/viewer/e2e/loadBudget.spec.ts`.

## 0. Answers

| # | finding | consequence | section |
|---|---|---|---|
| R100.1 | Eight phases, in boot order: first byte, page start, the disc chosen, the disc indexed, **first Sony frame, main menu, lobby** (owed), the map's first frame | `LOAD_PHASES`; one mark a phase, the first only | §1 |
| R100.2 | Today, on this host (headless Chromium, SwiftShader), Frostfire's first frame lands **1.66-1.80 s** after the page's time origin from the player's full ISO and **1.80-1.92 s** from the served tree once Vite has transformed the modules (6.09 s on the first, cold run) | the table, §2; far inside 30 s, but nothing of the boot that will precede the map is built yet | §2 |
| R100.3 | From the disc chosen, the ISO indexes in **93-130 ms** (the worker's map list, read by range out of the 4.38 GB image) and draws its first map **1.29-1.36 s** later | the ISO is not the slow part: the reveal (uploads, program links) is | §2, §3 |
| R100.4 | The rows owed: first Sony frame -- sprint 12 (BOOT-04, the intro shell running SONY448.PSS; web research 98 §1: the card is the movie's); main menu -- sprint 11 (MENU-02, `dlgMenu`); lobby -- sprint 17 (ONL-16, the game lobby `dlgGameLobby`; Chris's lane) | each sprint marks its phase through `PhaseMarks.mark` and re-runs the spec | §1 |

## 1. The phases and what each mark is the moment of

All times are `performance.now()` milliseconds from the page's time origin (the navigation's start). Only a phase's
first mark counts: a second map, or a second disc, does not move it (`PhaseMarks.mark` returns false). A disc image
refused -- no ISO, no archive that names itself, the worker failing -- takes its `discChosen` mark back
(`PhaseMarks.retract`), so the image picked next is timed from its own choosing; a refused second disc leaves the first,
accepted one's mark alone (the viewer takes back only a mark its own call set), and a disc chosen while the one before
is still being read supersedes it, the mark moving to the later choice (the earlier index is dropped). The rule is
`@s2u/ui`'s `DiscChoice`, pinned by `packages/ui/test/loadPhases.test.ts`.

| phase | the moment | marked by | state |
|---|---|---|---|
| first byte | the navigation entry's `responseStart` (`performance.getEntriesByType('navigation')`; a zero is read as no timing) | `pageMarks` | measured |
| page start | the viewer's module body starting, after its imports (`main.ts`, `LOAD_MARKS`) | `pageMarks` | measured |
| the disc chosen | `openDisc` accepting a file (the file input or a drop); a served run has none | `main.ts` `openDisc` | measured (ISO) |
| the disc indexed | the worker's map list accepted (`indexVerdict(...).open`), from the ISO or `maps/index.json` | `main.ts`, the `index` reply | measured |
| first Sony frame | SONY448.PSS's first Sony-card picture on screen (web research 98 §1: pictures 11-140 are the card) | sprint 12, BOOT-04 (with PLAT-19b's decoder) | **OWED** |
| main menu | `dlgMenu` first drawn | sprint 11, MENU-02 | **OWED** |
| lobby | the game lobby (`dlgGameLobby`) first drawn (sprint 16 reaches the SOCOM II ONLINE menu before it) | sprint 17, ONL-16 | **OWED** |
| the map's first frame | the first map's world whole in the scene: the last world reveal slice (`show`, `revealing.done`), the moment the status line's `ms to first paint` is measured to; props follow | `main.ts` `show` | measured |

What the original does at the menu: its init loads READERC, UIZANIM (1.2 MB), LOC, fonts, UI textures and HUDUI
(`FUN_001f4860`, the block's citation); the console's boot order is BOOT-01's. None of that is timed here: the page has
no boot yet, and the console's own times are BOOT-01's captures (s00..s18 in `docs/parity/REPORT.md` of the PC project).

## 2. Measured 2026-10-01 (the table)

The command (the host's lock FREE when run; port 5301, the run's own Local port 8831):

    S2U_PERF=1 E2E_PORT=5301 E2E_LOCAL_PORT=8831 SOCOM_PC_ROOT=C:/Projects/socom_pc \
      npx playwright test packages/viewer/e2e/loadBudget.spec.ts

Each column is one load in a fresh browser context (its own HTTP cache), three of each source: the served tree at
`/?devmode`, the player's full retail ISO (`SOCOM II - U.S. Navy SEALs (USA).iso`, 4,380,753,920 bytes) at `/`, handed
to the disc page's file input. Both open on Frostfire (MP2, the default map). A cell is the time from the origin, with
the step from the run's previous reached phase in brackets.

| phase | served #1 (ms) | served #2 (ms) | served #3 (ms) | ISO #1 (ms) | ISO #2 (ms) | ISO #3 (ms) |
|---|---|---|---|---|---|---|
| first byte | 56 | 17 | 12 | 10 | 7 | 6 |
| page start (the viewer's script) | 1255 (+1199) | 229 (+212) | 196 (+184) | 258 (+248) | 201 (+194) | 221 (+215) |
| the disc chosen | -- | -- | -- | 352 (+94) | 274 (+73) | 318 (+98) |
| the disc indexed | 4749 (+3494) | 347 (+118) | 300 (+104) | 447 (+95) | 367 (+93) | 448 (+130) |
| first Sony frame | OWED (sprint 12, BOOT-04) | OWED (sprint 12, BOOT-04) | OWED (sprint 12, BOOT-04) | OWED (sprint 12, BOOT-04) | OWED (sprint 12, BOOT-04) | OWED (sprint 12, BOOT-04) |
| main menu | OWED (sprint 11, MENU-02) | OWED (sprint 11, MENU-02) | OWED (sprint 11, MENU-02) | OWED (sprint 11, MENU-02) | OWED (sprint 11, MENU-02) | OWED (sprint 11, MENU-02) |
| lobby | OWED (sprint 17, ONL-16) | OWED (sprint 17, ONL-16) | OWED (sprint 17, ONL-16) | OWED (sprint 17, ONL-16) | OWED (sprint 17, ONL-16) | OWED (sprint 17, ONL-16) |
| the map's first frame | 6093 (+1344) | 1923 (+1577) | 1795 (+1494) | 1804 (+1357) | 1660 (+1293) | 1755 (+1307) |

The worker's own load of Frostfire (`stats().loadMs`): served 454, 292, 280 ms; ISO 277, 246, 290 ms.

## 3. What the numbers say, and what they do not

- **The first served run is Vite's, not the page's**: the dev server transforms every module on its first request
  (page start +1.2 s) and the worker's (the disc indexed +3.5 s). Runs 2-3 are the warm dev server. A production build
  (`npm run build`, served static) has no transform; it is not measured here.
- **The map's first frame is ~1.3-1.6 s after the index**, of which the worker's load is 0.25-0.45 s; the rest is the
  reveal: program links and uploads spread across frames (`scheduler.ts`'s header: the unspread first draw was 690 ms on
  Frostfire, 1,703 ms on Crossroads). Headless Chromium here draws with SwiftShader (software GL,
  `playwright.config.ts`), so the reveal's share is this host's CPU, not a GPU's; a headed run on the owner's machine is
  the number PLAT-29b's ruling should be read against.
- **The ISO is not slower than the served tree**: the worker lists the image's maps by range reads (`IsoAssetSource`; the
  page never reads the image whole), ~0.1 s for the full 4.38 GB image; the disc chosen sits ~70-100 ms after page start only
  because that is when the spec hands the file over (a player's own choice takes longer; the step after it is what the
  page costs).
- **No phase of the boot is timed**: the 30 s rule's scope (first menu or first map) is the owner's open call in
  PLAT-29b; PLAT-19c adds the movie decoder's start-up and size to this table.

## 4. Open

- The first Sony frame, the main menu and the lobby (§1): owed to sprints 12, 11 and 17.
- A run on the owner's machine with its GPU (headed), and against a production build: not run (this host's runs are the
  headless dev server's).
- The map's first frame is the world's last reveal slice entering the scene; the frame that then draws it follows within
  one animation frame. A mark on the presented frame itself (a `requestAnimationFrame` after the render) would be one
  frame later; not needed while no threshold exists.

## 5. 2026-10-02, PLAT-19c: the movie decoder's rows

PLAT-19c's block asks for the decoder's size and start-up in this table (`../roadmap/01-platform.md` "PLAT-19c";
measured in web research 120 §11, the dev host, headless Chromium, the lock FREE). They are not phases of `LOAD_PHASES`
(no mark is added; the boot's own rows -- the first Sony frame, the main menu -- stay owed to their tasks): they are what
those owed rows will contain.

| row | value | source |
|---|---|---|
| the decoder's size | 85,364 B raw; 23,835 B `gzip -9` (24,013 B by Node's zlib at level 9); no JS glue | research 120 §2, §11 |
| the decoder's fetch and compile in the page | fetch 2.4-6.9 ms from the dev server (one cold fetch of 101 ms in five runs); `WebAssembly.compile` 0.5-4.1 ms | research 120 §11 |
| a movie's start-up: the open to its first picture on screen | 82-97 ms, cold (worker started, wasm loaded) or warm alike; on the second 29.97 Hz tick after the build, where the console's is on the first (`MOVIE_FIRST_PICTURE_TICK_READING`) | research 120 §11 |
| the decoder's cost per picture, in its worker | mean 2.3-3.2 ms, p95 2.9-5.1 ms, worst 56.9 ms, of the tick's 33.4 ms; late ticks INTRO_2 0, 0, 1, 2, 0, 0 over six runs, SONY448 and MENULOOP 0 in five each (a host stall of about 40 ms can miss a tick; nothing dropped or repeated in any run) | research 120 §11 |

For the first Sony frame (BOOT-04's row): SONY448's first Sony-card picture is picture 11 (web research 98 §1), so that row will be the
boot's time to `dlgIntroCinematic`'s build, plus this start-up, plus 11 ticks (0.37 s at 29.97 Hz). The decoder's weight
in the 30 s rule is the owner's call with PLAT-29b's threshold.
