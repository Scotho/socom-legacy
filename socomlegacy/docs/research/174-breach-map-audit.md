# 174 — Breach: Sujo, Enowapi and Sandstorm

Filed 2026-10-04 from the old-layout checkout (`$WT`, the clone's pre-restructure web project), where it was the uncommitted note 99 (WT-99 in the research wave of 2026-10-04, [178](178-the-research-wave-of-2026-10-04.md)); renumbered 174, the cross-references to its sibling notes 171-177 and its plans renumbered with it. Status: reading, pending review.

Audit date: 2026-10-04. Scope: the three retail online Breach maps, their objective, environmental actions, destructibles, initialization/reset, collision consequences and missing web support. This is a feasibility and implementation audit; no gameplay was changed.

All three maps can reuse the shared bomb state machine, but their environmental mechanics are substantially different. Sujo has six breach barriers and two distinct SEAL airstrikes. Enowapi has two barriers that are also moving gates, three gate levers, a wire-cut lighting action and two SEAL airstrikes. Sandstorm adds a destructible radio/transformer/tower chain, repeated Terrorist helicopter attacks, three breach barriers, a separate breakable plank, an AA gun, glass and the communication-building destruction. Treating every untyped action as a C4 target loses these distinctions.

## 1. Evidence and reproduction

**Measured** below means parsed local retail bytes or an explicitly described geometry query. **Read** means executable/script control flow reconstructed statically. **Proposed** means web implementation work. A line-segment opening is not a capsule traversal test, and static script timing is not an original-console timing capture.

Local sources are `public/maps/RUN/MP61.ZDB`, `MP62.ZDB`, `MP73.ZDB` and `RUN/ZWEAPON.ZAR`. The durable probe accepts another legally supplied local RUN directory:

```powershell
cd socomlegacy
npx tsx tools/probe-breach-maps.ts
npx tsx tools/probe-breach-maps.ts C:/local/RUN MP62
npx tsc --noEmit -p tools
```

[The probe](../../tools/probe-breach-maps.ts) prints derived action records, health fields and member-relative offsets, resolved target paths, initial state flags, selected state/effect metadata and full-map segment intersections. It does not extract assets or scripts. It suppresses alignment commands before matching decoded commands with byte offsets. Its reference resolution is deliberately limited to literal placed names and ancestry; unresolved references remain visible. Repeated prototype paths are not globally unique instance IDs.

Executable citations use **D** = local `C:/projects/socom_pc/game/analysis/socom2_game.elf.decomp.c`. **R** = local generated recomp source `C:/projects/socom_pc/recomp/output/`. Neither source is copied into this repository. Function addresses are durable anchors even if local decomp line numbering changes. reCOM headers corroborate field names, but retail executable behavior takes precedence.

Existing corpus anchors: [171: shared bomb and map-state machinery](171-crossroads-demolition-and-bridges.md), [94: C4/projectiles](94-the-arsenal.md), [91: multiplayer room behavior](91-the-round.md), [89: effects](89-effects.md), [86: traversal](86-traversal.md), [77: zAnim format](77-motion-format.md). Some older format comments describe the reCOM two-bit activation field; retail dispatch tests **three low bits** (`FUN_002713f0`, D119324–119335).

## 2. Shared Breach objective

**Read:** the retail mode value is **BREACH = 1**, DEMOLITION = 2. `FUN_002c9540` parses these values; game initialization only constructs the shared bomb for modes 1 and 2 (`InitBomb`, D149166–149173). `FUN_0059def0` rejects non-SEAL bomb pickup specifically when the mode byte is 1 (D457629). Do not infer equal pickup permissions from the shared class.

All three maps contain exactly one `MPBOMB` action:

| Map | Plant action / valve / animation | World origin | Reach |
|---|---|---|---|
| MP61 Sujo | `terrorist_tent` / `mp_bombCC` / `BombPlace` | `(602, -12.418, 2432.892)` | horizontal 15, elevation 15 |
| MP62 Enowapi | same | `(1645.831, 174.939, 1365.420)` | same |
| MP73 Sandstorm | same | `(926.25, 105, 1166.25)` | same |

The action prompt uses `action_MP_bomb.tif`. These are map world units; 10 units = 1 metre. The `terrorist_tent` name is a shared internal action name, not proof that each objective is a tent.

Initialization starts with a **ground bomb at the named `StartBomb` marker**, not a preassigned carrier. `FUN_002c1a80` finds that AI point through `FUN_0052db70`, converts its cell through `FUN_0052d480`, clears the carrier ID and requests state 1 (D163839–163885). State-1 application with no carrier invokes ground-bomb creation `FUN_0059dab0` (D163956–163964). Measured marker cells and their XZ centres are:

| Map | Authored marker spelling | AI cell `(map,x,z)` | Cell centre `(x,z)` |
|---|---|---|---|
| MP61 | `startBomb` | `(0,82,72)` | `(806.037,523.462)` |
| MP62 | `startbomb` | `(0,86,179)` | `(689.762,1616.111)` |
| MP73 | `StartBomb` | `(0,211,214)` | `(2074.579,2091.809)` |

These are derived cell centres, not a measured final bomb height. Preserve floor placement and runtime pickup checks; do not infer Y from the plant-action origin.

The shared `CZBombState` has ground/carried/planted/defused/detonated states 1–5. It carries actor IDs and position separately from `bomb_owner` team values. [171](171-crossroads-demolition-and-bridges.md) traces pickup/drop, hold progress, team/range checks, networking and reset. The relevant timing reading is a 5-second plant hold followed by a 2.25-second equipment placement, approximately 7.25 seconds to commit; the 3-second equipment cooldown is separate. Defuse uses the same 5-second hold but commits state 4 directly, without the placement delay (`FUN_005920c0`, D451507–451522). Its offer checks opposing `bomb_owner`, not a Breach-mode prohibition (D452436–452454); its horizontal/elevation limits are 15/20 (D452589–452598). Fuse is 30 seconds. Breach detonation awards the actor 4 points, versus 2 in Demolition (`FUN_00545750`, D411655). These values must be captured on original runtime before calling them timing parity.

**Measured/read per map script:** the `objectives` animation independently monitors elimination, `mp_bomb`, `bomb_owner`, `mp_timer` and `mp_winner`. A planted bomb (`mp_bomb == 3`) stops the ordinary `start`/`mission_timer` sequences and starts bomb timer/defuse handling. Timeout selects `mp_winner = 8`, the Terrorist defender win. The sequence called **`breach_success` is the Terrorist win handler**, not the SEAL objective-explosion trigger. It waits until `mp_winner == 8`, awards `mp_score08`, and chooses the local team's success/failure presentation.

| Script anchor, offsets within `objectives/Seq_Data` | MP61 | MP62 | MP73 |
|---|---:|---:|---:|
| `mission_timer` sequence start | 6416 | 5828 | 5828 |
| initial WAIT, 5 seconds | 6444 | 5856 | 5856 |
| embedded WHILE condition, timer != 0 | 6456 | 5868 | 5868 |
| timeout writes winner 8 | 6488 | 5900 | 5900 |
| `breach_success` sequence start | 6504 | 5916 | 5916 |
| embedded WHILE condition, winner != 8 | 6532 | 5944 | 5944 |
| defender team score increment | 6696 | 6084 | 6092 |

The present effects decoder does not preserve conditional WHILE expressions; inspect the embedded VALVE command at WHILE payload +8. Its name index, operand and operation are at embedded-command +4/+8/+12. A decoded `while` alone is insufficient evidence for a condition. Stock scripts also retain owner-2 and two-team bomb-result branches despite Breach's pickup restriction. Do not expose an impossible Terrorist plant solely because those branches exist. `BombPlace` handles defuse by setting bomb state 4 after the actor commands, not by destroying a breach barrier.

The three `start` sequences wait **5 + 10 seconds before elimination checks** (WAIT at Seq_Data +264/+516), a 15-second grace distinct from Demolition's 13 seconds. They test empty Terrorists before empty SEALs. SEAL elimination victory calls the terminal sequence directly; a defender victory sets winner 8 and is presented through `breach_success`. The latter adds a 2-second wait before defender score/presentation. The normal SEAL detonation branch likewise has one 2-second presentation wait. Every `success`/`failure` sequence then waits 20 seconds, advances/checks the round count, waits 1 second and sets the mission result. Some losing-side branches also call `failure` before the defender handler calls it again; establish whether that restarts the sequence before assigning a single post-result delay.

| Objective timing/branch anchor in Seq_Data | MP61 | MP62 | MP73 |
|---|---:|---:|---:|
| SEAL detonation WAIT 2 | 4192 | 4120 | 4120 |
| Defender handler WAIT 2 | 6684 | 6072 | 6080 |
| `success` / `failure` sequence starts | 6872 / 6964 | 6260 / 6352 | 6268 / 6360 |
| Spectator call after all Terrorists are eliminated | success at 1088 | success at 1040 | **failure at 1040** |

The last row is a presentation discrepancy, not a different winning team: every such branch still sets `mp_winner = 0`. Sandstorm also explicitly stops `switch_timer` in the defender handler at +5976. Normal Terrorist-defuse branches wait 3 seconds before setting winner 8, after which that defender handler runs. These are script scheduling observations; do not add all waits unconditionally to a generic web intermission.

**Remaining objective captures:** initial ground-marker floor placement, full Breach defuse availability/hold timing, exact plant/timeout/elimination ordering and the interaction between post-result animation delays and the room's intermission. Preserve the original bomb rules as a separate state domain from all environmental valves below.

### 2a. The breach's end-of-round lines, as the page plays them (LATER 130, 2026-10-19)

Read off the disc's MP61, MP62 and MP73 `objectives` through `tools/probe-npc-maps.ts --section commands` (offsets within
`Seq_Data`; MP62 and MP73 share their offsets; MP73's `start` and `defuse` lines by loc id, 7305 and 7307, its
`breach_success` lines as text, its music `_ALG`):

- `breach_success` (MP61 @6504, MP62 / MP73 @5916) waits for `mp_winner == 8`, so it runs on **every** Terrorist win: it
  stops the music and `start` (MP61 `music1`..`music6`; MP62 `music1`..`music3`; MP73 `switch_timer`, `music1`..`music3`),
  then `^*PT_0021`, "THE SEALS FAILED TO BREACH AND DESTROY THE ENEMY BASE." 0.7,
  "TERRORISTS WIN!" 0.9, WAIT 2, `mp_score08 += 1`, `MUS_MP_TERR_WIN_BRA` (MP73 `_ALG`), then `failure` for a local SEAL
  and `success` for 8 and 16.
- Who sets `mp_winner = 8`:
  - `start`'s SEALs-eliminated branches (MP61 @1368, @1504, @1640; MP62 and MP73 @1296, @1432, @1568 -- teams 8, 16, 0): "ALL SEALS ELIMINATED" 0.7 (MP73: loc id 7305) and
    the Terrorist win music, then the valve -- for a local SEAL a `CALL_SEQUENCE failure` before it. The valve comes
    after the branch's steps, so `breach_success`'s follow them.
  - `defuse`'s Terrorist branches (MP61 @2632, @2836, @3040; MP62 and MP73 @2560, @2764, @2968 -- teams 8, 16, 0): `^PH_0003`, "BOMB DEFUSED" 0.7, WAIT 3, the music, then the
    valve (a local SEAL's calls `failure` first). The same: `breach_success`'s follow.
  - `mission_timer` at 00:00 (MP61 @6488; 5900 on the others): the time-out.
  - `bomb_timer`'s Terrorist detonation (`bomb_owner == 2`, MP61 @4932, the others @4788) -- unreachable here: the three
    maps have no `seal_tent` (research 284 §5), so no Terrorist plants. Were it reachable, `breach_success` would run
    beside its lines, not after them, since that branch sets the valve before its steps.
- The music is cued twice (the branch's, then `breach_success`'s 2 s on). The original's music cue checks no name
  (`FUN_00348dc0` D:L245383-245446: with a stream playing it starts the fade and holds the new cue pending by priority),
  so the second hands over to the same stream again -- as the port's music slot does with any cue (`audio.ts`
  `playMusic`).

**As built** (the page, `packages/viewer/src/roundCues.ts`; `BREACH_LINES_READING`): on a script with `breach_success`,
`decided.terroristElimination` is `start`'s SEALs-eliminated branch's own steps then `breach_success`'s, per local team,
which the page plays for an `eliminated` won by the Terrorists (`netPage.ts`); the Terrorists' `bomb.defused` cue is
`defuse`'s branch then `breach_success`'s. Every other map keeps elimination's two lines.

**The time-out and the holds (LATER 138, 2026-10-19; reading, pending review).** `breach_success` (MP61 @6564-@6864, MP62
@5976-@6252, MP73 @5976-@6260) stops the music and `start`, posts ^*PT_0021 and its two lines, WAIT 2, the music, then
by `player_team`: 0 -> `CALL_SEQUENCE failure`, 8 and 16 -> `success`. `CALL_SEQUENCE` (`FUN_00269b00`
D:L114714-114760) starts the first sequence of the name **not running** -- one whose state (+5) is 2, 3 or 4 is skipped --
so on a SEAL host, whose `start` branch or `defuse` branch already called `failure`, `breach_success`'s second call leaves
it running: the elimination's hold stays 21 s and the defuse's 24 s (the room's; research 106 §5; research 89's
"restarts" corrected). The time-out (`mission_timer` sets `mp_winner = 8`, MP61 @6488, MP62 / MP73 @5900) has no earlier
`failure`: `breach_success`'s 2 s, then `failure` 20 + 1 -- 23 s (`BREACH_TIMEOUT_HOLD_READING`; a Terrorist host's
`success`, the same), which the room now holds, sending `timedOut`; the page plays `decided.timeout`, `breach_success`'s
steps on every console. A Terrorist or spectator host's elimination and defuse holds (23 and 26 s) are not the room's
perspective (`ELIMINATION_PERSPECTIVE_READING`). MP73's `breach_success` also stops `switch_timer` (@5976). The original's bomb is live through a decided hold
(`DECIDED_HOLD_BOMB_READING`, research 214 §6; LATER 143, 145); the room's BREACH bomb is LATER 149's (§2b; §8 item 7).

**The time-out's hold keeps the plant live on MP61 and MP62 (LATER 150, 2026-10-19; reading, pending review).** The
time-out's path -- `mission_timer`'s `mp_winner = 8`, then `breach_success` -- stops only the music and `start` on MP61
(@6564-@6612) and MP62 (@5976-@6000), never `switch_timer`; MP73's `breach_success` stops it first (@5976), and every
elimination branch of `start` stops it and `bomb_timer` on all three (MP61 @624/@640 ... @1688/@1704). So in MP61's and MP62's
23 s hold a plant runs `switch_timer`'s branch (@3304-@3564: its lines, WAIT 2, the music, then `CALL_SEQUENCE`
`bomb_timer` and `defuse`), and a defuse `defuse`'s own branch (MP61 @2632-@2828: ^PH_0003, "BOMB DEFUSED", WAIT 3, the
music); `breach_success` ran to its end at the time-out, so its tail does not play again, and the branch's
`mp_winner = 8` changes nothing. A detonation cannot come inside the hold: the fuse is 30 s, and a plant before the
time-out stops `mission_timer` (@3336) -- the room agrees, no time-out and no elimination while planted. DEMOLITION has no
such hold: its `mission_timer` calls `abort`, which sets `mission_timeout` at once (MP72 @3828, @6556).
**As built** (`TIMEOUT_PLANT_LIVE_READING`): `roundCues.ts` derives `decided.timeoutPlantLive` from each script (neither
`mission_timer`'s nor `breach_success`'s ops past their `WHILE` stop `switch_timer`: MP61, MP62), carrying the `defuse`
branches' own steps; `RoundAudio` keeps what decided the round, and after the time-out there plays a plant's cue and that
defuse; `BombPage` silences the plant only after an elimination or a welcome whose `decided` names no time-out (LATER
155: the welcome names the deciding reason, and a joiner's round audio is marked decided by it; an older room's welcome
names none, an elimination's taken). Found on the way: the page's strings fill (`withObjectiveTexts`) dropped
`decided.timeout` (LATER 138, B87; on main, in no nightly), so MP73's time-out posted no lines; it keeps every field now.
LATER 160 (2026-10-19; reading, pending review): a replay's seek resets the round
audio before its folded welcome marks the target's hold (`matchActions.ts`'s seek listener, as a reconnect's close resets
it before the welcome), so the hold's reason is the target's, never the old playhead's, and a seek into play leaves it
undecided -- a joiner's page (a REPLAY_ADAPTATION seam; `replayRoundAudio.test.ts`), except in a hold a bomb's result decided, which the fold does not record (LATER 158): a seek there leaves it undecided where a joiner's page is marked ('other') -- nothing audible, the room telling nothing more in that hold. LATER 161 (2026-10-19; reading, pending review): the replay page's round audio runs on the replay's clock (`matchSound.ts` `roundAudioClock`, read off the client's `pageClock`, RE-3) -- a pause holds what is queued, the speed scales the script's waits, a voice already sounding plays on to its end; a line queued past the recording's end never plays (the clock stops there), a step forward plays what fell due in it at once, and while paused the unlock retry and its 5 s window wait (replay seconds: 20 s of wall at 0.25x); the live page's stays `performance.now` (a REPLAY_ADAPTATION seam; `replayRoundAudioClock.test.ts`).

### 2b. Readings (LATER 130)

| name | in code | what | level |
|---|---|---|---|
| `BREACH_PICKUP_READING` | match `bomb.ts` (`BombAuthority`'s `pickupTeam`) | LATER 149: only a SEAL picks the bomb up on BREACH -- `FUN_0059def0` (D:L457619) requests the pickup, with game `+0x111 == 1`, only when `FUN_002c31d0` (D:L164725-164762) finds the player's team word the SEALs'; `roomBreachBomb.test.ts` | reading, pending review |
| `BREACH_DETONATION_HOLD_READING` | viewer `net/objective.ts` (`resultHoldS`, read by match `room.ts`) | LATER 149: 23 s on a SEAL host -- `bomb_timer`'s SEAL-console branch, WAIT 2 (MP61 @4192, MP62 / MP73 @4120) then `success` (MP61 @4284), 20 + 1; the Terrorist defuse is DEMOLITION's 24 (`defuse` @3040: WAIT 3, `failure`); `roomBreachBomb.test.ts` | reading, pending review |
| `BREACH_TIMEOUT_HOLD_READING` | viewer `net/rules.ts` (`timeoutHoldS`, read by match `room.ts`, the play arm's time-out) | §2a: `23` s, the time-out's Terrorist win -- `mission_timer` sets `mp_winner = 8` (MP61 @6488, MP62 / MP73 @5900), `breach_success` WAIT 2 (MP61 @6684), a SEAL host's `failure` (@6768) 20 + 1; `room.test.ts`; owed: a capture | reading, pending review (LATER 138) |
| `TIMEOUT_PLANT_LIVE_READING` | viewer `roundCues.ts` (`timeoutStopsPlant`, `decided.timeoutPlantLive`; `roundAudio.ts` `bomb`, `bombPage.ts` `decidedRound`) | §2a: the breach time-out's path leaves `switch_timer` running on MP61 and MP62 (MP73's `breach_success` stops it, @5976) -- in that hold a plant plays its cue and a defuse its own branch (MP61 @3304-@3564, @2632-@2828); derived at run time; `roundCues.parity.test.ts` (the pin, re-derived from the disc), `bombPage.test.ts` | reading, pending review |
| `BREACH_LINES_READING` | viewer `roundCues.ts` (`breachTail`, `breachDecided`, `withBreachDefuse`) | §2a: `breach_success` on every Terrorist win, after `start`'s SEALs-eliminated branch and `defuse`'s Terrorist branch -- read at run time off the disc's MP61, MP62, MP73; `roundCues.parity.test.ts` (the pin, re-derived from the disc) | reading (re-read at the source by LATER 130's fresh review, 2026-10-19) |

## 3. Destructible damage interfaces, now decoded

`MZANIM.ZAR/Anim_Sets/mission/Animation_List/<name>/Anim_Health` is 24 bytes:

| Offset | Field | Retail anchor |
|---|---|---|
| +0 | u8 target Node_Ref index; observed +1..+3 padding | `FUN_002740e0`, D121150–121151 |
| +4 / +8 | f32 current / reset health | `FUN_00273960`, D120884–120888; clone `FUN_0026d940`, D117290–117300 |
| +0xc / +0x10 | f32 current / reset armor | same |
| +0x14 | f32 shield, a damage eligibility threshold | `FUN_002740e0`, D121195–121208 |

Initialization resolves the target reference, falls back to a created/root node if unresolved, and installs an interface at node +0x94 only when the slot is empty (`FUN_002740e0`, D121148–121216). Runtime interface layout is animation +4, target node +8, root +0xc, shield +0x10, armor/current-max +0x14/+0x18, health/current-max +0x1c/+0x20. reCOM `zAnim/zanim.h:625–638` corroborates the member names. Activation kind 3 creates this interface (`FUN_002713f0`, D119314–119335).

**C4 planting eligibility is not the damage trigger.** `FUN_002739b0` (R `FUN_002739b0_0x2739b0.cpp`, checked against local ELF words at 0x2739b0–0x2739f0) accepts C4 only if current health > 0 and shield <= the charge's `Explosion_Damage`. The ordinary action interface answers false. The existing web heuristic based on untyped `actions.rdr` entries is therefore incomplete.

General hit handling is `FUN_003c7490`, D318596–318640: compare shield with the projectile's impact or explosion rating plus weapon modifier; if it qualifies, calculate distance/occlusion damage, armor loss, then health loss. `FUN_00273a50`, D120978–121059, runs damage/death sequences as appropriate. Its post-hit health <= 0 check has no general requirement that old health was positive. Thus a zero-health placed glass/plank record can be a hit trigger even though it cannot offer C4 planting.

There is an authority guard: animation flag bit 3 combined with projectile +4 bit 2 absent suppresses the death transition and can preserve 0.01 HP. Projectile bit 2 is derived from `!controller virtual +0x34` in both normal fire and placed explosives (D479365–479374; D474038–474046) and gates online fuse/state transmission elsewhere. This is a network/ownership concern, **not an explosive-only flag**. The precise host/remote replay contract remains a runtime gate.

`EXECUTE_ACTION` is command 87, 8 bytes, animation-name-table index at +4. Its tick at 0x2b41c0 resolves the name, finds the action by valve (`FUN_002b4e80`) and invokes `FUN_002b44e0`. This proves the common chain:

`projectile damage -> health animation -> EXECUTE_ACTION(set_accessN) -> actions.rdr -> destroy_accessN(context valve/node) -> persistent geometry state`

Reset is both health and geometry: `FUN_00273960` restores record health/armor; `FUN_00273ee0` (D121071–121085) restores live interfaces. Node-ref bit 31 deactivates before bit 28 saves active state (`FUN_0026b5e0`, D115740–115750); bits 26/27/29 save position/rotation/parent. `FUN_0026b430` restores these, and round reset `FUN_002ac0e0` invokes saved-node restoration plus `FUN_002b5510` to reset action valves, running animation and use/points bookkeeping (D151976–151991; D157445–157456). Do not reset health while leaving rubble or disabled actions behind.

### Weapon thresholds

Measured `RUN/ZWEAPON.ZAR/zweapon.rdr` values:

| Ammo | Explosion rating | Radius, metres | Consequence before distance/occlusion |
|---|---:|---:|---|
| M67 Ammo | 10 | 15 | fails shield-17 barriers; can qualify against shield-9 AA gun |
| C4 Ammo | 18 | 5 | qualifies for shield-17 barriers; fails shield-21 objectives |
| RPG Ammo | 20 | 15 | qualifies for shield-17 barriers; fails shield-21 objectives |
| MPBOMB Ammo | 50 | 30 | qualifies for shield-21 objective destruction |
| explosive_stuff | 8 | 15 | Sujo/Enowapi strike damage; fails shield-17 barriers |

RPG impact rating is also 20. A normal M4A1 impact rating plus modifier is 2.3 + 0.3, below shield 17. C4 is a six-second timed charge, distinct from the shared objective bomb and from the claymore detonator. These comparisons establish eligibility, not guaranteed damage at every distance. The Breach access barriers must not be hardcoded to accept only C4.

All three mission readers set `Enable_c4 = 16`. This means **the SEAL's default C4 slot is locked**, not C4 absent or selectable by both teams. [94, A3](94-the-arsenal.md) traces the default kits and lock/select masks: all four SEAL types carry C4, bit 16 prevents replacing it, and neither team's selection bit is set. The probe emits this valve alongside the relevant weapon availability valves. Weapon-threshold compatibility and a player's authored loadout availability are separate checks; a qualifying RPG damage record does not prove every map lets that player select an RPG.

## 4. MP61 — Sujo

### Primary objective and six breaches

The objective is the placed `worldmodel/terrorist_base/terr_mpbase=terr_mpbase`, not a second neutral bomb. `destroy_terrorist_base` binds `healthy/basedi`, 11 polygons, health 2/shield 21. Its healthy subtree has 17 polygons and persistent `whats_left` 11. The matching SEAL-base animation is unbound. The plant origin is in the shared-objective table above.

Six untyped actions `access_action1..6` map `set_access1..6` to `destroy_access1..6`, each with points 2 and default action range 32. Each has a placed health animation `accessN`, HP 1/armor 0/shield 17, target `di_good`, command 87 at Seq_Data +28. Their root nodes are `worldmodel/accessN`; the realised prototype is `accessN=accessN` below that root.

| Barrier | Root world origin | `di_good` polys | whole `good_parts` polys | persistent `whats_left` polys |
|---|---|---:|---:|---:|
| access1 | `(674.042,40.7,1032.576)` | 3 | 3 | 0 |
| access2 | `(345.1,32,1085.4)` | 38 | 40 | 22 |
| access3 | `(449.6,20.5,1386.6)` | 24 | 26 | 6 |
| access4 | `(990.133,0,1519)` | 3 | 3 | 0 |
| access5 | `(625.1,-0.7,1427.9)` | 42 | 44 | 30 |
| access6 | `(881.7,21.6,1480.2)` | 20 | 22 | 6 |

Origins in this table are orientation aids rounded from authored transforms, not interaction points; access5's nested prototype has a further vertical offset. The probe prints exact target paths and measured segment coordinates.

`destroy_accessN/access_destroy` disables `good_parts` and `di_good`, enables `whats_left`, then conditionally creates debris under `skip_effects == 0`. The persistent changes occur before that effect guard. `bad_parts` has no collision polygons in all six cases. Typical ref words are `good_parts 0x10080400`, `di_good 0x10080500`, `whats_left 0x90080600`, `bad_parts 0x90080800`: intact geometry saved active, destroyed geometry initially inactive and saved inactive. Debris references save transforms/parent for reset. Unplaced `plankaccess1..3` are templates, not three more playable barriers.

### Whiskey and Foxtrot airstrikes

Both `radio_call_1/2` are under `worldmodel/radio_strike/radio_portable=radio_portable/radio_call` at `(611.528,113.568,452.058)`. They are SWITCH actions, range 30, team **0 (SEAL)**, with `action_helo.tif` and distinct `AIRSTRIKE ON WHISKEY` / `AIRSTRIKE ON FOXTROT` descriptors. Their valves are `airstrike_v1/v2`; animations are `airstrike_anim_1/2`. Each disables its own action node and sets its context valve once. No SoftImage flight path is present in Sujo, despite the helper names `f18_airstrike_1/2`; do not invent an aircraft flight solely from those names.

| Airstrike | Authored event chain, offsets within named Seq_Data | Persistent map consequence |
|---|---|---|
| Whiskey | `destroy_strike_1`: WAIT 18 at +28; impact at +40; command 87 at +60; `destroy_access2` call +68. Parallel roof sequence WAIT 20 at +116, explosion helper +128, impact +148, completion after another 2 s. | Opens access2 through its normal state machinery. The direct action and animation call are both authored; web replay must be idempotent. |
| Foxtrot | `destroy_strike_2`: first impact at 18 s, ladder off +80; parallel coop impact at 18 s and `coop_blast` +168; gun-site blast at 20 s, completion at 22 s. | Removes `worldmodel/ladder_astrike2` (4 polygons). `coop_blast` disables `pigeon_coop_healthy` (54 polys), enables `pigeon_coop_destroyed` (79 polys), and starts three debris motions. |

`knockdown_everything` translates a context root then uses FIRE_WEAPON `exploding_fuel` at Seq_Data +48, node -7 (context). Airstrikes therefore require both damage effects and map geometry changes; a sound/particle-only implementation is incomplete. The named gun target needs damage attribution/capture; no explicit turret-destruction state is inferred solely from the sequence name.

### Traversal and implementation work

Measured: three AI submaps; 24 start and 24 twin/respawn records per side; five ladder surfaces. Three turret geometry candidates are at `(646.612,1.643,2210.346)`, `(594.960,1.643,2193.924)`, `(984.806,62.363,1734.289)`. Definition binding and mounted-weapon behavior are audited in [177](177-emplaced-weapons-audit.md). No DOOR action is listed. Weather includes mission rain animations; tactical work should preserve their indoor/range conditions rather than treating them as objective state.

**Proposed:** implement six independent barrier states with partial remnants, two team-gated strike actions, Whiskey's access2 linkage, Foxtrot's removable ladder and coop replacement, strike damage/attribution, and complete reset. Tests must cover RPG as well as C4, duplicate strike/destruction delivery, striking an already destroyed access2, crossing each opening, loss of the destroyed ladder, and a new round restoring all six barriers and both strike actions.

## 5. MP62 — Enowapi

### Objective and gates

The objective root is `worldmodel/terrorist_base/crates_weapons=crates_weapons`, healthy/basedi 55 collision polygons, HP 2/shield 21; its persistent `whats_left` has no collision. `destroy_seal_base` is unbound. Two active health barriers `access1/2` each have HP 1/shield 17 and 14 collision polygons. Their geometry lives below `worldmodel/access1/gate_move1/access_point=access_point` and the corresponding `access2/gate_move2`. Access3..6 and all three plank health records are unbound templates.

The gates can move **or** be destroyed:

| Action trigger | Valve / animation | Target and behavior |
|---|---|---|
| `epanel_di1` | `fusebox2` / `gate_openclose1` | `lever_1/gatehand`; moves `access1/gate_move1` |
| `epanel_di2` | `woodgate` / `gate_openclose2` | `lever_2/gatehand`; moves `access2/gate_move2` |
| `epanel_di3` | `woodgate2` / same animation | second physical lever `lever_3/gatehand`, controlling the **same gate2** |

All use type SWITCH, range 20, `action_pull_lever.tif`, descriptor `GATE SWITCH`. `gate_openclose1` updates its context valve, waits 0.24 s, rotates the lever over 0.5 s and calls gateopen/gateclose only while `set_access1 == 0`. `gate_openclose2` writes **both** woodgate valves together and moves both lever handles. Gateopen/gateclose use translation flags 9 and relative `(0,+35,0)` / `(0,-35,0)` over 3 s: the gate rises and lowers.

**Decoder correction:** gate1's motion commands are at Seq_Data +576/+736. The command's u16 +0xc points to a translation block at +0x38: flags word +0, start vector +4, target vector +0x10, rate vector +0x1c. The open target is `(0,35,0)`, rate `(0,11.6667,0)`. The generic effects decoder instead reads +0x38/+0x44 as vectors and falsely reports Z +35. The probe decodes the explicit block. Retail begin `FUN_0025fe70` (D109101–109115) takes the current node translation, and relative flag 0x1 handling (D109234–109244) adds the target delta; tick `FUN_0025f9b0` (D108966–108999) applies translation/rate. The gate needs moving collision, not the rotation-only door runtime.

The raw `action_reset` animation saves gate/lever transform references. Once C4/RPG destroys a gate, `set_accessN` prevents movement from resurrecting it, while a lever can still perform its handle/valve behavior. Both destroyed `whats_left` subtrees have zero collision. Reset must restore gate position, both gate2 levers, action valves, health and intact collision together.

### Wire cut and shootable laboratory lights

`epanel_light_di` is a SWITCH using valve `lightbox`, animation `lightbox_onoff`, range 30, descriptor `CUT WIRE`, `action_defuse.tif`, points 2. When its context valve is0, it calls `off_lablights`, sets the valve to 1 and disables the trigger node. The else branch does not turn lights back on. An `on_lablights` animation exists but is not evidence of a second usable restore action.

Four placed damage programs, `hit_drug_bulb01/04/05/06`, each have HP 0.1/shield 0. Each placed bulb root contains five collision polygons. On destruction the script disables light source, bulb variants, flare and `dilite`, calls `destroy_aklite`, and invalidates associated animation references. `off_lablights` names seven off-light helpers, but only helpers/placed roots 01,04,05,06 occur in this mission set. Avoid manufacturing three nonexistent lights from the call names.

### Delta and Echo airstrikes

Radio action origins are `(697.799,-7.836,1644.990)`, range 30, **SEAL team 0**, descriptors `AIRSTRIKE ON DELTA/ECHO`, separate `airstrike_v1/v2` valves. Unlike Sujo, both F-18 SoftImage paths are present: `data/mp62/zanim/f18_path1/2.anm`, object `f18_plane`, 34 records, frame-time field 1/15, 5,984-byte data each. Their authored segment timestamps cover **0–22.666668 seconds**, not 34 times the frame-time field. Script_Data starts at MZANIM offsets 27520/33536. Each record is16 bytes plus80 bytes per flagged channel; all 34 have translation+rotation flags 3. `FUN_0025f1b0` (D108613–108635) advances by these sizes, and `FUN_0025f3c0` (D108678–108718) compares elapsed time directly with record start/end f32 fields at +4/+8. The probe validates tiling and emits start/end times.

`setup_f18plane` zeros both airstrike valves and hides the plane. Each airstrike disables its own action, runs a plane path and impact schedule. Delta's `destroy_strike_1` waits 16 s, invokes `knockdown_everything`/`law_impact`, and gives completion2 s later. It contains **no direct destroy_access call**. Its `exploding_fuel` uses `explosive_stuff`, explosion rating 8/radius15 m, which fails the gate's shield 17; do not implement a gate opening from the misleading `hitgate` sequence name. Its authored `astrike1` position `(1329.552,278.581,1394.741)` is near the third turret placement. Echo hits at 18 s and 20 s; at Seq_Data +160 in `destroy_strike_2` it disables `worldmodel/wall_strike`, removing 3 collision polygons, then announces completion after 2 s. Original capture still needs to establish occupant damage, attribution and any mounted-weapon consequence.

### Traversal and implementation work

Measured: three AI submaps, 24 starts and 24 twin/respawn records per side, four ladder surfaces. Turret geometry candidates: MGL at `(2590.015,296.124,1392.342)` (`mp62MGLturret ` has a trailing space), MG at `(1650.528,291.303,1889.615)` and `(1307.152,292.142,1392.921)`. Definition binding and mounted-weapon behavior are audited in [177](177-emplaced-weapons-audit.md). No DOOR record: the two gates are SWITCH-driven translating geometry.

**Proposed:** moving collision groups for the two gates; one shared state for the two gate2 levers; damage and movement state arbitration; one-way wire cut; four independently breakable lights; two SEAL strikes with different impact timing and Echo wall removal. Tests must prove gate2 synchronization from both sides, no gate resurrection after destruction, transform/health reset, shoot-light versus cut-wire interactions, post-reset light restoration, and Delta blast attribution before claiming that it opens a specific gate.

### 5.1 MAP-07 as built: Death Trap's and Enowapi's lever gates (2026-10-22, PR #427)

Fuse's PR #427, finished by seat redotcom-eb. `packages/viewer/src/gates.ts` (`GateSet`, `readGates`) and the room's
use of it; Death Trap's two gates are research 175 §5.3's and share this section. Each claim at its level:

- **The slide** (reading). The room runs the lever's own program (the valve flip, the 0.24 s wait, `gateopen` or
  `gateclose` only while `set_accessN` is 0) and moves `gate_moveN`'s collision with the flags-9 position block
  decoded above. The command begins from the node's translation now (`FUN_0025fe70` D:L109101-109115), and flag 1 adds
  the target onto it (D:L109234-109244). Offsets are kept from the rest translation, with no clamp to the travel.
- **A pull while the lever's program runs is refused** (reading, pending review). That covers the lead-in and the
  3 s slide the program calls. Every action is refused while its animation runs (`FUN_002b44e0` D:L156787, the doors'
  and the world's rule), and the runner keeps a called sequence inside its run (research 89 §12). The room drops it
  as `busy`. Fuse's first cut reversed the leaf from its pose mid-slide, and the original has no such path.
- **The other lever on Enowapi's shared leaf** while one runs: `GATE_SHARED_LEAF_OVERLAP_PLACEHOLDER` (§5.1.1).
- **A lever scores nothing** (reading, pending review). Every gate lever's record carries `points` 0: MP11
  `epanel_di1/2`, MP62 `epanel_di1/2/3`, all SWITCH (`gatesDisc.test.ts`, the readers' `MapAction.points`; the
  loader's `+0x38`, `FUN_002b4f40` D:L157330). The original scores a use on the host: `FUN_002b44e0` calls
  `FUN_002bb5b0` once the animation starts (D:L156852), and that calls `FUN_00545530` (D:L160645) and sets the record's
  `+0x3f` bit 1 (D:L160646) only while the bit is clear and `+0x38` is non-zero (D:L160627-160629). The message's
  receivers test the same (`FUN_002bb310` D:L160549-160567; `FUN_002bb770` D:L160668 is reached only from it). A
  lever press takes that path and stops at its zero points: no score, and the bit is never set. The bit is read
  nowhere else (D:L160549, D:L160628), and `FUN_002b44e0`'s own refusal reads bit 3 and `+0x3e`, so the bit never
  stops a lever whether or not it is set. `FUN_002b5510` clears it at the round (D:L157455). The room's gate branch
  therefore keeps no scored set (as #337's crane, whose records score, does).
- **The room's line to the lever** (the review's A5, on LATER 139): a gate lever takes every switch's line,
  `c4Line`. The head's line to the point must be clear (PF.R18; `walled`), and the point must be the node's first hit
  from the head or from the camera's eye at the command (`orderOrigin`), that eye counted only where the command's
  look passed through the point (`cone.lookAt`; `missed`). No page-sent eye. A stand where the page's prompt shows
  can still be refused. Fuse reported MP11 gate1's stand, (1128, -100, 425), as one where the head's line and the
  room's camera eye both meet a wall. That claim rests on his report and on a synthetic unit test, not on MP11's hull:
  `roomGates.test.ts` "A5 4" builds the case on a synthetic jamb (`centerJamb()`) and shows it refused `walled` by
  the head's line, with `lookAt` holding, so no camera eye relaxes that test. On MP11's own hull
  (`enowapiStandDisc.test.ts`, dev disc), Fuse's stand gives no prompt under main's camera standing. `epanel_di1` is
  x 1125.6-1130.9, y -90.0 to -84.4 at z 420.27, facing +z, with `worldmodel/g342_1`'s wall 0.27 behind it. The
  standing third-person eye is so high and close that at every pitch the stance allows (down to -45) the ray passes
  over the panel's top edge to that wall. That holds at every stand within the lever's range of 15 on its face's side
  (searched at 0.25 steps). Crouched at (1128.3, -100, 431), with the eye 13.5 lower, pitch -35..-5 names the lever and
  the crouched head's line is not walled. The view from the head (the scope) names it from Fuse's own stand. Whether
  the original's standing camera reaches it is LATER 308's (the lead probe). *LATER 308 (2026-10-26):* with the probe started at this frame's target (`LEAD_PROBE_START_PLACEHOLDER`), -45 runs the probe and its ray goes under the panel's bottom edge to `worldmodel/g335` (y -140, z 411.7, past the panel's plane): still no lever standing; the original's start is the placeholder's open question. *LATER 484 (2026-10-26; reading off the disc's polygons and the page's own sample):* neither a seam nor an opening. At the panel the hull is: `worldmodel/g342_1`'s wall at z 420.00, x 1108.53-1280, y -100..-65, facing +z (toward the stand); its walkway floor at y -100, z 420..480, facing up, whose front edge meets the wall's bottom edge exactly; under the walkway the slab's undersides at y -105 (`g342_1` z 320..574.56, `g335`), facing down; and the lower room's floor `g335` at y -140 (z 359.56..574.56). The page's -45 sample (a throwaway diagnostic on the seat box): feet (1128, -100, 425), the use ray's eye (1128.34, -77.57, 419.47) -- 0.53 past the wall's plane, on the third-person target at z 419.35 (the lead ahead of the feet) -- and its far (1135.89, -1070.69, 296.37). So the ray starts past the wall, passes the slab's undersides from behind (the action pick keeps front faces only, `actionRayDetail`) and meets `g335`'s floor: the pin is the port's camera result, not a hull trap. Open: the page's aim at pitch -45 descends ~83 degrees (LATER 491); whether the original's target also lands past the wall here is LATER 308's placeholder's. Where the head's line is clear, the first-hit test from the room's eye can still part from the page's, because
  the room rebuilds the eye without the camera pass (no main-probe pull, no side shift): LATER 121's residue, not
  LATER 305's.
- **Read off the disc** (`viewer/test/gatesDisc.test.ts`, the readers over `RUN/MP11.ZDB` and `RUN/MP62.ZDB`). MP11:
  `gate_move1/2`, (-20, 0, 0) in the parent over 3 s, world travel (-0.04, 0, -20) and (0, 0, -20); `epanel_di1/2`,
  valves `gate1`/`gate2`, range 15. MP62: `gate_move1/2`, (0, 35, 0) over 3 s, world +35; `epanel_di1` (`fusebox2`),
  `epanel_di2` (`woodgate`) and `epanel_di3` (`woodgate2`) on gate 2, range 20. `gate_openclose2` opens on
  `woodgate == 0 OR woodgate2 == 0` (EXPRESSION operator 3) and writes both, so di2 opens and di3 then closes
  (`gatesDisc.test.ts`: +35, then 0). That rests on LATER 310, merged here ahead of its landing: the runner folds the
  operators as `FUN_0025e960` does (research 89 §18, 106 §3). Before it, the runner read the operator as a false
  operand, the OR never held, and every pull on gate 2 ran `gateclose`, -35 from wherever the leaf was, into the
  ground. Gate 1 (`gate_openclose1`, one context-valve test) and Death Trap's two never depended on it. No `lever_N`
  holds collision. The gate sounds:
  MP11 `~FENCE_GATE` at the slide's start and end, MP62 `.WOOD_DR_SLD_OP` / `.WOOD_DR_SLD_CL`, each lever
  `.SWITCH_SMALL`.
- **`look_di`** (the review's A10). Enowapi's `worldmodel/look_di` is a model of its own, a root child: 18 polygons of
  WOOD_THICK, cameratype 0, the side bit set, admitted by the eye's query and kept as an opaque hit. A wall of it stands
  about 0.2 behind `epanel_di3`'s face, so a steep ray passing under the panel's bottom edge meets it. That is a miss
  for the lever by the original's rules as transcribed, not a skip the port lacks. No special case.
- **`destroy_access1/2`** (A12) swap the good parts for the remains and fly the parts. They never name
  `gate_openclose` or `gate_move`, so a destruction mid-slide does not stop the slide; the remains ride the leaf, with
  no collision (above).
- **The round's reset** (reading, as the doors' `DOOR_ROUND_RESET_READING`). The leaf is shut and the lever valves are
  cleared: `FUN_002ac0e0` D:L151976-151991 calls `FUN_002b5510` D:L157445-157456, and `action_reset` saves the gate
  and lever transforms (above). `set_accessN` is the world's.
- **The page** follows the room's pose on the snapshot's door tail and does not run the program (it holds no
  `set_accessN`). Once a slide is showing it chases at the slide's speed: `GATE_WIRE_FOLLOW_ADAPTATION`, a network
  adaptation with no original, as the doors' catch-up. *P8 (2026-11-02):* a lever is a SWITCH, which the original runs
  on the pressing console (`FUN_00592d50`'s 0x2000 branch -> `FUN_002b44e0`; research 213 s4, "The press, predicted"),
  so the page predicts its own pull as a pose -- `GATE_PREDICT_ADAPTATION` (s5.1.1).
- **What is a gate** (reading, scope). A SWITCH program whose translation moves a node named `gate_move\d*`, the slide
  taken from the sequence named like `open`. **The census** (the review's A11 and its finding 1;
  `viewer/test/gateCensusDisc.test.ts`, dev disc, 2026-10-23) read every `RUN/*.ZDB`: the 34 archives, both the
  multiplayer and the campaign maps, in about 2 s. The name rule misses nothing on this disc; it is still a rule of
  the port, a reading, now pinned by the census. It found:
  - **Translating SWITCHes:** the only action records whose programs slide a node by a position block (flags 9) are
    MP11's `epanel_di1/2` and MP62's `epanel_di1/2/3`, on `gate_move1/2`. These are exactly the levers the name rule
    finds, and the rule finds gates on no other archive.
  - **No other path to a gate leaf:** no record but a SWITCH reaches a `gate_move*` program, and no program anywhere
    slides a gate leaf except the levers' own.
  - **Chain Reaction's crane is not a translating SWITCH.** Its `crane_onoff_N` only pause and resume; the hook's slide
    is `translate_hook_N`, called by the auto-start `swing_hook_N` and by no record (research 176 §9). The plan
    expected the crane in this list, and that was wrong.
  - **Other slides on the multiplayer maps:** MP6's bees and bugs, MP71's water and MP81's hooks. Every one is an
    auto-start's, reached from no record.
  - **Instant translates reached from a record:** only the airstrike radios' (MP61 and MP62 `radio_call_N`:
    `knockdown_everything` on its context root, and Sujo's `coop_part_fly`). These are MAP-09's, not gates.
- **Not presented** on the page: the lever handle's 0.5 s turn, `SWITCH_SMALL` and the gate's sounds (LATER 307).
- **The dev instruments** (browser adaptations, no original; they change nothing the game does). `Room.devKill`,
  behind the page's `__viewer.kill` (`?devmode` only), ends the local seat so the round's reset can be checked. No
  `ClientEvent` reaches it: `roomGates.test.ts` pins that the room's wire members (`text`, `binary`) and its other
  methods never call it, and that the page's `DEV.tools` hook is its one caller. The others are `__viewer.gates()`
  (`gatePage` `stats`), the room's `[gate]` close line and the page's action-pick log.
- **The use ray** at the levers (the action pick: the use volume before the opaque hit, each model's first front face,
  the drawn eye along its look axis) is filed at research 230 §3.4 and 84 §19, reading, pending review. The camera's
  lead probe is LATER 308: the steep-aim lever press at di3 and MP11's gate1 can alternate until LATER 308 lands.
- **The rendered run's stand at `epanel_di2`** (dev-disc test `viewer/test/enowapiStandDisc.test.ts`; the page's own
  `loadMap`, `buildPageWorld`, `WalkMode` and `lookAim`, off the browser). Fuse measured his stand
  (1491.2, 172.2, 1892.25) with his camera lead probe, which is now LATER 308. Under main's camera that stand gives no
  lever prompt: the rendered run at b7e29e69b (SwiftShader) showed none at pitch -30..+30, and the dev-disc test shows
  why. The hull settles the walker 0.89 east, at x 1492.09. The panel's one polygon (x 1490.2, facing +x) is met
  edge-on from the south, and the spec faced it from the nominal stand (yaw 176.77), so the ray passes east of the
  panel's plane. Its first face is `worldmodel/g4440`, the wall at z 1917.76 behind the panel, at every pitch up to +24,
  with no face above that. From the feet the walker reaches, (1492.1, 172.4, 1892.25), facing the panel from them
  (yaw 173.87), pitch -15..-30 names `epanel_di2`'s SWITCH within its range of 20, and the head's line to the struck
  point is not walled. The spec now stands there at pitch -21, the stand taken from that test, which also pins it to
  the spec's constants. That is a unit test on the dev disc. The rendered run at the new stand ran at c3d5a969f on
  2026-10-23, in the merge controller's slot (SwiftShader): `enowapiGate.spec.ts` 1 passed (24.8 s). One press raised
  `gate_move2` by 35 over the slide, and it never sank.

#### 5.1.1 Placeholders and readings (MAP-07)

| name | what it stands for | settled by |
|---|---|---|
| `GATE_PREDICT_ADAPTATION` (`viewer/src/gates.ts` `GateSet.predict` / `applyWire`, `gatePage.ts` `press`; P8, 2026-11-02; a network adaptation beside `GATE_WIRE_FOLLOW_ADAPTATION`, reading, pending review) | No original value: the original's presser runs the lever's program at the pull (research 213 s4). The page runs no program; from a leaf at rest at an end it chases the other end at the slide's own speed once the lever's lead-in has passed, that lead-in read off the lever's own program by a dry run from the round's start (the open's, then the close's: `gate_openclose`'s 0.24 s wait). The room's word settles it: its slide toward that end is this pull's (never pulled back to the room's later pose); its rest at that end ends it; a slide the other way is another's, followed; at rest on the old end once the room's own tick (the snapshot's, `NetClient.heardTick`) is more than the lead-in in ticks past the tick of the first snapshot whose ack passed the press's command, or with no own body, a refusal -- the leaf put back at once and silently. On the room's ticks, not its acks (the P8 review's F1): after a stall the room runs up to `CREDIT_MAX` (60) of a seat's commands in one tick, so an ack-counted rule called a pull refused while the lever had run one tick. The lead-in is pinned on the dev disc (`gatePredictDisc.test.ts`: every MP11 and MP62 lever 0.24 s to the frame, open and close; the predicted pose within a frame's travel of the room's run of the same pull). Costs: a pull the room takes on a destroyed gate (`set_accessN` set, no slide) is shown sliding until that word; a leaf mid-slide is not predicted; and (the P8 review's F3) the predicted leaf moves its polygons in the page's own walk hull ahead of the room's, so on a refusal the hull snaps shut where the leaf stood, onto a body that walked into the opening meanwhile -- DOOR-PIN's mechanism (research 92 s7) -- for as long as the misprediction lasted | no original to settle; retired if the page gets `set_accessN` and runs the program |
| `GATE_SHARED_LEAF_OVERLAP_PLACEHOLDER` | Enowapi's `epanel_di2` and `epanel_di3` drive one leaf, each its own action and animation, so the original's busy test does not stop the second while the first's slide runs; `gate_openclose2` writes both valves, so the second would run `gateclose`, -35 from wherever the leaf is. What a second translation does to a node already carrying one (replace, add, queue) is unread. The port keeps one run per leaf and refuses the other lever while it runs (`true`) | `FUN_0025fe70` / `FUN_0025f9b0` read for a node with a motion already on it, or a capture of MP62 with di2 and di3 pulled about a second apart |

## 6. MP73 — Sandstorm

### Objective and communication building

The plant action is at the communication center `(926.25,105,1166.25)`. The generic `terrorist_base` health animation exists and its root is placed, but its `basedi/healthy/whats_left/parts` references do not resolve to the usual tent/crate model. The retail interface builder's fallback to root matters here; do not instantiate imaginary generic base geometry.

The substantial authored destruction is `destroy_comm_wall`, root `worldmodel/wall_breaker`, target `good/basedi_fake`, HP 0.1/shield 21. Its `good` subtree has 124 collision polygons, `bad`53, `stay`12; `bad` is initially hidden by Node_Ref word `0x90081600`. `change_comm_wall` swaps good off / bad on / stay on, while `destroy_comm_wall` starts fire, window/radar and eight building-part effects. `radio_disappear` hides the radio. The target-based explosion's exact delivery to `basedi_fake`, geometry transition timing and persistent burning damage need runtime verification, but the alternate building meshes and collision are already present.

### Three breach barriers and a different plank

| Program / action | Target path below worldmodel | HP / shield | Intact / persistent remaining polygons |
|---|---|---:|---:|
| `access1` / `access_action1` | `access1/gate=gate/good_parts/di_good` | 1 /17 | 15 /15 |
| `access2` / `access_action2` | `access2/access_point=access_point/good_parts/di_good` | 1 /17 | 2 /0 |
| `access3` / `access_action3` | `access3/access_point3=access_point3/good_parts/di_good` | 1 /17 | 5 /0 |
| `plankaccess1` / `plank_action1` | `plankaccess1/good_parts/di_good` | **0 /0** | 4 /0 |

Access actions use `set_accessN -> destroy_accessN`, points 2, `action_place_c4.tif`. They accept C4 placement and sufficient RPG damage. The plank uses `set_plank1 -> destroy_plank1`, no points or bitmap, and starts with zero HP. It does **not** pass the C4 planting predicate, while locally delivered damage can invoke its death action. This is a concrete failure of the current page's “every untyped action is a C4 target” assumption. Access4..6 and plank2/3 have no placed roots.

### Radio, transformer and collapsing tower

`kill_radio` targets `worldmodel/radio_control=radio_control/radio_good` (10 polygons), HP 1/shield 0, and executes `set_radio`. `radio_action` maps that valve to `radio_dead`. The latter sets `set_radio=1`, disables radio_call_1, radio_call_2 and radio_on, and stops the tower/radio blinking animation. It disables the strike controls without needing the main objective bomb.

`kill_rtower` instead targets `worldmodel/transformer/transformerdi` (5 polygons), HP 1/shield 17, and executes `set_rtower`. `rtower_action` has the place-C4 bitmap and points 2. `destroy_rtower` turns off healthy_box/transformerdi, enables `broken` (9 polygons) and debris, invokes `radio_dead`, and calls `tower_fall`. Tower_fall removes `twr/invdi` (3 polygons), tower visuals and lights; enables articulated towerparts t1..t4; then runs staggered motions and opacity fades. All tower-part subtrees have zero collision in the parsed map. This does **not** establish that a falling tower creates a new persistent street blockade; it establishes tower collision removal, transformer rubble and radio denial.

### Terrorist helicopter attacks

Radio actions `radio_call_1/2` at `(942.603,116.926,1175.790)` are SWITCH, range 30, **team 8 (Terrorist)**, descriptors `AIRSTRIKE AT CLIFFS/DUNES`, valves `airstrike1/2`, animations `airstrike_1/2`. Their team is opposite Sujo/Enowapi.

The actions set shared `setairstrike` to 1 or 2, disable the common `radio_call` parent, announce inbound, wait 3 s and call `airstrike`; after another 7 s they clear setairstrike and reenable that parent, then wait 20 s before completion speech. The generic action machinery also rejects a still-running action animation. The exact ability to alternate the two action entries during these overlapping timings, and whether a radio/tower destroyed during an active strike can ever reenable a child control, require capture. Preserve separate permanent child-disable state and temporary parent-busy state.

`airstrike` increments `strikecliffs` or `strikedunes`, selects one of three attack timing sequences, and resets that route counter after the third. Both routes have three patterns rather than one fixed volley. The helicopter has two SoftImage tracks (`chop_path1/2.anm`, object chopper1, 102 records, frame-time field 1/40, 16,192 bytes each). Their authored segment timestamps cover **0–25.5 seconds**; Script_Data starts at MZANIM offsets 32320/48544. Records include flags 0 time intervals and flags 3 translation/rotation intervals; they are not 102 uniform transforms with duration 102/40. Its fire loop issues RPG from firepoint_left at Seq_Data +2048 and firepoint_right at +2124, separated by 0.3/0.6 s waits. Authored attack windows begin at 5,5.5 or 6 s after the helicopter call, depending on the route counter, and repeatedly start/stop this loop. The program animates rotors and engine/chopper sound, then hides the helicopter at path end. These are projectile attacks and repeated stateful calls, unlike Sujo's static strike placements.

### Other destructibles, doors and traversal

`destroy_aagun`, root `aagun/aagun_zpu4=aagun_zpu4`, HP 1/shield 9, binds 28-poly di_good. Intact good_parts has 46 polys; destroyed whats_left/di_left 28. Death removes the intact collision, enables wreck collision, rotates the wreck and flies nine debris pieces. M67's rating 10 can qualify here. Do not label the AA gun a usable turret merely from its mesh names; usable mounted weapon placements are separate.

One placed `wglass` program at `worldmodel/comm_hi/window02=window02/wglass` has HP 1/shield 0 and 2 collision polygons. It requires delivered-hit destruction and reset. Seven DOOR actions `door_ft1..7` each use `singleDoor_left` plus `kick_door`, range 30; their rotation state is saved by `action_reset`. The existing web door subsystem provides a useful base, but the exact seven placements, kick choice and mutable-map reset must be exercised.

Measured navigation: four AI submaps; 24 initial starts per side; raw twin/respawn records are **25 side 0 /23 side 1**, so do not assume symmetric twin counts. Four ladder surfaces. Usable-turret placement candidates are an MGL at `(870.179,143.561,1490.162)`, MG/ledge at `(585.595,90.451,1680.024)`, and MG at `(1152.504,143.442,1020.327)`; sandbag_turret and AA wreck `turret` nodes are additional geometry names, not additional mount actions.

**Proposed:** separate barrier/plank/radio/tower/AA/window state, three strike patterns for each of two routes, projectile authority and score attribution, permanent versus temporary radio-disable reasons, communication-building alternate geometry and damage-driven trigger binding. Tests need radio shot, tower demolition, each while a strike is in progress, both directions of concurrent action calls, all six route/pattern combinations, third-call wraparound, plank hit with C4 prompt absent, AA grenade damage, seven doors, and fresh-round restoration of every component.

## 7. Measured collision feasibility

The probe applies resolved initial-off Node_Ref flags, then toggles only one barrier's persistent good_parts/di_good/whats_left state. It excludes flying debris. For each eligible wall polygon it tests a 30-unit segment normal to the polygon through its vertex-average center and reports the first blocked-to-clear candidate. This explicitly measures a local opening in the full parsed map, not an unobstructed character route or an alternate-route graph.

| Map / barrier | Candidate wall normals | Blocked-to-clear candidates | Selected hits before -> after |
|---|---:|---:|---:|
| MP61 access1 | 2 | 2 | 2 -> 0 |
| MP61 access2 | 38 | 14 | 2 -> 0 |
| MP61 access3 | 24 | 18 | 6 -> 0 |
| MP61 access4 | 2 | 2 | 2 -> 0 |
| MP61 access5 | 42 | 12 | 4 -> 0 |
| MP61 access6 | 20 | 14 | 6 -> 0 |
| MP62 access1 | 12 | 10 | 2 -> 0 |
| MP62 access2 | 12 | 10 | 2 -> 0 |
| MP73 access1 | 15 | 15 | 2 -> 0 |
| MP73 access2 | 2 | 2 | 2 -> 0 |
| MP73 access3 | 5 | 3 | 2 -> 0 |
| MP73 plank1 | 2 | 2 | 1 -> 0 |

Examples: MP61 access1 `(674.042,55.665,1018.576)` -> `(674.042,55.665,1048.576)`; MP62 access1 `(2161.646,234.141,1439.405)` -> `(2191.646,234.141,1439.405)`; MP73 access1 `(1270.577,86.984,994.434)` -> `(1300.577,86.984,994.434)`. The probe emits the full selected hit paths and coordinates. Some other candidates remain blocked by authored remnants or neighboring geometry, which is why merely deleting a whole barrier subtree would be incorrect.

All geometry above is from the map GEO archive; external asset-library turret rendering is a separate loading concern. The three embedded CZANIM archives were independently checked: 288 common animations each, **zero Anim_Health records**. The mission health inventory therefore covers the health blocks in these loaded common/mission animation sets; contextual effects and external scripts can still need specific runtime binding checks.

## 8. Current web gaps and implementation sequence

**Read in current source:**

1. `packages/viewer/src/mapActions.ts:11–18,54` retains node/type/range/bitmap/origin but drops action valve, animation list, team, elevation, descriptor and points. `actionInReach` at 65 measures 3D distance to origin; retail `FUN_005aa240` (D463856–463901) selects the hit node/ancestor and checks horizontal hit distance plus optional elevation. Preserve both target identity and authored reach.
2. `packages/viewer/src/equipment.ts:124–138` makes every untyped action a C4 target. Replace it with bound health-interface eligibility, including positive health and shield comparison. A separate breakable object can exist without any C4 prompt.
3. `packages/scene/src/zanim.ts` only retains the 24-byte health block's length. It needs the decoded health fields and live-interface binding, while the action interpreter needs EXECUTE_ACTION 87, context valves, damage callback and authority handling.
4. `packages/viewer/src/loadMap.ts:1006` hides alternate visuals using names (`whats_left`, parts, etc.), not the authored Node_Ref initialization/reset contract. It misses such states as Sujo's pigeon_coop_destroyed and Sandstorm good/bad/di_left. Node/ancestor activation must drive visuals, collision, hit selection, ladders and interaction offers together.
5. The door reader at `packages/viewer/src/doors.ts:90` selects only DOOR actions. It will not create Enowapi's SWITCH gates, linked levers or translation-based collision. Existing door networking is a useful model, not a complete environmental state implementation.
6. `packages/viewer/src/effects.ts` has a local effects-valve map and visual-object active/fromTo hooks. It is not a round-authoritative map action interpreter; FIRE_WEAPON, conditional WHILE, SoftImage motion, context-rich CALL_ANIMATION, invalidation and dynamic collision need explicit support or targeted equivalents. `FOR_CHILDREN`/world-reparent debris also require correct bindings.
7. The room runs BREACH's shared bomb since LATER 149 (2026-10-19: `BombAuthority` on game type 1, `terrorist_tent` alone, the SEALs' pickup, BREACH's 23 s detonation hold, the +4 detonation). A forge layout (FG-51, PR #351, 2026-10-22; reading, pending review) names BREACH only where that room would build the bomb: `forge/objectives.ts` `forgeTypeUnplayable` asks `BombAuthority.of`'s own test (StartBomb and `plantSite('seal')`), else the base's own type plays (`central/test/forgeBomb.test.ts` holds the two agreeing); a blank floor keeps its library's MPBOMB records and StartBomb, so that test passes over an empty floor on a bomb library (LATER 281). The room still has no authoritative persistent environmental state. Turret models/weapons/UI assets are present, but no complete mounted-weapon action system was found in viewer source. Do not mark a visible turret functional. [177: emplaced weapons](177-emplaced-weapons-audit.md) owns the full definition-to-placement/authority audit; the placement lists here are geometry observations.

**Proposed order:**

1. Add metadata parsing and validation first: full actions, health, initial/saved references, sequence offsets and stable placed-instance identity. Mark unbound templates and root fallbacks explicitly. Keep source archives local.
2. Build one room-owned environmental state registry with a per-round generation and semantic events. Validate actor/team/alive/phase/reach/health and action-busy conditions on the server. Snapshot persistent state and moving-gate phase for late join; avoid replaying old explosions as if new. Include health and score-once bookkeeping.
3. Apply visual/collision/interaction/ladder changes atomically for each event. Static grid broadphase can retain all alternate polygons, but every collision path—including cached walker walls—must honor effective ancestor activity. Moving gates need transformed collision and swept movement, not just active-bit toggles.
4. ~~Add Breach mode to the shared bomb implementation, then wire each map's one plant action~~ (done 2026-10-19, LATER 149) and specific destruction presentation. Keep ordinary C4 inventory, objective bomb ownership and environmental action valves independent.
5. Implement Sujo's six barriers and strike-linked ladder/coop; Enowapi's linked gates and lights; Sandstorm's radio/tower/plank/AA/window/building and recurring helicopter attacks. Reuse behavior only where measured records support the same contract.
6. Validate original-runtime captures for unresolved timing/authority/path issues, then run capsule route tests, two-client interaction races, late join, disconnect/drop, round reset and map reload. Test damage thresholds around each boundary and verify that effects quality/skip_effects never removes gameplay collision transitions.

## 9. Exact follow-up gates

- **Bomb:** capture initial ground-bomb floor placement, real hold/defuse timings, planted-bomb elimination, timeout and simultaneous result ordering. Do not resolve stock unreachable script branches by guesswork.
- **Damage authority:** confirm remote projectiles do not independently duplicate death/action/points; document host/owner event replay and missing health-reference fallback. Sandstorm's zero-HP plank is a useful delivered-hit test.
- **Enowapi gate transforms:** implement the decoded relative Y +35 translation and saved gate_move1/2 transforms; bind two gate2 levers to one busy/movement state. Capture C4 during movement.
- **Enowapi Delta:** establish occupant damage, attribution and any mounted-weapon consequence. Its rating 8 does not qualify against shield 17 gates; Echo wall removal is explicit.
- **Lighting reset:** distinguish permanent shot-out bulb state from wire-cut state and prove both restore on a new round, including invalidated helper animations.
- **Airstrike paths:** command 26 record tiling and 22.667/25.5-second track spans are decoded; complete spline/quaternion evaluation and coordinate/binding parity remain. Sujo has no paths; Enowapi and Sandstorm do. Sandstorm also requires precise launcher aim/binding and route-pattern rollover.
- **Radio races:** prove behavior when radio or transformer is destroyed during temporary strike lockout, and when both named strike actions overlap. Do not allow a temporary-parent reenable to revive permanently disabled children.
- **Objective geometry:** verify Sandstorm's bomb blast reaches basedi_fake and the communication-wall callback, including fire damage and radio hide; do not fake the generic base references that are absent.
- **Traversal:** segment evidence is now reproducible for 12 barriers/plank, but capsule radius/height, grenade LOS, moving-gate crush/push behavior, removable ladders and navigable alternate routes still require full movement tests.

Health-key offsets within each MZANIM member are emitted by the probe. Useful fixed anchors: MP61 access1=24672, access6=25712, terrorist base=30992; MP62 access1=39568, access2=39776, terrorist base=43904, four bulb records=78928/79248/79568/79888; MP73 radio=83312, communication wall=87808, AA gun=94896, transformer=95824, glass=99152, access1/2/3=99344/99552/99760, plank1=100592. These are metadata offsets, not game assets.
