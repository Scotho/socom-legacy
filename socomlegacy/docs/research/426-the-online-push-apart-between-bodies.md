# 426 -- The push-apart between bodies, online and offline: FUN_0054f7e0 read a second time (LATER 711)

- Date: 2026-11-15. The MOVEMENT lane of the weekend mega sprint (seat "wm-move lane seat (weekend mega sprint)",
  Shadow PC 1), branch `agent/wm-move-711`, base `agent/next` 4d89ef980a; the main controller's brief (2026-11-15T06:45Z),
  task 1, step (a): the second reading LATER 711 owed (research 385 s3 and s8; `cluster-wall-slide-fix.md` s2.3; review
  G3-1 F2).
- Track: simulation. Status: **reading, pending review** (sections 1-5); a fresh review (2026-11-15, PASS WITH FINDINGS, high) re-read every citation, its findings folded the same day; a third seat's independent read (8f's, 2026-11-15, "sound with corrections", medium-high) folded the same day: the offline caller, the enemy fit limited to L10a, the walker's 14 u a candidate with the leg that decides it. This is the second reader's reading of the
  function the collision audit (seat 8a, 2026-11-13) and research 391 s2.10 read first; an independent read by a third
  seat is asked. The measurements in section 6 are the rig's on the original running (**proven within their stated
  spread**, the rig's own scoring: shadow-relay-1, 2026-11-15, `evidence/weekend-mega-2026-11-14/rig/RELAY1-push-apart-legs-answer-2026-11-15.md`;
  the Q22 files on Shadow PC 1 under `evidence/q10-hitreg/q22-push-apart/` and `.../standing/`). How they fit the code is
  **inferred** where section 6 says so. Step (1), the contact slide, is built (section 9).
- Evidence kinds, kept apart: **(D)** source inspection of the r0001 decompilation (`socom2_game.elf.decomp.c`, cited
  `FUN_<addr>` and `D:L<line>`); **(A)** the r0001 image's own instructions (`game/disc/socom2_game.elf`, read with
  capstone 5.0.7; cited by r0001 address `0x5.....`), where the decompilation hides an argument passed on the stack;
  **(W)** r0004's instructions (`game/overlays_r0004/socom2_game_r0004.elf`, cited `r4 0x.....`) against r0001's;
  **(O)** the rig's measurements on r0004 online. No decompiled or disassembled text is pasted.
- The reading was made by the seat and, independently, by a reader sub-agent of the seat; the seat re-read at the
  source every place where they disagreed and every load-bearing site (section 7 lists them).

## 0. Answers

1. **What stops a body against another is `FUN_0054f7e0`**, run once a frame for each moving body, ONLINE AND OFFLINE:
   online from the actor's update (`DAT_0045a0c1` set, D:L416574-416576), offline from the per-frame task
   "body_collide_tick" (`FUN_0054f570`, D:L417278-417314, registered at D:L50926; section 1). (The first draft of this note,
   and research 391 s2.10, said online only: corrected on the third seat's independent read, 2026-11-15.) Two mechanisms, each acting on the updated actor's own displacement
   and never on the other body's position, displacement or velocity (D:L417412-417668; the other's AI controller is
   given a bump stimulus, section 4):
   - **the contact slide** (any controller): inside the two bodies' combined radius, a swept test of the two cylinders
     over this frame's displacement; on a hit moving inward, the inward part of the displacement is removed (and of the
     velocity `+0x1350`). Head-on that stops the body; off-centre it slides round.
   - **the muzzle push** (the local human only, controller vtable `+0x2c`): the body's predicted muzzle point
     (`+0x14b0`, the "firepoint" node) is kept at least the other's radius from the other body's centre, horizontally,
     by adding the shortfall to this frame's displacement.
2. **Radius and height by posture** (`+0x174`): radius 6 standing, 7 crouched, 8 prone; height 19.1, 15, 6. The other
   body's radius is 8 in state 2 **or 8**. Both radii are x1.75 while that body's weapon-raised envelope (`+0x1160`) is
   over 0.05.
3. **Who is pushed:** only the body being updated, by its own console. A stationary body is never displaced by
   another's movement in the rig's legs (proven, S1/L1). In the code its own update early-outs only when it neither moves
   nor has `+0x23c` over 0.001 (an OR, D:L417418-417421; `+0x23c` unread): a still local human with `+0x23c` set would
   run the muzzle push, which acts whether or not the body moves. The mover's console places a remote body from the
   network, not by this function.
4. **There is no team test** on this path.
5. **r0004** keeps r0001's function and adds: a gate in front of r0001's climbing gate ("Step up", type 0x23), a flag
   for a prone body (or types 0x13 / 0x19) that changes who pushes it and how, a cap of 6 on the muzzle push's depth,
   and the `+0x1354` removal at the muzzle site (section 5; research 391 s2.10 read the same, with one word corrected).

## 1. When it runs (D, A)

- Two callers. ONLINE: the actor's update `FUN_0054d9a0`, when `DAT_0045a0c1` (a network game) is set,
  D:L416574-416576, after the frame's displacement `+0xf44` is formed and before the world collision takes it
  (D:L416520-416568, D:L416677-416687). OFFLINE (the byte clear): `FUN_0054f570` (D:L417278-417314), the per-frame task
  registered under the name "body_collide_tick" (D:L50926; the string at 0x3e1fb0 in the image), walks the object list
  and calls it for each SEAL (type byte 2) whose state is not 8, whose `+0xe0` bit 6 is set and whose displacement
  squared is at least `DAT_0064fcd0`; below that it clears bit 6 and writes bit 7 back unchanged (0x54f650-0x54f694; 8f's
  second read corrected an earlier "moves bit 7"). The call passes the body in `$a0`
  (0x54f5c4, 0x54f6a0 in the image; the decompilation's `param_1` there is the task's argument, a slip of the
  decompiler). r0004 keeps both callers (the third seat's read). So the build covers offline play and the test room too.
- **`+0xf44` is a per-frame displacement:** the frame's dt times the velocity `+0x64` (D:L416520, `FUN_00309180`), with
  `+0x1350` x dt added in some states (D:L416527-416530). So the sweep below covers one frame. `+0x1350` is per second.
- It returns at once unless the displacement's square exceeds 0.0002 or `FUN_001b3620(+0x23c)` exceeds 0.001
  (D:L417418-417421), and unless `+0xe1` bit 4 and `+0xe0` bit 6 are both set (0x54f8b8-0x54f8e4).
- The climbing gate (D:L417426-417437): in state 5, posture 5, or with type 0x2e on top it returns 0, unless 0x2e is on
  top and its flag-0x20 test lets it through; then a later inward hit hands the body to `FUN_0057f5b0` (the climb-off's
  reversal) and returns (D:L417610-417613).
- It clears `+0x21c`'s value 2 on entry (0x54f80c).

## 2. The two bodies' cylinders (D, A)

| | own (the updated actor) | other |
|---|---|---|
| radius | 8.0 in state 2, 7.0 in state 1, else 6.0 (0x54f99c-0x54f9cc; D:L417441-417449) | 8.0 in state 2 or 8, 7.0 in state 1, else 6.0 (0x54fbb8-0x54fc2c; D:L417490-417499); its height by state 2 / 1 / else, so a state-8 body takes radius 8 but height 19.1 |
| x1.75 | while `FUN_00286b80(own+0x1160)` > 0.05 (0x54fa18-0x54fa48; D:L417451-417454) | while `FUN_00286b80(other+0x1160)` > 0.05 (D:L417499-417502) |
| height | 6.0 / 15.0 / 19.1 (0x4198cccd) by state 2 / 1 / else (0x54f9d4-0x54fa10; passed on the stack, 0x55000c) | the same table by the other's state (0x550000-0x550058) |

The 1.75 scales the radius only, never the height. The neighbours are the actor's list `+0xd8` / `+0xd4` (0x30-byte
entries; entry word 4 the 3D distance squared between the two `+0x1c` positions, built by distance alone, D:L145874-145958).
Only SEAL objects (type byte 2) with body flag `+0x5c` bit 0 count, and the carrier pair (`+0xeac`) is skipped either way
(0x54fb10-0x54fb64; D:L417475-417480).

**The prone skip.** When the other is in state 2 or 8 and the own body is upright (not posture 8 on top, not state 2, 8
or 10: D:L417466-417470), the function sets `+0x21c`'s value 2 and does nothing else with that body (D:L417485-417489).
A mover whose own word is 8 or 10, or whose anim byte 0x2b is 8, does not skip a prone or state-8 other either; the port
has no such states.

**Candidates.** A body is looked at when its distance squared is under ((rA + rB)^2 + m) x 2.5, where m is the own
muzzle offset's horizontal length squared for the local human, else 0 (D:L417455-417465, D:L417503-417504).

## 3. The muzzle push: the local human only (D, A)

- The controller's vtable `+0x2c` answers 1 for `CSealCtrl` (the local human, vtable 0x6694b0; research 305, 325, 404)
  and 0 for `CRemoteCtrl` (vtable 0x669590; its slot function 0x5e6250) and `CSealCtrlAi` (vtable 0x6693f0; 0x575c30); `+0x30`
  answers 1 for `CSealCtrlAi` only: read in the image's vtables.
- **`+0x14b0` is the muzzle:** `FUN_005df450` (D:L493873-493890) looks up the body's model nodes named "aimpoint" and
  "firepoint" (the strings at 0x6603f0 and 0x660410, read in the image), caching the handles at `+0x14ac` / `+0x14bc`,
  and `FUN_005df930` writes their positions relative to the body, rotated by the body's matrix without translation, into
  `+0x14a0` (aimpoint) and `+0x14b0` (firepoint). It moves with the pose and the weapon each frame.
- For the local human, with the other's radius rB (not rA + rB): the predicted point is the body's position plus the
  muzzle offset plus this frame's displacement, its height replaced by the other's (0x54fd14-0x54fd24); if its
  horizontal distance to the other's centre is under rB (0x54fd58), the shortfall times the horizontal unit vector from
  the other's centre to the body's current position is added to the displacement (D:L417544-417573; 0x54fd64-0x54fe28).
  It is predictive: it acts on this frame's displacement before the move.
- For an AI body (`+0x30` answers 1): against a non-AI body only a bump sound is marked; against another AI body both
  radii are scaled by 0.65 (`DAT_0064fcc0`, read in the image) for the sweep below, after the contact gate is formed with
  the unscaled radii (0x54fe68-0x54fee8). A remote body (neither) takes neither.

## 4. The contact slide: any moving body (D, A)

- Only when the distance squared is under (rA + rB)^2 (D:L417582): a per-axis prefilter along the displacement
  (0x54fef0-0x54fffc), then `FUN_00550330` (D:L417669-417755) with the other's position, rB, its height, the own
  position, and on the stack rA, the own height and the displacement (0x550000-0x550070).
- `FUN_00550330`: the two height slabs must overlap over the frame (a fixed overlap test when the displacement has no
  vertical part, else the entry and exit times clamped to [0, 1]); then the horizontal circle of radius rA + rB swept
  over the displacement; a start already inside clamps the contact time to the slabs' entry time (0 when the slabs already
  overlap; D:L417738-417739). Out: the contact point (the own position
  plus the displacement at that time) and the normal, the horizontal unit vector from the other's centre to that point.
- On a hit whose displacement runs inward (its dot with the normal below 0): the climbing case goes to `FUN_0057f5b0`;
  otherwise the inward part is removed -- the displacement less its component along the normal (0x550074-0x550104; the
  dot by the COP1 multiply, add and multiply-add at 0x5500a0-0x5500ac, `FUN_00309180` scaling the normal, `FUN_00309200` subtracting). The same
  removal on `+0x1350` when its dot is below 0 (0x550108-0x550174).
- Unflagged (r0001 always; r0004 outside its prone flag, section 5), the slide never pushes a body back out once inside:
  it only stops further inward motion, and stops acting when the normal no longer opposes the displacement. Under
  r0004's flag it does push out (section 5.2). The muzzle push (section 3) pushes outward along the line of centres.
- A bump stimulus (`FUN_00558440`, 0.1 = `DAT_0064fcc8`; it writes slots of the record at the AI controller's `+0x324`,
  the other's controller when the other is AI -- what the AI does with it is unread, not a sound as first written) only
  when a push or a hit acted and an AI is involved (D:L417620-417647).

## 5. The weapon-raised envelope `+0x1160`, and r0004

**The envelope (D).** `FUN_00286b80` (D:L130775-130812) reads four floats (attack, sustain, release, remaining) and
returns a 0..1 level smoothed. The actor's are set by `FUN_005dffc0` (D:L494278-494287: attack 0.1 s, sustain 100000,
release 0.5 s, on the actor at `+0xee4..+0xef0`; `FUN_005dfe30(actor, 1)` copies them into the actor's `+0x1160` through
`FUN_00286d90`, D:L494264-494265, re-read by the fresh review) and zeroed by `FUN_005dfff0`; `FUN_005dfe30(actor, 1)` starts the rise and sets
`+0xf74` to 0x11, `(actor, 2)` the fall, 0x12 (D:L494233-494274). The local human starts it from `CSealCtrl`'s frame
method `FUN_00594cf0` on a pad button (the pad read at D:L453543; the rise started at D:L453520 (and D:L453600 / 453613 / 453634), the fall at D:L453488; which button is unread), AI states start it too (D:L422551, 422600,
424431), and a remote copy takes its owner's through the network byte `+0x7e` (D:L162311; the sender's `FUN_005e0010`,
D:L161978, D:L494304-494310). **Inferred: the weapon raised to fire.** It also gates the barrel-against-wall test at 0.5
(D:L414130). It is not a sprint, a bump or a stance change.

**r0004 against r0001 (W)**, r4 0x554730-0x555490 against 0x54f7e0-0x550330:
1. A gate is **added in front of** r0001's climbing gate (which r0004 keeps, r4 0x5548dc-0x554964): when climbing it
   returns 0 unless "Step up" is on top, and it returns 0 with type 0x23 on top (r4 0x554838-0x554884). Research 391
   s2.10 says r0004 "replaces" r0001's gate: it adds one.
2. A flag (r4 0x554888-0x5548cc) when the own state is 2 (prone) or type 0x13 or 0x19 is on top. Under it, a body not in
   state 2 or 8 is skipped (r4 0x554ba8-0x554bb4); the muzzle push survives only against the displacement (`+0xf44`, which r4 0x5547d8 puts in $s3 -- research 391's
   "velocity" is this displacement): when its dot with the push is below 0 the displacement is zeroed and the depth capped
   at 1, then the push added (r4 0x554df8-0x554e64, 0x554f10-0x554f3c); at the contact site the displacement is zeroed and
   the dot floored at -1 before the normal's part is taken off (r4 0x5551f0-0x555250). **So under the flag both sites
   replace the frame's motion with an outward step of up to 1 u along the normal: a push back out**, which the unflagged
   function never makes.
3. Unflagged, the muzzle push's depth is capped at **6** (r4 0x554e68-0x554e88).
4. The muzzle site also removes the push's component from `+0x1354` (r4 0x554ea8-0x554f0c).
5. Fields: `+0x1350` is `+0x1354` in r0004; `+0x14b0`, `+0x1160`, `+0x174`, `+0xf44`, `+0x21c` and the controller slots do
   not move. `FUN_00550330`'s twin (r4 0x555490) and the envelope reader's (r4 0x287f10) are the same instructions;
   0.65 and 0.1 are equal (r4 0x64e440, 0x64e448).

The rig runs r0004: the measurements below are r0004's.

## 6. The rig's legs against the reading (O; fits inferred)

Positions on the mover's console (the mover a local human; the other a remote `CRemoteCtrl` copy). The remote copy is
placed toward the last network position with smoothing, teleported beyond about 31.6 u (`FUN_005e6400`, D:L497363,
D:L497409-497458): no velocity term on the receiver.

| Leg (proven, the rig's spread) | Fits the reading? |
|---|---|
| S1 a standing runner into a stationary standing teammate stops at 10.71-10.86 u; the teammate never moves | The teammate's not moving: **read** (sections 0.3, 3, 4). The 10.8: **inferred, two candidates** -- the contact slide at 12 less one frame's travel past it (the list's distance is the frame's start), or the muzzle push at 6 + a running muzzle reach of about 4.8. The tight spread favours the muzzle push. |
| S2 a walker stops at 14.05-14.26 and holds | **A candidate only:** the form rB + h is in the code (the muzzle push), h the muzzle's reach unread: 6 + a walking reach of about 8.1-8.3, held without overshoot (it is predictive). Alternatives the code allows: the teammate's envelope on (rB x 1.75), or the walker's own. Outside the plain contact radius (12). **The leg that decides it:** the mover walks BACKWARDS into a standing teammate -- a stop near 12 confirms the muzzle push, near 14 refutes it (added to the rig's Q22-T). |
| S11/S12 standing into crouched, crouched into standing: 12.0-13.0 | rB 7 (crouched other) or 6, with the posture's reach: fits either mechanism; no figure is taken. |
| L1 crouched runner 12.9-13.4; L2 crouched walker 18.1-19.2 | Contact 7 + 7 = 14 less a frame's travel; the walker 7 + a crouched-walk muzzle reach of about 11-12 (**inferred**). |
| S3/L3 head-on runners stall, then pass (1.5-2.2 u standing; 2.4-5.1 crouched, stepping to their own right) | **Inferred:** each console stops its own body against the other's lagging copy; the slide does not push out, so once the copies cross centres the inward test stops acting and both run on. After the
crossing the muzzle push may push forward only while d + h < rB (h the muzzle's reach, unread); otherwise nothing acts
(the third seat's read: the earlier "then pushes forward" was unconfirmed). The step to the right is unread. |
| S4 head-on walkers close to 12.1-12.7, then each is driven back 4-5 u to about 18 | **Inferred:** each muzzle push works against the other's lagging copy; a depth of up to 6 (r0004's cap) added in one frame drives the walker back, and the lag carries both further. |
| S5/L5 off-centre 2 or 4 u: blocked, then round | **Read:** both mechanisms act along the line of centres and leave the tangential part. Which side (3 right, 2 left at 4 u standing) follows the offset and the lag: not modelled. |
| L6 crossing walkers, L7 overtaking | Fit the same two mechanisms; no figure is taken. |
| **The enemy legs** (L10a about 23.4-24.0 u; L10b both freeze about 46.5-48 apart; S10a 21.09-21.94; S10b 18.2-18.8 then driven back 7-9 u) | **Not explained by a team rule: there is none.** Both bodies' weapon-raised envelopes on (x1.75 each) gives 7 x 1.75 x 2 = 24.5 crouched, which fits L10a (23.4-24.0, less a frame's travel) -- a candidate for L10a ONLY. It fails the others: standing it gives 21.0 and S10a's 21.09-21.94 lies outside it, where the slide does not act (it acts only inside rA + rB); L10b's freeze at 46.5-48 is beyond this function's reach; and nothing in the code raises an enemy's envelope while a teammate's is lowered. Another mechanism is at work (the third seat's read). Nothing is built to these (`PUSH_APART_ENEMY_PLACEHOLDER`, section 8). |
| Run 1 of S1, S11, S12 and S10a slid round after the block where the other four stopped | Not explained: an offset under the rig's placement spread would do it (section 4's slide), which the record does not separate. The tests pin the four. |

## 7. Sites re-read by the seat itself

D:L416516-416531 (`+0xf44` from `+0x64` by dt); D:L416574-416576; D:L417351-417668 whole; `FUN_00550330` D:L417669-417755
whole; 0x54f980-0x54fa1c and 0x550000-0x550104 in the image (the radii, the heights, the stack arguments, the removal);
the vtables' `+0x2c` / `+0x30` words (0x575c30, 0x575c40, 0x5e6250, 0x5499d0); `FUN_005df450` D:L493873-493890 and the
strings at 0x6603f0 / 0x660410 in the image; `FUN_005dffc0` D:L494278-494287. The rest of sections 5 and 6 is the reader
sub-agent's, checked against the seat's own reading where they overlap.

## 8. Placeholders and readings

| Name | What | Status | What settles it |
|---|---|---|---|
| `PUSH_APART_MUZZLE_REACH_READING` (*note only*) | The muzzle push's reach: `+0x14b0` by pose and weapon. The port has the firepoint only in its weapon line, not by locomotion pose. | note only until the build (the mechanism a reading, section 3; the reach by pose unread) | a rig trace of `+0x14b0` and `+0xf44` per frame, standing and crouched, walking and running, on the mover's console |
| `PUSH_APART_ENEMY_PLACEHOLDER` (*note only*) | An enemy stops a runner about 10 u further than a teammate (the rig's L10a/L10b/S10a/S10b): no team rule exists in the code; the envelope x1.75 fits L10a only; S10a and L10b need another mechanism | note only: a placeholder, nothing built | a rig trace of both bodies' `+0x1160..+0x116c` and `+0xf74` on the mover's console in an enemy and a teammate run (Q22-E); which pad button starts the envelope (D:L453520 the rise, D:L453488 the fall); and a read for what holds L10b's pair 46.5-48 apart |
| `PUSH_APART_WALL_SIDE_PLACEHOLDER` (*note only*) | A body against a wall walked into, or walking along it into another: the code has no wall term, so it is the contact slide followed by the world collision, the still body never moved (section 10.3) | note only: a reading of the composition (2026-11-18), pinned by `viewer/test/pushApart.wallSide.test.ts`. MEASURED by the rig's W3 (section 10.4): the original never sinks gradually; the port's creep is a named divergence | step (2), the muzzle push, once its reach is read (Q22-T); W1 / W2 still owed |
| `PUSH_APART_PRONE_PLACEHOLDER` | An UPRIGHT body meeting a prone or state-8 one: skipped, the mover's `+0x21c` set to value 2 (section 2, the prone skip); what reads that value (LATER 711's "floor on prone bodies") is unread, so the port only skips (section 10.2) | placeholder (narrowed 2026-11-18: the prone MOVER's half is built, below) | the reader of `+0x21c`'s value 2; the rig's Q22-WP legs P1/P2 (a walk and a run into a prone teammate) |
| `PUSH_APART_PRONE_STEP_READING` | A PRONE mover (r0004's flag, section 5.2): it skips bodies not in state 2 or 8; against a prone one an inward hit replaces the move by an outward step of min(\|dot\|, 1) along the normal, no tangential part | reading, pending review (built 2026-11-18, section 10.2; r4 0x554888-0x5548cc, 0x554ba8-0x554bb4, 0x5551f0-0x555250 re-read by the bodies seat) | held by `viewer/test/pushApart.prone.test.ts`; the rig's Q22-WP legs P3/P4 |
| `PUSH_APART_RADIUS_READING` | The cylinder's radius by posture: 6 standing, 7 crouched, 8 prone (section 2) | reading, pending review | held by the bytes (r0001 0x54f99c-0x54f9cc, 0x54fbb8-0x54fc2c) and the rig's S1/S11/S12/L1 legs |
| `PUSH_APART_HEIGHT_READING` | The cylinder's height by posture: 19.1, 15, 6 (section 2) | reading, pending review | the bytes (0x54f9d4-0x54fa10) |
| `PUSH_APART_RAISED_PLACEHOLDER` | The x1.75 on a radius while the weapon-raised envelope is on: not applied (the port's bodies carry no envelope) | placeholder | Q22-T and Q22-E's envelope traces; which pad button raises it (D:L453520) |
| `PUSH_APART_AI_PAIR_SCALE_READING` | Two AI bodies: both radii x 0.65 (`DAT_0064fcc0`) for the sweep, the gate unscaled (section 3) | reading, pending review | the bytes (0x54fe68-0x54fee8); a bot pair's head-on stop on the rig |
| `PUSH_APART_REMOTE_STANCE_PLACEHOLDER` | The page's other bodies are taken by their drawn posture, where the original indexes the other's own stance word `+0x174` (r1 0x54fb68, 0x550000): a crouch-run copy gets 6 / 19.1 for 7 / 15 -- a gap in the port's wire | placeholder | the stance word on the wire, or the rig's crouch-run contact leg |
| `PUSH_APART_ORDER_READING` | The order of several bodies in contact: the list's sort order by its comparator, nearest first by 3-D distance squared, the original's neighbour list (`+0xd8`, `FUN_002a0a10` D:L145876-145985, sorted by `FUN_002a12e0`, comparator 0x2a1140; 8f's second read) | reading, pending review | held by `viewer/test/pushApart.order.test.ts` (non-orthogonal normals) |
| `PUSH_APART_ORDER_STALE_PLACEHOLDER` | The original's list is not kept sorted every frame: a full sort only on a rebuild (the object count changed, D:L145893-145899) and only with the 3-object window's argument set (`DAT_003de2e8` 3, D:L145749-145776); otherwise a re-sort only when an entry is nearer than its predecessor by more than 100 in distance squared (`DAT_003de2f0`) and inside `+0xcc` (D:L145935-145983). Two bodies both in contact differ by under 100, so an inversion between them can last until the next rebuild (the fold check, 2026-11-15). The port sorts fresh every call | placeholder | a trace of the list's order against the distances, frame by frame, with two bodies in contact |
| `PUSH_APART_HOSTAGE_PLACEHOLDER` | Hostages are not offered as bodies (the original's would collide: the same SEAL-class actor) | placeholder, by the main controller's ruling (2026-11-15) | the hostage lane's word, after its doorway work |

The note-only names stand until the build reaches them; the built ones are cited where they stand in.

## 9. What the port does, and the build's shape (S)

The port's movers have no push between bodies (research 391 s2.10; `viewer/src/mover.ts` `Walker` pushes out of walls
only; the room's movers the same). The build follows r0004 (the rig's build), in the one `Walker` for the page, the room
and offline play alike (the test room has no network; it gets the slide too): each moving body's
displacement tested against the other bodies' cylinders (sections 2 and 4) and, for a person's seat, the muzzle push
(section 3), on the frame's displacement before the world collision; posture radii and heights as section 2; a
stationary body never displaced. `roomR0004Jump.test.ts` asks only the contact and touching distance; its touching
distance follows the radii (12.5, was 7.5) once the slide stops a runner at 12.
LATER 1018 (the fir) is the general solver's and stays apart.

**Step (1), built on `agent/wm-move-711` (the main controller's order, 2026-11-15): the contact slide.** `viewer/src/pushApart.ts`
`contactSlide` (sections 2 and 4: r0004's prone flag built on 2026-11-18, section 10.2; the bodies taken nearest first; two AI bodies on 0.65 of the radii; the carried velocity clipped), called by `Walker.pushApart` on the displacement in
`move()` and `fall()` before the world collision, for every walker whose `bodies` hook names others: the room's seats
(`Room.seatBodies`, players and bots), the page's own body (the client's bodies at the view tick,
`viewer/src/pushApartPage.ts`), online and offline alike. The muzzle push is step (2), after Q22-T (`Walker.bodyPush` set,
read by nothing). Held by `viewer/test/pushApart.capture.test.ts` (S1, S11, S12, S5a, L1, L7 held; S2, L2 and S3 `it.fails`
under LATER 711), `central/test/roomPushApart.test.ts` (the room's two seats), `viewer/test/pushApart.lag.test.ts` (the page's correction
against a lagging copy: 2.167 u against a body walking at the mover, 0 against a still one), `viewer/test/pushApart.order.test.ts`
(nearest first, non-orthogonal normals) and `viewer/test/pushApartPage.test.ts` (the page's bodies: seats only, the living). `central/test/roomR0004Jump.test.ts`'s touching distance follows the radii (12.5,
was 7.5).

## 10. The successor seat's additions (the bodies seat, 2026-11-18)

Branch `agent/bodies-711` (worktree `wt-bodies-711`): `agent/next` a909613646 with `agent/wm-move-711` d50b2a0b33 merged
(c11d649cc1); the main controller's brief `handoffs/stage2/BRIEF-bodies-later711.md` (2026-11-18T05:46Z), plan approved.
Evidence kinds as above: (D), (W), and **(S)** the port's source read; no rig leg is new here.

### 10.1 Where the slide sits after LATER 1148 (S, by reading)

`Walker.move` calls `pushApart` on the tick's whole move first, before either path: the frame-end ground path
(`groundFrameMove`, LATER 1148) and the sub-step path. `fall` slides the tick's air move before `resolveSegments`. So the
slide runs once a tick, on the move before any wall, as `FUN_0054f7e0` runs before `FUN_00549f30` (section 1).

One difference is named, not fixed. Under 1148 a tick whose frame end would land over no floor is HELD
(`groundHeldX_/Z_`): the body stays, and the next tick's walls take held + own as one move from the body. That tick's
slide sees only its own move, from the body's un-advanced position. The slide's gate is the neighbour list's
(inside rA + rB at the start, D:L417582), so a move from outside the radii can end up to one move inside them, unslid.
For a held frame that move is the frame's move so far: the same unit the original slides (`+0xf44`, one game frame,
section 1). The port's per-tick slide otherwise lets at most a tick's travel inside, a half or a third of the original's frame (the port's frames are 2 or 3 ticks, `groundFrameMove`; the fresh review's finding 2). Neither
is a leak past the original's own depth (a frame's travel; the rig's S1 stop at 10.71-10.86 is 12 less about one
frame's run). No change is made. The port's per-tick application against the original's per-frame one stands as the
reason the capture tests' tolerance is a tick's travel (section 9).

### 10.2 A prone body (W, re-read; built)

The bodies seat re-read r0004's instructions (capstone 5.0.7, `socom2_game_r0004.elf`) at the three sites of s5.2.
They agree with it:
- **The flag.** r4 0x554888-0x5548cc: the own stance word `+0x174` == 2, or `FUN_0057d220(actor, 0x13)` or
  `(actor, 0x19)` non-zero (an action on top), sets a stack byte.
- **The skip.** r4 0x554b58-0x554bb4: `$a0` = the other's `+0x174` is 2 or 8. An upright mover meeting such a body
  takes r0001's prone skip (`+0x21c` bit value 2, r4 0x554b8c-0x554ba4). A flagged mover meeting a body that is not
  2 or 8 goes to the next body. Then, for a prone other, its radius is 8 (0x41000000, r4 0x554bc8).
- **The contact site.** r4 0x5551f0-0x555250: under the flag, -1.0 (0xbf80 high half) is loaded, the displacement's
  three words are stored zero, and the dot `$f12` is replaced by -1 when it is at or below -1. Then `FUN_00326520`
  scales the normal by it and `FUN_003265a0` subtracts that from the (zeroed) displacement. The move becomes
  min(|dot|, 1) along the outward normal, with no tangential and no vertical part. The `+0x1354` removal that follows
  (r4 0x555258 on) does not read the flag.

Built in `viewer/src/pushApart.ts` `contactSlide` (`PUSH_APART_PRONE_STEP_READING` = 1). The port flags the prone stance
only: actions 0x13 and 0x19 are unnamed in the port. The step is per game frame in the original and per 60 Hz tick
in the port. It binds at no crawl speed: `seal_prone_crawl`'s 11 u/s is 0.18 u a tick. A crawl into a still prone
teammate oscillates on the 16 u gate, within a tick's crawl of it. **A dive (the fresh review's finding 1, 2026-11-18):** the port's stance is
prone from a dive's start (viewer `traversal.ts`), and the dive's carry goes through `glide` -> `move` -> `pushApart`, so
the flag holds through the dive. A dive at a run's speed (about 1.08 u a tick) into a prone teammate meets the cap: the
port pushes back up to 1 u a tick (60 u/s) where the original's cap is 1 u per 30 Hz frame (30 u/s); and a diver passes
through a standing teammate (the flag's skip). Before f54fc132b9 a prone mover was not slid at all, so the dive into a
prone body is new with this step. Whether the original's diver holds the flag (`+0x174` 2, or 0x13 / 0x19 on top through
the dive) is unread; settled by the stance word and the actions on top during a dive on the rig, or the dive's state read. An upright body's skip of a prone one stays a skip
(`PUSH_APART_PRONE_PLACEHOLDER`, narrowed: what reads `+0x21c`'s value 2 is unread). Held by
`viewer/test/pushApart.prone.test.ts` (RED ac1d7b9858: 4 red, 4 pins green; green with the change).

### 10.3 A body against a wall (D, S; a reading of a composition)

`FUN_0054f7e0` has no wall term (D:L417351-417668 read whole, section 7). It slides the moving body's displacement and
never writes the other (section 0.3), and the world collision takes the slid displacement after it
(D:L416574-416576, then D:L416677-416687). So a teammate flat against a wall and walked into stops the walker at the
radii less a move and is not pushed into the wall. A walker meeting it at an angle slides round it as far as the
wall lets. A body running along the wall into a teammate stops the same way. The port composes the same way
(10.1). `viewer/test/pushApart.wallSide.test.ts` pins three invariants: no move ends inside the other's cylinder by
more than a move, no body passes the wall, the wall-side body never moves. They are green on arrival, and all three
red with the bodies hook emptied (the seat's mutation check, 2026-11-18). They pin the composition, not a figure of
the original; the rig's Q22-WP legs W1-W3 are asked of the shadow-coordinator (PC 1, 2026-11-18).

**With LATER 1164 (2026-11-18, the trunk merged at 567a1516dd).** The 45-degree case's first form asserted that no move
ends inside the teammate's cylinder by more than a move. With 1164's stick the runner reaches the sandwich and sinks
in: each tick the contact slide leaves a move tangent to the teammate's circle, the walls then take its into-wall part,
and the rest carries the runner along the wall into him (about 0.03 u a tick, growing; 5.83 u at the deepest in the
test's 4 s). That is the read order itself (`FUN_0054f7e0` before the walls), not a leak in the slide, and the reading
does not guarantee the invariant. The test keeps what the reading gives (the teammate never moves, the runner never
passes the wall), and holds the separation as `it.fails` under LATER 711 until the rig's W3 leg (moved up on PC 1, the
main controller's ruling, 2026-11-18). No second slide after the walls is invented.

### 10.4 The rig's W3: the original against a wall-side teammate (O; a capture scored by hand, not proven)

The rig's Q22-WP W3 (PC 1, 2026-11-18; r0004 online, MP2, three consoles; hub `rig/Q22-WP/W3/`, sha256 ad0cb23b): the
teammate C at (1068.5, 100, 604) with his back to a flat wall face (x about 1068-1069); the mover B from (1040.2, 100,
575.7) at yaw -135, 45 degrees into him; a run (W held 3 s) and a walk (held 7 s).
- RUN, 5 trials: contact at 12.9-14.2 u, then a stop at 10.6-11.8 u, then one of three: HOLD (run 4, 11.68 u); SLIDE
  ROUND along the wall and run on (runs 2, 3, 5); WEDGE into the corner by sliding along the wall face, within about
  1 s (run 1, 7.75-7.80 u). No gradual sink in any run.
- WALK, 4 valid (walk 2 void): holds at 14.05-14.3 u (closest 11.4-11.6 u), no sink.
- The teammate moves 0.000 u in every trial. The mover's `+0xf44` is small (x -0.08..0.19, z 0.04..0.23 u a frame);
  its `+0x21c` reads 0 in every row.

**Against the port.** The port sinks steadily into the teammate (5.83 u in the test's 4 s, section 10.3) and never
slides round: a real divergence, shipped NAMED (the main controller's ruling, 2026-11-18). `pushApart.wallSide.test.ts`
holds it as `it.fails` against the original's deepest separation (7.75 u, the wedge). **Inferred, not read:** the
missing piece is step (2), the local human's muzzle push (`FUN_0054f7e0`'s other site, D:L417544-417573, section 3),
which every frame keeps the predicted firepoint at least the teammate's radius from his centre by pushing outward,
so a tangent creep cannot accumulate; the walker's hold near 14 u (here and in S2) points the same way. Its reach by
pose is unread (`PUSH_APART_MUZZLE_REACH_READING`; the rig's Q22-T), so it is not built before the release. The next
patch takes it, with LATER 1194's frame-granular walls checked first (the main controller's ruling), since a per-frame
resolve may change the sandwich itself.
