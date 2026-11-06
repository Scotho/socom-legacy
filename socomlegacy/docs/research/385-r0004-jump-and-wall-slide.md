# 385 -- r0004's jump and wall slide: the running jump on speed alone, the standing jump's forward-only stick (R4B-12, G3)

- Date: 2026-11-05. Task R4B-12 of the [r0004 plan](../plans/r0004-option-b.md) (segment-body-2 G3), under the owner's
  ruling OT.R97 (MISSION: r0004 is the specification for gameplay). Branch `agent/sb2-g3`.
- Track: simulation. It changes what the standing jump's stick does (no sideways drive) and cites the jump's other r0004
  edits where the port already gives their outcome.
- Status: **reading, pending review** (R4B.R3). Nothing here is measured running. This note's author re-read every r4
  site below with capstone in `game/overlays_r0004/socom2_game_r0004.elf` (the PINE dump) **and** the served decrypt
  `game/r0004/served/socom2_game_served.elf`: no word differs over 0x5835d0-0x583770, 0x57fbf0-0x57fd70,
  0x5b6ba0-0x5b6c78, 0x5a07f0-0x5a0830, 0x580300-0x580360, 0x5b8f40-0x5b8fa0 and 0x5b7830-0x5b7868, nor at the data
  0x422080-0x42208c (three zero floats), 0x41eb08 (0.03) and 0x65c268-0x65c298 (the `CSealEx` type info). None falls on
  the dump's contaminated words (0x1e70cc, 0x2cc670/674). A reviewer who did not write this re-reads them before they
  count as readings (R4B.R4). The r0001 counterparts were read in `game/disc/socom2_game.elf` at the same time
  (0x57e300-0x57e370, 0x57a9c0-0x57ab90, 0x5b0d30-0x5b0dc8).
- Sources: `C:/Projects/agent-mail/evidence/r0004-investigation/cluster-wall-slide-fix.md` §0-§4, REPORT.md row G3 and
  the corrections at its foot; dot's reviews (`r0004-dot/r0004-consolidated-adversarial.md` row G3,
  `r0004-post-report-traces.md` "G3", `workflow-report-review-dot-0925.md` row G3 / 89: the speed/contact branch and the
  +0x1334 test corroborated, the rest unresolved there). r0001 is cited `FUN_<addr>` / `D:L<line>` of
  `game/analysis/socom2_game.elf.decomp.c`. No decompiled or disassembled text is pasted.
- **The cluster note and the r4 code agree on every item below**: no item stopped for a disagreement.
- **P2 rejected by the owner, OT.R108 (the owner, 2026-11-06, in the controller's seat: "EXECUTIVE RULING: we are LEAVING the in air movement in, this is a known rejection of that r0004 segment.")**: the reading of §2 stands, and the port does not apply it. The standing
  jump keeps r0001's air control (both axes at the sets' tops, `FUN_0057a330` D:L438955-438985), a known, deliberate
  departure from r0004; G3's P2 build is reverted on the page and in the room alike (one `Walker`), and
  `JUMP_LATERAL_SNAP_PLACEHOLDER` goes with it (§8). P1, P3, P4, P6 and P7 stand as filed.

## 0. The answers

| # | r0004 | the port before | this task | level |
|---|---|---|---|---|
| P1 | no wall-contact test: `|v|^2 >= 225` is always the running jump | already (LATER 614, B203's `JUMP_CONTACT_PROVEN` 'none', proven by ac's capture) | cited natively; no code change | proven (the capture), reading (the native site) |
| P2 | the standing jump drives the forward axis only | r0001's: both axes at the sets' tops | built, then **rejected by OT.R108** and reverted: the port keeps r0001's air control | reading (not applied) |
| P3 | a SEAL's node is never stored as the contact | the contact claim holds already: the port's grid holds no body; the bodies passing through each other is the port's own (LATER 711) | pinned, the contact only (central `roomR0004Jump.test.ts`) | reading, pending review |
| P4 | a turn step's velocity zeroed before the speed test; the root-delta's vertical zeroed | the outcome already: the port has no root-delta velocity | pinned (viewer `r0004Jump.test.ts`) | reading, pending review |
| P5 | jump refused online while `+0x1334 > 0` (a climb request pending) | no pending request exists in the port | not built: R4B-14 (G5) owns the timer | reading, pending review |
| P6 | jump refused while one of `FUN_005a78d0`'s six climb clips is on top | the outcome already: a move holds the mover (`Traversal.busy`) | cited | reading, pending review |
| P7 | the slow branch returns no jump while holding a turret (`+0xeb8`) or in the turret set | the outcome already: a mounted body's command carries no jump (PF.R31) | cited | reading, pending review |

## 1. P1: the running jump on speed alone (LATER 614, closed as r0004's)

r4 0x583668-0x583694 forms `|v|^2` of `+0x2c..+0x34` against 225.0 (`lui 0x4361`) and `bc1f 0x583760` takes the
running jump (`0x58e160(actor, 8, 6, 0, 0xd)`, r0001 `FUN_00588bc0`) with no load between. r0001 0x57e348-0x57e358
(`FUN_0057e1b0` D:L440815-440819) loads `+0x10ac` there and takes the standing jump when it is set. The port's
`Walker.jump` reads no contact (`JUMP_CONTACT_PROVEN` 'none', B203: proven by ac's r0004 jump-near-wall capture,
2026-11-04); LATER 614's divergence was closed by B203 and is r0004's at the native site. No code change. Held by
`weaponLine.test.ts` ("a running jump pressed 17.4 out with the contact set launches", M51 and a synthetic twin).

## 2. P2: the standing jump without the strafe -- rejected by OT.R108

*OT.R108 (2026-11-06): the reading below stands; the port does not apply it. The port's paragraph after the list is
what G3 built and the ruling reverted; `Walker.jumpControl` is r0001's rule again (research 80 §2.3).*

r0004's `Jump` block in the twin of `FUN_0057a330` (r4 0x57fcb8-0x57fd54, against r0001 0x57aa80-0x57ab7c,
D:L438955-438985):
1. Only `+0x240` (forward) is tested off rest (r4 0x57fce0 -> 0x531c80 = `FUN_0052eb60`, the rest 0.03 at 0x41eb08 as
   r0001's at 0x3f3428). r0001 tested `+0x244` (lateral) too, and entered when either was off rest.
2. The ramp (r4 0x57fcfc -> 0x58c240 = `FUN_00586c10`, whose two axes ramp independently, D:L444957-) is called with
   its lateral argument a stack scratch (r4 0x57fcf8 `sp+0xfc`): `+0x244` is not ramped in this block, and only `+0x24c`
   is saved (r4 0x57fd18; r0001 saved `+0x248` and `+0x24c`). The scratch is never written before the ramp reads it
   (the function's frame is 0x100 at r4 0x57f580; `sp+0xfc`'s only reference in it is 0x57fcf8), so the ramp's lateral
   snap test (D:L445021: `|+0x248|` over 0.78 and the step over 7.8 a second) runs on an indeterminate value, and a snap
   restarts the pose cross-fade (`FUN_0028e3e0(+0x170)`, `+0x178` / `+0x17c` = 0.2, D:L445033-445035). The position does
   not depend on it; G3's port counted the forward axis' snaps alone (`JUMP_LATERAL_SNAP_PLACEHOLDER`, §8, withdrawn
   with OT.R108).
3. Only the forward/back tops are taken (r4 0x57fd14 -> 0x591200 = `FUN_0058bc00`); `FUN_0058bb50` (the side tops) is
   not called.
4. Only `+0x34 = -forward x top` is written (r4 0x57fd34-0x57fd54). `+0x2c` keeps what the block before it wrote (r4
   0x57fca4, the same store as r0001's 0x57aa54): the clip's root motion, which the port models as 0 for `seal_jump`
   (research 80 §2.3: its root does not travel).

The port (`viewer/src/mover.ts` `jumpControl`, the page and the room's `MoverSim` alike, one `Walker`): the forward
axis off rest (`FORWARD_DEAD` 0.03) ramps and drives at `airBands`' forward or back top; the lateral drives nothing and
`stickRight` keeps the stick as given (`+0x244` unramped; the tick head copies it into `+0x248`, D:L438704). Standing
65 ahead, 37 back; crouched 20; a sideways stick alone, nothing.

**r0001, superseded by r0004 (OT.R97, R4B.R6):** the lateral times the side sets' top (65 standing, 20 crouched) and
a diagonal at both axes' tops (research 80 §2.3, `movement.jump.air-control` before this task). That a run held into a
wall and jumped became r0001's standing jump (P1) and then strafed along the wall at 65 for 0.99 s is the cluster
note's best-evidenced "wall slide" -- an **inference**, no capture measures it (§7 scene 2).

## 3. P3: no SEAL as the stored contact

r4 0x5b6bc4-0x5b6bd4, the twin of `FUN_005b0d30` (D:L467394-467420): with a hit given, `jal 0x5a07f0` on the hit's
node (`lw a0, 0x1c(s2)`); 0x5a07f0 casts the node's `+0x94` through 0x1821d0 against the type info at 0x65c298, whose
name pointer 0x65c268 reads `CSealEx` (r0001's twin type info at 0x65c238, `FUN_0059acd0` D:L456241-456258). A SEAL
returns without the stores (r4 0x5b6bd4 `bnez` -> 0x5b6c58): the previous contact is kept. The offsets
`+0x1090..+0x10c4` are r0001's.

The port: the movers' collision grid holds the map's polygons only (`groundGrid`; research 217 s7.1, `aimQuery.ts`,
`regionCull.ts` say the same of the floor and the aim), so a SEAL is never a hit and never the contact: r0004's contact
claim holds. Held by central `roomR0004Jump.test.ts` (a run into a standing SEAL keeps no contact; the jump there is the
running jump, on the speed). The climb onto a SEAL is R4B-13's (G4).

**Not r0004's (review G3-1 F2):** the port's bodies pass through each other. r4's own cast shows the original's move
solver does hit SEAL nodes (both builds: r0001 stores such a hit as the contact, r0004 skips only the store), so the
pass-through is the port's divergence from both, filed as **LATER 711**; the pin asserts the contact alone and stays
true once body hits are built.

## 4. P4: the turn step's velocity

r4 0x583634-0x583664: with `+0x105f` bit 0x4 set (the "previous root sample valid" bit `FUN_0057a330` sets in Step
0x10, Crouch step 0x15, Prone turn 0x1c and `DAT_003deeb8`, D:L439126-439140), `+0x2c`, `+0x30`, `+0x34` take the zeros
at 0x422080-0x422088 before the speed test: such a jump is always the standing jump. r4 0x580324-0x58033c (against
`FUN_0057a330` D:L439131-439137): the root-delta velocity is built at `sp+0xb0..0xb8` and `sw zero, 0xb4(sp)` drops its
vertical before the stores, so `+0x30` is 0.

The port models no root-delta velocity (`+0x14c0`, `+0x105f` bit 0x4): a body turning in place has no velocity, so a
jump pressed then is the standing jump and its height the actor's -- r0004's outcome. Held by viewer
`r0004Jump.test.ts` (P4). That r0004's vertical zeroing is the fix for the launch glitch (research 230 §6, PTW.R2,
H155, LATER 299) stays an **inference**; the quirk is the owner's.

## 5. P5-P7: the new refusals

- **P5** (r4 0x5835e0-0x5835fc): under the network byte `[0x45d481]` (r0001 `DAT_0045a0c1`), `+0x1334 > 0` refuses.
  `+0x1334` is set to 150 at the climb request (r4 0x5b8f44/0x5b8f58 and 0x5b8f7c/0x5b8f98, both paths of the twin of
  `FUN_005b2620`) and counted down while the request waits (r4 0x5b7838-0x5b7844, the twin of `FUN_005b1570`; at 0 the
  request is cleared and net message 4 sent, 0x5b7848-0x5b785c). The port has no pending climb request (its movers start
  the climb at once on the page and in the room), so the refusal has no state to read. **Not built here:** R4B-14 (G5,
  the ClimbAsk timeout) owns `+0x1334`, and the jump is one of its four readers.
- **P6** (r4 0x583608-0x58361c -> 0x5ad5b0 = `FUN_005a78d0`, D:L462447-462466: `Climb crate` 0x2a, `Climb medium`,
  `Stand -> Hang` 0x21, `Climb over`, `Step up`, `Stand -> Ladder` 0x2c): refused with any on top. The port's traversal
  holds the mover through each (`Traversal.busy`, `MoverSim.jump`, `WalkMode.jump`), so `Walker.jump` is never asked
  there; the hang's own let-go is the jump latch (`FUN_00581dc0`, D:L418136-418138), not this function.
- **P7** (r4 0x58369c-0x5836bc, the slow branch only): `+0xeb8` set (a turret held) or `+0x528` equal to `[0x4507a0]`
  (r0001 `DAT_0044d410`, the turret set; the pairing at r0001 0x58081c / r4 0x585dbc) returns no jump. A mounted body's
  command in the port carries no jump (PF.R31, `room.ts` "the command a mounted body runs"); r0001's own
  `FUN_005b4340(actor, 0xb)` already refused the turret set (D:L469473).

## 6. The pins this task moved

*OT.R108 (2026-11-06) moved each back: `walk.test.ts`'s air-control pin to main's text (65 aside, the diagonal 65), the
MP2 walk hash to c2b30349..., `movement.jump.air-control` to research 80 with the ruling named, roomFuzz's top speed to
65 x sqrt 2 and its floor to `> 65`, research 169 s10's sentence to r0001's; `r0004Jump.test.ts`'s P2 block now pins
the kept air control.*

- viewer `walk.test.ts` "the standing jump's stick drives it at the forward sets' top speeds: 65 ahead, 37 back, none
  aside, 20 crouched" (was "... 65 aside ..."): aside 65 -> 0, the diagonal 65 -> 65 x sqrt(1/2).
- viewer `bridgeWedge.test.ts` "the segment arm's MP2 walk hash": counts [383 launch, 116 stand] kept, the hash
  c2b30349... -> 0a7b0923....
- `docs/parity/registry/movement.json` `movement.jump.air-control`: the claim, the source and the note re-pointed here.
- central `roomFuzz.test.ts` (review G3-1 F1): the mover's top speed 65 x sqrt 2 = 91.9 (r0001's diagonal standing
  jump, superseded) -> 65; its fastest-stride floor `> 65` -> `> 65 - 1e-6` (every seed's fastest is now 65 to the
  sum's rounding, 65.000000000003). With `jumpControl` reverted to r0001's rule in a scratch run, all three seeds fail
  on outruns (66.4 a second, 4.427 u over 4 commands); research 169 s10's sentence re-filed the same way.

## 7. The capture that settles it (for ac's rig; not run)

PCSX2 r0004 against r0001, the same inputs, frame by frame. Per guest frame on the walker's actor: `+0x1c..+0x24` (the
feet), `+0x174` (stance), `+0x534` (the action: 8 the running jump, 178 `Jump` on r0004, the 0x409cb8 halfword),
`+0x2c..+0x34` (the velocity), `+0x240`, `+0x244`, `+0x248`, `+0x24c` (the sticks), `+0x105f` (byte, hex),
`+0x1090..+0x10ac` (the stored contact), and on r0004 `+0x1334`. In scene 1, also `+0x170` (the pose cross-fade
`FUN_0028e3e0` restarts) and `+0x178` / `+0x17c` (0.2 on a snap): whether the lateral snap fires in r0004's jump
(`JUMP_LATERAL_SNAP_PLACEHOLDER`, withdrawn with OT.R108).

1. **M51 offline, open floor, the standing jump with the stick aside.** Stand still (speed 0), hold the stick full
   right, press Jump, hold 1.2 s. Expected r0004: `+0x534` 178 for 0.99 s, `+0x2c` at the clip's root (about 0) every
   frame, `+0x244` = the raw stick (1.0) unramped, the feet's lateral travel about 0. r0001: `+0x2c` = 65 x the ramped
   stick, about 64 u of lateral travel. Then the stick at 45 degrees: r0004 `+0x34` = -0.707 x 65, `+0x2c` about 0.
2. **M51 g19733's south face, the wall slide** (start (3826.5, -182.91, 3175.3), square yaw 100.6, as the jump-near-wall
   capture): run in at full stick, hold into the face until `+0x10ac` is set, then press Jump with the stick at 45
   degrees along the face. Expected r0004: `+0x534` 8, a leap carrying `+0x38..+0x40`, no stick. r0001: 178 (the
   contact test), then 0.99 s of drive at 65 x 0.707 along the face -- the slide.
3. **A turn step.** Standing still, turn the view at full rate until the Step plays (`+0x105f` bit 0x4 set), press
   Jump. Expected r0004: `+0x2c..+0x34` 0 at the press, `+0x534` 178, `+0x30` 0 every frame of the step. r0001: the
   velocity the root delta over dt; 8 if it reaches 15.
4. **Online, two clients, an MP map: run into the other client's standing SEAL** and press Jump at contact. Expected
   r0004: `+0x10ac` never the other SEAL's node (it keeps the last wall's, or 0), the jump 8 at speed. r0001: the body can
   become the contact and the jump 178.
5. **Online, a climb request pending** (optional, R4B-14's): ask a climb, then press Jump inside 150 ticks. Expected
   r0004: `+0x1334` 150 counting down, the jump refused until 0 or the request's answer.

## 8. Readings and placeholders

P2 is built on the r4 sites above and the existing `airBands` and `FORWARD_DEAD`; `+0x2c`'s pre-block value is the
port's existing clip-root reading (research 80 §2.3). One placeholder was added (review G3-1 F3) and is **withdrawn**
with the P2 build by OT.R108 (2026-11-06): the port ramps both axes again (r0001's `FUN_00586c10` on `+0x244`), so the
lateral snap is the read one and no stand-in is left. Its row, kept for the record (not a ledger row):

| Name (withdrawn) | What it stood in for | Built | What would have settled it |
|---|---|---|---|
| `JUMP_LATERAL_SNAP_PLACEHOLDER` (retired by OT.R108, 2026-11-06) | the ramp's lateral snap in r0004's standing jump, run on the unwritten `sp+0xfc` (r4 0x57fcf8; D:L445021, D:L445033-445035): whether and when it restarts the pose cross-fade | `'forward-only'`: `Walker.jumpControl` counts the forward axis' snaps alone (`stickSnaps`) | §7 scene 1's `+0x170` / `+0x178` per frame through the jump, a lateral stick past 0.78 and the forward off rest |

Filed beside it, not a constant: **LATER 711**, the port's bodies passing through each other (§3).
