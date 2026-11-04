# 192 -- M1 -- Multiplayer game modes, round rules and match settings: sourced vs. ported

- Research date: 2026-10-04 (research wave 1; the index is [178](178-the-research-wave-of-2026-10-04.md)).
- Origin: `research-wave-2026-10-04/M1-mp-modes-rules.md` on the owner's host, in the evidence archive ([178](178-the-research-wave-of-2026-10-04.md) gives its root). A relative `scratch/...` path below is under `research-wave-2026-10-04/`; the per-cluster `ledger-*` files it names are merged in [`ledgers/2026-10-04/`](ledgers/2026-10-04/README.md).
- Trees compared: **PORT** = `agent/online` at 2026-10-04 (written `$PORT`; `$PORT/..` is that branch's root, `$WEBISSUES` the `agent/web-issues` checkout); **WT** = the old-layout checkout (`$WT`, the clone's pre-restructure web project). WT-96..102 are notes 171-177 here; PORT's own notes 96-102 are other notes.
- **Status: reading, pending review -- not adopted.** Nothing in it is adopted until a sprint task takes it and a reviewer re-reads it at the source.
- Grades, translated to AGENTS.md's levels: the wave's PROVEN = an exact source read = **reading**; STRONG = reading with one interpretive step; BELIEVED = inference; UNRESOLVED = unresolved. The text keeps the wave's words.
- Verification: V3 (`research-wave-2026-10-04/V3-verify-modes-net.md`) has landed and is folded in as §6.
- Edits on import: the headings are numbered for the corpus; home-directory paths are replaced by `$PORT`/`$PORT/..`/`$WEBISSUES`/`$NPX_TSX`; the archive's absolute root is dropped; references to the other reports are links to their notes. The substance is verbatim.

**Corrected in part (web sprint 25 PF-10, 2026-10-04; a reading, pending review):** G29 (§0, the gap matrix) and §2.4 (ESCORT) say the escortee's death posts auto comm 0x44 instead of a kill line; nothing is posted. `FUN_005e7960` (D:L498028-498236) looks 0x44 up in the speaker's own character's `multiplayer` list, and no character of `character.rdr` lists `CMD_MP_HOSTAGE_KILLED` (nor 0x27 or 0x28), so the line formats empty (0x662798) and no sound plays: the VIP's death is silent in the message window (`KILL_AUTOCOMM_READING`, `packages/viewer/src/netPage.ts`; research 179's header).

Research agent M1, research wave 2026-10-04. Read-only. Scope: SOCOM II's multiplayer game types, their round rules,
the create-game match settings, and what the browser port (`$PORT` = the `agent/online` snapshot) does of each.
Hostage/VIP AI and Desert Glory specifics are H1-H3's; this note gives only the mode-level picture and points there.
Scripts and outputs: `scratch/M1/` (its `README.md` says what each prints). `D:L<n>` = a line of
`C:/Projects/socom_pc/game/analysis/socom2_game.elf.decomp.c` (r0001); addresses are r0001 unless marked r0004.
Grades: PROVEN / STRONG / BELIEVED / UNRESOLVED (BRIEF.md rule 7). Port status: IMPLEMENTED / PARTIAL /
SOURCED-NOT-IMPLEMENTED (SNI) / UNSOURCED.

**Corpus caution.** The owner's working tree `$WT` (branch `feat/socom-2-legacy-startup`)
holds **untracked, in-progress** notes written on 2026-10-04 that cover three of the five modes in depth:
`docs/research/96-crossroads-demolition-and-bridges.md`, `98-demolition-map-audit.md`, `99-breach-map-audit.md`,
`101-suppression-map-audit.md` (their numbers collide with the port's own 96/98/99/101), with probes
`tools/probe-{crossroads,demolition-maps,breach-maps,npc-maps,multiplayer-audit,map-turrets}.ts` and a plan
`docs/plans/2026-10-04-crossroads-demolition-and-bridges.md`. They are not in `agent/online`. Below they are cited as
"WT-96 ([171](171-crossroads-demolition-and-bridges.md))", "WT-98 ([173](173-demolition-map-audit.md))", "WT-99 ([174](174-breach-map-audit.md))", "WT-101 ([176](176-suppression-map-audit.md))"; I did not repeat their bomb/barrier traces, I cross-checked their mode-level
claims against my own reads of the scripts (all agree) and add what they do not cover (Escort, Extraction at mode
level, the match settings, the play list, friendly fire, the penalty).

## 0. Gap matrix

| # | item | area | port status | grade | one-line answer | source |
|---|---|---|---|---|---|---|
| G1 | The game-type set | modes | PARTIAL | PROVEN | 5 types: BREACH 1, DEMOLITION 2, ESCORT 3, EXTRACTION 4, SUPPRESSION 5 (0 unknown); MEDLEY is a play-list label, not a type | FUN_002c9540 D:L168877-168906; `missionlist.rdr`; S:0x3f3b40 |
| G2 | Map -> type | modes | IMPLEMENTED (label only) | PROVEN | 22 maps: SUP 2,5,8,51,64,81; DEM 1,7,9,12,72,83; BRE 61,62,73; ESC 52,53,82; EXT 6,10,11,71; port's `mapOrder.ts` labels agree but are hand-typed | `scratch/M1/missionlist.out` |
| G3 | Rooms run one rule set | modes | SNI | PROVEN | every port room runs SUPPRESSION on every map; four modes absent (incl. Crossroads, a first-release map) | `net/rules.ts` `objectiveOf`; `room.ts` |
| G4 | Per-mode objective texts at round start | HUD | SNI | PROVEN | each map's `objectives` `start` posts its own pair (e.g. Escort "PROTECT THE VIPS AND ESCORT THEM TO SAFETY."); port posts SUPPRESSION's everywhere | `objsum_MP*.txt` seq `start`; `OBJECTIVE_BY_MAP_PLACEHOLDER` |
| G5 | Time-out outcome by mode | rules | SNI | PROVEN | SUP/DEM/EXT: draw (`abort`, winner 99); ESCORT: SEALs win; BREACH: Terrorists win; port: draw everywhere | seq `mission_timer`, 16 maps read |
| G6 | Elimination / time-out guards by mode | rules | PARTIAL | PROVEN | `start` waits 5+10 (SUP, BRE), 3+10 (DEM), 5+2+10 for the SEAL perspective on ESC/EXT; `mission_timer` waits 15 (SUP, DEM, EXT) or 5 (ESC, BRE); port: 15/15 everywhere | seqs `start`, `mission_timer` |
| G7 | Demolition (bomb, plant/defuse, fuse, bases) | mode | SNI | STRONG | fully traced in WT-96 ([171](171-crossroads-demolition-and-bridges.md))/98; port none | WT-96 ([171](171-crossroads-demolition-and-bridges.md)) §6-8, WT-98 ([173](173-demolition-map-audit.md)) |
| G8 | Breach (SEAL-only bomb, barriers, airstrikes) | mode | SNI | STRONG | traced in WT-99 ([174](174-breach-map-audit.md)); time-out = Terrorist win; port none | WT-99 ([174](174-breach-map-audit.md)); FUN_0059def0 D:L457629 |
| G9 | Escort (3 VIPs, extraction zone, 30 s chopper) | mode | SNI | STRONG | rules below §2.4; AI/zone owned by H1-H3 | `objsum_MP52/53/82.txt` |
| G10 | Extraction (3 hostages, rescue count, penalty) | mode | SNI | STRONG | rules below §2.5; Desert Glory depth is H1-H3's | `objsum_MP6/10/11/71.txt` |
| G11 | `mp_penalty`: SEAL hostage kill costs one minute | rules | SNI | PROVEN | each increment makes the host cut 60 s from the round length (floor 1 s) | FUN_002a9ee0 D:L150716-150719 -> FUN_002a6960 D:L148928; Extraction `SealKill*` |
| G12 | Friendly-fire enforcement | rules | IMPLEMENTED (off) | PROVEN | **resolves FRIENDLY_FIRE_ENFORCEMENT_PLACEHOLDER**: the gate is FUN_005ac670 (absent from the decomp text), read at 0x5ac70c; teammate damage refused when off, self and hostage/VIP damage never refused | `scratch/M1/xref_44cdb8_r0001.txt`, `dis_5ac670.txt`; r0004 twin 0x5b2360 |
| G13 | Friendly fire ON (create-game option) | settings | SNI | PROVEN | option exists (UIMnLOC 232/257/258); world report `RulesSet` bit 0 (respawn bit 1); in-game state bit 0x20 -> `DAT_0044cdb8`; port has no way to turn it on | FUN_002ef590 D:L191373-191383; FUN_002a9ee0 D:L150752-150761; FUN_002c0850 D:L163358-163369 |
| G14 | Objective scoring (plant/defuse/destroy/rescue/VIP/action points) | scoring | SNI | PROVEN | plant +2, defuse +2, detonation +2 (+4 Breach), rescue +3 (SEAL), VIP kill +3 Terr/-2 SEAL in ESCORT, hostage kill -2, action `points` once a round; + team bonus | D:L411516-411700, D:L432985, D:L160566-160668, D:L411238-411306 |
| G15 | Round count / round time per game | settings | PARTIAL | PROVEN | per-game options (11, 6 min; 4-10 min); port: server env `MAX_ROUNDS`/`ROUND_SECONDS` for every room | `A_49`; FUN_002f7c40 D:L196715; `central/src/main.ts` |
| G16 | Play list, MEDLEY, RANDOM, rotation | settings | SNI | STRONG | 32-byte map list; after each game the host advances the index cyclically; MEDLEY = next MP map in missionlist order; RANDOM = shuffled bag | FUN_00279490 D:L123842 (UI cmd 83 `AdvanceMPMission`), FUN_002f8120 D:L196971, FUN_002c8db0, FUN_002c8840 |
| G17 | Respawn option limited to SUPPRESSION maps | settings | IMPLEMENTED, switched off | reading for disc fields; executable semantics pending fresh review | respawn needs type 5 (FUN_002a7560); RSP-1 implements the menu command's TYPE-based filtering and CopyUIVar backup/restore (research 357). A respawn room on types 1-4 opens classic; type 0 keeps the choice (LATER 153, §2.2) | FUN_002791e0 D:L123748-123820 (inherited); `UIZANIM.ZAR` `dlgCreateGame.rdr`; missionlist TYPE |
| G18 | EQUIPMENT (EQlimit 0-4) | settings | PARTIAL | PROVEN | Pistols/Shotguns/Snipers only, No Bombs; carried in GameStats byte 5 and game-state bits; armory logic ported, value fixed 0 | FUN_002f7c40; D:L150762-150765; research 95 §3.5 |
| G19 | PLAYERS (MaxPlayersValve), SPECTATORS, spectator password | settings | PARTIAL | PROVEN (defaults) / UNRESOLVED (ranges) | defaults 16 / YES, 8 slots; ranges not decoded; port: 16 fixed, spectator queue 32 (server guard) | `A_49`; 91 §7; `protocol.ts` |
| G20 | GameStats 'D' record (game details) | lobby | PARTIAL | PROVEN | [0]'D' [1] rounds [2] minutes [3] spectators [4] spectator slots [5] EQlimit [6] sort order [7] rank bits [8..0x27] play list | FUN_002f7c40 D:L196715-196755 |
| G21 | GAME DETAILS type word, MEDLEY when mixed | lobby | SNI | PROVEN | type of every play-list map equal -> its name, else "MEDLEY"; lines ROUND COUNT, ROUND TIME, FRIENDLY FIRE, RESPAWN, PISTOLS/SHOTGUNS/SNIPERS ONLY | FUN_002e1f20 D:L183971-184130, FUN_002e24d0 D:L184131 |
| G22 | Rank restrictions, clan options, password, locked game | settings | SNI (match) | PROVEN (fields) | sourced in 91 §7, 154, 155; clan games parked (OT.R6) | research 91 §7, 154 §7, 155 R155.11 |
| G23 | Post-match: back to the game lobby, sides swap counter | flow | PARTIAL | reading for return scripts; executable dispatch pending fresh review | FinalReally -> lobby; held games return through ONL-20b, respawn included by RSP-4 (research 350); unheld dedicated rooms continue (the port's own, `DEDICATED_NEXT_MATCH_ADAPTATION`, research 101 §3 B14). Playlist advancement and the sides counter remain separate work | research 91 §18.3; 309 §7.1; 350 §2 |
| G24 | Lobby READY delay 30 s, 45 s after a finished game | lobby | SNI | BELIEVED | AdvanceMPMission arms game +0xc8 = now + 30 000 ms, or 45 000 when `mp_game_over` is set | FUN_00279490 D:L123857-123862 |
| G25 | Respawn result order (score compare before the +1 alive bonus) | rules | IMPLEMENTED, switched off | reading for six disc comparisons; bonus handler pending fresh review | original compares `seals/terrs_team_score` in `success2` before CMPExitState adds +1 alive; RSP-2 selects the result before the existing bonus awards (research 348) | all six SUPPRESSION `success2` sequences; inherited FUN_00223970 D:L76162-76165; `room.ts` `endRound` |
| G26 | Team score's objective bonus | scoring | SNI | PROVEN | each objective event adds +1 per living teammate (scorer included) to `seals/terrs_team_score` | FUN_00544d60 D:L411236-411306 |
| G27 | Mode HUD: compass marks (bomb, base, hostage, extraction), bomb prompts, defuse timer | HUD | SNI | PROVEN (assets) | `ret_bomb/base/hostage/extraction.tif`, `action_MP_bomb.tif`, `action_drop_MP_bomb.tif`, `compass_bomb_ring.tif`, "MP DEFUSE BOMB" | research 87 §1.7; FUN_002126f0 D:L68576 |
| G28 | Mode voice/music cues (objective events) | sound | PARTIAL | PROVEN | intro/elimination cues wired per map (research 124 §12); bomb/VIP/hostage cues (`MUS_BOMB_*`, `MUS_MP_VIP_*`, `^PH_0042/0050/0006/0007/0008/0013`, `^*PT_0051/0055`) not | `objsum_MP*.txt`; research 124 §5 |
| G29 | Escortee/hostage kill line | HUD | SNI | PROVEN | no "fragged" line; auto comm 0x44 instead; FF gate never protects them | 91 §10 (D:L412905-412907); G12 |
| G30 | Per-mode TCM rows | HUD | SNI | PROVEN | command 0x2e only in bomb modes (1, 2); 0x2f only in ESCORT/EXTRACTION | FUN_0022fa90 D:L81626-81650 |
| G31 | `mp_persistent`, `mp_game_sort_order` | settings | UNSOURCED | UNRESOLVED | written to the game state (bit 7) / GameStats byte 6; meaning not read | D:L150770-150771; FUN_002f7c40 |

Totals: 31 items; IMPLEMENTED 2 (G2 label only, G12 the off path), PARTIAL 9, SNI 19, UNSOURCED 1 (ledger: `ledger-M1.tsv`).

## 1. The game types (G1, G2)

**PROVEN.** `FUN_002c9540` (D:L168844-168906) parses each `missionlist.rdr` record: NUMBER, VERSION, MULTIPLAYER, and
TYPE compared against the strings at 0x3f2e68.. (`scratch/M1/strings_modes.txt`): DEMOLITION -> 2, EXTRACTION -> 4,
SUPPRESSION -> 5, BREACH -> 1, ESCORT -> 3, anything else 0. The game object keeps it at `+0x111`
(`FUN_001f5e70` D:L55617-55619 sets it from the current map through `FUN_002c8a00`), the valve `mp_game_type` mirrors it
(`FUN_002a6c50` D:L149116, D:L149146-149156), and the host sends it in the game state's low 3 bits (D:L150747, read by clients at
D:L163349). "MEDLEY" (0x3f3b40) is not a type: GAME DETAILS prints it when the play list's maps do not all share a type
(G21). There is no respawn type and no other mode (no CTF, no deathmatch string or branch).

`scratch/M1/missionlist.out` (run `missionlist.ts`) lists the 22 retail MP maps:

| type | maps (NUMBER: NAME) |
|---|---|
| SUPPRESSION (5) | 2 FROSTFIRE, 5 ABANDONED, 8 RAT'S NEST, 51 VIGILANCE, 64 SHADOW FALLS, 81 CHAIN REACTION |
| DEMOLITION (2) | 1 BLIZZARD, 7 NIGHT STALKER, 9 BITTER JUNGLE, 12 THE RUINS, 72 CROSSROADS, 83 REQUIEM |
| BREACH (1) | 61 SUJO, 62 ENOWAPI, 73 SANDSTORM |
| ESCORT (3) | 52 THE MIXER, 53 FOXHUNT, 82 GUIDANCE |
| EXTRACTION (4) | 6 DESERT GLORY, 10 BLOOD LAKE, 11 DEATH TRAP, 71 FISH HOOK |

Port: `viewer/src/mapOrder.ts` L18-42 carries a `mode` label per map, hand-typed with community popularity notes (and
three DLC maps). All 22 retail labels agree with `missionlist.rdr`; nothing reads the disc's TYPE. The scoreboard's
details use that label (`hud.ts` L848). **Status IMPLEMENTED as a label only.**

## 2. The rules of each mode

Every map's round logic is the animation `objectives` in its `MZANIM.ZAR`; I decoded 16 of the 22 (`scratch/M1/obj_*.jsonl`
from the working tree's own `tools/probe-npc-maps.ts --section commands`, summarised by `scratch/M1/objsum.py` into
`objsum_MP*.txt`). `objsum.py` decodes the conditions the generic `decodeEffectProgram` drops (WT-96 ([171](171-crossroads-demolition-and-bridges.md)) §7's warning):
each IF/ELSEIF/WHILE embeds VALVE predicates (marker 0x40003d: name index, operand, flags|op, flag 0x1000 = operand is
a valve) joined by EXPRESSION words (0x22002b; 2 = AND, 3 = OR). Common to all five: `game_over` (match end, 91 §18.2.2),
`success` / `failure` (WAIT 20, `round_count` += 1, CALL `game_over`, WAIT 1, `mission_complete`/`mission_failure`),
branches per `player_team` (0 SEAL, 8 Terrorist, 16 spectator), simultaneous elimination favouring the SEALs (the
`aiteam_08 == 0` branches come first).

### 2.1 The mode table (PROVEN from the scripts; script timings are nominal, not measured)

| | SUPPRESSION | DEMOLITION | BREACH | ESCORT | EXTRACTION |
|---|---|---|---|---|---|
| SEAL objective | "ELIMINATE THE TERRORISTS" | "FIND THE BOMB AND DESTROY THE ENEMY BASE WITH IT" (mp72LOC 7201, both sides on MP72) | "BREACH THE DEFENSES AND USE THE BOMB TO DESTROY THE ENEMY CAMP" | "PROTECT THE VIPS AND ESCORT THEM TO SAFETY." + (WAIT 2) "MOVE AT LEAST TWO VIPS TO THE EXTRACTION ZONE FOR IMMEDIATE EXTRACTION." | "LOCATE AND EXTRACT THE HOSTAGES" + (WAIT 2) "MOVE AT LEAST TWO HOSTAGES TO THE EXTRACTION ZONE" |
| Terrorist objective | "ELIMINATE THE SEALS" | the same line (one shared bomb; each side attacks the other's base) | "USE ALL DEFENSES AND PREVENT THE SEALS FROM DESTROYING THE CAMP" | "ELIMINATE THE THREE VIPS AND PREVENT THEIR EXTRACTION." | "PREVENT THE SEALS FROM RESCUING THE HOSTAGES" |
| `start` waits before the elimination loop | 5 + 10 | 3 + 10 | 5 + 10 | 5 + 10 (+2 SEAL perspective) | 5 + 10 (+2 SEAL perspective) |
| `mission_timer` waits before watching `mp_timer` | 15 | 15 | 5 | 5 | 15 |
| elimination | other side wins | other side wins **unless the bomb is planted** (`switch_timer` stops `start` and `mission_timer` on `mp_bomb == 3`) | other side wins (planted bomb decides, as Demolition) | other side wins | other side wins |
| objective win | -- | bomb detonates at the enemy base (state 5): planting side; defused (state 4): defusing side | bomb detonates: SEALs ("PRIMARY TARGET DESTROYED, BREACH SUCCESSFUL."); defused: Terrorists | **SEALs**: 3 VIPs in the zone, or 2 in it with 1 dead -> chopper animation, WAIT 30, each living VIP in the zone "A VIP HAS BEEN EXTRACTED" -> SEAL win. **Terrorists**: `killcount >= 3` ("THE VIPS HAVE BEEN ELIMINATED.") | **SEALs**: `rescuecount >= 2` once every hostage is resolved (`rescuecheck`: rescued/killed 3+0, 2+1, 1+2, or 0+3); a hostage killed by a Terrorist counts as rescued ("THE SEALS HAVE BEEN CREDITED WITH RESCUING THAT HOSTAGE"). **Terrorists**: the SEALs kill 2 hostages (`mp_hostages_by_seals >= 2`) |
| time-out | draw (`abort`, winner 99) | draw before the plant (WT-96 ([171](171-crossroads-demolition-and-bridges.md)) §7) | **Terrorists win** (`mp_winner = 8`, `breach_success`) | **SEALs win** (`mp_winner = 0` -> `escort_success` "THE TERRORISTS FAILED TO ELIMINATE THE VIPS." / "SEALS VICTORIOUS!") | draw (`abort`) |
| other script events | -- | pickup/drop/plant/30 s fuse/defuse messages (`bomb_drop`, `bomb_pickup`, `switch_timer`, `defuse`, `bomb_timer`) | same + "PERIMETER BREACHED" (`music1..`), airstrikes (WT-99 ([174](174-breach-map-audit.md))) | VIP killed by either side: message + `killcount` += 1; at 2 dead: "MISSION COMPROMISED ..." / "KEEP THE LAST VIP ALIVE." / "ELIMINATE THE FINAL VIP." | hostage killed by Terrorists: credited rescue; by SEALs: "ONE MINUTE HAS BEEN DEDUCTED FROM THE MISSION TIMER", `mp_penalty` += 1 (G11); "A HOSTAGE IS BEING ESCORTED"; "A HOSTAGE HAS BEEN RESCUED" |
| maps read | 2, 51, 64 here; 5, 8, 81 in WT-101 ([176](176-suppression-map-audit.md)) | 1, 72, 83 here; 7, 9, 12 in WT-98 ([173](173-demolition-map-audit.md)) | 61, 62, 73 | 52, 53, 82 | 6, 10, 11, 71 |

Script anchors (offsets inside `objectives`' sequence data, `objsum_*.txt`): MP52 `mission_timer` @6964 (WAIT 5, WHILE
`mp_timer != 0`, `mp_winner = 0`), `escort_success` @7060, `SEALcheck` @5300, `VIPcheck` @6644; MP6 `mission_timer`
@3308 (WAIT 15 -> `abort`), `SEALcheck` @5604, `SealKill1` @3972, `start` @368 (the rescue branches at 2008-2680,
the SEALs-killed-two branches at 2704-3290); MP61 `mission_timer` @6416 (WAIT 5 -> `mp_winner = 8`) as WT-99 ([174](174-breach-map-audit.md)) tabulates.
MP53/MP82 and MP10/MP11/MP71 match MP52 and MP6 sequence for sequence (their timeouts printed in
`scratch/M1/objsum_MP*.txt`).

**Perspective note (BELIEVED).** On ESCORT/EXTRACTION the SEAL branch of `start` has an extra WAIT 2 between the two
objective lines, so the elimination loop starts at 17 s on a SEAL console and 15 s on a Terrorist one. The round's
result is read by the online master (`FUN_002a9b30` D:L150612-150672 copies `mp_score00/08` and `mp_winner` from the
master's valves), so the master's script -- the host, a SEAL by default (91 §7) -- governs. Owed: a capture of the
first elimination at 15-17 s on Desert Glory with a Terrorist host.

### 2.2 SUPPRESSION
Built (research 91 §18-19; port `net/rules.ts`, `room.ts`). WT-101 ([176](176-suppression-map-audit.md)) §3 finds two result-hold variants (MP2/5/64 have no
WAIT 2 before `success`/`failure`; MP8/51/81 do), against the port's single `ELIMINATED_HOLD_S = 2 + 20 + 1`. The
respawn variant (`respawn` -> `start2`/`mission_timer2`/`success2`) is built and switched off by the owner (2026-09-29).
**Respawn's rooms, by type (LATER 153, 2026-10-21; reading, pending review).** The original's respawn is SUPPRESSION's alone:
`FUN_002a7560` (D:L149405-149431) sets the `Respawn` valve only when the host option `mp_allow_respawn` is set and the
game type is 5 (the question's answer below, filed proven under the earlier definition, a reading under the present one). So the room opens a
respawn room on another read type -- DEMOLITION, BREACH, ESCORT, EXTRACTION -- as classic (`room.ts`'s constructor),
which dissolves LATER 153 (a respawn room on a bomb map holding its clock at a defuse, then posting TIME EXPIRED) at its
root. A map off the list (type 0: a test's flat map, an archive the list does not name; a forge room takes its base
archive's type) keeps the room's choice: the port plays
SUPPRESSION's rules there (`modeRules`), and the original never sees such a map -- the port's own adaptation,
`RESPAWN_TYPE0_KEEPS_CHOICE_ADAPTATION`. Behind `RESPAWN_RULES_ENABLED` (off). Tests: `roomRespawnType.test.ts`. Both it
and `playedRules` live in the viewer's `net/rules.ts` since LATER 229 (match's `room.ts` re-exports them), so the room,
the server and the page take one rule.

### 2.3 DEMOLITION and BREACH
See WT-96 ([171](171-crossroads-demolition-and-bridges.md)) (Crossroads, the shared `CZBombState` 0..5, pickup 20 u, plant 5 s hold + 2.25 s, defuse 15/20 u, fuse 30 s
FUN_002c2260 D:L164131, drop on death/disconnect, bases), WT-98 ([173](173-demolition-map-audit.md)) (the other five maps) and WT-99 ([174](174-breach-map-audit.md)) (the three Breach maps;
mode 1 lets only SEALs pick the bomb up, `FUN_0059def0` D:L457629; a detonation scores +4). I re-read the score paths
they cite (D:L411594-411700) and the mode test in `FUN_002a6c50` D:L149166-149174 (InitBomb `FUN_002c1a80` only for types 1 and 2, on
the host): they agree. **Port: none** (no bomb item 154 in a match, no objective state, Crossroads runs SUPPRESSION).
Crossroads is in the first release (OT.R16, SPRINTS.md sprint 17), so G7 is the highest-priority mode gap.

### 2.4 ESCORT (mode level; VIP AI, follow and the zone test: H1-H3)
Each map's `chartype.rdr` lists three `escortees` (91 §14: MP52/53 `alg_UN01/02/UNworker`, MP82 `rus_escort01/03`);
`VIP1..3_valve_alive` are their alive valves. Rules: §2.1. Scoring: a VIP killed by a Terrorist +3, by a SEAL -2
(`FUN_00545390` D:L411516-411547, online and type 3), the killer's `+0x18` stat +1, the VIP counters
`mp_hostages_by_seals/_turds` +1 (D:L458117-458145); a VIP brought out credits the controlling SEAL +3 (G14). The VIP's
death posts no kill line (auto comm 0x44, 91 §10). Sounds: `MUS_MP_SEAL/TERR_INTRO_3`, `^PH_0042` + `MUS_MP_VIP_KILL_1..3`,
`^*PT_0051` + `MUS_MP_VIP_RESC_1..3`, `^*PT_0055`, `^PH_0050`, `chopper_rescue1/2` animations. **Port: none.**

### 2.5 EXTRACTION (mode level; Desert Glory in depth: H1-H3)
Escortees MP6 `mp_fem1..3`, MP10/MP11 `mp_pow1..3` (91 §14). Rules: §2.1. The hostage reaching the zone credits its
leader +3 (`FUN_00545480`, SEALs only, called from `FUN_0056f970` D:L432985 when the hostage's state goes to 0x11 and
from the net update `FUN_0056f4c0` D:L432848). Any hostage kill -2 to the killer (`FUN_00545390`, not ESCORT). SEAL kills
cost one minute each (G11). Sounds: `MUS_MP_SEAL/TERR_INTRO_5`, `^PH_0006/0007/0008/0013/0014/0002`,
`MUS_MP_SEAL/TERR_WIN_<region>`. **Port: none.**

## 3. Per-item sections

### 3.1 G3/G4 -- One rule set, one objective text everywhere
- **Name:** `objectiveOf` (`$PORT/packages/viewer/src/net/rules.ts`), `OBJECTIVE_BY_MAP_PLACEHOLDER` (research 91 §19.1).
- **What it stands for:** the mode's rules and the "OBJECTIVE:" pair each map posts 5 s (3 s on bomb maps) into a round.
- **Current value:** SUPPRESSION's "ELIMINATE THE TERRORISTS" / "ELIMINATE THE SEALS" on all 22 maps; posted at 5.36 s
  by `hud.ts` `ROUND_START` whatever the map's WAIT (research 124 §5 last bullet).
- **Prior search:** 91 §19: "the other game types' objectives are not read".
- **What I did:** decoded `start` of 16 maps (§2). Seven maps use raw texts in the name table (MP52/53/82, MP6/10/11,
  MP61/62/73); MP51/MP71/MP72 use locale ids in the MESSAGE word (MP72 7200-7213, MP51 5100-5108, MP71 7100-7113,
  printed by `scratch/M1/msg_locids.py` into `msg_locids.txt` -- the high 16 bits of the MESSAGE's
  second word).
- **Answer:** PROVEN, the texts and the wait are per map (§2.1).
- **Implementation suggestion:** read the objective pair the way `roundCues.ts` already reads the cues -- from the map's
  own `objectives` at run time (no text copied): extend `RoundCues` with `objective: CuesByTeam<{ text|locId, scale,
  waitBefore }[]>` from `start`'s MESSAGE commands up to its first WHILE; `netPage.ts` L773 posts them at the script's
  waits. Test first (`viewer/test/roundCues.test.ts` on `SOCOM_DISC`): MP52 SEAL = ["OBJECTIVE:" 0.9, "PROTECT THE
  VIPS..." 0.7, wait 2, "MOVE AT LEAST TWO VIPS..." 0.7]; MP72's first id 7200; MP51's unchanged.
  Independently of the modes: a `GameType` (1..5) per map read from `missionlist.rdr` (the port's archive already
  parses READERC) to replace `mapOrder.ts`'s hand labels for game details and the loading screen.

### 3.2 G5/G6 -- Time-out outcome and guards by mode
- **Name:** `ROUND_WATCH_S` (15), the room's time-out draw (`room.ts` `endRound(null)`).
- **Answer:** PROVEN (§2.1 rows "start waits", "mission_timer waits", "time-out"), 16 maps read, consistent per mode.
- **Implementation suggestion:** make the guards and the time-out winner data of a `ModeRules` record keyed by game type
  (or read per map, as above): `{ eliminationAfterS: {seal, terrorist}, timeoutWatchAfterS, timeoutWinner: null|'seal'|'terrorist' }`.
  Tests first (`viewer/test/rules.test.ts`): ESCORT time-out -> 'seal'; BREACH -> 'terrorist'; DEMOLITION, EXTRACTION,
  SUPPRESSION -> null; an elimination at 14 s on a DEMOLITION map is counted, on SUPPRESSION it is not (13 vs 15).
  Owed: which perspective's grace governs on ESC/EXT (see §2.1 note).

### 3.3 G11 -- `mp_penalty`: one minute off the clock (resolves MP_PENALTY_PLACEHOLDER)
- **Prior search:** 91 §16: "`mp_penalty` (0x3f1140) created and zeroed (L149589); game-script use not read".
- **What I did:** the Extraction scripts (MP6/10/11/71 `SealKill1..3`) add 1 to `mp_penalty` after "ONE MINUTE HAS BEEN
  DEDUCTED FROM THE MISSION TIMER"; ESCORT and the others only zero it in `reset`. Engine: the host's game-state report
  `FUN_002a9ee0` (D:L150679) compares the valve with its last value (game `+0xc0`) and, when it rose, calls
  `FUN_002a6960(game, 0x3c)` (D:L150716-150719); `FUN_002a6960` (D:L148928-148960) on the host sets the round length
  `+0xe0` to (seconds - 60) x 1000 when more than 60 s remain, else to 1000 ms. Harry's `GameObject +0x40 mp_penalty`
  agrees with the valve slot (`piVar13[0x10]`, D:L149098).
- **Answer:** PROVEN. One minute per SEAL hostage kill, by the host, at most down to 1 s. Note the code cuts the round
  *length*, not the elapsed time; the HUD clock (91 §18.1: remaining = length - elapsed) drops by 60 at once.
- **Implementation suggestion (with EXTRACTION):** `Room.penalise(seconds = 60)`: `state.endsAt = max(now+1 s, endsAt - 60 s)`
  when `endsAt - now > 60 s`, else `now + 1 s`; broadcast the new `timeLeft`. Test first: a SEAL kills a hostage at
  4:30 left -> 3:30; at 0:40 left -> 0:01; a Terrorist kill changes nothing.

### 3.4 G12 -- Friendly-fire enforcement (resolves FRIENDLY_FIRE_ENFORCEMENT_PLACEHOLDER)
- **Prior search:** 91 §16: searched `DAT_0044cdb8`, team-mask tests in L455000-466000, `FUN_005abbc0`, `FUN_005a5a80`,
  `FUN_005a1b80`; "open".
- **What I did:** a full static scan of the ELF for any lui+lo access to 0x44cdb8 (`scratch/M1/xref_imm.py 0x44cdb8`):
  three stores (0x2c0440, 0x2c044c in the host report, 0x2c0c24 in the client receive) and **one read, 0x5ac70c**, inside
  `FUN_005ac670` (0x5ac670-0x5aca04: in `socom2_ghidra.csv`, but its body is missing from the decomp text, which is why
  every earlier search missed it). Disassembly: `scratch/M1/dis_5ac670.txt`. Its r0004 twin is 0x5b2360 (reads 0x450148,
  `xref_450148_r0004.txt`; Harry annotated "load player index of killer" at 0x5b23a8). Name lead: the SOCOM 1 demo's
  symbol string `m_allow_friendly_fire__10CZSealBody` (in `game/demo_scus_972_05/SCUS_972.05` at 0x3e9274; Harry's
  label at r0004 0x475cb8 is that name in his dump, not the retail variable).
- **Answer (PROVEN for the logic, STRONG for "every projectile"):** `FUN_005ac670(body, hit, projectile)` is the gate in
  front of `FUN_005ab850` (the bullet/explosive dispatcher, its only caller: jal at 0x5ac964), which leads to
  `FUN_005abbc0` (bullet) and `FUN_005ac070` (explosive, whose record feeds `FUN_005a0e70`/`FUN_005a18b0`). Online, a
  spectator body takes nothing; the shooter id (projectile `+0xac`) is stored as the body's last attacker `+0xfb8`;
  then **if `m_allow_friendly_fire` == 0, the shooter is a player whose team word (`+0xc8`) shares a bit with the
  victim's, the victim is not an escortee/hostage (`+0xc8 & 0x20000`), and the shooter is not the victim -> no damage**.
  Two further refusals apply whatever the option: an M67 (item 121) or HE (126) grenade from the victim or a teammate when
  two controller flags are set (controller `+0x264` bit 1, `+0x42c & 0x400`, unnamed), and Backblast (159) from the victim
  or a teammate. A thrown M67 that strikes the body without exploding does nothing (`FUN_003d1e10` of the weapon record == 0x79 and `FUN_003c6ed0`, the dispatcher's explosive test, false: BELIEVED, the helper's return read as the item id).
- **Port comparison:** `room.ts` L1562 (bullets) and L1983/L2031 (grenade fragments, blast) spare teammates and not the
  thrower: **matches** the gate for FF off. Missing: the hostage/VIP exception (no escortees yet), Backblast's
  self-and-team immunity (the LAW/RPG backblast is not modelled -- check research 94), and FF on.
- **Implementation suggestion:** make the room's three team tests one predicate `ffRefuses(attacker, victim, itemId)`
  transcribing the gate, with `allowFriendlyFire` a room option. Tests first: FF off -> teammate refused, self hurt,
  escortee hurt by a teammate; FF on -> teammate hurt; Backblast from a teammate refused with FF on.
- **Owed evidence:** the two controller flags of the grenade branch (a PEEK of a thrower's controller `+0x264`/`+0x42c`
  during a throw).

### 3.5 G13 -- Friendly fire ON
- **What it stands for:** CREATE GAME's FRIENDLY FIRE row (UIMnLOC 232; 257 "Friendly Fire is disabled." default, 258
  "...enabled."; `A_49`). Valve `mp_friendly_fire`; the host packs it as bit 0x20 of the game-state flags and sets
  `DAT_0044cdb8` (D:L150752-150761); clients copy it (FUN_002c0850 D:L163358-163369). GAME DETAILS shows "FRIENDLY FIRE"
  (D:L184077-184080). Effects: the gate opens (G12); team kills then happen and score -2 (91 §8); friendly hits count
  (`FUN_005458a0` stat +6).
- **Where it travels to the lobby (PROVEN):** the host's world report `FUN_002ef590` (D:L191373-191383) sets its
  `RulesSet` word to `mp_friendly_fire` (bit 0) | `mp_allow_respawn` (bit 1), between GameLevel (atoi of the map stem,
  D:L191385-191390) and PlayerSkillLevel 0 -- research 154's world-report field order; the game list keeps it at record
  `+0x30`, which GAME DETAILS tests (`& 1` FRIENDLY FIRE, `& 2` RESPAWN, D:L184077-184082). The s4 game's report has
  `RulesSet:0` (`slice-Medius.log` line 14): both off, as `A_52` shows.
- **Port:** off, hard-wired (W3.R11). **SNI**: a `friendlyFire` room option fed by the created game's `rulesSet` bit 0
  (the service already stores `rulesSet`, `lobby.ts` `GameRecord`), the predicate above.
  Test first: FF on, teammate shot dies, killer -2, line "%s fragged %s with %s" (91 §10 -- no team-kill wording).

### 3.6 G14/G26 -- Objective scoring and the team score
- **Answer (PROVEN):** per-player round score `+0x5c8` (`+0x58c` block + 0x3c): `FUN_005455d0` plant +2 (stat +0x38);
  `FUN_00545650` defuse +2 (stat +0x36; Breach also primary-objective stat +0x32); `FUN_00545750` detonation +4 in BREACH,
  +2 otherwise (stat +0x1a, +0x32); `FUN_00545480` hostage/VIP brought out +3 to the SEAL leader (stat +0x1c);
  `FUN_00545390` escortee killed -2 (ESCORT: Terrorist +3); `FUN_00545530` an action record's `points` (e.g. Crossroads'
  switches, Vigilance's/Breach's access barriers: `points 2`) once per round (callers D:L160566, L160645, L160668;
  WT-96 ([171](171-crossroads-demolition-and-bridges.md)) §3). *Corrected (2026-10-05, PF-14a): Vigilance's (MP51)
  `actions.rdr` has no `points` key, so its access actions score 0; the points-2 access actions are MP6, MP11, MP61 Sujo,
  MP62 Enowapi, MP71, MP73, MP82 and MP83 ([214](214-demolition-as-built.md) s5).* Each objective call (second argument 1) also adds +1 to the side's team-score carry for every **living**
  teammate, the scorer included (`FUN_00544d60` D:L411238-411306, game `+0x7c`/`+0x80`). Breach/Demolition destroy and
  Breach defuse also trigger a teammate radio comm (`FUN_00545d80` D:L411916).
- **Port:** kills/suicides/team kills, +1 alive, +5 win only (`room.ts` L2150-2154, L2323-2331).
- **Suggestion:** a `score.ts` table `{ plant: 2, defuse: 2, destroy: mode === BREACH ? 4 : 2, rescue: 3, vipKill: ... }`
  plus `teamBonus(event)`; tests first transcribe each function's numbers. The team score only matters for the respawn
  result (G25) and the stats upload; build it with the first objective mode.

### 3.7 G15/G19/G20 -- The per-game settings and their record
- **Answer (PROVEN):** the host's GameStats 'D' record (`FUN_002f7c40` D:L196715-196755), 0x28 bytes: [0] 'D', [1]
  `mp_max_rounds`, [2] `mp_max_round_time` / 60 (minutes), [3] spectators in the game (`DAT_00441458`), [4]
  `MaxSpectatorsValve`, [5] `EQlimit`, [6] `mp_game_sort_order`, [7] `mp_rank_restrictions`, [8..0x27] the play list
  (32 map bytes). Research 154 §7 reads bytes 3, 4, 7, 8 only. The rounds' load default 9 / 300 s when the valve is 0
  (`FUN_001f5e70` D:L55621-55631), the screen's 11 / 6 min (`A_49`, `A_52`). Round time choices 4-10 minutes (UIMnLOC
  273-279). PLAYERS and ROUND COUNT ranges: **UNRESOLVED** -- the `dlgCreateGame.rdr` tokens include "16", "10", "4",
  "14", "3", "20 minutes" (`member_ctx.ts`, research 105 §1) but I did not decode the cycling scripts; ONL-13 lists the
  same unknown. Owed: the dlgCreateGame cycle scripts through the port's `dump-dialogs.ts`, or a capture cycling PLAYERS
  and ROUND COUNT through their ends.
- **Port:** `central/src/main.ts` L72 `ROUND_SECONDS` 360 and `MAX_ROUNDS` 11 for every room; `MAX_PLAYERS` 16;
  `MAX_SPECTATORS` 32 ("the server's guard"); lobby service stores GameStats bytes but the match room does not read them.
- **Suggestion:** `RoomOptions` from the created game's report: `maxRounds = byte1`, `roundSeconds = byte2 * 60`,
  `maxSpectators = byte4`, `eqLimit = byte5`, `playList = bytes 8..` (+ `friendlyFire`, `respawn` from the game-state
  flags). Test first: a parsed 'D' record of the s4 game (`slice-Medius.log` line 14, research 154) yields 11 rounds,
  360 s, 8 spectator slots.

### 3.8 G16 -- The play list: MEDLEY, RANDOM and the rotation
- **Prior search:** ONL-14's unknown "how a multi-map play list rotates after each match -- a two-match capture";
  research 91 §18.3 "a dedicated server would relaunch the next map".
- **What I did:** read the play-list owner `0x44f370` (32 map bytes at `+0x84`, index at `+0xa4`; `FUN_002f82e0`
  D:L197073, `FUN_002f8270` D:L197045, `FUN_002f8230` D:L197026), its advance `FUN_002f8120` (D:L196971-197024) and its
  only caller, UI command 83 `AdvanceMPMission` = `FUN_00279490` (D:L123842-123884; table row in
  `$PORT/packages/ui/src/uiCommands.ts` L185), which the game lobby's script calls (`dlgGameLobby.rdr`, `find_member.ts`).
- **Answer (STRONG):** on the host, each `AdvanceMPMission` moves the index to the next non-empty entry, wrapping to 0
  (a one-map list stays). Entry **0xfe = Medley**: the next MULTIPLAYER mission after the current map in
  `missionlist.rdr` order whose archive is present (`FUN_002c8db0` with `FUN_002c94f0`), wrapping; entry **0xff = Random**:
  a random present MP mission drawn as a bag -- the pick is swapped to the end so the last pick is not drawn again
  (`FUN_002c8840` D:L168381-168440); otherwise the entry is the map number. The result is written as the stem "mp%d"
  (0x3eeda8) into 0x414e00, and the game state is re-sent (`FUN_002c00f0`). The CREATE GAME PLAY LIST help: "Medley
  contains all maps. Selecting Medley will delete all games in map list." (`A_51`). With RESPAWN on, `RemoveNonSuppressionMaps`
  (UI command 198, `FUN_002791e0` D:L123748-123820) keeps only type-5 entries. Grade STRONG: the advance and the pickers
  are read; that the lobby calls the command once per finished game (not on the first entry from the briefing room) is
  read from its neighbours in the script (`ComeFromBriefing`, `GoneToArmory`, and FinalReally's `IDFromBriefing = 0`).
- **Port update (2026-10-29, `agent/crossroads-rotation`):** explicit selected lists now advance on completed-game return in the central bridge and dedicated match process, with wraparound and repeated entries. [Repair and evidence](../plans/2026-10-29-crossroads-map-rotation.md). This reuses the static reading and the independent disassembly check in section 6.6; no original two-match runtime capture was added. Medley/Random remain outside this repair.
  **Earlier gap:** OT.R16 limits the first release to three maps (four since OT.R45), so a play list of Frostfire/Vigilance/Crossroads is the
  first useful case.
- **Suggestion:** `playList.ts`: `advance(list, index, current, missions, rng)` transcribing the three rules; the room
  (or the created game) holds the list and loads the next map after GAME COMPLETE + the lobby. Tests first: [51, 2, 72]
  from index 2 -> index 0 (51); [0xfe] after 72 -> 73 (next in missionlist order: 51 52 53 61 62 64 71 72 73 81 82 83 1
  2 5 6 7 8 9 10 11 12), after 12 -> 51; [0xff] never repeats the last pick with >1 candidate; respawn list [51, 72, 2]
  -> [51, 2].
- **Grade note:** the index advance and the two pickers are PROVEN as code; whether a list byte is ever 0xfe or 0xff
  (rather than Medley being stored expanded, G21) is BELIEVED either way -- hence the overall STRONG.
- **Owed:** a two-match capture on a Medley game to confirm the lobby's call point and the first map of a fresh Medley
  (the s4 game showed VIGILANCE first: B_43).

### 3.9 G17 -- Respawn is a SUPPRESSION option
- **Answer (PROVEN):** `FUN_002a7560` (D:L149405-149431) sets the `Respawn` valve only when `mp_allow_respawn` and type
  == 5; the play list loses its non-SUPPRESSION maps when respawn is on (G16); the help text "Set respawn option for
  SUPPRESSION maps. Game stats are not tracked." (raw, `dlgCreateGame.rdr`; UIMnLOC 283/285) -- consistent with the stats
  upload skipped with respawn (91 §9). The lobby learns it from the world report's `RulesSet` bit 1 (G13).
- **Port:** the room enforces it (LATER 153, 2026-10-21, §2.2): a respawn room on types 1-4 opens classic in its
  constructor (`playedRules`, `room.ts`), and the server's replay header records the same (LATER 153's review, finding 1);
  type 0 keeps the room's choice (`RESPAWN_TYPE0_KEEPS_CHOICE_ADAPTATION`). The server keys its rooms by the same played
  rules, off the mission list's type for the stem before the map loads (LATER 212, 2026-10-21: `offeredRules`, then
  `playedRules` with `gameTypeOf`), so a respawn hello and a classic one on one bomb map share its one classic room and
  the respawn asker's welcome says classic (`packages/central/test/roomKeyRules.test.ts`). The page's own look-up of a
  standing room (`roomKeyOf`, `connectHost.ts`) keys by the same played rules off the page's own read of the mission list
  (`kitGameType`) since LATER 229 (2026-10-21), so a respawn page on a bomb map asks the classic room it shares
  (`packages/viewer/test/roomDoor.test.ts`).

### 3.10 G18 -- EQUIPMENT (EQlimit)
- **Answer (PROVEN):** values 0 No limitations, 1 Pistols only, 2 Shotguns only, 3 Snipers only, 4 No Bombs (UIMnLOC 260,
  244, 261, 262, 263); GameStats byte 5; game-state bits 1-3 of the second flag byte (D:L150762-150765, from valve
  `EQlimit` 0x3f2878); game details print PISTOLS/SHOTGUNS/SNIPERS ONLY (D:L184083-184095; no line for 4). The armory's
  effect is research 95 §3.5 (`SetMPWeaponValves`, `SetMPCharWeaponValves`).
- **Port:** `armoryState.ts` implements the EQlimit branches with `eqLimit: 0` fixed (`ARMORY_MODE_READING`); the room does
  not check a loadout against the mode. **PARTIAL.** Suggestion: carry `eqLimit` from the created game to the welcome;
  the room refuses a `loadout` pick that the mode's `Enable_` rewrite disables. Test first: EQlimit 1 refuses an M4A1 pick.

### 3.11 G21 -- GAME DETAILS: the type word and MEDLEY
- **Corrected 2026-10-10 by research 154 §7.1 (MU-13d):** in the list path (`FUN_002e1f20`) ROUND TIME is the bare
  "%d" (S:0x3f3ba0); "%d min." (S:0x3f3c58) is the own game's (`FUN_002e24d0`). And when the play list's types agree,
  the word is the type of the record's GameLevel (D:L184050), not of the first play-list map. The answer below stands
  otherwise.
- **Answer (PROVEN):** `FUN_002e1f20` (list record) and `FUN_002e24d0` (own game) print the type of the first play-list
  map, or "MEDLEY" if any entry's type differs, then "ROUND COUNT:", "ROUND TIME:" ("%d min."), "FRIENDLY FIRE",
  "RESPAWN", the EQlimit line, and the rank icons (`game_info_rank_restrictions`). B_43 shows "VIGILANCE / MEDLEY / ROUND
  COUNT:11 / ROUND TIME:6". In the list path (`FUN_002e1f20`) every play-list byte must first be a known MP mission
  number (`FUN_002c9040(..., byte, 1)`), else the details read "UNAVAILABLE" (S:0x3f3c20); the map line is the record's
  GameLevel. So the s4 Medley game's GameStats list cannot have held a bare 0xfe: it held real map numbers of more than
  one type (Medley "contains all maps", `A_51`). **BELIEVED**: a Medley choice is stored expanded (all MP maps); the
  0xfe/0xff codes of G16 are then the runtime picker's. Port: the service side stores GameStats; the screen is ONL-12's.
  Tests first: [51, 2] -> "SUPPRESSION"; [51, 72] -> "MEDLEY"; [51, 200] -> "UNAVAILABLE". Owed: the 256 GameStats bytes
  of the s4 game (`logs/parity/s4_pcsx2/slice-Medius.log` line 14) decoded with the 'D' layout above, to see what a
  Medley list holds; and `SetMPMissionSeq(PLAYLISTVAR)` (CREATE GAME's SQUARE, research 128 L74) read for how "Medley"
  and "Random" become bytes.

### 3.12 G23/G24 -- After the match
- **Answer:** STRONG for the flow (91 §18.3: FINAL ROUND 10 s, GAME COMPLETE, "RETURNING TO GAME LOBBY", host WAIT 10,
  `player_ready_count` = 0, `mp_x_sec_clock` = 11, `ClanSwapSidesIndex` += 1); BELIEVED for the READY delay:
  `FUN_00279490` sets game `+0xc8` = now + 30 000 ms, or 45 000 when `mp_game_over` (game `+0x10`, D:L149066-149067) is
  set (D:L123857-123862); UIMnLOC 350 says 30 s; the 45 s case matches the lobby's `mp_45_sec_clock`/`Watch45SecClock`.
- **Port update, 2026-10-21:** ONL-20b supplies the held game-lobby return; RSP-4 applies it to respawn too
  (research 350). The final-screen disc scripts were independently re-read (reading), the executable dispatch
  remains inherited and pending fresh review. Unheld dedicated rooms keep their continuous lifecycle -- the port's
  own, with no original (every game of the original returns to its lobby): `DEDICATED_NEXT_MATCH_ADAPTATION` (match
  `room.ts`, labelled 2026-11-03 by the online-parity sweep's P33; research 101 §3 B14). This does not establish
  playlist advancement or a runtime-proven READY delay.

### 3.13 G25 -- Respawn result: score compare before the alive bonus
- **Answer (BELIEVED):** MP51 `success2` compares `seals_team_score` and `terrs_team_score` when the clock has run out;
  the +1-alive and +5-win bonuses are added later by `CMPExitState` (D:L76146-76165). `room.ts` `endRound` adds the +1
  alive to `roundScore` before summing the sides, so a tie broken only by survivors is a win in the port and a draw in
  the original. The original's team score also includes the objective carry (G26), zero in SUPPRESSION. Matters only if
  respawn returns. Test first: two sides level on kills, one survivor more on one side -> draw.

**Port correction, 2026-10-21 (RSP-2, research 348):** `endRound` now compares the points before the existing +1/+5
awards. All six SUPPRESSION disc comparisons were independently re-read (reading); the exit-state bonus routine is
an inherited reading, pending fresh executable review. `round.parity.test.ts`'s former expected-failure draw is a
normal regression, with a second tied-kills case. The preceding paragraph describes the old deviation.

### 3.14 G27-G30 -- Mode presentation
- Compass marks for the bomb, bases, hostages and extraction (research 87 §1.7; `FUN_002126f0` D:L68576 loads
  `ret_bomb`, `ret_base`, `ret_hostage`, `ret_extraction`); bomb prompts `action_MP_bomb.tif` / `action_drop_MP_bomb.tif`
  (87 §5); `CZMPBombMapItem` + `compass_bomb_ring.tif` (D:L65256, D:L65266); "MP DEFUSE BOMB" / "Tactical: Defuse the bomb"
  (S:0x3e5ff8/0x3e6010); radio commands `CMD_MP_BOMB_PLANTED`, `CMD_MP_BOMB_DEFUSED`, `CMD_MP_HOSTAGE_KILLED`
  (S:0x65e030.., 0x65dff0). The TCM's row type 0x2e is enabled only in modes 1/2, 0x2f only in 3/4
  (`FUN_0022fa90` D:L81626-81650) -- which commands those are is not read (owed: the TCM row table). All SNI; each lands
  with its mode.

## 4. Sourced but not implemented (multiplayer), in priority order

1. **DEMOLITION on Crossroads** (G7) -- a first-release map that today plays SUPPRESSION. Plan exists (the working tree's
   Crossroads plan); add the time-out/guard table (G5/G6) and objective scoring (G14) from this note.
2. **Per-map objective texts and mode guards** (G4, G5, G6) -- small, script-read at run time, testable now.
3. **Play-list rotation, MEDLEY/RANDOM** (G16, G21) -- with ONL-13/14; rules are static-read here.
4. **Per-game settings in the room** (G15, G18, G13) -- round count/time, EQlimit, FF on, from the created game.
5. **ESCORT and EXTRACTION** (G9, G10, G11) -- after H1-H3's hostage/VIP work; rules and timeouts here.
6. **BREACH** (G8) -- WT-99 ([174](174-breach-map-audit.md)).
7. **Mode HUD and cues** (G27-G30), **team-score carry** (G26), **respawn compare order** (G25), the respawn-SUPPRESSION
   restriction (G17).

## 5. Leads for other workstreams

- **H1-H3 (hostages):** the mode win rules for Extraction and Escort are §2.1 (`rescuecheck` combinations, credited
  rescues, `mp_hostages_by_seals >= 2`, the chopper WAIT 30 on Escort); hostage scoring `FUN_00545480` (+3, SEAL only)
  from `FUN_0056f970` D:L432926-432990 (state 0x11 in a type-1 zone via `FUN_0052a200(0x66a1b0,1,pos)`); the FF gate
  never protects an escortee (`+0xc8 & 0x20000`); the penalty (G11).
- **Whoever owns research 91's ledger:** close `FRIENDLY_FIRE_ENFORCEMENT_PLACEHOLDER` (G12) and `MP_PENALTY_PLACEHOLDER`
  (G11); annotate that `FUN_005ac670` exists in `socom2_ghidra.csv` but not in the decomp text (a decompile gap worth
  re-running Ghidra on; the r0004 twin 0x5b2360 is unresolved in `match_r0001_r0004.csv`).
- **ONL-13/14/12 (front end):** G15-G21 give the fields, the record layout, the rotation and the details text.
- **Research-note numbering:** the working tree's 96/98/99/101 collide with `agent/online`'s notes of the same numbers.
- **UNRESOLVED:** PLAYERS/ROUND COUNT ranges (G19), `mp_persistent` and `mp_game_sort_order` (G31), the TCM rows 0x2e/0x2f
  (G30), what a Medley play list holds in GameStats (G21), the two controller flags in the FF gate's grenade branch (G12).

## 6. Verification (V3, 2026-10-04)

The verifier's file: `research-wave-2026-10-04/V3-verify-modes-net.md` (its scripts and outputs under `research-wave-2026-10-04/scratch/V3/`). V3 verified M1 and M2 and ruled the H3-M2 disputes. What follows is the verifier's own text for this report's claims, verbatim; its claims about the other reports are in their notes ([178](178-the-research-wave-of-2026-10-04.md) has the table).

Verifier V3, research wave 2026-10-04. Read-only. Scripts and outputs: `scratch/V3/` (its `README.md` says what each
prints). `D:L<n>` = a line of `C:/Projects/socom_pc/game/analysis/socom2_game.elf.decomp.c` (r0001). Where I could,
I re-derived each claim by a route other than the author's: my own ELF reads and emulation, my own decoding of the raw
script words, the per-map scripts instead of `missionlist.rdr`, the dialog's own script instead of the note's label.

### 6.1 Verdicts

| # | claim | verdict | one-line reason |
|---|---|---|---|
| 1 | Five modes and their maps; MEDLEY is a play-list label | **CONFIRMED** | The decomp's TYPE parser (D:L168877-168906) maps exactly 5 strings. Each map's own `objectives` script classifies all 22 maps the same way. "MEDLEY" (0x3f3b40) is only a GAME DETAILS string. |
| 2 | Time-out: draw SUP/DEM/EXT, SEALs win ESC, Terrorists win BRE; graces 13-17 s vs the port's 15 | **CONFIRMED** | I decoded the raw words of `mission_timer`, `abort`, `escort_success`, `breach_success` and `start` on all 22 maps (M1 read 16; I added MP5/7/8/9/12/81). Every map agrees. |
| 3 | FF = RulesSet bit 0, respawn bit 1; respawn only on SUPPRESSION | **CONFIRMED** | D:L191373-191383 ORs `mp_allow_respawn`→2 and `mp_friendly_fire`→1. GAME DETAILS tests `&1`/`&2`. The Respawn valve is set only when the type is 5 (`FUN_002a7560`). |
| 4 | Plant +2, defuse +2, destroy +2 (+4 Breach), rescue +3, VIP kill +3/-2, +1 per living teammate | **CONFIRMED** | The bomb-state switch (D:L163919-163947) calls the three bomb scorers for states 5/4/3, with the constants as stated. Two precisions: the +1 per living teammate goes to the side's team-score carry, not to the player; +3/-2 applies only to an online ESCORT game, and every other escortee kill is -2. |
| 5 | Play-list rotation after each game; Medley and Random rules | **CONFIRMED** (minor wording) | The disassembly shows the advance returns the new entry byte, so 0xfe/0xff/map number is right. The advance goes to index+1, or to 0 if that entry is empty. That equals "next non-empty" only for a packed list. |

### 6.2 Claim 1: Modes and maps -- CONFIRMED

- **Decomp:** `FUN_002c9540` D:L168877-168906 compares TYPE with the strings 0x3f2e68 DEMOLITION → 2, 0x3f2e78
  EXTRACTION → 4, 0x3f2e88 SUPPRESSION → 5, 0x3f2e98 BREACH → 1, 0x3f2ea0 ESCORT → 3, and anything else → 0.
  `.strings.txt` has no DEATHMATCH or CAPTURE string. MEDLEY occurs only at 0x3f3b40 (and its mirrors).
- **Second route, not missionlist:** `modes_from_scripts.py` classifies each map from its own `objectives` sequences.
  `breach_success` gives BREACH; `bomb_timer`/`defuse` give DEMOLITION; VIP names give ESCORT; hostage names give
  EXTRACTION. The result is SUP 2,5,8,51,64,81; DEM 1,7,9,12,72,83; BRE 61,62,73; ESC 52,53,82; EXT 6,10,11,71, equal
  to M1's table.
- **Map names per ZDB:** each `MPn.ZDB` READERM `mission.rdr` description matches (MP1 BLIZZARD … MP83 REQUIEM). That
  file has no TYPE field, so the type itself lives only in missionlist and the scripts.
- The raw READERC bytes list the missionlist names in the same order.
- Port research 91 L169 agrees.

### 6.3 Claim 2: Time-out results and graces -- CONFIRMED

- `timers.txt` and `timers_unread.txt` hold `mission_timer` for all 22 maps, decoded from the raw WAIT float and VALVE
  words:
  - SUP and DEM: WAIT 15, then `abort` (`mp_winner` = 99, `round_count` += 1, `mission_timeout` = 1), which is a draw.
  - EXT: the same as SUP and DEM.
  - ESC (52/53/82): WAIT 5, then `mp_winner` = 0. `escort_success` waits on `mp_winner` and posts "THE TERRORISTS
    FAILED TO ELIMINATE THE VIPS." / "SEALS VICTORIOUS!", then `mp_score00` += 1.
  - BRE (61/62/73): WAIT 5, then `mp_winner` = 8. `breach_success` posts "TERRORISTS WIN!", then `mp_score08` += 1.
- `startwaits*.txt` gives the waits before `start`'s elimination WHILE:
  - DEM (1/7/9/12/72/83): 3 + 10 = 13 s.
  - SUP and BRE: 5 + 10 = 15 s.
  - ESC and EXT: 5 + 10 = 15 s, with an extra WAIT 2 inside the SEAL branch only, so 17 s on a SEAL console.
- The six maps M1 left to WT-98 ([173](173-demolition-map-audit.md))/WT-101 ([176](176-suppression-map-audit.md)) (5, 7, 8, 9, 12, 81) agree. M1's §2.1 is now 22/22 from the scripts.
- Caveat (M1 says the same): the script timings are nominal, and which console's script decides on ESC/EXT is the
  host's (H3 §1.x agrees).

### 6.4 Claim 3: RulesSet bits; respawn limited to SUPPRESSION -- CONFIRMED

- **World report:** D:L191373-191383. `uVar5` = 2 if `mp_allow_respawn` (0x3f4b30) is set, then |1 if
  `mp_friendly_fire` (0x3f4b50) is set.
- **The list side:** GAME DETAILS D:L184077-184082 tests `+0x30 & 1` for FRIENDLY FIRE (0x3f3bb8) and `& 2` for
  RESPAWN (0x3f3bc8).
- **Respawn on SUPPRESSION only:** `FUN_002a7560` (D:L149405-149431) sets `Respawn` (0x3f1038) only when its argument
  (the game's +0x64 valve, Harry's `AllowRespawn`) is set and the type at +0x111 is 5.
- **The in-game copy:** the game-state flag is bit 0x20 of byte @0x19, from `mp_friendly_fire` 0x3f2860
  (D:L150754-150761).
- **Port note to correct:** research 91 L29's "game-info bit 0" is imprecise. Bit 0 is the world report's RulesSet;
  the in-game GameState carries FF at 0x20.

### 6.5 Claim 4: Objective scoring -- CONFIRMED

- **The bomb-state switch** (D:L163919-163947):
  - state 5 (detonated) → `FUN_00545750`: +4 when type 1, else +2;
  - state 4 (defused) → `FUN_00545650`: +2;
  - state 3 (planted) → `FUN_005455d0`: +2.
- **Rescue:** `FUN_00545480`, +3 and stat +0x1c.
- **Escortee killed:** `FUN_00545390`.
  - Online ESCORT (type 3): a SEAL killer scores -2 and a Terrorist +3 (`FUN_002c31d0` / `FUN_002c30b0` side tests).
  - Every other case: -2.
  - It calls the team carry with 0, so an escortee kill earns no team bonus.
- **Team carry:** `FUN_00544d60(scorer, 1)` (D:L411236-411306) adds +1 to game +0x7c / +0x80 for each living player
  (+0xe1 bit 4) whose team word shares a bit with the scorer's. The scorer is included.

### 6.6 Claim 5: Play list -- CONFIRMED

- **The advance:** `FUN_002f8120` (D:L196971-197024) moves the index to +1, or to 0 when that byte is 0.
- **What it returns:** the disassembly (0x2f8194-0x2f81b4) leaves the new entry byte in `v0`, and the copy loop does
  not touch `v0`. The decomp shows a void function, so the caller's use of its value is real.
- **The caller:** `FUN_00279490` acts on the host only.
  - 0xfe → `FUN_002c8db0` (the next MULTIPLAYER mission after the current one; it wraps to the start only when the
    current one is last).
  - 0xff → `FUN_002c8840` (a random index in [0, n-2], swapped to the end, so the last pick is not redrawn).
  - The result is written as "mp%d" into 0x414e00, and the game state is re-sent.
- **The READY delay:** game +0xc8 = now + 30 000 ms, or 45 000 ms when the game +0x10 valve is set, as M1 says.
- M1's STRONG grade (the lobby's call point) stands.

### 6.7 Port notes checked

| note | contradiction? |
|---|---|
| 91 L642, L913-916; `netPage.ts` L945 | **Yes.** "ABANDONED" is not the original's text. The original shows UIMnLOC 528 and leaves to World of SOCOM (claim 10). |
| 91 L29 | **Imprecise.** FF is "game-info bit 0" only in the world report's RulesSet; the in-game GameState has it at bit 0x20 of byte @0x19 (claim 3). |
| 91 L169, L726, L738 | No: the game types, the 15 s `mission_timer` and the 99 draw agree with claims 1-2 for SUPPRESSION. |
| 101 | No contradiction found; A38 (no abandon dialog) is consistent with claim 10's finding. |
| 124 | Nothing on these claims beyond the per-map cues M1 cites; no contradiction found. |
| 154 | Only the `rulesSet` field name in the game-list API; consistent with claim 3. |
| desktop research 18 L797 | Agrees with Dispute (a): "The `ComeFromLan` bypass … is false for a Medius match". |

### 6.8 Corrections to carry (item 5 of the verifier's list, for M1)

5. M1 §2.1: "maps read" can now say all 22, from the scripts (`scratch/V3/timers_unread.txt`,
   `startwaits_unread.txt`).
