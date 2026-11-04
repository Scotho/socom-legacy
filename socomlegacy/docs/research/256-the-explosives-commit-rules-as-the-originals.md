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
| R256.5 | **The release request asks a stance-specific segment of the world before the commit; the lean asks none** (D12) | the exact segment and the predicate written; the query's class `THROW_CLEARANCE_QUERY_PLACEHOLDER` | §5 |
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
so are §5's `THROW_CLEARANCE_ENDS` (the words of D:L414004-414047).

| name | listed at | what it stands for | settles |
|---|---|---|---|
| `THROW_CLEARANCE_QUERY_PLACEHOLDER` | §5 | `'movement surfaces, every gated owner'`: the clearance's world query (`FUN_0031e250(world, a, b, 1)`) asked of the surfaces with bit 1 set and bit 18 clear on every owner the model gate passes; `DAT_0044d758` read 0 at the call (LATER 247, §5: the surface half as asked), the hull test one-sided (front entries; the port two-sided, LATER 250); the owners `+0xa1` mask 4 (bit 2) skips and the record's `+0x3c` are not read | the source reading of §6 |
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
