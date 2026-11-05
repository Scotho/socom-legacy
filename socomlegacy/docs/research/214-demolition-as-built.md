# 214 -- Demolition as built: the bomb's authority, the round's result and the scoring (web sprint 27: XR-05, XR-06, PF-14)

- Date: 2026-10-05 (web sprint 27, "Crossroads"). XR-05 wrote sections 1, 2 and 6: the bomb's state machine and its
  wire, the holds, and the readings. Sections 3 and 4 are XR-06's (the cues, the input context and its cancel rule),
  section 5 PF-14's (the scoring). Amended 2026-10-07 (the owner's playtest of 2026-10-06, "the bomb ... underneath
  the floor"): the world bomb's model read (s1 StartBomb, s3 the drawing, s6 `BOMB_MODEL_READING`). Amended
  2026-10-09 (PB-8, issue #120; the owner's playtest and ruling PB2.R2): the hold bar read and drawn for the plant and
  the defuse (s3 "The hold bar", s6 `HOLD_BAR_DIRECTION_READING`, `HOLD_BAR_PLACEMENT_READING`), retiring
  `HOLD_PROGRESS_PLACEHOLDER`.
- Status: **reading, pending review.** Every value is a read of the decompilation (`D:L<n>` of
  `socom2_game.elf.decomp.c`) or of the disc (the MP72 fixture); nothing here is a capture of the original. Under
  AGENTS.md a source read is a reading until reviewed (research 206).
- Sources: research [171](171-crossroads-demolition-and-bridges.md) s6-s7 and s10 (the bomb, the script's resolver,
  the gates), [173](173-demolition-map-audit.md) s2-s3 (the sites, StartBomb's cell, the shared runtime),
  [192](192-m1-mp-modes-rules.md) s2.1 (the pre-plant rules), [193](193-m2-mp-net-replication.md) s2.2, s4.3 and s5
  (the BombObject, first request wins), [213](213-crossroads-as-built.md) s2.4 (the `objectives` table) and s3 (the
  capture script that settles the readings), [210](210-modes-panes-barriers-and-the-c4-gates.md) s1-s2 (PF-12's
  `modeRules`, `plantedStopsClock`); the S27 dispatch's s4 and rulings PF.R27, PF.R28, PF.R30, PF.R32, PF.R33.
- Code: `packages/viewer/src/net/objective.ts` (the shared rules: `BOMB_STATE`, `BombWire`, `pickupReach`,
  `defuseReach`, `plantSite`, `atPlantSite`, `holdKind`, `canDrop`, `bombOutcome`, `resultHoldS`, the constants);
  `packages/match/src/bomb.ts` (`BombAuthority`); `packages/match/src/room.ts` (`run`'s hold accounting, `step`,
  `kill`, `leave`, `takeOver`, `startRound`, `clock`'s play branch, `hello`'s `objective`, `text`'s `bombAction`);
  `packages/viewer/src/simMap.ts` (`bombStartOf`, `SimMap.bombStart`), `loadMap.ts` (`LoadedMap.bombStart`),
  `net/loopback.ts` (`LoadedForMatch.bombStart`), `net/protocol.ts` (the three additive members);
  `packages/viewer/src/bombPage.ts` (`BombPage`, the follower and, XR-06, its drawing half); XR-06's
  `packages/viewer/src/actionContext.ts`, `roundCues.ts` (`BombCues`), `roundAudio.ts` / `roundAudioHost.ts` (`bomb`),
  `hud.ts` (`extraMarks`, `setDefuseTimer`), `touch.ts`, `traversalPage.ts`, `walk.ts`, `gamepad.ts` (the cancels),
  `remotePlayers.ts` (`setGearVisible`, `teamOf`), `grenade.ts` (`worldBomb`), `soundData.ts`.
- Tests: `packages/viewer/test/actionContext.test.ts`, `touch.test.ts`, `hud.test.ts`, `roundCues.parity.test.ts` (XR-06),
  `packages/viewer/test/objective.test.ts`, `packages/central/test/roomBomb.test.ts`,
  `packages/viewer/test/bombPage.test.ts`, the `bombAction` shapes in `roomFuzz.test.ts` and `roomHostile.test.ts`; the
  registry [`../parity/registry/objective.json`](../parity/registry/objective.json).

## 1. The state machine and the wire

The original keeps one `CZBombState` (`FUN_002c26e0` D:L164244, 0x14 bytes) whose handler `FUN_002c1f10`
(D:L164008-164043) takes six states. The room keeps the same six in `BombAuthority` (`state`), one bomb a room, on a
map of game type 2 (DEMOLITION, `FUN_002a6c50` D:L149170's bomb setup branch) whose `actions.rdr` holds both MPBOMB
records and whose AI maps name StartBomb; any other map has none (`BombAuthority.of` null).

| state | meaning | entered by (the room) | source |
|---:|---|---|---|
| 0 | reset | never held: `reset` goes straight to 1 | D:L164008 |
| 1 | on the ground | `reset` at StartBomb; a drop (death, leave, a lost seat, the manual drop) at the ground under the carrier | `FUN_002c1a80` D:L163839; `FUN_0059dd30` D:L452153, D:L457560 |
| 2 | carried | the lowest-id living player within 20 u -- a 3D distance from the feet (`PICKUP_POINT_OFFSET_PLACEHOLDER`), no wall test; was horizontal only until OBF-17 (2026-10-30, Night Stalker's hut roof) -- the cooldown clear (`step`) | `FUN_00593da0` D:L452602 -> `FUN_005aa110` D:L463790-463827 (the search D:L463817, the bound D:L463821) |
| 3 | planted | the placement's end, 2.25 s after the plant's hold committed (`step`) | `FUN_005be9a0` D:L475479-475488; `FUN_005c1970` D:L476883-476886, D:L477003-477010 |
| 4 | defused | the other side's hold committing within 15 / 20 u (`command`) | `FUN_005920c0` D:L451507-451522; D:L452436-452454, D:L452589-452598 |
| 5 | detonated | the fuse: 30 s after state 3 (`step`) | `FUN_002c2260` D:L164131 |

**StartBomb** (`SimMap.bombStart`, `bombStartOf`): the AI maps' named point `StartBomb` (`startBomb`, `startbomb`:
`namedPoint` is case-blind), in the sub-map its loc names (MP83's is sub-map 1, `Cats`), at its cell's centre and the
cell word's quantised height (`aiCellY`, `FUN_00516940` D:L385086) -- research 173 s2's converter without its optional
`FUN_00516920` correction (`BOMB_GROUND_READING`). MP72: cell (95, 112) of `ground`, word 0x83c1fe41,
(1279.762, 47.334, 1446.111) -- the room test's fixture assertion. The server's parse, the page's `loadMap` and the
offline room (`LoadedForMatch.bombStart`, PF-40) all carry it. The ground bomb is made at that point with no probe of
the floor (`FUN_002c1c30` D:L163956-163964 with no carrier -> `FUN_0059dab0`), so on MP72 it stands 0.166 under the
floor's 47.500 there -- the cell's quantisation, the original's own; only a drop probes the floor (`FUN_0059ddb0`
D:L457596-457597, from the feet + 1). The model hung there is s3's (`BOMB_MODEL_READING`): the fittings' `Satchel`,
4.114 high on its origin, so it stands on the floor; C4's placed model, centred on its origin, showed only a sliver
over it (the owner's playtest, 2026-10-06: "underneath the floor").

**The plant sites** (`plantSite`): the SEALs plant at `terrorist_tent`, the Terrorists at `seal_tent` (`FUN_002ac410`
D:L152198-152201; `FUN_00594480` D:L452755-452759; research 173 s2 warns against a nearby model's `s_`/`t_` name). The
plant is taken on the reticle's pick of the tent's own polygons, the record's range 15 and elevation 15 from the struck
point (s2, "The plant's pick", PLANT-AIM 2026-11-02: `PLANT_REACH_READING` `'aim-pick'`). *Was*: the feet within 15 / 15
of the node's origin (`atPlantSite`, `actionAtPick` with the node's own point as the pick), the r0001 stand-in,
superseded; `atPlantSite` stays as a forge site's reach and the sweeps' ring about the node.

**The round's result** (PF.R27; research 171 s7, 213 s2.4). `switch_timer` (@3844), on `mp_bomb == 3`, stops `start` and
`mission_timer`: from the plant, neither an elimination nor the clock decides the round. The room's `clock()` play
branch reads the bomb before both tests: a result (state 4 or 5) counts the side's round win at once and holds the
round `decided` for the script's delay (`BOMB_RESULT_DELAY_READING`: `defuse` @1960 WAIT 3 then `success`/`failure`'s
20 + 1 = 24 s; `bomb_timer` @4596 WAIT 2 + WAIT 2 then 20 + 1 = 25 s), then `endRound(winner)`; while the bomb is
planted (`mode.plantedStopsClock`, PF-12's hook) it returns. State 4 is the defuser's side (`bomb_owner` overwritten
by the defuser's team), state 5 the planting side's (`bombOutcome`). Before the plant the round is PF-12's unchanged:
the elimination from 13 s, the time-out a draw. A plant restarts the round clock at the fuse, 0:30, every page told
(`roundTime`) -- the original's commit sets its clock to the fuse (`PLANTED_CLOCK_FUSE_READING`, LATER 148; *was* the note-only
`PLANTED_CLOCK_DISPLAY_READING`). A detonation leaves it at 0; a defuse stops it at the fuse's remainder (`FUN_002c1c30`
D:L163937 clears +0xf5): the room holds it there, every page told (`score.clockHeld`, `DEFUSE_CLOCK_HELD_READING`, LATER 152). No message line is posted by the room for the bomb's outcome:
the `bomb` event's state is the page's cue (XR-06).

**The tick's order** (`DEM_SAME_TICK_READING`, PF.R28): `Room.step` runs the commands (`run`: the holds, so a defuse
commits here), the corpses, the doors, the world and the grenades (a death drops the bomb), then `bomb.step()` (a lost
carrier, the placement's end, the pickups, the fuse), then the clock. So a defuse whose 300th command runs on the
fuse's tick defuses, and a placement ending on the clock's last tick plants before the time-out is tested; one tick
later the time-out's draw comes first and the bomb, the round no longer in play, is held as it lies.

**The wire** (PF.R33: additive JSON, protocol 10 kept). The original replicates `BombObject` (pos at a 5.0 threshold,
the carrier's or planter's actor at +0xc, the defuser at +0xe, the state at +0x10; research 193 s2.2, s4.3; packed by
`FUN_002c20c0` D:L164056-164099) and sends a request as message 21 to the host. The port sends
`{ type: 'bomb', ...BombWire }` on every transition and every hold's begin and end -- at most once a tick for the
holds (`step` compares the wire it last told: a hold begun, ended and begun again within one tick is told once; a drop
is told as it happens) -- and the welcome's optional `objective` for a joiner; text frames ride the socket in order with the snapshots.
`BombWire`: `state`; `pos` (on the ground, planted, defused, detonated; while carried, where it was picked up -- the
carrier's body, already in `BodyState`, draws it); `carrier`; `planter`; `plantingTeam` (kept apart from the carrier,
research 173 s3); `defuser`; `hold?` (`{ by, kind: 'plant' | 'defuse' | 'place', sinceTick }`: the placement while it
runs, else the oldest hold counted); `detonateTick` (the fuse's end as a room tick: the page counts the defuse timer
against `serverTick()`); `pickupAfterTick` (the cooldown's end); `dropWhy?` (`'manual' | 'death' | 'leave' | 'gone'`:
the last drop's cause -- the carrier's own `bombAction` drop, a death, a leave, a seat lost between ticks -- sent only
while the bomb lies on the ground, cleared at a pickup and at a round's reset; only `'manual'` plays the drop's clip on
the dropper's page, s3; additive, written by the online-parity sweep's P25, 2026-11-03). The client's one event is
`{ type: 'bombAction'; seq; action: 'drop' }`, the manual drop: the holds need none.

**Drops and seats.** A death (`kill`: `FUN_00547af0` D:L413112 -> `FUN_0059dd30` D:L457560) and a leave (`leave`:
`FUN_002bef60` D:L162527 keeps the position, the original recreates the bomb, `FUN_002c1bf0`) drop the bomb at the
ground under the body and cancel a placement under way (PF.R30). A session takeover (`takeOver`) hands the seat's bomb
to its new id (`rekey`); a classic round's takeover seats a ghost (research 91 s12), and a carrier that is no longer a
living seated player at a tick -- that ghost, a demotion, a replaced connection -- leaves the bomb where it stood at the
last tick. Every drop starts the 4 s cooldown (`PICKUP_COOLDOWN_S`), and so does a pickup (D:L452610): no pickup and no
manual drop before `pickupAfterTick`.

**The manual drop** (`bombAction`, action 6, mask 0x40, `FUN_005937c0` D:L452458-452473): from a living player, shaped
(a whole `seq`, `action` 'drop') or dropped 'shape'; the bomb carried and no placement under way; the cooldown clear;
on the last command run no stick and the aim's sine under -0.25 (`canDrop`, `DROP_AIM_READING`), else dropped
'drop aim'. A spectator's, an unseated id's or one on a map without the bomb is nothing.

**The detonation** hurts the players in MPBOMB's reach (BOMB-DAMAGE, 2026-10-16; research 332: `Room.bombBlast`, each
victim the owner of his own hit, `MPBOMB_BLAST_OWNER_READING`). *Was* (PF.R32, 2026-10-05): it hurt no player
(`MPBOMB_PLAYER_BLAST_PLACEHOLDER`). The bases are XR-08's: they listen on
`BombAuthority.on('detonated', e)`, which carries the bomb's point and the planting side. AD-5 (2026-10-16, research 209
§13): the base takes the read damage at its basedi's midpoint, 18.89 u from the planted bomb on MP72 -- the whole 50 x 14
over health 2, the health floored at 0 (*was* -48: 2 - 50, no x14, no floor); a base falls with the bomb out to 237 u
(0.79 of 300 u). PF-14's +2s listen on
`on('planted' | 'defused' | 'detonated')` (and `pickedUp`, `dropped`) with the actor's id and side; the bomb awards
nothing itself -- the room's listeners do (section 5, PF-14b).

## 2. The holds

The plant and the defuse are a 5 s hold of the Action button (`0x40a00000`; `FUN_00594cf0` D:L453249-453287 (*was* cited `FUN_00594600` D:L453260-453294): the counter
resets on a release; `FUN_005920c0` D:L451484 commits when it goes below zero). The room measures it on the commands it
runs (`Room.run` -> `BombAuthority.command`), never a duration a page sends, and it counts **the room's ticks, not the
commands**: a tick on which the player ran a command with `Button.ActionHeld` set while eligible adds one, however many
commands that tick runs; any command without it, or out of eligibility, sets it back to 0; the 300th tick commits
(`HOLD_TICKS` = 5 x 60). Counting commands would let a page bank its credit (`Room.run` runs up to `CREDIT_MAX` = 60
commands in one tick after a stall) and finish the hold in about 4 s of the room's time, moving PF.R28's races by up to
a second (the fix round's finding); the tick count keeps the hold on the server's elapsed time (S27 dispatch s1.2). A
tick on which the player ran no command neither counts nor resets the hold. The test: 300 held commands banked into
240 ticks leave the hold at 'plant'; the 300th tick with one held command commits it. **Superseded 2026-10-08 (ACT-7,
ruling ACT.R8 and the merge controller's ruling on its shape):** the hold advances one a room tick while the player's
held state is live, the original's 60 Hz frames on the room's clock. The latest command with `ActionHeld` while eligible
sets that state, and it stays live until `HOLD_LIVE_TICKS_PLACEHOLDER` (15) ticks pass with no command. Past that the hold
pauses, and it resumes without a reset. A release, a step out of reach or the death resets it as before. It commits on
the 300th live tick whatever the page's frame rate or command rate, and a flood commits on exactly the 300th tick
(research 250 s7). Eligibility is `holdKind`, one rule for the room and the page: 'plant' for
the carrier at its side's site with no placement running (`FUN_00594350` / `FUN_00594480` D:L452694+: alive, carrying
item 0x9a, the opposing site, the round in play); 'defuse' for a living player of the other side within 15 horizontal
and 20 vertical of the planted bomb (`DAT_00650688` / `DAT_00650690`; `DEFUSE_REACH_READING`). The planting side's hold
does nothing.

A plant's committed hold starts the placement: the kit's +0x87c = 2.25 s (`FUN_005be9a0` D:L475479-475488), counted
down by the kit's tick, which then probes the ground and asks for state 3 (`FUN_005c1970`); the separate 3 s cooldown
(+0x81c) is not another delay. The room counts `PLACEMENT_S` x 60 = 135 ticks from the hold's last command and plants
at the ground under the planter's right hand as the placement ends ("The plant's point", below; was the ground under the
feet as the hold committed, `BOMB_GROUND_READING`). A release inside the placement does not cancel it
(`PLANT_PLACEMENT_CANCEL_READING`, PF.R30); the planter's death or leave does, and drops the bomb. A defuse has no
placement: state 4 at the 300th command.

**The plant's point (B194, 2026-11-01; reading, pending review).** On Night Stalker (MP7) a bomb the SEALs planted at
`terrorist_tent` never took `destroy_terrorist_base`: `basedi`'s bounds midpoint (2466.40, 115.08, 1564.76;
`SCENE_BOUNDS_MIDPOINT_READING`) lies inside the sibling column `tent_terrorists/healthy/di_wood_post` (a 3.89 u square
centred on the node, no top face, WOOD_THICK, PENETRATION 0), so the reach gate refuses every line from outside it
(`FUN_003c80e0` D:L319117). The target, the `+0x94` skip and the materials were re-read and stand. What the room had
wrong is where the bomb lies:
- *The source.* When the kit's `+0x87c` runs out, items 0x98-0x9a and 0x9e -- MPBOMB is 0x9a -- take `FUN_005c1970`'s
  ground-placement branch (D:L476886-476889, D:L477001-477010). `FUN_005c2430` carries the right hand's node (`+0x300`,
  `rhand`, research 80) at (0, 0, 0) (`DAT_003f64c0`) through `FUN_002869d0` on the `+0x170` skeleton, the body's
  matrix (`+0x50`, `FUN_00306fd0`) and its position (`+0x1c`, `FUN_00309240`) (D:L477198-477200); casts the world's
  vertical column at the hand's x and z (`FUN_0031dea0`, D:L477211); and keeps the highest accepted surface at or under
  the hand, else the lowest (D:L477228-477249: the claymore's `placeGround`). The bomb is set on that point
  (`FUN_005bc730`, whose MPBOMB request carries it to state 3, D:L473982) only when it lies above the feet (`+0x404`)
  less `DAT_003dfe10` (10) (D:L477005); else nothing is set (D:L477020) and the bomb stays carried.
- *The hand* (`BOMB_PLANT_HAND_READING`, `match/src/bomb.ts`). The pose is `Place claymore`'s (`PLANT_ANIM`, pushed with
  the placement, D:L475480-475481), its pistol pair with the sidearm in the hand, at `PLACEMENT_S` on the one-shot
  clock (`viewer/src/throwPose.ts`: phase 2.25 / (2.7 x 54/55) = 0.8488, key 46.682). `rhand`'s origin there, body
  frame (x right, y up, z behind): rifle (2.603405, 6.207189, 1.431470), pistol (1.750641, 6.814781, 0.164585) -- the
  hand 2.97 u (rifle) or 1.76 u (pistol) from the feet, to the right and a little behind, on its way back up (the
  hand's lowest and furthest forward is near key 36, 1.9 s). Read off MOTION_P.ZAR's `seal_place_claymore` and
  `seal_p_place_claymore` (55 keys each, every one of the 26 parts, so no idle shows under them) through the port's
  sampler and `writePose`, on the shared rig: all eight MP2 and MP7 types give the same point
  (`central/test/bombPlantHand.test.ts`). Unread: the clip's root travel in x and z, which `writePose` drops (the root
  has moved about 1.2 u right by key 46.7), and the tick the timer runs out on against the clip's key (a 60 Hz tick is
  0.35 keys). The page's claymore takes its posed hand (`Play.partPoint`); the room has no posed body, so it takes this
  point at the planter's feet and facing.
- *Two readings* (parity clause 7). **A**, built: the ground under the right hand, from the source above. **B**, as
  before: the ground under the feet as the hold committed (`BOMB_GROUND_READING`'s search). The drop (`FUN_0059ddb0`)
  keeps B's search. H371 asks the original.
- *What A gives, every DEMOLITION map* (`central/test/bombPlantSweep.parity.test.ts`; the maps `missionlist.rdr` types
  DEMOLITION; each base asked from 120 ring spots about its node, 2 to 14.5 u, walked to straight in by the room's
  walker; the spots kept where the feet stop at the site; the reach gate's skip as `BLAST_SKIP_GROUP_READING` gives it --
  the MP7 terrorist row was 116 / 0 / 0 / 0 under 'target-subtree', every other row the same under both):

  | map | base | spots | B, the feet | A, the hand facing the node | A, some facing | midpoint inside a sibling solid |
  |---|---|---|---|---|---|---|
  | MP1 | terrorist | 110 | 110 | 110 | 110 | no |
  | MP1 | SEAL | 104 | 104 | 104 | 104 | no |
  | MP12 | terrorist | 87 | 87 | 87 | 87 | no |
  | MP12 | SEAL | 104 | 80 | 81 | 84 | no (the mast, 209 §14) |
  | MP7 | terrorist | 116 | 116 | 116 | 116 | `di_wood_post` (in basedi's group, `healthy`) |
  | MP7 | SEAL | 109 | 109 | 109 | 109 | no |
  | MP72 | terrorist | 101 | 101 | 101 | 101 | no |
  | MP72 | SEAL | 104 | 104 | 104 | 104 | no |
  | MP83 | terrorist | 94 | 94 | 91 | 94 | no |
  | MP83 | SEAL | 113 | 109 | 110 | 113 | no |
  | MP9 | terrorist | 88 | 88 | 88 | 88 | no |
  | MP9 | SEAL | 101 | 98 | 99 | 101 | no |

  *Spots lost to the hand* (the review's F2; the sweep's `lostFacing`, pinned): of the 1,231 spots kept (of 1,440 walked to), five whose
  plant under the feet destroyed the base on d907700d0's room (`'target-subtree'`) do not when the planter faces the
  node and the bomb lies under his hand -- MP83's terrorist base from the feet at (1384.9, 749.5), (1383.1, 749.7) and
  (1387.9, 750.3), and MP83's SEAL base from (1131.7, 2566.4) and (1136.5, 2567.0) (x, z). From each, some other facing
  still destroys it. A source-faithful consequence of the hand (the original plants by the hand), for H371 to confirm.
  The feet test (D:L477005) refused no plant at any swept spot or facing.

- *Night Stalker is not fixed by A alone.* The walker keeps `BODY_RADIUS` (3.5) off the post's faces -- its feet never come
  nearer than 5.44 u to the post's centre -- and the hand reaches 2.97 u, so from no reachable spot and no facing does
  the hand's column stand over the post (`central/test/roomBombNightStalker.parity.test.ts`); four of four points inside
  the footprint reach `basedi`, and none is reachable. The original's stand-off is no nearer (`WALL_PROBE_READING`:
  about its probes' reach, 9.43 moving). Under both readings the terrorist base on MP7 stands after every plant; the
  round is still the planters' (state 5, PF-14b). Open, for H371 to settle: whether the original's tent burns at all
  (if it does, one of the target's midpoint, the `+0x94` skip on `healthy`'s subtree or the post's place in the
  explosion's query is misread); the SEAL tent has no post and falls from every spot.
- *Under the segment body the premise fails (parity clause 7; SEGMENT-BODY, 2026-11-04; LATER 677; reading, pending
  review -- an investigator's unit probe on MP7 at `cbc65f7f3`, re-run on `agent/segment-body`).* The bullet above is
  the disc body's reading: its `BODY_RADIUS` held the feet 3.5 off every face, and the premise -- no reachable stand
  puts the hand over the post -- held. `di_wood_post` has 4 side faces, 1.94 from its centre to a face and 2.75 to a
  corner, turned so that its face normals lie at 22.4 / 112.4 / 202.4 / 292.4 degrees (the test's yaw convention, 0
  facing -z). Under the segment body (research 217 §2.9) a walker turned to face the post's centre from 12 u out and
  walked in at full stick meets a face 22.4 degrees off square and slides along it, and the fan's side line -- 1.05
  across at the feet (`FUN_0054aa30` D:L415171-415220: the travel's perpendicular x r x 0.3) -- passes 0.04-0.09 outside
  a corner: the feet come 4.77 off the centre from the 0 / 90 / 180 / 270 family of approaches (5.45 from the 30-degree
  family, 6.52 from the 60), and are never inside the footprint. From the slide-past spots (from 90 degrees the feet
  about (0.27 .. 2.44, -4.77) off the centre) `bombPlantHand`'s rifle hand lies over the post at yaws 265-315 (the
  pistol's never), and the next tick's spot, (-0.81, -4.77), at 305-335; each family the same turned by 90. A still body
  stopped there is stable (a still body's lines run along its facing, D:L415135-415161), so the stand is reachable.
  **The two readings**: the disc body's (the premise holds, nothing is reachable inside 5.44) and the segment body's (it
  fails: a SEAL who slides past the post and turns to 265-315 has his hand over it). **What settles it**: an r0004
  capture of a SEAL walking into a narrow rotated post -- this one, or any square column turned off the axes -- and
  planting beside it (the feet's closest approach and where the bomb lies), or a reading of whether the original's plant
  tests the hand against the post (as transcribed above, `FUN_005c2430` casts the column at the hand's x and z,
  D:L477211, and keeps a surface from it, D:L477228-477249; whether anything refuses a hand inside a solid is not
  read). H371's capture covers the
  same tent. **The branch's interim rule** (`central/test/roomBombNightStalker.parity.test.ts`): the feet are never
  inside the post and come no nearer its centre than 4.77 (the segment body's, reading, pending review; was the disc's
  5.4); the hand is checked at every tick's feet of the walk, not only where it ends (the test before walked while the
  turn was still running, so the 0-degree approach passed by walking away); and the premise is held as `it.fails`
  ("GAP (LATER 677)", `tools/test/itFailsRegister.test.ts`), not loosened. `BLAST_SKIP_GROUP_READING`'s fallback is
  untouched: under it the base falls from every spot either way.
- *The fallback: the skip covers the target's damage group (`BLAST_SKIP_GROUP_READING`, `viewer/src/sceneHealth.ts`;
  reading, pending review; 2026-11-01, on the merge controller's standing decision for a question the source does not
  settle -- the original's known behaviour has both bases blow).* The reach gate passes the struck node and every node
  whose `+0x94` object is the target's (`FUN_003c80e0` D:L319104-319108). `FUN_002740e0` binds that object with
  `FUN_003158b0(node, record, 1)` (D:L121212-121213), which sets it on the node and its whole subtree
  (D:L215134-215166); the node it binds is the record's `+0x30` name looked up, else `+0x3c`, else the node table's entry
  at the record's byte `+1` (D:L121150-121158) -- not traced to a program reference. Two readings, both recorded:
  - **'target-subtree'** (as read until now): the bound node is the health block's own (`basedi`); the post, a sibling
    under `healthy`, refuses every line from outside it.
  - **'healthy-group'** (chosen): the bound node is the target's damage group -- the deepest node of the destruction
    program that holds the target below the program's root (`blastSkipPath`; on every DEMOLITION base `healthy`, the
    node the program turns off). Found from the program's placed references, never by a map's name: no map is special-
    cased. On MP7 the post is skipped and the terrorist base falls from every reachable spot (116 of 116); every other
    DEMOLITION base's count is unchanged (the table above), The Ruins' mast cases among them (the tower is not in the
    SEAL base's group, 209 §14).
  - *Beyond the bases* (the review's F1; `central/test/blastSkipWiden.parity.test.ts`, every map on the disc, pinned):
    the group widens 36 of 534 destructibles' skips -- the twelve DEMOLITION bases, MP61's and MP62's terrorist bases,
    MP73's `destroy_comm_wall` and `destroy_aagun`, MP9's big shack, ammo depot and eight crates, and single-player M53's
    eight vases and `access1` and M62's `destroy_plane`. On each one's room world (`WorldState.applyInitial`), of 192
    blast lines about its midpoint (4 to 40 u, level and raised) three answers change: MP7's terrorist base 0 -> 192 (the
    fix), MP73's `destroy_comm_wall` 180 -> 190 (shield 21; the group `wall_breaker/good`) and MP9's
    `big_shack_destroy` 164 -> 187 (shield 45; `di_2`, `di_3`, `di_4`, `invis`, `ceilingdi` passed). Neither is reachable
    today: only MPBOMB (50) beats a shield of 21 or 45, and neither map plays DEMOLITION. M53 `access1` (shield 0) and
    M62 `destroy_plane` (shield 8, an M67 reaches it) widen with every line unchanged -- checked on a room world's
    sphere, not in a room or a mission run. No narrower reading was better evidenced: nothing read binds the post's own `+0x94`,
    and the aim point stays the bounds midpoint (`SCENE_BOUNDS_MIDPOINT_READING`).
  - The rule is shared code: the room's `sceneBlast` and the page's grenades (`grenade.ts`) both take the skip
    `SceneHealth.blastAt` hands them. H371 settles it with the plant point.

**The plant's pick (PLANT-AIM, IP2, Trello Nixhb9XT, 2026-11-02; reading, pending review).** The owner's default (the
playtest batch's Q2): the faithful aim-pick only, no interim nearest-point zone. The decompilation re-read at the source
(`$SOCOM_PC_ROOT/game/analysis/socom2_game.elf.decomp.c`; nothing pasted):
- *The offer.* `FUN_005937c0` asks `FUN_005aa240(actor, 1)` (D:L452339) and offers type 7 -- the plant -- when the record
  it returns passes `FUN_00594350` and is type 4, MPBOMB (D:L452414-452417); `FUN_00594350` hands type 4 to `FUN_00594480`
  on DEMOLITION (D:L452722-452724), whose side test is the tents' (D:L452755-452759).
- *The pick.* `FUN_005aa240` (D:L463830-463905) takes the node of the pick's action record (`+0x3fc`) else of its opaque
  hit (`+0x3dc`) -- `FUN_005aa6e0`'s, the camera's ray (research 179's C4 rows; the port's `actionRayDetail`) -- and its
  parents (`FUN_005aa470`); refuses valve 99 and type 8; then measures from the actor's position plus `+0x14b0` (the posed
  firepoint's offset; the zero vector only when it is zero, D:L463874-463881) to the hit point (`+0x3e0` else `+0x3c0`,
  D:L463884-463886): ground-plane distance squared under range squared, height squared under elevation squared, both
  strict (D:L463895-463898).
- *The hold re-picks every frame.* With the hold's flag (bit 4 of +0x171) set and no target, `FUN_00594cf0` picks with
  `FUN_005aa240` (D:L453258) and, past `FUN_00594350` with type 4, sets the target to the record's +0x14 and the timer to
  5.0 (D:L453259-453264); `FUN_005920c0` re-picks (D:L451495), counts the timer down while the pick's record +0x14 is the
  target (or the opaque hit's node is, D:L451496-451503), and commits only when the re-pick still passes `FUN_00594350`
  and is type 4 (D:L451507-451514). The flag is the offer list's head being type 7 (`FUN_0021f850` D:L74304-74307), so a
  pick off the tent drops the plant's offer and the hold resets (D:L453281-453287).
- *The patch.* Every DEMOLITION tent's MPBOMB node owns one floor quad about its base (ditype 3; MP72 `terrorist_tent`
  x 487.3-564.7, z 1492.0-1559.0 at y 14.31, ASPHALT; `seal_tent` a rotated quad of about 38 x 45 at y 63.19; MP83
  `seal_tent` its floor quad and an upright quad at z 2557.4 from y 116 to 136; every other base one quad -- read
  through `simMapFromBytes`, the room's grid, on the dev disc). So the zone is the patch, plus the reach, gated by
  looking at it.
- *The measuring point* (`PLANT_PICK_FIREPOINT_READING`). The room poses no weapon: the offset is research 217 §1.3's
  table of the M4's firepoint on the port's pose (stand (-2.750, 12.728, -8.599), crouch (1.341, 7.090, -11.438), prone
  (-1.728, 0.074, -14.490), body frame), turned by the facing (`plantReachFrom`). It decides whether a standing SEAL can
  plant on level ground at all: at the standing aim's lowest pitch (-70, `aimPitchLimits`) the port's camera look strikes
  level ground 15.3 u ahead of the feet (crouched 13.1; prone, at its lowest -20, 23.8), out of range from the feet and 6.3 from the
  firepoint. The switches (`actionReachNote`, XR-04) and the pickup (`PICKUP_POINT_OFFSET_PLACEHOLDER`) still measure
  from the feet -- not changed here (the switches' offset is a follow-up of the same read).
- *Built.* Page and room share `holdKind` (`./objective` `plantAimAt`: the pick's action among the map's actions is the
  site, the reach from `from`). The page (`BombPage`, `matchActions`) picks along the use prompt's ray (`actionRayPick`,
  `WalkMode.lookAim`) and names its pick to the room when it changes while carrying (`bombAction` 'aim', additive; null
  once it stops offering). The room keeps the last pick (`BombAuthority.aim`) and re-picks it on every tick it reads
  the plant's eligibility -- each held command and each tick of a counted hold (`room.ts` `plantAimSees`): with the
  page's own pick (`equipment.ts` `plantPickFrom`, `actionRayDetail`: front faces only, the aim's see-through materials
  passed, the action record first), from the camera as the original's pick leaves from it (`FUN_005aa6e0` with
  `cam+0xd8`, D:L142028) -- along the newest command's look from the room's eye (`orderOrigin`, toward
  `ShotCone.lookFar`; one frame for both), else from the page's eye held to the camera's locus (`pageEye`) through the
  named point -- and it must strike the named node; the room's own point is the reach's. A forge site has no polygon: its
  reach stays the feet near its point (the forge's adaptation, unchanged).
- *The review's fold (the fresh review of 4a644a442: FAIL, F1-F6; 2026-11-02).* F1: the room's first check
  (`c4Line` from the eye to the named point) counted every face on the line a wall, where the page's pick looks
  through INVISIBLE_DI, VOLUMETRIC and LIQUID and meets faces from the front only; over every look the page offers on
  the eight tents (feet on a 6 u grid over the patch and 14 u about it, every 30 degrees, the standing pitches -70 to
  -20; `plantAim.devdisc.test.ts`) it refused MP72 `terrorist_tent` 439 of 1706, `seal_tent` 66 of 644, MP83
  `terrorist_tent` 120 of 928, MP7 155 of 1193 and 204 of 984, MP12 476 of 2985 and 110 of 4278, MP83 `seal_tent` 0 of
  1652; under the room's re-pick, 0 everywhere. F2: protocol 13 -- a page that cannot name its pick cannot plant, so
  an older page is refused at the hello. F3: the page names its pick when the struck node changes, else only after a
  move of 4 u and 6 room ticks (`PLANT_AIM_RESEND_ADAPTATION`, a network adaptation: at most 10 a second, under the
  room's text bank of 40); the room needs no fresh point, re-picking along its own look. F4 (the firepoint's write at
  D:L493890): not taken -- at D:L493889 `FUN_005df450` calls `FUN_005df930` with, as its third argument, the actor's
  word pointer advanced 0x52c words; a word is 4 bytes, so the vector written is at byte offset 0x52c x 4 = `+0x14b0`.
  The call one line before (D:L493888) writes 0x528 words on, `+0x14a0`, the aimpoint; D:L493890 is the function's
  return. The cite stands, with the arithmetic for the reviewer (the re-review agreed). F5: the switches go through `FUN_005aa240` too: research 213 §6, `SWITCH_REACH_POINT_PLACEHOLDER`.
  F6: the boundary pins (the strict 15 from the firepoint; each refusal's reason), and the covered corner below re-read.
- *What it gives, on the dev disc* (`central/test/plantAim.devdisc.test.ts`: the camera as the room places it, the pitch
  within the aim's limits, standing): from 2 u in at each corner and edge middle of MP72's two patches and MP83's
  `seal_tent`, some look at the patch plants -- but at MP72 `seal_tent`'s corner (1996.6, 1442.2), where every look is
  taken by the pick's action-record branch (`healthy/basedi`, INVISIBLE_DI under the base's own action, nearer than
  the opaque patch: `FUN_005aa6e0`'s `+0x3e0`, which `FUN_005aa240` takes first) -- a reading, owed a capture; looking
  out and up, away from the patch, never.
- *r0004* (OT.R96). The r0004 investigation's report (agent-mail `evidence/r0004-investigation/REPORT.md`) and its plan
  (`agent/r0004-b`, `docs/plans/r0004-option-b.md`) name no change to `FUN_005aa240`, `FUN_005aa6e0`, `FUN_005937c0`'s
  plant offer or `FUN_00594350` / `FUN_00594480`: its explosives corrections file "plant eligibility" as r0001's own
  test, and R4B-16's new online refusals cover the bomb's drop and the type-0 use offer, not the plant. The r0004 binary
  was not read here.
- *Owed:* capture B item 7 -- the plant from the reach's edge (standing at a patch corner, looking at it) -- and an
  RDRAM read of `actor+0x14b0` (research 217 §1.3).

The page predicts its own hold the same way (`BombPage.tick(actionHeld)`, one call per command it sends, the bit the
walk sets from `actionHeldNow`): its `holdProgress()` runs 0..1 over the 300 commands, back to null on a release, so the
prompt's feedback needs no round trip; the room's events correct it (a `place` hold ends the prediction). The page's
prediction counts one a command, the walk sending one a tick. It does not gate on the round's phase: during a decided
round's hold the page would show a hold the room never counts (owed to XR-06, s6's `DEFUSE_PROMPT_ICON_READING` row).

## 3. The cues and the drawing (XR-06)

**The cues** (`viewer/src/roundCues.ts` `RoundCues.bomb`, `BombCues`): the map's own `objectives` script, read at run time
as the round's other cues are (research 124 s5; W2.R6), five sequences each waiting in its loop on one `mp_bomb` value
(213 s2.4). `roundCues` runs each sequence's `IF` chain for both of the bomb's sides (`bomb_owner` 1 the SEALs, 2 the
Terrorists) and the three `player_team` values (0, 8, 16), the first branch that holds and its nested chains, and keeps
the steps -- a `WAIT`, a `SOUND` (the slot's music on flag 0x800), a `MESSAGE` (its mp72LOC id and scale) -- in order;
`CALL_SEQUENCE`, `STOP_SEQUENCE`, `CALL` (the base's pulse) and the valve writes (the score, the winner) are not cues:
the room owns the round (PF.R27). On Crossroads (the MP72 fixture):

| kind | sequence (offset) | trigger | the side (`bomb_owner`) | steps, every `player_team` unless said |
|---|---|---|---|---|
| `pickup` | `bomb_pickup` (@4344) | `mp_bomb == 2` | the carrier's | `MUS_BOMB_PU` (slot), 7207 0.9, 7212 0.7 |
| `drop` | `bomb_drop` (@4204) | `mp_bomb == 1` | the dropper's | 7207 0.9, 7211 0.7 |
| `planted` | `switch_timer` (@3844) | `mp_bomb == 3` | the planting side's | 7207 0.9, `^PH_0005`, 7208 (SEALs) / 7209 (Terrorists) 0.7, 7210 0.7, WAIT 2, `MUS_BOMB_PLANTED` (slot) |
| `defused` | `defuse` (@1960) | `mp_bomb == 4` | the defuser's (171 s6) | `^PH_0003`, WAIT 3, 7206 0.7, 7203 / 7205 0.9, `^PH_0014` / `^PH_0002`, `MUS_MP_SEAL_WIN_ALG` / `MUS_MP_TERR_WIN_ALG` (slot) |
| `detonated` | `bomb_timer` (@4596) | `mp_bomb == 5` | the planting side's | WAIT 2, `^PH_0004`, 7213 0.7, `^PH_0004`, WAIT 2, 7203 / 7205 0.9, the side's line and win music; the SEAL bomb's SEAL viewer (4632): 7213 then one `^PH_0004` |

The nine maps whose scripts hold the sequences (MP1, MP7, MP9, MP12, MP61, MP62, MP72, MP73, MP83) carry `bomb` in
`golden/round-cues.json`, re-derived from the dev disc with the other cues unchanged (an additive key). `cueNames` adds the
bomb's five streams (`MUS_BOMB_PU` MUMP0011.VPK, `MUS_BOMB_PLANTED` MUMP0012.VPK, `^PH_0003`/`^PH_0004`/`^PH_0005` VAGs:
every one a stream of the blocks Crossroads loads, SOUNDRDR.ZAR), so the sound worker reads them with the map's data;
`soundData.ts` fills the 72xx lines through `withObjectiveTexts` from the map's own mp72LOC (`needsTexts`).

**Playing them** (`RoundAudio.bomb(kind, owner, team, now, post)`, `RoundAudioHost.bomb`): the steps from the moment
`BombPage` sees the room's `bomb` event change state (a pickup: carried by a new carrier; a drop: carried -> on the
ground; a plant; a defuse or a detonation from planted), by the bomb's side and the local seat's team, each line handed
to `post` (the HUD's `postMessage`) at its wait. The defuse and the detonation decide the round as an elimination does
(the first decision is the round's only one); in a decided round a pickup's and a drop's cues play and a plant's does not (LATER 145). A welcome
plays nothing (`JOIN_SILENT_READING`). The room posts no line of its own for the bomb (s1).

**TCM row 0x2e** ("MP DEFUSE BOMB", S:0x3e5ff8): the tactical command menu's row the bomb modes enable (research 197
W2-R-05, D:L83771-83772; 203: `FUN_0022fa90` gates 0x2e on modes 1 and 2). Not built: `TCM_BOMB_ROW_READING` (note only).
It is not the defuse timer's label -- the brief's "MP DEFUSE BOMB with the fuse" read it so; the fuse is drawn alone
(`DEFUSE_TIMER_LAYOUT_READING`).

**The drawing** (`viewer/src/bombPage.ts`, what `main.ts` lends at construction -- `BombPageView`: the round audio, the HUD,
the remote players, the effects, the world bomb -- so `netPage.ts` needs nothing):

- **The phase gate**: `tick()` and `prompt()` (and so `holdProgress()`) answer only while the round is in play: from a
  `roundStart`, or a welcome into a round begun (its `startTick`, not `waiting`, no `countdown`, the bomb not decided),
  until a `roundOver`, an `abandoned`, or the bomb's state 4 or 5 -- through a decided hold too (LATER 145,
  `DECIDED_HOLD_BOMB_READING`: the room's bomb is live there, s6).
- **The satchel** (`HIDDEN_AT_SPAWN`, `FUN_0059df60`): `RemotePlayers.setGearVisible(carrier, 'Satchel', true)` on the
  pickup (`FUN_005bbf10`), off on a drop or a plant (`FUN_0059dd30`, `FUN_0059ddb0`), kept by id so a body built later
  wears it. Until PB-1 (2026-10-09) the page's own body was left to the others to draw, so the carrier saw no satchel
  on himself (issue #84, the owner's playtest); the rule is every actor's, the page's own body too -- below.
- **The bomb carried, re-read (PB-1, 2026-10-09; reading, reviewed 2026-10-09).** At the source, by machine:
  - *On.* The state-2 handler (`FUN_002c1c30` D:L163950-163955, every machine) runs `FUN_005bbf10` on the carrier's kit,
    which takes item 0x9a into a slot and shows the satchel, `FUN_0059df60(actor, 1)` (D:L473670; D:L473644 when no world
    bomb is found).
  - *Off at a drop.* The dropper's own request, `FUN_0059dd30` (D:L457560-457574: state 1 sent with its place, the
    satchel off at D:L457568-457570), and every machine's state-1 handler, `FUN_0059ddb0` (D:L457579-457615: the item
    taken out, the world bomb made, the satchel off at D:L457602-457605).
  - *Off at a plant.* The placement's end, `FUN_005bc730` (D:L473973-473975 for types -0x68 and -0x66), and every
    machine's state-3 handler, `FUN_005bc200` (D:L473727). Not at the plant's start: the satchel stays on through the
    5 s hold and the 2.25 s placement.
  - *The port.* `BombPage` turns the page's own body's `Satchel` on and off by the same rule (`BombPageView.ownBody`,
    lent `Play.setGearVisible`), and `Play` keeps the gear shown across a rebuilt body (the port rebuilds the page's body
    on a map, side or type change where the original keeps its actor). A frame on which the followed room's socket is
    no longer open (`BombPageDeps.open`, a browser adaptation) takes the own satchel off (review F2: a room lost with no
    new welcome left it on every rebuilt body); `BombPage.dispose()` does the same but no page calls it today (the
    close's pass 2), so `open` is the path both pages take. Both pages lend it alike, `ownBombBody` and
    `bombSound` in `bombView` (`main.ts`, `matchMount.ts`) and `open` in `matchActions.ts` -- PB-1's HOT hunks for the
    main merge controller's window, PB.R2 and PAR.R3; `bombPage.test.ts`'s two `it.fails` source checks turned ordinary
    when they landed (wave 2, a3ab99399); the `dropWhy` one turned ordinary when the wire landed (the online-parity
    sweep's P25, 2026-11-03).
  - *Timing* (review F3; ROOM-AUTHORITY TIMING, PF.R27). The original hides the satchel locally and at once: the
    dropper's in the same call that sends the drop, right after the send (`FUN_0059dd30`: the send D:L457567,
    `FUN_002c2090` -> `FUN_002b9910` -> `FUN_0030cef0`; the hide D:L457568-457570), and the planter's at its own
    placement's end, before that send (`FUN_005bc730`: the hide D:L473974, the send D:L473982); the port hides the own
    satchel when the room's event says so, a round trip later. Not changed: the open question below
    s6's table.
- **The plant's clip (PB-1; reading, reviewed 2026-10-09).** The plant's commit runs `FUN_005be9a0`'s branch for the item's
  type byte -0x66 (0x9a, MPBOMB), which pushes `FUN_0057d540(actor, DAT_003deb48, 0)` (D:L475480-475481) as it arms the
  2.25 s placement. `DAT_003deb48` is the action type `Place claymore` (`FUN_005e4f90(0x661628)` D:L495216; the string
  at 0x661628). It is the claymore's and the PMN's placing (D:L475322, D:L475354), not C4's `Put on wall` (D:L475420).
  With the sidearm in the hand the body plays its pair, `Pistol place claymore` (0x661640; `FUN_0058c820`, the pairs of
  `FUN_005e1cf0` D:L494772). The Seal anim set gives the clips `seal_place_claymore` and `seal_p_place_claymore` (55 keys,
  `playback` 2.7, `NoInterrupt` 0.9, `NoFire`, 2.60 s; `animset.rdr` and `motion.rdr` through `test/equipmentAnim.test.ts`).
  - *The port.* `BombPage` starts `PLANT_ANIM` (`PLACE_CLAYMORE_ANIM`, `handAnim`) on the own body through
    `ownBody.startClip` -- the throw's pose layer and the mover's hold, as the claymore's own placing is started
    (`./matchThrow` `throwStart`). It does so once a placement, when the room's `bomb` event opens the placement
    (`hold.kind` `place`) for the page's seat; a welcome into a placement starts none. ROOM-AUTHORITY TIMING (PF.R27,
    review F3): the room is the bomb's authority, so the clip and the movement lock it brings (`walk.hold`) start a round
    trip after the commit the original's planter makes locally -- the open question below s6's table.
  - *The others.* In the original the push is the planter's console's alone and reaches the others as a Push Blend:
    `FUN_00588bc0`, on a network game for a local actor, sends the started action to every console (D:L446408-446416 ->
    `FUN_002bbaf0` D:L160775-160799, message 2), when the type is flagged for it -- `animset.rdr`'s SOLDIER set marks
    `Place claymore` and `Pistol place claymore` `network_log`, as it marks the throws and `Put on wall` (research 91:1090's
    flinch row, 201:456's binocular rows) -- and `FUN_005880e0` replays it on the remote actor. In the port the hold rides
    the command's and the body's hold code (`HOLD_SHIFT`, `BODY_HOLD_SHIFT`; `seal_place_claymore` is in `HOLD_CODES`),
    so the room's mover holds and `RemotePlayers` plays it on the planter's body through `ThrowPose.follow`. No wire
    change is needed: another page sees the plant from the planter's body state it already receives.
  - H161's stand-in (C4's clip) is not needed: the clip is read.
- **The drop's clip (PB-1 review F1; reading, reviewed 2026-10-09).** Every machine's state-1 handler, `FUN_0059ddb0`, also
  pushes `Place claymore` (`FUN_0057d540(actor, DAT_003deb48, 0)`) when the actor's controller answers false at its
  vtable +0x34 (D:L457606-457612). That slot is `CRemoteCtrl::IsRemote` (research 193 s12.6, claim 9 CONFIRMED: r0001
  0x5e6260 at 0x6695c4, the demo's `IsRemote__11CRemoteCtrlCFv` at the same slot; research 151:29 and 174:98 agree), so the
  push is the dropper's own console's, on its own body; on the others' consoles the dropper is remote and nothing is
  pushed there. The others see the clip through the push's Push Blend, as the plant's (above). Re-read 2026-10-09 at
  research 193:574-575. The earlier `DROP_CLIP_READING` (+0x34 unread) is replaced.
  - *The port* (re-review, 2026-10-09: option B). The room's `bomb` event that puts the bomb this seat carried on the
    ground with `dropWhy` 'manual' -- the room's reason for the drop, set by `BombAuthority.manualDrop` against its
    `dropped` at a death ('death'), a leave ('leave') or a seat lost between ticks ('gone') -- plays `PLANT_ANIM` (the
    pistol's pair with the sidearm in the hand) on the own body through `ownBody.startClip`, the throw's pose layer and
    the mover's hold, in play; the others see it through the hold code. `dropWhy` is an additive member of `BombWire`
    (PF.R33) and the online lane's hunk (`net/objective.ts`, `match/src/bomb.ts`; not committed with PB-1). *Landed
    2026-11-03 by the online-parity sweep's P25 (BO-1; reading, pending review):* `BombAuthority.dropAt` sets it from the
    drop's cause, `pickup` and `reset` clear it, and `wire` tells it only while the bomb lies on the ground (state 1);
    held by central `roomBomb.test.ts`'s two P25 cases (a hand drop 'manual', a death 'death', a pickup and a round's
    reset none) and `bombPage.test.ts`'s source check (an `it.fails` from PB-1 until then). Before it no drop played the
    clip on any page. Not derived with it: the room's mover lays the drop's hold on the code's default pass, after the
    driver, where the page lays it before (`BOMB_DROP_PUSH_PASS_READING`, research 251 s12.5; LATER 659).
  - *Why the page cannot tell it alone.* PB-1's first fix kept an ask on the page (`dropAsked`, spent by the next bomb
    event). A refused drop sends no bomb event: `Room.bombAction` hands the refusal to its server-side tally
    (`dropped('bombAction', why, p)`, room.ts:3188-3195), `BombAuthority.manualDrop` returns before `dropAt`, and
    `publish` sends nothing when the wire is unchanged (bomb.ts:359-365). The room's drop for a death comes before its
    `kill` (`Room.kill`), so an unanswered ask reached a later death drop and played the clip on the dead body (the
    re-review's probe). Spending the ask on the snapshot's command ack (option A) does not close it either: the room
    judges a `bombAction` on its text frame's arrival (server.ts:820-822 -> `Room.text`, room.ts:1901; its `seq` only
    shape-checked, room.ts:3191), while it runs commands and sends snapshots on its own clock (`step`, room.ts:2010
    `snapshots` every `TICK_HZ / SNAPSHOT_HZ` ticks), so a snapshot acking the send's `seq` can precede an accepted
    drop's event; and a snapshot carries `own.ack` only while the player lives (room.ts:5015-5019), so after a refused
    ask a death can come before any ack that would spend it.
  - *Open:* the death drop (`DEATH_DROP_CLIP_READING`, note only). The carrier's death drops the bomb too
    (`FUN_00547af0` D:L413112 -> `FUN_0059dd30`), and the state-1 handler then runs on the dead actor; `FUN_0057d540`
    pushes only when the actor's +0xe1 bit 4 is set and its current action's +0x2b is not 8 (D:L440342-440343), and
    what those hold on a dead actor is unread. The port plays no clip at a death drop.
- **The bomb's sounds (PB-1; reading, reviewed 2026-10-09).**
  - *The pickup*: `.FOOTBOMB` (the string at 0x65f860), found by name (`FUN_00344f30`, research 122 R122.1) and played at
    the carrier's place at 1.0 by `FUN_005bbf10` (D:L473662-473664) on every machine. Crossroads' own bank holds it:
    `MP72_am.bnk` index 76 (the disc's `RUN/SOUNDS/BNKSTORE.ZAR` through `parseBankFile`, with its `sounds.rdr` entry in
    the block `MP72_AM` through `soundScriptFromArchive`; review F4). Every multiplayer map's `<map>_am.bnk` on the disc
    holds it (23 banks, MP1 to MP83) but `MP99_am.bnk`, the one of 24 without it -- MP99 is no offered map;
    `golden/walk-sounds.json` pins MP2's (index 83, group 2, range 100-600).
    `BombPage` plays it (`PICKUP_SOUND`, `BombPageView.sound`) at the carrier's feet on a live change into carried, not
    at a welcome nor a takeover's rekey.
  - *The plant*: none of its own (`PLANT_SOUND_READING`). Item 154 (MPBOMB) names no `FireAnimName` (`zweapon.rdr`:
    `NOT FOUND`), where the claymore and C4 name `c4_start` (`.PLACE_CHARGE`, research 85 s9.7, research 304). The
    `Place claymore` clips carry no `zanim_callback` (`motion.rdr`). On a network game (`DAT_0045a0c1`, research 107)
    `FUN_005bc730` sends state 3 for the bomb and returns (D:L473980-473984) before the item's `FireAnim` is looked up
    and played (`FUN_003d22b0`, `FUN_00272bb0`, D:L474051-474059), where the claymore's `c4_start` plays. No sequence of
    the `objectives` script waits on the placement: `mp_bomb` stays 2 until state 3. The plant's sound is therefore the
    script's `switch_timer` on `mp_bomb == 3` (the table above), which `BombPage` already plays.
  - Tests: `viewer/test/bombPage.test.ts` ("the bomb carried on the own body (PB-1; issue #84)", the disc's half on
    the tracked fixtures, "the plant's sound on the disc (PB-1)", and Crossroads' bank on the disc, "the pickup's sound
    in Crossroads' bank (PB-1)"), `viewer/test/play.test.ts` (the gear kept across a body).
- **The world bomb** (`Grenade.worldBomb`, `BOMB_MODEL_READING`): at `pos` on the ground (1), planted (3) and defused (4);
  none while carried (2) nor after the blast (5, `FUN_002c1c30` hides the bomb's node). The brief named states 1 and 3: no
  read hides the node on a defuse, so it stays where it was set. The model is the one `FUN_0059dab0` hangs: the model
  libraries' "Satchel" (`FUN_0031fd10(0x65f0f8)` D:L457499, case-blind), made at the point with no turn
  (`FUN_00307360(0,0,0)`, `FUN_00317d90` D:L457497-457500) and named "MPFootBomb" (D:L457506). The library holding a
  `Satchel` is the fittings' (`FLIB_MDL.ZED`, the carrier's gear of the same name; `WEAP_MDL.ZED` holds `c4` and an
  unreferenced `footbomb`, no `Satchel`), decoded with the throwables (`grenadeAssets.ts`, `body.ts` `fittingMeshes`):
  on MP72 its frame runs y 0 to 4.114, its textures `satchel_tex.tif` and `satchel_handle.tif`. C4's placed model stood
  in until 2026-10-07.
- **`base_explosion1`** (`FUN_002c1c30` D:L163920: context type 3, the bomb's node): `effects.play` at the bomb's point on
  a live 3 -> 5; a joiner after it sees none.
- **The explosion it draws and plays**: research 332 section 7 (the source of truth; DBFX-1, with OBF-18 reconciled
  into it 2026-10-31, 332 section 7.1). The program's one `FIRE_WEAPON` (MPBOMB at the caller, timers 0.001 / 0.01) is
  flown by the effects' script round, which goes off one game frame after its fuse -- not on its first `PostTick`, as
  this paragraph read on 2026-10-30 (`FUN_003c99a0` D:L319900-319902 state 3, `FUN_003ca5a0` D:L320411-320420 state 4,
  `FUN_003c9fb0` D:L320104-320106) -- with the camera's shake by the distance (`FUN_003c8330` D:L319186-319195) and no AI
  noise (MPBOMB's `Sound_Radius` 1, D:L319197-319209). Held by `viewer/test/demolitionBlast.test.ts` and
  `viewer/test/bombBlastEffect.test.ts`.
- **The HUD** (`hudFrame`, once a frame): `Hud.setExtraMarks` -- `ret_bomb.tif` at the bomb where it lies (states 1
  and 3; none while carried, for any viewer: OT.R99, "The compass while carried" below) and `ret_base.tif` at the tent
  the carrier's side must reach, for that side (`COMPASS_BASE_MARK_READING`), drawn by the nav marks' rule (within
  200 u at 0.005 x 65 px a unit, beyond it pinned at radius 64 at 1.2x with `ret_triangle`; never filtered to the
  nearest) in `OBJECTIVE_MARK_RGB_READING`'s colour -- and
  `Hud.setDefuseTimer`: the fuse's seconds (`defuseTimer()`) in the round timer's place (`DEFUSE_TIMER_LAYOUT_READING`).
  And (PB-8) `Hud.setHoldBar`: the hold bar below, while this page's player holds the plant or the defuse.
- **The compass while carried** (OT.R99, the owner, 2026-11-02, amended the same night to match the original; task
  DkA3Lwsa; reading, pending review). The carried bomb is marked on nobody's compass -- the other side's, the carrier's
  team mates', a side-less watcher's and (as before) the carrier's own. Read: the bomb's state 2 runs `FUN_005bbf10` on
  each console (`FUN_002c1c30` D:L163950-163955), which frees the viewer's `BOMB_GROUND` mark (the `+0xec0` slot,
  `FUN_002a27e0` then `FUN_00544c60(.., 0)`, D:L473680-473685; the viewer is the carrier if he is the local player, else
  `FUN_002b3580`'s local player, D:L473671-473681) and makes only `ALL_YOUR_BASE` in the `+0xec4` slot
  (D:L473693-473701). The one type-1 mark (`ret_bomb`, research 190 s5: `FUN_002126f0` D:L68576 loads type 1 as
  `ret_bomb.tif`) in the program is `BOMB_GROUND` (0x65f110), made at the bomb's point on the ground only
  (`FUN_0059dab0` D:L457516-457526, its `param_2` 0: the drop and the reset); every other mark maker sets another type
  (`FUN_002a28f0`'s 14 call sites, its definition at D:L146865 apart; `FUN_005434b0` only with 4, 5, 0xc, 0xd,
  D:L432837-434920). `CZMPBombMapItem` (D:L65256) is the map screen's bomb item, named by the ruling; its state-2 skip
  is the investigator's reading, not re-read here. The port: `BombPage.marks()` draws `ret_bomb` for states 1 and 3 only; held by `bombPage.test.ts`
  ("OT.R99: ...") and `replaySeekFold.test.ts` (RE-6).
  Findings left open (out of this task's scope, recorded, not changed):
  - **The other side's base mark.** `FUN_005bbf10` gives every viewer an `ALL_YOUR_BASE` mark at the carrier's side's
    base (`DAT_00437dcc` / `DAT_00437dd0` + 0x30, chosen by `FUN_002c30b0`, D:L473686-473690): type 2 when the
    viewer's `+200` mask meets the carrier's, else type 3 (D:L473696-473699) -- research 190 s5 loads types 2-3 as
    `ret_base`; the port draws `ret_base` for the carrier's side only, none for the other side.
  - **The planted bomb's mark.** The plant (state 3) calls `FUN_0059dab0(.., 1)` (`FUN_005bc200` D:L473724, or
    D:L163942-163943 with no planter), whose `param_2` 1 skips the `BOMB_GROUND` maker (D:L457516): the original
    makes no type-1 mark for the planted bomb, where the port draws `ret_bomb` at it in state 3.
- **The hold bar** (PB-8, issue #120, 2026-10-09; reading, pending review; ruling PB2.R2: "the same timer must show for
  defuses as well"). The prompt's widget (`CZActionBitmap`, research 87 s5) owns two untextured quads, made with it
  (`FUN_0021ded0` D:L73815-73829): a box, black (`FUN_00364930(0, 0, 0)` D:L73816), at 585-635 x 345-360
  (`FUN_00364660` D:L73817 with `DAT_003dc648/650/658/660`, floats 585, 345, 635, 360 in the ELF's data; the call
  takes x0, y0, x1, y1, D:L261712-261718), and a fill, (100, 100, 100) (`DAT_003e4ba0..a8` = 100.0, `FUN_003fe550`
  D:L327785-327787), inset by `DAT_003dc668` (2.0): x from 587, y 347-358, 46 px at full (`FUN_003fe550`
  D:L327765-327769). Both start hidden at alpha 0 (research 87 s5's "hidden box"). Each frame `FUN_00220350`, for the
  bomb's action (type 7, D:L74426) with the kit's hold flags both set (+0x171 bits 4 and 5, D:L74429: bit 4 the bomb's
  action at the head of the list, `FUN_005920a0` from D:L74307; bit 5 the hold, `FUN_00594cf0` D:L453249-453287 (*was* cited `FUN_00594600` D:L453264) and
  D:L453270), shows both, the box at alpha 38.4 (`0x4219999a`) and the fill at 100 (`0x42c80000`), and puts the fill's
  right edge at `(int)(587 + 46 x t x 0.2)` (D:L74437-74442; `DAT_003dc670` 0.2), t from the hold timer at the kit's
  +0x160: 5.0 at the hold's start (D:L453263, D:L453269), less the frame's dt each frame while the target holds
  (`FUN_005920c0` D:L451493-451506), clamped at 0 (D:L74431-74433). t is the seconds held, 5 less the timer, when
  `DAT_0044d4a0` is 0, and the timer itself otherwise (D:L74434-74436): `DAT_0044d4a0` is the world bomb's node, set
  where the Satchel is made on the ground or planted and cleared at the pickup, so the plant's bar fills and the
  defuse's empties (`HOLD_BAR_DIRECTION_READING`, s6). The edge's rounding is the `(int)`: the drawn width is 46 x the
  share, truncated. Off the hold the fill's alpha falls 400 a second (`DAT_004a449c` x 400, the frame's dt) and the box
  takes the same alpha, the fill keeping its width, until both hide under 0 (D:L74444-74457; with no prompt at all
  `FUN_002200c0` D:L74334-74345, the same); another action at the head hides both at once (D:L74484-74486,
  `HOLD_BAR_OTHER_ACTION_READING`, note only, s6). The plant's commit clears bit 5 (D:L451516), so its bar fades and
  does not show through the 2.25 s placement (`HOLD_BAR_PLACEMENT_READING`); the defuse's commit leaves it set
  (D:L451519-451524), the box drawn empty -- for 1.0 s: the commit sets +0x238 = 1.0 and clears the target +0x158
  (D:L451520-451522), and once +0x238 runs out the target is set again from the planted bomb (D:L452578-452587) and a
  still-held defuse restarts the timer at 5.0 (D:L453267-453270); the port keeps the empty box until the room's state 4,
  which agrees under normal latency. The direction's second witness: the same `DAT_0044d4a0` picks the prompt's caption,
  60480 `_BOMB_DEFUSAL_MSG` with the planted bomb and 60481 `_DEMOLITION_MSG` without it (D:L74458-74462). The plant and the defuse share the timer, the flags and
  the bar (PB2.R2).
  - As built: `HUD_LAYOUT.holdBar`, `HUD_COLOURS.holdBox` / `holdFill`, `HOLD_BAR_FADE` and the model's `holdBar`
    (`viewer/src/hud.ts`: drawn right-anchored as the info box is, over the prompt, not touched by its pulse; hidden
    with the prompt by the scoreboard); `Hud.setHoldBar(fill | null)` (null starts the fade, `step` runs it);
    `BombPage.holdBar()` (the plant's share, ending at the 300th held command, the commit; the defuse's 1 less it) fed
    by `hudFrame` once a frame, null off a hold or out of play. Both pages lend their `Hud` as the bomb's `hud`
    (`bombView`) and call `acts.bomb.hudFrame()` each frame (`main.ts`, `matchMount.ts`): no wiring of their own (PB2.R3).
  - The timer basis: the page counts its own held commands, one a 60 Hz command (`tick`), where the original's timer
    takes the frame's dt; at the console's 60 frames a second the two agree to a frame. Below 60 commands a second the
    page's bar runs slow, as its prediction does: the prediction's real-time basis is owed with the page's other
    timers (research 252 s3, s4); the room's own hold, on room ticks (ACT.R8), is unchanged.
  - Tests: `viewer/test/hud.test.ts` ("the hold bar (PB-8; issue #120)": the rects, colours, alphas, the truncation,
    the fade), `viewer/test/bombPage.test.ts` ("the hold bar fed to the HUD (PB-8; issue #120)": the plant's, the
    defuse's, none off a hold, the release, both pages' wiring).
- **The prompt** is the action context's (s4: `contextPrompt`), so one slot serves every context.

Tests: `viewer/test/roundCues.parity.test.ts` (the MP72 bomb cues, their lines and streams, `RoundAudio` playing them),
`viewer/test/bombPage.test.ts` (the phase gate; the satchel, the world bomb, `base_explosion1`, the marks, the fuse, the
cues' kinds and sides), `viewer/test/hud.test.ts` (the marks and the fuse's slot).

## 4. The input context and the cancel rule (XR-06)

**One context** (`viewer/src/actionContext.ts`, headless): `ActionContext = 'door' | 'switch' | 'bombPlant' | 'bombDefuse'
| 'bombDrop' | 'c4' | 'traversal' | 'turret' | null`. `pickContext(inputs)` takes the first in reach in **the picker's
order**. The picker `FUN_0021d9d0` (D:L73370-73404) rebuilds a list each frame from the player's action mask (`+0xed0`)
through `FUN_0021f850` (D:L74042+), which appends one entry per bit set (`FUN_002209c0` -> `FUN_001fe340` at the list's
end) in a fixed order; the list's head is the action (`FUN_00544c80(.., head+4)` D:L411188: `+0xed4 = 1 << action`),
and `FUN_00592d50` then only runs the one bit it is handed. (The brief cited `FUN_00592d50` D:L452002-452022 for the
order: that is the `0x2000` branch, which ranks nothing -- corrected in the fix round.) The bits, in the order
`FUN_0021f850` tests them:

| bit (`1 << action`) | action | the port's `ActionContext` | source |
|---|---|---|---|
| 0x80000 | 19: the turret's mount (`FUN_005a88c0` D:L462999: the controller's `+0x16c`, the first kind-3 object `FUN_005940d0` keeps, D:L452659-452663; run by `FUN_00592d50` D:L452089-452104, `FUN_00546210`) | `turret` | `FUN_005937c0` D:L452472-452475 (AD-6) |
| 0x100000 | 20: the turret's release (`FUN_005a8850` D:L462973: the actor holds a turret, `+0xeb8`; run by `FUN_00592d50` D:L452085-452087, `FUN_00545ee0`) | `turret` (mounted: the only context, `actionWiring.ts` `actionInputs`) | `FUN_005937c0` D:L452334-452338: set, then **return** -- mounted, nothing else is offered (AD-6); online only from 1250 ms after the mount (`FUN_005a8850` reads the actor's `+0x22c`, set by `FUN_005463c0` D:L412209-412213: LATER 151, research 215 s7.11) |
| 0x800, 0x400, 0x1000 | -- | none (unread) | |
| 0x80 | 7: the bomb's plant and defuse | `bombPlant`, `bombDefuse` (never both: by side) | research 171 s6; `FUN_005920c0` |
| 0x10000 | 16: the ladder slide ("LADDER SLIDE") | `traversal` | research 87 s5 (`action_slide.tif`) |
| 0x2 | 1 | none (unread) | |
| 0x4 | 2: the climb (a ledge, a ladder's foot) | `traversal` | research 87 s5 (`action_climb.tif`) |
| 0x2000 | 13: a door, a switch (the `CZAction` under the reticle, `FUN_005aa240`) | `door`, `switch` (one pick) | D:L452002-452022 |
| 0x40000 | 18: C4 (item 0x97) | `c4` | D:L452030-452057; research 171 s6 |
| 0x20000, 0x8 | -- | none (unread) | |
| 0x200000 | 21: the victory dance (`FUN_0057ddf0`) | `victory` | `FUN_005937c0` D:L452376-452377; research 303 |
| 0x10, 0x20 | 4, 5: a weapon's pickup (the controller's candidates `+0x14c`, `+0x150`: `FUN_00544c30`, `FUN_00544c20`, kept by `FUN_00593da0`) | `pickup` (one context, PF-34) | `FUN_005937c0` D:L452427-452434; run by `FUN_00592d50` D:L452157-452178 (AD-6) |
| 0x100, 0x200 | -- | none (unread) | |
| 0x4000, 0x8000 | 14, 15: a hostage's FOLLOW! and HOLD POSITION | `escortee` (one context, HX-4a) | `FUN_00593d00` D:L452494-452498; research 239 s1 |
| 0x40 | 6: the manual drop | `bombDrop` | `FUN_005937c0` D:L452458-452473 |

So `ACTION_CONTEXT_ORDER` is `turret`, `bombPlant`, `bombDefuse`, `traversal`, `door`, `switch`, `c4`, `victory`, `pickup`,
`escortee`, `bombDrop` (AD-6, 2026-10-16; reading, pending review): the turret's two bits lead the list, and the victory
point's 0x200000 comes before the pickups' 0x10 / 0x20, which come before a hostage's order. Was (XR-06, PF-34, HX-4a,
research 303): `bombPlant`, `bombDefuse`, `traversal`, `door`, `switch`, `c4`, `pickup`, `turret`, `victory`, `escortee`,
`bombDrop`, the turret's and the pickup's bits unread (`TURRET_ACTION_BIT_READING` and `PICKUP_CONTEXT_ORDER_READING`,
both 'after-c4', and `ESCORTEE_CONTEXT_ORDER_READING`; the three retired by AD-6, s6). The order is that of what is offered
together, not a claim the original offers each pair at once (a mounted player is offered the release alone). The
carrier aiming down at a C4 target places C4, not the drop; a ledge's climb or a ladder's slide beside a door is the
traversal's. The `traversal` input is in reach only while the traversal offers its own action (the climb prompt, the
slide), not merely while walking. **A second input rotates the list** (`+0xedc` 3 or 2, D:L73332-73386: the head to the
tail or the tail to the head) and the HUD draws up to two more icons beside the head (research 87 s5): not built
(`ACTION_LIST_ROTATE_READING`, note only). `contextPrompt` gives the HUD's prompt for each (research 87 s5: `door`, the
switch's record bitmap, `bomb`, `DEFUSE_PROMPT_ICON_READING`, `bomb_drop`, `c4`, `turret_mount`; the traversal's ledge
prompt is the climb's own).

**The lifecycle** (`ActionLifecycle(pick)`: `press()`, `hold(dt)`, `release()`, `cancel(cause)`, each `{ fire, heldContext }`):
the player update fires the Action on the button's release edge (`FUN_00594cf0` D:L453194-453243), so a release fires the
one-shot context in reach then (a door, a switch, the drop, C4, a turret, the traversal) and ends the hold. The plant and
the defuse are holds (`FUN_00594cf0` D:L453249-453287 (*was* cited `FUN_00594600` D:L453260-453294), the room counting `ActionHeld`, s2): their release fires nothing,
and a press that comes into a site's reach still held becomes the site's hold -- so holding the plant never also climbs,
opens a door or plants C4.

**The cancel rule** (a port rule: no original has pointers, windows or menus over a held button): **a cancel is never a
release**. A cancel ends the hold and fires nothing, the release that follows it is nothing, and a cancel after a
release is nothing (`lostpointercapture` follows a `pointerup` in some browsers). The causes: the window's blur, a menu
over the game, the ARMORY, a pad lost, the player's death, a touch the system took. As built:

- `touch.ts` (`attachWalkTouch`): a hold button's lift says how -- `up` for `pointerup` and a slide off an uncaptured
  button, `cancel` for `pointercancel` and `lostpointercapture` -- as the stance button already did; either lets the lane go.
- `traversalPage.ts`: `cancelAction()` -- the hold lets go, the walk's next command carries no `ActionHeld`, and the
  button's release when it comes (the pad's edge, the key's `keyup`) fires nothing until both are up; the window's `blur`
  is one.
- `walk.ts`: `cancelAction()` -- the moves let the hold go (`holdAction(false)`) and the next command carries no
  `ActionHeld`, so the room's plant or defuse count goes back to 0; no press is made.
- `gamepad.ts` (`PadWatch`): an optional `cancel` called as a pad goes, before `disconnected` -- the lost pad's vanished
  lanes would otherwise read as Cross's release.

**The wiring owed** (`main.ts`, held: PF.R22; the controller's at the main merge):

1. The action filter chain -> one `ActionLifecycle`: `walk.setActionFilter(...)`'s `doors.action() || grenade.plantC4()`
   (and XR-04's `actions.action()`, the traversal) become the lifecycle's `fire` -- `door` -> `doors.action()`, `switch`
   -> `actions.action()`, `bombDrop` -> the `bombAction` drop's send, `c4` -> `grenade.plantC4()`, `traversal` ->
   `traversal.action()` -- with `pick` = `pickContext({ door: doors.target() !== null, switch: actions.target() !== null,
   bombPlant: bomb.prompt() === 'bomb', bombDefuse: bomb.prompt() === DEFUSE_PROMPT_ICON_READING, bombDrop: bomb.prompt() ===
   'bomb_drop', c4: grenade.c4Target() !== null, traversal: <the traversal's climb prompt visible or its ladder slide
   offered> })` -- never `traversal: true`, which would rank the traversal over every door; the pad's Cross edges and the
   touch action lane's call `press` / `release` / `cancel('touch')`. The touch lift's `how` (`holdTouch`'s third argument)
   must be passed on to the lifecycle -- `holdTouch(lane, down)` as it stands drops it, and a cancel would read as a release.
2. `nearby:` (the HUD feed, now `doors.target() ... 'c4'`) -> `contextPrompt(pickContext(...), actions.prompt())`.
3. `BombPage` constructed with `{ roundAudio, hud, remotePlayers, effects, worldBomb: grenade.worldBomb() }` and the deps'
   `teamOf: (id) => remotePlayers.teamOf(id)`, `bodyAt: (id) => remotePlayers.feet(id)`; `bomb.hudFrame()` once a frame;
   `bomb.tick(walk's ActionHeld)` once a command.
4. The cancels: `pads`' `cancel: () => { lifecycle.cancel('padLost'); traversal.cancelAction(); }`, with `pads.poll`
   run before `traversal.padLanes` in the frame (`padFrame`), so a lost pad's cancel lands before its vanished lanes read
   as Cross's release edge; the ARMORY's and a
   menu's opening, the local death, and the window's blur -> `lifecycle.cancel(cause)` and `traversal.cancelAction()`.

Tests: `viewer/test/actionContext.test.ts` (the order, the lifecycle and every cancel, the plant's hold against the
others, `PadWatch`'s cancel), `viewer/test/touch.test.ts` (the hold buttons' cancel).

## 5. Scoring (PF-14)

**The values** (`viewer/src/net/objectiveScore.ts`, headless; the room applies them in `match/src/room.ts`
`scoreObjective`):

| event | points | stat the game writes | source |
|---|---|---|---|
| plant (bomb state 3) | +2 | +0x38 | `FUN_005455d0`; the bomb-state switch D:L163919-163947 |
| defuse (state 4) | +2 | +0x36; BREACH also +0x32 | `FUN_00545650` |
| detonation (state 5) | +4 in BREACH (type 1), +2 otherwise | +0x1a, +0x32 | `FUN_00545750`; D:L411594-411655 |
| an action record's points | the record's `points` (2 on Crossroads' switches and the access actions of MP6, MP11, MP61 Sujo, MP62 Enowapi, MP71, MP73, MP82, MP83; Vigilance's (MP51) carry no `points` key, so 0) | not traced | `FUN_00545530`, callers D:L160566, L160645, L160668; once a round by the record's `+0x3f` bit 1, cleared by `FUN_002b5510` |
| the team carry, on each of the above | +1 to the side's team score (+0x7c SEALs, +0x80 Terrorists) per **living** player (+0xe1 bit 4) sharing a team bit with the scorer, the scorer included | -- | `FUN_00544d60(scorer, 1)` D:L411236-411306 |

**The room** (`scoreObjective(who, event)`, public for XR-05's `BombAuthority` -- PF-14b wires the bomb's three
transitions, on transitions only): the points to the actor's `score` and `roundScore`; one to `primaryObjs` or
`bonusObjs` by `statKind` (`OBJECTIVE_STAT_KIND_READING`); `teamScore[team] += teamCarry(team, players)`, the living
counted at the event's tick; the `score` event marked dirty, so every page's scoreboard follows on the next tick. An
actor who is no longer in the room (null, or an id or object no player holds) scores nothing. An action whose `points`
is 0 scores nothing and carries nothing.

- **The switch** (XR-04's hook filled): `useAction` calls `scoreObjective` once, beside `markUsed` and nowhere else; a
  second press is refused `used` before it, so the +2 is once a round, and the next round's `world.reset` clears the use.
- **The barrier** (`actionDied`): `blast()` keeps the ids `SceneHealth.blastAt` reports dead, `fire()` the destructible
  under the struck owner whose `hitAt` died; for each, every `EXECUTE_ACTION` of its program names an action whose
  points, when above 0 and the action unused this round, are marked used and scored to the actor -- the charge's owner
  or the blast's thrower (`thrower(f)`: none once that player left), the round's shooter
  (`ACTION_POINTS_ACTOR_READING`). The death's `EXECUTE_ACTION` runs in its program's timeless head, so the mark comes
  after the action started and never refuses it.
- **YOUR STATS**: `Player.primaryObjs` / `bonusObjs` are match counters as PF-26's five: zeroed in `resetMatch`, carried
  by a takeover's row (`TAKEOVER_ROW_READING`), and sent on `roundOver.stats` by `statsOf()` (no longer 0).
- **The team score**: a room field, zeroed with the round (`startRound`), sent additively as `score.teamScore` (protocol
  10 kept, PF.R33); nothing draws it and the respawn result (`endRound`, G25) does not read it yet
  (`TEAM_SCORE_READING`).
- **The bomb** (PF-14b, done 2026-10-05): the room's constructor subscribes three listeners on XR-05's `BombAuthority`
  beside nothing else -- `planted` scores `e.by` (the planter) `{kind:'plant'}`, `defused` the defuser `{kind:'defuse'}`,
  `detonated` the planter `{kind:'detonate'}` -- each through `scoreObjective`. The detonation's planter is the
  `Player` object the room kept at the plant (`bombPlanter`), never `e.by`: the bomb keeps a departed planter's seat id
  until its reset, and the server hands a freed id to the next page (`freeId`), so a newcomer seated on that id inside
  the fuse would otherwise take the +2, the primary objective and the carry -- the room's policy for projectiles
  (`thrower`: the same player, not a later one given its id). A planter who left scores no one (and adds no carry); a
  dead planter scores the detonation but adds no carry for itself; a takeover (`TAKEOVER_ROW_READING`) moves the kept
  object to the seat's new body in `seat`, beside its projectiles, so its detonation scores the new row. The events
  fire once per transition (`plant()`, `defuse()`, `detonate()` in `bomb.ts`); a re-sent `bomb` wire (a hold's begin or
  end, the round's reset, a late joiner's `welcome.objective`) is no event and scores nothing. Kinds by `statKind`
  (PF.R34): the plant and DEMOLITION's defuse bonus, the detonation primary.

Tests: `viewer/test/objectiveScore.test.ts` (the table, the carry, the kinds); `central/test/roundStats.test.ts` (the
switch on MP72 once a round, the next round, a takeover; the synthetic barrier -- Vigilance's geometry, Sujo's `points 2` -- opened by a charge, its owner
scoring and an owner who left scoring no one; `roundOver.stats` from the objective events). Registry
`round.score.action-points-once`, `round.score.team-carry`, `round.score.objective-stat-kind`,
`round.screens.your-stats-rows`. PF-14b: `central/test/roundStats.test.ts` "plant, defuse and detonation each +2 to their actor on a DEMOLITION map, the team carry counted per living teammate" (the flat DEMOLITION
map of XR-05's harness, `demolitionMap`: a SEAL's plant +2 bonus with the SEALs' carry 2, a Terrorist's defuse +2 bonus
with its carry 1 beside a dead teammate, a second round's plant +2 and -- the seat taken over inside the fuse -- the
detonation's +2 primary to the new row, a third round's planter leaving and a newcomer handed its id inside the fuse
scoring nothing, a fourth's planter leaving with no one on its id scoring no one; subscribing a listener twice, or
dropping the takeover's hand-over, turns it red). Registry
`round.score.plant`, `round.score.defuse`, `round.score.detonate`.

**Not done here.** A rifle round
that kills a destructible with an action scores its shooter by the same `actionDied`, but no map's destructible with an
action takes a round today (the access barriers' shield 17 is past every rifle), so no test holds that path. The original's
stat for an action's points is not traced. The rescue (+3) and the escortee kill (-2 / +3) of 192 s3.6 belong to modes
the room does not run.

## 6. Readings and placeholders

| Name | What it stands for | Settles it | Status |
|---|---|---|---|
| `PLANT_PLACEMENT_CANCEL_READING` | `'runs-to-completion'`: a release inside the 2.25 s placement does not cancel it; the planter's death or leave cancels it and drops the bomb (PF.R30) | capture B items 7b and 7c (research 213 s3) | in code: viewer `net/objective.ts`; open |
| `DECIDED_HOLD_BOMB_READING` | `'live through a decided hold'`: the room's bomb counts holds, pickups, drops, placements and the fuse in a decided round's hold too (`BombHost.live`, `phase` `play` or `decided`). The original's requests reach the host's state machine with no round test (`FUN_002c1f10` D:L164008-164043) and its commit holds while the game's state is 3 (`FUN_002c20c0` D:L164060-164100), which turns 4 / 6 only after the mission valve `success` / `failure` set at the hold's end (`FUN_002a9b30` D:L150662-150665), when the bomb is torn down (`FUN_002c1970` D:L150616); each transition scores (`FUN_002c1c30`); no detonation fits in a hold. DEMOLITION alone in the room (BREACH: LATER 149). *Was* `DECIDED_HOLD_BOMB_PLACEHOLDER` (LATER 143), replaced 2026-10-19 by LATER 145 | a capture of a pickup or a plant in a decided hold | reading, pending review |
| `DEM_SAME_TICK_READING` | `'events-first'`: the holds, the placement and the fuse run before the round's clock in a tick, so a plant ending on the clock's last tick stops the time-out and a defuse on the fuse's tick defuses (PF.R28) | capture B items 8 and 10 | in code: viewer `net/objective.ts`; open |
| `DEFUSE_CLOCK_HELD_READING` | `'held at the defuse'`: from a defuse to the round's end the room's clock holds at the fuse's remainder and every `score` says so (`clockHeld`, additive); the original's state-4 transition clears +0xf5 on every console (`FUN_002c1c30` D:L163937; clients via `FUN_002c23b0` D:L164158), the clock refreshes only while +0xf4 and +0xf5 are set (`FUN_002aa490` D:L151092), nothing in the round sets +0xf5 again (D:L163312-163318; the round's exit, D:L76135) (LATER 152) | a capture of a defuse | reading, pending review |
| `PLANTED_CLOCK_FUSE_READING` | `'the round clock restarts at the fuse'`: at a plant the room moves the round's end to the fuse's tick and tells every page (`roundTime`); the original's commit sets the game's clock length to the fuse and its base to now (`FUN_002c20c0` D:L164084-164088, `FUN_002a6ac0` D:L148964), the clock the HUD draws (`FUN_001f6b60`) and every console holds (GameState @0xc); the fuse ends with it (D:L164079-164080). *Was* `PLANTED_CLOCK_DISPLAY_READING` (note only), replaced 2026-10-19 by LATER 148 | capture B item 7 | reading, pending review |
| `DEFUSE_REACH_READING` | `'proximity'`: the defuse is taken within 15 / 20 u of the planted bomb's point, no reticle pick | capture B item 8 | in code: viewer `net/objective.ts`; open |
| `PLANT_REACH_READING` | `'aim-pick'` (re-filed 2026-11-02, PLANT-AIM): the plant on the reticle's pick of the tent's polygons, the reach 15 / 15 from the struck point (`FUN_005aa240` D:L463830-463905), re-picked every tick of the hold (`FUN_00594cf0` D:L453258-453264, `FUN_005920c0` D:L451495-451509), the page naming its pick, the room holding it to its newest look (s2, "The plant's pick"). *Was* `'proximity'`: the feet within 15 / 15 of the node's origin -- the r0001 stand-in, superseded | capture B item 7 (the plant from the reach's edge) | in code: viewer `net/objective.ts`, match `bomb.ts`, `room.ts`; reading, pending review |
| `PLANT_PICK_FIREPOINT_READING` (PLANT-AIM, 2026-11-02) | the plant's reach measured from the feet plus the stance's posed firepoint offset (`+0x14b0`, D:L463874-463881), research 217 §1.3's port-pose table, turned by the facing (`plantReachFrom`); the pistol's muzzle, an aimed clip and the other models not followed | an RDRAM read of `actor+0x14b0` standing, crouched and prone (research 217 §1.3), with capture B item 7 | in code: viewer `net/objective.ts`; reading, pending review |
| `DROP_AIM_READING` | -0.25 on the actor's +0x1450 read as the aim's sine (about 14.5 degrees down); what +0x1450 holds is untraced | capture B item 6 | in code: viewer `net/objective.ts`; open |
| `BOMB_GROUND_READING` | `'cellY'`: StartBomb at its AI cell's quantised height without the optional `FUN_00516920` correction; a dropped or planted bomb at the first surface a charge could rest on under the feet (`restsOn`, searched from 1 over the feet to 1000 u down, the room's own bounds `BOMB_FLOOR_LIFT` and `FLOOR_SEARCH` in `match/src/bomb.ts`). *2026-10-16, web sprint 40 AD-4:* `restsOn` is now the placement's accept test alone (VOLUMETRIC and LIQUID passed, no penetration test: `FUN_005c2430` D:L477228-477230), so the bomb lies on an ACTION, INVISIBLE_DI or ITEM face where it fell through one before; the placement's column and selector (`placeGround`) are not taken -- the original projects the bomb's model (`FUN_0059ddb0`), not read -- and StartBomb is never probed (`roomBomb.test.ts`, "AD-4"). *2026-11-01, B194:* the planted bomb no longer takes this search -- it lies on the ground under the right hand (`BOMB_PLANT_HAND_READING`, s2 "The plant's point"; reading B of two there); the dropped bomb and StartBomb still do | capture B items 5, 11 and 15 (RDRAM: the bomb node's position) | in code: viewer `net/objective.ts`; open |
| `BOMB_PLANT_HAND_READING` (B194, 2026-11-01) | rifle (2.603405, 6.207189, 1.431470), pistol (1.750641, 6.814781, 0.164585): the right hand's (`+0x300`, `rhand`) point, body frame, posed at `Place claymore`'s key 46.682 (`PLACEMENT_S` on the one-shot clock), where the room takes the plant's ground column (`FUN_005c2430` D:L477198-477211; s2 "The plant's point"). Unread: the clip's root travel in x and z (dropped by `writePose`), the timer's tick against the clip's key; reading A of two (B: the feet) | H371 (a capture of the right hand's world point at the placement's end, and whether Night Stalker's terrorist tent burns) | in code: match `bomb.ts`; open, reading pending review |
| `BLAST_SKIP_GROUP_READING` (B194, 2026-11-01) | `'healthy-group'` of `'healthy-group' \| 'target-subtree'`: the blast's reach gate passes the target's damage group -- the deepest destruction-program node holding the target below its root (`blastSkipPath`; `healthy` on the DEMOLITION bases) -- where the reading before took the target's own subtree (`FUN_003c80e0` D:L319104-319108; `FUN_002740e0` D:L121150-121158, D:L121212-121213 -> `FUN_003158b0` D:L215134-215166; the bound node not traced to a program reference). The fallback where the source does not settle it (s2 "The plant's point"): Night Stalker's terrorist base falls, every other DEMOLITION base unchanged | H371 (whether Night Stalker's terrorist tent burns), or the record's `+0x30` / byte `+1` node traced | in code: viewer `sceneHealth.ts`; open, reading pending review |
| `BOMB_RESULT_DELAY_READING` | 3 + 20 + 1 s after a defuse, 2 + 2 + 20 + 1 s after a detonation, as the script sums its WAITs (171 s7, 213 s2.4) | capture B items 8 and 9 (the result screen's timing) | in code: viewer `net/objective.ts`; open |
| `PICKUP_POINT_OFFSET_PLACEHOLDER` (OBF-17, 2026-10-30) | `[0, 0, 0]`: the automatic pickup's 3D reach (`pickupReach`, under 20) is measured from the feet. The original measures from the actor's position (`+0x1c`) plus `+0x14b0`, the posed `firepoint`'s offset (research 217 §1.3), or plus `DAT_003f64c0` (0, 0, 0) when that vector is zero (`FUN_005aa110` D:L463807-463814); the room poses no weapon, so it takes the zero branch. Standing, the posed muzzle is about 12.7 over the feet (research 217 §1.3), so the original likely reaches less far across and further down than the room. A weapon's offer (`PICKUP_REACH_READING`, `worldDrops.ts`) takes the same point through `FUN_005a9c70` (D:L463676-463683), and the room measures it from the feet as well | an RDRAM read of `actor+0x14b0` at a pickup (capture B item 5), standing, crouched and prone | in code: viewer `net/objective.ts`; open (placeholder) |
| `FIRST_REQUEST_WINS_READING` | two players reaching the bomb on one tick: the lower seat id (the host handles one request first, 193 s5) | capture B item 5 with two players | in code: viewer `net/objective.ts`; open |
| `MPBOMB_PLAYER_BLAST_PLACEHOLDER` (retired) | was `'none'`: the detonation hurts no player this sprint (PF.R32); MPBOMB's 50 / 30 u and `base_explosion1`'s overrides were untraced against a body. A visible deviation: the owner row H107 | capture B item 9 | retired 2026-10-16 (BOMB-DAMAGE): research 332 §1 reads the path to the body; `MPBOMB_BLAST_OWNER_READING` |
| `MPBOMB_BLAST_OWNER_READING` (cross-reference; the row is research 332 §6's) | `'victim'`: the detonation hurts the players in MPBOMB's reach, each the owner of his own hit -- friendly fire spares no one, a death is his own | capture B item 9 | open; in code since BOMB-DAMAGE (viewer `net/objective.ts`, server `room.ts`) |
| `DEFUSE_PROMPT_ICON_READING` | the defuse's prompt: `bomb_defuse`, the bomb record's own `action_MP_bomb.tif` (read 2026-11-02, LkPaioX5 part 2 (b), research 87 §5 "The action list"; reading, pending review: `FUN_002209c0` D:L74560-74586 -- the map action's icon only while `DAT_0044d4a0` is clear, the plant; the record's own with the node set, the defuse), captioned HudCLOC 60480 BOMB DEFUSAL. Deviation, not ported: D:L74586 copies the icon word onto itself, so after a plant on the same console every later defuse keeps the site's icon until `FUN_0021ded0` sets the records up again (the HUD's init, D:L57421); the port always draws `bomb_defuse`. Was: the generic `action_x.tif` (`ACTION_ICONS.action`), unread. The phase gate this row owed XR-06 is built: `BombPage.tick()` and `prompt()` answer only while the round is in play (s3) | capture B item 8 | in code: viewer `bombPage.ts`; open (reading) |
| `HOLD_PROGRESS_PLACEHOLDER` (XR-06) | `'pulse-only'`: the plant's and the defuse's 5 s hold drew no progress bar | -- | retired 2026-10-09 by PB-8 (s3, "The hold bar"): the original's bar read (`FUN_00220350` D:L74426-74443) and drawn for both holds |
| `HOLD_BAR_DIRECTION_READING` (PB-8) | `{ plant: 'fills', defuse: 'empties' }`: the fill over the seconds held when `DAT_0044d4a0` is 0, over the timer's seconds left otherwise (D:L74434-74436); `DAT_0044d4a0` read as the world bomb's node (`FUN_0059dab0` D:L457506-457509, D:L457536; cleared at the pickup, `FUN_005bbf10` D:L473669), absent while carried, the planted bomb during a defuse (s3) | capture B items 7 and 8 (the plant's and the defuse's frames) | in code: viewer `bombPage.ts`; open (reading, pending review) |
| `HOLD_BAR_PLACEMENT_READING` (PB-8) | `'ends-at-commit'`: the plant's bar fades at the commit (bit 5 cleared, `FUN_005920c0` D:L451516) and cannot return in the 2.25 s placement (`FUN_00594480` D:L452769 against the kit's +0x81c, 3.0 from `FUN_005be9a0` D:L475488); the defuse's box stays empty after its commit for 1.0 s (D:L451519-451524, D:L451520-451522; then the hold restarts, D:L452578-452587, D:L453267-453270) (s3) | capture B item 7 (the plant's frames) | in code: viewer `bombPage.ts`; open (reading, pending review) |
| `HOLD_BAR_OTHER_ACTION_READING` (PB-8) | another action at the head of the list hides the bar at once (D:L74484-74486); the port fades it on every end of the hold instead -- the defuse's prompt is type 7 (bit 4 only for a type-7 head, D:L74304-74307; a hold needs bit 4, D:L453256; `FUN_002209c0` D:L74562-74564), the drop's is not read; no constant | a read of the defuse's and the drop's action records' type; capture B item 8 | *note only*; open |
| `COMPASS_BASE_MARK_READING` (XR-06) | `'carrier-side'`: `ret_base` at the tent the carrier's side must reach, for that side while it carries the bomb; `ret_bomb` for everyone where the bomb lies (states 1 and 3); the marks beyond 200 u pinned at the rim as the nav marks are. The carried state's audience is settled (OT.R99 as amended 2026-11-02; reading, pending review, s3 "The compass while carried"): no `ret_bomb` on a carrier for any viewer (`FUN_005bbf10` D:L473680-473685, the one type-1 maker `FUN_0059dab0` D:L457516-457526). Still open: the other side's type-3 base mark (D:L473696-473699) and the planted bomb's mark (none in the original, D:L457516) -- s3's two findings | capture B (an enemy's compass while carried: its red base mark; any compass with the bomb planted) | in code: viewer `bombPage.ts`; open (the base's audience, the planted mark) |
| `OBJECTIVE_MARK_RGB_READING` (XR-06) | the bomb's and the base's marks in the nav marks' (32, 62, 32): `FUN_002126f0`'s table gives each type its RGB (87 s1.7), these two rows unread | a read of the table's two rows; capture B (the bomb on the compass) | in code: viewer `hud.ts`; open |
| `DEFUSE_TIMER_LAYOUT_READING` (XR-06) | `'round-timer-slot'`: the fuse's `"%02d:%02d"` in the round timer's place while it runs, the round's clock not drawn; no label ("MP DEFUSE BOMB" is TCM row 0x2e's, research 197 W2-R-05) | capture B item 8 (the defuse timer's first frame) | in code: viewer `hud.ts`; open |
| `BOMB_MODEL_READING` (XR-06) | `{ item: 154, model: 'Satchel', node: 'MPFootBomb' }`: item 154 (MPBOMB) has no `ModelName` in `zweapon.rdr`; `FUN_0059dab0` hangs the model libraries' "Satchel" at the bomb's point unturned (D:L457497-457506), the fittings' (`FLIB_MDL.ZED`) on the disc -- read 2026-10-07 (s3), pending review; was C4's placed model as a stand-in | capture B items 5 and 11 (the bomb on the ground: its look) | in code: viewer `bombPage.ts`; open (reading, pending review) |
| `TURRET_ACTION_BIT_READING` (XR-06; retired) | settled by the read (AD-6, 2026-10-16; reading, pending review): the mount is action 19 (0x80000, `FUN_005a88c0` D:L462999, set at `FUN_005937c0` D:L452472-452475) and the release action 20 (0x100000, `FUN_005a8850` D:L462973, set and returned at D:L452334-452338), the first two bits `FUN_0021f850` tests (D:L74050-74293), so `turret` heads `ACTION_CONTEXT_ORDER` and `ACTION_CONTEXT_BITS.turret` is [0x80000, 0x100000] (s4's table); was `'after-c4'`: the mount after C4 (0x40000) and before the drop (0x40), its bit unread | an original input trace (a turret beside a C4 target): the visible-parity check, owed | removed from viewer `actionContext.ts` 2026-10-16 (AD-6); retired |
| `ACTION_LIST_ROTATE_READING` (XR-06) | the picker's second input rotating the list (`FUN_0021d9d0` D:L73332-73386, `+0xedc` 3 the head to the tail, 2 the tail to the head) and the two more icons beside the head: the rotation built on main by research 303 (`ActionSelection`, `matchActions.lanes`: Cross held, a d-pad side's press; Left the head to the tail, Right the tail to the head, `0x00595320`), the side icons not; no constant | capture B (two contexts at once) | *note only*; resolved for the rotation by research 303 (2026-10-08), the side icons open |
| `JOIN_DECIDED_PHASE_READING` (XR-06, fix round) | `'clock-and-bomb'`: a joiner's round in play from the welcome (`startTick`, `waiting`, `countdown`, the bomb's result in `objective`) and the first `score` (`timeLeft` null: expired, over); an elimination's `decided` hold is indistinguishable from play on the wire, so a page joining in it shows the bomb's prompt until the `roundOver` | an additive `welcome.phase` from the room's `hello` (the online lane's section) | retired 2026-10-06 by ONL-18b (research 221 §6): the welcome's `phase`, read by `bombPage.ts` |
| `TCM_BOMB_ROW_READING` (XR-06) | the tactical command menu's row 0x2e ("MP DEFUSE BOMB", S:0x3e5ff8) in the bomb modes (research 197, 203: `FUN_0022fa90`): not built; no constant | a read of the row's command; the TCM's port | *note only*; open |
| `PLANT_SOUND_READING` (PB-1) | `'script-only'`: the plant makes no sound of its own; its sound is the `objectives` script's `switch_timer` at state 3. Read: MPBOMB's `FireAnimName` is `NOT FOUND`; the `Place claymore` clips have no `zanim_callback`; `FUN_005bc730` returns for the bomb on a network game (D:L473980-473984) before the `FireAnim` play (D:L474051-474059); no script sequence waits on the placement (s3) | capture B item 7 (the plant's frames, with their audio: the 5 s hold and the 2.25 s placement) | in code: viewer `bombPage.ts`; open (reading, reviewed 2026-10-09) |
| `DROP_CLIP_READING` (PB-1) | the drop's clip with +0x34 unread | +0x34 read as `CRemoteCtrl::IsRemote` (research 193 s12.6) | replaced 2026-10-09 (review F1) by the manual drop's clip, built (s3; its wire, `dropWhy`, landed 2026-11-03 by the online-parity sweep's P25), and `DEATH_DROP_CLIP_READING` |
| `DEATH_DROP_CLIP_READING` (PB-1, review F1) | the death drop's clip: the state-1 handler's push (`FUN_0059ddb0` D:L457606-457612) on the dead carrier's own console; `FUN_0057d540` pushes only with +0xe1 bit 4 set and the current action's +0x2b not 8 (D:L440342-440343), unread on a dead actor; the port plays no clip at a death drop (s3) | a read of +0xe1 bit 4 and of the death's action type at +0x2b; capture B (a carrier killed: his body's frames) | *note only*, in a comment of viewer `bombPage.ts`; open |
| `HOLD_LIVE_TICKS_PLACEHOLDER` (ACT-7) | 15 ticks: a hold stays live this long after its last command run; past it the hold pauses (not resets) until the next held command (ACT.R8 and the merge controller's ruling on its shape, 2026-10-08; s2; research 250 s7). Ratified at 15 over the 8 first named: a 5-fps page sends a frame every 12 ticks, and 15 covers it plus jitter. It cannot speed a hold (the hold counts ticks), only decide how long a stalled page keeps holding. A server tolerance, no game value: the original's console never stalls | the owner's number, or a measured frame-gap distribution of real pages | in code: server `bomb.ts`; open |

**Open question for the owner (PB-1 review F3; filed as H163 (`HUMAN_TASKS.md` section 16)): ROOM-AUTHORITY TIMING.** The room is the
bomb's authority (PF.R27), so what the original's carrier does locally at its own commit comes a round trip later on the
carrier's own page: the plant's clip and the movement lock it brings (`walk.hold`; the original pushes them at the
commit, `FUN_005be9a0` D:L475480-475481), and the own satchel's hide at a drop and at a plant (the original hides it
locally and at once: the dropper right after sending, in the same call, `FUN_0059dd30` D:L457567 then D:L457568-457570;
the planter before its send, `FUN_005bc730` D:L473974 then D:L473982). Whether to predict them on the page as the
hold is predicted (and undo a prediction the room refuses) is a ruling, not a reading; the port follows the room's word
until the owner rules. No constant.

No value is given for the carrier's speed or the satchel's weight: the sources read give none, and the room changes
neither. The plant's animation is read (PB-1, 2026-10-09: `Place claymore`, `FUN_005be9a0` D:L475480-475481; s3), so
no clip reading is named for it.
| `OBJECTIVE_STAT_KIND_READING` (`viewer/src/net/objectiveScore.ts`) | `'detonate-and-breach-defuse-primary'`: the detonation and BREACH's defuse count a primary objective (YOUR STATS +0x576), the plant, a defuse off BREACH and an action's points a bonus one (+0x578) -- ruled PF.R34 from the stats the functions write (+0x1a/+0x32 against +0x38/+0x36); the round block's offsets behind +0x576 / +0x578 are not traced | capture B item 9 (a GAME COMPLETE frame after a Crossroads match with a plant and a switch); a read of the writers of +0x576 / +0x578 | open |
| `ACTION_POINTS_ACTOR_READING` (`viewer/src/net/objectiveScore.ts`; `match/src/room.ts` `actionDied`) | `'charge-owner'`: an action with points a destructible's death runs (a Breach map's access actions, e.g. MP61 Sujo's six; Vigilance's carry none) scores the charge's owner or the blast's thrower, a round's shooter; none when the owner left. `FUN_00545530`'s callers take the actor from the action message (193 s3), which a death's chain does not name | capture A on MP61 Sujo (an access barrier opened by C4: whose score moves by 2); a read of the death chain's actor through `FUN_002b4d80` | open |
| `TEAM_SCORE_READING` (`viewer/src/net/objectiveScore.ts`; `match/src/room.ts` `teamScore`) | `'per-round'`: the carry accumulates in the room's `teamScore` per side, zeroed with the round, sent as the additive `score.teamScore`; nothing draws it and the room's respawn result does not read it (G25) | a read of where the game zeroes +0x7c / +0x80; G25's respawn compare when respawn returns | open |

## 7. Wired (wave 4)

Sprint 27's one `main.ts` window (the controller's) did s4's "wiring owed", with XR-04's and MAP-10b's (215 s6). No new
reading: every value below is s4's, 213 s4's or 215 s6's. The tables live in `viewer/src/actionWiring.ts`, tested
headless (`viewer/test/actionWiring.test.ts`); `main.ts` lends the pages.

- **One lifecycle.** `walk.setActionFilter(() => wiring.filter())` replaces `doors.action() || grenade.plantC4()`. `pick`
  is `pickContext(actionInputs(...))`: the bomb's `prompt()` split into `bombPlant` (`bomb`), `bombDefuse`
  (`DEFUSE_PROMPT_ICON_READING`) and `bombDrop` (`bomb_drop`); `door` `doors.target()`, `switch` `actions.target()`, `c4`
  `grenade.c4Target()`, `turret` `turrets.prompt()`, `traversal` the climb prompt visible or on a ladder (the slide) --
  asked lazily in the picker's order. Nothing while dead, off the walk or locked; while mounted the turret alone (the room
  drops a mounted seat's `door`, `action`, `throw` and `bombAction`: `mountedRefused`, 215 s6). `fire`: `door`
  `doors.action()`, `switch` `actions.action()`, `bombDrop` the `bombAction` drop's send, `c4` `grenade.plantC4()`,
  `turret` `turrets.action()`; the traversal is the walk's own action (the moves' climb or slide).
- **The edges.** `padFrame` gives Cross's press, its hold each frame, and its release -- which fires the context at once,
  before `traversal.padLanes` asks the walk's action, whose filter is then told whether a page took it (a hold's release
  and a cancelled one are taken: no climb, no `Button.Action`). The walk asks no filter while locked, so a mounted
  dismount is fired by the release alone. The development keyboard's X gives the same edges in the capture phase, before
  `TraversalPage`'s keyup. A bare action (the hook's `action`, no press seen) fires the context in reach now.
- **The cancels.** `holdTouch(lane, down, how)` passes `how`: the action lane's `cancel` is `cancel('touch')`. `PadWatch`'s
  `cancel` is `cancel('padLost')` (`pads.poll` already ran before `traversal.padLanes`). The ARMORY's opening (`armory`),
  WEAPON EXCHANGE's or the R2 inventory's (`menu`) -- on the frame it opens, before the lanes -- the local death
  (`NetPage`'s `died`: `death`) and the window's blur (`blur`). Each is `lifecycle.cancel(cause)` then
  `traversal.cancelAction()`, which calls `walk.cancelAction()`.
- **The pages.** `ActionPage`, `TurretPage` and `BombPage` follow one `RoomEvents` relay, which `connectNet` points at each
  new client (the offline loopback's too) after resetting the pages with a bare welcome: no bomb, no turret held after a
  map change. A reconnect's client (`NetPage.retry`, inside `net.frame`) is followed right after that call, before its
  socket's first event. `nearby:` is `actionPromptOf(pick(), ...)` -- `contextPrompt`, the switch's bitmap from `actions.prompt()`,
  the turret's mount or dismount from `turrets.prompt()`. The world's `call` hook plays the effect at the program's root
  (`pageWorld.placeOf(path)`, XR-04). `bomb.hudFrame()` and `turrets.frame()` once a frame; `bomb.tick` once a command,
  off the command's own `Button.ActionHeld` (`observeCommands` wraps the walk's net tap), whose stick and pitch are also
  the drop's gate (`BombPageDeps.look`: the room's `canDrop` reads the last command run).

## 8. The plant's two animations: `BombPlace` and `Place claymore` (PARITY-2 PAR-40, 2026-10-11)

*Reading, reviewed 2026-10-11 (PASS WITH FINDINGS, high; its three findings folded in below)* (a reader's source inspection of the game ELF's decompilation, for PARITY-2's PAR-40, which
answers research 270 §2; plus a read-only byte search of the disc's archives for the name; nothing measured running).
**The SEAL's body plays `Place claymore` at a plant** (its pistol pair with the sidearm in hand), as PB-1 read;
**`BombPlace` is not a body clip but a zAnim program** -- a scripted world animation -- and the original starts both at
the plant's commit, on different layers. Research 270 §2's gap is not an either/or. `PLANT_ANIM` (`bombPage.ts:104`)
stays.

- *The record and its consumer.* `FUN_002b4f40` (D:L157264-157427) loads each map action: the node (D:L157292), the
  first `anim` name resolved through `FUN_0026a250` on the zAnim manager at 0x414bb0 (D:L157297; the rest appended at
  D:L157380-157402, into the vector at action +0x04/+0x08/+0x0c), the valve +0x18 (D:L157300-157301), bitmap +0x28
  (D:L157288), descriptor +0x2c (D:L157318-157320; the prompt, `FUN_002b4760` D:L156898), range and elevation +0x1c/+0x20
  (D:L157290-157291, D:L157314-157315), `no_netlog` +0x3f bit 0 (D:L157322-157324), `one_shot` bit 3 (D:L157326-157328),
  points +0x38 (D:L157330), type +0x24 (D:L157331-157371), the team mask +0x30 (D:L157405-157418), the id +0x3c
  (D:L157310); the constructor `FUN_002b49f0` (D:L157042-157069). 0x414bb0 is the zAnim manager (`FUN_0026a8e0`
  registers the zAnim commands on it, D:L106865ff, and `EXECUTE_ACTION`, D:L156676; `FUN_0026a250`, D:L114999ff, finds
  an animation by name over the loaded zAnim sets): the record's anims are **zAnim animations**, not motion clips. The
  consumer `FUN_002b44e0` (D:L156787-156866) takes entry `param_3` (entry 0 when out of range, D:L156801-156810),
  starts it through `FUN_00272bb0` (D:L156826-156838) with the action's node (tag 3, +0x14), its valve (tag 4, +0x18)
  and the actor's +0x3b0 (tag 1), keeps the instance at +0x10 and refuses a second start while it runs (D:L156798); on
  a network game a local actor's net-logged start is sent (`FUN_002bb5b0`, D:L156845-156855) and replayed on the remote
  actor (`FUN_002bb310`, D:L160525-160543).
- *The plant's path.* The 5.0 s hold armed on an MPBOMB action's node (D:L453257-453265), counted by `FUN_005920c0`
  (D:L451493-451507); at its end, for the plant (+0x158 == 0, type 4, the bomb state `DAT_004413b0` != 3), in order:
  `FUN_002b44e0(action, actor, 0)` -- the record's anim 0, `BombPlace` (D:L451513) -- then `FUN_005c0020(1.0,
  DAT_00650678, actor+0x5e0, 0x9a)` (D:L451514; 0x9a the held item's id, the MPBOMB, item 154, `bombPage.ts:85`) into
  `FUN_005be9a0` (D:L475994), whose item-0x9a branch pushes
  `FUN_0057d540(actor, DAT_003deb48, 0)` (D:L475480-475481) and arms 2.25 s (D:L475483-475486). `DAT_003deb48` is set by
  `FUN_005e4f90(0x661628)` (D:L495216), the string `Place claymore`; its pistol pair 0x661640 `Pistol place claymore`
  (D:L494772). Nothing between D:L451514 and D:L475481 reads the record's anim vector: the held item's id selects the
  branch, which pushes the action type `DAT_003deb48`. **The push is gated** (D:L475980-475994): a slot holding item
  0x9a with a count above 0 (`FUN_005c8a20`, D:L481350-481387), `FUN_005a7de0`'s stance and animation gate
  (D:L462612ff), +0x81c <= 0 and `FUN_005bd530`; any failing runs `FUN_005c4b10` instead (D:L475990) and pushes no
  `Place claymore`, while `BombPlace` has already started (its return ignored, D:L451513). The plant branch's own
  conditions include `FUN_00594350` (D:L451509) beside +0x158 == 0, type 4 and `DAT_004413b0` != 3. The generic use path skips MPBOMB (`type != 4`, D:L452016-452018, and D:L81235), so the record's anim starts
  only at the hold's end. The defuse branch (state 3) calls `FUN_0059da80`, which sends bomb event 4 (D:L457467) and
  starts no anim.
- *What `BombPlace` is* (the disc, a read-only byte search). Absent from the ELF's strings and from `READERC.ZAR`
  (`animset.rdr`, `motion.rdr`), `MOTION_P.ZAR`, `MPZANIM.ZAR`, `EXTZANIM.ZAR`, `UIZANIM.ZAR` and `ZWEAPON.ZAR`; present
  only in nine DEMOLITION maps' archives, each with an action record (MP1, MP7, MP9, MP12, MP61, MP62, MP72, MP73,
  MP83) -- in MP72 once in `actions.rdr` (byte 7101, the record `node terrorist_tent`, `valve mp_bombAA`, `anim
  BombPlace`, `type MPBOMB`, no `no_netlog`, so net-logged) and once in the zAnim name table (byte 11318304) -- and once
  in MP52 (an Escort map), at byte 12340919 in a zAnim name table beside `escort_success`, with no action record: a stray
  Demolition template (research 172:72, 124:121), not a plant. A map-only zAnim animation; the port's
  doors already treat records' anims as zAnim programs (`doors.ts:79-89`, the port's corroboration only).
- *A lead, low confidence (not a reading):* MP72's name table follows `BombPlace` with `seq_0`, `deactivate`,
  `defusebomb anim set` and `Seal anim set`; research 174:66 (unreviewed there) says it "handles defuse ... after the
  actor commands". The defuse's body clips are never pushed by code: `Defusebomb begin/loop/end` (`DAT_003def10/20/30`,
  D:L495337-495341) are only paired (D:L494787-494789) and flagged (D:L494935-494948); the `defusebomb anim set` is
  recorded (`FUN_005e3ff0` D:L496061-496063) and compared against actor+0x528 (D:L443877, 444117, 444639, 444833,
  445199, 463273); an anim set changes by name in the zAnim tick (`FUN_005d1e00` -> `FUN_0058c4b0`, D:L486555). So the
  defuse's body clips are data-driven, very likely by `BombPlace`.
- **Unread:** `BombPlace`'s own commands -- whether its plant branch sends actor commands to the planter (which would
  change what the body shows during the place), and whether `FUN_00272c30` runs a zAnim's first commands inside the
  start call (which decides whether such a command lands before the push at D:L451514). Settled by decoding
  `BombPlace`'s `Seq_Data` in MP72's `MZANIM.ZAR` through the repository's `parseAnimSets` / `decodeEffectProgram`
  (SETANIMSET 0x219, `ai::ANIMATE`, VALVE), or by capture B item 7.
- **The port:** `PLANT_ANIM` is right as read; **the port never runs the record's `BombPlace` at the plant** (nothing
  executes the MPBOMB record's `anims[0]` at the hold's end) -- PARITY-2's PAR-42; the decode is PAR-43.

## 9. `BombPlace`'s commands (PARITY-2 PAR-43, 2026-10-11)

*Reading, pending review* (the program read off the disc through the repository's readers -- `parseAnimSets` and
`decodeEffectProgram` on each map's `MZANIM.ZAR`, the set-2 payloads at the offsets their parsers write -- checked over
every map that holds it; what each command does from the decompilation, cited; nothing measured running). Test:
`scene/test/bombPlace.parity.test.ts` (MP72's fixture always; the other maps under `SOCOM_DISC`, else
`<SOCOM_PC_ROOT>/game/disc`) and `tools/test/bombPlaceTypeIds.test.ts` (ANIMATE's type ids through the ELF, whose
reader is the tools package's); each skip names its cause. Settles §8's "Unread" item.

**In one line:** at the plant `BombPlace` does nothing. Its start-up sequence tests `mp_bomb == 3`, which the plant's own
gate makes false. Its second sequence is the **defuse's body script**: a walk ordered to 18 u from the bomb's node, the
`defusebomb anim set`, begin / loop / end, back to `Seal anim set`, then `mp_bomb = 4`. That sequence runs only when the
program starts with the bomb planted, and no online path read so far starts it then.

- *The program* (MP72 `MZANIM.ZAR`, set `mission`, animation `BombPlace`). `Anim_Params`: name index 1, root node 0,
  paused 0, state 1, flags 0xa2, timer 0, priority 3, the four sequence offsets 0. Name table `NA`, `BombPlace`,
  `seq_0`, `mp_bomb`, `deactivate`, `defusebomb anim set`, `Seal anim set`. No node references, no `Anim_Health`.
  - `seq_0` (byte 0, 68 bytes; word 0x102, activation 1: it runs at the start): `IF` (VALVE `mp_bomb` == 3), then
    `CALL_SEQUENCE deactivate`, then `ENDIF`. It has no `LOOP` or `WHILE`, so the test is made once.
  - `deactivate` (byte 68, 328 bytes; word 0x104, activation 2: it runs only when called), its ten commands in order:
    `ai::MOVE`; `ai::SETANIMSET` `defusebomb anim set`; QUAD_ALIGN; `ai::ANIMATE` 0x111; QUAD_ALIGN; `ai::ANIMATE` 1;
    QUAD_ALIGN; `ai::ANIMATE` 0x115; `ai::SETANIMSET` `Seal anim set`; VALVE `mp_bomb` = 4 (op 0x0b, set).
    `decodeEffectProgram` drops the QUAD_ALIGNs and leaves the six set-2 commands as `other` (`set 2 cmd 16 / 25 / 20`).
- *Every map that holds it.* MP1, MP7, MP9, MP12, MP61, MP62, MP73 and MP83 hold it byte for byte as MP72: the
  parameters, the name table and every command's bytes. MP52's stray copy (§8) matches too. It is one program for every
  Demolition map.
- *The set-2 commands, named.* A command's high byte is its namespace. `FUN_0026a8e0` splits a name at `::`
  (D:L115284-115290) and returns the namespace's index with the command's index in it (D:L115293-115295). A new
  namespace gets `Reserved` at index 0 (`FUN_0026ac20`, D:L115421). The ids are therefore set 0 the base (`QUAD_ALIGN` 1,
  as `effects.ts` has it), set 1 `ui` (D:L106923-106924), and set 2 `ai` (`FUN_005de320`, D:L493405-493471: COMM 1 ...
  MOVE 16, ANIMATE 20, SELECT 23, SETANIMSET 25 ... WAIT 34). That is research 189 §6 and §12's 0x219 SETANIMSET, and
  research 199 §6's MOVE 16 / ANIMATE 20 on the doors. The ANIMATE ids are anim types: `FUN_005e5000` (D:L487511) maps a
  name through the type map, the same lookup `FUN_005e4f90` makes for `Place claymore`. Ids 0 to 0x88 are the ELF's
  static table at 0x661060 (`DAT_0066b800 = 0x89`, D:L495452; D:L495478-495487), so 1 is `Stand`. `FUN_005e3ff0` then
  numbers each type name `animset.rdr` adds, set by set and entry by entry, from 0x89 (D:L496203-496214). Walked over
  the disc's `animset.rdr`, that gives 0x111 `Defusebomb begin`, 0x112 `Pistol defusebomb begin`, 0x113 `Defusebomb
  loop`, 0x114 `Pistol defusebomb loop` and 0x115 `Defusebomb end`. The data's two ids both landing on the begin and
  the end is the walk's own check.
- *The contexts.* `FUN_002b44e0` starts the program with tag 3 the record's node (+0x14), tag 4 its valve (+0x18) and
  tag 1 the actor's +0x3b0 (`FUN_00272bb0`, D:L156826-156838; `FUN_00272c30` stores each by its tag, D:L120417-120515).
  Actor +0x3b0 is a 16-byte self-select record that `FUN_00599f00` makes for each actor (D:L455777-455778): SELECT's
  id, with the actor at +0xc (`FUN_005d29f0`, D:L486826-486851). Every `ai::` handler walks the tag-1 contexts
  (`FUN_002720e0`, D:L119837-119870) for the one whose u16 is SELECT's id (`DAT_0066b7e8`, D:L493450), and takes the
  `select`-th. All six commands carry `select` 0 (+4), so they act on the actor that started the program.

**1. The commands, in order, with their arguments and targets** (fields at their parsers' offsets):

| # | command | arguments | acts on |
|---|---|---|---|
| seq_0 | `IF` VALVE `mp_bomb` == 3 | the condition's flag byte 2: the valve by name, not the context valve | the global valve `mp_bomb` |
| seq_0 | `CALL_SEQUENCE` | `deactivate` (name index 4) | the program |
| 1 | `ai::MOVE` (parser `FUN_005d64b0` D:L488996-489058) | mode 1 `node` (+0x28 low nibble; not `blocking`, bit 5 clear), node 0xfa (+0x24), `dist` 18.0 (+0x20), `pos` (0, 0, 0) (+8), `dir` (0, 0, -1) (+0x14; only mode 4 reads it, D:L488797) | the actor (tag 1); the point from the node (tag 3) |
| 2 | `ai::SETANIMSET` (parser `FUN_005d2310` D:L486568-486613) | `defusebomb anim set` (+0xc), flags 0 (neither `bored` nor `default`), no `entity` | the actor |
| 3 | `ai::ANIMATE` (parser `FUN_005d3c80` D:L487461-487553) | type 0x111 `Defusebomb begin` (+0x30, one type at +0x20), `prewait` 0, `postwait` 1.8 s (+0x10; no random range at +0x14), flags 0 (not `blocking`, not `skip_end`) | the actor |
| 4 | `ai::ANIMATE` | type 1 `Stand`, `postwait` 8.4 s | the actor |
| 5 | `ai::ANIMATE` | type 0x115 `Defusebomb end`, `postwait` 1.7 s | the actor |
| 6 | `ai::SETANIMSET` | `Seal anim set` | the actor |
| 7 | VALVE | `mp_bomb` = 4 (op 0x0b, by name; flag bit 0 clear) | the global valve `mp_bomb` |

What they do, from the handlers:
- **MOVE** (begin `FUN_005d5d00` D:L488725-488994). Mode 1 resolves node 0xfa through `FUN_0026f4e0` (D:L118163-118167)
  to the first tag-3 context (`FUN_00272390`, D:L119943-119975): the record's node, the tent. It takes the node's world
  point and the flat direction from it to the actor. The goal is the point 18 u from the node towards the actor, facing
  the node (D:L488938-488961). The order goes to the actor's controller (`FUN_0056daa0` at 3.0, `FUN_0056d920`,
  D:L488972-488977). Not `blocking`, its tick (`FUN_005d5b40`, D:L488660-488722) returns done at once: the walk is
  ordered, not waited for, and the next commands run while it goes on.
- **SETANIMSET** (tick `FUN_005d1e00`, D:L486396-486566) calls `FUN_0058c4b0(actor, name)` (D:L486555): the actor's anim
  set by name, the call §8 found.
- **ANIMATE** (begin `FUN_005d3740` D:L487286-487458, tick `FUN_005d2f30` D:L487009-487284). The begin draws the
  pre-wait and the post-wait (D:L487443, D:L487452). Phase 0 counts the pre-wait (D:L487270-487275). Phase 1 pushes the
  type on the actor through `FUN_00588bc0(actor, type, +0x21, 0, 0)` unless it is the current one (D:L487256-487260; the
  special cases at D:L487212 and D:L487250 are other types). Then, not `blocking`, phase 3 counts the post-wait and ends
  (D:L487188-487190). **The post-waits are the script's timing, not the clips' lengths**: 1.8 + 8.4 + 1.7 = 11.9 s from
  the first ANIMATE to the set's restore. In the `defusebomb anim set` the types name `seal_defusebomb_begin`,
  `seal_defusebomb_loop` (as `Stand`) and `seal_defusebomb_end`, and the pistol types their `seal_p_` pairs; the set
  includes `GLOBAL` (`animset.rdr`).
- The ANIMATE byte +0x21, passed as `FUN_00588bc0`'s third argument (D:L487194), is 0 on all three. The parser's default
  0x0b (`FUN_005d3f00`) and its `stance` keyword write +0x22 (D:L487519-487530), which the begin clears as the phase
  (D:L487454). The tick reads 0x0b at +0x21 as "use the actor's +0x174" (D:L487195-487196), but the parser's 0x0b
  default lands at +0x22, so the disc's stance argument is a literal 0. That is as read, and what stance 0 is is not
  interpreted here.

**2. The actor commands.** Yes: six `ai::` commands act on the actor who started the program. They are `ai::MOVE`, two
`ai::SETANIMSET` (0x219) and three `ai::ANIMATE` (0x214). **None runs at the plant**: they are all in `deactivate`,
and only `seq_0`'s `mp_bomb == 3` reaches it. The plant's start is gated on the bomb state `DAT_004413b0` != 3
(D:L451512-451513). `mp_bomb` is that state: the valve is made from the name `mp_bomb` by `FUN_002c1a80` (D:L163865-163866)
and by `FUN_002c2590` (D:L164214), and `FUN_002c1c30` writes each new state into it as it sets `DAT_004413b0`
(D:L163966, D:L163975). The bomb is carried, so 2, until
the placement's state 3 (§3). An `IF` whose condition is false skips to its `ENDIF` (`FUN_0025e7a0`, D:L108201ff). The
program therefore ends after its first sequence, having changed nothing: no body clip, no anim set, no valve. The body
at the plant is `Place claymore` alone (§8, `PLANT_ANIM`). **The `defusebomb anim set` is set by `BombPlace`**, in
`deactivate`. That is the defuse's body clips, data-driven, as §8's lead guessed, but behind the planted-bomb gate.
The online defuse at the hold's end (state 3) calls `FUN_0059da80` and starts no anim (D:L451519-451523), so no read
online path runs `deactivate`. The other starters of a record's anim are the generic use, which skips type 4 (D:L81236,
D:L452018); item 0x98's use (D:L452207, not the bomb); the network replay (`FUN_002bb310`, D:L160525-160543); and an
AI controller's action use (`FUN_005efa50`, D:L502654). Whether that last one ever starts an MPBOMB record (a defusing
AI, single player) is not read.

**3. The valve and the node.** The record's valve (tag 4, `mp_bombAA` / `mp_bombBB`) is never read or written: the IF and
the VALVE both name the global `mp_bomb` (flag byte 2, bit 0 clear; `valveOf` in `effects.ts`). The node (tag 3) is used
only by `ai::MOVE`, as the point the defuser is sent to. Nothing shows a model, plays a sound, draws an effect or calls
another animation: the program has no OBJECT_*, SOUND, PARTICLE_SOURCE, LIGHT, CALL_ANIMATION or node references. The
satchel's model, the sounds and the result stay with `FUN_0059dab0` and the `objectives` script (§3). The final
`mp_bomb = 4` is the defused state: what `defuse` (@1960) waits on (§3's table).

**4. What gates its branches.** One gate: `seq_0`'s `mp_bomb == 3` when the program starts, made once. There is no
`ELSE`. `deactivate` has no test of its own. Nothing reads `seq_0` against `deactivate` beyond the activation words
(1: at the start; 2: on a call). The record's `one_shot` and the refusal of a second start while one runs (D:L156798)
are §8's. Whether the plant's instance, its `seq_0` done and `deactivate` never called, still counts as running is
**unread**: `FUN_00270e40`, the check behind D:L156798, scans the instance's sequence slots (D:L119087-119121), and
whether an uncalled sequence's slot reads as live there is not traced. That decides whether the plant's start refuses
a later start of the same record (PAR-42's "refused while one runs"); an open item for PAR-42, no constant named.

- *The start's own ticking* (PAR-43's other question: whether `FUN_00272c30` runs a program's first commands within
  the start): at the plant this is moot. `seq_0`'s only effect is a test that fails, so nothing can land before the
  body push at D:L451514 either way. `FUN_002734b0`, called at the start's end (D:L120619), is not read. On a remote
  console the replay starts the program when the start's message arrives (`FUN_002bb310`). The planter sends the
  start at the commit (D:L156845-156855), before the placement's state 3, so the test fails there too unless the
  messages arrive out of order. That is not traced on the wire, and no constant is named for it.

**What PAR-42 must port.** At the plant the port must do what the original's `BombPlace` does: nothing visible. Starting
the record's anim 0 at the commit, with the refusal while it runs and the net-logged replay, keeps the structure but
changes nothing on screen, because the port's runners do not run set-2 commands. `PLANT_ANIM` (`Place claymore`)
stays the plant's only body clip. PAR-42 may therefore be cut to that structure alone, or closed with this reading, for
the controller to rule. The defuse's body script is a separate row, if one is wanted. It would need the
`defusebomb anim set` clips, the 18 u walk and the 11.9 s timing on the defuser, together with a source for its
trigger online. None of that is read, and the original's online defuse shows none of it on the paths read; capture B
item 8 settles it.

**Placeholders:** none named. Proven by: capture B item 7 (the plant's frames: no defuse clip, no walk) and item 8
(the defuser's body during the 5 s hold).
