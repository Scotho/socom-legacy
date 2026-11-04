# 230 -- The gameplay feel parity audit: the action stack, explosives, movement, input timing and root motion (slices 1-5)

- Date: 2026-10-08. Scope: consolidation of five bounded audits; no implementation changes or new owner rulings.
- Status throughout: **reading, pending review**. The original predicates and assets were read, and port component
  probes executed. No original-game capture, browser playtest or physical-controller timing was performed. A reviewer
  who did not author this note must re-read the cited original before adopting a reading. Expected failures document
  missing contracts; their green Vitest status is not a claim that the port matches the original.
- Consolidation base: `eb243aaddb0a9ab471c0b3fe2c611d721cb2d36f`. Slice 1 originally used
  `f21035e70ecf9910be4d3347ad857cb8fa6f24b9`; slice 2 used `7ccf06a2e18576a327b91b0dc4baea20fa4c1d85`;
  slices 3-5 used the consolidation base. The included probes rerun the selected contracts on the consolidation base.
  Historical observations below retain their stated pin and evidence kind; later fixes need their own verification.
- Desktop reference: `desktop@be5578311ff2dd33a814d39e7d6d4f2255da4da3`. `D:L<n>` names the local reference
  `game/analysis/socom2_game.elf.decomp.c`, r0001. This ignored source is pinned separately by SHA256
  `B9E863762F08D55602C4310C9491286879CFCF2947683E723BC2905E1AAA42D4`; the desktop Git commit does not pin its bytes.
  The inspected `game/overlays/socom2_game.elf` SHA256 is
  `06B83684719A78AD0580F236BD0EDDD40453F87D9C30C0D39021331915798872` (4,835,072 bytes).
- Disc inputs: `RUN/READERC.ZAR` SHA256 `1B7DF1C9732D4D9BE0C9CE49DE342CD9B552F0D41269DC486BE0075E62DB9123`;
  `RUN/MOTION_P.ZAR` SHA256 `805B1180375469ADF51B90B6E1AFCB1A2B3FACDFF88BDC094CC4A7F328588477`.
  Tests use the existing fixture reader and skip explicitly without these inputs. No decompiled text is reproduced.
- Port citations below are relative to `socomlegacy/`; `V:` means `packages/viewer/src/`, `S:` means
  `packages/server/src/`. Line references describe the named audit pin. This is evidence for gameplay ownership,
  not authority to change another lane's files, a gameplay preference, or a claim about every named historical exploit.

## 1. The action stack, reload and weapon swap

Confidence for the predicates, clocks and source/port comparisons in this section: **reading, pending review**.
The missing shared body-action state is the main issue. A full-body one-shot, an upper-body overlay, inventory
commit, visual pose and input lock have different owners; replacing one must not silently leave incompatible others.

### 1.1 Transitions and commit points

| State and request | Original rule and citation | Port and assessment |
| --- | --- | --- |
| Eligible reload start | `FUN_005c2a90` selects the magazine only after `FUN_005a82e0` accepts the clip, D:L477479-477483. A press can first schedule a delay, `FUN_005c32b0` D:L477655-477678. | `V:fire.ts:954-962` changes the ring at accepted start. Core commit order agrees; complete original capability gating is broader than a timer. |
| Still standing reload, then move/turn | Strict phase/axis interruption; rifle/pistol carry their reached phase into moving overlay, D:L462821-462919, `FUN_00550ef0` D:L418176-418225. | `V:weaponPose.ts:202-227`, `reloadLock.ts`, `reloadClip.ts` implement carry. Magazine remains selected. No separate sprint-cancel event established. |
| Crouched reload, then move/turn | Strict phase > .35, then rifle/pistol overlay carry; positive weapon ReloadTime scales still period, D:L462935-462940, D:L445549-445564. | `V:mover.ts:1231-1258` uses the effective period. Existing slowed-M60E3 tests cover this case. |
| Prone reload, then move/turn | Strict phase > .5; no prone carry case in D:L418205-418225. Already selected magazine remains; reload-family gate can cease. | Carry excludes prone. `V:fire.ts:982-1002` shortens the cut lock with a command margin. Earliest original shot remains unmeasured. |
| Reload started moving | Speed squared >400 selects overlay initially; slowing does not restart a still clip, D:L462821-462919, D:L446083-446086. | `V:weaponPose.ts:236-250` selects once. Natural lock lifetime still differs below. |
| Reload, then trigger/shoulder/R2 take | `FUN_005a7ab0` scans reload entries and moving overlays, D:L462512-462560; `FUN_005a8cb0` gates swap, D:L463148-463189. | `V:matchFirearm.ts:347,367,389` refuses while reloading. Ordinary slot choice is not a force-finish or refund. |
| Still reload or full-body swap, then stance | `FUN_00552ec0` first needs loop flag 0x40 or types 0x11/0x13/0x19, D:L418927-418930; `FUN_00588080` D:L445716-445734. | `V:mover.ts:1143-1157` writes stance before checking action and omits hold from that gate. Crouch reload -> stand and standing swap -> prone reproduce. |
| Still reload, then jump | `FUN_0057e1b0` needs loop flag 0x40, D:L440805-440810. | `V:walk.ts:634` supplies crouch/prone reload holds, not the still standing reload; `V:mover.ts:1636-1639` sees no such body owner. Slice-1 integration probe accepted a jump while Fire remained reloading. |
| Moving reload, then dive | Overlay alone is not a nonlooped top. Dive has swap, speed, water and attachment gates, `FUN_00584b00` D:L443975-444016. | Do not repair the still-body gate by banning every reload overlay. Complete overlay survival/blending under dive still needs capture. |
| Accepted flinch, knock or death | Flinch can replace a still one-shot, except swap, D:L460005-460025; knock completes swap then pops, `FUN_0057e770` D:L440992-440998; death cleans then pushes state 8, `FUN_005a2490` D:L459780-459805 (the pop at D:L459803, the state-8 push on the line after, D:L459804 -- corrected 2026-10-12, §5.2 item 3). | `V:mover.ts:1603-1604` clears holds/overlay, while Fire/WeaponPose clocks remain separate. Knock was executed; flinch/death pose aftermath is source-only. Accepted earlier magazine commit must not be journal-undone. |
| Rifle/pistol swap start | Kit slot changes at D:L478842. `FUN_005a64c0` selects by stance/speed, D:L461923-461991. Item change and intermediate mount callback are distinct. | `V:kit.ts:151-166,212-220` preserves forward/reverse item asymmetry. Do not move inventory commit to visual handoff. |
| Still standing swap, then move/turn | Type 0x35 is a special cut that carries phase into moving swap, `FUN_00550ef0` D:L418180-418185, D:L418227 onward. | `V:mover.ts:1429` handles the exception. Crouch/prone swaps do not share it. No new carry defect established. |
| Moving swap, then dive | `FUN_00584b00` refuses `FUN_005a7980(actor,1)`, D:L443995-444001, including moving swap overlay D:L462471-462506. | `V:traversal.ts:1022` tests action but not overlay. At speed 45 the port dives with moving swap still active. No-swap dive control succeeds. |
| Blocked stance request | Pending actor +0x374 survives the outer animation refusal and is rechecked by `FUN_00552d60`, D:L418874-418908. Some spatial refusals clear it. | An immediate refusal alone would lose legitimate later stance intent. Section 4 distinguishes this from a universal action queue. |

### 1.2 Clock and callback units

Let `P` be effective playback, `n` key count and `e=(n-1)/n`. One-shot phase is `t/(P*e)`, capped at `e`;
continuous last-key time is `P*e*e`. Moving overlay last-key time is `P*e`. These follow D:L133345-133366 and
`FUN_0028c4f0` D:L134223-134307. NoInterrupt is strict phase greater-than, with an axis/turn magnitude >.1
(D:L445553-445564). Half-step end prediction and original scheduling prevent treating these as observed retail frames.

| Reload clip family | Keys | P seconds | NoInterrupt | Last-key model seconds | Disc key (selector `V:reloadClip.ts:37,42`) |
| --- | ---: | ---: | ---: | ---: | --- |
| Rifle stand | 45 | 1.6 | absent/0 | 1.529679 | `seal_reload` |
| Rifle crouch | 28 | 1.9 | .35 | 1.766709 | `seal_crouch_reload` |
| Rifle prone | 30 | 1.7 | .5 | 1.588556 | `seal_prone_reload` |
| Pistol stand | 26 | 1.8 | absent/0 | 1.664201 | `seal_p_reload` |
| Pistol crouch | 29 | 1.7 | .35 | 1.584780 | `seal_p_crouch_reload` |
| Pistol prone | 31 | 1.7 | .5 | 1.592092 | `seal_p_prone_reload` |
| Moving rifle | 33 | 1.2 | overlay | 1.163636 | `seal_mv_reload` |
| Moving pistol | 21 | 1.2 | overlay | 1.142857 | `seal_p_mv_reload` |

Each named key gives the row's frame count in `MOTION_P.ZAR` and playback/NoInterrupt in
`READERC.ZAR/motion.rdr`; the last column's selector names resolve the assets, while the clock calculation is
`FUN_0028c4f0` D:L134223-134307 above. These are nominal periods without a weapon override.
Body snapshot/overlay fades of .4 seconds have existing
disc/source support (research 150); matching that duration does not prove silhouette, muzzle, root or blend order.

### 1.3 Ranked deltas

1. **High:** missing effective full-body action gate. Stance changes too early; still standing reload can overlap
   jump. Preserve pending stance and distinguish overlay from full-body ownership. Two direct gate probes are in
   `packages/viewer/test/parity/actionStack.test.ts`; standing-reload/jump remains the prior integration finding,
   not a newly hand-wired expected failure that omits the real WalkMode coordinator.
2. **High:** missing moving-swap dive exclusion. Same file pins the overlay case with a no-swap positive control.
3. **Medium-high:** action replacement leaves accepted reload lock/pose on independent clocks. Knock observation
   is executable; full flinch/death rendering and earliest fire after the replacement's own NoFire need capture.
   `V:fire.ts:982-1002`, `weaponPose.ts:202-227`, `play.ts:383-391`, `netPage.ts:1283-1291`, `S:room.ts:3196` (at slice 1's pin f21035e70; `layKnock` is `S:room.ts:3216` at the consolidation base eb243aadd).
4. **Medium:** swap mount callback compares normalized duration rather than source phase. `V:kit.ts:177-186` and
   `mover.ts:1315-1316` versus `FUN_0028c7c0` D:L134325-134350 / D:L438995-439009; triggers .72/.82/.62 at
   D:L446367-446396. Forward stand/crouch/prone handoffs occur at phases .703812/.801515/.608609. On the same
   60-Hz model schedule, current ticks 54/46/64 precede source-threshold ticks 56/48/66. Three expected failures
   pin source-phase thresholds. Reverse and overlay conversions need review together; no guessed delay is prescribed.
5. **Small-medium, already known:** natural reload lock outlives last key (research 150 section 5; research 218).
   Historical pose-before-Fire harness: rifle stand is free 50 ms after last key; moving one command later.
   These are sampled port times, distinct from continuous `P-life`, and from the deliberate axis-cut margin.

H77's shotgun/pump/M203 stand-in holds remain owner-held. Keyboard stance and number-key equipment adaptations are
not reopened. No named historical ninja jump, wall slide or universal animation-cancel mechanism is established here.

## 2. Explosives: wind-up, release and interruption

Confidence for this section: **reading, pending review**. Inventory timer, animation callback, hold and visual pose
are not interchangeable. A released projectile must not be refunded just because its body animation ends.

### 2.1 Transition and commit table

| State and transition | Original reading | Port and assessment |
| --- | --- | --- |
| Equipment take-up | `FUN_005a8cb0` body gates, D:L463148-463189; kit gate D:L478941-478955. Successful shoulder selection clears hold/power, D:L478905-478915. Take-up fades .3 s, D:L461888-461920. | `V:matchThrow.ts:301-310,380-397`, `matchFirearm.ts:347,389-393`, `grenade.ts:788-807` block selection throughout holding/throwing. The exact take-up fade was not separately measured. |
| Trigger pressure held | Controller power chases pressure at rise 3/s, fall 1.5/s; release at pressure <= power*.15, `FUN_00594cf0` D:L453478-453538. No throw one-shot yet. | `V:grenade.ts:893-910,939-942` models power; browser menu cancel exists. Original eligible shoulder cancellation is blocked. Do not freeze the body during the whole wind-up. |
| Release request | `FUN_005be9a0` needs clearance and power >=.15 before pushing/arming, D:L475490-475511; threshold constructor D:L171500-171513. `FUN_005499e0` checks stance-specific segment, D:L413977-414063. | `V:grenade.ts:1165-1180` selects/remaps correct clip, but lacks minimum power and clearance. Lean has its own original early return; do not generalize wall refusal to all lean throws. |
| Accepted throw before release | Nonlooped body refuses ordinary stance/jump, D:L418927-418930, D:L440805-440810. Normal move cut needs phase > NoInterrupt, D:L445549-445564. | `V:mover.ts:1231-1258` supplies hold/jump restraint, but `changeStance` changes posture during it. Jump control agrees. No new reachable grenade-dive exploit is claimed from an omitted check alone. |
| Hand opens | Timer commits ammo, D:L477024-477042; current hand D:L477060-477067, current stance/range D:L477069-477075 and current elevation D:L477100-477111. | `V:grenade.ts:1184-1213` spends at release; hand/yaw current, but Pending freezes elevation/stance earlier. Changing pitch 0 ->45 before hand-open still emits aimSin 0. |
| Post-release movement cut | Valid cut pops one-shot; already-spent ammo/projectile survives, D:L418180-418190, D:L445549-445564. | At .8 s mover hold has ended and one grenade exists; `V:throwPose.ts:83-114` and `grenade.ts:945-958` keep independent full-weight pose/busy tail. |
| Claymore/PMN | Four-object and water <=3.2 gates; placing timer 1.3 s, D:L475306-475360; floor/create must succeed before spend, `FUN_005bc730` D:L473987-474129, D:L477001-477020. | `V:grenade.ts:1065-1086,1096-1121` has those gates. Only claymore takes detonator. A forced animation pop alone does not establish cancellation of this separate timer. |
| C4 accepted | Put on wall has phase-.45 callback, initial kit timer 99 s, D:L475379-475452. `FUN_005bfe40`, instruction 0x5bfe48, writes zero through timer pointer. | `V:grenade.ts:1082-1086,945-951` independently schedules ordinary 1.098214 s. Knock at .1 s removes hold but port still places/spends by 1.2 s. |
| C4 forced pop | Knock D:L440992-440998 -> action removal D:L446515 -> `FUN_0028da00` D:L135092-135104 removes callback without eager phase invocation. Commit rechecks target/material, D:L476904-476999. | The removed callback cannot cause the normal uncut deadline. Permanent original cancellation/refund is NOT established: another cleanup must settle the remaining 99-s timer. Surface-placement fix is a separate lane. |
| Detonator | `FUN_005c0130` triggers owned remote-capable charges within 500 units then requests Claymore, D:L476020-476032. No throw one-shot. | `V:grenade.ts:1130-1145` owner/range checks exist. Empty-ammo fallback remains an existing reading, not newly verified here. |
| Flinch, knock, death | Body action can be replaced; ordinary grenade/claymore kit timers and C4 callback ownership differ. | `V:mover.ts:1601-1618` clears hold, visual/timer paths can persist. No universal original refund, dropped-grenade or same-tick ordering rule is claimed. |

### 2.2 Timing and ranked deltas

Release time is `fraction*P*(n-1)/n` (`FUN_005802b0` D:L441882-441906); natural one-shot end is
`P*((n-1)/n)^2`. `FUN_0057fce0` supplies the fraction; `READERC.ZAR/motion.rdr` supplies playback/NoInterrupt,
and `MOTION_P.ZAR` supplies key counts. The source-table column locates each remapped clip in
`packages/scene/src/projectile.ts`; the disc-backed test independently checks key counts and playback.

| Family | Release fraction | Release seconds | NoInterrupt | Source table / timer |
| --- | ---: | ---: | ---: | --- |
| Stand throw, rifle/pistol | .46 | .709714 | .49 | `projectile.ts:502,544` |
| Stand toss, rifle | .69 | 1.067200 | .75 | `projectile.ts:503` |
| Stand toss, pistol | .69 | 1.334000 | .80 | `projectile.ts:545` |
| Crouch still | .70 | .729474 | .80 | `projectile.ts:504` |
| Crouch moving | .46 | .709714 | .49 | `projectile.ts:578` |
| Prone throw | .66 | 1.016889 | .90 | `projectile.ts:505` |
| Prone toss | .56 | .593185 | .90 | `projectile.ts:506` |
| Right lean | .55 | .667857 | .90 | `projectile.ts:507,546` |
| Left lean | .87 | 1.006714 | .90 | `projectile.ts:508,547` |
| Claymore/PMN | separate timer | 1.300000 | .90 | `projectile.ts:518`; D:L475306-475360 |
| C4, uncut | callback .45 | 1.098214 | 1.0 | `projectile.ts:527`; D:L475379-475452 |

Ranked by gameplay effect, with source confidence separate from missing runtime corroboration:

1. **High:** shared body/pose/busy divergence and blocked wind-up slot cancellation. Too-early stance and delayed
   weapon return affect control; shoulder cancellation should clear the pending pressure hold without spending.
2. **High impact, narrower source claim:** removed C4 callback still commits at ordinary deadline. Assert only that
   deadline mismatch. Do not turn the unknown 99-s fallback into a prescribed gameplay policy.
3. **Medium:** sub-threshold taps spend/launch. Zero, one and three 60-Hz updates produce powers 0/.05/.142625;
   four updates exceed .15 and form a positive control. Tick counts describe this model, not retail input latency.
4. **Medium:** launch elevation sampled too early. Clip choice can remain an earlier decision while release
   kinematics read current body state.
5. **Medium, source-only:** missing stance-specific pre-throw clearance. A synthetic exact-segment probe remains
   to be designed; post-launch collision is a different contract and cannot substitute for refused start/spend.

`packages/viewer/test/parity/explosives.test.ts` contains eight expected failures for six discrepancy cases:
three short taps, wind-up selection, late elevation, stance, busy tail and removed C4 callback. Disc metadata and
four-tick/menu-cancel controls execute outside expected-failure bodies. Component event wiring mirrors the audited
throwStart -> hold/pose seam; it does not replace browser coordinator integration testing after a lifecycle repair.

## 3. Movement and collision

Confidence for this section: **reading, pending review**. Synthetic geometry isolates predicates and state updates;
it does not prove prevalence on real maps or identify a historical exploit by name.

### 3.1 Transition table and ranked deltas

| Rank / transition | Original source | Port observation and bounded conclusion |
| --- | --- | --- |
| High: jump entry under low roof | `FUN_0057e1b0` D:L440799-440804 calls `FUN_0057f150` D:L441263-441285: posed head+1 to head+21, actor hidden during query; a hit whose surface class field equals 1 also counts as clear (the review's reading, D:L441263-441285), so a repair must carry that exception. Actor +0x308 is head, D:L419620-419621. | `V:mover.ts:1636-1651`, `net/moverSim.ts:137-142` omit this query. Roof y=25 blocks synthetic ray [18.394,38.394], yet speeds 0 and 40 both jump. Roof y=50 is clear control. Head input 17.394 is a documented port idle pose, not a fresh original capture. |
| High: airborne contact then wall end | `FUN_005483d0` D:L413588-413593 removes inward carry; ELF 0x548ae0-0x548b40 verifies the decompiler's lost scalar. `FUN_0054d9a0` D:L416524-416530 consumes corrected carry. | `V:mover.ts:2199-2200,2212-2213` projects current velocity only; `fall():2028` restores unchanged carry next tick. After (40,30) hits x=4, vx=0; disabling wall brings vx=40 back. Inward carry should remain removed. |
| Medium: rest on steep ground | `FUN_0054f330` D:L417220-417245 checks normal/max slope and height span >=4 (prone bypasses span minimum). `FUN_0054edf0` D:L417108-417160 accumulates descent by `(1-normal.y)*gravity*dt`; D:L417195-417198 pushes Slide after threshold. | `V:mover.ts:2134-2162` refuses uphill steps but has no original slide state; `traversal.ts:777-786` scales input only. On 55 degrees standing stays still; prone solid-plane push-out repeats 30.581323 per half-second with no velocity/action; ground-only prone stays still. This is not accelerating slide. |
| Medium: overhead owner deactivated | `FUN_0057efe0` D:L441217-441239 queries through model traversal; `FUN_002d3030` D:L175073-175074 requires active and hasDI. | `V:mover.ts:1968-1974` headroom scans without modelGate. Ceiling y=15 blocks stand; after active clears, segmentHit is clear but headroom still refuses. Map prevalence is unmeasured. Repaired 2026-10-11 (PAR-21 D16, §3.4; the headroom's own gate is `FUN_002d2890` D:L174789-174790). |
| Existing section-1 root: standing Jump -> prone | `FUN_00552ec0` D:L418927-418930 excludes this nonlooped motion; exception types D:L445724-445732 do not include Jump. | `V:mover.ts:1147-1149` changes stance; jumpControl treats non-crouch as standing, :1897-1911. MoverSim jump, next-command prone, twelve forward commands retains jump and speed 65 in prone. Do not count as a new action-stack defect or established ninja jump. |

`packages/viewer/test/parity/movement.test.ts` pins eight expected failures: two roof speeds, persistent carry,
standing slide, accelerating prone slide, ground-only prone slide, inactive headroom, and jump stance
(2026-10-11: inactive headroom is a plain test since PAR-21 D16, §3.4). Setup and
clear-roof/49-degree/active-owner/contact controls fail normally outside `it.fails`.

### 3.2 Boundaries that did not become new findings

- Standing/running jump split is speed squared >=225 (D:L440812-440814), then running launch delay .1, lock .4;
  source integrates velocity before position, `FUN_0059b440` D:L456496-456498. Local/world velocity distinction
  alone does not demonstrate a reachable new defect; ordinary yaw preserves magnitude.
- Floor selection takes highest within window, else lowest; rejects >20 above feet, `FUN_005b5d40`
  D:L470232-470274. Port fixed origin, substeps, axis fallback and posed geometry remain approximation boundaries;
  original `FUN_005b0840` D:L467215-467256 uses current pose/body transform. No new stair/ledge bound is asserted.
- Fall class thresholds match `FUN_005ac1f0` D:L464890-464906; original damage uses part maxima without armour,
  D:L464943-464950. `S:room.ts:1989-1992,2050-2062` consumes landing and applies damage. Contact errors may change
  the input, but a missing fall-damage hook was not established.
- Historical baseline `jump.parity.test.ts` (13) and `walkSpeed.parity.test.ts` (9) passed in slice 3. That is port
  regression evidence, not fresh original measurement. They were not expanded into another full-suite run here.

### 3.3 The crate climb cut by the claymore's place (the owner's "Frostfire box glitch"; added 2026-10-09)

*Reading, pending review* (a research agent's source read of 2026-10-09 for the merge controller; nothing measured
running; the owner's observation is the evidence, not a reproduction; issue #96; the playtest batch's PB-7).

**The owner's sequence** (2026-10-09, relayed on a live call): a claymore selected; X at a crate's climb prompt on
Frostfire; halfway through the climb the place button; in the original the body falls through the crate's hull, steps
forward and ends inside the box; in the port the climb completes and the body ends on top. Distinct from the launch
glitch (section 6), from the MP6 scaffold (issue #80) and from the 142-deck sink (research 90 item 2). The crate he
used is unpinned; research 86 section 3.6 / 90 item 11's test crate (MP2, top 111.85, from x 938 z 845 facing north)
is the candidate.

**The original.** The claymore's place can start mid-climb: the kit's fire handler `FUN_005be9a0` (D:L475213; the
claymore's branch D:L475310-475330) gates only the actor's `+0x200 != 4`, the charges placed (< 4) and a speed test
under a flag bit, then starts "Place claymore" (`FUN_0057d540`) and its 1.3 s timer `+0x87c` whether or not the
action started; its route `FUN_005c0ae0` (D:L476375-476377, D:L476462) passes `phaseTest = 0` for the claymore's
classes (0x79, 0x97; research 85 section 9.7), and `FUN_005a7de0` with that argument skips the clip's `NoFire`
(D:L462687-462692; research 218 section 1.2, `NOFIRE_EQUIPMENT_CLASS_READING`), so the climb clip's `NoFire` holds
rounds, not the claymore; the airborne refusal of class 0x97 is cleared while a climb plays (`FUN_005af930`
D:L466784). The action start stacks, it does not refuse: `FUN_0057d540` (D:L440333-440354) asks `actor+0xe1` bit 4
and the top play's `+0x2b != 8`, and `FUN_00588bc0` (D:L446055) pushes a new play for a motion outside the stance set
(`FUN_0028dc90`, D:L446290) and makes it current (`+0x534`, D:L446294); the climb's play stays underneath (unread:
whether a climb play ever carries `+0x2b == 8`; the owner's observation says the place starts). With the place play
current the climb loses three things: gravity resumes, since `FUN_005af930` suspends it only while the *current*
action is a climb (D:L466754-466787; the fall integrates in `FUN_0059b440`, research 90 section 8); the steer stops,
since it lives on the play (`play+0x78`, D:L439017-439026, `FUN_005b2d20` from the top play's consumer); and the
root motion is the top play's -- the place clip's root carries no travel (`seal_place_claymore`, 55 keys, root z
7.96 -> 7.88 -> 8.20, y 11.17 -> 8.27 -> 10.08, read from `MOTION_P.ZAR` through the repository's `parseMotionClip`)
while the climb's root (z 13.84 -> 2.48, y 11.52 -> 24.39) stops feeding the body. At the midpoint the actor's origin is still IN FRONT of the crate's face (the first reading of 2026-10-09 said
"past the face"; withdrawn the same night, see the addendum below): the fall lands in front, and what puts the
body inside is the climb play resuming afterwards.

**The client.** The trigger reaches the page with no traversal test: `matchThrow.ts:404-416` -> `grenade.ts:893-897`
-> `startPlacing` (:1065-1087: a snapshot, not already placing, four placed, the water depth -- no `busy()`);
`throwStart` -> `matchThrow.ts:184` (`throwPose.start(anim); walk.hold(hold)`); `walk.ts:662-667` `hold` has no
`moves.busy()` test and `mover.ts:1231-1239` `Walker.hold` refuses only `inAir`, which `startClimb` cleared
(`traversal.ts:882`): the hold is **accepted** and the pose layer plays the clip (`throwPose.ts:59-67`). The climb
owns the tick regardless: `mover.ts:1813` (`driver.tick` true ends the walker's tick), `traversal.ts:740` (`advance`
while running), :1084-1089 (the feet from `ClipPath.at`, velocities zeroed, no gravity, nothing reads the hold),
:1101-1104 (`done` -> `endClimb` -> `finish`, :1114-1121 `settle`); the snap-to-top is the path's `to`
(`topFloor(...) ?? c.top`, :935 / :947). The hold's clock and root motion run only in the walker's own tick
(`mover.ts:1246-1249`, :1838-1850), never during the climb; the grenade page's own clock still places the charge at
1.3 s (`grenade.ts:945-952`). Nothing cancels a running move but the ladder's top slide (`traversal.ts:1092-1100`);
the Cross button's action context (`actionContext.ts`) is not involved. `traversal.test.ts:318-336` pins the climb
ending at the ledge height; nothing pins a hold during a climb; `test/parity/movement.test.ts` has no climb case.

**Candidate causes, ranked.** (1) *High*: the climb owns the tick whole and the kit's one-shot cannot displace it,
where the original's top play owns the body -- and the port has no frozen-and-resumed state for a covered move
(`traversal.ts:1084-1104`), where the original's covered climb keeps its phase and resumes when the place play pops. (2) *High, the same root*: gravity is never re-enabled during a move
(`traversal.ts:1088` zeroes `vy`; the original suspends per current action). (3) *Medium, a guard and not the cause*:
the place clip's `NoFire` class skip is not built (research 218); the port happens not to refuse the claymore
either, and a future `NoFire` gate on the kit would need the class skip or it would hide the glitch for the wrong
reason. (4) *Low, after 1-2*: the probe inside the hull -- whether the port finds the 100 floor or snaps to the
111.85 top (research 90 item 2 shows the probe taking a model's first hit).

**The reproducer** (the test room): `?map=MP2&redotcom`, walk mode; `hook.teleport(938, 100, 845, 0)` (`hook.ts:421`);
the claymore selected; W to the CLIMB icon; X; the place button about 0.55-0.6 s after `climbStart` (phase 0.5 of
1.168 s, research 86 section 1.1); observe the feet's y and z per tick, `traversal.state().kind`, `walker.holding`, the
grenade phase and the body's end position -- ours on top (y 111.85, kind none); the original's expected curve: a
fall from mid-rise, the feet inside the hull near 100, a short step forward. The probe that would hold it:
`packages/viewer/test/parity/climbInterrupt.parity.test.ts` (the headless climber world of `traversal.test.ts`, a
`hold('seal_place_claymore')` at the climb's midpoint), in the expected-failure form of `movement.test.ts` until the
capture (section 7). Not read: `FUN_00589aa0` for a play ending under another; `FUN_005b5d40` inside a hull; the
animator's layer choice (`FUN_0028c250`); the room's mover (`net/moverSim.ts`); the exact crate.


**Addendum, 2026-10-09 (the same research agent's follow-up read, after the port experiment on `agent/pb7-probe`;
reading, pending review).** The experiment (the hold taking the body at phase 0.514, gravity on, no snap-to-top) ends
the body on the floor *in front* of the crate, not inside: at that phase the port's feet are 1.8-2.1 in front of the
face. The original's model agrees, and the first reading's midpoint sentence is withdrawn:

1. *The origin against the face and the top, per key* (`seal_climbcrate`'s root keys read through `parseMotionClip`,
   the actor carried by the root's delta from `refPt.z` 8.92 before the face, the feet by the root's rise; the steer
   left out): key 13 (phase 0.45) the origin 2.89 in front, the feet 6.21 under the 11.9 top; key 15 (0.52) 2.72 in
   front, 5.58 under; key 20 (0.69) 1.83 in front, 2.91 under; key 24 (0.83) 0.45 in front, 0.74 under; **key 25
   (0.86) the origin 0.28 past the face**; **key 26 (0.90) the feet 0.11 over the top**; key 29 (1.00) 2.44 past,
   0.98 over. Between keys 9 and 22 the root barely travels ahead (5.2 to 7.3) while it rises. A cut at the midpoint
   followed by a fall lands the body in front in the original's model too.
2. *`FUN_00589aa0` runs on the top play only, and a covered play is frozen, so the climb resumes.* The end handler
   (D:L446500-446597) takes the *current* action, pops the top play (`FUN_0028da00`, D:L446515) and dispatches on it;
   the 0x2a branch (D:L446582-446597) runs only when the climb play is the top at its pop, and it is a vertical
   settle, not a step forward: `FUN_003157d0(x = +0x1c, y = +0x2e4, z = +0x24)` -- the actor at its own x and z, y
   the last feet y recorded while a climb was current (`FUN_005af930` D:L466781; the landing writes it too,
   `FUN_0059ad30` D:L456316-456318) -- then the root's y 11.4. Only the top play advances: `FUN_0057a330` advances the
   top alone (`FUN_0028c4f0` D:L438874 / D:L438901) and feeds its root velocity to the actor (`FUN_0028c250`
   D:L438910); a covered play keeps its phase; the generic pops loop `FUN_00589aa0` down to one play
   (D:L437720-437724, D:L437905-437908, D:L438197-438200). So: the place play on top -- gravity on, no steer, no
   travel -- the body falls from 6.3 up to the floor 2.7 in front of the face; when the place play pops (its end at
   2.6 s, or the stick past `NoInterrupt` 0.9), "Climb crate" is current again at phase about 0.5 *from the floor*:
   gravity suspended again, the steer record (`play+0x78`, unless abandoned past 30, D:L439025) and the root resume,
   and the remaining travel (about 5.2 ahead, 6.6 up) carries the origin about 2.4 past the face at about 6.6 up --
   inside the hull, under the top -- and the 0x2a handler then settles y to `+0x2e4` with the root at 11.4. That is
   the owner's "fall through, a bit of a step forward, inside the box" as a reading of the stack's rules. Unread:
   whether the resumed steer pulls the body back or further; where a finished one-shot's own pop is triggered (the
   one-shot callback `play+0x64`, D:L438996-439005, is the candidate).
3. *`FUN_005b5d40` inside a hull takes the floor below, under the walking window.* D:L470232-470255: a candidate
   surface is one whose y is at most the feet y plus the window; the highest such wins (`iVar14`), else the lowest of
   all (`iVar8`, D:L470258-470260); a result more than 20 above the actor's matrix y is dropped (D:L470272-470274).
   The walking call passes 1.0 (D:L467055); the slide/steep path widens it 1.0 to 10.0 in 0.1 steps through
   `FUN_005b4f30` (D:L417164-417180). With the feet 6.6 up inside a hull whose top is 11.9, the top is outside the
   window and the floor is in it: the original stands on the floor below, and nothing in this function pushes the
   body out (the wall probes of `FUN_0054aa30`, research 217 section 2, were not re-read for a hull interior). The
   port's "stands them on the top at phases 0.7-0.9" is its own probe's window (`STEP_PROBE_LIFT_READING`,
   `floorUnder`), not the original's 1.0.
4. *No fall play is pushed over the place play.* `FUN_005af930` integrates the fall whenever the current action is
   not `DAT_003deca0` (`FUN_0059b440`, D:L466808) but pushes a landing or fall motion only in the block at
   D:L466813-466826, entered when `+0x1044 <= 0`, the airborne bit is clear, `+0xeac` is set, or the current action
   is one of a named set; "Place claymore" is none of them, so root ownership stays with the place play through the
   fall; the landing is `FUN_0059ad30`'s flag write (D:L456316-456322), not a play. Unread: `+0x1044`'s meaning and
   the `DAT_003de*` action ids.

Still unread after this: where a finished one-shot pops; the steer on resumption; `FUN_0054aa30` from a hull
interior; the room's mover. The port experiments: `agent/pb7-probe` 87da63f22 (the hold takes the body; lands in
front) and its follow-up (the covered climb resumed after the hold; the probe's window) are PB-7's evidence of the
port, never of the original.

**The review's re-read, 2026-10-11 (PARITY-2's PB-7 (b1); a fresh reviewer who wrote none of this section; source
inspection of the game ELF's decompilation only -- `FUN_00589aa0` at D:L446479 places the `D:L` in that file; no disc
read, item 1's keys not re-measured, the host under its memory floor). Verdict: NOT SUPPORTED as a whole, medium
confidence.** The building blocks mostly stand, with corrected lines; the addendum's conclusion -- the covered climb
resumes *with its steer* and carries the body inside -- does not, on two routines the section never read.

- *Confirmed:* the end handler takes the current action (D:L446501), pops the top (D:L446515) and runs the 0x2a settle
  (D:L446582-446597); only the top play advances (D:L438702, D:L438874, D:L438901; its root fed at D:L438876 and
  D:L438910); the generic pops loop to one play (D:L437720-437724, D:L437905-437908, D:L438197-438200); a covered play
  keeps its phase (`FUN_0028da00` restores an old phase only when both plays loop, D:L135105-135110; the revealed top
  skips one advance by bit 8, D:L135106-135107, D:L134241, D:L134257); `FUN_005be9a0`'s claymore branch is D:L475305-475328
  (item 0x99, class 0x97 by `FUN_003d1a60` D:L324345, the action's result ignored); `FUN_0057d540` D:L440342-440350;
  `FUN_005c0ae0` passes phaseTest 0 (D:L476375-476378; its `FUN_005a7de0` call is D:L476442, not D:L476462);
  `FUN_005b5d40`'s window (D:L470232-470240, D:L470259-470260; the 20 cut D:L470272-470274; 1.0 from the walk, D:L467055);
  gravity integrates unless the current action is `DAT_003deca0` (D:L466808), and no fall play is pushed during the fall.
- *Corrected:* `FUN_00588bc0` pushes at D:L446292 and writes the current action at D:L446298-446299; before it
  `FUN_00589900` (D:L446072, body D:L446425-446474) can refuse the push -- with a climb current, only for a top whose
  `+0x2b` is 8 (D:L446453) or under `DAT_0045a0c1` with `+0x1061` bit 5 (D:L446439-446440); the climb is pushed with
  `+0x2b` 0 (D:L442242, D:L442245, stored D:L135204), so the owner's sequence does not meet it. `+0x2e4` is not the
  last feet y: D:L466784 copies `+0x404`, the floor-surface record's y that `FUN_005b0420` stores
  (D:L467127-467136). The airborne refusal of class 0x97 is keyed on the current action ids 8, 9, 0xa, 0xb
  (`FUN_005a7de0` D:L462687-462692 through `FUN_00587f50` D:L445646-445659 and `FUN_00587f10` D:L445628-445641), which a
  climb (0x2a) is not -- nothing "clears" it; the phaseTest skip is D:L462695-462696; that function's earlier gates
  (D:L462611-462686) are unread for a climb. The climb play is non-looped (bit 0x40 the loop flag, D:L134261-134271),
  so its steer is `FUN_005b3340` (D:L439018-439020), and the abandon past 30 (D:L439024-439038) is the looped branch's
  only. D:L417164-417180's loop scales the probe point along the slide vector, not the window (no "1.0 to 10.0
  widening"). The fall block's condition is D:L466816-466828, with a grounded disjunct (`+0x105e` bit 5 clear).
- *Contradicted (blocking):* (1) **the steer does not resume** -- pushing the place play zeroes the covered top's steer
  record, `+0x78` and `+0x6c`..`+0xa8` (`FUN_0028dc90` D:L135135-135148); a resumed climb is root travel only. (2)
  **the touchdown can pop the climb** -- on touchdown (`FUN_0059b440` clears bit 5, D:L456528, after an airborne tick,
  D:L466805-466807) the landing branch (D:L466868-466911) pops the whole stack to one play when the speed squared is
  under 400 (`FUN_0058a5e0`, D:L466897, its loop D:L446796-446798; the place play's `+0x2b` is 0, passed at D:L475322),
  which pops the place and then the climb, whose 0x2a settle stands the actor on the floor *in front* at the `+0x2e4`
  just landed on; else it pops once (D:L466900-466902); `FUN_005af590` (D:L466910) may then pop to one and push action
  10 for a short fall (D:L466677-466693, `FUN_0058a4d0` D:L446762-446768). The addendum's "the landing is a flag write,
  not a play" is wrong at touchdown (`FUN_0059ad30` D:L456314-456322 is only its un-sink of `+0x2e4`).
- *The unread items:* (a) a finished one-shot pops in the ground driver's top-play block (D:L418172-418203: cut by
  `FUN_00587c20` and the stick, D:L418180-418185, or ended through `FUN_00582540`, D:L418193, its end test D:L442925;
  then `FUN_005870e0`, D:L418203, pops one, D:L445128), not by `play+0x64` (D:L438996-439005 is a phase callback, cleared
  after it fires, zeroed at push, D:L135200-135202); `FUN_00582540` is not read whole. (b) The steer on resumption: none
  (above). (c) `FUN_0054aa30` from inside a hull: still open. (d) A climb play with `+0x2b == 8`: not in this sequence
  (the writes of 8: D:L446448, D:L446513, D:L456565, D:L460065).
- **The decisive values, unread:** what `+0x404` holds during a climb (if it stays the ground, the body counts as
  grounded once gravity resumes, the touchdown branch never runs and the climb can resume when the place pops -- root
  travel about 5.2 ahead, enough to cross the face; if it lies above the floor, the touchdown pops end the climb in
  front of the crate), and the touchdown velocity (`+0x38`..`+0x40`). Both outcomes are the original's; which one the
  owner's sequence takes is a read of `+0x404`'s writers under a climb or a capture (s7).
- *The probe* (`test/parity/climbInterrupt.parity.test.ts`): its plain-climb and outside-a-climb cases are the port's
  contracts; "accepted mid-climb" agrees with the owner's observation, its cite lacking the `FUN_00589900` and
  `FUN_005a7de0` gates; its `it.fails` "inside the hull" agrees with the observation but not with a supported
  mechanism (its header lines 20-23 and comment 158-161 cite the resumed climb); its header line 22 calls the face
  crossing at phase 0.86 the owner's observation, where it is a disc reading. To be corrected when PB-7 (b2) opens it.

**So the port change, when it is settled,** lets the kit one-shot take the body mid-climb with gravity on, freezes the
climb at its phase *and wipes its steer*, runs the landing's stack pops at touchdown, and resumes the climb (root only)
only if it is still on the stack when the place ends. A change that only turns gravity on lands the body in front; the
"always resume" change would run ahead of the evidence. Not built until the decisive read or a capture (PTW.R5).

**The deciders read, 2026-10-11 (PARITY-2's PB-7 (b1'); a third reader, neither the section's author nor (b1)'s
reviewer; source inspection of the game ELF's decompilation, plus a read-only decode of `motion.rdr` from
`RUN/READERC.ZAR` (its record at byte 347088) by the format of `packages/archive/src/rdr.ts` -- not through the
repository's reader, so its flags are owed a re-check with `parseRdr`; the action names from the ELF's strings).
Reviewed 2026-10-11 (below): partially supported. Outcome: (A), **conditional** -- the place lands the body in one
tick, plays on the floor in front, and the climb resumes (root only) into the hull; the touchdown pops above are not
reached on the first place tick.**

- *Decider 1, `+0x404` and the airborne bit (reading):* the only writer in play is `FUN_005b0420` (a probe hit copies
  the surface record, D:L467127-467136, D:L467139-467141; the ELF's `DAT_003df1c8` is 1, so the miss path that would
  write it, D:L467057-467077, does not run); placement, teleport and carried-partner writers do not run in a solo climb
  (`FUN_00546cf0` D:L412499/412507, `FUN_00546e40` D:L412542/412550, `FUN_005e6400` D:L497432-497440, `FUN_00579220`
  D:L438153-438168, `FUN_005794d0` D:L438215-438230). The probe is queued every frame (`FUN_00550570` D:L417771 ->
  `FUN_005b0420`; `FUN_005b0840` D:L467198-467290 from `FUN_005506a0` D:L417826), its gate met under a `UseVelY` top
  play (`FUN_0054aa30` sets `+0xe1` bit 0, D:L416185-416188), so `+0x404` follows the climb: the pick under the moved
  position raised to the last matrix y (D:L417824) plus the `+0x88` node's turned translation (D:L467215-467256) --
  at the midpoint the ground in front (medium: assumes the bone's horizontal offset stays short of the face). While the
  climb is current `FUN_005af930` copies it into `+0x2e4` and clears bit 5 each tick (D:L466784, D:L466787); on the
  first place tick the integrator starts from the floor with "grounded last tick" true (D:L466805-466807), the new y
  at or under `+0x404` (D:L456513), the fall speed zeroed (D:L456514-456516), bit 5 cleared (D:L456526-456528): **the
  body is never airborne, no touchdown tick runs** (D:L466868-466911 not reached). The place clip has no `UseVelY`
  (`seal_place_claymore`: NoInterrupt 0.9, NoPitchtwist, NoFire, playback 2.7; `seal_climbcrate` has it, from the
  decode), so `FUN_0057b510` answers false (D:L439215-439223), `FUN_0059afd0` returns `+0x2e4` (D:L456356-456364,
  raising `+0x1061` bit 0 at D:L456361) and `FUN_005483d0` writes it as the body's y (D:L413943-413954): **a one-frame
  drop, no fall arc**; `FUN_005b0420` snaps the matrix to the floor plus the material offset (D:L467107-467118).
- *Decider 2, the touchdown speed (reading; moot):* the landing test reads the mover's world velocity
  (D:L413963-413965), not `+0x133c`'s fall speed: a top play neither `UseVelY` nor looped has its vertical zeroed
  in the move (D:L416472-416478) and restored to the clip's root y velocity (`+0xf50`, D:L413966-413970); only the
  jump, fall and dive plays carry the fall speed there (D:L416501-416514). Were a touchdown reached, the place clip's
  small root velocity would take the pop to one (D:L466897) and `FUN_005af590` would push Jump land or land hard
  (D:L466661-466694; `DAT_0044c260` 115; gravity `DAT_0044c250` 235, research 151, 201; the integrator
  D:L456496-456498). None of it runs.
- *The resumption (reading, medium):* the place pops in the ground driver's top-play block (the stick past NoInterrupt,
  D:L418180-418185, or `FUN_00582540`'s end, D:L418193; `FUN_005870e0` pops one, D:L445128; `FUN_00589aa0` makes the
  revealed play's action current, D:L446524-446525 -- the 0x2a settle does not run, the popped action being the
  place's). The climb is current again: gravity off and `+0x2e4` re-pinned (D:L466782-466787); the climb pushed
  forward (D:L442242; the reverse flag 0x20 only from `FUN_0028c160`, D:L134092), so y is the matrix y plus the root's
  y velocity times dt, the root node held at 11.487 or below (D:L456402-456460), the velocity from `FUN_0028c250`
  (D:L438910); the climb's NoInterrupt 0.9 keeps the stick from cutting it at phase 0.5. **The wall probes are skipped
  under a `UseVelY` top play** (D:L415085-415087, the contacts zeroed at D:L415006; the step query of `FUN_005483d0`,
  D:L413673-413749, runs only with contacts, D:L413404-413913), so the remaining root travel (about 5.2 ahead, 6.6 up)
  enters the hull. At the climb's end the 0x2a settle sets y to `+0x2e4` (D:L446582-446597), the floor pick of that
  tick.
- *A correction to the addendum's item 3 and (b1):* the window's reference is the probe origin -- the feet plus the
  pose's bone lift (`STEP_PROBE_LIFT_READING`, research 86 §6.5) -- plus 1, not the feet plus 1.
- **The one value left (unread, needs a capture):** inside the hull or on its top turns on the probe's lift in the
  climb's end pose against the crate's top. On MP2's test crate (top 11.85, the root's total rise 12.87) "inside" needs
  the rise at the cut over the lift + 2.02: with the standing lift 5.5, a cut after about phase 0.58 (key 15, 0.52, ends
  on top; key 20, 0.69, inside); a lift of 4.7 moves it to about 0.55; a lift of 11.2 (the skeleton root) never gives
  inside. The owner's "inside" implies a late cut, a taller crate or a low lift. A capture settles it with a frame trace
  from the cut to the settle: the climb play's phase `+0x1c` at the push; per frame `+0x534`, the matrix y `+0x20`,
  `+0x2e4`, `+0x404`, `+0x105e`; the probe origin (the batch entry at index `+0x2cc`, fields `+4..+0xc`) on the climb's
  last tick; the crate's top y. Also unread: the `+0x88` node and its translation in `seal_climbcrate`'s end pose and
  mid-climb; the owner's crate and cut phase; `FUN_00582540` whole; `DAT_004365e8`; whether NoInterrupt counts phase or
  seconds; the hull's back faces after the settle; the place's wall-probe resolution (research 217 §2.1, not re-read).
- **The port change this reading specifies:** the kit one-shot takes the body mid-climb, the climb frozen at its phase
  and its steer wiped; while a climb runs the physics y is pinned to the floor pick each tick, and a non-`UseVelY` play
  on top drops the body to it in one tick (no arc, no landing pops -- `agent/pb7-probe`'s "gravity on" arc of about
  0.23 s is not the original's); the wall probes on while the place plays; at the place's end (its end, or the stick
  past NoInterrupt) the climb resumes from its phase, the root driving y, x and z, the wall probes and step query off,
  the floor pick refreshed each tick; at the climb's end y to the floor pick under the probe origin + 1 and the root to
  11.4. The probe `climbInterrupt.parity.test.ts` states its cut phase and lift: with the port's lift 5.5 its midpoint
  case ends on top, not inside.

**The review of (b1'), 2026-10-11 (PARITY-2's PB-7 (b1''); dot's fresh reviewer, Codex, relayed by the main merge
controller at 03:03Z; source inspection, and a decode of `motion.rdr` by dot's reviewer). Verdict: PARTIALLY
SUPPORTED, medium confidence.** The mechanism holds: `FUN_005af930` copies the floor into the physics y and clears
the airborne bit during the climb (D:L466782-466787); `FUN_0059b440` (D:L456496-456528) and `FUN_0059afd0`
(D:L456356-456364) allow a one-tick placement drop with no touchdown transition; the erased steer (`FUN_0028dc90`), the
surviving play's resumption (`FUN_00589aa0` D:L446515-446525) and the crate climb's probe skip (`FUN_0054aa30`
D:L415006, D:L415079-415087) stand.

- *The clip flags, re-read (closes the `parseRdr` debt above):* `motion.rdr` at `READERC.ZAR` byte 347088, size 62744
  -- `seal_climbcrate`: `UseVelY`, NoInterrupt 0.9, NoTurn, NoPitchtwist, NoFire, playback 1.25;
  `seal_place_claymore`: no `UseVelY`, NoInterrupt 0.9, playback 2.7. `FUN_00287620` maps `UseVelY` to the play's bit
  (D:L131390-131395). **NoInterrupt counts phase**, not seconds (D:L131431-131462; `FUN_00587c20` D:L445549-445563):
  that unread item is resolved.
- *Qualification 1 -- (A) stays conditional.* The midpoint probe's horizontal offset, the floor picks after the first
  tick and the place's contact response are unmeasured (Decider 1's "medium", and the "Also unread" list above), and
  `FUN_005b0840` (D:L467215-467256) and `FUN_005b5d40` (D:L470205-470260) make them material. One grounded first tick
  does not prove the body is never airborne through the whole placement: a later tick's pick could leave it above the
  floor and reach a touchdown. A capture must tell a surviving climb from a later touchdown cancellation.
- *Qualification 2 -- the residual travel and the 0.58 threshold are conditional.* They assume the stated lift and the
  climb's endpoint. Stick input continuing past the climb's NoInterrupt (phase 0.9) can cut the resumed play short, and
  the 0x2a settle takes the *stored* `+0x2e4` (D:L446582-446597), whatever the last pick wrote. The root keys and the
  crate's geometry were not re-measured by this review.
- *Qualification 3 -- the landing counterfactual (Decider 2) is too strong.* `FUN_005af590` runs only while
  `DAT_004365e8 <= 0` (D:L466654; `FUN_001ecb10` assigns it 10 at D:L51045), and its severity uses the fall speed
  passed in: "would push Jump land or land hard" holds only under that guard, and the place clip's small travel does
  not by itself establish the three-component speed under 20.
- **The capture's trace, enlarged (H162):** the owner's crate, facing, cut moment and stick timing; then per tick from
  the cut through the settle and the small step forward: the play stack, the current action, the phase and the pop's
  reason; the matrix x, y, z; `+0x2e4`, `+0x404`; the airborne and jump flags; the fall speed and the world velocity;
  the full posed probe origin and the surface it selects; the contacts and the crate's face and top. It decides four
  things: a one-tick snap or an arc; the climb surviving or cancelled at a later touchdown; its endpoint reached or cut
  early; a transient entry into the hull or a stable inside / on-top, or a later expulsion.
- **So:** (b2) stays unbuilt (PTW.R5); H162's ask stands -- the capture with this trace, or the owner's word to build
  (A) as a named reading.

**PB-7c, the read for later (2026-10-17; PARITY-2, the owner's "do research that later"; reading, pending review; no build,
#96 deferred).** Source inspection of the decompilation, three byte reads of the ELF, and scratch dumps of the disc through
the repository's readers (`loadMap`, `groundPolygons`; never committed); no test suite, no browser, no capture.

- *The floor record under a climb (PB-7 (b1)'s open value).* In a solo climb the record `+0x400..+0x41c` (its y at
  `+0x404`) has one writer, `FUN_005b0420`: a probe hit copies the hit surface in (D:L467127-467141); a miss leaves it,
  the branch on `DAT_003df1c8` (1 in the ELF, at 0x3df1c8, written by nothing) restoring the last floor point
  (D:L467092-467101). The other actor writers (`FUN_00546cf0`, `FUN_00546e40`, `FUN_00579220`, `FUN_005794d0`,
  `FUN_005e6400`) do not run in a solo climb. The probe is queued under the same gate as the move (D:L417822-417826),
  requested under a `UseVelY` top and on the walking paths (`FUN_0054aa30` D:L416185-416188, D:L415068-415071,
  D:L415240), from the moved position (y no lower than the last tick's, D:L417824, D:L467218-467220) plus the `+0x88`
  node's translation turned by the actor's matrix (D:L467221-467256), resolved in `FUN_005b5d40`'s 1.0 window
  (D:L467055); `FUN_005af930` copies it to `+0x2e4` each climb tick (D:L466784-466787). So the record is **refreshed every
  climb tick at the climbing body**, not kept from the ground.
- *The place over the climb.* `FUN_005a7de0`'s gate (D:L462611-462686; its action ids resolved from their name lookups,
  D:L495211-495414) names the throws, tosses, stab and close attack, restraints, the launcher's and turret's swaps and the
  get-ups -- no climb -- so the place is taken with a climb on top. `FUN_00588bc0` stacks it over the climb and the push
  wipes the climb's steer (`FUN_0028dc90` D:L135135-135148); only the top play advances, so the climb is frozen at its
  phase. Unlike the knock (D:L440997, `CLIMB_KNOCK_SETTLE_READING`) and the flinch (NU-1b B7), nothing pops the climb.
- *Where y settles.* On the place's first tick the body drops to the floor in one frame (D:L466805-466809;
  `FUN_0059b440` D:L456505-456528; `FUN_0059afd0` D:L456356-456364): at a mid-climb cut the actor stands in front of the
  face, so the ground. When the place pops, the climb resumes on root motion only, its wall probes skipped
  (D:L415079-415087), the floor pick refreshed each tick; at its end the 0x2a settle (D:L446582-446597) sets y to the last
  pick under the probe origin.
- *Frostfire's crates (MP2, off the disc).* `worldmodel/crates1/prop02`, the test crate (x 922.76..940.63, z
  761.00..778.11): a **solid closed box** -- one full-footprint top quad (ditype 3) at 111.85, four outer walls 100 ->
  111.85 (appflags 4), no rim or inner walls, the warehouse floor at 100 under it (and 63.19 below). Its neighbour
  `prop01` (top 118.96, h 18.96) is the same; all 19 crate-band boxes on MP2 are this five-polygon solid box (h 11.85 or
  18.96). No open-topped box like MP6's `mp6_justbox2` (research 313 §8.6). "Inside" here means the 100 floor within the
  box's walls.
- *The outcome by cut phase (the 11.85 crate, `seal_climbcrate`: 30 moving keys, root rise 12.88, 11.36 ahead; the end
  2.44 past the face).* After a cut at root rise r the body drops to 100 and the resumed climb ends with the feet at
  100 + 12.88 - r: on the top when r is at most the lift + 2.03, inside otherwise, the lift being the probe origin's
  height over the feet in the end pose. With the port's 5.5 (the standing pose's): a cut at phase 0.62 or before ends on
  the top, 0.66-0.83 inside, 0.86 or after on the top (the origin already over the face); near 0.83 either. With a lift
  of 4.0, inside from about 0.48. For the 18.96 crates a rough phase-aligned blend (`FUN_00581110`'s weights; the blend
  rule not read) gives inside from about 0.3-0.35 to the face crossing, for lifts up to 7.
- *So, at reading level:* the original has the mechanism -- the place stacked over the climb, the drop in front, the
  climb resumed through the solid hull on root motion, the settle on the floor under the top: the owner's "fall through, a
  bit of a step forward, inside the box". It holds for those cut windows only; at "halfway" (0.5) with the lift 5.5 the
  body ends on the top.
- *Unread:* the `+0x88` node and its translation in `seal_climbcrate`'s pose mid-climb and at the end (the lift and its
  horizontal offset, D:L467221-467256); `+0xf88` mid-climb (the place's speed refusal under `+0x105e` bit 7, D:L475310-475318);
  the writer of the `+0xf40` gate (inferred from the move's); the walk out from inside a hull (`FUN_0054aa30`); the
  owner's crate and cut moment.
- *What settles it:* one PCSX2 frame on an uncut climb's last tick -- the queued probe entry's y (the batch index
  `+0x2cc`, its `+4..+0xc`) less the actor's `+0x20` -- fixes the threshold; H162's full trace (cuts near 0.5 and 0.7 on
  prop02's south face, per frame `+0x534`, `+0x20`, `+0x2e4`, `+0x404`, `+0x105e` and the play stack) confirms the
  sequence.
- *The port against it (lane 206c87433):* `Walker.hold` takes the place mid-climb but does nothing with it
  (`mover.ts` :2132-2143); the climb owns the tick and `endUncut` -> `climbSettle` picks from the feet + 5.5 onto 111.85
  (`traversal.ts` :1392-1394, :1556-1560): on the top at every cut phase. A build of the reading (this section's port
  change) would end inside on prop02 for cuts at 0.66-0.83 with the lift 5.5; `climbInterrupt.parity.test.ts` cuts at 0.5,
  so its expected-failure case would move its cut to about 0.7; the end pose's lift would need its own named reading.

### 3.4 The headroom ray's owner gate (D16, PAR-21; added 2026-10-11)

*Reading, pending review* (the PAR-21 implementer's source read of 2026-10-11, decompilation r0001 as pinned in this
note's header; synthetic geometry only, no capture; the owner gate's map prevalence unmeasured -- the class filter's
counted off the disc by PAR-50, below).

- **The ray.** `FUN_0057efe0(actor, mode)` (D:L441208-441239) takes the posed hips node (`actor+0x304`) + 2 as the
  foot and the actor's y + 19 (mode 0) or + 12 (mode 1) as the top (D:L441209-441223), hides the actor's own collision
  through its vtable +0x38 slot (D:L441226-441227, restored D:L441230-441231), sets `DAT_0044d758` = 1 by
  `FUN_002d4fd0` (D:L441228; the setter D:L176018-176021) and casts the segment with `FUN_0031e1d0` (D:L441229). Clear
  when nothing is hit or the nearest hit's `m_cameratype` is exactly 1 (D:L441232).
- **Which traversal, which gate.** `FUN_0031e1d0` (D:L220125-220145) writes the segment into the record and runs
  `FUN_002d4780` (D:L220139), which visits the grid's nodes through `FUN_002d2890` (D:L175777, 175782, 175788). That
  visitor's first test is the owner gate (D:L174789-174790): `+0x5c` bit 0 **and** `+0x5d` bit 4 -- `m_active` (flag
  bit 0) and `m_hasDI` (flag bit 12) of `tag_NODE_PARAMS` -- then the record-flag/`+0xa1` test and the record's own
  excluded node (D:L174791-174792). The plan's citation `FUN_002d3030` D:L175073-175074 is the **same two-bit test in
  the probe's twin visitor** (`FUN_002d3cf0`'s, D:L175698-175710), not the headroom's own path; the reading is the
  same.
- **The walk's other probes gate the same way.** The prone/crouch gates' obstacle segments (`FUN_0054d620` ->
  `FUN_005ab590` D:L464516 -> `FUN_0031de90` D:L219997 -> `FUN_002d3cf0` -> `FUN_002d3030` D:L175073-175074) and the
  ground probe (research 23 §1.1) pass only an active owner with DI. So no probe of the walk saw an inactive owner, and
  the port's `segmentHit`, `probeGround` and the mover's wall cache (`V:mover.ts` `modelGate` at the moving-owner and
  wall scans) already gated; the headroom was the only hand-written grid scan without it.
- **The port's flags.** `CollisionOwner.flags` is the node's `tag_NODE_PARAMS` word (`collisionOwners`,
  `packages/scene/src/grid.ts`, `flags: f.node.flags`); `modelGate` (`packages/scene/src/probe.ts`) tests bit 0 and
  bit 12 and the region layer. An owner inferred without the graph (`collisionRuns`) has no flags and passes.
- **The repair.** `Walker.headroom` skips an owner `modelGate` refuses (all layers, as `segmentHit` asks it). The
  headroom's surface filter (bit 18 skipped) and every other query are unchanged. One `Walker` serves the page and
  the room's mover.
- **Held by** `packages/viewer/test/parity/movement.test.ts`: movement-07 is now a plain `it` (green), and the D16
  block: an active owner with DI still blocks (mode 0 and mode 1); an active owner without `m_hasDI` does not; an
  active bit-18 ceiling does not (the class filter kept); the prone gate's probe keeps its owner gate and its
  `isWallSurface` filter.
- **Seen beside D16, not changed (for the controller):** the original casts this ray with `DAT_0044d758` = 1, the
  camera-probe class mode (the surface filter skips bit 19, not bit 18; `segment.ts`'s header), and treats only a
  nearest hit of `m_cameratype` exactly 1 as clear. The port's headroom skips every bit-18 polygon (`m_cameratype` 1
  or 3) and keeps a bit-19-only polygon (`m_cameratype` 2). *(Corrected by D16's review, 2026-10-11.)* A type-3
  polygon is skipped by both (bit 19 set; bit 18 set); what answers differently is a type-2 overhead polygon (the port
  blocks, the original skips it) and a type-1 polygon nearer than a solid one (the original clear, the port blocked).
  The same filter (`FUN_002d2890` D:L174845-174864; its twin `FUN_002d3030` D:L175299-175315; the hit's polygon
  stored at D:L174887, the nearest picked by `FUN_002d4cc0` D:L175904, the clear test `FUN_0057efe0` D:L441232) also
  requires `ditype` bit 1 (D:L174845: a ground-only `ditype` 1 polygon overhead blocks the port, not the original) and,
  in mode 1, skips a polygon whose material entry `0x44f358[m]+0x3c` bit 0 is set (D:L174856-174861; the material
  table is not in a map's archive, as `segment.ts:21` and `probe.ts:35` say). This is the headroom's class filter,
  outside D16's brief, an unrepaired difference -- PARITY-2's **PAR-50** (with D13: `FUN_0057f150` D:L441275-441279 makes
  the same mode-1 cast with the same type-1 clear), no count yet of the map polygons it reaches. *(Repaired by PAR-50,
  below.)*
- **PAR-50: the camera-class cast** (*reading, pending review*; the PAR-50 implementer's source read of 2026-10-11, the
  same decompilation; synthetic geometry and the disc's count, no capture).
  - *The filter, re-read.* `FUN_002d2890` (D:L174845-174861) with `DAT_0044d758` = 1: the polygon's word byte 8 bit 1
    (`ditype` bit 1) is required (D:L174845); word bit 19 skips it (D:L174855); otherwise the material index -- word
    bits 10-17 taken straight into `DAT_0044f358`, an index at or past `DAT_0044f354` read as 0 (D:L174856-174860) --
    skips it when the entry is not empty and its `+0x3c` bit 0 is set (D:L174861). There is no `DefaultMaterial` lookup
    here (`FUN_002dc1d0`, which maps byte 0 to `DAT_0044f310`, is not called), so byte 0 is entry 0.
  - *The material flag is readable.* `+0x3c` bit 0 is set by `FUN_002dde40` for a SOILS record carrying the key at
    0x3f3798 (D:L181403-181405), which the ELF (`socom2_game.elf`'s load segment) holds as `VOLUMETRIC` (0x3f37c8
    `LIQUID`, 0x3f37d0 `UNDERWATER`, 0x3f37e0 `PICKUP`, the next keys). `FUN_002de4b0` puts `UNKNOWN` first with the
    bit clear (D:L181524) and `PARTICLE_SYSTEM` second with it set (D:L181549). That is `@s2u/scene`'s `materialTable()`
    (`projectile.ts`: the two built-ins, then `materials.rdr`'s SOILS, its VOLUMETRIC column transcribed and checked
    against the file by the scene's tests): VOLUMETRIC are `PARTICLE_SYSTEM`, `LEAFY_TREE`, `GRASS_VOL`, `BUSH_VOL` and
    `SNOWY_GRASS_VOL`. No `*_READING` stands in for the flag.
  - *The clear test.* Both rays: no hit, or the nearest hit's word bits 18-19 equal to 1 (`FUN_0057efe0` D:L441232,
    `FUN_0057f150` D:L441279). The jump's ray runs from the posed head node (`actor+0x308`) + 1 (D:L441265) up 20 more
    (D:L441271), the actor hidden around the cast as the headroom's is.
  - *The repair.* `V:mover.ts` `isCameraClassSurface` (`isCameraSurface` -- bit 1 set, bit 19 clear -- and not
    VOLUMETRIC by the raw index) and `cameraClassClear(grid, a, b)` (`segmentHit` with that filter: D16's `modelGate`,
    the nearest hit; clear when none or type 1). `Walker.headroom` casts it from the idle hips + 2 to the feet + 19 / +
    12; `Walker.jumpClear` from the stance's idle head + 1 up 20 (`JUMP_HEAD_READING`, §3.4.1). `jump` does **not** ask
    `jumpClear` yet: D13's refusal is capture-gated (PTW.R1; §3.1's D13 row, §7), so its `it.fails` roof cases stand and
    the query is written and held. The walk's other probes (`isWallSurface`, the prone gate, the ground probe) keep their
    own filters; `segment.ts`'s `isCameraSurface` (the camera's) is unchanged, its material half still unmodelled there.
    One `Walker` serves the page and the room.
  - *Held by* `packages/viewer/test/parity/movement.test.ts`, the PAR-50 block, each case for both rays: a type-2
    overhead polygon (clear), a type-1 nearer than a solid (clear), a `ditype` 1 overhead (clear), a `LEAFY_TREE`
    overhead (clear), a type-3 (clear), a solid type 0 (blocked: the control), a type-1 beyond a solid (blocked); D16's
    owner gate on both rays; the jump still starting under a solid roof.
  - *The disc's count* (the port's measurement, 2026-10-11: a throwaway read-only script over every map archive under
    `SOCOM_DISC/RUN` -- 34, `M*` and `MP*` -- through `loadSimMap` and `groundPolygons`, 341,680 polygons). Each cell is
    all / not vertical (`|n_y| > 0.05` by Newell's sum: a vertical ray can cross it) / facing down (`n_y < -0.5`). The
    hull's winding faces up: of the walkable polygons (`ditype` bit 0, bit 18 clear) one in all 34 maps faces down
    (M82), so a downward face is a ceiling. On every map: **no** `ditype`-1-only polygon (`ditype` & 3 == 1), **no**
    `m_cameratype` 3, every type-1 and type-2 polygon carries `ditype` bit 1, and every owner passes D16's gate. Maps
    not listed (M72, MP11, MP12, MP51, MP52, MP64, MP83) have none of the three.

    | map | polygons | `m_cameratype` 1 | `m_cameratype` 2 | VOLUMETRIC, bit 1 set, bit 19 clear |
    |---|---|---|---|---|
    | M51 | 13,729 | 54 / 32 / 0 | 429 / 35 / 0 | 0 |
    | M52 | 10,757 | 15 / 0 / 0 | 0 | 0 |
    | M53 | 10,374 | 43 / 0 / 0 | 8 / 0 / 0 | 0 |
    | M61 | 8,375 | 111 / 0 / 0 | 2 / 0 / 0 | 0 |
    | M62 | 15,053 | 2 / 0 / 0 | 1,815 / 544 / 0 | 0 |
    | M63 | 11,644 | 123 / 6 / 0 | 0 | 0 |
    | M71 | 14,998 | 46 / 0 / 0 | 2 / 0 / 0 | 0 |
    | M73 | 13,790 | 24 / 0 / 0 | 0 | 0 |
    | M81 | 14,792 | 88 / 0 / 0 | 0 | 0 |
    | M82 | 8,648 | 76 / 0 / 0 | 0 | 0 |
    | M83 | 9,555 | 212 / 0 / 0 | 14 / 0 / 0 | 0 |
    | MP1 | 8,086 | 77 / 40 / 29 | 187 / 55 / 33 | 0 |
    | MP10 | 10,714 | 20 / 4 / 4 | 4 / 0 / 0 | 0 |
    | MP2 | 3,318 | 19 / 3 / 3 | 10 / 0 / 0 | 0 |
    | MP5 | 7,119 | 35 / 0 / 0 | 1 / 0 / 0 | 29 / 29 / 29 |
    | MP53 | 7,611 | 9 / 9 / 0 | 38 / 36 / 0 | 0 |
    | MP6 | 5,872 | 120 / 5 / 5 | 1 / 0 / 0 | 0 |
    | MP61 | 4,779 | 1 / 0 / 0 | 2 / 0 / 0 | 0 |
    | MP62 | 6,380 | 6 / 0 / 0 | 388 / 288 / 0 | 0 |
    | MP7 | 8,387 | 32 / 0 / 0 | 0 | 0 |
    | MP71 | 8,919 | 16 / 0 / 0 | 4 / 0 / 0 | 0 |
    | MP72 | 9,820 | 0 | 10 / 2 / 0 | 24 / 0 / 0 |
    | MP73 | 14,158 | 91 / 24 / 24 | 5 / 0 / 0 | 0 |
    | MP8 | 11,842 | 0 | 4 / 0 / 0 | 0 |
    | MP81 | 4,202 | 12 / 12 / 8 | 0 | 0 |
    | MP82 | 18,464 | 12 / 8 / 4 | 4 / 0 / 0 | 0 |
    | MP9 | 14,652 | 36 / 0 / 0 | 0 | 0 |
    | **all 34** | **341,680** | **1,280 / 143 / 77** | **2,928 / 960 / 33** | **53 / 29 / 29** |

    So the difference reaches real geometry: 960 type-2 polygons a vertical ray can cross (33 of them ceilings, on MP1;
    most of the rest steep, M62's and MP62's) blocked the port's headroom and the original's never; 143 type-1 polygons
    the port skipped, which in the original answer clear when nearest (77 ceilings: MP1, MP73, MP81, MP6, MP10, MP82,
    MP2); and MP5's 29 VOLUMETRIC ceilings -- bit 18 clear on all of them, MP5's type-1 polygons being all vertical --
    blocked the port's headroom and not the original's (which SOILS entry each is, not broken out). The `ditype` clause changes nothing on the
    disc's maps. The counts are of polygons, not of places: where a type-1 polygon lies under a solid one within a
    ray's span was not measured.

- **Open, PAR-50's review (F1, 2026-10-11): the model's first hit, not its nearest.** In `FUN_002d2890` a model's `+0x80`
  byte (`bVar1`, D:L174831) bit 0 ends its polygon loop after the first accepted hit (`cVar5 = bVar1 & 1`, D:L174890): such
  a model adds its first hit in surface order, not its nearest. The port's `segmentHit` takes the nearest over all polygons
  (`segment.ts:26-27` calls the two the same, a reading). Since PAR-50 the hit's type decides the answer, so one model
  with that bit set holding a type-1 polygon nearer than a solid one that comes first in surface order is blocked in the
  original and clear in the port (and the reverse when the order is swapped). Unmodelled; settled by reading which
  models carry the bit on the disc and their polygon order, or a capture. The PAR-50 tests give each polygon its own owner
  and so do not reach it.
  - *The action ray takes it (MAP-07, PR #427, 2026-10-22; reading, pending review).* The node constructor
    `FUN_00316e30` (D:L215808) sets `+0x80` bit 0 and clears bit 1 (D:L215827-215828), so a node the model loader does
    not rewrite stops at its first accepted face, and with bit 1 clear the start is 0x20 (D:L174831-174837): a face only
    from the front. `equipment.ts` `actionRayDetail`, the use prompt's pick, keeps each owner's first front face in
    surface order. The PR cited research 281 for the constructor; 281 does not hold it. Still open: whether the loader
    rewrites `+0x80` for any hull model (not read), and the other queries -- the shot, C4, the headroom, the camera --
    which keep `segmentHits`' nearest. One rule for all of them is the gameplay seat's call.

#### 3.4.1 Readings (PAR-50)

| name | value | what it stands in for | what would settle it |
|---|---|---|---|
| `JUMP_HEAD_READING` (`viewer/src/mover.ts`) | `'idle'`: the jump ray's foot is the stance's idle head (`seal_stand` 17.394, `seal_crouch` 10.138) + 1, up 20 | the posed head node `actor+0x308` at the press (`FUN_0057f150` D:L441263-441271), which moves with the clip (research 217 §2.3) | D13's capture (§7): a jump pressed standing and crouch-running under a low roof, the head node's height and the ray's answer; until then `jump` does not ask the ray (PTW.R1) |

## 4. Input timing, edges and buffering

Confidence for original/source comparisons here: **reading, pending review**. Existing owner adaptations stay
separate: drawn-frame controls, 60-Hz commands, keyboard/mouse mapping, and stance tap/hold are already authorized.

### 4.1 Transition table

| Input state / transition | Original reading | Port and assessment |
| --- | --- | --- |
| Sampled down/held/up | `FUN_002d9ff0` D:L179137-179169 uses 0 rest, 1 first down, 2 later held, 3 first up; semantic mapping `FUN_002c64e0` D:L166917-166930. | `V:gamepad.ts:357,365` has render-sample edges. A held boolean is true earlier than original state 2. |
| DEFAULT fire mode | `FUN_00594b70` D:L452961-452994 consumes a .25-s double tap or accumulates state-2 held time >.4 s, resetting on switch. `FUN_002da1c0` D:L179217-179227 consumes tap marker. | `V:matchLanes.ts:51` switches at every rising edge. Default short/double/held sequences differ below. |
| ALTERNATE fire mode | `FUN_00594cf0` D:L453465-453472 chooses DEFAULT only at setting zero; UI D:L61823-61843 names it; settings D:L125173-125183. `FUN_00592050` D:L451464-451467 swaps bindings for alternate first-press path. | Do not impose DEFAULT timing on every saved setting. No owner exception for DEFAULT single-press was identified or confirmed by controller review. |
| Stance during one-shot | Desired actor +0x374 is written and reused by `FUN_00594cf0` D:L453331-453430; `FUN_00552d60` D:L418874-418908 retries it. Outer gate refusal retains it; D:L418991,419011 can reset on other refusals. | `V:walk.ts:247-270`, `mover.ts:1143-1149`, `traversal.ts:466-476` do not preserve the same pending target. Gate repair must neither switch immediately nor forget every request. |
| Jump press | State 1 sets request bit, D:L453208-453217; body consumes/clears at D:L418120-418150. Nonlooped path can consume a request then fail jump entry. | `V:matchLanes.ts:42` is edge-based. `walk.ts:418-423` deferred send ordering is not a general end-of-animation queue. |
| Action release/hold | `FUN_00594cf0` D:L453194-453279 separates release action and eligible 5-s bomb hold; `FUN_005920c0` D:L451493-451507. | `V:actionContext.ts:133-160`, `actionWiring.ts:171-194` separate edges/hold and browser cancellation. No new normal-release delta. |
| Stance pressure | Original peak pressure >=.3 acts immediately; lighter acts as pressure falls, D:L453336-453351. | `V:stanceButton.ts:60-70` approved .4-s tap/hold substitute ignores the initial press-frame elapsed time. Keep this adaptation. |
| Swap/reload/zoom | First-down tests, D:L453288-453323,453460-453463. | `V:matchLanes.ts:45-53` uses edges; refusal does not imply queued input. |
| R2 inventory | State 3 accepts fresh Cross/R2 edge through kit gate, D:L72684-72705; independent idle timeout >5 s. | `V:inventoryMenu.ts:559-592,618-625` agrees. Holding through opening takes nothing; release then fresh R2 takes once. No timed R2 input hold. |
| Stick adapter/ramp | Original pad/dead-zone/ramp, D:L179566-179631,179771-179796; default look values `FUN_002da6c0` D:L179397-179402. | `V:gamepad.ts:296-311` radial .15 adapter is inverted before game law; `camera.ts:479,627`, `look.ts:63-124`. Continuous ramp is approved, not an extra gameplay dead zone. |

### 4.2 Ranked deltas and timing limits

1. **Medium, new:** DEFAULT fire-mode semantics. At source-model `dt=525/15734`, short tap gives original 0
   switches versus port 1; two taps three frames apart give 1 versus 2; 31 held samples give 2 (frames 12,24)
   versus 1 (frame 0). ELF float at 0x650670 is .4000000059604645. These are deterministic source-model counts,
   not measured original inputs. `packages/viewer/test/parity/inputTiming.test.ts` has three expected failures
   at the real playerLanes callback; unrelated lanes are inert. It does not claim firearm eligibility integration.
2. **Medium, existing root:** preserve stance intent through the applicable animation refusal. This belongs to
   section 1's gate fix and is not a second independent bug or a general buffered-jump prescription.

Original core loop polls pad before simulation (`FUN_001e7040` D:L47873-47875, D:L50795-50798), with cap 30
(ELF 0x3e1400; research 208). At the cited 33.367-ms tick, surviving presses wait 0 to almost one poll interval;
brief pulses between polls can disappear. That does not establish an additional fixed frame of engine delay.
MISSION R8 intentionally changes the sampling schedule; network/render phases need separate latency measurement.

ACT supplement `98a49d822c0f36c15a57fbfc4442ca53e5466b2d`, `S:bomb.ts:182-220`, is distinct from the older
consolidation base: held eligibility counts command ages 0..14, pauses at 15, and rechecks current eligibility.
Five-fps input spaced 12 ticks stays live. This owner-ratified network tolerance is not an original input constant.
The old per-command low-fps timer issue is already repaired there. `V:bombPage.ts:147-156` diagnostic prediction
can lag below the page clamp; it is not a visible progress bar and its plan already names the remaining page work.

## 5. Root motion, steering and animation endings

Confidence for this section: **reading, pending review**. Disc root displacement, extracted local velocity and
collision-resolved world travel are distinct quantities. A root delta alone cannot specify a final corpse position.

### 5.1 Coupling and transition table

| Path / end | Original ownership and source | Port and assessment |
| --- | --- | --- |
| General one-shot root | Quantized adjacent root keys, delta*n/T, speed/weight; last key uses preceding pair, D:L132696-132753,134149-134180; root X/Z cleared afterward, D:L439147-439149. | `V:mover.ts:1467-1481` agrees where actionRoots exists. Mean/fallback routes are distinct. |
| Special step plays | Motions 0x10/0x15/0x1c and Buddycarry step use posed-root difference/dt, first sample zero, D:L439126-439145. | No general matching branch in ordinary movement/action lists. Keep with known coupling work, not every action. |
| Walk/run | Weighted per-key motion through actor mover. | Mean band velocity, `V:mover.ts:68,1882-1888`; existing stride-shape omission, not new. |
| Dive | Carry/gravity owns X/Z; root translation suppressed, `FUN_0054d9a0` D:L416510-416553, `FUN_0059b440` D:L456585-456600. .2-s hold, root 2.2, grounded bleed 150/s squared. | `V:traversal.ts:1020-1053` has same ownership. Do not add the clip's authored forward root again. |
| Ladder loop | Vertical root velocity, control-scaled loop rate. | `V:traversal.ts:127-134,1242-1269` uses mean; both disc clips have exactly .625 Y per key interval, so this mean loses no stride variation. |
| Ladder mount/dismount | One-shot root and reference steering, with reverse where needed. | `V:traversal.ts:1164-1209,1282-1296` uses ClipPath endpoints; ranked steering finding below. |
| Ladder slide | Gravity*.8; fixed root near 11.44, D:L456603-456607. | `V:traversal.ts:1299-1335` ownership agrees; landing path still belongs to steering finding. |
| 180 turn | Root velocity zero, rotation reset, D:L439011-439015,439117-439124; code yaw angle/(T*e), D:L468245-468252, completion D:L446650-446651. | `V:traversal.ts:1061-1071`, `animator.ts:614` keep feet fixed. Port spreads full turn over T*e*e. Small angular-profile review note; integration not checked, not separately ranked. |
| Vault/step/crate/hang | Signed root plus NONLOOP steering; UseVelY rules, D:L456402-456460. | `V:clipPath.ts:158-182`, `traversal.ts:909-974` replace path with running extrema/endpoints. |
| Traversal end | Per-motion root resets 11.4 crate, 11.5 medium, 10.73 hang-up, 10.45 step-up, D:L446582-446647. | Shared standing-root targets then finish/settle, `V:traversal.ts:935-950,973,1114-1121`. Include in steering row; no persistent post-blend height error asserted. |
| Knock/death falls | Carry/gravity then landing root; dead holds, live can rise, D:L416501-416530,466645-466725. | `V:mover.ts:1092-1121,1854-1871` owns fall landing root. Separate from selected bullet death. |
| Bullet death | `FUN_005a54d0` D:L461387-461389 -> `FUN_005a2690` D:L459978-460000 -> `FUN_005a2490` D:L459802-459813 pushes ordinary selected motion in state 8. | `S:room.ts:3947-3961,1905-1908` sets deathClip/dead and ticks dead stick; visual `V:remotePlayers.ts:154-160,533`, `animator.ts:835-842` strips root X/Z. Selected clip does not drive mover. |
| Turret entry/release | Nonlooped entry then looped held pose; reverse release D:L462136-462170. | `V:net/emplacement.ts:177-252` has shape/reverse timing but loop-style steering for entry. Existing missing Y/turn stays known; new evidence is dispatch correction. |
| Cross-fade/last hold | Default .4, D:L131465; next-play duration D:L135215-135220; snapshot D:L135389-135409; ease D:L131137-131149, blend D:L436620-436634. | `V:animator.ts:232-235,685-715` matches this mechanism. No general missing-crossfade finding. End ownership and clock gaps remain. |

### 5.2 Ranked deltas

1. **Medium:** selected bullet-death root has no port mover consumer. Original ordinary tick extracts weighted
   velocity (D:L438901-438910,134149-134180), then `FUN_0054d9a0` adds steering/rotates/integrates it,
   D:L416455-416520. `FUN_00577e40` D:L437398-437410 tests motion identity at +0x534: motion 8/9 is not death
   state 8 at +0x174. Dead-input exclusion does not prove root travel absent. Disc chest01 delta is
   (-4.8164,-9.9648,-18.6445), groin02 (-.5391,-9.6563,-36.8398), authored units only. A world/collision capture
   is needed before asserting final displacement; no invented expected-world-path test is added.
2. **Medium:** wrong steering rationale for nonlooped traversal/turret entry plus substituted trajectory.
   Actor dispatch D:L439017-439024 chooses `FUN_005b3340` for NONLOOPED, `FUN_005b2d20` for LOOPED.
   Nonloop D:L468835-468943 uses `sqrt(ease(phase))*referenceError/dt`, yaw cap `2*pi`; ELF
   0x5b3724-0x5b3744 and 0x5b37cc-0x5b37f4 corroborate scalar calls. The earlier `FUN_0028ada0` return is
   overwritten, not phase normalization. The loop's 30 units/s, 270 degrees/s, 46 ticks and near/facing cutoffs
   do not justify one-shot entry. `V:clipPath.ts:117-138,158-182` and `net/emplacement.ts:211-252` need review.
   Both stand2turret entries are nonlooped, 26 keys, P=.3, source-model end .277367 s; held pose is looped.
   Endpoint-matched zero-steer hang-up seam at key 50 gives port X .112739 versus signed root X 2.589844,
   difference 2.477104. This demonstrates trajectory substitution, NOT measured original-world error: original
   steering and collision also alter motion. Keep traversal and turret subcases under one coupling finding.
3. **Low:** deathPose uses playback T rather than one-shot `T*((n-1)/n)^2`. `V:remotePlayers.ts:158-160`
   versus `FUN_0028c4f0` D:L134236-134275 and key conversion D:L134881-134901. Death normal push is
   D:L459804-459805,446292; optional +0x34 callback is DropWeapon (ELF string 0x3efa20, D:L131494-131520), not a clock
   override. All 22 loaded death clips differ by .115046-.399938 s. Chest01 T=3.8, n=42: source-model last key
   at 3.621202 s, port frame 39.070862 rather than 41. Initial skip/discrete scheduling are excluded.
   `packages/viewer/test/parity/rootMotion.test.ts` exercises actual deathPose with disc fixtures and source clock.
   flinchPose shares the helper, but its reaction/layering rules were not audited into a new finding.

   **D20 settled (PAR-23, 2026-10-12, commit `2105db00a`): reading, pending review.** The read, at the source: the
   death's push is `FUN_005a2490` D:L459804 (`FUN_00588bc0` with state 8; the pop `FUN_0058a4d0` is D:L459803, so
   §1.1's "the pop at L459804" is one line late); `FUN_0028cc10` D:L134482-134495 sets a non-looped play's stop phase
   (play `+0xc`) to (n-1)/n (1 for n<2 or a looped motion); `FUN_0028c4f0` D:L134236-134275 advances the phase by
   `dt*weight*speed/(T*FUN_0028ada0)`, `FUN_0028ada0` D:L133349-133366 being (n-1)/n, clamped at the stop; and
   `FUN_0028d670` D:L134881-134901 samples key `phase*n`, the last key held. So a speed-1 one-shot's key at t is
   `t*(n-1)/(T*((n-1)/n)^2)`, its last key at `T*((n-1)/n)^2` (`V:locomotion.ts` `oneShotSeconds`). The port:
   `deathPose` now runs on that clock through a private `keyAt` (`V:remotePlayers.ts`, the comment cites the lines
   above); the 22 cases root-01..22 are plain `it` (RED 22 failed, GREEN 22 passed, the disc fixtures present, none
   skipped); `remoteDeath.test.ts`'s two pose assertions moved to the same clock. Excluded as before: the initial
   skip (play flag 0x8) and discrete scheduling.
   - *The flinch, named, not changed.* `FUN_005a2690` pushes the flinch through the same call (D:L460019 and
     D:L460042, `FUN_00588bc0(.., 0, 0xd)`, the death's 0xd), then sets the play's flags 0x4 and 0x2 (D:L460021-460024,
     D:L460044-460047; `FUN_0058a920` sets a bit) -- neither of which `FUN_0028c4f0` reads (it reads 0x8 and 0x40).
     So the flinch's key would run on the same one-shot clock; `flinchPose` is kept on T because its end -- where the
     finished flinch pops, which `Room.flinch`'s `flinchUntil` window (playback T, `S:room.ts`) pairs with under
     PTW.R3 -- is unread. (0x4/0x2 themselves are read, research 179 §11.5 STRONG: 0x4 refuses a reload start, 0x2 stab, CQB and
     restraint, 0xd no layer; what stays owed there is the legs' blend under the top motion, FLINCH_LAYER_PLACEHOLDER, a
     capture.) The follow-up is PARITY-2's PAR-58: read the pop, then move page and room together.
   - *The room.* No room code reads a death clip's length: the corpse ticks the walker with the stick at rest
     (`S:room.ts` `corpse`), the fade is the constant `BODY_FADE_S`, and a joiner's corpse carries its age only
     (`S:joinState.ts`, `S:extraction.ts`); the pose is the page's alone. No room change (PTW.R3 holds).

   **The flinch's end read and built (PARITY-2 PAR-58, 2026-10-12): reading, pending review.** Source inspection of
   the game ELF's decompilation, the action names from the ELF's own table, and the six clips' entries through the
   repository's readers (`motionTableFromArchive`, `clipsFromPack` over the tracked `READERC.ZAR` and `MOTION_P.ZAR`).
   - *Where it pops, uncut: at its last key on the one-shot clock.* A one-shot on top of the stack (not 0x40,
     D:L418174; its action unchanged over the tick, D:L418176) is ended by the ground driver `FUN_00550ef0`: unless the
     stick cuts it (below), `FUN_00582540` is asked (D:L418193), and on its 1 the top is popped by `FUN_005870e0`
     (D:L418203). `FUN_00582540`'s end test is `FUN_0028c6e0` (D:L442925; body D:L134283-134302): the play's phase plus
     half the next tick's step, `dt x speed / (T x (n-1)/n) / 2`, past its stop `+0xc` -- the `(n-1)/n` `FUN_0028cc10`
     sets (D:L134482-134495). So the pop falls within half a tick of the last key, `T x ((n-1)/n)^2`, the same clock as
     the death's key (above). On the end, the special cases (D:L442996-443130) are the falls, landings, dive, ladder
     slide, turret and launcher raises, the swaps 0x35-0x37 (`Rifle -> Pistol` and its crouch and prone), 0x2c
     (`Stand -> Ladder`), the restraint, stab and buddy-carry actions -- the ELF's action table at 0x661060 (index =
     id; it gives 0x11, 0x13, 0x19 and 0x2a as read before) and the names at D:L495295-495345, D:L495408-495414; the
     flinch actions (`Crouch flinch`, `Prone flinch`, `Flinch right arm` / `left arm` / `right leg` / `left leg`,
     D:L495295-495300) are none of them. Beside the action cases, one actor-state case: with the actor's `+0x1061` bit
     0x2 set (the jump's airborne flag, research 80:78) the end forces the phase to 1.0 and answers 0, so nothing pops
     (D:L443049-443052); whether `FUN_005a2690` ever accepts a flinch in that state is unread
     (`FLINCH_INTERRUPT_READING`) -- the port ends the flinch at its last key there too. *(PAR-65, §5.2.4: read -- it
     accepts one, but the fall covers it from the next driver tick, so the hold meets the fall, never the flinch.)* `FUN_00588bc0` sets a phase
     callback (`+0x64`) only for the swaps, the launcher raises and the turret entries (D:L446304-446398; the ladder
     slide only calls the actor's `+0x90` method, D:L446404-446405, and the landings only clear a bit,
     D:L446400-446401), and the push zeroes it (`FUN_0028dc90` D:L135200-135202): with none, the end answers 1
     (D:L443131-443132). *(Review of PAR-58, 2026-10-12: the airborne case and the callbacks' list corrected.)* Its `+0x2a` hold (1 -> 2,
     D:L442987-442991) is the peeks' alone (`FUN_0057d810` D:L440489, D:L440505).
   - *What lifts the refusals.* The flags 0x4 and 0x2 are the flinch play's own `+0x28` (D:L460021-460024,
     D:L460044-460047), and each reader reads the stack's top: the reload start's `FUN_005b4340(actor, 3)`
     (D:L469499-469500), the stab and CQB (D:L463494-463495) and the restraint (D:L463375-463377). The pop lifts both;
     nothing clears them sooner.
   - *The stick's cut, read and not built.* Before the end test the ground driver may cut the top: `FUN_00587c20`
     (D:L418180; body D:L445514-445576) says yes when the top's node carries bit 0x2 -- which `FUN_0028dc90` sets on
     every node it pushes (D:L135174) -- and the phase is past each node's `NoInterrupt` (`+0x30`, D:L445551-445565;
     absent, the loader's 0, D:L131431-131433); the play's state `+0x2b` is not 8 (the flinch's is the actor's state,
     not 8 at the push, D:L460015, D:L460019); and the move axes `+0x240`, `+0x244` or the turn axis `+0x23c` exceed 0.1
     (D:L418181-418185). None of the six flinches has `NoInterrupt` (`motion.rdr`; nor `NoFire`): a SEAL that moves or
     turns past 0.1 pops its flinch the tick after the hit, the reload refusal with it. The port plays it to its end
     on both sides; the cut is owed as its own row (the room's mover has the axes per command; the page's own body
     too; a remote body has no stick, and what the victim's console sends at the cut is unread) --
     `FLINCH_INTERRUPT_READING` (research 101, PF-18) records it. *(PAR-60, 2026-10-12: read whole and built, §5.2.1;
     "the tick after the hit" corrected there -- the phase test is strict and the push's initial skip spends a tick, so
     the third driver tick that sees the flinch is the first that can cut it. *PAR-61, issue #160 (closed):* that count missed
     the driver's peek (D:L418293), which spends the skip on the first tick: the second driver tick is the first, §5.2.1.)*
   - *The six clips* (keys n, playback T, the one-shot end and the room's window, 60 commands a second, whole commands
     up): `seal_flinch_rarm` 14, 0.8, 0.689796 s, 42 (was 48); `seal_flinch_larm` 25, 0.8, 0.737280 s, 45;
     `seal_flinch_rleg` 13, 0.8, 0.681657 s, 41; `seal_flinch_lleg` 25, 0.8, 0.737280 s, 45; `seal_crouch_rflinch` 20,
     0.4, 0.361000 s, 22 (was 24); `seal_prone_rflinch` 21, 0.4, 0.362812 s, 22.
   - *Built, room and page on one commit (PTW.R3):* `V:remotePlayers.ts` `flinchPose` keys the clip on `oneShotSeconds`
     through `keyAt` and returns null from `oneShotSeconds(T, n)` (the page's own `walk.flinching()` reads it, so the
     page's reload gate moves with it); `S:room.ts` `flinchState` ends `flinchUntil` at
     `ceil(oneShotSeconds(T, n) x TICK_HZ)` commands, the keys from the room's clip set, to which `V:simMap.ts`
     `SIM_CLIPS` adds `FLINCH_CLIPS` (without the keys no window is held, as without the table). Tests:
     `flinch.test.ts` (the six disc clips: the last key just before the end, null at it, mid-clip on the clock) and
     `roomReloadLock.test.ts` (the window's end from the disc's keys). Excluded as for the death: the half-step
     rounding of the end test and the initial skip (flag 0x8), and the legs' blend (`FLINCH_LAYER_PLACEHOLDER`).

#### 5.2.1 The flinch's stick cut, read whole and built (PARITY-2 PAR-60, 2026-10-12): reading, pending review

Source inspection of the game ELF's decompilation; the six clips' `NoInterrupt` through the repository's readers
(`motionTableFromArchive` over the tracked `READERC.ZAR`, checked over all six in `roomReloadLock.test.ts`). No game run;
nothing here is measured.

- *The axes and the threshold.* After the jump's and the ground contact's work the ground driver `FUN_00550ef0` asks
  `FUN_005af930` (D:L418169), which sets the actor's `+0x105e` bit 0x20 before its ground pick `FUN_0059b440` and
  zeroes the three axes when the bit still stands after it (D:L466805-466815; what clears it in the pick is not read
  here), and then, with a one-shot on top (not 0x40, D:L418174) whose action is the one
  it read before the tick's work (D:L418116, D:L418176), asks `FUN_00587c20` (D:L418180). On its yes, with the play's
  state `+0x2b` not 8 (D:L418181; the swap 0x35 also without the yes), the absolute values (`FUN_001b3620`) of the move
  axes `+0x240`, `+0x244` and the turn axis `+0x23c` are compared: `0.1 < |axis|` for any of the three cuts
  (D:L418182-418185) -- strictly past 0.1, at 0.1 none. The axes are what `FUN_00551ec0` copies from the controller,
  the move and the turn times the movement scale `+0x1368` (D:L418613-418624; research 83, 180 §1.7). The port's test
  is the reload's (`reloadLock.ts` `reloadCutOf`: the ground state's stored stick and the turn over `turn_maxrate`,
  past `INTERRUPT_STICK` 0.1), on the same body. *(PAR-64, §5.2.3: corrected -- the copy runs before the driver each
  frame, so the cut reads the pad's stick, not the ground state's ramped one; `reloadCutOf` now takes
  `Walker.cutStick`.)*
- *What lets the cut.* `FUN_00587c20` (D:L445514-445576): no when the end test already answers this tick
  (`FUN_0028c6e0`, D:L445527-445528: the end pops it); no unless the top node carries bit 0x2 (D:L445532; set on every
  node `FUN_0028dc90` pushes, D:L135174); for a controller whose `+0x30` answers (research 193's "networked NPC",
  BELIEVED) no on the actions 100, 99, 0x19, 0x13, 0x11 and `DAT_003dec50` (D:L445534-445546; `DAT_003dec50` is set at
  D:L495249, not one of the flinches at D:L495295-495300) -- a player's SEAL is not such a controller; and then yes only
  while the play's phase `+0x1c` is strictly past the `NoInterrupt` `+0x30` of the last node the loop visits -- it
  overwrites its answer each pass, so the last node decides (D:L445550-445556; reversed, before
  1 - it, D:L445559-445563). The six flinches carry none: the loader's 0 (D:L131431-131433).
- *Which tick cuts.* The push zeroes the phase (`FUN_0028dc90` -> `FUN_0028bc90` D:L135150 -> `FUN_0028cea0`
  D:L134538) and sets the initial skip on a one-shot (D:L135211-135212); the first advance spends the skip adding
  nothing (`FUN_0028c4f0` D:L134241, D:L134257-134259), the second adds `dt x speed / (T x (n - 1)/n)`. The cut is asked
  before the tick's advance (`FUN_0057a330`, called at D:L418454; its advance D:L438901). So on the first driver tick
  that sees the flinch the phase is 0 (not past 0: no cut), on the second still 0, and on the third past 0: **the third
  driver tick that sees the flinch is the first that can cut it** -- not the hit's own tick and not the next. A stick
  held through the hit cuts it there: the axes are read as levels each tick, no edge. The tick is the game frame
  (`+0x2e0`, `GAME_FRAME_DT` = 525/15734 s; research 251 §10.2). The flinch is not pushed inside the victim's driver:
  the victim's own console runs the hit from the Hit packet's handler (`FUN_002bbbd0` -> `FUN_005a1b80` ->
  `FUN_005a54d0` -> `FUN_005a2690`; research 193 §3), and the receive pump runs on its own thread (research 193 §2.4).
  Where the push falls in the frame is **unread**, so the third tick is two to three game frames after the push --
  `FLINCH_CUT_DELAY_READING` (§5.2.2) takes two, the push just before a driver tick.
  **Superseded, 2026-10-12 (PAR-61's review; issue #160 (closed)):** the bullet above is PAR-60's read as built and as its two
  reviews took it -- the third driver tick, `FLINCH_CUT_DELAY_READING` 2 game frames, `FLINCH_CUT_COMMANDS` 5. It missed
  the driver's peek: between the cut's test (D:L418180) and the advance (D:L418454), `FUN_00550ef0` peeks the top with
  `FUN_0028c4f0(dt, top, 0)` (D:L418293), and every path past D:L418113 for a one-shot not cut reaches it (no return
  between D:L418113 and D:L418454; the top is `uVar12` from D:L418171). `FUN_0028c4f0` clears the skip in its `else`
  branch whatever its third argument (D:L134257); that argument gates only the phase's store (D:L134273-134274). So on
  the first driver tick that sees the flinch the cut reads phase 0, the peek spends the skip, and the advance
  (`FUN_0057a330` D:L418454, its own `FUN_0028c4f0(dt, top, 1)` for a play whose `+0x2a` is neither 2 nor 3,
  D:L438896-438901) adds a whole frame; on the second the cut reads `G / (P x e)`, past 0. **Corrected: the second
  driver tick that sees the flinch is the first that can cut it**, one to two game frames after the push as the hit
  lands in the frame (still unread); `FLINCH_CUT_DELAY_READING` is now 1 game frame (0.0334 s), the earliest,
  `FLINCH_CUT_COMMANDS` 3. The phase the cut reads at the j-th tick (counted from 1, the tick that first sees the clip) is `(j - 1) x G / (P x e)` -- the port's `t / (P x e)` at the
  driver's ticks, not a frame behind it. Reading, pending review (PAR-61's).
- *Not a cut.* A stance press under a one-shot is refused and kept pending (`FUN_00552ec0` D:L418927-418930;
  `FUN_00552d60` retries it, §1.1, §4.1) -- the flinch is not popped. The fire's gate `FUN_005a7de0`
  (D:L462594-462742) calls no pop (`FUN_005870e0`, `FUN_00589aa0`, `FUN_0058a4d0`). Only the three axes cut in the
  driver; the scope's path was not searched for a pop here. While `FUN_005af930`'s bit stands the axes are zero (above)
  and nothing cuts; the airborne end hold (D:L443049-443052) stays `FLINCH_INTERRUPT_READING`'s. *(PAR-65, §5.2.4:
  read -- a flinch pushed in the air is covered by the fall before any end test meets it.)*
- *What the others see.* The push is sent: `FUN_005a2690` sends kind 0xf with the motion's id (`FUN_00588ab0`
  D:L446015-446028 -> `FUN_002bbaf0` D:L160775-160799, Push Blend), and another console pushes the same flinch on its
  copy with the same flags (`FUN_005880e0` case 0xf, D:L445927-445928 -> `FUN_005a2390` D:L459735-459761, which sends nothing again for a
  remote controller). The cut sends nothing of its own: the pop is `FUN_005870e0` (D:L418203; body D:L445091-445251)
  and `FUN_00589aa0` (D:L446479-446731), neither of which calls a sender (`FUN_002bbaf0`, `FUN_00588ab0`,
  `FUN_00588b40`). After it the resumed ground state may push its own motion (`FUN_005870e0`'s state cases,
  D:L445163-445180 -> e.g. `FUN_00586570`'s `FUN_00588bc0(actor, 2, state, 0, 0)` at D:L444881), and a push with a
  fifth argument 0 is sent as Push Blend kind 0 (D:L446408-446416) when the motion's entry is network-logged
  (D:L160789-160790) -- the next motion, not the cut. The victim's stick does reach the others: the seal object carries
  the controller's three axes (research 193 §4.1, rows 11-13, STRONG). Whether the others' copy of the flinch is cut by
  them -- whether a remote-controlled SEAL's driver runs this cut on the replicated axes -- is **unread**
  (`FLINCH_CUT_REMOTE_READING`, §5.2.2): **the other pages' remote flinch keeps playing its clip to its end**
  (`V:remotePlayers.ts` `stepFlinch`), unchanged; not a change of this row. *(Corrected by §5.2.12, LATER 404, 2026-10-24:
  read -- the others' copy is cut by the victim's replicated stick, and built.)*
- *Built, room and page on one commit (PTW.R3).* `S:room.ts` `flinchCut`, from `watchCut` after each command ran: a
  command whose cut axes are past 0.1 (`reloadCutOf` on the room's mover), `FLINCH_CUT_COMMANDS` (5 as built: `ceil(2 x
  GAME_FRAME_DT x 60)`) or more past the latest push (`Player.flinchAt`, set by `flinchState`) and inside the window,
  ends the window there (`flinchUntil` = its seq): a reload named at it is taken, one before it dropped `'flinch'`. The
  `flinch` event, told at the hit, keeps the window as it stood then (the protocol unchanged). `V:walk.ts`: each tick's
  cut axes are logged by seq (`cutLog`, `flinchRan`); `setFlinchPose(pose, cut)` takes the room's window
  (`V:net/flinchReload.ts` `flinchCutWindow`: its start the latest push, a merged window's end less the clip's
  commands, `flinchCommands`), ends the page's flinch -- the pose and `flinching()`, the reload's gate -- on the same
  command from the page's own stick (`flinchCutAt`), and answers a cut among the commands already run when the event
  arrives (`flinchCutIn`); `V:netPage.ts`'s flinch case undoes a reload only inside the window so cut. An older room's
  event (no window) cuts nothing. Tests: `roomReloadLock.test.ts` (the stick held through the hit: the window ends on
  the fifth command past the push, a reload one before dropped, at it taken; a stick under 0.1 keeps it; the page's
  derivation over the room's own mover's axes gives the room's cut, so its undo keeps the reload the room took),
  `walk.test.ts` (the page's own flinch ends on that command; already cut on arrival; a still stick keeps it),
  `flinch.test.ts` (the netPage undo on the cut window; the helpers). RED and GREEN in PAR-60's report.
  *Since PAR-61 (issue #160 (closed)):* `FLINCH_CUT_COMMANDS` is 3, `ceil(GAME_FRAME_DT x 60)`; the tests above count from it.

#### 5.2.2 Readings (PAR-60)

| name | value | what it stands in for | what would settle it |
|---|---|---|---|
| `FLINCH_CUT_DELAY_READING` (`viewer/src/net/flinchReload.ts`) | `GAME_FRAME_DT` (0.0334 s; `FLINCH_CUT_COMMANDS` 3 on the 60 Hz commands, whole commands up). *Was* `2 x GAME_FRAME_DT` (0.0667 s; 5 commands) as PAR-60 built it -- the third driver tick; corrected by PAR-61 (issue #160 (closed)): the driver's peek (`FUN_0028c4f0(dt, top, 0)`, D:L418293) spends the skip on the first tick, so the second tick cuts (§5.2.1) | the push's place in the victim's frame: the second driver tick that sees the flinch, the first that can cut it (§5.2.1), falls one to two game frames after the push as the hit's handler lands before or after the victim's `FUN_00550ef0`; the earliest taken | a capture of a victim moving (or turning) through a non-lethal hit: the frame of the push (the top's action) and the frame it is popped (§7) |
| `FLINCH_AIR_REMOTE_READING` (*note only*; PAR-65, §5.2.4) | the others' copy plays the room's clip from the event, in the air too | whether a remote SEAL's copy, covered by the fall the victim sends (`FUN_0057e050` D:L440729-440737 -> `FUN_005880e0` D:L445795), is handed back at its landing -- whether that copy runs `FUN_005af930`'s landing branch (D:L466884-466911) | a read of the remote SEAL's driver (`CRemoteCtrl`) at a landing, or a two-console capture of a victim hit in a jump (the peer's top action per frame) |
| `REMOTE_CUT_STICK_READING` (*note only*, the gap of `viewer/src/remotePlayers.ts` `remoteCut`; LATER 404's review, 2026-10-24) | the remote cut reads the snapshot's ground stick (`cutStick`, `net/body.ts` from the mover's smoothed stick, 0 at rest) and `turnRate` | the original's copy reads the replicated raw pad axes (5.2.12), as the own page's cut reads its raw stick (`walk.ts`); the smoothed stick differs at a let-go at the hit (other pages may cut a tick where the victim's own plays on) and a push from rest (other pages cut 1-2 ticks late), and no `landedBare` rides the wire, so a remote may cut on a bare landing's tick (D:L466900-466901) | the raw stick on the wire (a protocol change), or a capture of a victim moving through a hit on a peer |
| `FLINCH_CUT_REMOTE_READING` (*note only*; `viewer/src/remotePlayers.ts` names it; **read 2026-10-24, 5.2.12: cut by the victim's replicated stick, as its own; built 2026-10-24, LATER 404 (`remotePlayers.ts` `stepFlinch`)**) | the others' copy plays to its one-shot end | whether another console's copy of the flinch (`FUN_005a2390`) is cut by the victim's replicated stick (research 193 §4.1 rows 11-13) in that console's own driver: no message is sent at the cut (§5.2.1) | a read of the remote SEAL's controller tick (`CRemoteCtrl` vtable `+0x10`) and `FUN_00551ec0`'s copy for it, or a two-console capture of the victim moving through a hit (the peer's top action per frame) |

*Review of PAR-60, 2026-10-12.* **F2, built:** off the floor the axes are all zero, the turn with the stick
(`FUN_005af930` D:L466805-466815), so the shared test `reloadCutOf` now takes the mover's `airborne` and cuts nothing in
the air -- for the flinch and for the still reload's clip alike (PAR-28's "held in the air"), in the room's `watchCut`,
the page's `walk.ts` `flinchRan`, `stillReloadLife.ts` and `play.ts` `reloadCut`. **F1, a known port gap under a degraded
network, not built:** the room asks the cut only of the commands it runs (`watchCut`, after each command's step). A
command lost past the gap wait (`GAP_WAIT`, `room.ts` `run`) or dropped with a backlog (`dropBacklog`) never reaches it,
while the victim's page ran it and logged its axes (`walk.ts` `cutLog`). If that command is the one that cuts, the
page's cut stands one or more commands before the room's; a reload the page sends between the two is begun on the
page, dropped `'flinch'` by the room, and not undone -- the `flinch` event, the undo's one occasion, has already
arrived. No original behaviour stands behind it (every command runs on the victim's own console); it appears only
on a lossy link. A fix would have the room tell the page a reload it dropped `'flinch'`
after the event (as the `stale` refusal does), a wire change outside this row.
**The landing tick's move axes (the fold's re-review N2; before PAR-60, not built):** on a landing with no landing
clip, `mover.ts` `land()` restores the ground state from before the take-off, so the move axes the cut reads on that
tick are the take-off's, where the original reads that tick's own stick (`FUN_005b4b40` D:L418155; bit 0x20 cleared
by `FUN_0059b440` on the landing, D:L456508, D:L456528). The room and the page read the same body, so they agree with
each other; against the original the landing tick's cut can differ. Owed: the landing tick's ground state taken from
its own stick (the mover's row, with its RED).
*Read and built, PARITY-2 PAR-62, 2026-10-12 (reading, pending review; source inspection of the game ELF's
decompilation, no game run):*
- *What `+0x240` / `+0x244` hold at the cut on the landing tick.* The two axes and the turn `+0x23c` are written each
  frame by `FUN_00551ec0` from the controller (D:L418613-418615, times the movement scale `+0x1368` at
  D:L418621-418623), under the same gate as the driver's (the `+0x105c` bit at D:L418531, as D:L418074). `FUN_005b4b40`
  (D:L418132, D:L418155) does **not** read the stick -- this corrects the N2 line above, which took it to: it only zeroes the two axes on a contact
  facing the body (D:L469598-469668, the zeroes at D:L469667-469668). On the landing tick `FUN_0059b440` clears bit 0x20
  (D:L456508, D:L456528), so `FUN_005af930` does not zero the three (D:L466811-466815); the landing (`FUN_005af590`)
  reads the two for its still test (D:L466680-466681) and copies them to `+0x248` / `+0x24c` (D:L466687-466688), writing
  neither. The ground state writes its ramped stick back into `+0x240` / `+0x244` (`FUN_00584c60` D:L444165-444166,
  D:L444176-444177), but it runs after the cut (`FUN_005870e0` from D:L418203 on). The order of the two vtable slots
  (`FUN_00551ec0` +0x14, `FUN_00550ef0` +0x18; research 251 §12.5) is not read. Either way the cut would read a copy of the
  pad's stick, this frame's or the last one's, and never the take-off's. The turn is read the same way.
- *But on a landing that plays no clip the cut is not asked.* `FUN_005af930`'s landing branch (D:L466868-466923) first
  sets the jump lock (D:L466889). Then, with the state and the top's `+0x2b` not 8 (D:L466890-466891), `+0xeac` 0 and a velocity whose square is 400 or more (D:L466893-466894),
  it pops the top once (`FUN_00589aa0`, D:L466900-466901), before `FUN_005af590` (D:L466910). With the square under 400
  it calls `FUN_0058a5e0(actor, 1, 1)` instead (D:L466897). With `+0xeac` 0, every clipless landing takes the pop branch: `FUN_005af590`
  plays no clip only when that velocity's square is over 400 and the stick is not at rest (D:L466677-466684), and the
  projection `FUN_00306fd0` (D:L466907) between the two tests writes `+0x2c`, leaving `+0x38` -- both tests read the
  same value. With `+0xeac` set no pop is made, `FUN_005af590` pushes no clip (D:L466691), the top is unchanged and the
  cut is asked as on any tick. The port does not model `+0xeac`: it takes every clipless landing as the pop's branch
  (`landedBare`); what `+0xeac` holds at a landing is not read here (PAR-62's review, F2). The pop changes the top: `Jump fall`
  (9) or the launch (8) gives way to the play under it (`FUN_0028da00`, D:L446515). So the top's action at D:L418176 is
  not the one read before the tick's work (D:L418116), and the cut's test (D:L418180-418185) is not made on that tick at
  all. The take-off's stick, the tick's own and the turn all cut nothing there. From the next tick the test reads that
  tick's axes on the top that was handed back.
- *The port before.* `land()` hands back the take-off's ground state for the pose (`ground_ = groundBefore`), and
  `reloadCutOf` read it with `airborne` false. So a body that took off at a full stick and landed at a stick under 0.1
  (past `FORWARD_DEAD`, so no soft landing) cut on the landing command, and a turn past 0.1 cut there too. A body that
  took off at rest and landed at a full stick did not cut on the landing command, and its next command cut (the stored
  stick taken on raw, `FUN_005af930`'s no-clip branch). That last case already matched the original.
- *The port's stored stick.* `state.stickForward` / `stickRight`, set by `land()` to the tick's clamped stick, is the
  original's `+0x240` / `+0x244` at that point. The mover does not model the movement scale, and `FUN_005b56c0`'s slope
  factor is not applied in the air, as it is not applied to `+0x240` before the cut. The cut does not need it on the
  landing tick, because it is not asked there.
- *Built, room and page on one commit (PTW.R3).* `V:mover.ts`: `landedBare` is set in `land()`'s no-clip branch and
  cleared at each `step60` and `place`. `Walker.cutAsked` is false in the air and on that tick. `PlaySnapshot.landedBare`
  is present only on that tick. `reloadCutOf`'s third argument is now `unasked`. Its four callers pass `!cutAsked`:
  `S:room.ts` `watchCut`, `V:walk.ts` `flinchRan` and `V:stillReloadLife.ts` `ran`. `V:play.ts` `reloadCut` passes
  `airborne || landedBare`. `ground_` stays the take-off's for the pose. *(PAR-66, below: the private flag is now
  `landedPop`, set on every landing; `PlaySnapshot.landedBare` keeps its name and is present on every landing tick.)*
- *The hold case.* A hold still keeps the ground state idle, so its stick reads 0. Every tick but the clipless landing's
  reads `ground_` as before. No hold is on the mover at a landing: the take-off ends it (`takeOff` -> `endHold`).
  *(Corrected by PAR-64, §5.2.3: under a one-shot top the original's `+0x240` is the pad's copy, not 0 --
  `FUN_00551ec0` copies it every frame before the driver; the cut no longer reads `ground_` at all.)*
- *Tests.* `roomReloadLock.test.ts` (PAR-62):
  - a flinch pushed on the floor, the fall over it, taken off at a full stick and landed at 0.05: no cut on the landing
    command, and the window runs to its end;
  - taken off at rest and landed at a full stick: cut on the next command;
  - the same landed turning: cut on the next command, not the landing's;
  - a standing still reload begun at rest and landed turning: the room's life and the page's `StillReloadLife` on the
    room's mover are cut on the command after the landing's.

  `walk.test.ts`: the page's own flinch in both directions, over the touch stick and the turn. `stillReloadLife.test.ts`:
  the walk's life and the layer's `reloadCut(moverSnapshot(...))`. RED and GREEN are in PAR-62's report. A still reload
  cannot take off at a stick past 0.1: the take-off from its hold reads idle. Its case is the reverse, and the turn.
- *Found, not built (for the controller):*
  - **The ramp.** On an ordinary floor tick the original's cut reads the copied pad stick (above), while the port's
    `ground_` carries the ramped stick (`throttleStep`; at `upper_z_accel` 5 a stick pushed from rest reads 0.083 on its
    first tick). So a push from rest cuts a flinch, or a still reload past its hold, a tick or two later in the port. The
    room's PAR-60 test says "the ramped stick passes 0.1". This is a row of its own: it moves PAR-60/61's counts.
    *Built by PAR-64 (§5.2.3), which reads the frame's order and moves no count PAR-60/61's tests pin.*
  - **A flinch pushed in the air** sits over the fall. The clipless landing's one pop (D:L466901) would take the flinch,
    not the fall. What then pops `Jump fall` is `CLIPLESS_LANDING_RELOAD_READING`'s unread part (research 251 §12.3). The
    port keeps the flinch's window to its clock or its stick cut.
    *Corrected by PAR-65 (§5.2.4; PAR-62's review was right): the flinch's push pops the stack to the stance's base
    first (`FUN_0058a4d0`, D:L460018), so it replaces the launch or the fall; the fall is pushed over it on the next
    driver tick still in the air, and the clipless landing's pop takes that fall and hands the flinch back.*

*Read and built, PARITY-2 PAR-66, 2026-10-12 (reading, pending review; source inspection of the game ELF's
decompilation, the action names from the ELF's strings as §5.2.4 reads them; no game run). It comes from PAR-62's review
(F1): a landing that plays a clip changes the top too.*
- *The order on the landing tick.* The driver reads the top's action at D:L418116, before the tick's work; it calls
  `FUN_005af930` at D:L418169 and reads the top again after it returns (D:L418171); the cut's test is made only when
  the two actions are the same (D:L418176), and then only on a top not looped (D:L418174) and not in state 8
  (D:L418181). The landing's whole work is inside D:L418169. `FUN_005af930`'s landing branch (D:L466868-466911: on the
  floor now, in the air before) first pops: with the velocity's square under 400, `FUN_0058a5e0(actor, 1, 1)`
  (D:L466897), which pops down to one play (D:L446796-446797); otherwise once, the stack deeper than one
  (`FUN_00589aa0`, D:L466900-466901). Then `FUN_005af590` (D:L466910), not attached (`+0xeac` 0) and with a clip
  chosen (D:L466661-466682), pops the stack to its base (`FUN_0058a4d0`, D:L466692; its loop D:L446762-446765) and
  pushes the landing clip (`FUN_00588bc0`, D:L466693). **So both pops and the push come before the second read and the
  cut's test, in the same driver tick**: the top's action at D:L418176 is the landing clip's, not the one read at
  D:L418116, and the cut (D:L418180-418185) is not asked -- nor the end test `FUN_00582540` (D:L418193), which sits
  under the same comparison. A blast knock's landing does the same through the knock branch (D:L466926-466941 ->
  `FUN_005804e0` D:L441955-441992 -> `FUN_005805b0`, which pops to the base at D:L442004 and pushes `Land forward`
  or `Land backwards`, D:L442020, D:L442034).
- *A landing whose clip does not change the top's action.* The landing pushes the action 10 (`Jump land`,
  D:L466682), 0xb (`Jump land hard`, D:L466674), `DAT_003deee8` (`Land forward`, D:L466664; the string 0x661fa8,
  D:L495332), `DAT_003dee00` or `DAT_003dedf0` (`Hit stomach01` 0x661d80, `Hit01` 0x661d60; D:L466667-466671,
  D:L495301, D:L495303). The top read before the tick, on a landing the port makes, is `Jump fall` (9) or the launch
  (8) -- the airborne branch pushes the fall over anything else on the first tick in the air (D:L466956-466970) -- or,
  hit on the last tick in the air, a flinch (`DAT_003dedc0`-`DAT_003dede8`, D:L495295-495300; §5.2.4). None of them
  is a landing action, so every clip landing the port makes changes the top's action. The same action could be
  re-pushed only with a landing clip on top in the air, which needs the fall's push skipped: the airborne branch skips it
  for `Land forward` (D:L466823), and a `Land forward` pushed by the landing is in state 8 (D:L466663), which the landing
  branch refuses (D:L466890-466891) and the cut refuses (D:L418181). Even then the re-pushed play would start at
  phase 0 (`FUN_0028cea0` D:L134538), which `FUN_00587c20` does not let a forward play cut (D:L445550-445556). **No
  landing class that the port makes keeps the cut.** Two branches change nothing, and the port reaches neither: with a
  carry partner (`+0xeac` set) nothing is popped or pushed (D:L466893, D:L466691), as PAR-62 found (its review's F2);
  and the knock's third sub-branch (D:L466942-466952: `+0x1364` not 0 and the `+0x4` of the record at `+0x2e8` over
  4.0) pushes no landing and leaves the knock's fall on top, its play's `+0x18` set to 3.0. The port plays `Land
  forward` / `Land backwards` at every knocked landing (`mover.ts` `land`); what `+0x1364` and that record hold at a
  knocked landing is not read here (found, not built, below). `FUN_005af590`'s first test, `DAT_004365e8 <= 0`
  (D:L466654), is not read either; when it fails no clip is pushed, but the branch's pop has already changed the top.
  *More branches that leave the top unchanged (PAR-66's review, F1), none of which the port reaches as built:*
  `FUN_005804e0` pushes nothing when the virtual at `+0xc0` / `+0x34` answers nonzero (D:L441966-441972), the knock's
  fall left on top -- what that virtual answers is not read; state 9 with `+0xe1` bit 4 clear (D:L466871-466877) and
  state 10 (D:L466879) skip the landing branch. Found, not built: the port's knocked landing always plays its clip.
- *The covered still clip, and the order.* A still reload's clip covered by the fall (research 251 §12.3) lies under
  `Jump fall`. At a clip landing the first pop takes the fall (and under 400 everything down to one play), and
  `FUN_0058a4d0` takes everything over the stance's base, the covered clip with it, before the push. The lock
  (`FUN_005a7ab0`) then finds no reload type on top or in the stack (D:L462526-462544), the kit's timer is 0 since the
  clip's push (D:L476550-476560), and the second channel holds no moving reload (a still clip is on the stack), so
  **the lock ends on the landing's tick** (R251.12, the port's `landingPops`). The cut, were it asked, could not come
  before the pop: its test reads the top only after `FUN_005af930` returns, and then the top is the landing clip, never
  the covered one. No carried overlay starts either: that hand-off is the cut's (D:L418204-418210), and only when the
  action read before the tick is a still reload (D:L418205), while at a landing that action is the fall.
- *The port before.* `land()` set `landedBare` only in its no-clip branch, so on a clip landing `cutAsked` was true and
  the stick and the turn were asked of the still clip on the landing's command.
  The room's `watchCut` runs before `run`'s landing check, so a still reload covered by the fall, landed softly at rest
  while turning, was cut there: `cutAt` ended its lock `ceil(left)` commands later (the carried overlay's), and
  `endStillReload` then found no life and left that lock. The page did the same (`StillReloadLife.ran` before
  `onStackPop('landing')`, whose `reloadPopped` found no life). Both agreed with each other and ended the lock late.
- *Built (PTW.R3: one flag, read by the room and the page).* `V:mover.ts`: the private flag, renamed `landedPop`, is set
  in `land()` on every landing, before the clip's `start` and the no-clip branch, and still cleared at each `step60` and
  `place`; `Walker.cutAsked` is false on that tick. `PlaySnapshot.landedBare` keeps PAR-62's name (`V:play.ts` reads
  it) and is now present on every landing tick. The landing's pose and clip are unchanged. Nothing else changed: the
  room's `watchCut`, the page's `flinchRan` and `StillReloadLife.ran`, and `play.ts` `reloadCut` already read the flag.
  The flinch's hand-back reads the landing's own `clip` (`flinchLanding`, `flinchRan`'s `bare`), not `cutAsked`, so a
  flinch is still popped by a clip landing (§5.2.4). A knocked landing now asks no cut either; the knock has already
  ended any reload (R251.12) and a flinch is refused under a knock fall (D:L459887), so nothing changes there.
- *Tests.* `roomReloadLock.test.ts` (PAR-66): a standing still reload covered by the fall, landed at rest while turning
  past 0.1 (`Jump land`) -- the room's lock ends at the landing's command, its life gone, and the page's life on the
  room's mover is alive for the landing's pop (`reloadPopped` true, `'cancelled'`). `stillReloadLife.test.ts`: the
  walker's own, where the walk's life is not cut on the landing tick, the layer's `reloadCut(moverSnapshot(...))` asks
  no cut, the landing's pop ends the life, and the next tick asks again. RED and GREEN are in PAR-66's report.
- *Found, not built (for the controller):*
  - **The knock's landing without a push** (D:L466942-466952, above): the port's knocked landing always plays its clip.
    That branch is a knock row of its own; it moves nothing of the reload or the flinch, which the knock has already
    ended or refused.
  - **The flag's name.** `PlaySnapshot.landedBare` and the comments in `S:room.ts` `watchCut`, `V:walk.ts` `flinchRan`,
    `V:play.ts` `reloadCut`, `V:reloadLock.ts` (`reloadCutOf`'s doc) and `V:stillReloadLife.ts` (`ran`'s doc) still
    say "a bare landing" / "a landing that plays no clip". The behaviour they describe is now every landing. Those files
    were outside this row's brief; a rename is a row of its own.

#### 5.2.3 The stick the cut reads (PARITY-2 PAR-64, 2026-10-12): reading, pending review

Source inspection of the decompilation; the game ELF's bytes (the SHA256 the header pins, read at
`game/disc/socom2_game.elf`) for the scheduler's task names, the `motion.rdr` key `NoTurn` and four virtual-table
words; `motion.rdr` through the repository's reader (`parseRdr` over the tracked `READERC.ZAR`). No game run; nothing
here is measured. It answers PAR-62's "Found, not built: the ramp" (§5.2.2) and corrects `reloadCutOf`'s doc and
§5.2.2's "*The hold case.*" (marked there).

- *The frame's order: read.* The world's state registers the entity passes on its scheduler `0x49e260` as tasks with
  a priority (`FUN_001ec480` D:L50920-50935): `entity_pre_tick` 1.0 (`FUN_0029f510`, D:L50922), `entity_tick` 4.6
  (`FUN_0029f430`, D:L50925), `entity_preposttick` 4.7 (`FUN_0029f350`, D:L50927), `entity_post_tick` 6.0
  (`FUN_0029f1a0`, D:L50929) -- the names the ELF's strings at 0x3e1f10, 0x3e1f98, 0x3e1fd0, 0x3e1f80. `FUN_0034e6b0`
  joins a task before the first of a greater priority (D:L248794-248846; research 106 §2) and `FUN_0034e070` walks the
  list in that order once a frame (D:L248531-248567, from the state tick at D:L50801). Each pass calls one slot of every
  object on the list `DAT_004362e8` (research 225 reads it for the player's actor): +0x14 (`FUN_0029f510`,
  D:L145113-145126), +0x18 (`FUN_0029f430`, D:L145096-145108), +0x1c (`FUN_0029f350`), +0x20 then +0x24 and +0x10
  (`FUN_0029f1a0`, D:L145055-145074). The SEAL's table (0x6691a0, `CZSealBody`; research 194 A09) holds `FUN_00551ec0`
  at +0x14, `FUN_00550ef0` at +0x18 and `FUN_005506a0` at +0x20 (the ELF's words at 0x6691b4, 0x6691b8, 0x6691c0;
  research 251 §12.5). **So every frame the pad's copy (`FUN_00551ec0`) runs before the ground driver (`FUN_00550ef0`),
  and the actor update (`FUN_005506a0`) after both** -- the order research 251 §12.5 and §5.2.2 left unread.
- *What the copy writes.* `FUN_00551ec0` asks the controller's tick (its slot +0xc, D:L418526), keeps its answer in the
  actor's `+0x105c` bit 0x40 (D:L418527) -- the bit the driver asks first (D:L418074) -- and under it (D:L418531)
  copies the controller's turn `+0x10` and move axes `+0x8` / `+0xc` into `+0x23c`, `+0x240`, `+0x244`
  (D:L418613-418615), all three times the movement scale `+0x1368` when the controller's slot +0x2c answers
  (D:L418616-418623). The player's controller (`CSealCtrl`, vtable 0x6694b0; research 191) answers 1 there: its +0x2c
  word is 0x5431f0, `jr ra; addiu v0,zero,1` in the ELF's bytes. The controller's tick `FUN_00594cf0` stores those three
  from the pad in the same pass: `FUN_005966a0` (from D:L453175) stores the move axes (D:L453852-453863) after the
  scope's 0.2 (D:L453818-453821), and the turn (D:L453858) after its gain and zoom (research 83). The left stick has no
  ramp (research 83's pad table).
- *Where it is zeroed.* Then `FUN_00551ec0` zeroes in listed cases: all three dead over 4 s (`+0xf7c`, the death's
  clock, added at D:L410537 in `FUN_00543f70`; D:L418625-418628); all three on the top's state 8, a turret held
  (`+0xeb8`), the stun bit `+0x1060` 0x10 (never set, research 179 §8.5), state 6, or the motions `DAT_003deea0` /
  `DAT_003deeb0` (D:L418606-418607, D:L418646-418652); the turn and `+0x244` with a carry partner (`+0xeac`,
  D:L418654-418658); all three on the motion `DAT_003deae0` (D:L418660, D:L418692-418694); the turn and `+0x244` in
  state 5, a top in state 5, or the motions 0x2e, `DAT_003def40`, `DAT_003def50`, `DAT_003def60` (D:L418662-418685);
  `+0x244` in states 9 and 10 (D:L418696-418697); and the turn alone when the top's last node carries `NoTurn`
  (`FUN_00587e00` D:L445581-445592 reads the motion's `+0x4a` bit 7, which the loader clears on `NoTurn`, the key at
  0x3ef9a8, D:L131355-131360; D:L418699-418702) -- research 83's row: the climbs, ladders, hangs, restraints and
  switches. `motion.rdr` (through the reader): 31 records carry `NoTurn`; none of the six flinches, nor any of the
  eighteen reload and pump clips.
- *Nothing else writes them before the cut.* The decompilation's writers of `+0x240` are this copy, the constructor
  (D:L419861) and the ground states (`FUN_00584c60` D:L444166, D:L444177; `FUN_00586570` D:L444869), which run after the
  cut (`FUN_005870e0` from D:L418203 on); D:L452978-452984 and D:L454829 write the controller's own fields. Before the
  cut the driver itself only zeroes the two move axes on a contact facing the body (`FUN_005b4b40`, §5.2.2) and all
  three in the air (`FUN_005af930`, §5.2.1).
- *So, at the cut's test (D:L418182-418185):*
  - **a still reload or a flinch on top** (no ground state this frame): the pad's stick and turn, copied this frame,
    times the scale -- not 0;
  - **the run**: the same. The ground state's ramped stick (`FUN_00586c10`, written back at D:L444165-444166 /
    D:L444176-444177) is overwritten by the next frame's copy before that frame's cut; it lives on only as the ramp's
    last value in `+0x248` / `+0x24c` (`FUN_0057a330`);
  - **the tick a push from rest begins**: the push itself -- a full push 1.0, not the ramp's first step (0.083 at
    `upper_z_accel` 5): it cuts on that tick.
- *The movement scale `+0x1368`.* 1 from the constructor (D:L419814); written after only by `FUN_00553dc0`, kept within
  [0, 1] (D:L419376-419385), from the controller's tick online (`DAT_0045a0c1`, D:L453106-453124): 1, unless a
  counter on the network object (`FUN_0030be80(0x45a0c0)`, D:L453108; what `FUN_0030d550` counts is not read here)
  runs past 1500, when it is `(5000 - (counter - 1500)) x 0.001` clamped by `FUN_00539b70` (D:L404121-404135) to the
  ELF's 0.0 and 1.0 at 0x650640 / 0x650648 (D:L453115-453117): 1 up to 5500, falling to 0 at 6500. No stance, wound or
  load-out. The port does not model it (no network stall slows a SEAL), so the cut reads the stick at scale 1; it is
  owed with the stall it belongs to, not here.
- *The turn.* `+0x23c` is the controller's turn axis after its gain and the scope (research 83: at most 1.118); the
  driver turns the body at `turn_maxrate` x it (D:L418340). The port's `turn` is that rate in radians a second, so
  `turn / turn_maxrate` is `+0x23c`: `reloadCutOf`'s turn term stands.
- *Built, room and page on one commit (PTW.R3).* `V:mover.ts`: `Walker.cutStick`, the tick's stick as the cut reads it
  -- the command's, clamped to +-1 and with the scope's 0.2 (`step60`'s input), before the slope's and the water's
  factor (`FUN_005b56c0`, which runs inside the ground state, D:L444163, D:L444173, D:L444865, after the cut), no ramp;
  the mover's own cuts read it too (`interrupted`, `holdCut`, the dance's), where they read the stick after the slope's
  and water's factor before -- so the hold's cut and the room's life agree on a slope or in water; `place` clears it.
  `reloadCutOf(stick, turnRate, unasked)` takes it; its callers `S:room.ts` `watchCut`, `V:walk.ts` `flinchRan`,
  `V:stillReloadLife.ts` `ran` and `V:play.ts` `reloadCut` (by `PlaySnapshot.cutStick`, which `moverSnapshot` sets; a
  remote body's snapshot has none and is not asked). Kept: PAR-62's `cutAsked`, PAR-60's airborne zero,
  `FLINCH_CUT_DELAY_READING` and `RELOAD_CUT_DELAY_READING`.
- *Counts.* None that PAR-60/61's tests pin moves: their sticks are held from before the floor (`FLINCH_CUT_COMMANDS`
  3; the standing reload cut on tick 5, 68 commands left). Moved with the read: `stillReloadLife.test.ts`'s WalkMode
  jump case, whose "no cut yet" now reads the cut stick, not the ramp; two comments in `roomReloadLock.test.ts` (PF-18's
  first case, PAR-60's undo case) that said "the ramped stick passes 0.1".
- *Tests.* `roomReloadLock.test.ts` (PAR-64): a full stick pushed from rest cuts the flinch, and a standing still
  reload past its floor, on the push's own command (the overlay's life from that phase); a crouched still reload's hold
  under its `NoInterrupt`, the stick held from a hit: the flinch cut `FLINCH_CUT_COMMANDS` past its push, the hold and
  the reload's life left. `walk.test.ts`: the page's own flinch, pushed from rest and through a kit hold.
  `stillReloadLife.test.ts`: the walk's life and the layer's snapshot, pushed from rest. RED and GREEN in PAR-64's
  report.
- *Found, not built (for the controller):*
  - **The kit's push in the frame.** For the player `FUN_005a82e0` is reached only from the kit's frame `FUN_005c0fd0`
    (through `FUN_005c2a90` / `FUN_005c3000` at its timer's end, D:L476550-476558, and D:L476622), which the actor
    update calls (D:L417907): `entity_post_tick`, after the driver's pass (above). So the first driver tick that sees a
    still reload's clip is the next frame's, and the second -- the first that can cut it (§5.2.1's correction) -- two
    game frames after the push, reading the phase `G / (P x e)` where the port's clock from the push reads
    `2G / (P x e)`. `RELOAD_CUT_DELAY_READING` took the earliest of one to two frames; the read gives two, with the
    clip's phase one frame behind the push's clock (the lag research 251 §12.5 superseded, back by another road). It
    moves PAR-61's counts, `reloadPhase` and the mover's hold clock: a row of its own. `FUN_005c2a90`'s two other
    callers (`FUN_005fe880` D:L510425, `FUN_00608840` D:L515060) are outside the kit's frame and not read here. The
    flinch's push (the hit's handler, research 193 §2.4) is not placed by this: `FLINCH_CUT_DELAY_READING` stands.
    *Read whole and built by PAR-67 (research 251 §12.5, "PAR-67: the push lands after the driver"; reading, pending
    review):* nothing advances the play after the push in its frame (`FUN_0028c4f0`'s only calls are the driver's,
    D:L418293, D:L438874, D:L438901 from D:L418454), so the j-th driver tick reads `(t - G) / (P x e)` for `t` seconds
    after the push; `RELOAD_CUT_DELAY_READING` is two game frames (the fifth command), `reloadCutPhase` the lagged phase
    for the cut and the carried overlay, and the mover's reload holds cut on it (`RELOAD_PUSH_LAG`) -- their clock
    already starts at the push (the hold rides the command after the reload's), so the hold and the life stay on one
    command. The two other callers are a controller's tick, in `entity_pre_tick` before the driver: `FUN_005fe880` is
    `CSealCtrlSquirm`'s (+0xc of the table at 0x6699f0) and `FUN_00608840` the AI state `CAiSReload`'s +0x14, run from
    `CSealCtrlAi`'s tick `FUN_0056de10` (D:L432253, D:L432513 -> `FUN_005f55e0` D:L505344 -> `FUN_005f8030` D:L506903),
    which `FUN_00551ec0` calls at D:L418526 -- one game frame, PAR-61's count, for those; not built (the room runs the
    player's reload only). Found there, not built: the uncut end lags the same way (`FUN_00582540` D:L418193).
    *Read and built by PAR-69 (research 251 §12.5, "PAR-69: the uncut end lags too"; reading, pending review):* the end
    test (`FUN_0028c6e0` D:L134291-134302) adds half a frame's step at the clip's own playback to the lagged phase, so a
    still reload's clip -- its life, the jump's refusal and the crouched and prone holds -- comes off a command past its
    last key where it has no `ReloadTime` (`seal_reload` the 93rd command from the push, was the 92nd).
  - **Traversal.** While a traversal driver has the tick (`Walker.driver`: a ladder, a climb, a hang) `cutStick` is the
    command's stick; the original zeroes in its traversal states as listed above. Which of the port's traversals are
    the states 5, 6, 9, 10 or the motions above is not mapped here.
  - **The scale** (above): owed with a network stall.

#### 5.2.4 A flinch pushed in the air, at the landing (PARITY-2 PAR-65, 2026-10-12): reading, pending review

Source inspection of the game ELF's decompilation; the action names read from the game ELF's strings (the addresses
`FUN_005e4f90` is called with, D:L495203-495345); `motion.rdr` through the repository's reader (`motionTableFromArchive`
over the tracked `READERC.ZAR`). No game run; nothing here is measured. It settles PAR-62's "Found, not built: a flinch
pushed in the air" (§5.2.2, corrected there) and the airborne half of `FLINCH_INTERRUPT_READING` (research 101, 218).

- *`FUN_005a2690`'s gates against an airborne victim: none refuses.* A non-lethal hit reaches it with `param_3` the
  actor's state `+0x174` (`FUN_005a54d0` D:L461403-461405; `FUN_0058a720(actor, 0)` returns `+0x174`, D:L446840-446842).
  The states it refuses are 5, 8, 9 and 10 (D:L459890, D:L459896, D:L459925, D:L460008-460009, D:L460015) -- the
  ladder, the dead, the carrying and the carried (research 203's `SEAL_STATE`) -- not 6, `stateInAir` (research 201
  §9), nor the stance: the take-off's and the walk-off's pushes write the play's `+0x2b` (`FUN_0028dc90` D:L135204; the
  launch's 6 at D:L440820, the fall's `+0x174` at D:L440726), and `+0x174` is written from a play only at a pop
  (`FUN_0028da00` D:L135104). The motions it refuses -- `Fall forward` / `Fall backwards` (`FUN_00588030`, D:L459887),
  `Stab`, `CQB attack`, `Apply restraints`, `Receive restraints`, `Stabbed`, `Death stand head01` / `head03`
  (D:L459908-459936), the long hits `Hit stomach01`, `Hit shoulder`, `Hit01` (D:L460006-460008), the swaps
  (`FUN_005a7980`, D:L460005) -- are none of the jump's: the ELF's strings at 0x660758, 0x661f88, 0x6609a0, 0x661d88,
  0x660890, 0x6608b0, 0x6609b8, 0x661be0, 0x661dc0, 0x661d60, 0x661d70, 0x661d80. The top's looped bit (D:L460011):
  `Jump launch`'s `seal_runningjump_launch` and `Jump fall`'s `seal_runningjump_in_air` (research 80 §1) are both
  `looped 0` in `motion.rdr`, so the push branch (D:L460012-460026) is taken, not the 0x40 one. Its last tests -- the
  alive bit, the top's `+0x2b` not 8 (the launch's 6, the fall's the state), the state not 8, no turret `+0xeb8`
  (D:L460013-460017) -- pass. Inside the push `FUN_00589900` (D:L446072) refuses only on the dead body's `+0x1061` bit
  0x20 online (set at D:L410535, the death's path), the knock-downs' falls and landings under `+0x1060` 0x10, a top in
  state 8, and `Slide` (0x661508) -- none of them. The gate never reads the airborne hold `+0x1061` 0x2. **A flinch is accepted in the air.**
- *Over the fall, or in its place: in its place.* Before the push the gate calls `FUN_0058a4d0(actor, 0)` (D:L460018),
  which pops while the stack holds more than one play and the current action is not `Stand`, `Crouch` or `Prone`
  (1, 0x12, 0x1a; D:L446762-446765): the launch or the fall goes, down to the stance's base. `FUN_00588bc0` then pushes
  the flinch (D:L460019): its action is none of the kinds that pop (D:L446105-446291), so it links over that base
  (D:L446292) and is the current action (`+0x534`, D:L446298-446299). **The flinch replaces the action** -- PAR-62's
  review was right and PAR-62's "sits over the fall" was not (§5.2.2, corrected there). The others' copy does the same
  (`FUN_005a2390` D:L459751-459752).
- *The stack after it, still in the air.* On the next driver tick `FUN_005af930` (D:L418169) runs before the cut and the
  end test. In the air (`+0x105e` bit 0x20, set at D:L466806 and left by the ground pick), alive (`+0x1044`, the overall
  health whose fall makes the flinch, D:L461374, D:L461397), with no carry and the current action -- the flinch -- none
  of the set at D:L466816-466828 (8, 9, the knock-downs' falls and landings, `Climb over` 0x661968, `Ladderslide`
  0x6620c8, `Ladder -> slide` 0x6620a0, `Rifle m203 reload` 0x661840), its airborne branch (D:L466956-466975) finds the
  current action neither 9 nor `dive_to_prone` (0x661fe8) and the state not 9, 10 or 3, and asks `FUN_0057e130`
  (D:L466967), which for the player's own controller asks `FUN_00589900` (D:L440760-440761) -- yes -- so `FUN_0057e050`
  pushes `Jump fall` over the flinch (D:L440726), sets the airborne hold `+0x1061` 0x2 (D:L440727) and, online, sends it
  (kind 0x22 case 3, D:L440732-440738; the others push the fall over their copy, `FUN_005880e0` D:L445795). The stack
  is the base, the flinch, the fall: the flinch is covered at phase 0 -- only the top advances (`FUN_0057a330` D:L438874,
  D:L438901; §3.3's review). The top's action changed over that tick (D:L418116 against D:L418176), so neither the cut
  nor the end is asked on it; from the next the fall's end meets the airborne hold (D:L443049-443052) and pops nothing,
  and the axes are zero in the air (D:L466811-466815). The flinch's refusals ride its own play's `+0x28`
  (D:L460021-460024) and their readers read the top (§5.2 item 3): under the fall they are lifted -- but the reload is
  refused in the air on its own (`FUN_005c2a90` D:L477395, `+0x105e` bit 0x20; `FUN_005b4340(actor, 3)`
  D:L469506-469511), as the room's `reload` and the page's `Fire.reload` refuse it first.
- *The clipless landing with the flinch under the fall.* On the landing tick the ground pick clears bit 0x20
  (`FUN_0059b440` D:L456508, D:L456528, called at D:L466809) and the airborne hold (`FUN_0059ad30` D:L456319; PAR-65's
  review corrected the citation), and `FUN_005af930`'s landing branch (D:L466884-466911; the current
  action the fall) pops the top once (`FUN_00589aa0`, D:L466900-466901, the stack deeper than one): the fall goes and
  `FUN_0028da00` hands back the play under it -- the flinch -- writing `+0x174` from its `+0x2b` (D:L135104) and, the fall
  not looped, setting the flinch's initial skip again (D:L135105-135107). `FUN_005af590` then plays no clip
  (D:L466684-466690). From the landing tick the flinch is the top at phase 0 with its skip set: that tick's peek and
  advance (D:L418293, D:L418454) treat it as a fresh push's first driver tick does, so it plays its whole clip from the
  landing's command -- its end `T x ((n - 1)/n)^2` from there -- and the stick's cut, not asked on the landing's tick
  (§5.2.2, PAR-62), first lets on the second driver tick that sees it (§5.2.1): `FLINCH_CUT_COMMANDS` past the landing's
  command, the earliest case `FLINCH_CUT_DELAY_READING` takes for a push. Its refusals are on the top again from the
  landing: a reload is refused through the whole clip from there.
- *When the fall is not over it yet, or the landing has a clip.* A landing on the push's own first driver tick (the
  hit on the last tick in the air) finds the flinch on top: the one pop (D:L466901) takes the flinch itself. A landing
  that plays a clip pops the stack to its base -- `FUN_0058a5e0(actor, 1, 1)` under 400 (D:L466897), `FUN_0058a4d0` in
  `FUN_005af590` (D:L466691-466693) -- the flinch with it. A climb's or a ladder's start ending the flight pops the stack
  (`FUN_00580b70` D:L442186-442214; research 251 R251.12). In each the flinch ends at that command.
- *What pops `Jump fall` at a clipless landing* (`CLIPLESS_LANDING_RELOAD_READING`'s open part, research 251 §7): the
  same one pop (D:L466900-466901) when the fall is the top -- so a still reload's clip the fall covers is handed back,
  not popped: the reading's `'kept'` is now read. Its covered clock (the phase kept through the flight) stays that
  row's.
- *Where it meets PAR-66.* PAR-66's row is the cut on a landing tick that plays a clip; a flinch pushed in the air is
  popped by such a landing (above), so nothing of it is left to cut there. The port tells the clipless landing by the
  landing's own `clip` (a new `Landing` with `clip` null), not by `Walker.cutAsked`, so PAR-66's change to `cutAsked`
  leaves this alone. *(Built by PAR-66, §5.2.2: `cutAsked` false on every landing.)*
- *Built, room and page on one commit (PTW.R3).* `V:net/flinchReload.ts` `flinchLanded(w, seq, bare)`: handed back
  whole -- `{ start: seq, until: seq + (until - start) }` -- at a landing with no clip past the push's first command,
  else popped (`until` at most `seq`). `S:room.ts`: `Player.flinchAir`, set by `flinchState` from the mover at the hit;
  `flinchLanding`, from `watchCut` before `flinchCut`, at the command the body is back on the floor (`bare`: a new
  landing -- `Player.lastLanding` not yet taken by `run` -- with no clip) moves `flinchAt` and `flinchUntil`; cleared at a
  death and a spawn. The `flinch` event is unchanged (told at the hit, the window as it stands then). `V:walk.ts`: the
  command log (`cutLog`) carries each command's `air` and `bare`; `setFlinchPose` reads the body after the command
  before the window's start (the walker's own when that is the last command run, as the room reads it at the hit) and,
  pushed in the air, covers the flinch -- its pose not drawn, its window as told -- until `flinchDown` at the body's
  return: handed back, `flinching()` is the window on the commands (`taps < until`) and the stick's cut counts from the
  landing; popped, it ends. An event arriving after that command answers the window's end the page's commands give (the
  cut's command, the landing's plus the clip, or the landing's own), which `V:netPage.ts`'s undo already reads as the
  window's end (unchanged). Tests: `roomReloadLock.test.ts` (PAR-65: landed at 0.05, the window from the landing's
  command and a reload at its last command dropped `'flinch'`; at a full stick, cut `FLINCH_CUT_COMMANDS` past the
  landing, and the page's derivation over the room's mover on the same command; released to `Jump land`, popped there;
  the hit on the last command in the air, popped by the landing), `walk.test.ts` (the page's own: not drawn in the air,
  handed back and cut from the landing, popped by `Jump land`; the event after the landing), `flinch.test.ts`
  (`flinchLanded`; the undo reading the walk's answer). RED and GREEN in PAR-65's report.
- *Not built (named):*
  - **The others' pages** (`FLINCH_AIR_REMOTE_READING`, *note only*, §5.2.2): the copy is covered by the fall the victim
    sends (above), but whether a remote SEAL's copy runs `FUN_005af930`'s landing branch -- and so hands the flinch back
    at its landing -- is unread; `V:remotePlayers.ts` plays the room's clip from the event as before.
  - **The page's pose clock at the hand-back.** The page's flinch pose runs on the event's arrival clock
    (`FLINCH_LAYER_PLACEHOLDER`, 'from the event': the closure `V:netPage.ts` hands the walk); handed back, the walk
    draws that closure, so the clip is not restarted at the landing. Restarting it needs the closure to take a clock from
    the walk -- a change to `netPage.ts`'s flinch case, which PAR-65's brief keeps out while the event is unchanged. The
    reload's gate (`flinching()`) is on the commands, the room's.
- *Found, not built (for the controller):*
  - **A flinch pushed on the floor, then the walk-off.** The same airborne branch pushes the fall over a flinch already
    on top (D:L466956-466970: the current action neither 8 nor 9), so it is covered at the phase it has reached, and the
    clipless landing hands it back with a new skip (D:L135105-135107) to play its rest; a landing with a clip pops it.
    The port runs that flinch's window on its own clock through the flight (PAR-62's case, "the window runs to its
    end"): the flinch's half of `CLIPLESS_LANDING_RELOAD_READING`'s covered clock -- a row of its own, moving PAR-62's
    pinned case. *Read and built by PAR-71 (below).*
  - **§3.3 item 4** ("no fall play is pushed over the place play") holds only if the climb's state is 9, 10 or 3, which
    `FUN_005af930` sends to `FUN_0057dfe0` instead (D:L466959-466964); not read here.

*Read and built, PARITY-2 PAR-71, 2026-10-13 (reading, pending review; source inspection of the game ELF's
decompilation; no game run, nothing measured).* A flinch pushed on the floor, then carried off a ledge by a walk.
- *The phase while covered: kept.* On the first driver tick that finds the body in the air, `FUN_005af930` (called at
  D:L418169) takes its airborne branch with the flinch the current action -- none of the set at D:L466816-466828, not 9
  (D:L466957), the state not 9, 10 or 3 (D:L466959-466960) -- and `FUN_0057e050` pushes `Jump fall` over it (D:L440726),
  as for a flinch pushed in the air (above). That is before the tick's advance (`FUN_0057a330`, D:L418454), which reads
  the top (D:L438708) and advances only it (`FUN_0028c4f0`'s only callers are the driver's peek D:L418293 and the
  advance's D:L438874, D:L438901; §5.2.3, PAR-67): the flinch's phase `+0x1c` stops at what the ticks on the floor gave
  it. The fall's push writes nothing of the play under it but its root-motion fields (`FUN_0028dc90` D:L135141-135148;
  the phase is copied only from a looped play to a looped one, D:L135139-135140, D:L135205-135207, and the flinch and
  the fall are one-shots). Nothing pops the fall in the air (its end meets the airborne hold, D:L443049-443052), and
  neither the cut nor the end test is asked of a covered flinch: both sit under the top's action read before and after
  the tick's work (D:L418116, D:L418176), and the top is the fall. So the port's window, on the commands, stops on the
  first command whose body is in the air; the flinch's end cannot come in the air. The port's take-off command stands
  for that tick, as its landing command stands for the landing's (PAR-62), and the cover is asked only inside the
  window: the window's end is the command the end test popped it at (`flinchCommands`), so a take-off on that command
  finds nothing to cover. *Corrected by PAR-71's review (F1): on that command's tick the cover (D:L418169) runs before
  the end test (D:L418193), which the changed top then skips (D:L418176), so the flinch is covered unpopped there -- the
  cover is asked through the window's end command (`seq <= until`), and only one past it finds nothing.*
- *The hand-back's fresh skip: it resumes, it does not restart.* The clipless landing's one pop (`FUN_00589aa0`
  D:L466900-466901) calls `FUN_0028da00`, which keeps the popped play's looped bit and phase (D:L135046-135047), writes
  `+0x174` from the play under it (D:L135104) and, the popped fall not looped, sets that play's skip bit 8
  (D:L135105-135107) -- its phase untouched (only a looped pair takes the popped phase, D:L135109-135110). The skip
  holds one advance at 0 (`FUN_0028c4f0` D:L134241), and the driver's peek clears it whatever its third argument
  (D:L134257) before the same tick's advance (D:L418293 before D:L418454), as on a push's first tick (§5.2.1). So the
  flinch plays on from its kept phase from the landing's tick: the skip neither restarts the clip nor holds the
  landing's tick.
- *Where its end falls.* The clip's end test (`FUN_00582540` D:L418193 on `FUN_0028c6e0`) runs on the kept phase plus
  the ticks from the landing's: on the port's commands, the end the hit set less the commands run on the floor, counted
  from the landing's command -- `until' = landed + (until - air)`, `air` the first command in the air. A flight that
  outlasts the hit's window hands back the commands left at the take-off; PAR-65's case is `air` the push's own first
  command (the whole clip). *PAR-71's review (F1): covered on the end's own command (`air` = `until`) none are left, but
  the landing's tick asks no end test (D:L418193 under D:L418176), so the flinch is on top for the landing's command and
  the end, asked each command on the one-shot clock (PAR-58), pops it on the next: `until' = landed + max(1, until -
  air)` -- its refusal back for the landing's command alone.*
- *Its stick's cut after the landing.* Not on the landing's tick (the top changed over it, D:L418116 against D:L418176;
  PAR-62, PAR-66). The next driver tick asks it, and `FUN_00587c20` lets it -- the phase past 0 (the floor's ticks and
  the landing tick's advance; no `NoInterrupt` on the six flinches, §5.2.1) -- one game frame after the landing's tick.
  On the commands, as `FLINCH_CUT_DELAY_READING` counts a frame from a tick that cannot cut: `FLINCH_CUT_COMMANDS` past
  the landing's command (`flinchCutAt` from it), as for a flinch pushed in the air. *This moves PAR-62's pinned case*:
  its flinch, hit on the floor with the lift before its first command, is covered at phase 0 and handed back whole, so
  its window is the whole clip from the landing (was: the hit's own clock) and the turn cuts it `FLINCH_CUT_COMMANDS`
  past the landing (was: on the next command). Both tests say so beside their cases.
- *What is refused while covered.* The reload's refusal rides the flinch's own play (`+0x28` 0x4, D:L460021-460024) and
  its reader reads the top (§5.2 item 3): under the fall it is lifted. The reload is refused in the air on its own
  (`FUN_005c2a90` D:L477395, `+0x105e` bit 0x20), as the room's `reload` (the frame's `airborne` before the window) and
  the page's `Fire.reload` refuse it first: a reload named in the air is refused, not dropped `'flinch'`. From the
  landing the refusal is on the top again, through the rest of the clip.
- *A landing with a clip pops it: unchanged.* The stack is the stance's base, the flinch, the fall, as in PAR-65's case;
  `FUN_0058a5e0(actor, 1, 1)` under 400 (D:L466897) or `FUN_005af590`'s `FUN_0058a4d0` (D:L466691-466693) pops it with
  the fall, and a climb's or a ladder's start pops the stack (`FUN_00580b70` D:L442186-442214). The window ends at that
  command.
- *Built, room and page on one commit (PTW.R3).* `V:net/flinchReload.ts`: `flinchCovered(w, seq, air)` -- the command
  covers the flinch when its body is in the air after it and it is inside the window -- and `flinchLanded(w, seq, bare,
  air)`, handing back `{ start: seq, until: seq + (until - air) }` (F1: `max(1, until - air)`, the cover through
  `until`) (`air` defaults to the push's first command: PAR-65's case unchanged). `S:room.ts`: `Player.flinchAir` is the
  cover's command (-1: none) -- the push's first when the hit is in the air (`flinchState`), else set by `flinchLanding`
  at the first command in the air inside the window; at the return to the floor `flinchLanding` hands back or pops
  through `flinchLanded`. `V:walk.ts`: `flinchAir` the same command; one step, `flinchStep`, takes the cover, the
  hand-back, the cut and the handed-back end per command -- each tick through `flinchRan`, and the commands already run
  when the event arrives replayed from `cutLog` by `setFlinchPose`, which answers the window's end those commands give.
- *Tests.* `roomReloadLock.test.ts` (PAR-71): walked off ten commands in and landed at 0.05 -- covered at the first
  command in the air, handed back at the landing with the commands left (later than the hit's window), a reload named in
  the air refused as airborne with nothing dropped, one at the last command inside dropped `'flinch'`, the next taken;
  walked off two before the end -- the flight past the hit's window, the two played after the landing; landed at a full
  stick -- cut `FLINCH_CUT_COMMANDS` past the landing, and the page's derivation over the room's mover on the same
  command; landed at rest -- `Jump land` pops it there. PAR-62's case moved (above). `walk.test.ts`: the page's own --
  not drawn in the air, handed back with its rest, cut from the landing, popped by `Jump land`, and an event after the
  landing answering the moved end or the cut; PAR-62's page case moved. `flinch.test.ts`: `flinchCovered` and
  `flinchLanded`'s `air`. RED and GREEN in PAR-71's report.
- *Not built (named, as for PAR-65):* the page's pose clock at the hand-back (`FLINCH_LAYER_PLACEHOLDER`: the pose runs
  on the event's arrival clock through the flight, so the clip drawn after the landing is not the kept phase's; the
  reload's gate, `flinching()`, is on the commands); the others' pages (`FLINCH_AIR_REMOTE_READING`, note only).
- *Found, not built (for the controller):*
  - **The jump under a flinch.** `FUN_0057e1b0` launches only when the top play is looped (`+0x28` 0x40,
    D:L440805-440810); a flinch is a one-shot, so no jump starts under one. The port's room and page refuse a jump only
    under the still reload's life (`jumpRefused`, PARITY-1 D02), so a flinching SEAL can jump in the port, and the cover
    above takes that take-off as a walk-off's. A row of its own (room `jumpRefused`, the page's twin). *Read and built
    by PAR-78, §5.2.5.*
  - **The still reload's cut after a clipless hand-back.** The same read holds for a still reload's clip the fall covers
    (research 251 §12.3): the landing's tick cannot cut it and the next driver tick is a game frame on, while PAR-62's
    reload case cuts on the command after the landing's. That is `CLIPLESS_LANDING_RELOAD_READING`'s covered clock (its
    phase kept through the flight, as read here), a row of its own. *Read and built by PAR-79 (research 251 §12.3,
    "PAR-79"): the life, the cut a game frame past the landing, the uncut end and the crouched and prone holds on the
    clock that stands through the flight; `Rifle m203 reload` is never covered (D:L466828).*

#### 5.2.5 The jump under a flinch, and the port's other one-shots (PARITY-2 PAR-78, 2026-10-13): reading, pending review

Source inspection of the game ELF's decompilation; the six flinches' `looped` through the repository's readers
(`motionTableFromArchive` over the tracked `READERC.ZAR`). It settles §5.2.4's "The jump under a flinch".

- *The press.* The player update `FUN_00594cf0` writes the jump's request on the button's first-down frame only (state
  1, D:L453210): unless the actor's `+0xed4` carries 0x2000, 0x20000 or 0x80 or `FUN_005b4340(actor, 0xb)` refuses
  (D:L453211-453213), `FUN_005469c0` sets the request, the actor's `+0x105e` bit 0x4 (D:L453214; its body D:L412326),
  and the controller's `+0x170` bit 0x4 is set with it (D:L453215); on any other frame the controller's bit is cleared
  (D:L453218-453219). A button held on (state 2) writes neither.
- *The driver's read: spent, not kept.* The ground driver `FUN_00550ef0` (dead, state 8, it returns first,
  D:L418112-418114) takes the top play (D:L418115-418117), runs the actor's update (vtable `+0x88`, D:L418118) and tests
  that play's looped bit (`FUN_005551a0(+0x28, 0x40)`, D:L418119). Under a one-shot (D:L418120), on a frame whose
  controller bit is set (D:L418121): with `+0x10ac` clear and the request set, the request is cleared (D:L418128) and
  `FUN_0057e1b0` is called (D:L418129), which refuses on the same looped test (D:L440810); otherwise `FUN_005b4b40`
  (D:L418132) clears the request if set (D:L469594-469595). Either way the press is spent on the tick that reads it
  (*PAR-78's review, F3:* taking the controller's update slot, vtable `+0x10` at D:L418091, for `FUN_00594cf0` run first
  in that tick, as research 251 §6 takes it -- the slot itself is not resolved here): a refused press is dropped, not
  buffered, and a button held through the one-shot does not jump at the pop (no new first
  down, no new request). Under a looped top the request is cleared and `FUN_0057e1b0` asked (D:L418148-418150). The
  port has no buffer to remove: `Walker.jump` answers the press at once on both movers.
- *`FUN_0057e1b0`'s tests* (D:L440787-440810), in order: the controller's vtable `+0x34` answers 0 (D:L440789-440792;
  what it answers is not read here); not airborne (`+0x105e` bit 0x20) and the lock `+0x135c` run out (D:L440793); the
  floor's normal y `+0x1348` at least `DAT_0044c268` (D:L440799); the head ray `FUN_0057f150` (D:L440800; D13's, owed);
  `FUN_005b4340(actor, 0xb)` (D:L440806) -- its common gates read the state, the top's action and its state byte `+0x2b`
  (D:L469320-469335), its 0xb case the stance (2, prone, refused) and `+0x528` (D:L469466-469475), never the play's
  flags `+0x28`; then `+0xeac` 0 and the state `+0x174` not 9 nor 10 (D:L440807-440808), `FUN_00589900` (D:L440808),
  `FUN_0054f6e0(actor, 1, 1, 1)` 0 (D:L440809), and the top looped (D:L440810). The `+0x1061` bits are written
  (D:L440824-440825, D:L440838), not read *(PAR-78's review, F2: in `FUN_0057e1b0`'s own body only -- `FUN_00589900`,
  one of its tests, reads `+0x1061` bit 0x20 when `DAT_0045a0c1` is set, D:L446439-446440)*; `+0x10ac` (D:L440816-440818) only turns a fast take-off into the standing
  jump, it refuses nothing. So under a one-shot the looped test is the refusal; the other tests are research 80's
  (`Walker.jump`'s header), not re-audited here.
- *The flinch is such a top.* `FUN_005a2690` pushes it on the stack (`FUN_00588bc0` D:L460019, D:L460042) and the six
  clips are `motion.rdr` `looped` 0 (`roomStillReloadJump.test.ts`, PAR-78's disc case): a jump pressed from the flinch's
  push to its pop is spent and refused. The pop is the cut (D:L418174-418190) or the end (D:L418193-418203), both after
  the jump's read in the same tick: a jump on the cut's own command is refused, as PARITY-1 D02 read for the still
  reload. *PAR-78's review (F1):* and on the end's own command too -- the uncut pop's tick reads the jump first, as
  PAR-69 built for the still reload (research 251 §12.5, "The jump's refusal": refused through the pop's own tick, taken
  on the next).
- *The port's one-shots, one at a time (the jump under each before this row):*

  | One-shot | Where the port holds it | The jump before PAR-78 |
  | --- | --- | --- |
  | The flinch | room `flinchFrom` .. `flinchUntil`; page `setFlinchPose`'s window | **let through**, room and page: built below |
  | Throws, tosses, the claymore's and C4's placings | `Walker.hold_` (`bodyOwner()` `hold`), on both movers (the hold bits ride the command, `MoverSim.prepare`) | refused (`Walker.jump`) |
  | The crouched and prone reloads | the same holds | refused |
  | The standing still reload | room `reloadLife`, page `StillReloadLife` (PARITY-1 D02, PAR-30) | refused, unchanged |
  | The landings and the heavy fall's hits | `Walker.action_` (`landing`) | refused |
  | The full-body swaps 0x35-0x37 | `Walker.action_` (`swap`) | refused; the moving swap rides the looped top on the second channel (`FUN_005a7980` D:L462492-462495): taken, as in the original |
  | The knock's falls, `Prone cover`, the death landing | `Walker.action_` (`reaction`) | refused |
  | The get-ups | `Walker.action_` (`getUp`) | refused |
  | The stance transitions | `Walker.action_` (`transition`) | refused |
  | The victory dance | `Walker.dance_` (`victory`) | refused |
  | The peek's lean clip held | `TickDriver.topOneShot` (`move`) | refused |
  | The launcher's raise and lower | the room's clocks only (`heldReadyAt`, `firearmReadyAt`); nothing on the mover | **let through**: found, not built (below). *PAR-81 (§5.2.6): read -- the launcher's anim set refuses the jump from the raise's command through the lower's end; built, room and page* |

  Every walk action and kit hold is `looped` 0 on the disc (`effectiveAction.test.ts`, PAR-19).
- *Built, room and page on one commit (PTW.R3).* `V:stillReloadLife.ts` `flinchOnTop(window, seq)`: the command `seq`
  inside `[start, until)`, null refusing nothing -- one predicate for both. *Corrected by PAR-78's review (F1):
  `[start, until]` -- `until` is the command the flinch pops on, cut or uncut (§5.2.4's "the end's own command"), whose
  jump is read before the pop; the room passes null for its none (`flinchFrom` -1).* `S:room.ts` `jumpRefused(p, seq, count)`: the
  `!busy()` clause first (unchanged: a move's start pops the stack, the hang lets go under its own looped top), then
  `flinchOnTop` on the room's window at the command's own seq, then the still reload's life as before; both callers (the
  command run, and the dropped backlog's) pass the command's seq. The room asks before the command runs and cuts the
  window after it (`flinchCut`), so the cut's own command is refused and the next taken; uncut, `flinchUntil` is the
  first command past the one-shot end (PAR-58), where the jump is taken. *Corrected by PAR-78's review (F1): that
  command is the pop's own -- its end test passes in its tick, after the jump's read -- so the jump is refused there and
  taken on the next. A clipless landing's hand-back (`flinchUntil' = landed + max(1, until - air)`) is the same: refused
  through `flinchUntil'`, taken after; at `landed + 1` the landing's jump lock (0.4 s, `actor+0x135c`, D:L440793) refuses
  it anyway.* `V:walk.ts` `WalkMode.jump`: refused before the
  press rides on the command when the still clip lives or `flinchOnTop(flinchCut, taps + 1)` -- the room's window as the
  page's own commands cut, cover and hand it back (PAR-60, PAR-65, PAR-71), ended after the cut's tick, so the press
  riding on the cut's command is refused there too. Without a window (a room without the clips holds none, PF-18; an
  older room's event carries none) neither side refuses: pinned on both. With the jump refused, PAR-71's cover no longer
  meets a take-off under a flinch on the floor.
- *Tests.* `roomStillReloadJump.test.ts` (PAR-78): the six flinches `looped` 0 on the disc; at rest every command from
  the window's first to its last refused, the end's command taken (*moved by the review's F1:* through the pop's own
  command refused, the next taken; and a clipless landing's hand-back, the same); a press under the flinch spent, no
  jump at the pop;
  the stick held -- the cut's own command refused, the next taken; a dropped backlog's jump inside the window refused;
  no clips, no window, admitted. `walk.test.ts` (PAR-78): the page at rest (never on the wire inside the window, taken at
  its end; *moved by F1:* taken on the command after it), a clipless landing's hand-back (F1), the cut's command, and no
  window. `stillReloadLife.test.ts`: `flinchOnTop`'s bounds (`until` inside since F1).
- *Not built, named:*
  - **The press in the round trip.** Until the `flinch` event arrives the page knows no window: a jump pressed between
    the hit and the event is predicted on the page and refused by the room, whose state then corrects the page (the
    reload has an undo for the same gap, `Fire.undoReload`; the jump has none). A network gap of the kind of PAR-60's
    review F1, not a value of the original; `netPage.ts` is outside this row.
  - **A cut in a dropped backlog** (PAR-78's review, F4). The room cuts the flinch only on the commands it runs
    (`watchCut`): a stick cut inside a dropped backlog is skipped there and cut on the page (§5.2.2's known gap, review
    F1 of PAR-60), so the room may refuse a jump the page takes, until the room's window ends.
  - **The launcher's raise and lower.** `FUN_005a7980` asks the top's action among the swaps, `Rifle -> Launcher`,
    `Pistol -> Launcher` and the turret mounts (D:L462484-462491; `V:net/deaths.ts` `FLINCH_GATE_READING`), and the
    second channel's node (D:L462492-462495). Which of the ids is which, which a still raise takes and whether its clip
    is a one-shot are not read here; the port's mover knows nothing of it, so a jump is taken under it. A row of its
    own. *Read and built by PAR-81 (§5.2.6): the raise and the reversed lower are one-shots on the stack, and the
    launcher's anim set refuses the jump through `FUN_005b4340(actor, 0xb)` for as long as it is on the body.*
  - **The stance under a flinch.** `bodyOwner()` does not see the flinch, so the port's stance gate takes a press under
    it at once; whether `FUN_00552ec0`'s outer gate (research 251 §2.1) keeps it waiting under a flinch is not read in
    this row. *Read and built by LATER 512c, 2026-10-27 (research 92 section 4, "LATER 512c's reading"; reading,
    pending review): it does -- the flinch and a door's `Open door` are one-shots, so the request waits until both have
    run (`Walker.oneShotOnTop`, page and room).*
  - **A push over the flinch.** Whether a kit hold's or a transition's push over a running flinch pops it is not read;
    the room's window (and so the reload's refusal and now the jump's) runs on under it.

#### 5.2.6 The launcher's raise, the launcher up and its lower (PARITY-2 PAR-81, 2026-10-13): reading, pending review

Source inspection of the game ELF's decompilation; the clips' flags through `motion.rdr` (`simClipsFromBytes` over the
tracked `READERC.ZAR`, `roomStillReloadJump.test.ts`'s PAR-81 case); the clips' keys as `equipment.ts`
`LAUNCHER_RAISE_CLIPS` pins them (`equipment.test.ts`, research 217 §4.2). No game, capture or browser was run. It settles
§5.2.5's "The launcher's raise and lower".

- *The ids.* `FUN_005a7980` (D:L462473-462507) asks the top's type among 0x35-0x37 (the swaps), `DAT_003df0e0`
  (`Rifle -> Launcher`), `DAT_003df0e8` (`Pistol -> Launcher`), `DAT_003df108` and `DAT_003df110` (the turret mounts),
  and the second channel's `+0x1e4` node's `+0x22` against `DAT_003dec68` (`Moving rifle -> Pistol`), `DAT_003df0f0` and
  `DAT_003df0f8` (the moving launcher clips) -- the names registered at D:L495408-495414 (research 179 §11.15, research
  180 §1.15, research 215). The raise is `Rifle -> Launcher` from the rifle and `Pistol -> Launcher` from the pistol.
- *The raise is a one-shot on the stack, and it takes the launcher's anim set.* The item swap `FUN_005a64c0` (from the
  press's frame, before the driver: D:L476734, the swap's path, research 251 §12.5 "PAR-80") calls `FUN_005a6d30` for
  the launcher (D:L461878-461886). That first takes the launcher's set, `FUN_0058c350(actor, DAT_0044d408, 0x12, 1, 0)`
  (D:L462105): the stack cleared (D:L447983), the set stored at `actor+0x528` and the old one at `+0x52c`
  (D:L447985-447986), the set's type 0x12 pushed as the base (D:L447989). Then it pushes the raise
  (D:L462112-462116) through `FUN_00588bc0`, which sends only a `BlendOverlay` motion to the second channel
  (D:L446083-446085) and every other onto the stack (D:L446292 -> `FUN_0028dc90`), the play's looped bit taken from the
  clip's (D:L135187). On the disc `seal_rifle2launcher` and `seal_pistol2launcher` are looped 0, no `BlendOverlay`,
  `NoInterrupt` bare (never cut by the stick), `NoFire`, playback 1.5: a one-shot on top. Its end (`FUN_00582540`
  D:L443058-443065) mounts the launcher in the hand (`FUN_005a60d0(actor, 4, 1)`, D:L461838-461840) and leaves the set.
- *The jump under the set: refused, the whole time.* `FUN_005b4340(actor, 0xb)` -- the jump's press gate in
  `FUN_00594cf0` (D:L453211-453213: no request is made) and one of `FUN_0057e1b0`'s tests (D:L440806) -- returns 0 when
  `actor+0x528` is `DAT_0044d408` (D:L469466-469471; 0xb reaches that branch: it is neither 1 nor in 2-7 or 8, the
  branch at D:L469404-469459, nor in 3-7 or 8 at D:L469460). So the jump is refused from the raise's push to the moment
  the set is given back -- through the raise, with the launcher up (its fire, the RPG's feed `seal_launcher_reload`,
  looped 0, included) and through the still lower. PAR-78's looped-top refusal (D:L440810) also holds under the raise and
  the lower, but the set's gate is the wider one. The raise is pushed before the driver on its press's own frame, so the
  jump read in that frame's driver (`FUN_0057e1b0` D:L440806, from D:L418129 or D:L418150) is already refused: the
  command the raise rides is the first refused.
- *The lower, and the set given back.* `FUN_005a6b70` (from `FUN_005a64c0` D:L461875) pushes, in the launcher's set, the
  raise's own clip reversed (D:L462069-462070 for the rifle, D:L462078-462079 for the pistol; the 4th argument 1, the
  reverse, D:L446300-446301): a one-shot on the stack, like the raise. Out of the set it plays `DAT_003df0f0` /
  `DAT_003df0f8` (D:L462073, D:L462082): `seal_mv_rifle2launcher` / `seal_mv_pistol2launcher`, `BlendOverlay` on the
  disc, the second channel's. The reversed clip's end runs `FUN_00582540`'s launcher branch (D:L443058-443062):
  `FUN_005a60d0(actor, 1|2, 4)`, which gives the old set back (`FUN_0058c4a0(actor, +0x52c)`, D:L461769-461771 ->
  `FUN_0058c350`, the stack rebuilt on its base 1). The end test is the driver's (`FUN_0028c6e0`, D:L418192-418193, after
  the jump's read at D:L418119-418150), on the push's own clock, as PAR-80 read the swap (research 251 §12.5): off at the
  first command with `t > P x e^2 - G/2` -- the **84th** command from the lower's own for the rifle's clip (35 keys:
  1.4155 - 0.0167 = 1.3988 s), the **82nd** for the pistol's (24 keys: 1.3776 - 0.0167 = 1.3609 s). The jump on that
  command is refused (the press gate runs first in the frame, and the driver reads the jump before the end test), the
  next taken. The gates before that branch hold for a lower on the ground as for the swap (`+0x2a` 0, `+0x1061` bit 1
  clear; D:L442987-442991, D:L443049).
- *The stick lower (read, not built).* In the ground driver, with the launcher's set on and the base 0x12 on top (the
  raise popped), a stick past 0.1 on either axis (`actor+0x240` / `+0x244`, D:L418263-418266) -- unless `FUN_005a7ab0`
  answers (a reload's lock, D:L418268) -- gives the old set back at once (`FUN_0058c4a0`, D:L418270), puts the firearm
  back in the kit (D:L418269, D:L418272-418277) and lowers through `FUN_005a64c0(actor, 4, item, 0)` (D:L418278), which,
  out of the set now, plays the moving lower on the second channel. So the original's SEAL never walks with the
  launcher up: its first push of the stick after the raise lowers it, and the jump is taken from the next frame (the set
  gone, the legs' loop on top; the moving lower is an overlay). The port keeps the launcher up while walking
  (`rocket.ts`, `room.ts` `held`); under PAR-81's refusal its jump stays refused there, where the original's would have
  been taken after the stick's lower. **For the controller: a row of its own** (the stick lower, room and page: the
  kit's item, the room's `held`, the moving clip on the second channel, the fire's clocks).
- *The port before PAR-81*, on the same commands, room and page alike: the room's `raiseLauncher` / `lowerLauncher` set
  only the fire's clocks (`heldReadyAt`, `firearmReadyAt`, counted from the event's arrival), and `jumpRefused` asked
  neither; the mover held nothing of the launcher (`bodyOwner()` null), so `Walker.jump` took the jump; the page's
  `RocketLauncher` (`rocket.ts`) keeps its own first-rocket wait in frame seconds and `matchThrow.ts` the firearm's
  return in wall-clock milliseconds (`firearmReadyAt`), neither asked by `WalkMode.jump`; `matchFirearm.ts` reads the
  launcher only for the trigger and the fire-mode cell (`launcherUp`). So a jump on every command from the raise's own
  (the `throw` event's seq + 1) through the lower's end (its seq + 84 or + 82) was taken on both sides, where the
  original refuses it.
- *Built, room and page on one commit (PTW.R3).* `V:mover.ts` `playedOutCommand(playback, frames)`: the command, from
  the push's own as the first, on which `swapPlayedOut` first passes (84 and 82 here); `LAUNCHER_SET_MOVES_READING`
  (§5.2.7). `S:room.ts` `Player.launcherSet` (`{ start, until }` on the commands' seqs, null for none): the raise sets
  `start` = the event's seq + 1 (a lower still under way keeps its start) and `until` Infinity; the lower sets `until` =
  its seq + `playedOutCommand` of the firearm's clip; the spawn clears it; `jumpRefused` asks `flinchOnTop(launcherSet,
  seq)` first -- before the `!busy()` clause, as the press gate runs before any move's answer. `V:walk.ts`
  `WalkMode.launcherRaised()` / `launcherLowered(from)` / `launcherCleared()` keep the same window on `taps` (the last
  command sent, the event's seq); `jump` refuses the press before it rides; a new body (`restart`) clears it.
  `V:matchThrow.ts` (outside the brief's list, the nearest correct file: the page's launcher `equip` is there) calls them
  from the same `equip` that sends the room its `throw`, and clears after a spawn's kit (`spawnEquipment`). The page's
  and the room's fire clocks are unchanged.
- *Tests.* `roomEquipment.test.ts` (PAR-81): refused on the raise's own command and while up, the control taken before;
  the lower refused through its 84th (rifle) and 82nd (pistol) command, taken on the next; a raise the room refuses
  holds no set. `walk.test.ts` (PAR-81): the page the same on its commands (never on the wire), and cleared.
  `matchThrow.test.ts` (PAR-81): the wiring -- a raise, a lower to the rifle, a spawn's kit. `roomStillReloadJump.test.ts`
  (PAR-81): the clips' flags on the disc and `playedOutCommand`'s 84 and 82.
- *Not built, named:*
  - **The stick lower** (above): a row for the controller. *(Filed as PAR-83, 2026-10-13; read whole and built by PAR-83,
    §5.2.8.)*
  - **The body under the raise and the lower** (PAR-81's review, 2026-10-13; PAR-83): the still raise and lower are
    full-body one-shots on the stack with `NoInterrupt` bare (the disc's flags above), which in the port's own hold model
    (`HOLD_CLIPS`) stop the ground state for their length; the port's mover holds neither. *(PAR-83, §5.2.8: read --
    the SEAL stands through both, the stick neither moves it nor cuts them; not built, `LAUNCHER_RAISE_HOLD_READING`.)*
  - **A firearm swap with the set on** (PAR-81's review, 2026-10-13; PAR-83): the room's `aim` clears `held` on a
    firearm swap but leaves `launcherSet`; unreachable today (`kit.select`'s one caller lowers the launcher first).
    *(PAR-83, §5.2.8: a firearm taken with the launcher up is the still lower, so the set goes at that clip's end, not
    at once -- built so, room and page, in place of the clear the review proposed.)*
  - **The press in the same command's interval.** The page answers a jump at the press: one pressed before a raise in
    the same interval between two commands has already started on the page's walker when the raise comes, and rides the
    raise's own command, which the room refuses (the original reads both in that frame, the raise first, before the
    driver). The room's state then corrects the page -- a port gap of the page's prediction, as PAR-78's "press in the
    round trip".
  - **The moves under the set** (`LAUNCHER_SET_MOVES_READING`): whether a climb, a ladder or a hang can begin under the
    launcher's set is not read; `FUN_005b4340`'s cases 2, 6-8 and 10 refuse under it too (D:L469466-469471,
    D:L469528-469531), and which presses they are is not read.
  - **The fire's clocks.** The page's first-rocket wait (`rocket.ts`, frame seconds) and the firearm's return
    (`matchThrow.ts`, wall-clock milliseconds) are not on the room's command clock; the original's `NoFire` over the
    raise and the lower is not re-read here. Not the jump's.
  - **The turret's set** (`DAT_0044d410`; the mounts, `FUN_005a6fc0` D:L462192-462198) refuses the jump through the same
    gate (D:L469473-469475); the port's mounted body is not re-audited here.
  - **The other raise families.** The swaps 0x35-0x37 are full-body one-shots (refused since PAR-19); the moving swap
    rides the second channel (taken, as the original); the binoculars' types 0x38-0x3a / 0x7e-0x80 have no push found
    (research 180 §1.15).

#### 5.2.7 Readings (PAR-81)

| name | value | what it stands in for | what would settle it |
|---|---|---|---|
| `LAUNCHER_SET_MOVES_READING` (`viewer/src/mover.ts`; `room.ts` `jumpRefused`, `walk.ts` `WalkMode.jump`) | `'refused under a move'`: the launcher's set refuses the jump before any move's own answer (the press gate, `FUN_00594cf0` D:L453211-453213 -> `FUN_005b4340(actor, 0xb)` D:L469466-469471) | whether a climb's, a ladder's or a hang's start can begin under the launcher's set, or gives it back -- the set's read restorers are the lower's end (`FUN_005a60d0` D:L461769-461771) and the driver's stick lower (D:L418263-418270); the knock's `FUN_005807d0` gives back only the turret's (D:L442073-442087) | the read of the moves' starts under the set (`FUN_005b4340`'s cases for them), or a capture of a SEAL with the launcher up at a ladder or a ledge |

#### 5.2.8 The launcher's stick lower, the body under the raise, a firearm taken with the launcher up (PARITY-2 PAR-83, 2026-10-13): reading, pending review

Source inspection of the game ELF's decompilation; the clips' flags and keys through `motion.rdr` and `MOTION_P.ZAR`
(`simClipsFromBytes`, `clipsFromPack` over the tracked fixtures: `roomStillReloadJump.test.ts`'s PAR-83 case). No game,
capture or browser was run. It builds §5.2.6's "The stick lower (read, not built)" and settles the review's F2 and F3 of
PAR-81 as below.

- *Where the stick lower runs.* After the jump's read (D:L418119-418150) and the air's zero (`FUN_005af930` D:L418169),
  the ground driver `FUN_00550ef0` asks the top's looped bit (`FUN_005551a0(+0x28, 0x40)`, D:L418171-418175). A one-shot
  on top takes the cut test (D:L418176-418190) and the end test (`FUN_00582540` D:L418192-418193); a looped top takes
  the other branch (D:L418255-418278), which alone holds the stick lower: with the launcher's set on (`+0x528 ==
  DAT_0044d408`) and the top's type 0x12 -- the set's base, pushed by `FUN_0058c350` at the raise (D:L462105, PAR-81),
  looped since this branch asks it -- `FUN_001b3620` of `+0x240` and `+0x244` (the pad's two move axes as `FUN_00551ec0`
  copies them, §5.2.3), either strictly past 0.1 (D:L418263-418266). The turn `+0x23c` is not read (the cut's test,
  D:L418184-418185, reads it; this one does not), and under the set the standing state pushes neither a walk nor a turn
  step (`FUN_00586570` D:L444853-444856: only `+0x374` = 1), so a turning SEAL keeps the launcher up and turns by the
  driver's own turn (D:L418340). Before the test the branch zeroes `+0x244` in state 5 and the turn in states 4 and 5
  (D:L418256-418262); neither is a state the launcher is raised in.
- *Its gate.* `FUN_005a7ab0` (D:L418268) answers when the kit's reload timer runs (`kit+0x820 > 0`, `FUN_005c2400`),
  when the top or any stack entry is a reload or pump type, or when the second channel holds the moving reload
  (`DAT_003deb70` / `DAT_003deb68`) (D:L462512-462560). With the launcher's base on top only the timer and the second
  channel can answer: the RPG's after-shot feed arms the timer (`ReloadDelayAfterShot`, research 94 §C1.1) and then
  pushes `seal_launcher_reload` (one-shot, `NoInterrupt` 0.5 on the disc) over the base, so the stick lower waits
  through the timer and, the base no longer on top, through that clip until it ends or the stick cuts it past 0.5. Not
  held by the port (`LAUNCHER_STICK_LOWER_READING`, §5.2.9): it holds neither the timer nor the feed's clip on the body.
- *What it does, on the stick's own command.* In order (D:L418269-418278): `+0xf79` takes the firearm the launcher was
  raised from (`+0xf78`, written by the raise, `FUN_005a6d30` D:L462118); `FUN_0058c4a0(actor, +0x52c)` gives the old
  set back at once (D:L418270; `FUN_0058c350`: the stack cleared and rebuilt on its base 1); `+0x374` = 0; the firearm
  mounted in the hand (`FUN_0057d5e0`, D:L418272); the ground state run (`FUN_005870e0(actor, 0)`, D:L418273: under the
  old set the standing state walks); the kit takes the firearm's slot (`FUN_005c4b10`, D:L418274-418277); and
  `FUN_005a64c0(actor, 4, firearm, 0)` (D:L418278) -> `FUN_005a6b70`, out of the set now, pushes
  `moving_rifle_to_launcher` (`DAT_003df0f0`) or `moving_pistol_to_launcher` (`DAT_003df0f8`) (D:L462073, D:L462082).
- *The moving lower.* `seal_mv_rifle2launcher` / `seal_mv_pistol2launcher`: looped 0, `BlendOverlay`, `NoFire` bare, no
  `NoInterrupt`, playback 1.5, 35 and 24 keys on the disc -- so the second channel's (`FUN_00588bc0` D:L446083-446085),
  kinds 8 and 10 (`FUN_00587780` D:L445419-445437), run back from their end (`FUN_0028d3f0(.., 1)`, D:L438583-438600;
  the hand-off callbacks `FUN_005a7520` at 0.27 and `FUN_005a7730` at 0.13). The node lives playback x (n-1)/n
  (`FUN_0028d170` D:L134703-134737, as the moving swap, R150.5): **1.4571 s** to the rifle, **1.4375 s** to the pistol.
  While it lives `FUN_005a7980` answers (D:L462492-462499), and `FUN_005a7de0` refuses the firearm's round
  (D:L462636-462638) -- so the firearm is in the hand at once and fires from the overlay's end -- and the swap's gate
  (`FUN_005a8cb0` through `FUN_005a7de0`) refuses a swap meanwhile. The legs walk under it (the stack's top is the
  ground state's loop).
- *The jump.* On the stick's command the press gate ran before the driver under the set (`FUN_005b4340(actor, 0xb)`,
  D:L453211-453213 -> D:L469466-469471) and the driver read the jump before the lower: refused. From the next command
  the set is the old one, `FUN_005b4340(actor, 0xb)` does not ask `FUN_005a7980` (only kinds 2-7 and 8 do,
  D:L469404-469459), and the top is the ground state's loop (`FUN_0057e1b0`'s looped test, D:L440810): **the jump is
  first taken on the command after the stick's**, one after the set's return (the set is given back on the stick's
  command, after its jump's read).
- *During the raise (F2 of PAR-81's review).* The raise is a one-shot on top with `NoInterrupt` bare: the stick never
  cuts it (`FUN_00587c20` refuses it; only type 0x35 is tested whatever it answers, D:L418181), and with a one-shot on
  top the driver runs no ground state (`FUN_005870e0` only at the pop or a cut, D:L418203; the `HOLD_CLIPS` header): the
  SEAL stands through the raise and through the still lower (the same clip reversed, PAR-81), moved only by the clip's
  root (`FUN_0028c250`; the raise clips' root not read here), turning by D:L418340. The raise comes off on its own
  clock, the 84th command from its own for the rifle's clip and the 82nd for the pistol's (`playedOutCommand`, as
  PAR-81's lower); that command runs the one-shot branch (the pop and `FUN_005870e0(actor, 1)`), so the looped branch,
  and the stick's lower, is first read on the command after: **e + 85** from the rifle and **e + 83** from the pistol, e
  being the `throw` event's seq (the raise rides e + 1). A stick held through the raise lowers there.
- *A firearm taken with the launcher up (F3 of PAR-81's review).* `FUN_005a64c0(actor, 4, firearm, 0)` with the launcher
  in hand is `FUN_005a6b70(firearm)` (D:L461870-461876): in the set it pushes the raise's clip reversed -- the rifle's
  or the pistol's by the firearm taken (D:L462069-462070, D:L462078-462079) -- and gives the set back at that clip's end
  (PAR-81). So a swap with the set on is the still lower, never a clear: the review's "clear `launcherSet`" would refuse
  nothing through the lower where the original refuses, and is not what was built.
- *The port before PAR-83*, on the same commands: the room held `held` and the set (`until` Infinity) while the SEAL
  walked with the launcher up, so from the raise's end the jump was refused on every command until the page's own lower
  (`throw` of the firearm) and its 84th command; the original lowers on the first command past the raise's end whose
  stick is past 0.1 and takes the jump on the next. The rockets stayed fireable while walking; the original's launcher
  is down once the stick moves. `aim`'s firearm swap cleared `held` and left the set (F3).
- *Built, room and page on one commit (PTW.R3).* `V:mover.ts`: `launcherStickLowers` (`LAUNCHER_LOWER_STICK` 0.1, the
  two move axes, strictly), `launcherBaseCommand` (the raise's event seq + `playedOutCommand` + 1), `LauncherUp`,
  `LAUNCHER_MOVING_LOWER`, `launcherMovingLowerSeconds`. `S:room.ts`: `Player.launcherUp` (set by `raiseLauncher` from
  `p.sim.weapon`, cleared by every lower and the spawn); `launcherStick` after the command's `aim` (so after its
  `jumpRefused`), on `Walker.cutStick` when `cutAsked`: `held` null, the set's `until` the command's seq,
  `firearmReadyAt` the moving lower's (87 commands from the rifle, 86 from the pistol); a dropped backlog's command the
  same on its own stick (clamped, the scope's 0.2: `commandStick`), so the room agrees with the page that ran it;
  `lowerLauncher` ignores a lower after the stick's (`held` already null: laid once); `launcherDown` (the lower's set
  and clock, shared) and `aim`'s F3: a swap with `held` still on lowers to the firearm taken (`until` the swap's seq - 1
  + its clip's `playedOutCommand`). `V:walk.ts`: `launcherRaised(from)` keeps `launcherUp`; `launcherStickRan` in `tap`
  after the command's tick (the jump asked `taps + 1` before it), the same test on the walker's own `cutStick` and
  `cutAsked`; the listeners (`onLauncherStickLower`); `swapWeapon`'s F3 (`launcherLowered` by the firearm taken); the
  clears. `V:rocket.ts`: `lower('stick')`, told through `equip`'s third argument. `V:matchThrow.ts`: the walk's stick
  lower puts the launcher away with **no event** (the room lays it from the same command's stick) and holds the
  firearm's trigger for the moving lower's life (`performance.now()`, as PF-21's still lower's clock: the fire's page
  clock, not the jump's); the raise tells the walk its firearm. No wire change: both sides decide it on the same command
  from that command's stick.
- *Tests.* `roomEquipment.test.ts` (PAR-83): lowered on the stick's own command (the jump on it refused, the next taken,
  the firearm's 87 / 86); the stick held from the raise lowered on e + 85 / e + 83 and not before; the turn and 12/127
  lower nothing, 13/127 on either axis does; a page lower after the stick's not laid twice; a dropped backlog's stick
  lower laid on its command; F3. `walk.test.ts` (PAR-83): the test's bounds and constants; the page the same on its
  commands, heard once; nothing after the kit's lower or a clear; F3 by the jump. `matchThrow.test.ts` (PAR-83): the
  stick's lower sends no `throw` and tells the walk nothing, the firearm's trigger held 1457 ms; the raise tells the
  walk the pistol. `roomStillReloadJump.test.ts` (PAR-83): the moving lowers' flags and keys on the disc.
- *The take and the swap under the moving lower (F1 of PAR-83's review, 2026-10-13): reading, pending review.* Source
  inspection, re-read at the decompilation; no game, capture or browser. Every slot's take on the pad -- the two
  shoulders' slots (`FUN_002c64e0(9, ..)` / `(10, ..)`, D:L453289-453310), the launcher's among them -- and the R2
  inventory's confirm (D:L72691) ask `FUN_005a8cb0` before `FUN_005c4b10` takes the slot (else the refusal,
  `FUN_003419c0`); `FUN_005a8cb0` asks `FUN_005a7de0(actor, 1, 1)` (D:L463159), which returns 0 when `FUN_005a7980(actor,
  1)` answers (D:L462636-462638), and `FUN_005a7980` answers while the second channel's node (`actor+0x1e4`) holds
  `DAT_003df0f0` or `DAT_003df0f8`, the moving lower's two clips (D:L462492-462499). So while the stick's moving lower
  lives the launcher cannot be taken again and the firearm cannot be swapped. (`FUN_005a8da0`, the zoom's gate, asks
  `FUN_005a7980` too, D:L463230; the port's zoom is not changed here -- §5.2.9.) The review found the port's split:
  the page lowered by the stick on u (no event) and could take the launcher again at once; its `throw` reached the
  room before u ran, found `held` still on and did nothing, then u lowered it -- the page up, the room down (the
  rockets refused, the others drawing the firearm) until the next lower.
  - *Built, room and page (PTW.R3).* `V:mover.ts` `launcherMovingLowerCommands` -- the life on the commands' clock, 87
    from the rifle and 86 from the pistol (`launcherMovingLowerSeconds` at 60 Hz, rounded as `firearmReadyAt`). The page:
    `V:walk.ts` `launcherMovingUntil` (u + that count, set by `launcherStickRan`, cleared with the launcher's clear and
    the spawn); `swapGate` refuses while the command the take rides (`taps + 1`) is before it -- the gate the shoulder
    press (`matchFirearm.ts` `shoulderGate`), the R2 inventory (`matchThrow.ts` `kitChangeGate`, its confirm through
    `shoulderGate`) and the swap (`swapWeapon`) all ask, so a take there sends no `throw` and leaves the walk's set off.
    The room: `S:room.ts` `Player.movingLowerUntil` (set by `launcherStick`); `swapRefused` refuses a swap on a command
    before it; `raiseLauncher` refuses a raise riding before it (its event's seq + 1; tallied `throw: moving lower`);
    and a raise that arrives with the launcher still up and its own command not yet run waits on the stick
    (`Player.raiseAfterStick`): when a queued command's `launcherStick` lowers it, the raise is decided there -- refused
    inside the life, taken past it -- so the room ends with the launcher where the page has it in either order. *(Narrowed
    by PAR-83's re-review, 2026-10-13: in either order while the room is less than a moving lower's life behind the page.
    The held raise is decided at u, not at its own command t; with the room about 86 or more commands behind -- far past
    `BACKLOG_BOUND_PLACEHOLDER`'s 12 -- a firearm swap the page made between u + life and t runs after the raise in the
    room and lowers it, the page's launcher up and the room's down, and the page's firearm rounds in that span are dropped
    as `fire: launcher`; a still lower arriving before u clears the hold and leaves the room's set on the old raise. Named,
    not built: the raise decided when the room runs t.)* No
    wire change. `matchThrow.ts` is unchanged: its take already asked the walk's gate through `shoulderGate`.
  - *Tests.* `walk.test.ts` (F1): `swapGate` closed for a take riding u + 1 .. u + life - 1 and open riding u + life,
    rifle and pistol, `swapWeapon` refused with it and no swap on the wire; the kit's lower plays no moving lower, a
    clear ends it. `roomEquipment.test.ts` (F1): a raise arriving after u ran refused inside the life, taken riding its
    end; a swap the same; the reviewer's order (the raise applied before u runs) refused inside, taken riding the end
    once u lowers it. `matchThrow.test.ts` (F1): with the walk's gate closed the launcher's slot sends no `throw` and no
    `launcherRaised` (a pin of the wiring, green before the fix).
  - *Not changed:* the room's deferred raise clocks its rockets (`heldReadyAt`) from the stick's command's count, not
    the raise's own -- the same lag the arrival path already takes when the room is behind; the page's trigger hold for
    the moving lower stays on its millisecond clock (PF-21, F3 of the review).
- *Not built, named (§5.2.9):*
  - **The body under the raise and the still lower** (`LAUNCHER_RAISE_HOLD_READING`; F2): read above, not built -- the
    port's mover holds a full-body clip only as a hold (`HOLD_CLIPS`, whose four wire bits `HOLD_SHIFT` are full: 15
    codes) or an action (`ACTION_CODES`, `net/protocol.ts`), and the brief keeps `net/protocol.ts` out of this row; a
    body owner kept off the wire, as the victory dance is, would also need the stance's and the swap's gates under it
    and the raise clips' root, unread. The port's SEAL walks on through both clips.
  - **The stick lower's other gates and its drawing** (`LAUNCHER_STICK_LOWER_READING`): `FUN_005a7ab0` under the RPG's
    feed (above); `FUN_005b4b40`'s contact zero, which the looped branch runs before the lower when no jump is pressed
    (`FUN_0057f2a0` then `FUN_005b4b40`, D:L418152-418155; the zero at D:L469667-469668) -- a stick pushed into a wall
    the body faces lowers nothing in the original, and the port's `cutStick` does not take that zero (§5.2.3); the swap refused while the moving lower lives (`FUN_005a7980` through `FUN_005a8cb0`), which the page's
    swap gate does not ask; and the moving lower's clip, which the port does not draw (it draws neither the raise nor
    the lower: the firearm is drawn back at once, the launcher on its carry node). *(F1 of PAR-83's review, 2026-10-13: the swap
    refused under the moving lower is now held, with the take it shares a gate with -- "The take and the swap under the
    moving lower" below; what stays unheld is in §5.2.9's row.)*
  - **The moving lower's other refusals** (`LAUNCHER_STICK_LOWER_READING`; F3 of PAR-83's re-review, 2026-10-13):
    `FUN_005a7de0` passes its second argument to `FUN_005a7980` for every caller, so besides the take, the swap and the
    zoom, the original refuses under the moving lower each action that asks it -- D:L427668, D:L452029, D:L452277 (the
    hostage offer), D:L452383, D:L452463, D:L452768 and D:L457365 (the chase); the port does not (the victory offer
    already does, through `swapRefused`, research 303).
  - **A command lost past the redundancy** (F2 of PAR-83's re-review, 2026-10-13): the room skips it with its stick
    unread, so a stick lower riding it is never laid in the room while the page lowers -- the room keeps the launcher up
    on its old base, and a later stick push lowers it in the room only. The degraded-network kind of PAR-60's F1
    (§5.2.2); named, not built.
  - **The base on top, past the raise's end** (`LAUNCHER_STICK_LOWER_READING`; F2 of PAR-83's review): the stick lower
    is the looped branch's alone (D:L418255-418278, its test the top's type 0x12 at D:L418263), so any one-shot pushed
    over the base -- a flinch, the RPG's feed -- runs the one-shot branch instead (D:L418175-418190) and the stick lowers
    nothing until it pops. The port's test (`Walker.cutAsked` and `cutStick`, room and page) takes from the one-shot
    branch only its landing-tick exclusion (D:L418176), not the top's type: it lowers on that command where the original
    would not. Room and page agree, so it is a parity gap, not a split.
  - **A raise from the pistol in the room** takes `p.sim.weapon` at the event (as PAR-81's raise clock); a swap still
    playing at the raise is not re-read.
  - **The fire's clocks** stay as PAR-81 left them: the page's in frame seconds and milliseconds, the room's on its
    command count.

#### 5.2.9 Readings (PAR-83)

| name | value | what it stands in for | what would settle it |
|---|---|---|---|
| `LAUNCHER_RAISE_HOLD_READING` (`viewer/src/mover.ts` `launcherBaseCommand`'s doc) | not held: the port's SEAL walks on through the launcher's raise and its still lower | the original's stand through both full-body one-shots (`NoInterrupt` bare, no ground state under a one-shot: `FUN_00550ef0` D:L418171-418203; the clips' flags on the disc, §5.2.6) -- F2 of PAR-81's review, read here, not built: the port's holds and actions are the wire's codes (`HOLD_SHIFT`'s four bits full; `ACTION_CODES` in `net/protocol.ts`) | a row that may change the protocol (a hold or action code for the two clips) or a body owner kept off the wire with its stance and swap gates, and the raise clips' root read through `MOTION_P.ZAR` *(PAR-84's read, §5.2.10, 2026-10-13, reading, pending review: the stand through both confirmed at the source; the original's wire carries the push itself, the type and its reverse, as a Push Blend when the type's anim-set row is `network_log`, unread; the routes compared -- two names appended to `ACTION_CODES` recommended, no codec change and no bump; still not built)* *(Resolved 2026-10-14 by PAR-84's build, §5.2.10 "Built", reading, pending review: the mover holds both clips as actions (`rifleToLauncher`, `pistolToLauncher`, the lower reversed), room and page on one command; the wire's two codes appended; the name kept in `viewer/src/mover.ts` `launcherBaseCommand`'s doc as history.)* |
| `LAUNCHER_STICK_LOWER_READING` (`match/src/room.ts` `launcherStick`, `viewer/src/walk.ts` `launcherStickRan`) | the stick lowers on any command from the raise's end on whose move axis passes 0.1, whatever is on top (`Walker.cutAsked`'s landing exclusion only) | `FUN_005a7ab0`'s refusal under the RPG's after-shot feed (`kit+0x820`'s timer, then `seal_launcher_reload` on top: D:L418268, D:L462512-462560); `FUN_005b4b40`'s contact zero before the test (D:L418152-418155, D:L469667-469668); the base on top (F2 of PAR-83's review): a one-shot over the base -- a flinch, the feed -- runs the driver's one-shot branch (D:L418175-418190), not the looped one that alone lowers (D:L418255-418278, type 0x12 at D:L418263), so the original lowers nothing until it pops while the port lowers on that command (room and page alike: parity, not a split); the zoom refused under the moving lower (`FUN_005a8da0` asks `FUN_005a7980`, D:L463230), not held; the moving lower drawn (`seal_mv_*2launcher` on the second channel). *Held since F1 of PAR-83's review (2026-10-13): the take and the swap refused under the moving lower (`FUN_005a7980` D:L462492-462499 through `FUN_005a8cb0` D:L463159; room `movingLowerUntil`, page `swapGate`), first listed here as not held.* | the feed's timer and clip held on the body (room and page), the contact read into `cutStick`, the top's type held beside `cutAsked` (a one-shot over the base refusing the lower), the zoom's gate asking the moving lower's life, the clip drawn; or a capture of an RPG fired then the stick pushed at once, of a SEAL with the launcher up flinched while walking, and of one pushing into a wall |

#### 5.2.10 The body through the launcher's raise and lower (PARITY-2 PAR-84, 2026-10-13): reading, pending review

Source inspection only: the game ELF's decompilation, the ELF's own strings at their addresses (read by byte offset, for
names), the clips' `motion.rdr` rows through the committed golden (`packages/viewer/test/golden/motion-rdr.json`), and
the port's code read. No test, reader, game, capture, browser or build was run (the brief: no node process during the
host hold). It re-reads §5.2.8's "During the raise" at the source, reads what the original's own wire carries for the
two clips, and compares the port's routes for `LAUNCHER_RAISE_HOLD_READING` (§5.2.9). Nothing is built here; the build is
a later brief, and the wire is the online seat's (redotcom-c1): this section proposes and changes nothing there.

- *The clips, confirmed on the golden.* `seal_rifle2launcher` and `seal_pistol2launcher` (the golden's `entries[164]` and `[165]`):
  `looped` false, `playback` 1.5, `max_velocity` -1, `NoInterrupt` 1 (the bare flag), no `BlendTime`, `NoPitchtwist`, no
  callback. The golden's columns carry neither `BlendOverlay` nor `NoFire`; §5.2.6 read both off the disc through
  `simClipsFromBytes` (no `BlendOverlay`, `NoFire` bare; `roomStillReloadJump.test.ts`'s PAR-81 case), as research 211's
  table lists them (35 and 24 keys, 28 parts). The moving pair (`[166]`, `[167]`) has no `NoInterrupt` (§5.2.8). A
  one-shot lasts its `playback` whatever its `max_velocity` (research 201, U-MOTION-PLAYBACK-RULE); only the driver's end
  test (below) counts for the body.
- *Their push: the stack, never the second channel.* The raise takes the set (`FUN_0058c350`, D:L462105) and pushes
  `FUN_00588bc0(actor, DAT_003df0e0 | DAT_003df0e8, 1, 0, 0)` (D:L462112-462116); the still lower pushes the same type
  with `(.., 0, 1, 0)` (D:L462069-462070, D:L462078-462079), its fourth argument the reverse (D:L446300-446301 ->
  `FUN_0028c160`). `FUN_00588bc0` sends a motion to the second channel only when its row's `BlendOverlay` bit is set
  (D:L446083-446085, `FUN_00587780`) and every other to the stack (`FUN_0028dc90`, D:L446292), which stores the type at
  the play's `+0x2c` and the push's third argument at `+0x2b` (D:L135203-135204). That third argument (1 for the raise, 0
  for the lower) is a kind byte the cut test and the fire gate compare against 8 (D:L418173, D:L418181;
  `FUN_005a7de0` D:L462616), `FUN_005b4340` against 4 (D:L469462), and `FUN_005870e0(actor, 0)` hands to the vtable's
  `+0x90` (D:L445115): neither clip is 8 or 4. *(Was: "compare only against 8" -- the review, F6.)* So both are
  full-body one-shots on top, as PAR-81 and PAR-83 read.
- *The stick and the turn.* With a one-shot on top the driver takes the one-shot branch (`FUN_005551a0(+0x28, 0x40)`
  answering 0, D:L418174-418175): `FUN_00587c20` refuses the cut (the bare `NoInterrupt`) and neither type is 0x35
  (D:L418181), so the stick never cuts them; the end test is `FUN_00582540` (D:L418192-418193); the ground state
  (`FUN_005870e0`) runs only on a cut or the end (D:L418203). No ground state runs under either clip: the SEAL does not
  walk. The turn is free: the turn input `+0x23c` is zeroed under the types D:L418299-418337 test (0x21, 0x23, 0x24,
  8-0xb, 0x2a, 0x2b, 0x2e, `DAT_003def40/50/60`, state 4 or 5, a top of kind 5), none the launcher's; the turn itself
  (D:L418340) is skipped only under `DAT_003deae0` (D:L418338); and `FUN_00551ec0` zeroes the turn only when the top's
  last node carries `NoTurn` (`FUN_00587e00` D:L445581-445593, asked at D:L418699-418702), which neither clip carries
  (research 83's row at its L47; this note's 31 `NoTurn` records, around L1062-1066). *(Was: "the driver's turn
  (D:L418340) is skipped only under the types D:L418299-418337 test ... `FUN_00587e00` D:L418689-418692; research 211's
  flags" -- the cites and the wording wrong, the review, F3.)* The body moves only by the
  clip's root (`FUN_0028c250`): **the raise clips' root was not read** -- the golden carries none and no reader was run;
  `MOTION_P.ZAR` (a committed fixture) holds both clips (candidate `LAUNCHER_RAISE_TRAVEL_PLACEHOLDER`, below).
- *What else, under the raise and the still lower.* `FUN_005a7980` answers whenever either type is **on top**
  (`FUN_00577e40` compares the top's type `actor+0x534`, D:L437398-437411; asked at D:L462484-462491; with a non-zero
  second argument also by `+0x5e1` bit 4, D:L462482), so each of its callers refuses through both clips while they are
  on top. *(Was: "on the stack" -- the review, F4.)* A one-shot pushed over the raise (a knock, a death) lapses these
  refusals while it is on top: `LAUNCHER_RAISE_KNOCK_READING` (below) covers it.
  - **the jump**: refused -- the set's gate (`FUN_005b4340(actor, 0xb)`, D:L469466-469471; PAR-81) and the looped-top
    test (`FUN_0057e1b0` D:L440810);
  - **a fire**: the kit's round asks `FUN_005a7de0(owner, 1, ..)` (`FUN_005c0ae0` D:L476442-476444), which returns 0 when
    `FUN_005a7980` answers (D:L462636-462638), besides the clips' bare `NoFire`: no round, the rocket's included;
  - **a swap and every take**: `FUN_005a8cb0` asks `FUN_005a7de0(actor, 1, 1)` (D:L463159): refused -- the firearm's slot
    (so no lower begins under the raise), the launcher's (no raise under the still lower), a grenade's;
  - **a throw**: its item's take is refused (above); the kit's other use path asks `FUN_005a7de0` too, with a second
    argument 0 that still reaches the stack's test (`FUN_005c0020` D:L475987; D:L462482);
  - **a stance press**: kept by the outer gate (`FUN_00552ec0` D:L418927-418930: no looped top, no transition) -- but the
    raise wrote the request word `+0x374` = 1 when it took the set (`FUN_0058c350`'s fourth argument, D:L447992, from
    D:L462105), the standing state rewrites it to 1 under the set (D:L444853-444854), and the press reads it
    (`FUN_00594cf0` D:L453353, D:L453382); with `+0x174`'s codes 0 stand, 1 crouch, 2 prone (research 211) what a press
    does under the clips and the set is **not read** (candidate `LAUNCHER_SET_STANCE_READING`);
  - **a reload press**: not re-read here (candidate `LAUNCHER_RAISE_RELOAD_READING`);
  - **a flinch**: `FUN_005a2690` pushes none while `FUN_005a7980` answers (D:L460005-460010) -- the room already refuses
    it on the launcher's clocks (`flinchRefusedOn`'s `launcher`, research 217 §4);
  - and the dive (`FUN_00584b00` D:L443995), the slope's slide (`FUN_0054edf0` D:L417195-417198) and the weapon pick-up's
    offer (`FUN_005a81d0` D:L462767).
- *When each ends.* The raise comes off by the driver's end test on its push's clock (PAR-81's `playedOutCommand`): the
  **84th** command from its own for the rifle's clip, the **82nd** for the pistol's, its own being e + 1 (e the `throw`
  event's seq); its end mounts the launcher (`FUN_005a60d0(actor, 4, 1)`, D:L443058-443065) and pops it, and that
  command runs `FUN_005870e0(actor, 1)` (D:L418203) -- under the set the standing state, which pushes no walk
  (D:L444853-444856: only `+0x374` = 1). The looped branch's stick lower is first read on the next command (e + 85 / e +
  83, PAR-83's `launcherBaseCommand`); with the stick at or under 0.1 that branch runs the ground state under the set
  again (D:L418282, D:L418286), which walks nothing **standing**. `FUN_005870e0` dispatches by `+0x174`
  (D:L445163-445171): standing `FUN_00586570` (the set's test above, read); crouched `FUN_00584c60`, which has its own
  test of the set at D:L444069, **unread**; prone `FUN_005845c0` (D:L443837-444035), which names `DAT_0044d408` nowhere,
  **unread** -- and `FUN_005b4340`'s kind-4 branch (D:L469404-469459) refuses no prone stance, while the room's
  `raiseLauncher` (`room.ts` :4222) has no stance test. **So the original's SEAL, standing, never walks with the
  launcher's set on** (crouched as D:L444069 decides, prone unread): through the raise, through the base (until the
  stick's lower, which walks on its own command under the old set, D:L418270-418273), and through the still lower -- the
  same counts from its own command l + 1, its end giving the set back (`FUN_00582540` D:L443058-443062 -> `FUN_005a60d0`
  D:L461769-461771). *(Was: "the original's SEAL never walks with the launcher's set on", read for standing only -- the
  review, F2.)* The pop's command and a stick at or under 0.1 are the two places the base's stand differs from the port
  beyond the clips (candidate `LAUNCHER_SET_STAND_READING`).
- *What the original's own wire carries for them: the push itself, if the type is flagged.* `FUN_00588bc0` ends, for a
  push it made, with: on a network game (`DAT_0045a0c1`), for an actor whose controller's `+0x34` answers 0 and with its
  fifth argument 0, `FUN_002bbaf0(actor id, type, third argument, reverse, 0)` (D:L446408-446416) -- after the stack's
  push and the second channel's alike, never after a failed push (D:L446292-446296 returns first). `FUN_002bbaf0` sends
  the 8-byte Push Blend to every console (`FUN_0030cef0(.., -1, DAT_00440e18, 8, ..)`, D:L160796; research 193 §3) only
  on a network game, only when `FUN_002c2fd0(actor)` answers 0 (D:L160789: the spectator test, research 179 §8.2), and
  only when the type's flag byte has bit 0 (`FUN_005e3720(type)`, `DAT_0044d458`, D:L160790) *(the spectator test was
  omitted -- the review, F5)* -- the bit the anim-set
  loader sets from the row's `network_log` keyword (D:L496507-496511; the string at ELF 0x6626c0 is `network_log`). The
  receiver (`FUN_002bba80` D:L160762-160768, in game state 0x113 = 3) replays it through `FUN_005880e0`'s case 0, that
  is `FUN_00588bc0` on its copy of the actor -- the type, the reverse and the third argument as sent. The raise
  (D:L462112-462116), the still lower (D:L462069-462070, D:L462078-462079), the moving lower (D:L462073, D:L462082) and
  the set's base (D:L447989) all push with the fifth argument 0. The anim set itself (`+0x528`) is not in the message:
  the copy resolves the type through its own set (`FUN_0058c820`, `FUN_005e3d90(actor+0x528, ..)`, D:L446076-446081) and
  pushes nothing when the set lacks it. So the original replicates the raise and the still lower **as the actor's pushed
  action -- the type and its reverse -- not as the anim set's flag**, when `animset.rdr`'s rows for `Rifle -> Launcher` and
  `Pistol -> Launcher` carry `network_log`; otherwise not at all (the others then see the item, research 94 §A6). Which
  of the two is **not read**: no committed golden carries `animset.rdr`'s flags, and no reader was run (research 214 reads
  them on the throws, `Put on wall` and `Place claymore`; research 179 on the deaths and `Prone cover`; research 201 none on
  the binoculars' rows). Candidates `LAUNCHER_RAISE_NETWORK_LOG_READING` and `LAUNCHER_REMOTE_SET_READING` (below). This
  decides what the others' pages draw on the body, not the port's wire format.
- *The port today* (room and page alike, so a parity gap, not a split): the raise and the still lower set only the set's
  window, `launcherUp` and the fire's clocks (`room.ts` `raiseLauncher` / `launcherDown`, `walk.ts` `launcherRaised` /
  `launcherLowered`); the mover holds nothing (`bodyOwner()` null), so the ground state runs and the SEAL walks through
  both. The others receive no action on the body (`BodyState.action` 0), the ground state the room's mover ran, and the
  launcher's id as the body's item from the event's arrival (`room.ts` `bodyOf`'s `item: p.held ?? ..`, :5867). Nothing
  draws either clip, on the own page or another's (§5.2.8).
- *The routes, compared* (the code read; nothing built):
  - **(a) Two names appended to `ACTION_CODES`.** An action holds the body in the port's own model: `Walker.start` puts
    it on `action_`, `bodyOwner()` reports it, and -- **for the actions the tick names, not every action** -- the ground
    state does not run under it: the tick's "root motion, no ground state" branch is an explicit list (`mover.ts`
    :2743-2747: `hit` .. `swapProne`, `proneCover`), past which `locomote` runs (:2770), so the two names must join it
    *(was: "the ground state does not run under it", as of every action -- the review, F1)*; the body moves by the clip's
    root keys (`actionVelocity`, the pack's keys loaded for every `ACTION_CLIPS` name, `mover.ts` :3218, `simMap.ts` :236),
    `NoInterrupt` 1 is never passed (`actionInterruptible`), and its end is heard as an `ActionEnd`. The stance gate keeps
    a press under it (`bodyRefuses`: every family but `transition`), `swapRefused` refuses the swap and, through the
    page's `swapGate`, every take, and `Walker.jump` refuses the jump. On the wire it is the body's existing action field
    (`net/body.ts` `actionCode`: `ACTION_CODES` index + 1 in a u8, the serial in a u8, its clock and length as two u16
    seconds, `codec.ts` :167; the reverse in `BodyFlag.ActionReversed`, bit 2). Two names named by the original's types
    -- `rifleToLauncher` (`seal_rifle2launcher`) and `pistolToLauncher` (`seal_pistol2launcher`), the still lower the same
    name with `ActionReversed` -- carry exactly the pair the original's Push Blend carries: the type and its reverse.
    **An older page is safe** (PF.R33 / PF.R38's `proneCover`, `protocol.ts` :59-63): `snapshotOf` indexes past its table,
    finds no name and draws no action (`net/body.ts` :68-71), the body's ground as the room's mover sends it (idle under
    the listed actions, :2751); no codec
    field, width or byte changes, so `PROTOCOL_VERSION` stays 11. The replay: `replay/fold.ts` reads the action only for
    `heldLanding` (`landDeath`, `landBackwards`) and needs nothing; a recording plays through the same `snapshotOf`.
    What it needs beside the table: the room's and the page's movers must start the clip **on the same command** -- the
    raise is no command bit (the `throw` event carries it) -- which both sides can derive from the event's seq they
    already share since PAR-81 (the raise rides e + 1, the still lower l + 1); the room's `raiseLauncher` /
    `lowerLauncher` must refuse while either clip lives on the event's command (`FUN_005a8cb0` above), by the seqs, since
    the room may run behind the event; every exhaustive map over `MoverActionName` takes the two names (`ACTION_FAMILY`,
    `fireCapability.ts`'s `ACTION_CLIP_NAMES`, `SEAL_ANIMS`, hence `MOTION_CLIPS`); and the remote drawing follows
    `LAUNCHER_RAISE_NETWORK_LOG_READING`.
  - **(b) A hold code.** `HOLD_CODES` holds 15 clips, which fill the four bits on both sides (`HOLD_SHIFT` 12-15 of
    `Command.buttons`, a u16 whose bits 0-11 are the buttons, `Button.Binoculars` the last, `protocol.ts` :190-214;
    `BODY_HOLD_SHIFT` 11-14 of `BodyState.flags`, 15 `HoldSerial`). A 16th code needs a fifth bit: on the command a wider
    field (`codec.ts` :124-149, codecV10 alike), a codec change and a bump (protocol 12, with a decoder for protocol 11's
    `.s2r`); on the body a fifth bit beside 11-14 is bit 15, `HoldSerial`'s, so the code (or the parity) must move to the
    free bits 16-31, and a page that reads four bits at 11-14 still misreads a moved or widened code -- a wrong clip
    drawn, so a bump there too *(was: "on the body bit 16 is free, but a page that reads four bits takes code 17 as code
    1" -- the review, F6)*. And the hold code tells the room a hold the page started; the raise is
    already told by the `throw` event, so the code would say it twice. Not recommended.
  - **(c) A body owner kept off the wire** (as the victory dance's is, `Walker.victoryMotion`). Room and page agree as in
    (a), from the same event seq; but every consumer of the action model must learn a new `BodyOwner` source (the frozen
    contract, additively): the tick's ground state skipped and the root stepped (the dance's `victoryStep`), the end on
    the swap's clock (`swapPlayedOut`), `bodyRefuses`, `swapRefused` (as its `victory` clause), the flinch's gate, the fire's
    gate, `ActionEnd`, the page's dance replay; the own page's animator gets no action to draw (a parallel snapshot field
    would be needed); and the others see no clip, which matches the original only if the rows carry no `network_log`. The
    same agreement at a larger cost, and it hard-codes one answer of an unread flag.
- **Recommended: (a)**, two codes by the original's types, the still lower as `ActionReversed`. It is the smallest change
  that is still room AND page on the same command because the start can live in the one function both movers run each
  command through (`MoverSim.prepare`), asked from a hook each side answers from the event seq it already holds (as
  `MoverSim.holdPass` is answered, PAR-74), so the two movers cannot part on it; everything after the start -- the stand,
  the root, the end on the 84th / 82nd command, the jump, the stance's and the swap's refusals, the snapshot to the others
  -- is the action machinery the port already shares. **The wire: two names appended to `ACTION_CODES` in
  `net/protocol.ts` (a claimed one-line hunk in the online seat's file), with no codec, field or width change and no
  protocol bump -- an older page draws no action for the two codes, as PF.R38's `proneCover`.**
- *The build list* (one row's work; the test RED first in each; room AND page on one commit, PTW.R3):
  1. **The reads the build needs first, as pins** (`roomStillReloadJump.test.ts`, beside PAR-81's case): the two clips'
     root travel through `clipsFromPack` over the committed `MOTION_P.ZAR`, and `animset.rdr`'s rows for `Rifle ->
     Launcher` / `Pistol -> Launcher` through the repository's reader over the tracked `READERC.ZAR` (`network_log` or
     not). They settle the first two candidates below.
  2. **The wire, the online seat's file** (`viewer/src/net/protocol.ts`): the hunk claimed and redotcom-c1 told before it
     lands (the terms on PAR-74's brief and PAR-84's row): `'rifleToLauncher', 'pistolToLauncher'` appended to
     `ACTION_CODES`, the header's additive line beside PF.R38's. RED: a codec round trip of both codes, reversed and not,
     and an older table's decode drawing no action (`netCodec.test.ts`).
  3. **The mover** (`viewer/src/mover.ts`, HOT): the two names on `MoverActionName`; `ACTION_CLIPS` rows (`playback` 1.5,
     35 / 24 keys, `noInterrupt` 1, `travel` from step 1); `ACTION_FAMILY` `swap` (`FUN_005a7980`'s grouping,
     D:L462484-462491); `swapping()` answers them (its own doc is `FUN_005a7980`), but not `swapProgress`, `completeSwap`
     or `remotePlayers.ts`'s `remoteSwap` (the firearm's hand-off clock); **both name lists the tick and the clocks
     keep**: the two names appended to the tick's root-motion branch (`mover.ts` :2744-2747 -- else :2770 runs `locomote`
     and the SEAL walks through the raise while every refusal passes) and to `runClocks`' `swapPlayedOut` end list
     (:2638-2641, today the three swaps' names) *(was: "`runClocks` ends them on `swapPlayedOut` as PAR-80's swaps", the
     tick's list unnamed -- the review, F1)*; a `Walker` start for them (`start`, `vx`/`vz` zeroed as the still swap's).
     RED (`moverHold.test.ts` or its neighbour): a stick held from e + 1 moves the body only by the root through the 84th
     / 82nd command and not after it ends; the jump refused, a stance press kept, a swap refused; reversed the same;
     `ActionEnd` complete.
  4. **The shared step** (`viewer/src/net/moverSim.ts`, outside the HOT list): a `launcherClip(seq)` hook asked in
     `prepare` before the command's swap and hold (the raise is pushed in the controller's frame, before the driver,
     D:L476734 -> D:L461878-461886). RED: `moverSim` unit.
  5. **The room** (`match/src/room.ts`, HOT): the clip's command and firearm kept by `raiseLauncher` (e + 1) and
     `launcherDown` (l + 1, reversed) and answered by the hook, on the dropped backlog's path too (`dropBacklog` lays only
     edges: the start must not wait for a kept command); `raiseLauncher` / `lowerLauncher` refused while either clip lives
     on the event's command (tallied); the two names in `FLINCH_REFUSING_ACTIONS` (`net/deaths.ts`), the `launcher`
     clause kept for the moving lower. RED (`roomEquipment.test.ts`): the room's body stands under a held stick from e + 1
     through e + 84 (rifle) / e + 82 (pistol), the snapshot's body carrying the code; the still lower the same, reversed;
     a lower inside the raise refused.
  6. **The page** (`viewer/src/walk.ts` HOT, `viewer/src/matchThrow.ts`): `launcherRaised` / `launcherLowered` keep the
     clip at `taps + 1` for the page's hook; `KeptCommand` keeps it with the command (the dance's replay, as `pass`);
     `swapGate` then refuses through the mover. RED (`walk.test.ts`): the page's body the room's on the same commands.
  7. **The drawing** (`viewer/src/locomotion.ts` `SEAL_ANIMS`, `net/fireCapability.ts`, `remotePlayers.ts`): the two
     clips mapped (the exhaustive records require it); the own page draws them (the original's local console plays them);
     another page draws them only if step 1 reads `network_log`, else the body's ground (a reading either way, filed with
     step 1's evidence). RED: the animator's wanted play for the code, the remote's per the reading.
  8. **Named for the same row, may be split off:** the set's stand (`LAUNCHER_SET_STAND_READING`: no walk on the raise's
     pop command and under a stick at or under 0.1 while the base is on top); F3's swap with the launcher up playing the
     still lower rather than `swapStand` in `MoverSim.prepare` (`FUN_005a64c0` -> `FUN_005a6b70`, D:L461870-461876;
     unreachable today); the rocket's first round on the action's end (the room's `heldReadyAt` counts 85 commands from
     the event's arrival, the clip's end test the 84th from its own -- §5.2.6's "The fire's clocks").
  **Named split, not new:** a raise the page sends and the room refuses (wading, no round, the moving lower) holds the
  page's body for the clip where the room's walks -- the kind of split the launcher itself already has (the page's
  launcher up, the room's not); whether every room refusal has its page gate is not re-read here.
- *Candidates, named (none in the code yet; each "reading, pending review" until the build files it):*

  | candidate | what it stands in for | what would settle it |
  |---|---|---|
  | `LAUNCHER_RAISE_TRAVEL_PLACEHOLDER` | the raise clips' root over the clip (the body's only motion under them, `FUN_0028c250`) | the root through `clipsFromPack` over the committed `MOTION_P.ZAR` (build step 1) *-- read by the build, 2026-10-14 (reading, pending review; never a constant): `seal_rifle2launcher`'s `skel_root` from key 0 to key 34 (-0.98, 2.80), `seal_pistol2launcher`'s from key 0 to key 23 (-1.00, 2.81), x and z in the model's frame (`roomStillReloadJump.test.ts`, "PAR-84"); `ACTION_CLIPS.rifleToLauncher` / `pistolToLauncher` `travel`, the mover reading the pack's keys where the page has them (`actionVelocity`)* |
  | `LAUNCHER_RAISE_NETWORK_LOG_READING` | whether `Rifle -> Launcher` and `Pistol -> Launcher` carry `network_log` in `animset.rdr` (bit 0 of `DAT_0044d458[type]`, D:L496507-496511; sent only then, D:L160789-160790): whether the others see the clips | the rows through the repository's reader over the tracked `READERC.ZAR` (build step 1), or a capture of a peer's view of a raise *-- read by the build, 2026-10-14 (reading, pending review): `false` -- the four rows (the `SOLDIER` set's and the `launcher anim set`'s, `parseRdr` over the tracked `READERC.ZAR`) carry no `network_log`, where `Throw grenade`'s and `launcher_reload`'s do (the control): no Push Blend for the raise or the still lower; filed in §5.2.11 (`viewer/src/mover.ts`)* |
  | `LAUNCHER_REMOTE_SET_READING` | whether a remote copy holds the launcher's set when a Push Blend for the raise arrives (the copy's `FUN_00588bc0` resolves the type in its own `+0x528`, D:L446076-446081, and pushes nothing without it) | the receiver's handling of the character message's item (research 94 §A6) read, or the same capture |
  | `LAUNCHER_SET_STANCE_READING` | a stance press under the raise, the still lower and the set's base: `+0x374` written 1 by the raise (D:L447992 from D:L462105) and by the standing state under the set (D:L444853-444854), read by the press (D:L453353, D:L453382) | the press and `FUN_00552d60` read under the set, or a capture of a crouch press with the launcher up |
  | `LAUNCHER_SET_STAND_READING` | no walk under the set's base standing (D:L444853-444856; crouched as `FUN_00584c60`'s own test of the set decides, D:L444069, unread): on the raise's pop command and with the stick at or under 0.1, where the port's ground state runs; prone unread (`FUN_005845c0` D:L443837-444035 names `DAT_0044d408` nowhere; `FUN_005b4340`'s kind-4 branch, D:L469404-469459, refuses no prone stance; the room's `raiseLauncher`, `room.ts` :4222, has no stance test) *(was: "no walk under the set's base (D:L444853-444856)", standing only -- the review, F2)* | the port's ground under a stick at or under 0.1 checked against it in a unit test; a capture of the pop command with the stick held |
  | `LAUNCHER_RAISE_RELOAD_READING` | a reload press under the raise and the still lower | the reload press's gate read (its `FUN_005a7de0` / `FUN_005a7ab0` calls) |
  | `LAUNCHER_RAISE_AIR_READING` | a raise or a lower begun in the air (`FUN_00588bc0`'s first gate `FUN_00589900`, D:L446072, unread; the port's `setAirborne` replaces an action) | `FUN_00589900` read |
  | `LAUNCHER_RAISE_KNOCK_READING` | a blast's knock or a death under either clip (`FUN_005a5da0` completes a pending switch, D:L461653-461756, read for the firearm swaps only; the port's `completeSwap` names those) | `FUN_005a5da0` read for the launcher's types |

- *Evidence, apart:* source inspection of the decompilation and the ELF's strings; the golden's rows read as a file; the
  port's code read. No unit, dev-disc, browser, playtest or capture evidence; nothing measured. The corpus
  (`docs/corpus/sections.jsonl`) is not regenerated with this section (`build-corpus` is a node run, which the brief
  refuses during the hold): `corpus.test.ts` reads it stale until the merge regenerates it.
- *Built (PAR-84's build, 2026-10-14; route (a), steps 1-7; reading, pending review).* Unit and dev-disc tests over
  the tracked fixtures; no game, capture or browser run.
  1. *The reads* (`roomStillReloadJump.test.ts`, "PAR-84"): the root travel and the rows' flags, filed in the table
     above and §5.2.11.
  2. *The wire* (`viewer/src/net/protocol.ts`, the online seat's agreed hunk): `rifleToLauncher` and `pistolToLauncher`
     appended to `ACTION_CODES` (codes 21 and 22) and the header's additive line beside PF.R38's; no codec field, width
     or byte, `PROTOCOL_VERSION` 11 (`netCodec.test.ts`, "PAR-84": both round-trip, reversed or not; an older table finds
     no name for 21 or 22).
  3. *The mover* (`viewer/src/mover.ts`): the two names on `MoverActionName`; `ACTION_CLIPS` rows (playback 1.5, 35 / 24
     keys, `NoInterrupt` 1, the read travel); `ACTION_FAMILY` `swap`; `swapping()` answers them (`swapProgress`,
     `completeSwap` and `remotePlayers.ts`'s `remoteSwap` do not); both name lists (the tick's root-motion branch and
     `runClocks`' `swapPlayedOut` end); `Walker.launcherClip(name, reversed, elapsed)` (the velocity zeroed as the still
     swap's; a late start's clock caught up; none past its end; in the air `LAUNCHER_RAISE_AIR_READING`);
     `launcherClipName`; `dropLauncherClip` (a spawn's kit on the page). `moverHold.test.ts` "PAR-84": a stick held from
     the clip's own command moves the body only by the root through its 83rd / 81st command, the 84th / 82nd ends it
     `complete` (the ground state from there), reversed the same; the jump refused, a stance press kept and taken at the
     end, the swap refused.
  4. *The shared step* (`viewer/src/net/moverSim.ts`): `MoverSim.launcherClip(seq)`, asked in `prepare` after the jump
     and the Action and before the swap and the hold (the item swap's path, D:L476734 -> D:L461878-461886); absent, the
     room's kept clips (`LauncherClips`: `keep`, `next`, `liveOn`), which start a clip on the first command run at or
     after its own -- a command lost past its wait, or dropped with a backlog (whose drop lays only presses), starts it
     on the next one run, its clock caught up (`moverSim.test.ts` "PAR-84").
  5. *The room* (`match/src/room.ts`): `raiseLauncher` keeps the raise's clip at e + 1 and `launcherDown` the still
     lower's at l + 1 (when that command is still to run: `aim`'s swap with the launcher up has run its own, step 8);
     a raise refused while either clip lives on the command it rides (`throw: launcher clip`), and -- one line in
     `lowerLauncher`, outside the claim's two functions, as step 5 asks -- a lower the same; the dropped backlog's path
     through `LauncherClips.next`, no `dropBacklog` change. `net/deaths.ts`: the two names in
     `FLINCH_REFUSING_ACTIONS`, the `launcher` clause kept. `roomEquipment.test.ts` "PAR-84": the room's body stands
     under a held stick through e + 83 / e + 81, the snapshot's body carrying code 21 / 22; the still lower the same,
     reversed (`BodyFlag.ActionReversed`); a lower inside the raise and a raise inside the still lower refused (tallied);
     a dropped backlog's raise started on the kept command, its clock caught up. `flinch.test.ts` "PAR-84".
  6. *The page* (`viewer/src/walk.ts`): `launcherRaised` / `launcherLowered` start the clip on the page's mover at the
     press (as its swap) and keep it with the command it rides (`KeptCommand.launcher`, `taps + 1`), which the run under
     a victory dance answers the hook from (none while the dance is on the mover: the room drops a `throw` while its
     dance plays, `victoryPlaying`; the page's launcher state is not undone there, a split of PAR-37's kind); the swap's lower with the launcher up (F3) plays none (step 8);
     `launcherCleared` drops it; `swapGate` refuses through the mover. `matchThrow.ts` unchanged (its `equip` already
     calls both). `walk.test.ts` "PAR-84": the page's feet are the room's (`MoverSim` with the kept clips over the page's
     own commands) on every command through the raise and the still lower, from the rifle and the pistol; the take
     refused through the still lower. (PAR-83's "the kit's lower plays no moving lower" now finds the take closed through
     the still lower's 84 commands, then open.)
  7. *The drawing*: `SEAL_ANIMS` maps the two (`locomotion.ts`; `fireCapability.ts`'s `ACTION_CLIP_NAMES`, `NoFire`
     bare); the own page's animator plays `seal_rifle2launcher` / `seal_pistol2launcher`, backwards for the lower
     (`animator.test.ts` "PAR-84"); another page drops the two for drawing (`remotePlayers.ts` `remoteBodyAction`, by
     `LAUNCHER_RAISE_NETWORK_LOG_READING` false) and plays the body's ground, idle (`remoteLauncher.test.ts`).
     *(Corrected 2026-10-14 by [research 324](324-the-equipped-weapon-on-others-bodies.md) §4 and its build row R1,
     the gameplay controller's ruling after review: no Push Blend is sent, but each copy plays the raise and the lower
     itself from the character message's item -- `FUN_005c8a20` -> `FUN_005c50b0` class 4 -> the copy's
     `FUN_005c1660` -> `FUN_005a64c0` -> `FUN_005a6d30` (D:L461886, D:L462105-462116), the lower by `FUN_005a6b70`
     (D:L461875) -- so another page is to draw the two from the body's action. Was: "another page drops the two for
     drawing ... and plays the body's ground, idle", as above.)* *(Built 2026-10-14 by NU-6 R1 with P3, research 324
     §6: another page draws the two from the body's action, the launcher in the hand (`REMOTE_LAUNCHER_HAND_READING`);
     `remoteLauncher.test.ts`'s two cases inverted. Was: "is to draw".)*
  - *Not built (step 8), each on its named default (§5.2.11):* the set's stand (`LAUNCHER_SET_STAND_READING`: the
    port's ground state still runs on the raise's end command and with the stick at or under 0.1 under the base); F3's
    swap with the launcher up playing the still lower rather than `swapStand` in `MoverSim.prepare` (unreachable from
    the page); the rocket's first round on the action's end (the room's `heldReadyAt` from the event's arrival, 85
    commands; the page's own wait in frame seconds); `LAUNCHER_SET_STANCE_READING`, `LAUNCHER_RAISE_RELOAD_READING`,
    `LAUNCHER_RAISE_KNOCK_READING`, `LAUNCHER_REMOTE_SET_READING`. Unchanged: the named split of a raise the page sends
    and the room refuses (wading, no round, the moving lower) -- the page's body held for the clip where the room's walks.
  - *Evidence, apart:* unit tests and dev-disc tests (the tracked `MOTION_P.ZAR` and `READERC.ZAR`), one file at a time;
    no typecheck, build, browser, playtest or capture run.

#### 5.2.11 Readings (PAR-84)

| name | value | what it stands in for | what would settle it |
|---|---|---|---|
| `LAUNCHER_RAISE_NETWORK_LOG_READING` (`viewer/src/mover.ts`; `viewer/src/remotePlayers.ts` `remoteBodyAction`) | `false`: no row of `Rifle -> Launcher` or `Pistol -> Launcher` in `animset.rdr` carries `network_log` (read over the tracked `READERC.ZAR`, 2026-10-14; reading, pending review), so the original sends no Push Blend for the raise or the still lower (`FUN_002bbaf0` D:L160789-160790) and another page drops the two codes for drawing, playing the body's ground *(its drawing consequence corrected 2026-10-14 by [research 324](324-the-equipped-weapon-on-others-bodies.md) §4, R1: the value stands -- no Push Blend -- but each copy plays the raise and the lower itself from the item, D:L461886, D:L462097-462130; another page is to draw the two -- drawn since NU-6 R1, 2026-10-14, research 324 §6. Was: "and another page drops the two codes for drawing, playing the body's ground")* | whether the others see the clips: the flag is read off the file, not measured running | a capture of a peer's view of a raise and a still lower |
| `LAUNCHER_RAISE_AIR_READING` (`viewer/src/mover.ts` `Walker.launcherClip`) | `'refused'`, **assumed, not cited**: a launcher clip asked of a mover in the air starts none; the page's take is refused there already (`swapGate` -> `swapRefused`), so only a room airborne on the clip's command while the page was not meets it | whether the original pushes the raise in the air: `FUN_00588bc0`'s first gate `FUN_00589900` (called at D:L446072) is read only in the first 40 lines of its body (from D:L446425), which carry no airborne test; the rest is unread *(F2 of PAR-84's review, 2026-10-14; was "unread for the launcher's types", which read as a cite)*; and the port's fall replaces an action where the original pushes `Jump fall` over it | `FUN_00589900` read whole for the launcher's types (its airborne test, if any), or a capture of a raise begun at a ledge's edge |
| `LAUNCHER_RAISE_TRAVEL_PLACEHOLDER` | read: (-0.98, 2.80) from the rifle, (-1.00, 2.81) from the pistol, `ACTION_CLIPS`' `travel` (§5.2.10's table) | the raise clips' root over the clip | resolved 2026-10-14 (PAR-84's step 1; never a constant) |
| `LAUNCHER_SET_STAND_READING` | the port's default: its ground state runs on the raise's end command and under the set's base with the stick at or under 0.1 (the standing state pushes no walk under the set, D:L444853-444856; crouched `FUN_00584c60` D:L444069 and prone `FUN_005845c0` unread) | the stand under the set, beyond the clips | a unit test of the port's ground under the base held against D:L444853-444856, or a capture of the pop command with the stick held; *note only* |
| `LAUNCHER_SET_STANCE_READING` | the port's default: a stance press under either clip kept by the outer gate (D:L418927-418930) and taken at the clip's end; under the base it is taken | the request word `+0x374` the raise writes 1 (D:L447992 from D:L462105) and the standing state rewrites under the set (D:L444853-444854), which the press reads (D:L453353, D:L453382) | the press and `FUN_00552d60` read under the set, or a capture of a crouch press with the launcher up; *note only* |
| `LAUNCHER_RAISE_RELOAD_READING` | the port's default: unchanged (the page's and the room's reload gates as before PAR-84) | a reload press under either clip | the reload press's gate read (its `FUN_005a7de0` / `FUN_005a7ab0` calls); *note only* |
| `LAUNCHER_RAISE_KNOCK_READING` | the port's default: a blast's knock or a death takes the clip off as any action (`Walker.knock`, `endBody`), the set's window on its own clock | `FUN_005a5da0` (D:L461653-461756) for the launcher's types (read for the firearm swaps only) | that read; *note only* *(F1 of PAR-84's review, 2026-10-14: the room's refusal of a take under a clip follows the walker's action -- a knock, a death or a fall that took the clip off ends it there, as the page's `swapGate` asks its mover; a kept clip not yet started is still refused on the seqs (`moverSim.ts` `LauncherClips.liveOn`). Was: the seqs' window alone, to the clip's 84th / 82nd command.)* |
| `LAUNCHER_REMOTE_SET_READING` | the port's default: none -- another page draws its ground (`LAUNCHER_RAISE_NETWORK_LOG_READING` false sends no push to resolve) | whether a remote copy holds the launcher's set when a push arrives (D:L446076-446081) | the receiver's handling of the character message's item (research 94 §A6) read; moot while no push is sent; *note only* *(moot, 2026-10-14: [research 324](324-the-equipped-weapon-on-others-bodies.md) §1.3, §4, R1 read the receiver -- the copy sets the launcher's set itself in `FUN_005a6d30` (D:L462105) on its own raise from the item, not from a push. Was: "moot while no push is sent")* |

#### 5.2.12 Another console's copy of the flinch is cut by the victim's replicated stick (LATER 404, 2026-10-24): reading, pending review

Source inspection of the decompilation, and the game ELF's words (`dist/socom2_game.elf`, the binary the decompilation
was made from) for one virtual table and two leaf functions the decompilation does not list. No game run, no capture;
nothing here is measured. It reads `FLINCH_CUT_REMOTE_READING` (5.2.2), LATER 404 / issue #502's first unknown.

- *The stick reaches the other console.* The SealObject's bytes 0x7a, 0x7b, 0x7c carry the victim's controller axes
  +8, +0x10, +0xc times 127 (research 193 4.1 rows 11-13, `FUN_002bd640`); the reader `FUN_002be150` hands each,
  times 1/127, to the remote controller's slot +0x20 with an index 0, 2, 1 (D:L162295-162308). `CRemoteCtrl`'s table
  is 0x669590 (its +0x0c the PreTick `FUN_005e6400` and +0x34 `IsRemote` `FUN_005e6260`, as research 193 reads them):
  its +0x20 word is `0x567340`, a leaf the decompilation does not list -- `sll v1, a1, 2`; `addu v1, v1, a0`; `jr ra`;
  `swc1 f12, 8(v1)`: the value stored at the controller's +8 + 4 x index. So the remote controller holds the victim's
  move axes at +8 / +0xc and its turn at +0x10, the fields the local controller's are read from.
- *The copy runs for a remote SEAL.* `FUN_00551ec0` (the body table's +0x14, run every frame for every object on the
  entity list before the ground driver at +0x18, 5.2.3) copies the controller's +0x10, +8, +0xc into `+0x23c`,
  `+0x240`, `+0x244` (D:L418613-418615) on its living branch, with no `IsRemote` (+0x34) test on it -- that test sits on
  the dead or spectating branch alone (D:L418511-418521). The copy runs under the controller tick's answer: slot +0xc's
  result kept in `+0x105c` bit 0x40 (D:L418526-418527) and tested before the copy's block (D:L418531); a remote
  controller's +0xc, `FUN_005e6400`, returns 1 (D:L497496), so the bit stands and the copy runs. The movement scale (`+0x1368`) multiplies them only when the
  controller's +0x2c answers (D:L418617-418624): `CRemoteCtrl`'s +0x2c word is `0x5e6250`, `jr ra` / `daddu v0, zero,
  zero` -- 0, so a remote SEAL's axes are the replicated ones unscaled.
- *So the cut runs there too.* The ground driver `FUN_00550ef0` (+0x18) reads those three axes for its cut under a
  one-shot top (5.2.1, D:L418174-418185): on another console the victim's copy of the flinch (`FUN_005a2390`, research
  193 4.1) is popped at the second driver tick that sees it, once its `NoInterrupt` has passed, when the victim's
  replicated stick or turn stands past 0.1 -- the same rule as the victim's own, on the stick as last received (the
  SealObject's update cadence, its s8 steps of 1/127).
- *Not read here:* the remote SEAL's move once the clip is popped (its target `+0x1fc`, research 193 row 1); and the
  flinch's layer (`FLINCH_LAYER_PLACEHOLDER`, research 91 21.1), LATER 404's second unknown.
- *Built* (2026-10-24, LATER 404; `viewer/src/remotePlayers.ts` `stepFlinch` -> `remoteCut`): another page's flinch, and a
  program's pushed one-shot (a door's `Open door`), ends as the victim's own -- from `FLINCH_CUT_COMMANDS` after the
  push and past the clip's `NoInterrupt`, when the snapshot's ground axes (`cutStick`, the victim's replicated stick)
  or `turnRate` stand past 0.1 (`play.ts` `reloadCut`) -- not at the clip's end. The clock is the event's arrival (the
  event carries no tick), the stick the last snapshot's. Tests: `flinch.test.ts` (a moving victim, a still one, a turning
  one, a door clip inside and past its `NoInterrupt`).

## 6. The quirks for the owner

These are open decisions or requests for a reproducible example, not new rulings. Confidence of source mechanisms
is **reading, pending review**; a remembered exploit name alone is not enough to select an implementation.

**User report, not a capture scored by this audit:** Craig, quoted by the controller in
`controller-to-dot.md`, 2026-10-08T23:18Z, line 583, with the original game open:

> ninja jump / wall slide are old names for the SAME glitch. You set grenades or flashbangs to quick 2, go guns hot while standing, turn the view right or left and press the button and you go flying backwards. A similar one happens lying prone, shooting, triangle triangle right triangle (I think?) -- you'll have to look that one up.

| Quirk | Gameplay effect supported by this audit | Open decision / evidence needed |
| --- | --- | --- |
| the launch glitch (ninja jump / wall slide) | Craig reports a backward launch from standing, weapon raised, turning the view and selecting a grenade/flashbang in quick 2. The historical written instructions below support Craig's prone input memory; the runtime sequence remains unverified. | Mechanism **reading, pending review** (`reading-pending-review`): the connected turn-step/pose-transition path below is a candidate, not a demonstrated launch. Capture the standing case and prone variant separately; naming alone does not establish a shared cause. No port reproduction is claimed. |
| Historical written instructions (launch-glitch sub-row) | **Prone Ninja Jump** (credit: Mikie): start prone; fire to raise the weapon; two rapid, light Triangle presses; a small rightward nudge of the right stick; a firm Triangle press.<br>**Backwards Ninja Prone** (credit: `l)NAS`): grenade in quick 2; single-shot primary; fire twice; move the right stick left and press Triangle + quick 2 together. Starting stance and flashbang equivalence are unspecified.<br>**Stand Ninja Jump (Illusion)** (credit unknown): start standing; fire to raise the weapon; tap Triangle; right stick left; jump and perform Triangle -> left -> Triangle (the final "left" control and timing are unspecified). | [Xisto post](https://xisto.com/discuss/topic/2828-socom-2-glitches-learn-socom-2-glitches-before-patch/) by ProfBob, 2005-08-28; [Activeboard archive](https://71561.activeboard.com/index.spark?aBID=71561&p=3&topicID=4679529) by SnowboardBum, 2005-11-08. Activeboard repeats the Xisto list; **not independent** validation. These are separate guide input sequences supporting Craig's input memory, not proof of a shared mechanism. No exact executable/build, frame intervals, pressure threshold or demonstrated outcome is verified. |
| Animation cancels | Qualifying original phase/axis cuts can replace full-body actions or carry overlays; knock/flinch/death have different ownership. | **held for the owner's manual validation in the original**. Preserve the existing source finding; no blanket cancel/refund or no-cancel policy follows. |
| Prone reload cut retaining magazine | Selected magazine commits at accepted clip start; valid prone move cut has no moving overlay and can end reload-family lock early without undoing that selection. | **held for the owner's manual validation in the original**. Capture exact first usable shot; this is not ammunition creation or a partial-magazine rollback. |
| DEFAULT fire-mode double tap | Source double tap changes once, short tap does not, sustained hold repeats. Current edge route changes on accidental short press and double-steps a double tap. | **held for the owner's manual validation in the original**. Retain the DEFAULT/ALTERNATE distinction and the existing timing finding; no new owner exception. |

**Superseded interpretations:** the former "Ninja jump" row (standing Jump plus premature prone and standing
speed) and former "Wall slide" row (into-wall air carry restored after contact) are superseded as explanations of
Craig's reported exploit by the single launch row above. Their bounded port discrepancies remain in sections 1/3
and section 8's case index; this correction neither retracts them nor identifies either as the historical launch.

Source-only follow-up against `main 5091553d620be54c6bb22f1d2ccd4740d6ffbf6d`, refreshed read-only on
2026-10-08. The decomp SHA256 above was rechecked; `game/disc/socom2_game.elf` matches the inspected overlay ELF's
SHA256 and size above. No asset root samples or original runtime were measured in this follow-up.

- **Selection is identifiable; it is not itself a throw.** `FUN_00594cf0` D:L453301-453311 accepts semantic
  input 10 on first-down, checks body/item/kit eligibility and passes the second configured selection at controller
  +0x228 to `FUN_005c4b10` (the adjacent first selection is D:L453288-453299). The selection routine changes kit
  +0x824, D:L478840-478847, and routes category 0x79 through equipment kind 3, D:L478882-478905; the category's
  grenade name/range is `FUN_003d17d0` D:L324258-324259 / `FUN_003d1a60` D:L324342. `FUN_005c50b0`
  D:L478989-478995 sets the pending take-up; `FUN_005c1660` D:L476708-476735 dispatches `FUN_005a64c0`.
  For a firearm-to-kind-3 transition its D:L461866-461920 branch snapshots the pose and sets a .3-s fade, without
  creating the 0x35/0x36/0x37 firearm-swap one-shot. A throw therefore needs separate evidence, not the slot press alone.
- **The view turn reaches a special root consumer.** Standing dispatch `FUN_005870e0` D:L445158-445166 reaches
  `FUN_00586570`; with movement axes at rest and turn nonzero, D:L444861-444944 reaches `FUN_00586050`, which
  pushes/keeps Step 0x10, D:L444666-444698. `FUN_00583960` D:L443530-443541 controls its signed playback speed.
  `FUN_0057a330` D:L439110-439145 caches the sampled root at actor +0x14c0 and, while the previous-sample bit is
  set, replaces local velocity with `(previousRoot - currentRoot)/dt` for Step, Crouch step, Prone turn and the
  buddy-carry step (`DAT_003deeb8`, D:L439128-439129; the review's F1); first sample is zero, a motion outside that
  set clears the bit. `FUN_00309200` D:L207498-207503 settles the subtraction order.
  ELF 0x57b02c-0x57b060 and 0x57b0a8-0x57b164 confirm the cache, motion checks, reciprocal-dt scale and velocity stores.
- **The candidate seam is a changing pose entering that difference.** Selection calls `FUN_005dfff0` to zero
  the equipment aim-envelope durations, `FUN_005c4b10` D:L478849-478856 / D:L494293-494299. The loop's raised-pose
  layer is selected/weighted from that envelope before sampling, `FUN_0057a330` D:L438802-438858; sampling occurs
  at D:L439091, before the difference. The take-up fade branch does not itself clear the previous-root bit.
  A discontinuity between these posed-root samples can consequently become movement; whether Craig's inputs
  create such a discontinuity, its sign/magnitude and the relevant phase are **unresolved**. The outer pose fade
  occurs after root extraction (`FUN_00550ef0` D:L418454-418455), so the .3-s fade alone is not a launch explanation.
- **The movement sink and competing leads stay distinct.** `FUN_0054d9a0` rotates local velocity through the
  updated facing and scales by dt, D:L416479-416520. The reciprocal dt above does not alone amplify displacement;
  yaw alone does not increase speed. Carry is consumed only under its separate predicates, D:L416524-416530.
  Reference steering requires play +0x78 and the loop/nonloop dispatch, `FUN_0057a330` D:L439017-439024;
  the one-shot error/dt term is `FUN_005b3340` D:L468928-468946. Neither a nonzero steering reference nor an
  airborne/carry transition has been established for Craig's standing slot press. Section 3's wall projection
  and section 5's one-shot steering law are leads, not the identified cause.
- **Prone has a shared primitive, not an established shared exploit.** `FUN_005845c0` D:L443897-443932
  selects Prone turn 0x1c, one of the same root-difference cases above. `FUN_00594cf0` D:L453336-453351 distinguishes
  pressure >=.3 from a lighter press acted on as pressure falls, then chooses different stance requests at
  D:L453351-453425. This makes pressure and pending/current stance relevant capture channels for Craig's
  tentative triangle sequence. It does not verify that sequence, its historical name, a shared failure or a
  standing/prone equivalence. Public-guide provenance and written sequences are recorded in the historical written
  instructions sub-row above; original-game validation remains outstanding.


## 7. What a capture would settle

- **The crate climb cut by the claymore (section 3.3; issue #96):** US retail, DEFAULT preset, standing, X at a
  crate's climb prompt on MP2, the place button at about 0.6 s into the climb (phase about 0.5); per frame the actor's
  x/y/z (`+0x404`/`+0x1c`), the current action `+0x534` and the play stack depth `+0x1c8`, the local and a peer's
  view -- the climb's root stopping and the fall beginning on the press frame, the y curve after (a free fall from
  mid-rise, then the step), and a rifle round pressed mid-climb (refused) against the claymore (taken).
Confidence of the proposed experiments: **reading, pending review** for their source targets; runtime outcomes
remain unmeasured. Pin executable/disc, revision, emulator/recomp build, active patches and runtime hooks first.
A native recomp run is not automatically untouched retail. r0004 has different addresses/fields; do not apply
r0001 offsets without mapping. Existing static screenshots and prior capture summaries do not score these actions.

| Bounded capture | Record / discriminator |
| --- | --- |
| Launch report: standing, raised weapon, grenade/flashbang in quick 2, view left/right then selection | Pin exact executable/patch, control preset, assigned item, pressure/edges and frame spacing; no-turn, lowered-weapon, firearm-slot and both-turn-direction controls. Record local and peer views plus body motion/phase, aim weight, actor +0x14c0 samples, +0x105f previous-sample bit, local velocity +0x2c, world velocity +0x64, facing, play +0x78/steer, carry +0x1350, ground/contact and final displacement. Distinguish an injected root delta, steering, carry and collision response; measure backward sign and distance, not just the visual pose. |
| Tentative prone launch: shooting, triangle triangle right triangle (?) | Preserve Craig's uncertainty; compare each historical recipe separately. Pin executable/build/revision, control preset, analog pressure, input timing/order/overlap, starting/desired/current stance, raised-weapon state, turn direction, and local and peer views. Test separately from the standing quick-2 case, with turn/no-turn and pressure controls; trace whether Prone turn 0x1c reaches the same root-difference anomaly. Shared names or a shared helper alone do not establish the same mechanism. |
| Reload no-cut and boundary cuts | Magazine before press/accepted start, top/overlay IDs, phase, clip end and first accepted shot. Separate continuous model from sampled frame. |
| Still reload -> stance/jump; moving swap -> dive | Requested/current stance, top flags and overlay family before/after. Moving-reload and no-swap controls prevent an overbroad gate. |
| Accepted reload then one controlled reaction | Stack/overlay removal, Fire capability and new reaction NoFire. Separate accepted reload interruption from server-rejected reload journal undo. |
| Forward/reverse swap and overlay | Callback phase, trigger, parent mount, item/slot and direction. Confirm shared units, not guessed delay. |
| Explosive wind-up/short pressure/late pitch/cut | Hold/power, pending bit/timer, current hand/elevation, ammo and body/pose end. Keep released projectile alive after cut. |
| C4 forced pop | Timer/callback removal and normal deadline first; investigate long fallback separately with owner agreement. Do not silently wait 99 s and call it an intended mechanic. |
| Low-roof still/running jump | Posed head transform, clearance query/hit and accepted action; open-roof control. |
| Air wall contact and wall end | Carry, actual velocity, contact normal and position; whether inward carry stays removed beyond contact. |
| Steep slope standing/prone | Ground normal/span, accumulated descent, motion/action, displacement. Short-span prone predicate as follow-up. |
| Inactive ceiling | Real map owner active transition and stand request before/after. First establish such overhead geometry exists. |
| DEFAULT/ALTERNATE fire mode | Saved setting, sampled edge states, timers and mode-change events for tap/double tap/hold. |
| Flinch cut by the stick (PAR-60, §5.2.1) | A victim moving or turning through a non-lethal hit, and a still control: per frame the top's action and phase and the three axes; the frames of the push and of the pop; on a peer, its copy's top action per frame (`FLINCH_CUT_DELAY_READING`, `FLINCH_CUT_REMOTE_READING`). |
| Bullet death and one-shot traversal/turret entry | Selected clip, signed root, play speed/weight, reference error/steer, actor collision position and last-key timing; paired videos for endpoint blend. |

The prepared original-run harness remains gated on fresh available RAM >=3 GiB, quiet gate, host lock and a
controller-reserved nonoverlapping window. No runtime was launched or window taken for this consolidation. User-owned
sessions are not terminated to create headroom. Resource measurements and exact execution logs remain in the Codex
evidence folder, outside the tracked note.

### 7.1 Tests, evidence and handoff limits

The five files under `packages/viewer/test/parity/` contain expected failures only for confirmed narrow mismatches.
Setup/execution and fixture controls run outside `it.fails`, so fixture/import errors fail normally. A repaired
contract makes its expected-failure test fail unexpectedly; review the integration boundary and convert it to an
ordinary passing test with the fix. The component-wiring probes do not substitute for page/server integration.

Historical evidence in the Codex evidence folder:

- Slice 1: `parity-audit/controller-final-report.txt`, action probe and recorded reload/swap clocks.
- Slice 2: `slice2-audit/controller-final-report.txt`, `observed-explosives.json`, eight intentionally red assertions
  among 68 checks (60 ordinary passes). Original-contract failures were not counted as parity success.
- Slice 3: `slice3-audit/controller-final-report.txt`, `probe-observations.json`, eight intentionally red assertions
  among 33 checks; 22 existing baseline tests plus three controls passed. Initial loose prone check was corrected.
- Slice 4: `slice4-audit/input-probe-results.json`: 14 observation/control assertions, three demonstrated timing
  discrepancies; not 14 parity passes. ACT supplement pinned separately above.
- Slice 5: `slice5-audit/root-probe.json`: 61 clips, 22 death clocks, 13 observation assertions; static
  `steer-disassembly.json` and `elf-labels.json`. No world-trajectory or runtime proof.
- Consolidated patch: `research-230/research-230.patch`, author details and exact focused validation in
  `research-230/RUNS.txt`. Required document/ledger/conventions results and any corpus follow-up are recorded there.

No implementation change, owner exception, merge, deployment, original-runtime proof or independent review is
claimed by this note. The controller owns guarded application, fresh review, any required corpus update and landing.

## 8. Preserved case-to-sprint index (2026-10-08)

This is a static inventory of the 47 historical expected-failure cases in the five tracked parity files at
`5a83f65a5d3022cf62cda432fbebcd0959bb03ce`, not a new test run or an original-game capture. The source and disc
pins in this note remain authoritative. An expected failure recorded as passed means the mismatch stood.
The adopted PARITY plan preserves the confidence, falsifiers, capture gates and acceptance boundaries for D01-D20,
E01, R01 and P01. Its two halves retain all 27 PAR rows; the implementation owner is the gameplay seat.

Each case below has one primary PAR owner. Jump-to-prone is part of the shared PAR-19 gate, not a second movement
defect. The 22 death clip names are the actual historical fixture-expanded cases; missing fixtures remain explicit
skips, and any later fixture/version change requires its own inventory. The unprobed findings and controls remain
in sections 1-7 and the adopted plan; this index does not imply that 47 cases cover every behavior.

Files are relative to `packages/viewer/test/parity/`. IDs remain tied to the exact title and pinned source.

| case id | file / exact case title | finding | primary sprint row |
|---|---|---|---|
| action-01 | `actionStack.test.ts`: defers stance while a still crouch reload owns the body | D01 | PAR-19 |
| action-02 | `actionStack.test.ts`: defers stance while the full-body swap owns the body | D01 | PAR-19 |
| action-03 | `actionStack.test.ts`: refuses a dive during a moving weapon swap | D03 | PAR-19 |
| action-04 | `actionStack.test.ts`: stand swap waits for the original callback phase | D05 | PAR-19 |
| action-05 | `actionStack.test.ts`: crouch swap waits for the original callback phase | D05 | PAR-19 |
| action-06 | `actionStack.test.ts`: prone swap waits for the original callback phase | D05 | PAR-19 |
| explosives-01 | `explosives.test.ts`: rejects a 0-tick under-threshold tap | D10 | PAR-20 |
| explosives-02 | `explosives.test.ts`: rejects a 1-tick under-threshold tap | D10 | PAR-20 |
| explosives-03 | `explosives.test.ts`: rejects a 3-tick under-threshold tap | D10 | PAR-20 |
| explosives-04 | `explosives.test.ts`: permits shoulder selection during pre-release wind-up | D07 | PAR-19 |
| explosives-05 | `explosives.test.ts`: uses current elevation when the hand opens | D11 | PAR-20 |
| explosives-06 | `explosives.test.ts`: defers stance during the accepted full-body throw | D01 | PAR-19 |
| explosives-07 | `explosives.test.ts`: ends throw busy state with the movement cut | D08 | PAR-19 |
| explosives-08 | `explosives.test.ts`: does not commit C4 at the normal deadline after its source callback was removed | D09 | PAR-20 |
| movement-01 | `movement.test.ts`: refuses jump at speed 0 with a solid hit in the posed-head ray | D13 | PAR-21 |
| movement-02 | `movement.test.ts`: refuses jump at speed 40 with a solid hit in the posed-head ray | D13 | PAR-21 |
| movement-03 | `movement.test.ts`: keeps the inward carry removed after contact ends | D14 | PAR-21 |
| movement-04 | `movement.test.ts`: slides a standing body down eligible steep ground at rest | D15 | PAR-21 |
| movement-05 | `movement.test.ts`: accelerates prone descent instead of constant collision push-out | D15 | PAR-21 |
| movement-06 | `movement.test.ts`: slides prone on eligible ground without side-collision flags | D15 | PAR-21 |
| movement-07 | `movement.test.ts`: ignores an inactive overhead owner for stance headroom (a plain `it` since 2026-10-11, §3.4) | D16 | PAR-21 |
| movement-08 | `movement.test.ts`: does not switch directly to prone inside the standing Jump action | D01 | PAR-19 |
| input-01 | `inputTiming.test.ts`: single tap | D17 | PAR-22 |
| input-02 | `inputTiming.test.ts`: double tap | D17 | PAR-22 |
| input-03 | `inputTiming.test.ts`: held for 31 original ticks | D17 | PAR-22 |
| root-01 | `rootMotion.test.ts`: death_stand_chest01 reaches its last key at the one-shot source-model end | D20 | PAR-23 |
| root-02 | `rootMotion.test.ts`: death_stand_chest02 reaches its last key at the one-shot source-model end | D20 | PAR-23 |
| root-03 | `rootMotion.test.ts`: death_stand_groin01 reaches its last key at the one-shot source-model end | D20 | PAR-23 |
| root-04 | `rootMotion.test.ts`: death_stand_groin02 reaches its last key at the one-shot source-model end | D20 | PAR-23 |
| root-05 | `rootMotion.test.ts`: death_crouch_back01 reaches its last key at the one-shot source-model end | D20 | PAR-23 |
| root-06 | `rootMotion.test.ts`: death_crouch_chest01 reaches its last key at the one-shot source-model end | D20 | PAR-23 |
| root-07 | `rootMotion.test.ts`: death_crouch_chest02 reaches its last key at the one-shot source-model end | D20 | PAR-23 |
| root-08 | `rootMotion.test.ts`: death_crouch_head01 reaches its last key at the one-shot source-model end | D20 | PAR-23 |
| root-09 | `rootMotion.test.ts`: death_stand_head01 reaches its last key at the one-shot source-model end | D20 | PAR-23 |
| root-10 | `rootMotion.test.ts`: death_stand_head02 reaches its last key at the one-shot source-model end | D20 | PAR-23 |
| root-11 | `rootMotion.test.ts`: death_stand_head03 reaches its last key at the one-shot source-model end | D20 | PAR-23 |
| root-12 | `rootMotion.test.ts`: death_stand_head04 reaches its last key at the one-shot source-model end | D20 | PAR-23 |
| root-13 | `rootMotion.test.ts`: death_stand_larm02 reaches its last key at the one-shot source-model end | D20 | PAR-23 |
| root-14 | `rootMotion.test.ts`: death_prone_chest01 reaches its last key at the one-shot source-model end | D20 | PAR-23 |
| root-15 | `rootMotion.test.ts`: death_stand_larm01 reaches its last key at the one-shot source-model end | D20 | PAR-23 |
| root-16 | `rootMotion.test.ts`: death_stand_rarm01 reaches its last key at the one-shot source-model end | D20 | PAR-23 |
| root-17 | `rootMotion.test.ts`: death_stand_chest03 reaches its last key at the one-shot source-model end | D20 | PAR-23 |
| root-18 | `rootMotion.test.ts`: death_buddy_stand01 reaches its last key at the one-shot source-model end | D20 | PAR-23 |
| root-19 | `rootMotion.test.ts`: death_buddy_stand02 reaches its last key at the one-shot source-model end | D20 | PAR-23 |
| root-20 | `rootMotion.test.ts`: death_buddy_stand03 reaches its last key at the one-shot source-model end | D20 | PAR-23 |
| root-21 | `rootMotion.test.ts`: death_buddy_crouch01 reaches its last key at the one-shot source-model end | D20 | PAR-23 |
| root-22 | `rootMotion.test.ts`: death_buddy_prone01 reaches its last key at the one-shot source-model end | D20 | PAR-23 |

Counts: actionStack 6, explosives 8, movement 8, inputTiming 3, rootMotion 22; total 47.
Primary ownership: PAR-19 10, PAR-20 5, PAR-21 7, PAR-22 3, PAR-23 22. No case is omitted or counted twice.
A repair names its exact case(s), records RED before and ordinary-test GREEN after, preserves positive/refusal
controls, and records the reviewed implementation commit. This does not change this note's confidence level.
