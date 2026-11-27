# 428 -- A following hostage opens a shut door: CAiSAction's aim and tick, the player's use, the marker binding (LATER 958)

- Date: 2026-11-15. Author: the wm-hostage lane seat (weekend mega sprint), Shadow PC 3.
- Track: **simulation**. Level: **reading** for the code lines below (the author's read, review 1 and its fold re-read,
  and 8f's independent second read at the bytes of r0001 and r0004, which corrected three of them: see Review); the
  behaviour it is built to is the rig's measurement of the original running (n = 4, one door, one map) -- relayed and
  not yet scored by a harness, so "proven" in s1 is scoped to that one-door observation.
- Sources: the r0001 game ELF's decompilation (`socom2_game.elf.decomp.c`, cited `FUN_<addr>`, `D:L<line>`, never
  pasted); research 418 (the walker's type-1 body, read from the bytes, and the binder `FUN_002a8140`, read twice);
  research 334 s14, research 404 s24.1 and s30; the rig's Q24 retry (hub
  `evidence/weekend-mega-2026-11-14/rig/RELAY1-Q24-retry-result-2026-11-15.md`, bucket
  `gate-runner/shadow/out/2026-11-15/q24-hostage-door/q24b-hostage-door-retry.zip`) and the Q24 first result
  (`RELAY1-Q24-first-result-open-door-2026-11-15.md`, item 3).
- What it changes: nothing by itself. It is the reading the main controller's ruling of 2026-11-15 06:47Z asks for
  before the port's code: what pushes the goal the rig saw above the follow goal, what that goal does, and what the
  port must carry for every map.

## 0. What is which: r0001 code, r0004 as the rig saw it, and what is unread

- **r0001 code (the decompilation of the r0001 ELF, one reader):** `FUN_005f0180`'s stores (+0x58, +0x5c, +0x70/+0x74,
  +0x7c); `FUN_005efa50`'s stages 0-9, its at-once completion, the use `FUN_002b44e0` and the wait on the use count at
  the object's **+0x3e**; the shut-behind block D:L429523-429540. Research 418's bytes (two readers) for the walker's
  type-1 body and the binder `FUN_002a8140`.
- **r0004 as the rig saw it (measured, relayed):** the goal's class word 0x00668fe0, its +0x30 = 11 and +0x58 = the
  door's action object; the use byte at the object's **+0x42** (2 -> 3 at the hostage's open; r0001's +0x3e: the
  action object grew 4 bytes in r0004, research 418 s22.13 and LATER 958); the binding's six ids; where the hostage
  stood, the timings, the stop, no shut behind, no open when still.
- **r0004 at the bytes (8f's second read):** r4 0x2b5ef0 IS `FUN_002b44e0`'s twin (0x2b5f08 lies inside its prologue);
  r0004's player press (r4 0x22f0bc) and the hostage's action tick (r4 0x5f781c) both call it with a3 = -1, so on r0004
  the hostage's use is the same call as the player's press; the use byte moved +0x3e -> +0x42 (and +0x3f -> +0x43); the
  count's store is the use program's callback (r1 0x2b46d0, r4 0x2b6108); 0x668fe0 is r0004's CAiSAction vtable; the
  wanted state 1 in the aim call's delay slot (r1 0x567ff8, r4 0x56d338); the shut-behind save gates word for word the
  same as r0001's.
- **Unread:** the rest of r0004's twins of `FUN_005efa50` and `FUN_005f0180` word for word; why r0004 does not shut
  behind (the gates are read, s3; their values in the frame of the open are not -- a rig leg is ordered); the binder's step-A name lookup
  (`FUN_00530f40`, `FUN_00351ef0`, `FUN_002b4e00`); the reach animation's clip; any sound; `FUN_0056cbf0`(actor, 4) and
  `FUN_0056dca0`(actor, 0)'s bodies (the movement state stage 6 sets); what sets the controller's +0x171 bit 7 the rig
  saw for 1.2 s before the open.

## 1. What the original does (measured; the rig's Q24 retry, r0004, MP71, door_rg_1)

PROVEN (4 of 4 runs; one door, one map, one hostage body, the leaf shut by a teammate's use, the game clock at 0.86 of
wall with three consoles):
- a following hostage whose way to the leader lies through the shut door opens it ITSELF, from the cell just before
  the door's marker cell, 6.6-9.3 u from the door's point, without walking into the leaf first;
- the open is a USE of the door's action object: the door's use byte (r0004 +0x42) goes 2 -> 3 as for a player's use;
- it crosses the door's line 0.75-1.03 s after the open and stops 20-24 u from the leader;
- it does NOT shut the door behind it (the door stays open to the end of every run);
- with the leader standing still beyond the shut door it does not open it and does not move (1 of 1: 0.00 u, 23.9 u
  from the door, 44.7 u from him, goal follow).
- The follower's own words: halted, goal stack count 2, follow on top, target cell the marker cell (223,83); going to
  the door (Tb1, Rb2) count 3, the top a goal of class word 0x00668fe0 with +0x30 = 11 and +0x58 the door's action
  object; after the open, count 2 and follow again; its controller's +0x171 bit 7 set for the 1.2 s up to the open.
- The rig's video shows the hostage stop, reach toward the leaf with its arm, the leaf swing, the hostage walk through.
  No audio was recorded.

- **Two more shut-door samples from the door match** (r0004, MP71, runs C2 and C5; relayed by the main controller
  2026-11-15; one match): the door goal is pushed (stack 2 -> 3, class word 0x00668fe0, +0x30 = 11) with the follower
  9.00 u (C2) and 10.58 u (C5) from the door's point; the door's state 0 -> 1 1.23 s (C2) and 1.27 s (C5) after the push;
  the goal popped; the follower crosses 0.78 s after the open (C2); the door stays open. (Corrected 2026-11-18: these are
  distances AT THE PUSH, the retry's AT THE OPEN; they are not one band -- s8.) The shut-behind block's save gates (s3) read CLOSED in every row of
  both runs (C2 4988 rows, C5 4710): the controller's +0xb4 = 0.0 (gate one needs below 0.05 -- passes), +0x264 =
  0x00381010 / 0x00381000 (bit 0x2 never set -- gate two PASSES), +0x61c = +0x620 = 0xffffffff (nothing saved), the
  actor's +0xc8 = 0xc0020000 (0x20000 set -- gate three FAILS): gate three keeps the marker unsaved, consistent with no shut
  behind. (Corrected 2026-11-18 on the bodies seat's fresh review, finding 2, re-read by the seat at r1 0x56804c-0x5680d4: each
  gate SKIPS the save on a set bit; the first form said gate two fails and keeps it alone. C7, q27, recorded the same values.)
  During the door goal the controller's +0x3f4 reads 1, 4, 5, 1 (6 under the follow goal).

## 2. The goal: state 0xb, CAiSAction [reading, pending review]

- +0x30 = 11 is the goal's state id 0xb; 0xb is `CAiSAction` (the factory `FUN_005f6550` D:L506016-506025; its
  r0001 vtable 0x669660, whose type name "CAiSAction" is at 0x662890: research 334 s14). The rig's class word
  0x00668fe0 is r0004's; it is not checked against r0004's bytes here (an r0004 vtable at that address is the
  expectation when first written; CONFIRMED at the bytes by 8f's second read: a reading).
- **Its aim, `FUN_005f0180` (D:L502697-502761).** It stores the action object at +0x58 (the rig's +0x58) and the wanted
  valve state at +0x5c; when the wanted state is passed as -1 it is the valve's opposite (the valve's u16 at
  [object+0x18]+4: non-zero gives 0, zero gives 1). It finds the action's marker cell by the action's id (`FUN_0052daa0`
  with the object's +0x3c) into +0x70 (+0x74 a copy, the approach cell); it reads the marker's type into +0x7c (types
  1 and 2 set +0x2c |= 0x80000000 | 0x10); a failure sets stage 9 (the goal's exit) and clears +0x4a & 0x2.
Masks below are written as 0x-values (review 1, finding 8).

- **Its tick, `FUN_005efa50` (D:L502470-502690; slot +0x10 of the vtable, research 418 s22.13).**
  - It runs while +0x4a & 0x2 is set and +0x58 is non-null. At the top of EVERY tick (not only at the aim) it reads
    COMPLETE (+0x28 = 1) when the object has no valve or the valve already equals the wanted state (D:L502499-502504;
    and D:L502689 when +0x4a & 0x2 is clear). So the goal ends on whichever comes first: the door's valve reaching the
    wanted state, or the use count's rise in stage 7 (review 1, finding 1). An action aimed at an already-open door to
    open it does nothing.
  - Stage 0 (D:L502508-502528): with +0x2c & 0x2 it goes straight to stage 6 (no approach); else stage 2 (a route to
    the approach cell, `FUN_005623b0`, stages 2-5). A facing vector at +0x60..+0x68, when set, turns the body first
    (`FUN_0056daa0`, stage 1); the type-1 push writes none (review 1, from the bytes).
  - Stage 6 (D:L502626-502663): `FUN_0056cbf0`(actor, 4); without +0x2c & 0x2 a line test (`FUN_0056a130`); then
    `FUN_0056dca0`(actor, 0); the pick `FUN_005ec4e0` only when +0x2c & 0x1 (the type-1 push does not set it, so the
    pick is 0, the open); and **the use, `FUN_002b44e0`(object, the actor's +4 word, pick)** (D:L502654) -- in r0001
    the same use a player's press calls (research 92). In r0004 the door tick's call differs (research 417 s20.8 item
    3 read r4 0x2b5ef0 as another function). CORRECTED by 8f's second read at the bytes: r4 0x2b5ef0 IS
    `FUN_002b44e0`'s twin (the "located image" r4 0x2b5f08 is inside its prologue), and r0004's player press (r4
    0x22f0bc) and the hostage's tick (r4 0x5f781c) both call it with a3 = -1: on r0004 too the hostage's use is the
    player's use, at the bytes; the rig's use byte 2 -> 3 agrees.
    Refused: stage 8 (D:L502655-502656). Accepted: +0x84 the object's +0x10, +0x78 the object's use count (the byte at
    +0x3e, r0004 +0x42, research 418 s22.13; D:L502660), stage 7.
  - Stage 7 (D:L502665-502667): waits, with no timeout, until the use count exceeds +0x78 (D:L502666); then stage 8,
    which clears +0x4a & 0x2, so +0x28 reads complete.
  - **A refused use completes the goal as a success does** (stage 8): the follow goal resets and the walker can meet
    the same marker and push again -- the loop research 418 s22.11 (b) names as permitted by the code and observed by
    nobody (review 1, finding 3).
  - On completion the follow goal gets event 3 and its state resets to INIT (research 404 s24.1, D:L510103-510112;
    research 418 s22.11): the follower replans and walks on. Event 3 leaves +0x76 untouched, so the follow's start
    gate (trail 8.0) is NOT re-armed (review 1, finding 11); the rig's prompt crossing agrees.

## 3. What pushes it: the walker's type-1 body [read from the bytes by research 418 and review 1; summarised]

- The walker `FUN_00567900`, at a route point whose cell has bit 7 set (an action cell) with more than one point left
  (D:L429515), dispatches on the marker's type through the table at 0x65c990 (the text loses it at D:L429545-429551).
  Type 1's body (r1 0x567ee8-0x568150, research 418 s22.4) looks the marker's id up in the map's actions
  (`FUN_002b4d80`); the valve-zero test is r1 0x567f0c-0x567f14; then it pushes state 0xb (`FUN_005f5c00`(actor, 0xb,
  a2)), aims it (`FUN_005f0180`), and sets +0x2c |= 0x80000000 | 0x2 and +0x4a |= 0x2 -- so the hostage uses the door
  from where it stands (stage 0 -> 6). Valve non-zero: plain steering.
- **The push's conditions, all of them as read (review 1, finding 2):** (a) the test of `$s0` at r1 0x567f04 (research
  334 s14's untranscribed "second test") is a NULL GUARD on the route-point pointer (set at r1 0x567af0, D:L429497),
  not a run-time gate (8f's second read); (b) the push's third argument a2 is 3 when the top
  goal is a CAiSAction below sub-state 5 on another action, else 0 (r1 0x567f1c-0x567fa0); with 3 the gate skips its
  mask and same-type tests; (c) the gate `FUN_005f5cd0` admits 0xb on a FOLLOW stack by its masks (research 334 s14)
  and the follow goal's veto r1 0x555390 always allows (research 418 s22.11), but it has run-time bits (+0x265,
  `[actor+4]+0xe1` & 0x10, D:L505609-505611) and an override (research 418, the hub review's finding 7); (d) **a
  refused push issues four zero commands and returns (r1 0x5680e0): the follower STOPS for that tick, it does not
  steer.** What sets (c)'s run-time bits for a hostage is unread: `HOSTAGE_DOOR_PUSH_GATE_READING` (the port takes them
  as clear, as the rig's 4 of 4 opens show for this case); (a) is not part of it.
- **Where it stands when it uses it.** The dispatch reads the NEXT route point's cell: the follower is on its way to the
  marker cell and dispatches before it, which is the rig's "the cell just before the marker cell, 6.6-9.3 u from the
  door's point". The port's route already marks that point (`hostagePath.ts` `flag()`: `action` on the point whose next
  point's cell has bit 7).
- **The wanted state:** 1 (open), read from the bytes: r1 0x567ff8 `addiu a3,zero,1` in the aim call's delay slot (review 1,
  finding 5; confirmed by 8f's second read, r4 0x56d338 the same). The rig measured the open.
- **The shut-behind block** (D:L429517-429541): when the follower's current cell EQUALS the cell the type-1 body saved
  at the controller's +0x61c (D:L429517-429523), it reads the marker saved at +0x620, excludes type 4 (D:L429524), and
  when the bound action's valve reads 1 (D:L429527) pushes 0xb (`FUN_005f5c00`(actor, 0xb, 0), D:L429528), aims it with
  wanted state 0 (`FUN_005f0180`(..., 0), D:L429533), writes a facing vector (`FUN_0052d480` -> goal+0x60, D:L429535,
  so that goal turns first, stage 1) and sets flag 0x2 (D:L429538) -- a use, to shut (review 1, finding 4). The type-1
  body saves +0x61c/+0x620 only past three gates (r1 0x56804c-0x5680d4; decoded by 8f's second read, r0004 word for
  word the same): ONE, the controller's +0xb4 BELOW 0.05 (the first of the table at 0x65c700: 0.05, 0.4, 0.6, 0.8,
  1.0); TWO, the controller's +0x264 & 0x2 (not 0x1, as review 1's fold had it); THREE, the actor's +0xc8 & 0x20000
  -- the candidate for why the rig saw no shut (a rig leg reads them in the frame of the open). **The rig did not see it** (4 of 4: the door stays open). Not built;
  `HOSTAGE_DOOR_SHUT_BEHIND_READING` names those three gates as what would settle it, beside r0004's twins.
- **r0004's type-1 body** (r4 0x56d228-0x56d418) matches r0001's, its gates included (8f's second read): the missing
  shut-behind is not explained by a change in this body.
- **The aim, three more effects** (8f's second read, notes): +0x74 can be rewritten by `FUN_00529300`; a
  `FUN_002b49a0` failure sets +0x2c & 0x8; without flag 0x2 the stage-6 line test can send the goal back to stage 2
  and count a retry at +0x6c. None applies to the type-1 push (flag 0x2 set).
- **The original's own wire** (8f's second read, for the record): the use sends a network message through
  `FUN_002bb5b0` when +0x3f & 0x1 is set and the user's +0xc0 call returns 0 (D:L156845-156855); whether a hostage's
  use goes out on the original's wire is unread. It does not change the port's wire (s5a).
- **Why it does not open with no need to move**: the dispatch runs only from the walker's route; a halted follower
  (sub 7, its goal reached) walks no route, so it meets no marker.

## 4. The binding (LATER 958's root)

- `FUN_002a8140` binds markers of types 1, 2, 3, 5 and 7 at load, AFTER the load's reset of every id to 0xffff and after
  the actions have their ids (research 418 s22.10, read twice; the store r1 0x2a8c20 the text lists as a removed
  block, D:L149776): by name when the cell's record holds one (step A), else to the nearest action object in x-z within
  25.0 in height (step B, `FUN_002b4b40`, which starts at D:L157076; no horizontal limit; the text's only caller of it,
  D:L451024, passes 20.0, so the binder's 25.0 rests on research 418's bytes alone); the marker's bits 4-19 become the action's
  load index.
- MEASURED (research 404 s30): MP71's six markers read ids 1, 3, 4, 0, 2, 5 after the load, against twelve actions.
  `FOLLOW_ACTION_BIND_PLACEHOLDER` settles as BOUND.
- The port binds at load for every map (never a per-door switch): each type 1/2/3/5/7 marker to its action by step A's
  name where the record holds one, else step B's nearest. Step A's name source (`FUN_00530f40`, `FUN_00351ef0`,
  `FUN_002b4e00`) is not read here; if the port cannot read it, step B alone is used and the gap named
  (`MARKER_BIND_BY_NAME_READING`), its unit test holding MP71's six measured ids.

## 5. What the port must carry (the task's acceptance)

1. The binding, at load, every map (s4), with its unit test on MP71's six measured ids.
2. At a route point marked `action`, with the next cell's marker bound to a door whose valve is 0 (shut): the
   follower stops its steering and uses the door with pick 0 through the room's own use (`DoorSet.use`, its swing and
   its existing `doorUse` broadcast); it waits, with no timeout, until the door's valve reads open (s2: the top-of-tick
   completion; s5a); then its follow state resets to INIT (sub 0) without re-arming the start gate, and it replans and
   crosses. A refused use (busy mid-swing, no program) completes the action as the original's does: the follower
   resets and, meeting the marker again, pushes again (no guard invented). The gate's run-time bits (s3 (c)) are taken
   as clear (`HOSTAGE_DOOR_PUSH_GATE_READING`); (a) is a null guard the port's route never trips. A locked door (valve 99) is valve non-zero: plain steering.
   The hostage's use does NOT fire the rules engine's `interact` event a player's use fires (`room.ts` `useDoor`):
   whether the original's scripts see an AI's use is unread (`HOSTAGE_DOOR_RULE_EVENT_READING`; review 1, finding 10).
3. Valve non-zero: plain steering (task 1's crossing).
4. Not built: the shut behind (s3); any sound of the hostage's own (none is read; the door's own program plays its
   sound for the hostage's use as for any use, `DoorSet.use`). The reach the rig filmed is probably
   NOT a clip to be found (an INFERENCE, not read): the door's own program pushes `Open door` (`ai::ANIMATE` 63, `OPEN_DOOR_TYPE`) on the
   presser's body and orders the presser toward the door (`ai::MOVE`, `DOOR_MOVE_ORDER_READING`; `viewer/src/doors.ts`
   26-28), so a use with the hostage as the presser (`DoorSet.use`'s `actor`) runs the original's own animate. Whether
   the port's hostage body plays that push is `HOSTAGE_DOOR_REACH_PLACEHOLDER`'s question (review 1 fold, finding 3);
   no separate reach is built, and telling a page the presser was a hostage would be a wire change (not in this task).

## 5a. The use counter and what a player sees; the wire

- **What the counter does in the original (r0001 code, research 418 s22.13):** the use `FUN_002b44e0` (D:L156798-156800)
  and the offer `FUN_002b46f0` (D:L156879-156881) refuse an action whose `+0x3f` bit 3 is set once its count is
  non-zero (a one-shot action), and CAiSAction's stage 7 waits on it (s2). Nothing else that reads it was found in
  this read. door_rg_1's bit 3 is clear: in the retry a use was accepted while its count was non-zero (the hostage's open,
  2 -> 3, measured; the first result's step 0 counted 38 presses, many changing nothing). So **on a door the count changes nothing a player sees** -- no prompt, no refusal, no sound, nothing drawn.
  The rig's 2 -> 3 is the evidence that the hostage's open went through the same use as a player's, not a visible
  change.
- **The port** keeps no use count (`viewer/src/doors.ts`; the room refuses a running swing, a locked door, or a door with no program: `room.ts`
  `useDoor`).
  Nothing in the port needs one but the hostage's wait; where the count rises (its store) is unread (research 418
  s22.13: "the store that increments it was not looked for"), and it rises after the use returns (the record is taken
  after the call, D:L502660). The port ends the wait when the door's valve reads open: that is r0001's own top-of-tick completion (s2,
  D:L502499-502504), not a guess. What is not carried is the other way out, the count's rise in stage 7. Its store IS read (8f's second
  read: the use program's callback, r1 0x2b46d0, r4 0x2b6108); what is unread is when that callback fires relative to
  the valve's write, so it could only end the wait sooner. `HOSTAGE_DOOR_USE_COUNT_PLACEHOLDER` names that timing; the port's
  valve flips when the door's own program sets it (disc data, `viewer/src/doors.ts`), and the measured crossing
  0.75-1.03 s after the open holds the result (review 1, finding 1).
- **The wire: no change (WM.R11).** The hostage's use goes out as the existing `doorUse` broadcast a player's use sends
  (`room.ts` `useDoor`); every page swings the door as it does for a player's. Telling a page that the user was a
  hostage (for the reach animation) is not in this task.

## 6. Limits

One door (door_rg_1), one map (MP71), one hostage body, the leaf shut by a teammate's use; the game clock at 0.86 of
wall with three consoles; r0001's code read against r0004's measurements (the r0004 twins of `FUN_005efa50` and
`FUN_005f0180` are not compared word for word here; research 417 s20.8 item 3); one reader.

## 7. Readings and placeholders

`FOLLOW_ACTION_BIND_PLACEHOLDER` (match `hostageFollow.ts`, research 334 s14) is RETIRED 2026-11-18 by this task (the bodies seat's fresh review, finding 3): the markers bind at load (s4), which this branch builds; research 101's row and research 334 s14 say so.

The names the port's code holds for this note (`packages/match/src/hostageDoors.ts`); the follower's names of s3-s5a
join this table with the code that holds them.

| name | what it holds | status |
|---|---|---|
| `MARKER_BIND_READING` | types 1, 2, 3, 5, 7 bind; step B's 25.0 height band (s4; research 418 s22.10) | reading (two readers of the bytes; the binding measured on MP71) |
| `MARKER_BIND_BY_NAME_READING` | step A's record-name lookup is not read; step B alone binds | open: settled by a read of `FUN_00530f40`, `FUN_00351ef0`, `FUN_002b4e00` |
| `MARKER_BIND_POSITION_READING` | the action object's position for step B is its node's placed origin | open: settled by a read of `FUN_002b4b40`'s position fetch |
| `HOSTAGE_DOOR_ACTION_READING` | the type-1 dispatch (the point steered to on a bound marker's cell, more than one point left, valve 0) and `CAiSAction`'s tick: the top-of-tick completion on the wanted state 1, stage 0 -> 6, the use with pick 0, a refusal completing at once, stage 7's wait; the follow's reset to INIT without its start gate; a door of the room's door set only (s2, s3); no inactive-node gate on the hostage's use (a player's use passes `world.isActive`, `room.ts` `useDoor`; whether `FUN_002b4d80`'s lookup tests `m_active` is unread -- review of task 2, finding 1) | reading, pending review (the code task's transcription; the frame of the goal's first tick after the push is not read: the next game frame) |
| `HOSTAGE_DOOR_PUSH_GATE_READING` | the push gate's run-time bits for a hostage taken as clear: every push admitted (s3 (c)) | open: settled by a read of what sets +0x265 and `[actor+4]+0xe1` & 0x10 on an escortee |
| `HOSTAGE_DOOR_USE_COUNT_PLACEHOLDER` | no use count: stage 7's wait ends on the valve's top-of-tick completion only (s5a) | open: settled by the count's store (r1 0x2b46d0) timed against the valve's |
| `HOSTAGE_DOOR_RULE_EVENT_READING` | the hostage's use fires no `interact` rules event (s5) | open: settled by a read of the script event an action's use raises |
| `HOSTAGE_DOOR_STAND_PLACEHOLDER` (was `HOSTAGE_DOOR_STAND_READING` until 2026-11-18, retired: refuted by Q24b, s8) | the port's body stands (zero commands) from the push to the use and from the door program's MOVE's end to the action's end (NARROWED 2026-11-19 by LATER 1206, s8.5: it walks during the MOVE); the original's moves 10.5-12.6 u of path (Q24b) | placeholder: settled by stage 6's `FUN_0056cbf0`(actor, 4) / `FUN_0056dca0`(actor, 0) read |
| `DOOR_MOVE_TIMEOUT_READING` (viewer `doors.ts`) | 0.4 s: the most a blocking `ai::MOVE` holds the door program (`DAT_00650ac0` into the goal timer `+0x1c0`, D:L488978-488982; counted down in `FUN_00566dc0` D:L429080-429098); 12 game frames as the runner counts (s8.4, s8.5) | reading, pending review |
| `DOOR_MOVE_ARRIVE_READING` (viewer `doors.ts`) | 1.0 u: the MOVE's goal reached at or under it (`+0x1b4` overwritten with 1.0 by the begin, D:L488981; the test D:L429158-429161) (s8.4, s8.5) | reading, pending review |
| `DOOR_MOVE_FACE_READING` (viewer `doors.ts`) | 0.05 (radians of yaw, the unit not read): the MOVE's facing goal reached at or under it -- the tick also holds on the facing bit (`+0x170` bit 1, set by `FUN_0056d920` D:L432062; held D:L488700-488714; cleared D:L429178-429185 by `FUN_0052eb60(turn, 0.0, 0.05)`; (E) `DAT_006501e8` 0x3d4ccccd) -- the 1206 review's F1 (s8.5) | reading, pending review |
| `HOSTAGE_DOOR_MOVE_STEER_PLACEHOLDER` | while the MOVE's goal holds, the hostage is steered at its point by the follower's own direct steering (`HostageSteering.directStep`), not by `FUN_00566dc0`'s own stick gains (D:L429100-429150), which are not transcribed (s8.5) | placeholder: settled by those gains transcribed, or the rig's per-frame path of a hostage through the MOVE |
| `HOSTAGE_DOOR_MOVE_FACING_PLACEHOLDER` | the MOVE's facing goal (`FUN_0056d920(ctrl, 3, dir, 0)`) is held, not turned to: the turn that reads it is unread (s8.5) | placeholder: settled by `FUN_0056d920`'s goal and its reader read |
| `DOOR_MOVE_ORDER_READING` (viewer `doors.ts`; research 92 s7) | retired in place 2026-11-19 by LATER 1206: the MOVE is run, its blocking settled (an AI's controller blocks, a player's does not) and its end read (s8.4, s8.5); a player's following of the goal stays open (LATER 1206's player half) | retired |
| `HOSTAGE_DOOR_SHUT_BEHIND_READING` | the shut-behind block is not built: the door stays open behind the hostage (s3) | open: settled by the three save gates read in the frame of the open |
| `HOSTAGE_DOOR_REACH_PLACEHOLDER` | the door program's `Open door` push plays on a seated player only: the hostage body plays no reach (s5 item 4) | open: settled by the No_weapon set's `Open door` entry and the rig's video |
| `CAMERA_EFFECTS_STEP_READING` (viewer `cameraEffects.ts`) | the jiggle's commands tick once a game frame, a leg's end handing the frame's rest to the next, a pass's `LOOP` dropping it: a pass 4.004 s, the yaw's peak 4.51e-4 rad (s8.6) | reading, pending review (agrees with L1246b; the runner's frame tick and `FUN_0025ede0` unread) |
| `CAMERA_EFFECTS_PHASE_READING` (viewer `cameraEffects.ts`) | the jiggle's loop starts with the page world's autostarts: the map's load and each round's reset (s8.6) | reading, pending review (the original's phase at a round's start, and two consoles' agreement, unread) |
| `CAMERA_EFFECTS_SET_EULER_READING` (viewer `cameraEffects.ts`) | `OBJECT_ROTATE_STATE`'s flag-1 euler built in the angular step's order; the disc writes only (0, 0, 0) on `camera_effects` (s8.6) | reading, pending review (settled by `FUN_003083c0` read) |

## 8. The shut-door test's red, and the follower's arrival (the bodies seat, 2026-11-18)

Branch `agent/bodies-958` (`agent/next` 9217523898 with `agent/wm-hostage-doorhook` 70e5303bcd merged, f7d11bfbbf); the
main controller's task of 2026-11-18. Evidence kinds: **(D)** the r0001 decompilation, **(A)** r0001's instructions
(capstone 5.0.7), **(O)** the rig's records (relayed, as s1), **(T)** the port's dev-disc test.

**The red.** `match/test/hostageShutDoor.devdisc.test.ts` (a) was red at the branch's own head 70e5303bcd (the hostage at
the open 14.50 u from "the door's point", the band 6.6-10.6), and the same on today's trunk (14.11 u; the cross 1.25 s
against 0.75-1.03). The delta's "doorhook not run" had hidden it.

**The follower's arrival, read (D, A): it matches the port.** In `FUN_00567900` the steered-to route point is the last
entry (`piVar20`, D:L429496), and the one after it is `iVar17` (D:L429497).
- **The dispatch.** When that point's cell record has bit 7 (D:L429513), the jump table at 0x65c990 is indexed by
  the marker type (D:L429545-429551). Its slot 1 is 0x567ee8 (read in the image). Type 1's body at r1 0x567ee8-0x567fb8
  looks up the action, tests the valve u16 == 0 and pushes 0xb. It has **no distance gate**. Slots 0, 2, 3, 5, 6 go to
  the steering at 0x5682c0; 4 to 0x567ce8; 7 to 0x567c60.
- **The arrival.** `iVar8 = FUN_0052c320(map, here, point)` (D:L429511) is the Manhattan cell distance (the same
  sub-map; D:L396233-396273, its same-sub-map branch). When it is 0, or when `FUN_00575cb0` finds both cell deltas equal
  to 0 (D:L429569-429579; `FUN_00575cb0(a, b, tol)` is |a - b| <= tol, D:L436206-436215; b = 0 at 0x64fd78 / 0x64fd80,
  tol 0), the point is consumed (`FUN_0056c080`) and the function recurses (D:L429907-429913). Otherwise the steering
  runs, with its two passing rules (D:L429696-429719). So a point is reached when the follower's cell word `+0xe8` is
  the point's cell. That is the port's `same(here, route[0])` before the passing rules (`hostageFollow.ts`).
- **The cell word.** `+0xe8` is written by `FUN_005b7ba0` (a vtable slot, 0x6691e8): `+0xe4` takes the located cell
  every call, and `+0xe8` takes it only on a traversable cell, where `FUN_0052a090` refuses types 0, 8, 9 and 10
  (mask 0x701, D:L394984-395010). The port carries the same (`HostagePathPlanner.traversable`). The cell centre is
  `min + size x 0.5 + index x size` (`FUN_0052d480`, D:L396884 on); the locate is `(p - min) x inverse`
  (`FUN_0052dc70`, D:L397192 on). Both as the port's.
- On MP71 the follower's column x 223 is one cell wide at z 83-84 (cells 222 and 224 at z 82-84 are type 0). Cell
  (223, 84)'s centre is (2194.58, 791.81), and its line toward the room is z 796.81.

**The rig's frame (O): the test's error.** Every rig distance is from "THE DOOR's point used for every distance",
(2194.6, 787.0) in x/z (`RELAY1-Q24-open-door-positions-0811Z.md` (d); the door match's RECORD.md the same). The test
measured from the door action's node origin (`MapAction.at`, (2192.00, 782.03) on the fixture), 5.6 u further on;
the door's line moved with it. In the original the follower pushes from (2189.75, 794.58) (C2) and
(2189.80, 796.42) (C5): just inside cell (223, 84)'s line, the cell-entry consumption above.

**After the correction (T), commit dcb094acc7 (its body says "research 428 s7": s8 is meant, the review's finding 6): no change to the follower.** The test measures from (2194.6, 787.0). (a) and (b) are
green. At the open the port's hostage is at (2189.70, 795.94), 10.20 u from the rig's point (at the push: the band 9.00-10.58, met; at the open
the original's 6.6-9.3 is not met -- the first band 6.6-10.6 mixed the two moments, see "Where it stands at the open" below). It crosses the line 0.92 s after the open (0.75-1.03), and stops
23.79 u from the leader (20-24).

**Two differences left, held as named (O, T)** (the fresh review's findings 1 and 5 folded, 2026-11-18). The door match has
three pushes: C2, C5 (`q26-hostage-door-read/RECORD.md`) and C7 (`q27-w1-f2/RECORD.md` s5: pushed at (2190.05, 795.22), 9.39 u; the
open 1.245 s after; at the open (2190.02, 793.85), 8.24 u; it crosses the door line, which that record defines as z 787.0, 0.76 s
after the open).
- **Time.** From the push to the open the port takes 0.78 s: 0.063 s from the push to its use (the door action's stage 0 -> 6),
  then 0.72 s for the door program. The original takes 1.23 s (C2), 1.27 s (C5) and 1.245 s (C7), n = 3: about 0.45-0.49 s more,
  which would be `FUN_005efa50`'s stages before stage 6 or the reach (`HOSTAGE_DOOR_REACH_PLACEHOLDER`). The Q24 retry's "from
  reaching the door's cell line to the state change, 0.75 s and 1.15 s" spans both. Unread; LATER 1191, not built here.
- **Where it stands at the open.** The first band of the test, 6.6-10.6 u, mixed two moments: C2's and C5's distances are AT THE
  PUSH, the Q24 retry's AT THE OPEN. The test now asserts each against its own: at the push 9.00-10.58 u (C2, C5, C7; the port
  10.20, taken at its use 0.063 s after the push, the body standing between) -- green; at the open 6.6-9.3 u (the retry's four, C7's
  8.24 inside) -- the port stays at 10.20, because its follower stands from the push to the open (`HOSTAGE_DOOR_STAND_PLACEHOLDER`, was `HOSTAGE_DOOR_STAND_READING`) where
  C7's moved 1.37 u toward the door; held as `it.fails` under LATER 1191. The retry's four pushes are not recorded, so whether its
  followers moved as C7's did is not known.

**The aim's failure path, not built (D).** `FUN_005f0180` (D:L502726-502758): when the marker cell is not traversable and
`FUN_00529300` also fails, the goal goes to stage 9 and never uses the door. The port's door action always uses it. Note only,
under `HOSTAGE_DOOR_ACTION_READING`'s door cells: MP71's type-1 marker cells are traversable (door_rg_1's (223, 83) is type 1);
other maps not checked (the fresh review's finding 7).

**The door action's node is not the rig's point.** (2192.00, 782.03) against (2194.6, 787.0). What the rig's point is
in the object (the action object's own position, read in RDRAM, or another field) is not stated in its record.
`MARKER_BIND_POSITION_READING` binds by the node, and the binding test is green on the measured ids, so nothing here
depends on it.

### 8.1 The rig's Q24b (PC 1, 2026-11-18; a capture, hand-scored, not proven)

Six trials asked, four measured (T1 and T4 passing every check; T3 and T5 measured, the leader 3.7-4.7 u off the rig's
rest); the rest failed set-up, each kept with its cause (hub rig/Q24b-PC1/ (attempt2/Q24b-summary.md); relay-1's tools there).
- **The time.** The door goal is pushed and the door opens 1.2163-1.233 s later in all four (with C2, C5 and C7, n = 7:
  1.22-1.27 s). The port takes 0.78 s.
- **Where the time goes: the DOOR, not the hostage.** The door goal's stage word `+0x34` goes 0 -> 6 -> 7 about 0.03 s and
  0.07 s after the push, in every measured trial, so the original's follower uses the door at once, as the port's does.
  The rest, about 1.15 s, is the door's own from the use to the open, where the port's door program takes 0.72 s. LATER
  1191's first guess (`FUN_005efa50`'s stages before stage 6, or the reach) is REFUTED and kept here as refuted. Whether a
  player's use opens in the same time on r0004 is asked of PC 3 (the main controller's placing, 2026-11-18).
- **The use byte** (`+0x42`) rises 2 -> 3 about 1 s AFTER the open in every trial: a late count, not the use's moment
  (`HOSTAGE_DOOR_USE_COUNT_PLACEHOLDER`).
- **The follower moves** 10.5-12.6 u of path between the push and the open, its distance to the door's point at the open
  within 0.4-1.6 u of that at the push, either way (T1 9.44 -> 7.92 in; T4 7.54 -> 7.90 out). `HOSTAGE_DOOR_STAND_READING` is refuted as the original's behaviour and
  retired; the port's stand is now `HOSTAGE_DOOR_STAND_PLACEHOLDER`, until stage 6's movement call is read.
- **The distances.** Pushed at 7.54-10.20 u (with C2, C5, C7: 7.54-10.58, n = 7; the test's push band widened to it);
  opened at 7.90-8.61 u (inside the Q24 retry's 6.6-9.3; n = 9); crossed the door's line 0.80-0.85 s after the open.
- **No shut behind; no other goal** took the top; C stood 41 u from the follower (T1).
- **The stop from the leader** (25.4-31.1 u) is LATER 1126's, coreA's to re-weigh, not this section's.

### 8.2 A player's use of the same door (PC 3, 2026-11-18; a capture, hand-scored, not proven)

shadow-relay-3, r0004 one-console LAN, MP71 door_rg_1 opened by the player, 5 trials, one row a frame (hub `rig/L1191-playerdoor/ (sha256 80976574...)`).
The door object 0x1768bd0 (id 4) and its valve 0x696284 (the state u16 at +4), reached by the action list (0x0044d668
count, 0x0044d670 first node; node +8 the object, +4 the next); the swing node 0x1699080, named "door_rg_1" (its 3x3 at
+0x00..+0x28, its translation at +0x30 = (2192.0, 179.0, 782.025)), seen to turn 170 degrees as the state flips.
- the X press (the row after the 150 ms key-down's release) -> the player's `Open door` action (63) about 0.23-0.27 s;
- action 63 -> the door's state 0 -> 1 0.684-0.701 s, the same frame the action goes 63 -> 1 -> 17 and the swing begins;
- the state flip -> fully open 0.967-0.984 s (170 degrees);
- key-down -> the state flip about 1.10-1.15 s;
- the use byte +0x42 reads 0 shut and rises at the FULLY-OPEN frame (so Q24b's "about 1 s after the open", s8.1).
So a player's key-down -> flip is about a hostage's use -> flip (about 1.15 s, s8.1): LATER 1191 is closed as the door's
own time, carried by LATER 1206 for every user -- INFERRED: key-down is not the game's use call (estimated, not
measured); if the player's use falls at anim 63 his use -> flip is 0.69 s and the hostage keeps about 0.45 s of its own,
so 1206 holds the hostage's push -> open (1.22-1.27 s, n = 7) as its own acceptance check (the fold's review, finding 2). The port's phases are read in LATER 1206's row (by
reading only; a clocked run of `DoorSet` comes first).

### 8.3 The port's door program clocked, and the gap (LATER 1206 step 1, 2026-11-18; unit test, the fixture disc)

`viewer test/doorTiming.test.ts` runs MP71's door_rg_1 program in `DoorSet` at the room's 60 Hz tick from the use
(t = 0): the `Open door` push (anim 63) at 0.033 s (the first whole game frame), the valve flips at 0.717 s, the leaf's
first motion at 0.733 s, the program's end at 1.717 s (`useSeconds` 1.701). LATER 1206's row had read "the valve at
0.300 s" off `aiAnimate`'s comment, which is Frostfire's program (bdoor_4, a 0.25 s post-wait); door_rg_1's waits longer.
So the hostage test's 0.72 s from its use to the open IS this door's program: the puzzle is reconciled, nothing missing.

Against the original (s8.1-s8.2): FROM ANIM 63 ON THE PORT IS THE ORIGINAL'S. Push -> valve 0.683 s against anim 63 ->
flip 0.684-0.701 s; valve -> rest 1.000 s against the flip -> fully open 0.967-0.984 s (about 0.02-0.03 s longer). The gap
is BEFORE anim 63:
- a player: the original's PRESS row -> anim 63 is 0.234-0.267 s (PC 3), the port's use -> push 0.033 s: the port's door
  starts about 0.20-0.23 s sooner (the PRESS row -> the flip: the original's 0.93-0.97 s, the port's use -> valve 0.717 s);
- a hostage: the original's push of the door goal -> the open 1.21-1.27 s (n = 7 + Q24b attempt3's 12: 1.2119-1.2451 s,
  `rig/Q24b-PC1/attempt3/`), the port's 0.78 s (its use 0.063 s after the push, then 0.717 s): about 0.43-0.49 s sooner, of
  which about 0.2 s is the same door start and the rest the hostage's own use -> anim 63 (its stage 6 is at +0.03-0.07 s,
  s8.1, so the original's use -> flip is about 1.15 s against a player's PRESS row -> flip 0.93-0.97 s).
Both fit candidate (b), the door program's `ai::MOVE` toward the door before the ANIMATE (`DOOR_MOVE_ORDER_READING`, not
run here): a MOVE takes the time it takes to reach its spot -- short for a player at the prompt (PC 1's Q24b R3: the
shutting SEAL moved about 14 u during his own press, two setup reads only, not sampled), longer for a hostage that walks to
it (it moves 10.5-12.6 u between the push and the open, s8.1). Candidate (a), `blocking` taken as the post-wait's end,
would lengthen the time AFTER anim 63, which already matches: not supported. Next (LATER 1206): the presser's path through
a press sampled on his own console (a spec for the rig), then the MOVE read at the source (research 214, D:L488983-488989,
D:L488702-488714) and built, a RED from these phases first.

### 8.4 The door program's ai::MOVE read at the source (LATER 1206, 2026-11-19; reading, the author's, pending review)

The MOVE's begin (`FUN_005d5d00`, end at D:L488964-488992) takes the actor's controller (`+0xc0`) and calls its vtable
`+0x38`. It always gives that controller a goal: `FUN_0056daa0(3.0, ctrl, 3, point)` for the point, and
`FUN_0056d920(ctrl, 3, dir, 0)` for the facing. Only when vt `+0x38` answers non-null does it put movement state 5 on that (6 instead when the top goal's `+0x30` is 9, 7 when `FUN_0054f6e0` answers -- `FUN_0056cbf0` D:L431676-431696; then the MOVE does not block: the review's F4; the door action's top goal is 11, so 5)
answer (`FUN_0056cbf0(answer, 5)`) and set the command's `blocking` bit (`+0x28 | 0x20`); otherwise it clears the bit. The
tick (`FUN_005d5b40`, D:L488660-488722) holds the program only for a blocking MOVE, while the answer's `+0x3f4` is 5 and
the controller's `+0x1b0` is 3 with `+0x170` bit 0 or 1 set; else it is done at once.
- Whose vt `+0x38` answers is read (research 377 s6, the backblast arms; r4 0x5431e0): `CSealCtrlAi` returns the
  controller itself; `CSealCtrl` (the local human) and `CRemoteCtrl` return 0.
- So for a HOSTAGE, an AI, the MOVE BLOCKS: the door's ANIMATE (anim 63) and swing wait until it has walked to the
  program's point (research 92 s7: 18 u from the door's node toward it, facing the node). That is s8.1's 10.5-12.6 u
  moved between the push and the open, C2's `+0x3f4` reading 1, 4, 5, 1 during the door goal (`q26 RECORD`), and the
  hostage's extra time over a player. The port's follower stands instead (`HOSTAGE_DOOR_STAND_PLACEHOLDER`, held by
  `hostageShutDoor.devdisc.test.ts` (a2) under LATER 958); a build of the MOVE for an AI presser closes both.
- For a PLAYER the MOVE never blocks, so it cannot be the 0.234-0.267 s from the PRESS row to anim 63. A goal is still set
  on his controller, and whether a pad-controlled SEAL follows it is unread; Q24b R3's shutting SEAL moved about 14 u
  during his press, from two setup reads only. The player's gap is open, for the rig's L1206 capture
  (`rig/SPEC-L1206-MP71-presser-move.md`): the presser's own console through a press.
- THE GOAL AND ITS END (the same day's read): `FUN_0056daa0` (D:L432086-432120) stores the point at the controller's
  `+0x180..0x188`, the 3.0 at `+0x1b4`, sets `+0x170` bit 0 and the goal's priority 3 at `+0x1b0` (the tick's `== 3`);
  the MOVE's begin then overwrites `+0x1b4` with 1.0, and sets `+0x1b8` and `+0x1c0` to `DAT_00650ac0` and `+0x1bc` to 0
  (D:L488978-488982). The controller's goal driver `FUN_00566dc0` (D:L429044-429180) steers the body toward the point (the
  sticks at `+8` / `+0xc` by its own gains), clears `+0x170` bit 0 -- ARRIVED -- once the distance is at or under
  `+0x1b4` = 1.0 u (D:L429158-429161), and counts `+0x1c0` down by the frame's `dt`, dropping the goal when it reaches 0
  (D:L429080-429098). (E) `DAT_00650ac0` = 0.4 s (0x3ecccccd), the disc's ELF (`game/disc/socom2_game.elf`, read through
  `tools/elfImage.ts`; r0004's ELF unchecked, as research 445's (E) values). So a hostage's door MOVE walks it toward the
  point for at most 0.4 s, or until it is within 1.0 u AND faces the goal within 0.05 (the facing bit; see s8.5's
  correction), then the ANIMATE runs: about 0.4 s plus a frame or two on the
  port's 0.78 s push -> open gives about 1.18-1.21 s, against the original's 1.21-1.27 s (n = 19). Named for the build:
  `DOOR_MOVE_TIMEOUT_READING` 0.4 s and `DOOR_MOVE_ARRIVE_READING` 1.0 u (reading, pending review).

### 8.5 The MOVE built for an AI presser (LATER 1206's hostage half, 2026-11-19; reading, pending review; unit and dev-disc tests)

Branch `agent/bodies-1206`. Evidence kinds kept apart: **(D)** the decompilation, **(U)** unit tests on the fixture disc,
**(T)** the room's dev-disc test; nothing rendered, no capture of the port.

**The point, re-derived at the parser and the begin (D).** The parser `FUN_005d64b0` (D:L488996-489058) fills a 0x2c-byte
command: +4 `select`, +8 `pos` (three f32), +0x14 `dir` (three f32), +0x20 `dist`, +0x24 the node reference, +0x28 the
mode (low nibble) with `blocking` at 0x20. Mode 1 in the begin `FUN_005d5d00` (D:L488938-488961): the node through
`FUN_0026f4e0` and its current matrices (`FUN_003109f0`); P = that matrix on `pos` as a point (`FUN_003085c0`, the fourth
row times w = 1); d = actor - P in x and z only (`FUN_003091d0`: `out.x = a.x - b.x`, `out.z = a.z - b.z`; y preset 0),
normalised (left as is when zero); the facing -d (y written as -0); the point P + `dist` x d (`FUN_00309180` scales,
`FUN_00309240` adds), at P's height. So research 92 s7's "18 u from the door's node toward the presser" holds only where
`pos` is zero (BombPlace's, research 214 s9): on the doors it is 18 u from the node's matrix applied to `pos`. MP2's
`singleDoor_right` (open and close): mode 1, node 0xfa, `dist` 18, `pos` (0, 0, -13), `dir` (0, 0, -1), not blocking on
the disc (U, `scene test/aiCommands.test.ts`; `viewer test/golden/doors.json` re-read). MP71's door_rg_1: `pos` (-13, 0, 0)
-- P = (2205.00, 179.00, 782.03), 13 u from the node origin (2192.00, 782.03) along the leaf; from C2's push spot
(2189.75, 794.58) the point is (2191.10, 179.00, 793.47), 1.75 u away, the facing (0.772, 0, -0.636) (U,
`viewer test/doorTiming.test.ts`).

**What was built.**
- scene `effects.ts`: `ai::MOVE` decodes to `{ op: 'aiMove', mode, node, dist, pos, dir, blocking, select }` (was `other`).
- viewer `doors.ts`: `DoorHooks.move(door, point, facing, actor)` answers null (no block) or an "arrived?" predicate; the
  door host's `aiMove` case computes the mode-1 point and facing from the presser's feet at the use (`use`'s `from`; a use
  with none sets no goal) and, on a predicate, holds the program each game frame until it answers or 12 game frames
  (`DOOR_MOVE_TIMEOUT_READING` 0.4 s, counted as `aiAnimate` counts) have passed. `DOOR_MOVE_ORDER_READING` retired in place.
- match `room.ts`: the hook's `move:` and `doorMove`: null for a seated player or the page's own press, the follower's
  predicate for a hostage (id from `HOSTAGE_ID_BASE`).
- match `hostageFollow.ts` / `hostageDoors.ts`: `HostageFollow.doorMove` holds the goal; each tick its timer counts down by
  dt and the body is steered at the point (`HOSTAGE_DOOR_MOVE_STEER_PLACEHOLDER`) until within `DOOR_MOVE_ARRIVE_READING`
  or the timer is out; then it stands as before. The facing is held (`HOSTAGE_DOOR_MOVE_FACING_PLACEHOLDER`).

**The numbers.**
- (U) door_rg_1 at the room's 60 Hz: a player's push (anim 63) still 0.033 s after the use; an AI presser that never
  arrives pushes 12 game frames (0.400 s) later to within a room tick (the ANIMATE counts its own frames afresh after the
  MOVE, as it does after the use); one that arrives on the third game frame, three frames later to within a room tick.
- (T) `match test/hostageShutDoor.devdisc.test.ts`, MP71: the hostage is 2.68 u from the MOVE's point at its use and 0.89 u
  at the open (it arrives before the timeout); at the open it stands 8.55 u from the rig's door point (was 10.20), inside
  the original's 6.6-9.3 (n = 9): (a2) is an `it` now. The push -> open was **1.167 s** at the first build; with the
  facing condition (the correction below) it is **1.200 s** against the original's 1.21-1.27 s (n = 19): 0.01-0.07 s short. Held as `it.fails` (a2t) under LATER 1206, never tuned. Even a MOVE that runs its full
  0.4 s gives about 1.19 s here. What the original spends besides is unread: the frame its program's first tick and the
  goal timer's first count fall in after the use, and how fast its goal driver walks (the port's steering arrives at
  about 0.39 s).
- Not met, and not explained by the MOVE: Q24b's 10.5-12.6 u of path between the push and the open. The port's hostage
  walks about 1.8 u (the point lies 1.75-2.7 u from where it pushes). What else moves the original's body in that span
  (stage 6's `FUN_0056cbf0`(actor, 4) / `FUN_0056dca0`(actor, 0), `HOSTAGE_DOOR_STAND_PLACEHOLDER`) is still unread.
- (a) and (b) of the same file stay green (the crossing 0.75-1.03 s after the open is held).

**The player half** (LATER 1206) is not built: a player's MOVE never blocks (D), and whether his pad-controlled SEAL follows
the goal is the rig's L1206 capture.

Bots are NOT built (LATER 1243, the main controller's ruling 2026-11-19): in the original a computer-controlled SEAL is
`CSealCtrlAi`, whose door MOVE blocks as a hostage's does; the room's bots have player ids, so theirs takes the player
path (no wait, no walk). Built later with a capture of the original's computer SEAL at a door and a bot soak re-run.

**Correction (the 1206 review's F1, 2026-11-19).** The first build ended the MOVE on ARRIVAL alone. The tick holds while
the position bit OR the facing bit is set (D:L488700-488714); the goal driver clears the facing bit only once the turn's
residual is within 0.05 (D:L429178-429185; `DOOR_MOVE_FACE_READING`), turning once arrived. So the MOVE ends when the body
has arrived AND faces the goal, or at the timeout. The port's hostage does not turn to the facing
(`HOSTAGE_DOOR_MOVE_FACING_PLACEHOLDER`: the turn's rate unread), so once arrived it stands and, not facing, the program
waits to the 0.4 s timeout -- the source-faithful end for a body that does not turn. The goal's timer (the hostage's, by dt)
and the runner's 12-game-frame cap are two clocks where the original has one (`+0x1c0`); they agree within a room tick.

### 8.6 The player half closed, and the door pick's 4 s flicker (LATER 1206, LATER 1246; the bodies seat, 2026-11-19)

**The player half of LATER 1206: PARITY.** PC 1's hold test (L1206, hub
`evidence/weekend-mega-2026-11-14/rig/L1206-PC1/hold/unpacked/`; a capture, hand-scored, not proven) held X for 50, 150
and 600 ms at door_rg_1: in each the door's anim 63 followed the **release** by about 0.10 s, whatever the hold -- less
the rig's own 64-67 ms input latency, about one game frame. The port fires the use on the release too, and its push
(anim 63) comes one game frame after the use (s8.3; `doorTiming.test.ts`). So a player's door keeps no gap before anim
63, and from anim 63 on the port is the original's (s8.3). The player's MOVE stays non-blocking (s8.5 (D)). Nothing built
for this half.

**LATER 1246: the pick's flicker.** PC 1's capture L1246 (`rig/L1246-PC1/unpacked/`) showed the use pick at MP71's
door_rg_1 flipping door <-> wall every 4.003 s (about 2.05 s on, 1.95 s off) with the SEAL standing still: the reticle's
hit crosses x = 2192.000 (the door node's x) at a standing camera yaw near 13.925 degrees, and moves about -0.225 u per
degree of yaw (13.64-13.84 stays on, 14.04-14.14 stays off). Its second capture L1246b (`rig/L1246-PC1/camray/unpacked/`)
read the camera's sway matrix (`cam+0xb8`'s node): period 4.003 s, the yaw terms m02 / m20 +-0.00045, the pitch terms
m12 / m21 0..0.0009 lagging the yaw by 0.97 s; the eye, the target, the peek and the root constant.

The cause (reading, the author's, pending review):
- The scene sets carry an autostart `camera_jiggle` (`MZANIM.ZAR`; params flags 33; one sequence `shake_small`,
  activation 1) whose node 1 is `camera_effects`. Read off the disc through `parseAnimSets` / `decodeEffectProgram`
  (`cameraJiggle.test.ts` (a), MP71 fixture): `OBJECT_ROTATE_STATE` node 1, no reference, flags 1, euler (0, 0, 0); four
  `OBJECT_MOTION` node 1, flags 0x101, lifetime 1.0 s, angular block (w; accel) with k = 0.0008726646 rad/s (0.05 deg/s,
  as f32): (0, +k, 0; -k, -k, 0), (-k, 0, 0; +k, -k, 0), (0, -k, 0; +k, +k, 0), (+k, 0, 0; -k, +k, 0); `LOOP` -1.
- The motion's begin copies the record's w into the running one (`FUN_00262690` D:L110995-110999); each tick
  (`FUN_00261370`) clips its step to the lifetime (D:L109966-109976), turns the node by the euler quaternion of w x step
  after its own (`FUN_00307360` D:L110368, `FUN_003070c0` D:L110369, `FUN_00307270` D:L110370; written through
  `FUN_00315790` -> `FUN_00307170`), then adds accel x step to w (D:L110373-110375). Over a pass the yaw runs 0 -> +k/2
  -> 0 -> -k/2 -> 0 and the pitch 0 -> -k/2 -> -k -> -k/2 -> 0, a leg behind: closed, so every pass is the same.
- The camera finds the node by name under its follow target (`FUN_002956e0` D:L139743-139746, the string at 0x3efd88,
  kept at `cam+0xb8`) and multiplies its matrix into the view after the mode's routine has placed it (`FUN_002998f0`
  D:L142020-142024; `FUN_001bfc30`: node x camera, row vectors), the view the camera node takes (D:L142025) and the
  reticle's ray is cast along (`FUN_005aa6e0`, D:L142028). The node's translation is zero (L1246b: the eye still), so
  the look turns about the eye in the camera's own axes (`FUN_0029bc90`: x the level right, y up, z back).
- The sweep (`cameraJiggle.test.ts` (d), dev-disc, the full disc): `camera_jiggle` runs on **19 multiplayer maps** --
  MP2, MP6, MP7, MP8, MP9, MP10, MP11, MP12, MP51, MP52, MP53, MP61, MP64, MP71, MP72, MP73, MP81, MP82, MP83 -- one
  shape on every one. The only other program naming `camera_effects` is MP6's `artil_camshake` (0.05 s legs, mostly
  roll, called by the bombardment), not built here (`SCENE_NODE_TRANSFORM_PLACEHOLDER`).

The port before: its world ran no per-node rotation (`SCENE_NODE_TRANSFORM_PLACEHOLDER` named the jiggle as drawing
nothing) and its camera read no `camera_effects`, so the view and the pick never moved.

**Built (LATER 1246; reading, pending review):**
- viewer `cameraEffects.ts`: the node -- its quaternion, `OBJECT_ROTATE_STATE`'s set
  (`CAMERA_EFFECTS_SET_EULER_READING`), the motion's angular legs on the game-frame clock (`CAMERA_EFFECTS_STEP_READING`),
  and `turnLook`, a look turned about its eye by the node's 3x3 in the camera's axes.
- viewer `worldState.ts`: the world runs `camera_jiggle`'s (`JIGGLE_PROGRAM`) rotate and motion on `camera_effects` in a
  run that is not silent; the page's world publishes its node when it starts its autostarts (the map's load, each
  round's reset; `CAMERA_EFFECTS_PHASE_READING`). The room's world runs no autostart program and publishes none.
- viewer `playerCamera.ts` `view()`: the drawn target, the game's aim target and the aim point turned about their eyes by
  the node. `WalkMode.follow` places the shot's and the use's ray from `view()` (`fireAim`, `lookAim`, doorPage's
  `aim()`), and `noteTick` takes its eye and far from `view(1)`, so the use pick, the reticle and the fire claim carry
  the jiggle in third person.
- The step: the original's numbers fit a game-frame step, not the page's -- a pass of 120 game frames is 4.004 s and the
  forward step's yaw peak k (1/2 + dt/2) is 4.51e-4 rad (L1246b: 4.003 s, +-0.00045), where a 60 Hz step gives 4.000 s
  and 4.44e-4. So the node keeps its own game-frame clock (`CAMERA_EFFECTS_STEP_READING`).
- Measured (`cameraJiggle.test.ts`, unit tests, MP71 fixture): (b) the view's yaw -4.22e-4..+4.51e-4 rad and pitch
  -8.73e-4..0, the yaw's peak at 1.017 s and the pitch's deepest at 2.017 s, a pass 4.0 s within a page frame, the eye
  still; (c) the port's resting ray meets x = 2192.0 at yaw 13.9398 degrees (the original's ~13.925), and 0.002 degrees
  inside it the pick flips at 0.050-, 2.050+, 4.050-, 6.050+ s: a 4 s period, duty 0.500; 0.1 degrees either side it
  stays.

Not built, and said: the first-person and scope view (`WalkMode.follow`'s head branch, and `noteTick`'s) places its eye
and look from the walker, not from `view()`, so it does not jiggle; in the original the multiply follows every mode
(D:L142020, after the mode switch). That path is walk.ts's, outside this task: LATER 1246's remainder. The room's shot
cone (match `room.ts`, viewer `net/shotCone.ts`) reproduces the look with no jiggle: a claim on the jiggled look at full
amplitude (yaw 0.026, pitch 0.052 degrees off) was taken in the room's claim harness at 60 u (a scratch copy of
`roomAtClaim.test.ts`'s harness, not committed; refusal begins between 0.5 and 2 degrees of yaw and between 0.2 and 1
degree of pitch there), so the room needs no change for it.

**LATER 1251 (2026-11-19).** The head's view and the scope now carry the same turn: `walk.ts` `follow()`'s head branch
turns its look (the placed and drawn aim, the shot's and the use pick's) and `noteTick`'s head branch its far, by
`cameraEffectsTurn` through `turnLook`, the eye unmoved -- `FUN_002998f0` multiplies the node into the view after the mode
switch, every mode alike (D:L142020-142024). `viewer/test/headViewSway.test.ts` (unit test). The shot cone's slack takes the
head view's turn as it takes the third person's (the 1246 review: at most 8.7e-4 against the 2 px slack).

## Review

- **Review 1 (2026-11-15), a fresh read-only reviewer that did not write the note: PASS WITH FINDINGS, confidence
  medium-high** (record: `agent/wm-hostage-records` f0574fca6e `review-records/research-428-review-1.md`). Every cited
  D:L line and every rig claim held at the source; it decoded r0001 bytes 0x567ee8-0x568150 itself. Findings 1-11
  (four MEDIUM, seven LOW) are folded above where named: 1 (s2, s5a), 2 (s3), 3 (s2, s5), 4 (s3), 5 (s3), 6 (s0, s2),
  7 (s5a), 8 (s2), 9 (s2, s5), 10 (s5), 11 (s2, s5). With this review the D:L lines that predate it count as readings.
- **Review 1's fold re-read** (the same reviewer): FOLD PASS WITH FINDINGS, confidence high (record:
  `agent/wm-hostage-records`, `review-records/research-428-review-1-fold.md`). Folded: the byte facts the fold took from
  the reviewer's own decode -- a3 = 1 at r1 0x567ff8, the `$s0` test at 0x567f04, the absence of a facing write, the
  three save gates at 0x56804c-0x5680d4 (their float test against 0x65c700 left undecoded) -- have ONE reader and stay
  **reading, pending review** until a different reviewer re-reads the bytes (finding 1); C's 1 -> 2 was inferred, only
  the hostage's 2 -> 3 is measured (2); the reach is probably the door program's own animate (3, s5 item 4); s5a's
  refusal list agrees with s5.2 (4). The note lists eight named constants; the code task lists them where
  `tools/test/placeholderLedger.test.ts` looks.
- **8f's independent second read** (2026-11-15, the main controller's seat, at 567bd2d5a0, reading plus a read-only
  decode of the r0001 and r0004 executables; its file is on the hub, `reviews/research-428-second-read-36729ff9a.md`,
  relayed by the main controller): **SOUND WITH CORRECTIONS, confidence high**; the conclusion (a following hostage
  uses the door from where it stands, wanted state 1, no approach, no line test) follows and matches the rig. Folded:
  r1 0x567f04 is a null guard on the route-point pointer, not a hostage gate (s3 (a)); r1 0x567ff8's wanted state 1
  confirmed (r4 0x56d338); the save gates corrected -- +0xb4 below 0.05, +0x264 & 0x2, +0xc8 & 0x20000, the stores to
  +0x61c / +0x620 confirmed, r0004 the same (s3); r4 0x2b5ef0 IS `FUN_002b44e0`'s twin, so on r0004 the hostage's
  use is the player's call at the bytes (s0, s2); the use byte's move, the count's store (r1 0x2b46d0, r4 0x2b6108)
  and 0x668fe0 as CAiSAction's r0004 vtable confirmed (s0); "proven" scoped to the one-door rig observation (header);
  the count's store read, the placeholder narrowed to its timing (s5a); r0004's type-1 body the same as r0001's (s3);
  three aim notes and the original's wire line (s3); `FUN_002b4b40`'s start D:L157076 and its 20.0 caller (s4); the
  reach marked an inference (s5). The second read's file, whole on this PC: `D:\s2u\seats\research-428-second-read-36729ff9a.md`
  (14065 bytes, sha256 b8512e3b...ea8d6c); on the hub `reviews/research-428-second-read-36729ff9a.md`. Not verified by
  it: the follow veto at r1 0x555390, research 334 s14's masks, research 404 s30's ids and s24.1's handler, that the
  dispatch's route point is the next to reach (inferred from the rig's position).
  With it the byte facts have two readers and leave "reading, pending review": they are readings.
