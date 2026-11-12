# 399 -- The airborne floor probe: once a game frame at the move's end, a miss puts x/z back (MP51's parapet)

- Date: 2026-11-10. Task AIR-PROBE (the controller's brief, from a player report the owner confirmed in the browser).
  Branch `agent/air-probe` (base `agent/mega` 1da70bdac).
- Track: **simulation**. It changes when and where the airborne tick probes the floor on the segment path, and what a
  probe with no candidate does (`packages/viewer/src/mover.ts`, `Walker.fall`; `AIR_FLOOR_PROBE_READING`).
- Status: **reading, pending review**. Nothing here is measured running: no capture of the original was taken for it.
  A reviewer who did not write this re-reads every `D:L` below before it counts as a reading.
- Sources: the decompilation of the r0001 game ELF, `socom2_game.elf.decomp.c` (cited `FUN_<addr>` / `D:L<line>`; this
  note's author re-read D:L413914-413956, D:L417760-417775, D:L417815-417830, D:L432310-432315, D:L410533-410537,
  D:L456352-456366, D:L467037-467110 and D:L467195-467260 for it, and at the review's fold D:L413940-413947,
  D:L415236-415242 and D:L467199-467222). The review (PASS WITH FINDINGS, 2026-11-10) read `FUN_0057e770`
  D:L440990-441080 (the knock writes no `+0x400`) and r0004 0x332d70; its findings F2-F6 are folded into s2, s3 and s6. The r0004 addresses (byte 0x40a390, the twin at r4
  0x5b6200 and its flag and put-back words) are the controller's brief's, from a fresh read of the r0004 image; this
  note's author did not re-read them. Related notes: research 86 s6.3 (where the per-sub-step refusal came from;
  superseded for this case, its pointer says so), research 217 s2.10, research 230 (s3, the `+0x404` writer and the
  altitude), research 366 (lines 194-196 describe the miss branch that never runs). No decompiled text is pasted.

## 1. The report and the cause in the port

**The report** (a player, 2026-11-10; the owner reproduced it in the browser): on MP51 Vigilance a running jump over the
low parapet by the turret platform -- `worldmodel/wc09/di_wall_wc09`, its inner face at z ~592.4 near x 470, its top
~8.8 over the platform's floor at y ~116.3 -- freezes against the face: the body hangs there while its feet rise ~2.6
over the parapet's top, then drops back onto the platform.

**The cause** (port-side, a headless run of the port's own `Walker`): a strip ~0.8 wide at the parapet's foot (x 470:
z 592.4-593.2) has no floor polygon at all; only the leaning face covers it. The segment path's airborne tick
(`Walker.fall`) split each 60 Hz tick's resolved move into `ceil(distance / MAX_SUBSTEP)` sub-steps (`MAX_SUBSTEP` 1: a
running jump's ~1.08 a tick became two ~0.54 steps) and `airStep` refused each sub-step whose column had no floor
(`selectFloor(probeGround(...)) === null`). A strip wider than a sub-step always takes one probe, so the step was
refused every tick and the body stayed at the face for the whole flight. `MAX_SUBSTEP` has no source in the original:
it exists for the disc arm, so a wall 3.5 away is not stepped through (research 359), and is left as it is.

## 2. What the original does (reading, pending review)

1. **One probe a game frame, at the end of the frame's whole displacement.** `FUN_005506a0` calls the solve
   `FUN_005483d0` once and then queues one probe with `FUN_005b0840` (D:L417822-417826). The solve takes the new position
   in one add: `+0xf54` = the node translation + the frame's displacement `+0xf44` (`FUN_00309240`, D:L413918).
   `+0xf44` is the velocity times dt, written once (`FUN_0054d9a0` D:L416501-416530). `FUN_005b0840` takes `+0xf54` as
   the probe's origin (D:L467198-467290); `FUN_00550570` reads the one result in `FUN_005b0420` (D:L417768-417771). There
   are no sub-steps. The origin's y is `+0xf58` after the frame's step, raised to at least `DAT_0066aab8`
   (D:L467218-467220; `DAT_0066aab8` is written from the matrix's y at D:L417824).
   **The probe is gated** (review F4): `FUN_005b0840` writes `+0x2cc` = -999 first (D:L467199) and queues the probe only
   when bit 0 of `+0xe1` is set or the controller's vtable `+0x2c` answers (D:L467203-467213); otherwise there is no
   probe that frame and so no put-back. The bit is set by `FUN_0054aa30` (D:L415240), probably on every moving frame, but
   that is not established: "one probe a game frame" is an upper bound (s6).
2. **No airborne exception.** `FUN_005b0420` skips the probe only when bit 0x8 of `+0x1061` is set (D:L467052), and that
   bit is set only by `FUN_0056de10` (D:L432313); airborne is bit 0x20 (D:L410535).
3. **A miss puts the node back at the last hit, its y included.** With no candidate and `DAT_003df1c8` = 1 (r0001
   0x3df1c8; r0004 byte 0x40a390, both images, per the brief), `FUN_005b0420` takes its else branch (D:L467091-467103):
   the node's translation -- x, y and z -- goes back to the last hit `+0x400..+0x408` (`FUN_003157d0` with `+0x400`,
   `+0x404`, `+0x408`, D:L467091-467102; r0004 0x332d70, per the review), the previous successful probe's point, and the slide speeds
   `+0x1340` and `+0x111c` are zeroed. The same branch clears bit 0x2 of `+0x1061`, sets bit 0x4, and calls the actor's
   vtable `+0x10` and, when the controller's vtable `+0x38` answers an object, `FUN_005582c0` on it. r0004's twin is at
   r4 0x5b6200 (the flag read at 0x5b63d0-0x5b63d8, the put-back at 0x5b6420-0x5b6480; the brief's reading, not re-read
   here).
4. **The height carries on only through the next solve.** The node's y is put back with x/z (3), but the next solve
   writes the body's y from the altitude `+0x2e4` (`FUN_0059afd0` returns it, D:L456356-456364; `FUN_005483d0` writes it,
   D:L413943-413954), which the miss branch does not write -- and that write is taken only when the state word
   (`+0x174`) is not 10 or `FUN_00577e40(.., DAT_003dee80)` answers (D:L413944-413946; research 230 s3). So, in the
   states that take it, the frames' rise or fall goes on from where the put-back left x/z. What reads the node's y
   between the miss and the next solve is not read (s6).

## 3. The port's change

`AIR_FLOOR_PROBE_READING` `'frame-end'` (built), in `Walker.fall`'s segment branch:
- the tick's resolved move (`resolveSegments` has met the walls already) is taken whole;
- on a tick that ends a game frame (`airClock.advance(dt)` > 0) the floor is probed once at the move's end, with the
  sub-step's own pick (`selectFloor(probeGround(grid, x, z), feet + probeLift, feet)`, the feet as the tick found them);
- a hit is recorded as the last hit (`airHit`); a miss puts x/z back at it and zeroes the slide speed (`stopSlide`, the
  port's `+0x1340`; `+0x111c` has no counterpart in the port); the height path is untouched (`AIR_HEIGHT_READING`).
- The last hit at the take-off is the take-off point (`takeOff`, `knock`): on the floor the body's x/z moves to a column
  only when the ground pick hits there (`groundEndpoint`), so the take-off point is the last ground probe's hit.
- `'sub-step'` keeps the base's rule, selectable as the file's other readings are. The disc arm (`WALL_BODY_READING`
  'disc', `airWalls`) and a ground tick's sub-steps after it takes off (`move` -> `airStep`) are untouched.
- The room runs the same `Walker` (`packages/match/src/room.ts` builds `new Walker(this.map.grid)`), so the room
  changes with the page and has no change of its own.
- The last hit is not written by a knock in the air: the original's knock writes no `+0x400` (`FUN_0057e770`
  D:L440990-441080, the review's reading), so `knock` sets it only when it lifts the body off the floor (review F2).
- **A port deviation of the 60 Hz tick** (review F5): the port's tick is 60 Hz and the original's frame 30 Hz, so a
  frame's move is taken over its two ticks, unprobed on the first. The in-between tick leaves the body part-way along
  the frame's move, and it can stand over a floorless column for that tick before the frame's end puts it back. That
  x/z is simulation state, not drawing: the next tick's walls, the landing pick, a knock, the traversal offers and the
  room's snapshots read it. It is not MISSION R8's interpolation (the height's `drawCurY` is drawing only); it is a
  deviation of the port's tick against the game's frame, and not a behaviour of the original.
- **A second port deviation: a knock in the air restarts the frame clock** (re-review finding 1; it predates this
  task). `knock` resets `airClock` (mover.ts, beside the last-hit line), so a knock on an in-between tick puts the next
  probe three ticks on instead of one: up to 1.5 game frames with no probe, over which the body can cross or stand over
  a floorless column longer than the original's 30 Hz frame, which a knock does not restart, allows. Not changed here.

## 4. The evidence, kept apart

- **Source inspection** (this note's author): the `D:L` ranges in the header. Reading, pending review.
- **A headless audit of the port** (scratch scripts, not in the tree; their output outside it): every MP map scanned for
  floorless strips at the foot of a wall 2.5-40 high, and the widest strips jump-tested over 22 run-ups each on the
  base. MP51's parapet: strips 0.3-0.8 wide, freezing 61-100 % of run-ups at x 472.8, 474.8 and 517.2. MP62 Enowapi
  (1726, 227, 1915): 0.7-0.9 wide, 22 of 22 run-ups freeze. MP52 The Mixer (2437, 75, 2131): 0.9 wide, 22 of 22
  freezing, but the feet peak only at the parapet's top (marginal). The other maps' tested strips do not freeze.
- **The owner's browser run** of an uncommitted experiment of this change (reported in the brief): the parapet cleared.
  Not a capture, and not this commit.
- **No capture** of the original exists for this case.
- **Unit tests** (`packages/viewer/test/airFloorProbe.test.ts`): a synthetic strip 0.8 wide (no game data) and dev-disc
  MP51 cases (skipped without `SOCOM_DISC`). They hold the transcription, not the original.

## 5. The prediction

A running jump moves ~2.17 a game frame (65 x 525/15734). A strip 0.8 wide is crossed whenever no frame's end lands
in it -- on most approaches. On ~0.8 / 2.17 of approaches (about 37 %) one does, and that frame is put back to the
previous frame's probe point. The next frame repeats the same move from the same point, unless the walls cut it
differently at the new height. So the reading predicts that on those approaches the body is held at the put-back point
and comes down on the platform. The original's player would then see a refused jump on about one approach in three,
and a cleared one otherwise. The capture of s7 tests this.

## 6. The unknowns, and what settles each

- **The probe's origin: its column and its y** (review F6). The original probes at `+0xf54..+0xf5c` after the frame's
  step plus the root node's offset turned by the body's matrix (`FUN_005b0840` D:L467215-467256), its y `+0xf58` raised
  to at least `DAT_0066aab8` (D:L467218-467220). The port probes at the body's own x/z, from the feet as the tick found
  them + `probeLift` -- the base's `airStep` had the same gap. The offset's size in a jump is not measured, and it moves
  the strip's effective place and width; the origin's y moves which floor the pick takes. `AIR_PROBE_COLUMN_PLACEHOLDER`.
  Settled by s7's `+0xf54..+0xf5c` and node translation beside `+0x400..+0x408`.
- **The probe's gate** (review F4). The probe runs only with bit 0 of `+0xe1` set or the controller's vtable `+0x2c`
  answering (D:L467203-467213); `FUN_0054aa30` sets the bit (D:L415240), probably on every moving frame. Whether an
  airborne frame can go unprobed (no probe, no put-back) is not established; the port probes every frame end. Settled
  by s7's `+0x2cc` per frame (-999 on an unprobed one). *note only*
- **What reads the node's y between the miss and the next solve** (review F3). The miss branch puts the node's y back to
  `+0x404` too; the next solve overwrites it from `+0x2e4` in the states that take that write (D:L413944-413946). What
  reads the node in between (the frame's later passes, the draw, the network's snapshot) and whether a state word of 10
  keeps the put-back y are not read. Settled by s7's node translation and `+0x2e4` on the frame after a put-back.
  *note only*
- **The miss branch's other writes.** These are bit 0x2 cleared and bit 0x4 set on `+0x1061` (research 86 s6.3: bit 1
  set and bit 2 clear let `FUN_0059ad30` put the feet on the floor), the vtable `+0x10` call, and `FUN_005582c0` on the
  controller's `+0x38` object. The port has no counterpart of those bits and does not model them. Whether they change
  the landing after a put-back is not read. Settled by s7's bits 0x2/0x4/0x20 per frame around a put-back. *note only*
- **The last hit at a let-go.** A climb's or a hang's let-go (`setAirborne`) takes the let-go point as the last hit;
  whether the original's `+0x400` follows the climb is research 230 s3's reading for the climb, not read for every
  let-go. *note only*
- **The held body.** Whether a put-back body is held until it falls back, as s5 predicts, depends on the walls' cut
  changing with the height. Settled by s7.

## 7. The capture owed

At the MP51 parapet: the feet at ~(470, 116.3, 576), running +z, the running jump pressed ~17 before the face. Use
several starts spaced across one 2.17 step (e.g. 0.2 apart), so that some frames end in the strip and some do not.
Record per guest frame:
- `+0xf54..+0xf5c` and the root node's translation;
- `+0xf44..+0xf4c`;
- `+0x2cc` (-999 on a frame with no probe);
- `+0x400..+0x408`;
- bits 0x2, 0x4 and 0x20 of `+0x1061`;
- `+0x2e4`;
- the carried velocity `+0x1350` / `+0x1358` (r0004 `+0x1354` / `+0x135c`).

It settles four things: the cadence (one probe a frame at `+0xf54`), the put-back (x/z equal to the previous frame's
`+0x400..+0x408` on a miss, the height carrying on), the column's offset, and the held body. It also says whether an
approach whose frame ends in the strip is refused, and how often.

## 8. Readings and placeholders

| Name | What it stands for | Built | What settles it |
|---|---|---|---|
| `AIR_FLOOR_PROBE_READING` | the airborne floor probe's cadence and miss rule on the segment path (s2) | `'frame-end'`: one probe a game frame at the move's end; a miss puts x/z back at the last hit, the height goes on (`'sub-step'`: the base's per-sub-step refusal) | s7's capture: x/z and `+0x400..+0x408` per frame through a put-back |
| `AIR_PROBE_COLUMN_PLACEHOLDER` | the probe's origin: the original's `+0xf54..+0xf5c` after the frame's step plus the root node's turned offset, its y raised to at least `DAT_0066aab8` (s6) | `'feet'`: the body's own x/z, from the feet as the tick found them + `probeLift` | s7's `+0xf54..+0xf5c` and node translation beside the probe's hit |

## 9. The push-back players also report (measured after the fix; no change made)

The owner and the player also describe being "pushed back" at the parapet. It is not the floor probe. Headless, on
this branch, 2040 running jumps at MP51's parapet (x 400-565, run-ups 8-20, yaw +-12, four start offsets) gave 1226
runs with an airborne push over 1 unit in some tick. The push comes from `resolveSegments` in the air. A segment end
`d` behind a face moves the body out by `d` (the air term), then by `d - 1` more (the deep push). That is `2d - 1`
in one solve along the levelled normal: a side line 3.09 deep gave 5.15 measured across the ground (the normal's
level part, 0.99 of it). The runs are the scripts `_scratch_push.ts`, `_scratch_push2.ts` and `_scratch_cadence.ts` in
`agent-mail/evidence/air-probe/scripts/` (port-side, headless; the evidence folder's README).

- **Faithful per solve** (reading, pending review; a fresh read of the decompilation, 2026-11-10): `FUN_005483d0` applies both
  terms in the same airborne solve, from the same pre-correction record end (+0x10). The air term is at
  D:L413542-413556 (`dot < 0` at D:L413549). The depth is fabs, deepest kept, at D:L413571-413585, write-back at
  D:L413599. The deep push is D:L413602-413614. Neither term tests the airborne bit and neither reads dt: the air term
  is the jump and knock actions' branch (`bVar4`: `FUN_00587f50`, `FUN_00587f10`, `FUN_00588030`, D:L413471-413479,
  tested at D:L413542; on the ground the displacement loses its part along the normal instead), and the depth counts
  only while the controller's vtable +0x2c answers (D:L413571-413574); the deep push runs on the ground too. r0004's twin
  (0x54cf30; 0x54d514-0x54d910) is the same block. The port transcribes it in the same order.
- **What the port adds:** the original solves once a 30 Hz frame (`FUN_005506a0` D:L417822-417826); the port solves
  each 60 Hz tick on half a frame's move. Of the 1272 game frames with a push over 1, 1101 pushed on one tick only
  and 171 on both. The second ticks gave 432 of the 2508 units pushed, about 17%: the cadence's amplifier. The
  airborne records' ends also carry half a frame's displacement, so each `d` differs from the original's frame `d`
  (D:L415405, D:L415566).
- **Where it goes:** a faithful change would run the airborne solve once a game frame, on the frame's whole
  displacement, keeping `depth` 1 and `jamHits` 2. That is the airborne half of the owner's H404 (b) (the walls at
  30 Hz, built as W30), which the owner deferred as LATER 784 ("add the 30hz wall stuff as a later decide on option",
  2026-11-08). So it is listed there for his call and not built here. Its capture: a full-stick running jump square
  into MP51's parapet near feet (403, 116.5, 580), per frame `+0xf44` on entry (r4 0x54d514), at the write-back and
  after the push (0x54d910), the deepest depth, the records' start and end and hits, and `+0x1090..+0x10ac`.
