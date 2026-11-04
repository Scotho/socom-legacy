# 254 -- DEFAULT fire mode as the original reads it (PAR-22)

- Date: 2026-10-08 (web sprint PARITY-1, wave 2, seat B; plan
  [`../plans/2026-10-08-web-sprint-parity.md`](../plans/2026-10-08-web-sprint-parity.md), row PAR-22 and gate D17;
  branch `agent/par22`, base add885ea = the lane with PAR-24 merged).
- Status: **reading, pending review** for the original's side (§1-§3, re-read here at the decompilation and the ELF);
  **as built** for the port's helper (`packages/viewer/src/fireModeInput.ts`, unit tests only). No game, browser,
  capture or controller run. The lane's call is a wave-4 hunk (PAR.R3, §4): until it lands the port's lanes still switch
  at every rising edge, and research 230's three `inputTiming` probes stay `it.fails`.
- Sources: research [230](230-gameplay-feel-parity-audit.md) §4.1 (the table's "Sampled down/held/up", "DEFAULT fire
  mode" and "ALTERNATE fire mode" rows), §4.2 delta 1, §6's DEFAULT double-tap row, §8 input-01..03; research
  [302](302-original-options-and-communications.md) §4 (OPTIONS on the page, `FIREMODESWAP_CONTROLLER`); research
  [252](252-timed-holds-in-real-time.md) (the frame's real seconds the lanes are handed at wave 4). `D:L<n>` is
  `game/analysis/socom2_game.elf.decomp.c` r0001, SHA256 `B9E86376...AA42D4` (as research 230 pins it); the ELF read
  is `game/overlays/socom2_game.elf`, SHA256 `06B83684...798872`, through its program headers.

## 1. The sampled button

`FUN_002d9ff0` (D:L179130-179186) is one button's poll. The pad update `FUN_002da930` stores the frame's time in
`DAT_0044f240` (D:L179512) and then calls it once for every button (D:L179820 onward); the core loop polls the pad
before the simulation (research 230 §4.2, `FUN_001e7040`).

- **The state** (a byte a button, D:L179137-179169): down, a button at rest (0) or at its first frame up (3) goes to
  1 (first down), else to 2 (held on); up, one at 1 or 2 goes to 3 (first up), else to 0. A press the frame after a
  release is therefore a first press again (3 -> 1). The branches for a byte outside 0-3 are unreachable from the
  states themselves and are not modelled.
- **The tap marker** (a float a button at `+0x74`, D:L179172-179184): on a state-1 frame it becomes .25
  (`FIRE_MODE_DOUBLE_TAP_S_READING`, the literal 0x3e800000, D:L179177) -- unless it is still live (> 0), when it
  becomes -2 (0xc0000000, D:L179174): a double tap. On every other frame a live marker loses the frame's time
  (`DAT_0044f240`) and, once below zero, is -1 (D:L179180-179183). `FUN_002da1c0` (D:L179217-179227) answers whether the
  marker is -2 and, if so, sets it to -3 (0xc0400000) -- the take. `FUN_002da160` (D:L179189-179197) writes a state and
  -3 (a reset); the helper starts at state 0, marker -3. Any non-positive marker other than -2 behaves alike.
- **The window in frames**, at research 230's source-model frame `dt = 525/15734` (33.367 ms): the second press must
  come within 8 frames of the first (.25 less 7 frames' time is still live; less 8 is spent). Pinned:
  `fireModeInput.test.ts` "the double tap's window".

The port's helper: `SampledButton` (`fireModeInput.ts`), single precision throughout (`Math.fround`), so a comparison
falls where the console's does. The state machine is sampled once a lane frame from `Input.fireMode` -- the logical
FireMode button after the OPTIONS swap (§3).

## 2. The DEFAULT consumer

`FUN_00594b70` (D:L452961-452995), run by the player update `FUN_00594cf0` when `DAT_0044d500` is 0 (D:L453465-453466),
with the frame's time as its argument:

1. It asks for the double tap of logical button 3, FireMode (`FUN_002c6490` D:L166898-166912 -> `FUN_002da1c0`; a
   button unbound, slot 0x10, answers no). Taken: the switch (D:L452972, D:L452988-452992).
2. Otherwise it reads the button's state (`FUN_002c64e0` D:L166915-166931), keeps "held on" (state 2) in bit 2 of
   `+0x172`, adds the frame's time to `+0x240` while the bit is set and zeroes `+0x240` when it is not
   (D:L452975-452982); past .4 s (`DAT_00650670`, `FIRE_MODE_HOLD_REPEAT_S_READING`) it zeroes `+0x240` and switches
   (D:L452983-452986).
3. The switch is `FUN_005c4600` on the controlled body's weapon (D:L452992).

So, at the source-model frame (research 230 §4.2's counts, reproduced by the helper):

| sequence | original | port's lane today (`matchLanes.ts:51`) |
|---|---|---|
| single tap (down, up, up) | 0 switches | 1 |
| double tap (down, up, up, down, up) | 1, at the second press | 2 |
| held 31 frames | 2, at frames 12 and 24 | 1, at frame 0 |

The first held frame is state 1, so the held time starts on the second: 12 frames x 33.367 ms = .4004 s > .4 at frame
12, then zeroed, and again at frame 24. At 0.03 s frames a 30-frame hold switches at 14 and 28 (the time is the
frame's own seconds, not a count of frames). A double tap held on switches at its second press and again 12 frames
later. All pinned in `packages/viewer/test/fireModeInput.test.ts`.

The ELF's word at 0x650670 is 0x3ecccccd = .4000000059604645 (the fourth PT_LOAD, file bytes); the helper holds that
float exactly (`Math.fround(0.4)`), and its test pins both readings' bit patterns.

**What consumes the tap -- the eligibility controls.**

- The take and the held time are the consumer's. When the player update does not reach `FUN_00594b70` (its gates
  around D:L453106 and D:L453175-453176 shut), nothing is taken and `+0x240` keeps its value, neither counted nor
  zeroed; the marker still ages with every poll, and a -2 left untaken waits (it is not > 0, so it never ages) until
  the consumer runs or the next first press overwrites it. Pinned: "the consumer not run ... switches the first frame
  the gate opens", "a held time is kept ...".
- **The port's consumer gate is assumed, not read.** The helper takes the lane's existing gate, walking and no menu over
  the game (`matchLanes.ts:51`'s `walk.mode() === 'walk'`, and `menu`). The original's gates on the way to D:L453465,
  as far as they read here (the review's question, 2026-10-08):
  - D:L453064: a game-state short at `DAT_0043668c + 4` equal to 1 or 2 skips the whole player update. It is written 1
    or 2 by a dialog's choice (D:L61883-61903, beside `FUN_003519f0`); which screen and which states, not identified.
  - D:L453067-453068: `DAT_003df1b0` zero skips it (and zeroes the body's word 0x149). The flag is set only through
    `FUN_00598840` (D:L454837-454843): cleared at D:L78454 (`FUN_00228ee0`, beside `FUN_00574830(0,0)`), set at
    D:L78609 (`FUN_00229520`), and from an event's flag bit at D:L485157 (`FUN_005cf800`, again beside
    `FUN_00574830`). By its shape a "player control enabled" switch; what turns it off (a cutscene, the round's freeze,
    a menu) is not read.
  - D:L453098 and D:L453106: the controller's virtual call at `+0x8c` must answer 0; online (`DAT_0045a0c1`) it is
    forced to 1 when the body's word 0x108 time is more than 0.6 s old (D:L453099-453105). The callee is not read.
  - D:L453175-453176: `FUN_005966a0` (D:L453743 onward) must answer 0. It reads the sticks into the look when the
    controller's `+0x221` is below 2 or above 5 and bit 3 of `+0x171` is set; what its answer means is not read.
  So which port states (the Chat menu, the R2 inventory, the round's freeze, the fly camera, death) shut the original's
  consumer is owed (§5).
- **The weapon's own refusal does consume the tap.** `FUN_005c4600` (D:L478557-478640) runs after the take: no firearm
  in the slot, or the ratio `FUN_003c5980` returns past 1.01 (D:L478570-478577; the port reads it as the zoom,
  `nextFireMode`'s `zoom.target() > 1.01`), and the mode stays -- but the marker is already -3 and
  `+0x240` already zero. The port's `switchFireMode` keeps its own refusals (`matchFirearm.ts:304-311`: an item or a
  launcher up; `nextFireMode`'s zoom past 1.01 and its rounds), called only when the helper answers true. Pinned: "a
  switch the weapon itself refuses ... still consumes the tap and resets the held time". **This differs from the
  brief**, which asked that a switch the weapon refuses not consume the tap: the original's order (the take at
  D:L452972, the switch's tests inside `FUN_005c4600`) says it does; the outer gate is what leaves the tap untaken.
- Not read here: the `+0x114` branch (D:L452969-452971) hands the consumer no pad (a body this console's pad does not
  drive, by its shape); the port's lanes are only the local player's.

## 3. ALTERNATE and the saved setting

- **The global.** `DAT_0044d500`: 0 is DEFAULT, 1 ALTERNATE. `StoreOptions` sets it from `FIREMODESWAP_CONTROLLER`
  (D:L125173-125183), calling `FUN_00592050` whenever it changes; OPTIONS' row toggles it and names it
  (`FIREMODE_TACMAP__DEFAULT` / `__ALTERNATE`, D:L61823-61843). Never stored, it is zero: 0x44d500 lies in the zero-filled
  tail of the third PT_LOAD (file bytes end at 0x408480). That zero is the boot's value, not proof of a player's
  runtime setting (gate D17): the setting is whatever the card's OPTIONS hold.
- **ALTERNATE** (D:L453468-453472): the switch at FireMode's state 1 -- its first press, as the port's lane always
  switched. `FUN_00592050` (D:L451456-451467) swaps logical buttons 3 (FireMode) and 0xc (TACMAP) in the binding table:
  ALTERNATE puts the fire mode on SELECT and the map on L3. The helper returns state 1 under 'alternate' and touches
  neither the marker's take nor the held time (`FUN_00594b70` does not run). Pinned: "ALTERNATE keeps the first press":
  the three sequences switch once, twice, once at frame 0 -- the port's counts today.
- **Where each page reads it.** The menu match: `frontEnd.ts:734` hands the mount `playOptionsOf(session_?.options)`
  (the globals `StoreOptions` left from the card's valves), and `matchMount.ts:571-574` (`applyOptions`) already swaps
  `pad.fireMode` and `pad.scoreboard` under `fireModeSwap` before the lanes. `fireModeSetting` (`fireModeInput.ts`)
  maps `PlayOptions.fireModeSwap` to 'alternate', else 'default'. `/testroom` (`main.ts`): **no read** -- it has no
  OPTIONS and no option globals (its card holds the taunts and messages only, `main.ts:503`, `:1836`), so it runs the
  global's zero, DEFAULT (`LaneParts.fireModeSetting` absent, §4). That `/testroom` cannot run ALTERNATE is owed (§5).

## 4. The lane line, and GREEN at wave 4

`matchLanes.ts` is HOT (PAR.R3): the call is the wave-4 integrator's. The hunk, applied and reverted on this branch
(base add885ea): with it, `inputTiming.test.ts`'s three cases pass as plain `it` (3 of 3), `matchLanes.test.ts` 9 of 9
with its pins moved, `matchMount.test.ts` 90 of 90 and `padFlush.test.ts` 3 of 3 unchanged, `tsc -p packages/viewer` clean
(re-run with the flush calls, 2026-10-08).

- `matchLanes.ts`: `import { fireModeInputFor, type FireModeSetting } from './fireModeInput';`; `LaneParts` gains an
  optional `fireModeSetting?(): FireModeSetting` (absent: DEFAULT); line 51 becomes
  `const fireModeSwitch = fireModeInputFor(l).step(after.fireMode, dt, { setting: l.fireModeSetting?.() ?? 'default', consumer: !o.menu && walk.mode() === 'walk' });`
  `if (fireModeSwitch) firearm.switchFireMode();`. The setting rides `LaneParts`, not `playerLanes`' options, so the
  pages' call lines (pinned by text in `matchMount.test.ts` and `matchLanes.test.ts`, and moved by PAR-24's own hunk)
  do not change. `fireModeInputFor` keeps one helper a set of lanes (a `WeakMap` on the `LaneParts` object each page
  makes once). The `dt` is the one the lanes are handed: the frame's real seconds once PAR-24's hunk lands
  (research 252 §4), so the .25 s and .4 s are real time.
- `matchMount.ts`: `import { fireModeInputFor, fireModeSetting } from './fireModeInput';`; in `lanes`,
  `fireModeSetting: () => fireModeSetting(o.options?.() ?? playOptionsOf(null)),`; and in `padFrame`'s flush (the
  loading hold and the first frame, `if (held || !flushed)`), after `flushedPad`,
  `fireModeInputFor(lanes).flush(padGame.fireMode);`.
- `main.ts`: `import { fireModeInputFor } from './fireModeInput';` and, in `padFrame`'s loading hold after
  `padGame = exchangeInput.frame(padGame, false);`, `fireModeInputFor(lanes).flush(padGame.fireMode);`. No setting
  (DEFAULT).
- **The flush** (the review's finding, 2026-10-08): at a game state's start `FUN_002dba60` (D:L179891-179936; research
  116 R116.13) zeroes every button's state (D:L179911), reads the pad once (D:L179921) and sets every tap marker to -3
  (D:L179923-179934). The pages flush their lanes' read (`padGame`) there (`./padFlush`) and return before the lanes
  while held, so without the helper's own flush it kept its last state and marker: on ALTERNATE a button pressed under
  the hold and held through its release switched at the release, the menu match's first frame with the button down
  switched, and on DEFAULT a press before the hold and one after made a double tap. `FireModeInput.flush(down)` sets
  the state from the pad (down: 1, so the next frame reads 2) and the marker to -3; the held time (`+0x240`, the
  player controller's) is not the flush's. Pinned in `fireModeInput.test.ts` "the flush at a game state's start" (three
  cases, RED with a no-op flush: `[5, 8]` for `[8]`, `true` for `false`, `[4]` for `[]`).
- The tests that flip: `inputTiming.test.ts`'s `it.fails(row.name, ...)` becomes `it(row.name, ...)` (single tap,
  double tap, held for 31 original ticks: **GREEN at wave 4**); `matchLanes.test.ts`'s order test sets
  `l.fireModeSetting = () => 'alternate'` (one frame shows the order at ALTERNATE's first press), and a new case pins
  DEFAULT through the lanes (a first press nothing, the second inside .25 s once, off the walk nothing taken).

Until the hunk lands, the three `it.fails` stay `it.fails` and green: the mismatch persists in the lanes.
*Landed 2026-10-10: the flush is called at `viewer/src/main.ts` (the loading hold's `fireModeInputFor(lanes).flush`)
and `matchMount.ts` (the same, at its hold), and `test/parity/inputTiming.test.ts`'s three rows are a plain
`it(row.name, ...)`.*

## 5. Owed

- **Captures** (latency and feel only, D17): a DEFAULT single tap, a double tap at several spacings and a long hold
  on the original, timed, to measure the window and repeat running; nothing here is measured.
- **`/testroom`'s setting.** It reads no OPTIONS, so it cannot run ALTERNATE (§3). Whether it should read the card's
  `FIREMODESWAP_CONTROLLER` is the owner's or the controller's call (H-next if wanted).
- **The flush's call on the pages** is the wave-4 hunk's (§4): until it lands the helper is unwired, so nothing on a
  page changes. (Corrected 2026-10-08 by the review: what the first version called an ageing difference across the
  loading hold is a missing reset -- the original's flush, now `FireModeInput.flush`.) *Paid 2026-10-10: the hunk
  landed (§4); both pages flush at the loading hold.*
- **The consumer's gate.** Which port states shut the original's consumer (§2's gates): read `DAT_003df1b0`'s
  clearers, the `+0x8c` callee and `FUN_005966a0`'s answer, or capture the original -- a double tap and a held L3 with
  the Chat menu open, the R2 inventory open, in the round's start freeze and while dead -- and see whether the mode
  changes. Until then the port keeps its lane's gate.
- **Whether a round start renews the held time.** `FUN_002dba60` does not touch `+0x240`; whether the player
  controller is made anew at a round start (which would zero it) is not read. The helper keeps it across a flush.
- **The review.** Every line of §1-§3 awaits a reviewer who did not write it (reading, pending review).

## 6. Readings

| name | value | source | status |
|---|---|---|---|
| `FIRE_MODE_DOUBLE_TAP_S_READING` | .25 s | `FUN_002d9ff0` D:L179177, the literal 0x3e800000 | reading, pending review; a capture would measure it running |
| `FIRE_MODE_HOLD_REPEAT_S_READING` | .4000000059604645 s | `FUN_00594b70` D:L452983, `DAT_00650670` = ELF word 0x3ecccccd | reading, pending review; a capture would measure it running |
