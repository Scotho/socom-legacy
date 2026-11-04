# 103 -- The locale and string service: every LOC archive, one id-to-text lookup (web sprint 6, PLAT-04)

Written 2026-10-01 for web sprint 6 (plan `../plans/2026-10-01-web-sprint-6-foundations.md`, task PLAT-04; the block is
`../roadmap/01-platform.md` "PLAT-04"). Sources: the retail decompilation
`C:/Projects/socom_pc/game/analysis/socom2_game.elf.decomp.c` (`Lnnn` = its line), the retail ELF on the disc
(`game/disc/socom2_game.elf`, its strings and vtables read by address through its program headers), and the disc
(`game/disc/RUN/...`) read with the repository's own readers (`@s2u/archive` `zar.ts`, `zdb.ts`, `rdr.ts`;
`@s2u/scene` `uiLoc.ts`, `uiLayout.ts`, `uiZanim.ts`, `zanim.ts`). The probes lived outside the repository; no string
of the game is copied here beyond the short captions the console crops show and the `MSG_ID` names. The code is
`packages/scene/src/uiLoc.ts` (`LOC_ARCHIVES`, `locArchivePath`, `readLocArchive`, `LocService`, `loadLocService`),
pinned by `packages/scene/test/locService.test.ts`.

Corrected 2026-10-01 after the PLAT-04 review: the first id scan read only the layout objects' CAPTIONs (659) and
generalised from them to "the dialogs"; R103.4, R103.5, §3 and §4 are corrected in place and marked, and R103.7-R103.8
and §3.1-§3.3, §4.1 are added.

## 0. Answers

| # | finding | consequence | section |
|---|---|---|---|
| R103.1 | **`UILdLOC` exists, but not as a loose file**: the code asks for `UILd` (the string at 0x3e2f48) in the loading state `FUN_001f6660` (L55825, beside `run/ldzanim.zar`), and every one of the 34 map archives (`RUN/MP*.ZDB`, `RUN/M5x-M8x.ZDB`) carries a member `RUN\LOCALE\STATES\UILDLOC.ZAR`, byte-equal in all: 7 strings, ids 2000-2006. The US disc's `RUN/LOCALE/STATES/` has no `UILDLOC.ZAR` | the block is corrected in place; `loadLocService` reads `UILd` from a map archive | §1 |
| R103.2 | **ALB, ALG, BRAZ and RUSS LOC are the campaign's**: they are named only by a campaign mission's `mission.rdr` key `ExtraStringTables` (M51-53 `Alb`, M61-63 `Braz`, M71-73 `Alg`, M81-83 `Russ`; no multiplayer map has the key), which `FUN_002af410` (L153682-153722) reads and `FUN_002af360` (L153660-153677) loads | `frontEndFiles.ts`: a `locale-campaign` class, `DEFERRED (campaign)`; `LOC_ARCHIVES` marks them | §1 |
| R103.3 | **The `C2` lead rule holds for every table**: two-byte sequences occur in UIMnLOC, HudCLOC and UIXLOC; one decoder (`decodeLocText`, `UIMNLOC_UTF8_READING`) serves all, and no `C2` lead is left in any table after it | `readLocArchive` decodes every table | §2 |
| R103.4 | *(Corrected 2026-10-01, the PLAT-04 review: it said every caption id resolves, from the 659 layout-object CAPTIONs.)* **Every reference resolves but four.** The 110 members of `RUN/UI/READERC.ZAR` hold 866 `_<id>_..._MSG` string nodes -- 840 `CAPTION`s (every screen's, not only the ones `parseUiLayout` reads) and 26 `UIVAR` `VALUE`s: UIMn 783, UIMPX 46, UIX 22, HudC 10, UILd 1, and **4 in no table** (`dlgSetSOP.rdr`'s SOP defaults `_549_`, `_550_`, `_552_`, `_553_`; §3.1). The zAnim sets' `UI_COMMAND` ids and popup ids -- `UIZANIM.ZAR` 1,244 (760 distinct) all UIMn, `MPZANIM.ZAR` 23 all UIMPX, `EXTZANIM.ZAR` 23 all UIX -- and the `_MSG` names in their name tables all resolve. No table holds an empty string, so no recorded empty is needed | the tests pin these counts by field and table, and the four by name | §3 |
| R103.5 | *(Corrected 2026-10-01, the PLAT-04 review: it said no menu dialog names a HudCLOC id.)* **HudCLOC ids do appear in menu dialogs.** `dlgNetLogin.rdr` (the online and LAN login: front end) declares the persistent `UIVAR`s `MPLOCALSOP1-5` and `MPTAUNTMSG1-5` with HudC 60757-60766 as their values; and the `UIZANIM` sets `ShowAndSpin.rdr` (the multiplayer ARMORY's: front end) and `dlg_equipment_main.rdr` (the single-player armory: campaign) compare values with HudC 60884, 60885, 60888 and 60889 by name | HudCLOC's strings are front-end data; whether the menus need the table loaded is §5's | §3.1 |
| R103.6 | Ten crop captions (eleven rows) compared by eye: all eleven are the strings the ids resolve to | §4 | §4 |
| R103.7 | **A `_MSG` name is looked up by the whole name, not by the id it spells**: the text setter `FUN_003631f0` turns a name into an id through `FUN_003a3700` -> `FUN_003a3100` -> `FUN_003a41f0`, a hash of `MSG_ID` and a string compare. On the disc the two disagree: UIMnLOC's ids 274-279 are named `_273_5Minutes_MSG` .. `_273_10Minutes_MSG` | `caption` and `command` look names up by name: `_273_5Minutes_MSG` is 274 | §3.3 |
| R103.8 | **The main menu's row labels are textures on a 3D model, not text**: `dlgMenu.rdr`'s six `BUTTON`s have a blank `CAPTION` (" "), and `RUN/UI/UI_MDL.ZED`'s `mainmenu_roller` draws `menu_newgame_on/off.tif`, `menu_loadgame_*`, `menu_online_*`, `menu_LAN_*`, `menu_options_*` and `menu_extras_*` of `RUN/UI/UI_TXR.ZED`: its twelve nodes (`new_on` ... `extras_off`) are one quad each, and each quad's packets cite its one label texture (the model decoded, §4.1; names read, nothing copied). *(Corrected 2026-10-01, PLAT-35: the test first showed only that the names share the archive; it now decodes the model.)* ONLINE is a string too (UIMn 316), used elsewhere | MENU-02 draws the roller with those textures; how a button drives it is §5's | §4.1 |

## 1. The archives, as read

The loader (`FUN_003a3900`, L297225-297310; the rule the block cites, `FUN_003a3490` L297105-297117, re-reads the
tables already loaded) builds `RUN\LOCALE\<country>\` (0x3fbe28) + `<name>LOC.zar` (0x3fbe18) and reads the member
`<name>LOC.rdr` (0x3fbe08); the country is an index into the table at 0x3e0780 (`STATES`, `UK`, `FRANCE`, `GERMANY`,
`SPAIN`, `ITALY`, `JAPAN`, `KOREA`). With the debug flag `DAT_003e07a8` clear it reads
`DATA\COMMON\ZRDR\LOCRDR\%s\%sLOC.rdr` (0x3fbe40) instead. A name already loaded is not loaded again: the loader
compares it with each loaded table's name and returns (L297249-297254); `LocService.add` does the same. When the open
returns nothing the table is simply not added (L297271: `if (lVar3 != 0)`); whether that is how a missing archive
behaves on the console, rather than a fault, is not traced (`FUN_0032f630`).

| table | name string | loaded by | archive | strings | ids |
|---|---|---|---|---|---|
| UIMn | 0x3e2d20 | `FUN_001f4860` L54807 (the menu state) | `RUN/LOCALE/STATES/UIMNLOC.ZAR` | 1,411 | 1-1441 |
| UIMPX | 0x3e5258 | `FUN_00223970` L76106 | `UIMPXLOC.ZAR` | 34 | 2100-2133 |
| UIX | 0x3e29e0 | `FUN_001f1bb0` L53492 | `UIXLOC.ZAR` | 45 | 2201-2288 |
| HudC | 0x3e3570, 0x3f1b90 | `FUN_001fcd80` L58449; `FUN_002ad290` L152678 | `HUDCLOC.ZAR` | 440 | 60000-60904 |
| UILd | 0x3e2f48 | `FUN_001f6660` L55825 (the loading state) | member of every `RUN/*.ZDB` | 7 | 2000-2006 |
| Alb | `ExtraStringTables` | `FUN_002af360` L153674 | `ALBLOC.ZAR` | 269 | 3000-3268 |
| Alg | `ExtraStringTables` | `FUN_002af360` L153674 | `ALGLOC.ZAR` | 151 | 4000-4150 |
| Braz | `ExtraStringTables` | `FUN_002af360` L153674 | `BRAZLOC.ZAR` | 302 | 13000-13301 |
| Russ | `ExtraStringTables` | `FUN_002af360` L153674 | `RUSSLOC.ZAR` | 205 | 14000-14204 |

The ranges are disjoint, so one id names one string whatever is loaded (`LocService` refuses a table that claims an id
already held). Some map archives carry a table of their own as well -- `M51LOC`..`M83LOC` (ids 10000-12248) in the
campaign archives, and `MP51LOC`, `MP53LOC`, `MP71LOC`, `MP72LOC`, `MP73LOC`, `MP82LOC`, `MP83LOC` (ids 5100-8313) in
seven multiplayer ones; no menu dialog or zAnim set names one of their ids. *(Corrected 2026-10-01, the PLAT-04 review:
their loader was called untraced.)* The same loading state loads them: `FUN_001f6660` calls `FUN_002af360(DAT_004364fc)`
(L55802), which first loads the table its argument names (`FUN_003a3900`, L153664) and then the `ExtraStringTables`.
`DAT_004364fc` is read as a name whose characters from the third on are a number (L191385-191389:
`FUN_00191490(DAT_004364fc + 2)`) -- the map's archive name, `MP72` -> `MP72LOC.ZAR` -- and the member is present in
exactly the maps that carry one. The reading: the per-map table is `<map>LOC`, loaded at the loading screen; where
`DAT_004364fc` is written was not found in the decompilation.

## 2. The lead byte

`decodeLocText` (`uiLoc.ts`) turns a two-byte sequence -- a lead 0xC2-0xDF, a continuation 0x80-0xBF -- into its one
code point, which is the font's own code (0xA6 the cross, 0xAC the triangle, 0xB4 the square, 0xB7 the circle); every
other byte stands. The reading is research 95's (`UIMNLOC_UTF8_READING`, §5.5: the lobby frame shows the cross with no
"Â"); this task extends it from UIMnLOC to every table, because the same sequences are in HudCLOC and UIXLOC, and the
rooms crop (§4) shows the cross drawn from a UIMnLOC `C2 A6`. The dialogs' literal captions are single bytes and are not
decoded.

## 3. The id scan

*(Corrected 2026-10-01, the PLAT-04 review: the scan read only the CAPTIONs of the layout objects `parseUiLayout`
returns, 659 of them; it now walks every string node of every member.)* What a dialog or a set can reference, and how
the service resolves it (`LocService`):

- a `_<id>_..._MSG` string anywhere in a dialog's tree -- a `CAPTION` or a `UIVAR` `VALUE`, the only two fields that
  carry one: looked up by its whole name among the tables' `MSG_ID`s (`caption`; §3.3). Any other caption is a literal
  and stands (of the layout objects `parseUiLayout` reads: 156 non-blank, 243 blank);
- a `ui::UI_COMMAND`'s s16 at +0xc: op 1 **Caption** (`FUN_0036fcc0` L268063-268070) shows that id when it is non-zero,
  else the literal named at +8, which goes to the text setter with translation on (L268066: vtable+0x70 with 1), so a
  literal that is a `_MSG` name is looked up by name too (`command`; eight such literals in `UIZANIM.ZAR`, e.g.
  `dlgCreateGame.rdr`'s `_251_PASSWORD_MSG`); the ids in conditions' `UI_COMMAND` tokens are counted too;
- a `_MSG` name in a zAnim set's name table (a literal argument, or a value a `CompareValues` compares);
- a popup's text id (the `POPUP` node, op 0, u16 at +0x12; research 95 §1.2). 75 popups in `UIZANIM.ZAR`, 20 in
  `MPZANIM.ZAR` and 10 in `EXTZANIM.ZAR` carry 0 there; 0 is no id in any table, and what such a popup draws is not
  settled here (the popup's runtime is PLAT-05's and PLAT-13's);
- a `UIVAR` (`object`): the variable's name is handed over beside the caption. `VERSION_STRING` is registered at
  L47871-47872 (`FUN_003857c0` with the name at 0x3e17c8, `FUN_003862a0` with the build string at 0x3e17e0).

Counts (pinned by the tests; the fixture test has UIMnLOC and MP2's UILdLOC, the dev-disc test all five):

| source | field | references | resolved in |
|---|---|---|---|
| `RUN/UI/READERC.ZAR` (110 members) | `SPEC` > `CAPTION` | 840 | UIMn 771, UIMPX 46, UIX 22, UILd 1 (`dlgLoad.rdr`'s `_2000_ToReturn_MSG`) |
| | `UIVAR` > `VALUE` | 26 | UIMn 12, HudC 10 (`dlgNetLogin.rdr`), **in no table 4** (`dlgSetSOP.rdr`) |
| `RUN/UIZANIM.ZAR` | ids (`UI_COMMAND`, popups) | 1,244 (760 distinct) | UIMn 1,244 |
| | names in name tables | 44 | UIMn 16, HudC 28 (`ShowAndSpin.rdr`, `dlg_equipment_main.rdr`) |
| `RUN/MPZANIM.ZAR` | ids / names | 23 / 25 | UIMPX 23 / UIMn 25 |
| `RUN/EXTZANIM.ZAR` | ids / names | 23 / 10 | UIX 23 / UIMn 10 |

Empty: none (every string of the five front-end tables is non-empty).

### 3.1 The four ids in no table, and the HudCLOC references

`dlgSetSOP.rdr` declares the persistent `UIVAR`s `MPLOCALSOP1-5` with the values `_549_ImGoingLeft_MSG`,
`_550_ImGoingRight_MSG`, `_737_ImGoingDownMiddle_MSG`, `_552_ImGoingBomb_MSG` and `_553_ImGoingHostages_MSG`.
UIMnLOC holds 737 and none of 549, 550, 551, 552, 553; no other table does (§1's ranges; the per-map tables start at
5100), and the four names are not in the ELF's strings. `dlgNetLogin.rdr` declares the same five variables, also
persistent, with `_60757_ImGoingLeft_MSG` .. `_60761_ImGoingHostages_MSG` -- the same names after the number, in
HudCLOC -- and its third is `ImGoingInsane`, not `ImGoingDownMiddle`. The dialog is reachable: `dlgOnlineOptions.rdr`
and `dlgLAN_Options.rdr` bind a control to it (an `ANIMATIONS` entry whose `ARGUMENT` is `dlgSetSOP.rdr`), so it is the
online and LAN SOP editor, front end. Reading: the SOP strings were renumbered into HudCLOC and `dlgSetSOP.rdr`'s
defaults were not; whether they are a SOCOM 1 leftover nothing read shows. A name no table holds is not translated
(`FUN_003a3100` finds nothing, so `FUN_003631f0` keeps the text as given): if `dlgSetSOP.rdr`'s values were ever the
ones shown, the console would draw the raw names. Whether they are depends on whether a second declaration of a
persistent variable that the login already set replaces its value -- not settled; the dialog loader's `UIVAR`
declaration path, or a console capture of the SOP editor on a fresh card, settles it.

The HudCLOC references: `dlgNetLogin.rdr`'s ten variables (HudC 60757-60766: the SOP and taunt defaults; online and LAN
login, front end); in `UIZANIM.ZAR`, the name tables of `ShowAndSpin.rdr` (the multiplayer ARMORY's spin set, research
95 R95.1: front end) and `dlg_equipment_main.rdr` (the single-player armory -- its controls are FIRETEAM, the Able and
Bravo elements and DEPLOY: campaign) hold `_60884_WARDOG_MSG`, `_60885_VANDAL_MSG`, `_60888_ReaverSas_MSG` and
`_60889_SabreSas_MSG`, which a `CompareValues` compares with a `UIVAR` (case-insensitive).

### 3.2 Names in a dialog's string table that no node uses

A compiled dialog's string table also holds 848 `_MSG` names no node points at (UIMn 810, UIX 22, UIMPX 7, UILd 5,
HudC 4 -- the four of §3.1, in `dlg_equipment_main.rdr`); 721 of them are ids the same-named zAnim set uses (its
`UI_COMMAND` and popup ids): 692 in `UIZANIM.ZAR`, 29 in `MPZANIM.ZAR` or `EXTZANIM.ZAR`; 15 more are names that set's
name tables hold, 13 are in a dialog with no same-named set, and 99 are neither. So most are the strings of the
dialog's script source, compiled into the zAnim archives as ids or names. *(Corrected 2026-10-01, PLAT-35: this said
"721 ... compiled into `UIZANIM.ZAR`", a figure no test held; `UIZANIM.ZAR` alone holds 692 of them. The split is pinned
now.)* The loader reads a dialog
through its nodes (`FUN_0032f0e0`), so these are not references of the dialog itself; the test pins them so that a
change shows.

### 3.3 By name, not by the spelled id

The setter `FUN_003631f0` (L260982-261047) is vtable+0x70 of the UI text classes (the vtables at 0x407190 and 0x407a90,
whose +0x64 is `FUN_0036fcc0` and +0x74 `FUN_00363460`). With translation on it asks `FUN_003a3700` (L297148-297162)
for the text's id: `FUN_003a3100` (L296935-297000) takes only a text beginning with `_` and asks each loaded table's
`FUN_003a41f0` (L297531-297578), which hashes the text (its first and middle characters, mod 17) and compares it with
each record's name by `FUN_00198f18`, a string compare; the buckets are built from `MSG_ID` when the table is loaded
(`FUN_003a3be0`, L297398-297449). So the whole name is the key. On the disc UIMnLOC's ids 274-279 are named
`_273_5Minutes_MSG` .. `_273_10Minutes_MSG` (273 is `_273_4Minutes_MSG`), and `dlgCreateGame.rdr` names all seven: by
name they are seven strings, by the spelled id one. `LocService.caption` looks up by name.

## 4. Ten captions against the console crops

A reading **by eye**: each crop under `scripts/parity/refs/` (the repository's PCSX2 references; `refs.json` gives the
title bars' boxes) was opened and the caption it draws read off the image, then compared with the text the id resolves
to. Nothing of the crops is copied into this tree. The id's source is the dialog or script that shows it.

| crop | the caption as drawn | id (table) | where the id comes from | match |
|---|---|---|---|---|
| `login.png` | LOGIN TO SOCOM II ONLINE | 568 (UIMn) | `UIZANIM` `dlgNetLogin.rdr` `OnLoginactive`: op 1 on `bar_title` | yes |
| `eula.png` | USER AGREEMENT | 756 (UIMn) | `dlgUsagePolicy.rdr` `bar_title` `_756_UserAgreement_MSG` | yes |
| `universe.png` | SELECT UNIVERSE | 609 (UIMn) | `dlgNetServerSelect.rdr` `bar_title` | yes |
| `persona.png` | CONNECT TO SOCOM II | 587 (UIMn) | `dlgNetPlayerName.rdr` `bar_title` | yes |
| `game_lobby.png` | GAME LOBBY | 339 (UIMn) | `dlgGameLobby.rdr` `bar_title` | yes |
| `rooms.png` | (cross) Select a Briefing Room. | 782 (UIMn) | `UIZANIM` `dlgWorldOfSOCOM.rdr` `OnBriefingRoombtn`: op 1 on `DescriptionText` | yes, the cross from `C2 A6` (§2) |
| `lobby_news.png` | SERVER NEWS | 779 (UIMn) | `dlgWorldOfSOCOM.rdr` `popup_motd_description` | yes |
| `write_down.png` | Be sure to write down your name (cut) | 606 (UIMn) | popup in `dlgNetPlayerName.rdr` `register_new_account` | yes (the crop's part) |
| `save_card.png` | Would you like to save to the (cut) | 831 (UIMn) | popup in `UIMemCardAnim.rdr` `save_and_leave` | yes (the crop's part) |
| `card_slot.png` | Select MEMORY CARD slot: | 828 (UIMn) | a popup id of `UIZANIM` | yes; 830 begins with the same words and the crop is cut after them, so 830 is not excluded. 563 ("SELECT MEMORY CARD slot:", `dlgNetLogin.rdr` `MemoryCard`) differs in case and is not this one |
| `main_menu.png` | Developed by Zipper Interactive, Inc. | 507 (UIMn) | `dlgMenu.rdr` `LEGALEZE` | yes |

The main menu's version line is the `UIVAR` `VERSION_STRING` of `dlgMenu.rdr`'s `VERSION` object, and reads as the build
string at 0x3e17e0.

### 4.1 The main menu's row labels

*(Corrected 2026-10-01, the PLAT-04 review: this said LOAD GAME, NEW GAME and ONLINE are in no LOC table.)* ONLINE is in
one: UIMn 316, `_316_ONLINE_MSG`, used by `dlgFriendList.rdr`, `dlgIgnoreList.rdr` and `dlgManageRoster.rdr`; whether
the main menu's button draws it was the open question, and the answer is that the main menu draws no text there. LOAD
GAME and NEW GAME are in no table (414 is "Create a new game.") and not in the ELF's strings. `dlgMenu.rdr`'s six
`BUTTON` controls (`new_game_button`, `load_game_button`, `multiplayer_button`, `options_button`, `Extras_button`,
`LAN_button`) have a blank `CAPTION` (" ") with text colours per state, and no script of the `dlgMenu.rdr` set gives
them a caption. The labels are textures: `RUN/UI/UI_TXR.ZED` holds `menu_newgame_on.tif` / `_off.tif`,
`menu_loadgame_*`, `menu_online_*`, `menu_LAN_*`, `menu_options_*`, `menu_extras_*` (and `*_d.tif`), and
`RUN/UI/UI_MDL.ZED`'s `mainmenu_roller` model draws the `_on`/`_off` ones (the roller research 09 names). Decoded through
the UI models' library (`RUN/UI/UI_GEO.ZED` over `UI_MDL.ZED`, `weaponLibrary` in the bias form of research 95 §5.3),
the model has twelve nodes, `new_on`, `new_off`, `load_on`, ..., `extras_off`, each one quad (two triangles) whose
packets cite one texture, that row's label in that state; no other of the 64 UI models cites a `menu_*` texture. How
a button's selection turns the roller is not traced (§5). *(Corrected 2026-10-01, PLAT-35: the test behind this
paragraph first found the texture names and `mainmenu_roller` only in the same archive's bytes; it now decodes the
model's packets.)*

## 5. Unknowns

- ~~Whether the game resolves a `_<id>_..._MSG` caption by its name or by the id it spells~~ *(settled 2026-10-01: by
  name, §3.3)*.
- Which of `CAPTION` and `UIVAR` an object shows when it has both (40 of the objects `parseUiLayout` reads:
  `dlgControllerSelection.rdr`'s stick rows, `dlgFriendList.rdr`'s `bar_title`, `dlgGameLobby.rdr`'s `GameInfoText`,
  ...): PLAT-05's.
- Whether a second declaration of a persistent `UIVAR` replaces its value, and so whether `dlgSetSOP.rdr`'s four
  unresolved names are ever shown (§3.1).
- Whether the menus need HudCLOC loaded for `ShowAndSpin.rdr`'s comparisons -- whether `CompareValues` translates a
  name before it compares (§3.1).
- What a popup with text id 0 draws (§3).
- How a main-menu button's selection drives the `mainmenu_roller` model (§4.1): the menu state's code or the UI world.
- ~~What loads the per-map `M5xLOC`..`M8xLOC` and `MPnnLOC` members~~ *(read 2026-10-01: the loading state, §1)*;
  where `DAT_004364fc` is written.
- Whether a missing LOC archive is silently skipped on the console (§1).

## 6. Placeholders and readings

| name | stands for | searched / reading | status |
|---|---|---|---|
| `UIMNLOC_UTF8_READING` (research 95 §8; `scene/src/uiLoc.ts`) | how a two-byte sequence in a LOC string is drawn | research 95 §5.5; extended here to every table (§2): the same decoder for UIMnLOC, HudCLOC and UIXLOC, checked against the rooms crop's cross | open (the code path that consumes the lead is still not found) |
