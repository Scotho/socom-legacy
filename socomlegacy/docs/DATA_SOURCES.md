# Where the data comes from

Every picture, sound, movement and rule the web port shows comes from one of four places: **your own copy of the
disc**, **the game's own code** (read through a decompilation of the executable on that disc), **reCOM** (an
open-source re-implementation of SOCOM 1's engine, used only where the decompilation is silent), and **frames captured
from the console** (for checking the picture). This page lists, for each kind of data, where it comes from, the code in
this repository that reads it, and how it was checked. The same facts, as machine-readable records, are in
[`corpus/`](corpus/llms.txt).

These four are how the match side -- the maps, the SEAL, the round -- was sourced. The project's goal is now the whole
of SOCOM II from boot to online, the campaign out of scope for now. Its rules of evidence are
[`MISSION.md`](MISSION.md)'s: [the parity rule](MISSION.md#the-parity-rule) (the original is the specification), and
the truth rule (RS.R7, "The sources of truth"): redotcom's notes at their confidence and the placeholder ledger are the
truth; the desktop recompilation's documents are evidence, cited at a commit, never instructions. A menu, a screen or
a memory-card record added under the mission gets a row here as the data below do.

## The stance: your disc for the site; decoded data may live in the private repository

- **You supply your own disc.** The page opens your own SOCOM II (US) `.iso` and reads it in the browser: nothing is
  uploaded, nothing is stored on a server. The development tools read an extracted copy of the same files.
- **No build of this repository hosts game data** (it is not deployed, OT.R31; the owner's nightly, OT.R46 of
  2026-10-12, is deployed and hosts none either: `socomlegacy/deploy/nightly.sh` refuses a build with disc files, a maps
  tree or startup media) -- no archives, textures, models, sounds, clips, scripts, executable or
  decompilation -- and the build copies no disc data into what is deployed. Unchanged by RS.R8 (its item (d)). **The
  old exception, the owner's:** socomunzipped.com -- since OT.R31 served from another repository, Scotho/socom-unzipped,
  not from this one -- serves an extracted tree (the maps, the menu movie, HUD sounds), sanctioned by the owner until
  that site goes disc-only ([`HUMAN_TASKS.md`](HUMAN_TASKS.md) H64). No agent widens it. **2026-10-04, a second exception, the owner's (OT.R34, "add an exception for the bg video"):** a build ships the setup page's background video (`public/startup/menuloop.mp4`, cut from the disc's MENULOOP.PSS, and its poster) whenever the file exists; it stays git-ignored and is never committed. The Crossroads captures (`modern.jpg`, `ps2.jpg`) shipped only when `VITE_S2U_SHIP_STARTUP_MEDIA=1` was set at build time. **2026-10-17 (CX-13):** no build ships either any more -- nothing on any page has read them since CX-9b, and the pipeline that made and copied them (`tools/capture-startup.mjs`, `startupMediaShip.ts`, the `__STARTUP_MEDIA__` define, the static host's `/startup/` route) is removed; the exception stands as the owner's word, unused.
- **The repository is private, and RS.R8 (2026-10-02, [MISSION](MISSION.md) "Game data in git") readjusts what it may
  hold:** data decoded from the disc -- names, ids, tables, constants, sizes and hashes of disc files -- may be
  written in notes, tests and pinned files; disc-derived test fixtures and reference captures (goldens) may be
  committed under named directories within a size policy. The policy (2026-10-02, adopted: the owner confirmed it that
  day, [`HUMAN_TASKS.md`](HUMAN_TASKS.md) H71) names `test-fixtures/`: its committed tier is 19 disc files, byte copies
  of the disc's, tracked since their own `data(fixtures)` commit, each listed in `test-fixtures/MANIFEST.json` with its size, sha256 and the tests that read it (at
  most 16 MiB a file and 100 MiB in all; `RUN/SOUNDS/BNKSTORE.ZAR` and the mini images stay local-only, git-ignored).
  `public/maps/` is still git-ignored. Credentials, tokens, keys, personal data and private reports still never are. If
  the repository is ever made public, those fixtures, goldens and the history that holds them are purged first
  ([`HUMAN_TASKS.md`](HUMAN_TASKS.md) H60).
- **The research notes cite the code, they do not paste it.** Decompiled functions are cited by address and line
  (`FUN_<addr>`, `D:L<line>`); the decompiled text itself is not quoted into the tree. Decoded disc data may be
  quoted (RS.R8).
- **The multiplayer server reads the disc files it needs from a private directory** and never serves them
  ([`../deploy/README.md`](../deploy/README.md)).
- **A development build can serve extracted files from your machine** for your own testing (`?devmode`); that path
  is for development only and is not how the page is meant to be used. **socomunzipped.com serves such a tree, from another
  repository since OT.R31, by the owner's choice and for now** (`/socomlegacy/maps/`, the development mode's reads; the site also plays the game's
  menu movie and HUD sounds, cut from the owner's disc). The page itself still reads the visitor's disc; the move to
  disc-only is the owner's row H64 in [`HUMAN_TASKS.md`](HUMAN_TASKS.md) (its section 11 carries row O28, moved there
  from the root `docs/HUMAN_TASKS.md` when the desktop tree left, 2026-10-02), and the site's credits said the same
  (`landing/src/claims.test.ts`, gone with the landing workspace, retired by OT.R30).
- SOCOM II: U.S. Navy SEALs and all of its assets belong to Sony Interactive Entertainment; the game was developed by
  Zipper Interactive. This project is not affiliated with or endorsed by either. Obtain the game only as your own copy.

## Getting the files for development

The page needs nothing but your `.iso`. The tools and the tests need the files on disk:

1. Make an extracted tree from your own disc: mount the `.iso` (double-click on Windows, `hdiutil attach` on macOS,
   `mount -o loop` on Linux) and use its `RUN/` directory, or use the one the PC project's disc chain writes to
   `game/disc/` (`desktop@be557831:docs/DEVELOPING.md:470`, "From your own disc to a buildable ELF").
2. From the repository root: `SOCOM_DISC=/path/to/disc npm run extract-maps`. It copies the 22 `RUN/MP*.ZDB` map archives and the
   shared archives (`COMMON_ARCHIVES` in `packages/archive/src/mapIndex.ts`) into `public/maps/`, three maps into
   `test-fixtures/`, and writes `index.json` with each map's name read from its own `mission.rdr`. By default (the
   forge plan's FG.R25) it copies the campaign's twelve `RUN/M51..M83.ZDB` (`CAMPAIGN_ARCHIVES`, the same file; about
   195 MB) into `public/maps/RUN/` too, for the forge only (FG-22): `index.json` still names the multiplayer maps alone.
   `--without-campaign` leaves them out.
3. The fixture-backed tests skip themselves when a file they read is absent, so the suite runs without a disc. A
   clone carries `test-fixtures/MANIFEST.json` and the files of its committed tier, so most of them run without a
   disc; the extract adds the local-only
   `RUN/SOUNDS/BNKSTORE.ZAR` and rewrites none of the committed files already present (they are the disc's own bytes).

## The data, kind by kind

The research notes are in [`research/`](research/); `repo/NN` is a note of the PC project's own research
(`desktop@be557831:docs/research/`).

### Maps

| data | on the disc | read by | verified by |
|---|---|---|---|
| Containers | `RUN/MP*.ZDB` (22), each a table of ZAR/ZED v2 members | `@s2u/archive` `zdb.ts`, `zar.ts` | research 72 §1 (281 members of five archives, then all 22 maps); `archive/test/zdb.test.ts`, `zar.test.ts` |
| Map names, lighting, units, texture wrap, detail bindings | the map's compiled `.rdr` scripts (`mission.rdr`, `mp<N>_lib.rdr`) | `archive/src/rdr.ts`, `archive/src/mapIndex.ts` | research 72 §2, §7; `archive/test/rdr.test.ts`, `mapIndex.test.ts` |
| Geometry | `WORL_MDL.ZED`, `MP*_MDL.ZED`: PS2 DMA chains of VIF1 packets | `@s2u/mesh` (`dma.ts`, `vif.ts`, `interpret.ts`); lane meanings in `packages/mesh/SEMANTICS.md` | research 72 §3-4, `repo/13`, `repo/15` (the VU1 programs); `mesh/test/*` |
| Textures and palettes | `MP*_TXR.ZED`, `MP*_PAL.ZED`, and the shared `COMMON` libraries | `@s2u/gs` (`decode.ts`, `palette.ts`, `gsState.ts`); `npm run dump-textures` | research 72 §5, research 82 D3/D3b; `gs/test/*` against recorded goldens |
| Placement | `MP*_GEO.ZED` (scene graph), `CLUTTER.ZAR` | `@s2u/scene` `sceneGraph.ts`, `buildScene.ts`, `clutter.ts` | research 72 §2; `scene/test/scene.test.ts`, `clutter.test.ts` |
| Collision and floor | the `di` keys of `MP*_GEO.ZED` | `scene/src/collision.ts`, `probe.ts`, `grid.ts` | research 72 §6, `repo/23`, `repo/24`; the console's actor-measured spawns land within -3..+1 of the probe; `scene/test/probe.test.ts`, `grid.test.ts` |
| Spawn slots, tactical map | `AIMAPS.MPS` (not a ZAR) | `scene/src/aimaps.ts`, `tools/dump-aimaps.ts` | research 75 (read to its last byte; all 1,058 slots stand on the floor); `scene/test/aimaps.test.ts` |
| LOD, fog, scrolling, facades, culling | `READERM.ZAR/lod.rdr`, the world root, node flags, GIFtags | `scene/src/lod.ts`, `viewer/src/fog.ts`, `lodFade.ts` | README "What the picture is made of"; research 82; `viewer/test/fog.test.ts`, `lodFade.test.ts` |
| One map to glTF | any of the above | `npm run export-gltf` | for Blender or a glTF validator |

### The player and the weapons

| data | on the disc | read by | verified by |
|---|---|---|---|
| The SEAL's mesh, skeleton and gear | `CLIB_MDL.ZED`, `CLIB_GEO.ZED`, `FLIB_*`, `READERC.ZAR/character.rdr`, `READERM.ZAR/chartype.rdr` | `mesh/src/skin.ts`, `scene/src/skeleton.ts`, `character.ts`, `viewer/src/body.ts`; `tools/dump-characters.ts` | research 78 (411 meshes, 0 failures; the palette is the bind pose to 0.0017); `scene/test/skeleton.test.ts`, `character.test.ts` |
| Motion clips | `RUN/MOTION_P.ZAR` (the player's 334 clips), `MOTION_S.ZAR` per map | `scene/src/motion.ts`; `tools/dump-motion.ts` | research 77; `scene/test/motion.test.ts` (all 22 maps and the player's pack) |
| Clip playback, speeds, gravity, jump factor | `READERC.ZAR/motion.rdr`, `animset.rdr`, `dynamics.rdr` | `scene/src/tuning.ts`, `viewer/src/motionTable.ts`, `physics.ts` | research 80, 88; `scene/test/tuning.test.ts`, `viewer/test/walk.test.ts`, `feelParity.test.ts` |
| Weapon records | `RUN/ZWEAPON.ZAR/zweapon.rdr` | `scene/src/weapons.ts`, `weapon.ts` | research 84 §1, 85 §1, 91 §1.2; `scene/test/weapons.test.ts` |
| Weapon models, the fire point | `WEAP_GEO.ZED`, `WEAP_MDL.ZED` | `scene/src/firePoint.ts`, `viewer/src/heldItem.ts` | research 79 §2-3 (59 weapons decode on all 22 maps) |
| Kits and default loadouts | `character.rdr`, each map's `chartype.rdr` | `scene/src/character.ts`, `arsenal.ts` (`mapKits`), `viewer/src/kit.ts` | research 91 §14, 94 §A4; `viewer/test/kit.test.ts`, `scene/test/arsenal.test.ts` |
| The runtime kit: each slot's record, model and icon | `RUN/ZWEAPON.ZAR` (read at run time by the page, its own match and the server), `READERM.ZAR`, `READERC.ZAR`, `WEAP_GEO`/`WEAP_MDL.ZED`, `HUDW_TXR.ZED` | `scene/src/arsenal.ts` (`kitTableOf`), `viewer/src/loadout.ts`, `loadMap.ts` (`heldWeapons`), `hudAssets.ts`; `match/src/room.ts` | research 94 §A6, §A7, §C9; `viewer/test/loadout.test.ts`, `heldWeapon.test.ts`, `central/test/room.test.ts` |
| Each side's arsenal per map, the menu's rules | each map's `READERM.ZAR/mission.rdr` `Valves` (1 SEAL, 8 Terrorist, 16/32 the C4 lock), read through the game's id-to-valve map (`FUN_003cf1f0`, code) | `scene/src/arsenal.ts` (`readMapArsenal`, `selectable`, `slotLocked`, `pick`, `applyPicks`) | research 94 §A2-§A5; `scene/test/arsenal.test.ts` (all 22 maps against §A4's table) |
| The weapon select (WEAPON EXCHANGE): states, layout, prompt | the decomp (`FUN_00240e60`/`FUN_00240600` and its callees) and the ELF's `.data` (positions, colours, rates); `newweapnbkrnd.tif`, `hud_arrow_off2.tif` and the items' icons from the map's HUD libraries; the prompt's pad glyphs from `FONT_TXR`'s `font_special_01.tif` with `fonts.rdr`'s 18 pad glyphs transcribed (`hudFont.ts` `FONT_SPECIAL_01`) | `viewer/src/weaponSelectState.ts`, `weaponSelect.ts`, `weaponExchange.ts` | research 94 part 2; `viewer/test/weaponSelectState.test.ts`, `weaponSelect.test.ts`, `weaponExchange.test.ts`, e2e `weaponExchange*.spec.ts` |
| Each class's fire rules, the launched rounds, the equipment | `zweapon.rdr`'s rare keys (`ReloadAfterShot`, `ReloadDelay(AfterShot)`, `ReloadTime`, `NumProjectilesFired`, `ArmingDistance`, `AccelerationFactor`, `HasBackblast`, `SlotCost`, `Timer1/2`, `ProximityDistance`) with the parser's defaults; the loft's and the dud's constants from `.data` | `viewer/src/firearms.ts`, `equipment.ts`, `rocket.ts`, `scene/src/projectile.ts`; `match/src/room.ts` | research 94 part 3; `viewer/test/firearms.test.ts`, `equipment.test.ts`, `scene/test/launched.test.ts`, `match/test/roomEquipment.test.ts` |
| Sights, the thermal scope, reticle sets | the records' `ZoomMode*`; the models' `scope`/`thermal_scope` nodes; the map's `MZANIM` `to_thermal_lens_fx` (`SCALE_COLOR`) | `viewer/src/sights.ts`, `lensFx.ts`, `reticle.ts` | research 94 §C6, §C7; `viewer/test/sights.test.ts` |

### Sound

| data | on the disc | read by | verified by |
|---|---|---|---|
| Banks | `RUN/SOUNDS/BNKSTORE.ZAR` (989snd `SBlk` v3 banks: per map `_am`, `_fx`, `_vc`, and `HUDUI`) | `@s2u/sound` `bank.ts`, `vag.ts` (SPU ADPCM), `render.ts`; read by HTTP range: the map's three banks and `HUDUI` (about 1.9 MB for Frostfire), plus a lent bank or two | research 81 §1-2; `repo/06`, `repo/36` and the PC project's 989snd model; `sound/test/sound.test.ts`; `npm run dump-sounds` renders any sound to WAV with its length, peak and RMS (research 81 §11) |
| Per-sound parameters | `RUN/SOUNDRDR.ZAR/sounds.rdr` (looked up by the CRC-32 of the sound's name) | `sound/src/script.ts`, `catalog.ts` | research 81 §3 |
| Footsteps and landings per surface | `READERC.ZAR/materials.rdr` (`SOILS`), the polygon's material byte | `sound/src/materials.ts`, `rules.ts`, `viewer/src/walkSounds.ts` | research 81 §4, §7; `viewer/test/audio.test.ts` |
| Reverb | `RUN/IRX/LIBSD.IRX` (the SPU2 presets) | `sound/src/spuReverb.ts` | research 81 §9 |

### Effects and the HUD

| data | on the disc | read by | verified by |
|---|---|---|---|
| Muzzle, casing, impacts, explosions, lights | zAnim scripts in `RUN/CZANIM.ZAR`, each map's `MZANIM.ZAR`, `RUN/MPZANIM.ZAR` | `scene/src/zanim.ts`, `effects.ts`, `effectMotion.ts`, `effectParticles.ts`; `tools/dump-effects.ts` | research 77 §9, research 89; `scene/test/zanim.test.ts`, `effects.test.ts` |
| Bullet marks and scorches | `decals.rdr` (`TEMP_DECAL_POOL` 150 + 50, `PERM_DECAL_POOL` 30 + 0: the scorch pool), `EFFE_TXR.ZED` | `viewer/src/markClip.ts`, `effects.ts`, `grenade.ts` | research 89 §5, §13-15; `viewer/test/markClip.test.ts`, `markShade.test.ts`, `grenadeScorchPool.test.ts`, `grenadeScorchSlope.test.ts` |
| HUD bitmaps and font | `HUD_TXR`, `HUD2_TXR`, `HUDW_TXR`, `FONT_TXR` (each with its `_PAL`), `READERC.ZAR/fonts.rdr` | `viewer/src/hud.ts`, `hudFont.ts`, `hudAssets.ts` | research 87 §2-3, §6: each element within a pixel of the console frame's; `viewer/test/hud.test.ts`, `e2e/hud.spec.ts` |

### The ARMORY (the pre-round loadout screen)

Read at run time in the worker for the map being played (`viewer/src/armoryData.ts`), from your disc image or the
development tree; the ten loose files are `ARMORY_ARCHIVES` in `packages/archive/src/mapIndex.ts`, which
`extract-maps` serves with the other shared archives.

| data | on the disc | read by | verified by |
|---|---|---|---|
| UI layout: every object, control, binding and preview camera | `RUN/UI/READERC.ZAR` -> `dlg_equipment_mp.rdr` (not `RUN/READERC.ZAR`), `uisounds.rdr` | `archive/src/rdr.ts`, `scene/src/uiLayout.ts` | research 95 §2 (226 objects, 22 controls, 67 models); `scene/test/uiLayout.test.ts` |
| UI scripts (zanim): the screen's behaviour, the item table (captions, fire modes, bars, tips, the spin) | `RUN/UIZANIM.ZAR` sets `dlg_equipment_mp.rdr`, `ShowAndSpin.rdr` (and the rest of the layout's `SCRIPT_LIBRARY`) | `scene/src/zanim.ts`, `uiZanim.ts` (`decodeUiProgram`, `armoryItemScripts`) | research 95 §1, §3 (every one of the 5,782 commands decodes); `scene/test/uiZanim.test.ts` |
| UI models (the spinning preview), bias form | `RUN/UI/UI_GEO.ZED` + `UI_MDL.ZED` (64 models), textures `UI_TXR`/`UI_PAL` | `scene/src/weapon.ts` (`weaponLibrary` with `UI_MODEL_FORM_READING`) | research 95 §5.3 (84 of 85 nodes on their bbox in the bias form, none in the scale form); `scene/test/weapon.test.ts` |
| UI bitmaps: chrome, bars, arrows, padlocks, portraits | `RUN/UI/UIMP_TXR`/`_PAL`; the map archive's `WSMP_TXR`, `WSLC_TXR`, `EMnn_TXR` (each with its `_PAL`) | `viewer/src/armoryData.ts`, `hudBitmaps.ts` | research 95 §5.2 (each `FILENAME` from the first of the layout's `LIBRARIES` that holds it); `viewer/test/armoryData.test.ts` |
| Fonts: `font_titlebar_01`, and `font_text_01` with its pad glyphs (`font_special_01.tif`) | `RUN/READERC.ZAR/fonts.rdr`; atlases in `UIMP_TXR` and the map's `FONT_TXR` | `scene/src/uiFont.ts` | research 95 §5.4 (166 and 185 glyphs, 18 pad glyphs); `scene/test/uiFont.test.ts` |
| Menu strings (UTF-8 pad glyphs) | `RUN/LOCALE/STATES/UIMNLOC.ZAR` -> `UIMnLOC.rdr` | `scene/src/uiLoc.ts` (`UIMNLOC_UTF8_READING`) | research 95 §5.5 (1,411 strings); `scene/test/uiLoc.test.ts` |
| Character types per map: body, kit, portrait | each map's `READERM.ZAR/chartype.rdr` and `mission.rdr` `UiVars`, `READERC.ZAR/character.rdr`, `RUN/ZWEAPON.ZAR` | `scene/src/armoryCharacters.ts` (`armoryRoster`), `arsenal.ts` (`mapKits`) | research 95 §6 (all 22 maps); `scene/test/armoryCharacters.test.ts` |
| The preview's light | `RUN/UI/UI.ZED` (the UI world root) | `scene/src/worldRoot.ts` | research 95 §5.1; `viewer/test/armoryData.test.ts` |
| UI sounds (`.DINK`, `.SLIDE`, `.NEG`, `.TYPE`) | `RUN/SOUNDS/BNKSTORE.ZAR` -> `HUDUI.bnk` | `viewer/src/soundData.ts` (already loaded) | research 95 §3.9 |

### The front end: boot, menus, card and online screens (the mission; web sprint 6 on)

Every class of these files is declared once, with how the original addresses it and the source that says so, in
`FRONT_END_CLASSES` (`packages/archive/src/frontEndFiles.ts`, PLAT-03); `archive/test/frontEndDisc.test.ts` holds the
class counts to the disc tree and the image (`SOCOM_DISC`, `SOCOM_ISO`). No screen of the front end is drawn yet; the
"read by" column is what reads the data today, and the roadmap task that will use it is named where it is not built.

| data | on the disc | read by | verified by |
|---|---|---|---|
| Dialogs (the `.rdr` screens): objects, controls, bindings, backgrounds | `RUN/UI/READERC.ZAR` (110 members: 103 `dlg*`, 4 `Common_*`, `mp_rooms`, `UiParams`, `uisounds`), `RUN/UI/READERX.ZAR` (4) | `archive/src/rdr.ts`, `scene/src/uiLayout.ts`; the inventory and flow graph `tools/dialogInventory.ts`, `tools/dump-dialogs.ts`; the generic loader is PLAT-05's | research 96 §1-§3 (R96.1-R96.6), research 95 §2; `tools/test/dialogInventory.test.ts`, `dialogInventoryDisc.test.ts` (the pinned inventory regenerates), `scene/test/uiLayout.test.ts` |
| UI scripts (zAnim sets): the screens' behaviour, the host commands they call | `RUN/UIZANIM.ZAR` (95 sets), `RUN/EXTZANIM.ZAR` (2), `RUN/MPZANIM.ZAR` (4); the binding table at 0x3dd4d0 in the ELF (207 rows) | `scene/src/zanim.ts` (`parseAnimSets`), `uiZanim.ts` (`decodeUiProgram`); the runner is PLAT-07's, the command table PLAT-08's | research 95 §1, §3; research 96 §1.2, §4; `scene/test/uiZanim.test.ts`; `tools/test/dialogInventoryDisc.test.ts` |
| Valves and UI variables (the scripts' global state; what the card persists) | `RUN/READERC.ZAR/global_valves.rdr` (185 valves, 65 PERSIST); each mission's `Valves`; the ops, watchers and longevity from the code | `@s2u/ui` `valves.ts`, `uiVars.ts` (PLAT-09) | research 104; `ui/test/*` |
| Locale (every string a screen shows) | `RUN/LOCALE/STATES/UIMNLOC.ZAR`, `UIMPXLOC.ZAR`, `UIXLOC.ZAR`, `HUDCLOC.ZAR` (1,411, 34, 45 and 440 strings); `UILDLOC.ZAR`, a member of every map archive (7); the four campaign tables (`ALB`, `ALG`, `BRAZ`, `RUSS`) deferred | `scene/src/uiLoc.ts` (`LOC_ARCHIVES`, `LocService`, `loadLocService`; PLAT-04) | research 103 (every caption id the dialogs and the zAnim sets name resolves but four, in no table; the main menu's six row labels are textures of `mainmenu_roller`, R103.8); `scene/test/locService.test.ts` |
| Movies | `RUN/MOVIES/COMMON/*.PSS` (15: `SONY448` -- the opening cards are its pictures --, `MENULOOP`, `TUT_01`-`TUT_10`, `ARTGALL2`, `MUSVID`, `CREDITS`), `RUN/MOVIES/INTRO_2.PSS`; the four `*_AOP.PSS` wait on MENU-05's owner call; `RUN/MOVIES/M*/` (49) are the campaign's | streamed in chunks by path (`archive` `streamFile`; `movieWorker.ts` `demuxPssFile(source, path)`) -- the original addresses them by LBN (`sceCdStStart`), this code by path through any ranged source, so a disc's files serve as well as its image (research 306 §1; `IsoAssetSource.extent`/`fileAt` map a sector to a file for a run log, not for play); decoded in the page from your own image (R3: libmpeg2 compiled to wasm), never shipped or pre-transcoded, save the setup page's background video, a transcode of `MENULOOP` the owner excepts (OT.R34) -- the demuxer is PLAT-18's, the decoder's wrapper PLAT-19b's | research 98 §1, §3 (the cards are SONY448's pictures); the spike PLAT-19a (research 98 §7); PC research 09, 16; `archive/test/frontEndDisc.test.ts` (`MENULOOP.PSS` read in chunks, its hash the whole file's) |
| Music and voice-over streams | `RUN/SOUNDS/VAGSTORE.ZAR` (577 MB): VPK music and VAGp voice-overs, each opened by `{sector, offset}` (`snd_PlayVAGStreamByLoc`) | located by name through the archive's own index and read by range within the file (`soundData.ts`, `menuMusic.ts`; the `{sector, offset}` words count from VAGSTORE's first sector), so by path, not by LBN (research 306 §1); a source without range reads loses the round's cues; the decode is PLAT-22's (inside `@s2u/sound`) | PC research 32 §6, PC KNOWN [mission-music]; `archive/test/frontEndDisc.test.ts` (20 members' sectors equal to `tools_py/iso_lbn.py`'s) |
| RAW images (the loading screen and its panels) | `RUN/RAW/*.RAW` (6): `LOADING.RAW` 640x448 CT32 in seven 640x64 strips, the `PU*.RAW` 640x128 panels | listed (`FRONT_END_CLASSES` `raw`); decoded and drawn by BOOT-02's `ui/src/boot/loaderScreens.ts` (`decodeRaw`, `composeLoaderFrame`; the blits `FUN_001c4cc0`) | PC KNOWN [raw-strips] (`FUN_001c6570`); `ui/test/boot/loaderScreens.test.ts` (the blits, the strips, the decode, the frame) |
| The memory card's contents | **none from the disc**: under R7 the card is two virtual slots in the browser's localStorage, in redotcom's own JSON (one record a slot: the card's state, a table of the original's file names at their nominal sizes, `ext`, a revision counter), and no game bytes are written or read; free space follows the recompilation's card stub against a virtual 8 MB card | `@s2u/card` `cardSlots.ts` (PLAT-25), handed the page's localStorage by `viewer/src/pageStore.ts`; libmc over it is PLAT-26's | research 99 §7; `card/test/cardSlots.test.ts`. For checking only, `tools/cardFile.ts` reads files the game wrote on real cards (the PC project's card fixtures and saves; research 102) -- a dev tool no package imports |
| The card's icons | `RUN/ICONS/` (13: `LIST.ICO`, `ICON.SYS`, the HDD, NETCNF and NTGUICNF sets) | listed (`FRONT_END_CLASSES` `icons`); under R7 nothing writes them to a card | `FUN_003a0a10` (roadmap 04 O14); the class count |

### Rules read from the game's code

Behaviour the data files do not hold -- how the stick becomes a speed, when a jump leaves the floor, how the reticle
opens, where a round goes, how much damage it does, when a player respawns, how the score is kept -- is read from the
game's code. The executable comes off your own disc (the PC project's `scripts/disc_to_elf.sh`); a headless Ghidra
export (`ghidra_scripts/ExportAll.java`) writes its decompilation. Neither is in the repository. The notes cite
functions as `FUN_<address>` with the decompilation's line numbers, and reCOM's source by file and line where the
decompilation is silent.

| subject | research | pinned by |
|---|---|---|
| Movement law, stances, falls | 80 §4, 88 §3, `repo/79` | `viewer/test/walk.test.ts`, `moveStick.test.ts` |
| The jump and the landings | 80 §2 | `viewer/test/walk.test.ts` |
| The look and the camera | 83, 80 §2.5, `repo/17` | `viewer/test/look.test.ts`, `playerCamera.test.ts` |
| Accuracy, recoil, fire modes, zoom, magazines | 84 | `viewer/test/accuracy.test.ts`, `zoom.test.ts`, `magazines.test.ts`, `e2e/accuracy.spec.ts` |
| Grenades: throw, flight, fuse, blast, arc | 85 | `scene/test/projectile.test.ts`, `throwArc.test.ts`, `viewer/test/grenade.test.ts` |
| Ladders, climbs, peek, water | 86 | `viewer/test/traversal.test.ts`, `e2e/traversal.spec.ts` |
| Damage, death, respawn, teams, score, names | 91 | `viewer/test/netDamage.test.ts`, `netLobby.test.ts`, `central/test/room.test.ts` |
| The blast on the player (reach, fragments, knock, ringing ears); the offline match | 85 §12, 91 §20 | `viewer/test/netBlast.test.ts`, `knock.test.ts`, `loopback.test.ts`, `ringingEars.test.ts`, `match/test/roomBlast.test.ts` |
| The server's fire and reload checks (rate, cone, reload lock) | 84 §18, 91 §16 | `central/test/room.test.ts`, `viewer/test/shotCone.test.ts`, `weapon.test.ts` |

A value no source gives is a named `*_PLACEHOLDER` constant with a comment saying what was searched, and a reading
the viewer had to choose is a named `*_READING`; each note lists its own by name in a section whose heading says
placeholders or readings. `tools/test/placeholderLedger.test.ts` holds the two in step: every such name in every package's
sources and the tools is in a note's section (on a row about it, not a mention in another's), a name a note lists that
no source holds any more is marked there, beside the name or in the row's status, as resolved, retired or note only,
and a constant whose doc -- the whole JSDoc block above it, on one line or several -- says `[reading]` or
`[estimate]` carries the suffix.

### The look, checked against the console

The picture is checked against frames the console drew, not against memory of it: PCSX2 captures of a live Vigilance
round and of the first campaign mission at a camera read out of the console's own memory, and frames of the recompiled
game at Frostfire's spawns. `tools/console-compare.ts` draws the page from the same camera and measures the difference
region by region; research 82 ranks every divergence found and how each was fixed. Most of those frames live on the
maintainer's machine; the small set the PC project's parity gate compares against is under `scripts/parity/refs/`. A
capture's record says which image the emulator ran (HAZARDS, sources): the retail disc and the patched image are
different evidence.

## Confidence

The notes and the [corpus](corpus/llms.txt) use three levels. The definition is word for word the same here, in
[`PROCESS.md`](PROCESS.md) "Confidence" (with the working practice around it), in [`MISSION.md`](MISSION.md) and in
the root `AGENTS.md` (`tools/test/conventions.test.ts` compares the four):

<!-- confidence-levels -->
- **proven** -- measured against the original running: a capture of the original scored by the harness, or a call,
  memory or audio trace of the original compared value for value, within a stated tolerance.
- **reading** -- transcribed from the original, not yet measured running: its code from the decompilation (cited
  `FUN_<addr>`, `D:L<line>`) or the disc's data through the repository's readers (cited by file and field, checked
  over every file that holds it); unit-tested against the transcription and re-read at the source by a reviewer who
  did not write it.
- **placeholder** -- not read yet: a named `*_PLACEHOLDER` or `*_READING` constant, listed in its research note with
  the evidence that would settle it.
- A value transcribed and cited whose review is still to come is **reading, pending review**: the author's report and
  pull request say so, and it counts as a reading only once the review has re-read it at the source.
- A note written before 2026-10-02 may call a value read off the disc's bytes "proven" (the earlier definition:
  "measured on the disc's bytes or a console frame"); under this definition that value is a reading, the older word
  is not a finding against the note, and the note is re-filed when it is next edited.
<!-- /confidence-levels -->

The data's view of it, and the test that pins each level:

- **proven**: the capture is a PCSX2 or recomp one scored by `tools/console-compare.ts` (the PLAT-30 harness), or an
  RDRAM / call / audio trace. Pinned by a **capture-scored** spec or a **golden trace** replay.
- **reading**: a value decoded off the disc is checked over every file that holds it (all 22 maps, every bank); what
  the game's code does with it is at the level of that code's own read. Pinned by a **transcription unit test** (the
  cited value, with its citation beside it) and, where the disc is needed, a **dev-disc test** (resolving
  `SOCOM_DISC` / `SOCOM_ISO` / `SOCOM_PC_ROOT`, skipping cleanly when absent).
- **placeholder**: `*_READING` is for a value chosen from a partial read or a measurement; the task that owes the
  answer is written in the note's ledger section. Pinned by the ledger (`tools/test/placeholderLedger.test.ts`),
  which refuses an unlisted name.

**How a claim moves up.** Placeholder to reading: the source is found, transcribed and cited, the transcription test
added, the constant renamed or its ledger row marked resolved, and a reviewer re-reads the cited lines (not the
author's summary). Reading to proven: the original is measured running and agrees within a stated tolerance; the
capture-scored spec or golden trace that measured it is the test (under RS.R8 its golden may be committed once the
size policy exists; until then it runs where the captures are and skips elsewhere). A claim a later measurement
contradicts moves down, and its note says so in place, struck, never deleted. **Where parity is established, a test
holds it**: a reading or proven behaviour without its regression test is owed one.

**The evidence ledger** (the habit of Chris's handoff, `chris/browser-beta-integration` d578f347,
`integrations/browser-beta-v5/INTEGRATION-HANDOFF.md` "Evidence ledger"): a physical playtest, a rendered browser run,
a unit test, a capture comparison and a source inspection are different kinds of evidence and are never merged into
one "pass"; a run on another build is not evidence for this one; a skipped, filtered or incomplete run is recorded as
skipped, filtered or incomplete with its counts, never as passed.
