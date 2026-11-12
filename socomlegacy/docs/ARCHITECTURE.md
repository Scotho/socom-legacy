# Architecture of the web project

How the browser port is put together, which parts are specific to SOCOM II and which are plain PlayStation 2, and
where to start if you want to do the same for another PS2 game. The facts behind every box below are in the research
notes (`docs/research/`); the notes are cited by number. What the port is for -- SOCOM II from boot to online, every
menu as the original draws it -- is [`MISSION.md`](MISSION.md); what runs today is the match side below, and the front
end's packages (`ui`, `fmv`, `card`) are being built under it ([The front end](#the-front-end-web-sprint-6-on)).

## The shape in one picture

```
             your own disc (an .iso opened in the page, or an extracted RUN/ tree)
                                         |
                                 @s2u/archive          ISO9660, ZDB, ZAR/ZED v2, compiled .rdr,
                                         |             the AssetSource the others read through
          +---------------+--------------+--------------+----------------+
          |               |              |              |                |
      @s2u/gs        @s2u/mesh      @s2u/sound      @s2u/scene        tools/
   textures, CLUTs  DMA chain, VIF1  989snd banks,   scene graph, grid,  extractors, dump and
   GS state blocks  unpack, vertex   SPU ADPCM,      collision probe,    compare instruments
                    lanes, skinning  reverb, rules   motion, weapons,
          |               |              |          tuning, zAnim,
          |               |              |          projectiles
          +---------------+------+-------+--------------+
                                 |                      |
                          @s2u/viewer               @s2u/central + @s2u/match
      three.js (WebGPU, WebGL2 fallback), a        Node + ws: one authoritative
      decode worker, the GS-arithmetic shading,    classic room per map at 60 Hz, fed by
      the walk, HUD, audio, effects, the net page  the SAME sim modules the page runs
                                 \                      /
                                  +--- src/sim.ts -----+   headless: no three, no DOM, no Web Audio

  the front end (web sprint 6 on; pure and DOM-free, a browser object enters as a parameter the viewer passes):
      @s2u/ui                         @s2u/fmv                        @s2u/card
   the valve store, UI variables,   the movie player (wasm/:        the storage interface, the page's
   the load-phase marks, the        libmpeg2's build; PLAT-18..21)  guarded Settings, two virtual card slots
   dialog loader; runtime to come   (no importer yet)                         |
          |                                            @s2u/viewer's pageStore.ts hands it localStorage
   @s2u/viewer imports its load marks (loadBudget.ts, main.ts, hook.ts)
```

Everything is TypeScript in one npm workspace (`package.json`, whose members are `redotcom`, `socomlegacy/packages/*`,
`socomlegacy/tools` and the design system `shared`; the landing workspace was retired by OT.R30). The packages are
not published to a registry; each exports its `src/index.ts` directly and Vite/`tsx` compile on the fly.

## The packages and their boundaries

| package | depends on | owns | never does |
|---|---|---|---|
| `@s2u/archive` | nothing | Reading bytes: the `AssetSource` interface and its file-system (`/node`), HTTP (with `Range`) and in-browser ISO9660 sources; the ZDB table of contents; ZAR/ZED v2 containers; compiled `.rdr` scripts; the served `index.json` | interpret what a member means |
| `@s2u/gs` | archive | The Graphics Synthesizer's side of a texture: PSMT4/PSMT8 with CT16/CT32 CLUTs, PSMCT16/32, the palette interleave, and the GS state each texture's bind packet sets (`ALPHA`, `TEX1`, `TEST`, `CLAMP`) | touch a GPU |
| `@s2u/mesh` | archive | Geometry as the PS2 sent it: the DMA-chain walk, VIF1 `UNPACK`/`STCYCL`/`MSCAL`, and the interpretation of each VU1 program's vertex lanes into `MeshData`, `LineStrip` and skinned batches. [`packages/mesh/SEMANTICS.md`](../packages/mesh/SEMANTICS.md) is the authority for every lane | know where a model is placed |
| `@s2u/sound` | archive | 989snd `SBlk` banks, headerless SPU ADPCM, the grain sequencer rendered at the game's volume and pan, the SPU2 reverb presets, `sounds.rdr`, the surface-material step table and the rules for when a sound plays | play audio (the viewer does, through Web Audio) |
| `@s2u/scene` | archive, mesh | The engine's world: the world root, the scene graph and its matrices, the engine's walk order and grid, clutter, the collision hull and the ground probe, `AIMAPS.MPS` spawns, LOD bands, the character skeleton and gear, motion clips, the SEAL's tuning, the weapon table, zAnim effect scripts, grenade flight | draw anything |
| `@s2u/viewer` | all of the above, `three` | The Vite app: decoding in a worker, the three.js scene, a shading graph that repeats the GS's arithmetic, the fly camera, the walk (mover, camera, clips, gunplay, grenades, traversal), the HUD, audio, effects, touch and pad input, the multiplayer page | run on the server, except through `src/sim.ts` |
| `@s2u/central`, `@s2u/match` (were `@s2u/server`, split by the server split's SA-3; `@s2u/host` beside them) | archive, scene, ui (the page's refusal texts, VERSION-ABORT's `versionRefusalText`), `ws`, and `viewer/src/sim.ts` by path | One classic match per map (respawn off, the owner's ruling of 2026-09-29; the respawn ruleset's rooms stay in the code behind `RESPAWN_RULES_ENABLED`, off, and would share the map's parse): the lobby, every player's mover run from its command stream, the shot cone and the round re-run, lag-compensated hits, grenade blasts on players (harm, knock, ringing), deaths, rounds, scores, 30 Hz snapshots; HTTP `/health`, `/rooms` (public, CORS `*`: each room's map, rules, player and spectator counts, round) and `/metrics` (host only behind Caddy). The page imports its `Room` too, for the offline match (`viewer/src/net/loopback.ts`), which a build with multiplayer off (`VITE_S2U_MULTIPLAYER=off`, the site's) keeps | serve the disc's files |
| `@s2u/ui` | archive, scene (guidance: archive, gs, mesh, scene, sound) | The front end's dialog runtime, under R7 and W6.R2. Today: the global valve store -- ops 0-18, the watchers, PERM/TEMP/PERSIST (`valves.ts`, PLAT-09) -- and the UI variables with their longevity and the order the card serializes them in (`uiVars.ts`); research 104. CONTROLLER OPTIONS' stick presets and the tuners' maps, the f32 getters and the watchers' setters (`stickTuners.ts`; OT.R72, research 302 §10). The load phases and their marks (`loadPhases.ts`: `PhaseMarks`, `DiscChoice`, `budgetTable`; PLAT-29a, research 100), which the viewer imports (`loadBudget.ts`, `main.ts`, `hook.ts`). The generic dialog loader (`dialog.ts`: `DialogLoader`, `loadDialog`) over the engine's depth-first reader-node lookups (`rdrLookup.ts`: `RdrLookup`); PLAT-05, research 105; no runtime calls it yet; its unit test (`packages/ui/test/dialogLoader.test.ts`) and a disc test (`tools/test/dialogLoaderDisc.test.ts`) do. The generic zAnim UI script runtime (`zanimRuntime.ts`: `ZAnimRuntime`, a set's activation and deactivation, the scheduler, the commands the disc uses, `ui::UI_COMMAND` sent to a `ZAnimHost`; `dialogNodeTree` over PLAT-05's design); PLAT-07, research 106; no runtime calls it yet. The front-end frame clock (`clock/`: `uiClock.ts` `UiClock`, the fixed 29.97 Hz UI tick fed by a `now()` the viewer passes, its interpolation fraction, the capped catch-up and the hidden tab; `moviePace.ts` `MoviePacer`, a movie picture per tick); PLAT-12, research 110; no runtime calls it yet. UI text (`text/`: the faces' glyph metrics, line layout and wrapping, the colour states and the glow, the teletype; PLAT-13, research 111). The movie commands (`movie/`: `movieCommands.ts`, PlayMPEG, PlayMPEGNoFade, BackgroundMPEG, PlayMovie and ONMPEGEND's delivery through an interface the viewer fills with `@s2u/fmv`'s player; PLAT-21, research 121). The UI command table (`uiCommands.ts`: the 207 rows of the binding table, each with a classified host entry; PLAT-08, research 107). The loading screen's readers (`loading.ts`: `loadingBinding`, `loadingSpin`, `spinScale`; INT-LOADING, research 125; the deep import `@s2u/ui/loading`, outside the index, so an `@s2u/ui` import loads no `@s2u/scene`), which the viewer's interim `loadingAssets.ts` and `loadingLayout.ts` import until ONL-18. The 2D compositor (`compositor/`: a dialog's records and the text to a 640x448 draw list, the movie layer, the fader; PLAT-14, research 112), drawn by the viewer's `uiCompositorView.ts`. To come: the screen and state manager PLAT-10, menu input PLAT-11, text, compositor, widgets, popups and the keyboard PLAT-13..17, as data the viewer draws | touch the DOM, `three` or a browser global; import `viewer` or `tools/` |
| `@s2u/fmv` | nothing yet (guidance: archive, sound) | The movie player. Today: `src/index.ts`, still a scaffold, and `wasm/` -- PLAT-19a's libmpeg2 0.5.1 build to a standalone wasm (`build.sh`, the hand-written `config.h`, the `glue.c` state machine, libmpeg2's `COPYING`), which PLAT-19b wraps; the spike's harness and its pure pieces are dev tools (`tools/fmv-spike.ts`, `fmvPlanes.ts`, `fmvStream.ts`; research 98 §7). Merged since: the PSS demuxer (`src/pss.ts`, PLAT-18, research 109), the decoder core and the IPU colour conversion (`src/decode.ts`, `decodeEngine.ts`, `decodeProtocol.ts`, `decodeStream.ts`, `ipuCsc.ts`; PLAT-19b, research 120) and the player's state machine (`src/player.ts`, PLAT-21, research 121). To come: the decoder's real-time budget PLAT-19c, movie audio and sync PLAT-20 | as `ui`; the wasm instance, the canvas and Web Audio arrive as parameters |
| `@s2u/card` | nothing | The simulated memory card as R7 makes it: the storage interface and its failure kinds (`store.ts`; `MemoryStore`, and the IndexedDB `IdbStore`, parked by R7, unused by the card), the page's guarded `Settings` and `migrateOnce` (PLAT-24, research 99 §1-§6), and **two virtual card slots** (`cardSlots.ts`, PLAT-25, research 99 §7): one JSON record a slot under `s2u.card.v1.slot1`/`slot2` -- the card's state, a file table of the original's names at their nominal sizes, free space counted against the virtual 8 MB card, `ext` for what the original never saved, a revision counter -- written with one `setItem`. To come: libmc's commands and result codes over that table PLAT-26. It knows no PS2 card byte format | as `ui`; it is handed a `Storage` getter (`pageStore.ts`: `() => globalThis.localStorage`) |
| `tools/` | archive, gs, mesh, scene, sound | `extract-maps` and the `dump-*` readers (`dump-dialogs`: the dialog inventory and flow graph of research 96, `dialogInventory.ts`), `export-gltf`, the console-frame and feel-parity instruments, the release sweep, the multiplayer bot load test, `build-corpus`, the roadmap's graph check (`roadmapGraph.ts`). **`tools/cardFile.ts`** is a dev tool, not a package: the reader of game-written card files (PLAT-27's read side, kept by R7 when its writers were deleted; research 102), used to check what the game saved (`dialogInventory.ts` reads `PersistentValves.rdr` through it); **no package imports it** (rule (c) of `tools/test/packageBoundaries.test.ts`) | ship in the page |

### The sim boundary

`packages/viewer/src/sim.ts` is the one module the server imports from the viewer. It re-exports what a match needs to
decide: the mover (`mover.ts`, the `Walker`), traversal, the motion table and clip timings, the tuning and stature, the
round and its accuracy and penetration, the rifle kick, the magazines, and the net protocol, codec, damage, lobby and
deaths. Grenades are already headless in `@s2u/scene` (`projectile.ts`). The page predicts its own SEAL with these
modules and the server runs the same modules authoritatively (spec ruling W3.R2), so there is one implementation of
the rules, not two.

The boundary is enforced, not advised: [`test/simBoundary.test.ts`](../packages/viewer/test/simBoundary.test.ts) walks
every value import reachable from `sim.ts` and fails on `three`, the DOM or Web Audio. A change that makes the mover
touch the renderer fails the suite.

### The data flow of a map load

1. The page picks an `AssetSource`: the user's `.iso` (`IsoAssetSource`, read in the browser, nothing uploaded), or an
   HTTP tree for development.
2. A worker (`viewer/src/worker.ts`) reads the map's ZDB, decodes textures (`gs`), geometry (`mesh`), the scene graph,
   collision, spawns and grid (`scene`), the player's body and clips, the map's sound banks (by byte range) and effect
   scripts, and transfers typed arrays back.
3. The main thread builds three.js objects a few per frame (`scheduler.ts`) so a map switch does not freeze the page,
   and draws them with materials built from each texture's GS state (`materialSpec.ts`, `world.ts`).
4. In walk mode a fixed 60 Hz step (`CGame::Tick`'s rate) drives the mover, the camera and the clips; the page renders
   between steps.

## The front end (web sprint 6 on)

The mission's boot, menus, card and online front end are built in three packages of their own, split as reCOM splits
the engine (`zUI`/`zAnim`/`zInput` -> `ui`, `zMPEG` -> `fmv`, `zSave` -> `card`), so that `viewer` does not grow by
another screen's worth of state. The spec is
[`specs/2026-10-01-web-sprint-6-package-boundaries.md`](specs/2026-10-01-web-sprint-6-package-boundaries.md) (ruling
W6.R2 of the [sprint 6 plan](plans/2026-10-01-web-sprint-6-foundations.md); R7 voided its card filesystem, scrambler
and writers -- its section 1 still lists them as they were planned).

**The rule, enforced.** `ui`, `fmv` and `card` are pure, DOM-free and run under Node. A browser object -- a `Storage`,
an `IDBFactory`, a canvas, a WebAssembly instance, Web Audio, a pad -- enters as a parameter the viewer passes; DOM
*types* are allowed, DOM *values* from the global scope are not. No package below the viewer imports it, and no
package imports from `tools/`. `tools/test/packageBoundaries.test.ts` checks every source file on its syntax tree
(rules (a) no `viewer`, (b) no `three` and no browser global by any route, (c) no `tools/`), and each new package's
`test/headless.test.ts` loads it under Node with no DOM.

**The state flow, as far as it is built** (2026-10-02). No screen of the front end is drawn yet: the first whole
screen, the main menu, is web sprint 11's ([roadmap](roadmap/SPRINTS.md)). What exists is the ground under it, in the
order a boot will use it:

1. **The disc's front-end files**, by class (`@s2u/archive` `frontEndFiles.ts`, PLAT-03): the UI readers and ZEDs, the
   zAnim sets, the locale archives, the movies and `VAGSTORE.ZAR` (streamed in chunks and addressed by LBN through the
   ISO's own directory records: `IsoAssetSource.stream`, `extent`, `fileAt`), the RAW screens, the card icons; the
   campaign's classes and the four `*_AOP.PSS` movies (MENU-05's owner call) deferred, not dropped.
2. **The strings**: one id-to-text lookup over every LOC archive the code loads by name (`@s2u/scene` `uiLoc.ts`
   `LocService`, `loadLocService`; PLAT-04, research 103). It stays in `scene` beside the ARMORY's readers until PLAT-05
   and PLAT-34 say where the `ui*.ts` readers go.
3. **The game's global state**: `ValveStore` and the UI variables in `UiVarManager` (`@s2u/ui`, PLAT-09, research 104) -- what the
   dialog scripts read and write, and what the card's `PersistentValves.rdr` and UI-variable save hold.
4. **The card**: two virtual slots (`@s2u/card` `CardSlots`, PLAT-25), created by the viewer as `pageCard` in
   `pageStore.ts` over the page's localStorage. Nothing calls it yet: libmc's commands (PLAT-26) and the card screens
   (sprint 13) are its users. The page's own settings go through the same package's `Settings` (`pageSettings`,
   `tabSettings`).
5. **The map of the screens**: research 96's dialog inventory and flow graph (`tools/dump-dialogs.ts`,
   `tools/dialogInventory.ts`): every dialog of `READERC.ZAR`/`READERX.ZAR`, every `SWITCHMENU` edge, the boot chain
   `dlgIntroScreen` -> `dlgIntroCinematic` (SONY448) -> `dlgSecondCinematic` (INTRO_2) -> `dlgMenu`. It is a tool's
   output, the plan the runtime (PLAT-05..PLAT-10) will follow; no runtime walks it yet.
6. **One dialog, read as the engine reads it**: `@s2u/ui`'s `DialogLoader` (`dialog.ts`, PLAT-05, research 105) turns
   a dialog's parsed `.rdr` into the design `FUN_00381550` builds -- libraries, font, background, bindings, script
   sets, models, every object and control with its per-type fields -- through `RdrLookup`'s depth-first key search.
   Nothing makes a screen from that design yet (PLAT-10); a disc test reads every dialog with it.

Beside the list, timing it: **the load-phase marks** (`@s2u/ui` `loadPhases.ts`, PLAT-29a, research 100). The viewer
makes one `PhaseMarks` on the page's clock at its start (`loadBudget.ts`), marks the disc chosen (through
`DiscChoice`, which takes a refused disc's mark back), the disc indexed and the map's first frame (`main.ts`), and
hands the marks, typed by `LoadPhase`, to the debug hook (`hook.ts`). The Sony frame, the main menu and the lobby are
owed rows, each naming the sprint that first draws it. (`VIDEO_PICTURE_HD_OFFERED`, HD-HOLD's switch that `main.ts` read,
went with the HD picture in B206 ML-6: the test room's packs follow the MODS choice.)

What sits outside the three until it is folded in: the ARMORY's sprint-5 runtime (`viewer/src/uiScript.ts`,
`armory*.ts`) and its readers in `scene` (`ui*.ts`), which PLAT-34 folds into the generic runtime.

The shared controller settings bridge -- on `agent/mega` in `playerSettings.ts`, the test room's card reads -- uses `initSystemTuners` to initialize a fresh live tuner manager (`pageEarlyCommits`' `adopt`) and `lookStickOf` to derive aiming from the current preset and tuners (`pageCardReads`) before a native Options session exists. The original conversions and preset values are retained.

## What is SOCOM-specific, and what is plain PS2

| layer | general to PS2 games | specific to SOCOM II (Zipper Interactive's engine) |
|---|---|---|
| Disc access | ISO9660 reading, the `AssetSource` abstraction, HTTP range reads | the `RUN/` layout, `COMMON_ARCHIVES` |
| Containers | -- | ZDB, ZAR/ZED v2 and compiled `.rdr` (reCOM, a re-implementation of SOCOM 1's engine, reads the same forms); `AIMAPS.MPS` |
| Textures | GS pixel formats, CLUT layouts and interleave, GS register semantics (`TEX0`/`TEX1`/`ALPHA`/`TEST`/`CLAMP`) | the texture and palette records inside `_TXR`/`_PAL` members and how a bind packet points at them |
| Geometry | DMA tags, VIF1 codes and `UNPACK` formats, GIFtags | what each VU1 microprogram does with the lanes (the world family, command `0x52`'s skinning, `0x70`'s scaled form, `0x34`'s environment map) |
| Shading | the GS's modulate `(texel x vertex) >> 7`, `COLCLAMP`, linear fog, alpha test, the blend equations, the 640x448 frame stretched to 4:3 | which post-process a round runs, lighting flags, detail textures, facades, LOD records |
| Sound | SPU ADPCM, SPU2 reverb; 989snd banks are Sony's 989 Studios library, used by other first-party titles | `sounds.rdr`, `BNKSTORE.ZAR`, the material step table, when a step or a round sounds |
| Animation | -- | the clip format in `MOTION_*.ZAR`, `motion.rdr`, the zAnim command numbering |
| Rules | a fixed-step authoritative server with client prediction | every number: speeds, jumps, accuracy, damage, respawn, scoring (research 80-91) |

## Adapting it to another PS2 game

Nothing here is packaged as a general library, and the code uses SOCOM's names throughout. What carries over is the
approach and several modules that do not care which game made the bytes. A path that worked here:

1. **Read the disc in the browser.** `IsoAssetSource` and `HttpAssetSource` are game-agnostic. Keep the user's own
   disc as the only source of data.
2. **Find the containers.** Replace or extend `@s2u/archive` with the target game's archive formats. The notes 72 and
   36 show the level of evidence that paid off: each field confirmed on several archives before code depended on it.
3. **Textures first.** Once you find the game's texture records, `@s2u/gs`'s decoders and GS-state reader apply as
   they are; `npm run dump-textures` shows the kind of instrument that settles pixel order and CLUT interleave.
4. **Geometry through the VIF.** `mesh/src/dma.ts` and `vif.ts` implement the hardware and transfer. The work is the
   interpretation of the vertex lanes, which is fixed by the game's VU1 microcode: read it from a VU1 translation or a
   disassembly, write the lane meanings down as `SEMANTICS.md` does, and test against a known-good dump.
5. **Draw with the GS's arithmetic.** `viewer/src/world.ts` and `materialSpec.ts` show how to express the GS's modulate,
   clamp, fog, alpha test and blend as three.js node materials that run on WebGPU and WebGL2 alike.
6. **Compare with the console early.** `tools/console-compare.ts` (research 82) puts the page beside a console frame at
   the console's own camera; most of the picture's real defects were found this way, not by eye.
7. **Rules last, and shared.** If the game is to be played, keep the rules headless behind a boundary like `sim.ts` so
   a server can run them unchanged.

## Further reading

- [`MISSION.md`](MISSION.md): what the port is for, the owner's rulings, the sources of truth and the levels of proof.
- [`roadmap/README.md`](roadmap/README.md) and [`roadmap/SPRINTS.md`](roadmap/SPRINTS.md): the tasks and their order;
  [`roadmap/PLATFORM.md`](roadmap/PLATFORM.md): each subsystem, its package and path, its status and its test.
- [`DATA_SOURCES.md`](DATA_SOURCES.md): every kind of data, where it comes from and how it was verified.
- [`PROCESS.md`](PROCESS.md): the stack and how the work was done.
- [`corpus/llms.txt`](corpus/llms.txt): the same knowledge as structured records for an assistant.
- The design specs and plans under [`specs/`](specs/) and [`plans/`](plans/) ([the plans' index](plans/README.md)).
- [`HUMAN_TASKS.md`](HUMAN_TASKS.md): what only the owner can do or decide, and what waits on it.
