# 435 -- The follow heading and the formation: three candidates for the goal's side (WM-HOSTAGE task 1)

- Date: 2026-11-15. Author: the wm-hostage lane seat's reader (one reader), filed by the wm-hostage lane seat, Shadow PC 3.
- Track: **simulation**. Level: **reading, pending review** for every code and byte line (one reader); the rig's goal
  cells are relayed from the original running (r0004, MP71; runs R1, R2, D1, C1, C2, C3; through the main controller,
  not harness-scored).
- What it changes: nothing by itself. It is the reading the main controller ruled (2026-11-15, research 435 claimed)
  before any change to the port's formation goal (`match/src/hostageFollow.ts`), which the rig showed off the original's
  cells; the rig's per-row words decide between the candidates set out below.
- Revised after review 1 (FAIL; record `agent/wm-hostage-records` `review-records/research-435-review-1.md`).

Draft, 2026-11-15, revised after review 1 (s9). One reader (this author).

- **Build.** r0001 (`socom2_game.elf`, the desktop tree's `game/disc/`). `D:L` lines are its decompilation. Machine
  code is cited "r1 0x<addr>", and r0004 (the served ELF) as "r4 0x<addr>".
- **Levels** (PROCESS, "Confidence"):
  - **reading**: transcribed from the code or the bytes. One reader, so every reading here is "reading, pending
    review".
  - **placeholder**: not read yet. Named in s7.
  - **rig records (relayed)**: the rig's runs as the coordinator relayed them. They are not harness-scored captures,
    so they are not "proven". They are the evidence the readings are tested against.


## The latch, measured (the rig's C5, 2026-11-15)

**The heading latch (candidate B) is measured on the original running** -- r0004, MP71, the door match's run C5, ONE
match, 9157 rows, relayed by the main controller (hub `evidence/weekend-mega-2026-11-14/rig/RELAY1-V2-claymore-C5-shut-door-H3-latched-0932Z.md`),
not harness-scored: the leader's +0x4e8 reads (-0.9147, 0.0000, 0.4040) in EVERY row -- standing beyond the door,
through a quick 90-degree turn to the east, through his run east and at rest -- the unit direction from his ordering
spot (2140, 785) to the hostage's (2124.58, 791.81): his facing AT THE ORDER; it follows neither his later facing nor his
motion. +0x515 = 1 throughout; +0x4f4 = 0xbf6a2cf2 (as a float -0.9147, the vector's x) throughout. The formation
switch is OUT for these runs: the leader body's +0x1060 reads 0xffff0009 (8387 rows) and 0xffff0109 (770 rows) in C5's
rows; bit 2 is set in the room, clear beyond the door (F-1); the type-2 switch is fenced online, so the goal is unaffected in these runs. So the goal's side is the latch's (B): supported by the rig's relayed measurement (one match, n as given),
not harness-scored; the mechanism a reading. The mechanism
(FUN_005fc970 / FUN_005fcc40 / FUN_005fcf10) stays a reading pending the second read. C5's own goal cells fit it: the
leader still in (225,81) -> goal (223,82); after his run, goal (226,80).

**C6** (the same match, relayed; 8655 rows). A slow turn by the leader. The goal (221,84) was held for 38 s. The leader's
`+0x4e8` read the same in all 8655 rows, and the follower's slot was (2,2) in every row. [rig records, relayed]

**What C5 and C6 rule out, for that match** [rig records, relayed; the levels stay reading]:
- a flipped live facing (C): `+0x4e8` did not follow his yaw through a 90-degree turn (C5) or a slow turn (C6);
- formation type 2 (A): `+0x1060` bit 2 is set in the room, clear beyond the door (F-1); the type-2 switch is fenced online, so the goal is unaffected in these runs; and slot (2,2) in every row (C6).
- Both support the latch (B). They are one match, relayed, not harness-scored.

**F-1** (r0004, MP71, run F12a; one run, relayed by the main controller 2026-11-15). This is supporting measurement,
relayed and not harness-scored; the mechanism stays a reading. [rig records, relayed]

- **(a) The latch at the order tick, by value.**
  - Before the order: `+0x4e8` = (0, 0, -1), `+0x4f4` = 0, `+0x515` = 0. The leader is at (2140, 785), yaw 113.83.
  - In the order's frame (clock 2808.05 → 2808.23): `+0x4e8` = (-0.9147, 0, 0.4040), which is (-sin, -cos) of
    113.83; `+0x4f4` = -0.9147; `+0x515` = 1.
  - The value is unchanged through turns (yaw 113.8 → 48.3 → -87.3) and through short runs (`+0x510` reaching 1699 and
    660, then 0).
  - This is (B), the latch with the sign as read: equal by value, not opposite. It is not (B′).
- **(b) The running branch fired.**
  - He ran straight east at full stick from 2841.70 (65.4 u/s, yaw -89.83). `+0x510` counted 99, 264, 429 … 1930,
    1996.
  - In the frame where it read 2029 (2.09 s in), `+0x4e8` became (1.0000, 0, -0.0029) and `+0x4f4` became 1.0;
    `+0x515` stayed 1.
  - After he stopped (2329.3, 764.0; cell (236,81)), both kept the run's direction for 19 s, with `+0x510` = 0.
  - This matches s2: the strict test above 2000, `+0x4f4` rewritten so the run's direction becomes the latched one,
    and `+0x515` untouched.
- **(c) The speed test reads the commanded velocity, not the realised displacement.**
  - He had hit something at x ≈ 2334 0.03 s before the firing frame: his speed from positions is 0 from 2843.7563,
    with the stick held.
  - `+0x510` still counted to 3365, and fell to 0 only at the stick's release (2845.13).
  - The test reads body `+0x38/+0x40`. The move's tail copies `+0x38..+0x40` from `+0x64..+0x6c` (D:L413963-413965, in
    `FUN_005483d0`). `+0x64` is the clip's velocity `+0x70` rotated by the body's orientation, plus a one-shot impulse
    `+0x1a4` (D:L416515-416520, in `FUN_0054d9a0`). So a blocked body that is still commanded to run counts as running.
    [reading, the two writes re-read by the author]
  - **In the air, `+0x64` holds the carried velocity instead** [reading]. `FUN_0054d9a0` (the `CZSealBody` slot at
    data word r1 0x6691c8) still runs in a fall or a jump. After building `+0x64` from the clip (D:L416515-416520), it
    overwrites `+0x64`'s x and z with the carried velocity `+0x1350` / `+0x1358` (D:L416523-416527). It also adds the
    carried velocity x dt to `+0xf44`/`+0xf4c`. Its y keeps the clip's value plus the impulse.
  - That arm runs when any of these holds (D:L416523-416525): `+0x105e` bit 5; actions 8 or 9 (`FUN_00577e40`, the
    running jump's launch and the fall, D:L416503-416508); `FUN_00588030`; the action `DAT_003def08`; or
    `FUN_00587f10`.
  - `+0x1350..+0x1358` is the take-off's world velocity for a running jump (research 80). For a walk-off it is the
    body's `+0x38` copied when the fall begins (D:L466972-466974, in `FUN_005af930`; r4 0x5b5a28-0x5b5a40 per the
    port's mover comment).
  - It loses only its part into a wall (D:L413588-413594). `FUN_005483d0` cuts `+0x1350` and `+0xf44`, not `+0x64`,
    so the `+0x38` copied at the move's tail is the carried velocity as it stood at the tick's start.
  - So for the follow heading's run test, an airborne leader's `+0x38` x/z is his take-off or walk-off velocity, cut
    only by walls. It is not a clip velocity, and it does not change with the stick.
  - That `FUN_0054d9a0` runs on every airborne tick is read from its air arm and from research 80's account; its
    caller loop is not traced.
  - Named `FOLLOW_LEADER_VELOCITY_AIR_READING` (s10).
- **(d) The surface bit.** `+0x1060` reads 0xffff000d in the room (bit 2 set) and 0xffff0009 beyond the door. The
  type-2 switch is fenced online (s4.1), so the goal is unaffected in these runs.
- **(e) The goal.** The slot was (2,2) with `+0x70` = 0 in every row.
  - At the stand, with the leader in (224,81) and the order's heading, the goal was (221,84), as in C6.
  - During the run: 223 83, then 224 80 … 235 80, one cell a frame.
  - In the frame the heading switched: (235,83).
  - Settled with the leader in (236,81): (234,83). That is two back and two over under the east heading.
  - Reproduced by hand as cases 10 and 11 in s5.

**The running branch was NOT reached in C5, not contradicted (F-1 then reached it, above):** his run east lasted about 1.3 s (the walk-east table's R1/R2
1.35 s / 1.27 s; the longest stretch above 28.3 u/s 619 ms / 560 ms), at up to 65 u/s, roughly along his new facing --
the speed (|v|^2 > 800) and direction (cos > 0.82) thresholds met, the duration (> 2000 ms) not. A run of more than 2 s
east would test it: the reading predicts the heading then becomes his velocity's direction.

## 1. The answer in short

- **The sign is not where the port goes wrong.** The facing branch of `FUN_005fc970` takes minus row +0x20 of the body
  matrix `*(body+0x28)`. Research 217 read that row at yaw 185 as (sin yaw, cos yaw), so minus the row is the port's
  (-sin yaw, -cos yaw). [reading for the code; the row's value rests on research 217's single at-rest PCSX2 read]
- **The latch, which the port lacks.** While the leader body has at least one follower (`+0x520 >= 1`), its byte
  `+0x515` is never cleared. With it set, the facing branch reuses the saved heading `+0x4f4` instead of the current
  facing. The heading is therefore frozen at the leader's facing on the first update after the first follower
  attached. Only the sustained-run branch (branch A below) replaces it. [reading]
- **A formation switch exists, retracting the first draft's "nothing selects".** The follower's slot comes from the
  unit's formation type.
  - Type 2 is chosen when the unit leader's body `+0x1060` bit 2 is set. That bit is set from surface data.
  - Type 2's slot 0 is (1, 0): depth 1, lateral 0. Type 1's slot 0 is (2, 2).
  - **But the call that switches the type is fenced by the network byte**: it runs only when byte 0x45a0c1 (r4
    0x45d481) is 0, an offline game, and only for a body whose controller answers slot `+0x2c`. The fence is in r1
    0x5b7f40-0x5b7f48 and is word for word the same at r4 0x5be508-0x5be510.
  - In the rig's network matches the type therefore cannot become 2 by this path. [reading]
- **Three candidate mechanisms for the eight rig goal cells** (s5):
  - (A) formation type 2 at the halts;
  - (B) the latch;
  - (C) a flipped facing.
- **What the readings say about them** [reading]:
  - (B) alone fits all eight cells, given the trail assumptions.
  - (C) fits the six running and post-run cells. It fails the D1/C1 halt if the leader there truly faced south.
  - (A) fits only the two halts and the first running cell, and needs (B) or (C) for the rest. Online it is excluded
    by the network fence, unless some other writer of the type exists.
- **Which rig words tell them apart** (s5): the leader's `+0x1060` bit 2, the follower goal's `+0x5c/+0x60`, and the
  leader's `+0x515`, `+0x4f4` and `+0x4e8` set against his yaw, per row. The rig's rows decide, not the neater story.
- **The port has no formation type 2.** It carries only the type-1 table (`hostageFollow.ts:57-58`) and assigns slot
  0 (`extraction.ts:675`). Research 189 records type 2 as (1+i, 0) with `DAT_00650b00` = 1 (189:156, :490). Its
  `+0x1060` bit 2 is untraced there (189:296). [reading]

## 2. `FUN_005fc970` (D:L509285-509361): the leader's follow heading

**Where it runs** [reading]:
- It is called twice per follow decision on the leader body (goal `+0x58`), from `FUN_005fb1c0` (D:L508607,
  D:L508614).
- Its whole body is behind `+0x514 == 0` (D:L509298; r1 0x5fc998). It sets `+0x514` to 1 (D:L509358; r1 0x5fcc08).
- `FUN_005fcc40` clears `+0x514` every call (D:L509402; r1 0x5fcd10). That function is called from the AI tick
  (D:L432465) and from `FUN_00594cf0` (D:L453083).

**Inputs** [reading]:
- `fStack_10/fStack_8`: minus the floats at `*(body+0x28) + 0x20` and `+0x28`, normalised.
  - The lines are D:L509305-509308. In the bytes: r1 0x5fc9e8 `lw v0,0x28(s5)`, then r1 0x5fc9ec / 0x5fc9fc `lwc1`
    of 0x20 and 0x28.
  - This is row 2 of a 4x4 float matrix. Research 217 identifies `*(actor+0x28)` as the actor's matrix (its row +0x30
    equals the position `actor+0x1c`).
- `fStack_20/fStack_18`: the velocity `+0x38/+0x40`, with y zeroed.

**Branch A: the sustained run** (D:L509312-509329; the writes at D:L509319-509327) [reading]:
- **It is tested before the latch byte is read, and while latched.** Its code is r1 0x5fca30-0x5fcb60; the read of
  `+0x515` is at r1 0x5fcb70.
- It needs |v|^2 > `DAT_00650c70` = 800.0 (about 28.3 u/s).
- It needs the velocity's direction dotted with the **current** facing (the minus-row vector of this update) above
  `DAT_00650c78` = 0.82.
- All three comparisons are strict: r1 0x650c70 = 800.0, 0x650c78 = 0.82, and the int 0x650c80 = 2000. In r0004 these
  are r4 0x64f3f0, 0x64f3f8 and 0x64f400.
- **The timer** is the integer `+0x510`. While both tests hold it adds (int)(dt x 1000). Either failed test resets it
  to 0; firing does **not** reset it.
- **Once fired**, `+0x4e8` and `+0x4f4` are rewritten with the velocity's direction on each update until the run ends.
  `+0x515` stays 1 throughout.
- The port's latch includes this branch (`hostageFollow.ts`, `FollowTrail.updateHeading`), and its latch unit test
  covers these cases.

**Branch B: no sustained run** (D:L509337-509350) [reading]:
- `+0x515 == 0`: `+0x4e8` and `+0x4f4` both take the current facing (the minus-row vector).
- `+0x515 != 0`: `+0x4e8` takes `+0x4f4` (r1 0x5fcb70 `lbu v1,0x515(s5)`; r1 0x5fcb7c `lwc1 0x4f4`; r1 0x5fcb80
  `swc1 0x4e8`).

**The end of every update** sets `+0x515` and `+0x514` to 1 (D:L509357-509358; r1 0x5fcc04). [reading]

**The clear and the count** [reading]:
- `FUN_005fcc40` clears `+0x515` only while `+0x520 < 1` (D:L509375-509376; r1 0x5fcc50 `lw v1,0x520(a0)`, r1
  0x5fcc5c `sb zero,0x515(s0)`). The test comes before the `+0xc0` vtable call, so it applies to a human leader too.
- `+0x520` is the follower count:
  - the body constructor sets it to 0 (D:L419554, beside `+0x515` = 0 at D:L419542);
  - `FUN_005fcf10` takes 1 off the old leader and adds 1 to the new one (D:L509489-509501);
  - for a hostage, the FOLLOW order adds 1 (`FUN_0058fbe0` → `FUN_005fd010` D:L450398 → `FUN_005fcf10`);
  - a release takes 1 off (D:L510094, D:L510033), and so does the leader's death (D:L413031-413045).
- Research 189 s3 gives Harry's name for the count, NumberOfHostagesControlled.
- That a hostage's death takes 1 off is owed a citation. The port's `led` filters on alive. [placeholder]

**Branch A did not fire in the walk-east runs, and did fire in F-1** (above, (b)). In the walk-east runs: The walk-east CSV's longest stretch above 28.3 u/s is 619 ms (R1) and 560 ms
(R2), against the 2000 ms needed. So any latched heading survived both runs. [the reviewer's count over the rig CSV,
not re-counted here]

## 3. The matrix row and the port's yaw

- The port's walker moves along (-sin yaw, -cos yaw) (`packages/viewer/src/mover.ts:3211`, `:4535`, `:4763`). It
  treats row +0x20 as the facing negated (`mover.ts:4874`). `FollowTrail.updateHeading`
  (`packages/match/src/hostageFollow.ts:125-132`) takes (-sin yaw, -cos yaw) every tick.
- Research 217 (217:1003-1004; a PCSX2 read at rest, n = 1) gives row +0x20 = (-0.089, 0, -0.996) at yaw 185. That is
  (sin 185°, cos 185°) = (-0.087, -0.996).
- The builder that writes `*(body+0x28)` from the yaw is **not read**. A text search for writes through
  `*(x+0x28)+0x20` found none. [placeholder: `BODY_MATRIX_ROW2_READING`]
- Branch A's dot test only shows that the heading is continuous with the minus-row vector when branch A takes over. It
  does not show that minus the row is the forward stick's direction.

## 4. The follow goal: slot, step and trail

### 4.1 The slot and the formation type [reading]

**The slot's writers.**
- `FUN_005fd050(goal, type, index)` (D:L509531-509548) stores `+0x70` = index and `+0x74` = type. It reads the slot
  into `+0x5c/+0x60` through `FUN_005eb910`.
- Its callers, in the bytes:
  - the FOLLOW order, r1 0x590608 (D:L450399), which passes the unit's type `*(team+8)` and index 0;
  - the re-slot `FUN_005eb6d0`, r1 0x5eb780 and 0x5eb7f8 (D:L500062, D:L500075). It passes the count before the
    increment (r1 0x5eb774 `daddu a2,s0,zero`, 0x5eb77c `addiu s0,a2,1`), so a single follower gets slot 0.
- Follow entry (signal 0) writes type 1 and index 0 (`+0x74` = 1, `+0x70` = 0, D:L510066-510067) and reads that slot
  (D:L510068). **The ordering:** the FOLLOW order pushes the follow goal (D:L450393) and only then calls
  `FUN_005fd050` with the team's type (D:L450399). If the entry signal fires inside the push, the order's later call
  overwrites the entry's type 1 with the team's type, so the team's type wins. Whether the entry signal fires inside
  the push (`FUN_005f7ee0` → `FUN_005f6fa0(...,0,...)`) was not read through. [reading; the signal's timing a
  placeholder]
- A third writer, `FUN_005fd0e0` (D:L509551-), sets `+0x5c/+0x60` from explicit offsets. It is called once, from
  `FUN_005cf930` (r1 0x5d014c, D:L485378), apparently a scripted follow with its own offsets. Not on the rig's path
  as far as read. [reading; that path's use is a placeholder]

**The type's one source of 2.**
- `FUN_005eb8a0` (D:L500098-500112; r1 0x5eb8bc `lbu v1,0x1060(v0)`, then the bit-2 test r1 0x5eb8c0-0x5eb8cc) picks
  2 when the unit leader body's `+0x1060` bit 2 is set, else 1. When the type differs from `team+8`, it calls
  `FUN_005eb6d0(team, type, 0)`.
- `FUN_005eb6d0` re-slots every member and writes `team+8` = type (D:L500091). That is the only write of `team+8`
  found.
- Every other caller of `FUN_005eb6d0` passes the current `team+8` back: r1 0x5e86f4, 0x5ec950 and 0x5ee4a4, each
  `lb a1,0x8(...)` (D:L498519, D:L500651, D:L501614). So only `FUN_005eb8a0` changes the type.
- **The team's initial `+8` is 1.** The team's constructor `FUN_005ee6f0` writes it (D:L501758). A value other than
  2 reads the type-1 table (`FUN_005eb910`'s else-arm, D:L500169-500171). [reading, from 8f's second read]

**`+0x1060` bit 2** is written from surface data: a record's `+0xb` bit 2 gates it, and `+0xa` bit 7 gives the value
(D:L456536-456538).

**`FUN_005eb8a0`'s one call** is r1 0x5b7f8c, in `FUN_005b7ba0`'s cell-change path (D:L471346). It sits behind:
- r1 0x5b7f3c: the body's controller slot `+0x2c` answered non-zero (the local player's class, research 404 s14.3b);
- r1 0x5b7f40-0x5b7f48 `lui at,0x46; lbu v1,-0x5f3f(at); bne v1,zero,…`: the network byte 0x45a0c1 is 0;
- r1 0x5b7f84: the controller's `+0x10c` (its unit) is non-zero.

In r0004 the twin of `FUN_005eb8a0` is r4 0x5f3070, found by its `lbu 0x1060` / `dsll32` / `dsrl32` words at
r4 0x5f308c. Its one call is r4 0x5be554, behind the same fence: r4 0x5be508-0x5be510 reads byte r4 0x45d481. Research
404 s14, and research 186, 385, 389 and 391, identify that byte as the online flag.

**So in a network game the formation type does not switch to 2 through the only path read.** [reading]

**r0004** keeps the same offsets [reading, from 8f's second read]:
- the goal's `+0x5c`, `+0x60`, `+0x70` and `+0x74`;
- the leader's `+0x4dc`, `+0x4e8`, `+0x4f4`, `+0x510`, `+0x514`, `+0x515` and `+0x520`.
- The functions' twins sit +0x7800 from r0001.

**A second follower** [reading; which runs last is unread in the code]:
- It keeps the existing latch.
- Its slot is (3,-2) after a re-slot (`FUN_005eb6d0`), but index 0 from the FOLLOW order (D:L450399). Which of the two
  runs last is unread in the code. The rig's F-2 (relayed, one run, s9) shows the re-slot's value holding: the second
  follower's goal read `+0x5c` = 3, `+0x60` = -2, `+0x70` = 1 in every row but the first three after its order, which
  read 2 / 2 / 0 (the order's index 0). The first follower kept (2,2), `+0x70` = 0, in every row. In F-2's one run the
  re-slot's value replaced the order's within three rows; the code path that orders them stays unread.
- NOT FOUND: whether a hostage's death or rescue releases the follower count. If it does not, the latch never re-takes.
  This is tied to `HOSTAGE_DEATH_RELEASE_PLACEHOLDER`.

**What type 2 changes** [reading]:
- Every slot of type 2 is (`DAT_00650b00` + i, 0) for i = 0..7, with `DAT_00650b00` = 1 (D:L500142-500158; research
  189:156, :490). That gives depths 1 to 8, all with lateral 0: every follower in single file down the trail, the n-th
  follower n points back.
- Type 1 is (2,2) (3,-2) (4,-3) (5,-2) (6,3) (7,5) (8,-4) (9,-5).
- Both tables have eight slots. An index past 7 reads beyond them; that is not read.
- The type has no other reader found: `FUN_005eb910` is reached only through `FUN_005fd050` and follow entry, and
  `team+8` is otherwise only passed back to `FUN_005eb6d0`. A text search, not an exhaustive one. [reading]
- **The port** has only the type-1 table (`hostageFollow.ts:57-58`) and always slot 0 (`extraction.ts:675`).

### 4.2 The step `FUN_005fd790` (D:L509806-509897) [reading]

- The depth (goal `+0x5c`) is clamped to [1, 100] by `FUN_00519290` (D:L508687; the bounds r1 0x650c90 = 1 and
  0x650c98 = 100; `FUN_00519290` is D:L386560-386576). The lateral (goal `+0x60`, D:L508686) is passed unclamped.
- The heading is goal `+0xb0`, copied from leader `+0x4e8` (D:L508615-508617).
- The base is trail point `depth`. The leader's trail keeps its newest point at index 0.
- Step i (1..|lateral|; a negative lateral negates the heading) moves the base by:
  - column (bits 6-18): (int)(0.5 - i*hz);
  - row (bits 19-31): (int)(0.5 + i*hx).
- The casts truncate toward zero, so (int)(-0.5) = 0.
- The loop keeps the last candidate that passes all of these:
  - `FUN_00524760`, the trail test: Manhattan cells <= a trail point's width byte +4, and the trail's `+0x1c` bit 2
    set (D:L392151-392195);
  - `FUN_0052a090`, traversable;
  - when `param_7` (`uVar35`) is set, `FUN_005fc550`'s cell types {2, 4, 5, 12} as well (D:L509872-509886).
    `uVar35` is set from the follower's `+0x264` bit 1, the leader's `+0xdc` = 0, and the leader's own cell type in
    that set (D:L508664-508683; `FUN_005fc550` D:L509127-509138). The port has no such test
    (`hostageFollow.ts:466-469`). Research 199 finds those types absent from MP6; MP71 is unchecked.
- The port's loop (`hostageFollow.ts:463-470`) is the same formula.

**When the step fails** (index past the trail's count), the goal falls back to the leader's position, plus velocity x
0.65 (`DAT_00650c30`), plus the (-depth, lateral) offset rotated by the same heading `+0xb0` (D:L508700-508719). So a
latched heading carries into the fallback too. The port's fallback (`hostageFollow.ts:474-476`) reads
`trail.heading`. [reading]

**The fallback's lateral runs the other way from the trail step's.** The fallback adds (hz, -hx) x lateral x 10
(D:L508714-508716). The trail step moves by (-hz, +hx) per cell. The port's fallback (`hostageFollow.ts` ~:495-496:
x + lateral x c x fz, z - lateral x c x fx) **matches** the original's. [reading]

### 4.3. The trail

- **The recorder.** The leader's trail at `+0x434` is written by `FUN_00524d50` (D:L471319-471324), not by
  `FUN_00526f20` as the first draft said. The loop cut is `FUN_00524d50` D:L392407-392467, as the port cites.
  [reading]
  The rig's "+0x4d0/+0x4d4" (q31b) are the same record seen from the body: 0x434 + 0x9c = 0x4d0 (the count) and
  0x434 + 0xa0 = 0x4d4 (the points). No offset here is wrong (the hostages seat, 2026-11-18, closing the lane's owed
  wording fix as not needed). [reading]
- **The width byte +4** [reading]:
  - when the flag argument has bit 3 clear: `FUN_005396c0(map, cell, 5)` (D:L392469-392478);
  - otherwise 0.
  - The flag is 8 when the leader's `+0x1061` bit 6 is set, else 0 (D:L471320-471323).
  - The port's `trail.add(loc, planner.width(loc))` (`extraction.ts:784`) matches, bar the flag case.
- **The rows.** Rows grow with world z: z 766.04 is row 81, and z 767.51 / 768.38 are row 82. [rig records: the
  walk-east CSV, L_z against L_e8cell]

## 5. The three mechanisms against the eight goal cells

**The trail assumed in each row** [placeholder, `FOLLOW_TRAIL_DOOR_CELLS_PLACEHOLDER`]:
- **D1/C1 halt and first running row.** The trail holds (223,82) and (223,81) between (223,83) and (224,81). The
  leader halted in (223,81), but the relayed `+0xe8` list skips from (223,83) to (224,81).
- **C2 halt.** That skip is real. A skip is real if the skipped cells failed `FUN_0052a090` (D:L471291-471293), as
  door cells may. With (223,82) or (224,82) on the trail, the goal would be (223,81) or (223,82), not (223,83). C2's
  relayed path also skips (222,84), so the list may be sparse.

**The mechanisms:**
- **(A) Type 2 at the halts:** slot (1, 0), so the goal is trail index 1, whatever the heading. It needs the leader's
  `+0x1060` bit 2 set at the halt, and clear again on row 81 for the run.
- **(B) The latch:** slot (2, 2), heading frozen roughly west. The six cells need hx <= -0.75 and -0.25 < hz < 0.75.
  Step 1 stays in the base cell; step 2 moves one row toward -z.
- **(C) A flipped facing:** slot (2, 2), heading = minus the port's facing, taken every tick (no latch). Running east,
  it gives h = (-1, 0).

| # | leader, trail index 0/1/2 | measured goal | (A) type 2 | (B) latch, h ≈ (-1,0) | (C) flipped facing | the port (current facing) |
|---|---|---|---|---|---|---|
| 1 | D1/C1 halt (223,81) facing south; (223,81) (223,82) (223,83) | (223,82) | (223,82) ✓ | base (223,83), step 2 → (223,82) ✓ | facing south gives hx ≈ 0, no row step: (223,83) or a column beside it ✗ | current facing south (h = (0,+1)): columns 0, then -1 → (223,83) or (222,83) ✗ |
| 2 | (224,81); (224,81) (223,81) (223,82) | (223,81) | (223,81) ✓ | base (223,82) → (223,81) ✓ | ✓ if he already faced east | row +1, +2 from (223,82): (223,83), then (223,84), both on the trail → (223,84) ✗ |
| 3 | (225,81); … (223,81) | (223,80) | (224,81) ✗ | (223,80) ✓ | (223,80) ✓ | (223,83) or (223,82) ✗ |
| 4 | (226,81) | (224,80) | (225,81) ✗ | ✓ | ✓ | ✗ |
| 5 | (227,81) | (225,80) | (226,81) ✗ | ✓ | ✓ | ✗ |
| 6 | (228,81) | (226,80) | (227,81) ✗ | ✓ | ✓ | ✗ |
| 7 | C2 halt (224,81); (224,81) (223,83) (223,84) | (223,83) | (223,83) ✓ | base (223,84) → (223,83) ✓ | only if his yaw then gave hx <= -0.75; his facing at the halt was not relayed | depends on his yaw |
| 8 | C2 after the run (228,81) | (226,80) | (227,81) ✗ | ✓ | ✓ | ✗ |

[The measured cells are rig records (D1, C1, C2; relayed). Each prediction is a reading worked by hand.]

**F-1's settle, cases 10 and 11** (heading h = (1.0000, -0.0029) after branch A fired; slot (2,2)). Step i moves
the column by (int)(0.5 - i*hz) = (int)(0.5 + 0.0029 i) = 0, and the row by (int)(0.5 + i) = i. [reading, by hand;
the trail is an assumption, below]

| # | leader, trail index 0/1/2 | measured goal | (B) with the run's heading |
|---|---|---|---|
| 10 | the firing frame, leader in (237,81) at x ≈ 2334; (237,81) (236,81) (235,81) | (235,83) | base (235,81), steps → (235,82), (235,83) ✓ |
| 11 | settled, leader back in (236,81); the return cuts the trail to (236,81) (235,81) (234,81) | (234,83) | base (234,81), steps → (234,82), (234,83) ✓ |

- **Case 10's cell is an inference.** The leader is placed in (237,81) because he was blocked at x ≈ 2334. Columns run
  10 units wide on boundaries at 2210 + 10k: the walk-east CSV puts 2213.1 in 225, 2221.8 in 226, 2232.4 in 227 and
  2243.1 in 228. On those boundaries 2334 is in column 237 and 2329.3 in 236.
- **Case 11 rests on the loop cut.** His return from 237 to 236 is a loop, which cuts the trail back to (236,81)
  (`FUN_00524d50`'s loop cut, s4.3). Without the cut, index 2 would be (235,81) and the goal (235,83).
- Both rows assume the candidates pass the width and traversable tests.
- [placeholder, `FOLLOW_TRAIL_DOOR_CELLS_PLACEHOLDER` widened to F-1's trail at the settle]

**Reading the table:**
- (B) alone fits all eight.
- (C) fits rows 2-6 and 8. Row 7 depends on his yaw. Row 1 fails if he faced south.
- (A) fits rows 1, 2 and 7, but not 3-6 or 8. It can only be a halt-time partner to (B) or (C).
- Once (A) covers the halts, (C) fits all eight as well. That is the reviewer's point: then only research 217's
  single read stands against (C).
- (A) is excluded online by the network fence (s4.1). This holds unless the rig matches were not network games, or
  some writer of `team+8` was missed. (The team's initial `+8` is 1, D:L501758.)

**Which rig word tells them apart, per row.** Log each on the leader's console per frame, from before the order to the
end:

| word | (A) predicts | (B) predicts | (C) predicts |
|---|---|---|---|
| leader body `+0x1060` bit 2 | set at the halts (rows 1, 7), clear on row 81 | any | any |
| follower goal `+0x5c` / `+0x60` (and `+0x74`, the type) | (1, 0), type 2 at the halts; (2, 2) in the run | (2, 2), type 1 throughout | (2, 2), type 1 throughout |
| leader `+0x515` | any | 1 from the first update after the order to the end | 1 as well: the code sets it every update, so this word does not tell (B) from (C); it only confirms the latch's flag |
| leader `+0x520` | ≥ 1 | ≥ 1 | ≥ 1 |
| leader `+0x4f4` | — | constant from the order until branch A fires (it did not in C5; it did in F-1) | — |
| leader `+0x4e8` against his yaw | — | constant while the yaw turns, equal to his facing at the order tick | turns with the yaw, equal to (+sin yaw, +cos yaw) in the port's yaw (minus the port's facing) |
| byte r4 0x45d481 | 0 (offline) is needed for (A) | any | any |

- `+0x4e8` against the yaw between rows 1 and 2, where the leader turns from south to east, separates **a latch from
  no latch**. It stays constant under (B) and turns under (C).
- It does not separate (B) from **(B′), a latch with a flipped sign** (the stored vector = plus the row, the facing
  negated). For that, `+0x4e8` must be compared **by value** with (-sin, -cos) of his yaw **at the order tick**:
  - equal, then (B);
  - opposite, then (B′).
- **The cheap set-up check, restored:** the latched heading should point the way the leader faced when he gave the
  order.
  - Under (B) the six running cells need that facing to have hx <= -0.75, roughly west.
  - Under (B′) they need it roughly east.
  - So C2's facing at its order, a leader standing at (218,83), decides (B) against (B′) from one yaw reading. Under
    (B), if he faced east, the latch as read does not explain C2.
- Then `+0x5c/+0x60` at rows 1 and 7 decides (A).
- (C) is not a reading of the code: with `+0x520 >= 1` the code as read cannot track the yaw. (C) stands only if the
  latch reading is wrong; its row is listed so that the rig can refute it.

## 6. What the port should do, and what it must not approximate

- **Do: model the latch** (B) per leader. The port already keeps one `FollowTrail` per leader (`extraction.ts:567`,
  `:768-785`). The first draft's "per follower" was wrong.
  - A saved heading and a latched flag.
  - Branch A sets heading = saved = the velocity's direction.
  - Otherwise, if not latched, heading = saved = the facing; else heading = saved.
  - Then latched = true.
  - A release clears latched on each tick when the body is not led (`FUN_005fcc40`'s clear while the count < 1).
  - [simulation track; reading, pending review]
- **Do: model the formation type** with its table and the offline fence: type 2 = (1+i, 0) on the unit leader's
  `+0x1060` bit 2, switched only when the network byte is 0. For the port's network room that means type 1 always,
  unless the rig shows (A) online. Leaving the type unmodelled is acceptable online only while the fence reading
  stands. [reading, pending review]
- **Must not** flip the sign of (-sin, -cos) to fit the running cells. That is (C). It is not what the code does
  under a follower count of at least 1, and only the rig can revive it.
- **Must not** use (A) to explain the halts in an online match without the rig's `+0x1060` bit 2 and `+0x5c/+0x60`
  rows.
- **Must not** guess the frozen heading from the run or the trail. It is the facing at the latch tick.

## 7. Named unknowns, and what settles each

- `FOLLOW_HEADING_LATCH_READING`: the latch (s2). Settled by the per-frame log of s5: leader `+0x4e8/+0x4f0`,
  `+0x4f4/+0x4fc`, `+0x515`, `+0x520`, `+0x510`, his yaw.
- `FOLLOW_FORMATION_TYPE_READING`: the type switch (s4.1). Type 2 = (1+i, 0) on the unit leader's `+0x1060` bit 2,
  through `FUN_005eb8a0`, fenced to offline games and a local-player leader. Settled by the same log with the leader's
  `+0x1060`, the follower goal's `+0x5c/+0x60/+0x74`, and byte r4 0x45d481.
- `FOLLOW_BRANCH_A_READING`: that branch A replaces the latch after 2 s of aligned running above 28.3 u/s, on the
  commanded velocity `+0x38/+0x40`. The rig's F-1 (relayed, one run) supports it: it fired at `+0x510` = 2029, and a
  blocked but commanded run kept counting. The level stays reading.
- `BODY_MATRIX_ROW2_READING`: the builder of `*(body+0x28)` from the yaw, and minus row 2 against the forward stick.
  Settled by reading the builder, or by a PCSX2 read of row +0x20 while running under a forward stick.
- `FOLLOW_TRAIL_DOOR_CELLS_PLACEHOLDER`: the leader trail at rows 1, 2 and 7: whether (223,82) and (223,81) are on it
  for D1/C1, and whether C2 truly skips to (224,81). Settled by the trail array at leader `+0x434` (`+0x9c` count,
  `+0xa0` points) in the same log.
- `FOLLOW_STEP_CELLTYPE_READING`: `param_7`'s cell-type test (s4.2), absent from the port. Settled by reading MP71's
  cell types for {2, 4, 5, 12} on the trail's cells.
- `HOSTAGE_DEATH_RELEASE_PLACEHOLDER`: a citation that a hostage's death takes 1 off `+0x520`.
- **Open item, note only (no ledger name):** the hostage's own body velocity, which the port reads after the wall
  (`match/src/hostageFollow.ts:252`, `bodyVelocity`, commented "original actor+0x38 velocity").
  - In the original the hostage body's `+0x38` is the same field as the leader's. It is copied at the move's tail
    from `+0x64` (D:L413963-413965), which is the clip's velocity rotated, plus the impulse, or the carried velocity
    in the air. It is therefore pre-wall for the tick.
  - Which reader of a hostage body's `+0x38` the port's `bodyVelocity` stands for was not traced. Candidates are the
    landing rule's "last airborne tick's velocity", and the follow heading's run test when the hostage is itself a
    leader, which it never is.
  - Not in this task unless a rig case needs it.
- `FOLLOW_ARRIVAL_POINT_READING` (note only; nothing is built on it -- the main controller's ruling, 2026-11-15): what
  sets the point where a follower halts short of its follow goal. **Partly read (s7.1; reading, pending review).**
  - The port's test, `goalDistance <= FOLLOW_RULES_READING.arrival * FOLLOW_RULES_READING.radius` = 1.25 x 15 = 18.75 u
    (`match/src/hostageFollow.ts`, `HostageFollow.control`, the `arrived` assignment; at
    `agent/wm-hostage-heading@cac4cc644c`), is the original's arrival test. But it bounds only the distance at the
    arrival tick.
  - The halt adds three things: the coast once the route is cleared; a rear step when the leader's controller answers
    virtual `+0x2c` (believed to mean the host's own human player, research 189); and a standing wait (state 8) when a
    route request fails.
  - The rig's runs, each one run:
    - D1: 15.5 u short (`match/test/hostageOpenDoor.devdisc.test.ts`'s D1 case);
    - R2 (q31b): 22.7 u short, the goal (221,84) at (2174.58, 791.81), the halt (2151.96, 789.94) (hub
      `rig/q31-hostage-R2/R2-read.txt`; reading, pending review; Q24's R2 halted 44.1 u from the leader against q31b's
      54.3, so runs vary);
    - C5: 24.64 u short (hub `rig/q26-hostage-C5/C5-summary.txt`).
  - The halts inside 18.75 u fit the arrival and a coast: D1 15.5, and the q26 record's C1 18.6, C3 18.4 and C6 16.8.
  - R2's 22.7, C2's 22.7 and C5's 24.64 do not fit the arrival, the coast or the rear step. They fit the
    failed-request wait. That is not settled.
  - The goal's `+0x7c/+0x7d` 1/0 does not mark the arrival. It marks states 4, 5, 7 and 8 alike (s7.1).
  - Still open under this name: the follower's state at each halt beyond 18.75 u, why its request failed, the
    coast's length, and whether a remote leader's follower walks its kept route on. Settled by the rig read in s7.1.
    Simulation track.

### 7.1 The arrival and the halt (`FOLLOW_ARRIVAL_POINT_READING`)

Read by one reader at the main controller's request, 2026-11-15, on r0001's decompilation. Every code line here is
**reading, pending review**. The rig's runs are rig records (relayed): the q26 record's leg-2 table and LIMITS
(`rig-q26-hostage-door-read-RECORD.md`), the C5 answer (`RIG-ANSWER-wm-hostage-C5-2026-11-15.md`), the R2 repeat
(hub `rig/q31-hostage-R2/R2-read.txt`) and Q24's walk-east summary. Cell centres are the record's
(10 cx - 35.42, 10 cz - 48.19).

**The two bytes say less than "arrived".**
- `FUN_005fb1c0` clears goal `+0x7d` and `+0x7c` at the top of every update (D:L508576-508577). Only the state switch
  sets them again.
- `+0x7d` = 1 is set in state 3 alone, on an update with a live route (D:L508949).
- `+0x7c` = 1 is set in state 4 (D:L509034), in state 5 while its move lasts (D:L509056), and in states 7 and 8
  (D:L509071). Two exceptions:
  - State 4 sets it only when the leader answers virtual `+0x2c` (D:L508968). Otherwise state 4 breaks first, and
    that tick reads 0/0.
  - In state 5, when the follower's controller word `piVar24[0xcb]` is nonzero, it is set to 0 instead and the direct
    move is cancelled (`FUN_0056dca0`, D:L509058-509061).
- The state is goal `+0x34`. It is read at D:L508585 and written back at the update's end (D:L509083-509087).
- So the rig's 1/0 means "in state 4, 5, 7 or 8", not "arrived".
- **State 8 is the wait after a failed route request.**
  - Case 2 sets `+0x80` = 2.5 s (0x40200000) and enters 8 (D:L508824-508829).
  - States 7 and 8 count `+0x80` down and return to 0 at zero (D:L509076-509080). State 0 asks again and enters 2.
  - States 0 and 2 set neither byte. That covers the state-0 tick and every state-2 tick, the tick that fails back
    into 8 included. So a waiting follower reads 1/0, broken every 2.5 s by a run of 0/0 ticks. How long the run lasts
    depends on how long the planner takes.
- An arrived follower enters 7 with `+0x80` = 0 (D:L508820, D:L508936, D:L509065), so it does not blink.

**The arrival test.**
- The distance is a 3D length. The follower body's `+0x1c` is copied to goal `+0xd8` (D:L508621-508623). The goal
  point `+0xf8` minus it is normalised in place by `FUN_00309110`, which returns the length (D:L207443-207458). The
  length is stored in `+0x114` (D:L508721-508732).
- Arrived when `+0x114` <= `DAT_00650ca0` x `+0x68` (D:L508735).
  - `DAT_00650ca0` = 1.25.
  - `+0x68` = 15. It is set at the follow's entry from `DAT_00650c28` (`FUN_005fdf80` D:L510065).
  - The two words were read from the static data in the RAM images under `logs/parity/`. They agree with research
    334 s1.
  - So the radius is 18.75 u, as the port has it.
- The height counts, but little here. C5's follower stood at y 179.00 and its goal point at y 178.49: 0.5 u.
- State 0 enters 4 when arrived, and clears the route (D:L508817-508821).
- State 3 enters 4 when arrived and either of two holds (D:L508934-508936): the follower's cell is the route's end
  cell (Manhattan 0), or the leader's speed `+0xbc` is below 10. This is research 334 s1. The port has it
  (`HostageFollow.control`: the `arrived` assignment, and the `sub = 4` on `xyCells(here, end) === 0 ||
  leaderSpeed < 10`; at `agent/wm-hostage-heading@cac4cc644c`).
- State 3 with no live route enters 4 on any arrival, with neither condition (D:L508954-508956); it enters 0 when not
  arrived (D:L508951-508952).
- So 18.75 u bounds the distance to the goal as it stands at the arrival tick, and nothing more. What follows the
  arrival makes the halt.

**After the arrival: state 4.**
- State 4 stores the leader's cell (`+200` = `+0xc0`), sets `+0xc4` = 1 and enters 7 (D:L508960-508962).
- It goes on only when the leader's controller answers virtual `+0x2c` (D:L508963-508968). It then clears the route
  (D:L508969) and tries a rear step.
  - What `+0x2c` answers: CSealCtrl = 1, and AI or remote = 0, in research 189's table, which files that gate as
    BELIEVED ("local human"). Research 334 s1 calls it "host-local human".
  - This note takes that meaning at the same level: believed, not read. The vtable slot's target for CSealCtrl was not
    re-read here.
- When the leader's controller answers 0, state 4 does not clear the route. After a state-3 arrival the follower keeps it.
  Whether the route steering then walks it on to its end in state 7 was not traced.
- **The rear step** (D:L508970-509045).
  - It needs the follower's `+0xdc` = 0, and the follower on the leader's submap (D:L508972-508973).
  - `FUN_00559580` (D:L422344-422447) is called with flags 0xd0003 and range 8 (`DAT_00650d18`). It calls
    `FUN_00535a40` (D:L402211-402316).
  - `FUN_00535a40` marches from the follower's cell along each of eight octants (the table at 0x64f910), up to 8
    cells. It stops at the grid's edge, at a missing or unwalkable cell (`FUN_00511f40`), at a cell holding an actor
    (`FUN_00515750` over the actor list), or once it has counted a net two (`DAT_0064fa60`) cells of types 4, 5 or
    12 (D:L402274-402285).
  - `FUN_00559580` takes five octants: the one nearest minus the leader's follow heading `+0xb0`, then the next one
    each side, then the one beyond each side (`FUN_00518b60`'s octant; flags 0x40000 and 0x80000, D:L422404-422437).
    Of these it takes the octant with the fewest steps, and that octant's last cell.
  - The follower moves to that cell in either of two cases. The cell's type is 2, 4, 5 or 12 (`FUN_005fc550`
    D:L509127-509137). Or the steps are fewer than 5 (`DAT_00650d20`) and the cell is no nearer the leader in Manhattan
    cells than the follower's own (D:L508993-509027).
  - Otherwise it stays. A cell equal to its own is no move (D:L509035-509038).
  - The move is a direct move to the cell's centre, radius 5.0, priority 3 (`FUN_0056dba0` D:L432125-432155;
    D:L509041). The state goes to 5 and `+0xc4` to 3 (D:L509042-509043). State 5 enters 7 when the move ends
    (D:L509046-509066).
- **The hold: states 4 to 7.** No timer runs (`+0x80` = 0). `FUN_005fc7d0` (D:L509214-509258) runs before the switch
  (D:L508788-508792). In states 4, 5, 6 and 7 it sends the follower back to 0 only when both hold: it is not arrived,
  and the leader's cell is more than `+0xc4` Manhattan cells from the stored one. That is one cell after a plain
  arrival, and three after a rear step. State 5 is included, so a rear step under way can be cut off.
- **The coast.** Once the route is cleared, nothing drives the body, and it slows through its own clip. That length is
  the body's, not `FUN_005fb1c0`'s, and was not read.

**Against the rig's halts.**
- The leader was console B, the host. If `+0x2c` means a host-local human, as research 189 believes, the rear step
  applies in these runs.
- In the q26b runs console C stood at the door's prompt spot (2194.6, 792.5), in cell (223,84), from before the measured
  stretch.
- **Inside 18.75 u: C1 18.6, C3 18.4, D1 15.5, C6 16.8.**
  - A follower coming up row 84 from the room to goal (223,82) meets the 18.75 u circle at z 790.56. C1 halted at
    z 790.43.
  - The arrival and a coast of 0.15 to 3.25 u fit all four.
  - The coast is unread, so that spread is not checked.
  - D1's leader overshot his stops (the record's LIMITS), so its arrival may be the route-end-cell branch.
- **Outside 18.75 u: R2 22.7, C2 22.7, C5 24.64.**
  - With the leader still and the goal unchanged, the arrival and a coast cannot leave the follower farther than
    18.75 u from the goal.
  - The rear step cannot place C5 there either, on C5's measured heading (-0.9147, 0, 0.4040). The candidates are the
    octants round (0.9147, -0.4040): north-east, north, east, north-west and south-east. None moves the follower back
    south-west, as C5's halt needs. C5 stands in (223,84), 24.2 u south of its goal, and a step never targets the
    follower's own cell.
  - R2 stands at x 2151.96 in (219,84). An eastbound follower meets the circle round (221,84) at x 2155.83, in the
    same cell, so R2 stands 3.9 u short of it. R2's heading was not given. If it is the form's, the same holds.
  - The goal moving after the arrival is ruled out where the leader stood still through the approach. Q24's
    walk-east table has him still for 10 s before the follower's rest; C5's answer has the leader still.
  - What the code leaves is state 8. A follower whose request failed stands for 2.5 s, reading 1/0, wherever its last
    route left it, and then asks again.
  - That fits the record's "single-frame 0 / 0 blinks every few seconds", and Q24's "small shuffles go on" after
    rest. The record gives the blinks for the runs together, not run by run. C5's 245 rows (2.1 s) show none, which a
    2.5 s period allows.
  - Why the request failed is not read. There are two candidates. One is console C's body near the doorway, as
    occupancy (research 335). The other is the trail corridor (D:L508806-508812), whose cells are not contiguous in
    these trails: (218,83) to (220,84), and (221,84) to (223,84).

**Settled, and open.**
- Settled as a reading, pending review:
  - the arrival test: 3D, 18.75 u, with the route-end-cell or leader-speed condition;
  - that 1/0 marks states 4, 5, 7 and 8 alike, with s7.1's two exceptions;
  - the rear step and its gate on the leader's virtual `+0x2c`; that `+0x2c` means a host-local human is research
    189's BELIEVED, not read here;
  - the restart, in states 4 to 7, after one cell, or three after a rear step.
- Open, under `FOLLOW_ARRIVAL_POINT_READING`:
  - the state of each halt beyond 18.75 u;
  - why its request failed;
  - the coast's length;
  - whether a remote leader's follower walks its kept route on.
- **The rig read that settles it.** Read every frame:
  - on the follower's goal (class word 0x00669320): `+0x34` (the state), `+0x114` (the compared distance), `+0x80`
    (the wait), `+0xbc` (the leader's speed), `+0xc0`, `+200` and `+0xc4`;
  - on the follower's controller: `+0x4ec` (the request's status; the record reads 4) and `+0x508` (the route);
  - also on the controller: `+0x170` bit 0, `+0x180..+0x188` and `+0x1b4` (a rear step's target and radius);
  - console C's position.
  - Run it as an open-door repeat of the R2 and C5 forms, once with console C at the prompt spot and once without.
  - State 8 at a halt beyond 18.75 u settles the wait. State 5 with a target settles a rear step. The frames from the
    arrival tick to rest give the coast.

**What the port would change** (described only; nothing is built, by the ruling):
- Keep the 18.75 u test. It is the original's.
- Check that the walker's coast after a cleared route is the original body's. Do not fit it to the halts.
- The rear step runs only for a leader whose controller answers `+0x2c` (believed host-local, research 189). The
  dedicated room has no such leader (the doc comment on `HostageFollow`, at `agent/wm-hostage-heading@cac4cc644c`), so
  leaving the step out stands. The rig measures a host-leader game. Its halts are not to be fitted while the step is
  left out.
- When the leader's controller answers 0, the original keeps the route at state 4 after a state-3 arrival. The port
  clears it (`HostageFollow.control`, the `sub === 4` branch's `this.route = []`; at the same commit). Change that
  only once the route steering in state 7 is traced.
- The halts beyond 18.75 u are, on this reading, candidates for failed requests (state 8), not arrivals. Only if the
  rig read confirms state 8 does the port reproduce them, and then through the same failure (its planner and its
  occupancy), never through the radius.
- Read the open-door test's halt bands by state: within 18.75 u for an arrival, and no band for a wait.

- **The stop from the leader, as a capture band (LATER 1126, CLOSED 2026-11-18, the main controller's ruling):** the
  open-door test's (a3) passes with STOP = 20-28.2 u, a hand-scored capture band -- the observed min and max over n = 6,
  not proven at a tolerance: the Q24 retry's four (20-24) and Q24b's T1 28.15 and T4 25.39 (`agent-mail`
  `evidence/weekend-mega-2026-11-14/rig/Q24b-PC1/`, sha256 472a4eba...f786; the leader placed within 3 u). The port's
  follower stops 24.71 u from the leader at the rig's rest, inside it. Q24b's T3 30.66 and T5 31.07 had the leader
  misplaced by 3.7-4.7 u: placement failures, left out, which show how sensitive the stop is to where the leader rests.
  **Open reading, not a tracked row:** what spreads the original's stop over 20-28 u -- the body's coast after the
  arrival and the rear step (a host leader's, s7.1 above) are the candidates; settled, if ever wanted, by a per-frame
  read of the follower from its arrival tick to its halt.

- **Open item, note only (no ledger name; review 1 of the fix, finding 8, predating the task):** when the heading
  updates. The original calls `FUN_005fc970` only from the follower's decision `FUN_005fb1c0` (D:L508607, :508614),
  after that function's early returns (D:L508578-508604). The port updates the heading every frame for any body a
  living hostage follows. So while the follower's decision returns early, the port's `runningMs` may count where the
  original's `+0x510` does not. Settled by reading which early returns a following hostage can take, or by the rig's
  per-frame `+0x510` across one of them.

- The leader's walk from the order's facing (a test adaptation, note only): the open-door test turns the port's leader to
  his route's next point after the order (the walk's snapped look otherwise swung him 5.06 u wide of the doorway's
  waypoint, box run 89ba04908e). The rig's leader also walked on from facing the hostage, so how the port's player body
  turns and walks from that facing is worth one rendered look later; it does not touch the follower.

## 8. Scripts and limits

- Small standard-library decoders (read-only), in the author's scratch directory outside git.
- r0004 was compared only for the type switch's fence and `FUN_005eb8a0`'s twin. It was not compared for
  `FUN_005fc970`, `FUN_005fcc40` or `FUN_005fd790`.
- The eight goals, the trail cells and the leaders' facings are the coordinator's relays of the rig's D1, C1 and C2
  runs. This author did not see those logs.

## 9. Review

- **Review 1: FAIL** (a fresh read-only reviewer; record on `agent/wm-hostage-records`,
  `review-records/research-435-review-1.md`). One blocking finding and seven non-blocking ones. The latch itself held
  at the source: the instruction words, the constants, the count, the clamp, the step, and the hand computation of
  the eight cells under the stated trail assumptions.
- **Folded in this revision:**
  1. BLOCKING. "Nothing selects" is retracted. The formation type switch (`FUN_005fd050`'s callers, `FUN_005eb6d0`,
     `FUN_005eb8a0` on `+0x1060` bit 2, type 2 = (1, 0)) is s4.1 and is named `FOLLOW_FORMATION_TYPE_READING`.
     - The three mechanisms are set side by side against the eight cells, with the words that decide them (s5).
     - The leader's `+0x1060` bit 2 is added to the log.
     - Added by this author on re-reading: the switch's only call is fenced by the network byte, in r0001 and r0004
       alike (r1 0x5b7f40-0x5b7f48, r4 0x5be508-0x5be510). Every other re-slot passes the current type, and
       `FUN_005fd0e0` is a third slot writer.
  2. The trail recorder is `FUN_00524d50`, with its width byte (s4.3). `FOLLOW_TRAIL_WIDTH_READING` is dropped as
     answered, bar the flag case.
  3. C2's trail assumption is tagged, and the door-cells placeholder covers C2 (s5).
  4. `param_7` and its cell-type test (s4.2), named `FOLLOW_STEP_CELLTYPE_READING`.
  5. The fallback uses the heading (s4.2).
  6. Branch A's non-firing in the rig (619 ms) is said, and named as a second test (s2, s7).
  7. The port's trail is per leader (s6).
  8. Level words are now PROCESS's, with the rig as relayed records; D:L509298 and D:L509319-509327 corrected.
- **Fold re-read of review 1: FOLD PASS WITH FINDINGS** (the same reviewer; record on `agent/wm-hostage-records`,
  `review-records/research-435-review-1-fold.md`). All eight were folded correctly, and the fence and slot claims held
  at the bytes in both ELFs. Six small findings are folded here:
  1. Follow entry writes type 1 and index 0. The FOLLOW order's `FUN_005fd050` (D:L450399) runs after the push
     (D:L450393). The entry signal's timing inside the push is not read through (s4.1).
  2. The type-1 arm is D:L500169-500171 (s4.1).
  3. "(A) excluded online" also rests on the team's initial `+8` (s5).
  4. The port column's rows 1 and 2 (s5).
  5. The deciding table's `+0x515` row. `+0x4e8` is compared by value with (-sin, -cos) of the yaw at the order tick,
     to tell (B) from a flipped-sign latch, and the C2 set-up check is restored (s5).
  6. The third re-slot caller is D:L501614 (s4.1).
- **8f's second read: SOUND WITH CORRECTIONS** (high on the code; at `09b4b9fb45`; the hub's
  `reviews/research-435-second-read-09b4b9fb4.md`). Folded here on the filed note as the base, keeping its C5 section
  and its section 10:
  1. MUST: the team's constructor `FUN_005ee6f0` (D:L501758) writes `+8` = 1. This replaces "the team's initial `+8`
     not read". s5's clause on an initial 2 is deleted, and the initial value is dropped from
     `FOLLOW_FORMATION_TYPE_READING`. (The author re-read D:L501758.)
  2. MUST: branch A is tested before the latch byte is read, and while latched. Its alignment uses the current facing;
     its comparisons are strict; it runs on the integer timer `+0x510`, which is not reset on firing; once it fires it
     rewrites `+0x4e8/+0x4f4` each update; `+0x515` stays 1 (s2).
  3. SHOULD: the fallback's lateral is (hz, -hx) x lateral x 10 (D:L508714-508716), opposite to the trail step's; the
     port matches it (s4.2). (The author re-read D:L508700-508719.)
  4. SHOULD: C5's 9157 rows and C6's 8655 are folded as relayed records supporting the latch and ruling out (C) and
     (A) for that match. C5's "proven" is changed to "supported by the rig's relayed measurement".
  5. SHOULD: the offsets are unchanged in r0004 (s4.1).
  6. NOTE: the second follower's slot order (unread), and whether a death or rescue releases the count (not found;
     `HOSTAGE_DEATH_RELEASE_PLACEHOLDER`) (s4.1).
- **The rig's F-1 (run F12a), folded** (relayed by the main controller, 2026-11-15). Supporting measurement, not
  harness-scored; the mechanism stays a reading.
  - (a) The latch is taken at the order tick, equal by value to (-sin, -cos) of the yaw then: (B), not (B′).
  - (b) Branch A fired at `+0x510` = 2029, rewriting `+0x4e8/+0x4f4` while `+0x515` stayed 1.
  - (c) The speed test reads the commanded `+0x38/+0x40` (D:L413963-413965, D:L416515-416520), not the realised
    displacement.
  - (d) Every "bit 2 never set" is replaced: set in the room, clear beyond the door, and fenced online.
  - (e) The goal cells. Cases 10 and 11 are reproduced by hand in s5, on an inferred cell and the loop cut.
- **The air reading, folded** (the controller's request, 2026-11-15). `FOLLOW_LEADER_VELOCITY_AIR_READING`: in the
  air, `FUN_0054d9a0` sets `+0x64` x/z to the carried velocity (D:L416523-416527), so the leader's `+0x38` there is
  his take-off or walk-off velocity. A row is added to s10, along with the open item on the hostage's own
  `bodyVelocity` (s7, note only).
- **Review 1 of the latch + velocity fix: PASS WITH FINDINGS** (a fresh read-only reviewer, at `agent/wm-hostage-open`
  54edab8ab2; record on `agent/wm-hostage-records`, `review-records/task1-latch-velocity-review-1.md`). The latch, the
  clear, the two velocity copies and the air arm held at the source. Seven non-blocking findings and one note, folded
  here (text and tests only, no behaviour):
  1. The pre-wall velocity also feeds the follower's `leaderSpeed` and the actor probes and yield, each `+0x38` in the
     original; stated in s10 and in `room.ts`'s comment; no test covers them.
  2. The open-door test orders from the route's way[1], not the rig's spot; its header says so, and `headingAtOrder`
     stays reported only.
  3. The test header's level for R1/R2 is now "relayed rig measurement, n = 2, not harness-scored".
  4. F1's doc comment describes the state after the fix.
  5. The strictness case uses an exact velocity (20, 0, 20) along its facing (yaw 225).
  6. The two new constants moved after their neighbours' declarations, so no JSDoc is split.
  7. s10 names both files that hold the names.
  8. (note) When the heading updates: an open item in s7.
- **The rig's F-2 (match-q27, run F2e, r0004, MP71), folded** (relayed by shadow-relay-1 at 11:08Z, 2026-11-15, file
  `RELAY1-q27-F2-second-follower-G1-global-1108Z`). Supporting measurement, one run, not harness-scored. The leader
  stood between two hostages and ordered each, aiming at its body; the second order came 7.2 s of clock (the relay's
  word) after the first.
  - (a) Slots: the first follower (2,2), `+0x70` = 0, in all 4694 rows. The second (3,-2), `+0x70` = 1, "in every row but
    its first three (3960 rows)", in the relay's words; those three read (2,2), 0. This supports the re-slot running after the order (s4.1).
  - (b) The latch holds across the second order. The leader's `+0x4e8` was (0.0986, 0, 0.9951), latched at the first
    order (yaw 185.5). With him in cell (216,82), the goals read (218,80) and (214,80): one each side, two rows back.
  - (c) Branch A: after a walk east of more than 2 s, `+0x4e8` switched to the walk's direction (0.9997, 0, -0.0245),
    consistent with `FOLLOW_BRANCH_A_READING` (the relay gives the duration, not the speed
    or the alignment the reading also needs). With him in (218,83), the goals read (217,84) and (216,81).
  - (d) A set-up artefact: after the walk back west, with him in (217,83), the second goal read (125,147). That is a
    cell beside the leader's spawn (125,148), the oldest entry of a trail the rig's placement carried from the spawn.
    It shows the goal can index the trail's oldest point. It is not a game case, and nothing is built from it.
  - (e) Not explained: where they stood. The first rested 20.1 u from him after the orders. The second walked away to
    about (2101.7, 736.6), 44.6 u off, and stayed there. After the walks the first ended 53.9 u off. The halts do not
    match the formation the goal cells suggest. That is open, and the port is not changed on it. (s7.1's state 8 and
    rear step are candidates for these rests too; not checked against F-2's rows.)
- **The arrival reading (s7.1), added** (the main controller's request, 2026-11-15; one reader). It covers the arrival
  test, what the arrival bytes mark, state 4's rear step and its host-local gate, and the hold. It is set against the
  rig's halts. `FOLLOW_ARRIVAL_POINT_READING` stays open for the halts beyond 18.75 u. Nothing is built on it.
- **Source review of s7.1 (at `cac4cc644c`): PASS WITH FINDINGS**, confidence high (a fresh reviewer, relayed by the
  coordinator, 2026-11-15). Every D:L citation was confirmed, and C5's octants were re-derived. Its six findings are
  folded here:
  1. The port is cited by symbol at `agent/wm-hostage-heading@cac4cc644c`, not by line number, because line numbers
     differ between branches.
  2. That `+0x2c` means a host-local human is given research 189's level, BELIEVED. "The rear step applies in these
     runs" is hedged to match.
  3. The halts beyond 18.75 u are worded as candidates for state 8, in the port paragraph too.
  4. `+0x7c`'s two exceptions are added. State 4 sets it only past the `+0x2c` gate; otherwise that tick reads 0/0.
     State 5 clears it and cancels the move when `piVar24[0xcb]` is nonzero (D:L509058-509061).
  5. The 0/0 run's length depends on how long the planner takes (the state-0 tick and every state-2 tick, the failing
     one included). It is no longer "a frame or two".
  6. State 3 with no live route enters 4 on any arrival (D:L508954-508956). `FUN_005fc7d0`'s restart applies in
     states 4 to 7, state 5 during a rear step included.
- The note remains reading, pending review of this fold and of s7.1.

## 10. Placeholders and readings

The names the port's code holds for this note (`packages/match/src/extraction.ts` and
`packages/match/src/hostageFollow.ts`); the others of s7 are note only.

| name | what it holds | status |
|---|---|---|
| `HOSTAGE_DEATH_RELEASE_PLACEHOLDER` | a dead hostage counts as no follower, so its leader's heading latch releases (the port's `led` filter on `alive`) | open: settled by a citation that a hostage's death takes 1 off the leader's `+0x520` (FUN_005fcf10 D:L509489-509501), or a rig read of `+0x520` across a following hostage's death |
| `FOLLOW_LEADER_VELOCITY_AIR_READING` | airborne, the leader's `+0x38` x/z (what the run test reads) is the carried velocity `+0x1350/+0x1358`, the take-off or walk-off velocity cut only by walls, not the clip's (`FUN_0054d9a0` D:L416523-416527; D:L466972-466974; D:L413963-413965). The port feeds the walker's pre-wall velocity and, while airborne (pre-wall null), falls back to its post-wall `w.vx/w.vz` | reading, pending review. The fallback matches where the walker's airborne `w.vx/w.vz` is its carried velocity (`mover.ts` `carried`, set at take-off and cut at walls). It differs at most by one tick's wall cut, because the original's `+0x38` is the carried value as of the tick's start. That the walker's airborne `w.vx/w.vz` equals `carried` on every tick was not checked here |

The pre-wall velocity reaches more than the run test. The room's `bodies` (`packages/match/src/room.ts`, the
`velocity` entry) is the leader's velocity everywhere the followers read one, so since the fix (54edab8ab2) it also
feeds:
- the follower's `leaderSpeed` (`hostageFollow.ts`): the arrival test `leaderSpeed < 10`, `followThrottle`, and the
  fallback goal. The original reads the leader's `+0x38` there (`FUN_005fb1c0` D:L508611-508613, then `+0xbc` at
  D:L508618);
- the actor probes (`extraction.ts` `probeActors`: the actor "moving" test, and the mode-3 moving actor) and the
  yield's dot. The original reads `+0x38` there too (D:L512276-512277, `FUN_0050e3d0(..., +0x38)`; the yield
  D:L512085-512088).

A leader running into a wall read about 0 before the fix (the follower took the arrival; the SEAL was a still actor to
the probe and the yield) and reads about 65 now (neither). Each of these reads `+0x38` in the original, so the change
moves them toward it. No test covers these effects: worth a LATER row (a follower and a probe beside a leader held
against a wall); not built in this task.
