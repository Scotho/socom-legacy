# 188 -- C9 -- world, render, platform and tools: the placeholders and unsure items, sourced (research wave 2026-10-04)

- Research date: 2026-10-04 (research wave 1; the index is [178](178-the-research-wave-of-2026-10-04.md)).
- Origin: `research-wave-2026-10-04/C9-world-render-platform.md` on the owner's host, in the evidence archive ([178](178-the-research-wave-of-2026-10-04.md) gives its root). A relative `scratch/...` path below is under `research-wave-2026-10-04/`; the per-cluster `ledger-*` files it names are merged in [`ledgers/2026-10-04/`](ledgers/2026-10-04/README.md).
- Trees compared: **PORT** = `agent/online` at 2026-10-04 (written `$PORT`; `$PORT/..` is that branch's root, `$WEBISSUES` the `agent/web-issues` checkout); **WT** = the old-layout checkout (`$WT`, the clone's pre-restructure web project). WT-96..102 are notes 171-177 here; PORT's own notes 96-102 are other notes.
- **Status: reading, pending review -- not adopted.** Nothing in it is adopted until a sprint task takes it and a reviewer re-reads it at the source.
- Grades, translated to AGENTS.md's levels: the wave's PROVEN = an exact source read = **reading**; STRONG = reading with one interpretive step; BELIEVED = inference; UNRESOLVED = unresolved. The text keeps the wave's words.
- Verification: V4 (`research-wave-2026-10-04/V4-verify-ui-audio-card.md`) has landed and is folded in as §7.
- Edits on import: the headings are numbered for the corpus; home-directory paths are replaced by `$PORT`/`$PORT/..`/`$WEBISSUES`/`$NPX_TSX`; the archive's absolute root is dropped; references to the other reports are links to their notes. The substance is verbatim.

Agent C9-world-render-platform. Read-only; scripts and outputs in `scratch/C9/` (its `README.md` lists what each
prints). `$PORT` = the `agent/online` snapshot named in the brief. `D:L` = a line of
`C:/Projects/socom_pc/game/analysis/socom2_game.elf.decomp.c` (r0001); every function's start line is in
`scratch/C9/decomp_lines.out`. No decompiled text is quoted; offsets, constants and line numbers only.

## 0. Summary

Inventory: the 9 ledger names under `C9-`, plus a sweep of all 156 C9 files for unsure markers (`sweep.py`,
`sweep2.py`: 384 + 163 hits, most of them `open`/`unknown` as code words) and the open sections of notes 72, 75, 82,
89, 93, 100, 108, 113, the roadmap and `LATER.md`. Gaps owned by other clusters that only *live* in C9 files
(`main.ts`, `hook.ts`) are listed once, with a lead where I found one.

| # | item | status | grade | one-line answer |
|---|---|---|---|---|
| L1 | `MODEL_NAME_CASE_READING` | RESOLVED | STRONG | the model-by-name lookup compares with `strcasecmp` (0x198b80): case-insensitive; the port is right |
| L2 | `INVENTORY_MENU_READING` | PARTIAL | STRONG | buttons and the edge are settled: +5 d-pad Up, +6 Down, +7 Triangle, +0xd L1, +0xe L2; value 1 is the press *edge* (states 0 up, 1 pressed, 2 held, 3 released); confirm is action 0 (Cross) or 4 (R2) on its edge. Built 2026-10-04 (`inventoryMenu.ts`, research 94 §4.6). The menu's draw is still owed beyond the parts read there |
| L3 | `SET_RESOLUTION_READING` | RESOLVED (mechanism) | STRONG | no cascade: a dialog's SCRIPT_LIBRARY names are loaded from the *one* archive its screen manager holds (UIZANIM / EXTZANIM / MPZANIM), else from the loose `data/common/zrdr/dialog/%s` |
| L4 | `HOLSTER_TRACK_READING` | PARTIAL | STRONG | no idle/walk/run clip animates `launcher`: only 7 of 334 MOTION_P clips carry it (the launcher in hand and the two draws), so a slung launcher has no clip pose; the node's creation transform is owed |
| L5 | `REMOTE_STEP_STICK_READING` | UNRESOLVED | -- | new lever: the three stick floats `FUN_005a39b0` tests are `CEntityCtrl::m_throttle[3]` (ctrl +8/+0xc/+0x10, reCOM `zentity.h:175`); the remote controller's writer of them is owed |
| L6 | `ARMORY_WAITING_LAUNCH_READING` | UNRESOLVED | -- | a browser-room behaviour (the room has no launch count); the original's game-lobby launch with the ARMORY open is ONL-17 / C1 / C4 work |
| L7 | `PAGE_KEYS_READING` | NOT-A-GAP | -- | page keys are a browser adaptation; the game's own slot table (below) gives START = slot 0, SELECT = slot 1 for PLAT-11 |
| L8 | `CONTROL_MARGIN_READING` | NOT-A-GAP | -- | a harness tolerance, no original |
| L9 | `BLACK_FLIP_RGB_READING` | NOT-A-GAP | -- | a decoder-test tolerance, no original |
| U1 | LOD range under zoom (`lod.ts` "the viewer has no zoom to scale by") | RESOLVED | STRONG | range² is scaled by `cam+0x2c8 = cam+0x2cc / magnification` (`FUN_00290aa0`, `FUN_0029b2f0`): at 9x the LOD bands, the detail gate and the alpha-pass key see range²/9 |
| U2 | the detail pass's distance rule (`materialSpec.ts` "the brief's reading") | RESOLVED | STRONG | per visual, on/off: on when the centroid's scaled range² is <= a detail record's range (`D:L235405-235418`) and the visual's `vparams` bit 14 is set (`FUN_003b6e10` `D:L308392`); 10 disc visuals carry a `detail_buff` with bit 14 clear and get no pass |
| U3 | the view range in night vision, binoculars and scopes | RESOLVED | STRONG | sourced, not implemented: view state 3 and 4 add 200, states 5-12 add 300 to the fog far, the mid and the far clip (`FUN_001f1470`), restored on leaving |
| U4 | `DrawLOD` as SOCOM II has it (`lod.ts` built on reCOM's reversed transcription) | RESOLVED | PROVEN | `FUN_003b7b90` confirms the port's reading; open interval, one ramp (near before far); no disc band overlaps, so no visible difference |
| U5 | the last LOD copy kept at every range (`lod.ts` `lodIsLast`) | RESOLVED (rule) | PROVEN | the game culls every copy at its far edge, the last one too; the port's departure is visible where the fog is thin at that edge (Frostfire 500: 32 % unfogged). An owner call |
| U6 | the far clip (`main.ts` 2246-2247: far = max(2000, 1.6 x the diagonal)) | PARTIAL | STRONG | the camera's far is the record's (`cam+0xf0`, read live: 850 on M51, 640 on Frostfire), but VU1 family B clips only near + 4 sides (desktop research 13 [verified]); the EE's far cull of nodes is not traced. Matters on the fogless MP51 (far 2000) and MP81 (2500) |
| U7 | the texture scroll's unit (`world.ts:233` `SCROLL_TICKS_PER_SECOND`, "still an assumption") | PARTIAL | STRONG | `du, dv` times the scheduler's `dT`, once a frame (`FUN_003c0120` from the task "Update visual effects"); the unit of `dT` (seconds) is believed, not read |
| U8 | front-end streams addressed by LBN (`frontEndFiles.ts:17`, PLAT-03's unknown) | RESOLVED | STRONG | the ISO-search-to-LBN `FUN_0039def0` has four callers: the CD stream (PSS), `BNKSTORE.ZAR`, `VAGS_ENG.ZAR`, `VAGSTORE.ZAR`. The class list lacks BNKSTORE and VAGS_ENG |
| U9 | `fogForExtent` fallback, the stand-in light rig, `DEFAULT_METERS_PER_UNIT`, `DEFAULT_GRID_PARAMS`, the ShadowVector default | NOT-A-GAP | PROVEN | dead paths on disc data: all 34 maps carry `cameras/camera`, `GlobalLighting`, `MetersPerUnit` (0.1), `grid_params`, `ShadowVector` |
| U10 | `SHADOW_WEIGHT` 0.25 | NOT-A-GAP | PROVEN | no map names `ShadowWeight`; `CWorld` +0x680 = 0x3e800000 at `D:L221391` |
| U11 | `worldRoot.ts:173` "untextured entries ... not established" | NOT-A-GAP | -- | a stale comment: research 82 round 4 settled it (every entry kind 2, default `specular_map.tif`) |
| U12 | `buildScene.ts:254` the `di` copy "TODO" | NOT-A-GAP | -- | reCOM's TODO, settled by research 24's count (3,318) |
| U13 | `gsState.ts:67` unknown ALPHA combination -> source | NOT-A-GAP | -- | defensive; the corpus has none |
| U14 | `skin.ts:421` four of up to six influences | PARTIAL | PROVEN (the six) | the original blends all influences (78 §4); the viewer drops the smallest; size not measured here |
| U15 | research 82: the water pass 20 % high on Seeding Chaos | UNRESOLVED | -- | a capture question (campaign map); owed below |
| U16 | research 82: D7 Vigilance grass | UNRESOLVED | -- | a posed multiplayer frame is owed |
| U17 | research 82: the node-level alpha list (bit 7) and deferred layers (bit 11) have no passes of their own | UNRESOLVED | -- | read, not ported; nothing seen depends on it |
| U18 | research 82: which lights the NV rows run over (`FUN_003b54e0`) | UNRESOLVED | -- | the effects' (C3) lights; lead only |
| U19-U24 | the C2/C3/C1 readings that live in `main.ts`, `play.ts`, `hook.ts`, `overlays.ts`, `loadMap.ts:779` | UNRESOLVED (owned elsewhere) | -- | listed with leads in section 4; one new lead: the zoom d-pad is gated by `FUN_005a8da0` |
| NAG | browser adaptations | NOT-A-GAP | -- | one line each in section 5 |

Counts: RESOLVED 8 (L1, L3, U1, U2, U3, U4, U5, U8), PARTIAL 5 (L2, L4, U6, U7, U14), UNRESOLVED 9 (L5, L6, U15-U18,
and the C2/C3/C1 group counted as three rows in the ledger), NOT-A-GAP 8 named rows plus the adaptations list.

---

## 1. The ledger's nine names

### 1.1 L1. `MODEL_NAME_CASE_READING` -- `$PORT/packages/viewer/src/loadMap.ts:657, 681`

- **Stands for**: whether the game finds a weapon's `ModelName` in the model libraries case aside (the SA-80's
  `IW80A2` against the library's `iw80a2`).
- **Current**: case-insensitive (`Map` keyed lower case).
- **Prior search**: "the model-by-name lookup's compare was not traced" (research 94 L1554).
- **What I did**: followed the weapon record's `ModelName` (string 0x3fcb40, read by `FUN_003cda30` into
  record +0x1c via `FUN_003d28c0` `D:L325209`); its getter `FUN_003d2750` (`D:L325063`) feeds `FUN_0031fd10`
  (`D:L221082`) -> `FUN_00320f10(0x45c3c0, name)` (`D:L221750`): a one-entry cache tested with `strcmp`
  (0x198f18, exact-fingerprint name), and on a miss a walk of the libraries through `FUN_00312120` (`D:L213012`),
  whose compare at `D:L213029` is `FUN_00198b80` -- `strcasecmp` (callgraph name 0.80), and its body folds each
  byte through the ctype table's upper-case bit plus 0x20 (`D:L15551` ff.). The held-weapon path
  `D:L458029` (`FUN_003d2750` -> `FUN_0031fd10` -> `FUN_00317d90`) is this lookup.
- **Answer**: case-insensitive. A case-different name only misses the cache and is found by the walk. **STRONG**
  (the compare is PROVEN; the step "this is the path the held SA-80 takes" is the one interpretation).
- **Implementation**: none needed; rename the constant to a plain name and retire the row (research 94 L1554 ->
  "resolved: strcasecmp, FUN_00312120"). Test: keep `heldWeapon.test.ts`'s SA-80 case and cite `FUN_00312120`.

### 1.2 L2. `INVENTORY_MENU_READING` -- `$PORT/packages/viewer/src/main.ts:784` (note only)

- **Stands for**: which pad buttons the input record's bytes +5/+6/+0xd/+0xe/+7 are in the alive R2 menu
  (`FUN_0021bda0`), whether "reads 1" is an edge or a level, and the menu's draw.
- **Prior search**: research 94 §4.3/L1647: the bytes and `FUN_002c64e0` read; the buttons and edge/level open.
- **What I did** (three independent lines that agree):
  1. The record builder `FUN_002da930` (`D:L179477`; the slot calls at `D:L179819-179868`) reads libpad2's
     button info by index and calls `FUN_002d9ff0(pressure, ctrl, slot, digital)` per slot. Its pairs of pressure
     index and digital index are self-consistent with libpad2's DualShock 2 order (pressure 0x14..0x1f = Right,
     Left, Up, Down, Triangle, Circle, Cross, Square, L1, R1, L2, R2 paired with digital 5, 7, 4, 6, 12, 13, 14, 15,
     10, 11, 8, 9): **slot 0 START, 1 SELECT, 2 RIGHT, 3 LEFT, 4 UP, 5 DOWN, 6 TRIANGLE, 7 CIRCLE, 8 SQUARE,
     9 CROSS, 10 R1, 11 R2, 12 L1, 13 L2, 14 R3, 15 L3.**
  2. The preset reader's button names `FUN_002c6670` (`D:L167009`; `CCtrlrConfigs::ReadBtnName`) map name to
     slot: Circle 7, L1 0xc, L2 0xd, LeftStickTap 0xf, R1 0xa, R2 0xb, RightStickTap 0xe, Square 8, X 9, Select 1,
     Pause 0, else 0x10 (strings 0x3f2c70..0x3f2cd0 read from the ELF, `strings.out`). Agrees with 1 on every name.
  3. `FUN_002d9ff0` (`D:L179128`) writes byte `ctrl + 1 + slot` as a four-state machine: 0 up, **1 the frame it
     goes down**, 2 held, 3 the frame it comes up. The zoom handler `FUN_00594cf0` reads `+5 == 1` for zoom in
     and `+6 == 1` for zoom out (`D:L453322`, `D:L453315`), which research 84 names d-pad Up/Down: agrees.
  The loaded preset is `Default`; its action table at +0x12 reads `09 10 0a 0f 0b 08 0e 10 10 0c 0d 07 01` live
  (`camera_rdram.out`, three PCSX2 dumps; the same as desktop KNOWN's voice row): action 0 -> slot 9 (Cross),
  action 4 -> slot 0xb (R2), actions 9/10 -> L1/L2.
- **Answer**: in `FUN_0021bda0`, `+5` (`D:L72623`) is d-pad **Up**, `+6` (`D:L72626`) **Down**, `+0xd` (`D:L72629`)
  **L1**, `+0xe` (`D:L72645`) **L2**, `+7` (`D:L72661`) **Triangle**; all tested `== 1`, the press edge. The confirm
  (`D:L72684-72686`) is action 0 or 4 reading 1: under `Default`, a fresh press of **Cross** or **R2** -- an R2
  still held from opening the menu does not confirm. **STRONG**. The draw is not read here.
- **Implementation**: in the R2 menu, step on Up/Down edges, L1/L2 assign the highlighted slot, Triangle cancels,
  Cross or a *new* R2 press confirms; a test per edge ("R2 held from the opening does not confirm", "Triangle
  closes unchosen"). The page's key map for these slots is PLAT-11's.
- **Built** (2026-10-04, the owner: "the quick menu select just never shows"): `packages/viewer/src/inventoryMenu.ts`, wired
  in `main.ts` `padFrame`, as above -- L1 / L2 refused both ways (`D:L72629-72660`); while it is open the controller's mode byte `ctrl+0x221` is 1
  (`D:L72835`), which stops the Action, Jump, zoom and Triangle stance blocks of the player update (`D:L453192`,
  `D:L453208`, `D:L453315-453323`, `D:L453331`) until the close clears it and the pad's Cross / Circle / Triangle
  (`FUN_0021aaa0` `D:L72009-72017`) -- so Triangle closes it with no stance change and Square does not jump (the fix
  round, 2026-10-05); L1 / L2 back to slots 0 / 1 with each body (`FUN_00599690` -> `FUN_00598280`, `D:L455434`); the
  menu over the merged lanes; tests `test/inventoryMenu.test.ts`. Research 94 §4.6 has the account.
- **Owed**: the menu's draw (`CWeaponSel`'s layout): a PCSX2 frame with R2 held in a round, any MP map.

### 1.3 L3. `SET_RESOLUTION_READING` -- `$PORT/tools/dialogInventory.ts:286`

- **Stands for**: which archive a dialog's `SCRIPT_LIBRARY` set is taken from when several hold the name.
- **Prior search**: research 96 §8 "a read of `CZAnimMain::LoadZAR` 0x267ab0's callers".
- **What I did**: `CGameMenu::LoadFromDesign` (`FUN_00367950`, `D:L263398`) walks the design's script list and for
  each name calls `CZAnimMain::LoadZAR(0x414bb0, zar, name)` (`FUN_00267fa0`, `D:L113626`) with **one** archive,
  `param_3` -- or, when that is null, loads the loose path `data/common/zrdr/dialog/%s` (`FUN_00268250`, string
  0x3f8e00). `LoadZAR` takes from that archive only the set whose name matches case-insensitively. The archive is
  the menu's `+0xc0`, set by `FUN_00368570` (`D:L263778`) from three places, one archive each: `FUN_001f4860`
  (`D:L54855`) `run/uizanim.zar`, `FUN_001f1bb0` (`D:L53489`) `run/extzanim.zar`, `CMPExitState::Init`
  (`FUN_00223970`, `D:L76103`) `run/mpzanim.zar` (strings in `strings.out`).
- **Answer**: there is no cross-archive order. A set is found in the active state's archive or not at all; a name
  held only by another archive loads nothing (`FUN_0026a100` returns 0 and the binding is skipped). **STRONG** for the
  mechanism; which game state is `FUN_001f4860` (by its neighbours `CMenuState::*` at 0x1f3bd0, Harry's labels: the
  front end) and `FUN_001f1bb0` (the in-game menus) is **BELIEVED**.
- **Implementation**: `resolveSets(dialog, sets, archive)` takes the screen's archive and drops the fallback chain;
  test: `UIanim.rdr` resolves to UIZANIM's 19-animation copy for a front-end dialog and to MPZANIM's 57 for an
  end-of-round dialog. The dialog-to-state map is what the screen manager (PLAT-10) already knows.

### 1.4 L4. `HOLSTER_TRACK_READING` -- `$PORT/packages/viewer/src/play.ts:410`, `rocket.ts:25`

- **Stands for**: the slung launcher's pose -- the `launcher` node's track in the idle/walk clips.
- **Prior search**: "the MOTION_P clips' values not probed" (research 94 L1403, L1531).
- **What I did**: `launcher_track.ts` over `RUN/MOTION_P.ZAR` (334 clips): only **7** carry a `launcher` part --
  `seal_launcher`, `_step`, `_reload` (one constant key, (1.184, 0.969, -0.121), the launcher in hand) and
  `seal_rifle2launcher`, `seal_mv_rifle2launcher` (36 keys, from (-5.938, 0.699, -0.012)),
  `seal_pistol2launcher`, `seal_mv_pistol2launcher` (25 keys, from (-3.359, 2.207, -2.902))
  (`launcher_track_all.out`). No stand, walk, run, crouch or prone clip animates it.
- **Answer**: a slung launcher has no clip pose; it sits where its node was created on `spinehi`, as the port draws
  it -- **STRONG** for "no track", the creation transform itself not read. The draw clips' key 0 is a candidate
  for the slung pose only if the node keeps its last pose (the same reading as `play.ts:523`'s rest holds).
- **Owed**: the node's local matrix after `CZSealBody` set-up adds `launcher` (`D:L419672-419687`; `FUN_00316e30`
  constructor): an RDRAM read of that node in any round with an RPG/LAW slung.

### 1.5 L5. `REMOTE_STEP_STICK_READING` -- `$PORT/packages/viewer/src/remotePlayers.ts:190`

- **What I did**: `FUN_005a39b0` (`D:L460383`) picks the step or the stealth step by `ctrl+8`, `+0xc`, `+0x10`
  beyond +-0.5 (ctrl = actor +0xc0). reCOM's `CEntityCtrl` (`gamez/zEntity/zentity.h:159-176`) is vtable, entity,
  `f32 m_throttle[3]` -- exactly +8/+0xc/+0x10, set through `SetThrottle(throttle, pad)`. Harry's objects name no
  controller field.
- **Answer**: UNRESOLVED. What the floats are is now named (the controller's throttle); what a remote controller
  writes into them is not read.
- **Owed**: the remote seal controller's tick (the class whose `IsRemote` answers true; vtable `+0x2c` is queried
  just after at `D:L460422`) and its writes to `+8/+0xc/+0x10`; or an RDRAM pair in an online round: a remote
  actor's `*(actor+0xc0)+8..+0x10` while it walks and while it stands. Also owed: `FUN_005a3570`'s `+0xe0` bit 2
  gate (`D:L460295`).

### 1.6 L6. `ARMORY_WAITING_LAUNCH_READING` -- `$PORT/packages/viewer/src/main.ts:2128`

UNRESOLVED and not this cluster's to settle: it is the browser room's launch with the ARMORY open; the original's
counterpart is the game lobby's launch (ONL-17). Owed: an online session on our server with a player in the ARMORY
when the host launches (what the client does with an unsent change), C1/C4.

### 1.7 L7-L9. `PAGE_KEYS_READING` (`tools/capture-page.ts:38`), `CONTROL_MARGIN_READING` (`tools/captureScore.ts:40`), `BLACK_FLIP_RGB_READING` (`tools/fmvPlanes.ts:124`)

NOT-A-GAP: instrument tolerances and the page's key map, with no value in the original. For PLAT-11 the game's own
slots are in L2 (START slot 0 "Pause", SELECT slot 1).

---

## 2. Unnamed items -- the world and the render

### 2.1 U1. The LOD range under zoom -- `$PORT/packages/scene/src/lod.ts:89-91`, `viewer/src/world.ts:977`

- **Current**: `lodOpacity(band, distanceSq)`; the doc says reCOM's `GetScaledRangeSquared` is a stub "and the
  viewer has no zoom to scale by" -- the viewer has binoculars and scopes now.
- **What I did**: the LOD call in `CPipe::RenderVisual` (`FUN_003374c0`, `D:L235458-235469`) passes
  `FUN_00290aa0(camera, node position)` (`D:L137045`): `cam[+0x2c8] * |p - cam_pos|^2`. `+0x2c8` is written only as
  `cam[+0x2cc] / m` by the projection setter `FUN_0029b2f0(m, ...)` (`D:L142693`, write `D:L142705`; also
  `D:L140528`), whose `m` is the applied magnification `DAT_003dc338` (`D:L52802`; research 84 S9). `+0x2cc` is
  1.0 at the camera's init (`FUN_00293a80` `D:L138731-138732`) and copied from `+0x280` by `FUN_002918b0`
  (`D:L137552`, the desktop's `camCfg`); read live, `+0x280 = +0x2cc = +0x2c8 = 1.0` on M51 and Frostfire
  (`camera_rdram.out`).
- **Answer**: the game's LOD, detail and alpha-pass ranges are `range^2 / magnification` (not squared): at 9x the
  bands act as if the camera were 3x closer. **STRONG** (instructions unambiguous; the zoom-to-`m` link is research
  84's).
- **Implementation**: `lodOpacity(band, rangeSq * lodScale)` with `lodScale = 1 / zoom.magnification()`; the same
  factor in the detail gate (U2). Test: Frostfire's `railings_low` (band 100-120 / 420-440) at 500 units is hidden at
  1x and fully drawn at 9x (500^2/9 = 166^2). Only MP2, MP64 and MP73 carry `lod.rdr` (`lod_survey.out`).

### 2.2 U2. The detail pass's distance rule -- `$PORT/packages/viewer/src/materialSpec.ts:166-178`, `loadMap.ts:830-842`

- **Current**: a per-fragment linear fade to `sqrt(range)`, per texture; the doc names it "the brief's reading" and
  cites reCOM's centroid switch.
- **What I did**: in `FUN_003374c0` (`D:L235405-235418`) the game computes the visual centroid's scaled range²
  (`FUN_00290aa0`) into `DAT_004b4a98` and sets `DAT_004b4a88 = 1` when it is `<=` the first float of any of the
  visual's 16-byte detail entries (`visual[0x18]`, count `visual[0x19]`). `FUN_003b6e10` (`D:L308360`, the desktop's
  `detail`) draws the pass only when the list exists, `DAT_004b4a88` is set **and `vparams` word 0 has bit 14
  (0x4000)** (`D:L308392`). On the disc (`detail_flag.ts`): 1,606 visuals carry a `detail_buff`, 1,596 with bit 14;
  the 10 without (`detail_flag_list.out`: MP10 `mp10`, MP11 `upper`, MP52 `g1210`/`g1211`/`g1210_1`, MP61
  `post_tele`/`wc35`/`vis_bldg34a`/`g1897`, MP64 `jungletree01_roots`) get no detail pass in the game. The disc
  record's first float is the range squared (202,500 = 450^2).
- **Answer**: whole visual on or off at `scaledRange^2 <= range`; no fade; gated by bit 14. **STRONG**.
- **Implementation**: keep each visual's centroid as a vertex attribute in the merged geometry and switch the pass
  per fragment by the centroid's distance (whole visuals switch together, so no ring); skip visuals without bit 14.
  Tests: a visual at 449 vs 451 units with range 202,500; one of the ten above draws no pass.

### 2.3 U3. The view range in night vision, binoculars and scopes (sourced, not implemented)

- **What I did**: the view-state machine `FUN_001f0750` (`D:L52842`) first calls `FUN_001f1470(0, 0)` on any change
  (`D:L52939`), then `FUN_001f1470(200, 1)` in state 3 (`D:L53049`, `DAT_003dc368` = 200.0 in `.data`,
  `elfread.out`), `FUN_001f1470(DAT_0043666c, 1)` in state 4 (`D:L53075`) and `FUN_001f1470(DAT_00436670, 1)` in
  states 5-12 (`D:L53159`). The two are `.bss`; no `lui`-based writer exists (`bss_writers.out`) [corrected 2026-10-15,
  AD-1 / reconciliation C13: they are `CMission`'s members `+0x18c` / `+0x190`, written 200.0 / 300.0 by its
  constructor `FUN_002adbc0` D:L152890-152891, optionally overridden by `SEEFARTHER_BINOCS` / `SEEFARTHER_WEAPZOOM`
  (`FUN_002aab20` D:L151383-151384; absent on the 34 retail scripts) -- research 232 §2 and §8]; read live they are
  **200.0 and 300.0** in four RDRAM dumps (`rdram_viewrange.out`). `FUN_001f1470` (`D:L53202-53255`) with 1 saves and
  adds the amount to the fog far (`cam+0x128`), the far clip (`+0xf0`/`+0x2ec`) and the mid (`+0xec` via
  `FUN_00291180`), then rebuilds the fog (`FUN_00294070`); with 0 it restores them and the fog colour. Camera field
  identities: `FUN_002915f0` (`D:L137491`) copies the 144-byte record at `cam+0x1f0` (hfov +0x20 -> `0x210`, fog
  near/far +0x64/+0x68 -> `0x124`/`0x128`, mid/far -> `0xec`/`0xf0`), confirmed live against the disc
  (`camera_rdram.out` vs `camera_key.out`).
- **Answer**: night vision and the binoculars push the fog's far end and the clip out by 200 units, every scope by
  300. **STRONG** (code + capture; the static writer of the two `.bss` floats not found).
- **Implementation**: `zoom.ts` state -> `fogFarExtra` {3: 200, 4: 200, 5-12: 300}; `fog.far += extra` while in the
  state (the near unchanged, so the ramp lengthens). Test: Frostfire fog 200..640 becomes 200..940 in a scope.

### 2.4 U4. `DrawLOD` as SOCOM II has it -- `$PORT/packages/scene/src/lod.ts:72-107`

`FUN_003b7b90` (`D:L308899`, `zdb_CVisual_DrawLOD`): band floats `[0]` minNear², `[1]` minFar², `[2]` 1/delta,
`[3]` maxNear², `[4]` maxFar², `[5]` far 1/delta, byte `+0x18` bit 0 near fade, bit 1 far fade. Not drawn when
`range <= [0]` or `range >= [4]`; no flag -> 1; between `[1]` and `[3]` -> 1; the near ramp when bit 0 and
`range <= [1]`, else the far ramp when bit 1 and `range >= [3]` -- one ramp, the near first. The port's reading is
right; it multiplies both ramps where they overlap, and no band on the disc overlaps (`lod_survey.out`). **PROVEN**.
Implementation: optional -- strict bounds (`<=`, `>=`) and a test pinning the transcription to `FUN_003b7b90`.

### 2.5 U5. The last LOD copy kept at every range -- `$PORT/packages/scene/src/lod.ts:118-133`

The game culls every copy at `range >= maxFar^2` (U4), the last too. The port's reason ("that edge sits inside the
fog") is half true: on Frostfire, fog 200..640, the 500-unit edge is `F = (640-500)/440` = 32 % unfogged, and the
0-0/360 band's 360 edge 64 %; at 9x (U1) the edge moves out to 1,500 units. **PROVEN** rule; keeping the copy is a
fly-mode adaptation. Suggestion: keep `last` in fly mode and with the fog off, apply the game's cull in play mode;
an owner call.

### 2.6 U6. The far clip -- `$PORT/packages/viewer/src/main.ts:2246-2247`

The camera's far is the record's `m_far_plane` (`+0xf0`; live 850 on M51 and 640 on Frostfire); VU1 family B
clips against the near plane and four side planes and has no far plane (desktop research 13 §4.4, qwords 31-36,
[verified]) -- which is why MP51's dome at 2,250 is drawn with a far of 2,000 (research 82 "the owner's doorway").
What the EE culls at the far plane (the grid walk, the frustum's far corner) is not traced. It matters where the fog
is off: MP51 (far 2,000) and MP81 (far 2,500) (`camera_key.out`, flags 0). **PARTIAL, STRONG** for what is read.
Owed: the frustum test in `FUN_00339de0`'s grid walk (`D:L236851-236945`) for a far-distance compare, or a PCSX2
frame on MP81 looking along its longest axis.

### 2.7 U7. The texture scroll's unit -- `$PORT/packages/viewer/src/world.ts:226-233`

`FUN_003c0120` (`D:L313834`) steps each band by `du * dT, dv * dT` once a frame (frame counter `DAT_004a4490` vs
band `+0x17`), only bands with `+0x16 == 1` and `+0x19` bit 0 clear, bits 1 and 2 passed on (`FUN_003bfee0`); its
`dT` is the scheduler's (the task "Update visual effects", string 0x3f1620, registered at `D:L152102` with
`FUN_00313c60`; reCOM `CSched_Manager::Tick(f32 dT)` hands each task `dT`). So `du` is per unit of `dT` -- research
82 already took it per second; the code's comment ("still an assumption") is stale. **PARTIAL, STRONG**. Owed: the
unit of the scheduler's `dT` (`FUN_0034e070` `D:L248515`, called from the state tick `FUN_001ebed0` at `D:L50801`)
and the three band flags (`+0x16`, `+0x19`) against `TextureScroll_Object`'s record.

### 2.8 U8. Front-end streams by LBN -- `$PORT/packages/archive/src/frontEndFiles.ts:17` (PLAT-03's unknown)

`FUN_0039def0` (`D:L293898`, path -> directory record -> LBN) has four callers: `FUN_0030bb60` (`D:L209012`, the CD
stream open: the PSS movies), `FUN_00345230` (`D:L243323`, `RUN\SOUNDS\BNKSTORE.ZAR;1`), and `FUN_0034d180` /
`FUN_0034d190` (`D:L247947-248042`, `RUN\SOUNDS\VAGS_ENG.ZAR;1` and `RUN\SOUNDS\VAGSTORE.ZAR;1`). **STRONG** (static;
an LBN computed without this function would escape it -- none seen). The class table has VAGSTORE and the movies as
`lbn`; `BNKSTORE.ZAR` and `VAGS_ENG.ZAR` are absent from it (sound classes, C7's to place).

### 2.9 U9-U13. Defaults and comments that are not gaps

- `fogForExtent` (`fog.ts:71`, `main.ts:2249-2253`), the stand-in rig (`loadMap.ts:961`), `DEFAULT_METERS_PER_UNIT`
  (`worldRoot.ts:163`, `loadMap.ts:280`), `DEFAULT_GRID_PARAMS`, the ShadowVector default (`loadMap.ts:1131`): every
  one of the 34 archives carries the key (`worldroot_keys.out`, `camera_key.out`; MetersPerUnit 0.1 everywhere). The
  initial pre-map fog (`main.ts:987`) is before any map. NOT-A-GAP.
- `SHADOW_WEIGHT` 0.25: `D:L221391` writes 0x3e800000 to `CWorld+0x680`; `D:L218075` uses it x 255; no map names
  `ShadowWeight`. Sourced.
- `worldRoot.ts:173`, `buildScene.ts:254`, `gsState.ts:67`: see the table.

### 2.10 U14. Skin influences -- `$PORT/packages/mesh/src/skin.ts:419-425`

The disc's vertices carry up to six influences (research 78 §4); three's skinning takes four and the viewer drops
the smallest, reporting `droppedMax`. A known approximation with an original. Suggestion: measure `droppedMax` over
the character set (`tools/dump-characters.ts`) and, if visible, a custom six-weight skinning node.

### 2.11 U15-U18. Research 82's open items

- **Water 20 % high on Seeding Chaos** (82 §5): owed a PCSX2 frame of the M51 stream at the slot-8 pose with the
  water pass's alpha read from `logs/vu1dump3` -- the base water pass is the suspect.
- **D7 Vigilance grass**: owed a posed MP51 savestate at spawn A with the camera at `0x415ff0 -> cam+0x2c/+0x38`.
- **Node-level alpha list (node flag bit 7) and deferred layers (bit 11)** (82 §7 D9): read, no pass; owed a frame
  where a bit-7 node (Vigilance `metalgrate_door`, `water_wc11`) overlaps another transparent draw.
- **The NV rows over a light list** (`FUN_003b54e0`, 82 §6): which lights -- C3's effect lights.

## 3. Sourced but not implemented (multiplayer-relevant)

1. **The view range in night vision, binoculars and scopes** (U3): +200 / +200 / +300 units of fog far and clip.
2. **LOD and detail under zoom** (U1): ranges scaled by 1/magnification (Frostfire's railings, MP64/MP73's bands).
3. **The detail pass per visual** (U2): on/off by centroid, bit 14; ten visuals without it.
4. **The R2 inventory's buttons and edge** (L2; built 2026-10-04, research 94 §4.6), and the full game slot table (START, SELECT, d-pad, faces,
   shoulders, L3/R3) for PLAT-11's key map.
5. **One archive per screen state for zAnim sets** (L3).
6. **The LOD's last copy culled at its far edge** (U5), an owner call.

## 4. Gaps owned by other clusters that live in C9 files (leads)

- `main.ts:494-497`, `:666-667` -- a scoped grenade on a weapon switch (`FUN_005c4b10`): C3/C2, research 84 §7.
- `main.ts:528` -- the claymore refusal's message line: the text is 0x65f880 "Unable To Deploy: Max Equipment Items
  Placed (4)" (`strings.out`); the display is the HUD message line (C3).
- `main.ts:626-627` -- whether the dead can zoom: the d-pad zoom (`D:L453315-453327`) runs only when `FUN_005a8da0`
  (`D:L463193`) passes -- actor `+0xe1` bit 4, posture `+0x174` in {0,1,2,3,6}, the current clip id in a whitelist
  (`DAT_003deb20..DAT_003debf0`). Lead for C2: read those clip ids and the death's `+0xe1`.
- `main.ts:1304` -- the pitch stick for the exertion (research 84 §17): C2/C3.
- `main.ts:2121-2122` -- what clears the kit's `+0x20/+0x24` at a death or spawn (research 101 A30): C3.
- `play.ts:523` -- "the node keeps the last pose written to it": the same owed read as L4.
- `hook.ts:165` -- the jump's placeholder impulse (`walk.ts`): C2.
- `loadMap.ts:779`, `overlays.ts:107,195`, `tools/spawn-slots.ts` -- spawn heights off the probe "at the estimate":
  C1 (spawns). Research 75 §9's undecoded AIMAPS fields: C1, not needed for spawns.
- Research 113 §5 (which dialog raises the boot card popups; ONL-01's slot popup): C5's flow, PLAT-36 traces.

## 5. Browser adaptations, not gaps (one line each)

`renderer.ts:62` program grouping guess; `compileQueue.ts`/`renderer.ts:217-228` warm-up stand-ins; `lodFade.ts`
fading twins and `world.ts:199` `LOD_SAME_SPOT_SQ`; `world.ts:205` `REST_WALK_SCALE`; `lighting.ts:54` the old rig as an
option; `fog.ts` refusing `far == near`, and the band in world space (equal on unscaled objects); `isoAssetSource.ts`
volume offset; `decodeFailure.ts`, `discIndex.ts`, `pageStore.ts`, `pageEntry.ts`, `revision.ts`, `playtestReport.ts`,
`loadBudget.ts` (page plumbing); research 93's parser limits (`RDR_VISIT_FACTOR`, `GRID_CELLS_MAX`); research 100's
budget rows and 108's instrument choices (settle detection, the margin, the mask); all `tools/*` harness constants
beyond L7-L9; `LATER.md` rows (parked features, none a value gap).

## 6. Leads for other workstreams

- **C2/C3 (zoom)**: `FUN_001f1470` is the view-range hook every zoom state calls; `DAT_00436674/78/7c/80` beside the
  two range floats are flags the same function reads (`D:L52921-52934`).
- **C7 (sound)**: `VAGS_ENG.ZAR` and `BNKSTORE.ZAR` are opened by LBN (`D:L243323`, `D:L247947`).
- **C5/C6 (front end)**: `CGameMenu::LoadFromDesign` falls back to `data/common/zrdr/dialog/<name>` when the state has
  no archive; the preset `Default`'s action table and the slot table above are the pad map for the menus.
- **C1 (net)**: the remote controller's `m_throttle[3]` (L5) is what a remote body's footsteps and probably its
  locomotion read on a console.

## 7. Verification (V4, 2026-10-04)

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

### 7.1 Verdicts

| # | claim | report | verdict | one-line reason |
|---|---|---|---|---|
| 31 | night vision / binoculars / scopes extend fog far, mid and clip by +200/+200/+300 | C9 | CONFIRMED | D:L53049/53075/53159 -> `FUN_001f1470(x,1)` adds x to +0x128, +0xf0/+0x2ec, +0xec; .bss 0x43666c/0x436670 = 200/300 in PCSX2 dumps; `.data` 0x3dc368 = 200 |
| 32 | zoom divides the squared LOD range by the magnification | C9 | CONFIRMED | `FUN_00290aa0` = cam+0x2c8 x d^2; `FUN_0029b2f0(m)` writes +0x2c8 = +0x2cc / m (D:L142705); the port's `world.ts:977` passes the plain d^2 |
| 33 | the detail pass is per visual, on/off, and gated by vparams bit 14 | C9 | CONFIRMED | D:L235405-235418 (<= any entry's range -> flag); D:L308392 `(*param_1 & 0x4000)`; the port fades per fragment |
| 34 | the last LOD copy is culled at its far edge too | C9 | CONFIRMED | `FUN_003b7b90` returns 0 for range >= [4] with no exception; the caller draws only on a non-zero result (D:L235458-235469) |

### 7.2 Claim 31: The view range in NV, binoculars and scopes -- CONFIRMED

- D:L52939 calls `FUN_001f1470(0,0)` on every change. Case 3 (D:L53049) passes `DAT_003dc368`, which is 200.0 in
  `.data`. Case 4 (D:L53075) passes `DAT_0043666c`, and cases 5-12 (D:L53159) pass `DAT_00436670`.
- Both are `.bss` (the file image ends at 0x408480, so the ELF reads 0). Live they are 200.0 and 300.0 in
  title_pcsx2, postload_pcsx2, spawn_pcsx2, menu and frostA. They are already set at the title screen.
- Their writer is not found by `DAT_` name or literal address (my search), as C9 says. [Corrected 2026-10-15, AD-1 /
  reconciliation C13: the writer is the `CMission` constructor, `FUN_002adbc0` D:L152890-152891, through its members
  `+0x18c` / `+0x190`; research 232 §2.]
- `FUN_001f1470` with 1 saves and adds the amount to +0x128, to +0xf0/+0x2ec and, through `FUN_00291180`, to +0xec,
  then rebuilds the camera. With 0 it restores them.
- The state numbering (3 NV, 4 binoculars, 5+ scopes) agrees with the port's `zoom.ts` header. The port has no fog
  extension.

### 7.3 Claim 32: LOD under zoom -- CONFIRMED

- `FUN_00290aa0` returns cam+0x2c8 x |p - cam|^2. `FUN_0029b2f0(m)` sets +0x470 and +0x474 from m (the projection
  zoom) and +0x2c8 = +0x2cc / m.
- D:L52802 feeds it `DAT_003dc338`. So the ranges are d^2 / m, and the focal scales by m in the same call, consistent
  with "magnification".
- The port's `world.ts:977` passes the plain `distanceToSquared`.

### 7.4 Claim 33: The detail pass rule -- CONFIRMED

D:L235405-235418 sets `DAT_004b4a88` when the scaled range^2 is <= any entry's first float; D:L308392 also requires
`*param_1 & 0x4000`. The port fades per fragment (`materialSpec.ts:174`), a known deliberate deviation. I did not re-run
the 1,606/1,596 counts.

### 7.5 Claim 34: The last LOD copy is culled too -- CONFIRMED

`FUN_003b7b90` (D:L308899+) returns 0 when range <= [0] or range >= [4], with no "last" exception. `FUN_003374c0`
draws only when there is no band or the function returns non-zero (D:L235458-235469). The port's `lodIsLast` plateau is
a departure.

### 7.6 What an implementer should take from this (the verifier's list, for all seven reports)

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
