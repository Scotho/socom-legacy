# 433 -- Hostages and mines: the PMN's trip, the booking, the minute and the endings (LATER 930)

- Date: 2026-11-15. WM-HOSTAGE task 3, branch `agent/wm-hostage-mines`, base e94bbe191f; the owner's priority for
  the night (LATER 930, "hostages and mines"), through the main controller.
- Track: simulation. Status: **reading, pending review** -- the code and the measurements below are transcribed and
  cited; review 1 (FAIL, section 10) re-read them at the source and its findings are folded; the fold's own changes
  (the PMN's trip in flight, section 1) wait for the next review. 8f's second read (SOUND WITH CORRECTIONS, section 10)
  is folded too: correction 7 by a fix with a RED (section 7), the rest in the text -- pending the next review.
- Sources, kept apart throughout:
  - **(D) the r0001 decompilation** (`socom2_game.elf.decomp.c`), cited `FUN_<addr>` and `D:L<line>`, source
    inspection only;
  - **(R) the rig's measurements**: the original (r0004 under PCSX2) on MP71 Fish Hook, three consoles (A the
    Terrorist, B the SEAL leader and host, C the third SEAL), one match, 2026-11-15 -- `seats/rig-Q25-RECORD.md` (the
    first version: runs cal2, R2, R3, F1, F2, F3, V1; R1 and F4 void) and `seats/rig-Q25-RECORD-corrections.md`, which
    supersedes it on the timer and the endings. Cited "rig, run, n". The rig's distances are x/z, body centre to the
    mine, at sampler rows about 77 ms apart, on the console that owns the mine and its lagging copies of the others;
  - **(C) a per-frame capture of the original**: PC 3's memory-read capture of r0004 on MP6 (2026-11-18, n = 3, per-frame
    PINE rows; hand-scored, not harness-scored), `agent-mail` `evidence/later1075-pmn/` (LATER 1075, section 1);
  - **(U) unread**: what neither settles, each named in section 8 with what would settle it.
- New names: `PMN_HOSTAGE_TRIP_READING`, `ONE_SEAL_HOSTAGE_KILL_ROUND_READING`; re-filed:
  `PENALTY_COALESCE_READING` -- here, and since review 1's fold (2026-11-15) also in research 237 (s3 and its row),
  research 101's row and the parity registry's `objective.extraction.penalty-coalesce`; note only:
  `PMN_TRIP_REACH_READING`, `PMN_ARMING_START_READING`, `PMN_TRIP_TO_BURST_READING`, `PMN_CORPSE_TRIP_READING`.
- MP71's `objectives` script is MP6's, rule for rule (research 190 s2).

## 0. The answer

1. **On the original a hostage sets off a pressure mine, standing or following, and dies of it** (R: R2, F1, F2) -- as
   the code reads (D: the trip test's one caller is the seal body's update, which a hostage runs; section 2). The
   port's room did not test hostages; it does now (`PMN_HOSTAGE_TRIP_READING`, section 7).
2. **The layer is booked** -2 a hostage on his score, his kills and team kills unmoved (R and D agree; section 5).
3. **A SEAL's hostage kill costs one minute of the mission timer for each hostage** (R: H1a, H1b, n = 2, the host's
   per-frame log; V1 before them); a Terrorist's costs none (R: R2; D); a wounded hostage costs nothing (R: H1b). The
   original raises `mp_penalty` once a frame per dead hostage and cuts one minute per call that sees a rise -- the code
   as read and the rig agree; the conflict is CLOSED (`PENALTY_COALESCE_READING`, a reading, section 6). The port cuts
   the same total in one step 2 s after the deaths, where the original cuts one minute a frame from 1.93-1.98 s.
4. The messages and the endings already agree with the script and the rig, one SEAL kill alone included (the rig's V2,
   `ONE_SEAL_HOSTAGE_KILL_ROUND_READING`).

## 1. Arming

- **(D)** `Timer1` is projectile `+0x8c` (8 s, research 94 s C5.3). `FUN_003c5310` counts it down by dt
  (D:L316893-316896). A PMN has "has a proximity" set (`+0xc6`), so reaching 0 does not set it off
  (D:L316897-316900); it only opens the trip test, which checks a mine only once `+0x8c <= 0` (`FUN_00543930`
  D:L410287).
- **(D) Timer1 runs in flight** (review 1, finding 4): `FUN_003c5310` skips state 7 (`+0x0a`, D:L316862), returns early
  for states 5, 4 and 6 (D:L316865-316891) and counts `+0x8c` down in every other state, inside a guard on +6 bit 1 whose meaning is unread (D:L316863-316864; otherwise the `+8 = 3` path, D:L316910-316914) (D:L316893-316896), so it runs
  during the throw unless flight is one of 4-7 (which state number is flight is not read). The mine is on the trip
  list from its creation (`FUN_005bc730` D:L474106-474108), and its `+0x48` follows its node every tick
  (D:L316850-316858), in the air too; `FUN_00543930` has no state test (D:L410287). So a PMN whose `Timer1` runs out
  before it lands trips in the air. The port refused that until this fold (`proximityTripped`'s `state === 'rest'`,
  removed; `packages/scene/test/pmnTripInFlight.test.ts`). **The in-flight trip is a reading no rig case exercises**
  (the rig's mines were laid by a ~2 s plant and lay still long before their 8 s ran out), and none is planned: the
  moving-PMN rig leg is DROPPED (8f's second read: no laid PMN keeps moving); reading, pending review.
- **(R, n = 3: R2, cal2 twice)** Nothing happens for about the first 10-11 s of game clock after the lay. R2: a hostage
  stood 8.1 u away the whole time; the burst came 11.5 s after the lay. cal2: the layer was alive at +6 s and dead at
  +11 s. The game clock ran at 0.93-0.98 of wall time.
- **(C) The capture, per frame (LATER 1075; PC 3, r0004, MP6, 2026-11-18; a memory-read capture of the original,
  hand-scored, not harness-scored; n = 3; `agent-mail` `evidence/later1075-pmn/`, sha256 a9a3c511...b203f):**
  - the plant action (271) starts on the R1 row; the trip list's count (r0004's list, found by savestate diff: count u32
    0x004b8a7c, head cell 0x004b8a80) first rises 1.384 / 1.368 / 1.368 s after it, where `Timer1` already reads 7.9666 --
    so the creation, `Timer1` at 8.0, is DATED BACK one frame to 1.351 / 1.334 / 1.334 s (an inference from the rows: the
    read may fall after the frame's tick);
  - `Timer1` (+0x8c) is 8.0 at creation and counts 1.0003 s a guest second, through 0 and below: creation -> 0 at
    7.997 s each time;
  - press -> armed 9.348 / 9.331 / 9.331 s of guest clock;
  - the state byte `+0x0a` stays 1 all its life and does not change at arming; the flags `+0x04` hold low byte 0x0e;
  - nothing tripped (no body near): arming -> burst (s3) is still unmeasured.
  This SUPERSEDES the 10-11.5 s above: those rigs read no frame. Their burst times LIKELY included the trip's leftover
  (s3) or the lay's own timing -- the capture did not measure which (its RECORD.md).
- **The port against it (LATER 1075, pinned):** the page lays the PMN when the kit's 1.3 s timer runs out -- 39 game
  frames, 1.30 s (`viewer/test/pmnArming.test.ts`) -- and the room dates the fuse from the throw and opens the trip test
  8 s later (`match/test/pmnArming.test.ts`). Press -> armed is about 9.30 s: **matching within one or two frames.**
- **(U) The reading question left** (`PMN_ARMING_START_READING`): the capture places the creation on the 40th frame by
  dating it back from the 41st, where the count first rises; the port lays it on the 39th (pull, then its first
  decrement on the next update). Candidates: when the capture's memory read falls in the frame (before or after the
  tick, so whether the dating back holds), and whether the creation (`FUN_005bc730`) falls a frame after the commit
  (`FUN_005c1970` D:L476883-476905 decrements and commits in one tick). A frame-exact read, not scheduled (the main
  controller, 2026-11-18). The totals do not depend on it: the zero crossing is read directly. Not the flight: `Timer1`
  counts during it (above).

## 2. The trip test

- **(D)** `FUN_00543930` (D:L410258-410314) walks the proximity list `0x4b5238`. For each armed mine:
  `d = mine+0x48 - body+0x1c` (D:L410292), a full 3D difference; it trips when `|d|^2 < ammo+0x3c`
  (D:L410302-410303); tripping sets `+0xc4` (`FUN_003c5730`, D:L316919-316925) and removes the mine from the list
  (D:L410305). There is no team or owner test.
- **(D) The radius.** `ammo+0x3c` holds the square of `ProximityDistance x DAT_003dfe10` (the loader `FUN_003cedb0`
  D:L322714-322718; `FUN_003d4440` squares it, D:L326559-326563). `DAT_003dfe10` is 10.0 (D:L221315), so 1 m gives
  10 u. (U) a map key (`0x3f6c70`) can reset the scale (D:L217167); whether MP71 sets it is unread, and so is whether
  the ammo record loads before or after the map's MetersPerUnit (D:L217167) sets the x10 scale -- the reach may depend
  on the map (8f's second read, note 8; `PMN_TRIP_REACH_READING`, LATER 1076).
- **(D)** `+0x1c` is the body's position at foot level (research 201, 366).
- **(D) Which bodies are tested.** The only caller is the seal body's update `FUN_00550ef0`, at D:L418452. It returns
  before the test when `+0x105c` bit 0x40 is clear (D:L418074-418075), when there is no controller or its tick returns
  0 (D:L418084-418093), or when the body is dead (`+0x174 == 8`, D:L418112-418113). A remote body's controller tick
  returns 1 (research 181 s2.4). A hostage is a `CZSealBody` (research 193 s8.1).
- **(D) Which console.** A PMN joins the list only offline or on its owner's console (`FUN_005bc730`
  D:L474105-474108): the layer's console tests the mine, against its lagging copies of the bodies the host owns,
  hostages included. The port's room is that authority (research 235 s8, an adaptation of where the test runs).
- **(R)** Hostages trip it: standing at 8.1 u (R2); following, between the 8.82 u and 8.51 u rows (F1) and inside
  9.4 u (F2); each n = 1. Players trip it: the layer at 8.2 u (cal2, n = 2); a runner passing no nearer than 8.26 u
  (F3). Nothing tripped it at 12.2 u or more. A runner at 56 u/s showed the change only 2.95 u past the mine (R3).
- **Inference, not a measurement.** For a moving body the rig's row comes later than the trip, by speed x (the lag of
  the owner's copy + the sampling + the state word's lag); the distances are x/z only, a row every ~77 ms. The bodies
  that stood still were inside 10 u either way. No measurement shows a radius below 10 u: the rig's 8.3-8.8 u, read on
  lagging copies, does not contradict the reading's 10 u in 3D. `PMN_TRIP_REACH_READING`.
- **(U)** Whether a corpse ever trips a mine: the reading says no (D:L418112-418113), but the writer of `+0x174` is
  unread (`PMN_CORPSE_TRIP_READING`). Whether a hostage fading out after its rescue trips one
  (`PMN_HOSTAGE_TRIP_READING`'s open part).

## 3. From trip to burst

- **(D)** The next projectile tick sees `+0xc4` and calls `FUN_003c8740` (state 3, D:L319271-319277), then
  `FUN_003c7170` (defined at D:L318487; called at D:L316904, the call site D:L316902-316906), which sends the trip on
  the wire. The frames from there through states 4 and 5
  to the damage are unread.
- **(R, n = 5)** The nearest body is dead 0.08-0.16 s after the rig's state word changes.
- The port goes off on the frame it trips. `PMN_TRIP_TO_BURST_READING`.

## 4. The blast (for the blast lane; not built here)

- **(R)** The blast kills hostages at 8-26 u and an armoured SEAL at 15-20 u.
- **(R, F3)** A hostage at 52 u lost one limb's health (15 -> 0). The record's radius is 4 m = 40 u, so this is
  unexplained (walls between were not looked at).

## 5. Booking

- **(D)** `FUN_0059ee20` (the death) finds the killer as a player-type entity (D:L458076-458079) and takes the
  hostage branch: the ELSE of D:L458083's test of the victim's +200 against 0x20000. Online, it adds 1 to the killer side's counter: Terrorist `+0x3c` (D:L458127), SEAL
  `+0x38` (D:L458123). Then it calls `FUN_00545390` (D:L458144): on the killer's console score -2
  (D:L411530-411531; ESCORT's Terrorist +3, D:L411538), escortees killed +1 (D:L411547). No kill, team kill or
  suicide counter moves.
- **(R)** The Terrorist layer: -2 per hostage, kills unchanged (R2, n = 3 hostages; F1). The leader's counters do not
  move (F1). The SEAL with his own claymore (V1): -2 x 3, then a suicide, ending at -8 -- as `FUN_00545c90` on a
  self-kill (D:L458085).
- The port agrees (`blastHostages` -> `hostageKilled` -> the extraction's `killed` -> the room's `on('killed')`, -2 by
  `HOSTAGE_KILL_SCORE_READING`); not changed.

## 6. The messages, the minute and the endings

- **(D, the script; research 190 s4)** `HostKill1-3` (at `mp_hostages_by_turds >= 1/2/3`): "THE TERRORISTS HAVE KILLED
  A HOSTAGE", WAIT 2, "THE SEALS HAVE BEEN CREDITED WITH RESCUING THAT HOSTAGE", then `rescuecount` +1 and
  `killcount` +1 -- a counter only, no points (`FUN_00545480` is not called). `SealKill1-3` (at
  `mp_hostages_by_seals >= 1/2/3`): "THE SEALS HAVE KILLED A HOSTAGE", WAIT 2, "ONE MINUTE HAS BEEN DEDUCTED FROM THE
  MISSION TIMER", then `mp_penalty` +1 and `killcount` +1.
- **(D) The minute is the SEALs' side only.** Only `SealKill` raises `mp_penalty`. Game `+0x40` is the valve named
  "mp_penalty" (`FUN_002a76d0` D:L149589, the string at 0x3f1140), and every write to such a valve runs its listeners
  (`FUN_003519f0`). On the host, `FUN_002a9ee0` (D:L150711-150719) -- a stub into `FUN_002c00f0` (D:L163050-163057), one routine (below) --
  compare that counter's u16 with the last value seen (`+0xc0`); when it rose they call `FUN_002a6960(game, 60)`
  (D:L148928-148950): the round total minus 60 s, or 1 s when it is 60 s or less. Both write the same last-seen field.
  `FUN_002c00f0` has 25 call sites in 18 functions (for example D:L55635, D:L75922, D:L123879, D:L125577), none taking
  its address, so a listener reaches it only through one of them; `FUN_00279490` and `FUN_0027c9f0` sit in data tables
  (at 0x3dd9f8 and 0x3dd6b8) -- trace those first for the per-rise question. `FUN_002a9ee0` has one caller
  (D:L197108). (8f's second read; its counts and addresses not re-read on this branch's host, which has no
  decompilation.)
- **(R, the corrections)** Terrorist side (R2, n = 1): no minute -- the layer's timer counts 04:03 ... 03:34 one
  second a second straight through the burst. SEAL side (V1, n = 1): all three hostages died in one blast, and the
  timer fell three minutes (05:02 -> 04:58 -> 01:53), then "TERRORISTS WIN!".
- **The minute per hostage: the code as read against the rig -- CLOSED by H1a and H1b** (the rig, r0004 on MP71, the
  host's passive per-frame log, two runs; relayed by the main controller 2026-11-15; on the hub,
  `evidence/weekend-mega-2026-11-14/rig/RELAY1-H1a-penalty-per-rise-0942Z.md` and
  `RELAY1-H1b-penalty-per-rise-run2-0943Z.md`; not harness-scored). H1a: one SEAL claymore killed three hostages, the
  deaths 82 ms apart, the leader's score -2, -4, -6; `mp_penalty` (game `+0x40`) rose 1, 2, 3 in three SUCCESSIVE
  frames (33 ms apart) from 1.93 s of game clock after the deaths; `+0xc0` (last seen) followed a frame behind; the
  round total (game `+0xE4` in r0004) fell exactly 60,000 ms in the frame after each rise, 360000 -> 300000 -> 240000 ->
  180000; the screens "THE SEALS HAVE KILLED A HOSTAGE" x3, "ONE MINUTE HAS BEEN DEDUCTED FROM THE MISSION TIMER",
  "TERRORISTS WIN!"; the HUD 04:56 -> 01:53. H1b: the blast killed two, the third lost one limb's health (15 -> 0) and
  lived; `mp_penalty` 1, 2 in successive frames from 1.98 s after the deaths; the total 360000 -> 300000 -> 240000.
  Across both: never a rise of more than one in a sampled frame, never a cut without a rise; one minute per hostage the
  SEAL killed; **a wounded hostage costs nothing**. So the code (one cut per call that sees a rise, the routine below)
  and the rig agree: the original's script raises the valve once a frame per dead hostage, each rise seen by its own
  call. `PENALTY_COALESCE_READING` ("one minute per rise") is a reading -- measured by the rig, n = 2, not
  harness-scored; the code agrees. (History: "one minute per observed change", 190 C3.5, BELIEVED; then V1 alone, n =
  1, against the code read as one minute per update -- 8f's second read, correction 4.)
- **The port's timing differs (a named reading, no change now).** The port raises all the rises in ONE step 2 s after
  the deaths (`extraction.ts` `script`, `ONE_SHOT_WAIT_READING`), `takePenalties` counts them and `penaltyMinute` cuts
  n x 60 s in that step; the original cuts one minute in each of n successive frames starting 1.93-1.98 s after the
  deaths. The same total; the frames differ.
- **The penalty routine is ONE routine, and the code's prediction sharpened** (8f, relayed by the main controller
  2026-11-15; whole on the hub, `evidence/weekend-mega-2026-11-14/rig/H1-penalty-r0004-addresses-2026-11-15.md`;
  reading, pending review here): `FUN_002a9ee0` is a two-instruction stub that jumps into `FUN_002c00f0` -- D:L150711 and
  D:L163050 are the same machine code, so "its twin" above is one routine: in each build there is exactly ONE penalty
  compare and ONE call of the clock cut `FUN_002a6960`. The compare is "new greater than last seen", followed at once by
  an unconditional store of the new value: the cut fires once per CALL in which a rise is seen, 60 s however large the
  rise. So three hostages killed between two calls cost 60 s, and the code agrees with the rig's V1 (180 s) only if the
  three rises reach the routine in separate calls (deaths, or their `SealKill` one-shots, in different frames with a call
  between each) -- then "per rise" is simply how the kills arrive. The round's total is game `+0xe0` in r0001 (`+0xE4`
  in r0004): a fixed total, not a countdown. THE PORT TODAY: one blast that kills three hostages kills them in ONE step
  (`room.ts` `blastHostages`), each `SealKill` raises the penalty 2 s later in the SAME step (`extraction.ts` `script`),
  and `takePenalties` now counts the three rises and `penaltyMinute` takes three minutes -- matching V1's 180 s by
  counting rises, where the original reaches 180 s through three calls -- as the rig's passive per-frame log (H1a, H1b,
  above) then showed.
- **(D) The endings** (`start`'s chain, research 190 s4.2, with `SEALcheck` setting `rescuecheck` once all three are
  resolved): branch 3 (`rescuecount >= 2 AND rescuecheck == 1`): WAIT 2, "SEALS VICTORIOUS!", a 20 + 1 s hold plus
  the engine's 3 s; branch 4 (`mp_hostages_by_seals >= 2`): "TERRORISTS WIN!" with no WAIT, a 23 s hold. Round-end
  points: win +5 (`FUN_00223970` D:L76146-76160), alive +1 (D:L76162-76165).
- **What that gives on each side:**
  - Terrorists kill all three: each kill raises `rescuecount` and `killcount` 2 s later; at `killcount == 3`
    `rescuecheck` is set and branch 3 runs. (R) "SEALS VICTORIOUS!" within ~5 s of the last death; respawn 30-32 s
    after it; each SEAL +6 (+5 +1); the layer -6 -> -5.
  - Terrorists kill one (or two, with one still alive in the cell): `rescuecheck` stays 0 and the round runs on. (R)
    for one: F1, F3.
  - A SEAL kills two or more: branch 4 at the second kill. (R) three in one blast: V1.
  - A SEAL kills one: `mp_hostages_by_seals` is 1, so branch 4 does not fire; the script says one minute off and the
    round runs on. **Measured (the rig's V2**, r0004, MP71, one run, not harness-scored; relayed by the main controller
    2026-11-15): one hostage killed by the leader's own claymore, the two in the room 100+ u away and the leader at ~21 u
    unhurt; the timer 04:35 -> 03:34 in one second (exactly one minute); "THE SEALS HAVE KILLED A HOSTAGE" / "ONE MINUTE
    HAS BEEN DEDUCTED FROM THE MISSION TIMER", no "TERRORISTS WIN!"; the round ran on to its shortened end; the leader's
    score 0 -> -2, his kills, team kills, deaths and suicides 0, the others' counters unchanged. With V1: one minute per
    hostage; the round ends at once only at the last hostage. THE PORT does exactly this: one SealKill takes 60 s after
    its WAIT 2 and no `eliminated` follows (`central/test` pins and `roomHostageMines`' one-SEAL-kill case); the killer
    -2 (`room.ts` `on('killed')`, `objectiveScore.ts`); the two lines are the page's `roundAudio.hostage('killedBySeals')`
    (`netPage.ts`) (`ONE_SEAL_HOSTAGE_KILL_ROUND_READING`; it was ONE_SEAL_HOSTAGE_KILL_ROUND_PLACEHOLDER).
  - Mixed (one by a SEAL, two by Terrorists): `rescuecount` 2 and `killcount` 3, so the SEALs win by branch 3. (D)
    only.
- **(U)** The rig writes "then TERRORISTS WIN!" after the minute; the reading has branch 4 post at the second kill,
  before `SealKill`'s 2 s WAIT. The order on screen is not timed.

## 7. The port, and what this task changed

| point | port | against the original |
|---|---|---|
| bodies that trip the room's PMN | the living players and, since this task, every targetable hostage's feet (`room.ts` `flyGrenades`' `living()`; `ExtractionAuthority.targetable`: alive and not faded out), taken afresh at each game frame since correction 7 | agrees with (D) and (R); the fade is open; the order inside one frame is unread |
| the page's trip | its own feet plus snapshot bodies with Alive set, hostages included (`matchThrow.ts`, `grenade.ts`) | unchanged (LATER 930's page half) |
| the replay's trip | `viewer/src/replay/fold.ts` `REPLAY_PMN_TRIP_READING` | not touched (outside this task's grant) |
| radius | 3D, r = 10 (`projectile.ts` `proximityTripped`) | agrees with (D); (R) does not contradict it |
| arming | `fuse` 8 s, counted from the throw (its command's age dated back), in flight too -- press -> armed about 9.30 s against the capture's 9.33-9.35 (s1, LATER 1075); no state test since review 1's fold (`proximityTripped`) | the state agrees with (D) (no rig case); the start matches (C) within one or two frames (s1; LATER 1075); (R)'s 10-11.5 s superseded |
| trip to burst | the same frame | differs from (R) (0.08-0.16 s); open |
| dead bodies | not tested (`alive` / `targetable`), at each frame: a body killed in one frame trips nothing on the step's later frames (correction 7) | agrees with (D) |
| booking | `blastHostages` -> `hostageKilled` -> `killed` -> `on('killed')` -2 | agrees; unchanged |
| HostKill credit and SealKill minute's valves | `script()`: each kill a pending entry 2 s later | agrees; unchanged |
| the minute | `takePenalties` hands the room the rises since its last look; `penaltyMinute` takes one `FUN_002a6960` step each (60 s off above 60, else 1 s) | the total agrees with (R) V1, H1a and H1b since this task (was one minute a tick); the frames differ: the port cuts n x 60 s in one step 2 s after the deaths, the original one minute a frame from 1.93-1.98 s (s6); the Terrorist side's no-minute agrees with R2 |
| endings | `result()` polled every tick; `sealCheck`; holds 25 / 23 | agrees with (D), R2, F1/F3; one SEAL kill not measured |

Tests: `packages/match/test/roomHostageMines.test.ts` (the trip standing and moving, the corpse, the Terrorist
side's kills, the minute per SEAL kill and its floor, one SEAL kill; correction 7: a hostage the first PMN kills does
not trip a second that arms later in the same step -- RED, then the fix; the trip cases watch the room's `detonate`
broadcast, which every page gets, not the `blast` only a body the blast reached gets); `packages/central/test/roomExtraction.test.ts`'s
"two kills in one tick" case re-pinned to two minutes; `packages/scene/test/pmnTripInFlight.test.ts` (review 1's fold: a
PMN at fuse 0 trips in flight inside 10 u, not at 10.5 u).

## 8. Readings and placeholders

| name | what it holds | evidence | what settles it | status |
|---|---|---|---|---|
| `PMN_HOSTAGE_TRIP_READING` | the room's PMN trip tests every targetable hostage's feet with the living players' (`room.ts` `flyGrenades`, named on the line; no constant of its own) | (D) `FUN_00550ef0` D:L418452 calls `FUN_00543930`, no team test, dead bodies return first (D:L418112-418113); (R) R2, F1, F2 | open: a rescued hostage in its fade (the port counts it until it is hidden) -- a slow walk-in of a fading hostage, read every frame on the layer's console | reading, pending review |
| `PENALTY_COALESCE_READING` | one minute per rise of `mp_penalty`, however many rise between two looks (`extraction.ts`) | (R) H1a and H1b, n = 2, the host's per-frame log, not harness-scored: three killed, `mp_penalty` 1, 2, 3 in successive frames and the total 360000 -> 180000 ms; two killed (a third wounded), 1, 2 and 360000 -> 240000; one rise a frame, one cut after each; (D) `FUN_002a9ee0` D:L150711-150719, a stub into `FUN_002c00f0` D:L163050-163057: one cut per call that sees a rise -- the two agree, the conflict CLOSED (s6); the port cuts n x 60 s in one step 2 s after the deaths, the original one a frame from 1.93-1.98 s (the same total) | a harness-scored capture of three SEAL kills in one blast | reading (measured by the rig, n = 2, not harness-scored; the code agrees) |
| `ONE_SEAL_HOSTAGE_KILL_ROUND_READING` | one hostage killed by a SEAL: one minute off, the round runs on, the killer -2 (`extraction.ts`; the script's SealKill1 and branch 4) | (D) the script, research 190 s4; (R) V2, n = 1, not harness-scored: exactly one minute, no TERRORISTS WIN, the round ran on, the killer -2 | a harness-scored capture of the same | reading (measured by the rig's V2; was a placeholder, replaced) |
| `PMN_TRIP_REACH_READING` | the trip's reach: 10 u in 3D, feet (`+0x1c`) to the mine's `+0x48` | (D) section 2; (R) 8.1-9.4 u standing and following, read in x/z on lagging copies; unread: whether the ammo record loads before or after the map's MetersPerUnit (D:L217167) sets the x10 scale, so the reach may depend on the map (8f's second read, note 8) | a per-frame read of `+0xc4`, `+0x48` and `+0x1c` on the owner's console; MP71's scale key `0x3f6c70`; the load order against D:L217167 | note only (the port's 10 u stands) |
| `PMN_ARMING_START_READING` | the press -> creation frame: the original's 40th (the capture, s1: press -> armed 9.33-9.35 s), the port's 39th (press -> armed about 9.30 s): matching within one or two frames | (C) PC 3's capture, n = 3 (s1); (D) `FUN_005c1970` D:L476883-476905; `Timer1` counts in flight (`FUN_003c5310` D:L316862-316896) | a frame-exact read of the press frame against the kit tick (`FUN_005be9a0`, `FUN_005c1970`) and the creation (`FUN_005bc730`) | note only |
| `PMN_TRIP_TO_BURST_READING` | the frames from the trip to the damage: the port none; the rig 0.08-0.16 s | (D) states 3-5 unread; (R) n = 5 | a read of states 3 to 5 (`FUN_003c8330`, `FUN_003c7dd0`, `FUN_003c9fb0`), or a per-frame read of `+0x0a` | note only |
| `PMN_CORPSE_TRIP_READING` | whether a corpse ever trips a mine (the port: never) | (D) D:L418112-418113; the writer of `+0x174` unread | a corpse placed 5 u from an armed mine on the original | note only |
| the order of "TERRORISTS WIN!" against the minute line (V1) | the reading posts branch 4 at the second kill, before SealKill's WAIT 2 | (R) V1's strip, untimed | timed frames of the same case | note only |
| the room's trip origins, once per step (review 1, finding 3; 8f's second read, correction 7) | was: `room.ts` `flyGrenades` built the living bodies' origins once per step and reused them for every frame of it, so a body killed by a blast in frame k could still trip a second armed PMN later in the same step; the original's body update returns before the test for a dead body (D:L418112-418113). Now built at each frame (`living()`); within one frame the walk takes the bodies alive at its start, and where the original's body updates fall against the projectile tick inside a frame is unread | (D) as named | FIXED (the main controller's ruling): RED `roomHostageMines.test.ts` "correction 7: ...", then the fix; the order inside a frame: a reading of the frame's update order | reading, pending review |
| the hostage hit at 52 u (F3) | a limb's health lost past the 40 u radius | (R) F3, n = 1 | the blast lane: walls and the node measured from | note only (blast lane) |
| the chain queue's rest gate (fold re-read, finding 1) | the room queues a damaged charge and turns the queue into `trigger` only while the mine is at rest (`room.ts` `chargeHit` ~:9132, ~:8835; viewer `grenade.ts` ~:2214); the original's gate as the port cites it (`FUN_003c69c0` D:L318208-318214, `VOLATILE_STATE_GATE_READING`) refuses only states 5 and 6 -- so with the in-flight trip a PMN in the air trips but a blast on it in the air is ignored | (P) pre-existing, not this task's | note only: settled by reading when `FUN_003caf60` (the damage hookup) first runs for a mine; for the blast and volatile lane |

## 9. Sources

- r0001 decompilation: `FUN_00543930` (D:L410258-410314), `FUN_00550ef0` (D:L418040; the call D:L418452; returns
  D:L418074-418075, D:L418084-418093, D:L418112-418113), `FUN_003c5310` (D:L316893-316900), `FUN_003c5730`
  (D:L316919-316925), `FUN_003cedb0` (D:L322714-322718), `FUN_003d4440` (D:L326559-326563), `DAT_003dfe10`
  (D:L221315), `FUN_005bc730` (D:L474105-474108), `FUN_003c8740` (D:L319271-319277), `FUN_003c7170`
  (D:L318487; the call D:L316904, the site D:L316902-316906), `FUN_0059ee20` (D:L458076-458144; the hostage branch the
  else of D:L458083), `FUN_002a76d0` (D:L149589; "mp_penalty" at 0x3f1140), `FUN_00279490` and `FUN_0027c9f0` (in data
  tables at 0x3dd9f8 and 0x3dd6b8), `FUN_00545390` (D:L411530-411547), `FUN_00545c90`
  (D:L458085), `FUN_002a9ee0` (D:L150681; D:L150711-150719), `FUN_002c00f0` (D:L163019; D:L163050-163057),
  `FUN_002a6960` (D:L148928-148950), `FUN_003519f0` (D:L250783), `FUN_00223970` (D:L76146-76165); `FUN_003c5310`'s
  state returns and node refresh (D:L316850-316896).
- The rig: `seats/rig-Q25-RECORD.md` and `seats/rig-Q25-RECORD-corrections.md` (the corrections win), match
  match-q25b-20261115.
- Research 94 s C5.3, 181 s2.4, 190 s2 and s4, 193 s8.1, 201, 235 s8, 237 s3, 366.

## 10. Review

- Review 1 (fresh reviewer, FAIL, high confidence; recorded on `agent/wm-hostage-records` at 9babd6fb1c,
  `review-records/task3-mines-review-1.md`): the code and rig readings checked out; finding 1, the parity registry
  named the coalesce case's old title; 2, research 237 and 101 still gave `PENALTY_COALESCE_READING` the old value;
  3, the room's origins once per step; 4, Timer1 in flight; and the controller's extra check, `proximityTripped`'s
  `state === 'rest'`. Folded 2026-11-15: 1 and 2 by the registry's three names and entry, and the rows of 237 and 101;
  3 as a note-only row (section 8); 4 in section 1, its row and LATER 1075; the extra check by removing the condition
  (RED `pmnTripInFlight.test.ts`, then the fix) -- reading, pending review.
- **Review 1's fold re-read** (the same reviewer, 2026-11-15): FOLD PASS WITH FINDINGS, high confidence (record on
  `agent/wm-hostage-records`, `review-records/task3-mines-review-1-fold.md`); its two LOW findings folded: the chain queue's
  rest gate a note-only row (s8); the Timer1 countdown's +6 guard and the node refresh's first line (s1).
- **8f's second read** (2026-11-15; record on the hub, `reviews/research-433-second-read-4babb8cd2.md`, relayed): SOUND
  WITH CORRECTIONS (medium) as a reading; the fix PASS WITH FINDINGS (medium) at 35ba242b20. Folded on
  `agent/wm-hostage-mines` (2026-11-15): correction 7 (the origins once per step) FIXED on the main controller's ruling
  -- RED first, then `flyGrenades` builds the origins at each frame (s7, s8); correction 4 re-tags
  `PENALTY_COALESCE_READING` (`extraction.ts`'s doc, s6, s8, research 237 and 101, the registry's
  `objective.extraction.penalty-coalesce`); `FUN_002c00f0`'s callers and the two table entries (s6); the "mp_penalty"
  valve and its listeners (s6, where the note treats game +0x40 -- the relay said s2); the citations of `FUN_003c7170`
  and `FUN_0059ee20`'s hostage branch (s3, s5, s9); the scale's load order (s2, s8, LATER 1076); the moving-PMN rig leg
  dropped (s1). The second read's facts are taken from its record; this branch's host has no decompilation to re-read
  them. Also from the box: the trip cases asserted the hit-only `blast` and so were red although the trip works (a box
  trace: the mine goes off at 8 s, the hostage dies); they now take the `detonate` broadcast.
- **The H1 fold** (2026-11-15, text only; the main controller's relay of the rig's H1a and H1b): the coalesce conflict
  CLOSED -- one minute per hostage a SEAL kills, one rise a frame, the code agreeing -- in s0, s6 (with the port's
  timing difference and the wounded hostage), s8, `extraction.ts`'s doc of `PENALTY_COALESCE_READING` (no code),
  research 237 (s3, its row and the capture list), research 101's row (and the HX-1 heading's count, 14 -> 16, the box's
  `roundLedger.test.ts` finding) and the registry's `objective.extraction.penalty-coalesce`; reading, pending review.
- **A bisect note** (8f's second read, note 8): between 5490bf5093 (`penaltyMinute` per rise) and 6a14da9e34 (the
  re-pin of `roomExtraction.test.ts`'s two kills in one tick) central's `roomExtraction.test.ts` is red; a bisect over
  this branch would stop there.
