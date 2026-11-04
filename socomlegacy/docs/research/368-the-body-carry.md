# 368 -- PICKUP BODY / DROP BODY: the original's body carry, read

Written 2026-10-26 by the gameplay seat (bf), LATER 494's reading-only half (the main controller's dispatch; the number
reserved by the merge controller). **Confidence: reading, pending review -- source inspection of the decompilation, nothing
run, nothing captured. No port.** Sources: `socom2_game.elf.decomp.c` (cited `D:L<line>`), its strings file (cited
`S:<addr>`), and a few constants read from the disc ELF's file image (cited `ELF:<addr>`). The read was made by a research
agent briefed from this seat; the seat re-read at the source the points that correct earlier text (§0.1) and the gates the
row turns on (D:L438367-438371, D:L463119, D:L452342, D:L445224-445229). Where a field's meaning is a guess it says so.

## 0. Vocabulary

- **The pair link, actor `+0xeac`** (also `[0x3ab]` on an `int*`). It is **not body-only**: the same field links the two
  actors of a knife stab ("Stab" / "Stabbed", `FUN_00578f90` D:L437969-438047), a restraint ("Apply restraints" /
  "Receive restraints", `FUN_005784a0` D:L437735-437736, `FUN_00578990` D:L437866-437966) and the carry. Both sides point
  at each other (`FUN_00579a30` D:L438447-438448; `FUN_00579720` D:L438289, D:L438327). The posture word marks the carry.
- **The posture word `+0x174`** (`FUN_0058a720` D:L446830-446870 returns it): 0 stand, 1 crouch, 2 prone, 8 dead or
  dying, **9 carrying ("Buddycarry")**, **10 carried ("Buddycarried")**. It follows the posture byte `+0x2b` of the clip
  record on top of the actor's stack (`FUN_00588bc0`'s third argument; `FUN_005870e0` D:L445110-445143). The movement
  dispatch `FUN_005870e0` sends posture 9 to `FUN_00583e70` and 10 to `FUN_00583af0` (D:L445224-445229).
- **The alive bit, `+0xe1` bit 4.** Clear is dead (`FUN_005a2690` D:L459889-459894; `FUN_00589aa0` D:L446513).
- **The network flag `DAT_0045a0c1`**: online (research 107, `IsNetwork`).
- **Clip ids.** `FUN_00577e40(actor, id)` (D:L437398-437411) tests the actor's animation type `+0x534`; the type names
  at `ELF:0x661060`: **0x11 "Stand -> Crouch", 0x12 "Crouch", 0x13 "Crouch -> Prone"** (0x19 "Stand -> Prone", 0x1a
  "Prone", 0x02 "Walk"). The carry's named clips, looked up at start-up (D:L495316-495328; S:661e20-661f70): "Buddycarry
  stand", "Buddycarried stand", "Buddycarry body", "Buddycarry walk", "Buddycarried walk", "Buddycarry pickup",
  "Buddycarried pickup", "Buddycarry step", "Buddycarried step", and pistol variants of the carrier's; `FUN_005e0690`
  pairs each rifle clip with its pistol one (D:L494783-494786) -- when the pistol one plays is unread.
- **Clip records.** `FUN_00588bc0(actor, clip, posture, reverse, ...)` pushes a clip (D:L446055); a non-zero fourth
  argument plays it **backwards** (`FUN_0028c160` negates the rate). A record's callback `+0x64` (argument `+0x68`) fires
  when the clip time crosses `+0x60` (`FUN_0028c7c0`, called in `FUN_0057a330` D:L438997-439005).
- **The align block** on the top record, `+0x6c..+0xb0`, active while `+0x78` is set: written by `FUN_005b1750`
  (D:L467778-467810), stepped by `FUN_005b2d20` (D:L468521-468757), consumed in `FUN_0057a330` (D:L439018-439089).

### 0.1 Corrections to earlier text (re-read at the source)

- **Was:** "`FUN_00579a30` takes it within 8 (its own 64 squared, D:L438367-438371)" (LATER 494's row; research 87's
  `STANCE_WORD_ACTION_CROUCH_READING` row; `mover.ts`'s note). **Read now:** the 64-squared test is on the SEAL's own
  `+0x2c..+0x34` (`param_1`, the actor: its velocity, research 215's reading of `actor+0x2c`), not a distance to the body
  -- the SEAL must be (nearly) still, speed at most 8. The distance test is `FUN_005a89c0`'s: a squared distance of at most **300**
  (about 17.3 units) between the SEAL and the body (D:L463107-463121; the test at D:L463119).
- **Was:** `+0xeac` read as "the carried body". **Read now:** the pair link of the stab, the restraint and the carry
  alike (§0); the carry is posture 9 / 10.

## 1. The pickup

### 1.1 The offer
- The nearest-actor scan `FUN_005940d0` (D:L452625-452693) walks the SEAL's neighbour list; the distance field `[4]` at
  most `DAT_00650680` = 900.0 (`ELF:0x650680`; whether squared is unread -- if so, 30 units). An entry is skipped when its
  controller's object (slot 0x38) has `+0x265` bit 0 or 1, or online when `FUN_002c2fd0` answers (D:L452672-452674). A
  dead actor whose `+0xfb0` is not 6 and `+0xfd1` is 0 becomes the nearest-body slot `+0x168` (D:L452681-452684);
  `+0xfb0` and `+0xfd1` are unread.
- **Offline only.** `FUN_005937c0` offers action 8 (**PICKUP BODY**) under `DAT_0045a0c1 == 0` (D:L452342) when
  `FUN_005a89c0(SEAL, +0x168)` agrees (D:L452372-452374); online the slot offers action 0x15 (VICTORY DANCE) through
  `FUN_0057ddf0` instead (D:L452376-452378).
- The labels (`FUN_0021ded0`): index 8 "PICKUP BODY" (D:L73681), 9 "DROP BODY" (D:L73691); the action word `+0xed4` is
  `1 << index` (`FUN_00544c80` D:L411185-411189). (LATER 494's "record 9 / 10" counts the same records from 1.)
- `FUN_005a89c0` (D:L463050-463145) refuses, in order, when: the target is null, **alive**, or already carrying or
  carried (D:L463068-463071); the target is restrained (`+0x105d` bit 0) or on the "Restrained anim set" (D:L463074);
  the SEAL is not alive, has `+0x1060` bit 4 (unread), or is on the launcher or turret anim set (D:L463076-463085); the
  target's node has `+0x5c` bit 0 clear or `+0x9c` below 1.0 (D:L463087-463090) -- `+0x9c` read from its use as the node's
  fade (`FUN_0056ee80` runs it down at 0.75 a second, D:L432660-432670), so a body that has begun to fade cannot be taken;
  `FUN_005b9990` on the SEAL's inventory `+0x5e0` answers (unread, D:L463092-463093); the SEAL's posture or top record's
  posture byte is 3 (unread, D:L463094-463097), 9 or 10 (D:L463098-463100), or the SEAL is linked (D:L463101); the SEAL is
  prone or going prone (`FUN_0058a720(SEAL, 1)` = 2, D:L463102-463105); the square of the distance from the SEAL's
  position `+0x1c` (plus `+0x14b0` when non-zero) to the target's is over **300** (D:L463107-463121).

### 1.2 The press
- `FUN_00592d50`, bit 0x100 -> `FUN_00546c00(SEAL, +0x168)` (D:L452069, D:L452147-452150) -> `FUN_00579a30` when the
  target is non-null (D:L412445-412452).

### 1.3 `FUN_00579a30` (D:L438337-438459)
- **Test:** target non-null and the SEAL's velocity square at most **64** (D:L438367-438371; §0.1). `FUN_00579da0` zeroes
  that velocity before it calls the pickup again (D:L438485-438490). The stab and the restraint use 100
  (D:L437890-437897, D:L437991-437996).
- **The align target:** the body's node position (`FUN_003085c0`, D:L438373-438375) and a horizontal direction from one of
  its bones (made horizontal, normalised, negated, rotated by the node matrix, D:L438379-438409). `FUN_005b1750(SEAL,
  ELF:0x65d008, point, dir)` (D:L438449) writes the align block: the offset at `0x65d008` = (5.27, -4.22, -3.26) (set at
  start-up, `FUN_00668940` D:L565228-565230), the point, the negated direction (D:L467787-467806). The offset's frame
  (body-local or world) is not settled.
- **Stance, three branches** (D:L438410-438445): clip 0x12 "Crouch" current -> callback `LAB_00579e90` at 3.0
  (D:L438441-438445); clip 0x11 or 0x13 current with the top posture byte 1 -> `FUN_00579da0` at 0.99 if crouched, else
  `LAB_00579e90` at 0.99 (D:L438427-438439); otherwise (standing) the stance request `+0x374` = 1, `+0x105f` bit 0,
  `FUN_00581990` (the crouch, D:L442526-442560), and `LAB_00579e90` at 0.99 on the pushed record (D:L438415-438425). The
  thresholds' unit (clip seconds or normalised) is unread. `LAB_00579e90` is a tail jump to **`FUN_00579720`**
  (`ELF:0x579e90`). `FUN_00579da0` (D:L438466-438492) pops the SEAL's stack to two records, sets `+0x375` = 2 and calls
  the pickup again, which then takes the "already crouched" branch.
- **Set at once** (D:L438446-438457): both links; the align block; the SEAL's controller `+0x171` bit 2 (unread); the
  body's controller object `+0x264` bit 5 -- which exempts a dead body from `FUN_0056ee80`'s fade and removal (D:L432643):
  **a body once picked up never fades** (reading; that slot 0x38's object is the one the fade runs on is likely, not
  proven).

### 1.4 The walk-in, each frame (`FUN_0057a330` D:L439018-439089, `FUN_005b2d20`)
- The SEAL is steered to the align point: turn at most 4.712389 rad/s (270°/s, D:L468665-468670), velocity per axis at
  most 30 (D:L468731-468749), a step count `+0x88` (D:L468753).
- Over **30** away -> the align cleared and both links cut: the pickup aborts (D:L439025-439038). Under **46** steps,
  facing dot over **0.993** and under **1.0** away -> the record's callback (the lift) when one is set, and the align
  cleared only when none is (D:L439041-439054); outside that band nothing happens and the walk-in goes on
  (D:L439039-439063); at 46 steps it completes regardless (D:L439064-439087).
- While aligning: the SEAL's velocity zeroed (D:L439092-439103); standing locomotion at rate 0.25 ignoring the stick
  (`FUN_00586570` D:L444816-444827); the move inputs zeroed (`FUN_00551ec0` D:L418654-418658); stance changes refused
  (`FUN_00552ec0` D:L418930).
- A cancel by the stick (`FUN_00550ef0` D:L418180-418200, clip 0x11 interrupted) looks unreachable for the carry, since
  `FUN_00587c20` refuses to interrupt 0x11 while linked (D:L445533). Not settled.

### 1.5 The lift, `FUN_00579720` (D:L438257-438331)
- The body: its stack popped, "Buddycarried stand" and "Buddycarried pickup" pushed, posture 10 (D:L438269-438288); its
  node's `+0x42` bit 0 and its `+0x304` object's cleared (unread; likely collision off) (D:L438290-438292); **its scene node
  parented to the SEAL's** (D:L438293-438295); its position the SEAL's (D:L438296-438300).
- The SEAL: the align cleared, "Buddycarry stand" and "Buddycarry pickup" pushed, posture 9 (D:L438302-438328); the view
  mode `+0x200` forced to 0 (third person, unzoomed; `FUN_005448a0`) (D:L438329). When the pickup clip ends
  `FUN_00582540` pops it (D:L443074-443099), leaving "Buddycarry stand".

## 2. Carried

### 2.1 The pose
- The body's node is a child of the SEAL's; each frame `FUN_005506a0` sets its position to the SEAL's and copies the
  SEAL's `+0x50..+0x5c` (orientation, a guess) (D:L417828-417860). The shoulder placement is the "Buddycarried *" clips'
  data, their time copied from the SEAL's top record each frame (`FUN_0057a330` D:L438903-438908): the pose is the disc's
  animation set, not a code offset.
- The body skips its own motion (D:L439107-439109), gravity and ground probes (`FUN_0054aa30` D:L415034-415036,
  D:L415243-415244, D:L416051) and the ground-height update (`FUN_005483d0` D:L413943-413946). It reads the carrier's
  controller for its inputs (`FUN_00551ec0` D:L418528-418530), so `FUN_00583af0` (D:L443548-443638) plays the carried
  walk, step or stand in step.

### 2.2 The SEAL while carrying (`FUN_00583e70` D:L443642-443718)
- **Walk or turn only:** a forward input -> "Buddycarry walk" at the input times the clip's rate (D:L443660-443690); else a
  turn past 0.025 -> "Buddycarry step" and the turn `FUN_00583960` (D:L443691-443711); else stand. The speed is the walk
  clip's root motion. No run, strafe or backwards clip for posture 9 (D:L445224-445229).
- **Collision:** a second sweep at a point on the body (`FUN_0054aa30` D:L415539-415549, `FUN_0054e760`
  D:L416808-416850: moving, the midpoint of two bones raised 1.6; else one bone lowered 2.5), the move refused on a hit.
  The pair skip each other in the push-apart (`FUN_0054f7e0` D:L417480); the carrier's zone bits go to the body
  (`FUN_00550570` D:L417788-417793).
- **Refused:** every other context action (posture 9 offers only DROP BODY, `FUN_00593500` D:L452269-452275); fire and
  weapon use (`FUN_005a7de0` D:L462612, D:L462675, D:L462682; `FUN_005c0ae0` D:L476442-476445); stance changes
  (`FUN_00552ec0` D:L418936-418990); jump (`FUN_0057e1b0` D:L440806-440808); dive (`FUN_00584b00` D:L443989); the action
  gate's requests (`FUN_005b4340` D:L469340, D:L469409: knife, rifle butt, restrain); USE TURRET (`FUN_00546210`
  D:L412071, `FUN_005463c0` D:L412164, `FUN_005a88c0` D:L463012); hand signals (`FUN_00600290` D:L511034); a hit's
  flinch (`FUN_005a2690` D:L459896-459901).
- The camera's line test hides the carried body for its query (`FUN_0029bf70` D:L143376-143383, D:L143654;
  `FUN_0029cbb0` D:L143678-143698). A moving object's sweep pads a carrier 12, not 8 (`FUN_003acc10` D:L302800-302811).

## 3. The drop

- **DROP BODY** (offered in posture 9 with neither pickup clip on top, `FUN_00593500` D:L452269-452275; bit 0x200 ->
  `FUN_005794d0`, D:L452143-452146). `FUN_005794d0` (D:L438183-438251) pushes, **reversed**, the body's "Buddycarried
  pickup" (over "Buddycarry body" at posture 8) and the SEAL's "Buddycarry pickup" (over "Crouch"): **the drop is the
  pickup played backwards**. At its start `FUN_00582540` calls `FUN_00579220(body)` (D:L443074-443096) and the SEAL is left
  crouched.
- **The placement,** `FUN_00579220` (D:L438050-438178): the body put where its root bone ended (the bone's world offset,
  its vertical part dropped, D:L438078-438104), unparented (D:L438123-438125), on the carrier's heading
  (D:L438126-438131), both links cleared (D:L438173-438176). No ground probe here; whether it snaps afterwards is unread.
  It is the stab's and the restraint's release too (D:L443100-443128).
- **The carrier's death:** `FUN_005a2690` -> `FUN_0057ee00` (D:L459896-459905, D:L441131-441186): the body placed, "Fall
  forward" from 0.5 at posture 8, a fall target 7 units along the body's x axis; then `FUN_005af930` (D:L466868-466875; *was* cited as `FUN_005af590`, which ends about D:L466726) pushes a posture-8 clip after `FUN_0057ee00` when the posture is 9 and a flag bit at `+0xe1` is clear (dead, by inference) -- the "airborne" condition and the clip (`DAT_003deee8`) unread.
- **Separation** over 30 (square 900) with no align active: placed and both stances reset, or the link cut
  (`FUN_00551ec0` D:L418534-418604). **An anim-set change** (`FUN_0058c350` D:L447957-447985). **The align's abort**
  (§1.4). **The actor destroyed or reset** (`FUN_005533e0` D:L419096-419099, `FUN_00553ea0` D:L419712).
- **Not found:** a drop on a stance change (refused instead), water, ladders, round or mission end.

## 4. Other effects

- **HUD:** PICKUP BODY / DROP BODY (indices 8, 9); the icon `action_conceal_body.tif` (S:3e4d30) is probably the carry's
  (not traced).
- **Network:** offline only (D:L452342); no wire message for the carry in the functions read.
- **Hits on the carried body:** none taken (`FUN_005a2690` D:L459925-459927).
- **AI, sounds:** nothing carry-specific read; no sound call in the five functions above (any would be the clips').

## 5. The `+0xeac` users

51 direct `+ 0xeac)` sites and the `[0x3ab]` form; the player-relevant ones are cited in §1-§3. Not the carry's: four
functions on another struct with a field at the same offset (`FUN_001fc700` D:L58063, `FUN_0023cd20` D:L87758,
`FUN_0023d610` D:L88041, `FUN_0023d860` D:L88206); the stab and restraint (`FUN_005784a0`, `FUN_00578990`,
`FUN_00578f90`); the AI flag `+0xe0` bit 7 forced off when linked (`FUN_0056de10` D:L432605-432607, unread);
`FUN_00594cf0`'s zoom write while linked (D:L453318, D:L453326; probably not the carry, `FUN_005a8da0` refusing posture 9).

## 6. Open questions, and what would settle them

1. The units of the speed gate (8) and the 300 and 900 distances. A PCSX2 trace of `+0x2c` and the positions.
2. The align offset's frame (5.27, -4.22, -3.26). `FUN_005b3340` and the rest of `FUN_005b2d20`; a capture from several
   angles.
3. The callbacks' thresholds 0.99 and 3.0: normalised or seconds. `FUN_0028c7c0` in full and a clip's length.
4. The carry's walk speed: the "Buddycarry walk" clip's root motion (the disc's animation set) or a capture.
5. When the pistol variants play (`FUN_005e0690`), and whether the carrier's weapon shows.
6. Unread fields in the gates: `+0xfb0`, `+0xfd1`, `+0x1060` bit 4, `+0x265` bits 0-1, `+0x171` bit 2, `+0x400..+0x420`.
7. Whether a dropped body snaps to the ground; a drop on stairs or a ledge. A capture.
8. Round or mission end, water and ladders while carrying. A capture or the mission teardown's reading.
9. The AI's reaction to a carried or moved body; `+0x264` bit 5 beyond the fade.
10. No carry online in any mode (the HUD gate reads offline only).
11. Whether the 0x11-interrupt cut (`FUN_00550ef0` against `FUN_00587c20`) is reachable.

A PCSX2 trace or capture of a pickup, the carried walk and a drop (one on stairs) would settle most of them. Nothing here
is ported; the port's row is LATER 494.
