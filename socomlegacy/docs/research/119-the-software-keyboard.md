# 119 -- The software keyboard: UiParams.rdr's 12 layouts, GetTextInput, the pad and the USB keyboard, the result (web sprint 9, READ-PLAT-17)

Written 2026-10-02 for web sprint 9 (plan `../plans/2026-10-02-web-sprint-9-screens-widgets.md`, PLAT-17's row and the
owner's default 2; the block is `../roadmap/01-platform.md` "PLAT-17", its "What the original does" and "Unknowns").
Read-only research: no code and no test land with it; the PLAT-17 implementer transcribes it. Sources: the retail
decompilation `C:/Projects/socom_pc/game/analysis/socom2_game.elf.decomp.c` (`D:L<n>` = its line; every address
**retail**, r0001), the retail ELF `game/disc/socom2_game.elf` (strings, three small tables and four instructions read
by address through its program headers), the disc (`SOCOM_DISC`) read with the repository's own readers by probes
outside the repository -- `RUN/UI/READERC.ZAR` -> `UiParams.rdr` and the 110 dialog records (`@s2u/archive` `Zar`,
`parseRdr`), `RUN/UIZANIM.ZAR` (`@s2u/scene` `parseAnimSets`, `decodeUiOp`), `RUN/UI/UISK_TXR.ZED` (texture names
only) -- the SOCOM 1 demo `game/demo_scus_972_05/SCUS_972.05`'s symbol strings (`@unnamed@zui_skb_cpp@`, names only,
used where the retail code agrees), reCOM `research/recom/src/gamez/zInput/zinput.h` (`PAD_BUTTON`, `KEY_STATE`), PC
research 38 (the open routine), 66 (the chat step) and 28 (the lobby taxonomy), and the parity captures named in §9.
**Names and counts only**: no key table is copied out of `UiParams.rdr` beyond the short descriptions below, no
caption text beyond the four the captures show, and no password or credential value from any capture or log.

## 0. Answers

| # | finding | where | section |
|---|---|---|---|
| R119.1 | **`UiParams.rdr` is two keys**: `CommonSoftKeyboardProps` (repeat timing, six sounds, `UsbKbdOnIcon`, `Legend`) and `SoftKeyboards`, **12 layouts in six pairs** -- `KEYBOARD`, `ChatSkb`, `PlayerChatSkb`, `ClanSkb`, `MPPLAYERNAME`, `CREATEPLAYERNAME`, each with a `...2` accent twin. Every grid is **7 rows x 15 cells**; a key spans the cells that repeat its name | `FUN_0038d6a0` D:L283952-283985 (load), `FUN_0038e160` D:L284387-284502 (one layout) | §1, §2 |
| R119.2 | **The keyboard is code-drawn, not a dialog**: one scene root (`AllSkbsRoot`) over the open screen, its bitmaps from `UISK_TXR` by name; while a keyboard is up it takes the pad before the screen does (the screen's input returns early). This answers the block's first unknown | `FUN_003958d0` D:L288961-289031, `FUN_0038dc00` D:L284170-284197, the menu's call D:L263857 | §3 |
| R119.3 | **`GetTextInput`'s arguments** are a 0xAC block of twelve script keys -- `UiVar`, `Purpose`, `SkbName`, `MaxChars`, `MaxBytes`, `UiVar2`, `MaxChars2`, `MaxBytes2`, `MsgPlayerTitle`, `Action2Title`, `NoDQuote`, `AllowEmpty`. The layout is chosen **by name** (`SkbName`, `KEYBOARD` when empty). There is **no initial-text argument** (the keyboard always opens empty: the buffer 0x49ec70 is written by nothing, PC research 38) and **no secure-entry argument**: the keyboard shows a password as typed; only the form's `SECURETEXT` row masks it | `FUN_00395f40` D:L289094-289176, `FUN_0038d770` D:L283990-284046, `FUN_00397640` D:L289863-289923 | §4 |
| R119.4 | **The 30 call sites** on the US disc (`RUN/UIZANIM.ZAR`): name **14 chars / 31 bytes** (`dlgNetPlayerName` `ChoosePersona`, `CREATEPLAYERNAME`, `NoDQuote`), password **12 / 31** (`set_player_password`, `CREATEPLAYERNAME`), chat **63 / 63** (`dlgGameLobby` `do_chat`, `ChatSkb` online, `PlayerChatSkb` from a LAN game), and 27 more (§5's table). **`ClanSkb`/`ClanSkb2` and `KEYBOARD2` are named by no call**; the clan name keyboard is `MPPLAYERNAME` (13 / 31), the clan message keyboard `ChatSkb` (199 / 199) -- the block's second unknown | the decoded blocks, §5 | §5 |
| R119.5 | **A cap is three tests**: the UTF-8 byte length <= `MaxBytes`, the character count <= `MaxChars` (each skipped when < 1), and the text must wrap into the edit's width (`UserStringWidth` px; one line, or two where `UserStringLineHeight` is set). A refused character plays `.NEG` and changes nothing | `FUN_00399ec0` D:L291415-291530, `FUN_00396d40` D:L289553-289608, `FUN_0039a5b0` D:L291706-291785 | §6 |
| R119.6 | **The text is UTF-8** (code points to U+FFFF, 1-3 bytes), NUL-terminated, written into the UI variable `UiVar` as a string node; the accent layouts' `€ Š Ÿ „` are code points in the grid (8364, 352, 376, 8222). `NoDQuote` does not refuse `"`: it **types `'` instead** | `FUN_0039fd80` D:L295105, `FUN_0039f160` D:L294600, `FUN_0039f0c0` D:L294576, D:L291438-291440 | §6 |
| R119.7 | **The pad** (byte = 1 + SOCOM II's button index): D-pad and left stick move the highlight (wrapping, skipping a key's own cells and empty cells), **CROSS** presses the highlighted key, **CIRCLE** is ENTER, **TRIANGLE** cancels, **SQUARE** is backspace, **R1** toggles caps lock, **L1** held is shift, **L2/R2** move the text cursor, **SELECT** swaps the two edits in message mode; START does nothing. D-pad, stick, CROSS, L2 and R2 auto-repeat (0.25 s, then 5/s rising to 15/s over 0.5 s) | `FUN_00394f60` D:L288614-288660, `FUN_0038c990` D:L283439-283497, `FUN_003949c0` D:L288441-288543, `FUN_0036a5d0` D:L264984 | §7 |
| R119.8 | **Normal and accent modes are two layouts**: the `Switch1` key (drawn `äèî` / `abc`) swaps to the layout its `SwitchTargets` names and puts the highlight on that layout's start key. Case is separate: the grid holds capitals, a letter is typed lower case unless (L1 held) XOR (shift) XOR (caps lock); the accent capitals À-Þ (not ×), Š and Ÿ follow the same rule, ß does not change | `FUN_0038be80` D:L283047-283101, `FUN_0038d200` D:L283815-283838, `FUN_0039a8d0` D:L291840-291981, `FUN_00396cb0` D:L289533-289548 | §2, §7 |
| R119.9 | **The result**: ENTER writes `UiVar` (and `UiVar2`), posts `ON_SKB_APPLY` (0xE) -- or `ON_SKB_APPLY2` (0xF) in the Action2 mode -- **with the typed text as the handler animation's argument**, then closes (posting `ON_SKB_CLOSE`, 0x10). An ENTER on an empty or all-blank text (unless `AllowEmpty`), or on an unchanged one (`IgnoreUnchangedString`, set on all 12), is a cancel: `ON_SKB_CANCEL` (0x1D). The valve **`skb_done`** goes 0 at the open and 1 when the close animation ends; 17 of the 30 call sites simply wait on it | `FUN_0038c040` D:L283118-283146, `FUN_00399d20` D:L291348-291396, `FUN_0038b390` D:L282632-282654, `FUN_00394da0` D:L288548-288609, `FUN_00367810` D:L263359 | §8 |
| R119.10 | **The USB keyboard types directly**: every pending USB key is read each frame while a keyboard is up -- letters (shift XOR the USB caps lock), digits and US punctuation with shift, space, Backspace, Left/Right, Enter and keypad Enter (apply), Escape (cancel), Tab (the TEAM/ALL toggle). On a screen without a keyboard, Enter posts **`USBKBD_ENTER`** (0x2C), which only `dlgGameLobby` and `dlgMPBriefingRoom` handle (they open the chat). `UsbKbdOnIcon` is never drawn on the US disc: no layout has a `UsbKbdOn` rectangle and `SKB_USB_Icon.tif` is in no texture archive | `FUN_0038c630` D:L283325-283434, `FUN_002dbd90` D:L180053, `FUN_00368650` D:L264243-264246, `FUN_0038bac0` D:L283009-283017 | §10 |
| R119.11 | **The captures agree**: PCSX2 `A_37_namekbd.png` and the recomp's `04_pw_kbd.png` show `CREATEPLAYERNAME` (normal, lower-case keys, the highlight on `äèî` = `StartGridPos` 1,7); `s11_chat_A/03_name.png` shows `CREATEPLAYERNAME2` (the accent layout, `abc`). The TEAM key the name keyboards draw is art only: their grid cell is `null`, so it can never be highlighted | §9 | §9 |
| R119.12 | **Where earlier notes differ**: PC research 38's "the name keyboard refuses `"`" (it types `'`) and "printable ASCII without the space" (every layout has Space); PC research 66's "the login grid plus one more row" (the chat grid is the same 7 x 15, its bottom row differs); the block's "secure entry" argument (none) | §11 | §11 |

**The level** is the reading level throughout: the decompilation, the ELF, the disc and four captures that agree. What
raises it is PLAT-17's acceptance (each layout opened on PCSX2 or the recomp and scored, typed strings read back).

## 1. `UiParams.rdr`: where it is and what it holds

The game reads `data/common/UiParams.rdr` (the strings at 0x3fadd8/0x3fade8) through its reader, which on the disc is
the member `UiParams.rdr` of `RUN/UI/READERC.ZAR` (110 members, research 96 R96.1). Its root holds two keys:

**`CommonSoftKeyboardProps`** (`FUN_00397070` D:L289706-289839; the globals in brackets):

| key | US value | read as | used by |
|---|---|---|---|
| `RepeatDelay` | 0.25 | s before a held action repeats [0x4a10a0] | §7.3 |
| `RepeatSpeedStart` / `RepeatSpeedEnd` | 5 / 15 | repeats per second at the start / after the ramp [0x4a10b0 / 0x4a10a8] | §7.3 |
| `RepeatAccelTime` | 0.5 | s of the linear ramp [0x4a1098] | §7.3 |
| `ScaleUpSound` | `.SLIDE` | the open sound (`FUN_00395de0(0)`) | §8 |
| `ScaleDownSound` | `.SLIDE` followed by a tab character | the close sound (1); see `SKB_CLOSE_SOUND_READING` | §8 |
| `KeyPressSound` | `.SKB_TYPE` | a key typed, a function key (3) | §7, §8 |
| `KeyPressEnterSound` | `.THUNK` | ENTER applied (4) | §8 |
| `NavigationSound` | `.SKB_NAV` | the highlight moved (2) | §7 |
| `NegativeSound` | `.NEG` | a character refused (5) | §6 |
| `UsbKbdOnIcon` | `SKB_USB_Icon.tif` | the USB icon's texture [0x4a1320] | §10 |
| `Legend` | `Texture` `SkbLegend.tif`, `Size` 170 x 230, `SlideInSec` 0.2, `SlideOutSec` 0.2 | the button legend panel, slid in and out by the LEGEND key | §7.2 |
| `BackgroundsOpacity` | absent (default 1.0) | x 128 on every background piece | -- |

The sound slots, from `FUN_00397bc0` (D:L290055-290094) and `FUN_00395de0` (D:L289054-289089): 0 ScaleUp, 1
ScaleDown, 2 Navigation, 3 KeyPress, 4 KeyPressEnter, 5 Negative.

**`SoftKeyboards`**: a list of 12 records, loaded in file order into the list at 0x49ecf0 (count 0x49ecec). Each record
(`FUN_003963f0` D:L289242-289464, `FUN_0038e160`, `FUN_0038dcb0` D:L284204-284278) may carry `Name`, `Background`,
`ShiftBackground`, `BackgroundPieces`, `ShiftBgPieces`, `TwoEditsBgPieces`, `TwoEditsShiftBgPieces` (at most 10 pieces
a set, D:L290031), `TwoEditsGrowUp`, `StartGridPos`, `SkbPos`, `SkbHeight`, `SkbWidth`, `UserStringWidth`,
`UserStringProps`, `UserStringLineHeight`, `CursorY`, `CursorY2nd`, `CursorSize`, `PurposeStringProps`,
`MsgPlayerStringProps`, the indicator rectangles `CapsLockOn`, `ShiftOn`, `LegendOn`, `UsbKbdOn`, `UsbKbdMode`,
`ScaleUpSec`/`ScaleDownSec` (default 0.25 each; every US layout says 0.2), `SwitchTargets`, `Grid`, `KeyProps` (per key:
`Key`, `Pos`, optional `Size`, `ButtonSpec` with `PRESSED`/`ACTIVE` textures `SkbDepress.tif`/`SkbHighlight.tif` and a
`SIZE`) and the flag `IgnoreUnchangedString`. `StartGridPos` is 1-based (column, row): the activation subtracts one from
each (`FUN_0038b440` D:L282668-282672).

**A grid cell** is parsed by `FUN_0038da70` (D:L284100-284165; the SOCOM 1 demo's `StrToSkbKey`): a one-character
string is that character; `Switch<n>` is "go to `SwitchTargets[n-1]`"; `Quote1`, `Quote2`, `ParenL`, `ParenR`, `Space`
are `'`, `"`, `(`, `)` and a space (the table at 0x3facc0 and the characters at 0x3facd8); the 14 function names at
0x3fac60 are keys 0-13 -- **0 CapsLock, 1 Recip, 2 BackSpace, 3 Clear, 4 Enter, 5 Exit, 6 Apply, 7 Shift, 8 Legend, 9
Dakuten, 10 Handakuten, 11 WideNarrow, 12 MsgPlayer, 13 Action2**; any other word is looked up as a Korean jamo name
(`FUN_00390bb0`) and is the empty key when it is not one (`null` on the US disc). An **integer** cell is the character
with that code point (`34` is `"`; `8364` is `€`). Clear, Apply, Dakuten, Handakuten, WideNarrow and the jamo are on no
US grid.

## 2. The 12 layouts

Every layout's grid is 7 x 15 = 105 cells. "Keys" is the `KeyProps` count, which equals the grid's distinct keys (the
empty key aside). Every layout has **68 character keys plus Space**: the English ones carry the 68 printable ASCII
characters that are neither a space nor a lower-case letter (lower case comes from the case rule, §7.2), the accent ones
31 of those and 37 others (accented capitals in the À-Ü range, Š, Ÿ, ß, €, ¡, ¿, «, », „ and º).

| layout | keys | special keys (cells) | start key | backgrounds | text area | twin |
|---|---|---|---|---|---|---|
| `KEYBOARD` | 77 | CapsLock (4), Shift (2), Recip (2), BackSpace (2), Enter (4), Exit (4), Switch1 (4), Space (11), Legend (2) | (9,5): `M` | `Skbbg_LC.tif` / shift `Skbbg.tif` | one line, 310 px; at (15,200), 460 x 230 | `KEYBOARD2` |
| `KEYBOARD2` | 77 | as `KEYBOARD`, two cells `null` | (9,5) | `SkbEuro_LC.tif` / `SkbEuro.tif` | as `KEYBOARD` | `KEYBOARD` |
| `ChatSkb` | 79 | as `KEYBOARD` but Space (9), **MsgPlayer (1), Action2 (1)** | (1,7): Switch1 | pieces of `SKB_English_Set.tif` (+ shift, two-edit and two-edit shift sets) | two lines, 400 px, line height 26; at (15,207); a second edit grows up 32 px | `ChatSkb2` |
| `ChatSkb2` | 79 | as `ChatSkb`, two cells `null` | (1,7) | pieces of `SKB_Euro_Set.tif` | as `ChatSkb`; at (15,210) | `ChatSkb` |
| `PlayerChatSkb` | 77 | as `KEYBOARD` | (1,7) | pieces of `SKB_English_Set2.tif` (no two-edit sets) | two lines, 400 px; at (15,207); no second edit | `PlayerChatSkb2` |
| `PlayerChatSkb2` | 77 | as `KEYBOARD2` | (1,7) | pieces of `SKB_Euro_Set2.tif` | as `PlayerChatSkb`; at (15,210) | `PlayerChatSkb` |
| `ClanSkb` | 76 | as `KEYBOARD` without Recip (`null`) | (1,7) | pieces of `SKB_English_Set2.tif` (3 + 3 shift; **no two-edit sets**, though `TwoEditsGrowUp` 32 is set -- only `ChatSkb`/`ChatSkb2` carry `TwoEditsBgPieces`/`TwoEditsShiftBgPieces`, 4 each) | as `ChatSkb` | `ClanSkb2` |
| `ClanSkb2` | 76 | as `ClanSkb`, four cells `null` | (1,7) | pieces of `SKB_Euro_Set2.tif` | as `ChatSkb2` | `ClanSkb` |
| `MPPLAYERNAME` | 76 | as `KEYBOARD` without Recip | (1,7) | `Skbbg_LC.tif` / `Skbbg.tif` | one line, **190 px** | `MPPLAYERNAME2` |
| `MPPLAYERNAME2` | 76 | as `MPPLAYERNAME`, four cells `null` | (1,7) | `SkbEuro_LC.tif` / `SkbEuro.tif` | one line, 190 px | `MPPLAYERNAME` |
| `CREATEPLAYERNAME` | 76 | as `KEYBOARD` without Recip | (1,7) | `Skbbg_LC.tif` / `Skbbg.tif` | one line, 310 px | `CREATEPLAYERNAME2` |
| `CREATEPLAYERNAME2` | 76 | as `MPPLAYERNAME2` | (1,7) | `SkbEuro_LC.tif` / `SkbEuro.tif` | one line, 310 px | `CREATEPLAYERNAME` |

- **The rows** (every layout): row 1 the shifted digit row and BackSpace; row 2 the digit row; rows 3-4 the letter rows
  with CapsLock (two rows high) on the left and Enter (two rows high) on the right; row 5 Shift, the bottom letter row
  and Exit; row 6 Switch1, Recip (or `null`), punctuation and Exit; row 7 Switch1, Space and Legend -- `ChatSkb`'s row 7
  ends Space, MsgPlayer, Action2, Legend. Exit and Switch1 are two rows high.
- **The English `Background` is the lower-case art** (`_LC`) and `ShiftBackground` the capitals; the background shown is
  chosen by the case state (§7.2) and, in message mode, the two-edit sets (`FUN_00394520` D:L288279-288353).
- **Indicators**, the same on all 12: `CapsLockOn` at (12,108) 54 x 45, `ShiftOn` (12,155) 69 x 33, `LegendOn`
  (381,190) 69 x 33. No layout has `UsbKbdOn` or `UsbKbdMode`.
- **The two TEAM/ALL images** (`SkbRecipState0.tif`, `SkbRecipState1.tif`, D:L283007) are drawn at the Recip key from the
  valve `ChatRecipient` (`FUN_0038b580` D:L282749-282764). `UISK_TXR.ZED` holds 12 keyboard textures (both English and
  both Euro sets, the four single backgrounds, `SkbHighlight`, `SkbDepress`, `SkbLegend`, `SkbRecipState1`): **not
  `SkbRecipState0.tif` and not `SKB_USB_Icon.tif`**, which no `RUN/UI` texture archive holds.

## 3. Code-drawn, over the screen

- At a front-end load `FUN_0038dea0` (D:L284283-284298) makes the keyboards' scene root `AllSkbsRoot` (`FUN_003958d0`
  D:L288961-289031: the highlight `SkbHighlight.tif`, the background quads, the three edits, the purpose title) and
  binds each layout's textures by name (`FUN_0038bac0` D:L282934-283031). `FUN_0038df40` (D:L284303-284320) unbinds.
- While a keyboard is active (0x49ecd0 non-zero) the screen's input routine hands the pad to `FUN_0038dc00` and returns
  (D:L263857): the screen underneath gets nothing. During the scale animation the input is swallowed too.
- The tick (`FUN_0038d8f0` D:L284051-284097, from the screen's tick D:L262361) runs the auto-repeat, the blink and the
  legend slide (`FUN_003949c0`), and the scale (`FUN_00394da0`): open over `ScaleUpSec`, close over `ScaleDownSec`, the
  keyboard growing from the screen's lower-left corner to `SkbPos` (`FUN_00397950` D:L290002-290050;
  `SKB_SCALE_READING`). At the open's end the keys show; at the close's end the keyboard is hidden, 0x49ecd0 is cleared
  and `skb_done` is set to 1.
- At every open (`FUN_00395540` D:L288846-288937): message mode off, **caps lock, shift and the legend off**, two pending
  USB keys discarded, the purpose line set (`Purpose`, a `UIMnLOC` key such as `_455_EnterPlayerName_MSG`, shown
  "Enter Player Name"). The highlight goes to `StartGridPos`. `ChatRecipient` is not reset.

## 4. `GetTextInput`: the arguments and the open

`GetTextInput` is entry 18 of the 208-row UI command table (0x3dd5e0; handler thunk 0x2808d0 -> `FUN_0038d770`; PC
research 38 table). Its arguments are parsed once per script command into a 0xAC block (`FUN_00395f40`
D:L289094-289176); the compiled block is what `RUN/UIZANIM.ZAR` stores:

| key | block | what it does |
|---|---|---|
| `UiVar` | +0x08, a name index | the UI variable that receives the text; the name `$1` means the running script's argument (`FUN_00397640` D:L289873-289876; the compare, ignoring case, is against `$1` only, the string at 0x3fb788). `INPUT_STRING` (0x3ee898) is that alias for a UI command's argument (D:L121495), not here: a `UiVar=INPUT_STRING` would write a variable of that name (no US call does) |
| `Purpose` | +0x10, 63 chars at most | the title line (a `UIMnLOC` key) |
| `MsgPlayerTitle` / `Action2Title` | +0x50 / +0x54, -1 when absent | the title in message mode / Action2 mode; over 127 bytes it reads "MsgPlayer title too long!" / "Action2 title too long!" (D:L289891-289917) |
| `SkbName` | +0x58, 31 chars at most | the layout, matched by name **ignoring case** (`FUN_00198b80` D:L15553-15600, D:L284016: both bytes through the ctype table at 0x1d08d1, a capital + 0x20) in load order; empty means `KEYBOARD`; the 29 named US calls spell it exactly |
| `UiVar2` | +0x78 | the variable the second edit (the message recipient) writes |
| `MaxBytes` / `MaxChars` | +0x98 / +0x9c | the caps of the main text (§6); 0 or absent: none |
| `MaxBytes2` / `MaxChars2` | +0xa0 / +0xa4 | the caps of the recipient edit |
| `NoDQuote` | +0xa8, a flag | `"` types `'` |
| `AllowEmpty` | +0xa9, a flag | ENTER on an empty or blank text applies instead of cancelling |

**The open** (`FUN_0038d770`): the request is stashed (`FUN_00397640`: the target name at 0x4a1300, the caps at
0x4a10c8-0x4a10e0, the flags at 0x4a0a58/0x4a0a50); the layout is found; if found and no keyboard is up, it is
activated with the empty buffer 0x49ec70 (`FUN_0038b440` D:L282659-282685: the highlight at `StartGridPos`, the edits
emptied and the cursor at 0 (`FUN_00398ea0` D:L290727-290744), the open state, `IgnoreUnchangedString` latched); the
valve `skb_done` is made at PERM and set to 0 -- **to 1 when no layout matched** -- through its watchers; the open sound
plays. The command returns at once: a script that needs the text waits on `skb_done` or handles an event (§8).

## 5. The call sites on the US disc

All 30 `GetTextInput` blocks in `RUN/UIZANIM.ZAR` (a raw scan of the archive finds the same 30). Caps are
chars / bytes; "2" the recipient edit's.

| dialog / animation | `UiVar` | layout | caps | flags | after the keyboard |
|---|---|---|---|---|---|
| `dlgNetPlayerName` / `ChoosePersona` | `PLAYERNAMEVAR` | `CREATEPLAYERNAME` | **14 / 31** | `NoDQuote` | `ON_SKB_APPLY` -> `OnSKBApply` (its `PersonaChanged == 1` branch: `MUISPersonaExists(INPUT_STRING)` ? `GetMuisPersonaInfo` : `SaveAvailable` = 1, `PLAYERPASSWORD`/`PLAYERHOMETOWN` cleared, gender reset; then `UpdateAcctInfo`, `CheckConnectEnable`). `ChoosePersona`'s own `GetMUISPersonaInfo` is its else branch: a persona picked from the list |
| `dlgNetPlayerName` / `set_player_password` | `PLAYERPASSWORD` | `CREATEPLAYERNAME` | **12 / 31** | -- | `ON_SKB_APPLY` -> `OnSKBApply` |
| `dlgNetPlayerName` / `set_player_hometown` | `PLAYERHOMETOWN` | `CREATEPLAYERNAME` | 20 / 63 | `AllowEmpty` | `OnSKBApply` (`NetCensorText`) |
| `dlgLANPlayerName` / `set_player_name` | `LANPLAYERNAMEVAR` | `MPPLAYERNAME` | 14 / 31 | -- | `OnSKBApply` |
| `dlgGameLobby` / `do_chat` (online) | `CHATTEXT` | `ChatSkb` | **63 / 63**, 2: 14 / 31 | `UiVar2` `MsgPlayer_Recipient` | `ON_SKB_APPLY` -> `send_chat` (`SendChatText`); `APPLY2` -> `on_skb_apply_2` |
| `dlgGameLobby` / `do_chat` (from a LAN game) | `CHATTEXT` | `PlayerChatSkb` | 63 / 63 | -- | `send_chat` |
| `dlgMPBriefingRoom` / `do_chat` | `CHATMESSAGE` | `ChatSkb` | 100 / 99, 2: 14 / 31 | `UiVar2` `MsgPlayer_Recipient` | `send_chat` (`SendMediusChat`); `APPLY2`; `ON_SKB_CANCEL` -> `keyboard_closed` |
| `dlgLANBriefingRoom` / `do_chat` | `CHATMESSAGE` | `ChatSkb` | 50 / 63, 2: 14 / 31 | -- | `ON_SKB_APPLY` -> `send_chat`, `ON_SKB_CANCEL` -> `keyboard_closed`; **no `ON_SKB_APPLY2` binding** (its `on_skb_apply_2` animation exists, unbound): Action2 then ENTER posts 0xF to no handler, so `send_chat` does not run and `KeyboardCameBack` is not set |
| `dlgMPBriefingRoom`, `dlgLANBriefingRoom` / `aux_join_game` (x3) | `PlayerGamePassword`, `SpectatorGamePassword` | `MPPLAYERNAME` | 12 / 31 | -- | waits on `KeyboardCameBack` |
| `dlgCreateGame` / `set_game_name` | `GAMENAMEVAR` | `MPPLAYERNAME` | 15 / 63 | -- | waits on `skb_done`; `NetCensorText` |
| `dlgCreateGame` / `toggle_password`, `set_spec_password` | `PlayerGamePassword`, `SpectatorGamePassword` | `MPPLAYERNAME` | 12 / 31 | -- | waits on `skb_done` |
| `dlgCreateClan` / `SetVariable` | `$1` | `MPPLAYERNAME` | 13 / 31 | -- | `ON_SKB_APPLY` -> `enable_create_button` |
| `dlgManageRosterLeader` / `clan_tag` | `Clan_Description` | `MPPLAYERNAME` | 3 / 15 | -- | waits; `NetCensorText` |
| `dlgManageRosterLeader` / `SendClanMessage` | `SEND_CLAN_MESSAGE` | `ChatSkb` | 199 / 199, 2: 14 / 31 | titles 5 / 6 | waits; `ModifyClanMessage(INPUT_STRING)` |
| `dlgInvitedPlayers` / `invite_player` | `PLAYER_INVITE_NAME` | `MPPLAYERNAME` | 14 / 31 | -- | `ON_SKB_APPLY` |
| `dlgFriendList` / `OnAddNewFriendPress` | `PLAYER_FRIEND_NAME` | `MPPLAYERNAME` | 31 / 31 | `NoDQuote`, no `Purpose` | waits; `AddFriend` |
| `dlgIgnoreList` / `OnIgnorePress` | `PLAYER_IGNORE_NAME` | `MPPLAYERNAME` | **none** (0 / 0) | no `Purpose` (the script spells the key `PURPOSE`) | waits; `AddToIgnore` |
| `playerinfo_send_message` in `dlgFriendList`, `dlgLadderLobby`, `dlgManageRoster`, `dlgManageRosterLeader`, `dlgMPBriefingRoom` (x5) | `CHATMESSAGE` | `PlayerChatSkb` | 55 / 55 | -- | waits; `PruneUIVarSpaces`, `SendMediusChat` |
| `dlgFriendList` / `OnFriendListPress` | `CHATTEXT` | `PlayerChatSkb` | 55 / 55 | -- | as above |
| `dlgOnlineOptions` / `SetPlayerDescription` | `PlayerDescription` | `PlayerChatSkb` | 63 / 65 | -- | waits on `skb_done` (`!= 1`); `ON_SKB_APPLY` -> `OnSKBApply` (`SetPlayerDescription`) |
| `dlgSetSop` / `do_chat` | `$1` | `PlayerChatSkb` | 45 / 46 | -- | waits on `skb_done`; `ON_SKB_APPLY` -> `OnSKBApply`; `NetCensorText` |
| `dlgSetTaunts` / `do_chat` | `$1` | `PlayerChatSkb` | 45 / 46 | -- | waits; `NetCensorText` |
| `dlgMenu` / `MissionShortcutSKB` | `MISSION_SHORTCUT` | (none: `KEYBOARD`) | 25 chars | -- | waits on `skb_done`; a development shortcut into a mission (out of scope, R1) |

The 30 by layout: `MPPLAYERNAME` 12, `PlayerChatSkb` 10, `ChatSkb` 4, `CREATEPLAYERNAME` 3, `KEYBOARD` 1. The dialogs
that handle the events: `ON_SKB_APPLY` in 10 dialog records, `ON_SKB_APPLY2` in 4 -- `dlgFriendList`, `dlgGameLobby`,
`dlgManageRosterLeader`, `dlgMPBriefingRoom` (each `on_skb_apply_2` is `CopyUIVar`, `AddToIgnore`), `ON_SKB_CANCEL` in the two briefing rooms, `USBKBD_ENTER` in `dlgGameLobby` and
`dlgMPBriefingRoom` (`do_chat`), `ON_SKB_CLOSE` in none. The PC runtime's open-line log agrees on three of the rows
(`purpose="_455_EnterPlayerName_MSG" skb="CREATEPLAYERNAME" MaxChars=14 MaxBytes=31`, `_604_EnterPassword_MSG` 12 / 31,
`_305_EnterGameName_MSG` `MPPLAYERNAME` 15 / 63; `logs/parity/*/` and `logs/*.log`).

## 6. Typing: the insert, the caps, the encoding

**One character** (`FUN_00399ec0` D:L291415-291530), at the text cursor:

1. `"` becomes `'` when `NoDQuote` is set (D:L291438-291440).
2. The code point is encoded as UTF-8 (`FUN_0039fd80`: 1 byte below 0x80, 2 below 0x800, else 3).
3. The candidate text is the two lines of the main edit joined (or the recipient edit in message mode) with the
   character inserted at the cursor.
4. **Caps** (`FUN_00396d40` D:L289553-289608): when `MaxBytes` (or `MaxBytes2`) > 0 the byte length must not exceed it;
   when `MaxChars` > 0 the count of characters (`FUN_0039f160`: a lead byte below 0xC0 is 1 byte, below 0xE0 2, else 3)
   must not exceed it.
5. **Fit** (`FUN_0039a5b0` D:L291706-291785): the text word-wraps at `UserStringWidth` x the font's scale
   (`FUN_0039ae50`, breaks after a run of spaces) into at most one line -- two when the layout has a
   `UserStringLineHeight` -- and the lines are set on the edits; more lines refuse (`SKB_FIT_READING`).
6. Refused: `.NEG`, the cursor blink restarted, nothing changed. Accepted: the cursor + 1 and `.SKB_TYPE`.

**Backspace** (`FUN_00399c20` D:L291301-291343, `FUN_00398c40` D:L290634-290722) deletes the character before the cursor
and re-lays the text; at the start it deletes nothing; `.SKB_TYPE` plays either way. **Clear** (key 3, on no US grid)
empties the edit. **The text cursor** (`FUN_00399320` right, `FUN_00399530` left, D:L290878-291023) moves one character,
across the two lines, and stops at the ends; no sound. The cursor is a `CursorSize` 5 x 18 bar that blinks at 1 Hz
(shown the first half second, `FUN_003949c0` D:L288479-288486), restarted by every change.

**Storage**: the UI variable `UiVar` is found or added (`CUIVarManager_Add(name, none, 1)`, a temporary if new --
research 104 §4) and set to the joined text as a string (`FUN_003862a0`): UTF-8 bytes and a terminating NUL. `UiVar2`
gets the recipient edit's text, or the empty string. There is no masking anywhere in the keyboard: a password is laid
out as typed (PC research 38 traced it laid out in plain); the login form's PASSWORD row is a `SECURETEXT` object
(research 96 R96.4 counts 3) that shows asterisks (`A_39_pw.png`).

## 7. The keys and the pad

### 7.1 The pad's buttons

The skb's pad record is one state byte per button at **+1 + the button's index** in SOCOM II's own order
(`FUN_0036a5d0` D:L264986-265080 maps the script names: START 0, SELECT 1, RIGHT 2, LEFT 3, UP 4, DOWN 5, TRIANGLE 6,
CIRCLE 7, SQUARE 8, CROSS 9, TRIGGER_R1 10, TRIGGER_R2 11, TRIGGER_L1 12, TRIGGER_L2 13 -- reCOM's `PAD_BUTTON` order),
the state 1 a press and 3 a release (reCOM's `KEY_STATE` FALLING / RISING). The direction table at 0x3fb388 (four
`{stick, button, action}` triples) is what fixes the offset: LEFT at +4, RIGHT +3, UP +5, DOWN +6. `SKB_PAD_BYTES_READING`.

| button | what it does | sound | repeats | lines |
|---|---|---|---|---|
| D-pad, left stick | moves the highlight one key (below) | `.SKB_NAV` | yes | `FUN_00394f60` D:L288626-288658, `FUN_0038c130` D:L283151-283256 |
| CROSS | presses the highlighted key (§7.2); the key shows `PRESSED` while held | per key | yes | `FUN_00394f60` D:L288632-288633, `FUN_0038d200` |
| L2 / R2 | the text cursor left / right | -- | yes | D:L288635-288640, `FUN_00399530` / `FUN_00399320` |
| CIRCLE | ENTER (§8) | §8 | no | `FUN_0038c990` D:L283472-283474 |
| TRIANGLE | cancel: `ON_SKB_CANCEL`, then the close | `.SLIDE`+tab | no | D:L283475-283478 |
| SQUARE | backspace | `.SKB_TYPE` | no | D:L283483-283485 |
| R1 | toggles caps lock | -- | no | D:L283479-283482 |
| L1 | shift while held: the case and the background flip at its press and release | -- | -- | D:L283489-283491, `FUN_00396cb0` |
| SELECT | in message mode, swaps the focus between the message and the recipient edits | -- | no | D:L283486-283488, `FUN_00399100` D:L290799-290810 |
| START | nothing | -- | -- | -- |

One action a frame, in this order: a direction, CROSS, L2, R2 (`FUN_00394f60`), and only when none of those, the rest
(`FUN_0038c990`) and the USB keys. **The move** (`FUN_0038c130`): left/right step the column and wrap within the row,
up/down step the row and wrap over the 7 rows, repeated until the cell holds a key that is neither the empty key nor the
key the highlight started on -- so a wide key is crossed in one step and `null` cells are skipped. **The repeat**
(`FUN_003949c0` D:L288488-288540): an action fires on the press; held, the repeats owed by time `t` past `RepeatDelay`
are `floor(min(t,A) x (S + (E-S)/2 x min(t,A)/A) + E x max(0, t-A)) + 1` (S 5, E 15, A 0.5 s), each tick firing the
difference; any release of a d-pad direction, CROSS, L2 or R2, or the stick centred, stops it.

### 7.2 What a key does (`FUN_0038d200` D:L283759-283850)

| key | effect | sound |
|---|---|---|
| a character | the case rule, then the insert (§6) | §6 |
| `Switch1` | the layout named by `SwitchTargets[0]` replaces this one; its highlight at its start key (`FUN_0038be80`, `FUN_0038b180` D:L282552-282578); the text, caps and shift stay | `.SKB_TYPE` |
| CapsLock | toggles caps lock (the `CapsLockOn` indicator) and re-picks the background | `.SKB_TYPE` |
| Shift | toggles a one-shot shift (`ShiftOn`); **any other key clears it** (`FUN_003947d0` D:L288358-288371) | `.SKB_TYPE` |
| Recip | toggles the valve `ChatRecipient` (the callback 0x38bfe0 sets it at PERM) and the TEAM/ALL image (`FUN_00396220` D:L289181-289203) | `.SKB_TYPE` |
| BackSpace | §6 | `.SKB_TYPE` |
| Enter | ENTER (§8) | §8 |
| Exit | the close, then `ON_SKB_CANCEL` (`FUN_0038c000` D:L283106-283113) | `.SLIDE`+tab, `.SKB_TYPE` |
| Legend | shows or hides the legend panel, sliding over 0.2 s (`FUN_00396300` D:L289208-289235) | `.SKB_TYPE` |
| MsgPlayer | message mode on/off: the title becomes `MsgPlayerTitle`, the recipient edit appears above (`FUN_00399150`, `FUN_00394840` D:L288376-288401) | -- |
| Action2 | Action2 mode on/off: the title becomes `Action2Title`; ENTER then posts `ON_SKB_APPLY2` (`FUN_00399280`, `FUN_00394920` D:L288419-288436) | -- |

**The case rule**: the grid holds capitals; a typed letter A-Z, À-Þ but ×, Š or Ÿ is lowered (+0x20; Š -> š, Ÿ -> ÿ)
and raised again when **(L1 held) XOR (shift) XOR (caps lock)** (`FUN_00396cb0`, `FUN_0039a8d0`); ß and every
non-letter are typed as they are. The background follows the same three-way rule (`FUN_00394520`).

## 8. The result: ENTER, cancel and the close

**ENTER** (CIRCLE, the Enter key, USB Enter or keypad Enter; `FUN_0038c040` D:L283118-283146):

1. It is a **cancel** when the text equals the variable's current string and the layout has `IgnoreUnchangedString`
   (`FUN_003998a0` D:L291097-291145), or when `AllowEmpty` is off and the text is empty or only white space
   (`FUN_003996b0` D:L291028-291074): the close, then `ON_SKB_CANCEL`, `.SKB_TYPE`.
2. Otherwise **apply** (`FUN_00399d20`): `UiVar` and `UiVar2` written (§6); `ON_SKB_APPLY2` (0xF) when Action2 mode is
   on, else `ON_SKB_APPLY` (0xE), posted to the screen with the text; then the close; then `.THUNK`.

**The close** (`FUN_0038b390` D:L282632-282654): the scale-down starts, `ON_SKB_CLOSE` (0x10) is posted, the close sound
plays. When the scale-down ends `skb_done` becomes 1 (D:L288584-288588).

**How the screen hears it** (`FUN_00367810` D:L263359-263395): every entry of the dialog's `ANIMATIONS` list whose
`EVENT` is that event starts its animation, **with the posted text as the animation's argument** (an event with no text
passes the entry's `ARGUMENT`). Inside it the argument is `$1` / `INPUT_STRING` (D:L121495-121498). The event ids come
from `FUN_001f3bf0`'s ladder (D:L50194-50215, D:L50314, D:L50393): `ON_SKB_APPLY` 0xE, `ON_SKB_APPLY2` 0xF,
`ON_SKB_CLOSE` 0x10, `ON_SKB_CANCEL` 0x1D, `USBKBD_ENTER` 0x2C (PC research 11 holds the first three). The order of the
posts: ENTER posts APPLY then CLOSE; TRIANGLE CANCEL then CLOSE; Exit and Escape CLOSE then CANCEL.

**Two ways scripts wait**, both on the disc: `WHILE skb_done == 0 ... END_WHILE` (or `!= 1`) right after the command, then
the variable (17 sites); or an event handler (`OnSKBApply`, `send_chat`, `keyboard_closed`, the briefing rooms' valve
`KeyboardCameBack`).

## 9. The captures

Looked at with the image reader (no frame enters the tree):

| capture | source | layout shown | agrees with |
|---|---|---|---|
| `logs/parity/s4_pcsx2/A_37_namekbd.png` | PCSX2 | `CREATEPLAYERNAME`: "Enter Player Name", empty field, cursor bar, lower-case letter keys, the highlight on `äèî` (bottom left); TEAM drawn on row 6 | §2 start (1,7), the `_LC` art, §3 |
| `logs/parity/s4_pcsx2/A_38_named.png`, `A_39_pw.png` | PCSX2 | none: the CONNECT TO SOCOM II form after each keyboard; the PASSWORD row masked | §6 (the form masks, not the keyboard) |
| `logs/parity/blop_a/04_pw_kbd.png` (and the other `04_pw_kbd.png`, `03_name.png` runs) | recomp | `CREATEPLAYERNAME`: "Enter Player Password", empty, the highlight on `äèî` | the password row of §5 |
| `logs/parity/s11_chat_A/03_name.png` | recomp | **`CREATEPLAYERNAME2`**: the accent grid, the Switch1 key reading `abc`, the highlight on it | the accent twin of §2 |
| `scripts/parity/ref_osk_normal.png`, `ref_osk_accent.png` | crops | the Switch1 key in each mode (`äèî`, `abc`) | §7.2 |

No capture of `ChatSkb`, `PlayerChatSkb` or `MPPLAYERNAME` survives under `logs/parity` or `D:/socom_archive/parity`
(PC research 66's `A_chat_*.png` are gone): those layouts are read, not seen. An interpretation, not a reading: the
"opened in accent mode" of PC research 28 (`s6_ladder_oldharness`) and `s11_chat_A/03_name.png` fits one stray CROSS at
the open -- the start key **is** Switch1 on every layout but `KEYBOARD`, and no code path opens a `...2` layout by itself.

## 10. The USB keyboard and the owner's default 2

**Reading the keys** (`FUN_002dbd90` D:L180053): one USB key a call, its HID usage code, and the modifiers (+4 shift,
+8 control, +0xc alt, +0x14 the caps-lock lamp). `FUN_002dbd40` (D:L180038-180050) says whether a keyboard is connected
(the `UsbKbdOn` icon's visibility, D:L284070-284081: never drawn on the US disc, R119.10).

**With a keyboard up** (`FUN_0038c990` D:L283492-283494 -> `FUN_0038c630` D:L283325-283434), every pending key:

| USB key (HID) | effect |
|---|---|
| A-Z (0x04-0x1D) | the letter, upper case when USB shift XOR the USB caps-lock lamp (the on-screen caps and shift play no part; `FUN_0039ada0` D:L292057-292076) |
| 1-0 (0x1E-0x27) | the digit, or with shift `! @ # $ % ^ & * ( )` (the tables at 0x3fba50 / 0x3fba80) |
| `- = [ ] \ ; ' , . /` and grave (0x2D-0x38) | the US characters, shifted `_ + { } | : " < > ?` and `~` |
| space (0x2C) | a space |
| keypad `/ * - +` (0x54-0x57) | those characters |
| keypad digits and `.` (0x59-0x63) | **nothing**: they need +0x18 of the record, which `FUN_002dbd90` never writes (`SKB_KEYPAD_READING`) |
| Enter (0x28), keypad Enter (0x58) | ENTER (§8) |
| Escape (0x29) | the close, then `ON_SKB_CANCEL` (`FUN_0038be40` D:L283036-283042) |
| Backspace (0x2A) | backspace |
| Tab (0x2B) | the Recip toggle (`ChatRecipient`) |
| Left / Right arrows (0x50 / 0x4F) | the text cursor |
| anything else (Up, Down, Delete, Home, End ...) | nothing |

Every character goes through the same insert (§6): `NoDQuote`, the caps and the fit hold; the highlight does not move;
the typed character need not be on the layout shown (an accent layout up still takes `a` from the USB keyboard), and no
USB key types an accented character.

**Without a keyboard**, the screen's tick takes one USB key a frame and posts `USBKBD_ENTER` for Enter or keypad Enter
(`FUN_00368650` D:L264243-264246); `dlgGameLobby` and `dlgMPBriefingRoom` map it to `do_chat` (the same as R1 there).

**For the owner's default 2** (`PHYSICAL_TYPING_READING`): the original's own path is the table above -- a physical key
types into the open keyboard's field held to the field's caps and fit, ENTER applies as `ON_SKB_APPLY`, Escape cancels,
the on-screen keyboard stays drawn and drivable. A browser's `KeyboardEvent.code` names the same physical keys the HID
codes do; the reading is that mapping, with the US characters above (not the user's own layout) and the case from
Shift XOR CapsLock (`getModifierState('CapsLock')` standing for the lamp). The plan's "and the layout's character set"
is stricter than the original, which only filters by the caps (the 95 printable ASCII characters are on every English
layout anyway).

## 11. Where this differs from earlier notes and from the block

| where | says | the code and the disc |
|---|---|---|
| PC research 38 "the name keyboard additionally refuses `"`" | refused | `NoDQuote` turns `"` into `'` (D:L291438-291440) |
| PC research 38 "the printable ASCII set without the space" (the harness's `OSK_ROWS`) | no space | every layout has Space (11 or 9 cells); the 95 printable ASCII characters are typeable |
| PC research 38 "sets the UI variable `skb_done`" | a UI variable | a **valve** (`FUN_00351ff0(name, 1)`, D:L284031-284043), as the scripts' `WHILE skb_done == 0` tests it |
| PC research 66 "the login grid plus one more row" | 8 rows | the same 7 x 15 grid; row 7's Space is shortened to 9 cells for MsgPlayer and Action2; the extra height is the two-line text area and the second edit (the background pieces) |
| The block's "Name cap 14, password cap 12 (`SkbName=CREATEPLAYERNAME`)" | -- | holds (§5), with the byte caps 31 / 31 |
| The block's "chat `ChatSkb`/`PlayerChatSkb`, 63 characters" | 63 | 63 in the game lobby; 100 chars / 99 bytes in the MP briefing room, 50 / 63 in the LAN one, 55 / 55 for a message to one player (§5) |
| The block's "GetTextInput ... (its arguments: the cap, the layout id, the initial text, secure entry)" (the brief) | four | twelve keys; the layout by name; no initial text; no secure entry (§4) |
| The roadmap's `anon_zui_skb_CSkbKeyProps_SetButtonState` "(D:L282581)" | -- | its body is D:L282583-282590 (a key's button-state call through a member pointer) |

## 12. What is settled, what is not

- **Settled at the reading level**: the file's keys and the 12 layouts (read with the repository's parsers), the cell
  grammar, the open and its arguments, the 30 call sites, the caps, the encoding, the insert, backspace and the cursor,
  the pad table and the repeat, the key effects and the case rule, ENTER, cancel and the close with their events and
  sounds, `skb_done`, the event's argument, the USB table. The pad offsets and `null` cells agree with four captures.
- **Not settled**: the close sound (`SKB_CLOSE_SOUND_READING`); whether the two wrapped lines join with their space
  (`SKB_JOIN_READING`); the fit's pixel widths, which need the font's advances (PLAT-13; `SKB_FIT_READING`); the scale
  animation's exact path (`SKB_SCALE_READING`); the `PRESSED`/`ACTIVE` member pointers' states (0x3e0438-0x3e0478) read
  only as "pressed on CROSS, back on release, active on the highlighted key"; the legend panel's contents (a texture,
  `SkbLegend.tif`); the TEAM/ALL state 0 image, which no archive holds.
- **What settles it**: PLAT-17's acceptance runs -- each layout opened on PCSX2 or the recomp (a `ChatSkb` capture is
  owed: none survives), a close recorded with sound, a two-line chat line typed and read back, a name of wide
  characters typed to the 190 px `MPPLAYERNAME` field.

## 13. Placeholders and readings

PLAT-17's implementation (§14) put the rows marked "in code" into `packages/ui/src/keyboard/` and
`packages/viewer/src/softKeyboardKeys.ts`; the rest stay *note only*, the behaviour transcribed without a constant.

| name | stands for | searched / reading | status |
|---|---|---|---|
| `PHYSICAL_TYPING_READING` | the owner's default 2: a physical key types into the open keyboard | the original's USB path (§10): `KeyboardEvent.code` for the HID usage, the US characters, Shift XOR CapsLock for the case, Enter applies, Escape cancels, Tab toggles TEAM/ALL, Left/Right move the cursor; caps and fit hold. In code: while a keyboard is up the keys the USB table acts on are its queue, the rest (Up / Down, PageUp / PageDown, chords) stay the menus'; no USB key is queued without a keyboard, so `USBKBD_ENTER` is not raised by the page (§14) | in code (`packages/viewer/src/softKeyboardKeys.ts`) |
| `SKB_PAD_BYTES_READING` | the pad record's byte per button | +1 + the button index of `FUN_0036a5d0` (reCOM's `PAD_BUTTON` order), fixed by the direction table at 0x3fb388 (its bytes `01 03 02 02 02 03 03 04 01 04 05 04`, re-read from the ELF); state 1 press, 3 release. Held by PLAT-11's `WidgetPad` record, no constant | *note only* |
| `SKB_CLOSE_SOUND_READING` | the close sound | `ScaleDownSound` is `.SLIDE` and a tab; the sound lookup hashes every byte (`FUN_003a2370`, a CRC-32), so it is not `.SLIDE`'s hash. Reading: silent. The keyboard plays slot 1; PLAT-23's table resolves it to silence (research 122) | *note only* |
| `SKB_JOIN_READING` | how a two-line text is joined at ENTER | `FUN_00399d20` appends line 2 to line 1; the wrap (`FUN_0039ae50`) breaks after a run of spaces. Reading: the space stays at line 1's end, so the join restores the text. Held by `skbWrap` (the lines joined are the text) | *note only* |
| `SKB_FIT_READING` | the width test | `FUN_0039a5b0`: wrap at `UserStringWidth` x the font scale, at most 1 line (2 with `UserStringLineHeight`); the advances are PLAT-13's font's. In code: greedy, broken after a run of spaces; a line with no space too wide does not fit; with no face no width test, one line | in code (`packages/ui/src/keyboard/text.ts`) |
| `SKB_SCALE_READING` | the open/close animation | `FUN_00397950`: position from (-`SkbPos`.x, 448 - `SkbPos`.y) to (0, 0) relative to `SkbPos`, sizes x f, over 0.2 s; read, not timed against a capture. Drawn so by `SoftKeyboard.draw` (the background and pieces only; the keys hidden while it scales) | *note only* |
| `SKB_KEYPAD_READING` | the keypad's digit keys | need +0x18 of the USB record, never written by `FUN_002dbd90`: they type nothing | in code (`packages/ui/src/keyboard/usb.ts`) |
| `SKB_CELL_TOKEN_READING` | a grid cell's integer node | `parseRdr` keeps no types: one character is that character, two or more digits a code point; the US integer cells are 34, 161, 352, 376, 8222, 8364 (a typed probe), none of one digit | in code (`packages/ui/src/keyboard/params.ts`) |
| `SKB_JAMO_READING` | a grid word that is neither a named character nor a function | `FUN_00390bb0`'s jamo table not read; on the US grids every such word is `null`: the empty key | in code (`packages/ui/src/keyboard/params.ts`) |
| `SKB_PIECE_ATLAS_READING` | the piece textures' size | every piece's `Source` lies in 0..512 on both axes and reaches 512: 512 x 512; the textures (`UISK_TXR.ZED`) not decoded | in code (`packages/ui/src/keyboard/params.ts`) |
| `SKB_BLANK_READING` | `FUN_003996b0`'s white space | the ctype table's bit 8 (0x09-0x0D, 0x20); a code point past U+00FF reads past the 256-entry table, unread: not white space | in code (`packages/ui/src/keyboard/text.ts`) |
| `SKB_RECIP_NODES_READING` | when the TEAM/ALL toggle acts | `FUN_0038b8f0` binds the two images for key 1 (`Recip`); the toggle (`FUN_00396220`) needs both: only a layout with a `Recip` key toggles; `FUN_0038b8f0` not read line by line | in code (`packages/ui/src/keyboard/softKeyboard.ts`) |
| `SKB_LEGEND_ORDER_READING` | the legend panel's draw order | it slides from under the keyboard to its right (x from SkbWidth - 170 to SkbWidth); drawn before the background; the scene's order not read | in code (`packages/ui/src/keyboard/softKeyboard.ts`) |
| `SKB_TOUCH_READING` | a tap while a keyboard is up (a browser adaptation) | the key under the tap highlighted, then CROSS one frame; a tap off the keys is lost (as `MENU_TOUCH_READING`) | in code (`packages/ui/src/keyboard/softKeyboard.ts`) |
| `SKB_UIVARS_PLACEHOLDER` | the UI variables the keyboard writes | was: the front end held no `CUIVarManager` its widgets shared (`DialogParts` built the widgets without one), so the keyboard kept its own and the persona form's TEXT / SECURETEXT never read `PLAYERNAMEVAR` / `PLAYERPASSWORD`. The review round (§14) gave `DialogPartsOptions` a `uiVars` and the page's session one manager for the widgets, the popup and the keyboard (`FrontEndSession.uiVars`) | resolved (PLAT-17's review round) |

## 14. The implementation (PLAT-17, web sprint 9)

Written 2026-10-02 by PLAT-17's stream (`agent/s9-chain`), **reading, pending review**: the transcription below is
unit-tested against the decompilation and the disc's files, and none of it is measured running.

- **Where.** `packages/ui/src/keyboard/`: `params.ts` (`UiParams.rdr`: the common props, the 12 layouts, the cell grammar
  `skbCell`), `textInput.ts` (`GetTextInput`'s 0xAC block: every one of the 30 on the disc is 172 bytes; `UiVar` is the
  name at +8, the command's own argument), `text.ts` (UTF-8, the caps, the case rule, blank, the fit), `usb.ts` (the HID
  table; the tables at 0x3fba20 / 0x3fb9f0 / 0x3fba50 / 0x3fba80 re-read from the ELF), `softKeyboard.ts` (the state
  machine and the draw), `frontEnd.ts` (`SoftKeyboardFrontEnd`: row 18 in PLAT-08's registry, the dispatch's step 2,
  A8, the draw over the screen, the events, the valves). `packages/viewer/src/softKeyboardKeys.ts`: the page's keys as
  the USB queue, and `UiParams.rdr` read from `RUN/UI/READERC.ZAR`.
- **The connections.** PLAT-08's table is a registry (S9-WIRE): `GetTextInput` (row 18, id 18) is bound by
  `SoftKeyboardFrontEnd.connect`; no table row is edited. PLAT-11's `MenuInput` gained one field, `softKeyboard`, passed
  to the dispatch as step 2 (`FUN_0038dc00`, which its `MenuDispatchTarget` already declared) and asked first by `tap`.
  A8 is `FrontEndMachine`'s `focusTick` (research 116 §16.3: A8 is the keyboard's). The page's session makes the
  keyboard and `mountFrontEnd` connects the file and the keys (`frontEnd.ts`).
- **The events carry the text.** `ON_SKB_APPLY` / `ON_SKB_APPLY2` start each of the dialog's records of that event with
  the typed text as the animation's argument (`INPUT_STRING` inside it, PLAT-10's `inputString`); `ON_SKB_CLOSE` and
  `ON_SKB_CANCEL` pass each record's own `ARGUMENT`.
- **Read while transcribing (not in §1-§13).** (1) **MENUFADER dims the screen** while a keyboard is up:
  `FUN_0038b440` sets its opacity to 0.5 (`FUN_0036a210(0x3f000000)`, D:L282681), and the close's end sets 0
  (D:L288589). (2) **Any key but Shift clears the one-shot shift**, `Switch1` included (`FUN_0038d200` D:L283840-283845
  calls `FUN_003947d0(0)` after every key): §7.2's "the text, caps and shift stay" holds for the text and caps lock only.
  (3) **The `PRESSED` look is reached by no CROSS press**: a CROSS at state 1 is always action 5 in `FUN_00394f60`, so
  `FUN_0038c990`'s branch that sets it (D:L283454-283461) runs only for a CROSS that is not new; its release (state 3)
  sets the other look. Transcribed as read. (4) **`UiVar2` is written at every apply**, its name empty or not
  (`FUN_00399d20` D:L291377-291383: `Add` of the name at 0x4a0a30, then the recipient's text or ""). (5) **The
  `MsgPlayer` key empties the recipient edit** at each press (D:L290826-290827). (6) **The USB loop does not stop at
  ENTER**: keys after an Enter in the same frame are typed into the closing keyboard (D:L283492-283494). (7) **The
  `Apply` key** (function 6, on no US grid) writes and posts `ON_SKB_APPLY` without closing (D:L283800-283802).
- **Typed strings read back equal** (the acceptance's second half, at the reading level): the key-walk model (walk the
  highlight to each character on the real `CREATEPLAYERNAME` / `MPPLAYERNAME` grids, CROSS, read the variable) types
  the persona name (14 / 31, `NoDQuote`), the password (12 / 31) and CREATE GAME's name (15 / 63) and reads each back
  equal; one character more is refused (`keyboardDisc.test.ts`); the lobby chat holds 63 on `ChatSkb`.
- **The password is not masked by the keyboard** (§6): the keyboard lays it out as typed; the masking is the persona
  form's `SECURETEXT`, PLAT-15's.
- **Owed, the scored items (W9.R8, W9.R12).** The manifest's `online.name-keyboard` (`CREATEPLAYERNAME` over
  `dlgNetPlayerName`, PCSX2 `A_37_namekbd.png`) is owed to PLAT-30's wave-7 run, which also needs the front end's
  textures (`FRONT_END_TEXTURES_PLACEHOLDER`: no bitmap or glyph is drawn on the page yet); `state.chat-keyboard` is
  owed to ONL-32. The other ten layouts have no manifest row: missing rows, owed to PLAT-31 and ONL-32 (the captures of
  §9 cover `CREATEPLAYERNAME` and `CREATEPLAYERNAME2` only).
  > Scored 2026-10-04 by ONL-06 (research 153 §4): `CREATEPLAYERNAME` over `dlgNetPlayerName` is 99.1 against
  > `A_37_namekbd.png` (`tools/test/personaScore.test.ts`). Until then the page loaded no `UISK` bank -- the menu
  > state's own load opens `ui/assetlib/uisk` (`FUN_001f4860` D:L54818-54821) -- and handed the keyboard no caption
  > tables, so it drew its purpose's name alone (86.0); both are the page's since (`frontEndAssets.ts`).
- **Owed, not done here.** The fit's own wrapper `FUN_0039ae50` (`SKB_FIT_READING`); the `CSkbKeyProps` button
  states' member pointers (0x3e0438-0x3e0478); the `UsbKbdOnIcon` (never drawn on the US disc); the keyboard's
  textures (`UISK_TXR.ZED`, the front end's textures).
- **The review round (2026-10-02).** (1) **One UI variable manager** (`SKB_UIVARS_PLACEHOLDER`, resolved): the
  original has one `CUIVarManager` (0x437e80) that the keyboard's apply (`FUN_00399d20`) writes and a TEXT /
  SECURETEXT prints from (`FUN_00379260` D:L272983-273011). `DialogPartsOptions.uiVars` now reaches PLAT-15's widgets
  and PLAT-16's popup context, and the page's `FrontEndSession.uiVars` is handed to both them and the keyboard. Tested
  in `packages/ui/test/keyboard/frontEnd.test.ts`: the name typed on a dialog with the persona form's TEXT
  (`PLAYERNAMEVAR`, cap 14) and SECURETEXT (`PLAYERPASSWORD`, cap 12) is printed in the TEXT, and the password, 13 keys
  typed and 12 kept, shows 12 `*`. The keyboard itself still draws the password as typed (§6). Whether the
  scripts' own reads of the variable (`CheckConnectEnable` on `dlgNetPlayerName`, §5) now see it is not tested here:
  the screens' to show on the real dialog.
  (2) **The page's keys on the grid** (an owner question, not changed): with `PHYSICAL_TYPING_READING`, Enter, Space,
  X, Left / Right and A / D are USB keys while a keyboard is up (the original's USB path: Enter applies, Space and the
  letters type, Left / Right move the text cursor). The page's keys then move the grid's highlight only up and down
  (ArrowUp / ArrowDown; W and S are letters and type), and no key presses a grid key: the grid is driven by the pad and
  by taps. The plan's default 2 says "drivable by pad, keys and touch". Mapping a non-typing key to CROSS would be a
  page choice the original does not make, so the owner decides: keep it, overturn to "on-screen keys only", or name a
  key.
