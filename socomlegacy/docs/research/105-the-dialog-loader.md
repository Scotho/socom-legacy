# 105 -- The dialog loader: how the engine reads a dialog `.rdr`, every widget type's fields, and what the disc's 114 dialogs give (web sprint 7, PLAT-05)

Written 2026-10-01 for PLAT-05 (the block is `../roadmap/01-platform.md` "PLAT-05"). Read-only research. Sources: the
retail decompilation `C:/Projects/socom_pc/game/analysis/socom2_game.elf.decomp.c` (`D:L<n>` = its line; every address
retail), the retail ELF `game/disc/socom2_game.elf` (the key strings each call names, read by address through its
program headers), the disc's `RUN/UI/READERC.ZAR` and `READERX.ZAR` read with `@s2u/archive` (`Zar`, `parseRdr`), the
PC project's archived guest-RAM images under `logs/parity/` and its STATUS log
(`docs/archive/STATUS-log-to-2026-09-26.md`, 2026-09-06). Names, counts and short constants only: no disc bytes, no
decompiled text. It stands on research 96 (the inventory and its pinned tallies), 103 (captions by name) and 104 (the
UI variables). The code is `packages/ui/src/rdrLookup.ts` and `packages/ui/src/dialog.ts`; the CI tests
`packages/ui/test/dialogLoader.test.ts` (one block per reader, transcribed from the lines cited here), the dev-disc test
`tools/test/dialogLoaderDisc.test.ts`.

## 0. Answers

| # | finding | section |
|---|---|---|
| R105.1 | **A dialog is read by search, not by shape.** `FUN_00367430` (D:L263181-263240) reads the file, gives its root to the design reader `FUN_00381550` (D:L277197-277422), frees the tree (`FUN_0032d6e0`, D:L263224) and builds the screen from the design (`FUN_00367950`). Every key is a depth-first, first-match search of the node given (`FUN_0032f0e0`), so the first copy of a key in document order wins, wherever it stands | §1, §2 |
| R105.2 | **`SCREENS` is never looked up** (the string has no reference in the code). The fourteen layouts research 96 §2.3 found `parseUiLayout` throwing on (loose `:end of file` tokens beside `SCREENS`) load like any other: the loader loads all 110 READERC members and READERX's 4 | §2, §4 |
| R105.3 | **The widget factories**: `FUN_00382890` (controls: BUTTON, SCROLLINGTEXT, HANDLERBUTTON, LISTBOX, SLIDERBAR, CHECKBOX, RADIOSTRIP, MAPCONTROL, else the object factory) and `FUN_00382070` (objects: TEXT, IMAGE, TELETYPE, WRAPPEDTEXT, PROGRESSBAR, COUNTER, CLOCK, SECURETEXT). An object factory never makes a BUTTON. A record with no `SPEC`, or a type neither knows, is passed over (`FUN_00383360` D:L278309-278310) | §2, §3 |
| R105.4 | **The tallies hold**: the 103 `dlg*` layouts load to IMAGE 2,057, TEXT 1,291, BUTTON 298, TELETYPE 106, LISTBOX 58, WRAPPEDTEXT 49, MAPCONTROL 36, RADIOSTRIP 18, SLIDERBAR 8, COUNTER 4, SECURETEXT 3, PROGRESSBAR 1; 42 CHECKBOX subordinates; 144 map elements (72 IMAGE, 72 TEXT); 99 backgrounds (90 IMAGE, 9 MPEG) -- research 96 R96.4 exactly; no record dropped, no type unknown; every dialog's counts equal the pin but `dlgDebriefing`'s objects, 49 against 48 | §4 |
| R105.5 | **`dlgDebriefing`'s three-token `NAME ("Extras" "are" "available")`** is an object named `Extras` to the engine (`FUN_0032ee10` takes a list's first string); `parseUiLayout` dropped it | §4 |
| R105.6 | **Keys the engine never reads**, by dialog (§4.2): R1/R2/L1/L2 written as `TRIGGER` in `dlgSecondCinematic`, `dlgAttractCinematic` and `dlgPlayTutMovies` (ParseButtonAnim reads `BUTTON` or `EVENT` only: those four bindings do nothing on the original, so the intro is skipped by thirteen keys less these four -- nine); a UIVAR's `TYPE PERMANENT` (seven: those vars are temporary); a RADIOSTRIP's `VALVE` (four); typos `LONGETIVY`, `APTION`; screen-level `BUTTONS ()`; and keys a type's reader does not read. Each is listed in the dev test's `ENGINE_UNREAD`, and any other unread key fails it | §4.2 |
| R105.7 | **The brief's "screen loader `FUN_0037eab0`" is the LISTBOX constructor** (it reads `NOSELECT`, `PADHOG`, `COLUMNS`, `OPTIONS`, made by `FUN_00382890` for `LISTBOX`, D:L277912-277919). The screen's keys are read by `FUN_00381550` | §2 |
| R105.8 | **The gate's RAM dump is not on disk.** The STATUS log of 2026-09-06 read dlgMenu's parsed tree in a `PS2X_RDRAM_DUMP_AT=...:LoadList#6` image and found 17 design records with `new_game_button` at (256, 330) and `SplashLogo` at (70, 45); the image is not named and none on disk holds a parsed tree. The loader reproduces those 17 names and positions; the archived PCSX2 title image (`title_pcsx2.rdram`) holds `dlgMenu.rdr` and `dlgOptions_Menu.rdr` resident, byte-equal to READERC's members (both tested). The proven level stays PLAT-36's | §5 |

## 1. The lookups (`packages/ui/src/rdrLookup.ts`)

All in the module at 0x32dc80-0x32f300. A dialog node is 8 bytes `{u8 type, u8, u16 count, u32 value}`: 1 int, 2
float, 3 string, 4 list (`tools_py/rdr_tree.py` in the PC tree).

| function | lines | what it does |
|---|---|---|
| `FUN_0032f0e0` / `FUN_0032f0d0` | D:L230255-230299 / D:L230210-230254 | walk the list from an index; a list child is searched first (depth-first) and its hit returned; a string child equal to the key (`FUN_00198f18`, `strcmp`: case-sensitive) returns the node after it (a key at a list's end returns a pointer past it: present, no value) |
| `FUN_0032ee10` | D:L230100-230139 | a string: the found node if a string, else a found list's first element if that is a string; else none |
| `FUN_0032e970` / `FUN_0032ea80` | D:L229877-229926 / D:L229927-229976 | `n` ints / floats, only from a found list of at least `n` elements; an int as it is, a float truncated (ints) or kept, anything else 0; returns whether it read |
| `FUN_0032dc80` / `FUN_0032dd80` / `FUN_0032de80` | D:L229275-229313 / -229370 / D:L229371-229409 | two ints / two floats (a list of more than one) / three floats (more than two: a colour) |
| `FUN_00334d20` | | whether a list holds a list (a button state written as a block) |

`parseRdr` keeps no node types: numbers come back as their spelling. **`TOKEN_TYPE_READING`**: a number read takes a
token that spells a finite number as a number node and any other as a string (0); a string read takes any token. A
typed probe of the 114 dialogs (outside the tree) found no number-typed node under a key the loader reads as a string,
and no number-spelled string under a key it reads as a number -- the number-spelled strings are 32 `CAPTION`s
(`dlgCreateGame`'s `"16"`, `"10"` ...) and 2 `ARGUMENT`s (`"3.5"`, READERX's `dlgExitState`), all read as strings -- so
on the disc the rule reads what the engine reads.

`strcasecmp` (`FUN_00198b80`) is used only where named below: the `BACKGROUND` type, the `LIBRARIES` `UIVAR` word and a
UIVAR's longevity.

## 2. How a dialog loads

- `FUN_00367430` (D:L263181-263240): `FUN_0032f630(name, "data/common/zrdr/dialog", ...)` returns the file's root;
  `FUN_00381550(design, root)`; `FUN_0032d6e0(root)` frees the tree; `FUN_00367950(menu, design)` builds the nodes. So
  nothing reads the tree after the design: a key the design reader does not look up is gone.
- **The design reader `FUN_00381550`**, in order, each on the whole root: `LIBRARY` (a string, D:L277232-277242);
  `LIBRARIES` (each string; `UIVAR` (`strcasecmp`) and the next string is a UI variable looked up when the dialog loads,
  `FUN_003857c0`, whose string value is the library -- unset, the word `UIVAR` itself is added, D:L277270-277303);
  `USES_MEMCARD` (a flag, D:L277307); `FONT` (D:L277309); `NOFONTLIB` (a flag; absent, the font library
  `common/assetlib/font` is loaded, D:L277316-277322 and D:L263496-263503); `BACKGROUND` -> `TYPE` (`IMAGE` 0, `MPEG` 1,
  `MPEG_LOOPING` 2, `strcasecmp`; another word leaves 0) and `FILENAME` (D:L277323-277351); `ANIMATIONS` (each through
  `ParseButtonAnim`, D:L277352-277380); `CONTROLS` and `OBJECTS` through `FUN_00383360` with the two factories
  (D:L277381-277382); `SCRIPT_LIBRARY` (its strings, D:L277383-277419); `MODELS` (`FUN_003812b0`, D:L277420).
- Because every lookup searches the whole file, **`FONT` is the first anywhere**: a dialog with no screen `FONT` before
  its objects takes the first object's. The same holds for `ANIMATIONS`, `CONTROLS`, `OBJECTS`, `MODELS` (on the disc
  every dialog has its screen keys first: no `ANIMATIONS` was found to be a control's).
- **`FUN_00383360`** (D:L278260-278342), per element of the list: `NAME`, `TYPE` (strings), `XPOS`, `YPOS` (ints,
  default 0), `OPACITY` (float, default 1), `SPEC`; the factory is called with the `SPEC` node and the type; a record is
  kept only when there is a `SPEC` and the factory made something; an empty or missing name is `unnamed` (0x3fa408);
  `CHILDOF` (a string) is looked up in the whole record (D:L278331). So a `RADIOSTRIP` with no `CHILDOF` of its own takes
  its first subordinate's (`dlgOptions_Menu`'s `HDDOnOff` is, to the engine, `CHILDOF HDDOnOff`: itself).
- **The node order** (`FUN_00367950` D:L263627-263658): each control, then that control's subordinates (vtable
  +0x1c/+0x20/+0x18), then every object -- `dialogNodeNames`.

### 2.1 Bindings (`ParseButtonAnim` `FUN_00365d50`, D:L262463-262795)

`ANIMATION`, `ARGUMENT`, `STATE` (strings) are read first. If `BUTTON` is present: a button binding, its code by
`FUN_0036a5d0` (D:L264986-265078, `strcmp`): START 0, SELECT 1, RIGHT 2, LEFT 3, UP 4, DOWN 5, TRIANGLE 6, CIRCLE 7,
SQUARE 8, CROSS 9, TRIGGER_R1 10, TRIGGER_R2 11, TRIGGER_L1 12, TRIGGER_L2 13, anything else 0; the state UP 0, FALLING
1, DOWN 2, RISING 3, anything else (or none) 1. Else if `EVENT` is present: an event binding, its code from the chain
D:L262483-262683 (63 names, ONSTART 0 ... MP_IGNORE_LIST_FULL 0x3e; an unknown name is 0, ONSTART's; the table is
`DIALOG_EVENTS`). Else nothing is written: the slot keeps `FUN_003838b0`'s values (a button, code 0x10, state 1, no
animation, no argument; `FUN_003838b0` D:L278439-278463, the values D:L278453-278457). `TRIGGER` is not read here (its one string in the ELF, 0x3fc028, is read
only by `FUN_003aad20`, no dialog reader).

## 3. The widgets, field by field

Defaults are the constructors' (128.0 = 0x43000000 for every colour component). "first" = the first match in the
`SPEC` subtree.

| type | reader | fields (default) |
|---|---|---|
| (base) | `FUN_003832e0` D:L278235-278255 | `UIVAR` -> `FUN_00386ff0` D:L280288-280349: `NAME`, `VALUE` (one element unwrapped), `LONGEVITY` (`strcasecmp`: PERSISTENT 3, PERMANENT 2, TEMPORARY 1; default 1). A UIVAR's `TYPE` is not read |
| TEXT | `FUN_00382070` D:L277613-277656 | base; `CAPTION`; `SCALE` (1.0); `FONT`; `HCENTERED`; `RIGHT_JUSTIFIED` (read after: it clears HCENTERED); `COLOR` (128,128,128) |
| SECURETEXT | `FUN_00382670` D:L277793-277865 (D:L277774-277778) | the same text fields |
| CLOCK | `FUN_0037d3f0` D:L275026-275079 | the same text fields |
| IMAGE | `FUN_00383160` D:L278187-278230 | base; `FILENAME`; `SIZE` (2 ints), then `XSIZE`, `YSIZE` over it (0, 0); `PULSE` (a float, when present) |
| TELETYPE | D:L277667-277698 on `FUN_00382670` | text; `MAXHEIGHT` (int, -1); `PULSERATE`, `SPACING`, `INTERVAL`, `MAXLENGTH` (floats, 0); `NOCURSOR`, `FADECURSOR` |
| WRAPPEDTEXT | D:L277701-277744 | text; `WIDTH` (float 0); `SPACING` (int 10); `HEIGHT` (float -1); `DOWN_ARROW`, `UP_ARROW` (`TEXTURE`, `SIZE`, `OFFSET` inside); `AUTOSCROLL`; `DISPLAY_ONE_LINE` |
| SCROLLINGTEXT | `FUN_00382c70` D:L278025-278126, D:L277891-277900 | as WRAPPEDTEXT, then `DISPLAYABLELINES` (int 0) |
| PROGRESSBAR | `FUN_0037e600` D:L275702-275725 | image; `FILENAME_IS_UIVAR`; `LEADING_EDGE_NODE` |
| COUNTER | `FUN_00381e10` D:L277523-277593 | text; `StartTime` (0); `ValVar`; `EndTime`, or when absent `Duration` into the same field with a flag |
| BUTTON | `FUN_00380620` D:L276723-277103 | base; `XSIZE`, `YSIZE`, then `SIZE` over both; `XOFFSET`, `YOFFSET`, then `OFFSET`; `SCALE` (1.0); `CAPTION`; four states (below); `HCENTERED`; `FONT`; `ANIMATIONS` |
| HANDLERBUTTON | `FUN_00380280` D:L276588-276656 | button; `SUBORDINATE` -> `NAME`, `TYPE`, `XPOS`, `YPOS`, `SPEC` through the control factory (no CHILDOF, opacity 1) |
| SLIDERBAR | D:L277921-277946 | button; `NUM_INTERVALS` (10); `KNOB_TEXTURE`; `KNOB_SIZE` (2 ints); `CENTER_VALUE` (0.5) |
| CHECKBOX | `FUN_0037e2a0` D:L275588-275646 | button; `CHECK_X`, `CHECK_Y`, then `CHECK_OFFSET`; `CHECKSIZE_X`, `CHECKSIZE_Y`, then `CHECK_SIZE`; `CHECK_TEXTURE`; `ONCHECK`, `ONUNCHECK` (each a binding into a fresh slot) |
| RADIOSTRIP | `FUN_0037da50` D:L275264-275367 | button; `SUBORDINATES`, each `NAME`, `TYPE`, `XPOS`, `YPOS`, `SPEC` through the control factory, `CHILDOF` read in its `SPEC` (opacity 1) |
| MAPCONTROL | `FUN_0037d600` D:L275098-275207 | base; `UPPERLEFT`, `LOWERRIGHT` (2 ints); `ELEMENTS` (each `XOFFSET`, `YOFFSET`, `TYPE`, `SPEC` through the object factory; no name); `ANIMATIONS` |
| LISTBOX | `FUN_0037eab0` D:L275893-276585 | image; `SPACING`, `SCALE`, `TOP_MARGIN`, `LEFT_MARGIN` (not cleared before: `LISTBOX_UNSET_READING`); `NOSELECT`, `AUTOSCROLL`, `PADHOG`; `NORMAL`, `PRESSED`, `ACTIVE` (strings); `HIGHLIGHT_OFFSET` (0); the arrows; `ACTIVE_BACKGROUND` (`OFFSET`, `SIZE`, `IMAGE`); `NORMAL_COLOR`, `ACTIVE_COLOR` (and inside its value `RANGE` 2 floats, `TIME`), `PRESSED_COLOR` (128s); `COLUMNS`; `FONT`; `OPTIONS`; `ANIMATIONS`; `SPEED` (60.0); `SEQUENCE_DELAY`, `SEQUENCE_INTERVAL` (0) |

**A button state** (`NORMAL`, `ACTIVE`, `PRESSED`, `DISABLED`; D:L276846-277055). Every state's scale starts at the
button's `SCALE` (D:L276847-276850). If the state's value holds a list (a block): `IMAGE`, `TEXT_COLOR` (3 floats),
`PULSE`, `SCALE`, `TEXT_GLOW` (`RANGE` 2 floats, `TIME`) inside it. Otherwise (flat): the state's own word is its image
(`DISABLED`'s is looked up and not stored, D:L277011), `<STATE>GLOW` (`RANGE` as 2 ints, then floated; `TIME`) and
`<STATE>_COLOR` at the `SPEC`'s level.

**A LISTBOX column** (D:L276085-276214): no `COLUMNS` is one default column. Each column: `POSITION`, `TOP_OFFSET`
(ints); with no `IMAGE` it is text (kind 1; `TIMED_TEXT` 2, `WRAPPED_TEXT` 3), `MAXWIDTH` (1000), `RIGHT_JUSTIFIED`,
`SCALE` (0), its height the listbox's `SPACING`; with `IMAGE` (kind 0) its `SIZE` and `TEXTURES` inside the image's
value. **An option** (D:L276228-276540; the 0x30-byte record of `FUN_0036bdd0` D:L265910-265950): `CAPTION` makes
the option's cells (`FUN_0037b2f0` D:L274070-274138), one per element of its list up to the listbox's column count
(D:L274097-274100), a string element only (D:L274113), none when `CAPTION` is not a list (D:L265937-265940) -- the
loader's `captions`, `caption` their first; a binding from the option's own record (+0x00, D:L276258); a second,
focus binding at +0x10: an event (D:L276274) whose code the chain gives the constant `"ONACTIVATE"` (0x3f9ef8, 2;
D:L276275-276538), `FOCUS_ANIM` and `FOCUS_ARG` its animation and argument (D:L276259-276268), state 1 from the
constructor (D:L265930) -- the loader's `focus`; `USERDATA` (+0x20). On the disc's 29 options every `CAPTION` is a
list of one string and none carries `FOCUS_ANIM` or `FOCUS_ARG` (a probe of the 114 dialogs).

**Positions the engine does not reset.** A MAPCONTROL element's `XOFFSET`/`YOFFSET` (locals D:L275114-275115 read at
D:L275160-275161), a RADIOSTRIP subordinate's `XPOS`/`YPOS` (D:L275285-275286, read at D:L275316-275317) and a
HANDLERBUTTON subordinate's (D:L276603-276604, read at D:L276614-276615) are read into stack locals never set: a read
that fails writes nothing (`FUN_0032e970`), so an element without the key takes the previous element's value, a dropped
element's included (the reads come before its `SPEC`), and the first one's is the stack's prior contents
(**`POSITION_UNSET_READING`**, 0). The disc's 144 elements and 42 subordinates all carry both keys (R105.4), so no
disc value depends on it.

**MODELS** (`FUN_003812b0` D:L277126-277190): `NAME`, `MODEL`, `AZIMUTH`, `ELEV` (0), `DISTANCE` (20.0), `ROTX`,
`ROTY`, `ROTZ`, `USEMODELUIVAR`. **`ROT_FIELD_READING`**: the three rotations are stored to one field (+0x24 of the
0x34-byte entry, D:L277177-277184), so the last read (`ROTZ`) wins; no READERC dialog carries the keys (research 95).

Captions are carried by name (`_507_DevelopedZipper_MSG`) or as written; their text is resolved by the locale service
of research 103 when drawn. `dlgMenu`'s six buttons carry `CAPTION " "` (a single space): their labels are not text.
UIVARs are carried as `{name, value, longevity}`, the shape `UiVarManager` (research 104 §4) takes.

## 4. The disc's dialogs

`tools/test/dialogLoaderDisc.test.ts` (dev disc; skips without `SOCOM_DISC` / `SOCOM_PC_ROOT`).

### 4.1 The counts

All 110 READERC members and READERX's 4 load. (The block says READERX holds 5; research 96 R96.2 counts 4.) No
record is passed over: every `CONTROLS`/`OBJECTS`/`SUBORDINATES`/`ELEMENTS` record has a `SPEC` and a type its factory
makes. The 103 `dlg*` layouts' tallies by site are R96.4's (R105.4). Per dialog, the objects, controls and models equal
the pin's, and the tallies by site equal its `sites` (its `uivar` site aside: that is a UIVAR's `TYPE`, §4.2), except
`dlgDebriefing`, 49 objects against 48 (R105.5).

The seven other members (`Common_AOP_Obj`, `Common_AOP_Stars`, `Common_Brief_Btn`, `Common_Brief_Obj`, `mp_rooms`,
`UiParams`, `uisounds`) load to empty designs: their records stand under no `CONTROLS`, `OBJECTS` or `MODELS` key.
`Common_*` is named by no string in the ELF and by no key the design reader looks up; how (or whether) the includes
enter a dialog was not found -- the `dlg_Brief_*` layouts already hold their own controls (§6).

### 4.2 The keys no reader reads

`unreadKeys` sorts every key of a dialog: read by a lookup; **shadowed** (a doubled key whose first copy in the same
list was read: CAPTION 12, SCALE 6, TYPE 5, FILENAME 2, NOSELECT 2, HCENTERED 1, YOFFSET 1 over the 103 + 4);
**container** (`SCREENS` only); or **unread**. The unread ones, all named in the test's `ENGINE_UNREAD`:

| key | where | why |
|---|---|---|
| `TRIGGER` (R1, R2, L1, L2) | `dlgSecondCinematic`, `dlgAttractCinematic`, `dlgPlayTutMovies`, 4 each | ParseButtonAnim reads `BUTTON` or `EVENT` (D:L262477-262479): the four bindings are empty slots. The keys are `TRIGGER_R1` ... under `BUTTON` (`dlg_Brief_*` spell them so). Research 96 §3.2 counted thirteen keys that skip the intro; the engine binds nine |
| `UIVAR` / `TYPE` (`PERMANENT`) | `dlgClanLadderLobby`, `dlgInvitedPlayers`, `dlgRespondToInvites` (objects), `dlgManageRoster`, `dlgManageRosterLeader` (2 controls each) | `FUN_00386ff0` reads `LONGEVITY` (D:L280329): these seven vars (`CLANNAMEVAR`, `ClanRating`) are made temporary, 1. Research 96's "PERMANENT 7" is these |
| `UIVAR` / `LONGETIVY` | `dlgFriendList`, 3 | misspelt; its word is `TEMPORARY`, the default anyway |
| `APTION` | `dlgGameLobby`, 1 | misspelt `CAPTION`; its value is `" "` |
| `VALVE` | `dlgOptions_Menu` (`HDDOnOff`), `dlgLAN_Options`, `dlgOnlineOptions` (2), all `DISPLAY_MP_TEAM_NAMES` | no widget reader names `VALVE` (its four references are zAnim command readers, `FUN_0036e880`, `FUN_0036fe40`, `FUN_00372f10`, `FUN_003769c0`); the strips' scripts set their valves |
| `NORMAL_COLOR` / `RANGE`, `DISABLED_COLOR` | `dlgCreateGame`, a LISTBOX | a LISTBOX reads `NORMAL_COLOR` as a colour only and has no disabled colour |
| `BUTTONS ()` | `dlgIntroScreen`, `dlgAfterErrorReboot`, `dlgReturnFromNTGUI2`, `dlgReturnFromNTGUI2LAN` (screen level) | no reader names it; empty |
| `SPACING`, `WIDTH`, `AUTOSCROLL` | `dlgLoad` (1, 1), `dlg_equipment_main`, `dlg_equipment_mp`, `dlg_WeapUnlock` (6 SPACING, 1 AUTOSCROLL each) | keys the object's type does not read (a TEXT reads neither; a TELETYPE no AUTOSCROLL) |
| `SCALE` outside `SPEC` | `dlg_WeapUnlock`'s `ActWeaponBtn` | `FUN_00383360` reads only NAME, TYPE, XPOS, YPOS, OPACITY, SPEC, CHILDOF at a record's level |
| `ANIMATION_DEFINITIONS` | READERX's four | the animations' source beside the layout (research 96 §1.1); the design reader does not read it |

## 5. The gate: `dlgMenu` and `dlgOptions_Menu` against a RAM image

The block's proven level is a recomp RAM dump of the live screen read with `tools_py/rdr_tree.py` (PLAT-36). What exists:

- The STATUS log, 2026-09-06 ("Correction to the previous handoff"): RAM dumped "at the moment dlgMenu's CONTROLS list
  loads" (`PS2X_RDRAM_DUMP_AT`, the handoff of 2026-09-13 names the recipe `LoadList#6`) read with `rdr_tree.py`: "the
  parsed tree carries the real values -- `new_game_button` XPOS 256 YPOS 330, `SplashLogo` 70/45 -- the 17 design
  records built from it hold the same numbers". The image's path is not recorded.
- On disk (`logs/parity/`): `menu.rdram`, `menu2-4.rdram`, `menuC.rdram`, `rank.rdram`, `rank27.rdram` (2026-09-07,
  ours), `title_ours.rdram` and `title_pcsx2.rdram` (2026-09-09; the second is PCSX2's, the console's code). Each holds
  READERC.ZAR resident; `dlgMenu.rdr` and `dlgOptions_Menu.rdr` are byte-equal to the disc's members in all of them
  (0x101f4c0 / 0x1050510 in `title_pcsx2`, 0x101bfc0 / 0x104d010 in ours). None holds a parsed tree of either: no string
  node points at their names, as R105.1 predicts (the tree is freed once the design is read). The other copies of the
  names are the dlgMenu zAnim set's name table and its decoded program, not the menu's nodes. `D:/socom_archive/` holds
  no `.rdram`.

So the gate is held at the reading level, by the readers (§2-§3) and by what the log's read recorded: the loader's
`dlgMenu` is the 17 records in the engine's node order (six buttons, `LoadGameBack`, `SplashLogo`, `LEGALEZE`,
`LEGALEZE1`, `VERSION`, `arrow_up`, `arrow_dwn`, `SavedGames`, `SavedGameWarning`, `InfoTextT`, `InfoTextX`; 0 objects,
17 controls) with `new_game_button` at (256, 330) and `SplashLogo` at (70, 45); `dlgOptions_Menu` is 15 nodes (five
buttons and a radio strip with its two checkboxes as controls, seven objects). The PCSX2 image test pins that the
console's resident copies are READERC's. **What would prove it**: a PLAT-36 run dumping at `LoadList` for each screen
(the image named in the run's record), its tree printed with `rdr_tree.py` and compared name for name.

## 6. What is not settled

- Whether the engine loads READERC's or READERX's copy of the four READERX dialogs (research 96 §8): their layouts agree
  and the loader gives both the same records; READERX's carry `ANIMATION_DEFINITIONS` the design reader ignores.
- How `Common_*` enters a dialog, if it does (no reader key, no ELF string; §4.1).
- A widget's draw from these fields (PLAT-13..17), the UIVAR lookup of a `LIBRARIES` entry at load (needs the UI vars,
  research 104), and the MAPCONTROL widget itself (future scope, MENU-16; its reader is named and its fields read here).
- The `VALUE` of a widget UIVAR is kept as its node; the conversion into a var (`FUN_0032f390`) is research 104's.

## 7. Placeholders and readings

| name | stands for | searched / reading | status |
|---|---|---|---|
| `TOKEN_TYPE_READING` (`packages/ui/src/rdrLookup.ts`) | the node type `parseRdr` drops | a number read takes a number-spelled token as a number node, else 0; a string read any token. Exact on the disc's 114 dialogs by a typed probe (§1) | reading |
| `LISTBOX_UNSET_READING` (`packages/ui/src/dialog.ts`) | a LISTBOX's `SPACING`, `SCALE`, `TOP_MARGIN`, `LEFT_MARGIN` when the key is absent | the constructor does not clear +0x24..+0x30 before the reads (D:L275939-275974); the heap's prior contents are not knowable. 0 | reading |
| `POSITION_UNSET_READING` (`packages/ui/src/dialog.ts`) | the first MAPCONTROL element's `XOFFSET`/`YOFFSET`, a RADIOSTRIP's first subordinate's or a HANDLERBUTTON's subordinate's `XPOS`/`YPOS`, when the key is absent | stack locals the engine never sets (D:L275114-275115, D:L275285-275286, D:L276603-276604); a later element without the key keeps the previous one's (copied). The stack's prior contents are not knowable. 0; no disc element lacks the keys | reading |
| `ROT_FIELD_READING` (named in `packages/ui/src/dialog.ts`) | a MODELS entry's rotation | the decompilation stores ROTX, ROTY and ROTZ to one field (D:L277177-277184); the last wins. Could be the decompiler's merge of three stores; no READERC dialog carries the keys | reading |
