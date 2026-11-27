# 256 -- The explosives' commit rules as the original's (PAR-20)

- Date: 2026-10-08 (web sprint PARITY-1, wave 2, seat A; plan
  [`../plans/2026-10-08-web-sprint-parity.md`](../plans/2026-10-08-web-sprint-parity.md), row PAR-20, rulings PAR.R2-PAR.R3,
  "Confidence and capture gates" rows D07, D09, D10, D11, D12). Branch `agent/par20` from `agent/parity` f406ea9d (the
  lane with PAR-19 merged; its effective-action API frozen at 5c535205, research
  [251](251-the-effective-action-life-model.md) §1).
- Status: **reading, pending review.** Every rule below is transcribed from the decompilation, re-read at its lines
  for this note; no game, emulator, capture or browser was run. A reviewer who did not write this note re-reads every
  cited line before a value counts as a reading. The tests are port contracts (the component and research 230's probes
  with the real `Walker` and `ThrowPose` on the disc's tables), not a measurement of the original.
- Sources: `D:L<n>` is `game/analysis/socom2_game.elf.decomp.c` (r0001, SHA256
  `B9E863762F08D55602C4310C9491286879CFCF2947683E723BC2905E1AAA42D4`, re-hashed for this note: the bytes research 230
  pins; the desktop `desktop@be5578311ff2dd33a814d39e7d6d4f2255da4da3`, this repository's `ref/desktop` pin). Evidence:
  [research 230](230-gameplay-feel-parity-audit.md) §2 (§2.1's transition and commit table, §2.2's ranked deltas) and §8
  (the case index: explosives-01, -02, -03, -05 and -08 are this row's); [research 85](85-grenades.md) §2-§3 (the
  power, `GetThrowAnim`, the launch); [research 251](251-the-effective-action-life-model.md) (the model consumed).

## 0. Answers

| # | finding | consequence | section |
|---|---|---|---|
| R256.1 | **A release under .15 is refused before the commit** (D10): `FUN_005be9a0` tests the dynamics block's `+0x198` (float32 0x3e19999a) and on a refusal only zeroes the power | research 230's three short taps throw nothing and spend nothing; four ticks throw; research 85 §2's "reader not found" corrected | §1 |
| R256.2 | **The hand-open reads the body as it is then** (D11): the aim's sine, the state's range and the hand at `FUN_005c1970`; the clip stays the release request's | explosives-05 closes; no trajectory claim | §2 |
| R256.3 | **C4 plants at 1.098 s only through its clip callback** (D09); a forced pop removes it unrun, so the normal deadline cannot place the charge | explosives-08 closes; the 99 s kit timer's end is `C4_FALLBACK_PLACEHOLDER`, the owner's row | §3 |
| R256.4 | **The wind-up's shoulder cancellation is PAR-19's rule, consumed unchanged** (D07) | controls through the real mover added; no new rule | §4 |
| R256.5 | **The release request casts a 25-unit ray along the aim from the throw's hand before the commit, the lean included; only a blocker as the ONE nearest hit refuses** (D12; r0004 `0x54e6f0`, OT.R97 -- r0001's stance-specific segment with the lean exempt, `FUN_005499e0`, superseded) | the ray and the verdict written (`THROW_CLEARANCE_LENGTH_READING`), scored 13/13 against a capture of the original; the query's class `THROW_CLEARANCE_QUERY_PLACEHOLDER` | §5, §5.3 |
| R256.6 | **The limit of four counts the owner's claymores only** (PAR-96, 2026-10-14; reading, pending review): `FUN_003cc1f0` counts the placed list's entries marked `+0xc5`, which `FUN_005bc730` sets for type 0x99 alone; the claymore's and the PMN's placings ask it, C4's and the satchel's do not; the Detonator's slot asks it too | the room's `chargesDown` and the page's `placedCount` count PMNs and C4 as well: a claymore or a PMN refused, and the Detonator taken up, where the original does neither; the build list in §8.4 | §8 |

## 1. The threshold (D10)

The hand-grenade release request is `FUN_005be9a0`'s category-0x79 branch (the category byte 0x79, ASCII `y`,
D:L475490-475511). It is handed the power as its first argument, a float: the kit's tick `FUN_005c0fd0` reads the
player controller's `+0x11c` (D:L476570) and passes it (D:L476638); the controller's update `FUN_00594cf0` chased
that power after the pressure (rise 3/s, fall 1.5/s) and asked for the release when the pressure fell to .15 of it
(D:L453478-453538; research 85 §2).

- **The test** (D:L475496-475497): the release is refused when the power it is handed is below the float at `+0x198`
  of the actor's dynamics block (the block `FUN_0058ce60` returns for the actor), or when the clearance answered 0
  (§5). `+0x198` is the dynamics block's `THROW_PARAMS` `abort_threshold`: the block's `+0x19c`/`+0x1a0` are the two
  max distances the hand-open reads (D:L477072, D:L477075) and `+0x1a4`/`+0x1a8` the toss thresholds `GetThrowAnim`
  reads (D:L414017 in the clearance's own copy), the loader's order (`CharacterDynamics_Load`, research 85 §3.1).
  `dynamics.rdr` carries no `THROW_PARAMS`, so the constructor's default stands: `FUN_002ce1a0` writes 0x3e19999a
  (D:L171508), the float32 nearest .15. This corrects research 85 §2's "its reader was not found by offset": this is
  its reader.
- **The refusal** (D:L475498): `FUN_00592d40` on the controller, which zeroes `+0x11c` (D:L451964). Nothing else: no
  clip is pushed (`FUN_005802b0`, which pushes the throw and arms the kit's timer `+0x87c`, is the accepted branch,
  D:L475500-475511), the kit's busy bit (`+1` bit 2) is not set, and the grenade's count is untouched -- it falls only
  when the hand opens (`FUN_005c1970` D:L477039-477042). On the next frame the chase runs (`FUN_0059d830` lets it,
  D:L453478-453480) the controller, its release bit 0x80 set and no throw clip on top (`FUN_005a7d10` D:L462577-462588
  answers 0), clears its wind-up bits and its power (D:L453483-453501): a fresh press starts a fresh wind-up.
- **The compare is the float32's.** A power of exactly 0x3e19999a clears (it is not less); the float32 under it does
  not. The port takes its double power as the float32 it would be stored as (`Math.fround`), so a power of .15 clears.

**The port** (`packages/viewer/src/throwCommit.ts` `THROW_ABORT_POWER`, `releasePowerClears`; `./grenade`
`startThrow` -> `refuseRelease`): the release request asks the threshold before `GetThrowAnim`'s clip is played, the
hold laid or anything spent; refused, the phase is `ready`, the power and the pressure 0, the grenade still up. The
hook's `throwNow(seconds)` goes through the same request. Research 230's three short-tap probes (explosives-01..03)
are ordinary tests now, with a no-spend case beside them; the four-tick tap is the positive control.

**Tick counts are this port model's samples, not retail latency.** A digital press is pressure 1 a 60 Hz update, so 0,
1 and 3 updates give powers 0, .05 and .142625 (refused) and 4 give .185494 (thrown). How many controller frames a
retail tap lasts, and the pad's analogue pressure on the way down, are not measured here: a capture of the original
settles what a real tap gives (§6).

## 2. The current elevation (D11)

The hand opens when the kit's timer `+0x87c` (armed by `FUN_005802b0` at the release request, §1) runs out:
`FUN_005c1970` (D:L476815) spends the grenade (D:L477024-477042) and launches it. Everything the launch takes is read
**at that moment**, not at the release request:

| what | read at the hand-open | the port before | the port now |
|---|---|---|---|
| the power | the controller's `+0x11c` (D:L477024) | the release request's (`Pending.power`) | unchanged: the accepted branch leaves `+0x11c` as it was; the chase stops while the throw clip is on top (`FUN_0059d830` D:L457338-457380 answers 0 for it, so D:L453478-453480 skips the chase) and zeroes it only once the clip is off (D:L453483-453501) |
| the hand | `+0x300`, or `+0x2f8` when the left lean's toss is on top (`FUN_00577e40(actor, DAT_003deb30)`, D:L477060-477067), as posed now (`FUN_002869d0`, D:L477067) | the posed hand now (`handPoint`); left by the clip begun | unchanged (see below) |
| the range | `+0x174` now: 0 takes `+0x19c` (`max_distance_stand`), else `+0x1a0` (D:L477069-477075) | the stance at the release request | the state now (`releaseStance`) |
| the elevation | `+0x1450` now, `asinf` (`FUN_001b38c8` -> `FUN_001af178`, D:L477106), clamped (`FUN_00539b70`, 0x65e630/0x65e638, D:L477107), plus `ComputeElevOfs(power)` (`FUN_005976a0`, D:L477108-477109) | the release request's sine | the snapshot's sine now (`releaseAimSin`) |
| the clip | (not re-picked: the clip on the body is the release request's `GetThrowAnim` pick, D:L441722-441726) | the release request's | unchanged |

**The field, units and clamp review** (the plan's D11 acceptance, written before calling it done):

- **The field.** `+0x1450` is a sine, not an angle: `GetThrowAnim` compares it raw with `toss_aim_threshold`
  (D:L441722; the clearance's copy D:L414014-414017), which the loader passes through `sinf` (research 85 §3); the
  hand-open and the arc take `asinf` of it. The port has no `+0x1450`: its aim is the snapshot's `pitch` (degrees, up
  positive), and `Math.sin` of it has stood for the field in `startThrow`'s toss test, the arc (`drawArc`) and the
  launch since research 85. D11 changes **when** it is read, not what stands for it. Who writes `+0x1450` is still not
  traced (research 214 §6's `DROP_AIM_READING`; research 193's net field 0x7d carries it): whether the port's pitch is
  the same quantity frame for frame (body elevation against the camera's pitch) is the D11 row's "may not map one-to-one"
  and stays owed (§6).
- **The units and the clamp.** `asinf` gives radians; the clamp's two `.data` words are 0 and 0.959931 (55 degrees),
  `THROW_AIM_CLAMP`; the elevation is `(12 power + 10 (1 - power))` degrees (`THROW_ELEVATION_DEG`). `throwVelocity`
  already does those three in that order (`packages/scene/src/projectile.ts`): unchanged, and tested now at the current
  read (over 55 degrees launches at 55, under 0 at 0).
- **The extra terms.** The aimed branch (`DAT_006505c8` = 1) then corrects the direction and the speed to the range's
  target (D:L477120-477127, research 85 §3 item 7): those take the power and the range above, nothing sampled earlier.
- **The hand.** The left-hand choice keys on the left lean's toss being on top now; the port keys it on the clip begun
  (`p.anim === THROW_ANIMS.peekLeftToss`), the same while the clip plays. A throw whose clip was popped before its hand
  opened is a case the port's mover does not reach (the D08 cut needs the phase past `NoInterrupt`, after the release
  fraction, research 230 §2.2); not changed.

**The port** (`throwCommit.ts` `releaseAimSin`, `releaseStance`; `GrenadeThrower.letGo`): the pending throw keeps the
clip and the power only; the hand-open reads the aim and the state from the snapshot it is handed. Research 230's
explosives-05 is an ordinary test; `grenade.test.ts` holds the aim, the clamps and the range at the hand-open. **No
trajectory or aim-feel claim** is made: the change is the moment of the read, measured nowhere against the original.

## 3. C4's callback deadline (D09)

**The start.** C4 is fired from the Action button (`FUN_005c0020(.., 0x97)`, research 94 §C5.1) into `FUN_005be9a0`'s
type -0x69 branch (D:L475379-475454): with a target under the reticle it pushes action 0x3e `Put on wall`
(`FUN_0057d540(body, 0x3e, 0)`, D:L475420) and, when the push returned the stack entry, hangs a callback on it:
`LAB_005bfe40` at `+0x64`, its phase `+0x60` = 0x3ee66666 (.45) and its argument `+0x68` = the kit's `+0x87c`
(D:L475441-475446). Then it sets the kit busy (`+1` bit 2, D:L475447) and arms the kit's timer `+0x87c` at
0x42c60000 = **99 s** (D:L475448-475451; `C4_KIT_TIMER_SECONDS`).

**The normal plant.** The callback writes zero through its argument (the instruction at 0x5bfe48, research 230 §2.1):
at the clip's phase .45 -- 1.098214 s, `C4_PLANT_SECONDS` (research 181 §2.5) -- the timer is out, and the kit's tick
(`FUN_005c1970` D:L476883-476902) clears the busy bit and runs C4's commit, which rechecks the target and the hand's
place (D:L476904-476999) and creates the charge (`FUN_005bc730`, D:L476985) or gives the slot back.

**The forced pop.** The knock (`FUN_0057e770`, D:L440992-440998) takes the body's stack down; the entry's removal
(D:L446515) goes through `FUN_0028da00` (D:L135092-135104), which drops the entry's callbacks without running them
(research 230 §2.1's reading, its lines re-located here at the same numbers). So the zero is never written: **the
removed callback cannot cause the normal deadline.** That is the whole of D09's rule.

**What the 99 s timer comes to is not decided here.** As read, nothing else writes `+0x87c` but the starts
(D:L475324-475510), the kit's tick (D:L476884, D:L476898) and two clears: `FUN_005c8190` (D:L480873, the kit's
initialiser, called from the actor's `FUN_00553ea0`, D:L419459) and `FUN_005b8920` (D:L471751-471756), called from the
death `FUN_00547af0` (D:L413023), which clears a pending charge's timer without spending (the charge types -0x67, -0x68,
-0x66, -0x69, -0x62 skip the spend, D:L471757-471759). *THROW-INTERRUPT (2026-10-16, research 326 §2.4):* for a
throwable it is no clear: it spends it and launches it at once at power 0 (D:L471760-471867), a live drop from the hand.
*Was: "which clears a pending charge's timer without spending", read as the whole of it.* Meanwhile the kit's gate refuses a selection while the timer runs
(`FUN_005c4fd0` D:L478947). So a knocked plant would, on these lines, keep the kit busy until the 99 s run out and then
run the commit's checks -- unless a cleanup not found here ends it. Research 230 §2.1 says "another cleanup must
settle" it; no line read here shows one. **This is the owner's row** (the plan's "What the sprint needs from the
owner": "long pending fallback needs review/capture before choosing a permanent cancellation/refund policy. No
automatic 99-second delayed-plant requirement"): `C4_FALLBACK_PLACEHOLDER` names it (§7).

**The port** (`throwCommit.ts` `C4_KIT_TIMER_SECONDS`, `C4_FALLBACK_PLACEHOLDER`; `GrenadeThrower`): C4's placing is the
kit's timer at 99 s plus the clip's callback at `C4_PLANT_SECONDS`, which zeroes it (the normal plant at 1.098 s, as
before). When an in-game end takes the body's one-shot off before the callback (the snapshot's `hold`/`holdSerial`
that PAR-19's model already gives the thrower, research 251 §4.2, and a heard `ActionEnd`: a knock or `replaced`),
the callback is dropped. The port then keeps the transcription as far as it goes (`'kitTimer'`): the placing stays
the kit's, busy, and at 99 s the existing commit (`placeCharge`) runs. That interim is a port contract held by its
own test, **not a parity claim** (H156): only "no charge at the normal deadline" is asserted as the original's
(research 230's explosives-08, an ordinary test now, and `grenade.test.ts`'s knock case). A `replaced` end keeps it
too: the port's mover holds one hold and ends it, where the original's take-off pushes over the entry (the fall
covering a plant is the gap named at `mover.ts` beside `COVERED_HOLDS`). **`C4_PLANT_LEAVE_CANCEL_ADAPTATION`**
(`'cancel'`, a browser adaptation, not a reading): two exits that have no original end drop the placing at once,
unspent, and the firearm returns. No walk snapshot (leaving the walk, the fly toggle). The latched plant hold gone
with no mover end (the debug hook's `setCamera` re-place, `main.ts` and `matchMount.ts`, through `Walker.place`,
which hears no end). The claymore's and the PMN's 1.3 s timers (0x3fa66666, D:L475323-475327, D:L475355-475359) have
no callback: a pop does not stop them (230 §2.1's Claymore/PMN row), the control beside it.

## 4. The wind-up cancellation through the life model (D07)

The rule is PAR-19's and landed with it (research 251 §4.1, `0afd12e1`; reviewed at the PAR-19 merge f406ea9d): the
wind-up -- the trigger held, the power chasing the pressure (`FUN_00594cf0` D:L453478-453538) -- puts no clip on the
body, since the throw's one-shot is pushed only by the release request (`FUN_005be9a0` -> `FUN_005802b0`, §1); so
the shoulder press's body gate (`FUN_005a8cb0` D:L463148-463189) passes and only the kit's gates decide
(`FUN_00594cf0` D:L453288-453310: `FUN_005a8cb0`, `FUN_005bdc30`, `FUN_005be030`, `FUN_005c4fd0` D:L478941-478955).
Taking another slot (`FUN_005c4b10`) drops the wind-up: the controller's bit 0x40 cleared (D:L478914) and its power
zeroed by `FUN_00592d40` (D:L478915 -> D:L451964). `GrenadeThrower.select` does that during `holding`; an ineligible
slot is refused and the wind-up goes on; after the release (`throwing`) the selection is refused, the grenade flying --
in the original by the kit's own gate as well: the accepted release sets the kit busy and arms its timer (D:L475501,
D:L475510), and `FUN_005c4fd0` refuses while either holds (D:L478947).

PAR-20 **consumes** it and changes no rule: re-read at the lines above for this note, no difference found. What this
row adds is the controls through the real `Walker` and `ThrowPose` on the disc's tables (`explosives.test.ts`, beside
research 230's explosives-04): during the wind-up `Walker.effectiveAction().body` is null (PAR-19's frozen API: the
wind-up owns no body); an ineligible selection (the Detonator, no charge down) is refused and the wind-up throws,
spending one; after the release the body's owner is the throw's hold (family `throw`) and the selection is refused,
the grenade thrown. The menu-cancel control is research 230's. These pass on arrival: there is no RED for D07 on this
branch -- the rule's RED and GREEN are PAR-19's (research 251 §4.1).

D10 and D07 meet only in one place: a release refused under the threshold (§1) leaves the phase `ready`, so a selection
after it is an ordinary selection, not a wind-up's. The page's shoulder gate during the wind-up is PAR-19's wave-4 hunk
(research 251 §8: `./matchThrow`'s `takeSlot`/`selectEquipment` and `busy` ask `throwing` only); PAR-20 adds none.

## 5. The clearance gate (D12)

*Superseded by r0004 (OT.R97), 2026-11-21: §5's reading of r0001's `FUN_005499e0` below -- the per-state end points, the
clamp of a forward hand, the lean's early return -- is r0001's, superseded by r0004's clearance (§5.3), which the port
now asks. It is kept as r0001's, not deleted; its query, LATER 247's and LATER 250's readings stand for r0004 as far as
§5.3 says.*

The release request asks a clearance before its power test (`FUN_005be9a0` D:L475491-475497): its answer starts 0, and
only when `FUN_0059d830(actor)` answers -- the same gate that lets the controller's chase run (D:L453480; it answers 0
while a throw clip is on top and on the actor's other refusals, D:L457338-457380) -- is it `FUN_005499e0(actor)`; a 0
from either refuses as a short tap does (§1). `FUN_005499e0` (D:L413977-414063), read whole:

- **The pick** (D:L414008-414012): `GetThrowAnim` (`FUN_0057fce0`) with the controller's power; 0 (no throw for this
  state: a lean with no lean clip, research 86 §4.4) returns 0 -- refused. Its hand point (the clip's table point,
  `THROW_ANIMS[...].offset`) is the segment's start.
- **The toss** (D:L414014-414019): power under `+0x1a4` and `+0x1450` under `+0x1a8` -- `GetThrowAnim`'s own test.
- **The far end by the state `+0x174`** (D:L414022-414049), actor frame (x right, y up, z behind), `THROW_CLEARANCE_ENDS`:

| state | end point | words | lines |
|---|---|---|---|
| 0 stand, toss | (3.457066, 12.454332, -10) | 0x405d4092, 0x414744f2, 0xc1200000 | D:L414025-414026 |
| 0 stand, throw | (1.155273, 13.354430, -15.75) | 0x3f93dffc, 0x4155abbf, 0xc17c0000 (the defaults) | D:L414004-414006, D:L414029-414030 |
| 1 crouch | (0.924411, 10.631366, -12.1) | 0x3f6ca633, 0x412a1a13, 0xc141999a | D:L414034-414035 |
| 2 prone, toss | (1.819537, 5.580177, -10.6) | 0x3fe8e697, 0x40b290cf, 0xc129999a | D:L414042-414043 |
| 2 prone, throw | (0.594010, 9.082238, -6.75) | 0x3f18110a, 0x411150d9, 0xc0d80000 | D:L414046-414047 |
| any other (3, the lean) | none: returns 1 | -- | D:L414037-414039 |

- **The start** (D:L414020-414021, D:L414050-414052): the hand point, its z taken to 0 when it is forward of the feet
  (negative): the standing toss's (3.13, 13.8, -10.5) starts at (3.13, 13.8, 0); the standing throw's (3.34, 19.35,
  3.91), behind, is kept. A crouch moving faster than 15 u/s throws the standing throw (`CROUCH_MOVING_SPEED_SQ`), so
  its start is the standing throw's hand while its end is the crouch's.
- **The world** (D:L414053-414055): both points through the actor's node matrix (`FUN_00308640` on `actor+0x28`: the
  port's feet and yaw, `actorToWorldPoint`, as the arc and the table-point launch take them), then
  `FUN_0031e250(DAT_0045c380, start, end, 1)`: a hit refuses (D:L414056-414061).

**The lean's exception is the state's, not the wall's.** A lean (state 3) is never refused by this query, whatever is in
front of it -- the plan's warning ("do not generalise the wall refusal to lean throws") is the code's own early return.
The prone lean has no throw at all (`GetThrowAnim` 0), refused before the query as before.

**The query** (`THROW_CLEARANCE_QUERY_PLACEHOLDER`, §7). `FUN_0031e250` (D:L220150-220175) fills the world's segment
record and runs `FUN_002d4780` (D:L175734-175794), whose per-owner `FUN_002d2890` tests a surface's bit 1 and the
global filter `DAT_0044d758` (0: bit 18 clear, the movement's; 1: bit 19 clear and the material's flag,
D:L174845-174864), and, with the call's argument 1, skips an owner whose `+0xa1` mask 4 (bit 2) is set and the record's `+0x3c`
node (D:L174789-174792). What `DAT_0044d758` holds at the release request, which owners carry `+0xa1` mask 4 (bit 2) and what
`+0x3c` names are not read: the port asks the movement's surfaces (bit 1 set, bit 18 clear) of every owner the model
gate passes (`segmentHit`), the hull's polygons; bodies are not in the port's grid, so the self-exclusion has nothing to
exclude. With no hull loaded the port's clearance passes (nothing to hit; no original counterpart).

*LATER 250 (2026-10-21; reading, reviewed):* the query's per-collider test is one-sided on the hull -- `FUN_002d2890` gives a collider with `+0x80` bit 1 clear (the hull's, `FUN_00316e30` D:L215827-215828) the side mode 0x20 (D:L174831-174837), with which a face is hit only entered from its front (research 281 §4.3) -- so the port's clearance asks `segmentHits`' `frontOnly`; a segment leaving a face from behind no longer refuses the throw.

**The port** (`throwCommit.ts` `THROW_CLEARANCE_ENDS`, `throwClearanceSegment`, `throwClear`; `startThrow`): the
release request asks the clearance with the power and the aim it is handed; refused, it is §1's refusal -- no clip,
no hold, nothing spent, the power zeroed. The exact-segment probe is written (`grenade.test.ts`: the five ends at
their words, each state's segment incl. the moving crouch, the turn by the yaw, the lean's none) with the predicate on a
synthetic wall (the standing throw refused; the prone throw's shorter segment and the lean pass the same wall).
`FUN_0059d830`'s other refusals (its `actor+0xe1` bit, `FUN_005a7de0`, `+0x105e`, the state 6, D:L457338-457380) are
not ported here: the port's thrower reaches the release only from its own `holding`, which those gates do not model;
owed (§6). *PAR-86 (research 251 §12.8; reading, pending review) ports two of them:* off the floor -- `+0x105e` 0x20
or the state 6 -- the chase stands and the release request is refused (`grenade.ts` `airborneBefore`, `startThrow`).
The `+0xe1` bit and `FUN_005a7de0(actor, 1, 1)` stay owed.

**Not claimed**: how often a map's walls refuse a throw, and how it feels -- the plan's D12 row keeps both for a capture.
The posed hand is not involved (the table point is the start), so the "posed endpoints" risk does not arise; the
query's class is the named placeholder.

**Measured at Frostfire's spawn A** (2026-10-08, the PARITY-1 gate's `e2e/grenade.spec.ts` red; `agent/pargren`). The
spec's HE throw at A (feet 796, 100, 614), yaw 90 (-x), `init_aim_pitch` (-9.167), a second's hold (power .95393: the
standing throw, not the toss), was refused. Measured on the disc's hull (`grenade.test.ts`, "PAR-20 D12 on Frostfire's
hull", MP2 through `loadMap` and `groundGrid`; unit test, fixture-backed): the segment runs from (799.914, 119.348,
610.656) -- the hand's table point 3.91 behind the feet -- to (780.25, 113.354, 612.845), 15.75 ahead; its only hit is
`worldmodel/container_blue01=container_blue01/climb`, the container's side 12 units west of A that `fire.test.ts`
shoots, at (784.288, 114.585, 612.395), 16.43 of its 20.67 (t .7947). That side is vertical (y 100-130, its normal 10
degrees off +x), so the floor is not what is met; ditype 2, `m_cameratype` 0, material 25 METAL_THICK: bit 1 set and
bits 18 and 19 clear, and METAL_THICK is not VOLUMETRIC, so both values of `DAT_0044d758`'s surface filter keep it
(D:L174845-174864). Its owner is a static node (no door sweep), node word 0x80801051. The owner skip (D:L174789-174792)
tests the top node `FUN_002d4780` sets `DAT_0044d738` to before each `FUN_002d2890` (D:L175771-175788), so it is per
owner as read above; of the writers of `+0xa1` bit 2 only `CWorld::AddChild` (`FUN_0031f240` D:L220691-220694: a
child whose `+0x5e` bit 5, the node word's bit 21, is set) was read, and that bit is clear in the hit node's word;
which node is the top for this cell's link, and the other writers, are not traced. Bodies are not in the grid and the end points are `FUN_005499e0`'s words in the frame the launch takes
(D:L414004-414054). **Decision**: the refusal is D12's rule as read, under `THROW_CLEARANCE_QUERY_PLACEHOLDER` -- not a
port defect; `throwCommit.ts` is unchanged. The spec now pins it (yaw 90 at A: a full throw refused, nothing spent,
the HE still up) and throws its HE at yaw 210, clear by the same measurement as 240 (rendered browser run, 2026-10-08).
Reading, pending review; the query class stays the placeholder until §6's source reading.

**LATER 247 (2026-10-21; reading, pending review): half of the query read, and its side.** `DAT_0044d758` is 0 at the
release request: its setter `FUN_002d4fd0` (D:L176018-176021) is called with 1 only around five other queries, each of
which writes 0 after its own (`FUN_0029bf70` D:L143370 -> D:L143656; `FUN_0057efe0` D:L441228 -> D:L441233/441237;
`FUN_0057f150` D:L441275 -> D:L441280/441284; `FUN_00596d60` D:L453962 -> D:L453967/453971; `FUN_005aa6e0` D:L464117 ->
D:L464125), so the clearance's `FUN_0031e250` (D:L414055) runs the movement's filter (bit 1 set, bit 18 clear) -- the
surface half of `THROW_CLEARANCE_QUERY_PLACEHOLDER` as the port asks it. The hull test is one-sided: a face counts only
when the segment enters it from its front, the start in front of the face's own normal and the end behind it
(`FUN_002d2890` side mode 0x20 for the hull's colliders, D:L174831-174837 and D:L215827-215828; research 281 §4.2-§4.3);
the port's `segmentHits` (scene `segment.ts` `crossing`) counts both sides -- LATER 250. The owner skip (`+0xa1` mask 4,
D:L174789-174792) and the record's `+0x3c` stay unread but for the node word's bit 21 mapping above -- one writer of about
twenty (LATER 256; §6). Measured on the
disc's hull at MP2's dock barrier (`throwClearDock.test.ts`; unit test, fixture-backed; the pose of a rendered refusal,
`agent-mail/evidence/l247-throw-repro-20261021`): feet (1103.2, 100, 814.8), yaw 240, standing, power .895 -- one hit,
`worldmodel/out_di1_10`'s face at x 1115 (y 113-189.5, normal -x), entered from its front (the hand end +16.86 in front,
the far end 1.26 behind), the node word's bit 21 clear: refused, as the original's surface and side tests would -- whether its owner skip excludes this
owner is unread (LATER 256); four units back, no hit. The front entry is confirmed by LATER 247's review (the hull test's
microcode re-read from the ELF).

### 5.1 The room's start gate against the lean (LATER 1178 (ii), 2026-11-18; reading, pending review)

The room adds a gate the original has none of (SVC-23b, 2026-10-04, research 169 §7 measure 5 (b): server authority, a
forged start thrown over a wall its thrower stands behind): `room.ts` `throwGrenade` refuses a throw whose hand is past
`START_REACH_PLACEHOLDER` (16 units plus the root's slack) from the server's head at the command (`hand far`), or with a
wall on the head's or the axis's line to it (`hand walled`, `net/startLine.ts` `startWalled`, every polygon). A leaning
body's posed hand reaches past a wall's face round a corner while its head stays behind it, so the room refused, as
`hand walled`, a lean throw the original lets go (the lean's exception above, D:L414037-414039, through the release
request `FUN_005be9a0` D:L475490-475498): the thrower's page drew a grenade that never flew (FINDING-X10, the bugs seat,
2026-11-18). Since LATER 1178 (ii) a throw whose command frame holds a lean (`Traversal.peeking` not 0 -- the body's
lean state, the original's state 3; not `peek`, the camera's value easing for about 1.5 s after it, its review's F1)
skips the wall lines and keeps the reach: the reach is SVC-23b's own (no original) and the ONLY bound left on a lean
throw's start (its review's F2) -- the original's start is the lean clip's own hand point, the room's any point within 16
units plus the root's slack of the head, so a forged lean throw may start through a thin wall within that ball, and a
forged prone lean (no throw in the original, `GetThrowAnim` 0) skips the walls too. A tighter bound (the lean clip's hand
point, the page's `handPoint`) is owed. Upright throws keep both
lines. A set charge (`startRefused`'s placed path) and a launched round are unchanged. Tests:
`packages/match/test/roomEquipment.test.ts` "LATER 1178 (ii)" (the SEAL's lean clips from the fixture disc; skipped
without them).

### 5.2 The room asks the original's clearance (LANE-KILL B-06, 2026-11-21; reading, pending review)

§5.1's upright wall lines dropped honest throws: the page's posed hand at a standing throw's release sits 4.24 right
and 6.4 ahead of the feet, so a body standing square to a wall 3.6 off at its right shoulder has the hand past the
wall's face, and the room refused as `hand walled` a release the original's clearance lets go (its segment runs from
the clip's hand point, 3.34 right, away from the wall). By the main controller's ruling "D" (2026-11-21) `room.ts`
`throwGrenade` no longer asks the wall lines for a hand throw: it asks the reach (`hand far`, §5.1's, unchanged), then
the launch (`throwLaunchAllowed`, `launch`), then this section's clearance -- the page's own `throwClear` (D12; first
written against r0001's `FUN_005499e0` D:L413977-414063, superseded under OT.R97 by r0004's `0x54e6f0`, §5.3) -- at the
release request's body (r0001's `FUN_005be9a0` D:L475490-475498 asks it there; r0004's at 0x5c5d6c): the
`throwStart` command the throw names, else (an older page, or a request gone from the cone) the throw's own frame;
refused as `unclear`. The lean's exemption (§5.1) is now the clearance's own. The power is not on the wire, so the room
asks every launch of the family that matches the throw's velocity (`throwLaunches`) and passes it if any clears, in the
stance the launch's range names or the request's posture (standing, the crouched state too: OBF-23's crouch-run,
`releaseStance`) -- `THROW_CLEARANCE_PAIRS_ADAPTATION`, the room's leniency, no original. A set charge and a launched
round are unchanged (their wall lines stay).

**The start-tie** ([adaptation], the lane's decision, 2026-11-21: SVC-23b's wall lines re-anchored to the hand; no
distance value). Dropping the head and axis lines let a forged `from` past a wall the body faces through (central
`room.test.ts` BL-3, LEAN-WALLED: the original's segment runs away from that wall, and nothing tied the start to the
real hand). So, after the launch and before the clearance, `throwGrenade` asks `throwTied` per matching launch: the line
from some candidate release hand to the sent `from` must cross no wall (every polygon, two-sided, as `startWalled`),
else `hand walled`. The candidates, each carried to the world by a body's frame (`actorToWorldPoint`; the release
request's and the throw's own, both the server's mover): `GetThrowAnim`'s table point for the pair (`throwAnim(...)
.offset`, D:L441731-441772: what a page with no posed body sends) and the page's posed release hand for that clip, the
frame before, the release frame and the frame after (`ROOM_START_TIE_RENDER_GRID_ADAPTATION`, the page's samples on the render grid, until LATER 1428's page half, then `POSED_RELEASE_HAND_READING`; `@s2u/scene` `projectile.ts`, §7; a
lean toss's under the held lean; a run's throw plays `seal_throwgrenade`, standThrow's). It refuses no honest input: an
honest page sends one of these itself, so one candidate line is about zero long (the posed hand within a frame's
travel, about 4 units at the standing release). The forged start is stopped where every candidate is on the body's
side. Its window: a wall the candidates themselves pass -- the standing toss's table point is 10.5 ahead, past a wall
10 ahead whose face the toss's clearance end (10.0 ahead, r0001's D:L414025-414026, superseded under OT.R97) only
touches -- lets a forged toss start
anywhere within the reach past it; BL-3's and LEAN-WALLED's forged throws are now sent with a full throw's launch, whose
candidates are all short of their wall (at most 9.9 ahead). The pistol hand's clips (`PISTOL_HAND_ANIMS`) have no posed
entry. Tests: `packages/match/test/roomEquipment.test.ts` "LANE-KILL item 1" (the square stand taken from the table hand
and from each of the three poses; a forged start 15 ahead past a wall 12 ahead `hand walled`; a forged start through a
wall, a wall ahead, and the request's body against the throw's refused or taken as the clearance says) and "LATER 1178
(ii)" (its wall turned to face the body, its upright cases now `unclear`); `packages/central/test/room.test.ts` BL-3,
LEAN-WALLED, SVC-23b measure 5 (b); the table by `packages/viewer/test/posedReleaseHand.disc.test.ts` (dev disc).
Reading, pending review; a served run of the case is owed before it merges.

*Under r0004 (§5.3) the lean is no longer exempt: the room's clearance casts a held lean's ray from the lean's own hand
(`roomEquipment.test.ts` "LATER 1178 (ii) under r0004"), and the standing toss's unclamped hand (10.5 ahead) passes a
wall nearer than it from behind, so a zero-velocity or toss-matching forged start past such a wall is taken
(`roomEquipment.test.ts` "TAKEN under r0004"; central BL-3 and LEAN-WALLED stay the named honest reds for legs T and T2).*

*The aims past the clamp (the review of c5629fb494, B1; the controller's option A, 2026-11-21; reading, pending review).*
The velocity holds only the launch's clamped elevation (0..55 degrees, r0004 0x5c9640-0x5c9680), while the page ties
its hand and casts its clearance along the body's real aim (§5.3), which pressed to a tall wall stands 72-76 degrees up:
its 25 u ray ends short of the wall's top, the page plays the clip and lets go, and the room -- trying only aims inside
the clamp -- refused it `unclear` (the clip and no grenade). So `throwRelease` also tries, for a matching pair whose
elevation sits at a clamp bound (within the search's 1-degree step), every aim past that bound on the same step up to
the stance's cone (`THROW_AIM_CONE_READING`: above 55 to its `up`, below 0 to its `down`; prone its prone set), the
start-tie and the clearance each at that aim; refused only when no tried aim ties and clears. Part of
`THROW_CLEARANCE_PAIRS_ADAPTATION`'s leniency, with no aim filter. `roomEquipment.test.ts` "B1" holds it (walls 35, 40,
60 and 200 u tall at 3.6 and 4.5 u, and 5.5 u at 35 and 40: the page's aim 75.6, 71.6, 67.2 degrees; each was `unclear`,
each is taken). Its cost, named: a zero velocity matches a power-0 toss at every aim, and a full throw at the 0-degree
bound matched aims steeply down, so the room could no longer refuse what nine tests assert, and the delta review of
7bf7ac69cf (F1) found a tenth: a forged full-power level throw from past a thin wall, taken through a steep-down aim.
*The floor (the controller's ruling (ii), 2026-11-21; `THROW_AIM_FLOOR_ADAPTATION`, §7).* The aims below the 0-degree
bound go down only to a floor. At 989575405a it was a fixed sine, the lowest aim the capture logged at rest (prone's
-0.191536). Under it the forged level throw is refused `unclear` again (`roomEquipment.test.ts` "a forged full-power
level throw through a thin wall is refused"), and so are two of the nine, green again with their assertions unchanged:
the standing throw at a wall 10 ahead and the request's body against the throw's at the wall 12 ahead. *The pitch floor
(the review of afd246dfe3, B1; the controller's conditions, 2026-11-21; reading, pending review).* The fixed floor
refused honest throws: standing with the stick held down to camera pitch -55..-70, a wall 35 u or taller 18-20 u ahead,
power 0.6-1.0, the page aims -0.317..-0.509, its request and hand-open clear, the launch is clamped level, and the room
tried nothing below -0.1915 (crouched the same at a wall 20 u ahead at -65..-70; lintels 12-22 u up at -40..-60). The old
sweep missed it: its four pitches, and its commands all at pitch 0. The floor is now per throw:
sin(p) - m[posture], where p is the lower of the camera pitches the room's cone holds at the release request and at the
throw (`AimFrame.pitch`; the room moves it toward the command's at the look's rate, as the page's camera does), within
the cone's `down`, and nothing below 0 at all when the floor is at or above 0.

*The margin, derived.* The page's aim is unit(T - O) (`throwAimVector`), T on the camera's ray from the placed eye E
along d, d's elevation p. Take n, the unit normal of the plane holding d and the body's horizontal right axis, with y
positive. The inequality: if O lies on or under that plane, (O - E)_up cos p - (O - E)_ahead sin p <= 0, then every T
on the line has (T - O).n >= 0. In the plane of d and n, the direction of T - O then lies in [p, p + 180 degrees]. For
p in (-90, 0], sin there is no less than sin p, and a sideways part only shrinks |y|. So the aim's sine is at least
sin p. The cone's clamp (`coneHold`) keeps the sine, or raises a pitch past its bound, so it never lowers it. The
stance heights:
- standing: O is 8.808 up and 0.453 ahead (`THROW_AIM_ORIGIN_READING`, replaced 2026-11-21 by the latch,
  `THROW_AIM_ORIGIN_LATCH_READING`: 13.11 for a standing select, 8.76 for a crouched one, ahead 0); the eye at rest is
  19.6 up and 24.9 behind;
- crouched: O is 5.882 up (`THROW_AIM_ORIGIN_STANCE_PLACEHOLDER`, replaced by the latch);
- prone: O was 0.397 up (the port's posed hand; since KILL-LATCH, 2026-11-21, a prone select latches 1.356,
  `THROW_AIM_ORIGIN_LATCH_READING.prone`).
The measurements below were taken under the old origins. The latch's 13.11 still lies under the standing eye, but a
standing select thrown crouched puts O 13.11 over the feet under a crouched camera; the room's sweeps
(`throwRoomLeniency.*.sweep`) were re-run on the latch (LANE-KILL B-06, 2026-11-21).

Measured by the sweep at every pitch:
- standing and crouched on the synthetic walls, the worst aim less sin(p) is +0.00004 and +0.00003 (looking up 60 at
  the wall 20 u tall, 3.6 ahead), so the geometry's share of the margin is 0;
- standing on the capture's MP6 legs it is +0.00004;
- crouched at leg B FAR (pitch 12) it is -0.02656. The cause is the camera's collision pass lifting the eye about 0.7 u,
  so the ray's own pitch is 10.46 degrees (the origin is 7.0-10.3 u under the camera line); not "O over the line". The
  aim sits 0.027 under the command's sine;
- prone it falls short twice, and neither is a failure of the origin's geometry: the cone's 20-degree up-clamp (-0.0806
  at pitch 25, leg B FAR) and the camera pass (-0.024 at pitch 18). The prone eye 1.98 under the feet (0.445 under sin(p)
  at pitch 25) occurs only on the sweep's synthetic floor, which does not stop the camera; on MP6 the prone eye is
  0.68-8 u above the feet.

So:
- m = 0.0475 standing and crouched: three commands of RECRUIT's full stick, covering the frame sampling, the wire's
  0.01-degree pitch and the crouched -0.0263 at B FAR. The page reads its aim at its own camera, whose pitch may stand
  off the frame the room holds. The margin covers `THROW_AIM_PITCH_SAMPLING_COMMANDS` (3) commands of the full-push
  stick, `MAX_PITCH_RATE` 0.950 rad/s (RECRUIT's look rate, `look.ts:91`; `pitch_rate` 0.85 x 1.118, `FUN_00594600`
  D:L452783) at 60 commands a second, since |d sin p| <= |dp|: 3 x 0.950 / 60 = 0.0475. Crouched at leg B FAR, 0.027
  of it is spent, and 0.021 (1.3 commands) is left for the sampling there. The fastest honest preset is 1.462 rad/s
  (`lookGate.ts:155-159`), where 0.0475 is 1.95 commands, not 3; the value is not changed (the sweep and the probes
  found 0 honest refusals at both rates). A mouse's pitch, faster than the stick, is not covered past that.
- m = 2 prone: the prone cone's `down` (20 degrees, the camera's prone limits -20..25) binds. It covers the up-clamp's
  -0.0806 and the pass's -0.024, so it is safe; on MP6 a tighter bound would hold, and is not taken.
- Both: 0 honest refusals in the full-pitch sweeps (page-cleared throws: standing 357,402, crouched 294,140, prone
  78,974).

The forged level throw at pitch 0 meets a floor of -0.0475 standing and crouched (stricter than -0.1915) and -20
degrees prone. Each is still refused: `roomEquipment.test.ts` standing, and the crouched and prone sweeps'
"forged full-power level throw" cases. The cost, named: a page holding its pitch down widens the floor for its own
throws, and a forger may send a low pitch. The pitch is the body's own look and is shown to every other player.

*The sweep* (`throwRoomLeniency.{stand,crouch,prone}.sweep.test.ts`, `throwRoomLeniencySweep.ts`; the controller's
conditions). The grid:
- every pitch of the stance's limits at 2-degree steps, the top bound and `init_aim_pitch`, each held by the room's cone
  before the throw;
- three wall extents; heights 20, 35, 40, 60, 100 and 200; distances 3.6-24 u (18, 19 and 20 among them); a lintel
  12-22 u up; yaw 0 and +-30;
- powers 0, 0.3, 0.6, 0.895 and 1; the table hand and the posed one;
- the stance taken away from the wall, then the room's posture asserted at the pose (the review's B2);
- the capture's fifteen legs on MP6, where the fixture is present: FAR, LEFT of FAR, NEAR, LEFT of NEAR, D along-R,
  along-Rb, T10, T20 and along-L, 10.25 u and 20 u.

The room takes every throw the page lets go:

| Stance | Synthetic grid (throws / page-cleared / refused) | MP6 legs (throws / page-cleared / refused) | Run time |
|---|---|---|---|
| standing | 458,280 / 357,402 / 0 | 7,370 / 4,768 / 0 | 230 s |
| crouched | 458,280 / 294,140 / 0 | 1,340 / 120 / 0 | 214 s |
| prone | 171,000 / 78,974 / 0 | 500 / 298 / 0 | 76 s |

These are unit tests on the port's page and room. No capture is scored here. *Across the facing (`THROW_AIM_SIDE_ADAPTATION`, §7; LANE-KILL B-06, 2026-11-21).* The cause, traced: not the
1-degree step of the aims past the bound. The page's prone aim at camera pitch 20 is held at the prone cone's yaw bound
(`coneHold`, +-45 degrees; the grid's prone aims are 1,350 ahead, 315 at +45, 135 at -45, its standing and crouched
aims all ahead), so its 25 u clearance ray reaches about 17.7 u ahead and misses a wall 16-24 u ahead; the room cast the
bare sine straight ahead, and every one of its 196 tied aims met the wall. The velocity holds no sideways term, so the
room casts each tied aim prone also at the cone's two yaw bounds (for one convex wall the clear yaws, if any, include a
bound): the sweep's three stances now all taken, and the test requires it. Standing keeps ahead only: the standing
cone's +-85 would take the forged level throw through a thin wall again (checked: `9.889 ahead, power 0.895` taken).
Its cost: a prone throw's clearance casts at most three times as many (the 50's example: 196 before, refused; 588 at
most after; it now clears at the second); the tie's casts and standing and crouched unchanged. The prone walk-down from 55 to the prone cone's 20 (the
delta review's F3) is left as it is. The seven still refused by nothing are central BL-3 and LEAN-WALLED,
`roomEquipment.test.ts`'s two honest reds, the two LATER 1178 (ii) cases restored to their original `hand walled`
(upright at a wall 5 ahead; the review F1) and the lean at a wall 8 ahead. Each is an `it.fails` titled "GAP (LATER 1294)" with its assertions unchanged and
its line in `tools/test/itFailsRegister.test.ts`: the room's own throw aim is owed (LATER 1294); the capture's leg T (no
toss faces a wall at 10-10.5 u) and leg T2 (a standing tap refused at 9.0, 10.25 and 12 u, 3/5/3 times; SUMMARY.md) are the nearest evidence.

### 5.3 The r0004 clearance (OT.R97; LANE-KILL B-06, 2026-11-21; reading of r0004, reviewed by a second reader; scored against the capture of the original (r0004 under PCSX2, PC 3, 2026-11-21), record D:/s2u-captures/kill-item1-20261121T0305Z/kill-item1-20261121T0305Z.zip (sha256 b65866b086c6451ff4093d6f91d8defab9e34070ab72a13c933aa1cfbafeb3de); summary agent-mail/evidence/weekend-mega-2026-11-14/rig/kill-item1-PC3/SUMMARY.md)

**What r0004 does** (`0x54e6f0`, one argument the actor; its one caller the release request at r0004 0x5c5d6c, the same
shape as r0001's D:L475490-475511: the category byte 0x79, the gate `0x5a3350`, the clearance, the power against the
dynamics block's `+0x198`, then the refusal `0x598570` or the throw `0x585850`). Two readers decoded r0004's bytes
(`socom_pc/game/disc_r0004/socom2_game.elf`): the first (agent-mail
`planning/mega-2026-11-21/pilot/kill/item-1-query-vs-capture.md`), and a second, fresh, who formed the decode before
reading the first's and AGREES WITH CORRECTIONS (`item-1-r0004-second-read.md`; its corrections bind):
1. `0x585280` (`GetThrowAnim`'s twin, r0001 `FUN_0057fce0`; the same table constants) with the power; 0 returns 0 --
   refused (0x54e6f8-0x54e738).
2. The toss test against the dynamics block's `+0x1a4`/`+0x1a8` is computed and DISCARDED: no branch reads it
   (0x54e740-0x54e764; the residue of r0001's end choice).
3. The start: the hand point, unchanged -- NO clamp of a forward z (r0001's D:L414050-414052 has no counterpart) --
   through the actor matrix with row 3 (`0x3259e0`, 0x54e768-0x54e788).
4. The direction: the aim vector `actor+0x144c..0x1454` scaled by 25.0 (`0x326520`; the immediate `lui 0x41c8` at
   0x54e798) and turned by rows 0-2 alone (inline VU0, 0x54e7c8-0x54e808); the end is start plus it (`0x3265e0`).
5. `0x33b860(*(0x45f750), start, end, 1)` (0x54e854-0x54e888): the same structure as r0001's `FUN_0031e250` (the
   shared record at `world+0x14c`, bit 0 of its `+2` = (arg == 0), start `+4`, end `+0x10`, the walk `0x2f1690`, the
   pick `0x2f1bd0` when `record+0x34` is non-zero). The second reader compared r0004's bytes with the decompilation's
   structure, not with r0001's bytes.
6. `0x2f1bd0` returns the ONE hit nearest the start (the smallest squared distance; a later equal replaces an earlier);
   `0x5bc8d0(actor, hit)` decides (non-zero refuses): no hit 0; an empty material slot 0; the surface's `m_cameratype`
   exactly 1 -> 0; the material's `+0x3c` bit 0 or bit 1 -> 0; its `+0x24` under 0.98 -> 1; else `+0x3c` bit 4 -> 1, clear
   0 -- field for field the port's `aimHitKept` (the empty slot, the cameratype-1 pass, then `aimPickBlocks`; names the
   port's reading of r0001's `FUN_005aa6e0`, offsets matched). The first reader named `aimPickBlocks` alone; the second's
   correction (d) is the code.
7. **No read of the state** (`actor+0x174`) anywhere in 0x54e6f0-0x54e8c8: a lean is cast like any state (the second
   reader's correction (f); r0001's early return for state 3, D:L414037-414039, is gone). `0x585280` handles state 3
   itself (0x585740-0x58580c: the lean clips 0x1e/0x20 and 0x1d/0x1f, each with its own hand point); a state 3 with
   neither clip, or any state past 3, answers 0: a refusal.

**The aim vector** (the second reader, s6). Its only stores: the constructor (0x5591c0, stores 0x559524-0x55952c: the
vector at 0x4220c0, (0, 0, -1)) and the setter `0x5e7080` through `0x5e6dd0`, which copies the wanted vector verbatim
inside its state's limits (0x5e6f58-0x5e6f70) and otherwise through the clamp `0x5b3d60` (not read); six callers pass
(0, 0, -1) (resets), one builds (0, s, -sqrt(1 - s^2)) with s = `actor+0x228` (0x5edff8-0x5ee07c), two pass a caller's
vector (0x6169a4, 0x617228; not read). *Superseded (below): the rest aim is NOT (0, 0, -1) -- that is the
constructor's value; the local body's vector is rewritten every frame by `0x5e6690`, and the capture LOGGED it at rest
(standing 0.229-0.280 up, crouched 0.0286, prone -0.1915).*

*The aim vector's local writer (LANE-KILL B-06, 2026-11-21; reading of r0004, two readers -- agent-mail
`pilot/kill/item-1-aim-source.md` and `item-1-aim-second-read.md`, AGREES WITH CORRECTIONS -- pending review; the
standing origin fitted to the capture of the original (r0004 under PCSX2, PC 3, 2026-11-21), record D:/s2u-captures/kill-item1-20261121T0305Z/kill-item1-20261121T0305Z.zip (sha256 b65866b086c6451ff4093d6f91d8defab9e34070ab72a13c933aa1cfbafeb3de); summary agent-mail/evidence/weekend-mega-2026-11-14/rig/kill-item1-PC3/SUMMARY.md; the origin a FITTED CALIBRATION, below).* The paragraph above is
superseded for the local body: (0, s, -sqrt(1 - s^2)) from `+0x228` is the REMOTE body's per-tick build (`+0x228` the
network's byte copy of the y, 0x2bf8f0-0x2bf948 and 0x2c0848). The local body's vector is written every frame by
`0x5e6690` (r0001 `FUN_005deec0`; called at 0x5e75cc from the aim step `0x5e7450`, and at 0x5e6db8 from the aim point's
setter `0x5e6cb0`): T = the camera ray's nearest KEPT hit, else its far end (`0x5b0370`: origin the placed eye, the
centre line, L = min(max(the item's range, 600), the camera's `+0xec`); a hit not kept never becomes T); O at the body's
x and z at the held item's posed height (0x5e66d0-0x5e681c); aim = normalise(Rbody^-1 (T - O)), copied verbatim inside
the stance's cone (`0x5e6dd0`), else clamped (`0x5b3d60`). No smoothing, no stick term. Its readers: the clearance
(`0x54e6f0`, all three floats), `GetThrowAnim`'s toss test (0x5852b8, the y), the hand-open (`0x5c8860`: the elevation
clamp(asin(y), 0, 55 deg) plus the power's term, 0x5c9618-0x5c9680, and its own 25 u cast, below), the drawn arc
(`0x59cbb0` at 0x59cca4, the y; `item-1-arc-read.md`, research 85 s11). The aim's x and z steer no velocity.

The port (`viewer/src/throwAim.ts` `throwAimVector`): T on the page's own camera ray (`GrenadeSource.aim`,
`WalkMode.fireAim`) through the hull with the eye query's kept test (`throwAimKept`); O = the feet + `up` in y +
`ahead` along the facing; the body's frame by the yaw alone; the cone (`THROW_AIM_CONE_READING`). The page reproduces
the capture's logged T at the standing poses ((1566, 50.04, 2090) against 50.0; (1566, 47.01, 2092) against about 47.0;
(1000.25, -24.49, 1898.6) against (1000.0-1000.2, -24.5, 1898.6)). The STANDING origin is a FITTED CALIBRATION, not a
measurement of O (`THROW_AIM_ORIGIN_READING`; two parameters on four poses, two of them tight; `ahead` has no
counterpart in r0004, whose O sits exactly on the actor's x and z at 0x5e67fc-0x5e681c, and absorbs about 0.4 u of a
mismatch not explained; the verdicts do not depend on it): four rest poses on MP6 relayed by seat-shadow from PC 3 at 04:44Z and 05:05Z -- feet
(1555.75, 30, 2090) yaw 270, s 0.7531-0.7539; (1546.0, 30, 2090), 0.4357-0.4535; (1537, 30, 2092), 0.229-0.280; (900,
-30, 1898.6) yaw 270, -0.033 -- fitted by least squares on the sine, each residual over its pose's logged half-range
(the open's the third decimal's rounding, 0.0005): up 8.808, ahead 0.453; the poses' sines then 0.7535, 0.4428, 0.2761,
-0.0330, each inside its range (`throwAimCapture.disc.test.ts`). (The two wall legs solved exactly give 8.703 and 0.365,
which put the open at -0.0319, outside -0.033's rounding; an unweighted fit misses the 10.25 u range.) Crouched and prone
are `THROW_AIM_ORIGIN_STANCE_PLACEHOLDER`. *Replaced 2026-11-21 by the latch* (`THROW_AIM_ORIGIN_LATCH_READING`, the
paragraph after next): this fit and the sines and aims in the rest of this paragraph are the pre-latch model's. Through the page's thrower at `init_aim_pitch` on MP6 the captured verdicts
hold: B FAR standing thrown (aim y 0.162; it was refused at the pitch's -0.159), crouched refused (0.298), prone thrown
(0.298); C NEAR standing, crouched and prone refused (-0.078, -0.077, -0.052); 10.25 u refused (0.7535), 20 u thrown
(0.443). In the open the launch is unchanged (the aim's -0.033 and the pitch's -0.159 both clamp the elevation to 0).
The page feeds the aim to the release request (the clearance along all three floats, the toss test), the hand-open
(the elevation; the hand-open cast) and the arc (live each frame; no hull stop). With no camera ray (a test's source)
the pitch's sine stands. **The room has no aim of its own** (LATER 1294, owed): it tries every launch of the family at
its sampled sine and, at the clamp's bounds, the aims past them (§5.2, "the aims past the clamp"); §5.2's honest reds
are `it.fails` under LATER 1294 (the controller's option A).

*The aim origin's latch (LANE-KILL B-06, 2026-11-21; a capture of the original, r0004, PC 2 KILL-AIMORIGIN and PC 3
kill-item1; the mechanism a reading pending review; agent-mail pilot/kill/item-1-aim-origin-reconcile.md).* There is one
O: (feet.x, feet.y + H, feet.z), H = `actor+0x14a4`, ahead 0. With a firearm up H is the posed `aimpoint`'s height, live;
when the M67 comes up it keeps its last value (r0004 `0x5e7100` writes only with the held slot's attachment record and
its `+0xc` set, 0x5e7188-0x5e71c0), through the rest, a stance change, the request, the clip and the hand-open. PC 2
selected standing: 13.092-13.128 on every frame of 12 throws; PC 3 selected crouched after every refill and stood: 8.7635
+-0.001 over 305 samples, with three latches near 8.27. The port: `THROW_AIM_ORIGIN_LATCH_READING` (stand 13.11, crouch
8.76, prone 1.356 -- the prone value and the freeze itself confirmed by PC 2 KILL-LATCH (r0004 under PCSX2 2.8.2, 2026-11-21; record D:/s2u-records/KILL-LATCH-PC2/KILL-LATCH-PC2.zip, sha256 5bcf4f60b800abcb29c421056a687fa17efce098c6579275d1457fc62670ccc0; summary agent-mail/evidence/weekend-mega-2026-11-14/rig/KILL-LATCH-PC2/RESULTS.md) s1: `+0x14a4` kept bit for bit from
the select through the stand, the request and the hand-open, prone 1.356 in 3/3, crouched 8.2748 / 6.8964 / 8.7764 --
three steady crouch idle heights, not one crouch settling (agent-mail pilot/kill/item-1-latch-timing.md s3); s2: a
standing select at 20 u at the default look refused 3/3 with no throw clip, the request's aim 14.84-14.96 degrees, the
cast's own margin not measured); the stance constants a stand-in for the original's posed height
(`THROW_AIM_ORIGIN_LATCH_POSE_PLACEHOLDER`, s7: a select mid-transition, the three crouch idles, a raised firearm; it
retires `THROW_AIM_ORIGIN_LATCH_STALE_PLACEHOLDER`, 2026-11-21); the page's
thrower records the posture at the select out of the firearm (`GrenadeCore.selectPosture_`, in `equip`) and forms the
request's, the hand-open's and the arc's aim from it. Through the page on MP6 (`throwAimCapture.disc.test.ts`): PC 2's
launches at the stand latch 14.63 / 11.98 / 34.19 / 29.96 / 27.02 degrees against 14.45-14.50 / 11.98 / 33.34-33.42 /
29.21-29.29 / 26.39-26.47; PC 3's rest sines at the crouch latch 0.7400 / 0.4365 / 0.2736 / -0.0324 against 0.7389-0.7399
/ 0.4357-0.4362 / 0.2721-0.2735 / -0.0332..-0.0325; every one of PC 3's verdicts held at the crouch latch (B FAR standing
at both). PC 2's launches are the thrower's own (`lastThrow`, the page's hand-open), R1 held 1.5 s. A standing select
at 20 u and the default look is refused -- a capture of the original, KILL-LATCH (PC 2, r0004 under PCSX2 2.8.2,
2026-11-21; record D:/s2u-records/KILL-LATCH-PC2/KILL-LATCH-PC2.zip, sha256
5bcf4f60b800abcb29c421056a687fa17efce098c6579275d1457fc62670ccc0; RESULTS.md s2: refused 3/3, no throw clip); the
page's clearance ray passes the wall by about 0.24 u, the port's figure (the original's cast not measured). The room
forms no aim of its own (LATER 1294) and reads no origin.

*The latch at every change of the held item (the review of 4e26b9ad0e, findings 2, 3 and 7; reading, pending review).*
The page latches when the hand's item replaces the firearm -- a throwable's select (`equip`), the Detonator
(`takeDetonator`), a C4 plant (`plantC4`) -- and keeps the latch from one of the hand's items to another: throwable to
throwable of any type, to and from the Detonator, and back to the throwable held before a C4 plant (`finishThrow`, no
re-latch at the plant's end). This is a reading of r0004's no-write path, not captured: `0x5e7100` writes `+0x14a4` only
when the held slot's record (`actor+0x388 + 8 x slot`) exists with its `+0xc` set (0x5e7188-0x5e71c0; the reviewer's
re-read at the r0004 ELF). The captures froze H with the M67 up; that the other grenade types, the Detonator and C4 in
the hand write nothing either is the port's assumption, named in `THROW_AIM_ORIGIN_LATCH_READING`'s row (s7). The prone
select's 1.356 stays a reading of KILL-LATCH s1: no prone-select throw is scored.

*The hand-open's own cast (r0004, the second reader, `item-1-aim-second-read.md` s4; reading, pending review).* r0004's
hand-open (`0x5c8860`) takes the stance's TABLE point for the state and the toss test at that moment (0x5c8e5c-0x5c9054)
through the body matrix, the aim's three floats x 25.0 through its 3x3, and asks `0x33b860(world, start, end, 1)`
(0x5c9290-0x5c93a8); ANY hit skips the launch and the count's decrement (0x5c93ac to 0x5c98a0), with no `0x5bc8d0`
verdict -- no material or owner filter. r0001's hand-open has none (D:L476960-477112). The port: `throwCommit.ts`
`handOpenClear` (`HAND_OPEN_CAST_READING`), asked by `GrenadeThrower.letGo` before anything is spent; skipped, the item
stays up, unspent. What else a skipped hand-open leaves (the grenade in the hand, the kit's state) is not read.

**r0001's constants are gone**: none of the end points' x and y words occurs in r0004 in any form (data word, `lui`
pair, raw bytes); 0xc1200000 (-10.0) occurs at other sites with other partners (the second reader's correction (e)).
r0001's `THROW_CLEARANCE_ENDS` (§5's table) left the port with this section; its words stay in §5.

**The port** (`throwCommit.ts`, `throwClearanceSegment`, `throwClear`): the ray from `throwAnim(...).offset` through
`actorToWorldPoint`, unclamped, to that plus `actorToWorldDir(yaw, 25 x (0, aimSin, -sqrt(1 - aimSin^2)))`
(`THROW_CLEARANCE_LENGTH_READING`); the query as before (`segmentHits(..., clearanceSurface, ALL_LAYERS, true)`: the
movement's surfaces, front entries); the first hit (nearest the start: `segmentHits` sorts by t) refuses only if
`aimHitKept` holds for it, never filtered before it is taken. Kept from r0001's reading, for r0004 NOT read: the walk
`0x2f1690` -- its polygon test's sidedness and the class byte (r0001's `DAT_0044d758`) at the call. The port keeps the
one-sided test (front entries) because the capture's fit used it (13/13 one-sided, 9/13 two-sided; item-1 s1): a
reading pending review of `0x2f1690`. With the class byte 0 the walk drops bit-18 surfaces, so the verdict's
cameratype-1 pass is moot (`grenade.test.ts`). The port's material table has no empty slot (`surfaceMaterial` falls back
to slot 0), so the empty-slot line never fires; the material lookup takes the built-in table with no default name
(the page's and room's map default is not passed: owed). A state with no throw clip is refused by the page's caller
(`GrenadeThrower.stance`), as before.

**The capture** (r0004 under PCSX2, legs B/C/D, PC 3, 2026-11-21; the relay's report; record D:/s2u-captures/kill-item1-20261121T0305Z/kill-item1-20261121T0305Z.zip (sha256
b65866b086c6451ff4093d6f91d8defab9e34070ab72a13c933aa1cfbafeb3de); summary agent-mail/evidence/weekend-mega-2026-11-14/rig/kill-item1-PC3/SUMMARY.md;
the build CONFIRMED r0004 (SUMMARY.md, Build: the title footer "SOCOM 2 r0004 10:14:38 Nov 3 2004", the disc's CRC 0F6FC6CF)). Thirteen releases on MP6, the
feet and the actor matrix's rows 0 and 2 as logged, carried to the port's yaw (row 0 = (cos yaw, 0, -sin yaw)), at the
rest aims LOGGED AT ANOTHER POSE (standing at 0.229 and 0.280, crouched 0.0286, prone -0.1915; `THROW_CLEARANCE_AIM_READING`; no standing leg flips between the two) and power .895, each the stance's full throw (`throwClearCapture.disc.test.ts`, dev-disc, fixture `RUN/MP6.ZDB`). The verdicts are insensitive across the page's OWN aims at the legs (FAR standing 0.162, D T10 0.195, D T20 0.503, along the wall about -0.066): all thirteen hold through the page's computed aim, its request and its hand-open (`throwAimCapture.disc.test.ts`):

| leg | feet | rows 0 / 2 | stance | original | r0001 (the port before) | r0004 (the port now) |
|---|---|---|---|---|---|---|
| B FAR | (1722, 20.004, 1868) | (0.929,0,0.37007) / (-0.37007,0,0.929) | stand | thrown | refused | thrown |
| B FAR | same | (0.92512,0,0.37967) / (-0.37967,0,0.92512) | crouch | refused | thrown | refused |
| B FAR | same | same | prone | thrown | thrown | thrown |
| B LEFT of FAR | (1714.61, 20, 1864.94) | (0.92822,0,0.37203) / (-0.37203,0,0.92822) | stand | thrown | thrown | thrown |
| C NEAR | (1722, 3.11719, 1838) | (0.61462,0,0.78883) / (-0.78883,0,0.61462) | stand | refused | refused | refused |
| C NEAR | same | same | crouch | refused | refused | refused |
| C NEAR | same | same | prone | refused | thrown | refused |
| C LEFT of NEAR | (1717.13, 0, 1831.65) | same | stand | thrown | thrown | thrown |
| D along-R | (1560.2, 30, 2125) | (0.99993,0,-0.01193) / (0.01193,0,0.99993) | stand | thrown | thrown | thrown |
| D along-Rb | same | (0.99992,0,0.01299) / (-0.01299,0,0.99992) | stand | thrown | thrown | thrown |
| D T10 | same | (0.98695,0,0.161) / (-0.161,0,0.98695) | stand | refused | thrown | refused |
| D T20 | same | (0.94467,0,0.32804) / (-0.32804,0,0.94467) | stand | refused | refused | refused |
| D along-L | (1560.2, 30.004, 2060) | (-0.99992,0,-0.01234) / (0.01234,0,-0.99992) | stand | thrown | thrown | thrown |

r0001's transcription: 9/13 (FAR standing, FAR crouched, NEAR prone, T10 wrong); r0004's: 13/13 (the RED run before the
fix and the GREEN after are the commit's report). The fit's bounds (the first reader): the length at least 19.7 (T10),
the rest elevation between about -0.5 and +30 degrees -- the port's page passes the pitch's sine (`releaseAimSin`; at
`init_aim_pitch` -9.167 that is -0.159, outside the bound: below about -1 degree FAR standing meets g66's #2104, the
first reader's fit). *Superseded: the page no longer passes the pitch's sine; it passes the body's aim (`throwAimVector`,
above), whose y at FAR standing is 0.162, inside the bound.*

**What changes on the maps** (dev-disc, fixture-backed, no capture of these): MP2's dock barrier (LATER 247,
`throwClearDock.test.ts`) -- the request's ray still enters `out_di1_10` from its front, but its material INVISIBLE_DI
(PENETRATION 1, not PICKUP) is no blocker under `0x5bc8d0`, so the REQUEST CLEARS and the clip plays; r0004's
hand-open cast (unfiltered, below) meets the same barrier and skips the launch, so the page PLAYS THE CLIP AND LAUNCHES
NOTHING, at the barrier and four back. That matches the owner's own LATER 247 report ("the arc animation shows but the
grenade is not thrown") as the original's behaviour, AS READ, with no capture. Frostfire's
spawn A at yaw 90 is still refused (the container's METAL_THICK side, now 15.5 along the 25-unit ray), and its lean too.

**Not read** (named): r0004's walk `0x2f1690` (the sidedness, the class byte at the call); the gate `0x5a3350` beyond its
shape; the aim clamp `0x5b3d60` and its limits (0x44f674-0x44f688, 0x44f638-0x44f64c, set at run time); `actor+0x228`'s
writer and the two callers 0x6169a4, 0x617228; r0004's hand table against `THROW_ANIMS` entry by entry (the stand toss
and the two lean points checked); the owners `+0xa1` mask 4 skips (LATER 256). The capture DID log the aim vector at
rest (`actor+0x144c`, the four standing poses and one crouched and one prone, above); a release's own `actor+0x144c`
is still asked of it; leg T (a toss square to a wall at 10.0-10.5, 12 and 20) and leg T2 (a standing tap refused at 9.0, 10.25 and 12 u, 3/5/3 times; SUMMARY.md) are in the summary.

### 5.4 The page and the room cannot disagree on a refusal (LANE-KILL B-06, the ship-named fold, 2026-11-21; unit tests on the port, no capture scored)

The page and the room cannot disagree on a refusal of an honest throw -- as far as the sweeps reach: this is evidence over a grid of still, unleaned bodies (`throwRoomLeniencySweep.ts`, no speed, no peek), not a proof; lean and moving throws are not swept. A throw the page refuses sends nothing: its
release request refuses before any clip or message when its clearance fails (`packages/viewer/src/grenadeCore.ts:1893`,
`refuseRelease('clear')`), its hand-open returns before the launch when its own cast meets a wall
(`grenadeCore.ts:1991`), and only a launched throw emits `throw` (`grenadeCore.ts:2022`), which is what the page sends
to the room (`packages/viewer/src/matchThrow.ts:578`, `throwEvent`), so the room has nothing to judge. A throw the page
takes the room judges by option D: past the reach (`packages/match/src/room.ts:8716`, the wall lines not asked of a hand
throw), `throwRelease` (`room.ts:8724`, refused `unclear` at `room.ts:8726`) runs the page's own `throwClear` over every
(power, aim) pair whose launch matches the sent velocity (`throwLaunches`, `room.ts:8637`) at the release request's
frame (`room.ts:8654`), each aim first tied to a real hand (`throwTied`, the start-tie, `room.ts:8649`), the aims below
the clamp going down only to P's floor (`THROW_AIM_FLOOR_ADAPTATION`, `room.ts:8635`, `room.ts:8647`) and each cast at
SIDE's yaws (`THROW_AIM_SIDE_ADAPTATION`, `room.ts:8634`). The room does not know H, the page's latched origin
(`THROW_AIM_ORIGIN_LATCH_READING`; `packages/viewer/src/throwAim.ts:13`, the room's own aim owed), so it tries the aims a
launch could have had rather than the one the page formed. The evidence is the sweeps
(`packages/match/test/throwRoomLeniency.{stand,crouch,prone}.sweep.test.ts`, `throwRoomLeniencySweep.ts`), which
send every throw the page lets go: 0 honest refusals at each stance's own select (§5.2's table), and 0 in the
cross-latch cases, the M67 selected in one posture and thrown in another, the room told nothing of the select (the
fold's run, 2026-11-21, unit tests: thrown standing and selected crouched or prone, synthetic 916,560 throws / 748,252
page-cleared / 0 refused, MP6 legs 14,740 / 9,712 / 0; thrown crouched and selected standing or prone, 916,560 / 587,810 / 0
and 2,680 / 240 / 0; thrown prone and selected standing or crouched, 342,000 / 166,204 / 0 and 1,000 / 508 / 0; the same
run at each stance's own select: 314,088 / 278,380 / 78,054 page-cleared, 0 refused). The cross cases print the worst
aim against sin(pitch) without asserting it: the margin's derivation assumes the stance's own origin under its camera
(§5.2); prone selected standing reads -0.76 on the synthetic floor, where the prone camera sinks under the feet. What remains is the room's own aim, owed (LATER 1294): a FORGED throw can
still be taken within the bounds §5.2 names -- the reach (`START_REACH_PLACEHOLDER`, 16 units plus the root's slack of
the head), the start-tie's window (a forged toss past a wall nearer than its own table hand, 10.5 ahead standing, and a
zero velocity matching a power-0 toss at every aim; `roomEquipment.test.ts` "TAKEN under r0004"), and the aims the
floor and SIDE admit -- and the seven forged throws §5.2 names as still taken stay `it.fails` ("GAP (LATER 1294)",
`tools/test/itFailsRegister.test.ts`).

## 6. Owed

- **The elevation's field** (§2): what writes `+0x1450` and whether the port's view pitch is it frame for frame; a
  capture of a throw whose aim moves between the release and the hand-open (research 230 §7) settles the read's
  effect on the trajectory, which nothing here claims.
- **C4's long fallback** (§3): what a knocked plant's 99 s kit timer comes to -- a cleanup not found here, the commit at
  99 s, or a cancel -- and whether the charge is ever spent. Source investigation (the kit's other writers through
  pointers, the knock's own kit handling) and a capture of a plant knocked before 1.098 s; then the owner's row
  (H156) chooses the policy. `C4_FALLBACK_PLACEHOLDER` until then.
- **The page and the room**: the room hears C4 through the page's `place` event (`./matchThrow`); the room's own
  plant check (`room.ts` `placeCharge`) does not time the plant, so nothing in the room changes. Not re-read for
  this note beyond that.
- **The clearance's query class** (§5): the owners `+0xa1` mask 4 (bit 2) marks and the record's `+0x3c` (`DAT_0044d758`
  read 0 at the release request, and the hull test's side, by LATER 247: §5); then whether bodies (the others') stop a throw.
  The mask's writers beyond `CWorld::AddChild` (LATER 256; LATER 247's review, F1): the collider factories `FUN_00317af0`,
  `FUN_00317c20`, `FUN_00317d90` set it from the model's byte (`*(model+0xd8)+0x2f == 2`, D:L216328-216331, D:L216382-216385,
  D:L216432-216435); `FUN_0026ee70` inherits it (D:L117996-117999); a clone copies it (D:L213426-213427); the rest unread. Source reading first; `THROW_CLEARANCE_QUERY_PLACEHOLDER`
  until then.
- **`FUN_0059d830`'s other refusals** (§5): its `actor+0xe1` bit, `FUN_005a7de0(actor, 1, 1)`, `+0x105e` bit and state
  6 also refuse the release request; not ported (the thrower's `holding` stands for them). A reading of each against
  the port's body states. *PAR-86 (research 251 §12.8) ports the `+0x105e` bit and the state 6 -- off the floor the
  chase stands and the request is refused; owed still: the `+0xe1` bit and `FUN_005a7de0(actor, 1, 1)` (after a hard
  landing, `seal_land_hard`'s `NoFire` 0.3 holds the chase, 251 §12.8).*
  *NU-1b (research 313 sections 5 and 8.5, 2026-10-17; reading, pending review) ports one instance of
  `FUN_005a7de0(actor, 1, 1)`: a climb's clip on top -- its bare `NoFire` -- holds the chase and refuses the release
  request as the air does (`grenade.ts` `climbBefore`, `CLIMB_THROW_REFUSED_READING`). The other tops' `NoFire` (the hard
  landing's among them) and the `+0xe1` bit stay owed.*
  *P36 (the online-parity sweep's TB-12, 2026-11-02; reading, pending review) ports
  `FUN_005a7de0(actor, 1, 1)`'s phase test (D:L457365) on the page -- not its other refusals (the reload lock
  `FUN_005a7ab0`, `FUN_005a7980`, the swap and paired clip lists D:L462620-462678, the `+0x1060`/`+0x1e4`/`+0xeac`
  terms; the room's 'swapping' is not asked by `startThrow`): every top's `NoFire` through its phase test (D:L462695-462705,
  `FUN_0058a8c0`), the walk's `fireAllowed` (`net/fireCapability.ts`, research 218 section 1 -- the same function the
  room's command frame records as `fire`, which `room.ts` `takeThrowStart` refuses as 'nofire', THROW-INTERRUPT, research
  326 §2.4). Consumer: `grenade.ts` `GrenadeSource.fireAllowed` (wired in `matchThrow.ts` to `WalkMode.fireAllowed`) --
  the chase stands under it (`noFireBefore`, D:L453478-453480) and the release request is refused as a short tap
  (`startThrow`'s `'nofire'`, D:L475497-475498), so the page no longer tells the room a `throwStart` the room refuses. The
  climb is one instance (its own reading kept); the hard landing's 0.3 now holds the chase. The press itself is not
  refused (the plain trigger's branch, D:L453633-453637, research 251 §12.8). Owed still: the `+0xe1` bit, and a capture
  of a frag held through a stance change and let go under it (the power frozen, thrown at the clip's end).*
- **The clearance's prevalence and feel** (§5): how often a map's walls and props refuse a throw, and how the refused
  release feels. A capture of throws against cover on the maps (research 230 §7).
- **The retail tap**: how many frames a real short press holds the trigger's pressure, and what the pressure byte
  reads on its way down (§1's tick counts are the port's model only). A pad-input capture of the original.

## 7. Readings and placeholders

§1 and §2 add none: the threshold is the constructor's constant, read (`THROW_ABORT_POWER`, a plain name); §2 moves
existing reads to the hand-open and adds no value. `C4_KIT_TIMER_SECONDS` (99) is read (D:L475448-475451), a plain name;
so were §5's `THROW_CLEARANCE_ENDS` (the words of D:L414004-414047) -- r0001's, superseded by r0004 (OT.R97) and gone
from the port with §5.3; the words stay in §5's table.

| name | listed at | what it stands for | settles |
|---|---|---|---|
| `THROW_CLEARANCE_QUERY_PLACEHOLDER` | §5, §5.3 (re-filed for r0004, 2026-11-21) | `'movement surfaces, every gated owner'`: the clearance's world query -- r0004 `0x33b860(world, start, end, 1)` (0x54e854-0x54e888), the structure of r0001's `FUN_0031e250` -- asked of the surfaces with bit 1 set and bit 18 clear on every owner the model gate passes, front entries only, the ONE nearest hit taken (`0x2f1bd0`). For r0004 the walk `0x2f1690` (its sidedness, the class byte at the call) is not read: the port keeps r0001's reading (`DAT_0044d758` 0, LATER 247; one-sided, LATER 250), the sidedness the capture's fit used (13/13); the owners `+0xa1` mask 4 (bit 2) skips and the record's `+0x3c` are not read | r0004's `0x2f1690` read; then §6's source reading |
| `THROW_CLEARANCE_AIM_READING` | §5.3 (2026-11-21; resolved 2026-11-21, LANE-KILL B-06's aim) | `'the pitch sine'`: the clearance ray's aim -- r0004 casts along `actor+0x144c`, (0, s, -sqrt(1 - s^2)) with s = `actor+0x228` (0x5edff8-0x5ee07c), whose writer is unread; the port feeds the caller's `aimSin`, the page's `releaseAimSin` (the view pitch's sine, -0.159 at `init_aim_pitch`). Measured at rest, M67 held (PC 3, r0004, 2026-11-21): standing 0.229-0.280 (varying), crouched 0.0286, prone -0.1915; the capture's 13 legs fit at the measured aims, and the page's -0.159 flips one (B FAR standing) | resolved: `+0x228` is the remote body's copy; the local writer `0x5e6690` read (§5.3) and the page's aim is it (`THROW_AIM_ORIGIN_READING`); the name removed from the code |
| `THROW_AIM_ORIGIN_READING` | §5.3 (LANE-KILL B-06, 2026-11-21) | `{ stand: { up: 8.808, ahead: 0.453 } }`: the standing throw aim's origin O over the feet (`viewer/src/throwAim.ts`). A FITTED CALIBRATION, not a measurement of O: two parameters on four poses (two of them tight); `ahead` has no counterpart in r0004 (O on the actor's x and z, 0x5e67fc-0x5e681c) and absorbs about 0.4 u of a mismatch not explained; the verdicts do not depend on it. Fitted to the capture of the original (r0004 under PCSX2, PC 3, 2026-11-21), record D:/s2u-captures/kill-item1-20261121T0305Z/kill-item1-20261121T0305Z.zip (sha256 b65866b086c6451ff4093d6f91d8defab9e34070ab72a13c933aa1cfbafeb3de); summary agent-mail/evidence/weekend-mega-2026-11-14/rig/kill-item1-PC3/SUMMARY.md: four standing rest poses' logged `+0x1450` against the page's T, least squares on the sine weighted by each logged half-range; every pose inside its range. Its code source (an aimpoint node, the cache `+0x14ac`, a hold pose) NOT read | replaced (2026-11-21, the latch): `THROW_AIM_ORIGIN_LATCH_READING` -- the 8.808 was PC 3's crouched latch (8.76) fitted with an `ahead` r0004 does not have |
| `THROW_AIM_ORIGIN_LATCH_READING` | §5.3 (LANE-KILL B-06, 2026-11-21; replaces `THROW_AIM_ORIGIN_READING` and its fit) | `{ stand: { up: 13.11, ahead: 0 }, crouch: { up: 8.76, ahead: 0 }, prone: { up: 1.356, ahead: 0 } }`: the throw aim's origin O = (feet.x, feet.y + H, feet.z) by the posture at the M67's select (`viewer/src/throwAim.ts` `throwAimOrigin`; the page's `GrenadeCore.selectPosture_`, set when the hand's item replaces the firearm: `equip`, `takeDetonator`, `plantC4`), the same H at rest, the release request, the clip, the hand-open and the arc, whatever the stance after. A capture of the original: PC 2 KILL-AIMORIGIN (r0004, 12 throws selected standing; record D:/s2u-records/KILL-AIMORIGIN-PC2/KILL-AIMORIGIN-PC2.zip, sha256 91ec939a4637dc481c898b76511270f59c606508aa2bba185db26d187ae0947b; RESULTS.md): `+0x14a4` 13.092-13.128, one value per throw over every frame; PC 3 kill-item1 (record D:/s2u-captures/kill-item1-20261121T0305Z/kill-item1-20261121T0305Z.zip, sha256 b65866b086c6451ff4093d6f91d8defab9e34070ab72a13c933aa1cfbafeb3de; every refill selected crouched): H 8.7635 +-0.001 from the logged aim and T over 305 standing samples (agent-mail pilot/kill/item-1-aim-origin-reconcile.md s1); PC 2 KILL-LATCH (r0004 under PCSX2 2.8.2, 2026-11-21; record D:/s2u-records/KILL-LATCH-PC2/KILL-LATCH-PC2.zip, sha256 5bcf4f60b800abcb29c421056a687fa17efce098c6579275d1457fc62670ccc0; summary agent-mail/evidence/weekend-mega-2026-11-14/rig/KILL-LATCH-PC2/RESULTS.md): the freeze through a stance change after the select (s1), prone 1.356 (3/3; was `THROW_AIM_ORIGIN_LATCH_PRONE_PLACEHOLDER`, 0.397, removed), and a standing select at 20 u at the default look refused 3/3 before any clip (s2). The mechanism -- r0004 `0x5e7100` writes `+0x14a0..a8` only when the held slot's attachment record exists with `+0xc` set (0x5e7188-0x5e71c0), so a firearm's `aimpoint` is live and the M67's frozen -- a reading, pending review; which record is empty for the M67 not read. A select with no snapshot leaves the latch unset (`THROW_AIM_SELECT_UNSEEN_PLACEHOLDER`). Kept, with no capture (a reading of the no-write path, §5.3; the review of 4e26b9ad0e, findings 2, 3 and 7): across grenade types, to and from the Detonator, and through a C4 plant back to the throwable held before it -- the ASSUMPTION that the other grenades', the Detonator's and C4's records do not write `+0x14a4`, as the M67's; the prone value a reading (no prone-select throw scored). Through the page on MP6: PC 2's launches within 1 degree (`throwAimCapture.disc.test.ts`), PC 3's rest sines within 0.005 | the freeze and the three postures settled by KILL-LATCH; left: the M67's slot record read at `0x5e7100`, and the Detonator's, C4's and the other grenades' (or a capture of `+0x14a4` across those changes of the held item) |
| `THROW_AIM_ORIGIN_LATCH_POSE_PLACEHOLDER` | §5.3 (LANE-KILL B-06; the controller's ship-named ruling, 2026-11-21; LATER 1318; retires `THROW_AIM_ORIGIN_LATCH_STALE_PLACEHOLDER`) | `'the stance constant at the select'` (`viewer/src/throwAim.ts`; no value of its own): the latch's height model is `THROW_AIM_ORIGIN_LATCH_READING`'s stance constant, picked by the stance flag at `equip()` (`viewer/src/grenadeCore.ts`), the flag flipping on the stance press's frame -- not the original's posed aimpoint. The original latches H from the held weapon's posed `aimpoint` node, written every post-tick and frozen one frame before the select, +-1 frame (the pad's select caller of 0x5cc160 not identified) (r0004 0x5e6c20 -> 0x5e7100; agent-mail pilot/kill/item-1-latch-timing.md s0-s2; a reading, re-read at the ELF by a second reader, review-b06-final-3d89973e77). It differs in three cases: (a) a select mid-transition: right after a crouch press the port latches the crouch height (8.76) at once; the PS2 still latches about the standing height (13.1) at first, then part-way down through `seal_stand2crouch` (about 18 game frames; the heights along it not computed); the mirror when standing up from a crouch; (b) a settled crouch: the port's 8.76 is one idle of three; KILL-LATCH (PC 2, r0004 under PCSX2 2.8.2, 2026-11-21; record D:/s2u-records/KILL-LATCH-PC2/KILL-LATCH-PC2.zip, sha256 5bcf4f60b800abcb29c421056a687fa17efce098c6579275d1457fc62670ccc0; `setup.log`) reads three steady crouch idle heights, 6.893-6.896, 8.273-8.280 and 8.776-8.795 (PC 3's 8.27 latches the second); that they are the three crouch idles is an inference; (c) a select with the firearm raised: about 15.8 standing on the original (ONE trial, KILL-LATCH `csv/VOID-crouch-test.csv`, the M67 not selected: no select captured in that state), 13.11 here. It agrees for a settled stand (13.09-13.13), a settled prone (1.356) and the 8.78 crouch idle. Player-visible: near a wall a throw-or-refuse verdict can flip | latching the posed aimpoint node's height (heldItem.ts / play.partPoint, through matchThrow.ts and play.ts) at the frame before the select, scored against KILL-LATCH and KILL-AIMORIGIN; and a capture of `+0x14a4` per frame through a crouch press with a select at 1 / 5 / 15 frames, plus each crouch idle |
| ~~`THROW_AIM_ORIGIN_LATCH_STALE_PLACEHOLDER`~~ (retired 2026-11-21) | §5.3 (LANE-KILL B-06, 2026-11-21; re-worded at KILL-LATCH; retired at the ship-named fold) | ~~`{ up: 8.27, ahead: 0 }`: an early crouch select latches the crouch settle's current height (6.90-8.79), not modelled~~ -- the "settle" was a misreading: KILL-LATCH's `setup.log` holds three steady crouch idle heights, not one crouch settling (agent-mail pilot/kill/item-1-latch-timing.md s3); PC 3's 8.27 latches are the 8.28 idle. The constant and its uses removed | retired 2026-11-21: superseded by `THROW_AIM_ORIGIN_LATCH_POSE_PLACEHOLDER` (its (b)) |
| `THROW_AIM_SELECT_UNSEEN_PLACEHOLDER` | §5.3 (LANE-KILL B-06, 2026-11-21, the latch's fold) | `'the stance at the read'`: the aim's origin when the page saw no select to latch (`viewer/src/grenadeCore.ts` `GrenadeCore.selectPosture_` null -- the throwable came up while the source gave no snapshot): the origin of the stance now (`THROW_AIM_ORIGIN_LATCH_READING`). The original always holds a latched `actor+0x14a4` (r0004 `0x5e7100`, written while a firearm's record is up, so the last write before the select stands); the port has no such last value -- the port's case, no original | the page carrying the posture of the last frame a firearm was up into the thrower, or a capture of a throw whose select the page cannot see |
| `THROW_AIM_ORIGIN_STANCE_PLACEHOLDER` | §5.3 (LANE-KILL B-06, 2026-11-21) | `{ crouch: { up: 5.882, ahead: 0 }, prone: { up: 0.397, ahead: 0 } }`: the crouched and prone aim's origin, unknown (the capture logged no T there; a solve against the page's camera gives 10.07 and 8.85, heights no hand reaches). The stand-in: the port's posed right hand at rest in that stance (the fixture SEAL's idle, `throwAimCapture.disc.test.ts`), ahead 0 as r0004's O. The captured crouched and prone verdicts hold under it | replaced (2026-11-21, the latch): crouched by `THROW_AIM_ORIGIN_LATCH_READING`.crouch (a capture), prone by `THROW_AIM_ORIGIN_LATCH_READING`.prone (1.356, KILL-LATCH; the 0.397 placeholder that stood between removed) |
| `THROW_AIM_CONE_READING` | §5.3 (LANE-KILL B-06, 2026-11-21) | `{ stand: 85 / 85 / 85, prone: 20 / 20 / 45 }` degrees: the cone `0x5e6dd0` holds the aim to (states 0, 1, 6 one set, state 2 the other); the six bound words lie in BSS, unread, so the constructor's defaults (0x42da3c-0x42da84) stand; `dynamics.rdr`'s pitch and yaw limits may replace them (inference). The clamp `0x5b3d60`'s tail (the rebuild) not read: the port rebuilds the vector from the two held angles. No capture pose reaches either cone | the six words read in a running r0004; `0x5b3d60`'s tail |
| `THROW_AIM_CAP_PLACEHOLDER` | §5.3 (LANE-KILL B-06, 2026-11-21) | `null`: the camera's `+0xec` cap on the aim ray (0x5b0428-0x5b048c) -- the page's grenade source passes none, so the ray is the M67's range floored at 600; on MP6 every T the capture's poses ask is a hit inside 600 (the MID) | the source handed the camera's far (as `Fire.eyeReach`'s `aimCap`) |
| `THROW_AIM_BODIES_PLACEHOLDER` | §5.3 (LANE-KILL B-06, 2026-11-21) | `'hull only'`: a body under the crosshair is never T -- the eye query's hits hold bodies (`0x33b770`) and its target lock a locked body's point (0x5b0780-0x5b09cc); the port's grid holds none | the owners `0x33b770` walks read; a capture of a rest aim with a body under the crosshair |
| `HAND_OPEN_CAST_READING` | §5.3 (LANE-KILL B-06, 2026-11-21) | 25: r0004's hand-open cast (0x5c92b4-0x5c93ac), from the stance's table point along 25 x the aim; any hit, unfiltered, skips the launch and the count's decrement (0x5c93ac to 0x5c98a0); `throwCommit.ts` `handOpenClear`. What a skipped hand-open leaves is not read: the port keeps the item up, unspent | a capture of a release cleared at the request and walled at the hand-open |
| (*prose, no constant*) the hand-open aim's drift | §5.3 (the review of 4e26b9ad0e, finding 5) | the hand-open aim's drift not modelled: in the original T drops 0.27-0.33 u between the release request and the hand-open at a fixed H, so the hand-open aim sits about 0.5-0.8 degree under the request's at the walls and 0.08 in the canyon (KILL-AIMORIGIN RESULTS point 4); the page's camera ray is the settled rest pose's and does not follow it. Four of PC 2's launches (the level look and the three walls), the thrower's own `lastThrow`, sit 0.13-0.77 degree over the capture (the default look's is clamped to the power term, 11.98, and does not tell the latches apart), within `throwAimCapture.disc.test.ts`'s 1 degree | the page's idle and throw-clip camera bob against T's logged drift |
| (*prose, no constant*) the aimed launch's speed (`throwVelocity`, scene `projectile.ts`) | §5.3 (LANE-KILL B-06; the controller's ruling (a) on the toss, 2026-11-21) | **reading, re-read at the r0004 ELF by a second reader.** On r0004's aimed launch branch (byte 0x64ed40 = 1 in the file; 0x5c96d0-0x5c9748) the grenade's speed is not the power's speed s0 but the release hand's ground distance to the point `range` ahead of the actor's origin, sqrt(range² + 2·range·z + x² + z²), clamped to [0, ComputeMaxVel]; `range` (0x59d0d0) is where s0 would land from the hand's height at pitch = clamp(asin(aim y), 0, 0.959931) + (10 + 2p) degrees. The speed therefore depends on the aim as well as the power, rising with it only at low pitch and not at all once the clamp binds (a full throw); the toss and the full throw take the same branch (the power is not tested). `throwVelocity` matches it step for step (its comments still cite r0001's addresses). So B-06's aim raises the standing toss to 42.47 u/s (agent/next 39.3; the original 24-25): the gap is the power (LATER 1302). The toss's aim at PC 2's look is UNMEASURED: GRENADES-A did not log the toss's look pitch, so its 24.15-24.82 u/s fits an aim at or below 0 without proving it | the toss's look pitch and aim logged through a capture of the original; sin/cos/asin at 0x1b3720 / 0x1b3548 / 0x1b38c8 decoded |
| `THROW_CLEARANCE_LENGTH_READING` | §5.3 (2026-11-21) | 25: the clearance ray's length, r0004 `0x54e6f0`'s one float immediate (`lui 0x41c8` at 0x54e798), scaling the aim vector `actor+0x144c` (0, s, -sqrt(1 - s^2)); reading of r0004, two readers; the capture bounds it to at least 19.7 (leg D-T10) | a capture of the two points handed to `0x33b860` (r0004 0x54e884) at a release |
| `THROW_CLEARANCE_PAIRS_ADAPTATION` | §5.2 (LANE-KILL B-06, 2026-11-21; B1, the review of c5629fb494) | `'any pair, either stance'`: the room (`room.ts` `throwCleared`, `throwRelease`) passes a hand throw's clearance (`throwClear`, r0004 `0x54e6f0` -- r0001's `FUN_005499e0` superseded under OT.R97 -- at the release request's body, r0004 0x5c5d6c) if any launch matching its velocity (`throwLaunches`: a power, an aim, a range's stance) clears, in that stance or the request's posture's (standing, the crouched state too), a pair at the launch clamp's bound tried also at every aim past it to the cone (`THROW_AIM_CONE_READING`; B1), below 0 no lower than `THROW_AIM_FLOOR_ADAPTATION` -- the power and the aim are not on the wire; an adaptation, no original. Its cost: seven `it.fails` under LATER 1294 (§5.2) | the release's power on the wire (a protocol change), then the one pair asked |
| `THROW_AIM_SIDE_ADAPTATION` | §5.2 (LANE-KILL B-06, 2026-11-21; the prone sweep's 50) | `{ stand: [0], crouch: [0], prone: [0, 45, -45] }` degrees off the facing: the yaws at which the room (`room.ts` `throwRelease`) casts each tied aim's clearance (`throwClear` takes the aim's sideways term); prone's +-45 the prone cone's yaw bound (`THROW_AIM_CONE_READING.prone.yaw`, `coneHold`), at which the page's prone aim is held when its camera looks down past it; standing and crouched ahead only (the grid's aims there all ahead; the standing +-85 would take the delta review's F1); not the original's (r0004 `0x5e6690` computes its own aim); LATER 1294 | the room's own throw aim (LATER 1294), or the sideways term on the wire |
| `THROW_AIM_FLOOR_ADAPTATION` | §5.2 (LANE-KILL B-06, 2026-11-21; the controller's ruling (ii) and its conditions on the pitch floor; the review of afd246dfe3 B1) | `'sin(the command pitch) - the margin, within the cone'`: the room's B1 leniency below the launch clamp (`room.ts` `throwRelease`, `throwAimFloor`): per throw, the aims below 0 go down to sin(p) less `THROW_AIM_FLOOR_MARGIN_ADAPTATION`, p the lower camera pitch the room's cone holds at the request and the throw, within the cone's `down`. Was the fixed -0.191536 (the lowest rest aim the capture logged), which refused a stick held down at a tall wall. Not the original's (the original computes its own aim, r0004 `0x5e6690`); LATER 1294 | the room's own throw aim (LATER 1294) |
| `THROW_AIM_FLOOR_MARGIN_ADAPTATION` | §5.2 (LANE-KILL B-06, 2026-11-21; the controller's conditions on the pitch floor) | `{ stand: 0.0475, crouch: 0.0475, prone: 2 }` in sine. Standing and crouched, 0.0475 = 3 commands of RECRUIT's full stick (`THROW_AIM_PITCH_SAMPLING_COMMANDS`; `MAX_PITCH_RATE` 0.950 rad/s, `look.ts:91`, `FUN_00594600` D:L452783, x 3 / 60; 1.95 commands at the fastest preset's 1.462 rad/s, `lookGate.ts:155-159`) for the frame sampling, covering the crouched -0.0263 at MP6's leg B FAR (the camera pass's 0.7 u lift); a mouse faster than that is not covered. Prone, 2 = the cone (`down` 20), covering the 20-degree up-clamp's -0.0806 (pitch 25) and the camera pass's -0.024 (pitch 18); a tighter bound would hold on MP6. Both: 0 honest refusals in the full-pitch sweeps (page-cleared at the latch, 893dd1be9d / a4e99d8a32: standing 314,088, crouched 278,380, prone 78,054; before the latch, 77da3bbe1b: 357,402 / 294,140 / 78,974); an adaptation, no original | the room's own throw aim (LATER 1294); the original's crouched and prone camera logged at rest (the crouched and prone origins are `THROW_AIM_ORIGIN_LATCH_READING`'s, prone since KILL-LATCH) |
| `POSED_RELEASE_HAND_READING` | §5.2 (LANE-KILL B-06, 2026-11-21) | the page's own posed release hand per `GetThrowAnim` clip, three frames (before, release, after), actor frame: `grenadeCore.ts` `launchOf` with `handPoint('rhand', RELEASE_POINT)`, computed on the fixture disc's SEAL with the page's `Animator` and `ThrowPose` stepped on the game frame and read at each clip's release frame k = ceil(`releaseSeconds` / `GAME_FRAME_DT`) (LATER 1428, 2026-11-24; *was* the first 1/60 s render frame; the sample time from r0001 `FUN_005802b0` D:L441904, `FUN_005c1970` D:L476883-476886 and D:L477060-477067, re-read by LATER 1428's reviewer; r0004 0x5c9538-0x5c9590, the author's read of the r0004 bytes, NOT yet re-read by a reviewer; corroborated by PADR1-PC2 L4, whose clamped speed fits frame k's hand height alone; `standToss` sits at T / `GAME_FRAME_DT` = 31.98, so its k rests on `GAME_FRAME_DT`'s reading to 0.05%) -- a reading of the PORT's pose from the disc's clips, not of the original's code (whose clearance starts at the table point and samples no bone); the room's start-tie takes `ROOM_START_TIE_RENDER_GRID_ADAPTATION` instead until LATER 1428's page half. Exposure: one frame's hand travel (about 4 to 8 units a game frame at the standing release) between a value and the page's sample; the pistol clips and the other SEAL bodies (seal_C within about 0.2) not held | a served run of the page's `from` against the table, frame for frame; a capture of the original's release hand |
| `ROOM_START_TIE_RENDER_GRID_ADAPTATION` | §5.2 (LATER 1428, the main controller's ruling B, 2026-11-24T01:21Z) | [adaptation] the room's start-tie candidate hands (`room.ts` `throwTied`; no original): the page's posed release hand on the 1/60 s render grid, as `Play.partPoint` samples it today -- `POSED_RELEASE_HAND_READING`'s values before LATER 1428 re-read it at the game frame. No server check is loosened on a reading fix: the room keeps these until the page half moves `Play.partPoint` to k x `GAME_FRAME_DT`, then this goes and the room takes the reading in the same merge; held apart by match `test/roomStartTieHands.test.ts` | LATER 1428's page half (retires it) |
| `HAND_OPEN_CROUCH_POINT_READING` | §5.3 (the review of c5629fb494, 2026-11-21; LOW confidence) | `'throwAnim'`: the table point the hand-open's cast (`throwCommit.ts` `handOpenClear`) starts from for a crouched state -- the port's `throwAnim` point for the state and speed (for a crouch above 15 u/s, OBF-23's crouch-run, the STANDING throw's), where r0004's hand-open (0x5c9158) always takes the set at 0x66b080 (one reader, the review; the set's points not compared with `THROW_ANIMS`). No behaviour change: the port's choice kept | 0x5c9158's branch re-read with the 0x66b080 set's points against `THROW_ANIMS`; then a capture of a crouch-run throw at a wall the two points straddle |
| `C4_FALLBACK_PLACEHOLDER` | §3 | `'kitTimer'`: a C4 placing whose clip callback an in-game end removed (a knock, or `replaced`) keeps the kit's 99 s timer, the kit busy, and runs the commit's checks at its end -- the transcription as far as read; no other cleanup found but the death's (`FUN_005b8920`). The two browser-only exits are not this name: `C4_PLANT_LEAVE_CANCEL_ADAPTATION` (`'cancel'`) drops the placing at once, unspent, when there is no walk snapshot or the latched hold vanishes with no end heard | the source investigation and capture of §6, then the owner's row (no permanent cancel or refund of the in-game end decided here) |
| `CLAYMORE_COUNT_LIVE_READING` | §8.1, §8.5 U1 (PAR-96; the review's F1, 2026-10-14) | `'at rest'`: a claymore counts toward the four (`FUN_003cc1f0` D:L321194-321216) from its set-down until it is removed -- the port's `state === 'rest'` standing for the count's third test, the charge's node `+0x5c` bit 0 (D:L321209), whose setter through the node's vtable `+0x38` is believed (D:L473995, D:L474030; `PTR_PTR_004067b0` unresolved) and whose clearer is not traced; read by the room's and the page's `claymoresDown` (§8.4 B2, B4) through `countsTowardClaymoreLimit` (`@s2u/scene` `projectile.ts`, beside `CLAYMORE_RULES`; carried in code by PAR-96's build, 2026-10-16, reading, pending review -- the settles cell before it read "*note only* until PAR-96's build carries it in code (B2, B4), when this cell becomes the code's; then ...") | the node's vtable `+0x38` read for a charge's node and every caller passing 0, or §8.5 U1's capture |
| `CLAYMORE_HELD_TRIGGER_READING` | §8.2, §8.5 U2 (PAR-96's build, B6, 2026-10-16; reading, pending review) | `'per press'`: the page (`packages/viewer/src/grenade.ts`, `pull` -> `startPlacing`) asks the claymore's and the PMN's fire once a press -- the refusal's message once a press, no placing started under a held trigger -- where the original re-asks the whole fire every frame while the trigger is held (`+0x818` unraised, D:L475328 against D:L475330-475336; the gate `FUN_005c0ae0` D:L476380-476420, D:L476439-476441): the binoculars (D:L475305), the count, the water's bare return (D:L475318-475320). B6 took the name, not the port: the re-ask runs through the page's trigger (`matchThrow.ts`, the binoculars' `fireRefused`) as well as the thrower's `update` | §8.5 U2's capture: four down, the trigger held 5 s (the message three times or once); held in deep water while stepping out (placed or not); the controller's `+0x118` frame by frame (research 305's owed read of its writer) |

## 8. The claymore's limit (PARITY-2 PAR-96)

- Date: 2026-10-14 (PARITY-2, plan
  [`../plans/2026-10-08-web-sprint-parity-2.md`](../plans/2026-10-08-web-sprint-parity-2.md), row PAR-96). Branch `agent/par96-read` from `agent/parity-2` 3c9a627e7 (`main` fe6b736a1 merged); the port's line
  numbers below are that tree's.
- Status: **reading, pending review.** Source inspection only: the decompilation (the same file and hash as this note's
  head) re-read at every cited line for this section, and the port's files read at the lines named. No test was run, no
  game, emulator, capture or browser; nothing of the disc was read. A reviewer who did not write this re-reads every
  cited line before a rule here counts as a reading.
- Source of the finding: research [312](312-the-network-magazine-refill.md) §10.6 ("Found, not this row's", the online
  lane's NET-CAP; on `agent/online-netcap` c8647d5d7, not yet on `main` when this was written), routed to this lane as
  PAR-96. This section reads it whole and adds the selection gate, the order of the tests, the held trigger and the
  port's every use.

### 8.1 The count (`FUN_003cc1f0` D:L321194-321216), read whole

- **What it walks.** Its first argument is the projectile manager `DAT_004b5220` (all three callers pass it); it walks
  the manager's **pointer list** -- the count at `+8`, the data at `+0xc` (D:L321202-321204, D:L321213) -- and never
  the pool of flying projectiles (`+0`, `+0x10`..`+0x1c`; research 312 §10.2 for the layout). The list holds the
  charges set down: its only appender read is `FUN_005bc730`'s (D:L474104, after the charge is made on the heap,
  D:L473988-473992); a search of the decompilation for another append to the manager's `+4` found none.
- **What it counts** (D:L321206-321210): an entry when all three hold --
  1. `FUN_003c51b0(entry)` is non-zero: the getter of the entry's byte `+0xc5` (D:L316744-316748);
  2. the entry's owner `+0xac` equals the second argument (the callers pass the actor's id, `actor+4`);
  3. `FUN_003c7ae0(entry)` -- the entry's `+0x20` (D:L318848-318852), the charge's world node, made by `FUN_00317a90`
     and hung there by `FUN_003c7ad0` (D:L473993-473994) -- has its `+0x5c` bit 0 set. *Believed, not traced* (the
     review's F2, 2026-10-14): `FUN_005bc730` sets that bit through the node's vtable `+0x38` with 1 once the charge is
     in the world (D:L474029-474031, after a 0 at D:L473995). The slot itself is unresolved: the node's vtable is
     `PTR_PTR_004067b0`, set by its constructor `FUN_00316e30` (D:L215819; `FUN_00317a90` makes the node through it,
     D:L216287-216291), whose `FUN_00317060(node, 0)` (D:L215846) defaults the bit to 1 (D:L215911-215917); the calls
     with 0 and then 1 are consistent with `+0x38` writing it, but its target is not read. What clears the bit while the
     charge is still listed is not traced either (§8.5, U1, which names both). *(Written first as fact: "sets that bit
     through the node's vtable `+0x38` with 1".)*
- **Who sets `+0xc5`.** Its only writer is the setter `FUN_003c51c0` (D:L316753-316757); a search for any other store
  to `+0xc5` found only the setter's own line. The setter's only caller is `FUN_005bc730`: `FUN_003c51c0(charge, type
  == -0x67)` (D:L474101), the type being the hand's record's `+0x7c` byte read at D:L473966. -0x67 is 0x99, item 153,
  **the claymore**. So every charge `FUN_005bc730` makes gets `+0xc5` written: 1 for a claymore, 0 for C4 (0x97,
  -0x69), the satchel (0x98, -0x68) and the PMN (0x9e, -0x62); MPBOMB (0x9a, -0x66) online makes no charge here (the
  host's request, D:L473980-473983). The flag's two other readers agree on its meaning: the placed charge's tick never
  lets the fuse set off an entry with `+0xc5` up (D:L316897-316899), and the Detonator's walk sets off only entries
  with it up (`FUN_005c0130` D:L476024-476029; research 85 §9.7.1).

**What counts, then:** the owner's claymores set down and still listed with the node's bit up. **Not** a claymore in
the placing (the 1.3 s action: no entry until `FUN_005bc730` runs at its end); **not** anything in flight (the pool is
not walked); **not** C4, the PMN or the satchel set down. **Per owner**, by the actor's id: each SEAL (and any actor
whose kit runs these branches) has its own four. **Not online-only**: neither `FUN_003cc1f0` nor the branches that ask
it test `DAT_0045a0c1`, and `FUN_003cc1f0` dereferences the manager with no null test (D:L321202), so the manager is
there whenever it is asked -- offline and online alike.

### 8.2 Who asks it, and what a refusal does

The three callers (a search for `FUN_003cc1f0` finds no other):

| caller | item | the test | refused | lines |
|---|---|---|---|---|
| `FUN_005be9a0`, type -0x67 | the claymore's fire | `FUN_003cc1f0(DAT_004b5220, actor+4) < 4` | see below | D:L475306-475337 |
| `FUN_005be9a0`, type -0x62 | the PMN's fire | the same count of **claymores** `< 4` | the same | D:L475338-475369 |
| `FUN_005bdc30` (the slot gate) | the Detonator (0xc1) | `FUN_003cc1f0(...) == 0` refuses | not selectable | D:L474637-474641 |

- **The limit is four placed**: the fire proceeds while the count is 0-3 (`< 4`, D:L475308, D:L475340); a fifth is
  refused. The value `CLAYMORE_RULES.maxPlaced` (4) stands.
- **The order inside the fire.** Everything sits under the view-state test `actor+0x200 != 4` (D:L475305: no use with
  the binoculars up, research 84). Then the count (D:L475307-475308), and only when it passes the water test
  (`+0x105e` bit 7 and the depth `+0xf88` against `DAT_003dfe10` x 0.32, a bare return, D:L475310-475320; PF-13), then
  the action `Place claymore` (D:L475322), the kit's busy bit (D:L475323) and its 1.3 s timer (D:L475324-475327), the pull's
  count `+0x818` up one (D:L475328). The PMN's branch is the claymore's twin (D:L475338-475368); neither selects the
  Detonator here (that is `FUN_005bc730`'s, for 0x99 only, D:L474128-474130).
- **The refusal is at the press, not at the selection or the placement.** The claymore's slot gate does not count
  (`FUN_005bdc30` D:L474636-474648 tests the count for 0xc1 only), so the claymore can be taken up with four down; the
  placing's end (`FUN_005c1970` -> `FUN_005c2430` -> `FUN_005bc730`) does not count again (no caller there). A second
  placing is not expected to start during the 1.3 s: the kit's busy bit (`+1` 0x02, D:L475323, cleared at the
  timer's end D:L476886-476897) holds the slot gate (`FUN_005c4fd0`, §3), and the clip `seal_place_claymore` carries
  `NoFire` (research 85 §9.7.1) where the fire gate asks the body's lock (`FUN_005a7de0`, D:L476442-476445) -- the
  last link believed, not traced here. On a refusal (D:L475330-475336) the
  message `Unable To Deploy: Max Equipment Items Placed (4)` (0x65f880, `CLAYMORE_RULES.maxPlacedMessage`) is posted on
  the main message window 0x4366a0 (research 222 §9) **only when the kit's `+0x8` timer is out**, and `+0x8` is set to
  2.0 (0x40000000); the kit's frame counts it down (`FUN_005c0fd0` D:L476671-476673). Nothing else: no action, no
  busy bit, no timer, nothing spent, and the pull's count `+0x818` is **not** raised.
- **The press is kept, not dropped.** Because `+0x818` is not raised, the fire gate `FUN_005c0ae0` passes again on
  the next frame while the trigger is still pressed (the controller's `+0x118` state 1 or 2, D:L476380-476420; research
  305; the pull's count test `iVar4 <= +0x818`, D:L476439-476441), and `FUN_005c0fd0` runs the fire again
  (D:L476569, D:L476637-476638). So a held trigger re-asks every frame: the message is re-posted each time its 2 s run
  out, and if the count falls below four while the trigger is held (one of the claymores set off by another blast:
  research 94 §C5.2's `VOLATILE_READING`) the placing starts without a new press. Releasing the trigger (state 0 or
  3) zeroes `+0x818` and answers no (D:L476380-476416). *The review's F4*: the count's refusal is not the only one
  that leaves `+0x818` unraised -- the binoculars' test (D:L475305) and the water's bare return (D:L475318-475320) do
  too, so the held trigger re-runs the whole fire each frame: held while stepping out of deep water, the placing starts
  with no new press (B6).
- **The Detonator** (0xc1) is selectable only while the owner has a claymore down (D:L474637-474641): a PMN or C4
  down does not open it. Its fire (`FUN_005c0130`) does not count; it sets off the owner's claymores within 500
  units (D:L476024-476029) and selects the claymore again (D:L476031).

**The satchel**: its fire (type -0x68, D:L475370-475378) asks no count and its entry is never marked, so it neither
counts nor is limited; it is on no multiplayer kit (research 94). **C4**: its fire (-0x69, D:L475379-475475) asks no
count, and its entry is not marked. **The PMN** is limited by the claymores down and never counts itself: a kit with
only PMNs and C4 has no limit but its pouch.

### 8.3 The port against it, room and page apart

**The room** (`packages/match/src/room.ts`):

- `chargesDown(p)` (room.ts:4114-4116): `this.flying` entries owned by the player object, with a `facing`, at rest,
  and not the backblast -- every charge set down: the claymore, the PMN **and C4** (all three are laid by `placeCharge`
  with a facing, room.ts:4165). Its only use is `placeCharge`'s refusal (room.ts:4156:
  `chargesDown(p) >= CLAYMORE_RULES.maxPlaced` -> `dropped('throw', 'charges down')`), on the non-C4 branch -- the
  claymore and the PMN (C4 takes the first branch, room.ts:4143-4154, and is never refused by the count, as in the
  original).
- The wading refusal comes **before** the count (room.ts:4155, then :4156).
- `detonate` (room.ts:4177-4192) asks no count (the kit must carry a claymore) and sets off claymores only: as
  `FUN_005c0130`. The room has no slot selection, so the Detonator's gate is the page's alone.
- The judgment is at the set-down (the page's `throw` at the placing's end), the original's at the press; since the
  owner's claymore count cannot rise during the placing (one placing at a time) and can only fall (a claymore set off),
  the room is never stricter than the original for the same placing (the same argument as research 312 §10.4).

**The page** (`packages/viewer/src/grenade.ts`):

- `placedCount()` (grenade.ts:718): `this.live` entries with a `facing`, not `remote`, at rest -- the SEAL's claymores,
  PMNs **and C4**. Its uses:
  - `startPlacing` (grenade.ts:1202-1208): the claymore's and the PMN's fire refused with the message once
    `placedCount() >= CLAYMORE_RULES.maxPlaced` (before the wading test, grenade.ts:1210 -- the original's order);
  - `gate(item)` (grenade.ts:710-713) passes it to `slotSelectable` as `chargesDown` (`./equipment` equipment.ts:60,
    used only for the Detonator, equipment.ts:90: `chargesDown > 0`);
  - `available('Detonator')` (grenade.ts:902), and through it `takeable('detonator')` (grenade.ts:888-889, the R2
    inventory's question, `matchThrow.ts:346`) and `select('Detonator')` (grenade.ts:878);
  - `takeDetonator` (grenade.ts:912);
  - the instrument `stats().placed` (grenade.ts:1105).
- `detonateCharges` (grenade.ts:1269-1285) sets off claymores only: as `FUN_005c0130`.
- The press: the page's trigger (`matchThrow.ts:482`, `if (down) grenade.pull()`) asks `startPlacing` once per press
  (grenade.ts:980); the message is posted when none is showing (grenade.ts:1203), for `refuseSeconds` (2).

**The differences:**

| # | where | the port | the original | effect |
|---|---|---|---|---|
| D1 | room `chargesDown` (room.ts:4114), used at :4156 | counts the owner's claymores, PMNs and C4 at rest | `FUN_003cc1f0`: claymores only (`+0xc5`, D:L474101) | a claymore or a PMN refused (`charges down`) with four charges of any kind down -- e.g. two C4 and two PMNs -- that the original sets down |
| D2 | page `placedCount` (grenade.ts:718) in `startPlacing` (grenade.ts:1202) | the same count | the same | the same refusal on the page, **with the message** the original does not post |
| D3 | page `placedCount` in the Detonator's gate (`gate` -> `slotSelectable` equipment.ts:90, `available` grenade.ts:902, `takeable('detonator')`, `takeDetonator` grenade.ts:912) | the Detonator can be taken up with only a PMN or C4 down | `FUN_005bdc30` D:L474637-474641: only with a claymore down | the Detonator up (and the inventory offering it) where the original refuses it; its fire then sets off nothing |
| D4 | room `placeCharge` (room.ts:4155-4156) | wading tested before the count | the count before the water (D:L475307-475320) | only the refusal's tallied reason when both hold (`wading` for `charges down`); the page's order is already the original's |
| D5 | page, the held trigger (`matchThrow.ts:482`, grenade.ts:980, :1203) | asked once per press; the message once per press | re-asked every frame while held (`+0x818` not raised, §8.2): the message re-posted every 2 s, and the placing started if the count falls while held | the message's repeats under a held trigger; a placing the original starts without a new press |
| D6 | the comments | room.ts:4108-4113 and grenade.ts:717 ("its claymores, PMNs and C4"), equipment.ts:22 ("one of the SEAL's charges"), research 85 §9.7.1 ("the SEAL's charges down"), research 94 §C5.3 ("four charges of the SEAL's down") | claymores | the source of D1-D3; corrected with the build |

`CLAYMORE_RULES.maxPlaced` (4), `maxPlacedMessage` and `refuseSeconds` (2) are the original's and stay; the C4 branch's
exemption, the binoculars' gate (the page's trigger, `fireRefused`), the Detonator's fire and its 500 units are
already as read.

### 8.4 The build list

One command, room AND page; tests first, each RED on today's tree and GREEN after. Room `room.ts` and page `grenade.ts`
are hot files (HANDOFF §3; the plan sequences PAR-96 after PAR-93), and NET-CAP's unmerged hunks sit in the same two
functions (`placeCharge`, `startPlacing`; §8.6): the build rebases on NET-CAP if it lands first.

| # | what to change | room | page | test (RED first) |
|---|---|---|---|---|
| B1 | **The rule in one place**: the count's mark as a shared predicate beside `CLAYMORE_RULES` in `@s2u/scene` `projectile.ts` -- the record counts toward the four when its id is the claymore's (153), citing `FUN_003cc1f0` D:L321206-321210 and the mark D:L474101; `maxPlaced`'s comment names the mark | imports it | imports it | `packages/scene/test`: the claymore counts; C4 (151), the satchel (152), MPBOMB (154), the PMN (158) do not (RED: the predicate does not exist) |
| B2 | **The room counts claymores** (D1): `chargesDown` -> `claymoresDown(p)`: the owner's entries at rest whose record is the claymore; its comment corrected. *The review's F1*: "at rest" stands for the count's third test (the node's `+0x5c` bit 0, D:L321209), whose clearer is not traced (U1) -- so the build carries it in code as `CLAYMORE_COUNT_LIVE_READING` (`'at rest'`), beside B1's predicate in `@s2u/scene`, which both `claymoresDown`s read; its §7 row turns from *note only* to the code's at the landing. The comments naming `chargesDown` at room.ts:594 and :1905 follow the rename | `room.ts:4114`, :4156; :594, :1905 (comments) | -- | `packages/match/test/roomEquipment.test.ts`: two C4 and two PMNs down, a claymore set down -- accepted (RED: `charges down`); three claymores and one PMN down, a claymore -- accepted (RED); controls, GREEN before and after: four claymores down, a PMN refused (`charges down`); four claymores down, C4 planted |
| B3 | **The room's order** (D4): the count before the water | `room.ts:4155-4156` swapped | -- | the same file: four claymores down and wading deeper than `maxWaterDepth`, a claymore -- tallied `charges down` (RED: `wading`) |
| B4 | **The page counts claymores** (D2, D3): `placedCount` -> `claymoresDown()`, the SEAL's own claymores at rest, for all its uses: `startPlacing`'s refusal, the Detonator's gate (`gate`, `available`, `takeable('detonator')`, `takeDetonator`), and `stats().placed` (the instrument; renamed or documented as claymores); `SlotContext.chargesDown` -> `claymoresDown` (equipment.ts:60, :90) and its comment (equipment.ts:22). *The review's F1*: the page's `claymoresDown()` reads the same `CLAYMORE_COUNT_LIVE_READING` (B2), not a bare `state === 'rest'`. *The review's F3*: the rename reaches every literal caller -- `matchThrow.ts:349`, `:351`, `rocket.ts:151` (each `chargesDown: 0`), `equipment.test.ts:23-24`, `:50`, `:188` -- and turns `matchMount.test.ts:674` red, which pins `matchThrow.ts:351`'s `chargesDown: 0` by regex (its pattern follows the rename). `stats().placed` is **kept and documented** as the SEAL's claymores down, not renamed: four e2e specs read it (`grenade.spec.ts:286`, `remoteCombat.spec.ts:450`, `:525`, `replayEngine.spec.ts:388`), each over a claymore, so the count's change leaves them as they are | -- | `grenade.ts:712`, :718, :902, :912, :1105, :1202; `equipment.ts`; the callers named | `packages/viewer/test/grenade.test.ts`: four PMNs (or two C4 and two PMNs) of the SEAL's down, a claymore placed, no message (RED: refused with the message); one PMN down and no claymore -- `select('Detonator')` false and `takeable('detonator')` null (RED: true / 'Detonator'); controls: four claymores down, a PMN refused with the message; four claymores down, C4 planted. `equipment.test.ts`: the Detonator row under the renamed field; `matchMount.test.ts:674`'s pattern under it |
| B5 | **Room and page on the same command** | the room's judge | the page's prediction | a bridged case (as `roomNetCap.test.ts`'s bridged block): the same kit and the same placings through the page and the room -- a claymore with four non-claymores down taken by both; a PMN with four claymores down refused by both (RED: both refuse the first) |
| B6 | **The held trigger** (D5), or its name: either the page re-asks the claymore's and the PMN's fire every update while the trigger is held and the hand is `ready` (the message re-posted when its 2 s are out; the placing started when the count falls), or `CLAYMORE_HELD_TRIGGER_READING` (§8.5, U2) names the once-per-press model. *The review's F4*: the re-ask is not the count's alone -- the binoculars' test (D:L475305) and the water's bare return (D:L475318-475320) leave `+0x818` unraised as well, so a held trigger re-asks them too: held while stepping out of water deeper than `maxWaterDepth`, the original starts the placing with no new press. Ported, the re-ask re-runs the **whole** fire every update (the binoculars, the count, the water, in that order), not the count alone | -- (the room judges a set-down, not a press) | `grenade.ts` `pull`/`update`, `matchThrow.ts` `trigger` | `grenade.test.ts`: four claymores down, the trigger held 4.5 s -- the refusal posted three times (0, 2, 4 s) (RED: once); a fifth claymore's placing starts while held once one of the four is set off (RED); wading deeper than `maxWaterDepth` with the trigger held, then the feet out of the water -- the placing starts while held (RED: not started) |
| B7 | **The notes** (D6): research 85 §9.7.1's "the SEAL's charges down" and research 94 §C5.3's "four charges of the SEAL's down" corrected to "the SEAL's claymores", with history kept; the code comments with B2 and B4. *The review's F3*: also research 95's two rows that name `chargesDown` as `FUN_003cc1f0`'s count (`95-the-armory.md:1123`, `TAKEOVER_ROW_READING`; `:1125`, `DEPARTED_CHARGES_READING`) and research 231:124 (`placedCount` as the Detonator's gate) -- each to the renamed count and "claymores", history kept | -- | -- | -- |

B1-B5 and B7 are the row; B6 can be split to its own row if the seat prefers (it touches the trigger's path, not the
count). *Built 2026-10-16 (PAR-96, `agent/par96`; reading, pending review):* B1 (`countsTowardClaymoreLimit`,
`CLAYMORE_COUNT_LIVE_READING`), B2, B3 (room), B4 (page; the tail `efdfa2ea2` renamed `SlotContext.chargesDown` to
`claymoresDown` through `./equipment`, `./matchThrow` and `./rocket` and their tests), B5 (the bridged block in
`roomEquipment.test.ts`), B6 by its name (`CLAYMORE_HELD_TRIGGER_READING`, §7), B7 (research 85 and 94; the tail: research 95's
two rows and 231:124). *(Was, before the tail: "`SlotContext.chargesDown` kept by its name ... owed" and "research 95's
two rows and 231:124 are outside the build's files, owed"; PAR-96's review, F1.)* The build carries `CLAYMORE_COUNT_LIVE_READING` in code (B2, B4; §7's row), and `CLAYMORE_HELD_TRIGGER_READING`
too if B6 takes the name. *(Corrected by the review's F1, 2026-10-14; the first text read: "Nothing here adds a
placeholder to code unless B6 takes the name." -- which left U1's unknown unnamed in the code that stands for it.)*

### 8.5 Unknowns -- candidate names and what settles each

Each is a note-only candidate until code carries it (the ledger's rule).

| # | candidate | value the port would carry | stands for | settles |
|---|---|---|---|---|
| U1 | `CLAYMORE_COUNT_LIVE_READING` (carried in code by B2 and B4; §7's row) | `'at rest'`: a claymore counts from its set-down until it is removed (the port's `state === 'rest'`) | the count's third test, the charge's node `+0x5c` bit 0 (D:L321209): believed set at the set-down through the node's vtable `+0x38` (D:L474030), the slot of `PTR_PTR_004067b0` not resolved (§8.1, F2); what clears it while the charge is listed -- a claymore set off, or hidden, before its entry leaves the list at the manager's frame walk (`FUN_003cc770` D:L321411-321426) -- is not traced | reading the node's vtable `+0x38` for a charge's node and every caller passing 0; or a capture: four claymores down, one set off by another's blast, a fifth placed in the next frames (taken or refused) |
| U2 | `CLAYMORE_HELD_TRIGGER_READING` (only if B6 does not port the re-ask) | `'per press'` | the original's every-frame re-ask of the whole fire -- the binoculars, the count, the water -- while the trigger is held (§8.2: `+0x818` not raised; `+0x118` 1 or 2; B6, F4) | a capture: four down, the trigger held 5 s -- the message posted three times or once; held in deep water while stepping out -- placed or not; the controller's `+0x118` frame by frame (research 305's owed read of its writer) |
| -- | `DEPARTED_CHARGES_READING`, `TAKEOVER_ROW_READING` (research 95, open; unchanged) | -- | the count's owner key across a leave and a takeover | as listed there; B2 narrows what they count to claymores, nothing else |

Read, not unknown: the limit (4, D:L475308, D:L475340), the mark (D:L474101), the per-owner key (D:L321208), the
message and its 2 s (D:L475330-475336), the offline and online sameness (no `DAT_0045a0c1` test in D:L475304-475369 or
D:L321194-321216).

### 8.6 The overlap with NET-CAP (research 312 §10)

NET-CAP is the online five-projectile cap: `FUN_005c0ae0` (D:L476470-476491) refuses the use of the hand's item of
the four classes (grenade 0x79, explosive 0x97, launcher round 0xab, rocket 0xb9) while `FUN_003cb8f0`
(D:L320898-320952) counts more than five of the owner's live projectiles -- the placed list's entries of those classes
**and** the pool's in flight (research 312 §10.1-§10.2; the empty pool's -1, `NET_CAP_EMPTY_POOL_READING`).

- **A claymore counts in both.** Set down, it is a placed-list entry of class 0x97 (item 153 is in 151-170) owned by
  the SEAL -- one of `FUN_003cb8f0`'s list entries -- and its `+0xc5` is up, so `FUN_003cc1f0` counts it too. The PMN
  and C4 set down count in NET-CAP's and **not** in the four; grenades, launched rounds and rockets in flight count in
  NET-CAP's only.
- **The order.** `FUN_005c0ae0` answers before `FUN_005be9a0` runs (`FUN_005c0fd0` D:L476569, D:L476637-476638), so
  online the cap is asked first and silently: with more than five live (four claymores and two PMNs down, and anything
  in the air) a claymore's press is refused by the cap with no message, before the four's message could be posted.
  Offline, or with the pool empty, only the four applies. C4's plant asks neither (research 312 §10.1, F1; §8.2 here).
- **In the port.** NET-CAP's own build (on `agent/online-netcap`) already orders them so: the room's `placeCharge`
  asks `netCapRefused` before the wading and `chargesDown` (that branch's room.ts:4164, then :4178-4179), and the
  page's `startPlacing` asks `netCapRefused` before the `placedCount` refusal (that branch's grenade.ts:1213, then
  :1215). PAR-96 changes only the second count (claymores only) and the room's wading/count order (B3), and keeps
  NET-CAP's test first. The two counts stay separate: NET-CAP's `netCapLive` counts every charge set down and every
  projectile in flight; `claymoresDown` counts claymores set down. Neither rule's count is the other's.
