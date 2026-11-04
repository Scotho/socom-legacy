# 182 -- C4 -- the ARMORY (pre-round loadout screen) and its UI scripts: placeholders and readings, sourced

- Research date: 2026-10-04 (research wave 1; the index is [178](178-the-research-wave-of-2026-10-04.md)).
- Origin: `research-wave-2026-10-04/C4-armory.md` on the owner's host, in the evidence archive ([178](178-the-research-wave-of-2026-10-04.md) gives its root). A relative `scratch/...` path below is under `research-wave-2026-10-04/`; the per-cluster `ledger-*` files it names are merged in [`ledgers/2026-10-04/`](ledgers/2026-10-04/README.md).
- Trees compared: **PORT** = `agent/online` at 2026-10-04 (written `$PORT`; `$PORT/..` is that branch's root, `$WEBISSUES` the `agent/web-issues` checkout); **WT** = the old-layout checkout (`$WT`, the clone's pre-restructure web project). WT-96..102 are notes 171-177 here; PORT's own notes 96-102 are other notes.
- **Status: reading, pending review -- not adopted.** Nothing in it is adopted until a sprint task takes it and a reviewer re-reads it at the source. *(2026-10-04: ARMORY-UI took the C4 items it names; §7 lists them, pending review.)*
- Grades, translated to AGENTS.md's levels: the wave's PROVEN = an exact source read = **reading**; STRONG = reading with one interpretive step; BELIEVED = inference; UNRESOLVED = unresolved. The text keeps the wave's words.
- Verification: V4 (`research-wave-2026-10-04/V4-verify-ui-audio-card.md`) has landed and is folded in as §6.
- Edits on import: the headings are numbered for the corpus; home-directory paths are replaced by `$PORT`/`$PORT/..`/`$WEBISSUES`/`$NPX_TSX`; the archive's absolute root is dropped; references to the other reports are links to their notes. The substance is verbatim.

Research agent C4-armory, wave 2026-10-04. Read-only. Scope: `clusters.json` key `C4-armory` (12 files under
`$PORT/packages/{scene,viewer}/src`). `$PORT` = the snapshot of `agent/online`
(`.../scratchpad/online/redotcom`). `D:L<n>` = a line of `C:/Projects/socom_pc/game/analysis/socom2_game.elf.decomp.c`
(r0001). `R<note>.<n>` = a finding of `$PORT/docs/research/<note>`. Every script and its saved output is under
`scratch/C4/` (README there). No decompiled text is quoted; short constants, offsets and lines only.

**The headline.** Most of the ARMORY's 42 ledger names were written in web sprint 5 and have since been answered by
the platform research (104-122, 140, 141) without the ARMORY's code being touched (W7.R4 / W9.R7 left that to
PLAT-34). This pass re-checks those answers against the decompilation and the disc. It also settles the open ones
with new evidence. Four results change what the screen draws or does:

1. **The preview camera** (`UI_CAMERA_READING`, `MODEL_CAMERA_READING`). The world loader overwrites the camera
   record's 0.7854 with **35 degrees** (`FUN_00291490(0x3f1c61aa)`, D:L217205). That gives **457.007 px per unit**,
   which reads back exactly from the menu-state RDRAM dumps. The viewer uses 540.8, so every model is drawn 18% large
   and about 30 px right of `EquipWeapWin`. At 457 the 67 entries centre on the window (mean -2.6 px).
2. **The confirm popup** opens on **NO**, and Triangle inside it does nothing. Both are read off the disc's record
   1245 and the popup code (research 118, re-checked).
3. **The gold frame** comes out at 2 px. The source's 1% texture inset (S/T 0.01..0.99) applied to `eq_wep_bgHL.tif`
   gives 2 px across, which is the capture's 2 px.
4. **Opacity is inherited** (multiplied down the tree). The script runtime's precedence, call order, re-call, stop,
   fade-rate and "not done" rules all differ from the viewer's `uiScript.ts` (research 106, checked).

Also settled: the original **also skips the empty equipment slot**, because `Enable_empty` is set nowhere. The
**fourth-column unlocks** are campaign `PERSIST` card valves. `EQlimit` online comes from the joined game's record
byte +0x19f. A stored profile is **re-validated per item**, not dropped whole.

## 1. Summary

54 rows: the 42 ledger names, 8 unnamed findings from the sweep and the later notes, and 4 of research 95's note-only
rows in this area.

| status | ledger (42) | unnamed / note-only (12) | total |
|---|---|---|---|
| RESOLVED | 31 | 8 | 39 |
| NOT-A-GAP | 8 | 1 | 9 |
| PARTIAL | 3 | 1 | 4 |
| UNRESOLVED | 0 | 2 | 2 |

| item | status | grade | one-line answer |
|---|---|---|---|
| ABSENT_PARENT_READING | RESOLVED | PROVEN | no such parent -> the dialog's root +0xc4 (`FUN_003696d0` D:L264444-264468) |
| ACT_FRAME_BORDER_READING | RESOLVED | STRONG | draw quads at S/T 0.01..0.99: the border is 2 px across (capture 2 px), 1.6 px down |
| ARMORY_ABSENT_OBJECTS_READING | RESOLVED | STRONG | 9 absent nodes (2 more than noted); commands on them are done, no effect |
| ARMORY_BUTTON_PRECEDENCE_READING | RESOLVED | PROVEN | focused control first, then the screen's BUTTONs (`FUN_00368650`) |
| ARMORY_CLOCK_READING | NOT-A-GAP | STRONG | the source is sourced (UICheckForcedLaunch); the viewer mapping waits for the lobby |
| ARMORY_CONFIRM_VALUE_READING | RESOLVED | PROVEN | NO = slot 1 writes 1, YES = slot 2 writes 2 (the viewer is right) |
| ARMORY_EMPTY_PICK_READING | RESOLVED | PROVEN | the original skips UI 0 too (`Enable_empty` never set) |
| ARMORY_GAME_NAME_READING | NOT-A-GAP | STRONG | policy: no Create Game |
| ARMORY_LOCKED_TAP_READING | NOT-A-GAP | STRONG | touch has no original |
| ARMORY_MENU_KEYS_READING | NOT-A-GAP | STRONG | the PC keyboard has no original; USB Enter is unbound in this dialog |
| ARMORY_MISSING_ANIMS_READING | RESOLVED | PROVEN | defined in none of the 932 names; the call is done at once |
| ARMORY_MODE_READING | RESOLVED | STRONG | `EQlimit` 0 by default; online from the joined game's record +0x19f |
| ARMORY_PADLOCK_SEAL34_SWAP_READING | NOT-A-GAP | PROVEN | ruled "as shipped"; the data re-checked |
| ARMORY_PANE_TEXT_READING | RESOLVED | STRONG | the item's `Description` (the code does it; the constant and its doc are stale) |
| ARMORY_POPUP_FOCUS_READING | RESOLVED | PROVEN | opens on **NO** (button 1), not YES |
| ARMORY_POPUP_LAYOUT_READING | RESOLVED | STRONG | research 118's layout (five corrections) |
| ARMORY_PROFILE_KEY_READING | NOT-A-GAP | STRONG | ruling W5.R4; the source's key is cited |
| ARMORY_PROFILE_REVALIDATE_READING | RESOLVED | STRONG | per item: a refused item is skipped and its slot keeps what it held |
| ARMORY_ROUND_START_RACE_READING | NOT-A-GAP | STRONG | viewer-only; no original race |
| ARMORY_RULES_READING | RESOLVED | STRONG | the one divergence is unreachable on all 22 maps |
| ARMORY_SCRIPT_SOUNDS_READING | RESOLVED | STRONG | the original plays every script SOUND plus 3 implicit cues |
| CALL_ANIMATION_AT_ONCE_READING | RESOLVED | STRONG | contradicted: the callee runs later in the same frame |
| CHILD_OPACITY_INHERIT_READING | RESOLVED | PROVEN | contradicted: opacity multiplies down the tree |
| CONDITION_PRECEDENCE_READING | RESOLVED | PROVEN | contradicted: left to right, no precedence |
| ENABLE_VALVE_DEFAULTS_READING | RESOLVED | STRONG | the full writer table (mission.rdr / scripts / code / card / 0) |
| FOURTH_UNLOCK_READING | RESOLVED | STRONG | `Set*` are PERSIST card valves from the campaign debriefing; 0 = a fresh card (owner-ruled: unlocked, OT.R91) |
| LINE_PITCH_READING | RESOLVED | STRONG | `SPACING`, unscaled (the viewer is right) |
| LOOP_YIELD_READING | RESOLVED | STRONG | confirmed |
| MODEL_CAMERA_READING | RESOLVED | PROVEN | place confirmed; projection 457.007 px/unit |
| MULTILINE_LIFT_READING | PARTIAL | STRONG | source -3 (WRAPPEDTEXT), 0 for TELETYPE text; the capture fits -5: 1.5-2.5 rows unexplained |
| SUSPEND_MENU_INPUT_READING | RESOLVED | PROVEN | seconds, overwrite, raw dt |
| TELETYPE_DT_UNIT_READING | RESOLVED | PROVEN | 1330 x 0.9 x 1 x 1 = 1197 px/s (the viewer is right) |
| TELETYPE_TICK_SOUND_READING | RESOLVED | STRONG | `.TYPE`, HUDUI 7 |
| UI_BANK_PLACEHOLDER | RESOLVED | PROVEN | "UI" is a `GROUPS` block; HUDUI is the menus' bank by source |
| UI_CAMERA_READING | RESOLVED | PROVEN | the record's FOV is overwritten with 35 deg: f = 457.007 |
| UI_DRAW_ORDER_READING | RESOLVED | STRONG | backplane, 3D, foreplane (MENUFADER, POPUP) |
| UI_MODEL_LIT_READING | PARTIAL | BELIEVED | the page draws the UI models brighter than the console; the path is not read |
| UI_OBJECT_TEXT_ORIGIN_READING | NOT-A-GAP | STRONG | retired; a comment only |
| UI_TEXT_DEFAULT_COLOUR_READING | RESOLVED | PROVEN | (128,128,128) by the TEXT factory |
| UI_TEXT_ORIGIN_RESIDUAL_READING | PARTIAL | STRONG | the offsets are 0/0 in the front end (RDRAM); a sub-row residual remains |
| WRAPPEDTEXT_CLIP_READING | RESOLVED | STRONG | a scissor; the F2000 tip shows lines 0-4 of 7 |
| ZANIM_RECALL_READING | RESOLVED | STRONG | contradicted: starts nothing |
| UISCRIPT_STOP (unnamed) | RESOLVED | STRONG | stops the slot's instance, else the definition |
| UISCRIPT_OPACITY_RATE (unnamed) | RESOLVED | PROVEN | += rate x dt, snaps at the end |
| UISCRIPT_NOT_DONE (unnamed) | RESOLVED | STRONG | a false test or command holds its sequence |
| ARMORY_IMPLICIT_CUES (unnamed) | RESOLVED | STRONG | ActivateButton / PopUpDialog `.METAL`, the popup's SELECTION |
| ARMORY_POPUP_TRIANGLE (unnamed) | RESOLVED | PROVEN | Triangle in the confirm does nothing |
| ARMORY_BITMAP_UV (unnamed) | RESOLVED | PROVEN | quads sample 0.01..0.99, not the bitmap whole |
| ARMORY_TEXT_V (unnamed) | RESOLVED | PROVEN | glyph rows unscaled (1.0, not 448/480) |
| ARMORY_MENU_TICK_RATE (unnamed) | PARTIAL | BELIEVED | the menu ticks at 30 Hz; per-frame rules run at half the rate of a 60-fps page |
| ARMORY_ALL_SEL_HAVE_READING (note) | RESOLVED | BELIEVED | every selected character holds one of the listed items |
| ARMORY_MEMCARD_SAVE_READING (note) | UNRESOLVED | -- | not researched; owed reading named |
| ARMORY_INIT_VOICE_READING (note) | NOT-A-GAP | BELIEVED | the voice object only |
| SPECIAL_GLYPH_179_READING (note) | UNRESOLVED | -- | not researched; owed evidence named |

Step 1, the inventory. The 42 `C4-` rows come from `ledger_by_cluster.tsv`. The sweep of the 12 files for the unsure
words (`scratch/C4` was not needed for it) found:
- `armory.ts:118`, a stale "writer not traced" (folded into ARMORY_PANE_TEXT);
- `armoryLayout.ts:82` and `:106` (UI_DRAW_ORDER, and C6's BAR_SCALE_ORIGIN);
- `armoryView.ts:35` and `:49` (MODEL_CAMERA, and C6's SPIN_SCREEN_SENSE);
- `armoryText.ts:38`, `:48` and `:53` (TELETYPE_DT, C6's TELETYPE_CURSOR, LINE_PITCH);
- `armoryState.ts:94` (POPUP_FOCUS, and "Triangle answers NO [inferred]", now ARMORY_POPUP_TRIANGLE);
- `uiScript.ts:47`, the in-frame order (CALL_ANIMATION_AT_ONCE).

Research 95 §8's rows were read whole. Notes 104-107, 111, 112, 115, 116, 118, 122, 140 and 141 were read for
corrections in this area: they supply UISCRIPT_STOP, UISCRIPT_OPACITY_RATE, UISCRIPT_NOT_DONE, ARMORY_IMPLICIT_CUES,
ARMORY_BITMAP_UV, ARMORY_TEXT_V and ARMORY_MENU_TICK_RATE. The ledger rows `BAR_SCALE_ORIGIN_READING`,
`TEXT_FADE_ALPHA_READING`, `TELETYPE_CURSOR_READING`, `SPIN_SCREEN_SENSE_READING` and `UI_MODEL_DRAW_ORDER_READING`
are C6's by `ledger_by_cluster.tsv`, though their constants are also defined in my files (see "Leads").

---

## 2. The ledger items

### 2.1 ABSENT_PARENT_READING -- `viewer/src/armoryLayout.ts:150` (ledger: `armory.ts:79`)
- **Stands for.** A node whose `CHILDOF` names no node (`net_conn_ind_*` under the absent `letterbar`).
- **Current value.** `'root'`.
- **Prior.** Answered by source in the S3 review.
- **What I did.** Re-read `FUN_003696d0` (D:L264427-264480). The parent is looked up through the menu's vtable +0x24
  by name; when that returns 0 the node takes `+0xc4`, the dialog's root (D:L264465-264468).
- **Answer.** Root. **PROVEN.**
- **Implementation.** None. Fix the ledger's file to `armoryLayout.ts`.

### 2.2 ACT_FRAME_BORDER_READING -- `viewer/src/armoryLayout.ts:100`
- **Stands for.** The gold selection frame's width.
- **Current value.** The bitmap stretched whole: 3.5 px; the capture shows 2 px.
- **Prior.** "The GS texture setup of the 2D quads was not read."
- **What I did.** Took R112.4: every 2D quad samples S 0.01..0.99 across and T -0.01..-0.99 down (`FUN_00364c50`
  D:L262025-262030). I decoded `eq_wep_bgHL.tif` off the disc (`probe_frame.ts`): 128x256, gold (186,154,70) everywhere,
  the border carried in **alpha** (253 in columns 0-2 and 125-127, and in **rows 0-3 and 252-255**, 4 rows). The 8
  `Equip*ActFrame` objects are 152x290. I then profiled the quad both ways, bilinear.
- **Answer.**
  - Across, at the source's corners: 253, 248.5, 39.7, then 0 -- **2 full pixels and a 16% third**. Nearest sampling
    gives exactly 2.
  - Across, whole (the viewer): 253 x 3 and 139.8 -- 3.5 px, the measured 3.5.
  - Down: 1.6 px (source) against 4.5 px (whole).
  - The capture's 2 px across is reproduced. **STRONG** (code + capture). `UV_REPEAT_READING` and
    `UI_TEXTURE_FILTER_READING` (R112 §9) stay readings, but neither changes the 2 px.
- **Implementation.** Map every ARMORY quad's texels `u0 = 0.01 W .. u1 = 0.99 W`, `v` the same (see
  ARMORY_BITMAP_UV), or draw through `@s2u/ui`'s compositor (`frame.ts`). The test first: the frame's alpha profile
  across one side is (253, 248.5, 39.7, 0) at x = 0..3 of a 152-wide quad. Retire the constant.
- **Owed.** The capture's vertical border (top and bottom): the source predicts about 1.6 px.

### 2.3 ARMORY_ABSENT_OBJECTS_READING -- `viewer/src/uiScript.ts:201`
- **Stands for.** Nodes the scripts target that the layout lacks.
- **Current value.** Nodes made, drawn nowhere.
- **Prior.** "The 226 objects; their commands do nothing." 7 names.
- **What I did.** `probe_scripts.ts` (c) finds **9**: WepTabText, SpecterSecLock, VandalSecLock, ClayAvailText,
  NoAvailRoom, silencer, arrow_up, plus **Equipjackhammer** and **Equipremington870**. `TurnOffWeaponModels` hides those
  two, and the MP layout's `MODELS` lacks them; `dlg_equipment_main.rdr` has them. `probe_noderefs.ts` gives each its
  `Node_Ref_List` search kind.
  - The resolver `FUN_0026f4e0` (D:L118145+) hands the kind to `FUN_00269230` (D:L114368+). Kind 4 looks only in
    `FUN_0027f7d0()`'s menu (`DAT_00414e40`). Kind 0 also tries the scene lookups `FUN_0031fd10` (->
    `FUN_00320f10(0x45c3c0, name)`) and `FUN_00311ef0(DAT_0045c298, name)`.
  - With no node: OBJECT_ACTIVE_STATE does nothing and is done (`FUN_00263aa0` D:L111355-111369); OPACITY is done at
    once without using dt (`FUN_0025f880` D:L108814-108831); a node UI_COMMAND falls back to the global table and is
    done (R106 §5).
- **Answer.** No effect, as the viewer does. **STRONG**: PROVEN for the six kind-4 refs; BELIEVED for the three kind-0
  refs (`silencer`, `Equipjackhammer`, `Equipremington870`), whose scene lookup was not traced to "nothing found".
- **Implementation.** None. Extend the row's list to the 9 names.
- **Revised 2026-10-07 (the shared-ARMORY work; reading, pending review): `silencer` finds the 552's part.** The kind-0
  lookup has an earlier step than the two above: `FUN_00269230` first asks the world `DAT_0045c380` by name and then
  through its vtable +0x24 (D:L114379-114386) -- `FUN_00315d00` in all nine node tables (research 183 §18), which searches
  the world's children and then each child's subtree in order, by `strcmp` (D:L215255-215290). The dialog's build attaches
  every `MODELS` instance to that world: `FUN_00366730` makes it (D:L262842, `FUN_00317c20` -> the clone `FUN_00316820`
  D:L215638-215790, every child cloned and named by `FUN_00312aa0` D:L213384-213410), names it by the entry and calls the
  world's vtable +0x18 (D:L262850), which the ELF's table at 0x406940 gives as `FUN_0031f240` -- an append to the world's
  children (D:L220653-220672); the dialog's clear destroys them (D:L264412-264418). So `ACTIVE silencer = 0` reaches the
  `silencer` node of the first instance, in the `MODELS` order, that holds one: on the disc only `sig_commandoUI`
  (`Equipsig_commando`, entry 20) does -- the 552SD's `UIsig_commandoSD` names its `SigSilencer` -- and `UI.ZED`'s own
  world holds no node of the name. The two later steps never reach a dialog's model: `FUN_00320f10` walks the libraries'
  templates, and the registry `FUN_00311ef0` walks is closed once the menu's world has loaded (`FUN_001e91c0`
  D:L49095-49107; the node constructor's `FUN_00312360` refuses while +0xc is set). `Equipjackhammer` and
  `Equipremington870` find nothing (no instance has those names), as before. The port: `ARMORY_MODEL_PART_REF`
  (`viewer/src/armoryLayout.ts`), held by `viewer/test/silencer.test.ts` on the disc; §7's open row is closed.

### 2.4 ARMORY_BUTTON_PRECEDENCE_READING -- `viewer/src/armoryState.ts:429`
- **Answer.** `FUN_00368650` tries, in order: a visible POPUP (it takes everything and returns), the soft keyboard,
  the focus container's input (+0x290 vtable+0x44), and only then the screen's BUTTON list (+0x6f8, count +0x8d8),
  first match (D:L263850-263864; R116.4). `EquipWeaponBtn` and `EquipMPDoneBtn` bind TRIANGLE (to
  `OnEquipWeaponBtnDefault`). The character-select buttons do not, so the screen's TRIANGLE (`returnto_lobby`) fires
  there. **PROVEN.**
- **Implementation.** None. Rename to a sourced constant.

### 2.5 ARMORY_CLOCK_READING -- `viewer/src/armory.ts:78` -- NOT-A-GAP
- **Answer.** The source is sourced (R95 §4.1). `mp_x_sec_clock` is written by `UICheckForcedLaunch` (0x27cbf0
  D:L125642-125791) and by the lobby, briefing and Create Game scripts (`probe_valves.out`: dlgCreateGame,
  dlgMPBriefingRoom, dlgGameLobby, dlgLANBriefingRoom). The deadline comes from `FUN_002a6b90`. The viewer's mapping
  (its round timer standing in for the launch count) is the stand-in until the lobby (ONL-16/17) exists.
- **Implementation.** None until the lobby. Then `UiBackToLobby` reads the lobby's real `mp_x_sec_clock`.

### 2.6 ARMORY_CONFIRM_VALUE_READING -- `viewer/src/armoryState.ts:97`
- **What I did.** `probe_popup.ts` on the disc's record for text 1245: +64 = 0, +65 = 0, +66 = 1, +67 = 3; slot 1
  (+68) has label **246 (NO)** at x 230, slot 2 (+144) has **253 (YES)** at x 60. CROSS writes the focused slot's
  number (+0x334) to the valve (`FUN_00370990` D:L268484-268496).
- **Answer.** NO 1, YES 2. The viewer's values are right. **PROVEN.**

### 2.7 ARMORY_EMPTY_PICK_READING -- `viewer/src/armoryState.ts:73`
- **Current value.** `'skipped'`, chosen because the room cannot replay an empty pick.
- **What I did.** Dumped `ShowAndSpin` `ScrollRight` / `ScrollLeft` (`dump_scroll.out` L400-404, L680-684). Stepping
  onto UI 0 (empty) breaks only when `Enable_empty & 1` (SEAL) or `& 8` (Terrorist). `probe_valves.out` shows
  `Enable_empty` is in no `mission.rdr` (0/22), written by no set of the three archives, and is not an ELF string, so
  it is made at 0 on first use (R104.6). It is not in `global_valves.rdr` either (`global_valves_vs_armory.out`).
- **Answer.** **The original never offers the empty slot.** The viewer's skip is the original's behaviour by source.
  **PROVEN.**
- **Implementation.** Rename the constant to a sourced name (e.g. `EMPTY_SLOT_NEVER_ADMITTED`) citing the scroll and
  the valve. A test: on all 22 maps `scrollAdmits(valves, side, 0)` is false.

### 2.8 ARMORY_GAME_NAME_READING -- `viewer/src/armory.ts:88` -- NOT-A-GAP
- Policy. `GAMENAMEVAR` is the Medius game's name the host typed (registered with `MEDIUS_LOBBY_NAME`, `FUN_002e0450`
  D:L182779-182781). The port has no Create Game.

### 2.9 ARMORY_LOCKED_TAP_READING -- `viewer/src/armory.ts:521` -- NOT-A-GAP
- Touch has no original (R116.15). The pad never reaches a locked column (`ActivateMPCharStack`). `.NEG` is the owner's
  choice to keep or change.

### 2.10 ARMORY_MENU_KEYS_READING -- `viewer/src/armory.ts:65` -- NOT-A-GAP
- The PC keyboard has no original. The original's one keyboard route, a USB keyboard's Enter raising the screen event
  `USBKBD_ENTER` (D:L264243-264246, R116.15), is **bound nowhere in `dlg_equipment_mp.rdr`** (`dlg_equipment_mp.txt`),
  so a USB keyboard does nothing in the original ARMORY. Owner policy.

### 2.11 ARMORY_MISSING_ANIMS_READING -- `viewer/src/uiScript.ts:26`
- **What I did.** `probe_scripts.ts` (a, b). `TurnOffLoadingText` (7 calls) and `DisableThermalScope` (2) are defined
  in none of the 932 distinct animation names of UIZANIM, EXTZANIM and MPZANIM. CALL_ANIMATION's begin
  (`FUN_0025d5c0` D:L107571+) starts nothing without a slot. Its tick (`FUN_0025d550` D:L107467-107481) returns done
  when the slot is empty, even with the blocking flag 0x200.
- **Answer.** A no-op that does not block. **PROVEN.**

### 2.12 ARMORY_MODE_READING -- `viewer/src/armory.ts:48`
- **What I did.** `EQlimit` is in `global_valves.rdr` at 0 (PERM). Its writers are the Create Game, MP-briefing and
  LAN-briefing scripts (`probe_valves.out`) and the code.
  - `FUN_002f83b0` (D:L197248-197257) copies byte **+0x19f** of the joined game's record into `EQlimit`.
  - The host's packer `FUN_002f7c40` (D:L196715+) writes it as byte 5 of its game record.
- **Answer.** 0 unless the host chose a restricted mode, so the viewer's 0 is the original's for an unrestricted game.
  **STRONG.**
- **Implementation.** None until a Create Game. Then carry the mode in the room's record and run `SetMPWeaponValves`
  (see "Sourced but not implemented").

### 2.13 ARMORY_PADLOCK_SEAL34_SWAP_READING -- `viewer/src/armory.ts:45` -- NOT-A-GAP
- Ruled "as shipped". The data re-checked (`dump_padlocks.out` L56-61): `UiCharLocked&4` lights `Dimone1Lock` (CHILDOF
  `Seal4PaneDummy`, `dlg_equipment_mp.txt` L1203-1211); `&8` lights `Bailey1Lock` (CHILDOF `Seal3PaneDummy`, L914-922).

### 2.14 ARMORY_PANE_TEXT_READING -- `viewer/src/armory.ts:121`
- **Answer.** The item's `Description` (`FUN_002af190` D:L153580-153640 via `FUN_003d2820` / `FUN_003d2ac0`),
  answered in the polish pass on the owner's capture. `Armory.uivar` already returns `description` (armory.ts:279-280).
  The exported constant is still `'DisplayName'` and its doc says "the writer is not traced": stale. **STRONG.**
- **Implementation.** Set the constant to `'Description'`, cite the function, and drop the stale sentence.

### 2.15 ARMORY_POPUP_FOCUS_READING -- `viewer/src/armoryState.ts:98`
- **Answer.** The record's +66 means "has buttons". Applying a record activates **slot 1** (D:L267136-267137), which
  in record 1245 is **NO** (246; `probe_popup.out`). So the confirm opens on NO; the viewer's `'yes'` is wrong. **PROVEN.**
- **Implementation.** `ARMORY_POPUP_FOCUS = 'no'` (or hold `@s2u/ui`'s popup component in place of `popupOf`,
  R118 §12.3). Test: opening the confirm gives `focus === 'no'`, and an immediate Cross returns to the row.

### 2.16 ARMORY_POPUP_LAYOUT_READING -- `viewer/src/armoryData.ts:69` / `armoryLayout.ts:312`
- **Answer.** Settled by research 118 §2-§3 and §9, with captures, and implemented in `packages/ui/src/popup/popup.ts`
  (PLAT-16):
  - the text at +28 x, +24 y (the viewer has them swapped);
  - the wrap at w - 2 x (+28);
  - the pen y + (+24) - 3, pitch 20 (not 19);
  - an opaque `popupOp.tif` panel;
  - the slots' bitmaps `active_back.tif` / `pop_butt.tif`, opaque;
  - the label in rgb[0] when focused, rgb[1] when normal.

  **STRONG** (code + three captures in R118).
- **Implementation.** PLAT-34: draw the ARMORY's popups through `@s2u/ui` `popup.ts`. Retire `decodePopup`'s
  tag-byte button scan; the slots are fixed at +68 and +144.

### 2.17 ARMORY_PROFILE_KEY_READING -- `viewer/src/armory.ts:101` -- NOT-A-GAP
- Answered by ruling W5.R4. The source keys the record by (LOBBY_HOST, LOBBY_PORT, PLAYERNAMEVAR, mission) x side
  (`FUN_002fb470` D:L198753-198799, `FUN_002fb610` D:L198800-198900).

### 2.18 ARMORY_PROFILE_REVALIDATE_READING -- `viewer/src/armoryState.ts:296`
- **Current value.** The whole kit dropped for the type's own when the room will not reach it.
- **What I did.** Dumped `UICharacterProfile.rdr` (`probe_profile.out`, 340 lines): `EquipCharacterProfileSeal/Merc`,
  `...Weapons` and `...Equipment`.
- **Answer.** **Per item, silently.**
  - The type: `MpCharSet` 1-4 (5-8) is re-applied through `ChangeCharacterType`; any other value becomes 1 (SEAL) or 5
    (Terrorist).
  - Each stored item is re-chosen (`ChoosePrimary`, `ChooseSecondary`, `ChooseEquip1-3`) only if its UI index is one
    the branch lists **and** its `Enable_` valve has the side's bit (`&1` SEAL, 51 `&8` tests on the Terrorist side).
    The 203 rounds need `DoAllSelCharsHaveWeapon(M16A2-M203 / M4A1-M203)`.
  - An item that fails takes the empty `else`: no Choose, so the slot keeps what it held.
  - `ChangeCharacterType` (`FUN_002795e0` D:L123887-123935) writes the type name and the voice parameters, and leaves
    the kit alone.
  - The Choose functions' own refusals (slot counts) still apply.

  **STRONG** (the scripts, PROVEN as data; the kit left in place by `ChangeCharacterType` is a reading).
- **Implementation.** `readProfile`: replay the stored items one by one through `pick`, keeping each that is admitted
  and skipping each that is not. Never drop the kit wholesale. Test: a SEAL profile on MP61 holding LAW (not enabled
  there) keeps the other four items and the type's own item in that slot.

### 2.19 ARMORY_ROUND_START_RACE_READING -- `viewer/src/armoryGlue.ts:6` -- NOT-A-GAP
- Viewer-only. The original's ARMORY is the lobby's, before the launch (R95 §4.1, §9). There is no original race to
  source.

### 2.20 ARMORY_RULES_READING -- `viewer/src/armory.ts:55` / `armoryState.ts:59-66`
- **Prior.** The ARMORY's rules and the in-game rules differ "where a cost-2 item's partner slot holds a locked item".
- **What I did.** `probe_locks.ts` over the 22 MP maps' `mission.rdr`. The only lock bit under `EQlimit` 0 is
  `Enable_c4 = 16` (the SEAL lock) on MP61, MP62 and MP73, and on those three maps the SEALs have **no** cost-2 or
  launcher item (no LAW, no M203 rifle). The restricted modes zero frag, HE, 203, GL, PMN, RPG, LAW and satchel
  (`SetMPWeaponValves`, R95 §3.5).
- **Answer.** The divergent case is unreachable with the disc's data. The viewer's choice cannot differ from the
  original on any shipped map. **STRONG.**
- **Implementation.** None. Record the probe as a dev-disc test, so a future map or mode that reaches the case fails
  loudly.

### 2.21 ARMORY_SCRIPT_SOUNDS_READING -- `viewer/src/armory.ts:57`
- **Answer.** The original plays every `SOUND` command its scripts run: `.DINK` x14 in `dlg_equipment_mp.rdr`, and
  `.SLIDE` x2 and `.NEG` x43 in `ShowAndSpin.rdr` (`probe_scripts.out` (e)). It also plays three implicit cues
  (ARMORY_IMPLICIT_CUES). The viewer plays only `.NEG` from the scripts and voices `.DINK` / `.SLIDE` from its state.
  **STRONG** (R122.6, R122.13 and the disc counts).
- **Implementation.** Let the script player's `SOUND` reach `deps.sound` for every name. Drop the state's own `.DINK` /
  `.SLIDE` emissions so nothing sounds twice. Test: one weapon-row Right press yields exactly one `.SLIDE` (and the
  script's other cues), not two.

### 2.22 CALL_ANIMATION_AT_ONCE_READING -- `viewer/src/uiScript.ts:50`
- **Answer.** Contradicted. A called animation runs **later in the same frame**, after its caller's step and every
  instance ahead of it in the scheduler (priority 3 everywhere). A blocking caller sees the callee's end on the next
  frame (R106.2; `FUN_0025d5c0` D:L107571-107779). **STRONG.**
- **Implementation.** Fold the ARMORY onto `@s2u/ui` `zanimRuntime.ts`, which implements this. Its dev-disc test plus
  an ARMORY script trace (PLAT-32) pin it. Check `UiEquipSwitch`'s first frame (R106 §7).

### 2.23 CHILD_OPACITY_INHERIT_READING -- `viewer/src/armoryLayout.ts:115`
- **What I did.** Read `FUN_00336a10` (D:L235048-235058): a node with +0x9c under 0.9921875 (127/128) pushes.
  `FUN_00336980` (D:L235028-235043) pushes the node's opacity times the stack's top. The 2D adaptor `FUN_0036d8b0`
  (D:L266729-266747) sets alpha = f x 128 when f < 1 (0.99 drawn as 128).
- **Answer.** Inherited and **multiplied**. `PulseArrows` pulsing `arrow_lft` / `arrow_top` pulses their children
  `arrow_rt` / `arrow_dwn`. **PROVEN** (the multiplication; the walk's use of it is R112.3).
- **Implementation.** Multiply opacity down `armoryTree` (`placeOf` already walks the parents). Test: with
  `arrow_lft` at 0.5, `arrow_rt`'s drawn alpha is 0.5 x its own x 128.

### 2.24 CONDITION_PRECEDENCE_READING -- `viewer/src/uiScript.ts:42`
- **Answer.** Read `FUN_0025e960` (D:L108286+): one running value, each operand combined with it through the pending
  operator, `(` recursing, NOT inverting the next operand or group. **Left to right, no precedence, no short-circuit.**
  The ARMORY's mixed conditions all bracket, so no ARMORY truth changes. **PROVEN** (R106.1).
- **Implementation.** As CALL_ANIMATION_AT_ONCE (fold onto `zanimRuntime.ts`).

### 2.25 ENABLE_VALVE_DEFAULTS_READING -- `viewer/src/armory.ts:237`
- **What I did.** `probe_valves.ts`: every valve the ARMORY sets read (`dlg_equipment_mp`, `ShowAndSpin`,
  `UICharacterProfile`, `uianim`), its writers and its `mission.rdr` values over the 22 MP maps.
  `global_valves_vs_armory.out` adds the boot defaults.
- **Answer** (`probe_valves.out` holds the full table). **STRONG.**
  - `Enable_*` come from the map's `mission.rdr` on 22/22 maps, with these exceptions:
    - the F2000 rounds on 20/22;
    - `Enable_c4` on 21/22 (values 0 x12, 1 x4, 9 x2, 16 x3);
    - `Enable_LasDes` and `Enable_empty` on none, so they are 0.
  - `Enable_*` are rewritten only by `SetMPWeaponValves` (dlgGameLobby, and the ARMORY's own copy), and only for
    `EQlimit` 1-4.
  - `Enable_c4` and `Enable_red_smoke` (0 everywhere) are written by no script.
  - `primsel`, `secsel` and `equip1-3sel` (`UpdateSelItemValves`), `UiCharLocked` and `player_team` are written by
    code only.
  - `InWhichAOP` is the map's (0 on 10 maps; 50, 60, 70 and 80 on 3 each) and the campaign AOP dialogs'.
  - `Set*` are PERSIST card valves (FOURTH_UNLOCK). `EQlimit` and `mp_x_sec_clock` are 0 at boot (`global_valves.rdr`).
  - Every other valve the ARMORY reads is made at 0 on first use (R104.6). None of them is non-zero in
    `global_valves.rdr`.

  The viewer's seeding (the map's valves, then the state's selectors) is the original's for `EQlimit` 0.
- **Implementation.** Rename to a sourced constant. A dev-disc test: for every MP map, the runner's start valves
  equal `mission.rdr` plus zeros, and `Enable_empty` and `Enable_LasDes` are 0.

### 2.26 FOURTH_UNLOCK_READING -- `scene/src/armoryCharacters.ts:47`
- **What I did.** `probe_valves.out` shows the `Set*` valves are written only by `dlgDebriefing.rdr`.
  `dump_dlgDebriefing.out` gives `TestForCompletionLevel`, and `probe_calls_completion.out` shows it is called only
  from the debriefing's `incr_*` / `decr_*` / `MoveToNextMiss`. None of the names is an ELF string, so no code writes
  them by name. `global_valves.txt` L510-543 declares them `PERSIST`, default 0, and PERSIST valves are written to the
  card under `PersistentValves` and restored at load (R104.5, `FUN_00352a90`, `FUN_00352960`).
- **Answer.** Each fourth character unlocks when the player's own card says so:
  - `SetSabre` on missions 51-53 all at >= 3, and `SetPius` at >= 2;
  - `SetQuixada` on 61-63 at >= 3;
  - `SetReaver` on 71-73 at >= 3, and `SetOfficer` at >= 2;
  - `SetSpecialist` on 81-83 at >= 3, and `SetValeska` at >= 2;
  - `SetFeral` when GameComplete > 4.

  A fresh card has all of them at 0, which is the viewer's value. It is **per player and client-side**: the original
  game uses its local valve. **STRONG.**
- **Implementation.** Keep 0 until the port has a profile or card (OPT-02). Then read the PERSIST `Set*` valves. Note
  for the room (C1): `armoryTypeAllowed` refuses the fourth type on campaign maps for everyone, while the original lets
  an unlocked player take it (see "Sourced but not implemented").
- **Owner-ruled: unlocked (OT.R91, 2026-10-31).** The owner ruled that every campaign character is unlocked in the MP
  ARMORY (SOCOM Legacy has no campaign): `CAMPAIGN_UNLOCKS_EARNED_RULING` (`scene/src/armoryCharacters.ts`) feeds the eight
  `Set*` valves as 1 to the room, the bots and the page's scripts. The answer above -- what the original does, a fresh
  card at 0 -- and its RESOLVED status are unchanged; the constant set to false restores it.

### 2.27 LINE_PITCH_READING -- `viewer/src/armoryText.ts:55`
- **Answer.** The pitch is the class's vtable+0x88: `SPACING` (+0xbc, 0x36afb0) for the TELETYPE and the wrapped
  lines, 0 for a TEXT. It is used unscaled: the TELETYPE draw `FUN_00378c00` (D:L272797-272889) uses y + row x
  SPACING, and `FUN_003794b0` uses y + k x SPACING - 3 (D:L273138-273141). So 19, as the viewer has it. **STRONG**
  (R111 §3.2, §5, §6; the -3 re-read).
- **Implementation.** None; rename.

### 2.28 LOOP_YIELD_READING -- `viewer/src/uiScript.ts:44`
- **Answer.** Confirmed. END_WHILE (`FUN_0025e600` D:L108126-108127) jumps to its WHILE and is not done, and LOOP
  (`FUN_0025ede0` D:L108458-108472) restarts next frame. Both end the sequence's frame. **STRONG** (R106.3).

### 2.29 MODEL_CAMERA_READING -- `scene/src/uiLayout.ts:15` (use: `viewer/src/armoryView.ts:39`)
- **Prior.** Place read by fit; the projection a vertical FOV of pi/4.
- **Place.** `FUN_00366730` (D:L262800-262856) makes each model at (AZIMUTH + 320, ELEV, 320 - DISTANCE), and the
  camera node stands at (320, 0, 320) (`FUN_003157d0(0x43a00000, 0, 0x43a00000, cam)`, D:L54812, re-read). So the
  model sits at (AZIMUTH, ELEV, -DISTANCE) relative to the camera, which is the viewer's place (R140.4).
- **Projection.** See UI_CAMERA_READING: **457.007 px per unit**. `model_origins.py`: at 457.007 the 67 entries'
  origins land x 483-506 (mean 494.9), y 160-184 (mean 172.8), against `EquipWeapWin`'s centre (497.5, 164). At the
  viewer's 540.8 they land x 513-540 (mean 527.0), about 30 px right of the window's centre. **PROVEN** (the place's
  lines, the focal's operand, the dump).
- **Implementation.** `armoryView.ts`: `f = 457.007` square, i.e. a horizontal half-FOV of 35 deg; the vertical half
  angle is 35 x 448/640 = 24.5 deg (`cam+0x1c4 / +0x1cc / +0x1d4` in the dump). Equivalently, a PerspectiveCamera with
  fovY = 2 atan(224 / 457.007) = 52.23 deg. Test: `projectOrigin(EquipMark23)` = (320 + 457.007 x 6/15, 224 - 457.007
  x 1.75/15) = (502.8, 170.7). Share the constant with C6's `UI_MODEL_FOCAL_READING`, which this also answers.

### 2.30 MULTILINE_LIFT_READING -- `viewer/src/armoryLayout.ts:91` (`LINE_LIFT`)
- **Current value.** -5 (the TELETYPE cursor's `DAT_003e0390`), applied to both the WRAPPEDTEXT and the TELETYPE
  text.
- **What I did.**
  - Re-read `FUN_003794b0`: a line's pen is `FUN_003631a0(line, x, int(y + k x pitch - 3.0))` (D:L273138-273141).
  - The line node's text offsets +0x7c / +0x80 are 0 from its constructor (`FUN_00363e70`).
  - The ELF word `DAT_003e0390` = -5 is read (`ELF 0x3e0390`); it is the TELETYPE cursor's (R111 §6).
  - R111.8: a TELETYPE's text lines sit on their rows (pitch only).
- **Answer (partial).**
  - By source the WRAPPEDTEXT lift is **3**, and the TELETYPE's text has **no** lift. **PROVEN** for both.
  - The owner's capture fitted the WEAPON TIPS feet at 300 / 319 / 338. The source rule with `font_text_01`'s foot 5 x
    0.9 above the pen predicts 302.5 / 321.5 / 340.5.
  - Single-line texts in the same capture sit about 1 row higher than ours too (R95 §2.8), so about 1.5 rows of the
    WRAPPEDTEXT's 2.5 remain unexplained.
- **Implementation.** Use the source's 3 for the WRAPPEDTEXT and 0 for TELETYPE text; keep -5 only for the cursor.
  Re-score against the capture once ARMORY_TEXT_V's 1.0 is applied.
- **Owed.** A native 640x448 PCSX2 frame of the weapon row (the WEAPON TIPS lines and a one-line label in the same
  frame), measured unscaled.

### 2.31 SUSPEND_MENU_INPUT_READING -- `viewer/src/armoryState.ts:76`
- **Answer.** `FUN_00277220` (D:L122805-122823) parses the argument as seconds and **overwrites** `CGameMenu`+0x900
  (`FUN_001f3bb0` D:L54349-54358). While that is above 0 the dispatch is skipped and the timer drops by the raw dt
  (D:L262264-262269). "0" ends it, and a press inside the suspension is lost (R116.8-9). **PROVEN.** The viewer's
  `SUSPEND` table stands.

### 2.32 TELETYPE_DT_UNIT_READING -- `viewer/src/armoryText.ts:40`
- **What I did.** The TELETYPE tick `FUN_00377b80` (D:L272243+) multiplies dt by `DAT_003e0388` first
  (D:L272272). The ELF word at 0x3e0388 is **1.0**. Its setter `FUN_0037b980` is called only by
  `OnSetTtySpeedFactor` (`FUN_0027ff20`, a `ui-binding` name, `SetTtySpeedFactor`) and by the dialog build, which
  resets it to 1.0 (D:L263463). The ARMORY sets never call `SetTtySpeedFactor` (`probe_scripts.out` (f)). The face
  scale in `fonts.rdr` is 1 (`fonts.txt` L7).
- **Answer.** dt is in seconds. The distance grows dt x INTERVAL x SCALE x face scale x 1.0 = 1330 x 0.9 = **1197
  px/s**, the viewer's rate. **PROVEN.**
- **Implementation.** None; rename. The ARMORY_MENU_TICK_RATE caveat applies to the tick sound.

### 2.33 TELETYPE_TICK_SOUND_READING -- `viewer/src/armory.ts:410`
- **Answer.** `.TYPE`, HUDUI index 7, through `uisounds.rdr` TELETYPE (`DAT_0049ea88`; `FUN_0036a300`
  D:L264867-264874). It plays on each appending tick after the first character (R122.5, R122 §12), and the
  recompiled-game logs show sound 7. **STRONG.**

### 2.34 UI_BANK_PLACEHOLDER -- `viewer/src/armory.ts:39`
- **What I did.** Re-read the menu init: `FUN_00344090("sounds.rdr", "HUDUI")`, then the same for `SMUS` and
  `UIVOICE`, then `FUN_003448e0("UI")` -> `FUN_00348130` (D:L54850-54853, D:L242929-242936).
- **Answer.** "UI" is `sounds.rdr`'s `GROUPS/UI`, the audio options' voice-test groups, not a bank. The menus' bank is
  HUDUI by source, so the page is already right. **PROVEN.**
- **Implementation.** Retire the placeholder, citing the lines.

### 2.35 UI_CAMERA_READING -- `viewer/src/armoryView.ts:36`
- **Prior.** The record's +32 (0.7854) taken as the vertical FOV; the rest undecoded. R140 fitted 455 +- 5 px/unit on
  the main menu's captures without reading the matrix.
- **What I did.**
  - The world loader `FUN_00318da0` copies `cameras/camera` (0x90 bytes) to cam+0xc0 and then calls
    `FUN_00291490(0x3f1c61aa, cam, 1)` (D:L217196-217205). 0x3f1c61aa = **0.6108652 rad = 35.000 deg**.
  - `FUN_00291490` (D:L137429+) stores it at +0xe0 (which is the record's +32: 0xc0 + 0x20), keeps the sine, cosine,
    tangent and its inverse, and sets **+0x290 = +0x4b0 (320) x cot**.
  - `FUN_00294070` builds the projection's x and y from +0x470 / +0x474 (1.0) x +0x290 / +0x4b0 (D:L138949-138952).
  - `read_menu_camera.py` on all five `logs/parity/menu*.rdram` gives camera 0xd6df20: +0xe0 = 0.6108652 (the
    record's copy), +0x290 = **457.007**, +0x370 = +0x384 = 1.42815 (= cot 35 deg), near 4, far 100, +0x4b0 = 320,
    +0x4b4 = 448.
- **Answer.** The UI camera has a 35-degree half-horizontal FOV and a focal of 457.007 px per unit, square in the
  matrix. R140's independent fit on PCSX2 frames (455 +- 5) agrees. **PROVEN.** The dumps are from the recompiled
  original (the same code); the operand is the code's.
- **Implementation.** As MODEL_CAMERA. `MODEL_CAMERA_READING.fovY` = 2 atan(224 / 457.007) (52.23 deg); the record's
  +32 is not used.

### 2.36 UI_DRAW_ORDER_READING -- `viewer/src/armoryLayout.ts:84`
- **Answer.** R112.1-2 (and R115 §4.3):
  - The **backplane** (+0xc4) draws first: the background, every CONTROL with its subordinates, every OBJECT, each by
    CHILDOF, walked depth-first in append order (`FUN_00336a60` D:L235063-235110).
  - Then the models' 3D pass.
  - Then the **foreplane** (+0xc8): MENUFADER, then POPUP (`FUN_00369170` D:L264251-264259).

  The viewer's draw (armoryView.ts:268: objects, models, fader, popup) already follows it. Its doc's "MENUFADER before
  the controls" is wrong. **STRONG.**
- **Implementation.** Fix the doc and rename. UI_MODEL_DRAW_ORDER (C6) is confirmed by the same Tick.

### 2.37 UI_MODEL_LIT_READING -- `viewer/src/armoryView.ts:45` -- PARTIAL
- **What is known.** No UI model packet carries the lit flag (R95 decode), so the page draws them unlit with their
  vertex colours. But R141 (MENU-FADE's probe) measured the page's main-menu roller at 1/0.56 of the console's
  brightness (correlation 0.98): something in the vertex colour or lighting path darkens the console's UI models.
- **Answer.** Not settled. BELIEVED: the unlit draw is right in kind, wrong in level.
- **Owed.** A GS dump (RGBAQ per vertex) of the ARMORY preview or the menu roller on the console, against the mesh's
  stored colours. Or a read of the UI world's draw (`FUN_00318da0`'s light setup and the UI model packets'
  ADC/colour words) to find the 0.56.

### 2.38 UI_OBJECT_TEXT_ORIGIN_READING -- `viewer/src/armoryLayout.ts:36` -- NOT-A-GAP
- Retracted in the polish pass and replaced by `UI_TEXT_ORIGIN` (the cell bottom: `FUN_00361bd0`
  D:L260374-260460, `FUN_00362900` D:L260663-260706). The name survives only in a comment; drop the ledger row.

### 2.39 UI_TEXT_DEFAULT_COLOUR_READING -- `viewer/src/armoryLayout.ts:73`
- **Answer.** The TEXT factory `FUN_00382070` (D:L277613-277656) starts the spec's COLOR at 0x43000000 three times
  (128.0, the GS's 1.0) at D:L277640, before reading `COLOR`. (128,128,128), as the viewer has it. **PROVEN.**
- **Implementation.** Rename to a sourced `TEXT_DEFAULT_COLOR` (as `@s2u/ui` `DEFAULT_COLOR`).

### 2.40 UI_TEXT_ORIGIN_RESIDUAL_READING -- `viewer/src/armoryLayout.ts:55` -- PARTIAL
- **What I did.** `read_text_rows.py` on the RDRAM dumps:
  - `DAT_0049e9a0` / `DAT_0049e9a8` (the corner terms) are **0 / 0** in all five front-end dumps and **5 / 6** in
    `spawn_pcsx2.rdram` (PCSX2 in a round) and `spawn_ours.rdram`.
  - `DAT_0049ea00` / `DAT_0049ea04` are 1728 / 1824: the GS frame origin (2048 - 320, 2048 - 224), not an offset.
  - `DAT_004a44ac` = 1.0 everywhere.
- **Answer.** The lobby's ARMORY runs in the front end with the HUD torn down (`FUN_001fbae0` D:L57797-57798 writes
  0), so the offsets are 0 and the viewer's 0 is right. **PROVEN.** The note's "runtime offsets not in the
  decompilation" are settled. The remaining 0.4-1.2-row difference against the 1.16-scaled crops is not from them;
  part of it is ARMORY_TEXT_V (the 448/480 factor, about 0.3 row on `font_text_01`).
- **Owed.** The native-resolution capture named under MULTILINE_LIFT.

### 2.41 WRAPPEDTEXT_CLIP_READING -- `viewer/src/armoryText.ts:60`
- **What I did.**
  - Re-read `FUN_003794b0` (D:L273115-273147). With HEIGHT > 0 it sets a scissor from rows int(-4 + y - SPACING) to
    int(-4 + y + HEIGHT - SPACING), x to x + WIDTH (`DAT_003e0370` = -4, read in the ELF). Line k's pen is
    int(y + 19k - 3), drawn only with its y in (0, 448).
  - `probe_tips.ts` ran all 57 captions the ARMORY's scripts put in `WepInstText` (WRAPPEDTEXT, 25,310, WIDTH 175,
    HEIGHT 95, SPACING 19, SCALE 0.9, no AUTOSCROLL; its parent `EquipWeapOpaque` at 0,0) through `@s2u/ui`'s
    source-transcribed `wrapLines`, `placeWrapped` and `layoutText` in `font_text_01`.
- **Answer.** The scissor is rows **287..382**. Only one tip runs past 5 lines: **1207** (the F2000's), 7 lines.
  - Lines 0-4 draw. Line 0 loses its cell's top 2 rows and line 4 its bottom 2, all blank rows of the cell.
  - Line 5 keeps only its cell's top 2 rows (380-382), above the capitals' rows 5-20 of 25, so nothing shows.
  - Line 6 is hidden.

  The visible result equals the viewer's "lines inside HEIGHT" (5 lines). The mechanism is a scissor, and it also
  clips a word wider than WIDTH horizontally. **STRONG.**
- **Implementation.** Draw the WRAPPEDTEXT through `@s2u/ui` (`placeWrapped`'s clip) or apply the scissor rectangle.
  Test: 1207 gives 7 lines, scissor (25, 287)-(200, 382).
- **Owed.** A capture of the F2000's tips (on the owner's capture list) to see line 5's absence.

### 2.42 ZANIM_RECALL_READING -- `viewer/src/uiScript.ts:52`
- **Answer.** Contradicted. A start takes the first instance of the definition's chain that is not alive, else a new
  copy only where the flags allow one, and no disc animation allows it. So a call of a running animation **starts
  nothing** (R106.4, `FUN_0025d5c0`). `CallShowAndSpin` stops before calling, so the ARMORY's visible behaviour does
  not change. **STRONG.**

## 3. The unnamed findings and note-only rows

- **UISCRIPT_STOP** (`uiScript.ts:27`, `stop`). STOP_ANIMATION stops the slot's instance, else the definition's first
  instance, not every instance of the name (`FUN_0025d490` D:L107444-107461, `FUN_002707c0` D:L118829-118895;
  R106 §5, §7). **STRONG.**
- **UISCRIPT_OPACITY_RATE.** The begin sets `from` (`FUN_0025f960` D:L108842-108845). Each tick adds rate x dt and,
  when the time is up, snaps to `to` and passes on the rest of dt (`FUN_0025f880` D:L108814-108831, read). It is not
  t / time. **PROVEN.**
- **UISCRIPT_NOT_DONE.** A statement VALVE test, or a `ui::UI_COMMAND` answering false, is not done: the sequence waits
  on it next frame (R106.3, `FUN_002745a0` D:L121344-121431). The viewer marks both done. **STRONG.**
- **ARMORY_IMPLICIT_CUES** (`armory.ts:38-40`). `ActivateButton` plays SELECTION (`.METAL`, HUDUI 8) when the control
  is found: 8 calls in `dlg_equipment_mp.rdr` (`probe_scripts.out` (f)). `PopUpDialog` plays `.METAL` (records 1245,
  47 and the net errors'), and the popup's LEFT, RIGHT and CROSS play SELECTION (R122.6-7, R122.13). **STRONG.**
  Implementation: the host's `ActivateButton` / `POPUPDIALOG` call `sound('.METAL')`, and the popup's steps do too.
- **ARMORY_POPUP_TRIANGLE** (`armoryState.ts:94-96`). Record 1245's +64 = 0 (`probe_popup.out`), so TRIANGLE in the
  confirm writes nothing and leaves it open (`FUN_00370990` D:L268476-268549, R118.6). The viewer answers NO. **PROVEN.**
- **ARMORY_BITMAP_UV** (`armoryLayout.ts`, quads u 0..W). Every 2D quad samples S 0.01..0.99 and T -0.01..-0.99
  (`FUN_00364c50` D:L262025-262030, `FUN_00364830` D:L261813-261816). **PROVEN.** This is the cause of
  ACT_FRAME_BORDER.
- **ARMORY_TEXT_V** (`armoryLayout.ts:36-45`, "5 x S x 448/480"). The glyph corners go through `FUN_00364f30` with y
  factor `DAT_004a44ac`, which `FUN_003b1200(0)` sets to 1.0 (R111.4). It reads **1.0** in every RDRAM dump
  (`read_text_rows.out`). The 448/480 the ARMORY inherited from `hudFont` is not the source's. **PROVEN.** Expect about
  0.3 row of change on `font_text_01` at 0.9; re-score the polish captures.
- **ARMORY_MENU_TICK_RATE** (`armory.ts:394`). The menu state's frame cap is 30 (`DAT_003e1400`; R116.14, a reading).
  Rules counted per frame run at 30/s on the console and at the page's rate here: the TELETYPE's one tick sound per
  appending frame (about 120 characters/s typed means every frame appends), LOOP and END_WHILE yields, the 0.15-s
  suspensions (5 ticks). **PARTIAL, BELIEVED.** Owed: a frame-timed capture of the description typing (count the
  `.TYPE` plays in a 989snd log over one description).
- **ARMORY_ALL_SEL_HAVE_READING** (note only). `DoAllSelCharsHaveWeapon` (0x2808e0, not in the decompilation), read in
  the recompiler's disassembly (`recomp/output/UIDoAllSelCharsHaveWeapon_0x2808e0.cpp`):
  - the argument (a name, or the `INPUT_STRING` valve) is split on ',' and ' ' into item ids;
  - `UiCharSet` (0x3ee878) is read;
  - the selected characters are iterated (fewer than 32), each one's 12-byte kit entries scanned for a listed id;
  - the result is 0 at the first character holding none, else 1.

  **BELIEVED** (one reading of the instructions). In MP one character is selected.
- **ARMORY_MEMCARD_SAVE_READING** (note only). **UNRESOLVED**, not researched this wave. Owed: read `FUN_0033eb70` /
  `FUN_0033e7f0` ("WeapProfile_%d.dat") for what `SaveCharacterProfile` modes 3 and 4 write.
- **ARMORY_INIT_VOICE_READING** (note only). **NOT-A-GAP** (BELIEVED). `UIInitializeOnlineArmory` (0x27d8c0
  D:L126092-126101) touches only the voice object `DAT_0045b718` (state 0xb, flag +0x4a cleared); no ARMORY logic
  reads it.
- **SPECIAL_GLYPH_179_READING** (note only). **UNRESOLVED**, not researched. Owed: `fonts.rdr` `font_special_01`
  code 179's record and a capture of a line that uses it. It is C6's text area.

## 4. Sourced but not implemented (multiplayer-relevant)

1. **The joined game's settings record -> valves.** `FUN_002f83b0` (D:L197114+) copies the record of the game a
   player joins into valves (`EQlimit` is D:L197248-197257). `FUN_002f7c40` (D:L196715+) is the host's packer
   (byte 0 = 0x44, then max rounds, round time / 60, a global, max spectators, `EQlimit`, sort order, rank
   restrictions; called at D:L191365, D:L204009, D:L204367). The joiner's side copies:

   | record field | valve |
   |---|---|
   | +0x1a0 | `mp_game_sort_order` |
   | +0x24 | `MaxPlayersValve` |
   | +0x19e | `MaxSpectatorsValve` |
   | `FUN_002e34d0` | `mp_friendly_fire` |
   | `FUN_002e33d0` | `mp_allow_respawn` |
   | +0x19f | `EQlimit` |
   | +0x19b | `mp_max_rounds` |
   | +0x19c | `mp_max_round_time` |
   | +0x1a1 | `mp_rank_restrictions` |

   The room has no such record: the lead for C1 and ONL (Create Game / the game list).
2. **The restricted modes** (Pistols / Shotguns / Snipers / No Bombs; `SetMPWeaponValves`, `SetMPCharWeaponValves`;
   R95 §3.5). They would come through `EQlimit` above. The room has only the unrestricted mode.
3. **The fourth character is client-side in the original.** An unlocked player (their card's PERSIST `Set*`, see
   FOURTH_UNLOCK) can take the campaign map's fourth type online. The room's `armoryTypeAllowed` refuses it for
   everyone wherever `InWhichAOP` != 0. An owner question for when profiles exist.
4. **The saved loadout's key** in the original is (host, port, account, mission) x side (`FUN_002fb470`). The port
   keys by map + side by ruling (W5.R4).
5. **The lobby's ARMORY gate and clocks.** The ARMORY cannot open when `mp_minor_game_state == 2` or
   `mp_major_game_state != 1`. After the briefing the button waits 10 s (`ArmButtonClock`). The launch count's first
   tick pulls everyone out (popup 47, 5 s). R95 §4.1; for ONL-16/17.

## 5. Leads for other workstreams

- **C6 (compositor and text).**
  - `UI_MODEL_FOCAL_READING` (`ui/src/compositor/models.ts`) is answered: **457.007** px/unit, `FUN_00291490(35 deg)`
    from `FUN_00318da0` D:L217205, read back from `menu*.rdram` cam+0x290 (`read_menu_camera.out`). It replaces the
    fitted 455.
  - `FRONT_END_TEXT_ROWS_READING` (`ui/src/text/layout.ts`) is confirmed 0/0 by every front-end RDRAM dump, and
    `HUD_TEXT_ROWS` 5/6 by `spawn_pcsx2.rdram` (`read_text_rows.out`).
  - `TEXT_V` = 1.0 is confirmed in the dumps.
  - The C6-owned names defined again in my files (`BAR_SCALE_ORIGIN_READING`, `TEXT_FADE_ALPHA_READING`,
    `TELETYPE_CURSOR_READING`, `SPIN_SCREEN_SENSE_READING`, `UI_MODEL_DRAW_ORDER_READING` in
    `armoryLayout.ts` / `armoryText.ts` / `armoryView.ts`) are answered or narrowed by R112.3 (fades stay), R111 §6
    (the cursor), R140 (spin sense, LOAD GAME axis) and R112.2 (draw order). When PLAT-34 folds the ARMORY onto
    `@s2u/ui` these duplicates go.
- **C3 (HUD).** `HUD_TEXT_ROWS` 5/6 is now also a PCSX2 RDRAM read (`spawn_pcsx2.rdram` 0x49e9a0 / 0x49e9a8).
- **C1 (server).** Items 1 and 3 above. The ARMORY's per-item profile re-validation (ARMORY_PROFILE_REVALIDATE)
  should be the page's, before it sends picks.
- **PLAT-34 (fold the ARMORY onto `@s2u/ui`).** Fourteen rows here are "follow research 106/111/112/116/118/122". The
  fold is the single change that applies them:
  - `zanimRuntime` for the script rules;
  - `popup.ts`;
  - `wrapped.ts` / `teletype.ts`;
  - the compositor (UV inset, opacity stack, planes);
  - `uiSoundCues`.
- **Owed captures**, to batch for the owner (PCSX2, Crossroads or any MP map, online lobby -> ARMORY):
  - a native 640x448 frame of the weapon row with WEAPON TIPS showing (MULTILINE_LIFT, TEXT_ORIGIN_RESIDUAL,
    ACT_FRAME vertical);
  - the F2000 selected (WRAPPEDTEXT_CLIP);
  - a GS dump of the preview model (UI_MODEL_LIT);
  - a 989snd log over one description typing (MENU_TICK_RATE).

## 6. Verification (V4, 2026-10-04)

The verifier's file: `research-wave-2026-10-04/V4-verify-ui-audio-card.md` (its scripts and outputs under `research-wave-2026-10-04/scratch/V4/`). V4 verified C4, C5a, C5b, C6, C7, C8 and C9 (34 claims sampled). What follows is the verifier's own text for this report's claims, verbatim; its claims about the other reports are in their notes ([178](178-the-research-wave-of-2026-10-04.md) has the table). V4's tally over its 34 sampled claims: CONFIRMED 29, CONFIRMED-WITH-CORRECTION 5, WRONG 0, UNVERIFIABLE 0.

Verifier V4, research wave 2026-10-04. Read-only. Scripts and their saved outputs are in `scratch/V4/` (README there).
`D:L<n>` is a line of `C:/Projects/socom_pc/game/analysis/socom2_game.elf.decomp.c` (r0001). `$PORT` is the
`agent/online` snapshot named in the brief. No decompiled text is quoted.

**Method.** I sampled 34 claims, at least 4 from each report. I took every must-include claim, then the "the port is
wrong" claims and the PROVEN/STRONG rows an implementer would act on. Where I could, I re-derived each one by a
different route from the author's:
- I disassembled the ELF myself instead of trusting the decompiler.
- I read `.data` vtables to fix slot meanings.
- I scanned raw disc bytes instead of using the author's parser.
- I read the cells in the PCSX2 dumps.
- I re-ran the C5b unicorn script and decoded C8's netcnf files with my own key build.

I then checked each claim against `$PORT` to confirm that the port does what the report says.

**Result.** No claim in the sample is wrong. 29 are confirmed as written. 5 are confirmed with a correction:
- In two of them the stated value or answer is right but the reasoning or wording is not. For `CheckTeamStatus`
  (C5b) this matters for the implementation.
- In the other three a detail needs adding.

### 6.1 Verdicts

| # | claim | report | verdict | one-line reason |
|---|---|---|---|---|
| 1 | UI camera focal 457.007 px/unit (35 deg hard-coded, D:L217205); the port uses 540.8 | C4 | CONFIRMED | `lui 0x3f1c/ori 0x61aa -> $f12` at 0x3191ec; 320*cot = 457.0074; menu.rdram cam+0x290 = 457.0074; port `armoryView.ts:39` fovY pi/4 gives 540.78 |
| 3 | the ARMORY confirm popup opens on NO; Triangle does nothing | C4 | CONFIRMED | slot 1 (+0x340) gets vtable +0x50 = 0x3766a0, which sets the focused state +0xfc (read from `.data` 0x407480); slot 1's label is 246 "NO"; +64 = 0 in record 1245 |
| 4 | opacity multiplies down the tree (the port's ARMORY says "own") | C4 | CONFIRMED | `FUN_00336980` pushes opacity x the stack's top; `ui/compositor/frame.ts` already models it, `armoryLayout.ts:115` does not |
| 5 | conditions are left to right, with no precedence (the port has not>and>or) | C4 | CONFIRMED | `FUN_0025e960` keeps one running value combined through the pending operator; every operand is evaluated |
| 6 | the pane text is the item's `Description`; the constant is stale | C4 | CONFIRMED | `armory.ts:121` = 'DisplayName' while `armory.ts:279-280` returns `description` |

### 6.2 Claims 1-2: The UI camera's focal (C4 UI_CAMERA / MODEL_CAMERA, C6 UI_MODEL_FOCAL) -- CONFIRMED

- **Independent route.** I disassembled the ELF around the world loader (`v_camera.py`). At 0x3191ec-0x319200 the
  code does `lui $v0,0x3f1c; ori $v0,$v0,0x61aa; ... mtc1 $v0,$f12`, so the first float argument is 0x3f1c61aa
  = 0.6108652 rad = 35.0000 deg. That is the operand the decompiler shows at D:L217205.
- `FUN_00291490` (D:L137431-137451) stores it at +0xe0 and writes +0x290 = +0x4b0 x (1 / tan).
- `FUN_00294070` hands +0x290, +0x470 and +0x474 to `FUN_001c0410`, a view-screen matrix of the
  `sceVu0ViewScreenMatrix` shape (scrz, ax, ay, cx, cy...). With ax = ay = 1, both axes use 457 px per unit in the
  640 x 448 buffer. So the projection is square in buffer pixels.
- **Dump.** menu.rdram, camera 0xd6df20: +0xe0 = 0.6108652, +0x290 = 457.0074, +0x4b0 = 320.
- **Port.** `armoryView.ts:39` has fovY pi/4, which is 224 / tan(pi/8) = 540.78. `ui/compositor/models.ts:83` has 455.
  Both reports are right that the port is wrong.
- **Nit (C6).** C6 writes 457.0076, which is 320 / tan of exactly 35 deg. The game's float32 is 457.0074. Use
  `320 / Math.tan(0.6108652)` and test to 3 decimals.
- **Side note.** The camera's culling planes (+0x1c4..+0x1d4) use a linear 35 x 448/640 = 24.5 deg vertical
  half-angle. That is a frustum approximation, not the projection. C4 mentions it correctly; an implementer should not
  take 24.5 deg as the projection's fovY.

### 6.3 Claim 3: The confirm popup opens on NO -- CONFIRMED

- C4 and research 118 rest on "slot +0x50 = focus, +0x54 = unfocus". I settled this from `.data`, not by inference
  (`v_popup_vtbl.py`). The vtable word 0x36e6b0 (`FUN_0036e6b0`) sets the button's draw state to +0x130, the normal
  bitmap; it appears at 0x407484 and four sibling tables. The word before it is 0x3766a0, a function the decompiler
  missed. Its disassembly sets +0x198 = +0xfc, the focused bitmap.
- D:L267136-267137 calls +0x50 on the button at +0x340 and +0x54 on the one at +0x790. The +0x340 object takes its
  bytes from the record's first slot (+68), because its +0x85 / +0xbc flags come from the slot's +68 byte.
- In record 1245 that first slot's label is 246. In the UIMN LOC table, 246 is "NO" and 253 is "YES".
- C4's probe reads +64 = 0 for record 1245, so Triangle is not armed (D:L266854 sets +0x339 from it).
- **Port.** `armoryState.ts:98` has `'yes'`. The change stands.

### 6.4 Claim 4: Opacity is inherited and multiplied -- CONFIRMED

- `FUN_00336980` (D:L235028-235043) writes `param_1 x top` to the new stack entry. `FUN_00336a10` pushes only below
  127/128.
- The port's own `ui/compositor/frame.ts:30-36` already implements this (`OPACITY_PUSH_BELOW`). Only the viewer's
  ARMORY copy (`armoryLayout.ts:110-115`, "own") disagrees. The fix is to bring the ARMORY onto the shared rule.

### 6.5 Claim 5: Conditions: left to right, no precedence -- CONFIRMED

- `FUN_0025e960` (D:L108286+) keeps one accumulator (`unaff_s1`) and combines each operand through the pending
  operator byte (2 AND, 3 OR). A group `(` recurses, and NOT flips the next operand.
- Every operand is evaluated, so there is no short-circuit.
- The port's `uiScript.ts:42` reading (`not>and>or`) is wrong in principle. As C4 says, it gives no different truth
  on the ARMORY's disc conditions.

### 6.6 Claim 6: The pane text -- CONFIRMED

`armory.ts:121` exports `'DisplayName'` with a "writer not traced" doc, while the code at :279-280 already returns
`description`, citing `FUN_002af190`. Only the constant and its doc are stale.

### 6.7 What an implementer should take from this (the verifier's list, for all seven reports)

- Every sampled "the port is wrong" claim held. The changes the reports propose for the camera, popup focus, `atofF32`,
  `IsNetwork`, the alpha-0 depth write, the cursor colour, UIVAR typing, movie gain, fade stepping, the default range,
  register-2 flooring, netcnf `nic`, the persona key, MC handles, the zoom fog and the zoom LOD can be acted on.
- Two of those need the adjustments above:
  - `CheckTeamStatus`: implement the predicate `w437ce8 && (b45a0c0 || w441470)`, not "no game exists".
  - The cursor: grey means 128/255 on an untextured quad.
- Three small ones:
  - The menu tick is 29.97 Hz.
  - Reuse `SOUND_DEFAULT_RANGE`.
  - Use 457.0074, the game's float, as the focal.

## 7. Implemented (ARMORY-UI, web sprint 17, 2026-10-04)

Added 2026-10-04 by ARMORY-UI's implementer (branch `agent/s17-armory-ui`; reading level, pending review). The owner
played the build beside the recompiled game and flagged the confirm popup; each C4 item below is closed in the code
with a test that failed before it. The camera (§2.29, §2.35) was already on `agent/online` (C4-CAM) and is not touched.

- **2026-10-04 -- §2.15 ARMORY_POPUP_FOCUS_READING, closed.** `armoryState.ts` `ARMORY_POPUP_FOCUS = 'no'`: the
  confirm opens on NO; an immediate Cross answers 1. `test/armoryState.test.ts` "S4 Confirm".
- **2026-10-04 -- ARMORY_POPUP_TRIANGLE (§3), closed.** TRIANGLE in the confirm does nothing (1245's +64 is 0); UP and
  DOWN are no keys of the popup (research 118 §4); LEFT/RIGHT toggle, both with SELECTION. "S4: an immediate Cross".
- **2026-10-04 -- §2.2 ACT_FRAME_BORDER_READING and ARMORY_BITMAP_UV (§3), closed.** `armoryLayout.ts`
  `ARMORY_SPRITE_UV` (from `@s2u/ui` `SPRITE_ST` / `stToImage`): every ARMORY quad samples 0.01..0.99 of its bitmap.
  "samples every bitmap at S/T 0.01..0.99". The vertical border (about 1.6 px) stays owed to a capture (§2.2).
- **2026-10-04 -- §2.23 CHILD_OPACITY_INHERIT_READING, closed.** `armoryLayout.ts` `opacityOf` / `CHILD_OPACITY`: the
  walk's stack through `@s2u/ui` `pushOpacity` (float32, pushing under 127/128). "multiplies opacity down the tree";
  `armoryPreview.test.ts` "the arrows pulse together".
- **2026-10-04 -- §2.21 ARMORY_SCRIPT_SOUNDS_READING and ARMORY_IMPLICIT_CUES (§3), closed.** `armory.ts`
  `ARMORY_SCRIPT_SOUNDS`: every script `SOUND` reaches the page; `ActivateButton` (control found) and `PopUpDialog`
  play `.METAL`, so does the pull-out's popup 47; the popup's keys play SELECTION (`.METAL`). The state names a .DINK or
  .SLIDE only where the script that carries it is not run (`armoryState.ts` `ARMORY_STATE_SOUNDS`): the commit's, the
  store's and YES's .DINK are now the scripts' alone. On the Frostfire fixture YES sounds one .DINK
  (`test/armory.test.ts` "the confirm: PopUpDialog's .METAL").
- **2026-10-04 -- §2.18 ARMORY_PROFILE_REVALIDATE_READING, closed.** `armoryState.ts` `readProfile`: per item, the
  `Enable_` valve's side bit and the slot's own refusal; a refused item keeps the slot's item. "S0 Boot: a stored
  profile". Not changed: the record's `MpCharSet` outside the side's 1-4 / 5-8 (another side's record) still reads as no
  profile; §2.18's "any other value becomes 1 (SEAL) or 5" is left for the OPT-20 work, which owns the record.
- **2026-10-04 -- §2.14 ARMORY_PANE_TEXT_READING, closed.** `armory.ts` `ARMORY_PANE_TEXT = 'Description'`.
- **2026-10-04 -- §2.16 ARMORY_POPUP_LAYOUT_READING, closed.** `armoryLayout.ts` `decodePopup` reads the record whole
  through `@s2u/ui` `readPopupRecord` (+24 y, +28 x, the fixed slots) and the popup draws as research 118 §3 lays it
  out: the opaque `popupOp.tif` panel (150, 160) 340 x 130; NO at 380..429 x 255..279 and YES at 210..259 (each 85 px
  either side of the panel's centre, under the text), `active_back.tif` focused, `pop_butt.tif` normal, opaque, the labels
  at (+18 / +12, +25) in the slot's focused or normal colour; the text from x 175, its first pen 202, pitch 20, wrapped
  to 290, at the face's opacity. `armoryData.ts` reads the two button bitmaps (`ARMORY_POPUP_BUTTON_BITMAPS`). The
  button positions are the record's and were already drawn there before; what moved is the text (its x, y, pitch and
  wrap had the offsets swapped) and the panel and buttons' bitmaps and opacity. Not done: the focused label's glow
  (`POPUP_FOCUS_GLOW`, research 118 §12.2 finding 1), drawn steady here.
- **Owed: the capture.** No capture of the original's ARMORY popup is archived (searched: `logs/parity` under
  `SOCOM_PC_ROOT`, the golden manifest's `dlg_equipment_mp.rdr` row, whose two owner captures are not on this host).
  The scoring spec `packages/viewer/e2e/armoryPopupScore.spec.ts` scores our popup inside its panel against one when
  `S2U_ARMORY_POPUP_CAPTURE` names it, skipped until then; the owner's row is in `docs/HUMAN_TASKS.md`. Meanwhile the
  layout is the record's (reading), not proven.
- **2026-10-07 -- closed: the 552's suppressor in the preview** (the owner's playtest of 2026-10-06: "the armory 552 has
  the same issue the game 552 used to have"; reading, pending review). §2.3's revision traces the kind-0 lookup to the
  model's node: `ShowAndSpin`'s `ACTIVE silencer = 0` hides `sig_commandoUI`'s `silencer` part. `armoryLayout.ts`
  `ARMORY_MODEL_PART_REF` / `modelPartStates`, `ShownModel.hidden`; both presenters honour it (`armoryView.ts`
  `showModelParts`, `armoryRaster.ts`). Tests: `silencer.test.ts` (the disc), `armoryPreview.test.ts`, `armory.test.ts`,
  `armoryViewKeep.test.ts`, `armoryRaster.test.ts`. The row below is kept as it was written.
- **2026-10-07 -- the shared ARMORY** (the owner: the lobby's ARMORY drew no images; "make them a shared component that
  both use in the ways they need"). The game lobby's `dlg_equipment_mp.rdr` is now this screen (`viewer/src/lobbyArmory.ts`
  over `armory.ts`, drawn by `armoryRaster.ts` on the front end's rasteriser), so every C4 item closed above for the test
  room -- the camera (C4-CAM), the confirm popup (C4-POP), the UVs, opacity, sounds, revalidation and pane text (C4-UI) --
  now holds in the lobby too. Not folded: `uiScript.ts` onto `@s2u/ui`'s `zanimRuntime.ts` (C4-UI's last clause), the
  vertical border's capture (§2.2), the popup's focus glow.
- **Open: the 552's suppressor in the preview** (2026-10-05, from the main merge controller's sprint 25 work). The disc's
  `zweapon.rdr` gives the 552 (ID 57) and the 552SD (ID 67) one `ModelName`, `sig_commando`, and the ARMORY's
  preview model `sig_commandoUI` carries a `silencer` part (the 552SD's `SigSilencer`). ShowAndSpin's 552 branch
  sets `ACTIVE silencer = 0` (UIZANIM). An implementation that hides the part in the preview exists on
  `agent/s25-552-armory` (22e3a20d, with a disc test in `silencer.test.ts`), **not adopted**: sprint 25's review
  failed it on §2.3 of this note. §2.3 believes the kind-0 lookups (`FUN_00320f10` -> `FUN_00312120`,
  `FUN_00311ef0` -> `FUN_00198f18`) walk flat name lists at +0x90 and never reach a UI model's node graph. If so, the
  script's `ACTIVE` finds nothing, and the original still shows the suppressor in the preview. The port draws the
  whole `sig_commandoUI` (the suppressor shown), which matches that reading. It stays so until PLAT-32's trace or a
  capture of the ARMORY's 552 preview settles it. The held weapon in the match is a separate fix, sprint 25's
  (`FUN_005c0250` shows `silencer` only for a suppressed first primary).
