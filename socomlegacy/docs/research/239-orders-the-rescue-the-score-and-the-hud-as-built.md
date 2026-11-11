# 239 -- Orders, the rescue, the score and the HUD as built (web sprint 31, HX-4a and HX-5)

- Date: 2026-10-06 (web sprint 31, "HOSTAGE on Desert Glory"; plan `docs/plans/2026-10-06-hostage-and-modes.md`). HX-4a
  opens the note: the orders (§1), the bookkeeping (§2), the wire (§3), the first half of the wiring owed (§7.1), its
  readings (§8) and its owed rows (§9, the room half's hunks in §9.1). HX-5 writes §4-§6, §7.2, its §8 rows and §9 rows
  (merged into this file 2026-10-06 on `agent/hx5`, over the lane with HX-4a's room half).
- Status: **reading, pending review.** Every value below is a read of the decompilation (`D:L<n>` of
  `socom2_game.elf.decomp.c` r0001), re-read at the decomp by HX-4a's implementer on 2026-10-06 (`FUN_00591dc0`
  D:L451386-451452, `FUN_00590bc0` D:L450728-450738, `FUN_00591770` D:L451228-451242, `FUN_00591ab0` D:L451272-451290,
  `FUN_00593500` D:L452225-452251, `FUN_00593d00` D:L452482-452498, OnCommand `FUN_0058fbe0` cases 4 and 5
  D:L450346-450410 and D:L450465-450540, `FUN_005fcf10` / `FUN_005fd010` D:L509476-509527, `FUN_005e8060`
  D:L498341-498463, the aim pick `FUN_005aa6e0` D:L464120-464192), or disc data (the materials, the HUD bitmap). Research
  189, 191, 199 and 207 are "reading, pending review -- not adopted" (their L6): their PROVEN / STRONG map to reading /
  reading with a step (research 206). **No hostage behaviour has been measured on a running console** (207 L20-21):
  nothing here is parity; capture C2 is the last gate.
- Sources: research [189](189-h1-hostage-ai-animation.md) §3, §14.6-§14.8, §14.12, §14.14 (the order path, its V2
  corrections, Harry's labels, the leader's death, the Terrorist lead, the rescued re-order);
  [191](191-h3-hostage-net-sync.md) §2.1-§2.2, §2.5, §3.3, §7.2-§7.3, §12.4 (the forward, the host's handler, the
  messages); [199](199-h4-hostage-closures.md) §1 (the stack and the double credit), §5 and §12.6 (the release and the
  UnitTick), §6 and §12.7 (the bars); [207](207-hostage-mode-desert-glory.md) §4.2, §8.3;
  [238](238-the-hostage-as-built-the-body-and-the-ai.md) §2.5-§2.6 (HX-3's hooks and its review note: YES and unit 17
  whatever `hold()` returns). Rulings HX.R3 (no side check), HX.R4 (never stranded), HX.R5 (the rescued re-order
  copied), HX.R7 (the wire), HX.R8 (the pages) -- proposed.
- Code (HX-4a): `packages/viewer/src/net/hostageOrder.ts` (new: the issuer's console's test, shared by the room and the
  page -- `orderTestRefusal`, `crosshairPick`, `aimPickBlocks`, `pickSurfaces`, `cellDistance`, `unitOfSeat`, the
  readings); `packages/match/src/hostageOrders.ts` (new: `orderRefusal`, `HostageLeaders`, `createOrderedHostage`,
  `follow`, `hold`, `onCommand`, `releaseLeader`, `unitTick`, the readings); `packages/viewer/src/hostagePage.ts` (new:
  `HostagePage`, the prompts); `packages/viewer/src/netPage.ts` (`hostageOrder`, the YES on a unit change, the
  `hostageState` case and the two optional deps); `packages/viewer/src/net/protocol.ts` (`hostageOrder`; HX-1's
  `HostageStateWire` and `hostageState`, the `unit` documented); `actionContext.ts` / `actionWiring.ts` (the `escortee`
  context); `hud.ts` (the `escortee` prompt), `hudAssets.ts` (`action_escortee.tif`); `remotePlayers.ts` (`aimBodies`);
  `loadMap.ts` (`aiMapsFromBytes` exported; the page reads W0's `LoadedMap.ai`); `@s2u/scene` `aimaps.ts` (`AiGrid`, `aiCellOf` widened to it).
- Tests (HX-4a): `packages/match/test/hostageOrders.test.ts` (new, pure), `packages/viewer/test/hostagePage.test.ts`
  (new, headless; one case on the MP6 fixture), `netPageGame.test.ts` (the send and the YES), `remoteAim.test.ts`
  (`aimBodies`), `actionContext.test.ts` (the order with `escortee`), `hud.parity.test.ts` (the pin gains
  `action_escortee.tif`); `packages/central/test/roomHostageOrders.test.ts` (new: the room half's four cases as
  `it.todo`, wave 3).
- Status (HX-5): **reading, pending review.** Every value below is a read of the decompilation (`D:L<n>` of
  `socom2_game.elf.decomp.c` r0001), re-read at the decomp by HX-5's implementer on 2026-10-06 (`FUN_0056f970`
  D:L432926-432985, `FUN_00545480` D:L411554-411572, `FUN_00545390` D:L411524-411547, `FUN_00544d60`
  D:L411240-411300, `FUN_00224d10` D:L76467-76576 and its call D:L76026, `FUN_0022be20`'s caption switch
  D:L79744-79758 with the strings 0x3e5810-0x3e5850, `FUN_002126f0`'s colour table D:L68670-68705, `FUN_00211510`'s pulse
  D:L68043-68050 and its alpha D:L68126-68130), or disc data (MP6's `objectives` script, decoded off the fixture by
  `decodeEffectProgram` on 2026-10-06; the HUD2 bitmaps). Research 189, 190, 191, 199 and 207 are "reading, pending
  review -- not adopted" (their L6): their PROVEN / STRONG map to reading / reading with a step (research 206). **No
  hostage behaviour has been measured on a running console** (207 L20-21): nothing here is parity; capture C2 is the
  last gate.
- Sources (HX-5): research [190](190-h2-hostage-mode-rules-map.md) §1 #19, §3.2 B2, §4 (C, C1-C5), §6 D, A1 and U6/U9;
  [191](191-h3-hostage-net-sync.md) §2.4; [199](199-h4-hostage-closures.md) §1-§2 (the double credit and the double
  count); [87](87-hud.md) §1.7, §10, §12; [216](216-the-round-screens-from-readerx.md) (YOUR STATS); [237](237-extraction-as-built.md)
  §1-§3 (the zone test, the valves, the chain); [238](238-the-hostage-as-built-the-body-and-the-ai.md) §2 (`rescue`, the
  fade). Rulings HX.R3 (no side check), HX.R5 (the two quirks copied), HX.R6 (the script's rules), HX.R7 (the wire),
  HX.R8 (the pages) -- proposed.
- Code (HX-5): `packages/match/src/extraction.ts` (the rescue test `rescueTest`/`inZone`, Rescue1-3's valves, the
  `rescued` event, `targetable`'s one line, the readings; the leader resolved through HX-4a's `ExtractionHost.seat`); `packages/match/src/room.ts` (the
  `rescued`/`killed` listeners, `scoreObjective`'s `'none'` and `carriesTeam`, `Player.hostagesRescued` /
  `escorteesKilled` / `roundRescued`, `hostagePrimaryObjectives`, `countersOf`); `packages/viewer/src/net/objectiveScore.ts`
  (`rescue`, `hostageKill`, `statKind`'s `'none'`, `carriesTeam`); `net/protocol.ts` (`MatchStats`' two fields);
  `roundCues.ts` (`hostageCues`, `hostageCueOf`, `RoundCues.hostages` / `decided`); `roundAudio.ts` / `roundAudioHost.ts`
  (`hostage`, `decidedBy` / `decided`); `netPage.ts` (the lines in `kill`, `hostageState`, `eliminated`, `roundStart`;
  `hostageMarks`); `hud.ts` (`CompassMark` widened, the colour table, the pulse, `gameCaption`, `setHostageMarks`);
  `hudAssets.ts` (two HUD2 bitmaps); `hostageMarks.ts` (new).
- Tests (HX-5): `packages/central/test/roomExtraction.test.ts` (five cases, the flat floor with a synthetic Safety grid; the
  fifth the union's seam with HX-4a's orders),
  `extraction.test.ts` (unchanged at the merge: the host's `player` dropped for HX-4a's optional `seat`), `packages/viewer/test/objectiveScore.test.ts`, `roundCues.test.ts` (MP6
  fixture), `roundCues.parity.test.ts` (the pin's four extraction maps; the streams on SOUNDRDR), `hostageMarks.test.ts`
  (new, MP6 fixture), `hud.test.ts`, `netPageRound.test.ts` (two cases), `hud.parity.test.ts` (the pin's two bitmaps).

## 1. The orders (HX-4a)

### 1.1 The offer is the test

The original offers FOLLOW! (action 0xe) and HOLD POSITION (0xf) on the hostage under the crosshair each frame
(`FUN_00593d00` D:L452482-452498, from the player controller's update `FUN_00593500` with no team test), by asking the
escortee unit 0x11 `CanIssue(player, 4)` and `(player, 5)` (`FUN_005ee7f0`); the press runs the same test again
(`FUN_005e8e10`) and OnCommand. A client forwards cmds 4/5 to the host, which applies them unchecked (`FUN_002bb8e0`
D:L160706-160721; 191 §12.4). The port's room is the authority (MISSION rule 5): it runs the issuer's console's test on
the order and refuses only what that test refuses (`ORDER_VALIDATION_READING`); the page offers by the same function on
its own ray, so a prompt the page shows is an order the room takes. `orderTestRefusal(cmd, issuer, hostage, pick)`, in
the original's order:

| step | the original | the port's refusal |
|---|---|---|
| a spectator | the offer skipped online for persona flag 0x10000 (`FUN_00593500` D:L452247-452251, `FUN_002c2fd0` D:L164611-164644); the forward skips it too | `'spectator'` (`SPECTATOR_ORDER_READING`; 0x10000 = spectator BELIEVED, 191 §6) |
| a dead issuer | no input (the room's own: a dead seat's actions are ignored as `fire`'s) | `'not alive'` |
| the hostage alive | `+0xe1` bit 4 (`FUN_00590bc0` D:L450733; `FUN_00591dc0` D:L451386) | `'hostage dead'` |
| past the fade | the node inactive: the pick cannot find it (`FUN_002d6260` D:L176893) | `'gone'` (opacity 0) |
| a shared team bit | `+200 & +200` (D:L450735, D:L451400-451405) -- no side test anywhere (189 §14.12, HX.R3) | `'team'` (`ORDER_SIDE_READING`) |
| the crosshair | `FUN_005aa690(issuer) == hostage` (D:L451421-451426) | `'not aimed'`, or `'blocked'` when the ray met the hostage behind a blocking surface (`ORDER_PICK_READING`) |
| the range | Manhattan cells `< 0x14` on `+0xe8`, each body's located sub-map's own indices, the sub-map ignored (D:L451427-451448; §9, DF-7) | `'range'` (`ORDER_RANGE_CELLS_READING`, `ORDER_CELL_FIELD_READING`) |
| rescued | online no exclusion (the 0x11 test is offline's, behind `+0x105d` bit 0, D:L451409-451412) | none (`rescuedRefusal`, `RESCUED_REORDER_READING`; owner call 1) |
| FOLLOW | in unit 0x11 (`FUN_00591ab0` D:L451279-451283) | `'led'` |
| HOLD | not in 0x11 and, online, in the issuer's unit (`FUN_00591770` D:L451232-451240, `FUN_005ef340`) | `'not yours'` (`HOLD_ISSUER_READING`) |

The range's cell is `aiCellOf` on sub-map 0 for both bodies (the room's `SimMap.ai`, the page's `LoadedMap.ai` (W0's)): the
original reads x and z off `+0xe8` and ignores the sub-map bits, so two bodies on different sub-maps at the same x,z
are as near as on one; a body off sub-map 0's grid is out of range (the port's edge: the original's `+0xe8` always holds
a cell).

### 1.2 The pick and the bars

The aim pick (`FUN_005aa6e0` D:L464120-464192) walks every surface the ray crosses and treats one as blocking unless
its material is VOLUMETRIC or LIQUID (`+0x3c` bits 0 and 1) or its PENETRATION (`+0x24`) is at least 0.98 without
`+0x3c` bit 4 (D:L464148-464153) -- the port's `aimPickBlocks` (`AIM_PICK_IGNORE_READING`; the port's materials carry
the loader's bits 0-2 only, bit 4 taken clear). `crosshairPick` takes the nearest body nearer than the nearest blocking
surface: a player in front is the pick (the hostage is not aimed at); a body behind the wall is `blocked`. Both casts
use `ORDER_PICK_REACH_READING` (600 u: the aim pick's own floor, `FUN_005aa6e0` D:L464097-464106 -- the held item's range when longer, capped by an unread global `+0xec`) so the range test, not the ray's length, decides.
The page meets the bodies on the room's capsules (`RemotePlayers.aimBodies`, the shape `aimDistance` and the room's
`rayBody` judge by) and the hull by `pickSurfaces` (`segmentHits` with the polygon's material byte, byte 0 the map's
`DefaultMaterial`); the room half (§9.1) casts the same, from its own camera eye at the command the order names
along the page's direction -- the order decided on the timed path once that command has run (§9.2,
`ORDER_EYE_READING`).

Desert Glory's jail bars `nohostagerescue` / `okhostagerescue` are the same nine polygons in material 28 METAL_GRATE
(penetration 0.4) and 3 INVISIBLE_DI (1.0) (199 §6, §12.7; the indices checked against `materialTable()` in the test):
shut, the bars block the pick and no prompt shows through them; opened, the pick passes (`BARS_MATERIAL_READING`). The
swap itself is the door's `okforhostages` / `not_okforhostages` helper calls (175 §5.1), which no code of the port's
world state ran: `BARS_SWAP_PLACEHOLDER` until DF-4 (2026-11-08; the paragraph below is HX-4a's state, kept as the
record). **DF-4:** the door host hands its program's `CALL_ANIMATION` to the room's world (`DOOR_CALL_READING`,
research 92 §7), which runs the set's helper there -- after the open's swing the grate is off and the pick passes the
bars, after the close's the invisible set is off and the grate blocks, both whole at the reset; the `EnvWire` carries
it to the page (`roomHostageOrders.test.ts`, the MP6 fixture; `roomDoorCall.test.ts`, synthetic). The room half's probe of the MP6 fixture (`roomHostageOrders.test.ts`)
found the room's grid holding **both** sets on the same faces (x 1731.16 and 1734 at z 1190-1235, both nodes active),
so the grate blocks the order's pick across the bars open or shut -- a departure until the door's helper calls run
(one set active at a time); through the doorway gap the cell door leaf's faces (both materials) are the static grid's.
No door hook is built here.

### 1.3 The prompt

`FUN_0021ded0`'s context-action table: 0xe "FOLLOW!" (0x3e4f00) and 0xf "HOLD POSITION" (0x3e4f08), both with
`action_escortee.tif` (0x3e4dd0, D:L73564-73565), its fallback `action_x.tif` (189 §3, 190 §9;
`ESCORTEE_PROMPT_READING`). The bitmap is in MP2's and MP6's HUD library (64x64; pinned in `hudBitmaps.json`). The HUD
draws the icon (`ActionPrompt` `escortee`); the text rides `HostageOffer.text` for HX-5's HUD. The context's place in
the action picker: the press's masks are 0x4000 / 0x8000 (`FUN_00592d50` D:L452112-452130), which `FUN_0021f850` appends
after C4's 0x40000 and before the drop's 0x40 -- so `escortee` sits after C4 and before the drop. AD-6 (2026-10-16;
reading, pending review; research 214 s4) read the turret's bits (0x80000 / 0x100000, the list's first) and the
pickups' (0x10 / 0x20, after the victory dance's 0x200000), so `escortee` sits after `pickup` and before `bombDrop`.
Was: against the pickup and the turret, whose bits were unidentified, its place unread and the port putting it after
the turret (`ESCORTEE_CONTEXT_ORDER_READING`, retired). (The dispatch's "after door, before switch" is not the read
order: corrected here.)

## 2. The bookkeeping (HX-4a)

### 2.1 The units

FOLLOW puts the hostage in the issuer's unit (`FUN_005ee160`, D:L450377) and HOLD back in 0x11 (`FUN_005ee250`,
D:L450539); HOLD is offered only to a player in the hostage's unit. The port gives each seat a unit of its own numbered
as the host numbers it, the seat's id + 0x20 (`FUN_002bdea0`, field 0x74: 199 §12.6; `UNIT_PER_PLAYER_READING`), so "in
the hostage's unit" is "its leader" and a seat's unit never reads 17 (seats 1..48 are 0x21..0x50). HX-3's
`HostageAi.unit` holds it; the wire's `hostageState.unit` carries it (§3). Whether every online player has a unit of its
own is V2's owed #1 (189 §14.6): the one interpretive step.

### 2.2 FOLLOW and HOLD (OnCommand cases 4 and 5)

- **FOLLOW** (`follow`, D:L450351-450410): when the hostage's unit is not the issuer's (D:L450373) it joins the
  issuer's unit (D:L450377), says YES (CHRSND 0x37 at 1.0, D:L450379) and online sends the radio 0x2b (D:L450382;
  `RADIO_CHATTER_PLACEHOLDER`, unplayed); then ClearStack(0) and 9 kept or pushed (HX-3's `follow`); only when 9 is the
  top, `TryControlHostage` (D:L450393-450398). A FOLLOW on a rescued hostage (0x11's mask refuses 9) joins and says YES
  but leads nothing (199 §1's replay).
- **HOLD** (`hold`, D:L450465-450540): HX-3's `hold(issuer)` (the unwind to 0x17 sub-state 2 with the issuer recorded,
  else UnwindTo(6), else Replace by CAiSHold), then for an escortee, whatever the stack did, YES and unit 0x11
  (D:L450536-450539) -- HX-3's review note (238 §2.6).
- **TryControlHostage / ControlHostageAction** (`HostageLeaders`, `FUN_005fd010` / `FUN_005fcf10`
  D:L509476-509527): the old leader's `+0x520` -1 while positive (D:L509487-509493), `+0x5d4` cleared; then a null
  leader, or an alive one that is not the hostage itself, taken (D:L509495): `leader`, its count +1 (D:L509500),
  `lastLeader` its id (D:L509501); with no leader after it the follow state's live bit is cleared (D:L509505-509514) and
  the driver pops 9 next frame. A dead leader is refused after the old one was released. The counts are the room's own,
  not replicated (`HOSTAGES_CONTROLLED_READING`).
- **Follow's end** (`createOrderedHostage`): state 9 ended by signal 1 -- HOLD's unwind, the rescue's Replace, the
  driver's pop after a release -- runs `ControlHostageAction(ai, 0)`, so the count drops and `lastLeader` is kept (199
  §1's replay: "Follow's signal 1 releases the leader count; +0x5d8 kept"). HX-1's extraction makes its hostages through
  it in wave 3.

### 2.3 The release and the UnitTick (never stranded)

A leader's death (`FUN_00547af0` D:L413031-413046) and departure (`FUN_002bef60` -> `FUN_005998b0` D:L455500-455536 ->
`FUN_005477a0(0)` -> the same OnDeath) release its followers alike (`releaseLeader`, `LEADER_RELEASE_READING`):
`ControlHostageAction(ai, 0)` for each living hostage whose stack holds 9 and whose leader is the seat; `lastLeader`
kept (a released hostage later in the zone with its old leader still resolvable is rescued and credited to him, 189
§14.8 -- HX-5's). Then the UnitTick (`unitTick`, `FUN_005e8060` D:L498341-498463; V5 H4-5b, 199 §12.6): a seat's unit
whose member is dead or gone gives each living escortee HOLD (D:L498439-498450; the dead escortees are taken off the
list first, D:L498387-498412), the issuer the dead member or, for a departure, the host's player -- none in the port, so
null (`UNIT_TICK_HOLD_READING`): the hostage is back in 0x17 sub-state 2, unit 0x11, with YES, and FOLLOW is offered
again. H4's "stranded" (199 §5) is wrong by V5's read; the port is never stranded (HX.R4). A session takeover moves a lead to the new seat
(`rekey`), but in a classic round in play the new seat is a ghost: its unit has no living member, so the UnitTick HOLDs
its hostages within a frame (leader null, unit 17, `lastLeader` kept) -- as the original treats a reconnect as a leave.
A led hostage's own death frees its leader's count at once (`LED_HOSTAGE_DEATH_COUNT_READING`). The port tests the units each
frame where the original tests the flagged ones: a seat unit's membership changes only by those events, so the outcomes
agree.

## 3. The wire (HX-4a)

- **Client -> room, `hostageOrder`** `{ seq, hostage, cmd: 4 | 5, eye, dir }`: the page's aim as `fire` carries it
  (`WalkMode.fireAim`'s eye, the unit direction to its far point), at the last command sent (`NetPage.hostageOrder`; a
  player's only, with an aim). The original's 8-byte AI Orders `{u16 issuer, u16 hostage, u8 cmd}` to the host
  (`FUN_002bb970` D:L160726-160750, 191 §3.3) carries no aim: the host trusts the client's offer; the port's room checks
  the pick itself along the page's `dir` from the page's `eye` -- trusted once it lies within 1.57 u of the issuer's
  camera's locus at the order's command or the next and the body's head reaches it past no wall (HX-OBEY, §9.3,
  `ORDER_EYE_TRUST_READING`; the fix-up's cast from the room's own camera eye, §9.2's `ORDER_EYE_READING`, is retired:
  an order whose eye fails either test is dropped `'eye'`)
  -- and drops an order whose `seq` is at or below the player's last
  order's as `'stale'` (`ORDER_VALIDATION_READING`, `ORDER_RTT_READING`: one round trip either way). The wire at a real
  page's cadence (the page's own `NetClient` at 60 Hz over a real socket, the order at `lastSeq()`, the room ticking
  between) is held by `packages/match/test/twoPagesHostageOrder.test.ts` on the MP6 fixture, in the jail: taken, no
  drop (§9.3).
- **Room -> pages, `hostageState`** (HX-1's `HostageStateWire`): the outcome of an accepted order is the hostage's new
  state -- `ai` 9 and `leader` on FOLLOW, `ai` 0x17 and `leader` null on HOLD or a release, `unit` the leader's (its
  seat id + 0x20) or 17. No refusal is told (the page's prompt withheld it already); the room's tally counts it (§9.1).
- **The YES** is no event of its own: every page plays it at the body when `unit` moves into or out of 17
  (`NetPage.escorteeVoice`; OnCommand says YES whenever it moves the hostage -- FOLLOW, HOLD, the UnitTick's HOLD), not
  on the first state a page sees of a hostage (a welcome's, a round's reset: the units are forgotten at `welcome` and
  `roundStart`). Who hears it in the original is unread (`HOSTAGE_YES_AUDIENCE_PLACEHOLDER`); the cue is mp_fem1-3's
  `^CO_0343` (`HOSTAGE_YES_CUE_READING`). The room half must send a round's reset states after its `roundStart` (§9.1).
- `HostageStateWire.unit`'s JSDoc says "the seat's id + 0x20" (HX-1's said "its leader's seat id": a seat id 17 would
  read as the escortee unit) -- the union at HX-1's merge keeps HX-4a's line.

## 4. The rescue and the score (HX-5)

### 4.1 The test

The escortee post-tick (`FUN_0056f970`, CSealCtrlAi vt +0x3c) runs on the console that owns the AI -- online the session
master, the port's room (HX.R2) -- after the AI's step, every frame. Its rescue arm (D:L432964-432985), in order:

1. `ctrl+0x5d8` (the last leader's id, initialised -1 at D:L434764 and D:L435187) is not -1; the body's `+200` holds the
   escortee bit 0x20000 (a hostage's 0xC0020000 always does); `FUN_0052a200(0x66a1b0, 1, body+0xe4)` finds a kind-1
   zone (EXTRACT_ZONE) holding the body's AI-map cell. The port: `Hostage.lastLeader !== null` and `inZone(h)` --
   `aiCellOf(map.ai.maps[0], x, z)` (HX-0b's `+0xe4` stand-in) tested by `zoneContains` against every kind-1 zone
   (`zonesOfKind(ai, 1)`), the half-open rule (`ZONE_CONTAINS_READING`): on Safety 0:(6,76) 8 x 15, x 139.9 is cell 13
   (in) and x 140 cell 14 (out) on a 10-unit grid -- the test's edge, which a world-rectangle test with a closed side
   would get wrong.
2. The id looked up (`FUN_0029e4e0(0x4362e0, id)`, kept only when `+0x10 == 2`, a type-2 entity, alive or dead): none ->
   `+0x5d8 = -1` and no rescue (D:L432971-432972). The port: HX-4a's `ExtractionHost.seat(id)` (a seated player, alive or not;
   at the merge of HX-4a it replaced HX-5's `player`); none, a spectator or no side -> `lastLeader = null`
   (`RESCUE_DEAD_LEADER_READING`).
3. `FUN_005f5ba0(ctrl, 0x11, 0)` (Replace through the gate): refused while 0x11 is the top (the gate's top test and 0x11's
   own mask, research 238 §2), so a hostage held in the zone is not re-rescued each frame. Accepted: the new state's
   `+0x58` the zone, `+0x5c` the leader, its live bit set, then `FUN_00545480(leader+0x58c, leader)` -- the credit. The
   port: HX-3's `HostageAi.rescue(leader)` (the Replace, the rescuer recorded, sub-state 2 at once and the anchor freed
   by its OnSignal(0), `RESCUED_SIGNAL_READING`), then the authority's `rescued` event to the room (`RESCUE_TEST_READING`). The lead is released as
   a death releases it (HX-4a's `HostageLeaders.controlHostageAction(h, null)`: the leader's count -1, `lastLeader`
   kept; §2.3) -- by state 9's end through `newAi`'s signal when the Replace ends a FOLLOW, else at once.

Rescued, the hostage fades at 0.75/s (HX-3's `HOSTAGE_FADE_READING`) and at opacity 0 is hidden: HX-1's `bodies()` drops
it from the snapshot (the original keeps the inactive node; the page's `remote` removes a body absent from the list),
`targetable` refuses it (no hit) and HX-4a's order test refuses it `'gone'` (no pick). A Terrorist's lead runs the same
test: 0x11 with the Terrorist as rescuer (`TERRORIST_LEAD_RESCUE_READING`, §4.2).

**The script's Rescue one-shots** are separate: MP6's `Rescue1`-`3` (`IF ( ai::INREGION(HostageN) ) OR ( )`, the empty
group the left operand's, 190 U9) post `^PH_0013` "A HOSTAGE HAS BEEN RESCUED" and add 1 to `rescuecount` and to
`freecount`, then stop -- once per hostage, with no state or leader test. The room polls them once a tick on the same
cell test (`RESCUE_VALVE_READING`): a Terrorist-led hostage counts for the SEALs; a hostage whose departed leader was
forgotten, standing in the zone, counts too (no state test) though it is not rescued. Whether INREGION reads a dead
actor is unread; a hostage cannot reach the zone dead.

### 4.2 The credit and the team carry

`FUN_00545480(block, leader)` (D:L411554-411572): offline, or online when the leader is a SEAL (`FUN_002c31d0`): on the
leader's own console (`FUN_002b3580() == leader`) brought out +1 (`block+0x1c`, the round block at `+0x58c`: `+0x5a8`)
and +3 to the score (`+0x3c`); then, on every console, `FUN_00544d60(leader, 1)` -- the team carry (+1 to `+0x7c` for each
living player sharing a team bit with the leader, D:L411240-411300). A Terrorist leader: nothing at all
(`TERRORIST_LEAD_RESCUE_READING`). The room scores every seat once (`KILL_SCORE_LOCAL_READING`, note only): its
`on('rescued')` takes the seat (`players.get`), and when a SEAL adds `hostagesRescued` and `roundRescued` and calls
`scoreObjective(p, { kind: 'rescue' })` -- +3 to the score and the round's score (`OBJECTIVE_POINTS.rescue`), no YOUR
STATS line (`statKind` `'none'`), the team carry (`carriesTeam`, `teamCarry`: `TEAM_CARRY_RESCUE_READING`). A dead leader
is credited while seated (step 2); the carry counts the living only, so a dead leader adds none of his own.

### 4.3 The kill's score

`FUN_00545390(block, killer)` (D:L411524-411547), called with the killer's block from the escortee branch of the death:
on the killer's own console the score -2 (`+0x3c`) -- in ESCORT (type 3, D:L411530) a SEAL -2 and a Terrorist +3; then on
every console `FUN_00544d60(killer, 0)` (a recount, no +1) and escortees killed +1 (`+0x18`). No type-2 killer (a world
kill, D:L458078): nothing (HX-1's `WORLD_KILL_UNCOUNTED_READING`). The room's `on('killed')`: the seated killer's
`escorteesKilled` +1 and `scoreObjective(p, { kind: 'hostageKill', killerTeam })` -- -2 (`HOSTAGE_KILL_SCORE_READING`;
ESCORT's +3 for a Terrorist in `objectivePoints`, recorded for MAP-08b), no stat line, no carry. No kill, no death, no
kill line (HX-1's `HOSTAGE_KILL_LINE_READING`).

### 4.4 The two copied quirks (owner calls 1 and 2, HX.R5)

*Superseded 2026-11-01 by OT.R97 (R4B-04, [research 377](377-r0004-hostage-credit-once.md)): r0004 refuses an order on
a hostage in 0x11, credits a rescue once, and refuses every hit on a rescued hostage but a departed owner's Backblast.
What follows is r0001's, kept as the record (R4B.R6).*

- **The double credit** (`RESCUED_REORDER_READING`, HX-4a's constant): online the offer does not exclude a rescued
  hostage, so HOLD is offered inside the <= 1.33 s fade; HOLD unwinds 0x11 to 0x17 (sub-state 2, the stack under 0x11 held
  0x17 since FOLLOW pushed 9 over it) -- or Replaces a lone 0x11 by CAiSHold (2) on a second re-entry -- and the next
  post-tick's Replace succeeds again: +3 and brought out +1 again, the node's opacity carrying on. The rescue test has no
  "already rescued" gate (its JSDoc names the reading); the Rescue one-shot stays once. Past the fade the hostage is
  `'gone'` to the order test, so nothing more. Test: the third `roomExtraction` case drives HX-3's `hold` (HX-4a's HOLD
  without its YES and unit) and reads +6; since the union with HX-4a (2026-10-07) the fifth drives the whole path
  through the room -- a `hostageOrder` FOLLOW, the rescue on Safety releasing the lead (`HostageLeaders.controlled`
  1 -> 0, `leader` null, `lastLeader` and the rescuer kept), a `hostageOrder` HOLD taken inside the fade and +3 again,
  then `'gone'` past it -- the seam between HX-4a's bookkeeping and HX-5's rescue closed (§4.1 step 3).
- **The double count** (`DOUBLE_COUNT_READING = 'copied'`): a hostage shot inside its fade is struck (`targetable` true
  while not hidden), dies, its killer's side's valve and the one-shot's `killcount` move -- beside its `freecount` from the
  rescue; SEALcheck's equality branches see the sum (HX-1's `RESCUECHECK_READING`). The refusal is one line in
  `targetable` (the constant compared), so the owner's ruling flips one constant and one test.

### 4.5 The primary objective

`FUN_00224d10` (D:L76467; called at the round's end D:L76026, its result added to `+0x5be`, YOUR STATS' +0x576): it
counts the living SEALs, Terrorists and escortees, and sums `+0x5a8` (brought out this round) over every SEAL, living or
dead; for game type 4 (D:L76550-76558): the local player, when a living SEAL and the sum is above 1, +1; when a living
Terrorist and no SEAL lives, +1 (`PRIMARY_OBJECTIVE_READING`). The room runs it for every seat in `endRound` before the
+1/+5 (`hostagePrimaryObjectives`, an EXTRACTION room only), from `Player.roundRescued` (zeroed at each round's start;
kept in a takeover's row with the round's score, so a seat taken back mid-round still counts its rescues: the review of
dcc2f1f8, 2026-10-07).
The other modes' arms (ESCORT, SUPPRESSION, BREACH) are read in the same function and not built (not this task's).

### 4.6 The stats

`MatchStats.hostagesRescued` / `escorteesKilled` (additive, HX.R7): `countersOf` adds them for an EXTRACTION room's
`roundOver` and every takeover's row; zeroed with the match (`resetMatch`). HOSTAGES RESCUED is the online record's
(+0x24 from the match's brought out in every type but ESCORT, `FUN_00225070` D:L76619-76632: `HOSTAGES_RESCUED_STAT_READING`);
YOUR STATS reads +0x576 / +0x578 only (research 216), so neither is drawn; escortees killed is carried and drawn nowhere
(`ESCORTEES_KILLED_STAT_READING`). The primary objective shows through `primaryObjs`.

## 5. The HUD (HX-5)

### 5.1 The marks

`FUN_002126f0` loads the compass bitmaps in type order (D:L68576): 0 ret_triangle, 1 ret_bomb, 2-3 ret_base, 4
ret_hostage, 5 ret_friendly, 6 ret_extraction, 7-8 ret_objective, 9 hud_talk, 10 small_compass, and sets each type's
colour in threes of floats from `+0xa0` (D:L68670-68705; GS 0-128): type 0 (86, 63, 27), 1 (62, 62, 32), 2 (40, 62, 36),
3 (62, 37, 36), **4 (62, 49, 36)**, 5 (32, 49, 128), **6 (36, 40, 62)** -- 190 D's two values confirmed.
`OBJECTIVE_MARK_RGB_READING` becomes a table by bitmap: the hostage's and the extraction's rows read; the bomb's and the
base's left at XR-06's (32, 62, 32) so their draw is unchanged (the bomb's type by this table would be type 1's (62, 62,
32): not adopted until the bomb's mark type is confirmed -- XR-06's row stays open). The compass's update moves the pulse
`DAT_0040c070` between `DAT_003dc4f8` and `DAT_003dc500` at `DAT_003dc4f0` a second, turning at each end
(D:L68043-68050), and types 1-13 draw at it, the others at `DAT_003dc500` (D:L68126-68130); research 87 §1.7 gives 64-128
at 250/s (`OBJECTIVE_MARK_PULSE_READING`): the HUD steps it (`Hud.timing().marks`), and a mark with `pulse` draws at it.
Online the jump table (0x3e44b0, `FUN_00211510` D:L68148) shows types 1-8, 12, 13 whatever the distance: the port's
objective marks are never filtered (`compassMarks`).

- `ret_hostage` (`HOSTAGE_MARK_READING`) on each living hostage that has not entered 0x11 this round: the anchor is
  made at the AI's set-up (`FUN_005434b0(actor, 4, 0)` D:L434920) when the fireteam words share a bit (both sides), and
  freed on entering 0x11 (`FUN_00543480` at `FUN_005594b0` D:L422308) -- never made again, so a HOLD inside the fade
  keeps it off (`MARK_REMOVED_ON_RESCUE_READING`). A dead hostage has none.
- `ret_extraction` (`EXTRACTION_MARK_READING`, "EXTRACTION LOC" 0x3f0a68) at each kind-1 zone's centre cell on sub-map 0
  with its height (`FUN_002abd40` D:L151857, `FUN_002a42b0` D:L147723; `@s2u/scene` `zoneCentre`): Desert Glory's Safety
  at (810.26, -30.08, 1959.72).

The pure `hostageMarks(hostages, points)` / `extractionPoints(ai)` (`hostageMarks.ts`); `NetPage.hostageMarks(ai)` builds
the list from the page's hostages (the welcome's and `hostageState`'s, each where the shared `remote` draws it) and the
loaded map's AI maps; `Hud.setHostageMarks` takes it beside the bomb's `setExtraMarks` (the bomb page's own call
untouched). The two bitmaps are in MP2's and MP6's HUD2 library at 16x16 (`HUD_LIBRARIES.HUD2`, pinned in
`hudBitmaps.json` off MP2 2026-10-06). Found on the way: `ret_bomb.tif` and `ret_base.tif` are in no library list, so
XR-06's bomb marks have never drawn (the draw skips a bitmap without a size) -- not this task's; said in §9. *Done 2026-10-10 (`ccr-ef8214e9-7mkm9s`, pending review):
both in `HUD_LIBRARIES.HUD2`, pinned in `hudBitmaps.json`.*

### 5.2 The caption

GAME DETAILS' caption is `FUN_0022be20`'s switch on game `+0x111` (D:L79744-79758): 1 BREACH (0x3e5828), 2 DEMOLITION
(0x3e5830), 3 ESCORT (0x3e5840), 4 **EXTRACT** (0x3e5848), 5 SUPPRESSION (0x3e5850), else "GAMETYPE ERROR02" (0x3e5810).
The four others are `mapOrder`'s mode names upper-cased, so `gameCaption` maps 'Extraction' to EXTRACT and upper-cases
the rest (`EXTRACT_CAPTION_READING`); the dispatch's `MODE_CAPTION_READING` (the other captions unread) is resolved by
the same read and named in no code. `Hud.setGame` applies `gameCaption` itself, so both mounts -- `/testroom`'s and the
front end's (`matchMount.ts`) -- show EXTRACT with no line of theirs changed (§7.2).

### 5.3 The cues

`roundCues` reads MP6's one-shots (`hostageCues`, the first copy of each, `HOSTAGE_CUES_READING`) and `start`'s two
decided branches (`RoundCues.decided`) off the script, never typed; the pin (`round-cues.json`, re-derived off the disc
2026-10-06) gains them on the four extraction maps (MP6, MP10, MP11, MP71), and their streams are in the sound worker's
list (`cueNames`). `RoundAudio.hostage` plays a one-shot's stream and hands its lines to the HUD at the script's waits;
`RoundAudio.decidedBy` plays the branch the room's `eliminated.reason` names and decides the round.

## 6. The lines the page posts, by event (HX-5)

| event | the original | the page |
|---|---|---|
| `hostageState` `ai` 9, a hostage's first this round | `LeadN`: `INSTATE 9` -> `^PH_0006`, "A HOSTAGE IS BEING ESCORTED" 0.7, stop | the line and the stream once per hostage a round (`LEAD_ONCE_READING`), re-armed at `roundStart` |
| `hostageState` `ai` 0x11, its first this round | `RescueN`: `INREGION` -> `^PH_0013`, "A HOSTAGE HAS BEEN RESCUED" 0.7, stop | the same once per hostage; the page's trigger is the 0x11 the room tells (the one-shot's INREGION is the room's valve, `RESCUE_VALVE_READING`): a forgotten leader's hostage standing in the zone counts in the valves but posts no line (said in §9) |
| `kill` with `victimKind 'hostage'`, the killer a SEAL | `SealKillN` (`mp_hostages_by_seals >= N`): `^PH_0007`, "THE SEALS HAVE KILLED A HOSTAGE", WAIT 2, "ONE MINUTE HAS BEEN DEDUCTED FROM THE MISSION TIMER" | the stream and the first line at once, the second after 2 s (`PENALTY_LINE_READING`; never from `roundTime`) |
| `kill` with `victimKind 'hostage'`, the killer a Terrorist | `HostKillN` (`_by_turds >= N`): `^PH_0008`, "THE TERRORISTS HAVE KILLED A HOSTAGE", WAIT 2, "THE SEALS HAVE BEEN CREDITED WITH RESCUING THAT HOSTAGE" | the same; a world kill (no killer) posts nothing (no valve moves) |
| `eliminated` `reason 'rescue'` | `start`'s branch: WAIT 2, "SEALS VICTORIOUS!" 0.9, `^PH_0014`, WAIT 2, `MUS_MP_SEAL_WIN_ALG` -- every `player_team`, no "ALL TERRORISTS ELIMINATED" | the branch for the local team, deciding the round's audio (`RESCUE_WIN_LINES_READING`) |
| `eliminated` `reason 'hostageKills'` | "TERRORISTS WIN!" 0.9, `^PH_0002`, WAIT 2, `MUS_MP_TERR_WIN_ALG` | the same |
| `eliminated` with no reason (an older room) or `'elimination'`, or no cues read | the elimination's branch | `eliminationLines` and the elimination's cues, as before |

The lines go through the round's audio (the bomb's pattern): a page without it (no sound part) posts no hostage line,
and a hostage reason with no cues read falls back to the elimination's lines. The one-shots play in a decided round too
(sequences of their own); the decided branch decides the round's audio once.

## 7. The wiring owed

### 7.1 HX-4a's batch lines (wave 4) -- LANDED

**Status (2026-10-07): LANDED** on `agent/wave4` (the wave-4 batch, written once in the merge controller's window): the
diff below applied as written, the block kept as the record. The pins: `test/matchNet.test.ts` `it("the hostages part:
hostageState is owed from /testroom and refused from the front end; escorteeVoice is the sound part's")` (with the
typecheck's `@ts-expect-error` lines and the main.ts/matchSound.ts text pin), `test/matchCore.test.ts` (the front end's
switch literal: `hostages: false`), `test/matchMount.test.ts` (the parts' words: a `hostages` row; the sprint 31 wave 4
`describe`: the front end hands none, main.ts's lines), `test/matchSound.test.ts` (the YES at the body, none without
one). One line beyond the table: `matchMount.ts`' `MATCH_MOUNT_PARTS_PLACEHOLDER` names the hostages in its "not yet"
half (its test pins every part the front end's switch has off).

Held files: `main.ts`, `matchCore.ts`, `matchActions.ts` (and `matchNet.ts`, `matchSound.ts` with them). The diff below
is `git apply`-clean on `agent/hx4a` after the lane's MATCH-THROW merge (main 6f5081a3, lane dc2652d5; re-aimed and
checked with `git apply --check` on 2026-10-06: `main.ts`'s scene import, its `HostagePage` after `remote`, the
`hostageState` line now after `...sound.netDeps()` -- the throwables' hooks moved into `./matchThrow`'s `netDeps()` --
and `matchCore.ts` / `matchNet.ts`'s offsets; `cellOf` reads W0's `LoadedMap.ai`). HX-1's `NetPage.hostages()` is in.
`src/` typechecks with it applied; the batch's implementer then updates the
switch's pins: `matchCore.test.ts` (the front end's switch literal: `hostages: false`), `matchMount.test.ts` (the
parts' record: a `hostages` row -- the front end mounts none), `matchNet.test.ts` (the two literal deps sets:
`hostageState` for `/testroom`, `escorteeVoice` for every page with sound -- the front end's `sound.netDeps()` supplies
it) and adds `it("the hostages part: hostageState is owed from /testroom and refused from the front end; escorteeVoice is
the sound part's")`. `matchMount.ts`: nothing (the part is off there; its sound rides `sound.netDeps()`).

| file | lines | what |
|---|---|---|
| `matchCore.ts` | 3 (+4 JSDoc) | `MatchCapabilities.hostages`; `TESTROOM_CAPABILITIES.hostages: true`; `FRONT_END_CAPABILITIES.hostages: false` |
| `matchNet.ts` | 2 (+1 comment) | `PART_DEPS.hostages: ['hostageState']`; `escorteeVoice` appended to `PART_DEPS.sound` |
| `matchSound.ts` | 2 (+1 comment) | the import; `escorteeVoice` in `netDeps()` (`audio.play('^CO_0343', at, 'voice')`) -- owed because `MatchSoundDeps` is `PART_DEPS.sound`'s |
| `matchActions.ts` | 3 (+1 JSDoc) | `MatchActionsDeps.hostages`; the `escortee` input (`pageSources`' `hostages`) and fire (`fireTable`'s `escortee`) |
| `main.ts` | 12 (+5 JSDoc) | the imports; `const hostages = new HostagePage({...})` after `remote`; `hostages` to `mountActions`; `hostages.frame()` beside `acts.bomb.hudFrame()`; `hostages.reset()` beside `drops.reset()`; `hostageState: (ev) => hostages.state(ev)` after `...sound.netDeps()` in `matchNetDeps`' rest |

```diff
diff --git a/socomlegacy/packages/viewer/src/main.ts b/socomlegacy/packages/viewer/src/main.ts
index 57f47bda..390fcf5d 100644
--- a/socomlegacy/packages/viewer/src/main.ts
+++ b/socomlegacy/packages/viewer/src/main.ts
@@ -4,7 +4,7 @@ import type { MapInfo } from '@s2u/archive';
 import { sortByPopularity } from './mapOrder';
 import { allowedMultiplayerMaps, emptyPickerStatus, parseMapAllowlist } from './multiplayerMaps';
 import {
-  polygonNormal, probeFloor, probeGround, selectFloor, spawnsFor,
+  aiCellOf, polygonNormal, probeFloor, probeGround, selectFloor, spawnsFor,
   type Loadout, type Side, type Spawns,
 } from '@s2u/scene';
 import { FlyCamera, type Pose } from './camera';
@@ -80,6 +80,8 @@ import { gameAudio } from './audio';
 import { mountSound } from './matchSound';
 import { WEAPON_CLIPS } from './weaponPose';
 import { dropModels, WorldDrops } from './drops';
+import { HostagePage } from './hostagePage';
+import { pickSurfaces } from './net/hostageOrder';
 import { EQUIPMENT_SLOTS } from './equipment';
 import { INVENTORY_MENU_KEYS_READING } from './inventoryMenu';
 import { THROW_CLIPS } from './throwPose';
@@ -749,6 +751,24 @@ function askIndex(from: SourceRequest): void {
 // the URL's `&mp` / `&server=` over it. reCOM mode joins as a player, the map viewer as a watcher (`connectNet`).
 // The others' footfalls heard at the foot (`remoteFootfall`, FUN_005a3570/FUN_005a39b0; REMOTE_STEP_STICK_READING).
 const remote = new RemotePlayers(scene, sound.remoteStep);
+/**
+ * HX-4a (`./hostagePage`, research 239 s1, s3, s7; ruling HX.R8): the hostages' part -- FOLLOW! / HOLD POSITION on the
+ * hostage under the crosshair, the room's own test on the page's ray (the others' capsules, the hull's surfaces, sub-map
+ * 0's cells, W0's `LoadedMap.ai`); `/testroom` only this sprint (`TESTROOM_CAPABILITIES.hostages`).
+ */
+const hostages = new HostagePage({
+  self: () => {
+    const c = net?.client, feet = walk.feet();
+    return c && feet ? { id: c.id, alive: walk.mode() === 'walk' && !walk.isDead(), spectator: c.role !== 'player', side: c.team ?? 'seal', feet } : null;
+  },
+  hostages: () => net?.hostages().values() ?? [],
+  feet: (id) => remote.feet(id),
+  aim: () => walk.fireAim(),
+  bodies: (eye, dir, reach) => remote.aimBodies(eye, dir, reach),
+  surfaces: (eye, far) => { const g = walk.grid(); return g ? pickSurfaces(g, eye, far, loaded?.grenade?.defaultMaterial ?? '') : []; },
+  cellOf: (feet) => { const sub = loaded?.ai?.maps[0]; return sub ? aiCellOf(sub, feet[0]!, feet[2]!) : null; },
+  order: (id, cmd) => net?.hostageOrder(id, cmd) ?? false,
+});
 /**
  * Sprint 27's action button and the pages it acts on (`./matchActions`, ONE-WIRE: research 222): the room's events
  * relayed to the pages that follow them, the map's switches (XR-04), the manual turrets and their trigger (MAP-10b),
@@ -762,6 +782,7 @@ const acts = mountActions({
   bombView: { roundAudio, hud, remotePlayers: remote, effects, worldBomb: grenade.worldBomb() },
   win: globalThis,
   drops: { ahead: () => drops.promptAt(walk.feet(), walk.snapshot()?.yaw ?? 0) },   // PF-34: the weapon prompt's drop
+  hostages,                                        // HX-4a: the hostages' orders (research 239 s7)
 });
 const PAGE_LOCATION = globalThis.location ?? { protocol: 'http:', host: 'localhost' };
 let NET: OnlineTarget = onlineTarget(MULTIPLAYER, SEARCH, () => SHARE.online ?? readOnline(), PAGE_LOCATION);   // none with multiplayer off
@@ -1535,6 +1556,7 @@ async function boot(): Promise<void> {
     hud.setVisible(walking);
     traversal.hudFrame(hud);        // research 86: the ladder slide's icon on a ladder
     acts.bomb.hudFrame();           // XR-06: the bomb's compass marks and the fuse in the round timer's place
+    hostages.frame();               // HX-4a: the hostage order offered afresh this frame (the prompt, the lane's input)
     traversal.effectsFrame();       // research 86: the water's ripples (FUN_005b52b0)
     firearm.feedHud(walking, {      // the weapon box (the equipment's over the firearm's) and the readouts
       climb: traversal.hudClimb(),
@@ -1631,6 +1653,7 @@ function connectNet(map: LoadedMap): void {
   acts.unlock();                                   // the closed client gave the walk back unlocked (`NetClient.release`)
   acts.follow(null);                               // wave 4: the pages back to no room -- no bomb, no turret held
   drops.reset();                                   // PF-34: a map left clears the old room's drops (`WorldDrops.reset`)
+  hostages.reset();                                // HX-4a: nothing offered from the old room's hostages
   netLoad = map === loaded ? shownLoad : -1;
   solo?.stop();
   solo = null;
@@ -1654,6 +1677,7 @@ function connectNet(map: LoadedMap): void {
   }, {
     ...throws.netDeps(),                            // the throwables' (`./matchThrow`, `PART_DEPS`): the room's projectiles, a stale throw, PF-36's pids
     ...sound.netDeps(),                             // the sound's (`./matchSound`): the reload, the voices, the ring, the round's cues, the objective
+    hostageState: (ev) => hostages.state(ev),       // HX-4a: the hostages' part (`PART_DEPS.hostages`, research 239 s7)
     // The world drops' (`PART_DEPS`, PF-34, research 234 s6): the room's drops, a welcome's set too; the live kit after a
     // pickup, no fill (the one firearm's `takeKit`).
     drops,
diff --git a/socomlegacy/packages/viewer/src/matchActions.ts b/socomlegacy/packages/viewer/src/matchActions.ts
index 554d5b3d..c7f9c50f 100644
--- a/socomlegacy/packages/viewer/src/matchActions.ts
+++ b/socomlegacy/packages/viewer/src/matchActions.ts
@@ -52,6 +52,8 @@ export interface MatchActionsDeps {
    * null; absent (a page that does not mount the world drops, `./matchCore` `worldDrops`), never the pickup context.
    */
   drops?: { ahead(): number | null };
+  /** HX-4a (research 239 s7): the hostages' part (`./hostagePage`): its offer the `escortee` input, its fire the press. */
+  hostages?: { offer(): unknown; fire(): boolean };
 }
 
 export interface MatchActions {
@@ -141,6 +143,7 @@ export function mountActions(d: MatchActionsDeps): MatchActions {
     walk, doors, actions, turrets, traversal,
     bomb: { prompt: () => bomb.prompt() }, grenade: { c4Target: () => d.grenade.c4Target() },
     drops: { prompt: () => (wiring.lifecycle.pickupHeld() ? null : dropAhead()) },   // PF-34: the weapon prompt, its 3 s hold
+    ...(d.hostages ? { hostages: d.hostages } : {}),   // HX-4a: FOLLOW! / HOLD POSITION on the hostage under the crosshair
   });
   const pick = (): ActionContext => pickContext(actionInputs(actionSources));
   const wiring = new ActionWiring({
@@ -148,6 +151,7 @@ export function mountActions(d: MatchActionsDeps): MatchActions {
     fire: fireTable({
       doors, actions, turrets, grenade: { plantC4: () => d.grenade.plantC4() },
       pickup: () => { const did = dropAhead(); return did !== null && (d.net()?.pickup(did) ?? false); },   // PF-34: the claim
+      escortee: () => d.hostages?.fire() ?? false,     // HX-4a: the order sent (`NetPage.hostageOrder`)
       bombDrop: () => {                                // XR-05: the manual drop (action 6) asked of the room, a player's only
         const c = openClient();
         if (!c || c.role !== 'player') return false;
diff --git a/socomlegacy/packages/viewer/src/matchCore.ts b/socomlegacy/packages/viewer/src/matchCore.ts
index eacb9c1a..97ae4c67 100644
--- a/socomlegacy/packages/viewer/src/matchCore.ts
+++ b/socomlegacy/packages/viewer/src/matchCore.ts
@@ -63,12 +63,17 @@ export interface MatchCapabilities {
   readonly tacMap: boolean;
   /** The character shadow (`./charShadow`). */
   readonly shadow: boolean;
+  /**
+   * HX-4a (research 239 s7; ruling HX.R8): the hostages' orders -- FOLLOW! / HOLD POSITION on the hostage under the
+   * crosshair (`./hostagePage`), its `NetPage` hook (`hostageState`: `./matchNet` `PART_DEPS`), the action's `escortee`.
+   */
+  readonly hostages: boolean;
 }
 
 /** `/testroom`'s match: every part. */
 export const TESTROOM_CAPABILITIES = Object.freeze({
   firearm: true, throwables: true, launcher: true, worldDrops: true, armory: true, exchange: true, inventory: true,
-  doors: true, actions: true, traversal: true, sound: true, touch: true, tacMap: true, shadow: true,
+  doors: true, actions: true, traversal: true, sound: true, touch: true, tacMap: true, shadow: true, hostages: true,
 } as const) satisfies MatchCapabilities;   // literal: the typecheck reads the parts on and off (`./matchNet` `PageDeps`)
 
 /**
@@ -78,7 +83,7 @@ export const TESTROOM_CAPABILITIES = Object.freeze({
  */
 export const FRONT_END_CAPABILITIES = Object.freeze({
   firearm: true, throwables: true, launcher: true, worldDrops: false, armory: false, exchange: false, inventory: true,
-  doors: false, actions: false, traversal: false, sound: true, touch: false, tacMap: false, shadow: false,
+  doors: false, actions: false, traversal: false, sound: true, touch: false, tacMap: false, shadow: false, hostages: false,
 } as const) satisfies MatchCapabilities;
 
 /**
diff --git a/socomlegacy/packages/viewer/src/matchNet.ts b/socomlegacy/packages/viewer/src/matchNet.ts
index 2fd1fddc..bb2c6b44 100644
--- a/socomlegacy/packages/viewer/src/matchNet.ts
+++ b/socomlegacy/packages/viewer/src/matchNet.ts
@@ -70,9 +70,11 @@ export const PART_DEPS = {
   throwables: ['remoteGrenade', 'ownProjectiles', 'staleThrow', 'tagOwnProjectile', 'detonateProjectile'],   // LOW-2 (research 223 s6): a stale throw's item back
   /** PF-34 (research 234 s5, s6): the room's drops on the page (a welcome's set too), the page's live kit after a pickup (`kit`). */
   worldDrops: ['drops', 'kitChanged'],
-  sound: ['reloadSound', 'deathVoice', 'hurtVoice', 'ring', 'roundAudio', 'objective'],
+  sound: ['reloadSound', 'deathVoice', 'hurtVoice', 'ring', 'roundAudio', 'objective', 'escorteeVoice'],   // HX-4a: the escortee's YES
   /** The seat's ARMORY, and its glue at the round's start and an abandon (`./armoryGlue`; note 222 §4, 12). */
   armory: ['armory', 'armoryOpen', 'joined', 'newRound', 'abandoned'],
+  /** HX-4a (research 239 s7): a hostage's state for the orders' part (`./hostagePage` `state`). */
+  hostages: ['hostageState'],
 } as const satisfies Partial<Record<keyof MatchCapabilities, readonly (keyof NetPageDeps)[]>>;
 
 type PartDeps = typeof PART_DEPS;
diff --git a/socomlegacy/packages/viewer/src/matchSound.ts b/socomlegacy/packages/viewer/src/matchSound.ts
index 1d60a06f..08271cad 100644
--- a/socomlegacy/packages/viewer/src/matchSound.ts
+++ b/socomlegacy/packages/viewer/src/matchSound.ts
@@ -9,6 +9,7 @@ import type { NetPageDeps } from './netPage';
 import type { PlayEvent } from './play';
 import type { RemoteStepHook } from './remotePlayers';
 import { RingingEars } from './ringingEars';
+import { HOSTAGE_YES_CUE_READING } from './hostagePage';
 import { RoundAudioHost } from './roundAudioHost';
 import type { SoundData } from './soundData';
 import type { WalkMode } from './walk';
@@ -117,6 +118,8 @@ export function mountSound(p: MatchSoundParts): MatchSound {
       ring: (seconds, volume) => ears.start(seconds, volume),
       roundAudio,                                     // INT.R7: the round's cues (`./roundAudioHost`), run by the page's frame
       objective: () => audio.roundCues()?.objective ?? null,   // PF-12: the map's objective lines, read with the cues
+      // HX-4a: an escortee's YES at its body (CHRSND 0x37, mp_fem1-3's ^CO_0343; HOSTAGE_YES_AUDIENCE_PLACEHOLDER).
+      escorteeVoice: (_id, cue, at) => { if (cue === 'yes' && at) audio.play(HOSTAGE_YES_CUE_READING.sound, at, 'voice'); },
     }),
     frame: (camera) => {
       audio.setListener(camera.matrixWorld.elements);  // the game's listener is the camera (0x48dd40)
```

### 7.2 HX-5's batch lines -- LANDED

**Status (2026-10-07): LANDED** on `agent/wave4` with §7.1 (applied after it, as written; the block kept as the record),
ungated (`/testroom` alone builds it; the front end's match mounts no marks). Pinned by `test/matchMount.test.ts`'s
sprint 31 wave 4 `describe` (`hud.setHostageMarks(...)` the line before `hud.render`).

Held file: `main.ts` only. The dispatch's three lines become **one**: the caption needs none (`Hud.setGame` applies
`gameCaption`, §5.2 -- the `main.ts:1752` and `matchMount.ts:303` `setGame` calls stay as they are and both show EXTRACT),
and the marks need no merge with the bomb's (`Hud.setHostageMarks` is a list of its own beside `setExtraMarks`, so
`acts.bomb.hudFrame()` keeps its call). The line feeds the HUD from the page each frame, in `/testroom` (the front end's
match mounts no hostage marks: the `hostages` part is off there, HX.R8). The line sits just before `hud.render` (the marks
fed, then drawn), outside §7.1's `main.ts` hunks, so the two batches apply in either order. `git apply --check` clean
against the merged `agent/hx5` (main.ts blob 57f47bda, untouched by the merge of HX-4a's lane, 2026-10-07), alone and
after §7.1's diff:

```diff
diff --git a/socomlegacy/packages/viewer/src/main.ts b/socomlegacy/packages/viewer/src/main.ts
--- a/socomlegacy/packages/viewer/src/main.ts
+++ b/socomlegacy/packages/viewer/src/main.ts
@@ -1540,6 +1540,7 @@
       climb: traversal.hudClimb(),
       nearby: acts.prompt(walking),  // XR-06: the action context's prompt, in the picker's order (`./matchActions`)
     });
+    hud.setHostageMarks(net?.hostageMarks(loaded?.ai) ?? []);   // HX-5: the hostages' and the zones' compass marks (research 239 s7.2)
     hud.render(created.renderer);
     // The ARMORY (web sprint 5 S3): its scripts stepped, pulled out 5 s before the next round, drawn over everything.
     const nextRound = net?.nextRoundIn() ?? null;
```

With HX-4a's part in place the batch may gate it on the part (`caps.hostages`); nothing else waits on it. The marks on
screen are the gate's browser check.

## 8. Readings and placeholders

| name | where | status |
|---|---|---|
| `ORDER_RANGE_CELLS_READING` | viewer `net/hostageOrder.ts` | `20`: Manhattan cells `< 0x14` (`sltiu` at 0x591f94, `FUN_00591dc0` D:L451427-451448; 189 §14.6). Owed: C2 (19 offered, 20 not) |
| `ORDER_CELL_FIELD_READING` | viewer `net/hostageOrder.ts` (`orderCellOf`; match `hostagePath.ts` `locateAiCell`) | `"+0xe8: the located sub-map's own cell, the sub-map ignored"`: x = (word & 0x7ffff) >> 6, z = u16 `+0xea` >> 3 (189 §14.6 correction 1), the word `FUN_005b7ba0` writes (D:L471318) from `FUN_0052dc70`'s locator (D:L471278), whose x / z are the located sub-map's own indices (D:L397251-397252, D:L397264-397266); the port locates both bodies the same way, page and room. Not modelled: `+0xe8` kept at the last traversable cell (D:L471284-471291, D:L471309). Reading (DF-7, §9; its review PASS WITH FINDINGS, high, `agent-mail/evidence/dg-fishhook-readiness-2026-11-08/REVIEW-DF-7-1.md`). Was: `'+0xe8, sub-map ignored'`, sub-map 0's lattice for both bodies |
| `ORDER_PICK_READING` | viewer `net/hostageOrder.ts` | `'crosshair entity'`: `FUN_005aa690(issuer) == hostage` (D:L451421-451426); the nearest body before a blocking surface (`crosshairPick`) |
| `ORDER_REWIND_ADAPTATION` | server `room.ts` (`orderPick`'s `viewTick`; the wire's `hostageOrder.viewTick`, viewer `netPage.ts` `hostageOrder`) | a browser adaptation, LATER 853 (the owner's mega playtest, 2026-11-10; reading, pending review): the order's pick meets the hostages where the page drew them -- at the order's `viewTick` (`NetClient.viewTick`, the page's playout clock: `INTERP_DELAY_MS` 100 ms behind the server, so 100 ms + half the round trip behind the room), clamped as a round's rewind (`rewindCapTicks` back, never past the room's tick), each from its kept past (`HostagePast`, `pastOf`); without one (an older page), at the present. The original picks on the issuer's console against what it draws (`FUN_00591dc0` D:L451421-451426, `FUN_005aa690`) and the host applies the forwarded order unchecked (`FUN_002bb8e0` D:L160706-160721; 191 §12.4). Judged at the present, a HOLD aimed at a walking follower was refused `'not aimed'` (16 u off at 2 u a tick, 8 ticks behind): the prompt stayed HOLD POSITION and she kept following. Held by `roomHostageOrders.test.ts` (the LATER 853 case) and `matchMount.test.ts` (the page's orders carry `viewTick`). Open: the players in the same pick stay at their present |
| `ORDER_PICK_REACH_READING` | viewer `net/hostageOrder.ts` | `600`: the aim pick's ray length (`FUN_005aa6e0` D:L464097-464106): 600, the held item's range when longer, capped by a global's `+0xec` (unread); the port takes the floor |
| `AIM_PICK_IGNORE_READING` | viewer `net/hostageOrder.ts` | `'penetration >= 0.98 without flag bit 4, or liquid'`: `FUN_005aa6e0` D:L464148-464153 (VOLUMETRIC or LIQUID, bits 0-1); bit 4 taken clear (the port's materials carry bits 0-2) |
| `BARS_MATERIAL_READING` | viewer `net/hostageOrder.ts` | `'28 METAL_GRATE shut, 3 INVISIBLE_DI open'`: the same nine polygons (199 §6, §12.7; 175 §5.1) |
| `BARS_SWAP_PLACEHOLDER` | viewer `net/hostageOrder.ts` (removed) | was `'not swapped'` (the door's helper calls run by no port code; MP6's room grid held both sets, §1.2). Retired by DF-4 (2026-11-08): the door program's CALL runs on the room's world (`DOOR_CALL_READING`, research 92 §7), the swap pinned on the MP6 fixture (`roomHostageOrders.test.ts`) -- retired |
| `ORDER_SIDE_READING` | viewer `net/hostageOrder.ts` | `'none'`: no side test on the offer, the forward, the handler or OnCommand (189 §14.12, V2 #24; HX.R3). Owed: C2 (a Terrorist offered FOLLOW!) |
| `HOLD_ISSUER_READING` | viewer `net/hostageOrder.ts` | `"in the hostage's unit"`: `FUN_00591770` D:L451232-451240, `FUN_005ef340` (189 §14.6) |
| `UNIT_PER_PLAYER_READING` | viewer `net/hostageOrder.ts` | `'own unit'`: a seat's unit = its id + 0x20 (`FUN_002bdea0`, field 0x74, D:L162119-162171; 199 §12.6); owed: V2's #1 (every online player has one) |
| `RESCUED_REORDER_READING` | viewer `net/hostageOrder.ts` (`rescuedRefusal`) | was `'offered within the fade'`: online `FUN_00591dc0` has no 0x11 exclusion (189 §14.14; 199 §1) -- copied; owner call 1 (HX.R5). Re-valued by R4B-04 to r0004's `'refused while its state is 0x11'` (research 377 §4, OT.R97) |
| `SPECTATOR_ORDER_READING` | viewer `net/hostageOrder.ts` | `'refused'`: the offer skipped for persona 0x10000 (`FUN_00593500` D:L452247-452251; `FUN_002c2fd0`); 0x10000 = spectator BELIEVED (191 §6) |
| `LED_HOSTAGE_DEATH_COUNT_READING` | server `extraction.ts` | `'released at the death'`: a dead body's ClearStack pops all (`FUN_005f5f20` D:L505663-505679) and 9's end runs `ControlHostageAction(ai, 0)` (199 s1); which call clears a dying hostage's stack is unread -- the room releases at the death (2026-10-07) |
| `ORDER_EYE_TRUST_READING` | server `room.ts` (`orderPickTrusted`; `net/shotCone.ts` `ShotCone.eyeAt`, `eyeFitsOrder`, `ORDER_EYE_BOUND`; a JSDoc's name) | `"the page's eye, within 1.57 u of the body's camera locus and reachable from its head"` (HX-OBEY, §9.3): the pick is cast from the PAGE's `eye` along its `dir` -- the line it offered on -- once (1) the eye lies within `ORDER_EYE_BOUND` = `CAM_MARGIN` x sqrt 2 + 0.5 + epsilon = 1.57 u of the camera's locus at the order's command or the next: the head's eye, or the segment from the look-at target to `CAM_MARGIN` past the third-person goal eye (the pass pulls the eye in along it), swept straight up by the root's slack (`ROOT_POSE_SLACK_PLACEHOLDER` 4 u, both ends) and back along the body's flat facing by the lead probe (0..8 u, looking down past `LEAD_PROBE`), in 1 u steps -- **a bound 1.57 u wider than the camera's locus, not the locus**, and not the round's rule (`eyeFits`, which spreads the 4 u and the 0-8 u in every direction: 5-13 u wide, the review of f96db3ce); and (2) the line from the body's head (`headPoint`) to the eye crosses no polygon (`segmentHit`, every polygon). The locus itself reaches 1-5 u past the jail's bars from a body pressed to them looking down (the look-at target leads 5-7 u ahead), so (2), not (1), is what shuts H129's hole: an eye 1 u or 2 u past the grate passes the bound and is refused `'eye'` by the clip. `'eye'` is distinct from `'not aimed'`. The pick from the trusted eye keeps the grate rule. The original picks on the issuer's own console and the host applies the forwarded order unchecked (`FUN_002bb8e0` D:L160706-160721; 191 §12.4): the room judges the line the page aimed, bounded. Held by `roomHostageOrderEye.test.ts` (the page's real camera, `PlayerCamera` on the hull, 9-24 u from a kneeling hostage standing and crouched: every look the page offers on is taken, as it was under main's own-eye cast with the body still; the root-divergence case: the page's camera on a posed root 3 u up, main's cast `'not aimed'`, the trusted eye taken; an eye 1 u and 2 u past the bars `'eye'`; 40 u past and 60 u up `'eye'`) and `roomHostageOrders.test.ts` (the grate case: `'eye'`) |
| `ORDER_EYE_READING` | server `room.ts` (`orderPick` without an origin, `orderOrigin`: a test's probe alone -- `orderPickEither` is removed, the wire's eye being mandatory; superseded by `ORDER_EYE_TRUST_READING` for every order) | `"the room's camera eye at the order's command or the next, the page's direction"`: the original's pick leaves from the camera (`FUN_005aa6e0(actor, cam+0xd8, cameraMatrix)` from the camera update, D:L142028; the aim pick D:L464120-464192), on the issuer's own console on the frame its player sees, as the page's does (its camera eye, `WalkMode.fireAim`); the host trusts the forward (191 §12.4). The room never takes the wire's `eye`. It decides the order on the timed path once the command after the one the order names has run, and casts along the page's `dir` from its own camera eye on the order's command's frame and, when the hostage is not the pick from there, on the next command's (`orderPickEither`): the hostage must be the pick from either. Each eye is `localCamera(...).eye` through `toWorld` (`ShotCone`'s rig), pulled in toward the look-at target short of a wall by `headEye`'s rule (§9.2), so the second frame opens no hole. Measured (`roomHostageOrders.test.ts`): built on the same frame, the page's line passes within 0.0038 u of the room's origin (0.0028 u in quadrature) -- the wire's quantisation of the look alone: a yaw half-step of 0.00275 deg (u16) and a pitch half-step of 0.005 deg (i16 / 100) on a camera orbit of at most ~28.6 u; measured 0.0015-0.0023 u upright, prone, leaning and after a turn, held under 0.004 u. The 0.0055 and 0.0087 u an earlier test page showed leaning came from building its line on the previous command's frame (its feet and peek, read before the tick), not from quantisation. Closed (b): the page's mouse look runs up to a frame ahead of the command it last sent (`ShotCone`'s note), so its look at the order is 0-1 command past the order's command; deciding as soon as that command has run (`sim.seq >= seq`) cannot close it, the look being past that frame. The review measured, from the order's command's frame alone, 13.3% of offered aim points refused turning at 90 deg/s and 20.0% at 180 deg/s; from the next command's frame alone the same rates on the other side; from either 100% and 99.9% taken. The wait is one command more (~16 ms). The file's turn tests turn in steps of at most 2 deg a command, the last landing on the target, because NET-LOOK's look gate holds every command's turn to the stick's law (~128 deg/s, ~2.13 deg a command at 60 Hz). Left open: (a) a wall behind the issuer, where the page's camera pass (camera surfaces, `CAM_MARGIN`) and the room's clip (every polygon, `HEAD_EYE_WALL_BACK_PLACEHOLDER`) stop at different points of the same back axis -- the picks differ only for a body between the two |
| `ORDER_VALIDATION_READING` | server `hostageOrders.ts` | `"the issuer's console's test, by the room"`: the host applies unchecked (`FUN_002bb8e0` D:L160706-160721, 191 §12.4); the room refuses only what the offer withholds |
| `LEADER_RELEASE_READING` | server `hostageOrders.ts` | `'ControlHostageAction(ai, 0), lastLeader kept'`: death `FUN_00547af0` D:L413031-413046, departure `FUN_005998b0` D:L455500-455536 (199 §5, §12.6). Owed: C2 (the leader killed, the leader quitting) |
| `UNIT_TICK_HOLD_READING` | server `hostageOrders.ts` | `'back to unit 17 with YES'`: `FUN_005e8060` D:L498341-498463 (V5 H4-5b, STRONG with one step); the departed's issuer null (no host player). Owed: C2 (FOLLOW! offered to a second SEAL) |
| `HOSTAGES_CONTROLLED_READING` | server `hostageOrders.ts` | `"the leader's +0x520: the room's own"`: kept by `FUN_005fcf10` (D:L509487-509501), not replicated |
| `RADIO_CHATTER_PLACEHOLDER` | server `hostageOrders.ts` | `'unplayed'`: 0x2b CMD_MP_ESCORTEE_FOLLOWING (D:L450382) -> `SND_ESCORTEE_FOLLOWING`; the port has no radio chatter (with HX-1's 0x44) |
| `ORDER_RTT_READING` | server `hostageOrders.ts` | `'one round trip, the room the only refusal'`: the forward `FUN_005e6a00` -> `FUN_002bb970` (D:L497530-497537, D:L160726-160750); a name for the note, no behaviour of its own |
| `ESCORTEE_PROMPT_READING` | viewer `hostagePage.ts` | `'FOLLOW! 0xe / HOLD POSITION 0xf, action_escortee.tif'`: `FUN_0021ded0` D:L73564-73565 (189 §3, 190 §9); shared with HX-5 |
| `HOSTAGE_YES_AUDIENCE_PLACEHOLDER` | viewer `hostagePage.ts` | `'everyone, at the body'`: OnCommand plays YES on the console running the AI (ctrl vt+0x24, D:L450379, D:L450537); who else hears it is unread; settles: C2 on a client |
| `HOSTAGE_YES_CUE_READING` | viewer `hostagePage.ts` | `{ cue: 0x37, sound: '^CO_0343' }`: CHRSND YES; mp_fem1-3's only cues YES, DAMAGE, DEATH (189 §2, 199 §8) |
| `ESCORTEE_CONTEXT_ORDER_READING` (retired 2026-10-16, AD-6) | was viewer `actionContext.ts` (removed) | settled by the read (reading, pending review; research 214 s4): with the turret's bits (0x80000 / 0x100000) and the pickups' (0x10 / 0x20) read, masks 0x4000 / 0x8000 come after the pickups' and 0x100 / 0x200 and before 0x40 in `FUN_0021f850`'s order (D:L74050-74293): `escortee` after `pickup`, before `bombDrop`. Was: `'after-turret, before-drop'`, against the pickup's and turret's unidentified bits unread. Retired |
| `RESCUE_TEST_READING` | server `extraction.ts` (`rescueTest`, `inZone`) | `'led (lastLeader resolves), on a kind-1 zone cell'`: `FUN_0056f970` D:L432964-432985; the cell `aiCellOf` on sub-map 0 (`+0xe4`'s stand-in). Owed: C2 (a SEAL leading a hostage onto Safety) |
| `RESCUE_CREDIT_READING` | server `extraction.ts` (`room.ts` `on('rescued')`) | `'the last leader, a SEAL: +3, brought out +1'`: `FUN_00545480` D:L411554-411572 |
| `RESCUE_DEAD_LEADER_READING` | server `extraction.ts` | `'credited while the id resolves'`: `FUN_0029e4e0` finds a dead type-2 entity; a departed one resets `+0x5d8` (D:L432967-432973). Owed: C2 (the leader killed mid-lead) |
| `TERRORIST_LEAD_RESCUE_READING` | server `extraction.ts` | `'a SEAL rescue, no points'`: 0x11 whatever the side, `FUN_00545480` credits a SEAL only (190 U6, V2 s14.12). Owed: C2 (a Terrorist's lead into Safety) |
| `RESCUE_VALVE_READING` | server `extraction.ts` (`script`) | `'INREGION once per hostage, no leader or alive test; the empty OR arm is INREGION alone'`: MP6's Rescue1-3 (190 s4 C, U9); DF-7 (175 §3): the empty group returns `FUN_0025e960`'s caller's s1 (0x25ebc8-0x25ebd4, D:L108366-108367), so the OR is INREGION alone; INREGION's actor mode has no alive test (`FUN_005ced60` D:L484861-484903, `FUN_0029e4e0`), so a hostage dead on a zone cell counts in Rescue and in its kill one-shot -- the original's double, copied (`extraction.test.ts`). Unread: a corpse's `+0xe4` after death. Reading (DF-7's review). Was: `'INREGION once per hostage, no leader test'`, INREGION on a dead actor unread |
| `DOUBLE_COUNT_READING` | server `extraction.ts` (`targetable`) | `'copied'`: `FUN_0059ee20` D:L458113-458145 has no state test (199 s2); owner call 2 (HX.R5), C2 -- retired by R4B-04: r0001, superseded by r0004 (research 377 §3, §5; OT.R97) |
| `PRIMARY_OBJECTIVE_READING` | server `extraction.ts` (`room.ts` `hostagePrimaryObjectives`) | `"a living SEAL with the side's brought out > 1; a living Terrorist with no SEAL alive"`: `FUN_00224d10` D:L76550-76558 |
| `HOSTAGES_RESCUED_STAT_READING` | server `extraction.ts` (`MatchStats.hostagesRescued`) | `'+0x24 from the match brought out, not in ESCORT'`: `FUN_00225070` D:L76619-76632; drawn nowhere yet (research 155's stats record, owed) |
| `ESCORTEES_KILLED_STAT_READING` | server `extraction.ts` (`MatchStats.escorteesKilled`) | `'carried, drawn nowhere'`: +0x18 (`FUN_00545390` D:L411546); YOUR STATS reads +0x576 / +0x578 only (research 216) |
| `HOSTAGE_KILL_SCORE_READING` | viewer `net/objectiveScore.ts` | `-2`: `FUN_00545390` D:L411524-411547; ESCORT's Terrorist +3 (D:L411530) built in `objectivePoints` for MAP-08b |
| `TEAM_CARRY_RESCUE_READING` | viewer `net/objectiveScore.ts` | `'FUN_00544d60(leader, 1): teamCarry'`: D:L411569, D:L411240-411300; the kill's `FUN_00544d60(killer, 0)` adds none (`carriesTeam`) |
| `KILL_SCORE_LOCAL_READING` | viewer `net/objectiveScore.ts` (named in a JSDoc) | note only: the +3 and the -2 are local-gated (D:L411528, D:L411561) while the carry and the counters run on every console; the room scores each once |
| `HOSTAGE_CUES_READING` | viewer `roundCues.ts` (`hostageCues`) | `'Lead1, Rescue1, HostKill1, SealKill1: the first copy of each'`: the MP6 fixture's `objectives` (190 s4 C); the three copies alike in streams and lines |
| `PENALTY_LINE_READING` | viewer `roundCues.ts` | `"SealKill's second line, WAIT 2"`: posted from the kill, not `roundTime` |
| `RESCUE_WIN_LINES_READING` | viewer `roundCues.ts` (`RoundCues.decided`) | `'WAIT 2, SEALS VICTORIOUS!, no first line'`: `start`'s rescue branch (the MP6 fixture) |
| `LEAD_ONCE_READING` | viewer `netPage.ts` | `'once per hostage a round'`: Lead1-3 stop after their line; re-armed at `roundStart`; Rescue's line the same on the first 0x11 |
| `HOSTAGE_MARK_READING` | viewer `hostageMarks.ts` | `'type 4, (62,49,36), always, pulsing'`: `FUN_005434b0` D:L434920, D:L410155; `FUN_0056f4c0` D:L432836-432841 |
| `EXTRACTION_MARK_READING` | viewer `hostageMarks.ts` (`extractionPoints`) | `'type 6 at the centre cell, (36,40,62)'`: `FUN_002abd40` D:L151857, `FUN_002a42b0` D:L147723 |
| `MARK_REMOVED_ON_RESCUE_READING` | viewer `hostageMarks.ts` | `'freed on entering 0x11'`: `FUN_00543480` at `FUN_005594b0` D:L422308; a dead hostage's mark unread, none drawn |
| `OBJECTIVE_MARK_PULSE_READING` | viewer `hud.ts` | `{ min: 64, max: 128, rate: 250 }`: `DAT_0040c070`, D:L68043-68050, D:L68126-68130 (87 s1.7, 190 D); only marks with `pulse` (the hostage's, the zone's) |
| `EXTRACT_CAPTION_READING` | viewer `hud.ts` (`gameCaption`, `setGame`) | `'EXTRACT'`: 0x3e5848, `FUN_0022be20` D:L79744-79758 |
| `MODE_CAPTION_READING` | none | resolved: the other four captions are read at the same switch (BREACH, DEMOLITION, ESCORT, SUPPRESSION: the mode names upper-cased); never code |
| `OBJECTIVE_MARK_RGB_READING` | viewer `hud.ts` | re-valued from one colour to a table by bitmap: the hostage's (62, 49, 36) and the extraction's (36, 40, 62) read (D:L68670-68705); the bomb's and the base's rows left at XR-06's (32, 62, 32), open (research 214 s6) |

## 9. Owed

- C2 (HX-4a): the jail's cells (`ORDER_CELL_FIELD_READING`: body `+0xe8` of a jailed hostage, of a SEAL at the bars and
  of one on the jail's upper floor -- sub-maps 0, 0 and 3 by the read below); a Terrorist aims at a hostage within 20 m -- FOLLOW! offered (`+0xed0` bit 14) and taken (ctrl `+0x5d4`);
  the 19/20-cell edge; a leader killed and a leader quitting mid-lead -- the YES, the hostage's ctrl `+0x10c` unit with
  `+0x58` == 0x11 within a frame, FOLLOW! offered to a second SEAL; HOLD inside the fade (with HX-5's score read);
  whether a client hears the YES.
- V2's owed #1: every online player has a unit of its own (`UNIT_PER_PLAYER_READING`).
- `ORDER_CELL_FIELD_READING` (the review of 27e2bf99) -- **read, DF-7 (2026-11-08; reading, its review `agent-mail/evidence/dg-fishhook-readiness-2026-11-08/REVIEW-DF-7-1.md`).** The
  writer of body `+0xe8` is `FUN_005b7ba0` (D:L471318): it stores the word `FUN_0052dc70` locates for the body's feet
  (D:L471278) when that cell is traversable (`FUN_0052a090`, D:L471288-471291) and its x / z changed or `+0x1061` bit 6
  is set (D:L471284-471286, D:L471309); `+0xe4` takes the located word every time (D:L471283). The locator's x / z are
  the located sub-map's **own** indices -- (x - the sub-map's min) x its scale (D:L397251-397252), the sub-map in bits
  0-5 (D:L397264), bounded by its width and depth (D:L397265-397266) -- so `FUN_00591dc0`'s range (D:L451427-451448)
  compares two local cells as one lattice; r0004's twin keeps it (r4 0x597758-0x5977c0). The premise above was half
  right: on the MP6 fixture the hostages' starts (and a body on the jail's floor, y ~50) locate on **sub-map 0** (the
  base map stores those cells and, though its layered bit 21 is set there, no other sub-map's cell lies nearer the
  feet's height), and so does a SEAL at the bars outside (1700, 50, 1190): (99, 6)
  against (104, 5), 6 cells, FOLLOW! offered in both. Where the lattices part is a body on another sub-map: a SEAL on
  "Jail House - Upper" (sub-map 3, origin 91 x 2 cells off sub-map 0's) above the cell at (1740.3, 90.2, 1249.7) is
  (12, 10) on sub-map 3, 97 cells off the hostage in the original, 8 on the port's old sub-map-0 lattice; in the
  basement (sub-map 4, 84 x 2) at (1690.3, 10.2, 1229.7), (14, 8): 93 against 11. Built: the page and the room both take
  the located cell (`orderCellOf` -> match `hostagePath.ts` `locateAiCell`, the planner's own locator made a free
  function); `roomHostageOrders.test.ts` holds the three positions on the MP6 fixture (RED on the old lattice: the
  upper-floor order taken). Not modelled: the hold of `+0xe8` at the last traversable cell while a body stands on an
  untraversable or unstored one (the port takes the located cell, or none: out of range) -- the page keeps no per-body
  cell, and page and room must agree (LATER 780: a per-body hold both would keep). **Death Trap (MP11) changes widely**
  (the review's F1): its hostages start on sub-map 2 ('Hostage' at (1195.85, -139, 784.24) is its (35, 69); sub-map 2's
  origin is 84 x 3 cells off sub-map 0's), and at her height the locator puts a SEAL 30 u to her +z (and Hostage2's +x and
  -x, Hostage3's +z and -x) on sub-map 0, 84-90 cells off her -- refused, where sub-map 0's lattice gave 3 cells (offered);
  30 u to her +x he stays on sub-map 2, 3 cells, offered (`roomHostageOrders.test.ts`'s MP11 case, on the disc; RED on
  the old lattice). Which side of such a seam a body falls is the locator's (`HOSTAGE_LOCATION_READING`: the first map's
  layered bit, the height tolerance), so the order's offer near a sub-map seam is only as good as that reading. Owed:
  C2 (a SEAL beside the shut and the opened door on MP6, and one on its upper floor; on MP11 a SEAL a few metres to a
  hostage's +z and +x at her start: is FOLLOW! offered) -- added to the plan's H431 (the C2 session re-asked for the
  release, `docs/plans/2026-11-08-desert-glory-fish-hook.md` on `agent/df-plan`).
- C2 (HX-5): a SEAL leading a hostage onto Safety (the AI word's 0x11 and `+0x5c` within a frame; the leader's +3 and
  brought out); a Terrorist's lead into Safety (no score change; `rescuecount` +1); HOLD inside the fade (the leader's
  score twice, the AI's top state) and a shot inside it from the host and from a client (+0x1044, +0xe1 bit 4, +0x105c);
  the primary objective on GAME COMPLETE after a two-hostage round; the compass in a frame (the hostage's and the zone's
  colours and pulse).
- The stats record's HOSTAGES RESCUED (PLAYER INFO's line 0x3f4e30, `FUN_002f0020` D:L192097): research 155's work.
- XR-06's bomb marks never draw: `ret_bomb.tif` / `ret_base.tif` are in no `HUD_LIBRARIES` list (found here; one line in
  `hudAssets.ts` and two pins in `hudBitmaps.json`, the bomb lane's). *Done 2026-10-10 (`ccr-ef8214e9-7mkm9s`, pending review): `hud.test.ts` holds every
  compass mark's bitmap in HUD2.*
- The page posts the Rescue line on the 0x11 the room tells; the script's INREGION one-shot would also fire for a hostage
  standing in the zone after its departed leader was forgotten (it counts in the room's valves, §4.1): no line for it.

### 9.1 The room half (HX-4a, wave 3, after HX-1 merges) -- LANDED

Built on `agent/hx4a` after HX-1's merge (c9156a92): `extraction.ts` (`leaders`, `order`, `release`, the UnitTick each
game frame, `rekey` by `unitOfSeat`, `reset(tell)` / `tellAll`), `room.ts` (`text()`'s case, `kill()` / `leave()`'s
release, `takeOver`'s rekey, `orderPick`, the reset states after `roundStart`, the hit volumes by character); held by
`packages/central/test/roomHostageOrders.test.ts` (seven cases). Three of HX-1's lines the reviews found are corrected
there: the takeover compared the hostage's unit with the raw seat id (units are seat + 0x20); the reset states went out
before `roundStart`; `hostageVolumes` keyed the escortee by record index (the page keys by character). A leave releases
after the seat is dropped, so the UnitTick sees no living member and the issuer is none (the host's player in the
original). The plan as written before the build:

1. `packages/match/src/extraction.ts` (HX-1's): the hostages made by `createOrderedHostage({ id, random:
   this.host.random }, this.leaders)` (a `readonly leaders = new HostageLeaders()`), so a `Hostage`'s `ai` / `leader` /
   `lastLeader` are an `OrderedHostage`'s. `order(issuerId, ev)`: the issuer by `host.player(issuerId)` (alive,
   `role !== 'player'` as the spectator, `PLAYER_TEAM_MASKS[team]`, feet), the hostage by `ev.hostage` (none: dropped
   `'gone'`), then `orderRefusal({ cmd, issuer, hostage: { ..., unit: h.ai.unit, hidden: h.ai.hidden }, eye, dir }, {
   cellOf: (f) => aiCellOf(map.ai.maps[0], f[0], f[2]), pick: (eye, dir) => crosshairPick(bodies, pickSurfaces(grid,
   eye, far, defaultMaterial)) })` -- `bodies` every living player's and hostage's `rayBody` on its volumes at the
   room's present (the page aims at what it draws), `far` = eye + dir x `ORDER_PICK_REACH_READING`; a refusal ->
   `host.dropped('hostageOrder', why, issuerId)` (INT.R5's tally); else `onCommand(h, cmd, { id, alive }, this.leaders)`
   and the hostage's `hostageState`. `release(seat)`: `releaseLeader(this.hostages, seat, this.leaders)`, then
   `unitTick(...)` and a state for each moved. `unitTick()` once a game frame before the AI's step. `rekey(old, id)`: a
   hostage's `leader` / `lastLeader` and its `ai.unit` (`unitOfSeat(old)` -> `unitOfSeat(id)`), the count moved.
2. `packages/match/src/room.ts`: `text()` -- `case 'hostageOrder': if (isInt(ev.seq) && isInt(ev.hostage) && (ev.cmd
   === 4 || ev.cmd === 5) && isV3(ev.eye) && isV3(ev.dir) && !this.mountedRefused(id, 'hostageOrder'))
   this.extraction?.order(id, ev); else this.dropped('hostageOrder', 'shape', p); return;`; `kill()`:
   `this.extraction?.release(victim.id);` beside the bomb's `dropped(..., 'death')`; `drop()` / `leave()`: the same line
   beside the bomb's `'leave'`; `takeOver`: `this.extraction?.rekey(old, id);` beside `bomb.rekey`; `startRound`: the
   reset's `hostageState`s after the `roundStart` broadcast (§3: the page forgets the units at `roundStart`, so a reset
   says no YES).
3. The bars (`BARS_SWAP_PLACEHOLDER`): which of `nohostagerescue` / `okhostagerescue` the room's grid holds on MP6 (one
   probe of the fixture's grid along x 1731.2-1734); the note says which, no door hook built.
4. `packages/central/test/roomHostageOrders.test.ts`: the four `it.todo` titles made tests on the MP6 fixture
   (`roomBomb.test.ts`'s pattern) -- a SEAL's and a Terrorist's FOLLOW, the second FOLLOW `'led'`, HOLD from the leader;
   the leader's death and leave with the UnitTick's HOLD the same frame and a takeover; HOLD inside the fade (199 §1's
   replay) and nothing past it; the mounted, misshapen and unknown-id orders dropped with their why.

### 9.2 The sprint 31 fix-up (2026-10-07) -- CLOSED

The main merge controller's integration review of sprint 31 (PR #54, main 1ff53193) found three things; one PR
(`agent/hxfix`) closes them:

1. **The order's eye was the page's, unbounded** (`room.ts` `orderPick`): a modified page within 20 cells could put
   `eye` past the jail's bars and FOLLOW through them, against §1.2's "the grate always blocks". Closed here by casting
   from the issuer's camera eye as the room holds it, along the page's `dir` (`ORDER_EYE_READING`) -- **retired by
   HX-OBEY (§9.3, 2026-10-08)**: the room's own line is not the page's wherever the page's camera ran its lead probe or
   its pass, and the owner's live room refused honest offers `'not aimed'`; the wire's `eye` is now trusted inside the
   body's camera envelope and the walls (`ORDER_EYE_TRUST_READING`), which closes the forged-eye hole the same way (past
   the bars is past a wall from the head: `'eye'`). The paragraph below is the fix-up's record as written. `orderOrigin` builds
   it as `localCamera(...).eye` through `toWorld` on the `AimFrame` of the command the order names or the next, pulled in toward the
   look-at target short of a wall by `headEye`'s rule. The original's pick is the camera's (D:L142028), and the page's
   line leaves from that same eye. Measured (`roomHostageOrders.test.ts`): built on the same frame, the page's line passes within 0.0038 u of the room's origin (0.0028 u in quadrature) -- the wire's quantisation of the look alone: a yaw half-step of 0.00275 deg (u16) and a pitch half-step of 0.005 deg (i16 / 100) on a camera orbit of at most ~28.6 u; measured 0.0015-0.0023 u upright, prone, leaning and after a turn, held under 0.004 u. The 0.0055 and 0.0087 u an earlier test page showed leaning came from building its line on the previous command's frame (its feet and peek, read before the tick), not from quantisation. Four earlier versions failed review. e89e1952 cast from the camera eye of the last command *run*; the page sends the order at the command it has just *sent* (`lastSeq()`), which `binary()` only queues while `text()` handled the order on arrival, so the room's look was a command or more behind -- with the eye orbiting the target 28 u out, the review measured 16-57% of page-offered aims refused while turning at 90 deg/s, 37-72% at 180 deg/s. eb6dd1f6 put the order on the timed path, decided when the command it names had run (`sim.seq >= seq`) and cast from `cone.frame(seq)` alone; its review found the page's look runs 0-1 command past that command (§8 (b)), so one frame refused 13.3% of offered aim points at 90 deg/s and 20.0% at 180 deg/s. Now the order rides the timed path (`timed`/`settle`, as a round): decided once the command after the one it names has run (`due`: `sim.seq > seq`), the hostage the pick from `cone.frame(seq)` or `cone.frame(seq + 1)` (`orderPickEither`; from either, 100% and 99.9% taken); one more than `FIRE_ARRIVAL_JITTER_TICKS` behind the commands run is dropped `'stale'` (no `stale` event: the page has nothing to reconcile); one whose command never runs waits at most `PENDING_TICKS` and is dropped `'its command never ran'`, as a round's; the waiting queue is the round's (`PENDING_MAX`). 48f0b309 cast from
   `headPoint`, about 5.3 u under the camera line standing or crouched and 2.0 u prone. 1db8a753 cast from the look-at
   target, which a leaning page's line misses by 2.4-2.7 u. In both cases the page offered orders the room refused. The wire's `eye` keeps its shape check and is not used. And an order whose `seq` is at or below the player's last order's (`Player.lastOrderSeq`) is
   dropped `'stale'` in the room's tally, before the hostage is looked up. Held by `roomHostageOrders.test.ts`: "an order
   whose eye is placed past the bars by the client is cast from the room's own camera eye and refused by the grate" (a
   synthetic METAL_GRATE wall on the flat floor), "an order aimed down the page's camera line at a standing hostage's
   lower body is taken upright and leaning right and left, and HOLD so aimed at a prone one (the pick from the room's
   own camera eye: ORDER_EYE_READING, D:L142028)" (each order sent before its command runs, the gaps above), "an order
   sent at a command whose look has just turned, before that command has run, is cast from that command's camera eye and
   taken (the timed path: the pick waits for the command the order names)" (turning back onto the shins in steps of 2 deg a
   command, NET-LOOK's gate, aimed 0.5 u inside the edge the previous command's eye pushes the line past: e89e1952's cast
   from that eye misses, checked), "an order whose page's look runs one command ahead of the command it names (1.5
   degrees: 90 deg/s at 60 Hz) is taken: the pick holds from the next command's camera eye though not from its own
   (ORDER_EYE_READING, either frame; 191 s12.4)" (RED on eb6dd1f6: "not aimed") and "a hostageOrder with a stale seq is
   dropped". The file's helper aims from the camera eye (`cameraLook` on the room's
   frame), sends one more command for a second order since the last command ran, and runs one command after each order
   (the room decides it once the command after the one it names has run), and `started` stands the four players 10 u apart across (3 u apart their capsules overlapped, and a ray
   from one head crossed a neighbour's body).
2. **Member ids could reach the hostages' 240-242** (`server.ts` `freeId` handed out 1..255; a game lobby's room takes
   its spectator slots from the host's GameStats byte 4, `bridge.ts` `roomOptions`). Closed: `freeId` hands out
   1..`MEMBER_ID_CAP` = `HOSTAGE_ID_BASE` - 1 = 239 (a port rule, as `HOSTAGE_ID_BASE` is: the original's ids are net
   object indices, 191 §1; its player limit is 16, research 91; 190 and 191 read no spectator limit) and null past it,
   which both join paths already refuse as the full room's (4000, "The game is full."). Held by `server.test.ts`: "a
   room filled past 239 never hands out a hostage's id; the 240th joiner gets none (the game is full)". 237 §2.1's ids
   paragraph corrected.
3. **237 §1.3 said the escortees were placed on game types 4 and 3; the code enables 4 only.** Type 3 is ESCORT (190
   §10.2, the mapping written out; `FUN_002c9540` D:L168876-168906, `FUN_00545390` D:L411530) and its escortees are the VIPs of The Mixer, Foxhunt and Guidance (175 §2), sprint
   32's MAP-08b. The code is right; 237's line corrected.

### 9.3 HX-OBEY (2026-10-08): "X on a hostage does not make it follow" -- the order path at a real cadence

The owner's play test on main 50a98582 (`/testroom` ONLINE, two players, MP6): the action button on a hostage, and
nothing visible. The brief's suspects were §9.2's timed path (the order's `seq` the last command SENT, decided once the
next has run, `'stale'` past `FIRE_ARRIVAL_JITTER_TICKS`), NET-LOOK's clamp (the room's frame behind the page's
crosshair) and the cell lattice (`ORDER_CELL_FIELD_READING`: the jail on sub-maps 3/4, measured on sub-map 0).

**The order path takes a real page's order.** `packages/match/test/twoPagesHostageOrder.test.ts` (new): two of the
page's own `NetClient`s over real sockets into a `MatchServer` room on the MP6 fixture, the SEAL stood in the jail
beside Hostage, its look turned onto the body under the gate, the order sent as `NetPage.hostageOrder` sends it
(`seq: lastSeq()`, the camera eye, the reticle's unit direction). Written to fail as the play test did, it is GREEN on
main 50a98582: `hostageState` ai 9 with the SEAL as leader on both pages, `takeDrops()` null -- no `stale`, no
`not aimed`, no `range` (sub-map 0's lattice covers the jail: `aiCellOf` gives cells for both bodies). The trace, gate by
gate, is in the test's header and the brief's answer (HX-OBEY): the page's offer (`HostagePage.compute`, the same
`orderTestRefusal`), the lifecycle's release (`ActionWiring.release` -> `fireContext('escortee')` -> `HostagePage.fire`
-> `NetPage.hostageOrder`), `room.ts` `text()`'s shape and `lastOrderSeq` checks, `timed` / `due` (`sim.seq > seq`) /
`decide` (`sim.seq - seq <= 3`), `extraction.order` -> `orderRefusal` -> on main `orderPickEither` from `orderOrigin`'s
eye (now `orderPickTrusted` from the page's).

**What the play test saw is HX-4b's absence.** A taken FOLLOW moves no hostage on main: state 9 holds its point
(`hostageAi.ts` `FOLLOW_MOTION_PLACEHOLDER`, HX.R4; 238 §5), so the body stands where it stood -- the test holds that too
(`at` unchanged a second after the order). What a taken order shows a player: the prompt turning from FOLLOW! to HOLD
POSITION (the same `escortee` icon), the YES at the body (the sound part), the compass. The walk is sprint 32's HX-4b
(research 200's planner). No browser spec drove an order end to end before this (the wave-4 batch's browser check was
the compass marks, §7.1); `packages/viewer/e2e/hostageOrder.spec.ts` (new, with its harness `hostageHarness.ts`) now
does: two pages, the SEAL stood in the jail by the room, aimed within the law, X pressed, the room's hostage in state
9 with the SEAL as leader within 2 s and both pages told -- an order that does nothing cannot pass it.

**The owner's live room (8787, one page, `view=modern`, the pad) refused every tap `'not aimed'** -- fourteen
`dropped "hostageOrder: not aimed"` lines over his taps while his HUD showed the escortee icon: the page offered, the
room's own-eye cast (§9.2's `ORDER_EYE_READING`) missed. The two lines part wherever the page's camera does what the
room's reconstruction does not: `playerCamera.ts` leads the look-at target back from a wall ahead (`FUN_0029cbb0`,
looking down past ~39 degrees), pulls the eye in short of a wall behind and pushes it off the walls beside
(`cameraPass`, `FUN_0029bf70`), and rides the animator's posed root (`ROOT_POSE_SLACK_PLACEHOLDER` 4 u) where the
room's frame has the move's; the page's look may also run a frame past the command (§8 (b)). A headless scan with the
page's real camera (`roomHostageOrderEye.test.ts`: `PlayerCamera` on MP6's hull, 9-24 u south of a kneeling Hostage,
standing and crouched, every pitch) found the room's own cast agreeing at every offered look while the body stood
still -- so the reconstructed-eye divergence is NOT the demonstrated headless cause of the live refusals (the review of
f96db3ce corrected an earlier claim here); the demonstrated one is the page's pick shape (`aimBodies` on SEAL capsules,
below: 28 of 127 offered looks). The divergence is the hypothesis for the live log's moving, turning player -- the
animator's posed root under the page's camera (`ROOT_POSE_SLACK_PLACEHOLDER`, up to 4 u off the room's move root),
the pass, a look a frame ahead -- and it is held by one constructed case in the same file: the page's camera on a root
3 u higher than the frame's, at a look on the kneeling hostage's edge, main's cast from the room's own eye at the
order's command and the next refuses `'not aimed'`, the trusted eye takes it. Under ~9 u the third-person line cannot
reach a kneeling body at all (the look-at target leads 5-8 u ahead, 21 u up: no offer, no icon), so the owner stood
farther. **The fix (the merge controller's call): the room casts from the page's eye, trusted** --
`ORDER_EYE_TRUST_READING` (§8): within 1.57 u of the camera's locus at the order's command or the next (`ShotCone.eyeAt`:
the locus swept by the root straight up and by the lead probe back along the facing; a bound that much wider than the
locus, never the locus), reachable from the body's head past no polygon, the grate rule kept; else `'eye'`. It closes
the divergence by construction: the room casts the line the page cast. The original's host trusts the issuer's
console outright (191 §12.4); the port trusts it bounded. A seen edge (the scan): a SEAL pressed to the bars looking
down 55-70 degrees has its real camera eye PAST the grate (x 1734.6; the pass stops at camera surfaces, not at the
grate), where the head-to-eye clip refuses `'eye'` -- the page offered nothing at those looks in the scan, but a page
whose eye is inside the jail that way could offer and be refused; owed to a browser pass at the bars.
A second page-side divergence of the same kind: main's page cast the hostage's pick on SEAL type 0's capsules (below).

**Owed (2026-10-08): the browser proof of a taken order from a real page.** `hostageOrder.spec.ts` (its two tests
`test.fixme`, the harness and the logging kept) ran four times on this host: the stand the harness gives the SEAL is
lost -- the third run to round 1 starting after the place (fixed: placed after both pages' `roundStart`), the fourth
to the seat being dropped and re-seated during the aim sweep (`room gone` ~1 s, then fresh start spawns with
`after > 0`; no kill, no roundStart, no abandoned frame; nothing in the harness's log). Suspected: the heartbeat
terminating a headless page's unanswered socket under load (`server.ts:170-172, 269`: 5-10 s unanswered). Owed to
the harness seat holding; what to look at next: the heartbeat / pong of a headless page, and `net().state` and
`closeCode` logged beside the frames. The order's proof stands on the headless twins (`roomHostageOrderEye.test.ts`
with the page's real camera, `twoPagesHostageOrder.test.ts` with the page's own `NetClient`).

**What the original draws for an order (HX-OBEY's read of `CZActionBitmap`, 2026-10-08): the icon alone.** `FUN_0021ded0`
builds each context entry as a bitmap widget (`FUN_001feae0`) with its texture and id, and copies the entry's name
beside it (`FUN_00199060`, a string copy): 0xe takes `action_escortee.tif` (0x3e4dd0, `lVar17`, the first entry's
`action_x.tif` when missing) and "FOLLOW!" (0x3e4f00), 0xf the same bitmap and "HOLD POSITION" (0x3e4f08)
(D:L73782-73801). The render `FUN_0021f210` (D:L73870-74037) draws quads only -- the primary box at `DAT_003dc628` +/-
`DAT_0040c160` (`FUN_003646d0`, the pulse colour `FUN_00364930`, the widget's draw vt+0x1c), then up to two more
alternately left and right -- and calls no text routine; the one text widget of the slot, the "ACTION ICON" label
(0x3e4f18) at (306, 358) scale 0.9, is made only with a font (`param_3`) and set to alpha 0 at once (vt+0x34(0),
D:L73802-73806; research 87 §5 "hidden"). So the words FOLLOW! / HOLD POSITION are the entries' names, never on
screen, and both orders show the same picture: `hud.ts`'s icon-only slot is the original's (no HUD gap). A taken FOLLOW
is seen in the original by the YES, the hostage walking (HX-4b) and the radio line CMD_MP_ESCORTEE_FOLLOWING 0x2b
(`RADIO_CHATTER_PLACEHOLDER`, unplayed in the port) -- none of which the port shows on main but the YES.

**Two things found beside the cause.** (1) `remotePlayers.ts` `aimBodies` cast a hostage's body on SEAL type 0's
capsules (`volumesOf(r.team, r.type)`: a hostage remote is `team 'seal', type 0`), where `aimDistance` and the room's
`hostageVolumes` take the hostage's own character's (`escorteeVolumesOf`) -- the page's offer and the room's pick on
different shapes. Measured on MP6's kneeling Hostage from 9-24 u with the page's real camera
(`roomHostageOrderEye.test.ts`, the third case): of 127 looks main's page offered on the SEAL crouch shape, the
room's own-shape pick met 99 -- **28 (22%) refused `'not aimed'` with the icon showing**, a second honest refusal of
the owner's kind. Corrected: `aimBodies` takes the escortee's volumes; held by `remoteAim.test.ts`.
(2) `roomHostageOrders.test.ts`'s "aimed down the page's camera line" case was RED on main 50a98582 (`{ 'look: pitch': 1 }`
in the tally it expected empty): its turn jumps the look in one command, which NET-LOOK's gate clamps and tallies; the
tally is now read after the turn, so the order's refusals alone are asserted. The HX-fix row of research 101 and the
registry's `hostage.order.forward` / `hostage.order.pick` / `hostage.ai.follow-stands` name the new tests.
