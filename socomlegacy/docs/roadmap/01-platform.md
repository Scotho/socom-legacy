# 01 -- Platform (`PLAT-`)

The pieces more than one segment stands on: the disc path, the dialog runtime (layout, scripts, commands, valves,
screens, input, text, widgets, popups, keyboard), the movie player, the music and sound streams, the simulated memory
card's store, slots and libmc (its filesystem and codec dropped by R7, 2026-10-01: section E), the desktop-only screen,
the load budget, and the validation instruments. Every
other segment depends on these; none of these depends on a segment's screen (PLAT-34 waits for OPT-20's card file,
not for a screen).

Conventions (citation shorthand, sizes, the "merged from" line): [README](README.md#conventions). The campaign is out of
scope for now ([`../MISSION.md`](../MISSION.md)); campaign-only file classes are marked `DEFERRED (campaign)` where met.

---

## A. Foundations

### PLAT-01 -- Platform inventory, capability matrix and the backlog's graph check, kept in the tree
- **Goal:** one living table maps each original front-end subsystem to its SOCOM Legacy package, its status and the test
  that validates it; one check keeps the backlog's dependency graph acyclic and equal to the README's map.
- **What the original does:** the subsystems of this file and of segments 02-07.
- **Today:** the audit exists only in the researcher's report. `socomlegacy/README.md` "What it is today" / "Not yet
  the game" frames the gap in prose. The graph was checked once by a scratch script (`deps.py`, the session scratchpad
  `roadmap/`), which found the cycles the 2026-10-01 revision removed. **Since web sprint 6 (2026-10-01)** the audit is
  no longer only in the report: the table is [PLATFORM.md](PLATFORM.md) and the check is
  `socomlegacy/tools/roadmapGraph.ts` with `socomlegacy/tools/test/roadmapGraph.test.ts`.
- **Gap:** the table; the graph check in the tree (both landed in web sprint 6; the table is kept as tasks land).
- **Acceptance:** every row names a test id; rows without one are marked UNVALIDATED; reviewed against the code paths
  the platform audit listed (`packages/archive`, `gs`, `mesh`, `scene`, `sound`, `viewer`, `server`, `tools`). **The
  columns are split with PLAT-31:** this matrix owns *subsystem -> package -> status -> test id*; PLAT-31's manifest
  owns *screen or state -> capture path -> method*; a matrix row cites manifest rows by id and never repeats them. A
  vitest under `socomlegacy/tools/` parses every task's **Dependencies** line in `docs/roadmap/0*.md`, fails on a cycle
  or a dangling id, and fails when the README's generated map differs from the lines (runs in CI: it reads only the
  docs). Future-scope blocks (MENU-10..MENU-16) write **Dependencies (if reopened)** and are not active tasks: the check
  skips them and fails if an active task names one. **Added by R7 (2026-10-01):** a dropped task (PLAT-27, PLAT-37,
  OPT-08) keeps its id as a third kind of block -- its title begins "(dropped)", a **Dropped:** line names the ruling,
  and it writes **Dependencies (if reopened)** -- and the check fails when an active task names one, when a dropped
  block lacks any of the three, when one is placed in a sprint or named in PLATFORM.md, or when the README's count of
  each kind (active, future scope, dropped) differs from the files.
- **Dependencies:** none. **Size:** S (documentation from the audit plus one parser test). **Then:** dispatched first,
  with PLAT-02.
- **Unknowns:** none. **Owner calls:** none.
- **Merged from:** platform PLAT-01.

### PLAT-02 -- Package boundaries for the front end
- **Goal:** decide where the dialog runtime, the movie player, the card codec and the streams live, so the segments do
  not grow `viewer/` further (s5 viewer: 141 files, 43,603 lines).
- **What the original does:** reCOM's split -- `zUI`, `zAnim`, `zMPEG`, `zSave`, `zSound`, `zInput`, `zFTS`
  (`research/recom/src/gamez/`).
- **Today:** `uiScript.ts` and `armory*.ts` live in `packages/viewer` (s5); the `ui*.ts` readers in `packages/scene`.
- **Gap:** a short spec (for example `@s2u/ui` for layout, script runner, valves and the host table; `@s2u/fmv`;
  `@s2u/card`; streams inside `@s2u/sound`) with the boundary rule: pure, DOM-free, testable under Node as
  `IsoAssetSource` is.
- **Acceptance:** the typecheck and the package tests run headless; no new package imports from `viewer`.
- **Dependencies:** none. **Size:** S. **Then:** dispatched first, with PLAT-01; PLAT-05, PLAT-18, PLAT-22 and
  PLAT-25 depend on it, so the first of them does not fix the package boundaries by accident.
- **Unknowns:** none. **Owner calls:** none.
- **Merged from:** platform PLAT-28.

### PLAT-03 -- The disc path for every front-end file class
- **Goal:** every disc file the front end needs is readable through `AssetSource` from the visitor's ISO (and the dev
  served tree), by range, never wholly in memory when large.
- **What the original does:** loads by path or by LBN: `RUN/UI/READERC.ZAR`, `READERX.ZAR`, `UI*.ZED`; `RUN/UIZANIM.ZAR`
  (1,224,080 B), `RUN/EXTZANIM.ZAR` (53,056 B), `RUN/MPZANIM.ZAR`; `RUN/LOCALE/STATES/*LOC.ZAR` (path rule
  `FUN_003a3490` D:L297105-297117); `RUN/MOVIES/COMMON/*.PSS` and `RUN/MOVIES/INTRO_2.PSS`, CD-streamed via
  `sceCdStStart(lbn)` (PC research 09); `RUN/RAW/*.RAW` (KNOWN [raw-strips]); VAGSTORE streams by sector and offset
  (KNOWN [mission-music]; PC research 32 §6); `RUN/ICONS/*`.
- **Today:** `packages/archive/src/isoAssetSource.ts` (lazy ISO9660 by `blob.slice`, layer-1 aware) and
  `httpAssetSource.ts` (ranged). `mapIndex.ts:25-44` lists only map, ARMORY and sound archives; `mapIndex.ts:37` says
  VAGSTORE "is not served". `tools/extract-maps.ts` copies only those.
- **Gap:** a declared front-end file list; a chunked async-iterator read over an extent (PSS, VPK); LBN-to-file lookup
  (as `tools_py/iso_lbn.py`); dev-tree extraction of the new classes.
- **Acceptance:** vitest over the synthetic ISO fixtures reads each class byte-equal to the served copy; a fixture test
  reads `MENULOOP.PSS` in chunks and the concatenated hash equals the whole-file hash; the LBN lookup agrees with
  `tools_py/iso_lbn.py` for 20 sampled VAGSTORE members. CI: the synthetic-fixture tests; dev-disc-only (skipped in CI):
  the MENULOOP and VAGSTORE checks.
- **Dependencies:** none. **Size:** M (the sources exist; streaming and LBN are new).
- **Unknowns:** whether any front-end stream is addressed by LBN outside VAGSTORE and the PSS files -- settled by a
  recomp `[sceCd*]` log of a boot-to-lobby run (PLAT-36).
- **Owner calls:** none.
- **Merged from:** platform PLAT-02.

### PLAT-04 -- The locale and string service
- **Goal:** resolve any caption id (UIMnLOC, UIMPXLOC, UIXLOC, HudCLOC, UILdLOC) exactly as the game does.
- **What the original does:** path rule `FUN_003a3490` (D:L297105-297117); US = `STATES`; id ranges UIMnLOC 1-1441,
  UIMPXLOC 2100-2133, UIXLOC 2201-2288, HudCLOC 60000+ (web R95 §1.2, §5.1, §5.5); UIMnLOC is UTF-8 (R95.12); op 1
  Caption uses the s16 id when non-zero, else the literal (`FUN_0036fcc0` D:L268005-268080). Captions are
  `_<id>_..._MSG` keys or literal text, or a UIVAR (`VERSION_STRING`, string 0x3e17e0).
  *(Corrected 2026-10-01, PLAT-04, web R103 §1:)* `UILdLOC` is no loose file on the US disc: the loading state
  `FUN_001f6660` asks for `UILd` (string 0x3e2f48, D:L55825, beside `run/ldzanim.zar`) and every `RUN/*.ZDB` carries a
  member `RUN\LOCALE\STATES\UILDLOC.ZAR` (byte-equal in all 34; ids 2000-2006). The loader is `FUN_003a3900`
  (D:L297225-297310; `FUN_003a3490` re-reads the loaded tables); HudCLOC's ids run 60000-60904. ALB/ALG/BRAZ/RUSS LOC
  (ids 3000-14204) are the campaign's: only a campaign mission's `ExtraStringTables` names them (`FUN_002af410`
  D:L153682-153722, `FUN_002af360` D:L153660-153677) -- `DEFERRED (campaign)`.
- **Today:** `packages/scene/src/uiLoc.ts` (77 lines, UIMnLOC for the ARMORY).
- **Gap:** the other LOC archives, the `C2` lead rule as a general decoder, one id-to-text service.
- **Acceptance:** a fixture test resolves every id the 110 dialogs and the UIZANIM sets reference to a non-empty string
  or a recorded empty, with none unresolved; 10 captions compared against console crops (`scripts/parity/refs/`
  `main_menu`, `login`, `eula` via `refs.json`).
- **Dependencies:** PLAT-03. **Size:** S.
- **Unknowns:** whether HudCLOC ids appear in menu dialogs -- the id scan settles it. *(Answered 2026-10-01, web R103
  §3.1, corrected after the PLAT-04 review: yes. `dlgNetLogin.rdr` -- online and LAN login, front end -- declares the
  persistent UIVARs `MPLOCALSOP1-5` and `MPTAUNTMSG1-5` with HudCLOC 60757-60766 as their values; the UIZANIM sets
  `ShowAndSpin.rdr` (the multiplayer ARMORY, front end) and `dlg_equipment_main.rdr` (the single-player armory,
  campaign) compare with HudCLOC 60884/60885/60888/60889 by name. Four references are in no table: `dlgSetSOP.rdr`'s
  SOP defaults `_549_`, `_550_`, `_552_`, `_553_..._MSG` -- whether they are ever shown is an unknown, R103 §5.)*
- **Owner calls:** none.
- **Merged from:** platform PLAT-03; menus MENU-07 (strings half).

## B. The dialog runtime

### PLAT-05 -- The generic dialog (.rdr screen) loader
- **Goal:** load every member of `RUN/UI/READERC.ZAR` (110) and `RUN/UI/READERX.ZAR` (5) into typed screen records:
  objects, controls, animations, models, background.
- **What the original does:** a SCREENS record carries LIBRARY/LIBRARIES, BACKGROUND (TYPE IMAGE or MPEG + FILENAME;
  reCOM `zUI/zui_spec.cpp:152-171`), FONT, SCRIPT_LIBRARY (sets from UIZANIM/EXTZANIM/MPZANIM), USES_MEMCARD, OBJECTS,
  ANIMATIONS (EVENT/BUTTON/TRIGGER + ANIMATION + ARGUMENT), CONTROLS, MODELS. Loader: `CGameMenu_LoadFromDesign`
  0x367950 (D:L263398), `ParseButtonAnim` 0x365d50 (D:L262461), screen loader `FUN_0037eab0` (D:L275893; NOSELECT/PADHOG
  D:L275975-275979), event-name table `FUN_001eb070` (D:L50161); depth-first first-match `FUN_0032f0e0`
  (D:L230255-230299); CHILDOF `FUN_00383360` (D:L278258, L278331); MODELS `FUN_003812b0` (D:L277104-277195) (web R95
  §2.1). Widget factories `FUN_00382070` (D:L277596-277790) and `FUN_00382890` (D:L277868-278185). Per-type fields in
  reCOM `zUI/zui.h:74-145`.
- **Today:** `packages/scene/src/uiLayout.ts` reads one dialog (`ARMORY_LAYOUT`), BUTTON and BACKGROUND only, with no
  ARGUMENT, TRIGGER or USES_MEMCARD fields; s5 `viewer/src/armoryLayout.ts` places IMAGE, TEXT, TELETYPE, WRAPPEDTEXT,
  POPUP.
- **Gap:** MENU, LISTBOX, CHECKBOX, RADIOSTRIP, SLIDERBAR, MAPCONTROL, PROGRESSBAR, COUNTER, SECURETEXT, PERMANENT,
  INPUT_STRING, MODEL objects outside the ARMORY, the MPEG background; resolving a set across the three ZANIM archives.
- **Acceptance:** (a) dev-disc-only (skipped in CI): a vitest walks every dialog on the dev disc; every object's TYPE is
  known and every SPEC key is consumed (unconsumed keys fail); per-dialog object/control/model counts equal PLAT-06's
  regenerated tally (web R96 §2, pinned per dialog by `tools/test/dialogInventoryDisc.test.ts`). The 103 `dlg*` members
  of `RUN/UI/READERC.ZAR` hold, as objects and controls: IMAGE 2057, TEXT 1291, BUTTON 298, TELETYPE 106, LISTBOX 58,
  WRAPPEDTEXT 49, MAPCONTROL 36, RADIOSTRIP 18, SLIDERBAR 8, COUNTER 4, SECURETEXT 3, PROGRESSBAR 1; inside them 42
  CHECKBOX subordinates (RADIOSTRIPs') and 144 MAPCONTROL elements (72 IMAGE, 72 TEXT); 99 backgrounds (90 IMAGE, 9
  MPEG). *Corrected by PLAT-06: the scratch read's IMAGE 2313, TEXT 1408, BUTTON 309, TELETYPE 113, ..., MPEG 9,
  PERMANENT 7 counted every TYPE key of all 110 members -- the four `Common_*` includes, the backgrounds, the map
  elements, five doubled TYPE keys, and PERMANENT, a UIVAR's longevity, no widget.* `parseUiLayout` today throws on
  fourteen layouts (loose `:end of file` tokens) and drops one three-token NAME (R96 §2.3). (b) CI: per-type decoding
  pinned by one unit test per type citing its reader FUN, on synthetic records. These two are the reading level. (c)
  Proven level: for `dlgMenu` and `dlgOptions_Menu`, the loaded object list matches a recomp RAM dump of the live
  screen (`tools_py/rdr_tree.py` on a `PS2X_RDRAM_DUMP`, a PLAT-36 run), name for name.
- **Proven by:** PLAT-36 (the RDRAM dump).
- **Dependencies:** PLAT-02, PLAT-03, PLAT-04, PLAT-06. **Size:** L (about 13 object types, a decomp read each).
- **Unknowns:** the reader for MENU, LISTBOX, CHECKBOX, RADIOSTRIP, MAPCONTROL (locate each type string in
  `socom2_game.elf.strings.txt`, then its reader); how `Common_*` includes enter a dialog (loader near D:L275893). The
  MAPCONTROL dialogs (`dlg_Map*`) and the `Common_*` includes are used only by the future-scope group (MENU-16; MENU-03
  was ruled (a) on 2026-10-01): their readers are located and named here so PLAT-06's inventory is complete, but no
  MAPCONTROL widget is built.
- **Owner calls:** none.
- **Merged from:** platform PLAT-04; menus MENU-01.

### PLAT-06 -- The dialog inventory and flow graph (the next web research number)
- **Goal:** record the dialog inventory, its classification, the flow graph and every scratch-read fact other tasks
  stand on as a research note (numbered when it is committed: the next free web research number), backed by a fixture
  test that regenerates the tables from the disc (names only, no bytes).
- **What the original does (web R96 §0-§5, regenerated):** 110 READERC members (103 `dlg*`, 4 `Common_*`,
  `mp_rooms.rdr`, `UiParams.rdr`, `uisounds.rdr`); each zAnim archive has 95 set slots: UIZANIM names all 95, EXTZANIM
  2 (`dlgExitState.rdr` + a `UIanim.rdr`), MPZANIM 4 (`dlgMultiplayerRound/Final/FinalReally.rdr` + a `UIanim.rdr`), the
  rest empty `Anim_Set` slots; READERX holds `dlgExitState`, `dlgMultiplayerRound`, `dlgMultiplayerFinal`,
  `dlgMultiplayerFinalReally` (READERC holds them too; READERX's copies carry their animation source). Flow graph: boot
  -> dlgIntroScreen -> dlgIntroCinematic(sony448) -> dlgSecondCinematic(Intro_2) -> dlgMenu; dlgMenu's CROSS targets;
  options and extras sub-dialogs (R96 §0, §3). `dlgStickSetup.rdr` is referenced by `GoToStickSetup` (which nothing
  starts) and not on the disc; `dlgHype` is on the disc and named only by the switch handler `FUN_00365a00`
  (D:L262375-262460). The UI binding table has 207 rows (R96 §4).
- **Today:** web research 96 (`docs/research/96-the-dialog-inventory-and-flow-graph.md`) and its regenerating tool
  `tools/dump-dialogs.ts` (the pure half `tools/dialogInventory.ts`, the ELF by address `tools/elfImage.ts`), held by
  `tools/test/dialogInventoryDisc.test.ts` (dev-disc only) against `tools/test/dialogInventory.pinned.json` and by CI
  unit tests (`tools/test/dialogInventory.test.ts`). The rows once marked as scratch reads -- boot B15, B22; menus M1,
  M4, M5, M6 and the future-scope list; options O15, O18; online N3, N6, N7, N15; PLAT-05's TYPE tallies; PLAT-08's 207
  rows -- cite R96, corrected in place where the regenerated value differs (R96 §7). The card's `PersistentValves.rdr`
  is read with PLAT-27's TypeScript codec (`@s2u/card`; R96 §5), no longer through `tools_py/card_save.py`.
  **Corrected by R7 (2026-10-01):** PLAT-27 is dropped; its readers leave `@s2u/card` for a dev tool under `tools/`
  (R7's amendment 1, a sprint 6 follow-up, not a roadmap task), and this dev-host read goes through that tool. Until
  the follow-up lands it still reads through the merged codec in `@s2u/card`.
- **Gap:** the online chapter (R96 §9, ONL-33's); what R96 §8 leaves open (the archive a shared set comes from,
  `SET_RESOLUTION_READING`; which READERX copy loads; what `fn2` is).
- **Acceptance:** the test (dev-disc-only, skipped in CI) reproduces the 110-member list, the 95/2/4 set counts, the
  widget tallies, the binding-table row count and the reference graph; any change fails loudly; each row listed above
  is edited from "reading (scratch read)" to a citation of the note's section. The online dialogs' captions, commands,
  keyboards and UI vars are the note's online chapter, filled by ONL-33 under the same test.
- **Dependencies:** PLAT-03. **Size:** S (the readers exist; the scripts are short).
- **Unknowns:** none. **Owner calls:** none.
- **Merged from:** menus MENU-28.

### PLAT-07 -- The generic zAnim UI script runtime
- **Goal:** run any UIZANIM / EXTZANIM / MPZANIM animation set as the game's zAnim player does, for every screen.
- **What the original does:** control flow `FUN_0025e7a0`, `FUN_0025e6d0`, `FUN_0025e6a0`, `FUN_0025e960`,
  `FUN_0025e630`, `FUN_0025e600`, `FUN_0025e520`; WAIT `FUN_0025ed50`; motion `FUN_0025f9b0`/`FUN_0025fe70`; opacity
  `FUN_0025f880`; CALL `FUN_0025d5c0`/`FUN_0025d550`; VALVE `FUN_00353fd0` (web R95 §1.1-1.5). Set 0 commands 1..58 and
  VALVE 61; set 1 is `ui::UI_COMMAND` and `ui::UI_APP_COMMAND` (`FUN_0025bc20` D:L106861-106924). reCOM
  `zAnim/zanim.h` 463-481 (per-sequence PCs). Command counts across UIZANIM: SWITCHMENU 67, POPUPDIALOG 47,
  SuspendMenuInput 39, MENUFADER 26, VagStreaming 20, REBOOT 13, PREVIOUS_SCREEN 11.
- **Today:** s5 `viewer/src/uiScript.ts` (453 lines) implements the ARMORY subset {1,2,3,4,5,14,15,17,22,25,30,39,40,
  44,45,46,50,61}; `scene/src/uiZanim.ts` decodes payloads ("commands only -- payloads not decoded" for non-ARMORY sets,
  web R95 L697). Readings in force: `CONDITION_PRECEDENCE_READING`, `LOOP_YIELD_READING`,
  `CALL_ANIMATION_AT_ONCE_READING`, `ZANIM_RECALL_READING`. The runtime takes its valves from `@s2u/ui`'s `ValveStore`
  (web R104), not from `uiScript.ts`'s per-context map.
- **Gap:** the inventory of commands used by any set; the rest implemented; the readings retired by trace (PLAT-32);
  `uiScript.ts` moved into a package (PLAT-02). The runtime takes a host interface for UI commands (PLAT-08 fills it)
  and emits its own trace (PLAT-32 compares it); neither is a dependency.
- **Acceptance:** reading level (now): a vitest decodes all 95 UIZANIM sets plus EXTZANIM's and MPZANIM's and fails on
  an unimplemented command id (dev-disc-only, skipped in CI); unit tests transcribed from the cited decomp lines pin the
  control flow -- condition precedence from `FUN_0025e960`, WAIT from `FUN_0025ed50`, the VALVE ops from
  `FUN_00353fd0`, each test citing its lines (CI, synthetic sets); the main menu's ONSTART, drawn through PLAT-14,
  scored by PLAT-30 against the archived title-gate captures `logs/parity/gate/x51_gate_iop/title/s00..s18`. Proven
  level: script-trace goldens (PLAT-32) for the main menu, options and the ARMORY match the runtime's command order and
  valve values frame by frame.
- **Proven by:** PLAT-32.
- **Dependencies:** PLAT-05, PLAT-09. **Size:** L.
- **Unknowns:** the in-frame call order (`CALL_ANIMATION_AT_ONCE_READING`, "not traced") -- PLAT-32's trace; condition
  precedence -- a decomp read of `FUN_0025e960`.
- **Owner calls:** none here (PLAT-32 carries the tracing-flag call).
- **Merged from:** platform PLAT-05.

### PLAT-08 -- The UI command binding table and host interface
- **Goal:** every named UI command of the table at 0x3dd4d0 has a classified host entry in PLAT-07's host interface:
  implemented, stubbed with a cited return, or routed to the desktop-only screen (PLAT-28).
- **What the original does:** `{id,name,fn,fn2}` rows matched case-insensitively (`FUN_00198b80`); dispatch
  `FUN_002745a0` (D:L121344-121431); inside an IF the return value is the truth (web R95 §1.2). **207** named rows, read
  from `game/disc/socom2_game.elf` through its program headers (web R96 §4: `tools/elfImage.ts` `readBindingTable`, the
  names pinned by `tools/test/dialogInventoryDisc.test.ts`): row 207 is four zero words, where the dispatcher's walks
  stop (D:L121405, L121426); the ids run 1..208, **id 30 unused**. Web R95 §1.2's 208 counted the terminator, or the
  highest id.
- **Today:** s5 `uiScript.ts` `UiHost.command(name)`; `armoryState.ts` answers about 30 names. **Corrected
  2026-10-01 (PLAT-01's review):** the host's answer is `Armory.command` in s5 `armory.ts` (L250-272): ActivateButton,
  CharacterProfile and DoAllSelCharsHaveLockedEquip1-3, and true for every other name; `armoryState.ts` dispatches no
  command (it holds the logic the other names stand for). Its tests are `armory.test.ts` (ActivateButton) and
  `uiScript.test.ts` (the host's command calls).
- **Gap:** the extracted list of all rows (name, fn address), each classified: UI pure; valve/state; card; movie;
  music/stream; net/Medius (segment 05/06); mission (DEFERRED, campaign); system (REBOOT, RebootIOP, NetCnf*).
- **Acceptance:** a vitest reads the table from the ELF on the dev disc (skipped in CI) and asserts every row has a host
  entry; each implemented entry has a unit test citing its FUN and decomp lines; each stub cites the decomp line that
  shows its return value. The row count is settled: 207 (web R96 §4).
- **Dependencies:** PLAT-07. **Size:** L (the reading and classifying; implementations spread over the segments --
  the offline ones are MENU-01).
- **Unknowns:** what `fn2` is (11 rows carry one; `FUN_002745a0` calls only the word at +8, D:L121413-121421, and
  nothing in the decompilation reads +12 by name: web R96 §4, §8). 207 vs 208 is settled: 207 (web R96 §4).
- **Owner calls:** none here; the per-row desktop-only choices are PLAT-28's.
- **Merged from:** platform PLAT-06; menus MENU-04 (the table half; the offline implementations are MENU-01).

### PLAT-09 -- The valve store and UI variables
- **Goal:** one global valve namespace (u16 values, watchers) and the `CUIVarManager` variables shared across screens,
  with longevity, so the persisted subset (OPT-02, OPT-03) can be saved.
- **What the original does:** VALVE ops 0-18, `-=` floored at 0, watchers `FUN_003519f0` (web R95 §1.3); reCOM
  `zValve/`, `zUI/zui.h:27-52` (`CUIVariable`, `CUIVarManager`); `CUIVarManager_Serialize` writes only longevity-3 vars
  (`FUN_00385670` D:L279374-279400); `InitSystemTuners` (`FUN_0038a7a0` D:L282240-282480) registers tuner vars at
  longevity 2.
- **Today:** valves are per ARMORY context in s5 `uiScript.ts` / `armoryState.ts`. The global store is
  `packages/ui/src/valves.ts` (ops 0-18, watchers, the registry, the persistent valves) and `uiVars.ts` (256 slots,
  longevity, the serialize rule, `InitSystemTuners`); `uiScript.ts` differs from it on op 0, op 9, the operand's 16-bit
  mask and the watchers (web R104 §7).
- **Gap:** a global store with longevity; initial values per valve.
- **Acceptance:** reading level (now, CI): unit tests of VALVE ops 0-18 (including `-=` floored at 0) transcribed from
  `FUN_00353fd0` and of the watcher rule from `FUN_003519f0` (web R95 §1.3), and of the longevity-3 serialize rule from
  `FUN_00385670` (D:L279374-279400), each citing its lines; the store round-trips the persistent valves through OPT-02's
  codec (the count of 65 is a reading, O15; R7, 2026-10-01: OPT-02 keeps the valves as JSON in the card file's `data`,
  so "codec" here is that JSON, not a `PersistentValves.rdr` byte codec). Proven level: a script-trace golden (PLAT-32)
  shows the same valve values after the main menu's ONSTART.
- **Proven by:** PLAT-32.
- **Dependencies:** none. **Size:** M.
- **Unknowns:** where valve defaults come from (`UiParams.rdr`? code?) -- a decomp read of the valve registry init.
  **Answered (web R104 §6):** not `UiParams.rdr` (soft keyboards only) -- `RUN/READERC.ZAR` `global_valves.rdr` (185
  entries, 65 PERSIST: the count of 65 is that file's), each map's `mission.rdr` `Valves`, a few code writes, else 0.
  `InitSystemTuners` adds its vars at 1 and stores 2 over it (R104 §4). Left: the decompiler's dropped arguments and
  three behaviours not modelled (R104 §8-§9) -- PLAT-32's trace.
- **Owner calls:** none.
- **Merged from:** platform PLAT-07 (the persistent subset moved to OPT-02).

### PLAT-10 -- The screen and state manager
- **Goal:** one manager running the original's screen transitions, its history, popups, fades and the game-state
  boundaries (front end -> map load -> round -> final screens -> front end; the reboot).
- **What the original does:** SwitchMenu `FUN_0027e720` (D:L126556-126640) keeps a history stack (depth `DAT_004156fc`,
  entries `DAT_00415700`); `PREVIOUS_SCREEN` pops it; switches are queued 0x34-byte records (type 2 switch, 5 back).
  `FUN_00365a00` (D:L262375-262460) knows `LOAD_SCREEN`, `POP_TO_MENU_STATE`, `MENU_SCREEN`, `SHUTDOWN`, `REBOOT`
  (REBOOT -> `FUN_0022ed10`, the logoff relaunch). FlushMenuHistory 0x27c7f0, SetMenuState 0x27c9f0 (D:L125558),
  SetDefaultMenuScreen 0x278d60; PopUpDialog 0x27eb10, KillPopUp 0x27d190. Default dialog `dlgIntroScreen.rdr`
  (`CMenuState` ctor `FUN_001e7530` D:L47915-47960); `--menu_state <dlg>` picks the start dialog (`FUN_001eabd0`).
  Menu-state init `FUN_001f4860` (D:L54780+); `CMenuState_Tick/OnPop/UnInit` 0x1f4640/0x1f45e0/0x1f4440
  (D:L54706-54766). Leaving online: `LoadExecPS2("cdrom0:\SCUS_972.75;1", --menu_state, dlgAfterErrorReboot.rdr)` from
  0x22ED54 (PC research 78 §0; KNOWN [logoff-relaunch]). MENUFADER (e.g. 0 -> 0.99 in 0.5 s, web R95 §4.1).
- **Today:** `viewer/src/main.ts` (2,453 lines on this branch) orchestrates disc page, map, mode, online;
  `worldSwap.ts`; `features.ts`, `online.ts` mode flags; s5 `armory.ts` `openArmory`/`closeArmory`.
  *(Corrected 2026-10-02 at PLAT-10: the manager is `packages/ui/src/screens/` and the page's entry
  `packages/viewer/src/frontEnd.ts` (`?frontend`, beside the map viewer); where this block's reading differs from the
  decomp -- the queue's other types and order, the pop at queue time, `SetMenuState`, `SHUTDOWN`, MENUFADER's two
  fades -- is research 115 §10.)*
- **Gap:** the stack with history and fades; popups as focused overlays; front end <-> map load <-> round; a reboot
  equivalent that resets to the main menu with a start dialog; `CleanupMissionMemory`. A dialog's BACKGROUND TYPE MPEG
  is a layer the manager calls through an interface (PLAT-21 fills it); until it lands the layer is drawn black and
  PLAT-30 scores the screen with the background region masked. Input (PLAT-11) plugs in after this task.
- **Acceptance:** reading level (now): unit tests transcribed from `FUN_0027e720` (D:L126556-126640: the queued
  0x34-byte records, type 2 switch and 5 back, the history depth `DAT_004156fc` and entries `DAT_00415700`) and from
  `FUN_00365a00`'s switch cases (D:L262375-262460); the archived captures -- the title gate s00..s18
  (`logs/parity/gate/x51_gate_iop/title/`) and `logs/parity/runs/options_explore/` -- scored by PLAT-30 >= 90 with the
  masked-background rule. Proven level: a scripted-input transcript (button, frame) replayed in the recomp with
  `PS2X_CALL_TRACE=0x27e720:UISwitchMenu,0x27eb10:UIPopUpDialog,0x27d190:UIKillPopUp` (a PLAT-36 run) and in SOCOM Legacy
  gives the same ordered list of switch targets, history pops and popups; the logoff path lands like
  `logs/parity/s17_q2_logoff/online1/final.png`.
- **Proven by:** PLAT-36 (the call trace); PLAT-32.
- **Dependencies:** PLAT-05, PLAT-07, PLAT-08. **Size:** L.
- **Unknowns:** history semantics of PREVIOUS_SCREEN and FlushMenuHistory (which screens push) -- a read of
  `FUN_0027e720`; MENUFADER duration and curve -- decode `uianim.rdr` with `decodeUiSet` plus a PCSX2 5-fps burst.
- **Owner calls:** whether the map viewer and fly mode survive as a separate entry beside the front end (README "map
  viewer").
- **Merged from:** platform PLAT-08; menus MENU-03.

### PLAT-11 -- Input for menus (pad, keyboard, touch, browser gamepad)
- **Goal:** pad, keyboard and touch drive the menus as PS2 buttons with the game's own focus, repeat and suspend rules.
- **What the original does:** BUTTON bindings per control (CROSS 330, TRIANGLE 137, DOWN 89, UP 88, LEFT/RIGHT 82,
  SQUARE 76, TRIGGER_L1/L2 41, CIRCLE 22, TRIGGER_R1 7, BUTTON_EXECUTE 6, START 5, SELECT 2; plus TRIGGER entries);
  `SuspendMenuInput(seconds)` 0x277220 (D:L122805; values 0.75/1.75/2.0/3.0 in name tables); NOSELECT/PADHOG
  (D:L275975-275979); ACCEL; `CInput::Flush` at state init (reCOM `src/Apps/FTS/state/st_menu.cpp`); the pad reader
  `FUN_002da930` (PC research 08); USBKBD_ENTER on soft keyboards.
- **Today:** `viewer/src/gamepad.ts` (453; W3C standard mapping, dead zone 0.15), `controlsList.ts`, `touch.ts`; s5
  `armory.ts:68` keys (Backspace = TRIANGLE, R = CIRCLE, V = SQUARE; Esc reserved).
- **Gap:** a menu input layer separate from the walk; default focus movement; held-button auto-repeat; ACCEL; the stick
  in menus (if the game does it); a keyboard map; touch hit-testing on dialog controls.
- **Acceptance:** for `dlgOptions_Menu` (whose buttons bind no UP/DOWN) recorded presses move focus identically on
  PCSX2 and SOCOM Legacy (capture per press >= 90); a 60-fps capture holding DOWN 2 s on the main menu matches PCSX2 by
  the frame index of each focus change; repeat delay and rate unit-pinned to the decomp's values once read.
- **Proven by:** OPT-19 (the PCSX2 focus walk and the 60-fps DOWN burst).
- **Dependencies:** PLAT-07, PLAT-10. **Size:** M.
- **Unknowns:** the default focus-navigation code for controls without UP/DOWN bindings (start at `CMenuState_Tick`
  0x1f4640 and the ONFOCUS uses at D:L50363, L54553, L262601); d-pad auto-repeat on sliders and lists (PCSX2 10-fps
  burst); SELECT and BUTTON_EXECUTE semantics (decomp); whether the left stick navigates (decomp around
  `FUN_002da930`'s consumers).
- **Owner calls:** the keyboard bindings for menus (the original has none beyond the USB keyboard on soft keyboards;
  the ARMORY's keys are a precedent).
  *(Corrected 2026-10-02, PLAT-11, web R116 §2.3, §9, §16:)* the BUTTON tally is CROSS 331 and TRIANGLE 138 over
  every record; ACCEL is the MAPCONTROL's `PAN` (MENU-16), not a menu repeat; the only held repeat is the LISTBOX's
  and the SLIDERBAR's (0.4 s, then every tick), so the main menu's held DOWN moves once; the owner's default 1 is
  built as `MENU_KEYS_READING`. Today: `packages/ui/src/input/`, `packages/viewer/src/menuInput.ts` (PLAT-11).
- **Merged from:** platform PLAT-09; menus MENU-06.

### PLAT-12 -- The front-end frame clock
- **Goal:** one clock stepping scripts, movies and fades at the original's rates, independent of the display refresh.
- **What the original does:** shell tick at 60 Hz (`FUN_00366940`, PC research 09); movies at 30 or 29.97 fps (PC
  research 09, 16); WHILE/LOOP yield per frame (`LOOP_YIELD_READING`); motions linear in dt (web R95 §1.5).
- **Today:** s5 `uiScript.ts` is pure (`step(dt)`); the walk sim has its own tick (`sim.ts`).
- **Gap:** a fixed UI tick with interpolation; behaviour when the tab is hidden; movie PTS pacing.
- **Acceptance:** a unit test drives 600 ticks and a 0.5 s MENUFADER reaches 0.99 at tick 30; script-trace goldens
  (PLAT-32) align by frame index.
- **Dependencies:** PLAT-07. **Size:** S.
- **Unknowns:** 60 Hz or the NTSC field rate 59.94 -- a recomp VBlank count over a scripted WAIT (PLAT-36).
- **Owner calls:** none.
- **Merged from:** platform PLAT-22.

### PLAT-13 -- UI text rendering (fonts, glow, colour states, teletype)
- **Goal:** draw every caption exactly as the console does.
- **What the original does:** `fonts.rdr` has `font_titlebar_01` and `font_text_01`; `font_special_01` is texture 2 of
  `font_text_01` (18 pad glyphs, own colour (150,150,150), no shadow; R95.11, R95.15); TEXT_GLOW, TEXT_COLOR,
  ACTIVE/PRESSED/NORMAL_COLOR, HCENTERED, RIGHT_JUSTIFIED, SCALE (reCOM `zui.h:74-82`); TELETYPE ops 4-7
  (`FUN_00378460`, web R95 §1.2); TICKERTAPETEXT scrollSpeed.
- **Today:** `scene/src/uiFont.ts` (120), `viewer/src/hudFont.ts`, s5 `armoryText.ts` (teletype, `.TYPE` sound).
- **Gap:** glow, the colour states, the full glyph set (UTF-8 mapped), ticker tape, wrapped-text rules, coverage of
  every non-ARMORY dialog.
- **Acceptance:** per-face glyph metrics unit-tested against `fonts.rdr`; caption crops compared to console frames
  (`scripts/parity/refs/refs.json` boxes for login, universe, persona, eula, rooms, write_down, save_card, card_slot)
  at the existing threshold 8.0; every caption id in the offline and options dialogs resolves (PLAT-04).
- **Dependencies:** PLAT-04, PLAT-05. **Size:** M.
- **Unknowns:** the TEXT_GLOW algorithm -- the decomp text-draw path plus a console crop.
- **Owner calls:** none.
- **Merged from:** platform PLAT-11; menus MENU-07 (fonts half).

### PLAT-14 -- The 2D UI compositor at 640x448
- **Goal:** draw a screen's objects (bitmaps, text, 3D model previews, fader, movie background) in the game's order
  and blend.
- **What the original does:** child positions are relative (web R95 §2.1); 2D bitmaps are stored bottom row first
  (`flipRows`, R95 §5.2); the UI world root lights model previews (`UI.ZED`: one directional light plus ambient 0.557;
  R95 §5.1); MENUFADER is an opacity layer; VU1 entry 0 is the UI path (PC research 12). Console frames are 4:3
  letterboxed in PCSX2's 640x448 window (factor 0.933, 21 px bars); ours are pixel-exact (KNOWN [online-7pct]).
- **Today:** s5 `armoryView.ts` (343) plus `armoryLayout.ts`; the page's stretched 640x448 presentation.
- **Gap:** a general compositor; draw order across objects and popups; the fader; the MPEG background layer (PLAT-21).
- **Acceptance:** full-screen score >= 90 against PCSX2 menu frames (`scripts/parity/refs/main_menu.png`,
  `lobby/title_create_game.pcsx2.png`, the owner's `orig-armory-*.png`) with the 4:3 correction.
- **Dependencies:** PLAT-05, PLAT-13. **Size:** M.
- **Unknowns:** the draw-order rule (object list order or a z field) -- a decomp read of the dialog draw; the UI camera
  record (144 B, `UI_CAMERA_READING`, R95 §5.1).
- **Owner calls:** none.
- **Merged from:** platform PLAT-12.

### PLAT-15 -- The widget set (the non-ARMORY widget types)
- **Goal:** draw and drive BUTTON, TEXT, IMAGE, WRAPPEDTEXT, CHECKBOX, RADIOSTRIP, SLIDERBAR, LISTBOX, PERMANENT,
  SECURETEXT, PROGRESSBAR, COUNTER (and MPEG via PLAT-21) exactly as the rdr specifies.
- **What the original does:** factories `FUN_00382070` / `FUN_00382890` (D:L277596-278185). Per-state SPEC blocks
  NORMAL/ACTIVE/PRESSED/DISABLED with TEXT_COLOR, TEXT_GLOW RANGE/TIME, SCALE, IMAGE (e.g. `dlgMenu`: NORMAL scale 0.6,
  ACTIVE 0.75 with glow 0.3-1 over 0.8 s, PRESSED colour (255,74,8)). LISTBOX keys PRESSED/NORMAL/ACTIVE_COLOR,
  NOSELECT, PADHOG, SPACING, margins, COLUMNS. Class op handlers: list `FUN_00373640`, scroll `FUN_00379970`, SetValue
  `FUN_00372870`, Selection `FUN_00371290`, base `FUN_0036fcc0` (D:L268005-268080) (web R95 §1.2). CLOCK,
  SCROLLINGTEXT and HANDLERBUTTON are never used by any dialog.
- **Today:** the ARMORY draws IMAGE/TEXT/TELETYPE and its buttons (s5 `armoryLayout.ts`, `armoryView.ts`); no checkbox,
  radio strip, slider or list box.
- **Gap:** a widget library driven by PLAT-05's records.
- **Acceptance:** for each offline dialog (segments 03, 04) a 640x448 capture scores >= 90 against PCSX2's capture of
  the same state (PLAT-30, with the 4:3 correction); the ACTIVE glow sampled at 5 fps matches PCSX2's as a curve.
- **Dependencies:** PLAT-05, PLAT-13, PLAT-14. **Size:** L (eight classes, four states each).
- **Unknowns:** SLIDERBAR value->pixel mapping and step (about 5 px per press measured over a 290 px track,
  `scripts/parity/music_only_mission.txt` header; rdr `NUM_INTERVALS` reads 2, which does not fit) -- read
  `FUN_00382890`'s SLIDERBAR branch from D:L277921.
  *(Corrected 2026-10-02, PLAT-15, web R117 §4, §8, §13:)* the SLIDERBAR step is `NUM_INTERVALS` **per cent** of the
  track per press (`FUN_00371d00`, 0.01f x 2): 5.8 px on the 290-px track, 50 presses from full to empty, which fits
  the PCSX2 frames; the "class op handlers" above are the classes' command-name lookups (+0x68), `FUN_00379970` being
  WRAPPEDTEXT's; `dlgMenu`'s `TIME 0.8` is half of a 1.6-s glow cycle. Today: `packages/ui/src/widgets/` (PLAT-15).
- **Owner calls:** none.
- **Merged from:** menus MENU-02.

### PLAT-16 -- Popup dialogs
- **Goal:** the game's modal popup (text, buttons, default selection, KillPopUp) for every use.
- **What the original does:** POPUPDIALOG/POPUP with `popupOp.tif`, `active_back.tif`, `pop_butt.tif`, valve
  AreYouSure; the 236-byte POPUP node with the text id at +18 and button records (web R95 §1.2); the logoff popup opens
  with NO selected and LEFT selects YES (PC research 78 §0); `UIPopUpDialog` 0x27eb10 (D:L126642).
- **Today:** the ARMORY's confirm/countdown popups (s5 `armory.ts`, web R95.7); the record layout is still a reading
  (`ARMORY_POPUP_LAYOUT_READING`).
- **Gap:** a general component and the reading settled.
- **Acceptance:** each popup instance captured on PCSX2 vs SOCOM Legacy scores >= 90; the default button matches;
  PopUpDialog/KillPopUp order matches the recomp trace (PLAT-10's; the proven level).
- **Proven by:** PLAT-36 (the call trace); OPT-19 and ONL-32 (the popup captures).
- **Dependencies:** PLAT-15, PLAT-08. **Size:** M.
- **Unknowns:** the full record beyond the text id -- read `UIPopUpDialog` (D:L126642).
  *(Corrected 2026-10-02, PLAT-16, web R118 §2, §12:)* the record is read by the popup's command handler
  `FUN_0036da20` (D:L266787-267160), not by `UIPopUpDialog`, which only shows the node and plays `.METAL`; the 236-byte
  node command is a 16-byte header and a 220-byte record, read whole. Today: `packages/ui/src/popup/` (PLAT-16).
- **Owner calls:** none.
- **Merged from:** menus MENU-05.

### PLAT-17 -- The software keyboard (`UiParams.rdr`)
- **Goal:** the game's on-screen keyboards (names, passwords, hometown, game name, chat, clan, SOP, taunt, code entry)
  drawn and driven as the original.
- **What the original does:** `UiParams.rdr` = CommonSoftKeyboardProps (repeat delay/speeds, sounds, UsbKbdOnIcon,
  Legend) + 12 SoftKeyboards; `GetTextInput` 0x2808d0 (PC research 38 also names `FUN_0038d770`);
  ON_SKB_APPLY/APPLY2/CANCEL; USBKBD_ENTER; `anon_zui_skb_CSkbKeyProps_SetButtonState` 0x38b250 (D:L282581); the
  `UISK_TXR` library. Name cap 14, password cap 12 (`SkbName=CREATEPLAYERNAME`); chat `ChatSkb`/`PlayerChatSkb`, 63
  characters, the login grid plus a row (accent, space, MESSAGE, IGNORE, LEGEND) (PC research 38 rows 19-21; PC
  research 66 §1, §3). Modes normal/accent (PC research 28 §6). Console frames `logs/parity/s4_pcsx2/A_37_namekbd.png`,
  `A_38_named.png`, `A_39_pw.png`; refs `scripts/parity/ref_osk_normal.png`, `ref_osk_accent.png`.
- **Today:** none (`main.ts:1104-1114` keeps an MP name from a plain HTML input).
- **Gap:** the whole widget, all 12 layouts.
- **Acceptance:** each of the 12 layouts opened on PCSX2/recomp and SOCOM Legacy scores >= 90 (recomp references
  `03_name.png`, `04_pw_kbd.png`, `A_chat_01_open.png`); typed strings read back equal (the `login_name_glyphs` method,
  PC research 80-online-menus §3; the key-walk model as in `tools_py/tests/test_chat_round.py`).
- **Dependencies:** PLAT-05, PLAT-07, PLAT-11, PLAT-15. **Size:** M.
- **Unknowns:** whether the keyboard is a dialog or code-drawn (PC research 38 plus the decomp); the clan-name and
  message keyboards' layouts and caps (recomp captures, ONL-32).
  *(Corrected 2026-10-02, PLAT-17, web R119.2, R119.4, §14:)* both answered by reading: the keyboard is code-drawn over
  the screen (`AllSkbsRoot`), not a dialog; the clan name is typed on `MPPLAYERNAME` (13 / 31) and the clan message on
  `ChatSkb` (199 / 199) -- `ClanSkb`/`ClanSkb2` are named by no call. The chat row is the same 7 x 15 grid, not a row
  more, and `GetTextInput` has no initial-text or secure-entry argument. Today: `packages/ui/src/keyboard/` and
  `packages/viewer/src/softKeyboardKeys.ts` (PLAT-17); the 12 layouts' scores are owed (research 119 §14).
- **Owner calls:** whether a physical keyboard may type directly.
- **Merged from:** platform PLAT-10; menus MENU-25; online front end ONL-07.

## C. Movies

### PLAT-18 -- PSS demux (MPEG program stream, video plus SShd PCM)
- **Goal:** split any disc PSS into the MPEG-2 video elementary stream with timestamps and its PCM track, streaming
  from the ISO by range.
- **What the original does:** video PES 0xE0; private stream 1 (0xBD) audio behind a 4-byte substream header and an
  `SShd` header (type 1, 48000 Hz, 2 ch, interleave 0x200: 16-bit LE PCM in 512-byte L/R blocks); packets of 4073 or
  4059 B, so the sample grid is the stream's (PC research 32 §7.1 L199-212). The game reads 16 KB per demux call
  (`sceCdStRead`, PC research 09 L22-25). 69 PSS files on the disc.
- **Today:** `isoAssetSource.ts` range reads; no demuxer.
- **Gap:** a TypeScript PS demuxer and SShd parser.
- **Acceptance:** for all 69 PSS files the demuxed video ES is byte-identical to
  `ffmpeg -i X.PSS -map 0:v -c copy -f mpeg2video`; the concatenated audio payload (header stripped) is byte-identical
  to the method that produced `logs/title_disc_audio.bin` (PC research 32 §7.1 "Method"); picture counts SONY448 310,
  INTRO_2 3836, MENULOOP 3790. These read the disc and ffmpeg: dev-disc-only, skipped in CI; CI runs the demuxer on a
  synthetic two-packet program stream built inside the test (no disc bytes).
  *(Corrected 2026-10-01, PLAT-18, web R109 §4:)* MENULOOP has **3732** pictures (ffprobe `-count_frames`, the stream
  copy's picture start codes and the demuxer agree; 124.40 s at 30 fps), not PC research 09 L45's 3790. All 69 videos
  are byte-equal to the stream copy; `title_disc_audio.bin` is SONY448's whole track then INTRO_2's head (R109.6).
  Every track is SShd type 1 (PCM): no ADPCM on the disc (R109.4); the header's words at bytes 24-31 stay unknown and
  unread by the game (R109.5).
- **Dependencies:** PLAT-02, PLAT-03. **Size:** S.
- **Unknowns:** the 40-byte SShd header beyond type/rate/channels/interleave (PC research 32 fault 3) -- a hex read with
  the repo's tools; whether any PSS carries ADPCM rather than PCM -- a header scan of the COMMON/INTRO files (R3 names
  both, PS2 ADPCM or PCM in the private stream; either goes to `packages/sound` through PLAT-20). This demuxer is ours
  under either decoder R3 allows: FFmpeg's `.pss` audio support is incomplete (<https://trac.ffmpeg.org/ticket/4478>).
- **Owner calls:** none.
- **Merged from:** boot BOOT-04; platform PLAT-13 (demux part), PLAT-14 (unknown).

### PLAT-19a -- MPEG-2 in the browser: the libmpeg2 -> WebAssembly spike, validated frame-exact
- **Goal:** prove the ruled decoder before PLAT-19b builds on it: libmpeg2 compiled to WebAssembly decodes the disc's
  PSS video frame-exact against the reference, at a recorded size, under a compatible licence; or, if it fails, the
  fallback is measured the same way. The record states the result and what PLAT-19b inherits.
- **What the original does:** the IPU decodes macroblocks; the game uploads each picture as 16-px column strips
  (`FUN_0030b770`, PC research 09 L40-44, D:L208853). INTRO_2: 640x448, 29.97 fps, 3836 pictures, a baked 16-px
  letterbox (PC research 16 §0); MENULOOP: 30 fps (code 5), 3732 pictures (124.40 s) (web research 109). [Corrected 2026-10-02 at PLAT-18's merge: said 3790 (~126 s), PC research 09's figure; the demuxer and ffmpeg's copy count 3732 (web research 109).] The recomp
  uses an FFmpeg-backed sceMpeg HLE (`third_party/ps2recomp/ps2xRuntime/src/lib/Kernel/Stubs/MPEG.cpp`, FFmpeg 7.1), so
  under the HLE the IPU is never programmed (PC research 09 L10-13); PCSX2, which emulates the IPU, is the reference for
  the colour conversion.
- **The ruling (the owner, 2026-10-01, R3; the controller's research):** an open-source MPEG-2 decoder, decoding
  **client-side from the player's own ISO** -- no movie bytes ever shipped or pre-transcoded by us, save the setup page's background video, the owner's exception
  (OT.R34, 2026-10-04) ("no game data in
  git"; [`../DATA_SOURCES.md`](../DATA_SOURCES.md), "The stance").
  - **Licence:** the project is GPL-3.0 (`package.json` `"license": "GPL-3.0"`), so GPL-2.0-or-later libmpeg2 and
    LGPL-2.1+ FFmpeg are both compatible. MPEG-2's patents expired in February 2018 everywhere but Malaysia and the
    Philippines (<https://libmpeg2.sourceforge.io/>).
  - **Choice (1): libmpeg2 compiled to WebAssembly with Emscripten** -- small, main-profile conformant (PS2 PSS video is
    main profile), C with generic (non-SIMD) fallbacks (<https://libmpeg2.sourceforge.io/>). We write the PSS (MPEG
    program stream) demuxer in TypeScript (PLAT-18) and route its audio -- PS2 ADPCM or PCM in a private stream --
    through our existing sound package (`packages/sound`; PLAT-20).
  - **Fallback (2): a minimal LGPL FFmpeg wasm build** -- `--disable-everything` plus the `mpeg2video` decoder and the
    `mpegps` demuxer, `--enable-small`; community builds report a few MB
    (<https://github.com/ffmpegwasm/ffmpeg.wasm/issues/866>). FFmpeg's `.pss` support is incomplete for the audio
    (<https://trac.ffmpeg.org/ticket/4478>), so PLAT-18's demuxer stays ours under either choice.
  - **Not chosen:** (3) wasmpeg (LGPL, ~3.2 MB gzipped, WebGPU-accelerated FFmpeg; <https://github.com/wasmpeg/wasmpeg>)
    -- heavier; JSMpeg and pl_mpeg -- MPEG-1 only, they do not fit; WebCodecs -- no MPEG-2 in its codec registry.
- **Today:** the harness's compare and its pure pieces (`tools/fmv-spike.ts`, `tools/fmvPlanes.ts`: the plane
  compare, the IPU's conversion, the extra-black-block check) and the libavcodec reference side; item 3 settled on
  libavcodec's samples and on libmpeg2's -- the IPU's conversion (research 98 §7.4). **The spike passes** (research 98
  §7.1): `packages/fmv/wasm/` builds libmpeg2 0.5.1 (Debian's orig tarball, sha256 pinned) to an 85,001 B wasm
  (23,687 B gzipped, no JS glue) [corrected after review: 84,777 / 23,583, the first build]; every coded picture
  displayed once and in order (by the decoder's picture tags against the start codes) on SONY448's 310 and the first 300 of INTRO_2 and
  MENULOOP, 0 extra black blocks (§7.8); samples within max 3 / per-picture mean 0.015 of libavcodec's, a difference
  attributed to the two IDCTs, not proven (§7.9); 0.44-0.93 ms per picture in Node (§7.10) [corrected after review:
  said "the IDCT's difference" and 0.4-0.75 ms, the first build's runs]. [Corrected 2026-10-01: this said "nothing in redotcom",
  then "the libmpeg2 build ... is owed: its source was unreachable at every allowed URL".] `landing` played a transcoded `menuloop.mp4` (that workspace was retired by OT.R30; the citation below is historical)
  (`landing/src/claims.test.ts:8,30`) -- a precedent of the landing page, not of the port, which R3 rules out.
- **Gap:** the Emscripten build of libmpeg2 (pinned source, its licence file, the build flags in the tree); a Node
  harness that feeds it the video ES; the comparison; the record.
- **Acceptance (the spike's; dev-disc-only, since it reads the disc and ffmpeg):**
  1. **Frame-exact sequence:** for SONY448 (all 310 pictures) and the first 300 pictures of INTRO_2 and MENULOOP, the
     wasm decoder outputs the same number of pictures in the same display order as libavcodec's `mpeg2video` (the
     recomp's decoder, FFmpeg 7.1) and the recomp's `PS2X_MPEG_TRACE` picture count (PC research 09 L76-80: sony448
     ends at 310) -- no picture dropped, repeated or reordered; and 0 pictures with extra black 16x16 blocks
     (`tools_py/parity/movie_blocks.py`'s logic, PC research 16).
  2. **Samples:** per picture, the YCbCr planes against libavcodec's: hash-equal, or the maximum and mean absolute
     difference recorded (both are IEEE 1180-conformant IDCTs, not bit-identical by contract); that bound is the
     epsilon PLAT-19b inherits.
  3. **The IPU reference:** the pictures behind the archived PCSX2 movie frames (`logs/parity/pcsx2_mission_a/s02..s04`
     for SONY448, golden s07 for MENULOOP; PC research 09: ours 98.8) converted by the IPU's colour conversion and by
     ffmpeg's BT.601 rgb24, each scored against the PCSX2 frame by the title gate's scorer; the conversion that scores
     higher is the one PLAT-19b implements, with both numbers in the record.
  4. **Size:** the wasm and its glue, raw and gzipped, recorded for PLAT-19c and PLAT-29a's table.

  CI: none (no disc bytes in the tree); the record and the build script are committed, the pictures and hashes are not.
  **Fail rule:** if (1) or (2) fails for libmpeg2, the same harness runs fallback (2), and the record names the one
  that passes; PLAT-19b is dispatched only on a passing record.
- **Dependencies:** none. **Size:** M (an Emscripten build, a Node harness and one comparison; the spike reads the ES
  with `ffmpeg -map 0:v -c copy` until PLAT-18's demuxer lands).
- **Unknowns:** the IPU colour-conversion matrix and rounding (the PS2's fixed-point CSC; the coefficients from PCSX2's
  IPU source or the EE user's manual) -- read for (3) -- **settled 2026-10-01** (research 98 §7.4: PCSX2's
  `yuv2rgb_reference` integers; they reproduce the PCSX2 captures where BT.601 does not, and score the higher on the
  gate's scorer, 83.9 vs 83.3 on golden s07, a tie at 100.0 on SONY448); libmpeg2's samples against libavcodec's and
  the wasm size -- **settled 2026-10-01** (research 98 §7.9, §7.10; they were "owed on the source"); still open:
  FFmpeg 8.1 against the recomp's 7.1 (§7.3), the epsilon past INTRO_2's first 300 pictures (§7.6), libmpeg2's wasm
  decode cost in the page (PLAT-19c).
- **Owner calls:** **ruled** (R3, 2026-10-01): the decoder (libmpeg2 -> wasm, FFmpeg wasm as the fallback), the licence
  (GPL-3.0-compatible), decoding the player's disc in the page (no pre-transcoding). Its weight in the 30 s budget is
  settled with PLAT-29a's table in PLAT-19c.
- **Merged from:** boot BOOT-05; platform PLAT-13; menus MENU-09 (owner call). Split from PLAT-19 on 2026-10-01;
  rewritten to R3's choice the same day (it was a no-build decision spike, S).

### PLAT-19b -- The MPEG-2 decoder in the page
- **Goal:** decode the disc's 640x448 MPEG-2 Main-profile movies in a worker, from the player's own ISO -- every
  picture once and in order, its samples within PLAT-19a's epsilon of libavcodec's -- uploaded as a texture.
  [Corrected 2026-10-01 after PLAT-19a's review: said "picture-exact"; libmpeg2 and libavcodec are not bit-identical
  (web research 98 §7.9).]
- **What the original does:** as PLAT-19a.
- **Today:** none.
- **Gap:** PLAT-19a's passing decoder (libmpeg2 -> wasm by R3, or the FFmpeg fallback its record names) in a Web
  Worker fed by PLAT-18's demuxer from ranged ISO reads; the colour conversion PLAT-19a's record chose; the texture
  upload; the wasm shipped with its licence text and source offer (GPL: the decoder is ours to ship, the movies are
  not).
- **Acceptance:** dev-disc-only (skipped in CI): for every picture of SONY448, INTRO_2 and MENULOOP, the browser decode
  against ffmpeg's offline decode: the same picture count and order, 0 pictures with extra black 16x16 blocks
  (`tools_py/parity/movie_blocks.py` logic), every coded picture displayed once in the standard's order (PLAT-19a's
  tag check, web research 98 §7.8), and the per-picture difference within the epsilon PLAT-19a records: at most 3 per
  sample and a per-picture mean of at most 0.015 in every plane (research 98 §7.1), against libavcodec's decode made at
  test time from the player's own disc -- not against a committed list of hashes (no disc-derived hashes in git, and
  only 1 of 300 and 0 of 300 pictures are hash-equal on INTRO_2 and MENULOOP). The epsilon is measured on INTRO_2's
  first 300 pictures only (research 98 §7.6); this task's full-movie run measures the rest and may raise the bound,
  saying so in research 98. [Corrected 2026-10-01 after PLAT-19a's review: said "per-picture hashes against a
  reference list generated by `tools_py`".] CI: the worker's interface on
  a synthetic stream; a check that no `.pss`, `.m2v` or transcoded movie file is in the build output.
  *(Corrected 2026-10-02, PLAT-19b, web research 120 §8:)* measured on the whole movies, the bound is 5 per sample and
  0.021 per-picture mean (INTRO_2 picture 1284 Cr, picture 2247 Y; raised in research 98 §7.11); count, order and the
  tag check hold on all three. The extra-black count is 87 INTRO_2 and 9 MENULOOP pictures, every flagged block within
  1 sample of libavcodec's at the black level (libavcodec's own `faani` decode flags as many); the test fails on a
  lost block (black in ours where libavcodec's RGB max exceeds the black-level flip, `BLACK_FLIP_RGB_READING` = 1; corrected
  after review from "beyond the sample bound", which the bound already failed) and logs the strict count -- a reading
  of "0 pictures with extra black blocks", which no non-bit-exact decoder meets to the letter: the controller's ruling
  to record at merge. The browser decode is byte-identical to the Node core's.
- **Dependencies:** PLAT-18, PLAT-19a. **Size:** L (the worker, the pacing hand-off and the texture path, bounded by
  PLAT-19a's record).
- **Unknowns:** none beyond PLAT-19a's.
- **Owner calls:** none (R3 ruled PLAT-19a's).
- **Merged from:** platform PLAT-19 (the decode half).

### PLAT-19c -- Movie decode in real time, and its budget
- **Goal:** the decoder sustains the movies' rates on the owner's machine and its cost is counted in the load budget.
- **What the original does:** INTRO_2 at 29.97 fps, MENULOOP at 30 fps (PC research 09 L46; 16 §0).
- **Today:** *(2026-10-02, PLAT-19c, web research 120 §11)* the worker's stream as PLAT-21's picture source and the
  per-movie budget (`packages/fmv/src/realtime.ts`), the cost per picture carried from the worker
  (`decodeStream.ts`, `decodeProtocol.ts`, `movieWorker.ts`), the page's real-time player
  (`packages/viewer/src/movieRealtime.ts`) and its browser run (`packages/viewer/e2e/movieRealtime.spec.ts`). On the
  dev host, headless: SONY448, INTRO_2 and MENULOOP at the 29.97 Hz tick, every picture once and in order, 0 dropped
  and 0 repeated in every run; late ticks INTRO_2 0, 0, 1, 2, 0, 0 over six runs, the others 0 (a host stall of about
  40 ms can miss a tick: the spec holds a stated tolerance, and 0 with `SUSTAINED=1`); 2.3-3.2 ms a picture; start-up
  82-97 ms, one tick behind the console's (`MOVIE_FIRST_PICTURE_TICK_READING`, owed to BOOT-04); the size and start-up
  in research 100 §5. The original's rule for a slow host (the frame stalls, nothing dropped) is research 121's
  `MOVIE_PICTURE_LATE_READING`. Owed: the menu-with-movie frame against golden s07 (manifest row `menu.main`; the
  menu's own bitmaps and glyphs are not drawn yet, MENU-02a), and a headed `SUSTAINED=1` run on the owner's machine.
  [Was: "none".] [Corrected 2026-10-02 after PLAT-19c's review: said "0 late ticks and 0 dropped in two runs".]
  *(2026-10-03, MOVIE-WIRE, research 120 §11's dated paragraph)* connected in the front end: `mountFrontEnd` hands the
  session the worker source over the served tree and the drawer its pictures (`packages/viewer/src/frontEndMovies.ts`);
  the opener's SONY448 and INTRO_2 and `dlgMenu`'s MENULOOP drawn from the disc (`packages/viewer/e2e/openerMovies.spec.ts`:
  none dropped or repeated; late ticks SONY448 0-1, INTRO_2 4 in its first 257 pictures, MENULOOP 2; start-up 2-10
  ticks in the front end). [It read: "the front end draws its movie black".]
- **Gap:** pacing, the decode cost measured, the wasm size (PLAT-19a's record) and start-up counted.
- **Acceptance:** 29.97/30 fps sustained with 0 dropped pictures over INTRO_2 on the owner's machine; the decoder's
  size and start-up time logged into PLAT-29a's table; the menu-with-movie frame >= 90 against golden s07 (PC research
  09: ours 98.8). Dev-host only.
- **Dependencies:** PLAT-19b, PLAT-29a. **Size:** M.
- **Unknowns:** the decode cost at 640x448 in wasm -- measured here; if libmpeg2's generic C path cannot hold 30 fps,
  wasm SIMD build flags, then the record's fallback, are measured before any other change.
- **Owner calls:** the decoder's weight in the 30 s budget (with PLAT-29b's threshold).
- **Merged from:** platform PLAT-19 (the performance half).

### PLAT-20 -- Movie audio and A/V sync
- **Goal:** play a movie's PCM track (the title music is MENULOOP's) in sync with the pictures, at the original's
  level.
- **What the original does:** callback `FUN_0030aca0` -> a 48 KB staging ring -> the 989snd PCM ring (24 KB at
  0xA0000), ~6.4 KB per picture, 192 KB/s; `snd_PcmStreamOpen(0x6000, 0, vol 0x366, 0, 2, 2)` (PC research 32 §7,
  §7.1). Three CD streams: logos (LBN 0xcdade, "seven seconds of logos"), the intro, the title loop (0xce5bf).
- **Today:** *(2026-10-03, MOVIE-WIRE, research 137 §5's dated paragraph)* the track's decode
  (`packages/sound/src/moviePcm.ts`), the original's audio path and sync rule (`packages/fmv/src/movieAudio.ts`) and the
  page's player and reader (`packages/viewer/src/movieSound.ts`; PLAT-20, 2026-10-02, research 137) are connected in the
  front end: each movie the front end's movie host opens has its track read (`readMovieSound`) into a `MovieSound` on
  the front end's own audio (`webAudioMovieOut`), started with picture 0, joining in sync at the first gesture (H74)
  (`packages/viewer/src/frontEndMovies.ts`); measured headless, not heard. Owed: the cross-correlation and the level
  (the acceptance below), the owner's ear (H74), the getter on `audio.ts`'s context (research 137 §7). [It read:
  "`packages/sound` plays VAG banks through WebAudio; no stream path."]
- **Gap:** a WebAudio PCM stream fed from PLAT-18, clocked against picture PTS, played through `packages/sound` (R3:
  the movie audio goes through our existing sound package, not the decoder); a PS2 ADPCM path if PLAT-18's scan finds
  one; the 0x366 volume mapping.
- **Acceptance:** cross-correlate the page's audio output against the disc PCM in 4 s windows: >= 0.99 with the
  offset advancing 1:1 across INTRO_2 and MENULOOP, 0 underruns (`tools_py/parity/audio_corr.py`, PC research 32
  §7.1); level against a recomp `PS2X_AUDIO_DUMP` and PCSX2 loopback within +-1 dB.
- **Proven by:** PLAT-36 (the `PS2X_AUDIO_DUMP` and audio trace).
- **Dependencies:** PLAT-18, PLAT-19b. **Size:** M.
- **Unknowns:** the stream volume the game sets for movies and the title ring's unexplained -4..-6.5 dB (KNOWN
  [989snd-decomp], which points at the movie-audio row now in `docs/HAZARDS.md`: "The movie audio (the PCM ring) is ~20
  dB under the console") -- a recomp `PS2X_AUDIO_TRACE` on the title (PLAT-36).
- **Owner calls:** none.
- **Merged from:** boot BOOT-06; platform PLAT-14.

### PLAT-21 -- The movie player's semantics (open, loop, end event, skip, background)
- **Goal:** one player with the game's states: open, present at the stream rate, end (fires the script event), loop
  restart, close, skip; used for dialog backgrounds and movie dialogs.
- **What the original does:** open `FUN_003098e0(name,1,blocking,audio)` (D:L207785) -> `FUN_0030bb60` LBN +
  `sceCdStInit/Start`; create `FUN_0030b4d0` (callbacks M2V 0x30add0, ADPCM 0x30aca0, STOPDMA 0x30aaa0, TIMESTAMP
  0x30a970, NODATA 0x30a940); per frame `FUN_0030b1d0`. Shell tick `FUN_00366940` (D:L262866-262940): ended ->
  `FUN_00367810(shell,3,0)` (the script event), then loop flag +0x27a -> `FUN_00309560` reset and seek (D:L207664), else
  close; start `FUN_00366a00` (D:L262903) / `FUN_001f3bd0` (D:L54361). End detection `DAT_00455e38 || sceMpegIsEnd`.
  UI commands PlayMPEG 0x27ab30 (D:L124609), PlayMPEGNoFade, BackgroundMPEG 0x27a420 (D:L124410), PlayMovie; event
  ONMPEGEND (9 uses); BACKGROUND TYPE MPEG in 9 dialogs. CROSS skips INTRO_2 (`scripts/parity/launch_to_mission.txt`
  L7-8). `FUN_001ed560` (D:L51220) opens a movie with an audio-stream argument (D:L51362) and builds 3 subtitle lines
  (`FUN_001eda60`, D:L51384+).
- **Today:** nothing; s5 `uiScript.ts` can carry the event into the scripts.
- **Gap:** the state machine and its bindings.
- **Acceptance:** reading level (CI): a unit test of the state machine against the decomp's transitions (end + loop ->
  restart; end + no loop -> closed; event 3 once per end), with a synthetic picture source. Proven level: trace parity
  of the open/end/reset order for boot and the menu against a recomp `PS2X_MPEG_TRACE=1` run (PLAT-36; the archived
  run of PC research 09 L76-80 already shows sony448 ending at 310 pictures, Intro_2 playing, MENULOOP created and
  looped).
- **Proven by:** PLAT-36 (the MPEG trace).
- **Dependencies:** PLAT-07, PLAT-18. **Size:** M. **Then:** the picture and sound outputs take PLAT-19b and PLAT-20
  when they land (black and silent until then); the reading level needs neither.
- **Unknowns:** which buttons skip each movie (CROSS for INTRO_2 is shown; START, others and SONY448 unknown) -- the
  `dlgIntroCinematic` script read plus a BOOT-01 mash run. *(Corrected 2026-10-01, PLAT-35, from the README's correction
  9: half answered -- `dlgIntroCinematic.rdr` binds no button (web research 98 §3); the CROSS presses after s02 and s03
  did not skip SONY448, and the one after s02 did not pause it (§1); the s04 press did not end it early in `mb10_pcsx2`,
  whose per-second wait frames run 30 pictures per second across it (§1; the other runs' s04 press believed the same,
  §5); a skip from outside the dialog is not ruled out. [Re-worded at the merge with PLAT-19a's review: said "the CROSS
  presses captured during SONY448 neither skipped nor paused it".] `dlgSecondCinematic`
  binds thirteen keys to `goto_menu`, all but SELECT (research 96 §3.2).)* Whether `FUN_001ed560`'s subtitles are
  used outside missions (believed mission-only; `mpeg_subtitles.rdr` is loaded at mission load, D:L152647).
- **Owner calls:** none.
- **Merged from:** boot BOOT-07; menus MENU-09; platform PLAT-13 (player part).

## D. Sound

### PLAT-22 -- Streamed music and voice (989snd streams)
- **Goal:** play VAGSTORE's VPK music and VAGp voice streams on the script and code triggers the front end uses
  (`VagStreaming ON/OFF`, `StartMusic`, `CallMusic MUS_*`), with the original's looping.
- **What the original does:** VAGSTORE.ZAR is 576,593,920 B with 10,943 keys; music is 210 stereo 32 kHz VPK cues; VO
  mono 22,050 Hz VAGp (KNOWN [mission-music]; PC research 32 §2, §6); `snd_PlayVAGStreamByLoc` fno 0x2c `{sector,
  sector2, off|vol<<16, off2|pan<<16, group, parent, priority, flags}`; the online screens' music starts with the loop
  flag (flags 4) and the console loops it (KNOWN [lobby-music-once]); one music stream per screen (KNOWN
  [stray-oneshots]); the streamer reference `research/989snd-ziemas/iop/stream.c`. Names used: `MUS_MENU_THEME`
  (dlgMenu), `MUS_ONLINE_MENU` (dlgOptions_Menu `Call_Music`), `MUS_SUCCESS`, `MUS_JUKE_01..12`. `MUS_` names are not in
  `sounds.rdr` (0 strings in `SOUNDRDR.ZAR`), so name-to-stream resolution is in code. The music bus has a square-law
  group stage (KNOWN [989snd-decomp], `554972e`). *(Corrected 2026-10-02, INT-AUDIO, web R124 §3: the names are in
  `sounds.rdr` by CRC-32 -- `SMUS`'s 212 `ST` entries, R122.8 -- and `FUN_00342240` names the member `"%s.VPK"` for the
  `MUS` class, `"%s.VAG"` otherwise. Landed as an interim slice: the VPK and VAGp decode, the resolver, the round's cues
  from every map's script, one music slot (R124 §10); still owed here: ranged streaming, vol/pan/group, looping, AutoVol
  fades, the front end's music.)*
- **Today:** *(2026-10-03, MENU-MUSIC, web research 152, reading, pending review.)* The front end's music plays:
  `@s2u/sound`'s `musicStream.ts` (the play's eight words `FUN_00342240` -> `FUN_0033f580`, flags 4 for `LOOP`; the
  music group's master `MUSIC_VOLUME x 1024` and the square law; `VpkStreamReader`, the VPK read a 0xb000 buffer at a
  time by range with the ADPCM history carried, looping at the data's top), PLAT-23's stream play with its pan and name
  slot, and the page's streamer `packages/viewer/src/menuMusic.ts` on the front end's own audio through the page's
  `AssetSource` (VAGSTORE by range, never whole). The screens: SOCOM II ONLINE, the briefing rooms and OPTIONS stream
  `MUS_ONLINE_MENU` (MUUI0003.VPK); the main menu streams none (R152.1). The round's cues are INT-AUDIO's interim slice
  (research 124, decoded whole). Still owed: the round's cues through the streamer, AutoVol fades beyond
  `FadeAllSounds`, the live `MUSIC_VOLUME` slider, the voice streams (UIVOICE), and the proven level (PLAT-36).
- **Gap:** *(2026-10-03: the front end's half met at the reading level, research 152.)* VPK and VAGp parsing; a stream
  voice with vol, pan and group; start/stop/still-playing; MUS name resolution; ranged reads into the 576 MB archive.
- **Acceptance:** reading level: decoded streams equal the Python VPK decoder of KNOWN [mission-music], sample-exact
  (dev-disc-only: VAGSTORE is 576 MB; CI decodes a synthetic VPK); proven level: for the main menu and the online menu
  the stream chosen (sector, offset) equals the recomp's `989snd stream start` log line; envelope correlation against
  `PS2X_AUDIO_DUMP` (`tools_py/parity/audio_envelope.py`).
- **Proven by:** PLAT-36 (the 989snd log and the audio dump).
- **Dependencies:** PLAT-02, PLAT-03, PLAT-08. **Size:** L.
- **Unknowns:** which stream plays `MUS_MENU_THEME` versus the MENULOOP PCM (both may sound on the main menu) and which
  plays `MUS_ONLINE_MENU` -- a recomp audio trace across the main and online menus (PLAT-36); the code mapping MUS
  names to streams -- a read of the CallMusic row. *(Answered at the reading level 2026-10-03, research 152 R152.1-R152.4:
  the main menu plays MENULOOP's track alone -- `MUS_MENU_THEME` is in `dlgMenu`'s `CallMusicPressDemo`, bound to
  nothing -- and the recomp's online-path log starts no stream before SOCOM II ONLINE, whose play is MUUI0003.VPK; the
  names map by CRC-32 through `sounds.rdr`'s SMUS; `CallMusic` is an animation, not a row.)*
- **Owner calls:** none.
- **Merged from:** platform PLAT-15; menus MENU-08 (stream half).

### PLAT-23 -- UI sounds
- **Goal:** every menu sound the scripts and code name plays from the right sample, or stays silent where the console
  is silent.
- **What the original does:** `uisounds.rdr` TELETYPE -> `.TYPE`, BACK -> `.BACK`, SELECTION -> `.METAL`; menu init
  reads `uisounds.rdr` and the `sounds.rdr` blocks HUDUI/SMUS/UIVOICE and bank "UI", which is not on the disc
  (`FUN_001f4860`, web R95 §5.1; `UI_BANK_PLACEHOLDER`); HUDUI.bnk has 24 sounds incl. the menus' and keyboard's (web
  research 81 §1); SMUS, TCM_ECHO, MULTI, HOSTAGE and UI banks are not on the disc; names used `.DINK`, `.SLIDE`,
  `.NEG`, `.TYPE`, `.TCM_SLIDE`, `.METAL`; `SND_DINK` with no sigil never plays (web R95 §3.9). The online screens'
  one-shots (HUDUI sounds 8 and 0xc) play 100+ times across them and 0 on the main menu (KNOWN [stray-oneshots]); 87
  plays of the one-shot bank 0x00a00000 during boot and the intro movies (KNOWN [stray-oneshots]).
- **Today:** the s5 ARMORY plays from HUDUI (`armory.ts:36-38`; `soundData.ts:57`).
- **Gap:** resolution for every dialog's names; behaviour when a name is in a missing bank.
- **Acceptance:** for each UI sound name in all dialogs and sets, the bank and index chosen equal the recomp's 989snd
  play log (bank handle, sound index) for the same screen action; cue onsets per press align within one frame on a
  60-fps capture.
- **Proven by:** PLAT-36 (the 989snd play log).
- **Dependencies:** PLAT-07, PLAT-08. **Size:** S.
- **Unknowns:** where `.TCM_SLIDE` and `.METAL` resolve with TCM_ECHO absent (HUDUI, or silence) -- a recomp sound log
  on the main menu; what the 87 boot-time one-shots are -- a recomp sound trace mapped to `uisounds.rdr`.
- **Owner calls:** none.
- **Merged from:** platform PLAT-16; menus MENU-08 (cue half); boot unknown 14.
- **[Corrected 2026-10-02 by PLAT-23's stream; web research 122]** "bank UI, which is not on the disc": "UI" is
  `sounds.rdr`'s `GROUPS/UI` (two groups, `FUN_00348130`), not a bank, and the menus' bank is HUDUI (R122.3); TCM_ECHO
  has no `sounds.rdr` block, so `.TCM_SLIDE` and `.METAL` resolve in HUDUI (12, 8: the first unknown, answered at the
  reading level); the 87 boot one-shots are the menus' own cues, `.METAL` and `ActivateMenuBtns`' slide-in (R122.12).
  "Today" is `armory.ts:37-39`. Built (reading, pending review): the table `packages/sound/src/uiSounds.ts`, the cues
  and the three sound rows `packages/ui/src/sounds/`, the page's host `packages/viewer/src/uiSoundHost.ts`; every name
  of every set and dialog resolved on the dev disc (94: 85 resolve, 4 silent, 5 the exit screen's grade groups). The
  acceptance's play-log comparison and the one-frame onsets stay PLAT-36's (the proven level); a new play's stop of
  its name slot's previous stream voice (D:L112451-112455) is owed to PLAT-22, which plays the streams (R122 §13).

## E. The simulated memory card (store, slots, libmc; the filesystem and the codec dropped by R7)

The card's *contents and screens* (options save, PersistentValves, personas, card dialogs) are segment 04; these tasks
(PLAT-24 the storage interface, PLAT-25 the two virtual card slots, PLAT-26 libmc over their file table) are the card
itself, which segments 02, 04 and 05 all read; their order in the file is not their dependency order (the task lines
are). **Corrected by R7 (the owner, 2026-10-01;
[the spec](../specs/2026-10-01-web-r7-account-and-card-design.md)):** this paragraph read "these four tasks (PLAT-25 the
slots, PLAT-37 the filesystem, PLAT-26 libmc, PLAT-27 the game's file codec)". Under R7 a slot is a virtual card in
localStorage in our own JSON -- a file table with the original's names and nominal sizes, an extension area and a
revision counter -- so there is no `.ps2` image to hold a filesystem and no game bytes to encode. PLAT-37 and PLAT-27
are dropped and keep their ids below, marked; the card codec's read side stays as a dev tool under `tools/`.

### PLAT-24 -- The browser storage abstraction
- **Goal:** one guarded storage interface under the card, the settings and the per-viewer conveniences, with a
  migration of today's keys.
- **What the original does:** n/a (a browser concern).
- **Today:** scattered guarded localStorage in s5's viewer: the MP name `s2u.mp.name` (`main.ts`), the last map
  (`LAST_MAP_KEY`, `main.ts`), the Mode (`features.ts`), Online (`online.ts`), the rules (`rules.ts`), the controls' tab
  (`controlsList.ts`, `ui.ts`), the panel, look, volume, mute and mouse look (`ui.ts`), the phone's tip (`mobileTip.ts`,
  whose `storeOf` the ARMORY borrows); s5 ARMORY profile `s2u.armory.v1.<MAP>.<side>` (`armory.ts`;
  `ARMORY_PROFILE_KEY_READING`). **Corrected 2026-10-01 (PLAT-24's review):** the line numbers this line gave were
  sprint 5's and are dropped; the current file:line of every use is research 99 §4's table.
- **Gap:** an interface (get, put, quota, async) with an **IndexedDB backend for the card** (R4, 2026-10-01: binary, a
  large quota, asynchronous; localStorage stays only for per-viewer conveniences such as a remembered tab), and the rule
  for which state lives on the card versus page settings. The ARMORY profile moves to the card's `WeapProfile_%d.dat` by
  OPT-20, which retires the `s2u.armory.v1` key; the MP name moves to the persona by OPT-04. Both stand on the card this
  interface carries, so they come after this task and own those two migrations; this task migrates the rest.
  **Corrected 2026-10-01 (PLAT-24's review), what was built:** `@s2u/card`'s `ByteStore` (IndexedDB and in-memory
  backends, a conditional write, a multi-key read, a bounded opening) and the page's guarded `Settings`. The page's
  twelve `s2u.viewer.*` keys **stay under their names on localStorage**, read and written through `Settings`
  (`packages/viewer/src/pageStore.ts`): they are per-viewer conveniences (R4), so "the rest" migrates in place --
  nothing copied, nothing dropped, nothing to import twice. `migrateOnce` (`packages/card/src/migrate.ts`) is the
  run-once machinery (the old key read once and left in place; the import conditional on no other tab having run) for
  the two keys that change home: OPT-04's MP name and OPT-20's ARMORY profile. The card-versus-settings rule and its
  open questions are research 99 §2.
  **Corrected by R7 (the owner, 2026-10-01), what the card uses:** merged (a8b8e0ec) with the IndexedDB backend R4
  asked for; under R7 the card is two virtual slots in **localStorage** (PLAT-25), which PLAT-25's module
  `cardSlots.ts` reads and writes through a localStorage getter of its own, as `Settings` takes one -- not through
  `Settings`, which holds only per-viewer conveniences, none of them anything the game keeps on its card -- one
  `setItem` per save. *(Corrected 2026-10-01, review of the R7 re-cut: this sentence first said the slot records go
  through the guarded `Settings` path; they do not.)* The IndexedDB
  backend (`packages/card/src/idbStore.ts`) and its tests are **parked** in `@s2u/card`, unused by the card, for
  expansion data that outgrows localStorage's roughly 5 MB of text (R7's amendment 4). The interface, the key
  migration (W6.R5) and `migrateOnce` are unchanged. The Gap's "IndexedDB backend for the card" is R4's and is
  replaced by this paragraph.
- **Acceptance:** unit tests (CI, `fake-indexeddb` or an in-memory backend): a throwing or empty store reads as an
  empty card; a write that throws is reported, not silent (contrast `armory.ts:34`'s drop); a binary value of 8.6 MB
  round-trips; a migration test from the old keys. **Corrected by R7 (2026-10-01):** the 8.6 MB binary round-trip
  was R4's image and goes from what the card needs (the merged test stays with the parked backend); in its place, a
  slot record round-trips through PLAT-25's `cardSlots.ts` and a throwing `setItem` is reported, not silent (PLAT-25's
  acceptance holds both for the card). And "a throwing or empty store reads as an empty card" is R4's and the
  parked backend's (`ByteStore`), not the card's: under R7 two cases stay apart -- an **absent key** in a working
  localStorage is a fresh card, inserted, formatted and empty (KNOWN [card-folder]); **no storage** (localStorage
  refused or throwing, a private window) reads as **no card** in both slots (OPT-05b; PLAT-25's acceptance, OPT-07).
- **Dependencies:** none. **Size:** M.
- **Unknowns:** none.
- **Owner calls:** whether existing localStorage keys migrate or are dropped -- **ruled** (the owner, 2026-10-01:
  "migrate"; plan W6.R5): nothing is dropped. Still open: research 99 §2's Q99.1-Q99.6. The card's medium: **ruled**
  localStorage (R7, 2026-10-01, replacing R4's IndexedDB).
- **Merged from:** platform PLAT-18.

### PLAT-25 -- The simulated card store: two virtual card slots in localStorage
- **Rewritten by R7 (the owner, 2026-10-01; [the spec](../specs/2026-10-01-web-r7-account-and-card-design.md) §3 and
  §7).** Until then this task was "two slots of raw `.ps2` images in IndexedDB" (R4): each slot one 8,650,752-B PCSX2
  image with ECC, stored in erase-block chunks under a generation and swapped in one transaction, a quota check
  (`navigator.storage.estimate()`) before a write, a new slot formatted by PLAT-37, so that real PCSX2 cards could be
  imported and exported (OPT-08); its acceptance was an image round-trip, a killed write leaving the old image, an
  over-quota write refused before it started, and a dev-host quota measurement. What R4's acceptance held that R7's
  does not: only the touched erase blocks rewritten on a save, and the dev-host quota measured for two slots (its
  budget: "about 17.3 MB plus one generation in flight") -- measured before the drop (the sprint 6 plan's Log, Chromium
  153 only: 18.06 MB for two slots, 27.03 MB with a generation in flight, of a quota of about 6.44 GB). That design was
  built on `agent/web-s6-card` (7a2e33a1, e6b0d533) and stopped unmerged when R7 replaced R4. Re-dispatched to R7 on
  `agent/web-s6-slots`.
- **Goal:** two memory-card slots, as the PS2 has, each a **virtual card** kept in localStorage in redotcom's own JSON:
  the card's state, a table of files carrying the original's names and nominal sizes, an extension area for what the
  original never saved, and a revision counter; the libmc layer (PLAT-26) reads and writes through the file table, so
  the game sees the card it saw on the console and every card state is reachable, simulated.
- **The ruling (R7, the owner, 2026-10-01; it replaces R4):** two virtual slots in **localStorage**, one key per slot,
  in our own JSON; the files' contents are our JSON, not the game's bytes; **no `.ps2` images, no PCSX2 import or
  export, no file export of any kind**; every card prompt, slot select, free-space notice, overwrite warning and error
  is the original's. (R4's ruling, which this replaces: IndexedDB, each slot a raw 8 MB `.ps2` image with ECC, atomic
  writes and a quota check.)
- **What the original does:** the PS2's two card slots; the recomp gives slot 2 only with `PS2X_MC_DIR_SLOT1`
  (`third_party/ps2recomp/ps2xRuntime/src/lib/Kernel/Stubs/MemoryCard.cpp:14-57, 136-148, 245-315`); PCSX2's two cards
  ask "Select MEMORY CARD slot" (`s4_pcsx2/A_00_boot.png`, `A_01.png`; OPT-05h). A write past capacity is refused
  whole; an empty folder is an inserted, formatted, empty card (KNOWN [card-folder], [virgin-save], [s8-review](d)).
  A SOCOM save takes 3020 KB across 12 files: `BASCUS-97275SOCOMII` (4,784 B empty / 6,208 one persona / 6,400 two),
  `icon.sys` 964, `LIST.ICO` 50,234, `PATCHFILE.DAT` 2,048,000, `SaveGame0..6` 1,952 each, `SCRATCHPAD.DAT` 944,128
  (`logs/parity/f0/mc0/BASCUS-97275SOCOMII/`; KNOWN [card-folder] `s8_save_yes`). PATCHFILE and SCRATCHPAD are filler:
  zeros plus a last 1 KB of 0xEE in the recomp's files (`FUN_003a1880`/`FUN_003a1980` D:L295995-296080). These are the
  nominal sizes the file table carries.
- **The `.ps2` image (R4's slot unit; R7 builds none -- kept as the record of the format the project's PCSX2 reference
  cards use):** 16,384 pages of 512 data bytes plus a 16-byte spare (ECC) area: **8,650,752 B** with ECC, 8,388,608 B
  without (`mymcplus/ps2mc.py` L42-44 `PS2MC_STANDARD_PAGE_SIZE` 512, `PS2MC_STANDARD_PAGES_PER_CARD` 16384,
  `PS2MC_STANDARD_PAGES_PER_ERASE_BLOCK` 16; the spare size `div_round_up(page_size, 128) * 4` at L598; both sizes
  read, L645-653; `mymcplus` 3.0.5 (`site-packages/mymcplus/`, the tool the project's PCSX2 cards were made and read
  with: PC `docs/archive/HANDOFF-2026-09-08.md` L63, L169)). Measured 2026-10-01: the project's PCSX2 cards
  `tools/pcsx2/memcards/Mcd001.ps2` and `Mcd002.ps2` are each 8,650,752 B; `Mcd002.ps2`'s first page is all 0xFF (an
  erased, unformatted card).
- **Today:** none merged. This task's module, `cardSlots.ts` in `@s2u/card` (in review on `agent/web-s6-slots`), reads
  and writes the slot records through a localStorage getter of its own, as `Settings` takes one; it does not go
  through `Settings` (PLAT-24's per-viewer conveniences). The parked IndexedDB backend is not used (PLAT-24, R7's
  amendment 4). *(Corrected 2026-10-01, review of the R7 re-cut: this line first said the records go through
  `Settings`.)*
- **Gap:** the store, per the spec's §3 as amended by §7:
  - **Keys** `s2u.card.v1.slot1` and `s2u.card.v1.slot2`. A missing key is a fresh card that is inserted, formatted and
    empty, as an empty card folder is on the original (KNOWN [card-folder]).
  - **The record** (versioned JSON): `v` (1); `present` (false: "no card", OPT-05b, set through OPT-07's control);
    `formatted` (false: unformatted, OPT-05c; FORMAT sets it true and empties the table); `files`, the virtual card's
    table, keyed by the path on the card (`BASCUS-97275SOCOMII/SaveGame0`), each entry its **nominal size** in bytes
    (the original's, the list above), its `mtime` and its `data` (our JSON: persona records, options, valves,
    loadouts); **`ext`**, the extension area for anything SOCOM Legacy saves that the original never did -- not a file on
    the card: it takes no free space and no card screen ever shows it; and a **revision counter**.
  - **Free space** is counted against the virtual 8 MB card, not the browser's quota: GetInfo answers the recomp
    stub's "free 8000" on an empty card, and the free figure falls by the nominal sizes rounded up to 1 KB clusters by
    the recomp's `mcUsedClusters` rule (`MemoryCard.cpp:245-287`), so "At least 3000KB is needed" (OPT-05d) means what
    it meant on the console and a test reaches the full state by filling the table with nominal files.
  - **Writes are atomic:** a save builds the new record and writes it in **one `setItem`**; a `setItem` that throws (a
    `QuotaExceededError`, or storage refused) writes nothing, the previous record stays whole, and the failure reaches
    the game as the libmc failure the original reports (PLAT-26), so the player sees "Error saving" (OPT-05f), never a
    browser alert.
  - **Another tab's save is the original's "card changed":** a save that finds the stored revision moved since it
    read the slot is refused whole and reaches the game as libmc's ChangedCard result (-1).
  - **Corrupt data:** a record that does not parse, has an unknown `v` or fails its shape check is a present card
    whose save is damaged -- the original's corrupt-file path ("Error loading data", `_841`, OPT-05f); it is never
    silently reset.
  - **No storage** (a private window, localStorage refused): both slots read as **no card** (OPT-05b), the original's
    own words for a missing card -- the controller's default under R7, the owner may overturn it (OPT-07).
- **Acceptance:** CI (a `Storage` stand-in built in the test): two slots kept apart; a record round-trips; a throwing
  `setItem` leaves the previous record byte-equal and is reported as a failed write; a reload reads the same slot;
  free space by nominal sizes (8000 on an empty card; the 12-file save above leaves what the `mcUsedClusters` rule
  gives); `ext` takes no free space; a save that finds the revision moved is refused whole as ChangedCard; a corrupt
  record reads as a damaged save; no storage reads as no card. R4's quota measurement and the
  `navigator.storage.persist()` question go: the card is counted against the virtual 8 MB, and nothing asks the browser
  for more.
- **Dependencies:** PLAT-02, PLAT-24. **Size:** M. **Then:** PLAT-26 (libmc over the file table). *(Under R4 the Then
  was PLAT-37, the filesystem inside the image.)*
- **Unknowns:** none for the format, which is ours. *(R4's two -- the browser quota and eviction for two images, and
  whether to ask for `navigator.storage.persist()` -- close with R7; the quota was measured anyway, above.)*
- **Owner calls:** **ruled** (R7, 2026-10-01, replacing R4): localStorage, two virtual slots, our JSON, no images, no
  import or export. No storage reads as no card: the controller's default under R7, the owner may overturn it (OPT-07).
  SAVE PASSWORD: YES -- **ruled** (R7's §7 item 5, the owner, 2026-10-01: "agreed on cookie"): a server-issued
  remember token in an HttpOnly cookie, never the password; the slot's persona record keeps SAVEPASSWORD and the
  password's length only (OPT-04, SVC-03).
- **Merged from:** options OPT-01; boot BOOT-10; menus MENU-18; platform PLAT-17 (store part); rewritten to R4 on
  2026-10-01 (it was a sparse per-file store with the medium open), and rewritten to R7 the same day.

### PLAT-26 -- libmc semantics: commands, result codes, free space, the trace line
- **Goal:** the guest-facing card API behaves as the recompilation's libmc stub does.
- **What the original does:** commands GetInfo, Open, Close, Seek, Read, Write, Flush, Mkdir, Chdir, GetDir,
  SetFileInfo, Delete, Format, Unformat, GetEntSpace, Rename; results 0 / -1 ChangedCard / -2 NoFormat / -3 FullDevice /
  -4 NoEntry / -5 DeniedPermit / -6 NotEmpty / -7 UpLimitHandle; GetInfo answers type 2, free 8000 on an empty card,
  format 1; a trailing `..` resolves to the root; the unconditional `[mc] command <n> FAILED result=<r>` line and the
  `PS2X_MC_TRACE` knob (`MemoryCard.cpp`: the FAILED line at :620, the knob at :148; KNOWN [card-folder],
  [virgin-save]). The game asks GetInfo only "is the type 2" (KNOWN [card-folder]).
- **Today:** none. *(2026-10-02: PLAT-26a takes the ten file commands and Delete; Format, Unformat, SetFileInfo,
  GetEntSpace and Rename are left here, refused as not ported until then -- research 134 §6.)*
- **Gap:** a TypeScript port of the command semantics over PLAT-25's file table (from a 1,927-line stub), with the
  diagnostic line: the same commands, result codes (0, -1 ... -7) and FAILED line, so the game logic sees the card it
  saw on the console; a save refused because the slot's revision moved is ChangedCard (-1) (PLAT-25). **Corrected by
  R7 (2026-10-01):** this read "over PLAT-37's filesystem in PLAT-25's slots"; R7 dropped PLAT-37 (no `.ps2` image).
  *(The sprint 6 close review, 2026-10-02: the slot has one `rev`, and an ext save moves it too -- research 99 §7.1,
  §7.9 -- so on `changed` libmc re-reads the slot and returns ChangedCard only when present, formatted, files or dirs
  differ from what it last read; otherwise it retries the operation once with the fresh `rev`. Its tests pin that
  retry.)*
- **Acceptance:** reading level (CI): table-driven tests of each command's result codes transcribed from the stub
  (`MemoryCard.cpp:14-57, 136-148, 245-315`) on a file table built in the test (R7; it read "a store"). Proven level:
  the test replays the MC op sequence of a recomp run (`PS2X_MC_TRACE=1` of an options save, the `s8_save_yes`
  equivalent) and gets the same result codes; the only expected failures are -4 NoEntry deletes of files that do not yet
  exist (KNOWN [card-folder]).
- **Proven by:** PLAT-36 (the MC trace).
- **Dependencies:** PLAT-25, PLAT-26a. **Size:** M. *(R7, 2026-10-01: it read "PLAT-25, PLAT-37"; PLAT-37 is dropped.)*
  *([2026-10-02, OT.R6] parked until the online path runs; PLAT-26a, its path slice, takes the file commands first.)*
- **Unknowns:** the recorded op sequence -- one recomp run with `PS2X_MC_TRACE` in a host window (PLAT-36). **Closed
  by R7 (2026-10-01):** "the free space GetInfo reports on an image (the recomp's stub answers 8000 on an empty card; a
  formatted image has 8,135 allocatable clusters, PLAT-37) -- a PCSX2 run's answer" -- there is no image; the free
  figure is counted against the virtual 8 MB card by nominal sizes, and the stub's 8000 stands.
- **Owner calls:** none.
- **Merged from:** options OPT-02.

### PLAT-26a -- libmc's file commands, for the online path's card files
- **Slice of:** PLAT-26 ([2026-10-02, OT.R6]; the online-path plan, `../plans/2026-10-02-online-path-target.md`): what
  the path's card files need of libmc -- the persona records (OPT-04a), the ARMORY's loadout file (OPT-20) and the card
  prompts of the online entry and the persona save (OPT-05i) -- without the card-management commands the parked card
  screens use and without the replay of a whole recorded op sequence.
- **Goal:** the guest-facing card API's file commands behave as the recompilation's libmc stub does, over PLAT-25's
  file table.
- **What the original does:** from PLAT-26: the commands GetInfo, Open, Close, Seek, Read, Write, Flush, Mkdir, Chdir
  and GetDir among the sixteen; the results 0 / -1 ChangedCard / -2 NoFormat / -3 FullDevice / -4 NoEntry / -5
  DeniedPermit / -6 NotEmpty / -7 UpLimitHandle; GetInfo answers type 2, free 8000 on an empty card, format 1; a
  trailing `..` resolves to the root; the unconditional `[mc] command <n> FAILED result=<r>` line and the
  `PS2X_MC_TRACE` knob (`MemoryCard.cpp`: the FAILED line at :620, the knob at :148; KNOWN [card-folder],
  [virgin-save]).
- **Today:** none (PLAT-26's Today); PLAT-25's slot records are `cardSlots.ts` in `@s2u/card`.
  *(2026-10-02, pending review: `packages/card/src/libmc.ts`, tests `packages/card/test/libmc.test.ts`, research 134. It
  ports Delete with the ten -- the game's open deletes before a create, `FUN_003a05a0` D:L295406-295410 -- so five
  commands, not six, are left to PLAT-26.)*
- **Gap:** those ten commands ported over PLAT-25's file table with the result codes each returns and the FAILED
  line; a save that finds the slot's revision moved answers ChangedCard (-1) by PLAT-26's re-read-and-retry rule
  (research 99 §7.1, §7.9). Left to PLAT-26: Format, Unformat, SetFileInfo, GetEntSpace and Rename, and the proven
  level's replay of a recorded op sequence. *(2026-10-02: it read "Delete, Format, ..."; Delete is ported here.)*
- **Acceptance:** reading level (CI): PLAT-26's table-driven tests for these ten commands, their result codes
  transcribed from the stub (`MemoryCard.cpp:14-57, 136-148, 245-315`) on a file table built in the test, and Delete's;
  a command of the other five, called before PLAT-26 runs, is reported as not ported, never answered with success.
- **Proven by:** PLAT-36 (the MC trace), at PLAT-26's proven level.
- **Dependencies:** PLAT-25. **Size:** S. **Then:** PLAT-26 (the five other commands and the op-sequence replay).
- **Unknowns:** whether the online path's saves call a command beyond these ten -- the MC op sequence of an online
  persona save and an ARMORY store in PLAT-36's trace window; until it runs, the reported refusal above shows it.
- **Owner calls:** none.
- **Merged from:** sliced from PLAT-26 by OT-0 (2026-10-02, OT.R6).

### PLAT-27 -- (dropped) The card file codec (scrambler, ZAR V2 read/write, flattened rdr read/write)
- **Dropped:** by R7 (the owner, 2026-10-01; [the spec](../specs/2026-10-01-web-r7-account-and-card-design.md) §4 and
  §7 item 1). **Built and merged on 2026-10-01 at 1c20d326, then dropped:** under R7 the card holds our JSON, so no
  shipped package needs the card's byte formats. Its **readers** of a game-written save (the unscrambler, the save
  file and its modules, the persona decode, the lossless ZAR and rdr readers) move out of the shipped packages into a
  **dev tool under `tools/`** -- not a roadmap task; PLAT-06's dev-host `PersistentValves` test reads through it, and
  a later one-way importer of a real PCSX2 save would need only readers. Its **writers** (the scrambler's forward pass,
  the ZAR V2 and rdr writers, the persona and save-file writes) are deleted. Its fix round (`agent/web-s6-codec`) is
  dropped. Research 102 stays as research. The id is kept (README conventions); the block below is as it was.
- **Goal:** read and write `BASCUS-97275SOCOMII` and the other ZAR saves byte for byte.
- **What the original does:** a two-pass fixed-seed scrambler, k = 0x96, forward then backward (`sub_0033DC30`, inverse
  `FUN_0033de00`); ZAR V2 with flags 0, padding 16, crc 0, appversion 14 (12 for SaveGame); `zSaveHeader` (268 B,
  `{268, 14, ...}` then per-run pointers; the reader `sub_0033D4A0` checks nothing else); `CSaveModuleList` ->
  `CUIVarManager`, `CValveSaveManager/PersistentValves.rdr` (4,144 B), `CAcctDB/AcctInfo.rdr`; rdr header
  `{1, stable_size, node_ofs}`, a string table, 8-byte nodes (PC research 80-persona-card-format, steps 3-5;
  `tools_py/card_save.py` round-trips 72 example files).
- **Today:** `packages/archive/src/zar.ts` and `rdr.ts` read only.
- **Gap:** the scrambler, a ZAR writer, an rdr writer, a float node type (type 2, seen in UI var nodes).
- **Acceptance:** CI: the four tracked fixtures
  `third_party/ps2recomp/ps2xTest/fixtures/cards/{virgin,one,two,created}.bin` round-trip byte for byte,
  `virgin`/`one`/`two` decode to the personas PC research 80 lists, and `created.bin` equals this codec's write of the
  persona `tools_py/tests/test_card_save.py` builds (its L79-103). Dev-host-only (skipped in CI; `logs/` is git-ignored
  in the main repository): round-trip all 72 files under `logs/parity/*/mc0/BASCUS-97275SOCOMII/` byte for byte,
  matching `tools_py/card_save.py`. Tests read the game-written fixtures from the main project path; nothing is
  committed under `web/` ("no game data in git").
- **Dependencies (if reopened):** none. **Size:** M (a known algorithm with a working Python reference).
- **Unknowns:** none for the format.
- **Owner calls:** none.
- **Merged from:** options OPT-03; platform PLAT-17 (codec part); menus MENU-18 (a); boot BOOT-10 (codec part);
  online front end ONL-08 (codec part).

### PLAT-37 -- (dropped) The PS2 memory-card filesystem inside a `.ps2` image (format, FAT, directories, ECC)
- **Dropped:** by R7 (the owner, 2026-10-01; [the spec](../specs/2026-10-01-web-r7-account-and-card-design.md) §4):
  there are no `.ps2` images and no PCSX2 import or export, so the card has no filesystem to hold -- PLAT-25's slot is a
  file table in our JSON, and PLAT-26's libmc runs over that table. Never built (it was sprint 15's). The id is kept
  (README conventions); the block below is as it was, the record of the format.
- **Goal:** read, write and format the filesystem of an 8 MB PS2 card image exactly as PCSX2's images hold it, so a
  real PCSX2 card imports, a browser card exports, and the game's files land where a PS2 puts them.
- **What the original does (the format; the card's own, not the game's):** page 0 is the superblock, read with
  `struct "<28s12sHHHHLLLLLL8x128s128sbbxx"` (`mymcplus/ps2mc.py` L109-114): the magic `Sony PS2 Memory Card Format `
  (L33), the version, the page size, pages per cluster, pages per erase block, clusters per card, the allocatable
  offset and end, the root directory's cluster, two good (backup) erase blocks, the indirect-FAT cluster list, the
  bad-erase-block list, the card type and flags. Measured on `tools/pcsx2/memcards/Mcd001.ps2` (2026-10-01, read-only,
  parameters only): version `1.2.0.0`, 512 / 2 / 16, 8,192 clusters, allocatable offset 41 and end 8,135, root cluster
  0, good blocks 1,023 and 1,022, indirect-FAT list `[8]`, bad-block list all `0xFFFFFFFF`, type 2, flags 0x2B -- what
  mymcplus's formatter computes for the standard card (`format`, L697-760). Clusters are 1 KB (L39); FAT entries are
  32-bit, bit 31 set when allocated, `0xFFFFFFFF` the chain end (L34-37); the indirect FAT starts at byte 0x2000 (L40),
  at most 32 indirect clusters (L38). Directory entries are 512 B (`ps2mc_dir.py` L26): mode, length, created, first
  cluster, parent entry, modified, attributes, name (`_dirent_fmt` L44-55), the mode flags `DF_*` (L28-44). Each 128-B
  quarter of a page carries a 3-byte Hamming code in the spare area (`ps2mc_ecc.py` L67-84, `ecc_calculate_page`
  L132-135). mymcplus is GPL-3.0-or-later (its file headers), compatible with the project's GPL-3.0: it is the
  reference for this port and the oracle for its tests.
- **Today:** none (`tools_py/card_save.py` decodes the game's files, not the card's filesystem).
- **Gap:** a TypeScript port: superblock, FAT and indirect FAT, directory entries and timestamps, allocation, ECC
  generation and checking (an image without ECC also read, as mymcplus does), the formatter; a backup-block policy
  matching mymcplus's writes.
- **Acceptance:** CI (no game data: a formatted empty card is the tool's output): the formatter's image equals
  mymcplus's `format` of the same parameters byte for byte (its hash committed); synthetic files and folders written,
  read back and listed; one flipped bit in a 128-B chunk is corrected and two are reported (`ECC_CHECK_CORRECTED`,
  `ECC_CHECK_FAILED`, `ps2mc_ecc.py` L30-32). Dev-host-only: the owner's `tools/pcsx2/memcards/Mcd001.ps2` (read-only
  copy) lists the same tree, sizes and bytes as `python -m mymcplus -i <copy> dir` and its extract; the f0 card's 12
  files (PLAT-25's list) written into a fresh image read back byte-equal including the fillers, and that image opens in
  mymcplus with ECC checking on and lists the same folder; free clusters after the save equal the recomp's
  `mcUsedClusters` rule (`MemoryCard.cpp:245-287`) on the same layout, or the difference is recorded for PLAT-26.
- **Dependencies (if reopened):** PLAT-02, PLAT-25. **Size:** M (a known format with a working GPL reference).
  *(It read "**Then:** PLAT-26"; PLAT-26 now runs over PLAT-25's file table, R7.)*
- **Unknowns:** how a real card's unwritten part of a filler file reads (the recomp writes zeros) -- a `mymcplus`
  extract of a PCSX2-written save; what libmc reports as free on a fresh image -- PLAT-26's unknown.
- **Owner calls:** none (R4 ruled the format).
- **Merged from:** new on 2026-10-01 (R4 made the slot a raw `.ps2` image; split out of PLAT-25's old acceptance, which
  rebuilt the f0 card).

## F. The desktop-only screen

### PLAT-28 -- The "available in the desktop recompilation or with emulators" screen
- **Goal:** one notice screen, styled from the original's own popup, that every browser-impossible option opens from
  its original control without changing any other behaviour; plus the decided list of where it applies.
- **What the original does:** none -- this screen is the owner's mandate, not the game's. The candidate hooks, each
  sourced: HDD (`HDD_ENABLE`, `CheckHDDEnable`, `UIHardDiskAnim.rdr`, `DisplayHDDError` web R95 L606; OPT-16); Sony's
  network configuration GUI (`SCUSNGUI.ELF` + `NETGUI/`, `dlgReturnFromNTGUI2(LAN)`; captures `A_07_editnet.png`,
  `A_08_netgui.png`; ONL-02); 480p (`SwitchProgressiveVideo`, `CheckVideoMode`; OPT-11); Dolby Pro Logic II (OPT-10);
  the USB headset (PC research 39; SVC-22); vibration (`Vibration`, `VibrationChanged`; OPT-13); LAN (`dlgLANConnect`;
  MENU-08); the campaign's mission entry (MENU-03); `RebootIOP`; DNAS (`OVERLAY/REL/DNAS.BIN` -- a mission item, so
  represented, not refused; ONL-03).
- **Today:** 2026-10-03, pending review (web research 142): the component and its harness in
  `packages/ui/src/desktopScreen/` -- the notice in PLAT-16's popup with the main menu's own one-button record
  (`dlgMenu.rdr` `LoadGameOnListBox`, 517; CONTINUE 226) and the sentence `DESKTOP_SCREEN_TEXT_PLACEHOLDER`; the hook
  `(dialog, control, press)` as a binding gate in PLAT-08's host; `checkDesktopHook`, the per-hook harness (the screen at
  the press, CONTINUE back to the row, every valve, UI variable and card byte as an untouched twin's, nothing of the
  chain dispatched); MENU-03's and MENU-08's five hooks registered; on the page through `menuCommandsHost.ts`.
  2026-10-04 (POPUP-PLACE, research 142 §3a): the notice drew at the frame's origin (its record applied before the
  attach, the `POPUP` node never placed); now at its record's (150, 180) as `FUN_0036da20` places a popup
  (D:L266844-266848), the node's place handed back at the close; held on the drawn `dlgMenu` and in the browser at three
  window sizes (CONTINUE by Enter and by a tap closes it, NEW GAME still lit); the place rule checked on the original's
  own path against the console's `A_05` (#581: whole 95.1, the panel band 87.4, best within 2 px of the record's place).
  Owed: the owner's text, look and list (H76), the chrome against a frame of record 517 (none exists).
- **Gap:** the component, its text (no original LOC string exists, so the text is new), the hook list.
- **Acceptance:** the owner's sign-off on text and look; the chrome compared with a console popup frame. **This task
  owns the component and its per-hook test harness:** given a hook (dialog, control, press), the harness checks that the
  screen appears at that press and, on CONTINUE, returns to the same row with every other valve unchanged (e.g.
  `HDD_ENABLE` stays 0, `video_mode` stays NTSC), by a card diff showing no change. The tasks that wire hooks (OPT-17,
  ONL-02, MENU-03, MENU-08, BOOT-09) only register their hooks and cite this acceptance.
- **Dependencies:** PLAT-16, PLAT-08, PLAT-14. **Size:** S (the component) plus the owner's decisions.
- **Unknowns:** which features the browser *can* do -- vibration (`vibrationActuator` support varies), screen adjust
  (drawable), Dolby Pro Logic II (a stereo matrix the browser could play if the game's mix encodes it).
- **Owner calls:** **its look and wording** (reusing `popupOp.tif` POPUPDIALOG chrome is the least-invented option; the
  sentence is the owner's); **the per-feature decision** for each candidate (desktop screen, emulated, or represented
  as a no-op).
- **Merged from:** platform PLAT-19; menus MENU-29; options OPT-19 (the screen; the hooks are OPT-17).

## G. Budget and validation instruments

### PLAT-30 -- The capture comparison harness (SOCOM Legacy against PCSX2 and the recomp)
- **Goal:** drive the page with the main project's step-script vocabulary and score each settled frame against PCSX2
  and recomp captures exactly as the title gate scores.
- **What the original does (the reference side):** `tools_py/parity/drive.py`; step scripts `scripts/parity/*.txt`
  (`next`, `untilref`, `wait`); the scorer `score = 100*(1-0.5*mad-0.5*block)` at 320x224 (`tools_py/parity/compare.py:
  1-27`); `score_title` and TITLE_MIN_SCORE 90 over the s00..s18 window (`tools_py/parity/gate.py` L80-107, L200-219);
  crop references `scripts/parity/refs/refs.json`; the dialog-text band method (rows 47..62 x cols 36..125 of the
  160x112 thumbnail, threshold 8; `scripts/parity/save_empty_card.txt`); the 4:3 letterbox correction (KNOWN
  [online-7pct]).
- **Today:** `tools/console-compare.ts` (one camera pose, M51), `tools/compare-to-ref.ts` (lighting ratios), Playwright
  e2e specs (`packages/viewer/e2e/`, behavioural, not frame-golden).
- **Gap:** a step-script runner over the page, a settled-screen detector, 640x448 capture, a port of `compare.score` (or
  a call to it), a report writing a manifest in the recomp format, and a **masked-background scoring rule**: a screen
  whose BACKGROUND is a movie (dlgMenu over MENULOOP) is scored with that region excluded from both frames while the
  page draws the background black (before PLAT-19b), so a dialog's chrome can be scored before movies decode.
- **Acceptance:** calibration: the harness scores archived recomp captures against PCSX2 with the same numbers
  `compare.py` produces (no game run needed); `gate --score-title` accepts a directory the harness wrote; planted
  negative control: a black frame scores < 90; the masked rule pinned by a test (a frame differing only inside the
  mask scores as identical; one differing outside it does not). It needs no runtime, so it is dispatched first in
  this section and every BOOT, MENU and OPT acceptance can use it from the start.
- **Dependencies:** PLAT-03 (a page that presents a 640x448 frame). **Size:** L.
- **Unknowns:** settle detection on animated screens (PC research 64: fade timing makes s06 vary).
- **Owner calls:** none.
- **Merged from:** platform PLAT-23; boot BOOT-02; menus MENU-30 (b, c).

### PLAT-29a -- Load budgets: per-phase instrumentation and the budget table
- **Goal:** a measured time per phase (first byte -> Sony logo -> main menu -> lobby -> map), logged, with no threshold
  yet.
- **What the original does:** the boot order (BOOT-01); the menu init loads READERC, UIZANIM (1.2 MB), LOC, fonts, UI
  textures and HUDUI (`FUN_001f4860`).
- **Today:** `viewer/src/scheduler.ts` (first-draw uploads 690 ms Frostfire, 1,703 ms Crossroads, in its header),
  `compileQueue.ts`, `warmSet.ts`; web research 71 §1.7 cites the 30 s budget.
- **Gap:** the phase marks and a budget table; a perf run per phase from the ISO and from the served tree.
- **Acceptance:** a Playwright perf spec records time-to-first-Sony-frame and time-to-main-menu from a local ISO on the
  dev host and writes the table (no pass/fail threshold); results logged in the sprint Log. Dev-host only.
- **Dependencies:** PLAT-03. **Size:** S.
- **Unknowns:** none.
- **Owner calls:** none (the threshold is PLAT-29b's).
- **Merged from:** platform PLAT-20 (the measurement half). Split from PLAT-29 on 2026-10-01.

### PLAT-29b -- Load budgets: the threshold
- **Goal:** the owner's 30 s first-load rule enforced on the phase it covers.
- **What the original does:** n/a (the owner's rule).
- **Today:** PLAT-29a's table.
- **Gap:** the threshold; prefetch while movies play; the movie decoder's cost (PLAT-19c) counted.
- **Acceptance:** PLAT-29a's spec fails at the threshold set by the owner's ruling.
- **Dependencies:** PLAT-29a, PLAT-19c. **Size:** S.
- **Unknowns:** the ruling's exact scope (first map or first menu) -- the owner's text.
- **Owner calls:** which phase the 30 s covers; whether menu movies may stream while assets load.
- **Merged from:** platform PLAT-20 (the threshold half).

### PLAT-31 -- The golden capture manifest for the front end
- **Goal:** one manifest (screen/state -> capture path -> method) of the console and recomp references every task
  validates against, filled by the capture tasks (BOOT-01, OPT-19, ONL-32; PLAT-36 for traces).
- **What the original does:** existing coverage: boot to briefing (`D:/socom_archive/parity/golden/s00..s19`, table in
  `docs/parity/REPORT.md`); the online path to the game lobby (`logs/parity/s4_pcsx2/A_00..A_55`, `B_*`); the virgin
  card run (`logs/parity/virgin_card/`); the title gate (`logs/parity/gate/x51_gate_iop/title/`); options
  (`logs/parity/runs/options_explore/`, `presets_explore/`, `D:/socom_archive/parity/s10_audio_options/`); saves
  (`D:/socom_archive/parity/s8_save_yes/`); logoff (`logs/parity/s17_q2_logoff/online1/`); chat (PC research 66 rounds);
  68 tracked crops in `scripts/parity/refs/`; the owner's `orig-armory-select.png` / `orig-armory-weapon.png`. None
  for: extras, credits, career stats, friends, clan pages, controller options, card fault dialogs (PC research 80 §3).
- **Today:** none in SOCOM Legacy.
- **Gap:** the manifest and the "screens without a frame" list.
- **Acceptance:** every row filled with a path and a method; frames stored outside git (D: archive, `logs/`). The
  manifest owns *screen or state -> capture path -> method*; PLAT-01's matrix cites its rows by id.
- **Dependencies:** PLAT-06 (the screen list). **Size:** M (mostly capture time, done in the segment tasks).
- **Unknowns:** which screens PCSX2 can reach offline without a server (online screens need ours: R293).
- **Owner calls:** PCSX2 captures are lock-bound game runs, so the owner schedules the window (a HUMAN_TASKS row).
- **Merged from:** platform PLAT-24; menus MENU-30 (a).

### PLAT-32 -- Script and state trace goldens from the recomp
- **Goal:** golden traces of the original's UI script execution (animation start/stop, command, valve writes,
  SWITCHMENU) per frame: the step that raises PLAT-07, PLAT-09, PLAT-10 and MENU-01 from "reading" to "proven". It is
  their **Proven by**, never their dependency.
- **What the original does:** the code paths in PLAT-07; the recomp traces calls (`PS2X_CALL_TRACE`, PC research 09,
  78 §1) and dumps rdr trees from RAM (`tools_py/rdr_tree.py`).
- **Today:** none.
- **Gap:** a trace hook on the zAnim dispatcher and VALVE in the recomp (an env flag), a trace format, a TS replayer
  comparing the runtime's own trace.
- **Acceptance:** for the main menu (60 s idle plus a fixed button script), options and the ARMORY, the TS runtime's
  trace equals the recomp's event by event, frame index within +-1.
- **Dependencies:** PLAT-07 (its trace format). Also main-project recomp work and a game run under the loop lock
  (owner calls). **Size:** L.
- **Unknowns:** the hook point (`FUN_0025e*` dispatch) -- a decomp and recomp read.
- **Owner calls:** whether the recomp may gain a tracing flag for this (main-project work).
- **Merged from:** platform PLAT-25; menus MENU-30 (d).

### PLAT-33 -- Audio goldens
- **Goal:** compare front-end audio (movie PCM, music streams, UI one-shots) against recomp dumps and PCSX2 recordings.
- **What the original does:** existing tools `tools_py/parity/audio_corr.py`, `audio_envelope.py`, `audio_parity.py`;
  refs `scripts/parity/refs/audio_*.pcsx2.json`, `voice_ref.wav`; the music-only capture method (KNOWN [989snd-decomp]).
- **Today:** none in SOCOM Legacy (web research 81 §11 verifies sounds by unit tests).
- **Gap:** an offline render of a scripted screen (OfflineAudioContext) and the comparison.
- **Acceptance:** main-menu audio for 30 s correlates >= 0.99 against the recomp dump (the KNOWN [mission-music]
  method).
- **Dependencies:** PLAT-20, PLAT-22, PLAT-23. **Size:** M.
- **Unknowns:** PLAT-22's. **Owner calls:** none.
- **Merged from:** platform PLAT-26.


### PLAT-38 -- The browser's video settings page: performance options, an FPS overlay, a no-GPU notice
- **Goal:** players on weak or GPU-less machines can get a playable frame rate, and can see it: one browser video
  settings page carrying a render scale with presets, further performance options, an FPS overlay and a no-GPU notice.
  Product track (OT.R53): a browser adaptation, labelled as one on the page; at its defaults none of it changes what the
  game draws, and the original's own VIDEO OPTIONS screen (segment 04's evidence row O5, reached from OPT-09's OPTIONS
  screen) stays as it is.
- **What the original does:** nothing here: the PS2 original has no render scale, no performance options, no frame-rate
  readout and no renderer notice (its VIDEO OPTIONS are BRIGHTNESS, TEAMMATE NAMES, VIDEO MODE, HELP WINDOWS, HEAD BOB
  and SCREEN POSITION: [04](04-options-memory-card.md)'s O5). Every item is an adaptation with no original.
- **Today:** the knobs are scattered and none is a player's setting: the device-pixel-ratio cap of 2
  (`packages/viewer/src/renderer.ts`, `setPixelRatio`), the match viewport's ratio cap (`matchViewport.ts`), the owner's
  experimental graphics settings (`experimentalGraphics.ts`, HUMAN_TASKS H135); a frame-rate readout only in the dev
  panel (`devPanel.ts`, `dev-panel-fps`) and the renderer's counts only in the dev hook (`renderStats.ts`, PRF-4); no
  notice when WebGL runs on a software renderer.
- **Gap:**
  - **(a) The page refactor** -- one browser video settings page that the options below hang off, separate from the
    console's VIDEO OPTIONS screen, taking over the scattered knobs above.
  - **(b) Render scale** -- a resolution scale below native (with the device-pixel-ratio cap), with presets
    (e.g. Performance / Balanced / Quality); the default unchanged. Weighed against LATER 295 (aliasing at small render
    sizes).
  - **(c) Further performance options** -- the expensive passes switchable (FXAA, shadows or effects where present),
    each defaulting to today's look.
  - **(d) An FPS overlay** -- an on-screen frame rate (and frame time) toggle on the same page, a labelled instrument.
  - **(e) A no-GPU notice** -- when WebGL reports a software renderer (SwiftShader, llvmpipe, "Microsoft Basic Render")
    or hardware acceleration is off, a message saying so, with a link to a help page on turning on hardware
    acceleration in the browser; the help page's content and where it lives are part of the task. (built: CPS-4c,
    `softwareRenderer.ts`)
- **Acceptance:** at the defaults the page draws what it draws today (a unit test pins each default to today's value:
  the scale at the ratio cap, every pass on); each preset sets its stated scale and passes (unit tests); the FPS overlay
  is off by default and shows the frame rate and frame time when on (a unit test over its sampler, a rendered browser
  run seeing it); the notice shows for a software renderer's string (SwiftShader, llvmpipe, Microsoft Basic Render
  Driver) or a failed hardware context and never for a hardware one (unit tests over the renderer strings), and its
  link reaches the help page; every option is labelled on the page as a browser adaptation; the client profiling
  lane's runs (CPF: local with a real GPU, AWS with software rendering) measure each preset before and after, quoted in
  the sprint's plan Log.
- **Dependencies:** none (the client profiling lane CPF is a plan, not a backlog task: Unknowns). **Size:** M.
- **Unknowns:** which options buy the most frames -- the client profiling lane's GPU runs settle it (CPF's plan,
  `docs/plans/2026-10-28-client-performance-compare.md`, on `agent/cpf` until that lane lands); the renderer strings
  each browser reports under software rendering (`WEBGL_debug_renderer_info` may be withheld); the help page's content
  and where it lives; how low the lowest preset may go before LATER 295's aliasing.
- **Owner calls:** placed by the owner, Craig, in the dispatch seat 04, 2026-10-29 (before 20:45Z), asked "active next
  sprint, or future scope": "Active, next sprint" -- sprint 42, paired with the client profiling lane's (CPF) GPU runs.
  The presets' names and steps are a product-track matter of taste, the controller's (OT.R53).
- **Merged from:** none (asked by the owner 2026-10-29, from the BOP / CPF performance work: client FPS on low-end
  hosts).

### PLAT-36 -- The trace window: the recomp runs every reading-level task names for its proven level
- **Goal:** one owner-scheduled window of recomp trace runs that turns each task's "reading" into "proven", so no
  window is spent and reopened per task.
- **What the original does (the instruments, all existing):** `PS2X_RDRAM_DUMP` + `tools_py/rdr_tree.py`;
  `PS2X_CALL_TRACE` (PC research 09, 78 §1); `PS2X_MPEG_TRACE` (PC research 09 L76-80); `PS2X_AUDIO_DUMP` and
  `PS2X_AUDIO_TRACE`, the 989snd play and `stream start` log lines; `PS2X_MC_TRACE` (`MemoryCard.cpp:148`); `PS2X_PEEK`;
  `PS2X_HOST_GAMEPAD` input traces; the `[sceCd*]` log.
- **Today:** archived runs cover some of it (PC research 09's MPEG trace; the `s8_save_yes` card); none was taken for
  these tasks.
- **Gap:** the runs, each feeding the named tasks:
  - RDRAM dump of `dlgMenu` and `dlgOptions_Menu` live: PLAT-05 (c).
  - CALL_TRACE on `FUN_0027e720`/`0x27eb10`/`0x27d190` and the binding dispatcher `FUN_002745a0` from boot to the
    options and extras: PLAT-10, PLAT-16, BOOT-04, MENU-01. [Added 2026-10-02 at PLAT-31's merge, web research 113:
    the manifest owes four dialogs with no frame to this trace, so the run also covers MULTIPLAYER / LAN ->
    `dlgMPswitch` -> `dlgNetLogin` and the NetGUI return (and A_30's card-check order, research 113 section 5), the
    debriefing (`dlgDebriefing`), the game-complete flow (`dlgGameComplete`) and `dlgHype`: PLAT-31.]
  - MPEG_TRACE boot-to-menu and a 300 s idle through two attracts: PLAT-21, BOOT-07.
  - 989snd and audio dump/trace on the title, the main menu and the online menu: PLAT-20, PLAT-22, PLAT-23, PLAT-33,
    MENU-02, MENU-06, OPT-10.
  - MC_TRACE of a boot per card state and of an options save: PLAT-26, BOOT-05, OPT-01, OPT-02.
  - PEEK of `LanguageChoice` after `load_initial_config`, of the engine state at the menu per fixture card, of the
    stats block 0x66a750..+0x100 after a local-stack match: BOOT-08, OPT-18, SVC-12b.
  - a first-person frame (d-pad Up once from third person on an M4A1) with a PEEK of the body's `+0x200`: MATCH-04.
  - `PS2X_HOST_GAMEPAD` input traces per preset: OPT-13, OPT-14.
  - the `[sceCd*]` log boot-to-lobby and a VBlank count over a scripted WAIT: PLAT-03, PLAT-12.
- **Acceptance:** each run's log is archived outside git with a manifest row (PLAT-31) naming the task it proves; two
  runs of the same script give the same trace modulo times.
- **Dependencies:** none (an owner window: lock-bound game runs; R293: local stack only for the online parts).
  **Size:** M (about ten short driven runs).
- **Unknowns:** none.
- **Owner calls:** the window (a HUMAN_TASKS row).
- **Merged from:** the 2026-10-01 revision (the trace needs the tasks named but no capture task listed).

## H. Transition work

### PLAT-34 -- Fold the ARMORY into the generic runtime
- **Goal:** the ARMORY becomes the first client of PLAT-05..PLAT-10 instead of a bespoke state machine, its passing
  behaviour pinned.
- **What the original does:** web R95 §3, §4 (the STATE TABLE S0-S7).
- **Today:** s5 `armoryState.ts` (512) is a hand transcription, merged on this branch (`4c6cf5e8`). Sprint 5 is still
  open: its plan's Log (`docs/plans/2026-09-30-web-sprint-5-armory.md`) records S0 and S1 passed, the browser
  verification DEFERRED, and the owner's 2026-10-01 01:45Z play-test with open defects ("the sprint is not finished
  until these are resolved"). Its valves (`viewer/src/uiScript.ts`) differ from `FUN_00353fd0` at L155 (`'true'`), L164
  (`'|~'`), L156-165 (the operand unmasked) and L175 (`-=` with a negative operand), and live in a per-context Map with
  no watchers (L187) -- all latent: no shipped ARMORY script exercises them (web R104 §7, R95 §1.3's correction).
  2026-10-04 (ARMORY-FIX, R95 §8): the screen's 640x448 frame is fitted whole into the window and letterboxed, as the
  menus are (ARMORY_FRAME_FIT, the owner's defect, his `0eb90a69`), so it can sit in the lobby flow at any window
  shape; and the preview's focal is the source's 457.0074 px per unit (research 182 §2.29, D:L217205), not 540.8 --
  the models 15% smaller, centred on `EquipWeapWin` (`MODEL_CAMERA_READING`, `UI_CAMERA_READING` answered).
  2026-10-04 (ARMORY-UI, web sprint 17; the owner's report on the confirm popup; research 182 §7): PLAT-34's UI parity
  applied in the viewer's ARMORY without the fold -- the confirm opens on NO and its TRIANGLE does nothing; the popup
  laid out from record 1245 through `@s2u/ui`'s `readPopupRecord` (research 118 §3); every quad sampled at S/T
  0.01..0.99 (the gold frame 2 px); opacity multiplied down the tree (`pushOpacity`); every script `SOUND` and the three
  implicit cues played; a stored profile re-validated per item; the panes' text the item's `Description`. The capture
  that would score the popup is owed (HUMAN_TASKS; `e2e/armoryPopupScore.spec.ts` waits for it).
- **Gap:** after sprint 5 closes, replace `armoryState` logic with the scripts run by the runtime plus host rows; the
  loadout's store is the card's `WeapProfile_%d.dat` (OPT-20), not `s2u.armory.v1`; `uiScript.ts`'s valves give way to
  `@s2u/ui`'s `ValveStore` (web R104).
- **Acceptance:** the existing ARMORY vitest and Playwright specs pass unchanged; frames match `orig-armory-select.png`
  / `orig-armory-weapon.png` at >= 90.
- **Dependencies:** PLAT-07, PLAT-08, PLAT-09, OPT-20; the sprint 5 close. **Size:** M.
- **Unknowns:** the readings in web R95 §8.
- **Owner calls:** timing relative to sprint 5's close.
- **Merged from:** platform PLAT-29.

### PLAT-35 -- The remaining docs for the new mission
- **Goal:** every SOCOM Legacy doc states the mission, the campaign skip and the owner's readings.
- **What the original does:** n/a.
- **Today:** done in `e1ce531d`: `docs/MISSION.md`, `README.md`, `CONTRIBUTING.md`, `docs/PROCESS.md`,
  `docs/DATA_SOURCES.md` (the reCOM thanks included). Not yet: `docs/ARCHITECTURE.md` (the new packages, the front-end
  state flow); `DATA_SOURCES.md` "The data, kind by kind" rows for dialogs/UI scripts, locale, movies, music/VO streams,
  RAW images and the memory card; `tools/corpus.ts` (around line 229) still describes the README as "what the viewer
  is" and does not list MISSION.md or this roadmap; `landing/src/claims.test.ts` and the site credits if claims
  change; the root `README.md`'s web paragraph; a plans index (`docs/plans/README.md`) or the README's "Start here".
  The corrections listed in [README](README.md#corrections-found-on-the-way).
- **Gap:** the list above.
- **Acceptance:** `landing` claims tests stay green; the corpus is rebuilt by the controller; a review against the
  list.
- **Dependencies:** none. **Size:** S.
- **Unknowns:** none.
- **Owner calls:** the mission readings (README "Owner's calls").
- **Merged from:** platform PLAT-27 (a draft id of the platform report, not the roadmap's PLAT-27).

---

*Folded elsewhere:* platform PLAT-21 (RAW images) is BOOT-02; platform PLAT-30 (server persistence) is SVC-04.
*Split on 2026-10-01 (ids kept as sub-ids):* PLAT-19 -> PLAT-19a/b/c; PLAT-29 -> PLAT-29a/b.
*Dropped on 2026-10-01 by R7 (ids kept, blocks marked "(dropped)"):* PLAT-27 (the card file codec), PLAT-37 (the
`.ps2` filesystem).
