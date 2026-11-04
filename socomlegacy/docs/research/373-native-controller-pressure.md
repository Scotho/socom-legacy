# 373 -- Native controller pressure

**PS2P, 2026-11-01 (the gameplay lane, seat 6d; the owner via seat 5d: "communicate with phils open pr .../pull/625, and
if you think feasible to auto-detect pressure sensitive controllers, and when we do, default to the new separate mode we
have with the two states bound, pull it in. Keep our separate logic").** This note was Phil's for PR #625; it is
re-filed to the integrated design, and each place it changed says so. In short: a pressure pad's press no longer runs a
stance machine of its own (`StanceButton.updatePressure` and the lanes' pressure branches are dropped, COMBINED is
B193's unchanged); in SEPARATE the Prone bind's button is read by its pressure and feeds SEPARATE's own Crouch and Prone
binds, as two buttons would (§1, §6); a pressure pad is detected and, with no Stance mode stored, SEPARATE is set with
both states on Triangle (§6). The per-pad "Triangle pressure" toggle is gone; "Connect" stays, Chromium with a
054c:0268 pad only (§2).

## 1. Stance evidence and confidence

**Re-read at the source, 2026-11-01 (PS2P): reading, pending review.** `FUN_00594cf0` in the decompilation
(`socom2_game.elf.decomp.c`, on the owner's host), the stance button's press, D:L453331-453428; research 180 §1.9 read
the same lines:
- the press is armed only from an idle frame (D:L453332-453333: armed when the pad record's byte `+7` reads zero), and
  the arming frame reads no pressure. MOVE-S6 (2026-11-02; reading, pending review): `+7` is the button's press state --
  1 on the press frame, 2 held, 3 on the release frame, then 0 (r0004 slot 5, PCSX2 alone, `tools/eph/probe.ts` scripts `probe-s6-light-after-{50,100,150}.txt`, 3 trials each (agent-mail `evidence/eph-hunt-2026-11-01/probes/S6-DELIVERY.md`, data `r0004-s6-delivery/probe.csv`)) -- so a new press needs one idle frame
  after the release frame (`STANCE_PRESS_REARM_READING`); r0004's twin 0x59a6e0 tests the same byte the same way
  (0x59b448-0x59b458, against r0001's 0x5959c0-0x5959d0). The port steps the press once a 30 Hz game frame
  (`ControllerInput.pressClock`). **Proven 2026-11-03 (S6-PROVEN)**: the same probe with the light press about 67 ms
  after the full release (`probe-s6-light-after-67.txt`, 4 trials; control `-50.txt`, 4 trials; `S6-DELIVERY.md`
  section "2026-11-03", data `r0004-s6-idle/probe.csv`) takes it 4/4 (request 2 -> 1, crouched) and refuses the 50 ms
  one 4/4 (request 2, prone): the timing boundary is proven, within one 30 Hz frame, and 1 fits it. Caveat, the
  byte-level rule is narrower: a single release frame followed directly by the press is refused, a press after an
  idle (0) frame is taken, and a [3, 3] prefix splits (50 ms t2 refused, 67 ms t3 taken; the light press's first byte
  2 refused, 1 taken) -- "re-arm after one idle frame" fits every trial whose sampled byte shows the idle frame, and
  the 30 Hz sampled byte alone does not decide [3, 3] (its sampling phase against the function's test);
- armed, the pressure (pad `+0x2c`, a float) is followed by its peak `DAT_0066b410` (D:L453336-453338); the press is
  decided on the frame the pressure reaches 0.3 (`0.3 <= pressure`, D:L453339-453341) or on the first frame it falls
  below the peak (D:L453343-453345) -- a light press is taken as soon as it eases, not only at zero;
- decided, it is disarmed until the next rest (D:L453347-453349); a peak under 0.3 is the light press (D:L453351: stand
  and crouch toggle, prone to crouch where `FUN_005857e0` allows it, else stand), 0.3 or more the full press
  (D:L453380: the dive, else prone, from prone stand -- the water columns in `pressInWater`); the peak is cleared
  (D:L453428).

The port's light and full presses are SEPARATE's Crouch and Prone binds (`stanceButton.ts` `StanceButton.lanes`,
`WalkMode.crouch`), already the original's two branches (STM.R2a); the integration adds no stance rule. The 0.3 is
`STANCE_FULL_PRESS_READING`.

*Changed 2026-11-01:* Phil's text below said the decompilation was absent on his host and these lines were not re-read;
they are re-read above. His "light release" is the first decline below the peak, which the code (`controllerInput.ts`
`StancePress`) follows. Still owed: the review's re-read by a reader who did not write this, and a capture of the
original pressed lightly and firmly.

*Phil's text, kept for the record:* Existing source citations in `stanceButton.ts`, research 87 §1.13 and
research 86 §7 point to `FUN_00594cf0` D:L453331-453425: the peak under `DAT_0066b410` (0.3) selects the light-release
branch; reaching it selects the full-press branch. Light release toggles stand/crouch and requests crouch from prone;
full press requests prone from stand/crouch and stand from prone. Existing water gates remain in `pressInWater`.
The request still goes through WalkMode's existing collision, traversal and stance refusal path.

(Phil's host, 2026-10-31:) The original decompilation export is absent on this host. These citations were transcribed from existing repository
notes and code; they have NOT been re-read here. The decoder's physical values do not prove the gameplay threshold,
branch boundary, minimum activation threshold, peak-reset rule, or parity of the game's acceptance conditions.
A fresh source review must check those before landing. A capture comparison must measure native drops and dives.
~~No original running capture was made and nothing here is claimed proven.~~ *(Corrected 2026-11-03, S6-PROVEN: true
of Phil's 2026-10-31 text; since then r0004 captures of the original were made (MOVE-S6's delivery probe, 2026-11-02,
and the one-idle-frame probe, 2026-11-03), and the re-arm, `STANCE_PRESS_REARM_READING`, is proven by the 2026-11-03
capture ("Readings and placeholders" below). The 0.3 threshold and `STANCE_PRESS_ACTIVE_PLACEHOLDER` are not.)*

## Readings and placeholders

| constant | value | gap and settling evidence |
|---|---|---|
| `STANCE_PRESS_ACTIVE_PLACEHOLDER` | 0 | Narrowed 2026-11-02 (MOVE-S6): the pressure at or under which the button reads released in the press state `+7`, above which a press begins. Which byte re-arms is settled (`STANCE_PRESS_REARM_READING`); the capture (r0004 slot 5, PCSX2 alone, `tools/eph/probe.ts` scripts `probe-s6-light-after-{50,100,150}.txt`, 3 trials each (agent-mail `evidence/eph-hunt-2026-11-01/probes/S6-DELIVERY.md`, data `r0004-s6-delivery/probe.csv`)) shows `+7` pressed (1, 2) at 0.2 and 1.0 and idle (0) at 0. Not measured: a press under 0.2 -- whether the pad's press state reads it. The 2026-11-03 probe (S6-PROVEN, 67 and 50 ms, 4 trials each) varied the timing only, at 0.2: done for the re-arm, not for this. Settles it: the same probe with the light press at 0.05 and 0.1. |
| `STANCE_PRESS_REARM_READING` | 1 | MOVE-S6, 2026-11-02 (reading, pending review; proven by capture 2026-11-03, below): the idle game frames a new press needs after the release frame. FUN_00594cf0 re-arms only when `+7` reads 0 (D:L453332-453333; r0004 0x59b448-0x59b458, the same test as r0001 0x5959c0-0x5959d0), and `+7` reads 1 / 2 / 3 / 0 for press, held, release frame, idle (r0004 slot 5, PCSX2 alone, `tools/eph/probe.ts` scripts `probe-s6-light-after-{50,100,150}.txt`, 3 trials each (agent-mail `evidence/eph-hunt-2026-11-01/probes/S6-DELIVERY.md`, data `r0004-s6-delivery/probe.csv`)): a light press 50 ms after a full one's release goes 3 -> 1 with no 0 and is not taken (the request `+0x374` unchanged, 2/2 valid trials; t1 void, its full press never reached the pad); at 100 and 150 ms it is (request 2 -> 1, 3/3 each). The port steps the press once a game frame (`ControllerInput.pressClock`, the match pages' `performance.now`). **Proven 2026-11-03 (S6-PROVEN)**, the cites above kept: `probe-s6-light-after-67.txt` and `-50.txt`, 4 trials each (`S6-DELIVERY.md` section "2026-11-03 03:1xZ: one idle frame", data `r0004-s6-idle/probe.csv`): the light press about 67 ms after the full release taken 4/4 (request 2 -> 1, crouched), at about 50 ms refused 4/4 (request 2, prone); what is proven is the timing boundary, within one 30 Hz game frame, and 1 fits it. Caveat, the byte-level rule is narrower: over all 8 trials a single release frame (`+7` 3) followed directly by the press is refused (50 ms t1, t3, t4), a press after an idle (0) frame is taken (67 ms t1, t2, t4), and a [3, 3] prefix splits -- 50 ms t2 refused, 67 ms t3 taken, differing only in the light press's first byte (2 refused, 1 taken; `S6-DELIVERY.md` lines 35, 38, 51-52, ac's correction); so "re-arm after one idle frame" fits every trial whose sampled byte shows the idle frame, and the 30 Hz sampled byte alone does not decide [3, 3] (its sampling phase against `FUN_00594cf0`'s test; not read in code). No harness spec or golden trace holds it; `stancePressRearm.test.ts` holds the captures' outcomes (50, 67, 100, 150 ms); the cited lines' re-read by a reviewer is still owed. |
| `STANCE_FULL_PRESS_READING` | 0.3 | Re-read 2026-11-01 (reading, pending review): FUN_00594cf0 D:L453339-453341 (`0.3 <= pressure` decides at once), D:L453351 / D:L453380 (the peak under 0.3 the light press, else the full). Proven only by a pressure-scripted capture of the original. |

## 2. USB/browser adaptation

The developer's Mac exposed Sony USB VID 054c PID 0268, product `PLAYSTATION(R)3 Controller`. Brave's Gamepad tester
reported `PLAYSTATION`, standard layout, Triangle only 0/1. A local read-only WebHID input probe observed Triangle
values across 0..255; the developer confirmed that range. This establishes real pressure on this USB interface,
not its physical controller model and not original-game parity. No serial or private device data is stored.

The reader follows SDL's maintained PS3 USB implementation:
https://github.com/libsdl-org/SDL/blob/main/src/joystick/hidapi/SDL_hidapi_ps3.c
(`HIDAPI_DriverPS3_HandleStatePacket`, `button_axis_offsets`). Full report ID 1 is 49 bytes; WebHID delivers the ID
separately, leaving 48 payload bytes. Full-report bytes 14..25 hold d-pad, shoulders and face pressure; Triangle is
byte 22 (payload offset 21). The four stick bytes are 6..9. Digital bits are full-report bytes 2..4. Pressure values
are divided by 255, not invented from press duration. The decoder rejects other IDs and lengths.

The connection is explicitly requested by a person in controller mapping, limited to that VID/PID, with no output
or feature reports, driver installation or Bluetooth pairing. A virtual standard pad preserves this report's own
buttons and axes rather than associating raw pressure with an unrelated browser pad. A stale report is replaced by neutral input after
250 ms while retaining the connected device identity (browser adaptation), and input cancellation plus a real button-rest requirement prevent a timeout from releasing or rearming a stance press. Disconnect removes listeners and closes the device. Reconnect is explicit per page.

Gamepad API analog values and limitations: https://www.w3.org/TR/gamepad/ .
WebHID permission and platform contract: https://developer.chrome.com/docs/capabilities/hid .
*Changed 2026-11-01 (PS2P):* the per-controller "Triangle pressure" option is removed -- the Button mapping showed it
for every pad, so on a DualSense (0 / 1 face buttons) every Triangle press went prone. Native pressure no longer runs
its own stance requests across both modes: COMBINED is the digital mode's (the pop and the timed hold, unchanged), and in
SEPARATE the pad feeds SEPARATE's own binds (§1, §6). The "Connect USB pressure controller" row stays, offered only
where WebHID is (`navigator.hid`: Chromium; not Firefox or Safari) and a 054c:0268 pad is connected. The profile's
`nativePressure` field is still parsed; with no row setting it, an explicit value stored before overrides detection.

*Phil's text, kept for the record:* The generic Triangle pressure option is opt-in per controller: only use it when real
analog values are exposed. Native-pressure input uses original stance requests even if the browser's global digital
mode is COMBINED or SEPARATE. Existing separate binds and adapted pop requests are not fed by that pad. Digital
controls retain their timer.

*Changed 2026-11-02 (the reconciliation of #625 against PS2P, `agent/ps2-pressure`; corrected at its review's fold,
2026-11-03):* a frame marked `stanceCancelled` -- this reader's stall, the overlay's synthetic neutral (`modern/overlay`
`untouched`, any pad) -- is again no stance release in both Stance modes, as Phil had it (his `playerLanes` line, PR
#625), for three things only: Triangle's press under way is spent (`StanceButton.reset(true)`) and the pop's window
closes; SEPARATE's light or firm press off Prone's button is dropped (`StancePress`, §6); and the Crouch bind's release is
not taken on it (`matchLanes.ts` `playerLanes`; the review's F1, 2026-11-03). PS2P had kept the cancel in `StancePress`
only, so in COMBINED the neutral read as Triangle let go and the tap's crouch fired -- an adaptation making the game act.
The other lanes are not guarded. No stance rule changes; tests `test/matchLanes.test.ts` ("a cancelled frame is no
release"). The duplicate of Phil's §1 paragraph that followed his kept text is removed. Open, filed by the review
(2026-11-03): LATER 662 (simulation track) -- the overlay's `withheld` lets a held button go without the cancel, so on a
Sony-order pad, whose digital bit may drop before its pressure byte reaches 0, an armed `StancePress` may read the
let-go as a firm press (a phantom prone); LATER 663 (product track) -- Restore defaults in SEPARATE on a pressure pad
re-clones Prone without `bindPressureCrouch`; LATER 664 (product track; simulation if confirmed) -- the 250 ms stall
assumes a pad that reports continuously: an on-change pad held still is cancelled, and with the guard a COMBINED hold
never reaches its prone.

## 3. Evidence ledger

- Physical USB input: local read-only WebHID probe and developer report, Triangle 0..255.
- Unit: synthetic reports and pressure timelines; see the plan Log for completed checks.
- Source inspection: SDL USB format inspected; original game's cited function unavailable, re-read owed.
- Rendered browser: see plan Log. Physical in-game playtest and original capture comparison remain owed.

## 4. Physical mapping correction (2026-10-31)

The developer rejected the first in-game mapping: "triangle opens the scoreboard as well as crouching r1 leans when
it should be right d pad to lean". A read-only WebHID capture reproduced both: Triangle alone payload bytes 0..4
were `0,1,0,0,0` with pressure at payload 21; R1 alone was `0,32,0,0,0` with pressure at payload 20. Treating these
as Sony's original digital order produced SELECT and d-pad right respectively. VID/PID and pressure offsets do not
establish the digital order. This was an implementation error, not a gameplay preference.

A second guided physical capture established SELECT=bit8 (256), START=bit9 (512), L3=bit10 (1024), R3=bit11 (2048).
The adapter decoder now uses the twelve analog pressure channels for its pressure-button states and these four
captured digital positions. Its Guide bit is not verified and is not synthesized. Other pressure buttons' channel
positions remain SDL format transcriptions, not individual physical acceptance claims.

Each connection is identified from an unambiguous Triangle or R1 pressure/digital pair. Sony's original digital order
remains supported separately. Until either pair establishes an order, the virtual controller stays neutral; the
connection prompt asks for Triangle once. An ambiguous or unsupported layout is never silently treated as Sony.
The identified order persists through digital-only reports and is forgotten on disconnect. Synthetic regression
inputs reproduce the captured values; no original game's stance semantics changed.

The native virtual controller also enters the modern overlay's input ownership before shadowing, so menus consume
it as they consume physical pads. Enumeration deduplicates the shadowed virtual identity and keeps the overlay's
selected-controller list consistent with gameplay.

## 5. Human acceptance and macOS Home interception

After the corrected mapping, macOS still opened Apple Games when Triangle was pressed. System Settings > Game
Controllers showed Enable Home Button Actions on, targeting Games. On the developer's request this local switch was
turned off and verified off. This preference is outside the browser game and affects this Mac's Home shortcuts only;
other players' settings are not changed. macOS treating this adapter's Triangle as Home is an inference from the
symptom and digital-layout mismatch, not a scored OS input trace.

Afterwards the developer reported **"works great push it up"** (2026-10-31): physical acceptance for this tested
Mac/Brave/controller setup. No broader controller matrix or original-game capture comparison is claimed. The source
threshold and minimum activation gaps in §1 remain open.

## 6. PS2P integration into SEPARATE (2026-11-01)

The owner's words (via seat 5d, 2026-11-01): "communicate with phils open pr .../pull/625, and if you think feasible to
auto-detect pressure sensitive controllers, and when we do, default to the new separate mode we have with the two
states bound, pull it in. Keep our separate logic". Seat 5d's design: no new stance decision; everything through B193's
lanes and stanceCut.

- **The mapping (simulation track; reading, pending review).** `ControllerInput.poll`, in SEPARATE on a
  pressure-capable pad: the Prone bind's button's pressure goes through `StancePress` (§1's machine). The full press is
  the Prone bind's one-frame press (`prone`, acted at its edge by `StanceButton.lanes`), the light press the Crouch
  bind's one-frame press (`crouch`, acted at its release by `WalkMode.crouch`). A Crouch bound to a button of its own
  (the touchpad, L3) is held as on any pad besides. A cancelled frame (`stanceCancelled`: the WebHID stall, the
  overlay's synthetic neutral) drops the press undecided and waits for a rest. Phil's `!nativePressure` gate on
  SEPARATE (it switched SEPARATE's binds, and SEP-SHOW's touchpad Crouch, off for a pressure profile) is dropped.
  Tests: `test/pressureSeparate.test.ts`.
- **COMBINED** is B193's, pressure or not: `padInput`'s `stance` is the button's own press again (Phil's
  `stance = pressure > 0` dropped); `stancePressure` is carried beside it and decides nothing. Pinned by running the
  same presses with pressure values and with 0 / 1 (`test/pressureSeparate.test.ts`).
- **Detection (product track, a browser adaptation; `pressureDetect.ts`).** A pad is pressure-capable when it is the
  WebHID 054c:0268 reader's pad and Triangle reads strictly between 0 and 1 on 2 or more reports of one press
  (`PRESSURE_HID_FRAMES`), or a Gamepad API pad of the standard mapping reads a face button (0-3) strictly between 0.05
  and 0.95 (`PRESSURE_FACE_LOW`, `PRESSURE_FACE_HIGH`). L2 / R2 and pads of another mapping never count. The detection
  holds for the pad's id for the page's life. These thresholds are the adaptation's, not the game's.
- **The auto default (product track).** At the first detection, when no Stance mode is stored (`STANCE_MODE_KEY`),
  the default is only recorded, by whichever reader saw the pad (`recordPressureDefault`). Seat 5d's fold
  (2026-11-01: "The mode must never change under the player in a match"): it is applied at the front end's console's
  next frame (`applyPressureDefault` from `ConsoleController.remapFrame`; never the overlay's console over a match), and
  only if no mode was stored meanwhile -- SEPARATE set and entered: Prone cloned from Triangle (`cloneTriangleToProne`),
  Crouch put on the same button (`bindPressureCrouch`), and the console says "Pressure controller: Crouch and Prone
  bound to Triangle" once -- that line only when Crouch was bound so; where `bindPressureCrouch` declined (a Crouch the
  profile already holds), the line names the profile's real binds ("Pressure controller: SEPARATE on; Prone on
  Triangle, Crouch on R3"). Only the launcher's console applies it (`S.mode === 'page'`): a player who opens the game
  page directly and never visits the launcher never gets the default -- it stays pending, and a reload clears it (as
  briefed; the review's finding 1, 2026-11-01). A stored mode is never changed. Entering SEPARATE by hand on a detected pad binds the same
  way. The Button mapping's Crouch and Prone rows read "Light press" and "Firm press" when they share the button; a
  Crouch left unbound while pressure is active reads "Light press (Triangle)" -- or Prone's button, when that is not
  Triangle -- since the light press still crouches (the fold's second part). Tests: `test/pressureDetect.test.ts`,
  `test/console/remapPressure.test.ts`.
- **Evidence apart.** Unit tests on synthetic pads only. Source inspection of FUN_00594cf0 by the author (pending the
  review's re-read). No rendered browser run and no hardware run of the integrated design: a hardware run with a
  054c:0268 pad over WebHID and with a Gamepad API pressure pad is owed (Phil or the owner). Phil's 2026-10-31 physical
  acceptance (§5) was of his design, not this one. No capture of the original.
