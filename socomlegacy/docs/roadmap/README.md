# The SOCOM Legacy roadmap: the mission backlog

**The mission** (the owner, 2026-10-01; the whole of it is [`../MISSION.md`](../MISSION.md)): a 1:1 "spiritual" port of
SOCOM U.S. Navy SEALs II (PS2, US) to three.js and TypeScript -- enough of Zipper Interactive's zEngine to run SOCOM II
in a browser, from the opening text and the intro movie, through the main menu, the options, the memory card and the
online feature, to the game itself. Every menu exactly as the original displays it and behaves; the memory card
simulated in browser storage; browser-impossible options still represented, opening a screen that says they are
"available in the desktop recompilation or with emulators". **Validation is our confidence measure**: every answer
derives from a source, and a task is done when a test holds it to the original.

**Scope ruling (the owner, 2026-10-01):** the single-player **campaign is skipped for now** for the web port. There are
no campaign tasks and no campaign segment; the desktop recompilation plays it. **The stopping point is ruled: option
(a)** (R1) -- NEW GAME and LOAD GAME go straight to the desktop-recompilation screen ("available in the desktop
recompilation or with emulators"; MENU-03). The single-player menus beyond them (reading (b), MENU-10..MENU-16) are not
built; they keep their ids as future scope at the end of [03-menus.md](03-menus.md).

**The owner's rulings of 2026-10-01** (the whole text: [`../MISSION.md`](../MISSION.md), "The owner's rulings of
2026-10-01"), carried into the tasks named:
- **R1** the campaign's stopping point is option (a) -- MENU-03; MENU-10..MENU-16 future scope; the first list's sprint
  15 folded into 14 (the number was refilled the same day with the card's data, at the two-seat revision).
- **R2** "except for multiplayer": the client is ported; the server and multiplayer are ours -- OC-0 / OWNER-SVC-0.
- **R3** movies: an open-source MPEG-2 decoder, libmpeg2 compiled to WebAssembly with our own PSS demuxer (a minimal
  LGPL FFmpeg wasm build the fallback), decoding client-side from the player's own ISO, validated frame-exact by the
  PLAT-19a spike before PLAT-19b -- PLAT-18, PLAT-19a/b/c, PLAT-20.
- ~~**R4** the card: IndexedDB, two slots, each a raw 8 MB PCSX2 `.ps2` image with ECC, atomic writes, a quota check and
  the original's failure dialog; the typed password never kept in the browser, an argon2id/scrypt hash on the server,
  and a revocable server-issued credential (>= 128 bits) in the card's `PASSWORD` field -- PLAT-24, PLAT-25, PLAT-37
  (new), PLAT-26, OPT-04, OPT-05c/f, OPT-07, OPT-08, ONL-06/07, SVC-03, SVC-04.~~ **Replaced by R7, 2026-10-01.**
- **R5** first person comes back (view state 1, reached by zooming in from third person); tap C crouch / hold C prone
  stays; the binoculars view (state 4) comes back as the original by the owner's yes the same day (built 2026-10-01,
  web research 84 §7) -- MATCH-04 (new), MATCH-03, OPT-11.
- **R6** the service shape (OC-7) is **(c)**: the online services are built inside the existing Node match server
  (`packages/server`), one operation per Medius request; no Medius server and no bridge to Horizon, to start -- SVC-01
  (web research 97 §8, the (c) column), SVC-03..SVC-23.
- **R7** the account and the card (replaces R4; [the spec](../specs/2026-10-01-web-r7-account-and-card-design.md)): a
  plain name and password as the original asks, an argon2id (or scrypt) hash on the server, no credential on the card
  and no revocation; the card two virtual slots in localStorage in our own JSON -- a file table with the original's
  names and nominal sizes (free space counted against the virtual 8 MB), an extension area `ext` for what the original
  never saved, a revision counter (another tab's save is the original's "card changed"); no `.ps2` images, no PCSX2
  import or export; every card state reachable, simulated; the save UI the original's word for word. **SAVE PASSWORD:
  YES keeps a server-issued remember token in an HttpOnly, Secure, SameSite cookie on the match server's host, never
  the password** (ruled the same day, "agreed on cookie"; it replaced the obfuscated record, his first pick); the
  persona record keeps SAVEPASSWORD and the password's length only.
  PLAT-27, PLAT-37 and OPT-08 are **dropped** (ids kept, blocks marked); PLAT-24 (the card on localStorage, the
  IndexedDB backend parked), PLAT-25 (rewritten), PLAT-26, OPT-01..OPT-04, OPT-05a..h, OPT-07, OPT-20, ONL-06/07,
  SVC-03 (shrunk), SVC-04, BOOT-05, MENU-04.

This backlog was compiled on 2026-10-01 from six read-only researcher reports (boot, menus, options, online front end,
online services, platform) and revised the same day against a 37-finding review (coverage, sourcing, buildability):
the dependency cycles were broken, the XL tasks split, segment 07 added, every scratch-read fact marked, and every
acceptance given a level reachable now. It was revised again the same day for the rulings above: two tasks added
(PLAT-37, MATCH-04), seven moved to future scope (MENU-10..MENU-16), PLAT-19a resized (S to M), and the map below
regenerated. R7 (the same day) dropped three M tasks -- the three dropped tasks are PLAT-27 (the card file codec,
merged at 1c20d326 before the ruling), PLAT-37 (the `.ps2` filesystem) and OPT-08 (export and import) -- which keep
their ids, marked "(dropped)"; the active backlog was then 147 tasks and 449 points (150 and 458 before), and the map
was regenerated again. On 2026-10-02 OT-0 wrote the online path's thirteen slices (OT.R6 of
[the online-path plan](../plans/2026-10-02-online-path-target.md)): the active backlog grew by thirteen tasks and 31
points, to 160 and 480 (147 and 449 before), and the map was regenerated. On 2026-10-07 the OT.R23 / OT.R24 voice
placement promoted ONL-16b, SVC-20c and MATCH-05, and resized the ruled Opus SVC-21 from L to M: the active backlog
grew from 160 tasks and 480 points to 163 and 483; the same day OT.R39 swapped SVC-20a's SVC-07 for
SVC-07a and cut SVC-22's OPT-10, and the map was regenerated. On 2026-10-09 (PROMOTE-155; the merge controller's word,
H86 answered by OT.R33 and H89 by OT.R32) seven proposed blocks of segment 06 were promoted -- SVC-12d, SVC-13a,
SVC-15a, SVC-23a, SVC-23b, SVC-23c and SVC-23d: the active backlog grew from 163 tasks and 483 points to 170 and 500,
and the map was regenerated. On 2026-10-10 (PROMOTE-22; sprint 22's adoption, the merge controller's word, W22.R5-R7 of
[its plan](../plans/2026-10-10-web-sprint-22-the-results-and-the-lobbys-text.md)) SVC-23e and PROVE-1 were promoted in
segment 06 and ONL-16 was re-sized from L to S: the active backlog went from 170 tasks and 500 points to 172 and 498,
and the map was regenerated. On 2026-10-11 (PROMOTE-18; sprint 18's adoption, the merge controller's word, W18.R1-R4 of
[its plan](../plans/2026-10-11-web-sprint-18-the-carried-and-the-players-pages.md)) ONL-30a and ONL-34 were promoted in segment 05, segment 06
gained SVC-12e (STATS-ONE), SVC-23f, SVC-23g (LEDGER-RESTORE) and SVC-23h (BOT-AIM) and gave the SEAT-TOLD block an id
(SVC-07c; under its bare name the graph had not read it), and ONL-30 was re-sized from M to S (its players' half is
ONL-30a, CLAN RANKING left): the active backlog went from 172 tasks and 498 points to 179 and 509, and the
map was regenerated. Later on 2026-10-11 (W18.R9: the owner's word on HUMAN_TASKS H178, relayed by the merge controller,
who added the task to sprint 18) segment 06 gained SVC-03a (REMEMBER-ROTATE, S, a slice of SVC-03): the active backlog
went from 179 tasks and 509 points to 180 and 510, and the map was regenerated. On 2026-10-29 (the owner's word in
the dispatch seat 04, "Active, next sprint") segment 01 gained PLAT-38 (the browser's video settings page, M, a
browser adaptation), placed in sprint 42: the active backlog went from 180 tasks and 510 points to 181 tasks and 513
points, and the map was regenerated. Duplicates across reports
were merged into one task in the segment that owns
the piece; each task's **Merged from** line names the draft ids it absorbed (draft ids are not stable and are cited
only there). **The ids in these files are stable**: a task that is dropped keeps its id with a note; a new task takes
the next number in its segment; a split task keeps its id with a letter (PLAT-19a/b/c).

**The order:** [`SPRINTS.md`](SPRINTS.md) groups these tasks into web sprints 6-24 and 42 (sprint 20 is the scoped voice implementation sprint) with each
sprint's seat, goal, validation gate, dependencies, owner needs and size, and the four owner windows beside them; every
active task below appears there once. **Two seats** (the owner, 2026-10-01): Craig's lane was the front end offline
(sprints 6, 7, 9, 11, 12, 13, 14), Chris's online end to end (15, 8, 10, 16-20). **[2026-10-02, OT.R7] The online
path** ([the plan](../plans/2026-10-02-online-path-target.md)): Craig's lane does the whole path from the main menu to
the match's start, for now -- sprints 8, 11, 16 and 17 after sprint 9 -- and every other sprint after 9 is parked
until the path runs (OT.R6); sprint 23 (after the start) is not assigned by the ruling. **[2026-10-07, OT.R39 and
OT.R40] Every roadmap sprint is Craig's**: the voice sprint (20) and then 15, 10, 22 and 18 run on the online track,
23 and then 19 on the gameplay track; only the offline front end's 21, 12, 13 and 14 stay parked, and Chris's seat
holds no roadmap sprint (his own contributions, integrated by the merge controller). SPRINTS.md, "The two seats".

## The segments

**The platform matrix** -- each subsystem, its package, its status and the test that holds it -- is
[`PLATFORM.md`](PLATFORM.md) (PLAT-01); PLAT-01's graph check holds the map below to the Dependencies lines.

| File | Prefix | Tasks | What it covers |
|---|---|---|---|
| [01-platform.md](01-platform.md) | PLAT | 40 (+2 dropped) | disc path, locale, the dialog runtime (loader, inventory, scripts, command table, valves, screens, input, clock, text, compositor, widgets, popups, keyboard), movies (demux, the MPEG-2 spike, decoder and performance, audio, player), streams and UI sounds, the card's store, slots and libmc (its filesystem PLAT-37 and codec PLAT-27 dropped by R7), the desktop-only screen, the capture harness, load budgets, the golden manifest, script traces, audio goldens, the trace window, the ARMORY fold, residual docs |
| [02-boot.md](02-boot.md) | BOOT | 12 | the reference captures, the loader's RAW screens, the Sony/Zipper cards, the intro shell, the boot card check, the main-menu hand-off, the attract loop, locale, hardware branches, relaunch dialogs, the r0004 patch path |
| [03-menus.md](03-menus.md) | MENU | 11 (+7 future scope) | the offline UI commands, the main menu, NEW GAME / LOAD GAME to the desktop-recompilation screen (ruled (a)), EXTRAS and its movies, jukebox and unlock viewers, the LAN item, the unplaced dialogs; future scope, not built: MENU-10..16 (reading (b): rank select, presets, the save prompt, LOAD GAME, mission selection, AOP movies, briefings and maps) |
| [04-options-memory-card.md](04-options-memory-card.md) | OPT | 28 (+1 dropped) | the options save, PersistentValves, persistence rules, personas on the card, the card script set and each card state (OPT-05a..h), card timing, managing the card (moving it, OPT-08, dropped by R7), every OPTIONS screen, the desktop-only hooks, applying options to the engine, the owed offline captures, the ARMORY's `WeapProfile` file |
| [05-online-front-end.md](05-online-front-end.md) | ONL | 40 | every online screen from LOGIN to the game lobby, loading, round and final screens, spectating, errors, chat panels, friends, ignore, clan pages, rankings, online music, the online reference set, the online dialogs read from the disc |
| [06-online-services.md](06-online-services.md) | SVC | 45 | the service shape, the Medius message map, accounts, persistence, server texts, rooms and the game list, the match bridge, clans, stats (arithmetic, offsets, record), the ladder, rank gates, player info, friends, ignore, lobby and in-game chat, voice floor and transport, codec, headset, moderation; and the proven-level harness for the results, PROVE-1, its own prefix (2026-10-10) |
| [07-match.md](07-match.md) | MATCH | 5 | the in-round START menu online, ABORT back to the lobby, the ledger of the round's open 1:1 gaps, first person restored |
| **Total** | | **181** (+7 future scope, +3 dropped) | |

Sizes: **S** <= 1 day, **M** 2-4 days, **L** about 1-2 weeks. **There is no XL**: an estimate above L means the task is
split before it is dispatched (PLAT-19, PLAT-29, OPT-05, SVC-12 and SVC-20 were split on 2026-10-01). By size, the 181
active tasks: 69 S, 85 M, 27 L (513 points at S = 1, M = 3, L = 7). *(180 tasks: 69 S, 84 M, 27 L, 510 points, until
PLAT-38, 2026-10-29 (the owner's word in the dispatch seat 04); 179 tasks: 68 S, 84 M, 27 L, 509 points, until
SVC-03a, 2026-10-11 (W18.R9); 172 tasks: 63 S, 82 M, 27 L, 498 points, until sprint 18's adoption, 2026-10-11; 170 tasks: 61 S, 81 M, 28 L, 500 points, until sprint 22's adoption, 2026-10-10; 163 tasks: 59 S, 76 M, 28 L, 483 points,
until the seven promoted blocks of segment 06, 2026-10-09; 147 tasks: 50 S, 70 M, 27 L, 449 points, until OT-0's
thirteen path slices, 2026-10-02: below.)*

## Conventions

- **Paths without a prefix** are relative to the recompilation project's root (`C:/Projects/socom_pc`, the main tree;
  some notes, e.g. `docs/research/77-80`, are newer than this branch). `socomlegacy/...` paths are this project's.
- **"s5"** marks files that came from the sprint-5 branch `agent/web-s5`. They are **merged on this branch** (the merge
  `4c6cf5e8`, an ancestor of this backlog's commit), so tasks building on them (`uiScript.ts`, `armoryState.ts`,
  `armory*.ts`, S1's `'bias'` UI-model path) find their "Today" here and are dispatchable. Sprint 5 itself is still
  open (its plan's Log: the owner's 2026-10-01 play-test defects); the tasks that change the ARMORY's own code (PLAT-34,
  ONL-17, OPT-20's key retirement) wait for its close.
- **`D:Lnnn`** is a line of `game/analysis/socom2_game.elf.decomp.c` (r0001, read by line ranges, git-ignored);
  **`SCUS Lnnn`** a line of `game/analysis/SCUS_972.75.decomp.c`; **`S:0xADDR`** a string in
  `socom2_game.elf.strings.txt`; **`FUN_<addr>`** a decomp function; **`0xADDR`** alone a function address from
  `recomp/socom2_names.csv`.
- **"PC research NN"** is `docs/research/NN-*.md` of the recompilation project; **"web research NN"** / **R91**, **R95**
  is `socomlegacy/docs/research/NN-*.md`. Note there are two PC research 80s: `80-persona-card-format.md` and
  `80-online-menus-harness-scope.md`; tasks name which.
- **KNOWN rows are cited by key**, never by line number (`docs/KNOWN.md` is a living document; its line numbers differ
  between the main tree and this branch already). `KNOWN [key]` names the row of the main tree's `docs/KNOWN.md` whose
  bold title begins with the words below; KNOWN wins any disagreement.

  | Key | The row's bold title begins |
  |---|---|
  | `logoff-relaunch` | "The online logoff restarts the game in-process" (2026-09-29) |
  | `persona-headless` | "The game reads a persona the launcher's headless creator wrote" (2026-09-29) |
  | `persona-decoded` | "The card's persona file is decoded" (2026-09-28) |
  | `r0004-path` | "PSRewired serves the r0004 package at one fixed path" (2026-09-27) |
  | `r0004-rebuild` | "r0004 is a real rebuild" (2026-09-23) |
  | `r0004-dnas` | "PSRewired's r0004 patch is a DNAS bypass" (2026-09-23) |
  | `989snd-decomp` | "The real 989snd decompilation (Ziemas ...) overturned the still-playing model" |
  | `personas-per-server` | "The game keeps saved online personas per server" |
  | `mission-music` | "Missions are meant to have music" |
  | `card-folder` | "An empty or missing card folder is an inserted, formatted, empty PS2 card" |
  | `virgin-save` | "The first save on a virgin memory card fails" (settled 2026-09-22) |
  | `online-7pct` | "The console draws the online screens ~7% narrower than ours" |
  | `lobby-music-once` | "SOCOM Online's lobby music plays once and stops" |
  | `online-music-94` | "The music on the SOCOM II online screens ... is wrong" (socom-unzipped#94) |
  | `chat-recv-wrap` | "A received chat line does not pass through the client's chat receive wrap" (socom-unzipped#26) |
  | `raw-strips` | "The streamed full-screen image path puts every strip at its own DBP" (socom-unzipped#31) |
  | `voice-headset` | "Voice: the headset path, as far as it is proven" (2026-09-19) |
  | `s8-review` | "Sprint 8 branch review, filed for later" (its item (d)) |
  | `stray-oneshots` | "The stray sound on the online screens is bank 0x00a00000's one-shots" |
  | `title-four-captures` | "The title stage quietly lost four captures" (settled 2026-09-25) |

- **Captures** (`logs/parity/**`, `D:/socom_archive/parity/**`, `scripts/parity/refs/*`) stay outside this project's
  tree; nothing here copies disc bytes, images or long disc strings ("no game data in git").
- Every task block has: ID, title, goal, what the original does (cited), today (paths) and the gap, acceptance (how it
  is validated against the original), **Proven by** (when the proven level needs a run), dependencies, size, unknowns
  (and what settles each), owner calls, merged from. **An unsourced detail is an explicit unknown, never a fact.**
- **Scratch reads are marked.** A fact read once by a script that is in neither tree is written **reading (scratch
  read; regenerated by PLAT-06)**, with the disc member and the repo reader it was read with; PLAT-06 re-derives each
  one in a committed note and test, and every task standing on one depends on PLAT-06.
- **Two acceptance levels.** Each acceptance names a **reading** level reachable now -- unit tests transcribed from the
  cited decomp lines, and the archived captures, logs and cards -- and, where a new run is needed, a **proven** level.
  The run's capture or trace task is named on the task's **Proven by** line: BOOT-01 (boot captures), OPT-19 (menus,
  options and card captures), ONL-32 (online captures and Medius transcripts), PLAT-36 (recomp traces: RDRAM dumps,
  call traces, MPEG, audio and 989snd logs, MC traces, PEEKs, input traces), PLAT-32 (UI script traces). A task may be
  dispatched and reach "reading" before its Proven-by task runs; each capture task lists every need, so one window
  covers its segment.
- **CI and the dev disc.** A test that reads the disc, the ELF, `logs/`, `D:/socom_archive` or ffmpeg is dev-disc-only
  and skipped where the disc is absent (the gate runs locally, OT.R15; only RS.R8's small committed tier is in git, H71); each task's acceptance says which of its tests are. Tests on synthetic
  fixtures built inside the test, and tests over the docs, run in the local gate (OT.R15).
- **Dependencies** list prerequisites only, and **the task line is authoritative**: the map below is generated from the
  lines and PLAT-01's check fails when the two differ or a cycle appears. A future-scope block (MENU-10..MENU-16, by R1)
  keeps its id and writes **Dependencies (if reopened)**: it is in no map and no sprint, and no active task may name it.
  **A dropped task** (PLAT-27, PLAT-37 and OPT-08, by R7) keeps its id too: its title begins "(dropped)", a
  **Dropped:** line names the ruling and says what became of the work, and it writes **Dependencies (if reopened)**;
  like a future-scope block it is in no map and no sprint, no active task may name it, and the segment table counts it
  apart ("+N dropped"). A note about what comes after a task is written after its size as **Then:**. Three rules keep
  the graph one-directional: (1) the generic piece before its client (the zAnim runtime takes a host interface before
  the command table fills it; the screen manager before input; the capture harness before any screen; PLAT-32's traces
  raise tasks to proven and are never their dependency); (2) the screen before its hook (each OPTIONS screen before its
  desktop-only hook; the intro shell before the card check and the hardware branches, which replace its cited stubs;
  CREATE GAME before the play list; the game lobby before its ARMORY row; the main menu before the boot hand-off into
  it; chat before the ignore filter; the persona records before the persona screens; the stats record before the match
  bridge); (3) the budget table before the movie decoder's budget, the threshold after both.

## The cross-segment dependency map

Generated from the **Dependencies** lines (2026-10-01, re-run after the owner's rulings, and again after R7 dropped
PLAT-27, PLAT-37 and OPT-08 and re-pointed their dependents to PLAT-25 and PLAT-26; regenerated 2026-10-02 after
OT-0's online-path slices, and again the same day when OT.R11 pointed BOOT-06 at MENU-02a -- BOOT-06 L9 -> L8, BOOT-07
L10 -> L9; regenerated 2026-10-07 when OT.R39 pointed SVC-20a at SVC-07a and cut SVC-22's OPT-10 -- SVC-20a L6 -> L5,
SVC-22 L10 -> L7, ONL-16b L11 -> L8, MATCH-05 L11 -> L9; regenerated 2026-10-09 for the seven promoted blocks of
segment 06 -- SVC-13a L0, SVC-23c L3, SVC-15a L4, SVC-12d and SVC-23d L5, SVC-23a and SVC-23b L7, and with them
SVC-15 L4 -> L5, SVC-07 L5 -> L6, ONL-30 L5 -> L6; regenerated 2026-10-10 for sprint 22's adoption -- SVC-23e L6,
PROVE-1 L7, no other layer moved; regenerated 2026-10-11 for sprint 18's adoption -- SVC-12e L2, SVC-07c and SVC-23f
L7, ONL-30a, SVC-23g and SVC-23h L8, ONL-34 L9, and ONL-30 L6 -> L13 (it now stands on ONL-30a and SVC-11); regenerated
again the same day for SVC-03a (W18.R9) -- SVC-03a L3, no other layer moved; regenerated 2026-10-29 for PLAT-38 --
PLAT-38 L0, no other layer moved): each task sits one layer
above its deepest prerequisite, so everything in a layer can be dispatched once the layers above it are done. Layer 0
has no prerequisites.

```
  L0  BOOT-01 BOOT-03 MATCH-03 MATCH-04 ONL-05 ONL-32 OPT-19 PLAT-01 PLAT-02 PLAT-03 PLAT-09 PLAT-19a PLAT-24 PLAT-35
      PLAT-36 PLAT-38 SVC-01 SVC-02 SVC-12a SVC-13a
  L1  PLAT-04 PLAT-06 PLAT-18 PLAT-25 PLAT-29a PLAT-30 SVC-04 SVC-12b
  L2  MENU-09 ONL-01a ONL-33 OPT-02 PLAT-05 PLAT-19b PLAT-26a PLAT-31 SVC-03 SVC-05 SVC-12c SVC-12e
  L3  ONL-08 OPT-04a OPT-20 PLAT-07 PLAT-13 PLAT-19c PLAT-20 PLAT-26 SVC-03a SVC-06 SVC-08 SVC-09a SVC-13 SVC-16
      SVC-23c
  L4  ONL-15 ONL-19 OPT-01 PLAT-08 PLAT-12 PLAT-14 PLAT-21 PLAT-29b PLAT-32 SVC-07a SVC-09 SVC-14a SVC-15a
  L5  BOOT-02 ONL-11 OPT-03 OPT-04 PLAT-10 PLAT-15 PLAT-22 PLAT-23 PLAT-34 SVC-10 SVC-12d SVC-14 SVC-15 SVC-20a SVC-23d
  L6  BOOT-04 BOOT-11 MENU-01a ONL-03 ONL-18 ONL-23a ONL-31 PLAT-11 PLAT-16 PLAT-33 SVC-07 SVC-23e
  L7  BOOT-08 BOOT-10a MENU-01 MENU-02a ONL-04 ONL-09 ONL-12 ONL-16a OPT-05i PLAT-17 PLAT-28 PROVE-1 SVC-07c SVC-20b
      SVC-22 SVC-23a SVC-23b SVC-23f
  L8  BOOT-06 BOOT-10 MENU-02 MENU-03 MENU-04 MENU-08 ONL-01 ONL-06 ONL-10 ONL-13 ONL-16b ONL-17 ONL-20 ONL-21 ONL-22a
      ONL-24 ONL-26 ONL-29 ONL-30a OPT-05a OPT-09 OPT-15 SVC-18 SVC-20c SVC-21 SVC-23g SVC-23h
  L9  BOOT-05 BOOT-07 MATCH-01 MATCH-05 MENU-05 MENU-06 MENU-07 ONL-02 ONL-07 ONL-14 ONL-27 ONL-28 ONL-34 OPT-05b
      OPT-05c OPT-05d OPT-05e OPT-05f OPT-05g OPT-05h OPT-06 OPT-07 OPT-10 OPT-11 OPT-13 OPT-14 OPT-16 SVC-17 SVC-19
      SVC-23
 L10  BOOT-09 ONL-23 ONL-25 OPT-12 OPT-17
 L11  ONL-16 OPT-18
 L12  ONL-22 SVC-11
 L13  MATCH-02 ONL-30
```

Layer 0 includes the four capture and trace windows (BOOT-01, OPT-19, ONL-32, PLAT-36): they need only an owner
window, and no task waits on them to be dispatched (they are named on **Proven by** lines, not as dependencies). It
also holds MATCH-04 (first person), which touches only the round's existing code.

**Critical path to the first 1:1 screen (the main menu), reading level:** PLAT-01 and PLAT-02 first; PLAT-30 (the
capture harness, needing only a 640x448 page) early, so every BOOT, MENU and OPT acceptance can be scored from the
start; then PLAT-03 -> PLAT-06 -> PLAT-05 -> PLAT-07 (with PLAT-09) -> PLAT-08 -> PLAT-10 -> MENU-01 -> MENU-02, with
PLAT-11..PLAT-16, PLAT-18 and PLAT-21 (the MENULOOP background drawn black, the region masked by PLAT-30's rule),
PLAT-22/23 and PLAT-25 alongside; BOOT-06 hands off into it. The movie decoder is not on this path: PLAT-19a (an M
spike that builds the ruled libmpeg2 -> wasm decoder and proves it frame-exact, R3) gates PLAT-19b, and PLAT-19b/19c
lift the menu to the unmasked, proven level.

## Shared unknowns (open questions across segments)

What is not known, and what would settle it. Segment-only unknowns are in each task.

1. **Sony and Zipper opening cards: movie frames or TEXT objects** (BOOT-03) -- an offline decode of SONY448 against
   `pcsx2_mission_a/s02..s04`. **Answered 2026-10-01 (web research 98 §1): movie frames.** Both cards are SONY448.PSS
   pictures -- the file's own pictures carry the text -- and `dlgIntroScreen.rdr` has no objects (§3); every distinct
   capture of the ten boot runs matches a picture (100.0 under the gate's scorer, where black also scores 97-100; on
   the bright frames, s02 and s04, 94.6-99.9 on the text box where black scores 82-85). [Corrected 2026-10-01 after
   review: said "every distinct capture >= 95, and 95.8-99.9 on the text box where black scores 82-85", over five runs
   and without the bright-frame qualifier.] Kept, answered, so the unknowns keep their numbers.
2. **The IPU colour conversion vs libavcodec's BT.601, and libmpeg2's samples vs libavcodec's** (PLAT-19a) -- one PCSX2
   movie frame under both conversions; the per-picture comparison. (Whether a browser API decodes MPEG-2 is answered:
   none does, WebCodecs has no MPEG-2; R3 rules a wasm decoder.) **The conversion half answered 2026-10-01 (web
   research 98 §7.4): the IPU's** -- PCSX2's integers reproduce the SONY448 and main-menu captures exactly at 66-86 %
   of the pixels, BT.601 at 2-12 %; the gate's whole-frame score cannot tell them apart. **The samples half answered
   the same day (§7.9):** libmpeg2 -> wasm shows every coded picture once and in order (research 98 §7.8) and is within max 3 / per-picture mean 0.015
   of libavcodec's samples, a difference attributed to the two IDCTs (not proven: no libavcodec IDCT reproduces
   libmpeg2's) [corrected after review: said "the two IDCTs' difference"]. [Corrected 2026-10-01: said "the samples half is open: the
   libmpeg2 build waits on its source".]
3. **The UI binding table: what `fn2` is, and the bodies of ~45 offline commands** (PLAT-08, MENU-01) -- one decomp
   read per command; for `fn2`, a search of the code for 0x3dd4dc (`FUN_002745a0` calls only +8). The row count is
   settled by PLAT-06: 207 rows, then an all-zero row (web R96 §4).
4. **The readers of MENU, LISTBOX, CHECKBOX, RADIOSTRIP, MAPCONTROL; the slider step** (`NUM_INTERVALS` 2 vs ~5 px per
   press captured) (PLAT-05, PLAT-15, OPT-10) -- decomp reads from D:L277921.
5. **zAnim in-frame order and condition precedence; menu history semantics; fade timing; the UI tick rate** (PLAT-07,
   PLAT-10, PLAT-12) -- `FUN_0025e960`, `FUN_0027e720`, `uianim.rdr` now; PLAT-32's traces for the proven level.
6. **Default focus navigation, d-pad repeat, stick in menus** (PLAT-11) -- `CMenuState_Tick` reads and PCSX2 bursts.
7. **`UIMemCardAnim.rdr`'s branches; the boot slot-select condition; the error-code -> message table; the corrupt-file
   path; "unformatted" reachability** (BOOT-05, OPT-05a..h) -- decode the set (OPT-05a); PCSX2 with a fresh `.ps2`.
8. **Whether volumes, brightness and stick sliders persist across a power cycle** (OPT-03) -- one recomp
   save-and-relaunch with a card diff. The source reading says no.
9. **The PersistentValves VAL encoding and its fixed 4,144 B** (OPT-02) -- the serialize read plus a two-card diff.
   *(R7, 2026-10-01: no task needs it any more -- the browser keeps the valves as JSON; it stays open as research.)*
10. **Which stream plays `MUS_MENU_THEME` vs the MENULOOP PCM, and `MUS_ONLINE_MENU`; how CallMusic maps names; where
    `.TCM_SLIDE`/`.METAL` resolve with TCM_ECHO absent; the title ring's -4..-6.5 dB** (PLAT-20, PLAT-22, PLAT-23) -- a
    recomp audio and 989snd trace across the main and online menus (PLAT-36).
11. **The attract: the idle constant, its origin, its exit, whether movies rotate** (BOOT-07). The two numbers on record
    agree: 114.4-114.7 s from s00, the settled menu (PC research 64), and 149 - 28 = ~121 s from MENULOOP's creation
    (PC research 09 L77-80); the ~7 s between them is the time from MENULOOP's creation to the settled menu. What is
    unknown is the exact constant and which event starts the timer -- decode UiAttractMode; a long idle capture or
    `PS2X_MPEG_TRACE`.
12. **The DNAS screen's visibility under the bypass** (ONL-03) -- a 1 frame/s recomp capture LOGIN -> UNIVERSE.
13. **The client's full Medius request inventory, the action -> message-id map, GameStats and the 256-byte stats blob's
    fields** (SVC-01, SVC-02, SVC-06, SVC-12a/b) -- the inventory and the action -> id map are read (web research 97
    §1-§2: the `DAT_00686xxx` slots are BSS, so the ids come from `FUN_0064db00`'s registration order, not a `.data`
    read as this line said; 0x00, 0x01, 0x11 and 0xce are proven by the s4 slice); GameStats and the blob's fields are still
    open; ONL-32's local-stack transcripts for the proven level.
14. **How the ladder rating changes; the clan rating; the clan member cap; list caps** (SVC-09, SVC-11, SVC-13) -- the
    client writers of 0x66a754 can be read; the server rules are **unobservable** and fall to owner calls.
15. **The buddy-confirmation protocol** (SVC-16) -- SVC-02.
16. **The game-lobby chat receive function and MLS vs DME** (SVC-18) -- a trace from the game-room side.
17. **Voice: implementation and remaining proof** (SVC-20a/b/c, SVC-21/22, ONL-16b, MATCH-05) -- the routing,
    floor timing, team/dead/spectator channels and talk UI are sourced; browser voice is scoped in sprint 20 with
    relayed 8 kHz / 6 kbit/s Opus. Remaining proof is the two-instance original/recomp run, plus the named H87 browser
    adaptation calls; Q5 is no longer an implementation dependency.
18. **The game-lobby countdown's start condition** (ONL-16) -- `A_ready006` contradicts web R91 §18.4; a two-instance
    capture with ready states logged.
19. **Pixel formats and hold times of the loader's RAW screens; what the PU*.RAW images are** (BOOT-02, BOOT-11) --
    `FUN_001c6570` (SCUS L44009+) and BOOT-01 captures.
20. **The IndexedDB quota and eviction for two 8.6 MB card images** (PLAT-25) -- a measurement on the target browsers.
    **Closed by R7 (2026-10-01):** the card is two small JSON records in localStorage, counted against the virtual
    8 MB card, not the browser's quota. (It was measured before the ruling, in Chromium 153 only: two slots 18.06 MB
    against a quota of about 6.44 GB; the sprint 6 plan's Log.)
21. **Where valve defaults come from** (PLAT-09) -- the valve registry init.
22. **Whether `D:/socom_archive/parity/netcfg1..7` are PCSX2 or ours** (ONL-01) -- the run logs beside them.
23. **Which rows the online START menu shows, and where ABORT lands online** (MATCH-01, MATCH-02) -- the row-table
    builder's read and ONL-32's recomp online round with START pressed.
    **Answered by the reads (2026-10-13, web sprint 18; web research 266 §8.2-§8.3, §8.10.2):** the menu is code-drawn;
    online, a player's rows are RESUME, ABORT, INVERT PITCH, VOICE MODULATION, RUN AND TALK, VIBRATION,
    FIREMODE/SCOREBOARD, IN-GAME TEXT MESSAGES (a spectator's without the two voice rows and with SPECTATOR HUD);
    ABORT lands in SOCOM II ONLINE through `dlgNetAbort.rdr`. The frames stay ONL-32's capture.
24. **What GetInfo reports as free on a `.ps2` image** (PLAT-26, PLAT-37) -- the recomp's stub says 8000 on an empty
    card; a formatted image has 8,135 allocatable clusters; a PCSX2 run's answer (OPT-19). **Closed by R7
    (2026-10-01):** there is no image (PLAT-37 dropped); free space is counted against the virtual 8 MB card by
    nominal sizes, and the stub's 8000 stands (PLAT-25, PLAT-26).
25. **How the login form draws a card credential longer than the keyboard's 12-character password cap** (OPT-04,
    ONL-06) -- the form's draw read and a local-stack recomp run (ONL-32). **Closed by R7 (2026-10-01):** there is no
    credential on the card; the password is the player's, within the keyboard's cap of 12, and a saved persona's
    masked row is drawn from the password's length the record keeps (the remember token lives in a cookie).
26. **Where the first-person camera sits on the body** (MATCH-04) -- the camera path for states 1-3 and a recomp frame
    (PLAT-36).
27. **Whether Safari caps the remember-token cookie at about a week** when the match server's host resolves to another
    network than the site's (SVC-03; R7's §7 item 5) -- a check on the deployed hosts before the cookie is relied on.

## The owner's calls

Collected from every segment; the task that carries each is named. Until ruled, each task follows the original or
stops at the call; where a default is named, the docs follow it until the ruling. **Ruled** marks a call the owner
settled on 2026-10-01 (R1-R7 above); it stays listed so the trail is kept.

**The mission readings**
- **OC-0 / OWNER-SVC-0 / MENU-OC-1 -- ruled (R2):** "all of SOCOM 2 except for multiplayer" with the full online front
  end means *the client is ported; the server and multiplayer are ours*. (MISSION.md; SVC-01)
- **The campaign stopping point (MENU-OC-3) -- ruled (a) (R1):** the desktop screen at CROSS on NEW GAME / LOAD GAME
  (MENU-03 alone, S). Reading (b), the chain drawn up to the mission load (MENU-10..MENU-16, about three to four
  weeks), is not built; its group is future scope, reopened only by the owner.
- **MENU-OC-4:** whether ONLINE on the main menu routes to segment 05's flow from the first release (MENU-02).
  **Answered [2026-10-02, OT.R1]:** "Main menu -> Online -> traditional UI flow" (the owner); the online path is the
  target ([the online-path plan](../plans/2026-10-02-online-path-target.md)).
- **MENU-OC-2:** record that web research 71's "simplified and improved" menus are superseded (done in MISSION.md;
  confirm the wording).
- **Earlier PC-over-console rulings -- first person and C ruled (R5):** first person comes back (MATCH-04); tap C
  crouch / hold C prone stays; **the binoculars view** (state 4) comes back as the original (the owner's yes,
  2026-10-01): an unscoped weapon zooms on from first person into it (MATCH-03, MATCH-04). Still open: **the Explore
  camera**. HEAD BOB (OPT-11) acts on the restored first person.
- **The map viewer:** does it remain a separate product beside the front end? (PLAT-10)
- **The 30 s load budget:** which phase it covers; may menu movies stream while assets load? (PLAT-29b)

**Browser-impossible features and the desktop-only screen**
- **The screen's look and wording** (PLAT-28); the PS2 BIOS out of scope (BOOT-09).
- **Per feature:** HDD (OPT-16, MENU-OC-6), EDIT NETWORK CONFIGURATIONS (ONL-02), 480p (OPT-11, MENU-OC-8), Dolby Pro
  Logic II and HEADSET VOLUME (OPT-10, MENU-OC-7), vibration (OPT-13 and MATCH-01, MENU-OC-9), LAN (MENU-08,
  MENU-OC-5). **[2026-10-02, OT.R5]:** the LAN item, OPTIONS and EXTRAS open the screen while the LAN plan and those
  screens are parked (MENU-08, MENU-03).
- **Loader screens' hold time** in a browser with no IRX loads (BOOT-02).

**Movies**
- **The MPEG-2 decoder's source and licence, decoding the disc vs pre-transcoding -- ruled (R3):** libmpeg2 -> wasm
  (FFmpeg wasm the fallback), GPL-3.0-compatible, decoded client-side from the player's ISO, never pre-transcoded
  (PLAT-19a). Open: its weight in the budget (PLAT-19c).
- **Extras movies** (`TUT_*`, `*_AOP`, `ARTGALL2`, `MUSVID`, `CREDITS`): front end or campaign? (MENU-05)

**The memory card**
- **Storage medium -- ruled (R7, replacing R4):** two virtual card slots in **localStorage** in our own JSON (a file
  table with the original's names and nominal sizes, `ext`, a revision counter), one `setItem` per save (PLAT-24,
  PLAT-25). *(R4 had ruled IndexedDB, each slot a raw 8 MB `.ps2` image with ECC, atomic writes and a quota check;
  PLAT-37, the image's filesystem, is dropped, and asking for persistent storage goes with the quota.)* Migrating
  today's keys: **ruled migrate** (W6.R5; the ARMORY key by OPT-20, the MP name by OPT-04).
- **One slot or two -- ruled two (R4; kept by R7).** **What a browser without storage reads as -- no card** in both
  slots (OPT-05b): the controller's default under R7, the owner may overturn it (OPT-07). Open: a player-facing
  insert/remove/format control, or only the developer hook (OPT-07).
- **Import/export -- ruled out (R7, replacing R4's "ruled in"):** no `.ps2` images, no PCSX2 import or export, no
  file export of any kind; OPT-08 is dropped and its export-warning call with it. The card codec's readers stay as a
  dev tool under `tools/` (no task).
- **Plain passwords in browser storage -- ruled out again (R7, replacing R4's credential):** a plain name and password
  as the original asks; an argon2id/scrypt hash on the server; no credential on the card and no revocation screen
  (SVC-03), so R4's open calls (who may revoke, a credential's lifetime) go. **SAVE PASSWORD: YES -- ruled** (R7's §7
  item 5, "agreed on cookie"): a server-issued remember token in an HttpOnly, Secure, SameSite cookie on the match
  server's host, never the password; the persona record keeps SAVEPASSWORD: YES and the password's length (the masked
  row), never the password or the token; the server keeps only the token's hash, expires an unused token and drops a
  persona's tokens on a password change; SAVE PASSWORD: NO stores nothing (OPT-04, SVC-03, ONL-06). One accepted
  deviation: a saved password cannot be edited character by character (the keyboard on that row starts empty). The
  controller's default, which the owner may overturn: where the hosting cannot carry the cookie, YES behaves as NO.
  *(Until the same day this call read "ruled out (R4): a server-issued, revocable credential on the card"; the
  owner's first R7 pick, the password kept obfuscated in the persona record, was replaced by the cookie.)* Open: the
  token's idle lifetime and the login attempt limit's numbers (SVC-03).
- **Card timing:** PCSX2's or the recomp's (instant) (OPT-06).
- **Extras unlocks without a campaign:** an imported card, or the fresh-card state (MENU-04, MENU-OC-11). *(R7: there
  is no import; the call is the fresh-card state or another way the owner names.)*

**Options and input**
- **Keyboard bindings for menus** (PLAT-11); physical-keyboard typing on soft keyboards (PLAT-17).
- **Presets and stick sliders on keyboard and mouse; whether redotcom's own look settings stay** (OPT-13, OPT-14,
  OPT-18).
- **Screen adjust as a canvas shift** (OPT-12).
- **Where TEAMMATE NAMES lives** (OPT-15).

**Online**
- **OC-1:** the network configuration on the login screen -- mirror the recomp or the console (ONL-01). **Ruled
  [2026-10-02, OT.R3]: the console's way** -- a saved configuration on the virtual card naming our central server
  (ONL-01a); the settings behind it not built (ONL-02).
- **OC-2:** r0001 or r0004 (the patch prompt, the loader's card-patch path) (ONL-05, BOOT-11).
- **OC-3:** the persona HOST value (ONL-06, OPT-04).
- **SAVE PASSWORD: YES (R7, 2026-10-01) -- ruled:** a remember token in an HttpOnly cookie on the match server's host,
  never the password ("The memory card" above; SVC-03, OPT-04, ONL-06). Open: the token's idle lifetime; the login
  attempt limit's numbers (SVC-03).
- **OC-4:** the room set (ONL-11, SVC-06).
- **OC-5:** the existing SOCOM Legacy lobby rulings (10 s countdown, idle kick, 16-player queue) vs the original's 30 s
  READY gate and host launch (ONL-16).
- **OC-6 -- ruled (OT.R23 / OT.R24):** browser-microphone voice now, relayed by the match server; Opus narrowband,
  mono 8 kHz at 6 kbit/s to start. H87 keeps the remaining browser-adaptation calls and their defaults (mic notice,
  listen-only, keyboard key and modulation approximation).
- **OC-7 -- ruled (c) (R6, 2026-10-01):** the service shape is a native mirror of the Medius operations inside the
  existing match server (`packages/server`); no Medius server, no bridge to our Horizon, and so no lobby cross-play
  with the desktop and PCSX2 players, to start (SVC-01). *(Until the ruling this line read: "the service shape
  (Medius bridge to our Horizon, or a native mirror) and cross-play".)*
- **Deploying the service, and any connection from it to the hosted Horizon** (SVC-01, SVC-04): the owner's hand,
  never a task's (CLAUDE.md boundaries; R293 for any server not ours).
- **Server data:** the host box, retention, migrating the hosted Horizon's accounts (SVC-04); our universe name, news,
  agreement and announcements (SVC-05, ONL-04, ONL-08).
- **Server-side rules the original hides:** the clan cap (SVC-09), the clan and ladder rating formulas (SVC-11, SVC-13),
  who posts the stats (SVC-07), the ban scope, a chat filter, the idle kick (SVC-23), registration name rules (ONL-07).

**Windows and main-project work**
- **Game-run windows** for the captures and traces: BOOT-01 (boot), OPT-19 (menus, options, card), ONL-32 (online,
  including MATCH-01/02 and OPT-20's card), PLAT-36 (recomp traces) -- lock-bound; the owner's rows H24-H27 in
  [`../HUMAN_TASKS.md`](../HUMAN_TASKS.md#4-the-four-game-run-windows). Each lists every need its segment's **Proven by**
  lines name.
- **A recomp tracing flag** for the zAnim dispatcher and VALVE (PLAT-32).

## Future scope: the campaign

Not tasks, recorded so nothing is lost (the desktop recompilation plays all of it today). **Marked "(b)"**: the
reading (b) dialogs, kept with their research as the future-scope blocks MENU-10..MENU-16 at the end of
[03-menus.md](03-menus.md) (ids stable; R1 ruled (a), so none is built). A campaign segment would need all of it:
- (b) the new-game chain: `dlgSelectRank` -- ENSIGN / LIEUTENANT / COMMANDER, `s4_pcsx2/A_03.png` (MENU-10) -- and
  `dlgControllerPresetsNewGame`/`-CS`/`-RG` (MENU-11); the new game's save prompt (MENU-12);
- (b) campaign navigation: `dlgMISSIONSELECTION` and the four `dlg_areaop_*` (MENU-14), the four AOP cinematics with
  `SetFirstMission` m51/m61/m71/m81 (MENU-15), the twelve `dlg_Brief_*`, the twelve `dlg_Map*` -- the only MAPCONTROL
  users -- and the four `Common_*` includes with `Common_Brief_Anims`, `Common_AOP_Anim`, `ObjectiveDisplayAnim`
  (MENU-16);
- (b) the LOAD GAME list (`ListSavedGames` 0x2801c0, `LoadSavedGame` 0x27fa40; prompts `_1359`-`_1364`) and reading
  `SaveGame<n>` MissionData for it (MENU-13); loading a saved game into a mission stays out;
- the end-of-mission and single-player armory screens (`dlgCareerStats`, `dlgDebriefing`, `dlgGameComplete` ->
  credits, `dlg_equipment_main`); `SaveSavedGame` 0x27f820 and real MissionData (career stats, bonus objectives);
- the in-game pause menu's **campaign rows** only -- REPLAY MISSION ("to replay the mission?") and HELP (PC research 78
  §1 run `ingame1`; reCOM `hud_pausemenu.cpp`). The menu itself, with its online rows, is MATCH-01;
- the campaign valves' meaning (GameComplete, `incr_miss_*`, `Set<char>`, `MissNNStats`), the HELP WINDOWS pop-ups; the
  mission movies (`RUN/MOVIES/M51..M83/*`) with `mpeg_subtitles.rdr`; `RECO/ENU` voice recognition; and the
  single-player game itself (AI, mission scripts, objectives), which SOCOM Legacy has never had.

The platform built here -- the dialog runtime, the movie player, the card (two virtual slots and libmc over their file
table) and, as a dev tool under `tools/`, a reader of game-written card files -- R7, 2026-10-01: this read 'the card
codec (which already round-trips SaveGame files)'; R7 deleted the writers, so nothing round-trips them now -- and the
desktop-only screen -- is what it would stand on.

## Corrections found on the way

For the controller to carry into the documents they concern (none was edited here). *(Carried 2026-10-01 by PLAT-35:
each item says where; an item that concerns a document of the PC project is left to it -- the web project does not edit
the repository's own docs -- and is handed on as [the owner's row H42](../HUMAN_TASKS.md#8-for-the-pc-project).)*

1. Web research 91 §18 "UI assets": `dlgMultiplayerRound`, `dlgMultiplayerFinal` and `dlgMultiplayerFinalReally` are on
   the full disc in `RUN/UI/READERX.ZAR`, and the splash library is in `RUN/COMMON/SPLA_*.ZED`; "not on the handoff disc"
   holds for the subset only (ONL-20). **Carried:** research 91 §18 "UI assets", marked in place.
2. Web research 91 §18.4 calls `A_ready006` "both ready (green)"; the frame shows one green dot and one red (ONL-16).
   **Carried:** research 91 §18.4's row, marked in place (the frame re-read: green beside the SEAL, red beside the
   Terrorist).
3. The hosted Horizon's "Alpha..Delta" rooms are server-invented, not original (ONL-11). **Carried:** no web document
   says otherwise; 05 N8, SVC-06's OC-4 and the owner's row H33 say it. The names are made by the Horizon server's
   own code (`server/horizon-server/Server.Medius/Medius/MLS.cs`), which is not the web project's to edit.
4. redotcom's name cut of 30 (`net/lobby.ts` NAME_MAX, citing web R91 §13) is the in-game name field, not the online
   persona cap, which is 14 (PC research 38) (ONL-06). **Carried:** `NAME_MAX`'s comment and research 91 §13,
   marked in place; the value stays 30 (the in-game name) until ONL-06 takes the 14.
5. PC research `80-online-menus-harness-scope.md` §3 (L48) asks, for the SOCOM II ONLINE menu, for "one capture per row
   naming it" and marks that walk only partly built -- the rows were not on record there; `s4_pcsx2/A_45_lobby2.png`
   shows them (ONL-09). **Not carried:** a PC research note, the PC project's to correct (owner's row H42).
6. Web research 95 §1.2 counts 208 binding-table rows; there are 207 (web R96 §4, regenerated by PLAT-06): the 208th
   16-byte record is the all-zero terminator, and the highest id is 208 because id 30 is unused. **Carried:** research
   95 §1.2, marked in place.
7. `tools/corpus.ts` (around line 229) describes the README as "what the viewer is" and lists neither MISSION.md nor this
   roadmap; the corpus needs the controller's rebuild (PLAT-35). **Carried:** `llmsTxt` describes the mission and lists
   MISSION.md, this roadmap, SPRINTS.md, the plans' index and the owner's rows (PLAT-35, with the citation matcher's
   fix: a `PC research NN` no longer counts as citing web note NN).
8. PC research 11 L335 says the text-only title cards are `TEXT` objects of `dlgIntroScreen.rdr`; they are SONY448.PSS
   pictures and that dialog has no objects (web research 98 §1, §3). `scripts/parity/launch_to_mission.txt`'s sixth
   step comment "intro / warning screen" (and `align.json`'s `s06_CROSS` "warning / intro screen") names a dark frame
   believed to be INTRO_2's opening fade; no capture shows a warning screen there (web research 98 §4.1) (BOOT-03).
   **Not carried:** PC research 11 and `scripts/parity/` are the PC project's to correct (owner's row H42).
9. PLAT-21's unknown "which buttons skip each movie (... SONY448 unknown)" is half answered: `dlgIntroCinematic.rdr`
   binds no button (web research 98 §3), and the CROSS presses after s02 and s03 did not skip it (the one after s02
   did not pause it either, §1). The press on the Zipper card (s04) did not end it early
   either in `mb10_pcsx2`, whose per-second wait frames run 30 pictures per second straight across it (web research
   98 §1; the other runs' s04 press is believed the same, §5); a skip from outside the dialog is not ruled out
   (PLAT-21). [Corrected again 2026-10-01 after the second review: said the s04 press "is not decided by the timing --
   believed not ... until a 1 frame/s capture across that press (BOOT-01)"; `mb10_pcsx2` has one.] [Corrected 2026-10-01 after review: said "the CROSS presses
   captured during SONY448 neither skipped nor paused it".] **Carried:** PLAT-21's Unknowns, marked in
   place.
