# 210 -- Modes, panes, barriers and the C4 gates (web sprint 26)

- Date: 2026-10-04 (web sprint 26). The note of the sprint's rules tasks: PF-12 (the mode rules, the condition
  evaluator, the objective lines) here; SUP-02/03 and PF-13 add their sections after it.
- Status: **reading, pending review.** Every value below is a source read (the decompilation `D:L<n>` of
  `socom2_game.elf.decomp.c` r0001, the disc's scripts) or a named reading; nothing here is a capture.
- Sources: research [192](192-m1-mp-modes-rules.md) s1-s3 (the modes, M1), [179](179-c1-match-server.md) s9.8-s9.10 (the 22
  maps' `objectives` scripts, the evaluator, MESSAGE), [171](171-crossroads-demolition-and-bridges.md) s7 (`switch_timer`),
  [174](174-breach-map-audit.md) s2 (Breach's time-out), [124](124-the-round-streams.md) s5 (the round's cues),
  [87](87-hud.md) s8 (the Vigilance round-start frames).

## 0. The answers

- The room keys its rules by the map's **game type**, `READERC.ZAR/missionlist.rdr`'s TYPE as `FUN_002c9540`
  (D:L168844-168906) reads it: BREACH 1, DEMOLITION 2, ESCORT 3, EXTRACTION 4, SUPPRESSION 5, else 0 (s1).
- Per type (`viewer/src/net/rules.ts` `modeRules`): the elimination watched from 13 s on DEMOLITION, 15 s on SUPPRESSION
  and BREACH, 17 s on ESCORT and EXTRACTION (the host's script, `ELIMINATION_PERSPECTIVE_READING`); the clock watched
  from 5 s on ESCORT and BREACH, 15 s elsewhere; the time-out a draw on SUPPRESSION, DEMOLITION and EXTRACTION, the
  SEALs' win on ESCORT, the Terrorists' on BREACH (s1).
- An IF/ELSEIF/WHILE condition is evaluated as `FUN_0025e960` does (`viewer/src/roundCues.ts` `evaluateCondition`):
  left to right, no precedence, NOT a prefix, parentheses, two adjacent operands stop it. The 22 maps' round cues are
  the same under it as under the former all-required reading (s2).
- The objective lines are the map's own: `start`'s MESSAGE commands before its loop, by `player_team`, each with the
  script's wait before it; raw names on the maps that spell them, the map's `MPnnLOC` ids on the others; posted at the
  script's wait plus 0.36 s (`OBJECTIVE_POST_OFFSET_READING`) -- Vigilance 5.36 s, Crossroads 3.36 s (s3).

## 1. The game types and the mode rules (PF-12)

**The list.** `RUN/READERC.ZAR/missionlist.rdr` is one record a mission, `NAME`, `NUMBER`, `TYPE`, `MULTIPLAYER`
(the 22 retail maps; the fixture's file read by `@s2u/scene` `parseMissionList`, test
`viewer/test/rules.test.ts` "the game type off missionlist.rdr ..."). `FUN_002c9540` compares TYPE with the strings at
0x3f2e68.. (D:L168877-168906) and keeps 0 for any other word; the game object holds it at +0x111 (`FUN_001f5e70`
D:L55617-55619). The map -> type table is research 192 s1's: SUPPRESSION 2, 5, 8, 51, 64, 81; DEMOLITION 1, 7, 9, 12,
72, 83; BREACH 61, 62, 73; ESCORT 52, 53, 82; EXTRACTION 6, 10, 11, 71.

**The rules** (research 192 s2.1's table, 179 s9.8's per-map table; every map of a type alike):

| | SUPPRESSION | DEMOLITION | BREACH | ESCORT | EXTRACTION |
|---|---|---|---|---|---|
| `start`'s waits before the elimination loop | 5 + 10 | 3 + 10 | 5 + 10 | 5 + 10, the SEAL branch + 2 | 5 + 10, the SEAL branch + 2 |
| `mission_timer`'s WAIT before it watches `mp_timer` | 15 | 15 | 5 | 5 | 15 |
| time-out | `abort`: draw (99) | `abort`: draw | `mp_winner = 8` (`breach_success`, MP61 @6416/6488) | `mp_winner = 0` (`escort_success`, MP52 @6964) | `abort`: draw |
| a planted bomb stops `start` and `mission_timer` (`switch_timer`, research 171 s7) | -- | yes | yes | -- | -- |

The code: `ModeRules { eliminationWatchS: { seal, terrorist }, timerWatchS, timeoutWinner, plantedStopsClock }`,
`modeRules(type)` (type 0 plays SUPPRESSION's, the classic rules every room ran before), `gameTypeOf(stem, list)`.
`ROUND_WATCH_S` (15) stays SUPPRESSION's. The server reads the list once at its start (`match/src/server.ts`) and sets
`SimMap.gameType` on each map's parse; `Room.clock()` watches the elimination from `eliminationWatchS(mode)` and the
clock from `timerWatchS`, and at 00:00 counts the type's winner's round win as an elimination's is counted
(`central/test/room.test.ts` "a DEMOLITION room counts an elimination at 14 s ..." and "the clock's end: ...").
`plantedStopsClock` is exposed only: the bomb is XR-05's.

## 2. The condition evaluator (PF-12)

`FUN_0025e960` (D:L108288-108425; research 179 s9.9) walks the condition's tokens. Read again for this port:

- an operand is evaluated (its tick, `FUN_0026a6e0`) and folded into the value by the operator pending before it:
  3 OR `value || v`, 2 AND `value && v`, none on the first operand (D:L108394-108416); no precedence;
- `EXPRESSION` 1 NOT sets a flag that negates the next operand or group (D:L108369-108371, D:L108383-108386);
- 4 `(` recurses and the group's value is one operand (D:L108325-108327); 5 `)` returns the value (D:L108366-108368);
- an operand with no operator pending after a value ends the condition and rewinds the stream to it
  (D:L108375-108379) -- the IF's end, in practice;
- a group after a value with no operator pending is false (D:L108335-108336; the group's fold is D:L108335-108354).

The effects decoder now keeps the operators: `EffectCondition` `{ kind: 'operator', operator }` for a set-0 command 43
inside an IF/ELSEIF/WHILE list (byte +4), and a WHILE keeps its condition (`conditions`). `roundCues.ts` picks a
team's branch as the first of its chain whose condition holds with `player_team` that team, the losing side's
`aiteam_0x` at 0 and the other's at 1; any other operand (another objective's valve, a set-2 zone test) is false. The
regenerated pin (`viewer/test/golden/round-cues.json`) is the former one with `objective` added to each map, nothing
else changed (179 s9.9: every condition the cues read is `A AND B`, which all-required matched).

The effects' own runner (`viewer/src/effectRunner.ts`) still requires every token of a condition and tests an operator
token as false, as it tested the undecoded command 43 before; the one pinned effect with an operator
(`shell_smoke_med`'s `IF NOT <cmd 70>`) behaves as it did.

## 3. The objective lines (PF-12)

**MESSAGE** (55; tick `FUN_00267760`, D:L113362-113378; research 179 s9.10): +4 u16 a raw text (a name index), +6 i16
a locale id read instead when not 0 (`FUN_00361b40`), +0xb the centring byte (1 on every multiplayer MESSAGE), +0xc f32
the scale; +8..+0xa (`c8 c8 c8`) are never read. Decoded as `{ op: 'message', text, locId, scale }` (the scale as the
shortest decimal of its f32: 0.9, 0.7).

**The lines.** `roundCues.ts` reads `start`'s MESSAGEs before its first top-level WHILE, by `player_team`, each with the
waits since the line before (`RoundCues.objective`). On the 22 maps (the pin): two lines, "OBJECTIVE:" at 0.9 and the
objective at 0.7, for the SEALs and the Terrorists; a third line after WAIT 2 for the SEALs on ESCORT and EXTRACTION
(MP52 "MOVE AT LEAST TWO VIPS ...", MP6 "MOVE AT LEAST TWO HOSTAGES ..."); the spectator's branch posts nothing. The
first wait is 3 on DEMOLITION, 5 elsewhere. Raw names on MP2, 5, 6, 8, 10, 11, 52, 53, 61, 62, 64, 81, 82 and the
DEMOLITION maps but 72 and 83; locale ids on MP51 (5100-5102), MP71 (7100-7103), MP72 (7200/7201), MP73 (7300-7302) and
MP83 (8300/8301). The ids are read through the map's own `MPnnLOC` (`RUN\LOCALE\STATES\MP72LOC.ZAR`, a member of the
map's archive; `@s2u/scene` `mapLocArchive`), by the page's sound loader (`viewer/src/soundData.ts`,
`withObjectiveTexts`).

**The posting.** The page (`netPage.ts`) hands the local seat's lines to the HUD's round start; the lines posted with no
wait between are one message; each message reaches the window at the script's wait plus
`OBJECTIVE_POST_OFFSET_READING` (0.36 s), drawn at the window's measured scales (research 87 s8: the 0.9 line at 1.0,
the 0.7 line at 0.765). Vigilance's WAIT 5 gives the frames' 5.36 s; Crossroads' WAIT 3 3.36 s.

## 4. Not done here, and why

- The time-out's messages and hold on ESCORT and BREACH (`escort_success`, `breach_success`: their lines, WAIT 20 and
  the result) are not played: the room ends the round at once with the type's winner, as the draw did.
- **The offline room's game type: done (PF-40, web sprint 27).** The sprint 26 integration review (2026-10-05) found the
  page's single-player room (`net/loopback.ts`) built with no game type and `welcome.gameType` read by nothing, so offline
  Crossroads (DEMOLITION) got the 15 s elimination guard instead of 13 s and an offline ESCORT or BREACH time-out ended as
  a draw. Now the page's loader reads the type off `missionlist.rdr` as `server.ts` does (`gameTypeOf(stem,
  parseMissionList(readerc))`), through the READERC bytes its arsenal already holds (`viewer/src/loadout.ts`
  `kitGameType`, no second fetch), into `LoadedMap.gameType`, which `simMapOfLoaded` hands the room
  (`viewer/test/loopback.test.ts` "the offline room plays the map's own mode: ..." and "a map built by hand with no
  mission list plays SUPPRESSION's rules"). Online, the welcome's `gameType` is kept by `NetClient.gameType()` and read
  through `NetPage.gameType()` (`viewer/test/netPageConnect.test.ts` "welcome.gameType is read by the page (PF-40)");
  nothing on the page keys on it yet -- the room plays the rules and sends their results.
- The objective lines come with the round's cues (the sound worker); a round that starts before they arrived posts the
  banner alone.
- On a tree without the sound banks (no `SOUNDS/BNKSTORE.ZAR`, or no bank for the map), `soundData.ts` `silent()`
  returns no cues at all, so the page has no objective lines and the OBJECTIVE banner is gone, where before PF-12 it
  showed the SUPPRESSION text on every map. The fix is to read `start`'s lines (and the map's `MPnnLOC`) on the map's
  own load path, independent of the banks, which needs no wire change. It is not MAP-03's: the welcome will carry the
  game type, not the lines or their texts. It belongs to a later row, with PF-14 (the next consumer of
  `RoundCues.objective`) the nearest.
- The bomb (`switch_timer`) is XR-05's: only `ModeRules.plantedStopsClock` is exposed.

## 5. Readings

| name | stands for | why a reading | status |
|---|---|---|---|
| `ELIMINATION_PERSPECTIVE_READING` (`viewer/src/net/rules.ts`) | whose `start` the room's elimination waits on where the sides differ (ESCORT, EXTRACTION: 17 s SEAL, 15 s Terrorist) | the result is read from the master's valves (`FUN_002a9b30` D:L150612-150672), the host a SEAL by default (research 91 s7): 17 s; research 192 s2.1 grades it BELIEVED; the controller's ruling PF.R16 | open: a capture of the first elimination on Desert Glory with a Terrorist host settles it |
| `OBJECTIVE_POST_OFFSET_READING` (`viewer/src/hud.ts`) | the 0.36 s between the script's wait and the line in the window | measured on the Vigilance frames only (5.36 s for WAIT 5, research 87 s8), taken on every map; the controller's ruling PF.R17 | open: a Crossroads capture (3.36 s) settles it |
| `OBJECTIVE_BY_MAP_PLACEHOLDER` | the non-SUPPRESSION maps' objectives and rules | the scripts are read (research 192, 179 s9.8): s1, s3 | resolved, retired in web sprint 26 (PF-12) |
| `ROUND_CUE_CONDITIONS_READING` | the IF conditions taken as all required | `FUN_0025e960` ported (179 s9.9): s2 | resolved, retired in web sprint 26 (PF-12) |

## 6. Frostfire's breakable panes (SUP-02)

**What the disc gives** (research 176 s4.1; research 209 s13): `MZANIM.ZAR/door_slab` is a kind-3 animation (activation
3) whose health block names reference 2, `pane1`: health 1, armour 0, shield 0. Its root `door_slab` is placed three
times, once in each door's prototype (`worldmodel/bdoor_4/door1=door1/door_slab`, `wdoor_1`, `wdoor_2`), so there are
three destructibles, each on its own `pane1` (`SCENE_INSTANCE_SCOPE_READING`, 209 s14). At health 0 `door_slab` calls
`breakapane` (`CALL_ANIMATION`; no `EXECUTE_ACTION`), whose one sequence is `SOUND .GLS_BRK_VSMALL`,
`DESTRUCTION_SOURCE` and `OBJECT_ACTIVE_STATE` off, all three at its root (`NODE_ROOT`, the placed `pane1`). Each pane
is two stored polygons (x 580.269-584.245, y 155.843-158.782 on `bdoor_4`, the window in the leaf); the panes are
door-leaf owners (`CollisionOwner.sweep`), turned in place with their door (`singleDoor_right`, 0.7 s, research 92 s2).

**The rules as built.**

- A hit (MAP-06's `fire` and `blast`, `match/src/room.ts`, unchanged): an M4A1 round's 2.3 + 0.3 reaches shield 0 and
  takes health 1 to -1.6; the death runs once (a spent record changes nothing) and the round stops at the pane; the next
  round passes the empty frame. A broken pane is no C4 target (`FUN_002739b0`: health above 0 first).
- The geometry: `breakapane` turns the placed `pane1` off -- its owners' bit 0, the bit every collision reader's model
  gate tests (`modelGate`, research 23 s1.1) -- and the page hides it (`WorldView.setNodeActive`). The door keeps
  rewriting the off pane's points as it swings; the gate, not the geometry, keeps them out. The mover's moving set
  (MAP-02, `mover.ts` `wallsNear`) is gated and rebuilt at every revision: a pane off under a swinging leaf is out of
  it, with no change to `mover.ts` (`viewer/test/panes.test.ts`, "a pane under a swinging leaf ...").
- The reset (`WorldState.reset`): `door_slab`'s `pane1` reference (0x10000200: bit 28, search 0) was resolved to the
  first placement only, so the round's reset gave `bdoor_4`'s pane back and left a broken `wdoor_1` or `wdoor_2` pane off
  for the match (209 s13, "For SUP-02"). `MapMeta.initial` now resolves a search-0 reference beneath each placement of
  the animation's root first, the world's first placement only where a placement holds none -- the rule
  `sceneHealth.ts` `placeRefs` already applied to a program's references (`SCENE_INSTANCE_SCOPE_READING`;
  `NODE_REF_SCOPE_READING` updated) -- so each slab saves its own pane, and the reset restores all three, the door shut
  or left open. Measured on the 22 disc maps (2026-10-05): the change only adds saved references -- MP2's two wdoor panes,
  MP6's `plate_dis` under `plate2`-`plate4` (save translation and parent) and `tincup_hit` under `tincup2`-`tincup6`, MP71's
  `wglass` under `h7wc2`-`h7wc4` -- and deactivates nothing new: no map's opening state changes.
- The page (`SCENE_DEATH_ON_WIRE_READING`): the room sends the geometry, not the health (MAP-03's `EnvWire`). A page's
  world takes a live destructible whose target the room's state turns off as dead -- spent, its health at most 0 --
  and runs its death's sequences once for their effects. The room ran one death where several records' targets went
  off, so the page takes one too: one a distinct target (the first record bound to it, the room's `SceneHealth.at`
  pick: MP73's ~80 `wglass` records on one window), none for a record whose target lies under another dead one's
  (MP51/61/82's access barriers), none for a record whose animation another's death runs as a program (MP7's
  `ant_base1` calls `spinner_hit`, `sealtable1` calls `destroy_lamp`) -- measured on the disc against the room for
  MP2, MP7, MP51, MP61, MP73 and MP82: the same records spent and the same sounds, once. So `breakapane` plays
  `.GLS_BRK_VSMALL` through the world's `sound` hook (`main.ts`: `GameAudio.play` by name, at the pane, as the doors' sounds) and its `DESTRUCTION_SOURCE`
  through `destruction` (logged once a node: `GLASS_FRAGMENTS_PLACEHOLDER`). Ruling PF.R26 (the controller,
  2026-10-05): that run is presentation only (`SceneRunContext.presentation`) -- its `OBJECT_ACTIVE_STATE` and `VALVE`
  commands change nothing, at once or later (an action it executes runs the same way), so the page's state is the
  wire's without laying it back (`viewer/test/sceneDeathWire.test.ts`). A joiner's silent state (`JOIN_SILENT_READING`, `skip_effects`) spends the record and plays
  nothing. The round's reset on the page (`NetClient.newEpoch` -> `WorldState.reset`) restores the records and runs
  no program; a spent record whose target the room's state gives back is whole again (the offline room,
  `net/loopback.ts`, which follows the room's world without an epoch of its own). The room lends no hooks: it plays
  nothing. The page now steps its world (`main.ts`, beside the doors), so a death's sequence past its first tick runs.
- The sound's place (`SCENE_SOUND_PLACE_READING`): the centre of the box of the node's polygons as they stand now
  (`WorldState.placeOf`); `bdoor_4`'s pane plays at (582.257, 157.3125, 1117.2625).

**The tests.** `viewer/test/panes.test.ts` (no data: the page's effects once and the joiner's none, the sound's place,
the pane under a swinging leaf with the mover); `viewer/test/panes.parity.test.ts` (MP2: the initial state per
placement, research 176 s4.1's three witness segments 2 -> 0 and back at the reset, a pane broken mid-swing, the sound
once and the joiner silent, the 2.3 + 0.3 break and the C4 refusal); `match/test/roomWorld.test.ts` (MP2 in the room: a
rifle round through `bdoor_4`'s pane, the door swung over it, all three panes back at the next round's start);
`viewer/test/sceneHealth.parity.test.ts`'s gap assertion flipped to all three restored.

**Not done.** The break's look -- the fragments `DESTRUCTION_SOURCE` throws, a break decal -- is not drawn
(`GLASS_FRAGMENTS_PLACEHOLDER`; 176 s4.2 owes the capture). A bullet mark on a pane stays on the leaf when the pane
breaks (`doorMarks.test.ts`): an owed capture. The door's kick animation is not run (research 92 s6).

## 7. Readings and placeholders (SUP-02)

| name | value | what it stands in for | what would settle it |
|---|---|---|---|
| `GLASS_FRAGMENTS_PLACEHOLDER` (`viewer/src/worldState.ts`) | `'sound-and-pane-off'`: a broken pane plays `.GLS_BRK_VSMALL` and goes off; `DESTRUCTION_SOURCE` is logged at its node and draws nothing | what `breakapane`'s `DESTRUCTION_SOURCE` throws: its payload past the node byte is undecoded (`@s2u/scene` `effects.ts`), and no capture shows a pane break (176 s4.2) | decode command 29's payload (its tick and the debris it spawns) and one capture of a Frostfire pane shot out |
| `SCENE_DEATH_ON_WIRE_READING` (`viewer/src/worldState.ts`) | `'targetOff'`: a page takes a live destructible whose target the room's state turns off as dead -- one death a distinct target (the first record bound to it), none for a record whose target lies under another dead one's or whose animation another's death runs as a program -- runs its death's sequences once for their effects (none when silent) -- for presentation only (ruling PF.R26: sounds, particles and debris sources play; no node's flag and no valve changes, at once or after a wait), and takes a spent one whose target comes back as whole. **Its limit:** a death that does not switch its target off is never heard on the page -- 33 on MP6 (the beer bottles, tin cups, plates, lights), some on MP12, MP62, MP7 and MP73 (the SUP-02 review's measurement, 2026-10-05) -- since the wire carries no health | how the original tells another console a scene object died -- a damage message replayed on each console, or a valve (research 209 s11's valve replay to a joiner is the nearest read) | the network path of `FUN_00273a50`'s death (the replay contract `SCENE_DEATH_AUTHORITY_READING` names); a two-console capture of a pane broken by the other side; owed: a health (or death) field on the wire -- MAP-03's environment section or a later row -- which retires the inference |
| `SCENE_SOUND_PLACE_READING` (`viewer/src/worldState.ts`) | `'polygonBoxCentre'`: a scene program's sound plays at the centre of its node's polygons' box as they stand now; unplaced when the node has none | the node's position the game plays it at (`FUN_002659c0` D:L112363-112416): `MapMeta` carries no node's world origin | carry each placement's world matrix in `MapMeta.instances` and play at its origin; a pane's centre and its origin differ by at most the window's half-size |

## 8. Vigilance's five access barriers (SUP-03)

Written 2026-10-05 for web sprint 26, SUP-03 (plan `../plans/2026-10-04-three-maps-and-feel.md`, sprint 26 row SUP-03,
appendix SUP-03 and VG-C4-BOTH; rulings PF.R11, PF.R14, PF.R18). Sources: research [176](176-suppression-map-audit.md)
s7 (the barriers, the witness segments, `Enable_c4 = 9`), [203](203-r2-mn-match-modes-net.md) s7 (the 1/17 blocks),
[174](174-breach-map-audit.md) s3 (the thresholds and the chain), [209](209-the-mutable-world.md) s11-s14 (MAP-03's join
and MAP-06's scene health, which this builds on), and the disc's `RUN/MP51.ZDB` read through the port's own loader on
2026-10-05 (`viewer/test/accessBarriers.test.ts`, disc-gated: MP51 is no fixture). **Grade: reading** throughout.

**What the disc holds** (the loader's read, matching 176 s7.1): five type-less actions `access_action1..5` (type 8,
range 32, valve `set_accessN`, anim `destroy_accessN`), each under `worldmodel/accessN=accessN`; five kind-3 animations
`access1..5` (state 1, flags 0x2b), each a block of health 1, armour 0, shield 17 on `di_good`, its sequence
`EXECUTE_ACTION set_accessN` (set 0, command 87); `destroy_accessN`, guarded by its context valve, whose
`access_destroy` turns `good_parts` and `di_good` off and `whats_left` on and then, under `IF skip_effects == 0`, turns
`bad_parts` on, runs `access_part_fly` over its children (`FOR_CHILDREN`, `OBJECT_MAKE_WORLDCHILD`: undecoded here) and
plays `.WOOD_DEBRIS`. `access6` and `plankaccess1..3` are stored with no placement of their root: never a barrier, now a
diagnostic line of the map's metadata (`meta: zAnim access6: a destructible whose root is not placed: no target`).
Hull polygons per barrier, `di_good` / `whats_left`: 16/1, 7/19, 16/1, 8/10, 10/8 (`access4` and `access5` carry 8 more
under `good_parts` itself). The four doors `door_ft_1..4`, range 30, still swing, and `door_ft_1` stops the SEAL shut
and lets it through open.

**The binding.** Each barrier's root `accessN` is placed twice by name: the placement `worldmodel/accessN` and the root
of its realised prototype `worldmodel/accessN=accessN`. MAP-06's `destructiblesOf` bound one destructible per placement:
ten on Vigilance, two on each `di_good`. `FUN_002740e0` hangs one object on the node (`+0x94`), so a placement of the
root beneath another placement of it is the same object: bound once, on the outer (`viewer/src/sceneHealth.ts`). Five
destructibles, `access1..5`, each on `worldmodel/accessN=accessN/good_parts/di_good`. Frostfire's three `door_slab`s
(none nested) and Crossroads' two bases are unchanged.

**C4's target** (`viewer/src/equipment.ts`; `C4_TARGET_READING` retired, research 94 C5.1): the destructible itself --
accepted by `FUN_002739b0` (health above 0, shield at most the charge's `Explosion_Damage`: `C4_ACCEPT_DAMAGE_READING`,
PF.R14) through `SceneHealth.c4TargetAt` -- never a type-less action's node. On the page (PF.R18: the page names the
target) it is the destructible under the reticle: the first surface along the view (`c4Aim`; the movement's skip
surfaces passed over, as the door pick passes them) within `C4_REACH_READING` of the feet along the ground, the SEAL
still (`C4_STILL_READING`) -- `c4Plant`, `GrenadeThrower.c4Target`, which also lights the HUD's `c4` prompt
(`action_place_c4.tif`). In the room (the authority on eligibility and reach) it is the nearest such destructible whose
target, as it stands, comes under `C4_REACH_READING` along the ground (`c4PlantNear`, `SceneHealth.c4TargetNear`):
every point the reticle can take on a target is at least that near, so the room never refuses the page's plant for
reach. PF-13 brings the 0.2 s settle, the struck node on the wire and `INVISIBLE_DI`; this keeps `placeCharge()`'s C4
branch to one call. *(PF-13, 2026-10-05: done -- the room's nearest-in-reach gave way to the page's named node, and the
stillness gate to the settle: s9.)*

**The charges** (174 s3: the thresholds before distance and occlusion; `SCENE_BLAST_REACH_PLACEHOLDER`, PF.R11): C4's 18
and the RPG round's 20 qualify against 17, the M67's 10 does not. The RPG's blast reaches a barrier through the room's
`blast` -> `SceneHealth.blastAt` at its `Explosion_Damage` plus modifier (20): no new path. Each barrier dies once a
round (its record spent, its destroy program's context valve 1); the round's reset (`FUN_002ac0e0`) restores geometry
and health together. Every barrier's `good_parts`, `di_good`, `whats_left` and `bad_parts` are saved references (bit 28,
search 1 under its own root): Vigilance has no twin of Frostfire's pane gap (SUP-02's), and a new round restores all
five (`viewer/test/accessBarriers.test.ts`, disc).

**The room's effects** (`ROOM_SKIP_EFFECTS_READING`): the room's world runs every scene program with `skip_effects`
reading 1, as a joiner's replay does. Run with its effects, `destroy_accessN` in the room turned `bad_parts` on (its
pieces at rest, drawn on every page, the part-fly loop not being run) and its one `access_part_fly` call turned the
caller -- the action's node -- off, and the wire carried both. Silent, the wire carries only `good_parts` and `di_good`
off and `whats_left` on. A late joiner applies that list silently (`WorldState.applyWire(env, true)`) and plays
nothing. A page that follows a live room takes the death off the wire (SUP-02's `SCENE_DEATH_ON_WIRE_READING`) and,
by ruling PF.R26, runs it for presentation only: `.WOOD_DEBRIS` plays once and no node turns. Offline play is the same
path -- `LoopbackMatch` runs a `Room` (its world `skipEffects`) and the page follows it through `apply()` -- so a barrier
opens with its sound and without its debris offline and online alike; only a synthetic test
(`viewer/test/accessBarriers.test.ts`) exercises a world that runs a death itself with its effects (`bad_parts` on).

**Both sides' C4** (VG-C4-BOTH): Vigilance's `mission.rdr` reads `Enable_c4 = 9` (1 SEALs | 8 Terrorists), so the
armoury offers C4 to both (`valveAllows`, `applyPicks`) and the room's plant has no side test: a Terrorist's charge opens
a barrier at its `Timer1` (`match/test/roomBarriers.test.ts`, synthetic; the disc twin in `accessBarriers.test.ts`).

**Not done here.** The once-a-round action point (+2; `+0x3f` bit 1, `FUN_002b5510`) is PF-14's (sprint 27):
`WorldState.actionUsed`/`markUsed` stand ready. The page plays a death's effects only where it runs the death itself;
the live page in a match learning a death off the wire and playing it is SUP-02's (its pane), which the barriers then
share. `FOR_CHILDREN`/`OBJECT_MAKE_WORLDCHILD` (the debris flight) are undecoded. A rocket that strikes a barrier as a
dud (inside its arming 100 u) does not open it: the grenade's events do not name the struck node, so the impact's
`+0x94` handler (research 94 `IMPACT_HIT_READING`) reaches bodies only.

### 8.1 Readings (SUP-03)

| name | value | what it stands in for | what would settle it |
|---|---|---|---|
| `ROOM_SKIP_EFFECTS_READING` (`viewer/src/worldState.ts`; the room's `WorldState.skipEffects`) | `true`: the room's world runs every scene death and action with `skip_effects` reading 1 | whether everything a program guards with `IF skip_effects == 0` is presentation -- the game's join replay (`FUN_002b4440` D:L156767, `JOIN_SILENT_READING`) skips it, which says so for the state a joiner must hold; read on Vigilance's and Desert Glory's `destroy_accessN` only | every guarded branch of the 22 maps' `MZANIM`s read for a non-presentation change; a capture of a joiner entering after a Vigilance barrier fell |
| `C4_REACH_READING` (`viewer/src/equipment.ts`) | the action object's default reach, 32 u (`ACTION_RANGE_DEFAULT`, `FUN_002b49f0`), along the ground, strict: since PF-13 the struck point from the feet on the page and in the room alike (`c4InReach`) | the plant's `body+0x208 < 396` (D:L475402-475404), which research 202 s2.1 reads as the squared distance from `skel_root` to the aimed point (19.9 u) | the capture research 206 A30 owes (a `body+0x208` write breakpoint aiming at a barrier within 2 m); PF-13 kept 32 (s9.1: the room poses no `skel_root`) |
| `C4_TARGET_READING` | retired 2026-10-05: C4's target is the destructible that takes the charge (`SceneHealth.c4TargetAt`), never `actions.rdr`'s type-less records | -- | resolved (this section; research 94 C5.1) |

## 9. The C4 and claymore gates (PF-13)

The plan's PF-13 (appendix C3-X2/X3, W2-A-10; research 181 s2.5, s6.2-s6.3, s9.2; 194 s7 A10; 179 s11.13; 206 s1.2 V1
#9; 176 s7.3). Four rules, each on the page and in the room where the room applies it.

**The claymore and the PMN in water** (`scene/src/projectile.ts` `CLAYMORE_RULES.maxWaterDepth`): the claymore's fire
(D:L475310-475320) reads `+0xf88` only while bit 7 of `+0x105e` is set, and `FUN_005b52b0` (D:L469852) writes `+0xf88`
as the water's depth over the feet and sets that bit in water; refused above `DAT_003dfe10` (10.0) x 0.32 = 3.2. The same
test guards item 0x9e, the PMN (D:L475338-475350). The speed is never read: `CLAYMORE_RULES.maxSpeed` (3.2 u/s) is
gone, and with it the page's (`grenade.ts` `startPlacing`) and the room's (`placeCharge`, `dropped('throw', 'moving')`)
refusal of a moving SEAL. The depth is `wadingDepth` (`viewer/src/equipment.ts`): the water line over the feet
(`probeWater`) less the feet, as the traversal reads the water (research 86 s5); the room refuses with `wading`.
`placeSeconds` (1.3 s) stays the claymore's own. Fish Hook's SEAL spawn wades 3.04 deep (feet 46.96, the water at 50):
under 3.2, the page sets four claymores down and the room takes all four (`viewer/test/placedChargesReal.test.ts`, disc).
That file pinned the room taking none as a known defect (its hand-walled test meeting the water); found already taken
on agent/world d9696dbf with the old speed test restored -- the placed path at the hand's height (PF-05, SVC-23b) clears
the surface -- the pin was folded into the list, as its own comment asked.

**C4's settle** (`C4_AIM_SETTLE_S` = 0.2, `C4Settle`, `c4PlantAllowed`): `body+0xe84` is kit `+0x8a4`, which
`FUN_005be6f0` (D:L475130-475197) sets to 0.2 (0x3e4ccccd) whenever the aimed object `body+0x3dc` (the aim ray
`FUN_005aa6e0`, D:L464262-464286) is none, another, not plantable (its `+0x94` interface's vtable +0x10) or has moved
since last frame (V1 #9), and otherwise counts down by the frame's time; the plant needs 0. The port counts up from 0
on the same conditions: the frame that (re)starts it counts nothing, so a target is settled the frame after six game
frames (or twelve page frames) on it. "Moved" is the polygon first struck no longer where it was -- a pane on a swinging
door, whose leaf's polygons the door turns in place; the reticle wandering over the same still node runs on. No body
stillness gate (ruling PF.R13): the SEAL may plant on the move. The settle is the page's (ruling 9, PF.R18), stepped
in `GrenadeThrower.update` (`c4Tick`); `c4Target` -- the HUD's C4 prompt (`main.ts`) and `plantC4`'s gate -- answers
only a target settled, in reach and plantable.

**The plant's time** (`C4_PLANT_SECONDS`, `c4PlantSeconds(table, clips)`): action 0x3e `Put on wall` (table 0x661060)
starts with trigger `+0x60` = 0.45 (0x3ee66666, D:L475420-475452); the kit's tick puts the charge down when `+0x87c`
reaches 0 (D:L476883-476901), at the clip's phase 0.45, which `FUN_0028c4f0` (D:L134236-134275) advances by
`dt / (playback x (n - 1) / n)` -- research 85 s3's release rule. `seal_put_onwall`: playback 2.5 (`motion.rdr`), 42
keys (`MOTION_P.ZAR`): 0.45 x 2.5 x 41/42 = 1.098 s (plus up to a frame). `c4PlantSeconds` computes it from the two
files and the test pins it there; `C4_PLANT_SECONDS` is the transcription the page uses (it loads no clip for it). The
body played the claymore's clip (`PLACE_CLAYMORE_ANIM`) through the plant until 2026-10-07: it now plays
`seal_put_onwall` (`@s2u/scene` `PUT_ON_WALL_ANIM`; the pistol's `seal_p_put_onwall`), appended to `HOLD_CLIPS` as
code 13 so no earlier code moves (research 85 s8.1). *Protocol 11 (NET-WIRE, research 224 §2.5): the body's hold code
rides `BodyState.flags` bits 11-14 and its parity bit 15 still -- the flags widened to a u32, no code renumbered; the
throw's `target` and `surface` (below) are JSON and unchanged in 11.*

**INVISIBLE_DI** (`C4_REFUSED_MATERIAL`): `005c1970` (D:L476975-476977) compares the final surface's material name with
the ELF string at 0x65f8c8 through `00198f18` (a case-sensitive byte compare); equal, it returns before the placement
call (L476985). The port refuses that exact name and requires none (research 194 s7 A10): the page's pick reads the
struck polygon's material (`aimPick`: the byte through `surfaceMaterial`, byte 0 the map's `DefaultMaterial`), the room
the polygon its own line meets (`c4Line`). Vigilance's `access1` `di_good` reads another material (the disc test).

**The wire and the room** (ruling PF.R18; protocol 10, additive, no bump): `throw` += `target` (a `SceneDestructible.id`)
and `surface` (`{ path, point }`: the polygon owner the aim struck and the point). The room (`placeCharge`, C4 branch)
refuses, in order: no target or surface, or `SceneHealth.c4TargetAt(surface.path, Explosion_Damage)` not that target
(`no c4 target`; `FUN_002739b0`, PF.R14); the point not within `C4_REACH_READING` of the feet along the ground
(`c4 reach`); the line from the head -- `headPoint` kept on the body's side along `headEye`, as `startRefused` stands it
-- meeting another node before the point (`c4 walled`) or not meeting the named node there (`c4 missed`); the surface
named `INVISIBLE_DI` (`c4 surface`). Then `startRefused` and the rest as before. `target` not whole or `surface` not a
string path and a finite point: the throw is ignored, as a malformed throw is (`roomFuzz`, `roomEquipment`). The room
models no settle: a hostile page can skip it, as it can a door's pick; eligibility, reach, line and material are the
room's. SUP-03's `c4PlantNear` (the nearest in reach) and `c4Plant` are retired; `SceneHealth.c4TargetNear` stays, no
longer called by the room.

**Both sides** (176 s7.3): `Enable_c4 = 9` -- the Terrorist's plant end to end names its target too
(`match/test/roomBarriers.test.ts`; on the disc, `viewer/test/accessBarriers.test.ts` picks access1's `di_good` along
its witness segment, settles it, checks the room's line and material, and opens it).

**Not done.** The plant's own clip (above). The hip-bone reach (`body+0x208 < 396`, 19.9 u from `skel_root`: research
202 s2.1) -- the room poses no skeleton, so `C4_REACH_READING` keeps 32 u (s8.1). `body+0xe84 == 0` in the placing
(`FUN_005be9a0` D:L475402-475405): no writer found -- note-only (s9.1). The aim ray's length (`max(range, 600)` capped by
the camera's `+0xec`, research 179 s11.14): the page's view ray (`WalkMode.fireAim`) stands in.

### 9.1 Readings and placeholders (PF-13)

| name | value | what it stands in for | what would settle it |
|---|---|---|---|
| `C4_SURFACE_SLACK_PLACEHOLDER` (`viewer/src/equipment.ts` `c4Line`) | 1 u: how far past the page's point the room's line runs, and how near it the named node must be met | nothing of the game's -- the original tests its own aim, the port re-checks the page's pick from the head, and (LATER 121, 2026-10-19) asks the named node's **first** hit along the head's line or the camera's at the ask's command (`orderOrigin`) -- the eyes the page aims from (the original's aim record is the camera's, `FUN_005aa6e0` with `cam+0xd8`, D:L142028) -- so a far-face point, behind the near face from both, is refused 'missed' while a top face the camera strikes first is not (LATER 121's re-review: the slack now also covers the gap between the room's rebuilt camera eye and the page's -- the posed root, the pass's hold and smoothing, the look a frame ahead, as `orderPickTrusted` names for orders -- so an honest point within about a unit of an edge can still be refused while the two eyes differ; and the room asks only that the point be **seen** first from an eye, not that the eye **looked** at it: at a steep pitch the camera can rise over a barrier lower than it and, on an open-topped node, see its far face's inside, which a forged page holding that pose could name -- the head's line had the same property for a barrier lower than the head; a look-cone check on the camera eye would settle it, LATER 139 -- a first one withdrawn on its review 2026-10-19: an unswept ray at the throw's send refused honest picks); a tolerance of two casts meeting one plane | no source; a measure of the page's and the room's casts on the five sprint maps (float rounding only) |
| `C4_START_EYE_TICKS_PLACEHOLDER` (`viewer/src/equipment.ts`; `room.ts` `placeCharge`) | 6 ticks (0.1 s): how far past the plant's clip (`C4_PLANT_SECONDS`) a C4 throw may arrive, on the room's event clock (`eventClock`, with `FIRE_ARRIVAL_JITTER_TICKS`), and be judged from its placing's start eye (LATER 144) | nothing of the game's -- the original judges its aim on its own machine; the page's send lag past the clip's callback (`netPage.ts` `lastSeq`) | honest plants' start-to-send command gaps measured over the browser runs |
| `C4_START_EYE_FEET_PLACEHOLDER` (`viewer/src/equipment.ts`; `room.ts` `placeCharge`) | 2 u: how far the feet may stand from the placing's start and its start eye still count (LATER 144) | the plant's clip holding the mover (`seal_put_onwall` travels 1.8, `motion.rdr`; the prone clip none), plus float slack | honest plants' feet drift from hold to send measured, standing and prone |
| `C4_LOOK_BOUND_PLACEHOLDER` (`viewer/src/net/shotCone.ts` `lookFitsPoint`; `room.ts` `placeCharge`, `useAction`) | `ORDER_EYE_BOUND` (1.57) + `C4_LOOK_EPSILON` (0.05): how far across the look a named point may lie from the camera's swept locus at the send or the placing's start, for that camera eye to count in `c4Line` (LATER 139, 2026-10-21) | nothing of the game's -- the original's aim is the first hit along its own camera's look (`FUN_005aa6e0` with `cam+0xd8`, D:L142028). The bound rests on THE PAGE's cast: its side probes shift its eye at most `CAM_MARGIN` x sqrt 2 (`FUN_0029bf70`) and it casts from that eye toward the far point 1000 out (`FUN_00297410`; `walk.ts` `fireAim`), so its lines run along the look through the swept locus -- a reading of the page's rig. The original casts from the eye toward the moved target (`FUN_00296f10` D:L140700-140715, `FUN_0029bc90` D:L143105, `FUN_005aa6e0` D:L464110-464123), its line parting from the look by s/d after a side shift: LATER 305 (corrected 2026-10-22 by LATER 139's review; the earlier wording here was ours and wrong) | honest page picks measured against the room's swept lines -- a drifting clip, the lead probe at -50 by a wall, the posed root, a peek, a turning switch press -- over the browser runs |
| `C4_VIEW_LINE_PLACEHOLDER` (`viewer/src/net/shotCone.ts` `lookFitsPoint` with an eye; `room.ts` `pageEye`) | 0.05 u (`C4_LOOK_EPSILON`): how far across the original's line -- the page's eye, reproduced by the room, through the frame's moved target -- a named C4 or SWITCH point may lie and that eye still count in `c4Line` (LATER 305, 2026-10-22) | nothing of the game's -- the original's pick is the first hit along that line itself (`FUN_005aa6e0` from `cam+0xd8` along the post-pass matrix, D:L142028); a room's tolerance for the wire's look quantisation (under 0.004 u at 40 u) and the struck point's rounding | honest page picks at a side-shifted, pulled-in eye measured against the room's reproduced rays over the browser runs |
| `VIEW_EYE_REPRO_PLACEHOLDER` (`viewer/src/net/shotCone.ts` `viewCells`, `reproducedEye`) | 0.1 u beyond a cell's own half-diagonal: how far a claimed eye may stand from the eye the room reproduces with the original's pass (`cameraPass`, `FUN_0029bf70`, the page's own function at its defaults) from a cell's goal eye toward its moved target, and still be that camera's eye for the view-line rule (LATER 305) | nothing of the game's -- the console reproduces nothing; the residue between the page's and the room's arithmetic of one function (pinned equal to 1e-9 at a shifted, pulled-in eye: `shotConeViewLine.test.ts`) | honest page eyes over a drifting clip, a peek and the posed root measured against the room's reproduced ones -- and where a wall's pull-in starts inside a cell (the pass is not continuous across one: an honest eye at its edge past the tolerance gets the floor's verdict); a forger's residual steer is at most atan((0.1 + half) / the eye-to-target distance), about 1.6 degrees at 28 u (the gameplay seat's read) |
| `C4_BODY_STILL_READING` (*note only*) | not modelled: the placing's `body+0xe84 == 0.0` (`FUN_005be9a0` D:L475402-475405) | what `+0xe84` is (research 179 s11.13: one load in the ELF, no writer) | an RDRAM read of the local body's `+0xe84` standing and walking (a PCSX2 dump in a round) |
| `C4_STILL_READING` | retired 2026-10-05 (PF-13): the 0.2 s aim settle, not the SEAL's speed (`C4_AIM_SETTLE_S`; research 181 s6.3, 179 s11.13, 206 s1.2; PF.R13) | -- | resolved |
| `C4_PLANT_TIME_READING` | retired 2026-10-05 (PF-13): 0.45 x 2.5 x 41/42 = 1.098 s from `motion.rdr` and `MOTION_P.ZAR` (`C4_PLANT_SECONDS`, `c4PlantSeconds`; research 181 s2.5) | -- | resolved |
| `C4_SURFACE_READING` | resolved 2026-10-05 (PF-13): refused on the exact name `INVISIBLE_DI`, none required (`C4_REFUSED_MATERIAL`; research 194 s7 A10) | -- | resolved |
