# 215 -- Emplaced weapons as built: the turrets' data layer (web sprint 27, MAP-10a)

- Date: 2026-10-05 (web sprint 27). MAP-10a: the manual turrets' definitions, the prefix match, the placed parts, the
  limits and the ammunition read in `@s2u/scene` and carried on the room's map; the room's authority (mount, aim,
  fire, release) and the page's drawing are MAP-10b's.
- Status: **reading, pending review.** Every value is a read of the disc's files or of the decompilation (`D:L<n>` of
  `socom2_game.elf.decomp.c`, the r0001 decompilation at `C:/projects/socom_pc/game/analysis/`); nothing here is a
  capture. Research 177 grades its anchors read and its census measured; under AGENTS.md a source read is a reading
  until reviewed (research 206).
- Sources: research [177](177-emplaced-weapons-audit.md) s2 (the definitions and the match), s3 (the census), s4 (the
  limits and the data); [173](173-demolition-map-audit.md) s2 (Crossroads' table); [193](193-m2-mp-net-replication.md)
  s2.2 and s4.3 (the TurretObject, MAP-10b's); the S27 dispatch's s8 and ruling PF.R31; the map plan's MAP-10
  ([`../plans/2026-10-04-multiplayer-map-parity.md`](../plans/2026-10-04-multiplayer-map-parity.md)).
- Code: `packages/scene/src/turrets.ts` (`turretDefsOf`, `parseTurretDefs`, `matchTurretDef`, `placeTurrets`,
  `turretSceneModels`, `readTurrets`), `packages/viewer/src/loadout.ts` (`kitTurretDefs`), `packages/viewer/src/simMap.ts`
  (`mapTurrets`, `SimMap.turrets`, `simMapFromBytes`'s `kits`), `packages/viewer/src/loadMap.ts` (`LoadedMap.turrets`),
  `packages/viewer/src/net/loopback.ts` (`LoadedForMatch.turrets`), `packages/match/src/server.ts` (the parse passes
  its kit source), `tools/probe-map-turrets.ts` (now the package's resolution).
- Tests: `packages/scene/test/turrets.test.ts`, `packages/viewer/test/simMap.test.ts` ("MP72's SimMap carries ..."),
  `packages/central/test/server.test.ts` ("the server's Crossroads parse carries ..."); the registry
  [`../parity/registry/emplacements.json`](../parity/registry/emplacements.json).
- MAP-10b (2026-10-05, the room's authority and the page; s3 and s6 below): code `packages/viewer/src/net/emplacement.ts`
  (`canMount`, `clampAim`, `gunLine`, `muzzleAt`, `gunDelta`, `TurretWire`), `packages/match/src/room.ts` (`turrets`,
  `turretRequest`, `resolveMounts`, `onTurret`, `turretRound`, `releaseTurret`, `resetTurrets`, `tellAmmo`; `text`'s
  `mount`/`dismount`, `fire`, `kill`, `leave`, `startRound`, `abandon`, `hello`'s `turrets?`), `packages/viewer/src/net/protocol.ts`
  (the two client events, the `turret` event, `welcome.turrets?`), `packages/viewer/src/turretPage.ts` (`TurretPage`),
  `packages/viewer/src/loadMap.ts` (`turretParts`), `packages/scene/src/turrets.ts` (`TurretPlacement.facing`,
  `gunOrigin`, `firepointOrigin`), `packages/scene/src/arsenal.ts` (`KitTable.turretRecords`); tests
  `packages/viewer/test/emplacement.test.ts`, `packages/match/test/roomTurrets.test.ts`,
  `packages/viewer/test/turretPage.test.ts`, the `mount`/`dismount` shapes in `roomHostile.test.ts` and `roomFuzz.test.ts`.

## 0. The answers

| question | answer | source |
|---|---|---|
| Where the definitions are | `RUN/READERC.ZAR/ai_turrets.rdr`, one `TURRET` list of alternating name / record, 45 definitions on the disc (0x19c bytes each in the game's table) | `FUN_003aaa90` D:L301346-301412 |
| Which definition a node takes | the first in file order whose whole name is a case-sensitive prefix of the node's name; an empty template or name matches nothing | `FUN_003aac40` D:L301416-301445; `FUN_00199648` D:L16178-16273 |
| What makes a placement | the outermost matched node with all three of its definition's `PARTS` (turret, gun, firepoint, in that order) beneath it | `FUN_003aa350` D:L301117-301237; `FUN_003a9a80` D:L300759-300893 |
| Where the parts are | in the embedded GEO libraries' prototypes (`RMG_turret`, `LMG_turret`, `30mm_MGL_turret` and their `_ledge` forms), joined to the map's graph by name; never in the map's own graph | s1.3 below |
| The census | 43 placements on 15 of the 22 maps: 34 PKM, 4 LMG, 5 MGL; 14 thermal; Frostfire's four `tank1` excluded | s2 below; research 177 s3 reproduced |
| Crossroads | `mp72_turret01` PKM at (600.394, 56.188, 1595.459), yaw -10..110, pitch -45..35; `mp72_turret02` LMG at (2129.683, 112.5, 1462.799), +-70 / +-45; range 22 (the loader's default), the authored angle 35 (the default is 45) and health 30 (no default: set only when authored) | s2; research 173 s2 |
| Vigilance | `mp51_turret01..04`, all `mp51_turret`, PKM TURRET, no thermal | s2 (disc) |
| Ammunition | `Ammo_Capacity x NumMags` of the weapon's `zweapon.rdr` record: PKM TURRET (205) 250 x 3 = 750, LMG TURRET (207) 75 x 3 = 225, MGL FRAG TURRET (230) 24 x 3 = 72 | `FUN_003a9a80` D:L300860-300866; research 177 s4 |
| TEAM | `TEAM (30)` on every manual definition; the loader makes it the mask `1 << 30` and the turret object carries `1 << 30 \| 1 << 27`; the mask's consumer is unread, so it is applied nowhere (s1.1) | `TURRET_TEAM_READING` |

## 1. The parser and the match, as built

### 1.1 The definition

`FUN_003aaa90` takes the `TURRET` list's length over two as the count and hands `FUN_003aad20` the name at 2i and the
record at 2i + 1 (D:L301346-301412); `turretDefsOf` does the same, in the file's order (`TurretDef.index`). The keys
`FUN_003aad20` asks the record for are the strings at 0x3fbff0-0x3fc0d0 (the ELF's bytes there): `PARTS`, `LIMITS`
(`YAW`, `PITCH`), `RATES` (`YAW`, `PITCH`), `EFFECT`, `TRIGGER` (`dn_time`, `up_time`), `AI_LOOKDIR`, `MANUAL`,
`AUTOSCAN`, `COMPASS`, `TEAM`, `MOUNTABLE_RANGE`, `MOUNTABLE_ANGLE`, `ai_params`, `HEALTH`, `WEAPON` (`NAME`, `AMMO`),
`DESTROY_ANIM`, `THERMAL`. What the data layer keeps:

| field | the read | `TurretDef` |
|---|---|---|
| the name | copied to a 0x20-byte field, 31 bytes and a NUL (D:L301488-301490) | `name` (clipped to 31) |
| `PARTS` | at most three (`uVar16 < 3`, D:L301502), each 31 bytes (D:L301521-301522) | `parts` |
| `LIMITS` | two floats each, x 0.017453292 to radians (D:L301529-301540) | `limitsDeg` (as authored); the placement's `limits` in radians |
| `RATES` | one float each, stored as written, no conversion (D:L301542-301545) | `rates` (raw; `TURRET_RATE_UNITS_READING`) |
| `MANUAL` | a bare flag (no value list on the disc), clears flag bit 1 (D:L301630-301633) | `manual` |
| `MOUNTABLE_RANGE` | absent: 22; squared (D:L301643-301648) | `mountRange` (unsquared) |
| `MOUNTABLE_ANGLE` | absent: 45; to radians, then its cosine (D:L301649-301654) | `mountAngle` (degrees); the placement's `mountAngleCos` |
| `HEALTH` | one float, set only when present (D:L301657-301660) | `health` (null when absent) |
| `WEAPON` | `NAME` through `FUN_003d19e0`, `AMMO` through `FUN_003d4380` (D:L301661-301705) | `weapon`, `ammo` (the ammunition's *type*) |
| `THERMAL` | a flag (D:L301769-301771) | `thermal` |
| `TEAM` | the key at 0x3fc020 (D:L301593-301597): a list, each n <= 31 ORed in as `1 << n` by `FUN_00533c10` (D:L400719-400762), stored at +0x12c; `FUN_003a9a80` writes it onto the turret object's +200 (`FUN_0029ed10`, D:L300877) and ORs in bit 0x1b (`FUN_0029ece0`, D:L300878) | `team` (`{ list, mask }`; `teamMask`) |

`TEAM (30)` on the disc becomes the definition's mask `1 << 30` and the turret object's +200 mask `1 << 30 | 1 << 27`
(D:L300877-300878). What reads the object's +200 -- a mount gate by the player's team bits, or a membership the AI or
the compass uses -- is not traced; the data layer records the list and the mask and applies neither (s4,
`TURRET_TEAM_READING`; PF.R31: both sides may mount). (Corrected 2026-10-05 in review: the first draft said the loader
never asks for `TEAM`; it rested on `socom2_game.elf.strings.txt`, which omits four-character strings -- `YAW`, `TEAM`,
`NAME`, `AMMO` are all absent from it -- while the ELF's bytes at 0x3fc020 are `TEAM`.)

### 1.2 The match

`FUN_003aac40` walks the table in order and returns the first definition for which `FUN_00199648(placed, template,
strlen(template)) == 0`: a bounded, case-sensitive byte compare over the template's length (D:L301416-301445,
D:L16178-16273). `matchTurretDef` is `placed.startsWith(template)` with an empty template or name refused -- the same
on the disc's ASCII names. Enowapi's `mp62turret2` takes `mp62turret` (pitch -50..15), the earlier and shorter
template, not `mp62turret2` (research 177 s2 asks a capture of it before it binds runtime behaviour); the placed
`mp62MGLturret ` (a trailing space) takes `mp62MGLturret`. Nothing is trimmed or lower-cased.

### 1.3 The placement and the libraries

`placeTurrets` walks the world tree (`flattenScene(models, 'worldmodel')`) in order, takes each node a definition
matches unless a node already taken is above it (the outermost), and keeps it only when each of the definition's three
parts names a node beneath it -- the first in the walk's order, through a child (`/`) or a realised prototype (`=`). A
match without its parts is told to `excluded` and placed nowhere (the map's loader drops those lines: they are the disc's data, not a fault, and Frostfire's diagnostics stay empty): Frostfire's four `worldmodel/tanks_alot*=tank1` match
the campaign's `tank1` (no `MANUAL`) and have none of `t72_turret`, `t72mgun`, `firepoint_mgun`.

The parts are not in the map's graph. On Crossroads `MP72_GEO.ZED` holds `worldmodel/mp72_turret01` (a generic node,
no visuals) with one child, the instance `RMG_turret` (type 2, no visuals), whose prototype is not among the map's
models; `TURR_GEO.ZED`'s is. `turretSceneModels` joins every embedded `*_GEO.ZED` library's prototypes to the map's by
name, the map's own first, then the archive's order, a name already present kept -- the precedence
`tools/probe-map-turrets.ts` used; research 177 s2 says it does not establish the engine's rule among duplicate names.
`readTurrets` opens the libraries only when a node of the map's own walk (a name or an instance's model) matches a
definition, so a map with no candidate (MP1, MP6, ...) costs one walk of its graph.

## 2. The census, through the package

`npx tsx tools/probe-map-turrets.ts` (now `parseTurretDefs`, `turretSceneModels`, `placeTurrets`), run 2026-10-05
over the 22 maps with `SOCOM_DISC=C:/Projects/socom_pc/game/disc` (MP2, MP6, MP72 from `test-fixtures/RUN`): **43
placements**, the 43 of research 177 s3, each with exactly the three parts. MP1, MP2 (four `tank1` excluded), MP6, MP7,
MP8, MP12 and MP81 place none. The id is the placement's index in the map's walk; the library column is the prototype
the parts are reached through.

| map | id | root | definition | weapon | ammo | yaw / pitch (deg) | range | thermal | origin | parts through |
|---|---|---|---|---|---|---|---|---|---|---|
| MP5 | 0 | `mp5_turret_lmg` | `mp5_turret_lmg` | LMG TURRET | 225 | -30..30 / -45..35 | 22 | yes | 972.334, 161.435, 1898.06 | `LMG_turret=LMG_turret` |
| MP5 | 1 | `mp5_turret_rmg` | `mp5_turret_rmg` | PKM TURRET | 750 | -30..30 / -45..35 | 22 | yes | 1130.639, 233.561, 635.082 | `RMG_turret_ledge=RMG_turret_ledge` |
| MP9 | 0 | `mp9_turret01` | `mp9_turret` | PKM TURRET | 750 | -30..30 / -20..45 | 25 | no | 1245.318, 18.154, 1381.434 | `RMG_turret=RMG_turret` |
| MP9 | 1 | `mp9_turret02` | `mp9_turret` | PKM TURRET | 750 | -30..30 / -20..45 | 25 | no | 1080.925, 18.857, 1214.788 | `RMG_turret=RMG_turret` |
| MP9 | 2 | `mp9_turret03` | `mp9_turret` | PKM TURRET | 750 | -30..30 / -20..45 | 25 | no | 2587.778, 19.214, 666.377 | `RMG_turret=RMG_turret` |
| MP9 | 3 | `mp9_turret04` | `mp9_turret` | PKM TURRET | 750 | -30..30 / -20..45 | 25 | no | 2793.574, 18.55, 880.273 | `RMG_turret=RMG_turret` |
| MP10 | 0 | `mp10_turret_lmg` | `mp10_turret_lmg` | LMG TURRET | 225 | -70..70 / -35..45 | 25 | no | 698.614, 141.957, 1654.371 | `LMG_turret=LMG_turret` |
| MP10 | 1 | `mp10_turret_rmg` | `mp10_turret_rmg` | PKM TURRET | 750 | -70..70 / -35..45 | 25 | no | 2039.017, 104.383, 1664.633 | `RMG_turret=RMG_turret` |
| MP10 | 2 | `mp10_turret_mgl` | `mp10_turret_mgl` | MGL FRAG TURRET | 72 | -70..70 / -25..10 | 22 | no | 1427.064, 184.234, 2135.551 | `30mm_MGL_turret=30mm_MGL_turret` |
| MP11 | 0 | `mp11_turret03` | `mp11_turret` | PKM TURRET | 750 | -30..30 / -20..45 | 25 | no | 1239.421, -26.425, 259.477 | `RMG_turret=RMG_turret` |
| MP11 | 1 | `mp11_turret01` | `mp11_turret` | PKM TURRET | 750 | -30..30 / -20..45 | 25 | no | 1462.695, -6.194, 726.393 | `RMG_turret=RMG_turret` |
| MP11 | 2 | `mp11_turret02` | `mp11_turret` | PKM TURRET | 750 | -30..30 / -20..45 | 25 | no | 1097.788, -36.395, 674.233 | `RMG_turret=RMG_turret` |
| MP51 | 0 | `mp51_turret01` | `mp51_turret` | PKM TURRET | 750 | -70..70 / -45..45 | 22 | no | 1237.637, 89.061, 948.578 | `RMG_turret=RMG_turret` |
| MP51 | 1 | `mp51_turret02` | `mp51_turret` | PKM TURRET | 750 | -70..70 / -45..45 | 22 | no | 478.582, 97.313, 792.475 | `RMG_turret=RMG_turret` |
| MP51 | 2 | `mp51_turret03` | `mp51_turret` | PKM TURRET | 750 | -70..70 / -45..45 | 22 | no | 687.607, 148.035, 1201.95 | `RMG_turret=RMG_turret` |
| MP51 | 3 | `mp51_turret04` | `mp51_turret` | PKM TURRET | 750 | -70..70 / -45..45 | 22 | no | 1355.478, -14.58, 459.676 | `RMG_turret=RMG_turret` |
| MP52 | 0 | `mp52gren_turret_1` | `mp52gren_turret` | MGL FRAG TURRET | 72 | -40..40 / -25..0 | 22 | no | 3602.383, 147.274, 1992.961 | `30mm_MGL_turret_ledge=30mm_MGL_turret_ledge` |
| MP52 | 1 | `mp52gren_turret_2` | `mp52gren_turret` | MGL FRAG TURRET | 72 | -40..40 / -25..0 | 22 | no | 2516.767, 88.317, 2045.958 | `30mm_MGL_turret_ledge=30mm_MGL_turret_ledge` |
| MP52 | 2 | `mp52gun_turret_1` | `mp52gun_turret` | PKM TURRET | 750 | -70..70 / -30..45 | 22 | no | 3597.282, 155.766, 2891.005 | `RMG_turret=RMG_turret` |
| MP53 | 0 | `mp53_turret1` | `mp53_turret` | PKM TURRET | 750 | -35..35 / -20..45 | 25 | no | 2522.609, 103.513, 3977.236 | `LMG_turret_ledge=LMG_turret_ledge` |
| MP53 | 1 | `mp53_turret2` | `mp53_turret` | PKM TURRET | 750 | -35..35 / -20..45 | 25 | no | 3372.061, 218.894, 1804.065 | `LMG_turret_ledge=LMG_turret_ledge` |
| MP53 | 2 | `mp53_turret3` | `mp53_turret` | PKM TURRET | 750 | -35..35 / -20..45 | 25 | no | 1623.223, 56.199, 2902.375 | `LMG_turret_ledge=LMG_turret_ledge` |
| MP61 | 0 | `mp61turret_2` | `mp61turret_2` | PKM TURRET | 750 | -25..25 / -30..20 | 22 | yes | 646.612, 1.643, 2210.346 | `RMG_turret=RMG_turret` |
| MP61 | 1 | `mp61turret_1` | `mp61turret_1` | PKM TURRET | 750 | -50..60 / -45..20 | 22 | yes | 594.96, 1.643, 2193.924 | `RMG_turret_ledge=RMG_turret_ledge` |
| MP61 | 2 | `mp61turret_3` | `mp61turret_3` | PKM TURRET | 750 | -60..60 / -30..20 | 22 | yes | 984.806, 62.363, 1734.289 | `RMG_turret=RMG_turret` |
| MP62 | 0 | `mp62MGLturret ` | `mp62MGLturret` | MGL FRAG TURRET | 72 | -70..70 / -25..10 | 22 | no | 2590.015, 296.124, 1392.342 | `30mm_MGL_turret=30mm_MGL_turret` |
| MP62 | 1 | `mp62turret` | `mp62turret` | PKM TURRET | 750 | -70..70 / -50..15 | 22 | yes | 1650.528, 291.303, 1889.615 | `RMG_turret=RMG_turret` |
| MP62 | 2 | `mp62turret2` | `mp62turret` | PKM TURRET | 750 | -70..70 / -50..15 | 22 | yes | 1307.152, 292.142, 1392.921 | `RMG_turret=RMG_turret` |
| MP64 | 0 | `mp64turret_1` | `mp64turret` | PKM TURRET | 750 | -70..70 / -45..45 | 22 | yes | 576.101, 112.412, 2603.979 | `RMG_turret=RMG_turret` |
| MP64 | 1 | `mp64turret_2` | `mp64turret` | PKM TURRET | 750 | -70..70 / -45..45 | 22 | yes | 1782.101, 156.805, 1756.283 | `RMG_turret=RMG_turret` |
| MP64 | 2 | `mp64turret_3` | `mp64turret` | PKM TURRET | 750 | -70..70 / -45..45 | 22 | yes | 440.59, 108.167, 674.156 | `RMG_turret=RMG_turret` |
| MP71 | 0 | `mp71_turret01` | `mp71_turret` | PKM TURRET | 750 | -45..45 / -45..45 | 22 | no | 2149.914, 188.084, 1292.843 | `RMG_turret=RMG_turret` |
| MP71 | 1 | `mp71_turret02` | `mp71_turret` | PKM TURRET | 750 | -45..45 / -45..45 | 22 | no | 2348.119, 234.561, 471.707 | `RMG_turret=RMG_turret` |
| MP72 | 0 | `mp72_turret02` | `mp72_turret02` | LMG TURRET | 225 | -70..70 / -45..45 | 22 | no | 2129.683, 112.5, 1462.799 | `LMG_turret=LMG_turret` |
| MP72 | 1 | `mp72_turret01` | `mp72_turret01` | PKM TURRET | 750 | -10..110 / -45..35 | 22 | no | 600.394, 56.188, 1595.459 | `RMG_turret=RMG_turret` |
| MP73 | 0 | `mp73MGLturret` | `mp73MGLturret` | MGL FRAG TURRET | 72 | -35..35 / -25..10 | 22 | no | 870.179, 143.561, 1490.162 | `30mm_MGL_turret=30mm_MGL_turret` |
| MP73 | 1 | `mp73turret_1` | `mp73turret` | PKM TURRET | 750 | -35..35 / -25..10 | 22 | yes | 585.595, 90.451, 1680.024 | `RMG_turret_ledge=RMG_turret_ledge` |
| MP73 | 2 | `mp73turret_2` | `mp73turret` | PKM TURRET | 750 | -35..35 / -25..10 | 22 | yes | 1152.504, 143.442, 1020.327 | `RMG_turret=RMG_turret` |
| MP82 | 0 | `mp82turret_1` | `mp82turret` | PKM TURRET | 750 | -60..60 / -45..45 | 22 | no | 2098.247, 111.609, 2068.9 | `RMG_turret=RMG_turret` |
| MP82 | 1 | `mp82turret_2` | `mp82turret` | PKM TURRET | 750 | -60..60 / -45..45 | 22 | no | 721.456, 24.079, 459.667 | `RMG_turret=RMG_turret` |
| MP82 | 2 | `mp82turret_3` | `mp82turret` | PKM TURRET | 750 | -60..60 / -45..45 | 22 | no | 1305, 141.992, 1703.469 | `RMG_turret=RMG_turret` |
| MP83 | 0 | `mp83_turret_pkm01` | `mp83_turret_pkm` | PKM TURRET | 750 | -60..60 / -45..45 | 22 | yes | 1613.917, 169.867, 798.443 | `RMG_turret=RMG_turret` |
| MP83 | 1 | `mp83_turret_lmg01` | `mp83_turret_lmg` | LMG TURRET | 225 | -60..60 / -45..45 | 22 | yes | 965.019, 157.867, 2504.012 | `LMG_turret=LMG_turret` |

Every definition here is `MANUAL` and authors health 30, angle 35, rates 1.5 / 1.5 and `TEAM (30)`. The weapon-name match a row shows
says nothing of the projectile: MGL FRAG TURRET is an explosive round (research 177 s5), MAP-10b's to fire. The probe's
`unmatchedTurretNames` are scenery (`sandbag_turret` on MP51 and MP73, MP73's `aagun_zpu4/whats_left/turret`), no
definition's prefix.

## 3. What the placement resolves, and what MAP-10b draws by

The parts' paths resolve **only through the joined library prototype**: Crossroads' are
`worldmodel/mp72_turret01/RMG_turret=RMG_turret/turret`, `.../turret/gun`, `.../turret/gun/firepoint` (turret 2:
`.../mp72_turret02/LMG_turret=LMG_turret/...`). The page's scene (`viewer/src/loadMap.ts` `place`) flattens
`MP72_GEO.ZED` alone: `placeInstances` over it yields **no placement under either root** (the root and its `RMG_turret`
instance node carry no visuals, and the prototype is absent), so no drawn node sits at any of these paths and a
`WorldView.moveNode(gunPath, ...)` has nothing to turn. The room needs none of it for the data (origin, limits, mount
range and angle, ammunition): the firepoint's world position is the one value MAP-10b reads off a part, and
`placeTurrets` has its path; its world matrix is the joined walk's (`flattenScene(turretSceneModels(...))`).

MAP-10b therefore draws by one of two routes, and must say which: (a) the page's `place` joins the same libraries'
prototypes (`turretSceneModels`) so the turret, gun and firepoint become drawn nodes at exactly these paths -- the
`TURR_MDL` chunks the page already opens (`mdlArchives`) supply their meshes -- and `moveNode` turns the gun; or (b) the
gun is drawn by the occupant's aim without the part, a placeholder. Whether the turret is visible on the page at all
today is MAP-10b's to check in a browser (this task ran none).

**MAP-10b took route (a)** (2026-10-05). `loadMap.ts` `turretParts` (one function, 38 lines with its comment, called
from `place`): when a node of the map's walk matches a definition, it joins the libraries (`turretSceneModels`), places the
turrets (`placeTurrets`) and adds to the drawn placements only those beneath a placed turret's root -- on Crossroads 13
of them, 6 under the LMG and 7 under the PKM (the base `RMG_turret=RMG_turret` / `LMG_turret=LMG_turret`, the gun's `gunvis/*_sort*`, `bullet_scroll`,
`bullet_still`, `thermal_scope`); nothing else the join reaches is drawn (it would also realise `mp72_sky=mp72_sky`).
Two findings: (1) **the libraries' buffers use the fallback chunk naming** -- `TURR_MDL.ZED`'s `RMG_turret` holds
`N000_000 .. N006_003`, never `N000_I000_V00` -- each library model exported alone, with no instance context, so a part
takes `chunkKey(node, null, visual)` whatever the map's instance count (with the map's count every chunk was "no such
chain"); (2) the gun's pivot is the root's origin on both Crossroads turrets (`gun`'s world origin equals the root's), its
rest line the gun part's -z axis: turret 1 faces 0 (yaw, the body's convention), turret 2 90.92. `TurretPage.frame`
turns the drawn gun by `WorldView.moveNode(parts.gun, gunDelta(t, yaw, pitch))` -- a turn about the pivot that carries
the firepoint to `muzzleAt`, the room's round start -- for its own occupant by its clamped look, for another's by that
body's snapshot yaw and pitch. The load: `loadMap` of the MP72 fixture under node, three runs each, 337-347 ms before and
344-356 ms after (about +8 ms: the libraries' parse, 5.9 ms measured alone, and a second placement walk); maps with no
candidate pay one walk of the graph. **What `THERMAL` shows (LATER 166, 2026-10-19; reading, pending review):** the
turret's making finds its model's `scope` and `thermal_scope` nodes by name (0x3fbfd0, 0x3fbfd8) and shows
`thermal_scope` only when the definition's flag (`+0x298`, D:L300794; the key, D:L301769-301771) is set, `scope` only
when it is not (`FUN_003a9a80` D:L300804-300828); the mount and the release run the same toggle (`FUN_003a9ea0`
D:L300898-300928). The turret libraries hold `thermal_scope` alone (no `scope` node: Crossroads' RMG and LMG, the MP72
fixture), so a plain turret draws no scope node and a THERMAL one its `thermal_scope` (4 visuals). Built:
`@s2u/scene` `turretScopeHidden`, applied to `loadMap.ts` `place`'s drawn placements (the libraries' parts and a map's
own-graph turret alike; `turretParts` now hands its placements back); the forge's pieces are `loadMap`'s props, so
they follow. Tests: `scene/test/turrets.test.ts` "LATER 166: turretScopeHidden ..." (synthetic: no THERMAL map is in
the fixtures), `viewer/test/turretParts.test.ts` "LATER 166: a plain turret draws no thermal_scope" (RED before: both
Crossroads guns' `thermal_scope`). *Was:* "`thermal_scope` (4 visuals) is drawn on every RMG/LMG placement, the
non-thermal Crossroads ones too: what `THERMAL` (D:L301769-301771) hides is unread." The browser look (2026-10-06) found the parts
decoded in the world's `'bias'` form: the turret libraries are `'scale'` (research 79 §2.1), so every part drew ~150
times its size -- the owner's mustard "bubbles" over the 15 maps with turrets. The decoder now takes each archive's form
(`archivePositionForm`), every part lands inside its node's bbox (`test/turretParts.test.ts`), and the gun's meshes lie
within 9.6 units of the pivot on all six MP51/MP72 turrets.

## 4. Readings

| name | stands for | why a reading | status |
|---|---|---|---|
| `TURRET_RATE_UNITS_READING` (`scene/src/turrets.ts`) | the unit of `RATES` YAW/PITCH (1.5 on every manual definition) | stored as written beside the limits' degree conversion (D:L301542-301545); no consumer traced. The data layer keeps the raw number (`TurretDef.rates`); **MAP-10b does not apply it**: nothing reads `rates`, the look is unslowed and the aim is clamped straight to the stop (`clampAim`), where S27-DISPATCH s8 asked the rate as radians a second on the clamp's approach (s6) | open: the consumer's read, or capture B 13 (the time to each stop) |
| `TURRET_TEAM_READING` (`scene/src/turrets.ts`) | `TEAM (30)`, the turret object's mask `1 << 30 \| 1 << 27` | the mask is written onto the turret object (`FUN_0029ed10`, D:L300877; s1.1); its consumer as a mount gate or a membership is unread; recorded (`TurretDef.team`: list and mask), applied nowhere; PF.R31: both sides may mount | open: capture B 13 (a SEAL and a Terrorist mounting) |
| `TURRET_VERTICAL_READING` (`scene/src/turrets.ts`) | the mount test's vertical bound | `FUN_003a90c0` refuses when the squared vertical separation exceeds `DAT_003e0828` (D:L300487-300489), a constant the decompilation does not give: null, unread, not applied, no test | open: the constant's bytes off the ELF, or capture B 13 (a mount from a step) |
| `TURRET_POSE_PLACEHOLDER` (`viewer/src/turretPage.ts`) | the mounted body's pose on the others' pages | replaced 2026-10-07 (s7): the turret anim set's clips are read; the open parts are `TURRET_HOLD_FACING_READING` and `TURRET_HOLD_KEY_READING` | was |
| `TURRET_HOLD_FACING_READING` (`viewer/src/turretPage.ts`) | the mounted body's facing: the gun's clamped aim, at its seat | read 2026-10-09 (PB-2, s7.4): in the hold `FUN_00585cd0` (D:L444609-444623) lays the actor's orientation each tick on the gun's forward flattened -- the body faces the gun's yaw, the port's aim; the gun's own turn is the sticks' (`FUN_003a7350`), the port's the look's (MAP-10b's aim model) | open: capture B 13 (the mounted body at both yaw stops) |
| `TURRET_HOLD_KEY_READING` (`viewer/src/turretPage.ts`, a comment) | the key of `seal_turret_poses` held while mounted: 1, the middle of three | replaced 2026-10-09 (PB-2, s7.4) by the read driver `turretHoldKey`: `FUN_00585cd0` sets the hold's phase from the gun's elevation | was |
| `TURRET_SEAT_READING` (`viewer/src/net/emplacement.ts`) | the port's steer onto the seat | built 2026-10-16 (PB-2c, s7.1 "The seat, re-read and built"; reading, pending review -- PB-2b's part-2 read re-read at the source): `FUN_005b3340` (the one-shot branch of `FUN_0057a330`, D:L439017-439020) aims the root at the place plus `refPt` turned to the facing `FUN_005463c0` recorded -- the gun part's flattened forward at the mount (D:L412268-412297; `TurretState.gunYaw`, the page's drawn aim) -- with the root's x and z zeroed (D:L468927; the tick zeroes them after the pose, D:L439099-439102 / D:L439147-439148, the steer before it, D:L439020) and `refPt` moved by the clip root's velocity x dt after each tick's offset (D:L468947-468951; `FUN_0028c250` D:L134145-134181 through `FUN_00289bb0` D:L132691-132754, x `DAT_0064fc80` = 1, D:L418170, D:L438985); the offset x sqrt(ease) of the motion's phase as it stands, 0 to (n - 1)/n (D:L468835-468839, D:L468929; the port eased the phase scaled to 1 -- found and built by PB-2c); the turn (`seatTurn`) through the mover; the clip off at the driver's end test before the advance (`FUN_0028c6e0` D:L134283-134308 via `FUN_00582540` D:L418193, PAR-69's uncut-end rule): 16 steer ticks at 60 Hz, key 24.04 (the game's frame: 8, key 24.06), the hold on the 17th; the vertical read: the move lays the floor's height after each move (D:L413943-413946, `FUN_0059afd0`), so the feet stay on the floor (`SeatMover.lift` retired). The steer leaves the feet 0.215 from the hold's place at 60 Hz (0.293 at the game's frame) on all six turrets of Crossroads and Vigilance; the room's steer, like the page's, now meets no polygon wall and leaves them 0.215 from it too (T81-4, s7.9; was: "the room's walk stops them 2.43 short on Crossroads (the gun's hull inside the body's 3.5: the port's walls) and the hold places them", T81-4's review F2). The room's half built the same day, cleared by the online seat (`room.ts`: `TurretState.gunYaw`, the start's facing, the hold on the end tick; *was* awaiting that clearance). *Was* (PB-2, 2026-10-09): the seat `origin + R(rest facing) x (refPt - root)` with the root's x and z turned by the actor's facing, `refPt` unmoved, the ease of `t / run`, the clip run to key 25 (17 ticks), the vertical handed to a mover none took | open: where the mount's push falls in the game's frame (`FUN_002c7d00` against the actor's tick: the whole mount a frame later or not); capture B 13 (a mount from behind, a side and 20 away) |
| `TURRET_STEER_WALLS_READING` (`viewer/src/net/emplacement.ts`) | the walls the mount clip's steer meets: no polygon wall -- its move laid on the place with no collision, the floor's height (the post-move cell push, D:L413920-413941, runs after the restore, the clip's ticks included: `TURRET_HOLD_PUSH_READING`, unread, not applied; was "none", T81-4's review F3) | read 2026-10-17 (T81-4, s7.9; reading, pending review): in the turret anim set (`+0x528` == `DAT_0044d410`) `FUN_005483d0` writes the move's unresolved displacement back over the resolved one (D:L413464-413466, D:L413908-413912) and integrates it unless the hold's `Stand` is on top (D:L413914-413918); the turret's own hull is a live collider otherwise (its instance node active and DI, 3 polygons; `FUN_002d2890` D:L174789-174792). Built on the page (`SeatSteer.step` with the walker's ground; its place laid again before the next step, kept from the walker's push-out: LATER 91's page half, s7.9) and in the room (`room.ts`, the steer's place laid again after the command's move). **Widened 2026-10-18 (LATER 109, s7.9; reading, pending review) to the release's reversed clip:** it runs in the turret set too, the clip on top and not the hold's `Stand`, so its move is integrated with no wall until the end's command returns the set (`FUN_00582540` D:L443143-443150); built as `ReleaseTravel` (page and room) | open: capture B 13 (a mount from behind, its last frames; a dismount, the body's path) |
| `TURRET_HELD_WEAPON_READING` (`viewer/src/net/emplacement.ts`) | where a mounted body's own rifle is drawn in the hold: on its carry (`character.rdr`'s "rifle" gear on `spinelo`), stowed at the mount clip's phase 0.5 | read 2026-10-16 (PB-2b's rework, s7.3 "The stow"; reading, pending review): the kit re-hangs nothing (the turret's class-0 slot, `FUN_005c50b0` -> `FUN_005c6980(kit, 0, "aimnodes")` on a node the body never makes), but `FUN_00588bc0` (D:L446318-446343) gives `Stand -> Turret` a phase callback at 0.5 -- `FUN_005a73c0` (D:L462281-462303) moves the rifle's node to `spinelo`, clears its slot and lays the "rifle" gear's local -- and the release's reversed clip `FUN_005a7520` hands it back; the pistol's clip at 0.4, `FUN_005a75d0` / `FUN_005a7730` (the pistol to `rthigh`, its holster). *Was* `'hand'` (PB-2b: the node's last local on `rhand`, the callback unread) and before it `'carry'` (PB-2, while the untracked node's write was unread) | open: capture B 13 (a mounted body from behind and the side) |
| `TURRET_MUZZLE_NODE_READING` (`viewer/src/net/emplacement.ts`) | the node a mounted round's flash is placed on: the firepoint, turned with the gun | the turret's own fire hands its effect the firepoint (`FUN_003a8d20` D:L300364); the mounted kit's fire (`FUN_005c5340`) uses the kit's weapon node, unread while mounted (s7) | open: capture B 13 (a mounted burst's flash) |
| `TURRET_DAMAGE_PLACEHOLDER` (`match/src/room.ts`) | the turret's damage: `'indestructible'` (PF.R31) | the authored health 30 is read (s1.1); the damage path is untraced | open: the damage path's read (`DESTROY_ANIM`, the health's consumer) or capture B 13 |
| `TURRET_FREE_GUN_PITCH_PLACEHOLDER` (`viewer/src/turretPage.ts`) | the pitch a free gun is drawn at on a page that joined after it was left turned: 0, level (RESUME-MOUNTED, 2026-10-17; the yaw is the room's, `gunYaw` on the wire) | the original's freed gun keeps its whole world matrix, pitch included (`FUN_003a7350` D:L299409-299411 copies the gun part's world matrix into `+0x2c0`; the round's reset `FUN_003aa9d0` restores the rounds and `+0x3c0` only, D:L301337-301338); the room keeps the yaw (`TurretState.gunYaw`) but no pitch | open: the room keeping the occupant's pitch at the release as it keeps `gunYaw`, and the wire carrying it |
| `TURRET_RELOAD_READING` (`viewer/src/net/emplacement.ts`) | the ammunition's magazines and reload: the mount pours the turret's rounds into the kit slot's ten magazines of `Ammo_Capacity` (`turretPour`); the magazine's last round and R arm the record's `ReloadDelay` (0.5 s PKM / LMG, 0.25 s MGL), no round leaving, then the walk to the next magazine; a dry pull reloads at once but on class 230; no refill; a release sums the magazines back, so a dry turret stays dry until the round's reset | re-valued 2026-10-17 (TURRET-AMMO, issue #284; s8 "The original's reload", reviewed AGREED WITH CORRECTIONS; built in the room, `room.ts` `TurretState.mags`, the occupant's `mags` on the wire): `FUN_005c5340` D:L479287-479294, D:L479318-479320; `FUN_00594cf0` D:L453460-453463; `FUN_005c32b0` D:L477661-477676; `FUN_005c2a90` D:L477462-477497; `FUN_005c0fd0` D:L476549-476567, D:L476590, D:L476616-476622; `FUN_005c3c10` D:L412003; `FUN_003aa9d0` D:L301330-301337; re-cited 2026-10-17 (the review's fold, F1, s8): the pause on the command clock `turretReloadCountdown` -- `FUN_005c0fd0` D:L476549-476563, a float32 countdown, decrement then `< 0.0`, the landing frame's fire step skipped: 30 commands at 0.5 s, 16 at 0.25 s, the first round N+31 / N+17 (was `Math.round(ReloadDelay x 60)`, the landing's command firing); unread and named here: the R5900 FPU's rounding (toward zero would stop 0.25 s on the 15th), the frame time's producer, and where R's arm (`FUN_00594cf0`, a controller vfunc) falls against the kit update (`FUN_005506a0` D:L417905-417907: one command earlier if before); *was* "one a round, nothing reloads until the round's reset" (`ammoInit` read, its consumer untraced, research 177 s4) | open: capture B 13 (fire until empty: the pause, the box, the sound; R mounted: the first round after) |
| `TURRET_RELEASE_RELOAD_READING` (`match/src/room.ts`, a comment) | a reload's timer still running at a release: dropped with the kit slot (the port's choice) | named 2026-10-17 (the review's fold, F2, s8): the room's comment had cited D:L412001-412006, which write no timer; `kit+0x820` is the kit's and no writer of it is in the release path (`FUN_00545ee0` D:L411941-412024, `FUN_005c3c10` D:L478128-478154, `FUN_005c4b10` D:L478842, `FUN_005b9bb0`, `FUN_005a6eb0`, `FUN_005448a0`, `FUN_003aa020`, `FUN_003a9ea0`), so the original's very likely lands on the rifle back in the hand (`FUN_005c2a90` walks `+0x824`, D:L477411) | open: capture (a dismount within 0.5 s of the 250th round or of R: whether the rifle takes a magazine and plays its `ReloadSound`) |
| `TURRET_LANDING_FLINCH_READING` (`match/src/room.ts`, a comment) | a landing inside a flinch window while mounted: lands (no flinch gate) | named 2026-10-17 (the review's fold, F3, s8): `FUN_005c2a90` refuses inside a flinch window (`FUN_005b4340(actor, 3)` D:L469494-469504, asked at D:L477404) and the timer is cleared anyway (D:L476560), losing that reload; whether a mounted body flinches is unread (no `+0xeb8` test in `FUN_005a2690` D:L459885-459959; the room's `flinchState` has no mounted case) | open: read (the hit path's reaction with `+0xeb8` set) or capture (an occupant hit within 0.5 s of the arm) |
| `TURRET_DISMOUNT_PLACE_PLACEHOLDER` (`viewer/src/net/emplacement.ts`) | where a dismounted body stands | re-valued 2026-10-07 as `TURRET_DISMOUNT_PLACE_READING` (s7) | was |
| `TURRET_DISMOUNT_PLACE_READING` (`viewer/src/net/emplacement.ts`) | where a dismounted body stands: where the hold left it (the hold's place since PAR-44; the seat for a release asked while the steer runs) | the release `FUN_00545ee0` (D:L411941-412028) sets nothing of the actor's place; the room's hold places the mover each tick past the mount's steer (s7.5), so a release leaves it at the hold's place. The walk's next tick pushes a body inside its 3.5 of a wall out of it (`Walker.pushOut`, the port's own walls' reading): on Crossroads' turret 1 the place lies 1.07-1.75 from a wall, so the released body moves back to 3.5 off it (s7.5, "Built"). **Re-worded 2026-10-18 (LATER 109, s7.9; the value kept): where the release STARTS the body** -- a dismount's reversed clip then carries it 3.165 back along the gun's line through no wall (`TURRET_RELEASE_TRAVEL_READING`), and the walk's push-out no longer moves it on the release's command (was 2.431 there on all six turrets of Crossroads and Vigilance); the room's other releases (a death, a leave, the knock, the round's start) carry it nowhere | open: capture B 13 (a dismount) |
| `TURRET_HOLD_OFFSET_READING` (`viewer/src/net/emplacement.ts`) | the hold's offset of the body from the turret's place: (-3.257, 0, 4.282), float32 `c05072b0` / `40890625`, in the body's frame (x right, z behind), turned by the aim's yaw | `FUN_00585cd0` writes the actor's next position `+0xf54` each frame as the turret's place plus this offset turned by the gun's flattened facing (D:L444603-444605, D:L444622-444625); the place `turret+0x1c` is the yaw part's parent's world origin (`FUN_003a8f50` D:L300412-300413), equal to the placement's `origin` on Crossroads' two and Vigilance's four (`scene/test/turrets.test.ts`, PAR-44); built PAR-44 (`holdPlace`, `holdStep`; s7.5) | open: capture B 13 (the mounted body at both yaw stops) |
| `TURRET_HOLD_PUSH_READING` (`viewer/src/net/emplacement.ts`) | the push the mover runs on the hold's place, and on the mount clip's steer (it runs after the turret set's restore in every anim set, T81-4's review F3): null, not applied | `FUN_005483d0` D:L413920-413941: under `DAT_0066b000` or the controller's `+0x171` / `+0x172` flags, `FUN_00516f10` (a table at 0x66a1b0 by the actor's byte, then `FUN_005169b0`) answers a vector held to `DAT_0064fd20` long, added to the place; the flags, the table and the length are unread. Not the walls' polygon resolution (that one, its push-out included, D:L413459-413615, acts on the move's velocity, which the hold skips, D:L413914-413919) -- but read in outline (PAR-44's review, 2026-10-11), `FUN_005169b0` (D:L385139-385259) takes the actor's cell in a grid, looks at two neighbouring cells and, where one's type is 0, 8, 9 or 10 (mask `0x701`) and the actor lies within `DAT_0064fd18` of that cell's edge, adds a push away from it: a push off blocked cells, which may be what keeps the original's body off the wall near `mp72_turret01`; null kept while what the grid at 0x66a1b0 marks is unread | open: `FUN_005169b0` and the 0x66a1b0 table read, or capture B 13 (a mounted body beside a wall) |
| `TURRET_APPROACH_READING` (`viewer/src/net/emplacement.ts`) | the mount's second orientation test | `FUN_003a90c0` (D:L300505-300512) refuses when the horizontal offset's direction against the actor's facing exceeds `-cos(DAT_003e0830)`: the constant is unread and the offset's sign is `FUN_00309200`'s operand order, untraced. Null, not applied: a body facing the gun's way in front of it passes | open: the constant's bytes off the ELF, or capture B 13 (a mount from in front and from behind) |
| `TURRET_YAW_SENSE_READING` (`viewer/src/net/emplacement.ts`) | the `LIMITS YAW` pair's sense | measured from the gun's facing in the body's yaw (left positive); only Crossroads turret 1's pair (-10..110) is asymmetric on the three maps, and no consumer of its sign is traced | open: capture B 13 (both yaw stops) |
| `TURRET_AMMO_HUD_READING` (`viewer/src/turretPage.ts`) | the HUD's weapon box while mounted: the kit's, holding the turret's weapon -- the room's magazines once told (`mags`, `turretMagsBox`: the one in the weapon over `Ammo_Capacity`, `MAG` the entries over 0 less one, hidden below 1), before that and from an older room the rounds poured as the mount pours them (`turretBox`); its HUDW icon, its own fire mode | re-valued 2026-10-17 (TURRET-AMMO's page half, s8; reading, pending review): the box reads the slot's magazines (`FUN_005c3890`, `FUN_005c49b0` D:L478758-478772, D:L85191-85203), so the reload's pause reads 0/250 and 1 MAG; *was* (PAR-55, 2026-10-12) "magazines of Ammo_Capacity, as the mount pours them" -- "the kit's reload at a magazine's end is not modelled (the room counts the rounds as one, `TURRET_RELOAD_READING`), and a welcome's mount pours the count as it stands"; before it "the rounds left, the capacity `ammoInit`, no spare magazines" | open: a mounted HUD frame (capture B 13: at the mount, through the pause, after a re-mount) |
| `TURRET_ROUND_LINE_READING` (`match/src/room.ts`) | a turret round's line: from the room's firepoint at the clamped aim along the page's claimed line, inside the occupant's cone -- the kit's, on the turret record at 'stand' -- about the gun's own line; MGL FRAG TURRET's launched round too (PAR-59, s8) | built 2026-10-18 (TURRET-CONE, the room half and P2's wiring, s8.2; reading, pending review; named `TURRET_ROUND_LINE_PLACEHOLDER`, 'the gun line, no cone', until then): mounted, `FUN_005be9a0` takes the origin from the turret's vfunc `+0x60` (D:L475525) and overwrites the converged direction with its `+0x68`, the gun part's world -z (D:L475600), then the controller's `+0x74` -- `FUN_00592260`, the cone (D:L475601-475602; D:L451531-451577) -- rolls it; the page rolls (`TurretPage.round` on `MatchFirearm.turretCone`), the room bounds (`ShotCone.checkLine` about its own `gunLine(clampAim(frame))`, its cone the turret record's at `TURRET_RETICLE_STANCE_READING`'s row, bloomed per accepted round; no eye, no bind) and fires along the claim, a refusal through `turretDropped`; the port normalises the line (s8.2's known deviation). *Was:* the line read 2026-10-17 (TURRET-RETICLE, s8.2; reading, pending review) and the port's: mounted, the kit's fire takes its origin from the turret's vfunc `+0x60` (`turret+0x380`, the firepoint node's world place, `FUN_003a8f50` D:L300418-300428) and overwrites the direction it converged on the aim point with the turret's vfunc `+0x68` (`turret+0x38c`, the gun part's world -z, `FUN_003a7350` D:L299398-299406) -- `FUN_005be9a0` D:L475525, D:L475600; the vtable 0x408250's words 0x3a71a0 / 0x3a71d0 (the ELF's bytes) -- so no convergence; the gun's rest -z level within 0.0092 degrees on nine turrets (MP72, MP51, MP10), the port's `gunLine(facing, 0)`. The cone read, not built: the controller's `+0x74` after it (D:L475601-475602) is `FUN_00592260` in the player's, the remote's and the AI's vtables (0x6694b0, 0x669590, 0x6699f0), over the kit's accuracy on the turret slot's record (`TURRET_RETICLE_STANCE_READING`) -- the row TURRET-CONE, next (`room.ts`); the name kept until it is built. *Was:* "the turret record's reticle while mounted, and whether the kit's cone runs over it, are unread; the mounted kit's fire takes its origin from the turret's vfunc `+0x60` and its direction from the turret's `+0x68` and the controller's `+0x74` (`FUN_005be9a0` D:L475520-475526, D:L475594-475603), none of them read" | open: capture B 13 (a burst's spread at range; an MGL round's line) |
| `TURRET_JITTER_BLOOM_ADAPTATION` (`match/src/room.ts`) | a network adaptation (no counterpart in the original): a mounted round the room refuses 'rate' on its event clock alone -- its command at the cadence, its arrival bunched -- blooms the occupant's cone (`ShotCone.round`) when its claim lies inside the cone, and stands as the cadence's last round; nothing spent or fired | added 2026-10-18 (TURRET-CONE's review F1, s8.2; pending re-review): the console blooms every round its own gate fires (`FUN_005c0ae0` via `FUN_005c0fd0` D:L476569, D:L476638), on one clock; the page's gate is that console's, so a round the room drops on arrival jitter has bloomed the page's kit, and two such drops in one LMG burst left the rest refused 'cone' until the trigger's release (the review's probe). At most one bloom per cycle of the occupant's commands, never for a claim outside the cone: sprayed claims early on the event clock open the room's cone no wider than an honest burst's after the same round (`roomTurrets.test.ts`) | the page's own: no capture settles it |
| `TURRET_RETICLE_STANCE_READING` (`viewer/src/net/emplacement.ts`) | the stance row of the turret record's `Reticule_Modifiers` the kit's bloom runs while mounted, and each mounted round's (TURRET-CONE P1): 'stand' (PKM TURRET 15-35, Dilate 8; LMG TURRET 6-30, Dilate 4; MGL FRAG TURRET 2-6, Dilate 0; `ReticuleKnock` 0 on all three, where their crouch and prone rows knock 7-9 on the PKM and the MGL; `zweapon.rdr` through `readKitTable`) | added 2026-10-17 (TURRET-RETICLE, s8.2; reading, pending review): the kit's tick takes its row by `FUN_0058a720(body, 1)` (`FUN_005c2670` D:L477256-477377, research 84 s3), and the round's step by the same call (`FUN_005c3360` D:L477722; 2026-10-18, TURRET-CONE P1, s8.2: the bloom and the knock per mounted round at this row); what that answers for a body in the turret anim set (its `Stand` held by `FUN_00585cd0`) is unread; the set's motion is a `Stand` and no crouch or prone reaches the hold | open: that read, or capture B 13 (a mounted HUD frame at rest and after a burst) |
| `TURRET_CAMERA_PITCH_READING` (*note only*) | the mounted third-person camera's pitch: the port keeps the look (the gun's aim at rest) | partly read 2026-10-17 (TURRET-RETICLE, s8.2; reading, pending review): the mount keeps the camera on the body (`FUN_002956e0` D:L139716-139746, called D:L412191) with a one-second blend (D:L140729-140790) and the view state 0 in third person (D:L412247-412255); the stick's pitch step is skipped while mounted (`FUN_00594600` D:L452890-452906) and no writer of the look `+0x1070` from the gun was found -- taken literally, the reticle would part from the rounds by 100-365 px at the pitch stops, implausible, so not built on | *note only* -- open: capture B 13 (the pitch stops filmed from behind, the reticle against the tracer) |
| `TURRET_LAUNCH_INHERIT_READING` (`match/src/room.ts`) | what a mounted MGL FRAG TURRET's round inherits at its launch: none | the kit's fire hands the launch the actor's `+0x38` (`FUN_005be9a0` D:L475604 -> `FUN_005c5340` -> `FUN_003d2d70` -> `FUN_003cb1a0`), added to MV x dir (D:L320731); the hold writes the body's place each frame and skips its move (D:L413914-413919), and what `+0x38` holds then is unread (PAR-59, s8) | open: that read, or capture B 13 (an MGL round's arc) |
| `FIRST_REQUEST_WINS_READING` (`match/src/room.ts`, named in `viewer/src/net/protocol.ts`) | two mounts taken at one step's top go to the lower seat id (LATER 124, 2026-10-19, s7.9: a mount is taken only once its own command has run, so the step that takes them; *was* "two mounts on one tick", the step after they came) | ruling PF.R28 (XR-05's bomb pickup is the same rule and owns the constant in its own note, research 214); MAP-10b applies it in `resolveMounts` and names it in comments only, so the two do not collide | open: capture B 13 (console B mounts while A is on it) |
| `TURRET_CATCHUP_STEPS_ADAPTATION` (`viewer/src/turretPage.ts`) | the most steer steps this page's own mount takes on one command while its count trails the room's: 2 | *a browser adaptation, no reading*: no network lies between the original's console and its actor (s7.1); chosen by measurement, s7.9 (LATER 96's fold: K = 1 / 2 / 3 / all) | built 2026-10-18 (LATER 96, s7.9; pending review) |
| `TURRET_CATCHUP_DRAW_DECAY_ADAPTATION` (`viewer/src/turretPage.ts`; `Walker.drawOffset`, `viewer/src/mover.ts`) | the units a tick by which the drawn-only offset left by the catch-up's restart at `after` shrinks: 1 | *a browser adaptation, no reading*: the original has no catch-up to hide; drawn only (the simulation, the reconcile and the pose untouched); chosen by measurement, s7.9 (0.5 / 1 / 2) | built 2026-10-18 (LATER 96, s7.9; pending review) |
| `TURRET_OWN_RELOAD_TELL_ADAPTATION` (`viewer/src/turretPage.ts`) | 60 commands: this page's own R counted as the turret's timer from its press until the room's tell of its arm | *a network adaptation, no reading*: the original arms `+0x820` locally at the press (`FUN_00594cf0` D:L453460-453463) and the release behind the prompt's common gate is refused at once; the page learns the room's arm a round trip later. 60 = one second, a bound well above a normal round trip so an R the room refused lets it go; a slower link brings the flicker back (s8.6) | built 2026-10-26 (LATER 219's review F2; pending review) |
| `TURRET_RELEASE_SEQ_ADAPTATION` (`viewer/src/net/emplacement.ts`; applied in `match/src/room.ts` `takeDismount`, predicted in `viewer/src/turretPage.ts`) | a dismount judged on the page's numbering: refused 'mounting' iff its `seq` is below the mount's `after` + max(`SeatSteer.ends`, `TURRET_RELEASE_WAIT_TICKS`) (the 16 steer steps and the hold's command, or the release's wait of 75: LATER 151), taken on the first command above its `seq` the room runs, held while the room's own steer still runs (ruling (b)), the occupant told a refusal (`refused: 'mounting'`) | *a network adaptation, no reading*: the original's console runs the press and the clip on one actor with no network between (`FUN_00545ee0`'s first test, D:L411954-411966, kept where the room cannot see the page's clip through the lag) | built 2026-10-18 (LATER 104, s7.9; pending review) |
| `ASK_AT_COMMAND_ADAPTATION` (`match/src/room.ts`: the text events `door`, `action`, `bombAction`, `pickup`; `timed`, `due`, `decide`; the `mount`: `turretRequest`, `resolveMounts`, LATER 124) | a network adaptation (no counterpart in the original, which acts on an input at its own frame with no wire between): the immediate asks are decided at their own command, not on arrival by the `seq` the page names -- shape-checked, queued with the rounds (`PENDING_MAX`), decided once their own command has run (`due` `>=`, as a throw: they read the body, not the look), the mounted body, the release's span (LATER 109) and the stale bound (`FIRE_ARRIVAL_JITTER_TICKS`) judged then | LATER 116 (2026-10-18; d1's and the merge controller's word): a modified page named a `seq` past the span, or none, and passed mid-clip | a modified-client hardening; honest pages unchanged (a lagging one sees its ask at its command's frame; an ask behind a waiting round decided one command late; a dropped backlog's asks decided at the drop, each at its own command (LATER 123, 2026-10-19: the body the room's last real one; an ask arriving after the drop, a pickup's tick-time judge (LATER 135, resolved 2026-10-19: a claim judged on its frame as of its decision, a drop's on the body it leaves; one claim a command a seat), one drop's asks on one room tick (a door opened then closed left open), an ask decided ahead of a round waiting before it, the intake's flood cut (`QUEUE_MAX`; LATER 136, resolved 2026-10-19: dropped as a backlog at the next step's top), and a dismount pending across the drop left named in the adaptation's doc); LATER 124, 2026-10-19, s7.9: the mount judged at its own command too -- taken only at the first step's top after that command has run, its stale bound judged at arrival (`MountAsk.staleAt`), refused 'ahead' past `PENDING_TICKS` and dropped after waiting it; named: the take lags its command by up to a step (`steer.after` follows), a catch-up step's asks and a dropped backlog's asks judged unmounted, a round ordered by step, a mount after a drop judged on the room's last real body; *was* "a press just before a mount refused 'mounted' with the room behind"); the residual: a forged `seq` up to 3 before the span, decided in the clip's first commands, passes, as a round's |
| `TURRET_RELEASE_TRAVEL_READING` (`viewer/src/net/emplacement.ts` `ReleaseTravel`; applied in `match/src/room.ts` `run` / `takeDismount`, on the own page in `viewer/src/turretPage.ts` `releaseTick`) | a dismount's body carried by the mount clip played reversed: each tick minus the clip root's velocity at the reversed phase, turned by the body's yaw, x dt, laid with no collision on the floor there -- on the disc's `seal_stand2turret` / `seal_p_stand2turret` 16 steps at 60 Hz, the last at key 0.964, (-0.062, 3.165) in the body's frame (3.165 back along the gun's line; at most 0.480 a tick, the 9th); at the game's frame 8 steps, (-0.045, 3.163); the 17th the set's return, walls back | read 2026-10-18 (LATER 109, s7.9; reading, pending review): `FUN_00545ee0` D:L411941-412028 writes no place; `FUN_005a6eb0` D:L462136-462170 -> `FUN_0028c160` D:L134080-134097 (phase e, direction -1); no record (`FUN_0028dc90` -> `FUN_0028cc10` D:L134518), so no steer and no zeroing (D:L439092-439106); the actor's vtable 0x6691a0 (the ELF's words: `FUN_00550ef0` +0x18, `FUN_005506a0` +0x20, `FUN_0054d9a0` +0x28); `FUN_00550ef0` D:L418170, D:L418193, D:L418454; `FUN_0057a330` D:L438901, D:L438909-438910, D:L438985; `FUN_0028c250` D:L134145-134181, `FUN_00289bb0` D:L132691-132754; `FUN_0054d9a0` D:L416479-416490, D:L416515-416520, D:L416562; `FUN_005483d0` D:L413908-413918, D:L413943-413946; the end `FUN_0028c6e0` D:L134283-134308, `FUN_00582540` D:L443143-443150. Zeroed only under the knock's flag (`+0x1060` bit 4, D:L438987-438994; set by `FUN_0057e770` D:L441032, D:L441071) -- not on a dismount | open: capture B 13 (a dismount filmed: the body's path back, about 3.17 over about 0.27 s); named, not settled: the release's push in the game's frame (the first step on the press's frame or the next), a turn during the clip (the travel follows the body's yaw each step either way), the root track's zero-velocity bit (`FUN_00289bb0` D:L132704-132708, for the in-memory track) |
| `TURRET_RELEASE_ACTIONS_PLACEHOLDER` (`viewer/src/net/emplacement.ts`; applied in `match/src/room.ts` -- the command's presses, `climbLock`, `releaseRefused` -- and on the own page by its walk lock) | what a dismount's other presses and asks do through its reversed clip (the 16 steps and the end's command): strict, refused -- the jump, the stance, the leans and the swap taken off the commands, no climb or ladder offered, a door, a switch's action, a throw, a bomb action, a hostage order and a pickup dropped 'releasing'; a remount allowed in the room LATER 116 (ASK_AT_COMMAND_ADAPTATION): the door, the switch's action, the bomb drop and the pickup are now decided at their own command (`timed`, `due` >=), the mounted body and this span judged there; the residual named -- a forged `seq` up to `FIRE_ARRIVAL_JITTER_TICKS` (3) before the span's start, decided in the clip's first commands, passes, as a round's. | the review's F2 and F4 (2026-10-18, LATER 109; the controller's call): read -- the jump refused under the turret set (`FUN_005b4340(actor, 0xb)` D:L469466-469475, asked D:L453211-453213, D:L440806-440807; a looped clip wanted on top, D:L440810), the lean refused (`FUN_005b4340(actor, 1)` -> `FUN_00587c20` D:L469345-469346, D:L469391-469392; a reversed play interrupted only below phase 1 - NoInterrupt, D:L445549-445564, NoInterrupt 1 on the mount clips), a climb or ladder (action 2) refused (D:L469466-469475); the stance KEPT PENDING in the original, not refused (`FUN_00552ec0` D:L418927-418930 takes it under a looped clip; `+0x374` asked each tick, `FUN_00552d60` D:L418875) -- the port strips it, the deferral owed; the swap, the doors and the pickups unsettled by the read; the remount allowed (`FUN_005a6fc0` D:L462181-462190) and allowed by the room, but the page offers none during the travel (its walk lock, `actionWiring.ts`) -- owed (F4); the rifle's fire refused too, strict by the controller's call (the mount clips' `NoFire`, `motion.rdr`, its test on a reversed play unread): the room drops a claim 'releasing', the page holds its trigger (`TurretPage.travelling`); left as they were (the re-review's F-C): the rifle's reload gated on neither side (unread), the bomb plant's hold (the room counts Action held from the command, which an honest locked page never sends), the aim and the binoculars kept by both; the refusals judged by the command an ask names against the clip's span in the page's numbering, dseq + 1 .. + 16, a round at its decision (F-A); a dropped or cut stretch's commands inside the span, through dseq + 17, laid with the same strip (LATER 140, `dropStretch`); named, not settled (LATER 140's review F3): after a stretch dropped mid-clip the room's travel, stepped only on the commands `run` runs, runs on past the span (a cut of dseq + 3 .. + 22: `run` strips dseq + 23 .. + 37, which the page ran free from dseq + 18 -- a jump there refused in the room until the reconcile), and a dismount pending across a stretch takes the mounted branch, its release and travel starting that many commands late; immediate asks (a door, a switch's action, a pickup, a placed charge, a bomb action) are judged on arrival by the seq the client names, so a modified page naming a seq past the span -- or none, on a door, an action or a bomb action -- passes mid-clip; honest pages, and the fire (judged at its command), are exact; queuing them to their command is LATER 116, the online lane's | open: capture B 13 (a dismount with each press during the clip: a crouch mid-clip, a swap, a door in reach, a remount) |
| `TURRET_RELEASE_STICK_PLACEHOLDER` (`viewer/src/net/emplacement.ts`; applied in `match/src/room.ts` `run`, on the own page by its walk lock, `viewer/src/turretPage.ts`) | the commands through which a dismount's stick moves nothing: the reversed clip's 16 and the end's command (the 17th at 60 Hz); the stick walks from the 18th | the controller's call 2026-10-18 (LATER 109): a placeholder, not a reading -- read: no walk motion can be pushed in the turret set (its four types and its `GLOBAL` include hold none, `animset.rdr`; `FUN_00588bc0` D:L446077-446081 refuses a type the set's table lacks, `FUN_005e3d90` D:L495844-495884) and the player's controller writes no `+0x198` / `+0x1a4` (added D:L416463-416467, D:L416516-416519; written only by `FUN_00598280` D:L454816-454819's zeroing and an AI controller's `FUN_0056fd00` D:L433164-433167, the vtable 0x6693f0's) -- so the stick moves nothing through the clip; unknown: its first walking tick, the 17th (the set returns before the advance) or the 18th (the locomotion's pick, D:L418132 / D:L418155, runs before the end test, D:L418193). On the page the walk's lock holds it (`WalkMode.setLocked`, the mounted hold's: the presses with it) | open: capture B 13 (a dismount with the stick held: the frame the body first walks) |
| `TURRET_MOUNT_ASK_WINDOW_READING` (`viewer/src/turretPage.ts` `action`) | 2: the seconds within which this page sends no second `mount` after one it sent -- one window for every turret, opened by each mount sent, cleared at a welcome; a press inside it sends nothing and stays the turret's (true), the prompt unchanged | read 2026-10-19 (LATER 137, s7.10; reading, pending review): the online press asks the library for the turret (`FUN_00546210` D:L412075-412084 -> `FUN_002c79f0` D:L167867-167869, through `FUN_0030d010`) only when the manager's clock (`FUN_0030d550`'s `+0x100`) has reached the last ask's + 2000 (`DAT_004415d8`, one global); the clock in milliseconds (`+0x100` <- `FUN_0030da00` D:L210282 <- `FUN_00622ea8` <- `FUN_00615068` D:L523142-523152, the library's `DAT_00676698`, advanced by the console's millisecond clock `FUN_0061bee8` D:L527618-527620 -> `FUN_0063d2d8` D:L552681-552697, over the EE count `FUN_0063db68` D:L553018-553045); cleared when a turret object is made (`FUN_002c7e60` D:L168044-168051). The page's match takes the branch offline too (SOLO_IS_NETWORK_READING). Not modelled, named: the library resync (the clock set from the host's, D:L525928) and whether a round's start clears the window (unread) | open: capture B 13 (a remount within 2 s of a mount press; a press at a refused mount and again within 2 s) |
| `RAISE_ENVELOPE_STEP_READING` (`viewer/src/weaponRaise.ts`) | LATER 185 (2026-10-21): the raise steps once a game frame, as the original's -- the controller's tick and the raise tick at each game frame a `GameFrameAccumulator` (PF.R8) counts in the page's clamped step -- and the envelope in float32 toward zero, so its first round from a cleared envelope leaves `RAISE_REFUSAL_FRAMES` (2) game frames after the press's, on the page frame that game frame ends on (6 page frames after the press at 60 Hz from a fresh count); the port's own: the count's phase (the raise's, from its construction or reset), a page frame's trigger (down on any), release and real seconds given to the next game frame to end, the dt `GAME_FRAME_DT` in single precision. *Was:* "steps by the page's frame in doubles ... 5 page frames after the press at 60 Hz" (s8.4) | s8.4: the frame's order read (research 230 s5.2.3; the ELF's words at 0x55241c-0x552420 pass the frame's dt into `FUN_005dfc80`), the count computed under `EE_FPU_ROUNDING_READING` (3 to nearest) | open: a capture of a fresh spawn's first pull (the press's frame and the round's) |
| `RAISE_LATCH_FRAME_READING` (`viewer/src/actionWiring.ts`) | the PKM / LMG TURRET's latch frame on the page: one game frame of real seconds (`GameFrameAccumulator`) from the latch's frame | s8.4: the original refuses one game frame (D:L476423-476429); the page's frames are not the game's; named, not built (LATER 180's review, F4): the original's pending bit is the kit's byte (`kit+1` bit 2, D:L476427), left by the take-up `FUN_005c4b10` (D:L478810, D:L478841), so a bit set on foot carries across a mount and the PKM's first pull then fires on its press -- the port's bit is `TurretTrigger`'s own | open: a capture of a mounted PKM pull from a lowered body |
| `MOUNT_RAISE_READING` (`viewer/src/weaponRaise.ts`) | the mount changes the raise's times only (zero for the turret's slot), never its state or its envelope | s8.4: the take-up's times read (D:L412218 -> `FUN_005c4b10` D:L478849-478857); a lower at the mount or the release, and `FUN_005c8a20`'s callers (D:L474129, D:L475980, D:L476031), unread | open: those callers read, or a capture of a mount from a raised rifle |
| `MOUNT_DURING_PLACEMENT_READING` (`match/src/room.ts`) | a mount during a charge's placement taken (`"taken: the grant's checks ask no placement (D:L412130-412166, D:L469307-469560)"`) | s8.7 (LATER 205): open 1, 3 and 4 -- the turret's offer vfunc `+0x5c`, the kit's pending bit under the slot switch, the popped C4 clip's callback |
| `DETONATOR_ACROSS_MOUNT_READING` (`match/src/room.ts`) | the Detonator judged at its command (`"judged at its command, instant: no clip or timer for a mount to cut"`) | s8.7 (LATER 205): its closing switch to the claymore's slot (`FUN_005c8a20` D:L476032) unread |
| `MOUNT_ONLINE_C4_WINDOW_READING` (`match/src/room.ts`) | no C4 from a mounted body (`"none: no equipment from a mounted body"`) | s8.7 (LATER 205): open 5 -- the action-flag walk of `FUN_005a7de0(actor, 1, 1)` under "Stand -> Turret" in the online 1250 after a mount |
| `LAUNCHER_STAND_PRESS_POP_READING` (`viewer/src/mover.ts`, `Walker`) | a stand press under the launcher's set cuts no clip (`"not ported: a stand press under the launcher's set cuts no clip"`) | s8.5 (LATER 504's re-look F3): the press pops every clip above the base (`FUN_00581dc0` D:L442650) and a low ceiling resets the request (`FUN_00552ec0` D:L419011); the pop's port, or a capture of a stand press mid-raise, settles it |
| `LAUNCHER_PRONE_PRESS_READING` (`viewer/src/mover.ts`, `Walker`) | a prone press under the launcher's set as off the set (`"as off the set: a prone press under the launcher's set not read"`) | s8.5 (LATER 504): the crouch state's prone branch under `DAT_0044d408` (`FUN_00584c60`) unread; a capture of a prone press with the launcher up settles it |
| `LAUNCHER_PULL_WAIT_READING` (`viewer/src/matchThrow.ts`) | a held LAW / RPG-7 pull waits out the raise's refusal alone and launches on the first frame the raise reads 1; a pull the launcher's own wait refuses (its take-up clip, `launcherRaiseSeconds`; the round's FireWait) is dropped, as before | s8.5: the raise's refusal read for class 0x91 (`FUN_005c0ae0` D:L476423-476438, `FUN_003d1e20` D:L324476-324483); the held trigger at those waits' end for class 0x91 (the kit's `+0x81c`, D:L476446-476448; the take-up clip's gate) unread | open: those read, or a capture of a LAW pressed and held through its take-up |
| `TURRET_RELEASE_WAIT_READING` (`viewer/src/net/emplacement.ts`, with `TURRET_RELEASE_WAIT_TICKS`; the room's window in `match/src/room.ts` `resolveMounts` -> `seatOff`, the page's offer in `viewer/src/turretPage.ts` `releaseOffered`) | 1.25: the seconds from a mount before its release is offered -- 75 commands (at `TICK_HZ` 60) above the mount's `after`; before then no `turret_dismount` prompt, a press sends nothing (true: the turret keeps it), and the room refuses a dismount naming an earlier command 'mounting' -- with the clips or without; every match in the port (SOLO_IS_NETWORK_READING) | read 2026-10-19 (LATER 151, s7.11; reading, pending review): online the mount `FUN_005463c0` sets the actor's `+0x22c` to the manager's millisecond clock (`FUN_0030d550`, s7.10) + 1250 (D:L412209-412213); the offer's test `FUN_005a8850` (D:L462975-462993) answers the held turret alone offline and, online, only once the clock has reached `+0x22c`; its one caller `FUN_005937c0` offers action 20 on it and returns (D:L452334-452338). Not modelled, named: what `FUN_005937c0` offers a seated actor while the wait runs (D:L452339-452475, unread; the port's mounted press stays the turret's), the library resync (s7.10) | open: capture B 13 (a dismount pressed at about 0.5 s and at about 1.3 s after a mount: when the prompt shows, which press releases) |
| `MOUNT_SAME_COMMAND_RELOAD_READING` (`match/src/room.ts` `mountKitLocked`, a comment) | a mount asked on the command a lock was armed on -- a reload's start or an after-shot's round -- refused (`lockStart <= count`, either kind) when the lock's event arrived before the ask; one that arrived after it on that command neither covers nor holds it (LATER 249, s8.6 "The arrival tie"); R pressed in the ask's own frame starts on a later command and the mount is taken. *Was:* taken for a reload's lock (`lockStart < count`), fitted to a test that named the reload on the ask's command by hand -- really R a frame before the ask (LATER 223) | read 2026-10-21 (LATER 175's review, then LATER 223, s8.6; reading, pending review): in one frame the Action button's release runs the take (`FUN_00594cf0` D:L453193-453243 -> slot +0x78 `FUN_00592d50`, the mount D:L452089-452104, no lock re-read) before R arms the kit's timer (D:L453460-453463); the frame (`FUN_001ebed0`) runs the controller's pre-tick (priority 1.0, D:L50922; the frame running them at D:L50801) before the kit's post-tick (D:L50929) and builds the prompt's mask after both (D:L50856 -> D:L56695 -> D:L73390): a press in frame f reads the mask built at the end of f - 1, so a lock armed on the ask's command is armed before its mask | open: a capture of an R, or a bolt's round, a frame before the Action button's release and in the same frame. Built with it (LATER 223's paced half): the ask waits for the reloads and rounds named on or before its command; the cost, a mount whose own command K carries a reload or a round is judged once K + 1 has run, so its `after` is K + 1 (LATER 96's steer and LATER 236/237's re-derive follow `after`), and a same-step tie with another asker may shift (PF.R28's lower id is per step) |
| `MOUNT_TRAVERSAL_POP_READING` (`viewer/src/net/blast.ts` `mountPop`; applied in `match/src/room.ts` `takeMount`) | a traversal under way at the mount's take (a climb, a ladder, a hang): settled by the knock's stand-in (`Traversal.popSettle`, CLIMB_KNOCK_SETTLE_READING), then the move put on the floor where it is | read 2026-10-22 (A1, the push read, s8.6; reading, pending review): the take's pop (`FUN_0058c350` -> `FUN_0058a5e0(actor, 0, 1)` D:L446796-446798) runs each popped entry's end handler, a traversal's placing the body (`FUN_00589aa0` -> `FUN_003157d0`, D:L446538-446640: DAT_003deca0, 0x2e, 0x2c, 0x2a, DAT_003dec90, 0x23, DAT_003dec80, DAT_003def40), those placements unread one by one (the `+0x174` reset among them) | open: those end handlers read, or a capture (a mount taken while a climb or a ladder runs) |
| `MOUNT_CARRIED_AFTERSHOT_PLACEHOLDER` (`match/src/room.ts` `mountKit`, `mountKitLate`; the page's carry, `viewer/src/matchActions.ts` `carriedEnd`, A1 branch B) | a bolt's or a pump's after-shot timer running at the take: carried onto the turret's slot, the turret's trigger unread to its end, landing nothing | named 2026-10-22 (A1, LATER 218, s8.6): the take-up zeroes `+0x810`, never the kit's one timer `+0x820` (`FUN_005c4b10` D:L478836, D:L478926), so it runs on the turret's slot (`FUN_005c0fd0` D:L476549-476563); at its end the after-shot's flag runs `FUN_005c3000` (D:L476554-476558) on the slot in the hand, unread on a turret slot | open: `FUN_005c3000` read on a class-0 turret slot, or a capture (a bolt's round, then a mount inside its after-shot) |
| `MOUNT_HELD_THROW_FUSE_PLACEHOLDER` (`viewer/src/grenade.ts`; applied in `GrenadeThrower.mountTake`) | a throwable held at the turret's take -- a wind-up, or a throw asked whose hand has not opened: nothing thrown, the item kept, the power 0, and no fuse running in the hand | named 2026-10-22 (A1 branch B, s8.6): the take pops the body's stack (`FUN_0058c350` D:L447983-447988) and its take-up zeroes the controller's power (`FUN_00592d40` D:L478915), so nothing leaves the hand; what the kit does then with the throwable in it -- its pending bit and timer (`+1` 0x02, `+0x87c`) -- is unread across the take-up (`FUN_005c4b10` D:L478777-478935) | open: that read, or a capture (a mount taken with a grenade held, and with a throw asked) |
| `MOUNT_GRANT_CHECKS_ADAPTATION` (`viewer/src/net/emplacement.ts`; applied in `match/src/room.ts` `resolveMounts`) | a network adaptation: the room's checks at the grant, at the ask's command K -- alive, not stale, holding none, the turret free (PF.R28), no traversal move, the kit's lock (LATER 175, 223, 249), the reach and facing (`canMount`); for a worded ask, the asker's own ask's refusals too (the review's fold, 2026-10-22): a knock-down fall ('fall', `FUN_00546210` D:L412059-412062, no locality gate) and a `Stand -> Turret` clip playing, forward or reversed ('mounting', D:L412066-412069: the dismount's reversed clip) | added 2026-10-22 (A1, the merge controller's word 2026-10-21; reading, pending review): the original's host checks only that it is the master and the turret unowned (`FUN_0061e6d0` D:L529427-529428); the asker's console offered the mount past its own gate (`FUN_00593500`) and its ask's refusals before it asked (`FUN_00546210` D:L412075-412084); the room is both, so it keeps the gate and the ask's refusals at K; the ask's third, the restraint or stab victim `+0xeac` (D:L412071-412073), is the campaign's alone (research 189, 194) and is not checked; an older page's (unworded) ask keeps its path from before A1, without the two refusals | none: an adaptation; open (P37's review F2, 5d, 2026-11-02): the room's no-traversal-move check (`room.ts` `resolveMounts` ~:6112, `p.sim.moves?.busy()` -> 'mount: busy') refuses a mount during a climb and a dive too, but whether the original's offer gate refuses those is unread -- `FUN_00593500` D:L452277 -> `FUN_005a7de0` D:L462612 posts no offer outside `actor+0x174` 0, 1, 2, 3, 6, and their `+0x174` state is `NOFIRE_STATE_READING`'s owed read (`viewer/src/traversal.ts`); the ladder (5) and the hang (4) are refused by it, reading (P37's F1) |
| `MOUNT_WORD_BOUND_ADAPTATION` (`viewer/src/net/emplacement.ts`, with `MOUNT_WORD_BOUND_TICKS`; applied in `match/src/room.ts` `resolveMounts` -> `takeMount`) | a network adaptation: 2 s, the ask's window (`TURRET_MOUNT_ASK_WINDOW_READING`, pinned equal): a worded reservation whose page names no take inside it is taken by the room on its own count, at a step's top (`steer.after` the last command run) | added 2026-10-22 (A1; reading, pending review): the original has no reservation -- the host's grant is every console's take (`FUN_0061e6d0` D:L529429-529433 -> `FUN_0061e7f0` D:L529455-529466 -> `FUN_002c7d00` D:L168019) | none: an adaptation |

## 5. Owed

- **MAP-10b's wiring** (held `main.ts`, the controller's at wave 4): `new TurretPage(...)` with its deps and `attach(client)`;
  its `action()` first in the action filter chain (XR-06's `ActionLifecycle` as `'turret'` later); `nearby:` asks
  `prompt()`; `frame()` each frame after the walk's; the HUD's ammunition box from `hudAmmo()` while it is not null; the
  page's fire while mounted sends its round from `muzzleAt` (the room takes its own line regardless, s6).
- **A browser look** at the joined turret parts (s3).
- **Captures** (owner session B, research 213 s3 item 13): mount from in front and behind, both yaw stops, the pitch
  stops, fire until empty, dismount, death while mounted, a contested mount.
- **Enowapi's `mp62turret2`** (research 177 s2): a capture that it takes `mp62turret`'s pitch -50..15.
- **The library precedence** among duplicate model names (research 177 s2): this join is the probe's, not a recovered
  engine rule; no census row depends on a duplicate today.

## 6. The room's authority and the page, as built (MAP-10b)

- **The wire** (PF.R33, protocol 10, additive JSON): `{ type: 'mount' | 'dismount'; seq; turret }` from the page;
  `{ type: 'turret', id, occupant, ammo }` to every page on a mount and a release, and to the occupant alone after its
  rounds change (at most once a tick); `welcome.turrets?`, the occupied turrets only (absent when none). The aim is no
  field of its own: it is the occupant's `BodyState.yaw/pitch`, clamped by the room (193 s4.3's two f32 aims at a 0.05
  threshold, carried at the body's own quantisation). The turret event's `ammo` reaches every page at a mount and a
  release -- PF.R31's "ammo to the occupant only" holds for the count as it runs down.
- **The mount** (`resolveMounts`, at the top of `Room.step`, before the commands): asks collected since the last step,
  one a seat, taken once the command each names has run (LATER 124, 2026-10-19, s7.9; *was* at the first step after the
  ask came), resolved by the lower seat id among those taken at one step's top; alive, not stale (the command named
  within `FIRE_ARRIVAL_JITTER_TICKS` of the room's count when the ask came, `MountAsk.staleAt`; *was* the room's latest
  at the take), holding none, the turret free, no traversal move, and `canMount` on the room's own mover. The distance
  is three-dimensional as `FUN_003a90c0` computes it (D:L300482-300486: x, y and z), not the dispatch's `dx^2 + dz^2`: on
  Crossroads turret 1's floor (y 42.5, 13.69 under the root) the reach is 16 u along the ground. The orientation test the
  angle bounds is the facings' (the actor's z row against the turret's, D:L300491-300504): the actor faces the gun's way
  within 35 degrees -- standing at its rear, facing along it.
- **The hold** (`onTurret`): the mounted command loses its stick, jump, stance, swap, leans, Action and kit hold; its
  look is clamped (`clampAim`). The mover runs it, so it settles where it stood -- the page's `WalkMode.setLocked` sends
  the same zero stick to its own mover and the page clamps its look by the same function (`TurretPage.frame`), so
  `reconcile` meets no correction.
  This lock is the port's as built: the original's own source for the mounted walk's stop is unread. Leads (issue #93's
  review, 2026-10-09, not yet re-read): the mount hands the actor's controller to the turret (`FUN_005463c0`
  D:L412189-412196; `FUN_002956e0` D:L139715-139738 points `DAT_00415ff0` at it, undone at the dismount `FUN_00545ee0`
  D:L411972-411980), and a mounted actor's turn is routed to the turret and returns (`FUN_0057b550` D:L439633-439641,
  `FUN_003a7330`) -- the walk most likely stops because the control is the turret's, not because an action owns the
  body. `turretHold.test.ts` holds the port's lock headless (issue #93: the spec's settle read inside the seat steer).
- **The round** (`turretRound`, `fire`): the turret's record (`KitTable.turretRecords`, PKM TURRET 205, LMG TURRET 207:
  FireWait 0.12, automatic), `fire`'s cadence rule on its own clocks, one of its rounds, from `muzzleAt` (the firepoint
  turned about the gun's pivot) down `gunLine`; the page's claim is shape-checked and otherwise unused (the line's
  placeholder then; since TURRET-CONE, 2026-10-18, its `dir` is bounded inside the turret record's cone about the gun's
  line and fired along: `TURRET_ROUND_LINE_READING`, s8.2), so no eye or `headPoint` check can refuse an honest mounted round -- the occupant's
  `headPoint` is unchanged in any case, its body never moving. The kit's magazines, cone and locks are untouched.
- **The releases**: `dismount`; `kill` (before the kill is told, so the page's unlock never follows its death's lock);
  `leave`; any occupant no longer seated (demoted, replaced) at the next step; `startRound` and `abandon` (the rounds
  restored first, `FUN_003aa9d0`).
- **The occupant's other actions** (the fix round, 2026-10-05): a `throw` (a grenade, a charge, the Detonator, a
  launcher's round or raise), a switch's `action` and a `door` from a mounted body are dropped 'mounted' (`mountedRefused`),
  as `onTurret` strips the same presses off its commands; XR-05's `bombAction` takes the same guard at the merge (absent
  from this base). The rifle's `reload` is not refused (it changes nothing the turret fires). *(Superseded 2026-10-17 by
  TURRET-AMMO, s8: mounted, the `reload` is the turret's -- the slot in the hand -- and the rifle's magazines are left alone;
  the original's (`FUN_00594cf0` D:L453460-453463), overriding this choice on the source's evidence.)*
- **The waiting room's rebuild**: `rebuildWaiting` (an ARMORY kit change before any round) re-spawns the body in place and
  keeps `mounted`; harmless -- the body stands where it was, the hold and the clamp go on, and a dismount releases it.
- **The aim's rate**: `RATES` (1.5, `TURRET_RATE_UNITS_READING`) is not applied -- the aim snaps to a stop rather than
  approaching it at a rate, the look itself unslowed (a deviation from S27-DISPATCH s8; the unit is unread).
- **The page's wiring** (sprint 27 wave 4, research 214 s7): `main.ts` makes the `TurretPage` beside the doors and follows
  the room through one relay; `turrets.frame()` after the walk's frame; `nearby:` and the action lifecycle's `turret`
  context from `turrets.prompt()` / `turrets.action()` (first in the picker's order since AD-6, 2026-10-16: the mount is
  action 19, 0x80000, and the release action 20, 0x100000, `FUN_0021f850`'s first two bits, research 214 s4; was: after
  C4, `TURRET_ACTION_BIT_READING`, retired; the turret alone while mounted, as `FUN_005937c0` returns after the release's
  bit, D:L452334-452338); the HUD's box from `turrets.hudAmmo()` while mounted. `setLocked(false)` unlocks only a lock
  the turret took, and never a dead player's. Mounted, the rifle is still -- no round, no magazine drain, no reload -- and
  the trigger is the turret's: the room fires a mounted player's rounds only from the page's `fire` claims (`fire` ->
  `turretRound`), so the page claims one at the press and one each interval while held, the interval the room's own
  (`turretInterval`: the record's fastest mode, `FireWait` x 0.8 automatic). (Superseded 2026-10-07 by s7: the firing page
  now draws its own rounds, and the others draw them by the turret's record.) The firing page draws nothing of its own
  rounds this sprint -- no muzzle flash, tracer or sound (the others see the room's rounds); the tracer from `muzzleAt`
  (item 6, optional) is not wired.
- **Not built** *(built 2026-10-12 by PAR-59, s8 "The MGL's round")*: MGL FRAG TURRET's explosive round (research 177 s5). Mounted, it fired **nothing**: the room's
  `turretRecord` read `turretRecords` (class 205 only), so its `turretRound` dropped the shot 'no turret weapon'
  (`room.ts` :1380, :3594), and the page drew none (`matchActions.ts` `turretRecord`). Corrected 2026-10-12 (PAR-57's
  review): this line said "fires as a firearm round if mounted", wrong since it was written (3155a5dc4). The round is
  PARITY-2's PAR-59.
  (no map of the three has one); the turret's own damage (TURRET_DAMAGE_PLACEHOLDER).

## 7. The mount's body, its sound and its rounds (2026-10-07, the owner's playtest)

The owner's playtest of main 6f5081a3 (2026-10-06 evening): on Crossroads and Vigilance the player "artificially" attaches
where he stands, no sound plays, and no bullet effect shows where the turret is shot. Status: **reading, pending review**
(the decompilation `D:L<n>` and the disc's files through the repository's readers; no capture). Code:
`packages/viewer/src/net/emplacement.ts` (`TURRET_MOUNT_CLIPS`, `TURRET_HOLD_CLIP`, `TURRET_CLIPS`, `mountShape`,
`mountRootAt`, `seatTarget`, `SeatSteer`, `firepointFrame`), `packages/viewer/src/turretPage.ts` (`TURRET_SOUNDS`,
`turretPose`, `ownPose`, `muzzleOf`, `round`), `packages/match/src/room.ts` (`Player.seat`, the steer in the command
step), `packages/viewer/src/motionTable.ts` (`MotionEntry.refPt`), `packages/viewer/src/fire.ts` (`drawRound`),
`packages/viewer/src/matchFirearm.ts` (`turretRound`, `mountedMuzzle`), `packages/viewer/src/matchNet.ts` (`recordOf`),
`packages/viewer/src/walk.ts` / `remotePlayers.ts` (`setMountPose`), `packages/scene/src/turrets.ts`
(`TurretPlacement.firepointMatrix`). Tests: `packages/viewer/test/turretMount.test.ts`, `turretPage.test.ts`,
`fire.test.ts`, `matchFirearm.test.ts`, `matchNet.test.ts`, `motionTable.test.ts`, `packages/match/test/roomTurrets.test.ts`.

### 7.1 The mount, as the game runs it

- **Who runs it.** `FUN_002c7d00` (D:L167987-168025), the turret's replicated state, calls the mount `FUN_005463c0` when
  the owner is set and the release `FUN_00545ee0(actor, 0)` when it is cleared, on every console; the local press goes
  through `FUN_00546210` (D:L412033-412093), which online asks the host (`FUN_002c79f0`). So every page plays the mount
  and the release of every occupant.
- **The sound.** `FUN_005463c0` plays `.GRAB_TURRET` (ELF 0x65c400, D:L412197-412200) and `FUN_00545ee0` `.RELEASE_TURRET`
  (0x65c3f0, D:L411968-411971), each through `FUN_00344f30` and the sound's `+0x14` at volume 1.0 at the actor's `+0x1c`.
  Both are in the map's bank (`.GRAB_TURRET` index 185 in the walk-sounds golden).
- **The kit.** The mount hands the kit the turret's weapon (`FUN_005bc5d0`, D:L412217: the turret's `+0x2ac` weapon,
  `+0x2a8` rounds); the release gives the rounds back to the turret and the kit its slot (D:L412001-412006).
- **The clips.** `FUN_005a6fc0` (D:L462173-462200) takes the turret anim set (`DAT_0044d410`, "turret anim set",
  D:L496088-496090) and pushes `Stand -> Turret` (`DAT_003df108`) from the rifle or `Pistol stand -> Turret`
  (`DAT_003df110`) from the pistol by the hand's `+0xf79` (the motions' names D:L495412-495415). `animset.rdr`'s set
  maps `Stand` and `Turret poses` to `seal_turret_poses`, the two mounts to `seal_stand2turret` and `seal_p_stand2turret`;
  `motion.rdr` gives both mounts `playback` 0.3, `NoInterrupt`, `NoFire`, `NoPitchtwist` and `refPt` (-3.31, -2.526,
  7.655), the hold `looped` 1, `playback` 1, `NoPitchtwist`. The mount clips have 26 keys (0.3 x (25/26)^2 = 0.277 s, a
  one-shot's run), the hold 3. The release plays the mount clip reversed (`FUN_005a6eb0` D:L462136-462170:
  `FUN_00588bc0(actor, motion, 0, 1, 0)`, its 4th argument the reverse, as the launcher's lower).
- **The seat.** *(Re-read 2026-10-09, PB-2: the steer named in this bullet is the looped branch's; while the mount clip
  plays the steer is `FUN_005b3340` -- see "The seat's steer, re-read" below.)* After the clip, `FUN_005463c0` (D:L412260-412316) records in the motion's state the turret's place (its
  matrix's translation), its facing (its matrix's forward, flattened) and the clip's `refPt` negated (`FUN_0058c2f0`
  D:L447933-447949; `FUN_00287620` D:L131598-131611 keeps `refPt` at the motion's `+0x4c` with `+0x4b` bit 0). Each tick
  `FUN_0057a330` (D:L439017-439090) calls `FUN_005b2d20` (D:L468517-468748), which sets the actor's velocity -- at most 30
  a second on each axis -- to bring its place plus its root (`vtbl+0x88`, the clip's root as sampled) less `refPt`, turned
  by its facing, onto the turret's place, and turns it to the facing at most 4.712 rad/s; the record ends inside 1 and
  past a facing of 0.993, after 46 ticks, or past 30 (research 86 s3.5 read the same function for the climbs). The seat
  is so `origin + R(facing) x (refPt - root)` *(contradicted 2026-10-16 by PB-2b's read, s7.5 item 2, and corrected by PB-2c: the steer's
  root has its x and z zeroed, `refPt` moves with the clip root's velocity and the facing is the gun's at the mount -- the
  seat `origin + R(gun yaw at the mount)(refPt + travel)` on the ground; "The seat, re-read and built" below)*. With the clip's first root (-3.258, 11.035, -0.8125): 8.47 behind the
  pivot on the gun's line, 13.57 under it -- on Crossroads within 0.12 of both floors, on Vigilance within 0.08 of three
  and 1.08 under the fourth's (`mp51_turret03`) raised floor. The root leans 3.4 forward over the clip (to the hold's
  (-3.203, 10.520, -4.184)), so the target moves back as the clip runs: a mount from close settles near 8.5, one from
  further near 11.8. The game zeroes the drawn root's x and z after each update (`FUN_0057a330` D:L439147-439148), as the
  port's animator does, so the hips are drawn over the actor's place.
- **The approach and the vertical bounds** (s4's `TURRET_APPROACH_READING`, `TURRET_VERTICAL_READING`): the ELF's bytes
  are `DAT_003e0828` = 225.0 (a 15-unit vertical bound) and `DAT_003e0830` = 35.0 (degrees); `FUN_00309200` is `a - b`
  (D: its body). Not applied here: which of the test's two operands is the actor is the vfunc's caller's, untraced.
- **The aim's rate** (s4's `TURRET_RATE_UNITS_READING`): `FUN_003a93f0` (D:L300546-300606) sets the turret's yaw and pitch
  speeds to `RATES` (the definition's `+0x114` / `+0x118`, D:L301542-301545) times the occupant's controller's two stick
  values (`+0x10` / `+0x14`), and `FUN_003a7350` (D:L299369-299410) turns the turret part by the yaw speed x dt
  (`FUN_003a76d0`) and the gun part by the pitch's (`FUN_003a7490`), each held to its limits: the gun is driven by the
  stick at 1.5 rad/s, not by the camera's look, and the yaw turns the turret part, not the gun. Recorded, not built (the
  port's aim model is MAP-10b's ruling).

- **The seat's steer, re-read (2026-10-09, PB-2; reading, reviewed 2026-10-09).** The record `FUN_005463c0` writes lands on
  the motion state it has just pushed (`FUN_00555170(actor + 0x1c0)` after `FUN_005a6fc0`'s push, D:L412262-412313): the
  mount clip's, a one-shot (`motion.rdr` looped 0, `test/turretMount.test.ts`). `FUN_0057a330` (D:L439017-439020) steers a
  record on a **one-shot** with `FUN_005b3340` (D:L468759-468954) and only a record on a **looped** motion (`+0x28` bit 0x40,
  the looped bit: `mover.ts`'s jump gate cites it) with `FUN_005b2d20` and its 30 / 0.993 / 46-tick ends (D:L439021-439080).
  `FUN_005b3340` each tick: the offset from the actor's root (its skeleton root's world place, `FUN_003085c0` with `+0x2e8`) to
  the turret's place plus the record's `refPt` turned to the facing, times `sqrt(FUN_002874f0(phase))` (D:L468929-468930;
  `FUN_002874f0` D:L131135-131148: 2p^2 to the half, 1 - 2(p - 1)^2 after), in the actor's frame, over dt -- no clamp, all three
  axes (the vertical zeroed only under motions 0x2c "Stand -> Ladder" and 0x2e "Climb off ladder", D:L468933-468941, research
  86 s2.3); the turn toward the recorded facing at `acos(dot) / dt` clamped to 2 pi rad/s (D:L468863-468867), its sign the
  cross product's y (D:L468882-468884), the angular velocity then scaled by the cross product's length -- `sin a` for the two
  unit vectors (D:L468885-468886): from 30 off 3 degrees a tick at 60, under 6 off `a sin a` a tick, so the turn does not
  close within the clip (5.26 short after 16 of its 17 ticks from 30 off) and the hold lays the gun's facing at once
  (`FUN_00585cd0`, s7.4); the root is turned by the actor's own matrix (`FUN_003085c0` with the actor's `+0x28`, D:L468927),
  `refPt` by the recorded facing, so the seat is reached at the facing the actor has on the clip's last tick (0.37 off the
  facing's seat for a root 4 ahead, from 30 off); the stored `refPt` moved by the actor's velocity x dt (D:L468947-468951).
  It ends with the clip: on the seat at the clip's end. *(PB-2's re-check, 2026-10-09: the 5.26 and the 0.37 above are
  the PORT's 60 Hz tick (MISSION R8); the game steps at its 30 Hz frame (`dt` the actor's `+0x2e0`), and under 2 pi dt off
  each step turns `a sin a` whatever `dt` is, so at 30 Hz the same mount is 6.03 short after 8 frames and settles about
  0.42 off. Laying the gun's facing on the clip's last tick is the port's timing choice, so page and room agree on one
  tick: the game's hold lays it after the clip (`FUN_00585cd0` D:L444609-444623).)* *(F1 of PB-2's review, 2026-10-09: the sine factor and the root's
  facing applied.)* The
  recorded facing is the turret's matrix's forward flattened -- its vfunc `+0xc`, which is `turret + 0x2c0`, the gun part's world
  matrix (s7.4): the gun's yaw at the mount.
- **The seat, re-read and built (2026-10-16, PB-2c, issue #81; reading, pending review).** PB-2b's part-2 read (s7.5 item 2),
  never reviewed, re-read at the source; it stands, with one finding added (the ease's phase). Code: `packages/viewer/src/net/emplacement.ts`
  (`seatTarget`, `mountPhase`, `mountRootVelocity`, `mountPlayedOut`, `mountSteerTicks`, `SeatSteer`; `seatTargetFacing` and
  `SeatMover.lift` retired), `packages/viewer/src/turretPage.ts` (`MountMark.facing`, the drawn `gunYaw`, `mounting`),
  `packages/match/src/room.ts` (`TurretState.gunYaw`, the mount's `SeatSteer.start`, the command step's hold after the steer).
  Tests: `emplacement.test.ts` "PB-2c: ...", `turretMount.test.ts` "PB-2c: on Crossroads' two turrets ...", "PB-2c: on
  Vigilance's four turrets ..." (the disc), `turretPage.test.ts` "(d) PB-2c: ...", `roomTurrets.test.ts` "PB-2c: ..." (the
  seat, the hold on the clip's end tick, the steer toward the gun's yaw, a park and a resume while mounted).
  - *The facing's target.* `FUN_005463c0` records at the state's `+0x7c` the turret's vfunc `+0xc` matrix (`turret + 0x2c0`:
    the vtable 0x408250's word at `+0xc` is 0x2c7be0, `jr ra; addiu v0, a0, 0x2c0`, the ELF's bytes) times the model's forward
    `DAT_003f6500`, its y cleared (`& 0xffffffff` on the x, y pair, D:L412296) and normalised (`FUN_00309110`, D:L412297)
    (D:L412268-412297, written D:L412305) -- at the mount, the gun part's world matrix as `FUN_003a7350` last copied it
    (`+0x284`'s into `+0x2c0` each turret tick, D:L299410-299411): the gun's yaw where its last occupant left it. The round's
    reset `FUN_003aa9d0` restores the rounds and `+0x3c0` only (D:L301337-301338). Built: the room's `TurretState.gunYaw` (the
    occupant's yaw each mounted tick, kept after the release; the placement's facing before any), the page's drawn aim (`TurretPage`'s `gunYaw`,
    `MountMark.facing`), `SeatSteer.start(.., facing)`, `SeatSteer.toward`. **Built 2026-10-17 by the online seat's RESUME-MOUNTED (#258):** the room's `gunYaw` rides the
    wire (an additive `gunYaw` on `TurretWire`: the welcome's turrets, a free gun left turned listed too, and each `turret`
    event), taken in `TurretPage.take` as the mount's facing; a free gun a welcome names is drawn at it
    (`TURRET_FREE_GUN_PITCH_PLACEHOLDER`, the room keeping no pitch); the `resume` carries the turret and, mid-steer, the
    steer's ticks and `toward`. *Was (open, PB-2c's review, F1, medium):* the
    room's `gunYaw` is not on the wire (`TurretWire` carries `{ id, occupant, ammo }`), so a page takes the gun's yaw it last
    drew itself -- a page that joined after the gun was turned (a late join, a resume) holds the rest facing, and on its
    mount its look turns and lays there while the room's steer turns toward the turned gun; from the hold's first tick the
    room follows the command, so the body and the gun swing to the rest facing, where the original keeps them. The fix: an
    additive `gunYaw` on the welcome's turrets and the `turret` event, taken in `TurretPage.take` -- the online seat's
    wire (`protocol.ts`), with its RESUME-MOUNTED (the `resume` carrying the mount).
  - *`refPt`'s motion.* After the offset is taken the steer subtracts `actor+0x2c` x dt from the stored, negated `refPt`
    (D:L468947-468951): `refPt` gains the actor's velocity x dt. `actor+0x2c` is `FUN_0028c250`'s (D:L438910, after the
    advance D:L438901, before the steer D:L439020) times `DAT_0064fc80` (D:L438985; 1.0 each tick at D:L418170 and written
    otherwise only by the locomotion's set split; the ELF's word is 0x3f800000). `FUN_0028c250` (D:L134145-134181) sums
    over the play's entries `FUN_00289bb0`'s root key pair (k, k + 1) -- the last pair at the last key (D:L132714-132718) --
    / 256 (0x3b800000) x keys / the clip's `+0x10` (D:L132750), x `+0x24` (1 forward), / `+0x18` where not 1 (1: made so by
    `FUN_0028d860`), x the weight `+0x8` (1: `FUN_0028bdf0` makes the entries' weights sum to 1, D:L133969-133990). In the
    body's frame, as `refPt`. Built: `mountRootVelocity` (the port's `Walker.clipVelocity` convention), `SeatSteer`'s `ref`.
  - *The root.* `FUN_003085c0(actor matrix, *(actor+0x2e8), ..)` (D:L468927) carries the 12 bytes at the pointer through the
    whole matrix (D:L206952-206993): the `skel_root` node's (`+0x2e8` = `FUN_0028e7b0(.., 0x65c4c0)`, "skel_root",
    D:L419606-419607) local translation -- the pose's pop writes a node's first 12 bytes as its translation (D:L437158-437160).
    The tick zeroes its x and z after the pose -- under `+0xeac` with the seat's record on (D:L439099-439102), otherwise
    (D:L439147-439148): one of the two always, for a mounting body -- and the steer (D:L439020) runs before the pose
    (D:L439091). So the steer reads (0, y, 0), y the last tick's pose (the first tick's the stand's; the port's key 0, unused).
    The seat: `origin + R(gun yaw at the mount)(refPt + travel)` on the ground. Built: `SeatSteer.target`.
  - *The ease's phase* (found 2026-10-16, PB-2c; not in PB-2b's read). `FUN_005b3340` eases the motion's phase as it stands --
    `puVar8[7]`, the state's `+0x1c` (D:L468835-468839, D:L468929) -- which `FUN_0028c4f0` holds at the one-shot's end
    (n - 1)/n (D:L134223-134278; `FUN_0028cc10` D:L134494); the port eased `t / run`, the phase scaled to 1, so its last
    tick put the body on the seat (k = 1) where the original's stops short (k = 0.994 on the last). Built: `mountPhase`.
  - *The clip's end.* The ground driver asks `FUN_00582540` (D:L418193) before the tick's advance; `FUN_0028c6e0`
    (D:L134283-134308) answers past e on the stored phase plus half `dt x +0x24 / (playback x e)`. Inside, `FUN_00582540`
    re-reads `cVar4` as the play's reversed bit (D:L442992), so its `Stand -> Turret` / `Pistol stand -> Turret` test
    (D:L443054-443057) sends only the reversed clip, the release's, to the set's return (`FUN_0058c4a0(actor, +0x52c)`,
    D:L443143-443150); the forward clip takes the plain end (`uVar8 = 1`, D:L443129-443132) and is popped (`FUN_005870e0`,
    D:L418203). The turret set's `Stand` below it is then the top (pushed under it by `FUN_005a6fc0`'s `FUN_0058c4a0`,
    `FUN_0058c350`), and `FUN_0057a330` runs the hold `FUN_00585cd0` that tick (D:L438897-438898) -- no steer (the `Stand`'s
    record is clear: `FUN_0028cc10` D:L134518). At the game's frame (`GAME_FRAME_DT`) the clip comes off after 8 advances,
    key 24.06; at the port's 60 Hz after 16, key 24.04 -- never 25. Built: `mountPlayedOut`, `mountSteerTicks`; the page's
    clip end, look lay and hold start (`TurretPage`'s `mounting`; was `run`, key 25); the room's hold on the end tick (the
    hold asked after the steer's step; was from the tick after). The 'mounting' refusal (s7.2) keeps its ticks: the room's steer is still
    cleared on the 17th.
  - *The vertical.* After each move `FUN_005483d0` sets the height (`+0xf58`) from `FUN_0059afd0` (D:L413943-413946) --
    the floor `+0x2e4` (D:L456351, D:L456354, D:L456363) or a root-relative height held at or above it (D:L456368-456372)
    -- unless the state `+0x174` is 10: the steer's vertical never takes the body through its floor. Read; the port's
    movers take none, as before (`SeatMover.lift` retired). (Not `TURRET_VERTICAL_READING`: that one is the mount test's
    bound, s4.)
  - *Measured* (the read law over the disc's `seal_stand2turret`, `turretMount.test.ts`): from behind, a side and 20 away,
    on Crossroads' two turrets and Vigilance's four, the steer leaves the feet 0.215 from the hold's place at the port's
    60 Hz and 0.293 at the game's frame -- the same from every start (the last tick aims with 15, or 7, ticks of travel;
    PB-2b's "about 0.13" took the whole clip's). *(Corrected 2026-10-17, T81-4; reading, pending review: the original's
    steer is stopped by no wall -- `FUN_005483d0` writes the unresolved move back in the turret anim set, D:L413908-413918;
    s7.9 and `TURRET_STEER_WALLS_READING`. Was the next sentence's "the port's walls" read as the original's.)* In the room on
    Crossroads' two turrets the walk's glide stopped them 2.43 short
    of that place -- the gun's own hull within the body's 3.5, the port's walls (s7.5, "no wall test"), not the seat -- and the
    hold then placed them; since T81-4 the room's steer meets no polygon wall and leaves them 0.215 from it (was, in the
    present: "stops them 2.43 short ... and the hold then places them"; T81-4's review F2).
  - Open: where the mount's push falls in the game's frame (`FUN_002c7d00` D:L167987-168025 against the actor's tick: the
    whole mount a frame later or not, never its key); the release's reversed clip comes off the same way *(built 2026-10-18, LATER 109, s7.9: its travel and its end, `ReleaseTravel`)* (its end at the
    reversed stored phase less half a step, D:L134304-134305), drawn by the page to its first key -- not built here. Owed:
    capture B 13.
- **The steer, shared with the climbs (2026-10-17, NU-1c; reading, pending review).** `FUN_005b3340` is the climbs' one-shot
  steer too (research 313 sections 3, 8.6 and 8.7): its clock, weight and turn are now `net/emplacement.ts` `OneShotSteer`
  (`oneShotPhase`, `steerWeight`, `seatTurn`), which `SeatSteer` runs (`mountPhase` is `oneShotPhase` of the shape, the
  arithmetic unchanged) and `traversal.ts` runs for the climbs. The mount's behaviour and pins are unchanged
  (`emplacement.test.ts`, `turretMount.test.ts`, `turretPage.test.ts`, `roomTurrets.test.ts` green). What the weight is laid
  on differs: the mount's whole offset to the seat (the root's velocity zeroed under the seat's record,
  D:L439099-439105), the climb's offset past its clip's own travel (the play's velocity added to the root's,
  `FUN_0054d9a0` D:L416455). The climb's record keeps `refPt` as it is and the facing as the contact's normal negated
  (`FUN_005b1a10` D:L467927-467933) where the mount negates `refPt`: one aim, `place - R(facing) x stored`, `stored` moved by
  the root's velocity x dt.
- **Nothing parents the actor.** `FUN_005463c0` (D:L412197-412316) writes the occupant's controller on the turret
  (`param_2[0x30]`), the turret on the actor (`+0xeb8`), the kit's slot and the seat's record, and adds the actor under no node
  (no `FUN_0028ebe0`, no child-add vfunc): the actor's place is the steer's while the clip plays and its own after. **For issue
  #81's trail** (the controller posts it): "Correction to 'the seat node the body is parented to': the original parents the
  body to nothing. The mount (`FUN_005463c0`) records a seat -- the turret's place, its facing and the mount clip's `refPt` --
  and, while the mount clip plays, `FUN_005b3340` steers the body onto it, ground and height, and turns it toward the gun, 2 pi rad/s
  at most times the sine of the angle; in the hold `FUN_00585cd0` lays its facing on the gun's yaw each tick. Research 215 s7.1 (re-read 2026-10-09, PB-2)."

### 7.2 What the port does now

- **The room** (`room.ts`): a mount that passes starts a `SeatSteer` on the occupant (the hand's mount clip's shape,
  `mountShape` off the room's clips -- `SIM_CLIPS` now carries `TURRET_CLIPS`, and the offline room the page's), stepped
  before the mounted command each tick (`TURRET_SEAT_READING`; PB-2: `FUN_005b3340`'s law over the clip, its turn and vertical
  handed to the mover; since wave 2 (2026-10-09) the room lays the turn as the mounted command's yaw, past the look gate
  (OT.R38), the vertical not taken yet), each step through the
  mover's own collision (`Walker.glide`: a mount from in front stops at the gun's hull, never carried through it)
  *(corrected 2026-10-17, T81-4, s7.9; reading, pending review: the original's steer passes every polygon wall, the gun's own hull
  included (the post-move cell push, `TURRET_HOLD_PUSH_READING`, unread) -- the turret anim set restores the move's unresolved displacement, `FUN_005483d0` D:L413908-413918 -- so the
  steer's move is laid with no collision, `TURRET_STEER_WALLS_READING`; was "each step through the mover's own collision")*; the
  page's own mover follows through the reconcile's correction, and the page turns its own look alike while its own mount
  clip plays (`TurretPage.frame`: `seatTurn` per whole tick of `TICK_HZ` since the mount, the remainder carried; the facing
  laid once at the clip's end -- F-C, wave 2). A room without the clips steers none (the body stays where it mounted).
- **Every page** (`TurretPage.take`): the mount's and the release's sounds at the body (`TURRET_SOUNDS`), never for a
  welcome's state; the body drawn through the traversal seam (`WalkMode.setMountPose`, `RemotePlayers.setMountPose`):
  the hand's mount clip forward over its run, `seal_turret_poses` at the key its gun's elevation picks (PB-2, s7.4; was
  `TURRET_HOLD_KEY_READING`), the clip reversed at
  the release. The page asks the pack for `TURRET_CLIPS`.
- **The rounds.** The occupant's page draws each claimed round on the gun's own line (`TurretPage.round`, the room's
  `muzzleAt` and `gunLine`): `Fire.drawRound` (the path, the marks, the tracer by `tracerRound` on the turret's weapon id
  and its count from the mount -- every fourth; a body on the gun's line, `FireSource.bodyDistances` / `targetDistance`,
  struck unmarked and passed at PERSON's 0.97 as the firearm's own round's since P12 (research 219 §3.2; *was* stopped
  there unmarked), the room's `impact` bringing the blood), the record's `FireAnimName` (`muzzle_turret_RMG`, `muzzle_turret_LMG`)
  on the firepoint turned with the gun (`firepointFrame`, `TURRET_MUZZLE_NODE_READING`), the impact, and the report
  (`.PKM`, `.PKM_M`, `.PKM_F`) -- none for a claim the room drops (the count spent, the binoculars up). The other pages took a turret round's item id (205, 207) for no record -- `recordOf`
  read the kit records only, so they drew and heard the side's first firearm; it now reads `turretRecords` too, and the
  flash is placed on the turret's firepoint (`MatchFirearmDeps.mountedMuzzle`), not the rifle in the occupant's hand. No
  page draws another's tracer, for any weapon (an existing gap, not the turret's).
- **Not built here:** the menu-launched match has no turret at all (`FRONT_END_CAPABILITIES.actions` false: the
  actions part is `/testroom`'s; the controller's plan item) *(since built: ACT-2, research 250 s3)*; the occupant's held
  rifle is still drawn while mounted *(superseded 2026-10-09 by s7.3, PB-2: the kit re-hangs nothing, the mount clip
  carries the rifle to the back, and every body's play draws it on its carry in the hold)*; the release's refusal while
  the mount clip plays (`FUN_00545ee0`'s first test, D:L411954-411966) is not applied *(applied 2026-10-10, issue #81;
  reading, pending review: the room refuses a `dismount` asked while the mount's steer runs -- `Player.seat`, the clip's
  run -- dropped `dismount: mounting` and not kept, and takes one asked after the clip's end (`Room.turretRequest`; test
  `packages/match/test/roomTurrets.test.ts` "a dismount asked while the mount clip plays ..."). A room without the clips
  runs no steer and refuses none; the room's own releases (death, leave, the knock, the round's start) are not asks and are
  not gated -- whether the first test refuses the knock's `FUN_00545ee0(actor, 1)` too is not stated here)*.

### 7.3 The held weapon while mounted (2026-10-09, PB-2; reading, reviewed 2026-10-09; re-read 2026-10-16, PB-2b: reading, pending review)

Issue #81: mounted, the occupant's own rifle was still drawn in its hands. Code: `packages/viewer/src/net/emplacement.ts`
(`TURRET_HELD_WEAPON_READING`, `TURRET_STOW_PHASE`, `turretStow`; `turretHeldMounts`, retired by PB-2b),
`packages/viewer/src/turretPage.ts` (`turretPose`'s `mounts`), `packages/viewer/src/animator.ts` (`TraversalPose.mounts`),
`packages/viewer/src/play.ts` (`drawnMounts`: every body's play, the own and the others', on both matches). Tests:
`turretPage.test.ts` "(a) PB-2b's rework: ..." to "(a4) ..." (was "(a) a seated body's rifle stays on its node under rhand ...",
before it "... rides its carry ..."), `turretMount.test.ts` "PB-2b's rework: the mount clip's stow ...", "PB-2 (a):
seal_stand2turret's rifle track ...".

- **The kit hides nothing.** The mount hands the kit the turret's weapon in a new slot at the end (`FUN_005bc5d0`, D:L412217:
  `kit+0x82c`, the slot count, grows) and takes it up (`FUN_005c4b10`, D:L412218). The swap's model step `FUN_005c50b0`
  (D:L478977-479013) goes by the new item's class (`FUN_003d1a60`: PKM TURRET 205 is 0xcd, class 0 -- not a primary, the pistol,
  the launcher or an item): class 0 is its last branch, `FUN_005c6980(kit, 0, "aimnodes")` (D:L479738-479761; "aimnodes" the
  string at 0x65f8d8), which re-hangs a model only on the body's class-0 node `actor + 0x388`. The body makes the class-1 and -2
  nodes (`FUN_00553290`, D:L419021-419062, called for 1 and 2 at D:L419663-419664), none for class 0, and no slot model is added
  for the turret's slot. The class-0 branch raises no swap request (`kit+1` bit 0x10, whose `FUN_005c1660` runs `FUN_005a64c0`).
  The hand `+0xf79` is left as it was (the release's `FUN_005a6eb0` keeps it). So the kit leaves the rifle (`+0x350`) on its
  node under `rhand`, or on its carry when the pistol is in the hand. *(Corrected 2026-10-16, PB-2b's re-review: the mount
  clip's own phase callback re-hangs it -- s7.3 "The stow" below.)*
- **The clips move it.** `seal_stand2turret`'s `rifle` track holds the grip for keys 0-8, then carries the rifle round to the
  back; at its last key (25: `FUN_0028d670` D:L134879-134902 holds a one-shot at `frameCount - 1`) it lies within 0.06 and 14
  degrees of the carry, `character.rdr`'s "rifle" gear on `spinelo`, on Crossroads' SEAL and terrorist alike (the fixture). The
  hold `seal_turret_poses` has no prop track at all (nor does the unused `seal_turret_stand`). The release plays the mount clip
  reversed (s7.1), bringing the rifle back to the grip. `seal_p_stand2turret`'s `pistol` track is a constant identity; a body
  mounted from the pistol has its rifle on the carry already, and its pistol is stowed on its holster at the clip's 0.4
  (s7.3 "The stow"). *Was:* "a body mounted from the pistol keeps the pistol at its grip in the right hand".
- **The port** *(was, PB-2; superseded 2026-10-16 by PB-2b below)*. The animator writes a node the playing clip has no track
  for at its bind, which put the rifle back in the hand for the hold: the playtest's finding. Every body's play now draws a
  rifle in the hand on its carry while it holds `seal_turret_poses` (`turretHeldMounts`; mounting and releasing, the clip's
  own track). `TURRET_HELD_WEAPON_READING`: whether the game's pose keeps an untracked node's last local (the rifle where the
  mount clip left it, the back, moving with the hand by the hold's key) or its bind (the hand) is unread (research 77 s10,
  "blend or hold"); the carry is where the mount clip puts it and where the level key leaves it.
- **The untracked node, read (2026-10-16, PB-2b, issue #81; reading, pending review).** The body's tick `FUN_0057a330` advances
  the plays' phases (`FUN_0028c4f0`, `FUN_0028c380` D:L134186-134220: each play's time through `FUN_0028d670`, which sets
  only the play's key and fraction, D:L134879-134902), and the pose is `FUN_00577ea0` (D:L437415-437472, called at
  D:L439091): a stack of layers, one per play and sub-play, each pushed by `FUN_005777d0` (D:L437177-437295), which marks
  every node's entry unwritten (`+0x0c` = -1, D:L437201-437230) and samples a node only where the body has one in that slot
  and the clip has its track (`*piVar9`, the clip's per-slot table at `+0x40`, D:L437257-437291); the sub-plays are laid over
  by `FUN_00576bb0` (written entries only, D:L436707-436783) and the plays merged by `FUN_00577000` (D:L436853-437133); the
  pop `FUN_00577700` (D:L437136-437174) writes the skeleton's locals (`actor+0x1d4`, translation and rotation) from the
  entries marked written alone. Nothing else lays the locals each frame: the bind is laid once, at the body's build
  (`FUN_0028e480`, D:L419660), a play change snapshots the pose for the cross-fade and resets nothing (`FUN_0028dc90`
  D:L135215-135220 -> `FUN_0028e3e0`), and the cross-fade after the tick (`FUN_00576860` at D:L418455 -> `FUN_0028e0d0`
  D:L135285-135306) mixes a node with its own snapshot. **So a node the playing clip has no track for keeps its last
  local** -- for every clip and every node. The rifle's slot: with the rifle in the hand `FUN_005763e0` (D:L436492-436548,
  each play's clip from `FUN_00577ea0`) points the `rifle` slot (`DAT_003df148`, the slot count less 4, D:L448374; its name
  "rifle" at 0x65d188) at the rifle's node (`actor+0x350`) only for a clip carrying `rifle`, or the `weapon` slot
  (`DAT_003df160`, "weapon" 0x65d208) for one carrying `weapon`; a clip with neither leaves the slots as they were; the
  push's gear reset `FUN_0058acc0` (D:L447110-447230, at D:L446303 and D:L446522) puts back on their gears only the nodes
  of slots below the four held ones (`uVar7 < DAT_003de1e8 - 4`, D:L447131, D:L447226). The rule stands for every clip and
  every node. *Corrected 2026-10-16 (PB-2b's re-review): this bullet went on "so in the hold the rifle's node, under `rhand`
  (nothing re-parents it at the mount: `FUN_005a6fc0` D:L462173-462200), keeps the local `seal_stand2turret` last gave it" --
  wrong: the mount push `FUN_005a6fc0` re-parents nothing, but the mount clip's phase callback does (next bullet).*
- **The stow (2026-10-16, PB-2b's re-review; reading, pending review).** `FUN_00588bc0`, the play push, installs a phase
  callback on the turret's mount clip (D:L446318-446343): `Stand -> Turret` (`DAT_003df108`) `FUN_005a73c0` forward and
  `FUN_005a7520` reversed, both at 0.5 (0x3f000000); `Pistol stand -> Turret` (`DAT_003df110`) `FUN_005a75d0` forward and
  `FUN_005a7730` reversed, both at 0.4 (0x3ecccccd) -- the motion's phase, its one-shot end at (n - 1) / n, so keys 13 and 10.4
  of the 26 (research 181 s2.7 lists the triggers). The tick the phase crosses its trigger fires it (`FUN_0057a330`
  D:L438996-439003 through `FUN_0028c7c0`: from <= t <= to forward, to <= t <= from reversed), and a play that ends uncrossed
  fires it at its end (D:L443133-443141): it always fires, on every console. `FUN_005a73c0` (D:L462281-462303) moves the
  rifle's node (`+0x350`) from under `rhand` (`+0x300`) to `spinelo` (`+0x2fc`; the body's look-ups D:L419615-419617), clears
  the `rifle` slot (`FUN_0028e780(.., DAT_003df148, 0)`) and lays the node's local at the "rifle" gear
  (`FUN_0058b040(actor, +0x390, +0x394)`, D:L447233-447266; the gear `FUN_0058b0f0` D:L447281-447282). While the mount is the top
  play `FUN_005a7980(actor, 1)` answers 1 (`DAT_003df108` and `DAT_003df110` on its list, D:L462471-462499), so `FUN_00577ea0`
  skips `FUN_005763e0` (D:L437436-437448); in the hold `FUN_005763e0` finds no `rifle` or `weapon` track. So the rifle stays on
  its carry through the hold. `FUN_005a7520` (D:L462328-462347) puts it back under `rhand` and re-points the slot when the
  reversed phase crosses 0.5. `FUN_005a75d0` (D:L462350-462372) stows the pistol at 0.4: `+0x354` to `+0x318` -- `rthigh`
  (the look-up D:L419628-419629, "rthigh" at 0x65c520) -- with its local from `FUN_0058b040(+0x398, +0x39c)` (the "pistol"
  gear, D:L447283-447284): the port's `holster` mount; `FUN_005a7730` (D:L462397-462416) back under `rhand`. The mount clip
  hands over to the hold at about key 24.06 by its end test (`FUN_0028c6e0` D:L134283-134308), never at 25.
- **Built (PB-2b's rework, 2026-10-16; reading, pending review).** `net/emplacement.ts`: `TURRET_STOW_PHASE` (0.5, float32 0.4)
  and `turretStow(hand, phase, reversed)`; `TURRET_HELD_WEAPON_READING` back to `'carry'` (was `'hand'`). `turretPage.ts`
  `turretPose`: each pose carries the stow its clip's phase has made (`TraversalPose.mounts`, the animator does not read it):
  the mount from its phase on, the hold always (a welcome's at once: past the stow), the release above its phase.
  `play.ts` `drawnMounts`: the kit's mounts with the pose's over them -- every body on both matches, replays included (they
  draw through the same `TurretPage`). The animator's untracked-node rule (part 1) stands: in the hold it keeps the rifle
  node's local, which the carry does not draw. The review's F1 (`TraversalPose.lead`, `Animator.layLead`: the mount clip's
  last key laid for a body that had not drawn it) is withdrawn: it rested on the rifle being drawn from that node.
- **Built (PB-2b, 2026-10-16; reading, pending review).** `packages/viewer/src/animator.ts` (`Animator.pose`): a node no node of
  the play tracks keeps its last local -- the pose on screen, a held item's node the local drawn (`heldShown`) and its frame;
  was its bind. *(Was, superseded by the rework above:)* `packages/viewer/src/net/emplacement.ts`:
  `TURRET_HELD_WEAPON_READING` re-valued `'hand'` (was `'carry'`); `turretHeldMounts` retired, and
  `packages/viewer/src/play.ts`'s `drawnMounts` the kit's mounts. Measured on Crossroads' SEAL and terrorist through the
  animator (`turretMount.test.ts` "PB-2b"): the mount's cross-fade from the stand (no `BlendTime`: the loader's 0.4) is at
  0.83 on the clip's last key, so the rifle node's local it leaves is that mix, 1.66 from the carry at the hold's level key
  -- the node the carry does not draw. The clip-pair survey (every node tracked by one clip and not by another, over `MOTION_P.ZAR`'s 334 and MP72's 7
  victory clips): the legs and the root are lacking only in 49-50 upper-body clips (`seal_p_*` and `seal_pfp_*` versions,
  the `seal_mv_*` overlays, `seal_headlooks`, `guard_restrained_arms`); the 16 of them the port plays are the pistol's
  `seal_p_*` versions and the moving swap, each laid over a clip that carries the legs, so no main play leaves them
  untracked; `spinelo` in nine (the overlays and the moving reloads, `seal_rifle2handsfree`, `guard_restrained_arms`), the
  arms in two (`seal_headlooks`, `_prone`), `body` in every clip (its bind, as before); the rifle in 130 -- among the rifle
  hand's whole-body plays `seal_turret_poses`, `seal_turret_stand`, the launcher's clips (the rifle stowed then, not
  drawn: `Play.setRifleStowed`) and the hostages' and the restrained guards' sets -- and the pistol in 240 (the rifle's clips, the pistol in
  its holster then, drawn off its gear). *(Added 2026-10-16, the review's F3: the played set reaches past the turret and the
  locomotion -- the deaths, the victory dances, the falls and get-ups, the flinches, the climbs and the ladders are among the
  240 without a `pistol` track, every `death_*` and `victory_*` clip included, and the port lays no pistol version over
  any of them (`PISTOL_ANIMS` names none; the jump, the fall, prone's crawl and turn, the hits likewise); so a body with the pistol in hand that dies,
  dances, falls, flinches or climbs now keeps the local its last pistol clip gave the pistol, on `rhand`, where it took the
  bind (the grip's identity). As the original, per the read above: with the pistol in hand `FUN_005763e0` re-points the
  `pistol` slot only for a clip carrying `pistol` or `weapon` (D:L436492-436548), and the pose writes no untracked node.)*
  *(Withdrawn 2026-10-16, PB-2b's re-review:)* the review's F1 laid the mount clip's last key ("key 25") for a body that
  entered the hold without drawing it (`TraversalPose.lead`, `Animator.layLead`); the stow makes it moot -- the hold draws
  the carry -- and the clip hands over at about key 24.06, never 25. The review's F2: mounted, the accuracy pip is not
  drawn (`matchFirearm.ts`, gated on the hands' `mounted()`): the hand is the turret's and the rifle is on its carry. F5,
  reworked: the hook's `ownBody()` carries the drawn muzzle (`ownBodyRead`), and both turret specs require in the hold
  `mounts.rifle` `'carry'` and no muzzle (`Play.muzzle` answers null off the hand), a muzzle before the mount; was
  (F5) the muzzle more than `HOLD_MUZZLE_MOVE` (3) off the pre-mount one. Tests: `animator.test.ts` "PB-2b: a node the
  playing clip has no track for keeps its last local", `turretMount.test.ts` "PB-2b's rework: the mount clip's stow ...",
  "PB-2b: through the animator the rifle node keeps ...", `turretPage.test.ts` "(a)" to "(a4)". Owed: capture B 13.

### 7.4 The hold's key and the hands (2026-10-09, PB-2; reading, reviewed 2026-10-09)

Code: `packages/viewer/src/turretPage.ts` (`turretHoldKey`, `turretPose`'s hold). Test: `turretPage.test.ts` "(c) the hold's
key follows the gun's elevation ...".

- **The driver.** `FUN_0057a330` (D:L438897-438898) runs `FUN_00585cd0` (D:L444509-444628) instead of the clip's own
  advance while the body is in the turret anim set (`+0x528` = `DAT_0044d410`) and its motion is type 1, the set's `Stand`
  (`seal_turret_poses`); the `Turret poses` type (`DAT_003df100`, D:L495412) is never read. Mounted (`+0xeb8`), it takes the
  turret's matrix -- vfunc `+0xc`, which the turret's vtable (0x408250) points at 0x2c7be0, `jr ra; addiu v0, a0, 0x2c0` (the
  ELF's bytes): `turret + 0x2c0`, where `FUN_003a7350` copies the gun part's world matrix each tick (D:L299409-299412) -- carries
  the model's forward (`DAT_003f6500`, (0, 0, -1) at run time, research 181) by it, takes the elevation `e` (`acos` of the
  forward's horizontal length, negative when it points down) and writes the hold's phase `clamp(0.5 - e x 0.63661975, 0, 1) x
  2/3` (D:L444592-444602). With three keys the key is `phase x 3`: **0 (the hips low) at the gun 45 degrees up, 1 level, 2 (the
  hips raised) at 45 down**, linear between, held past. The port's gun elevation is the clamped aim's pitch: the own body's look,
  another's snapshot's.
- **The facing.** The same function lays the actor's orientation on the gun's forward flattened (D:L444609-444623) and its eye
  point (`+0xf54`) at the turret's place plus (-3.257, 0, 4.282) turned with it: the body faces the gun's yaw
  (`TURRET_HOLD_FACING_READING`, now read).
  *(Corrected 2026-10-11, PARITY-2 PAR-44, s7.5: `+0xf54` is the body's next position, not an eye point -- the hold
  places the body each frame, not only its facing.)*
- **The hands.** Nothing in that branch, or in the mount, places the hands: the clip's three keys carry the arms, authored at
  the three elevations; no grip target is read.

### 7.5 The hold places the body (2026-10-11, PARITY-2 PAR-44; reading, reviewed 2026-10-11: PASS WITH FINDINGS, medium-high, its four findings folded in)

The owner's playtest of `main` (2026-10-11): "everything passed except for the turret position" -- his screenshot (outside
the tree, `C:/Projects/agent-mail/evidence/2026-10-11-turret-mount-craig.png`) shows the mounted SEAL beside and behind
the gun, the hands off the grips, the barrel pointing away from the body's facing. A reader's source inspection (no run):

1. **The hold pins the body to the gun each frame; the port only turns it** (the main cause, medium-high). `FUN_00585cd0`
   lays the facing on the gun's flattened forward (D:L444609-444623) **and** writes the body's next position `+0xf54` as
   the turret's place plus **(-3.257, 0, 4.282)** -- float32 bits `c05072b0`, `40890625`, inline immediates at ELF
   0x585ec4-0x585ed0, -3.2570000 and 4.2820001 -- turned by that facing, the shortest arc from (0,0,-1) to the gun's
   flattened forward kept at actor `+0x50` (`FUN_00306d40` D:L444622, applied by `FUN_00306fd0` D:L444624)
   (D:L444603-444605, D:L444624-444625). **The turret's place here is `turret+0x1c`**, which the turret's vfunc `+0x10`
   (0x3a9320, the ELF's bytes) copies from `turret+0x330..0x338`, the translation of `turret+0x300`, which `FUN_003a8f50`
   sets to the world matrix of the yaw part's parent node (D:L300412-300413) -- not the placed node the mount reads
   (D:L412298-412302); the two coincide only where that parent carries no local offset. `+0xf54` is
   the actor's position: `FUN_005483d0` (its subject the actor, D:L413401) skips its own move while the body holds the
   turret (D:L413914-413919), takes the height from the floor (`FUN_0059afd0`, D:L413943-413947) and copies `+0xf54` into
   the actor's matrix and its node (D:L413953-413958); `FUN_0054d9a0` skips its own write of `+0xf54` in the turret anim
   set (D:L416562-416571). The hold still runs the mover's collision push on `+0xf54` (D:L413920-413941). So the original's
   occupant stands 3.257 left of the gun's line and 4.282 behind the turret's place (the yaw part's parent), on the floor,
   and orbits with the gun's yaw. The port's room keeps the mover where the mount's steer left it and lays only its
   yaw (`room.ts:3423-3434` `onTurret`, `room.ts:2216`; `TURRET_DISMOUNT_PLACE_READING`, `net/emplacement.ts:48-56`) while
   the drawn gun turns about its own pivot (`turretPage.ts:300`, `emplacement.ts:135-142`): any yaw swings the gun away from
   a body that only turns in place.
2. **The mount ends at another seat** (medium). `SeatSteer.target` re-reads the clip's root every tick
   (`emplacement.ts:300-302`, :320-331): with the last root (-3.203, 10.520, -4.184) the steer ends at
   `origin + R(rest facing)(-0.107, ., 11.84)`, 7.56 further back and 3.15 further right than the hold's place with the gun
   level. The original moves the stored `refPt` by the body's velocity x dt each tick (D:L468947-468951; the velocity the
   clip's root's, `FUN_0028c250` D:L134149-134181 through `FUN_00289bb0` D:L132696-132754), which the port does not model
   (`emplacement.ts:235-236`). If that shift equals the root's travel **and** the steer's root (D:L468927) has its x and z
   zeroed, `refPt` plus the travel is (-3.255, ., 4.284), the hold's constant within 0.002 -- the mount would land where the
   hold pins; with the shift but an un-zeroed root the seat is `place + R(-0.052, ., 8.47)`. An inference, not a reading,
   until both are read. Unread: the scale `DAT_0064fc80` (D:L438985), the
   `+0x18` divisor, and whether the steer's root read (D:L468927) has its x and z zeroed.
   *Read 2026-10-16 (PB-2b; reading, pending review; not built -- s7.1's seat takes the root's x and z, which this
   contradicts, and the room runs the steer: the change waits on the room's hunk).* `DAT_0064fc80` is 1.0 at each tick's start
   (D:L418170) and written only by the locomotion's set split (`FUN_00583350`, D:L443364; research 201 s6): 1 for the mount
   clip. The play's `+0x18` is 1.0 at its make (`FUN_0028d860`) and copied (`FUN_0028bdd0` D:L133961); no other writer in the
   motion code (D:L131000-136500): 1 as far as traced. The velocity is the clip root's key delta / 256 x keys / the clip's
   `+0x10` (`FUN_00289bb0` D:L132691-132754; at the last key the last delta) x the play's speed (1 for a one-shot forward,
   -1 reversed: `FUN_0028cc10`) x its weight, in the body's frame, so `refPt` gains about (n - 1) / n of the root's travel over
   the clip. The steer's root is `FUN_003085c0(actor matrix, *(actor+0x2e8))` (D:L468927): the skeleton root's node, whose
   local translation the vtable's `+0x88` returns (0x669228 -> 0x553db0: `jr ra; lw v0, 0x2e8(a0)`, the ELF's bytes; the
   vtable `FUN_00553ea0` sets, D:L419421) and the tick zeroes in x and z after the pose (D:L439101-439102 while the seat's record is on,
   D:L439147-439148 otherwise; the pose D:L439091, the steer before it D:L439020) -- so the steer reads the root at (0, y, 0).
   The seat is then `origin + R(gun yaw at the mount)(refPt + travel)` on the ground: with the travel (0.055, ., -3.37) x
   25/26 about (-3.257, ., 4.41), against the hold's (-3.257, ., 4.282) -- the mount landing within about 0.13 of where the
   hold pins it, rather than 7.56 behind it.
   *Re-read and built 2026-10-16 (PB-2c, s7.1 "The seat, re-read and built"; reading, pending review): the read stands; the
   steer eases the motion's phase as it stands (a finding of its own), and the clip comes off after 16 ticks at 60 Hz
   (key 24.04), so the last tick aims with 15 ticks of travel -- measured 0.215 from the hold's place at 60 Hz, 0.293 at the
   game's frame, not 0.13. The room's half built the same day (`room.ts`; was owed).*
3. *The facing recorded at the mount* (low; an edge): the port takes the placement's rest facing (`emplacement.ts:327`,
   `turretPage.ts:291-294`), the original the gun's current matrix (D:L412268-412297): they differ only when a previous
   occupant left the gun turned. *Built 2026-10-16 (PB-2c, s7.1): the page's (its drawn aim) and the room's (`TurretState.gunYaw`; was owed).*
4. *Which part yaws* (low; visual): the original yaws the turret part (`FUN_003a76d0` D:L299519-299528) and pitches the gun
   part (`FUN_003a7490` D:L299464-299469); the port turns `parts.gun` and its children about `gunOrigin`.

Confirmed alike (not the cause): the place source (the turret object's placed node, `FUN_0029ee10` D:L144974 from
`FUN_003aa350` D:L301134, its translation D:L412298-412302, the port's `origin`); the facing (vfunc `+0xc` = `turret +
0x2c0`, the gun part's world matrix, D:L299409-299412, (0,0,-1) flattened, D:L412268-412297); `refPt`'s sign and axes
(stored negated D:L412264-412267, negated again D:L468920-468922, added D:L468926); the root `+0x2e8` = `skel_root`
(D:L419606-419607) turned by the actor's matrix (D:L468927); the drawn root's x and z zeroed (D:L439147-439148;
`animator.ts:840`); the height from the floor (D:L456351-456363); the hold key by elevation. The hands: `FUN_0028c380`
(D:L134186-134220) samples each layer's clip; nothing in `FUN_00585cd0` or `FUN_005463c0` places them; an IK elsewhere is
unread -- the hands on the grips are the rendered check's (and capture B 13's), not a unit test's.

**The port change:** each tick of the hold, in the room and in the page's prediction, the occupant's mover taken to
`place + R(aim yaw)(-3.257, ., 4.282)` (the exact float32 values) **through the mover's collision**, its height from the
floor, the facing the aim, where `place` is the yaw part's parent's world origin (or the port's `origin` where a fixture
test shows the two equal); the release leaving the body at the hold's place. Item 2's steer end waits as a named reading
(the hold's first tick pins the body meanwhile). Tests that pin the present behaviour change with it
(`roomTurrets.test.ts:120` "its mover holds still", :315 "where the hold left it").

**Built (PAR-44, 2026-10-11, `agent/par44` c932a87ff; reading, pending review).** Code: `packages/viewer/src/net/emplacement.ts`
(`TURRET_HOLD_OFFSET_READING`, `TURRET_HOLD_PUSH_READING`, `holdPlace`, `holdStep`), `packages/match/src/room.ts` (the
command step: `holding` before the seat's step, `holdStep` after the mounted command's `apply`), `packages/viewer/src/turretPage.ts`
(`TurretPage.holdTick`), `packages/viewer/src/walk.ts` (`WalkMode.setTurretHold`, run after each tick's move before its
command is sent), `packages/viewer/src/matchActions.ts` (the one wiring line, both pages). Tests: `packages/match/test/roomTurrets.test.ts`
"PAR-44: past the mount's steer ...", `packages/viewer/test/turretPage.test.ts` "PAR-44: the own body's predicted place ...",
`packages/viewer/test/turretMount.test.ts` "PAR-44: the hold's place ...", `packages/scene/test/turrets.test.ts` "PAR-44: the
hold's place -- the yaw part's parent's world origin ...".
- **The place.** The yaw part's parent's world origin (`turret+0x1c`) equals the placement's `origin` to the thousandth on
  all six (Crossroads `mp72_turret01` 600.394/56.188/1595.459, `mp72_turret02` 2129.683/112.5/1462.799; Vigilance
  `mp51_turret01` 1237.637/89.061/948.578, `02` 478.582/97.313/792.475, `03` 687.607/148.035/1201.95, `04`
  1355.478/-14.58/459.676; the parent is the library prototype's realised root, and the instance node above it is the same),
  so the hold uses `origin`; `TurretPlacement` is unchanged.
- **The timing.** The room holds from the tick after the steer's end (at once in a room without the clips); the page from
  its own mount clip's run on its clock (at once for a welcome's mount), the steer's ticks being the room's, followed by
  the reconcile. The yaw is the mover's after the command's look gate: the aim, the snapshot's yaw, the drawn gun's.
- **Differs from the brief: no wall test.** The brief asked the move through the mover's collision (`Walker.glide`). On
  Crossroads' turret 1 a wall lies 1.07 behind the hold's place at yaw 0 (1.75 at yaw 60), inside the body's 3.5
  (`BODY_RADIUS`, `WALL_PROBE_READING`): a glide stops 2.43 short (measured in the room test before the change). The
  original's walls act on the move's velocity (D:L413380-413560), and the hold skips that move (D:L413914-413919): the
  place stands as `FUN_00585cd0` wrote it, with the unread push (`TURRET_HOLD_PUSH_READING`) and the floor's height
  (`FUN_0059afd0`, D:L413943-413947). So `holdStep` writes the horizontal place and takes the height from the floor there
  (the ground step's floor pick; with no floor nothing moves; a mover the tick left falling is stood on it).
- **The walk's push-out around it.** The room's and the page's mover still run their own tick before the hold, whose
  push-out (`Walker.pushOut`) moves a body inside 3.5 of a wall out of it; the hold puts it back the same tick, so every
  snapshot and every predicted command is at the place. After the release the push-out is no longer undone: the released
  body on Crossroads' turret 1 moves back to 3.5 off that wall on the walk's next tick (the release itself sets nothing).
  Whether the original's body stays there is the walls' reading (the push-out is the port's, `mover.ts`), not this task's.
- **Not changed:** the mount's steer end (item 2), the hands, items 3 and 4. *(Items 2 and 3 built 2026-10-16 by PB-2c,
  s7.1 "The seat, re-read and built"; the room's half the same day, was owed.)*

### 7.6 The mounted gun's tracer goes as the rifle's (2026-10-12, PARITY-2 PAR-54; reading, pending review)

The owner's playtest of `main` 2d5618c23: after a burst from the turret, "a visible trail through the air like a tracer
or something for the last bullet" stays. A source inspection, no run:

- **The original.** The turret's round is the world's projectile, not the kit's: `FUN_003a8d20` (the turret's own fire,
  s4's `TURRET_MUZZLE_NODE_READING` row) takes it from the projectile pool (`FUN_003cca90(DAT_004b5220)`, D:L300347),
  marks it the turret's kind (`+0xb4` = 1, D:L300350), numbers it from the turret's own count (`+0x2b0` + 1 into `+0xb8`,
  D:L300351-300353) and fires it through the weapon (`vtable+0xc`, D:L300372). The round's tracer branch (`FUN_003cabe0`
  D:L320537-320553) draws it when that number is a multiple of 4 -- the model by `+0xb4` (1: the turret's), launched into
  the tracer pool `0x4b5260` (`FUN_003d5030`) -- as for every tracer weapon (research 89 s4). The pool is stepped every
  frame by the world's projectile tick (`FUN_003d1f90` D:L324551 -> `FUN_003cc990` D:L321474 -> `FUN_003d4bf0`), which
  retires a tracer at its end or past its limit (D:L327062-327078, freed by `FUN_003d4ed0` D:L327043 the next step) --
  whoever fired it, mounted or not. Nothing keeps a tracer once the firing stops.
- **The port (the cause).** The port's tracer is still `Fire`'s one-frame line (research 89 s6; the travelling model is
  research 101 A1). A turret round lights it through `Fire.drawRound` (`MatchFirearm.turretRound`), and only
  `Fire.update` cleared it -- which `fireFrame` does not run while mounted (MAP-10b: the rifle is still). So every tracer
  round's line stayed until the next one redrew it, and the burst's last stayed until the dismount: the lead, confirmed.
- **The fix** (`viewer/src/fire.ts`, `viewer/src/matchFirearm.ts`; both pages mount the one firearm, research 222):
  `Fire.tracerFrame()` is the tracer's step alone (`update` runs it); `fireFrame` runs it while mounted. Both pages run the
  turret's rounds after `fireFrame` (`acts.turretFrame`), so `drawRound` lights the line drawn in that frame and gone in
  the next, the firearm's own round's one frame. Tests: `packages/viewer/test/matchFirearm.test.ts` "PAR-54: a mounted
  turret's tracer ..." (a mounted burst of 8 through `mountFirearm`, the tracer on rounds 4 and 8 only, gone the frame
  after the last) and "PAR-54: both pages step the firearm's frame before the turret's rounds".
- **Not changed here:** whether the turret's `+0x2b0` count restarts at a mount (the port counts from the mount, s7)
  was not read. The travelling tracer is research 89 §19. The port's tracer number is `TurretPage.fired`, zeroed when
  the held turret changes (`setHeld`) and not when the trigger is released. The word zeroed on that release is
  `kit+0x818` (the rounds-this-pull cap, s8, `turretPulled`). Whether `+0x2b0` is cleared there was not re-read. A
  burst of four looks the same either way; five, release, then three, streaks on the third of the second burst only
  when the count is the mount's.

### 7.7 #81's rendered check (2026-10-17, PARITY-2 T81; reading, pending review)

Issue #81's closing bar: the owner's playtest of `main` 01035996d (2026-10-11) passed "everything ... except for the turret
position" (his picture: the SEAL beside and behind the gun, the hands off it, the barrel pointing away). That build had
PB-2's steer and no hold placement: PAR-44 (s7.5, merged 1cdbf5fcf) and PB-2c (s7.1) came after it. T81 measured the
lane (0f123daaf) headless and in a browser. Evidence kinds kept apart:

- **Unit test (the disc and the fixtures).** `packages/viewer/test/turretMount.test.ts` "T81 (issue #81): in the hold the
  hands lie within 0.7 of the drawn gun" -- Crossroads' two turrets and Vigilance's `mp51_turret01`, `02`, `04`, at yaw
  0/+-30/70 from the facing and pitch 0/+-20/+-45: a mount from 12 behind steered by `SeatSteer`, the aim laid, one tick
  of `holdStep`, the map's SEAL in `seal_turret_poses` at `turretHoldKey(pitch)` through the port's animator, each hand's
  distance to the nearest vertex of the gun's drawn parts (`loadMap`'s placements turned by `gunDelta`). Measured
  0.11-0.67 (Vigilance 0.34-0.67, Crossroads 0.11-0.59); the bound 0.7 is a test tolerance, no game value. RED with the
  hold's placement taken out of `holdStep` (the body left where the steer stopped, as before PAR-44): 18 of the 40 lines
  fail, a hand up to 3.14 off at the turned aims and 0.71 at 45 up. The three keys of the hold carry the hands with the gun's pitch: at 45 up (key 0) and 45
  down (key 2) the right hand lies within 0.01 of where it lies level, in the gun's own frame -- the key law
  (`FUN_00585cd0` D:L444592-444602, s7.4) and its sign hold. The aim twist does not run on the hold (`NoPitchtwist`,
  `animator.ts`'s gate; the hands moved 0.0000 with the pitch and the weight given).
- **The owner's build, recomputed** (a scratch run, the same method): the feet where PB-2's steer stopped (11.84 behind the
  pivot on the gun's line) and only the facing turned -- the hands 2.8-5.9 off the gun at the facing and 3.5-10.3 at
  +-35, the body 6.9 beside the gun's line. His picture is that build's seat, not the present one.
- **Rendered browser run** (the merge controller's browser slot, `/testroom` MP51 `mp51_turret02`, a scratch probe deleted
  after the run, 1 passed; the shots and the log at `C:/Projects/agent-mail/evidence/gameplay/T81-2026-10-17/`, outside
  git): at the facing, 35 left, 20 up and 20 down the drawn feet lie 0.000 from the hold's place, the body's yaw equals
  the drawn gun's, the hold's key is on its law, and the hands lie 0.41-0.60 from the drawn gun (the headless figures to
  the hundredth). The placed cameras' side shots show the SEAL shouldering the PKM, the hands on it, the rifle on its
  carry. One frame, 35 right, caught the turn in flight: the body 8.08 degrees behind the drawn gun, the feet 0.804 off
  the hold's place -- the drawn gun takes the page's look at once while the mover's yaw is stepped by the look's gate, and
  the hold places the body at the mover's yaw (s7.5). The original never parts them: the hold lays the body on the gun's
  own matrix each frame (`FUN_00585cd0` D:L444609-444625), and the gun turns at `RATES` times the stick
  (`FUN_003a93f0` D:L300546-300606), whose unit is `TURRET_RATE_UNITS_READING` (s4). Not captured: the original running.
- **The hold's turn at the gun's rest facing 180** (a reading of the original's memory, not yet re-read by a reviewer).
  `FUN_00585cd0` turns the offset by the shortest arc from the model's forward `DAT_003f6500` to the gun's flattened
  forward (`FUN_00306d40`, D:L444622); where the two are opposite -- the sum's squared length under 1e-06 (`FUN_00309240`
  adds, as at D:L444625) -- it takes the quaternion `(DAT_003f64e0, DAT_003f64e4, DAT_003f64e8, 0)` (D:L444613-444619).
  Both words are zero in the ELF's file and set at run time: the original's RAM in the desktop's captures
  (`SOCOM_PC_ROOT`'s `logs/parity/spawn_pcsx2.rdram` and `postload_pcsx2.rdram`) holds `DAT_003f6500` = (0, 0, -1) (as research 181) and `DAT_003f64e0` =
  (0, 1, 0): a half turn about y. So a gun at 180 -- `mp51_turret02` at rest -- places the body as any other yaw does,
  which is the port's `holdPlace` (a turn by the yaw). No change.
- **`mp51_turret03`'s floor.** At its hold place the floor lies 12.30-12.79 under the pivot, against 13.56 on the other
  three Vigilance turrets and 13.69 on Crossroads' (the raised floor of s7.1): the body stands 0.8-1.3 higher against the
  gun than the clip was authored for, its left hand 0.76-0.98 off the gun, the head higher over the bags. The hold takes
  the floor's height in the original too (`FUN_005483d0` -> `FUN_0059afd0`, D:L413943-413946), so the port's figure is
  expected to be the original's; the T81 test leaves this turret out. Owed: capture B 13 (a mounted body on
  `mp51_turret03`).
- **Open, named:** `TURRET_RATE_UNITS_READING` (s4; the gun's rate, and with it the turn above);
  `TURRET_HOLD_PUSH_READING` (s4; the hold's push off blocked cells, `FUN_005169b0` and the table at 0x66a1b0, unread --
  a body beside a wall, `mp72_turret01`'s 1.07 behind its place, may stand elsewhere in the original); the mounted camera
  (partly read 2026-10-17, TURRET-RETICLE, s8.2: the mount keeps it on the body, `FUN_002956e0` D:L139716-139746, with a
  one-second blend, D:L140729-140790, and the view state 0 in third person, D:L412247-412255; its pitch while the gun
  pitches is `TURRET_CAMERA_PITCH_READING`, note only. Was: "unread: the port's walk camera stays on the held body, e2e
  `turretMount.spec.ts`; no constant names it in the code").
  The body against the gun -- its place, its facing and the hands -- has no open reading left in this note's rows.

### 7.8 The body on the drawn gun through a turn (2026-10-17, PARITY-2 T81-2; reading, pending review)

§7.7's rendered check caught one frame mid-turn (35 right): the body 8.08 degrees behind the drawn gun, the feet 0.804
off the hold's place. The port drew its own gun from the page's look at once, while the hold placed and turned the body at
the mover's yaw, which the look gate (`viewer/src/net/lookGate.ts`, the stick's law: `MAX_YAW_RATE` 2.236 rad/s, research
223 §3.1) lets reach a jumped look over ticks.

- **The read.** `FUN_00585cd0` (D:L444509-444628), run from the actor's tick in the turret anim set (`FUN_0057a330`
  D:L438897-438898; `FUN_0057a330` from the actor's update `FUN_00550ef0`, D:L418454), reads the gun's frame through the
  turret's vfunc `+0xc` (D:L444547; the vtable 0x408250's word 0x2c7be0, `turret + 0x2c0`) and takes from that one matrix
  the elevation that sets the hold's key (D:L444550-444602), the facing it lays (D:L444609-444623) and the place it writes
  (D:L444624-444625). `turret + 0x2c0` is written by `FUN_003a7350` (D:L299371-299414) only at its end, after it has
  turned the turret part (`FUN_003a76d0`, laid by `FUN_00315820`, D:L299385-299390) and the gun part (`FUN_003a7490`,
  D:L299391-299397): `FUN_003109f0`'s world matrix of the gun part `+0x284` copied in (D:L299409-299412, while `+0x3a4`
  & 2 is clear). `FUN_003a7350` runs from the turret's update `FUN_003a93f0` (D:L300546-300606; the vtable's `+0x18`,
  0x3a93f0 in the ELF's words), which sets the yaw and pitch speeds from `RATES` times the occupant's controller's sticks
  (D:L300563-300566) and then turns (D:L300579). The look is not read on that path. *(F5 of T81-2's review:)* the sticks
  are read only on the local or offline branch -- `DAT_0045a0c1` clear, or the turret's controller the one `FUN_002b3580`
  answers (D:L300559-300560); a remote occupant online goes to `FUN_003a78e0` (D:L300573) instead, and a turret with
  `+0x3a4 & 2` set to `FUN_003a84e0` (D:L300577) -- neither read here; both still end in the same turn and copy
  (D:L300579). So the hold's body and the drawn gun are
  one matrix: the body is laid on the gun as it stands after the turret's last turn. *Not read:* the order of the turret's
  update and the actor's within a frame (the world's object walk) -- the body on this frame's gun or, at most, the last
  frame's (one 30 Hz frame of the gun's turn, `TURRET_RATE_UNITS_READING`'s rate). The mounted recoil's kick
  (`FUN_0057b550` D:L439621-439641 -> `FUN_003a7330`, D:L299360-299366) turns the gun's pitch on the actor's tick and
  re-copies the matrix (`FUN_003a7350(0)`), before or after the hold as that walk runs.
- **The port, as it stood.** The room's gun is the mover's yaw (`room.ts`: `TurretState.gunYaw` set to the mover's yaw after
  `holdStep`), and another page draws the occupant's gun at its snapshot's yaw (`TurretPage.frame`'s `bodyLook`): the room
  and the others' pages already turn the gun and place the body on one yaw. The own page drew its gun at the clamped look
  (`TurretPage.frame`), ahead of the mover through any turn faster than the stick's law -- a mouse's flick, the hook's
  `setCamera`; a pad's stick, inside the law, did not part them.
- **Built (T81-2).** `viewer/src/turretPage.ts`: `holdTick` keeps the aim the hold placed the own body at (`holdYaw`: the
  mover's yaw and, since F3 of the review, its pitch -- `HoldMover.state.pitch`, `net/emplacement.ts` -- for the mount it
  belongs to), and `ownAim` gives the own gun that aim -- the drawn gun (`frame`), its rounds' muzzle and line (`round`,
  `muzzleOf`) and the hold's key (`heldPitch`); during the mount clip (no hold yet) the look's own, as before. The pitch:
  the original's gun pitches by the stick at `RATES` `+0x118` (D:L300565-300566, `FUN_003a7490`), and the room fires at
  the mover's gated pitch (`room.ts`'s `aim` on the look the gate let); the page drew and fired at the clamped look's. So the gun the page draws is the gun the room holds and the other pages
  draw, and the body never leaves it. The room is unchanged (its law is this one already). The camera keeps the look.
  Test: `packages/viewer/test/turretPage.test.ts` "T81-2: a look jumped 35 degrees past the stick's law ..." -- through a
  `WalkMode` with the gate, each of 30 frames after the jump: the drawn gun's yaw the body's within the wire's yaw step
  (360 / 65536), the feet on the hold's place at the drawn gun's yaw within 1e-3, and (F2 of the review, the rounds' pin)
  each frame's round from
  `muzzleAt` down `gunLine` at the body's aim. RED before the build: 12 frames apart, the body 10.68 to 34.16 against the
  gun's 35, the feet 2.267 to 0.079 off. F3's: "T81-2 (F3): a look pitched 40 up past the stick's law ..." -- the gate's
  context for a weapon of no scope and no kick (the page's open context holds no pitch), each of 40 frames: the drawn gun's
  pitch the body's, the hold's key `turretHoldKey` of the body's pitch, the round on its line. RED before F3: 31 frames
  apart, the body -2.25 to 39.30 against the gun's 40 (the mover from the spawn's pitch, `init_aim_pitch` -9.167 --
  `scene/src/tuning.ts:280`, the camera's read `viewer/src/playerCamera.ts:81-82` -- climbing 1.385 a tick: no dip), the key 0.111 against the body's 1.050 to 0.127, the round's line up
  to 0.72 rad and its muzzle 3.6 off.
- **The crosshair's gap (F4 of the review, the crosshair's gap).** The camera keeps the look: after a flick of the mouse or the hook's
  `setCamera` the crosshair (the camera's look, the screen's centre) leads where the rounds go -- along the gun on the
  mover's aim -- by up to the flick, for as long as the gate takes to let it through (35 degrees about 12 ticks, 140 about
  62). A pad's stick, inside the law, has no such gap. It is a gap of the mouse adaptation and the hook, not of the game's
  input; the original's mounted camera is unread (§7.7). The merge controller's ruling: "not built: the keyboard/mouse
  is dev-only; revisit if the mounted camera is read".
- **The limits (F6 of the re-read).** `ownAim` holds the own aim to the turret's limits (`clampAim`), as the room's
  `onTurret` and another page's `aimOf` hold it; F3 had lost the clamp the look had given it. The gated mover can stand
  past a stop: mounted looking at -70 on a gun held to -25..10 (MP10's MGL turret) it climbs for about 14 frames past the
  hold's start, and the own gun and its grenade went at -43.7 and up where the room's go at -25. Tests: `turretPage.test.ts`
  "T81-2 (F6): mounted while looking at -70 ..." (RED: 14 frames, the gun and the round at -43.69 to -25.68) and "T81-2
  (F6): a look jumped from the yaw stop (70) to 120 ..." (RED: 17 frames, the gun and the round at up to 80.68). *Found,
  not this row's files:* the second case's mover itself stands past the stop (17 of 30 frames, up to 10.68 past it): the
  walk's ticks read the look before `TurretPage.frame` clamps it, and its gate steps toward the unclamped look, where the
  room clamps the command first (`onTurret`). The own body is drawn there for those frames (now with the gun at the stop),
  and the page's prediction parts from the room's until the clamp and the reconcile bring it back. *Built by T81-3, next.*
- **The walk's command held to the turret (T81-3, 2026-10-17; reading, pending review).** *The read.* The original's turret
  never stands past a stop: `FUN_003a76d0` turns the turret part's direction by the yaw speed, tests it against the
  definition's two yaw stops (`+0xf4..+0x100` of the record `+0x27c`) and, past one, lays the stop's direction
  (D:L299504-299518) before it writes the part's matrix (D:L299519-299529); `FUN_003a7490` does the same for the pitch
  (the stops `+0x104..+0x110`, D:L299439-299453; the matrix D:L299454-299470) -- and then adds the mounted kick
  `+0x3c0` on top of the held pitch (D:L299457-299462), so a kick may pitch the gun past its stop for a frame (not built:
  the port's mounted kick is not modelled). The hold lays the body on that matrix (`FUN_00585cd0`), and the stick's own
  pitch step is skipped while mounted (`FUN_00594600` D:L452891, `+0xeb8` set). The room keeps the same order: `onTurret`
  clamps the command (`clampAim`) before `p.sim.apply` steps its gate (`room.ts`). *The port's page, as it stood.* Each
  tick the walk quantises the camera's look into the command and steps its look gate toward it (`walk.ts` `frame`: the
  `quantiseCommand` look, `lookLog.record`, `lookGate.step`); `TurretPage.frame`, which clamps the look, runs after
  `walk.frame` on both pages (`main.ts`, `matchMount.ts`), so the gate stepped toward the unclamped look. *Built:*
  `WalkMode.setTurretAim` takes the held turret's clamp (`TurretPage.clampLook`, the look as given while nothing is held);
  each tick's look is held by it before it is recorded and stepped (so `reconcileFacing`'s replay of the log steps the
  same looks), and a rerun (`rerunFrom`) applies its commands held the same way (`aimHeld`); the command sent is not
  changed (the room clamps it on the wire's grid). The camera may still lead (F4's gap). **The wiring is one line in
  `matchActions.ts`** (both pages' action part, `matchActions.ts:234`), outside the brief's files, accepted by the merge
  controller and written (3d7480474), pinned by `matchActions.test.ts` "T81-3 ... the part hands the walk the held
  turret's clamp" (RED with the line out: 25 of 26). (Was: "drafted for the controller, not written -- until it lands
  the page runs as before"; T81-3's review F1.) A rerun clamps with the hold current when it runs, not each command's
  own (`walk.ts` `aimHeld`; the room clamps by the seat it had then): they part only in a rerun spanning a mount or a
  release, which the facing reconcile corrects (the review's observation; not pinned). Tests (`turretPage.test.ts`, the harness wiring it as `matchActions` would):
  F6's yaw case now on the mover (RED: 17 frames, the mover at up to 80.68 past the stop 70); "T81-3: a pad's stick held
  into the yaw stop ..." (RED: 60 of 60 frames at 72.14); "T81-3: the pitch at its stops ..." (RED: 72 lines, the mover's
  pitch at 45.91 with the pad and up to 52.83 after a flick); "T81-3: the room's facing reconciled ..." (RED: the mover at
  78.54 after the replay). All GREEN. Not changed: the respawn's replay (`respawn` applies raw commands; a respawn ends the
  mount), the client's shadow gate (`net/client.ts`, the last resort when the log holds no step).
- **Left as it was.** The drawn feet are the tick's interpolation (`Walker.drawnFeet`,
  MISSION R8) while the drawn yaw is the tick's own: through a turn at the law's rate the body is drawn up to one tick's
  orbit (about 0.2 at 2.236 rad/s on the 5.38 radius) behind the hold's place at that yaw. T81's hands-on-gun bound
  re-measured unchanged (0.11-0.67; 0.7 kept): that test lays the hold at the aim it draws the gun at.
- Open: as §7.7 (`TURRET_RATE_UNITS_READING`, `TURRET_HOLD_PUSH_READING`, the mounted camera), and the frame order above.
  Owed: capture B 13 (a mounted turn, from behind).

### 7.9 The body's snap at the hold's start (2026-10-17, PARITY-2 T81-3's addition; reading, pending review)

The seat's browser run of `e2e/turretMount.spec.ts` failed "the walk held" (the feet 5.63 apart; 5.48 without T81-2): its
diagnostic (outside git, `C:/Projects/agent-mail/evidence/gameplay/T81-menu-2026-10-17/e2e-tmdiag.log`) shows the page's
feet still through two reads inside the mount clip and then moved 3.03 on the hold's first tick, when the clip turns to
`seal_turret_poses`. The spec read the feet "settled" mid-mount; it now waits for the hold (`ownBody().clip`) first, its
0.5 bound unchanged.

- **Measured headless** (a scratch run, not kept: `test/turretHold.test.ts`'s rig -- the page's `WalkMode`, `NetClient`
  and `TurretPage` against the loopback room, MP51 `mp51_turret01`, 12 behind on the gun's line, the hold wired as
  `matchActions` wires it -- frame by frame at 60): through the clip the room's steer stops 2.43 from the hold's place
  (the gun's hull inside the walk's 3.5, the port's walls: §7.1) while the page's mover, carried only by the reconcile's
  smoothed corrections (`net/client.ts` `SMOOTH_TICKS`), trails it -- 2.96 from the hold's place at the clip's end. On the
  hold's first tick the room places its mover 2.43 at once and the page's holdTick its own 2.82; the **drawn** feet
  (`Walker.drawnFeet`, the tick's interpolation, what `Play.bodyFrame` places the body at) follow within a frame: one
  frame's step of **3.07**. So the body is seen to snap about 3 units onto the gun at the end of the mount, on the own
  page; another page draws the room's snapshots (the room's own 2.43 in one tick, interpolated between snapshots).
- **The original.** The steer runs on each console's own actor (`FUN_002c7d00` calls the mount on every console, §7.1):
  `FUN_005b3340` closes the offset to the seat by the eased weight each tick (`steerWeight`), leaving 0.293 at the game's
  frame (0.215 at the port's 60 Hz) when the clip comes off (`FUN_0028c6e0`), and the hold (`FUN_00585cd0`) places the
  body on the next -- a step of about 0.3, not 3. *Was* "whether the original's walls stop that steer short near the gun is
  the walls' reading ..., not read here" -- read by T81-4 below.
- **T81-4, the read (2026-10-17; reading, pending review -- the seat re-read D:L413905-413919 itself).** The turret's own
  collision is live for the mounting actor: on Vigilance's four turrets and Crossroads' two (off the disc through
  `turretSceneModels`, `flattenScene`, `worldDi`) the placed instance node `<turret>/RMG_turret` (`LMG_turret` on
  `mp72_turret02`) has the flag word 0x80801055 -- `m_active` (bit 0) and the DI bit (bit 12) -- and 3 collision polygons,
  the base's hull (x +-6.51, y -13.38..2.04, z -8.06..3.21 about the pivot), and the gun part 11 (13 on the LMG); the
  collision visitor `FUN_002d2890` (D:L174789-174792) admits an active DI node other than the actor's own (the record's
  `+0x3c`, `actor+0x28`, `FUN_0054f410` D:L417267-417268); the mount (`FUN_005463c0` -- its `FUN_003a9ea0` toggles only the
  "scope" / "thermal_" display nodes, strings at 0x3fbfd0 / 0x3fbfd8 in the ELF), the hold and the turret's update write no
  node's flags. But the move discards its resolution in the turret anim set: `FUN_005483d0` keeps the intended
  displacement `+0x3d1..+0x3d3` (D:L413464-413466), resolves the hits (D:L413470-413905), and while `+0x528` is the turret
  set `DAT_0044d410` (pushed at the mount by `FUN_005a6fc0`) writes the kept displacement back (D:L413908-413912), then
  integrates it unless the hold's `Stand` is the top motion (D:L413914-413918). So the mount clip's steer passes every
  polygon wall, the gun's own hull included; the hold places the body itself. The post-move cell push (D:L413920-413941,
  `TURRET_HOLD_PUSH_READING`, unread, not applied) runs after that restore in every anim set, the clip's ticks included.
  (Was "passes every wall"; T81-4's review F3.) The path from the steer's velocity (`FUN_005b3340`,
  D:L468943-468949) to `+0x3d1` through the actor's update (`FUN_0054d9a0`) is traced in outline. The port's 2.43 is the
  turret's instance-node hull 3.50 from the stop (the walk's `BODY_RADIUS`; the hold's place 1.07 from it), on Crossroads'
  turret 1 the map's `sandbags1/sandbags2` inside 3.5 too.
- **T81-4, built (the page; reading, pending review).** `net/emplacement.ts`: `TURRET_STEER_WALLS_READING`; `SeatSteer.step`
  lays its move on the place with no collision, the floor picked as `holdStep` picks it, when the mover is handed with its
  ground (`SeatMover.grid`: the walker); a mover without it takes the move through its own `glide` (the room's, until its
  hunk). `turretPage.ts`: `holdTick` steers the page's own mover each tick of the clip (`SeatSteer`, the shape through
  `TurretPageDeps.mountShape`, wired in `matchActions.ts` off the pack's clips; none for a resume mid-steer). The scope is
  the clip's steer alone: the walk before the mount and after the release still meets the hull (pinned). The release's
  reversed clip also runs in the turret set in the original (until its end returns the set, `FUN_00582540`
  D:L443143-443150); the port's release moves nothing -- left as it was. Tests: `turretMount.test.ts` "T81-4: the steer is not
  stopped by the turret's own hull ..." (Crossroads; Vigilance off the disc) -- RED 2.434, GREEN 0.215 on all six, the walk
  before the mount stopped short and after the release pushed out; `turretPage.test.ts` "T81-4: the page's own mount steer"
  -- RED the feet 8.377 from the hold's place at the clip's end and a drawn step of 8.377, GREEN within 0.25 and 0.35.
- **T81-4, built (the room; reading, pending review; cleared by the online seat).** `room.ts`'s command step hands the
  steer its walker's ground (`SeatSteer.step`: the move with no collision) and lays the steer's place again after the
  command's move, whose push-out (`Walker.pushOut`) would otherwise undo it each tick of the clip (a scratch run of the
  room's own order: 2.433 without the re-lay, 0.215 with it); the step stays before the command, its facing that tick's
  command's yaw (PB-2). The online seat's conditions, answered: (1) `SeatSteer.steered()` and `toward` are unchanged -- the
  step's signature lost `glide` as a must and gained `grid`, but its clock (`OneShotSteer.advance`, once a tick before the
  end test passes, none on the tick it passes) is as before, so RESUME-MOUNTED's `resume.steer` re-dates the same
  (`roomTurretResume.test.ts`, `turretPageResume.test.ts`); a page resumed mid-steer runs no own steer, the room's carrying
  the body (pinned, `turretPageResume.test.ts` "T81-4: ..."). (2) The re-lay `seated` is set only on a command the room runs
  for the seat while its steer steps and has not come off, and is laid after that same command's move: a parked seat
  (OT.R59) takes the park's neutral commands through the same step (`PARKED_BODY_NEUTRAL_ADAPTATION`), so its steer and its
  re-lay run as a live seat's (PB-2c item 6); a silent seat runs no command, so neither runs; after the clip, a release or
  a death there is no steer and no re-lay. The re-lay holds a body against the walk's push-out only through the clip's 16
  ticks, where the original's move takes no wall either. Tests: `roomTurrets.test.ts` "T81-4: the room's mount steer
  passes the turret's own hull ..." (RED 2.433, GREEN 0.215) and `turretHold.test.ts` "T81-4: by the mount clip's end the
  page's own mover is within 0.25 of the room's ..." (RED 1.905 apart at the clip's end; GREEN 0.032, the drawn step
  across the hold's start 0.225 -- the snap gone). Early in the clip the page trails the room by up to one steer tick's
  travel (0.90 on `mp51_turret01`): its steer starts when the room's `turret` event reaches it, a tick after the room's
  began (the event carries no tick), and the reconcile's smoothing takes the gap up by the clip's end -- a finding, not
  this row's bar (the brief asked "through the clip within 0.25"; the event's lag makes that unreachable without the
  mount's tick on the wire: LATER 91, the online seat's, on `agent/online` 7f4b20a63). Part of the trail is not the
  lag but the order: the page steps its steer in the walk's post-tick callback, after the walker's move and its
  push-out (`Walker.pushOut`), where the room lays the steer's place again after the push-out -- up to 0.19 off the
  room's path mid-clip and 0.225 against 0.215 at the clip's end (T81-4's review F1, a scratch run on Crossroads, from
  12 behind); so the tick on the wire alone may not meet LATER 91's "within 0.25 through the whole clip" -- the page's
  steer place kept from the walker's push-out, as the room's, goes with it *(built 2026-10-17: LATER 91's page half,
  below; was "goes with it", owed)*. PB-2c's pin in `roomTurrets.test.ts` moved 2.43 -> 0.215 (its title retitled, the registry
  with it). **What another page sees:** through the
  steer's 16 ticks the room's snapshots carry the body through the turret's own hull (its base, 1.07 from the hold's
  place), so another page draws the body passing through it onto the gun, as the original's body does. Owed: capture B 13
  (a mount from behind, its last frames).
- **LATER 91, the page half: the order (2026-10-17, PARITY-2; reading, pending review).** No new value: the room's order
  is the reference (`room.ts`, the steer stepped before the command and its place, `seated`, laid again after the
  command's move -- the turret set restoring the unresolved move, `FUN_005483d0` D:L413908-413918,
  `TURRET_STEER_WALLS_READING`). The page steps its own steer in the walk's post-tick hold, after the walker's move and its
  push-out (`Walker.pushOut`: up to 2.26 a tick once the body is inside the turret's hull, from the clip's ninth tick on
  `mp51_turret01`). `turretPage.ts` `holdTick` now keeps the place the last tick's step laid and lays it again before
  the next step, so the push-out never reaches the steer's place, as the room's re-lay keeps it from the room's (was:
  stepped from the pushed-out place). It lays over the reconcile's nudges between two steps too (`net/client.ts`
  `applyCorrection`, up to 0.155 a tick here), as the hold's own `holdStep` lays its place each tick; keeping them would
  need the walker's place at the tick's start, which only `mover.ts` holds (`Walker.prev`, private; a hot file) -- the
  variant was measured (below) and is the seat's to take. No change after the clip, at the release, or for a resume
  mid-steer (`resumedAt`: no own steer). Test: `turretHold.test.ts` "LATER 91: through the mount clip the page's own
  steer starts each tick from the place its last step laid ..." -- a reference `SeatSteer` stepped from that place each
  tick of the clip: RED 0.177 off at most (the push-out from the ninth tick, the nudges before it), GREEN 0.0000 over
  the 16 steer ticks. The page-room distance per tick (the loopback, MP51 `mp51_turret01`, 12 behind; ticks 0-14 of
  the clip, then the hold's first):

  | | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 |
  |---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
  | before | 0.820 | 0.900 | 0.825 | 0.650 | 0.460 | 0.427 | 0.460 | 0.446 | 0.519 | 0.475 | 0.402 | 0.245 | 0.135 | 0.083 | 0.032 | 0.222 |
  | the order fix (built) | 0.820 | 0.900 | 0.928 | 0.790 | 0.609 | 0.551 | 0.532 | 0.493 | 0.419 | 0.315 | 0.230 | 0.119 | 0.058 | 0.039 | 0.012 | 0.215 |
  | the variant keeping the nudges (not built) | 0.820 | 0.900 | 0.825 | 0.650 | 0.460 | 0.427 | 0.460 | 0.446 | 0.395 | 0.297 | 0.222 | 0.114 | 0.057 | 0.039 | 0.012 | 0.215 |

  What the order removes: from the ninth tick, the push-out's share (0.519 -> 0.419 at tick 8, 0.032 -> 0.012 at the
  clip's end, 0.222 -> 0.215 at the hold's first tick, the room's own 0.215 from the hold's place). The start: built
  below *(was: "What remains is the start (LATER 91's wire half, the online seat's): the page's steer begins a tick
  after the room's, 0.82-0.90 apart in the first ticks; the built order also stops the reconcile from taking that gap up
  mid-clip (ticks 2-7 up by up to 0.15) ... The whole-clip bar stays red until the wire lands, and is not in the file")*.
- **LATER 91, the page half: the start (2026-10-17, PARITY-2; reading, pending review).** The wire is the online seat's
  (`agent/online-tick`, merged into this branch): the viewer `protocol.ts` `turret` event's `steer?: { ticks: number }`,
  on a mount's broadcast while the steer runs -- the steps the room's steer has run by the send, 0 from this room (its
  broadcast precedes the tick's commands, `resolveMounts` before `run`; pinned in `roomTurrets` "0 at the event, 1 after
  the tick"). `turretPage.ts`: `take()` dates a mount carrying it `at = now - (ticks + 1) / TICK_HZ` -- the send tick's
  own step counted; `resume.steer`, sent after the room has stepped, stays `ticks / TICK_HZ` -- and marks it `wired`;
  `holdTick`, on a wired mount, lays the place (the order above) and steps its own steer until `steered()` reaches
  `floor((now - at) x TICK_HZ + 1e-9) + 1`, the `+ 1` this tick's own step (the room steps the seat before the command
  the page's tick sends; `LATER91_TICK_OFFSET`, a port arithmetic over the room's order, no game value): its first hold
  tick takes two steps, each later one, one; the clip (`mounting`), its pose and the look's turn (`frame`) come off a
  tick earlier with it, on the room's tick. With no field (an older room, a room without the clips) the start is as
  before: dated at the event's arrival, one step a tick. The `+ 1` is pinned by the loopback: with `+ 0` the whole clip
  stays 0.928 at most. Tests (`turretHold.test.ts`, unit tests, disc-backed): "LATER 91: the page's own mover follows
  the room's through the whole mount clip" -- RED 0.928 at most, GREEN **0.000** at every tick of the clip and the hold
  (page-room per tick 0.000 from tick 0 to 23; was the "the order fix (built)" row above); "LATER 91: from a room that
  sends no `steer` ..." -- the steps 1 2 3 4 5 6 over the first ticks and the page 0.928 at most from the room, as
  before; the order's pin above holds with the catch-up's steps (the reference stepped as many times). T81-4's case: the
  clip's end 0.000 (was 0.012), the drawn step across the hold's start 0.215. In the loopback the reconcile has nothing
  to nudge through the clip (0.0000), so the order's laying over its nudges costs nothing **there** -- the loopback is
  lock-step, and the `+ 1` is fitted to it (the review: `ticks + 1` is the command the room steered before the event,
  the `+ 1` the page's current command; not a double count). **The gaps that remained (LATER 96; closed 2026-10-18 by
  its page half, below -- (1) to (3) built and measured with `simulate`; *was* "Not measured, and the gaps that remain
  (LATER 96, the online seat's row)"):** (1) **latency**, not clock drift (both readings are the page's own clock, and a 0.27 s clip
  drifts negligibly): on a real network the room steers every command the page sent before the event arrives, about
  RTT x 60 of them (6 at 100 ms, 9 at 150 ms), while `steer.ticks` is always 0 -- so **on a real network the page's
  own body trails the room's by about RTT x 60 steer ticks through the clip, the two meeting at the hold** (source
  inspection, not measured): the 0.000 above is the loopback's figure, not a match on a network, and the order's
  re-lay leaves nothing to correct the trail mid-clip (the review's F1, LATER 96); (2) the
  catch-up reads `now()` once per `holdTick` while a frame can run several ticks (`Walker.advance`): at 30 Hz every
  second command is a step off (up to about 0.9), at 144 Hz it jitters by one (F2); (3) the re-dating applies to every
  occupant, so another player's mount pose leads its drawn body (`INTERP_DELAY_MS`) by one tick more -- untested,
  harmless (F3). LATER 96's remedy: key the start on the command sequence, measured with `simulate` at 0-150 ms and the
  page at 30/60/144 Hz. Owed too: capture B 13 (a mount from behind, its last frames). (Was: "so the order's laying
  over its nudges costs nothing here ... a page whose clock runs off the room's (a real network) is not measured
  here"; LATER 91's review F1-F3, 2026-10-17.)
- **LATER 96, the wire half: the steer keyed on the command sequence (2026-10-17, the Online seat, TURRET-STEER-SEQ;
  reading, pending review).** No new game value: the room's own count and order (`room.ts`) put on the wire. The mount's
  `turret` broadcast (`resolveMounts`) carries, beside `ticks`, `steer.after` -- `Player.sim.seq` at the send, the room's
  command count for the mounting seat, in the numbers that seat's page sent (`NetClient.lastSeq()`'s). From the source:
  (1) The count is the highest command the room has run **or passed over** for the seat: each command `run` runs sets it
  (`p.sim.seq = cmd.seq`), a gap given up on after `GAP_WAIT` passes the lost numbers under the command run, and a backlog
  dropped (`dropBacklog`, `BACKLOG_BOUND_PLACEHOLDER`) moves it past commands none of which run; `Room.binary` ignores
  every command at or below it, so no command at or below `after` ever runs. It never falls (a spawn keeps it, `spawn`;
  a resume clears the queue, not the count), so `after` is monotonic per seat. (2) The steer steps once on each command
  the room runs above `after` (`run`: the step before the command's move) and on nothing else: a tick that runs no
  command runs no step; a command lost past the gap's wait or dropped from a backlog is never run, so never stepped; one
  arriving late at or below the count is ignored. A timed event's refusal -- 'stale' (`decide`), 'too many waiting'
  (`timed`), 'its command never ran' (`settle`) -- is a round, a reload, a throw or an order, not a command: it moves no
  step (the command it names ran, or did not, on its own). (3) The clip comes off on the 17th command run above `after`
  (its 16 steer steps, s7.1), and the hold places the body on each command after (`holdStep`). **When the page counted a
  command the room never ran** (its count ran ahead), the room is that many steps behind the page's steer through the clip
  and comes off that many of the page's numbers later (`after + 18` for one lost); the room tells the page nothing of
  it (a lost command has no event: the batch's redundancy and the gap's wait are its only cover), its snapshots carry its
  own place, and the two meet once both hold the body at the seat (the hold lays the same place each command); a release
  asked in that span is refused 'mounting' (`turretRequest`: the room's steer still runs, `FUN_00545ee0`'s first test,
  s7.2). *(LATER 104, 2026-10-18, below: judged on the page's numbering since, `TURRET_RELEASE_SEQ_ADAPTATION` -- a
  release past the page's own window is held while the room's steer runs and taken on the first command after its hold;
  was refused 'mounting' whenever the room's steer still ran.)* (4) `resume.steer` is unchanged, `{ ticks, toward }` with no `after` (a page resumed mid-steer runs no own steer,
  `resumedAt`); a parked seat's neutral commands (OT.R59, `parkedStep`) are numbered on from the room's count, and the
  resume re-bases the page on `resume.seq`. Additive: an older page ignores `after`; an older room sends none, and the page
  keeps LATER 91's dating. **Read by the page since 2026-10-18** (LATER 96's page half, below; *was:* "Sent, not yet used: no page reads `after` until the gameplay seat's page half lands (today's `turretPage.ts` reads `steer.ticks` alone and dates the steer by its clock), so LATER 96's lag is not fixed by this half"); the merge controller's word (2026-10-17): the wire half lands alone, on its own review, to free `room.ts`. Unsettled, not pinned: a seat no command of which has run yet (`synced` false) has the count it
  joined with until its first command (`run` lifts it to that command's number less one), so a mount resolved before any
  command ran would carry that lower count -- not reachable by a page that walked to the gun, named for the page half.
  Tests (`roomTurretTick.test.ts`, unit tests on the disc fixtures, Crossroads' `mp72_turret01`): "LATER 96: steer.after
  is the seq of the last command the room ran ..." (`after` the count at the send and the page's sent number less one;
  after command `after + k`, k steps, each moving the body; the hold on `after + 17`), "... monotonic per seat ...",
  "... a command the room never runs is never stepped ..." (one lost past the gap's wait, then late: no step and no move
  through the wait, the room one short of the page's count, its hold on `after + 18`), "... a timed event dropped mid-steer
  ('stale') is not a command ..."; `roomTurretResume.test.ts` pins `resume.steer` without `after`. RED 5 failed, 2 passed
  (7); GREEN 7 passed. The page half (keying `turretPage.ts` on its own commands above `after`, the latency bar of the
  brief) is the gameplay seat's. *Was:* the mount's broadcast carried `steer: { ticks }` alone (0 from this room), and the
  page dated its steer on its own clock at the event's arrival (LATER 91's wire half, above).
- **LATER 96, the page half: the own steer keyed on the command sequence (2026-10-18, PARITY-2; reading, pending
  review).** No new game value: the room's count and order (the wire half, above; `room.ts` `run`) laid on the page.
  `turretPage.ts`: `take()` keys this page's own mount on `steer.after` (`MountMark.after`); `holdTick` steps its own
  `SeatSteer` once on each command this page sends above `after` (the command a hold tick precedes is
  `NetClient.lastSeq() + 1`, so `seq - after` steps due by the tick's end) -- one a command however many ticks a frame
  runs, and behind that count at most `TURRET_CATCHUP_STEPS_ADAPTATION` (2) a command (the fold below; *was* "at the first
  tick after the broadcast at once for every command already sent above `after`") -- and takes the clip off on the 17th
  step, the hold placing the body that same command (the room's `seat.step` true, then `holdStep`). No clock in that path
  (F2 gone); the look's turn (`frame`), the clip's key and its end in the pose (`turretPose`) follow the count (*was*: the
  key read off a clip start re-dated once at the catch-up). **The wire review's N2:** the
  room ran the commands above `after` mounted (`onTurret` strips the stick) while this page ran them walking before the
  broadcast came, so the catch-up restarts from the body as it was at `after` -- each command's end place on the page's
  own mover kept by its number (`TurretPage.trail`, the last `SEQ_TRAIL` = 10 s at `TICK_HZ`, the net client's own
  history; a port bound, no game value) -- and replays the steer over the commands since. No hot file needed: the steer's
  move is laid on the place with no collision (`TURRET_STEER_WALLS_READING`) and the room lays it again after each
  command's move, so the place at `after` and the count are the room's whole path (the reconcile's replay, which
  re-simulates the look alone, `net/client.ts` `reconcileFacing`, is not needed for it). **F3:** only this page's own
  mount is re-timed; another occupant's mount is dated at the event's arrival, as before LATER 91 (its body drawn off the
  snapshots behind the room), whether the broadcast carries `ticks` alone or with `after`. **`LATER91_TICK_OFFSET` kept**
  for the `ticks`-only path (a room between LATER 91 and LATER 96: `after` absent), where it still dates the mount; with
  no `steer`, the arrival's start as before. **A lost command:** the room passes it over unrun, a step behind the page's
  steer, its clip off one of the page's numbers later (`after + 18`); a release asked in that span is refused 'mounting'
  (`turretRequest`), and the page -- which predicts no release, only the room's `turret` event releases it -- stays
  mounted and locked and may send it again: measured, no change needed. *(Superseded by LATER 104, 2026-10-18, below:
  the page predicts its release past its own window and the room takes it on the first command after its own hold.)* Tests (`turretHold.test.ts`, unit tests,
  disc-backed MP51 `mp51_turret01`, 12 behind on the gun's line; the tree's latency injector `NetOptions.simulate` on
  fake timers, the page's frames at 30 / 60 / 144 Hz and the room's steps at 60 on one clock; the page's body after each
  command it sent against the room's after the same command, from the first it sent knowing of the mount through
  `max(after + 20, first + 10)`): the twelve cases RED then GREEN as first built, page-room at most (at every command;
  since the fold below, 0.000 from the page's own hold, the compressed clip trailing the room before it) --

  | one way | 30 Hz | 60 Hz | 144 Hz |
  |---|---|---|---|
  | 0 ms | 1.064 -> 0.000 | 1.064 -> 0.000 | 1.064 -> 0.000 |
  | 50 ms | 4.017 -> 0.000 | 3.394 -> 0.000 | 5.033 -> 0.000 |
  | 100 ms | 5.982 -> 0.000 | 5.905 -> 0.000 | 6.990 -> 0.000 |
  | 150 ms | 6.150 -> 0.000 | 6.150 -> 0.000 | 7.153 -> 0.000 |

  (the page first knew of the mount at `after + 1..3` at 0 ms, `+ 7..8` at 50, `+ 13..14` at 100, `+ 19..20` at 150 --
  past the room's clip, which is off on `after + 17`; the 0 ms cases fail before the fix because this rig steps the room
  after the page's frame on the same clock, so the clock's dating took one step too many -- F2's sensitivity). "walked
  toward the gun before the event" (100 ms, 60 Hz; 5.287 walked over `after + 1..12`): 3.165 -> 0.000; "one command
  lost" (50 ms; lost at `after + 5`): the release on the page's second hold command refused 'mounting' once, the page
  mounted and locked, page-room 0.000 over the hold's `after + 19..30`, the release sent again taken; its control (nothing
  lost): the same release taken. *(LATER 104, 2026-10-18: the pin flipped -- the same release taken on `after + 19`, the
  first command after the room's hold, the page predicting it at the press, page-room 0.080 at most through it; was
  refused 'mounting' once.)* The loopback's whole-clip case is kept at 0.000 both ways (`ticks` and `after`: LATER
  96's start; `ticks` alone: LATER 91's). `turretPage.test.ts` "LATER 96 (F3): ..." (unit, no game data): another
  occupant's clip frame at the arrival 1.502 -> 0. **Found, not this row's:** the release on a network (LATER 104) -- the
  room releases at once and its next command's walk leaves the hold's place (`TURRET_DISMOUNT_PLACE_READING`), while the
  page holds its body there until the broadcast lands: in the lost case 2.431 apart for six commands, then the
  reconcile's smoothing (logged, not pinned). *(Was, as first built and found by its review: "at the catch-up the page's
  own body moves at once from where the page walked or stood to the room's path (8.4 at 150 ms from 12 behind: the room's
  clip already off) -- the room's place, a round trip late"; folded below.)* Owed too: capture B 13. *Was* (LATER 91's start): the page dated its own steer on its clock at the broadcast's
  arrival, `(ticks + 1) / TICK_HZ` back, and stepped it by the clock -- on a network about RTT x 60 steer ticks behind the
  room through the clip, every occupant's pose re-dated.
- **LATER 96, the page half's fold: the catch-up spread, the drawn body measured (2026-10-18, PARITY-2; reading, pending
  review).** The review (FAIL, high) found the drawn own body snapping: the catch-up took every step due in one tick. Its
  probe (scratch, the rig above at 60 Hz, `walk.drawnFeet()`): *was*, as first built, the largest drawn step a frame and the
  own mount-clip frames drawn 1.340 / 15 at 0 ms, 4.300 / 12 at 25, 5.737 / 10 at 50, 8.138 / 4 at 100, 8.449 / 0 at 150
  -- from about 140 ms one way the own clip was never drawn (straight to `seal_turret_poses`) and the look turned the whole
  count in one frame -- against LATER 91's clock start 2.376 / 14 at every latency. **F1, built:** `turretPage.ts`
  `keyedStep` takes at most `TURRET_CATCHUP_STEPS_ADAPTATION` steps on a command (a labelled browser adaptation, no game
  value: the original has no network between the console and its actor); the pose's key and the look's turn follow the
  page's own count, so the clip plays compressed, and the page meets the room on the way or at its hold, which places both.
  **K by measurement** (60 Hz, 0 / 50 / 100 / 150 ms one way; the drawn step's bar 2 x 1.064, the room's largest steer
  step on `mp51_turret01` from 12 behind; the page's hold as `after + n`, the room's on `after + 17`; the end-of-command
  distance from the page's hold, F2 below):

  | K | drawn step | own clip frames | the page's hold | end of command |
  |---|---|---|---|---|
  | 1 | 1.122 / 1.321 / 1.344 / 1.321 | 16 / 16 / 16 / 16 | + 18 / 23 / 29 / 35 | 0.036 / 0.045 / 0.214 / 0.371; seam not run |
  | 2 | 1.340 / 2.099 / 2.310 (no seam; 2.099 with it) / 2.099 | 15 / 10 / 8 / 8 | + 17 / 17 / 21 / 27 | 0 / 0.215 / 0.613 / 0.605; with the seam 0.000 at all four |
  | 3 | 1.340 / 2.755 / 2.962 / 2.755 | 15 / 10 / 5 / 5 | + 17 / 17 / 18 / 24 | 0 / 0.143 / 0.730 / 0.611; seam not run |
  | all (as first built) | 1.340 / 5.737 / 8.138 / 8.449 | 15 / 10 / 4 / 0 | + 17 / 17 / 17 / 19 | 0 / 0.182 / 0.998 / 0.611 (the seam's dep absent) |

  K = 1 meets the drawn bars but loses LATER 91's loopback start (0.928 through the clip: its first tick owes two steps),
  leaves the page's clip on when the lost-command case's release goes (`after + 18`), and converges 12 to 18 commands
  after the room's hold at 100-150 ms; K = 3 steps up to 2.962 in a frame (over 2.128) and draws the clip 5 frames. **K =
  2 taken:** the largest K within the drawn bar (with the seam), converging 4 and 10 commands after the room's hold at 100
  and 150 ms (none at 0 and 50). **N = 8** (`N_CLIP_FRAMES_AT_60`, the test's): the clip's 16 steer steps at two a command
  take at least 8 commands, drawn on the frames before the 17th step's -- measured 8 at 100 and 150 ms at 60 Hz (10 at 50,
  15 at 0: the base's 14 compressed, never skipped), scaled `8 x hz / 60` at another rate (4 at 30 Hz, 19 at 144). GREEN
  (the seam wired), the drawn step and the clip frames per rate at 0 / 50 / 100 / 150 ms: 30 Hz 2.795 / 3.783 / 3.783 /
  3.783 (bar 4.255, two ticks a frame), 7 / 5 / 4 / 4; 60 Hz 1.340 / 2.099 / 2.099 / 2.099 (bar 2.128), 15 / 10 / 8 / 8;
  144 Hz 0.443 / 0.875 / 0.875 / 0.875 (bar 2.128), 38 / 21 / 19 / 19; page-room 0.000 from the page's hold at the hold
  tick in all twelve and at the command's end 0.000 (0.035 at 50 ms, 30 Hz). **F2 (the drawn frame's end):** the mover
  after the tick's `applyCorrection` (`net/client.ts`) is the hold tick's place plus the reconcile's nudges: the catch-up's
  differences from the room (the walked commands of N2, the compressed clip's) are compared at their acks and nudged in
  after the hold -- 0.613 / 0.605 at 100 / 150 ms (60 Hz), the 2.310 step above. **The `replayed?(after)` seam, taken on
  the page:** `TurretPageDeps.replayed`, called on each command the page runs behind the room's count, marks the commands
  above `after` as re-run (`NetClient.replayed`, public since PAR-37: their predictions not compared), so the reconcile
  has nothing to nudge -- 0.000. `matchActions.ts` wires it (`replayed: (after) => d.net()?.client.replayed(after)`, the
  one line cleared by the online seat as quoted; `netClient.test.ts` "NetClient.replayed ... (PAR-37, LATER 96)" pins
  the method, a pin of an existing one). The "without the replayed seam" cases still pin a page with no `replayed`
  dependency (the end above 0.25 at 100 and 150 ms). (Was: "`matchActions.ts` does not wire it yet (a hot file: the
  one-line hunk reported to the online seat); until it does, the page runs as the 'without the replayed seam' cases
  pin".) **F3 (named, not built):** `trail` keeps the mover's place at each command's end, not the net client's
  prediction there (its history's feet plus the correction still to spread, `net/client.ts` `tick`): a correction pending
  at `after` starts the replay off by it; no hook outside the hot files carries the prediction (the net tap is the client's
  own), and none was pending at `after` in these runs. **Walked toward the gun** (100 ms): page-room 0.000 from the
  page's hold at the tick and the end; the restart's drawn step smoothed (the walked restart, below; *was* "the restart
  from the body at `after` is a drawn step of 4.336 (the page walked 5.287 before the broadcast; N2's own, not the grid's
  bar)" -- the re-review held the grid's bar to it: walking up to the gun and mounting is the common path). The
  lost-command case and the loopback's 0.000 (both starts) kept.
  Tests (`turretHold.test.ts`, unit tests, disc-backed MP51): the grid's twelve cases, two cases without the seam, the
  walked and lost cases -- RED on the page half as first built 12 failed of 26 (the drawn step 5.737 / 8.138 / 8.449 at 50 /
  100 / 150 ms, 60 Hz; the clip 4 and 0 frames at 100 / 150; walked 0.559 at the end), GREEN 26 of 26.
- **LATER 96: the walked restart smoothed on the drawn body (2026-10-18, PARITY-2; the fold's re-review, FAIL high on
  the walked case; reading, pending review).** The catch-up restarts the simulated body at its place at `after` (N2): a
  page that walked toward the gun before the broadcast came is put back as far as it walked in a round trip, and the
  drawn body showed that jump -- the largest drawn step (`walk.drawnFeet`) at 60 Hz *was* 2.099 / 4.336 / 4.286 at 50 /
  100 / 150 ms (walked 1.354 / 5.287 / 5.287), against LATER 91's clock start 1.941 / 1.375 / 1.406 (the reviewer's
  scratch logs). **Built, drawn only:** `mover.ts` `Walker.drawOffset`, an offset of the drawn feet from the simulated
  ones, drawn between the last two ticks' values as the feet are (`drawnFeet`; nothing simulated reads it -- `state`,
  `tickFeet`, the shot's eye -- and a placing clears it); `turretPage.ts` `holdTick` adds the restart's jump to it (the
  place before the restart less the place at `after`) and shrinks it toward nothing by
  `TURRET_CATCHUP_DRAW_DECAY_ADAPTATION` (1 unit a tick, a labelled browser adaptation, no game value: the original has
  no catch-up to hide, no smoothing of its own to cite) -- the simulation exactly as before: the restart, the capped count,
  `own.laid`, `replayed` and the hold. The jump is the restart's alone, not the tick's catch-up steps (the brief's "less
  the place after this tick's capped steps", measured first: the steps then held back and let go on top of the steer, the
  grid's drawn step 3.098 at 50-150 ms at 60 Hz, over its 2.128; the restart's own jump leaves the grid's figures as they
  were). **The rate by measurement** (the walked cases' largest drawn step at 50 / 100 / 150 ms, 60 Hz; the offset at the
  page's hold): 0.5 a tick 1.698 / 1.698 / 1.698, 1.287 left at the hold (fails); **1 a tick 1.377 / 1.364 / 1.364, gone
  by the hold**; 2 a tick 1.699 / 1.266 / 1.340, gone -- 1 the lowest worst case. GREEN, the walked case's largest drawn
  step (bar two of the room's largest steer steps a tick: 4.255 at 30 Hz, 2.128 at 60 and 144) at 50 / 100 / 150 ms:
  30 Hz 2.374 / 2.217 / 2.217 (*was* 3.783 / 4.336 / 4.238), 60 Hz 1.377 / 1.364 / 1.364 (*was* 2.099 / 4.336 / 4.286),
  144 Hz 0.615 / 0.568 / 0.615 (*was* 0.875 / 1.807 / 1.747); page-room 0.000 from the page's hold at the tick and the
  command's end; the grid's twelve, the two without the seam, the loopback and the lost-command case unchanged. **The
  simulation untouched, pinned:** the walked case run twice (100 ms, 60 Hz), the page's hold handed the walker and then a
  bare mover over the same state (no offset to set) -- the hold tick's place and the command's end at every command and
  the own clip at every frame identical; the largest drawn step 1.364 with the smoothing, 4.336 without. **The camera on the
  drawn feet** (`walk.ts` `follow()`, the merge controller's clearance of the hunk as quoted; the claim in HANDOFF §3):
  the third-person view's eye, target and aim (`drawnFar`) shift by the whole drawn offset (`Walker.drawnFeet` less
  `tickFeet`: MISSION R8's height in the air, this offset on the ground), the head's eye taken at the drawn feet whenever
  they differ; the shot's eye (`placed`, `fireAim`) stays on the simulated feet. The walked case's largest camera step a
  frame (`fly.pose()` after `placeView`, 60 Hz): 100 ms 4.336 -> 1.364, 150 ms 4.286 -> 1.364 (bar 2.128) -- the body's
  1.364. *(Was: "Not reached, a hot hunk owed: the camera. `walk.ts` places the third-person camera on the simulated
  feet ... so the body is drawn smoothed while the camera still steps the restart (4.3 at 100-150 ms, walked); the hunk
  ... is reported to the online seat, not written".)* Pinned (`walk.test.ts`, unit, no game data): with no offset the
  drawn view and the aim are the placed ones on the ground and lifted by the drawn height alone in the air, value for value
  as before; with an offset they move by it and the shot's eye equals a twin's without it. **The adaptation's known
  cost, bounded:** the third-person wall pass (`PlayerCamera.tick` -> `cameraPass`) runs at the simulated feet, so the
  shifted view can stand past the pass's clear point -- by at most the drawn offset's size each frame (now or the tick
  before), so at most the restart's jump (5.287 in the walked case at 100-150 ms), falling 1 a tick to nothing, at most
  the last tick's 1 on the hold's frames and none after (measured in the walked case at 100 and 150 ms: the drawn view off
  the wall-passed one 5.287 at most, 0.000000 over the bound, 0.000 on the hold's frames). Measured beside geometry too
  (the re-review, 2026-10-18, a scratch rig over the disc's maps -- not a browser run): the drawn view's line cast against
  the camera surfaces each frame, all four MP51 turrets and both MP72 ones approached from -30 to +30 degrees at 12 and 8
  units, 100 ms one way, 60 Hz -- about 100 approaches, over 7,000 frames: one frame with the drawn eye past geometry
  while the simulated eye was clear, 0.152 units (mp51_turret04, 30 degrees, 8 units). The shifted view is the camera a
  moment earlier carried on, its boom back along the path just walked -- open ground. (Was: "A bound on the shift, not a
  measure beside a wall: how far into geometry a given turret's surroundings let it go is under that bound.") Tests: `turretHold.test.ts` "walked toward the gun ..." (nine
  cases, 50 / 100 / 150 ms at 30 / 60 / 144 Hz; RED on b10b47eb3 3 failed -- 4.336 at 100 ms 30 and 60 Hz, 4.286 at 150
  ms 60 Hz) and "... the simulation and the pose are the same with and without the drawn smoothing"; `walk.test.ts`
  "LATER 96: the walker drawOffset is drawn only" and "LATER 96: the camera on the drawn feet (walk.ts follow())" (unit, no game data); `turretHold.test.ts` "walked, 100 / 150 ms one way, 60 Hz: the camera's drawn view steps within the bar a frame" (RED on 562ef0e61 4.336 / 4.286; GREEN 1.364, the shift's bound with it).
- **LATER 104: the own release on a network (2026-10-18, PARITY-2; reading, pending review).** The mirror of LATER 96 at the
  dismount (LATER 104's row). *The original* (source inspection): the release `FUN_00545ee0` (D:L411941-412028) writes
  nothing of the actor's place, plays `.RELEASE_TURRET` (D:L411968-411971) and pushes the mount clip reversed
  (`FUN_005a6eb0` D:L462136-462170) on the press's own frame, on the console whose actor it is; its first test refuses it
  while the mount clip plays (D:L411954-411966). The reversed clip runs in the turret anim set until its end returns the
  set (`FUN_00582540` D:L443143-443150), so the walls' resolution is written back through it (`FUN_005483d0`
  D:L413908-413918) and the clip's root velocity likely carries the body back -- LATER 109's, not built here.
  *The port before* (measured headless with LATER 96's `netRig`, MP51 `mp51_turret01`, the dismount at `after + 40`): the
  room released at the dismount's arrival -- before the dismount's own command or the next by its queue (dseq + 0 at 50-150
  ms 60/144 Hz, + 1 at 30 Hz and 0 ms) -- and its next command's push-out (`Walker.pushOut`, 2.431 off the turret's hull)
  moved the body, while the page held it on the hold's place, locked, until the room's event a round trip later: 2.431
  apart, then the reconcile's corrections overshooting by as much again -- 17 / 29 / 41 commands over 0.25 at 50 / 100 /
  150 ms (60 Hz), the drawn step up to 2.836. **Built.** `TURRET_RELEASE_SEQ_ADAPTATION` (s4; a network adaptation):
  - *The room* (`room.ts`): a dismount is kept (`Player.dismount`) and taken before the first command above its `seq` the
    room runs (`run` -> `takeDismount`, before the command's steer step and hold; a parked seat's neutral commands too),
    not at its arrival. Refused 'mounting' iff its `seq` is below the mount's window end (`Player.seatOff`: the broadcast's
    `after` + `SeatSteer.ends`, the 16 steer steps and the hold's command -- the command on which the page's own keyed clip
    comes off, LATER 96), and the occupant told: its own `turret` event with `refused: 'mounting'` (protocol, cleared by
    the online seat), on no other event and to no other page. The merge controller's ruling (b): while the room's own steer
    still runs (a command lost mid-steer) a dismount past the window is held -- the steer runs to its end, the hold places
    the body on its command -- and taken on the first command after the hold, never on the hold's own. One pending a seat:
    a later ask replaces it when the pending one would be refused, or when both are past the window and the later names an
    earlier command; else the pending one stands -- a seq claimed ahead delays only its own release (a million ahead never
    releases on its own, and a sane ask after it replaces it), a stale one is taken on the next command the room runs, a
    press repeated neither doubles the release nor counts a second drop. Cleared at the release, the mount, a spawn and a
    resume.
  - *The page* (`turretPage.ts`): `action()` sends the dismount, then -- its own clip off by its own count (`keyedStep`'s
    `off`; or a welcome's mount) -- predicts the release (`predictRelease`): the hold let go (`setHeld(null)`: the lock,
    the HUD's box, the trigger, the hold's place from the next command), `.RELEASE_TURRET` and the reversed clip from the
    press. The room's event answers it (no second sound, no clip restart); a rounds tell naming this page still the occupant
    changes nothing; a told refusal undoes it (the mount put back, held and locked, the hold placing the body again).
    `frame()` leaves the predicted gun where its aim left it. A clock-dated or arrival-dated mount predicts nothing (as
    before). `SeatSteer.ends` (`net/emplacement.ts`): `mountSteerTicks` + 1.
  - *Measured* (`turretHold.test.ts`, "LATER 104: ...", the grid; unit tests, disc-backed MP51): page-room from the
    dismount through 60 commands 0.000 at the hold tick at every case, at the command's end 0.000 (0.001 at 50 ms, 30 Hz)
    at 0 / 50 / 100 / 150 ms and 30 / 60 / 144 Hz; the drawn step 2.431 at 30 and 60 Hz, 1.013 at 144 Hz -- the room's own
    move that command, the push-out off the hull at 0 ms too (LATER 109's), no network snap. The lost-command pin (above):
    taken on `after + 19`, page-room 0.080 at most. RED on the lane at 623aadd43: the grid 12 failed of 24 (2.431 apart at
    50-150 ms; the drawn step 2.836 at 50 ms 30 Hz, 100 ms 60 Hz, 150 ms 30 Hz), the lost pin and its control (the page
    predicted nothing); `roomTurretTick.test.ts` "LATER 104 (the abuse cases)", "ruling (b)", "(a)" seq + 1,000,000, "(b)"
    a stale ask, and "`refused` is on no mount broadcast ..." 5 failed; `roomTurrets.test.ts` "LATER 104: a dismount is
    taken on the first command above its seq ..." 1 failed; `turretPage.test.ts` "LATER 104: ..." 3 failed (the in-window
    case held already). GREEN: all of them. Seven `roomTurrets.test.ts` pins re-expressed for the command (one step to
    the release; the feet at the release's broadcast, before that command's move); `roomTurretAmmo.test.ts` unedited and
    green. Owed: capture B 13 (a dismount's frame and the body after it).
- **LATER 109: the release's reversed clip (2026-10-18, PARITY-2; reading, pending review).** LATER 104 found the room's
  release followed by the walk's push-out (2.431 off the turret's hull on the release's command, at 0 ms too). *The
  original* (the read, source inspection and the disc through the repository's readers): the release (`FUN_00545ee0`
  D:L411941-412028) writes no place and pushes the hand's mount clip reversed (`FUN_005a6eb0` D:L462136-462170 ->
  `FUN_0028c160` D:L134080-134097: the reversed bit, the direction -1, the phase at the end e = 25/26); the new play has no
  record (`FUN_0028dc90` -> `FUN_0028cc10` D:L134518), so no steer runs and the root's velocity is not zeroed
  (D:L439092-439106). The end test is the forward mount's mirror (`FUN_0028c6e0` D:L134283-134308: the stored phase less half
  a game frame's step under 0), so the reversed clip runs 16 ticks at 60 Hz (8 at the game's frame), its last at key 0.964,
  and the 17th returns the set (`FUN_00582540` D:L443143-443150 -> `FUN_0058c350`, the previous set's `Stand`). **(a) Walls
  off** through the 16: `+0x528` is still the turret set and the clip, not the hold's `Stand`, is on top, so `FUN_005483d0`
  writes the unresolved displacement back (D:L413908-413912) and integrates it (D:L413914-413918); the cell push
  (D:L413920-413941, `TURRET_HOLD_PUSH_READING`) unread as before. **(b) The travel**, traced in full: the actor's vtable at
  0x6691a0 (the ELF's words) holds `FUN_00550ef0` at `+0x18`, `FUN_005506a0` at `+0x20` and `FUN_0054d9a0` at `+0x28`, each
  address once in the ELF; `FUN_00550ef0` sets `DAT_0064fc80` = 1 (D:L418170), asks the end test (D:L418193), runs
  `FUN_0057a330` (D:L418454) -- the advance (D:L438901), the key (D:L438909), the root's velocity into `+0x2c` (D:L438910;
  `FUN_0028c250` D:L134145-134181 x -1; `FUN_00289bb0` D:L132691-132754), x 1 (D:L438985) -- then vfunc `+0x28`:
  `FUN_0054d9a0` turns it by the body's orientation (D:L416479-416490, D:L416515) into `+0xf44` x dt (D:L416520), skipping its
  own `+0xf54` write in the turret set (D:L416562); `FUN_005506a0` -> `FUN_005483d0` (D:L417825) integrates it as in (a). On
  the disc's clip: (-0.062, 3.165) in the body's frame at 60 Hz, at most 0.480 a tick (the 9th); (-0.045, 3.163) at the game's
  frame -- `TURRET_RELEASE_TRAVEL_READING`. **(c) The stick**: no walk motion can be pushed in the turret set (its four types
  and its `GLOBAL` include hold none: deaths, flinches, jumps, climbs, ladders, slides; `animset.rdr` through the repository's
  reader; `FUN_00588bc0` D:L446077-446081 refuses a type the set's table lacks, `FUN_005e3d90` D:L495844-495884), and a player's
  controller writes no `+0x198` / `+0x1a4` (added D:L416463-416467 -- the brief's D:L416457-416460 is the play's angular add --
  and D:L416516-416519; written only by `FUN_00598280` D:L454816-454819's zeroing and an AI controller's follow `FUN_0056fd00`
  D:L433164-433167, the vtable 0x6693f0's slot `+0x10`, where the player's 0x6694b0 has `FUN_00596f10`): so the stick moves
  nothing through the clip; its first walking tick, the 17th or the 18th, is `TURRET_RELEASE_STICK_PLACEHOLDER` (the
  controller's call). *The port before* (a headless scratch on Crossroads' two turrets and Vigilance's four; the LATER 104
  harness, disc-backed): the room's release command moved the body 2.431 (2.433 on `mp72_turret01`) straight back -- the
  walk's push-out, `BODY_RADIUS` 3.5 against the hull 1.07 off the hold's place -- then nothing, and a stick held back walked
  it from the next command; the own page drew the reversed clip over feet that jumped 2.431 in one frame (60 Hz; 1.013 a frame
  at 144 Hz). **Built.** `net/emplacement.ts` `ReleaseTravel` (`ends`, `step`, `key`; `releasePlayedOut`): each step minus
  `mountRootVelocity` at the reversed phase, turned by the body's yaw, x dt, laid through `steerMove` with no collision; the
  17th the end test's, nothing moved. `room.ts` (cleared by the merge controller as drafted; the re-cut adds the clears the
  call named and holds the stick on the 17th by a flag taken before the step): `Player.release`, set by `takeDismount` (the
  press's release alone; a death, a leave, the knock and the round's start carry the body nowhere), stepped before each
  command as the seat's steer, its place laid again after the command's move, the command's stick held through the 17th;
  cleared at its end, a spawn, the resume (`handBack`), a death and a mount (`FUN_005a6fc0` D:L462179-462190 admits a mount
  over the reversed clip). `turretPage.ts`: `predictRelease` starts the own travel on its `mountShape` (none without it, as
  the room without the clips), `releaseTick` (in `holdTick`) lays the last step's place, the first from the dismount's own
  command's (`trail`), and steps it on each command above the dismount's `seq`, turned by the yaw the mover held before this
  tick's move (the room's step comes before the command's); the walk's lock kept through the 17th (`setHeld`), let go after
  it; a told refusal, a welcome or a new own mount ends it. *Measured* (unit tests, disc-backed): the room on MP72's two
  turrets on the read law's path within 1e-3 at every one of the 16 commands, at most 0.481 a command, 3.165 back after 16;
  the stick held back moves nothing through the 17th and walks from the 18th; on `mp72_turret01` the travel ends inside the
  sandbags' 3.5 and the 17th's push-out moves it (0.205 by the read's scratch) once, then it stands, walks and mounts again;
  MP51 `mp51_turret01` at 0-150 ms one way and 30/60/144 Hz (`turretHold.test.ts`, the twelve cases): page-room 0.000 at
  the hold tick and at the command's end in all twelve, the room's body 3.166 back after 16 commands (was 2.431), the drawn
  own body's largest step a frame 0.939 / 0.480 / 0.200 at 30 / 60 / 144 Hz against the read's tick travel 0.962 / 0.481 /
  0.481 (was 2.431 / 2.431 / 1.013, the push-out); LATER 96's lost-command case page-room 0.004 at most (was 0.080), its
  lock now held at the press and let go after the end's command (two pins re-expressed). **What another page sees:** the body drawn from the room's snapshots gliding about 3.2 back from the gun over the
  reversed clip (0.27 s), not jumping 2.4 at once. **Open (capture B 13, a dismount filmed):** the body's path back (about
  3.17 over about 0.27 s, through nothing, then standing); with the stick held, the frame the body first walks
  (`TURRET_RELEASE_STICK_PLACEHOLDER`); with the look turning, whether the body turns during the clip; the frames from the
  press to standing (where the release's push falls in the game's frame).
- **LATER 109: the review's fold (2026-10-18, PARITY-2; reading, pending review).** A fresh review re-read the transcription at
  the source (confirmed) and FAILED the room on two blocking findings, with three low ones; all folded, `room.ts` and
  `matchActions.ts` hunks cleared by the merge controller. **F1:** a knock during the travel was overridden (the travel's
  place laid back each command, its steps zeroing the knock's velocity); the original's knock pops the clip stack
  (`FUN_0057e770` -> `FUN_0058a4d0` D:L440997) and zeroes the root's velocity under the knock's flag (D:L438987-438994):
  `layKnock` clears `Player.release` when the knock is laid, the page ends its own travel on the `blast` carrying it (sent
  to the knocked body alone). **F2:** the room had stripped only the stick. Read: the jump is refused under the turret set
  (`FUN_005b4340(actor, 0xb)` D:L469466-469475, asked D:L453211-453213, D:L440806-440807), the lean too (`FUN_005b4340(actor,
  1)` -> `FUN_00587c20` D:L469345-469346; NoInterrupt 1 on the mount clips, D:L445549-445564), a climb or ladder (action 2,
  the same test); the stance is KEPT PENDING in the original (`FUN_00552ec0` D:L418927-418930; `+0x374` asked each tick,
  `FUN_00552d60` D:L418875) -- stripped by the port, its deferral owed; the swap, doors and pickups unsettled. Named
  `TURRET_RELEASE_ACTIONS_PLACEHOLDER` (strict): the room takes the jump, the stance, the leans and the swap off the
  commands (`RELEASE_HELD_BUTTONS`), refuses the climb's offer (`climbLock`), and drops a door, a switch's action, a throw,
  a bomb action, a hostage order, a pickup and -- the controller's call, the mount clips carrying `NoFire` (`motion.rdr`),
  its test on a reversed play unread -- a rifle claim 'releasing' (`releaseRefused`); the page holds its trigger through the
  clip (`TurretPage.travelling`, `matchActions.ts` `trigger`, as a dance's: taken until let go). A remount over the
  reversed clip stays allowed in the room (`FUN_005a6fc0` D:L462181-462190); the page offers none during the travel (its
  walk lock) -- owed (**F4**). **F3:** the own death ends the own travel (the `kill` naming this page). **F5:** the refusal's
  pin now watches every place laid on the tick after a told refusal (red with the clear removed: `[false, false, true]`).
  *Measured* (unit tests, disc-backed where said): the room on MP72 (`roomTurrets.test.ts`, 41 of 41): a knock on the clip's 5th command carries the body over 1 to its right in 6 commands (was 0.152, laid back on the travel's path); a jump, a stance, the leans, the Action and a swap on each of the 17 commands leave the path, the stance, the jump count, the weapon, the peek and the airborne flag as the clean release's on both turrets, no climb behind `mp72_turret01` (was: a jump on the first); a door mid-clip dropped 'door: releasing' (was taken); a rifle claim mid-clip dropped 'fire: releasing' with no shot told, the same claim after the clip fired (`mp72_turret02`; was taken). The page (`turretPage.test.ts` 45 of 45, no game data): the own knock and death end the own travel (were laid back on it). `matchActions.test.ts` (28 of 28, no game data): a press from the dismount through dseq + 17 is the release's, held until let go, a fresh press after the firearm's (was the firearm's at once). MP51 `mp51_turret01` (`turretHold.test.ts` 73 of 73, disc-backed), unchanged by the fold: page-room 0.000 in all twelve cases, the room's body 3.166 back after 16, the drawn step 0.939 / 0.480 / 0.200 at 30 / 60 / 144 Hz. No assertion changed in the fold; no browser look, no capture.
- **LATER 124: the mount at its own command (2026-10-19, PARITY-2; reading, pending review).** LATER 116 decided a door,
  a switch's action, a bomb drop and a pickup at their own command; the mount was still taken at the first step after its
  arrival, its command run or not -- so a door at S and a mount at S + 1 arriving together with the room behind had the
  door's command run with the body already mounted ('door: mounted'), and `steer.after` could fall below the mount's own
  seq. *The original* (source inspection): the press `FUN_00546210` runs its gates on the console's own actor at the
  press's frame (D:L412044-412073: the turret unoccupied, `+0xc0`; no turret held, `+0xeb8`; neither mount clip playing,
  `FUN_00577e40`; `+0xe1`, `+0xeac`, `FUN_00588030`) and, offline, mounts on that frame (D:L412075-412076). Online (the
  flag `DAT_0045a0c1`, s7.1's reading) it asks the network library for the turret object instead (`FUN_002c79f0`
  D:L167867-167869, through `FUN_0030d010`), and the mount runs on every console, the asker's included, when the object's
  new owner arrives (`FUN_002c7d00` D:L168016-168019). So the gate's frame is the asker's own press -- which the room's
  judging at the ask's own command reproduces for an honest page -- and the take's timing is the network's: dating it to
  the command is the network adaptation `ASK_AT_COMMAND_ADAPTATION`, as LATER 104's dismount is
  `TURRET_RELEASE_SEQ_ADAPTATION`. Unread: how the library chooses between two consoles asking at once (`FUN_00623590`
  onward; what `FIRST_REQUEST_WINS_READING` stands for). Found, not built (not this row's): the original's client asks at
  most once per 2000 of the manager's clock (`FUN_0030d550`'s `+0x100`, its unit unread; D:L167867-167869), where the
  page re-sends a mount on every press (LATER 137, s7.10: its unit read, milliseconds; built).
  **Built** (the merge controller's design (B), cleared by the online seat; `room.ts`): `resolveMounts` takes a queued mount
  only at the first step's top after the command it names has run (`sim.seq` at or past its `seq`), else leaves it queued
  -- PF.R28's lower seat id among the mounts taken at one step's top; `steer.after` the room's count at the take (at or
  past the mount's seq). `MountAsk` carries `at` (the arrival's tick) and `staleAt` (the room's count then): the stale
  bound is judged at arrival, as before, so a stall's burst and a dropped stretch refuse no honest mount (judged at the
  take, a mount pressed in a 300 ms stall's 18-command burst was refused 'stale': the controller's ruling). A mount naming
  a command more than `PENDING_TICKS` (600, the queue's 10 s) ahead of the room's count is refused 'ahead' on arrival; one
  waiting longer than that is dropped 'its command never ran', as a timed event. A resume (`handBack`) and a leave or a
  takeover (`drop`; the id may be the next seat's, `freeId`) clear the seat's waiting mount; `resetTurrets` clears them all
  as before; a dead body's is refused 'not alive' at its take (its dead commands move the count); a parked seat's comes
  due on its neutral commands. Named in the adaptation's doc: the take lags its command by up to a step; asks run in the
  same catch-up step (a burst on `CREDIT_MAX`, HIGH-1's catch-up, a drained backlog) and a dropped backlog's asks
  (`asksAt`) are judged unmounted; a round decided around the take is ordered by step, not exactly by seq; a mount after a
  drop is judged on the room's last real body. *Not built* (the read's design (A), a possible later row): the mount queued
  with the immediate asks in the seat's `pending`, decided after its own command's `settle` in order with them, the
  step's contests by seat id through the run order.
  *Measured* (unit tests, the MP72 fixture and the clips' pack; `roomTurretMountAtCommand.test.ts`, 11): F2's door at S + 1
  and mount at S + 2 with the room behind -- the door used, the mount at a later step (was 'door: mounted'); the room one
  command behind -- `after` = S + 1 (was S); a catch-up step (S + 1 .. S + 3 in one step, the mount at S + 1, a door at
  S + 3) -- the door used, the mount at the next step's top, `after` S + 3; a 300 ms stall's mount -- taken, not 'stale',
  `after` at or past its seq (was S); a 9 s stall's dropped stretch -- the mount naming 651, the room at 271 on its arrival,
  the drop at tick 822 its last command 820: taken at tick 823, `after` 820 (was taken on arrival, the room far behind);
  'ahead' at + 601, + 600 waiting (was both taken); the 600-tick window (was taken); the resume's and the leave's clears
  (was taken, or 'mount: reach' on the new seat). RED 9 failed, 2 passed (the stale bound at arrival and the contest's
  variant, green both ways); GREEN 11. LATER 96's harness (`turretHold.test.ts`, disc-backed MP51): `after - mountSeq`
  was -1 at 60 Hz and -2 at 144 Hz from 50 ms one way (14 of 73 red), now 0 in all 23 cases; the bars held -- page-room
  0.000 at the hold tick, the command's end within 0.25 (0.035 at 50 ms, 30 Hz), the drawn step 2.099 / 0.875 at 60 /
  144 Hz, the own clip 8-10 frames at 60 Hz and 19-24 at 144 (21 before at 50 ms), walked 1.364 at 60 Hz and 0.568 at
  144 Hz. Unchanged and green: `roomTurrets` 55, `roomTurretTick` 13, `roomTurretAmmo` 21, `roomTurretResume` 5,
  `roomNetHardening` 41, central's `room` 191, `roomHostile` 9, `roomFuzz` 7. No browser look; no capture (owed: capture
  B 13, a contested mount).
- **LATER 140: a dropped or cut stretch inside the release (2026-10-19, PARITY-2; reading, pending review).** A stretch the
  room drops (a backlog, HIGH-1; the intake's flood cut, LATER 136) laid each command's presses without `run`'s strip, so
  a jump, a stance, a lean or a swap the page held through its reversed clip took effect in the room. `dropStretch` now
  lays a command inside a running release (`Player.release`; a knock, a death or a mount ends it, as it ends `run`'s
  strip) with `run`'s strip -- the stick zeroed, `RELEASE_HELD_BUTTONS` off -- judged by its own number against the
  clip's span in the page's numbering, through the end's command (`releaseSpan.to` + 1, dseq + 17: the stick and the
  presses are held through it, the asks to the 16th), as `TURRET_RELEASE_ACTIONS_PLACEHOLDER` and
  `TURRET_RELEASE_STICK_PLACEHOLDER` hold them. The travel is not stepped by the stretch: the drop buys no movement, as
  the mount's steer is not (above). **Named, not settled (its review's F3), as the steer's lag is above:** (a) the
  overhang -- the room's travel steps only on the commands `run` runs, so after a stretch dropped mid-clip it runs on
  past the span: a cut of dseq + 3 .. + 22 leaves it two steps in, and `run` holds the stick and strips the presses of
  dseq + 23 .. + 37, which the page ran free from dseq + 18 (a jump on dseq + 25 is laid on the page and refused in the
  room until the reconcile); (b) a dismount pending across a stretch (`takeDismount` runs only from `run`) takes the
  mounted branch, none of its presses laid, and the release and its travel start that many commands late, at the first
  command the room runs above it (`ASK_AT_COMMAND_ADAPTATION`'s named residue). An honest page sends none of the held
  presses (its walk lock), so it sees no change; a modified page's are no longer taken.

### 7.10 The mount's repeat window (2026-10-19, PARITY-2 LATER 137; reading, pending review)

- **The original** (source inspection). Online (the flag `DAT_0045a0c1`) the press `FUN_00546210`, its gates passed,
  asks the network library for the turret object (D:L412075-412084) through `FUN_002c79f0` (D:L167867-167869): the ask
  (`FUN_0030d010` -> the library's `FUN_00623590`) is sent only when the manager's clock `FUN_0030d550(0x45a0c0)` -- its
  `+0x100` -- has reached `DAT_004415d8`, which is then set to that clock + 2000. One variable for every turret: the
  window is global, not a turret's. It opens at every ask sent (whatever the library answers) and is cleared when a turret
  object is made on this console -- the class's create callback `FUN_002c7e60` (registered at D:L168091; its ready branch
  D:L168044-168051; deferred creates flushed by `FUN_002c7910`, D:L167835-167845, from the online frame code,
  D:L55683 / D:L55692). A refused repeat does nothing: `FUN_002c79f0` is void, and the press's caller ignores the gate's
  result (D:L452101-452103) -- no ask, no sound (`.GRAB_TURRET` plays in `FUN_005463c0` at the owner's change), the prompt
  the gates' (action 19, research 214 s4), the press the turret's. `FUN_002c79f0` has one caller and `FUN_0030d010` one
  user: no other ask (a dismount, a door, the bomb) has this window; the dismount's path (D:L452085-452086) reads no clock.
- **The clock's unit: milliseconds.** `+0x100` is written only by `FUN_0030da00` (D:L210280-210283) from `FUN_00622ea8`
  -> `FUN_00615068` (D:L523142-523152), the library's `DAT_00676698`; `FUN_0061bee8` advances it by the delta of
  `FUN_0063cf20` (D:L527618-527620), which is `FUN_0063cf38` -> `FUN_0063d2d8` (D:L552681-552697): seconds x 1000 +
  microseconds / 1000, its overflow guard 0x418936 (2^32 / 1000); the seconds and microseconds `FUN_0063db68`'s
  (D:L553018-553045) over the EE `Count` at 294,912,000 a second (x 0.003390842 us a count). The game's other uses of the
  same clock agree (a seconds setting x 1000 at D:L164085; 125 x 8 x n at D:L149008; 30000 at D:L123859). So 2000 is two
  seconds: `TURRET_MOUNT_ASK_WINDOW_READING` = 2 (s4).
- **The port** (before): `TurretPage.action` sent a `mount` on every press until the room's broadcast set `held`; the room
  (`room.ts` `turretRequest`) keeps one pending a seat, a later replacing an earlier, and tallies a repeat after the take
  'mount: mounted' -- nothing visible. What differed: a remount within 2 s of the last mount press (a mount, its dismount
  past the clip, the release's 17 commands: about 0.6 s) was sent and taken; the original sends none.
- **Built** (`turretPage.ts`, not a hot file; no wire or room change): `askAgain`, the page's `now()` from which a mount may
  be sent again; a mount press before it returns true and sends nothing; each mount sent sets it to `now()` + 2; a welcome
  clears it (the turret objects made again). The dismount, its LATER 104 re-send and the prompt are unchanged. The page's
  single-player and forge matches take the network branch too (SOLO_IS_NETWORK_READING, as the death camera does); the
  original's offline press mounts at once (D:L412075-412076).
- **Not modelled, named:** (1) the library resync -- `DAT_00676698` is set from the host's stamp plus half the round trip
  at a sync (`FUN_00614838` at D:L525928), so the original's window can move with it; the page's runs on its own clock;
  (2) whether a round's start clears the window -- whether a round re-makes the turret objects (`FUN_002c7e60`'s callers)
  is unread; here a round's start leaves the window running. The `+0x100` snapshot's cadence (once a `FUN_0030da00`) is
  unread too, below a frame.
- **Found, not this row's:** online, the mount `FUN_005463c0` sets the actor's `+0x22c` to the same clock + 1250
  (D:L412209-412213), and the release action (20) is offered only once the clock has reached it (`FUN_005a8850`
  D:L462975-462993, at `FUN_005937c0` D:L452334-452338): the original's online dismount waits 1250 ms from the mount on
  the asker's console; the port refuses it only while the mount clip plays ('mounting', `seatOff`). Research 214 s4 and
  101 cite `FUN_005a8850` as "holds a turret" alone. A row for the seat. *(Built: LATER 151, s7.11.)*
- *Measured* (unit tests, no game data; `turretPage.test.ts`, "LATER 137", 6): the window's value; the first press
  unchanged; presses at + 0.5 and + 1.99 s send nothing, true, the prompt `turret_mount` (RED: 3 mounts); a press at + 2 s
  sends; mount, dismount, a remount at + 1.25 s not sent, at + 2 s sent (RED: 2 mounts); a welcome clears it. No browser
  look, no capture (B 13's remount owed).

### 7.11 The release's wait (2026-10-19, PARITY-2 LATER 151; reading, pending review)

- **What changes for a player: every turret dismount in a match now waits 1.25 s after its mount, everywhere in the
  port** -- online, and through SOLO_IS_NETWORK_READING the single-player match and the forge too. For the first 1.25 s
  seated, no dismount prompt shows and the action button does nothing; from then on the dismount is as before.
- **The original** (source inspection). The mount `FUN_005463c0`, when the turret is taken and the object is a turret
  (kind 3), sets the actor's `+0x22c` to `FUN_0030d550(0x45a0c0)` + 1250 -- only while `DAT_0045a0c1` (online) is set
  (D:L412209-412213); the clock is the manager's `+0x100`, milliseconds (s7.10). It runs on every console that applies
  the mount: offline from the press (`FUN_00546210` D:L412075-412076), online from the turret object's owner update
  (`FUN_002c7d00` D:L168015-168020) -- the asker's console included, so the wait starts when the mount is applied there,
  not at the press. Its one reader is `FUN_005a8850` (D:L462975-462993): with a turret held (`+0xeb8`), 1 offline, and
  online 1 only once `+0x22c` <= the clock. Its one caller, the offer builder `FUN_005937c0`, offers the release (action
  20, 0x100000) and returns on it (D:L452334-452338). Before the 1250 ms the release is not in the offer mask `+0xed0`,
  so the picker never selects it (`+0xed4`, research 214 s4), no `action_dismount_turret` prompt is drawn, and the press
  dispatcher `FUN_00592d50` runs `FUN_00545ee0` only on the selection's 0x100000 (D:L452078-452087): a press does nothing
  for the release -- no ask, no sound. The release's own first test (the mount clip still on, D:L411954-411966; about
  0.28 s) lies inside the wait. Offline (the campaign, which the port has no match of) there is no wait.
- **Unread, named:** while the wait runs `FUN_005937c0` goes on to the doors, the pickups, the drop and the mount
  (D:L452339-452475); what it offers a seated actor there is not read. The port keeps the mounted press the turret's
  (`actionWiring.ts` `actionInputs`: mounted, the turret alone), so a door or a pickup in reach takes nothing during the
  wait. Research 214 s4's "mounted, nothing else is offered" holds once the wait has passed.
- **The port** (before): the room refused a dismount only inside `SeatSteer.ends` (17 commands, about 0.28 s; none in a
  room without the clips), and the page showed `turret_dismount` and sent the press from the mount on -- a release at
  0.5 s taken, where the console keeps the player seated to 1.25 s.
- **Built:** `TURRET_RELEASE_WAIT_READING` (1.25, `viewer/src/net/emplacement.ts`) and `TURRET_RELEASE_WAIT_TICKS` (75 at
  `TICK_HZ` 60). The room's window end `seatOff` is the mount's `after` + max(`SeatSteer.ends`, 75), with or without the
  clips, judged on the page's count (TURRET_RELEASE_SEQ_ADAPTATION, otherwise unchanged; the refusal still `'mounting'`
  on the wire: no protocol change). The page (`TurretPage.releaseOffered`) shows no `turret_dismount` and sends nothing
  on a press (true: the turret keeps it) until its command count reaches `after` + 75; a mount dated by a clock (an older
  room's `ticks`, a resume mid-steer, an arrival) waits 1.25 s from its `at`; a welcome's (held already, no `after`: a
  reconnect) waits 1.25 s from the welcome's arrival (`waitFrom`; the review's F1, was offered at once). The page's count
  stands for the original's clock read as the asker's own frames (its dating below).
- **Not modelled, named:** the other offers during the wait (above); the library resync (s7.10); the clock's snapshot
  cadence (below a frame); one command's rounding at the boundary (the room's count, as LATER 104's window). **The
  dating** (the review's F3, as LATER 96's keying): counted from `after`, the room's count at the take, the wait starts
  about when the room took the mount, where the original's asker starts it when the owner update reaches its own console
  (`FUN_002c7d00` D:L168015-168020) -- so, measured from the press, the port offers the release up to about a round trip
  earlier than the original's asker sees it. **A reconnect inside the wait** (the review's F1): a welcome's mount carries
  no `after`, so the page waits 1.25 s from the welcome's arrival -- never earlier than the room's `seatOff` in wall time, the mount
  taken before the welcome, but up to 1.25 s longer than the original (the reconnect itself an adaptation); the exact
  wait, the resume carrying the mount's `after`, is LATER 154 -- **built** (reading, pending review): the resume carries the
  room's `seatOff` (the mount's `after` + 75 in the page's numbering) and the page offers the release from that command
  (`MountMark.seatOff`), as the room takes it; `waitFrom` stays for an older room alone.
- *Measured* (unit tests): the room on Crossroads (`roomTurrets.test.ts`, "LATER 151", with and without the clips): a
  dismount naming `after` + 30 or + 74 refused 'mounting', the seat kept, + 75 taken (RED: taken at + 30); the page
  (`turretPage.test.ts`, "LATER 151", no game data): no prompt and no send at + 30 and + 74, the prompt and the send at
  + 75, a clock-dated mount at 1.25 s (RED: the prompt and the send at + 30); a welcome's mount and a resumed one 1.25 s
  from the welcome's arrival, the pose the hold (the review's F1 RED: the prompt at once). The tests that
  dismounted inside the first 75 commands step to `after` + 75 first. No browser look, no capture: B 13 owed.

## 8. The weapon box while mounted (2026-10-12, PARITY-2 PAR-55; reading -- re-read at the source by a fresh reviewer, PASS WITH FINDINGS)

The owner's playtest of `main` 2d5618c23: mounted, the HUD's bottom-left box drew the rifle's icon beside the turret's
711/750 -- "I don't think the weapon icon is right (showing your main hand)". A source inspection and the disc's data
through the repository's readers; no run of the original. **No capture**: `$SOCOM_PC_ROOT/logs/parity/` holds no mount
(searched 2026-10-12 for turret, mount, emplacement, B 13, MP51, MP72 and Crossroads: one Crossroads drive log of the
port, no frame of the original mounted).

- **The item in the hand is the turret's weapon.** The mount (`FUN_005463c0`) keeps the slot in the hand (`+0xebc`,
  D:L412214-412215), adds a slot at the kit's end (`FUN_005be030`, the slot count) holding the turret's record (`+0x2ac`)
  and its rounds (`+0x2a8`) (`FUN_005bc5d0`, D:L412216-412217), and takes it up (`FUN_005c4b10`, D:L412218). The release
  sums the slot's magazines back into `+0x2a8` (`FUN_005c3c10`, D:L478128-478154, called D:L412003), takes the kept slot
  up again and clears the turret's (D:L412005-412006). (s7.3 read the same slot for the body's model.)
- **The rounds become magazines.** `FUN_005bc5d0` (D:L473877-473906) puts the slot's magazine in the weapon at 0 and pours
  the rounds into its magazines of the record's `Ammo_Capacity` (`FUN_003d2810`, `+0x28`): each full while the rest
  exceeds one, then the rest (D:L473890-473903). The turret's 750 are three magazines of 250; a mount on 711 left is
  250, 250, 211.
- **The box reads that slot** (`FUN_00237760`, D:L85155-85247, the box research 84 s18 reads for a firearm):
  `"%d/%d"` (D:L85189) the magazine in the weapon (`FUN_005c3890`) over `Ammo_Capacity` (`FUN_005c3ce0`); `"%d MAG%c"`
  (D:L85197-85203) the magazines with rounds (`FUN_005c49b0`) less one, hidden below 1; the icon the slot's record's
  `+0xbc` (`FUN_005be050`, D:L474766-474795, drawn D:L85247), the `IconTextureName` texture (research 94, `FUN_003c4700`).
- **The fire-mode row is shown, at the turret's own mode.** `FUN_005bc300` (D:L473775-473806) hides the row for the
  classes 121, 151, 190, 201 and 230 (D:L473799-473803). `FUN_003d1a60` (D:L324331-324352) puts the ids 205-229 in class
  205 and 230-253 in class 230: PKM TURRET (205) and LMG TURRET (207) are class 205, not refused. *(`hud.ts`'s
  `HudModel.fireModeRow` comment, :487, names class 230 "turret" -- rightly: 230 is the disc's MGL FRAG TURRET
  (`Turret_MGL.tif`, the arsenal's `turret2`), a turret class, but not PKM's and LMG's (205) -- the brief's lead came
  from reading it as theirs (the review's finding 3). Left for its owner: `hud.ts` changes only for a model field here.)* The mode: `FUN_005bc410`
  zeroes the new slot's (D:L473830-473834) and the take-up runs `FUN_005c4600` while it is 0 (`FUN_005c4b10`
  D:L478930-478931), which steps from 0 to the first mode the record enables (`FUN_003d2a60` D:L325359-325371, the
  record's `+0xd0` flags) -- the switch the firearms use (`./accuracy` `nextFireMode`).
- **The disc** (`RUN/ZWEAPON.ZAR`, `zweapon.rdr`, through `readKitTable`; the fixture): PKM TURRET 205 `IconTextureName`
  `Turret_RMG.tif`, `Ammo_Capacity` 250, `NumMags` 3, `AutoMode` only (`fireModes` [3]); LMG TURRET 207 `Turret_LMG.tif`,
  75, 3, `AutoMode` only. Both icons are in `HUDW_TXR.ZED` of MP2, MP51 and MP72 (65 textures each, beside
  `turret_mgl.tif`), read with the repository's `Zar` reader.
- **So the original's box** at a PKM TURRET mount on a fresh gun: the RMG icon, 250/250, 2 MAGS, the row's four rounds
  (AUTO); after the owner's 39 rounds, 211/250 and 2 MAGS.

**The port (PAR-55, `agent/par55`; reading, pending review).** Code: `packages/viewer/src/turretPage.ts`
(`TURRET_AMMO_HUD_READING` re-valued, `turretBox`, `turretWeapon`, `TurretPageDeps.weapon`, `TurretPage.hudAmmo` /
`hudIcon` / `hudFireMode`: the count at this page's mount kept as the pour), `matchActions.ts` (the `weapon` dep,
`MatchActions.pageHands`, `actionHands`), `matchThrow.ts` (`PageHands.icon` / `fireMode`, the page's icon before an
item's), `matchFirearm.ts` (`FirearmHands.fireMode`; `feedHud` sets the row's mode while it is not null, no round's icon,
and the firearm's back at the release -- the one per-frame HUD feeder; PAR-54's lane, its hunks apart from PAR-54's),
`loadMap.ts` (`arsenalIcons` takes the turrets' icons, so the HUD decodes them), and both pages' one line each
(`main.ts` :114 and :418, `matchMount.ts` :30 and :395: `hands: throws.hands(actionHands(() => acts))`). Tests:
`packages/viewer/test/turretPage.test.ts` (the PAR-55 block; the MAP-10b mount test on Crossroads' fixture),
`matchActions.test.ts` "the part's hands ...", `matchThrow.test.ts` "PAR-55 ...", `matchMount.test.ts` "a turret event
seating this page: the HUD's box is the kit's ..." (the menu page's HUD model, the firearm's box back at the release);
the e2e specs `turretMount.spec.ts` and `menuVigilance.spec.ts` expect 250/250/2 (not run here).

- **Modelled since TURRET-AMMO's page half** (below; `TURRET_AMMO_HUD_READING` re-valued): the box reads the room's
  magazines once told. *Was* (PAR-55): "**Not modelled** (the page), named in `TURRET_AMMO_HUD_READING`: the box derives
  its magazines from the count, so it goes to the next magazine at once and nothing pauses; a welcome's mount (a late
  join) pours the count as it stands, not as the original's mount did." **The room half is built** (TURRET-AMMO, 2026-10-17, `agent/online-ammo`; reading, pending
  review): `room.ts` keeps the occupant's ten magazines (`TurretState.mags`, `turretPour` at the mount, summed back at the
  release), arms `ReloadDelay` at the last round and on a mounted R (the rifle's reload no longer taken while mounted),
  drops a round inside it 'reload', walks at the landing, reloads a dry pull at once but on class 230, refills only at
  the round's reset, and tells the occupant alone its magazines (`turret` event `mags`: the rounds tell, the arm, the
  landing, after a resume; protocol `TurretMags`). Tests `packages/match/test/roomTurretAmmo.test.ts`; the page's half
  (the box, the trigger's pause, R mounted, the `ReloadSound`) is the gameplay seat's. *Was:* "the room counts the
  turret's rounds as one, so the box goes to the next magazine at once and nothing pauses". **The original's reload, read 2026-10-17
  (TURRET-AMMO, issue #284; reading -- re-read at the decompilation, the ELF's bytes and the disc by a fresh reviewer
  2026-10-17, AGREED WITH CORRECTIONS, high, its three corrections folded below with was-lines; source inspection and
  the disc through the repository's readers, no capture):** the mounted kit **reloads**, with no clip.
  - *The magazines.* Ten fixed int slots a kit slot (`kit+0x1d4 + slot x 0x28 + i x 4`) and a current index
    (`kit+0x684 + slot x 4`); an emptied magazine stays in its slot as 0; the walk is `i + 1` mod 10, skipping any
    under 1 (D:L477462-477477). The HUD's MAG is the count of entries over 0, less one, hidden below 1 (`FUN_005c49b0`
    D:L478758-478772; D:L85191-85203).
  - *The trigger.* The kit's fire (`FUN_005be9a0`) spends the round after the fire step (D:L475604, D:L475621-475624);
    in that step a mounted actor (`+0xeb8` a turret, type 3) whose magazine holds its **last round** (`FUN_005c38a0` 1)
    arms the reload (`FUN_005c5340` D:L479287-479294, D:L479318-479320) -- a branch of its own for the mount. R does
    the same while mounted (`FUN_00594cf0` D:L453460-453463; the function reads `+0xeb8` only at D:L453073, a flag,
    and returns nowhere between D:L453175 and the press). A dry pull with a magazine left reloads at once
    (`FUN_005c0fd0` D:L476616-476622) -- **not on MGL FRAG TURRET**: the dry click and the dry-pull reload sit behind
    `FUN_003d1e20` of the weapon in the hand (D:L476590; the ELF loads `a0` from `kit+0xe4[slot]` at 0x5c11c4 before
    `jal 0x3d1e20` at 0x5c1260), which answers 0 for class 230 (D:L324477-324479). *Was* (correction 2): "A dry pull
    with a magazine left reloads at once (`FUN_005c0fd0` D:L476616-476622)", for every turret.
  - *The pause.* The arm is the kit's one timer at the record's `ReloadDelay` (`FUN_003d2c40` `+0x5c`, handed in:
    `FUN_005c32b0`'s other branch, D:L477674-477676; R's path, `-1`, takes it at D:L477661-477667; *was* (correction 2,
    the cite): "`FUN_005c32b0` D:L477661-477667" for the last round's arm): **0.5 s** on PKM TURRET and LMG TURRET, **0.25 s** on MGL FRAG TURRET (`RUN/ZWEAPON.ZAR`
    `zweapon.rdr` through `readWeapon`, the disc and the fixture alike; no `ReloadTime`, no overheat or feed key on any
    of the three). While it runs, and on the frame it stops, the trigger is not read (`FUN_005c0fd0` D:L476549-476563:
    any frame entered with the timer non-zero skips its fire step), so no round leaves -- the first after the arm's
    frame N is N+31 / N+17 (the review's fold, F1, below). *Was:* "While it runs the trigger is not read (`FUN_005c0fd0`
    D:L476549-476567), so no round leaves."
  - *The landing.* At the timer's end `FUN_005c2a90` (D:L476553-476560) passes its gates in the hold -- the airborne bit
    (`+0x105e` 0x20: `FUN_005af930` sets it each tick before the ground pick, D:L466805-466810, called at D:L418169; the
    mounted body stands on its floor; *was* (correction 3): "the dive bit"), the alive bit, no throw (`FUN_005a7d10`), no reload or lock (`FUN_005a7ab0`), no climb (`FUN_005a78d0`: Climb crate,
    Climb medium, Climb over, Step up, Stand -> Hang, Stand -> Ladder), not state 9 (carrying, which the mount refuses,
    D:L412071), `FUN_005b4340(actor, 3)` (the turret set refuses only actions 2, 6-8 and 11, D:L469466-469476; the
    hold is no `UseVelY` motion, D:L469517 with D:L131390-131396 and `motion.rdr`'s `seal_turret_poses`), not the binoculars (D:L477394-477410) -- walks from
    the next magazine to one with rounds (D:L477462-477477), puts it in (D:L477483) and plays the record's
    `ReloadSound` at the actor (D:L477484-477488: `.M63A_RLD`, MGL `.M203_GREN_RLD`). The body's reload clip
    (`FUN_005a82e0` D:L462833-462928) asks the turret set for a reload type it does not hold (`animset.rdr`: the set's
    four types and `GLOBAL`'s, no reload), so nothing is pushed (`FUN_00588bc0` D:L446077-446081) and the reload goes
    on (D:L462943); the gun fires again at once.
  - *The end.* With no other magazine left the walk finds none and nothing is written: the network refill (research
    312) passes class 4 or `FUN_003d1d10`'s classes only (D:L477490-477497; `FUN_003d1a60` puts 205-229 in class 205
    and 230-253 in 230), so the turret is dry until the round's reset (`FUN_003aa9d0` D:L301330-301337). A release and
    re-mount does **not** refill it: the release sums the magazines back onto the turret (`FUN_005c3c10`, D:L412003: 0
    when all are empty) and the pour then writes nothing (D:L473891-473903); the rounds live on the turret, so the next
    occupant of a dry turret gets 0. A re-mount only repacks part-spent magazines, full ones first (30 + 250 becomes
    250 + 30). `ammoInit`'s consumer is this pour. *Was* (correction 1): "the turret is dry until the release sums its
    magazines back (D:L412003) and a re-mount pours them again (D:L473890-473903), or the round's reset".
  - *The swap.* Refused while mounted: the quick-slot presses (`FUN_00594cf0` D:L453288-453310) ask `FUN_005a8cb0`,
    which answers 0 while `+0xeb8` is set (D:L463174) -- PF.R31's strip of the swap is the original's.
  - *Was* (PAR-55's review, 2026-10-12): "whether the mounted kit reloads at a magazine's end at all is **open**
    (`FUN_005c2a90` refuses a reload under several actor states -- `+0x174 == 9`, `FUN_005a7d10`, `FUN_005a7ab0`,
    `FUN_005a78d0` -- unread for a mount; the review's finding 4)".
- **The page half (TURRET-AMMO, issue #284, 2026-10-17, `agent/tammop`; reading, pending review -- one review covers both
  halves; unit tests only, no browser, no capture).** The occupant's page follows the room's `mags` (`TurretMags`):
  - *The box* (`turretPage.ts` `turretMagsBox`, `TurretPage.hudAmmo`): the magazine in the weapon (`mags.current`,
    `FUN_005c3890`) over `Ammo_Capacity`, `MAG` the entries over 0 less one, hidden below 1 (`FUN_005c49b0`
    D:L478758-478772, D:L85191-85203) -- through the pause after the PKM's first magazine **0/250 and "1 MAG"**, the
    original's own one-low, pinned. Before a hold's first tell (the mount's broadcast carries none) and from an older room
    that sends none, the pour from the count (`turretBox`) as before, pinned. Between tells the page spends its own rounds
    from the magazine in the weapon (`TurretPage.round`), never refilling, never walking; the next tell wins.
  - *The trigger* (`TurretPage.reloading`): true from the arm's tell to the landing's -- the trigger is not read
    (`FUN_005c0fd0` D:L476549-476567) -- and `round` draws nothing then, nor past the magazine in the weapon spent. The
    claim's gate is `matchActions.ts`' turret frame (a hot file: its hunk quoted to the seat, not written here).
  - *R mounted* (`TurretPage.reload`; `fire.ts` `FireSource.reloadTaken`, `matchFirearm.ts` / `matchThrow.ts` hands
    `reload`): every binding's R ends in `Fire.reload` -- the keyboard's R (`Fire`'s own key), the pad's R3
    (`matchLanes.ts`), the touch RELOAD (`main.ts`, `matchMount.ts`) -- which asks the hand's other owner first; mounted,
    the turret's `reload` goes to the room at the press with the page's last command (`FUN_00594cf0` D:L453460-453463),
    the rifle asking nothing (no delay, no magazine, no clip, no sound). The MGL's R reloads it too. The pages' hands
    reach `TurretPage.reload` through `matchActions.ts`' `actionHands` / `pageHands` (its hunk quoted, not written;
    until it lands, R mounted is still the rifle's on both pages).
    *Was* (by inspection of the base): the rifle's `fire.reload()` set the rifle's own pending reload, which ran (and
    spent a rifle magazine on the page) only after the release, the room seeing R only then.
  - *The sound* (`TurretWeapon.reload`, the record's `ReloadSound`: PKM TURRET's and LMG TURRET's `.M63A_RLD`, MGL FRAG
    TURRET's `.M203_GREN_RLD`, the disc's `zweapon.rdr` through `readKitTable`, the fixture): played at the occupant's
    body, volume 1.0, through the page's turret sounds (`TurretPageDeps.sound`, the bank's `play` as `GameAudio.onReload`
    plays the firearms'), when a tell's magazine in the weapon differs from the hold's last tell's -- the walk's put-in
    writes the index, then plays it (`FUN_005c2a90` D:L477483-477488): the landing of `ReloadDelay` and a dry pull's
    reload at once (D:L476616-476622); a walk that finds none writes and plays nothing; a hold's first tell plays none.
    Heard by every page: the occupant's own, and the others through `reloadSound` (the room half's F4, below). (Was:
    "Heard on the occupant's page only (the room tells no other page the slot)"; the review's F4, 2026-10-17.)
- **The review's fold (2026-10-17; the room half's fresh review, PASS WITH FINDINGS, high, its fold approved by the merge
  controller; `agent/online-ammo`; reading, pending review -- source inspection and unit tests, no capture).** F1, F4 and
  F5 built red first; F2 and F3 named, not built.
  - *F1, the pause on the command clock.* `FUN_005c0fd0` runs the kit's timer at the top of each frame (D:L476549-476563):
    entered non-zero, the frame's time is taken off first and stored (D:L476551-476552), then a result `< 0.0` --
    strictly -- lands it (`FUN_005c2a90` D:L476558; `FUN_005c3000` for an after-shot, D:L476554-476555) and zeroes it
    (D:L476560); `bVar11 = false` (D:L476562) skips that frame's fire step (D:L476565-476566) whether it landed or not.
    The last round's arm sits inside frame N's fire step (D:L476566 -> `FUN_005be9a0` D:L475604 -> `FUN_005c5340`
    D:L479318-479320), so frame N+1 takes the first decrement. In float32 at 1/60 s (`turretReloadCountdown`,
    `viewer/src/net/emplacement.ts`): 0.5 s stops on N+30 (-1.8e-7), 0.25 s on N+16 (the 15th leaves 1.1e-8); the
    landing's own command fires nothing, so the first round after is **N+31** (PKM TURRET, LMG TURRET) and **N+17** (MGL
    FRAG TURRET). A decrement to exactly 0.0 stops the timer with no landing (`< 0.0` fails, and the next frame's
    `!= 0.0`, D:L476550): carried (`TurretState.lands`), though no turret record reaches it. *Was* (the room):
    `Math.round(ReloadDelay x 60)`, the round on the landing's command allowed -- N+30 and N+15. MGL FRAG TURRET's 1 s
    `FireWait` (`zweapon.rdr` through `readKitTable`) holds its next round past N+17 after a last-round arm anyway; R's
    arm on a fresh mount shows the 17. **Not read** (named in `TURRET_RELOAD_READING`): the R5900 FPU's rounding -- the
    port's countdown rounds to nearest; a subtraction rounded toward zero with the same frame time stops 0.25 s on the
    15th (N+15, the first round N+16), 0.5 s on the 30th either way; the frame time's producer (a constant float32 1/60
    here); and where R's arm falls in the frame -- `FUN_00594cf0` is a controller vfunc (research 205 s5.1 takes it for
    slot `+0xc`; research 251 for `+0x10`, D:L418091 in `FUN_00550ef0`), the kit update runs from `FUN_005506a0`
    D:L417907 after the controller's `+0x3c` (D:L417905), and a controller update before the kit's would land R's reload
    one command earlier (N+29 / N+15). The room counts R's arm as the last round's. Tests
    `packages/match/test/roomTurretAmmo.test.ts` "F1: ..." (four).
  - *F4, the others hear it.* The landing plays the slot record's `ReloadSound` at the actor (`+0x1c`, D:L477484-477488)
    in the kit's frame, which the actor update runs with no locality test (`FUN_005506a0` D:L417907): the rifle's rule
    (`reloadSound`, `REMOTE_RELOAD_SOUND_READING`, `room.ts` `reload`). The room broadcasts `reloadSound` (the turret
    weapon's id, at the occupant's body) to every page but the occupant's at a landing whose walk finds a magazine and at
    a class-205 dry pull's put-in (`FUN_005c0fd0` D:L476616-476622, the same `FUN_005c2a90`), never at a walk that finds
    none (the write and the sound sit in its found branch, D:L477478) nor at an MGL dry pull (no put-in). The other page
    needs no hunk: `NetPage`'s `reloadSound` case resolves the id through `recordOf`, which takes `turretRecords`
    (`matchNet.ts` :148), and `GameAudio.onReload` names every WEAPON of `zweapon.rdr` (`soundData.ts` :384) -- pinned
    end to end, the room's event for Crossroads' PKM TURRET through the real page, `matchNet`'s `recordOf` and the sound
    part's hook to `.M63A_RLD` (`packages/viewer/test/turretReloadHeard.test.ts`). The page half's bullet above was
    corrected at the merge of both halves (`agent/tammop`, 2026-10-17): heard by every page. (Was: "*Was* (the page
    half's s8 on `agent/tammop`, its :1149, not in this tree -- to be corrected where both halves merge): 'Heard on the
    occupant's page only (the room tells no other page the slot).'"; the narrow re-read's N2.)
  - *F5, a dropped round tells.* The page spends its own predicted rounds between tells; a turret round the room dropped
    (`'rate'`, `'reload'`, `'empty'`, `'swapping'`, `'binoculars'`, no weapon, no frame) set no tell, so the page could hold
    a predicted 0 with `reloading` false -- the room, never having fired that last round, never armed the reload -- and
    the trigger was dead until R. A turret round the room refuses for its occupant now owes the occupant its magazines on
    each of these paths: every refusal inside `turretRound` (`turretDropped`); `fire`'s 'no frame' for a mounted body;
    and, before `fire` runs, 'stale' (`decide`), 'too many waiting' (`timed`, `PENDING_MAX`) and 'its command never ran'
    (`settle`, `PENDING_TICKS`) -- `turretFireOwed`, added by the re-read's N1, below. At most one tell a tick, to the
    occupant alone (`tellAmmo`). The port's repair of its own prediction (the original has no such wire); no value of
    the game's changes. The page's `tookMags` replaces its magazines with the room's at every tell, pinned on the page
    since both halves merged: `turretPage.test.ts` "the review's F5: a predicted last round the room refused ... is not
    final" (through the real `take` -> `tookMags`). (Was: "(the gameplay seat's source inspection); the page half is on
    `agent/tammop`, not in this tree, so no page test drives the tell here"; the narrow re-read's N2.)
    *Was:* "Every turret round the room drops for its occupant now owes the occupant its magazines (`turretDropped`;
    `fire`'s no-frame refusal for a mounted body)" -- the three refusals before `fire` were missed.
  - *The re-read's N1 (2026-10-17; the narrow re-read of this fold, PASS WITH FINDINGS, high; red first, room-only).*
    'stale', 'too many waiting' and 'its command never ran' refuse a `fire` before `fire` runs, so they owed no tell. The
    page's `stale` handler refunds only the rounds it holds in `sentFires` (`netPage.ts` :1567-1575), and a turret round
    goes straight through the client's send (`matchActions.ts` :350), never recorded there: a stall that delivers more
    than `FIRE_ARRIVAL_JITTER_TICKS` (3) commands before the round is decided could drop the magazine's last predicted
    round -- F5's failure. Each now owes the mounted occupant its magazines (`turretFireOwed`); a body on foot, or any
    other event, owes nothing. Tests `roomTurretAmmo.test.ts` "N1: ..." (three, one a path).
    **Found, not built:** a turret round refused 'nofire' (`fire`, the playing motion's `NoFire` at its command,
    `room.ts` :3494) -- and `fire`'s refusals after it -- has already been spent by `turretRound`: the round leaves the
    magazine (and a last round arms the reload) though nothing is fired. It predates the fold; whether a mounted body's
    clip ever carries `NoFire` while the page claims rounds (the mount clip `Stand -> Turret` before the hold) is not
    read here, so no LATER row is opened: the room's order (`turretRound`'s spend before the `NoFire` test) is the
    finding, for the turret's owner to settle. *Settled for 'nofire' by LATER 173 (s8.2):* the mount clip carries a bare
    `NoFire ()`, and `fire` now refuses a mounted frame with no fire before `turretRound` spends (the console's gate
    `FUN_005a7de0` at D:L476442 comes before its magazine `FUN_005bd530`, D:L476449); 'binoculars' still follows the spend.
  - *F2, a reload running at a release* (`TURRET_RELEASE_RELOAD_READING`; not built). The room drops it with the slot; its
    comment had cited D:L412001-412006 for that ("goes with the slot"), which write no timer. `kit+0x820` is the kit's,
    and no writer of it is in the release path: `FUN_00545ee0` D:L411941-412024, `FUN_005c3c10` D:L478128-478154,
    `FUN_005c4b10` (the rifle back in the hand, D:L478842), `FUN_005b9bb0`, `FUN_005a6eb0`, `FUN_005448a0`,
    `FUN_003aa020`, `FUN_003a9ea0`. So the original's timer very likely runs on and lands on the rifle in the hand
    (`FUN_005c2a90` walks `+0x824`, D:L477411): a rifle magazine taken, and its `ReloadSound`, after a quick dismount.
    Owed: a capture (a dismount within 0.5 s of the 250th round or of R). The room's comment now names the choice.
  - *F3, no flinch gate at the landing* (`TURRET_LANDING_FLINCH_READING`; not built). `FUN_005c2a90` refuses inside a
    flinch window (`FUN_005b4340(actor, 3)` D:L469494-469504, asked at D:L477404) and the timer is cleared anyway
    (D:L476560), so that reload is lost. Whether a mounted body flinches at all is unread: no `+0xeb8` test in
    `FUN_005a2690` D:L459885-459959, and the room's `flinchState` has no mounted case; the room lands every time. Owed: a
    read (the hit path's reaction for an actor with `+0xeb8` set -- whether `FUN_005a2690` or its callers lay a flinch
    under the turret set) or a capture (an occupant hit within 0.5 s of the arm).
- **Not changed:** the fire-mode button while mounted (PAR-56, next); a mount while scoped (`FUN_005c4600` runs only at
  a zoom of 1.01 or less, D:L478577); `hud.ts`'s class comment above.
- **PAR-56 (2026-10-12, `agent/par56`; reading, pending review):** mounted, `matchFirearm.ts` `switchFireMode` leaves
  the rifle's mode, round and zoom hold alone -- `FUN_005c4600` steps the slot `+0x824` names (D:L478569-478579), the
  turret's after the mount's take-up (`FUN_005c4b10` D:L478842), its one mode -- and `feedHud` sets the row by the
  turret weapon's class whatever was up, the turret slot taken up over it (D:L412218): `fireModeRowShown`, the classes
  `FUN_005bc300` hides (D:L473799-473803) through `@s2u/scene` `itemClass` (`FUN_003d1a60`). **The MGL exception:** MGL
  FRAG TURRET (230, class 230, `-0x1a` at D:L473800; s2's five placements on MP10, MP52, MP62 and MP73) hides the row,
  PKM's and LMG's (class 205) show it. The id reaches the firearm as `FirearmHands.weapon` (`matchActions.ts`
  `turretItem`: the arsenal's id of the placement's `WEAPON NAME`, record or none -- `kitTableOf` reads no
  `turretRecords` for class 230, so `turretWeapon` was null for it -- since PAR-57, `turret2Records` gives the box its record; `matchThrow.ts` passes it on). An unknown id (no
  arsenal) shows the row. **One mode on every turret, so the early return is the original's:** the disc's
  `RUN/ZWEAPON.ZAR` `zweapon.rdr` through `readWeapon` (2026-10-12): MGL FRAG TURRET `fireModes` [1] (SINGLE only),
  `Ammo_Capacity` 24; PKM and LMG [3] (above). Tests `matchFirearm.test.ts`, `matchThrow.test.ts` and
  `matchActions.test.ts` "PAR-56 ...". MGL's box (icon, figures, mode) was PAR-55's null without a record: PAR-57, below.
- **PAR-57 (2026-10-12, `agent/par57`; reading -- re-read at the source by a fresh reviewer, PASS WITH FINDINGS): the MGL's box.** The disc (`RUN/ZWEAPON.ZAR`
  `zweapon.rdr` through `readKitTable` / `weaponRecord`; the fixture): MGL FRAG TURRET 230 `IconTextureName`
  `Turret_MGL.tif`, `Ammo_Capacity` 24, `NumMags` 3, `MaxFireMode` 1 (`fireModes` [1], SINGLE), `AMMO_TYPES`
  `M203 FRAG Ammo`; 230-253 holds no other item. `FUN_00237760` (D:L85155-85247) draws it as the PKM's -- the magazine
  over `Ammo_Capacity`, the magazines less one, the slot record's icon -- with no gate of its own for class 230: the
  whole box's `+0x7c == 0xb` test (D:L85206) is the record's item id (`FUN_003d1e10` D:L324460-324464 reads `+0x7c` as the id),
  the Designator's 11; the online `cVar3` gate (D:L85180-85188) is `FUN_003d1da0`'s class 4 and `FUN_003d1db0`'s
  classes 31, 51, 81, 91, 101, 141 (D:L324433-324455); `bVar1` (D:L85169-85179) reads the HUD's flag, the actor's
  `+0x200` (`FUN_005b9990` > 4, `FUN_005c80f0` == 3) and a null record -- none of them the class. **No launcher figures:**
  `FUN_005c3ce0` / `FUN_005c3890` take the round mode's path only when `FUN_005bd7f0` holds (D:L474405-474428: a carrier
  or class 145 by `FUN_003c5d80` D:L317279-317301, in a mode of 4 or more); 230 is neither, so the box is the plain
  magazine: a fresh mount pours 72 into [24, 24, 24] -- **24/24, 2 MAGS, `Turret_MGL.tif`**, the fire-mode row hidden
  (`FUN_005bc300`, PAR-56). **The port:** `kitTableOf` reads class 230's record into `KitTable.turret2Records`, apart
  from `turretRecords` -- the room fires those as firearm rounds, and MGL FRAG TURRET's explosive round is not built
  (s6), so it still fires none (`turretRound`'s 'no turret weapon'); `turretWeapon` reads either; `loadMap.ts`
  `arsenalIcons` decodes the `turret2` icon (MP72's HUDW_TXR holds it). Tests: `turretPage.test.ts` "PAR-57 ..." and the
  MAP-10b mount test's icon list (the fixture). Not run: a browser (the box rendered on MP10, MP52, MP62 or MP73).
- **Owed:** a rendered look in a browser slot (mount, the box's icon and figures); capture B 13 (a mounted HUD frame).

### 8.1 The MGL's round (2026-10-12, PARITY-2 PAR-59; reading, pending review)

s6's last gap: mounted on MGL FRAG TURRET (230, class 230, `turret2`; s2's five placements on MP10, MP52 twice, MP62 and
MP73) a player fired nothing -- the room's `turretRecord` read `turretRecords` (class 205) alone and dropped the shot
'no turret weapon'. A source inspection and the disc's data through the repository's readers; no run of the original, no
capture (none holds a mount, s8).

**The read.**
- **The PKM's path, a launched round in place of the line.** Mounted, the trigger runs the kit's fire on the turret's
  slot (s8: the mount takes it up): `FUN_005c0fd0` -> `FUN_005be9a0` (D:L476618-476638) -> `FUN_005c5340` (D:L475604),
  as for the PKM. `FUN_005c5340` takes a projectile from the pool (`FUN_003cca90(DAT_004b5220)`, D:L479349) and hands it,
  with the slot's record (230) and its ammunition, to the record's fire (vtable `+0xc`, D:L479493-479503: `FUN_003d2d70`,
  research 181 s2), which launches it through `FUN_003cb1a0` (D:L325643). Class 230 is no bullet: `FUN_003d1e20`
  (D:L324468-324483) refuses it with the grenades (121), the launcher rounds (171), the rockets (185), the charges (151)
  and the gear (190), so the launch leaves the projectile's `+9` at 0 (D:L320757-320760) and it flies -- not the bullet's
  one segment of `Maximum_Range x 1.1` (research 94 C1.12).
- **Its origin and line**: mounted, the origin is the turret's vfunc `+0x60` (D:L475520-475526) and the direction its
  `+0x68` with the controller's `+0x74` (D:L475594-475603); 230 is no carrier (`FUN_005bd6d0` D:L474339-474368:
  `FUN_003c5cd0`), so no loft (`FUN_005bf8a0` runs only for a carrier's round, D:L475564-475576). None of the three vfuncs
  is read: the port keeps the line placeholder's firepoint and gun line. (Read since: s8.2, 2026-10-17; the cone built
  2026-10-18, `TURRET_ROUND_LINE_READING`: the MGL's round launches along the claim's line inside its cone.)
- **Its speed**: `FUN_003cb1a0` sets the velocity to the record's `Muzzle_Velocity` (`FUN_003d27c0`, `+0x44`) times the
  direction, plus the vector its caller hands it (D:L320727-320731) -- the actor's `+0x38` from the kit's fire
  (D:L475604): `TURRET_LAUNCH_INHERIT_READING`, none here. The disc: `Muzzle_Velocity 27` -> **270 u/s**.
- **Its arc**: in flight (`+9` 0, state 1 or 6, not a rocket: D:L320302-320305) the tick takes `v.y -= g dt`, then
  `p += v dt` (`FUN_003ca5a0` D:L320348-320376), `g` the record's `Gravity_Acceleration` (`FUN_003d27b0`, `+0x48`). The
  disc: `Gravity_Acceleration 3.9` -> **39 u/s^2** -- the only record that sets one (research 94 C1.8); every other
  launched round falls at 98.
- **Its fuse and impact**: the launch copies `Timer1` / `Timer2` (`FUN_003d2220`, `+0xd8` / `+0xdc`, D:L320736-320739):
  **10 s / 10.1 s**. Its id is in no bounce class (`HandleIntersections`, `@s2u/scene` `bouncesByType`), so a hit sets it
  off (`HandleImpact` `FUN_003c8920`) past `ArmingDistance 10` -> **100 u** from its launch, and inside it is a dud that
  bounces (L319439-319462, research 94 C1.5).
- **Its blast**: its ammunition, `AMMO_TYPES` `M203 FRAG Ammo` (ZAMMO 28): `Explosion_Damage 10`, `Explosion_Radius 15`
  -> **10 in 150 u**, `ImpactDamage 0.5`, `Piercing 0` -- the M203 FRAG's own.
- **Its rate**: `FireWait 1`, `MaxFireMode 1` (SINGLE): `FUN_005c09f0` waits `FireWait` in mode 1 (D:L476323-476330) --
  **1 s** -- and `FUN_005c0940` allows **one round a pull** (D:L476281-476310); `FUN_005c0ae0` refuses past the pull's count
  (`kit+0x818`, D:L476439; zeroed at the let-go, D:L476380-476382, D:L476398-476400) and while the wait runs (`kit+0x81c`,
  D:L476446; set at the round, D:L475516-475517). The PKM's and LMG's AUTO (10,000 a pull) are unchanged by it.
- **Its report and flash**: for class 230 `FUN_005c5340` takes the M203 item's record (0x8d, D:L479422-479428), plays its
  fire anim on the turret's node `+0x284` (D:L479429-479431, D:L479463-479480) and its fire sound by distance
  (`FUN_003d2c50`, D:L479449-479451; research 81): the disc's M203 (141) `FireAnimName muzzle_m203`, `FireSoundClose
  .M203_GREN`, no Med or Far. `FUN_003d2d70`'s own sound by distance finds no `FireSound*` on 230 (D:L325671-325698).
- **The disc** (`RUN/ZWEAPON.ZAR` `zweapon.rdr`, the fixture, through `readKitTable` -> `kitTableOf` -> `throwableRecord`
  and `weaponRecord`, and its raw keys through `parseRdr` / `rdrGet`): MGL FRAG TURRET 230 `Muzzle_Velocity 27`,
  `Gravity_Acceleration 3.9`, `Timer1 10`, `Timer2 10.1`, `ArmingDistance 10`, `ImpactRadius 40`, `FireWait 1`,
  `MaxFireMode 1`, `Ammo_Capacity 24`, `NumMags 3`, `ModelName M203`, `FireAnimName m203he_start`,
  `DefaultSpecialAnimName he_grenade`; `zweapon.rdr` is in `ZWEAPON.ZAR` alone.

**The port (PAR-59, `agent/par59`; reading, pending review).**
- `@s2u/scene` `kitTableOf` (`arsenal.ts`): class 230's projectile -- `throwableRecord` of its own record, its
  ammunition's `Piercing` -- goes into `KitTable.rounds` beside the launcher rounds, so the room's blast (`thrown` by the
  name) and every page's flight (`GrenadeThrower.setRounds` at the spawn, `launchRemote`) know it as they know an M203
  round. No loadout holds 230.
- The room (`match/src/room.ts`): `turretRecord` reads `turret2Records` after `turretRecords` (the rate); `TurretState.round`
  (`turretLaunched`: the class-230 record's projectile, else null); `turretRound` returns it; `fire`, past its gates
  (swap, NoFire, binoculars), hands a round to `turretLaunch` instead of the line: the projectile launched from `muzzleAt`
  down `gunLine` at `Muzzle_Velocity`, one shot counted (PF-26), flown and its blast dealt by `flyGrenades` / `blast`, a
  `grenade` event to the others; the occupant's page flies its own (the launcher rounds' rule). The rate is `fire`'s
  turret rule over `FireWait` 1. `TURRET_LAUNCH_INHERIT_READING` (s4) names the launch's inherited vector, none.
- The page: `matchActions.ts` `turretRecord` reads `turret2Records` too, so the mounted trigger claims at `FireWait` 1;
  `turretFrame` counts the pull's rounds (`roundsPerPull` of the held weapon's mode: one on SINGLE, from the let-go);
  `matchFirearm.ts` `turretRound` flies a class-230 round as a launcher's round (`FirearmHands.launched`: the flight and
  its `m203he_start` zAnim) from the room's line at `Muzzle_Velocity`, and draws no line.
- Tests: `packages/match/test/roomTurrets.test.ts` "PAR-59 ..." (Crossroads' turret 1 standing in, holding MGL FRAG
  TURRET and its 72: no MGL map is a fixture), `packages/viewer/test/matchActions.test.ts` "PAR-59 ..." (and the PKM's
  AUTO unchanged), `matchFirearm.test.ts` "PAR-59 ...", `matchThrow.test.ts` "PAR-59 ..." (another page flies the room's
  round), `turretPage.test.ts`'s PAR-57 table test (230 in `rounds`, never in `turretRecords`).
- **Not built:** the flash of the read above (`muzzle_m203` on the turret's node); the report (`.M203_GREN`) is built by
  M203-FIRE-SOUND (2026-10-17, research 94 §C4.5): the occupant's page and the others' play it by the camera's distance
  before the round record's `m203he_start` zAnim, as the carriers' M203 rounds, which take the same redirect
  (D:L479422-479426: ids 171-175 and 181-183), now do. *Was:* "the report and flash of the read above (`.M203_GREN`,
  `muzzle_m203` on the turret's node) -- the page plays the round record's `m203he_start` zAnim, as the carriers' M203
  rounds do, which take the same redirect (D:L479422: ids 171-175 and 181-183) and are not built either". The room does not hold a pull to one round (it sees no
  pull, as for the firearms, `fire`'s BL-1 note) -- the page's trigger does. Not run: a browser (the round's model, its
  arc and blast on MP10, MP52, MP62 or MP73); capture B 13 (an MGL round's line, arc and report).
- **The rendered spec (PAR-63, 2026-10-12, `agent/par63`):** `packages/viewer/e2e/turretMgl.spec.ts` mounts
  `mp10_turret_mgl` in the page's own match on MP10 and asserts PAR-57's box (24/24, 2 MAGS, `turret_mgl.tif`, SINGLE),
  PAR-56's hidden row (the model's `fireModeRow` and no `firemode` quad), and PAR-59's round: one a pull (the room's count
  of the turret and the page's own flight), 270 u/s, 39 u/s^2, `Timer1` 10, none from a pull let go inside `FireWait` 1 s
  and one after it. Not the report and flash (not built), nor the impact and blast (where the round lands on MP10 is
  unread). Written, not run by its author: the controller runs it in the host's browser slot.

### 8.2 The reticle while mounted, and the rounds against it (2026-10-17, PARITY-2 TURRET-RETICLE, issue #283; reading, pending review)

The owner's playtest (2026-10-17, his words): "the turret appears to keep whatever weapon that's equipped's reticle, is that
correct or did they have their own? it looked strange when using an M203 (and it shot a little down and right of the
reticle)". A source inspection (the decompilation, and the ELF's bytes through a scratch disassembler), the disc's data
through the repository's readers, and a headless measurement over the port's own functions; no capture (none holds a
mount, s8), no browser run.

**The read.**
- **The set: the turret's own, set 0.** The mount adds the turret's slot and takes it up (`FUN_005463c0`
  D:L412214-412218, s8), and the switch asks the set of that slot (`FUN_005c4b10` D:L478907-478912 -> `FUN_005be300`, its
  record through `FUN_005c67d0` / `FUN_005c6600` D:L479603-479708). `FUN_005be300` (D:L474896-474951) gives ids 0xbe-0xfd
  set 0 and the carrier test `FUN_003c5d80` (D:L317277-317301: 0x34, 0x3d, 0x3f, 0x8e, 0x8f, class 0x91) passes none of
  the turrets: PKM TURRET 205 (`RMG_turret`), LMG TURRET 207 (`LMG_turret`) and MGL FRAG TURRET 230 (class 230, the
  `30mm_MGL_turret`) all draw **set 0, the sidearm's cross** (`ret_sidearm_01` ring, `ret_sidearm_02` arms; research 321
  s2.1) -- the MGL not the launcher's set 3. Each record has one zoom mode (`ZoomMode0` 1.5, the fixture's `zweapon.rdr`
  through `readKitTable`), so no magnification and never the scope's 5; the 9x view's 7 only in view 4, which the
  original's zoom does not reach while mounted (research 84 s7.1, Z3), nor the port's since TURRET-CONE's review F2 and
  LATER 97 (below). *Was:* "... -- the port's does: it keeps the mount-time view and steps against the rifle (LATER 97,
  the review's F2)"; before it, "which the zoom does not reach while mounted (research 84 s7.1, Z3)".
- **What was held does not show.** The kept slot (`+0xebc`) is asked again only at the release (D:L412005): an M4A1-M203 in
  a round mode (the port's set 3), its rifle (1), a grenade (4, the meter) or a raised launcher -- the original draws set
  0 over all of them; the switch zeroes the throw's power (D:L478914-478915), so no meter either.
- **The size is the turret record's bloom** (the kit's tick `FUN_005c2670` reads the selected slot, research 321 s3):
  standing PKM TURRET 15-35, LMG TURRET 6-30, MGL FRAG TURRET 2-6, halved in third person (D:L69730-69735); the stance row
  is `TURRET_RETICLE_STANCE_READING` (s4).
- **The rounds: the gun's line, no convergence, the kit's cone.** `FUN_005be9a0` takes the mounted origin from the turret's
  vfunc `+0x60` (D:L475525) and, after converging on the aim point `+0x1458` (D:L475550-475560), overwrites the direction
  with the turret's vfunc `+0x68` (D:L475600); the vtable 0x408250 (s7.4) holds 0x3a71a0 and 0x3a71d0 there, which copy
  `turret+0x380..+0x388` and `turret+0x38c..+0x394` into the caller's vector (the ELF's bytes; the stack vector checked at
  0x5bf504-0x5bf544). `+0x380` is the firepoint node's world place (`FUN_003a8f50` D:L300418-300428, run while occupied by
  `FUN_003a95b0` D:L300633-300634), `+0x38c` the gun part's world -z (`FUN_003a7350` D:L299398-299406). Then the
  controller's `+0x74` (D:L475601-475602): `FUN_00592260` -- the cone (research 84 s5) -- in the player's vtable 0x6694b0
  (`FUN_00598280`'s, whose `+0x3c` is the arc's `FUN_005970b0`), the remote's 0x669590 and 0x6699f0 alike (the ELF's words).
- **The arming grey** (the review's F1, 2026-10-17; re-read at the source): `FUN_00215c10` takes the record of the selected
  slot through `FUN_005c3780` (D:L477826-477834: `FUN_005c6600` on `+0x824`, the round's slot for a carrier in a round
  mode) and greys the arms only when that record is of class 0x91 (`FUN_003c5ca0`, the rocket launchers 145-150) or 0xb9
  (`FUN_003c5c70`, their rockets 185-189) and the aimed point `+0x3c0` lies inside its `ArmingDistance` (`FUN_003d2030`,
  `+0x68`) (D:L70222-70258; the classes `FUN_003d1a60` D:L324331-324352). Mounted the slot is the turret's -- PKM and LMG
  TURRET class 0xcd, MGL FRAG TURRET 0xe6 -- so **no grey on any turret**: not the held rifle's round mode's (the port's
  before the fold), and not the MGL's own round's either (its `ArmingDistance` 10 notwithstanding; the review asked for
  that grey, the class gate refuses it). **On foot, built (ARMING-GREY, issue #300, 2026-10-17; reading, pending
  review):** by the same gate an M203, F2000 or GL round (class 0xab, 171-184) never greys the reticle -- the M4A1-M203,
  M16A2-M203, F2000, M79 and MGL in a round mode alike. A raised LAW or RPG-7 does: its slot's mode is its round's id
  (`MaxFireMode` 0; spawned on its first round, and the switch cycles back to a round while the kit holds one,
  `FUN_005c4600` D:L478580-478600 through `FUN_005c4480` and `FUN_005c45c0`), so `FUN_005c6600` (D:L479628-479660; the
  carrier test `FUN_003c5d80` passes class 0x91) moves the selected record to the rocket's slot -- LAW HEAT 185, RPG
  186, class 0xb9 -- and the grey runs at **the rocket's** `+0x68`, 10 m (100 units, the disc's `ArmingDistance` 10 on
  both, `zweapon.rdr` through `readKitTable`). The launcher's own record (class 0x91) is the selected one only where no
  kit slot holds an item of the mode's id (the redirect's loop finds none, D:L479634-479657); its `ArmingDistance` is
  absent on the disc (LAW 145, RPG LAUNCHER 146: 0), so it never greys. The loop takes a matching slot with no rounds
  when none has any (D:L479650 before the break), so a spent rocket's slot still greys if it keeps its record -- no
  write clearing a kit slot's `+0xe4` was found among the kit's (D:L468000-482000 hold three writes: `FUN_005b7ba0`
  D:L471283 and `FUN_005bc410` D:L473829 set one, `FUN_005b9a00` D:L472331 closes the gap of a slot already empty); the
  page keeps the record while the launcher is up (owed: capture, the LAW's reticle after its one rocket at 5 m). Built:
  `packages/viewer/src/firearms.ts` `armingGreyOf` (the class gate over `@s2u/scene` `itemClass`) and
  `packages/viewer/src/matchFirearm.ts` `armingRecord` (mounted: none; the launcher up: its rocket's record from the kit
  table, `FirearmHands.launcher`, `./matchThrow`'s `RocketLauncher.held`; an item up: none; else the round mode's).
  Tests: `matchFirearm.test.ts` "ARMING-GREY: an M4A1-M203 in a round mode does not grey ...", "... nor the M79 ..."
  (RED before: `'range'` at 5 m) and "... a raised LAW and RPG-7 grey inside their rocket's 10 m ... and not at or past
  it" (RED before: `'rest'` at 5 and 9.9 m -- the page's LAW and RPG-7 had never greyed, the grey reading only the
  rifle's round mode); `firearms.test.ts` and `reticleClass.test.ts` re-pinned to the gate. *Was:* "*Found, not this
  row's:* by the same gate an M203 or M79 round (class 0xab, 171-184) never greys the reticle, where the port greys
  every round mode with an `ArmingDistance` (`roundArmingOf`, R94.16; research 321 s4.1 item 5 names the two tests
  without their classes) -- for the seat, a row of its own" (recorded, no code change).
- **The camera** (s7.7's open line): the mount keeps the camera on the body -- `FUN_002956e0` (called D:L412191) sets the
  turret as its object and the actor, through the turret's controller, as its body (D:L139716-139746) -- with a one-second
  blend from the old eye and target (D:L140729-140790), the view state left at 0 in third person (1, or 2 on a THERMAL
  turret, from any view from the head: D:L412247-412255, `+0x298` the definition's THERMAL, D:L300794, D:L301769-301771;
  built by LATER 97, below; *was:* "only from first person"). Its
  pitch while the gun pitches is unread (`TURRET_CAMERA_PITCH_READING`, s4, note only).

**The measurement** (a scratch vitest over the port's `holdStep`, `PlayerCamera`, `muzzleAt`, `gunLine`; at rest, no flick;
outside the tree): the round line runs parallel to the reticle's ray (0.000 degrees; 0.013 at one stop), **3.26-3.28 right
and below it** -- 5.09-5.30 at a level aim (`mp51_turret03`'s raised floor 5.97-6.48, MP10's MGL 5.77), 4.0-4.8 at the low
pitch stop, 7.3-8.3 at the high one; on the 640 x 448 frame at the map's fov, 24-25 px right and 40-46 px down 20 units
past the muzzle, 16 and 27-31 at 50, 10-11 and 17-20 at 100, 6 and 10-12 at 200 (Crossroads' two, Vigilance's four, MP10's
three). The cause is the muzzle's place off the camera's line with no convergence -- the original's geometry as read (the
same hold place, s7.5, the same camera transcription, `../../packages/viewer/src/playerCamera.ts`) -- not the set drawn
and not s7.8's flick gap. The owner's "down and right" is that offset; the round line is not changed.

**Built (TURRET-RETICLE step 2a, the page; reading, pending review).** `packages/viewer/src/matchFirearm.ts`: mounted
(`FirearmHands.mounted`, the turret's id `FirearmHands.weapon`), `aimReticle` asks the set of the turret's id at its own
mode -- the held item and a raised launcher not asked -- lays the meter at 0 and the scope bitmaps by that id;
`gunFrame` runs the bloom on the turret slot's record off the kit table (`turretRecords`, `turret2Records`) at
`TURRET_RETICLE_STANCE_READING`'s row, and (the review's F1) no arming grey while mounted; the rifle's record again at the release (the swap carries the size, research 321
s3.2; the reset deviation D3 unchanged). Tests: `packages/viewer/test/matchFirearm.test.ts` "TURRET-RETICLE: mounted, the
set is the turret slot's ..." (RED before: sets 3, 1 and 4 and the meter drawn, on all three turrets) and "... the size is
the turret record's bloom ..." (RED before: 1.25, the M4A1-M203's), "TURRET-RETICLE (review F1): ..." two (RED before:
the grey `'range'` from the held M203 round on the PKM and on the MGL); pins `reticleClass.test.ts` "TURRET-RETICLE: the
turrets' set" and `turretPage.test.ts` "TURRET-RETICLE: at rest the round runs parallel to the reticle's ray ..." (a
mutant converging the round on the reticle's point fails it: 0.35 degrees off parallel; since the review's F3 every check is
the page's own `TurretPage.round()`, twelve asserted, and a mutant tilting that round's line fails it, 0.42 degrees -- the
room's `turretRound` is not driven by it).

**The cone's size while mounted (2026-10-18, PARITY-2 TURRET-CONE step 1; reading, pending review).** A source inspection
(the decompilation) and the disc's data through the repository's readers (`zweapon.rdr` in the fixture `RUN/ZWEAPON.ZAR`,
`readKitTable`); no capture. `FUN_00592260` (D:L451531-451577, research 84 s5) reads the body's `+0x5d4/+0x5d8/+0x5dc`,
which `FUN_005bd100` writes (D:L474254, D:L474262, D:L474271) from the kit's knock `+0x20/+0x24` and size `+0x84c` --
the unscoped branch, the view under 4 mounted (D:L474214-474226) -- each tick of the player's controller (`FUN_00594cf0`
D:L453666, no mount gate on its path; mounted it takes the depth ratio off the turret's firepoint, vfunc `+0x60`,
D:L474233-474239). Each mounted round also runs the kit's round step on the selected slot's record -- `FUN_005be9a0`
D:L475604 -> `FUN_005c5340` (the slot's record `FUN_005c3740`, D:L479219) -> `FUN_005c3360` (D:L479542) -- which mounted
is the turret's: at its stance row (`FUN_0058a720(body, 1)`, D:L477722; `TURRET_RETICLE_STANCE_READING`, s4) the knock
`kit+0x24 -= ReticuleKnock` (D:L477755-477760), clamped to +-`ReticuleKnockMax` (D:L477784-477795), and the size `+=
TargetDilateUponFire x (1 + the burst scalar)`, clamped to `[TargetMin, TargetMax]` (D:L477797-477805); the pull's count
`kit+0x818` is zeroed while the trigger is up and at its release (`FUN_005c0ae0` D:L476380-476382, D:L476399-476400, via `FUN_005c0fd0` D:L476569; the port resets on the press and the
release, the same for any round). (Was: "restarts on the trigger's edges (`FUN_005c0fd0` ...)"; TURRET-CONE P1's review
F1.) The 'stand' rows:

| turret | `ReticuleKnock` | `ReticuleKnockMax` | `TargetDilateUponFire` | `TargetConstrict` | `TargetMin`-`Max` | `ReticuleKnockReturn` |
|---|---|---|---|---|---|---|
| PKM TURRET 205 | 0 | 15 | 8 | 40 | 15-35 | 42 |
| LMG TURRET 207 | 0 | 50 | 4 | 17 | 6-30 | 42 |
| MGL FRAG TURRET 230 | 0 | 70 | 0 | 60 | 2-6 | 60 |

(PKM and LMG `AccBurstCnt` 4-16, `AccScalar` 0-0.001; MGL 0. The crouch and prone rows knock -- PKM 8 and 7, MGL 9 -- so
the knock rests on `TURRET_RETICLE_STANCE_READING`.) So the cone's offsets are 0 mounted but for a knock carried from the
rifle (`SWAP_KNOCK_READING`, research 321 s3.2), returning at 42 or 60 px/s and clamped at the turret's first round to its
`ReticuleKnockMax` (on the PKM, 15); the half side is `size x ty x 0.707` (`ty` 0.0023823 a pixel at the map's FOV,
`tangentPerPixel`): PKM 0.0253 at rest to 0.0590 at 35, LMG 0.0101 to 0.0505, MGL 0.0034 to 0.0101. A round on the PKM adds 8
(15, 23, 31, 35 in three rounds at once; at automatic, 0.096 s a round against 40 px/s of constriction, 35 at the fourth
round), on the LMG 4 (6, 10, 14, 18; about ten to 30), on the MGL none.

**Built (TURRET-CONE P1, the page; reading, pending review).** `packages/viewer/src/matchFirearm.ts`: `turretRound` (this
page's own mounted round) runs `Accuracy.round` at `TURRET_RETICLE_STANCE_READING`'s row on the turret slot's record
(the one `gunFrame` sets), before class 230's launched path, its `dropZoom` handled as the rifle's; `trigger`, when the
turret takes the press, restarts the pull's count (`Accuracy.trigger`). What players see: the turret reticle blooms per
round as the original's; the rounds flew straight until the room half (built 2026-10-18, below; *was:* "the rounds
still fly straight until the room half"). Tests:
`packages/viewer/test/matchFirearm.test.ts` "TURRET-CONE: a mounted round blooms the turret record's reticle ..." (RED
before: '205: 15 15 15 15; pull 0'), "... a rifle knock carried into the mount is clamped to PKM TURRET's ReticuleKnockMax
15 at its first round ..." (RED before: -38.4) and "... the mounted cone is the turret record's ..." (RED before: the radius
0.0253 after a round, where 0.0387). A pull's count carried from the rifle into the mount (the switch writes no
`kit+0x818`, research 321 s3.2) feeds the burst scalar only if the trigger is held through the mount -- the count drops
on the first frame the trigger is up -- 8 x 1.00033 at the seventh round on the PKM; the test presses the turret's
trigger first. (Was: "until the turret's first trigger edge"; the review's F1.) **For P2 (the review's F2):** the
original rolls the cone (`+0x74`, D:L475601) before the round's bloom (D:L475604); `turretRound` blooms first, so P2
rolls the line from the cone as it stood before that call, as the rifle's `fire.setGun` `round` does.

**A known deviation, for P2 (the roll on the page).** `FUN_00592260` leaves the direction unnormalised (`dir += right·a +
up·b`, both axes `cos(pitch)` long, D:L451573-451575, research 84 s5); the port's rounds normalise it for the ray
(`./accuracy` `perturb`'s callers). For a bullet the line is the same; MGL FRAG TURRET's launched round leaves at
`Muzzle_Velocity x dir` (`FUN_003cb1a0` D:L320727-320731), so the original's speed is `|dir|` times the port's: at most
`sqrt(1 + 2 x (6 x 0.0023823 x 0.707)^2)` = 1 + about 1e-4 at its widest cone (6), less at rest. Whether `FUN_005c5340`'s
launch path normalises it first is unread. Built with P2 (2026-10-18, below): the port normalises, the deviation stands.
(Was: "Recorded, not built (no roll yet).")

**Built (TURRET-CONE, the room half and P2's wiring, 2026-10-18; reading, pending review).** The page rolls, the room
bounds, as the rifle's split. Unit tests and a headless loopback over the port's own functions; no capture, no browser run.
- *The page:* `packages/viewer/src/turretPage.ts` `TurretPage.setSpread(cone, random)`; `round()`'s `dir` is
  `unit(perturb(gunLine, cone()))` -- the gun's line (D:L475600) rolled by `FUN_00592260` (D:L475601-475602) -- on
  `MatchFirearm.turretCone()` (`matchFirearm.ts`: the kit's cone on the turret slot's record), wired by `main.ts` and
  `matchMount.ts`; with none, or a zero cone, the gun's line exactly (the TURRET-RETICLE pin). `matchActions.ts`
  `sendTurretRound` calls `round()` first and claims `from: r.from, dir: r.dir`, the eye and the aim the camera's; the round's
  bloom (`MatchFirearm.turretRound`) comes after the roll (P1's review F2).
- *The room:* `packages/match/src/room.ts` with `packages/viewer/src/net/shotCone.ts`. The occupant's `ShotCone` runs the
  turret record from the mount (`setWeapon(t.record)`; a swap's end under the mount keeps it) to the release (the hand's
  record again), at 'stand' whatever the body's posture (`AimMover.coneStance`, `TURRET_RETICLE_STANCE_READING`).
  `turretRound`, after its gates and its rate, refuses a claim whose `dir` is no direction ('dir') or lies outside that cone
  about its own `gunLine(clampAim(frame))` ('cone: cone'; `ShotCone.checkLine`: the neighbouring frames blended,
  `CONE_WINDOW_PLACEHOLDER`, `coneSlackPx`, no eye and no bind) -- through `turretDropped` (TURRET-AMMO's F5), nothing spent
  -- else spends the round, blooms the cone (`ShotCone.round` at 'stand': D:L475604 -> `FUN_005c5340` -> `FUN_005c3360`) and
  fires from its own `muzzleAt` along the claim (the MGL's `turretLaunch` too). `TURRET_ROUND_LINE_PLACEHOLDER` became
  `TURRET_ROUND_LINE_READING` (s4).
- *The bloom across a swap* (the merge controller's point 1): `ShotCone.setWeapon` is `Accuracy.setWeapon`, which carries
  the size and the knock (research 321 s3.2, `SWAP_KNOCK_READING`), so the room's carry is the page's. Measured: a 6-round
  PKM burst, the dismount, then rifle rounds at once at 0.95 of the page's carried cone's corners -- all four accepted (the
  carried cone 33.67 px, 0.05670; at the first rifle round the page 0.05530, the room 0.05642); and rifle rounds, the mount,
  then turret rounds at once at the corners -- accepted (the page 0.02526 and 0.03200, the room 0.02526 and 0.03312).
- *A refused round's bloom* (point 2): the original blooms only a round its kit's gate lets fire. `FUN_005c0fd0` asks the
  gate `FUN_005c0ae0` (D:L476569) -- the pull's count against the mode (D:L476439-476441), the `FireWait` timer `kit+0x81c`
  (D:L476446-476448), the magazine (D:L476449 on) -- and calls `FUN_005be9a0`, where the cone rolls (`+0x74`) and the round's
  step blooms (`FUN_005c5340`), only when it passes (D:L476638; the dry pull fires only through a second pass,
  D:L476622-476624; the reload's timer skips the gate, D:L476549-476567). The page's gate is the console's (`TurretTrigger`
  at the record's cadence): it blooms every round it fires and none it knows the room drops (spent or reloading: `round()`
  null; the binoculars: not asked). A round the room refuses 'rate' on its own clock (arrival jitter) has bloomed the page's
  kit and not the room's, and the room does not bloom it (a refused claim widening the room's bound would let a spray of
  refused claims open it): `checkLine`'s window absorbs the gap -- one 'rate' drop mid-burst leaves the rest accepted at
  0.95 of the page's corners (PKM at round 2 and round 4; LMG at round 2, the page about 3.7 px ahead of the room until both
  reach TargetMax).
- *Measured:* PKM bursts at 0.95 of the page's corners all fired along their claims (the page 15 -> 31 px at 0.1 s a round,
  the room 15 -> 31.67); through the loopback on Crossroads' `mp72_turret01`, ten AUTO rounds: the room's muzzle 0.0000 from
  the page's drawn one, the lines within 2.6e-8 rad, every hit 0.0000 off the page's line (out to 3048.6 units), the burst's
  spread 0.0568 rad (the page's roll seeded since the review's F4; *was:* 0.050 off an unseeded `Math.random`); the page's rolls over 20000 rounds within +-radius, 70.4 / 70.8 per cent inside the inner half
  (`signed u^2`: 70.7). Tests: `packages/match/test/roomTurrets.test.ts` "TURRET-CONE: a claimed line inside PKM TURRET's
  cone ...", "... an automatic burst ...", "... an older page's claim ...", "... MGL FRAG TURRET's launched round ...",
  "TURRET-CONE point 1(a)", "point 1(b)", "point 2"; `packages/viewer/test/turretPage.test.ts` "TURRET-CONE P2" (four);
  `shotCone.test.ts` "TURRET-CONE: the room's cone about the gun's own line" (three); `matchFirearm.test.ts` "TURRET-CONE P2:
  turretCone() ..." and the wiring scan; `matchActions.test.ts` "TURRET-CONE P2: the claim is the page's drawn round ...";
  `turretConeLines.test.ts` (the lines agree).

**The review's folds (TURRET-CONE's review, PASS WITH FINDINGS, 2026-10-18; reading, pending re-review).**
- *F2, no scope while mounted -- the read.* The original's occupant never reaches view 4 or above. `FUN_005445b0` (zoom in,
  D:L410716) takes the step past first person (state 1, D:L410791-410806) only when the actor's `+0xeb8` -- the turret it
  holds (s7.1) -- is empty; state 2 (a THERMAL turret's) stays (D:L410807-410809); from 0 it goes to 1, or 2 on a THERMAL
  turret (D:L410751-410790; research 84 Z1-Z3); and the mount sets 1 or 2 from any head view (`FUN_005463c0`
  D:L412248-412254, research 84 X10). So the scope's sway box (`Accuracy.cone` at state 4 and above) is never the mounted
  cone. *The page, built:* `packages/viewer/src/matchFirearm.ts` `stepZoom` holds 1 mounted (d-pad Up), its cycle drops 1
  to 0, and `gunFrame` drops a view past first person to 1 while mounted -- no Scope is sent. **LATER 97 (2026-10-19;
  reading, pending review) built the rest:** `packages/viewer/src/zoom.ts` `Zoom.setMount` (the turret held, its
  definition's `THERMAL` through `FirearmHands.thermal` from `./matchActions`' `turretThermal`) sets 1, or 2 on a THERMAL
  turret, at the mount from a head view (research 84 X10) and 2 -> 1 at the release (X11); `zoomIn` steps 0 to 1, or 2
  on a THERMAL turret (Z2: the ELF's bytes, 2 only on THERMAL), and holds 1 and 2 (Z3, Z11); Down takes either to 0
  (O2, O3); `matchFirearm`'s `zoomHold` is the turret slot's own while mounted (`FUN_005bd7e0` D:L474373: no carrier, so
  no round mode and no `FUN_00216770` drop); view 2 plays `to_thermal_lens_fx` (`./sights` `viewLens`; `FUN_001f0750`
  D:L52995-53020, lens mode 2 = `DAT_00408ca8`, D:L52688). **LATER 164 (2026-10-21; reading, pending review)** built
  view 2's scope tube over set 0's cross (`ChangeReticule` D:L69663-69670): `reticle.ts` `Reticle.setTube`, asked
  each frame by `matchFirearm.ts` `aimReticle` (research 321 s2.5). **LATER 165 (2026-10-21; reading, pending
  review)** built the parts' `+0x9c` at 0 in view 2. *The read:* the set into 2 at the mount (`FUN_005463c0`
  D:L412253) and by d-pad Up (`FUN_005445b0` D:L410785, D:L410850) runs `FUN_003aa020(turret, 0)` (D:L300960-300993),
  which writes 0 to the opacity `+0x9c` of the turret's `PARTS` nodes (`+0x280`, `+0x284`, `+0x288`: turret, gun,
  firepoint), `+0x28c` and its `scope` / `thermal_scope` nodes (`+0x290`, `+0x294`); the draw walk multiplies a
  node's `+0x9c` down its subtree (`FUN_00336a10` / `FUN_00336980` D:L235028-235058; research 182 s2.23) and draws
  no visual at or under 1/128 (`FUN_003374c0` D:L235418-235437) -- so the held turret is not drawn on that console.
  Outside 2 the camera's run puts 1.0 back each frame while its body holds a THERMAL turret (`FUN_001f0750`
  D:L52887-52891 -> `FUN_00543200` D:L409997-410036), and the release at once (`FUN_00545ee0` D:L412021); only the
  console's own turret object is written, so the others' pages draw it. *The page, built:* `world.ts`
  `WorldView.setNodeCut(path, cut)` (a switch of its own beside `setNodeActive`'s: an own mesh by `Drawn.cut`, an
  instance by a zeroed matrix), and `matchFirearm.ts` `cutTurretParts` from `gunFrame` after `syncMount`: in view 2,
  mounted, the held placement's (`FirearmHands.turret`, from `./matchActions`' `turrets.mounted()` through
  `./matchThrow`) `parts.turret`, `parts.gun` and `parts.firepoint` cut, given back outside 2 and at the release, each
  path once a change. *The gaps, named (source inspection; no constant):* (1) the port cuts the three part paths
  and the subtrees under them; that the `thermal_scope` node (`+0x294`) and `+0x28c` lie beneath them on every
  THERMAL placement is not held by a dev-disc case yet (`turretParts.test.ts` holds the plain turrets' only, LATER
  166) -- a THERMAL placement whose scope node sits beside the parts would still be drawn; (2) the restore is gated
  on the camera's state `+0x139 != 3` too (D:L52888): with `+0x139 == 3` the parts are not given back outside 2,
  and what state 3 is (a death camera? a spectator's?) is unread -- the page gives them back on every view but 2;
  (3) the draw's opaque branch is taken whatever the opacity when the visual's renderer flags `+0x711` or `+0x714`
  are set (D:L235422-235425), so a part with either flag would be drawn at opacity 0 -- which visuals carry them is
  unread; the page cuts all. *Was:* "Not built: view 2's scope tube over set 0's cross (`ChangeReticule`
  D:L69663-69670, research 321 s2.5) and the turret parts' `+0x9c` at 0 in view 2 (`FUN_003aa020` D:L300960-300993;
  put back each frame outside 2 by `FUN_00543200`, D:L52887-52891; what `+0x9c` is, unread)." Tests (LATER 164,
  165): `reticle.test.ts` "LATER 164 ...", `worldDoors.test.ts` "WorldView.setNodeCut ...", `matchFirearm.test.ts`
  "LATER 164 ...", "LATER 165 ...". Tests:
  `zoomTable.test.ts`, `sights.test.ts`, `matchFirearm.test.ts`, `matchActions.test.ts` "LATER 97 ...". *Was:* "; the
  THERMAL turret's 2 and the rest of the mounted zoom stay LATER 97's row". Test: `matchFirearm.test.ts` "TURRET-CONE review F2: mounted, the
  zoom never reaches view 4 or above ..." (RED before: 4 at the mount). *The room, built:* `room.ts` `onTurret` strips
  `Button.Scope` from a mounted command (the trigger, the view from the head and the binoculars pass), so the occupant's
  `ShotCone` never takes the scope's sway box (`coneFits`' scoped branch, about +-0.042 x 0.019 on the stand rows, where
  the cone is 0.0034-0.0590): a claim at 1.5 times the unscoped bound (the rest cone and its slack) is refused 'cone' on
  PKM, LMG and MGL TURRET (RED before: taken on the LMG and the MGL, the frame scoped). Test: `roomTurrets.test.ts`
  "TURRET-CONE review F2: Scope held while mounted ...". *The re-review's R1:* a scope raised before the mount is legal
  (the mount sets the view from it, D:L412248-412254) and its scoped frames stood in the cone's window for the first six
  commands mounted, and a claim dated on a pre-mount command was fired: `ShotCone.checkLine` now takes no scoped frame (no
  mounted command is scoped, so a scoped one is the rifle's), and `turretRound` refuses a claim dated on a command run
  before the mount ('before the mount', through `turretDropped`; `TurretState.mountCount`, the occupant's commands run at
  the mount). Tests: `roomTurrets.test.ts` "TURRET-CONE re-review R1: ..." (three: the 1.5-bound claim after a scoped mount
  refused on all three turrets, RED before; the pre-mount claim refused, RED before; honest first rounds accepted);
  `shotCone.test.ts` "checkLine (TURRET-CONE re-review R1) ..." (RED before: the sway box took it). Pinned with them: a
  dismount and a remount inside the window (a claim dated on the first mount's last command refused, `mountCount` moved
  with the remount) and a second player on the gun the first just left (its own `mountCount`; its claim dated before its
  mount refused; the first's opened cone, 0.95 of it, refused against its own rest cone, an honest round fired). *Was:* "so the
  occupant's `ShotCone` never takes the scope's sway box".
- *F1, two 'rate' drops in one burst -- `TURRET_JITTER_BLOOM_ADAPTATION` (s4), built:* `turretRound` splits the rate
  check: early on the occupant's commands is refused as before, with no bloom (an honest page's claims are at least
  `floor(FireWait x 0.8 x 60)` = 5 commands apart, above the cycle's 4.76); early on the event clock alone -- the arrival
  bunched -- blooms the cone when the claim lies inside it and stands as the cadence's last round (`lastFire`), then is
  refused 'rate', nothing spent. Measured: LMG TURRET with rounds 2+4 and 2+3 early on the event clock, PKM TURRET with
  2+4 -- the rest of each burst accepted at 0.95 of the page's corners, the room's cone tracking the page's (LMG 2+4:
  page 8.30 / room 8.58 px at round 2 ... 28.30 / 28.58 at round 12; RED before: 'cone: cone' from round 6, the room's
  cone falling back to 6 px). The abuse case: claims sprayed six a command for 60 commands, every one early on the event
  clock, bloom 12 times, 5 commands apart (the cycle 4.76), the room's size after each bloom equal to an honest burst's
  after the same round (23.00, 27.67, 32.33, then 35); the reviewer's spray of claims outside the cone blooms nothing (a
  pin). The command-early drops of the earlier point 2 still bloom nothing (one is absorbed by the window; two such, the
  reviewer's probe A, are no honest page's). The occupant's tell re-syncs its magazines only (`turretDropped`'s comment
  corrected: "the cone's too" was wrong). The jittered branch moves `lastFire` and not `fireClock`, and that fires no more
  rounds: only an accepted round fires and it must pass both checks, the branch only ever raises `lastFire` (it runs only
  when the command check has passed), so the command check after it is stricter and the event-clock check unchanged --
  the console's one clock is the command clock here (the page's commands are its frames), the event clock the network's
  guard over rounds the room fired, which an unfired round does not advance. Measured: claims every command for 60
  commands, a third landing early on the event clock -- 8 fired (an honest page at the room's cadence over the span: 11),
  4 jittered blooms, the fired rounds 5 or 10 commands apart and 5 or 10 ticks on the event clock (the cycle 4.76; the
  rule's own floor, the cycle less `FIRE_ARRIVAL_JITTER_TICKS`, 1.76). Tests: `roomTurrets.test.ts` "TURRET-CONE review F1
  (TURRET_JITTER_BLOOM_ADAPTATION): two rounds ...", "... the abuse case ...", "... (the pin kept) ...",
  "TURRET_JITTER_BLOOM_ADAPTATION's fireClock pin ...".
- *F4:* the lines-agree test's roll is seeded; its burst's spread re-quoted above (0.0568 rad).
- *F3:* research 321 s2.5's was-quote points here; `matchMount.test.ts`'s ACT-2 test retitled (research 250 and the
  parity registry follow, with a was-line in 250).

**A round, or an R, named before the room's mount is the hand's -- `MOUNT_ROUND_AT_COMMAND_ADAPTATION` (2026-10-19,
PARITY-2 LATER 107; reading; its fresh review PASS WITH FINDINGS, its one finding named below and filed as LATER 178).** *The rule:* the console fires the slot selected on the round's own frame
(`FUN_005be9a0` on the kit's `+0x824`: D:L475994, D:L476624, D:L476638), and the turret's slot is selected only when the
mount runs (`FUN_005463c0` D:L412217-412218; online at the new owner's arrival, `FUN_002c7d00` D:L168016-168019) -- one
machine, the round and the slot read on the same frame, no judgement after the fact. *The port, before:* the room takes
the mount at the step's top after the ask's command S has run (LATER 124, s7.9) and decides a round once the command
after it has run, so a rifle round named S -- or S - 1, arriving late -- was decided with `p.mounted` set: `turretRound`
refused it 'before the mount' (R1 above), nothing spent though the page drew it and spent it from its rifle magazine; and
an R named S was taken as the turret's reload (`reloadTurret`). *Built:* the cone's frame records the turret held after
each command (`viewer/src/net/shotCone.ts` `AimMover.turret` -> `AimFrame.turret`, set by `room.ts`'s cone tick from
`Player.mounted`); `fire` judges a round whose frame holds no turret on the hand's path (`fireAt` with no turret: the
rifle's magazine, rate, lock, muzzle and cone), the hand's record lent to the cone for the check and the bloom and the
turret's given back; `reload` arms the hand's reload for an R whose frame holds no turret. *What the port adds:* a
judgement after the fact -- the hand's round is decided after the commands run mounted since its command, so its bloom
lands that late on the kit (at most `FIRE_ARRIVAL_JITTER_TICKS` commands, the arrival bound past which a round is
'stale'). The lend is not lossless (its review's finding, source inspection): `Accuracy.setWeapon` carries the size,
the knock and the burst but resets the sway's direction (`swayRate`) to the record's, and the round's step under the lent
rifle record clamps the kit's size and knock to the rifle's limits -- so after a turret swung wide over those commands
(past the rifle's `targetMax`), the room's turret cone can be narrower than the page's for the commands that follow, and
an honest turret round at the edge refused 'cone' (LATER 178; since 2026-10-21 the round blooms at its own command and
the commands since run again, below). R1's 'before the mount' in `turretRound` now refuses only a command of an earlier hold of the same turret (a
dismount and a remount: its frame holds the turret, `frame.count <= mountCount`). Measured (unit test, the MP72 fixture's
turret 1): a rifle round named S fires as the rifle's (one shot, the rifle 30 -> 29, the turret's 750 kept; RED before:
'before the mount'), so does one named S - 1 arriving after the mount; its bloom on the kit equals the same round's
unmounted (the pull +1, the rifle record's grow and knock; RED before: none); an R named S arms the rifle's reload lock,
the turret not reloading (RED before: the rifle's lock -1); a modified page naming every pre-mount command in the history
three times over while mounted fires one rifle round (S - 2), the rest refused (204 'stale', 8 'rate'), the turret's 750
kept (RED before: none fired). Kept: a turret claim on an earlier hold's last command is still 'before the mount'.
*Was (the other kept pin, restated by LATER 173 below):* "a rifle-shaped round named S + 1 is a turret round (the turret
750 -> 749; LATER 173 is the page's round trip)". Tests:
`roomMountRoundAtCommand.test.ts` (RED-1..4, the merge controller's PIN, the two kept pins). Restated with it (the merge
controller's word): `roomTurrets.test.ts` "TURRET-CONE re-review R1, restated by LATER 107 ..." and "TURRET-CONE re-review
R1 (pin), restated by LATER 107 ..." -- a turret-shaped claim (from the gun's muzzle) dated before the mount is the hand's
now and is refused by the hand's muzzle check, 'fire: muzzle walled' (measured, both scope cases and the second player),
nothing of the turret or the rifle spent and no turret tell owed. *Was (R1's two tests):* "is refused 'before the
mount', nothing spent, the occupant told its magazines"; "its claim dated before its own mount refused". Left as rows:
LATER 172 (the other P4 events judged by the present `mounted`), 173 (the round trip: rifle claims named after S, sent
before the page heard the mount), 174 (the dismount's mirror), 175 (the kit's reload timer across `FUN_005463c0`).

**The mount clip refuses every round (2026-10-19, LATER 173; reading, pending review).** The mount clip -- `Stand ->
Turret` from the rifle, `Pistol stand -> Turret` from the pistol (`DAT_003df108`, `DAT_003df110`, D:L495413-495414),
`seal_stand2turret` and `seal_p_stand2turret` -- carries a bare `NoFire ()` and `NoInterrupt ()` in motion.rdr (read
through `motionTableFromArchive` over `RUN/READERC.ZAR`, the only archive on the disc holding `motion.rdr`, 398 entries;
its only `*2turret` rows; the hold `seal_turret_stand` and `seal_turret_poses` carry neither). A bare `NoFire` refuses
over the whole play (`fireAllowed`: forward `phase > 1` never), so the console fires nothing, rifle or turret, through
the mount's 16 ticks (`FUN_005c0ae0` -> `FUN_005a7de0` D:L476442, the playing motion's flags through `FUN_0058a8c0`,
D:L462612-462705) -- and refuses it a second way, whatever the `NoFire` or the item's class: `FUN_005a7de0` asks
`FUN_005a7980(actor, 1)` (D:L462638), which answers while the current motion (`actor+0x534`, `FUN_00577e40`) is
`DAT_003df108` or `DAT_003df110` (its list, D:L462480-462490; LATER 173's fresh review). The room's mount is a `SeatSteer` (`Player.seat`), not the walker's action, so `fireCapability` saw
no motion and LATER 107's kept pin fired a round named S + 1 as the turret's. Now `aim` records the clip's `NoFire` at
`SeatSteer.phase` (`fireAllowed` over `mountClipOf`), and `fire` refuses a mounted round on such a frame before anything
is spent ('nofire'; `turretRound` spends first), telling the page `stale` -- its rifle round, sent before it heard the
mount, refunded from `sentFires` -- and owing the occupant its magazines (`turretFireOwed`) for a turret round. A round on
the ask's own command S (or S - 1, late) keeps LATER 107's hand's path: the mount is taken at the next step's top, so
S's frame has no steer and no turret. Without the motion pack (no clip shape) the room runs no steer, so there is no clip
to judge (a test room without the pack; the server loads it). Left: a page whose round trip exceeds the clip -- a rifle round named past it, sent before it
heard the mount, is still the turret's -- and the page's own refusal over its own clip (`TurretPage.ownSteer`): LATER 191.
Tests: `roomMountRoundAtCommand.test.ts` "LATER 173: ..." (two with the pack's clips; the dev-disc pin of both rows).

**The page honours its own mount clip (2026-10-20, LATER 191; reading, pending review).** Mounted, the page's trigger is the
turret's (`matchActions.ts` `trigger` -> `turretHeld`), so once it hears its mount it fired turret rounds through its own
clip, which the room refuses (LATER 173). `TurretPage.mountFireRefused` judges the clip as the room's `aim` does -- the same
`fireAllowed` over `mountClipOf` at its one-shot phase and the table (its table parameter widened to the entries' `noFire`,
all it reads). A mount keyed on `after` is judged by the command the round names, as the room decides it -- its step on the
room's count `lastSeq - after`, refused from 1 through the steer's 16 ticks at that step's phase (the room's
`SeatSteer.phase`) -- at any round trip (the merge controller's call, 2026-10-20: the room decides the rounds, so the page
predicts its decision); a mount with no `after` by the clock. The turret trigger takes it after the raise latch, as `FUN_005c0ae0` orders them (the latch D:L476423-476429
before the kit gate `FUN_005a7de0` D:L476442; the gameplay seat's note): `TurretTrigger.frame`'s `refused` sends no round
and spends no cadence, keeps the pending bit, and the first frame it lifts fires at once. A rifle round the page sent
before it heard the mount is still refunded by the room's `stale` (LATER 173). Known limit, visual: past a round trip of
the clip's 16 ticks (267 ms) the page's first rounds can leave while it still draws the end of its own mount clip (its
steer catches the room's count two steps a command, `TURRET_CATCHUP_STEPS_ADAPTATION`); and a command the room never ran
(lost past `GAP_WAIT`) opens the page one command before the room, that round refused and re-synced (`keyedStep`'s note). Tests: `turretPage.test.ts` "LATER 191:
..." (the clock, the table without `NoFire`, another body's mount, the keyed steer, a keyed mount heard late -- judged by the round's command); `actionWiring.test.ts` "LATER 191:
..." (lowered and not).

**The other asks, and the dismount's rounds, judged by their command's turret (2026-10-20, LATER 172 and 174; reading,
pending review).** *The rule:* LATER 107's -- the console acts on one frame, one machine: the slot in the hand is the
turret's from the mount's own frame (`FUN_005463c0` D:L412214-412218) until the release (`FUN_00545ee0`
D:L411941-412032), the round fires the slot selected on its own frame (`FUN_005be9a0` on `+0x824`), and the swap gate
reads the actor's turret `+0xeb8` on the frame it is asked (`FUN_005a8cb0` D:L463174); PF.R31 refuses a mounted body's
other events. *The port, before:* the room judged a `throw` (every kind), a `throwStart` and a hostage order at their
arrival, and a door, a switch's action and a bomb drop at their decision (LATER 116), by `Player.mounted` then -- so one
named on the mount ask's own command S arriving after the take was refused 'mounted', and one forged on the dismount's
own command d judged after the release passed; and a turret round named d decided after the release (taken before
d + 1, LATER 104) went down the rifle's path ('muzzle walled', though the page drew it), its R the rifle's reload. A
mounted `throwStart` was tallied twice ('mounted' and 'shape'). *Built:* `Room.mountedAt` -- the turret the frame of the
named command holds (`AimFrame.turret`), or the present `mounted` for a command with no frame (not yet run at an
equipment use's arrival, dropped, past the history) -- judges `mountedRefused` and `decide`'s immediate asks
(`MOUNT_ASK_AT_COMMAND_ADAPTATION`), the frame read only within `FIRE_ARRIVAL_JITTER_TICKS` of the body's newest run
command (`decide`'s stale measure; the fresh review's F1: an older pre-mount command, still in the history, let a
forged mounted page set off a Detonator or lay a charge at once from the turret); `fire` takes a round whose frame holds a turret the body no longer holds down that
turret's path (`turretRound`, its record lent to the cone, the hand's given back; the count told to every page), refused
'nofire' when named inside the mount clip (its frame's `fire` false, as LATER 173's mounted check; the fresh review's
F2) and 'released' while another holds it, and `reload` arms nothing for such an R -- the release dropped the slot's timer
(`TURRET_RELEASE_RELOAD_READING`) -- (`DISMOUNT_ROUND_AT_COMMAND_ADAPTATION`); `throwStart` tallies its shape and its
mount apart. *What the port adds:* the turret round's bloom lands on the kit after the release (at most
`FIRE_ARRIVAL_JITTER_TICKS` commands), under the lent record -- LATER 178's lossy lend, the other way (since 2026-10-21 bloomed at its own command, below). *Left:* an
equipment use other than a throwable's is judged and laid at its arrival on the present body (its command often not yet
run: the present `mounted`; LATER 205); a pickup is judged by `WorldDrops` on the seat's present `mounted` (LATER 204);
a throwable sent before the page heard the mount is thrown from a mounted command (LATER 206); ~~a forged round on d
spends past the turret's empty magazine or its reload (LATER 207)~~ (done 2026-10-26: judged on the hold's kept
magazines and timer, `TurretState.released`). Tests: `roomMountRoundAtCommand.test.ts` "LATER 172
RED-1..4", "LATER 174 RED-1..4", "LATER 172 F1", "LATER 174 F2"; restated (the merge controller's word):
`roomTurrets.test.ts` "LATER 116 (e3's forged seqs), restated by LATER 172 ..." -- a door on d refused 'mounted'. *Was:*
"one within the arrival's jitter before it passes -- the named residual". *Measured* (unit tests, one file each with the
disc's env, 2026-10-20; no browser run): RED on the tests' commit, `roomMountRoundAtCommand` 8 failed | 9 passed (17) and
`roomTurrets` 1 failed | 67 passed (68); GREEN on the build, 17/17 and 68/68, and the match process's replay
(`central/test/matchProcessReplay.test.ts`, the room since the server split) 10/10. The fresh review's folds: RED on
their tests' commit, "LATER 172 F1" and "LATER 174 F2" both failed (the S - 10 Detonator and Claymore reached their
handlers, 'no claymore' and 'none left'; the clip round spent the turret 750 -> 749); GREEN on the folds merged with
main 5b0e9ab27, `roomMountRoundAtCommand` 19/19, `roomTurrets` 68/68, `matchProcessReplay` 10/10.

**The lent round bloomed at its own command, the commands since run again (2026-10-21, PARITY-2 LATER 178; reading,
pending review).** *The rule:* LATER 107's -- one frame, one machine: the round blooms the kit on its own frame by the
slot selected on that frame (`FUN_005be9a0` on `+0x824`; the bloom `FUN_005c5340` then `FUN_005c3360`, `Accuracy.round`),
and every later frame runs on the kit that round left. *The port, before:* the room decides a round once the command
after it has run (`due`), so a round lent across a mount (`MOUNT_ROUND_AT_COMMAND_ADAPTATION`) or a release
(`DISMOUNT_ROUND_AT_COMMAND_ADAPTATION`) was bloomed on the present kit after the commands run since, by the lent
record's row, and those commands kept no bloom of it. Measured (unit tests on the MP72 fixture's turret 1, the gameplay
seat, 2026-10-21; the page's cone is the room's own calls replayed in the page's order): the M9 in the hand at S (its
`TargetMax` 26 against the PKM TURRET's 35), the turret swung from S + 1, the round decided after S + 3 -- the room's
size 5.0 px under the page's from S + 4 to S + 18, its knock 2.1 px higher to S + 28; honest turret rounds at the page's
cone corner on S + 17 and S + 18, the first commands past the mount clip, refused 'cone' (at 0.914 and 0.924 of the
page's radius). Without the motion pack (no clip): a turret round at the corner on S + 1 .. S + 3, the commands run
before the decision, refused 'cone' (0.993). The release's mirror (LATER 174's lend; `roomMountRoundAtCommand.test.ts` RED-4, the fresh review's F1, 2026-10-21): the commands run before the decision, d + 1 .. d + 3, 8 px narrower than the page's (its frames recorded without the turret round's bloom), level from d + 4 to within 1e-6 px; the kit 4e-15 off. *Was* (the read's figure, which RED-4 does not reproduce): "never narrower, up to 2.5 px wider".
The sway's direction the row named (`setWeapon` resetting `swayRate`) does not bind: the cone's check reads the frame's
sway limits (`coneFits`), not the direction. *Built:* `viewer/src/net/shotCone.ts` keeps, beside each frame, the command
as the cone ran it -- the record, the trigger's and the scope's edges, its `Accuracy` input, the kit after it
(`Accuracy.save`) and the rounds bloomed on it. A round named on a command after which a frame holds another turret, or
none (a mount or a release run since), is bloomed at its own command: the kit put back as it stood after that command
(`Accuracy.load`), the round bloomed by that command's record (`Accuracy.round`'s `weapon`), and every command since run
again in the order the page ran it -- its record, its edges, its input -- its frame's cone re-recorded and its rounds
bloomed by their own records; the record held now set last (`ShotCone.round`, `replay`). `room.ts`'s two adaptations'
doc strings say so; no code of the room changed. *Its cost* (the merge controller's condition 2): at most the commands
held after the round's -- 63 of the 64-command history. *Since LATER 248 (2026-10-21; reading, pending review):* every
round with a command run since its own replays -- every round the room decides, which waits for the command after
(`room.ts` `due`): the page ticks the cone before the round (`matchFirearm.ts` `gunFrame`, then `fireFrame`), as
`FUN_005c0fd0` runs the accuracy tick `FUN_005c2670` (D:L476543) before the fire (D:L476624/476638); a round on the
newest command, or one no longer held, replays none; a swap's press run since is taken too (LATER 210, done by it).
*Was:* only for such a round (a mount or a release since; LATER 233's leave), an ordinary round bloomed on the present
kit after the command since, one tick off the page; a swap's press run since not taken (a round named on the command
before the press bloomed by the sidearm's row: LATER 210). *Restated* (the merge controller's word): `roomMountRoundAtCommand.test.ts` "RED-3: its bloom is the
rifle record's ..." -- the size the page's (bloomed at S, then S + 1 run on the turret), its pull and knock assertions
kept. *Was:* "the rifle record's grow" added to the turret's kit after S + 1 ran. Tests:
`roomMountRoundAtCommand.test.ts` "LATER 178 RED-1" (S + 17, S + 18), "RED-2", "RED-3", "RED-4";
`viewer/test/shotConeReplay.test.ts` (the cost: the worst case's re-run count and time, a release's, the ordinary
rounds'); `central/test/matchProcessReplay.test.ts` "LATER 178: ..." (a turret game whose gunner's hand round, named on
its mount ask's command, goes after the room ran a mounted command: the match process's room and today's give the same
cones and verdicts). *Measured* (unit tests, one file each with the disc's env, 2026-10-21; no browser run): RED on the
tests' commit (e79466d49's sources), `roomMountRoundAtCommand` 6 failed | 18 passed (24) -- RED-1 x2, RED-3 and LATER
107's restated RED-3 refused 'cone' or held the clamped kit (size 24 against the page's 15), RED-2 0.046 off at S + 1,
RED-4 (since the fresh review's F1, the frames compared first) d + 1 .. d + 3 8 px narrower, level from d + 4 -- and `shotConeReplay` 3 failed | 1 passed (4) (no replay: 0 commands re-run where 63 and
54 are owed; the ordinary rounds' test passes before and after); `matchProcessReplay` 12/12 (its A=B case a guard: the
gunner's late round sent and its shot told, 1 and 1). GREEN on the build merged with main 78c0526c7:
`roomMountRoundAtCommand` 24/24, `shotConeReplay` 4/4, `matchProcessReplay` 12/12 (the late round 1, its shot 1, the
cones and every frame identical), `roomTurrets` 68/68, `roomTurretTick` 13/13, `roomTurretAmmo` 21/21,
`roomRifleJitterBloom` 6/6, `roomTurretMountAtCommand` 12/12, `roomNetHardening` 52/52, viewer `shotCone` 25/25,
`accuracy` 41/41, `zoomTable` 63/63, `yawWinding` 14/14, `weapons.parity` 20/20, `turretConeLines` 1/1, `matchFirearm`
79/79, `gameFrameHybrid` 8/8, central `roomSwapCone` 3/3 and `room` 193/193, tools `conventions` 105/105 and `sa3Move`
33/33; none skipped. The replay's cost, the worst case (200 rounds, each re-running 63 commands): mean 0.044 ms, median
0.035 ms, max 0.42 ms a round, under the test's stated 2 ms mean.

**Not built:** the camera's pitch. **Owed:** capture B 13 (a mounted HUD frame; a burst's spread at range; the pitch stops
from behind). *Was:* "**Not built:** the cone's roll on the round (the row TURRET-CONE: the page's P2, `TurretPage.round`'s
line by the kit's cone; the room's half -- its `turretRound` accepting the claim's line inside its own run of the turret
record's cone, after SA-3's paths); the camera's pitch."

### 8.3 The rifle's raise and the mounted fire (2026-10-19, PARITY-2 LATER 95; reading, pending review -- source inspection)

`FUN_005c0ae0` refuses a bullet-class item's round (`FUN_003d1e20` D:L324476-324483) while the rifle's raise envelope
`actor+0x1160` (research 211) reads below 1 eased (`FUN_00286b80`), with the trigger in state 1 or 2 or the pending bit
already set (D:L476420; states 0 and 3 return before it, D:L476381-476416): first a latch -- the pending bit `kit+1 & 4`
clear, it is set and the frame refused, any class (D:L476423-476429); then, the latch set, every frame while below 1
except class 205 (0xcd: ids 205-229, `FUN_003d1a60` D:L324350; PKM TURRET 205, LMG TURRET 207) (D:L476433-476438); the
bit cleared when a round goes (D:L476625-476627, D:L476639-476641). **The envelope's times follow the slot in the hand**
(research 211 s2 step 2): the kit's take-up of a slot (`FUN_005c4b10` D:L478849-478857) sets a firearm's -- in 0.1 s,
hold 100000 s, out 0.5 s (`FUN_005dffc0` D:L494280-494288) -- and every other class's to 0 (`FUN_005dfff0`,
D:L494293-494300; class 0xcd is none of `FUN_003d1db0`, `FUN_003d1da0`, `FUN_003d1d90`, D:L324424-324455), while
`FUN_005c8a20` (D:L481460-481466, D:L481562-481567) zeroes only the grenade classes 0x79 and 0x97 (D:L481437-481459,
D:L481540-481561) and gives every other class, a turret's included, the firearm's times; so the mount's take-up
(`FUN_005c4b10` D:L412218) gives a PKM or LMG TURRET zero times. Writers of `+0x1160`, among them: `FUN_005dfe30` (the
lower D:L494255; the raise D:L494264-494265, only with `actor+0x258 & 1`, D:L494258, and never for item 190, D:L494263),
`FUN_005dfc80` (D:L494206-494219), the body constructor's clear (`FUN_00553ea0` D:L419499), the forced lowers
`FUN_00551ec0` D:L418629-418643 and `FUN_00543f70` D:L410501-410517 (their conditions unread); `FUN_005dfe30` has some
fifteen other callers (among them `FUN_005966a0` D:L453884, the throw's lower D:L453488, `FUN_0054a3d0` D:L414382,
`FUN_0055d120` D:L424606/424611), not read here. The controller asks for them in `FUN_00594cf0` (the raise at the press
D:L453634, the idle countdown's lower D:L453600 -- 5.0 s, `FUN_00598280` D:L454808) in the block that writes
`ctrl+0x118` from the fire button (D:L453543-453567), which runs mounted (the function reads `+0xeb8` only at D:L453073,
s8). **Mounted on a PKM or LMG TURRET** the zero times mean the first lower ends at once (`+0x116c` the linear times 0,
D:L494255; `FUN_005dfc80` zeroes the envelope, D:L494206-494210), and a raise restarts a zero envelope that
`FUN_005dfc80`'s raise branch parks at 0 (D:L494260-494265, D:L494213-494216): once lowered -- after 5 s idle -- the
envelope reads 0 for the rest of the mount, the press never raises it, so a pull that starts with the pending bit
clear loses the latch's frame (D:L476423-476429) -- the first after the lower or the mount, or one after a tap released
on the frame after its round -- and the class 205 exemption (D:L476433-476438) is what lets the gun fire at all; the bit
is set again on the held frame after a round (D:L476423-476429; cleared at D:L476625-476627, D:L476639-476641) and a
let-go returns before the test (D:L476381-476416), so a held burst, and a pull whose bit a let-go left set, lose none.
*Was:* "every pull's first round loses the latch's frame" (LATER 180's review, F2). MGL FRAG
TURRET (class 230, `FUN_003d1e20` 0) loses none. A firearm on foot waits for the rise: from a cleared envelope the
first round leaves **2 game frames** after the press's (`GAME_FRAME_DT`; 3 with every float32 step rounded to nearest;
computed, s8.4). *Was:* "7 raise ticks at 1/60 s in float32" -- the frame time assumed 1/60 s; the game frame is
`GAME_FRAME_DT` (the frame's order and its dt read in s8.4). Unread: whether `FUN_005c8a20`'s callers
(D:L474129, D:L475980, D:L476031) ever give a held turret the firearm's times. The port's refusal: LATER 180 (s8.4);
the rocket launcher's (class 145, a bullet class with the firearm's times): LATER 192 (s8.5). *Was:* "The port has
no raise refusal (LATER 180)"; "the rocket launcher's ... not built (LATER 192)".

### 8.4 The raise refusal's frame (2026-10-19, PARITY-2 LATER 180's read; reading, pending review -- source inspection and the ELF's words)

*The frame's order.* Each game frame the scheduler `0x49e260` runs its tasks by priority (research 230 s5.2.3:
`FUN_001ec480` D:L50920-50935; `FUN_0034e6b0` joins a task before the first of a greater priority, D:L248794-248846):
`entity_pre_tick` 1.0 (`FUN_0029f510`: every entity's slot +0x14, D:L145111-145126) before `entity_post_tick` 6.0
(`FUN_0029f1a0`: slot +0x20, D:L145053-145074). The SEAL's table 0x6691a0 holds `FUN_00551ec0` at +0x14 and `FUN_005506a0`
at +0x20 (the ELF's words). In `FUN_00551ec0` the controller's tick (its table 0x6694b0, slot +0xc = `FUN_00594cf0`; ELF
0x552100) runs at D:L418526 and the raise tick `FUN_005dfc80` at D:L418611 (ELF 0x552420, the frame's dt in `$f12` from
0x55241c); `FUN_005dfc80` hands the same `$f12` to `FUN_00286d40` (ELF 0x5dfd20 / 0x5dfd30; the decompiler drops it).
The kit's fire `FUN_005c0fd0` -> `FUN_005c0ae0` runs in `FUN_005506a0` (D:L417907). So on the press's frame the raise
ask (D:L453634) and one tick land before the fire check, and on every later frame the tick comes first. The frame's dt is
`GAME_FRAME_DT` (525/15734 s, proven; `scene/src/gameFrame.ts`).

*The count.* From a cleared envelope (the lower run out: 0.495 s, 15 game frames after its ask; a spawn), the ask starts
it at in + hold + out summed in float32 (`FUN_00286d90`): rounded toward zero (`EE_FPU_ROUNDING_READING`) 100000.59375
(0x47c3504c), to nearest 100000.6015625 (0x47c3504d) -- `seal+0xef0` is the "time since" base the ask reads
(D:L494247), not this start. Each tick takes dt off it, where the float32 step at that size is 1/128 s; the weight reads 1
once the remaining is at or under 100000.5 (D:L494213-494219; `FUN_00286b80`'s else branch). Toward zero each tick takes
5/128 s from 100000.59375: 100000.5546875 (linear 0.391, 0.305 eased), 100000.5156250 (0.781, 0.904 eased),
100000.4765625 (1) -- the first round two game frames after the press's (66.7 ms); to nearest, 4/128 s a tick from
100000.6015625 and three frames (100 ms). *Was:* "100000.6015625 in float32 (`seal+0xef0`, 0x47c3504d)" with the
toward-zero steps of 5/128 s -- a first step of 6/128 s from that start; the values shown are from 100000.59375 (LATER
180's review, F3; the counts unchanged). At 1/60 s and to nearest it would be six frames (the
"7 raise ticks" s8.3 once gave, its was-line, which assumed that step). From a partly lowered rifle the raise snaps the remaining to the hold
(D:L494213-494216) and the round leaves on the press's frame. Computed by a float32 mirror (scratch, not a test of the
repository). `RAISE_ENVELOPE_STEP_READING`, LATER 185 (2026-10-21; reading, pending review): the port's raise steps
once a game frame -- each game frame a `GameFrameAccumulator` (PF.R8) counts in the page's clamped step runs the
controller's tick (the trigger's edge, its request) and the raise tick (`FUN_005dfc80`, by `GAME_FRAME_DT` in single
precision) -- and the envelope in float32 toward zero (`FUN_00286d90` D:L130883: `(out + in) + hold`; `FUN_00286d40`
D:L130853; `FUN_00286c90` D:L130826-130835; `FUN_00286b80`'s ease D:L130804-130810; `FUN_005dfe30` D:L494247,
D:L494250-494255, D:L494268-494269; `FUN_005dfc80` D:L494213), the slot's times as their float words (`FUN_005dffc0`
D:L494280-494288, the sum 0x47c3504d the request's base). The values above are now the page's: from a cleared
envelope 100000.5546875, 100000.515625, 100000.4765625 (weights 0.3051757, 0.9042968, 1), the snap to 100000.5 on
the fourth; the first round on the page frame the press's game frame + `RAISE_REFUSAL_FRAMES` ends on -- 6 page
frames after the press at 60 Hz from a fresh count (game frames end on 2, 4 and 6: two 60 Hz frames are 34 us short of
one), 2 at `GAME_FRAME_DT`, 3 at 1/30 s; from a partly lowered rifle on the press's game frame (the snap is the
tick's). The port's own, named in the reading: the count's phase (the raise's, from its construction or reset), a
page frame's trigger -- down on any page frame since the last game frame -- release and real seconds given to the next
game frame to end (a tap shorter than a game frame kept), the dt's last bit. The Fire versions' blend and the aim's
twist (`./play` `fireWeight`, `aimWeight`) step with it, constant between game frames. *Was:* "the port's envelope
steps by the page's frame in doubles, its round on the page frame whose tick completes 0.1 s, the press's own counted
(5 frames after the press at 60 Hz: the linear weight 1 - 2.3e-10 there, which the ease rounds to 1 in doubles; 2 at
30 Hz)". `raiseRefusal.test.ts` (LATER 185's cases), `weaponRaise.test.ts` (the throws' updates at the game frame).

*Mounted.* A PKM or LMG TURRET's zero times (s8.3) keep a lowered envelope at 0, so a pull that starts with the pending
bit clear -- the first after the lower or the mount, or one after a tap released on the frame after its round -- waits
the latch's frame and class 205's exemption fires it on the next (D:L476423-476438); the bit is set again on the held
frame after a round, so the latch falls inside the rate's wait (`FireWait` x 0.8, over one game frame on both), and a
let-go returns before the test (D:L476381-476416), so a bit left set fires the next pull on its press. *Was:* "each
pull's first round waits the latch's frame" (LATER 180's review, F2). The original's bit is the kit's byte (`kit+1` bit
2, D:L476427), which the take-up `FUN_005c4b10` leaves as it was (it writes the kit's bytes 0 and 4, D:L478810,
D:L478841): a bit set on foot -- a tap released before the raise read 1 -- carries across a mount, and the original
fires the PKM's first pull on its press; the port's bit is `TurretTrigger`'s own, set by the turret's pulls only -- a
rare one-frame difference, named in `RAISE_LATCH_FRAME_READING`, not built (F4). `RAISE_LATCH_FRAME_READING`,
`MOUNT_RAISE_READING`.

*The room* models no raise and judges a round at its command; it trusts the page's refusal (LATER 180's recommendation:
a page that fires early gains at most two or three game frames once per lower). Named 2026-11-02 (P13, the
online-parity sweep's AR-3 = WK-4; an adaptation, no original -- the game has no server): `ROOM_RAISE_TRUST_ADAPTATION`
(`room.ts`, at `fireAt` and `launchRocket`); the room's raise, a headless `WeaponRaise` per seat mirroring the 5 s idle
lower and the float32 step or carrying a one-frame named slack, is LATER 641.

### 8.5 The rocket launcher's raise (2026-10-20, PARITY-2 LATER 192's read; reading, pending review -- source inspection)

With a LAW or RPG-7 in the hand the body runs its one envelope `actor+0x1160` under the firearm's times: the take-up
`FUN_005c4b10` gives class 0x91 (`FUN_003d1d90` D:L324424-324428; ids 145-150) `FUN_005dffc0`'s (D:L478849-478857) and
writes nothing else of the raise -- neither it nor `FUN_005c50b0` nor that one's direct callees (`FUN_005c6980`,
`FUN_005a70f0`, `FUN_005a7260`, `FUN_0057d5e0`) calls `FUN_005dfe30` or writes `+0x1160` / `+0xf74` (`FUN_005dfe30`'s
callers searched whole) -- so a take-up keeps the envelope: from a raised rifle the launcher is up, from a lowered one
down. The press asks the raise for every class but 'y' (D:L453633-453634), the idle countdown lowers it after 5 s as
the rifle's (D:L453600; only 'y' lowers at once), and the raise passes for any selected item but 190 (D:L494261-494263)
with `actor+0x258` bit 0 (D:L494258; taken as passed, as the rifle's, `./weaponRaise`'s header). The rocket goes through
the kit's fire (`FUN_005c0fd0` D:L476569 -> `FUN_005c0ae0`) with no branch of its own before the raise test: class 0x91 is
a bullet class (`FUN_003d1e20` D:L324476-324483 excludes 0xab, 0xb9, 0x79, 0x97, 0xbe, 0xe6), so the latch
(D:L476423-476429) and then every frame below 1 refuse it (D:L476433-476438; the exemption is class 0xcd's alone); on foot
the latch adds no frame, since it too needs the weight below 1. The rocket's frames are the rifle's (s8.4): from a
cleared envelope 2 game frames after the press's (3 to nearest), from a raised or partly lowered one on the press's
frame; a let-go first returns before the test (D:L476381-476416): no rocket.

*The port*, before LATER 192: the launcher's trigger is `FirearmHands.trigger`'s (`./matchThrow`), taken before
`Fire.pull` (`./matchFirearm` `trigger`), and `RocketLauncher.pull` (`./rocket`) launched on the press; the raise's feed
(`play.setWeaponInput`: `fire.triggerHeld()` or the turret's; `setItemRaise`: a hand grenade, a wind-up, a placing's
trigger) never heard it, so the launcher neither raised the body nor waited for it. Built: `setItemRaise`'s `trigger`
hears the launcher's trigger, held or pressed; a press launches only with the raise at 1, else the pull waits and the
part's `frame` (after `Play.frame`'s tick on both pages) asks it again while held; let go, the slot changed or dead, it
is dropped; the launcher dropped with no `equip` (OT.R59's resumed seat) or the body dead, its held trigger leaves the
raise's feed too, so the idle's countdown lowers the body (the review's F1). The times stay `RAISE_TIMES` off a mount (`./matchFirearm` `kitFrame`). The page's count is the rifle's
(`RAISE_ENVELOPE_STEP_READING`: once a game frame since LATER 185, 6 page frames after the press at 60 Hz from a
fresh count; was 5, the page's step). `LAUNCHER_PULL_WAIT_READING`: only
the raise's refusal is waited out. *The room* models no raise (`room.ts` `launchRocket` holds the take-up's
`heldReadyAt` and the FireWait's `rocketWaitUntil` only) and trusts the page, as for the rifle (s8.4;
`ROOM_RAISE_TRUST_ADAPTATION`, P13, LATER 641). Not built: another
console's copy of the body does not raise at a launcher's press -- the wire's trigger is the firearm's
(`REMOTE_HAND_RAISE_READING`); the launcher set's Fire versions, read 2026-10-26 (LATER 203; reading, pending review): `FUN_005e0690` (D:L494632-494822) runs per anim set (D:L495590-495595) and records a set's pairs only for types its own table resolves (`FUN_005e1bf0` the Fire pair, slot +4, D:L494790-494801, D:L495177-495187; `FUN_005e1af0` the Pistol fire pair, slot +6, D:L494802-494819, D:L495042-495080; `FUN_005e1cf0` the Pistol version, slot +2); the Fire and Pistol fire types are rows of `animset.rdr`'s "Seal anim set" alone, and an `include` (GLOBAL) is copied in after the pairs are registered (`FUN_005e3940` -> `FUN_005e3740`, D:L495604, D:L495624-495746; its pair table copied too, D:L495664-495684 -- so what holds is that GLOBAL's 110 rows carry no Fire or Pistol fire type at all, `animset.rdr` "GLOBAL" `anim_set_anims` `type_name`, read through the repository's readers; the 24 Fire and Pistol fire types are "Seal anim set" rows), so the "launcher anim set" (its own rows: "Crouch" `seal_launcher`, "Crouch step" `seal_launcher_step` and the raise and reload clips) records none; and `FUN_0057a330` adds no Fire layer while that set is current (D:L438829) and reads the aim's weight as 1.0 under it (D:L439153-439154). The page now does the same with the launcher up (`play.ts`: no Fire layer, the aim's weight 1); the set's body, read 2026-10-26 (LATER 504; reading, pending review): the raise calls `FUN_0058c350(actor, DAT_0044d408, 0x12, 1, 0)` (D:L462105), which makes the set current (`+0x528`), resets the clip stack, pushes type 0x12 "Crouch" -- the set's own row, `seal_launcher` -- at posture 1 and writes the stance request `+0x374` = 1 (D:L447957-447995), then the raise clip on top at posture 1 (D:L462109-462116); and under the set the stand state `FUN_00586570` writes the crouch request every frame (D:L444853-444855) (skipped while the carry's link `+0xeac` is set and the top clip's `+0x78` non-zero, D:L444814-444822 -- the launcher is not raised while carrying, and the port carries no body, LATER 494), the crouch entries accepting it at any depth (`FUN_00581990` D:L442539-442541, `FUN_00584c60` D:L444069-444071; `FUN_005857e0` D:L444340-444342 is the launcher's selectability test, research 181 §2.6, not a crouch entry -- *was* listed as one) -- so the body is on the set's "Crouch" row whenever the launcher is up, and a standing body never shows under it (the set has no "Stand" row and needs none); a stick past 0.1 on that row cuts it (`FUN_00550ef0` D:L418263-418266, the moving lower) and, with `FUN_005a7ab0(actor)` 0 (D:L418267), gives the previous set (`+0x52c`) back with the request 0 (D:L418268-418272) -- and the still lower's end the same through `FUN_0058c4a0(actor, previous set, 0)` (`FUN_005a60d0(.., 4)`, D:L461769-461771): the "Stand" row at posture 0, so the body stands again at either lower. `FUN_0058c350` does nothing when the set is already current and its fifth argument is 0 (D:L447966-447967). Built 2026-10-26 (LATER 504's port half): `Walker.launcherSetOn` (the page's `WalkMode.launcherSetOn`, the room's `launcherSet` at the command) kneels the mover at the set's start and stands it at its end, with no transition, and keeps the crouch for a stand press under the set (`retryStance`: a stand press under the set leaves the body crouched: from posture 1 the crouch state's stand (`FUN_00552d60` -> `FUN_00552ec0` D:L418880 -> `FUN_00581dc0` -> `FUN_00581c10`) pushes the "Walk" row (type 2, moving, D:L442635) or "Stand -> Crouch" reversed (0x11, D:L442640) at posture 0, and neither resolves under the launcher set -- not among its own rows nor GLOBAL's (`animset.rdr` "launcher anim set", "GLOBAL" `type_name`) -- so `FUN_00588bc0`, after `FUN_0058c820`'s remap through the set's pair table (D:L448153-448194: the type unchanged when the set holds no pair, as the launcher set holds none, LATER 203), pushes nothing (D:L446078-446080; the rows' absence pinned by `tools/test/launcherSetRows.test.ts`, the dev disc) and the stance word stays the top clip's, crouched; the request lingers until either lower writes Stand; the set followed at the tick's start, the port's frame order, so the stick's lower stands one command after the original's in-frame push, D:L418270; the set's change cross-faded, `FUN_0058c350` D:L447976, D:L447993; *was* cited to the stand state's crouch request D:L444853-444855, which is not the press's path); the animator draws the set's rows (`LAUNCHER_ANIMS`: `seal_launcher`, `seal_launcher_step`); a prone press under the set is `Walker.LAUNCHER_PRONE_PRESS_READING`. *Was:* the body kept standing through the raise on the rifle's stances; *was* unread, the port's `./weaponPose` keyed on the rifle's clips; a launcher press in the binoculars raises nothing and,
held as they close, fires nothing, while a refused pull held through them fires as they close (LATER 202). Seen, not this row's: `FUN_005a7de0`'s NoFire test follows the raise
test for every class (D:L476442), while the page's launcher trigger asks no `walk.fireAllowed()` and `launchRocket` no
`frame.fire` (LATER 199).

### 8.6 The kit's timer at the mount (2026-10-21, PARITY-2 LATER 175's read; reading, pending review -- source inspection)

- **The offer.** The mount is the action bit 0x13 (`FUN_005a88c0`, set at `FUN_005937c0` D:L452472-452474; the
  dispatcher's 0x80000 runs `FUN_00546210`, D:L452102), and `FUN_005937c0` runs only past the prompt's common gate
  (`FUN_00593500` D:L452277, D:L452295: `FUN_005a7de0(actor, 1, 0)`), which refuses while `FUN_005a7ab0` answers
  (D:L462636): the kit's timer above 0 (`FUN_005c2400` D:L477159, `kit+0x820`: a reload's `ReloadDelay` or a bolt's or a
  pump's after-shot) or a reload or pump type on the stack (D:L462512-462560). So the player's own mount is never taken
  under the kit's lock: offline (`FUN_00546210` -> `FUN_005463c0` at once, D:L412076) never; online the ask
  (`FUN_002c79f0`, D:L412083) is made only then. The release (action 20, `FUN_005a8850`) is set in the same
  `FUN_005937c0`, so the player's own release is not offered while the kit's timer runs either -- the turret's
  `ReloadDelay` included.
- **A timer at the mount.** Online the mount runs at the host's word (`FUN_002c7d00` D:L168019 -> `FUN_005463c0`), a round
  trip after the ask, and nothing in it tests the lock (D:L412130-412166). An R in that trip arms the kit's timer on the
  slot in the hand (`FUN_00594cf0` D:L453460-453463). Its only writers are `FUN_005c32b0` (D:L477661-477677),
  `FUN_005c0fd0` (D:L476550-476560) and the kit's set-up `FUN_005c8190` (D:L481050): the mount's take-up
  (`FUN_005c4b10` D:L478836-478931, which zeroes `kit+0x810`, not `+0x820`) leaves it. So it runs on; while it runs the
  turret's trigger is not read (D:L476549-476566); at its end `FUN_005c2a90` (or `FUN_005c3000` on the after-shot's flag,
  D:L476554-476558) runs on `+0x824`, the turret's slot: the turret's walk and put-in with its `ReloadSound`
  (D:L477462-477488), or refused at its gates and lost (the timer zeroed, D:L476560). The rifle's magazine is never
  taken: its reload is lost, not resumed or restarted. For a firearm on the default `ReloadDelay` (0.01 s, research 94
  C1.1) the magazine went in a frame after R, before the reply; the loss is the Spas 12's and JACKHAMMER's (0.5 s) and
  the 870's (1 s). A forced release (the knock, `FUN_0057e770` D:L440995) inside the turret's `ReloadDelay` is the one way
  `TURRET_RELEASE_RELOAD_READING`'s case arises.
- **The port (LATER 175, `agent/l175`).** The page offered the mount under the kit's lock (`turretPage.ts` `target`) and
  the room took it (`room.ts` `resolveMounts`): now `TurretPageDeps.kitLocked` (wired by `matchActions.ts` from the
  firearm's `Fire.state`) and the room's `mountKitLocked` at the ask's command refuse it ('mount: reload'): either
  weapon's lock spanning that command's count, from its start (`Player.lockStart`, kept by `setLock`) to its end
  (`reloadUntil`), the reload's delay window (`pressWindow`, LATER 72), or a reload named before the ask and still
  waiting. The span is bounded below (the fresh review's F1): a lock armed on a later command -- R on A + 1 after the ask
  on A, the commands in one read -- does not cover the ask, which the original takes (the take tests no lock,
  D:L412130-412166); was: refused, `reloadUntil` alone.
- **The mount and R on one command** (`MOUNT_SAME_COMMAND_RELOAD_READING`, 2026-10-21, the controller's ruling "read
  the order first"; reading, pending review -- source inspection). In one frame the player controller's tick
  `FUN_00594cf0` (`CSealCtrl` slot +0xc, run from `entity_pre_tick` `FUN_00551ec0` D:L418526; research 251) reads the
  Action button's release (slot 0, state 3: D:L453193-453200) and calls slot +0x78, `FUN_00592d50` (D:L453222,
  D:L453243), which runs the selected action: the mount's branch (0x80000, D:L452089-452104) asks only the turret's own
  test (its `+0x5c`) before `FUN_00546210` and reads no kit lock again -- unlike C4's branch, which asks `FUN_005a7de0`
  at the press (D:L452029). Only later in the same tick, with no return between (D:L453243-453463), does R's press
  (slot 6, state 1) arm the kit's timer under `FUN_005a7ab0` (D:L453460-453463). The selection itself was made under
  the prompt's gate (`FUN_00593500` from the picker `FUN_0021d9d0`, D:L73390) before R's arm whichever runs first in
  the frame. So an R pressed in the ask's own frame does not refuse the mount. **What the room's numbering makes of it
  (LATER 223, `agent/mount-family`, 2026-10-21; reading, pending review -- source inspection):** the frame
  (`FUN_001ebed0`) runs the controller's pre-tick (priority 1.0, D:L50922; the frame running them at D:L50801) before the
  kit's post-tick (D:L50929) and builds the prompt's mask after both (D:L50856 -> D:L56695 -> D:L73390): a press in
  frame f reads the mask built at the end of f - 1, so a
  lock armed on the ask's command K -- a reload's start, or an after-shot's round (the kit's frame, `FUN_005c0fd0`) -- is
  armed before K's mask, and the offer is refused. The page names the ask and R's press `lastSeq()` (`turretPage.ts`
  ~:720, `netPage.ts` ~:1147), the command the last frame sent, and a reload's start and a round the command its own
  frame has just sent (`Fire.update` in `fireFrame`, after `walk.frame`; `netPage.ts` ~:1140, ~:1150): R pressed in the
  ask's frame starts on K + 1 or later, past the span. So the room's span covers a lock from its own command, either
  kind (`lockStart <= count`). *Was:* a reload's span started after its own command (`lockStart < count`), and an
  after-shot's "likely taken too", its order unread -- the gap-0 fitted to a test that named the reload on the ask's
  command by hand, really R a frame before the ask. Online the R pressed in the ask's frame lands on the rifle, the
  client on foot until the reply (LATER 217); the room judges it mounted (LATER 243). The press window counts only
  commands after the press's (`seq > from`), which agrees; the waiting reload counts only one named before the ask's
  (`ev.seq < seq`), and no waiting round was read: with the room keeping pace, a reload or a bolt's round named K still
  waited for K + 1 (`due`) when the ask on K was judged, and the mount was taken. LATER 223's paced half (the
  controller's second hunk): `resolveMounts` holds an ask until the reloads and rounds named on or before its command
  are decided, so the lock armed on K is there when the gate is judged. The cost: a mount whose own command K carries
  a reload or a round is judged once K + 1 has run, so its `after` is K + 1 (LATER 96's steer and LATER 236/237's
  re-derive follow `after`), and a same-step tie with another asker may shift (PF.R28's lower id is per step). The
  review's F2: the room settles the waiting events after each command it runs (`run` -> `settle`), so an in-order
  page's hold ends at K + 1; an ask held more than `FIRE_ARRIVAL_JITTER_TICKS` past its command waits on an event stuck
  behind one named ahead (only an out-of-order page) and is refused 'stale', not taken late. A waiting round or reload
  past its own stale bound (`decide`'s) that is not stuck -- a backlog drop or the intake's cut left it due and
  undecided, the lossy link's round named in the dropped stretch -- holds nothing: it arms no lock, and the mount named
  there is taken at the next step's top after the drop, as LATER 124 rules. The page reads the lock in seconds
  (`Fire.state`) where the room counts commands (LATER 221). Not built:
  the round trip's R (the page's rifle reload, the room's `reload` on a command run mounted taken as the turret's, the
  rifle's magazine split between them; LATER 217), the page's rifle lock frozen while mounted (`matchFirearm.ts`
  `fireFrame`; LATER 218), the release offered under the turret's `ReloadDelay` (LATER 219), and the gate's other terms
  -- a launcher's lock, a throw, the swap -- which `kitLocked` (the firearm's `Fire` alone) and `mountKitLocked` do not
  ask, nor any other action context (LATER 220).
- **Two narrow edges** (the fresh review of the folds, 2026-10-21, source inspection; reachable only by a page that breaks the rules, since the honest page's `kitLocked` is on through the delay and the clip): a reload's span starts after its own command, so an ask named on the very command its clip starts, just past the press window, is taken where the original's offer that frame was made under the running timer; and `lockStart` holds only the latest lock, so an ask covered by an earlier lock is no longer covered once a newer one is armed before the mount resolves. Named here, not built. A third, a forged page's (LATER 249's review F2, 2026-10-21, source inspection): R pressed with a real `ReloadDelay` in a frame that sends no command (its press naming K), then the ask in the next frame (naming K too) -- the room takes it, `pressWindow` counting only commands after the press's (`seq > from`, `room.ts` ~:3102), where the original refuses it: R armed the kit's timer in frame f - 1's pre-tick (`FUN_00594cf0` D:L453460-453463), before the mask the ask reads. Only a page that breaks the rules sends it, since the honest page's `kitLocked` holds through the delay. Named here, not built.
- **The arrival tie** (LATER 249, `agent/l249`, 2026-10-21; reading, pending review -- source inspection and unit tests).
  The page's walk runs the 60 Hz ticks off the frame's time and sends one command a tick (`WalkMode.frame` ->
  `setNetTap`), so a page drawing above 60 Hz runs frames that send no command: at 120 Hz every other frame, at 144 Hz
  two in a row at times (`walkFramePacing.test.ts`). Such a frame's lanes (the ask, R's press: `lastSeq()`,
  `turretPage.ts` ~:720, `netPage.ts` ~:1147) and its `fireFrame` (a round, a reload's start: `netPage.ts` ~:1140,
  ~:1150) both name the command the last sending frame sent, so an ask and a lock's event sent after it share the
  ask's command K: a bolt's round in the ask's own frame (120 Hz), a round in the next frame that sends none (144 Hz),
  a reload's start a short `ReloadDelay` after a press in the ask's frame (144 Hz, the default 0.01 s), and a launched
  round, arriving after the ask at any rate (*corrected 2026-11-02, P4 / LATER 637:* this line said the room decides a
  launched round "at its arrival on its own count (`launchRound`)"; since P4 it is decided at its command, through
  `timed` -> `decide`, on that command's frame and count, as a rocket's since LATER 501).
  Each was refused 'mount: reload' (`lockStart <= count`) where the original takes it: in its frame the press runs in
  the controller's pre-tick (D:L50922; the frame running them at D:L50801) before the kit's post-tick arms a lock
  (D:L50929), and reads the mask built at the end of the frame before, so a lock armed in the ask's own frame or a later
  one is not in the mask the ask read. The room orders two events on one command by their arrival on the seat
  (`Player.arrivals`: each mount ask and each timed event stamped at receipt -- since P4 a launched round among them;
  before, it was stamped at its decision -- the
  page's send order, TCP's, and the page's latency injector's since LATER 249: its outbound reliable messages wait in
  one queue drained by one timer, `client.ts` `delayed` -> `pumpReliable`, not a delay each -- a browser truncates
  `setTimeout`'s delay to whole milliseconds, so a later message clamped to an earlier one's due could fire up to 1 ms
  before it, LATER 249's review F1): on the ask's own command a lock whose event arrived after the ask does not cover it (`mountKitLocked`, `Player.lockArrival` kept
  by `setLock`), and a waiting round or reload on K that arrived after the ask does not hold it (`resolveMounts`'
  `held`), so such a mount's `after` is K, not K + 1. A lock armed by an event that arrived before the ask on K covers
  it, as before. Not built: the original decides on its 29.97 Hz game frame, so a round in page frame f - 1 and an ask
  in f can share a game frame and be taken where the room's 60 Hz commands refuse (LATER 259, PF.R8's transport); a
  swap pressed in a frame that sends no command (LATER 260).
- **A1, branch A: the room's side of the mount's round trip** (LATER 239, 217, 218, 243; 2026-10-22, `agent/a1-room`;
  reading, pending review -- source inspection and unit tests). The original's host grants a mount at once and the grant
  is every console's take (`FUN_0061e6d0` D:L529427-529433 -> each peer `FUN_0061e7f0` D:L529455-529466 ->
  `FUN_002c7d00` D:L168019 -> `FUN_005463c0`), so the asker is on foot until it hears the grant: its R, its Down, its
  throw, its door and its rifle round in that trip are the foot's. The room now matches that, in two halves:
  - *The reservation, at the ask's command K* (`resolveMounts` -> `reserve`): every grant check stays there
    (MOUNT_GRANT_CHECKS_ADAPTATION -- LATER 175's gate, LATER 223's wait for a reload or round named on or before K with
    its F2 'stale' bound and the lossy-link exception, LATER 249's arrival tie, PF.R28's lower seat id among one step's
    asks, the reach), and the occupant is set and told to every page at once (`turret`'s `reserved`, the original's one
    word); a second asker is refused 'occupied' from K on, the reserved seat's own second ask 'mounted'. A worded ask is
    also refused as the asker's own ask refuses it (`FUN_00546210`; the fresh review's fold): under a knock-down fall
    ('fall', D:L412059-412062, no locality gate) and while a `Stand -> Turret` clip plays, forward or reversed
    ('mounting', D:L412066-412069: the dismount's reversed clip). Its third, `+0xeac` (D:L412071-412073, a restraint or
    stab victim), is the campaign's alone (research 189, 194). An older page's ask keeps its path (LATER 109 takes it over
    the reversed clip).
  - *The take, before the command M its page names* (`mountTake`; `run` -> `takeMount`, beside `takeDismount`): the
    commands below M run on foot, as the page ran them, and M runs mounted. The word is refused 'stale' at or below K,
    'ahead' past the seat's newest command + FIRE_ARRIVAL_JITTER_TICKS (the reservation stands), 'not reserved' when
    there is none; one naming a command already run is taken before the next (the page re-keys on the take's
    `steer.after`). With no word inside 2 s (MOUNT_WORD_BOUND_ADAPTATION, the ask's window) the room takes the body at a
    step's top on its own count. The take trusts the grant (`FUN_005463c0` D:L412095-412318: no occupancy, reach, facing
    or gate test) and refuses only on its own terms: dead or dying (D:L412134-412139; a death in the trip releases at
    the kill), a knock-down fall on top (`FUN_00588030` D:L445700-445713, `mountFallRefuses`) -- 'mount: fall', the
    turret released to every page (`FUN_002c7a60(turret, 1)` D:L412167-412186 -> each peer `FUN_00545ee0`). A leave
    releases (`FUN_00612e48` D:L521601-521617 -> `FUN_002c7d00` -> `FUN_00545ee0`), and so does a resume (the old
    page owed the word). Taken: `mountCount` = M's count - 1, `steer.after` = M - 1 (LATER 96's catch-up zero on the
    worded path), `seatOff` from it (LATER 104, 151), the cone's record the turret's from M.
  - *The pop* (the push read: `FUN_005a6fc0` D:L462175-462200 -> `FUN_0058c4a0` -> `FUN_0058c350`
    D:L447957-447994; `../net/blast` `mountPop`, `Walker.mountTake`): the overlay cleared (D:L447983), the stack popped
    whole -- `FUN_0058a5e0(actor, 0, 1)` (D:L447984) pops while it holds more than 0, every play (D:L446796-446798;
    *was* "to its base": LATER 512's review F4) -- the standing base motion at stance 0 (D:L447989), the stance request cleared
    (D:L447992). Per state at M: crouched or prone, stood at once with no clip; a stance asked and kept pending, the
    request cleared; a swap, completed to its target (`FUN_005be040` D:L474757-474760; the hand the target's); a
    reload's or an after-shot's clip, cut (a magazine already in stays); a landing or a get-up, cut; a traversal,
    settled by the knock's stand-in and put on the floor (MOUNT_TRAVERSAL_POP_READING); a knock-down fall, refused.
  - *The flinch at the take* (LATER 512b, 2026-10-27; source inspection, the gameplay seat bf's implementer; reading,
    re-read by the LATER 512b review 2026-10-27): `FUN_0058c350` runs only when the set changes (or its fifth argument asks, D:L447964-447965) --
    the turret's set is not the SEAL's, so a take always does -- and its `FUN_0058a5e0(actor, 0, 1)` (D:L447984) pops
    while the top index + 1 > 0 (D:L446796-446798): every play, the flinch on top, the door's `Open door` and a flinch
    under it alike, before the set's `Stand` is pushed at posture 0 (D:L447989). The release gives the previous set
    back through the same function (`FUN_0058c4a0(actor, +0x52c)`, section 7.1), popping every play again. So no flinch
    survives a take, covered or not. The walk and the room clear the covered flinch at the take (`WalkMode.mountTake`,
    `Room.takeMount`, LATER 512); the remote copy did not (`RemotePlayers.frame`: a body's flinch, a push and the
    flinch under it ran on under the turret's pose, and could be drawn again after a short mount) -- fixed by LATER
    512b: a living body drawn on its turret pose drops them (`doorClip.test.ts` 'LATER 512b'). Left open: the own
    page's and the room's flinch on top at the take (its pose, its reload refusal) were kept by the port, popped by the
    original (D:L447984) -- fixed by LATER 523 (reading, re-read by the LATER 523 review 2026-10-27; the refusal is the play's presence, `FUN_005b4340(actor, 3)`
    D:L469499-469500, so the cut ends it); a flinch event reaching the page after its take: LATER 524.
  - *The kit's timer* (LATER 218; `mountKit`, `mountKitLate`): the take-up zeroes `+0x810` and never `+0x820`
    (`FUN_005c4b10` D:L478836, D:L478926), so the kit's one timer runs on and ends on the turret's slot (`FUN_005c0fd0`
    D:L476549-476563 -> `FUN_005c2a90`): a reload's delay running at M (its press, `pressLock`, LATER 72) becomes the
    turret's reload, its claims refused 'reload' through the delay's end and its next magazine walked there (the
    others hear its `ReloadSound`), the rifle's reload lost. The end is the room's own kit-timer model's, from the
    press's count (`turretReloadCountdown(ReloadDelay)`: 61 commands for 1 s, with its `lands`; the fresh review's fold --
    was the press window's end, LATER 72's rounding, 60), and branch B's page carry follows it; a bolt's or a pump's after-shot holds the turret's trigger
    to its end and lands nothing (MOUNT_CARRIED_AFTERSHOT_PLACEHOLDER). A reload or a round named before M and decided
    after the take is the hand's (LATER 107's path) and is cut and carried there alike. The hand's throw request
    (`throwStart`) is dropped: nothing thrown (the take-up's power 0, `FUN_00592d40` D:L478915).
  - *The older page* (the controller's call 1): an ask without `word` is reserved and taken at once, as before A1 -- no
    reservation told, no pop, no carry, `steer.after` the room's count (LATER 124's K, LATER 223's K + 1 when held) --
    so every suite that asks without the word runs unchanged, and the A=B rig's gunner sends none on branch A. Its
    take keeps today's no-pop (a crouched mount stays crouched in the room): a latent gap, retired with the older path
    at the next protocol bump (LATER 303).
  - *The transport* (the merge controller's pipe-order question, settled): a page's game socket is spliced as raw TCP by
    the host's door to the match process (`packages/host/src/door.ts` ~:18-24, `splice` ~:426, `client.pipe(up);
    up.pipe(client)` ~:464-465), which does the WebSocket handshake itself; `packages/match/src/pipe.ts` carries only the
    supervisor's control messages. A seat's text and binary frames ride one TCP stream, so a `mountTake` reaches the room
    before the command it names. **No injector change (dropped for good, the merge controller's word 2026-10-22; branch B
    does not re-add it):** only the page's latency injector (`?lag`, `client.ts` `delayed`) can let a command pass a
    reliable message still queued, and the order does not matter to the mount: the room takes a late word (a word for a
    command already run is taken before the next), and the page re-keys on the take's `steer.after` (branch B). The
    cleared hunk (a command joining `reliableQ` while a reliable message waits) turned turretHold's netRig red (52 of
    73), and the pump tried with it (the next timer armed from the clock the drain reached) is rejected: it left
    turretHold red too -- B129's seam, a rig that fakes `setTimeout` alone (HAZARDS, "tests"). That is true of the word,
    not of a late `reloadPress` (the fresh review's fold): a press reaching the room after the take is not carried --
    `reloadPress` returns for a mounted body (`room.ts` ~:6359) -- so the delay it names is lost on the turret's slot.
    It cannot happen on the door's one TCP stream (the press is sent before the command M it precedes); it can under
    `?lag`, where a command may pass a reliable message. Owed to branch B's rig: its `?lag` runs meet it, and say so (met:
    "A1, branch B", the rigs -- the press goes ahead of the word in the injector's ordered queue, so it is there at the
    take).
  - *Left, named:* the page's side (branch B, built below: the page's own take on its word, the throw's power 0, the
    rifle's timer handed over, the re-key on a late word; LATER 236/237's re-derive kept as the older room's fallback); a launcher
    raised in the trip (its `held` / `launcherSet` at M unread); a C4 or a claymore placing at M (ended
    'replaced' -- for C4, LATER 122's 99 s fallback: the kit's `+0x87c` (D:L476883-476892) is written by neither the take
    nor the take-up, so it runs on; while the turret is held the slot in the hand is the turret's (D:L478842) and the
    room refuses a throw named on a mounted command 'mounted', so nothing is planted then; after a release the hand
    returns to the kept slot (D:L412214-412215) and the plant at the saved point falls inside its window); a
    dropped stretch over M (its commands laid on foot, the take on the next command run); a traversal at M in the room
    is pinned at the unit level only (`mountPop.test.ts`).
  Tests: `match/test/roomMountWord.test.ts` (REDs 1-14), `viewer/test/mountPop.test.ts`; the mount suites unchanged.
- **A1, branch B: the page's side of the mount's round trip** (LATER 239, 217, 218, 243; 2026-10-22, `agent/a1-page`;
  reading, pending review -- source inspection and unit tests). The page now asks with the word and takes on it, so
  page, room and console agree on what the trip is: on foot until the asker hears the grant (`FUN_0061e6d0`
  D:L529427-529433 -> each peer `FUN_0061e7f0` D:L529455-529466 -> `FUN_002c7d00` D:L168019 -> `FUN_005463c0`).
  - *The word and the take at M* (`turretPage.ts` `action`, `take`, `takeOwn`): the ask carries `word: true`; on hearing
    its own reservation (`turret`'s `reserved`) the page sends `mountTake` naming the next command it sends, M =
    `lastSeq() + 1`, and mounts from M: its own refusals first (`takeRefused`: dead or dying, D:L412134-412139; a
    knock-down fall on top, `FUN_00588030` D:L445700-445713 -- `WalkMode.mountRefused`, the room's `mountFallRefuses`),
    the word sent even then (the room refuses alike and its release tells the page); else the body and the kit taken
    (`took`, below), `.GRAB_TURRET`, the hold, and the mount keyed on `after` = M - 1 (`MountMark.word`): the room runs
    the commands below M on foot and takes before M, so the page's own clip starts where the room's does with no
    catch-up (LATER 96's zero: `keyedStep` takes its first step from where the body stands, never the `trail`'s restart)
    and `mountTaken()` is null (nothing to re-derive). The turret's R and its rounds name `claimSeq()` -- `lastSeq()`,
    never below `after` + 1 -- so in a frame that sends no command after the take they name M, which the room runs
    mounted.
  - *The re-key* (the controller's call): a take the room made on another command than M -- a word late or 'ahead', a
    command lost, the 2 s bound -- arrives with its own `steer.after`, and the page re-keys its mount on it (its clip,
    the release's wait and `claimSeq` follow the room's count). What runs then (the fresh review's fold 1; `keyedStep`):
    the own steer keeps the steps it took from M and, for a later `after`, pauses -- placing nothing -- until the room's
    count passes them, then goes on from the place its last step laid: no restart from the room's body (`trail`) and no
    catch-up, which a worded mount takes neither of. Both bodies stood on foot alike before their steps, and they meet
    at the room's hold. Checked by `turretHold.test.ts`'s late-press cases (the take on M - 1 + 3, + 6, + 9 at 50, 100,
    150 ms): page against room from the take through M + 40, within 0.25 through the clip (T81-4's bar) and 1e-3 from
    the room's hold (LATER 96's) -- measured 2026-10-22 (dev-disc, `simulate` on fake timers; units of the world): at 0
    ms, no re-key, 0.0000 throughout; on a re-keyed take the page LEADS the room through the clip by at most 2.10 at 50
    ms one way (the take on M - 1 + 2; 3.04 when it landed + 3), 5.22 at 100 ms (+ 6) and 6.88 at 150 ms (+ 9), largest
    on the take's first commands and falling through the clip (at 150 ms: 6.882, 6.470, 5.761, 4.869, 4.012, 3.279,
    2.644, 2.147, 1.569, 1.067, 0.683, 0.389, 0.255, 0.208, 0.215, 0.215), and it ENDS at the room's hold: 0.0000 from
    `after` + 17 (k = 17) on, with no `replayed` call. Its size is the steps the page took from M before the re-key
    landed, which the room had not taken. **The controller's call (a), 2026-10-22: accepted and named, not built away**
    -- the lead is `turretHold.test.ts`'s `REKEY_CLIP_LEAD_BOUND` (the measured bounds, not a tolerance), every other
    case keeping 0.25 through the clip and 1e-3 from the hold. When it arises: only when the room takes later than the
    page's M -- at the 2 s bound (MOUNT_WORD_BOUND_ADAPTATION) or after a lost command; in this rig the late word at
    50-150 ms is its own artefact (the word queued behind the press waits a timer more because the injector drains on
    `performance.now` while the rig fakes `setTimeout` alone, B129's seam), as a browser has one clock and the two leave
    together. Since the controller's pin (2026-10-22) the rig no longer lets real time set the offset: its late-press
    cases hand the press and the word to the room, in send order, after it has run M - 1 + k -- k = 3, 6, 9 at 50, 100,
    150 ms (`REKEY_WORD_AT`; both + 2 and + 3 were seen at 50 ms unpinned) -- so each re-keys alike every run, held to
    the lead measured at that offset (3.04, 5.22, 6.88; pinned, two runs gave 3.0393, 5.2241 and 6.8816 alike, the
    offsets exact). The catch-up from the room's body at the take that would remove it is LATER 311.
  - *Another seat's reservation* (the controller's call): the turret shows occupied at once (no prompt, no target), but
    its clip, sound and gun are drawn only from the take's broadcast (`drawnWas` / `drawnNow`; `frame`, `muzzleOf` skip
    a reserved gun) -- that body comes from the snapshots, on foot until its take, so a clip drawn at the reservation
    would lead it by the round trip. A reservation released (a refusal, a death, a leave, a resume) draws and plays
    nothing; a welcome naming one draws nothing until its take. A welcome naming this page's own seat as the reserved
    occupant (heard late, a reconnect inside the trip) is no take either: nothing drawn, heard, held or locked, and no
    word sent from a welcome; the room's take (at the bound) draws and holds it (the fresh review's fold 2,
    `turretPage.test.ts`; the build's correction of the cleared hunk: the hold set only for a drawn occupant).
  - *The kit at the take* (LATER 218; `matchActions.ts` `took`, in this order): the held throw cancelled
    (`GrenadeThrower.mountTake`: a wind-up, or a throw asked whose hand has not opened -- nothing thrown, the item kept,
    the power 0, the take-up's `FUN_00592d40` D:L478915; MOUNT_HELD_THROW_FUSE_PLACEHOLDER: no fuse runs in the hand),
    the kit's timer handed over (`Fire.mountTake`: the trigger let go, a reload's or an after-shot's clip cut, a
    magazine in kept; the timer `+0x820` returned, the take-up zeroing `+0x810` and never it, `FUN_005c4b10` D:L478836,
    D:L478926), and the body popped and stood (`WalkMode.mountTake` -> `mountPop`) -- the throw before the pop, so the
    walker's 'replaced' end finds no throw to let go. A reload's delay carried ends where the room's `mountKit` ends it:
    the press's command (the window's end less the delay's commands, as `netPage.ts` set the window) plus the kit-timer
    model's run of its `ReloadDelay` (`turretReloadCountdown`: 61 commands for 1 s); a bolt's or a pump's after-shot,
    its seconds left from M (MOUNT_CARRIED_AFTERSHOT_PLACEHOLDER's carry). The delay is carried only under the room's
    own condition (the fresh review's fold 3; `room.ts` `mountKit`: `l.weapon === w && p.mags[w] === l.ring`, LATER 72's
    press window; the kit's timer ending on the slot in the hand, `FUN_005c0fd0` D:L476549-476563, left by the take-up,
    `FUN_005c4b10` D:L478836, D:L478926): the weapon in the hand the press's and its own ring the press's
    (`Fire.pressOf`). The room keeps one ring a weapon (`Player.mags`), a launcher round's slots apart (`KitRounds`), so
    a round-mode switch after R carries on both sides; a swap or a replaced ring carries nothing on either. On today's
    code a hand change or a replaced ring already ends the page's delay (`setWeapon`, `takeWeapon`, `refill`) and a swap
    inside the delay's window is refused on both sides (LATER 167), so the weapon-and-ring rule is stated on the page as
    the room states it rather than changing a reachable case. The fold's RED found one thing that did differ: after a
    round-mode switch the page returned the round mode's `ReloadDelay` (0.01) for the carry, where the timer running is
    the press's (1 s here) and the room counts from the record (`reloadDelayOf(p.records[w])`); the press now keeps its
    delay (`pressOf.delay`), which the carry's end counts from. Either holds the turret's trigger
    (`TurretPage.reloading`) only until the room's first tell of the hold's magazines, which is the word. Nothing of the
    rifle's runs through the mount, so `fireFrame`'s mounted skip freezes nothing.
  - *Kept, the older room's fallback* (the controller's call 3): `rederiveKnock` (LATER 236/237) runs for a back-dated
    take -- an older room's, which ignores `word` and takes at the ask -- through `mountTaken()`; retired with the older
    path (LATER 303). LATER 236's pin (ii) is flipped on the word (`matchFirearm.test.ts` "A1: on the word, ...").
  - *Named, not built* (the fresh review's finding 5): a refusal on the page alone (`takeRefused` true where the room
    takes) leaves the page's kit untaken -- no `took`: its throw not cancelled, its timer not handed over -- while the
    room's take broadcast then draws and holds the mount. Expected unreachable: page and room judge the same terms (dead
    or dying, a knock-down fall on top) on the same body at the same command.
  - *The rigs.* `turretHold.test.ts` on the word (the tree's latency injector, `simulate`, on fake timers; MP51's
    `mp51_turret01`; W held through the trip): at 0 / 50 / 100 / 150 ms one way and 30 / 60 / 144 Hz the room took on
    the page's M (`steer.after` M - 1, the room's body mounted from M), page-room 0.0000 at every command from the ask K
    through M + 40 -- the trip K + 1 .. M - 1 walked on foot by both (1.9 at 50 ms, 5.3 at 100 and 150 ms; at 0 ms the
    trip is a command or two) -- and the `replayed` seam never called. The older-room variants (the ask's `word` taken
    off: the no-seam catch-up measure, the walked catch-up, LATER 104's lost-command release) keep their results; the
    rigs wait for the room's take as well as the page's, since on the word the page holds first. Branch A's late
    `reloadPress`, met under `?lag`: R pressed in the frame the page hears its reservation goes ahead of the word in the
    injector's ordered reliable queue, so the press is at the room when it takes, and the delay is carried (the room's
    `mountKit` returned the carry at 0 / 50 / 100 / 150 ms; this loopback's MP51 turret has no weapon record, so the
    landing itself is branch A's `roomMountWord.test.ts` RED 3): the late press is not met on the word path. Measured
    with it, and the rig's own: from 50 ms the word queued behind the press came one way-latency late (the take on M - 1
    + 3, + 6, + 9; the page re-keyed) -- the injector drains on `performance.now` and the rig fakes `setTimeout` alone
    (B129's seam; HAZARDS, "tests"); on one clock the two leave together. The A=B rig (`central` `matchProcessRig` /
    `matchProcessReplay`): the gunner asks with the word and names its take on hearing its reservation (`mountTake`, its
    next command), holding the gun from the take's broadcast; the watcher counts a take, not a reservation. Seed 11: a
    mount, 51 of the gun's rounds, a dismount, A = A2 = B byte for byte; LATER 178's late-round pair kept on the older
    page's ask (`lateRounds` 1). The summary line does not tell whether that take came on the word or at the 2 s bound.
    Not in the rigs: a Down and an R in the trip on the network rig (no firearm there) -- the Down is
    `matchFirearm.test.ts`'s pin on the page's own commands, the R `turretPage.test.ts` / `matchActions.test.ts` with
    branch A's `roomMountWord.test.ts` RED 2.
  Tests: `viewer/test/fire.test.ts`, `grenade.test.ts`, `turretPage.test.ts`, `matchActions.test.ts` ("A1: ..."),
  `matchFirearm.test.ts` (the flipped pin), `turretHold.test.ts` ("A1: the mount on the word ..."; its older-room
  variants strip the word), `central/test/matchProcessReplay.test.ts` (the gunner on the word).

- **LATER 219 (built 2026-10-26, `agent/later-219`; reading, pending review).** The release (action 20, `FUN_005a8850`) is set
  in the same `FUN_005937c0` past the same common gate (`FUN_00593500` D:L452277 -> `FUN_005a7de0` D:L462636 ->
  `FUN_005a7ab0`), so it is not offered while the turret's own `ReloadDelay` runs. The room refuses a dismount whose
  command's count falls in the turret's timer (`takeDismount`: from its arm, `lockFrom`, through `lockUntil`; 'reload',
  the occupant told `refused: 'reload'`, which undoes a predicted release); the page offers none while its tell says
  reloading or the take's carried timer runs (`releaseOffered`). The page's tell lags the room's arm by the link: a press
  in that gap was refused by the room and undone on the page; the review's F2: this page's own R counts as the timer from
  its press (`TURRET_OWN_RELOAD_TELL_ADAPTATION`), as the original arms it locally, so the gap is the last round's arm only. An
  older page undoes a predicted release only on 'mounting' (the review's F4): on 'reload' it shows the release until the
  room's next turret event. The knock's forced release is outside the gate
  (`TURRET_RELEASE_RELOAD_READING`). Tests: `match/test/roomTurretReleaseReload.test.ts`, `viewer/test/turretPage.test.ts`
  'LATER 219'.

### 8.7 Equipment asked across the mount (2026-10-26, PARITY-2 LATER 205's read; reading, pending review -- source inspection)

Nothing here was measured running. The body's fields: `+0xeb8` the turret it is on (set at the mount's end D:L412315,
cleared at the dismount D:L411973); `+0x528` the anim set (`DAT_0044d408` "launcher anim set", `DAT_0044d410` "turret
anim set", D:L496060-496092); `+0xf79` the hand's class (1 rifle, 2 pistol, 4 launcher: the raise writes 4,
D:L462115; research 211 §2). "Online" is `DAT_0045a0c1 != 0`.

- **The mount's slot save** (`FUN_005463c0` D:L412095-412318). Its own gates read the body as it runs: no turret
  already (D:L412131), alive and the action's `+0x2b` not 8 (D:L412135-412139), not falling and not in a "-> Turret"
  clip (D:L412140-412163, both waived when the controller's vfunc `+0x34` answers), `+0xeac` 0 (D:L412164). None asks
  the launcher set, `+0xf79`, a charge placement or the item in hand. Passed, it saves **only the kit's slot index**
  in `+0xebc` (D:L412214-412215), appends the turret's gun as a new slot and switches to it (`FUN_005bc5d0`,
  `FUN_005c4b10`, D:L412216-412218), then `FUN_005a6fc0(body, +0xf79, 0)` puts on the turret set for a hand of 1 or 2,
  popping the whole action stack (`FUN_0058c350` -> `FUN_0058a5e0(body, 0, 1)`, D:L447984; D:L462190-462198) -- for
  `+0xf79 == 4` neither branch runs (D:L462190-462199). The dismount (`FUN_00545ee0` D:L411941-412028) switches back
  to the saved slot (D:L412005), removes the turret slot (D:L412006) and reverses the turret set (D:L412024,
  D:L462147-462168).
- **The offer refuses the mount under the launcher set.** A player's press acts on an offer built that frame
  (`FUN_00593500` D:L73388-73390, D:L73401); the mount offer (0x13) is posted only when `FUN_005a88c0` passes
  (D:L452472-452474), which asks `FUN_005b4340(body, 10)` (D:L463019); kind 10 refuses the launcher anim set
  (D:L469528-469531) -- the raise's set from its start (`FUN_005a6d30` D:L462104), held through the lower's reversed
  clip until `FUN_005a60d0(.., 4)` gives the old set back (D:L461768-461771). Raised, rising or lowering: no mount.
  Kind 10 also refuses body `+0x1061` bit 1 (D:L469532-469534; meaning unread), and the offer asks the turret's
  vfunc `+0x5c` (D:L463034; unread).
- **Mounted, no item is taken up.** The slot press runs `FUN_005a8cb0`, which answers 0 while `+0xeb8` is set
  (D:L463174): no raise, no charge, no Detonator; the fire button fires the hand's slot, the turret's gun
  (`FUN_005c0ae0` D:L476371, D:L476424-476506).
- **Online the mount is judged at the grant.** `FUN_00546210` (D:L412033-412088) mounts at once offline
  (D:L412074-412076); online it asks for the turret's net object (`FUN_002c79f0`, D:L412077-412084; once per 2000,
  D:L167862-167871) and the mount runs when the ownership arrives (`FUN_002c7d00` -> `FUN_005463c0`,
  D:L168010-168020), judged by the mount's own gates only. A raise in that window is allowed (`FUN_005a8cb0` sees
  `+0xeb8` 0), and the grant does not refuse it: the body would mount with `+0xf79 = 4` and no turret set.
- **A charge placement does not refuse the mount**, as read. The placings set kit byte 1 bit 0x02 and the timer
  `+0x87c` (claymore 1.3 s D:L475321-475327, PMN D:L475338-475359, satchel D:L475370-475376, the bomb 2.25 s
  D:L475479-475486, C4 99 s with a callback `LAB_005bfe40` at 0.45 on its clip, D:L475441-475451); neither the offer,
  kind 10, `FUN_00546210` nor `FUN_005463c0` asks them. A mount pops the placing clip (D:L447984) and the timer runs on
  (`FUN_005c1970` D:L476879-476902), its end deciding by the current item (D:L476885-476896) -- with the turret's gun
  current, the throw-release branch (D:L477023-477140), as read; not confirmed, perhaps unreachable.
- **The Detonator is instant** (`FUN_005be9a0` 0xc1 -> `FUN_005c0130`, D:L475477-475478, D:L476010-476035): no clip
  and no timer for a mount to cut; it ends switching the slot to the claymore (D:L476032), which a mount then saves.
- **The launcher's round** is fired through the kit's gate on the launcher's slot (`FUN_005c0ae0`
  D:L476358-476506) with no placement timer; the set it needs refuses the mount (above).

**The port** (built 2026-10-26, `agent/later-205`). The room judges the launcher's kinds at their command, as LATER 501
(the rocket's round, `timed`) and LATER 504 (the set on the mover, `launcherSet` at the command) do: a mount asked at
command K is refused 'launcher' while the launcher's set is on at K + 1 (`flinchOnTop(p.launcherSet, K + 1)`, the
offer's kind 10; the review's F1: the page's offer asks the set on the command it runs next, taps + 1, and names its ask
taps, so the room judges K + 1 -- the raise's own convention, its set from its command + 1 -- one edge on both sides:
asked on the raise's command, refused; on the set's last command, taken), beside the grant's other checks; the page offers none under the set (`TurretPageDeps.launcherSet`, from
`WalkMode.launcherSetOn`). A raise, a lower or a round named after the mount is refused 'mounted' at its command
(`mountedRefused`, LATER 172). The charges and the Detonator are named readings, not built:
`MOUNT_DURING_PLACEMENT_READING`, `DETONATOR_ACROSS_MOUNT_READING`, `MOUNT_ONLINE_C4_WINDOW_READING` (§4). Tests:
`match/test/roomMountLauncher.test.ts`, `viewer/test/matchActions.test.ts` 'LATER 205'.

**Open** (each settles a reading named at the port):
1. The turret's offer vfunc `+0x5c` (D:L463034, D:L452095): read the turret class's vtable entry.
2. The turret gun's item class (`FUN_005bc5d0`'s argument, D:L412217): whether the mount's switch lowers a raised
   launcher at an online grant.
3. `FUN_005c4600` (D:L478931), `FUN_005c6980`, `FUN_005c8a20`: whether any clears kit byte 1 bit 0x02 or `+0x87c`.
4. The pop's end handlers (`FUN_00589aa0` D:L446479-446731) for "Place claymore" and "Put on wall": whether a popped
   C4 clip runs `LAB_005bfe40`.
5. The action-flag walk of `FUN_005a7de0(body, 1, 1)` during "Stand -> Turret" (D:L462698-462706): the online C4
   offer in the first 1250 after a mount (`FUN_005a8850` D:L462983-462992, `+0x22c` D:L412212).
6. The controller's vfunc `+0x34`, which waives the mount's fall and clip gates.
7. A capture: online, a raise or a placing pressed between the mount's press and its grant; offline, a placing then
   a mount.
8. The offer builder's place in the frame (`FUN_00593500`, D:L73388) against the raise's push of the set (D:L462105)
   and the lower's give-back (D:L461768) is uncited: it decides the window's edges (whether a press on the raise's frame,
   or on the give-back's, is offered). The port's edge is K + 1 on both sides (the review's F1).
