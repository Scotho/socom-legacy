# 217 -- The body as built: stance gates, probes, the peek, the bodies (web sprint 28)

- Date: 2026-10-05 (web sprint 28). PF-15 writes §1, §5 and §6; PF-16 (§2), PF-20 (§3, its §6 rows) and PF-21 (§4, its §6 rows) add theirs.
  PRONE-TILT (2026-10-31, the gameplay lane) adds §7, its §6 rows and a note in §2.5.
  SEGMENT-BODY (2026-11-02, the gameplay lane) adds §2.9 and its §6 rows, and resolves `WALL_DEEP_REVERT_READING`.
- Status: **reading, pending review.** Every value below is a read of the decompilation (`D:L<n>` of
  `socom2_game.elf.decomp.c` r0001) or of the disc through the port's own parsers; nothing here is a capture. Research
  180 grades several of these PROVEN or STRONG; under AGENTS.md a source read is a reading until reviewed (research 206).
- Sources: research [180](180-c2-movement-body-camera.md) §1.3, §1.5, §1.9, §4 item 2 and V1 §8.3 (the gates, the
  headroom's foot); [86](86-traversal.md) §7.2 (the port's names before this sprint); [79](79-weapon-table-and-fire-point.md)
  §3 (the M4's `firepoint`); [193](193-m2-mp-net-replication.md) (the controller's vtable +0x34 is `IsRemote`);
  [211](211-the-weapon-swap-by-state.md) §6, §7 C3, §9 and [206](206-verification-overrides-and-the-waves-close.md)
  §1.2-§1.3 (PF-39).
- Code: `packages/viewer/src/mover.ts` (`Walker.changeStance`, `stanceRefused`, `proneRefused`, `crouchRefused`,
  `headroom`), `packages/viewer/src/net/moverSim.ts` (the dive's comment); the shared gate table
  `packages/viewer/test/helpers/gateTable.ts` with its two runners, `packages/viewer/test/bodyGates.test.ts` (the
  page) and `packages/central/test/roomGates.test.ts` (the room) -- ruling PF.R35.

## 0. The answers

| question | answer | source |
|---|---|---|
| Which gates `FUN_00552ec0` applies | prone from stand or crouch: an obstacle near refuses it; crouch from stand or prone: an obstacle near refuses it, and from prone the headroom to the feet + 12; stand from crouch or prone: the headroom to the feet + 19 | D:L418914-419025 |
| Who is gated | every body but a remote one: the controller's vtable +0x34 (`IsRemote`) skips the casts and passes the headroom (D:L418970-418986, D:L418997-419006; `FUN_0054d620` D:L416260-416266) | research 193 |
| The crouch gate's reach | `FUN_0054d620(|v| x 1.2, 7.0, step_height x 1.2)`, from prone `|v| + 0.5`; `|v|` is the horizontal length of `actor+0x14b0`, the `firepoint`'s offset from the feet -- not a speed | D:L418958-418964; D:L493889 |
| The headroom ray | from the hips (`actor+0x304`) + 2 straight up to the feet + 19 (mode 0) or + 12 (mode 1) | `FUN_0057efe0` D:L441190-441245 |
| The ray's foot in the port | the stance's idle hips + 2 on both ends: 7.504 crouched, 4.168 prone (`HEADROOM_HIPS_READING`) | 180 §1.5, §8.3 |
| The dive | asks no gate: the full press runs `FUN_0057e540` itself | `FUN_00594cf0` D:L453386-453390 |
| The wall probes (PF-16) | the class's level probe at the feet + 6.5 (r 3.5) standing and crouched, + 3.0 (r 8.0) prone along the travel, and the head line at the head + 2 | `FUN_0054aa30` D:L415110-415459 (§2) |
| A refused request | headroom refusals drop it (`actor+0x374` back to the stance); obstacle refusals keep it and ask again each tick; the port drops both | D:L418991, D:L419011; `FUN_00552d60` D:L418875 |
| PF-39 | closed in sprint 25; two questions stay, note only | 211 §6, §9 |

## 1. The stance gates and the headroom (PF-15)

### 1.1 `FUN_00552ec0`, transcribed

`FUN_00552d60` (D:L418867-418912), the per-tick applier, asks `FUN_00552ec0(actor, actor+0x374)` -- the requested
stance -- and on a yes plays the change: `FUN_00581660` (prone; or the dive `FUN_0057e540` when the controller's +0x30
says so and `FUN_00584b00` passes), `FUN_00581990` (crouch), `FUN_00581dc0` (stand). The gate (D:L418914-419025), after
its entry tests (an action flag 0x40 or `FUN_00588080`, not `FUN_00579ea0`, the state word `+0x174` not 7), by the
request:

- **2, prone** (D:L418930-418946): refused while action 0x11 plays (`FUN_00577e40`); from a state other than 2,
  `FUN_0054d620(11.2, 8.0, step_height x 0.5)` finding an obstacle refuses it and clears the contact
  (`FUN_005b0bb0(actor, 0)`); then a local body in water over 2 is refused (`FUN_00584c10`); yes from stand or crouch.
  The port: `PRONE_GATE_READING` (PF-05, research 86 §7.2), `Walker.proneRefused`.
- **1, crouch** (D:L418948-418993): refused while action 0x19 plays; from stand (0) or prone (2),
  `FUN_0054d620(reach, 7.0, step_height x 1.2)` must be clear, with `reach = |v| x 1.2` from stand and `|v| + 0.5` from
  prone (D:L418958-418964); then `FUN_005857e0` (the held item's class and water over 8.5) must pass; yes from stand;
  from prone, yes when `FUN_0057efe0(actor, 1)` -- the headroom to the feet + 12 -- is clear (D:L418987), else the
  request is dropped (`actor+0x374 = actor+0x174`, D:L418991). The port: `CROUCH_GATE_READING`,
  `CROUCH_GATE_REACH_READING`, `Walker.crouchRefused` and `headroom('crouch')`.
- **0, stand** (D:L418995-419013): refused while action 0x13 plays; from crouch or prone, yes when
  `FUN_0057efe0(actor, 0)` -- the headroom to the feet + 19 -- is clear (D:L419007), else the request is dropped
  (D:L419011). No obstacle cast. The port: `headroom('stand')`.

`FUN_0054d620` (D:L416194-416363) is one caster for both obstacle gates: from the feet + its third argument, a segment
`ahead` along the facing (the actor matrix's row +0x20 negated) and one `behind` against it, cast together by
`FUN_005ab590` (D:L464473). The port's `Walker.obstacleNear` is that, level and against the mover's walls, as
`PRONE_GATE_READING` already was. The action refusals (0x11, 0x19, 0x13) and `FUN_005857e0`'s item class are not
modelled (the port's water fallback, `Traversal.stanceFor`, stands for the water halves).

### 1.2 The headroom ray's foot (`HEADROOM_HIPS_READING`)

`FUN_0057efe0` (D:L441190-441245) takes `FUN_002869d0` of the node at `actor+0x304` -- the hips (`CZSealBody`'s
constructor D:L419618-419619 stores `FindPart("hips")`, the ELF string at 0x65c4f8) -- adds 2 to its height
(D:L441218), and casts from there, in actor space, to the feet + 19 or + 12 (D:L441208-441215); a polygon of the
material class `(byte 10 & 0xf) >> 2 == 1` does not count. The hips are posed, so the foot moves with the clip: the
crouch idle's 5.504 gives 7.504, the crouch walk's 9.328 gives 11.33, the prone idle's 2.168 (555/256) gives 4.168
(180 §1.5; V1 §8.3 confirmed the dumps' hips on the root, 0.0231 / 0.0 off it).

The room has no posed skeleton. A gate the page and the room disagree on refuses an honest press on one side; so both
take the stance's **idle** hips: 7.504 crouched, 4.168 prone, 13.484 standing (unused: a standing body asks no
headroom). The consequence: a crouch-walking SEAL's ray starts 3.8 lower than the original's, so a lintel between
7.5 and 11.3 over the feet stops the crouch's run on the port and not on the console. Owed: a capture of a crouch-run
under a 12-unit lintel. `HEADROOM_FROM_READING` (14, the crouch column's top) is retired.

The crouch's run (`FUN_00584c60`) asks the same ray, mode 0 (D:L444147); its test at full stick under a 17 ceiling
stays as it was (17 is inside 7.504-19 as it was inside 14-19).

### 1.3 The crouch gate's reach (`CROUCH_GATE_REACH_READING`)

`|v|` (D:L418958-418959) is `sqrt(+0x14b8^2 + +0x14b0^2)`. Nothing in the movement writes `actor+0x14b0`: it is the
vector `FUN_005df450` refreshes with `FUN_005df930(actor, actor+0x14bc, actor+0x14b0, 0)` (D:L493889), `+0x14bc` the
`firepoint` node looked up by name (0x660410; also set by the swap, `FUN_005a64c0` D:L461844), and the result the
node's position turned by the actor's rotation -- the offset `GetPutativeFirePointW` 0x57fa70 adds to the position
(D:L441633-441636; `fire.ts`'s header). So the crouch gate reaches as far ahead as the muzzle sticks out, x 1.2 (from
prone, + 0.5): the rifle's muzzle must not go into a wall as the body folds. It is a distance in units, not a speed;
research 180 §4.2's "`|v|`" read as a velocity in the dispatch.

The port poses no weapon in the room, so the reach is a reading taken once: the M4's `firepoint` (research 79 §3,
(7.7854, 0.8338, 0) in the rifle node) on `seal_A_scuba`'s `rhand` through `./heldItem` (`heldSkeleton`, `muzzleOf`),
the skeleton at the first key of each idle (MP2's `CLIB_GEO.ZED`, `MOTION_P.ZAR`; a throwaway probe, not kept):

| pose | muzzle (x, y, z) from the feet | horizontal |
|---|---|---|
| `seal_stand` | (-2.750, 12.728, -8.599) | **9.03** |
| `seal_crouch` | (1.341, 7.090, -11.438) | 11.52 (the gate does not run from crouch) |
| `seal_prone` | (-1.728, 0.074, -14.490) | **14.59** |
| `seal_fp_stand` (aimed) | (1.615, 15.102, -15.066) | 15.15 |
| `seal_run` | (-6.729, 14.510, -8.348) | 10.72 |

So the crouch gate reaches 9.03 x 1.2 = **10.84** ahead from a stand and 14.59 + 0.5 = **15.09** from prone, 7.0
behind, at the feet + 7.8. Not followed: the posed clip (an aimed SEAL's 15.15 would reach 18.2), the pistol's shorter
muzzle, the other character models. Owed: an RDRAM read of `actor+0x14b0` standing idle, aimed and prone.

### 1.4 What a refusal does to the request (`STANCE_REQUEST_RETRY_READING`, note only)

A headroom refusal writes the request back to the stance (D:L418991, D:L419011): the press is gone. An obstacle
refusal (`FUN_0054d620`, prone or crouch) returns 0 and leaves `actor+0x374` as asked, so `FUN_00552d60` asks again on
every tick (D:L418875; the player update calls it each tick, D:L418609) -- a SEAL that pressed prone against a wall
goes prone once he steps clear, unless a new press changes the request first. The port drops every refused press
(`Walker.changeStance` is one call). Owed: a request word on the shared `Walker`, retried each tick on both ends, and
a capture to confirm it (prone pressed facing a wall, then a step back).

### 1.5 The dive asks no gate

The full press (pressure 0.3 or more, `FUN_00594cf0` D:L453380-453392) from stand or crouch dives at once when
`FUN_00584b00` passes (moving 30 a second or more, water no deeper than 2, no swap, no action): `FUN_0057e540`
(D:L440868-440927) sets the request to 2 itself and starts the dive -- `FUN_00552ec0` is never asked. What `FUN_0057e540`
writes to the applier's state word (`+0x174`) during the dive is unread; if the applier re-enters with request 2 its
prone probe's refusal only calls `FUN_005b0bb0(actor, 0)`, which cannot stop a dive already running (the review of PF-15). So the Log's "the dive into prone skips the prone
gate" (2026-10-04) is the original's behaviour, and the port keeps it: an obstacle 11.2 ahead refuses a still prone
press, not a running dive (`walk.test.ts`, "the dive into prone asks no gate ..."). The dispatch's
"the dive asks the prone gate" was not built; the applier's own dive (`FUN_00552d60` D:L418885-418890, a prone request
taken while the body has come up to speed) is gated, and the port has no pending request to take it from (§1.4).

### 1.6 The shared gate table (ruling PF.R35)

`packages/viewer/test/helpers/gateTable.ts` holds `GATE_ROWS`, each `{ name, world, body, motion, input, expect, why? }`:
`world` the obstacles over a 2000-square floor (`GATE_FLOOR`, `GATE_PARAMS`, the room tests' flat map's grid),
`body` `{ at: [x, z], yaw, stance }`, `motion` `{ forward, right, ticks }` or null, `input` a union by `kind` (PF-15:
`{ kind: 'stance', to }`), `expect` `'taken' | 'refused'`, `why` the room's `dropped(kind, why)` for a gate the room
applies itself. The page's runner (`bodyGates.test.ts`) plays a row on `WalkMode` (its `Walker` and `Traversal`, the
press through `setStance`); the room's (`roomGates.test.ts`) on a `Room` fed `Command`s through the codec. Both run
`it.each` under the title `'%s: the page and the room agree (%s)'` (the row's name and its expect). PF-15's rows:
`prone refused 11.2 ahead` (refused), `stand under a 10 roof crouched` (refused), `prone to crouch under 16` (taken),
`crouch into a 7.8-high slot` (refused). A later task appends one block of rows, and for a new kind of press one
`GateInput` member with its branch in both runners (research 218 §4 for the permission's rows).

## 2. The probes (PF-16)

Ruling PF.R44 (the owner's H92: "a standing SEAL under a low overhang **yes**"). The column (`bodyLow` 6 to `bodyHigh`
20 / 14 / 9) is gone; the walls meet the original's probes. One finding changes the brief: the controlled body casts a
**second height**, its head + 2 (§2.2), which research 180 §1.6 believed absent and left owed.

### 2.1 `FUN_0054aa30`, transcribed (D:L414515-416190)

- **The class** (`FUN_0058a720(actor, 1)`, D:L415110-415133): class 0 or default (r 3.5, h 19.1); 1 (3.5, 15.0); 2 with
  `bVar5` (8.0, 6.0), without it (3.5, 19.1). `bVar5` is prone (state `+0x174` 2) or one of the actions 0x1a / 0x1b /
  `DAT_003dec58` / `DAT_003decc0..d0` (D:L415088-415111; `WALL_PROBE_ACTIONS_READING`, note only).
- **The direction** `fStack_10`: the velocity `+0xf44` normalised (the actor matrix's row +0x20 negated when still or under `bVar4`, the actions `DAT_003decc0..d0`:
  D:L415135-415161), times `r x 1.4` (D:L415166). **The side** `fStack_20`: that direction turned a quarter
  (D:L415171-415181), times r; `uStack_30` = side x 0.3 (D:L415184 / 415210), `uStack_40` = side x 1.2 (D:L415194 /
  415220; x 1.3 more under `bVar4`, D:L415197). **The centre's reach** `uStack_60` = `fStack_10` x 1.1 (D:L415235).
- **The height** `fVar22`: step_height `DAT_0044c26c` (6.5; 4.0 static, 6.5 from boot, 180 V1 8.4 (c)), or the class
  height x 0.5 when `bVar5` (D:L415231-415233): 6.5 standing and crouched, 3.0 prone.
- **The segments the controlled body casts** (the branch at D:L415341: the controller's vtable +0x2c answers -- read as the local
  player, research 179's `RemoteRespawn` taking the body whose controller answers 0; each registered by `FUN_0054f410` D:L417251-417272, which returns 0 once 50 are queued):
  1. the centre: the feet to the feet + `uStack_60` + the velocity, at `fVar22` (D:L415341-415433), its end lifted by the
     body's matrix when `bVar5` (`FUN_0054ecd0`, D:L415426-415431);
  2. **the head line**: from the feet at the head node's y + 2 to the feet + `fStack_10` + the velocity at the same y
     (D:L415441-415459 -- `FUN_002869d0(skeleton, actor[0xc2], ...)`, `fStack_1dc + 2.0`);
  3. standing and crouched (`!bVar5`) two side segments: from the feet + `uStack_30` to the feet + `uStack_40` +
     `fStack_10` + the velocity, at `fVar22` (D:L415549-415577), and mirrored (D:L415789-415817): 0.3 r to 1.2 r off the
     axis, `r x 1.4` ahead -- the fan;
  4. prone (`bVar5`, not `bVar4`, `cVar11` clear) two side lines: from the feet + `uStack_30` x 1.3 - `fStack_10` to the
     feet + `uStack_30` x 1.3 + `fStack_10` + the velocity, at `fVar22` with the matrix lift split over both ends
     (D:L415582-415621), and mirrored (D:L415822-415861): **0.39 r = 3.12 off the axis, from 11.2 behind to 11.2 ahead**.
  A body the branch does not take (a remote one) casts the centre segment alone, reaching `fStack_10` = 1.4 r plus the
  velocity, not the local centre's 1.1 x 1.4 r (D:L416025-416044).
- **The resolution** (`FUN_005483d0` D:L413380-413560): a contact's normal takes the velocity's part into it away; the
  segments' ends are what touches, so the original's stand-off is about their reach.

- **The centre moving** (D:L415354-415371): while the stance `+0x174` is 0 or 1 (standing, crouched) and the forward
  speed `+0x34` is over 0.01 (or crouched backing with a flag of `+0x21c` clear), `uStack_60` is scaled again by
  `DAT_0064fce8` = **1.75** (the ELF's `.data`, read 2026-10-05): a moving standing or crouched body's centre reaches
  1.75 x 1.1 x 1.4 x 3.5 = **9.43** ahead, 5.39 when still.
- **Turning prone** (`bVar5` and `actor+0x48` != 0 set `cVar11`, D:L415110-415112): the 0.39 r side lines (cast only
  when `cVar11` is clear, D:L415585, D:L415825) are **not** cast; one 0.3 r to 1.2 r line is, on the side the turn's
  sign (`+0x264`) picks, its end turned through `+0x98` (D:L415701-415788, D:L415941-416023); the centre's and the head
  line's ends are turned the same way (D:L415420-415425).
- **A still body** (`bVar7`, the velocity under 0.0005 a component, D:L415135-415149) casts its segments along the
  facing (the matrix row +0x20 negated), not nowhere.
- *Note (PAR-21a, 2026-10-17; research 281 s4.1; reading, pending review; not built):* the still body's casts are the
  local player's: a body the controller's vtable +0x2c does not answer for, still, with `bVar6` clear and the timer at
  `+0x1160` at 0, casts nothing (D:L415036-415055; the segment list emptied at D:L415068-415071). And the head line's
  end is `fStack_10` plus the velocity only while `+0x14bc` is 0 (D:L415441-415456); with it set (D:L415457-415523) the
  end runs along the facing row +0x20, scaled by 1.1 times `+0x14b0..+0x14b8` dotted with the facing, when the facing is
  against the travel (under 0, or -0.2 under `bVar4`) or the body is still and one of a few states holds -- `+0x14b0` and
  `+0x14bc` are not identified here.

So the prone "fan", moving straight, is three segments along the travel (`PRONE_FAN_READING`: count 3, the centre 1.1 x
1.4 r = 12.32 ahead, the two side lines 0.39 r across) plus the head line -- a body-length box 6.24 wide, not a disc;
the standing fan is three at 6.5 (the centre 5.39 ahead still, **9.43 moving**, the sides 1.05 to 4.2 across, 4.9
ahead) plus the head line.

### 2.2 The head line (`WALL_HEAD_LINE_READING`)

`actor[0xc2]` is `+0x308`, the `head` node (`CZSealBody` constructor D:L419620-419621; research 180 §1.3's table). The
line stands at the head as posed + 2 over the feet. The port's forward kinematics of each idle's first key
(`MOTION_P.ZAR`, `seal_A_scuba`'s tree, research 180 §1.4's method) gives the head at 17.394 standing, 10.138
crouched, 3.637 prone: **the lines at 19.394, 12.138 and 5.637**. The room has no posed skeleton, so both ends take
the idle (as PF-15's `HEADROOM_HIPS_READING`); the posed head moves with the clip (§2.3 gives the error), owed a
capture. The port gives the line the body's footprint (the disc, or prone the fan's), not one segment ahead.

What it changes against the brief: H92's "yes" was asked as "a standing SEAL walks under an overhang lower than his
head". In the original a standing SEAL passes anything between 6.5 and 19.394 that does not reach either line (the
brief's 10-high slot, a bar from 7 to 10: passed), but a lintel that comes down to 19.394 or lower and stands up past
it stops him (the old `walk.test.ts` "a crouch passes under a lintel at 16 that stops a standing SEAL" stays true,
retitled to the head line). Prone, a bar from 5 to 7 meets the head line at 5.637: the brief's "prone passes under it
at 3.0" is not the original's. The owner's row (§6) asks whether this is the yes he meant.

### 2.3 What the port builds (`mover.ts` `slide`, `crosses`)

The slide keeps its shape (push out of each wall's footprint to the radius, take the velocity's part into it away) on
two lines (`wallProbeHeights`: the low probe and the head line; `PRONE_PROBE_TILT_READING = 'root'`, so prone the low
line ahead rises with the root's tilt, §7.8, and the head line stays level) instead of a band. Standing and crouched
the radius is 3.5 every way. Prone it is the fan's: 3.12 every way, and a line 8.0 ahead along the travel -- a wall it
meets nearer pushes the body back along the wall's normal by (8 - t) x cos, so a crawl straight in stops 8.0 off and
one aslant slides along the wall `8 cos` off. The stand-off is the class radius `r`, not the segments' reach
(`WALL_PROBE_READING`, a reading: `BODY_RADIUS` 3.5 is pinned by the walk's tests and the room's shot geometry). The
13-wide doorway, the 7.5-wide corridor and PF-05's 6-wide corridor still pass. The wall cache is unchanged (the lines
are cut from the same walls). The shared gate table has two rows: `a 10-high slot standing` (passed) and `prone into a
wall at 8` (stopped at 8), a new press kind `walk` (no press, the motion alone).

Where the port departs from §2.1, each a reading:
- **The stand-off.** The port stops a body `r` off a wall (3.5; prone 8.0 along the travel); the original's segments
  touch at their reach -- standing or crouched still 4.9 to 5.39, moving **9.43** (the centre's 1.75), prone 11.2 to
  12.32. A walking SEAL in the original stays about 9.4 off a wall it walks into, the port's 3.5 (`WALL_PROBE_READING`).
- **A still body** casts nothing ahead in the port (`ahead = 0` with no travel); the original casts along the facing.
  Only the prone line ahead depends on it: a still prone body facing a wall is not pushed back to 8.0.
- **Turning prone** the port keeps the 0.39 r fan; the original swaps it for one turned 0.3-1.2 r line (§2.1). Not built.
- **The head line's height.** Idle on both ends; the posed head moves with the clip. The port's forward kinematics over
  each clip's keys: crouch-walking (`seal_crouchwalk`) the head stands 12.84 to 13.09, so the port's 12.138 line is
  2.7 to 3.0 low; running (`seal_run`) 15.39 to 15.74, so the 19.394 line is 1.7 to 2.0 high (standing idle it is exact).
  A running SEAL in the original meets a lintel lower, about 17.4 to 17.7, than the port's 19.4.
- **The probe's tilt** (`PRONE_PROBE_TILT_READING = 'root'`, PRONE-TILT-2 (3), §7.8; ruling PF.R44 for the level
  tread): the prone low line ahead rises with the root's tilt; the 3.12 disc and the crossing guard stay level; on a
  level tread the tilt is none, so stairs read as §2.5.
- **A face's end** (`WALL_END_CONTACT_READING = 'face-normal'`; MV-PARITY (b2), 2026-10-31; reading, pending review).
  Where the disc meets a face at one of its ends (the band's nearest point is an end, not a point on the face), the
  slide used to push the body out along the direction from that corner and take the velocity's part along it. The
  original has no such direction: its hit is a segment of the fan crossing the polygon inside its edges, with the
  polygon's own normal (research 281 §4.3), and `FUN_005483d0` takes each hit in its list's order -- the frame
  displacement `+0xf44` (the port's move and its `vx`/`vz`) loses its whole part along the levelled normal
  (D:L413538-413541, D:L413557-413567); the carried velocity `+0x1350` loses only its part into it (D:L413588-413594).
  The list's order is the segments' until a filtered hit's slot is refilled from its end (D:L413428-413457). The port
  now takes, for a face's end: no push; after the pass's face hits (the centre segment's, cast first, D:L415341 on), the
  move's remainder -- the move from where it began less its parts along those faces' normals, in order -- loses its part
  into the end's face along that face's own normal, and the velocity its part into it -- the parts INTO the face only
  (`moved < 0`, `into < 0`), where the original removes the whole part along the normal: its segments, cast along the
  travel, hold no hit on a face the move leaves, while the port's disc can touch an end it moves away from. An end met
  from behind its face's own normal counts for nothing (the hull's hit is one-sided, research 281 §4.3, micro 288-333;
  the port's face contacts stay two-sided, as before), nor does an end behind the feet across the move: the fan's
  segments run from the feet forward (D:L415549-415577, mirrored D:L415789-415817). A move out of the face keeps its
  part, as the original's segments, cast along the travel, cross no face behind them. What the port cannot read on its
  disc contacts: which ends the fan's 0.3 r to 1.2 r side lines meet (the disc meets any end within `r`), and the hits'
  order among the walls (the original's is its segments', the port's its walls' within each class). Measured (dev-disc
  tests, not captures): M51's ditch (`m51DitchBlock.disc.test.ts`, the EPH replays 20261031T154035Z, 154148Z, 154254Z
  and the live run 014055Z at 17.6-23.4 s) now holds a body pushed -x into the far step, sliding -z and under
  `RUNNING_JUMP_SPEED`; the corner push had carried it +z at about 30 a second, out to where the step is low. MP72's
  step-down (`mp72StepDown.test.ts`) runs on along its start's z 1574 (the corner push had pulled it to the neighbouring
  face's end, z 1572.58 -- the value the test pinned, the port's own output). Frostfire's tunnel ramp foot
  (`tunnelRampDisc.test.ts`, LATER 412's case): at x 384, 1 off the end of `tun1_4`'s face (x 383), the walk +z now
  stops at the face, standing and crouched alike, where the corner push slid it to the opening and up the ramp (the
  port's own output); a line clear of the corner (x 387.5) climbs. `traversal.test.ts`'s PAR-21a C1 crate (synthetic)
  has its +x side wound to face out, as a hull face is: `box` winds it in, and its end, met from in front of that inward
  normal, stopped the walk past the crate's corner at x 9.88. A body walking past a face's end with less than `r` to
  spare (the review's F1, `wallEndContact.test.ts`): nothing moves it sideways while the end is nearest, and once its
  centre is past the end the face's interior puts it out to `r` in one tick (1.5 at a clearance of 2; the corner push
  spread it over three ticks). The original walks on at the clearance it had: the pop is the disc stand-off's
  (`WALL_PROBE_READING`'s row). A stand-off taken along the end's normal was tried in the fold and smoothed it, but left
  M51's ditch jittering in and out of contact with the velocity unclipped (65) every third tick, so it was not kept. The
  mix is the port's: its face contacts stay two-sided while an end is one-sided, so a wall wound away from the walkable
  side still blocks along its face but not at its end -- `botHeadOn.test.ts`'s synthetic corridor had its +x walls so
  wound, and a bot's aside probe slipped past the mouth's corner (its walls now face the corridor). A disc wall wound
  that way would do the same; the original sees such a face from neither part. One-sided ends are 6d's lane decision
  under 5d's MV-PARITY (b2) dispatch, on the ditch capture (research 281 §4.3's note; the plan's Log).
  `WALL_END_CONTACT_READING` is a switch: `'radial'` restores the corner push. Owed: a capture of a SEAL pushed into a
  face's end and along a convex joint (Frostfire's big tanks), and LATER 283's segment probe.
- **The deep contact: read, not built** (`WALL_DEEP_REVERT_READING`, *note only*; PR #408 taken over, closed
  2026-10-22 by the controller's decision (c); LATER 283). Reading, pending review.
  - *The read* (`FUN_005483d0`). The move's hits `iVar25` are the body's segments that hit something, one entry each
    (D:L413406-413425: a segment's single hit, or the one `FUN_002d4cc0` picks of several), less those whose normal's y
    is over `DAT_0044c268` (0.643, `AI_HULL_READING.slope`) and those of a material flagged in bit 0 or 1
    (D:L413426-413457). So it counts segments, not polygons: the centre segment and the head line meeting one wall
    are two hits. For each hit (D:L413533-413597) the normal is levelled and normalised (D:L413538-413541) and the
    velocity's part along it taken off; the depth is |the segment's end less the hit point, along that normal|, and
    the largest is kept with its normal (D:L413571-413585) -- only for a body whose controller answers the vtable
    +0x2c (D:L413571), the local player's: the AI's (`00575c30`, `Walker.glideAi`'s note) answers 0, so an AI body is
    never put back. `bVar6` (D:L413487-413502) is the action 0x1a (Prone), 0x1b (Prone crawl) or 0x1c current, or
    `bVar5` (D:L413481-413486: `DAT_003decc0` / `DAT_003decd0`, the prone strafes, research 80), or the stance
    `+0x174` 2. Then (D:L413602-413614): when the deepest is over 1.0 and `bVar6 || 2 < iVar25`, the body goes back to
    the position saved at the end of the last solve (D:L413604-413607, saved D:L413959-413962) and `+0xf44..+0xf4c`,
    the frame displacement, is set to `DAT_003f64c0` = (0, 0, 0) (D:L413608-413610; research 179); otherwise
    `depth - 1` along the deepest normal is added to it (D:L413613-413614). In the turret anim set (`+0x528` =
    `DAT_0044d410`, research 215 T81-4) the displacement from before the contacts is written back after all this
    (D:L413908-413912), so a body put back there keeps it.
  - *Why it is not built: measured on the port.* The branch was ported on the port's contacts (a probe
    hit one wall a line meets at the wished point -- the low probe and the head line each, prone the line ahead too
    -- its depth how far the wished point is inside the stand-off) and run, one file at a time, on the disc and the
    fixtures (2026-10-22, scratch, never in the tree):
    1. **MP72's step-down sticks.** Walking +x from (2156, 89.25, 1574), the body steps down to 82.62 and from tick 12
       every move is put back at (2163.04, 1574.00): three `worldmodel/emb01` hits on the low probe, 2.019, 2.201 and
       2.554 deep, all **behind** the feet's line across the travel (by 0.59, 0.41, 0.40) -- the disc meeting the
       faces the line dropped into. The walk ends 7.04 in; main walks 24.99 to the radius off the next wall
       (`mp72StepDown.test.ts`).
    2. **A fall hangs.** Walking off Frostfire's 142 deck east of A's spawn, the airborne step at y 130.23 (falling at
       70.57) meets six `worldmodel/pipeworks` hits, the deepest 1.632, all ahead; put back with `vy` zeroed, the fall
       restarts from rest every tick and the body is at 119.50 after 120 ticks, still airborne (main lands on 100).
       **This one is our review's error, not the original's branch:** the measured draft zeroed the port's `vy`
       (the fall speed `+0x133c`) on the put-back, as our review asked, where the original zeroes only the frame
       displacement `+0xf44..+0xf4c` (below); the branch keeping `vy` was not run on Frostfire. The decision stands
       on 1, 3 and M71's 0.993 (#408's close review, finding 1).
    3. **A body placed deep is frozen.** Placed at (2670, 187.5, 1280) on M71, 2.73 inside a face with three hits
       ahead, every move is put back (229 of 229) and it never moves; main pushes it out. The same for any spawn,
       placing or door leaf that leaves a body more than 1 deep against three or more contacts.
  - *M71's pocket, on the disc's own hull* (`RUN/M71.ZDB` through `loadMap`): from the stand-off (2676.46, 187.5,
    1280.15) on 16 headings, 60 ticks each, the deepest contact of any move is 0.993 and the most hits 3; nothing is
    put back and each heading moves 0.01-0.02. The branch would not run there even if built: the pocket is the port's
    disc contacts meeting at one point (`WALL_PROBE_READING`), pinned as main holds it (`walk.test.ts`, LATER 283).
  - *Option (b), read and not taken.* Standing and crouched, every segment starts on the feet's line across the
    travel (the centre and the head line at the feet, D:L415341-415433, D:L415441-415459; the side lines 0.3 r
    across the travel turned a quarter, D:L415171-415184, D:L415549-415577, D:L415789-415817) and runs ahead; a still
    body casts along its facing (D:L415135-415149); prone, the side lines start 1.4 r behind (D:L415582-415621). So a
    hit the original counts lies ahead of that line: a reading. Testing the port's disc contact by its nearest point
    is the port's own stand-in, not the original: a slanted face whose nearest point is behind can still cross a
    segment ahead, and a face ahead can fall between the fan's lines. Measured, it frees MP72 (no move over 1 deep;
    the walk ends at 2180.99 as main's) but not Frostfire (its hits are ahead), not M71's pocket and not a body placed
    deep against contacts ahead. LATER 283 is the root: the original's segments as the wall probe.
  - *Our review's errors* (the merge controller's reviews of #408, 2026-10-20/21). "Zero `vy` too" was wrong for the
    port: D:L413608-413610 zeroes `+0xf44..+0xf4c`, the frame displacement the port's `vx` / `vz` stand for
    (`mover.ts` `slideOrMove`, research 201 §3); the port's `vy` is the fall speed `+0x133c` (`mover.ts`, the airborne
    law, `FUN_0059b440`), which the branch does not touch -- this note's earlier "horizontal" was right, and zeroing
    `vy` is what hung the fall in (2). And our direction that porting the branch would free M71 could not reach it:
    on the port's disc contacts its deepest is under 1 there. Fuse's cage rules (the surround scan, `intoFace`, `kept`,
    the still-body exception, the crosses fallback, `WALL_CAGE_MARGIN_PLACEHOLDER`) had no source and are reverted
    with the rest of #408's `mover.ts`; its tests keep the angled press (each face at 30 degrees holds 3.5), the M71
    pin, and the branch's prone and hit-count cases skipped under LATER 283.
  - Owed (LATER 283): a capture of a body walked into M71's ramp-foot pocket and out of it, and of MP72's emb01
    step-down walked +x from (2156, 89.25, 1574).

### 2.4 The eye kept off a wall (`HEAD_EYE_WALL_BACK_PLACEHOLDER`, kept)

The dispatch retired it on the premise that the prone probe keeps the eye (4.9 ahead) inside the body. It does when
the body crawls straight in (8.0 > 4.9), but the fan is cast along the travel, not the facing: crawled in aslant (8 cos
60 = 4.0 off), strafing along a wall (3.12) or peeking, the port's eye stands past the face. Whether the original's
does is not settled by this read: the stand-off differs (§2.3), and turning prone to face the wall it casts the
turned 0.3-1.2 r line instead of the fan (§2.1), which the port does not build. So `headEye` and its 0.1 stay, page and
room, as the port's own guard; the page's PF-05 test (`walk.test.ts`, "the view from the head never passes a wall")
and the room's (`room.test.ts`, `roomEquipment.test.ts`) now reach the wall 60 degrees aslant and then face it (the
head 0.9 past the face), so taking `headEye` out turns them red.

### 2.5 What changes in play

A standing or crouched SEAL walks through anything that misses both of its lines (a rail at waist height, from 7 up to
under the head line); a crouched one passes under a lintel at 13; prone keeps 8.0 off a wall it crawls into (was 3.5)
and passes gaps over 6.24. The camera's view through what the body passes is the original's (H92).

**Prone at stairs and kerbs (a regression against the column, named).** The prone probe at the feet + 3.0 meets any
wall face standing over it within 8.0 ahead, where the old column's foot (6) let the step take it. Measured
(`wallProbes.test.ts`, "prone at stairs ..."): stairs of rise/run 2/4, 3/6 and 4/8 stop a crawl at their foot (the
next riser stands over 3.0 within 8 ahead: steeper than about 20.6 degrees); 1/4, 2/8 and a 2.9 kerb are crawled; a
3.1 kerb stops it 8.0 short. The tilt does not explain it away: `FUN_0054ecd0` (D:L416972-417027) turns the segment's
direction (the travel in the body's frame, `fStack_190`, D:L415342-415352) through the body's matrix (vtable +0x88,
`+0xc`) and lifts the end by the result's y -- the line follows the **body's** pitch, and nothing read here pitches a
prone body on a flat tread (the only ground normal kept, `+0x1344..+0x134c`, is the one hit under the feet,
D:L456531-456533). So by this read the original's prone stops at the same stairs, and building the tilt (PF.R44 kept it
level) would change ramps, not treads. Not settled: how the prone body's matrix is made (owed a read of vtable +0x88's
matrix writer and a capture: a prone crawl up a 3/6 stair and at a 4-high kerb).

**Read 2026-10-31 (PRONE-TILT, §7; reading, pending review):** the matrix writer is `FUN_00548090` -- vtable +0x88 returns
`skel_root` (`actor+0x2e8`), and that rule writes the root's quaternion from the floor hit's normal `actor+0x410` (not
`+0x1344`) and rebuilds the root's matrix each tick. On a flat tread the normal is up, so the read above stands: the tilt
changes ramps, not treads. The probe through the body's matrix (`PRONE_PROBE_TILT_READING`) is built by PRONE-TILT-2
(3), §7.8: the low line ahead rises with the root's tilt. The maps have such faces: walls 3.0
to 6.5 tall, 264 of 2422 on Frostfire (MP2), 196 of 3362 on MP6, 688 of 7390 on MP72 (polygons, some of them parts of
taller faces; `groundPolygons`, `isWallSurface`).

### 2.6 The pocket beside Crossroads' stair: no rise rule on the ground (issue #111, 2026-10-09)

*Reading, reviewed 2026-10-09* (a fresh review, PASS WITH FINDINGS; the gameplay lane's read for issue #111; a disc-backed headless measurement of the port, and
the decompilation read again; nothing measured on the original running).

**The report.** `menuCrossroads.spec.ts:107` failed intermittently on every tree tried (the controller's bisect was
non-monotonic). In the failing runs the Terrorist's walk down MP72's stair left it at about x 737 (`walk 737,58,830`)
and stood on the road at (736-737, 42.5, 841-842) with the stick pushed; the harness's reroute then gave up.

**The pocket, off the disc** (`RUN/MP72.ZDB` through `loadMap` and `groundGrid`): the stair `worldmodel/wc13/di_stair`
is one sloped polygon (n_y 0.83, 34 degrees: a floor, not a wall) from y 42.5 at z 852.6 to 68.2 at z 814, its west
edge running from x 736.7 to x 736.3; the stringer `worldmodel/wc13/di_ext16_19` beside it is a block x 733.1..736.3
whose top rises 47.7 -> 71.2 over z 850 -> 814 (3.3 over the stair) and whose east face, the plane x 736.3, is a wall
strip from 42.5 -> 65.5 to 47.7 -> 71.2 (47.9 to 53.25 at z 841.5); the road `di_road13` at 42.5 runs on under the
stair's west part to an edge at x 739.48 (z 841.5). So between the stringer's face and the stair's edge there is a
crack 0 to 0.4 wide (736.3 to 736.585 at z 841.5) with only the road under it. Walking down the stair, the low probe
line (the feet + 6.5) passes over the stringer's face and the head line over everything, so nothing holds the body off
the edge; a tick whose centre lands in the crack finds the road 15 below (`FUN_005b5d40`'s vertical probe,
D:L470163-470290, finds it there as the port's `selectFloor` does) and the body falls into it. That fall is the
original's rule as read (a point probe) and is not changed.

**The measurement** (`packages/viewer/test/crossroadsStairPocket.test.ts`, disc tier; a standing `Walker` placed at
(736.5, 42.5, 841.5), full stick 120 ticks in each of eight headings):

| heading | before the fix | after |
|---|---|---|
| N (-z) | 0.00 | 73.08, up the stair to (739.81, 68.19, 768.50) |
| NW | 0.00 | 65.18, to (683.50, 42.50, 803.56) |
| W (-x) | 0.00 | 53.00, to (683.50, 42.50, 841.50) |
| SW | 0.00 | 120.22, to (656.43, 45.88, 931.18) |
| S (+z) | 0.00 | 124.09, to (739.81, 41.44, 965.54) |
| SE | 0.00 | 126.36, to (827.46, 41.44, 929.21) |
| E (+x) | 0.00 | 22.00, onto the stair at (758.50, 49.87, 841.50) |
| NE | 0.00 | 76.25, to (758.50, 68.19, 768.50) |

What held it: the stringer's face is met by the low probe line (49.0 at the pocket; the head line at 61.894 is over the
face's top), so every sub-step's position is pushed to the stand-off x 739.8 (`WALL_PROBE_READING` r 3.5). There the road
has ended and the only floor is the stair at 49.87, **7.37 over the feet** -- over `step_height` 6.5, inside
`FUN_005b5d40`'s window of 20 -- and the port's grounded step refused any floor more than `step_height` over the feet.
West, the push away from the face would carry the body through it and `crosses` refuses it. So no direction was open.

**The decision: (b), the port trapped where the original does not, by this read.** The original compares no floor rise
with `step_height` in the walk (research 86 s6.5): `step_height` (`DAT_0044c26c`) lifts both ends of the segment query
the move solver makes from the actor's position to the moved one (`FUN_005483d0` D:L413711-413731, the query
`FUN_0031e1d0`), and a polygon that line meets steeper than `max_slope` (`+0x14 <= DAT_0044c268`, D:L413736; 0.6428,
research 201) and not VOLUMETRIC or LIQUID stops the move (review, 2026-10-09: that query runs only in the contact branch, once a wall
contact exists, D:L413673-413678, and it does not end at the moved position: it looks ahead along the velocity by
its length plus the speed along it, at least 5.25, 10.5 standing, or 11.46, D:L413686-413711; the face a body meets
first is `FUN_0054aa30`'s probes at `step_height`, D:L415167, section 2.1, which the port's low probe line stands for);
the floor is `FUN_005b5d40`'s pick, refused only when more
than 20 over the feet (D:L470232-470274) -- the airborne sub-step's rule since OWNER-5 (research 86 s6.3). The rise
rule was the port's own from W2.2b (`fbc82b31a`), cited to `dynamics.rdr`'s field, not to a function. The stair's
surface (n_y 0.83) is no polygon the query stops at, and nothing else stands between the pocket and the stair, so the
original's body is not held there. **The fix** (`mover.ts` `Walker.step`): the rise rule is gone; the probe line at the
feet + 6.5 (`wallProbeHeights`, `crosses`) is what stops a body at a face taller than 6.5, and the pick's window bounds
the rest. Every map: a floor 6.5 to 20 over the feet with no wall face in the way (a stair's side edge, a face-less
ledge) is now stepped onto **where no floor lies at or under the feet + 6.5 at the new point** -- `selectFloor` takes
the highest floor at or under the origin + 1 whenever one exists, so the old rule could only fire on its "else the
lowest" pick (a table 10 high over open ground is walked under, as before); one with its face is stopped as before (`walk.test.ts`: a 7-unit face stops the mover; a
face-less 7 and 19.5 are stepped onto, 21 is refused). The harness's route (`e2e/menuMatch.ts` `route()`) and the spec
are unchanged.

**Not the commit.** No commit between `23bfefbf` and main made the pocket: the rule is from W2.2b, and whether a run's
tick lands in the 0.2-0.4-wide crack depends on the frame and look timing (the bisect's non-monotonic result).

**Not settled (owed).** West leaves only through the port's stand-off (pushed onto the stair, over the stringer's top
53.25 and off its far face); the original removes the velocity into a contact (`FUN_005483d0`
D:L413541-413560) and pushes by the contact's depth less 1 (D:L413602-413614), so its way west is not read. A capture would settle the whole: on the original, a
SEAL walked down the west edge of MP72's stair at about x 737, and one walked into a face-less 7-20 rise. The
review's disc sweep (about 6,000 walks on MP72, MP6 and MP2, old rule against new) found one other divergence, a new
reachable spot to capture too: on MP6, a walk from (743.2, -30, 2007.2) heading +z now steps 12.36 up onto
`worldmodel/tank` (a truck's fuel tank) at (720.0, -17.64, 2029.5), where the ground `g73` ends at x 720; the old rule
stopped the body at that edge. The browser
spec (`menuCrossroads.spec.ts`) passed with this change (the playtest batch's Log, 13:08Z and 13:52Z: test 1 five of
five, the file's four tests).

### 2.7 The steep-rise refusal: removed (LATER 590, closed 2026-11-05; bounded 2026-10-31, `STEEP_RISE_FACE_MIN_READING` retired)

*Reading, pending review* (segment-body-2 task S, `agent/sb2-590`, 2026-11-05: the refusal removed on the reads below;
measured off the disc headless; nothing measured on the original running). The interim bound that stood from 2026-10-31
to 2026-11-05 is kept below as it was filed.

**Closed: no rise is refused for a floor's slope.** Re-read at the source for this close:
- the walk compares no rise: `FUN_005b5d40` (D:L470163-470290) keeps the highest floor at or under the origin + 1, else
  the lowest, and drops it only when it is more than 20 over the feet (D:L470272-470274); no normal is read;
- a steep face stops a body only where `FUN_0054aa30`'s records at the feet + `step_height` 6.5 meet it (`DAT_0044c26c`,
  D:L415167) and `FUN_005483d0` resolves the hit -- a normal under `max_slope` levelled, the move's part along it taken
  away (D:L413533-413567) -- or where the contact branch's look-ahead, lifted by `step_height`, meets a steep unflagged face
  and zeroes the displacement (D:L413711-413736);
- steep ground under the feet slides only where `FUN_0054f330` makes it eligible (research 201 s3).
The interim stood in for the segment body; with the segment body on `main` (B203, §2.9) the refusal is removed, with
`STEEP_RISE_FACE_MIN_READING` and `faceHeight`. Held by `viewer/test/steepRise.test.ts` (it replaces
`steepRiseBounded.test.ts`).

**What it frees** (the disc, headless):
- MP9's trunk crease at `land_04/congo2_tree4`'s west-north-west foot, (1794.86, 127.00, 1747.50) (LATER 687's sweep; 24 of
  its 276 ground routes ended there): standing and crouched every heading now leaves it, 6.3-56.8 in 2 s (was
  0.00-0.18); the 276 routes re-run end stuck in 0 (was 24). Prone, the rest still moves 0.00 in every heading, with or
  without the refusal (the prone jam, D:L413602-413611); a stand press frees it.
- MP7's `g537` trough (1242.1, 118.22, 1569.5): headings 90, 135 and 180 leave it (were 0.00). Heading 90 crosses the
  faces (8.70 and 10.28 tall, n_y 0.50 and 0.61) on a grade near 0.25, rising 6.87: no record meets a `g537` face on the
  way -- the centre record at the feet + 6.5 passes over them -- so it is the source's walk, not a regression. (The interim
  record read `g537` as "still refused"; that was the refusal, not the segments.) The crossing also rests on
  `SLIDE_SPAN_MEASURE_READING` 'column' (`./steepSlide`): the faces' column span under the feet is under `SLIDE_SPAN_MIN`
  4, so `FUN_0054f330` (D:L417237) does not make them slide; under 'vertices' (the polygons' 8.70 and 10.28) they would
  slide the body and it would not cross. The capture below settles the two together.
- Vigilance's pocket (the owner's report): still free in every heading.
- MP51's bridge sides (§2.8, BOT-STRAND-S53): from (629.76, 24.78, 936.11) headings 218 and 234 now walk off (71.5, 88.8;
  were 6.2, 15.5); 202 and 282 still stop within 4 (another cause).
- MP51's bot graph: 3 edges gained, none lost (`match/test/navigationGraphIdentity.test.ts`); MP2's unchanged.

**What a tall steep face does now** (synthetic, `steepRise.test.ts`, `walk.test.ts`, `steepSlide.test.ts`):
- walked at from a flat floor, a face wound with its normal up (n_y 0.62, 0.50, 54 degrees) holds the body off by the
  segments at every heading tried, the same with the refusal or without -- the refusal never acted there;
- a face the segments do not test -- ditype 1 (bit 1 clear), or wound with its front down (research 281 s4.3) -- is
  stepped onto, and the slide's entry speed (the uphill velocity's part along the fall line, `FUN_0054edf0`, research 201
  s3) carries the body up a little before it turns back: never a `step_height` up (5.70 on a 55-degree ramp, 6.11 on a
  54-degree face);
- pressed straight up a sliding face, the body treads in place (each uphill step taken, the slide bringing it back).

**The six-map sweep** (scratch, main's one line restored against none in one process; MP9, MP51, MP72, MP7, MP73, MP1;
up to 200 spots 2 off the foot of a steep face at least 6.5 tall, 100 on such faces, 100 on walkable ground; stand, crouch
and prone; 8 headings, 60 ticks; a stall is under 1 moved): 54,240 runs, stalls 10,129 -> 9,897, 244 freed, 12 new (3
spots x 1 heading, stand and crouch, each a body laid on a steep sliding face -- MP9 `land_20`, MP51 `wc18/ground_wc18`,
MP72 `sandbags2` -- and pressed up it: under the refusal it slid off, 1.69, 1.78 and 46.06, now it treads where it was;
each of the three keeps 7 of its 8 headings out); spots stuck in all eight headings 317 -> 310 (7 freed), none new. 141 runs climb at least `step_height` in
total on faces the refusal held; in none did the walker's own records meet the polygon it climbed (on MP7's `g125_2` the
side line met a neighbouring polygon of the same face, and the resolution carried the body along it). The
tallest, by a body's rise over its start: placements on near-vertical faces (n_y 0.09-0.21) pushed by a neighbour's
records during the slide (MP9 `congo2_tree2`, MP51 `wc06A`), an oblique walk along MP7's `g125_2` (n_y 0.59-0.64) with
the side line's hit resolving the move along it, and MP1's dredge, where no floor lies at or under the feet + 6.5 and the
pick takes the lowest, 13.5 up (§2.6). The report is agent-mail `segment-body/sb2/S-REPORT.md`.

**Untested (LATER 713).** Bodies placed on near-vertical floor polygons (n_y 0.09-0.21: MP9 `congo2_tree2`, MP51
`wc06A`) are now lifted by a neighbour's records during the slide; no walk in the sweep reaches them, and whether a jump
or a fall can land a body on them is not swept.

**Owed (a capture, not a blocker).** A SEAL on the original walked at MP7's `g537` from its trough on heading 90, pressed
up a sliding face (MP9 `land_20` at (1352.92, 34.79, 1107.93), yaw 90), and run at a steep face over flat ground: the
slide's entry speed and the treading are the port's model of `FUN_0054edf0` (research 201 s3).

*The interim, as filed 2026-10-31:*

**The rule as it stood.** `Walker.groundEndpoint` refused a grounded step onto a floor that rises and is steeper than
`max_slope` 50 degrees (`if (rise > 0 && floor.normal[1] < MAX_SLOPE_COS) return false;`). The rule came with W2.2b
citing no function, and section 2.6 removed its sibling for the same want of a source: the walk (`FUN_005b5d40`
D:L470163-470290) compares no rise, and a steep face stops a body only where `FUN_0054aa30`'s probes at `step_height` 6.5
meet it or the move solver's segment query lifted by it does (`FUN_005483d0` D:L413711-413736). LATER 590 records the
rule's want of a source and OBF-21's measurements: lifting it everywhere freed 23 of the ledge sweep's pinned walks and
pinned 11 new ones (MP10's jungle trees among them); keeping it only where the face would slide the body freed 5 and
pinned 9.

**The reported spot** (the owner, nightly v0.3.32, read with the page's hook): Vigilance (MP51), feet
(711.610, 65.773, 1150.560), yaw 29.206 -- on the low side of `wc18/ground_wc18`'s rounded cap, a bevel of n_y 0.455 whose
polygon is 5.5 tall (y 64.3-69.8), with the original's wall-only collision `wc18/di_walls_wc18` (ditype 2, camera type 0)
3.5 ahead, a vertical quad y 61.5-99.4 that the original's column probe tests and so is kept.

**The bound.** The refusal holds only where the floor polygon's own height is at least `step_height`
(`STEEP_RISE_FACE_MIN_READING` = `SEAL_TUNING.stepHeight`, 6.5) -- the height of the original's own segment query over the
feet -- and a shorter steep lip is walked over. The measure is the polygon's own height (top minus bottom), the port's
choice: it is not the face's top over the feet, so a tall polygon whose top is under the feet + 6.5 (MP7's `g537`, 8.7
tall, its top 4.5 over the feet at the sweep's spot) is still refused; "top over the feet at least `step_height`" is the
alternative a capture may choose.

**Measured** (the disc, `ledgeCase.probe.test.ts` and `ledgeSweep.probe.test.ts`: the code as built with no override,
against `OBF21_NO_STEEP_RISE=unbounded`, the rule as it stood): at the reported spot, eight headings from the reported yaw -- the unbounded rule moved
0.0-0.07 in five of them (standing and crouched), the bound moves 6-102 in every one (out over the cap, and up the hill
in the two headings back); prone was never fully held (2-10). The 22-map ledge sweep (OBF-21's, 40 edges a class a map): its
stuck walks unchanged (145 before and after; MP10's jungle trees not newly pinned), its walks stopped short of the edge
with no wall hit 335 -> 325 -- ten freed (MP73 nine, LATER 590's rim `g5788`, 1.53 tall, among them; MP61 one), none
new (the sweep walks off edges, so it reaches no pocket like Vigilance's). LATER 590's other named spots: MP72's Charlie
lip `table_slanted` (1.84 tall) -- the prone crawl at yaw 0 now goes 21.6, down onto the road (was 0); MP7's `g537`
(8.70 / 10.28 / 8.82 tall) still refused (the review's walks, 2026-10-31). Held by `viewer/test/steepRiseBounded.test.ts`, removed 2026-11-05 (the spot, eight headings,
standing and crouched; disc-backed).

**Not settled (owed)** *(as filed; closed 2026-11-05 above)*. LATER 590 stays open: the rule's source-faithful removal, after a capture on the original of a
SEAL walked over MP73's `g5788` rim and MP7's `g537`, and up a long steep face (the slide-back that would replace the
refusal is the port's own model of `FUN_0054edf0`, research 201 section 3).

### 2.8 The near-vertical floor: r0004's push off it (`STEEP_FLOOR_CONTACT_READING`; MP51-FLOOR-TRAP, 2026-11-02)

*Reading, pending review* (6d's implementer; source inspection of r0001's decompilation and of r0004's code by
disassembly -- the r0004 investigation's `mipsdump` / `ndiff`, OT.R97; headless disc probes of the port; nothing
measured on either original running).

**The report.** BCMP MP51 s41 (BOT-DOOR-PRESS): bot 227 stood from t20070 at (1506.609, -68.455, 678.891), stick about
0.85, velocity 0, no wall hit, slide speed 0 -- MP51's long-known stair hotspot @1520,-50,660 (LATER 612 step (a), on
its own branch) and s37's bot 232 on `agent/stair-giveway`, so no one branch's.

**The spot, off the disc** (`RUN/MP51.ZDB` through `simMapFromBytes`, `groundGrid`, `groundPolygons`): the stair
`worldmodel/wc11` (n_y 0.833) ends at the canal; its right side is a triangle of the same model, (1504.148, -68.187,
684.603), (1512.515, -69.098, 665.182), (1512.128, -54.386, 665.416), normal (0.919, 0.018, 0.395) -- a stringer
face 1.5 degrees off vertical whose xz shadow is a sliver about 0.09 wide at z 678.6. Between that face's foot and
`canal_wc11`'s edge (1505.385, 682.106)-(1512.515, 665.182) is a hole in the collision about 0.13 wide (no polygon a
vertical line meets; the bot's own rounded point is in it). In the sliver the face is the only floor: the probe
(`FUN_002d3030`'s surface loop and `FUN_002dd150`'s edge test, desktop research 23 section 1.1 items 6-7) has no
normal test, and `FUN_005b5d40` (D:L470163-470290) picks it, as the port's `probeGround` / `selectFloor` do.

**Why the port's body froze** (a standing `Walker` at (1506.714, -68.454, 678.646), the face's own height there; every
one of eight headings, 120 ticks at 0.85: moved 0.00 -- `main` eb5a8d987 unchanged). The face is steeper than
`max_slope` and its column span 4.59 is over `SLIDE_SPAN_MIN`, so the slide runs (`FUN_0054f330` D:L417208-417246) and
its step replaces the stick's (`FUN_0054edf0` D:L417156-417160, `+0xf44` / `+0xf4c`): `speed dt n_y (n_x, n_z)`, about
0.001 a tick at n_y 0.018. That step ends over the hole, no floor is under it, and the move is not taken; the speed
clears (`slideOrMove`'s stuck rule) and the next tick starts again from 0. The jump is refused on that floor
(`actor+0x1348` under cos `max_slope`). No input moves the body.

**r0001 holds it too, as read.** The slide's downward search walks 1.0 to 10.0 times the step (D:L417164-417179,
`FUN_005b4f30`), at most 0.01 here, inside the hole; the move is taken and the tick's probe misses, which with
`DAT_003df1c8` set (1 in the ELF) puts the actor back at its last hit and zeroes the slide speed `+0x1340`
(`FUN_005b0420` D:L467091-467103, the zero at D:L467098). So r0001's body re-enters the same tick forever.

**r0004 pushes it off** (OT.R97: r0004 is the spec). `FUN_0054f330`'s twin (r4 0x554180-0x554354; 56 words grown by
62) keeps r0001's test and adds two blocks after a successful extent read:
- standing or crouched, span at least 4 (the slide runs): when `+0x1340` is 0 (r4 0x554248-0x554258), `n_y` under 0.1
  (`0x3dcccccd`, r4 0x554260-0x554278) and the actor matrix's third row -- the back axis (research 86 section 3.8) --
  dotted with the floor's (n_x, n_z) is over 0 (r4 0x554280-0x5542a0, `mula.s` / `madd.s`): the body faces into the
  face. Then three zeroes into r4 `+0x1354..+0x135c` (r0001 `+0x1350..+0x1358`, the carried velocity; r4 0x5542a4-
  0x5542d0) and `FUN_005b0c10`'s twin (r4 0x5b6a60; r0001 D:L467321-467340) with the floor: the contact record
  `+0x1100..+0x111c`, which r0004's twin keeps only for a face steeper than `max_slope` (its 8 new words).
- prone: when `+0x1340` is 0, the same zeroes and record, with no `n_y` or facing test (r4 0x5542e0-0x554328).
The driver already pushes off a set record after `FUN_0054edf0` (D:L416578-416613; r0001's only writer of the record on
this path is the walk-off's `FUN_0054a8b0`, D:L414474-414512, which the port does not model): `FUN_0054a6d0`
(D:L414410-414469) with 6.0 standing (`0x40c00000`, D:L416613) -- prone `max(7, 8 x the back axis . n)` -- takes the
moved feet P (the position plus the frame's displacement), the plane of the record's point and normal (`FUN_00286e20`),
and `t` = the plane's crossing along P - 6 n with P's own y (`FUN_00286db0`): `t` = n . (P - X0) / (6 |n_xz|^2). Under
1 it raises each axis of the displacement to `n 6 (1 - t) 0.7` in that axis's sign. A standing body's record goes at the
tick's own probe: `FUN_0059afd0` sets `+0x1061` bit 0 on a grounded tick (D:L456356-456361) and the hit clears the
record for any stance but prone (D:L467106-467121); a miss clears it too (D:L467101). **The frame's order** puts that
take after the push: the task list runs `entity_tick` (4.6, D:L50925) before `entity_post_tick` (6.0, D:L50929);
`entity_tick` calls each object's slot +0x18 (D:L145096-145108), the SEAL's driver `FUN_00550ef0`, whose +0x28 call
(D:L418458) is `FUN_0054d9a0` with the slide, the record and the push (research 313; 230 §5.2.2); `entity_post_tick`
calls every object's +0x20, then every object's +0x24 (D:L145065-145071) -- the SEAL's `FUN_005506a0` (the move
`FUN_005483d0`, which clears bit 0 and sets it again through `FUN_0059afd0`, D:L413942-413945, then the probe's queue
`FUN_005b0840`) and `FUN_00550570` (the take, D:L417771; the words at 0x6691c0 and 0x6691c4, research 251 §12.5). So in
r0001's frame the push is one tick's: at the spot, 4.2 along (0.919, 0.395), over the hole onto `canal_wc11`.
*Two readings, per parity clause 7* (the frame order is r0001's; r0004's `FUN_005483d0` changed, +113 words, and its
bit-0 write is not re-read there): (a), built -- the record cleared in the push's frame, one push; (b) -- the record
outlives the frame and tick N+1 pushes again at `t` about 0.7, about 1.26 more along the normal (`n 6 0.3 0.7`). Owed:
r0004's `FUN_005483d0` bit-0 write re-read, or a capture of the push's distance on r0004.

**Built** (`mover.ts` `slideOrMove`, `STEEP_FLOOR_CONTACT_READING` `{ normalY: 0.1, distance: 6, gain: 0.7 }`): the
standing and crouched block, its one-tick push over the slide's step, the carried velocity zeroed. Its readings: the
back axis is the port's `(sin yaw, cos yaw)` (the climb's facing reads the same row, `climb.ts` `CLIMB_FACING`); the
record's point is the floor's hit under the feet (the probe's, `+0x400`) and P's y the feet's (the port writes no
`+0xf48`, so the slide's downward search is not in `t`; n_y 0.1 or less makes that term at most a tenth of the height).
Held by `viewer/test/steepFloorContact.test.ts` (disc-backed): facing into the face (on its normal and 40 degrees
either side) the body is off it and on the canal (n_y over 0.9) in one tick; facing away it is held as before (r0004
pushes nothing); the bot's own case -- held facing its patrol leg (1529.8, 696.1), freed the tick it faces its
recovery leg (1492.3, 686.1).

**Not built (owed).** (1) The prone block: it needs the persisting contact record (a prone body's is not cleared by the
probe, D:L467119-467121) and the driver's prone distance, and changes every prone body on every slide; with it, the
walk-off's `FUN_0054a8b0` record, which the port lacks in r0001 too. (2) r0004's other changes to `FUN_0054edf0` (r4
0x553be0, +25 words): the downward search's hit on walkable ground clears the slide speed (r4 0x553fb0-0x553fec), and
the slide's exit landing (`FUN_005af590`) is skipped for stances 8-10 (r0001 9-10) and when the top action's byte
`+0x2b` is 8 (r4 0x5540c4-0x5540f0). (3) A capture on the original (r0004) of a SEAL in that sliver, facing each way.
**What a bot does** (OT.R81, not this note's): a bot facing its route away from the face stays held until it turns
into it; its stall recovery's leg back up the stair does that.

**Bot 235 (BOT-STRAND-S53), a different cause.** Its bin @640,24,940 is not the canal pocket under the bridge (a body
placed there from y 24-28 drops to the canal at 11.56, wedged under `di_bridge_wc13_*` -- `crosses` refuses every way;
a placement artefact). Walked from the bridge node at (629.76, 24.78, 936.11), headings 202-350 degrees stop within 5
on `worldmodel/wc13A/di_bridge_wc13_sides` at y 23.4-26.1 (n_y 0.518-0.533, column span 0.27-0.49, so no slide):
every step, whole and split by axis, rises onto the next `_sides` polygon (n_y 0.518, taller than 6.5) and is refused
by the interim steep-rise rule (section 2.7, `STEEP_RISE_FACE_MIN_READING`; LATER 590, which has no source in the
original). That is LATER 590's, not this push's (no floor there is under n_y 0.1); not changed here. (LATER 590 closed
2026-11-05: headings 218 and 234 now walk off; section 2.7.)
### 2.9 The segment body (SEGMENT-BODY, 2026-11-02; `WALL_BODY_READING`; LATER 283, LATER 620)

*Reading, pending review* (the gameplay lane, on 5d's decision between readings, OT.R53: "the port's disc body with
two-sided faces is the departure; the original's segment body with front-face-only hits is the reading"; the owner's
"Fix this", Q4's default "from the reading, no interim escape"). Transcribed from r0001 (`socom2_game.elf.decomp.c`) and
checked against r0004, the spec (OT.R97), by the parallel reader's `agent-mail/evidence/segment-body/R0004-SEGMENTS.md`
(itself a reading, pending review); measured headless on the fixtures and the disc. Nothing here is a capture.

**The body.** `FUN_0054aa30`, the controlled body's branch (the controller's vtable +0x2c answers, D:L415341 on):
- *The class* (D:L415113-415133): standing and crouched r 3.5, prone (`bVar5`) r 8.0; the height `fVar22` the feet +
  `step_height` 6.5 (`DAT_0044c26c`), prone the class height x 0.5 = 3.0 (D:L415231-415233).
- *The direction* `fStack_10` (D:L415134-415166): the frame displacement `+0xf44` normalised in three axes, or the
  facing (the matrix row +0x20 negated) when every component is under 0.0005 (`bVar7`, D:L415135-415150); times r x 1.4.
- *The side* `fStack_20` (D:L415171-415220): (-dz, 0, dx) of the displacement (of `fStack_10` when still), normalised,
  times r; `uStack_30` 0.3 of it, `uStack_40` 1.2 of it.
- *The records, in order* (each `FUN_0054f410`, D:L417251-417272):
  1. the centre: the feet + h to the feet + 1.1 `fStack_10` (`uStack_60`, D:L415235) + the displacement + h
     (D:L415401-415433); x 1.75 more (`DAT_0064fce8`) while the stance word is 0 or 1 and the body-frame velocity's z
     `+0x34` is over 0.01, or crouched and under 0 with `+0x21c` bit 2 clear (D:L415354-415371). **Forward is -z in that
     frame** (`FUN_0057a330` D:L438978-438984: `+0x34 = -stick x speed`): the 1.75 is a standing body BACKING and a
     crouched one moving either way -- §2.1's "a moving standing body's centre reaches 9.43" read +0x34 as forward;
     standing and running forward the centre reaches 5.39;
  2. the head line: the feet + the head node's y + 2 (D:L415441-415443) to `fStack_10` + the displacement while the
     `firepoint` node `+0x14bc` is clear (D:L415444-415456); with it set (D:L415457-415523), when the row +0x20 (the
     BACK) dotted with the direction is under 0 -- the body moving FORWARD -- or the body is still, and the top play's
     looped bit with `FUN_00286c90(+0x458)` over 0 and the stance word not 5, or prone, or the actions 0x11 / 0x13 /
     0x19, the end is the row x (the row . 1.1 x `+0x14b0`): along the facing by 1.1 x the muzzle's forward part --
     9.46 standing, 12.58 crouched, 15.94 prone (`SEGMENT_FIREPOINT_READING`, §1.3's table) -- plus the displacement;
     §2.1's note had the condition the other way round (the row taken for the facing);
  3. standing and crouched, the side lines: the feet + `uStack_30` + h to the feet + `uStack_40` + `fStack_10` + the
     displacement + h (D:L415549-415577), mirrored (D:L415789-415817);
  4. prone (not turning, not strafing) the side lines: the feet + 1.3 `uStack_30` - `fStack_10` to the feet + 1.3
     `uStack_30` + `fStack_10` + the displacement, at h (D:L415582-415621), mirrored (D:L415822-415861).
  Prone, each record's end is lifted through the root (`FUN_0054ecd0`, D:L416972-417027): the centre (D:L415426-415431),
  **the head line too** (D:L415531-415535; `PRONE_PROBE_TILT_READING`'s doc and `wallProbes.test.ts` had it level), and
  the side lines split over both ends (D:L415617-415620).

**A hit.** Each record's hits are the hull's one-sided crossings (research 281 §4.3: a start in front of the polygon's
own normal and an end behind it), over the movement's surfaces (bit 1 set, bit 18 clear). r0001 keeps a record's
nearest hit (`FUN_002d4cc0`) and drops the record when that hit's normal y is over `max_slope` or its material is flagged
in bit 0 or 1 (D:L413406-413457); **r0004 keeps the nearest hit that passes** (R0004-SEGMENTS (A)), and in the knock's
falls (`FUN_00588030`) skips the slope drop (B). Built: r0004's (`SEGMENT_HIT_PICK_READING` `'nearest-passing'`).

**The resolution** (`FUN_005483d0`, every tick, airborne or not, D:L417822-417826): in the list's order, each hit's normal
levelled (y under `max_slope` made 0) and normalised (D:L413538-413541); in the jump's and the knock's actions (`FUN_00587f50`
8 / 9, `FUN_00587f10` 10 / 11, `FUN_00588030`) the displacement is put out by the record end's depth behind the face
(D:L413543-413556), otherwise it loses its whole part along the normal (D:L413557-413567); the carried velocity
`+0x1350` its part into it (D:L413588-413594). The depth |(end - hit) . n| of the controlled body's hits, the deepest kept
(D:L413571-413585). **The jam** (D:L413602-413611): the deepest over 1 with the body prone (the actions 0x1a / 0x1b /
0x1c, the prone strafes, or the stance word 2) or with more than two hits puts it back where the tick began (the
displacement zeroed; the copy is the orientation, §2.11); otherwise the depth less 1 is added along the deepest's normal
(D:L413612-413614). **The look-ahead** (D:L413673-413800), with a hit and no slide speed: prone and turning (`+0x23c`)
jams; else from the feet + `step_height` along the resolved displacement, its horizontal length plus 11.46 prone, or plus
the larger of 5.25 (crouched 10.5) and the `firepoint` offset dotted with the direction; a steep unflagged hit zeroes the
displacement; then from each hit 0.1 of the way back to its record's start (`FUN_00308fc0`), along the displacement made 2
long when its horizontal length is under 2, the same. The new position is the start plus what is left (D:L413918).

**How it maps onto the walker** (`mover.ts`, `WALL_BODY_READING` `'segments'`): `Walker.move` resolves the tick's whole
move once (`resolveSegments` over `bodySegments`), then walks what is left in sub-steps for the floors; `fall` builds the
airborne tick's displacement (the carried move across and the game frames' fall) and resolves it before its floor pick.
Every `Walker` body is the controlled body's -- the page's, the room's players and bots (bots are the port's own seats):
the depth, the jam and the look-ahead run for all; `glideAi` (the hostages, an AI controller answering 0) keeps its
centre line. The port's tick is 60 Hz (PF.R8): the records add the tick's displacement, half a 30 Hz frame's.

**What replaces the disc for walls**: nothing of `r`: the stand-off is where a record first crosses a face -- head on
standing 9.46 to 9.46 + the move, at a face under the head line 5.39 to 5.39 + the move, crouched 9.43 or 12.58, prone
15.94 (the head line) or 12.32. **The floors and steps keep their own rules** (`step`, `groundEndpoint`, `selectFloor`, the
`[dx, 0] / [0, dz]` retry; the steep-rise bound of §2.7 until its removal, 2026-11-05): `FUN_005b0840`'s pick is not the wall pass, and none of them
reads a wall. **What replaces `crosses`**: the look-ahead (`SEGMENT_LOOK_AHEAD_READING`) and the records' own reach past the
move; `pushOut` is gone with it -- a still body is resolved by its records along its facing. **b2's end clip** has no place:
a face's end is met by a record crossing the face inside its edges, with the face's own normal, as any hit
(`WALL_END_CONTACT_READING`, `AIR_WALL_HEIGHTS_READING`, `PRONE_FAN_READING` and `WALL_PROBE_READING`'s `r` serve the
`'disc'` arm only). **The running jump and the stored contact (proven, 2026-11-04; `JUMP_CONTACT_PROVEN` 'none'):** the
running jump launches on its speed alone (225 or more squared, `FUN_0057e1b0` D:L440812-440814); the stored contact
refuses nothing. ac's jump-near-wall capture (r0004, PCSX2, offline, 2026-11-04 11:30-11:50Z,
`segment-body/jump-near-wall/RESULTS.md`, two identical trials a case) ran square at M51 g19733's face at full stick:
pressed 17.43 from the plane with `+0x10ac` set and CLIMB offered (`+0xed0` 4) it launched type 8 and carried 64.5 u at
62.3 u/s over the 14-u top (a standing jump carries nothing); pressed 6.95 out, contact set, type 8; pressed 28 out
(contact clear) and the parallel control, type 8. Held by `weaponLine.test.ts` (capture-scored on M51; a synthetic twin).
**The rejected reading**, kept with its evidence: "the running jump wants no stored contact besides its speed
(`FUN_0057e1b0` D:L440815-440819: while `+0x10ac` is set it takes `DAT_003deae8`'s standing jump;
`JUMP_CONTACT_READING` 'stored-contact')" -- a transcription of the r0001 decompilation, whose addresses are r0001's:
on r0004 the word at 0x3deae8 is code (`0x00431023`, the capture's RDRAM read), so the branch is an older build's, and
the r0004 capture overrides it. The r0004 code agrees (reading, re-read 2026-11-04 by fresh review 2 and its fold):
r0004's jump, 0x583490 (the desktop recompilation's r0004 output, `sub_00583490_0x583490.cpp`), loads no `+0x10ac`
at all, where r0001's (its r0001 output, `sub_0057E1B0_0x57e1b0.cpp`, the load at 0x57e348) does -- the test is
deleted (the r0004 investigation's G3, `cluster-wall-slide-fix.md` s2.1); LATER 614 closed by it.
**The speed the test reads (proven, 2026-11-04; LATER 676 closed as faithful):** `FUN_0057e1b0` squares the clip's
velocity `+0x2c..+0x34` (D:L440812-440814; r0004 0x583668-0x583694, `0x43610000` = 225.0), which `FUN_0057a330` writes
from the top clip's root velocity (`FUN_0028c250` D:L438908, the projection D:L438911-438958, the scale D:L438985); the
wall cut `FUN_005483d0` touches only `+0xf44` and `+0x1350` (D:L413533-413597), never `+0x2c`. So a body blocked at
full stick is offered the running jump. ac's r0004 ditch capture (PCSX2, offline, 2026-11-04 14:08-14:30Z,
`segment-body/ditch-capture/RESULTS.md`, case 1 x3 at M51 (990, -140, 841.5) facing 180 held right; case 2 x2 square at
g19733): blocked at (982.40, -150.84, 841.50), the body moving 0.00 a second against a clip velocity of 65 and
`+0x10ac` set, every press gave type 8 (then 10, 2, 1), never the standing jump's 178 (the halfword at 0x409cb8). The port
reads the tick's velocity before the walls (`Walker.jump`, `bodyVelocity_`, written at the start of `slideOrMove`): M51's
ditch offers it on 70 of 70 ticks (`m51DitchBlock.disc.test.ts`; 49 before), a body pushed square into a wall launches
(`walk.test.ts`). The carry stays the cut velocity (`+0x1350 = +0x38`, D:L440823-440825; `takeOff`) (the port's; on a jam the original's differs, LATER 690). *The rejected
reading*, kept with its evidence: MV-PARITY (b2)'s ditch block -- "every jump there leaves it where it was" -- rested on
the EPH replays 20261031T154035Z, 154148Z, 154254Z and the live run 014055Z, whose `record.json` files read `build`
r0001 (and `revision.detected` r0001); r0001's stored-contact branch (D:L440815-440819) makes the jump standing there,
so they say nothing of r0004. Where the capture's jump lands -- back in the ditch, +13.17 up, at x 984.03 -- the port
does not on 25 of the 70 ticks (LATER 690). **The carry on a jam (proven, 2026-11-04; LATER 690, no code):** ac's
second r0004 ditch capture (offline, M51 slot 5, from (990, -146.02, 841.5) at yaw 180, held right, Square once; two
trials, `agent-mail/evidence/eph-hunt-2026-11-01/segment-body/ditch-capture-2/RESULTS.md`, every guest frame). At the
press the body is jammed at (982.405, -150.844, 841.5), moving 0, with `+0x38` = `+0x64` = (-65, 0, 0). The first air
frame (type 8) does not move horizontally, `+0x38` still (-65, 0, 0). On the next, `+0x38` and `+0x64`'s level part
become (-4.3026, 0, -16.1603) (|v| 16.72), and the body snaps 4.0 out of the wall (+x) and 1.76 along -z; the flight
carries that vector (-0.144 x, -0.539 z a frame), its vertical starting 72.06 and falling 7.841 a frame (235 u/s^2), to
land back in the ditch at (983.98-984.03, -145.6, 830.2-830.6). Where (-4.30, -16.16) comes from is unread (`+0x1350`'s
y holds -4.3026 from the first air frame; the z is unexplained; `+0x64`'s writer needs a debugger write watch). The
rule planned as `JUMP_CARRY_READING` (the carry the clip velocity less its into-face part) is NOT supported: neither
-65 nor the clip velocity nor the jammed displacement (0) is carried. The port's carry stays the cut velocity until the
source of the 16.72 vector is read (LATER 690, the next branch). The slide's case is `JUMP_SPEED_SLIDE_READING` (the readings table). Under it
(SEGMENT-BODY part 2) a running jump within the weapon line's reach of a face
was the standing jump: MP2's walk launches fell from 312 to 217, the Frostfire rail-ramp jump was refused (LATER 682),
the bots' 40-tall app-4 climb failed (LATER 683). The move's stored contact stays built for the climb's offer
(`Walker.storeContact`). The standing jump's own type on r0004 is unread (r0004's twin of `DAT_003deae8`); the port's
standing jump is unchanged for a press under the speed.

**r0004.** The build, its constants, the resolution and the jam are unchanged (R0004-SEGMENTS); (A) and (B) are built;
(C) -- no records during Stand -> Turret without flag 0x20, the prone peek's shape and strafe flag, a prone body moving
mostly sideways taken as strafing (and its `+0x2c` written) -- is not: the port models neither the turret mount nor the
prone strafe's records (`bVar4`'s branch, D:L415640-415790), LATER 622. The prone side lines are the same in r0001 and r0004
(R0004-SEGMENTS, its follow-up): the x 1.3 is at D:L415582 (mirrored D:L415822) -- 0.39 r = 3.12 across -- from S - 11.2
dir to S + 11.2 dir + the frame's displacement, dir normalised in three axes, at the feet + 3.0 with the start lowered and
the end raised by half `FUN_0054ecd0`'s lift (D:L415616-415620; the lift is `PRONE_PROBE_TILT_READING`'s, its size
unread), cast by a still local body along its facing too; the port's `bodySegments` builds exactly that. Not settled
there: the body-vs-body lines (D:L417619-417626) and the turning-prone single line's reach (D:L415701-415788).

**Measured** (headless; dev-disc and fixture tests, `segmentBody.test.ts`, `segmentBridgeWedge.test.ts` -- named `bridgeWedge.test.ts` before the merge of main):
- Crossroads' slot (LATER 620): placed where the playtest's body stood (1675.8, 57.6, 1422.8), it walks out +x and -z
  through the fin's back. The fall itself (§2.11) no longer lands in the slot: over the slot dia's face, met from in
  front, puts the airborne displacement out by its depth (D:L413543-413556) and back through the fin's back; it lands at
  (1667.5, 57.48, 1418.1), before the fin.
- M71's ramp-foot pocket (LATER 283) on the disc's hull: 7 of 16 headings walk out (the disc held all 16).
- DOOR-PIN, MP51 `door_ft_2` (the investigator's case): facing -x, -z or +z the swing never wedges the body and it walks
  out in 6 of 8 headings; **facing +x (away from the leaf) the leaf crosses the body's +z side line from its front and
  carries it by the depth less 1 into the angle between the open leaf and `wc17A/di_intbasement_hint_01` at (953.97,
  925.15), where it is held while the leaf is open** -- the investigator expected "no segment meets the leaf" there. That
  the leaf's polygons are in the records' query at all is the reading (they are hull colliders the grid holds); a capture
  of a body in a door's arc settles both.
- The sweep's cases (BRIDGE-WEDGE's review): MP9 (1081.96, 1206.1), MP1 (2140.72, 1968.24) and MP51 (1349.15, 409.6)
  walk-offs come free (6 of 8 headings or more; the disc: 0); the rim at 10 caught in a fall lands on it from feet 6 up,
  and from feet 4 at 2.9 short the slanted record's end crosses the rim's face and the body falls short of it.
- M51's ditch (EPH replays): held 2 to 5 off the log's foot (x 981-986, the replays'), sliding -z; but on 5 of 70 ticks
  the stored contact is dropped and the running jump is offered (LATER 676). *2026-11-04:* the r0004 ditch capture offers
  it on every frame (§2.9, the speed the test reads): the port on 70 of 70; LATER 676 closed as faithful, the landing
  LATER 690.
- Prone stops at any flight whose riser spans the feet + 3.0 within 12.32 (1/4 and 2/8 now too); MP2's 142 deck's east
  edge is a pipeworks rail at the feet + 6.5 and is no longer walked off; brushing a side face fires the look-ahead short
  of a crate (Frostfire's 11.9 crate from x 938: no offer -- LATER 680; from 939.3, offered). These are the reading's
  consequences, owed captures.
- **The oblique climb, settled against the capture** (2026-11-04; research 86 s3.8; the weapon line built by SEGMENT-BODY
  part 2, reading, pending review): the original offers CLIMB walked in at up to about 62 degrees and standing still
  15 out (ac's r0004 capture, `climb-angle/RESULTS.md`), because the stored contact has a second source -- the weapon
  line's slot `+0x1140`, cast each tick along the facing 2 x the held model's x extent (the M4A1 SD's 22.930, proven)
  and copied into the contact when no record hits (`FUN_0054d9a0` D:L416630-416687, `FUN_0054e8f0` D:L416858-416910,
  `FUN_005483d0` D:L413618-413671; ac's RDRAM read: the slot and the contact identical word for word). **The rejected
  reading, kept with its evidence:** "a climb is offered only where the centre or the head line meets the face first --
  walked in at 45 degrees the side line meets it first and the body slides along it" (the side lines' geometry,
  D:L413823-413848, and the whole into-face part removed, D:L413557-413567): the side lines do take the move and give
  the capture's stop distances (6.4 at 30, 6.2 at 60), but "no offer" is contradicted. Owed: the square walk-in's
  stand-off, 5.66 here against the original's 5.34-5.40 (LATER 681).
- The bots' graphs: nodes unchanged; MP2 57790 -> 59851 edges (+5227, -3166), MP51 104147 -> 104248 (+3650, -3549); no
  node leaves its map's largest component (`navigationGraphIdentity.test.ts`). 25 match tests (bot synthetic worlds) are
  red and not re-judged at this checkpoint.

**Checkpoint 3 (the 22-map ledge sweep at 12e700ca4, f9's run; `agent-mail/evidence/gameplay/segment-body-cp2/`).**
- *"hung" (81 walks, 0 at base): a defect, fixed.* Falling fast over a face steeper than `max_slope` (MP5's (671.33,
  1531.46): `worldmodel/rdb3_1`), the records along the steep 3D displacement crossed it deep with more than two hits and
  the jam zeroed the displacement -- the port took the height from it, so the fall stopped each frame while the fall
  speed grew. The height is not the displacement's: `FUN_0059b440` steps the altitude `+0x2e4` by the fall speed itself
  (D:L456496-456498) and `FUN_0059ad30` lands it on the floor's hit (D:L456313-456322); the jam stops the move across only
  (`AIR_HEIGHT_READING` `'altitude'`). All 81 sweep cases replayed headless: none hangs 10 ticks, none ends airborne.
- *Prone, 155 newly pinned (15 freed), classified* by the last move's hits after 120 ticks of the sweep's prone walk:
  116 the side lines alone (e.g. MP1 (1360.21, 1368.16) on `bucket`, MP1 (1976.56, 1215.42) on `base`, MP1 (2226.02,
  3242.22) on `di`); 17 the head line alone (MP1 (2308.92, 3294.78) `whats_left`, MP12 (772.41, 1350.8) `g365_1`, MP12
  (1440, 1367.61) `g404_1`); 13 the low line on a face taller than 6.5 (MP1 (1637.63, 1328.07) `invisdi`, MP11 (1255.7,
  708.14) `di2_8`, MP2 (493.66, 1123.44) `rmp2`); 6 a low face under 6.5 with no floor at its top (MP6 (1201.44, 1478.17) a
  tire, MP62 (1623.74, 1393.36) `basedi`, MP64 (433.68, 693.66) sandbags); 1 a stair or kerb step (MP73 (1138.74, 1005.85)
  `tower01`); 2 no wall hit (MP6 (1879.71, 1876.9), MP72 (563.77, 1548.16), unclassified). Prone, every hit over 1 deep is
  the jam (bVar6, D:L413602-413611). The side-line class is the reading's at its scalar: the prone side lines run 22.4
  long (11.2 behind to 11.2 ahead) at 0.3 x 1.3 r = 3.12 across (D:L415582-415621), and a face that crosses either --
  clutter beside the body, or behind it facing away -- jams the crawl. The scalar is settled (the x 1.3 at D:L415582,
  mirrored D:L415822, the same in r0001 and r0004: R0004-SEGMENTS's follow-up), so the class is the reading's; only a
  capture can overturn it (ac's prone-near-clutter case). A prone body moving mostly sideways takes r0004's strafe records
  instead, which cast no side lines (its hunk C3, LATER 622); the sweep's prone walks run forward, so C3 does not reach them.
- *The segment pass's cost:* `segmentHits` rejects a static polygon whose box misses the segment's before its plane test
  (the same hits in the same order: a headless bench of 12000 ticks on MP2 and 60 sweep walks on MP10 give byte-identical
  positions); MP2 241 -> 143 ms (the disc 302), MP10 1010 -> 601 ms (the disc 780).
- *Synthetic floors:* the tests' `floor` quads are wound with their own normal down; a record rising through one from
  below meets it as a ceiling (walk.test's ledge jump, re-wound). A disc floor faces up.

**Open: the centre line's reach, against a capture (2026-11-02).** ac's first capture (capture comparison, PCSX2 r0004,
3 trials; `agent-mail/evidence/eph-hunt-2026-11-01/segment-body/results/SEGMENT-BODY.md`): a SEAL standing, full stick,
head on into `worldmodel/log1`'s face on M51 (centre (969.4, -141.8, 818.1), normal (-0.973, 0.054, 0.222), 12.2 tall --
its top about 11.8 over the feet, so the head line passes over it and the centre line at the feet + 6.5 is what meets it)
stands off **5.22-5.32** from the face's plane: about 5.21-5.31 across the ground at the line's height. The reading's
centre reaches 1.1 x 1.4 x 3.5 = **5.39** (`SEGMENT_BODY_READING` `centre` x `ahead` x r; no 1.75 moving forward), and
neither the frame's move (it can only stop the body further out) nor the depth push (it puts the body out, about 6.56
under a held 30 Hz push) brings a stop inside it; the port, headless at the same face, stops at 5.43 walking and 5.70
running (5.39 and part of a 60 Hz tick's move) -- the page's 5.5-5.9 in the capture. **The segments' origin is ruled
out** (ac's PCSX2 read, at rest only: row +0x30 of the caster's matrix `*(actor+0x28)` equals `actor+0x1c` exactly,
(938.226, -145.547, 858.236), and row +0x20 is (-0.089, 0, -0.996), the facing negated at yaw 185). So the gap points at
the centre line's reach or another part of its geometry (`uStack_60`, D:L415235, and the 1.75's condition,
D:L415354-415371). Not settled: no frame mid-run yet; the flat-wall stand-off (the head line along the facing, 9.46,
`HEAD_LINE_MUZZLE_READING`), crouched into the log (the 1.75 crouched: 9.43) and backing into it (the 1.75 standing: 9.43)
are queued on M51 (the village house, the church) and discriminate. Nothing is tuned meanwhile.

**Checkpoint 4: the flat wall (ac's capture of M51 house2's west wall, `worldmodel/noreg_343344/g160_1`, plane x 5425;
PCSX2 r0004, 3 trials, 2 and 3 equal to 0.01; 5d's decision).** The original: standing 6.78 (1.9 degrees off square),
crouch-walking 9.48, the crouch's run 5.85, prone 16.04, backing 9.66, and going prone beside the wall moves the body
about 3 out (3.10 -> 6.16, 4.50 -> 7.38). Read against it:
- *The muzzle head line is prone's (and a transition's) only* (`HEAD_LINE_MUZZLE_READING` `'prone-or-transition'`,
  D:L415457-415523): standing and crouched the head line runs along the travel (4.9 + the move, shorter than the centre),
  so the centre line stops the body -- the envelope `FUN_00286c90(+0x458)` is taken at 0 or under in the locomotion
  (reading, pending review). Standing 6.78 and crouch-walking 9.48 are the centre's (5.39, and 9.43 with the 1.75);
  prone 16.04 the muzzle's 15.94. Checkpoints 1-3 took the muzzle reach on every looped play (9.46 standing, 12.58
  crouched).
- *The crouch's run takes no 1.75* (`CROUCH_RUN_FLAG_READING` `'set-while-running'`): the crouched forward 1.75 wants
  `+0x21c` bit 2 clear (D:L415356-415358), so the bit is read set while the crouch runs (the stance word crouched, the
  standing run playing) and clear crouch-walking.
- *Backing confirms the 1.75 standing* (D:L415354-415355, the body-frame z over 0.01).
- *The settle is the 30 Hz frame's, which R8 does not give* (not built; HUMAN_TASKS H404): with the depth push the
  original settles at the reach plus a 30 Hz frame's move less 1 -- standing 5.39 + 2.17 - 1 = 6.56, backing 9.43 + 1.23
  - 1 = 9.66 exactly. Under MISSION's owner ruling R8 (movement continuous at the page's rate) the port's 60 Hz move is
  under 1, the push never runs, and the port stops anywhere from the reach to the reach plus one 60 Hz move.
- The port, headless, on the same faces (feet to the plane):

| case | the original | the port, checkpoint 4 | checkpoints 1-3 |
|---|---|---|---|
| house2 standing, full | 6.78 | 5.64 | 9.97 |
| house2 crouch walk, half | 9.48 | 9.61 | 12.64 |
| house2 crouch run, full | 5.85 | 5.81 | 10.14 |
| house2 prone crawl | 16.04 | 16.10 | 16.10 |
| house2 backing | 9.66 | 9.96 | 9.96 |
| log1 standing, full | 5.22-5.32 | 5.70 (walking 5.43) | 5.70 |
| log1 crouch walk / backing / prone | not captured | 9.18 / 9.57 / 15.79 | -- |

- *Still open:* the residuals under the reach plus the push -- the log's 5.22-5.32 and the crouch run's 5.85 -- and the
  prone drop's ~3 sideways (independent of the wall's distance, so not a wall rule by these numbers: most likely the
  stand-to-prone clip's root; owed the same drop with the wall on the body's other side). The 116 side-line prone pins
  stand until ac's prone-beside-clutter capture.

**Checkpoint 4's sweep (f9's fixed starts, base `71f8789fb` against `42c2ed2d9`, the same 12,736 starts;
`agent-mail/evidence/gameplay/segment-body-cp4/DIFF.txt`; reading, pending review).** Stuck 370 -> 410: 331 freed (stand
run 106, walk 103, crouch 93, prone 29), 371 new, 361 of them prone. Replayed headless (a throwaway copy of the sweep's
walk dumping each record and its hit; nothing kept): MP2 (381.99, 823.3), MP73 (1163.13, 1023.24), MP64 (910.13,
2560.81), MP8 (965.21, 790) and MP2 (584.37, 1193.95). **Every one is the side-line class above, the rear half**: the
prone side lines start 11.2 behind the feet (`FUN_0054aa30` D:L415586-415589 and D:L415599-415605: the feet + 1.3
`uStack_30` `FUN_00309200` -- a subtract -- `fStack_10`, the travel x 1.4 r, D:L415162-415166), so a face within 11.2
behind the body that faces AWAY from it -- the far side of a solid the body lies against or crawled off -- is crossed
from its front (research 281 §4.3), at the record's first ~15 % (t 0.07-0.24); its depth |(end - hit) . n|
(D:L413571-413585, `FUN_001b3620` a fabs) is the line's length past it, 12-15, and prone the jam holds the crawl every
tick (D:L413602-413611). One or both side lines hit, the centre and the head line none. The faces:
`worldmodel/twintanks2` (MP2), `mp73turret_2/RMG_turret`, `mossylog03` (MP64, a diagonal log beside), `land34/di_g3213`
(MP8, a kerb 7.5 deep, its far face at x 972.7) and `barrel_single` (MP2). The candidates are gathered along the
record's own two ends (`FUN_002d4780` -> `FUN_002d6800(.., start/end, 2, 1)`, D:L175760), so a face behind the body is
in the original's query too. Nothing in the records' build departs from the decompilation (re-read here: the class
D:L415113-415133, the direction and side D:L415134-415230, the prone records D:L415582-415625, the turning line
D:L415701-415788 and `FUN_0054ecd0` D:L416974-417027); no constant is changed or added.
- *Two shapes*, over the 325 distinct new prone pins (DIFF's 361 counts repeated starts; 12 more stop short of the edge,
  not replayed). 151 never leave the start (past -6 to the edge, 120 wall ticks; three replayed): the sweep's fixed
  starts are walked without its `startStuck` filter (`OBF21_STARTS`), so a start the head would itself skip is walked,
  and the probe sets the stance without the prone gate -- the port's `proneRefused` (`FUN_00552ec0` D:L418935-418940,
  `PRONE_GATE_READING` 8.0 behind) refuses four of the six such starts asked (both MP2 ones, MP73, MP51; MP64, the log
  beside the body, and MP12 pass; MP12's and MP51's hits not dumped). 162 walk off the edge and are held past it (most
  0-3 past, at its foot; two replayed): the solid they crawled off (a kerb, a barrel) is under 11.2 deep, so its far
  face lies within the rear half once the feet are below its top.
- *'short' on MP71 (11 -> 51) and MP81 (0 -> 8)* is not this: every stance, with no wall tick; the disc stopped 2-7
  short on its own contact and the segments reach the edge (past about 0), where the floor's step rule holds the body.
  Not re-judged here.
- Pinned (the reading, not a capture): `segmentBody.test.ts` "the prone side lines start 11.2 behind the feet" (a face 9
  behind facing away holds the crawl; 12 behind, or facing the body, does not) and "MP8's kerb" (dev-disc). A temporary
  build starting the lines at the feet turns both held cases red (the crawl goes 22.0 and 15.99). Owed with ac's
  prone-beside-clutter capture: a prone SEAL crawled off a kerb under 11.2 deep, and one crawling away from a crate
  behind its feet.

**The fence behind the feet (ac's capture of M51's `worldmodel/noreg_343344/g15582`, 2026-11-03T01:36-03:03Z; capture comparison,
PCSX2 r0004, 3 trials each, all identical; `agent-mail/evidence/eph-hunt-2026-11-01/segment-body/results/SEGMENT-BODY.md`,
"For 6d", "01:36Z" and "02:56-03:03Z").** The fence is two faces in the plane x 5401.0, wound opposite ways (polygons
0-2 facing -x, toward a body west of it; 3-5 facing +x, away); a slanted slab that at z 2330 spans y -113.6..-94.6 over
feet at -107.9. The body stands west of it facing -x (yaw 90), away from it.
- *The prone gate is proven at 8.0 behind.* Standing 7.00 / 7.50 / 7.75 u from the plane (measured the frame before
  the press) the press is refused (posture 0, action 1, no stand2prone); at 8.00 / 8.25 / 8.50 u it is taken. The limit
  lies between 7.75 and 8.00: `PRONE_GATE_READING`'s 8.0 behind (`FUN_00552ec0` D:L418935-418940 through `FUN_0054d620`)
  is **proven** on this fence. The 11.2 ahead and the feet + 3.25 were not varied and stay a reading. The port, headless:
  refused at 7.00-7.99, taken from 8.00 (`segmentBody.test.ts`, "M51's fence g15582" (a)).
- *The back-crawl stops at 12.47.* Prone at 13.20 u, the stick full back 4 s: the original moves 0.73 u and holds at
  **12.47 u** for the rest (action 27, no movement). Backward the travel `fStack_10` points at the fence and the prone
  centre line reaches 1.1 x 1.4 x 8.0 = 12.32 along it (D:L415113-415166, D:L415401-415433); it meets the -x face from
  its front, deeper than 1, and prone the jam keeps the body where the tick began (D:L413602-413611). The port,
  headless, the same start: moves 0.733 u within its first 11 ticks and holds at **12.467 u**, one hit, the centre line on
  g15582's -x face -- the capture to 0.003 (`segmentBody.test.ts` (b), ±0.3).
- *The forward crawl is free from every start the original allows.* From 12.47 u the original crawls 33.01 u in 3 s
  (to 45.48); the port 32.82 u (to 45.28). Forward, the prone side lines' rear half starts 11.2 behind the feet
  (D:L415586-415605), 1.27 short of the plane. Every reachable start is past 11.2: the gate refuses below 8.0, the drop
  from 8.0 leaves 11.52 (8.25: 11.79, 8.50: 12.04; 9.5: 13.20), and the back-crawl stops at 12.47.
- *The held-forward case is unreachable on this fence.* A prone body 9-10 u in front of the fence's +x (away) face --
  the side lines' rear half crossing it and the jam holding the forward crawl (the reading above, "Checkpoint 4's
  sweep") -- cannot be set up from standing or by crawling; this capture neither confirms nor refutes it. Owed still:
  a prone SEAL crawled off a kerb under 11.2 deep (MP8's case).
- *The stand-to-prone drop's root travel, against the port (not changed here).* The original's drop is the clip's own
  travel: at the fence (from 9.5 u) |3.924| (dx -3.705, dz +1.293), on open ground (house2, facing +x) |3.865|, the
  mirror; the path about 0.6 back and to one side over the first 4 game frames, about 3 forward (the largest steps
  0.6-1.1 a frame), then sideways drifting back, 26 game frames. The port with `MOTION_P.ZAR`'s `seal_stand2prone` keys
  (`Walker.actionRoots`), headless: on open ground (house2's spot, and 30 u from the fence) |3.697| (3.352 forward, 1.561
  sideways), the same shape over 28 game frames (back 0.75, the peak sideways 4.35 at frame 15, the capture's 4.31 at
  frame 11; the largest step 0.78). At the fence the port's drop is **|4.325|** (4.069 forward): the stance word is prone
  from the press (`changeStance`), and the body does not move for its first 8 ticks -- the clip's back steps, toward the
  fence, which the prone centre line's 12.32 crosses from 9.5 (the likely cause, not traced here) -- where the original
  takes them (+0.59 toward the fence) -- so the port's drop leaves the feet about
  0.47 further out than the original's: 12.01 / 12.26 / 12.51 from 8.00 / 8.25 / 8.50 (the original 11.52 / 11.79 /
  12.04) and 13.57 from 9.5 (13.20). Two departures, reported, not changed: the open-ground total (3.70 against 3.87)
  and the records cast during action 25 (the original's records in a transition, D:L415457-415523's transition arm,
  and which stance word they read during stand2prone are not settled here).

**The crouch run's release (LATER 678; `CROUCH_RUN_RETURN_READING`, research 101; capture comparison of ac's r0004
house2 capture, `agent-mail/evidence/eph-hunt-2026-11-01/segment-body/cases/out/house/probe.csv`, case house-crouch,
trials 2 and 3, identical; `results/SEGMENT-BODY.md`; reading, pending review).** Feet to the plane x 5425: the crouch
run rests at 5.85 (action 2, the stick full, to 6605 ms); the stick is let go at 6638 ms and 0x11 (`Stand -> Crouch`)
plays: 5.85 held for 4 frames (6638, 6671, 6705, 6738 ms), then 5.85 -> 10.85 in one 33 ms frame (6738 -> 6771 ms; an
intermediate sample of the 6738 frame reads 10.46), while the velocity logged that frame is (-4.87, -10.70, -1.62), under
0.4 u a frame -- a depth push-out, not a move; then about 2 u more to 12.80 (6905 ms) and 12.88 (7005 ms), held there to
7188 ms while the logged x velocity reads -0.3 to -4.2, and 0x12 (crouch idle) from 7238 ms.
- *The reading taken (B).* On a full-stick release the original's idle branch plays 0x11 then 0x12 (`FUN_00584c60`,
  the branch from D:L444195: a turn axis `+0x23c` (D:L444116) past 0.025 takes the turn instead, the run's bit cleared
  (D:L444196-444198); else 0x12 pushed at D:L444282, then 0x11 on top at D:L444316-444317 when `+0x21c` bit 2 is set --
  set in the run branch, D:L444145-444172, cleared in the walk branch, D:L444150, and after the push, D:L444325). During 0x11 the head line takes the muzzle
  reach (`FUN_0054aa30` D:L415457-415523, the transition clause at D:L415480 -- the 0x11 clause the branch already
  grants, `HEAD_LINE_MUZZLE_READING` 'prone-or-transition'), which reaches past the wall from 5.85, and the deep-hit
  rule (`FUN_005483d0` D:L413602-413614: two hits or fewer, the depth less 1 along the normal) puts the body out in one
  frame; the clip's root carries the last 2 u. The port's fixed crouched muzzle reach gives 12.58 (checkpoints 1-3),
  0.3 short of the 12.88.
- *Rejected: A, the clip's root carry alone.* `Stand -> Crouch`'s root moves the body about 2 u over the clip (10.85 ->
  12.80 above); it explains about 2 of the 7, not the 5.0 in one frame.
- *Rejected: B's variant on a still body* (the muzzle head line and the push-out on any still crouched or standing body,
  not only during 0x11). It would put the standing body at 8.46 and the crouch walk at 11.58 against the wall; the
  captures hold them at 6.78 and 9.48 (checkpoint 4 above). So the muzzle reach is the transition's, as
  `HEAD_LINE_MUZZLE_READING` reads.
- *The port*, headless (`viewer/test/crouchRunRelease.test.ts`, a synthetic flat wall 40 tall), before LATER 678: the
  crouch run rested at 5.81 and on the release went to crouch idle at once (`CROUCH_RUN_RETURN_READING` 'not ported'),
  no `Stand -> Crouch`, the body left at 5.81 (held as `it.fails`, "GAP (LATER 678)").
- *Built (LATER 678, 2026-11-04; reading, pending review).* `CROUCH_RUN_RETURN_READING` 'stand-to-crouch': the crouch
  run let go (the port's crouch with its posture stand: the bit), not turning past 0.025, starts `standToCrouch`
  forward at the idle branch (`Walker.locomote`) -- in SEPARATE only. The function reads no stance-button mode (the
  original has one), but OT.R93 keeps COMBINED and the bots as main has them (`stanceCutSeparate.test.ts` pins the
  bots' trace byte for byte, and built for every mode it moved from row 190), as MOVE-1 and MOVE-4 were kept (H392):
  COMBINED's and the bots' release is the owner's question. The same test, now `it` in SEPARATE: rest 5.806; on the
  release tick the transition's head line
  reaches past the wall and the body goes out to 11.58 at once; the clip's root carries it to 12.846, held after the
  clip ends (capture 12.88, within the test's 1). Two departures, named (`CROUCH_RUN_RELEASE_PUSH_READING`
  'first-tick'): the port pushes on 0x11's first tick at the crouched firepoint's fixed reach, where the capture holds
  5.85 for 4 frames and pushes to 10.85 -- the firepoint node moving through the clip; neither the delay nor the final
  value is read (owed: `actor+0x14b0` through 0x11, RDRAM). Not ported still: the run's posture word 1 (the port's
  `posture` stand through the run).

**Owed.** A capture of a SEAL walked head on into a wall (the stand-off), backing into one (the 1.75), pressed to a crate
at 45 degrees and squarely (the climb offer), crawled at a 1/4 stair, in a door's arc facing away from the leaf, in
Crossroads' slot (research 213 §3 item 2, H94), and an RDRAM read of `+0x14b0`, `+0x14bc`, `+0x458` and `+0x10ac` while
walking.
### 2.10 HF2-slim: the freeze in Crossroads' blown bridge (HOTFIX BRIDGE-WEDGE, 2026-11-03)

*Reading, pending capture, and one adaptation* (the gameplay lane's implementer; the owner's word in the controller's
seat 5d on 2026-11-02 at about 18:00Z -- the freeze hurts playtests, the fix now, ahead of the captures -- and his
"just don't want somebody running into the exploded bridge being stuck", relayed with 5d's ruling for this slim build
on 2026-11-03; Trello c22ltqhr). Transcribed and measured headless on the fixture and the disc; nothing measured on the
original running. The fuller build and its folds are `agent/hotfix-bridge-wedge` (B201: its §2.10 there records the
air push-out, the from-behind reach for MP64's log hulls and the pinned counter, none of which is here); §2.8 there
(BRIDGE-WEDGE, `agent/bridge-wedge` 040ba4de6) reads the case, §2.9 (SEGMENT-BODY, `agent/segment-body` afffacd21) the
segment body that supersedes the adaptation below.

**The case.** With `terrorist_demo_1` destroyed, a fall off the deck at (1676.4, 84.3, 1419.3), v (8.9, -84.8, 64.4)
comes over the rubble's fin (`arch=arch/destroyed`, one face on z 1422.31, its own normal toward -z, top 80.39, under the
feet where the fall crosses it) into the slot before `destroyed/dia`'s face at z 1425.33 (own normal -z), 3.02 wide,
the floor 57.6 on both sides of the fin, and on main stands at (1675.87, 57.60, 1422.82) for good: the 3.5 disc fits
nowhere in 3.02, every push out of one face crosses the other and the crossing guard (`crosses`, PF-05) refuses each.

**What is built** (`viewer/src/mover.ts`):
1. *The fall's walls at the feet the tick leaves* (`AIR_WALL_HEIGHTS_READING` `'start-and-end'`, `fall` -> `airWalls`):
   the original's frame displacement carries the fall (`FUN_0054d9a0` D:L416501-416530), `FUN_0054aa30` casts the
   segments along it (D:L415157-415166, D:L415401-415410) and `FUN_005483d0` resolves them every tick in the air
   (`FUN_005506a0` D:L417822-417826). After the tick's game frames, a move from where the tick began that crosses a face
   at the lines over the feet the tick leaves (or over the floor the tick's pick lands them on, `FUN_0059ad30`
   D:L456313-456322) is not taken -- the whole move undone, the jam branch's outcome (the body where the tick began,
   D:L413602-413611 with D:L413918), where the cited hit itself takes only the displacement's part along its normal
   (D:L413557-413567) -- and only for a face met from in front of
   its own normal, judged in three axes at the line's height (the hull's hit is one-sided, research 281 §4.3,
   `FUN_002d2890` micro 288-333); a moving owner (a door leaf) stays two-sided. Clip only: the original also pushes in
   the same tick, (depth - 1) along the deepest hit's normal when that depth is over 1.0, `bVar6` is clear (set by any
   of three action checks, actions 0x1a-0x1c, two other actions, or the stance word at 2, prone; D:L413481-413502) and
   there are at most two hits (D:L413612-413614; the depth gathered for hits the controller's vtable +0x2c accepts, D:L413569-413587), which
   the port does not build (`WALL_DEEP_REVERT_READING`, LATER 283), and the port's own radius push here fought the next
   sub-step and dropped MP61 through the world on the fuller build (its fold, 2026-11-02). The airborne sub-step's
   tick-start lines and the ground stay two-sided, as on main (LATER 620). On its own the clip does **not** free the
   slot: the fin's top is under the feet where the fall crosses it, so the body lands in the slot as on main (4 of the 6
   slot trajectories and the still drop stay wedged with the clip alone, measured 2026-11-03).
2. *The wedged body's push-out* (`WEDGE_PUSH_OUT_ADAPTATION`, `unwedge`; **an adaptation**, no line of the original
   behind it): a body on the ground within 30 ticks of a landing, already inside geometry -- its disc deeper than
   `WEDGE_CLEAR` (0.001, a tolerance) into a face at a probe line -- whose ordinary push-out (`pushOut`), or every try of
   a ground sub-step, the crossing guard refuses (never a floor refusal: no floor, a steep rise), is put once at the
   nearest free point: rings 0.25 apart up to the deepest penetration plus the radius, 16 headings
   from +x; the disc clear at both lines; reached from where the tick began and from where it stands crossing no face
   from in front of its own normal (a face crossed from behind holds nothing in the original, research 281 §4.3; a
   room's two-sided walls still hold); onto a floor the walk takes **at the body's own level**, no lower than
   `ground_touch_distance` under the feet. This is what frees the slot (all 6 trajectories and both still drops walk
   out). The own-level rule has a cost: a real wedge whose only way out is downhill or onto a lower stair tread is refused
   it and stays wedged, as on main. It stands in for the segment body's resolution (§2.9 on `agent/segment-body`) until SEGMENT-BODY lands.

**The bound** (5d's requirement, 2026-11-03). The push-out acts only on a body already inside geometry, never on a
healthy one: a body with no penetration is untouched -- held by `bridgeWedge.test.ts`'s bound blocks, value for value
identical with the push-out on and off (`on: false` is main's resolution) at every tick: spawn-slot walks on MP2, MP6
and MP72 in every stance and eight headings with a jump, and bodies dropped beside MP6's `worldmodel/g156` (polygon 1053)
and MP9's `worldmodel/land_36` (polygon 861), both sides, 0.5 to 7 off, three stances, from the floor and from 7 above,
pressed toward the face -- and a body set inside the walls by a placing (no landing) is left as on main. The review of
20c326dfb found the first slim build asking the push-out from `step` on floor refusals too: a standing body landing on
g156's hillside at a depth of 0.012 was moved 0.25 sideways and 0.39 down on its first ground tick (main stands 6 ticks
and walks on), a crouched one pressing into land_36's steep terrain at 0.089 was pushed three times; now only a crossing
refusal asks it. It never pushes a body off its floor: the review of 1c594ffa4 found MP51's `wc06/window_frame` body
(standing 0.5 off polygon 1358, on the floor at 62.83 above the face's top) pushed 4.8 off its floor into a 106 fall to
y -43; that push is now refused and the body stays at its start, as on main.

**Measured** (`viewer/test/bridgeWedge.test.ts`, 36 tests; synthetic, the MP2, MP6 and MP72 fixtures, the disc's MP1,
MP5, MP9, MP51, MP61): the slot's six trajectories and two still drops end clear and walk out in at least 6 of 8 headings; the fin and
rim synthetics; MP61 prone, MP1 prone, MP5 crouch and stand-run (the fuller build's sweep falls) land as on main; MP9's
back-face guard does not pin; MP72's `b2_wc03` prone drops stay at z 1223.07 (from rest) and never pass z 1224.5 (from
30 above with the stick held at yaw 90), as on main; the review's face drops end as on main -- MP9
`land_04/congo2_tree4` prone at (1801.22, 114.30, 1737.03), MP1 `land27/invis27` stand at (2228.66, 117.48, 2671.49) and
prone at (2227.14, 116.40, 2673.63), MP51 `wc06/window_frame` at its start. The fuller build's MP9 and MP1 regressions
came from its air push-out, which is not here; MP51's from the push-out, bounded above.

**The review's probe** (agent-mail evidence gameplay/hotfix-bridge-wedge5/probe, 2,080 starts beside tall faces on
MP72, MP9, MP1, MP61, MP5, MP64 and MP51, five scenarios each, main c15928e75 against this build from the same starts).
At 20c326dfb: at the scenarios' last tick main 58 airborne, 58 floorless, 197 more than 60 under the start; that build
68, 65 and 200, with 13 ends bad there and not on main. After the crossing-only fold (2026-11-03T02:44Z): 63, 63 and
199; 767 of the 10,400 ends differ from main (178 of the 2,080 starts); 5 ends are bad here and not on main, all at
MP9 fi 5313 (polygon 12898) side 1, bodies main leaves pinned against the face which the push-out frees while the stick
is held: prone 1.2 (push, held, high) is still falling when the scenario stops and lands on a floor given time (y
108-120); stand 0.5 (push, held) never lands while the stick is held -- it flickers on the ledge at (1810.16, 162.21,
1736.8), as main's bodies do from that ledge -- and released, it rests at y 162.21. MP64 fi 6666 side -1, stand 0.5
and 1.2 (held) are not bad ends: they fall more than 60 and end on floors (y 36.33, 42.12) (the review of f9ffb6828,
2026-11-03: 21,842 normal-play cases with no free body touched; all 338 at-rest differences from main are bodies deep
inside a face, overlap 1.62-3.5). Four of 20c326dfb's 13 finish in sealed space and are **sealed on main too, not a
regression** (main's own ends there are sealed; recorded for B201's probe baseline): MP1 fi 416, polygon 1484
`worldmodel/land42/invis42`, side -1, stand, offsets 1.2, 2.0 and 3.2, scenario push (that build's end (1438.28, 66.59,
1933.99)); MP5 fi 1048, polygon 2251 `worldmodel/g667_13`, side 1, 3.2 off, prone, scenario held (a pocket about 7
wide). None is airborne, floorless or under the map at rest.

**The cost cut** (2026-11-03, a26433f5f; f9's MP2 cells on 20c326dfb: bot step p99 9.17 -> 9.41 ms, +2.6%, 10 of 10
seeds up, the simulation bit-identical). Counted per walker-tick on MP2 walks (144 walkers x 3,000 ticks): `airWalls`
ran on 0.1065 of them and each run made its own floor pick, so floor probes (`probeGround` + `selectFloor`) went from
about 1.39 a walker-tick (main) to about 1.50 (f9ffb6828), `crosses` from 1.4743 to 1.5800. Now `airWalls` makes the
airborne tick's one floor pick and hands it to `fall`, which reuses it when the body stays put, and a still airborne
body skips the crossing test: floor probes about 1.39 again, `crosses` 1.5775 (the clip's own test). No state change:
pinned by `bridgeWedge.test.ts`'s MP2 walk hash, 813cf01c0e66e8796fa772bea2cfe9308b0741905b7a4029cbfd54e9505275bd (144
walkers, MP2's spawn slots in three stances, 1,000 ticks, hashed every 50); the review of c67092be6 re-derived that hash
on f9ffb6828's mover and, in lockstep against f9ffb6828 -- every spawn slot on 9 maps, the MP72 slot cases with
`terrorist_strike1`, and 92,736 synthetic fin falls -- found no difference.

**Freeze fixed:** MP72 with `terrorist_strike1` applied, every slot trajectory and both still drops land clear and walk
out (`bridgeWedge.test.ts`).

**Owed.** The captures of §2.11 (research 213 §3 item 2, extended; H94): a SEAL jumped into the slot behind the fin, where
it lands and whether it walks out along x and back -z through the fin, and a SEAL dropped past a face's top edge. Then
SEGMENT-BODY retires `WEDGE_PUSH_OUT_ADAPTATION`. f9's fixed-start sweep on this head.

**On the merge with SEGMENT-BODY** (main 9eba0b195 into `agent/segment-body`, 2026-11-03; the lane's ruling, 6d; an
adaptation's scope, not a reading). Which arm each map's walkers run: `WALL_BODY_READING` is one constant, `'segments'`,
for every `Walker` on every map -- the players' and the bots' (the match's `matchBots.ts` imports it) alike; no map
selects the `'disc'` arm, which is kept only as the switch's other arm for measurement (§2.9). On the segment path the
segment body's one-sided hull hits carry the bridge case (research 281 §4.3: in the slot the segments along x meet
nothing, and -z they cross the fin from behind, no hit; §2.9's Crossroads rows): `fall` resolves the tick's whole
displacement through the segments and does not call `airWalls`, and `move` / `step` never consult `crosses` or
`pushOut`, so neither the air clip (item 1) nor the push-out (item 2) acts there. HF2-slim -- `AIR_WALL_HEIGHTS_READING`'s
`airWalls` (this section's version, main's, not BRIDGE-WEDGE's earlier one of §2.11) and `WEDGE_PUSH_OUT_ADAPTATION`'s
`unwedge` -- acts only on the `'disc'` arm. `WEDGE_PUSH_OUT_ADAPTATION` stays defined and is not retired here; its
retirement is its own reviewed step. The owner's condition (nobody running into the exploded bridge stuck) is held on
the segment path by main's `bridgeWedge.test.ts` slot cases, run against the merged mover; SEGMENT-BODY's own
bridge cases are `segmentBridgeWedge.test.ts`.

### 2.11 The walls in the air, and Crossroads' rubble slot (`AIR_WALL_HEIGHTS_READING`; BRIDGE-WEDGE, 2026-11-02)

*Superseded in the code by §2.10's HF2-slim* (the merge of main into `agent/segment-body`, 2026-11-03): this was
§2.8 on `agent/bridge-wedge` and on this branch before the merge (main's §2.8 is the near-vertical floor). Its
reading of the case and of the jam rule stands; its "What is built" -- the two-sided slide and push in `airWalls` --
is not in the tree: the disc arm runs main's front-face clip (§2.10), the segment arm no `airWalls` (§2.9).

*Reading, pending review* (the gameplay lane, on Trello c22ltqhr; transcribed from the decompilation and measured on
the fixture's MP72 headless; nothing measured on the original running).

**The case** (the playtest's replay `game_MP72_3201/2026-11-01T23-02-46.321Z.s2r`, player 6, ticks 95040-95116, read
with the match package's replay reader): `terrorist_demo_1`'s arch destroyed, a running jump off the deck at y 89.5
comes down at (1676.4, 84.3, 1419.3), v (8.9, -84.8, 64.4), and from tick 95116 stands at (1675.8, 57.6, 1422.8) for
the next 150 s, jumping in place. The port's `Walker` on the fixture reproduces it to the hundredth (1675.87, 57.60,
1422.82). The place is a slot along x (about 1658 to 1694) between the rubble's fin (`arch=arch/destroyed`, a single face
on the plane z 1422.31, its own normal toward -z, no floor on its top, its top 80.5 at x 1676.8) and `destroyed/dia`'s
face at z 1425.33 (normal -z), 3.02 apart, the floor 57.6 on both sides of the fin.

**The reading.**
- *The displacement carries the fall.* In `Jump launch` / `Jump fall` (actions 8, 9), or `FUN_00588030`, or the action
  `DAT_003def08`, `FUN_0054d9a0` sets the body's local velocity to (0, -`+0x133c`, 0) -- the fall speed, up as positive
  (D:L416501-416514) -- turns it to the world through the orientation `+0x70` (D:L416515), and writes the frame
  displacement `+0xf44..+0xf4c` as it times dt (D:L416520); airborne, the carried velocity `+0x1350`/`+0x1358` times dt
  is added across (D:L416524-416530). So `+0xf48` is the fall's vertical step.
- *The segments run along it, from the feet as they are.* `FUN_0054aa30` normalises `+0xf44` in three axes for the
  direction (D:L415157-415166) and casts the centre from the feet + `step_height` to the feet + the reach along that
  direction + `+0xf44`, the same lift at its end (D:L415401-415410 and the lift at the two `fVar22` adds after them);
  the head line and the fan alike (§2.1). A falling body's lines slant down along its path; a steep fall shortens their
  reach across (the direction's horizontal part).
- *Every tick, in the air too.* `FUN_005506a0` runs `FUN_005483d0` and then the ground probe `FUN_005b0840` on every
  tick of a body (D:L417822-417826), with no airborne exception; the new position is the matrix's translation plus
  the resolved displacement (D:L413918).
- *The jam rule* (D:L413602-413611). When the deepest hit is over 1.0 and the body is in a prone action or has more than
  two hits, `+0x70..+0x7c` is copied back from `+0x50..+0x5c` and the displacement zeroed. `+0x70` is the orientation
  quaternion, not the position: `FUN_0054d9a0` starts it from `+0x50` and composes the tick's turn into it
  (D:L416479-416490: the turn `+0x44` times dt / 2 made a quaternion and multiplied in), `FUN_00307170` makes the matrix from it (D:L413956), and `+0x50` is saved from it at the end of
  each solve (D:L413959-413962). So the jam leaves the body where the tick began (translation + 0, D:L413918) with
  the last tick's facing: the saved position that wins is the tick's start. Otherwise the displacement takes the
  deepest hit's depth less 1 along its normal (D:L413613-413614). (§2.3's deep-contact bullet calls the copy "the
  position saved at the end of the last solve"; read here, it is the orientation, and the position is unmoved because
  the displacement is zero. The outcome is the same.)

**What the reading says of the case.** The fall crosses the fin's plane on the tick its feet go 84.3 -> 81.2 (lines
90.8 -> 87.7): the fin's top, 80.5, is under the feet, so no segment meets it (they start at the feet + 6.5) -- the
original comes over the fin too and lands in the slot, at this reading. What differs is the slot: the original's
body is its segments and a hull hit is one-sided (research 281 §4.3), so in the slot its lines along x meet nothing
(or dia's face from in front, which takes only the move's z), and -z its lines cross the fin from behind, no hit;
it walks out. The port's disc of 3.5 cannot stand in 3.02, every push out of one face carries the centre across the
other, and the crossing guard (`crosses`) refuses each: it stands. That is LATER 283's (the segments as the wall
probe) and the port's two-sided face contacts (LATER 620), not the airborne heights.

**What is built** (`mover.ts` `fall` -> `airWalls`, `AIR_WALL_HEIGHTS_READING = 'start-and-end'`): every airborne tick,
after the tick's game frames, the walls again at the lines over the feet as the frames left them: the tick's move from
where the tick began that crosses a wall at those lines is not taken (the airborne sub-step's guard), then the body is
pushed out as `slide` pushes, from where the tick began, unless that push crosses a wall or leaves the floor the tick's
pick would find. A still airborne body is resolved too (`pushOut` still returns in the air; `airWalls` stands in). The
crossing guard is kept: the jam rule's trigger is the segments' depth and hit count, which the port's disc does not
have (§2.3; LATER 283, measured 2026-10-22: the branch on the disc stuck MP72's emb01 step-down and froze a body placed
deep). Its outcome where it fires -- the body where the tick began -- is what the guard's refusal gives.

**Measured** (`viewer/test/bridgeWedge.test.ts` on this branch then, `segmentBridgeWedge.test.ts` since the merge; synthetic and the MP72 fixture): a fin 20 tall crossed on the tick a
frame drops the low line from 21.5 to 18.24 -- the body stays on its side and lands 3.5 off (was: 0.5 past the plane,
landed behind); a fin 8 tall, under both lines, is passed over (both); a still airborne body 1 off a fin is put out to
3.5 in the air on the tick its line drops under the top (was: at its landing). Crossroads: unchanged -- the fall still
lands in the slot (1675.97, 57.60, 1422.82), as the reading says the original's does; the walk out of it is held
skipped under LATER 283.

**Not changed by r0004** (OT.R97; the r0004 investigation's movement-constants cluster, items and §2): `FUN_0054d9a0`
and `FUN_0059b440` change by the struct's 4-byte shift only; `FUN_005483d0`'s hit filter skips walkable normals and the
two material bits as r0001 does, with one exception added (a knocked-down body keeps walkable hits, item 14) -- the
jam rule is not listed as changed; `FUN_0054aa30` adds a turret-mount flag clear and re-orders its segment code, its
constants the same, **not read in full** there (a gap: whether the segments' build differs is not settled). r0004's
MP72 collision patch adds 16 polygons, none at the slot (the nearest a floor at y 121 over x 1686-1706, z 1356-1446,
above the deck; `scratch/pmc/transcription.json`).

**Owed.** A capture (research 213 §3 item 2, extended; H94): on the original, with `terrorist_demo_1` destroyed, jump
off the deck's railing into the slot behind the fin (from about (1667, 89.5, 1354) running +z), record where the SEAL
lands and whether it walks out along x and back -z through the fin; and a SEAL dropped past a face's top edge (the
synthetic fin's case). LATER 63 (the bridge's blast damage) is unchanged and still open.


## 3. The peek and the room's order (PF-20)

Ruling PF.R39. Sources: research [180](180-c2-movement-body-camera.md) §1.12-§1.13, [181](181-c3-combat-hud-effects.md)
§2.10, [201](201-r2-c2-movement.md) §10, [211](211-the-weapon-swap-by-state.md) §2 (the owed order). Code:
`packages/viewer/src/traversal.ts` (`stanceButton`'s peek branch, `leanTick`, `leanClipOn`), `net/moverSim.ts`
(`prepare`'s order, `stance`), `walk.ts` (`setStance`), `grenade.ts` (`stance`), `mover.ts` (`TraversalHooks.leanClipOn`,
the snapshot's `leanClip` -- nothing in `changeStance`).

### 3.1 A stance press under a held peek

The three presses -- prone `FUN_00581660` D:L442436-442477, crouch D:L442540-442575 -> `FUN_005817d0`
D:L442479-442524, stand -> `FUN_00581c10` D:L442605-442648 -- each pop the stack to depth 1, set the peek byte
`+0x375 = 2` and call the transition with the state taken before the pop, 3. Their cases are 4/0/1 (`FUN_00581540`),
4/0/2 (`FUN_005817d0`) and 7/4/2/1 (`FUN_00581c10`): none has 3, so no transition clip plays and the SEAL is left in the
stance under the peek (research 180 §1.12). As built: under a held peek the press goes to the peek
(`WalkMode.setStance` and `MoverSim.stance` ask `TraversalHooks.stanceButton` when `peeking()` is set, as they do for a
hang), which pops the lean, keeps its clock and clears the lean's read (`+0x375 = 2`); `Walker.changeStance` is never
asked, so the stance and the action slot are as they were (`PEEK_STANCE_ENDS_PEEK_READING`, re-documented: until now
the transition played first).

With the d-pad still held, the next frame's gate (`FUN_005b4340`) takes the peek again at once (research 180 §1.12):
in the original a stance press while holding the peek flickers the lean. The port keeps the pop and the re-push one
tick apart -- the press's own tick takes no lean, the next re-peeks -- and draws the press's tick from the held key, the
camera's eased peek (`cam_peek_decay_rate` 6) kept on its side and the mover held as the peek holds it (the stick
zeroed on that tick: no step between the pop and the re-push), so nothing visibly flickers (PF.R39). The re-push is the
same peek's and asks no start-from-still test (`FUN_0057d810` has none; the port's still test is for a new peek). Two
stance presses in one tick on the page are both the peek's (`WalkMode.setStance`): the room takes the command's one. The re-peek
resumes the lean clip at the key it was held on (`PEEK_REPUSH_KEY_READING = 'held'`); whether `FUN_0057d810`'s re-push
replays the rise (key 0) is the original's possible flicker, owed the capture 180 §1.12 names (PINE: `actor+0x174`,
`+0x375`, `actor+0x534` per frame during a prone press with the d-pad held). A released d-pad drops the popped lean;
the same press then changes the stance as ever. Tests: `traversal.test.ts` "a stance press during a held peek ends the
peek and plays no transition, the stance unchanged (...)"; the gate rows of §3.5.

### 3.2 A still reload mid-peek: it plays over the lean

`FUN_005b4340`'s code-3 path (D:L469305-469520) has no posture-3 refusal (3 is refused for code 4, the swap, only;
research 201 §10), so the reload is accepted. `FUN_005a82e0` D:L462925-462928 pops to the base only
`if (bVar3 && cVar1 == cVar7) FUN_0058a4d0(actor, 0)`: `cVar1` is the SEAL's `+0x174` (D:L462833), 3 while peeking, and
`cVar7` is `FUN_0057dc20` (D:L440540), which walks down the stack and returns the first posture that is **not** 3 -- so
mid-peek the two never match, nothing is popped, and the reload is pushed over the lean in posture 3
(`FUN_00588bc0(actor, clip, cVar1, 0, 0)`): the SEAL stays in state 3 with the reload played over the lean. Research
180 §1.13 read it backwards (retracted there by PF-20's review, 2026-10-05; the controller's ruling: the decompilation
wins over the brief and PF.R39's reload clause). As built: a reload, still or not, runs over the held peek as the
lean's toss does (`PEEK_HOLD_CONTINUES_READING`, restored in full); the peek, its key and the camera hold through it.
Not read: whether `FUN_00588bc0`'s mapped-type pops (D:L446070-446240) catch a reload's type. Test:
`traversal.test.ts` "a still reload taken mid-peek plays over the lean: the peek continues, state 3 kept (...)". Owed: a
capture of R pressed mid-peek, crouched (`+0x174` and the top anim id per frame).

### 3.3 The lean toss

`GetThrowAnim` (D:L441773-441796): with `body+0x174 == 3` the side comes from the clip playing -- 0x1e / 0x20 (`Peek
right`, `Crouch peek right`) the right toss, released at 0.55 (0x3f0ccccd); 0x1d / 0x1f the left, at 0.87 (0x3f5eb852);
neither playing returns 0 and there is no throw. No magnitude is tested (research 181 §2.10). As built:
`GrenadeThrower.stance` reads the body's peek (`snap.peek`, `Traversal.peeking`: state 3) and its lean clip
(`snap.leanClip`, `TraversalHooks.leanClipOn`), never the camera's eased value (the source's `peek()`, still wired by
`main.ts`, is no longer read for the throw); state 3 with no lean clip, or a prone lean (0xe9 / 0xea, neither of
0x1d-0x20), throws nothing and draws no arc. `PEEK_THROW_READING` (0.5) is retired. Test: `grenade.test.ts` "the lean
toss is thrown when the body is in state 3 with its lean clip playing (...)". The room's `throwGrenade` keeps its
launch check (`throwLaunchAllowed`, a standing body allowed the 300 toss's family); it refuses no throw by the peek.
**Owed, not built:** the room cannot refuse a throw from a prone peek, or from state 3 with no lean clip, at the
command's frame: `AimFrame.peek` (`shotCone.ts`) is the camera's eased value (`Traversal.peek`), not the body's state, so
a body-peek field on `AimFrame` (the peek held and the lean clip, recorded per command) is owed -- ruling PF.R36's area
(`AIM_FRAME_BODY_PEEK_READING`, *note only*). Not a regression: the room refused none before.

### 3.4 The room's press order: the lean after the stance

The update reads the d-pad (`FUN_00594cf0` D:L453431-453458: `+0x375 = 2`, then 1 / 0xff by the held side and the side
ray `FUN_00596d60`) after the stance (D:L453331-453430), research 211 §2's owed item. The press's pop of the peek is not
the update's: the per-tick applier `FUN_00552d60` (D:L418875) runs the stance function after the read, and the re-push
waits for the next frame (corrected by PF-20's review: the first text had the pop clear the lean before the read). As built: `MoverSim.prepare` reads
a command's lean after its stance (`ROOM_LEAN_ORDER_READING = 'after'`; it read it first, before the jump), so a
stance and a lean on one command end the peek before the lean is read again; the page's `WalkMode.setStance` reads its
held lean after a stance press under a peek the same way. Without it the pop's cleared read would last through the
press's tick and the re-peek would replay the rise -- the mutation `moverSim.test.ts` and the room's gate row catch.
Test: `moverSim.test.ts` "the room's press order is the jump, the Action, the swap, the zoom, the stance, then the
lean (...)".

### 3.5 The gate rows (ruling PF.R35)

One `GateInput` member, `{ kind: 'peekStance', side, to, observe }` (the lean held `PEEK_LEAD` = 60 ticks, then the
press with the lean still held), with `peekOutcome`; two rows, run by `bodyGates.test.ts` (the page: `WalkMode.lean`,
`setStance`) and `roomGates.test.ts` (the room: `LeanLeft` / `LeanRight` on every command, `Stance` on one):
`stance press under a peek` (standing, right, to crouch: `peek ended, stance kept` -- at the press's tick the peek is
off and the stance standing) and `lean after stance in one tick` (crouched, left, to prone: `lean next tick` -- the
peek back the tick after, from the held key, the stance crouched). A mover rule: no room code of its own (PF.R35).

## 4. The bodies (PF-21)

Ruling PF.R45. Seven small facts research 179 C1-E and 180 §1 read; each built on the page and in the room, the room
by the same headless code (`net/deaths.ts`, `equipment.ts`, the shared `Walker`).

### 4.1 The crawl deaths (`DEATH_NAME_PLACEHOLDER`, retired)

`damanim.rdr`'s BODY_DEATH_ANIMATIONS STAND list names "Die", "Death02", "Crawl death01" and "Crawl death02", which
no clip carries by name; `animset.rdr`'s `GLOBAL` set (the Seal anim set includes it) maps them to
`death_stand_chest01`, `death_stand_chest02`, **`death_stand_groin02`** and **`death_stand_groin01`** (research 179
§11.2, disc data). The port's list read the last two in the clips' order, so the 7th and 8th entries were swapped:
`deaths.ts` `BODY.stand` now ends `groin02, groin01`. The uniform draw's spread is unchanged; a seeded draw (the room's)
now plays the clip the original's index would. Pinned against the fixture: `remoteDeath.test.ts`, "damanim's STAND BODY
list: ...", which resolves each name through `GLOBAL` and reads the room's draw at each eighth. Not changed here: the
disc's CROUCH list has three entries (`back01`, `chest01`, `chest02`), the port's two -- outside PF-21's row, said.

### 4.2 The launcher's raise (`LAUNCHER_RAISE_READING`, resolved)

`FUN_005a6d30` (D:L462097-462133) takes the launcher anim set (`DAT_0044d408`) and pushes "Rifle -> Launcher"
(`seal_rifle2launcher`, 35 keys) from the rifle or "Pistol -> Launcher" (`seal_pistol2launcher`, 24 keys) from the
pistol; `FUN_005a6b70` (D:L462045-462092) lowers with the same clip reversed. `motion.rdr`: playback 1.5, `NoFire`,
`NoInterrupt`. By the one-shot's law (`oneShotSeconds`, `FUN_0028c4f0`): **1.5 x (34/35)^2 = 1.4155 s** and **1.5 x
(23/24)^2 = 1.3776 s** (research 179 §11.15). Built: `equipment.ts` `LAUNCHER_RAISE_CLIPS`, `launcherRaiseSeconds(from)`,
`launcherLowerSeconds(from)` and `launcherRaiseFrom(table, clips, from)` (the disc's), pinned to `motion.rdr` and
`MOTION_P.ZAR` by `equipment.test.ts`; the room's `raiseLauncher` takes the firearm in hand (`p.sim.weapon`) and
`lowerLauncher` the firearm named (`p.records[0]` the rifle); the page's `RocketLauncher.selectSlot(slot, from)` (the
rifle by default). The rocket is held for the whole clip (its `NoFire` bare; the one step 179 names). The old name stays
as the rifle's length, an alias, because the held `main.ts` reads it (`firearmReadyAt` after a lower, `main.ts:607`) --
wiring owed (§4.8).

### 4.3 A corpse lands `Land forward`

`FUN_005af590` D:L466658-466660 forces the landing class to 3 when the body's alive bit (`+0xe1` bit 4: set by the node
constructor `FUN_0029ee10` D:L145030, cleared by the death `FUN_00547af0` D:L413024) is clear, and class 3 over the hard
rate `DAT_0044c260` (115) pushes `Land forward` (D:L495332) -- so a corpse never draws the heavy coin and never lands
`Hit` (research 180 §1.8). The port's `Walker.land` gave a corpse `Hit` (a fixed draw both ends could hold, review 3
A2); it now gives it `landDeath` over the hard rate whatever the speed's class, on both ends (the page's locked walk and
the room's `Room.corpse` tick the same `Walker`), and holds it at its last key (`Walker.dead`). The `landing.cls` record
stays the speed's class (the page's "falls to their death" line reads class 3 of the living). Under the hard rate the
corpse lands as the living do. `LANDING_HIT_DRAW_READING` re-documented: the coin is newlib `rand()` per console, the
original shares none, the command's seq is the port's adaptation, the living's alone. `DEATH_LANDING_GETUP_PLACEHOLDER`
is kept by name, re-documented as the page's own (the free walk's get-up; the original always dies in that landing).

### 4.4 The prone root (`PRONE_ROOT_READING`, retired)

`seal_prone`'s `skel_root` y is **2.1680 = 555/256** at every key (`seal_fp_prone`, `seal_p_prone`,
`seal_headlooks_prone` the same), the convention checked on the standing and crouched idles against the console dump;
`FUN_0029a950`'s ramp floor 2.169155 sits 0.001 over it (research 180 §1.2). `mover.ts` `PRONE_ROOT` (was 1.8). With no
posed root -- the page before the pack and the room's shot cone (`rootY(posture)`) -- the prone camera's target is now
2.168 + 5.5 = 7.668 (the ramp's least: the root is under its floor), the value the posed root already gave
(`movement.stance.prone-root`, drift -> reading). Both ends move together: `headPoint` and the page's camera read the
same `rootY`.

**The camera fallback's rate (`ROOT_RATE_READING`).** Research 180 §1.10 proposes `seal_stand2crouch`'s 0.900 s (27 keys
at 30 a second): 6.64 a second. That leaves out the clip's `motion.rdr` playback (0.65); the port plays the clip in
0.65 x (26/27)^2 = 0.603 s (`ACTION_SECONDS.standToCrouch`, pinned to the disc). The fallback takes the port's own
length: (11.484 - 5.504) / 0.603 = **9.92 a second** (was the estimate's 29.9). A fallback with no original
counterpart, kept a reading; the dispatch's 6.64 not taken. **Recorded as PF.R45's note (the controller, 2026-10-06,
on PF-21's review, the reviewer agreeing): the camera's fallback root rate is 9.92 a second**, not research 180
§1.10's 6.64.

### 4.5 The prone volumes and the body box (`PRONE_HEIGHT_READING`, resolved)

The original has no prone height (research 180 §1.4): its prone body is the size class `FUN_0058a720(actor, 1)` = 2
with `bVar5`, radius 8.0 and height **6.0** (`FUN_0054aa30` D:L415119-415122), the posed skeleton under it (rshoulder
3.891, head 3.637), the posed capsules the room already builds (`skeletonVolumes`). Built: `stature.ts` `PRONE_HEIGHT`
= 6; the placeholder prone capsules (`hitVolumes.ts`, the fallback without a skeleton) laid at the class's half, 3.0
(where its probe stands, D:L415231-415233), every one within 0..6; `traversal.ts` `BODY_TOP.prone` 6.0 (the water
ripple's box). The old name is an alias of `PRONE_HEIGHT` so the held `main.ts` (`:95`, `:2272`, the water effect's
height) reads 6.0 with no edit there.

### 4.6 The flinch gate (`FLINCH_GATE_READING`, re-documented)

`FUN_005a2690` (D:L459887-460017; research 179 §11.4) refuses a flinch while `Fall forward` / `Fall backwards` play, in
states 5 (the ladder), 8, 9 and 10, during the three long hits, during a weapon switch (`FUN_005a7980(actor, 1)`: the
swaps 0x35-0x37, the launcher raises, the turret mounts, a pending `+0x1e4`), on a turret, over a motion flagged 0x40,
with the alive bit clear -- and **not** over a jump, a climb or a landing (it pops the stack to its base kind and
pushes itself). The port's "ground play only" refused all of those. Built: `deaths.ts` `flinchRefused(body)`, one
predicate on three call sites -- the room's `flinch` (at the start, with the launcher's raise and lower on the player's
clock: `heldReadyAt` / `firearmReadyAt`), the page's own body (`WalkMode.snapshot`) and the others' (`stepFlinch`), each
frame. Refused: dead; a ladder or a hang (the traversal clips naming `ladder` or `hang`); the knock's falls and
landings (`fallForward`, `fallBackwards`, `landBackwards`, and `landDeath` -- a living body online plays it only as the
forward knock's landing); the heavy landing's `hit` and `hitStomach` (they are the long hits `Hit01` and `Hit stomach01`
-- so of "the landings" the soft and hard ones take a flinch, the heavy one's hits do not); a swap, full-body or the
moving overlay; a launcher raise. Allowed: the jump, the launch, the fall, `land` and `landHard`, the get-ups, the stance
transitions, the climbs and the step-up, the peek. Over a transition the flinch is drawn whole-body
(`FLINCH_LAYER_PLACEHOLDER`) and the mover's action is not ended: the transition's clock runs on under it, and the body
is back in the transition's pose when the flinch has played. A page does not know another's launcher raise; the room
gates the start, so no such flinch reaches it.

**Owed (PF-21's review, 2026-10-06):** (1) a pin that a REFUSED flinch sets no reload window -- `roomReloadLock.test.ts`: a hit during `swapStand`, then `flinchUntil` unchanged and the reload taken (the room's `flinch()` gates before `flinchState`; nothing pins the order) -- *Done 2026-10-10 (`ccr-ef8214e9-7mkm9s`, pending review): pinned in `roomReloadLock.test.ts`.* (2) `FLINCH_REFUSING_ACTIONS` does not list PF-19's `proneCover`, so a nonlethal hit during Prone cover's 3.78 s plays a flinch over it on both ends and PF-18 holds a window for it; `FUN_005a2690` does not name Prone cover and whether it carries motion flag 0x40 is unread -- harmless (the cover already refuses the reload and the round), a read owed.

### 4.7 The flinch's stance row (`FLINCH_STANCE_READING`, re-documented)

`FUN_005a0270` (D:L458733-458785; research 179 §11.6): the row is the state's stance, but while one of the stance-change
motions 0x11 (stand / crouch), 0x13 (crouch / prone) or 0x19 (stand / prone) plays in the first half of its play
(phase under 0.5, or over 0.5 reversed) it is the change's origin (L458746-458775); the `+0x1060` bit 4 forces prone
(L458777). Built: `deaths.ts` `flinchBodyOf(walker)` (the posture and, from `Walker.action`, the transition's ends and
phase: a reversed clip's runs 1 to 0, its origin the forward clip's end) and `flinchStance(body)`; `flinchClip(part,
body, random)` takes a stance or a body; the room's `flinch` passes the victim's mover. The stance word is the new one
at the press (`Walker.changeStance`), so a hit 0.1 s into Stand -> Crouch drew the crouch row; it now draws the stand row
until 0.30 s (half of 0.603). Not built: the `+0x1060` bit (no port counterpart), states 7-10.

### 4.7a A stance press inside a long action (a capture note, pre-existing)

Found by PF-21's review, not changed here: `Walker.changeStance` sets the stance word at once and starts a transition
clip only when no action holds the mover (`this.action_` null or the fall) and the body is on the ground. A press
taken while a long action plays -- the heavy landing's `hit` / `hitStomach` (up to 3.4 s), a get-up, a swap -- changes
the stance with no transition: the body is in the new stance when the action ends, never seen getting down. What the
original does then is unread (`FUN_00552d60`'s request is kept while an action holds, §1.4's
`STANCE_REQUEST_RETRY_READING`, and may run the transition after it); owed a capture: a stance press during `Hit01`
after a heavy fall and during the standing swap. The flinch's row (§4.7) reads such a change as no transition (the
posture at once).

### 4.8 Wiring owed in the held `main.ts`

Nothing in `main.ts` must change for PF-21 to hold: `PRONE_HEIGHT_READING` and `LAUNCHER_RAISE_READING` stay exported
as aliases (6.0; the rifle's 1.4155 s). Owed when `main.ts` is open: `main.ts:95` and `:2272` take `PRONE_HEIGHT`;
`main.ts:607` takes `launcherLowerSeconds(<the firearm taken back>)`; `main.ts:1045`'s `rocket.selectSlot(slot)` passes
the firearm in hand (`walk.weapon()` or its equivalent) so a raise from the pistol waits 1.3776 s on the page as the room
does (today the page waits the rifle's 1.4155 s, longer than the room's: never a refused rocket). Then both aliases go.
*Wired (sprint 28 wave 4, 2026-10-06): the firearm in hand is the kit's item (`kitItem`, 'pistol' -> 1), for the raise
and the lower; both aliases removed (the server tests drive `launcherRaiseSeconds(0)`). PF-20's dead `peek` wiring into
`GrenadeThrower` (§3.3) deleted the same day.*

### 4.9 The gate rows (ruling PF.R35)

One `GateInput` member, `{ kind: 'flinchDuring', press, after }` (PF-18's `flinch` is the reload-in-a-flinch kind) (a stance press or a swap to the pistol, then a flinch asked
`after` ticks in), with `flinchRowOf(clip)`; three rows, run by `bodyGates.test.ts` (the page: `WalkMode.setFlinchPose`
drawn or not, its row by `flinchStance(flinchBodyOf(walker))`) and `roomGates.test.ts` (the room's `flinch`, the event's
clip's row): `flinch 0.1 s into stand -> crouch` (`flinch from stand`), `flinch past half of stand -> crouch` (`flinch
from crouch`), `flinch during a swap` (`no flinch`).

## 5. PF-39 closed (ruling PF.R46)

The swap asked during a stance change landed in sprint 25 with the swap layering (research 211 §6 G4/T5): nothing
refuses it, the stance word is already the new one (`Walker.changeStance`), and the selector reads it
(`mover.ts` `swapWeapon`; `room.test.ts`, "a swap asked during a stance change is taken: the new stance's clip (206 A27;
the plan's PF-39)"). Its point was spent there; sprint 28 builds nothing for it. Two questions remain, note only:
which of the swap clips 0x35 / 0x36 / 0x37 the original plays while `+0x174` is mid-transition
(`SWAP_IN_TRANSITION_CLIP_READING`: the port plays the new stance's; capture C3, research 211 §7), and whether a throw
under way refuses a swap (`FUN_005a7de0(actor, 1, 1)`, research 206 §1.2, 211 §9; the port does not refuse it).

## 6. Readings and placeholders

| name | value | source | status |
|---|---|---|---|
| `CROUCH_GATE_READING` (`mover.ts`) | `{ scale: 1.2, pronePad: 0.5, behind: 7, lift: 1.2 }`: ahead `|v| x 1.2` (prone `|v| + 0.5`), 7.0 behind, at the feet + 7.8 | `FUN_00552ec0` D:L418952-418966 through `FUN_0054d620` D:L416194-416363 (§1.1) | a reading: the segments level (`FUN_00306d40` on `actor+0x410` taken as none) and `FUN_005ab590`'s material filter not transcribed, as `PRONE_GATE_READING`'s |
| `CROUCH_GATE_REACH_READING` (`mover.ts`) | stand 9.03, prone 14.59 | `actor+0x14b0`, the `firepoint`'s offset (`FUN_005df450` D:L493889, its call to `FUN_005df930`), measured on the port's pose (§1.3) | a reading: the port's pose, the idles' first keys, the M4 on `seal_A_scuba`; owed an RDRAM read of `+0x14b0` |
| `HEADROOM_HIPS_READING` (`mover.ts`) | `'idle'`: the foot at the stance's idle hips + 2 (7.504 crouched, 4.168 prone) on both ends | `FUN_0057efe0` D:L441190-441245 (§1.2) | a reading: the original's foot is the posed hips (11.33 crouch-walking); owed a capture, a crouch-run under a 12-unit lintel |
| `HEADROOM_FROM_READING` (`mover.ts`, a comment) | was 14 | §1.2 | retired 2026-10-05 (PF-15): the foot is the hips + 2, `HEADROOM_HIPS_READING` |
| `STANCE_REQUEST_RETRY_READING` | the port drops a refused press; the original keeps an obstacle-refused request and asks again each tick | D:L418991, D:L419011, `FUN_00552d60` D:L418875 (§1.4) | *note only*: owed a request word on the shared mover and a capture |
| `SWAP_IN_TRANSITION_CLIP_READING` | the new stance's swap clip, the stance word changing at once | 211 §6, §7 C3 (§5) | *note only*: owed capture C3 |
| `STEEP_RISE_FACE_MIN_READING` (`mover.ts`, retired 2026-11-05) | was 6.5 (`SEAL_TUNING.stepHeight`): the grounded step's steep-rise refusal held only on a floor polygon at least this tall; removed with the refusal (LATER 590 closed, §2.7) | the owner's interim ruling on LATER 590 (2026-10-31); `step_height` (`dynamics.rdr` +0x1c), `FUN_005483d0` D:L413724-413725 (§2.7) | a reading, pending review: the refusal has no source; a capture owed (LATER 590) |
| `STEEP_FLOOR_CONTACT_READING` (`mover.ts`) | `{ normalY: 0.1, distance: 6, gain: 0.7 }`: a standing or crouched body facing into a sliding floor under n_y 0.1, its slide not started, is pushed off it along the normal for one tick | r0004's `FUN_0054f330` twin r4 0x554248-0x5542d0, `FUN_005b0c10`'s twin r4 0x5b6a60; the driver D:L416578-416613, `FUN_0054a6d0` D:L414410-414469 (§2.8) | a reading, pending review (MP51-FLOOR-TRAP, 2026-11-02): the back axis, the record's point and P's y the port's; one push a frame by r0001's frame order (D:L145065-145071), a second at tick N+1 (about 1.26) the other reading until r0004's `FUN_005483d0` bit-0 write is re-read or a capture; the prone block owed; a capture owed |
| `WALL_PROBE_READING` (`mover.ts`) | stand / crouch `{ h: 6.5, r: 3.5 }`, prone `{ h: 3.0, r: 8.0 }` (h = `SEAL_TUNING.stepHeight`, prone the class height 6.0 x 0.5) | `FUN_0054aa30` D:L415110-415133, D:L415231-415233, D:L415418-415419 (§2.1) | a reading: the stand-off is `r`, the original's about its segments' reach (`r x 1.4`); owed a capture of a SEAL pressed to a wall |
| `PRONE_FAN_READING` (`mover.ts`) | `{ count: 3, ahead: 1.4, centre: 1.1, across: 0.39 }`: built as 3.12 every way and 8.0 ahead along the travel | D:L415166, D:L415235, D:L415582-415621, D:L415822-415861 (§2.1) | a reading: the segments' lengths are not the stand-off; the standing fan's side lines taken as the disc; owed a capture, prone crawled in head-on and aslant |
| `PRONE_PROBE_TILT_READING` (`mover.ts`) | `'root'` (was `'level'`): the prone low line ahead rises `(q d).y` a unit along the travel, `q` the root's tilt as the last tick left it | `FUN_0054ecd0` D:L416972-417027, called for each prone segment of `FUN_0054aa30` (D:L415426-415431 the centre; D:L415533-416013), the travel `fStack_190` D:L415341-415352 (§7.8) | a reading, pending review: the port's 3.12 disc (the side lines, also lifted in the original) and the crossing guard stay level, and the line is the port's 8.0, not the segments' reach; `'level'` the alternative; owed a capture of a prone crawl up M51's incline to a kerb |
| `WALL_END_CONTACT_READING` (`mover.ts`) | a switch, `'face-normal'` (built) or `'radial'` (the corner push before b2). `'face-normal'`: at a face's end no push along the corner's direction; after the pass's face hits, the move's remainder (less its parts along those faces' normals) and the velocity lose their parts into the face along its own normal; an end met from behind its face's own normal, or behind the feet across the move, is no hit; the parts INTO the face only, where the original removes the whole part along the normal from `+0xf44` | `FUN_005483d0` D:L413538-413541, D:L413557-413567 (the list D:L413406-413425, refilled D:L413428-413457; D:L413588-413594 is the carried velocity `+0x1350`, not the port's); research 281 §4.3 (the polygon's own normal, one-sided); `FUN_0054aa30` D:L415341, D:L415549-415577 (§2.1, §2.3) | a reading, pending review (MV-PARITY b2, 2026-10-31): the port's disc meets any end within `r`, the original's fan only what its side lines cross; the order among walls is the port's; owed a capture of a SEAL pushed into a face's end and along a convex joint, and LATER 283 |
| `AIR_WALL_HEIGHTS_READING` (`mover.ts`) | a switch, `'start-and-end'` (built) or `'start'` (main before HF2-slim). `'start-and-end'`: every airborne tick, after its game frames, a move from where the tick began that crosses a face at the lines over the feet the tick leaves (or over the floor the tick's pick lands them on) is not taken -- only a face met from in front of its own normal (three axes, at the line's height; a moving owner two-sided); clip only, no stand-off push | `FUN_0054d9a0` D:L416501-416530, `FUN_0054aa30` D:L415157-415166, D:L415401-415410, `FUN_005506a0` D:L417822-417826, `FUN_005483d0` D:L413557-413567 and the jam D:L413602-413611 with D:L413918 (the (depth - 1) push D:L413612-413614 not built); research 281 §4.3 (one-sided); §2.10 | a reading, pending capture (HF2-slim, 2026-11-03): the original's segment is one slanted line, the port's disc two level cuts; the ground's contacts stay two-sided (LATER 620); the `'disc'` arm only -- on the segment path (`WALL_BODY_READING` 'segments', every map) `fall` does not call `airWalls` (§2.10's merge note); owed: a capture of a SEAL dropped past a face's top edge and of Crossroads' rubble slot (research 213 §3 item 2, H94) |
| `WEDGE_PUSH_OUT_ADAPTATION` (`mover.ts`) | `{ on: true, headings: 16, step: 0.25, ticks: 30 }`: a body on the ground within 30 ticks of a landing, already inside geometry (deeper than `WEDGE_CLEAR` into a face at a probe line), whose push-out, or every try of a ground sub-step, the crossing guard refuses (never a floor refusal), put once at the nearest free point within the deepest penetration plus the radius, crossing no face from in front of its own normal, onto a floor at its own level. The bound: a body with no penetration is never touched (`bridgeWedge.test.ts`, identical on and off) | none: an adaptation (§2.10) | *note only*: not a reading of the original; on the segment path SEGMENT-BODY's reading (§2.9) carries the case and the adaptation does not act -- it acts only on the `'disc'` arm, kept defined, not retired (§2.10's merge note; LATER 283, LATER 620) |
| `WALL_BODY_READING` (`mover.ts`) | a switch, `'segments'` (built) or `'disc'` (the port before SEGMENT-BODY: `slide`, `crosses`, `pushOut`, `airWalls`) | `FUN_0054aa30` D:L415134-415861, `FUN_005483d0` D:L413406-413800 with D:L413918; research 281 §4.3 (one-sided) (§2.9) | a reading, pending review (SEGMENT-BODY, 2026-11-02); owed the captures of §2.9 |
| `SEGMENT_BODY_READING` (`mover.ts`) | `{ ahead: 1.4, centre: 1.1, backing: 1.75, sideNear: 0.3, sideFar: 1.2, proneAcross: 1.3, still: 0.0005, depth: 1, jamHits: 2 }` | D:L415135-415235, D:L415354-415371, D:L415549-415621; the jam D:L413602-413614; `+0x34` forward is -z, `FUN_0057a330` D:L438978-438984 (§2.9) | a reading, pending review: `+0x21c` bit 2 taken clear; the prone x 1.3 at D:L415582 (mirrored D:L415822), the same in r0004 (R0004-SEGMENTS's follow-up); owed a capture of a SEAL walked and backed into a wall |
| `SEGMENT_LOOK_AHEAD_READING` (`mover.ts`) | `{ stand: 5.25, crouch: 10.5, prone: 11.46, from: 0.1, least: 2 }` | `FUN_005483d0` D:L413673-413800 (§2.9) | a reading, pending review: `FUN_0031e1d0`'s query taken as the hull's one-sided segment test with the records' pick; owed a capture of a SEAL sliding along a wall into a corner and walking past a crate's side |
| `SEGMENT_FIREPOINT_READING` (`mover.ts`) | body-frame (x, z): stand (-2.750, -8.599), crouch (1.341, -11.438), prone (-1.728, -14.490) | `actor+0x14b0` (`FUN_005df450` D:L493889, its call `FUN_005df930(actor, actor+0x14bc, actor+0x14b0, 0)`), §1.3's table; used at D:L413699-413711 and D:L415457-415523 (§2.9) | a reading, pending review: the port's pose of the M4 at each idle's first key, as `CROUCH_GATE_REACH_READING`; owed an RDRAM read of `+0x14b0` walking |
| `HEAD_LINE_MUZZLE_READING` (`mover.ts`) | `'prone-or-transition'` (checkpoint 4; was `'held'`): the head line along the facing by 1.1 x the muzzle's forward part only prone or in a transition; standing and crouched along the travel | `FUN_0054aa30` D:L415457-415523 (§2.9) | a reading, pending review: `FUN_00286c90(+0x458)` taken at 0 or under in the locomotion on ac's capture of M51 house2 (standing 6.78, crouch-walking 9.48 the centre's; prone 16.04 the muzzle's); `+0x458` not identified; `'held'` and `'none'` the alternatives |
| `CROUCH_RUN_FLAG_READING` (`mover.ts`) | `'set-while-running'`: `+0x21c` bit 2 set while the crouch runs, so no crouched forward 1.75 then; clear crouch-walking | `FUN_0054aa30` D:L415354-415371 (§2.9) | a reading, pending review: the bit's writer not read; on ac's capture (the crouch's run 5.85, crouch-walking 9.48); `'clear'` the alternative |
| `CROUCH_RUN_RELEASE_PUSH_READING` (`mover.ts`) | `'first-tick'`: a crouch run let go plays 0x11 (`CROUCH_RUN_RETURN_READING` 'stand-to-crouch', LATER 678) and its head line's push off a wall comes on the clip's first tick at the crouched firepoint's fixed reach (1.1 x 11.438 = 12.58): the port's body out to 11.58 at once, 12.846 at the clip's end | `FUN_0054aa30` D:L415480 (the 0x11 clause), `FUN_005483d0` D:L413602-413614; ac's r0004 capture house-crouch t2/t3 (§2.9, "The crouch run's release") | a reading, pending review: the capture holds 5.85 for 4 frames, then 10.85, then 12.88 -- neither the delay nor the final value read; owed `actor+0x14b0` through 0x11 (RDRAM) |
| `PRONE_TURN_WORD_PLACEHOLDER` (`mover.ts`) | 0: never turning -- the look-ahead's prone-turning jam (D:L413678-413684) and the turned prone line (D:L415701-415788) not built | `+0x23c`, `actor+0x48` (§2.9) | placeholder: owed a read of `+0x23c`'s writer |
| `SEGMENT_HIT_PICK_READING` (`mover.ts`) | `'nearest-passing'` (r0004, built) or `'nearest-then-drop'` (r0001); the knock's falls skip the slope drop | r0004 `FUN_005483d0` 0x54cf30 (R0004-SEGMENTS (A), (B)); r0001 D:L413406-413457 (§2.9) | a reading, pending review (OT.R97: r0004 the spec) |
| `JUMP_CONTACT_READING` (`mover.ts`) | `'stored-contact'`: the running jump refused while the move's stored contact stands | `FUN_0057e1b0` D:L440815-440819 (r0001) | replaced 2026-11-04 by `JUMP_CONTACT_PROVEN` 'none' (`mover.ts`; proven, the r0004 jump-near-wall capture: the running jump launched with `+0x10ac` set, §2.9); the r0001 branch kept there as the rejected reading |
| `JUMP_SPEED_SLIDE_READING` (`mover.ts`) | `'clip'` (built): on a sliding floor the jump's speed test reads the tick's velocity before the slide replaced it (the stick's), so a body sliding with the stick idle gets the standing jump; `'slide'`: the slide's displacement velocity, so a slide over 15 a second launches (the port before LATER 676's fix) | `FUN_0057e1b0` D:L440812-440814 reads `+0x2c..+0x34`, the top clip's root velocity (`FUN_0057a330` D:L438908-438985); whether the slide clip `FUN_0054f330` plays (research 201 s3) carries a root velocity there is unread; unreachable on the disc's surfaces (kind 4 slides only past `max_slope`, where the jump's slope test refuses first: `steepSlide.test.ts`) | open, a reading; a read of the slide clip's root channel, or an r0004 capture of `+0x2c..+0x34` on a steep slide with the stick idle |
| `AIR_HEIGHT_READING` (`mover.ts`) | `'altitude'` (built) or `'displacement'` (checkpoints 1 and 2): an airborne body's height is the game frames' own step, not the resolved displacement's y | `FUN_0059b440` D:L456496-456498 (`+0x2e4`), `FUN_0059ad30` D:L456313-456322; the jam D:L413602-413611 (§2.9) | a reading, pending review: how the translation's y follows `+0x2e4` is not read (D:L459729 copies `+0x20` into it); owed a capture of a SEAL falling past a steep face |
| `PRONE_TILT_EASE_BASIS_READING` (`rootTilt.ts`) | `'root-up'`: `DAT_0066acd0` the root's up as the last game frame left it, the prone body closing 0.2 of the remaining angle a 30 Hz game frame to the full slope | `FUN_005483d0` D:L413948-413952 copies the matrix of vtable +0x88's node (`skel_root`, `FUN_00553ea0` D:L419599-419607), the matrix `FUN_00548090` rebuilds (D:L413280-413282) (§7.3, §7.11) | **proven** (capture, 2026-10-31: the original's settling root is an exponential to the full slope, tiltOverSlope 1.00, closing 0.200 ± 0.0005 of the remaining angle a guest frame (`ease2.py`'s three-decimal figures; n = 4 runs × 13 frames after the transition, 52 frames, every one 0.200; re-derived 2026-10-31 by the implementer and the reviewer); runs 20261031T162022Z, 162058Z, 162130Z, 162310Z; `agent-mail/evidence/eph-tilt-measured-2026-10-31/FINDINGS.md` Q2); the ease's 0.2 (D:L413267) and its rate, once a game frame, proven with it; no harness spec or golden trace holds it yet -- `rootTilt.test.ts` and `remoteTiltClock.test.ts` hold the transcription |
| `STAND_CROUCH_TILT_READING` (`rootTilt.ts`) | `'by-span'`: the rule as read, the clip's window decides -- no stand or crouch clip has a `Normalize` (the loader's (1, 1)), so none tilts | `FUN_00548090` D:L413225-413255 tests no stance; `FUN_00287620` D:L131523-131527; `motion.rdr` 345 of 398 records without (§7.2) | a reading, pending review: `'never'` the alternative; settled by the PCSX2 read of §7.5 standing on the incline |
| `ROOT_TILT_UNWRITTEN_READING` (`rootTilt.ts`) | `'clip'`: on a tick the rule writes nothing the root is the clip's (identity on every clip but three, none windowed) | `FUN_005777d0` D:L437231-437289 samples the root with every tracked node; `FUN_0057a330` D:L439116-439124 writes the root's `+0x20` after the pass (§7.3) | a reading, pending review: `'held'` the alternative (the last tilt kept); settled by the PCSX2 read of §7.5 during a prone throw (`seal_prone_throwgrenade` has no `Normalize`) |
| `PRONE_AIM_LEAN_READING` (`look.ts`) | `'saved-floor'`: the prone aim limits moved by `pi/2 - acos|d|` (negated for `d` over 0), `d` the saved floor normal `actor+0x1344` dotted with the facing; the port's `Walker.floorNormal`, written where the mover stands on a floor and held in the air | `FUN_00594600` D:L452839-452884; `+0x1344` written by `FUN_0059b440` D:L456525-456533 (from `FUN_005af930` D:L466809), up at creation D:L419834-419836 (§7.6) | a reading, pending review: the original writes `+0x1344` once a grounded tick from the floor record (outside a list of actions, D:L466760-466788, D:L466808, and the dive, D:L456503), the port where its mover stands on a floor; `'level'` the alternative (no lean); settled by the PINE read of §7.6 |
| `PRONE_EYE_LOOK_PLACEHOLDER` (`cameraRig.ts`) | 0: a level look | `FUN_0029ae50` D:L142592 (`cam+0xb4` -> `+0x24`, x 6, floored at 0) (§7.7) | placeholder: the look term's meaning is owed (research 180 §1.3); was `PRONE_EYE_TERMS_PLACEHOLDER`'s `look`, whose `groundNormalY` is now the body's saved normal (§7.7) |
| `CORPSE_TILT_READING` (`rootTilt.ts`) | `'by-span'`: a dead body runs the rule on its top play's window (the walker's `dead`); in the air its top is the dead's posture word 8 (0.8 / 0.99) | `FUN_00548090` D:L413207-413214; `FUN_005807d0` D:L442094-442102; `FUN_005a2490` D:L459804; `FUN_0059b440` D:L456563-456565 (§7.9) | a reading, pending review: `FUN_00550ef0` skips the pass and the rule for an actor in state 8 (D:L418070, D:L418112-418114, D:L418460; `FUN_005506a0` D:L417822) and where `+0x174` becomes 8 for the dead is not read; the page's death poses are not the walker's top and stay level (not built); `'level'` the alternative; settled by a PCSX2 read of the root and `+0x174` on a SEAL killed on M51's incline |
| `HOSTAGE_PRONE_TILT_READING` (`remotePlayers.ts`) | `'unprone'`: a knocked hostage's tilt takes no prone ease on the page, as the room's `HostageFollow` walker (never prone) | `FUN_0058a4d0` D:L442089; `FUN_005807d0` D:L442094-442102; research 189 #13 (§7.10) | a reading, pending review (PRONE-TILT-2 review F1): whether the hostage's AI controller answers vtable +0x34 (`CRemoteCtrl::IsRemote`, research 193 §9) false where the room runs it, and whether `+0x174` follows the stack's top word, are not read; `'ai-stance'` the alternative (the AI's stance as the posture), not built for the room; settled by a PCSX2 read of a get-down hostage through a blast on a slope |
| `TILT_HIT_TEST_READING` (`rootTilt.ts`) | `'posed'`: the room's capsules (and the page's copies of them) turn with the root's tilt about the posed root | `FUN_005abbc0` hits the skeleton's nodes (research 91 §1.3); whether after this rule's write is not read (§7.4) | a reading, pending review: `'level'` the alternative; settled by a capture of a shot along a prone body on a slope |
| `WALL_HEAD_LINE_READING` (`mover.ts`) | `'idle'`: the line at the stance's idle head + 2 (19.394, 12.138, 5.637) on both ends | D:L415441-415459 (§2.2) | a reading: the original's is the posed head; owed a capture, a SEAL walked and crouch-run under a lintel. A reachable spot (OBF-21, 2026-10-30, `viewer/test/ledgeCase.probe.test.ts`, the disc's MP72): Crossroads' Charlie, where `worldmodel/tent_beige`'s canopy band (y 75.8-76.9, z 1541.6-1550.0, a wall by `isWallSurface`) hangs over the lip of `g1212/table_slanted` above the road -- a standing SEAL run -z down the grass is turned along the lip and held at (1284.78, 56.87, 1545.75) between the band (met by the idle line at 76.26, 19.39 over the feet) and the tent's pole; the run's posed head + 2 (17.4-17.7, §2.3) would pass under the band's 18.93 |
| `WALL_PROBE_ACTIONS_READING` | the actions that set `bVar5` standing or crouched (heights 9.55 / 7.5) | D:L415088-415111 (§2.1) | *note only*: none of 0x1a / 0x1b / `DAT_003dec58` / `DAT_003decc0..d0` is a port action yet; owed a read |
| `WALL_DEEP_REVERT_READING` | when the deepest contact is over 1.0 and `bVar6 || 2 < iVar25`, the displacement is zeroed (the body where the tick began); otherwise `depth - 1` along the deepest normal | `FUN_005483d0` D:L413406-413614, saved D:L413959-413962 (§2.3, §2.8) | resolved 2026-11-02 (SEGMENT-BODY, §2.9): built on the original's segments (`SEGMENT_BODY_READING` `depth`, `jamHits`); was *note only* on the disc, where it stuck MP72's emb01 step-down and froze a body placed deep (§2.3) |
| `CROUCH_TOP_READING` (`mover.ts`) | was 14 | §2 | retired 2026-10-05 (PF-16): no column; `WALL_PROBE_READING` and the head line |
| `PRONE_TOP_READING` (`mover.ts`) | was 9 | §2 | retired 2026-10-05 (PF-16): no column; `WALL_PROBE_READING`, `PRONE_FAN_READING` |
| `PEEK_STANCE_ENDS_PEEK_READING` (`traversal.ts`) | true: a stance press under a held peek ends it, no transition, the stance kept | `FUN_00581660` D:L442436-442477, `FUN_005817d0` D:L442479-442524, `FUN_00581c10` D:L442605-442648: no case for 3 (180 §1.12; §3.1) | a reading, re-documented by PF-20 (was: the transition played first); owed the PINE capture of 180 §1.12 |
| `PEEK_REPUSH_KEY_READING` (`traversal.ts`) | `'held'`: the re-peek the tick after the press resumes the lean clip at its held key; the press's tick drawn from it | `FUN_00594cf0` D:L453431-453458, `FUN_005b4340` (180 §1.12; §3.1) | a reading: whether the original's re-push replays the rise (the flicker) is owed the capture of 180 §1.12 |
| `PEEK_HOLD_CONTINUES_READING` (`traversal.ts`) | true: the lean's toss and a reload, still or not, play over the held peek, state 3 kept | `FUN_005b4340` 469345; `GetThrowAnim` D:L441773-441796; `FUN_005a82e0` D:L462925-462928 with `FUN_0057dc20` D:L440540 (cVar7 never 3: no pop) (§3.2) | a reading, restored by PF-20's review (2026-10-05); not read: whether `FUN_00588bc0`'s mapped-type pops (D:L446070-446240) catch a reload's type; owed a capture of R mid-peek, crouched |
| `AIM_FRAME_BODY_PEEK_READING` | (none) | `AimFrame.peek` is the camera's eased value (§3.3) | *note only*: owed a body-peek field on `AimFrame` (the peek held, the lean clip) so the room can refuse a throw from a prone peek or from state 3 without a lean clip at the command (PF.R36's area) |
| `ROOM_LEAN_ORDER_READING` (`net/moverSim.ts`) | `'after'`: a command's lean read after its stance, the page's the same | `FUN_00594cf0` D:L453331-453430 then D:L453431-453458 (211 §2; §3.4) | a reading of the update's order |
| `PEEK_THROW_READING` (`grenade.ts`) | was 0.5 | `GetThrowAnim` D:L441773-441796 (181 §2.10; §3.3) | retired 2026-10-05 (PF-20): state 3 and the lean clip playing, no magnitude |
| `DEATH_NAME_PLACEHOLDER` (`net/deaths.ts`) | was: the crawls in the clips' order | `animset.rdr` GLOBAL (179 §11.2; §4.1) | retired 2026-10-05 (PF-21): Crawl death01 `death_stand_groin02`, Crawl death02 `death_stand_groin01` |
| `LAUNCHER_RAISE_READING` (`equipment.ts`) | the rifle's raise, 1.4155 s (was 1.2388) | `FUN_005a6d30` D:L462097-462133, `FUN_005a6b70` D:L462045-462092 (179 §11.15; §4.2) | resolved 2026-10-05 (PF-21): `launcherRaiseSeconds` / `launcherLowerSeconds` per firearm; the name an alias for the held `main.ts` until its wiring (removed, wave 4, 2026-10-06) |
| `PRONE_ROOT_READING` (`mover.ts`) | was 1.8 | `seal_prone` `skel_root` (180 §1.2; §4.4) | retired 2026-10-05 (PF-21): `PRONE_ROOT` = 555/256 |
| `PRONE_HEIGHT_READING` (`stature.ts`) | 6.0 (was 3) | `FUN_0054aa30` D:L415119-415122 (180 §1.4; §4.5) | resolved 2026-10-05 (PF-21): `PRONE_HEIGHT`, the size class's height; the name an alias for the held `main.ts` until its wiring (removed, wave 4, 2026-10-06) |
| `ROOT_RATE_READING` (`playerCamera.ts`) | 9.92 a second (was 29.9) | `seal_stand2crouch` playback 0.65, 27 keys (180 §1.10; §4.4) | a reading: a fallback with no original counterpart; 180 §1.10's 6.64 leaves out the playback |
| `LANDING_HIT_DRAW_READING` (`mover.ts`) | the command's seq, the living's alone | `FUN_005af590` D:L466658-466669, `FUN_00197740` (180 §1.8; §4.3) | a reading, re-documented by PF-21: a corpse draws none (`Land forward`) |
| `DEATH_LANDING_GETUP_PLACEHOLDER` (`mover.ts`) | true | 180 §1.8 (§4.3) | the page's own (the free walk), re-documented by PF-21; no original counterpart |
| `FLINCH_GATE_READING` (`net/deaths.ts`) | `flinchRefused` | `FUN_005a2690` D:L459887-460017 (179 §11.4; §4.6) | a reading, re-documented by PF-21: owed a read of states 8, 9, 10 by name and of the hang's state |
| `FLINCH_STANCE_READING` (`net/deaths.ts`) | the transition's origin under half | `FUN_005a0270` D:L458746-458775 (179 §11.6; §4.7) | a reading, re-documented by PF-21: 0x11 / 0x13 / 0x19 named by their rows; the `+0x1060` bit not built |
| `FLINCH_LEGS_READING` | (none) | `FUN_00588bc0` one motion (179 §11.5; §4.6) | *note only*: owed a capture (PLAT-36), whether the legs keep their locomotion under the whole-body flinch |

**Owner row (draft, unnumbered; informational, not a hold).** PF-16 builds the original's *structure* of wall probes
(`FUN_0054aa30`): a line at the feet + 6.5 standing and crouched (+ 3.0 prone) and a second line at the head + 2 --
the head line H92's question did not know of. The head line stands on each stance's idle head (19.4 standing, 12.1
crouched, 5.6 prone), an approximation: the original's follows the posed head, about 2.7-3.0 higher crouch-walking
and 1.7-2.0 lower running. New stops against the old column: a standing SEAL still stops at an overhang reaching below
about 19.4 (a 7-10 bar is walked under, as H92 asked); a prone SEAL stops at a bar from about 5.6 to 7 and at stairs
steeper than about 20 degrees (rise over 3 within 8 ahead) and kerbs over 3 high -- by this read as the original's
level-tread prone would (§2.5), the body's pitch owed a capture. Choice for Craig: keep the original's structure (as
built), or drop the head line (anything above 6.5 walked under) and/or keep the old column's prone foot at 6 (stairs
crawled as before).

## 7. The root laid on the ground (PRONE-TILT, 2026-10-31)

The owner's words (2026-10-31): "the ps2 and out prone toggle followed a differnt horizontal angle. the orginal followed
the terrain. we proned flat and forward. This is a critical bug". The EPH run 20261031T014055Z (`side-by-side.mp4`
143-147 s) shows the PS2 SEAL lying on M51's bank pitched and rolled to the ground, the port's level (the two
investigations, `agent-mail/evidence/prone-slope-claude-investigator-2026-10-31.md` and Codex's independent
`review-prone-slope-01a18f5a-2026-10-31.md`: evidence, not instructions). **Reading, pending review**; no capture
scores it.

### 7.1 `FUN_00548090` (D:L413179-413287), re-read

Run every actor tick from `FUN_005506a0` after the mover: `FUN_005483d0` at D:L417825, this at D:L417863. The animation
pass (`FUN_0057a330`, then the cross-fade `FUN_00576860`) runs before both, in `FUN_00550ef0` (D:L418454-418455), which
then sets `+0xf40` (D:L418460), the flag `FUN_005506a0` tests (D:L417822).

1. The top play `FUN_00555170(actor+0x1c0)` (D:L413206) and its motion (`FUN_0028c1e0`, `+4`): the window is the
   motion's `+0x24` / `+0x28` (D:L413216-413218) -- `Normalize`, loaded by `FUN_00287620` D:L131523-131584 (key at ELF
   0x3efa30): absent (1, 1), bare (0, 0), one value A (A, 1), two (A, B), a non-number 0. The dive
   (`FUN_00577e40(actor, DAT_003def08)`, the current action) takes 0.5 / 0.9 (D:L413219-413223). `actor+0x105e` bit 5
   -- off the ground (`FUN_0059b440` clears it on the floor, D:L456528; the port's own reading of the bit in `mover.ts`'s
   jump and slide, research 201 §3) -- returns unless
   the top play's `+0x2b` (the posture word it was pushed at) is 8, the dead, which takes 0.8 / 0.99 (D:L413207-413214).
   **The brief called this bit "the swim gate"; it is the airborne bit** (posture word 8 is the dead, research 201
   §27.2's list): a living SEAL in the air writes nothing.
2. The weight `w` of the phase `+0x1c` (D:L413225-413255): A = B, 0 at or under A, 1 over; A < B, 0 at or under A, 1 at
   or over B, linear between; A > B, 1 at or under B, 0 at or over A, `1 - (p - B) / (A - B)` between.
3. `w > 0`: `FUN_00308fc0(w, DAT_003f64e0, actor+0x410, out)` (D:L413259) -- a component-wise lerp (D:L207390-207417:
   `a` at 0, `b` at 1, else `a(1 - w) + b w`, not normalised) from the reference up (`DAT_003f64e0`, (0, 1, 0) in RAM,
   research 215:864-870; zero in the ELF) toward the floor hit's normal `actor+0x410`; then turned by the conjugate of the actor's
   quaternion `+0x50..+0x5c` (`FUN_00306fd0` with x, y and z negated, D:L413260-413264): the yaw undone.
4. Posture `+0x174` 2 and neither 0x13 nor 0x19 the current action (D:L413265-413266): `FUN_00308fc0(0.2,
   DAT_0066acd0, v, out)` (D:L413267, the call and its `0x3e4ccccd` on the one line); otherwise `v` as it is (the else,
   D:L413269-413273).
5. `FUN_00306d40(q, DAT_003f64e0, out)` (D:L413274; D:L206003-206095): the half vector `h = |u + t|` (`FUN_00309240` is
   an add, D:L207508-207514; `FUN_00309110` normalises, D:L207441-207456), `q = (u x h, u . h)` (`FUN_001bfc78` the VU0
   outer product, D:L40450-40463); `u + t` zero, or `u x h` zero with `u . t < 0`: the half turn (1, 0, 0, 0) for `u`
   up. `t` is not normalised: a short `t` turns less than its angle. `q` is written whole to `*(actor+0x2e8)+0x20..+0x2c`
   (D:L413275-413279) and the root's matrix rebuilt from it with its dirty bit (`FUN_00315790`, D:L413280-413282,
   D:L215052-215060). No clamp, no dt, no turn of the heading: the axis `u x h` is horizontal.

**Where `+0x410` comes from.** `FUN_005b0420` copies the floor pick's record into `+0x400..+0x41c`: the position, `+0xc`,
the normal (the hit's `+0x10..+0x18`) and the owner `+0x1c` (D:L467124-467134) only when `FUN_0059acd0(hit+0x1c)` is 0
(D:L467123); otherwise the position alone, the old normal kept (D:L467136-467140); and on a miss the normal kept
(D:L467049-467070). `FUN_0059acd0` answers 0 for no owner, and otherwise dynamic-casts the owner's `+0x94` node
(`FUN_001821d0(..., 0x65c238, 0x65c220, 0)`, D:L456241-456258) and answers the cast's `+4` -- the type descriptors name, at ELF 0x65c238,
`CSealEx` and, at 0x65c220, `zdb::CNodeEx` (read off `game/overlays/socom2_game.elf` 2026-10-31: each descriptor's first
word points at its name string; `CSealEx`'s next word, 0x65c228, its base). So the normal is held only on a floor owned
by a `CSealEx` whose `+4` is set. The port's floor picks meet only the map's collision polygons -- `groundGrid` is built
from the map's `worldmodel` scene nodes (`collisionOwners`, `@s2u/scene` `grid.ts`) and the moving doors, gates and cranes
among them; no actor is a floor in the port -- so the held branch cannot arise and no reading is named for it (pinned:
every owner of MP2's fixture ground is a `worldmodel` node, `rootTilt.test.ts`). What a `CSealEx` floor is in the
original (another body underfoot) is not read.

The port: `packages/viewer/src/rootTilt.ts` (`tiltWeight`, `shortestArc`, `stepRootTilt`), run once a tick by the
`Walker` after its move (`Walker.tiltTick`: the page's own body and the room's seats alike, one Walker), by the page for
the others' bodies from its own floor (`remotePlayers.ts` `remoteTilt`, on the walker's 60 Hz tick), laid on the
skeleton root after the cross-fade (`animator.ts`, `MoverSnapshot.rootTilt`), and the room's capsules turned with it
(`net/hitVolumes.ts` `bodyVolumes`; `room.ts`'s three hit tests and its rewind's `Past.tilt`).

### 7.2 The windows on the disc

`motion.rdr` (`RUN/READERC.ZAR`, through `motionTable.ts` `MotionEntry.normalize`, all 398 records; pinned in
`motionTable.test.ts`): 345 without (1, 1); 22 bare (0, 0) -- every prone idle, crawl, turn, strafe and lean, the prone
reload, toss and swap, `guard_prone_cover`; `seal_crouch2prone`, `seal_stand2prone`, `seal_p_stand2prone` (0, 1); the
knock's `seal_fallforward01` / `seal_fallbackwards01` (0.55, 0.95) and `seal_landforward01` / `seal_landbackwards01`
(0.5, 0.9); 18 deaths (0.2, 0.8), `guard_restrained_death` (0.3, 0.8), three buddy deaths (0, 0.4), one (0, 0.5);
`seal_buddycarried_pickup` (1, 0.5). No record has one value. `seal_dive2prone` has none (the code's 0.5 / 0.9).
Without a window: every stand and crouch clip, `seal_prone_throwgrenade`, `seal_prone_recoil`, the prone shotgun's pump
and reload. Codex's private list (`prone-slope-01a18f5a-motion-fields.txt`) agrees on every clip it printed.

**Stand and crouch (`STAND_CROUCH_TILT_READING`).** The rule tests no stance but the ease, so a window would tilt a
standing body. None has one: (1, 1) weighs 0 at every phase up to 1, and a play's phase never passes 1 (a loop wraps
below it; a one-shot holds at (n - 1) / n, `FUN_0028c4f0`). By the evidence the standing and crouched body stays level;
the knock's falls and landings and the deaths tilt by their windows (the port's corpses are not given it: a follow-up).

### 7.3 The readings the rule leaves

- (a) `PRONE_TILT_EASE_BASIS_READING` `'root-up'` (**proven** 2026-10-31 by the EPH capture, §7.11). `FUN_005483d0` copies `DAT_0066acd0..d8` from `+0x10..+0x18` of the
  matrix at `+0xc` of the node vtable +0x88 returns (D:L413948-413952). Re-read: the actor's vtable is 0x6691a0
  (D:L419421), and `FUN_00553ea0` stores the node named `skel_root` (ELF 0x65c4c0) at `actor+0x2e8`
  (D:L419599-419607); that slot +0x88 is 0x553db0 (`jr ra; lw v0,0x2e8(a0)`, a load of `actor+0x2e8`; `skel_root` at
  ELF 0x65c4c0) was Codex's ELF read, confirmed at the ELF by the fresh review (2026-10-31). The
  matrix is the root's local one, rebuilt from the root's quaternion by `FUN_00315790` -- so the copy is the root's last
  up, and the prone body eases to the full slope at 0.2 a game frame. The alternative (the animation pass rebuilding the
  root's matrix from the clip's quaternion before the copy: the level up, a fixed 20% tilt) is ruled out by the capture
  (§7.11); the 180's write (D:L439116-439124) rebuilds nothing.
- (b) `STAND_CROUCH_TILT_READING` `'by-span'` (§7.2).
- (d) `ROOT_TILT_UNWRITTEN_READING` `'clip'`. The pose writer `FUN_005777d0` samples every tracked node, the root's
  record marked first (D:L437231-437236, D:L437262-437289), and `FUN_0057a330` writes the root's `+0x20` for the 180
  after the pass (D:L439116-439124): the pass owns the root's rotation each tick, and `FUN_00548090` writes over it only
  when `w > 0` -- it overwrites, it does not compose (`+0x20..+0x2c` stored whole, D:L413275-413279). Every clip's root
  rotation is the identity but `seal_180`'s, `guard_susp_look_back`'s and `seal_walk_alert02`'s (`MOTION_P.ZAR`, 285
  clips track the root; `rootTilt.test.ts`), so on such a tick the body is level -- a prone throw on a slope
  (`seal_prone_throwgrenade`, no window) lies level for its run. Open: whether the pass's pose lands on the node before
  this rule in the same frame; `'held'` keeps the last tilt.
- (c) `TILT_HIT_TEST_READING` `'posed'`: §7.4.
- Not modelled: a fresh looped play's one tick at phase 0 (bare weighs 0 there, D:L413227): the port's ground plays
  carry no phase (`GROUND_PLAY_PHASE`), and the hold's clock is not on the wire, so the page's copies take a hold's
  phase past 0 too. The floor pick's order in the original's frame (`FUN_00550570` D:L417771 calls `FUN_005b0420`) is not
  read: the port picks the floor the tick's move ended on, and only on a tick the rule writes (`w > 0`, the one read of
  `+0x410`, D:L413259; a tick that writes nothing never reads it, so a standing body pays no pick -- the cost fold,
  `rootTilt.test.ts`). The mover's own pick in `slideOrMove` (`mover.ts`, the steep-slide test) is at the tick's start
  position, before the move, so it is not `+0x410`'s post-move record and is not reused. One divergence the laziness
  admits: on a writing tick whose pick misses, the normal kept is the last writing tick's, not the last tick's (a miss
  under feet on the floor does not arise on the maps' walked ground). The tilt changes no movement state: a walker
  with the rule switched off takes the same positions, velocities and postures over 900 ticks on a slope with no wall
  (`rootTilt.test.ts`; since PRONE-TILT-2 (3) the tilt moves a prone body whose low line meets a wall on a slope, §7.8). Whether `FUN_005506a0` runs for a remote actor is not read:
  the page runs the rule for every living SEAL it draws, from its own floor, on the walker's tick (the room's seats are
  Walkers and run it in `tick`), so a body takes the same pose on the page that owns it, in the room, and on the
  others' pages where their floors agree (A = B) -- the room's and a page's Walker on the same commands give the same
  quaternion every command (`match/test/roomProneTilt.test.ts`). The page's copy of another body can differ for a few
  ticks: its ease starts from level when the body is first drawn living, and a hold's clock is not on the wire. That
  moves only what the page aims at (`aimDistance`, `aimBodies`: the aim distance and the target list), never who is hit:
  the room judges hits on its own seat's tilt.

### 7.4 What moves with it

- **The room's capsules** (`TILT_HIT_TEST_READING`): turned by the root's quaternion about the posed root
  (`hitVolumes.ts` `rootPivot`, `tiltBodyPoint`). Facing up a 20-degree slope the prone head capsule's lowest point
  clears the ground by 2.35, where the level one cleared 0.46 (`hitVolumes.test.ts`, MP2's `seal_A_scuba`). The page's
  aim at the others' bodies (`aimDistance`, `aimBodies`) takes the same tilt. The placeholder capsules (no skeleton) and
  the hostages' stay level; the bots' torso aim (`net/botAim.ts`) and their ally ray (`bots/shot.ts`, the placeholder)
  are unchanged.
- **Follow-ups, named and not built here** (each a rule of its own):
  - the prone wall probe through the body's matrix (`PRONE_PROBE_TILT_READING`, `FUN_0054ecd0` D:L416972-417027;
    §2.5): built by PRONE-TILT-2 (3), §7.8;
  - the prone aim limits leaned by the slope (`FUN_00594600` D:L452839-452884): they read the floor normal saved at
    `actor+0x1344..+0x134c`, written by `FUN_0059b440` at D:L456531-456533 (the floor hit's `+0x10..+0x18`) and at the
    body's creation to `DAT_003f64e0` (D:L419834-419835) -- a different field from `+0x410`; built by PRONE-TILT-2 (1),
    §7.6;
  - `PRONE_EYE_TERMS_PLACEHOLDER.groundNormalY` (`cameraRig.ts`) fed the real normal (`FUN_0029ae50` D:L142591-142602):
    built by PRONE-TILT-2 (2), §7.7;
  - the corpses and the knock's falls on their windows (the page's death poses are not the walker's top play): read and
    built by PRONE-TILT-2 (4), §7.9.

### 7.5 What would settle the readings

One PCSX2 / PINE run on the owner's host with the sampler extended to read, each frame, the root quaternion
`*(actor+0x2e8)+0x20..+0x2c`, the floor normal `actor+0x410..+0x418`, `DAT_0066acd0..d8` and the top play's motion id,
through the scripted climb-and-prone on M51's incline, a prone on flat ground, standing still on the incline, and a
prone throw on it: (a) is settled by whether the root's up reaches the slope at 0.2 a frame or holds at a fifth of it;
(b) by whether the standing root's quaternion stays the identity on the incline; (d) by whether the root goes level for
the throw. A shot along a prone body on a slope settles (c).

At the EPH spot (861.78, -122.64, 879.08) the floor the room's map gives is 8.90 degrees off level (normal 0.1409,
0.9880, 0.0639), and a Walker laid prone there settles its root's up on it (`rootTiltDisc.test.ts`, dev-disc).

### 7.6 The prone aim limits lean with the slope (PRONE-TILT-2 (1), 2026-10-31)

**Reading, pending review**; no capture scores it.

`FUN_00594600` (the pitch, D:L452781-452958), prone (`+0x174` 2: `bVar3` clear, D:L452817, D:L452839), turns the model's
forward `DAT_003f6500` ((0, 0, -1) at run time, research 181) by the rotation rows of the actor's matrix
(`*(actor+0x28)`, D:L452840-452865: the facing, yaw only), dots it with the floor normal saved at `actor+0x1344..+0x134c`
(D:L452866-452867), takes `|d|` (`FUN_001b3620`, the sign bit cleared), its `acos` (`FUN_001b38b0` -> `FUN_001aed50`,
fdlibm's `acosf`; 0 at or past 1, pi at or under -1, D:L452868-452877), the term `pi/2 - acos|d|` negated when `d` is over
0 (D:L452878-452881), and adds it to both prone limits (`+0x68` the lower, `+0x64` the upper; D:L452882-452883) before
the stick's step and the return clamp against them. Facing up a 20-degree slope the term is +20 degrees (the pair -20..25
becomes 0..45); facing down it, -20 (-40..5); across it, 0. The recentre mode (`DAT_0066b3d8` 2, D:L452818-452830) takes
the lean too; the port has no recentre mode.

**Where `+0x1344` is written** (the brief's first question). Three writers, no other in the decompilation (every
store at `+0x1344` / `+0x1348` / `+0x134c` and at the words `0x4d1..0x4d3` searched; the slope slide reads it,
D:L417108-417160): the body's creation, `DAT_003f64e0` (up; D:L419834-419836, words
`0x4d1..0x4d3`); and `FUN_0059b440` (D:L456525-456533), which copies the floor record's normal (`hit+0x10..+0x18`) when
the body stands on the floor (`+0x1340` over 0.001, or the feet at or under the floor + the touch distance and not
rising) and `FUN_0059acd0` answers 0 for the floor's owner (D:L456529-456530; research 217 s7.1 for that test) -- outside
the dive (D:L456503). `FUN_0059b440`'s one caller is `FUN_005af930` (D:L466809), each tick, with the record at
`actor+0x400` (D:L466759: the same record `FUN_005b0420` fills, whose `+0x10` is `+0x410`), unless the action is one of
0x2e, 0x2a, `DAT_003dec90`, 0x23, `DAT_003dec80`, 0x2d or the posture word 4 (D:L466760-466788), or `DAT_003deca0`
(D:L466808). So it **updates every grounded tick, prone included**, not only on landing, and holds through the air.
The port already kept its y (`+0x1348`) as the jump's slope test (`Walker.floorNormalY`); PRONE-TILT-2 keeps the whole
vector (`Walker.floorNormal`), written at the same places -- the placing, each ground sub-step's end, the landing -- and
held in the air (`PRONE_AIM_LEAN_READING`: a still body on a moving floor keeps the normal its last step stood on, and the
skipped actions are not mapped to the port's).

The port: `look.ts` `proneAimLean`, added by `net/lookGate.ts` `aimPitchLimitsOf` (prone and not diving:
`Walker.aimProne`) -- the room's gate (`net/moverSim.ts`), the page's gate and camera (`walk.ts`), the forge's NPCs and
the bots' pitch clamp (`match` `bots/matchBots.ts`, "a player's aim limits: a bot asks for no more") make the one call,
so the room and the page lean alike (`match/test/roomProneTilt.test.ts`: the same limits and the same pitch every
command, uphill 0..45, downhill -40..5). The room holds no stance limit itself (only the hard stop, `HONEST_PITCH_DEG`);
the gate's free snap into narrowed limits now follows the leaned pair. Tests: `viewer/test/proneAimLean.test.ts`.

**The gate's snap and the lean (review F1, `LOOK_NARROW_SNAP_ADAPTATION`, a room tolerance recorded with the gate's in research 223 §4).** The gate (`net/lookGate.ts`) let a mover outside
its limits be put at the edge at once on any tick an edge moved inward -- written for a stance change. The lean moves the
prone edges as the body turns on a slope (facing across to uphill on 20 degrees about 44 degrees a second at the full turn),
so every such tick granted a free snap. The original has no snap at all: `FUN_00594600` brings a pitch outside the limits
back at `param_1 * 0.5` (0.5 rad/s, D:L452908-452919), whatever moved them, a stance change included. That return is in the
gate's allowance each tick (`lookAllowance`'s `PITCH_RETURN`). So the snap is now taken only when the pair's span narrows
(a stance change; the lean shifts both edges by one angle), and the stance-change snap itself is named as the room's
tolerance with no original counterpart. Room and page run the one gate (`match/test/roomProneTilt.test.ts`, (1)'s A = B);
`viewer/test/lookGate.test.ts` holds both cases.

**The dive (review F2, LATER 597).** The lean is taken only prone and not diving (`Walker.aimProne`), as the original's
posture word 6 through the dive (`FUN_0057e540` D:L440898) fails `FUN_00594600`'s prone test (D:L452817). But with word 6
the original takes the standing pair (-70..60, D:L452837-452838) and `FUN_0029ae50` the standing eye (D:L142591), where
the port, whose walker is `prone` through the dive, keeps the prone pair (unleaned) and the prone eye -- a gap older than
this branch, filed as LATER 597, not changed here.

Settled by a PINE read of `actor+0x1344..+0x134c` and `ctrl+0x130` (the pitch) prone on M51's incline, facing up, down
and across it, with the stick held up and down: the pitch's stops against the term.

### 7.7 The prone eye takes the saved normal (PRONE-TILT-2 (2), 2026-10-31)

**Reading, pending review.** `FUN_0029ae50` (the view from the head's eye, D:L142565-142624), prone (`+0x174` 2 of the
camera's body `cam+0xbc`, D:L142591), reads the floor normal's y at the body's **`+0x1348`** (D:L142596): the y of the
saved normal `+0x1344..+0x134c` (§7.6) -- not the tilt's `+0x410`. It floors it at 0.5 (D:L142597-142599) and places the
eye `(max(6q, 0) + 1.8) x 2 / n` over the root and `n x 0.7 x -7` ahead (D:L142592-142601). The look term q
(`*(cam+0xb4)+0x24`, D:L142592) is untouched: still a level look, now `PRONE_EYE_LOOK_PLACEHOLDER` (0) -- the old
`PRONE_EYE_TERMS_PLACEHOLDER` split, its `groundNormalY` retired (it was 1 because the room's frame carried no normal and
the two had to place the same eye).

The port: `cameraRig.ts` `proneEyeTerms(n)`; the room's frame carries `AimFrame.groundNormalY` (the room's walker's
`floorNormal[1]` after the command, `room.ts`'s cone tick and `startBody`), `net/shotCone.ts` `headPoint` takes it, and the
page takes its own walker's for its first-person eye and its start body (`walk.ts`). On a 20-degree slope the eye stands
3.831 over the root (3.6 flat) and 4.604 ahead (4.9 flat). The room's head and the page's from the same walker agree every
command (`match/test/roomProneTilt.test.ts`); `viewer/test/proneEyeNormal.test.ts` holds the transcription. The bots' own
eye height (`match` `bots/matchBots.ts` `scopeEyeHeight`, the stance's) reads no normal, as before: their sight is the
port's adaptation, not this view.

### 7.8 The prone low line through the root's tilt (PRONE-TILT-2 (3), 2026-10-31)

**Reading, pending review; this changes movement.** `FUN_0054aa30` (the controlled body's wall segments), prone
(`bVar5`), builds the travel in the body's frame `fStack_190` -- the frame displacement `+0xf44` turned by the conjugate
of the actor's quaternion, its y zeroed, its z set to -1 when it is short or `bVar4`, normalised (D:L415341-415352) -- and for
each low-line segment it casts (the centre, D:L415426-415431; the side and turned lines, D:L415533-416013) calls
`FUN_0054ecd0(root matrix, fStack_190, start, end)` (D:L416972-417027): the segment's length times `fStack_190`
(`FUN_00309180`), turned by the three rotation rows of the matrix at `+0xc` of the node vtable `+0x88` returns
(`skel_root`, §7.3), whose y it returns; the caller adds it to the segment end's y. The start stays at the feet + 3.0
(D:L415231-415233): the line rises `(R d).y` a unit of its length along the travel. The head line (D:L415441-415459)
starts at the posed head + 2 and is not lifted. The matrix read is the one `FUN_00548090` rebuilt at the last tick's end
(the mover runs before the rule, `FUN_005506a0` D:L417825, D:L417863), the same one `PRONE_TILT_EASE_BASIS_READING`
reads.

Settled prone facing up a 20-degree slope, `(R d).y` = sin 20 = 0.342 a unit; the ground rises tan 20 = 0.364, so 8.0 ahead
the line stands 2.82 over the ground (level, 0.09). So a level line stopped a crawl 8 short of any fin taller than 0.09 on
such a slope; the tilted one meets only what stands over about 2.8 (as on flat ground, 3.0). Downhill the line falls 0.342
a unit where the ground falls 0.364.

The port: `mover.ts` `slide` takes `lift = (q d).y` (`rotateByQuat` of the root's last tilt on the travel in the body's
frame, `worldToBody`; 0 under the `'world-up'` basis and when the rule wrote nothing) and casts the line ahead
(`PRONE_FAN_READING`'s 8.0) as a 3D line against each wall's polygon (`rayToWallTilted`), its push the level line's; with
`lift` 0 the old path runs untouched. Kept level, named in `PRONE_PROBE_TILT_READING`: the 3.12 disc (the port's stand-in
for the side lines, which the original lifts too) and the crossing guard. Tests: `wallProbes.test.ts` (a 1.5 fin on the
slope crawled over, a 2.9 fin stops the crawl 8 short, the rule off stops at the 1.5; flat ground as before), the 900-tick
identity re-scoped in `rootTilt.test.ts` (identical with no wall on the slope; with a fin the two part where the line meets
it), and the room against the page (`match/test/roomProneTilt.test.ts`: the same position every command over the fin).

**The bots.** The room's bots are seats whose commands run the same `MoverSim` -> `Walker.tick` -> `slide`
(`match` `bots/matchBots.ts` sends commands; the AI's ground step's deferred floor, `step`'s `deferFloor`, still slides), so
a prone bot on a slope meets walls through the tilted line too. Bots go prone by `chooseBotStance`; a prone bot on level
ground is unchanged (no tilt). No bot-specific path was added.

### 7.9 The knock's falls and the corpses (PRONE-TILT-2 (4), 2026-10-31)

**Reading, pending review.** Who is pushed at posture word 8, the rule's air branch (D:L413207-413214, window 0.8 / 0.99):

- **The knock's falls.** `FUN_005807d0` (D:L442057 on) pushes `Fall forward` / `Fall backwards` (`DAT_003deed0` /
  `DAT_003deed8`, D:L442103-442118) at a posture word set at D:L442094-442102: when the controller (`+0xc0`) is not remote
  (its vtable +0x34, `CRemoteCtrl::IsRemote`, research 193 §9, false, or no controller) 0, or 8 when `+0xe1` bit 4 is
  clear; when it is remote, 8 when the bit is clear, else the caller's word (`FUN_0057e770`
  passes `+0x174`'s low byte, D:L440999). `+0xe1` bit 4 clear is the dead actor (research 225 s6, reviewed; the corpse's
  landing class 3 tests the same bit, D:L466658-466660). So **a dead body's knock fall is pushed at 8, a living one's not**:
  the living knocked body writes nothing in the air (as built by PRONE-TILT), the dead one leans past its fall's phase 0.8.
  (A first draft of this item read the bit the other way; research 114's "a flag set (reCOM `!m_isAlive`)" describes the
  same test from reCOM's side.)
- **The death** pushes its play at 8 (`FUN_005a2490` D:L459804); and `FUN_0059b440` marks a dead body's top at 8 on its
  floor step (D:L456563-456565).
- **The fall's phase.** The port's knock fall runs with no `seconds` (till the landing), and its phase was taken as 0, so
  the 0.8 / 0.99 window never opened. The phase is now its clip's own length (`ACTION_SECONDS`, `Walker.tiltTop` and
  `tiltTopOfSnapshot`'s `seconds`): `seal_fallforward01` 15 keys at playback 2, 1.742 s, so the dead knocked body leans
  from 1.39 s of its flight.

**Does a corpse run the rule at all** (`CORPSE_TILT_READING`)? For: the air branch above exists for the dead's word, the
eighteen death clips carry `Normalize` (0.2, 0.8) and the knock's landings theirs, and `FUN_005af930`'s floor step, which
marks the dead's top at 8, is called from `FUN_00550ef0` (D:L418169) past its state-8 return -- so a dead body whose
`+0x174` is not 8 runs the mover, and `FUN_005506a0` runs the rule. Against, from a point not read: `FUN_00550ef0` clears
`+0xf40` (D:L418070) and returns for state 8 (D:L418112-418114) before setting it (D:L418460); once a dead body's `+0x174`
is 8 neither the pass nor the rule runs and its root holds. The writer of `+0x174` = 8 is not found. Default
`'by-span'`, the walker's `dead` body running the rule as built (the room's dead seat, the page's own); `'level'` the
alternative. The page's death poses for other bodies (`net/deaths.ts`, the animator's) are not the walker's top and stay
level; the page's copies of other bodies run the rule only living (`remotePlayers.ts`), as before -- not built for either
reading.

Tests: `viewer/test/rootTiltKnock.test.ts` (the dead knocked body's air lean by its phase, the living one's none and its
landing's lean, the corpse on its window, the page's snapshot path equal to the walker's for both); the room against the
page for a dead knocked body in the air (`match/test/roomProneTilt.test.ts`).

### 7.10 The hostages and the bots' torso aim (PRONE-TILT-2 (5), 2026-10-31)

**Reading, pending review.**

- **Does `FUN_005506a0` run for a hostage?** Yes, by the class. `FUN_005506a0` is in one vtable only, the actor's at
  0x6691a0 (its slot +0x20, ELF 0x6691c0; the same table copied in the `zsealetc` overlay, read 2026-10-31: no other word
  in the ELF or the overlays holds 0x5506a0), stored by the `CSealEx` constructor `FUN_00553ea0` (D:L419421). A hostage is
  an AI controller on that body (research 189 #1, #12: the SEAL's 26-part skeleton; its body's death `FUN_00547af0`); the
  bodies are made by `FUN_005999e0` -> `FUN_00553ea0` (D:L455567), whose callers include an AI-controller builder
  (`FUN_00599690`, D:L455446-455449). Which builder the hostage's spawn takes is not traced; no other body class holds
  the rule. So the rule runs for it under the same gates (reading).
- **What it writes.** The No_weapon set's clips (`civ_*`, research 189 #13) carry no `Normalize` (`motion.rdr`, pinned in
  `viewer/test/hostageTilt.test.ts`), so a living hostage's weight is 0 and its body lies level -- the port's level hostage
  stands. A prone hostage has no prone clip in its set (the push of a missing motion keeps the prior top,
  `FUN_00588bc0` D:L446077-446094), so it is level too. The exception is the knock (LATER 354): its `GLOBAL` clips are the
  SEAL's -- `Land forward` / `Land backwards` (0.5, 0.9), `Prone cover` bare -- so a knocked hostage's landing leans on a
  slope. Built: the room's `HostageFollow.rootTilt` (its walker's root while `thrown`), the hostage capsules turned by it in
  the room's three hostage hit tests (the round's rewind through `HostagePast.tilt`, the order pick, the live ray), and the
  page's copy tilted while its snapshot carries a knock (`remotePlayers.ts` `escorteeTilts`, the same `remoteTilt`). Room
  and page agree tick for tick on a synthetic slope (`match/test/hostageProneTilt.test.ts`), a get-down (prone) hostage
  included: review F1 found the page easing it (the AI's stance prone) where the room's walker, never prone, wrote the full
  tilt at once; both now take no prone ease (`HOSTAGE_PRONE_TILT_READING` `'unprone'`; `remotePlayers.ts`
  `remoteTiltStep`). Review F2: the room's order pick (`Room.orderPick`) misses a hostage's capsule the tilt swung off the
  ray and meets it level (the same test), so the room's tilt argument is held by a test. A dead hostage's death poses
  (the buddy deaths, windows (0, 0.4) and (0, 0.5)) are the page's and stay level, as every corpse's (§7.9).
- **The bots' torso aim and ally ray.** Neither reads a root matrix in the port. The bots aim at a target's feet plus a
  stance height (`match` `bots/matchBots.ts`: 12 standing, 8 crouched, 3 prone), and their ally ray tests the placeholder
  capsules (`bots/shot.ts` `friendlyOnRay`, `bodyVolumes` with no skeleton: `placeholderVolumes`, no pivot, so a tilt would
  not apply); the forge NPCs' `torsoPoint` (`net/botAim.ts`) is called with no skeleton volumes either. Both are the port's
  bot adaptations, not the original's AI, so the rule does not reach them: unchanged, **no bot-visible change**.

### 7.11 Measured against the original (the EPH pass, 2026-10-31)

**Proven** (capture: the original running in PCSX2, sampled over PINE, unscored; runs 20261031T162022Z, 162058Z, 162130Z, 162310Z; `agent-mail/evidence/eph-tilt-measured-2026-10-31/FINDINGS.md` Q2). The settling prone body's root
on M51's incline closes 0.200 ± 0.0005 of the remaining angle a guest frame (`ease2.py`'s three-decimal figures; n = 4 runs × 13 frames after the transition, 52 frames, every one 0.200; re-derived 2026-10-31 by the implementer and the reviewer) (1/30 s), exponentially, after the `Stand ->
Prone` transition (0x19) ends, in all four runs, to the full slope (tiltOverSlope 1.00): so `PRONE_TILT_EASE_BASIS_READING`
`'root-up'` and the 0.2 (`0x3e4ccccd`, D:L413267) are the original's, and the rule runs once a game frame -- `FUN_005506a0`
calls `FUN_00548090` once an actor tick (D:L417863). The port stepped it every 60 Hz walk tick and eased twice as fast; it
now steps on a `GameFrameAccumulator` (`mover.ts` `Walker.tiltClock`, reset at the placing; `remotePlayers.ts`
`remoteTilt` on `GAME_FRAME_DT`; the room's hostage walker and the knock through the same `Walker.tick`), the 0.2 kept
(`rootTilt.test.ts`: 29 or 30 steps a second, each 0.8 of the last). The PS2's "5 s settle" in the run's report is the
analyser's (it keeps the first read of each guest frame, often before the write); on the last read it settles within a
degree in 0.87-0.90 s.
What holds it: no harness spec or golden trace holds it yet -- `rootTilt.test.ts` and `remoteTiltClock.test.ts` hold the transcription.

**The two clocks' boundaries** (review F5). `Walker.tiltClock`'s game-frame boundary is set at the placing, the air's
`airClock` at each take-off, so during a knock's flight the rule can read the airborne flag and the fall's phase one
60 Hz tick off the flight's own frames. The page and the room run the same walker and agree; no code change.

**The pitch is not a sign error** (FINDINGS Q1). The two sides lay on different floor triangles (the page's slide crossed
a crease at z 858.7); on the shared triangle the root quaternions agree exactly (x / z 0.37257 both sides), and the
quaternion convention reads right (tiltUpNormal 0.00). **Untested: the actor-frame turn's direction** (`worldToBody`'s
sign, `FUN_00306fd0` with the conjugate, D:L413260-413264): every run faced yaw 180, a half turn that is its own
inverse. A run at yaw 90 or 270 with both sides on one triangle settles it.

**Cost.** The game-frame step halves the rule's calls; f9's bot check measured the room's `room.step` at +6-8% with the
tilt before it (recorded here as the figure the gameplay lane was given, not re-measured on this branch).
