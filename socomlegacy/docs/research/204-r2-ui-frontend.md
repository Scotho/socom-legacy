# 204 -- R2-UI -- the front end, round 2: the static reads C4, C5a, C5b and C6 left owed

- Research date: 2026-10-04 (research wave 1, round 2 and the close; the index is [178](178-the-research-wave-of-2026-10-04.md)).
- Origin: `research-wave-2026-10-04/R2-UI-frontend.md` on the owner's host, in the evidence archive ([178](178-the-research-wave-of-2026-10-04.md) gives its root). A relative `scratch/...` path below is under `research-wave-2026-10-04/`; the per-cluster `ledger-*` files it names are merged in [`ledgers/2026-10-04/LEDGER-ALL.tsv`](ledgers/2026-10-04/README.md).
- Trees compared: **PORT** = `agent/online` at 2026-10-04 (written `$PORT`; `$PORT/..` is that branch's root, `$WEBISSUES` the `agent/web-issues` checkout); **WT** = the old-layout checkout (`$WT`, the clone's pre-restructure web project). WT-96..102 are notes 171-177 here; PORT's own notes 96-102 are other notes.
- **Status: reading, pending review -- not adopted.** Nothing in it is adopted until a sprint task takes it and a reviewer re-reads it at the source.
- Grades, translated to AGENTS.md's levels: the wave's PROVEN = an exact source read = **reading**; STRONG = reading with one interpretive step; BELIEVED = inference; UNRESOLVED = unresolved. The text keeps the wave's words.
- Verification: V7 (claims 5-7) has landed and is folded in as §20; two corrected (the upload's order and checksum, the grid walk's cap).
- Edits on import: the headings are numbered for the corpus; home-directory paths are replaced by `$PORT`/`$PORT/..`/`$WT`; the archive's absolute root is dropped; references to the other reports are links to their notes; the claims research 206 §1 overrides are named under this header. The substance is verbatim.

**Overridden in part (research 206 §1):** the ARMORY profile upload with its MD5 (§2) -- the order is list, create if missing, upload; the MD5 is never sent: it is compared at login with the server's checksum and the file downloads only when they differ; stock Horizon cannot serve it (no file list, no checksum, refuses re-create) (V7 #5, §20.2).

**Overridden in part (research 206 §1):** the grid walk is capped at 1,600 cells (§1) -- the cap is checked between rings; the last ring can overshoot (V7 #6, §20.3).

Research agent R2-UI, wave 2026-10-04, round 2. Read-only. Work list: `OWED-CAPTURES.md`, "Static reads still owed",
"Front end, text, input, boot (C4 ([182](182-c4-armory.md)), C5a ([183](183-c5a-frontend-screens.md)), C5b ([184](184-c5b-frontend-dialogs-input-boot.md)), C6 ([185](185-c6-frontend-compositor-text.md)))", plus C5b's "not attempted" rows (VALVE_POOL, UIVAR_ELEMENT_EQUAL,
MENU_EVENT_RECORDS, UNHELD_BITMAP, SKB_CLOSE_SOUND), plus the one grid-walk read that settles C9 ([188](188-c9-world-render-platform.md)) U6 and C6
ENGINE_ORDER_RING_DIRECTION. EXIT_*_READING is out of scope (campaign exits).

Conventions:
- `D:L<n>` is a line of `C:/Projects/socom_pc/game/analysis/socom2_game.elf.decomp.c` (r0001).
- `$PORT` is the `agent/online` snapshot.
- Scripts and their saved outputs are in `scratch/R2-UI/` (README there). ELF reads are r0001
  (`scratch/R2-UI/elf_reads.sh` gathers every string, vtable and disassembly cited).
- "PCSX2 dump" means `logs/parity/{title,postload,spawn}_pcsx2.rdram`. The `menu*.rdram`, `frost*`, `*_ours*` dumps
  are the PC recompilation, which runs the same code: supporting evidence only.
- No decompiled text is quoted.

## 0. Summary

18 rows: 16 RESOLVED, 2 PARTIAL. Grades: 9 PROVEN, 9 STRONG (one of the PARTIALs is STRONG on the value and
BELIEVED on the mechanism).

Five findings change what the port does or plans:

1. **The ARMORY's "SaveCharacterProfile" never touches the memory card** (ARMORY_MEMCARD_SAVE). Modes 3 and 4 upload
   the account's loadout records to the **Medius file service** as `WeapProfile_<accountId>.dat`. They go through
   `CLobbyFileIO` (MediusCreateFile, then MediusUploadFile) with an MD5 of the file. Modes 5 and 6 download it at login.
   Roadmap OPT-20 ("the ARMORY's loadout on the card") is aimed at the wrong medium: this is an online-lane (server)
   feature.
2. **The grid walk is clipped to the frustum, and nodes are culled against the far plane** (C9 U6 and C6 ring
   direction):
   - the walk runs near to far, ring = |dx| + |dz|, breadth-first in a fixed neighbour order, only over cells inside
     the camera's frustum footprint out to the camera's far plus half a cell diagonal;
   - every ordinary node's box is then rejected when it lies wholly beyond the far plane.

   A Python replay reproduces the console's cell list exactly in both PCSX2 dumps. The port walks to the grid's edge
   and clips at max(2000, 1.6 x the diagonal).
3. **The UI models' 0.56 is the UI world's ambient light**: `RUN/UI/UI.ZED` GlobalLighting ambient = 142/255 =
   0.55686. That is the same number in VU1 data memory on the title screen (desktop research 12) and in R141's
   brightness fit (UI_MODEL_LIT).
4. **The stick-0 dead zone 0.3 has a writer** (MENU_STICK): stick 1's preset, round-tripped through the three
   `STICK_*` UI vars that are bound to both sticks. The round trip reproduces **bit-exactly** both PCSX2's values
   (round-to-nearest) and the recompilation's (chop).
5. **The UI texture search order is font first** (UI_TEXTURE_BANKS): the global asset list in the PCSX2 dumps reads
   `font, //ui/junkyard, //ui/assetlib/ui, uisk, ui2d, uibf, then per-screen libraries`. The port searches the dialog
   banks first and the font last. That is invisible today: no texture name is shared between the font library and
   any UI bank.

| item | status | grade | one-line answer |
|---|---|---|---|
| ARMORY_MEMCARD_SAVE_READING (note) | RESOLVED | STRONG | modes 3/4 = upload of the CAcctDB loadout records to the Medius file service (`WeapProfile_<acct>.dat`); 5/6 = download at login; no card write |
| SPECIAL_GLYPH_179_READING (note) | RESOLVED | STRONG | the record is `font_text_01` code 179, texture 2, UL(75,50) LR(100,25); no string of the disc, no ELF string and no US soft-keyboard cell produces code 179 |
| UI_MODEL_LIT_READING (`viewer/src/armoryView.ts:45`) | PARTIAL | STRONG (value) / BELIEVED (mechanism) | the factor is UI.ZED's GlobalLighting ambient 142/255 = 0.5569, loaded into VU1's colour block; the unlit packets get the ambient only |
| COMPARE_AFTER_FORMATTING_READING (`ui/src/screens/personaCommands.ts:163`) | RESOLVED | PROVEN | "formatting" = cut at `$~`, then a `_NAME` string is replaced by its locale text (`FUN_003631f0` -> `FUN_003a3100`); otherwise unchanged |
| MENU_HISTORY_OVERFLOW_READING (`ui/src/screens/menuQueue.ts:38`) | RESOLVED | STRONG | no forward cycle of 3+ dialogs avoids dlgMenu/dlgGameLobby (both flush on start) except the two `MP_VERSION_NUMBER_ERROR` loops; 33 pushes need 11 version errors in a row |
| C5a U7 duplicated node names | RESOLVED | PROVEN | `dlgWorldOfSOCOM` `DescFieldMid` is one CONTROLS entry (IMAGE, made by the object factory) and one OBJECTS entry; the CONTROLS one is made first and binds; the port's order agrees |
| MENU_STICK_READING writer (`viewer/src/menuInput.ts:52`) | RESOLVED | PROVEN | stick 0's 0.3 / 0.65 / 0.75 are stick 1's preset 0 round-tripped through the STICK_* UI vars (bound to both sticks); the exponent stays 1.0 |
| UIVAR_REUSED_VALUE_READING (`ui/src/uiVars.ts:67`) | PARTIAL | STRONG | front end before any game: no freed slot exists (all dormant slots never used); after a level load the first freed slot holds 0, the next ones stale string pointers; 624 of 663 dialog UIVAR specs have no VALUE |
| SKB_LEGEND_ORDER_READING (`ui/src/keyboard/softKeyboard.ts:60`) | RESOLVED | PROVEN | the legend image is the **first** child of `AllSkbsRoot` (before the highlight, both backgrounds, the pieces and keys); children draw in append order: the port's "before the background" is right |
| PHYSICAL_TYPING_READING, the USB repeat's unit (`viewer/src/softKeyboardKeys.ts:25`) | RESOLVED | STRONG | units are vertical blanks: libusbkb counts in its VBlank-end interrupt handler; (20, 6) = 0.334 s to the first repeat, then every 0.100 s at 59.94 Hz |
| UI_TEXTURE_BANKS_READING (`viewer/src/frontEndAssets.ts:34`) | RESOLVED | PROVEN | load order = search order: font (StartEngine), the UI world's junkyard/ui, uisk (menu Init), then each dialog's LIBRARIES; read live from the PCSX2 dumps |
| VALVE_POOL_READING (note) | RESOLVED | STRONG | a pooled valve keeps its watcher list and value when dropped; reuse zeroes the value and notifies with mask 2; 0 of 167-238 pooled records in 10 front-end dumps hold a watcher or a value |
| UIVAR_ELEMENT_EQUAL_READING (note) | RESOLVED | PROVEN | `FUN_003352f0` read whole: same type required; int ==, real f32 ==, string strcmp, array same non-zero length and element-wise; type 0 never equal; `sameUiVarValue` matches |
| MENU_EVENT_RECORDS_READING (note) | RESOLVED | STRONG | 30 records of 0x10 (`FUN_00181ed0(..., 0x10, 0x1e)` D:L264537); the disc's maximum is 29 (C5a §59, re-checked) |
| UNHELD_BITMAP_READING (note) | RESOLVED | PROVEN | a dialog image (bit 3 "textured" set by the base constructor) with a null handle draws no quad; its attached items still draw; bit 0 is cleared but not tested by the draw |
| SKB_CLOSE_SOUND_READING (note) | RESOLVED | STRONG | silent: `ScaleDownSound` is `".SLIDE\t"`; its CRC-32 0x70aa63e1 is in no sound table, while the other five keyboard sounds' CRCs are all in `SOUNDRDR.ZAR` |
| C9 U6 far clip (`viewer/src/main.ts:2246-2247`) | RESOLVED | PROVEN | EE culls at the camera far (`cam+0xf0`) twice: cells by the frustum footprint (+ half a cell diagonal), nodes by their box against the far plane (VCLIP bit 4); VU1 does not clip far |
| C6 ENGINE_ORDER_RING_DIRECTION (`viewer/src/engineOrder.ts:54`) | RESOLVED | PROVEN | near to far; ring = Manhattan distance; breadth-first in neighbour order x-1, x+1, z-1, z+1; footprint-bounded, empty cells neither listed nor crossed, cap 1600 |

---

## 1. The grid walk: C9 U6 (far clip) and C6 ENGINE_ORDER_RING_DIRECTION

**Name.** C9 U6 (`$PORT/packages/viewer/src/main.ts:2246-2247`) and ENGINE_ORDER_RING_DIRECTION
(`$PORT/packages/viewer/src/engineOrder.ts:54`).

**What it stands for.**
- C9 U6: how far the game draws.
- ENGINE_ORDER_RING_DIRECTION: the order in which the engine issues world draws.

**Current values.**
- `fly.setClipPlanes(near, max(2000, 1.6 x diagonal))`.
- `engineOrder` walks rings `|dx| + |dz|` from the camera's cell, near to far, out to the grid's edge. Its JSDoc says
  the direction is "the reading of the ring label ..., not something reCOM shows".

**Prior search.**
- C9: "the EE's far cull of nodes is not traced"; VU1 family B clips the near plane and four sides only.
- C6: "not researched".

**What I did.**
- Read the walker that `FUN_00339de0` drives (D:L236850-236945):
  - `FUN_002d6920` (D:L177126-177171): set-up and edge normals;
  - `FUN_002d6c40` (D:L177243-177333): copies up to 5 polygon points, clamps the count to 0..5 and takes the
    footprint's cell bounding box;
  - `FUN_002d6e40` (D:L177338-177394): breadth-first expansion;
  - `FUN_002d7030` (D:L177399-177443): one cell added;
  - `FUN_002d66b0` (D:L177042-177079): the edge test;
  - `FUN_002d61b0` (D:L176816-176841): the iterator.
- Read the polygon's builder `FUN_00291050` (D:L137298-137341) and its hull `FUN_00290df0` (D:L137216-137293).
- Read the cull tests:
  - `FUN_00290890` / `FUN_002909f0` (D:L136960-137042), the mid cull;
  - `FUN_0033b110` (D:L237254-237285) and `FUN_0033b230` (D:L237290-237315), the plane mask;
  - `FUN_00290c30` (D:L137149-137179), the box test, and `FUN_00294ac0` (D:L139210-139250), VCLIP over 8 corners;
  - the box test's call inside the node draw `FUN_003389c0` (D:L236164).
- RDRAM, from the render pipe 0x4887c0: world = pipe+0x624, camera = pipe+0x628 (D:L236782, D:L236849).
  - `gridwalk_rdram.py`: camera, footprint, grid and list in five dumps.
  - `gridwalk_sim.py`: a Python replay of the walk from each dump's own camera and grid, compared with the console's
    list.
  - `clipmask_rdram.py`: the clip matrix `cam+0x330` against points straight ahead.
  - `node_flags_rdram.py`: the flag bits of all 1,262 nodes linked in the grid.

**Answer.**

*The walk* (ring direction):
1. **The footprint.** `FUN_00291050` builds 5 points:
   - the camera position;
   - the four far-plane corners, (+-far x `cam+0x1d0`, +-far x `cam+0x1d4`, -far) taken to world space, where far =
     `cam+0xf0`.

   `FUN_00290df0` reduces them to their x-z convex hull, whose point count goes to `cam+0x1bc`.
2. **Seed.** The camera's cell is listed with ring 0.
3. **Expansion, ring by ring.** For every listed cell of ring d, in list order, the neighbours (x-1), (x+1), (z-1),
   (z+1) are offered in that order. A neighbour is listed (with ring |dx| + |dz| from the camera's cell, by `abs`) when
   all of these hold:
   - it is inside the footprint's cell bounding box;
   - it has an atom list (an empty cell is **neither listed nor expanded through**);
   - it was not stamped this walk (+0xa4 against the walk's tick);
   - its centre lies within `grid+0x40` of the inner side of every hull edge. `grid+0x40` is 127.279 = 90 x sqrt(2)
     on 180-unit cells, and 113.137 on Frostfire's 160-unit cells: half a cell diagonal.

   The list is capped at 0x640 = 1,600 cells.
4. **Drawing.** The iterator hands out the cells in list order and each cell's atoms in link order. A node linked in
   several cells is handed out once, at the first cell that reaches it (the stamp, D:L176837-176839).
5. **Near to far, PROVEN two ways.** The code assigns rings in non-decreasing order. In `postload_pcsx2` and
   `spawn_pcsx2` the console's own list is 32 cells, rings 0..9 non-decreasing, ring = |dx| + |dz| for every entry. The
   replay reproduces that list **in the same order** (`gridwalk_sim.out`: identical, both PCSX2 dumps; also the two
   Frostfire dumps of the recompilation).

*The far clip* (C9 U6). The EE culls at the camera's far plane `cam+0xf0` (record far, plus the zoom extras C9 U3
found) in two places:
1. **Cells.** Only cells within half a cell diagonal of the footprint out to `far` are walked (above).
2. **Nodes.** `FUN_0033b110` sets the camera's plane mask `cam+0x564`:
   - 0x3f3f for a node with +0x5f bit 7 set: all six planes;
   - 0x3f2f otherwise: VCLIP bit 4 left out.

   The node draw `FUN_003389c0` transforms the node's 8 box corners by `cam+0x330` (`FUN_00294ac0`). The node is not
   drawn when every corner fails one plane in the mask (`FUN_00290c30` answers 2, D:L236164-236172).
   - **Bit 4 is the far plane.** In both PCSX2 dumps a point straight ahead sets VCLIP bit 4 from 851 units on, and
     not at 849 (camera far 850) (`clipmask_rdram.out`).
   - All 1,262 nodes linked in the grid in both PCSX2 dumps have +0x5f bit 7 set (`node_flags_rdram.out`). It is the
     node constructor's default (D:L215960-215966) and nothing else writes it (byte-store scan of 0x313000-0x318000).
   - So every ordinary node is far-culled by its box.
   - Two cases are drawn without the far plane (0x3f2f): +0x5c bit 3 nodes (the world's list +0x6ba0/+0x6b9c,
     D:L236953-236976, and `FUN_0033b230` D:L237302-237307), and nodes with +0x5f bit 7 clear. Both lists are empty in
     the dumps.
3. **A mid cull exists but is dormant.** From ring 3 on (the first loop runs while `grid+0x100`, the current ring, is
   below 3: D:L236856), it would skip nodes and groups whose view depth minus half their box is at or beyond the mid
   distance `cam+0xec`. It needs both:
   - `world+0x6ba4` != 0, which counts nodes with +0x5e bit 7, without +0x5c bit 3 and **without** +0x5f bit 7
     (D:L220515-220523);
   - `cam+0xf0` != `cam+0xec`.

   `world+0x6ba4` = 0 in both PCSX2 dumps, and no node lacks bit 7, so the cull does not run even on the maps whose
   record has mid < far (MP5, MP52, MP53, MP61, MP62, MP64, MP72, MP73, MP83, MP9: C9 `camera_key.out`).
4. **VU1 does not clip far** (desktop research 13, verified). A mesh straddling the far plane is drawn whole.

**Implementation suggestion.**
- `engineOrder.ts`:
  - keep the ring rule (now a read);
  - order within a ring by the breadth-first listing order (the parent cell's list order, then -x, +x, -z, +z), not
    by scene-walk order;
  - stop the walk at the footprint (hull of camera + far corners, cell centre within half a diagonal), skip empty
    cells (they are not crossed), cap at 1,600.

  Test first: for the camera of `postload_pcsx2` (position (935.58, -120.03, 834.37), fwd (0, -0.159, 0.987), far
  850, half-fov tangents 0.70021 / 0.45573, the M51 grid 36 x 25 cells of 180) the listed cells are the 32 of
  `gridwalk_rdram.out` in that order.
- `main.ts:2246`:
  - set the GPU far plane well beyond the record far (VU1 has no far clip);
  - cull whole draws on the CPU when their bounding box lies wholly beyond `far = cam record far (+ zoom extra)`;
  - draws whose cells fall outside the footprint are not drawn.

  Test: a prop whose box starts at far + 1 straight ahead is not drawn; one straddling far is drawn whole. This
  matters on the fogless MP51 (far 2000) and MP81 (far 2500).
- Rename the reading in `engineOrder.ts`'s JSDoc to a read citing D:L177338-177443 and `gridwalk_sim.out`.

**Owed evidence.** None for the rules. For the mid cull: a PCSX2 dump on MP5/MP9 (mid < far) reading `world+0x6ba4`
(world = `*(0x4887c0+0x624)`) would confirm it stays 0 on an MP map.

---

## 2. ARMORY_MEMCARD_SAVE_READING (note only, research 95 §4.4; roadmap OPT-20)

**What it stands for.** What `SaveCharacterProfile` (`CharacterProfile` modes 3 and 4) persists, given the unused
`_23_StoringChar_MSG` "not saved to the memory card".

**Current value.** Note only. The roadmap's OPT-20 plans "WeapProfile_%d.dat on the simulated card".

**Prior search.** R95: "3 and 4 write to the memory card or HDD (`FUN_0033eb70`/`FUN_0033e7f0`) ... not read
further".

**What I did.**
- Read `UICharacterProfile` `FUN_00275770` (D:L121919-122131), the registry functions `FUN_0033eb70`
  (D:L239592-239633), `FUN_0033e7f0` (D:L239461-239477), `FUN_0033ea10` (D:L239541-239589) and `FUN_0033e850`
  (D:L239480-239538), and the static set-up (D:L328186-328187, D:L328670-328697).
- The registered module:
  - its name (0x3f5dd0 "CAcctDB");
  - its vtable 0x406704, whose entries are thunks at 0x300640/50/60 that subtract 0x24 and jump to `FUN_002fcba0`,
    `FUN_002fc800` and `FUN_002fcd60` (D:L199327-199581).
- The device object `FUN_0033ee20` (D:L239685-239714; vtable 0x406760, 0x9c bytes) and its methods:
  - `FUN_00304c50` (D:L204721-204778), create;
  - `FUN_00304660` (D:L204513-204553), download;
  - `FUN_00304a60` (D:L204642-204687), close;
  - 0x304650, which stores the buffer and size;
  - their callbacks, which test the strings `MediusCreateFile` (0x3f63b0, D:L204860) and `MediusFileDownload`
    (0x3f6360, D:L204587).
- The class name string `CLobbyFileIO` (0x3f6338) and the Medius error event `MP_MEDIUS_FILE_DOES_NOT_EXIST`
  (0x3f73b0).
- The digest: `FUN_0064bb80` -> `FUN_00629a48`, whose init `FUN_00629b38` stores 0x67452301 / 0xefcdab89 /
  0x98badcfe / 0x10325476 (disassembly), so it is MD5.
- Every script call: `profile_calls.ts` and `profile_save_anims.out`.
- Horizon's source as a second line: `RT.Models/Lobby/MediusFileCreateRequest.cs`, `MediusFileUploadRequest.cs`; the
  handlers in `Server.Medius/Medius/MLS.cs:3460-3664`.

**Answer.**
- **The scripts.**
  - `dlg_equipment_mp.rdr` `StoringLoadout` (online only: `ComeFromLan==0 and EQlimit==0`) runs mode 1 (store the
    record in the account DB), then `SaveCharacterProfile` = modes **3 then 4**, with a parallel `wait 3;
    stopAnimation` (a 3 s cap).
  - `dlgNetConnect.rdr`, once logged in (`socom_online_state==11`), calls `DownloadCharacterProfile` = modes **5 then
    6** (3 s cap), before `SWITCHMENU(dlgUsagePolicy.rdr)`.
- **Mode 3** (`FUN_0033eb70`, always answers 1) builds a file in memory:
  - an 8-byte header {u32 0, u32 module count};
  - one 0x28-byte table entry per module {char name[32] = "CAcctDB", u32 offset, u32 size};
  - then each module's data. CAcctDB's data (`FUN_002fcd60`, D:L199492-199581) is one count byte, then every used
    0x24-byte per-mission record of the logged-in account. The account is matched on `LOBBY_HOST`, `LOBBY_PORT`,
    `PLAYERNAMEVAR` (strings 0x3f5da0/b0/c0). Each record is {side-1 block 0xe bytes, side-0 block 0xe bytes, mission
    name 8 bytes}; the block layout is `FUN_002fb610`'s.

  Mode 3 then:
  - hashes the whole file with MD5 and stores the 16-byte digest in the account record +0x104 (`FUN_002fcba0`);
  - creates the file `WeapProfile_<DAT_0066a4f0>.dat` with the device's create;
  - leaves the buffer for the upload callback. `DAT_0066a4f0` is the account ID from the login reply (D:L191037).

  The create's request block carries 5,000,000, the account ID and 1 at +0x84 / +0x88 / +0x94. Their mapping onto
  Horizon's `MediusFile` fields is not settled: Horizon puts a 16-byte checksum at +0x80.
- **Mode 4** (`FUN_0033e7f0`) answers "done" when no Medius request is pending (`DAT_00450070` empty), then frees the
  buffer. The script re-calls it each tick until then, or until the 3 s cap.
- **Modes 5 / 6** download the file (`FUN_0033ea10` compares the account record's digest with the device's file
  digest, `memcmp` 0x10) and hand each table entry to its module (`FUN_0033e850`). CAcctDB's loader `FUN_002fc800`
  re-stores every record through `FUN_002fb610`.
- **No memory-card write happens in modes 3/4.** CAcctDB is *also* registered with the save registry `*0x43647c`
  beside `CUIVarManager` and `CValveSaveManager` (D:L328193, D:L328200, D:L328678). So the account DB itself (keys,
  records, digest) presumably travels in the config save. That part is BELIEVED (the registry's save was not traced
  here).

**Grade.** STRONG:
- the code path is read end to end;
- the medium is read from the strings the callbacks compare and the class name;
- Horizon implements the same message family.

**Implementation suggestion.**
- Retarget OPT-20 to the online lane (a server-side file per account): the room/server stores the loadout records
  keyed by account (and host/port), and the page fetches them after login.
- Or keep localStorage by ruling (W5.R4), now documented as a stand-in for a *server* file, not a card file.
- Test first: a store writes {count, 0x24-byte records}; a fresh login restores them before the usage policy screen.

**Owed evidence.** A PCSX2 run against our Horizon with the ARMORY store, logging the MediusFileCreate/Upload
messages: the file name, its size, and the header field mapping.

---

## 3. SPECIAL_GLYPH_179_READING (note only, research 95 §5.4)

**What it stands for.** Code 179's odd "inverted rectangle" in `font_special_01`.

**Prior search.** "the atlas's star has no code; 179 inverted" (R95). The capture half is uncertain (S2.22).

**What I did.**
- `glyph179_record.py`: `fonts.rdr` holds code 179 only in `font_text_01`: texture 2, colour (150,150,150),
  baseline 0, UL (75,50), LR (100,25), scale 0.9. `font_titlebar_01` lacks it.
- `glyph179_rdr.py`: every string node of the 179 `.rdr` members under RUN/ (259,325 strings), decoded by the
  engine's UTF-8 rule. **0 strings draw code 179.** The 0xA0-0xBF codes that do occur are listed.
- The ELF's strings hold no 0xB3 byte (strings.txt).
- The two code immediates 0xb3 are item ids, not characters: GL FRAG at D:L89226 and a switch at D:L450029.
- The US soft-keyboard grid cells hold no 0xB3 (V4 `v_skb_grid_bytes.out`).
- USB typing produces ASCII only (research 119 §10).

**Answer.** On the disc and from a US console, code 179 is never drawn. **STRONG** (an exhaustive scan of the disc's
text, plus the code's immediates). It can only arrive from another client's chat or name bytes.

**Implementation suggestion.** Keep the record as transcribed and drop the reading. A note: "unreachable from the US
disc; a remote string may draw it, as the quad UL->LR (inverted rows)".

**Owed evidence.** Only for a remote-string case: the 2D quad build for LR.y < UL.y (`FUN_00362900` /
`FUN_00361bd0`), if ever needed.

---

## 4. UI_MODEL_LIT_READING -- `$PORT/packages/viewer/src/armoryView.ts:45` -- PARTIAL

**Current value.** `'flags (none lit)'`: the UI models are drawn with their vertex colours as stored.

**Prior search.**
- C4: "the page draws the UI models brighter than the console; the path is not read".
- R141: the roller fits 0.56 of the page's contribution (correlation 0.98).

**What I did.**
- Read the world loader `FUN_00318da0` (D:L217064-217213): it reads `GlobalLighting` (key 0x3f6cb0) as 0x70 bytes
  into `world+0x600` (D:L217166).
- Read the defaults (D:L221331-221365): three directions at +0x600/+0x610/+0x620; light colours at
  +0x630/+0x640/+0x650; ambient at +0x660, default 0.2.
- Read the per-frame consumer `FUN_001c02e8` / `FUN_001c03a8` (D:L220544-220554), which loads them into the camera's
  light blocks.
- `ui_globallighting.py` on `RUN/UI/UI.ZED`:
  - light 1 direction (0.47, -0.75, 0.47), colour 0.8;
  - lights 2-3 zero;
  - **ambient 0.55686 = 142/255**.
- Desktop research 12 §(c) recorded the title screen's VU1 data qwords 16-23 as (-0.469, 0.7484, -0.469) and
  0.8 / 0 / 0 / **0.5569**. That is the same light, normalised and negated, and the same colours. Its §f.4 shows the
  family-A UI list `68 08 10 54 18 28 42`, whose command 0x18 is the only consumer of that colour block.

**Answer.** The 0.56 is UI.ZED's ambient term, 142/255 = 0.5569. **STRONG** for the value:
- the disc data;
- the VU1 data block captured on the title screen;
- R141's fit, 0.56.

**BELIEVED** for the mechanism (unlit packets, no normals, so ambient only). Command 0x18's loop body is undocumented
(research 12's own gap).

**Implementation suggestion.** In `armoryView.ts` and `ui/src/compositor/models.ts`, multiply the UI models' vertex
RGB by the dialog world's ambient, read from `UI.ZED` GlobalLighting q6 (0.55686), not a constant. Test: the roller
region against `burst_030` fits ~1.0 instead of 0.56. Add the directional term only if a packet with normals is found.

**Owed evidence.** Either:
- a read of VU1 command 0x18 (`0x1440`) in `logs/vu1entry0/full_dis.txt` for how normals and the four colours
  combine; or
- a GS dump of the ARMORY preview (RGBAQ per vertex against the stored colours).

---

## 5. COMPARE_AFTER_FORMATTING_READING -- `$PORT/packages/ui/src/screens/personaCommands.ts:163`

**Current value.** "the host's caption parse; without one, as given".

**Prior search.** C5a §24: one CompareValues sets +0x15 (`dlgGameLobby` `OnlyModeText`: `mission_title` vs
`GAMENAMEVAR`). The parse was owed to ONL.

**What I did.** Read the following:
- `FUN_00274db0` (D:L121617-121672) builds two local text objects with `FUN_00363e70` (D:L261444-261484), whose vtable
  is 0x406df0. It compares `obj+0x1c + obj+0x6c`, the parsed buffer at offset 0.
- `FUN_00363830` (D:L261172-261246): the `$~` cut. Everything from `$~` on is dropped, and a lone trailing `$` is
  kept. It then calls vtable +0x70.
- vtable +0x70 = `FUN_003631f0` (`elf_reads.out`, entry 28), at D:L260984-261045.
- `FUN_003a3700` / `FUN_003a3100` (D:L296937-297162) and `FUN_003a36c0` (D:L297133-297145).

**Answer.** Each side is formatted in two steps:
1. Cut at the first `$~`.
2. If the result begins with `_` and names an entry of a loaded locale table (`FUN_003a3100` searches the tables of
   the locale manager 0x49e9d0 by name), it is replaced by that entry's text (`FUN_003a36c0`, falling back to
   "_UNLOCALIZED_" only for an id that is then missing). Otherwise it is left as is.

The comparison is then `strcmp` (or caseless with +0x14). **PROVEN.**

**Implementation suggestion.** Replace the host-supplied `format` with the port's own: `cut('$~')`, then the locale
lookup by `_NAME` that captions already use (PLAT-13). Tests:
- `_638_OnlineFilters_MSG$~x` formats to that message's text;
- `abc$~def` -> `abc`;
- `Plain` -> `Plain`.

---

## 6. MENU_HISTORY_OVERFLOW_READING -- `$PORT/packages/ui/src/screens/menuQueue.ts:38`

**Current value.** 32: past 32 pushes, the newest 32 are kept.

**Prior search.** C5a §49 owed a flow-graph search for cycles of 33 forward switches without `PREVIOUS_SCREEN` or
`FlushMenuHistory`.

**What I did.**
- Re-read when a push happens: every type-2 SWITCH record pushes the current dialog (`FUN_003654c0` D:L262325-262339
  -> `FUN_0027f3f0`). A switch to the history's top, or `PREVIOUS_SCREEN`, pops (`FUN_0027e720`).
- Ran the port's own dialog tools from a scratch copy (`porttools/`, junctions to the snapshot's packages):
  - `history_overflow.ts`: 92 dialogs with a SWITCHMENU edge, 591 edges.
  - **Only two dialogs reach FLUSHMENUHISTORY**: `dlgMenu` (ONSTART `SetMenuValve`) and `dlgGameLobby` (ONSTART and
    exits).
  - 23 dialogs reach `SWITCHMENU(PREVIOUS_SCREEN)`.
  - Raw simple-cycle enumeration explodes: 174k cycles, all through campaign "back" bindings (`UiBackWhere`,
    `BackToWherever`, `GoBack` on TRIANGLE).
- Those back bindings switch to the screen the player came from, which equals the history's top, so they pop. With
  every edge whose bindings are all TRIANGLE/back-named excluded, `history_cycles_fwd.ts` finds exactly **two**
  forward cycles of length 3-8 that avoid both flushing dialogs:
  `dlg{LAN,MP}BriefingRoom -[MP_VERSION_NUMBER_ERROR]-> dlgNetAbort -[ONSTART]-> dlgWorldOfSOCOM -[MP_JOIN_ROOM]-> back`.

**Answer.** The history grows by 3 per version-error loop. 33 pushes need about 11 consecutive version-number errors
without passing the main menu or a game lobby. Any return to `dlgMenu` or a launch through `dlgGameLobby` flushes. On
our own server the error never fires. **STRONG.** The interpretive step is that the back-named bindings target the
history's top, as their names and the campaign flow say.

**Implementation suggestion.** No behaviour change: keep the reading's bound, re-labelled "unreachable on the disc but
for repeated MP_VERSION_NUMBER_ERROR". Add a disc test over the port's graph that the forward cycles avoiding the two
flushers are exactly those two.

---

## 7. C5a U7 -- duplicated node names (`dlgWorldOfSOCOM` `DescFieldMid`)

**Prior search.** C5a: "confirm both are OBJECTS entries".

**What I did.**
- `dupnodes.py` and `dupnodes_parent.py` over C5b's typed dumps. Results:

  | dialog | name | where the copies are |
  |---|---|---|
  | `dlgWorldOfSOCOM` | `DescFieldMid` | CONTROLS #10 and OBJECTS #28, both IMAGE, no PARENT |
  | `dlgLANBriefingRoom` | `MainWindow` | CONTROLS #0 and OBJECTS #6 |
  | `dlgMPBriefingRoom` | `bar_title` | CONTROLS #6 (TEXT) and #65 (WRAPPEDTEXT) |
  | `dlgCreateClan`, `dlgRespondToInvites` | `DescriptionText` | both OBJECTS |
  | `dlgDebriefing` | `aimult` | both OBJECTS |
- The design reader fills CONTROLS (+0x4c, factory `FUN_00382890`) then OBJECTS (+0x58, factory `FUN_00382070`)
  (D:L277381-277382; key strings 0x3fa090 "CONTROLS", 0x3fa0a0 "OBJECTS").
- The control factory hands any TYPE not among its eight to the object factory (D:L277975). So a CONTROLS-list IMAGE
  is a node.
- `CGameMenu_LoadFromDesign` makes every control (with its subordinates) before any object (D:L263627-263658). Each
  node goes under its PARENT, or under the dialog root (C4 ABSENT_PARENT).
- `FUN_00315d00` searches direct children in creation order first.

**Answer.**
- Not both OBJECTS. In every listed case the binding goes to the first-made copy: the CONTROLS one where there is one.
- The port's `dialogNodeNames` (controls with their subordinates, then objects) gives the same order, and its
  `control()` also falls back to the object factory. Same binding. **PROVEN.**
- Side effect: the CONTROLS copy is also appended to the menu's control vector (+0x290, D:L263633).

**Implementation suggestion.** Retire U7. A disc test: `dlgWorldOfSOCOM`'s `DescFieldMid` resolves to the CONTROLS
copy (XPOS/YPOS of CONTROLS #10).

**Lead.** Check whether the focus ring (`FUN_003670d0`, over +0x290) can land on such an IMAGE (its +0x48 "enabled"
for an object). The port's ring should skip it as the original does.

---

## 8. MENU_STICK_READING -- the writer of stick 0's 0.3 (`$PORT/packages/viewer/src/menuInput.ts:52`)

**Prior search.** C5b: the pipeline was transcribed; "where stick 0's 0.3 / 0.65 / 0.75 are written" was owed.

**What I did.**
- Read the presets `FUN_002da6c0` (D:L179394-179419). Preset 0 sets +0x288 0.3, +0x290 0.65, +0x294 **3.0**,
  +0x2a4 0.75 for the stick index given.
- The options' apply `FUN_0027b790` / `FUN_0027b960` (D:L125065-125108, D:L125202-125230) calls it for **stick 1**
  only (`addiu $a1, $zero, 1` at 0x27b7dc). It then writes three UI vars:
  - `STICK_SENSITIVITY = FUN_002da800(pad,1)`;
  - `STICK_INERTIA = 1 - pad[+0x2cc]`;
  - `STICK_DEADZONE = FUN_002da7a0(pad,1) - 0.02`.
- `InitSystemTuners` binds each STICK_* var to **two** tuners, stick index 0 and 1 (research 104 §4; the port's
  `SYSTEM_TUNERS`). Their watchers (vtable block 0x408020) are:
  - deadzone `FUN_00389e70` -> `FUN_002da7d0`: +0x288 = (v + 0.02) / 2.0 (D:L281942-281957);
  - sensitivity `FUN_00389f90` -> `FUN_002da8a0`: +0x290 (D:L281966-281973, D:L179462-179474);
  - inertia 0x389f10: +0x2a4 = 1 - v (disassembly).

  So the var writes reach stick 0 too. Constants (ELF): 0x3df208 0.5, 0x3df210 1.0, 0x3df218 2.0.
- `stick0_roundtrip.py` computes the round trip in f32.

**Answer.** Stick 0's +0x288 / +0x290 / +0x2a4 are stick 1's preset 0 carried through the three UI vars. The exponent
+0x294 is not carried, so it stays the constructor's 1.0. That is exactly the dumps' stick 0 (C5b `padrec.out`).
- With round-to-nearest the round trip gives 0x3e99999a / 0x3f266666 / 0x3f400000, **PCSX2's three dumps**.
- With chop it gives 0x3e999999 / 0x3f266665 / 0x3f400000, **the recompilation's `title_ours`**.

**PROVEN** (a bit-exact match of both).

**Implementation suggestion.** `MENU_STICK` becomes a read: dead zone 0.3, rescale on, radial on, curve off,
exponent 1 (C5b's pipeline). The 0.3 comes from the `stick_preset` (default 0) round trip; the port may store the
three constants with this citation. Under the EE's chop the console's values are 1 ulp below PCSX2's (0.29999998,
0.64999998), which is immaterial.

---

## 9. UIVAR_REUSED_VALUE_READING -- `$PORT/packages/ui/src/uiVars.ts:67` -- PARTIAL

**Current value.** `{ type: 'int', value: 0 }`.

**Prior search.** C5b: the stale word is the previous var's; the scan for VALUE-less specs was owed.

**What I did.**
- `FUN_00386b00` (D:L280169-280185) frees a temporary: type 1, name 0, longevity 0. It frees only an owned array
  (`FUN_0032f350`, D:L230350-230357), so the word stays.
- `FUN_003859d0` (D:L279469-279486) hands out the first dormant slot by index, never-used or freed alike.
- `uivars_rdram.py` over every dump:
  - every front-end dump (title, menu, rank; PCSX2 and the recompilation) has **no freed slot**: 194-236 dormant
    slots, all never used (type 0);
  - after a level load (`postload`/`spawn`, PCSX2) there are 45 freed slots, 43 with a non-zero word. The first
    dormant slots are #18 (word 0), #19 (0x437efc), then string pointers into 0x703fd4...
- `uivar_specs.py`: 624 of the 663 dialog UIVAR specs carry no VALUE (598 at the default TEMPORARY), over 138 names.

**Answer.**
- Before the first level load nothing is reused, so the reading never applies.
- After one, the first VALUE-less var lands on slot 18 and reads 0, as the port says. The next ones read stale
  pointers (e.g. 4,422,396), which cannot be reproduced and differ between PCSX2 and the recompilation.

**STRONG** for the mechanism and the dumps. The visible effect is unknowable without a frame: a text bound to such a
var before code sets it.

**Implementation suggestion.** Keep `int 0`, with the citation above; document "first reuse after a level load reads
0 in PCSX2; later reuses read a stale pointer".

**Owed evidence.** A PCSX2 frame of the lobby after a round, at the first frame of a screen whose TEXT binds a
VALUE-less var (e.g. `GAMENAMEVAR`), to see whether any stale integer is ever drawn.

---

## 10. SKB_LEGEND_ORDER_READING -- `$PORT/packages/ui/src/keyboard/softKeyboard.ts:60`

**Current value.** `'before the background'`.

**Prior search.** C5b looked at the layout's +0x480/+0x530 images: the wrong pair.

**What I did.**
- Read the soft keyboard's scene build `FUN_003958d0` (D:L288944-289010). It makes the node `AllSkbsRoot` (0x3fb3c8)
  and adds its children with `FUN_0036ab20` (D:L265212-265230: parent vtable +0x28 is the find, +0x18 the add):
  1. **0x4a0cc0, the legend**: texture `DAT_004a1220` = UiParams `Legend/Texture` (D:L289793-289799), size
     `DAT_004a1138/113c` = `Legend` Pos/Size (D:L289801-289806);
  2. 0x4a0c00 (`SkbHighlight.tif`);
  3. 0x4a0f00 and 0x4a0fc0, the two backgrounds: they take `BackgroundsOpacity` x 128 (D:L289823-289826);
  4. the 4 x 10 pieces at 0x49ed70;
  5. the layouts (the callback);
  6. 0x4a1150.
- The add `FUN_00315f40` (D:L215329-215365) appends at the tail of the children vector.
- The 2D draw walks a node's children depth first in vector order (R112.1, `FUN_00336a60` D:L235063-235110).

**Answer.** The legend draws first, so the highlight, backgrounds, pieces and keys all cover it. The port is right.
**PROVEN.**

**Implementation suggestion.** Rename to a read: `SKB_LEGEND_ORDER = 'first child of AllSkbsRoot'`, citing
D:L288966-288975.

---

## 11. PHYSICAL_TYPING_READING -- the unit of `sceUsbKbSetRepeat(0, 20, 6)`

**Location.** `$PORT/packages/viewer/src/softKeyboardKeys.ts:25`; `ui/src/keyboard/usb.ts:5`.

**Prior search.** C5b: "the unit is not in the corpus; likely 1/60 s (a lead)".

**What I did.**
- `RUN/IRX/USB/USBKB.IRX` is "USB Keyboard Driver 1.03" (usbkeybd). Its strings show HID SET_IDLE / interrupt
  transfers only; there are no repeat timers on the IOP.
- The EE library:
  - `sceUsbKbSetRepeat` `FUN_001beda0` (D:L39841-39857) stores delay at record+0x18, rate at +0x1c, counter +0x14 = 0
    (record stride 0x38);
  - `sceUsbKbInit` registers `AddIntcHandler(3, 0x1bf600)` (D:L39616), the handler the names csv calls
    `vblank_e_handler`. INTC cause 3 is VBLANK end.
  - That handler (disassembled, `elf_reads.out`) increments each connected keyboard's counter +0x14 once per
    interrupt while delay > 0, rate > 0 and the key state is 1 or 2.
  - `sceUsbKbRead`'s state machine (D:L39998-40019) emits the held key when the counter reaches the delay (state
    1 -> 2), then every time it reaches the rate.

**Answer.** Vertical blanks: the first repeat 20 VBlanks = 0.3337 s after the press, then every 6 VBlanks = 0.1001 s
(59.94 Hz). **STRONG**:
- the code is read;
- that INTC 3 is VBlank-end rests on the library's own symbol name and the standard INTC numbering.

**Implementation suggestion.** If the owner keeps physical typing, replace the browser's repeat for typed keys with
the game's: the first repeat at 20/59.94 s, then every 6/59.94 s, driven by the page's own clock. Test: a held key
types at t = 0, 0.334, 0.434, 0.534 s.

---

## 12. UI_TEXTURE_BANKS_READING -- `$PORT/packages/viewer/src/frontEndAssets.ts:34`

**Current value.** "the LIBRARIES stem's loose bank, then a map's FONT_TXR".

**Prior search.** C5b: the rule was resolved as "first library in load order"; the boot's load order was owed.

**What I did.**
- The callers of `FUN_00320d70` (find or load, then append; D:L221689-221726) and `FUN_00320ea0` (append at the tail,
  D:L221731-221747):
  - `StartEngine` loads `common/assetlib/font` (D:L47906);
  - the menu state's Init loads `ui/assetlib/uisk`, then the font again (a reference only) (D:L54819-54821);
  - each dialog's LIBRARIES load at its build (D:L263470-263487), and the font again when the design asks
    (D:L263500).
- `assetlist_rdram.py` walks the list 0x45c3c0 in the dumps. In `title_pcsx2` and every menu dump:
  `common/assetlib/font (ref 3), //ui/junkyard, //ui/assetlib/ui, ui/assetlib/uisk, ui/assetlib/ui2d,
  ui/assetlib/uibf` (+ `Eq/Eq51`, `bf/bf51` on the briefing screens).
- `texname_collisions.py` over the 58 front-end texture libraries: 76 names are held twice; **none involves the font
  library**. Among the boot-order six only `splashlogo.tif` is shared (UI2D before UIBF).

**Answer.** The search order is the font, the UI world's two libraries, uisk, then dialog libraries in first-load
order. **PROVEN** (code and live list). The port's "dialog bank, then font" differs only in an order that no name
exercises.

**Implementation suggestion.** Order `pageUiTextures`' banks by declaration and put the font bank first, then
junk/ui, uisk, then the dialogs' LIBRARIES in load order (also fixes the `Promise.all` completion-order
nondeterminism). Test: `splashlogo.tif` resolves from UI2D when both UI2D and UIBF are loaded.

---

## 13. VALVE_POOL_READING (note only, research 104 §3/§9)

**What I did.**
- `FUN_00352610` (D:L251281-251307) drops a pooled valve: its name is freed and it is pushed back to the pool vector
  0x49e820. Its value +4 and watcher list +0xc stay.
- `FUN_00352230` (D:L251127-251176) reuses the last pooled record. It zeroes the value and, if that was non-zero,
  calls `FUN_003519f0(valve, 2)` (disassembly 0x352370-0x35238c: mask 2), which runs the old watchers.
- `valvepool_rdram.py`: the pool holds 167-238 records in the front-end dumps and 0 in game. **None has a watcher or
  a non-zero value.**

**Answer.** The mechanism is as the note says. In the captured states no pooled record carries a watcher, so the
stale-watcher case does not arise there. **STRONG.** No model needed.

**Implementation suggestion.** None; retire as "read, not reached in any dump".

---

## 14. UIVAR_ELEMENT_EQUAL_READING (note only, research 104 §9)

**What I did.** Read `FUN_003352f0` whole (D:L234123-234246).

**Answer.** Equal only when both types match. Then:
- integer: `==`;
- real: f32 `==`;
- string: `strcmp`;
- array: same **non-zero** length and every element equal by the same rule (nested arrays recurse);
- a type-0 node, or anything else: never equal.

The cross-type branches inside are dead (the types are equal by then). The port's `sameUiVarValue`
(`ui/src/uiVars.ts:84-95`) is this rule exactly. **PROVEN.**

**Implementation suggestion.** Retire the reading; cite D:L234123-234246 in `sameUiVarValue`'s JSDoc.

---

## 15. MENU_EVENT_RECORDS_READING (note only, research 115 §13)

C5b listed it "not attempted". C5a §59 had already resolved it. Re-checked:
- the constructor makes **30** records of 0x10 (`FUN_00181ed0(G+0x6f8, ..., 0x10, 0x1e)` D:L264537);
- the build copies with no bound (D:L263582-263610);
- the unload frees the first 10's strings (D:L264391-264404);
- the disc's maximum is 29 (`dlgGameLobby`, C5a `out/bindcount.txt`).

**STRONG.** Retire, as C5a says.

---

## 16. UNHELD_BITMAP_READING (note only, research 125 §7)

**Prior search.** C5b: a null handle clears +0x14 bit 0; "the draw's use of bit 0 not read".

**What I did.**
- The base adaptor constructor `FUN_00365100` (D:L262186-262204) sets bits 6 (visible), 0, 3 and 7 of +0x14.
- `FUN_00364bf0` (D:L261991+), which clears bit 3, is called only from HUD code (D:L62566, D:L62582).
- The image draws `FUN_00364950` / `FUN_00364a30` (D:L261897-261968):
  - return if bit 6 is clear (`FUN_00364e10`);
  - if bit 3 is set and the handle `+0x70` is null (or its +0xc is 0): clear bit 0 and **skip the quad**
    (`FUN_003643b0`);
  - then draw the attached items (`FUN_00364e70`).
- Bit 0 is never tested by these draws.

**Answer.** An unheld dialog bitmap draws nothing of its own. Its attached children still draw. **PROVEN.** This also
settles the `SkbRecipState0.tif` case: no texel in state 0.

**Implementation suggestion.** A name no bank holds yields no quad but keeps its children. Test: an IMAGE with an
unknown name and a TEXT child draws the text only.

---

## 17. SKB_CLOSE_SOUND_READING (note only, research 119 §13)

**What I did.**
- `skb_close_sound.py`: UiParams' `ScaleDownSound` is the 7 bytes `2e 53 4c 49 44 45 09` (".SLIDE" + TAB).
- The sound lookup `FUN_00344f30` hashes the string with `FUN_003a2370` (D:L296364-296389), a CRC-32 over every
  `strlen` byte, so the tab counts.
- Slot 1 plays only if the lookup found it (`FUN_00395de0` D:L289063-289066; resolved in `FUN_00397bc0`
  D:L290082).
- `skb_close_hash_scan.py`:
  - the CRC-32 of each of the other five keyboard sounds occurs as a word in `SOUNDRDR.ZAR`;
  - 0x70aa63e1 (".SLIDE\t") occurs in no sound file (one coincidental hit in `CREDITS.PSS`).

**Answer.** The keyboard closes silently, and opens with `.SLIDE`. **STRONG.** This confirms R122.10.

**Implementation suggestion.** Keep slot 1 silent; cite the scan. Test: closing the keyboard plays no cue.

---

## 18. Sourced but not implemented (multiplayer-relevant)

1. **The loadout's server file** (section 2). The original persists each account's per-mission loadouts on the
   *Medius file service* (`WeapProfile_<accountId>.dat`: header, "CAcctDB" table entry, count byte, 0x24-byte records;
   MD5 kept in the account DB). It downloads them right after login (`DownloadCharacterProfile`, 3 s cap) and uploads
   on every online ARMORY store. Horizon has the handlers (`MLS.cs` FileCreate/Upload/Download/Close). Our server and
   page do neither.
2. **The world's far and footprint culling** (section 1). On MP51 (far 2000, fog off) and MP81 (far 2500), whatever
   lies wholly beyond `far` is not drawn on the console; the port draws more. This is visible on the two fogless maps.
3. **USB keyboard repeat** (section 11): 20/6 VBlanks for chat and names typed on a physical keyboard.
4. **The menu stick pipeline's numbers** (section 8): the lobby, rooms and briefing room use dead zone 0.3 with
   rescale and the sqrt(2) radial step.
5. **The version-error loop** grows the menu history (section 6). It matters only if a server ever answers
   MP_VERSION_NUMBER_ERROR repeatedly.

## 19. Leads for other workstreams

- **Online lane / ONL (and roadmap OPT-20).**
  - Section 2 moves the WeapProfile file from the card plan to the server.
  - The create request's fields (+0x84 = 5,000,000, +0x88 = account id, +0x94 = 1) need mapping onto Horizon's
    `MediusFile`/`MediusFileAttributes` before a byte-exact server.
- **C6 / EE_FPU_ROUNDING.** Stick 0's values show that **PCSX2's dumps round to nearest** in the FPU path where the
  recompilation chops (`stick0_roundtrip.out`). PCSX2 captures are therefore not bit-exact references for
  FPU-chained values; the console chops.
- **C9 / world.**
  - The grid replay (`gridwalk_sim.py`) is a ready oracle for a port test.
  - The mid cull is dormant; `world+0x6ba4` is the switch.
  - Grid +0x40 is half the cell diagonal in the PCSX2 dumps but 0.354 in the recompilation's `spawn_ours`: a
    recomp-side lead (`gridwalk_rdram.out`).
- **C5a / focus.** CONTROLS-list IMAGEs (`DescFieldMid`, `MainWindow`) are appended to the menu's control vector
  +0x290 (section 7). Check the focus ring's treatment.
- **C4 / ARMORY.** UI model brightness: section 4's ambient 0.5569 applies to the ARMORY preview too (same UI world).
- **Desktop.** VU1 command 0x18's loop body (research 12's open gap) is the last step for UI_MODEL_LIT's mechanism.

## 20. Verification (V7, 2026-10-04)

The verifier's file: `research-wave-2026-10-04/V7-verify-round2-remaining.md` (its scripts and outputs under `research-wave-2026-10-04/scratch/V7/`). V7 verified ten round-2 claims nobody had checked, in R2-C3 ([202](202-r2-c3-combat.md)), R2-UI, R2-AV ([205](205-r2-av-audio-card-world.md)) and R2-MN ([203](203-r2-mn-match-modes-net.md)). What follows is the verifier's own text for this report's claims, verbatim; its claims about the other reports are in their notes ([178](178-the-research-wave-of-2026-10-04.md) has the table).

Verifier V7, 2026-10-04. Read-only. Every script is under `scratch/V7/`, and its `README.md` says what each one prints.
`D:L<n>` is a line of `socom2_game.elf.decomp.c` (r0001). `$PORT` is the `agent/online` snapshot.

**Method.** Each claim is re-derived by a route the author did not use, where one existed:
- V7's own ELF reader (`elf.py`, pyelftools) and disassembler, instead of the authors' `elfutil.py`;
- the console's own state in the PCSX2 RDRAM dumps, read directly. No replay or simulation stands in for it;
- V7's own Python `.rdr` reader;
- the raw zAnim bytes, decoded by hand against the handler's field reads.

Where the only route was the author's own (a decomp read), V7 re-read the code and says so.

### 20.1 Verdicts

| # | claim | verdict | one-line reason |
|---|---|---|---|
| 5 | SaveCharacterProfile 3/4 upload `WeapProfile_<acct>.dat` with an MD5; 5/6 download it after login; no card write | **CONFIRMED-WITH-CORRECTION** | The medium, file name, MD5 and the absence of a card write are right. The flow is wrong in its order: **list, then create only if missing, then upload**. The MD5 is never sent; it is kept and compared with the server's checksum, and the file downloads only when they differ. The 5,000,000 / account / 1 block is the ListFiles request, not the create. **Stock Horizon cannot serve this flow**: it has no FileListFiles handler, never fills ServerChecksum, and refuses a create of an existing file. |
| 6 | `FUN_00339de0` grid walk (rings \|dx\|+\|dz\| near-to-far, frustum footprint, <= 1,600 cells) + per-cell and per-object far culling, vs the port's max(2000, 1.6 x diagonal) | **CONFIRMED-WITH-CORRECTION** (minor) | The console's own lists in 4 dumps satisfy the ring rule, breadth-first order and child order -x,+x,-z,+z. Points straight ahead set VCLIP bit 4 from far+1 (V7's own clip of `cam+0x330`). The port line is as quoted. Correction: the 1,600 cap is tested only between rings, so the last ring can overshoot it. |
| 7 | UI ambient 142/255 = 0.5569 from `UI.ZED` is the ARMORY's 0.56; UI textures searched font library first | **CONFIRMED** | The live world's GlobalLighting reads ambient 0.55686 in 7 front-end dumps. The live library list starts with the font. Lookup walks head to tail and loading appends. The ambient-only mechanism stays BELIEVED, as R2-UI graded it. |

Tally: 10 claims. CONFIRMED 6, CONFIRMED-WITH-CORRECTION 4, WRONG 0, UNVERIFIABLE 0.

### 20.2 Claim 5: SaveCharacterProfile upload / download (R2-UI §2)

**What V7 read** (decomp, ELF, Horizon source):
- **Mode 3** (`FUN_0033eb70`, D:L239592-239633) builds the module file and MD5s it. The MD5 init `FUN_00629b38` stores
  0x67452301 / 0xefcdab89 / 0x98badcfe / 0x10325476 (`dis_629b38.out`). It hands the digest to each module (CAcctDB
  keeps it). It then calls the device's vt+8 with (`WeapProfile_%d.dat` formatted with `DAT_0066a4f0` at D:L121955,
  flags 10) and vt+0x34 (buffer, size).
- The device vtable 0x406760 (`vt_fileio.out`): +8 = `FUN_00304c50`, +0x30 = `FUN_00304660`, +0x34 = `FUN_00304650`.
- **`FUN_00304c50` is not a create.** It fills a request {name[0x80], +0x80 = 0, +0x84 = 5,000,000, +0x88 = account,
  +0x94 = 1} and sends it with callback 0x305230. That callback (D:L204948-205100) tests the status against the string
  **`MediusFileListFiles`** (0x3f63d0).
  - **Not found**: it raises `MP_MEDIUS_FILE_DOES_NOT_EXIST` (0x3f63f0). If flags & 8, it sends a create
    (`FUN_0064b3f8`, callback 0x304f40, which tests `MediusCreateFile`) of a MediusFile with FileSize 2000 (+0x94),
    OwnerID = account (+0x9c) and owner permission 6 (+0xa4). These offsets match Horizon's `MediusFile`
    serialisation exactly: checksum at +0x80, FileID +0x90, FileSize +0x94, OwnerID +0x9c, OwnerPermissionRWX +0xa4.
    The create callback uploads if flags & 2.
  - **Found**: it keeps the 0xac-byte file info and, if flags & 2, uploads at once (`FUN_0064b490`, callback 0x304de0,
    which tests `MediusUploadFile`).
  - Mode 3's flags are 10 = 8 | 2: list, then create if missing, then upload.
- **Mode 5** (`FUN_0033ea10`):
  - if the device has no file info yet, it sends the same list (flags 1: no create, no upload) and returns 0, so the
    script retries;
  - otherwise it `memcmp`s (0 = equal) the account record's digest with the server file's checksum, read at file info
    +0x80 by `FUN_003051e0`;
  - **equal**: it raises `MP_MEDIUS_FILE_DOES_NOT_EXIST` (0x3f73b0) and downloads nothing;
  - **different**: it downloads (vt+0x30).
  - Mode 6 applies whatever was downloaded.

**Corrections to R2-UI.**
- The order is list, then create only if missing, then upload. R2-UI described it as "creates the file ... with the
  device's create".
- The block with 5,000,000 / account / 1 is the **ListFiles** request (plausibly a size bound, owner id and page size
  1; the SDK struct is not in our corpus). The create carries 2000 / account / 6, laid out like Horizon's `MediusFile`.
- The MD5 is **not uploaded**. It is stored locally and compared at login with the server's `ServerChecksum`, so the
  server is expected to MD5 the stored file. Download happens only when the two differ.
- What R2-UI got right: the medium is the Medius file service, the name is `WeapProfile_<acct>.dat`, there is no card
  write in modes 3/4, and modes 5/6 run after login.

**Horizon** (`research/horizon-server`):
- `MLS.cs` handles FileCreate (:3460), FileUpload (:3511), FileClose (:3631) and FileDownload (:3664).
- There is **no FileListFiles handler**: the type 0xB2 exists only in `RT.Common/Types.cs:752`, with no model class.
- Nothing ever writes `ServerChecksum`.
- FileCreate answers `MediusFileAlreadyExists` for an existing file.

So against stock Horizon, every save and every login download stalls at the list step: the pending request is never
answered, and modes 4/5 run into the scripts' 3 s cap.

**For the online lane:** the room must answer FileListFiles with the file's MD5 in `ServerChecksum`. That is a new row.

### 20.3 Claim 6: The grid walk and the far cull (R2-UI §1)

**What V7 did, without the author's replay.** V7 read the console's own walk list straight from four dumps
(`gridlist_rdram.out`). The grid is world+0x684, with count +0x104 and entries (cell, ring, x, z) at +0x114 + 16n. In
all four dumps (postload, spawn, frostA, frostB; 32/32/21/17 cells):
- ring == |dx| + |dz|;
- rings are non-decreasing;
- each entry's ring-1 parent appears earlier, and parents appear in list order (breadth first);
- each parent's children come in the order -x, +x, -z, +z.

This agrees with `FUN_002d6e40` / `FUN_002d7030` (D:L177338-177443), which V7 re-read. The edge test (`FUN_002d66b0`)
uses `grid+0x40`, which reads 127.279 (= 90 sqrt 2) and 113.137 (= 80 sqrt 2) in the dumps.

**Far plane.**
- `FUN_0033b110` sets mask 0x3f3f or 0x3f2f.
- `FUN_00290c30` culls when the AND of the 8 corners' VCLIP flags meets the mask.
- V7 solved the eye from `cam+0x330` (clip x = y = w = 0) and clipped points ahead (`farclip_rdram.out`):
  - flags 0x00 at far-1 and **0x10** at far+1, in postload/spawn (far 850) and frostA (far 640);
  - 0x20 at 0.1 u (near).
  - So bit 4 is the far plane.
- R2-UI's `node_flags_rdram.py` re-runs to the same result: all 1,262 nodes have +0x5f bit 7.

**Correction (minor).**
- `FUN_002d6e40` tests `count < 0x640` only at ring boundaries, so the final ring can add past 1,600. Unreachable on
  the 8x9 / 36x25 grids seen.
- The bounding-box fields grid+0xcc..+0xdc are shared with other walks: spawn_pcsx2's box reads x[5,6) while its list
  spans x 1-8. Do not use them as the main walk's footprint when reading a dump.

**Port.** `$PORT/packages/viewer/src/main.ts:2247` is
`fly.setClipPlanes(map.camera?.nearPlane ?? 4, Math.max(2000, ...diagonal * 1.6))`, as quoted. `engineOrder.ts` still
calls the ring direction a reading.

### 20.4 Claim 7: UI ambient 0.5569 and the texture search order (R2-UI §4, §12)

**Ambient.** `ui_ambient_rdram.out` reads the live world's GlobalLighting block (world = `*(0x4887c0+0x624)`, +0x600)
in title, menu, menu2-4, menuC and rank:
- dir1 = (0.47, -0.75, 0.47);
- col1 = 0.8;
- col2 = 0;
- **ambient = (0.55686, 0.55686, 0.55686)**, i.e. 142/255.

For contrast, the in-game postload world's ambient is 0.06. The value is confirmed live. The claim that the ARMORY
models get the ambient only (unlit packets) is unchanged at BELIEVED: no dump shows the ARMORY draw.

**Texture order.**
- `FUN_001feae0` inserts before the sentinel 0x45c3c4, i.e. it appends.
- `FUN_00321390` searches from the list head. The dialog texture lookup `FUN_0036a230` calls it on 0x45c3c0.
- `texlibs_rdram.out` reads, in title and menuC: `common/assetlib/font (ref 3) -> //ui/junkyard -> //ui/assetlib/ui ->
  ui/assetlib/uisk -> ui/assetlib/ui2d -> ui/assetlib/uibf`. Menu adds Eq51 and bf51.

**Verdict.** CONFIRMED. `frontEndAssets.ts:34` still has the "dialog bank, then font" reading.

### 20.5 For SPRINT-OPTIONS / the README (item 3 of the verifier's list)

- **Online lane (new, from claim 5).**
  - The ARMORY server save needs a FileListFiles responder whose file info carries `ServerChecksum` = MD5 of the
    stored file.
  - FileCreate must accept the client's MediusFile layout (FileSize 2000, OwnerID, permission 6).
  - Uploads must be allowed to overwrite an existing file.
  - Without these the client never uploads (it lists first) and never downloads.
