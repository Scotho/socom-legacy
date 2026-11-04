# The sprint list: the backlog in order

Written 2026-10-01 from the reviewed backlog ([README](README.md), segments [01](01-platform.md)-[07](07-match.md)) and
[`../MISSION.md`](../MISSION.md), as web sprint 5 (the ARMORY, the character types, the MP play-test fixes;
[`../plans/2026-09-30-web-sprint-5-armory.md`](../plans/2026-09-30-web-sprint-5-armory.md)) closes. Every one of the
backlog's 181 active tasks appears exactly once below, in a sprint or in the owner-window table (the seven future-scope
ids MENU-10..MENU-16 and the three dropped tasks PLAT-27, PLAT-37 and OPT-08 are in none); a scratch check
(`roadmap/check.py` in the session scratchpad, the same parse PLAT-01 puts in the tree), re-run after the owner's
rulings of 2026-10-01, found no cycle, no dangling id and no task placed before a prerequisite. **The task line in its
segment file is authoritative** for what a task is; this page only orders them. The campaign is out of scope (the owner,
2026-10-01): no sprint here enters a mission; NEW GAME and LOAD GAME stop at the desktop-recompilation screen at once
(MENU-03, **ruled (a)**, R1).

**Revised 2026-10-01 for the owner's rulings R1-R5** ([`../MISSION.md`](../MISSION.md), "The owner's rulings of
2026-10-01"): R1 (option (a)) drops the conditional half of sprint 15 and folds its EXTRAS half into sprint 14, as
sprint 15's own text provided; to keep sprint 14 under the 38-point ceiling, MENU-08 (the LAN item, a PLAT-28 hook)
moves to sprint 11 beside PLAT-28 and PLAT-34 (the ARMORY fold) to sprint 16, the last sprint before ONL-17 needs it. R3
makes PLAT-19a an M (a built and validated libmpeg2 spike). R4 adds PLAT-37 (the `.ps2` image's filesystem), placed in
sprint 11 before PLAT-26 needs it in 12 (R7 dropped it again the same day: below). R5 adds MATCH-04 (first person),
placed in sprint 6, which it shares with nothing.

**Revised 2026-10-01 for two seats** (the owner: "segment the sprints into one for craig and one for chris"; "the
current tasks are all for craig"): every sprint now has a **Seat** and an **After** line, and the list is cut into two
lanes ("The two seats" below). Sprint 6, in flight, stays whole with Craig. Ten tasks moved so that each lane can run
without waiting on the other more than it must: the card's data layer left Craig's sprints for **sprint 15**, whose
number was empty and is now Chris's first sprint (PLAT-37 from 11; OPT-02 and PLAT-26 from 12; OPT-01, OPT-03, OPT-04,
OPT-08, OPT-20 and ONL-05 from 13), and PLAT-34 (the ARMORY fold) moved from 16 to Craig's 13, since it re-hosts the
viewer's own ARMORY code. Where the paragraph above says PLAT-34 sits in 16 and PLAT-37 in 11, this revision supersedes
it. No task changed; the totals were then 150 tasks and 458 points.

**Revised 2026-10-01 for R7** (the owner; [`../MISSION.md`](../MISSION.md) R7, which replaces R4;
[the spec](../specs/2026-10-01-web-r7-account-and-card-design.md)): the account is a plain name and password with an
argon2id hash on the server, SAVE PASSWORD: YES a remember token in an HttpOnly cookie (never the password), and the
card two virtual slots in localStorage in our own JSON -- no `.ps2` images, no import or export. Three M tasks are
dropped and keep their ids, marked: **PLAT-27** (the card file codec; sprint 6, merged at 1c20d326 before the ruling,
its readers kept as a dev tool under `tools/`), **PLAT-37** (the `.ps2` filesystem) and **OPT-08** (export and import),
both sprint 15's. Sprint 6 is 16 tasks and 30 points; sprint 15 was then 7 tasks and 19 points, Craig's lane then 78
tasks and 224 points, Chris's lane then 65 tasks and 209 points. Their dependents were re-pointed to PLAT-25 and
PLAT-26 (BOOT-05, MENU-04, OPT-01..OPT-04, OPT-20, PLAT-26); every After line still suffices. No other task moved;
every table below then stated 147 tasks and 449 points.

**Revised 2026-10-02 for the online path** ([the online-path plan](../plans/2026-10-02-online-path-target.md), its
rulings OT.R1-OT.R8; this re-cut is its task OT-0). The owner, 2026-10-02 (the ruling in force): "We're keeping
central server and pausing the LAN plan. Main menu -> Online -> traditional UI flow (can skip some of the DNS settings
since we have a central host and start the online section with a saved memory card representation that connects to
our server). The DNAS and Login screen is important and must match the original." And, asked whether the online side
is split with Chris: "We are doing all of the online work up to match start for now." The target is the original's
internet branch from the main menu to the match's start (OT.R1), on our central server (OT.R2). **The seats (OT.R7):
Craig's lane does the whole path up to the match's start, for now**; what follows the start is not assigned by that
ruling (Chris's lane is the owner's to say). Sprint 9 stands as it is. The path's tasks form the next sprints in the
plan's order: **8** (the services the flow calls; the card's data it reads and writes), **11** (the main menu and the
online entry: LOGIN, the DNAS screen, SELECT UNIVERSE), **16** (the persona to the SOCOM II ONLINE menu and logoff;
rooms and the bridge), **17** (briefing rooms, CREATE GAME, the game lobby and the ARMORY, the loading screen: the match
starts); **23** holds the two tasks that follow the start (ONL-20, ONL-22a). Thirteen path slices (OT.R6) cut every
dependency of the path on a parked task -- PLAT-26a, OPT-04a, ONL-01a, MENU-01a, MENU-02a, OPT-05i, BOOT-10a, SVC-09a,
SVC-07a, SVC-14a, ONL-23a, ONL-16a, ONL-22a (each block says what it takes) -- and OPT-20 joined the path because
PLAT-34's ARMORY stands on it. Every other sprint after 9 is marked parked, in its Status line. A parked task keeps its
block, id and size; those that shared a sprint with the path moved out, so that each sprint is wholly on the path or
wholly parked (OT.R6 keeps a parked task in its sprint; one task in one sprint makes that impossible where a sprint was
split, and this is the smallest move): sprint 11's parked half to the new **21**, sprint 16's and 17's to the new
**22**, sprint 8's stats record to 10 and its friends (SVC-16) to 18, with player info (SVC-15, from 10). The path's
own moves: SVC-06 from 10 to 16, LOGIN to SELECT UNIVERSE from 16 to 11, PLAT-34 from 13 to 17, OPT-20 from 15 to 8,
ONL-20 from 18 to 23. Every table below then stated 160 tasks and 480 points: the slices added 13 tasks and 31
points, the parked parents keeping their sizes (OT.R6). Two slices are not smaller than their parents: MENU-02a and
ONL-16a are L, as MENU-02 and ONL-16 stay, since each slice carries nearly all of its screen and OT.R6 keeps the
parent's size. The parked 21 and 22 therefore count the main menu and the game lobby a second time (14 points) and
overstate what is left in them (the streams; chat and voice); both parents are re-sized when the path has run.

**Revised 2026-10-02 for the opener (OT.R11)** ([the online-path plan](../plans/2026-10-02-online-path-target.md),
OT.R11; this re-cut is its task OT-11). The owner, 2026-10-02: "once that work is complete, proceed agentically through
creating the entire game opener zipper text -> trailer -> menu etc etc". The boot from the loader's screens through the
Zipper and Sony cards and the intro trailer with its sound, in real time, into the main menu is **on the path** (`/` is
its route, OT.R10): BOOT-02 (done on `agent/online`, web research 130), BOOT-04 (in flight) and BOOT-06 leave parked
sprint 12, PLAT-19c (done, research 120 §11) and PLAT-20 (done, research 137) leave parked sprint 21, and the five form
the new **sprint 24** (Craig's, OT.R7; 5 tasks, 17 points), its After line sprint 11 and its place in the lane behind
17 -- the smallest cut that holds the boot before the menu's hand-off (BOOT-06, which now stands on MENU-02a: the
hand-off needs the menu drawn, not its streams; its block says so). Sprint 12 keeps BOOT-05 (a slice or owed: BOOT-04's
cited card stubs stand), BOOT-07, BOOT-08, BOOT-10 (BOOT-09 is sprint 13's), OPT-05a, PLAT-33 and PLAT-32 (7 tasks,
21 points) and sprint 21 keeps
MENU-01, MENU-02, PLAT-22 and PLAT-29b (4 tasks, 22 points); both stay parked, and 21 now comes after 24 as well
(PLAT-29b stands on PLAT-19c), which carries 12, 13, 14 and 22 behind it through their After lines. PLAT-22, the menu's
music, stays owed, not blocking (OT.R8). No task changed and no lane total moved: every table below still states 160
tasks and 480 points, Craig's lane then 111 tasks and 319 points. The README's layer map moved BOOT-06 to L8 and BOOT-07 to
L9 with the dependency.

**Revised 2026-10-07 for the voice placement** (OT.R23 / OT.R24, research 170). Research 170 proposed
putting the browser voice work into sprint 17, but sprint 17 closed on 2026-10-06 before that proposed placement was
carried into this file. The closed sprint is not rewritten. Instead **sprint 20 is now the canonical implementation
sprint for the whole voice slice**: SVC-20a moves out of sprint 22; SVC-20c, ONL-16b and MATCH-05 are promoted from
their proposed blocks; SVC-20b, SVC-21 and SVC-22 stay with them. OT.R24's ruled Opus path makes SVC-21 an M rather
than the old L estimate for a SASE port. Browser voice no longer waits on the recomp's Q5 work: that run remains the
proven-level reference only. The active backlog was then **163 tasks and 483 points** (59 S, 76 M, 28 L).

**Revised 2026-10-07 for the online track and the seats** (the owner, the same day; [the online-path
plan](../plans/2026-10-02-online-path-target.md), OT.R39 and OT.R40; the merge controller's repair of the voice
re-cut). OT.R39, "ensure the online track has it scheduled": sprint 20 is unparked and scheduled on the online track,
in Craig's seat under OT.R7, After sprints 9 and 17; SVC-20a stands on SVC-07a (the swap its block called for) and
SVC-22 no longer on OPT-10 (voice plays at the original's default playback volume until OPT-10's HEADSET VOLUME
exists). OT.R40, "The ones i scoped should be under me": every roadmap sprint is Craig's -- 15, 10, 22, 23, 18 and 19
join his lane with 20, unparked, each block with a **Runs** line naming its track and place: **the online track**,
after its netcode items NET-DRAIN, NET-LOOK and NET-WIRE, runs 20, 15, 10, 22, 18; **the gameplay track**, after its
sprint 32 (`docs/plans/2026-10-06-hostage-and-modes.md`), runs 23, then 19, last. Chris's seat keeps no roadmap sprint
(his own contributions, integrated by the merge controller). Only the offline front end's 21, 12, 13 and 14 stay
parked; ONL-31 (the online screens' music, on PLAT-22) moved from 22 to 21 so that 22 stands on nothing parked, and
22's After line dropped 21. No task changed size: every table below then stated 163 tasks and 483 points, Craig's
lane then 159 tasks and 467 points.

**Revised 2026-10-09 for the promotion of segment 06's proposed blocks** (PROMOTE-155; the merge controller's word under
the owner's delegation, [sprint 10's plan](../plans/2026-10-09-web-sprint-10-the-services.md), its Log and W10.R6; H86
answered by OT.R33, H89 by OT.R32). Seven blocks of research 155 and 169 are tasks now, each placed beside its parent
or its prerequisites: **sprint 10** takes SVC-13a (the rating's per-round arithmetic), SVC-23c (the flood limits, built
in part) and SVC-23d (the vote kick at the round's end); **sprint 22** takes SVC-12d (the room's counters and results,
before SVC-07), SVC-23a (the ladder's limits and the void) and SVC-23b (the round on the server's terms, (0) built in
part) -- these two stand on SVC-07, so they cannot be sprint 10's (PROMOTE-155's brief named 10 for them; SVC-23
closes in 10 without them, its dated line in segment 06); **sprint 18** takes SVC-15a (PLAYER INFO's lookup) with
SVC-15. No After line changed. Every table below then stated 170 tasks and 500 points, Craig's lane then 166 tasks and
484 points.

**Revised 2026-10-10 for sprint 22's adoption** (PROMOTE-22; the merge controller's word, [sprint 22's
plan](../plans/2026-10-10-web-sprint-22-the-results-and-the-lobbys-text.md), W22.R1-R7). **Sprint 22** takes two
promoted blocks of segment 06 -- SVC-23e (the vote's rejoin refusal and the spectators' VOTE ALL, S; W22.R6) and PROVE-1
(the proven-level harness for the results, M; W22.R7) -- and ONL-16 is re-sized from L to S (W22.R5: only the game
lobby's text chat is left in it): sprint 22 is 10 tasks and 30 points. No After line changed. Every table below then
stated 172 tasks and 498 points, Craig's lane then 168 tasks and 482 points.

**Revised 2026-10-11 for sprint 18's adoption** (PROMOTE-18; the merge controller's word, [sprint 18's
plan](../plans/2026-10-11-web-sprint-18-the-carried-and-the-players-pages.md), W18.R1-R4). **Sprint 18** is cut in two
(W18.R1, the merge controller's split): the players' half, that plan, takes sprint 22's carried items -- SVC-12e
(STATS-ONE), SVC-23g (LEDGER-RESTORE), SVC-07c (SEAT-TOLD, its block given an id), SVC-23h (BOT-AIM), SVC-23f -- and
the two promoted blocks of segment 05, ONL-30a and ONL-34, beside its own players' pages; the clans' pages ONL-26,
ONL-27, ONL-28 and ONL-29 are its second plan, after the first. CLAN RANKING (ONL-30, re-sized from M to S: its players'
half is ONL-30a) moves to **sprint 19** with SVC-11, whose clan games give the clans' ladder its rating. Sprint 18 was
then 18 tasks and 42 points over its two plans (28 and 14); sprint 19 is 6 tasks and 18 points. No After line changed.
Every table below then stated 179 tasks and 509 points, Craig's lane then 175 tasks and 493 points.

**Revised 2026-10-11 for SVC-03a** (REMEMBER-ROTATE; W18.R9 of [sprint 18's
plan](../plans/2026-10-11-web-sprint-18-the-carried-and-the-players-pages.md): the owner's word on HUMAN_TASKS H178,
relayed by the merge controller, who added the task to the sprint). Segment 06 gains SVC-03a (S, a slice of SVC-03),
placed in sprint 18's players' half, wave 1, after STATS-ONE: sprint 18 is 19 tasks and 43 points over its two plans
(29 and 14). No After line changed. Every table below then stated 180 tasks and 510 points, Craig's lane then 176
tasks and 494 points.

**Revised 2026-10-29 for PLAT-38** (the browser's video settings page; the owner's word in the dispatch seat 04,
asked "active next sprint, or future scope": "Active, next sprint"). Segment 01 gains PLAT-38 (M, a browser
adaptation on the product track, OT.R53), placed alone in the new **sprint 42** (the next free web sprint number:
25-41 are other lanes' web sprints), Craig's seat, After none, paired with the client profiling lane CPF's GPU
runs. No other sprint and no After line changed. Every table below states the same 181 tasks and 513 points, Craig's
lane 177 tasks and 497 points.

## How the sprints are sized

The yardstick is sprint 4 and sprint 5: sprint 4 ran ten milestones (M0-M10) in one cloud day with up to three Opus
implementers in parallel, ~$63 of a $250 budget; sprint 5 ran six tasks (S0-S5) over two days from the local seat.
In the backlog's sizes (S <= 1 day, M 2-4 days, L 1-2 weeks of one agent) a sprint of that shape holds about
**30-40 points** at S = 1, M = 3, L = 7, in **8-15 tasks**, with the L tasks split among parallel implementers in
worktrees as sprint 4 split its classes. The active backlog is 513 points (69 S, 85 M, 27 L): twenty sprints
(6-42), that is 6 to 24 and then 42, with sprint 20 now a normal scoped voice sprint, and the four owner windows beside them. *(Until the two-seat revision of
2026-10-01 this said fourteen, with sprint 15's number kept empty; 15 now holds the card's data. Until OT-0's re-cut,
2026-10-02, it said fifteen: 21, 22 and 23 are new. Until OT.R11 the same day it said eighteen: 24, the opener, is
new. Until PLAT-38, 2026-10-29, it said nineteen (6-24): 42, the video settings page, is new.)*

Numbering continues the web sprints: the next is **web sprint 6**. Two lanes run side by side from sprint 7, one per
seat (the next section). "Parallel with" names the sprint the other seat can run at the same time; **After** names the
sprints that must be merged before a sprint's last task can close, in either lane. A sprint's number is its name, not
its date: the order inside a lane is the lane's list below, and across the lanes it is the After lines. *(From
2026-10-02 Craig's lane runs the online path alone (OT.R7): sprints 8, 11, 16 and 17, and 24 the opener (OT.R11); every
sprint after 9 off the path is parked, and its After line names the path's last sprint or a sprint after it. From
2026-10-07 every roadmap sprint is Craig's (OT.R39, OT.R40): the online sprints run on the online track or the gameplay
track, each block's **Runs** line; only 21, 12, 13 and 14 stay parked.)*

## The two seats

| Seat | Lane | Sprints, in the lane's order | Tasks | Pts |
|---|---|---|---|---|
| **Craig** | the foundations, the dialog runtime and its harness, the screens and movies; **the online path up to the match's start** (OT.R7): the services and the card's data the flow calls, the main menu, every screen from LOGIN to the game lobby and the ARMORY, the loading screen; **the opener** (OT.R11): the loader's screens, the cards and the trailer with its sound into the menu; **every other roadmap sprint** (OT.R39, OT.R40): on the online track the voice slice, the card's data, the services beyond the path, the online pages beyond it; on the gameplay track the round's screens, leaving, and the round's edges; then **the browser's video settings page** (sprint 42, a browser adaptation; the owner's word, 2026-10-29); then, parked, the main menu's music, the boot's rest, the card's screens, OPTIONS and EXTRAS | 6, 7, 9, 8, 11, 16, 17, 24, 20, 15, 10, 22, 18, 23, 19, 42, 21, 12, 13, 14 | 177 | 497 |
| **Chris** | no roadmap sprint since OT.R40: his self-chosen contributions, his own `chris/*` branches, integrated into `main` by the merge controller | -- | 0 | 0 |
| the owner | the four game-run windows (Craig's host and hands) | -- | 4 | 16 |

- **[2026-10-02, OT.R7] The seats for the online path.** The owner: "We are doing all of the online work up to match
  start for now." Craig's lane does the whole path up to the match's start -- sprint 9's remainder, the services the
  flow calls, the card slices, the main menu, every screen from LOGIN to the game lobby and the ARMORY, the loading
  screen -- in sprints 8, 11, 16 and 17, and the opener in 24 (OT.R11, the same day). This overrides the 2026-10-01 cut
  below for those tasks, for now. Sprint 23 (after the start) stays in Chris's lane, where its tasks stood, until the
  owner says; the rest of Chris's lane is parked (OT.R6). The bullets below are the 2026-10-01 cut, kept as written.
  *(2026-10-07, OT.R39 and OT.R40: sprint 20, then every roadmap sprint, is Craig's; Chris's seat holds no roadmap
  sprint, and the online sprints are unparked on the online and gameplay tracks.)*
- **Why this cut.** The roadmap already ran two tracks (the client and the services) for two seats, but the services
  alone are 56 points before the tracks meet. Giving Chris the online front end with its services, and the card's data
  layer (which the personas and the login stand on, and which needs no screen), makes the lanes even and gives each a
  whole thing to own: Craig, the game's front end up to the ONLINE row of the main menu; Chris, everything behind that
  row.
- **Where the lanes touch** (every crossing is an After line): Chris's 15 and 8 need only sprint 6 (the card store,
  the valve store, the dialog inventory, the service record; the codec left with PLAT-27, dropped by R7); 10 needs 9's
  keyboard (PLAT-17) for its chat tasks only; **16 needs Craig's 11** (the dialog runtime carrying the main menu) and,
  for ONL-07 and ONL-10 alone, 12; 17 needs 13's PLAT-34 for the lobby's ARMORY row; **20 needs 17's lobby / bridge slices**. Craig's 12
  needs Chris's 15 (libmc and the valves under the boot card check); 13 and 14 need 15's saves.
- **The one wait.** Chris's 15, 8 and 10 were then 75 points (81 before R7 took six out of 15); Craig's 7, 9 and 11
  were then 105 points. If the seats move at one pace, Chris reaches 16 about a sprint early; SVC-20a (the voice
  floor's state machine, decomp only) and SVC-12b's read could be taken forward in that time; the 2026-10-07 voice re-cut now places SVC-20a in sprint 20 instead, and 16's service-side
  task (SVC-07) needs no screen.
- **What Chris's seat needs.** Its own disc and decompilation (MISSION, "The sources of truth") for the reading
  level. The archived captures the online screens are scored against (`logs/parity/s4_pcsx2`, the ONL-32 set) live on
  Craig's host and stay out of the tree, so a screen's score is run there, or the archive is shared by the owner's
  hand; the service and card tests need none of it (they run in CI or against a local service only; R7 took the
  codec out of the card, its readers a dev tool on Craig's host).
- **The windows are Craig's**, whichever lane they serve: they are lock-bound game runs on his host.

**What changed for Chris's lane on 2026-10-01.** Two owner rulings landed after the two-seat cut:
- **R6** (OC-7 ruled (c)): the online services are built **inside the existing match server**, `packages/server`, one
  operation per Medius request (no Medius server, no bridge to Horizon, to start). Sprint 8 builds web research 97 §8's
  (c) column and **no longer waits on OC-7**; it still waits on SVC-04's box, retention and SVC-05's texts.
- **R7** (the account and the card, replacing R4): **sprint 15 was then 7 tasks and 19 points** (PLAT-26, OPT-02,
  OPT-01, OPT-03, OPT-04, OPT-20, ONL-05), all JSON over the virtual card -- two slots in localStorage, each a file
  table with the original's names and nominal sizes, an extension area `ext` and a revision counter; **PLAT-37 and OPT-08 are
  gone** (no `.ps2` filesystem, no import or export), and no byte codec stands under OPT-02/04/20. **SVC-03** (sprint 8)
  is create and login by **name and password with an argon2id (or scrypt) hash**, the login errors in the console's
  words, and -- the saved password, **ruled the same day** ("agreed on cookie") -- a **remember token** issued at a
  login with SAVE PASSWORD: YES and set as an HttpOnly, Secure, SameSite cookie on the match server's host (only its
  hash stored; idle expiry; dropped on a password change), an HTTPS login endpoint beside the WebSocket with the Origin
  check on it, and a login attempt limit; no card credential, no revocation screen. Whether the WebSocket handshake
  needs an Origin check too is SVC-03's open design point, not a requirement: only if the cookie is ever presented on
  the handshake itself; a short-lived ticket from the login endpoint for the socket needs none and keeps a page on
  another site playable. *(Corrected 2026-10-01: this first said "the Origin check on it and on the handshake".)*
  **OPT-04**
  keeps SAVEPASSWORD and the password's length in the persona record, never the password or the token. SVC-04
  persists the token hashes with their last-used time. What sprint 15 needs from sprint 6 is now **PLAT-02, PLAT-09
  and PLAT-25** (PLAT-27 is no longer among them).

The columns: **Gate** is the validation the sprint closes on (its proof against the original: the archived captures
and cards at the reading level, the owner window's run at the proven level); **Owner needs** names the calls and
windows the sprint cannot finish without (the README's "owner's calls" ids); **Main project** names help from the
recompilation project (its tools, a tracing flag, a run).

## The sprints

### Sprint 6 -- Foundations and the four spikes

- **Seat:** Craig. **After:** none.
- **Goal:** the ground every segment stands on, and the four questions that could change the plan answered before a
  line of runtime is written: the ruled MPEG-2 decoder proven in a browser build, the card's store and its quota, the
  service shape, the load budget; and first person restored in the round (R5). *(R7, 2026-10-01: the card's store is
  two virtual slots in localStorage; its quota question closed.)*
- **Tasks (16, 30 pts):** PLAT-01, PLAT-02, PLAT-03, PLAT-04, PLAT-06, PLAT-09, PLAT-19a, PLAT-24, PLAT-25,
  PLAT-29a, PLAT-35, BOOT-03, MATCH-03, MATCH-04, SVC-01, SVC-02.
- **Out by R7 (2026-10-01):** PLAT-27 (17 tasks and 33 points before): merged at 1c20d326, then dropped -- its readers
  a dev tool under `tools/`, its writers deleted, a follow-up inside this sprint.
- **Gate:** PLAT-01's graph check green in CI and equal to the README's map; PLAT-03 reads every front-end file class
  byte-equal from the synthetic ISO fixtures and `MENULOOP.PSS` chunked (hash equal); the card codec's writers are
  gone from the shipped packages and its readers live under `tools/`, where PLAT-06's dev-host `PersistentValves` read
  goes through them (R7: PLAT-27 dropped); PLAT-25 keeps two virtual card slots in localStorage apart, a record
  round-trips, a throwing `setItem` leaves the previous record byte-equal and is reported, a reload reads the same slot,
  free space follows the nominal sizes against the virtual 8 MB (`ext` taking none), a save that finds the revision
  moved is refused whole as ChangedCard, a corrupt record reads as a damaged save and no storage as no card (R7);
  PLAT-19a's record shows libmpeg2 -> wasm frame-exact against libavcodec (picture count and
  order, no black blocks), its sample epsilon, the IPU-vs-BT.601 scores and the wasm size (or the fallback's, by its
  fail rule); MATCH-04's zoom table with state 1 as unit tests from the cited decomp lines, the C stance tests
  unchanged; SVC-01's record maps every V1/V2 action to one operation; PLAT-29a's per-phase table logged; PLAT-06's
  inventory regenerates every scratch-read fact. *(Until R7 this gate read: "PLAT-27 round-trips the four tracked
  card fixtures (`ps2xTest/fixtures/cards/{virgin,one,two,created}.bin`) byte for byte and decodes the personas PC
  research 80 lists; PLAT-25 keeps two slots of 8,650,752-byte `.ps2` images in IndexedDB, an interrupted write leaves
  the old image, an over-quota write is refused before it starts, a reload reads the same image, and the quota
  measurement is on record".)*
- **Dependencies:** none (the layer-0 and layer-1 tasks). PLAT-35 carries the mission readings into the remaining docs.
- **Owner needs:** SVC-01's **OC-7 shape** (**ruled (c)**, R6, 2026-10-01: inside the existing match server);
  PLAT-24's key migration (**ruled: migrate**); MATCH-03's remaining PC-over-console call (the
  Explore camera). **Ruled 2026-10-01, no longer needed:** PLAT-19a's decoder, licence and
  no-pre-transcode (R3); PLAT-25's medium and two slots (R4, replaced by R7: localStorage, two virtual slots, our
  JSON); OWNER-SVC-0 (R2); first person and C tap/hold (R5); the binoculars view (the owner's yes, built 2026-10-01);
  the mission readings PLAT-35 records (R1, R2); **R7 itself** (the account and the card, confirmed by the owner in
  the controller's seat) and its saved-password clause (ruled the same day: a remember token in an HttpOnly cookie).
  The no-storage default (no card) is the controller's, the owner's to overturn (OPT-07).
- **Main project:** none (reads only).
- **Parallel with:** nothing; it is first. Inside it, the spikes (PLAT-19a, PLAT-25, SVC-01, PLAT-29a) and the
  documents (PLAT-01, PLAT-06, PLAT-35, MATCH-03, BOOT-03, SVC-02) are independent of the code (PLAT-02/03/04/09/24;
  PLAT-27, in this list until R7, is dropped);
  MATCH-04 touches only the round's viewer code and can be taken by the seat that closes sprint 5.
- **Risk it retires:** FMV (if libmpeg2 fails the frame-exact check, the FFmpeg fallback is measured before sprint 9
  commits to PLAT-19b; pre-transcoding is ruled out by R3); the card (the IndexedDB quota for two 8.6 MB images measured
  before OPT-01 is built on it; measured, then made moot by R7: the card is counted against a virtual 8 MB in
  localStorage, and PLAT-25 retires the store's shape instead); server persistence (the shape rules what sprint 8
  builds); the budget (a table before any threshold).

### Sprint 7 -- The dialog runtime, and the harness that scores it

- **Seat:** Craig. **After:** sprint 6.
- **Goal:** a `.rdr` dialog loaded from the disc, its zAnim script run, its commands dispatched through a host
  interface, its text drawn by the game's fonts and composited at 640x448; and the capture harness that scores a frame
  exactly as the title gate does, so every later screen is measured from its first draw.
- **Tasks (8, 36 pts):** PLAT-05, PLAT-07, PLAT-08, PLAT-12, PLAT-13, PLAT-14, PLAT-18, PLAT-30.
- **Gate:** PLAT-30's calibration: the harness scores the archived recomp captures against PCSX2 with `compare.py`'s
  numbers, `gate --score-title` accepts its output, a black frame scores < 90, the masked-background rule is pinned;
  PLAT-05 loads `dlgMenu` and `dlgOptions_Menu` to the node tree the archived RDRAM dump reads; PLAT-07/08's unit tests
  are transcribed from the cited decomp lines (the binding table's 207-or-208 rows settled by PLAT-08); one static
  dialog frame (its chrome and text) scored against its PCSX2 crop with the movie region masked.
- **Dependencies:** sprint 6 (PLAT-02/03/04/06/09).
- **Owner needs:** none.
- **Main project:** none yet (PLAT-32's tracing flag is sprint 12's).
- **Parallel with:** **sprint 8** (services I). Inside the sprint PLAT-30 and PLAT-18 are independent of the runtime
  chain PLAT-05 -> PLAT-07 -> PLAT-08; PLAT-13/14 follow PLAT-05.

### Sprint 8 -- The online path I: the services the flow calls, and the card's data it reads and writes

- **Seat:** Craig. **After:** sprint 6.
- **Goal:** the services the online flow calls first, running locally inside the match server (R6) -- accounts and
  personas (SVC-03), persistence (SVC-04), the server's texts: the universe, the agreement, the news (SVC-05) -- and the
  online dialogs read from the disc (ONL-33); with the card's data the flow reads and writes, as path slices: libmc's
  file commands (PLAT-26a), the persona records without the whole options save (OPT-04a), the saved network
  configuration naming our server (ONL-01a, OT.R3) and the ARMORY's loadout file (OPT-20, which PLAT-34 needs).
- **Tasks (8, 16 pts):** SVC-03, SVC-04, SVC-05, ONL-33, PLAT-26a, OPT-04a, ONL-01a, OPT-20.
- **Gate:** one server test per request/response pair the client uses for these tasks, built from V1-V4 and `MLS.cs`,
  green against a local service only (R293); SVC-04's DB effect per operation equals Horizon's `-Show` diff on the
  archived steps, and a restore test passes; SVC-03's account row holds only an argon2id/scrypt hash, a login by name
  and password succeeds and a wrong one is refused in the console's words, and a login with SAVE PASSWORD: YES sets
  the remember token's HttpOnly cookie, whose hash alone is stored, expires when idle and dies with a password change,
  behind the Origin check and the attempt limit (R7); ONL-33's chapter regenerated by PLAT-06's test; PLAT-26a's
  result codes table-driven from the stub; OPT-04a's field, cap and no-secret tests; ONL-01a's first-use write and
  read; OPT-20's layout as unit tests from `FUN_0033eb70`. Proven level: ONL-32's transcripts, when the window comes.
- **Dependencies:** sprint 6 (SVC-01, SVC-02, PLAT-06, PLAT-25).
- **Owner needs:** SVC-04's **box, retention and the Horizon account migration**; SVC-05's **universe name, news,
  agreement text, announcements**; SVC-03's **token idle lifetime and the attempt limit's numbers**; OPT-04a's **HOST
  value** (OC-3). **No deploy and no connection to the hosted Horizon** (CLAUDE.md boundaries; HUMAN_TASKS rows).
- **Main project:** none.
- **Parallel with:** sprint 9's remainder (the connecting lines, PLAT-11, PLAT-17).
- *(Until OT-0, 2026-10-02: Chris's "Services I: the shape built, accounts, persistence, the stats record (services
  track)", with SVC-12a, SVC-12b, SVC-12c and SVC-16, which are parked in sprints 10 and 18; it read 8 tasks and 22
  points.)*

### Sprint 9 -- Screens, widgets, input, popups, the keyboard, the movie player, the decoder

- **Seat:** Craig. **After:** sprint 7.
- **Goal:** the screen manager that walks dialogs as `CMenuState` does, every non-ARMORY widget type, popups, the
  software keyboard, input from pad, keyboard, touch and gamepad, the movie player's semantics with the MPEG-2 decoder
  behind it, UI sounds, and the golden manifest that names every screen's capture.
- **Tasks (10, 38 pts):** PLAT-10, PLAT-11, PLAT-15, PLAT-16, PLAT-17, PLAT-21, PLAT-23, PLAT-31, MENU-09, PLAT-19b.
- **Gate:** each offline dialog's widgets drawn and scored >= 90 against PCSX2's capture of the same state with the 4:3
  correction, the ACTIVE glow as a 5 fps curve (PLAT-15's acceptance); PLAT-16's popups against
  the archived popup captures; PLAT-10's transitions equal the archived call trace's order; PLAT-31's manifest names a
  capture path and method for every screen PLAT-06 lists; PLAT-19b decodes one INTRO_2 and one MENULOOP picture to
  the IPU-conversion reference within the tolerance PLAT-19a recorded (its samples within 3 per sample and 0.015 per
  picture mean of libavcodec's decode of the player's disc, then the IPU's conversion: web research 98 §7.1, §7.4; not a
  hash match) [the parenthesis added 2026-10-01 after PLAT-19a's review]; MENU-09 places its three dialogs or marks them
  unreachable.
- **Dependencies:** sprint 7. PLAT-19b stands on PLAT-19a's passing record (sprint 6).
- **Owner needs:** PLAT-11's **keyboard bindings for menus**; PLAT-17's physical-keyboard typing; PLAT-10's **map
  viewer** call (does it stay a separate entry?); PLAT-31's capture window is **OPT-19** (scheduled, not blocking).
- **Main project:** none.
- **Parallel with:** **sprint 10** (services II). Inside the sprint PLAT-19b is its own implementer (the decoder touches
  nothing the runtime does; R3 rules the decode client-side from the player's ISO, so there is no derived-file
  shortcut).

### Sprint 10 -- Services: the stats record, clans, the ladder, chat, moderation (services track)

- **Seat:** Craig. **After:** sprint 17.
- **Runs:** the online track, third: after sprints 20 and 15 (OT.R40).
- **Status:** **closed 2026-10-10** at b18b1226b on `agent/online` (the plan's Log, its close entry: fourteen tasks merged, each reviewed; the pull request the merge controller's, his landing gate the sprint's gate). *(Was:* **adopted 2026-10-09** on `agent/online` (the plan [2026-10-09-web-sprint-10-the-services.md](../plans/2026-10-09-web-sprint-10-the-services.md), W10.R1-R6; the merge controller's word), its tasks dispatched one at a time from that day. *(Until then it read:)* scheduled for the online track, 2026-10-07, on the owner's word (OT.R40; its Seat read "Chris"); parked*)*
  until then (OT.R6). OT-0 (2026-10-02) took SVC-06 to the path (sprint 16) and
  SVC-15 to 18 beside its page, and brought sprint 8's stats record here (SVC-12a, SVC-12b, SVC-12c); SVC-09 and
  SVC-14 stand on their path slices SVC-09a and SVC-14a (sprint 16 and 17). Its After line read "sprints 8, 9".
- **Goal:** the lobby's data: clan core and membership, clan messages, the ladder with its ranks and medals, rank
  restrictions, lobby text chat and the ignore list, moderation. *([2026-10-09, W10.R6] "rooms and the game list with
  filters" and "player info" struck: SVC-06 is built (sprint 16), SVC-15 is sprint 18's.)*
- **Tasks (14, 40 pts):** SVC-08, SVC-09, SVC-10, SVC-12a, SVC-12b, SVC-12c, SVC-13, SVC-13a, SVC-14, SVC-17, SVC-18,
  SVC-23, SVC-23c, SVC-23d.
- *([2026-10-09, PROMOTE-155] SVC-13a, SVC-23c and SVC-23d promoted; the Tasks line read "11, 33 pts". SVC-23a and
  SVC-23b stand on SVC-07 and are sprint 22's.)*
- **Gate:** the per-pair server tests of sprint 8 extended to every operation here, green locally; SVC-12a's arithmetic
  as unit tests from the decomp and SVC-12b's offsets read against the archived stats record (sprint 8's, until OT-0);
  SVC-13's ranks and medals computed from SVC-12's records at every boundary per V7 and V8 (no ranking frame was
  captured, research 155 :349; "equal the archived rankings" dropped 2026-10-09); SVC-14's rank gates refuse and
  admit as V14 and the V8 tier say; SVC-17's filter drops a line SVC-18 delivered; SVC-13a's rating arithmetic as unit tests from `FUN_002253c0` and `FUN_00239d40` at the round boundaries; SVC-23d's vote kick counted at the round's end as research 91 §17 reads it *(the two added 2026-10-09 with the promotion)*. Proven level: ONL-32.
- **Dependencies:** the online path (sprint 17; through it 16's SVC-06, SVC-09a and 8's SVC-03, SVC-04, ONL-33, 17's
  SVC-14a); sprint 9 (PLAT-17 for SVC-18). SVC-12b's proven level waits for PLAT-36's PEEK.
- **Owner needs:** **OC-4 the room set**; the **clan cap** (SVC-09); the **ladder rating formula** if server-side
  (SVC-13); SVC-23's **ban scope, chat filter, idle kick**.
- **Main project:** none.
- **Parallel with:** the gameplay track's sprints.

### Sprint 11 -- The online path II: the main menu, LOGIN, the DNAS screen, SELECT UNIVERSE

- **Seat:** Craig. **After:** sprints 8, 9.
- **Status:** closed 2026-10-04 (the online path's plan Log, its close entry; merged to `main` by the controller under
  OT.R13). Every task merged and reviewed; the gate's rows in the Log; the carry in HANDOFF section 7.
- **Goal:** the main menu as the online path starts at it -- `dlgMenu` without its streams (MENU-02a) over the
  commands it and the online entry dispatch (MENU-01a); ONLINE the one live branch, and NEW GAME, LOAD GAME, OPTIONS,
  EXTRAS and LAN opening the desktop-recompilation screen (PLAT-28; MENU-03, MENU-08; OT.R5) -- then the online entry:
  the card prompts (OPT-05i), LOGIN with the saved configuration (ONL-01, OT.R3), EDIT NETWORK CONFIGURATIONS at
  PLAT-28's screen (ONL-02), the DNAS screen (ONL-03) and SELECT UNIVERSE (ONL-04).
- **Tasks (10, 22 pts):** MENU-01a, MENU-02a, MENU-03, MENU-08, PLAT-28, OPT-05i, ONL-01, ONL-02, ONL-03, ONL-04.
- **Gate:** `dlgMenu` scored >= 90 (TITLE_MIN_SCORE) against `s4_pcsx2/A_04.png` and
  `scripts/parity/ref_main_menu_ours.pcsx2.png` with the MENULOOP region masked (MENU-02a); CROSS on every item but
  ONLINE shows PLAT-28's screen at once and dispatches no command of the chain behind it (MENU-03, MENU-08); **LOGIN
  scored** against `00_login.png`, `A_06`, `A_30`, `A_31` and `refs/login.png`, the configuration rows against `A_31`
  (OT.R4; ONL-01's mark); **the DNAS screen** built from its record and set with DNASAuthenticate done on the first
  tick, its score owed to its manifest row until H70's capture (OT.R4); SELECT UNIVERSE against `01_universe.png`,
  `A_34` and `refs/universe.png`; OPT-05i's command tests; the menu's response to every button equals MENU-01a's
  command bodies (reading).
- **Dependencies:** sprint 9 (PLAT-05..PLAT-16, PLAT-21, PLAT-23); sprint 8 (ONL-01a, PLAT-26a, SVC-05); sprint 6
  (PLAT-25, PLAT-04, S1's `'bias'` UI-model path).
- **Owner needs:** PLAT-28's **look and wording** and the per-feature list; ONL-04's universe name and news; the DNAS
  capture (**H70**, the score's, not blocking the build).
- **Main project:** none (PLAT-36's runs for the proven level, not blocking).
- **Parallel with:** nothing on the path (Craig's lane runs it alone, OT.R7).
- **Demonstrable:** the page opens at the SOCOM II main menu; ONLINE leads through the card prompt, LOGIN and the DNAS
  screen to SELECT UNIVERSE on our server; every other item shows the desktop-recompilation screen.
- *(Until OT-0, 2026-10-02: "The main menu, 1:1, with its music and its movie", which read 9 tasks and 31 points; its
  parked half -- MENU-01, MENU-02, PLAT-22, PLAT-20, PLAT-19c, PLAT-29b -- is sprint 21; PLAT-19c and PLAT-20 went on
  from there to the opener's sprint 24 at OT.R11, the same day.)*

### Sprint 12 -- The boot's rest: the card check, the attract, region, the relaunch dialogs, the goldens

- **Seat:** Craig. **After:** sprints 15, 21.
- **Status:** parked until the online path runs (OT.R6), all of it. OT.R11 (2026-10-02) took the opener -- BOOT-02,
  BOOT-04, BOOT-06 -- to the path's sprint 24; until then it was titled "Boot to menu" and read 10 tasks and 32
  points. BOOT-05 stays here as BOOT-04's cited card stubs stand (a slice or owed, OT.R11); BOOT-10 and OPT-05a
  stand on their path slices BOOT-10a (sprint 16) and OPT-05i (sprint 11). Its After line read "sprints 11, 15" until
  OT-0 moved MENU-02 to 21; 21 now comes after 24, so this sprint follows the opener through it.
- **Goal:** the boot card check per card state, the attract after idle, region and the relaunch dialogs; the card's
  script set (OPT-05a); the audio goldens and the script-trace goldens that raise the runtime to proven. *(Until OT.R11
  also: the loader's RAW screens, the Sony and Zipper cards, INTRO_2, the hand-off into the menu -- sprint 24's.)*
- **Tasks (7, 21 pts):** BOOT-05, BOOT-07, BOOT-08, BOOT-10, OPT-05a, PLAT-33, PLAT-32.
- **Gate:** the attract fires after the idle constant BOOT-07 reads and a press returns; BOOT-05 answers each fixture
  card (a slot record built in the test, R7) as the archived `s8_save_yes` and KNOWN [card-folder] / [virgin-save] rows
  say; PLAT-33's audio goldens held by tests; PLAT-32's traces compare equal across two runs. *(The boot walked from the
  first loader frame to the settled menu over the title gate's s00..s18 window is sprint 24's gate since OT.R11.)*
- **Dependencies:** sprint 24, through 21 (BOOT-04 under BOOT-05 and BOOT-08, BOOT-06 under BOOT-07, PLAT-20 under
  PLAT-33; it read "sprint 21 (MENU-02 for BOOT-06)" until OT.R11 and "sprint 11" until OT-0); sprint 9 (PLAT-21);
  **sprint 15** (PLAT-26 and OPT-02 under BOOT-05; PLAT-26 under OPT-05a).
- **Owner needs:** **BOOT-01's window** (the boot captures: the proven level of every BOOT task); **PLAT-36's trace
  window** (the MPEG, MC and audio traces); BOOT-09's PS2-BIOS ruling arrives for sprint 13. (BOOT-02's hold time went
  to sprint 24 with it.)
- **Main project:** **PLAT-32's recomp tracing flag** for the zAnim dispatcher and VALVE (main-project work, an owner
  call), plus its lock-bound runs; PLAT-36's instrument runs. PLAT-32 is dispatched only when the flag exists; it
  shifts to the next sprint otherwise and nothing here waits on it.
- **Parallel with:** the online and gameplay tracks' sprints.
- **Demonstrable:** on the opener sprint 24 built, the boot's card dialogs appear per card state, and the menu idles
  into the attract and back exactly as the console does.

### Sprint 13 -- The memory card's screens, every state; the ARMORY folded

- **Seat:** Craig. **After:** sprint 12.
- **Status:** parked until the online path runs (OT.R6), all but PLAT-34 (the ARMORY folded), which OT-0 moved to the
  path's sprint 17 beside ONL-17 (2026-10-02); the title's "the ARMORY folded" is that history.
- **Goal:** each card state's screens (no card, unformatted, no space, overwrite, errors, removal, slot select), their
  timing, managing the card outside the game; the hardware branches and the loader's patch path; and sprint 5's ARMORY
  re-hosted on the generic dialog runtime before the game lobby's ARMORY row (ONL-17, Chris's 17) needs it.
- **Tasks (11, 17 pts):** OPT-05b, OPT-05c, OPT-05d, OPT-05e, OPT-05f, OPT-05g, OPT-05h, OPT-06, OPT-07, BOOT-09,
  BOOT-11.
- **Gate:** each card-state screen scored against OPT-19's captures (the unformatted state on a slot record with
  `formatted` false, OPT-05c -- R7; it read "on an erased image"; a refused write, a moved revision or a corrupt
  record showing the original's "Error saving" / "Error loading data", OPT-05f); OPT-06's durations within the ruled
  model; BOOT-11 follows OC-2; PLAT-34: the ARMORY's e2e and vitest suites green on the generic runtime with no
  behaviour change, `s2u.armory.v1` retired to the card.
- **Dependencies:** sprint 12 (OPT-05a, BOOT-05; and through it sprint 24's BOOT-02 and BOOT-04, which were 12's until
  OT.R11); **sprint 15** (ONL-05 for BOOT-11; OPT-20 for PLAT-34); PLAT-34 also sprints 6 and 7 (PLAT-07/08/09)
  and **sprint 5's close**.
- **Owner needs:** **OPT-19's window** (the card and options captures); OPT-07's **player-facing controls** (what a
  browser without storage reads as is closed by R7: no card, the controller's default, the owner may overturn it);
  OPT-06's timing model; BOOT-11 follows **OC-2** (ruled in sprint 15's ONL-05); BOOT-09's PS2 BIOS out of scope;
  PLAT-34's timing after sprint 5.
- **Main project:** none.
- **Parallel with:** the online and gameplay tracks' sprints. **Sprint 14** may begin OPT-09 beside it (OPT-01 is sprint 15's).
- **Size note:** small (20 points, 17 since OT-0 took PLAT-34 to 17) since the card's data moved to sprint 15; the seat
  may run it together with 14.
- **Demonstrable:** every card dialog of the original appears on cue, on a card the browser keeps.

### Sprint 14 -- The OPTIONS screens, and EXTRAS

- **Seat:** Craig. **After:** sprints 15, 21.
- **Status:** parked until the online path runs (OT.R6), all of it; meanwhile OPTIONS and EXTRAS open the
  desktop-recompilation screen (OT.R5; MENU-03's hook). Its After line read "sprints 11, 15" until OT-0 moved MENU-01
  and PLAT-22 to 21.
- **Goal:** every OPTIONS page as the original draws and persists it, each setting applied to the engine, the
  desktop-only hooks wired; and the EXTRAS hub with its movies, jukebox and unlock viewers (the EXTRAS half of the
  first list's sprint 15, folded here by MENU-OC-3's ruling (a)).
- **Tasks (13, 37 pts):** OPT-09, OPT-10, OPT-11, OPT-12, OPT-13, OPT-14, OPT-16, OPT-17, OPT-18, MENU-04, MENU-05,
  MENU-06, MENU-07.
- **Gate:** each page scored against OPT-19's captures (the triangle popup, the RETURN save flow, the brightness
  frames, presets pages 3 and 4); OPT-18's engine state per fixture card equals PLAT-36's PEEK (proven) and the
  `InitOptions`/`StoreOptions` reading; OPT-10's mix changes measured against PLAT-36's A/B runs; the desktop screen
  at HDD, 480p, Dolby/HEADSET and VIBRATION per the rulings; OPT-11's HEAD BOB acting on MATCH-04's first person; the
  EXTRAS hub and both viewers on both card states (fresh, and a slot record with campaign progress built in the test;
  R7: it read "an imported `.ps2`", and there is no import) scored against OPT-19's captures; the
  jukebox's stream starts equal to PLAT-36's log; the extras movies' ONMPEGEND returns against PLAT-36's trace.
- **Dependencies:** **sprint 15** (OPT-01, OPT-02, OPT-03; OPT-02 also for MENU-04's card with progress -- it
  read "OPT-08 for MENU-04's imported card" until R7 dropped OPT-08); sprint 21 (PLAT-22 for MENU-06, MENU-01 for
  OPT-09 and MENU-04; it read "sprint 11" until OT-0); sprint 11 (PLAT-28 for OPT-17); sprint 9 (PLAT-21 for MENU-05).
- **Owner needs:** **MENU-OC-6/7/8/9** (HDD, Dolby and HEADSET, 480p, VIBRATION); OPT-12's canvas-shift reading;
  OPT-13/14's presets and sliders on keyboard and mouse; OPT-18's **whether redotcom's own settings stay**;
  **MENU-OC-11** (unlocks without a campaign); MENU-05's call on the extras movies.
- **Main project:** PLAT-36's input traces, audio A/B and return trace (proven).
- **Parallel with:** the online and gameplay tracks' sprints.

### Sprint 15 -- The card's data: libmc, the saves and the personas, as JSON over the virtual card

- **Seat:** Craig. **After:** sprint 17.
- **Runs:** the online track, second: after sprint 20 (OT.R40). Its OPT-01, OPT-02 and OPT-03 also carry the card's
  CUIVarManager save that Chris's taunts integration is adding (`agent/taunts`).
- **Status:** **closed 2026-10-09, landed on `main` b4448d97e (PR #108)** (the plan [2026-10-08-web-sprint-15-the-cards-data.md](../plans/2026-10-08-web-sprint-15-the-cards-data.md),
  adopted 2026-10-09, its Log's close entry; the pull request into `main` is the merge controller's to land after his landing gate):
  PLAT-26, OPT-02, OPT-01, OPT-03, OPT-04 merged after fresh reviews, with ADDR-ONLINE (LATER's address-online rule), OPT-02b
  (W15.R6: the whole valve table at boot, no password-class var on the card) and VOICE-2 (OT.R44, the owner's solo playtest of the
  voice); ONL-05 closed by OT.R17; owed: the landing gate (no gate ran on the lane), `originalSettings.spec.ts`, the proven levels
  (PLAT-36's post-fix MC trace, OPT-19's diffs), the lobby-stall browser logging; the virgin-save clause struck (W15.R1).
  *(Until the close it read:)* scheduled for the online track, 2026-10-07, on the owner's word (OT.R40; its Seat read "Chris"); parked
  until then (OT.R6), all but the slices the flow needs, which ran in the path's sprint 8: libmc's file commands (PLAT-26a), the persona records (OPT-04a), the saved network configuration (ONL-01a)
  and OPT-20 (moved there for PLAT-34). PLAT-26 and OPT-04 stand on their slices. Its After line read "sprint 6".
- **The number's history:** in the first list sprint 15 was EXTRAS plus, under reading (b), the chain from NEW GAME /
  LOAD GAME to the mission load. The owner ruled option (a) (R1): the (b) group MENU-10..MENU-16 is future scope
  ([03](03-menus.md), the end of the file) and the EXTRAS half moved (MENU-04..MENU-07 to sprint 14, MENU-08 to sprint
  11), leaving the number empty. The two-seat revision of 2026-10-01 refilled it with the tasks below; it is **Chris's
  first sprint**, run before 8 (it waits on no owner call; 8 waited on OC-7 until the owner ruled it (c) on 2026-10-01, R6, and
  still waits on its box, retention and texts). **R7 (2026-10-01)** took PLAT-37 (the `.ps2` filesystem) and OPT-08
  (export and import) out, both dropped: the sprint was 9 tasks and 25 points, titled "the filesystem, libmc, the saves
  and the personas".
- **Goal:** the simulated card below its screens, over PLAT-25's two virtual slots (sprint 6): libmc's commands and
  result codes over the slot's file table, what `PersistentValves` holds (as JSON), the options save performing the
  original's files, names, nominal sizes and op sequence with our contents, the persistence rules, the persona records
  (SAVEPASSWORD and the password's length, never the password), the ARMORY's `WeapProfile` file; and the
  r0001-or-r0004 call the patch prompt follows. *(Until R7 it read: "the PS2 filesystem inside the `.ps2` image, libmc's
  commands and result codes over it, `PersistentValves`, the options save written as the game writes it, the
  persistence rules, the persona records with the server-issued credential, export and import of real PCSX2 cards, the
  ARMORY's `WeapProfile` file; and the r0001-or-r0004 call the patch prompt follows.")*
- **Tasks (6, 16 pts):** PLAT-26, OPT-02, OPT-01, OPT-03, OPT-04, ONL-05.
- **Gate:** PLAT-26's result codes equal `MemoryCard.cpp`'s on a file table built in the test, GetInfo's free 8000 on
  an empty card and the `mcUsedClusters` rule after a save; OPT-02's JSON holds the 65 valves the archived cards hold
  (read with the dev tool under `tools/`) and round-trips through the slot; OPT-01's save performs the f0 card's 12
  files at their nominal sizes in the recomp trace's op sequence, op for op and result for result, and reproduces the
  virgin-card first-save failure (KNOWN [virgin-save]); OPT-03's longevity rule as written by OPT-01 (reading level;
  its proven level is the recomp's save-and-relaunch diff, proven by OPT-19's window, listed under Owner needs);
  OPT-04's persona records keep the original's eight fields and caps, and a SAVE PASSWORD: YES login leaves
  SAVEPASSWORD and the password's length -- never the password or the remember token -- in localStorage; OPT-20's
  layout as unit tests from `FUN_0033eb70`, the loadout loading back (ONL-32's card for proven). *(Until R7 it read:
  "PLAT-37's formatter equals mymcplus's byte for byte, the f0 card's 12 files written into a fresh image read back
  byte-equal, and the owner's PCSX2 card lists as mymcplus lists it; PLAT-26's result codes equal `MemoryCard.cpp`'s;
  OPT-02 decodes the 65 valves and re-encodes the archived card's `PersistentValves.rdr` (its fixed 4,144 B)
  byte-equal; OPT-01's save reproduces the f0 card byte-for-byte including the fillers, and the virgin-card first-save
  failure (KNOWN [virgin-save]); OPT-08's `.ps2` export opens in mymcplus and imports back equal, the owner's PCSX2 card
  imports, and every export shows the credential warning; OPT-04's persona carries the server-issued credential, never
  the typed password (R4); OPT-20's layout as unit tests from `FUN_0033eb70`, the loadout loading back (ONL-32's card
  for proven)".)*
- **Dependencies:** sprint 6 (PLAT-02, PLAT-09, PLAT-25; R7 took PLAT-27 off this list) and the path's sprint 8
  (PLAT-26a, OPT-04a). Inside it: PLAT-26 and OPT-02 first; OPT-01 after both; OPT-03 and OPT-04 after OPT-01; ONL-05
  beside them. (OPT-20 left for sprint 8, OT-0.)
- **Owner needs:** OPT-04's **HOST value** (OC-3); **OC-2 r0001 or r0004** (ONL-05); **OPT-19's window** for OPT-03's
  and OPT-02's recomp save-and-relaunch and toggle diffs (the proven level; not blocking). (Two slots, the card's
  medium, no import or export, and SAVE PASSWORD are ruled: R7, which replaced R4; the remember token itself is
  SVC-03's, in sprint 8. OPT-08's export-warning wording went with OPT-08.) The f0 card's file list and the archived
  cards' valves are read on Craig's host with the dev tool under `tools/` (dev-host checks run there; CI builds its
  records in the test); the owner's PCSX2 cards are no longer needed here.
- **Main project:** PLAT-36's MC trace for OPT-01's and PLAT-26's op sequence (proven).
- **Parallel with:** the gameplay track's sprints.
- **Demonstrable:** an options change saved through the original's card prompts lands as the original's 12 files at
  their nominal sizes in the original's op order, and survives a reload with the persona and the loadout; another
  tab's save reads as the original's "card changed". *(Until R7: "a save written by the port opens in mymcplus and in
  PCSX2, and a PCSX2 card imports".)*

### Sprint 16 -- The online path III: the persona to the SOCOM II ONLINE menu, logoff; rooms and the bridge

- **Seat:** Craig. **After:** sprint 11.
- **Status:** **closed 2026-10-04** (the online path's plan's Log, the close entry): ONL-06, ONL-07, ONL-08, ONL-09, SVC-06,
  SVC-07a and SVC-09a merged, with the server's hardening (OT.R26) and the setup page, ARMORY and site batch (OT.R28-OT.R34);
  **ONL-10 and BOOT-10a carried to sprint 17**; the browser specs owed (host memory). Opened 2026-10-04 with sprint 17 (OT.R16).
- **Goal:** from SELECT UNIVERSE to the SOCOM II ONLINE menu: the persona form and list (ONL-06), connect with its
  errors and the card-save prompt (ONL-07), the agreement (ONL-08), the menu whole with the rows whose pages are parked
  drawn and inert (ONL-09, OT.R8; NO INVITATIONS from SVC-09a), logoff back to the main menu without the boot (ONL-10,
  BOOT-10a); and the services behind the rooms: rooms and the game list (SVC-06), the bridge up to the match's start
  (SVC-07a).
- **Tasks (9, 27 pts):** ONL-06, ONL-07, ONL-08, ONL-09, ONL-10, BOOT-10a, SVC-09a, SVC-06, SVC-07a.
- **Gate:** every screen scored against the `s4_pcsx2` online frames (`A_35`..`A_45`, `A_45_lobby2` for the menu's rows)
  with the 4:3 correction (KNOWN [online-7pct]) where a frame exists, and owed to its manifest row where none does
  (W9.R8); each connect error forced on the local service shows its dialog; logoff returns to the main menu as
  `s17_q2_logoff/online1/final.png` shows; the persona form's PASSWORD row on a persona saved with YES drawn masked
  from the stored length, the login presenting the remember token's cookie (R7); SVC-06's per-pair server tests and
  `B_43`'s columns; SVC-07a's registration, identity and launch tests.
- **Dependencies:** sprint 11 (the menu, LOGIN, OPT-05i); sprint 9 (PLAT-17's keyboard); sprint 8 (SVC-03, SVC-04,
  SVC-05, OPT-04a).
- **Owner needs:** ONL-08's **agreement text**; ONL-07's name rules (answered: OT.R32, H85); **OC-3** (HOST); **OC-4** (the room set, SVC-06);
  **ONL-32's window** (local stack only, R293) opens here for the proven level, not blocking.
- **Main project:** the local Horizon stack for ONL-32's transcripts.
- **Parallel with:** nothing on the path.
- **Demonstrable:** from the main menu, ONLINE leads through the original's screens to the SOCOM II ONLINE menu on our
  server, a persona saved on the simulated card, and logoff returns to the main menu.
- *(Until OT-0, 2026-10-02: Chris's "Online I: LOGIN to the SOCOM II ONLINE menu", which read 13 tasks and 35 points;
  LOGIN to SELECT UNIVERSE moved to 11, and its parked half -- ONL-31, ONL-15, OPT-15, SVC-07 -- is sprint 22.)*

### Sprint 17 -- The online path IV: briefing rooms, CREATE GAME, the game lobby, the ARMORY, loading: the match starts

- **Seat:** Craig. **After:** sprint 16.
- **Closed:** 2026-10-06 on `agent/online` (the close record in the online path's plan's Log): five close passes, the last dry; the gate green but one pre-existing red; the e2e main's known reds and nothing new; the pull request into `main` is the merge controller's.
- **Status:** running since 2026-10-04 (OT.R35, after sprint 16's close; ONL-10 and BOOT-10a carried in); every task
  but PLAT-34 (the fold, not done) merged on `agent/online` by 2026-10-05, the close in review (the online path's plan's Log); opened with sprint 16 (OT.R16); the first release's play list is Frostfire, Vigilance and
  Crossroads.
- **Goal:** the match's front door up to the start: the rooms list with each room's rank bits (ONL-11, SVC-14a), a
  briefing room with its chat panel drawn (ONL-12, ONL-23a), CREATE GAME public and private with its play list
  (ONL-13, ONL-14), the game lobby to the launch without chat and voice (ONL-16a), the ARMORY folded into the generic
  runtime and reached from the lobby (PLAT-34, ONL-17), the loading screen (ONL-18).
- **Tasks (10, 36 pts):** ONL-11, ONL-12, SVC-14a, ONL-23a, ONL-13, ONL-14, ONL-16a, ONL-17, PLAT-34, ONL-18.
- **Gate:** the plan's "Done means": two browsers on two machines on our server walk room -> create (public, then
  private with its password) -> play list -> lobby -> ARMORY -> lobby -> READY -> loading -> **the match starts**,
  every screen scored against ONL-32's captures where they exist and owed to its manifest row where none does; the
  lobby's countdown start equals ONL-32's two-instance ready-state capture (the `A_ready006` contradiction settled);
  the loading screen against the PCSX2 burst; PLAT-34: the ARMORY's e2e and vitest suites green on the generic runtime
  with no behaviour change, `s2u.armory.v1` retired to the card (OPT-20).
- **Dependencies:** sprint 16 (SVC-06, SVC-07a, ONL-09); sprint 8 (OPT-20 for PLAT-34, ONL-33 for ONL-23a); sprint 9
  (PLAT-15, PLAT-17); PLAT-34 also sprints 6 and 7 (PLAT-07/08/09) and **sprint 5's close**.
- **Owner needs:** **OC-4** (rooms), **OC-5** (answered by OT.R32 / H90; the lobby rulings: 10 s countdown, idle kick, 16-player queue against
  the original's 30 s READY gate and host launch); ONL-32's window; PLAT-34's timing after sprint 5.
- **Main project:** ONL-32's local stack.
- **Parallel with:** nothing on the path; sprint 23 follows it.
- **Demonstrable:** two players create, join and ready a game through the original's screens, and the match starts.
- *(Until OT-0, 2026-10-02: Chris's "Online II: briefing rooms, CREATE GAME, the map selector, the game lobby, the
  loading screen", which read 9 tasks and 37 points; ONL-16, ONL-23 and SVC-20a are parked in sprint 22, and PLAT-34
  came from 13.)*

### Sprint 18 -- Online III: friends, ignore, clans, rankings, the round's online screens, in-game chat

- **Seat:** Craig. **After:** sprints 10, 22.
- **Runs:** the online track, fifth and last of its five: after sprint 22 (OT.R40).
- **Status:** **the players' half CLOSED 2026-10-13, on `main` through checkpoints 1-4** (PRs #166, #172, #173, #175;
  `main` df0eb0d62; every row of its plan merged, each after a fresh review); **the clans' half CLOSED 2026-10-13 on `agent/online`, to `main` with checkpoint 6** (its close record written; CLAN-EIGHTY, the merge controller's fix row, to merge first) (the plan
  [2026-10-13-web-sprint-18-the-clans-pages.md](../plans/2026-10-13-web-sprint-18-the-clans-pages.md), W18.R12-R14):
  every row of its plan merged on `agent/online`, each after a fresh review (CLAN-ID-WIRE at 32a8b70be); **checkpoint 5 on `main`**
  by PR #181 (d1e16656f: ONL-26, ONL-27, ONL-28, ONL-29, TEXTS-OMIT, SCB-NOTES); checkpoint 6 (CLAN-TAG-ROUND,
  MCLAN-NOTES, CLAN-ID-WIRE, the close's documents round and its record, all on the lane) the merge controller's landing -- the plan's
  Log, 2026-10-13. *(Until then it read "the
  clans' half next".)*
  *(Until 2026-10-13 it read:)* **planned and adopted 2026-10-11** on `agent/online` (the plan
  [2026-10-11-web-sprint-18-the-carried-and-the-players-pages.md](../plans/2026-10-11-web-sprint-18-the-carried-and-the-players-pages.md),
  W18.R1-R8; the merge controller's word). W18.R1, the merge controller's split: that plan is the sprint's players'
  half, after sprint 22's carried items; the clans' pages ONL-26, ONL-27, ONL-28 and ONL-29 are the sprint's second
  plan, after the first; CLAN RANKING (ONL-30) goes to sprint 19 with SVC-11. *(Until then it read:* scheduled for the
  online track, 2026-10-07, on the owner's word (OT.R40; its Seat read "Chris"); parked
  until then (OT.R6), all of it; ONL-20 left for sprint 23 (it follows the match's
  start), and SVC-16 (friends, from 8) and SVC-15 (player info, from 10) joined their pages here (OT-0, 2026-10-02).
  Its After line read "sprint 17".*)*
- **Goal:** sprint 22's carried items first -- one decoder of the stats record, the void past a restore's abandoned
  lines, the seats told their rating and medal, the bots' hit share measured, the page's half of VOTE ALL -- then the
  social pages (FRIENDS, IGNORE, PLAYER RANKING with player info and the menu's top ten, the medal of merit beside the
  name and in the game lobby's lists; create clan, roster and leader pages, invitations, clan messages), the in-round
  scoreboard's online fields, the round and final screens from the real layouts, in-game text chat with taunts.
  *([2026-10-11, W18.R1-R4] the carried items, the top ten and the medal added; CLAN RANKING moved to sprint 19 with
  SVC-11. The Goal read "the social pages (FRIENDS, IGNORE, create clan, roster and leader pages, invitations, clan
  messages, PLAYER and CLAN RANKING with player info), ...".)*
- **Tasks (19, 43 pts):** the players' half (the plan, 15 tasks, 29 pts): SVC-12e (STATS-ONE), SVC-03a
  (REMEMBER-ROTATE), SVC-23g (LEDGER-RESTORE), SVC-07c (SEAT-TOLD), SVC-23h (BOT-AIM), SVC-23f, ONL-34, SVC-15a,
  ONL-30a, SVC-16, ONL-24, ONL-25, SVC-15, SVC-19, ONL-19; the clans' half (the second plan, 4 tasks, 14 pts): ONL-26,
  ONL-27, ONL-28, ONL-29.
- *([2026-10-11, W18.R9] SVC-03a added to the players' half, wave 1, on the merge controller's word (H178 answered); the
  Tasks line read "18, 42 pts: the players' half (the plan, 14 tasks, 28 pts)".)*
- *([2026-10-09, PROMOTE-155] SVC-15a promoted beside SVC-15; the Tasks line read "11, 31 pts".)*
- *([2026-10-11, sprint 18's adoption] W18.R1-R4: the carried items and ONL-30a, ONL-34 added, ONL-30 moved to sprint
  19; the Tasks line read "12, 32 pts: ONL-24, ONL-25, ONL-26, ONL-27, ONL-28, ONL-29, ONL-30, ONL-19, SVC-19, SVC-15,
  SVC-15a, SVC-16". Past the yardstick's 30-40 as one sprint, it runs as two plans, one implementer at a time (W18.R1).)*
- **Gate:** each page scored against ONL-32's captures; the clan flow create -> invite -> respond -> roster -> message
  across two instances with the server's records equal to Horizon's `-Show` diff; the PLAYER RANKING page shows SVC-13's
  ladder with ranks and medals equal to the archived frames; the round and final screens from `READERX.ZAR`'s
  layouts (README correction 1); a taunt heard by the other instance per SVC-19's path. *([2026-10-11, W18.R1]
  "the rankings page" is PLAYER RANKING's now, CLAN RANKING's with sprint 19; the players' half's own gate is its
  plan's -- the merge controller's landing gate and each task's acceptance, the proven level owed to the owner's
  windows.)*
- **Dependencies:** sprint 10 (SVC-08/09/10/12a/12b/12c/13/17); sprint 22 (OPT-15, SVC-07, SVC-23a, SVC-23b, SVC-23e);
  the path (ONL-09, ONL-16a). *([2026-10-11] the carried items' parents and ONL-34's ONL-16a added.)* *(It read
  "sprint 17 (ONL-16 for ONL-20); sprint 10 (SVC-08/09/10/13/15/16/17); sprint 16 (OPT-15, SVC-07)" until OT-0.)*
- **Owner needs:** ONL-32's window; SVC-09's clan cap and SVC-13's formula if still unruled.
- **Main project:** ONL-32's local stack; PLAT-36's stats PEEK for ONL-19's fields.
- **Parallel with:** the gameplay track's sprint 23; sprint 19 cannot start before it.

### Sprint 19 -- The round's edges: spectating, leaving, the START menu, ABORT, clan games; the proven-level sweep

- **Seat:** Craig. **After:** sprints 18, 23.
- **Runs:** the gameplay track, second and last: after sprint 23, and after the online track's sprint 18 (OT.R40).
- **Status:** *[2026-10-15: its third part, **the clans' finish**, CLOSED -- both checkpoints on `main` (PR #220, PR #223;
  5995ce0e2); the plan [2026-10-15-web-sprint-19-the-clans-finish.md](../plans/2026-10-15-web-sprint-19-the-clans-finish.md);
  H188 open for the owner]* **its clans' half adopted 2026-10-13** on `agent/online` (the plan
  [2026-10-13-web-sprint-19-clan-games-and-the-clans-ladder.md](../plans/2026-10-13-web-sprint-19-clan-games-and-the-clans-ladder.md),
  W19.R1-R6; the merge controller's word): SVC-11 (as CLAN-JOIN, CLAN-SWAP, CLAN-ROSTER-LADDER, CLAN-BOARD-SERVER) and
  ONL-30's CLAN RANKING, with ONL-20b (ONL-20's slice, from sprint 23), three carried rows and the forge's FG-29 and
  FG-28 (W19.R6, OT.R55); ONL-21 and ONL-22 a second plan after it (W19.R1). *(Until then it read:)* scheduled for the gameplay track, 2026-10-07, on the owner's word (OT.R40; its Seat read "Chris"); parked
  until then (OT.R6), all but ONL-22's slice (ONL-22a, leaving and coming back),
  which is sprint 23's. ONL-22 stands on it. Its After line read "sprint 17".
- **Goal:** WATCH GAME, leaving and the network-error dialogs, the in-round START menu online and ABORT back to the
  lobby, clan games and challenges and the CLAN RANKING page over them; and the sweep that takes every "reading" to "proven" once the four windows have
  run.
- **Tasks (6, 18 pts):** ONL-21, ONL-22, MATCH-01, MATCH-02, SVC-11, ONL-30.
- *([2026-10-13] MATCH-01 and MATCH-02 were built in sprint 18's players' half, on the owner's word of 2026-10-13
  (sprint 18's plan's Log, 01:14Z: "Please ensure that the in game start menu is a priority tonight"); merged at
  504ae730d and 77c4c2c88, on `main` through checkpoints 2 and 3. Their rows stay in this line until the sprint's plan
  re-cuts it.)*
- *([2026-10-11, sprint 18's adoption] ONL-30 (S), CLAN RANKING, moved here from sprint 18 with SVC-11, whose clan
  games give the clans' ladder its rating (W18.R1, the merge controller's split); whether OT.R40 lifts the clans'
  ladder's parking is sprint 18's plan's H-next a. The Tasks line read "5, 17 pts".)*
- **Gate:** each against ONL-32's captures (START pressed in a recomp online round, ABORT's landing); SVC-11's clan
  game posts its rating per the ruled formula, and CLAN RANKING shows the clans' ladder from it; the sweep: every manifest row of PLAT-31 marked proven or owed, with the
  owed rows on the owner's list.
- **Dependencies:** sprints 17 and 18 (ONL-12/13, SVC-23), 22 (ONL-16, SVC-07, OPT-15) and 23 (ONL-22a).
- **Owner needs:** SVC-11's **clan rating formula**; MATCH-01's VIBRATION follows MENU-OC-9; the four windows run.
- **Main project:** ONL-32's recomp online round with START pressed; PLAT-36.
- **Parallel with:** nothing: it is the last roadmap sprint (OT.R40; it read "sprint 20").
- **Size note:** small on purpose: it absorbs what the windows reopened in sprints 16-18.

### Sprint 20 -- Voice: lobby and match push-to-talk

- **Seat:** Craig. **After:** sprints 9 and 17.
- **Runs:** the online track, first: after its netcode items NET-DRAIN, NET-LOOK and NET-WIRE (OT.R39, OT.R40).
- **Status:** **closed 2026-10-08, landed on `main` bd8cea7e3 (PR #76)** (the plan [2026-10-08-web-sprint-20-voice.md](../plans/2026-10-08-web-sprint-20-voice.md), its
  Log's close and landing entries; the landing gate's record in the merge commit): every task merged after a fresh review
  (V-WIRE, SVC-20a, SVC-21, SVC-22a, SVC-20b-relay, SVC-20b-page, SVC-20c, SVC-22b, ONL-16b, MATCH-05, V-E2E, three close
  fixes); the gate GREEN in both views (wave 3) and the two voice specs green in a rendered browser; owed: `twoPagesMatch`'s
  three maps, the two-instance recomp run (proven level), the owner's ear (H137-H141). *(Until the close it read:)* scheduled
  for the online track, 2026-10-07, on the owner's word (OT.R39: "ensure the online track has it
  scheduled"); its Seat read "Chris" and its After "sprints 14 and 17" until then. Scoped 2026-10-07 from OT.R23 /
  OT.R24 and research 170; not dispatched. Research 170 originally proposed
  sprint 17, but that sprint closed before the proposed voice blocks were promoted, so this file does not rewrite the
  closed sprint. The browser implementation is no longer conditional on OC-6 or the recomp's Q5 work.
- **Goal:** the complete browser voice slice from the game lobby into a round: the original's per-channel floor and
  channel map, microphone capture, server relay and playback, ruled Opus narrowband sound, push-to-talk / headset UX,
  round-side dead / living / spectator / radio / mute routing, the lobby talk bar and icon, and the round HUD / marker.
- **Tasks (7, 23 pts):** SVC-20a, SVC-20b, SVC-20c, SVC-21, SVC-22, ONL-16b, MATCH-05.
- **Gate:** server tests pin the original floor and channel rules (one holder per channel; 1 s re-ask; 10 s talk,
  10 s lockout, 15 s host expiry; TEAM 0 / DEFENSE 1 / OFFENSE 2, side +4, spectator 10, the non-respawn dead zone,
  the respawn exception, radio and mute). The relay drops a frame from a sender without the floor and sends accepted
  frames only to that channel. A two-browser lobby run has A hold talk, B hear a known tone and show A in the original
  talk bar while C's competing press is busy; a two-browser round pins team-only routing, death / respawn routing,
  radio, mute and the original HUD / world talk indicators. The preset tests pin Goldeneye and RUN AND TALK so voice
  never also fires the secondary weapon swap. Audio is mono 8 kHz Opus at **6 kbit/s to start**. The two-instance
  recomp / PCSX2 voice reference remains the **proven** level when available, not an implementation gate.
- **Dependencies:** sprint 17 (ONL-16a and SVC-07a; SVC-20a stands on SVC-07a since OT.R39); sprint 9 (PLAT-11
  input). *(It also read "sprint 14 (OPT-10 for HEADSET VOLUME / voice options)" until OT.R39: voice plays at the
  original's default playback volume, `headset_controller` x 100 (R170.12), until OPT-10 builds the slider.)* Inside the sprint: SVC-20a -> SVC-20b / SVC-22 -> SVC-21; SVC-20c follows SVC-20a + SVC-20b;
  ONL-16b follows ONL-16a + SVC-20b + SVC-22; MATCH-05 follows SVC-20c + SVC-22.
- **Owner needs:** no blocking call. OT.R23 says browser voice now; OT.R24 fixes Opus narrowband at 6 kbit/s. H87's
  remaining browser adaptations use their recorded defaults until changed (mic notice, listen-only behaviour,
  keyboard key, modulation approximation).
- **Main project:** Q5 / the original voice run is a proven-level reference only, not a dependency.
- **Parallel with:** the gameplay track's sprints; on the online track it runs first.

### Sprint 21 -- The main menu's music and the offline commands

- **Seat:** Craig. **After:** sprints 17, 24.
- **Status:** parked until the online path runs (OT.R6). New at OT-0 (2026-10-02): sprint 11's parked half as it
  stood before the re-cut -- the main menu with its music and its movie (MENU-02, over its path slice MENU-02a), the
  rest of the offline commands (MENU-01, over MENU-01a), streamed music (PLAT-22) and the load-budget threshold
  (PLAT-29b). OT.R11 (2026-10-02) took movie audio (PLAT-20) and the decoder in real time (PLAT-19c) to the opener's
  sprint 24: it read "The main menu's streams ...", 6 tasks and 28 points, and its After line "sprint 17" until then
  (PLAT-29b stands on PLAT-19c). The menu's music is owed along the path, not blocking (OT.R8).
- **Goal:** sprint 11's former goal for these: the first screen a player sees validated whole -- `dlgMenu` over
  MENULOOP, every offline command behind its rows, the title ring and the menu's music; the 30 s threshold set.
- *(2026-10-07, OT.R40: ONL-31, the online screens' music, moved here from sprint 22 so that 22, unparked, stands on
  nothing parked: it is a PLAT-22 stream. The front end's music streams already play (MENU-MUSIC, research 152,
  2026-10-03), so nothing on the path waits on it. This sprint read 4 tasks and 22 points.)*
- **Tasks (5, 23 pts):** MENU-01, MENU-02, PLAT-22, PLAT-29b, ONL-31.
- **Gate:** sprint 11's former gate for these: `dlgMenu` scored >= 90 against the four menu captures (PC research 64)
  and the `s4_pcsx2` frames, unmasked (MENULOOP decoded by PLAT-19b, in real time by PLAT-19c); the response to every
  button equals MENU-01's command bodies (reading) and PLAT-32's trace (proven); PLAT-29b's spec fails at the owner's
  threshold; ONL-31 by the audio parity method. *(PLAT-19c's 29.97/30 fps over INTRO_2 and the menu-with-movie frame against golden s07 are sprint 24's
  gate since OT.R11.)*
- **Dependencies:** the online path (sprint 17; through it 11's MENU-01a and MENU-02a); sprint 24 (PLAT-19c under
  PLAT-29b; PLAT-20 beside MENU-02's movie); sprint 9 (PLAT-19b, PLAT-21); sprint 7 (PLAT-18); sprint 6 (PLAT-29a).
- **Owner needs:** PLAT-29b's **which phase the 30 s covers**; PLAT-19c's weight in it.
- **Main project:** PLAT-36's audio and 989snd runs for PLAT-22's and ONL-31's proven level (the window, not a blocker).
- **Parallel with:** the online and gameplay tracks' sprints.

### Sprint 22 -- Online: the bridge's results, ONLINE OPTIONS, filters and lobby chat

- **Seat:** Craig. **After:** sprints 10, 15.
- **Runs:** the online track, fourth: after sprint 10 (OT.R40).
- **Status:** **closed 2026-10-11** at 4718bcc11 on `agent/online` (the plan's Log, its close entry: ten tasks merged, each reviewed by a fresh reviewer; the pull request the merge controller's, his landing gate the sprint's gate). *(Was:* **adopted 2026-10-10** on `agent/online` (the plan
  [2026-10-10-web-sprint-22-the-results-and-the-lobbys-text.md](../plans/2026-10-10-web-sprint-22-the-results-and-the-lobbys-text.md),
  W22.R1-R7; the merge controller's word), its tasks dispatched one at a time from that day. *(Until then it read:)*
  scheduled for the online track, 2026-10-07, on the owner's word (OT.R40; its Seat read "Chris" and its
  After "sprints 10, 15, 21": ONL-31, the only task on 21, moved there, parked). Parked until then (OT.R6). New at OT-0 (2026-10-02): sprints 16's and 17's parked
  halves as they stood before the re-cut -- SVC-07 (the results after the match, over its path slice SVC-07a), ONL-15
  (filters and AUTOPLAY), OPT-15 (ONLINE OPTIONS), ONL-31 (the online screens' music), ONL-16 (the lobby's chat and
  voice, over ONL-16a) and ONL-23 (text chat, over ONL-23a). SVC-20a moved to sprint 20 in the
  2026-10-07 voice re-cut. What the path owes along the way (OT.R8) here is text chat, ONLINE OPTIONS, the filters and
  AUTOPLAY, and the online music.*)*
- **Goal:** text chat in the briefing room and the game lobby, ONLINE OPTIONS and the filters, and the match's results
  posted to the services. *([2026-10-10, sprint 10's close] SVC-12d, SVC-23a and SVC-23b are this sprint's by PROMOTE-155, ratified by the merge controller 2026-10-09: the per-seat signals, the ladder's limits and the void, the round's cheat signals -- each on SVC-07; with them the vote's rejoin refusal and VOTE ALL, one proposed slice of SVC-23, research 263 §5.3.)*
- **Tasks (10, 30 pts):** SVC-07, SVC-12d, SVC-23a, SVC-23b, SVC-23e, ONL-15, ONL-16, ONL-23, OPT-15, PROVE-1.
- *([2026-10-09, PROMOTE-155] SVC-12d promoted before SVC-07, SVC-23a and SVC-23b after it; the Tasks line read "5, 23
  pts".)*
- *([2026-10-10, PROMOTE-22] the Tasks line read "8, 32 pts"; ONL-16 re-sized S per W22.R5; SVC-23e and PROVE-1 added
  (W22.R6, W22.R7).)*
- **Gate:** the former gates of 16 and 17 for these: SVC-07 posts the stats record a local round produced and SVC-13's
  ladder moves; the two-client chat exchange compared with `A_chat_02_entered.png`, `B_chat_A_to_B.png` and
  `A_chat_B_to_A.png`; ONL-15's filtered list for a seeded game set matches the recomp's. *([2026-10-10, the plan's
  gate])* The merge controller's landing gate (`npm run typecheck`, `bash workflow/gate.sh` with the data and with
  `--no-data`) green with each task's acceptance -- SVC-12d's scripted match's results equal to the hand count, SVC-07's
  result applied once and in order with SVC-13's ladder moving after a played web match, SVC-23a's excluded result and
  the void's two cases, SVC-23b's flags on scripted matches and on none of the honest bot matches, SVC-23e's -972 over
  the bridge, ONL-15's filtered list for a seeded set, OPT-15's SAVE diff against `logs/parity/s16_l1b_step0b`,
  ONL-23's lines drawn and scrolled, PROVE-1 green on the s4 slice -- and the proven level (ONL-32's transcripts,
  PLAT-36's PEEK, through PROVE-1) owed to the owner's windows, not a gate.
- **Dependencies:** sprint 10 (SVC-12a, SVC-12b, SVC-12c, SVC-13, SVC-13a, SVC-17, SVC-18, SVC-23d); sprint 15
  (OPT-01, OPT-02, OPT-03); the path (SVC-07a, ONL-16a, ONL-23a). *(It read "sprint 21 (PLAT-22 for ONL-31)" too until OT.R40.)*
- **Owner needs:** ~~SVC-07's **who posts the stats**;~~ *(2026-10-11, struck at sprint 22's close review: answered --
  H86 call 1, LADDER-AUTHORITY, the match server and never the page (OT.R33, 2026-10-04: the other calls by research
  155's recommendation), built on it by W22.R1)* ONL-32's window.
- **Main project:** ONL-32's local stack.
- **Parallel with:** the gameplay track's sprints.

### Sprint 23 -- After the match starts: the round and final screens, leaving and coming back

- **Seat:** Craig. **After:** sprint 17.
- **Runs:** the gameplay track, first: after its sprint 32, "Following and pathing, the other EXTRACTION maps, then
  ESCORT and BREACH" (`docs/plans/2026-10-06-hostage-and-modes.md`; OT.R40).
- **Assigned by OT.R40 (2026-10-07):** Craig's seat, the gameplay track; its Seat read "Chris". ONL-20 is already built:
  sprint 26's PF-26, the owner's ruling of 2026-10-04 (the three-maps plan: "done there"), so what is left here is
  ONL-22a and ONL-20's close against the gate below. Until OT.R40: **Not assigned by OT.R7.** The owner's word covers the online work up to the match's start; what follows it is not
  assigned (the plan's OT.R7 and its question 1: Chris's lane is the owner's to say). These two tasks stood in Chris's
  lane (sprints 18 and 19) and are held there until the owner says. They are not parked: the plan keeps them as the
  path's tail after the start.
- **Goal:** the round and final screens from the real layouts, returning to the game lobby (ONL-20), and leaving a game
  -- one player aborts, or the host abandons it -- and coming back (ONL-22a).
- **Tasks (2, 4 pts):** ONL-20, ONL-22a.
- *([2026-10-14, sprint 19's second half; research 315 §5, §6 E6] ONL-22a is built at the reading level: ABORT's
  `dlgNetAbort.rdr` and its landing by MATCH-02 (sprint 18, 77c4c2c88); the abandon's `dlgNetAbandoned.rdr` by ONL-18's
  route and PF-27's triggers, its match-side landing pinned on the disc by NET-ERRNO (25dabe0ae) with
  `dlgNetBanned.rdr`'s and `dlgNetError.rdr`'s, in [sprint 19's second half](../plans/2026-10-14-web-sprint-19-watch-game-and-leaving.md);
  roadmap 05's ONL-22a "Today". Left of it: the gate's recomp comparison (ONL-32) and the abandon's scope
  (`ABANDON_LATE_JOINER_READING`, W19.R10, flagged).)*
- *([2026-10-13, sprint 19's clans' half, W19.R5] ONL-20's return to the game lobby after a full game was not built
  (research 309, R309.3: the room starts the next match itself; the page's `matchOver` called only by tests) -- taken as
  **ONL-20b** into [sprint 19's clans' half](../plans/2026-10-13-web-sprint-19-clan-games-and-the-clans-ladder.md), same
  seat, the merge controller's word; this sprint's ONL-20 close then stands on it.)*
- *(2026-10-04, the owner's ruling in the main merge controller's seat, relayed by the sprint 26 controller: the round
  and final screens, from READERX, research 179 C1-D, are built in sprint 26 as a parallel stream; leaving and coming
  back stays here.)*
- **Gate:** ONL-20's layouts parsed and every placeholder replaced by a cited value, a recomp capture of a round end
  and a match end compared (none exists: owed to its manifest row); ONL-22a's two dialogs forced on the local stack and
  compared with the recomp's, or owed.
- **Dependencies:** sprint 17 (ONL-12, ONL-16a); sprint 7 (PLAT-05, PLAT-07).
- **Owner needs:** ONL-32's window (who takes it: answered by OT.R40).
- **Main project:** ONL-32's local stack.
- **Parallel with:** the online track's sprints.
- **Size note:** small on purpose: the two tasks after the start, cut out so that the path's sprints end at the start.

### Sprint 24 -- The online path V: the opener -- the loader's screens, the cards, the trailer, into the menu

- **Seat:** Craig. **After:** sprint 11.
- **New at OT.R11 (2026-10-02).** The owner: "once that work is complete, proceed agentically through creating the
  entire game opener zipper text -> trailer -> menu etc etc". The boot sequence from the loader's screens through the
  Zipper and Sony cards and the intro trailer with its sound, in real time, into the main menu is on the path; `/` is
  its route (OT.R10). Un-parked from sprint 12 (BOOT-02, BOOT-04, BOOT-06) and sprint 21 (PLAT-19c, PLAT-20) by OT-11;
  the plan's "On the path" table has the line. BOOT-02 is done on `agent/online` (web research 130), PLAT-19c (research
  120 §11) and PLAT-20 (research 137) too; BOOT-04 is in flight.
- **Goal:** the page opened at `/` under `menuflow` starts at the loader's screens (BOOT-02) and runs the game's own
  boot dialogs in their order (BOOT-04: `dlgIntroScreen` -> `dlgIntroCinematic` with SONY448, the Sony and Zipper
  cards -> `dlgSecondCinematic` with INTRO_2 -> `goto_menu`), the movies decoded in real time at their rates
  (PLAT-19c) with their PCM track in sync (PLAT-20), and hands off into `dlgMenu` over MENULOOP with the original fade,
  footer and version string (BOOT-06, on MENU-02a). The card check and the hardware branches stay BOOT-04's cited
  stubs: BOOT-05 only as a slice or owed, BOOT-09 parked; the attract (BOOT-07) and the menu's music (PLAT-22) owed,
  not blocking (OT.R8).
- **Tasks (5, 17 pts):** BOOT-02, BOOT-04, PLAT-19c, PLAT-20, BOOT-06.
- **Gate:** the boot walked from the first loader frame to the settled menu and scored against BOOT-01's PCSX2 set
  over the title gate's s00..s18 window (>= 90 each; until BOOT-01 runs, the archived `pcsx2_mission_a/s00..s06` and
  `x51_gate_iop/title/w00_*`, each matched step >= 90, BOOT-04's reading level); BOOT-02's LOADING.RAW >= 98 against
  `s00_CROSS.png` (research 130: 99.9) and its dimensions from the loader's call arguments in a unit test; PLAT-19c
  sustains 29.97/30 fps with 0 dropped pictures over INTRO_2 on the owner's machine, the menu-with-movie frame >= 90
  against golden s07, its budget line in PLAT-29a's table; PLAT-20's cross-correlation >= 0.99 against the disc PCM
  across INTRO_2 and MENULOOP with 0 underruns; BOOT-06's s00..s18 >= 90 against `ref_main_menu_ours.png`. A scored
  item with no reference frame is owed to its manifest row, never met by another state's frame (W9.R8, W9.R12).
- **Dependencies:** sprint 11 (MENU-02a under BOOT-06); sprint 9 (PLAT-10, PLAT-21, PLAT-19b); sprint 7 (PLAT-14,
  PLAT-18, PLAT-30); sprint 6 (PLAT-03, PLAT-06, PLAT-29a, BOOT-03). Inside it: BOOT-02 and BOOT-04 first, PLAT-19c and
  PLAT-20 beside them, BOOT-06 last (the boot before the menu's hand-off).
- **Owner needs:** **BOOT-01's window** (the hold times, the screen timings, the loop seam: the proven level); BOOT-02's
  hold time in a browser without IRX loads (proposed: PCSX2's measured durations); **PLAT-36's trace window** (BOOT-04's
  call trace, PLAT-20's audio dump); PLAT-19c's headed `SUSTAINED=1` run on the owner's machine.
- **Main project:** PLAT-36's instrument runs (the window, not a blocker).
- **Parallel with:** sprints 15, 10 and 23 (Chris's parked sprints until OT.R40), nothing on the path (OT.R7). Inside Craig's lane it runs
  beside sprints 16 and 17 where a seat is free: its first tasks landed beside sprint 9's close, and the owner's order
  puts its close after the match's start ("once that work is complete").
- **Demonstrable:** the page starts at the loader screen and arrives at the menu through the opening -- the cards, the
  trailer with its sound -- exactly as the console does.

**Sprints 33-36, the playtest mode and the replays (a pointer: the plan and the spec carry them, 2026-10-07).** Craig's
lane `agent/playtest` (the merge controller reserved the numbers 2026-10-06); it waits on none of the path's sprints,
merges `main` often and touches `room.ts` only through an additive `RoomOptions` hook. The spec is
[`../specs/2026-10-06-playtest-and-replay-design.md`](../specs/2026-10-06-playtest-and-replay-design.md) (the owner's brief of
2026-10-04, approved 2026-10-06); its section 7 holds the four sprints' tasks (PT-01..PT-29). **33** "the recording and the
room" (closed 2026-10-07 at bbededfc) -- [plan](../plans/2026-10-06-web-sprint-33-recording-and-the-room.md): the `.s2r` format, the Room recorder, the
playtest room's instruments, the session service, offline segments, `REPLAYS_DIR`, the e2e. **34** (closed 2026-10-08 at a77e034ef) the session skill, the
observations and the live report, closeout, the durability gate. **35** ([plan](../plans/2026-10-08-web-sprint-35-the-replay-viewer-and-the-loop.md), closed 2026-10-08 at 3eea4e22e) the replay viewer in the test room, fix-now and the
retest, the acceptance e2e. **36** ([plan](../plans/2026-10-08-web-sprint-36-every-match-recorded.md), closed 2026-10-09; landed PR #113) every online match recorded, retention, the list endpoint, the owner rows for placement
and visibility. Everything in them is a playtest instrument or a browser adaptation with no original (PT.R3); none of its tasks
counts toward the backlog's totals above. **37** "the playtest tooling" ([plan](../plans/2026-10-09-web-sprint-37-the-playtest-tooling.md), adopted and closed 2026-10-09): #100's one command and one link, PB-5 (i)-(iii), LATER 16-18, and the launch settings before the launch on /testroom and /playtest (PTT-9, W37.R6, the owner's request). **38** "the replay engine" (the owner's approval of the proof of concept, 2026-10-09; W37.R7, narrowed the same evening; [plan](../plans/2026-10-10-web-sprint-38-the-replay-engine.md), adopted and closed 2026-10-10): the state on a seek (244 §7.2's residue), the server's records and retention, and the test room's replay mode; the replay viewer's page (the per-account list, the transport bar, the polish to release) is the parallel tree `agent/modern-ui`'s (MU.R9, MU-10). **39** "the replay viewer to release" ([plan](../plans/2026-10-11-web-sprint-39-the-replay-viewer-to-release.md), adopted 2026-10-11 and closed 2026-10-12 at e7ffafbad): the owner's three issues with the proof of concept, the modern Replays page taken over by this lane (W39.R1), the watcher's HUD, sprint 38's carried engine items, LATER 27 and 30, and the release path -- the console's Replays and its Watch opening the viewer (RV-12 = the console plan's CX-15).

### Sprint 42 -- The browser's video settings page: render scale, performance options, an FPS overlay, a no-GPU notice

- **Seat:** Craig. **After:** none.
- **Status:** scheduled 2026-10-29 on the owner's word in the dispatch seat 04 ("Active, next sprint", his answer to
  "active next sprint, or future scope"); no plan yet. It runs beside the client profiling lane (CPF,
  `docs/plans/2026-10-28-client-performance-compare.md` on `agent/cpf`), whose GPU runs say which options buy the most
  frames.
- **Track:** product (OT.R53): a browser adaptation with no original, labelled as one; at its defaults nothing the game
  draws changes, and the original's VIDEO OPTIONS screen is not touched.
- **Goal:** players on weak or GPU-less machines get a playable frame rate and can see it: one browser video settings
  page with a render scale and its presets, the expensive passes switchable, an FPS overlay, and a notice with a help
  link when WebGL runs on a software renderer.
- **Tasks (1, 3 pts):** PLAT-38.
- **Gate:** PLAT-38's acceptance: the defaults pinned to today's values by unit tests, each preset's scale and passes
  unit-tested, the overlay and the notice seen in a rendered browser run, the notice's renderer strings unit-tested; the
  client profiling lane's runs quoted in the plan's Log, before and after, per preset.
- **Dependencies:** none in the backlog (PLAT-38's Dependencies line).
- **Owner needs:** none (the presets' names and steps are a product-track matter of taste, the controller's).
- **Main project:** none.
- **Parallel with:** any sprint; it pairs with the client profiling lane (CPF).
- **Size note:** one M task, small on purpose: the owner's "next sprint", cut so it can start at once.

## The owner windows

Four tasks are owner-scheduled game-run windows (lock-bound; HUMAN_TASKS rows), not sprint work. No task waits on
them to be dispatched; each raises its segment from reading to proven. The sprint named is where the first proven
level is wanted; one window per row covers everything its **Proven by** lines name.

| Window | Size | Wanted by | Serves |
|---|---|---|---|
| BOOT-01 -- boot and attract captures (PCSX2 and recomp) | M | sprint 24 (the opener, OT.R11; it read "sprint 12") | BOOT-02, 04-10; BOOT-05's card states |
| OPT-19 -- menus, options and card captures | M | sprint 13 (PLAT-31 wants it from sprint 9) | PLAT-11, PLAT-16, MENU-02/03/04/07, OPT-02/03/05b-h/06/09-15 |
| PLAT-36 -- the recomp trace window (RDRAM, call, MPEG, MC, audio, PEEK, input, `[sceCd*]`) | M | sprint 24 (BOOT-04's call trace, PLAT-20's audio dump; it read "sprint 12") | PLAT-03/05/10/12/16/20-23/26/33, BOOT-04/05/07/08, MENU-01/02/05/06, OPT-01/02/10/13/14/18, SVC-12b, MATCH-04 |
| ONL-32 -- the online reference set: captures and Medius transcripts (local stack only, R293) | L | sprint 16 | every ONL, SVC and MATCH task; OPT-20's card |

PLAT-32 (the script and state trace goldens) is sprint 12's but needs **main-project work** first (a recomp tracing
flag for the zAnim dispatcher and VALVE) and its own lock-bound runs; it moves to the first sprint after the flag
exists and nothing depends on it (README rule 1).

## The order, in one table

| # | Name | Seat | Tasks | Pts | After | Parallel with | Needs the owner for | Main project |
|---|---|---|---|---|---|---|---|---|
| 6 | Foundations and the four spikes, first person | Craig | 16 | 30 | -- | -- | OC-7 shape; Explore camera | -- |
| 7 | The dialog runtime and the harness | Craig | 8 | 36 | 6 | -- | -- | -- |
| 9 | Screens, widgets, input, popups, keyboard, movies | Craig | 10 | 38 | 7 | -- | key bindings, map viewer | -- |
| 8 | The online path I: the services and the card's data the flow calls | Craig | 8 | 16 | 6 | 9 | box, retention, texts, OC-3; no deploy | -- |
| 11 | The online path II: the main menu, LOGIN, DNAS, SELECT UNIVERSE | Craig | 10 | 22 | 8, 9 | -- | PLAT-28 wording, universe texts; H70 (the DNAS score) | -- |
| 16 | The online path III: persona to the ONLINE menu, logoff; rooms and the bridge | Craig | 9 | 27 | 11 | -- | agreement text, name rules, OC-3, OC-4; ONL-32 | local Horizon stack |
| 17 | The online path IV: rooms, CREATE GAME, the lobby, the ARMORY, loading: the match starts | Craig | 10 | 36 | 16 | -- | OC-4, OC-5; ONL-32; sprint 5 closed | local stack |
| 24 | The online path V: the opener -- the loader's screens, the cards, the trailer with its sound, into the menu | Craig | 5 | 17 | 11 | 15, 10, 23 | BOOT-01 and PLAT-36 windows; the hold time | instrument runs (window) |
| 21 | The main menu's music, the offline commands, the online music (parked) | Craig | 5 | 23 | 17, 24 | 15, 10, 23 | 30 s phase | audio runs (window) |
| 12 | The boot's rest: the card check, the attract, the relaunch dialogs, the goldens (parked) | Craig | 7 | 21 | 15, 21 | 22 | BOOT-01 and PLAT-36 windows | PLAT-32 tracing flag |
| 13 | The memory card's screens (parked) | Craig | 11 | 17 | 12 | 18 | OPT-19 window, card controls | -- |
| 14 | The OPTIONS screens, and EXTRAS (parked) | Craig | 13 | 37 | 15, 21 | 18, 19 | MENU-OC-6/7/8/9/11, own settings, extras movies | input/audio traces (window) |
| 15 | The card's data: libmc, saves, personas (online track) | Craig | 6 | 16 | 17 | 21 | OC-2, OC-3; OPT-19 window | MC trace (window) |
| 10 | Services: the stats record, clans, ladder, chat (online track) | Craig | 14 | 40 | 17 | 21 | OC-4 rooms, clan cap, formula, moderation | -- |
| 22 | Online: results, options, filters, chat (online track) | Craig | 10 | 30 | 10, 15 | 12 | who posts stats; ONL-32 | audio runs; local stack |
| 23 | After the match starts: round screens, leaving (gameplay track) | Craig | 2 | 4 | 17 | 21 | ONL-32 | local stack |
| 18 | Online III: the carried items, social, clans, player ranking (online track; two plans) | Craig | 19 | 43 | 10, 22 | 13, 14 | ONL-32 | stats PEEK |
| 19 | The round's edges, clan games and CLAN RANKING, the proven sweep (gameplay track, last) | Craig | 6 | 18 | 18, 23 | -- | formulas; the four windows run | online round with START |
| 20 | Voice: lobby + match PTT (online track, first) | Craig | 7 | 23 | 9, 17 | 23 | H87 defaults unless changed | Q5 proven-level reference |
| 42 | The browser's video settings page: render scale, performance options, FPS overlay, no-GPU notice (a browser adaptation) | Craig | 1 | 3 | -- | the client profiling lane (CPF) | the presets' taste is the controller's (OT.R53) | -- |
| -- | The owner windows | the owner | 4 | 16 | -- | any | BOOT-01, OPT-19, PLAT-36, ONL-32 | the runs |
| | **Craig** | | **177** | **497** | | | | |
| | **Total** | | **181** | **513** | | | | |

## The decisions behind the order

1. **Risk first, as spikes (sprint 6).** FMV (PLAT-19a), the card's quota (PLAT-25), the service shape (SVC-01) and the
   budget table (PLAT-29a) are each an S or M that can change what the L tasks behind them are; they run before the
   runtime so that PLAT-19b, OPT-01 and sprint 8 are built on a ruling, not a guess. Two of the rulings came on
   2026-10-01 (R3 the decoder, R4 the card's store), so those spikes now prove a choice rather than make one. *(R7
   replaced R4 the same day: the card's store is two virtual slots in localStorage, and its quota is no longer a
   risk -- it was measured before the ruling, in Chromium 153.)* Voice is
   the fifth risk and is the one that cannot be spiked: its reference does not exist yet (SVC-20b's own acceptance), so
   it is a conditional last sprint with its readable half (SVC-20a) pulled forward into sprint 17. *(2026-10-07: no
   longer conditional -- OT.R23 lifted the gate for the browser -- and the whole slice, SVC-20a with it, is sprint 20,
   first on the online track, OT.R39.)*
2. **The harness before any screen (sprint 7).** PLAT-30 needs no runtime and the README's rule puts it first in its
   section; every BOOT, MENU and OPT gate here is a PLAT-30 score, so it lands with the runtime, not after the menu.
3. **Two tracks, now two seats.** Segment 06 depends on no screen until ONL-09 (sprint 16) and the screens depend on it
   only from ONL-04 on; sprints 8 and 10 run beside 7 and 9 on a second seat, which is the project's established shape
   (sprint 4's three implementers; the cloud seat beside the local one). The tracks meet at sprint 16. *(Revised
   2026-10-01: the second seat is Chris's and carries the whole online lane, decision 11.)*
4. **The main menu is the first whole increment (sprint 11),** the README's critical path to the first 1:1 screen; the
   boot is after it because BOOT-06 is the hand-off into a menu that must exist first (README rule 2), and because the
   menu, not the loader, is what a play-test judges. *(OT.R11, 2026-10-02: the boot's opener is sprint 24, after 11 and
   on MENU-02a; decision 13.)*
5. **The card before the OPTIONS screens (15 and 13 before 14; until the two-seat revision this read "13 before
   14", the card's data being 13's):** OPT-09's RETURN flow saves to the card, and every OPTIONS
   page's persistence is OPT-01's; the card is also what the online entry (ONL-01, the slot popup; ONL-06, the persona)
   stands on, so 13 is the latest the online sprints can wait for.
6. **The campaign's doorstep was its own conditional sprint (15),** so MENU-OC-3's ruling would change one row of this
   table rather than the shape of 14. The owner ruled (a) on 2026-10-01: the (b) group left the plan and its EXTRAS half
   folded into 14; the two moves that keep 14 under the ceiling (MENU-08 to 11, PLAT-34 to 16) are each the task's
   earliest-useful or latest-safe sprint.
7. **The online screens in walk order (16, 17, 18, 19):** each sprint's gate is a walk two instances can perform on the
   local service, in the order the player meets the screens, so ONL-32's one window serves four sprints and each gate
   is demonstrable on its own.
8. **The windows are rows, not sprints.** They are owner time under the loop lock; a task reaches reading without
   them and proven after them, so no sprint is blocked by one, and the "wanted by" column tells the owner the latest
   useful date.
9. **PLAT-34 (the ARMORY fold) sits in 13,** after sprint 5's close and after the runtime it folds into has carried the
   main menu and the boot (so the fold is a port onto a proven runtime, not a rewrite beside an unproven one), and
   before ONL-17 (sprint 17) puts the ARMORY behind the game lobby. It moved from 14 to 16 on 2026-10-01 to make room
   for EXTRAS, and from 16 to 13 the same day at the two-seat revision: it re-hosts the viewer's own ARMORY code, which
   is Craig's lane, and 13 had the room once the card's data left it.
10. **Sizes.** No sprint exceeds 38 points or carries more than three L tasks except sprint 7 (four: the runtime chain
    PLAT-05 -> 07 -> 08 and the independent harness PLAT-30, split among implementers; a count the 2026-10-01 re-check
    found); sprint 8 is small because its ruling may come late; sprint 19 is small because it absorbs the windows'
    findings. Sprint 6 holds 16 tasks (17 until R7 dropped PLAT-27), above the 8-15 yardstick, because most of them
    are S (documents and spikes);
    sprint 13 held 17 until the two-seat revision took the card's data to 15 and left it 12 (20 points, the smallest
    of Craig's); OT-0 (2026-10-02) took PLAT-34 to 17, leaving it 11 (17 points). Of the sprints OT-0 made or re-cut,
    17 is the largest (36 points, three L: ONL-12, ONL-13, ONL-16a) and 21 carries three L (MENU-01, MENU-02,
    PLAT-22); 23 is small on purpose (the path's tail after the start). *([2026-10-11, PROMOTE-18] two sprints now
    pass the 38 points the first sentence names: sprint 10 at 40 points (14 tasks) and sprint 18 at 42 points (18
    tasks), which runs as two plans of 28 and 14 points, one implementer at a time (W18.R1, the merge controller's
    split).)*
11. **Two seats, two lanes (the owner, 2026-10-01).** Craig keeps sprint 6 whole and takes the front end offline (7, 9,
    11, 12, 13, 14); Chris takes online end to end (15, 8, 10, 16-20). The cut follows who can validate what: Craig's
    host holds the captures, the PCSX2 cards and the game-run windows the offline screens are scored against; the
    services, the card's data and (until R7 dropped it) the codec are held by tests that need none of them. The card's data went to Chris
    because the personas and the login stand on it and no screen does until 12 (R7 removed the card credential from
    that list); since OT.R40 (2026-10-07) one lane holds every roadmap sprint, and the lane comes out at 497 points
    (494 before PLAT-38, 2026-10-29; 493 before SVC-03a, 2026-10-11; 482 before sprint 18's adoption, 2026-10-11; 484 before sprint 22's adoption, 2026-10-10; 467 before the 2026-10-09 promotion of segment 06's seven blocks; the two lanes came to 319 and 148 at the voice
    re-cut, 319 and 145 before it; 224 and 209 until OT-0 re-cut the
    sprints for the online path, 2026-10-02; 227 and 215 until R7 dropped PLAT-27, PLAT-37 and OPT-08). The
    crossings are the After lines, and the one long one is 16 waiting for 11.
12. **The online path first (the owner, 2026-10-02; [the online-path plan](../plans/2026-10-02-online-path-target.md),
    OT-0).** The target is the original's internet branch from the main menu to the match's start, on our central
    server; Craig's lane builds all of it, in the plan's order: the services and the card's data the flow calls (8),
    the main menu and the online entry to SELECT UNIVERSE (11), the persona to the SOCOM II ONLINE menu with rooms and
    the bridge behind it (16), and the briefing rooms to the match's start (17). A path task never waits on a parked
    one: each such dependency is cut by a path slice whose block says what it takes, and the test
    (`tools/test/roadmapGraph.test.ts`) refuses a path sprint's task that reaches a parked sprint's. Parked is not
    dropped: sprints 10, 12-15 and 18-22 keep their tasks, sizes and gates, and run after the path (their After lines).
    *(2026-10-07, OT.R39 and OT.R40: of these only 12, 13, 14 and 21 stay parked; the rest run on the online or the
    gameplay track, their Runs lines.)*
13. **The opener after the path's screens (the owner, 2026-10-02; OT.R11, task OT-11).** "once that work is complete,
    proceed agentically through creating the entire game opener zipper text -> trailer -> menu etc etc": the boot from
    the loader's screens through the cards and the trailer with its sound into the main menu is on the path, as sprint
    24, Craig's. It is its own sprint and not a part of 11, 16 or 17 because each of those would pass the 38-point
    ceiling with it (39, 44, 53) and because the owner's order puts its close after the match's start; its After line
    is sprint 11 (MENU-02a under the hand-off), the smallest that suffices, so that its first tasks -- BOOT-02 done,
    BOOT-04 in flight -- run beside the path's remainder. BOOT-06 stands on MENU-02a, not MENU-02: the hand-off needs
    the menu drawn, not its music. What the un-parking leaves in 12 and 21 stays parked and now follows 24.
