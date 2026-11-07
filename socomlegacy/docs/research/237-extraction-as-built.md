# 237 -- EXTRACTION as built: the ground and the rules (web sprint 31, W0, HX-0b, HX-1)

- Date: 2026-10-06 (web sprint 31, "HOSTAGE on Desert Glory"; plan `docs/plans/2026-10-06-hostage-and-modes.md`). HX-0b
  opens the note with the mode's ground (§1) and its readings (§6); W0 writes §0 (wave 0's two findings); HX-1 writes
  §2-§5, its §6 rows and §7. Until each lands its sections are stubs.
- Status: **reading, pending review.** Every value below is a read of the decompilation (`D:L<n>` of
  `socom2_game.elf.decomp.c` r0001), re-read at the decomp by HX-0b's implementer (2026-10-06: `FUN_0052a200`
  D:L395043-395098, the vehicle-record parser D:L400378-400443, `FUN_0052ff40` D:L398452) and by HX-1's (2026-10-06:
  `FUN_002a6960` D:L148936-148949, `FUN_002a9ee0` D:L150705-150722, `FUN_0059ee20` D:L458059-458145, `FUN_00547860`
  D:L412863-412909, `FUN_002a6c50` D:L149084-149097, `FUN_005a5830` D:L461469-461547, the AI word's writer and reader
  D:L432826-432922), or disc data through a read
  formula (the MP6 fixture). Research 190 grades the starts' x,z and the zone PROVEN, the y STRONG and the facing
  BELIEVED; under AGENTS.md a source read is a reading until reviewed (research 206). 190 and 207 are themselves
  "reading, pending review -- not adopted". **No hostage behaviour has been measured on a running console** (207 L20-21):
  nothing here is parity; capture C2 is the last gate.
- Sources: research [190](190-h2-hostage-mode-rules-map.md) §2.2 A2 (the records), §3.1 B1 (the starts), §3.2 B2 (the
  zone), §6 G2-G4 (the gaps this closes), §10.3-§10.5 (V2 claims 2-4); [207](207-hostage-mode-desert-glory.md) §2 and §7
  P2-P3; [189](189-h1-hostage-ai-animation.md) §2 (the FIRETEAM names); [75](75-aimaps-mps.md) §4-§5 (the AIMAPS layout);
  [179](179-c1-match-server.md) §9.14 (the cell height). Rulings HX.R1-HX.R8 (proposed, the controller 2026-10-06).
- Code (HX-0b): `packages/scene/src/aimaps.ts` (`aiCellOf`, `zoneContains`, `zonesOfKind`, `zoneCentre`,
  `ZONE_CONTAINS_READING`); `packages/scene/src/escortees.ts` (new: `parseEscortees`, `placeEscortees`,
  `EscorteeRecord`, `EscorteeStart`, `ESCORTEE_BIT_READING`, `HOSTAGE_TEAM_READING`, `HOSTAGE_START_LIFT_READING`,
  `HOSTAGE_FACING_READING`); `packages/viewer/src/simMap.ts` (`SimMap.ai`, `SimMap.escortees`, `mapEscortees`).
- Tests (HX-0b): `packages/scene/test/aimaps.test.ts` (the zone test and the zone centre),
  `packages/scene/test/escortees.test.ts` (new), `packages/viewer/test/simMap.test.ts` (the AI maps and the escortees on
  the room's map).
- Code (HX-1): `packages/match/src/extraction.ts` (new: `ExtractionAuthority`, `HOSTAGE_ID_BASE`, `sealCheck`, the
  readings of §6); `packages/match/src/room.ts` (the authority beside the bomb, the hostages as hit targets in `fire`,
  `bodyCast` and `blast`, `ffRefuses`' escortee, the chain and the minute in `clock`, the welcome's `hostages`, the
  snapshot's bodies); `packages/viewer/src/net/protocol.ts` (`HostageStateWire`, `HostageWire`, `hostageState`,
  `roundTime`, `kill.victimKind`, `eliminated.reason`, `welcome.hostages`); `packages/viewer/src/net/rules.ts` (the two
  holds, `HOSTAGE_KILL_LINE_READING`); `packages/viewer/src/net/damage.ts` (`Health.max`); `packages/viewer/src/netPage.ts`
  (the `kill`, `roundTime` and `hostageState` cases, the optional `hostageState` dep, `NetPage.hostages`).
- Tests (HX-1): `packages/central/test/extraction.test.ts` (new, pure), `packages/central/test/roomExtraction.test.ts`
  (new; MP6 and MP2 fixtures for the starts, the flat floor for the rest), `packages/viewer/test/netPageGame.test.ts`
  (the page's three cases).

## 0. Wave 0's two findings

W0 (2026-10-06): two leftovers of earlier sprints, and the offline room's share of HX-0b's ground. Code:
`packages/viewer/src/loadMap.ts` (`turretParts`, `LoadedMap.ai`/`.escortees`), `packages/viewer/src/mapMeta.ts`
(`AUTOSTART_RESET_READING`, `MapMeta.autostart`, `openingCommands`), `packages/viewer/src/worldState.ts` (`reset`
re-applies the autostarts' opening), `packages/viewer/src/simMap.ts`
(`mapEscortees` exported), `packages/viewer/src/net/loopback.ts` (`LoadedForMatch.ai`/`.escortees`, `simMapOfLoaded`).

### 0.1 The turret prototype the map's own graph supplies (MP10)

`turretParts` (MAP-10b) joins the map's models with the turret libraries (`@s2u/scene` `turretSceneModels`: on a name
clash the map's own model wins) and places the join's nodes beneath each placed turret's root, re-keyed to the
libraries' fallback chunk names (`N000_000`). Blood Lake (MP10) carries its own `RMG_turret` prototype in its graph (and
its chunks in its own `MP10_MDL`, `'bias'`, research 79 §2): `place`'s `placeInstances(models)` places it already, and
`turretParts` placed it again under the libraries' keys, which the map's buffer does not hold. `decoder` noted
`chunk RMG_turret/<key>: no such chain in the model buffer` for each: **14 notes a load before** (`N000_000`, `N000_001`,
`N001_000`, `N001_001`, `N002_000`, `N003_000`, `N004_000`, `N004_001`, `N005_000`, `N005_001`, `N006_000`-`N006_003`),
nothing drawn wrong (the second set decoded to nothing). The fix skips every join placement whose model the map's own
graph realises (`flattenScene(models, WORLD_MODEL)`'s model names) before the re-key: **0 notes after**; the LMG and the
30 mm MGL (out of `TLMG`/`T30M`) and the map's own RMG are drawn as before, and Crossroads (MP72), whose RMG and LMG
are both the libraries', is unchanged. A port rule (which copy to draw), no value: no reading. Test:
`packages/viewer/test/turretParts.test.ts`, "a map whose own graph places a turret library's prototype (MP10's RMG)
keeps one placement per model and writes no 'no such chain' note; a map without one (MP72) is unchanged" (MP10 off the
served disc copy, `public/maps`, no synthetic stand-in; MP72 the fixture).

### 0.2 The round reset and the autostarts

MAP-02's fold (`AUTOSTART_INITIAL_READING`) puts an autostarting animation's opening `OBJECT_ACTIVE_STATE` commands into
the opening state, and the port's `WorldState.applyInitial` saves after it, so `reset` gives Desert Glory's nine
`beer_parts` back off. The original saves at the reference's init (`FUN_0026b5e0` D:L115727-115809, a bit-28 reference's
active flag from node `+0x5c`), before the set starts, so its saved `beer_parts` is on; the owed read was whether its reset
starts the sets again. **It does** (`AUTOSTART_RESET_READING = 're-run'`):

- the sets are `common` and `mission` (strings 0x3e5260/0x3e5268 and 0x3f12f8/0x3f1300, `socom2_game.elf.strings.txt`),
  looked up by `FUN_0026a100` (D:L114942-114957);
- online, the round's end state's UnInit `FUN_002232a0` (`CMPExitState`, research 115 §8.2's table) runs on both sets
  `FUN_0026c2e0` (D:L116142-116181: every animation of the set stopped, the set's started byte `+1` cleared),
  `FUN_0026c4f0` (D:L116270-116309: `FUN_0026b430` on every saved reference -- `beer_parts` back on -- then
  `FUN_002714a0` per animation) and then `FUN_0026c600` on both (D:L75850-75866);
- `FUN_0026c600` (D:L116312-116387) runs only while the set's `+2` and `+1` bytes are 0 and sets `+1`; it starts the
  set's animations whose runtime bit is set (research 115 R115.6: `params.flags & 3 == 1`) -- the `beerN` among them,
  whose first command turns `beer_parts` off again;
- the offline reopen `FUN_002ac0e0` (`CExitState`'s Init path `FUN_001f1bb0` D:L53472; the name table's
  `CMission_ReOpen_Unload1`, research 196) does the same stop and restore (D:L151966-151983: `FUN_0026c2e0`,
  `FUN_0026be90`, `FUN_0026c4f0` on `common` and `mission`) and the start is the round's: `FUN_002a7d40`, which runs at
  every level and round start (D:L50946, D:L51049, D:L75935; 199 H4-7), calls `FUN_0026c600` on both sets
  (D:L149735-149742).

So at round 2 `beer_parts` is restored on and turned off again by the restarted `beerN` -- off, as at round 1.

**The start path, checked.** `FUN_0026c600` (D:L116360-116371) sends an animation whose flags carry bit 11 (byte `+5`
bit 3; that this byte is `Anim_Params` flags bit 11 is research 106's reading, not a trace) to `FUN_00271250` on the
set's first start and to `FUN_00271390` on every later one, and `FUN_00271390` skips an
animation of kind 3 (`(+4 & 7) == 3`, D:L119298-119310: the destructibles); any other animation is offered the start by
`FUN_002713f0` (D:L119312-119338) on every start. The kind is `params.flags & 7` (research 106 §R106.5, 209 §13). MP6's
nine autostarting `beerN` and MP73's `set_apache` are flags 0x21: bit 11 clear and kind 1 -- they take `FUN_002713f0` at
round 1 and at every restart alike, and the kind-3 skip never applies to them (the MP73 test below reads the flags off
the disc and holds both; research 106 found no animation with bit 11 on the disc).

**What the port builds (fix round, 2026-10-06).** The first commit claimed the port reached the same state by saving
after the fold. The review found that false in general. The original's restart replays an autostart's whole opening,
not only the nodes a reference saves, and two kinds of node escape a restore alone:

- fold targets with no save bit: MP6's `f18_1`/`f18_2`, MP73's `chopper1`;
- commands after a non-`active` op: MP73's `set_apache` turns `chopper1` off, sets three valves (`strikecliffs`,
  `strikedunes`, `setairstrike1`) to 0 and then turns `radio_call` on, while the fold stopped at the first valve.

Reproduced on MP73's `WorldState`: `applyInitial`, `executeAction('airstrike1')` (the room's path), 5 s of steps, then
`reset`. At round 2 `radio_call` stayed off for 30 s and `states()` still listed it for joiners; in the original the
restarted `set_apache` turns it on.

The port now does what the original does:
- `readMapMeta` keeps every autostart's opening commands on their placements in file order (`MapMeta.autostart`).
  `openingCommands` passes over VALVE ops, which take no time, and stops at the first other op. A reference of another
  scope (`radio_call` is search 3) is placed as the program runner places it (`sceneHealth.ts` `placeRefs`).
- `WorldState.reset` restores the saved references, then re-applies that list.

MP6's `beer_parts` end off (the restored "on" overwritten by `beerN`'s "off"). MP73's `chopper1` ends off and its
`radio_call` on.

The same opening list feeds the fold (`AUTOSTART_INITIAL_READING`), so round 1 and round 2 agree and `states()` stays
empty after a reset. Placing the other-scope references changed the opening state of four of the 22 maps (all 22 compared,
before and after this commit). Each node below is now hidden from the load, as its autostart's first commands hide it in
the original:
- the sky's lightning flashes, the seven nodes `flsh1a1`, `flsh1b1`, `flsh2a1`, `flsh2b1`, `flsh2c1`, `flsh3a1` and
  `flsh3b1`, turned off by the second sequence of each map's own animation: MP6 under `mp6_skydome`
  (`mp6_battlesounds`), MP73 under `flashes` (`mp73_battlesounds`);
- `f18_plane` on MP62 and MP82.

The page used to run no autostart program, so the flashes stayed hidden where they were always drawn before. In the
original the `battlesounds` loop blinks one group for about 0.2 s every 2-4 s, and the F-18 shows only during its
flyover. The merge controller took the hidden state as the original's load state (2026-10-06).

**AS-1 (Fuse's #442, 2026-10-22; landed as LATER 409, 2026-10-26, `agent/later-409`; reading, pending review).** The page's world (`runAutostartPrograms`, set in `buildPageWorld` and `/testroom`'s `show`)
starts every animation whose `params.flags & 3 == 1` (the gate: `AUTOSTART_INITIAL_READING`, research 115 R115.6's
reading -- not in `FUN_0026c600`, whose D:L116360-116372 start every animation of the set; the lead to read is in §6)
except the mode script `objectives` (the room already runs that
script: round cues, the bomb, extraction). Each runs through `EffectRun` with `display` and `presentation` (PF.R26):
`OBJECT_ACTIVE_STATE` draws and does not change the wire's own flags; valves are not written. An autostart's
`RANDOM_WEIGHT` and a ranged `WAIT` draw `FUN_0025dcf0`'s unit value (`rand() / 2^31`, D:L107783-107792;
`WorldState.autostartRandom`); every other scene program keeps the fixed 0.5 its tests were written against. Skipping
`objectives` on the page is a browser adaptation of the split (the room is the one that runs it); it changes no round.
A program the effect
runner already starts because it draws particles or lights keeps its sounds and calls there; the world run still
applies its `active` commands, which is how MP6's and MP73's flashes blink. Which programs those are is the effect
runner's own list (`EffectData.ambient`, `effectData.ts` `draws` over the map's set and the effect library), handed to
the world by the page (`WorldState.setAmbient`: `buildPageWorld`'s third argument, `/testroom`'s effects message), so
an autostart whose drawing comes only through a call into the common set is played once (the review's F1, 2026-10-26).
Until the list lands the world judges by the map's own programs (`drawsAmbient`). `mp6_parent` calls `mp6_f18s_a` / `_b` /
`_c` (flags 0x22, not themselves autostart). `OBJECT_MOTION_SI_SCRIPT` (command 26) moves nothing and ends in the
tick it begins (`SI_SCRIPT_MOTION_PLACEHOLDER`, §6): MP6's six
`data/mp6/zrdr/f18_*.zan` `Script_Data` are 0 bytes, and the command's begin and tick are not read, so `f181` / `f182`
turn the jet on and off in the same tick. The same runner covers Sandstorm's autostart set (`set_apache`,
`mp73_battlesounds`). Sandstorm's aircraft flyover is the called airstrike (`chop_path*.anm` on `chopper1`), not an
autostart F-18; `f18_plane` is MP62 and MP82, hidden at load and shown by a called program, which this runner does
not start. Needs disc reading: where those `.zan` bytes live if not in `Script_Data`, and command 26's begin/tick
(`FUN_0025bc20`'s registration) including which field selects the script and the channel vectors. `FUN_0025f1b0`
(D:L108613-108635) and `FUN_0025f3c0` (D:L108678-108718) pin record size and the start/end times only (research 319
§4.2 U1 meets the command undecoded in `otc_posechar`). Held by `packages/viewer/test/worldAutostart.test.ts` (MP6:
the flash blinks, `mp6_parent` calls the flyover and `.JET_FLYBY` plays, the reset starts them again, `objectives` not
started; a world without the flag runs none), `matchWorld.test.ts` (LATER 409: `buildPageWorld` runs a hand-built
blink at load and again at the reset, the room's `new WorldState` none) and `packages/match/test/roomAutostart.test.ts`
(MP6's room: no autostart running at load or after the reset, its wire the opening fold).

Still not copied (in the reading):
- the room runs no autostart program (the page does, AS-1 above);
- `OBJECT_MOTION` and `OBJECT_MOTION_SI_SCRIPT` on the world host (command 26 unread: `SI_SCRIPT_MOTION_PLACEHOLDER`);
- an opening VALVE op's value: the reset clears every valve to 0, which is what the disc's opening valve ops set;
- the frame between the restore and the start, if any is drawn.

The restore-then-start order is read, not watched. One look at a Desert Glory bottle and at Sandstorm's (MP73) radio in
round 2 (capture C2) settles it.

Tests, both in `packages/viewer/test/worldState.test.ts`:
- "a round reset leaves an autostart's folded opening state as it was (AUTOSTART_RESET_READING; FUN_002ac0e0
  D:L151976-151991): MP6's beer_parts are off at round 2" (MP6 fixture, unchanged). The title's line range is the
  dispatch's; the stop-and-restore block reads D:L151966-151983 at r0001.
- "MP73: a round reset after airstrike1 re-runs set_apache -- radio_call is on at round 2 (the original's restart)" (the
  disc; RED on the first commit).

### 0.3 The offline room's hostage ground (HX-0b's review)

HX-0b gave the server's `SimMap` the parsed AI maps and the escortees; the page's offline room (`net/loopback.ts`
`simMapOfLoaded`, reCOM mode's single-player match) builds its map from the page's `LoadedMap` and carried neither, so
on Desert Glory it would have opened with no hostages. W0 lays XR-05's path for the bomb: `loadMap` reads `AIMAPS.MPS`
once (`aiMapsFromBytes`, which now also feeds `bombStartOf`) and the escortees off it (`simMap.ts` `mapEscortees`, the
server's own function), `LoadedMap.ai`/`.escortees` carry them, `LoadedForMatch` declares them and `simMapOfLoaded`
passes them by reference (read only, as the server's `forkSimMap` shares them). `main.ts` passes its `LoadedMap` whole and
needs no line. The page's load posts the parsed AI maps from the worker by copy (their cell arrays are their own
`Uint32Array`s, not views of the archive; Desert Glory's file is 171,424 bytes on disc). Test:
`packages/viewer/test/loopback.test.ts`, "an MP6 LoadedForMatch's sim map carries the AI maps (9 sub-maps) and the three
escortee starts, as the bytes do" (MP6 fixture: equal to `simMapFromBytes`'s).

### 0.4 W0-gate: the two browser checks (2026-10-07)

The gate's own pair, sprint 27's owed browser looks. `packages/viewer/e2e/turretSky.spec.ts` loads MP51 and MP72 in the
walk, lifts `turretParts.test.ts`'s bbox check to the page (`__viewer.turretParts()`, `src/turretHook.ts`: every drawn
part under a turret root inside its node's bbox, tolerance 0.1, and its drawn world box within the turret's largest node
diagonal of the origin) and compares a 340 x 300 sky clip with its golden: the walker stood 20 units behind
`mp51_turret01` / `mp72_turret02` on the gun's line, the drawn eye measured 43.54 units behind the origin and level with
it, looking 20 degrees up; the clip taken once three takes 500 ms apart agree within 1% (cap 20 s). The goldens:
`e2e/goldens/turretSky-mp51-win32.png`, `-mp72-`, cut on this host, headless Chromium over SwiftShader (WebGL2).
`TURRET_SKY_THRESHOLD_READING` (in the spec, not `src`): fail over 3% of pixels moved by more than 80 of 255 -- MP51's
scrolling clouds drift at most 0.45% at that step over 35 s, three lane runs 0% / 0% / 0.694% (MP72), and the pre-fix
decode (`archivePositionForm` forced to `'bias'`, the RED) breaks 33.16% (MP51) and 56.26% (MP72).
`packages/viewer/e2e/turretMount.spec.ts` stands the walker behind `mp51_turret01` with the dev-only `__viewer.teleport`
(absent without `?devmode`; the page's mover and the offline room's, `main.ts` `teleport`), mounts with X, and checks
the room's mount, the HUD's `turret_dismount` and 750 / 750 / 0 rounds, the held walk, the aim held to -70..70 / -45..45
with the drawn gun at `gunDelta` of the held aim, and the dismount. The camera at the gun's pivot is not built
(`TURRET_POSE_PLACEHOLDER`, capture B 13) and is not asserted.

## 1. The ground

What the room needs to see before EXTRACTION can run on Desert Glory (`MP6.ZDB`, game type 4): the three hostage
records, where each starts, its team mask, the extraction zone and the test the original makes against it. Nothing
here spawns, scores or draws anything (HX-1, HX-2, HX-5); on every other map nothing moves.

### 1.1 The AI maps kept

`simMapFromBytes` parsed `AIMAPS.MPS` for the spawn slots and `bombStartOf` and dropped the rest (research 190 G2; the
dispatch's finding 1). `SimMap.ai` now keeps the parsed file (`parseAiMaps`, research 75): every sub-map's zones and named
points reach the room. It is a port shape and holds no value of its own. A room's fork (`server.ts` `forkSimMap`) shares
it by reference, as it shares the slots and the doors' specs: read only.

Size: Desert Glory's `AIMAPS.MPS` is 171,424 bytes on the disc. Parsed, it is nine sub-maps and 13,547 stored cells, held
in two `Uint32Array`s per sub-map (about 108 KB), plus the small tables. One parse per map is shared by its rooms.

`simMapOfLoaded` (`net/loopback.ts`, the page's own offline room) carries both since W0 (§0.3): the page's `LoadedMap`
reads them as `simMapFromBytes` does and `LoadedForMatch` passes them. The server's rooms carry both.

### 1.2 The escortee records

`READERM.ZAR/vehicles.rdr` on MP6 holds four records (190 §2.2 A2, V2 claim 2; the fixture read 2026-10-06):

| name | character | setup | team | disabled |
|---|---|---|---|---|
| `player` | `mp6_seal1` | `startPlayer` 0 | 1 2 31 | 1 |
| `Hostage` | `mp_fem1` | `hostageStart` 0 | 17 30 31 | -- |
| `Hostage2` | `mp_fem2` | `hostage2Start` 0 | 17 30 31 | -- |
| `Hostage3` | `mp_fem3` | `hostage3Start` 0 | 17 30 31 | -- |

`parseEscortees` keeps every record whose team mask has the escortee bit (`ESCORTEE_BIT_READING`, 0x20000) and which is
not `disabled`: the three hostages, in file order. The actor's scene name is the record's `name`, because the script
finds the actor by that name (`FUN_0029e590` D:L144706, node `+0x90`). `chartype.rdr`'s `escortees` labels (Hostage1-3)
are not the names. The `character` key is the `chartype.rdr` key HX-2 draws the body by; this task does not read
`character.rdr`.

**The mask.** The record parser walks the `team` key (string 0x65b088) as a list. For each value n it ORs `1 << n`, and
a value outside 0..31 ends the walk and is itself the result (D:L400381-400401, re-read). It stores the result at record
`+0x11c` (D:L400443). `FUN_002b28d0` copies it to body `+200` through `FUN_0029ed10` (D:L144915). Online, the bit-30/31
swap (`DAT_004412d8`, D:L155859-155866) leaves a mask with both bits unchanged. `17 30 31` gives **0xC0020000**
(`HOSTAGE_TEAM_READING`): bits 17, 30 and 31, ESCORTEE, ENEMIES and ALLIES by the SOCOM 1 DWARF's FIRETEAM names (189
§2). The port reuses `turrets.ts` `teamMask`, the turret records' parser `FUN_00533c10` (D:L400719-400762), which follows
the same rule. A start's `team` is the record's mask, read off the disc rather than the constant; the test holds the
two equal on MP6.

### 1.3 The starts

`placeEscortees` puts each record at the AIMAPS named point its setup names. This is `FUN_002b28d0` (D:L155776):
`FUN_00533000` -> `FUN_0052db70` -> `FUN_0052d480`. `namedPoint` finds the point case-blind, in the sub-map its loc
names. x,z are the cell's centre, min + (cell + 0.5) x 10 (`FUN_0052d480` D:L396879). y is the cell word's quantised
height (`aiCellY`: `FUN_00516940` D:L385082, `FUN_0051afe0` D:L387628), plus `HOSTAGE_START_LIFT_READING`.

| actor | point | cell | cell centre and height | start (`at`) |
|---|---|---|---|---|
| Hostage | `hostageStart` | 0:(104,5) | (1750.26, 49.99, 1179.72) | (1750.26, 50.99, 1179.72) |
| Hostage2 | `hostage2Start` | 0:(106,4) | (1770.26, 49.99, 1169.72) | (1770.26, 50.99, 1169.72) |
| Hostage3 | `hostage3Start` | 0:(106,11) | (1770.26, 49.99, 1239.72) | (1770.26, 50.99, 1239.72) |

Sub-map 0 is "Base Map": min (705.263, -33.14, 1124.72), 167 x 128 cells of 10. The starts are on Base Map, not on
the jail's sub-maps 3 and 4 (190 B1). The +1.0 lift is the player spawn's (`FUN_002b8100` D:L158793; 190 V2 claim 3:
the capture's SEAL at -30.08 + 1.0). `FUN_002b28d0`'s own placement of an AI body is unread, so the lift is a reading.

**HP-FACING (2026-11-04): every setup heading, reading, independently source-reviewed at 3a3821bd1 (PASS, high; 42 tests passed, zero skipped).** The heading parser is
`FUN_00533a60` D:L400676-400710; `FUN_00532fc0` D:L400213-400219 returns the selected setup's word.
The placement caller `FUN_002b28d0` D:L155825-155826 passes it to `FUN_00518ea0` with the third
argument 1. That function takes a byte (D:L386385), so the port selects the low byte too. Its switch
D:L386398-386424 selects y-axis rotations 180, 135, 90, 45, 0, 315, 270, 225 degrees for headings
0 through 7, with 180 as the default; D:L386426-386441 composes a further 180. Thus
`ESCORTEE_SETUP_YAWS_READING` is `[0, 315, 270, 225, 180, 135, 90, 45]`, and the existing scalar
`HOSTAGE_FACING_READING` remains 0 for heading 0 and unrecognized bytes. The independent direction
switch `FUN_00519130` D:L386483-386528 agrees: heading 0 is (0, 0, -1), heading 2 is (1, 0, 0),
heading 4 is (0, 0, 1), and heading 6 is (-1, 0, 0). These are semantic directions in the port's
yaw convention; this does not claim bit-exact quaternion arithmetic or original rendered-body parity.

The former implementation read only heading 0, warning and placing all other headings at yaw 0.
That limitation affected Fish Hook's first hostage and Foxhunt's first VIP: each stores setup heading
6 in `RUN/MP71.ZDB` or `RUN/MP53.ZDB`, `READERM.ZAR/vehicles.rdr`, while their other two records store 0.
Both now place at yaw 90, with the others still 0. `scene/test/escorteeFacing.test.ts` pins all eight
headings, the default and byte wrapping with synthetic placement; its two dev-disc cases pin those
actual records. RED: 13 failed / 1 passed; GREEN with the existing MP6 placement file: 16 passed /
zero failed / zero skipped. The separate all-map census belongs to HP-MAPS. No new value is tuned.
The mesh's rest facing and the original running comparison remain capture C2's work (190 B1, U10).
A record whose point is absent, or whose cell the grid does not store, is still dropped with a note.


`SimMap.escortees` is always read. The room uses it on EXTRACTION (game type 4; HX-1's `ExtractionAuthority.of`) and,
from 2026-10-18, on ESCORT (game type 3). ESCORT is game type 3 (190 §10.2: the TYPE string 0x3f2ea0 ESCORT -> 3,
`FUN_002c9540` D:L168876-168906; `FUN_00545390` tests it, D:L411530), and its escortees are another map family's
records -- `VIP1`-`VIP3`, `mp_vip1-3`, mask 0x40020000 on The Mixer, Foxhunt and Guidance (175 §2). The sprint 31
fix-up (2026-10-07; research 239 §9.2) had left those maps with no bodies. The follower is the extraction one; the
round rules are research 175 §4 (research 334). On MP2, whose only record is the player's, it is absent.

### 1.4 The zone

Sub-map 0's zone table holds one record, `Safety` (190 §3.2 B2, V2 claim 4). Its layout is `{corner, u16 w, u16 h,
kind, name[16]}`, stride 0x1c, name at +0xc (`FUN_00530370` D:L398614; research 75 §5.4).

| field | value |
|---|---|
| corner, size | 0:(6,76), 8 x 15 cells |
| kind | 1 = EXTRACT_ZONE |
| world rectangle | x [765.26, 845.26), z [1884.72, 2034.72) (`aiZoneRect`, which `tacMap.ts` keeps) |
| stored cells | 82 of 120, floor -30.08 on all 82 |
| centre | cell (10,83) = (810.26, -30.08, 1959.72) |

The kind names are `FUN_005d57c0`'s switch (D:L488569, `ai::PAINT`'s parser): 0 DEFAULT, 1 EXTRACT_ZONE, 2 SAFE_HOUSE,
3 WORM_HOLE, 4 ROUTER, 5 HUD_VISIBLE, 6 GUARD. The game keeps one zone list per kind (`byte+8 & 0x1f`, `FUN_0052bb70`
D:L395965-395973). `zonesOfKind(ai, kind)` walks every sub-map's table for one kind, in file order.

`zoneCentre(sub, zone)` is corner + (w >> 1, h >> 1) (`FUN_002a42b0` D:L147723 -> `FUN_0052ff40` D:L398452, re-read:
each axis adds the u16 size shifted right once). It is placed at that cell's centre and its quantised height. This is
where the HUD marks the zone (HX-5). It is null when the grid does not store the centre cell, because the height is the
cell word's and none is invented. Desert Glory's is stored.

### 1.5 The containment

`zoneContains(zone, loc)` is `ZONE_CONTAINS_READING`, the test `FUN_0052a200` makes (D:L395043, D:L395058-395098,
re-read). It walks the kind's zone list and takes a zone when all of these hold:
- the cell's sub-map (`loc & 0x3f`) equals the zone's;
- `0 <= x - corner.x < w`, with x the loc word's bits 6-18 (`<< 0x2d >> 0x33`) and w the record's u16 at +4;
- `0 <= z - corner.z < h`, with z the u16 at +2 `>> 3` (bits 19-31) and h the u16 at +6.

Both ends are half-open: on Safety, (6,76) and (13,90) are in, while (14,76), (13,91) and 1:(6,76) are out. The cell is
the actor's AI-map cell `+0xe4`. `ai::INREGION` mode 1 (`FUN_005ced60` D:L484881-484900) makes the same test, and every
INREGION region word in the EXTRACTION scripts decodes to its zone's corner (190 B2: MP6 0x02600180 = 0:(6,76)).

The original HX-0b implementation used `aiCellOf(sub, x, z)` on submap 0 as a stand-in for `+0xe4`.
That historical limitation is corrected by HP-ZONE (2026-11-04; research 335 section 9, reading, independently
reviewed 2026-11-04): `FUN_005b7ba0` D:L471278-471283 writes the raw cell through the layered `FUN_0052dc70` locator,
retaining the previous raw cell only when that lookup fails. A blocked stored raw cell is still a valid
region input, independent of last navigable `+0xe8`. Both EXTRACTION and ESCORT now use this same
location for rescue and script regions; they do not project onto Base Map. The conversion's layer
selection and thresholds are the existing research 335 section 2 reading. The new wiring is unit-tested,
not compared with the original running; the r0004 source-re-read limit is stated in section 9.


## 2. The actors in the room

### 2.1 Who owns them

The original's session master spawns the escortees: `FUN_002b2e50` (D:L156005) spawns the records only offline or on
the master, never twice (D:L156021-156031), and each is a SealObject of lifespan 3 that every other console draws as a
remote body (`FUN_002bdda0` D:L162081-162113; 191 §1, V2 H3-a). The port's room is the master (HX.R2, proposed), so it
owns the three hostages. `ExtractionAuthority.of(map, host)` builds them on a map of game type 4 (`missionlist.rdr` TYPE
EXTRACTION, `FUN_002c9540` D:L168883) that has escortee starts (`SimMap.escortees`, §1.3). On any other map, or one
without starts, it returns null. The room holds it as `Room.extraction`, beside the bomb.

**The starts are copied.** HX-0b's review found the starts' `at` tuples shared by reference across a map's rooms
(`forkSimMap` shares `escortees`). The authority copies each start (`at`, `loc`) once, and every round copies again from
its copy. No room writes the map's tuple.

**The ids.** The hostages are bodies `HOSTAGE_ID_BASE` = 240, 241 and 242, in record order. This is a port rule, not a
game value. The original's entity id is the net object's index, the same on every console (191 §1, D:L455453). The
port's member ids are the server's `freeId`, 1..`MEMBER_ID_CAP` = 239 (`server.ts`, the sprint 31 fix-up; research 239
§9.2), and a body id is a u8 on the wire, so 240 and up never meet a seat. (Before the fix-up this said the seats were
1..48: a maps' room's are, but a game lobby's room takes its spectator slots from the host's GameStats byte 4, up to
255, and `freeId` handed out 1..255.) The page tells a hostage from a player by the welcome's `hostages` list and by
`hostageState`, never by a flag bit.

**Each round.** `reset()` runs in `startRound` beside the bomb's. It puts the three at their starts, alive, with full
health and a fresh `HostageAi` (HX-3's has no `reset()`, so one is built per hostage per round). The AI enters 0x17
sub-state 3 in unit 17 (`FUN_00573130` D:L434903-434915). The valves are zeroed (§3.1) and every page is told each
hostage's `hostageState`.

### 2.2 Their bodies

Each hostage is one more `BodyState` in the snapshot's body list (`bodies()`), after the players':
- `id` from 240, `feet` its point, `yaw` its start's (`HOSTAGE_FACING_READING`), no velocity;
- `stance` the AI's (0 stand, 1 crouch), `Crouched` set with stance 1, `Alive` while alive;
- `weapon` 255 (no item), `slot` 0, the rest at rest (no action, no traversal).

No `codec.ts` change: the layout is the players' (PF.R33). The MP6 room test reads the three bodies back from an encoded
snapshot, so a u8 id of 240 round-trips. A page from before HX-2 draws the body as a SEAL, its default team. That is
harmless and HX-2's to replace.

**A standing hostage stays at its start.** State 9 holds its point (`FOLLOW_MOTION_PLACEHOLDER`, HX.R4), so `at` never
moves this sprint.

**The AI steps at the game frame.** `step()` feeds the room's 60 Hz tick into a `GameFrameAccumulator` and steps each
living hostage's AI once per `GAME_FRAME_DT` (`AI_FRAME_READING`). It does so while the level runs: in play, in a
decided round's hold and in the time-expired play-on. The watch sees every seated living body with its side's mask
(`SEAL_TEAM_MASK`, `TERRORIST_TEAM_MASK`) and the other hostages. HX-5's rescue test hangs on `onFrame`, which runs
after each hostage's frame.

**A hostage killed inside its fade** (HX-3's review note; research 238 §2.6). A dead hostage's AI is no longer stepped,
so its opacity stops where the fade left it. The room keeps that body in the snapshot as a corpse (`Alive` off), and its
last `hostageState` carries the frozen opacity (`DEAD_IN_FADE_READING`). A hostage already hidden (opacity 0) leaves the
snapshot, the picks and the hits. That is HX-5's fade end, and `bodies()` already drops a hidden one.

### 2.3 The hits

The shooter's console detects a hit and broadcasts it, and the damage applies where the hostage is local, on the host.
`FUN_005a5a80` (D:L461598-461646) applies it, through the hit message `FUN_002bbbd0` (D:L160807-160846) and
`FUN_005a1b80` (D:L459490-459618). None of these tests the rescued bit (191 §2.3, V2 §12.2). The room applies every hit
on a hostage itself, the same three ways it hits a player, each in a short loop after the players':
- **A round** (`fire`). The hostages are extra PERSON surfaces on the round's path, where the shooter saw them: their
  own history, rewound as a player's (`pastOf`). The round's walk strikes them in order with the players.
  `hostageBulletHit` applies a bullet's quantised damage on the struck part, or a volley's pellets once a volley
  (`volleyHit`'s rule).
- **A launched round's direct hit** (`bodyCast`, `hostageDirectHit`). This uses `directHit`'s rule, once a body a round
  (a set of its own, apart from PF-26's hit count).
- **A blast** (`blast`). This uses `resolveBlast` on the hostage's table, with the same line to the head, claymore cone
  and backblast cone. There is no ring in the port (no knock either until LATER 354). *Corrected 2026-10-23 (the #389 takeover's fresh
  review; re-read by the gameplay seat): was "the throw `FUN_0057e770` is a SEAL controller's" -- the knock `FUN_0057e770` is the body's own code -- the body's per-frame `FUN_005506a0` calls its blast handler `FUN_005a0e70` (D:L417906), which calls `FUN_0057e770` whenever the body's controller is local (`+0x34` false, D:L459307-459311): on the host a hostage's (`CSealCtrlAi`, 191; a `CZSealBody`, 193 §8.1). So
  in the original a hostage in a blast's radius is thrown, dead or alive: a body not prone by side through
  `FUN_005807d0` (D:L441040-441051; dead, kind 8: D:L440999-441001), Fall then Land; the push stored by `FUN_0057ed10`
  (D:L459281). Was: the port has no blast knock for a hostage (LATER 354).* *LATER 354 (2026-10-26; reading, pending review):* the
  room lays the knock on the hostage's body before its death, as a SEAL's (`HostageFollow.knock`, the room's
  `applyKnock`; the SEAL's push, divided by the mass `actor+0xf84` in `FUN_0057e770` (D:L441053; 90 set by the body's
  constructor L419803 -- a hostage's body is a `CZSealBody`, 193 §8.1); the controller's `+0x34` answers 0 for the
  host's `CSealCtrlAi` and 1 for a `CRemoteCtrl`, the review read at the vtables); a corpse is stepped while thrown,
  until its Land is held on the floor (no get-up); alive, it gets up. The snapshot carries the action (`bodies()`), so
  another page, a joiner and the replay draw the Fall and the Land from the No_weapon set's `GLOBAL` include
  (`animset.rdr`: `seal_fallforward01` .. `seal_getupbackwards01`, the SEAL set's own clips; `remotePlayers.ts`
  `escorteeSnapshot`) -- the port's own room-to-page view, through the SEAL's snapshot path (OT.R27); how the original's
  client draws another machine's thrown hostage (its `CRemoteCtrl` runs no knock) is unread. A hostage has its body
  (`HostageFollow`) only with the room's planner, which needs the map's AI grid (`AIMAPS.MPS`); the port places a map's
  escortees through that same grid (`simMap.ts` `mapEscortees`), so a room with hostages and no grid exists only in a
  synthetic test (2026-10-26, the review's F5).

**The table.** A hostage's parts are `HOSTAGE_PARTS`, the values HX-2's read gives (`healthOf` on
`HOSTAGE_HEALTH_READING`, `character.rdr` `mp_hostage_extract` through `mp_fem1-3`'s base chain; 238 §1.7): head 8, body
40, arms 10/10, legs 15/15 and armour 0 (189 #9, §5, §14.11). The room does not read `character.rdr` itself yet (no
table reaches it), so the table stands for that read (§7). The part pipeline is the players' (`applyHit`,
`FUN_005a5830` D:L461469-461547), with nothing hostage-specific in it. One detail had to be read again. The body hit
caps each limb at `limb max x body / body max`, and the maxima are the body's own (`+0x1014..+0x1028`, D:L461488-461510),
not the SEAL's. `Health` gains an optional `max`: a hostage's health carries its own table, and a player's falls back to
`MP_HEALTH` as before.

**The volumes.** These are the hostage's own skeleton's capsules at its stance, HX-2's `volumesOf({ escortee })`
(238 §1.8), by the record's index: on Desert Glory the records' characters `mp_fem1-3` stand in `chartype.rdr`'s
`escortees` in the same order. A room without an escortee skeleton (a test's flat floor) takes SEAL 1's.
`HOSTAGE_VOLUMES_PLACEHOLDER` retired at HX-2's merge.

**Friendly fire off never spares a hostage** (`HOSTAGE_FF_READING`). With `mp_friendly_fire` off, the contact handler
drops a projectile whose live shooter shares a team bit with the victim. It makes two exceptions: a victim with the
escortee bit 0x20000, and the shooter itself (disassembly 0x5ac720-0x5ac74c; 199 §2, V5 §12.3 "exact"). A hostage's
0xC0020000 shares bit 30 with the SEALs' mask and bit 31 with the Terrorists', so without the exception neither side
could shoot one. The port's gate (`ffRefuses`) takes the hostage as an `EscorteeVictim` whose team is the shooter's,
because to the gate every shooter is its teammate. The escortee bit alone lets the hit through, at once, before the
spectator test and the backblast branch. A mutation that removes that line turns the friendly-fire test red.

**What a hit on a hostage does not do.** It sends no `hurt` (no page owns the body) and no flinch (the escortee's lists
are HX-2's). It writes no combat report and counts no shot hit (PF-26's `countShot` counts players).

### 2.4 The elimination

Hostages never count for the elimination (`HOSTAGE_ELIMINATION_READING`). `FUN_002b23a0` (D:L155569) counts an online
SEAL to `aiteam_00`, a Terrorist to `aiteam_08`, and any other actor to one valve per set bit of its +200. A hostage
therefore counts to 17, 30 and 31, never to 00 or 08 (190 C2 "Who counts", V2 #14). The 2026-09-17 capture's
`aiteam_00 = aiteam_08 = 1` in a 1v1 on Desert Glory agrees. The room's `living()` counts players only and the hostages
are not players, so nothing changes there: the room test kills the last SEAL with three hostages alive and reads a
Terrorist elimination at the watch (17 s, the host's script's, `ELIMINATION_PERSPECTIVE_READING`, H101).

## 3. The rules as built

The rules are MP6's `objectives` script (HX.R6), decoded twice: H2's listing and V2's raw read (190 §4, §10.7).

### 3.1 The valves

| valve | where | written by |
|---|---|---|
| `rescuecount` | map valve 7 | Rescue1-3 (HX-5) +1; HostKill1-3 +1 |
| `freecount` | map valve 11 | Rescue1-3 (HX-5) +1 |
| `killcount` | map valve 12 | HostKill1-3 +1; SealKill1-3 +1 |
| `rescuecheck` | map valve 10 | SEALcheck: 1 |
| `mp_penalty` | game +0x40, bound by name (D:L149589) | SealKill1-3 +1 |
| `mp_hostages_by_seals` | game +0x38 (0x3f0fa0) | a SEAL's hostage kill +1 (`FUN_0059ee20` D:L458123) |
| `mp_hostages_by_turds` | game +0x3c (0x3f0fc0) | a Terrorist's hostage kill +1 (D:L458127) |

All seven are zeroed at each round's start. `reset` zeroes `rescue`, `rescuecount`, `rescuecheck`, `freecount`,
`killcount` and `mp_penalty`, and `FUN_002a6c50` (D:L149084-149097, re-read) zeroes the two globals. The module keeps
them as `valves` (`rescue` and `cdoor1` are not modelled: no rule of this task reads them).

**The one-shots.** HostKill1/2/3 fire once each when `mp_hostages_by_turds` reaches 1, 2, 3. Each plays `^PH_0008`,
posts "THE TERRORISTS HAVE KILLED A HOSTAGE", waits 2, posts "THE SEALS HAVE BEEN CREDITED WITH RESCUING THAT HOSTAGE",
then adds 1 to `rescuecount` and 1 to `killcount`. SealKill1/2/3 do the same on `mp_hostages_by_seals`. They play
`^PH_0007`, post "THE SEALS HAVE KILLED A HOSTAGE", wait 2, post "ONE MINUTE HAS BEEN DEDUCTED FROM THE MISSION TIMER",
then add 1 to `mp_penalty` and 1 to `killcount`. The valves move **after** the WAIT 2 (`ONE_SHOT_WAIT_READING`), so the
minute lands 2 s after the kill. The module queues each one-shot's valves for 2 s of room ticks, and a jump of two in
one update fires two one-shots at once. The lines and the streams are HX-5's.

**SEALcheck** (`RESCUECHECK_READING`) sets `rescuecheck` and stops when one of four equality tests holds:
- `freecount == 3`;
- `freecount == 2 AND killcount == 1`;
- `freecount == 1 AND killcount == 2`;
- `killcount == 3`.

Together they mean all three hostages are resolved. The module runs them as written (`sealCheck`), polled once a tick.
A sum past three that passes none of them sets nothing: a rescued hostage killed in its fade can count in both
`freecount` and `killcount` (HX-5's owner call).

### 3.2 The chain

`start`'s loop tests, in order (190 §4.2 C2, decoded twice):
1. `aiteam_08 == 0`: the SEALs win.
2. `aiteam_00 == 0`: the Terrorists win.
3. `rescuecount >= 2 AND rescuecheck == 1`: the SEALs win by rescue.
4. `mp_hostages_by_seals >= 2`: the Terrorists win by hostage kills.

Branches 1-2 are the room's own elimination, unchanged. Branches 3-4 are `result()`, read in `clock()`'s play arm right
after the elimination and under the same watch (the WHILE loop starts after `start`'s waits). The bomb's branch and the
elimination stay where they were. A decision counts the round win at once, holds, and tells `eliminated` with its
`reason`. Two rescued with the third unresolved decides nothing (`rescuecheck` 0). A Terrorist killing the third
credits the SEALs: HostKill gives `rescuecount` 3 and `killcount` 1, SEALcheck's `2 + 1` holds, and branch 3 decides.

**The holds** (190 C2's table, V2 claim 12):
- The rescue win holds WAIT 2 + WAIT 2 + `success`'s 20 + 1 = **25 s** (`RESCUE_WIN_HOLD_READING`).
- The hostage-kill win holds 2 + 20 + 1 = **23 s** (`HOSTAGE_KILL_WIN_HOLD_READING`). This is the same value as MP6's
  elimination hold (`eliminatedHoldS('MP6')`): one value, two branches.

The engine's 3.0 s after either (`FUN_002a9b30`) is the round screens' `ENGINE_READ_S`, as for every round.

**The time-out.** `mission_timer` waits 15, then `WHILE mp_timer != 0`, then `abort`: `round_count` += 1,
`mp_winner` = 99, a draw (V2 claim 8), even with two out. This is the room's existing EXTRACTION time-out
(`modeRules(4).timeoutWinner` null). Each branch stops `mission_timer` only after its WAITs, so for 2-4 s after a
decision the clock can still fire `abort` (U5; `TIMEOUT_ABORT_WINDOW_READING`, note only). The room's `decided` state
leaves the play arm, so a time-out never follows a decision.

### 3.3 The minute

On the host, the game-state update (`FUN_002a9ee0` D:L150711-150716; its twin `FUN_002c00f0` D:L163051-163056) compares
`mp_penalty`'s u16 with the value it last saw. When the valve exceeds it, the update calls `FUN_002a6960(game, 0x3c)`
(D:L148936-148949, re-read). That takes the round's total in whole seconds (game +0xe0 ms x 0.001, truncated). Above
`cut` 60 the total becomes total - 60. Otherwise a nonzero total becomes `floor` 1 s, and 0 stays 0
(`PENALTY_MINUTE_READING`). The remaining time is total - elapsed (D:L151085-151093), so a kill late in the round
runs the clock out at once: a draw.

The room keeps the round's total (`roundTotalS`) from `startRound` on. `penaltyMinute()` runs first in `clock()` while
the round is in play or in a decided hold, because the host's update keeps running when only `start` and
`mission_timer` have stopped. On a rise it cuts the total, sets the clock's end to the round's start plus the total,
tells every page `roundTime` with the new total, and marks the score dirty so the rows' `timeLeft` follows. **One minute
per observed change** (`PENALTY_COALESCE_READING`): two rises between two looks cost 60 s, not 120. 190 C3.5 grades that
edge BELIEVED; capture C2 settles it (§7). In the room, two SEAL kills in one tick fire SealKill1 and SealKill2 in the
same tick and cost one minute.

### 3.4 A hostage's death

`FUN_0059ee20` (D:L458059) handles a death. Its escortee branch (D:L458083-458145, re-read) runs for a victim whose
+200 has 0x20000, online, when the killer looked up by id is a type-2 entity (D:L458078). A Terrorist killer adds 1 to
game +0x3c (D:L458127) and a SEAL killer adds 1 to +0x38 (D:L458123). Then `FUN_00545390` scores the killer (HX-5's).
Nobody is kicked. A death with no such killer counts in no valve (`WORLD_KILL_UNCOUNTED_READING`). In the room that
means a death with no seated killer: a departed thrower's round, or a world kill.

`killed(h, by, info)` makes the same moves:
- the body down and the AI stopped;
- the side's valve;
- a `kill` to every page with `victimKind: 'hostage'`;
- the `killed` listeners (HX-5's score);
- a `hostageState` with `alive` false.

The script's one-shots follow on the next ticks (§3.1). A hostage never goes through the room's `kill()`: it gets no
`deaths++`, no score and no bomb drop. **No kill line**: `FUN_00547860` (D:L412863-412909, re-read) takes its `else` for
an escortee victim and plays `FUN_005e7f20(victim, 0x44, 0)`, CMD_MP_HOSTAGE_KILLED, the radio chatter, on every
console (191 §2.3 step 7). The port has no radio chatter (`HOSTAGE_KILL_RADIO_PLACEHOLDER`), and the page posts no line
for a hostage's `kill` (`HOSTAGE_KILL_LINE_READING`). The kill carries the death clip the player's would
(`deathClip`), which the page's remote plays on the body. The escortee's own death lists and `.FEMALE_DEATH` are HX-2's.

## 4. The wire

Everything is additive JSON under protocol 10 (HX.R7, PF.R33). There is no `codec.ts` change and no version bump.

| what | shape | when |
|---|---|---|
| the bodies | one `BodyState` each in the snapshot's list, ids 240-242 (§2.2) | every snapshot (30 Hz) |
| `welcome.hostages` | `HostageWire[]`: `{ id, name, character, at, yaw }`, the state below, and a dead one's `deathClip` and `age` (room ticks since the kill, as the join envelope's corpses, research 231 §4) | the welcome, on a map with them |
| `hostageState` | `HostageStateWire`: `{ id, alive, ai, leader, rescuer, opacity, unit }` | on change; all three at each round's start |
| `roundTime` | `{ seconds }`: the round's total from its start | after a minute is taken |
| `kill.victimKind` | `'player'` or `'hostage'` (absent: a player) | a hostage's death |
| `eliminated.reason` | `'elimination'`, `'rescue'` or `'hostageKills'` (absent: an elimination) | a decision |

**The state is the AI word's fields** (191 §3.1-3.2):
- `ai` is the top state's id (bits 0-7: 0x17 hostage, 9 follow, 0x11 rescued, 2 hold).
- `leader` is the follow's leader, and `rescuer` is the rescued state's owner (bits 8-23: one id in the original's word,
  two fields here).
- `opacity` is the word's nibble (bits 24-27): 15 when the node is inactive or its opacity <= 0, else
  `(1 - opacity) x 15` through `FUN_001b3648`, read as a truncation (D:L432905-432913). The reader's opacity is
  `1 - n / 15` (D:L432833), so the wire carries fifteenths.
- `unit` is the hostage's unit: 17 or its leader's seat id, which HX-4a writes.
- `alive` is the life, which the original sends every pass.

The original sends the word at most every 100 ms on change (V3 (a)). The port sends a reliable event on any change
(`HOSTAGE_STATE_RATE_READING`). Bit 28 (`+0x105d` bit 0) and bit 29 (alive-and-escortee, the compass mark) are HX-5's
to read.

**The page** (`netPage.ts`'s cases, every page's):
- The welcome seeds `NetPage.hostages()`, names each body an escortee (HX-2's `setEscortee`, which also keeps it out of
  the footfall cap) at its opacity (`setOpacity`, fading when the state is 0x11), and lays a dead one as the join
  envelope lays a corpse (`hydrateCorpse` at its age, no clip past the body's fade): a joiner never sees a dead hostage
  standing.
- `hostageState` updates the map, sets the body's opacity (`setOpacity(id, opacity, ai === 0x11)`: HX-2's fade runs a
  rescued one down on the page), and calls the optional `hostageState` dep (HX-4a's page module).
- The page's spectator view is told which bodies are hostages (`SpectatorHost.escortee`). The dead player's cycle never
  takes one (D:L412604-412609). A spectator's cycle and jump do (`SPECTATOR_HOSTAGE_READING`): the original's argument-0
  walk (`FUN_00546fa0` D:L412598-412609) and its jump (`FUN_00294f40` D:L139404-139408) test no escortee bit. Flipping
  the reading to `'excluded'` leaves the hostages out of both, one line.
- A hostage's `kill` posts no line and plays the clip on the body (`remote.died`), with no death voice (HX-2's).
- `roundTime` moves the clock's end by the cut, the new total less the elapsed, and sets the HUD's timer.
- `eliminated.reason` is HX-5's: today's elimination lines are posted meanwhile, and an older page posts them on a
  rescue win too.

## 5. The wiring owed

**None of HX-1's.** It has no page hook of its own. The bodies ride the shared `remote`, the lines the shared `hud`, and
the cases are `netPage.ts`'s, which are open. The `hostageState` dep is declared optional on `NetPageDeps`. Its
`PART_DEPS` line under the `hostages` part is HX-4a's in the wave-4 batch (239 §7). Until the batch lands, every page
draws the hostage bodies and keeps the map, and no page module hears `hostageState`. `Room.takeOver`'s call to
`extraction.rekey(old, id)` (the module's method is built) is HX-4a's one line in `takeOver`, with its leader
bookkeeping.

## 6. Readings and placeholders

| name | where | status |
|---|---|---|
| `HOSTAGE_TEAM_READING` | scene `escortees.ts` (`SimMap.escortees`' `team`) | `0xC0020000`: bits 17, 30, 31 (ESCORTEE, ENEMIES, ALLIES by the SOCOM 1 DWARF's FIRETEAM names, 189 s2 -- the names a reading with a step); the record parser's OR (D:L400381-400401, D:L400443), `FUN_0029ed10` D:L144915, the online swap D:L155859-155866 unchanging it (190 V2 claim 2). Owed: C2 reads `+0xc8` at round start (s7) |
| `ESCORTEE_BIT_READING` | scene `escortees.ts` (`parseEscortees`) | `0x20000`: the test `+200 & 0x20000` every escortee path makes (190 V2 claim 2; 199 s2's friendly-fire exception `0x5ac720-0x5ac74c`) |
| `HOSTAGE_START_LIFT_READING` | scene `escortees.ts` (`placeEscortees`) | `1.0`: the player spawn's lift (`FUN_002b8100` D:L158793; 190 V2 claim 3) applied to an AI body; `FUN_002b28d0`'s own placement unread. Owed: C2's round-start positions |
| `HOSTAGE_FACING_READING` | scene `escortees.ts` (`placeEscortees`) | `0` for heading 0 and default; `FUN_00518ea0` D:L386398-386441 and placement caller D:L155825-155826, section 1.3 (HP-FACING, independently source-reviewed reading). Owed: capture C2, mesh rest facing |
| `ESCORTEE_SETUP_YAWS_READING` | scene `escortees.ts` (`placeEscortees`) | `[0, 315, 270, 225, 180, 135, 90, 45]` for setup headings 0..7 after the caller's half-turn; byte argument, same sources and level as section 1.3. Synthetic all-heading/default/wrapping tests and MP71/MP53 dev-disc records; no runtime comparison |
| `ZONE_CONTAINS_READING` | scene `aimaps.ts` (`zoneContains`) | `'same sub-map, half-open rectangle, on the cell'`: `FUN_0052a200` D:L395058-395098, `FUN_005ced60` mode 1 D:L484881-484900 (190 B2, V2 claim 4); the port's rescue cell is the layered raw `+0xe4` reading (s1.5; research 335 section 9, independently source-reviewed) |
| `ZONE_KIND_NAMES_READING` | -- (`aimaps.ts` `zonesOfKind`'s doc lists them) | *note only*: the seven zone kinds: 0 DEFAULT, 1 EXTRACT_ZONE, 2 SAFE_HOUSE, 3 WORM_HOLE, 4 ROUTER, 5 HUD_VISIBLE, 6 GUARD (`FUN_005d57c0` D:L488569; 190 B2); only kind 1 is used (`zonesOfKind(ai, 1)`), no constant stands in |
| `AUTOSTART_RESET_READING` | viewer `mapMeta.ts` (`MapMeta.autostart`; `WorldState.reset`) | `'re-run'`: the round's reset starts the sets again after restoring the saved references -- online `FUN_002232a0` D:L75850-75866 (`FUN_0026c2e0`, `FUN_0026c4f0`, `FUN_0026c600` on `common` and `mission`), offline `FUN_002ac0e0` D:L151966-151983 then `FUN_002a7d40` D:L149735-149742; `FUN_0026c600` D:L116312-116387 runs while the set's `+1` is clear; 0x21 animations start through `FUN_002713f0` every time (bit 11 clear, kind 1: the kind-3 skip of `FUN_00271390` not theirs) (§0.2). Built: the restore, then every autostart's opening `OBJECT_ACTIVE_STATE` commands re-applied in order (VALVE ops passed over); the page then runs the programs (AS-1, 2026-10-22). The room runs no program. An opening valve's value is the reset's clear to 0. Owed: capture C2 (a Desert Glory bottle and Sandstorm's radio in round 2) |
| `AUTOSTART_INITIAL_READING` | viewer `mapMeta.ts` (`startsWithSet`; `WorldState.startAutostarts`) The same gate is already read by the ui package as `flags & 7 == 1` (`FUN_002713f0` D:L119327-119333; research 106 §158-159; `zanimRuntime.ts:458-466`; `frontend.json:532-538`): the two readings differ for an animation with `& 7` in {3, 5, 7} -- LATER 486 counts them over the map MZANIMs and moves the viewer to `& 7` if any exist. | `flags & 3 == 1`: the animation starts with its set (research 115 R115.6's reading; research 209 §6's row). Not read in `FUN_0026c600`: its D:L116312-116387 run once per set and D:L116360-116372 start every animation of the set; the per-animation gate is elsewhere. **Lead, to read:** `FUN_002713f0` (opens D:L119312) tests byte +3 equal to 1 or 5 and byte +4 `& 7` with cases 1 and 3 (D:L119327-119333) -- a three-bit field, so an animation with `flags & 7 == 5` would be started by the port (`& 3 == 1`) and not by the original. Settled by reading which of those bytes is `params.flags` and what each case does, then counting the disc's animations with `flags & 7 == 5`. **Counted (LATER 486, 2026-10-26, dev-disc `packages/scene/test/startsWithSetDisc.test.ts`): none.** Over the 34 maps with an MZANIM, `params.flags & 7` is 1 (634), 2 (3623) or 3 (330), never 5 or 7, so the flags test agrees with the original's on every map (the state byte +3's test is outside this task); `& 3` is kept. The bytes are mapped by `zanim.ts:307` (+3 state, +4 flags), not re-read at the source by this task. |
| `AUTOSTART_PROGRAM_PLACEHOLDER` | -- | retired 2026-10-26 (removed; LATER 409, `agent/later-409`, Fuse's #442 ported): the page runs the autostart programs (`WorldState.startAutostarts`, `runAutostartPrograms` set by `buildPageWorld` and `/testroom`'s `show`), at load and at the reset; the room does not. Was `'opening only'` |
| `SI_SCRIPT_MOTION_PLACEHOLDER` | viewer `worldState.ts` (the scene host's `begin`, its default) | `'returns at once'`: `OBJECT_MOTION_SI_SCRIPT` (command 26) moves nothing and ends in the tick it begins, so MP6's `f181` / `f182` turn `f18_1` / `f18_2` on and off in one tick. Read so far: record size and start/end times only (`FUN_0025f1b0` D:L108613-108635, `FUN_0025f3c0` D:L108678-108718); undecoded in research 319 §4.2 U1; MP6's six `f18_*.zan` `Script_Data` 0 bytes (`worldAutostart.test.ts`). Settled by reading command 26's begin and tick at the source -- the place: `FUN_0025bc20`'s 26th registration (D:L106890) pairs address `0x25f140` (inside `FUN_0025f050`'s range; not a decompiled function of its own) with `FUN_0025f050` (`FUN_0025f1b0`'s only caller, D:L108557), by analogy with the 25th (D:L106889, opacity's begin and tick); that the 26th registration is command 26 is an inference (the name string at 0x3ece80 unread) -- which field selects the script, the channel vectors -- and where the `.zan` bytes live if not in `Script_Data`; then MP6 rendered with the disc (the jet's flyover) |
| `HOSTAGE_HEALTH_READING` | scene `character.ts` (HX-2's; 238 §5) | HX-2's name since the merge of HX-2: the character the table is read from (`mp_hostage_extract`, `healthOf`); HX-1's literal is `HOSTAGE_PARTS` (server `extraction.ts`), the read's values, the room not yet reading `character.rdr` itself (§7). Listed at 238 §5 |
| `HOSTAGE_VOLUMES_PLACEHOLDER` | -- | retired at the merge of HX-2 (2026-10-06): the room hits a hostage on its own skeleton's capsules, HX-2's `volumesOf({ escortee })` (238 §1.8), by the record's index |
| `HOSTAGE_FF_READING` | server `extraction.ts` (`Room.hostageRefuses`, `ffRefuses`) | `'always hittable'`: the escortee bit lets every hit through with friendly fire off (disassembly 0x5ac720-0x5ac74c; 199 s2, V5 s12.3); the hostage shares a bit with both sides |
| `HOSTAGE_ELIMINATION_READING` | server `extraction.ts` | `'never counted'`: `FUN_002b23a0` D:L155569 counts a hostage to 17/30/31, never 00/08 (190 C2, V2 #14) |
| `RESCUE_WIN_HOLD_READING` | viewer `net/rules.ts` | `2 + 2 + 20 + 1` = 25 s: the rescue branch's WAIT 2, WAIT 2, `success` (190 C2's table; V2 claim 12) |
| `HOSTAGE_KILL_WIN_HOLD_READING` | viewer `net/rules.ts` | `2 + 20 + 1` = 23 s: the hostage-kill branch's WAIT 2, `failure`; the same value as `eliminatedHoldS('MP6')` (190 C2; V2 claim 12) |
| `PENALTY_MINUTE_READING` | server `extraction.ts` (`Room.penaltyMinute`) | `{ cut: 60, floor: 1 }`: `FUN_002a6960` D:L148936-148949 (190 C3.5, V2 claim 10) |
| `PENALTY_COALESCE_READING` | server `extraction.ts` | `'one minute per observed change'`: D:L150711-150716 (190 C3.5, BELIEVED). Owed: C2, game +0xe0 around a double SEAL kill (s7) |
| `RESCUECHECK_READING` | server `extraction.ts` (`sealCheck`) | `'all three resolved'`: SEALcheck's four equality branches (190 s4 C; V2 s10.7) |
| `ONE_SHOT_WAIT_READING` | server `extraction.ts` | `2` s: HostKill's and SealKill's WAIT 2 before their valves (190 s4 C's table); the script's frames approximated by room ticks |
| `HOSTAGE_KILL_LINE_READING` | viewer `net/rules.ts` (`netPage.ts`'s `kill` case) | `'none'`: `FUN_00547860` D:L412863-412909's escortee `else` (190 C3, V2 claim 9) |
| `HOSTAGE_KILL_RADIO_PLACEHOLDER` | server `extraction.ts` | `'unplayed'`: CMD_MP_HOSTAGE_KILLED (0x44) chatter, `FUN_005e7f20` (191 s2.3 step 7); the port has no radio chatter |
| `WORLD_KILL_UNCOUNTED_READING` | server `extraction.ts` | `'no valve'`: no type-2 killer, no count (`FUN_0059ee20` D:L458078) |
| `HOSTAGE_STATE_RATE_READING` | server `extraction.ts` | `'on change'`: a reliable event against the original's <= 100 ms AI-word field (191 s3.1-3.2, V3 (a)); the opacity as the word's nibble (D:L432905-432913, D:L432833) |
| `DEAD_IN_FADE_READING` | server `extraction.ts` | `'a corpse at its frozen opacity'`: a dead hostage's AI is not stepped (238 s2.6), the fade's `SetActive` (D:L422207) no longer called; the body kept dead, a hidden one dropped. Owed: C2 (what the console draws) |
| `SPECTATOR_HOSTAGE_READING` | viewer `spectatorView.ts` | `'included'`: a spectator's cycle (`FUN_00546fa0` D:L412598-412609, argument 0) and jump (`FUN_00294f40` D:L139404-139408) test no escortee bit -- only the dead player's arm does; that a hostage is a type-2 entry of `0x4362e0` is inferred (a step). Owed: C2 (a spectator's Right on MP6) |
| `TIMEOUT_ABORT_WINDOW_READING` | -- | *note only*: each decision's branch stops `mission_timer` after its WAITs, a 2-4 s window where `abort` can still fire (190 U5); the room's `decided` state leaves the play arm, so no time-out follows a decision |
| what | read | settles |
| the starts | the three hostages' positions and facing at round start | `HOSTAGE_START_LIFT_READING`, `HOSTAGE_FACING_READING` (HX-0b) |
| the mask | body `+0xc8` of a hostage at round start | `HOSTAGE_TEAM_READING` (HX-0b) |
| the AI word | `+0x70` across a round (state, opacity nibble, bits 28-29) | `HOSTAGE_STATE_RATE_READING`'s nibble |
| the minute | game `+0xe0` (ms) and `+0xc0` around one SEAL kill and around two in one update | `PENALTY_MINUTE_READING`, `PENALTY_COALESCE_READING` |
| a kill in the fade | what a console draws of a hostage killed at partial opacity | `DEAD_IN_FADE_READING` |
| the one-shots | the valves' timing after a kill (the WAIT 2) | `ONE_SHOT_WAIT_READING` |
| the spectator | a spectator's Right on MP6 with the hostages alive: whether the follow lands on one | `SPECTATOR_HOSTAGE_READING` |

*(HX-1 adds its rows below.)*

## 7. Owed

*(HX-1 writes this section: C2's rows. HX-0b's are the starts' positions and facing, and `+0xc8` at round start (s6).)*

- W0 (§0.2): the called airstrike programs still never show their aircraft (MP73 `chopper1`, MP62/MP82 `f18_plane`).
  AS-1 runs the autostart set only. `OBJECT_MOTION_SI_SCRIPT` is still not run, so Desert Glory's jet does not travel.


Capture C2 (the one PCSX2 session on MP6 of research 207 s9, the owed evidence) settles each of these.

|---|---|---|


The room's own read of the hostages' health (`healthOf` on `HOSTAGE_HEALTH_READING`, HX-2's) is owed: no
`character.rdr` table reaches the room, so `HOSTAGE_PARTS` holds the read's values meanwhile.
