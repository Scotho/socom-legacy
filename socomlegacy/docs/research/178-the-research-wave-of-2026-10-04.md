# 178 -- The research waves of 2026-10-04: the index

Written 2026-10-04, when the waves' reports were filed as notes 171-177 and 179-198; wave 1's round 2 and the wave's
close were filed the same day as notes 199-207 (§10). This note says what was asked, how it was done, where each report
now is, what its grades mean here, where the evidence lives and how to re-run it, and what is still open. **Everything
it indexes is reading, pending review -- not adopted**: nothing in notes 171-207 is adopted until a sprint task takes it
and a reviewer re-reads it at the source. **Where a note and research 206 §1 (the verification overrides) disagree, 206
§1 wins**; each overridden note names the claim under its header.

## 1. What the owner asked, and how

**Wave 1** (the owner, 2026-10-04): (1) list every mechanic and global value in the browser port labelled a placeholder
or unsure; (2) source each one from the whole corpus so it can be ported; (3) list multiplayer information that is
sourced but not implemented; (4) say exactly what it takes to make HOSTAGE mode work on Desert Glory as the original
does (the hostage's AI, animation, sync with the players, stop/follow, death). Research only: nothing implemented,
nothing invented, nothing built or run, no game or server contacted. Method (the wave's `BRIEF.md`): the 427 names of
PORT's placeholder ledger split into ten code clusters (C1-C9, by the files each owned), plus three hostage reports
(H1-H3) and two multiplayer reports (M1-M2); per item, the note's earlier search first, then a new lever (Harry62's
labels and struct layouts, `.data` reads of the ELF, the r0004 diff, the SOCOM 1 demo's symbols, unicorn runs of the
game's own functions, the disc's scripts, reCOM, the existing RDRAM dumps), every number with the script that printed
it, decompiled text cited and never pasted. Then adversarial verifiers re-derived a sample by other routes: V1 (C1-C3),
V2 (H1-H3), V3 (M1-M2 and the H3-M2 disputes), V4 (C4-C9); all four landed before these notes were filed.

**Wave 2** (asked after the Crossroads / all-map audit): review wave 1 and find what a placeholder list cannot show --
omitted subsystems, disconnected consumers, cross-system races, incomplete integration. Four lanes (W2-A combat and
actor lifecycle, W2-B multiplayer and service integration, W2-C world and presentation, W2-R input and voice), each
cross-reviewed by another lane, a root synthesis (the review, the dispositions, an implementation plan of eleven work
packages) and a machine-readable ledger of 40 findings: 3 new, 19 extensions, 13 covered, 4 superseded, 1 deferred.

**The Crossroads / all-map audit** (the owner's earlier request the same day, in the old-layout checkout): Crossroads'
Demolition bomb and two bridge switches, then every retail multiplayer map by mode, and the emplaced weapons. Filed
here as 171-177 with its two plans (`../plans/2026-10-04-crossroads-demolition-and-bridges.md`,
`../plans/2026-10-04-multiplayer-map-parity.md`) and its seven probes (`tools/probe-*.ts`).

## 2. The reports and their notes

| note | report | scope | verification |
|---|---|---|---|
| [171](171-crossroads-demolition-and-bridges.md) | WT-96 | Crossroads (MP72): the shared Demolition bomb and the two bridge switches | the audit's own second pass; reading, pending review |
| [172](172-multiplayer-map-audit.md) | WT-97 | every online multiplayer map: the source audit and its feasibility | as 171 |
| [173](173-demolition-map-audit.md) | WT-98 | the six Demolition maps | as 171 |
| [174](174-breach-map-audit.md) | WT-99 | the three Breach maps | as 171 |
| [175](175-extraction-and-escort-map-audit.md) | WT-100 | the seven Extraction and Escort maps, the objective NPCs | as 171 |
| [176](176-suppression-map-audit.md) | WT-101 | the six Suppression maps | as 171 |
| [177](177-emplaced-weapons-audit.md) | WT-102 | emplaced weapons on all 22 maps | as 171 |
| [179](179-c1-match-server.md) | C1 | the match and its server: vote, ban, teams, lobby flow; server policies and the wire; the damage path; spawns, round flow, objectives; the round screens; bodies, equipment, doors (132 rows) | V1, landed: §13 |
| [180](180-c2-movement-body-camera.md) | C2 | movement, stances, traversal, the body's animation and blending, camera and look; the 30 Hz game frame (59 rows) | V1, landed: §8 |
| [181](181-c3-combat-hud-effects.md) | C3 | combat, HUD, effects (51 names, 4 extra rows) | V1, landed: §9; its "no spin in flight" overturned by R2-C3 and V5 (206 §1) |
| [182](182-c4-armory.md) | C4 | the ARMORY and its UI scripts (54 rows) | V4, landed: §6 |
| [183](183-c5a-frontend-screens.md) | C5a | the front end's screens: LOGIN, DNAS, SELECT UNIVERSE, persona, world menu, the screen manager (74 rows) | V4, landed: §6 |
| [184](184-c5b-frontend-dialogs-input-boot.md) | C5b | dialogs, popups, boot, menu input, soft keyboard, routes, loading, UI variables and valves (68 rows) | V4, landed: §10 |
| [185](185-c6-frontend-compositor-text.md) | C6 | the compositor and the GS, widgets, text and fonts, the frame clock, the zanim runtime, the UI's 3D pass (64 rows) | V4, landed: §11 |
| [186](186-c7-audio-movie.md) | C7 | audio and movie, and the online lane's four player-visible questions (77 rows) | V4, landed: §7 |
| [187](187-c8-card-online-services.md) | C8 | the simulated card, netcnf, the persona, the universe and services, the lobby; C7's questions cross-checked (50 rows) | V4, landed: §10 |
| [188](188-c9-world-render-platform.md) | C9 | world, render, platform and tools | V4, landed: §7 |
| [189](189-h1-hostage-ai-animation.md) | H1 | the hostage as an actor: AI states, orders, following, death, body | V2, landed: §14; its A* address and the civ clips' root travel corrected by H5 and V6 (206 §1) |
| [190](190-h2-hostage-mode-rules-map.md) | H2 | hostage mode on Desert Glory: the mode, the rules, the map data, the HUD | V2, landed: §10 |
| [191](191-h3-hostage-net-sync.md) | H3 | how the original replicates hostages online, and what the port must do | V2 and V3, landed: §12, §13; field 0x74 is applied after all (V5, 206 §1) |
| [192](192-m1-mp-modes-rules.md) | M1 | the multiplayer game modes, round rules and match settings, against the port | V3, landed: §6 |
| [193](193-m2-mp-net-replication.md) | M2 | how the original replicates a match, and where the port differs | V3, landed: §12; **its online and LAN send rates are swapped -- online is 100 ms**; with its other overrides in 206 §1 |
| [194](194-w2-a-combat-actor-gaps.md) | W2-A | combat and actor lifecycle: pickups and drops, NoFire, flinch and blast arbitration, mine detonation | the wave's cross-review (198 §2) |
| [195](195-w2-b-multiplayer-integration.md) | W2-B | multiplayer and service integration: admission, effective settings, join-state hydration, the game list | as 194 |
| [196](196-w2-c-world-presentation.md) | W2-C | world and presentation: interactive clutter and rustle, positional sound | as 194 |
| [197](197-w2-r-input-voice-integration.md) | W2-R | input and voice: radio payloads, presets and the talk state, the HUD count, mode-conditioned commands | as 194 |
| [198](198-wave-2-review-and-implementation-plan.md) | wave 2 | the review, the cross-review, the candidate dispositions and the implementation plan, one section each | the wave's own review |

Each of 179-198 opens with the same header (date, origin, trees, status, grades, verification, the import's edits)
and keeps the report's substance verbatim. The headings are numbered for the corpus: a report's own numbers are kept,
an unnumbered `##` takes the next free number, an unnumbered `###` becomes `N.M` under its parent. A verifier's text
for a report is a closing `## N. Verification (Vk, 2026-10-04)` section of that report's note, its verdict rows,
claim sections and corrections for that report only.

`HOSTAGE-MODE-DESERT-GLORY.md`, the hostage synthesis, was left in the archive at the first filing; its updated copy
(after round 2, H5 and V5-V6) is now note [207](207-hostage-mode-desert-glory.md) (§10). It adds no evidence of its own.

## 3. The grades, translated

AGENTS.md's levels ("The truth rule and the confidence levels") are the ones that count here.

| the wave's grade | here |
|---|---|
| PROVEN (read exactly from the disc's data or from code whose meaning is unambiguous) | **reading** -- an exact source read, not measured running |
| STRONG (code read, two independent lines of evidence, one interpretive step left) | reading, with one interpretive step |
| BELIEVED (one line of evidence, interpreted) | inference |
| UNRESOLVED | unresolved, with the search record |
| wave 2's "source reading" / "inference" / "unresolved" | reading, pending review / inference / unresolved |

No value in these notes was measured against the original running. Every one is pending review besides: the verifier's
CONFIRMED is a second reading, not the reviewer's re-read the levels ask for.

## 4. The trees and the aliases

- **PORT** -- `agent/online` at 2026-10-04 (a superset of `origin/main` then), read from a snapshot. The notes write its
  root `$PORT` (its `socomlegacy/`), `$PORT/..` for the branch's root. `$WEBISSUES` is the `agent/web-issues` checkout
  (research 150-152). PORT's file and line citations are at that snapshot.
- **WT** -- the old-layout checkout, written `$WT`: the web project one level down (under `web/`) in the owner's
  canonical clone on branch `feat/socom-2-legacy-startup` (drop-web-level: keep), which
  held the Crossroads / all-map audit uncommitted. **WT-96 .. WT-102 are notes 171-177 here** (96 -> 171, 97 -> 172,
  98 -> 173, 99 -> 174, 100 -> 175, 101 -> 176, 102 -> 177). PORT's own research 96-102 (the dialog inventory, the
  service map, the movie decoder, the card store, the load budget, the round's open gaps, the card codec) are other
  notes; a bare "research 101" in the reports is PORT's.
- **The decompilation** -- `D:L<line>` is a line of the desktop's `game/analysis/socom2_game.elf.decomp.c` (r0001);
  addresses are r0001 unless a report says r0004.
- `$NPX_TSX` -- the npx cache's `tsx` package on the owner's host, in two reproduction commands of 196.

## 5. The evidence archive and how to re-run it

The archive stays on the owner's host, at **`C:/Projects/research-wave-2026-10-04/`**; the notes write it
`research-wave-2026-10-04/`. It holds wave 1's briefs, reports, per-cluster ledgers and the verifiers' files at its top
level, every agent's scripts and outputs under `scratch/<id>/` (each with a README of what each script prints: C1-C9,
H1-H5, M1-M2, R2-*, V1-V7, and `owed/`, which extracts every "owed" paragraph per report), and wave 2 under `wave-2/` (its
reports, ledgers, `VALIDATION.json`, `MANIFEST.json`, `BASELINE.json`, and `wave-2/scratch/<lane>/`). A relative
`scratch/...` path in 179-193 is under the archive's root; in 194-198, under `wave-2/`.

Wave 2's reproduction (its README, "Reproduction"): each report links its scripts and their outputs; the probes use the
existing readers, direct file reads, disassembly and isolated scalar models, with no install; keep
`TSX_DISABLE_CACHE=1` for the TypeScript replays. From PowerShell:

```powershell
python -B C:/Projects/research-wave-2026-10-04/wave-2/scratch/W2-R/inventory.py
python -B C:/Projects/research-wave-2026-10-04/wave-2/scratch/W2-R/coverage.py
python -B C:/Projects/research-wave-2026-10-04/wave-2/scratch/W2-R/candidate_disposition.py
python -B C:/Projects/research-wave-2026-10-04/wave-2/scratch/W2-R/reproduce.py
python -B C:/Projects/research-wave-2026-10-04/wave-2/scratch/W2-R/root_ledger.py
python -B C:/Projects/research-wave-2026-10-04/wave-2/scratch/W2-R/validate_wave.py
```

`reproduce.py` repeats ten selected probe replays (records `scratch/W2-R/reproduction.json`, `reproduction-A.json`,
`reproduction-B21.json`); `validate_wave.py` merges the lane ledgers only when their schema, identity and local links
pass. Wave 1's scripts are re-run one by one from each `scratch/<id>/README`. The Crossroads / all-map probes are in
this tree (`tools/probe-*.ts`, run from `socomlegacy/` against a locally supplied disc; notes 171-177 give the commands).

## 6. The ledgers

[`ledgers/2026-10-04/`](ledgers/2026-10-04/README.md), path-sanitised copies: wave 1's starting inventory
(`ledger_names.tsv`, 427 names), its split by cluster (`ledger_by_cluster.tsv`, `clusters.json`), the whole ledger after
round 2 (`LEDGER-ALL.tsv`, 697 rows; 206 §1 wins over it); wave 2's 40 findings
(`findings.jsonl`, `findings.tsv`) and its four lane ledgers (`ledger-W2-{A,B,C,R}.jsonl`). The README gives each
file's schema.

## 7. Wave 2's work packages

From [198](198-wave-2-review-and-implementation-plan.md) §4.1 (the order is §4.3, the acceptance cases §4.4):

- **WP1** game identity and effective configuration: an authenticated service world admits one seat to its own match,
  and the settings and counts reach the simulation (W2-B-01/02).
- **WP2** coherent current-state restoration: a join or reconnect rebuilds the phase and results, live projectiles and
  effects, and corpses, without replaying history (W2-B-03/04/05).
- **WP3** actor action permission: the authored NoFire thresholds and the actor gates decide fire and reload at the
  command's time (W2-A-02).
- **WP4** damage and action transitions: the sourced flinch reload gate and the blast / action-stack transitions
  (W2-A-03/04).
- **WP5** in-round dropped inventory: eligible classic deaths leave the real remaining items and ammunition; a pickup
  changes the live kit and the world object at once (W2-A-01).
- **WP6** voice and preset consumers: radio payloads and icons agree; a talk action does not also switch weapons; the
  command state stays apart from the actor's life (W2-R-01..05).
- **WP7** interactive clutter: nearby actors bend the right instances and trigger the authored rustle (W2-C-01).
- **WP8** persistent positional audio: world and animation sound references follow their nodes and are stopped and
  cleaned up (W2-C-02).
- **WP9** bounded list and lock consumers: the game list's own sort priority, the persistent-game lock and fallback
  (W2-B-06/07).
- **WP10** explosive and pellet eligibility: the explosion obstruction flag, C4's prohibited surface, the shotgun
  guard's reset (W2-A-09/10/11).
- **WP11** damage-triggered mine detonation: Claymore and PMN entities take damage and enter the queued detonation
  (W2-A-21).

## 8. What PORT has already folded in

The online controller's Log (`docs/plans/2026-10-02-online-path-target.md` and roadmap 06 on `agent/online`) records:

- From C7 §1 and C8's cross-check (186, 187): the original has no idle or lag kick, only a team-majority vote at the
  round-end screen, then UIMnLOC #539 for 4 s -- #539 reserved for that vote (proposed **SVC-23d**), the server's own
  closes on #365; a second login -997 -> #543; a refused persona name #544, the word list the server's (H85 open; its
  default meanwhile: at most 14 characters / 31 bytes, `"` typed as `'`, no reserved list); a host who leaves before
  the launch hands the role on silently (proposed **SVC-07b**), too few players #528.
- From M2 (193): the bridge abandons a game when fewer than three players remain after any leave,
  `ABANDON_BELOW_PLAYERS_READING = 3` (M2 graded it BELIEVED; V3 found the threshold unverifiable statically, 193 §12.7).
- C8's four flags (187), merged on `agent/c8-fix` (a9770103): the persona record keyed by HOST, PORT and NAME; the
  netcnf interface type `nic`, not `eth`; the card driver's three open files (`MC_MAX_OPEN_FILES` 3); the two client
  filter readings left open in PORT's research 154.
- C7's dialog readings, in PORT's research 159 §8 on `agent/hard-seat`.

## 9. Open

The sequence that takes these notes into work is the proposed plan
[`2026-10-04-three-maps-and-feel.md`](../plans/2026-10-04-three-maps-and-feel.md) (web sprints 25-32, every item rated
for urgency, size and risk, with the condensed owner list). What a later sprint still has to settle, by report (each
note's sections hold the exact capture or read):

- **Verification**: V1-V4 sampled claims; they are not the reviewer's re-read. Every note still needs that re-read at
  the source before anything is adopted. V4's corrections to act on with C5b's and C6's changes: `CheckTeamStatus` is
  the predicate V4 gives (184 §10), the cursor's grey is 128/255 on an untextured quad, the menu tick is 29.97 Hz, the
  focal 457.0074 (the game's float).
- **C1 (179)**: the vote's +0x48 writer and the 0.5 s timing; the Medius ban request's field layout (the 120's unit);
  the vote alert's watch; a ghost seated on the scoreboard; a departed player's claymore on the other console; the
  radio menu's draw; V1's fresh-boot friendly-fire default with a memory card.
- **C2 (180)**: §3's unresolved rows (the binocular body clip, the peek and stance transitions, the step height's
  boot-time writer of 6.5).
- **C3 (181)**: §4 -- `C4_REACH_READING`'s writer (`body+0x208`), the arc's depth test (a GS dump).
- **C4-C9 (182-188)**: their unresolved rows and the captures they name (the movie latencies with audio, 186; the
  card's stack word `MC_CHANGED_SLOT_UNWRITTEN_READING`, 183; the remote step stick, 188).
- **H1-H3 (189-191)**: one PCSX2 session on MP6 settles most: a SEAL leading a hostage (the follower's sub-state, goal
  and position), the leader quitting mid-follow, a client ordering FOLLOW, shooting a rescued hostage (H1 U1, V2 §25),
  HOLD on a rescued hostage (V2 §26's possible double credit), the cell door shut, a SEAL killing a hostage; whether the
  hostage's RESTRAINED / PANIC / HELPME are audible (V2 §16); online unit assignment (V2 §18); TCP or UDP for the
  hostage's fields (191 §8).
- **M1-M2 (192-193)**: the abandon's threshold (a 2v1 capture, 193 §9 item 3; V3 claim 10), the Hit record's +4 / +7
  bytes (V3's side note), the send rates measured online and on LAN (193 §9 items 1-2); and for the port, the abandon screen:
  the original shows popup #528 and returns to World of SOCOM, and PORT's "ABANDONED" caption is not the original's
  (V3 claim 10).
- **The Crossroads / all-map audit (171-177)**: the runtime captures and movement tests each note lists; the three HDD
  maps await their data.
- **Wave 2 (194-198)**: 198 §4.5, the narrow source and capture work still owed, and each finding's `owed` field in
  `findings.jsonl`.

## 10. Round 2 and the close

Filed 2026-10-04 after the first import (PR #16), from the same archive and with the same header and transforms. Round 2
(H4, H5 and R2-C2 .. R2-AV) took wave 1's leftovers and the static reads the owed-capture list named; V5-V7 verified
it; the wave closed with the overrides, the sprint options, the capture plan and the merged ledger.

| note | report | scope | verification |
|---|---|---|---|
| [199](199-h4-hostage-closures.md) | H4 | the nine hostage questions an implementation would trip on: the double rescue credit, the rescued fade, speeds, follow roles, leader disconnect, the jail, `Hostage_start`, CHRSND, the remote view | V5, landed: §12; stranding and "Cower never online" wrong (206 §1) |
| [200](200-h5-ai-pathfinding.md) | H5 | the AI map's path planner (A*, smoothing, following), transcribed and replayed against console routes | none; validated against MP6's AIMAPS and the console's own routes (§4) |
| [201](201-r2-c2-movement.md) | R2-C2 | movement, body and camera, round 2: swap gates, zoom, slide, ladder, head look and the rest | V5, landed: §27; the ladder is 13.5 u/s, not 7.59 (206 §1, §2) |
| [202](202-r2-c3-combat.md) | R2-C3 | combat, HUD, effects, round 2 (items 1-21): C4 reach, the grenade's tumble, flashbang, thermal and NVG, the UI model form | V5, landed: §7 (the spin dispute: R2-C3 is right); V7, landed: §8 |
| [203](203-r2-mn-match-modes-net.md) | R2-MN | match, modes, net: the create-game ranges, sort order, radio rows, the ban's 120, C4 targets, Medley | V5, landed: §19; V7, landed: §20 |
| [204](204-r2-ui-frontend.md) | R2-UI | the front end, round 2: the grid walk, the ARMORY's server save, glyphs, menu input, UI textures | V7, landed: §20 |
| [205](205-r2-av-audio-card-world.md) | R2-AV | audio, movies, card, services, world: voice (research 170's rows), the HQ duck, PLAYER_INDOORS, the card's damaged results | V7, landed: §8 |
| [206](206-verification-overrides-and-the-waves-close.md) | the close | §1 the verification overrides (**they win**), §2 V6 (the loop-rate rescale), §3 the sprint options, §4 the owed captures by session, §5 the ledger's counts | §1 is V1-V7's collected verdicts; §2 is V6 itself |
| [207](207-hostage-mode-desert-glory.md) | the hostage synthesis | hostage mode on Desert Glory as the original does it, and the 11-phase plan | a synthesis of 189-193, 199, 200, 206 |

Where the round-2 verifiers landed: **V5** in 199 §12 (H4), 201 §27 (R2-C2), 202 §7 (the grenade-spin dispute, C4 reach,
ringing ears) and 203 §19 (R2-MN); **V6** is 206 §2 whole; **V7** in 202 §8 (claims 1-4), 203 §20 (claim 10), 204 §20
(claims 5-7) and 205 §8 (claims 8-9). A verifier's "Sourced but not implemented" and "Leads" items sit with the report
they concern, as V1-V4's did.

**The override list that wins is 206 §1.** Every claim it lists as wrong or corrected is named, with what is right, by a
line `**Overridden in part (research 206 §1):** ...` under the header of the note that holds it: 179, 180, 181, 183, 184,
185, 186, 189, 191, 193 (beside its earlier correction line), 199, 201, 202, 204, and PORT's own 91, 122 and 170. The
merged ledger, 697 rows, is [`ledgers/2026-10-04/LEDGER-ALL.tsv`](ledgers/2026-10-04/README.md); 206 §1 wins over its
rows too.
