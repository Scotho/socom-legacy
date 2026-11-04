# 117 -- The widget set: what each widget class draws and does at run time, its states, its buttons, the glow, the slider step (web sprint 9, PLAT-15)

Written 2026-10-02 for web sprint 9 (plan `../plans/2026-10-02-web-sprint-9-screens-widgets.md`,
task PLAT-15, W9.R8; the task's block is `../roadmap/01-platform.md` "PLAT-15"). Read-only research: **the reading the
PLAT-15 implementer transcribes**. No code and no test is written here. Sources: the retail decompilation
`C:/Projects/socom_pc/game/analysis/socom2_game.elf.decomp.c` (`D:L<n>` = its line; every address **retail**), the
retail ELF on the disc (`game/disc/socom2_game.elf`: strings, vtables and the few functions the decompiler left out,
read by address through its program headers), the disc's dialogs read with the repository's `tools/dump-dialogs.ts`
(names, keys and counts only), and two sets of captures (§11). The dialog **readers** -- which SPEC key lands in which
record field and with which default -- are research 105's (PLAT-05, `105-the-dialog-loader.md`); this note names a
record's field only by its SPEC key and reads what the run-time classes do with it.
**Extended 2026-10-02 by the PLAT-15 implementation** (§13: what the code stands on that this reading did not say, two
corrections, the node commands' ops, the scored items). **Notes cited here that are not yet on this branch** (the links dangle until the merge; the controller orders it):
research 116 (PLAT-11, the menu input: `agent/web-s9-read-input`), research 122 (PLAT-23, the UI sounds:
`agent/web-s9-read-sounds`), research 110 (PLAT-12, the front-end clock: its number is reserved by the sprint 9 plan
and is written on no branch as of 2026-10-02).

## 0. Answers

| # | finding | where | section |
|---|---|---|---|
| R117.1 | **Every widget is a spec object that makes a run-time object.** The two factories (`FUN_00382890` controls, `FUN_00382070` objects) build a *spec* (`CButtonSpec`, `CSliderBarSpec`, ...); the spec's vtable slot +0x10 makes the run-time object (`C2DButton`, `CSliderBar`, ...). The run-time classes and their vtables are listed in §1; the slots that matter are draw +0x10, tick +0x38, input +0x44, enabled? +0x48, set-enabled +0x4c, set-active +0x50, set-normal +0x54, command parse/exec/name +0x60/+0x64/+0x68, press +0x74 | §1 |
| R117.2 | **The slider's step is `NUM_INTERVALS` per cent of the track per press, not a count of intervals.** `FUN_00371d00` moves the knob position (0..1) by `NUM_INTERVALS x 0.01f` and clamps it; the knob is drawn at `x + position x XSIZE`. All eight sliders on the disc read `NUM_INTERVALS 2`: 2 % of a 290-px track is **5.8 px** per press (5 or 6 px after the integer cast) and **50 presses** from full to empty -- exactly what the PCSX2 frames show (§11.1). The "about 5 px, ~54 presses" of `music_only_mission.txt` was this, measured in a capture scaled 0.93 | §4 |
| R117.3 | **The slider's value mapping**: the UIVAR (a real) is the knob position through `CENTER_VALUE` (default 0.5): below the middle `u = 2p x C`, above it `u = C + (p - 0.5) x 2 x (1 - C)`; the UIVAR is read back the inverse way. No slider on the disc sets `CENTER_VALUE`, so the mapping is the identity on every one | §4 |
| R117.4 | **A held LEFT/RIGHT repeats on the slider after 0.4 s, then once per input call.** A press edge steps, plays the SELECTION sound, fires the screen's `SLIDER_MOVED` (event 0x28) bindings and restarts a hold clock; while held, once the clock passes 0.4 s, every input call steps again (SELECTION sound, no `SLIDER_MOVED`), the clock never reset | §4 |
| R117.5 | **The button's four states are four blocks** -- PRESSED, ACTIVE, NORMAL, DISABLED, each {image, image `PULSE`, `TEXT_GLOW` range and time, `TEXT_COLOR`, `SCALE`} -- applied by four entries: set-normal, set-active (which also fires the button's `ONACTIVATE` bindings), press (PRESSED for **0.2 s**, then ACTIVE) and set-enabled(false) (DISABLED). A disabled widget refuses all three others and every pad input. A new button starts NORMAL | §2 |
| R117.6 | **The ACTIVE glow modulates the caption's alpha, not its colour**: `alpha = 128 x (r0 + (r1 - r0) x sin(3.14 x phase / TIME))`, the phase advancing by **half** the tick's dt and wrapping at `TIME` -- so one glow cycle lasts **2 x TIME seconds** and is a rectified half-sine from `r0` up to `r1` and back (`RANGE (r0 r1)`). A state without a glow draws its caption at alpha **100** (of 128). The phase is not reset when the state changes. The options' buttons (`RANGE 0.5 1`, `TIME 0.5`) cycle in 1.0 s; `dlgMenu`'s (`0.3 1`, `0.8`) in 1.6 s | §3 |
| R117.7 | **"5 fps" is not the game's.** No widget code runs at 5 Hz: the glow is evaluated every tick. 5 fps is the roadmap's sampling rate for PCSX2 capture bursts (PLAT-15's acceptance, `01-platform.md` PLAT-10's and OPT-19's bursts); it puts 5 samples in the options' 1.0-s cycle and 8 in `dlgMenu`'s 1.6-s one | §3 |
| R117.8 | **An image `PULSE` is a full sine on alpha**: `alpha = 64 + 64 sin(phase)`, the phase advancing `2 pi dt / PULSE` -- a cycle of `PULSE` seconds between 0 and 128. A button state's `PULSE` drives the button's image; an IMAGE's `PULSE` its own; a WRAPPEDTEXT's arrows pulse at 1 s | §3, §7 |
| R117.9 | **RADIOSTRIP**: LEFT steps the selection back, RIGHT or CROSS forward, both **wrapping**; the selected CHECKBOX is set ACTIVE and every other NORMAL, the old one unchecked (its `ONUNCHECK` runs) and the new one checked (`ONCHECK`); SELECTION sound. Press edges only: no repeat, no PRESSED flash, the strip's own BUTTON bindings never consulted. The strip applies its selection (index 0 unless a `Selection` command set it) on its **first tick**, which checks that box and runs its `ONCHECK` | §5 |
| R117.10 | **CHECKBOX** is a button plus a check image (`CHECK_TEXTURE` at `CHECK_OFFSET`, `CHECK_SIZE`) drawn while checked. On the disc every one of the 42 is a RADIOSTRIP's subordinate, so its own CROSS toggle (`FUN_00371680`) is never reached: the strip drives it | §5 |
| R117.11 | **LISTBOX**: UP/DOWN move the focus one row (press edge, or the left stick's edge; held, every input call after 0.4 s); at either end the move is refused and the press passes on unless `PADHOG`; `PADHOG` also swallows the LEFT/RIGHT buttons (not a sideways stick flick). The focus row's own binding fires on its button's press edge (PRESSED colour for 0.2 s, then ACTIVE again). The view scrolls smoothly toward the focus at `max(SPEED, 2 x distance)` px/s. Focus changes fire `ONFOCUS` (0x2b), scroll steps `ONSCROLL` (0x29), the scroll's arrival `ONSCROLL_END` (0x2a) | §6 |
| R117.12 | **SECURETEXT** replaces every character of whatever text it is given -- caption, UIVAR, script -- with `*`, one per character (multi-byte characters count once), and skips the locale lookup | §7 |
| R117.13 | **PROGRESSBAR**: its UIVAR is a **duration in seconds**, not a fraction; the fill grows by `dt / duration` per tick up to 1 and is drawn by clipping the bar's image to `XSIZE x fill`. `dlgLoad`'s bar names `Load_progress`, which neither the ELF nor any script sets: its duration stays 0 and the bar is **full from the first tick** (`PROGRESSBAR_UNSET_READING`) | §7 |
| R117.14 | **COUNTER**: counts its caption from 0 up to the value of its `ValVar` UIVAR (read once, at creation), linearly between `StartTime` and `EndTime` (or `StartTime + Duration`), on the dialog's clock in seconds; each change of the shown number plays the TELETYPE sound. `Start` restarts it now, `Finish` shows the final value | §7 |
| R117.15 | **`PERMANENT` is not a widget** (research 96 R96.4: a UIVAR's longevity word, which the reader does not read either -- research 105 R105.6). TEXT, IMAGE and WRAPPEDTEXT have no states; they draw one look | §1, §7 |
| R117.16 | **Corrections**: the roadmap's handler list is the classes' *command-name* lookups (slot +0x68), not their handlers; `FUN_00379970` is WRAPPEDTEXT's (`Scroll_Up`/`Scroll_Down`), not the LISTBOX's (whose scrolling is its tick, `FUN_00375040`); the handlers are listed in §8 | §8 |

**The proven level** is PLAT-15's acceptance (W9.R8): each dialog's widget states scored >= 90 against PCSX2's frames,
and the glow's 5-fps curve. Of the readings here, the slider step is **measured** on PCSX2 frames (§11.1); the rest is
the reading level.

## 1. The classes and their slots

Each factory branch makes a spec; the spec's vtable +0x10 makes the run-time object (e.g. `CImageSpec`'s +0x10 is
`FUN_00382ff0`, D:L278131-278182, which allocates a `CPlainBmp`). The type strings are the ELF's (0x3fa0e8.. for objects,
0x3fa140.. for controls); the class names are the ELF's type-info strings beside each vtable.

| TYPE | spec (vtable) | makes (spec +0x10) | run-time class (vtable) | base |
|---|---|---|---|---|
| TEXT | `CTextSpec` (0x407f50) | `FUN_00388a60` | `CRenderableString` (0x407a90) | `C2DString` |
| SECURETEXT | `CSecureTextSpec` (0x407ef0) | `FUN_003887b0` D:L281149 | `CSecureText` (0x406fa0) | as TEXT, its set-text replaced |
| IMAGE | `CImageSpec` (0x407f80) | `FUN_00382ff0` D:L278131 | `CPlainBmp` (0x407950) | |
| WRAPPEDTEXT | `CWrapSpec` (0x407ec0) | `FUN_00388400` D:L281018 | `CWrappedText` (0x4079e0) | text |
| PROGRESSBAR | `CHProgressBarSpec` (0x407dd0) | `FUN_0037e470` D:L275651 | `CHProgressBar` (0x407550) | image |
| COUNTER | `CCounterSpec` (0x407cc0) | `FUN_00381be0` D:L277427 | `C2DCounter` (0x407be0) | text |
| BUTTON | `CButtonSpec` (0x407fb0) | `FUN_00380470` D:L276659 | `C2DButton` (0x407790) | `C3StateButton` |
| SLIDERBAR | `CSliderBarSpec` (0x407e00) | `FUN_0037e730` D:L275752 | `CSliderBar` (0x4075e0) | button |
| CHECKBOX | `CCheckBoxSpec` (0x407da0) | `FUN_0037de60` D:L275419 | `CCheckBox` (0x4074c0) | button |
| RADIOSTRIP | `CRadioStripSpec` (0x407d70) | `FUN_003874e0` D:L280444 | `CRadioStrip` (0x407430) | button |
| LISTBOX | `CUIListBoxSpec` (0x407e30) | `FUN_0037e8b0` D:L275799 | `CUIListBox` (0x407670) | image |

(TELETYPE, research 95 §3.8; SCROLLINGTEXT, HANDLERBUTTON, CLOCK and MAPCONTROL are outside PLAT-15: the first three no
dialog uses, MAPCONTROL is MENU-16's.)

**The slots** (offsets in the run-time vtable, the pointer at object +0xc), read off the vtables in the ELF:

| slot | meaning | base (`C2DButton`) |
|---|---|---|
| +0x10 | draw | `FUN_00377aa0` D:L272218 |
| +0x14 / +0x18 / +0x1c | set visible / hide / show (object +0x14 bit 6) | `FUN_00364df0`, `FUN_00364e50`, `FUN_00364e30` (ELF) |
| +0x34 | set alpha (a `C2DString`'s +0x54; an image's +0x3c/+0x4c) | `0x1f9150`, `0x364860` (ELF) |
| +0x38 | tick (dt) | `FUN_003723b0` D:L269237 |
| +0x44 | pad input (the pad record, below) | `FUN_00377040` D:L271859 |
| +0x48 | enabled? (object +0x14 bit 7) | `0x1fe270` (ELF) |
| +0x4c | set enabled | `FUN_00377380` D:L271950 |
| +0x50 | set active | `FUN_003766a0` (ELF 0x3766a0-0x3767bc; not decompiled) |
| +0x54 | set normal | `FUN_0036e6b0` D:L267182 |
| +0x60 / +0x64 / +0x68 | zAnim command: parse / execute / name to op | `FUN_003769c0` / `FUN_00376870` / `FUN_003767c0` |
| +0x70 | set the image's opacity (x 128) | `0x37c2c0` (ELF) |
| +0x74 | press | `FUN_00370c20` D:L268554 |
| +0x78 | draw the body (state image) | `FUN_0037c220` D:L274561 |
| +0x8c | the attached UIVAR changed | `FUN_00376b40` D:L271662 |

**The pad record** (what +0x44 receives; its source and its repeat are PLAT-11's, research 116): one byte per PS2
button at `record + 1 + code`, the codes of `FUN_0036a5d0` (D:L264986-265078) -- START 0, SELECT 1, RIGHT 2, LEFT 3,
UP 4, DOWN 5, TRIANGLE 6, CIRCLE 7, SQUARE 8, CROSS 9, R1 10, R2 11, L1 12, L2 13 -- each holding the binding states of
`ParseButtonAnim` (D:L262766-262784): 0 UP (released), **1 FALLING (pressed this frame)**, 2 DOWN (held), 3 RISING
(released this frame). The left stick is read separately (§2.4).

## 2. BUTTON (`C2DButton`) -- and the base of SLIDERBAR, CHECKBOX, RADIOSTRIP

### 2.1 What a state is

`FUN_00376bd0` (D:L271696-271854) copies the spec's four state blocks into four run-time blocks of the same shape: the
image's name and its texture, the image `PULSE`, the `TEXT_GLOW` `RANGE` (two values) with its on-flag and `TIME`, the
`TEXT_COLOR` (three components) and the state's `SCALE`. The run-time order is PRESSED (+0xc8), ACTIVE (+0xfc), NORMAL
(+0x130), DISABLED (+0x164) -- the spec's order (research 105 §3 gives the reader, the block and the flat forms, and the
defaults: colour 128,128,128, scale the button's `SCALE`). The same function copies `XSIZE`/`YSIZE` (the body's size,
as floats), `XOFFSET`/`YOFFSET` (the caption's offset; defaults **10** and **5**, `FUN_00377800` D:L272118-272119),
`HCENTERED`, and the `ANIMATIONS` list (button and event bindings, 16 bytes each).

**Applying a state** (`FUN_0036e840`, `FUN_0036e830`, `FUN_0036e790`, `FUN_0036e730`; D:L267206-267262) does, in order:

1. the body image becomes the state's texture, sized `XSIZE x YSIZE` at (0, 0) (the texture argument is in a register
   the decompiler drops; the disassembly at 0x3766d4 passes the block's texture);
2. the caption's scale becomes the state's `SCALE`;
3. the caption's colour becomes `TEXT_COLOR`, its alpha **100** (`0x42c80000`, of the GS's 128), and the glow is set
   from the state: on when the state carries `TEXT_GLOW`, with its `TIME` and `RANGE` (§3);
4. the image pulse: a state `PULSE` of 0 sets the body's alpha to 128 and stops the pulse; otherwise the pulse runs with
   that period (§3.2).

### 2.2 The four entries

| entry | when | does | lines |
|---|---|---|---|
| **set normal** (+0x54) | the focus leaves (PLAT-11); `FUN_00380500` at creation (D:L276718); set-enabled(true) | if enabled: clears the press clock, applies NORMAL | `FUN_0036e6b0` D:L267182-267201 |
| **set active** (+0x50) | the focus arrives (PLAT-11) | if enabled: applies ACTIVE, then runs every `EVENT ONACTIVATE` binding of the button (event 2) in list order, each with its `ARGUMENT` | `FUN_003766a0`, ELF 0x3766a0-0x3767a8 |
| **press** (+0x74) | CROSS's press edge (§2.3) | if enabled: the press clock = **0.2 s** (`0x3e4ccccd`), applies PRESSED | `FUN_00370c20` D:L268554-268572 |
| **set enabled** (+0x4c) | scripts (`ActivateButton` and the like: PLAT-08's table) | stores the flag; false: applies DISABLED (`FUN_003773f0` D:L271967-272006) whatever the state; true: applies NORMAL unless the state is ACTIVE or PRESSED | `FUN_00377380` D:L271950-271962 |

**The tick** (+0x38, `FUN_003723b0` D:L269237-269276) ticks the caption (its glow, §3) and the body image (its pulse),
then runs the press clock down by dt; when it reaches 0 the button returns to **ACTIVE** if enabled, else to DISABLED.
The return does not fire `ONACTIVATE` again (only set-active does).

| state | entered by | left by | texture | caption colour | glow | scale |
|---|---|---|---|---|---|---|
| NORMAL | set normal; creation; set enabled(true) from DISABLED | set active, set enabled(false) | NORMAL `IMAGE` | NORMAL `TEXT_COLOR`, alpha 100 | NORMAL's, if any | NORMAL `SCALE` |
| ACTIVE | set active; the press clock's end | set normal, press, set enabled(false) | ACTIVE `IMAGE` | ACTIVE `TEXT_COLOR` | ACTIVE `TEXT_GLOW` | ACTIVE `SCALE` |
| PRESSED | press (CROSS) | 0.2 s later to ACTIVE; set normal; set enabled(false) | PRESSED `IMAGE` | PRESSED `TEXT_COLOR` | PRESSED's, if any | PRESSED `SCALE` |
| DISABLED | set enabled(false) | set enabled(true) -> NORMAL | DISABLED `IMAGE` (flat form: none, research 105 §3) | DISABLED `TEXT_COLOR` | DISABLED's, if any | DISABLED `SCALE` |

### 2.3 The pad (`FUN_00377040`, D:L271859-271945)

1. A disabled button returns "not handled" for every input (the screen's own bindings then see it, PLAT-10/11).
2. A button with children (the screen's control list is one) hands the input to the child at the focus index and stops
   there (D:L271934-271941).
3. A leaf: if CROSS is FALLING, **press** (§2.2) -- whether or not a CROSS binding exists (D:L271883-271885).
4. Then the button's own button bindings in list order: the first whose button's state equals the binding's `STATE`
   (default FALLING) -- or, for a FALLING binding on UP, DOWN, LEFT or RIGHT, the left stick's edge in that direction
   (§2.4) -- starts its animation with its `ARGUMENT` and the input is handled. None: not handled.

| PS2 button | BUTTON does |
|---|---|
| CROSS (press edge) | PRESSED for 0.2 s, then ACTIVE; then its CROSS binding, if any |
| any bound button, in its bound state | the binding's animation (first match only) |
| UP/DOWN/LEFT/RIGHT bound FALLING | also fired by the left stick's edge |
| anything else | not handled (passes to the screen) |

### 2.4 The stick's edge (`FUN_0036a060`, D:L264745-264799)

The screen keeps a "stick was centred" flag (`FUN_00368650` D:L263829-263846: both axes within 0.2, or 0.6 once a
direction fired). `FUN_0036a060` returns a direction only when the flag was set and an axis is now beyond 0.6; the
button maps direction 3 to UP, 4 to DOWN, 1 to LEFT, 2 to RIGHT (D:L271900-271914). Which axis sign is which direction
is PLAT-11's (research 116).

### 2.5 The draw (`FUN_00377aa0` D:L272218-272240, `FUN_0037c220` D:L274561-274576)

If visible: the body -- the current state's texture over `XSIZE x YSIZE` from the button's position, or, with
`HCENTERED`, from `-XSIZE/2` to `+XSIZE/2` around it -- then the caption at (position + `XOFFSET`, position + `YOFFSET`)
in the state's colour, alpha and scale (the caption's own centring is the `HCENTERED` flag passed to the text, PLAT-13).

### 2.6 The caption's commands and UIVAR

`Caption` sets the caption to a locale string by name, `Valve` to `"%d"` of a valve (made PERM at 0 when absent)
(`FUN_00376870` D:L271548-271614, names `FUN_003767c0` D:L271510-271541). A button with a `UIVAR` shows the var's printed
value (`%d`, `%f`, `%s`; `FUN_00376b40` D:L271662-271691) whenever the var changes.

## 3. The glow and the pulse

### 3.1 `TEXT_GLOW` (`FUN_00363b30`, D:L261297-261315, the caption's tick)

While the caption's glow flag is on, each tick:

- `phase += dt / 2`; if `phase > TIME`, `phase -= TIME` (the constant 2.0 at 0x363b50, read in the disassembly);
- `s = sin(3.14 x phase / TIME)` (`3.14f` = 0x4048f5c3 at 0x363b88; `FUN_001b3720` is `sinf`, D:L33037-33070);
- `alpha = 128 x (r0 + s x (r1 - r0))`, with `RANGE (r0 r1)` -- the first value the trough, the second the peak.

So the curve is a **rectified half-sine** on the caption's **alpha** (its colour is untouched), period **2 x TIME** s,
from `r0 x 128` up to `r1 x 128` at the middle of the period and back. `3.14` instead of pi leaves `s = 0.0016` at the
wrap. The phase starts at 0 when the caption is made (`FUN_00363e70` D:L261480) and **is not reset** when a state is
applied: a button activated a second time resumes the glow where it stopped. A state without a glow sets alpha 100 and
the phase stands still.

| dialog | state | `RANGE` | `TIME` | period | alpha |
|---|---|---|---|---|---|
| `dlgOptions_Menu` (five buttons, the HDD strip), `dlgOptions_Audio` (two buttons, the SOUND strip) | ACTIVE | 0.5 1 | 0.5 | 1.0 s | 64 .. 128 |
| `dlgMenu` (the six buttons) | ACTIVE | 0.3 1 | 0.8 | 1.6 s | 38.4 .. 128 |
| LISTBOX focus row | ACTIVE (`ACTIVE_COLOR`'s `RANGE`/`TIME`, §6) | per dialog | per dialog | 2 x TIME | as above |

**The 5 fps** (R117.7): sampling a curve of period 2 x TIME at 0.2 s gives 5 samples per options cycle and 8 per
`dlgMenu` cycle; the samples' phase is the capture's, so the comparison fits a phase offset (the phase at activation
depends on how long the button glowed before). The game's dt -- the UI tick's -- is PLAT-12's (research 110): **if
PCSX2's curve shows a period of TIME rather than 2 x TIME, the caption is ticked twice per frame** and this note's
reading is wrong (`GLOW_PERIOD_READING`).

### 3.2 `PULSE` (`FUN_00378fc0`, D:L272894-272914; the same code in the LISTBOX's tick, D:L270627-270638)

While an image's pulse flag is on: `phase += 2 pi x dt / PULSE`, wrapped to [0, 2 pi); `alpha = 64 + 64 sin(phase)` --
a full sine between 0 and 128 with a period of `PULSE` seconds. An IMAGE's `PULSE` key starts it at creation
(`FUN_00379080` D:L272927-272931); a button state's `PULSE` starts it on the button's body when the state is applied,
and a state with none stops it at alpha 128.

## 4. SLIDERBAR (`CSliderBar`) -- the unknown of the block

**Made** by `FUN_0037e730` (D:L275752-275794): a button (0x510 bytes) with a knob image at +0x460 (position +0x440
starting at 0.5, `CENTER_VALUE` +0x450 at 0.5, step +0x500 at 10). **Set up** by `FUN_003724f0` (D:L269281-269317): the
button's set-up, then the knob's texture (`KNOB_TEXTURE`; none hides the knob), size (`KNOB_SIZE`), colour 255 and alpha
128 (D:L269296-269299), `CENTER_VALUE` and `NUM_INTERVALS` from the spec (D:L269300-269301; their defaults 0.5 and 10 are
the factory's, D:L277931-277933), and the UIVAR attached and read (§4.2).

### 4.1 The step (`FUN_00371d00`, D:L269059-269182) -- the slider's pad input

The handler is the slider's own: it does not call the button's, so CROSS does nothing on a slider and the slider's
button bindings are never consulted. Disabled: not handled.

| input (pad byte) | does | lines |
|---|---|---|
| LEFT FALLING | `p -= NUM_INTERVALS x 0.01`, floored at 0; the UIVAR written (§4.2); SELECTION sound; hold clock = 0; the screen's `SLIDER_MOVED` bindings fired | D:L269072-269098 |
| LEFT DOWN (held) | when the hold clock > 0.4 s: the same step and write and SELECTION sound, no `SLIDER_MOVED`, the clock **not** reset; handled either way | D:L269099-269124 |
| RIGHT FALLING | `p += NUM_INTERVALS x 0.01`, capped at 1; as LEFT | D:L269125-269151 |
| RIGHT DOWN (held) | as LEFT held | D:L269152-269177 |
| anything else | not handled | D:L269178-269181 |

- **The constant is `0.01f`** (`lui 0x3c23; ori 0xd70a` at 0x371d4c) times the step as a float, both float32: with
  `NUM_INTERVALS 2` the step is `0.02f`. From 1.0, fifty steps leave a float residue that the 51st clears, but the
  50th already draws the knob at the empty end (the integer cast), so the knob reaches the end in **50 presses**.
- **The hold clock** is +0x504: the slider's tick (`FUN_003721e0` D:L269187-269193) adds dt after the button's tick. A
  held key therefore moves the knob once per input call after 0.4 s; how often the screen calls the input is PLAT-11's
  (if every frame at 60 Hz: 1.2 of the track per second). `SLIDER_HOLD_CADENCE_READING` until research 116 settles it.
- **`SLIDER_MOVED`** is event 0x28 (`ParseButtonAnim`'s chain, D:L262610-262611); the screen fires it through
  `FUN_00367810(screen, 0x28, 0)` (D:L263359-263397), which runs every screen-level `EVENT SLIDER_MOVED` binding.
- **The SELECTION sound** is `FUN_0036a2c0` (D:L264855-264862): the sound `uisounds.rdr`'s `SOUNDS` `SELECTION` names
  (`DAT_00408564`, read at D:L55211-55216). Its bank and index are PLAT-23's (research 122).
- **The left stick does not move a slider** (the handler reads only the pad bytes).

### 4.2 The value (`FUN_00371d00`, the write; `FUN_00371c50`, the read -- ELF 0x371c50-0x371cfc)

The knob position `p` (0..1) and the UIVAR's real value `u` are tied through `C = CENTER_VALUE`:

- write (after a step): `u = 2 p C` when `p < 0.5`, else `u = C + (p - 0.5) x 2 (1 - C)`; the var is set only if it is
  not already that real (`FUN_003863d0`, the set of research 104 §4, tells the attached items);
- read (the var changed, slot +0x8c): only a **real** var moves the knob -- `p = 0.5 u / C` when `u < C`, else
  `p = 0.5 + 0.5 (u - C) / (1 - C)`; an integer or string var is ignored; nothing clamps `p`.

With `C = 0.5` both are the identity. **The disc's eight sliders** (`dlgOptions_Audio` music, sound, dialog, headset at
`XSIZE 290`; `dlgOptions_Video` brightness and `dlgControllerSelection`'s three stick sliders at `XSIZE 280`) all carry
`NUM_INTERVALS 2` and no `CENTER_VALUE`.

**The zAnim command** `SetValue n` (`FUN_00372640` D:L269324-269350; name `FUN_00372870`, key `SETVALUE` in
`FUN_00372780`) sets `p = n / 100` and writes `u = p` directly -- **without** the `CENTER_VALUE` mapping (identical at
0.5). It plays no sound and fires nothing.

### 4.3 The draw (`FUN_00372220`, D:L269198-269232)

If visible: the body (state image -- the disc's sliders have none: their track is a separate IMAGE such as
`musicslider`) and the caption, as a button. Then **always**: the knob at
`x = (int)(slider.x + p x XSIZE)`, `y = slider.y`, `KNOB_SIZE` wide and high -- so the knob's left edge runs from the
slider's `XPOS` (empty) to `XPOS + XSIZE` (full): 211 to 501 on the audio page. The knob is drawn outside the
visibility test (`SLIDER_KNOB_WHEN_HIDDEN_READING`: a hidden slider still draws its knob unless the knob itself is hidden).

| state | the slider shows |
|---|---|
| NORMAL / ACTIVE / PRESSED / DISABLED | the button's (caption colour; the disc's sliders: `NORMAL_COLOR` 128, `ACTIVE_COLOR` 91,72,36, `PRESSED_COLOR` 102,87,38, `DISABLED` 50,50,50; no glow) -- PRESSED is never entered (no press) |

## 5. RADIOSTRIP and CHECKBOX

### 5.1 RADIOSTRIP (`CRadioStrip`)

A button whose children are its `SUBORDINATES` (the disc's: CHECKBOXes). Made by `FUN_003874e0` (D:L280444-280464):
selection +0x440 = **0**; `FUN_003710c0` (D:L268728-268734) marks it "to apply".

| input | does | lines |
|---|---|---|
| LEFT FALLING | selection - 1; from 0 to the last (**wraps**) | D:L268683-268694 |
| RIGHT FALLING | selection + 1; from the last to 0 | D:L268695-268706 |
| CROSS FALLING | as RIGHT | D:L268707-268718 |
| anything else (held keys included) | not handled | D:L268719-268721 |

After each change: **apply** -- the child at the selection is set ACTIVE (so its `ONACTIVATE` bindings run), every other
child set NORMAL (`FUN_00370d10` D:L268592-268613); then **check** -- every checked child other than the selection is
unchecked and its `ONUNCHECK` animation started, then the selection, if unchecked, is checked and its `ONCHECK` started
(`FUN_00370db0` D:L268618-268666); then the SELECTION sound. The strip never shows PRESSED (no press), and its own
BUTTON bindings are not read (its handler replaces the button's).

- **The first tick** (`FUN_00370cb0` D:L268577-268587) applies and checks once if marked: the strip's initial
  selection is checked and its `ONCHECK` runs then (on `dlgOptions_Menu` that is `Enable_HDD` or `Disable_HDD`, each of
  which opens a popup -- whether a script valve guards it is PLAT-07's to read).
- **`Selection INDEX n`** (execute `FUN_003710d0`, ELF 0x3710d0-0x371198; name `FUN_00371290` D:L268769-268814; parse
  `FUN_003711a0`, key `SELECTION`/`INDEX`): an index past the last is ignored; otherwise apply and check as above, no
  sound. The strip's `VALVE` key is read by nothing (research 105 R105.6): its scripts set it.
- The children's ACTIVE/NORMAL follow the selection, **not** the focus: on `dlgOptions_Menu` the checked box's caption
  is in its ACTIVE colour while another row has the focus (§11.2).

### 5.2 CHECKBOX (`CCheckBox`)

Made by `FUN_0037de60` (D:L275419-275467), set up by `FUN_00371550` (D:L268862-268891): a button plus a check image
(+0x480) placed at `CHECK_OFFSET` and sized `CHECK_SIZE`, colour 255, alpha 100, its texture `CHECK_TEXTURE`; the
`ONCHECK` and `ONUNCHECK` bindings; checked +0x440 starts false.

- **Draw** (`FUN_003713a0` D:L268819-268857): the button (if visible), then, while checked, the check image -- outside
  the visibility test, like the slider's knob.
- **Pad** (`FUN_00371680` D:L268896-268937): CROSS FALLING toggles and starts `ONCHECK`/`ONUNCHECK`. **No dialog on the
  disc reaches it**: all 42 checkboxes are RADIOSTRIP subordinates (research 96 R96.4), and the strip does not pass its
  input on.
- Its states are the button's; the disc's checkboxes are flat-form (`NORMAL`/`ACTIVE`/`PRESSED` `op_checkbox.tif`,
  `NORMAL_COLOR` 128, `ACTIVE_COLOR` 91,72,36, `PRESSED_COLOR` 102,87,38, no DISABLED, no glow).

## 6. LISTBOX (`CUIListBox`)

Made by `FUN_0037e8b0` (D:L275799-275865): an image (its background) with four more images -- the focus highlight
(+0x1a0), `ACTIVE_BACKGROUND` (+0x240), the up arrow (+0x2e0), the down arrow (+0x380) -- a list of items, up to 30
bindings (+0x420), the focus +0x194, the top row +0xb8, the focus's pixel offset in the window +0xb0, the drawn scroll
+0xb4, the row height (`SPACING`, +0xac), `SPEED` +0x184 (**60**), the item alpha +0xe0 (**80**).

### 6.1 States

| state | entered by | does | lines |
|---|---|---|---|
| normal | set normal (focus leaves) | current colour = `NORMAL_COLOR`; hides `ACTIVE_BACKGROUND`; highlight texture `NORMAL`; highlight alpha 100; item alpha **80**; glow off | `FUN_00376420` D:L271269-271297 |
| active | set active (focus arrives); 0.2 s after a press | current colour = `ACTIVE_COLOR`; shows `ACTIVE_BACKGROUND`; highlight texture `ACTIVE`; item alpha **100**; the focus row's glow = `ACTIVE_COLOR`'s `RANGE`/`TIME`; the focus clamped to the last item and the view set to it; the focus item's `FOCUS_ANIM` started; the list's `ONACTIVATE` (event 2) bindings run with the argument rule below | `FUN_00374cb0` D:L270516-270606 (the rule D:L270580-270591) |
| pressed | the focus item's binding fired | current colour = `PRESSED_COLOR`; highlight texture `PRESSED`; a 0.2 s clock, after which -- if the colour is still the pressed one -- set active (so `FOCUS_ANIM` and `ONACTIVATE` run **again**) | `FUN_00374a50` D:L270448-270471; D:L270682-270701 |
| disabled | -- | no LISTBOX disabled look (research 105: no disabled colour); a disabled list refuses input | |

**The argument rule** (a list binding -- `ONACTIVATE`, `ONFOCUS`, or a button binding at §6.2 step 2): the binding's
`ARGUMENT` when it has one. Without one it depends on the focus item being **selectable** (item +0x24): selectable,
the item's `USERDATA` when set, else its caption (the empty string when the item has no text); **not selectable, the
animation is not started at all**, `USERDATA` or not. Lines: `FUN_00374cb0` D:L270580-270591, `FUN_003745e0`
D:L270384-270395, `FUN_00374010` D:L270180-270191, `FUN_003742f0` D:L270276-270287. The ungated order (`ARGUMENT`,
else `USERDATA`, else caption, whatever the item) is only `FUN_00374b50`'s (D:L270476-270511), a by-index getter; the
binding paths above inline the gated form.

### 6.2 The pad (`FUN_003745e0`, D:L270311-270443)

Disabled or empty: not handled. Otherwise the focus is first clamped to the last item. Then, in this order:

1. **The focus item's own binding** (an `OPTIONS` entry's): when its button is FALLING and the item is selectable
   (item +0x24): the hold clock +0x180 zeroed (D:L270350); its animation looked up -- **not found: not handled**, no
   press (D:L270352-270353); found: started with its `ARGUMENT`, else `USERDATA`, else no argument; then **press**
   (§6.1). Handled.
2. **The list's bindings** (`ANIMATIONS`): the first whose code is non-zero and whose `STATE` equals the pad byte of
   that code. The test does not look at the record's kind: an `EVENT` binding (whose state is FALLING by default) is
   matched as a button binding of the same number -- `ONACTIVATE` (2) as RIGHT, `ONMPEGEND` (3) as LEFT, and so on
   (`LISTBOX_EVENT_AS_BUTTON_READING`; codes past 13 read bytes past the buttons). The first match ends the search: its
   animation looked up and the hold clock +0x180 zeroed (D:L270380) -- **not found: not handled**, no press, the press
   passes to the screen (D:L270381-270383); found: started by the argument rule (§6.1 -- a non-selectable focus item
   with no `ARGUMENT` starts nothing), press when the focus item is selectable, and handled either way (so on a
   non-selectable row an argument-less binding swallows the press silently).
3. **UP** (pad +5, D:L270413-270416 and D:L270437): FALLING, or the stick's up edge (`FUN_0036a7c0`): move up (the
   hold clock +0x180 reset); **UP held** (state 2, the UP byte's -- not the DOWN button) after the hold clock passes
   0.4 s: move up each call, the clock not reset.
4. **DOWN** (pad +6, D:L270418-270433): the same with the DOWN byte (`FUN_0036a970`): DOWN FALLING or the stick's down
   edge moves down, DOWN held (state 2) past 0.4 s moves down each call.
5. Otherwise handled only if `PADHOG` and LEFT or RIGHT (pad +4, +3) is FALLING (D:L270423-270428). The line also
   asks the stick, but only its down and up edges (`FUN_0036a970` is direction 4, `FUN_0036a7c0` direction 3, D:L265142
   and D:L265206), which steps 3 and 4 have already taken: a sideways stick flick is **not** handled, even with
   `PADHOG`, and the screen sees it.

**Moving** (`FUN_00374010` up, `FUN_003742f0` down, D:L270113-270306): at the first (last) item the move is refused and
the result is `PADHOG` -- without `PADHOG` the press passes to the screen, which moves the focus off the list (PLAT-11).
Otherwise the focus moves one item, the pixel offset by one row, the new item's `FOCUS_ANIM` (with `FOCUS_ARG`) starts,
the SELECTION sound plays, and every `EVENT ONFOCUS` (0x2b) binding runs by the argument rule (§6.1: on a
non-selectable item an argument-less binding starts nothing).

### 6.3 Scrolling (the tick, `FUN_00375040`, D:L270611-270739)

1. The background image's pulse (§3.2).
2. While the focus's pixel offset is past the window's `YSIZE - 2 x SPACING`, the top row moves down one; while it is
   above 0, up one. If the top row changed, every `EVENT ONSCROLL` (0x29) binding runs.
3. The drawn scroll moves toward `-top x SPACING` by `max(SPEED, 2 x distance) x dt` pixels, or lands on it; on landing
   (from a non-zero distance) every `EVENT ONSCROLL_END` (0x2a) binding runs.
4. The press clock (§6.1), the hold clock (+= dt), and each item's content ticked (a text item's glow).

### 6.4 The draw (`FUN_00373850`, D:L269930-270073)

From the list's screen position (x, y), the first row at `y + TOP_MARGIN`, text at `x + LEFT_MARGIN`:

- if there are items: the highlight image across the list's width at `y + TOP_MARGIN + focus offset + HIGHLIGHT_OFFSET -
  0.75 x SPACING`, as tall as the focus item's rows x `SPACING`, in the current highlight texture (not drawn while
  `NOSELECT`/`Highlight_off`); `ACTIVE_BACKGROUND` at its `OFFSET` and `SIZE`;
- the list's own image (its texture from a string UIVAR, as an IMAGE's) and base;
- the items, clipped to the band from one row above the first to the list's `YSIZE`: each at `y + TOP_MARGIN + rows so
  far x SPACING + scroll`, drawn when inside it. A text item: alpha 80, or the list's item alpha (80/100) on the focus
  row; the focus row's text glows with the list's active `RANGE`/`TIME` when that `TIME` is non-zero
  (`FUN_0037a810` D:L273693-273736). A column item: the same, its colour `NORMAL_COLOR` off the focus row and the
  current colour (normal, active or pressed) on it (`FUN_0037ab90` D:L273817-273900);
- the up arrow: alpha 0 when the scroll is at the top or the list is empty, else the focus row's alpha; the down arrow:
  the focus row's alpha while rows remain below the window, else 0.

### 6.5 The commands (`FUN_00372980` D:L269435-269649; names `FUN_00373640` D:L269831-269925)

`Finish` (every item's content finished), `Highlight_on` / `Highlight_off` (the `NOSELECT` flag cleared / set),
`Has_Items` (true when not empty), `GetItemCount VALVE v`, `GetFocusIndex VALVE v` (the valve set, made TEMP when
absent, watchers told), `SetFocusIndex VALVE v` (the focus = the valve, unclamped; the top row reset to 0 and the
focus offset recomputed, the tick then scrolling to it), `AddItem VALVE v
UIVAR a` (the element `v` of array var `a` appended; with `AUTOSCROLL` the focus moves to it), `RemoveItem VALVE v`,
`RemoveAllItems`, `GetContents UIVAR a` (the items' contents into `a`).

## 7. The stateless classes

**TEXT** (`CRenderableString`): set up by `FUN_003792f0` (D:L273016-273079: `SCALE`, the caption through the locale,
`HCENTERED`/`RIGHT_JUSTIFIED`, `COLOR`, `FONT`, the UIVAR); drawn by `FUN_0037a540` (D:L273602-273622) at its position,
alpha 128 (`FUN_00363e70` D:L261476), the glow off (no TEXT key turns it on); a UIVAR's change shows its printed value
(`FUN_00379260` D:L272983-273011); commands `Caption` and `Valve` (`FUN_0036fcc0` D:L268007-268081, research 95 §1.2).
The glyphs are PLAT-13's.

**SECURETEXT** (`CSecureText`): a TEXT whose set-text (slot +0x70, `FUN_0036aff0` D:L265383-265413) writes one `*` per
character of the string it is given -- a multi-byte character counts once (`FUN_0039f160` steps it) -- into a 268-byte
buffer (unchecked), and sets that without the locale lookup. Every path into the text goes through it, so the caption,
the UIVAR and a `Caption` command are all masked. The disc's three: `dlgCreateGame` `password_val` (UIVAR
`PlayerGamePassword`) and `spec_password_val` (`SpectatorGamePassword`), `dlgNetPlayerName` `password_val`
(`PLAYERPASSWORD`).

**IMAGE** (`CPlainBmp`): `FILENAME` sized `XSIZE x YSIZE`; `PULSE` (§3.2); a string UIVAR names the texture, re-resolved
when the name changes (`FUN_00379160` D:L272950-272978).

**WRAPPEDTEXT** (`CWrappedText`, set up by `FUN_0037a430` D:L273560-273597):

- the text breaks into lines at spaces to fit `WIDTH`; `#C` plus three bytes sets the colour of the text after it; `#B`
  toggles a per-line flag (its look is PLAT-13's: `WRAP_HASH_B_READING`) (`FUN_00379f70` D:L273409-273555);
- the line height is `SPACING` (default 10); the lines are clipped to the window `WIDTH x HEIGHT`; with
  `DISPLAY_ONE_LINE` the lines run along one row instead (`FUN_003794b0` D:L273084-273195);
- `Scroll_Up` / `Scroll_Down` move the scroll by one line within the text's height (`FUN_00379b10` D:L273272-273303);
  with `AUTOSCROLL` a new text resets the scroll and the window shows the **last** lines;
- the arrows (`UP_ARROW`, `DOWN_ARROW`: `TEXTURE`, `OFFSET`, `SIZE`) pulse at 1 s, the down arrow taking the up arrow's
  alpha (`FUN_00379ab0` D:L273257-273267); the up arrow shows while scrolled, the down arrow while lines remain below.

**PROGRESSBAR** (`CHProgressBar`; set up by `FUN_00371a10` D:L269003-269054):

- its UIVAR (a real, or an integer floated) is the **duration in seconds** (`FUN_00371ba0`, ELF 0x371ba0-0x371c4c:
  the duration stored at +0xa8), and **every change of the var resets the fill to 0** (+0xa0: `sw zero,0xa0(a0)` in
  the `jr ra` delay slot at 0x371c44, reached on every path) -- a duration set or re-set mid-load restarts the bar from
  empty. No script on the disc sets `Load_progress` today (the name is in no ELF string; its one hit is `READERC.ZAR`);
- the tick adds `dt / duration` to the fill and caps it at 1 (`FUN_003719e0`, ELF 0x3719e0-0x371a0c) -- a duration of
  0 (an unset var) fills it at once;
- the draw clips to `XSIZE x fill` by `YSIZE` and draws the image (`FILENAME`, or the texture a string UIVAR names when
  `FILENAME_IS_UIVAR`) under the clip -- revealed left to right, not stretched -- and moves the scene node
  `LEADING_EDGE_NODE` to the fill's edge (`FUN_003717c0` D:L268942-268998).
- The disc's one bar (`dlgLoad` `load_progress_filling`, 270 x 2, `load_line.tif`, UIVAR `Load_progress` with no value)
  is set by no code and no script (a search of the ELF and the three zAnim archives): full at the first tick.

**COUNTER** (`C2DCounter`; made by `FUN_00381be0` D:L277427-277482, keys `StartTime`, `ValVar`, `EndTime` or
`Duration`, `FUN_00381e10` D:L277574-277592):

- the target is the `ValVar` UIVAR's value (integer, or a real truncated) read **once** at creation; the clock starts at
  0 and runs at `dt x 1.0` (`DAT_003e0380` = 1.0) until past the end;
- between `StartTime` and the end the shown number is `(int)(target x (clock - start) / (end - start))`, at the end the
  target; before `StartTime` the spec's `CAPTION` stays; each change of the shown number sets the caption `"%d"` and
  plays the TELETYPE sound (`FUN_0036a300` D:L264867-264874, the `TELETYPE` entry of `uisounds.rdr`, D:L55197-55202)
  (`FUN_0037b5c0` D:L274186-274245);
- `Start` sets `StartTime` to the clock now; `Finish` stops the clock and shows the target (`FUN_0037b490`
  D:L274143-274181). The disc's four are on `dlgMultiplayerFinalReally`.

## 8. Where this differs from the roadmap and research 95

| where | says | the code |
|---|---|---|
| `01-platform.md` PLAT-15 "Class op handlers: list `FUN_00373640`, scroll `FUN_00379970`, SetValue `FUN_00372870`, Selection `FUN_00371290`" (from research 95 §1.2) | the handlers | these are the classes' command **name** lookups (slot +0x68). The handlers (slot +0x64) are `FUN_00372980` (LISTBOX), `FUN_00379b10` (WRAPPEDTEXT), `FUN_00372640` (SLIDERBAR), `FUN_003710d0` (RADIOSTRIP, ELF only), `FUN_0037b490` (COUNTER), `FUN_00376870` (BUTTON), `FUN_0036fcc0` (TEXT). Research 95 §1.2's "vtable+100" (0x64) for the base `FUN_0036fcc0` is right |
| the same, "scroll `FUN_00379970`" | the LISTBOX's scroll | WRAPPEDTEXT's (and SCROLLINGTEXT's) `Scroll_Up`/`Scroll_Down` names. The LISTBOX scrolls in its tick (§6.3) |
| `01-platform.md` PLAT-15 Unknowns, `music_only_mission.txt` | "about 5 px per press", "~54 presses"; `NUM_INTERVALS 2` "does not fit" | 5.8 px (5 or 6) per press and 50 presses, a step of `NUM_INTERVALS` per cent (§4.1, §11.1) |
| `01-platform.md` PLAT-15 "the ACTIVE glow sampled at 5 fps" | a 5-fps glow | a continuous per-tick curve of period 2 x TIME (§3.1); 5 fps is the capture's rate |
| `01-platform.md` PLAT-15 "`dlgMenu`: ... ACTIVE 0.75 with glow 0.3-1 over 0.8 s" | 0.8 s | `TIME 0.8` is half the cycle: the glow repeats every 1.6 s |

Research 95 is not edited here.

## 9. What is settled, what is not, what would settle it

- **Measured** (PCSX2 frames, §11.1): the slider's step and its travel.
- **Read** (the lines above): the class map and slots; each class's states, their entry and exit and what each changes;
  the pad tables; the glow's and the pulse's curves; the slider's mapping and repeat; the strip's wrap, apply and check;
  the list's movement, scroll and events; the masking, the bar, the counter.
- **Not settled**:
  - the glow's period on the console (`GLOW_PERIOD_READING`): one caption tick per frame is read, not measured --
    PLAT-15's 5-fps burst of a focused options button settles it (1.0 s vs 0.5 s);
  - how often a held key reaches a widget's input (`SLIDER_HOLD_CADENCE_READING`; the LISTBOX's held UP/DOWN the same) --
    research 116 (PLAT-11) and a PCSX2 held-LEFT burst on the audio page;
  - which axis sign the stick's directions 1-4 are (§2.4) -- research 116;
  - the LISTBOX's event-as-button match (`LISTBOX_EVENT_AS_BUTTON_READING`): read, unobserved -- RIGHT on a list with
    an `ONACTIVATE` binding (any of the online lists) on PCSX2;
  - the knob and the check mark drawn by a hidden widget (`SLIDER_KNOB_WHEN_HIDDEN_READING`) -- no dialog on the disc is
    known to hide a slider or a checkbox, so it may never show;
  - the PROGRESSBAR's full-at-once fill (`PROGRESSBAR_UNSET_READING`) -- a PCSX2 frame of the loading screen;
  - the WRAPPEDTEXT `#B` look (`WRAP_HASH_B_READING`) -- PLAT-13;
  - how a RADIOSTRIP's checkboxes reach the screen's draw (the strip's draw is the button's; the children are drawn by
    the screen's walk, PLAT-14) -- not traced;
  - the first-tick `ONCHECK` of `dlgOptions_Menu`'s HDD strip and its popup: whether its script guards it (PLAT-07).

## 10. The PS2 button table, all classes

| class | CROSS | LEFT / RIGHT | UP / DOWN | TRIANGLE / CIRCLE / SQUARE / START / SELECT / L / R | held |
|---|---|---|---|---|---|
| BUTTON | PRESSED 0.2 s, then its binding | its binding, else the screen's | its binding, else the screen's | its binding, else the screen's | a binding with `STATE DOWN` fires each call |
| SLIDERBAR | nothing (passes) | step -/+ `NUM_INTERVALS` % | passes | passes | LEFT/RIGHT repeat after 0.4 s |
| RADIOSTRIP | next (wraps) | previous / next (wraps) | passes | passes | none |
| CHECKBOX (alone) | toggle | passes | passes | passes | none |
| LISTBOX | the focus item's binding if bound to CROSS (any button an item binds) | the list's bindings; else `PADHOG` swallows the buttons' press edge (a sideways stick flick passes); else passes | focus -/+ 1; refused at the ends (passes unless `PADHOG`) | the list's bindings | UP/DOWN repeat after 0.4 s |
| TEXT, SECURETEXT, IMAGE, WRAPPEDTEXT, PROGRESSBAR, COUNTER | not controls: no input (WRAPPEDTEXT scrolls only by command) | | | | |

"Passes" = not handled: the screen's own bindings and the focus movement (PLAT-10, PLAT-11) see the press.

## 11. The captures

### 11.1 The slider on PCSX2 (`D:/socom_archive/parity/s10_r4h_music_pcsx2`)

The music-only run (`scripts/parity/music_only_mission.txt`: LEFT taps 0.4 s apart) on PCSX2. The SOUND VOLUME knob's
bright columns (rows 148-170), frame by frame: 497-500 before the first LEFT (`s07`), then 492, 486, 481, 475, 470,
465, 459, ... -- 5 or 6 frame px a press -- reaching 227-230 at `s57`, **after 50 presses**, and staying there for the
ten that follow; the DIALOG VOLUME knob then does the same from `s68` to `s118`, 50 presses again. The 270 frame px
are the 290 game px of `XSIZE` at the capture's 0.93 horizontal scale (5.8 x 0.93 = 5.4 px a press). Each 0.4-s tap
moved the knob exactly once: no tap reached the 0.4-s repeat.

### 11.2 The options menu (`logs/parity/runs/options_explore`, `s05_DOWN.png`, `s09_DOWN.png`)

`dlgOptions_Menu`, AUDIO OPTIONS and then HDD focused: the focused row's body is `brown_back_real.tif` and its caption
in the ACTIVE colour (91,72,36 on the GS's 128 scale), the other rows `brown_back.tif` with the NORMAL 128 grey; the HDD
strip's checked DISABLED box carries the check image and its caption in the ACTIVE colour while AUDIO OPTIONS has the
focus (§5.1: the children follow the selection); the instruction line for the strip shows the CROSS glyph "or" the
RIGHT/LEFT glyphs -- the strip's three keys (§5.1).
A still frame shows no glow.

## 12. Placeholders and readings

Written as names for the PLAT-15 implementer; the rows that say "Code:" are constants in `packages/ui/src/widgets/` since
2026-10-02 (§13), the eight from `PAD_PAST_BUTTONS_READING` on added by that implementation.

| name | stands for | searched / reading | status |
|---|---|---|---|
| `GLOW_PERIOD_READING` | the `TEXT_GLOW` cycle | the caption's tick advances the phase by dt/2, so the cycle is 2 x `TIME` (`FUN_00363b30`, §3.1); one tick per frame assumed | *note only* (open: PLAT-15's 5-fps burst) |
| `SLIDER_HOLD_CADENCE_READING` | how often a held LEFT/RIGHT steps a slider after 0.4 s (and a held UP/DOWN moves a list) | once per input call (`FUN_00371d00`, `FUN_003745e0`); the call rate is the screen's. Code: `packages/ui/src/widgets/slider.ts` steps on every call it is given | reading (open: research 116, a PCSX2 held-LEFT burst) |
| `LISTBOX_EVENT_AS_BUTTON_READING` | a LISTBOX's event bindings matched as buttons | `FUN_003745e0` D:L270374-270378 tests code and state, not the kind | *note only* (open: a PCSX2 RIGHT on an online list) |
| `SLIDER_KNOB_WHEN_HIDDEN_READING` | the knob / check mark of a hidden slider / checkbox | drawn outside the visibility test (`FUN_00372220`, `FUN_003713a0`); PLAT-14's walk passes a hidden node before its widget draws, so the code draws none. Code: `packages/ui/src/widgets/slider.ts` | reading (open; maybe never visible) |
| `PROGRESSBAR_UNSET_READING` | `dlgLoad`'s bar fill | `Load_progress` is set by nothing found: duration 0, full at once. Code: `packages/ui/src/widgets/progressBar.ts` | reading (open: a PCSX2 loading-screen frame) |
| `WRAP_HASH_B_READING` | the WRAPPEDTEXT `#B` flag's look | toggles a per-line flag (`FUN_00379f70`); its draw not read | *note only* (open: PLAT-13) |
| `PAD_PAST_BUTTONS_READING` | what a LISTBOX binding with a code past 13 finds in the pad record | `FUN_003745e0` D:L270374-270378 reads `record + 1 + code` unchecked; the record's bytes past the 14 buttons are PLAT-11's (research 116); 0 (UP) taken, so an event binding past 13 never matches. Code: `packages/ui/src/widgets/pad.ts` (§13.6) | reading (open: research 116's record) |
| `UIVAR_SPEC_TOKEN_READING` | a widget's `UIVAR` `VALUE` token as the var's node type | `parseRdr` keeps no node type (`TOKEN_TYPE_READING`, research 105 §1): integer-spelled int, number-spelled real, else string. Code: `packages/ui/src/widgets/host.ts` | reading (open: the reader's typed probe extended to `VALUE`) |
| `LISTBOX_ROW_ALPHA_START_READING` | a row text's alpha before its first draw (what the arrows read on the list's first draw) | `FUN_00363e70` D:L261476 sets 128; the item builder `FUN_0037b2f0` not read. Code: `packages/ui/src/widgets/listbox.ts` | reading (open: `FUN_0037b2f0`) |
| `LISTBOX_ITEM_ROWS_READING` | the rows one LISTBOX item takes | 1; a `WRAPPED_TEXT` column's count (the content's vtable +0xc) not read. Code: `packages/ui/src/widgets/listbox.ts` *(2026-10-15, NU-13, research 274 §9: read in the ELF -- the item's +0xc asks its content's +0x44: a column item the largest of its cells' (`FUN_0037cdc0` D:L274866-274885), a wrapped cell max(1, its text's +0x44, the lines its last draw counted) (0x37be30), a text or image cell 1 (0x36ba60); the code's `listboxItemRows`, with the wrapped cell drawn as the original's.)* | retired 2026-10-15 (NU-13): read, the constant replaced by `listboxItemRows` |
| `LISTBOX_CELL_SCALE_READING` | a LISTBOX cell's text scale | the list's `SCALE` (+0xa0, handed to the item builder D:L271171-271172); a column's `SCALE` calls the cell's +0x28 with no value (D:L273892-273893), not read. Code: `packages/ui/src/widgets/listbox.ts` *(2026-10-16, CLAN-DOT, research 272 §12: read in the ELF -- the caller loads the column's +0x18 into `$f12` (ELF 0x37ad88) and the text content's +0x28 is 0x37adf0, `swc1 $f12, 0x40(v1)`: a text column's non-zero `SCALE` is the cell's node scale at every draw, as research 185 read it -- TEXT, TIMED_TEXT and WRAPPED_TEXT contents alike (0x37adf0 at +0x28 of 0x407b40, 0x4070a0, 0x407140; the review's read); a WRAPPED_TEXT cell's lines keep the list's (`LISTBOX_WRAPPED_LINE_SCALE_READING`); the code's `listboxCellScale`.)* | retired 2026-10-16 (CLAN-DOT): read, the constant replaced by `listboxCellScale` -- reading, pending review |
| `LISTBOX_WRAPPED_LINE_SCALE_READING` | a WRAPPED_TEXT cell's lines under a column `SCALE` | the list's `SCALE`: the column's is written into the CWrappedText's +0x40 at every draw (0x37adf0), but the lines take it only at the text's set (`FUN_00379f70` D:L273490), before any draw, and the draw `FUN_003794b0` reads none (research 272 §12). Code: `packages/ui/src/widgets/listbox.ts` | reading (2026-10-16, CLAN-DOT; open: a set after a draw; no disc column affected) |
| `LISTBOX_ROW_FLAG_READING` | the column item's vtable +0x3c that gates the focus row's glow (D:L273848) | taken true, so the glow follows +0x17c alone (set by set active, cleared by set normal) -- research 111's `listboxRowLook` reading. Code: `packages/ui/src/widgets/listbox.ts` | reading (open: that entry) |
| `LISTBOX_ADDED_ITEM_READING` | an item `AddItem` appends | *(2026-10-05, ONL-14, research 164 §3: `FUN_0036bbc0` read -- the var rebuild's own builder, `itemOf`: an array element a column item; it was `FUN_0036bdd0`'s item with the element's string, research 185 had read it so.)* Code: `packages/ui/src/widgets/listbox.ts` | reading |
| `TEXT_UIVAR_FORMAT_CUT_READING` | a TEXT's, SECURETEXT's or WRAPPEDTEXT's printed `UIVAR` cut at its first "$~" | `FUN_00379260` (D:L272983-273011) prints into the text's +0x78; WRAPPEDTEXT's +0x78 is `FUN_00363830` (§13.8), whose cut is research 154 §7 (D:L261214-261243); TEXT's and SECURETEXT's +0x78 read in the ELF: the TEXT vtable 0x407a90 and the SECURETEXT vtable 0x406fa0 both hold 0x363830 at +0x78 (`FUN_00363830`; a fresh review, 2026-10-29). Fixes CREATE GAME's `gamename_val` drawing `<name>$~<room>` between `CreateMPGame` and the game lobby. Code: `packages/ui/src/widgets/host.ts` (`formatSetterCut`), `widgetSet.ts` | reading (2026-10-28; reviewed 2026-10-29: the vtables' +0x78 read) |
| `LISTBOX_GET_CONTENTS_PLACEHOLDER` | what `GetContents` (op 10) writes into its var | each item's serialised form (its +0x2c vtable +8, D:L269629-269643). Code: `packages/ui/src/widgets/listbox.ts` | replaced 2026-10-05 by `LISTBOX_GET_CONTENTS_READING` (research 164 §3: the serialisers read) |

Research 105's reading of a LISTBOX's `SPACING`, margins and scale when the keys are absent stands; it is the reader's.

## 13. The implementation (2026-10-02, PLAT-15)

The widget set is `packages/ui/src/widgets/` (`WidgetSet` and one class per type), tested by
`packages/ui/test/widgets/*.test.ts` (transcription), `widgetsDisc.test.ts` (dev disc) and
`tools/test/widgetScore.test.ts` (PLAT-30's scorer). What it stands on that §1-§11 did not say, each re-read at the
cited lines; values at the **reading** level, pending review.

### 13.1 Two corrections to this note

- **The caption's offset has no 10 / 5 default (§2.1).** `FUN_00377800` writes 10 and 5 into +0xb4 / +0xb8
  (D:L272118-272119), but `FUN_00376bd0` then copies the spec's `XOFFSET` / `YOFFSET` over them unconditionally
  (D:L271725-271728), and the spec's reader `FUN_00380620` starts both at 0 before its reads. A button without
  `XOFFSET` draws its caption at the node's x: PLAT-05's record (default 0) is right, and the widget uses it.
- **The LISTBOX's `UIVAR` names its background image's texture, not its items.** *(Corrected 2026-10-03, read twice
  independently -- ONL-01, research 144 §3, and ONL-04, research 147 §2: this bullet read the primary vtable's +0x8c,
  which is 0 and stands. The var is attached at the list's +0x80 (`FUN_00385df0(list + 0x80, var)`, D:L271185), whose
  own vtable 0x4076e0 (stored by the constructor `FUN_0037e8b0`, D:L275813) has at +0xc the thunk 0x37d060 (`j 0x3754d0`,
  `addiu a0, a0, -0x80`, read in the ELF) into `FUN_003754d0` (D:L270744-270828), which rebuilds the items from an
  **array** var; a **string** var is the bitmap, as below.)* The list's vtable +0x8c is 0 (read in
  the ELF at 0x407670 + 0x8c); its var is attached to the image's helper at +0x80 (`FUN_00375e20` D:L271177-271187), and
  the draw takes a **string** var's value as its bitmap when found (`FUN_00373850` D:L269994-270009), as an IMAGE's.

### 13.2 What §2-§7 leave open, now read

| what | reading | where |
|---|---|---|
| a new button's state | NORMAL by set normal: `FUN_00380500` ends in vtable +0x54 (D:L276718) -- research 111's `BUTTON_START_STATE_READING`, traced | `button.ts` |
| the caption at creation | `FUN_0036a3b0` (D:L264903-264925) sets the caption, then calls +0x8c when a var is attached: the var's printed value wins | `button.ts` |
| the button's binding loop | skips `EVENT` bindings: the kind byte at +0x250 is tested (D:L271881); a binding whose animation is not found still returns handled (D:L271915-271926) | `button.ts` |
| the walk's fade (vtable +0x34) | BUTTON, SLIDERBAR, CHECKBOX, RADIOSTRIP: `jr ra` at 0x1fe320 (the vtables 0x407790, 0x4075e0, 0x4074c0, 0x407430 +0x34, read in the ELF): a dialog's `OPACITY` never dims a control; LISTBOX and PROGRESSBAR: the image's 0x364860 (+0x3c, +0x4c); COUNTER: the text's 0x1f9150 (+0x54) | `button.ts`, `listbox.ts`, `counter.ts` |
| the LISTBOX's item alpha +0xe0 | 80 by set normal (D:L271290), 100 by set active (D:L270546) and press (D:L270468): research 111's `LISTBOX_SELECTED_ALPHA_READING` is settled (the widget uses +0xe0; the constant in `text/states.ts` is PLAT-13's file, left for its owner to retire) | `listbox.ts` |
| the LISTBOX at creation | set normal: `FUN_00375e20` ends in +0x54 (D:L271242) | `listbox.ts` |
| the LISTBOX's scissor | x 0 .. `DAT_004a44c4` (the frame's width), y from `DAT_003e0378` + the first row's y less a row to the list's y + `YSIZE` (D:L270012); `DAT_003e0378` is the int -3 (0xfffffffd, read in the ELF); the highlight is drawn inside it | `listbox.ts` |
| the LISTBOX arrows' alpha | the focus row's text alpha **as it stood before this draw's rows** (D:L270021-270027 read it before the row's own draw), 128 when the row has no text | `listbox.ts` |
| a `Valve` command with an empty name | the text is the 16-byte buffer at 0x3e03f0: `"0"` (read in the ELF) | `button.ts` |
| the COUNTER at creation | shown -1, clock 0 (`FUN_00381be0` D:L277427-277482) | `counter.ts` |
| the PROGRESSBAR's input | +0x44 is 0x1fe260: `jr ra` with `v0 = 0` (read in the ELF) | `progressBar.ts` |

### 13.3 The node commands' ops (each class's +0x68, the names read from the ELF's strings)

A node command's byte +6 is its op + 0xE8 (`FUN_00274870(0)`). The base text handler (`FUN_0036fcc0`) takes 1 `Caption`
(0x3f9108) and 2 `Valve` (0x3f9210). SLIDERBAR, RADIOSTRIP, COUNTER and WRAPPEDTEXT add theirs after a third slot:
SLIDERBAR 4 `SetValue` (0x3f9260; `FUN_00372870` D:L269383-269430); RADIOSTRIP 4 `Selection` (0x3f9240; `FUN_00371290`
D:L268769-268814; its parse puts `INDEX` in the u16 at +8, `FUN_003711a0` D:L268737-268764); COUNTER 4 `Start`
(0x3f9430), 5 `Finish` (0x3f9348; `FUN_0037b840` D:L274287-274341); WRAPPEDTEXT 4 `Scroll_Up` (0x3f93f0), 5
`Scroll_Down` (0x3f9400; `FUN_00379970` D:L273198-273254). The LISTBOX has no `Caption` or `Valve`: 1 `Finish`, 2
`Highlight_on`, 3 `Highlight_off`, 4 `Has_Items`, 5 `GetItemCount`, 6 `GetFocusIndex`, 7 `SetFocusIndex`, 8 `AddItem`,
9 `RemoveItem`, 10 `GetContents`, 11 `RemoveAllItems` (`FUN_00373640` D:L269831-269925; the strings 0x3f92d8-0x3f9370).
`GetItemCount` and `GetFocusIndex` first set their valve to 0 as TEMP (`FUN_003520d0(v, 0, 2)`), then write the number;
`AddItem`'s `UIVAR` is the name index in the byte at +0x10 (`FUN_00372980` D:L269542-269575).

### 13.4 The slider's travel with the EE's rounding

Under PLAT-13's `EE_FPU_ROUNDING_READING` (each step rounded toward zero), 25 RIGHT presses from the factory's 0.5 leave
0.9999995 and the 26th caps at 1.0; from 1.0, 50 LEFT presses put the knob's left edge on `XPOS` (211 on the audio
page), as the PCSX2 frames of §11.1 show (`widgetsDisc.test.ts`).

### 13.5 PLAT-08's host, and the rows

PLAT-08's table is **a registry each module fills**, not a table the controller edits: `UiCommandHost` takes bodies by
row name (`handlers`, `setHandler`), and a separate `node` hook (`UiNodeCommandHandler`) for commands aimed at a node.
The widget set fills **no table row**: every widget command is a node command, answered by `WidgetSet.nodeCommand`
(a `UiNodeCommandHandler`). The rows that drive widgets from the global table -- 16 `ActivateButton`, 19
`EnableButton`, 20 `DisableButton` -- are MENU-01's (`uiCommands.ts`); they call a control's set active / set enabled,
which `ButtonWidget.setActive` and `setEnabled` are.

### 13.6 The pad record

A widget takes the record PLAT-11 builds (14 bytes by `DIALOG_BUTTONS` code, `FUN_0036a060`'s stick answer). A LISTBOX
binding whose code is past 13 reads past the buttons: `PAD_PAST_BUTTONS_READING` (§12).

### 13.7 The scored items (W9.R8)

- **Per-dialog widget states against PCSX2:** owed to OPT-19. No archive holds a PCSX2 frame of an offline dialog with
  a control lit but the main menu's, whose six buttons carry no `IMAGE` and a `" "` caption (they draw nothing; the
  menu's lit rows are its movie's and scripts', not PLAT-15's). The options pages' manifest rows `options.menu`,
  `options.menu.hdd-row`, `options.menu.video-row` and `options.audio` (`../parity/golden-manifest.json`) hold recomp
  frames only.
- **Recorded, not the bar:** `dlgOptions_Menu` with AUDIO OPTIONS set active and the HDD strip on DISABLED, drawn by
  PLAT-14's drawer, against the recompiled game's frame of that state (`options_explore` `s05_DOWN.png`, 640x448, no
  4:3 correction): **99.5** whole frame (black control 89.0), **99.1** over the widgets' own region (control 75.2);
  the same with VIDEO OPTIONS lit instead scores 95.7 there (`tools/test/widgetScore.test.ts`). The instruction line
  differs (its text is the scripts', PLAT-10).
- **The ACTIVE glow at 5 fps:** owed to OPT-19 (`GLOW_PERIOD_READING` stays open): no 5-fps burst of a focused button
  exists in any archive. The code's curve is unit-pinned at 5-fps samples (`button.test.ts`, and `widgetsDisc.test.ts`
  on `dlgMenu`'s RANGE 0.3 1, TIME 0.8: a 1.6-s cycle).

### 13.8 The review round (2026-10-02)

- **WRAPPEDTEXT's commands, pinned.** `FUN_00379b10` takes byte +6 less (base + 3): 1 is op 4 `Scroll_Up` (the scroll
  +0xcc less one pitch while above 0), 2 is op 5 `Scroll_Down` (plus one pitch while below +0x44 x pitch - `HEIGHT`,
  +0x44 the rows the last draw counted: before any draw it does nothing); any other op falls to `FUN_0036fcc0`
  (D:L273272-273303). Its vtable (0x4079e0, read in the ELF): +0x70 the wrapping setter `FUN_00379f70`, +0x74
  `FUN_00363460` (a `Caption` by id: the string, then +0x70, D:L261048-261080), +0x78 `FUN_00363830` (a format, then
  +0x70), +0xa0 0x37a630 (`jr ra`). So `Caption` and `Valve` re-wrap, and with `AUTOSCROLL` reset the scroll
  (`objects.test.ts`; on the disc `dlgGameLobby` `B_CHATLIST`, `widgetsDisc.test.ts`).
- **WRAPPEDTEXT follows its `UIVAR`** (not in §7): the second vtable at 0x4079e0 + 0x90 (this - 0x98) has
  `FUN_00379260` at +0xa4 (0x407a84), the TEXT's var callback: the value printed (`FUN_003860f0`) into +0x78, hence the
  setter. 41 of the disc's 49 WRAPPEDTEXTs carry a `UIVAR` (the chat lists, the MOTDs, `PLAYER_NAME_AND_TAG`).
- **The pad's non-leaf branch.** `FUN_00377040` with a child list (count at +0, list at +4/+8) hands the record to the
  child whose index equals its third argument, with 0 as the child's, and returns its answer; no press, no binding
  (D:L271933-271941). No BUTTON record has children (PLAT-05: only a RADIOSTRIP's subordinates and a HANDLERBUTTON's one,
  and the strip's +0x44 is its own `FUN_00370f60`): the branch is `ButtonWidget.input`'s `focus`, for PLAT-11's screen.
- **The stick's four edges** are each pinned (`button.test.ts`; `dlgMenu`'s buttons bind all four directions).
- **No IMAGE of the 114 dialogs carries a `PULSE`**: the IMAGE pulse (§3.2) is held by the unit test alone.

*[Connected 2026-10-02 by sprint 9's connecting lines (S9-WIRE; research 115 §16.5): the page's front end makes this
set at each dialog build (`packages/ui/src/screens/dialogParts.ts`), ticks it on the dialog host's A7, hands it the
node commands before the table, reaches the button family's +0x4c from EnableButton / DisableButton, and replaces each
`widget` item of the dialog's draw list with the widget's own items; the widget host is the dialog's scripts and
PLAT-23's cues. The focus (which control gets the pad, ActivateButton) is PLAT-11's.]*
