# 251 -- The effective-action life model, as built (PAR-19)

- Date: 2026-10-08 (web sprint PARITY-1, wave 1, seat A; plan
  [`../plans/2026-10-08-web-sprint-parity.md`](../plans/2026-10-08-web-sprint-parity.md), row PAR-19, rulings
  PAR.R1-PAR.R2, "Confidence and capture gates" rows D01-D08). Branch `agent/par19` from `agent/parity` f76051f4.
- Status: **reading, pending review.** The rules below are transcribed from the decompilation and the disc; no game,
  emulator, capture or browser was run. A reviewer who did not write this note re-reads every cited line before a
  value counts as a reading. The tests are port contracts (component and the real `WalkMode` coordinator with the
  room's `MoverSim`), not a measurement of the original.
- Sources: `D:L<n>` is `game/analysis/socom2_game.elf.decomp.c` (r0001, SHA256
  `B9E863762F08D55602C4310C9491286879CFCF2947683E723BC2905E1AAA42D4`, the bytes research 230 pins; the desktop
  `desktop@be5578311ff2dd33a814d39e7d6d4f2255da4da3`, this repository's `ref/desktop` pin). The disc through the
  repository's readers: `RUN/READERC.ZAR` `motion.rdr` (`looped`, `BlendOverlay`). Evidence:
  [research 230](230-gameplay-feel-parity-audit.md) §1, §2.1, §4.1, §6, §8 (its probes are this row's RED);
  [research 217](217-the-body-as-built.md) §1 (the stance gates' place half); [research 211](211-the-weapon-swap-by-state.md)
  (the swap); [research 150](150-the-reload-while-running.md) §5 and [research 218](218-the-permission-as-built.md) (the
  reload lock).

## 0. Answers

| # | finding | consequence | section |
|---|---|---|---|
| R251.1 | **One contract on the mover.** `Walker.effectiveAction()` answers the body's owner (a full-body one-shot, or null while a looped state owns it), the overlay riding it, the pending stance and the last end; `stanceGate`, `jump`, `swapping` and `onActionEnd` are its questions. Frozen with the first commit (§1) | PAR-20, PAR-21 and PAR-23 consume it; a change is additive | §1 |
| R251.2 | **A stance press is a request, not a change.** The press writes `actor+0x374`; `FUN_00552d60` asks it of `FUN_00552ec0` every frame. A full-body one-shot (a still reload, a throw, a full-body swap, the standing Jump, a landing, the air) keeps it waiting; it is taken when the one-shot ends | research 230's four stance cases (D01) and the Jump-to-prone root close; the port's "the stance changes at once" is gone | §2 |
| R251.3 | **What resets the request is the original's.** An obstacle keeps it (asked again each frame); no headroom forgets it; a press back to the stance held takes it back; the stance button toggles from it | the spatial-refusal controls hold both | §2 |
| R251.4 | **A stance transition is the gate's exception, with its own refusal.** `FUN_00588080` lets 0x11/0x13/0x19 through; each refuses the one stance it does not share | the transitions keep their reversals; a third stance waits | §2 |
| R251.5 | **The moving swap's overlay owns the actor for the dive** (`FUN_005a7980(actor, 1)`), not the body: the stance is free under it, and the moving reload's overlay is no swap | research 230's dive case (D03) closes; the no-swap and moving-reload controls dive | §3 |
| R251.6 | **The room lays a command's hold before its stance press** (the applier runs after the whole update) | a hold and a stance on one command defer the stance on both ends; without it the room stood while the page waited | §2.4 |
| R251.7 | **The grenade's wind-up gives way to an eligible shoulder selection** (D07): the power and the pressure cleared, nothing spent; an ineligible one refused, the wind-up going on; refused after the release | research 230's explosives-04 closes; the page's shoulder gate is a wave-4 hunk | §4.1 |
| R251.8 | **One end reason** (D04, D08): the reload's end carries `complete`, `cancelled`, `knock`/`flinch`/`death`, `replaced` or `rejected`; the throw's busy tail ends with its body one-shot, the grenade flying and the ammo spent; the throw's pose holds and fades from a cut | research 230's explosives-07 closes; the reload's knock is wired in wave 4 on both ends together | §4.2 |
| R251.9 | **The victory dance is a body owner** (PARITY-1 close): its own family `victory`, reported by `bodyOwner()`; a stance press under it waits, the jump and the swap refuse it, the full press dives out of it (the dance `replaced`), its start clears an action (a hold under way wins, as on the room), and every end is heard with its reason (`stopped` its owner's) | the six `TODO(PAR-fold)` places of the merge of #89 are gone; one answer again | §9 |
| R251.10 | **The swap's hand-off is compared in the original's phase** (D05, PARITY-2 PAR-32): the full-body clip's phase `t / (P·e)` crossing 0.72 / 0.82 / 0.62 forward and the same value going back; the moving overlay's key phase `t / P` one game frame ahead of 0.79, both ways | the hand-off falls at the source's time, forward, reversed and on the overlay, page and remote alike; the room is unchanged | §10 |
| R251.11 | **A kit hold asked over a running one is refused, never restarted** (PARITY-2 PAR-29): over a still reload or a throw, `FUN_005a7de0`'s top tests (D:L462620-462636) and the reload's own gates refuse every kit one-shot; the same placing again pushes nothing (`FUN_0057d540` D:L440344-440350). A different item over a placing stacks in the original; the port replaces it (`HOLD_OVER_PLACE_READING`) | `Walker.hold` refuses on `holdOverHold`, one rule for the page and the room; the fuzz's mask stays, its reason restated | §11 |
| R251.12 | **A reload's lock ends where the original pops its clip** (PARITY-2 PAR-28 with PAR-47): a knock clears the second channel and pops the stack (`FUN_005a5da0` D:L440993, D:L461713-461714; `FUN_0058a4d0` D:L440997), so any clip under way ends -- still, moving, carried or an after-shot's -- the kit's timer kept; a climb's or a ladder's start pops the stack only (`FUN_00580b70` D:L442186-442214, the mounts), and so does a landing that plays a clip (`FUN_005af590` D:L466692), ending a still clip; the fall covers the clip and its lock holds in the air (D:L446292, D:L462532-462544) | the room's `endStillReload` and the page's `reloadPopped` on the same command, through `layKnock`, `watchMoves`, the landing and `WalkMode.onStackPop`; the clipless landing is `CLIPLESS_LANDING_RELOAD_READING` | §12 |
| R251.13 | **A still reload's clip takes the push's initial skip** (PARITY-2 PAR-61): `FUN_005a82e0` pushes it on the stack (D:L462928 -> `FUN_0028dc90` D:L446292), a one-shot, so flag 0x8 is set (D:L135209-135212) and the second driver tick that sees it -- the driver's peek (D:L418293) spends the skip on the first -- is the first the stick can cut (`RELOAD_CUT_DELAY_READING`, one game frame at the earliest; the third tick and two frames first read, corrected by the review, issue #160 (closed)) | a clip with no `NoInterrupt` (the standing ones, the m203's, the shotgun's, the pump's) is cut from the third command, not the first, in the room's lock, the page's life and the page's pose alike; the phase the cut reads is the port's own clock. *Moved by PAR-67 (§12.5):* the player's push lands after the frame's driver, so from the fifth command, the phase the cut reads a game frame behind the push's clock -- the crouched and prone holds' cut with it | §12.5 |
| R251.14 | **A throw let go on the run is the standing throw's push** (PARITY-2 PAR-76): `GetThrowAnim` reads no speed standing (`FUN_0057fce0` D:L441845-441872), no SEAL throw on the disc is a `BlendOverlay`, so `FUN_00588bc0` puts it on the stack (D:L446083-446085, D:L446292) and the run stops; the stick cuts it past the same `NoInterrupt` as from rest (`FUN_00587c20` reads no speed) and the run resumes unramped (D:L438704-438706). What the stack draws beneath a covered run is not read (`RUNNING_THROW_BODY_READING`) | the port's hold is the original's (the 48th command, the toss the 72nd, the 91st uncut, since PAR-70); nothing built but pins and the named reading; a throw let go in the air is found, not built | §12.6 |
| R251.15 | **One release sound a throw, in third person only; the grunt is the standing throw's** (PARITY-2 PAR-77): the kit's timer lets go once (`FUN_005c1970` D:L476883-476902) and `FUN_005c5340` plays `FUN_003d22b0(record, 0 < body+0x200)` (D:L479429-479480): the `FireAnimName` (`.THROW_OBJECT`) in third person, its `_zoom` past it, which no throwable has on the disc, so none (a placing too, `FUN_005bc730` D:L474051-474060). Only `seal_throwgrenade` and `seal_p_throwgrenade` carry the clip's `throw_whoosh` (`.MALE_GRUNT`). Another console picks by the thrower's body's view, not on the wire (`THROW_RELEASE_REMOTE_VIEW_READING`) | every kind asks one release on the thrower's page and one on another's; the port's first-person release (and placing) is silenced as the original's; the browser's suspended context (`dropped.locked`) is left to the owner's retest | §12.7 |

## 1. The contract

The original keeps one action stack per actor (`actor+0x1c0`, its top by `FUN_00555170`) and an upper-body second
channel (`actor+0x1e4`). Every interruption check asks that stack: the stance gate `FUN_00552ec0`, the jump
`FUN_0057e1b0`, the dive `FUN_00584b00`, the swap's `FUN_005a7980`. The port's equivalent was spread over three fields of
`Walker` (`action_`, the walk's actions; `hold_`, the kit's one-shots; `overlay_`, the moving swap) and a traversal's own
clip (`TickDriver.topOneShot`), each check reading its own subset. PAR-19 puts one answer over them
(`packages/viewer/src/mover.ts`), the API frozen for its consumers:

| export | what it is |
|---|---|
| `ActionFamily` | `transition`, `swap`, `jump`, `air`, `landing`, `reaction`, `getUp`, `reload`, `throw`, `place`, `move`; `victory` (§9, additive) |
| `BodyOwner` | `{ source: 'action' \| 'hold' \| 'move' \| 'victory', name, family, serial }`: the full-body one-shot on top (`'victory'` §9, additive) |
| `OverlayOwner` | `{ clip, family: 'swap', serial }`: the second channel's clip |
| `ActionEndReason` | the mover's `complete`, `cut`, `replaced`, `knock`, `completed`; the consumers' `flinch`, `death`, `rejected`, `cancelled`; the victory dance's own `stopped` (§9, additive) |
| `ActionEnd` | `{ body, overlay, reason }` |
| `EffectiveAction` | `{ body, overlay, pendingStance, lastEnd }` |
| `StanceGate` | `same`, `owned`, `kept`, `reset`, `open` (§2.1) |
| `ACTION_FAMILY`, `holdFamily(clip)` | the family of each walk action and hold clip |
| `Walker.effectiveAction()` | the answer now |
| `Walker.bodyOwner()`, `overlayOwner()` | its two halves |
| `Walker.pendingStance` | the request still waiting, or null |
| `Walker.stanceGate(to)` | `FUN_00552ec0`'s answer for `to` now, with what it does to the request |
| `Walker.swapping()` | `FUN_005a7980(actor, 1)` |
| `Walker.onActionEnd(fn)` | every end of a body owner or the overlay with its reason; returns the unsubscribe |
| `WalkMode.stanceIntent()` | the stance the button's next press toggles from (§2.3) |
| `WalkMode.onActionEnd(fn)` | the walk's mover's ends, a respawn's new mover too (§4.2; added by the third unit) |
| `Walker.victoryMotion`, `Walker.stopVictoryMotion()` | the victory dance now (read-only), and its owner's stop (`stopped`) (§9; added by the fold) |
| `ReloadEndReason`, `reloadEndOfBody(end)`, `Fire.cancelReload(reason)` | the reload's one end reason (§4.2; third unit) |
| `throwPoseEnds(end)`, `ThrowPose.cut()` | the throw's pose ends with its hold (§4.2; third unit) |

Every clip the walk's actions and the kit's holds play is a one-shot on the disc (`motion.rdr` `looped` 0 for each,
the idle `seal_stand` 1; the moving swap `BlendOverlay`), held by `effectiveAction.test.ts`'s fixture case, so each owns
the body (`FUN_005551a0(top+0x28, 0x40)`, the top entry's looped bit, is the gate's first test, D:L418928).

## 2. The entry state and the pending stance (D01)

### 2.1 The gate

`FUN_00552ec0(actor, target)` (D:L418916-419025), read whole:

- **The outer gate** (D:L418927-418930): the top's looped bit (`FUN_005551a0(top+0x28, 0x40)`), or a stance transition
  on top (`FUN_00588080`, D:L445716-445734: `FUN_00577e40` against 0x11, 0x13, 0x19), and not attached
  (`FUN_00579ea0`, `actor+0xeac`), and the stance word not 7. Anything else returns 0: `owned`.
- **The transitions' own refusal**: prone refused under 0x11 (D:L418932), crouch under 0x19 (D:L418953), stand under 0x13
  (D:L418995). The types are the three clips: 0x11 `Stand -> Crouch` (pushed forward to crouch from a still stand,
  `FUN_005817d0` D:L442509; backwards to stand, `FUN_00581c10` D:L442641), 0x13 `Crouch -> Prone` (forward to prone from
  crouch, `FUN_00581540` D:L442428; backwards to crouch, D:L442518), 0x19 `Stand -> Prone` (forward from stand,
  D:L442424). So a transition takes its own reversal and refuses the third stance: `owned`.
- **The place's gates** (research 217 §1, unchanged): prone's obstacle (D:L418935-418940) and crouch's (D:L418958-418966)
  return 0 and leave `actor+0x374` as it is -- `kept`; the headroom refusals write the request back to the stance
  (D:L418987-418991 prone -> crouch, D:L419007-419011 to stand) -- `reset`.
- Already the target returns 0 (`same`).

### 2.2 The request's life

- **Written by the press**: `FUN_00594cf0` writes `actor+0x374` (D:L453331-453430; the dive's full press writes 2 after
  `FUN_0057e540`, D:L453389). `Walker.changeStance(s)` writes `pending_` (null when `s` is the stance: the press writes
  the field whole, so a press back to the stance held takes the request back), then asks it at once.
- **Asked every frame**: `FUN_00551ec0` calls `FUN_00552d60` (D:L418606-418611) unless the top's state is 8; it calls
  `FUN_00552ec0` with `actor+0x374` (D:L418875) and on 1 dispatches to the prone, crouch or stand function
  (D:L418877-418905). `Walker.retryStance` runs each tick after the clocks (`PENDING_STANCE_RETRY_READING`, §7), never for a dead SEAL.
- **Synced by every stance writer**: the original's stance functions write `actor+0x374` with the stance (the get-up
  D:L442048, the transitions D:L442222-442239, the dive's press D:L453389); the port's `Walker.stance` setter (a placing,
  a get-up's end, the dive, the water's fallback) clears the request. A placing clears it.
- **The water's rewrite** (`FUN_00581660` / `FUN_00581990` write `actor+0x374` to the stance they fall back to,
  D:L442436-442560) stays `TickDriver.stanceFor`'s, asked once the body is free; a request the water maps to the stance
  held is dropped.

### 2.3 The button toggles from the request

The press's light and full branches read `actor+0x374`, not the stance (D:L453351-453354, D:L453380-453384). The port's
stance buttons (the pad's Triangle, `C`, the touch C: owner adaptations, `./stanceButton`) now take their base from
`WalkMode.stanceIntent()` (the request, else the stance) on the walk's own key and touch paths, so a second tap during a
crouched reload takes the first back. The pad's Triangle reaches `setStance` through `./matchLanes` (HOT, PAR.R3): its
base is a wave-4 hunk (`walk.stance()` -> `walk.stanceIntent()`), handed to the integrator.

### 2.4 The room's order -- a port invariant, not the original's order

The room's applier (`MoverSim.prepare`) laid a command's stance press before its hold. `prepare` now lays the hold
first, so a hold and a stance press on one command defer the stance in the room as on the page, and both take it on the
same tick. **This is a port invariant keeping the page and the room agreeing, not a reading of the original's order**
(corrected at review; the first commit's comment claimed the original's). The original has no same-frame pair of this
kind to copy: the reload's press (D:L453460-453463) only arms the kit's timer `kit+0x820` (`FUN_005c32b0` ->
`FUN_003d00d0`, D:L477661-477677), and the reload clip is pushed when that timer runs out in the kit's tick
(D:L476550-476558 -> `FUN_005c2a90`), a later frame than the press; the port's hold likewise arrives with `Fire`'s
`reloadStart`, after its own delay. Which of the stance applier (`FUN_00552d60`, D:L418606-418611) and the kit's tick
runs first on the frame the clip is pushed is not read: research 230 §7's "Still reload -> stance/jump" capture
settles it. Measured headless: without the reorder the room stood on the press's command while the page waited
(`effectiveAction.test.ts`, the WalkMode/room case). The page's own order within a frame is its callers' (a reload's
hold through `matchFirearm`, then the stance lanes): a stance press before a hold in one page frame still differs (§6).

### 2.5 What changed for a player

- A stance press during a still crouched or prone reload, a throw or the claymore's placing, a full-body swap, the
  standing Jump, a landing or in the air waits and is taken when that one-shot ends (research 230's Jump-to-prone root:
  the standing Jump keeps the stance; §6 of 230's quirk is the owner's, PAR-25).
- A press during a stance transition to the third stance waits for the transition's end (the existing walk tests that
  pressed through a transition wait for its end now: `walk.test.ts`'s C-key and touch-C cases, `playerCamera.test.ts`'s
  C case).
- A prone press refused by an obstacle is taken once the obstacle no longer refuses it (the request kept); a stand
  refused for headroom is forgotten.

## 3. The overlay exclusion (D03)

`FUN_00584b00` (D:L443975-444016) refuses the dive when `FUN_005a7980(actor, 1)` answers (D:L443995-444001). That query
(D:L462471-462506) answers for the full-body swaps on top (0x35-0x37 and their kin) and for the second channel's clip
when it is the moving swap (`actor+0x1e4`'s `+0x22` against `DAT_003dec68`, D:L462488-462501, or its two kin).
`Walker.swapping()` is that query; `Traversal.dive` refuses on it and `Walker.swapRefused` asks it for its own overlay
half. The moving reload rides the looped top on the port's weapon pose, never the mover, so the dive takes it (the
control through the real `WalkMode`: a reload started on the run puts no hold and the full press dives). No overlay
owns the body: a stance press under the moving swap is taken at once.

Owed (review F5): `FUN_005a7980(actor, 1)` answers first on the kit's change flag -- `actor+0x5e1` (the kit at
`actor+0x5e0`, its byte +1) bit 0x10, D:L462482 -- set by `FUN_005c50b0` on a slot change (D:L478992-479008, called from
`FUN_005c4b10` D:L478905): the original also refuses a dive while a kit change is pending. `Walker.swapping()` asks only
the clips; the kit's flag is the page's `Kit` and the room's weapon state, outside the mover. Not built (§6).

## 4. The end reason

The first unit delivers the mover's half: every place the walk's action, the kit's hold or the overlay comes off now
ends through one path with a reason (`complete` its clock; `cut` the stick past `NoInterrupt` or the peek; `replaced`
another action over it; `knock`; `completed` the knock's forced swap end), heard by `onActionEnd` and kept as
`lastEnd`. A placing is silent (a new body). The consumers' end (the reload's lock and pose, the throw's pose and busy
tail: D04, D08) is §4.2's.

### 4.1 The grenade's wind-up gives way to a shoulder selection (D07)

The wind-up -- the trigger held, the power chasing the pressure (`FUN_00594cf0` D:L453478-453538) -- puts no clip on the
body: the throw's one-shot is pushed only at the release (`FUN_005be9a0`), so the wind-up owns no body in §1's model
and the shoulder press's body gate passes. The press asks only the kit's gates (`FUN_00594cf0` D:L453288-453310:
`FUN_005a8cb0`, `FUN_005bdc30`, `FUN_005be030`, `FUN_005c4fd0`), and `FUN_005c4b10` taking another slot drops the
wind-up (D:L478905-478915): it sets the controller's `+0x170` bit 0x10 (D:L478907), clears bit 0x40 -- the wind-up bit
the power's chase tests (D:L453478) -- (D:L478914) and calls `FUN_00592d40` (D:L478915), which zeroes the controller's
power `+0x11c` (D:L451964; the power the wind-up drives, the controller record's held-power field, D:L453508-453517); the same slot changes
nothing (its first branch). The kit's own `+0x810`, zeroed at D:L478836-478839 and D:L478926-478929, is not the power
(PAR-19's second commit message said it was: wrong, corrected here at review). `GrenadeThrower.select` now does that: during `holding`, an eligible other slot (the rifle, or one
`available`) clears the power and the pressure -- nothing spent, nothing thrown -- and is taken; an ineligible one
(the Detonator with no charge down, a name that is no slot) is refused and the wind-up goes on to its throw; after the
release (`throwing`) the selection is refused as before, the grenade flying. The browser menu's cancel
(`cancelMenuHold`) stays its own adaptation. Research 230's case explosives-04 is an ordinary test.

The page's shoulder gate still refuses during the wind-up: `./matchThrow`'s `takeSlot`/`selectEquipment` and the
firearm's `FirearmHands.busy` count `holding` as busy. Those are the event handoff's files (PAR.R3, wave 4); the hunk
is in PAR-19's report: `busy` and the two refusals ask `phase() === 'throwing'` only.

### 4.2 One end reason for the clocks that outlive the mover's (D04, D08)

Research 230 §1.3 item 3 and §2.2 item 1: a reaction or a cut that takes the body's one-shot off left the reload's lock
and pose, and the throw's pose and busy tail, on clocks of their own. The source: the reload lock is the reload clip's
life (`FUN_005a7ab0` D:L462512-462560 answers while the stack's top is a reload clip or the second channel plays the
moving reload; research 218 §2); the knock pops the stack (`FUN_0057e770` D:L440992-440998, `FUN_005807d0`); the
magazine was selected at the accepted clip's start (`FUN_005c2a90` D:L477479-477483), so ending the clip never takes it
back; a valid movement cut ends a throw's one-shot after its release, the grenade already out (`FUN_00550ef0`
D:L418180-418190, `FUN_00587c20` D:L445549-445564). As built, the notification only -- no first-shot or blend claim:

- **The reload** (`./fire`): `reloadEnd` carries one `reason` (`ReloadEndReason`): `complete` (the lock ran out);
  `cancelled` (an accepted end on the page; the magazine kept); `knock`, `flinch`, `death` (a reaction took the body's
  reload clip; the magazine kept); `replaced` (the hand or the map changed: `setWeapon`, `takeWeapon`, `refill`,
  `reset`); `rejected` (`undoReload`, `restoreReload`: the room refused it, the journal undone, the magazine as before).
  `cancelReload(reason)` takes the accepted ones; `reloadEndOfBody(end)` maps a mover's end of a still reload's hold by a
  reaction (`knock`, `death`, `flinch`) to its reason -- the clip's own end and the stick's cut stay the reload's own
  paths (the lock's clock, `reloadCut`). A replacement of the hold (`replaced`: off the floor, `setAirborne`/`takeOff`;
  a hold over it was one until PAR-29 refused it, §11) ends no reload on the page, as the room ends none there: the
  fall covers the clip and its lock holds in the air, to the landing that pops it (§12.3, PARITY-2 PAR-28; PARITY-1's
  close review had found the page alone ending it).
  The pose stops its clip on any `reloadEnd` (`./play` `weaponEvent`, unchanged). A reaction reason ends only a reload
  under way (`reloadLeft > 0`): a bolt's or a pump's after-shot lays the same reload-family
  hold (`./matchFirearm`), and a knock during it left its lock and clip to their own clock (review F4: before the guard
  the page freed the bolt's lock while the room kept it). *Superseded at PARITY-2 PAR-28 (§12.1):* a knock now ends
  the after-shot's clip and lock on both ends together (`Fire.popClip('knock')`, the room's `endStillReload`); the
  flinch and the death keep the guard. A hand's change (`replaced`: `setWeapon`, `takeWeapon`, `refill`) is no
  reaction and is not guarded: it clears the kit's one timer and an after-shot clip whatever runs, as before PAR-19
  (PARITY-1's close review found the guard, widened to `replaced` at the merge, carrying a bolt's after-shot onto the
  weapon taken up; `fire.test.ts`'s M4 swap, pickup and refill cases). *The wave-4 review's F2 reading (owed with s6's moving-reload row):*
  the knock's pop (`FUN_0058a4d0`, D:L440997, from `FUN_0057e770`) takes the after-shot clip off the stack as it takes a
  still reload's, and once that clip has started the kit's timer is 0 (`FUN_005c0fd0` runs the timer out into
  `FUN_005c3000` on the after-shot flag and zeroes `kit+0x820`, D:L476550-476560), so `FUN_005a7ab0` (its stack top,
  and `FUN_005c2400`'s timer, D:L477159) most likely answers no after the knock: the original likely ends the
  after-shot's lock too. *Read and built at PARITY-2 PAR-28 (§12.1)*: it does, and the port now ends it, room and page.
- **The throw's busy tail** (`./grenade`): the throw follows its body one-shot through the snapshot it already reads
  (`PlaySnapshot.hold`, `holdSerial`: §1's body owner and its serial). Once the snapshot showed the throw's hold and
  shows it no more, a throw already released is done (`finishThrow`): the grenade flies on, the spent ammo stays. A
  throw not yet released, a placing under way (C4's removed callback is PAR-20's D09) and a throw the body never held
  (refused in the air; no mover) keep their own clocks. Research 230's explosives-07 is an ordinary test.
- **The throw's pose** (`./throwPose`): `throwPoseEnds(end)` (the throw's or placing's hold taken off before its own
  end) and `ThrowPose.cut()`: the clip holds where it is and the layer fades over the play's out-blend
  (`BLEND_TIME_DEFAULT`, the clip's natural end's existing [reading]). How the original's locomotion takes the body back
  (its snapshot blend) is not measured (D08's YES-capture half).
- **The page's channel**: `WalkMode.onActionEnd` hears the walk's mover, a respawn's new one too.

The consumers' wiring is the event handoff's (`./matchFirearm`, `./matchThrow`) and the room's reaction seam
(`room.ts` `layKnock`): wave-4 hunks (PAR.R3), §8. The page's and the room's halves of the reload's knock land
together: the page alone would free its lock while the room's still runs to the clip's end (rounds dropped 'reload or
empty' meanwhile).

## 5. The lock tail (D06)

Unchanged by the first unit: the natural reload lock's tail and the axis-cut margin keep their existing values
(research 150 §5, 218). A capture gates any change to the earliest playable shot (the plan's D06 row).

## 6. Owed

- **D02, a standing reload overlapping the jump -- the no-wire route (PARITY-1 wave 2b, seat B; reading, pending
  review).** Reproduced on PAR-19's base: the port's standing reload puts no hold on the mover (its clip is `seal_reload`,
  a one-shot on the stack in the original -- `motion.rdr` looped 0, not `BlendOverlay` -- with `NoInterrupt` 0, so the
  first push carries it into the moving overlay), and through the real coordinator (`WalkMode` with the one firearm,
  `mountFirearm`) a reload begun standing still and a jump press started the standing Jump while `Fire` still reloaded
  (`effectiveAction.test.ts`'s D02 case). The repair is **not a hold** (`HOLD_CODES` is full at 15 in four bits, and the
  hold bits are the body's clip for the other pages' drawing, not the room's authority) and **not a protocol change**:
  - *The room* refuses `Button.Jump` on its own still clip's life -- PF-18's `reloadLife` (`room.ts` `lockLife` /
    `cutAt`: set only for a reload or after-shot clip begun not moving, cleared at the clip's last key or at the first
    command whose stick or turn passes 0.1 past its `NoInterrupt`, on the command clock) -- from the clip's first command
    (`p.ran >= life.start`: the kit's timer `kit+0x820` puts nothing on the stack, the clip is pushed when it runs out,
    D:L476550-476558 -> `FUN_005c2a90` / `FUN_005c3000`), the weapon in hand's, unless a move holds the mover (a hang's
    let-go is the move's). Not `lockKind === 'reload' && ran < reloadUntil` (the lock outlives the clip by the carried
    overlay and its tail, and misses the after-shot clips).
  - *The page* asks the same life on its own command clock (`StillReloadLife`,
    [`../../packages/viewer/src/stillReloadLife.ts`](../../packages/viewer/src/stillReloadLife.ts): `reloadLock`'s
    derivation, the room's `cutAt` line for line, fed each walk tick its `reloadCutOf` axes) and spends the press off
    the command (the original clears the request, D:L418128), so no reconciling replay re-runs it. It stands in for the
    weapon pose's still clip (`weaponPose` `step` runs the same rule) because the pose needs the body's skeleton and runs
    on the render frame, not the command clock; `Fire`'s lock is not asked. Its tests:
    `packages/viewer/test/stillReloadLife.test.ts`; the room's and the agreement of the two, command for command:
    `packages/central/test/roomStillReloadJump.test.ts`. A swap ends the page's life at its command (the kit's `started`
    in `matchFirearm.ts`), as the room's `aim` clears `reloadLife` with the after-shot lock, since `Fire.setWeapon`'s
    `replaced` cancel emits no `reloadEnd` for a bolt's or pump's after-shot (PARITY-1's close, pass 2: a jump after
    such a swap was spent on the page while the room took it; `stillReloadLife.test.ts`'s swap cases).
  - *The order on one command* is the decompilation's, not a port choice: `FUN_00550ef0` runs the controller's update
    (the controller's vtable +0x10, D:L418091 -- taken for `FUN_00594cf0`, which sets the request `actor+0x105e` bit
    0x4 by `FUN_005469c0` and the controller's `+0x5c` bit 0x4, D:L453214-453215, the bits read at D:L418121-418126;
    the slot itself is not resolved here) and then consumes the request under a non-looped top -- the request cleared and
    `FUN_0057e1b0` refusing (D:L418119-418130) -- **before** the stick's cut (D:L418174-418190, then `FUN_005870e0`). So
    a jump on the cut's own command is refused and spent; the next command's jump is taken. The room reads the jump in
    `MoverSim.prepare`, before the tick and `watchCut`; the page asks the life the last tick left.
  - *The end edge*: the room clears the life after the command that reaches the last key (`cutAt`), so that command's
    jump is refused and the next one's taken. The original's actor update (vtable +0x88, D:L418118) runs before the
    looped test and may pop an ended clip on its own frame -- not read; one command at most, owed to research 230 §7's
    "Still reload -> stance/jump" capture.
  - *Without the clips* (a room or a page with no `motion.rdr` and pack: `reloadLifeSpec` null, PF-18's own fallback,
    which keeps the lock at the start's length) no life is held and **the jump under a still reload is admitted** on
    both ends -- a named gap, never silent: pinned by `roomStillReloadJump.test.ts` ("without the clips ...") and
    `stillReloadLife.test.ts`; the server loads the clips wherever it has the disc (`server.ts` `loadSimClips`). No
    constant stands for it.
  - *Owed at the edges*: the room decides a reload after the command after its own (PF-18), so a jump on the very next
    command is admitted by the room while the page refuses it (the snapshots reconcile the place); the room's clip
    starts the record's `ReloadDelay` after the command the page names at its own `reloadStart` (`NetPage` sends the
    last command at `reloadStart`, after the page's delay, and `Room.reload` adds `reloadDelayOf(record)` again), so for
    a weapon whose delay is a whole command or more (the Spas 12's and JACKHAMMER's 0.5, the 870's 1) the room's lock
    and life ran that much later than the page's -- an M4 / PF-18 offset found here, not D02's to change. **Fixed at
    wave 4 (3c, before D02's room hunk):** the delay is the kit's one timer (`FUN_005c32b0` sets it, `FUN_005c0fd0`
    D:L476549-476561 runs it out into `FUN_005c2a90`), spent once on the page, so `Room.reload` lays its lock with no
    timer part and the room's reload begins at the command the page names (`roomReloadDelay.test.ts`: the Spas 12, the
    JACKHAMMER and the 870 off the disc's records, the page's `Fire` and `StillReloadLife` beside the room). No room
    authority is lost: the room never hears the reload before the page's timer has run out. And the still
    clip also owns the body for the stance gate (`FUN_00552ec0`, D01's rule): a stance press during a standing still
    reload is not deferred (the jump only is built).
  - *Lands*: the room hunk, the walk's seam and the firearm's line are wave-4 hunks (PAR.R3), exact in PARITY-1 wave
    2b seat B's report, with `effectiveAction.test.ts`'s D02 case turned ordinary over the disc's clips and the
    `it.fails` cases of the two new test files turned ordinary; the registry's drift entry
    `character.action.standing-reload-jump` closes when they land. **Landed at wave 4** (`agent/parw4`, after the
    room's double `ReloadDelay` fix, 3c above, as D02's review F1 required): the patch applied as written, its six
    `it.fails` ordinary, the entry a reading; `roomReloadDelay.test.ts`'s Spas 12 case (the review's F2: `Room.reload`
    and `jumpRefused` end to end for a 0.5 s weapon) ordinary with it. F3 (the `!busy()` clause) and F4 (the stale
    `p.ran` of the backlog drop) were owed; both are read and settled at PARITY-2's PAR-30 (2026-10-11; reading, pending
    review), below.
  - *F3, the `!busy()` clause: kept, cited from the source.* `FUN_00550ef0` reads the jump in two places by the top's
    looped bit (D:L418119-418120). Under a non-looped top the press goes to the contact (`FUN_005b4b40`, when the
    actor's contact `+0x1090` is valid, `+0x10ac`) or, with no contact and the request set, the request is cleared and
    `FUN_0057e1b0` asked (D:L418121-418133), which refuses under that top (D:L440805-440810). The hang's let-go,
    `FUN_00581dc0(actor, -1)`, is reached only under a **looped** top in state 4 (`actor+0x174`, D:L418136-418139). A
    still clip is never that top while a move holds the mover: the climb's start (`FUN_005b2620` -> `FUN_00580b70`,
    D:L468435, D:L468489, D:L468500) pops the stack down to its base (`FUN_00589aa0` while the stack's count
    `actor+0x1c8` is past its base, at most 12, D:L442186-442214) before it pushes the move's actions -- for the hang
    `0x22` then `0x21` in state 4 (D:L442288-442293). So during the climb's one-shot (`seal_stand2hang`, `motion.rdr`
    looped 0) the jump is refused under the move's own top, and in the hang (`seal_hang`, looped 1) it lets go -- what
    `Traversal.jump` answers (`kind === 'hang'` only). The port's clause on both sides (`room.ts` `jumpRefused`,
    `walk.ts` `jump`) is that reading; no code changed, the citation is on both. A climb *is* startable under a still
    clip in the original by this read (the non-looped branch's contact call, D:L418131-418132, `FUN_005b4b40` ->
    `FUN_005b2620`), on a frame whose controller bit `+0x5c` 0x4 is set and whose request is not (`FUN_005b4b40` only
    clears a set request, D:L469594-469596); which frame that is turns on `FUN_005469c0` and `cVar7` (`FUN_00594cf0`
    D:L453210-453219), not read. The test:
    `roomStillReloadJump.test.ts`, "F3: a climb begun under a live still clip with no stick push ..." (a pin: green
    before and after, the `ReloadTime` raised to 6 s as a test's value so the life outlives the climb to the hang).
  - *Found by F3's read, owed:* since the climb's start pops the still clip, the refusal it stands for ends there; the
    room's `reloadLife` and the page's `StillReloadLife` run on past the move, so a jump after a short climb (a crate's,
    `seal_climb_medium` 1.5 s) still inside the clip's own length is refused by both while the original takes it. The
    change is where the life is cleared (the room's run or `watchCut`, the page's walk), outside PAR-30's lines; and
    what the pop does to the reload itself (`FUN_005a7ab0`'s answer, the kit's lock) is not read -- the same question as
    the airborne end below (PAR-28). Held as an `it.fails` in `roomStillReloadJump.test.ts` ("OWED: the still clip's
    life ends at the climb's start ..."). Bound: at most the clip's length after the climb's start. *Built at PARITY-2
    PAR-28 (§12.2)*: the life and the lock end at a climb's and a ladder's start, room and page; the `it.fails` is
    ordinary.
    *PAR-47's read (2026-10-11; reading, pending review), held at the lock -- no code changed:* (a) which starts pop.
    `FUN_005b2620` dispatches on the contact's appflags class (D:L468368): classes 1, 3 and 4 call `FUN_00580b70`
    (D:L468435, D:L468489, D:L468500), class 5 -- the climb over, not the ladder -- calls `FUN_00580a80` (D:L468485; its
    pop D:L442147-442163), class 2 sets the ladder's request (D:L468438-468481). The ladder pops in its two mounts,
    `FUN_0057f880` (D:L441547-441558) and `FUN_0057f690` (D:L441466-441477), from `FUN_005b1c80` (D:L468189, D:L468218),
    which reads the request's `+0x1331` (D:L468088). Every one of these is the port's `Traversal.startClimb`
    (`climbStart`) or its ladder mount (`ladderMount`). `FUN_00580b70` pops to index 0 in state 0 and to index 1
    otherwise (D:L442186-442214); whether a crouched still clip can sit at index 1 is not read. The hang's let-go pops
    too (`FUN_00581dc0`, D:L442665), but only from the hang, which the climb's start already cleared. (b) The lock.
    `FUN_0058a470` (D:L446731) answers whether any entry of the stack has the asked type, so `FUN_005a7ab0`
    (D:L462512-462560) answers no once the pop has taken every reload type, the kit's timer being 0 after the clip's
    push (D:L476560) -- the knock's reading (§4.2, `endStillReload`). So the pop ends the lock as well as the life. (c)
    Why the life alone was not built: the room's `reloadLife` is also the room's lock cut (`cutAt` shortens
    `reloadUntil`), while the page's lock cut is the weapon pose's (`WeaponPose.step` -> `Fire`'s `reloadCut`), which
    `StillReloadLife.end()` does not touch. A life cleared at the pop in the room only would leave the page's lock cut
    by a stick push after the move while the room's runs on, and rounds would drop as "reload or empty". The owed change
    is the lock's and the life's together (`endStillReload` at the climb's and the ladder's start in the room, an
    accepted end of the page's reload with `StillReloadLife.end()`), PAR-28's -- built there (§12.2; (a)'s open point,
    whether a crouched still clip sits at index 1, read: it sits at index 2, over the base kind).
  - *F4, the backlog drop's count: fixed.* The drop (`dropBacklog`) does not advance `p.ran` (the event clock), and the
    life is watched (`watchCut`) only after a command the room runs, so each dropped jump was asked at the count before
    the drop with the life as the last run command left it. Now `jumpRefused(p, count)` takes the command's count -- the
    next after the last run, on by the drop's own clock ticks so far (`p.elapsed`, round 3's bound: never the client's
    numbers; an honest stall's commands are each one tick) -- and reads the life's last key as `cutAt` does, at the
    command before. A dropped jump on the command past the clip's last key is taken, as the page's life answers on the
    same count; on the last key's own it is refused (`roomStillReloadJump.test.ts`, "F4: ...", RED before the fix).
    The same end test now also answers a command after lost numbers (`run`'s `lost`, counted as run but not watched), as
    the page that ran them. What stays approximate, with its bound: (a) a dropped command's stick cut is not read (the
    drop lays zero-move commands and no movement, so `reloadCutOf` has nothing to read): a dropped jump after the page's
    own cut is refused while the page took it, for at most the clip's remaining life (the M4A1's standing clip 1.53 s);
    (b) the kept command and every later one run on the room's event clock, which the drop leaves alone (PF-18's, as the
    rounds' and the reloads'), so a life that straddles the drop ends that many commands later in the room than on the
    page -- at most the dropped commands, and never past the clip's length; the kept command's own jump (`run`) is
    unchanged. (c) A forged burst past the room's observed ticks holds the count where the drop's ticks end: the jump is
    refused longer, never taken sooner.
- **The dive during a pending kit change** (review F5, §3): `FUN_005a7980(actor, 1)` refuses on the kit's change flag
  (D:L462482; set by `FUN_005c50b0`, D:L478992-479008) as well as on the swap clips; the port's dive asks the clips
  only. Owed: the flag's life (when `FUN_005c50b0` sets it and what clears it) read, then a shared query the page and
  the room both answer.
- **D05, the swap's callback phase units**: read and built in §10 (PARITY-2, PAR-32); what stays owed is §10.5.
- **A change taken during a transition** changes the stance word and plays no new clip (the port's, before and after
  PAR-19); the original pushes the new transition (`FUN_005817d0` and kin). Owed to capture C3 (research 211 §7).
- **The page's same-frame order** (§2.4): a stance press before a hold within one page frame takes the stance on the
  page while the room defers it. The lanes' order puts the reload first; a cross-check of every hold's caller is owed.
- **The quirks** (research 230 §6, PAR-25): the model follows the reviewed original meanwhile; each quirk's capture
  stays owed there.
- **The flinch's and the death's end of an accepted reload**: the reasons exist (`cancelReload('flinch' | 'death')`);
  which reload a flinch replaces (a still clip, not a swap, `FUN_005a2690` D:L460005-460025) and the death's cleanup
  (`FUN_005a2490` D:L459780-459805) on the page and in the room are not reviewed together: no hunk is handed for them.
  *LATER 544 (2026-10-27; reading, pending review; research 92 section 4, "LATER 544's reading"):* the flinch's push pops
  a still clip with the rest of the stack (`FUN_0058a4d0` before the push, `FUN_005a2690` D:L460018-460019), so in the
  original no still reload outlives a flinch, while the port's flinch ends none -- a crouched or prone reload's hold then
  keeps a stance waiting past the flinch's end: LATER 548.
- **A hold over a running hold** (the wave-4 review, 2026-10-08): the room lays a kit hold on every command that carries
  a hold bit (`./net/moverSim` `holdOf(b)` -> `Walker.hold`), and `Walker.hold` ends a running hold (`'replaced'`) and
  starts the new clip from its first key. No source was read for a second hold over a running one; the behaviour is
  older than PAR-19 (it predates the 2026-10-02 tree move, `8a43cdf84`; PAR-19 merged at `f406ea9d`). A page sends the
  bit once, when its kit starts the clip, so honest play does not meet it; `roomFuzz.test.ts`'s random bytes did, and
  under PAR-19's outer stance gate (`FUN_00552ec0` D:L418927-418930) a body restarted every couple of ticks left every
  stance press pending and the fuzz's travel at 26-63 units. The fuzz now lays a hold bit only on an unowned body (what a
  page can send); its floor sits between the fixed room's travel (2455-3068) and the GAP_WAIT revert's (409-520).
  **Read and built at PARITY-2's PAR-29 (§11):** refused over a still reload, a throw and the same placing; a different
  item over a placing replaces it (`HOLD_OVER_PLACE_READING`, the original stacks it).
- **The airborne or replacement end of a crouched or prone reload** (PARITY-1's close review, 2026-10-09): the mover
  ends a still reload's hold as `replaced` when the body leaves the floor (`Walker.setAirborne`, `takeOff`); a hold laid
  over it is refused since PAR-29 (§11), so leaving the floor is the one replacement left. The room has no end for it -- its one end of a still reload is `layKnock` -> `endStillReload` --
  so its lock runs on to the clip's end. At the PAR-19 merge the page alone ended its reload on it (`reloadEndOfBody`
  mapped `replaced`), and rounds dropped as "reload or empty" while the room's lock ran on; the page now agrees with the
  room (`reloadEndOfBody` maps no `replaced`; `effectiveAction.test.ts`, "a still reload's hold replaced ..."). Not
  read: whether leaving the floor pops the reload clip or covers it (the fall's clip on the stack) and what
  `FUN_005a7ab0` (D:L462512-462560) answers then. **Owed:** that read, then one change, room and page together
  (PARITY-2, PAR-28). *Read and built at PAR-28 (§12.3):* the fall covers the clip (the lock holds in the air) and a
  landing with a clip pops it (the lock ends there), room and page; the clipless landing is
  `CLIPLESS_LANDING_RELOAD_READING`.
- **The standing still reload under a knock** (PARITY-1's close review, 2026-10-09): the port's standing still reload
  lays no hold (D02, above), so a knock ends neither the room's lock nor its `reloadLife` (`layKnock` calls
  `endStillReload` only when the mover holds a reload clip), and the page's `Fire` lock and `StillReloadLife` run on:
  the two agree. The original puts `seal_reload` on the stack (D02's reading), the knock pops the stack (`FUN_0058a4d0`,
  D:L440997, from `FUN_0057e770`), and the lock is the clip's life (`FUN_005a7ab0` D:L462512-462560): the original most
  likely ends it. The registry's `character.action.reload-end-reason` claims the crouched and prone cases only.
  **Owed:** one change ending it on a knock, room and page together (PARITY-2, PAR-28). *Built at PAR-28 (§12.1)*,
  the registry's claim widened with it.
- **The moving reload's overlay under a knock** (the wave-4 review's F1, 2026-10-08): the port leaves the moving reload's
  lock to its own end on a knock, in the room and on the page, and `roomReloadLock.test.ts` pins that as the port's, not
  parity. The decompilation points the other way. On the knock's path `FUN_0057e770` calls `FUN_005a5da0` (D:L440993),
  two lines before its stack pop (`FUN_0058a4d0`, D:L440997), unconditionally; with no swap clip on the stack (its gate,
  D:L461663-461667) that call stops the second channel's clip whatever it is and clears it (`+0x1e4 = 0`,
  D:L461713-461714, within D:L461668-461721). `FUN_005a7ab0`'s other term, `FUN_005c2400`, is only the kit's ReloadDelay
  timer (`kit+0x820 > 0`, D:L477159), which `FUN_005c0fd0` zeroes as it pushes the clip (D:L476560). So the original most
  likely ends a moving reload's lock on a knock. **Owed:** a row ending it on a knock in the room and on the page
  together (one reviewed change, not this sprint's: the merge controller's ruling), and a capture of a knock during a
  moving reload. *Built at PARITY-2 PAR-28 (§12.1)*, the pin flipped to the source's; the capture stays owed (§12.4).

## 7. Readings

| name | listed at | what it stands for | settles |
|---|---|---|---|
| `PENDING_STANCE_RETRY_READING` | §2.2 | `'afterClocks'`: the request asked again after the tick's clocks, so a one-shot that runs out on a tick lets the stance through on that tick. The original's applier (`FUN_00552d60` from `FUN_00551ec0` D:L418606-418611) and the stack's own update (`FUN_00550ef0`, through the actor's vtable) run in an order not read | a capture of the frame the stance clip starts after a crouched reload's last key (research 230 §7, "Still reload -> stance/jump") |
| `VICTORY_DIVE_READING` | §9 | the dive out of a dance (`Traversal.dive`, named in its comment; no constant) is the original's: the full press runs `FUN_0057e540` when `FUN_00584b00` passes (D:L453387-453389), `FUN_00584b00` tests no dance (D:L443985-444001), and the push pops the stack (D:L440882-440885). What is open is the speed it reads: no dance's root reaches 30 a second (the fastest, `victory_rodeo`, peaks at 20.74 through `clipVelocity` on MP2), so a dive is reachable on the dance's first tick, where the port reads the run's velocity left on the actor (the root's is written at the first `victoryStep`). The original's order of the two at the start tick, and `FUN_00589900`'s flags under the dance (D:L444001; the dance passed it at its own push, `FUN_00588bc0` D:L446072-446073), are not read | a capture of a full press on the tick after a running SEAL starts a dance |
| `HOLD_OVER_PLACE_READING` | §11 | `'replaced'`: a kit hold asked over a running placing (`seal_place_claymore`, `seal_put_onwall`, `seal_p_put_onwall`) that is not the same placing -- the other placing or a throw -- ends the placing `replaced` and plays from its first key. The original pushes it over the placing (`FUN_00588bc0` pops no kit type, D:L446105-446291; `FUN_0028dc90` D:L135150-135214), which resumes when it pops; the port's mover holds one hold, no stack. A still reload there is the original's replacement (`FUN_0058a4d0`, D:L462925-462926), not this reading | `FUN_005a7de0(actor, 1, 1)`'s `NoFire` phase test (D:L462700-462706, `FUN_0058a8c0`) read for the place clips: if it refuses the shoulder press for the whole placing, the case is unreachable and the reading retires; else a stacked hold built in the mover, page and room together |
| `CLIPLESS_LANDING_RELOAD_READING` | §12.3 | `'kept'`: a landing that plays no clip (`FUN_005af590` D:L466684-466690) does not pop a still reload's clip covered by the fall -- its lock and life run on their own clock (`./stillReloadLife` `landingPops`; the room's `run` and the page's walk). Read: a landing with a clip pops the stack to its base first (D:L466691-466693) and the fall popped nothing (`FUN_00588bc0` D:L446105-446292). Not read: what pops `Jump fall` at a clipless landing (research 80's reading of the launch: `FUN_00589aa0` pops it, `FUN_0028da00` hands back the play under it), and the covered clip's own clock through the flight (its phase kept, §11.1), where the port's lock keeps its clock Also covered by it (the review's finding 3): a turn past `INTERRUPT_STICK` during the flight can still cut a still clip the fall covers (`watchCut` / `StillReloadLife.ran`), shortening the lock in the air -- the original's cut reads the stack's top (`Jump fall` then; inferred, not traced); room and page agree. *Read since (PARITY-2 PAR-65, research 230 §5.2.4; reading, pending review):* the pop is `FUN_005af930`'s landing branch's one `FUN_00589aa0` (D:L466900-466901), which takes the top -- the fall -- and `FUN_0028da00` hands back the play under it (its skip set again, D:L135105-135107): the covered clip is kept, so `'kept'` is read; *finding 3 since resolved* by PAR-60's review F2 (no cut in the air, research 230 §5.2.2). Still open: the covered clip's clock -- read (its phase kept, only the top advances: `FUN_0057a330` D:L438874, D:L438901), not built: the port's lock and life run on through the flight; the flinch's twin is research 230 §5.2.4's "found, not built". *Built by PAR-79 (§12.3, "PAR-79"; reading, pending review):* the life, the cut (a game frame past the landing), the uncut end and the crouched and prone holds on the clock that stands through the flight, room and page; `Rifle m203 reload` never covered (D:L466828). Left: the uncut lock (the start's own timer, research 218 §2.2) and the m203's pop at a clipless landing (PARITY-2 row PAR-82). *Built by PAR-82 (§12.3, "PAR-82"; reading, pending review):* any landing pops `Rifle m203 reload` (`landingPops` asks the still clip's family), its life and lock ending on the landing's command, room and page; its stand-in hold is not covered (`Walker.holdCovered`) | a capture of a crouched reload walked off a ledge, landing at rest and on the run; the m203's clipless pop (PAR-82, built) and the uncut lock, rows of their own |
| `RELOAD_CUT_DELAY_READING` | §12.5 | **`2 x GAME_FRAME_DT` since PAR-67 (the fifth 60 Hz command; the push lands after the driver, see below).** *Was* `GAME_FRAME_DT` (0.0334 s; the third 60 Hz command from the clip's first, PAR-61); *was before that* `2 x GAME_FRAME_DT`, the fifth, in PAR-61's first commit, corrected by its review, issue #160 (closed)): the first tick the stick can cut a still reload's or after-shot's clip -- the push's initial skip (`FUN_0028dc90` D:L135209-135212), the cut asked first (`FUN_00550ef0` D:L418180) strictly past the phase (`FUN_00587c20` D:L445550-445556), the skip spent by the driver's peek (`FUN_0028c4f0(dt, top, 0)` D:L418293; the clear D:L134257) and a whole frame added by the advance (D:L418454): the second driver tick, read; where the kit's push (`FUN_005c0fd0` from `FUN_005506a0` D:L417907) falls against the driver in the frame is not, so one to two game frames, the earliest taken (`viewer/src/reloadLock.ts` `reloadCuttable`: the room's `cutAt`, the page's `StillReloadLife` and `WeaponPose`). *Read since by PAR-64 (research 230 §5.2.3):* the push falls after the driver (`entity_post_tick` after `entity_tick`, D:L50925-50929), so two game frames, the phase a frame behind -- not built, a row of its own. *Built by PAR-67 (§12.5; reading, pending review):* `RELOAD_PUSH_LAG + GAME_FRAME_DT` = 2 x `GAME_FRAME_DT` (0.0667 s; the fifth command), the cut's phase on `reloadCutPhase` (`t - RELOAD_PUSH_LAG`), the reload holds' cut in `mover.ts` `holdCut` on the same lag | a capture of a standing reload cut by a stick held from its start: the frame of the push (the top's action) and the frame `Moving rifle reload` starts on the second channel (research 230 §7) |
| `HOLD_PUSH_FRAME_READING` | §12.5 | *note only*. **Read by PAR-70 (§12.5; reading, pending review):** every throw's push is the kit's frame's (`FUN_005c0fd0` D:L476624/476638 -> `FUN_005be9a0` D:L475501 -> `FUN_005802b0` D:L441900; `entity_post_tick`), after the driver: the throws' holds join the reload's on the lagged clock (`mover.ts` `LAGGED_HOLDS`, was `RELOAD_HOLDS`: the cut a game frame behind, the uncut end `reloadPlayedOut`); C4's `Put on wall` is the Action button's, in the controller's tick (`FUN_00594cf0` D:L453222/453243 -> `FUN_00592d50` -> D:L452055 -> D:L475420; `entity_pre_tick`, D:L418526), before the driver: the push's own clock, kept. **Still open:** `seal_place_claymore` is one hold code for pushes after the driver (the claymore's and the PMN's, D:L475322, D:L475354) and before it (the bomb's plant, D:L453273 -> D:L451514 -> D:L475481; the satchel's, D:L452208) and one whose pass is unread (the bomb's drop, `FUN_0059ddb0` D:L457611 from `FUN_002c1c30` D:L163962), so it keeps the push's own clock -- the claymore's and the PMN's cut a game frame early and end half a frame early (the 144th and 157th commands against the 146th and 158th); and a pre-driver push's uncut end half a frame before the last key (C4's 142nd against the port's 143rd; C4's end callback at the end test unread). *Was* (PAR-67's review F1): not read -- the kit's frame calls the throw path too (`FUN_005c0ae0`, D:L476623). Owed: the hold's source to the room (a wire or room row), the bomb's drop's pass, the pre-driver end *Read and built by PAR-74 and PAR-75 (§12.5, "PAR-74"; reading, pending review):* the pass is the item's, no wire change -- the page lays the bomb's plant before the driver (`./bombPage` `PLANT_PUSH_PASS`), the room tells it by its own bomb's placement (`room.ts` `placingPass`), every other `seal_place_claymore` is the claymore's or the PMN's, lagged (cut on the 146th, off on the 158th); the plant's off on the 156th (`swapPlayedOut`), C4's on the 142nd (its callback cleared at its 0.45 key, `FUN_0057a330` D:L438996-439003); the bomb's drop before the driver for a host's dropper, a peer's unread (`BOMB_DROP_PUSH_PASS_READING`). Nothing owed here |
| `BOMB_DROP_PUSH_PASS_READING` | §12.5 | `'before'`: the bomb's manual drop pushes `Place claymore` (`FUN_0059ddb0` D:L457611, only where the actor's controller is not remote, D:L457606-457612) before the frame's driver -- read for a host's dropper (the Action `FUN_00592d50` D:L452153 -> `FUN_0059dd30` -> `FUN_002b9910` -> `FUN_002c1f10` D:L159496 -> `FUN_002c20c0` D:L164040 -> `FUN_002c1c30` D:L163962, the controller's tick); a peer's push comes from the shared state's callback `FUN_002c23b0` (D:L164158, registered by `FUN_0030ce80` D:L164261), whose pass in the frame is not read (`viewer/src/bombPage.ts`, `startOwnClip` for the drop; the page plays it since the room names the drop, `dropWhy`, the online-parity sweep's P25, 2026-11-03; `room.ts` `placingPass` does not answer it yet, LATER 659) | the network library's dispatch of the shared state's callbacks against the scheduler's tasks (`FUN_001ec480` D:L50920-50934) read, or a capture of a peer's manual drop: the frame its `Place claymore` starts against the frame the ground state stops |
| `HOLD_END_ROOT_READING` | §12.5 | *note only*: since PAR-69 a reload hold runs one tick past its clip's last key (to the pop); on that tick the port's `clipVelocity` (`mover.ts`) moves the body by the last key pair's velocity (or travel over seconds without root keys); the original's root at the held stop (`FUN_0028c250` / `FUN_00289bb0`) is not read. Owed: the read (PARITY-2, PAR-69's review) |
| `HOLD_OVER_THROW_HAND_READING` | §11 | `'refused'`: a hold asked over a running throw is refused whatever hand threw it. The rifle hand's throws, the pistol's two tosses and both rifle peek tosses are in `FUN_005a7de0`'s and `FUN_005a7d10`'s lists (D:L462620-462634, D:L462579-462582): refused, read. The pistol hand's `Pistol throw grenade`, its crouched and prone kin and its peek tosses (`DAT_003debd0`, `DAT_003debc0`, `DAT_003debb0`, `DAT_003deb28`, `DAT_003deb38`) are in neither, and the port's hold codes do not carry the hand (they share the rifle type's clip code) | whether the kit's trigger path can fire a second throw during a pistol hand's throw clip (`FUN_005c0ae0` D:L476417-476448 with the wind-up's power, `FUN_00594cf0` D:L453478-453538) read whole, or a capture of a second throw pressed during a pistol hand's throw |
| `THROW_RELEASE_REMOTE_VIEW_READING` (*note only*) | §12.7 | no constant: another console plays a remote body's throw release by that body's view state (`FUN_005c5340` D:L479429-479430), which the body record does not carry (research 193 §4.1) and a spawn writes 0 (D:L419886-419889), so the port's other pages play the third person's pick, the `FireAnimName`, whatever the thrower's view (`matchThrow.ts` `remoteRelease`). Not read: whether any of `FUN_005448a0`'s callers writes a remote body's `+0x200` | the callers of `FUN_005448a0` read for a remote body, or a two-console capture of a throw in first person heard on the other console |
| `RUNNING_THROW_BODY_READING` | §12.6, §12.9 | **`'snapshot'` since PAR-85 (§12.9, built 2026-10-14; reading, pending review):** the stack draws its top alone (`FUN_00577ea0` D:L437430-437455); the push's snapshot of the pose drawn eases out over the throw's `BlendTime` (`FUN_0028dc90` D:L135215-135220, `FUN_00576860` D:L436624-436634), the covered play stays, stopped, and the pop eases back onto it at its kept phase over its own `BlendTime` (`FUN_0028da00` D:L135100-135107); the throw on top at 1 from the push to the hold's end, no twist under it (`throwPose.ts` `ThrowPose`, `animator.ts`). *Was* `'locomotion'`: beneath the throw's layer the port runs the live locomotion, which the hold sets idle (`mover.ts` `step60`), so the run cross-fades to the idle under the layer's 0.4 s fade-in and back after the cut. Read: the original keeps the run's play on the stack under the throw (`FUN_00588bc0` pops none for a throw, D:L446105-446291), its clock stopped (D:L438899-438901), and the pop cross-fades onto it over its `BlendTime` with its own phase kept (`FUN_0028da00` D:L135101-135108). Not read: whether the stack draws a covered play, and how the snapshot blend weighs against the top | a frame-by-frame capture of a running throw, the stick held through the release and the cut, and one left at rest (the legs through the two blends) |
| `PISTOL_ONESHOT_PARTS_READING` | §12.9 (research 85 §8.1) | `{ throw: 'push', place: 'beneath' }` since PAR-85 (B4, built 2026-10-14; reading, pending review): a part the top's clip lacks is not written (`FUN_005777d0` D:L437202-437285, `FUN_00577700` D:L437155-437167) and holds the pose drawn at the push -- `seal_p_throwgrenade` and `seal_p_tossgrenade` lack `skel_root`, `hips` and every leg part (the reader), so the legs stand frozen through a pistol-hand throw (`animator.ts`, a `top` layer's missing parts). The placings' layer is not the stack's top yet: `'beneath'`, the port's. *Was* `'beneath'` for every pistol one-shot (research 85 §8.1) | a capture of a pistol-hand running throw (the legs frozen mid-stride); the placings built as the top |
| `THROW_LOW_STANCE_POP_READING` | §12.9 | `{ stand: 'kept', crouch: 'beneath', prone: 'beneath' }` (PAR-85, 2026-10-14; reading, pending review): the play under a throw's hold, by stance. Standing, read and built (B2): kept, its clock stopped, handed back at its kept phase. Crouched and prone the pop runs the state's own case, `FUN_00584c60` (crouched, from D:L444037: a pop-all at D:L444094-444106, a push of 0x14 at D:L444148-444154) or `FUN_005845c0` (prone, from D:L443839), not read: the port's play beneath stands (`animator.ts`: the walker's ground idle, covered by the throw, no cross-fade of its own) | those two read whole for a looped top after a throw's pop, or a capture of a crouch-walk throw cut by the held stick |
| `THROW_RELEASED_STICK_END_READING` | §12.9 | no constant (named in `animator.ts`'s comment on the layer cross-fade): a running throw whose stick is let go before its end pops, and the standing state pushes its own play on the same tick (`FUN_00586570` -> `FUN_00586240` / `FUN_00586050`, D:L444891-444896, D:L444918-444923, D:L444943-444948): a second snapshot, of the throw's last drawn pose (the pop's blend running, D:L135215-135216), over that play's `BlendTime` (`seal_stand`'s 0.5). Inferred, not traced. The port: the idle's play started on the pop's frame takes the cross-fade, the pop's own (the run's 0.4) giving way to it | `FUN_00586240` and `FUN_00586050` read whole for a top of type Walk/Jog/Run, or a capture of a running throw with the stick let go mid-throw |

## 8. The wave-4 hunks (PAR.R3: written by the integrator, not here)

Exact against `agent/par19` at the review's fix round, as `git apply` patches from the worktree's root (each checked with
`git apply --check`). Each hunk carries its fakes' updates. Verified by applying them to copies of the two packages
(not the tree) and running, one file a run: `matchLanes` 8, `parity/inputTiming` 3 (its expected failures still
expected), `matchFirearm` 17, `matchThrow` 12, `equipmentAnim` 14, `effectiveAction` 27; the server's `roomReloadLock`
8 (the new case red without the room hunk), `room` 161, `roomBlast` 13, `roomGates` 17, `netcode` 11, `roomCapability`
3; `tsc` on both copies adds no error (the copies' own path artefacts aside). The reload's two halves (`matchFirearm`,
`room.ts`) land together. The room hunk is more than the one line PAR.R3 allows the seam: the controller decides.

The page's half -- the pad's stance button toggles from the request (§2.3; `matchLanes` and its two fakes), a reaction
that pops the still reload's clip ends the reload (§4.2; `matchFirearm`), the throw's pose ends with its hold and the
wind-up yields to the shoulder press (§4.1, §4.2; `matchThrow` and its two fakes):

```diff
diff --git a/socomlegacy/packages/viewer/src/matchLanes.ts b/socomlegacy/packages/viewer/src/matchLanes.ts
index 154c05f76..1704e12f3 100644
--- a/socomlegacy/packages/viewer/src/matchLanes.ts
+++ b/socomlegacy/packages/viewer/src/matchLanes.ts
@@ -20,3 +20,3 @@ import type { WalkMode } from './walk';
 export interface LaneParts {
-  walk: Pick<WalkMode, 'mode' | 'isDead' | 'jump' | 'crouch' | 'stance' | 'setStance'>;
+  walk: Pick<WalkMode, 'mode' | 'isDead' | 'jump' | 'crouch' | 'stance' | 'stanceIntent' | 'setStance'>;
   firearm: Pick<MatchFirearm, 'stepZoom' | 'switchFireMode' | 'viewLanes'> & { fire: Pick<MatchFirearm['fire'], 'reload'> };
@@ -58,3 +58,3 @@ export function playerLanes(l: LaneParts, before: Input, after: Input, dt: numbe
   // Fed a released button off foot, so a press begun in the fly camera is not a tap when the walk begins.
-  const go = l.stanceButton.update(walking && after.stance, dt, walk.stance());
+  const go = l.stanceButton.update(walking && after.stance, dt, walk.stanceIntent());   // PAR-19: FUN_00594cf0 reads actor+0x374
   if (go !== null) walk.setStance(go);
diff --git a/socomlegacy/packages/viewer/test/matchLanes.test.ts b/socomlegacy/packages/viewer/test/matchLanes.test.ts
index f14689b93..a39fa2545 100644
--- a/socomlegacy/packages/viewer/test/matchLanes.test.ts
+++ b/socomlegacy/packages/viewer/test/matchLanes.test.ts
@@ -21,3 +21,3 @@ function rig(mode: 'walk' | 'fly' = 'walk', withAction = true) {
     walk: {
-      mode: () => mode, isDead: () => false, stance: () => 'stand',
+      mode: () => mode, isDead: () => false, stance: () => 'stand', stanceIntent: () => 'stand',
       jump: () => { calls.push('jump'); return true; }, crouch: () => { calls.push('crouch'); return true; }, setStance: (s) => { calls.push(`stance:${s}`); return true; },
diff --git a/socomlegacy/packages/viewer/test/parity/inputTiming.test.ts b/socomlegacy/packages/viewer/test/parity/inputTiming.test.ts
index e777be116..a1318520a 100644
--- a/socomlegacy/packages/viewer/test/parity/inputTiming.test.ts
+++ b/socomlegacy/packages/viewer/test/parity/inputTiming.test.ts
@@ -21,3 +21,3 @@ describe('research 230: DEFAULT fire-mode timing', () => {
             const lanes: LaneParts = {
-                walk: { mode: () => 'walk', isDead: () => false, stance: () => 'stand', jump: () => false, crouch: () => false, setStance: () => false },
+                walk: { mode: () => 'walk', isDead: () => false, stance: () => 'stand', stanceIntent: () => 'stand', jump: () => false, crouch: () => false, setStance: () => false },
                 firearm: { stepZoom: () => 0, switchFireMode() { count++; return 'semi'; }, viewLanes() { }, fire: { reload() { } } },
diff --git a/socomlegacy/packages/viewer/src/matchFirearm.ts b/socomlegacy/packages/viewer/src/matchFirearm.ts
index a83b06e04..7a3d2d9ba 100644
--- a/socomlegacy/packages/viewer/src/matchFirearm.ts
+++ b/socomlegacy/packages/viewer/src/matchFirearm.ts
@@ -7,3 +7,3 @@ import type { EffectData } from './effectData';
 import { Effects } from './effects';
-import { Fire, type FireEvent } from './fire';
+import { Fire, reloadEndOfBody, type FireEvent } from './fire';
 import { KitRounds, roundArmingOf } from './firearms';
@@ -490,2 +490,5 @@ export function mountFirearm(d: MatchFirearmDeps): MatchFirearm {
     fire.subscribe((e) => { if (e.type === 'reloadStart' || e.type === 'afterShot') walk.holdReload(reloadHoldPeriod(e.family, e.seconds)); }),
+    // PAR-19 D04 (research 251 s4.2): a knock (or another action) that pops the still reload's clip ends it, the magazine
+    // kept; an after-shot's lock is left to its own clock (`Fire.cancelReload` ends only a reload under way on a reaction).
+    walk.onActionEnd((e) => { const r = reloadEndOfBody(e); if (r) fire.cancelReload(r); }),
     // M4 (research 94 §C4): a round mode's round leaves -- flown on the page where the throwables are mounted
diff --git a/socomlegacy/packages/viewer/src/matchThrow.ts b/socomlegacy/packages/viewer/src/matchThrow.ts
index 5d720694c..3878f96f3 100644
--- a/socomlegacy/packages/viewer/src/matchThrow.ts
+++ b/socomlegacy/packages/viewer/src/matchThrow.ts
@@ -20,3 +20,3 @@ import type { SurfaceShade } from './surfaceShade';
 import type { MarkClipper } from './markClip';
-import { ThrowPose } from './throwPose';
+import { ThrowPose, throwPoseEnds } from './throwPose';
 import type { WalkMode } from './walk';
@@ -184,2 +184,3 @@ export function mountThrowables(d: MatchThrowDeps): MatchThrowables {
   offs.push(grenade.on('throwStart', ({ anim, hold }) => { throwPose.start(anim); walk.hold(hold); }));
+  offs.push(walk.onActionEnd((e) => { if (throwPoseEnds(e)) throwPose.cut(); }));   // PAR-19 D08: the pose ends with its hold
   // `c4_start`: .PLACE_CHARGE. M7: the match hears it as a throw of the charge, its facing as the velocity (room.ts `placeCharge`).
@@ -305,3 +306,3 @@ export function mountThrowables(d: MatchThrowDeps): MatchThrowables {
     if (slot === DETONATOR_SLOT) {
-      if (firearm().kit.swapping() || grenade.phase() === 'holding' || grenade.phase() === 'throwing') return false;
+      if (firearm().kit.swapping() || grenade.phase() === 'throwing') return false;   // PAR-19 D07: the wind-up yields
       rocket.lower();
@@ -381,3 +382,3 @@ export function mountThrowables(d: MatchThrowDeps): MatchThrowables {
     if (walk.mode() !== 'walk' || firearm().kit.swapping()) return false;
-    if (grenade.phase() === 'holding' || grenade.phase() === 'throwing') return false;
+    if (grenade.phase() === 'throwing') return false;                                 // PAR-19 D07
     // PF-21 (research 217 §4.2): the launcher raised from the firearm in hand, its own clip's length (the room's).
@@ -391,3 +392,3 @@ export function mountThrowables(d: MatchThrowDeps): MatchThrowables {
     itemUp: () => grenade.equipped(),
-    busy: () => grenade.phase() === 'holding' || grenade.phase() === 'throwing',
+    busy: () => grenade.phase() === 'throwing',                                        // PAR-19 D07: FUN_005a8cb0 sees no wind-up
     takeable: (slot) => inventoryKit().takeable(slot),
diff --git a/socomlegacy/packages/viewer/test/matchThrow.test.ts b/socomlegacy/packages/viewer/test/matchThrow.test.ts
index 2a2223017..d1403286f 100644
--- a/socomlegacy/packages/viewer/test/matchThrow.test.ts
+++ b/socomlegacy/packages/viewer/test/matchThrow.test.ts
@@ -38,3 +38,3 @@ function rig(extra: Partial<MatchThrowDeps> = {}) {
       grid: () => null, snapshot: () => null, view: () => ({}) as never, fireAim: () => null, feet: () => null, drawnFeet: () => null,
-      hold: () => {}, mode: () => 'walk', isDead: () => false, swapGate: () => true,
+      hold: () => {}, mode: () => 'walk', isDead: () => false, swapGate: () => true, onActionEnd: () => () => {},
     } as never,
diff --git a/socomlegacy/packages/viewer/test/equipmentAnim.test.ts b/socomlegacy/packages/viewer/test/equipmentAnim.test.ts
index 6c1310b6e..cc18820bf 100644
--- a/socomlegacy/packages/viewer/test/equipmentAnim.test.ts
+++ b/socomlegacy/packages/viewer/test/equipmentAnim.test.ts
@@ -289,3 +289,3 @@ describe('the hands while an item is up (./matchThrow; FUN_005a64c0, FUN_0055329
         grid: () => null, snapshot: () => null, view: () => 'third', fireAim: () => null, feet: () => null, drawnFeet: () => null,
-        hold: () => true, mode: () => 'walk', isDead: () => false, swapGate: () => true,
+        hold: () => true, mode: () => 'walk', isDead: () => false, swapGate: () => true, onActionEnd: () => () => {},
       } as never,
```

The room's half -- its knock ends the hand's still reload lock, with its test (§4.2):

```diff
diff --git a/socomlegacy/packages/match/src/room.ts b/socomlegacy/packages/match/src/room.ts
index 7b615c9c7..e3baff33f 100644
--- a/socomlegacy/packages/match/src/room.ts
+++ b/socomlegacy/packages/match/src/room.ts
@@ -3204,3 +3204,18 @@ export class Room {
     if (q.mounted !== null) this.releaseTurret(this.turrets[q.mounted]!);
-    return applyKnock(q.sim.walker, q.sim.moves, knock) ? knock : null;
+    const held = q.sim.walker.holding;                                   // PAR-19 D04: a still reload's clip on the stack
+    const laid = applyKnock(q.sim.walker, q.sim.moves, knock) ? knock : null;
+    if (laid && held && /reload$/.test(held.clip)) this.endStillReload(q);   // popped: its lock ends now (FUN_005a7ab0)
+    return laid;
+  }
+
+  /**
+   * PAR-19 D04 (research 251 s4.2): the hand's still reload clip popped by a reaction: its lock ends at this command,
+   * the magazine kept. An after-shot's lock (`lockKind` 'afterShot') is left to its own clock, as the page leaves it.
+   */
+  private endStillReload(p: Player): void {
+    const w = p.sim.weapon;
+    if (p.lockKind[w] !== 'reload' || !(p.ran < p.reloadUntil[w])) return;
+    p.lockClock[w] -= p.reloadUntil[w] - p.ran;
+    p.reloadUntil[w] = p.ran;
+    p.reloadLife[w] = null;
   }
diff --git a/socomlegacy/packages/central/test/roomReloadLock.test.ts b/socomlegacy/packages/central/test/roomReloadLock.test.ts
index 79676c41d..a50467528 100644
--- a/socomlegacy/packages/central/test/roomReloadLock.test.ts
+++ b/socomlegacy/packages/central/test/roomReloadLock.test.ts
@@ -285,2 +285,26 @@ describe.skipIf(absent)('the room\'s reload lock follows its own mover\'s cut (P
   });
+
+  it("PAR-19 D04: a knock pops a still crouched reload's clip and its lock ends at that command, the magazine kept; unknocked the lock runs on (FUN_0057e770, FUN_005a7ab0)", () => {
+    const run = (knocked: boolean) => {
+      const d = duel(sim());
+      d.p.sim.walker.stance = 'crouch';
+      d.run(30);
+      const at = d.count();
+      d.reload(at);
+      d.run(1, { buttons: holdBits('seal_crouch_reload') });
+      d.run(1);
+      expect(d.p.sim.walker.holding?.clip).toBe('seal_crouch_reload');
+      expect(d.p.lockKind[0]).toBe('reload');
+      expect(d.p.reloadUntil[0]).toBeGreaterThan(d.p.ran + 30);
+      const rounds = d.p.mags[0].rounds();
+      if (knocked) expect(d.room['layKnock'](d.p as never, { velocity: [0, 15, -5], fall: 'fallBackwards' })).not.toBeNull();
+      return { d, rounds };
+    };
+    const k = run(true);
+    expect(k.d.p.sim.walker.holding).toBeNull();
+    expect(k.d.p.reloadUntil[0]).toBe(k.d.p.ran);                                  // the lock ends with the clip
+    expect(k.d.p.mags[0].rounds()).toBe(k.rounds);                                  // the magazine selected at the start kept
+    const u = run(false);
+    expect(u.d.p.reloadUntil[0]).toBeGreaterThan(u.d.p.ran + 30);
+  });
 });
```

**Landed (PARITY-1 wave 4, `agent/parw4`, 2026-10-08).** The page's and the room's halves above in one commit, as
written, but for `inputTiming.test.ts`'s fake, redone by hand on the lane's context (`stanceIntent` added beside the
boolean `viewLanes`/`reload` of cefd2681). The room's test gains two controls the merge controller's acceptance asked
for. A knock during a moving reload leaves its lock: **the port's behaviour, not parity** (the wave-4 review's F1). As
first landed the case cited `FUN_005a7ab0` D:L462548-462556 against the stack pop at D:L440997 as the source; that
reading was wrong -- the knock's `FUN_005a5da0` (D:L440993) clears the second channel (D:L461713-461714), and the kit
term `FUN_005c2400` (D:L477159) is 0 once the clip is pushed (D:L476560); s6 owes the row. And a knock during a pump's
after-shot clip leaves the after-shot's lock and life (`endStillReload` returns at `lockKind` 'afterShot', as
`Fire.cancelReload`'s reaction guard leaves a reload not under way on the page).

## 9. The victory dance in the model (PARITY-1 close, 2026-10-09)

Chris's integration (PR #89, [research 303](303-original-victory-dances.md)) put the victory dance on the mover as a
field of its own (`Walker.victoryMotion`), each gate asking it apart; the merge into `agent/parity` (`ccafb962c`) kept
PAR-19's calls and marked the six places (`TODO(PAR-fold)`). The fold makes the dance a body owner of §1's model.
Status: **reading, pending review**. The author re-read the lines cited here; research 303's other citations are
Chris's and stay in his note.

- **Its family, `victory`.** `FUN_0057dcc0` clears the stack (`FUN_0058a4d0`, D:L440586) and pushes its own action
  type (`DAT_003df130`, D:L440588) through `FUN_00588bc0` with the flag `0xd` the jump's pushes take (D:L440820,
  D:L440843). It is none of the transition types (0x11, 0x13, 0x19) and not the swap's (0x35-0x37), so it is in none of
  §1's families. Every dance is `looped(0)` on the disc (research 303 §2), a one-shot like the walk's actions.
  `bodyOwner()` reports `{ source: 'victory', name: 'victory', family: 'victory', serial }` (the serial counts the
  dances started), after the walk's action and the kit's hold and before a traversal's clip.
- **The stance gate.** `FUN_00552ec0`'s outer test (D:L418927-418930) passes only a looped top or a transition. A
  press under the dance is therefore the request (`owned`), taken when the dance ends. The dance's run-out comes off with
  the tick's clocks, so the request is taken on that tick (`PENDING_STANCE_RETRY_READING`). This answers research
  303 §3's open question (whether a stance press is accepted during a dance) for the request's path only, the tap
  (D:L453351-453377 write `actor+0x374`). 303's "accepted stance transitions discard the dance" belong to the
  transition pushers, which run only once the gate passes. The full press goes to the dive first, asking no gate
  (D:L453387-453389, below); its path other than the dive (`FUN_005857e0`, `FUN_00584c10`, after D:L453390) is not
  read here.
- **The jump.** `FUN_0057e1b0` refuses under a top whose looped bit is clear (D:L440810; research 303's
  `0x0057e300`-`0x0057e30c`). `Walker.jump` asks `bodyOwner()` alone: the separate check is gone. D02's page gate
  (`WalkMode.jump`) reaches it through `Walker.jump`, and the room refuses the same command on its own mover's `jump`
  (the room's `jumpRefused` is the still reload's life, unchanged). *PAR-78 (research 230 section 5.2.5): `jumpRefused`
  and `WalkMode.jump` refuse under the flinch's window too (`flinchOnTop`), the flinch being a one-shot the mover does not
  carry.*
- **The swap.** `swapRefused` asks `bodyOwner()`'s family. In the original the refusal is the dance's NoFire through
  the common gate (research 303 §3), not the stack, so the effect is unchanged.
- **The dive** is not refused by the dance. The full press runs `FUN_0057e540` when `FUN_00584b00` passes
  (`FUN_00594cf0` D:L453387-453389), and `FUN_00584b00` tests no dance: a dive already on the stack, `+0xeac`, the
  water (D:L443990-443992: refused when `+0x105e` bit 7 is set and `+0xf88` is over 2.0 -- the in-water bit and the
  water over the feet that `FUN_005b52b0` writes, D:L469852-469902, research 181; the port's `depth_ > DIVE_WATER` in
  `Traversal.dive`, its depth 0 out of the water), the
  swap (`FUN_005a7980`), the speed squared at least 900 (D:L443998) and `FUN_00589900` (D:L444001), whose refusals do
  not name it (the dance passed it at its own push, `FUN_00588bc0` D:L446072-446073). The dive's push pops the whole
  stack (D:L440882-440885) before it pushes `0x1a` and the dive (D:L440896-440897). So `Traversal.dive` takes the press
  under the dance and ends the dance as `replaced` (`Walker.stopVictoryMotion('replaced')`), since a traversal does not
  tick under it (`Traversal.step`, research 303). No dance's root reaches 30 a second -- the fastest, `victory_rodeo`,
  peaks at 20.74 (the port's `clipVelocity` over MP2's seven clips, the author's probe; `victory_backflip` 10.99, the
  others under 9) -- so the dive is reachable mostly on the dance's first tick, on the run's velocity left on the actor;
  the order of the two at that tick is `VICTORY_DIVE_READING` (§7). (The fold's first commit refused the dive, after the
  brief; the fold's review read the source above and overturned it.)
- **Its ends**, each heard once by `onActionEnd`:
  - `stopped`, new and additive: its owner's stop (`Walker.stopVictoryMotion`), called by the room's `stopVictory` and
    by the page's `WalkMode.syncVictoryMotion(null)`;
  - `complete`: its clock ran out (in the clocks, and in `advanceVictory`'s catch-up);
  - `cut`: the stick or the turn passed `INTERRUPT_STICK` (`FUN_00587c20` D:L445514+, with the clip's NoInterrupt
    absent: research 303 §3);
  - `death`: a dead mover's tick;
  - `knock`: the knock's fall (`start`'s `endBody`);
  - `replaced`: a new action (`endBody` from `start` or `setAirborne`), a hold (`hold`), a new dance, the dive
    (`Traversal.dive`), or leaving the floor (`takeOff`, the dance's root carrying it over an edge).

  `place` clears it unheard, as it clears the action. `endBody` takes the dance off with the action: what takes the
  body takes it from the dance.
- **The start clears the stack -- the action; a hold wins.** `FUN_0057dcc0` clears it (`FUN_0058a4d0`, D:L440586) before
  the push, so `setVictoryMotion` ends an action under way as `replaced` first. The room starts a dance only on a free
  body (`victoryStatus`, server `room.ts` L982: `!w.action && !w.holding`); the page can hold one when it hears the
  dance, from a command sent after the one the room began the dance after (`seq`). A jump there ends `replaced`, as the
  room never ran it (its mover's `jump` refuses under the dance, (d)), and the dance plays on both. A hold there is the
  other way round: the room ran that command's hold bit over the dance (`MoverSim.apply`, moverSim L112, `w.hold`),
  whose push replaced the dance (`Walker.hold`'s `endVictory('replaced')`), and the room then stopped it (`room.ts`
  L2172, the `!victoryMotion` check after `apply`; a still reload's acceptance stops it on purpose too, `room.ts` L4126,
  `0x005a86b4`). So on the page the hold already playing wins, and page and room agree on the count (one start, one
  end), the end's reason (`replaced`) and the owner after it (the hold): the dance begins and ends at once as
  `replaced` (its start counted, its end heard), the hold plays on, and the room's stop then finds nothing to stop.
  They do **not** agree on the position. When the page's hold rides command S+k, S the dance's `seq`, the room ran
  S+1..S+k-1 under the dance, each with its tick's root travel (`victoryStep`, mover L1262), before S+k's hold
  replaced it; the page ends the dance at once, so the dance's root never moves the page's mover. For k = 1 the two
  stand together (the room lays S+1's hold before that command's tick, `MoverSim.apply`, so no root step runs); for
  k > 1 the page's mover stands k-1 ticks of root travel off the room's until the snapshots' reconcile
  (`net/client.ts` L581, `reconcile` -> `reconcileFeet`) corrects the difference -- a transient gap, owed below.
  (The fold's F3 ended the page's hold instead and played the dance's root
  travel until the room's stop arrived, a round trip apart from the room: the PARITY-1 close's pass-3 finding.) Not
  handled: a page mover already in the air at that moment (a running jump's launch) keeps its fall, and its landing then
  ends the dance; the room never takes the jump, so the room's correction is what puts it back.
- **A stance transition under way is undone, not only ended** (the PARITY-1 close's pass 5). The page's crouch press
  rides command S+k, S the dance's `seq`. With no body owner on the page, the gate takes it at once: the stance is
  crouch and `Stand -> Crouch` plays. The room ran S+k under the dance, where the gate kept the press as the request
  (`owned`, the stance gate above). So when the page heard the dance, `setVictoryMotion` ended the clip `replaced`
  (the stack clear, `FUN_0058a4d0` D:L440586) and left the page's mover crouched with nothing pending. For the dance's
  2.44 s (`victory_funky`) the page drew its player crouched while the room and the others saw him standing. At the
  dance's end the room took the crouch with its clip, which holds its mover still, and the page played none. The
  reconcile corrects the feet and the facing, never the stance. On `main` the room's stance change started a transition
  that ended the dance on both ends, so they agreed. The fix (`Walker.undoTransition`, called by `setVictoryMotion`):
  the transition's stance goes back to the one it left (its clip's name and direction, as `applyStance` chose them), and
  its press goes back to being the request (`changeStance`: a request still pending under the transition, else the stance it
  took). The dance's gate keeps the request, and the dance's end takes it with its transition, through the same
  `retryStance` the room's mover runs (`PENDING_STANCE_RETRY_READING`). A press the transition refused (prone under
  0x11) stays the request, and a press it took (the word changed back, no new clip) leaves nothing pending, as the
  room's last press does. **This is a port invariant keeping the page and the room agreeing, not the original's
  behaviour.** The original runs on one machine; `FUN_0057dcc0` clears the stack and pushes the dance with the stance
  word as it stands (`actor+0x174`, D:L440588), and nothing in it makes a transition clip non-replaceable. It does not
  reach the room, which starts a dance only with no action on its mover (`victoryStatus`).
- **Owed: ONE item -- done by PAR-37 (§9.1); kept as the record of the windows -- the page's commands after the dance's `seq` are not re-run under the dance** (the PARITY-1 close's
  passes 3-6; pass 6's ruling: file the windows as one item, patch no further case in this close). The page runs commands
  S+1 to its last sent with no dance on its mover; the room runs them under the dance. The page's fixes so far (a jump
  cleared, a hold kept, a stance transition undone) bring the common cases into line; these windows remain, each a
  round trip at most, the reconcile correcting the feet and facing but not the dance's life, the stance or the weapon:
  - *The hold's position gap*: the room runs the dance's root for the k-1 commands before a hold on S+k replaces it;
    the page never moves.
  - *A reload that lays no hold* (older than this lane, from PR #89): the room stops the dance on any accepted reload
    (`room.ts` L4126, the original's `0x005a86b4`); a standing reload sent after S lays no hold on the page
    (`reloadHold` null for `stand`, mover L806-810), so the page dances until the room's stop arrives.
  - *A stance change with no clip left to undo*: a stand <-> crouch press taken over `STANCE_MOVING` (no clip), or a
    transition that FINISHED before the page heard the dance (0.60 s stand<->crouch, 0.85 s crouch<->prone, 0.95 s
    stand<->prone: a round trip plus the room's queue past about 0.6 s). The page keeps the new stance under the dance;
    the room holds it pending and takes it, with its clip, at the dance's end.
  - *A swap* (older than this lane): the room refuses a swap under the dance (`room.ts` L2265); on the page
    `setVictoryMotion` ends a full-body swap `replaced` and `Kit.frame` then finishes it to the target weapon
    (`kit.ts` L176), so the page holds the new weapon and the room the old (whether anything corrects it later is
    untraced).
  - *The sticks*: `advanceVictory(ahead)` ignores the sticks of S+1..S+k, though one past `INTERRUPT_STICK` already cut
    the room's dance.
  The structural fix is PARITY-2's PAR-37: re-run S+1..the last command from a mover state kept per sent command (the
  page already replays commands through `MoverSim` in `respawn`), or hold the moves the dance refuses while a victory
  request is in flight. **Done by PAR-37 (§9.1), the first of the two.**

### 9.1 The commands after the dance's `seq` run again under it (PARITY-2, PAR-37, 2026-10-11)

Status: **reading, pending review** (a port invariant keeping the page and the room agreeing, as pass 5's; the original
runs one machine and has no `seq`). The tests are port contracts against the loopback room, not a measurement of the
original. No delay is guessed: nothing waits on a clock.

**The design, and why this one.** Of the two the row allows, the re-run is the smaller that closes every window:
- Holding back the moves the dance refuses while the request is in flight cannot hold the stick: the dance takes a
  stick or a turn past `INTERRUPT_STICK` as its cut (`FUN_00587c20`, `FUN_00550ef0`), and freezing the stick for a
  round trip would change the game. The sticks and the hold's position gap would each still need the page's commands
  S+1.. read against the dance's rules -- the room's rules written a second time, window by window, which pass 6 ruled
  out.
- Nor does it reach the commands sent *before* the request that the room ran *after* the dance's start: the room takes
  the request when it arrives (`room.ts` `requestVictory`, `seq` its mover's last command run) and runs queued commands
  at its steps, so S is commonly behind the page's last command at the request.
- The re-run runs every window through one rule, the room's own (`MoverSim.apply`), as `respawn` already replays.

**What is built.**
- `Walker.saveState` / `restoreState` (`mover.ts`): the mover's whole state, a deep copy, without what is not the
  simulation's (the grid and its caches, the listeners, the moves, the clips' roots, the frame's part-tick); the landing
  and the last end are kept by reference (never mutated).
- `WalkMode` keeps, per command sent (`send`), the command, the mover after its tick, the stance, the weapon, the hold's
  period it carried and the jumps so far -- the last 600, the net client's own 10 s history (`KEPT_COMMANDS`, a bound,
  not a game value). A correction the net client lays on the mover (`nudge`) moves the kept movers too.
- On the dance heard (`syncVictoryMotion`, S = the room's `seq`): the mover laid back to the state after S, its facing
  and the look gate as they stood after S (`LookLog.after`, so a facing's replay since counts), the dance started there
  (the room starts it between its commands), then S+1 to the last command applied through `MoverSim` with the page's
  look context and each command's hold period; the look log is recorded again from S. A move the page began since (the
  dive) is dropped first: the room starts a dance only with none playing (`victoryStatus`). A press already taken but
  not yet sent rides the next command, so the run waits for that tick -- also when nothing was sent past S (the answer
  within a tick (review of `065f06423`, finding 2). A stop heard while it waits is laid in the run at its own command
  (`WalkMode.stopVictoryMotionAfter`; review of `4c1d95f76`, finding 1): the room's stop after the last command sent --
  the room sent it before running the next, and a flinch's (`room.ts` `stopVictory` at the accepted flinch), the round's
  end or the room's clock are not in the commands -- and the page's own reload's after the command past the reload's,
  where the room decides it; the commands after it run with no dance. The net client's predictions after S stop being
  compared from the moment it waits. Without a kept state for S and every command
  after it (a new mover; a blast's knock laid at or after S, `WalkMode`'s `knockedAfter`), the dance's root alone runs as before
  (`advanceVictory`), and so do pass 3's and pass 5's rules in `setVictoryMotion`.
- The reload: `VictoryPage.reloaded` (wired from the firearm's `reloadStart` in `matchActions.ts`) keeps the command a
  reload rode while the request is in flight (`NetClient.lastSeq`, the one `netPage.ts` names); the room decides it once
  the command after it has run (`room.ts` `due`) and its acceptance stops the dance (`stopVictory`, `0x005a86b4`), so the
  page stops it after that command too, in the run or at that tick.
- The weapon: a swap the run refuses (`MoverSim`'s swap under the dance, `swapRefused`'s `victory`) puts the walk's weapon
  back and is told once to the kit (`SwapProgress.undone`, `WalkMode.swapProgress`): `Kit.frame` returns to the firearm
  and the mounts it left, `m_item` told again when it had changed, whether the swap is still playing or already finished.
- The net client: the predictions after S are the run's, not compared (`NetClient.replayed`, as a respawn's).

**Each window, as a paired case** (`packages/viewer/test/victoryReplay.test.ts`, 21 paired cases (PAR-49's the 16th,
PAR-51's the 17th to the 21st) plus 4 kit unit cases (PAR-51's the 3rd and 4th):
the page's `WalkMode` and `VictoryPage` against the loopback room, the room's answer held on the way down while the page
sends more commands): the hold's position gap; a standing reload after S, one on the last command sent, and a crouched
reload through the page's own path (the reload event at R, `holdReload`'s hold riding R+1, the dance `replaced`); a
stance change whose transition finished before the dance is heard, and one taken with no clip over `STANCE_MOVING`; a
swap; the stick; the turn; a press pending when the dance is heard; the start and the room's stop heard in one batch
while the run waits; a room stop the run cannot see (a flinch's) heard while it waits, with a swap the room then takes; the answer within a tick with a swap pressed since the last tick; the up-link behind (the room
takes the request before the page's last commands and runs them under the dance); the up-link behind at the room's
stop (PAR-49: the stop at S+m below the page's S+n, its `seq` laid in the waiting run, a swap on S+m+1 taken by both);
the room's stop at S+m heard after the immediate run, the swap on S+j redone (PAR-51), the same with the stop naming S
itself (m = 0), the page's live ticks gone on under the dance past the room's stop, a facing correction replayed through
the run's look steps against a twin page that ticked the same commands live, and the same with the start and the stop
in one batch; and an idle control. Each asserts the dance's life (playing and its ends with their reasons),
the stance and the request, the weapon and the position (0.01 u) at the moment the page hears the dance and again after
the room's later messages and ten more commands. Four kit cases hold the undo and the redo.

**Not built, named.**
- The moves' own state is not kept: a move under way at S on the page (the room's offer forbids one on its mover) is
  dropped with the rest. The moves are reset only when one is busy or posed, so their state changed after S otherwise --
  the lean and the peek (`peekValue`, the lean's hold), `actionPressed` -- is not rewound before the run (review finding 3);
  the run lays each command's lean again (`MoverSim.prepare`), so only state the commands do not lay can part.
- The page's still-reload clock (`stillClip`, PARITY-1 D02) and the turret's hold are not run in the re-run; a dance is
  started only off a turret and with no reload playing (`victoryStatus`).
- Ends heard in the first run and again in the re-run (an end both runs make between S and the dance's hearing) reach
  the page's listeners twice; a body owner the re-run drops (a transition the room never ran) comes off unheard.
- The kit's undo restores `m_item` and the mounts; the swap's start hook (`started` in `matchFirearm.ts`: `fire.release`,
  `switchZoom`, `stillReload.end`) is not undone beyond what `m_item`'s own change carries (review finding 4). Where the
  undo falls against the page's swap gate (`Kit.frame` against the next shoulder press's `swapGate`, `FUN_00594cf0`'s
  order) is the port's, not read from the original: uncited.
- The room's own clock for the dance (`tickVictories`, its start tick) is unchanged; the re-run counts the walker's.
- **Closed by PAR-49 (2026-10-11), reading, pending review: the room's stop names its command.** It was: a room stop
  heard while the run waits was laid after the last command sent, the latest it can have come (the stop named no
  command), so a stop the room laid earlier -- on a real network its last command at the stop is S+m, m below n by
  about a round trip -- left the whole dance, its root and its refusals, on the page for S+m+1..S+n: a swap pressed
  there was refused on the page and taken by the room. Now `stopVictory`'s broadcast carries `seq: p.sim.seq`, the
  start's expression (`room.ts` `stopVictory`; omitted with the seat's player gone), and the page lays a stop that
  names it after exactly that command (`VictoryPage.stop(seq)` -> `WalkMode.stopVictoryMotionAfter(seq)`); a stop
  without it (an older room) is laid after the last sent, as before; the page's own reload stop is unchanged. Held by
  `packages/central/test/roomVictoryStop.test.ts` (the flinch, the round's end, the dance's length run out -- the walker's own end; `tickVictories`' clock branch proper not exercised: the stop's `seq` is the
  sim's at the stop) and the paired case "PAR-49: the up-link behind" in `victoryReplay.test.ts`. A port invariant, as
  §9.1's: the original runs one machine and has no `seq`.
- **Closed by PAR-51 (2026-10-11), reading, pending review: a stop naming S+m heard after the run has run.** It was:
  the `seq` was laid only in a run that waits for its tick (a press pending when the start is heard); a start heard with
  no press pending ran S+1..S+n under the dance at once, and a stop heard then, or later, naming S+m below n stopped the
  dance now, leaving S+m+1..S+n run under it on the page -- a swap on S+j (m < j <= n) the run had undone, the room took.
  Now `WalkMode.stopVictoryMotionAfter(seq)` with no run waiting, `seq` below the last command sent and the dance playing
  on the mover kept after `seq`, runs again (`rerunFrom`, the run PAR-37's `replayVictory` now shares): the mover laid
  back to the state kept after S+m (the first run's), the room's stop laid there (`stopped`, heard once), then S+m+1 to
  the last command sent through `MoverSim.apply` with no dance; the net client's predictions after S+m are the run's
  (`NetClient.replayed(S+m)`, through the `replayed` the dance's start handed the walk -- `net/client.ts` unchanged).
  A stop naming S itself (m = 0; `room.ts` `stopVictory` sends `p.sim.seq`, the start's own expression, so any stop
  before the room runs S+1 -- a flinch, the round's end, the up-link's backlog -- names S) finds the state kept after S
  as it was before the dance (the run re-lays only S+1..): the run lays the dance there as the room did
  (`setVictoryMotion`, with its start's own effects) and stops it at once, so `stopped` is heard once, as on the room,
  then runs S+1.. with no dance (the review of `967dcada0`, its one blocker).
  The same covers a stop below the last command when the page's own ticks went on under the dance (the answer within a
  tick, or ticks since the run). Each kept command now says whether the dance played after it (`dancing`), laid again
  when the dance comes on or off between ticks (`keepDance`: a start heard on the fallback, a reload's stop at a tick's
  end), so the stop finds the state the room's stop after that command found. The kit: a weapon the second run takes
  back is told once as `SwapProgress.redone` (`mover.ts`, beside `undone`), and `Kit.frame` takes the swap it last undid
  again (`Kit.redo`: the state it began from, `select`'s start through `begin`, then the walker's swap clip, or the end at
  the next frame once the clip is over); a redo while the undo is still untold (the start and the stop in one batch)
  cancels it, and nothing is told. And the run's look steps are recorded with the facing each steps from (the mover's,
  which `MoverSim.prepare` steps the gate from), as the walk's own ticks record theirs (PTT-8's `ref`): PAR-37's run left
  it out, so `LookLog.after` found no facing inside a run and the second run could not start (found by this row's RED).
  Held by `victoryReplay.test.ts`'s "PAR-51" cases (the up-link behind; the swap on S+5, the room's stop at S+2 heard
  after the immediate run; the swap on S+3 and the stop naming S; the live ticks under the dance past the stop at S+3;
  again with the start and the stop in one batch), a facing correction through the run's look steps against live ticks,
  and two kit cases (a redo, and a redo with nothing undone). Falls back to the old behaviour (the dance stops now, S+m+1.. stay run under it) when the kept
  records do not reach back to S+m: pruned past `KEPT_COMMANDS`, a new mover or numbering (`forgetKept`), or a blast's
  knock laid after S+m (`WalkMode`'s `knockedAfter`). A port invariant, as §9.1's: the original runs one machine and has
  no `seq`.
- **Not built by PAR-51, named.** The second run's ends repeat the first's as the PAR-37 bullet above says (an end both
  runs make after S+m is heard twice, and a dance the page ended itself after S+m -- `cut`, `complete`, or `replaced` by a
  hold in S+1.. on the first run -- is heard ended again, `stopped`; at m = 0 a start-time `replaced` likewise, reachable
  only if page and room already disagree at S, since the room starts a dance only on a body not holding,
  `victoryStatus`). *(PAR-51's re-review, finding 1:)* every `stopVictoryMotionAfter` clears the dance as heard
  (`danceHeard`), the page's own reload stop included (`VictoryPage.reloaded`, on each reload start): a room stop naming S
  heard after the player reloaded within the window falls back silently (the m = 0 path finds no dance heard), the
  blocker's split in a narrower window -- kept named, not built (the fix: keep `danceHeard` until the room's own stop). The kit's redo does not tell `started` again (`matchFirearm.ts`: `fire.release`, `switchZoom`,
  `stillReload.end`), as its undo does not take it back. The moves' own state is not kept for S+m either, as the PAR-37
  bullet "The moves' own state is not kept" above says: a move under way is reset before the second run, and the lean,
  the peek and `actionPressed` changed since S+m are not rewound (the run lays each command's lean again).
- The net client's predictions after S are taken out of the comparison when the run starts to wait; if the tick then
  cannot run it (a knock in the same batch, `WalkMode`'s `knockedAfter`), they stay out, and the snapshots past them
  compare again (review of `4c1d95f76`, finding 2).
- While the run waits, the page's mover has no dance, so `WalkMode.fireAllowed` does not refuse a round by its `NoFire`.
  The page's frame runs the walk before the firearm (`main.ts` `walk.frame` before `firearm.fireFrame`; `matchMount.ts`
  the same) and the socket's events land between frames, so the gap is a frame that runs no tick of its own (a display
  faster than 60 Hz, or frame-time jitter on a 60 Hz one: `Walker.advance` builds up real dt, `mover.ts:2186-2195`). Not closed: whether the room's dance still refuses then (a stick in S+1.. may have cut it) is only
  known once the run has run (review of `4c1d95f76`, finding 3).

Tests (`packages/viewer/test/effectiveAction.test.ts`, "PARITY-1 close"): (a) the owner and its family; (b) the stance
press waits and is taken at the dance's end; (c) the swap refused, the full press at a run's speed dives out of the
dance (`replaced`), a still one does not dive; (d) the jump refused and taken once the dance ended; (e) every end with
its reason, and the page's stop through `WalkMode`; (f) the start ends a jump under way as `replaced` and the dance
plays, while a hold under way (a throw, a still reload) keeps playing and the dance ends at once, `replaced`; (g) a
stance transition under way is undone (each transition and its reversal, a refused press kept, a press back leaving
nothing pending), and the dance's end takes the request with its clip. Chris's
tests (`victory`, `victoryArrangement`, `victoryDisc`, `victoryNet`) are unchanged and green; the server's `victory`
gains one case (pass 4): a later command's hold bit during the dance, on the room -- the room's mover ends the dance
with `['victory', 'replaced']` heard, the hold plays, and the room's stop goes out to every page; and one in pass 5,
(g)'s pair: a later command's stance press during the dance waits as the request on the room's mover, the stance
unchanged, and is taken with `Stand -> Crouch` on the command after the room's stop.

## 10. The swap's hand-off in the original's phase units (D05; PARITY-2, PAR-32, 2026-10-11)

Research 230 §1.3 item 4 found that the port compared the swap's hand-off against the clip's normalised duration
(`t / seconds`). The original compares it against the play's phase. This section reads the three cases together
(forward, reversed, the moving overlay), as §6 asked, and builds them. Status: **reading, pending review.** No game,
capture or browser was run, and the tests are port contracts against this transcription. `D:L` is the bytes the header
pins.

### 10.1 The clock

- **e.** `FUN_0028ada0` (D:L133349-133366) is `(n - 1) / n` for a one-shot (the motion's looped bit, `+0x49` bit 6,
  clear) and 1 for a looped motion or `n < 2`.
- **A one-shot on the stack.** `FUN_0028dc90` pushes the play (D:L135117-135225), and its `FUN_0028cc10` sets the end
  cap `+0xc` to e (D:L134494). Forward, it sets the phase `+0x1c` to 0 and the node speed `+0x24` to 1
  (D:L134500-134505). The callback slots `+0x60` / `+100` / `+0x68` are cleared at the push (D:L135200-135202).
- **The advance.** `FUN_0028c4f0` (D:L134225-134278) adds `dt · speed / (P · e)` per frame (D:L134252; `P` is the
  motion's playback `+0x10`), clamps a one-shot to `[0, e]` (D:L134261-134265), and stores the phase when asked
  (D:L134273-134275). So the phase is `t / (P · e)` forward and stops at e after `P · e²` seconds (`oneShotSeconds`). It
  is the key fraction: key `phase · n`, the last key at e.
- **The first update after a push does not advance.** `FUN_0028dc90` sets the play's `+0x28` flag 0x8 on a one-shot
  (D:L135211-135212). `FUN_0028c4f0` then clears that bit in place of advancing (D:L134241, D:L134257). The port's
  one-shot clock advances on its first tick (§10.5).
- **Reversed.** `FUN_00588bc0` calls `FUN_0028c160` when its 4th argument is set (D:L446300-446301). `FUN_0028c160`
  (D:L134080-134101) sets the reverse bit `+0x28` 0x20 (D:L134092), negates the node speed (D:L134096) and, on a
  one-shot, starts the phase at the cap e (D:L134099). A reversed clip's phase is therefore `e - t / (P · e)`, from e
  down to 0 over the same `P · e²` seconds.
- **The moving overlay** (the second channel, `actor+0x1e4`; research 150 §3.4). `FUN_0028d170` (D:L134684-134767) adds
  or subtracts dt to its clock `+0x1ec` by the direction `+0x1f0` (D:L134692-134701), sets the node's key phase `+0x14`
  to `t / P` (`FUN_0028d670` D:L134881-134903, the store D:L134891; called at D:L134734 / D:L134763), and frees the node
  when `t / (P · e)` reaches 1 forward or 0 reversed. Kind 6 (`+0xf79` 1, rifle to pistol) starts at `t = 0` and kind 5
  (`+0xf79` 2) at `t = P · e` (`FUN_00587780` D:L445372-445401; `FUN_00587670` D:L445253-445271, `FUN_005876b0`
  D:L445276-445300). `FUN_0057a010` sets the direction when the overlay starts: forward for kind 6
  (`FUN_0028d3f0(…, 0)`, D:L438607) and backwards for kind 5 (D:L438618; `FUN_0028d3f0` D:L134770-134795: 1 or -1). The
  key phase `u = t / P` runs from 0 to e forward and from e to 0 backwards over `P · e` seconds.

### 10.2 What the callbacks compare

- **The stack's callback.** `FUN_0057a330` keeps the top's phase before the frame's advance (D:L438871), advances it
  (D:L438901), and calls `FUN_0028c7c0(+0x60, before, after, play)` (D:L438995-438997). It runs the callback `+100` once
  and clears it (D:L438998-439003). `FUN_0028c7c0` (D:L134313-134374) is a **crossing test** in the phase's own units.
  Before and after equal: no (D:L134321-134323). On a one-shot it reads the direction from the play's reverse bit 0x20
  (D:L134325-134327). Forward, it answers when `before <= x <= after`; reversed, when `after <= x <= before`
  (D:L134337-134351), with no frame-ahead term. So **forward the hand-off is the first frame with `phase >= h`, and
  reversed it is the first with `phase <= h`, against the same h.** It is not `1 - h` and not `e - h`.
- **The swap actions' h** (`FUN_00588bc0`, D:L446308-446396): action 0x35 (standing) 0.72 (`0x3f3851ec`,
  D:L446391/446396), 0x36 (crouched) 0.82 (`0x3f51eb85`, D:L446380/446385), 0x37 (prone) 0.62 (`0x3f1eb852`,
  D:L446369/446374). Each direction gets the same value: `FUN_005a7730` (the pistol to the hand) when the 4th argument
  is 0, `FUN_005a75d0` (the holster) when it is 1. `FUN_005a64c0` passes 1 for the rifle (D:L461974/461979/461988;
  research 211 §1).
- **The overlay's callback.** `FUN_0057a010` arms 0.79 (`0x3f4a3d71`) at `+0x1f4`, with `FUN_005a7730` for kind 6 and
  `FUN_005a75d0` for kind 5 (D:L438603-438624). `FUN_0057a330` runs the overlay's clock first (`FUN_00579ef0`,
  D:L438707) and the check after the stack's (`FUN_0028d020(dt, actor+0x1e4, actor)`, D:L439010; D:L134631-134645). The
  check `FUN_0028d0a0` (D:L134651-134676) is **one frame ahead**. It takes `s = dt / (P · e)`; forward it answers when
  `u + s >= h`, backwards when `u - s <= h`, with `u` the node's key phase `t / P`. Its `dt` is the actor's `+0x2e0`,
  which `FUN_00551ec0` stores from its argument (D:L418488): the game frame, `GAME_FRAME_DT` = 525/15734 s (research 180
  §0, 208; research 215 §7.1 reads `+0x2e0` the same way).
- **The standing swap's cut** (`FUN_00550ef0` D:L418227-418250) keeps the stack's phase (`unaff_f20`, D:L418187). It
  plays the overlay as kind 6 forward or kind 5 reversed by the reverse bit (D:L418189, D:L418228; `FUN_00587670`
  D:L418233, `FUN_005876b0` D:L418244) and sets its clock to `phase · P_ov · e_ov` (D:L418236 / D:L418247). The
  overlay's callback is armed afresh at 0.79 when it starts. The stack's 0.72 goes with the cut entry.

### 10.3 The clip facts (the disc through the repository's readers)

`motion.rdr` (`RUN/READERC.ZAR`, `motionTableFromArchive`: `playback`, `looped` 0) and `MOTION_P.ZAR` (`clipsFromPack`:
the key count) give the following. All are in `test/golden/movement-clips.json` (`actions.swapStand` / `swapCrouch` /
`swapProne`, `swapOverlay`), which `movementTables.parity.test.ts` checks whole against both files ("movement-clips.json
is motion.rdr and MOTION_P.ZAR ...") and against `ACTION_CLIPS` / `SWAP_OVERLAY`.

| clip | keys n | P s | e | `P·e` s | hand-off h | forward source t | reversed source t |
|---|---:|---:|---:|---:|---:|---:|---:|
| `seal_rifle2pistol` (0x35) | 32 | 1.32 | 31/32 | 1.278750 | 0.72 | `h·P·e` = 0.920700 | `(e - h)·P·e` = 0.318089 |
| `seal_crouch_rifle2pistol` (0x36) | 23 | 1 | 22/23 | 0.956522 | 0.82 | 0.784348 | 0.130586 |
| `seal_prone_rifle2pistol` (0x37) | 38 | 1.8 | 37/38 | 1.752632 | 0.62 | 1.086632 | 0.619878 |
| `seal_mv_rifle2pistol` (overlay) | 21 | 1.32 | 20/21 | 1.257143 | 0.79 | `h·P - G/e` = 1.007764 | `P·e - h·P - G/e` = 0.179307 |

(`G` = `GAME_FRAME_DT`.) On the port's 60 Hz tick the hand-off is the first tick at or past the source's time:

| clip | forward: source / port before | reversed: source / port before |
|---|---|---|
| standing | tick 56 / 54 | tick 20 / 21 |
| crouched | 48 / 46 | 8 / 10 |
| prone | 66 / 64 | 38 / 39 |
| overlay | 61 / 60 | 11 / 16 |

The forward three are research 230's 56 / 48 / 66. The port's earlier forward phases at the hand-off, 0.703812 /
0.801515 / 0.608609, are research 230's too.

### 10.4 What is built

- `kit.ts` `handOffOf(pick)` now takes the swap's direction (`to`) and returns the source's hand-off **on the clock the
  kit already runs**: `progress`, 0..1 of the clip's seconds from the swap's start (`Walker.swapProgress`, the no-host
  count `elapsed / pick.seconds`, and the remote's snapshot clock alike). `handedAt` is unchanged (forward
  `progress >= H`, reversed `1 - progress <= H`).
  - On the full-body clip, phase = `progress · e` forward and `e · (1 - progress)` reversed, so `H = h / e` both ways.
  - On the overlay, `u = progress · e` forward and `e · (1 - progress)` reversed. The frame-ahead term gives
    `H = (h - s) / e` forward and `(h + s) / e` reversed, with `s = GAME_FRAME_DT / (P · e)`.
  - The clip facts are `ACTION_CLIPS` and `SWAP_OVERLAY` (pinned above). `HAND_OFF_READING` keeps its values and
    meaning, the code's phase constants.
- `Walker.swapProgress` is unchanged. **The room is unchanged**: it reads only `swapProgress() !== null`
  (`packages/match/src/room.ts` L2333, L2358, L4189), the clip's life, which this row does not move.
- `remotePlayers.ts` is not edited. Its `remoteKitOf` calls `handedAt(swap.to, swap.progress, handOffOf(swap))`, and
  `swap` carries `to`, so the other player's drawn hand-off follows the same rule as the local kit's. That is its stated
  contract ("as the local `Kit` hangs them on the same clip and progress"), held by `remoteKit.test.ts`.
- Tests: `test/parity/actionStack.test.ts` (the three forward probes are ordinary now; the reversed three and the
  overlay's two directions are new, each against the tick the reading gives, with a forward/reversed control on each
  clip), and `test/kit.test.ts` (the no-host count's boundaries in the same units).

### 10.5 Owed (read here, not changed by this row)

- **The cut's carry-over** (`mover.ts`, the `swapStand` cut in `step60`). The port sets the overlay's clock to
  `(t / (P·e²)) · P_ov·e_ov`, the normalised duration. The source sets it to `phase · P_ov·e_ov` forward (D:L418236).
  Reversed, the source's clock counts down from `phase · P_ov·e_ov`, with phase `e - t/(P·e)` (D:L418247), where the
  port keeps the elapsed fraction. Fixing it moves the overlay's end, and the room's swap life is that end
  (`swapProgress() !== null`, `room.ts` L2333 / L2358 / L4189), so the change reaches the room: it is not this row's
  (the brief's step 4). `actionStack.test.ts` pins it as an expected failure with this cause.
- **The one-shot's first update** (flag 0x8, §10.1). In the source a pushed one-shot's phase holds for its first frame. The
  port's action clock runs from its first tick, so every one-shot on the port runs one game frame ahead of the source's
  push frame. That is a whole-clock question for every action (and the room's), not the swap's; owed to a capture of a
  swap's hand-off frame (research 230 §7).
- **The moving swap's start window.** `FUN_00587780` gives kinds 5 and 6 a start phase `+0x1e8` of -4.0 (at once) only
  when `actor+0x105e` bit 0x20 is set, and 0.0 otherwise (D:L445373-445399). `FUN_0057a010` starts the overlay only when
  `FUN_0028d450` finds that phase crossed by the top's phase this frame (D:L438576; D:L134800-134829), so with 0.0 the
  overlay waits for the locomotion cycle's wrap. The port starts it at once. What sets bit 0x20 is not read here.
- **The game frame and the 60 Hz tick.** The source's crossings fall on 30 Hz frames. The port takes the first 60 Hz
  tick at or past the source's time (PF.R8). Neither difference is this row's.

## 11. A kit hold asked over a running one (PARITY-2, PAR-29, 2026-10-11)

§6's owed item: `Walker.hold` ended a running hold `replaced` and started the new clip from its first key, with no
source. This section reads the original's answer, per kit item that has a hold, and builds it. Status: **reading,
pending review.** Source inspection of the decompilation only (the bytes the header pins; Grep and offset reads); no
disc, game, capture or browser was run. Action types are named by their table's initialiser (`DAT_003dXXXX =
FUN_005e4f90(<string address>)`, D:L495207-495350) and the string at that address in the ELF's strings
(`socom2_game.elf.strings.txt`), as research 214 names `DAT_003deb48`.

### 11.1 The chain a second ask goes through

- **The kit's fire gate.** Every kit item's fire reaches `FUN_005be9a0` only through `FUN_005a7de0`: from the trigger
  path (`FUN_005c0fd0` D:L476565-476569 asks `FUN_005c1970`, then `FUN_005c0ae0`, whose `FUN_005a7de0(actor, 1, test)`
  is D:L476442; the fire at D:L476638) and from the action path (`FUN_005c0020` D:L475987-475994, `FUN_005a7de0(actor,
  0, 0)`, the bomb's `+0x81c` beside it at D:L475988). The phase test is 0 for the grenade and C4 classes
  (D:L476375-476379), so the clip's `NoFire` is not asked (D:L462695-462696), but the stack's top is. `FUN_005a7de0`
  refuses (D:L462609-462738):
  - when the top play's action is a throw (D:L462620-462634): `Throw grenade` (`DAT_003debc8`, 0x660778, D:L495232),
    `Crouch throw grenade` (`DAT_003debb8`, 0x6617c0, D:L495230), `Prone throw grenade` (`DAT_003deba8`, 0x661780,
    D:L495228), `Toss grenade` (`DAT_003debe8`, 0x660788, D:L495236), `Pistol toss grenade` (`DAT_003debf0`, 0x660ef0,
    D:L495237), `Prone toss grenade` (`DAT_003debd8`, 0x661800, D:L495234), `Pistol prone toss grenade`
    (`DAT_003debe0`, 0x661820, D:L495235), `Peek right toss` (`DAT_003deb20`, 0x6615c0, D:L495211) and `Peek left toss`
    (`DAT_003deb30`, 0x6615e8, D:L495213). **Not in the list:** `Pistol throw grenade` (`DAT_003debd0`, 0x660ed0,
    D:L495233), `Pistol crouch throw grenade` (`DAT_003debc0`, 0x6617e0, D:L495231), `Pistol prone throw grenade`
    (`DAT_003debb0`, 0x6617a0, D:L495229), `Pistol peek right toss` (`DAT_003deb28`, 0x6615d0, D:L495212) and `Pistol
    peek left toss` (`DAT_003deb38`, 0x661600, D:L495214);
  - when `FUN_005a7ab0` answers (D:L462636): the top is a reload type -- `Rifle crouch reload` (`DAT_003deb80`, 0x6616e0,
    D:L495223), `Pistol crouch reload` (`DAT_003deb78`, D:L495222), `Rifle prone reload` (`DAT_003deb90`, D:L495225),
    `Pistol prone reload` (`DAT_003deb88`, D:L495224), the standing ones and the after-shot types -- or a reload type
    lies in the stack, or the second channel plays the moving reload (D:L462526-462559);
  - on the swap (`FUN_005a7980`, D:L462638), and on CQB, stab and restraint tops and a few states (D:L462640-462686)
    that are no kit hold.

  Its type lists answer yes over `Place claymore` (`DAT_003deb48`, D:L495216) and C4's `Put on wall` (action 0x3e, D:L475420) -- the gate's other tests (the `0x1060` bits, `+0x2b == 8`, `FUN_00587f90`, actor `+0x1e4` / `+0xeac`; D:L462613-462616, D:L462679-462685) still apply:
  neither is in it.
- **The reload's gates.** The reload press arms the kit's timer only while `FUN_005a7ab0` is clear (D:L453460-453464),
  and the timer's run-out pushes the clip only through `FUN_005c2a90`, which refuses while `FUN_005a7d10(actor, 0)`
  (the same throw list with both peek tosses, D:L462570-462589) or `FUN_005a7ab0` answers (D:L477394-477402).
- **The action start.** The claymore's place (and the bomb's plant, which plays the same action, D:L475481) and C4's
  start through `FUN_0057d540` (D:L475322, D:L475354, D:L475371, D:L475420). It pushes only when the current action is
  not already the one asked (D:L440344-440346); when it is, it returns the top and pushes nothing (D:L440348-440350).
  `FUN_00577e40` (D:L437398-437412) counts the pistol's kin of the type as the same action.
- **The push.** `FUN_00588bc0` (D:L446055-446420) asks `FUN_00589900` first (D:L446072): it refuses a push over a top
  whose `+0x2b` is 8 (D:L446453) or under a reaction flag (D:L446441-446451). A kit push stores 0 there (the third
  argument, D:L475322, D:L475420) or the stance word (the throw, `FUN_005802b0` D:L441900), so a kit top does not meet
  it. The push then pops the stack only for the stance, landing and climb types (D:L446105-446291), none of them a kit
  item's, and `FUN_0028dc90` links a new play over the old one (D:L135150-135214): the covered play keeps its phase and
  resumes when the new one pops (research 230 §3.3, the review's re-read).
- **A still reload clears the stack first.** `FUN_005a82e0` pops the stack to one play (`FUN_0058a4d0`,
  D:L462925-462926; its loop D:L446762-446768) before it pushes a still reload's clip (D:L462928).

### 11.2 The answer, per running hold

| running hold (the port's clip) | asked over it | the original | the port |
|---|---|---|---|
| a still reload (`seal_crouch_reload`, `seal_p_crouch_reload`, `seal_prone_reload`, `seal_p_prone_reload`; an after-shot's too) | anything | **refused**: a throw or a placing at `FUN_005a7de0` (`FUN_005a7ab0`, D:L462636); a reload at the press (D:L453461) and at the push (D:L477398). The running reload plays on | refused |
| a rifle hand's throw, toss or peek toss, the pistol's toss (`seal_throwgrenade`, `seal_tossgrenade`, `seal_crouch_throwgrenade`, `seal_prone_throwgrenade`, `seal_prone_tossgrenade`, `seal_toss_rlean`, `seal_toss_llean`, `seal_p_tossgrenade`) | anything | **refused**: a throw or a placing at `FUN_005a7de0` (D:L462620-462634); a reload at `FUN_005c2a90` (`FUN_005a7d10`, D:L477397). The running throw plays on | refused |
| the pistol hand's throws (`Pistol throw grenade`, its crouched and prone kin, its peek tosses: the same port clips) | a throw | not refused by the type lists; if the kit asks again, `FUN_005802b0` pushes over it (stacked) | refused, `HOLD_OVER_THROW_HAND_READING` |
| a placing (`seal_place_claymore`: the claymore's and the bomb's; `seal_put_onwall`, `seal_p_put_onwall`: C4's) | the same placing | **refused** at the body: `FUN_0057d540` pushes nothing (D:L440344-440350), the running clip plays on (the kit re-arms its own timer, D:L475323-475328: the kit's, §11.4) | refused |
| a placing | the other placing, a throw | **stacked**: pushed over the placing (D:L446292), which resumes after it | replaced, `HOLD_OVER_PLACE_READING` |
| a placing | a still reload | **replaced**: the stack cleared and the reload pushed (D:L462925-462928), only when the reload is still and its stance matches (`cVar1 == cVar7`, D:L462925); whether a reload press is reachable while a placing runs (the claymore in hand) is unread, and a reload asked in another stance has no source for the port's `replaced` | replaced (a reading) |

So the original never restarts a running hold's clip: the same item again is refused (the reload, the throw) or leaves
the clip running (the placing). The port's `replaced` over a reload or a throw had no source.

### 11.3 What is built

- `mover.ts` `holdOverHold(running, asked)` answers `refused` or `replaced` by §11.2's table, and `Walker.hold` refuses
  (returns false, nothing ended, `holdStarts` not counted) when it answers `refused`. The page's `WalkMode.hold` and the
  room's `MoverSim.apply` (`holdOf(b)` -> `w.hold`) both call it, so the page and the room keep one rule: the page sends
  no hold bit for a refused hold (`pressedHold` is set only on a hold taken), and the room's mover refuses a hold bit
  sent over a running hold.
- Tests: `test/parity/actionStack.test.ts` ("research 251 §11"), each row of §11.2; `test/effectiveAction.test.ts`'s
  still-reload case (a hold over a still reload is refused and ends nothing; leaving the floor still ends it
  `replaced`); `packages/central/test/roomHoldOverHold.test.ts`, the room's mover through hold bits on commands, beside a
  page's mover given the same holds.
- `roomFuzz.test.ts`'s mask (a hold bit only on a body nothing owns) stays, its reason restated: the room no longer
  restarts a running hold, but about a quarter of the drawn commands carry a hold bit, so a new hold would start within
  a few ticks of each one's end and the body would still be owned nearly every tick.

### 11.4 Not built, owed

- **The stack.** The port's mover has one hold slot: the other placing or a throw over a placing replaces it
  (`HOLD_OVER_PLACE_READING`), where the original covers it and resumes it. Whether a page can ask it at all is open:
  the hand must change to the other item during the placing (the shoulder press, `FUN_005a8cb0` ->
  `FUN_005a7de0(actor, 1, 1)`, D:L463159, with the clip's `NoFire` phase test, D:L462700-462706, not read for the
  place clips).
- **The kit's timer on a placing asked again.** `FUN_005be9a0` re-arms the claymore's 1.3 s (`+0x87c`) and counts
  `+0x818` whether or not `FUN_0057d540` pushed (D:L475322-475328); C4's re-arms its timer and the play's 0.45
  callback (D:L475441-475452). The page's kit (`grenade.ts` `startPlacing`, refused while placing) does not. Whether
  the original's trigger path reaches a second fire during a placing (`FUN_005c0ae0`'s `+0x818` against
  `FUN_005c0940`, D:L476439, reset only with the trigger's state 0 or 3, D:L476381-476382 and D:L476399-476400) is not
  read whole. It is the kit's, not the mover's (`grenade.ts` is outside this row, PTW.R6).

## 12. A reload's lock ends where the original pops its clip (PARITY-2, PAR-28 with PAR-47, 2026-10-12)

§6 owed four ends of a reload's lock, each with its room and its page: the knock during a moving reload or an
after-shot (the wave-4 review's F1/F2), the climb's and the ladder's start (PAR-47, F3's read), the knock during a
standing still reload, and a crouched or prone reload's airborne or replacement end. This section reads each and says
what is built. Status: **reading, pending review.** Source inspection of the decompilation only (the bytes the header
pins); no game, capture or browser was run. The tests are port contracts (the room's mover and the page's `Fire` and
`StillReloadLife` on one command clock, and the real `WalkMode` with the one firearm), not a measurement of the
original.

The one rule all four ends turn on: `FUN_005a7ab0` (D:L462512-462560) -- the lock -- answers yes while the kit's timer
runs (`FUN_005c2400`, `kit+0x820 > 0`, D:L462522, D:L477159), else while the stack's top is a reload or after-shot type
(D:L462526-462531) or such a type lies anywhere in the stack (`FUN_0058a470`, D:L462532-462544; its walk over the
stack's entries, D:L446733-446747), else while the second channel plays the moving reload (`actor+0x1e4`'s `+0x22`
against `DAT_003deb70` / `DAT_003deb68`, D:L462548-462558). The kit's timer is 0 from the clip's push on
(`FUN_005c0fd0` runs it out into `FUN_005c2a90` / `FUN_005c3000` and zeroes it, D:L476550-476560). So once a clip is
under way, the lock is the clip: on the stack or on the second channel. The magazine was selected at the clip's start
(`FUN_005c2a90` D:L477479-477483): no end takes it back.

### 12.1 The knock (ends 1 and 3)

- **What the knock does.** `FUN_0057e770`, inside its radius (D:L440981), calls `FUN_005a5da0` (D:L440993) and then
  pops the stack (`FUN_0058a4d0(actor, 0)`, D:L440997), unconditionally, before it chooses the fall or `Prone cover`
  (D:L440999-441078; the prone branch pops again, D:L441004).
- **The second channel.** `FUN_005a5da0`, with no swap clip on the stack (its gate: 0x35-0x37, `DAT_003df0e0`,
  `DAT_003df0e8`, D:L461662-461667), stops whatever the second channel plays and clears it (`FUN_0028d7f0`, `+0x1e4 =
  0`, D:L461713-461714, within D:L461668-461721): the moving reload's overlay, and a standing still reload's overlay
  carried on after its cut (`FUN_00550ef0` D:L418202-418214), are gone.
- **The stack.** `FUN_0058a4d0` pops while the top is not a base kind -- `Stand` (1), `Crouch` (0x12), `Prone` (0x1a),
  D:L446762-446768 -- so every reload and after-shot clip above the base goes: a crouched or prone still reload's, a
  standing still reload's (`seal_reload` on the stack, D02), an after-shot's (`FUN_005a82e0`, D:L462925-462928, pops to
  the base before it pushes any still clip, so the clip sits over the base kind).
- **The kit.** Nothing on the knock's path touches it -- `FUN_0057e770` (D:L440958-441078) and its two helpers
  `FUN_0057ee00` (D:L441131-441185) and `FUN_0059d750` (D:L457315-457333) were read for `actor+0x5e0` / `kit+0x820`:
  none -- **with one exception**: a knock on a body holding an emplacement (`+0xeb8`) calls `FUN_00545ee0`
  (D:L440994-440996), the turret's release, which touches the kit (D:L412002-412006: `FUN_005c3c10`, `FUN_005c4b10`,
  `FUN_005b9bb0`; research 215 §8). Unreachable for a reload today (the room releases the turret before `applyKnock`, and
  no reload runs on a turret) -- the review's finding 1. A reload's delay or a bolt's or pump's lock still running before its clip is left, and `FUN_005a7ab0` answers on
  it.
- **So** after a knock the lock of any reload's or after-shot's clip under way ends -- still crouched or prone (PAR-19
  D04 already), still standing (end 3), moving or carried (end 1), an after-shot's (end 1) -- and a lock still on the
  kit's timer is kept.
- **Built.** The room: `layKnock` calls `endStillReload(q, true)` on every knock laid (the hold test it had is gone);
  `endStillReload` ends the hand's lock at `ran` when a clip is under way (`lockKind` set, `ran < reloadUntil`, and not
  before `lockTimer`, the timer's end), with its `reloadLife`. The page: `WalkMode.knock` tells `onStackPop('knock')`,
  and `./matchFirearm` hands it to `reloadPopped`, which asks `Fire.popClip('knock')` -- the reload's or after-shot's
  clip under way ends with one `reloadEnd` (`knock`), the timers (`reloadPending`, `afterShotPending`) left -- and ends
  the `StillReloadLife` with it. `Fire.cancelReload('knock')` (the still hold's `reloadEndOfBody` path) is the same
  `popClip`; the flinch's and the death's ends are unchanged (§6).
- **Tests.** `roomReloadLock.test.ts`: "PAR-28 end 1" (a moving reload; a pump's after-shot clip; the control, a knock
  in the after-shot's timer) and "PAR-28 end 3" (a standing still reload), each the room and the page's twin on the
  knock's command; the PAR-19 D04 crouched case unchanged. `effectiveAction.test.ts`: a bolt's after-shot ends on the
  knock (the old pin flipped). `stillReloadLife.test.ts`: the real `WalkMode` with the firearm, a standing still and a
  moving reload ended by `walk.knock`.

### 12.2 The climb's and the ladder's start (end 2, PAR-47)

- **What pops.** §6's PAR-47 read (a): the climb's start (`FUN_005b2620` -> `FUN_00580b70`, D:L468435, D:L468489,
  D:L468500; `FUN_00580a80` for class 5, D:L468485) and the ladder's two mounts (`FUN_0057f880`, `FUN_0057f690`, from
  `FUN_005b1c80` D:L468189, D:L468218). `FUN_00580b70` pops to index 0 in state 0 and to index 1 otherwise
  (D:L442186-442214); `FUN_00580a80` (D:L442147-442163) and the mounts (D:L441466-441477, D:L441547-441558) to index 0.
- **Whether a crouched still clip sits at index 1** (§6's open point). It does not: the crouch and prone kinds are
  pushed after a pop to index 0 (`FUN_00588bc0` for 0x12, 0x1a, D:L446105-446118), so the base kind is at index 1, and
  a still clip over it (`FUN_005a82e0` pops to the base kind first, D:L462925-462926) at index 2 or above: the pop to
  index 1 takes it.
- **The second channel is left.** None of the six (`FUN_005b2620` D:L468292-468514, `FUN_005b1c80`
  D:L467953-468285, `FUN_00580b70` D:L442174-442301, `FUN_00580a80` D:L442140-442169, `FUN_0057f880`
  D:L441535-441573, `FUN_0057f690` D:L441454-441492) calls `FUN_005a5da0` or writes `actor+0x1e4`: a moving reload and
  a carried overlay keep their lock. So the pop ends only a clip still on the stack -- the room's `reloadLife`, the
  page's `StillReloadLife` -- and its lock with it (PAR-47's read (b)).
- **The order within a frame.** The climb is started from the contact's call in `FUN_00550ef0` (D:L418131-418132,
  `FUN_005b4b40` -> `FUN_005b2620`), before the stick's cut (D:L418174-418190): on the command that both starts a move
  and pushes the stick, the pop finds the clip, and the cut finds none. The room runs the move inside the command
  (`MoverSim.apply`) and the cut after it (`watchCut`): the same order. The ladder's mount by walking into the rungs
  is the port's `Traversal.touchLadder` in the move's tick, before the walker's own step; which of the original's calls
  starts it in that frame (`FUN_005b1c80` from the request `+0x1331`, D:L468088) is not traced beyond §6's read.
- **Built.** The room: `watchMoves(p)`, for each new mover (`seat`, `spawn`), hears the traversal's `climbStart` and
  `ladderMount` and calls `endStillReload(p, false)`, which ends the lock at `ran` only while the still clip lives
  (`reloadLife` set and begun). The page: `WalkMode` hears the same two events on its moves (`attachMoves`) and tells
  `onStackPop('climb' | 'ladder')` with the command whose tick laid them; `reloadPopped` asks `StillReloadLife.lives`
  and, when it lives, ends it and asks `Fire.popClip('cancelled')` -- the accepted end, the magazine kept.
- **Tests.** `roomStillReloadJump.test.ts`: "PAR-28 end 2 (PAR-47)", a climb's start (the `it.fails` "OWED: the still
  clip's life ends at the climb's start" turned ordinary) and a ladder's mount from its foot, each the room and the
  page's twin on the same command; F3's pin changes with it (the life ended at the climb's start; the hang still lets go
  on the jump, the `!busy()` clause). `stillReloadLife.test.ts`: the real `WalkMode` with the firearm, a climb's start
  (a fake traversal laying `climbStart`) ending a standing still reload, the next jump the walk's own.

### 12.3 Off the floor, or a hold over it (end 4)

- **A hold over the reload's clip** is refused since PAR-29 (§11.2: `FUN_005a7de0`'s `FUN_005a7ab0` test,
  D:L462636; the reload's own gates, D:L453461, D:L477398), in the room and on the page: nothing is replaced, the lock
  runs on. No change.
- **Off the floor: the fall covers the clip.** `FUN_005af930`'s airborne branch, in a stand, crouch or prone state,
  pushes `Jump fall` through `FUN_0057e130` -> `FUN_0057e050` (D:L466957-466971, research 80 §6b; action 9, `FUN_00588bc0(actor, 9,
  state, 0, 0xd)`, D:L440726). `FUN_0057e130` asks only `FUN_00589900` (D:L440760-440761), which the still clip's entry
  passes (its `+0x2b` is the stance word, `FUN_005a82e0`'s push D:L462928, never 8; D:L446453). `FUN_00588bc0` pops the
  stack only for the stance, landing, climb and reaction kinds (D:L446105-446291) -- `Jump fall` (action 9 through
  `FUN_0058c960`'s set, D:L448200-448229) is none of them -- and links the fall over the top (`FUN_0028dc90`,
  D:L446292). The reload's clip stays in the stack, covered, and `FUN_005a7ab0` finds it (D:L462532-462544): **the lock
  holds in the air.**
- **The landing pops it.** `FUN_005af590` (D:L466645-466726) picks the landing's clip -- `Jump land hard`, a hit, or
  `Land forward` over 115 (D:L466661-466676); `Jump land` at rest or under 20 a second (D:L466677-466682) -- and, not
  attached (`actor+0xeac`), pops the stack to its base (`FUN_0058a4d0`, D:L466692) before it pushes it (D:L466693): the
  covered clip goes, and `FUN_005a7ab0` answers no. **The lock ends at a landing that plays a clip.** A landing with no
  clip (moving, the stick pushed: D:L466684-466690) pops nothing there; what then pops the fall, and so whether the
  covered clip is handed back (research 80 reads the launch's: `FUN_00589aa0` pops it and `FUN_0028da00` hands back the
  play under it), is not read here: `CLIPLESS_LANDING_RELOAD_READING` (§7). *(PAR-65, research 230 §5.2.4: read -- the
  landing branch's one pop, D:L466900-466901, takes the fall and hands the covered clip back.)*
- **The covered clip's clock.** A covered play keeps its phase (§11.1, research 230 §3.3), so in the original a flight
  longer than the clip's remaining length holds the lock to the landing; the port's lock and life keep their own clock
  through the flight. Part of the same reading; it is reachable only by a long fall under a still crouched or prone
  clip. *(Read and built for the life, the cut, the uncut end and the mover's hold by PAR-79, below; the port's uncut
  lock stays its own timer.)*
- **What the port's mover does.** Leaving the floor (`Walker.takeOff`, `setAirborne(true)`) ends the hold `replaced`
  (the port has one hold slot, no covered entry). `reloadEndOfBody` maps no `replaced`, so the page's lock runs on, and
  the room's never ended there: both agree with the original in the air. How the port's body leaves the floor under a
  still crouched or prone hold: the clip's own root (`seal_crouch_reload`'s 0.28 / -0.19) off a ledge (`Walker.step`);
  a climb's or a ladder's start is §12.2's pop, on the floor.
- **Built.** The room: in `run`, at a new landing (where `fallDamage` reads it), `landingPops(landing)` -> `endStillReload(p,
  false)`. The page: `WalkMode`'s tick (`tap`, after `StillReloadLife.ran`, the room's order) tells
  `onStackPop('landing')` at a new landing that `landingPops`, and `reloadPopped` ends a living still clip and its lock
  as at a climb's start. `landingPops(landing)` (`./stillReloadLife`): the landing has a clip, or
  `CLIPLESS_LANDING_RELOAD_READING` says `'popped'` (it says `'kept'`).
  *PAR-66 (research 230 §5.2.2; reading, pending review):* the landing's own command asks no cut, with a clip or
  without (`Walker.cutAsked`). Before it, a turn on a clip landing's command cut the covered clip first (`watchCut`,
  `StillReloadLife.ran`), and the lock ran `ceil(left)` commands past the pop. Now the pop ends it on that command.
- **Tests.** `roomReloadLock.test.ts`: "PAR-28 end 4", a crouched still reload taken off the floor -- the lock and the
  life hold through the flight, end at the landing's command (`Jump land`), the page's twin with them.
  `stillReloadLife.test.ts`: `landingPops` and the reading; the real `WalkMode` with the firearm, the crouched reload's
  lock held in the air and ended at the landing; and `WalkMode.onStackPop` heard for each pop at its command.
  `effectiveAction.test.ts`: the hold replaced off the floor still ends no reload at the take-off (its title says why).

#### PAR-79: the covered still clip's clock at a clipless landing -- read and built (PARITY-2, 2026-10-13)

Reads the covered clip's clock above (the "covered clip's clock" bullet and `CLIPLESS_LANDING_RELOAD_READING`'s open
part, §7), which research 230 §5.2.4 read for the flinch (PAR-65, PAR-71) and named for the reload ("found, not built":
"The still reload's cut after a clipless hand-back"). Status: **reading, pending review.** Source inspection of the
decompilation (the bytes the header pins) and of the game ELF's strings (`game/disc/socom2_game.elf`, read-only: the
action-type names `FUN_005e4f90` registers, D:L495203-495414, read at their addresses by a script over the ELF's
program headers); no game, capture or browser was run. The tests are port contracts (the room's mover and the page's
life, pose and `Fire` on one command clock), not a measurement of the original.

- **The cover: the same as the flinch's.** The still clip sits over the stance's base kind (`FUN_005a82e0` pops to it
  first, D:L462925-462926, and pushes through `FUN_00588bc0` D:L462928 -> `FUN_0028dc90` D:L446292). On the first driver
  tick whose body is in the air, `FUN_005af930` (called at D:L418169) finds the actor alive, airborne and unattached and
  the current action (`FUN_00577e40`, `actor+0x534`, D:L437404-437409) none of the set at D:L466816-466828; its airborne
  branch (D:L466956-466975) finds the action neither 9 nor `dive_to_prone` and the state (`+0x174`, the stance 0, 1, 2)
  not 9, 10 or 3 (D:L466959-466960), and pushes `Jump fall` through `FUN_0057e130` -> `FUN_0057e050` (D:L466967-466969,
  D:L440726). `FUN_00588bc0` pops nothing for the fall (D:L446105-446291) and links it over the top (D:L446292). This is
  before the tick's cut and end (D:L418176-418203) and its advance (`FUN_0057a330` at D:L418454), which advances only the
  top (`FUN_00555170(actor+0x1c0)` at D:L438702 and D:L438708; `FUN_0028c4f0` at D:L438874, D:L438901).
- **Phase: kept through the flight -- yes.** PAR-71's read applies to any one-shot under the fall: only the top
  advances, so the clip's phase `+0x1c` stops at what the ticks on the floor gave it. The fall's push writes nothing of
  the play under it but its root-motion fields (`FUN_0028dc90` D:L135141-135148; research 230 §5.2.4, "PAR-71"). Nothing
  is asked of it in the air: the cut and the end sit under the comparison of the top's action read before and after the
  tick's work (D:L418116 against D:L418176), and from the cover on the top is the fall. On the cover's own tick that
  comparison already fails, so a clip covered on its end's own tick is covered unpopped (PAR-71's review F1: the end test
  D:L418193 is skipped).
- **Hand-back at a clipless landing -- yes, as the flinch.** On the landing tick the ground pick clears the airborne bit
  (D:L466806-466809) and the landing branch (D:L466884-466911; the action none of `Fall forward` / `Fall backwards`,
  the get-ups, `Ladderslide`, `Climb over`, `dive_to_prone`: the strings at 0x660758, 0x661f88, 0x660768, 0x661fd0,
  0x6620c8, 0x661968, 0x661fe8) sets the jump lock (D:L466889) and, at 20 a second or more, pops the top once when the
  stack is deeper than one (`FUN_00589aa0`, D:L466900-466901): the fall. `FUN_0028da00` (D:L135024-135115) gives back
  the play under it -- the still clip -- writing `+0x174` from its `+0x2b` (D:L135104) and, the fall not looped, setting
  its skip bit 8 (D:L135105-135107); only a looped pair takes the popped play's phase (D:L135109-135110). `FUN_005af590`
  then plays no clip (the speed and the stick past their bounds, D:L466684-466690, `unaff_s1_lo` -1). The clip is the top
  again at its kept phase. Under 20 a second `FUN_0058a5e0(actor, 1, 1)` pops to index 0 (D:L466897; D:L446796-446798),
  and `FUN_005af590` plays `Jump land` (D:L466677-466682): no clipless landing exists under 20 a second.
- **The lock while covered -- it holds.** `FUN_005a7ab0` answers on a reload or pump type on the top (D:L462526-462531)
  or anywhere in the stack (`FUN_0058a470`, D:L462532-462544, its walk D:L446733-446747); the kit's timer is 0 from the
  push (D:L476550-476560). The covered clip is in the stack from the cover to the hand-back: the lock holds through the
  flight, and on to the clip's pop or cut after it. (The port's room and page held it already -- their uncut lock is the
  start's own timer, below.)
- **Its ends after the hand-back, on PAR-67's and PAR-69's lagged clock.** The landing's tick asks neither the cut nor
  the end (the top changed over it, D:L418116 against D:L418176), but it advances the clip: the peek spends the fresh
  skip (`FUN_0028c4f0(dt, top, 0)` D:L418293, the clear D:L134257) before the tick's advance (D:L418454) adds a frame.
  So the clip plays on from its kept phase from the landing's tick: on the port's commands, with `air` the first command
  whose body is in the air after it and `back` the landing's, the clip's clock at a command `c` past the landing is its
  own clock less the `back - air` commands it stood (the flinch's `until' = back + (until - air)`). The **uncut end** is
  PAR-69's test on that clock -- `seal_reload`'s 93rd command of its own clock, `back - air` commands later -- asked
  from the command after the landing's (covered on its end's own command, it pops on `back + 1`: the flinch's
  `max(1, ...)`). The **cut** is first asked on the next driver tick, a game frame past the landing's: the first command
  at or past `GAME_FRAME_DT` from it, `back + 3` (PAR-71's count for the flinch); there `FUN_00587c20` reads the stood
  clock's lagged phase against the clip's `NoInterrupt` (D:L445550-445556) and its end test first (PAR-72,
  D:L445526-445528), and the carried overlay's clock starts from that phase (D:L418213). The jump: `FUN_0057e1b0`
  refuses under the clip from the landing on (D:L440805-440810), the jump read before the pop on its own tick
  (D:L418119-418130): through the stood end's command, taken on the next.
- **A landing with a clip pops it -- unchanged.** At 20 a second or less `FUN_0058a5e0(actor, 1, 1)` (D:L466897) and in
  every clip landing `FUN_005af590`'s `FUN_0058a4d0(actor, 0)` before its push (D:L466691-466693) pop the stack to its
  base, the covered clip with the fall (R251.12): `landingPops` and `endStillReload` / `reloadPopped` as before. A climb's
  or a ladder's start pops it as before (§12.2).
- **Found while reading: `Rifle m203 reload` is never covered.** The set at D:L466816-466828 that keeps
  `FUN_005af930` out of its airborne branch holds one reload type, `DAT_003debf8` (D:L466828), registered from the
  string at 0x661840, `Rifle m203 reload` (D:L495238) -- the type `FUN_005a82e0` pushes for the m203's still reload in
  every stance (D:L462844-462851, `bVar4`). With it the current action, nothing is pushed in the air (the outer branch,
  D:L466829-466955, does nothing while airborne: D:L466830-466831): the clip stays the top, advances, and its end is asked each tick (the
  cut too, on axes zeroed in the air, D:L466811-466815). At the landing the same branch pops the top -- the m203's clip
  itself -- under 20 a second (`FUN_0058a5e0`, D:L466897) and over (`FUN_00589aa0`, D:L466900-466901), whether or not a
  clip is played: **any landing pops a still m203 reload**. The port keeps it on its own clock in the air (built here:
  not covered) and keeps it at a clipless landing (not built: below).
- **Built** (room and page together, PTW.R3; `fallCovers` excludes the m203's family):
  - `viewer/src/stillReloadLife.ts`: `fallCovers(family)`; `HANDED_BACK_CUT_COMMANDS` (`GAME_FRAME_DT` on the commands,
    3); `StillClipClock` (`start`, `stood`, `air`, `back`) with `stillClipClock`, `stillClipSeconds` (its own clock less
    `stood`), `stillClipFlight` (the cover on the first command in the air, the hand-back at a clipless landing -- the
    pattern of PAR-71's `flinchCovered` / `flinchLanded`, kept apart from them because the reload's end is a test on a
    clock, not a window -- and nothing asked on either command, nor on a return to the floor by a landing with a clip,
    so the pop finds the clip alive) and `stillClipCuttable` (from `back + HANDED_BACK_CUT_COMMANDS`).
    `StillReloadLife.ranWith(count, push, airborne, bare)` and `ran` (reading `Walker.airborne` and `landing`) run them.
  - `match/src/room.ts`: `ReloadLife` is a `StillClipClock`; `Player.cutLog` carries each command's `airborne` and
    `bare`; `watchCut` reads them (a new clipless landing: `Player.lastLanding` not yet taken by `run`, as
    `flinchLanding`), `cutAt` and `lockLife`'s replay run `stillClipFlight` and cut on `stillClipCuttable`, and
    `jumpRefused` refuses while covered and on the command after the hand-back, else on the stood clock's end.
  - `viewer/src/weaponPose.ts` (with its one call in `viewer/src/play.ts`, which hands it the snapshot's `airborne`):
    the page's pose, whose cut is the page's `Fire` lock (PF-18, `takeReloadCut`), stands its clock while covered, is
    handed back on the first frame on the floor (advanced, nothing asked), and cuts from `GAME_FRAME_DT` past it -- so
    the page's lock is cut on the room's command with the room's life left. Outside the brief's file list; the nearest
    change that keeps PTW.R3 (without it the page's `Fire` would be freed before the room's lock: research 127).
  - `viewer/src/mover.ts`: `COVERED_HOLDS` (the four reload holds), `coveredHold_` taken at the take-off
    (`coverHold`, from `takeOff` and `setAirborne(true)`), its clock less the cover tick's advance when the tick's clocks
    ran first (`clocked`), handed back by a clipless landing (`land`: plus the landing tick's advance, `back` 0) and
    dropped by a landing with a clip, `setAirborne(false)`, `place` or a knock; `runHold` counts `back`, `holdCut` waits
    `GAME_FRAME_DT` from it. The hold, the room's life and the page's life cut and end on one command -- *but one case
    (PAR-79's review F2, open):* when the hold's own end test falls on the walk-off command itself, the mover's
    `step60` runs its clocks (`runClocks` -> `runHold`) before the tick's move and its `takeOff`, so the hold ends
    `complete` on that command and `coverHold` finds none, while the room's and the page's lives are covered on it
    (`stillClipFlight`: the cover before the end test, D:L418169 before D:L418193) and pop on `back + 1`. Not built: the
    mover would have to hold back an end its clocks found until the tick's move is known, which moves the end's event
    and the tick's ground-state move (`FUN_005870e0` D:L418203) -- not a small change in a hot file. The jump is not
    told apart there (the landing's own jump lock, `JUMP_LOCK`, covers `back + 1`); what reads the mover's hold
    (`Walker.holding`, its end's event) is. Owed: that change, or a row of its own.
  - **The uncut lock is not moved**: the room's `reloadUntil` and the page's `Fire` keep the start's own length (research
    218 §2.2's owed "uncut lock as the clip's pop", PAR-69's "left"), so a flight longer than the time left frees the
    fire before the original's pop. Room and page agree.
- **The counts** (the M4A1, the disc's clips; `stood` the flight's commands, `back` the landing's command):

  | case | before PAR-79 | PAR-79 |
  |---|---|---|
  | `seal_reload` uncut, covered from its 20th command | life to its 93rd command | to `93 + stood` |
  | `seal_reload` covered on its 93rd, landed on `back` | popped on the 93rd | popped on `back + 1` |
  | a full stick from the landing, standing | cut on `back + 1`, the phase on its own clock | cut on `back + 3`, the stood clock's phase |
  | `seal_crouch_reload`, the stick from the landing | the hold gone at the take-off; the life cut on `back + 1` | the hold handed back; hold and life cut on the 41st command of the stood clock (`41 + stood`), or `back + 3` if later |
  | the jump after a hand-back (standing) | taken on the 94th command | taken on `94 + stood` |
  | `seal_reload_m203` in the air | its own clock | its own clock (not covered) |

  *PAR-79's review F1 (2026-10-13):* the jump row held for the room and for a bare `StillReloadLife`, not for the live
  page: `viewer/src/matchFirearm.ts` ended the page's life on every `reloadEnd`, `Fire`'s completed one too, which comes
  at its own timer (ReloadTime 1.6: the 96th command; the room's `reloadUntil` at + 95) -- so a flight longer than three
  commands freed the page's jump about `at + 96` while the room refused it to `at + 93 + stood` (a page/room
  misprediction, PARITY-1 D02). Fixed: the life ends on a `reloadEnd` that is not a completed one (a cancel, a hand's
  change, a knock, a flinch, a death, an undo) and at a swap's start, as before; its own end (`ranWith`) takes it
  otherwise. Uncovered nothing moves: the life's 93rd command comes before `Fire`'s 96th. With the life able to outlive
  the lock, the stack's pops after the lock's end take it too, room and page: the room's `endStillReload` clears a living
  life past `reloadUntil` (it had returned at the lock's end), and the page's `reloadPopped('knock')` ends a living life
  when `Fire` has no lock left to end. The page's `Fire` lock is untouched (it still ends no earlier than the room's,
  research 127). Tests: `matchFirearm.test.ts` -- "PAR-79's review F1" (the mounted firearm's own life, Fire's
  completed end at the 96th: to `93 + 30` covered, 93 uncovered; every other end and the swap still end it);
  `roomReloadLock.test.ts` -- "PAR-79's review F1" (a knock and a climb's start past the lock end the covered life,
  room and page on the same command, the lock as it ended). *Owed by the re-review, written by PAR-81 (2026-10-13):*
  `roomReloadLock.test.ts` -- "PAR-81 (PAR-79's re-review)": the other two pops past the lock, a ladder's mount (heard
  through the room's `watchMoves` as the Traversal emits it) and a landing that plays a clip (a second ledge, the stick
  let go: the room's own `run`, `landingPops`), room and page (`reloadPopped`) on the same command; it passed on its
  first run (a pin of PAR-79's code), and fails with `endStillReload`'s past-the-lock clause removed.

- **Tests** (the RED and GREEN in PAR-79's report): `stillReloadLife.test.ts` -- "PAR-79" (the stood end, the end's own
  command covered, the cut a game frame past the landing standing and crouched, a clip landing left for its pop, the
  m203 not covered) and PAR-62's page case moved (cut `cutCommands` past the landing, was the next tick);
  `roomReloadLock.test.ts` -- PAR-62's reload case moved the same way, and "PAR-79" (a standing reload's life, room and
  page on the room's mover, to `at + 93 + stood`, its lock the timer's; a crouched reload's hold handed back and cut with
  the life on `41 + stood`, the lock from the same phase; covered past `NoInterrupt`, hold and life cut on `back + 3`);
  `roomStillReloadJump.test.ts` -- "PAR-79" (the jump refused through `at + 93 + stood`, taken on the next, the page's
  life on the same commands); `reloadRun.test.ts` -- "PAR-79" (the room's lock and the page's `Fire` from the pose's cut
  on `back + 3`, one margin tick apart; the pose's stood end: pushed on the clip's 92nd command it cuts, on the 93rd it
  has popped).
- **Not built, named:**
  - **The m203's still reload at a clipless landing** (found above): popped in the original, kept in the port. The page's
    pop goes through `WalkMode`'s tick, which asks `landingPops(landing)` without the reload's family (`walk.ts`,
    outside this row), and the mover's hold for a crouched or prone m203 reload is the rifle's stand-in (H77), which
    `COVERED_HOLDS` hands back at a clipless landing where the original pops the clip. A row of its own (room, page and
    the stand-in hold): *filed as PARITY-2 plan row PAR-82 (2026-10-13); read and built by PAR-82 (below).*
  - **The uncut lock through a flight** (above): research 218 §2.2's owed row.
  - **The throws' and the plants' holds** are one-shots the fall covers too (none of them in the set at
    D:L466816-466828); the take-off still ends them (`replaced`). Not this row's (the reload's).
  - **The drawn body in the air.** The page's pose draws the covered still clip at its stood key through the flight;
    in the original the fall is the top. How the stack draws a covered play is not read (`RUNNING_THROW_BODY_READING`'s
    open part, §7).
  - **The others' pages.** The hold's code leaves the body record at the take-off and comes back at the hand-back with
    the same `holdSerial`; how a remote body (`./net/body`) plays a hold that comes back is not read.

#### PAR-82: the m203's still reload at a landing -- read and built (PARITY-2, 2026-10-13)

Reads what PAR-79 found and did not build (above, "Found while reading" and "Not built, named"): `Rifle m203 reload`
is never covered by the fall, and any landing pops it. Status: **reading, pending review.** Source inspection of the
decompilation (the bytes the header pins); no game, capture or browser was run. The tests are port contracts (the room's
mover with a real round launched off the disc's kit table, and the page's life, `Fire`, pose and `WalkMode` on one
command clock), not a measurement of the original.

- **The set at D:L466816-466828, and what it does.** `FUN_005af930` (called by the ground driver at D:L418169) takes its
  outer branch (D:L466829-466955) instead of the airborne one (D:L466956-466975) when the body's health (`+0x1044`) is
  0 or less, the airborne bit (`+0x105e` 0x20: set at D:L466806, cleared by the ground pick `FUN_0059b440`,
  D:L466808-466809) is clear, the body is attached (`+0xeac`), or the current action (`FUN_00577e40`, `actor+0x534`,
  D:L437404-437409) is one of 8, 9, `DAT_003deed0`, `DAT_003deed8`, `DAT_003deee8`, `DAT_003deef0`, `DAT_003deca0`,
  `DAT_003def50`, `DAT_003def40` or `DAT_003debf8`. Of these only `DAT_003debf8` is a reload type -- `Rifle m203
  reload`, registered from the string at 0x661840 (D:L495238), and one of the lock's fourteen (`FUN_005a7ab0`
  D:L462529, D:L462538). Airborne in the outer branch (`uVar6` the bit, D:L466829-466830), the branch's only work needs
  the floor (D:L466831): **no fall is pushed, the m203's clip is left on top, running.**
- **Its clip in the air.** It is the top, so the tick's advance moves it (`FUN_0057a330` at D:L418454; D:L438702,
  D:L438708), and the driver's comparison of the top's action before and after the tick's work holds (D:L418116 against
  D:L418176): the cut and the end are asked of it every tick. The cut's axes are the actor's `+0x240`, `+0x244`,
  `+0x23c` (`piVar14 + 0x90`, `+ 0x91`, `+ 0x8f`: passed to `FUN_005af930` at D:L418169 and read by the cut at
  D:L418182-418184), which the same call zeroes while airborne (D:L466811-466815): **no cut in the air.** The end
  (`FUN_00582540` D:L418193 -> `FUN_005870e0` D:L418203) pops it there on its own clock: **it can end in the air.** The
  lock (`FUN_005a7ab0`) answers on its type on top (D:L462526-462531): **held while it plays**, ended with it.
- **At the landing.** The ground pick clears the bit (D:L466808-466809) and the bit was set before (`bVar3` false,
  D:L466807): the landing branch (D:L466868-466911). The action is not `DAT_003deed8` / `DAT_003deed0`
  (D:L466869-466870); `+0x174` holds the stance word the clip was pushed with (`FUN_005a82e0` pushes with `cVar1` =
  `+0x174`, D:L462833, D:L462928): 0, 1 or 2, so not 9 (D:L466871) nor 10; `FUN_00587fe0` asks `DAT_003deee8` /
  `DAT_003deef0` (D:L445688-445693): no; nor `DAT_003deef8`, `DAT_003def00`, `DAT_003def50`, `DAT_003deca0`,
  `DAT_003def08` (D:L466881-466888). The jump lock is set (`+0x135c` 0.4, D:L466889), the top's `+0x2b` is the stance
  word, not 8 (D:L466890-466891), and the body is not attached (D:L466893):
  - **under 20 a second** (the speed squared under 400, D:L466894-466896): `FUN_0058a5e0(actor, 1, 1)` (D:L466897)
    pops while the stack holds more than one entry (D:L446796-446798) -- the m203's clip with the rest over index 0 --
    and `FUN_005af590` plays `Jump land` (D:L466677-466682), popping to the base before its push (D:L466691-466693);
  - **at 20 a second or more**: `FUN_00589aa0` pops the top once, the stack being deeper than one (D:L466900-466901) --
    the m203's clip itself, `FUN_0028da00` handing back the base kind under it -- and `FUN_005af590` (D:L466910) plays
    `Jump land hard`, a hit or `Land forward` (each after its own pop to the base) or, moving with the stick pushed, no
    clip (D:L466684-466690).

  So **any landing pops it, on the landing's tick**, before the tick's cut and end (D:L418169 before D:L418176): neither
  is asked of it there. **The lock** then finds no reload type on the stack (D:L462526-462544), the kit's timer 0 since
  the clip's push (D:L476550-476560), and no moving reload on the second channel (an uncut still clip lays none: the
  overlay is laid only at a cut, D:L418204-418215): it ends on the landing's command. **The jump** is read before the
  pop (D:L418119-418130 before D:L418169) under the m203's clip, a one-shot on top (`FUN_0057e1b0` D:L440805-440810):
  refused on the landing's command; from the next only the landing's own jump lock holds it (D:L466889; the mover's
  `JUMP_LOCK`), as after any landing.
- **Its stances.** `FUN_005a82e0` in a round mode (`bVar4`: `FUN_005bda00` or `FUN_005bd6d0`, D:L462824-462828), the
  anim set not the launcher's (`+0x528 != DAT_0044d408`, D:L462836), picks by the stance `FUN_0057dc20` gives
  (D:L462834): `DAT_003debf8` by default (D:L462844); prone (2) keeps it whatever the speed (`bVar4` skips the rest,
  D:L462845-462852); crouched (1) and standing (0) keep it still and take `DAT_003deb70`, `Moving rifle reload`, moving
  (D:L462853-462858, D:L462890-462894); the stance 6 takes `DAT_003deb70` (D:L462837-462842); any other pushes nothing
  (D:L462887-462889). So the still clip standing, crouched and prone is the one type `DAT_003debf8`, **in the set in
  every stance** (the port's `seal_reload_m203` for all three, `./reloadClip` `M203_RELOAD_CLIPS`); the moving start is
  not in the set and holds no still life in the port.
- **The port before PAR-82, on which command.** Each side knows the reload is the m203's from the reload's own start:
  the room's `reloadLife[w].spec.family`, set by `lockLife` from `launchRound`'s `reloadFamily({ roundMode: true })`; the
  page's `StillReloadLife` and the pose's `ReloadRun.family` from `Fire`'s `afterShot` event (`family`, from its round
  mode); the mover nothing -- its hold is the rifle's stand-in clip (H77).
  - In the air room and page agreed with the original (PAR-79's `fallCovers`: the life on its own clock, no cut, the
    lock held; the pose's clock running).
  - At a **clipless** landing the room's `run` and the page's `WalkMode` tick asked `landingPops(landing)`, which asks no
    family: no pop. The room's life and the page's ran on to the clip's own end (its 75th command standing), the lock to
    its timer (the round's 0.5 s and the clip's 1.3 s), the jump refused to the life's end (`jumpRefused`,
    `WalkMode.jump`) -- every command from the landing's + 1. With the stick past 0.1 the room's `cutAt` and the page's
    pose cut it on the landing's + 1 and carried `seal_mv_reload` on (`CARRIES_ON` holds the m203), a lock the
    original never has. A landing **with a clip** popped it on the landing's command, as the original.
  - The mover covered a crouched or prone stand-in hold at the take-off and handed it back at a clipless landing
    (PAR-79's `COVERED_HOLDS`), holding the body to the stand-in's `NoInterrupt` or end where the original's clip is
    gone; a clip landing dropped it, as the original.
- **Built** (room and page together, PTW.R3; no wire change):
  - `viewer/src/stillReloadLife.ts`: `landingPops(landing, family)` -- also true when the still clip's family is one the
    fall never covers (`!fallCovers`); `StillReloadLife.family()`, the living clip's.
  - `match/src/room.ts`: `run` asks `landingPops` with the hand's `reloadLife`'s family before `endStillReload`;
    `watchMoves` (each new mover) tells the mover `holdCovered` from the same life.
  - `viewer/src/walk.ts`: the tick's landing pop asks the walk's still clip's family (`stillClip.family`);
    `attachMoves` tells each mover `holdCovered` from it.
  - `viewer/src/mover.ts`: `Walker.holdCovered`, asked by `coverHold` at the take-off: told no, the stand-in hold is not
    covered -- the take-off ends it `replaced`, as before PAR-79, and no landing hands it back. Unasked, every hold of
    `COVERED_HOLDS` is covered (PAR-79's).
  - Not changed: `weaponPose.ts` (the pose has no landing of its own: `Fire`'s `reloadEnd` from the pop's `popClip`
    takes the clip off on the landing's frame), `matchFirearm.ts` (the life's wiring already carries the family), `Fire`.
- **The counts** (the M4A1-M203's M203 FRAG, the disc's `seal_reload_m203`, 37 keys at 1.3):

  | case | before PAR-82 | PAR-82 |
  |---|---|---|
  | standing, landed with no clip, the stick under 0.1 | life to its 75th command, lock to its timer, the jump refused through the 75th | life and lock end on the landing's command; the jump the landing's own lock's |
  | the stick past 0.1 from the landing | cut on the landing's + 1, `seal_mv_reload` carried | popped on the landing's command, nothing carried |
  | crouched, landed with no clip | the stand-in hold handed back, life and lock kept | no hold; life and lock end on the landing's command |
  | any landing with a clip | popped on its command | unchanged |
  | in the air | its own clock, not covered | unchanged |

- **Not built, named:**
  - **The clip's own end on the landing's command.** The port asks an uncovered clip's end on the landing's command
    (`stillClipFlight` answers true) before the landing's pop; the original pops first and asks nothing. The life ends
    on that command either way; the lock is then the port's uncut timer (research 218 §2.2's owed row) where the
    original's ends there. Reachable only when the landing's command is the clip's own end's.
  - **The drawn body in the air.** The original draws the m203's clip on top through the flight (no `Jump fall`); the
    port's mover plays its fall, the pose the still clip over it (`RUNNING_THROW_BODY_READING`'s open part, §7).
  - **A capture** of an m203 round fired standing and crouched at a ledge's edge, landing at rest and on the run: the
    measurement of all of the above.
- **Tests** (the RED and GREEN in PAR-82's report): `roomReloadLock.test.ts` -- "PAR-82" (standing and crouched,
  walked off ten commands into the clip, landed with no clip and with one: the room's life uncovered in the air, its
  lock held; life and lock end on the landing's command; the crouched stand-in neither covered nor handed back; the
  page's twin -- `landingPops` with the life's family, `reloadPopped`, `Fire` in its round mode -- on the same command;
  the control: a crouched rifle reload still covered and handed back); `roomStillReloadJump.test.ts` -- "PAR-82" (the
  jump refused on the landing's command by the room and the page, not on the next; taken on the command a landing
  without a reload takes it); `stillReloadLife.test.ts` -- "PAR-82" (`landingPops` by family, `family()`; `WalkMode`
  with the firearm, the round launched off the disc's kit table, standing and crouched, both landings: the walk's pop,
  `Fire`'s lock, the hold); `reloadRun.test.ts` -- "PAR-82" (the pose plays the clip on in the air and is taken off on
  the landing's frame, no cut handed to `Fire`); `moverHold.test.ts` -- "PAR-82" (`Walker.holdCovered`: unasked or yes
  handed back, no not).

#### PAR-87: a round mode's reload by hand, the ring's own, a full ring -- read; nothing to build (PARITY-2, 2026-10-13)

Reads the row PAR-87 filed from PAR-82's review: "the room's reload has no round mode" -- a reload by hand in a launcher
round mode, or the automatic one at the round's last, would be the m203's on the page (`Fire.family(false)` passes the
round mode) and the rifle's in the room (`reload` calls `reloadFamily` without it). Status: **reading, pending review.**
Source inspection of the decompilation (the bytes the header pins) and the disc's kit table (`ZWEAPON.ZAR`,
`zweapon.rdr`, through `readKitTable`); no game, capture or browser was run. The tests are port contracts on the disc's
records, not a measurement of the original. **The read finds no reload to model: in the original neither reload plays a
clip or turns a ring, the page starts none, and so the room is never asked.** No source change.

- **The kit's state (what says "round mode").** The kit's slot in the hand is `kit+0x824`; its mode word
  `kit+0x6fc + slot x 4` is the fire mode (1-3) or, past `MaxFireMode`, the item id of a round the kit holds
  (research 94 §C4.2). `FUN_005bd7e0` (D:L474373-474400) answers when the slot's item is a carrier (`FUN_003c5d80`)
  and its mode word is 4 or more; `FUN_005bda00` (D:L474463-474492) and `FUN_005bd6d0` (D:L474341-474368) ask the
  same of the redirected record (`FUN_005c3740` -> `FUN_005c6600`: a 203 or GL round, `FUN_003c5e40` / `FUN_003c5ca0`;
  `FUN_003c5cd0`) -- `FUN_005a82e0`'s `bVar4` (D:L462824-462828). The word changes only at the fire-mode switch
  (`FUN_005c4600`, D:L478578-478597, the press `FUN_00594cf0` D:L453465-453472), and the slot at a weapon's change.
  *Corrected by PAR-87's review (2026-10-13):* the word has other writers -- `FUN_005c37b0` (D:L477866, called from
  D:L162365, D:L424223, D:L424680, D:L428506, D:L510499) and D:L481568 in `FUN_005c8a20` -- and `FUN_005bd6d0` reads
  `FUN_005c67d0` / `FUN_003c5cd0` as `FUN_005bd7e0` does, not the redirected record; neither changes the finding below.
  The port's twin is the page's `Fire.roundMode_` (`matchFirearm.ts` `showFireMode`, `fireMode > 3`); the room holds no
  mode: no command or event carries it, and `launchRound` is told only a round's `throw`.
- **The request.** R (`FUN_002c64e0(6)`) arms the kit's timer only when `FUN_005a7ab0` answers no (`FUN_00594cf0`
  D:L453459-453463) -- and `FUN_005a7ab0` answers while the timer runs (`FUN_005c2400`, `kit+0x820 > 0`,
  D:L462522-462523, D:L462562), so R in a round's 0.5 s after-shot timer is refused, as in its clip. The timer is
  `FUN_005c32b0(-1, kit, 0)`: the redirected record's `ReloadDelay` (`FUN_005c3780` -> `FUN_005c6600`, D:L477828-477835;
  D:L477661-477666) -- the round's, which no round sets (0.01, research 94 §C1). **No fullness gate**, as for any firearm.
- **The landing: `FUN_005c2a90` (D:L477379-477548).** Past the gates (D:L477394-477410), in a round mode
  (`FUN_005bd7e0`, D:L477413) it takes the first slot whose item is the mode's round, one with rounds before an empty
  one (D:L477415-477445); then, if that slot holds rounds anywhere (D:L477447-477459), it walks from `m_currentmag + 1`
  round the ten for **another** magazine with rounds (D:L477462-477477). The clip (`FUN_005a82e0(actor, 0)`) is pushed
  only when the walk finds one (D:L477479), before the slot turns (D:L477483) -- or by the network refill below.
  **Every launcher round on the disc is one magazine** (and Double Ammo adds none: `FUN_005c75f0` doubles only classes
  4, 0x1f, 0x33, 0x51, 0x5b and 0x65, D:L480237-480239 -- the port's `arsenal.ts` `DOUBLED_CLASSES` alike; PAR-87's
  review): `zweapon.rdr`'s M203 HE / FRAG / SMOKE 6 / 6 / 3 x 1, GL HE /
  FRAG / SMOKE 8 / 8 / 3 x 1 (research 94 §C4's table; `fire.test.ts` "PAR-87" checks every `launcherRound` item of
  the table), so the walk never finds another. The refill (D:L477490-477510 with rounds, D:L477517-477541 without)
  runs only in a network game (`DAT_0045a0c1`, `IsNetwork`: research 107) and only for an item of class 4 (`FUN_003d1a60`
  D:L324336-324353: the pistols, 4-30) or a primary class (`FUN_003d1d10` D:L324404-324419: SMG, rifle, shotgun, MG, sniper, grenade launcher) other than the MGL and the
  M79 with `DAT_00437ce8 + 0xdc` set; a round is class 0xab (171-184): not taken. With rounds in the slot the function
  still returns 1 and sets the kit's bit 2 (D:L477512-477513), which `FUN_005bc2c0` tests and clears (D:L473761-473769;
  its readers not followed) -- no clip, no ring, no lock.
  - **By hand, in round mode: no clip plays and no ring is refilled** -- neither `Rifle m203 reload` nor the rifle's;
    the rifle's magazine is not the slot walked (the redirect, D:L477443-477445). `FUN_005a82e0`'s `bVar4` would pick
    `Rifle m203 reload` (`DAT_003debf8`, D:L462844-462851) were the push reached; with the disc's rings it is reached
    only by the after-shot (`FUN_005c3000` D:L477641-477643, PAR-82).
  - **The ring's own:** at the round's last (`FUN_005c38a0` 0, the held item not exempt: D:L479297-479320) the timer is
    armed with the round's `ReloadDelay`; it lands in the same walk, on a slot with no rounds (D:L477447-477459, then
    D:L477515-477543): nothing. A second slot of the same round with rounds is the redirect's next pick (the fire's
    `FUN_005c6600`, the walk's D:L477415-477445) -- still one magazine, still no clip. No after-shot either: the lock
    asks the rounds left (D:L479339-479340; the port's `afterShotLock`: none at 0).
  - **A full ring:** the same as a part-spent one -- refused in effect (no clip, no turn).
- **The port, on the lane head (40f4d2ba4), command by command.**
  - The page: `Fire.reload` refuses R when the ring cannot reload (`canReload`, the walk's `next()`), and in a round
    mode the ring is the round's (`Fire.ring`, `FUN_005c6600`'s redirect); `launch` arms no reload at the last round,
    and a dry pull arms one only when `canReload` (`Fire.pull`). So in a round mode with the disc's rings no
    `reloadStart` is ever emitted, `beginReload` and its `family(false)` are never reached, and `NetPage.fireEvent`
    sends the room no `reload`. A reload asked in the rifle's mode and landing after a switch into a round mode is
    refused at its landing (`beginReload` reads `this.ring` then, as D:L477408-477445 reads the mode then).
  - The room: `reload` (room.ts L4629-4678) and `holdPeriod` (L2668-2673) have no round mode and are reached in a round
    mode by no reload the page sends. `holdPeriod`'s rifle family for an m203 after-shot's stand-in hold gives the
    stand-in's own period, which the page's undefined period also gives (the comment there, `reloadHoldPeriod`).
    `launchRound` keeps its own ring per round (`KitRounds`) and arms the after-shot with `roundMode: true` (L4160-4166).
  - So the row's two sides never meet on the match server: room and page agree with each other and with the original
    on the three cases (no clip, no ring, no life, no lock) and on PAR-82's landing. **The room cannot know a round mode
    from what it holds** (the brief's stop); it does not need to, since no page reload reaches it in one.
- **Differences named, not built (none of them the room's, none this row's):**
  - *R refused outright, not a timer.* The original arms the 0.01 s timer even when the walk will find nothing, which
    refuses the fire on the next kit frame (`FUN_005c0fd0` D:L476549-476566) and lands in the mode then current; the
    page refuses at the press. One kit frame, for any one-magazine ring (research 84 §18, "The request"), not only a
    round's.
  - *R in an after-shot's timer.* `FUN_005a7ab0`'s timer term (D:L462522-462523) refuses the request (D:L453461), so a
    bolt's or pump's lock is never replaced by R; the room (`reload`'s `replacing`) and the page (`Fire.reload` clears
    `afterShotPending`; `fire.test.ts` "a reload asked in the bolt's lock replaces it") replace it. In a round mode both
    refuse anyway (the ring). For the controller: a row of its own (the M40A1's and the 870's R in the lock).
    *Read and built by PAR-88 (below, "PAR-88"): refused, room and page.*
  - *The network refill* above (D:L477490-477541): in a network game a pistol's magazine is refilled when no other has
    rounds -- research 84 §18 read the flag as "an unlimited-ammo mode, not identified"; research 107 identifies
    0x45a0c1 as `IsNetwork`. The firearms' half is the respawn game: `+0xdc` is the `Respawn` valve, the host option set
    and game type 5 (research 91 §4.1; `FUN_002a7560` D:L149415-149433); `FUN_003d1d10` is the primary-class test, the
    MGL (0x8e) and the M79 (0x8f) excluded (research 312 §3). Built by NET-REFILL (room and page; the ammo box's MAGS
    with it). (Corrected 2026-10-14 by NET-REFILL, research 312 §8; was: "The firearms' half waits on `DAT_00437ce8 +
    0xdc` (unread). Not modelled by the port. For the controller: a row of its own.")
  - *Two slots of one round.* The page's `Fire` keeps the ring `showFireMode` gave it (`KitRounds.ring` at the switch),
    so a first slot run dry stays dry until the next switch, where the original's redirect takes the next slot with
    rounds at the next round; the room's `launchRound` asks `KitRounds.ring` each time. Whether the ARMORY lets one round
    fill two slots is not read here. Not this row's (`matchFirearm.ts`).
- **Tests** (pins of the read; they pass on the lane head as written -- the row's finding does not occur):
  `fire.test.ts` -- "PAR-87" (every disc launcher round one magazine; on the disc's M4A1-M203 and M203 FRAG with the
  kit's ring: a full ring's R arms nothing; R in the round's lock and after its clip arms nothing, the ring and the
  rifle's magazine as they were; the six rounds' last arms no reload and no after-shot, the dry pull none; and with a
  second magazine, not on the disc, the reload is `m203`); `roomReloadLock.test.ts` -- "PAR-87" (the same on the
  room's mover with a page `Fire` bridged as `NetPage.fireEvent` sends: no `reload` told, the room's rifle ring, round
  ring, lock and life unchanged on the R's command and after; the control, the rifle's R, the rifle's on both on the
  same command; PAR-82's clipless landing popped on both, R after it nothing on both).

#### PAR-88: R in a bolt's or a pump's after-shot -- read and built: refused and dropped (PARITY-2, 2026-10-13)

Reads the row PAR-88 filed from PAR-87's read and review: R pressed in a bolt's or a pump's after-shot lock is refused in
the original and was taken in the port, room and page alike. Status: **reading, pending review.** Source inspection of
the decompilation (the bytes the header pins) and the disc's kit table (`ZWEAPON.ZAR`, `zweapon.rdr`, through
`readKitTable` and the kit's `kitRecords`); no game, capture or browser was run. The tests are port contracts on the
disc's records and clips, not a measurement of the original.

- **The request is refused through the whole after-shot.** R arms the kit's timer only when `FUN_005a7ab0` answers no
  (`FUN_00594cf0` D:L453460-453463: `FUN_002c64e0(6) == 1` and `FUN_005a7ab0(actor) == 0`, then
  `FUN_005c32b0(-1, kit, 0)`). `FUN_005a7ab0` answers first on the kit's timer (`FUN_005c2400`, `kit+0x820 > 0`,
  D:L477156-477159, asked at D:L462522-462523) and, with the timer at 0, on a reload type on top or in the stack
  (D:L462526-462544). The after-shot's timer is that word: `FUN_005c5340` arms it with `ReloadDelayAfterShot`
  (`FUN_003d2c20`) and the after-shot flag (`FUN_005c32b0(.., kit, 1)`, D:L479339-479342; the flag `kit+2 & 2`,
  D:L477678). When it runs out the kit's frame calls `FUN_005c3000` (D:L476549-476561: below 0, the flag set), which
  pushes the after-shot clip (`FUN_005a82e0(actor, 1)`, D:L477641-477643; skipped only for the RPG-7, `cVar1 == -0x6e`,
  when the slot its walk lands on holds no round, D:L477569-477638) before the timer is zeroed -- so no frame lies
  between the timer and the clip, and the clip (the pump clips `DAT_003df0b8/c0/c8` and the shotgun reloads among the
  types D:L462527-462544 lists; `PUMP_BLOCKS_FIRE_READING`, research 94) answers in turn. Nothing in the chain rewrites
  the timer with a reload: the
  port's "R replaces the lock" (the page's `Fire.reload` clearing `afterShotPending`, the room's `replacing`) has no
  source.
- **Dropped, not buffered.** `FUN_002c64e0` (D:L166917-166931) returns the action's button state byte, which
  `FUN_002d9ff0` (D:L179137-179169) steps 0 rest, 1 first down, 2 held, 3 first up: `== 1` is the press's first frame
  only. D:L453461-453464 has no else and nothing else reads action 6 (`FUN_002c64e0(6` occurs once, D:L453460), so a
  press refused is gone, and holding R through the lock's end does not ask again (state 2). The port's R is an edge
  too (`Fire`'s `keydown`, `repeat` excluded; the pad's `reload` on its press, `matchLanes.ts` `pressed`), and the
  page's refusal keeps nothing.
- **Which firearms have it** (`zweapon.rdr` through `readArsenal`, its golden `packages/scene/test/golden/arsenal-items.json`
  compared against the disc by `arsenal.test`: all 46 firearm records -- 35 primaries, the 3 grenade launchers among
  them, and 11 pistols; recounted by PAR-88's review, F1 -- was "through `readKitTable`, all 44"): `ReloadAfterShot` is set
  on the M40A1 (102) and the M87ELR (103), `ReloadDelayAfterShot` 0.5, and on the 870 (84), its delay the parser's
  0.01 (the misspelt key, R94.12); on no automatic weapon (the M4A1, the M60E3 and every other record with fire mode 3
  have none), so an automatic's R after a round is not refused by this term. The launched rounds (171-183, 0.5; the
  LAW's and the RPG's, 1; the artillery shell 0.01) have it too, PAR-87's case (refused there by the ring anyway). The
  M40A1's NumMags is 1: alone it has no other magazine and R is refused by the walk (`canReload`, research 84 §18);
  with the Double Ammo Load (2, `FUN_005c75f0`) or on the M87ELR (3) the row's case is met.
- **The empty shot.** At the magazine's last round `FUN_005c5340` arms the reload's timer (`ReloadDelay`, flag 0,
  D:L479297, D:L479318-479320) and not the after-shot (the `else if`, D:L479322): the reload follows on its own, as
  the port has it (`Fire.tryFire` -> `reloadPending`; `afterShotLock` null at 0 rounds; fire.test "the last round arms
  no after-shot lock"). Unchanged.
- **The port, on the lane head (9da9b4960), command by command.**
  - The page: `Fire.reload` refused in the after-shot's clip (`afterShotLeft > 0`) but in its timer
    (`afterShotPending >= 0`) cleared the timer and armed the reload: on the M40A1 the 0.5 s timer is 30 commands, so R
    in them skipped the bolt; on the 870 the 0.01 s timer is less than a command, so only R between the round and the
    next frame skipped the pump.
  - The room: `reload` took a reload named before `lockTimer` under an after-shot (`replacing`). Its 870 lock has no
    timer part (`lockTimer` = the round's own count, `floor(0.01 x 60)` = 0), so the 870 was never replaced there.
  - Room and page agreed (the page's skipped bolt sent a `reload` the room took), so there was no desync.
- **Built, room AND page on the same command, no wire change.**
  - `fire.ts` `Fire.reload`: refused while `afterShotPending >= 0`, as while `afterShotLeft > 0`; the line clearing
    `afterShotPending` removed; the docstring re-cited.
  - `room.ts` the `reload` handler: `replacing` removed, refused while `count < reloadUntil` whatever set the lock; the
    `Player.reloadUntil` field note re-worded. `lockTimer` stays (the lock's life and the knock read it).
  - The boundary is the lock's end as it was: the page's after-shot ends no earlier than the room's lock (`lockTicks`'s
    "less a tick"; and the 870's 0.01 s timer, which the page counts and the room's whole commands do not), so R on the
    page's first command after it sends a `reload` the room takes (`roomReloadLock.test` "PAR-88" asserts it on the
    disc's clips).
- **Tests:** `fire.test.ts` -- the moved pin "a reload asked in the bolt's lock is refused ... was: replaces it", and
  "PAR-88" on the disc's records (the M40A1 with 2X: R ten commands into the timer refused, the after-shot played, no
  reload after; the 870: R before the timer's first command refused; both: R on the after-shot's last command refused
  and nothing after, on the first after it the reload begins `ReloadDelay` later; the M4A1 and the M60E3 as controls);
  `roomReloadLock.test.ts` -- "PAR-88" (the same on the room's lock with a page `Fire` bridged as `NetPage.fireEvent`
  sends, the disc's clips: a reload named ten commands into the M40A1's timer, on its last, on the clip's first and on
  the lock's last refused, on the first after taken; the page sends nothing in the lock and its first `reload` after
  is taken on the command it names; the M4A1's control); `room.test.ts` -- the moved pin.

### 12.4 Not built, owed

- **The clipless landing and the covered clip's clock** (`CLIPLESS_LANDING_RELOAD_READING`, §7; *the pop read by PAR-65,
  research 230 §5.2.4 -- the clock remains*): what pops `Jump fall`
  at a landing with no clip, read; or a capture of a crouched reload walked off a ledge, landing at rest and landing on
  the run. *The clock read and built by PAR-79 (§12.3, "PAR-79"); the capture is still the measurement, and the m203's
  clipless pop and the uncut lock through a flight are named there.* *The m203's clipless pop built by PAR-82 (§12.3,
  "PAR-82").*
- **A capture of each end**: a knock during a moving reload and during an after-shot; a climb and a ladder begun under
  a still reload; a still crouched reload off a ledge (D04's YES half: the first usable shot after each).
- **The flinch's and the death's ends** stay §6's (no hunk here).
- **A replay's re-run.** The page's moves may lay `climbStart` again when the walk re-runs commands under a victory
  dance heard late (PAR-37, `WalkMode.syncVictoryMotion`); `reloadPopped` then ends only a still clip living at that
  count. Not met by a test.
- ~~**The still clip's phase on the skip's clock** (PAR-61, §12.5)~~ -- *retired by the re-read (issue #160 (closed)):* with the
  driver's peek (D:L418293) the phase the cut reads is the port's `t / (period x e)` at the driver's ticks, so nothing is
  owed here, and nothing of the mover's hold. *Back by another road and built by PAR-67 (§12.5):* the push lands after
  the frame's driver, so the cut reads the phase a game frame behind the push's clock after all.

### 12.5 The stick's cut and the push's initial skip (PARITY-2 PAR-61, 2026-10-12)

PAR-60 found that a pushed one-shot cannot be cut by the stick before the third driver tick that sees it (research 230
§5.2.1) and built it for the flinch. This section reads the still reload's push the same way and builds the floor.
Its first read (commit 499ab7208) repeated PAR-60's count; PAR-61's review found the driver's peek that both missed
(issue #160 (closed)), and **the correction** below re-reads it -- the earlier text is kept, marked superseded.
Status: **reading, pending review.** Source inspection of the decompilation (the bytes the header pins) and of the
game ELF's bytes for one virtual table (`game/disc/socom2_game.elf`, read-only); the clips' fields through the
repository's readers (`motionTableFromArchive` over the tracked `READERC.ZAR`, `clipsFromPack` over `MOTION_P.ZAR`). No
game, capture or browser was run.

- **Does the still reload's push take the initial skip? Yes.** `FUN_005a82e0` pushes the still clip with
  `FUN_00588bc0(actor, type, stance, 0, 0)` (D:L462928), after popping the stack to its base when the stance matches
  (D:L462925-462926). `FUN_00588bc0` sends a motion whose entry has `+0x4a` bit 2 to the second channel
  (`FUN_00587780`, D:L446083-446085: the four moving reloads, `BlendOverlay` in `motion.rdr`) and every other one onto
  the stack through `FUN_0028dc90` (D:L446292), the flinch's path. `FUN_0028dc90` copies the motion's looped bit
  (`+0x49` bit 6) into the play's 0x40 (D:L135187-135189) and, when it is clear, sets the initial skip 0x8
  (D:L135209-135212). Every reload and after-shot clip is a one-shot (`looped` 0, the table below), so flag 0x8 is set
  for the still reload's clip as for the flinch's.
- **Does its clock start on the push? Yes.** The push zeroes the phase (`FUN_0028cc10`, D:L135185; §10.1). Right after
  it `FUN_005a82e0` sets the play's speed `+0x18` to the motion's playback over the item's `ReloadTime` when it has one
  (`FUN_0028c1e0`, D:L462935-462941), which `FUN_0028c4f0` multiplies into dt (D:L134245-134247): the phase runs
  `t / (period x e)`, `period` the record's `ReloadTime` or the clip's playback -- the clock `reloadPhase` models.
  Nothing else starts it: the kit's timer (`kit+0x820`) runs out into the push and is 0 from then (D:L476550-476560,
  §12). The first advance after the push clears 0x8 and adds nothing (D:L134241, D:L134257-134259), whatever the speed.
- **Which tick cuts.** As for the flinch: the ground driver asks the cut before the tick's advance (`FUN_00550ef0`
  D:L418180; the advance through `FUN_0057a330`, D:L418454), and `FUN_00587c20` lets it only strictly past the play's
  `NoInterrupt` (D:L445550-445556). On the first driver tick that sees the clip its phase is 0, on the second still 0
  (the skip spent), on the third past 0: **the third driver tick that sees the clip is the first that can cut it**, at
  any `NoInterrupt`. Where the push falls in the frame is **unread**: it comes from the kit's frame (`FUN_005c0fd0`,
  called by the actor update `FUN_005506a0` at D:L417907), and the actor update and the ground driver are two slots of
  the SEAL's virtual table -- the table its constructor stores (`&PTR_PTR_006691a0`, D:L419079) holds `FUN_00551ec0`,
  `FUN_00550ef0` and `FUN_005506a0` at 0x6691b4, 0x6691b8 and 0x6691c0 in the ELF's bytes, the slots +0x14, +0x18 and
  +0x20 -- whose caller is not read. So the third tick falls two to three game frames after the push;
  `RELOAD_CUT_DELAY_READING` (§7) takes two, the push just before a driver tick, as `FLINCH_CUT_DELAY_READING` does.
  **Superseded (issue #160 (closed)).** This bullet missed the driver's peek of the top, `FUN_0028c4f0(dt, top, 0)` at D:L418293,
  between the cut's test (D:L418180) and the advance (D:L418454); every path past D:L418113 for a one-shot not cut
  reaches it (no return between D:L418113 and D:L418454). `FUN_0028c4f0` clears the skip in its `else` branch whatever
  its third argument (D:L134257), which gates only the store (D:L134273-134274). So on the first driver tick the cut
  reads phase 0, the peek spends the skip and the advance (`FUN_0057a330`'s `FUN_0028c4f0(dt, top, 1)`,
  D:L438896-438901) adds a whole frame; on the second the cut reads `G / (period x e)`, past 0. **Corrected: the second
  driver tick that sees the clip is the first that can cut it**, one to two game frames after the push (the place in the
  frame still unread); `RELOAD_CUT_DELAY_READING` is 1 game frame (0.0334 s), the earliest -- the third command.
  *(PAR-64, research 230 §5.2.3: the place is read since -- the scheduler runs `entity_pre_tick` (slot +0x14), then
  `entity_tick` (+0x18, the driver), then `entity_post_tick` (+0x20, the actor update and the kit's push) each frame,
  so the second driver tick comes two game frames after the push, reading the phase a frame behind the push's clock.
  Not built there: `RELOAD_CUT_DELAY_READING` keeps the earliest until a row of its own moves it with PAR-61's counts,
  `reloadPhase` and the mover's hold clock.)*
- **The clips** (`motion.rdr` and `MOTION_P.ZAR` through the readers; the first command that can cut, the stick held
  from the start, at the clip's own playback, on the port's 60 Hz commands counted from the clip's first). The eight of
  the rifle and the pistol, then the other families':

  The last column was 5 for the clips with no `NoInterrupt` in the first commit (the third tick); corrected to 3.

  | clip | looped | playback | keys | `NoInterrupt` | first cut, before | after |
  |---|---|---:|---:|---|---:|---:|
  | `seal_reload` | 0 | 1.6 | 45 | none (0) | 1 | 3 |
  | `seal_crouch_reload` | 0 | 1.9 | 28 | 0.35 | 39 | 39 |
  | `seal_prone_reload` | 0 | 1.7 | 30 | 0.5 | 50 | 50 |
  | `seal_mv_reload` | 0 | 1.2 | 33 | none | never (the overlay) | never |
  | `seal_p_reload` | 0 | 1.8 | 26 | none (0) | 1 | 3 |
  | `seal_p_crouch_reload` | 0 | 1.7 | 29 | 0.35 | 35 | 35 |
  | `seal_p_prone_reload` | 0 | 1.7 | 31 | 0.5 | 50 | 50 |
  | `seal_p_mv_reload` | 0 | 1.2 | 21 | none | never | never |
  | `seal_reload_shotgun`, crouched, prone | 0 | 1.6 | 18, 16, 14 | none (0) | 1 | 3 |
  | `seal_pump_shotgun`, crouched, prone | 0 | 0.9 | 18, 13, 22 | none (0) | 1 | 3 |
  | `seal_reload_m203` | 0 | 1.3 | 37 | none (0) | 1 | 3 |
  | `seal_mv_reload_shotgun`, `seal_mv_pump_shotgun` | 0 | 1.6, 0.9 | 18, 14 | none | never | never |

  So the floor reaches the clips with no `NoInterrupt`: the standing rifle and pistol reloads, the m203's, the
  shotgun's and the pump's. A crouched (0.35) or prone (0.5) rifle or pistol clip is crossed far past it, and the
  crouched and prone shotgun and pump clips are held by the mover's stand-in hold (`seal_crouch_reload`,
  `seal_prone_reload`; H77), whose stick shows only once that hold is cut, past 0.35 or 0.5.
- **Built.** `viewer/src/reloadLock.ts`: `RELOAD_CUT_DELAY_READING` and `reloadCuttable(t, phase, noInterrupt)` (from
  the floor on, and strictly past `NoInterrupt`), which `reloadCutAt` asks -- so the room's `cutAt` (`room.ts`,
  unchanged) and the page's `StillReloadLife.ranWith` (unchanged) cut on one rule. `viewer/src/weaponPose.ts`:
  `WeaponPose.step` asks the same for the drawn still clip, whose cut `Fire` takes for the page's lock
  (`Play.takeReloadCut`) -- the drawn clip is the same play in the original, popped by the same cut -- so the page's
  lock is cut on the room's command with the same life left (PTW.R3). Tests (on the corrected count; the first commit
  had five where they now have three): `roomReloadLock.test.ts` (PAR-61: two commands with the stick past 0.1 keep the
  room's lock and life, the third cuts them, the overlay's life from that command's phase; PF-18's first case moved from
  tick 3 to tick 5), `stillReloadLife.test.ts` (PAR-61: the life through the two commands after its first, cut on the
  third; the pose cut on the third frame with the room's `reloadCutAt` life left; two older pins moved past the floor),
  `reloadRun.test.ts` (the page's `Fire` free after the third frame's cut plus the overlay's life from its phase, not the
  first frame's). The flinch's count moves with it (research 230 §5.2.1's correction: `FLINCH_CUT_DELAY_READING` one
  frame, `FLINCH_CUT_COMMANDS` 3; `flinch.test.ts`, `walk.test.ts`, `roomReloadLock.test.ts`'s flinch cases).
- **The carried life.** *Superseded (issue #160 (closed)): the first commit's bullet below took the third-tick count and
  so a phase one frame behind the port's; it is kept as written.* Corrected: with the peek the phase the cut reads at the
  j-th driver tick (counted from 1, the tick that first sees the clip) is `(j - 1) x G / (period x e)` -- the port's `t / (period x e)` at the driver's ticks -- so the crossing of a
  `NoInterrupt`, the carried overlay's start (D:L418213) and the mover's hold's cut are on one clock, nothing lagged. A
  standing reload cut at the earliest: in the original at the second tick, `t = G`, phase 0.02133, the overlay carrying
  on for 1.1388 s, the lock's end at 1.1722 s, the first command at or past it the 71st from the push; on the port at the
  third command, phase 0.03196, 1.1264 s left, `3 + ceil(67.59)` = 71. The same command: the 72/73 gap below is gone.
- *(Superseded.)* **Not built: the phase with the skip.** In the original the phase the cut test reads lags the push by the skipped
  frame: at the k-th driver tick it is `(k - 1) x G / (period x e)` (the earliest case; `G` = `GAME_FRAME_DT`), so the
  crossing of a `NoInterrupt` comes one game frame later than the port's `t / (period x e)`, and the carried overlay's
  clock (D:L418213) starts from that phase. A standing reload cut at the fifth command carries on for
  1.164 x (1 - 0.0319) = 1.1265 s on the lagged clock against the port's 1.164 x (1 - 0.0533) = 1.1017 s: the port's
  lock ends one command early (72 commands from the push against 73). It is not built because the port's whole
  one-shot clock runs from the push without the skip (§10.5), and the crouched and prone reloads' crossing is the
  mover's hold's (`mover.ts`, the hold's cut `h.t / (period x e) > noInterrupt`), which the room's lock and the page's
  pose follow on the same command (`reloadRun.test.ts`, "the hold and the layer on one clock"): putting `reloadCutAt`
  and the pose on the lagged clock alone would cut the lock up to two commands after the body for those clips. PAR-61's
  brief keeps `mover.ts` out (owed, §12.4).

#### PAR-67: the push lands after the driver -- read and built (PARITY-2, 2026-10-12)

Corrects the count above beside it (issue #160 (closed)'s history is kept as written: PAR-61's first commit took the
third driver tick, its correction the second at one game frame; this row puts that second tick two game frames after
the push). Status: **reading, pending review.** Source inspection of the decompilation (the bytes the header pins) and
of the game ELF's bytes (`game/disc/socom2_game.elf`, read-only) for four virtual tables and their type names; no game,
capture or browser was run.

- **The push's frame: confirmed.** The world's state registers the scheduler's tasks by priority (`FUN_001ec480`):
  `entity_pre_tick` 1.0 (`FUN_0029f510`, D:L50922), `entity_tick` 4.6 (`FUN_0029f430`, D:L50925), `entity_post_tick` 6.0
  (`FUN_0029f1a0`, D:L50929) (research 230 §5.2.3). `FUN_0029f430` calls every entity's slot +0x18, the ground driver
  `FUN_00550ef0` for a SEAL (D:L145103-145105); `FUN_0029f1a0` calls slot +0x20, the actor update `FUN_005506a0`, then
  +0x24 and +0x10 (D:L145064-145071). The actor update calls the kit's frame `FUN_005c0fd0` (D:L417907), whose timer
  `kit+0x820` runs out into `FUN_005c3000` or `FUN_005c2a90` (D:L476550-476558) -- or a reload asked with the timer at 0
  into `FUN_005c2a90` (D:L476622) -- and those push the still clip through `FUN_005a82e0` (D:L477479, D:L477501,
  D:L477528; D:L477643). So the player's push lands after the frame's driver.
- **Nothing advances it in the push's frame.** The play is advanced only in the driver: the only calls of
  `FUN_0028c4f0` are the driver's peek (D:L418293) and `FUN_0057a330`'s two (D:L438874, D:L438901), whose only caller is
  the driver (D:L418454). What runs after the push in the frame -- the actor update's `FUN_005a50a0`, `FUN_005a3570`,
  `FUN_005a33b0` (after D:L417907) and the SEAL's slots +0x24 (`FUN_00550570`) and +0x10 (`FUN_0029ec20`, the words at
  0x6691c4 and 0x6691b0) -- reaches neither through direct calls, six levels down (a virtual call among them is not
  followed).
- **The clip's clock against the push.** With `G` = `GAME_FRAME_DT` and `t` the seconds from the push (frame k's
  post-tick): the first driver tick that sees the clip is frame k+1's, `t = G`, where the cut reads phase 0
  (D:L418180, `FUN_00587c20` D:L445550-445556: not past it), the peek spends the skip and the advance adds a frame; the
  second is frame k+2's, `t = 2G`, where the cut reads `G / (P x e)` -- past 0, the first that can cut. In general the
  j-th driver tick (`t = jG`) reads `(j - 1) G / (P x e)` = **`(t - G) / (P x e)`**: the phase a game frame behind the
  push's clock, the carried overlay's clock set from it (`unaff_f20` = the play's `+0x1c` at the cut, D:L418187, into
  D:L418213), and the overlay's life left `1.164 x (1 - it)`. The drawn still clip does not lag: the frame draws after
  its driver's advance, `jG / (P x e)` = `t / (P x e)` (the port's `reloadPhase`). The carried overlay drawn does: its
  clock starts from the phase the cut read.
- **The mover's hold.** The crouched and prone still reloads' hold is the same play (`FUN_005a82e0`'s push, cut by
  `FUN_00550ef0` past its `NoInterrupt`), so its cut reads the same lagged phase. Its clock `h.t` starts at the push:
  the page lays the hold as it sends the reload naming the last command sent (`WalkMode.hold`; `netPage.ts` at
  `reloadStart`), the hold rides the next command, and the room's mover holds on that command's tick -- so `h.t` after
  the k-th command past the reload's is `k / 60`, the room's and the page's life's `t`. Nothing moves its start; its cut
  reads `(h.t - G) / (P x e)`, and the hold, the room's life and the page's life and pose are cut on one command.
- **A bot's and a squirm's push** (`FUN_005c2a90`'s other callers): `FUN_005fe880` is `CSealCtrlSquirm`'s controller
  tick (its table 0x6699f0 -- stored by `FUN_005ff090` D:L510524, `FUN_005ff0f0` D:L510549 -- holds it at +0xc, the
  word at 0x6699fc; the type name at 0x662ee8's string); `FUN_00608840` is the AI state `CAiSReload`'s slot +0x14 (table
  0x669e20, the word at 0x669e34; the type name at 0x6635d8's string), run by the AI state machine `FUN_005f8030`
  (D:L506903; it sets the dt the state reads, `DAT_0044d620`, at D:L506884) from `FUN_005f55e0` (D:L505344), which
  `CSealCtrlAi`'s controller tick `FUN_0056de10` calls (D:L432253, D:L432513; its table 0x6693f0 at +0xc, the word at
  0x6693fc). A controller's tick runs from the pad's copy `FUN_00551ec0` (slot +0x14, `entity_pre_tick`, D:L418526). So
  those pushes land **before** the frame's driver: the first driver tick that sees the clip is the push's own frame's,
  the second one game frame after the push, with the phase on the push's own clock -- PAR-61's count. A bot's reload
  through the kit's timer (D:L476550-476558) lands after the driver as the player's does. Not built: the port's room
  runs the player's reload only. **A remote's** push on a peer is not read: under the online flag with `+0xfcf` set the
  pad's copy calls the controller's slot +0x14 instead of its tick (D:L418511-418514), and what that pushes is unread.
- **The flinch is not placed by this**: its push comes from the hit's handler (research 193 §2.4), not the kit's
  frame; `FLINCH_CUT_DELAY_READING` stands.
- **Built** (room and page together, PTW.R3). `viewer/src/mover.ts`: `RELOAD_PUSH_LAG` (`GAME_FRAME_DT`, the read
  above) and `holdCut` reading `h.t - RELOAD_PUSH_LAG` for the four reload holds (`seal_crouch_reload`,
  `seal_p_crouch_reload`, `seal_prone_reload`, `seal_p_prone_reload`; the shotgun's and the pump's stand in on two of
  them). `viewer/src/reloadLock.ts`: `RELOAD_CUT_DELAY_READING` = `RELOAD_PUSH_LAG + GAME_FRAME_DT` (two game frames:
  the fifth command), `reloadCutPhase(spec, t)` = `reloadPhase(spec, max(0, t - RELOAD_PUSH_LAG))`, which `reloadCutAt`
  reads for the cut and the carried life -- so the room's `cutAt` and the page's `StillReloadLife` (both unchanged)
  move with it. `viewer/src/weaponPose.ts`: the pose's cut test, the carried overlay's start and the life it hands
  `Fire` on `reloadCutPhase`; the drawn still clip's sampling unchanged.
- **The counts move** (PAR-61's pins, beside their history in the tests): a standing still reload with the stick held
  from its first is cut on the fifth command (was the third), the overlay's life from `(5/60 - G) / (1.6 x 44/45)` =
  0.0319 -- 1.1265 s, 68 commands (`roomReloadLock.test.ts`: the cut at tick 7, a round at 7 + 68 taken, 74 dropped;
  was tick 5, 73 and 72); crouched (`seal_crouch_reload`, 1.9 s, 0.35) the 41st command (was the 39th), the hold and the
  life on one command; prone (`seal_prone_reload`, 1.7 s, 0.5) the 52nd (was the 50th). The table above, by clip, with
  this row's column:

  | clip | `NoInterrupt` | first cut, PAR-61 corrected | PAR-67 |
  |---|---|---:|---:|
  | `seal_reload`, `seal_p_reload`, `seal_reload_m203`, the shotgun's and the pump's still clips | none (0) | 3 | 5 |
  | `seal_crouch_reload` (1.9, 28 keys) | 0.35 | 39 | 41 |
  | `seal_p_crouch_reload` (1.7, 29 keys) | 0.35 | 35 | 37 |
  | `seal_prone_reload` (1.7, 30 keys) | 0.5 | 50 | 52 |
  | `seal_p_prone_reload` (1.7, 31 keys) | 0.5 | 50 | 52 |

  The original, against it: the standing reload cut at the second driver tick, `t = 2G` = 0.0667 s, phase 0.0213, the
  overlay on for 1.1388 s, the lock's end 1.2055 s -- the 73rd command from the push; the port, the fifth command,
  phase 0.0319, 1.1265 s left, `5 + 68` = 73. The same command (§12.5's "carried life" bullet had the 71st from the push
  at one game frame).
- **Found, not built (for the controller):**
  - **The uncut end lags too.** The driver asks the play's end (`FUN_00582540` D:L418193 -> `FUN_0028c6e0` D:L442925)
    before its advance, on the same lagged phase plus half a frame's step (`FUN_0028c6e0` D:L134296-134302, the frame's
    dt `actor+0x2e0` stored at D:L418488): the uncut clip comes off near `t - G/2 >= P x e^2`, not the port's
    `t >= P x e^2` (`reloadCutAt`'s, `StillReloadLife.ranWith`'s and the room's `cutAt` / `jumpRefused` end; the hold's
    `seconds`). Not this row's (the brief moves only the cut); the jump's refusal and the hold's end move by it.
    *Read whole and built by PAR-69 (below): the half step is at the clip's own playback, not the play's speed, so the
    end is `t - G + G x P / (2 x Q) > P x e^2` (`Q` the clip's playback); `t - G/2` only where `ReloadTime` is none.*
  - **The throws' and the plants' holds** keep the push's own clock in `holdCut`: where their push falls in the frame
    is not read here. *Read by PAR-70 (below): the throws' after the driver, built; C4's before it; the claymore's
    placing clip both, kept.*
  - **A bot's, a squirm's and a remote's push** (above): the room runs none of them.

#### PAR-69: the uncut end lags too -- read and built (PARITY-2, 2026-10-12)

Reads PAR-67's "found, not built" bullet above (kept as written). Status: **reading, pending review.** Source inspection
of the decompilation (the bytes the header pins); the clips' fields through the repository's readers as in the tables
above; no game, capture or browser was run.

- **Where the end is asked.** The ground driver asks the stick's cut first (`FUN_00550ef0` D:L418180-418187) and the
  play's end only when nothing cut (`if (cut == false)`, D:L418192, `FUN_00582540` at D:L418193); on either answer
  `FUN_005870e0` pops the play (D:L418203). All of it comes before the tick's advance (`FUN_0057a330` at D:L418454).
  `FUN_00582540` asks `FUN_0028c6e0(actor+0x2e0, top)` (D:L442925); `actor+0x2e0` is the frame's dt, stored by the pad's
  copy `FUN_00551ec0` (D:L418488), the dt the advance reads too (D:L438874, D:L438901). For the reload's play it returns
  that test's answer: the play's state `+0x2a` is 0 from the push (`FUN_0028cc10` D:L134467), it has no end callback at
  `+100` (`FUN_005a82e0` sets one only for `DAT_003df0d8`, D:L462929-462933), none of the motion types
  D:L442996-443127 names is a reload type (the reload types are `FUN_005a7ab0`'s, D:L462526-462544), and the answer is
  1 at D:L443131-443132. Not read one by one: the actor's `+0x1061` bit 1, which holds the play at 1.0 and answers 0
  (D:L443049-443051); its setters (D:L440678-445796) are the jump's, the fall's, the climb's and the get-up's paths,
  none the still reload's.
- **The end test's exact form.** `FUN_0028c6e0` (D:L134283-134308) takes the top's first entry's motion
  (D:L134291-134292), its (n-1)/n (`FUN_0028ada0`, D:L134293; D:L133349-133366) and its playback `+0x10` (D:L134294),
  and sums half of
  `dt x entry+0x24 / (playback x e)` with the stored phase `+0x1c` (D:L134295-134297); forward (flag 0x20 clear,
  D:L134298-134299) it answers 1 when the stop `+0xc` -- the play's (n-1)/n, `FUN_0028cc10` D:L134494 -- is strictly
  below the sum (D:L134300). `entry+0x24` is 1.0 for a forward one-shot (the push's `FUN_0028cc10`,
  D:L134499-134505). The step it halves is **not the advance's**: `FUN_0028c4f0` multiplies dt by the entry's speed
  `+0x18` (D:L134245-134246), which `FUN_005a82e0` sets to the clip's playback over the record's `ReloadTime`
  (D:L462936-462939), and by its weight `+0x8` (D:L134250, D:L134252); `FUN_0028c6e0` reads neither. So with
  the phase the driver reads `t` seconds after the player's push, `(t - G) / (P x e)` (PAR-67 above; `P` the period,
  `ReloadTime` or the clip's playback; the stored phase held at `e`, D:L134262-134266):

  **the clip comes off at the first driver tick with `(t - G) / (P x e) + G / (2 x Q x e) > e`**, `Q` the clip's own
  playback -- on the port's `t`, `t > P x e^2 + G - G x P / (2 x Q)`; without a `ReloadTime` (`P` = `Q`),
  `t > P x e^2 + G/2`. `G/2` = 0.016684 s, a hair over a 60 Hz command (0.016667), so the end moves by one command
  for every clip without a `ReloadTime`. In whole commands from the push (the port's `t` = k / 60, the room's and the
  page's life's clock, the hold's `h.t` -- PAR-67's "the mover's hold"), the first `k` past it, against the port's
  `t >= P x e^2` before:

  | clip (keys, playback) | `P x e^2` | the read's end | before | PAR-69 |
  |---|---:|---:|---:|---:|
  | `seal_reload` (45, 1.6) | 1.5297 s | 1.5464 s | 92 | 93 |
  | `seal_crouch_reload` (28, 1.9) | 1.7667 | 1.7834 (107.004 commands) | 107 | 108 |
  | `seal_prone_reload` (30, 1.7) | 1.5886 | 1.6052 | 96 | 97 |
  | `seal_p_reload` (26, 1.8) | 1.6642 | 1.6809 | 100 | 101 |
  | `seal_p_crouch_reload` (29, 1.7) | 1.5848 | 1.6015 | 96 | 97 |
  | `seal_p_prone_reload` (31, 1.7) | 1.5921 | 1.6088 | 96 | 97 |
  | `seal_reload_shotgun`, crouched, prone (18, 16, 14; 1.6) | 1.4272, 1.4063, 1.3796 | +0.0167 | 86, 85, 83 | 87, 86, 84 |
  | `seal_pump_shotgun`, crouched, prone (18, 13, 22; 0.9) | 0.8028, 0.7669, 0.8200 | +0.0167 | 49, 47, 50 | 50, 48, 51 |
  | `seal_reload_m203` (37, 1.3) | 1.2307 | 1.2474 | 74 | 75 |
  | `seal_reload` at the M60E3's `ReloadTime` 3 | 2.8681 | 2.8702 | 173 | 173 |
  | `seal_reload_shotgun` at a `ReloadTime` of 2 (the Spas 12, the JACKHAMMER) | 1.7840 | 1.7965 | 108 | 108 (at the play's own step, `t - G/2`: 109) |
  | `seal_crouch_reload` at the M60E3's 3 (the hold's period) | 2.7895 | 2.7966 | 168 | 168 (at the play's step: 169) |

  `seal_crouch_reload`'s end falls 0.0036 of a command past the 107th: the command the port takes is the read's, but
  a capture's frame timing (the frame's dt, `GAME_FRAME_DT`) settles it.
- **Which of the port's ends it moves** (each is that play's end in the original):
  - **The life** (`StillReloadLife.ranWith`, the room's `cutAt`): the clip on the stack is this play; it comes off at
    this pop. Moved.
  - **The jump's refusal** (the room's `jumpRefused`, the page's `lives`): `FUN_0057e1b0` refuses while the top is not
    looped (D:L440805-440810), read before the driver's cut and end in the same frame (D:L418119-418130), so the jump is
    refused through the pop's own tick and taken on the next -- the life's end, a command later. Moved with it.
  - **The hold** (the mover's `runHold` for the four reload holds): the crouched and prone still reload's hold is this
    play (PAR-67's "the mover's hold"). Moved; the throws' and the plants' holds keep their own end
    (`HOLD_PUSH_FRAME_READING`). *The throws' moved since by PAR-70 (below); the plants' kept.*
  - **The cut's played-out bound** (`reloadCutAt`): the cut is asked only of a play still on the stack, so it is bounded
    by this end, not the last key. Moved: on the 92nd command a standing reload's clip is still there and a push cuts
    it, carrying the overlay on from its lagged phase.
  - **The reload's lock** (`reloadUntil`, `ReloadTime`): in the original it ends at this pop -- `FUN_005a7ab0` answers
    on the kit's timer (`FUN_005c2400` D:L477154-477159, `kit+0x820`, 0 from the push, D:L476550-476560), a reload type
    on the stack (D:L462526-462544) or a moving reload on the overlay (D:L462548-462555), and after the uncut pop none
    holds. The port's is its own timer -- the start's length (`reloadSeconds`, 1.6 s for the M4A1, 96 commands less a
    tick), research 218 §2.2's owed "uncut lock as the clip's last key". **Left**, as the brief says: that owed row's
    end is this pop (the 93rd command for `seal_reload`), not the last key 218 names.
  - *Extended 2026-10-16 (PB-2c, research 215 s7.1 "The seat, re-read and built"; reading, pending review):* **the turret's
    mount clip** (`Stand -> Turret`, `Pistol stand -> Turret`; 26 keys, playback 0.3, no `ReloadTime`) comes off at the same
    test, asked by the same driver before the advance (`FUN_00582540` D:L418193; its forward end the plain one, the reversed
    bit re-read at D:L442992), on the steer's own clock from the mount: the first tick whose run before its advance passes
    `P x e^2 - G/2` -- the 17th at 60 Hz (16 steer ticks, key 24.04), after 8 advances at the game's frame (key 24.06); the
    hold runs that tick. Built in `viewer/src/net/emplacement.ts` (`mountPlayedOut`, `mountSteerTicks`) for the room's
    `SeatSteer` and the page's `TurretPage`; no lag term (the mount's push is the room's own, at the top of its step; where
    the game's push falls in its frame shifts the whole mount, not its key, research 215 s7.1).
- **Built** (room and page together, PTW.R3). `viewer/src/mover.ts`: `reloadPlayedOut(t, period, frames, playback)`
  beside `RELOAD_PUSH_LAG`, the one test (the lagged phase plus half the clip's own step, past `e` strictly), which
  `runHold` asks for the four reload holds (their `period` and the clip's `playback`). `viewer/src/reloadLock.ts`:
  `ReloadLifeSpec.playback` (the still clip's `motion.rdr` playback, `reloadLength`), `reloadEnded(spec, t)` on
  `reloadPlayedOut`, and `reloadCutAt`'s played-out bound on it. `viewer/src/stillReloadLife.ts` `ranWith` and
  `match/src/room.ts` `cutAt` and `jumpRefused` on `reloadEnded`. Tests: `stillReloadLife.test.ts` (the life to the
  93rd command, was the 92nd; the helper against `reloadCutPhase` plus the half step; `reloadCutAt` on the 92nd; the
  half step at the playback, a `ReloadTime` of 2 over `seal_reload_shotgun` on the 108th, not the 109th),
  `moverHold.test.ts` (the four reload holds a tick past their last key, the throw's unmoved), `reloadRun.test.ts`
  (the page's crouched hold on the 108th, the M60E3's on the 168th, not the 169th), `roomStillReloadJump.test.ts` (the
  jump taken at + 94, was + 93; F4's backlog a command later), `roomReloadLock.test.ts` (a crouched reload left uncut:
  its hold and its life on the 108th command, its lock unchanged).
- **Found, not built (for the controller):**
  - **The order on the end's own tick.** The original asks the cut before the end (D:L418180-418193): on the tick the
    end test first passes, a push past 0.1 cuts the play instead, and the standing ones carry the overlay on from the
    lagged phase (D:L418205-418225). The port asks the end first -- the room's `cutAt` and the page's `ranWith` test the
    end before the cut, and the mover's `step60` runs `runClocks` (the hold's end) before `holdCut`. One command; for
    `seal_reload` the carried tail from the 93rd command (0.036 s, 3 commands) reaches past the uncut lock's own end
    (1.6 s less a tick) and a cut never lengthens the lock (`cutAt`), so nothing moves for the M4A1.
    *Superseded by PAR-72's read (below): the cut's own test `FUN_00587c20` asks the end test first and refuses the
    cut when it fires (D:L445526-445528), so on the end's own tick the play pops uncut and the port's end-first order is
    the original's. Pinned, nothing built.*
  - **The page's pose.** `WeaponPose.step` stops asking the cut at the drawn last key (`r.t >= last`, where its fade
    starts), so in the one command between the last key and this pop (the 92nd for `seal_reload`) the page's pose cuts
    nothing where the room's `cutAt` and the page's life now do; the page's `Fire` then keeps the start's length plus
    `RELOAD_CUT_MARGIN_TICKS`: later than the room's lock, never earlier (research 127). With it the drawn fade's start:
    the original holds the last key until this pop and the body's cross-fade starts there. `weaponPose.ts` is outside
    this row's brief (its drawn sampling). *Built by PAR-73 (below): the pose asks the cut up to `reloadEnded` and fades
    from the pop; the gap moves more families' locks than the pistol's.*
  - **The hold's root past its last key.** On the command between the last key and the pop the mover's `clipVelocity`
    samples its clamp (the last key pair); the original's root at the held stop (`FUN_0028c250`'s key pair from
    `entry+0x20`, `FUN_00289bb0`, D:L134145-) is not read.

#### PAR-70: the throws' and the plants' pushes in the frame -- read, the throws' built (PARITY-2, 2026-10-13)

Reads `HOLD_PUSH_FRAME_READING` (PAR-67's review F1; PAR-67's and PAR-69's "found" bullets above, kept as written).
Status: **reading, pending review.** Source inspection of the decompilation (the bytes the header pins) and of the game
ELF's bytes (`game/disc/socom2_game.elf`, read-only): one virtual table (`CSealCtrl`, 0x6694b0: the word at 0x6694bc is
0x594cf0, slot +0xc; the word at 0x669528 is 0x592d50, slot +0x78), the action-type name table at 0x661060 (index 0x2c
`Stand -> Ladder`, 0x2e `Climb off ladder`, 0x35-0x37 the three `rifle -> Pistol` swaps, 0x3e `Put on wall`, 0x83
`Pistol put on wall`), and every `jal` to and every data word naming the functions below; the clips' fields through the
repository's readers (`motionTableFromArchive` over the tracked `READERC.ZAR`, `clipsFromPack` over `MOTION_P.ZAR`). No
game, capture or browser was run.

- **The pushes all go through `FUN_00588bc0`, and take the initial skip.** The throw's (`FUN_005802b0` D:L441900) and
  the placings' (`FUN_0057d540` D:L440346, called with the action type) reach `FUN_00588bc0(actor, type, ..., 0, 0)`,
  which sends a `BlendOverlay` motion to the second channel (D:L446083-446085) and every other one onto the stack
  through `FUN_0028dc90` (D:L446292), which sets the initial skip 0x8 for a motion whose looped bit is clear
  (D:L135209-135212). Every `HOLD_CLIPS` clip is a one-shot and none is `BlendOverlay` on the disc (`moverHold.test.ts`,
  "none a BlendOverlay or looped"): each takes the skip, as the still reload's does (§12.5 above). The pistol's versions
  are the same push (`FUN_0058c820`, research 85 §3).
- **The throw: the kit's frame, after the driver.** `GetThrowAnim`'s clip (`FUN_0057fce0`; the seven rifle throws and
  the pistol's toss, `seal_p_tossgrenade`) is pushed only by `FUN_005802b0` (D:L441900; its one `jal`, 0x5bf1d0, is
  `FUN_005be9a0`'s at D:L475501), from `FUN_005be9a0`'s hand-grenade branch (the class 'y', D:L475490-475511). Its
  three callers (`jal` 0x5c00ec, 0x5c1158, 0x5c141c; no data word names it) are `FUN_005c0020` (D:L475994) and the
  kit's frame `FUN_005c0fd0` twice (D:L476624, D:L476638). `FUN_005c0020` fires only the item it is given, and its
  three callers give 0x97 (C4, D:L452055), 0x98 (the satchel, D:L452208) and 0x9a (the bomb, D:L451514), whose
  branches in `FUN_005be9a0` (types -0x69, -0x68, -0x66) come before the 'y' test -- so a throw is pushed only from the
  kit's frame, which the actor update calls (D:L417907; its one `jal`, 0x550a30), in `entity_post_tick` (`FUN_0029f1a0`
  -> slot +0x20, D:L145064-145071; `FUN_001ec480` D:L50925, D:L50929). The release is the player controller's
  (`FUN_00594cf0` sets the fire state in `entity_pre_tick`, research 85 §2); the push is the kit's frame's the same
  frame, after the driver. **So the throw's cut and its uncut end read the phase a game frame behind the push's clock,
  as the still reload's** (PAR-67's clock, `(t - G) / (P x e)`), on the port's hold clock `h.t` from the release's
  command (the page lays the hold at the release, `matchThrow` `throwStart` -> `WalkMode.hold`; the room's mover holds
  on that command's bit).
- **The throw's end is PAR-69's test.** The driver asks `FUN_00582540` (D:L418193), which answers 1 on the first passing
  `FUN_0028c6e0` (D:L442925) when the play has no end callback at `+100` and its type is none of those the function
  names (D:L442996-443127). `FUN_005802b0` sets no callback (D:L441899-441903: only the release time); `FUN_00588bc0`
  sets one only for `Land forward`, `Land backwards`, the three swaps (0x35-0x37), `Rifle -> Launcher`,
  `Pistol -> Launcher`, `Stand -> Turret` and `Pistol stand -> Turret` (D:L446304-446398); and the types
  D:L442996-443127 names (by the strings `FUN_005e4f90` registers them under, D:L495304-495414: `Ladder -> slide`,
  `Fall forward`, `Fall backwards`, `Land forward`, `Land backwards`, `dive_to_prone`, the turret's, the launcher's, the
  buddy carry's, `Stab`, `Stabbed`, the restraints'; and 0x2c, 0x2e, 0x35-0x37 by index) hold no throw
  (`GetThrowAnim`'s types, D:L441782-441850, are `DAT_003deb20` ... `DAT_003debe8`, registered as `Peek right toss`,
  `Peek left toss`, `Throw grenade`, `Toss grenade`, `Crouch throw grenade`, `Prone throw grenade` and `Prone toss
  grenade`, D:L495211-495236). So the uncut throw comes off at
  `(t - G) / (P x e) + G / (2 x P x e) > e` (`P` = `Q`, the playback: no `ReloadTime` on a throw) -- PAR-69's
  `reloadPlayedOut`.
- **C4's plant: the controller's tick, before the driver.** `Put on wall` (0x3e; the pistol's 0x83) is pushed by
  `FUN_005be9a0`'s C4 branch (-0x69, D:L475420), reached only through `FUN_005c0020(..., 0x97)` (D:L452055; C4 is
  never taken up from its slot, research 94 §C5.1, `equipment.ts`, so the kit's frame does not fire it) from
  `FUN_00592d50`, the Action button's handler -- `CSealCtrl`'s slot +0x78 (the word at 0x669528), called by the player
  controller's tick `FUN_00594cf0` (D:L453222, D:L453243), which is `CSealCtrl`'s slot +0xc (the word at 0x6694bc) and
  runs from the pad's copy `FUN_00551ec0` (D:L418526), `entity_pre_tick`. **So C4's push lands before the frame's
  driver: the push's own clock** (PAR-67's bot's case: the first driver tick that sees the clip is the push's own
  frame's). Its `NoInterrupt ()` is bare: no cut to move. Its end: see "found" below.
- **`Place claymore`: both passes, and one unread.** Pushed (`FUN_0057d540(actor, DAT_003deb48, 0)`) by the claymore's
  (-0x67, D:L475322) and the PMN's (-0x62, D:L475354) branches -- from the kit's frame (they are fired from the hand;
  `FUN_005c0020` never gives 0x99 or 0x9e): after the driver; by the bomb's plant (-0x66, D:L475481), reached through
  `FUN_005c0020(..., 0x9a)` (D:L451514) from `FUN_005920c0`, the plant's hold timer `+0x160` running out in the
  controller's tick (D:L453273; its one `jal`, 0x595684): before the driver; by the satchel (-0x68, D:L475371) from the
  Action button (D:L452208): before; and by the bomb's drop, `FUN_0059ddb0` (D:L457611) from the bomb's state handler
  `FUN_002c1c30` (D:L163962), whose pass is not read. The port lays all of them as one hold code, `seal_place_claymore`
  (the bomb's plant and drop through `bombPage.ts` `startOwnClip`, the claymore's through `matchThrow` `throwStart`),
  and the room's mover takes the code alone off the command (`./net/moverSim` `holdOf`): which push laid it is not on
  the wire. **So `seal_place_claymore` keeps the push's own clock** -- right for the bomb's plant, a game frame early
  for the claymore and the PMN (their first cut would be the 146th command against the port's 144th, their uncut end
  the 158th against the 157th) -- until the hold's source can reach the room (below).
- **The detonator** lays no hold: `CZKit_DetonateRemoteExplosives` plays no SEAL clip (`HOLD_CLIPS`' header). The
  brief's "the detonator's" hold has no entry to place.
- **Built** (room and page together, PTW.R3; the room's holds ride the mover). `viewer/src/mover.ts`: PAR-67's
  reload-only set generalised: `RELOAD_HOLDS` becomes `LAGGED_HOLDS` -- the four reload holds and the eight throws
  (`seal_throwgrenade`, `seal_tossgrenade`, `seal_crouch_throwgrenade`, `seal_prone_throwgrenade`,
  `seal_prone_tossgrenade`, `seal_toss_rlean`, `seal_toss_llean`, `seal_p_tossgrenade`) -- which `holdCut`
  (`h.t - RELOAD_PUSH_LAG`) and `runHold` (`reloadPlayedOut`) read; `RELOAD_PUSH_LAG` and `reloadPlayedOut` keep their
  names (the reload's lock reads them; `reloadLock.ts` unchanged). The smaller change: one set, no new argument on
  `hold`. The counts, the stick held past 0.1 from the release's command (first cut) and at rest (uncut end), on the
  port's 60 Hz commands counted from the one that lays the hold:

  | clip (playback, keys, `NoInterrupt`) | first cut, the push's clock | PAR-70 | uncut end (the last key) | PAR-70 |
  |---|---:|---:|---:|---:|
  | `seal_throwgrenade` (1.6, 28, 0.49) | 46 | 48 | 90 | 91 |
  | `seal_tossgrenade` (1.6, 30, 0.75) | 70 | 72 | 90 | 91 |
  | `seal_crouch_throwgrenade` (1.1, 19, 0.8) | 51 | 53 | 60 | 61 |
  | `seal_prone_throwgrenade` (1.6, 27, 0.9) | 84 | 86 | 90 | 91 |
  | `seal_prone_tossgrenade` (1.1, 27, 0.9) | 58 | 60 | 62 | 63 |
  | `seal_toss_rlean` (1.25, 35, 0.9) | 66 | 68 | 71 | 72 |
  | `seal_toss_llean` (1.2, 28, 0.9) | 63 | 65 | 67 | 68 |
  | `seal_p_tossgrenade` (2.0, 30, 0.8) | 93 | 95 | 113 | 114 |
  | `seal_place_claymore` (2.7, 55, 0.9) | 144 | 144 (kept) | 157 | 157 (kept) |
  | `seal_put_onwall`, `seal_p_put_onwall` (2.5, 42, none) | never | never | 143 | 143 (kept) |

  The grenade's busy tail (`grenade.ts` `followBody`) ends with the mover's hold, so it moves with it on the page; the
  room's mover is the same `Walker`. The throw's pose (`matchThrow`, `throwPoseEnds`) ends on a cut with the hold but,
  uncut, on its own clip clock (`throwPoseEnds` is false on `'complete'`) -- one command before the hold's lagged end
  now (the 90th against the 91st), the page's look only (PAR-70's review, F2; the counts unaffected). Tests: `moverHold.test.ts`
  (PAR-70: the eight throws' cut and end, the plants' kept; the standing throw's cut the 48th, was the 46th; each
  throw's `NoInterrupt` on the lagged phase; PAR-69's toss off on the 91st, was the 90th; the serial case run a frame
  past the last key), `roomHoldOverHold.test.ts` (PAR-70: the room's and the page's throw cut on the 48th command and
  off uncut on the 91st together; the claymore's 144th and 157th and C4's 143rd kept).
- **Found, not built (for the controller):**
  - **The claymore's and the PMN's placing lag; the bomb's plant does not.** One hold code, `seal_place_claymore`, for
    pushes on both sides of the driver. Built right, the hold's lag is the push's: the page knows it (`matchThrow` for
    the claymore and the PMN, `bombPage.ts` for the bomb), the room does not -- the command carries the code alone
    (`holdOf`) and the wire's four hold bits are full (15 codes, `HOLD_SHIFT`). It needs the hold's source on the wire
    or the room's own knowledge of the plant (`room.ts`, `protocol.ts`, `netPage.ts`: outside this row's brief). The
    bomb's drop's pass (`FUN_002c1c30`'s caller) is unread.
    *Read and built by PAR-74 (below): the room's own knowledge of the plant (its bomb's placement), no wire change; the
    claymore's and the PMN's lag (146th, 158th); the drop before the driver for a host's dropper
    (`BOMB_DROP_PUSH_PASS_READING`).*
  - **A pre-driver push's uncut end is half a frame early.** For a push before the driver the end test reads the phase
    on the push's own clock plus half the clip's step: off at `t / (P x e) + G / (2 x Q x e) > e`, i.e.
    `t > P x e^2 - G x P / (2 x Q)` -- one command before the port's last key for C4's plant (the 142nd against the
    143rd) and the bomb's plant (`seal_place_claymore`: the 156th against the 157th). Not built: the brief moves the
    holds after the driver only. With it, not read: C4's play carries an end callback (`+100` = `LAB_005bfe40`, its
    trigger phase 0.45 at `+0x60`, D:L475443-475444); if it is still set at the end test, `FUN_00582540` runs it and
    answers 0 that tick (D:L443131-443141), so the pop comes a driver tick later. Where the trigger clears it
    (D:L438999, D:L439058, D:L439083) against the end is not traced.
    *Read and built by PAR-74 and PAR-75 (below): the callback is run and cleared at its 0.45 key, so C4 ends on the
    142nd and the bomb's plant on the 156th, room and page.*
  - **A bot's and a remote's throw**: the room runs neither.

#### PAR-72: the cut on the end's own tick -- read: the end wins, the port already matches (PARITY-2, 2026-10-13)

Reads PAR-69's "found, not built" bullet "The order on the end's own tick" (above, kept as written and marked
superseded). Status: **reading, pending review.** Source inspection of the decompilation (the bytes the header pins); the
clips' fields as in the tables above; no game, capture or browser was run.

- **The cut's test asks the end first.** The ground driver asks the cut first (`FUN_00550ef0` D:L418180), and asks the
  end only when nothing cut (D:L418192-418193). But the cut's test `FUN_00587c20` starts with the end test itself:
  `FUN_0028c6e0` on the frame's dt `actor+0x2e0` and the stack's top (`actor+0x1c0` through `FUN_00555170`)
  (D:L445526-445527). When that answers 1 the function answers 0, no cut (D:L445528, D:L445572-445573), before it reads
  any `NoInterrupt` or the controller (D:L445529-445565). `FUN_00582540` then asks the same test on the same two
  arguments (`piVar12[0xb8]` = `actor+0x2e0`, `piVar12 + 0x70` = `actor+0x1c0`, D:L442924-442925).
  - Between the two calls the driver writes neither the phase `+0x1c` nor the dt. D:L418182-418189 read the stick
    (`FUN_001b3620`, a bare absolute value, D:L32992-32996) and a flag bit (`FUN_005551a0`, D:L419962-419966).
  - So the two answers are one. **On the tick the end test first passes, the stick cuts nothing**: `bVar4` stays
    false, `FUN_00582540` answers (1 for the reload's and the throws' plays, PAR-69's and PAR-70's reads), and
    `FUN_005870e0` pops the play uncut (D:L418203).
  - The carried overlay's branch needs the cut (`if (bVar4)`, D:L418204), so **nothing carries on**. This holds for
    the families that carry (`CARRIES_ON`, PF.R37: the rifle's, the pistol's and the m203's, not prone,
    D:L418205-418225) as for the others.
- **The lock on the end's tick against the tick before** (the port's commands from the push, PAR-69's end):
  - **Pushed on the end's own tick, the reload ends uncut.** No overlay is carried, and the lock is the uncut one:
    in the original the pop, in the port its own timer (`reloadUntil`; PAR-69's "the reload's lock" bullet, left).
  - **Pushed on the tick before, it is still cut, and the carrying families carry the overlay from the lagged
    phase:**

    | reload | cut on | overlay carried | cut lock ends on | uncut end, lock |
    |---|---|---|---|---|
    | `seal_reload`, M4A1 standing | 92nd | 0.0480 s (3 commands) | 95th | 93rd; the timer's 95th (96 less a tick), the same command |
    | `seal_crouch_reload`, M4A1 | 107th | 0.0522 s (4 commands) | 111th | 108th; the timer's later end |
    | `seal_reload`, M60E3's `ReloadTime` 3 | 172nd | 0.0397 s (3 commands) | 175th | 173rd; the timer's 179th |

    The M60E3's row is where the order would show: a cut on the 173rd would have ended the lock on the 175th.
- **The port already matches** in all three places, so nothing is built.
  - `reloadCutAt` (`viewer/src/reloadLock.ts`) answers null where `reloadEnded` holds: its played-out bound, PAR-69.
    That bound is `FUN_00587c20`'s refusal, read on the same lagged end test. The room's `cutAt` (`room.ts`) and the
    page's `StillReloadLife.ranWith` both ask it, and both also test the end first.
  - The mover runs `runHold`'s end (`runClocks`, `mover.ts`) before `holdCut` in `step60`, so a hold that comes off
    on a tick is never cut on it. This holds for every hold: the lagged reloads and throws (`reloadPlayedOut`) and the
    plants on their own end.
  - Tests (pins; their RED run was against a temporary cut-first mutation of the four files, reverted before the
    GREEN run):
    - `moverHold.test.ts` (PAR-72): every lagged hold and the claymore's placing, pushed on its end's tick, comes off
      'complete' on it; pushed on the tick before, 'cut' there.
    - `stillReloadLife.test.ts` (PAR-72): `reloadCutAt` is null on every command the end test passes and cuts the one
      before it. The standing reload's 92nd and 93rd commands, and the M60E3's 172nd and 173rd.
    - `roomReloadLock.test.ts` (PAR-72): the crouched reload pushed on its 108th command, its hold 'complete', its life
      gone, its lock its own timer; pushed on its 107th, cut there, the lock ending on the 111th.
- **Found, not built (for the controller):**
  - **The standing swap is asked without `FUN_00587c20`.** The driver's cut condition lets type 0x35 through whatever
    the test answers (`|| (sVar1 == 0x35)`, D:L418181), so no `NoInterrupt` and no end refusal. That type is the
    standing swap the driver carries on as the moving swap's overlay (D:L418227-418245; the port's `swapStand`). On the
    swap's end tick a stick past 0.1 may therefore cut it in the original. The port's mover ends the action in
    `runClocks` before `interrupted`, so it never cuts there.
    - Not read: `FUN_00582540`'s answer for the swap on that tick. `FUN_00588bc0` gives the three swaps an end
      callback (D:L446304-446398, PAR-70), which `FUN_00582540` runs (D:L443131-443141), leaving the answer as it found
      it. *Corrected by PAR-72's review:* the swaps' own branch (0x35-0x37, D:L442996-443003) calls `FUN_005a60d0`
      without setting the answer; the branches that set 1 (D:L443097, D:L443112, D:L443129) test `FUN_00577e40`
      (`+0x534`, D:L437404-437409) against other types (D:L495304, D:L495312, D:L495323) and act on the linked
      object at `+0xeac` -- so on this reading the swap more likely answers 0 on its end tick and pops a tick later
      (not read; PARITY-2 PAR-80).
      *Superseded by PAR-80's read (below): the callback is not there at the end test -- the advance runs it and clears
      `+100` on the frame the phase crosses its key (`FUN_0057a330` D:L438995-439003), long before the stop -- so
      `FUN_00582540` answers 1 (D:L443131-443132) and the swap pops on its end tick, not a tick later.*
    - The port's swap clock against its end test is also not read. Outside this row (the action's clock, not the
      hold's). *Read and built by PAR-80 (below): the end test on the push's own clock, a command before the last key.*
  - **A play with an end callback** (C4's `Put on wall`, PAR-70's "found"): from the end test's first pass the cut
    stays refused (`FUN_00587c20` asks the test, not the callback). If `FUN_00582540` answers 0 that tick, the pop
    comes a tick later, uncut. C4's `NoInterrupt ()` is bare, so no cut is lost.

#### PAR-73: the page's pose asks the cut up to the pop -- read and built (PARITY-2, 2026-10-13)

Reads PAR-69's "found, not built" bullet "The page's pose" (above, kept as written and marked built). Status:
**reading, pending review.** Source inspection of the decompilation (the bytes the header pins); the clips' fields
through the repository's readers (`simClipsFromBytes` over the tracked `MOTION_P.ZAR` and `READERC.ZAR`, with
`reloadLifeSpec`, `reloadCutAt` and `reloadEnded` -- the room's own helpers -- run command by command); no game, capture
or browser was run.

- **The drawn clip until the pop.** `FUN_0028c4f0` clamps a one-shot's phase (flag 0x40 clear) at its stop `+0xc`, the
  play's (n-1)/n (D:L134260-134266), so a still reload's play is drawn at key n-1 from its last key until the driver's
  end test pops it (`FUN_00582540` D:L418193 -> `FUN_0028c6e0` D:L134283-134308; `FUN_005870e0` D:L418203). Until the
  pop it is the main channel's play, so its `NoPitchtwist` holds (`FUN_00587a30`, research 150). The body's cross-fade
  to the next play starts at the pop, not at the last key.
- **The gap, command by command** (from the clip's first command, as the room's `cutAt` counts it; the last key at
  `P x e^2`, the pop PAR-69's; standing, crouched and prone; no `ReloadTime`, so `P` = `Q`). "Cut on the gap" is the
  room's lock from a stick on the one command between them; "uncut" is the room's own timer, `round(P x 60) - 1`:

  | family | stance | clip (keys, playback) | last key | pop | cut on the gap: the lock ends | uncut | moved |
  |---|---|---|---:|---:|---|---:|---|
  | rifle | stand | `seal_reload` (45, 1.6) | 92 | 93 | 95 (carried) | 95 | no |
  | rifle | crouch | `seal_crouch_reload` (28, 1.9) | 107 | 108 | 111 (carried) | 113 | 2 commands |
  | rifle | prone | `seal_prone_reload` (30, 1.7) | 96 | 97 | 96 (ends) | 101 | 5 |
  | pistol | stand | `seal_p_reload` (26, 1.8) | 100 | 101 | 104 (carried) | 107 | 3 |
  | pistol | crouch | `seal_p_crouch_reload` (29, 1.7) | 96 | 97 | 100 (carried) | 101 | 1 |
  | pistol | prone | `seal_p_prone_reload` (31, 1.7) | 96 | 97 | 96 (ends) | 101 | 5 |
  | m203 | stand, crouch | `seal_reload_m203` (37, 1.3) | 74 | 75 | 78 (carried) | 77 | no |
  | m203 | prone | `seal_reload_m203` (37, 1.3) | 74 | 75 | 74 (ends) | 77 | 3 |
  | shotgun | stand, crouch, prone | `seal_reload_shotgun` and its two (18, 16, 14; 1.6) | 86, 85, 83 | 87, 86, 84 | 86, 85, 83 (ends) | 95 | 9, 10, 12 |
  | pump (after-shot) | stand, crouch, prone | `seal_pump_shotgun` and its two (18, 13, 22; 0.9) | 49, 47, 50 | 50, 48, 51 | 49, 47, 50 (ends) | 53 | 4, 6, 3 |

  - **Which locks the gap moves:** every family and stance but the standing rifle and the standing or crouched m203,
    whose carried tail reaches the timer's own end (a cut never lengthens the lock, `cutAt`). The brief named the
    pistol; the families that carry nothing on (prone, the shotgun's, the pump) move the most, since the cut ends their
    lock at once.
  - **The page before PAR-73:** the pose answered no cut on that command, so the page's `Fire` kept the start's length:
    later than the room by the "moved" column, never earlier. A `ReloadTime` (the M60E3's 3, the Spas
    12's and the JACKHAMMER's 2) puts the pop on the last key's own command (PAR-69's table): no gap there.
- **Built** (room unchanged: its `cutAt` already asks up to the pop). `viewer/src/weaponPose.ts` `WeaponPose.step`: a
  still clip's play is over at `reloadEnded` (the room's helper, on the clip's own `playback`, kept as
  `ReloadRun.playback`), not at its drawn last key, so the cut is asked up to the pop with the end first (PAR-72's
  order); the fade out starts at the pop (`ReloadRun.outAt`: the pop's frame, as a cut's cross-fade starts on its own
  frame) and is measured from it. The overlay's end is unchanged (freed at its last key, `FUN_0028d170` D:L134737). The
  drawn sampling is unchanged: key n-1 is held from the last key (`frameOf`'s clamp). `play.ts` is not changed.
- **Tests:** `reloadRun.test.ts` -- "PAR-73": a pistol still reload pushed on its 100th command (between the last key
  and the pop), the real `Room` on the disc's clips cutting it there (its lock to the 104th; uncut the 107th) and the
  page's `Fire` one margin tick after (105, not 107; uncut 107, the room's own command), the uncut pose at key 25 and weight 1 on the 100th and
  the 101st (the pop), fading from the 102nd; the shotgun's (the room's 86th, the page's 87th, not 95) and the standing
  rifle's control (95 either way, room and page). The uncut still reload's fade test now holds the last key at full weight with the
  twist off on the 92nd frame and fades from the 93rd.
- **Found, not built:** where a cross-fade's first frame lands against the pop (progress 0 on the pop's frame or one
  frame's advance, `FUN_0057a330` D:L418454 runs after the pop) is the animator's, not read here; the pose follows the
  cut's existing convention (the snapshot on its own frame, `blendElapsed` 0).

#### PAR-80: the standing swap on its end's tick -- read and built (PARITY-2, 2026-10-13)

Reads PAR-72's "found, not built" bullet "The standing swap is asked without `FUN_00587c20`" (above, kept as written,
its two sub-bullets marked). Status: **reading, pending review.** Source inspection of the decompilation (the bytes the
header pins) and of the game ELF's bytes (`game/disc/socom2_game.elf`, read-only): the action-type name table at
0x661060 (index 0x35 `Rifle -> Pistol`, 0x36 `Crouch rifle -> Pistol`, 0x37 `Prone rifle -> Pistol`) and the names
`FUN_005e4f90` registers the types `FUN_00582540` tests under (D:L495304-495414: `Stab`, `Stabbed`, the restraints', the
buddy carry's, `Fall forward`, `Fall backwards`, `Land forward`, `Land backwards`, `dive_to_prone`, `Ladder -> slide`,
the launcher's and the turret's); the clips' fields as in §10.3. No game, capture or browser was run.

- **The 0x35 bypass skips only the use of the cut test's answer.** The driver reads the top's type before the tick's
  work (`sVar1`, D:L418116) and, the top unchanged and not looped (D:L418174-418176), still calls `FUN_00587c20`
  (D:L418180); its condition is `(answer && top+0x2b != 8) || sVar1 == 0x35` (D:L418181). For 0x35 neither the answer --
  the end test first (D:L445526-445528, PAR-72), then the `NoInterrupt` (D:L445550-445556) -- nor the `+0x2b` test
  counts. The stick test itself is the common one (the three axes past 0.1, D:L418182-418186), and the end question
  (`FUN_00582540`, D:L418192-418193) is still asked only when nothing cut. So the standing swap is cut by the stick on
  any driver tick it is on top, its end tick included; nothing else is skipped.
- **The callback's answer: 1, on the end tick.** `FUN_00588bc0` arms the three swaps' key callback at the push
  (D:L446304-446398: 0x35 at 0.72, 0x36 at 0.82, 0x37 at 0.62; §10.2). The advance runs it on the frame the phase
  crosses the key and clears `+100`, `+0x60` and `+0x68` (`FUN_0057a330` D:L438995-439003, `FUN_0028c7c0` the crossing,
  either direction). Every key lies well inside the clip (forward from 0 to the stop e, reversed from e to 0), so it is
  crossed long before the end test first passes. There `FUN_00582540` (D:L442925 the test) takes the swaps' branch,
  which mounts the final weapon (`FUN_005a60d0(seal, 2|1, 0)`, D:L442996-443003) and sets no answer; none of the later
  types it tests is a swap (`FUN_00577e40` compares the actor's `+0x534`, D:L437404-437409, which the push set from the
  swap's type, D:L446298-446299); and with `+100` already 0 it answers 1 (D:L443131-443132). Two gates before that
  answer hold for a swap on the ground (PAR-80's review, 2026-10-13): the play's `+0x2a` (D:L442987-442991 answers 0
  on 1 or 2) is 0, zeroed at the push (`FUN_0028cc10` D:L134467; only the stance pushes at D:L440489/440505 set it to
  1); and the actor's `+0x1061` bit 1 (D:L443049 answers 0 when set) is clear, set only by the airborne pushes
  (D:L440727, D:L440824), and a swap is refused in the air. The driver pops the play
  there (`FUN_005870e0`, D:L418203). PAR-72's review read "more likely 0, a tick later" on the callback still being set;
  it is not.
- **Its pop tick: the end test on the push's own clock.** The swap is pushed before the driver, on its press's own
  frame: the press is read by the player controller's tick (`FUN_00594cf0`, through `FUN_00551ec0` D:L418526; research
  211 §2 steps 1-2 set the kit's pending bit), and the same pad copy then runs the raise tick (`FUN_005dfc80`,
  D:L418611), whose `FUN_005c1660` (D:L494228) calls `FUN_005a64c0` (D:L476734), which pushes the swap
  (`FUN_00588bc0(seal, 0x35, 0, 0, 0)`, D:L461952; reversed D:L461974-461988). `FUN_00551ec0` is `entity_pre_tick`
  (PAR-64, research 230 §5.2.3), so the play is on the push's own clock, as C4's plant (PAR-70). The end test
  `FUN_0028c6e0` (D:L134283-134308) adds half the clip's step: off at the first driver tick with `t / (P x e) + G / (2 x
  P x e) > e`, i.e. `t > P x e^2 - G/2` (reversed the same: the phase from e down, `- G / (2 x P x e) < 0`). On the
  port's commands counted from the press's own (the swap started, then that command's tick):

  | clip (keys, playback) | last key `P x e^2` | the end test passes past | port before | PAR-80 |
  |---|---:|---:|---:|---:|
  | `seal_rifle2pistol`, 0x35 (32, 1.32) | 1.2388 s | 1.2221 s | 75 | 74 |
  | `seal_crouch_rifle2pistol`, 0x36 (23, 1.0) | 0.9149 | 0.8983 | 55 | 54 |
  | `seal_prone_rifle2pistol`, 0x37 (38, 1.8) | 1.7065 | 1.6898 | 103 | 102 |

- **The cut on the end tick.** On the 74th command a stick past 0.1 cuts the standing swap (above): `bVar4`, the pop
  with the cut (D:L418203), then the carried overlay -- `Moving rifle -> Pistol` (`DAT_003dec68`) on the second channel,
  kind 6 forward or kind 5 reversed by the play's reverse bit, its clock from the stored phase (the stored phase
  D:L418187, the reverse bit D:L418189, D:L418227-418249; §10.2). `FUN_00582540` is not asked, so the final mount waits
  for the overlay's own last key (`FUN_00579ef0`, research 211 §2 step 6).
- **The crouched and prone swaps take the common path.** 0x36 and 0x37 are not in the bypass: `FUN_00587c20` gates them,
  and their `NoInterrupt ()` is bare (1, `ACTION_CLIPS`), so the stick never cuts them; they pop on the same end test
  (the table), the stick held or not.
- **The swap's other effects.** The weapon in hand (`m_item`) changes at the swap's start (`FUN_005a7260`, D:L461950;
  research 211 §2), the hand mount at the callback's key (the advance's crossing; `kit.ts` `handOffOf`, §10.4), and the
  final mount at the uncut pop (`FUN_005a60d0` in `FUN_00582540`'s swap branch, D:L442996-443003) -- on the pop's tick,
  not at a key. The fire lock (`FUN_005a7980`, D:L462482-462499) holds while the actor's type `+0x534` is a swap's or
  the second channel holds `DAT_003dec68`; the pop's `FUN_00589aa0` rewrites `+0x534` from the new top (D:L446518,
  D:L446525). So the lock ends at the uncut pop, or, cut, with the overlay.
- **The port before PAR-80** (the room rides the page's mover, `MoverSim`; one `Walker` for both):
  - Every swap's action came off at its last key (`runClocks`, `a.t >= seconds`): one command late uncut, room and page
    alike -- the swap's life, the room's fire and swap gates (`swapProgress() !== null`) and the page's kit (`Kit.frame`
    finishes when `swapProgress()` goes null) one command long.
  - On the port's own end tick (the 75th) it ended in `runClocks` before `interrupted` asked the stick, so it never cut
    there; on the 74th, the original's end tick, it was still on and the stick cut it -- the right answer on that
    command, by the late end. Moving the end alone would have lost it.
- **Built** (room and page together, PTW.R3; one file, the room riding it). `viewer/src/mover.ts`: `swapPlayedOut(t,
  playback, frames)` beside `reloadPlayedOut`, the end test on the push's own clock; `runClocks` ends the three swaps on
  it, and leaves the standing one for `interrupted`'s cut when the stick (`stickCuts`, the stick test `interrupted`
  already made, now a method) passes on the ground -- `step60` passes it in; the backlog's `elapse` reads no stick
  (LOW-1) and ends it complete. Every other one-shot keeps PAR-72's end before the cut (its last key in `runClocks`
  first). Tests: `walk.test.ts` (PAR-80: the three swaps both ways off complete on the 74th, 54th and 102nd, on the
  73rd, 53rd and 101st still on; `swapPlayedOut` either side of `P x e^2 - G/2`; the stick and the turn on the standing
  swap's 74th cut it into the overlay, both ways; the crouched and prone with the stick held off complete on their pop,
  no overlay), `room.test.ts` (PAR-80: the room's standing swap over on its 74th command uncut; cut on it by the stick,
  the overlay then running to its own end; the crouched one with the stick held over on its 54th).
- **Found, not built (for the controller):**
  - **The carry's clock** (§10.5, owed and pinned there as `it.fails` in `actionStack.test.ts`): on the end tick the
    original carries the overlay from the stored phase, 0.9645 for the standing swap (0.0447 s left, the 77th command),
    the port from its normalised `t / (P x e^2)`, 0.9956 (0.0055 s left, the 75th). The end-tick cut takes the port's
    existing carry; changing it moves every cut's overlay end, which is §10.5's row.
  - **The other one-shots' uncut end.** `ACTION_CLIPS`' other actions still come off at their last key; each one's push
    pass and end callback (the landings', `Land forward` and `Land backwards`, are among `FUN_00582540`'s named types)
    is not read here, and the brief keeps them.
  - **C4's trigger (PAR-70's "found").** The same crossing (D:L438995-439003) runs and clears a play's `+100` at its
    `+0x60`; C4's 0.45 (D:L475443-475444) lies inside its clip, so on this reading it too is clear by the end test --
    not re-read for C4 here. *Read for C4 by PAR-75 (below): cleared at the key, `FUN_00582540` answers 1; C4 ends on
    the 142nd.*

#### PAR-74 and PAR-75: the placings on their own push's pass -- read and built (PARITY-2, 2026-10-13)

Reads PAR-70's two "found, not built" bullets (the claymore's and the PMN's lag; a pre-driver push's uncut end) and
PAR-80's "C4's trigger" bullet (above, kept as written and marked). Status: **reading, pending review.** Source inspection
of the decompilation (the bytes the header pins); the clips' fields as in PAR-70's table (`HOLD_CLIPS`, pinned against
the disc's `motion.rdr` and `MOTION_P.ZAR` by `moverHold.test.ts`). No game, capture or browser was run.

- **Each placing's push, and its pass.** Every placing branch of `FUN_005be9a0` pushes through `FUN_0057d540` (PAR-70: on
  to `FUN_00588bc0`, the initial skip taken):

  | placing (the item's type byte) | push | reached from | pass |
  |---|---|---|---|
  | the claymore (-0x67) | `Place claymore` (`DAT_003deb48`), D:L475322 | the kit's frame `FUN_005c0fd0` (D:L476624, D:L476638), the actor update's, `entity_post_tick`; `FUN_005c0020` never gives 0x99 (PAR-70) | after the driver |
  | the PMN (-0x62) | `Place claymore`, D:L475354 | the same (`FUN_005c0020` never gives 0x9e) | after |
  | the bomb's plant (-0x66) | `Place claymore`, D:L475481 | the plant's hold timer `+0x160` run out in the player controller's tick: `FUN_00594cf0` D:L453273 -> `FUN_005920c0` D:L451505-451514 -> `FUN_005c0020(..., 0x9a)`; `entity_pre_tick` (D:L418526) | before |
  | the satchel (-0x68) | `Place claymore`, D:L475371 | the Action button, D:L452208 (`FUN_005c0020(..., 0x98)`) | before; no satchel item in the port |
  | C4 (-0x69) | `Put on wall` (0x3e; the pistol's 0x83 by `FUN_0058c820`), D:L475420 | the Action button `FUN_00592d50` D:L452055 (`CSealCtrl` slot +0x78, from `FUN_00594cf0`) | before |
  | the bomb's manual drop | `Place claymore`, `FUN_0059ddb0` D:L457611 | below | before for a host's dropper; a peer's unread |

- **The bomb's drop** (the brief's open step). `FUN_0059ddb0` is a placing's clip -- `Place claymore`, pushed only where the
  actor's controller is not remote (D:L457606-457612) -- run by the bomb's state handler `FUN_002c1c30` for state 1
  (D:L163962), which `FUN_002c20c0` (D:L164082) and the shared state's callback `FUN_002c23b0` (D:L164158; registered by
  `FUN_0030ce80` D:L164261) call. A host's dropper: the Action (`FUN_00592d50` D:L452153) -> `FUN_0059dd30` ->
  `FUN_002c2090` (D:L457567) -> `FUN_002b9910`, which on the host runs `FUN_002c1f10` at once (D:L159496) -> `FUN_002c20c0`
  (D:L164040) -> `FUN_002c1c30` -> the push: all in the controller's tick, before the driver (the host's own scheduled
  `FUN_003d1f90`, priority 3.0 between `entity_pre_tick` 1.0 and `entity_tick` 4.6, D:L50922-50925, calls `FUN_002c20c0`
  too, D:L324553: before the driver either way). A peer's dropper: the request goes to the host as a message
  (D:L159489); the host's `FUN_0059ddb0` finds the peer's actor remote and pushes nothing; the peer pushes when the
  state comes back through `FUN_002c23b0`, whose pass in the frame (the network library's dispatch) is not read --
  `BOMB_DROP_PUSH_PASS_READING` (`'before'`, the host's, read; §7). *Was:* "The port plays no drop clip yet: the room
  names no manual drop on the wire" -- since the online-parity sweep's P25 (2026-11-03) the room names it (`dropWhy`,
  PB-1's option B) and `./bombPage`'s `dropped` starts the clip on this pass; the room's mover does not (LATER 659).
- **Each placing's clip and its end.** None of the three plays carries an end callback at the end test. The claymore's,
  the PMN's and the plant's branches set none (D:L475322-475330, D:L475354-475362, D:L475481-475488: only the kit's timer
  `+0x87c` -- 1.3 s for the claymore and the PMN, 2.25 s for the plant, `PLACEMENT_S`). C4's sets `+100` = `LAB_005bfe40`,
  `+0x60` = 0.45 (`0x3ee66666`) and `+0x68` = the kit's timer on the play `FUN_0057d540` returned (D:L475443-475445), and
  **the advance runs it and clears all three on the frame the phase crosses 0.45** (`FUN_0057a330` D:L438996-439003,
  `FUN_0028c7c0` the crossing) -- about the 66th command from the push, 76 before the end test first passes (PAR-80's
  reading for the swaps, now read for C4: PAR-75). At the end test (`FUN_00582540`, D:L442925 the test) neither `Put on
  wall` (0x3e, 0x83) nor `Place claymore` is a swap (0x35-0x37) or 0x2c (D:L442996-443008), nor one of the types it
  names through `FUN_00577e40` (D:L443010-443127; their names as `FUN_005e4f90` registers them, D:L495304-495414, PAR-70
  and PAR-80); the play's `+0x2a` is 0 from the push (`FUN_0028cc10` D:L134467) and the actor's `+0x1061` bit 1 is set only
  by the airborne pushes (D:L440727, D:L440824; the port refuses a hold in the air); with `+100` 0 it answers 1
  (D:L443131-443132) and the driver pops the play (D:L418203). So each comes off on the end test's first pass
  (`FUN_0028c6e0` D:L134283-134308) on its own pass's clock: after the driver `(t - G) / (P x e) + G / (2 x P x e) > e`,
  i.e. `t > P x e^2 + G/2` (PAR-69's `reloadPlayedOut`, `P` the playback: no `ReloadTime` on a placing); before it
  `t / (P x e) + G / (2 x P x e) > e`, i.e. `t > P x e^2 - G/2` (PAR-80's `swapPlayedOut`). The cut (`FUN_00587c20`,
  PAR-67): past `NoInterrupt` on `(t - G) / (P x e)` after the driver, on `t / (P x e)` before it. On the port's commands
  from the one that lays the hold (`t` = k / 60):

  | clip (playback, keys, `NoInterrupt`, callback) | `P x e^2` | pass | first cut | uncut end | the port before |
  |---|---:|---|---:|---:|---|
  | `seal_place_claymore` for the claymore and the PMN (2.7, 55, 0.9, none) | 2.6027 s | after | 146 | 158 | 144, 157 |
  | `seal_place_claymore` for the bomb's plant (the same) | 2.6027 s | before | 144 | 156 | 144, 157 |
  | `seal_put_onwall`, `seal_p_put_onwall` for C4 (2.5, 42, bare, `LAB_005bfe40` at 0.45, cleared) | 2.3824 s | before | never | 142 | never, 143 |

  The pistol's `Pistol place claymore` rides the rifle's code (`./grenade` `holdClipOf`; the same playback, keys and
  `NoInterrupt` on the disc), its pass the item's.
- **How each side knows the item** (the brief's route (a): no wire change). The command carries the hold code alone
  (`holdBits` / `holdOf`, the four bits full; the buttons a u16 on the frame) and the pass is the item's, so each side
  takes it from what it already knows:
  - **The page** by its layer: `./matchThrow`'s `throwStart` lays the claymore's and the PMN's placing (`./grenade`
    `startPlacing`) on the code's default, after; `./bombPage`'s `startOwnClip` lays the plant's with `PLANT_PUSH_PASS`
    (before) through `ownBombBody` -> `WalkMode.hold(clip, period, pass)` -> `Walker.hold`; C4's codes fix their own. The
    pass is kept with the command (PAR-37's `KeptCommand`, beside the period) for a run under the dance
    (`MoverSim.holdPass`).
  - **The room** by its bomb: its kit state holds no item in hand for the equipment (`Player.held` is the launcher's; a
    claymore's `throw` comes at its 1.3 s set-down, after the push's command), but its bomb holds the plant: the
    placement it began for that player (`BombAuthority`, `wire().hold` `{ kind: 'place', by }`) is the one the page
    hears and starts the plant's clip on. `Room.placingPass` (through `MoverSim.holdPass`, asked for
    `seal_place_claymore` alone) answers before to the first such code a player's command carries while his placement
    runs, once a placement (`Player.plantClipSince`); every other is the claymore's or the PMN's.
  - **A remote body** runs no hold clock of its own: the page draws another's placing from the body's hold code
    (`./remotePlayers` -> `./throwPose` `follow`), which the room's mover sets and clears, so it follows the room.
  - **The port's limit** (not a reading of the original; the planter alone, in a DEMOLITION round): a claymore's or a
    PMN's code from the planter on his placement's commands before the plant's clip -- the round trip between the room's
    commit and the page hearing it -- is taken as the plant's (the page then refuses its plant clip over the running
    placing and keeps the claymore's lagged), and the plant's clip reaching the room past the placement's 2.25 s (a page
    135 ticks behind) as the claymore's: the room's clock and the page's then part by one or two commands.
    *Widened by PAR-74's review (F1, 2026-10-13):* the limit is any placement for which the page lays no plant clip --
    the page's mover refusing it (a throw or still reload running, `holdOverHold`; in the air; `WalkMode.locked`) or a
    takeover mid-placement (a new `Player`'s `plantClipSince`, the new page's welcome suppressing the clip,
    `bombPage`): a later claymore's or PMN's code in that placement is then the plant's in the room (cut on the 144th, off
    on the 156th) and the claymore's on the page (146th, 158th). All rare; the deterministic fix is the hold's source on
    the wire, the same question as PAR-84.
- **The page's clocks beside the mover** (PAR-79's lesson). The bomb's page runs none: its hold bar is the room's hold
  (`BombWire.hold`). The kit's (`./grenade`): `placing.left`, the kit's timer to the charge set down (1.3 s; C4's at its
  callback, `C4_PLANT_SECONDS`), whose `throw` the room takes as the page sends it -- no room clock beside it; and
  `recover`, the busy tail to the clip's last key, which `followBody` ends earlier when the hold comes off: C4's now ends
  with the hold on the 142nd; the claymore's and the PMN's on the last key's 157th, a command before their hold's 158th,
  as the throw's (PAR-70: the 90th against the 91st). The room keeps no busy kit of its own, so nothing parts the two; a
  placing the page starts on the 157th asks the mover, which refuses it over the running placing on both sides alike
  (`holdOverHold`).
- **Built** (room and page together, PTW.R3; no wire change). `viewer/src/mover.ts`: `HoldPass`, `holdPassOf` (the code's
  pass; `asked` honoured for `seal_place_claymore` alone), `MoverHold.pass`, `Walker.hold(clip, period, pass)`, and
  `runHold` / `holdCut` on the hold's pass (after: `reloadPlayedOut` and the lagged cut; before: `swapPlayedOut` and the
  push's clock) -- `LAGGED_HOLDS` kept as the codes whose every push lags. `viewer/src/net/moverSim.ts`: `holdPass`
  beside `holdPeriod`. `viewer/src/walk.ts`: `WalkMode.hold`'s `pass`, kept with the command (`KeptCommand.pass`) and
  laid again in `rerunFrom`. `viewer/src/bombPage.ts`: `PLANT_PUSH_PASS`, `BOMB_DROP_PUSH_PASS_READING`, `startOwnClip`'s
  and `ownBombBody`'s pass. `match/src/room.ts`: `Player.plantClipSince`, `Room.placingPass`, `p.sim.holdPass` at the
  spawn. Tests: `moverHold.test.ts` (PAR-74 and PAR-75: the claymore's 146th and 158th, the plant's 144th and 156th, C4's
  142nd, the pass ignored for the other codes, `MoverSim.holdPass`; PAR-70's and PAR-72's pins and the claymore's 0.9
  bound moved beside their history), `walk.test.ts` (the walk's hold on its pass, one code on the wire, the pass kept),
  `bombPage.test.ts` (the plant's and the drop's clip `'before'`, `ownBombBody` handing it on),
  `roomHoldOverHold.test.ts` (the room's claymore 146th and 158th and C4's 142nd with the page's; on a DEMOLITION room
  the plant's clip off on the 156th, cut on the 144th, once a placement).
- **Found, not built (for the controller):**
  - **The manual drop's clip** (`BOMB_DROP_PUSH_PASS_READING`): when the room names the drop (`dropWhy`),
    `Room.placingPass` must answer its clip too, or the room lags it where the page does not. *The room names it since
    the online-parity sweep's P25 (2026-11-03); the answer is LATER 659.*
  - **The satchel** (-0x68, before the driver): no satchel item in the port.
  - **C4's charge set down on the page** (`C4_PLANT_SECONDS`, `./grenade`): the kit's timer zeroed at the callback's
    crossing, on the page's own clock from the hold's laying; whether that crossing's command matches the original's
    (the advance's phase on the push's own clock) is not read here -- the page's alone, the room taking the `throw`.

### 12.6 A throw let go on the run (PARITY-2 PAR-76, 2026-10-13)

The owner's playtest (an online round on MP7, the nightly 20261013-605d46b5a, before PAR-70): "running and throwing a
grenade caused a weird animation sometimes and a quick cancel (I think the original held you there)". This section reads
the running throw in the original against the port's. Status: **reading, pending review.** Source inspection of the
decompilation (the bytes the header pins) and of the game ELF's bytes (`game/disc/socom2_game.elf`, read-only: the
type names at 0x660778, 0x660788, 0x6617c0, 0x6618c0, 0x660758, 0x661f88, 0x661fa8, 0x661fb8 and 0x661508, and the
action-type name table at 0x661060); the clips' fields through the repository's readers (`motionTableFromArchive` over the tracked
`READERC.ZAR`). No game, capture or browser was run.

- **A running throw is the standing throw's push: the stack, not the second channel.**
  - The clip: `GetThrowAnim` (`FUN_0057fce0`) picks by the state `+0x174` (D:L441773). Standing (0) it reads the power
    and the aim alone, never the speed: `Throw grenade` (`DAT_003debc8`, the name at 0x660778) or `Toss grenade`
    (`DAT_003debe8`, 0x660788) (D:L441845-441872). Crouched (1) it reads the velocity (`+0x2c`, `+0x30`, `+0x34`
    squared, D:L441827-441830) against `DAT_00650578`: still, `Crouch throw grenade` (0x6617c0); faster, the standing
    `Throw grenade`. The port's `throwAnim` (`@s2u/scene`, `CROUCH_MOVING_SPEED_SQ`) is this table. It takes the
    ground's two axes only, and the port's walker has `vy` 0 on the floor, so the pick agrees there.
  - The push: `FUN_005802b0` calls `FUN_00588bc0(actor, type, +0x174, 0, 0)` (D:L441900). That sends a motion whose
    entry has `+0x4a` bit 2 (`BlendOverlay`) to the second channel (`FUN_00587780`, D:L446083-446085) and every other
    one onto the stack (`FUN_0028dc90`, D:L446292).
  - The disc: no SEAL throw or toss clip in `motion.rdr` has `BlendOverlay`, all are one-shots, and there is no moving
    variant. The SEAL's `BlendOverlay` clips are seven: `seal_mv_reload`, `seal_p_mv_reload`, `seal_mv_reload_shotgun`,
    `seal_mv_pump_shotgun`, `seal_mv_rifle2pistol`, `seal_mv_rifle2launcher` and `seal_mv_pistol2launcher`
    (`moverHold.test.ts`, PAR-76). `BlendTime` is none on the standing throws (the loader's 0.4) and 0.2 on
    `seal_crouch_throwgrenade`; `NoFire` is none on every throw.
  - **So the legs do not run on.** With a one-shot on top the ground driver runs no ground state (the `HOLD_CLIPS`
    header; `FUN_00550ef0` D:L418119-418151). The throw's root has one key, so the SEAL stops where it let go, as a
    throw from rest does: the port's hold (`moverHold.test.ts`, "a standing throw stops a run dead").
- **The original's hold is the port's.** The stick cuts the throw past its `NoInterrupt` on the lagged clock (PAR-70
  above: the 48th command for `seal_throwgrenade`, the 72nd for the toss). Nothing in the cut reads the speed, and
  nothing holds a run off longer:
  - The driver asks the cut only while the top is the play it read before its work (D:L418176). It skips a top whose
    `+0x2b` is 8 (D:L418173, D:L418181). The throw's `+0x2b` is the state `+0x174` at the push (`FUN_0028dc90`'s fourth
    argument, D:L441900): 0 to 3 in `GetThrowAnim`'s states.
  - `FUN_00587c20` refuses the cut on the end test (D:L445526-445528), and otherwise only in these cases:
    - An entry with flag 0x2 clear (D:L445532). The push sets it on every entry (D:L135173-135174).
    - Under the controller's slot +0x30 (D:L445536), the stance transitions (D:L445539-445545). By the action-type name
      table at 0x661060 these are 0x11 `Stand -> Crouch`, 0x13 `Crouch -> Prone`, 0x19 `Stand -> Prone`,
      0x63 `Pistol stand -> Crouch` and 0x64 `Pistol crouch -> Prone`; `DAT_003dec50` is `Pistol stand -> Prone`
      (0x6618c0). None is a throw.
    - Then the phase against the entry's `NoInterrupt` (D:L445547-445565). The axes the driver tests are the pad's copy
      (PAR-64): the run's stick, held.
  - After the pop the run resumes at the held stick, unramped. Under a one-shot the ground state does not ramp the
    stick, and `FUN_0057a330` copies the pad's axes into the ramp's last value (`+0x248`, `+0x24c`) on every driver
    tick (D:L438704-438706). So the ramp starts from the held stick: the port's `s.stickForward = forward` under the
    hold.
  - The jump stays refused while the throw is on top (`FUN_0057e1b0`'s looped-top test, D:L440805-440810), and a
    stance press waits (`FUN_00552ec0`, §2). Both are the port's (`moverHold.test.ts`, `Walker.retryStance`).

  **So "the original held you there" is the hold to `NoInterrupt`.** The standing throw lets go at
  0.46 x 1.6 x 27/28 = 0.710 s, and the stick may cut it from the 48th command (0.80 s), 0.09 s after the hand opens. A
  toss (power under 0.6, the aim's sine under 0.3) holds to 0.75: the 72nd command (1.2 s). The stick at rest plays
  either out to the 91st (1.52 s). The port has all three since PAR-70. On the owner's nightly (before PAR-70) they were
  the 46th, the 70th and the 90th: two commands (0.033 s) early for the cut, one for the end.
- **What the body plays.**
  - The push cross-fades from the pose on screen into the throw. `FUN_0028dc90` snapshots a blend under way
    (`FUN_0028e3e0`, D:L135215-135216) and sets the stack's blend to the throw motion's `+0x20`, its `BlendTime`
    (D:L135218-135220): 0.4, or 0.2 crouched. The port's `ThrowPose` fades its layer in over the same.
  - The run's play stays on the stack under the throw. `FUN_00588bc0` pops the stack for named types only -- 0x11, 0x12,
    0x13, 0x19, 0x1a, 0x21-0x24, 0x2a, `DAT_003def00`, `DAT_003deef8`, the ladder slides (`DAT_003def50`, `DAT_003def60`),
    "Step up" and "Climb medium" (`DAT_003dec80`, `DAT_003dec90`) (D:L446105-446291; the list completed by PAR-76's
    review) -- none a throw (0x31, 0x32, 0x7c, 0x7d). The covered play's clock stands: the driver
    advances the top alone (`FUN_0057a330` D:L438899-438901; the covered reload's, §11.1).
  - At the pop, the cut's or the end's (`FUN_005870e0` -> `FUN_00589aa0` -> `FUN_0028da00`), the stack snapshots the
    pose again only while a blend is under way (D:L135042-135043; at a 48th-command cut the push's 0.4 s blend is over,
    so none -- PAR-76's review). It cross-fades over the uncovered play's first motion's `BlendTime`
    (D:L135101-135103): none on `seal_run`, `seal_jog` and `seal_walk` (0.4), 0.5 on `seal_stand`. The uncovered play
    keeps its own phase, with the initial skip set (D:L135105-135108). The ground state then picks the locomotion for
    the stick (D:L445160-445169).
  - The port lays the throw as a pose layer over the live locomotion (`throwPose.ts`; `matchThrow.ts` `throwStart`), and
    the hold sets the walker's ground idle (`mover.ts` `step60`, the hold's branch). So beneath the fading-in layer the
    run cross-fades to the idle. After the cut the layer fades out over `BLEND_TIME_DEFAULT` (0.4, the same time) onto a
    locomotion coming back from the idle. On this read, the original lands on the run at its kept phase instead.
  - Whether the stack draws a covered play at all, and how its snapshot blend weighs against the top, is the stack's
    sampler: **not read here**. The port's choice is named `RUNNING_THROW_BODY_READING` (`throwPose.ts`,
    `'locomotion'`; §7, research 101). The pistol's upper-body throws keep the parts they lack from beneath
    (`PISTOL_ONESHOT_PARTS_READING`), which under the hold is the idle's legs.
  - *Read since by PAR-85 (§12.9; reading, pending review):* the stack draws its top alone -- a covered play is never
    sampled (`FUN_00577ea0` D:L437430-437455) -- and the push's snapshot (the pose drawn the frame of the push, the run
    at the phase its clock stops at) carries the legs into the throw by an eased weight; the pop draws the run again at
    its kept phase. A part the top's clip lacks is not written and holds its last drawn value. "The port's `ThrowPose`
    fades its layer in over the same" holds for the length, not the shape (linear, not the ease): §12.9.
- **The "weird animation", against the read** (each a candidate; none settled):
  1. **The legs under the blends** (`RUNNING_THROW_BODY_READING`). For 0.4 s after the release request and 0.4 s after
     the cut, the port's body mixes the throw with a run-to-idle and an idle-to-run cross-fade. In the original, on
     this reading, the mix is with the run frozen beneath. A frame-by-frame capture settles it. *(PAR-85, §12.9: read
     -- the snapshot of the run, never the covered play; the differences and the build rows there.)*
  2. **A throw let go in the air.** `Walker.hold` refuses a hold in the air (`mover.ts`; `moverHold.test.ts`, "a hold is
     refused in the air"). The throw's clip then plays over the fall with no hold, page and room alike, and the SEAL
     carries on. In the original, the push's gate `FUN_00589900` (D:L446425-446473) refuses in four cases:
     - online, with the actor's `+0x1061` bit 5 set (D:L446439-446440; the bit is not read);
     - over the knock types with `+0x1060` bit 4 set: `Fall forward`, `Fall backwards`, `Land forward` and
       `Land backwards` (0x660758, 0x661f88, 0x661fa8, 0x661fb8; D:L446441-446451);
     - over a top whose `+0x2b` is 8, unless it is one of the two falls (D:L446453-446462);
     - over `Slide` (0x661508) with `+0xe1` bit 4 set (D:L446463-446465).

     None of these names the jump or the fall, so on this reading the throw would go over them, and a landing's branch
     pops the top (`FUN_005af930` D:L466897-466901): a cut at the landing, a "quick cancel".
     - Not read whole: whether the air's top carries the mark 8; the air driver with a one-shot on top; the grenade's
       own release timer (`FUN_005802b0` stores it through its second argument, D:L441904, the kit's `+0x87c` from
       D:L475501) against that pop; whether `FUN_005c0ae0`'s gates let the release through in the air.
     - Found, not built. The case is a run off an edge more than 8 down (the port's airborne threshold, the mover's
       header) at the release. Whether MP7's ground reaches it is not measured.
     - *Read by PAR-86 (§12.8; reading, pending review): corrected.* The throw has its own gate before the kit's and the
       push's: `FUN_0059d830` answers 0 off the floor (D:L457369-457371), and both the controller's chase
       (D:L453478-453480) and the release request (D:L475491-475498) ask it. So the original pushes no throw in the air:
       the wind-up is held, its power frozen, to the update after the landing's, and no landing pops a throw. The port
       does the same since PAR-86 (`grenade.ts`). The text above is the first read, kept as it was.
  3. **The page's frame clock.** The layer steps on the page's frame time, the hold on 60 Hz commands, so under a
     throttled frame rate (Edge's Efficiency mode) both are coarse. That is the port's own drawing, not a parity
     question. If the retest sees the animation only when throttled, it is this one.
- **Built.** Nothing of the mover's, the room's or the pose's behaviour moves: the read settles no difference in the
  hold, the cut, the clip or the blend times. Pins, page and room together:
  - `moverHold.test.ts` (PAR-76): the disc's throws and the SEAL's seven overlays; a throw from a full run cut on the
    same command as from rest (the 48th, the toss the 72nd), the SEAL unmoved under it, off uncut on the 91st; the
    ground idle under the hold, the behaviour `RUNNING_THROW_BODY_READING` names.
  - `roomHoldOverHold.test.ts` (PAR-76): the room's mover and the page's from a full run, cut on the 48th and off uncut
    on the 91st, the room's body unmoved under the hold.
- **Owed.**
  - A capture of a running standing throw and a running toss, the stick held through the release, and one left at
    rest. It settles the frame the run resumes against the release (the 48th command on this read), and what the legs
    show through the two blends (`RUNNING_THROW_BODY_READING`).
  - The air's case read whole (2 above). *Read by PAR-86 (§12.8).*
  - The owner's retest on a nightly that carries PAR-70.
  - *What the retest should tell apart (2026-10-13, with PAR-85 and PAR-86 filed):* the "weird animation" and "quick
    cancel" have two candidates. **On the ground** (a running throw, both feet down; PAR-85, the legs under the
    blends): the hold is the original's since PAR-70, so a cancel there before about 0.8 s (a toss about 1.2 s) with the
    stick held is a finding. **In the air** (a throw let go off a ledge, a jump or a bump in the run -- the port's floor
    step is 8 units; PAR-86): the port holds nothing in the air, so the throw's pose plays its whole clip through the
    landing over the run, where the original pops it at the landing. A note of which -- feet down or a drop under the
    run -- settles which row the observation is.
    *Corrected by PAR-86 (§12.8):* the original pops nothing at the landing -- it starts no throw in the air at all; the
    wind-up waits for the floor. Since PAR-86 the port does the same, so on a nightly that carries it a throw that
    starts while the SEAL is off the floor is a finding, and one that goes off just after a drop is the original's.

### 12.7 The throw's sound, one per throw (PARITY-2 PAR-77, 2026-10-13)

The owner's playtest (an online round on MP7, the nightly 20261013-605d46b5a, Edge with Efficiency mode on, two
accounts): "the sound for throwing a grenade worked sometimes but not other times". This section reads what starts the
throw's sound in the original and in the port, kind by kind and page by page. Status: **reading, pending review.**
Source inspection of the decompilation (the bytes the header pins) and of the game ELF's bytes
(`game/disc/socom2_game.elf`, read-only: the format strings at 0x3fc528 `%s_zoom` and 0x3fc530 `%s_zoom_TT`, and
`DAT_003e1538`'s byte, 1); the disc through the repository's readers (`motionTableFromArchive` over the tracked
`READERC.ZAR`; `readKitTable` over the tracked `ZWEAPON.ZAR`; `soundFromDisc` over MP7 and MP2; `Zar` key walks over
every map's `CZANIM.ZAR` and `MZANIM.ZAR` and over `RUN/EXTZANIM.ZAR`, `RUN/MPZANIM.ZAR` and `RUN/UIZANIM.ZAR`); and a
byte scan of the disc's tree for `start_zoom` (no hit). No game, capture or browser was run.

- **The original's throw has two sounds, each with its own trigger.**
  1. **The release: the record's `FireAnimName`, in third person only.**
     - The kit's timer `+0x87c`, set by the release request (`FUN_005802b0`, D:L441904 from D:L475501), counts down in
       `FUN_005c1970` (D:L476883-476885). At 0 a hand grenade (`bVar7`) clears it (D:L476897-476901), and the local
       controller (`+0x2c` true, D:L477081) computes the launch and calls `FUN_005c5340` (D:L477133). So it plays once
       a throw, at the release (0.71 s into the standing throw), never at the press.
     - `FUN_005c5340` takes the slot's own record for category 0x79 (`FUN_005c67d0`, D:L479221; the launcher swap at
       D:L479422-479428 is not a hand grenade's). It picks the zAnim with `FUN_003d22b0(record, 0 < body+0x200)`
       (D:L479429-479430): `+0x84` in third person, `+0x88` past it (D:L324773-324790). It plays it on the body's item
       node (vtable +100) through `FUN_00272bb0` (D:L479452-479480), when the handle is not 0 and `DAT_003e1538` is set
       (D:L479473; 1 in the ELF's data, never written in the decompilation).
     - The handles are the level's. Its exit clears `+0x84..+0x90` of every record (`FUN_003d0350` -> `FUN_003c46a0` ->
       `FUN_003d21c0`, D:L324701-324705). Its load sets `+0x84` to the `FireAnimName`'s zAnim (`FUN_003d03d0` ->
       `FUN_003c4700`, D:L316318-316325), and `+0x88` to `<name>_zoom` only when the zAnim library holds it
       (D:L316326-316332).
     - The disc: the kit table gives the M67, the HE, the AN-M8 and the Mark141 the `FireAnimName`s `frag_start`,
       `HE_start`, `smoke_grenade_start` and `flashbang_start`. Each plays `.THROW_OBJECT` on MP7 and MP2
       (MP2's bank names it with a trailing blank, research 85 §9.3), RANGE 40-160. No throwable's or
       charge's `_zoom` zAnim exists in any archive read. So `+0x88` stays 0, and **a throw in first person (view state 1) or night vision (3)
       plays no release sound**. The firearm's muzzle takes the same pick and has its `_zoom` zAnims (research 89 §4).
     - A placing's release (`FUN_005bc730`) picks the same way (D:L474051-474060): `c4_start` (`.PLACE_CHARGE`) in third
       person, none past it.
  2. **The grunt: the clip's own callback.** `motion.rdr`'s `zanim_callback` fires as the clip's phase crosses it
     (`FUN_0028c9e0`; research 85 §3). On the disc only `seal_throwgrenade` and its pistol version `seal_p_throwgrenade`
     carry one (`throw_whoosh` at 0.45 -> `.MALE_GRUNT`, RANGE 50-150). The toss, the crouched throw, both prone clips
     and both peek tosses carry none, so they have no grunt in the original.
     - A knock that pops the clip before 0.45 takes the callback with it (`FUN_0028da00` D:L135092-135104, research 256
       s3).
     - The stick cannot cut first: every throw clip's `NoInterrupt` is at or past its release (0.49 against 0.46
       standing, the narrowest).
  3. **The other consoles.** `FUN_005c5340` runs there for the thrower's body too: its warning branch is for a body
     whose controller answers `+0x2c` false (D:L479238-479246, research 304 §4). It picks by that body's `+0x200`.
     - The body record carries no view state (research 193 §4.1's fields), and a spawn writes it 0 (D:L419886-419889;
       `zoom.ts`). So on this read another console plays the third person's pick: one `.THROW_OBJECT` at the release,
       whatever the thrower's view.
     - Not read whole: whether any of `FUN_005448a0`'s callers sets a remote body's `+0x200`
       (`THROW_RELEASE_REMOTE_VIEW_READING`, §7).
     - The other console's grunt comes from the clip it pushes for that body. The port's remote bodies do not sound
       their clips' callbacks yet (`GRENADE_REMOTE_GRUNT_TIMING`, research 304 §11).
- **The port's trigger, end to end.**
  - `grenade.ts` `startThrow` takes the release request (the button let go). A refused one (the power, the clearance, a
    prone peek) emits nothing and spends nothing.
  - `letGo` runs once the clip's release fraction is reached (`pending.left`, on the clip's clock). It nulls the pending
    throw first and emits `'throw'` once.
    - A knock does not stop it (`followBody` keeps an unreleased throw's clock), as the kit's timer runs on in the
      original -- with the power `KNOCKED_THROW_POWER_READING` reads (THROW-INTERRUPT, research 326 §2.4).
    - *THROW-INTERRUPT (2026-10-16, research 326 §2.4):* the page's own death is not a knock. The original's death
      drops the throw released and not yet out at once, live, at power 0 (`FUN_00547af0` -> `FUN_005b8920`, D:L413023,
      D:L471751-471870); the page now cuts it (`GrenadeThrower.die`: no let-go, no release sound, no `throw`), and the
      room makes the drop from the page's `throwStart` (`Room.deathDrop`), told to every page, its release sound the
      remote release's. *Was: the death not named here; the page let the throw go at the release's power as after a
      knock, and the room refused its `throw` ('not alive').*
    - A respawn or a map (`refill`, `reset`) drops an unreleased throw: nothing thrown, nothing heard.
  - `matchThrow.ts` answers `'throw'` with `audio.onAnimCallback` and the net's `throwEvent`, and a placing's `'place'`
    the same way.
    - **The difference found:** it asked the `FireAnimName` in every view. So in first person and night vision the port
      played `.THROW_OBJECT` (and `.PLACE_CHARGE`) where the original plays none.
    - **Fixed:** both ask `muzzleAnimation(fireAnim, view > 0)` (`effects.ts`, the firearm's pick) with the page's view
      state (`firearm().zoom.state()`, the body's `+0x200`). The `_zoom` name has no entry in the audio's callbacks, so
      `GameAudio.callback` drops it as silent.
  - The grunt: `ThrowPose.step` returns each callback once a clip start (its `fired` set), and the page's `poseFrame`
    plays it at the drawn feet. A cut holds the phase where it was, so a knock before 0.45 plays none.
  - `GameAudio.onAnimCallback` resolves a callback through the map's zAnim table and the banks by the trimmed name. It
    plays it positioned against the camera (`matchSound.ts`, the game's listener) within its RANGE.
  - Another page:
    - The room broadcasts an accepted throw's `grenade` to every page but its thrower's (`room.ts` `throwGrenade`), and
      `netPage.ts` hands it to `remoteGrenade` once.
    - `launchRemote` emits `'remoteRelease'` once (not for a joiner's catch-up), and `matchThrow.ts` answers it with the
      `FireAnimName`. The page's own view does not enter it: the read's third-person pick for another body.
    - A throw the room refuses (its rate, the hand's reach, the launch) is heard on the thrower's page alone.
- **"Sometimes but not other times", against the read** (none settled without the owner's retest):
  1. **The kind of throw.** A standing throw sounds twice: the grunt at 0.69 s and the release at 0.71 s. A toss, a
     crouched throw, a prone one or a peek toss sounds `.THROW_OBJECT` alone. That is the disc's, so the original's too.
  2. **The view.** Before this fix the port played the release in first person, where the original plays none. The port
     is quieter now, not louder.
  3. **The browser.** `GameAudio.play` drops every sound while the shared `AudioContext` is not `running` (`audio.ts`
     `WebAudioOut.unlocked`; counted as `dropped.locked`).
     - Edge's Efficiency mode can suspend or starve the context of a window out of focus, as it starved the voice
       decoder. This is a browser condition, not the game's, and nothing in `audio.ts` changes for it (the brief's step
       3).
     - If the retest on Chrome, or with Efficiency mode off, hears every throw, it was this one.
     - The page's hook (`audio()` stats) tells it apart: a lost throw shows as `dropped.locked`, not as a missing
       `.THROW_OBJECT` in `byName`.
  4. **The distance.** Another's throw past 160 units is out of `.THROW_OBJECT`'s RANGE: silent there, as in the
     original.
- **Built.** `matchThrow.ts`: the release's and the placing's zAnim by the view (`muzzleAnimation`). Pins, in
  `throwSound.test.ts`:
  - On the thrower's page, with the disc's clips: thirteen throw kinds (the eight `GetThrowAnim` rows, a run, two pistol
    versions, a stick cut, a knock before the release), each with the four throwables. Each asks one release, and the
    grunt only as its clip carries it.
  - First person and night vision ask the `_zoom` name. The disc's own throwable records; the trigger's throw.
  - Another page: the room's `grenade` asks one release in any view of its own, and a joiner's catch-up none.
  - The placing's pick.
  - On the disc (MP7), the whole chain through `GameAudio` on a recording sink.
- **Owed.**
  - A capture of a standing throw and a toss, in third person and in first person, with the console's sound. It settles
    the first-person silence as measured, not read.
  - The remote body's view state read whole (`THROW_RELEASE_REMOTE_VIEW_READING`).
  - The others' grunt (`GRENADE_REMOTE_GRUNT_TIMING`): `remotePlayers.ts` steps their `ThrowPose` and drops its
    callbacks. Not this row's file.
  - The owner's retest on Chrome, or on Edge with Efficiency mode off.

### 12.8 A throw let go in the air (PARITY-2 PAR-86, 2026-10-13)

The row (the plan's PAR-86; §12.6 item 2): whether the original lets a throw go over a jump or a walk-off's fall, what
the body does under it, and what the landing does with it. Status: **reading, pending review.** Source inspection of the
decompilation (the bytes the header pins) and of the game ELF's bytes (`game/disc/socom2_game.elf`, read-only: the
action-type name table at 0x661060 -- 8 `Jump launch`, 9 `Jump fall`, 0xa `Jump land`, 0xb `Jump land hard` -- and the
names the types at D:L495204-495313 are registered from: 0x661510 `Jump`, 0x660778 `Throw grenade`, 0x660788 `Toss
grenade`, 0x6617c0 `Crouch throw grenade`, 0x661780 `Prone throw grenade`, 0x661800 `Prone toss grenade`, 0x660ef0
`Pistol toss grenade`, 0x661820 `Pistol prone toss grenade`, 0x6615c0 / 0x6615e8 the peek tosses); `motion.rdr`'s
`NoFire` through the repository's reader (`motionTable.test.ts`). No game, capture or browser was run.

- **The first read, corrected: the original pushes no throw in the air.** The first read (§12.6 item 2, PAR-76's
  implementer, unreviewed) took the kit's gate `FUN_005a7de0` and the push's gate `FUN_00589900` as the throw's gates.
  The throw has its own before both, `FUN_0059d830` (D:L457338-457380), asked twice.
  - *What it refuses* (D:L457349-457371): `+0xe1` bit 4 clear; a throw or a toss on top (`Throw grenade`, `Crouch
    throw grenade`, `Prone throw grenade`, `Toss grenade`, `Pistol toss grenade`, `Prone toss grenade`, `Pistol prone
    toss grenade` and the two peek tosses, D:L457352-457355); `FUN_005a7de0(actor, 1, 1)` refusing -- the kit's gate
    with its phase test, the top's `NoFire` (D:L462695-462705); and **off the floor**: the airborne bit `+0x105e` 0x20
    or the state `+0x174` 6 (D:L457369-457371). The bit is set each driver tick before the ground pick, which clears it
    on a floor (`FUN_005af930` D:L466806-466809).
  - *The chase* (the player controller's update `FUN_00594cf0`, before the driver): the power `ctrl+0x11c` chases the
    pressure, and the release is asked, only while a wind-up bit (`ctrl+0x170` 0x40 or 0x80) is set and `FUN_0059d830`
    answers (D:L453478-453480). The power is written only there (D:L453489, D:L453516-453517). Off the floor the plain
    trigger's branch runs instead (D:L453542-453664): with a grenade up, a held button sets the wind-up bit again and
    leaves the trigger state `ctrl+0x118` at 0 (D:L453633-453661), and the kit's frame fires nothing in state 0
    (`FUN_005c0ae0` D:L476380-476381). **So the wind-up is held through the flight, its power as the take-off left it,
    and no release is asked.** A press in the air starts a wind-up by the same branch (D:L453633-453637).
  - *The release request* (`FUN_005be9a0`'s hand-grenade branch, D:L475490, in the kit's frame after the driver): it
    asks `FUN_0059d830` before its clearance (D:L475491-475495), and a 0 refuses it as a short tap does
    (D:L475497-475498: `FUN_00592d40` zeroes the power; no clip, nothing spent). The chase cannot ask from the air, so
    this refusal meets one case: a release the controller asked from the floor on the frame whose driver takes the
    SEAL off it. The running jump's press is taken in the driver (`FUN_0057e1b0`), whose `Jump launch` (pushed in the
    state 6, D:L440820) refuses `FUN_005a7de0`'s phase test from its push (`seal_runningjump_launch`'s `NoFire` 0.2);
    a walk-off sets the airborne bit. That throw is lost: the power zeroed and, at the landing, the controller (its
    release bit set, no throw on top) clears the wind-up (D:L453483-453501).
  - *What the first read had right, moot here:* `FUN_005a7de0` refuses C4 alone over the jump's four types
    (`FUN_00587f50` 8 and 9, `FUN_00587f10` 0xa and 0xb; D:L462687-462692), and the air's steering runs only under
    `Jump` (`FUN_0057a330` D:L438959-438964). `FUN_00589900`'s cases were not re-read: no throw reaches it in the air.
- **The brief's four questions.**
  - *The push in the air:* refused for every throw -- not on the stack, not on the second channel -- over a running
    jump's `Jump launch` and `Jump fall` and over a walk-off's `Jump fall` alike (9, pushed in the state by
    `FUN_0057e050`, D:L440726). The port's walk-off is a fall of more than 8 (the mover's header,
    `ground_touch_distance`). The standing jump (`Jump`, D:L440843) leaves no floor (the mover's header): not this
    row's case.
  - *The body under it:* only the jump's or the fall's own play is on top, so the air is the air without a throw: the
    fall's gravity, the running jump's take-off velocity carried with no stick, a walk-off's held from the edge.
  - *The landing:* pops no throw, none being there. The wind-up waits for the controller's first update after the
    landing's driver (that driver's ground pick clears the bit, D:L466809; the next update reads it). Then the chase
    runs: a button let go in the air asks the release at once (the pressure 0 is under 0.15 of the power), and the throw
    is pushed in that frame's kit pass with the take-off's power; a button still held chases on, and the throw goes
    where it is let go. A release the take-off refused (above) throws nothing.
  - *A throw begun on the floor still playing at a take-off:* not reached by the SEAL's own motion. The throw's root has
    one key (§12.6), the ground state does not run under it, and the jump is refused under it (`FUN_0057e1b0`'s
    looped-top test, D:L440810). A knock replaces it (the port's `Walker.knock`), and the kit's timer lets the grenade
    go on its own clock (`FUN_005c1970` D:L476883-476902; §12.7's knock case), at the power
    `KNOCKED_THROW_POWER_READING` reads; a death drops it at once at power 0 instead (research 326 §2.4, THROW-INTERRUPT).
    *Was: "A knock replaces it ... on its own clock (... §12.7's knock case)." -- the power and the death not named.*
- **The port, against it** (the lane head bc59b9fe0). `grenade.ts` `update` chased the power and asked the release in
  the air, and `startThrow` took it: the clip started (`throwStart` -> `ThrowPose.start`), `Walker.hold` refused its
  hold in the air, the pose played over the fall and through the landing, and the grenade left at the clip's release
  fraction, in the air or after it. That was the page's alone: the room has no wind-up, and lays a hold from the
  command's code, which no command carried in the air. `Walker.hold`'s air refusal (`mover.ts`), `ThrowPose`,
  `matchThrow.ts` `throwStart`, the room's throw (`room.ts` `throwGrenade`) and the landing's pops (`landingPops`;
  `walk.ts`) agree with this read and are unchanged.
- **Built** (`grenade.ts`; no wire change, the room unchanged): `airborneBefore`, the body off the floor as the last
  update left it -- the controller's view, before the driver; `update` chases no power while it is set and sets it
  after its chase; `startThrow` refuses a request whose snapshot is in the air -- the kit's view, after the driver -- by
  `refuseRelease`, as a short tap. The page's order is `main.ts`'s: the walk's ticks, then the throws' update.
- **Built by the review's F1** (`grenade.ts` `pull`): the button is a level, read live each update (`FUN_00594cf0`
  D:L453481, `FUN_002c6350`), and a button held in the air sets the wind-up bit again (D:L453633-453637). So a wind-up
  let go in the air and pressed again before the landing goes on: the first chase after the landing sees full pressure
  and asks no release; the throw goes where the button is next let go. The port's `pull` during a wind-up now sets the
  pressure, the power as it stands (it returned before, so the throw went on the update after the landing). On the
  floor a release and a press between two updates likewise hold the wind-up on, as the level read gives.
- **Pins**, the page and the room's mover on the same commands:
  - `throwInAir.test.ts` (the real `WalkMode` with the thrower wired as `matchThrow.ts` wires it, the room's
    `MoverSim` fed its commands; a deck 42 over the floor): the control on the floor; a running jump let go on the
    command after the take-off (nothing starts in the air, the power stands, the carried velocity untouched, the throw
    starts on the update after the landing's and its hold rides the next command on both); let go on the take-off's
    own frame (refused: nothing thrown or spent, the power 0); a walk-off let go mid-fall (the same); a walk-off held
    through the landing (the power stands in the air, the chase runs on after it); the hook's throw in the air refused;
    F1's let go in the air and pressed again before the landing (nothing thrown at the landing, the chase on, the
    throw where it is let go on the floor).
  - `roomHoldOverHold.test.ts`: in the `Room`, a throw's code on every command of a fall, the landing's included, holds
    neither mover; on the next command both take it, off uncut on the 91st as on the floor.
  - `moverHold.test.ts`: "a hold is refused in the air" kept, a note beside it.
- **Not built, named.**
  - *The landing's clip in the chase.* `FUN_0059d830`'s `FUN_005a7de0(actor, 1, 1)` reads the top's `NoFire`:
    `seal_land_hard`'s 0.3, so after a hard landing the chase waits to its phase 0.3; the port's runs from the update
    after the landing whatever the clip. It is one of `FUN_0059d830`'s other refusals on the floor, owed as research
    256 §6 lists them.
  - *The frame.* The port's controller view is the last page update's, so the chase resumes a page frame after the
    landing's; the original's a game frame after.
  - *A press in the air after a release the take-off refused.* The original keeps the wind-up bits to the landing and
    clears them there (D:L453483-453501), so a fresh press is needed after it; the port's refusal leaves the grenade
    ready, and a press in the air starts a wind-up that chases from the landing.
    *Corrected by the review (F3): not a difference.* The landing's update clears the wind-up bits and the power
    (D:L453483-453501); on the next, a button still held goes from 0 to 2 in the plain trigger's branch and starts a
    new wind-up from power 0 (D:L453542-453564, D:L453633-453637). So a held press survives the landing, as in the
    port, a frame or two apart (the frame item above). The text before this line is the first wording, kept.
  - *Not read here:* the yellow arc (`FUN_005970b0`) during a wind-up held in the air (the port draws it as on the
    floor); the placings in the air -- `FUN_0057d540` (the claymore's and the PMN's push) tests `+0xe1` bit 4 and a top
    marked 8 (D:L440342-440343), not the air, and whether the kit's frame reaches a placing in the air is unread (the
    port refuses its hold there, `Walker.hold`, and the room a charge off the ground, `chargeRests`). C4 is refused over
    the jump's types (D:L462687-462692); the reload in the air (`FUN_005c2a90` D:L477395), as the port; the swaps keep
    the port's own gate (research 201 §1).

### 12.9 The legs under a running throw (PARITY-2 PAR-85, 2026-10-13)

PAR-76's read (§12.6) left one question: whether the action stack draws a covered play, and how the push's snapshot
weighs against the top. This section reads the stack's sampler and its two blends for the running throw, and sets the
port's legs against them. Status: **reading, pending review.** Source inspection only: the decompilation (the bytes the
header pins) and the game ELF's bytes (`game/disc/socom2_game.elf`, read-only: the actor's vtable at 0x6691a0, the
stack's at 0x669210, and the two code words at 0x555290). The clips' fields from the committed golden
(`packages/viewer/test/golden/motion-rdr.json`, `motionTableFromArchive` over `READERC.ZAR`); no reader was run. No
game, capture, test or browser was run. (§12.8 is PAR-86's, on its own branch when this was written; in the lane since
2026-10-14.)

- **The stack draws its top alone.** The pose builder `FUN_00577ea0` (from `FUN_0057a330`, D:L439091) takes the top
  play of the stack -- `FUN_00555170(body+0x1c0)` (D:L437430; the stack's array at `+0x50` of the anim object at
  `body+0x170`, `FUN_0028f090` D:L135905-135916, the top at index `+8`, D:L419945-419955) -- and walks that play's node
  list alone (`+0x30`, D:L437436-437454):
  - each node sampled at its weight (`FUN_005777d0`, D:L437442), its sub-nodes laid over it (D:L437445-437452), the
    nodes merged by their weights (`FUN_00577000`, D:L437455);
  - then the second channel's overlay at 1.0 (D:L437456-437461, research 150 §3.5), and one more motion
    (`DAT_003dee60`) for a top marked 8 or flagged 4 (D:L437462-437468: not a throw's `+0x2b`, 0 to 3; flag 4 and
    `FUN_00587e80` not followed);
  - and the result written into the body's parts (`FUN_00577700`, D:L437469).

  **No entry under the top is sampled**: the covered run is not drawn while the throw is on top, at any weight.
- **A part the top's clip lacks is not written.** `FUN_005777d0` marks every part unsampled (`+0xc` = -1,
  D:L437202-437231) and samples a part only where the motion has a track for it (D:L437264-437285, the index stored at
  D:L437285). `FUN_00577700` writes only the sampled parts into the body's part array (`body+0x1d4`,
  D:L437155-437167). A part's value lives on from frame to frame (the array is reset from the skeleton only at the
  body's construction, `FUN_0028e480` from D:L419660), so a part the top lacks keeps the value last drawn.
- **The snapshot blend.** The body's parts are the stack's part array (`body+0x1d0` count, `+0x1d4` array: the stack's
  `+0x60` and `+0x64`).
  - `FUN_0028e3e0` copies each part's position and rotation into its snapshot (D:L135395-135409).
  - Each driver tick `FUN_00576860` (D:L418455, after the build at D:L418454) takes the frame's time (`body+0x2e0`) off
    the blend's remainder `body+0x178` (D:L436624-436628) and weighs the snapshot by `FUN_002874f0(+0x178 / +0x17c)`
    (D:L436629): 2s^2 to the middle and its mirror (D:L131142-131148; the port's `blendWeight`).
  - `FUN_0028e0d0` (D:L436634; D:L135285-135306) mixes it in, part by part: the position `w x snapshot + (1 - w) x
    pose` (`FUN_001c0768`, D:L41272-41281) and the rotation slerped toward the snapshot by `w` (`FUN_00306ae0`, 0 the
    pose, 1 the snapshot, D:L205945-205960).
  - The parts blended are those whose `+0x42` bit 0 is set: every part at its creation (D:L135869). Some pushes clear
    it for `skel_root` (D:L442052, D:L446401, D:L445137) and some swaps for item nodes (D:L462222 and on). A blend's
    end sets it again on ten parts, the six leg parts among them (D:L436691-436701: `+0x314` lthigh, `+0x318` rthigh,
    `+0x31c` rcalf, `+0x340` lcalf, `+0x2f0` lfoot, `+0x2f4` rfoot -- research 179 §8.14, research 180 §1.3). No clear
    is on the throw's path, so the legs blend.
  - The snapshot is refreshed every frame no blend runs (`FUN_005762e0`, D:L436469-436471, from the actor update at
    D:L417827), and by a push or a pop while one runs (D:L135215-135216, D:L135042-135043). Either way it holds **the
    pose last drawn**, and it stands still for as long as a blend runs.
- **The push (the release request on the run).** The throw is pushed in the kit's frame (`FUN_005c0fd0`, D:L417907;
  PAR-70, §12.5), in the actor update after the driver (research 230 §5.2.3). The same update refreshed the snapshot
  just before it (D:L417827 -> D:L436469-436471), the run's own blend long over. So the snapshot is the run as drawn
  that frame, at the phase its clock now stops at (the covered play's clock, §12.6). `FUN_0028dc90` sets the remainder
  and the length to the throw's `BlendTime` (D:L135218-135220): 0.4 (`seal_throwgrenade`, `seal_tossgrenade`, no
  `BlendTime`) or 0.2 (`seal_crouch_throwgrenade`).

  From the next driver tick the body is the throw's clip, the snapshot weighing `E((B - t) / B)` and the throw
  `E(t / B)` (E the ease, which is symmetric, B the `BlendTime`, t the time since the push). The covered run, the idle
  and the turn step play no part. **The legs go from the run frozen at the push to the throw's legs, eased, over B.**
- **The hold.** After B the body is the throw's clip alone, wherever it carries a part (above). The covered run's play
  keeps its phase (§12.6).
- **The pop (the stick's cut on the 48th command, the toss's 72nd; PAR-70).**
  - The order in the driver: `FUN_005870e0` pops (D:L445128 -> `FUN_00589aa0` -> `FUN_0028da00`) before the build.
    With no blend running, the snapshot was refreshed at the last actor update (D:L417827), so it is the throw's last
    drawn pose (held at the cut's phase).
  - The pop sets the blend to the uncovered play's first node's `BlendTime` (D:L135100-135103): none on every running
    clip (`seal_walk`, `seal_jog`, `seal_run`, `seal_walk_alert`, `seal_jog_alert`, `seal_run_90r`/`90l` and the
    pistol's and backwards versions), so 0.4.
  - The uncovered run keeps its phase, the initial skip set (D:L135105-135107; the popped throw is no loop, so the
    phase copy at D:L135110 is not taken). The driver's peek spends the skip (D:L418293) and the advance moves it on
    from there (D:L438901): the run resumes at the phase it stopped at, a frame on.
  - The pop calls the stack's vtable `+0x14` with the run's `+0x2b` (D:L135104). The actor's constructor sets the
    stack's vtable to 0x669210 (`FUN_00553ea0` D:L419420-419422; its two callers build the actor directly,
    D:L455567, D:L455663). 0x669224 holds 0x555290, whose words are `j 0x58a6b0` with `addiu a0, a0, -0x170` in the
    delay slot: `FUN_0058a6b0`. `FUN_005870e0` then calls the actor's vtable `+0x90` (0x6691a0 + 0x90 = 0x669230,
    also `FUN_0058a6b0`) with the throw's `+0x2b` (D:L445141-445149). `FUN_0058a6b0` sets the ground state only: it
    tells the controller of a change (its vtable `+100`) and writes `actor+0x174` (D:L446820-446823, `FUN_0028dfb0`
    D:L135230-135235). **It pushes nothing**.
    - Research 150 §3.5's "the ground state's enter through the actor's vtable `+0x90` ... a new main play with its
      snapshot": the new play, where there is one, is the state case's (below), not `+0x90`'s. Noted for 150's next
      edit; not edited here.
  - The uncovered run is a loop, so the state's case runs (D:L445150-445165). Standing, `FUN_00586570` with the stick
    off rest: the top's type (`actor+0x534`, written from the top at every push and pop, D:L446298-446299 and
    D:L446524-446525) is Walk, Jog or Run. So it pushes nothing (D:L444876-444885) and `FUN_00583030` re-weighs the
    run's nodes for the stick (D:L444889).
  - *Standing only (the review, F3).* A throw from a crouch-walk also plays `seal_throwgrenade` (`GetThrowAnim`, §12.6),
    but its `+0x2b` is the crouched state 1. So the pop sets state 1 and runs `FUN_00584c60` (case 1,
    D:L445167-445168). That function has branches of its own, not read here: a pop-all loop (D:L444094-444106) and a
    push of type 0x14 (D:L444148-444154). Prone runs `FUN_005845c0` (case 2, D:L445170-445171), not read either. Named
    below (`THROW_LOW_STANCE_POP_READING`).

  From the pop the snapshot (the throw's held pose) weighs `E((0.4 - t) / 0.4)` and the run, live from its kept phase,
  `E(t / 0.4)`. **The legs go from the throw's last pose back onto the run's stride where it stopped, eased, over 0.4 s.**
- **At rest, the same reads.** The push snapshots the idle (`seal_stand`), the throw comes in over B, eased. The uncut
  end pops at the 91st command (PAR-70), and the uncovered idle comes back over `seal_stand`'s `BlendTime`, 0.5, eased.
- **The pistol's upper-body throws** (`seal_p_throwgrenade` 16 parts, `seal_p_tossgrenade` 15: research 85 §8.1, cited,
  not re-derived). The parts they lack are not written while they are on top. So they hold the pose drawn at the push
  for the whole throw: **the legs stand frozen mid-stride**, and the pop blends them back from there onto the run at
  the same phase.
  - Which parts they lack is pinned only in part (the review, F2). `equipmentAnim.test.ts` L114-115 checks that
    `lthigh` and `skel_root` are missing from `seal_p_throwgrenade`, and nothing more. Nothing pins the other leg parts,
    or anything of `seal_p_tossgrenade`. B4's reader assertion over both pistol clips settles it. *Was:* "the legs and
    `skel_root` (`equipmentAnim.test.ts`)".
  - One more pass hangs sub-nodes under the top, and it most likely adds nothing here (the review, F1; *was:* not
    mentioned):
    - Each driver tick `FUN_0057a330` walks a one-shot top's nodes. For each node it asks `FUN_0058c9e0` for the hand's
      version of the node's type (D:L438710-438740): in the pistol hand (`+0xf79` 2), the kit table's entry at `+0x5c`
      (`FUN_005e1a50`, D:L448267-448268), the type itself when that entry is negative (D:L448276-448277).
    - Only a type different from the node's own, with a motion in the set, is hung under the node at weight 1
      (D:L438741-438764, `FUN_0028bdd0`). `FUN_00577ea0` then lays it over the node (D:L437445-437452).
    - The table starts at 0xffff in every entry (`FUN_005e0690`, D:L494660-494684). `FUN_005e1cf0` writes only the
      rifle type's entry (D:L495163-495165), and the pistol type gets a back-link in its own action record's `+2`
      instead (D:L495166). `Throw grenade` -> `Pistol throw grenade` is D:L494747, the toss D:L494750. No pistol throw
      type is registered as a first argument (D:L494688-494789).
    - So a node typed `Pistol throw grenade` reads "no pair" and gets no sub-node. This assumes the push typed the
      node with the pistol type: `sVar3` = `FUN_0058c960(FUN_005e1a90(set, type))`, D:L446088-446089 -> D:L135172.
      That rests on the rifle record's `+2`, which is not read.
    - The crouched and prone pistol-hand throws, whose pistol types are not in the set, would otherwise get sub-nodes
      too.
    - What would break B4: if the table did map the node's type to a motion, that motion would be laid at weight 1
      over every part it carries (`FUN_00576bb0`, D:L436731-436738). If it is a whole-body clip, the legs would be its
      own, not frozen.
  - This answers `PISTOL_ONESHOT_PARTS_READING`'s owed read (research 101's row: how the stack fills the parts such a
    clip lacks): it does not fill them. The reading's value would move from `'beneath'` to the pose held from the push.
  - That is for the build and its ledger row (B4 below); this read writes neither.
- **Not read whole.** The end of a running throw whose stick was let go during it. The pop uncovers the run and, the
  stick at rest, the standing state may push its own play on the same tick (`FUN_00586570` -> `FUN_00586240` /
  `FUN_00586050`, D:L444891-444896, D:L444918-444923, D:L444943-444948). That push would snapshot again with the pop's
  blend running (D:L135215-135216: still the throw's last drawn pose, the parts not yet rebuilt) and take its own
  `BlendTime`. Inferred, not traced: `THROW_RELEASED_STICK_END_READING` below.

**The weights through the sequence** (a throw standing, B = 0.4; t from the push or the pop; each a nested slerp, not
a sum, so the numbers are each source's weight, not a pose; the port's per the next list):

| t (s) | original: snapshot / throw | port: snapshot / throw / idle | original at the pop: throw / run | port at the cut: throw / run |
|---|---|---|---|---|
| 0.1 | 0.875 / 0.125 | 0.92 / 0.02 / 0.06 | 0.875 / 0.125 | 0.97 / 0.03 |
| 0.2 | 0.5 / 0.5 | 0.68 / 0.16 / 0.16 | 0.5 / 0.5 | 0.75 / 0.25 |
| 0.3 | 0.125 / 0.875 | 0.32 / 0.51 / 0.17 | 0.125 / 0.875 | 0.34 / 0.66 |
| 0.4 | 0 / 1 | 0.08 / 0.92 / 0 | 0 / 1 | 0 / 1 |
| 0.5 | 0 / 1 | 0 / 1 / 0 | -- | -- |

- **The port, against the read.** The room draws nothing (its mover holds and cuts as the original's, §12.6), so this
  row is the page's. The others' bodies lay the same `ThrowPose` layer over their own play (`remotePlayers.ts`
  L797-801), so one change covers them too; what their locomotion is under a hold depends on the wire, not read here.
  Command by command:
  1. **The release request on the run.** `matchThrow.ts` `throwStart` (L213) starts the layer and lays the hold. The
     next `step60` sets the walker's ground idle (`mover.ts` L2727-2741). The animator's play turns from `loco:stand`
     to `idle:stand` (`animator.ts` `wanted` L636-666, `start` L685-717). It freezes the pose on screen (the run, as
     the original's snapshot) and cross-fades over `seal_stand`'s `BlendTime`, 0.5, eased (L712, L916). Under that,
     the throw's layer comes in **linearly** over B (`throwPose.ts` L142, L144) over the idle (L862-881).
     - Difference **D1**: the snapshot's fade is 0.5 s, not B.
     - **D2**: the throw's weight is linear, not the ease.
     - **D3**: the idle's legs are in the mix (at most about 0.17 near 0.3 s), where the original has no third pose.
  2. **The hold.** The layer at 1 lays the parts the clip carries over the idle. A turn under the hold plays the
     stance's step clip beneath (`turn:stand`, L645-656), where the original's ground state runs no step under a
     one-shot (`FUN_00550ef0` D:L418172-418246). The idle's phase runs on (`seal_stand`, playback 6 s), from the run's
     phase it took at the push (L693).
     - **D4**: the play beneath changes (idle, step) where the original's is the run, covered and stopped. Invisible
       under a whole-body throw at weight 1; visible under the pistol's (D6) and in the blends.
  3. **The cut, the stick held (the 48th command; the toss's 72nd).** `endHold('cut')` (L2729) ends the hold, and
     `throwPoseEnds` -> `ThrowPose.cut` (`matchThrow.ts` L214) holds the clip's phase and fades the layer out
     **linearly** over `BLEND_TIME_DEFAULT`, 0.4 (`throwPose.ts` L140, L143). The ground state's stand turns the play
     back to `loco:stand`: a second freeze (the throw's pose) and a 0.4 s eased cross-fade (L712). The run starts at the
     idle's phase (L693), not the one it stopped at.
     - **D5**: the run comes back by the product of the two fades (0.25 at 0.2 s against the original's 0.5).
     - **D5a**: its stride starts about 0.13 of a cycle on (0.8 s of the idle's 1/6 a second; the toss's 1.2 s, 0.2),
       where the original's resumes where it stopped.
  4. **The pistol hand.** The layer lays only the parts it carries (`throwPose.ts` L157-161, `PISTOL_ONESHOT_PARTS_READING`).
     The legs and the root are the idle's under the hold, and they cross-fade from the run to the idle over 0.5 s and
     back after the cut.
     - **D6**: the original holds them frozen at the push's pose for the whole throw.
  5. **At rest.** No play change at the push or the end (idle to idle). The throw comes in linearly over B (D2). At the
     uncut end the layer fades out linearly over 0.4 from the clip's last key on the pose's own clock (`throwPose.ts`
     L140, L143), where the original pops at the 91st command (the lagged clock, PAR-70; `mover.ts` L2039) and blends
     the idle back over its 0.5, eased.
     - **D7**: 0.4 linear against 0.5 eased.
     - **D7a**: the fade starts at the clip's last key, about two commands before the pop (as PAR-73 found for the
       reload's still clip, §12.5).
  6. **The spine's twist under the throw** (the review, F4; outside the legs; port source only).
     - The original's gate: every throw clip has `NoPitchtwist` (the motion golden), and the twist gate reads the main
       channel's last node (`FUN_00587a30`, research 150 §3.6), which is the throw on top. So no twist from the push
       to the pop.
     - The port's gate: `ThrowPose.sample` never returns `noPitchtwist` (`throwPose.ts` L157-161), so `animator.ts`
       L981-985 twists the spine whenever the play's last node lacks the flag (the idle, the run) and the raise weight
       is above 0.
     - When the raise weight is above 0 during a throw:
       - With a throwable in the hand, the trigger goes to the grenade, not to `Fire` (`matchThrow.ts` L477-481).
         Taking up the grenade lets `Fire`'s trigger go (L203). So the raise's input (`matchFirearm.ts` L510) holds no
         trigger.
       - The raise is asked down only after `LOWER_DELAY`, 5 s of real time from the last trigger edge
         (`weaponRaise.ts` L173-189), and then falls over 0.5 s, eased. `play.ts` L471-476 passes that weight to the
         animator (L486).
       - So a throw let go within about 5.5 s of the rifle's last trigger edge (fire, change to the grenade, throw)
         draws the twist over it, scaled by the weight. A throw later than that, or with no rifle trigger before it,
         draws none (unless the aim lane holds the raise up -- `AIM_HOLDS_RAISE`, the view on `scope` -- not followed
         under a throwable).
     - **D8**: the port can twist the spine over a throw where the original never does.
- **Built.** Nothing: a read. The build is a later brief.
  - *Built since by PAR-85's build (2026-10-14; reading, pending review), page and others' bodies together; the room
    draws nothing, so nothing there:*
    - **B1** (D1, D2, D5, D7): `ThrowPose` (`throwPose.ts`) lays a throw as the stack's top (`PoseLayer.top`) at
      weight 1 from its first key. Its push asks the body's cross-fade from the pose drawn over the clip's
      `BlendTime`, eased; its pop drops the layer and asks the cross-fade over the play beneath's `BlendTime` (the
      run's 0.4, the idle's 0.5). Both are drawn a frame's tick in (`PoseLayer.crossFadeRun`): the push lands after
      last frame's driver, the pop is inside this frame's, and `FUN_00576860` takes the frame's time off before it
      weighs (D:L436624-436629). The animator's own play changes under a throw's hold start no cross-fade (covered).
      The page starts the layer after its hold (`matchThrow.ts`), so an end the hold's start heard (a placing it
      replaced) is not this throw's.
    - **B2** (D3, D4, D5a; standing only): under a throw's hold (`MoverSnapshot.hold`) the animator keeps the play it
      had -- no idle, no turn step, its phase stopped -- and resumes it at its kept phase at the hold's end, a frame on
      (`THROW_LOW_STANCE_POP_READING`). Crouched and prone keep the port's play change beneath, covered.
    - **B3** (D7a): a throw pops at its hold's end, whatever the reason (`throwPoseEnds` now true on a throw's
      `complete`; the others' hands pop when the hold leaves the body, `ThrowPose.follow`): the uncut throw stays at 1
      past its clip's last key to the 91st command. A throw no hold carries pops the frame after its last key.
      *Fixed by the review's F1:* the slot's last throw empties the hand (`GrenadeThrower.finishThrow`'s `equip(false)`
      at the clip's last key) two frames before the hold's end; the hand's going no longer drops a throw its hold
      carries (`ThrowPose.letGo`), and a held throw whose hold left unheard (a new mover) pops (`ThrowPose.holdOn`, from
      the page's `poseFrame`). Held at 1 to the 91st command and eased onto the idle (`matchThrow.test.ts`).
    - **B4** (D6): a `top` layer's missing parts hold the pose last drawn (`animator.ts`), so a pistol-hand throw's
      legs and root stand frozen at the push's pose (`PISTOL_ONESHOT_PARTS_READING`). The reader, over the disc's
      clips: the five rifle-hand throws carry 26 parts each, the six leg parts and `skel_root` among them;
      `seal_p_throwgrenade` (16 parts) and `seal_p_tossgrenade` (15) lack `skel_root`, `hips`, `lthigh`, `rthigh`,
      `lcalf`, `rcalf`, `lfoot`, `rfoot`, `ltoe` and `rtoe`; every throw clip is `NoPitchtwist`
      (`equipmentAnim.test.ts`).
    - **B5** (D8): the throw's layer says `noPitchtwist` from the push to the pop; its push's snapshot carries the twist
      drawn, which eases out with it (research 211 G3, as a `NoPitchtwist` play's start).
    - Tests: `animator.test.ts` ("PAR-85: the throw on top of the stack ...", B1-B5 and the others' bodies through the
      wire, synthetic clips on the real `Walker`); `equipmentAnim.test.ts` (B4 on the disc's clips); the changed claims
      in `effectiveAction.test.ts`, `grenade.test.ts` and `moverHold.test.ts`, their old titles kept beside them.
    - Not built: the placings (`seal_place_claymore`, `seal_put_onwall`, the bomb's plant) keep the fading layer, the
      same sampler unbuilt for them; the twist's return at the pop is drawn at once over the cross-fade (the port's
      twist is laid after the blend, the original's before it, D:L418454-418455), as at every `NoPitchtwist` play's end.
      *Built since by PAR-95 (2026-10-14; reading, pending review): the twist eases back in at the pop with the
      cross-fade -- the Owed entry below.*
- **The build list** (each RED first, page and others' bodies together; unit tests with synthetic clips where the disc
  is not needed):
  - **B1 (D1, D2, D5, D7): the throw as a stack play, not a fading layer.**
    - The change: the layer at weight 1 from its first key. Its start asks the animator for a whole-body snapshot
      cross-fade over the throw's `BlendTime` (the `crossFade` the reload's carried overlay asks, `animator.ts`
      L865-868). Its cut or end drops the layer and asks a cross-fade over the uncovered play's `BlendTime` (the run's
      0.4, the idle's 0.5), from the pop's command.
    - The test: a leg part's rotation at t after the push is the slerp of the throw's key toward the frozen run by
      `E((B - t) / B)`, and at t after the cut the slerp of the throw's held key toward the live run by
      `E((0.4 - t) / 0.4)`. RED today: the linear ramps and the 0.5 s idle fade.
  - **B2 (D3, D4, D5a): no play change beneath a whole-body hold** -- standing (the review, F3; *was:* unscoped). The
    crouched and prone pops are `THROW_LOW_STANCE_POP_READING`'s (below), not this row's change until read.
    - The change: while `PlaySnapshot.hold` names a throw's clip (`mover.ts` L3244 already carries it), the animator
      keeps the play it had: no `idle:stand`, no `turn:*`, its phase stopped. At the hold's end it resumes that play
      at its kept phase; the stick's wanted play then follows as the ground state's would (above: the same play,
      re-weighed).
    - The test (standing; the review, F3): a run at phase p, a throw pushed, cut on the 48th command with the stick held -> the play is
      `loco:stand` throughout, its phase p until the cut and then p plus the frames since. A turn under the hold plays
      no step. RED today: `idle:stand`, the phase off by the idle's run.
  - **B3 (D7a): the out-fade from the pop.** The layer's end follows the mover's hold end (the lagged clock's 91st
    command), not the clip's last key on the pose's own clock. The test: the layer at 1 until the hold's `complete` end,
    then out. RED today: it starts two commands early.
  - **B4 (D6): a part the throw's clip lacks holds the pose drawn at the push.** `PISTOL_ONESHOT_PARTS_READING` from
    `'beneath'` to that pose, with its ledger row.
    - The test: `seal_p_throwgrenade` pushed from a run (the disc's clip, as `equipmentAnim.test.ts`): `lthigh`'s
      rotation through the throw equals the run's at the push. RED today: the idle's.
    - The same test asserts through the reader that the rifle hand's throws (`seal_throwgrenade`, `seal_tossgrenade`,
      `seal_crouch_throwgrenade`, the prone two) carry the six leg parts and `skel_root`. If one does not, B4 covers it
      too. It also asserts which leg parts and root both pistol clips (`seal_p_throwgrenade`, `seal_p_tossgrenade`)
      lack (the review, F2). Not read here: no reader run.
  - **B5 (D8): no twist under a throw.**
    - The change: `ThrowPose.sample` returns `noPitchtwist` from the clip's flag while the throw is on top (from the
      push to the pop), as the reload's still clip does (`PoseLayer.noPitchtwist`, `animator.ts` `layerNoTwist`).
    - The test: a raise weight above 0, a throw pushed -> no twist on `spinelo` and `spinehi` until the pop. RED today:
      the twist is drawn.
    - It goes with B1, which makes the throw a stack play.
  - The room: nothing. Hot files: `walk.ts` only if the snapshot's hold must be passed on (it is already in
    `moverSnapshot`); `animator.ts`, `throwPose.ts`, `remotePlayers.ts`.
- **What the readings become.**
  - `RUNNING_THROW_BODY_READING`: the question it names is read. The covered play is not drawn, and the push's snapshot
    carries the legs. Its value becomes `'snapshot'` (the pose drawn at the push, frozen, eased out over the throw's
    `BlendTime`; the run resumed at its kept phase at the pop, eased in over its own). Once B1 and B2 are built it
    leaves the port's choices: a reading, pending review, until a capture proves it.
  - `PISTOL_ONESHOT_PARTS_READING`: as B4.
  - New, a candidate: **`THROW_RELEASED_STICK_END_READING`** (`*_READING`, note until the build).
    - What it stands for: a running throw whose stick is let go before its end -- the pop, then the standing state's
      own push on the same tick, a second snapshot of the throw's pose, and that play's `BlendTime` (`seal_stand`'s
      0.5 on the inference above).
    - What settles it: `FUN_00586240` and `FUN_00586050` read whole for a top of type Walk/Jog/Run, or the capture
      below with the stick let go mid-throw.
  - New, a candidate (the review, F3): **`THROW_LOW_STANCE_POP_READING`** (`*_READING`, note until the build).
    - What it stands for: the pop of a throw let go crouched or prone -- the crouch-walk's `seal_throwgrenade` and the
      crouched and prone throws. The state's case is `FUN_00584c60` (crouched) or `FUN_005845c0` (prone), not
      `FUN_00586570`, so whether the run is drawn again at its kept phase, or a pop-all or a push of its own covers it,
      is unread.
    - What settles it: `FUN_00584c60` (D:L444037 on: the pop-all at D:L444094-444106, the 0x14 push at
      D:L444148-444154) and `FUN_005845c0` (D:L443839 on) read whole for a looped top after a throw's pop, or a capture
      of a crouch-walk throw cut by the held stick.
- **Owed.**
  - The capture: a running standing throw and a running toss, the stick held through the release and the cut, one let
    go mid-throw, and one from rest, frame by frame. It settles the legs through the two blends (the table above) and
    proves the readings.
  - A pistol-hand running throw in the same capture (B4: the legs frozen mid-stride), and a crouch-walk throw
    (`THROW_LOW_STANCE_POP_READING`).
  - The review's re-read of every line cited here.
  - *Added by PAR-85's review (F3, 2026-10-14):* the twist's ease-in at the pop, unbuilt for every `NoPitchtwist` play
    (the throws among them). The original builds the pose with the twist in it -- `FUN_005aca70` inside `FUN_0057a330`,
    gated by `FUN_00587a30` and called at D:L439192-439193 -- before the snapshot blend mixes the snapshot over it
    (the build at D:L418454, the blend `FUN_00576860` at D:L418455), so the twist eases back in with the pop's blend.
    The port lays the twist after the cross-fade (`animator.ts` `aim`), so it returns at once on the pop's frame.
    (Plan row PAR-95.)
    - *Built by PAR-95 (2026-10-14; reading, pending review).* Re-read at the source first, and it holds:
      - The order: the driver `FUN_0057a330` at D:L418454, the snapshot blend `FUN_00576860` at D:L418455.
      - The twist inside the pose: `FUN_005aca70` (called at D:L439193, gated at D:L439192 by the raise weight over 0
        and `FUN_00587a30`) reads `spinelo`'s and `spinehi`'s model transforms as built (`FUN_002869d0` over the
        anim object, D:L465268, D:L465272) and writes their rotations, the part's `+0x20` (D:L465304-465307,
        D:L465326-465329).
      - The blend mixes that same field: `FUN_0028e0d0` slerps each part's `+0x20` toward its snapshot `+0x30` by the
        snapshot's weight (D:L135300; the weight `FUN_00576860` D:L436624-436634).
      - The plays that carry `NoPitchtwist` (the motion golden, `motion-rdr.json`): every throw (`seal_throwgrenade`,
        `seal_tossgrenade`, the crouched, prone, pistol and lean ones, `seal_returnthrow`), every reload clip (the
        still ones of the rifle, the pistol, the shotgun, the m203 and the launcher; the moving ones too,
        `seal_mv_reload` and its kin, which play on the second channel, which the gate does not read), and every swap
        (`seal_rifle2pistol`, its crouched, prone and moving versions, `seal_swaprifle`, the hands-free and launcher
        ones).
    - **The change** (`animator.ts` `aim`): the twist is laid on the pose built (`Animator.built`, before the
      cross-fade) and then mixed with the frozen pose by the cross-fade's weight. While a cross-fade runs, the twist
      reads the pose built (with the head look), not the pose mixed. The pose on screen (`shown`) keeps the twist, so
      every snapshot holds the pose drawn, with or without its twist:
      - out of a `NoPitchtwist` play (a throw's pop, a still reload's cut with no clip carried on, a swap's end), the
        snapshot has no twist and the twist eases back in;
      - into one (a throw's push, a swap's start), the snapshot holds the twist and it eases out, as before.
      - *Was:* the twist written over the pose after the cross-fade, and frozen into a snapshot only for a
        `NoPitchtwist` play's start (`twisted`, research 211 G3; PAR-85 B5's push). Every other snapshot (a play change
        between twisting plays, the stick's snap, the overlay, `setWeapon`) froze the pose without the twist, and the
        twist was laid over the mix. Now the mix runs between the two twisted poses, as the original's does. The
        difference is small while the twist holds steady.
      - *Also (the review's F3, 2026-10-14):* the same holds where the gate refuses the twist for a reason that is not
        a clip's flag.
        - The cases: the move into prone (`FUN_005aca70` runs nothing in ground state 2, D:L465123; the port's
          `stance` test), a ladder or a climb, and the victory dance (the port's traversal seam passes no pitch).
        - The twist now eases out at those plays' starts and back in at their ends, over their cross-fades. Before,
          it snapped.
        - It follows the same read: the twist is in the pose, and the snapshot is the pose drawn.
        - Pinned: the move into prone and back (`animator.test.ts`, "the move into prone eases the twist out ...").
    - Tests: `animator.test.ts` ("PAR-95: the pop eases the twist back in ..." beside B5; "PAR-95: the twist eases back
      in at a NoPitchtwist play's end", a still reload's cut and a swap's end with its start). On each frame of the
      cross-fade, the spine's turn is the slerp from none to the full twist by the cross-fade's weight. B5 and the
      disc's G3 (`swapOverlay.test.ts`) stay green. The room draws nothing. The others' bodies share the animator
      (`remotePlayers.ts`).
    - **Not built, owed (the review of this row to confirm):**
      - *A still reload's uncut end, and its start.* There the port fades the reload layer's own weight
        (`weaponPose.ts` `weightOf`: in over the clip's `BlendTime`, out over the play beneath's from the pop, PAR-73).
        It does not ask the body's cross-fade from the pose drawn. So the twist still comes back at once at the uncut
        end, the layer saying `noPitchtwist` no more once it fades. It also drops at once at the start: the layer
        fades in over the live play, whose pose has no twist under a `NoPitchtwist` layer. The original's pop
        (`FUN_005870e0`'s new play) and push are snapshot blends both ways.
      - The fix is `weaponPose.ts`'s, outside this row's files: the still clip's start and uncut end asked as the
        body's cross-fade (`PoseLayer.crossFade`), as its cut already is. Source inspection only. No test pins the
        at-once return.
      - *Built since by PAR-95, widened by the gameplay controller (2026-10-14; reading, pending review).* Read at the
        source first:
        - The push: the still clip (and the after-shot) is pushed on the stack, `FUN_005a82e0` D:L462928 ->
          `FUN_00588bc0` -> `FUN_0028dc90` (D:L446292, on the anim object at `actor+0x170`). The push snapshots if a
          blend runs (D:L135215-135217) and sets the blend's remainder and length to the clip's `BlendTime`
          (D:L135218-135220).
        - The pop: the driver's end test pops it, `FUN_005870e0` D:L445128 -> `FUN_00589aa0` -> `FUN_0028da00`
          (D:L446515). The pop snapshots if a blend runs (D:L135042-135043) and sets the blend to the uncovered play's
          first node's `BlendTime` (D:L135100-135103).
        - Both are the whole body's snapshot blend: `FUN_00576860` weighs it, and `FUN_0028e0d0` mixes every part
          whose `+0x42` bit 0 is set (D:L135285-135306). No clear is on the reload's path. So the legs, the arms and the
          twist all follow it.
      - **The change** (`weaponPose.ts`):
        - A still clip's push asks the body's cross-fade over the clip's `BlendTime`, drawn with the clip's own time
          already run (`crossFadeRun`: the push lands after the frame's driver, PAR-67). Its layer is at 1 from its
          first frame (`fadeIn` 0).
        - Its uncut pop (PAR-73's frame) ends the layer and asks the cross-fade over the play beneath's `BlendTime`,
          as its cut already did.
        - `stopReload(true)` heard after the pop keeps that request.
        - *The cut changed with it (the review's F2):* `stopReload(true)` heard after a cut where no clip carries on
          now keeps that cut's request too. Before, it cleared it (`!this.reload`). That is consistent with the
          source: the snapshot blend runs on, whatever the kit's lock does.
        - *A push on the frame the mover's play changes (the review's F1):*
          - The reload's request is a push (`PoseLayer.push`), so it is taken whatever else started that frame, as a
            throw's (`top`) is.
          - The source: a push snapshots again while a blend runs and sets its clip's `BlendTime`
            (D:L135215-135220), and the kit's push lands after the ground state's play change (PAR-67).
          - *Was (1b61c59f7):* the request was dropped, and the body eased over the new play's `BlendTime` from 0.
          - Not `top`, because that would also stop writing the parts the clip lacks for the whole reload.
          - Every still reload clip and after-shot carries every body part but `body`. The props differ:
            `seal_reload` carries `rifle` and not `pistol`; `seal_p_reload` carries `pistol` and not `rifle`.
            (A scratch run of the repository's reader, `simClipsFromBytes`, over the fixture `MOTION_P.ZAR`.)
          - Holding those props is a reading not taken here. `PISTOL_ONESHOT_PARTS_READING` covers the throws and
            the placings only.
        - *Was:* the layer's own weight eased in over the clip's `BlendTime` and out from the pop over the play
          beneath's, over the live play. The weights' timing is unchanged. What changed: the pose eased from is the
          one drawn, not the live play, and the twist goes with it.
        - The moving overlay's fades (`OVERLAY_BLEND`) are unchanged.
      - **Tests:**
        - `animator.test.ts` ("a still reload's start and its uncut end ...": the start eases the twist out over 0.4,
          the uncut end eases it in over `seal_stand`'s 0.5, the legs and the arms from the frozen pose against a
          swaying idle, and Fire's completed end on the pop's frame).
        - The changed claims in `reloadRun.test.ts` (the start's weight, the uncut end, PAR-73's page pins on the
          101st and 102nd) and `weapon.test.ts` (the start's request), the old values kept beside them.
      - *The head look and the bank.* They are the driver's too (D:L439152-439191; the bank D:L439196-439204, after
        the twist), so the original's snapshot carries them. The port still writes them over the pose after the
        cross-fade (`aim`'s comment), unchanged here.
  - *Added at the merge, from the fold's re-review (2026-10-14):* a respawn or a `setCamera` placing during a throw's
    hold now pops the throw with the 0.5 s cross-fade from its last pose onto the new body (`ThrowPose.holdOn`), where
    before the fold it was cut at once; the others' `follow` does the same, so the two pages agree. Whether the
    original blends when it rebuilds the actor is unread (rare: the hold ends long before a respawn).
  - *Added at the merge, from the same re-review:* "the same tick" for the standing state's push after a let-go
    throw's pop (above, and research 101's row) reads the order wrong -- the state handler (`FUN_005870e0`) runs before
    the driver (D:L418203 -> D:L418454), so the push comes on the next tick. The port's lead 0 on the pop's frame
    already matches that order; the wording is corrected at the next touch.
