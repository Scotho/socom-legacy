# 443 -- The fire button read as the PS2 reads it: the two-read press (LATER 1147)

- Date: 2026-11-17. Branch `agent/press-parity` (worktree `wt-press-parity`), base `agent/next` 9e80907b9a; landed in
  v0.4.25 (`agent/press-parity` 144a776bf4 is in the tag). Re-filed 2026-11-18 (the code close review at ad72c24334,
  F4; LATER 1156): this header only.
- Ordered by the owner (the main controller's window, INTAKE 134, about 03:33Z: "Yeah i think so on that fix. Our main
  prio i think"), relayed by the main controller e09c6f3d.
- The plan is `agent-mail/handoffs/stage2/PLAN-press-parity-core.md`. The number 443 and LATER 1147 are entered (the
  merge seat's successor's claims; LATER 1147's row in `docs/LATER.md`).
- Track: simulation.
- Reviewed (the agent-mail paths under `evidence/weekend-mega-2026-11-14/reviews/`), each named with its verdict:
  - this note: `press-parity-443-review.md`, PASS WITH FINDINGS (high), 2026-11-17T03:59:34Z; findings F1-F6 folded by
    the author -- the folds were not re-reviewed as a note;
  - the code after it: `press-parity-wiring-review-7b2c5eca7.md` FAIL, then `press-parity-fix-review-4bb4ad346.md` PASS;
    `press-parity-rereview-213a9cfd.md` FAIL (one test string, fixed at faaa0cef0c), then
    `press-parity-reread-186ccfaf4.md` PASS; `press-parity-read-918ae3752.md` PASS; `press-parity-read-144a776bf.md` PASS;
  - the release candidate's code close review (`close-code-review-ad72c2433.md`, PASS WITH FINDINGS, medium) re-read the
    pad layer's citations (`FUN_002d9ff0`, `FUN_002c60c0`) at the source.
- Evidence kinds, kept apart:
  - **(D) source inspection** of the decompilation, reviewed in part (`reviews/T4-port-holds-review.md`, P3);
  - **(C) a capture of the original online**, read and reviewed (`bugs/padlag-rows-read.md`,
    `bugs/padlag-rows-fresh-review.md`; rows `bugs/captures/padlag/`);
  - **(U) unit tests:** the RED (`viewer/test/padButton.test.ts`, `padlagReplay.test.ts`, `firePressParity.test.ts`).
  - The agent-mail paths are under `evidence/weekend-mega-2026-11-14/`.

## 1. The rule (levels)
- **The pad layer, per button, once per console update** (`FUN_002d9ff0` D:L179137-179168). (D) reading, reviewed (T4
  review P3).
  - down: 0→1, 3→1, 1→2, 2 stays;
  - up: 1→3, 2→3, 3→0.
- **The fire button's query is "held" = state 2 only** (`FUN_002c60c0` D:L166671-166686), read into ctrl+0x118 by the
  human controller's update `FUN_00594cf0`. This is the ORDINARY branch only (D:L453541-453566). (D) reading, reviewed.
  - A second branch (D:L453478-453540) moves ctrl+0x118 from a pressure value instead (`FUN_002c6350`, button 0x1d or
    0x1a). It is taken when ctrl+0x170 bits 0x40 / 0x80 are set and `FUN_0059d830(body)` answers; a forced release is
    at D:L453494-453506. NOT modelled; when the branch is live is not established (review F4).
- **The kit, once per update after the controller** (`FUN_005506a0` D:L417905-417907; `FUN_005c0fd0`):
  - a round leaves when the trigger reads down, the timer is ≤ 0 and the pull's count is under the mode's limit
    (`FUN_005c0ae0` D:L476354-476448; `FUN_005c0940` D:L476283-476310);
  - the timer is set to the wait (`FUN_005c09f0` D:L476313-476341: FireWait, × 0.8 in burst and automatic), then run
    down by the update's own dt and clamped at 0 (D:L476643-476647);
  - a 0 or 3 read clears the count (D:L476380-476382, D:L476399-476400).
  - **NOT the whole condition** (review F3; NOT modelled), all at the gate:
    - the readiness weight `FUN_00286b80` < 1.0 with kit+1 bit 0x4 (D:L476419-476428);
    - `FUN_005a7de0` (D:L476442);
    - `FUN_005bd530` and the weapon-type list (D:L476449-476468);
    - the end checks (D:L476470-476505).
  - The gate runs only with kit+0x820 == 0 and `FUN_005c1970` true (D:L476549-476566); otherwise neither a round nor
    the count clear happens. The capture's press 1 (a late round) is this case.
  - The port keeps its own counterparts where it has them (LATER 180's raise refusal, the reload lock).
  - **Faithfulness of the pad-to-gate mapping** (review N2, line 2): ctrl+0x118 is in {1,2} exactly when the pad query
    answered held, and the gate passes on {1,2} and clears on 0 / 3. So driving the gate from the pad state is the same
    while the trigger is stepped every update.
- **MEASURED online on the 9mm Sub (C, reviewed):**
  - no round on any pad-state-1 row (31);
  - the first round on the first state-2 read (26 presses at f0+1);
  - the timer at a round = 0.0600 less that update's dt; the second round when the timer is spent (timer + step = 0.0600
    on 56 of 57).
  - **proven** for the 9mm Sub online in a ×0.8 mode, within the rows' stated exceptions (§3). It is automatic per the
    capture's setup log; the rows carry no kit+0x6fc and do not tell automatic from burst (review F2). A **reading** for
    every other weapon and mode.
- **A press the pad sees as 1 -> 3 fires nothing: MEASURED online, rows READ and REVIEWED** (relay-1's short-press capture
  `bugs/captures/padlag/short/padlag-short.zip`, 3,427,899 B, sha 9839761a; the 9mm Sub automatic). The read is
  `bugs/padlag-short-rows-read.md`; its fresh review `bugs/padlag-short-rows-fresh-review.md`, PASS WITH FINDINGS (high),
  re-derived every count.
  - The rows are sound: keyed by distinct clock values, no clock step of 50 ms or more, ctrl+0x170 = f80820 throughout.
  - **proven** for the 9mm Sub in a ×0.8 mode online, within the stated exceptions.
  - As relayed, and then confirmed by the read: no press read down on exactly one update. The shortest read pad 1, then 3, NEVER 2: ctrl+0x118 stayed 0
    and NO round left (30 ms presses 34 of 34, 45 ms 25 of 25, 60 ms 8 of 8; 67 presses, 0 rounds; 6 of 40 30-ms presses
    never seen at all).
  - Every press that reached pad 2 read ctrl+0x118 = 2 on that update and fired one round (45 ms 14 of 15, 60 ms 31 of
    32). The exceptions were each train's FIRST pad-2 press after its reload: the gate held them by one of its unlogged
    conditions (§1). WHICH condition is NOT shown; the reload itself is the run script's (review caution).
  - Read: 67 of 67 presses read 1 -> 3 with ctrl+0x118 staying 0 and no round; all 45 rounds left on the first pad-2 read
    with ctrl+0x118 = 2, and none on a non-2 row. One 60 ms press read pad 1 on two updates before the 2, as padlag's 15
    and 19.
  - The module agrees: `padStep` goes 1 -> 3 on a release from 1, and `KitTrigger` fires on state 2 only. A second replay
    case from these rows is owed when the read is in.
- **The AI does not use the pad layer.**
  - `CSealCtrlAi`'s engage `FUN_00563e10` writes ctrl+0x118 through `FUN_00597810` (D:L428041, D:L454390-454420), as do
    `CAiSDeploy`'s `FUN_0055d120` (D:L424496) and `FUN_005659e0` (D:L428507). That table goes 0→2 on its first call, so
    an AI round leaves on the update it decides.
  - (D) reading, reviewed (review N4). A call through a function pointer cannot be ruled out from the text.
- **Other buttons:** most controls read the raw state through `FUN_002c64e0` and act on 1, the first read. That is 27
  call sites in 17 functions; spot-checked in `FUN_00594cf0`: buttons 9, 10, 6 and 3 on `== 1` at D:L453288-453470,
  button 1 on `== 3` at D:L453474.
  - Only `FUN_002c60c0`'s three call sites wait for 2: the fire button (D:L453543); button 0 in `FUN_00594c90`
    (D:L453011, from D:L442934); button 0xc in `FUN_001f7ff0`, OR'd with its state 1 (D:L56761).
  - The 30-site table (corrected from "32", review F1) is owed as a reading. The build changes the fire button only.
    (D) reading, reviewed (review N5).

## 2. The build (the port)
- **The page:** the human page's `Fire` samples its trigger once a kit step on a continuous `GAME_FRAME_DT` clock (no
  restart at the press). A transcribed pad step (`viewer src/padButton.ts`, new) feeds the kit gate, and no round leaves
  at the page-frame press. Press rounds are named at their step's command.
- **The step:** the fixed game frame (MISSION R8; research 437). The console's own uneven updates (the capture: 16.7 /
  33.4 / 50 / 66.7 ms; offline a 50 / 16.7 / 33.4 cycle) are load, not a rule, and are not replayed. The REPLAY test
  drives the transcribed module with the capture's own dt to show it reproduces the rows.
- **The step's phase** (the main controller 581a5036's ruling on the MP51 spec, 2026-11-17, condition (b)): where a
  kit step falls against the page's frame is the PORT's own, not the original's and not a reading. The `Fire`'s
  `GAME_FRAME_DT` clock runs from the page's clamped frame time (`viewer src/main.ts` `frameTime`) and starts with the
  `Fire`, with no restart at a press. The console's update phase against its pad poll is its own load (the uneven
  updates above) and is not modelled. So the blind spot is the original's: a release no update reads is not seen
  (§1, 6 of 40 30-ms presses never seen). WHICH page-frame release falls in it is the port's clock's: "unseen" is on
  the port's clock, not the console's. Pinned by `viewer test/firePressParity.test.ts` "the MP51 trace". The browser
  spec `viewer e2e/gameplayAudioFollowup.spec.ts` holds each R1 state over at least one step (4 walk ticks), so its
  claim does not rest on the phase.
- **The room's gate** (`net/fireGate.ts`): re-derived for rounds on whole steps (the "less a tick" and
  `FIRE_SCHEDULE_SLACK_ADAPTATION`). CPU seats keep today's bounds (§1: the AI bypasses the pad).
- **The gate's slack, TRIED AND NOT TAKEN** (the main controller e09c6f3d's ruling, 2026-11-17 about 05:05Z):
  `FIRE_SCHEDULE_SLACK_ADAPTATION` stays 2. Slack 1 passes every honest train at 30, 60 and 144 Hz and on uneven frames,
  and the bots pass at both. But slack 1 lets a forged every-command claim land 11 rounds where 2 lands 1
  (`match/test/roomRifleJitterBloom.test.ts` (b)). It is the port's own guard, so it is not changed tonight.
  `fireCycleTicks` (wait × 60 − 1) is kept: two rounds a wait apart, each named at the tick at or before its step, can
  still be a tick short.
- **The protocol:** 17→18 (`PROTOCOL_VERSION`; LATER 1141 will take the next). No frame changes, so a 17 recording
  decodes under 18 on the live decoders (`match/src/replay/format.ts`; pinned by `match/test/replayFormat.test.ts`'s
  protocol-17 case). **Before any deploy: the page and the match server ship together; a 17 peer and an 18 peer refuse
  each other at the hello.**
  **The bump also carries a change of meaning (the code close review at ad72c24334):** WM-DATA-DMG-C changes the
  MEANING of `damageReport.health` (raw part health becomes DMG points, a life is 100) with NO frame change; a page
  and a room on different protocols would draw DMG a hundredfold off; only the 17 -> 18 bump, which refuses the mix at
  the hello (match `src/room.ts` :3304), keeps them apart: this release MUST drain every host (the run sheet's order
  (A)).

## 3. Open

### 3.0 NAMED UNKNOWN: the trigger's PRESSURE branch (`TRIGGER_PRESSURE_BRANCH`; the build models the DIGITAL path only)
- **What it is:** `FUN_00594cf0`'s second branch (D:L453478-453540) moves ctrl+0x118 from an analog value
  (`FUN_002c6350`, button 0x1d or 0x1a, × `DAT_00650660`), not from `FUN_002c60c0`'s held-at-2.
  - It is taken when ctrl+0x170 has bit 0x40 or bit 0x80 set AND `FUN_0059d830(body)` answers.
  - With 0x80 set it also asks `FUN_005a7d10(body, 0)` and clears 0x40 when that answers 0. A forced release is at
    D:L453494-453506.
- **Not known:**
  - what sets bits 0x40 / 0x80 (no writer found beside the controller's own clears; not traced);
  - what `FUN_0059d830` and `FUN_005a7d10` test;
  - whether the branch is ever live for the fire button (R1) on a DualShock 2 in a match.
  - A use other than ordinary fire (e.g. a throw's strength) is possible, and only a guess.
- **Why it matters:** if it is live for R1, a LIGHT press might not fire at all on the PS2. That is the same direction as
  the owner's suspicion that ours makes fire easier.
- **The evidence that would settle it:**
  1. the pad mode the game asks libpad for (digital, analog, or pressure-sensitive; the pad init's mode calls);
  2. the writers of ctrl+0x170 bits 0x40 / 0x80, and a read of `FUN_0059d830`;
  3. one rig capture of ctrl+0x170, ctrl+0x118 and the R1 pressure byte under a partial R1 press in a match, if PCSX2 can
     send a pressure value.
- **Until settled:** the parity build models the digital path only (`viewer src/padButton.ts`; the wiring's record says
  so). If the build needs a constant for it, it is a `*_PLACEHOLDER` listed here and in the ledger.
- **Level:** placeholder (not read).
- **First evidence, AS RELAYED (rows not yet read):** ctrl+0x170 read "f80820" in every row of the short-press capture.
  - If that is a little-endian word read at +0x170, the byte the branch tests (`*(byte *)(ctrl+0x170)`, bits 6 and 7 by
    the shifts << 0x39 and << 0x38) is 0x20: bits 0x40 and 0x80 are CLEAR. So in those rows (the digital train) the
    pressure branch was not taken.
  - It does not settle a partial press. relay-1's pressure capture (R1 at 0.25 and 0.50) is running.
  - The read's width and byte order are to be confirmed from the reader.
- **THE PRESSURE CAPTURE: measured, AS RELAYED, rows NOT YET READ** (relay-1, online, PCSX2 sending a partial R1;
  `bugs/captures/padlag/pressure/padlag-pressure.zip`, 4,771,412 B, sha 1f74f5e5; the bugs lane's read is deferred
  behind the short-press rows). **The branch was not live for R1 online in this capture.**
  - The game read R1's pressure as a float at P+0x3c (0x82ed8c): 0.2471 / 0.4980 / 1.0.
  - ctrl+0x170 = f80820 in every row: bits 0x40 and 0x80 never set.
  - A light (quarter) press FIRES: 20 of 20 presses, 2-3 rounds each. Half: 20 of 20. Full: 17 of 20 (its first 3 fell
    in a reload).
  - **Kept:** the constant stays named until the rows are read, and the build models the digital path only (consistent
    with this capture: a partial press acts as a full one).
- The two presses whose pad read 1 on two updates (padlag presses 15 and 19), and press 7's hidden first read.
  - The failed-read skip IS in the source: `FUN_002da930`'s per-button steps (D:L179820-179862) sit inside a test of the
    read's success (D:L179547-179863) (review F5). That it explains presses 15 and 19 is not shown.
  - The poll's place in the frame (`FUN_002d9e40` at D:L50795 in `FUN_001ebed0`): open.
- libpad's own sampling lag.
- The one-read tap firing nothing: unmeasured.
- Weapons and modes other than the 9mm Sub automatic: the reading only.

### 3.1 Readings
| Name | Where | What | Status |
|---|---|---|---|
| `PULL_COUNT_CLEAR_AIM_GATE_READING` | viewer `src/fire.ts` `update` (the count clear at an untimed step) | The port clears the pull's count (`kit+0x818`) on a read not held at every untimed kit step, unconditionally. The original clears it only inside `FUN_005c0ae0` (D:L476380-476382, D:L476399-476400), which the kit frame reaches only when `FUN_005c1970` answers (D:L476564-476567). `FUN_005c1970` is not read whole (its read is held with LATER 1143), so a gate moved onto it would be a guess (the main controller 581a5036's ruling, 2026-11-17). Where it refuses, the two may differ. Settled by: the whole read of `FUN_005c1970`. No test of tonight's depends on it (its aim always answers). | reading (the divergence named; not settled); LATER 1149 (travels with LATER 1143) |
| `RAISE_ONE_READ_A_FRAME_READING` | viewer `src/fire.ts` `padHeldRead`, read by `src/matchFirearm.ts`'s raise input | The rifle's raise now reads the kit step's held answer (the main controller 581a5036's ruling, 2026-11-17: the original asks the raise only at ctrl+0x118 2 or 1, `FUN_005dfe30(.., 1)` D:L453633-453634 / D:L453612-453613, and in a frame the controller D:L418526, the raise tick `FUN_005dfc80` D:L418611, then the kit D:L417907). The port's raise takes ONE trigger input a page frame (`WeaponRaise.frame`), so two limits remain. (1) On a page frame that ends two or more game frames (below about 30 fps; the 0.1 s clamp is three), a press from up is heard at its first step, a game frame early, where the original's first read is state 1 (not held). (2) A press read once and let go before the second read, on a page frame that ends no step, still asks the rifle up, where the original's pad reads 3 and asks nothing. Neither changes a round at 30 or 60 Hz with the press held two reads (raiseRefusal at 30 and 60 Hz, leads 0-3). Settled by: the raise stepped once per game frame inside the kit's loop, if a slow-page or tap capture shows the difference. | reading, pending review (the port's own limit, named) |

