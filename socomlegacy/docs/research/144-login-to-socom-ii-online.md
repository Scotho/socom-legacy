# 144 -- LOGIN TO SOCOM II ONLINE (`dlgNetLogin`): the NetCnf rows, the list's rows, the walk and the score (ONL-01)

Written 2026-10-03 for ONL-01 (`../roadmap/05-online-front-end.md` "ONL-01"; the online-path plan
`../plans/2026-10-02-online-path-target.md`, OT.R3 the saved configuration on the card and OT.R4 "LOGIN must match the
original: scored"). Sources: the retail decompilation `C:/Projects/socom_pc/game/analysis/socom2_game.elf.decomp.c`
(`D:L<n>` = its line; cited, never pasted); the retail ELF `socom2_game.elf` read by address with `tools/elfImage.ts`
(strings and vtable words); the disc's `RUN/UI/READERC.ZAR` (`dlgNetLogin.rdr`, its layout and `COLUMNS`) and
`RUN/UIZANIM.ZAR` (its set, decoded with ONL-33's chapter reader, research 128 §4.1) through the repository's readers;
the archived captures under `SOCOM_PC_ROOT` (`logs/parity/s4_pcsx2/A_31.png`, `A_06_login.png`, `A_05_online.png`;
`scripts/parity/refs/login.png`; `logs/parity/s17_q2_logoff/online1/00_login.png`), read-only, none copied; the PC
harness `tools_py/parity/online_login_ours.py` L1141-1193 for how the title crop was cut. It stands on research 128
(ONL-33: `OnLoginRoomstart`, `OpenCardOne`, the rows from `NETCNF_DB`, the entry layout at 0x457c40), 136 (ONL-01a: the
configuration on the card, `netCnfCombinationList`, `netCnfRows`), 138 (MENU-01a: ONLINE reaches LOGIN through the
bodies), 115 / 116 / 117 (the screens, the input, the widgets) and does not restate them.

The code: `packages/ui/src/screens/netLoginCommands.ts` (the eight rows), `packages/ui/src/widgets/listbox.ts` (the
items from an array UI variable; the enabled bit), `packages/ui/src/text/captions.ts` and
`packages/ui/src/screens/dialogParts.ts` (the captions by string id), `packages/viewer/src/netLoginHost.ts` (the rows
over the page's card, the first-use write), `packages/viewer/src/frontEndAssets.ts` (the page's texture banks and
caption tables), `packages/viewer/src/frontEnd.ts` (six lines, claimed). The tests: `packages/ui/test/screens/netLoginCommands.test.ts`
(CI), `packages/ui/test/widgets/listboxUiVar.test.ts` (CI), `packages/ui/test/screens/netLoginDisc.test.ts` (dev disc:
the screen, the walk, the slot, LOGIN, TRIANGLE, the error; its rig `netLoginRig.ts`),
`packages/viewer/test/netLoginHost.test.ts` (CI), `packages/viewer/test/frontEndAssets.test.ts` (CI and dev disc),
`tools/test/netLoginScore.test.ts` (dev host: the score). Confidence: **reading, pending review** for every
transcription; the frame is **scored** (§7) but not pixel-exact; §8 lists the placeholders and the readings.

## 0. Answers

| # | finding | where | section |
|---|---|---|---|
| R144.1 | **The eight NetCnf rows are the EE's side of the layer** over eznetcnf's list at 0x457c40 (a 48-byte head -- the count, the default's number 1-based -- then 0x68-byte entries: +0 the flags, +8 the key, +0x28 the name, +0x48 the HARDWARE line): `NetCnfOpen` fills `NETCNF_DB` with one `[i + 1, name, hardware]` row an entry whose flags are not negative, posts `NETCNF_ERROR` with `NETCNF_ERRNO` on a failure; `NetCnfClose` empties it; `NetCnfCurrCombo` puts the default's place among the rows into the valve; `NetCnfSelectCombo` hands the valve's row's key to RPC 2 after the blocking card-change probe; `NetGetInterfaceList` fills the named var; `NetCnfInit` / `Uninit` reach the IOP; `PasswordSecurity` clears `PLAYERPASSWORD` while `SecurePassword` is 0 | `FUN_00277dd0` D:L123170-123237, `FUN_00277d50` D:L123153-123165, `FUN_00277bf0` D:L123100-123148, `FUN_00277ab0` D:L123057-123095, `FUN_00278040` / `FUN_00278020`, `FUN_00277400` -> `FUN_002faf50` D:L198564-198576 | §2 |
| R144.2 | **A LISTBOX whose UI variable is an array follows it as its items** -- the var watcher at +0x80 (vtable 0x4076e0) runs `FUN_003754d0` when attached and on every change: every item removed, one appended per element, a string element a one-cell item, an array element a column item with one cell a column from its sub-elements, each printed as a var prints. This corrects research 117 §13.1 ("not its items"): `COMBOLIST` (2 columns) shows "1 Setting 1", `HWLIST` (3 columns, the first two at x 700) the HARDWARE line, both from `NETCNF_DB` | the ELF at 0x4076e0 (+0xc the thunk 0x37d060 `j 0x3754d0`), `FUN_003754d0` D:L270744-270828, `FUN_0036bbc0` D:L265829-265908, `FUN_0037ae10` D:L273903-274067 | §3 |
| R144.3 | **A LISTBOX keeps the base element's enabled bit** (vtable 0x407670 +0x48 the reader 0x1fe270, +0x4c the writer 0x1fde10, read in the ELF), so ONSTART's `DisableButton(COMBOLIST)` / `(HWLIST)` take the two lists off PLAT-11's focus ring and `ActivateComboList`'s `EnableButton` puts the list back; and an IMAGE or TEXT in `CONTROLS` answers through the same two entries (`CPlainBmp` 0x407950 and the TEXT class 0x407a90). **Corrected 2026-10-03 (FOCUS-RING, research 116 §17):** this row read "enabled on the ring too ... four dead steps -- `MainWindow`, `GreenBackTitle2`, `memcard_back`, `hw_title` -- before LOGIN"; the reader was traced and the constructors were not. The plain bitmap's constructor and the text's set-up clear the bit (D:L278176, D:L273066), so the four are built disabled and passed over: DOWN on EDIT NETWORK CONFIGURATIONS goes to LOGIN at once. Research 116's `RING_ENABLED_READING` is retired there | the ELF; `netLoginDisc.test.ts` | §3, §6 |
| R144.4 | **The walk and the answers**, replayed from the dialog's own ANIMATIONS on the disc: ONSTART ends with LOGIN lit and the help line #569; DOWN lights SELECT NETWORK CONFIGURATION (#582), SELECT MEMORY CARD slot (#575), EDIT NETWORK CONFIGURATIONS (#583); CROSS on SELECT opens the list (`ActivateComboList`), CROSS on its row selects it (`SelectCombo`: `SelectedDifCombo` 1, `SELECTED_COMBO` from `GetFocusIndex`, back to the button), TRIANGLE closes it; RIGHT on the strip checks slot 2 (`OpenCardTwo`: a card with no configuration raises #581 over the dimmed screen, CONTINUE leaves EDIT NETWORK CONFIGURATIONS lit with LOGIN and SELECT disabled); CROSS on LOGIN runs `proceed_net_login` to `dlgNetAuthenticate`; TRIANGLE runs `exit_net_login` to `dlgMenu`; a NETCNF_ERROR with errno 15 raises #585 | `netLoginDisc.test.ts` (7 tests) | §6 |
| R144.5 | **The score (OT.R4)**: against the console's `A_31` with the 4:3 correction **99.8** (black 67.1), the configuration rows alone **99.8** (47.4); against the harness's title crop `refs/login.png` **94.4** (70.8; 35.5 % of its pixels equal); against the recomp's `00_login.png` **94.9** whole (69.9; its list is empty and SELECT MEMORY CARD slot lit, so the state differs) and **99.4** with what differs by state masked (82.6). Pixel-exact (N20) is not reached: 13.5 % of the recomp frame's pixels are equal, the rest a shade off in the glyphs' and quads' edges (PLAT-14's `GS_*` readings) and the lit row's glow phase. The browser frame on port 5340 scores the same to the digit and equals the unit frame in 99.83 % of its pixels | `tools/test/netLoginScore.test.ts`; §7 | §7 |
| R144.6 | **The page drew no captions and no bitmaps** until this task: `readFrontEndDisc` handed `captions: null` (every `_NNN_..._MSG` as written, every `#NNN` caption and popup text blank) and `FRONT_END_TEXTURES_PLACEHOLDER` no bank. Now the four loose `RUN/LOCALE/STATES/*LOC.ZAR` tables and `UILd`, and the banks `UIMP`, `UI2D`, `UIBF` (`RUN/UI/<STEM>_TXR.ZED` + `_PAL.ZED`, the `LIBRARIES` rule of research 95 §5.1) with the text faces' atlases from `RUN/MP2.ZDB`'s `FONT_TXR` (no loose bank holds `font_text_01.tif`), load from the served tree (`UI_TEXTURE_BANKS_READING`); a `Caption` command's string id resolves through the source's `command` (`locTextOf`) | `frontEndAssets.ts`; `captions.ts` | §5 |
| R144.7 | **The write at first use (OT.R3) is slot 1's, at LOGIN's first `NetCnfOpen(mc0:)`**: the page's eznetcnf stand-in writes the `BWNETCNF` folder naming our server before it lists (`ensureNetCnf`, research 136 §4) and never on slot 2, so slot 1 shows "1 Setting 1" / "SCE/Ethernet (Network Adaptor)" as the console shows a saved one and slot 2 shows #581 as a second card without one does (`NETCNF_FIRST_USE_WRITE_ADAPTATION`) | `netLoginHost.ts` | §4 |

## 1. The screen as the original builds it (what research 128 §4.1 and §2.3 settle; this task's reading of the rest)

29 widgets; the `CONTROLS` list in file order is `MainWindow`, `GreenBackTitle2`, `memcard_back` (IMAGEs), `hw_title`
(a TEXT), `login_btn`, `selectBtn`, `MemoryCard` (RADIOSTRIP; `S1`, `S2`, `S0`), `configureBtn`, `COMBOLIST`, `HWLIST`
-- the ring walks it in that order (§3, §6). `COMBOLIST` (0, 35) child of `MainWindow` (25, 175), 590 x 240, `SPACING`
20, `TOP_MARGIN` 18, `LEFT_MARGIN` 45, `COLUMNS` at 0 and 40, `NORMAL` and `ACTIVE` `brown_back.tif`, `HIGHLIGHT_OFFSET`
-7, scale 0.9; `HWLIST` (145, 313), 450 x 5, `NOSELECT`, `SPACING` 25, three columns at 700, 700 and 0, scale 0.9. Both
name the UI variable `NETCNF_DB`. The background is `multplay_back.tif` (512 x 512, UIMP), the panels `backsolid.tif`
and `brown_back.tif`, the four rows 285 x 32 BUTTONs with `brown_back_real.tif` when active, the strip's boxes
`op_checkbox.tif` with `op_check.tif` (35 x 35, the check at +7, +7, 25 x 25). The faces: `font_titlebar_01` for the
title (scale 0.95), `font_text_01` elsewhere (the help line centred at 336, 92; the slot line at 65, 200 scale 0.9; the
HARDWARE label at 62, 312 scale 0.9).

The scripts (research 128 §2.3-2.4, §4.1): `OnLoginRoomstart` (ONSTART) -> `OpenCardOne` (blocking) -> the rows;
`OnLoginactive` / `OnSelectactive` / `MemcardAct` / `OnConfigureactive` (each row's ONACTIVATE: the title #568 or
#570 by `ComeFromLan`, the help line #569 / #582 / #575 / #583); `ActivateComboList`, `UpdateFocus` (`COMBOLIST.op6`,
`HWLIST.op7` on ONFOCUS), `SelectCombo`, `DeactivateComboList`; `OpenCardTwo` (`S2`'s ONCHECK); `proceed_net_login`,
`exit_net_login`, `OnNetCnfError`, `handle_memcard_error`, `WatchForMemcardRemoval`. Every row they name is answered
by a task: PLAT-10's screen rows, PLAT-11's `SuspendMenuInput`, PLAT-23's sounds, MENU-01a's card and variable rows,
and this task's eight (R144.1); `netLoginDisc.test.ts` holds "no row left to a later task" over the whole walk.

## 2. The NetCnf rows (`netLoginCommands.ts`)

Every argument is the command's `names[+8]` (`FUN_0026ed60`), `INPUT_STRING` replaced by the running animation's
first string input (`FUN_00272480(ctx+0x18, 0)`) in the three rows that take a name (D:L123172-123175,
D:L123106-123109, D:L123067-123071). The list at 0x457c40 (`DAT_00457c40`) as the EE walks it: the count at +0, the
default combination's number at +4 (1-based: `ezNetCnfGetDefault` `FUN_001e8890` D:L48718-48737 answers
`head + 0x30 + (default - 1) x 0x68`, the entry, and prints "defaultNumber exceeds listLength" past the count; the
strings at 0x3e1a38, 0x3e1a60), entries of 0x68 bytes from +0x30 (research 128 §2.4: +0 the flags, +8 the key, +0x28
the name, +0x48 the third column). The IOP side -- RPC 1 `ezNetCnfGetCombinationList` (`FUN_001e8740` D:L48672-48691,
the strings at 0x3e19a8), RPC 2 `ezNetCnfGetNetcnfifData` (`FUN_001e8910` D:L48742-48760, 0x3e1aa0) -- is the
`NetCnfIop` interface the page answers from the card (§4).

- **NetCnfOpen** `FUN_00277dd0` (D:L123170-123237): the device into the path buffer 0x3df360 (`strncpy` 0x100,
  D:L123183); an empty list made (`FUN_00333ae0`, `FUN_003339b0(.., 0)`); RPC 1 into 0x457c40. Below 0: the valve
  `NETCNF_ERRNO` (0x3eec80) set to `-result` TEMP (`FUN_003520d0(.., 2)`, D:L123199) and the event `NETCNF_ERROR`
  (0x3eec90) posted into G with its text -- 0x3eebd0 ("...created on another PlayStation 2 console...") for -15, else
  0x3eec40 ("An error occured while reading...") -- D:L123192-123206; the answer stays 0. 0: the answer 1, the list
  empty. Else, over every entry (D:L123208-123227): the name formatted `%s` (0x3eebc8) when `FUN_00199288` answers
  under 0x1f, else `%.32s...` (0x3eebb8), and, when the flags (+0) are not negative, a row `[i + 1 (FUN_00333700, an
  int), the formatted name, the +0x48 string]` (`FUN_00333610`); the answer 1. Either way the list is stored as
  `NETCNF_DB` (0x3eeba8) through `FUN_003857c0(0x437e80, .., 1)` (D:L123234: added temporary, or set). The code:
  `netCnfDbRows` (the same lines ONL-01a's `netCnfRows` transcribed into strings; here the var's typed elements, as the
  list columns print them, §3).
- **NetCnfClose** `FUN_00277d50` (D:L123153-123165): an empty list into `NETCNF_DB`, the path cleared to "" (0x3eead8,
  `strncpy` 0x100); 1.
- **NetCnfCurrCombo** `FUN_00277bf0` (D:L123100-123148): the valve acquired TEMP (`FUN_00351ff0(name, 2)`); the
  default entry (`FUN_001e8890`); over the entries whose flags are not negative, counting their places, the one whose
  key (+8) equals the default's (`strcmp` `FUN_00198f18`, D:L123125): the valve's u16 (+4) set to that place and the
  watchers run (`FUN_003519f0`) when it changed (the event 2 for a change to 0, 1 otherwise, D:L123127-123141); 1.
- **NetCnfSelectCombo** `FUN_00277ab0` (D:L123057-123095): `FUN_003a1370(0x436460, 0, 0)` first -- the card change
  probe of MENU-01a's `MC_Changed` in its blocking mode (D:L123068); a change answers 0
  (`NETCNF_CARD_CHANGED_READING`: never on the virtual card). The valve TEMP; over the valid entries, the one whose
  place equals the valve's u16 (D:L123074-123082): its key to RPC 2 on the path (`FUN_001e8910(0x3df360, key,
  0x4567c0)`, D:L123083): below 0 is 0, else 1; no such entry is 0.
- **NetCnfInit** `FUN_00278040` (D:L123252-123257) and **NetCnfUninit** `FUN_00278020` (D:L123240-123247): one call
  each into `FUN_0030c6e0` / `FUN_0030c6a0`, not followed into the IOP (`NETCNF_IOP_PLACEHOLDER`); 1. The scripts spell
  `NetCnfUnInit`; the dispatcher's key folds it (research 107 §2).
- **NetGetInterfaceList** `FUN_00277970` (0x277970-0x277a8c; no decompiled block, v0 = 1 at 0x277a8c, research 107):
  the named variable takes the interfaces as an array of strings (`NETDEVICE_LIST_READING`); the script only tests it
  (`TestUIVar(NETDEVICE_LIST)`, #574 when empty); 1.
- **PasswordSecurity** `FUN_00277400` -> `FUN_002faf50` (D:L198564-198576): the valve `SecurePassword` (0x3f5c18)
  acquired PERM (`FUN_00351ff0(.., 1)`); while its u16 is 0 the var `PLAYERPASSWORD` (0x3f5c28) is added
  (`FUN_003857c0(.., 0, 1)`) and set to "" (0x3f5ba8, `FUN_003862a0`); 1. (ONL-06's persona form reads it; the row is
  LOGIN's, so it is here.)

The unit test (`netLoginCommands.test.ts`, 15 tests) pins each against a fake IOP; MENU-01a's `menuEntryDisc.test.ts`
still names `NetCnfInit` and `NetGetInterfaceList` as its walk's two "not implemented" outcomes, since its rig does
not register this module (its statement about MENU-01a's own rows stands).

## 3. The list's rows from `NETCNF_DB` (`listbox.ts`), and the enabled bit

**The items (R144.2).** `FUN_00375e20` (D:L271177-271187) adds the LISTBOX's UI variable (`FUN_003857c0`), attaches the
watcher at +0x80 (`FUN_00385df0`) and calls its vtable +0xc with the var at once. The watcher's vtable is 0x4076e0
(set in the constructor `FUN_0037e8b0` D:L275813); read in the ELF, its +0xc is the thunk at 0x37d060 -- the words
0x080dd534 (`j 0x3754d0`) and 0x2484ff80 (`addiu a0, a0, -0x80`) -- into `FUN_003754d0(list, node)`
(D:L270744-270828): for a node of type 4 (an array), `FUN_00375c70` (every item removed), then per element
`FUN_0036bbc0` (D:L265829-265908) -- a type-3 element (a string) makes a text content and `FUN_0036b4b0` sets its
string; a type-4 element with a count makes a column item through `FUN_0037ae10` (D:L273903-274067), which walks the
list's columns (`uStack_350`) and for each takes the element's sub-element at that index: an image column picks the
texture by the sub-element's int, a text column prints the sub-element as a var prints (`FUN_003860f0`,
D:L274128-274131) or, for a nested array, reads its `caption` / colour / selectable keys (0x3f9410, 0x3f9188,
0x3f9418) -- then `FUN_00373f20` appends; with `AUTOSCROLL` (+0xe9) the focus goes to the last item, the top row to 0,
the offset recomputed (D:L270789-270793). Every other node type leaves the items: a string var is still the image's
texture at the draw (`FUN_00373850` D:L269994-270009, research 117 §13.1), which the test keeps. `LISTBOX_ADDED_ITEM_READING`'s
shape (no binding, no focus animation, selectable) is reused for the appended item; the column item's "+0x3c answers
selectable" (D:L265901-265904) was not followed and is taken true.

**The tail of the rebuild (added 2026-10-03, the review's finding 3).** After the items and the AUTOSCROLL,
`FUN_003754d0` does two more things. (a) D:L270794-270805: it walks the item list (+0xc4 / +0xc8) and calls each item's
content (+0x28) through its vtable +0x30 with a running value that starts at the list's +0x160 and the list's +0x164,
and keeps the last answer nowhere; what the content does with it (a measure, a place) was not followed --
`LISTBOX_REBUILD_CONTENT_PASS_READING` (`listbox.ts`): the page lays the rows out at the draw from `SPACING`, so nothing
of it is carried. (b) D:L270808-270822: over the list's bindings (+0x420, 16 bytes each, +0x600 the count), every one
of kind 1 (`EVENT`) whose code byte +0x42d is `'.'` (0x2e: `ON_UPDATE_UIVAR` in `DIALOG_EVENTS`) has its animation
looked up in the script library (`FUN_0026a250(0x414bb0, name, 0)`) and, when found, started -- `FUN_00272bb0(anim, 1,
8, argument, 0)` with an `ARGUMENT`, `FUN_002734b0(anim, 0)` without: the binding's own argument, never the item's
(not `startByRule`). `ListboxWidget.itemsFromUiVar` runs them through `WidgetContext.animation` -- a lookup-and-start by
name, the shape of the library call itself, which `DialogParts` closes over the dialog's scripts so the attach-time fire
-- `FUN_00375e20` D:L271185-271186 calls the watcher at once, and a `VALUE []` is an array -- looks the names up as the
original does, in the scripts as they stand at the build. (ONL-01 first carried this as a `WidgetContext.host` made before
the widgets; ONL-04, research 147 §2, read the same callback as an `animation` function, and the merge of 2026-10-03 kept
that shape: the original reaches the animation through the global library 0x414bb0, not through the screen.) LOGIN's `COMBOLIST` and `HWLIST` carry no such binding, so the walk and the frame are
unchanged; the disc's five that do (`tools/test/onlineDialogs.pinned.json`: `GAMELIST` and `PLAYERLIST` of
`dlgMPBriefingRoom`, `FriendList` and `ConfirmationList` of `dlgFriendList`, `IgnoreList` of `dlgIgnoreList`) are the
lobby's and the friends' screens (ONL-04 on). `listboxUiVar.test.ts` holds it.

So `COMBOLIST`, with two columns, holds the cells `["1", "Setting 1"]` and `HWLIST`, with three, `["1", "Setting 1",
"SCE/Ethernet (Network Adaptor)"]`, its first two cells drawn at x 700 (off the frame) and the third at 0 -- the
HARDWARE line, which the frame shows at the focused row (`HWLIST.op7(SELECTED_COMBO)`; `UpdateFocus` keeps it on the
list's focus). The int cell prints as `printUiVar` prints an int.

**The enabled bit (R144.3).** The LISTBOX's vtable 0x407670 has +0x48 = 0x1fe270 and +0x4c = 0x1fde10 (read in the
ELF): the base element's reader (`lbu` +0x14, bit 7) and writer (bit 7 from the argument, the words 0x90860014
0x30a30001 0x000329c0 0x2403ff7f 0x00c31824 0x00651825 0x03e00008 0xa0830014) -- not the button family's `FUN_00377380`
(0x407790 +0x4c), which also restyles. `ListboxWidget.enabled` and `setEnabled` carry it; `DialogParts.setEnabled`
already reached any widget with the method. The IMAGE class `CPlainBmp` (0x407950) and the TEXT class (0x407a90) have
the same two entries and the base's no-op activate (0x1fe290) and input (0x1fe260): an IMAGE or TEXT listed under
`CONTROLS` is a focus stop that lights nothing (research 116's `RING_ENABLED_READING`, now traced; the doc in
`menuInput.ts` says so).

> Corrected 2026-10-03 (FOCUS-RING, research 116 §17): the entries are as read, but the bit they answer with is
> cleared when an IMAGE or a TEXT is built (the plain bitmap's constructor, D:L278176; the text's set-up `FUN_003792f0`,
> D:L273066), and the LISTBOX's create sets it again (D:L275854). An IMAGE or TEXT under `CONTROLS` is on the ring and
> **disabled**: it is a stop only once a script's `EnableButton` reaches it. The reading is retired.

## 4. The page (`netLoginHost.ts`)

`connectNetLogin(host, { machine, uiVars, libmc })` registers the eight rows over an eznetcnf stand-in: RPC 1 is
ONL-01a's `netCnfCombinationList(libmc, device)` (the card's index and files through PLAT-26a's libmc, research 136
§2); RPC 2 finds the key among that list and keeps its `server` in `selection` for the screens after LOGIN (the DNAS
screen's `InitNetwork` and the connect, ONL-03 / ONL-07, read it as `FrontEndSession.netLogin.selection` -- the
connection `connectNetLogin` answers (`NetLoginConnection`) is held on the session since the review's finding 2, so no
later stream touches the hot file for it; nothing here connects); the interface list is the
one adaptor the card's index names (`NET_ADAPTOR_NAME`, `vendor/product` of `NETCNF_ATTACH_CONTENTS_READING`). A
device that is no card (`host:`) is a read failure (-1, `NETCNF_MALFORMED_RESULT_PLACEHOLDER`'s value: #586), never a
throw. The libmc is the one MENU-01a's `connectMenuCommands` makes, now answered to `frontEnd.ts` and handed on.

**The write at first use (R144.7).** `combinationList('mc0:')` runs `ensureNetCnf(libmc, 0, server)` before reading:
a slot 1 without the index gets the folder (research 136 §4), one with it is read and not rewritten; the result is
logged when it fails. Slot 2 is never written: on the console a second card holds what its owner saved on it, and
LOGIN's `OpenCardTwo` shows #581 for one without a configuration -- which is what the page shows. The server is
`SHARED_SERVER` (`online.ts`, the shared match server) unless the caller names one; the page names none yet (a local
server for a dev run is the DNAS / connect tasks' to pass). Nothing is drawn for the write (research 136 §4).

## 5. The page's bitmaps and captions (`frontEndAssets.ts`, `captions.ts`)

**Banks (`UI_TEXTURE_BANKS_READING`).** `pageUiTextures(source, stems, fontMap)` loads each stem's loose pair
`RUN/UI/<STEM4>_TXR.ZED` + `_PAL.ZED` (the `LIBRARIES` rule `FUN_003199c0`, research 95 §5.1) and the font bank
`FONT_TXR.ZED` / `FONT_PAL.ZED` from a map archive (`RUN/MP2.ZDB`; `armoryData.ts` reads the ARMORY's from the map's
and calls the copies byte-equal), decodes a name on demand against the bank's own palettes (`decodeNamedTextures`),
flips it top row first (`flipRows`) and caches it; the lookup answers from the banks in so far, the first holding the
name. The stems: `UIMP` (LOGIN and the online dialogs), `UI2D` (the boot dialogs), `UIBF` (`dlgMenu`), from the
`LIBRARIES` scan of READERC (63 dialogs name `ui2d`, 34 `uimp`, 22 `uibf`). A dialog with another stem still draws its
font glyphs and whatever UIMP / UI2D / UIBF hold; its own bank is not loaded (the briefings' `bf51`.., the maps'
`mm51`..: out of the path). The bitmaps' names: `multplay_back.tif`, `brown_back.tif`, `brown_back_real.tif`,
`backsolid.tif`, `op_checkbox.tif`, `op_check.tif`, `popupOp.tif`, `font_titlebar_01.tif` are UIMP's;
`font_text_01.tif` and `font_special_01.tif` only a map's `FONT_TXR` (every loose `RUN/UI/*_TXR.ZED` scanned).

A browser adaptation in its timing: the banks arrive asynchronously, so a dialog's first frames can draw without a
bitmap and the drawer fills it on a later tick (the page draws every tick); the original has every bank in memory at
the build. `FRONT_END_TEXTURES_PLACEHOLDER` (PLAT-10's, `frontEndMachine.ts`) is retired (2026-10-03, the review's
finding 1): the page hands the banks through the session's `textures` option (`frontEnd.ts`), and `frontEnd.test.ts`
now tests that a quad naming a given bitmap draws and one naming none is undrawn; research 115 §15's row says retired,
and `frontEnd.ts`'s header no longer says "draw bitmaps and glyphs" is not done.

**Captions.** `readFrontEndDisc` now reads PLAT-04's tables (`pageCaptions`: `loadLocService` over the four loose
`RUN/LOCALE/STATES/*LOC.ZAR` and `UILd` from `RUN/MP2.ZDB`; a table that will not read is a line in `missing`, none
a null source). The widgets and the popup resolve a `Caption` command's string id (`#569`: the s16 at +0xc,
`FUN_0036fcc0` D:L268063-268070) through `locText`, which the page never passed: `CaptionSource` gains the optional
`command(cmd)` `LocService` already has, and `locTextOf(captions)` is the default `locText` in `DialogPartsHost` (the
widgets' and the popup's context). So the title bar, the help line, the slot line and the popups' texts draw on the
page; without a source they stay blank as before.

## 6. The walk and the answers over the disc (`netLoginDisc.test.ts`)

The rig (`netLoginRig.ts`) is MENU-01a's `menuEntryDisc.test.ts` rig with PLAT-11's pad fed from a test's snapshot
(`press(name)`: one frame down, one up, two idle), the SOUND command through PLAT-23's cues, both card ports inserted
and formatted (`MenuCardIo`), a fake IOP (one combination on `mc0:`, none on `mc1:`: the page's card after R144.7) and
PLAT-04's tables. `SETTLED` = 93 ticks (3.1 s: `SuspendMenuInput(3.0)`, ONSTART's 2-s WAIT, `OpenCardOne`'s wait on
`NetCnfIsInited`).

| step | what the scripts do (the set, research 128) | what is held |
|---|---|---|
| ONSTART | `OnLoginRoomstart` -> `OpenCardOne`: `MC_ChPort(0)`, inserted and formatted, `Slot_title` #559, `NetCnfClose`, `NetCnfOpen(mc0:)`, `TestUIVar(netcnf_db)` true, `NetCnfCurrCombo(SELECTED_COMBO)`, `COMBOLIST.op7`, `HWLIST.op7`, help #579, `PasswordSecurity`, `.DINK`, SELECT enabled, LOGIN active and enabled; `has_memcard_changed` | no "not implemented" outcome; `NETCNF_DB` one row; both lists one item, focus 0, `HWLIST` `NOSELECT`; LOGIN focused; the strip on slot 1; `.DINK` played; #572 never drawn (raised and killed in one step, research 128 R128.4) |
| DOWN x3 | `OnSelectactive` #582, `MemcardAct` #575, `OnConfigureactive` #583 (each stops the removal watch) | the focus and the help line's text, pinned: "Login to SOCOM II to play online.", "Select your NETWORK CONFIGURATION from the list.", "Select which MEMORY CARD slot to access.", "Edit your NETWORK CONFIGURATIONS." (UIMn 569, 582, 575, 583; the title "LOGIN TO SOCOM II ONLINE" #568, the slot line "MEMORY CARD slot 1" #559) |
| DOWN | the lists skipped (disabled by ONSTART), and `MainWindow`, `GreenBackTitle2`, `memcard_back`, `hw_title` skipped (built disabled: research 116 §17, correcting R144.3's four dead steps of 2026-10-03): LOGIN at once | the ring's order and the four bits; UP from LOGIN back to EDIT NETWORK CONFIGURATIONS |
| SELECT, CROSS | `ActivateComboList`: the list enabled and active | focus `COMBOLIST`, state active; DOWN on one row no move |
| CROSS on the row | `SelectCombo`: `SelectedDifCombo` 1, `COMBOLIST.op6(SELECTED_COMBO)`, `DeactivateComboList` | `SELECTED_COMBO` 0; focus back on SELECT, the list disabled; TRIANGLE on the list the same way |
| strip, RIGHT | `S2` checked -> `OpenCardTwo`: `MC_ChPort(1)`, `NetCnfOpen(mc1:)` empty, the fader to 0.7, #581 `buttons #226 -> SitHere`, CONTINUE: LOGIN and SELECT disabled, EDIT NETWORK CONFIGURATIONS active | the popup shown then gone; `MemcardOpen` 2; `NETCNF_DB` empty; LEFT back to slot 1 lists `mc0:` again and lights LOGIN |
| LOGIN, CROSS | `proceed_net_login`: `.DINK`, the popup (a literal, `keep`), WAIT 0.1, `NetCnfSelectCombo` true, `NetCnfUnInit`, `RebootIOP(MULTIPLAYER)`, `SWITCHMENU(INPUT_STRING)` = `dlgNetAuthenticate.rdr`, `net_config_is_init` 0 | the switch within 2 s; RPC 2 with `Combination1`; no "not implemented" on LOGIN |
| TRIANGLE | `exit_net_login`: `.DINK`, `NetCnfUnInit`, `RebootIOP(MAINMENU)`, `SWITCHMENU(dlgMenu.rdr)` | the switch |
| an IOP failure -15 | `OnNetCnfError`: #585, LOGIN and SELECT disabled, EDIT active | the event, `NETCNF_ERRNO` 15, the popup, the focus |

**The no-configuration popup (A_05, #578 / #581)** shows only where the original shows it: a slot whose card holds
no index (slot 2 here; slot 1 only if the first-use write failed, e.g. a full card -- `ensureNetCnf`'s FullDevice,
logged). The card-slot popup (A_30) is `UIMemCardAnim.rdr`'s `choose_memcard_slot` on the boot path's `intro_onstart`
(research 128 R128.3), not LOGIN's: ONLINE from the main menu with the configuration loaded reaches LOGIN with none.
**Owed to OPT-05i's merge** (chain C): that popup's animations, should a state reach `intro_onstart` with two cards and
no loaded configuration (the return from EDIT NETWORK CONFIGURATIONS, `dlgReturnFromNTGUI2`, which ONL-02 does not
reach under OT.R3); nothing of it is built here.

## 7. The score (OT.R4)

`tools/test/netLoginScore.test.ts` draws the settled screen (the rig of §6 with the disc's faces, PLAT-04's tables
and the UIMP bank) through PLAT-14's drawer and scores it with PLAT-30's scorer (`captureScore.ts`): every bitmap
and glyph drawn (`undrawn` is the 3D pass alone).

| reference | what of it | our frame | score | mad | block | black | matched | pixel-exact |
|---|---|---|---|---|---|---|---|---|
| `logs/parity/s4_pcsx2/A_31.png` (PCSX2, 640 x 480: LOGIN lit, "1 Setting 1", the HARDWARE line) | the whole frame, the 4:3 correction (W7.R7, KNOWN [online-7pct]) | as drawn | **99.8** | 0.0041 | 0 | 67.1 | yes | -- (another renderer's capture) |
| the same | the configuration rows alone (`MainWindow`'s band [25, 210, 615, 332], the rest masked) | as drawn | **99.8** | 0.005 | 0 | 47.4 | yes | -- |
| `scripts/parity/refs/login.png` (the harness's title crop, 245 x 24: our recomp) | cut as the harness cuts it: the frame grey, 320 x 224 bicubic, the box [5, 8, 250, 32] of `refs.json` (`online_login_ours.py` L1147) | the same cut | **94.4** | 0.0831 | 0.0286 | 70.8 | yes | 35.5 % equal |
| `logs/parity/s17_q2_logoff/online1/00_login.png` (the recomp, 640 x 448: the empty list, SELECT MEMORY CARD slot lit -- the `online.login.no-config` row's frame) | the whole frame | as drawn | 94.9 | 0.0269 | 0.075 | 69.9 | yes | 13.5 % equal |
| the same | the rest: the help line, the four rows' lit states and the rows band masked (`LOGIN_STATE_BANDS`) | as drawn | **99.4** | 0.012 | 0 | 82.6 | yes | -- |
| `logs/parity/s4_pcsx2/A_06_login.png` (PCSX2, 640 x 480: the `online.login.no-config` row -- slot 1 with no configuration, the list empty under "MEMORY CARD slot 1", EDIT NETWORK CONFIGURATIONS lit, #583's help line) | the whole frame, the 4:3 correction | the rig with `mc0:` empty: `OpenCardOne` raises #581, CONTINUE (added 2026-10-03, sprint 11's close; 98.1, mad 0.0086, block 0.0286 until FOCUS-RING the same day: the frame had no title, because LOGIN's ONACTIVATE never ran while the build's focus rested on `MainWindow` -- research 116 §17.5) | **99.8** | 0.0032 | 0 | 67.7 | yes | -- |
| the same | the configuration rows alone (`LOGIN_ROWS_BAND`) | the same | **99.8** | 0.0037 | 0 | 48.1 | yes | -- |
| the browser frame (`?devmode&menuflow=dlgNetLogin.rdr` on port 5340, the canvas's pixels after 9 s; three runs of 2026-10-03) | against the unit frame above | -- | 100.0 | 0 | 0 | 66.6 | yes | 100 % / 99.83 % / 99.79 % equal |

The browser frame is the unit frame up to the lit row's glow phase (the `ACTIVE` `TEXT_GLOW` cycles at 0.5 s), and
the captures differ by the moment they land in it: of the fix round's two captures (9 s and 9.25 s) one equals the unit
frame pixel for pixel and the other in 99.83 % of its pixels, and both score every reference above to the digit
(99.8 / 99.8 / 94.4 with 35.46 % / 94.9 / 99.4 / 13.52 %; since BOOT-06 sent the glyph's colour words as packed bytes, 2026-10-03, research 141 §2, the two pixel-exact fractions read 35.90 % and 13.54 %, every score the same); the review's own capture (9 s, another phase) scored the
recomp's whole frame 95.1 (block 0.0714) and equalled the unit frame in 99.79 %. So the whole-frame score against the
recomp moves by up to 0.2 with the phase; the console's two, the title crop and the masked rest do not. The run's
script and the frames stay in the implementer's scratch folder; nothing of it is in the tree.

**Why not pixel-exact (N20).** Against the recomp's frame the shapes land on the same pixels (block 0 outside the
state bands, mad 0.012) but the shades differ in the glyphs' and quads' edges: the drawer's bilinear sample at integer
centres, its MODULATE and its (Cs - Cd) x As + Cd blend are PLAT-14's readings (`GS_SPRITE_COVERAGE_READING`,
`UI_TEXTURE_FILTER_READING`, `GS_MODULATE_BLEND_READING`, research 112 §9), not a GS trace; and the lit row's glow phase
is the frame's. What would raise it is PLAT-14's, not this screen's: a GS-level comparison of one textured quad. The
console's `A_31` is a PCSX2 window with the 4:3 letterbox and its own filtering; 99.8 after the correction is as close
as the scorer tells (its black control 67.1: the match is the frame's content, not its darkness). `netcfg1/01_after_continue.png`
and `netcfg2/01_2_DOWN.png` were not used (OT.R4).

**The golden manifest.** The `online.login` row keeps its two captures (`A_31`, the title crop) and gains a note
naming this test and which capture scores which region; the recomp's frame it also uses is the `online.login.no-config`
row's. No capture is added or copied.

## 8. Placeholders and readings

| name | stands for | searched / reading | status |
|---|---|---|---|
| `NETDEVICE_LIST_READING` (`ui/src/screens/netLoginCommands.ts`) | what `NetGetInterfaceList` writes into the named var | its body is not decompiled (0x277970-0x277a8c); the script only tests the var; taken as an array of the interface names, one here (the adaptor the configuration names) | open: the disassembly of 0x277970, or a trace of `NETDEVICE_LIST` on the console |
| `NETCNF_IOP_PLACEHOLDER` | what `NetCnfInit` / `NetCnfUninit` do on the IOP (`FUN_0030c6e0`, `FUN_0030c6a0`) | not followed into the IOP; the browser has none; hooks | open: a read of the two bodies (the eznetcnf module's load and release, likely nothing the page needs) |
| `NETCNF_CARD_CHANGED_READING` | the blocking card probe `NetCnfSelectCombo` opens with (D:L123068) | the virtual card's GetInfo never answers -1 / -2; the hook `cardChanged` stands for it, never set | open: PLAT-26's libmc should it model a pulled card |
| `NETCNF_DEFAULT_INDEX_READING` | the head's default combination number eznetcnf fills (+4) | 1 with an entry, 0 without -- the recomp's stand-in (`eznetcnf.cpp:16`); the module not decompiled; one combination is ever written | open: `EZNETCNF.IRX`'s `getCombinationList` |
| `UI_TEXTURE_BANKS_READING` (`viewer/src/frontEndAssets.ts`) | which banks a front-end dialog's bitmaps resolve through | the `LIBRARIES` stem's loose `RUN/UI/<STEM4>_TXR.ZED` and a map's `FONT_TXR` (where each name was found; the ARMORY's loader) | open: the build's texture lookup `FUN_0036a230`'s search order |
| `NETCNF_FIRST_USE_WRITE_ADAPTATION` (`viewer/src/netLoginHost.ts`) | where OT.R3's write happens (slot 1, LOGIN's first `NetCnfOpen(mc0:)`) | a browser adaptation with no original (the console's card holds what Sony's program wrote); named, not a ledger suffix | -- |
| `LOGIN_CONNECT_HOLD_SECONDS_PLACEHOLDER` (`ui/src/screens/netLoginCommands.ts`; added 2026-10-04, §10) | **the owner's pacing, OT.R20**: how long LOGIN's connect (the popup between CROSS and the DNAS screen) stands -- 3 s (90 ticks, `LOGIN_CONNECT_HOLD_TICKS`) | the original's own stage, timed on the one run of it on record, is about 1.3 s, shorter than the ruling's 3 s, which therefore stands (§10) | the owner's word |
| `LISTBOX_REBUILD_CONTENT_PASS_READING` (`ui/src/widgets/listbox.ts`; added 2026-10-03, §3) | what `FUN_003754d0`'s pass over the rebuilt items' contents does (each content's vtable +0x30 from the list's +0x160 with +0x164, D:L270794-270805, the answer dropped) | not followed into the content classes; the page lays the rows out at the draw from `SPACING` | open: the content's +0x30 (the text content class of `FUN_0036b4b0`'s items) |

Reused, not added: research 136's five (the card's files, the columns, the flags, the empty list, the malformed
result), research 138's `IOP_REBOOT_PLACEHOLDER` (`RebootIOP(MULTIPLAYER)` on LOGIN's way out), research 117's
`LISTBOX_ADDED_ITEM_READING` (the appended item's shape), research 116's `RING_ENABLED_READING` (retired 2026-10-03, research 116 §17),
research 112's three drawer readings (§7). Retired here: `FRONT_END_TEXTURES_PLACEHOLDER` (research 115 §15's row; §5).

## 9. Settled, not settled, owed

- **Settled (reading, pending review):** the eight rows (§2); the list's items from an array var and the enabled bit
  (§3; research 117 §13.1's "not its items" corrected, research 116's ring reading traced); the walk and every answer
  of §6 on the disc; the page's banks and captions (§5); the first-use write on slot 1 (§4).
- **Scored, not proven pixel-exact (§7):** 99.8 against the console's `A_31` corrected, 94.4 the title crop, 99.4 the
  recomp's frame outside the state bands; the no-configuration state 99.8 against the console's `A_06` corrected (99.8
  its rows; added at sprint 11's close, the review having found it scored nowhere; 98.1 until FOCUS-RING drew its
  title, research 116 §17.5); what would raise it is PLAT-14's
  GS-level comparison, owed there. Of the gate clause's five references, `A_30` is the boot path's card-slot popup,
  not LOGIN's (§6); the other four are scored.
- **Owed:** a console capture of the walk's wrap (EDIT NETWORK CONFIGURATIONS, DOWN: straight to LOGIN, by research
  116 §17 -- R144.3's four dead stops were the old reading's; H70's capture window from LOGIN could include one press
  per row); OPT-05i's card-slot popup where `intro_onstart` would raise it (§6); the server a dev run should name (a local
  match server) is ONL-03 / ONL-07's option on `connectNetLogin`; the `SELECTED_COMBO` row's `server` into the DNAS
  screen (ONL-03 reads `FrontEndSession.netLogin.selection`, §4); the content pass of the rebuild
  (`LISTBOX_REBUILD_CONTENT_PASS_READING`, §3). Closed by the fix round of 2026-10-03: `FRONT_END_TEXTURES_PLACEHOLDER`
  retired and `frontEnd.ts`'s header sentence corrected (§5); the rebuild's `ON_UPDATE_UIVAR` bindings (§3); the
  selection held on the session (§4); §7's browser sentence made exact.
- **Where the sources disagree:** none found beyond research 128 R128.6 (the recomp's eznetcnf answer puts the
  hardware at the key and nothing at +0x48), which the page's stand-in does not follow: it answers as the reader and
  the card do (research 136 §2), and the frame shows the HARDWARE line the console shows.

## 10. The owner's pacing: LOGIN's connect held (added 2026-10-04, OT.R20)

The owner, 2026-10-04, verbatim: "menu time should be extended slightly, the login and DNAS screen in particular. a few
seconds each atleast." (OT.R20 in the online path's plan.) **An owner's pacing choice in place of a network time, not a
change to what the screen draws.**

- **What the page shows between CROSS on LOGIN and the DNAS screen.** `proceed_net_login` (the dialog's own set,
  decoded with `tools/dump-online-dialogs.ts --dialog dlgNetLogin.rdr`): `.DINK`, `STOP menu_fade_up`,
  `POPUPDIALOG(NA)`, the popup (a literal of 30 characters, `keep`; 27 under `ComeFromLan`), `WAIT 0.1`, then
  `IF NetCnfSelectCombo(SELECTED_COMBO)`: `NetCnfUnInit(NA)`, `RebootIOP(MULTIPLAYER)`, `SWITCHMENU(INPUT_STRING)`
  (`dlgNetAuthenticate.rdr`), `net_config_is_init = 0`; ELSE `CALL OnLoginRoomstart`. The popup is what stands.
- **Where the hold is.** `NetCnfSelectCombo` is the IF's condition: inside a condition a UI command's false is the ELSE
  branch, not "in progress" (`packages/ui/src/zanimRuntime.ts`'s IF, `FUN_0025e7a0` D:L108214-108282), so its answer is
  never delayed. On the original the time of this stage is the IOP's: `RebootIOP(MULTIPLAYER)` blocks in
  `FUN_0034f9b0` (D:L249489-249700) while the IOP resets and loads the multiplayer set, the popup frozen on the screen.
  The page holds the statement after a successful select, `NetCnfUnInit` (`FUN_00278020`, D:L123240-123247, the
  eznetcnf release): "not done" on each of `LOGIN_CONNECT_HOLD_TICKS` ticks -- a statement's false holds the sequence
  (research 106 R106.3) -- then the IOP hook and its own 1. The same picture as the console's (the popup over LOGIN),
  the page's frames moving rather than frozen. Any other `NetCnfUnInit` (TRIANGLE's `exit_net_login`, the lobby's
  bailouts) answers at once: only a successful `NetCnfSelectCombo` arms the hold, and only `proceed_net_login` calls it
  (every online dialog's set, `tools/dump-online-dialogs.ts`).
- **The constant.** `LOGIN_CONNECT_HOLD_SECONDS_PLACEHOLDER` = 3 (90 ticks; `holdTicks`, `dnasCommands.ts`, the next
  whole tick of 100/2997 s), §8's row.
- **The ticks** (`netLoginDisc.test.ts`, the disc's own set): from the frame CROSS goes down to the DNAS screen's build,
  **23 frames** with the hold at 0 (the WAIT 0.1's three ticks, the switch, its fade 15 + 3 + 1) and **23 + 90** with
  the owner's. The score (§7) did not move: the settled LOGIN frame is before CROSS.
- **The search for the original's time.** The one run of the original with a clock, PCSX2 on PSRewired (the desktop
  host's `logs/parity/pcsx2_psrewired_url/emulog_url.txt`): `ezNetCnfGetNetcnfifData returned 0` (`NetCnfSelectCombo`'s
  RPC 2) at 106.47 s, eznetcnf stopped and unloaded (`NetCnfUnInit`) by 106.48 s, "Get Reboot Request From EE"
  (`RebootIOP`) at 106.52 s, the reboot complete at 106.86 s and the multiplayer set's last module (MCSERV) loaded at
  107.69 s -- about 1.3 s from CROSS to the switch, with the WAIT 0.1. Shorter than 3 s, so the ruling's 3 s stands.
  The recomp's walks (`logs/parity/drive_s11_r0004_online2.txt`: LOGIN gone at 43.5 s, SELECT UNIVERSE at 43.9 s) are
  driver-polled and under the bypass: no stage time. An emulator's timing, a note rather than a reading.
