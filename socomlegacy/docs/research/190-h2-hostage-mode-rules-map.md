# 190 -- H2 -- Hostage mode on Desert Glory: the mode, the rules, the map data, the HUD

- Research date: 2026-10-04 (research wave 1; the index is [178](178-the-research-wave-of-2026-10-04.md)).
- Origin: `research-wave-2026-10-04/H2-hostage-mode-rules-map.md` on the owner's host, in the evidence archive ([178](178-the-research-wave-of-2026-10-04.md) gives its root). A relative `scratch/...` path below is under `research-wave-2026-10-04/`; the per-cluster `ledger-*` files it names are merged in [`ledgers/2026-10-04/`](ledgers/2026-10-04/README.md).
- Trees compared: **PORT** = `agent/online` at 2026-10-04 (written `$PORT`; `$PORT/..` is that branch's root, `$WEBISSUES` the `agent/web-issues` checkout); **WT** = the old-layout checkout (`$WT`, the clone's pre-restructure web project). WT-96..102 are notes 171-177 here; PORT's own notes 96-102 are other notes.
- **Status: reading, pending review -- not adopted.** Nothing in it is adopted until a sprint task takes it and a reviewer re-reads it at the source.
- Grades, translated to AGENTS.md's levels: the wave's PROVEN = an exact source read = **reading**; STRONG = reading with one interpretive step; BELIEVED = inference; UNRESOLVED = unresolved. The text keeps the wave's words.
- Verification: V2 (`research-wave-2026-10-04/V2-verify-hostage.md`) has landed and is folded in as §10.
- Edits on import: the headings are numbered for the corpus; home-directory paths are replaced by `$PORT`/`$PORT/..`/`$WEBISSUES`/`$NPX_TSX`; the archive's absolute root is dropped; references to the other reports are links to their notes. The substance is verbatim.

Research agent H2, wave 2026-10-04. Read-only. Scripts and every dump are in `scratch/H2/` (its `README.md` lists what
each one prints). Decomp citations are r0001 (`socom2_game.elf.decomp.c`, `D:L<line>`); ELF reads are of
`game/disc/socom2_game.elf`. Disc data was read from `C:/Projects/socom_pc/game/disc/RUN` with the old checkout's
parsers. Siblings: H1 owns the hostage's AI, animation and the follow/stop interaction; H3 owns network sync. This
note covers what they need from the mode and the map, and stops at their boundary.

## 1. Summary table

| # | item | status | grade | one-line answer |
|---|---|---|---|---|
| 1 | Which archive Desert Glory is | RESOLVED | PROVEN | `RUN/MP6.ZDB`. `READERC.ZAR/missionlist.rdr` gives `DESERT GLORY`, NUMBER 6, TYPE `EXTRACTION`, MULTIPLAYER. `mission.rdr` description: `DESERT GLORY`. |
| 2 | What the original calls the mode | RESOLVED | PROVEN | **EXTRACTION**, game type 4 (game `+0x111`). The scoreboard caption is **"EXTRACT"** (0x3e5848, `FUN_0022be20` D:L79749). Each map has one fixed type. `hostage_rescue` / `escortee_extract` are AI valve names (0x662858 / 0x6627e0), not a mode. |
| 3 | Game types Desert Glory supports | RESOLVED | PROVEN | EXTRACTION only. There is no respawn (respawn is only for type 5, `FUN_002a7560` D:L149418). |
| 4 | Number of hostages, names, models | RESOLVED | PROVEN | 3 escortees, from `READERM.ZAR/vehicles.rdr`: `Hostage` (character `mp_fem1`), `Hostage2` (`mp_fem2`), `Hostage3` (`mp_fem3`), each with team `17 30 31`. `chartype.rdr` `escortees` lists them as Hostage1-3. |
| 5 | Hostage spawn points | RESOLVED | PROVEN x,z / STRONG y | AIMAPS named points on Base Map: `hostageStart` (104,5) = (1750.26, 49.99, 1179.72); `hostage2Start` (106,4) = (1770.26, 49.99, 1169.72); `hostage3Start` (106,11) = (1770.26, 49.99, 1239.72). |
| 6 | Extraction zone | RESOLVED | PROVEN | One zone, `Safety`, of kind 1, which is **EXTRACT_ZONE**. Its corner is cell 0:(6,76) and it spans 8x15 cells: world x 765.26..845.26, z 1884.72..2034.72, floor y -30.08. The script's rescue test and the code's rescue both use it. |
| 7 | Team spawns for the mode | RESOLVED | PROVEN | Same machinery as every map: the AIMAPS slots. SEALs (side 0): 24 slots at x 840..1140, z 1580..2140, next to the zone. Terrorists (side 1): 24 slots in two groups, by the jail (z 1230..1540) and in the north-east (z 2060..2220). |
| 8 | SEAL win | RESOLVED | PROVEN | `rescuecount >= 2` AND `rescuecheck == 1`. `rescuecount` = hostages rescued plus hostages the Terrorists killed. `rescuecheck` = all three hostages resolved (rescued or dead). |
| 9 | Terrorist win | RESOLVED | PROVEN | The SEALs kill 2 hostages (`mp_hostages_by_seals >= 2`), or the SEALs are eliminated. |
| 10 | Elimination | RESOLVED | PROVEN | As in SUPPRESSION classic: `aiteam_08 == 0` is tested first, then `aiteam_00 == 0`. Hostages are not counted in either. |
| 11 | Time-out | RESOLVED | PROVEN | **A draw**, even with 2 hostages out (`mission_timer` -> `abort`, `mp_winner` = 99). |
| 12 | Killing a hostage | RESOLVED | PROVEN / STRONG | The killer loses 2 points and gets +1 "escortees killed". A team valve goes up (`mp_hostages_by_seals` or `_turds`). No kill line is posted. A SEAL kill also costs **one minute off the round clock** (host-applied). A Terrorist kill credits the SEALs with that hostage as rescued. Nobody is kicked. |
| 13 | Rescuing a hostage | RESOLVED | PROVEN / STRONG | The leading SEAL gets +3 points and +1 "brought out", and each living teammate adds +1 team bonus. This fires when a led escortee enters an EXTRACT_ZONE cell. The script then posts "A HOSTAGE HAS BEEN RESCUED". |
| 14 | Round clock | RESOLVED | PROVEN | The create-game round time (default 6 min) with no mode-specific change. A SEAL hostage kill subtracts 60 s from the round's total; if the total is 60 s or less it drops to 1 s. |
| 15 | Round-end bonuses, match, screens | RESOLVED | STRONG | The same as classic: +5 to each player on the winning side, +1 to each living player, match to 6 of 11, ROUND COMPLETE / FINAL ROUND / GAME COMPLETE. EXTRACTION adds a **primary objective** count. |
| 16 | Messages, voice lines, music | RESOLVED | PROVEN | Every line, its scale and its sound are listed in section C (the `objectives` script, 20 sequences). |
| 17 | HUD: hostage and extraction marks | RESOLVED | STRONG | A `ret_hostage.tif` mark (type 4) is on each hostage, and a `ret_extraction.tif` mark (type 6, "EXTRACTION LOC") sits at the zone's centre cell. Online, both always show and pulse. Their colours are (62,49,36) and (36,40,62). |
| 18 | HUD: the order prompts | RESOLVED | STRONG | "FOLLOW!" (action 0xe) and "HOLD POSITION" (action 0xf), each with `action_escortee.tif` (`FUN_0021ded0`). |
| 19 | `HOSTAGES RESCUED:` | RESOLVED | PROVEN | This is a PLAYER INFO line in the online stats (`FUN_002f0020` D:L192097), filled from the match's "brought out" counter (research 155). There is no in-round counter. |
| 20 | Cell-door blockers (`okforhostages`) | PARTIAL | BELIEVED | The cell door `cdoor1` swaps two collision nodes, `nohostagerescue` and `okhostagerescue`. What they block is not decoded. |
| 21 | `access_action1` "points 2" | UNRESOLVED | -- | A C4-destructible next to the jail. The consumer of `points` (action `+0x38`) was not found. |
| 22 | AIMAPS cell height | RESOLVED (new lever) | STRONG | y = min_y + (max_y - min_y)/1024 x ((cell word >> 9) & 0x3ff). This is validated on the 4 KNOWN.md spawns to within 1.5 units, and the port says the y "is not in the file". |
| 23 | IF / WHILE operators in zAnim | RESOLVED (new lever) | PROVEN | EXPRESSION (cmd 43), byte +4: 1 NOT, 2 AND, 3 OR, 4 `(`, 5 `)`. This settles the port's `ROUND_CUE_CONDITIONS_READING`. |

---

## 2. A. The map and the mode's identity

### 2.1 A1. Desert Glory = `MP6.ZDB`, EXTRACTION
- **What I did:** ran `probe-npc-maps.copy.ts --section global --record missionlist.rdr` (output in `out/missionlist_summary.txt`) and `--section summary` (output in `out/mp6_summary.jsonl`).
- **Answer:**
  - `missionlist.rdr` lists `NAME DESERT GLORY, NUMBER 6, TYPE EXTRACTION, MULTIPLAYER`.
  - MP6's `mission.rdr` has `description DESERT GLORY` and `LoadingScreenAssets ui/assetlib/ld/om06`.
  - Grade: **PROVEN**.
- **The other EXTRACTION maps:** Blood Lake (MP10), Death Trap (MP11) and Fish Hook (MP71).
  - Their `objectives` scripts are the **same 20 sequences, rule for rule**. Only the music, the zone corner and, on MP71, the locale ids and a second zone differ. The diff is reproducible: compare `out/mp6_objectives.txt` with `out/mp10_objectives.txt`, `out/mp11_objectives.txt` and `out/mp71_objectives.txt`.
  - So everything below applies to all four maps, with each map's own zone.
- **The mode's names in the original:**

  | where | name | source |
  |---|---|---|
  | game type | 4 | `FUN_002c9540` D:L168878-168906, research 91 §4.1 |
  | `missionlist.rdr` TYPE | `EXTRACTION` | 0x3f2e78 is compared at D:L168883 |
  | scoreboard caption | "EXTRACT" | 0x3e5848, `FUN_0022be20` D:L79749 / D:L79840; research 87 §12 "GAME DETAILS" |
  | the script's words | "LOCATE AND EXTRACT THE HOSTAGES" | MP6 `objectives` |

  The strings the brief names are each something else:
  - `hostage_rescue` (0x662858/0x662868) and `escortee_extract` (0x6627e0) are the radio command "EXTRACT"'s valves in `FUN_005e8e10` (D:L498962-498975). That is the single-player "CALL SUPPORT FOR ESCORTEE EXTRACTION" (`orders.rdr` `CMD_EXTRACT` 29).
  - "Extract escortee or hostage" (0x65da90) is its help text.
  - `CMD_MP_HOSTAGE_KILLED` is a radio chatter entry in `orders.rdr`: `SND_HOSTAGE_KILLED`, `_60561_VipKilled_MSG`.
- **The port today:**
  - `viewer/src/mapOrder.ts:19` has `mode: 'Extraction'`.
  - `hud.ts` `setGame` upper-cases it to "EXTRACTION" on the scoreboard. The original prints "EXTRACT". This is a gap (G15).
  - No code reads `missionlist.rdr`'s TYPE. The rooms run SUPPRESSION on every map (`OBJECTIVE_BY_MAP_PLACEHOLDER`, `viewer/src/net/rules.ts:98`).

### 2.2 A2. Desert Glory's READERM records, and what the mode uses
- `vehicles.rdr` (output in `out/mp6_reader_vehicles.rdr.json`) holds four records:
  - `player` (`mp6_seal1`, `startPlayer`, disabled).
  - `Hostage` / `Hostage2` / `Hostage3`. Their `display` is the same name; `character` is `mp_fem1`/`mp_fem2`/`mp_fem3`; `setup` is `[["hostageStart","0"]]` / `hostage2Start` / `hostage3Start`; `team` is `17 30 31`.
  - These records are what the game creates. `FUN_002b28d0` (D:L155776) places a vehicle record at the AIMAPS named point its setup names (`FUN_00533000` -> `FUN_0052db70` -> `FUN_0052d480`), with the setup's heading index (`FUN_00532fc0` -> `FUN_00518ea0`).
  - The actor's scene name is the record's `name`. The script finds the actors by these exact names: `FUN_0029e590` (D:L144706) compares names with node `+0x90`.
- `chartype.rdr` `escortees` lists `mp_fem1` "Hostage1", `mp_fem2` "Hostage2" and `mp_fem3` "Hostage3".
  - The chartype labels differ from the actor names ("Hostage1" vs "Hostage"). The script uses the `vehicles.rdr` names.
  - The models are `thai_biologist01`, `thai_biologist02` and `thai_wife` (research 91 §14, via `character.rdr`).
- `valves.rdr` holds the map's own valves: `rescue` 6, `rescuecount` 7, `round_count` 8, `cdoor1` 9, `rescuecheck` 10, `freecount` 11 and `killcount` 12, all with value 0.
  - `mp_hostages_by_seals` and `mp_hostages_by_turds` are global valves (`READERC.ZAR/global_valves.rdr`, value 0).
- `actions.rdr` holds two actions:
  - `cdoor1`: DOOR, anim `singleDoor_right`, valve `cdoor1`, range 30, `action_door_open.tif`, at (1732.56, 50.5, 1218.42). This is the hostage-cell door.
  - `access_action1`: anim `destroy_access1`, valve `set_access1`, `points 2`, no type, at (1641.66, 58.75, 1263). This is a C4 target (research 94 C5.1); see U3.
- `mission.rdr` `Scenic_Views` names the places. These are camera views, not used by the rules:

  | name | position |
  |---|---|
  | Extraction Area | (1028, 136, 1997) |
  | Hostage Building | (1535, 211, 1598) |
  | Hostage Room | (1621, 84, 1161) |
  | Hostage Cell | (1776, 83, 1251) |
  | Terrorist Start 1 | (1801, 115, 1191) |
  | Terrorist Start 2 | (1696, 141, 1832) |

- `mission.rdr` `Valves` enable all four SEAL kits' C4 (`Enable_c4` 1). Research 91 §14 shows that on MP6 every SEAL kit carries C4.

---

## 3. B. The map data (coordinates)

Units are the game's (0.1 m). x and z are the cell centre, `min + (cell + 0.5) x 10`. The sub-map is 0, "Base Map": min (705.26, -33.14, 1124.72), max (2375.26, 140.95, 2394.94), 167x128 cells of 10 units, 11,445 cells stored.

### 3.1 B1. Hostages

| actor | named point | cell | world (x, y, z) | grade |
|---|---|---|---|---|
| Hostage (mp_fem1) | `hostageStart`, kind 2 | 0:(104,5) | (1750.26, 49.99, 1179.72) | x,z PROVEN; y STRONG |
| Hostage2 (mp_fem2) | `hostage2Start`, kind 2 | 0:(106,4) | (1770.26, 49.99, 1169.72) | same |
| Hostage3 (mp_fem3) | `hostage3Start`, kind 2 | 0:(106,11) | (1770.26, 49.99, 1239.72) | same |

- **Source of x and z:** `FUN_0052d480` (D:L396879). It computes min + cs/2 + cell x cs. The script is `cell-heights.ts` (output in `out/cell_heights.txt`).
- **Source of y:** `FUN_0052d480` -> `FUN_00516940` (D:L385082) computes `y = sub[+4] + sub[+0xe8] x ((word << 45) >> 54)`, which is bits 9-18 of the cell's first word. `sub[+0xe8] = (sub[+0x10] - sub[+4]) x 0.000976563` (`FUN_0051afe0` D:L387628), that is (max_y - min_y)/1024.
  - **Validation.** Against KNOWN.md's four measured spawns, the nearest slot's cell y is Frostfire A 100.00 vs 100, B 141.93 vs 143, Vigilance A 158.53 vs 160 and B 64.05 vs 65. Research 91 §4.2 adds a +1.0 lift (`FUN_002b8100` D:L158793), which brings all four within about 0.5. That is two independent lines, hence STRONG.
  - **Cross-check with the scene.** The cell door `cdoor1` is at y 50.5, the cell tables `table3`/`table4` are at y 50, and the jail's collision nodes are at y 50. The hostages stand on the jail's ground floor, which is in Base Map's grid at 49.99.
- **Heading:** setup heading "0".
  - `FUN_00518ea0` (D:L386383) case 0 builds a y-axis quaternion of pi (`FUN_00307580` is a y rotation), then, with `param_3` = 1, composes a further pi.
  - The net yaw is 0 (2 pi). The mesh's rest facing is not established here. BELIEVED; H1 owns the visible facing.
- **The jail:**
  - Sub-maps 3 "Jail House - Upper" (y 52-90) and 4 "Jail House - Basement" (y 0.4-49.8) cover x 1545-1805, z 1144-1394. The starts are on Base Map, not on those sub-maps.
  - The cell door `cdoor1` is at (1732.56, 50.5, 1218.42). In the scene graph `cdoor1/mp6_celldoor` has 8 collision polygons.
  - `cell_light1` is at (1761, 85, 1189) and `cell_light2` at (1761, 85, 1229).

### 3.2 B2. The extraction zone

| field | value | source |
|---|---|---|
| record | sub-map 0 zone table, `Safety`; the 28-byte record is `{corner, u16 w, u16 h, kind, name[16]}` | AIMAPS (research 75 §5.4); the game's record stride is 0x1c with the name at +0xc (`FUN_00530370` D:L398614) |
| kind | 1 = **EXTRACT_ZONE** | kinds are listed by `byte+8 & 0x1f` (`FUN_0052bb70` D:L395965-395973). The kind names in `FUN_005d57c0` (D:L488523, `ai::PAINT`'s parser) are 0 DEFAULT, 1 EXTRACT_ZONE (0x6603d8), 2 SAFE_HOUSE, 3 WORM_HOLE, 4 ROUTER, 5 HUD_VISIBLE, 6 GUARD |
| corner, size | cell 0:(6,76), 8 x 15 cells | `out/mp6_ai.jsonl` |
| world rectangle | x [765.26, 845.26), z [1884.72, 2034.72) | `aiZoneRect`; containment is a cell test (below) |
| stored cells | 82 of 120; floor y -30.08 on all 82 | `cell-heights.ts` |
| HUD marker cell | centre (corner + (w>>1, h>>1)) = 0:(10,83), at **(810.26, -30.08, 1959.72)** | `FUN_002a42b0` D:L147723 + `FUN_0052ff40` D:L398452; output in `zone-centre.ts` -> `out/zone_centres.txt` |
| containment test | same sub-map (`loc & 0x3f`) and 0 <= cell x - corner x < w and 0 <= cell z - corner z < h, on the actor's AI-map cell `+0xe4` | `FUN_005ced60` mode 1 D:L484881-484900; `FUN_0052a200` D:L395043 |

The other EXTRACTION maps' zones and centre marks are in `out/all7_ai.jsonl` and `out/zone_centres.txt`:

| map | zone corner and size | centre mark |
|---|---|---|
| MP10 | 0:(205,33) 24x19 | (2141.20, 160.71, 390.02) |
| MP11 | 0:(93,150) 15x13 | (1005.85, 149.63, 1624.24) |
| MP71 | two zones, 0:(134,168) 127x18 and 0:(110,92) 24x94 | -- |

Every INREGION region word in those scripts decodes to exactly the zone's corner: MP6 0x02600180 = 0:(6,76); MP10 0x01083340 = (205,33); MP11 0x04b01740 = (93,150); MP71 0x05402180 = (134,168) and 0x02e01b80 = (110,92). That is PROVEN.

### 3.3 B3. Team spawns, the walk and the other objects
- **Spawns** (`cell-heights.ts`, every slot with x, y, z and facing). Side 0 is the SEALs and side 1 the Terrorists (research 91 §4.2: `FUN_002c30b0` is "is a Terrorist" and gives side 1; research 94 §A).

  | side | slots | x | z | floor y |
  |---|---|---|---|---|
  | 0 | 24 | 840..1140 | 1580..2140 | -30.9..15.3 |
  | 1 | 24 | 1750..2270 | 1230..2220 | 19.9..40.6 |

  - The SEAL slots surround the extraction zone (zone x 765-845, z 1885-2035).
  - The Terrorist slots are split between the jail side (z 1230-1540) and the north-east (z 2060-2220).
  - Placement is the existing machinery: slot `+0xfc8` at a round start, with no mode-specific code. The port already does this (`LoadedMap.respawns`, `room.ts` `spawn`).
- **The walk.** The navigation graph is AIMAPS (research 75): 9 sub-maps and 16 links.

  | # | sub-map |
  |---|---|
  | 0 | Base Map |
  | 1-2 | Building A floors 1-2 |
  | 3 | Jail House Upper |
  | 4 | Jail House Basement |
  | 5 | BldgB F2 |
  | 6 | BldgC F2 |
  | 7 | SEAL sanctuary |
  | 8 | Roof |

  - The starts and the zone are both on sub-map 0.
  - An 8-neighbour BFS over stored cells reaches the zone from each start in 91-93 cell steps (`nav-bfs.ts`, output in `out/nav_bfs.txt`). The straight-line distance is 1200-1243 units.
  - This is an upper bound: the cell word's other bits are not decoded, and they may block edges. H1 owns the real path.
- **Mode objects** (`nodes.ts MP6 ...`, `print-objectives.ts --animation`):
  - `cdoor1` (the cell door). Its anim `singleDoor_right` (`out/mp6_door_anims.txt`) calls `okforhostages` when it opens and `cdoor1 == 1`, and `not_okforhostages` when it closes and `cdoor1 == 0`.
  - Those two anims toggle the scene nodes `nohostagerescue` and `okhostagerescue`. Both are invisible collision groups (flags 0x80001051, 9 collision polygons each), placed at (1789, 50, 1380) with the same bbox.
  - They also toggle `nohostage` and `okhostage`, which are referenced but not placed in MP6's scene.
  - `ok` shows `okhostagerescue` and hides the other three. `not_ok` shows `nohostagerescue`, `nohostage` and `okhostage`.
  - So with the door shut a "no rescue" collision is in place. What it collides with (players, hostages, both) is not decoded. See U2.
  - `action_reset` pauses itself at start.
  - `Hostage_start` / `Hostage2_start` / `Hostage3_start` (one sequence `Cower`) run AI set commands 25 SETANIMSET and 28 STANCE on start (`out/mp6_hostage_anims.txt`). This is H1's.
- **Not an EXTRACTION object:** the scene's `neck_hostage` (two nodes) and `hostage_climber_vis` are visibility/geometry names; the rules never reference them.

---

## 4. C. The rules: MP6 `MZANIM.ZAR` animation `objectives`

Read with `print-objectives.ts --map MP6` (output in `out/mp6_objectives.txt`). The command semantics come from the decomp:
- VALVE ops (`FUN_00353fd0` D:L252128): 1 `!=`, 2 `==`, 3 `>`, 4 `<`, 5 `>=`, 6 `<=`, 0xb set, 0xc add, 0xd sub (floored at 0).
- Operand flags at byte +13: 0x02 = the valve is named, 0x10 = the operand is a valve, 0x08 = the operand valve is named.
- EXPRESSION operators (`FUN_0025e960` D:L108286): 1 NOT, 2 AND, 3 OR, 4 `(`, 5 `)`.
- MESSAGE (`FUN_00267760` D:L113360): +4 is the name index of the raw text, +6 the locale id (0 on MP6: raw text), +0xc the scale. It posts into the main message window 0x4366a0.
- AI conditions: `ai::INREGION` (tick `FUN_005ced60` D:L484771, builder `FUN_005cf290`, 0x1c bytes, header 0x70) and `ai::INSTATE` (tick `FUN_005d8840` D:L490174, builder `FUN_005d8b80`, 0x14 bytes, header 0x50).
- The AI command numbers follow the registration order in `FUN_005de320` (D:L493398-493475): 11 INSTATE, 22 INREGION. The byte sizes match the builders.

All 20 sequences are listed below. 0x102 means the sequence runs at start; 0x104 means it runs when called.

| sequence | what it does (MP6) |
|---|---|
| `reset` (0x102) | `rescue`, `rescuecount`, `rescuecheck`, `freecount`, `killcount` and `mp_penalty` = 0, then stop |
| `start` (0x102) | WAIT 5, then by `player_team` (see C1 for the intro lines). Then WAIT 10 and WHILE `mission_complete == 0 AND mission_failure == 0`: the IF chain in C2 |
| `mission_timer` (0x102) | WAIT 15; WHILE `mp_timer != 0`; then CALL `abort`, STOP `start` |
| `HostKill1/2/3` (0x102) | forever: IF `mp_hostages_by_turds >= 1/2/3`: SOUND `^PH_0008`, MESSAGE "THE TERRORISTS HAVE KILLED A HOSTAGE" 0.7, WAIT 2, MESSAGE "THE SEALS HAVE BEEN CREDITED WITH RESCUING THAT HOSTAGE" 0.7, `rescuecount` += 1, `killcount` += 1, stop |
| `SealKill1/2/3` (0x102) | forever: IF `mp_hostages_by_seals >= 1/2/3`: SOUND `^PH_0007`, MESSAGE "THE SEALS HAVE KILLED A HOSTAGE" 0.7, WAIT 2, MESSAGE "ONE MINUTE HAS BEEN DEDUCTED FROM THE MISSION TIMER" 0.7, `mp_penalty` += 1, `killcount` += 1, stop |
| `Rescue1/2/3` (0x102) | forever: IF `( ai::INREGION(Hostage[2/3] in zone 0:(6,76)) ) OR ( )`: SOUND `^PH_0013`, MESSAGE "A HOSTAGE HAS BEEN RESCUED" 0.7, `rescuecount` += 1, `freecount` += 1, stop |
| `Lead1/2/3` (0x102) | forever: IF `ai::INSTATE(Hostage[2/3], state 9)`: SOUND `^PH_0006`, MESSAGE "A HOSTAGE IS BEING ESCORTED" 0.7, stop. **Once per hostage per round** |
| `SEALcheck` (0x102) | forever: IF `freecount == 3`, or `freecount == 2 AND killcount == 1`, or `freecount == 1 AND killcount == 2`, or `killcount == 3`: `rescuecheck` = 1, stop. **All three hostages are resolved** |
| `abort` (0x104) | `round_count` += 1, `mp_winner` = 99, CALL `game_over`, WAIT 1, `mission_timeout` = 1 |
| `success` / `failure` (0x104) | WAIT 20, `round_count` += 1, CALL `game_over`, WAIT 1, `mission_complete` / `mission_failure` = 1 |
| `game_over` (0x104) | MP51's match logic (research 91 §18.2.2), unchanged |

About the empty `( )` in Rescue: MP71 fills the second slot with its second zone's INREGION, so it is a template slot. In `FUN_0025e960` a `(` immediately followed by `)` returns the callee's preserved result, the left operand's. The effective test is the INREGION alone (BELIEVED, U9).

### 4.1 C1. Intro (the objective lines)

| `player_team` | what is posted and played | when |
|---|---|---|
| 0 (SEAL) | "OBJECTIVE:" 0.9 + "LOCATE AND EXTRACT THE HOSTAGES" 0.7; WAIT 2; "MOVE AT LEAST TWO HOSTAGES TO THE EXTRACTION ZONE" 0.7 + `MUS_MP_SEAL_INTRO_5` (flags 0x880, the music slot) | 5 s, then 7 s |
| 8 (Terrorist) | "OBJECTIVE:" 0.9 + "PREVENT THE SEALS FROM RESCUING THE HOSTAGES" 0.7 + `MUS_MP_TERR_INTRO_5` | 5 s |
| 16 (spectator) | `MUS_MP_SEAL_INTRO_4` only | 5 s |

Because the IF block ends with WAIT 10, **the watch loop starts at 17 s on a SEAL console and at 15 s on a Terrorist or spectator console**. Which one decides depends on the host's team; see U7.

### 4.2 C2. The round's IF chain, in evaluation order (every branch for every `player_team` 0/8/16)

1. `aiteam_08 == 0`: no living Terrorist.
   - `mp_score00 += 1`, `mp_winner = 0`.
   - "ALL TERRORISTS ELIMINATED" 0.7 + "SEALS VICTORIOUS!" 0.9; `^PH_0014`; WAIT 2; `MUS_MP_SEAL_WIN_ALG`.
   - Then `success` (SEAL console) or `failure` (Terrorist and spectator consoles).
2. `aiteam_00 == 0`: no living SEAL.
   - `mp_score08 += 1`, `mp_winner = 8`.
   - "ALL SEALS ELIMINATED" 0.7 + "TERRORISTS WIN!" 0.9; `^PH_0002`; WAIT 2; `MUS_MP_TERR_WIN_ALG`.
3. `rescuecount >= 2 AND rescuecheck == 1`: **the SEALs win by rescue**.
   - `mp_score00 += 1`, `mp_winner = 0`.
   - **WAIT 2**, then "SEALS VICTORIOUS!" 0.9 (no first line); `^PH_0014`; WAIT 2; `MUS_MP_SEAL_WIN_ALG`.
4. `mp_hostages_by_seals >= 2`: **the Terrorists win by hostage kills**.
   - `mp_score08 += 1`, `mp_winner = 8`.
   - "TERRORISTS WIN!" 0.9; `^PH_0002`; WAIT 2; `MUS_MP_TERR_WIN_ALG`.
5. Every branch then stops `mission_timer` and `start`.
   - The STOP comes **after** the branch's WAITs. For 2-4 s after a decision the clock sequence can still fire `abort`; see U5.

Hold from the decision to the round's end state:

| branch | hold before the end state |
|---|---|
| elimination, hostage-kill win | 2 + 20 + 1 = **23 s** (the port's `ELIMINATED_HOLD_S`) |
| rescue win | 2 + 2 + 20 + 1 = **25 s** |

The engine adds its 3.0 s (`FUN_002a9b30`, research 91 §18) and the ROUND COMPLETE screen.

**Who counts in `aiteam_00/08`.** `FUN_002b23a0` (D:L155569, run on the host or offline) zeroes `aiteam_00..31` and then counts the living actors:
- an online SEAL (`FUN_002c31d0`) goes to `aiteam_00`, plus +0x18e0;
- a Terrorist goes to `aiteam_08`, plus +0x18e4;
- a ghost goes to +0x18a8;
- any other actor goes to one valve per set bit of `+200`.

A hostage's team is `17 30 31`, read as bits 0xC0020000 (U8). That puts hostages in `aiteam_17/30/31` and never in 00 or 08. **Hostages never affect elimination.** PROVEN for the code path; the bit reading of `vehicles.rdr`'s team list is BELIEVED.

### 4.3 C3. What a hostage's death does
The death is attributed in `FUN_0059ee20` (D:L458059). The escortee branch is taken when the victim's `+200 & 0x20000` is set (D:L458083), and runs only online.

1. **Team counters:**
   - a Terrorist killer (`FUN_002c30b0`) adds 1 to `mp_hostages_by_turds` (game `+0x3c`, D:L458127);
   - a SEAL killer (`FUN_002c31d0`) adds 1 to `mp_hostages_by_seals` (game `+0x38`, D:L458123).
   - Harry62's `objects.txt` labels GameObject `+0x38` "SealHostages" and `+0x40` "mp_penalty". His `TerrHostages` label is consistent with `+0x3c`.
   - Both counters are reset at each round start (`FUN_002a6c50` D:L149084-149097).
2. **The killer** (`FUN_00545390` D:L411516), credited only on the killer's own console online:
   - score -2 in every type but ESCORT (in ESCORT a SEAL killer loses 2 and a Terrorist killer gains 3);
   - +1 to round block `+0x18` ("escortees killed");
   - a team-score recount, `FUN_00544d60(killer, 0)`.
   - No team-kill or suicide counter changes. **No kick and no vote.** The vote to remove (research 91 §17) is separate.
3. **No kill line** is posted. `FUN_00547860` takes the `else` path for the escortee (D:L412909) and sends AI event 0x44 to the dead escortee instead (`FUN_005e7f20` -> `FUN_005e7960`). See U4.
4. **The script reacts on every console:**
   - a Terrorist kill runs HostKill: `^PH_0008`, two lines, and **the SEALs are credited** (`rescuecount` +1, `killcount` +1);
   - a SEAL kill runs SealKill: `^PH_0007`, two lines, `mp_penalty` +1, `killcount` +1;
   - two SEAL kills end the round for the Terrorists (C2 step 4).
5. **The minute.** On the host (`DAT_0045a0c0`), the online game update `FUN_002a9ee0` (D:L150716-150719) and its twin `FUN_002c00f0` (D:L163054-163057) compare the `mp_penalty` valve (`+0x40`) with the last seen value (`+0xc0`). When it rose they call `FUN_002a6960(game, 0x3c)` (D:L148928):
   - if the round's **total** time `+0xe0` in seconds exceeds 60, the total becomes (total - 60) x 1000 ms;
   - otherwise, if the total is nonzero, it becomes 1000 ms.
   - The remaining time is total - elapsed (D:L151085-151093), so a late SEAL kill can run the clock out at once. That gives `mission_timer` -> `abort`: **a draw**.
   - Only one 60 s is applied per observed change. Two increments in one update would cost 60 s, not 120; this edge is BELIEVED.
   - The host sends the new total in its game-state update (`uStack_54` = `+0xe0` x 0.001, D:L150720ff).
   - Grade STRONG: the script's message, the code and Harry's label agree.

### 4.4 C4. What a rescue does
- **The code.** `FUN_0056f970` (D:L432926, the escortee controller tick, local) fires when:
  - the actor is an escortee (`+200 & 0x20000`);
  - it has a leader (`+0x5d8` resolves to a player-type actor);
  - and its AI-map cell lies in **any EXTRACT_ZONE** (`FUN_0052a200(.., 1, actor+0xe4)`, D:L432966).
- It then enters AI state 0x11 (rescued; `FUN_005f5ba0(.., 0x11, 0)` D:L432975) and calls `FUN_00545480(leader block, leader)` (D:L411552):
  - credit only when the leader is a SEAL online;
  - +1 to round block `+0x1c` ("brought out");
  - **score +3**;
  - `FUN_00544d60(leader, 1)`: each living teammate of the leader adds +1 to the SEAL team bonus (game `+0x7c`, D:L411238). That bonus feeds `seals_team_score`, which only the respawn mode reads.
- **The remote twin.** `FUN_0056f4c0` (D:L432808) credits the leader packed in bits 8-23 of the network state word when a remote escortee's state turns to 0x11 (D:L432837-432848).
- **The script, independently:**
  - `Rescue1/2/3` test INREGION on the named actor with no leader condition: `rescuecount` +1, `freecount` +1, `^PH_0013`, "A HOSTAGE HAS BEEN RESCUED";
  - `Lead1/2/3` post "A HOSTAGE IS BEING ESCORTED" + `^PH_0006` the first time each hostage is in AI state 9.
  - The meaning of states 9 and 0x11 is H1's (U1).

### 4.5 C5. Scoring, stats, primary objective

| event | counter (round block `actor+0x58c+`) | points | source |
|---|---|---|---|
| enemy kill / suicide / team kill / death | as in research 91 §8 | +2 / -2 / -2 / 0 | research 91 |
| hostage killed (killer) | `+0x18` | -2 | `FUN_00545390` D:L411516 |
| hostage brought out (leading SEAL) | `+0x1c` | +3 | `FUN_00545480` D:L411552 |
| round won (`mp_winner`'s side) | `+0x3e` | +5 each | `FUN_00223970` D:L76146-76160 |
| alive at the round's end | `+0x42` | +1 each | D:L76162-76165 |
| **primary objective** (EXTRACTION) | `+0x32` += 1 for the local player at the round's end | -- | see below |

The primary objective (`FUN_00224d10` D:L76467, called D:L76026) is awarded:
- to a living SEAL when the SEALs' summed "brought out" this round (`+0x5a8`) is more than 1;
- to a living Terrorist when no SEAL is alive.

Stats: the round block is folded into the match block at round end. The online record's "HOSTAGES RESCUED" (`+0x24`) takes the match's brought-out count in every type but ESCORT (`FUN_00225070` D:L76619-76632; research 155 §1). That is what PLAYER INFO's "HOSTAGES RESCUED:" (0x3f4e30, `FUN_002f0020` D:L192097) shows. There is **no in-round hostage counter** on the HUD.

### 4.6 C6. The clock, respawn, the match
- **Round time:** `mp_round_time` x 1000 ms (`FUN_002a6c50` D:L149156). The create-game default is 6 minutes, with choices of 4-10 (research 91 §1). There is no game-type branch (the only type test there, D:L149166, is for types 1/2).
- **Respawn:** never in EXTRACTION. `Respawn` = (`mp_allow_respawn` and type == 5) (`FUN_002a7560` D:L149405-149431).
- **Match:** the `game_over` sequence is MP51's: 11 rounds, the first to 6, a tiebreaker past 11 if level (`isMatchOver` in the port).
- **Draws:** a time-out is a draw. Neither side's round count rises, and the round screen shows DRAW/DRAW (research 91 §18 `CallRoundATie`: `mission_timeout` -> both DRAW).

---

## 5. D. HUD and feedback

| element | value | source | grade |
|---|---|---|---|
| hostage compass mark | marker type 4 -> bitmap slot `+0x18` = `ret_hostage.tif` (HUD2) | bitmaps loaded in order by `FUN_002126f0` D:L68576: type 0 ret_triangle, 1 ret_bomb, 2-3 ret_base, 4 ret_hostage, 5 ret_friendly, 6 ret_extraction, 7-8 ret_objective, 9 hud_talk, 10 small_compass | PROVEN |
| when a hostage gets it | at AI controller set-up for an escortee (`FUN_00573130` D:L434920, `FUN_005434b0(actor, 4, 0)`); a type 4/5 mark is made only if the actor's `+200` overlaps the local player's (D:L410155), which a hostage's 0xC0020000 does for both sides | -- | STRONG |
| the mark on a remote hostage | added while alive and a state bit is set, removed otherwise (`FUN_0056f4c0` D:L432836-432841) | -- | STRONG (bit meaning: H1/H3) |
| removal on rescue | the rescued state calls `FUN_00543480` on entry (`FUN_005594b0` D:L422308) | -- | STRONG |
| extraction mark | one marker per EXTRACT_ZONE on sub-map 0, named "EXTRACTION LOC" (0x3f0a68), type 6 -> `ret_extraction.tif`, at the zone's centre cell with its floor y. On MP6: (810.26, -30.08, 1959.72). Made at map load (`FUN_002abd40` D:L151857); every marker made by `FUN_002a28f0` joins the compass list 0x436390 (D:L146907) | `FUN_002a42b0` D:L147723 | PROVEN position, STRONG drawing |
| visibility online | the compass's online switch (jump table 0x3e44b0, read from the ELF: `out/compass_jumptable.txt`): types 1-8, 12, 13 always shown; types 0, 9, 10, 11 hidden past 900 units (`DAT_003dc518` = 900.0). Hostage (4) and extraction (6) are **always shown** | `FUN_00211510` D:L68148; disassembly 0x211a9c-0x211b18 | PROVEN |
| alpha | type 0 or > 13: 128 (`DAT_003dc500`); types 1-13: the pulsing `DAT_0040c070` (64-128 at 250/s, research 87 §1.7) | D:L68112-68117 | STRONG |
| colours (GS 0-128) | type 4 hostage (62, 49, 36); type 6 extraction (36, 40, 62) | `FUN_002126f0` +0xa0 + type x 0xc (D:L68680-68700) | PROVEN (table); STRONG (no marker override, `FUN_002a2c70`) |
| placement | within 200 units at radius distance x 0.005 x 65; beyond that pinned at radius 64 at 1.2x with `ret_triangle` at 0.6x, radius 50 | research 87 §10 | (existing) |
| order prompts | "FOLLOW!" (0x3e4f00, action 0xe, mask 0x4000) and "HOLD POSITION" (0x3e4f08, action 0xf, mask 0x8000), both with `action_escortee.tif` (0x3e4dd0) | `FUN_0021ded0` D:L73564-73565, D:L73782-73800, D:L74265-74290 | STRONG (the trigger is H1's) |
| locale | HudCLOC 60499 "HOSTAGE/POW/TRAITOR" (`_HOSTAGE_SYM_MSG`, legend), 60502 "EXTRACTION POINT"; radio chatter 60581 "%s : PROTECT THE HOSTAGE", 60582 "COVER HOSTAGE", 60589 "WE'VE GOT CONTROL OF A HOSTAGE", 60761 "I'M GOING FOR THE HOSTAGES." (the id mismatch is research 103 §; the texts are on the disc) | `out/readerc_hostage.txt` | PROVEN (text) |
| voice / music | `^PH_0013` rescued, `^PH_0006` being escorted, `^PH_0007` SEALs killed a hostage, `^PH_0008` Terrorists killed one, `^PH_0014` / `^PH_0002` the result lines. All are MULTI-bank streams `PH_00xx.VAG` with no subtitle (`sounds-ph.ts`). Music: `MUS_MP_SEAL_INTRO_5`, `MUS_MP_TERR_INTRO_5`, `MUS_MP_SEAL_INTRO_4` (spectator), `MUS_MP_SEAL_WIN_ALG`, `MUS_MP_TERR_WIN_ALG` | MP6 `objectives`; research 124 §3 for the resolver | PROVEN |
| hostage's own voice | the `HOSTAGE` bank in `sounds.rdr`: streamed `CO_0271A..` lines, RANGE 40-200 (`out/sounds_hostage.txt`) | -- | H1 |
| radio chatter | `orders.rdr`: `CMD_MP_HOSTAGE_KILLED` -> `SND_HOSTAGE_KILLED` / `_60561_VipKilled_MSG`; `CMD_MP_ESCORTEE_FOLLOWING` -> `SND_ESCORTEE_FOLLOWING` / `_60562_LeadingVip_MSG` (list index 11 and 12, `out/orders_cmd_index.txt`). Who triggers them was not traced | -- | data PROVEN |
| end of round | as classic (research 91 §18): ROUND COMPLETE (WINNER/LOSER/DRAW), FINAL ROUND, GAME COMPLETE with YOUR STATS. PRIMARY OBJECTIVES there counts the C5 award | -- | STRONG |
| no tactical map | in multiplayer (research 87 §9). The single-player map would draw kind 1/5 zones as (200,0,200) outlines; not used online | -- | (existing) |

---

## 6. E. What the port has, and the gap list

**What the mode would reuse** (paths in `$PORT`):
- the classic round machine in `packages/match/src/room.ts` (`clock`, `endRound`, the 15 s watch, `ELIMINATED_HOLD_S`, draws, +5/+1, `isMatchOver`) and `viewer/src/net/rules.ts`;
- spawn slots from AIMAPS (`scene/src/aimaps.ts`, `LoadedMap.respawns`);
- zones parsed (`AiZone`, `aiZoneRect`) and drawn on the tactical map (`viewer/src/tacMap.ts`);
- the doors (`DoorSet`, research 92), so `cdoor1` opens;
- C4 targets (research 94);
- the message window and its scales;
- the compass with nav marks (research 87 §10);
- the scoreboard;
- the round streams resolver and `roundCues.ts` (it already decodes MP6's intro and elimination cues);
- `sound/src/script.ts`, which names the `MULTI` and `HOSTAGE` banks;
- the round-end screens.

**Gaps** (G = must exist for the mode; ordered by dependency):

| id | gap | source to build from | test first |
|---|---|---|---|
| G1 | The room knows a map's game type | `missionlist.rdr` TYPE via `mission.rdr` description, or MP number | `extraction.test.ts`: "MP6 is EXTRACTION, MP2 SUPPRESSION" |
| G2 | Escortee actors in the room: three named actors from `vehicles.rdr` at their named points (x, z cell centre; y = cell height + the game's lift), team flag 0xC0020000, not players, not counted for elimination | A2, B1, C2 "Who counts" | "MP6 spawns Hostage, Hostage2, Hostage3 at (1750.26, 49.99, 1179.72)…"; "elimination ignores hostages" |
| G3 | AIMAPS cell height reader (`aiCellY`) | B1 formula; replaces the slot-y estimate and `onFloor` fallback for slots too | the four KNOWN spawns within 1.5 |
| G4 | EXTRACT_ZONE test on an actor's cell (same sub-map, corner-relative rectangle) | B2 | "cell (6,76) in, (14,76) out, (13,90) in, (13,91) out" |
| G5 | Hostage death attribution: `mp_hostages_by_seals` / `_turds` by killer side; killer -2 and `+0x18`; no kill line | C3 | "a SEAL kills a hostage: SEAL -2, by_seals 1, no kill message" |
| G6 | The script's state: `rescuecount`, `freecount`, `killcount`, `rescuecheck` (all-three-resolved), `mp_penalty`; HostKill/SealKill/Rescue/Lead one-shots with their lines and sounds | C | "two rescued + third still in the cell + time out = draw"; "two rescued + Terrorists kill the third = SEAL win"; "SEALs kill two = Terrorist win" |
| G7 | The minute penalty on the round total, floored at 1 s | C3.5 | "total 360, elapsed 100, SEAL kill -> total 300"; "total 50 -> 1 s -> draw" |
| G8 | Rescue credit: leader SEAL +3, `+0x1c`, team bonus; the rescued state | C4 (state behaviour H1) | "SEAL leads Hostage into Safety: +3, brought out 1, message once" |
| G9 | Win branches and holds: rescue win 25 s (WAIT 2 before "SEALS VICTORIOUS!"), hostage-kill win 23 s; evaluation order elimination -> rescue -> SEAL-kills | C2 | hold timings |
| G10 | Per-type objective lines (EXTRACTION's three lines; the SEALs' WAIT 2) | C1; replaces `OBJECTIVE_BY_MAP_PLACEHOLDER` for these maps | "SEAL sees 'LOCATE AND EXTRACT THE HOSTAGES' then at 7 s 'MOVE AT LEAST TWO…'" |
| G11 | Primary objective award at round end | C5 | "living SEAL, 2 brought out -> +1 primary" |
| G12 | Compass marks type 4 (on each hostage) and type 6 (zone centre), always shown online, pulsing, colours | D | layout test as research 87 §10's |
| G13 | FOLLOW! / HOLD POSITION prompts with `action_escortee.tif` | D (trigger H1) | prompt text and icon |
| G14 | Hostage cues: `^PH_0006/7/8/13` through the existing stream resolver; `roundCues.ts` to read the rescue and hostage-kill branches as well as elimination | D, C | the cue table for MP6 |
| G15 | Scoreboard GAME DETAILS caption "EXTRACT" (not "EXTRACTION") | A1 | caption string |
| G16 | Online stats: brought-out count to HOSTAGES RESCUED | C5 | (with the stats record work) |
| G17 | Cell-door collision swap `okforhostages` / `not_okforhostages` (nodes `nohostagerescue` / `okhostagerescue`) | B3 (semantics U2) | after U2 |
| -- | Hostage AI (cower, follow, stop, path, flee), animation, death clip | **H1** | -- |
| -- | Escortee replication (state word, leader id, position) | **H3** | -- |

---

## 7. F. UNRESOLVED and owed evidence

| id | question | searched | owed evidence |
|---|---|---|---|
| U1 | AI state 9 (Lead's test) and 0x11 (rescued) by name | the state-name strings 0x65cd38.. are alphabetical, not by id; `FUN_005f5ba0(..,0x11)` and CAiSRescued 0x65c718 | H1's state table; or the r0004 twin plus Harry's labels |
| U2 | What `nohostagerescue` / `okhostagerescue` collide with | `nodes.ts` (flags 0x80001051, 9 polys each, same bbox); anims `okforhostages` / `not_okforhostages`; no ELF string | the collision filter of `di_`-style nodes (scene-graph collision flags), or a PCSX2 run on MP6: with the cell door shut, lead a hostage to the bars and log whether it is stopped; read the actor's position |
| U3 | `access_action1` "points 2" consumer | `FUN_0032e970(..,"points",+0x38)` at D:L157330; no reader of action `+0x38` found in a grep of the action functions | a breakpoint-free read: search for loads of offset 0x38 on objects of vtable 0x406390; or a capture of a SEAL's score before and after destroying it |
| U4 | AI event 0x44 sent to a dead escortee | `FUN_005e7f20` -> `FUN_005e7960`; the `orders.rdr` list puts `CMD_MP_HOSTAGE_KILLED` at 0x2d if the 0x27 = ENEMY_DEAD offset holds, so 0x44 is not that | H1's event table |
| U5 | The 2-4 s window after a decision when `mission_timer` still runs | script order (STOP after the WAITs) | a round decided within 4 s of 00:00 (practically never); low priority |
| U6 | Can a Terrorist lead a hostage, and does a rescued hostage stay killable (double count in SEALcheck)? | `FUN_0056f970` makes state 0x11 regardless of the leader's side and credits only a SEAL; the script's INREGION has no leader test | H1's `TryControlHostage` (r0004 0x604810 / r0001 0x5fd010) team test; whether CAiSRescued actors can take damage |
| U7 | Is the 15 s / 17 s watch start the host's? | `FUN_002b23a0` counts `aiteam_*` only on the host or offline; the master copies `mp_score*` (research 91) | MP6 online, host on SEAL: round with a Terrorist dying at 16 s; check whether the SEAL win posts at 16 or 17 s |
| U8 | `vehicles.rdr` `team 17 30 31` = bits 0xC0020000 | the escortee test `& 0x20000` (bit 17) fits; the SEAL/Terrorist words carry bits 30/31 | RDRAM dump of an MP6 round: a hostage actor's `+0xc8` (Harry: "Player Team ID"), expected 0xC0020000 |
| U9 | The empty `( )` group | `FUN_0025e960` recursion returns the preserved s1 (left operand) | covered by MP71 using the slot; behaviour on MP6 = INREGION alone |
| U10 | The hostage's facing at spawn | `FUN_00518ea0` pi, then pi | RDRAM: a hostage's quaternion `actor+0x70` at round start |

Capture owed overall (one MP6 online round on PCSX2, which H1 and H3 also need):
- RDRAM at round start: the three hostages' `+0x1c..+0x24` positions (expected (1750.26, ~50, 1179.72) …), `+0xc8` and `+0x70`.
- Game object `+0xe0` before and after a SEAL hostage kill (expected -60000).
- The message window text after each event.

---

## 8. Sourced but not implemented (multiplayer-relevant, found along the way)
- **AIMAPS cell heights.**
  - Rule: y = min_y + (max_y - min_y)/1024 x ((word >> 9) & 0x3ff) (`FUN_00516940`, `FUN_0051afe0`). It is validated on all four measured spawns.
  - The port's `SpawnSlot` doc says "The y is not in the file". The slot y estimate and the `onFloor` fallback (`scene/src/aimaps.ts` 309-345) can use this.
  - It also places named points and nav marks in 3-D.
- **The zAnim condition grammar.**
  - EXPRESSION (cmd 43) operators: 1 NOT, 2 AND, 3 OR, 4 `(`, 5 `)` (`FUN_0025e960` D:L108286).
  - VALVE ops 0..16, including 7 "either nonzero", 8 AND-mask, 13 saturating subtract, 14 multiply, 15 OR, 16 AND (`FUN_00353fd0`).
  - This settles `ROUND_CUE_CONDITIONS_READING` (research 124 §8, `viewer/src/roundCues.ts:49`).
- **AI zone kinds:** 0 DEFAULT, 1 EXTRACT_ZONE, 2 SAFE_HOUSE, 3 WORM_HOLE, 4 ROUTER, 5 HUD_VISIBLE, 6 GUARD (`FUN_005d57c0`).
  - Zones are listed per kind (`FUN_0052bb70`) and can be repainted at run time (`FUN_00529c00`).
  - The VIP maps' kind-5 zones are HUD_VISIBLE.
- **Compass online visibility switch** (jump table 0x3e44b0): types 1-8, 12, 13 always shown; types 0, 9-11 cut at 900 units. This resolves research 87 §10's "multiplayer handlers of types 0-13 not resolved".
- **Compass colour table** for all marker types (`FUN_002126f0`, +0xa0 + 12 x type).
- **Round-start valve resets** (`FUN_002a6c50` D:L149084-149103): `mp_hostages_by_*`, `mp_penalty`, and game `+0x70`.
- **The other EXTRACTION maps** (MP10, MP11, MP71) run the identical rule script, so G1-G12 give all four.
  - MP71 uses locale ids 7100-7113 (`mp71LOC.rdr`).
  - MP71 has two extraction zones.

## 9. Leads for other workstreams
- **H1:**
  - `vehicles.rdr` is the creation record: name, character and setup point.
  - `Hostage_start` "Cower" runs SETANIMSET and STANCE.
  - AI state 9 = being led (the script's "A HOSTAGE IS BEING ESCORTED"); 0x11 = rescued (`FUN_0056f970` D:L432966-432985, `FUN_005594b0`).
  - The leader id lives at controller `+0x5d8`.
  - Harry's function labels `TryControlHostage` / `ControlHostageAction` (r0004 0x604810 / 0x604710) are usable.
  - **Caution (C1, re-checked):** his *data* labels in r0004 0x4759xx-0x476xxx (`HOSTAGE_ORDER_RANGE_SQUARED$2655`,
    `hostage_ignore$2777`, ...) are SOCOM 1 demo symbol addresses. No SOCOM II code references that range, so no value
    may be read there. The order range must be found through the code that uses it. This note reads nothing from that
    range.
  - The prompts FOLLOW! / HOLD POSITION are action ids 0xe / 0xf.
  - The cell-door collision swap (U2).
- **H3:**
  - The remote escortee update `FUN_0056f4c0` (D:L432808): the state word's low byte is the state; bits 8-23 are the credited leader on state 0x11; a byte-3 bit drives the compass mark.
  - The `mp_hostages_by_*` valves are incremented on every console from the replicated death.
  - The penalty minute is host-only and carried in the round-total field of the game update.
  - **Agreement with C1/M1:** they found that `mp_penalty` takes 60 s off the round per SEAL hostage kill, minimum 1 s.
    This note derives the same from `FUN_002a6960`.
  - **M2** ([193](193-m2-mp-net-replication.md)) found no hostage net-object type among the 7 (Seal, Persona, Blather,
    Grenade, Game, Bomb, Platform), and believes a hostage is a Seal-type object the host creates.
    - That fits this note: the hostages come from `vehicles.rdr` through the generic actor creator `FUN_002b28d0`, and
      the host alone counts `aiteam_*`.
    - That fits `FUN_0056f4c0`: the remote escortee is driven by a controller state word, as remote Seals are.
- **Round / HUD workstream:**
  - `roundCues.ts` should read the IF operators (above) instead of the reading.
  - The SEAL intro on hostage and VIP maps has WAIT 5 + WAIT 2 (research 124 already notes 7 s).
- **Stats (research 155):**
  - the EXTRACTION primary-objective award `FUN_00224d10`;
  - the hostage-kill counter `+0x18` is not in the online record outside ESCORT.

## 10. Verification (V2, 2026-10-04)

The verifier's file: `research-wave-2026-10-04/V2-verify-hostage.md` (its scripts and outputs under `research-wave-2026-10-04/scratch/V2/`). V2 verified H1, H2 and H3's implementation-critical claims. What follows is the verifier's own text for this report's claims, verbatim; its claims about the other reports are in their notes ([178](178-the-research-wave-of-2026-10-04.md) has the table).

Verifier V2, wave 2026-10-04. Read-only. My scripts and outputs are in `scratch/V2/` (see its `README.md`).

**Independence.** None of my scripts import the port's TypeScript parsers or H1/H2/H3's helpers. I wrote my own:
- a PT_LOAD ELF reader with capstone (`elf.py`);
- a binary `.rdr` decoder (`rdrbin.py`);
- a raw AIMAPS byte decoder (`aimaps_points.py`);
- a raw zAnim command-stream decoder for MP6's `objectives` (`zanim_raw.py`);
- a reader for the 2026-09-17 capture logs (`capture_0917.py`).

Decomp citations are r0001 `D:L<line>`.

**Which ELF the decomp matches.** `game/disc/socom2_game.elf` and `game/overlays/socom2_game.elf` are byte-identical (4,835,072 bytes, sha256 `06b83684719a78ad...`; the overlay's `repair.json` lists no repairs). The decomp's addresses match it:
- FUN_005f6550 and FUN_00601910 lie in the 0x4c5380 segment;
- the instruction at 0x591f94 is `sltiu v0,v0,0x14`, which is D:L451447's `< 0x14`;
- the vtable slots below point at the decomp's function addresses.

### 10.1 Verdicts

| # | claim (owner) | verdict | one-line reason |
|---|---|---|---|
| 1 | Desert Glory = `MP6.ZDB`, EXTRACTION, game type 4 (H2) | CONFIRMED | My rdr decoder reads `DESERT GLORY / 6 / EXTRACTION` in `READERC.ZAR`. `FUN_002c9540` D:L168883 maps the string 0x3f2e78 "EXTRACTION" to 4. |
| 2 | Three hostages from `vehicles.rdr`: Hostage/2/3, `mp_fem1-3`, team `17 30 31` (H2) | CONFIRMED (U8 now PROVEN) | Raw decode agrees. The record parser ORs `1<<n` over the team list into record +0x11c (D:L400381-400401, 400443), and `FUN_0029ed10` stores that into body +200. So the mask is 0xC0020000. |
| 3 | Spawn coordinates (1750.26/1770.26/1770.26, 49.99, 1179.72/1169.72/1239.72) (H2) | CONFIRMED (x,z PROVEN; y stays STRONG) | Cells (104,5), (106,4) and (106,11) come from the raw AIMAPS loc words, and the Base Map min (705.263, 1124.72) and 10-unit cells from its header. The capture validates the cell-centre formula and the +1.0 lift: the SEAL's first sample is exactly cell (15,77), (860.263, -29.081, 1899.719). |
| 4 | Extraction zone `Safety`, kind 1, 0:(6,76), 8x15, x 765.26..845.26, z 1884.72..2034.72 (H2) | CONFIRMED | Raw record `80016002 0800 0f00 01000000 "Safety"`. Kind 1 = "EXTRACT_ZONE" (switch D:L488569). The containment test `FUN_0052a200` uses the same sub-map with 0<=dx<w and 0<=dz<h. |
| 5 | Cell door `cdoor1`: DOOR, valve `cdoor1`, range 30 (H2) | CONFIRMED (data) | Raw decode of `actions.rdr`. The collision meaning of `nohostagerescue`/`okhostagerescue` is still unresolved, as H2 says. |
| 6 | SEAL win = `rescuecount >= 2` AND `rescuecheck == 1` (all three resolved) (H2) | CONFIRMED | My own decode of the condition bytes (ELSEIF at file 0xa07148..0xa07318; SEALcheck at 0xa07f78..0xa08038). |
| 7 | Terrorists win when the SEALs kill 2 (`mp_hostages_by_seals >= 2`) or all SEALs die (H2) | CONFIRMED | Same decode (0xa07400..0xa07588; elimination 0xa06ecc..0xa07074). |
| 8 | Time-out is a draw (`mission_timer` -> `abort`, `mp_winner` 99) (H2) | CONFIRMED | `WHILE mp_timer != 0` at 0xa07684, then `abort`: `round_count` +1, `mp_winner` = 99, `mission_timeout` = 1. |
| 9 | A hostage kill costs the killer -2 and posts no kill line (H2/H1) | CONFIRMED-WITH-CORRECTION | Code agrees. Correction: only the -2 is local-gated. The +1 "escortees killed" (+0x18) and `FUN_00544d60` run on every console (D:L411546-411547). Nothing is counted unless the killer resolves to a type-2 entity (D:L458078). |
| 10 | SEAL hostage kill = 60 s off the round total, or down to 1 s (H2) | CONFIRMED | `FUN_002a6960` D:L148936-148949 (host only). game+0x40 is bound to "mp_penalty" by name at D:L149589, so this does not rest on Harry's label. |
| 11 | Rescue gives the leading SEAL +3 and +1 brought-out, local only (H2) | CONFIRMED | `FUN_00545480` D:L411560-411570. |
| 12 | Holds: rescue win 25 s, elimination/kill win 23 s (H2) | CONFIRMED | My WAIT timeline: rescue branch WAIT 2 + WAIT 2; `success`/`failure` WAIT 20 + WAIT 1. |
| 13 | Watch loop starts at 17 s (SEAL) / 15 s (Terrorist, spectator) (H2) | CONFIRMED | WAIT 5; the SEAL branch's WAIT 2; then WAIT 10 before the WHILE. |
| 14 | Hostages never count in `aiteam_00/08` (H2) | CONFIRMED (+ capture) | On the host (A) of a 1v1 Desert Glory round, the capture's last sample has `aiteam_00` = `aiteam_08` = 1. |
| 22 | Rescue: kind-1 zone test, the "ever led" condition, credit to the last leader (H1/H2) | CONFIRMED (+2 details) | `FUN_0056f970` D:L432964-432985. If the last leader no longer resolves as an entity, +0x5d8 is reset to -1 and there is no rescue. Re-pushing 0x11 is refused while 0x11 is on top (`FUN_005f5cd0` D:L505626), so the credit is not repeated each tick. |

### 10.2 Claim 1: Desert Glory = MP6, EXTRACTION, type 4

- **Route.** `rdrbin.py READERC.ZAR "DESERT GLORY"` gives `NAME DESERT GLORY / NUMBER 6 / TYPE EXTRACTION / MULTIPLAYER`.
- **Type mapping.** `FUN_002c9540` (D:L168876-168906) compares the TYPE string with:
  - 0x3f2e68 DEMOLITION -> 2;
  - 0x3f2e78 EXTRACTION -> 4;
  - 0x3f2e88 SUPPRESSION -> 5;
  - 0x3f2e98 BREACH -> 1;
  - 0x3f2ea0 ESCORT -> 3.

  I read the strings with `elf.py str`. ESCORT = 3 is the type that `FUN_00545390` tests (D:L411530), consistent with H2's ESCORT exception.
- **Verdict.** CONFIRMED.

### 10.3 Claim 2: The three hostages and their team mask

- **Route.** `rdrbin.py MP6.ZDB hostage2Start` (`out_mp6_vehicles.txt`) shows four records:
  - `player` (team `1 2 31`, disabled);
  - `Hostage`/`Hostage2`/`Hostage3`, with `mp_fem1`/`mp_fem2`/`mp_fem3`, `setup hostage[2|3]Start 0` and `team 17 30 31`.
- **U8 settled.** The vehicle-record parser at D:L400381-400401 walks the `team` key (string 0x65b088 "team") as a list of ints. It ORs `1 << n` for each n in 0..31 and stores the result at record +0x11c (D:L400443).
  - `FUN_002b28d0` copies +0x11c into the body through `FUN_0029ed10`, which is `*(body+200) = mask` (D:L144915).
  - Online, it swaps bits 30/31 when `DAT_004412d8` is set (D:L155859-155866). A hostage has both bits, so the swap does not change it.
  - The hostage mask is therefore 0xC0020000: **PROVEN**.
- **Capture cross-check of the player masks.** The local body +0xc8 reads 0x40000001 on A (SEAL) and 0x80000100 on B (Terrorist). These are exactly H1's SEAL and Terrorist masks.

### 10.4 Claim 3: Spawn coordinates

- **Route.** `aimaps_points.py` reads the raw MP6 bytes. Each named point is stored as `{u32 info, u32 loc, name[16]}`. The loc word has bits 0-5 = sub-map, bits 6-18 = x, bits 19-31 = z; this is the same packing as `FUN_0052a200` and as H2's region words. The decoded cells:
  - `hostageStart` (0,104,5);
  - `hostage2Start` (0,106,4);
  - `hostage3Start` (0,106,11).
- **Base Map header** (bytes just before the name "Base Map"):
  - min (705.263, -33.14, 1124.72), max (2375.26, 140.945, 2394.94);
  - 167x128 cells of 10x10.
- **World x,z.** min + (cell + 0.5) x 10 gives (1750.26, 1179.72), (1770.26, 1169.72) and (1770.26, 1239.72). This equals H2's values.
- **The capture's check.** A's first peek of the local SEAL body is (860.263, -29.081, 1899.719).
  - That is exactly the centre of cell (15,77): 705.263 + 155.0 and 1124.72 + 775.0.
  - H2's `cell_heights.txt` gives that slot's floor as -30.08. -30.08 + 1.0 = -29.08, which matches the +1.0 lift of research 91 §4.2.
  - This independently validates the cell-centre formula, H2's height formula on one more cell, and the lift.
  - B's first sample (1850.23, 40.92, 1240.01) is about 0.3 units from slot (114,11), and the body has already moved. It is consistent but not exact.
- **Hostage y.** 49.99 comes from H2's cell-word formula. I did not decode those cells' words myself, so y stays STRONG.
- **Verdict.** CONFIRMED.

### 10.5 Claim 4: Extraction zone

- **Raw record.** `loc 0x02600180` = (0,6,76), w 8, h 15, kind 1, name "Safety".
  - The 0x02600180 word is also the INREGION corner in the script (my decoder: `INREGION(Hostage, corner 0:(6,76), mode 1)`).
- **Kind name.** The zAnim PAINT parser's switch gives case 1 = 0x6603d8 "EXTRACT_ZONE" (D:L488569).
- **Containment.** `FUN_0052a200` (D:L395058-395098) walks the kind's zone list. It requires the same sub-map (`&0x3f`) and 0 <= x - corner.x < w and 0 <= z - corner.z < h, with x = bits 6-18 of the loc word (`<<0x2d>>0x33`) and z = the u16 at +2 >> 3 (bits 19-31).
- **World rectangle.** x 765.26..845.26, z 1884.72..2034.72.
- **Verdict.** CONFIRMED.

### 10.6 Claim 5: The cell door

- **Data.** `actions.rdr` decodes to `node cdoor1, valve cdoor1, anim singleDoor_right, type DOOR, range 30, bitmap action_door_open.tif`. The second action is `access_action1` with `points 2`.
- **Not re-derived.** The door's position (1732.56, 50.5, 1218.42) and the collision swap come from the scene. I did not re-derive them.
- **Verdict.** CONFIRMED for the record; the swap's semantics stay unresolved, as H2 says (U2).

### 10.7 Claims 6-8, 12-13: The objectives script (win, loss, time-out, holds, watch start)

- **My decoder.** `zanim_raw.py` reads MP6.ZDB directly.
  - The name table starts at `NA` (index 0). The set name `mission` is not in the table. I checked this: with that base, `game_over`'s first VALVE reads `end_of_round_round_count = valve(mp_round_count)`.
  - Commands: u32 header, low byte = id, size = h>>18. VALVE = 61 with `{ref, operand, op, flags}`. Conditions are sub-commands from +8 of IF (2), ELSEIF (3) and WHILE (39). WAIT = 15 with an f32 at +8. MESSAGE = 55 and SOUND = 30.
- **Every VALVE action matches H2's listing**, in order. That covers the reset of six valves; the score and winner sets; `rescuecount`/`killcount`/`freecount`/`mp_penalty` += 1 in the right one-shots; and `rescuecheck` = 1 in four branches.
- **Every condition matches H2's**, for example:
  - `ELSEIF rescuecount >= 2 AND player_team == 0 AND rescuecheck == 1`;
  - `ELSEIF mp_hostages_by_seals >= 2 AND player_team == 0`;
  - SEALcheck's four branches: `freecount == 3`, `freecount == 2 AND killcount == 1`, `freecount == 1 AND killcount == 2`, `killcount == 3`;
  - `IF ( INREGION(Hostage...) ) OR ( )`;
  - `IF INSTATE(Hostage, state 9)`;
  - `WHILE mp_timer != 0`.
- **The WAIT timeline** (`out_zanim_raw.txt` "timeline"):
  - start: 5; SEAL branch 2; then 10;
  - rescue branches: 2 before "SEALS VICTORIOUS!", then 2;
  - elimination and SEAL-kill branches: 2;
  - mission_timer: 15;
  - abort 1; success 20 + 1; failure 20 + 1.

  So the holds are 25 s and 23 s, and the watch starts at 17 s and 15 s.
- **Verdict.** CONFIRMED. Draws on time-out hold even with two hostages out, because `rescuecheck` needs all three resolved.

### 10.8 Claim 9: Killing a hostage: points and kill line

- **`FUN_0059ee20` escortee branch** (D:L458113-458141). Online, with a game object present:
  - a Terrorist killer (`FUN_002c30b0`) adds 1 to game +0x3c;
  - a SEAL killer (`FUN_002c31d0`) adds 1 to game +0x38;
  - then `FUN_00545390(killer stats)` runs.
- **Valve bindings** (`FUN_002a6c50` D:L149084-149091): +0x38 = `mp_hostages_by_seals` (0x3f0fa0) and +0x3c = `_turds` (0x3f0fc0).
- **`FUN_00545390`** (D:L411524-411547):
  - -2 to score +0x3c, only offline or on the killer's console. In ESCORT (type 3) a Terrorist gets +3 instead.
  - Then **unconditionally** `FUN_00544d60(killer,0)` and +1 to +0x18.
  - H2's text says the whole of this is "credited only on the killer's own console". That is right for the score only.
- **Kill line.** `FUN_00547860` (D:L412863-412909): a body with +200 & 0x20000 takes the `else` branch, which is `FUN_005e7f20(victim,0x44,0)`. No message is posted. CONFIRMED.
- **Precondition H2 omits.** The killer must resolve to a type-2 entity (D:L458078). Otherwise nothing is counted, for example on a world kill.
- **Verdict.** CONFIRMED-WITH-CORRECTION.

### 10.9 Claim 10: The minute

- **The cut.** `FUN_002a6960` (D:L148936-148949) runs only when `DAT_0045a0c0` (the host byte) is set:
  - if total seconds > 60: (total - 60) x 1000 ms;
  - else, if the total is nonzero: 1000 ms.
- **The trigger.** `FUN_002a9ee0` D:L150711-150716 and its twin D:L163051-163056 call it when the u16 value of `*(game+0x40)` exceeds `game+0xc0`.
- **game+0x40 by name.** `param_1[0x10] = FUN_00351ff0(0x3f1140 "mp_penalty",1)` (D:L149589). The binding is read from the code, not from Harry.
- **Verdict.** CONFIRMED.

### 10.10 Claim 11: Rescue credit

- **`FUN_00545480`** (D:L411560-411570). It acts only offline, or when the leader is a SEAL (`FUN_002c31d0`). Then:
  - +1 brought-out (+0x1c) and +3 score, local-gated;
  - `FUN_00544d60(leader,1)`.
- **Verdict.** CONFIRMED.

### 10.11 Claim 14: Elimination and hostages

- **Code.** H2's code path holds; the mask is now PROVEN (§2), so hostages fall in `aiteam_17/30/31`.
- **Capture support.** On A (the host, so `FUN_002b23a0` runs there), the last peek reads `aiteam_00` = 1 and `aiteam_08` = 1. The round is 1v1 on Desert Glory, where the host spawns the hostages (§H3-a).
- **Valve layout.** `{char* name; u16 value; u16 ?}`, the value read as the low half of word +4.
- **Verdict.** CONFIRMED.
