# 110 -- The front-end frame clock: the menu's tick rate, its dt, a late frame, the hidden tab, and movie pacing (web sprint 7, PLAT-12)

Written 2026-10-02 for PLAT-12 (the block is `../roadmap/01-platform.md` "PLAT-12"). Read-only research. Sources: the
retail decompilation `C:/Projects/socom_pc/game/analysis/socom2_game.elf.decomp.c` (`D:L<n>` = its line; every address
retail); the retail ELF `game/disc/socom2_game.elf` (two data words, read by address through its program headers, and
the flip's instructions 0x3aff30-0x3b00a8, disassembled to check the decompiler's reading of which word the wait
reads); the disc's `RUN/UIZANIM.ZAR` read with `@s2u/archive` (`Zar`) and `@s2u/scene` (`parseAnimSets`), and
`tools/dump-dialogs.ts --set 'UIanim\.rdr'`. Names, counts and short constants only: no disc bytes, no decompiled
text. It stands on research 106 (the runtime's frame), 115 (the shell's tick, MENUFADER, the state machine), 116 (the
menu input's timers and its `MENU_TICK_RATE_READING`) and 121 (the movie player's pace), and on PC research 09. The
code is `packages/ui/src/clock/` (`uiClock.ts`, `moviePace.ts`); the tests `packages/ui/test/clock.test.ts` (CI, and a
dev-disc block that skips without `RUN/UIZANIM.ZAR`).

## 0. Answers

| # | finding | section |
|---|---|---|
| R110.1 | **The menu ticks at 29.97 Hz, not 60.** The shell's tick is the menu state's frame, and the frame ends in `FUN_003aff30`, which waits fields while `elapsed + 1/60 < 1/DAT_003e1400`, then one more; `DAT_003e1400` is 30 in the ELF and the movie path writes 30. Two NTSC fields a frame: `UI_TICK_HZ_READING` = 29.97. The block's "shell tick at 60 Hz" (PC research 09) is contradicted; research 116 §10 read the same | §1 |
| R110.2 | **The game's dt is 525/15734 s (29.9695 Hz)**: timer 0 counts H-blanks and dt is the count over 15734 -- video mode 0's 15734.25, truncated to an integer before the reciprocal (`FUN_0034f3c0` D:L249327-249333) -- 525 H-blanks for two fields. That is 16 ppm longer than the hardware's two-field frame (30000/1001 = 29.97003 Hz); the clock ticks at 29.97 and hands on 100/2997 s, and no tick count here moves between the two | §2 |
| R110.3 | **The 0.5 s MENUFADER reaches 0.99 on tick 15**, the code fade (`FUN_003654c0` A4) and the disc's 14 scripted fades (0 -> 0.99 at 1.98 a second for 0.5 s) alike; on tick 30 only at the block's 60 Hz | §2, §6 |
| R110.4 | **A dropped frame on the console is one long tick**, dt 0.05 s for three fields, and the shell clamps every step to 0.05 s; the clock instead catches a late browser frame up in whole fixed ticks (`DROPPED_FRAME_READING`), at most 0.05 s of them per advance (`CATCHUP_LIMIT_READING`) | §3 |
| R110.5 | **A hidden tab freezes the clock** (`HIDDEN_TAB_READING`): no ticks, no burst on return | §4 |
| R110.6 | **Movies: one picture a tick, the PTS unread** (R121.9, `MOVIE_PACE_READING`): 30 fps streams play 0.1 % slow, 29.97 fps ones at their rate. PTS pacing is kept beside it for comparison | §5 |

**The proven level** is PLAT-36's: a recomp VBlank count over a scripted WAIT (the block's unknown). Everything here is
the reading level.

## 1. The tick rate

- **The tick is the frame.** `CMenuState_Tick` (0x1f4640, read from the disassembly; research 115 §7, research 116
  §1.1) runs the background movie (`FUN_00366940`), the pad, G's tick `FUN_003654c0`, the draws and the swap, once a
  frame. PC research 09 calls `FUN_00366940` "every shell tick (60 Hz)" and cites no line for the rate. Its
  verification's MENULOOP "every 2 vsync ticks (30 fps, PTS-paced by the HLE)" is the recomp's HLE pacing the pictures
  by their PTS, not the console's flip, so it is no evidence for the tick either way.
- **The frame's end** is `FUN_003aff30` (D:L304731-304768). Read in order: the wait (D:L304745-304749) loads the float
  at 0x4a44a4 and, unless `DAT_003e1400` is -1, calls `sceGsSyncV` (0x1a2110, PC research 20 row 54) while that time
  plus 0.016666668 is below 1/`DAT_003e1400`, adding 0.016666668 each time; then the frame's work (movie feed
  `FUN_00309780`); 0x4a44a4 re-sampled from timer 0 (D:L304757-304758); one more `sceGsSyncV` (D:L304759); dt from
  timer 0, the timer zeroed, the frame counter `_DAT_004a4490` incremented (D:L304760-304765).
- **The cap word**: `DAT_003e1400` = **30** (the ELF's word at 0x3e1400; `DAT_003e13f8`, which `FUN_001ec480`
  D:L50954 and the movie close D:L207717 restore, is 30 too). `FUN_003b17d0` (D:L305431-305441) sets it, mapping 60 to
  -1 (no cap). Writers: the movie open writes 30 (D:L207813); -1 is written by `FUN_001ebe30` (D:L50752) and the movie
  state's init `FUN_001ed560` (D:L51260), restored by its exit `FUN_001eccf0` (D:L51134) -- the round and the movie
  state, not the menu.
- **What the wait does.** The disassembly (0x3aff58-0x3affcc) agrees with the decompiler: the wait reads 0x4a44a4,
  which only the flip (0x3b00a0) and `FUN_003b05e0` (0x3b0644) write (an ELF scan for stores with that offset), so it
  is the **previous** frame's time up to its last field wait. At 15734 counts a second (§2) the test
  `t + 0.016666668 < 0.033333335` holds for a count under 262.23: 262 or fewer. A frame that waited stores about one
  field (262 or 263 H-blanks, the fields of an interlaced frame alternating); one that did not stores its work, under a
  field. So a frame after a waiting frame whose field counted 262 waits again (two fields), one after a 263 does not
  (one field), and the frame after that waits: the loop settles on two-field frames whose first field is the 262-line
  one. **29.97 frames a second** when the work fits in a field; the console's SONY448 (310 pictures, one a tick, in
  10.34 s: research 121 §9) is 29.98 -- evidence for the menu only if the movie state runs under the cap of 30, which
  the unread order of D:L51260 and D:L207813 decides (§8).
- **What the settling leaves out.** The stored time (D:L304757-304758) is not the field alone: it is sampled after the
  post-wait work `FUN_003b04c0` and the movie feed `FUN_00309780`, from a timer zeroed at the previous flip's end, so
  it is the field plus that work minus the reset's latency after the field's sync. The stored count is an integer
  (`REG_RCNT0_COUNT` x 1/15734, D:L304757-304758) and the wait's bound (262.23) lies between 262 and 263, so the margin
  is not a fixed 0.23 line: if that net term carries a 262-line field's count past the next H-blank edge, to 263, that
  field too skips the next wait, and frames alternate two and one fields (about 40 Hz). The room before that edge is
  the sync's phase within its line -- anywhere from almost nothing to one line. Neither term nor the phase is read;
  PLAT-36 settles it (§8).
- So `UI_TICK_HZ_READING` = 29.97 (`UI_FIELDS_PER_TICK` = 2, `UI_TICK_RATE` = 2997/100): the NTSC field rate
  60000/1001 makes the hardware's two-field frame 30000/1001 = 29.97003 Hz, and 2997/100 is it to 1 ppm. The game's
  own dt (§2) is 525/15734 s, 16 ppm longer; the clock hands on its tick's 100/2997 s, and no count in §2 differs.

## 2. dt, and what each consumer counts in ticks

- **dt**: timer 0 runs in mode 0x83 (H-blanks; `FUN_0034f3c0` D:L249318-249335); dt = count x `DAT_0049e2d8`
  (the flip, D:L304764). `DAT_004a44f8` is set per video mode by `FUN_003b14a0`: 15734.25 for mode 0, NTSC
  (D:L305383), 15550 for PAL, 31468.5 for mode 2; `FUN_0034f3c0` converts it with `(uint)` into `DAT_0049e2d4`
  (D:L249327-249328) and takes the reciprocal of that integer (D:L249333). So NTSC's scale is **15734**
  (`NTSC_HBLANK_SCALE`), not 15734.25, and two fields' 525 H-blanks give dt = 525 / 15734 = **0.0333672 s**
  (`GAME_FRAME_DT_SECONDS`, 29.9695 Hz). The clock's tick hands on 100/2997 s (`UI_TICK_SECONDS`), 16 ppm shorter:
  every tick count below holds at either.
- **The shell's step**: G's tick gives scripts, the fader, the popup and the widgets `min(dt, 0.05)` (`FUN_003654c0`
  A2, D:L262270-262273; research 115 §3); the menu's suspension alone takes the raw dt (A1). The clock's dt is under
  the clamp, so a caller passes `Math.min(dt, SHELL_STEP_CLAMP_SECONDS)` where the original does and the step is the
  tick's. PLAT-07's runtime is stepped `rt.tick(step)` once a tick (research 106 §2): the clock drives it with no change
  to `zanimRuntime.ts`.
- **In ticks** (the reading's rate; each a reading until PLAT-36):
  - MENUFADER to black in code (A4, +2 x step from 0 to 0.99): the first k with 2k/29.97 >= 0.99, **15**; the
    scripted 0 -> 0.99 fades (`OBJECT_OPACITY_FROM_TO`, snapped when 0.5 s < k dt): **15** (k dt = 0.5005 s);
    `menu_fade_up` (1 -> 0 in 1.5 s): 45, snapped on 45 (1.5015 s). The switch's countdown then adds 4 (research 115
    §4.1).
  - The held repeat (research 116 R116.6): the hold timer passes 0.4 s on the **12th** tick (12 x 100/2997 = 0.4004);
    `SuspendMenuInput(0.15)` skips **5** ticks (0.15 / dt = 4.5) -- research 116's "12 or 13" and "5".
  - The load state's 0.5 s ramps (research 115 §8.2): 15 ticks.
- **The disc's fade numbers** (dev disc, pinned by the test): in `RUN/UIZANIM.ZAR`, 14 `OBJECT_OPACITY_FROM_TO`
  commands on `MENUFADER` run from 0 to 0.99 at 1.98 a second for 0.5 s; `dlgMenu.rdr`'s `UiAttractMode` is one. Its
  two sequences each open on an `IF` over NODE_ACTIVE `POPUP` and NODE_ACTIVE `SavedGames` (condition tokens 7, 43, 7);
  with neither node active, the first calls `ui::` `SuspendMenuInput` 1.75 and fades the `Roller`, the second calls
  `FadeAllSounds`, stops an animation and fades MENUFADER (the runtime's trace under the test's tree; the other branch
  calls `UiStopAttract`). `UIanim.rdr` holds one MENUFADER animation,
  `menu_fade_up` (research 115 §5, research 106 R106.6); the brief's "uianim.rdr's MENUFADER" 0.5 s fade is the code
  fade (A4) and these 14 scripts, not a `UIanim.rdr` animation.

## 3. A late frame

- **On the console** a frame whose work overruns one field ends after three (the wait skipped, `sceGsSyncV` once
  more): one tick, dt = 0.05 s, and the next frame, having stored a short time, waits again. Script time is kept up to
  the clamp (0.05 s a frame) and lost beyond it -- research 115 §5's "slower in wall time below 20 Hz"; whatever counts
  frames (the switch countdown, the movie's one picture a tick, the pad's one-frame press state, research 116 R116.1)
  moves one frame. The console's overruns are its own load, which the port does not reproduce.
- **The clock** (`DROPPED_FRAME_READING` = `fixed-ticks`): a browser frame that comes late is caught up in whole ticks
  of the fixed dt, oldest first, so the tick count for the wall time is the console's steady one and a frame-indexed
  trace (PLAT-32's goldens) aligns. **The cap** (`CATCHUP_LIMIT_READING` = 0.05 s, the shell's clamp): one advance
  turns at most 0.05 s into ticks -- with the carry under one tick, at most two ticks -- and the rest is lost
  (`lostSeconds`). A display at 20 Hz or more loses nothing; a stall loses what the console's clamp would.
- Not chosen: one tick with the long dt (the console's overrun shape). It would change the tick count against the
  wall time and the frame index of every later event, which the goldens compare.

## 4. The hidden tab

The console has no hidden tab. A browser stops `requestAnimationFrame` in a hidden tab and slows timers to about once
a second. `HIDDEN_TAB_READING` = `freeze`: the viewer passes the page's visibility (`setHidden(hidden, now)`); while
hidden nothing ticks (a movie stops on its picture, a fade where it was), and on return the clock re-anchors at that
`now` with its carry, so nothing bursts. The time hidden is not counted as lost. The alternative -- run on in the
background at the 1 Hz timer -- would lose all but 0.05 s of every second (the cap) and is not taken.

## 5. Movie pacing against the tick

- **The original** (research 121 §9, R121.9): each background-player tick (`FUN_00366940`) or movie-state tick
  presents one picture; `sceMpegGetPicture` is retried until it gives one; the TIMESTAMP callback only sets a flag no
  code reads (D:L208419). So pictures come at the tick's rate whatever their PTS: `MOVIE_PACE_READING` =
  `one-per-tick`, `pictureForTick(n)` = n. SONY448 and MENULOOP (PTS step 3000, 30 fps) play 0.1 % slow -- 310
  pictures in 10.34 s against 10.33 s of PTS -- and INTRO_2 (step 3003, 29.97) at its own rate. A tick with no new
  picture shows what research 121's `MOVIE_HOLD_READING` says.
- **PTS pacing**, kept for comparison and for a tick at another rate (`pace: 'pts'`): the picture due on tick n is the
  last whose PTS is at or before the tick's time, computed in integers (floor(n x den x 90000 / (num x step))). On the
  29.97 tick a 29.97 fps stream is one a tick; a 30 fps stream drops one picture in 1000 (999 is never shown). On a
  60 Hz tick 30 fps pictures hold two ticks each; on 59.94 (60000/1001) 29.97 fps ones do; 30 fps on 59.94 shows 1001
  pictures in 2000 ticks; 29.97 on 60, 999 in 2000.
- **The hand-off**: `MoviePacer.tick()` once a UI tick returns the picture to present or null (hold); with the stream's
  picture count it marks the end; `restart()` is the loop's (`FUN_00309560`, research 121 §5). The end event, the
  loop flag and the NODATA tick are PLAT-21's (research 121 §2).

## 6. What it hands the others (W9.R10)

`UiClock` is the clock PLAT-10's MENUFADER and switch countdown, PLAT-11's repeat and suspension, PLAT-19b's picture
hand-off and PLAT-21's "present at the stream rate" are given: each takes the tick (`advance(now, onTick)`'s callback,
1-based index and dt) and never reads `performance` or `requestAnimationFrame`. `frameSync()` is the body of the
frame-sync hook research 115 §8.1 leaves to this task (`STATE_CHANGE_FRAME_SYNC_READING`, `FUN_003b05e0`
D:L304875-304886): the frame counter moves (`frames`), the tick schedule does not, because the elapsed time it
re-samples feeds only the flip's wait, which the fixed tick replaces. The interpolation fraction `alpha` is for the
viewer's drawing between ticks; nothing in the original interpolates (it draws once a tick), so a 1:1 frame draws the
last tick's state and `alpha` is there for motion the owner chooses to smooth.

## 7. Where this differs from the block, the brief and PC research 09

- **The block** ("shell tick at 60 Hz (`FUN_00366940`, PC research 09)"): `FUN_00366940` is the movie service, not the
  shell, and the shell's rate is the flip's cap: 29.97 (§1). Its acceptance "a 0.5 s MENUFADER reaches 0.99 at tick
  30" holds only at 60 Hz; at the read rate the fade reaches 0.99 on tick 15, still 0.5 s. The test asserts both: tick
  15 at the reading's rate and tick 30 with the clock built at the block's 60 Hz, over 600 ticks each, on a synthetic
  fade with the disc's numbers and on the disc's own `UiAttractMode`.
- **PC research 09**'s "60 fps shell" is the recomp's present rate; its pictures "every 2 vsync ticks" are the HLE's
  PTS pacing, not the flip's rhythm, and neither support nor contradict §1.
- **The KNOWN line on the round's frame rate** ("the game targets 30 fps (two VBlanks)") is about the round, whose cap
  this note reads as -1 (`FUN_001ebe30`); the round's pacing is not this note's and is not re-read here.

## 8. Settled, not settled, and what would settle it

- **Settled at the reading level**: the cap word and the wait (§1), dt's scale -- 15734, truncated (§2), the per-tick
  picture (§5).
- **Not settled**: the menu's actual tick on hardware (`UI_TICK_HZ_READING`): the wait's settling on two fields rests
  on the 262/263 H-blank alternation, on the post-wait work plus the movie feed less the reset latency not carrying a
  262-line field's integer count past the next H-blank edge to 263 (§1: the room is the sync's phase within its line,
  from almost nothing to one line; past it, frames alternate two and one fields, about 40 Hz), and on the work
  fitting in a field; a menu frame that overruns (research 121's
  `MOVIE_PICTURE_PERIOD_READING`) slows the menu. **What settles it**: PLAT-36's recomp VBlank count over a scripted
  WAIT on a menu, or the frame count of a console capture across a known WAIT.
- **Not read**: whether the movie state's own -1 cap (D:L51260) is overwritten by the movie open's 30 in the same init
  (the order of `FUN_001ed560`'s calls), which decides whether SONY448's 29.98 is evidence for the menu's tick; the
  round's frame (its uncapped path, -1 via `FUN_001ebe30` and `FUN_001ed560`).
- **Left to later tasks**: the viewer's wiring (the `requestAnimationFrame` loop feeding `advance(now)`,
  `visibilitychange` to `setHidden`, `Math.min(dt, SHELL_STEP_CLAMP_SECONDS)` at each consumer); `frameSync` on a
  state machine (PLAT-10); a consumer of `alpha`. In `pts` mode a 3003-step stream on the 2997/100 tick skips one
  picture about every 10^6 ticks (29.97 against 29.97003); the reading paces one a tick, so it does not arise.

## 9. Placeholders and readings

| name | stands for | searched / reading | status |
|---|---|---|---|
| `UI_TICK_HZ_READING` (`packages/ui/src/clock/uiClock.ts`) | the menu's tick rate | `FUN_003aff30` D:L304745-304766 with `DAT_003e1400` = 30 (0x3e1400) and dt's scale 15734 (`(uint)` 15734.25, D:L249327-249333, D:L305383): two fields, 29.97 Hz (the hardware's 30000/1001 to 1 ppm; the game's dt 525/15734 s, 16 ppm off); the block's 60 Hz contradicted (§1, §7); PLAT-36 measures | reading |
| `CATCHUP_LIMIT_READING` (`packages/ui/src/clock/uiClock.ts`) | the wall time one advance turns into ticks | the shell's clamp `min(dt, 0.05)` (`FUN_003654c0` D:L262270-262273): 0.05 s (§3) | reading |
| `DROPPED_FRAME_READING` (`packages/ui/src/clock/uiClock.ts`) | a late frame's shape | whole fixed ticks (`fixed-ticks`), not the console's one long tick (§3) | reading |
| `HIDDEN_TAB_READING` (`packages/ui/src/clock/uiClock.ts`) | the clock in a hidden tab | no original; `freeze` (§4) | reading |
| `MOVIE_PACE_READING` (`packages/ui/src/clock/moviePace.ts`) | what paces a movie's pictures | one picture a tick, the PTS unread (R121.9; §5) | reading |
| `STATE_CHANGE_FRAME_SYNC_READING` (`packages/ui/src/clock/uiClock.ts`, `frameSync`) | `FUN_003b05e0` before a state's Init | the frame counter moves, the tick schedule does not (§6); research 115 §8.1 | reading |
| `MENU_TICK_RATE_READING` | research 116's name for the menu's rate | the same read as `UI_TICK_HZ_READING`, which stands for it in code (research 116 §10) | *note only* |
| `MOVIE_PICTURE_PERIOD_READING` | research 121's name for the time between pictures | one tick, 100/2997 s here (§5); research 121 §9 | *note only* |
| `MOVIE_HOLD_READING` | what a tick with no new picture shows | research 121 §7; `MoviePacer` returns null and leaves it to the drawer | *note only* |
