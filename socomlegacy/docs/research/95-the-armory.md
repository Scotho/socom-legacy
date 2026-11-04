# 95 -- The armory: the pre-round ARMORY screen, its scripts, its code and its assets (web sprint 5, S0)

Written 2026-09-30 for web sprint 5 (plan `../plans/2026-09-30-web-sprint-5-armory.md`, rulings W5.R1-R5, task S0).
Read-only research by three readers in parallel, merged by the sprint's writer: (a) the layout
`dlg_equipment_mp.rdr` and its two `UIZANIM.ZAR` script sets decoded command by command; (b) the C code the scripts
call, the screen's states and its save and defaults; (c) the assets and fonts, their archive paths and decoders, and the
character types per map. Sources: the retail decompilation `C:/Projects/socom_pc/game/analysis/socom2_game.elf.decomp.c`
(`Lnnn` = its line; every address **retail**), the retail ELF on the disc (`game/disc/socom2_game.elf`, the same
addresses), the binding names in `recomp/socom2_names.csv`, reCOM `research/recom/` (`zanim.h`), and the disc
(`game/disc/RUN/...`) read with the repository's own `@s2u/archive` and `@s2u/scene` readers. The readers' probes lived
outside the repository (no game bytes in git: names, ids and numbers only). Script citations are
`<set>/<anim>@<offset>` where the set is `eq` (`dlg_equipment_mp.rdr`) or `sas` (`ShowAndSpin.rdr`) and the offset is
into the animation's `Seq_Data`. The writer re-read the load-bearing claims against the decomp and the decoded sets
(marked "checked" where it matters).

The screen is the one the owner remembers: the lobby's ARMORY (`_345_ARMORY_MSG`), eight character columns, a spinning
3D weapon, four stat bars and a typed-out description -- **not** research 94's in-round WEAPON EXCHANGE.

## 0. Answers, and what S0 changes for the build

| # | finding | ruling / consequence for S1-S4 | section |
|---|---|---|---|
| R95.1 | Almost all the ARMORY's behaviour is **script**: `UIZANIM.ZAR` sets `dlg_equipment_mp.rdr` (43 anims, 1,731 commands) and `ShowAndSpin.rdr` (23 anims, 4,051 commands). The C side is ~30 named UI commands the scripts call (the binding table at 0x3dd4d0) | S1 decodes the UI command payloads (§1); S3's `armoryState.ts` is the scripts' state machine, not a translation of C | §1, §3 |
| R95.2 | The layout is `RUN/UI/READERC.ZAR` -> `dlg_equipment_mp.rdr` (58,664 B): 226 objects, 12 animations, 22 controls, 67 model entries; `parseRdr` reads it as is | S3 draws the rdr's own positions on the 640x448 frame | §2 |
| R95.3 | **Circle restores the type's whole default kit** (`ChooseDefaultEquipment` 0x282980, L128604-128652), primary and secondary included. `UIChooseDefaultEquipmentOnly` (0x281be0) is bound but **no shipped script calls it** | research 94 §A5.5 is corrected (§7); S3's Circle = the full default kit, as W5.R4 already says | §4.4, §7 |
| R95.4 | **The saved loadout is keyed per (host, port, account, mission) and holds one record per side**: `{MpCharSet, prim, sec, eq1, eq2, eq3, valid}`. It is not per type | W5.R4 says "per-map, per-side, per-type". The source is per-map, per-side (the type is part of the record). S3 builds the source's key (map + side, the type stored in the record) unless the owner rules otherwise: `ARMORY_PROFILE_KEY_READING` | §4.4 |
| R95.5 | **With no saved loadout a player is SEAL 1 / TERRORIST 1** (type index 0 / 4): the lobby's `FromBriefing`, `switch_teams_anim`, `SwapClanSides` and the ARMORY's `UiEquipSwitch` all set `MpCharSet` 1 or 5 and call `ChangeCharacterType(1)`/`(5)` | `DEFAULT_CHARTYPE_PLACEHOLDER` (research 91) is **answered by source**; S2 replaces it by the rule and cites this row | §4.4 |
| R95.6 | **The 4th column is the map's: open as "SEAL 4" / "TERRORIST 4" where its `InWhichAOP` is 0, locked under the campaign's unlockable on 51-83** (corrected 2026-10-01 by the owner's PCSX2 capture of Crossroads: ALG OFFICER under LOCKED). `UnlockMPChar` reads `InWhichAOP`, and every MP map's `mission.rdr` `Valves` set it (0 on MP1-MP12, 50/60/70/80 on MP51-53/61-64/71-73/81-83) over the main menu's 0; the unlock valves (`SetOfficer` ...) are the campaign's, 0 without one | `fourthArmoryTypeOpen` (`scene/src/armoryCharacters.ts`): the room and the local match refuse the locked type; the page draws the lock and refuses a tap with .NEG -- §2.8 | §2.8, §3.1, §6 |
| R95.7 | A launch countdown pulls everyone out: `UiBackToLobby` watches `mp_x_sec_clock` and on its first change opens popup 47 ("taken back to the game lobby in 5 seconds"), waits 5 s and switches to the lobby. The ARMORY draws no countdown of its own | W5.R1's "countdown, if the source gives one": the source gives the 5-s popup; S3 opens it when the viewer's round-start timer starts | §4.1 |
| R95.8 | The stat bars are **per-weapon script constants** (x-scales of a 140-px `blue_fill` bar; VOLUME, ACCURACY, RANGE, FIRE RATE), not derived from `zweapon.rdr` | S1/S3 read them from the decoded `ShowAndSpin` set (§3.7), never hand-typed | §3.7 |
| R95.9 | The preview spins **178.97 deg about -Y every 3 s = 59.66 deg/s** (one turn in 6.035 s), a true slerp, for all 67 models; each model has its own AZIMUTH/ELEV/DISTANCE | S3 | §3.8 |
| R95.10 | The UI models (`RUN/UI/UI_GEO.ZED` + `UI_MDL.ZED`, 64 models) decode through `weaponLibrary` but in the **`'bias'` position form** (0x68, ITOF4 /16), not the weapons' hard-coded `'scale'` | S1 adds a form parameter to `weaponLibrary` (`UI_MODEL_FORM_READING`) | §5.3 |
| R95.11 | `font_special_01` is **not a face**: it is texture 2 of `font_text_01` (18 pad glyphs: 0xAC triangle, 0xB4 square, 0xA6 cross, 0xB7 circle, ...). `fonts.rdr` has two faces, `font_titlebar_01` and `font_text_01` | S1 transcribes both faces; S4 replaces `PAD_GLYPH_PLACEHOLDER`'s "R2" text with the glyphs | §5.4 |
| R95.12 | UIMnLOC strings are **UTF-8** (`C2 A6` = the cross glyph); `Reader.cstr` decodes byte by byte and would draw "Â¦". The dialog `.rdr` captions are single-byte | S1's LOC reader drops the `C2` lead (`UIMNLOC_UTF8_READING`) | §5.5 |
| R95.13 | Portraits and the equipment library are **data**: each map's `READERM.ZAR/mission.rdr` `UiVars` names `EQUIPMENT_LIBRARY = ui/assetlib/eq/emNN` and the eight portrait `.tif`s (checked on all 22 maps) | S1 reads `UiVars`; S3 draws the portraits from `EMnn_TXR` | §5.2, §6 |
| R95.14 | The retail ELF is on the disc (`game/disc/socom2_game.elf`), addresses matching the decomp: research 91's `DAT_` readings that said "no ELF available" can now be read | a pointer for a later pass | §5.1 |
| R95.15 | (S4) The d-pad glyphs point **0xA3 right, 0xAF left, 0xB1 down, 0xB5 up** (the atlas and the dead player's Right/Left teammate cycle agree); the 18 pad glyphs draw in their own colour (150,150,150) with no drop shadow | WEAPON EXCHANGE's prompt draws R2 and the d-pad's right/left from `font_special_01.tif`; research 94's `GLYPH_READING` retracted | §5.4, §7 |

**What no frame shows.** The only console frames near the ARMORY are the lobby's (`logs/parity/s4_pcsx2/A_53_gamelobby.png`,
`A_54_gamelobby2.png` in `C:/Projects/socom_pc`): the ARMORY itself, its spin, its slide and its padlocks have no
console frame. Everything below is read from the disc and the code; the owner's PCSX2 capture list (S5) is what settles
the readings.

## 1. How the script commands are encoded

### 1.1 Command sets and numbers

- **Set 0** is registered in `FUN_0025bc20` (L106861-106924) through `FUN_0026a8e0`. Numbers 1..58 follow the string
  order at 0x3eccc0..0x3ed0b0 and match `ZANIM_COMMAND_NAMES` (`packages/scene/src/zanim.ts`): 2 IF, 3 ELSEIF, 4 ELSE,
  5 ENDIF, 14 LOOP, 15 WAIT, 17 OBJECT_ACTIVE_STATE, 22 OBJECT_MOTION_FROM_TO, 25 OBJECT_OPACITY_FROM_TO, 30 SOUND,
  39 WHILE, 40 END_WHILE, 43 EXPRESSION, 44 BREAK, 45 CALL_ANIMATION, 46 STOP_ANIMATION, 50 CALL_SEQUENCE. VALVE is
  61 (registered in `FUN_00354470`, L252352).
- **Set 1** holds the two `ui::` registrations (L106923, checked: `FUN_0026a8e0(0x414bb0,0x3ed0c0,...,0x2745a0,0)`):
  cmd 1 `ui::UI_COMMAND` (tick 0x2745a0), cmd 2 `ui::UI_APP_COMMAND` (tick 0x274590). All 275 + 541 set-1 commands in
  the two ARMORY sets are UI_COMMAND.
- Used: `dlg_equipment_mp` set 0 {1,2,3,4,5,15,17,22,25,30,39,40,45,46,50,61} and set 1 {1}; `ShowAndSpin` adds 14
  LOOP and 44 BREAK.

### 1.2 UI_COMMAND (`FUN_002745a0`, L121344-121431)

| offset | meaning |
|---|---|
| +4 u16 | node (an index into the anim's `Node_Ref_List`); 0 = no node |
| +6 u8 | with a node: opcode + 0xE8 (`FUN_00274870(0)` returns 0xE8, L121434); without: the command's name index |
| +8 u16 | argument: a name index (literal text, or the valve / script name) |
| +10 u8 | cached binding row |
| +0xc s16 | UIMnLOC string id (0 = use the literal at +8) |
| +0x10.. | extra argument words (e.g. `CharacterProfile` mode) |

- **With a node** the node's UI object handles it (vtable+100). The base handler `FUN_0036fcc0` (L268005-268080,
  checked): op 1 **Caption** -- if the s16 at +0xc is non-zero the text is that locale id (vtable+0x74), else the name
  at +8 (L268063-268070); op 2 **Valve** -- the text is `"%d"` of the valve named at +8. Per-class ops: TELETYPE
  `FUN_00378460` (4 Continue, 5 scroll_up, 6 scroll_down, 7 finish), list `FUN_00373640`, `FUN_00379970`
  (Scroll_Up/Down), `FUN_0037b840` (Start/Finish), `FUN_00372870` (SetValue), `FUN_00371290` (Selection).
- **Without a node** the name at +6 is matched case-insensitively (`FUN_00198b80`) against the 16-byte table at
  **0x3dd4d0** (`{id, name, fn, fn2}`, 207 rows; *corrected 2026-10-01, PLAT-35, from research 96 R96.9 and §4: this said
  208 -- the 208th 16-byte record is the all-zero terminator, and the highest id is 208 because id 30 is unused*).
  Inside an IF, the command's tick return is the truth value. The ARMORY's: ChoosePrimary 0x2827e0, ChooseSecondary 0x2826c0, ChooseEquip1/2/3 0x2825e0/0x282500/0x282420,
  UpdateSelItemValves 0x282410, ChooseDefaultEquipment 0x282980, SwitchMenu 0x27e720, PopUpDialog 0x27eb10, KillPopUp
  0x27d190, ActivateButton 0x27c360, ChangeCharacterType 0x2795e0, CharacterProfile 0x275770, DoAllSelCharsHaveWeapon
  0x2808e0, DoAllSelCharsHaveEquip1/2/3 0x281080/0x281070/0x281060, DoAllSelCharsHaveLockedEquip1/2/3
  0x281050/0x281040/0x281030, CanCharactersSelectUIWeapon 0x280d60, CheckForcedLaunch 0x27cbf0, AdvanceMPMission
  0x279490, DisconnectFromGameServer 0x27e420, SuspendMenuInput 0x277220, CompareValues 0x274db0.
- A **popup** is the POPUP node, op 0, 236 bytes: its text id is the u16 at +18, the button records follow
  (`ARMORY_POPUP_LAYOUT_READING`).
- Captions resolve in `UIMnLOC.rdr`; its ids 1-1441 are disjoint from UIMPXLOC (2100-2133), UIXLOC (2201-2288) and
  HudCLOC (60000+).

### 1.3 VALVE (`FUN_00353fd0`, L252128-252345; operator strings at 0x3f81c0)

+4 valve reference, +8 operand, +12 op, +13 flags (2: the reference is a name index; 1: from the context; 0x10: the
operand is a valve, 0x08 by name, 0x04 from context). The value is a u16 at valve+4. Tests: 0 true, 1 !=, 2 ==, 3 >,
4 <, 5 >=, 6 <=, 7 |, 8 &, 9 |~, 10 &~. Assignments: 11 =, 12 +=, 13 -= (floored at 0), 14 *=, 15 |=, 16 &=, 17 |=~,
18 &=~. A change fires the valve's watchers (`FUN_003519f0`).

**Corrected 2026-10-01 (web sprint 6, PLAT-09; research 104 §1, §2, §7).** The paragraph above is kept as written;
where it was read loosely, the source says:
- **Op 0 is always true**, whatever the value (L252182-252184) -- not "the value is non-zero". "Non-zero" is op 1 with
  operand 0, which is what a one-word `VALVE name` parses to (`FUN_003535d0` L251766, L251792).
- **Op 9 `|~` is always true**: `cur | ~op` in 32 bits keeps the upper bits of `~op` set (L252209-252211; the
  disassembly at 0x3541c8, `not` a 64-bit `nor`).
- **The operand is masked to its low 16 bits before every op** (L252180): -1 is 0xFFFF, 0x10000 is 0.
- **"A change"** is judged by comparing the u16 held with the assignment's **full 32-bit result**, whose low 16 bits
  are stored: `+=` wraps (0xFFFF + 1 stores 0), `*=` can fire with the value unchanged (2 x 0x8001 stores 2), `|=~`
  always fires.
- **The watchers**: each record is `{mask, fn, ctx}`; on a change `FUN_003519f0` calls, in the order added, every
  watcher whose mask holds the event -- 1 when the result is non-zero, 2 when it is zero -- as `fn(valve, ctx)`, not
  told the event (L250795-250796).

Sprint 5's ARMORY code (`viewer/src/uiScript.ts` `valveTest`/`valveAssign`, a per-context map without watchers)
follows the first reading; PLAT-34's fold replaces it with `@s2u/ui`'s `ValveStore`. **No shipped ARMORY script
exercises a difference**: over the five sets the layout's `SCRIPT_LIBRARY` names in `RUN/UIZANIM.ZAR`, 2,615 VALVE
commands (statements and condition tokens) hold no op 0, no op 9, no operand outside 0..0xFFFF, and two `-=`, both by
1 -- regenerated by `packages/scene/test/armoryValveOps.test.ts` on a dev disc (`SOCOM_DISC` or `SOCOM_PC_ROOT`).

### 1.4 Control flow

- IF / ELSEIF (`FUN_0025e7a0` L108201, `FUN_0025e6d0` L108159): u8 +4 the nest depth (reCOM `m_IF_NestLevel`,
  `zanim.h` 463-481); the condition tokens run from +8 to the command's end. ELSE / ENDIF carry the depth at +4
  (`FUN_0025e6a0` L108149).
- The condition evaluator `FUN_0025e960` (L108286): EXPRESSION byte +4 is 1 NOT, 2 AND, 3 OR, 4 `(`, 5 `)`.
- WHILE (`FUN_0025e630` L108131): u16 +4 flags (bit 1 = no condition, forever), u16 +6 the jump, the condition at +8.
  END_WHILE (`FUN_0025e600` L108121) jumps back by its u16 +6. BREAK `FUN_0025e520` (L108074). LOOP [1, -1] loops
  forever (research 89 §1).
- WAIT: f32 seconds at +8 (`FUN_0025ed50` L108428).
- CALL_ANIMATION (`FUN_0025d5c0` L107485): the name at byte +7; flag **0x200** blocks until the callee ends
  (`FUN_0025d550` L107465). A name no set defines is a no-op. STOP_ANIMATION: the name at byte +4, bit 0 of +5
  (`FUN_0025d490` L107435). CALL_SEQUENCE: the name at byte +4 (`FUN_0025d270` L107342 -> `FUN_00269b00`).
- Sequence words: 0x102 = activation 1 (runs at the animation's start), 0x104 = activation 2 (started by
  CALL_SEQUENCE). Each sequence has its own program counter (`zanim.h` 463-481), so start sequences run concurrently.

### 1.5 Show, move, fade, sound

- **OBJECT_ACTIVE_STATE**: u16 +4 1 = show, else hide; u16 +6 the node.
- **OBJECT_MOTION_FROM_TO** (begin `FUN_0025fe70` L109034-109346, tick `FUN_0025f9b0` L108850-109034): u16 +4 flags,
  u8 +6 node, u8 +8 reference node, +9..+0xb valve names (flag 0x400), u16 +0xc the position block P (P+4 from,
  P+0x10 to, P+0x1c rate; flag 2 = "from" stored, else the current value), u16 +0xe the curve (flags 0x800/0x1000),
  +0x10/+0x20 rotation quaternions (flag 0x40), u16 +0x30 the scale block (from, to at +12, rate at +24; flag 0x100 =
  "from" stored), f32 +0x34 time. Position moves linearly at rate x dt and snaps to "to" at the end (written by
  `FUN_003157d0` L215063, node+0x30); scale goes to the matrix diagonal (`FUN_00315710` L215015). Rotation flag 1 is
  relative (from = current, to = q_to x current), a slerp by t/time (`FUN_00306ae0` L205927: shortest arc, nlerp above
  a dot of 0.95), written by `FUN_00315790` L215052. The command holds its sequence until its time is up.
- **OBJECT_OPACITY_FROM_TO** (begin `FUN_0025f960` L108835, tick `FUN_0025f880` L108804): u16 +4 node, +8 from, +0xc
  to, +0x10 rate, +0x14 time; writes the object's own opacity (object+0x9c).
- **SOUND**: research 81 §6's layout (`FUN_002659c0` L112317). Flag 0x80 = a new play; flag 0x02 places the voice at
  the node in byte +0x10 (L112400); the ARMORY's 0x82 plays carry node 0xF9.

## 2. The layout (`RUN/UI/READERC.ZAR` -> `dlg_equipment_mp.rdr`)

Reader (a) re-derived the layout from the disc and it matches the earlier dump object for object (226 objects, 12
animations, 22 controls, 67 models). Coordinates are on the 640x448 frame; a child's are relative to its parent.

### 2.1 Loader rules

- A key lookup is a depth-first, first-match search of the whole subtree (`FUN_0032f0e0` L230255-230299, used by
  `FUN_0032ee10`/`FUN_0032f0d0`), so **CHILDOF resolves inside SPEC and at object level alike** (`FUN_00383360`
  L278258, CHILDOF at L278331; `FUN_0037da50` L275354). Every `SealNSecText`/`EqNText` row puts CHILDOF outside SPEC.
- XPOS/YPOS are ints (`FUN_0032e970`); OPACITY is a float (default 1).
- MODELS (`FUN_003812b0` L277104-277195): NAME, MODEL, AZIMUTH (default 0), ELEV (default 0), DISTANCE (default
  20.0), ROTX/ROTY/ROTZ (all three written to one field in the decomp), USEMODELUIVAR; a 0x34-byte record.

### 2.2 Header and chrome

- LIBRARIES `ui/assetlib/uimp,wsmp,wslc,UIVAR,EQUIPMENT_LIBRARY`; BACKGROUND IMAGE `multplay_back.tif`; FONT
  `font_text_01`; SCRIPT_LIBRARY `dlg_equipment_mp.rdr, UICharacterProfile.rdr, ShowAndSpin.rdr, uianim.rdr,
  UIHardDiskAnim.rdr`.

| object | type | pos | size / scale | look | text |
|---|---|---|---|---|---|
| `eq_title_back` | IMAGE | (16,15) | 615x46 | `backsolid.tif`, opacity 0.2 | |
| `eq_Lower_back` | IMAGE | (16,399) | 615x32 | `backsolid.tif`, opacity 0.2 | |
| `eq_inst_back` | IMAGE | (16,65) | 615x32 | `brown_back.tif` | |
| `bar_title` | TEXT | (30,65) | 0.95 | `font_titlebar_01`, (83,72,36) | `_15_ARMORY_MSG` |
| `gamename_val` | TEXT | (200,61) | 0.45 | titlebar, (83,72,36) | UIVAR `GAMENAMEVAR` |
| `gamename_val_lan` | TEXT | (200,53) | 0.45 | titlebar, (83,72,36) | UIVAR `GAMENAMEVAR` |
| `OnlyModes` | TEXT | (445,40) | 0.45 | titlebar, (83,72,36) | by script (§3.1) |
| `roomname` | TEXT | (200,46) | 0.6 | titlebar, (83,72,36) | UIVAR `MEDIUS_LOBBY_NAME` |
| `MPgamename` | TEXT | (445,61) | 0.45 | titlebar, (83,72,36) | UIVAR `mission_title` |
| `InstructionText` | TEXT | (320,92) | 0.9, HCENTERED | (91,72,36) | by script |
| `CrossFieldText` | TEXT | (25,427) | 0.9 | (128,128,128) | `_16_PRESS_DONE_MSG` |
| `TriFieldText` (child of CrossFieldText) | TEXT | (+500,+1) | 0.95 | | "`0xAC` BACK" |
| `net_conn_ind_Yel` / `_blue` | IMAGE | (577,25) / (586,34) | 28x28 / 10x12 | `NetMonY.tif` / `NetMonB.tif` | CHILDOF `letterbar`, **absent** from this layout: on the dialog's root (`ABSENT_PARENT_READING`) |

### 2.3 The eight columns (one template)

SEAL columns `Seal1..4` (padlock prefixes Drake / Hutch / Bailey / Dimone); Terrorist columns `Merc1..4` (padlocks
`MercN{LockP,LockS,Lock1,Lock2,Lock3}`). Each column's root `XPrimDummy` is a blank TEXT at (295,155) (Merc scale 0.9),
placed by script (§3.1). Children:

| object | pos | size | look |
|---|---|---|---|
| `EquipXActFrame` | (-10,-50) | 152x290 | `eq_wep_bgHL.tif` |
| `eq_X_win` | (-10,-47) | 150x290 | `backsolid`, opacity 0.25 |
| `eq_X_winAct` | (-10,-47) | 150x290 | `backsolid`, opacity 0.15 |
| portrait `SealN` / `TerrN` | (0,-22) | 130x255 | opacity 0.65, texture from UIVAR `SealN`/`TerrN` (§6) |
| `XText` | (0,-20) | scale 1.2 | (91,72,36); `_6_SEAL_1`, `_8_SEAL_2`, `_9_SEAL_3`, "SAS" (Seal4); `_11/_12/_13_TERRORIST_n`, "PIUS" (Merc4) -- the 4th overwritten by script (§3.1) |
| `XPaneDummy` | (0,130) | 150x17 | its children below |
| panes (5) and Done | (-5, 0/20/40/60/80), Done (-5,113) | 165x21 | `brown_back_real.tif`, opacity 0.7 |
| padlocks (5) | (130, 2/22/42/62/82) | 15x15 | `padlock.tif` |
| texts (5) | (8, 23/43/63/83/103) | scale 0.95 | UIVAR `CharNPrimaryWeaponDescr` / `SecondaryWeaponDescr` / `Equip1..3Descr` |
| `XDoneText` | (8,136) | | `_7_DONE_MSG` |

Locks: `Seal4Dis` (-10,-47) 150x290 `LittleBlack.tif` opacity 0.5 and `Seal4Lock` (20,10) 70x130 `locked.tif`
opacity 0.4, both children of `Seal4PrimDummy`; `Terr4Dis` (-3,-175) 158x290 and `Terr4Lock` (30,-95) are children of
**`Merc4PaneDummy`**, not the PrimDummy.

### 2.4 The weapon area

- `eq_wep_comp_dummy` (475,274) 140x16. Its stat labels at x -100, y 28/51/74/97/120, scale 0.9, spacing 20:
  `Wvolume` `_862_VOLUME`, `Accuracy` `_1_ACCURACY_MSG`, `FRange` `_2_RANGE_MSG`, `FireRate` `_3_FIRE_RATE_MSG`,
  `FireModes` `_4_FIRE_MODES_MSG`. Each of the first four has `wep_range.tif` (100,-18) 140x16 and the bar
  `blue_fill.tif` (100,-15) 140x10, named `eq_wep_comp_bar{,2,3,4}` (checked: bar under Wvolume, bar2 under Accuracy,
  bar3 under FRange, bar4 under FireRate). `FireMode1` (100,0) under FireModes, (255,204,51).
- `WepDescription` TELETYPE (380,298): PULSERATE 10, MAXLENGTH 230, MAXHEIGHT 100, AUTOSCROLL, scale 0.9, INTERVAL
  1330, SPACING 19 (§3.8). The TELETYPE's parser reads no `AUTOSCROLL` (`FUN_00382070` L277677-277697: MAXHEIGHT,
  PULSERATE, SPACING, INTERVAL, MAXLENGTH, NOCURSOR, FADECURSOR): its scroll is MAXHEIGHT's (`FUN_00378c00` L272844-272862).

### 2.5 Controls and buttons

`EquipWeapOpaque` (0,0) is the group root of: `EquipWeapCaptionWin` (375,228) 245x21, `WeapDataCapWin` (365,258)
265x20, `WeapTipCapWin` (15,258) 190x20, `EquipWeapDescWin` (365,257) 265x134, `EquipWeapWin` (365,105) 265x118,
`EquipLoadInfoWin` (15,105) 165x143, `EquipLoadInstCapWin` (185,112) 20x130, `EquipLoadInstWin` (15,258) 190x135 --
all `backsolid` at opacity 0.35. Also: `arrow_lft` (354,219) 35x38 with child `arrow_rt` (+251,0); `arrow_top`
(175,90) 39x35 with child `arrow_dwn` (+1,+138); `weapmodeltext` (500,250) HCENTERED (255,204,51) 0.9; `WepInstText`
WRAPPEDTEXT (25,310) 175x95 scale 0.9 spacing 19; `WeapDataText` (500,280) HCENTERED (255,104,51) 0.95
`_17_WEAPON_DATA`; `CircleFieldText` (15,390); `TipText` (60,280) (255,104,51) `_18_WEAPON_TIPS`.

| button | size | text offset | bindings |
|---|---|---|---|
| `EquipMpSealBtn` / `EquipMpTerrBtn` | 275x25 | 20/25 | ONACTIVATE `OnMp{Seal,Terr}BtnAct`; CROSS `OnMp{Seal,Terr}BtnPress`; LEFT/RIGHT `ActivateMPCharStack{Lft,Rt}`; UP/DOWN `NothingUp`/`NothingDwn` |
| `EquipWeaponBtn` | | | LEFT/RIGHT `OnEquipWeaponBtn{Left,Right}`; UP/DOWN `ActivateMPEquipStack{Up,Down}`; SQUARE `StoringLoadout`; CIRCLE `returnto_Defaults`; TRIANGLE `OnEquipWeaponBtnDefault` |
| `EquipMPDoneBtn` (16,170) | 250x31 | 20/27 | CROSS `OnEquipDoneBtnPress`; UP/DOWN `OnMPEquipDone{Up,Dwn}`; CIRCLE `returnto_Defaults`; TRIANGLE `OnEquipWeaponBtnDefault` |

Screen level: ONSTART runs `UnlockMPChar`, `OnlyModes`, `UiEquipSwitch`, `MPSealPlace`, `MPTypeValveSet`,
`net_monitor`, `UiBackToLobby`; TRIANGLE -> `returnto_lobby`; ON_FORCE_NEW_DB -> `force_new_db`; MP_MEDIUS_ERROR ->
`OnNetError`; MP_SYSTEM_MESSAGE -> `OnSystemMessage`; HDD_ERROR -> `hdd_error`. The glyph bytes the texts use: 0xA6
CROSS, 0xAC TRIANGLE, 0xB4 SQUARE, 0xB7 CIRCLE (§5.4).

### 2.6 The 67 model entries

Names as the rdr spells them (`SatchelUl` included). Four models appear twice (a_smoke_grenadeUI for smoke and red
smoke; UI203HE/SMK/FRAG for the M203 and F2000 rounds). Verts/tris are the 'high' LOD (reader c's decode); textures from
`UI_TXR`.

| entry | model | az/elev/dist | visual nodes | verts/tris | textures |
|---|---|---|---|---|---|
| EquipMark23 | a_mark23UI | 6/1.75/15 | mark23_high | 135/78 | mark03, mark23 |
| Equipa_mark23sd | a_mark23sdUI | 5.5/1.75/15 | mark23sd_high | 158/95 | mark03b, mark23 |
| EquipHkP9s | hkp9sUI | 5.5/1.75/15 | p9s_high | 157/93 | p9s |
| EquipSig226 | sig226UI | 5.75/1.75/15 | sig226_high | 120/74 | sig_p226 |
| Equipberetta_m9 | baretta_m9UI | 5.5/1.75/15 | sig226_high | 133/83 | baretta_m9, mark03 |
| Equipdesert_eagle | desert_eagleUI | 6/1.75/15 | desert_eagle_high | 138/82 | deserteagle |
| Equipglock18 | glock18UI | 6/1.75/15 | glock18_high | 94/60 | glock18 |
| Equipfiveseven | fivesevenUI | 6/1.75/15 | 57_high | 114/76 | fiveseven |
| EquipP228 | p228UI | 6/1.75/15 | M11_high | 123/88 | m11_p228, mark03 |
| EquipGyurza | SP10UI | 6/1.75/15 | sp10_high | 89/84 | sp10_gyuraz, mark03 |
| EquipM16 | m16a2UI | 10.7/3/27 | m16_high_1 | 422/274 | m16, mark03 |
| EquipFNP90 | fnp90UI | 10/3/27 | fnp90_hi | 446/281 | fnp90, mark03 |
| EquipM16203 | m16_M203UI | 11/3/27 | m16_high_1 | 605/358 | m16, mark03 |
| Equipm4Acarbine_203 | m4Acarbine_203UI | 10.5/3/27 | m4_high | 828/480 | m4, mark03 |
| Equipmp5sd | mp5sdUI | 10.6/3/27 | mp5sd_high | 329/231 | mp5, mark03 |
| Equipm4Acarbine | m4AcarbineUI | 11/3/27 | m4_high | 637/377 | m4, mark03 |
| Equipm4Acarbine_SD | m4Acarbine_sdUI | 10.5/3/27 | m4_high | 663/388 | m4, mark03 |
| Equipak47 | ak47UI | 10.6/3/27 | ak_high | 493/309 | ak47, mark03b |
| Equipaks74 | aks74UI | 10.6/3/27 | aks_high | 561/347 | aks74_s, mark03b |
| Equipm14_gun | m14_gunUI | 10.7/3/27 | m14_high | 411/254 | m14, mark03b |
| Equipsig_commando | sig_commandoUI | 10.5/2.75/27 | commando_high/_low, silencer | 581/350 | m4, mark03, mark03b, sig_commando |
| Equipmp5 | mp5UI | 10.6/3/27 | mp5_high | 318/241 | mp5, mark03 |
| Equipuzi | uziUI | 10.5/3/27 | uzi_high | 494/259 | uzi, mark03 |
| Equipremington700 | remington700UI | 10.5/3/27 | rem700_high | 463/285 | remington700, mark03, mark03b |
| Equipm60e | m60eUI | 10/3/27 | m60_high | 815/478 | m60, mark03 |
| Equipstoner_m63a | stoner_m63aUI | 10/3/27 | m63a_high | 667/402 | stoner_m63a, mark03 |
| EquipmcmillanM87 | mcmillanM87UI | 10/3/27 | mac_high | 513/309 | mcmillan_m87, mark03, mark03b |
| Equipstoner_sr25 | stoner_sr25UI | 10/3/27 | sr25_high | 437/256 | stoner_sr25, null_xmas.bmp |
| Equipstoner_sr25_SD | stoner_sr25sdUI | 10/3/27 | sr25_high | 437/258 | stoner_sr25, null_xmas.bmp |
| Equipbarret_lightm82A1 | barretm82A1UI | 11/3.25/30 | m82a1_high | 575/314 | barretm82, mark03 |
| Equipm79 | m79UI | 10/3/27 | m79_high | 430/242 | m79 |
| Equipmglmk1 | mglmk1UI | 9/3/25 | mgl_high | 573/357 | mglmk1/2, handle01, mark03b |
| EquipJhammer | jackhammerUI | 9/2/23 | jackhammer_high | 382/240 | jackhammer |
| Equip870 | remington870UI | 8.5/2/23 | 870_high | 274/206 | remington870 |
| Equipspas | spas12UI | 8.6/2.5/23 | spas_high | 288/228 | spas12 |
| EquipSteyr | steyr_aug9UI | 7.5/2.2/19 | NZ, roundy | 633/324 | steyr, m4, mp5, sig_commando |
| EquipAK105 | ak105UI | 10.6/3/27 | aks_high | 540/338 | aks74_s, drag, mark03b, mcmillan_m87, uzi |
| EquipSA80 | iw80a2UI | 10/2.8/25 | iwa802 | 344/262 | RA14_groza, spas12, mark03 |
| EquipOC14 | RA14_grozaui | 9.6/2.8/25 | ra14_high | 459/329 | RA14_groza, mark03 |
| EquipMP5K | hk5kUI | 9.6/2.6/25 | mp5_high | 372/303 | mp5, mark03 |
| EquipF2000 | BMMG_f2kUI | 9.75/2.2/25 | BMMG_high | 465/344 | BMMG_f2k, mark03 |
| EquipDragunov | DragunovUI | 13.5/3.5/35 | stock, scope | 709/452 | drag, DragBar, +7 shared |
| EquipSig552SD | UIsig_commandoSD | 10/2.8/28 | commando_high, SigSilencer | 581/350 | as sig_commando |
| Equipfrag | grenadeUI | 13/4/35 | g1 | 533/396 | fraggrenade_UI |
| EquipHEgren | HEgrenadeUI | 13/4.5/35 | g2 | 480/360 | HEgrenade_UI, smokegrenade_UI |
| Equipsmoke / EquipRedSmoke | a_smoke_grenadeUI | 13/4.5/35 ; 12/3.4/30 | g2 | 480/348 | smokegrenade_UI |
| Equipflash | flashbangUI | 13/4.5/35 | g2 | 429/350 | flashbang1 |
| Equipsatchel | SatchelUl | 11.3/4.2/30 | g3 | 89/128 | satchel_handle, satchel_tex |
| Equipclaymore | claymoreUI | 11.25/3.5/30 | g3 | 568/370 | Claymore1 |
| Equipc4 | UIc4 | 5.5/1.4/15 | g4 | 279/218 | c4_UI, satchel |
| EquipDoubleAmmo | fiftycal_boxUI | 5.6/1.7/15 | fiftycalbox | 24/12 | 50cal_box_side/top |
| EquipPMN_mine | PMN_mineUI | 9.3/2.6/25 | mine | 115/70 | pmn_mine |
| EquipLAW | AT4UI | 9.2/2.6/25 | tube, scope | 613/435 | laser_designator, mark03 |
| EquipRPG | RPG7UI | 9.7/3/26 | g14, g15, o1, g17 | 621/445 | 9 shared |
| EquipRPGAmmo | RPGrenadeUI | 9.7/3.2/26 | g1 | 72/71 | laser_designator, mglmk2 |
| Equip203HE/SMK/FRAG, EquipF2000HE/SMK/FRAG | UI203HE/SMK/FRAG | 11.5/3.4/30 | g4 | 404/330 | m79HE/smoke/frag_UI |
| EquipGLHE/SMK/FRAG | m79HE_/m79smoke_/m79frag_UI | 11.5/3.4/30 | g4 | 404/330 | m79HE/smoke/frag_UI |
| EquipThermScope | thermal_scopeUI | 11.5/3.4/30 | thermal_high, o2 | 264/208 | BMMG_f2k, mark03 |
| EquipLasDes | LasDes | 12/3.4/30 | laser_high | 297/176 | laser_designator |

`UI_GEO` has 64 models; the dialog cites 63 (`mainmenu_roller` unused). Only `sig_commandoUI` has a low LOD
(`commando_low`, dropped by the `'high'` filter). Named points: sig_commandoUI (firepoint, firepoint_shell, aimpoint,
Gun_box), AT4UI (launcher), RPG7UI (g2), steyr_aug9UI (g15). 66 of 67 cited textures are in `UI_TXR`; `null_xmas.bmp`
(the SR-25s) is not. The earlier reader used a fallback here; the complete original UI library chain is documented below.

#### 2026-10-08 correction: the UI world's second texture library

**Reading.** Independently reread by the review seat on 2026-10-08. The supplied ISO's `RUN/UI/UI.ZED`, key `assetlibs`, names
`//ui/junkyard` followed by `//ui/assetlib/ui`. The corresponding original archive
`RUN/UI/JUNK_TXR.ZED`, key `textures/null_xmas.bmp/texdat`, contains the SR-25 texture.
Its archive SHA-256 is `43c58e9ae043aa5eb4e730cf0e12e43b28becfefa920292ff971778624d70cf3`.
It decodes through `parseTextureRecord`/`decodeTexture` with an empty palette table,
without diagnostics. No `RUN/UI/JUNK_PAL.ZED` is present. This is a missing reader input,
not a missing game asset. Use the UI copy, not one of the maps' differently hashed
`JUNK_TXR.ZED` archives. `armoryData.test.ts` compares the loaded texture's decoded
pixels with a fresh decode of that original UI member. Original-running visual
comparison remains unperformed; the archive and pixel checks do not establish it.

### 2.7 Where a text stands (the polish pass, 2026-10-01)

The owner's play-test (2026-10-01) saw the row highlight above its row's text, "ASSAULT RIFLE: 552" and WEAPON DATA low in
their caption bars, the instruction strip low in its bar and the stat labels below their bars. All four were one rule:
S3 had read a TEXT's `YPOS` as its letters' foot (`UI_OBJECT_TEXT_ORIGIN_READING`, retracted). By source it is the
bottom of the face's cell (`UI_TEXT_ORIGIN`, `viewer/src/armoryLayout.ts`):

- **The pen.** The text draw `FUN_00362900` (L260663-260706) takes the pen as `int(node x + offset)`,
  `int(node y + offset)` (+0x90/+0x7c, +0x94/+0x80); HCENTERED (the spec's +0x19, copied to the node's +0x69 by
  `FUN_003792f0` L273037) takes `0.5 x` the measured width off x, RIGHT_JUSTIFIED (+0x1a, +0x6a) the whole width
  (L260684-260691), the result truncated. The width is `FUN_00362b70`'s: the glyphs' `int((W - 1) x S + 0.5) +
  xspacing` summed (L260726-260800), the same advance the pen moves by. So a centred line's anchor is its own centre
  at `XPOS`, not a box's: `weapmodeltext` and `WeapDataText` (XPOS 500) sit 2.5 px right of their bars' centre
  (`EquipWeapCaptionWin` 375+245/2, `WeapDataCapWin` 365+265/2 = 497.5), as shipped.
- **The cell.** `FUN_00361bd0` (L260374-260460) puts a glyph's corners at the pen's y + (baseline - DispPos.y - h) x S
  and that + h x VertScale x S. The letters carry baseline 0 and DispPos.y 0, so their cell hangs from the pen's y:
  its bottom on `YPOS`, its top `cell x S x 448/480` above. The atlases (decoded off the disc,
  `viewer/test/armoryPolish.test.ts`) put `font_text_01`'s capitals on rows 5-20 of 25 and `font_titlebar_01`'s on
  9-38 of 51: the letters' foot stands 5 (13) rows x S x 448/480 above `YPOS`.
- **The calibration.** The console's own lobby (`logs/parity/s4_pcsx2/A_54_gamelobby2.png`, a 640x480 grab of the 448-row
  frame) against `dlgGameLobby.rdr` (READERC.ZAR) drawn through `armoryQuads`: the boxes land on their rdr rows x 480/448
  (`eq_title_back` 15-61 at 16-65, `DescChatBack` 66-90 at 70-96, so the dialogs' coordinates are the 448 frame's), and
  with the cell-bottom rule BACK / SELECT / VOICE CHAT ALL (432, 0.95), SEALS / TERRORISTS (240, 0.9), "Text chat." and
  "to scroll chat" (120, 1.0) and the HCENTERED "`0xA6` Select character and weapons." (320, 90, 0.9) land within one
  grab row of the console's, the cross glyph and the L1 glyph on their rows exactly (columns too: the centring and the
  pad glyph's advance match within a column). Read as a foot, every one sat 5-6 grab rows low and the title 12.
  The side-by-side image is the polish report's, not the tree's.
- **What moved in the ARMORY.** Every TEXT, TELETYPE and WRAPPEDTEXT line rises 5 x S x 448/480 + 0.3 (4.7 px at
  0.95), the titlebar face's 10.2 x S x 448/480 + 0.3 (9.3 px): the Primary row's text now sits in its 21-row pane
  (110-131: letters 115.3-128.6), the captions in their bars, the strip in its bar (65-97: letters 75.2-87.8), each
  stat label on its bar's row (VOLUME's letters 285.2-297.8 on the bar's 287-297) and FIRE MODES above the panel's
  foot (391). The TELETYPE cursor was already the code's, relative to the pen (`CURSOR_DROP` -5): it now meets the
  letters' foot. The residual is `UI_TEXT_ORIGIN_RESIDUAL_READING` (§8).
- **Not the frame.** The title row cut off in the owner's screenshot is not the frame's origin: the frame's row 0 is
  the canvas's top in both views (`armoryView` `Y(y) = y x H/448`), and the title's letters stand on rows 28-54. The
  screenshot shows the frame from row 58 down, its rows 0-57 under the site's own bar (`#site-links`, fixed over the
  canvas) or outside the grab: `ARMORY_CHROME_OVERLAP_READING` (§8).

### 2.8 The original's frames (the owner's PCSX2 captures, 2026-10-01)

The owner supplied two PCSX2 captures of the original ARMORY, online on Crossroads (MP72) as a Terrorist, not committed
(game imagery): `orig-armory-select.png` (the character select) and `orig-armory-weapon.png` (the Primary row), each a
crop of the frame scaled 1.159 x 1.160 (fitted on `eq_title_back` 16-631 x 15-61 and `eq_Lower_back`, within half a
row). Drawn through `armoryQuads` on the disc's MP72 and compared element by element, they settle:

- **The text rules of §2.7** -- every caption, row, label, header and kit within 0-2 rows and columns of the console's
  (edges; letter centroids within +-1 but the titlebar face's +1.2). Two more rules came off them, both sourced:
  - *the face's opacity*: a text at full opacity draws at its face's `opacity` (0.7 on both faces), `FUN_00362b20`
    (L260712-260724); the letters peaked at 0.67-0.73 of ours before, the bitmaps at 1.0 (`textAlpha`);
  - *the multi-line lift*: a TELETYPE's or WRAPPEDTEXT's lines stand `DAT_003e0390` (-5) rows above the single-line
    rule (the TELETYPE cursor's own row, `FUN_00378c00` L272877-272887): WEAPON TIPS' feet on rows 300/319/338 in the
    capture, 305/324/343 before (`LINE_LIFT`; the WRAPPEDTEXT draw itself is `MULTILINE_LIFT_READING`).
  - The glyphs' rows are whole: `FUN_00361bd0` truncates each corner (`(int)` before the GS's 4 fraction bits), the
    lower after + 0.5.
- **The item names**: the panes, the rows and the column kits show each item's `Description` (FRAG, HE GRENADE),
  `FUN_002af190` through `FUN_003d2820` (`ARMORY_PANE_TEXT_READING`, answered).
- **The 4th column** (R95.6 corrected): Crossroads' 4th Terrorist is ALG OFFICER under `Terr4Dis` + `Terr4Lock` --
  the map's `mission.rdr` sets `InWhichAOP` 70 and `SetOfficer` is 0. `armoryTypeAllowed` takes the map (`kits` and
  `valves`): the room and the local match refuse the 4th type wherever `InWhichAOP` is not 0; the page hands the map's
  `InWhichAOP` to the scripts, which caption and lock the column, and the pad steps over it. *Owner-ruled: unlocked
  (OT.R91, 2026-10-31; an owner-ruled departure from the original, MISSION).* `CAMPAIGN_UNLOCKS_EARNED_RULING`
  (`scene/src/armoryCharacters.ts`) reads the eight `Set<Name>` valves as 1: the room, the bots and the local match
  allow the 4th type on every map, and the page seeds its scripts with them, so `UnlockMPChar` takes its own unlocked
  branch -- the column keeps the unlockable's caption (ALG OFFICER, SAS (REAVER) ...), `Seal4Dis/Lock` and
  `Terr4Dis/Lock` hidden, `DisableFourthChar` 0. The reading above (what the original does) is unchanged.
- **Residuals** (ours minus the capture, frame pixels, ink edges): the title +2 at its top, the rows 0-1, the captions
  and labels +1, the kits 0-1, BACK +1, the column headers +2 at their tops; across, left edges 1-2 left and right
  edges 0-3 right (our glyph quads a little wider: the HUD's fitted `PEN_NUDGE` kept, `UI_TEXT_ORIGIN_RESIDUAL_READING`).
  The gold selection frame (`EquipXActFrame`, `eq_wep_bgHL.tif` 128x256 with a 3-texel border) draws 3.5 px wide on
  ours and 2 px in the capture (`ACT_FRAME_BORDER_READING`).

## 3. The scripts

### 3.1 Start-up (ONSTART; the start sequences run concurrently)

- `MPTypeValveSet`: `ArmoryType=1` (the MP branch of every shared script; 0 is single-player).
- **`UnlockMPChar`** (eq/UnlockMPChar@28-1564) picks the 4th character by `player_team` (0 SEAL, 8 Terrorist) and
  `InWhichAOP`. All eight `Activate*Seal/Terr` valves are reset to 0 first.

  | InWhichAOP | SEAL 4th (unlock valve) | Terrorist 4th (unlock valve) |
  |---|---|---|
  | 50 | "SAS (SABRE)" (SetSabre) | "PIUS" (SetPius) |
  | 60 | "FERAL" (SetFeral) | "QUIXADA" (SetQuixada) |
  | 70 | "SAS (REAVER)" (SetReaver; also ActivateAlgSeal=1) | "ALG OFFICER" (SetOfficer) |
  | 80 | "SPECIALIST" (SetSpecialist; also ActivateRussSeal=1) | "VALESKA" (SetValeska) |
  | 0 | "SEAL 4", always unlocked | "TERRORIST 4", always unlocked |

  Unlock valve == 1 hides `Seal4Dis/Lock` (`Terr4Dis/Lock`) and sets `DisableFourthChar=0`; otherwise it shows them and
  sets `DisableFourthChar=1`. `InWhichAOP` is set to 0 by the main menu (`SetMenuValve`, `CallExtras`) and to 50-80 by
  `dlgMissionSelection` -- and, **online, by the map**: each MP map's `mission.rdr` `Valves` carry it (§2.8; R95.6 as
  corrected), so on maps 51-83 the row is the AOP's and the 4th column is locked without the campaign.
  The `Set*` valves come from `dlgDebriefing TestForCompletionLevel`: the "3" characters need `incr_miss_` >= 3 on all
  three missions of the AOP (Sabre 51-53, Quixada 61-63, Reaver 71-73, Specialist 81-83), the "2" characters >= 2
  (Pius, Officer, Valeska), Feral `GameComplete > 4`.
- **`OnlyModes`**: `EQlimit` 1..4 captions UIMnLOC 19 "Pistols Only", 20 "Shotguns Only", 21 "Snipers Only", 22 "No
  Bombs"; else blank.
- **`UiEquipSwitch`** (eq@28-704): `TurnOnPadlocks1`; when `EQlimit==0` and `CharacterProfile` mode 2 ("exists") is
  true, the stored character's caption becomes "CUSTOM" (24), else `MpCharSet` = 1 (SEAL) or 5 (Terrorist); then
  `Ui_MP_{SEAL,MERC}_EquipStart`: hide every winAct, portrait, arrow, `EquipWeapOpaque` and `eq_wep_comp_dummy`; show
  the side's four PrimDummies; `DoChooseSelection=1`; when `EQlimit>0` `SetMPWeaponValves` then
  `SetMPCharWeaponValves` (§3.5); blank `CrossFieldText`; `TurnOffWeaponModels` / Seal / Merc elements;
  `ActivateButton("EquipMp{Seal,Terr}Btn")`.
- **`MPSealPlace`, the slide-in** (eq/MPSealPlace@28-2072, checked): all eight PaneDummies jump from (-200,-40) to
  **(-8,129)** in 0.001 s; then the side's columns appear one at a time, each shown just before its move, in the order
  4, 3, 2, 1, each from **(-225,145)** to **(490 / 335 / 180 / 25, 150)** in **0.1 s**, linear (0.4 s in all).
- **`UiBackToLobby`**, the pull-out (§4.1).

### 3.2 Character select (`EquipMp{Seal,Terr}Btn`)

- **ONACTIVATE** `OnMp{Seal,Terr}BtnAct`: hide every winAct and ActFrame, show the side's portraits; for `MpCharSet`
  (1-4 SEAL, 5-8 Terrorist) set `UiCharSet` = 1/2/4/8 (SEAL) or 16/32/64/128 (Terrorist); `InstructionText` = UIMnLOC
  34/35/36 "Select SEAL n" or 30/31/32 "Terrorist n", the 4th character `SetChar4Name`'s literal per AOP; show
  `eq_X_winAct` and `EquipXActFrame`; show `gamename_val_lan` when `ComeFromLan==1`, else `gamename_val`.
- **LEFT/RIGHT** `ActivateMPCharStack{Lft,Rt}`: `SuspendMenuInput` "2.0" / "3.0" at the start and "0" at the end;
  `.DINK`; `MpCharSet` -/+1 wrapping in 1..4 (5..8), skipping 4 (8) when `DisableFourthChar==1`; then BtnAct.
- **UP/DOWN** `NothingUp`/`NothingDwn`: `.DINK` only.
- **CROSS** `OnMp{Seal,Terr}BtnPress`, two concurrent sequences. seq 0: `.DINK`, `SuspendMenuInput` "0.5",
  `IDFromBriefing=1`, `TurnOffSealElements` (wait), `CrossFieldText` = 16 ("SELECT DONE TO RETURN TO THE GAME LOBBY"),
  `WepDescription` and `InstructionText` blanked. seq 196: `UpdateSelItemValves`, `ChangeCharacterType("n")`; the other
  three columns drop from y=140 (SEAL) or y=150 (Terrorist) to **y=550** in 0.2 s (0.15 s for column 3); WAIT 0.2 s;
  the chosen column hides its ActFrame and slides to **x=220** (0.1 s; 0.15 s for column 4); its PaneDummy moves
  (-8,129) -> (-200,-40) in 0.1 s, which puts the panes into `EquipLoadInfoWin`; DoneText shown; the row becomes
  Primary, or Secondary when `EQlimit==1`.
- **TRIANGLE**: no control binding, so the screen's `returnto_lobby` applies (`.DINK`, switch to the lobby);
  `ARMORY_BUTTON_PRECEDENCE_READING`. CIRCLE and SQUARE are unbound here.

### 3.3 The rows (`EquipWeaponBtn`; `UiLastEquipClassBtn` 1 primary, 2 secondary, 3-5 equipment 1-3, 6 DONE)

- `On{MpPrimary,MpSecondary,MPEquipEquip1..3}Btn`: `WepInstText` on, `PulseArrows`, `CrossFieldText` 16, `arrow_top`
  / `weapmodeltext` / `WepDescription` / `EquipWeapOpaque` on; `eq_wep_comp_dummy` **1 for primary and secondary, 0
  for the equipment rows**; Seal/Merc elements off (wait); `TurnOnInstructions`; the row's pane on;
  `ActivateButton("EquipWeaponBtn")`; `UiWeapon` = `primsel` / `secsel` / `equip{1,2,3}sel`; `CallShowAndSpin`.
  `arrow_lft=1` is set only by Primary and Equip3; the other rows leave it as it was. Equip3 in a restricted mode shows
  255 (FULL_SLOT) when `Enable_c4` is not above 9 (SEAL) or 17 (Terrorist); in mode 4 it shows 49 (AN-M8).
- `TurnOnInstructions`: UIMnLOC 39 "`0xB4` STORE LOADOUT `0xB7` SELECT DEFAULT WEAPONS" when `ComeFromLan==0 &&
  EQlimit==0`, else 40.
- **UP/DOWN** `ActivateMPEquipStack{Up,Down}`: `.DINK`, then ScrollUp/ScrollDwn (with wait) until `UiWeapon < 253` or
  the row is DONE; rows 1 -> 2 -> ... -> 6 cyclic, a row whose value is 253-255 skipped.
- **DONE row** `OnMPEquipDoneAct`: `ActivateButton("EquipMPDoneBtn")`; `InstructionText` = the literal "`0xA6` Accept
  loadout and return to game lobby. `0xB7` SELECT DEFAULT WEAPONS" (not id 41); models, `WepDescription`,
  `WepInstText`, `arrow_lft` off; `arrow_top` on; `CrossFieldText` blank; the Done pane on. CROSS
  `OnEquipDoneBtnPress`: `.DINK`, switch to the lobby.
- **SQUARE** `StoringLoadout`, only when `ComeFromLan==0 && EQlimit==0`: `SuspendMenuInput` "4.0", `.DINK`, captions
  reset, "CUSTOM" (24) on `MpCharSet`'s column, `CharacterProfile` mode 1 (store), `SaveCharacterProfile` (modes 3 and 4;
  its second sequence waits 3 s then stops), `KILLPOPUP`, `SuspendMenuInput` "0". No popup is opened;
  `_23_StoringChar_MSG` is not referenced.
- **CIRCLE** `returnto_Defaults` (`SuspendMenuInput` 2.3, **no sound**): `EQlimit==0` -- captions reset,
  `ChangeCharacterType(MpCharSet)`, the 4th name re-applied, `ChooseDefaultEquipment`, `UpdateSelItemValves`,
  `CharacterProfile` mode 7 (clears the record's valid byte), `SaveCharacterProfile` (wait), `UiWeapon` = the row's
  selection, `CallShowAndSpin`. `EQlimit==4`: `ChooseDefaultEquipment` + the mode valves. `EQlimit` 1-3: the mode
  valves only.
- **TRIANGLE** `OnEquipWeaponBtnDefault`: MENUFADER opacity 0 -> 0.7 in 0.05 s; popup text 1245 ("return to the
  character select screen with the selected loadout?"), buttons 246 NO at (230,95) and 253 YES at (60,95), 50x25; wait
  until `AreYouSure != 0`; 2 fades back and runs `OnMPWeaponBtnTriangle` (`.DINK`, stop `PulseArrows` and
  `ShowAndSpin`, hide the models, re-run EquipStart and `MPSealPlace`, the kit kept); 1 fades back only
  (`ARMORY_CONFIRM_VALUE_READING`).

### 3.4 Left/Right on a row, and the scroll order

`OnEquipWeaponBtn{Left,Right}` (sas@28-3532):
1. `SuspendMenuInput` "5", `.SLIDE`, `DoChooseSelection=1`.
2. **Refusals** (no move): the shown item (35 2X / 36 M67 / 42 C4 / 54 satchel / 53 red smoke) has lock bit 16 (SEAL)
   or 32 (Terrorist) in its `Enable_` valve; or `DoAllSelCharsHaveLockedEquip{1,2,3}` holds for the row
   (`FUN_002815d0` L127927-128062 / `FUN_00281950` L128063-128100).
3. Else loop `ScrollRight`/`ScrollLeft` (with wait) until the item is acceptable: not a duplicate of another equipment
   slot (only 2X, LAW, RPG-7, thermal, C4, satchel, PMN and claymore refuse a duplicate; the grenades repeat), and
   `CanCharactersSelectUIWeapon` (`FUN_00280d60` L127687-127737 -> `FUN_00280e90` L127738-127786) accepts it.
4. Restart `ShowAndSpin`; `SuspendMenuInput` "0.2".

Scroll order (Left is the exact inverse of Right, checked by reader a):
- Primaries 1 -> 2 -> 3 -> 4 -> 5 -> 7 -> 8 -> ... -> 15 -> 17 -> ... -> 34 -> 65 -> 1 (ids 6 and 16 do not exist).
- Secondaries 75 -> 76 -> ... -> 85 -> 75.
- Equipment 35 -> 36 -> ... -> 57 -> 0 (empty) -> 35.

A step stops on the first item whose `Enable_` valve admits the side: primaries and pistols need **exactly** 9, 1
(team 0) or 8 (team 8), so a valve carrying a lock bit is skipped; equipment uses the bit tests `&1` / `&8`. UI 40 (the
RPG round) is gated by `Enable_RPG`, not `Enable_RPG_ammo`.

**UI index <-> item id** (`FUN_003d3230` L325703-325934), used by the scripts: 35 = 194 (2X), 36 = 121, 37 = 126,
38 = 158, 39 = 123, 40 = 186, 41 = 153, 42 = 151, 43/44/45 = 171/173/175, 46/47/48 = 179/178/176, 49 = 122, 50 = 145,
51 = 146, 52 = 195, 53 = 127, 54 = 152, 55/56/57 = 181/182/183, 252 = 141, UI 255 = FULL_SLOT (id 254), UI 0 = empty
(id 255).

### 3.5 Mode restrictions (`EQlimit`, set by Create Game `SetEQ_limit_valve`, cycling 0 -> 4)

`SetMPWeaponValves` rewrites the `Enable_` valves (Pistols: SEAL pistols 1, Terrorist pistols 8; Shotguns: spas /
jack / 870 = 9; Snipers: M82 / M87 / SR-25 / SR-25 SD / M40A1 / Dragunov = 9; every mode: flash, smoke and 2X = 9;
frag, HE, 203, GL, PMN, RPG, LAW and satchel = 0). `SetMPCharWeaponValves` forces the kit on all four characters of the
side (`UiCharSet` 15 or 240), then maps `MpCharSet` 1..8 back to `UiCharSet` 1 / 2 / ... / 128:

| EQlimit | mode | SEAL kit (primary / secondary / eq1 / eq2 / eq3) | Terrorist kit |
|---|---|---|---|
| 1 | Pistols | FULL_SLOT / Mark 23SD / Mark141 / AN-M8 / C4 if `Enable_c4 > 9` else FULL_SLOT | FULL_SLOT / F57 / Mark141 / AN-M8 / C4 if `> 17` |
| 2 | Shotguns | Spas 12 / FULL_SLOT / 2X / AN-M8 / C4 or FULL_SLOT | JACKHAMMER / FULL_SLOT / 2X / AN-M8 / C4 or FULL_SLOT |
| 3 | Snipers | M87ELR / FULL_SLOT / 2X / AN-M8 / C4 or FULL_SLOT | M82A1A / FULL_SLOT / Mark141 / AN-M8 / C4 or FULL_SLOT |
| 4 | No Bombs | primary kept; eq1 2X, eq2 Mark141, eq3 C4 or AN-M8 | the same |

In every restricted mode Square still stores (online), but `UiEquipSwitch` does not load the profile. The viewer now
receives CREATE GAME's trusted `EQlimit` through the room and page. Shared mode programs drive its ARMORY and
spawn, preserving No Bombs firearms on reopen ([research 362](362-equipment-limits.md) §§1-3, reviewed reading).
The former fixed-zero `ARMORY_MODE_READING` is retired in §8.

### 3.6 Padlocks (`ShowAndSpin` `TurnOnPadlocks1/2/3`)

All padlocks are cleared first. The P and S padlocks light on every column when `primsel==255` or `secsel==255`.
Equipment slot k: `UiCharLocked` bits 1 / 2 / 4 / 8 light **Drake / Hutch / Dimone / Bailey** `{k}Lock`, bits
16..128 Merc1..4 `Lock{k}`. **The shipped swap** (checked, sas/TurnOnPadlocks1@516-588 against the layout): bit 4
(SEAL 3) lights `Dimone1Lock`, a child of `Seal4PaneDummy`, and bit 8 (SEAL 4) lights `Bailey1Lock`, a child of
`Seal3PaneDummy` (`ARMORY_PADLOCK_SEAL34_SWAP_READING`). The `UiCharLocked` bits come from `FUN_002815d0`, which sets
`UiCharSet` to 0xff in MP for the call (`DAT_0045a0c1`). Refreshed at start and on every `ShowAndSpin`.

### 3.7 `ShowAndSpin`, per item (sas/ShowAndSpin@28-53372)

The same skeleton for every item: `TurnOffWeaponModels` (wait); `CallWeaponTips` (wait) when `ArmoryType==1`; the
choose logic (`DoChooseSelection==1` -> `Choose<slot>(name)`; else `DoAllSelCharsHave<slot>(name)` -> `Choose<slot>`;
else `.NEG` + `CallCharDisclaimer`); the caption into `weapmodeltext`, `ACTIVE <model>=1`, the `FireMode1` caption,
the four bars, `TurnOnPadlocks1`. A failed Choose plays **`.NEG`** and types the refusal into `WepDescription` (§4.3).

The bars are **x-scales** of the 140-px `blue_fill` bars set in 0.001 s (flags 0x300, scale (0,1,0) -> (v,1,0)): bar
= VOLUME, bar2 = ACCURACY, bar3 = RANGE, bar4 = FIRE RATE. Fire-mode ids: 5 SINGLE-BURST-AUTO, 1026 SingleBurst, 1032
SingleAuto, 1036 SINGLE, 1038 AUTO, 1053 SemiAuto. "tip" is the id `CallWeaponTips` writes into `WepInstText`; "desc"
the id `ShowAndSpin` types into `WepDescription` (guns type " " and show the bars instead).

**Primaries** (`Primary(<name>)`):

| UI | name | model (az/el/dist) | caption | fire mode | VOL/ACC/RNG/ROF | tip | notes |
|---|---|---|---|---|---|---|---|
| 1 | M16A2 | m16a2UI (10.7/3/27) | 1025 | 1026 | .15/.56/.75/.88 | 1179 | |
| 2 | HK5SD | mp5sdUI (10.6/3/27) | 1027 | 5 | .04/.68/.44/.91 | 1180 | |
| 3 | HK5 | mp5UI (10.6/3/27) | 1028 | 5 | .21/.70/.48/.88 | 1181 | |
| 4 | AK-47 | ak47UI (10.6/3/27) | 1029 | 5 | .36/.59/.56/.73 | 1182 | |
| 5 | AKS-74 | aks74UI (10.6/3/27) | 1030 | 5 | .90/.73/.59/.68 | 1182 | |
| 7 | M14 | m14_gunUI (10.7/3/27) | 1031 | 1032 | .90/.62/.75/.85 | 1183 | |
| 8 | 552 | sig_commandoUI (10.5/2.75/27) | 1033 | 5 | .22/.71/.63/.73 | 1184 | |
| 9 | 9mm Sub | uziUI (10.5/3/27) | 1034 | 5 | .26/.46/.26/.85 | 1186 | |
| 10 | M40A1 | remington700UI (10.5/3/27) | 1035 | 1036 | .45/.94/.83/.20 | 1187 | |
| 11 | M60E3 | m60eUI (10/3/27) | 1037 | 1038 | .33/.40/.56/.73 | 1188 | |
| 12 | M63A | stoner_m63aUI (10/3/27) | 1039 | 1038 | 1/.45/.50/.85 | 1189 | |
| 13 | SR-25 | stoner_sr25UI (10/3/27) | 1040 | 1036 | .39/.90/.71/.68 | 1190 | |
| 14 | SR-25 SD | stoner_sr25sdUI (10/3/27) | 1041 | 1036 | .06/.92/.71/.68 | 1191 | |
| 15 | M82A1A | barretm82A1UI (11/3.25/30) | 1042 | 1036 | .40/.65/1/.09 | 1192 | |
| 17 | M87ELR | mcmillanM87UI (10/3/27) | 1043 | 1036 | .53/.65/.96/.15 | 1193 | |
| 18 | M4A1 | m4AcarbineUI (11/3/27) | 1044 | 5 | .30/.69/.63/.88 | 1194 | |
| 19 | M4A1-M203 | m4Acarbine_203UI (10.5/3/27) | 1045 | 5 | .20/.63/.63/.85 | 1195 | `Enable203Equip`; refusal text + `.NEG` |
| 20 | M4A1 SD | m4Acarbine_sdUI (10.5/3/27) | 1046 | 5 | .03/.80/.50/.88 | 1196 | |
| 21 | M79 | m79UI (10/3/27) | 1047 | 1036 | .91/.68/.53/.48 | 1197 | `EnableGLEquip`; refusal text + `.NEG` |
| 22 | MGL | mglmk1UI (9/3/25) | 1048 | 1036 | .91/.68/.53/.74 | 1198 | `Enable203Equip`; refusal text + `.NEG` |
| 23 | F90 | fnp90UI (10/3/27) | 1049 | 5 | .26/.55/.50/.91 | 1199 | |
| 24 | M16A2-M203 | m16_M203UI (11/3/27) | 1050 | 1026 | .17/.50/.75/.88 | 1200 | `Enable203Equip`; refusal text + `.NEG` |
| 25 | JACKHAMMER | jackhammerUI (9/2/23) | 1051 | 1032 | .17/.59/.16/.34 | 1201 | |
| 26 | Spas 12 | spas12UI (8.6/2.5/23) | 1052 | 1053 | .20/.63/.16/.23 | 1201 | |
| 27 | 870 | remington870UI (8.5/2/23) | 1054 | 1036 | .23/.70/.15/.14 | 1202 | |
| 28 | Steyr Aug | steyr_aug9UI (7.5/2.2/19) | 1055 | 1032 | .23/.53/.50/.95 | 1203 | |
| 29 | AK-105 | ak105UI (10.6/3/27) | 1056 | 5 | .50/.76/.63/.78 | 1179 | |
| 30 | SA-80 A2 | iw80a2UI (10/2.8/25) | 1057 | 1032 | .18/.52/.75/.92 | 1204 | |
| 31 | KBP OTs-14 Groza | RA14_grozaui (9.6/2.8/25) | 1058 | 5 | .50/.69/.61/.85 | 1205 | |
| 32 | MP5K | hk5kUI (9.6/2.6/25) | 1059 | 5 | .20/.60/.18/.88 | 1206 | |
| 33 | F2000 | BMMG_f2kUI (9.75/2.2/25) | 1060 | 1036 | .26/.65/.63/.64 | 1207 | `EnableF2000Equip` |
| 34 | Dragunov | DragunovUI (13.5/3.5/35) | 1070 | 1036 | .83/.85/.75/.68 | 1208 | |
| 65 | 552SD | UIsig_commandoSD (10/2.8/28) | 1071 | 5 | .14/.62/.50/.73 | 1185 | |

**Secondaries** (`Secondary(<name>)`):

| UI | name | model (az/el/dist) | caption | fire mode | VOL/ACC/RNG/ROF | tip |
|---|---|---|---|---|---|---|
| 75 | Mark 23 | a_mark23UI (6/1.75/15) | 1072 | 1036 | .17/.65/.18/.51 | 1225 |
| 76 | Mark 23SD | a_mark23sdUI (5.5/1.75/15) | 1073 | 1036 | .03/.55/.16/.56 | 1226 |
| 77 | 226 | sig226UI (5.75/1.75/15) | 1074 | 1036 | .14/.47/.14/.34 | 1227 |
| 78 | 9mm Pistol | hkp9sUI (5.5/1.75/15) | 1075 | 1036 | .03/.62/.12/.51 | 1228 |
| 79 | Model 18 | glock18UI (6/1.75/15) | 1076 | 1032 | .21/.20/.13/.51 | 1229 |
| 80 | F57 | fivesevenUI (6/1.75/15) | 1077 | 1036 | .19/.52/.18/.56 | 1230 |
| 81 | M9 | baretta_m9UI (5.5/1.75/15) | 1078 | 1036 | .19/.38/.14/.51 | 1240 |
| 82 | DE .50 | desert_eagleUI (6/1.75/15) | 1079 | 1036 | .24/.29/.25/.56 | 1241 |
| 83 | Designator | LasDes (12/3.4/30) | 1080 | -- | no bars (`eq_wep_comp_dummy=0`); desc 1081 | 1242 |
| 84 | P228 | p228UI (6/1.75/15) | 1082 | 1036 | .15/.44/.15/.56 | 1243 |
| 85 | SR-1 Gyurza | SP10UI (6/1.75/15) | 1083 | 1036 | .20/.43/.21/.56 | 1244 |

**Equipment** (`Equip1/2/3(<name>)`; `eq_wep_comp_dummy=0`, no bars; the desc is typed):

| UI | name | model (az/el/dist) | caption | tip | desc |
|---|---|---|---|---|---|
| 35 | Double Ammo Load | fiftycal_boxUI (5.6/1.7/15) | 1084 | 1209 | 1085 |
| 36 | M67 | grenadeUI (13/4/35) | 1086 | 1210 | 1087 |
| 37 | HE | HEgrenadeUI (13/4.5/35) | 1088 | 1211 | 1089 |
| 38 | PMN Mine | PMN_mineUI (9.3/2.6/25) | 1161 | 1221 | 1162 |
| 39 | Mark141 | flashbangUI (13/4.5/35) | 1092 | 1213 | 1093 |
| 40 | RPG (ammo) | RPGrenadeUI (9.7/3.2/26) | 1171 | 1214 | 1172 |
| 41 | Claymore | claymoreUI (11.25/3.5/30) | 1096 | 1215 | 1097 |
| 42 | C4 | UIc4 (5.5/1.4/15) | 1098 | 1216 | 1099 |
| 43 | M203 HE | UI203HE (11.5/3.4/30) | 1100 | 1217 | 1150 |
| 44 | M203 SMOKE | UI203SMK (11.5/3.4/30) | 1151 | 1218 | 1152 |
| 45 | M203 FRAG | UI203FRAG (11.5/3.4/30) | 1153 | 1219 | 1154 |
| 46 | GL FRAG | m79frag_UI (11.5/3.4/30) | 1155 | 1220 | 1156 |
| 47 | GL SMOKE | m79smoke_UI (11.5/3.4/30) | 1157 | 1220 | 1158 |
| 48 | GL HE | m79HE_UI (11.5/3.4/30) | 1159 | 1220 | 1160 |
| 49 | AN-M8 | a_smoke_grenadeUI (13/4.5/35) | 1090 | 1212 | 1091 |
| 50 | LAW | AT4UI (9.2/2.6/25) | 1163 | 1222 | 1164 |
| 51 | RPG LAUNCHER | RPG7UI (9.7/3/26) | 1165 | 1223 | 1166 |
| 52 | Thermal Scope | thermal_scopeUI (11.5/3.4/30) | 1167 | 1224 | 1168 |
| 53 | RED SMOKE GRENADE | a_smoke_grenadeUI (12/3.4/30) | 1169 | -- | 1170 |
| 54 | Satchel | SatchelUl (11.3/4.2/30) | 1094 | -- | 1095 |
| 55 | F2000 HE | UI203HE (11.5/3.4/30) | 1173 | -- | 1174 |
| 56 | F2000 SMOKE | UI203SMK (11.5/3.4/30) | 1175 | -- | 1176 |
| 57 | F2000 FRAG | UI203FRAG (11.5/3.4/30) | 1177 | -- | 1178 |

UI 0: `weapmodeltext` "NONE". UI 254 "LAW HEAT" and 255 "FULL_SLOT" blank both texts. LAW (50) and RPG launcher (51)
print the two-slot refusal texts; satchel (54) "EQUIPMENT SLOTS FULL". The "available only to SPECTER" literals are the
single-player branch (`ArmoryType==0`).

### 3.8 The spin, the arrows, the typed-out description

- **Spin** (the same for all 67; checked at sas@1232/2016/2800): `MOVE fl=0x61`, 3 s, inside `WHILE` forever, rotation
  relative to the current orientation, identity -> q(0,-1,0, w=0.009): 2 x atan2(1, 0.009) = **178.97 deg about -Y per
  3 s = 59.66 deg/s**, one turn in 6.035 s; a true slerp (the dot 0.009 is below 0.95). The screen sense is
  `SPIN_SCREEN_SENSE_READING`.
- **`PulseArrows`**: two concurrent sequences, `arrow_lft` and `arrow_top` each opacity 0.2 -> 0.99 in 0.5 s, then
  0.99 -> 0.2 in 0.5 s, `LOOP` forever; started by every row handler, stopped by `OnMPWeaponBtnTriangle`.
  `PulseArrows2` (`arrow_up`/`arrow_dwn`) is never called here, and `arrow_up` is absent from the layout. Whether the
  children `arrow_rt`/`arrow_dwn` pulse with their parents: `CHILD_OPACITY_INHERIT_READING`.
- **`WepDescription` (TELETYPE)**: parsed by `FUN_00382070` (L277596, keys L277677-277697; floats INTERVAL, MAXLENGTH,
  SPACING, PULSERATE; int MAXHEIGHT default -1; flags NOCURSOR, FADECURSOR). Runtime init `FUN_00378b00` (L272762):
  +0xdc INTERVAL 1330, +0xe0 MAXLENGTH 230 px (0 means 100000), +0xe4 MAXHEIGHT 100, +0xbc SPACING 19, +0xec PULSERATE
  10 (0 means 1). Tick `FUN_00377b80` (L272243-272535): dt x the global `DAT_003e0388` = 1.0 (only
  `SetTtySpeedFactor`, `FUN_0037b980` L274344, changes it, and no disc script calls it; the other writer, L263463, also
  sets 1.0); a cursor distance (+0xe8) grows by dt x INTERVAL x text scale x parent scale -- **1197 px/s** at scale 0.9;
  the next glyph is appended when the cursor passes the typed width; whole words wrap at MAXLENGTH 230; `\n` and `#N`
  break the line, `#P<n>` pauses n; each glyph plays menu sound cue 1 (`FUN_0036a300` L264865); the end raises event
  0x15; the cursor's alpha is sin(phase) x 32 + 96 with the phase at PULSERATE = 10 rad/s ((1-t) x 128 with
  FADECURSOR). Handler `FUN_00378600` (L272606): Continue / scroll_up / scroll_down / finish (types all at once).
  Guns type " " and show the bars; equipment hides the bars and types its desc; both share the (380..640, 274..394) box.

### 3.9 Sounds

| sound | when (flag word) |
|---|---|
| `.DINK` | entering the ARMORY (lobby, 0x82); column Left/Right (0x80); Up/Down on character select (0x82); X on a column (0x80); row Up/Down (0x80); X on DONE (0x82); TRIANGLE to the lobby (0x82); back to character select (0x80); Square store (0x82) |
| `.SLIDE` | every weapon Left/Right (0x80) |
| `.NEG` | a refused pick in `ShowAndSpin` (43 sites, 0x80) |
| none | Circle (defaults), `UiBackToLobby`, the confirm popup |
| menu cue 1 | each typed glyph of `WepDescription` (`TELETYPE_TICK_SOUND_READING`) |

`HUDUI.bnk` (`RUN/SOUNDS/BNKSTORE.ZAR`, already loaded by `packages/viewer/src/soundData.ts`) holds them: .DINK 0,
.BACK 1, .SLIDE 3, .NEG 4, .TYPE 7, .METAL 8; all six render (0.03-0.18 s). `uisounds.rdr` names TELETYPE -> .TYPE,
BACK -> .BACK, SELECTION -> .METAL. `uianim`'s `SND_DINK` has no sigil and never plays.

### 3.10 Dead references and quirks (all as shipped)

- Captions or ACTIVE commands aimed at objects **absent** from the MP layout do nothing: `NoAvailRoom` (its "EQUIPMENT
  SLOTS FULL"/"LOCKED"), `ClayAvailText`, `WepTabText` (opcode byte 0), `silencer`, `SpecterSecLock`, `VandalSecLock`,
  `arrow_up` (`ARMORY_ABSENT_OBJECTS_READING`).
- `TurnOffLoadingText` and `DisableThermalScope` are defined in no UIZANIM set: their CALL_ANIMATIONs are no-ops
  (`ARMORY_MISSING_ANIMS_READING`).
- The SEAL drop starts from y=140 while the columns rest at y=150: a 10-px snap.
- `Enable_RPG_ammo` is written but never read (§3.4).
- Tips 1212 and 1221 are crossed in id order (38 PMN has 1221, 49 AN-M8 1212); items 53-57 have no tip.
- The Seal3/Seal4 padlock swap (§3.6).

## 4. The code, and the STATE TABLE

### 4.1 Entry, exits and the pull-out

**Entry.** The lobby's `weaponselect` button (caption `_345_ARMORY_MSG`) sends CROSS to
`goto_eq_mp_set_return_valve` with `dlg_equipment_mp.rdr`: `GoneToArmory=1`, `NoTriangle=1`, `ComeFromBriefing=1`,
`.DINK`, `InitializeOnlineArmory`, switch. Its gate FAILs (the ARMORY cannot open) when `mp_minor_game_state==2` or
`mp_major_game_state!=1`. Arriving from the briefing (`ComeFromBriefing==0`), the lobby's `ArmButtonClock` disables the
button for 10 s (`TenCountWS` 10..1, one a second, `.DINK` at the end); after a trip to the ARMORY it is re-enabled only
when `TakenBack==0` (`Enable_SM_Launch`).

**`UIInitializeOnlineArmory`** (0x27d8c0, L126092-126101, checked) calls `FUN_0030e6e0(DAT_0045b718,0)` and
`FUN_0030e490` (L210660-210687): clears flag +0x4a and sets state 0xb on what appears to be the voice/headset object
(`ChangeCharacterType` feeds it the type's +0x388 parameters, L123887-123935). It does nothing to the ARMORY's logic
(`ARMORY_INIT_VOICE_READING`).

**The pull-out** (`UiBackToLobby`, eq@28-388): `ArmoryClock = mp_x_sec_clock`; `WHILE ArmoryClock == mp_x_sec_clock {
CheckForcedLaunch }`; then popup 47 (`_47_Lobby5Secs_MSG`, image `popupOp.tif`); WAIT 5 s; `TakenBack=1`; switch to
`dlgGameLobby.rdr`. The clock is code: `UICheckForcedLaunch` (0x27cbf0, L125642-125791) writes `mp_45_sec_clock` (game
+0x30) = seconds left to game +200, and only while game +0xd8 is set writes `mp_x_sec_clock` (+0x34) = seconds left to
+0xe4; at 0 on the host it launches (`FUN_002c5360`). The deadline is `now + mp_x_sec_clock x 1000` ms
(`FUN_002a6b90` L148997-149015); the lobby's `check_loop` sets the clock to 11 and its `CountDown` shows "GAME STARTS IN
n SECONDS" (354/355). So a launch countdown's first tick pulls everyone out: a 5-s popup inside the lobby's count
(`ARMORY_CLOCK_READING` for the viewer's mapping).

| exit | trigger | effect |
|---|---|---|
| DONE | X on the DONE row (`OnEquipDoneBtnPress`) | `.DINK`, the lobby |
| Back | TRIANGLE on character select (`returnto_lobby`) | `.DINK`, the lobby |
| Pulled out | `UiBackToLobby` | popup 47, 5 s, the lobby, `TakenBack=1` |
| Net error | `OnNetError` | popup 44/46; errno 32 -> `SWITCHMENU "REBOOT"`, else disconnect, MENUFADER 0 -> 0.99 in 0.5 s, `ReturnToBriefingRoom` |
| New mission | ON_FORCE_NEW_DB -> `force_new_db` | `AdvanceMPMission` (L123842-123886: lobby deadline +45 s or +30 s), the lobby |
| Disk error | `hdd_error` | `DisplayHDDError` (`UIHardDiskAnim.rdr`), the briefing room |

### 4.2 The STATE TABLE

Selector valves: `MpCharSet` 1-8 (SEAL 1-4, TERRORIST 1-4); `UiCharSet` = `1 << (MpCharSet-1)`; `UiLastEquipClassBtn`
1-6; `UiWeapon` = the UI index shown.

| state | enters on | draws | buttons | exits to | source |
|---|---|---|---|---|---|
| **S0 Boot** | switch from the lobby | `UnlockMPChar` (4th column caption and lock), `OnlyModes`, `UiEquipSwitch` (padlocks; "CUSTOM" on the stored column when a profile exists and `EQlimit==0`, else `MpCharSet` 1/5), `MPSealPlace` slide (0.4 s) | none (the slide runs concurrently) | S1 | §3.1; eq `UnlockMPChar`, `OnlyModes`, `UiEquipSwitch`, `MPSealPlace` |
| **S1 Character select** (`EquipMpSealBtn`/`EquipMpTerrBtn`) | `Ui_MP_*_EquipStart`, `ActivateButton` | the side's 4 columns; the chosen `eq_*_winAct` + `Equip*ActFrame`; `InstructionText` 34-37 / 30-33 (4th: `SetChar4Name`); game name by `ComeFromLan` | LEFT/RIGHT column (`.DINK`, wrap, skip a locked 4th); UP/DOWN `.DINK`; X -> S1a; TRIANGLE -> lobby; CIRCLE/SQUARE unbound | S1a, lobby | §3.2; layout CONTROLS |
| **S1a Commit type** | X | `.DINK`; `ChangeCharacterType(n)` (0x2795e0 L123887-123935: type name `FUN_002af780(n-1)` -> game +0x12c); `UpdateSelItemValves` (0x282410 -> `FUN_00282140` L128327-128421: `primsel`/`secsel`/`equipNsel` = UI index); 3 columns drop, 0.2 s, chosen column to x=220, panes rise; `CrossFieldText` 16 | input suspended 0.5 | S2 on Primary (Secondary when `EQlimit==1`) | §3.2 seq 0 / seq 196 |
| **S2 Weapon row r** (`EquipWeaponBtn`, r 1-5) | `OnMpPrimaryBtn` ... `OnMPEquipEquip3Btn` | the row's pane; `PulseArrows`; bars for rows 1-2 only; `InstructionText` 39 (online) / 40 (LAN); `ShowAndSpin`: tip, caption, fire mode, bars, spinning model, padlocks | LEFT/RIGHT change the item (§3.4; applies at once, no X); UP/DOWN rows (skip 253-255) -> S2 / S3; SQUARE -> S5; CIRCLE -> S6; TRIANGLE -> S4 | S2, S3, S4, S5, S6 | §3.3, §3.4, §3.7 |
| **S3 DONE row** (`EquipMPDoneBtn`) | `OnMPEquipDoneAct` | Done pane; models, description, tip, bars, `arrow_lft` hidden; `arrow_top` shown; the literal DONE instruction | X -> lobby (`.DINK`); UP/DOWN -> S2; CIRCLE -> S6; TRIANGLE -> S4; SQUARE unbound | lobby, S2 | §3.3 |
| **S4 Confirm popup** | TRIANGLE in S2/S3 | MENUFADER 0.7; popup 1245, NO 246 / YES 253 | `AreYouSure==2` -> `OnMPWeaponBtnTriangle` (`.DINK`) -> S1 keeping the kit; `==1` -> back | S1, S2/S3 | §3.3; `ARMORY_CONFIRM_VALUE_READING` |
| **S5 Store** (SQUARE, online, `EQlimit==0`) | `StoringLoadout` | captions reset, "CUSTOM" on the column; `CharacterProfile` 1, `SaveCharacterProfile` 3/4 (3 s) | input suspended 4.0 | S2 | §3.3, §4.4 |
| **S6 Defaults** (CIRCLE) | `returnto_Defaults` | `ChooseDefaultEquipment` (the full type kit) + profile mode 7 when `EQlimit==0`; the mode valves otherwise; no sound | input suspended 2.3 | S2 / S3 | §3.3, §4.4 |
| **S7 Pulled out** | `mp_x_sec_clock` changes | popup 47, 5 s | none | lobby, `TakenBack=1` (the viewer: a notice, the round's start closing the screen; `ARMORY_CLOCK_READING`) | §4.1 |

### 4.3 Slot rules and refusals (code)

- `ChoosePrimary` 0x2827e0 -> `FUN_00284360` (L129374-129447); `ChooseSecondary` 0x2826c0 writes kit slot 1;
  `ChooseEquip1/2/3` 0x2825e0/0x282500/0x282420 -> `FUN_00282c20(chars, id, slot 2/3/4)` (L128708-128791).
- **Free slots** (`FUN_00284120` L129298-129373; checked at L129300): the pick needs 2 equipment slots (satchel, RPG-7,
  LAW; an M203 rifle, 52 or 61, with 141 exempted), 1 (M79, MGL, F2000) or none; available = 3, plus what the replaced
  item frees, minus the slots locked on any selected character; refused when the need exceeds it.
- **Pairing rules** (`FUN_00280e90` L127740): as research 94 §A5.3.
- **Cost-2 partner slot** (`FUN_00282f20` L128815-128887): the first empty slot, else the next unlocked slot (4 wraps
  to 2); it receives 185 (LAW HEAT) for the LAW, 186 for the RPG-7, or 254 FULL_SLOT.
- **Launcher primaries** (`FUN_00284360`): an M203 rifle puts 141 and 175 into slots; the M79 179, the MGL 175, the
  F2000 183; the ids they displace are kept in `DAT_003dd060[char*2]`.
- **Removing an item** (`FUN_00283170` L128888-129128): its dependents are undone and refilled through
  `FUN_00283b50`/`FUN_00283e60` (the armory twins of research 94's in-game refills; these use the side's own mask,
  `0 -> 1`).
- A failed Choose types a refusal: "The AT4 requires two open equipment slots for the launcher and ammo. The selected
  characters have locked items in those slots." and the same pattern for the RPG, the M16A2-M203, the M4A1-M203, the
  MGL ("an open equipment slot for the M203 ammo") and the OICW.
- `DoAllSelCharsHaveWeapon` / `DoAllSelCharsHaveEquip1-3` (0x2808e0, 0x281060-0x281080 -> `FUN_00281160`
  L127787-127926): the decomp lacks the 0x2808e0 body (the recomp has `output/UIDoAllSelCharsHaveWeapon_0x2808e0.cpp`);
  read as "every selected character holds the item" (`ARMORY_ALL_SEL_HAVE_READING`). In MP one character is selected,
  so the question only matters for the single-player squad.

### 4.4 Save, defaults, the default type

- **Store** (`UICharacterProfile` 0x275770, L121919-122133, checked at L121919): mode 0 loads, 1 stores, 2 tests
  "exists", 3 and 4 write to the memory card or HDD (`FUN_0033eb70`/`FUN_0033e7f0`, file "WeapProfile_%d.dat"), 7
  clears the record's valid flag. The key is `LOBBY_HOST`, `LOBBY_PORT` and `PLAYERNAMEVAR` (`FUN_002fb470`
  L198753-198799, 0x1318-byte records), then the 8-character mission name at 0x414e00 (written by `UISetMission`
  0x27eb50, L126655-126680), up to 0x80 entries. Each entry holds **one record per side**: `{MpCharSet u8, prim, sec,
  eq1, eq2, eq3 as u16 UI indices, valid u8}` at +0x114 (team A) and +0x122 (team B) (`FUN_002fb610`
  L198800-198900); spectators are refused. On load each item is re-validated against the map's valves (`&1`/`&8`) by
  `EquipCharacterProfileSeal/Merc*` (`UICharacterProfile.rdr`). The viewer's equivalent is localStorage keyed by map +
  side, the type inside the record (R95.4, `ARMORY_PROFILE_KEY_READING`); what modes 3/4 persist versus the unused
  `_23_StoringChar_MSG` ("not saved to the memory card") is `ARMORY_MEMCARD_SAVE_READING`.
- **Defaults**: `ChooseDefaultEquipment` (0x282980, L128604-128652, checked): the type's whole +0x2e8 kit through
  `FUN_00284720`, then `FUN_0053b070` (R95.3).
- **The default type** (R95.5): SEAL 1 / TERRORIST 1 (`MpCharSet` 1 / 5, `ChangeCharacterType(1)`/`(5)`, type index
  0 / 4) whenever no profile exists -- the lobby's `FromBriefing`, `switch_teams_anim`, `SwapClanSides` and the
  ARMORY's `UiEquipSwitch` alike.

## 5. Assets and fonts

### 5.1 How the game loads them (decomp)

- **Menu state init** `FUN_001f4860` (L54780+): mounts `run/ui` + `readerc.zar` (L54801; strings 0x3e2da0/0x3e2db0);
  loads LOC "UIMn" (`FUN_003a3900`, L54807); loads world "ui" through `FUN_001e91c0` -> `FUN_00318da0` (L54809;
  research 72); the libraries `ui/assetlib/uisk` and `common/assetlib/font` (L54819-54821); `uisounds.rdr` from
  `data/common/dialog` (SOUNDS/TELETYPE, BACK; L54829-54848); `sounds.rdr` blocks HUDUI, SMUS, UIVOICE
  (L54848-54850); bank "UI" (L54851; not on the disc: `UI_BANK_PLACEHOLDER`); `run/uizanim.zar` (0x3e2e30).
- **UI world root** `RUN/UI/UI.ZED` (1,136 B): `assetlibs` `//ui/junkyard` and `//ui/assetlib/ui` (UI_TXR/PAL/GEO +
  UI_MDL). `parseWorldRoot` (`packages/scene/src/worldRoot.ts:219`) reads 1 directional light (0.8 grey, dir (-0.469,
  0.748, -0.469)) and ambient 0.557; the 144-B camera record is not decoded (`UI_CAMERA_READING`).
- **Assetlib name to file** `FUN_003199c0` (L217434-217515): `run/<dir>/<stem cut to 4 chars>` + `_txr`/`_pal`/`_geo`
  + `.zed`, MDL `%s_mdl.zed` (0x3e1cf8): `ui/assetlib/uimp` -> `RUN/UI/UIMP_*`, `wsmp` -> `WSMP_*`, `eq/em02` ->
  `EM02_*`.
- **LOC** `FUN_003a3490` (L297105-297117): `RUN\LOCALE\<country>\<name>LOC.zar` (STATES for the US) -> `<name>LOC.rdr`,
  so the game reads `LOCALE/STATES/UIMNLOC.ZAR`, not the READERC copy.
- **`fonts.rdr`** is read at L152637 (0x3f1ac8); it is only in `RUN/READERC.ZAR`.
- **Two `READERC.ZAR`s**: `RUN/READERC.ZAR` (1,026,848 B: `fonts.rdr`, `character.rdr`, a copy of `UIMnLOC.rdr`) and
  `RUN/UI/READERC.ZAR` (1,257,632 B: `dlg_equipment_mp.rdr`, `uisounds.rdr`, `UiParams.rdr`, `dlg_CharUnlock.rdr`,
  `dlg_WeapUnlock.rdr`). `packages/scene/src/body.ts:140` builds the RUN/ path by string replace, so new loaders name
  the UI path explicitly.
- **The ELF on the disc** (`game/disc/socom2_game.elf`) reads `DAT_`s by address (e.g. 0x3f6d50/58/60 = `_txr`,
  `_pal`, `_geo`; 0x3e2e10 = `SMUS`): research 91's "no ELF available" readings can be revisited (R95.14).

### 5.2 The asset table

| asset | disc path (bytes) | contents | decoder | today |
|---|---|---|---|---|
| layout | `RUN/UI/READERC.ZAR` -> `dlg_equipment_mp.rdr` (58,664) | 226 objects, CONTROLS, 67 MODELS | `parseRdr` (`packages/archive/src/rdr.ts:121`) | not served |
| UI sound names | the same -> `uisounds.rdr` (168) | TELETYPE/BACK/SELECTION | `parseRdr` | not served |
| scripts | `RUN/UIZANIM.ZAR` (1,224,080) | 95 sets, incl. `dlg_equipment_mp.rdr`, `ShowAndSpin.rdr`, `UICharacterProfile.rdr`, `uianim.rdr`, `UIHardDiskAnim.rdr` | `parseAnimSets` (`packages/scene/src/zanim.ts:131`), commands only -- payloads not decoded | not served |
| UI world root | `RUN/UI/UI.ZED` (1,136) | preview lighting | `worldRoot.ts:219` | not served |
| UI models | `RUN/UI/UI_GEO.ZED` (33,424) + `UI_MDL.ZED` (796,464) | 64 models | `weaponLibrary` (`packages/scene/src/weapon.ts:82`), needs the `'bias'` form | not served |
| UI model textures | `RUN/UI/UI_TXR.ZED` (587,504) + `UI_PAL.ZED` (33,616) | 87 textures, 57 palettes; 87/87 decode | `decodeNamedTextures` (`packages/viewer/src/hudBitmaps.ts:57-75`) | not served |
| chrome | `RUN/UI/UIMP_TXR.ZED` (596,144) + `UIMP_PAL.ZED` (32,256) | 36 textures incl. `font_titlebar_01.tif`; 36/36 decode | the same | not served (no ZDB copy) |
| bars, arrows, padlocks | `WSMP_TXR/PAL.ZED` in every `MP*.ZDB` (110,672 / 7,920; one hash across all 22; no loose copy) | arrow_left, arrow_right, blue_fill, wep_fill, wep_range, eq_wep_neg, eq_wep_bgHL, LittleBlack, locked, padlock | the same | in the ZDB, not read |
| unlockable portraits | `WSLC_TXR/PAL.ZED` in every ZDB (= `RUN/UI/WSLC_*`) | 12 | the same | in the ZDB, not read |
| portraits | `EMnn_TXR/PAL.ZED` in the map's own ZDB (44/44 equal the loose copies) | 8 each, 128x256 PSMT8 | the same | in the ZDB, not read |
| font atlas | `FONT_TXR/PAL.ZED` in every ZDB | `font_text_01` 512x128 PSMT4, `font_special_01` 256x64 PSMT8 | `packages/viewer/src/hudAssets.ts:35` reads only `font_text_01` | add `font_special_01.tif` |
| font metrics | `RUN/READERC.ZAR/fonts.rdr` (69,808) | two faces (§5.4) | transcribed for `font_text_01` ASCII only (`packages/viewer/src/hudFont.ts:160-197`) | titlebar and specials missing |
| strings | `RUN/LOCALE/STATES/UIMNLOC.ZAR` -> `UIMnLOC.rdr` (221,480) | 1,411 entries | `parseRdr`; no LOC reader in the packages | not served |
| strings (copy) | `RUN/READERC.ZAR/UIMnLOC.rdr` | the same 1,411; 42 differ only CRLF/LF, none an ARMORY string | -- | served |
| UI sounds | `RUN/SOUNDS/BNKSTORE.ZAR` -> `HUDUI.bnk` | 24 names | `parseBankFile`/`renderSound` | loaded (`soundData.ts:57`) |
| characters | `READERC.ZAR/character.rdr`, `READERM.ZAR/chartype.rdr` | kit, model, texture | `packages/scene/src/character.ts:55`, `arsenal.ts:296-308` | exists |
| portrait binding | `READERM.ZAR/mission.rdr` `UiVars` | `EQUIPMENT_LIBRARY`, `Seal1..4`, `Terr1..4`, `mission_title`, `load_picture` | none | new reader |

Every FILENAME in the dialog resolves in its LIBRARIES: UIMP (multplay_back, backsolid, brown_back, brown_back_real,
NetMonY/B, arrow_top, arrow_botm), WSMP (padlock, wep_range, blue_fill, arrow_left, arrow_right); names in two
libraries decode to identical pixels (eq_wep_bgHL UIMP/WSMP, LittleBlack UIMP/WSMP, locked WSMP/WSLC). Every 2D bitmap
is stored bottom row first (`flipRows`, `hudAssets.ts:44`); model textures are not flipped (as WEAP).

### 5.3 The UI models: the `'bias'` form

`weaponLibrary(UI_GEO, UI_MDL)` walks all 64 models with no diagnostics, but its hard-coded `'scale'` form (0x70,
`weapon.ts:125`) is wrong here: all 513 UI_MDL packets have TOP+3 = (0,0,0,1), where WEAP's `w` is the part's extent.
Read as `'bias'` (0x68, ITOF4 /16), each visual node's extent matches its `nparams` bbox within 0.093 units on 84 of 85
nodes (the exception, RPG7UI/g15, is a group node whose bbox includes its children, and its geometry lies inside it);
read as `'scale'` the error is 1.15-13.7 units on every node. S1 adds a form parameter to `weaponLibrary`. The choice is
by fit, not from the EE command list (`UI_MODEL_FORM_READING`).

### 5.4 Fonts (`fonts.rdr`)

**`font_titlebar_01`**: texture `font_titlebar_01.tif` (512x512 PSMT4, in UIMP, UI2D and UIGC with identical pixels),
xspacing 0, opacity 0.7, scale 1, no topy/boty, dropshadow offset (3,3) colour (0,0,0) opacity 0.65 baseline 0; 166
glyphs (the 95 printable ASCII + 71 accented/symbols), every cell 51 rows tall (0-51, 51-102, ... 357-408); DispPos.x
-3 x89, -1 x37, 0 x35, 1 x4, -2 x1; baseline 1 on codes 33 and 46. The pen and advance are the HUD's (`hudFont.ts:220-231`,
`FUN_00363c20`); its vertical placement is the letters' (`UI_TEXT_ORIGIN`, §2.7: its capitals on rows 9-38 of 51).

**`font_text_01`**: 185 glyphs, 167 on texture 1 and 18 on texture 2 (`font_special_01.tif`); code 96 is listed twice
(LR.x 127 then 126; `hudFont.ts:188` keeps the first: `FONT_DUP_GLYPH_READING`). The specials:

| code | glyph | UL-LR | scale | baseline |
|---|---|---|---|---|
| 172 (0xAC) | triangle | (0,6)-(25,31) | 0.9 | 0 |
| 180 (0xB4) | square | (25,6)-(50,31) | 0.9 | 0 |
| 166 (0xA6) | cross | (50,6)-(75,31) | 0.9 | 0 |
| 183 (0xB7) | circle | (75,6)-(100,31) | 0.9 | 0 |
| 168 / 170 / 167 | olive / red / teal dots | (100/125/150,6), 25 px | 0.6 | 2 |
| 164 | SELECT | (207,1)-(255,30) | 0.9 | 4 |
| 162 | wedge | (0,34)-(47,63) | 0.75 | 4 |
| 182 / 188 / 189 / 190 | L1 / L2 / R1 / R2 | x 46/80/114/148, rows 34-63 | 0.75 | 4 |
| 163 / 175 / 177 / 181 | d-pad right / left / down / up (settled in S4, below) | x 182/200/218/236 | 1 | 2 |
| 179 | inverted rectangle UL(75,50) LR(100,25) | -- | 0.9 | 0 |

The atlas's star (x 176-205, rows 3-31) has no code (`SPECIAL_GLYPH_179_READING`). These settle research 94's
`GLYPH_READING` and `PAD_GLYPH_PLACEHOLDER` for S4: 0xBE (190) is the R2 glyph and 0xBD (189) R1 (see §7). Every one
of the 18 carries `color (150 150 150)`, so the engine draws it in that colour at the string's alpha and with **no
drop shadow** (the shadow pass runs only for a glyph with no colour: `FUN_003625e0` L260602-260620; the colour taken
in `FUN_00361bd0` L260348-260356).

**The d-pad's directions (S4, `DPAD_GLYPH_DIRECTION_READING` settled).** Two sources agree:

- *The atlas.* Decoded from `FONT_TXR.ZED` (MP2, top row first), each d-pad cell is a pentagon, flat on one side and
  pointed on the other: 163's ink spans 12 rows at its first column and 2 at its last (flat left, pointed right);
  175's the reverse (pointed left); 177's rows span 12 texels at the top and 2 at the bottom (pointed down); 181's the
  reverse (pointed up). `viewer/test/hudFont.test.ts` measures it on the disc's atlas.
- *The code.* The prompt's line "Use the 0xA3 and 0xAF directional buttons to cycle through living teammates"
  (0x3e3350) names the dead player's teammate cycle, and that cycle is driven by pad bytes **+3 and +4** -- Right and
  Left in research 94 §B3's slot table -- in `FUN_00592560` (L451683-451694: +3 sets `+0xfcd`, +4 sets `+0xfce`, both
  only while the HUD mode `+0x221` is not 1), consumed at L412733-412751 (`+0xfcd` -> `FUN_00547170`, the next
  teammate; `+0xfce` -> `FUN_00546fa0`, the previous; again only at mode 0).

So 0xA3 = d-pad **right**, 0xAF = **left**, 0xB1 = down, 0xB5 = up; research 94's `GLYPH_READING` (0xA3/0xAF Up/Down,
from the spectator lines' byte order) is retracted. The same lines answer research 94's
`DEAD_CYCLE_WHILE_MENU_READING` by source: the cycle is gated off while WEAPON EXCHANGE holds the HUD in mode 1. In the
viewer: `scene/src/uiFont.ts` `PAD_GLYPH.DPAD_*`, `viewer/src/hudFont.ts` `DPAD_GLYPH` and `FONT_SPECIAL_01` (the 18
glyphs transcribed, checked against `fonts.rdr`), drawn in WEAPON EXCHANGE's prompt (`viewer/src/weaponSelect.ts`).

**Placing a pad glyph** (`SPECIAL_GLYPH_PLACEMENT_READING`, `viewer/src/hudFont.ts`). `FUN_00361bd0`'s two corners
(L260374-260400, L260417-260442) put the quad's top at the pen's y + (baseline - DispPos.y - h) x S and its bottom
h x VertScale x S below (h = the element's LR.y - UL.y; `DAT_0049e9f4` the frame's y-down 448/480), its left at the
pen + DispPos.x x S and its width (width x HorScale - 1) x S + 0.5; the pen advances by int((int(DispPos.x + width x
HorScale) - 1) x S + 0.5) + xspacing (`FUN_0035a7b0` L255868, `FUN_00363c20` L261330). The viewer places the glyph
relative to the letters' fitted cell (research 87 §3: the runtime offsets `DAT_0049e9a0/a8` are the fit's): its top
(baseline - DispPos.y - h + 25) rows below the letters' top. R2 (baseline 4, h 29) shares the letters' top; the d-pad
arrows (baseline 2, h 29) sit 2 rows above it. No frame shows a pad glyph in the HUD's lines; the placement is the
code's, not measured.

### 5.5 Strings (UIMnLOC)

The dialog cites 17 ids (1-9, 11-13, 15-18, `_862_VOLUME`); the scripts and code also need 10 "SEAL 4", 14 "TERRORIST
4", 19-22, 23, 24 "CUSTOM", 25-43, 345 "ARMORY", 624 "CHARACTERS", 1025-1244 (§3.7), 1245, 246/253, 1266-1283 and
1375-1400 (the unlockables; "LOCKED" = 1376). The strings are UTF-8: `C2 xx` encodes a pad glyph (243 of them, and 59
bare `A6`); the lobby frame `A_53_gamelobby.png` shows the cross before CONTINUE with no "Â", so the `C2` lead is
consumed (the code path was not found: `UIMNLOC_UTF8_READING`). The dialog `.rdr` captions are single-byte (`AC` in
"`0xAC` BACK").

### 5.6 What S1 must add

- **The ISO loader.** `IsoAssetSource` (`packages/archive/src/isoAssetSource.ts:33,42`) lists and reads any path, and
  `readZarMembers`/`readZdbMember` (`packages/archive/src/zarMembers.ts:12-46`) read members by range: no archive-layer
  change. The worker needs an armory read: `RUN/UI/READERC.ZAR` by member (`dlg_equipment_mp.rdr`, `uisounds.rdr`);
  `RUN/UIZANIM.ZAR` whole (1.2 MB; `parseAnimSets` needs the key tree); `RUN/UI/` `UI.ZED`, `UI_GEO`, `UI_MDL`,
  `UI_TXR`, `UI_PAL`, `UIMP_TXR`, `UIMP_PAL`; `RUN/LOCALE/STATES/UIMNLOC.ZAR`; `RUN/READERC.ZAR/fonts.rdr` (or a
  transcription as `hudFont.ts` did); from the map's ZDB `WSMP_*`, `WSLC_*`, `EM<nn>_*` (named by `UiVars`
  `EQUIPMENT_LIBRARY` through the `FUN_003199c0` stem rule), `FONT_*` with `font_special_01.tif` added to
  `HUD_LIBRARIES.FONT` (`hudAssets.ts:35`), and `mission.rdr` `UiVars`.
- **extract-maps.** Ten paths join `COMMON_ARCHIVES` (`packages/archive/src/mapIndex.ts:27-30`), which
  `tools/extract-maps.ts:34,38` copies and `HttpAssetSource.list` names (`httpAssetSource.ts:22-24`):
  `RUN/UI/READERC.ZAR`, `RUN/UIZANIM.ZAR`, `RUN/UI/UI.ZED`, `RUN/UI/UI_GEO.ZED`, `RUN/UI/UI_MDL.ZED`,
  `RUN/UI/UI_TXR.ZED`, `RUN/UI/UI_PAL.ZED`, `RUN/UI/UIMP_TXR.ZED`, `RUN/UI/UIMP_PAL.ZED`,
  `RUN/LOCALE/STATES/UIMNLOC.ZAR` -- 4,783,888 B in all. WSMP has no loose copy, so it stays read from the map archive.
- **Decoders.** The UI command payloads (§1: UI_COMMAND, VALVE, IF/WHILE token streams, MOVE/OPACITY/ACTIVE/SOUND,
  CALL_*); `weaponLibrary`'s form parameter; a LOC reader (UTF-8); the two faces; a `UiVars` reader.
- **`DATA_SOURCES.md`** rows (after its lines 50-72): UI layout, UI zanim, UI models (bias form), UI/UIMP/WSMP/WSLC/EM
  textures, fonts, UIMnLOC, UiVars portraits.

## 6. Character types (all 22 maps)

176 of 176 characters' `model_name` are in their map's `CLIB_MDL`; kit and `texture_asset` come through
`character.ts`/`arsenal.ts` as today. Maps MP1-MP12 have four ordinary SEALs and four Terrorists. On maps 51-83 the 4th
of each side is the campaign's unlockable (UIMnLOC 1375-1400: complete the area at Commander/Lieutenant; 1389 the game
as Admiral):

| maps | Seal4 (portrait) | Terr4 (portrait) |
|---|---|---|
| 51-53 | SAS_01 (sas1_alb) | alban_Pius (Alb_Terr_Pius) |
| 61/62/64 | seal_Marcela (Bra_Agent_Bertha, "FERAL") | braz_leader (Bra_Terr_Quix) |
| 71-73 | SAS_01 (sas2_alb) | alg_officer (Terr_Alg_leader) |
| 81-83 | rus_specialist (Rus_Specialist) | rus_Valeska (Rus_Terr_Valeska) |

On 81-83 Seal3 is also Spetsnaz (Seal3_spetsnaz); the captions SAS 1/2 and Spetsnaz 1/2 are UIMnLOC 26-29. The
portraits are named by each map's `mission.rdr` `UiVars` `Seal1..4`/`Terr1..4` and live in that map's `EMnn_TXR`
(same order, all 22 maps). **Reconciling (a)/(b) with (c)** (corrected, §2.8): on maps 51-83 the map's own
`InWhichAOP` makes `UnlockMPChar` caption the 4th column with the unlockable's name over its portrait and lock it --
the owner's Crossroads capture shows ALG OFFICER under the LOCKED stamp; on MP1-MP12 it reads "SEAL 4" / "TERRORIST 4",
open.

**Which type a column is: by name, through `UiVehicles`** (the S2 review). The ARMORY's `ChangeCharacterType(n)`
(0x2795e0, `FUN_002795e0` L123889-123933) takes the name `UiCharType<n>` (`FUN_002af780(n - 1)` L153845-153855, the
table at 0x3f02b0 of `UiCharType1..32`) and copies that character's +0x388 parameters. The names are registered at the
level load (`FUN_002acc10` L152446-152451): online (`DAT_0045a0c1` != 0) `FUN_002af8c0` (L153936-153991), offline
`FUN_002afa10` (L153996-154053). Both walk the map's `mission.rdr` `UiVehicles` list (key 0x3f1ca8); entry i's `Name`
(0x3f1cb8) becomes `UiCharType<i+1>` -- online through `FUN_0053b4b0` (L405168-405202), which looks the name up in
`chartype.rdr`'s `navyseals`, `terrorists`, `escortees` in turn (`FUN_0053b5f0` L405207-405245: the entry whose `name`
matches, without case -- `FUN_00198b80` L15553 --, returning its `character`) and takes the loaded character of that
name. So column n is the type `UiVehicles[n-1]` names, not `chartype.rdr`'s n-th entry. Read off all 22 MP maps'
`READERM.ZAR` (2026-09-30), every `UiVehicles` is `Seal1..Seal4, Terrorist1..Terrorist4`, the two sides' `chartype.rdr`
names in the same order -- the two readings agree on every map. The roster resolves each column by name all the same
(`scene/src/armoryCharacters.ts` `uiVehicleNames`, `armoryRoster`: `index` is the named type's position in its side's
`chartype.rdr` list, the index the kits, the bodies and the room read; a name the side does not list falls back to the
position), pinned by `scene/test/armoryCharacters.test.ts` (a swapped `UiVehicles`; MP2 and MP72 off the disc).

**S2: each type end to end** (web sprint 5, W5.R2). A player is one of its side's columns -- `MpCharSet` - 1 within the
side, 0-3, SEAL 1 / TERRORIST 1 (0) without a choice (R95.5, `scene/src/armoryCharacters.ts` `DEFAULT_ARMORY_TYPE`) --
and the column is its body, its kit and its hit volumes alike: `armoryTypeAllowed` admits the side's `chartype.rdr`
types, at most four, the fourth only where the map's `InWhichAOP` is 0 (R95.6 as corrected, `fourthArmoryTypeOpen`); the page decodes all eight bodies
(`viewer/src/loadMap.ts` `types`), its own and the others' follow their type (`teamBody.ts` `bodyForTeam`); the kit a
spawn gets with no pick is the type's (`loadout.ts` `typeLoadout`); and the match server and the in-page room read
every type's skeleton (`simMap.ts` `simSkeletonsFromBytes`) and hit a player on its body's type's capsules
(`match/src/room.ts` `volumesOf`). **The types' skeletons differ**: read off the disc (MP1, MP2, MP6, MP12, MP51,
MP61, MP81), every type's model carries the same 26 bones, but its parts' `nparams` boxes -- which size each capsule
(`net/hitVolumes.ts`) -- are its own: on Frostfire SEAL 2 (`seal_E_scuba`) has another head capsule than SEAL 1
(`seal_A_scuba`), TERRORIST 4 (`al_captain`) a wider chest than TERRORIST 1 (`al_gman01`); only types naming the same
model share them (MP1's SEAL 1, 3 and 4, `seal_A_arc`). Pinned by `central/test/room.test.ts` ("every type's own
skeleton"). The type rides protocol 9 (research 91 §19's protocol paragraphs): the hello names the page's type per side
(the room chooses the side), a `loadout` request the type its picks replay from, and a `spawn` and the welcome's players
the type the body was rebuilt as.

## 7. Corrections to earlier notes

- **Research 94 §A5.5 / A0 row "default equipment"**: the MP ARMORY's Circle calls `ChooseDefaultEquipment`
  (0x282980, the full kit, primary and secondary included), not `UIChooseDefaultEquipmentOnly` (0x281be0), which no
  shipped UIZANIM, MPZANIM or EXTZANIM script calls. §A5.5 stays a correct reading of 0x281be0; it is not the ARMORY's
  Circle.
- **Research 94 `ARMORY_LIST_FILTER_PLACEHOLDER`** (*note only*): answered -- the ARMORY has no list; Left/Right steps
  a fixed scroll order skipping items whose `Enable_` valve does not admit the side (§3.4).
- **Research 94 `GLYPH_READING` / `PAD_GLYPH_PLACEHOLDER`**: the `font_special_01` glyphs are transcribed here (§5.4).
  Confirmed: 0xAC (172) triangle, 0xA6 (166) cross, 0xB7 (183) circle, 0xBE (190) R2, 0xBD (189) R1 -- so the
  WEAPON EXCHANGE prompt's `%c` is the R2 glyph and S4 draws it in place of the text. Research 94 read 0xA3/0xAF as
  d-pad Up/Down (from the spectator lines' byte order); **settled in S4** (§5.4): 0xA3 (163) is the d-pad *right* and
  0xAF (175) the *left*, 177 down and 181 up -- the atlas's pixels and the dead player's Right/Left teammate cycle
  (`FUN_00592560` L451683-451694) agree (`DPAD_GLYPH_DIRECTION_READING`).
- **Research 94 `ARROW_ORIENT_READING`, `CARD_TEXT_OFFSET_READING`, `DRAW_ORDER_READING`,
  `DEAD_CYCLE_WHILE_MENU_READING`**: answered by source in S4 -- research 94's placeholder table says how.
- **Research 91 `DEFAULT_CHARTYPE_PLACEHOLDER`**: answered by R95.5 (SEAL 1 / TERRORIST 1); the name left the code
  in S2 (`DEFAULT_ARMORY_TYPE`, §6).
- **Research 91**: "no ELF available" -- the retail ELF is on the disc (§5.1).
- **Research 91 `DEFAULT_CHARTYPE_PLACEHOLDER` row**: "`UiCharType` (SP only, `FUN_002af8c0`)" is wrong --
  `FUN_002af8c0` is the **online** registration (the `DAT_0045a0c1` != 0 branch of `FUN_002acc10`, L152449-152451);
  offline it is `FUN_002afa10` (L152447). Both name `UiCharType1..n` from `UiVehicles` (§6).

## 8. Placeholders and readings

*Added 2026-10-04 (ARMORY-UI, web sprint 17; research 182's C4 items):* seven rows closed in the code -- the confirm opens on NO and its TRIANGLE does nothing (`ARMORY_POPUP_FOCUS`), the popup laid out from record 1245 (research 118 §3), every bitmap sampled at S/T 0.01..0.99 (`ARMORY_SPRITE_UV`), opacity multiplied down the tree (`CHILD_OPACITY`), every script `SOUND` and the three implicit cues played (`ARMORY_SCRIPT_SOUNDS`, `ARMORY_IMPLICIT_CUES`), a stored profile re-validated per item, the panes' text the item's `Description` (`ARMORY_PANE_TEXT`). §3.9's "none: ... the confirm popup" is contradicted (research 122 R122.13): PopUpDialog plays `.METAL`, the popup's keys SELECTION. The rows say so in their last cell; reading level, pending review.

Named stand-ins for what the readers could not source, or a choice among sourced readings. Each is *note only* until
the task that builds it names it in the source, and the row then says where: S1 (data and assets) names five --
`UI_MODEL_FORM_READING`, `UIMNLOC_UTF8_READING`, `FONT_DUP_GLYPH_READING`, `MODEL_CAMERA_READING` and
`FOURTH_CHAR_AOP_READING`; in S2 (the character types) `DEFAULT_CHARTYPE_PLACEHOLDER` is retired, and three are added
and named -- `ARMORY_TYPE_FALLBACK_READING`, `ARMORY_OUTSIDE_ROUND_READING` and `KEPT_RECONNECT_READING` (the last in
S2's repair rounds 3 and 4); S4 (WEAPON EXCHANGE) settles
`DPAD_GLYPH_DIRECTION_READING` and names one, `SPECIAL_GLYPH_PLACEMENT_READING`. S3 part 1 (the screen: its state,
its scripts played, its layout drawn, its entry points) names eleven of the rows below in the source and adds sixteen,
the rows from `ARMORY_RULES_READING` on. S3 part 2 (the weapon view: the spinning model, the bars, the typed
description and the tips, the sounds) names eight more in the source -- `MODEL_CAMERA_READING` (its use),
`UI_CAMERA_READING`, `SPIN_SCREEN_SENSE_READING`, `BAR_SCALE_ORIGIN_READING`, `CHILD_OPACITY_INHERIT_READING`,
`TELETYPE_DT_UNIT_READING`, `TELETYPE_TICK_SOUND_READING`, `UI_BANK_PLACEHOLDER` (the page plays HUDUI's) -- and adds
six, the rows from `TELETYPE_CURSOR_READING` on. The S3 review (web sprint 5) answers `ABSENT_PARENT_READING` by
source (and named `DEPARTED_CHARGES_READING` as answered, which its repair reopens: the cited clear is of another
field), sources `UI_DRAW_ORDER_READING`, rules `ARMORY_BETWEEN_ROUNDS_READING` (retired 2026-10-02; live, any time
in the interval), corrects `ARMORY_WAITING_LAUNCH_READING`, `ARMORY_CLOCK_READING`, `ARMORY_MENU_KEYS_READING`,
`ARMORY_TOUCH_READING`, `TELETYPE_TICK_SOUND_READING` and `KEPT_RECONNECT_READING`, and adds five: `ARMORY_SEAT_READING`,
`ARMORY_GAME_NAME_READING`, `TAKEOVER_ROW_READING`, `REPLACED_LINE_READING`, `DEPARTED_CHARGES_READING`. Its repair
tightens `ARMORY_SEAT_READING` (a takeover or a reconnect never opens the ARMORY, in any room, unless the page still shows
it), corrects `DEPARTED_CHARGES_READING`'s sourcing (open) and `ARMORY_WAITING_LAUNCH_READING`, and adds one,
`ARMORY_ROUND_START_RACE_READING`. Its second repair extends `TAKEOVER_ROW_READING` (a takeover's charges and rounds in
flight go with the seat) and with it `DEPARTED_CHARGES_READING` (a takeover is no departure), `ARMORY_TOUCH_READING`
(the touch layer hidden and its stance and RELOAD gated while the screen is open) and `ARMORY_SEAT_READING` (an
abandon keeps a held seat held), and adds one, `ARMORY_ABANDON_READING`. The polish pass (2026-10-01, §2.7)
retracts `UI_OBJECT_TEXT_ORIGIN_READING` and `TITLEBAR_VERTICAL_READING` (both retired, replaced by `UI_TEXT_ORIGIN`),
checks `SPECIAL_GLYPH_PLACEMENT_READING` on the lobby frame, and adds `UI_TEXT_ORIGIN_RESIDUAL_READING`
and `ARMORY_CHROME_OVERLAP_READING` (note only). The owner's ARMORY captures (§2.8) then correct R95.6, answer
`ARMORY_PANE_TEXT_READING` and `FOURTH_CHAR_AOP_READING` (resolved), and add five: `FOURTH_UNLOCK_READING`,
`ARMORY_LOCKED_TAP_READING`, `TEXT_FADE_ALPHA_READING`, `MULTILINE_LIFT_READING`, `ACT_FRAME_BORDER_READING`.
The sprint's finish (2026-10-01, the controller's rulings under the owner's mandate) answers
`ARMORY_CHROME_OVERLAP_READING` (resolved: the site's chrome hidden while the screen is open), extends the waiting
room's ARMORY row (closing it rebuilds the waiting body at once) and `ARMORY_SEAT_READING`, and adds one,
`ARMORY_SERVER_NAME_READING` (the title bar's server name over `ARMORY_GAME_NAME_READING`'s). The browser checks' follow-up (2026-10-01)
extends `ARMORY_CHROME_OVERLAP_READING` (resolved; the page's toast held while the screen is open), `KEPT_RECONNECT_READING` and
the waiting room's row (the launch countdown announced once; a classic room's only; a page going closes its socket
cleanly), and adds one, `ROUND_START_PROJECTILES_READING`. The owner's ruling of 2026-10-02 (§9)
retires `ARMORY_BETWEEN_ROUNDS_READING` (retired) and the waiting room's Inventory-button entry, and leaves
`ARMORY_SEAT_READING` the only way in.

2026-10-04 (ARMORY-FIX, PLAT-34's block): two changes to the drawn screen. (1) ARMORY_FRAME_FIT, the owner's defect of
2026-10-04 ("the armory does not downscale at the proper resolution with the screensize like menu UI would"; his
`0eb90a69`): the 640x448 frame is fitted whole into the window -- scaled by min(width / 640, height / 448), centred,
letterboxed -- as the front end's menus are, not by height / 448 alone (WEAPON EXCHANGE's and the scoreboard's rule,
which stays theirs); the model camera's field widens over the letterbox (`armoryView.ts` `modelCameraFov`) and a tap
is read back through the same fit (`frameOfBuffer`). A browser adaptation, no source: the console's frame was the
screen. Pinned at seven window shapes, portrait to 32:9, by `viewer/test/armoryFrame.test.ts`. (2) The preview's
projection (`MODEL_CAMERA_READING`, `UI_CAMERA_READING`) is research 182 §2.29 / §2.35's, re-read at the source:
`FUN_00318da0` calls `FUN_00291490(0x3f1c61aa, cam, 1)` (D:L217205), which stores 35 deg and sets +0x290 = +0x4b0 x
cos / sin (the two helpers are fdlibm's `sinf` and `cosf`, by their small-angle kernels), i.e. 320 x cot 35 deg;
`menu.rdram`, `menu3.rdram` and `menuC.rdram` all read 457.0074 at camera 0xd6df20 +0x290. The focal is now 457.0074
px per unit, square (fovY 52.22 deg), not the record's pi/4 (540.8): the models are drawn 15% smaller and centre on
`EquipWeapWin`. The two compose: a model's size and place scale with the frame alone (the same test).
2026-10-04, the review's fix: the page's tap is mapped from the canvas's CSS box to its drawing buffer before the
fit (`armoryView.ts` `frameOfClient`, `main.ts`), since the PS2 look stretches the 640x448 buffer onto a 4:3 box and the
box read as the buffer missed the top and bottom rows by about 15; pinned by `viewer/test/armoryTapMap.test.ts`, and
`e2e/armory.spec.ts` taps by the fitted rule.

| name | stands for | searched / reading | status |
|---|---|---|---|
| `DEFAULT_CHARTYPE_PLACEHOLDER` (existing, research 91) | the type a player gets without choosing | answered: SEAL 1 / TERRORIST 1, type index 0 / 4 (R95.5; lobby `FromBriefing`, `switch_teams_anim`, `SwapClanSides`, ARMORY `UiEquipSwitch`) | answered by source; **retired in S2**: the code names the rule `DEFAULT_ARMORY_TYPE` (`scene/src/armoryCharacters.ts`, §6) |
| `ARMORY_TYPE_FALLBACK_READING` (named in `match/src/room.ts`, S2) | a type the side does not offer, named by a page's hello | the game re-validates a stored profile's items against the map's valves on load (`EquipCharacterProfileSeal/Merc*`, §4.4) and falls back to `MpCharSet` 1/5 without a profile (R95.5); the room never refuses the join: `seat` (`Room.seat`) seats the hello's type (or, for a spectator, the types its last ARMORY choice sent) when the side offers it, else the type the player's record held on that side (a reconnect: `kept`, keyed by the page's session token within `KEPT_RECONNECT_READING`, S2 round 4), else the default -- and the welcome (a promotion too) names the type seated (`char`, S2 round 3); a `loadout` request naming one is refused `type` | open |
| `ARMORY_OUTSIDE_ROUND_READING` (named in `match/src/room.ts`, S2) | when the room takes a living player's type and picks | the game's ARMORY is the lobby's, outside a round (§4.1), and has no in-round gate; the viewer's stand-in (W5.R1) is the room waiting for its sides and the round-end interval: the room takes a living player's request then, for the next spawn, and keeps WEAPON EXCHANGE's `alive` refusal in a round (`play`, `expired`, `decided`; `match/src/room.ts` `inRound`). In a round the dead player's menu is WEAPON EXCHANGE, which changes the kit, never the type (research 94 §B2): a player that has spawned in the round (`Player.spawnedIn`, the room's round serial) is refused a new type as `round` until the round is over -- a respawn room's respawn keeps its type -- while its picks for the type held are taken; a ghost seated in the round has not spawned in it and chooses its type as a joiner does; a spectator's choice is kept for its seat (`loadout`'s `types`), and one arriving after its promotion is taken as its side's type under the same gates, unanswered (`lateTypes`). `lateTypes` drops it silently in two cases: a respawn room, whose promotion spawns the seat alive in the round at once; and classic, a spectator promoted in the round-end interval (a ghost) whose types arrive after the next round began and spawned it. The pick itself is refused there by design (the round gate); the desync it left -- the page on its choice, the room on the seat's type -- is cured by the promotion's `char` (the type the seat took) and the page's re-send: the page holds the room's type and asks for its own again with a type-only request, answered `round` (or `alive`) through the normal path, so it shows the room's type (S2 round 3; `viewer/test/armoryTypePage.test.ts`, the interval race). The gate holds across a reconnect: a player that spawned on that side in the round in play keeps that type until the round ends -- the hello's type waits and the new seat counts as spawned in the round (its record, `kept.spawnedIn`; `Room.seat`) -- so a dead player cannot leave and rejoin as another type mid-round. The record is the page's own (S2 round 4): keyed by its per-tab session token alone (the hello's `session`, `viewer/src/net/session.ts`: 128 random bits kept in the tab's session storage, so a reload -- F5, even an unnamed page that gets a new guest name -- sends the same one), taken once, within `KEPT_RECONNECT_READING` of the leave; never by address or name, so two tabs of one machine keep a record each and a rename neither takes nor erases another tab's. A reconnect that comes while its old socket is still seated (an unclean drop: the page retries at once, the heartbeat drops the dead socket 5-10 s later) takes the seat over (`Room.takeOver`): the old socket is told `kicked` 'replaced' and closed (4006, `SESSION_REPLACED_CLOSE`), and the new one keeps the seat's name, side, type and record -- no "(2)" -- seated as a reconnect is (a classic round in play: a ghost). A page without a token (an older page), or with a malformed one, is a new joiner with no record. The honest limit: a new tab, or cleared session storage, is a new joiner -- a player who deliberately opens a new tab mid-round comes in as a ghost that chooses its type, which is the join rule W5.R1 allows. The welcome names the type the room seated (`char`), and the page holds it: it re-sends its list for that type whole, then asks for its own type again as above. Pinned by `match/test/roomLoadout.test.ts` | open |
| `KEPT_RECONNECT_READING` (named in `match/src/room.ts`, S2 round 3; keyed by the page's session token, round 4) | how long a departed player's record (type, picks, round spawned in) waits for its reconnect, and what the record is keyed by | the game has no reconnect (a departure is a leave: research 91 §17, `FUN_002bc530` L161130-161140); a server policy: the page's rejoin comes at once, then 2, 4, 8, then every 10 s after a drop (`viewer/src/netPage.ts` `retryDelayMs`, 44 s through its seventh attempt; PT195-4) and the heartbeat drops a silent socket 5-10 s after it stops answering (`match/src/server.ts` `HEARTBEAT_MS`): 60 s. The key (S2 round 4) is the page's session token alone -- one a tab, in its session storage, sent with each hello (`viewer/src/net/session.ts` `PageSession`) -- never the address or the name. Past the window the token is a new joiner's -- so a dead player that stays away longer than that may come back as another type mid-round. Its honest limits: a new tab, a new window, or cleared session storage (a private window's end) is a new joiner at once, and without session storage the token lasts the page's life (a reload is a new joiner); a duplicated tab starts with a copy of the original's token, so its hello takes the original's seat over, and the original, told `kicked` 'replaced', renews its token and joins again as a new joiner. The token is kept per server origin (`s2u.session:<origin>`, `viewer/src/net/session.ts` `sessionKeyFor`, the S3 review), so a page that joins another server (`&server=`) never sends it this one's. The token is no credential for anything else and is never logged (`match/src/server.ts` `sessionTag`: 8 hex digits of its SHA-256 at most). Pinned by `match/test/roomLoadout.test.ts`, `central/test/server.test.ts` (two windows on 127.0.0.1, a takeover, the log) and `viewer/test/pageSession.test.ts` The browser checks' follow-up (2026-10-01): the page sends its socket's close frame as it goes (`NetPage`'s `pagehide`, 1000 'left'), so a closed browser's seat is dropped -- and a launch countdown called off -- on the close itself, not 5-10 s later; the heartbeat stays the fallback for a close that never comes (`central/test/server.test.ts` "a clean close", `viewer/test/netPageConnect.test.ts`). A page shown again from its back-forward cache joins afresh (`main.ts` `pageshow`) | open |
| `ARMORY_PROFILE_KEY_READING` (answered by the W5.R4 amendment; `viewer/src/armory.ts` `profileKey`, S3) | the saved loadout's key | source: (host, port, account, mission) x side, the type inside the record (`FUN_002fb470` L198753-198799, `FUN_002fb610` L198800-198900); W5.R4 says per type. Reading: map + side, type in the record -- **for the owner**; ruled (W5.R4 amended): map + side, the type in the record, `s2u.armory.v1.<MAP>.<side>` | answered by ruling |
| `ARMORY_MEMCARD_SAVE_READING` (*note only*) | what `SaveCharacterProfile` modes 3/4 persist, given the unused `_23_StoringChar_MSG` | `FUN_0033eb70`/`FUN_0033e7f0` ("WeapProfile_%d.dat") not read further | open |
| `ARMORY_CONFIRM_VALUE_READING` (named in `viewer/src/armoryState.ts`, S3) | which popup button writes `AreYouSure` 1 or 2 | reading: YES (253, the second record) = 2, NO (246) = 1; the popup record bytes and `UIPopUpDialog` 0x27eb10 read, the button handler not traced; S3 reads the chosen record index + 1 and opens on the record the POPUP's byte +66 names (`ARMORY_POPUP_FOCUS_READING`) | open |
| `ARMORY_POPUP_LAYOUT_READING` (named in `viewer/src/armoryLayout.ts`, S3) | the popup's numeric words (150, 180, 100, 340, 45, 25, 1.0, rgb 128 ...) | decoded only to the text and button ids (§1.2); S3 decodes the panel (+8..+20 x, y, h, w; +24/+28 the text offset; +32 its scale; +36 its colour) and the 76-byte button records (`decodePopup`), drawn on `popupOp.tif` | resolved 2026-10-04 (ARMORY-UI: laid out from the record, research 118 §3; research 182 §2.16) |
| `ARMORY_BUTTON_PRECEDENCE_READING` (named in `viewer/src/armoryState.ts`, S3) | a control's own TRIANGLE versus the screen's `BUTTON=TRIANGLE` | reading: the control's wins; character select has none, so the screen's `returnto_lobby` applies; the menu input dispatch not read | open |
| `SUSPEND_MENU_INPUT_READING` (named in `viewer/src/armoryState.ts` `SUSPEND`, S3) | the unit of `SuspendMenuInput`'s argument ("0.5", "2.0", "2.3", "4.0", "5") | parsed by `FUN_00191478`, stored at menu +0x900 (`FUN_001f3bb0` L54349); reading: seconds (a "0" ends it) | open |
| `ARMORY_CLOCK_READING` (named in `viewer/src/netPage.ts` `nextRoundIn`, S3; the S3 review) | when the viewer's `mp_x_sec_clock` first changes (the pull-out) | the game's clock is the lobby's launch count (§4.1); reading: the viewer's round-start timer starting; in the round-end interval the next round's start is known (the engine's 3 s and the screens' seconds), and popup 47 shows 5 s before it. The game's popup holds the screen and leaves for the lobby; the viewer's is a notice over a screen still the player's (`armoryState.ts` `pullOut`: the S3 review's ruling, every change already applied), the round's start closing the screen | open |
| `ARMORY_MODE_READING` (retired 2026-10-23, MLS-LIMIT) | `EQlimit` in the viewer | CREATE GAME now passes trusted GameStats byte 5 through the room and page; the shared original mode programs drive ARMORY, validation and spawn, including No Bombs firearm preservation ([research 362](362-equipment-limits.md) §§1-3; reviewed reading) | retired: the hard-coded unrestricted mode is removed |
| `ARMORY_INIT_VOICE_READING` (*note only*) | what `UIInitializeOnlineArmory` does | `FUN_0030e6e0`/`FUN_0030e490` L210660-210687 on `DAT_0045b718`: state 0xb, flag +0x4a cleared; read as the voice/headset object, no ARMORY effect | open |
| `ARMORY_PADLOCK_SEAL34_SWAP_READING` (answered by ruling; the scripts play it, S3) | the shipped Seal3/Seal4 padlock swap (§3.6) | reproduce as shipped or fix -- **for the owner**; ruled (Log 2026-09-30): kept as shipped -- `TurnOnPadlocks1` runs as the disc has it (`viewer/src/uiScript.ts`) | answered by ruling |
| `ARMORY_MISSING_ANIMS_READING` (named in `viewer/src/uiScript.ts`, S3) | `TurnOffLoadingText`, `DisableThermalScope`: called, defined in no set | every UIZANIM set's names; `FUN_0025d5c0` finds nothing: no-ops | open |
| `ARMORY_ABSENT_OBJECTS_READING` (the script player makes their nodes, drawn nowhere, S3) | `NoAvailRoom`, `ClayAvailText`, `WepTabText`, `silencer`, `SpecterSecLock`, `VandalSecLock`, `arrow_up`: targeted, not in the layout | the 226 objects; their commands do nothing | open |
| `ARMORY_ALL_SEL_HAVE_READING` (*note only*) | `DoAllSelCharsHaveWeapon`/`Equip1-3` | the decomp lacks 0x2808e0's body; `FUN_00281160` L127787-127926; read as "every selected character holds the item" | open |
| `FOURTH_CHAR_AOP_READING` (named in `scene/src/armoryCharacters.ts`, S1) | the 4th column online | **answered by the owner's capture and the maps' `mission.rdr`** (§2.8): `InWhichAOP` is the map's; on 51-83 the column carries the unlockable's name (ALG OFFICER on Crossroads) over its portrait, locked | resolved by the capture and the source; the name retired from the code |
| `FOURTH_UNLOCK_READING` (`scene/src/armoryCharacters.ts`, polish pass) | the campaign's unlock valves online | `SetSabre` ... `SetValeska` come from the campaign save (`dlgDebriefing` `TestForCompletionLevel`); the viewer holds none, so every one reads 0 and the 4th column of maps 51-83 stays locked -- a capture from a save with the AOP completed would show it open | open; *owner-ruled: unlocked (OT.R91, 2026-10-31)* -- `CAMPAIGN_UNLOCKS_EARNED_RULING` feeds every `Set<Name>` as 1; the reading is unchanged |
| `ARMORY_LOCKED_TAP_READING` (`viewer/src/armory.ts`, polish pass) | a tap on the locked column | the pad never reaches it (`ActivateMPCharStack` steps over it while `DisableFourthChar` is 1); a touch screen's tap is the page's own: refused with .NEG (`HUDUI.bnk` 4, the scripts' refusal) -- chosen, not read | open (owner) |
| `ENABLE_VALVE_DEFAULTS_READING` (named in `viewer/src/armory.ts`, S3) | the `Enable_*` values when `EQlimit==0`, and `Enable_c4`, `Enable_red_smoke`, `Enable_empty`, `Enable_F2000*`, `primsel/secsel/equipNsel`, `UiCharLocked`, `mp_x_sec_clock`, `InWhichAOP`, `Set{Sabre..Valeska}` | written by neither ARMORY set; the map's `mission.rdr` Valves and the code (§4) are the sources S1 reads; S3 seeds the script player with the map's `mission.rdr` Valves and writes the selector valves from the state (`armoryValves`) | open |
| `MODEL_CAMERA_READING` (named in `scene/src/uiLayout.ts`, S1; its use in `viewer/src/armoryView.ts`, S3) | the units and use of AZIMUTH/ELEV/DISTANCE and ROTX-Z | loader `FUN_003812b0` only; the preview renderer not traced. S1 reads the three as the file gives them (DISTANCE default 20). S3 reads them by fit as the model's place, (AZIMUTH, ELEV, -DISTANCE) before a camera at the origin looking down -z with `UI.ZED`'s vertical field of view pi/4: every entry's AZIMUTH/DISTANCE is 0.37-0.40 and ELEV/DISTANCE 0.09-0.12, so all 67 land inside `EquipWeapWin` at about (534, 164), its centre row (`viewer/test/armory.test.ts` checks all 67 on the disc's dialog); ROTX-Z are not used (no `RUN/UI/READERC.ZAR` dialog carries the key). 2026-10-04: the place read at the source (R140.4) and the projection replaced -- research 182 §2.29: 457.0074 px per unit, square (`FUN_00291490(35 deg)`, D:L217205; `menu*.rdram` cam+0x290), so the 67 land x 483-506, y 160-184, on the window's centre (497.5, 164) | resolved 2026-10-04 (research 182; the frame's fit ARMORY_FRAME_FIT composes with it) |
| `UI_CAMERA_READING` (`viewer/src/armoryView.ts` `MODEL_CAMERA_READING`, S3) | `UI.ZED`'s `cameras/camera` (144 B) | partly decoded: +32 = 0.7854 (pi/4), +36 = 0.54978 (= +32 x 448/640), +40 = 4.0, +44/+48 = 100, +108 = 270, +124 = 20, +132 = 120, +136 = 100 (the rest 0 or 1). S3 takes +32 as the preview's vertical field of view (the fit above); the other words are not used. 2026-10-04: the world loader overwrites +32 with 35 deg (`FUN_00318da0` -> `FUN_00291490(0x3f1c61aa)`, D:L217205), whose +0x290 = 320 x cot 35 deg = 457.0074 is the focal (research 182 §2.35); +32 is not used | resolved 2026-10-04 (research 182) |
| `SPIN_SCREEN_SENSE_READING` (`viewer/src/armoryView.ts`, S3) | clockwise or counter-clockwise on screen for -Y in the model frame | depends on the UI model camera; S3 applies the stored quaternion in a y-up, right-handed frame looking down -z: seen from above the model turns clockwise, its near side moving left | open (owner's capture list) |
| `BAR_SCALE_ORIGIN_READING` (`viewer/src/armoryLayout.ts`, S3) | the stat bar's x-scale anchor | reading: the left edge at the object's XPOS; the setter writes the diagonal (L215015), the 2D draw not traced. S3 sizes every IMAGE by its node's x/y scale from its left and top edges (only the bars are scaled by the scripts) | open |
| `CHILD_OPACITY_INHERIT_READING` (`viewer/src/armoryLayout.ts`, S3) | whether `arrow_rt`/`arrow_dwn` pulse with their parents | OPACITY writes only node+0x9c; reading: an object's opacity is its own -- `PulseArrows2` (never called) pulses `arrow_dwn` itself, which an inherited opacity would not need, and the dialog's opacities never compose (the windows at 0.35 under `EquipWeapOpaque`) | resolved 2026-10-04 (ARMORY-UI: multiplied, `CHILD_OPACITY`; research 182 §2.23) |
| `TELETYPE_DT_UNIT_READING` (`viewer/src/armoryText.ts`, S3) | dt in seconds; +0x3c as the typed width | the caller of vtable+0x38 not traced; S3 types at INTERVAL x scale px a second (1197 at 0.9), a break restarting the distance (L272414-272437), `#P<n>` in seconds | open |
| `TELETYPE_TICK_SOUND_READING` (`viewer/src/armoryText.ts`, S3; the S3 review) | the sample of menu cue 1 | `DAT_0049ea88`'s bank not resolved; `.TYPE` (`uisounds.rdr` TELETYPE), played once a frame that appends past the first character (`FUN_0036a300`, gated by `DAT_003e03a8` = 1 on the retail ELF) -- as one voice, stopped and started again at each tick from one render kept per name (`viewer/src/audio.ts` `GameAudio.restart`), never a new voice stacked a frame | open |
| `UI_OBJECT_TEXT_ORIGIN_READING` (named in `viewer/src/armoryLayout.ts`, S3) | TEXT y: top or baseline | **retracted in the polish pass** (§2.7): `YPOS` is the bottom of the face's cell (`FUN_00361bd0` L260374-260460, `FUN_00362900` L260663-260706), now `UI_TEXT_ORIGIN`; read as a foot every text sat 4.7 px (titlebar 9.3) low -- the owner's highlight, caption and strip defects | answered (source + lobby frame) |
| `UI_TEXT_ORIGIN_RESIDUAL_READING` (`viewer/src/armoryLayout.ts`, polish pass) | what is left after the cell-bottom rule | the runtime offsets `DAT_0049e9a0/a8/ea04` the corners add are not in the decompilation, taken as 0; on `A_54_gamelobby2.png` the `font_text_01` lines land within one grab row (0.93 frame rows), `font_titlebar_01`'s GAME LOBBY 1-2 grab rows lower than the console's -- the owner's ARMORY captures (§2.8) agree: `font_text_01` lines +0.4 to +1.2 rows, the titlebar face +1.2 to +1.3, ours lower; the columns -0.3 to -1 (the HUD's `PEN_NUDGE`, fitted with the GS sample offset this pass does not apply) | open (runtime offsets) |
| `TEXT_FADE_ALPHA_READING` (`viewer/src/armoryLayout.ts`, polish pass) | a faded text's alpha | `FUN_00362b20` replaces the alpha only while it is 128 when the font is set; a script's later opacity is the alpha, except that a fade ending at 1.0 draws at the face's opacity again -- no ARMORY text fades | open |
| `MULTILINE_LIFT_READING` (`viewer/src/armoryLayout.ts` `LINE_LIFT`, polish pass) | where a WRAPPEDTEXT's lines stand | the TELETYPE's `DAT_003e0390` (-5) row (its cursor's, `FUN_00378c00`), measured on the WRAPPEDTEXT `WepInstText` in the owner's capture (lines 4-5 rows above the single-line rule); the WRAPPEDTEXT draw itself was not read | open |
| `ACT_FRAME_BORDER_READING` (`viewer/src/armoryLayout.ts`, polish pass, §2.8) | the gold frame's width | `eq_wep_bgHL.tif` (128x256, 3-texel border, alpha 253) over 152x290 draws 3.5 px wide here, 2 px in the capture at 0.75-0.93 of its colour; the GS texture setup of the 2D quads (TEX0/TEX1, UV range) was not read | resolved 2026-10-04 (ARMORY-UI: S/T 0.01..0.99, `ARMORY_SPRITE_UV`; research 182 §2.2) |
| `UI_MODEL_FORM_READING` (`scene/src/weapon.ts`, S1) | the UI models' `'bias'` form | chosen by fit to the bbox (TOP+3 on all 513 packets; both forms fitted), not from the EE command list; `weaponLibrary` takes it as its `form`, and `scene/test/weapon.test.ts` pins the fit (84 of 85 nodes within 0.1 unit as `'bias'`, RPG7UI's group node `g15` the exception; none as `'scale'`) | open |
| `UIMNLOC_UTF8_READING` (`scene/src/uiLoc.ts`, S1) | the `C2` lead byte consumed | frame A_53; text functions `FUN_00361bd0`..`FUN_00363c20` (L260235-261420) and the LOC loader `FUN_003a3be0` (L297317-297470) searched for 0xc0/0xc2/0xe0 masks. S1 decodes every two-byte sequence (lead 0xC2-0xDF) to its code point, which also turns the file's one `C3 AB` into 0xEB; decoded, the 1,411 strings hold 245 crosses (the file's 243 `C2 A6` pairs, two strings shared) and no lead byte | open |
| `ARMORY_CHROME_OVERLAP_READING` (*note only*; polish pass, §2.7) | the title row cut off in the owner's screenshot | not the frame: the owner's image shows the frame from row 58 (its scale 2.65 across, 2.83 down: the PS2 look's 4:3 box), so rows 0-57 were under the site's bar `#site-links` (fixed over the canvas; `body.armory-open` hides only the touch layer) or outside the grab; the page's chrome is outside the ARMORY's drawing files -- the owner's capture of the original shows the same title row whole (ARMORY, the server and game names, the map, the light at rows 25-55), and ours draws it at the same rows (§2.8): what hid it is the page's chrome or the grab -- a screenshot of the whole window settles which. Settled by the controller's ruling (2026-10-01): the site's bar covered it -- while the screen is open (`body.armory-open`) the site's chrome (`#site-links`, `#panel`, `#controls`, `#fps`, `#fullscreen`) is hidden, and restored when it closes (`viewer/src/styles.css`; pinned by `viewer/test/armoryGlue.test.ts`) The page's toast ("Online: in the match") lay over the title bar too (the browser checks, 2026-10-01): the original's ARMORY shows no such pill, so while the screen is open a toast is held -- the newest kept, one showing taken down and kept -- and shown when it closes (`viewer/src/toastHold.ts`, `Ui.holdToasts`; `body.armory-open #toast` hidden; pinned by `viewer/test/toastHold.test.ts`) | resolved (the sprint's finish) |
| `TITLEBAR_VERTICAL_READING` (named in `viewer/src/armoryLayout.ts`, S3) | `font_titlebar_01`'s vertical placement | **retracted in the polish pass** (§2.7): both faces follow one rule, the cell's bottom on `YPOS`; the atlas puts the titlebar's capitals on rows 9-38 of 51 (the S3 reading stood them on 40.8) | retired: replaced by `UI_TEXT_ORIGIN` (source) |
| `SPECIAL_GLYPH_179_READING` (*note only*) | code 179's inverted rectangle; the uncoded star | the atlas and `fonts.rdr` | open |
| `DPAD_GLYPH_DIRECTION_READING` (`viewer/src/hudFont.ts`, S4) | the d-pad glyphs' directions (163 / 175 / 177 / 181) | answered: right / left / down / up -- the atlas's pixels (measured by `viewer/test/hudFont.test.ts` on the disc's `FONT_TXR`) and the code (the prompt's 0xA3/0xAF name the dead player's cycle, pad bytes +3 Right / +4 Left, `FUN_00592560` L451683-451694); research 94's `GLYPH_READING` (up/down) retracted (§5.4, §7) | answered by source |
| `SPECIAL_GLYPH_PLACEMENT_READING` (`viewer/src/hudFont.ts`, S4) | where a pad glyph sits on a line | `FUN_00361bd0`'s corners read on the y-down frame, placed relative to the letters' fitted cell: top (baseline - DispPos.y - h + 25) rows below the letters' top, h x VertScale tall, (width x HorScale - 1) x S + 0.5 wide (§5.4); no console frame shows one in the HUD's lines -- a capture of the dead player's prompt settles it; the polish pass (§2.7) checks the rule on a console frame for the dialogs: on `A_54_gamelobby2.png` the cross (0xA6) and L1 glyphs of the lobby's lines land on the console's rows and columns exactly, the cell-bottom origin applied; the HUD's lines remain unmeasured | open for the HUD (owner's capture list); matched for the dialogs |
| `FONT_DUP_GLYPH_READING` (`scene/src/uiFont.ts`, S1) | which of code 96's two entries the engine keeps | `hudFont.ts` keeps the first, and so does S1's `glyphOf`; the engine's lookup not traced | open |
| `UI_BANK_PLACEHOLDER` (`viewer/src/armory.ts`, S3) | the "UI" bank `FUN_003448e0("UI")` asks for (L54851) | not in BNKSTORE (research 81 §1); the ARMORY's sounds are HUDUI's, and the page plays them from `HUDUI.bnk` (`viewer/src/main.ts`, the ARMORY's `sound`) | open |
| `ARMORY_RULES_READING` (`viewer/src/armoryState.ts`, S3) | the ARMORY's own slot rules (`CanCharactersSelectUIWeapon`, the free-slot count `FUN_00284120`, the partner `FUN_00282f20`) against the in-game ones the room replays | the viewer steps by `selectable` / `slotLocked` / `pick`, so every item shown is one the room takes (`applyPicks`); the two differ where a cost-2 item's partner slot holds a locked item, which no default kit reaches | open |
| `ARMORY_EMPTY_PICK_READING` (`viewer/src/armoryState.ts`, S3) | the equipment scroll's UI 0 (empty) | skipped: the room's replay has no pick of an empty slot (`applyPicks` refuses an unknown id) | open |
| `ARMORY_POPUP_FOCUS_READING` (`viewer/src/armoryState.ts`, S3) | the button the confirm opens on | the POPUP record's byte +66 = 1, read as the second record (YES); the handler not traced; Triangle in the popup answers NO [inferred] | resolved 2026-10-04 (ARMORY-UI: NO, `ARMORY_POPUP_FOCUS`; research 182 §2.15) |
| `ARMORY_PROFILE_REVALIDATE_READING` (`viewer/src/armoryState.ts`, S3) | a stored kit the map's valves no longer admit | `EquipCharacterProfileSeal/Merc*` re-validate each item on load (§4.4), the failure's handling not read: the viewer keeps the type and drops the kit for the type's own when the room's rules will not reach it | resolved 2026-10-04 (ARMORY-UI: per item, `readProfile`; research 182 §2.18) |
| `ARMORY_BETWEEN_ROUNDS_READING` (`viewer/src/armory.ts`, S3; ruled in the S3 review) | how the ARMORY opens between rounds (W5.R1) | **retired by the owner's ruling of 2026-10-02 (§9)**: nothing in a match opens the ARMORY; the constant and the page's gate (`armoryGlue.ts` `inventoryOpensArmory`) are gone. Was: not forced over the round's screens: the Inventory button (R2, `I`, the touch `INV`) opens it at any time in the round-end interval (no longer only while more than 5 s remain); each change is applied as it is made (live: the game's `ChangeCharacterType` and `Choose*` apply at once, §3.2-§3.4), popup 47 shows 5 s before the round as a notice, and the round's start closes the screen; DONE simply closes. The controller's ruling under the owner's mandate -- **for the owner** | retired (the owner, 2026-10-02) |
| the waiting room's ARMORY (`viewer/src/armoryGlue.ts` `inventoryOpensArmory`, `netPage.ts` `waitingRoom`) | whether the Inventory button opens the ARMORY in a room no round has started in | **its Inventory-button entry retired by the owner's ruling of 2026-10-02 (§9)**: in the waiting room the button is the swap's (alive) and nothing opens the ARMORY; what follows still holds for a seat's own screen (`ARMORY_SEAT_READING`) -- the launch countdown, the round's start closing it, `ready` rebuilding the waiting body. Was: **the owner's ruling of 2026-10-01**: a player waiting in a room nobody else has joined presses the Inventory button (`I`, R2, the touch `INV`) and the ARMORY opens; its choices are the room's (outside a round a request is the ARMORY's, `ARMORY_OUTSIDE_ROUND_READING`), taken for the round's spawn. Through the launch countdown (`OWNER_LAUNCH_COUNTDOWN_S` = 10, research 91 §19, the same day's ruling) it may stay open and its choices still go live; the round's start closes it. **The controller's ruling under the owner's mandate (2026-10-01)**: closing it there (the page's `ready`) rebuilds the waiting body and kit at once with the choices -- a spawn in place, where the body stands, every page told (`match/src/room.ts` `Room.ready` -> `rebuildWaiting`), nothing when the choices are unchanged; a living player in a round is still refused (`alive`) and its `ready` rebuilds nothing. Pinned by `match/test/roomLoadout.test.ts` ("a waiting room's `ready` rebuilds the living body at once"). *note only*: a ruling, no constant The launch countdown (the browser checks' follow-up, 2026-10-01): announced once a page -- the seat whose welcome or promotion completes both sides is told by it and left out of the next tick's `countdown` broadcast (the room's `preTold`), and the page posts the line once for the same countdown told twice (`COUNTDOWN_SAME_MS`); a classic room's only, as the owner's ruling reads (research 91 §19: "once both sides have a player ... before round 1"; a respawn room plays from its first seat), the clock and the welcome reading one length (`Room.launchWaitS`); a side emptied calls it off on the leave itself (`callOffCountdown`) | answered by ruling; the button's entry retired 2026-10-02 |
| `ARMORY_WAITING_LAUNCH_READING` (`viewer/src/main.ts` `newRound`, S3; the S3 review) | the waiting room launching (the second side seated) with the ARMORY open | the viewer's room gives no launch count there; every choice reached the room as it was made (live, `ARMORY_SEAT_READING`: the waiting seat is held, not alive, so the room takes each), and the round's start closes the screen and spawns the seat with them (`Room.startRound` clears `arming`). A change still in the page's 150-ms send window (`ARMORY_SEND_DEBOUNCE_MS`) at that instant is dropped by the round's start, not sent (the S3 repair, `ARMORY_ROUND_START_RACE_READING`): the room would have refused it `alive`, the page left on the room's kit either way | open |
| `ARMORY_MENU_KEYS_READING` (`viewer/src/armory.ts`, S3; the S3 review) | the PC keys inside the ARMORY | W/S/A/D or the arrows the d-pad, Enter/X/Space Cross, Backspace Triangle, R Circle, V Square; the lines draw the keys in place of the pad glyphs on a keyboard only -- a pad and a touch screen keep the game's glyphs; while it is open no key, stick or button reaches the game (the camera's `setInputSuspended`, the peek's `keysOpen`, the map's and the scoreboard's gates, `NetPage`'s `menuOpen`) -- **for the owner** | open |
| `ARMORY_TOUCH_READING` (`viewer/src/armory.ts` `armoryTap`, S3; the S3 review) | taps and clicks on the ARMORY | a column's window steps the cursor to it, a second tap commits; the arrows are their d-pad sides; a pane is its row where the scripts have put it (its node's place, not a fixed origin; the DONE pane stepped to and Cross); the instruction line split at its second glyph (the circle): a weapon row's Square left and Circle right, DONE's Cross left (the literal "Accept loadout", §3.3) and Circle right; "BACK" Triangle; the popup's buttons answer -- **for the owner**. The second S3 repair: while the screen is open the page's touch layer is hidden (`body.armory-open`, `viewer/src/armoryGlue.ts` `syncArmoryTouch`; its sticks and held buttons let go as it opens), so no touch button over a pane takes the tap meant for the screen, and the layer's two callbacks that reach the body directly are gated -- the stance's press (`pressUnlessArmory`: its release and cancel still go through, so a hold cut short never turns prone) and RELOAD (`unlessArmory`). Pinned by `viewer/test/armoryGlue.test.ts` | open |
| `ARMORY_PANE_TEXT_READING` (`viewer/src/armory.ts`, S3) | the panes' `Char<n>...Descr` UIVARs | **answered in the polish pass** (§2.8): `FUN_002af190` (L153580-153640) writes each type's kit into them through `FUN_003d2820`, the item's +0xc -- its `Description` (`FUN_003d2ac0`, L322176-322180), not its `DisplayName`: FRAG, HE GRENADE, TA 12 GAUGE as the capture shows; a missing item "(unknown)", the slots past the kit "<NONE>" | resolved 2026-10-04 (ARMORY-UI: `ARMORY_PANE_TEXT` = Description; research 182 §2.14) |
| `UI_TEXT_DEFAULT_COLOUR_READING` (`viewer/src/armoryLayout.ts`, S3) | a TEXT with no `COLOR` (the panes' names) | (128, 128, 128), the bitmap's own on the GS scale, as the HUD's white | open |
| `UI_DRAW_ORDER_READING` (`viewer/src/armoryLayout.ts` `armoryTree`, S3; sourced in the S3 review) | the dialog's draw order | the node tree as the screen's builder makes it: `FUN_00367950` makes the background (L263560-263566, on the dialog's root +0xc4), the `MENUFADER` (L263613-263626) and later the `POPUP` (L263661-263669) on the menu's root +200, and between them every `CONTROLS` entry (L263627-263647) before every `OBJECTS` entry (L263648-263653), each through `FUN_003696d0` (L264427-264480), which adds the node under its `CHILDOF` among the nodes made so far, else under the root. So `EquipWeapOpaque`'s 0.35 `backsolid` windows (controls) lie beneath the bars, labels, panes and texts (objects); the walk (a parent, then its children in the order added) is read, not traced | open (owner's capture list) |
| `ABSENT_PARENT_READING` (`viewer/src/armoryLayout.ts`, S3; answered in the S3 review) | an object whose `CHILDOF` names no object (`net_conn_ind_*` under the absent `letterbar`) | `FUN_003696d0` L264444-264456: the parent looked up by name among the nodes made so far, else the dialog's root (+0xc4) -- the node draws at its own position: the network lights at (577, 25) and (586, 34), `net_monitor` (UIanim.rdr) run for them (`viewer/src/armory.ts` `HOST_ONSTART`) | answered by source |
| `CONDITION_PRECEDENCE_READING` (`viewer/src/uiScript.ts`, S3) | the condition evaluator's precedence (`FUN_0025e960`) | NOT, then AND, then OR; the ARMORY's mixed conditions all parenthesise, the rest are all-AND or all-OR | open |
| `LOOP_YIELD_READING` (`viewer/src/uiScript.ts`, S3) | whether a WHILE's pass back or a LOOP yields to the next frame | yes: the polling scripts (`UiBackToLobby`, the confirm's `AreYouSure` wait) never spin a frame away | open |
| `ZANIM_RECALL_READING` (`viewer/src/uiScript.ts`, S3) | `CALL_ANIMATION` of an animation already running | starts it over (`CallShowAndSpin` stops it first either way) | open |
| `CALL_ANIMATION_AT_ONCE_READING` (`viewer/src/uiScript.ts`, S3) | when a called animation first runs | at once, inside its caller's tick, up to its first timed command -- the order that keeps `UiEquipSwitch`'s columns hidden until `MPSealPlace` slides them | open |
| `TELETYPE_CURSOR_READING` (`viewer/src/armoryText.ts`, S3) | the TELETYPE cursor's look | `FUN_00378c00` (L272795-272891): a rectangle `DAT_003e0398` = 8 px x scale wide, 2 px past the pen, from `DAT_003e0390` = -5 (+1) under the line up the face's height x scale (the `DAT_`s read off the retail ELF); drawn unless NOCURSOR and only when the text does not begin with a space; alpha 128 while typing, then sin(phase) x 32 + 96. Its colour (the object at +0x100, set up through vtable+0x20 with 0) not traced: the text's own colour, solid | open |
| `LINE_PITCH_READING` (`viewer/src/armoryText.ts`, S3) | a running text's line pitch | the pitch function (vtable+0x88) not traced; the object's SPACING in frame rows, unscaled (19: five lines in the TELETYPE's MAXHEIGHT 100 and in the tips' HEIGHT 95), as the popup's text (`ARMORY_POPUP_LAYOUT_READING`) | open |
| `WRAPPEDTEXT_CLIP_READING` (`viewer/src/armoryText.ts`, S3) | what `WepInstText` does with a tip longer than its box | the WRAPPEDTEXT class not read: the lines that start inside HEIGHT (5) drawn, the rest dropped. Measured on the disc's strings (`font_text_01` at 0.9, 175 px): every tip fits five lines but 1207 (the F2000's), which wraps to seven and loses its last two under this reading -- a capture of the F2000's tips settles it | open (owner's capture list) |
| `UI_MODEL_LIT_READING` (`viewer/src/armoryView.ts`, S3) | whether the preview is lit by `UI.ZED`'s rig | none of the 64 UI models' packets carries the lit flag (all `lit` false in the decode) and their vertex colours sit near unity (0.53-1.0 on average), so the packets are drawn unlit as the world's are (`viewer/src/lighting.ts`), the rig unused | open |
| `UI_MODEL_DRAW_ORDER_READING` (`viewer/src/armoryView.ts`, S3) | where the 3D preview falls in the dialog's draw order | the menu's draw loop not traced: after the dialog's objects (the model over `EquipWeapWin`'s 0.35 panel), under the menu fader and the popup | open |
| `ARMORY_SCRIPT_SOUNDS_READING` (`viewer/src/armory.ts`, S3) | which of the scripts' own `SOUND` commands the page plays | the viewer's state names .DINK and .SLIDE at the presses that play them (§3.9's table); the scripts carry the same, so of theirs only .NEG (`ShowAndSpin`'s 43 refused-Choose sites) is played, lest each sound twice; the viewer's steps offer only items the room takes, so .NEG is not reached by the pad | resolved 2026-10-04 (ARMORY-UI: every SOUND and the three implicit cues; research 182 §2.21, §3) |
| `ARMORY_SEAT_READING` (named in `match/src/room.ts`, the S3 review) | which seats open the ARMORY online, and the seat's first spawn meanwhile | the game's ARMORY is the lobby's, before the launch (§4.1): a player spawns with what it chose there. The viewer's stand-in: a page whose hello says `armory` has it opened on a first seat (a respawn room's, a classic ghost's, a waiting room's) and a promotion's -- never a takeover's or a reconnect's, in any room (the S3 repair: the session's live connection taken over, or its leave within `KEPT_RECONNECT_READING` -- `Room.returning`, kept whether or not a record of its choices was), nor under the round's lock (a type spawned in this round); the one exception is a rejoin whose page still shows the screen (a drop or a takeover under the open ARMORY: the hello's `armoryOpen`), held as a first seat is so the screen's later changes are still taken -- and the page, open already, neither opens it again nor sends `ready` (`NetPage.armorySeat`, `main.ts` `armoryOpenOrDone`); the welcome and the promotion say so (`armory`); the seat's first spawn waits (`Player.arming`) for the page's `ready` (the screen left, `NetPage.armoryDone`) or the round's start, its requests taken meanwhile as the ARMORY's (not alive, not spawned in the round), each accepted one counting as activity for the idle kick (W3.R13: a held seat runs no commands). The page sends each change as it is made, one per `ARMORY_SEND_DEBOUNCE_MS` (150 ms, inside the room's `loadout` budget of 8 then one each 0.1 s; `viewer/src/armorySend.ts`). A classic abandon (the room back to waiting) keeps a held seat held: `Room.abandon` spawns only the seats not held, and a `ready` never spawns a living body again in a round (`Room.ready`; the second S3 repair, `ARMORY_ABANDON_READING`) -- in a room no round has started in it rebuilds the waiting body with the screen's choices (the waiting room's ARMORY row, 2026-10-01). Its limit: a rejoin under the open screen that the room will not hold (the round's lock) leaves the screen open over a seat that spawned, its changes refused. Pinned by `match/test/roomLoadout.test.ts` ("the ARMORY's seat", the S3 repair's three) and `viewer/test/pageSession.test.ts`. **Since the owner's ruling of 2026-10-02 (§9) the only way in**: the stand-in for the lobby's `weaponselect` button (§4.1) until ONL-16/17, and so the only place a player changes character type (WEAPON EXCHANGE changes the kit, never the type: research 94 §B2) | open |
| `ARMORY_ROUND_START_RACE_READING` (named in `viewer/src/armorySend.ts`, the S3 repair) | an ARMORY change still on its way when the round starts | the room takes a held seat's changes until the round's start spawns it; the page learns of the start from `roundStart`, after. A change waiting in the page's 150-ms debounce then would reach a spawned seat and be refused (`alive`, `round`), the page put back on the room's kit. So the round's start drops the waiting change (`armorySend.drop`, before `armory.close`), and from popup 47 on (`ARMORY_SEND_NOW_S` = `PULL_OUT_SECONDS`, 5 s, `UiBackToLobby`) each change is sent at once, unbatched (a held key's 5 a second stays inside the budget's 8 and refill of 10). The limits left: a choice made within the trip to the room before a known start, or within the debounce plus the trip before a waiting room's start (no clock: the other side's join launches it), is not taken -- the page stays on the room's kit. The game has no such race (its ARMORY is the lobby's, before the launch, §4.1): a viewer reading. Pinned by `viewer/test/armorySend.test.ts` | open |
| `ARMORY_ABANDON_READING` (named in `viewer/src/armoryGlue.ts` and `match/src/room.ts` `abandon`, the second S3 repair) | an abandon (a classic side left empty) while a page's ARMORY is open | the original's abandon leaves the level for the lobby (`FUN_002bc530` L161130-161140, `dlgNetAbandoned`, research 91 §17.2), whose ARMORY is the lobby's (§4.1): the game has no in-level waiting room to hold a screen over. The viewer's room goes back to waiting (CLASSIC_WAITING_PLACEHOLDER), which is a seat the ARMORY opens on (`ARMORY_SEAT_READING`). Reading: the abandon is no round's start -- the page's screen stays open, a change waiting in the send's debounce is sent at once (`armorySend.flush`, not `drop`: the waiting room's gates take it, the seat not alive or not in a round), and the decals go as at a round's end (`FUN_0031af70` 218218-218219); the room spawns the living fresh at a start slot and leaves a held seat held (`arming` kept), whose `ready` then makes its one spawn. A body the abandon spawned whose page has the between-rounds ARMORY open keeps the screen too, its changes taken in the waiting room, its `ready` ignored (not held). Pinned by `match/test/roomLoadout.test.ts` (repair 2), `viewer/test/armoryGlue.test.ts`, `viewer/test/netPageRound.test.ts` | open |
| `ARMORY_GAME_NAME_READING` (`viewer/src/armory.ts`, the S3 review) | the title bar's `GAMENAMEVAR` | the game's name as Create Game made it (UIMnLOC 227 "GAME NAME"); the viewer has no Create Game: online the room's name (the map's, which names the room), offline none -- no UIMnLOC string names an offline game, so no words are invented (`armoryNames`); online it stands under `ARMORY_SERVER_NAME_READING`'s line, as the owner's capture shows the game's name under the server's region | open |
| `ARMORY_SERVER_NAME_READING` (named in `viewer/src/net/protocol.ts`, the sprint's finish) | the title bar's `MEDIUS_LOBBY_NAME` (`roomname`, (200,46), x0.6, §2.2) | source: the UIVAR is registered with `GAMENAMEVAR` in the online lobby's init (`FUN_002e0450` L182779-182781, the strings at 0x3f39e0 / 0x3f39f8; reCOM `src/gamez/zNetwork/zNetMedius.cpp` L27-28 names them `uiv_LobbyWorldNameVar` / `uiv_GameNameVar`): the Medius lobby world's name -- the server's region in the owner's capture ("US East (Ohio)" over the game "ssdsa"). The viewer has no Medius lobby: **the controller's ruling under the owner's mandate (2026-10-01)** -- online the match server's own name, as its operator sets it (`SERVER_NAME`, `central/src/main.ts`; control characters dropped, at most `SERVER_NAME_MAX` = 32, `serverNameOf`), carried by the welcome's `server` (additive, protocol 9 kept); unset, "LOCAL" (a local server); offline blank, with the game's (`viewer/src/armory.ts` `armoryNames`). Pinned by `match/test/roomLoadout.test.ts` and `viewer/test/armory.test.ts` | open (ruling) |
| `TAKEOVER_ROW_READING` (named in `match/src/room.ts`, the S3 review) | the scoreboard row across a takeover | a takeover (`Room.takeOver`: the page's newer connection of its session token taking its seat) is the same person: its kills, deaths, score and the round's score go with the seat, as its type and picks do; a leave and a later reconnect is a new row, as a departure is in the game (research 91 §17). The takeover also takes the new hello's name when it differs and no other member holds it (`Lobby.renameIfFree`), and a hello that watches where the seat played (or plays where it watched) replaces the old connection and joins afresh (`Room.replace`). The second S3 repair: the same person's projectiles go with the seat too -- every charge set down and every round in flight whose owner was the old body is re-pointed to the new one as it is seated (`KeptRecord.body`, `Room.seat`), so its claymores count against its cap (`claymoresDown`, `FUN_003cc1f0` L321194-321210's per-owner count of the claymore's mark `+0xc5`, L474101; PAR-96, research 256 §8 -- was "its charges count against its cap (`chargesDown`, ...)"), go off by its Detonator (`detonate`, `CZKit_DetonateRemoteExplosives` 0x5c0130's owner test) and kill as its own (`thrower`), not the orphan's. A `Room.replace` (the seat not kept) and a leave stay departures (`DEPARTED_CHARGES_READING`). Pinned by `match/test/roomEquipment.test.ts` | open |
| `REPLACED_LINE_READING` (named in `viewer/src/netPage.ts`, the S3 review) | the line of a page whose seat went to a newer connection of its token | the game has no such case and UIMnLOC no string: "OPENED IN ANOTHER WINDOW -- REJOINING", in place of the lost connection's line; the page then renews its token and joins as a new joiner | open |
| `DEPARTED_CHARGES_READING` (named in `match/src/room.ts`, the S3 review; sourcing corrected by its repair) | a departed player's placed charges and rounds | searched: `CZSealBody`'s destructor (0x5533e0, L419187-419188) runs `FUN_003ccd90` (L321613-321640) over the placed list 0x4b5220; for an entry of kind 5 (`+10`), its `FUN_003c7d50` (L318935-318955) clears the field `+0x1c` that names the body in each 0x20-byte record of the array at `(+0x28)->+0x48` (count `(+0x28)->+0x34`). That is not the charge's owner `FUN_003cc1f0` counts by (`+0xac`, L321194-321210), and no code read so far clears `+0xac` on a departure: whether the game's charges stay counted against, or can be set off by, a departed body is unread (the S3 review's "answered by source" was wrong). Reading -- a server policy: the room keeps its projectiles' owner by the player object, never its id, so a page handed the id after a leave neither inherits the charges' count nor is passed over by the departed player's rounds (`claymoresDown`, the count of its claymores since PAR-96, research 256 §8 -- was `chargesDown`, every charge; `bodyCast`); the charges lie where they were set, no one's, and a kill by one is the orphan's line (`thrower`). A takeover is no departure (the second S3 repair, `TAKEOVER_ROW_READING`): its charges and rounds pass to the seat's new body | open |
| `ROUND_START_PROJECTILES_READING` (named in `match/src/room.ts` `clearAir`, `viewer/src/grenade.ts` `clearAir`; the browser checks' follow-up, 2026-10-01) | what is in the air or set down (grenades, launched rounds, rockets, backblasts, claymores, PMNs, C4) when a round starts or a room is abandoned | the game keeps them in the level's projectile manager 0x4b5220, made empty at the level's load (`FUN_001ea720` L49727 `FUN_003d3980`, the game state's entry `FUN_001f5e70` L55654 -> `FUN_001ebba0`) and emptied and freed at its teardown (`FUN_001eb8c0` L50597-50599 `FUN_003ccbc0`, its count zeroed; L50613 `FUN_003d3930`; the game state's exit `FUN_001f5d40` L55557-55559); a round is the round-end screen's `ReplayMission`, "reload of the round ... plus the load" (research 91 §18.2.4; `FUN_00223680` L75913-75931 re-places every player), and an abandon leaves the level (`FUN_002bc530` L161130-161140). Reading: the round's reload runs that teardown (read from research 91's account of the round, not traced call by call; the `+0x1a` gate at L55557 unread). The room clears its `flying` at `startRound` and `abandon`, the pages their copies on `roundStart` and `abandoned` (`armoryRoundHooks`): a frag thrown in the waiting room or the countdown no longer goes off in round 1 | reading |
| the view states in play (`viewer/src/zoom.ts`; *note only*, the owner's rulings of 2026-10-01) | first person, and the play beside the ARMORY | **the owner's ruling (R5)**: first person comes back -- the game's view state 1 (1.01x), the zoom's first step from third person (`FUN_005445b0` 0 -> 1), every weapon reaching it and an unscoped one stopping there; it supersedes the 2026-09-29 "no first person" (research 84 §7's last point). Tap `C` crouch / hold `C` prone stays. The binoculars (state 4) are not covered: **an open owner question** | answered by ruling (binoculars open) |

## 9. In a match, no ARMORY: the owner's ruling (2026-10-02)

Written 2026-10-02 for the integration of Chris's browser-beta-v5 (`chris/browser-beta-integration` d578f347), task
INT-SWAP. The in-game swap's side is research 94 §4.

**The ruling** (the owner, 2026-10-02): "While in game, the weapon swap UI should be his - NOT the armory. The armory is
UI for the game's lobby system which is in a future sprint." It agrees with the source: the game's ARMORY is reached
only from the lobby's `weaponselect` button, outside a round (§4.1). **The controller's reading (INT.R3, the owner may
overturn it):**

1. In a match -- a round running, the round-end interval, the waiting before a round -- nothing opens the ARMORY. The
   Inventory button's entry (`I`, R2, the touch `INV` in the round-end interval, and in the waiting room by the ruling
   of 2026-10-01) is retired: `ARMORY_BETWEEN_ROUNDS_READING` and `viewer/src/armoryGlue.ts` `inventoryOpensArmory`
   are gone, and `main.ts`'s four call sites (the `I` key's listener, the pad's R2 edge, the touch `INV` button, the
   button's visibility) with them.
2. Alive, the button is the swap's next item and L1 / L2 the main weapon and sidearm, the code both trees share
   (research 94 §4.2).
3. Dead, the menu is WEAPON EXCHANGE, unchanged (research 94 part 2, §4.4).
4. The ARMORY still opens on taking a seat (`ARMORY_SEAT_READING`, §8) and offline before the page's room is made, as
   the stand-in for the lobby until ONL-16/17 (sprint 17) -- **the only place the character type can change** until
   then. The controls list's ARMORY group says so ("Taking a seat: opens it: the only way to change character").

What stays: the screen itself, its readings and tests (for the lobby sprint); popup 47 and the round's start closing a
seat's screen (a seat taken in the round-end interval still sees them: `ARMORY_CLOCK_READING`); the room's acceptance
of a request outside a round (`ARMORY_OUTSIDE_ROUND_READING`), which serves a seat's screen and WEAPON EXCHANGE alike;
the round hooks' decals and air (`armoryRoundHooks`).

**Known limits** (for the owner, with the triage's questions): a player who closes the seat's ARMORY cannot open it
again in that match (a reconnect or a takeover does not reopen it: `ARMORY_SEAT_READING`), so the character type is
chosen once a seat; a living player in the waiting room or the round-end interval changes nothing (WEAPON EXCHANGE
opens only dead or as a ghost, R94.2) until a death or the next seat.
