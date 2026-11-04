# 209 -- The mutable world: the map's typed metadata (MAP-01)

Written 2026-10-04 for web sprint 26 (plan `../plans/2026-10-04-three-maps-and-feel.md`, sprint 26 row MAP-01; the
map-parity plan `../plans/2026-10-04-multiplayer-map-parity.md`, MAP-01; ruling PF.R15). This note is the mutable
world's: MAP-01's sections are §1-§7. MAP-02, MAP-03 and MAP-06 add theirs after them.
Sources: research 92 §1 (the action object), 94 §C5.1, 171 §3-§4 (Crossroads), 174 (Breach maps), 176 §7.1, 200 §1.2
(the type names), reCOM `zAnim/zanim.h:417-435`, and the three fixtures (`test-fixtures/RUN/MP2.ZDB`, `MP6.ZDB`,
`MP72.ZDB`) read through the repository's readers. **Grade: reading** throughout (AGENTS.md): transcribed from the
decompilation, reCOM or the disc's bytes, nothing measured running.

## 1. What MAP-01 gives

One typed reading of a map, the same on the page and in the room (`viewer/src/mapMeta.ts` `readMapMeta`; the page's
`LoadedMap.meta`, the room's `SimMap.meta`, the loopback passing the page's on):

- every `actions.rdr` record on its placed node, typed, the loader's defaults applied (`MapAction`, §2);
- the game's action pick, `actionAtPick` (§3), beside the old origin-sphere `actionInReach`, kept for the HUD icon
  until XR-06;
- each zAnim node reference's init bits (`ZAnimNodeRef.init`, `@s2u/scene` `nodeRefInit`) and the set of placed
  paths they name (`MapMeta.initial`, §4);
- a stable instance id per placed node (`MapMeta.instances`, §5).

Nothing becomes mutable here. The renderer still hides alternate states by name (`loadMap.ts` `ALTERNATE_STATE`); a
diagnostic says where that rule and `initial` part (§6). MAP-02 switches the renderer and the collision to `initial`.

## 2. The action records

The keys are the loader's (`FUN_002b4f40` D:L157236-157431 loads the records; the key strings at 0x3f20f0-0x3f2130;
171 §3 corrects 92 §1, whose `FUN_002b4230` parses `EXECUTE_ACTION`). `actionRecordsOf` (`viewer/src/mapActions.ts`)
is the one parser: the page's actions, the room's and the doors' (`readDoors`) read through it.

| field | key | absent | source |
|---|---|---|---|
| `node` | `node` | -- | the scene node (`+0x14`) |
| `valve` | `valve` | '' | the `CValve` (`+0x18`); 99 locks (`FUN_002b46f0`) |
| `anims` | `anim`, every name | [] | `+0x08`/`+0x0c`; a door's swing then its kick |
| `type`, `typeCode` | `type` | '', 8 | `+0x24`; the names below |
| `range` | `range` | 32 (`ACTION_RANGE_DEFAULT`) | `+0x1c`; `FUN_002b49f0` L157032-157066 |
| `elevation` | `elevation` | -1 (no height test) | `+0x20`; 92 §1, 171 §3 |
| `team` | `team`, the raw first value | null (unrestricted) | `team 0` (SEAL) on Sujo's radios, 174; not the `+0x30` mask, which `FUN_00533c10` builds (`1 << index` per entry, bits 0 and 8 swappable, D:L157405-157418) and is not decoded; default `FUN_002b49f0` D:L157059 |
| `points` | `points` | 0 | 171 §3: 2 on Crossroads' switches |
| `bitmap` | `bitmap`, lower case | '' | the prompt's icon (87 §5) |

The type codes are the loader's name switch (D:L157334-157362; 200 §1.2): 0 DOOR, 1 WINDOW, 2 SWITCH, 3 DEFUSE,
4 MPBOMB, 5 ACT_BREACH, 6 SATCHEL, 7 ITEM; 8 for none ("UNKNOWN", L157331-157365; 94 §C5.1).

On the fixtures: Frostfire's three doors are DOOR, valve = node, `singleDoor_right`, range 30, elevation -1, points 0;
Crossroads' `seal_callstrike_1` / `terrorist_callstrike_1` are SWITCH, valves `seal_strike1` / `terrorist_strike1`,
anims `seal_demo_site1` / `terrorist_demo_site1`, range 30, points 2, the tents MPBOMB range 15 elevation 15 (171 §3's
table); Desert Glory's `access_action1` has no type (8), the default reach 32, `set_access1`, `destroy_access1`,
points 2. No record on the three carries `team`.

**One behaviour change.** A record with no `range` now reads 32 everywhere (it read 0 before: no reach). No record on
the three fixtures is affected but Desert Glory's type-less one, whose C4 reach already fell back to 32
(`c4Targets`). A door without `range` would now open from 32 units; none is known.

## 3. The pick (`actionAtPick`)

`FUN_005aa240` (D:L463830-463905; 174 §8.1 D:L463856-463901; 92 §1): the node under the reticle, or any of its
parents up to the root, names an action -- the nearest that does. `FUN_005aa470` tests six nodes inline and then
recurses on the sixth's parent (D:L463945), so the walk has no depth limit: "up to six levels" (92 §1, 179) misread an
unrolled recursion. The action is refused when its valve reads 99 or its type is 8 (a type-less action is never a
prompt; 176 §7.1: damage and code paths can still run it). Then the SEAL's place against the reticle's hit point, both
tests **strict**: accepted while the ground-plane distance squared is below `range` squared (D:L463895), refused when
`elevation` is not -1 and `elevation` squared is at most the height difference squared (D:L463898). The sprint 26
brief's "<=" was wrong; `doors.ts` `pickDoor` already had the strict form. 171 §3 shows why the origin sphere was
wrong: the Terrorist switch's collision sits about 25 units from its node origin.

An action's node is its first placement of that name in `flattenScene` order (`MapAction.path`), the one
`readMapActions` always placed it at. Because the walk goes to the root, how an instance node (`.../a`) and its
realised prototype (`.../a=a`) count as levels no longer matters (§7: `ACTION_PICK_LEVELS_READING` resolved).

## 4. The node references' init word

A `Node_Ref_List` record's first word (`ZAnimNodeRef.word`; the second, `flags`, is not these): reCOM's
`_zanim_node_ref` (zanim.h:417-435) lays out `parent_index : 8`, `name_index : 11`, `node_search : 3`, then
`is_light`, `created_here`, `stop_on_exit`, `on_world_lightlist`, `save_translation`, `save_rotation`, `save_active`,
`save_parent`, `is_local_light`, `set_inactive` -- declared as `bool`s, so the bit numbers are that order packed into
the word: bit 26 save translation, 27 save rotation, 28 save active, 29 save parent, 31 set inactive. The retail code
confirms them: `FUN_0026b5e0` (D:L115740-115750) clears the active state under bit 31 before saving it under bit 28;
under bit 26 it saves the 12 bytes at node+0x30, the translation (D:L115768-115775), under bit 27 the nine floats of
the 3x3, the rotation (D:L115779-115790), under bit 29 the parent pointer at node+100. `FUN_0026b430`
(D:L115690-115721) and `FUN_0026c4f0` restore; the round's reset `FUN_002ac0e0` (D:L151976-151991) calls them (171 §4,
173 §4, 174 §3). `MapMeta.initial` carries one `saveTransform` for both, `ZAnimNodeRef.init` keeps them apart.

On Crossroads (171 §4, held by `zanim.parity.test.ts`): `destroyed` 0x90080900 and `parts` 0x90080a00 deactivate and
save active; `healthy` 0x10080b00 saves only; `part_1..15` 0xbc08xx00 all five; the switch's own reference
0x10000100 saves active. On Frostfire `action_reset` names `bdoor_4`, `wdoor_1`, `wdoor_2` with 0x0800xx00 (Desert Glory's `cdoor1` the same): bit 27,
save rotation -- the doors' swing is restored by the zAnim reset (an input for PF.R10's `DOOR_ROUND_RESET_READING`).

**Where a reference points** (`NODE_REF_SCOPE_READING`, §7): `node_search` 0 looks the name up over the placed world,
1 beneath the animation's root reference (`Anim_Params.rootNodeIndex`), once for each placement of the root. On the
three fixtures every reference with an init bit is search 0 or 1 with parent index 0. Open: Frostfire's `door_slab`
root is placed three times and names its `pane1` with search 0, taken once (no diagnostic: the load stays clean) -- since SUP-02 beneath each placement, each slab saving its own pane (research 210 s6); Desert Glory's
`tincup_hit` repeats under one root (the first is taken). The diagnostics name the rest: Desert Glory's
`destroy_access1` names `part6`/`part7` that `access1` does not hold; `bug1..8` are templates no placement carries;
`action_reset` names `nohostage`/`okhostage`, not placed.

*PAR-92 (2026-10-14, research 319 §4.2), the campaign and the other maps re-run:* the twelve campaign `MZANIM.ZAR`s read
now (the reader refused all twelve on `otc_posechar`'s parent 0xf9 before; nothing of them was in `initial`). Off the
dev disc, `initial` holds 5 to 157 paths a campaign map (M51 5, M52 5, M53 134, M61 39, M62 157, M63 84, M71 9, M72 58,
M73 65, M81 72, M82 84, M83 125), the room, the page and the forge agreeing. Parent index 0 is not the rule everywhere:
references with an init bit and a parent are M53's and M73's `action_reset` double doors (`doubledoorNN` beneath
`drN`) and MP11's and MP62's gate parts (`gate_move1`/`2` beneath `access1`/`2`, each lever's `gatehand` beneath it).
The original looks such a reference up beneath its parent only (`ZANIM_PARENT_SCOPE_READING`, research 319 §1.2); the
port placed MP11's two and MP62's three `gatehand` all at `lever_1`'s, and now places each beneath its own lever. The
`otc_` animations' 636 parents 0xf9 name skeleton nodes beneath `player`, which no map places.

Only the map's `MZANIM.ZAR` is read. The common set (`CZANIM.ZAR`) is not: its references are not in `initial`.

## 5. Instance ids (a port rule)

A placed node's id is its index in `flattenScene(models, 'worldmodel')` -- the engine's render walk, the order
`loadMap.ts` ranks placements by. Ruling PF.R15: this is a **protocol id**, not a reading of the game (the original
addresses nodes by pointer); it is deterministic from the archive, the same on the page and the server, and a change to
the walk's order is a protocol bump. `instanceByPath` gives a path's first id: a path repeats where a parent holds two
children of one name (Frostfire: 956 nodes, 467 distinct paths), so the id, not the path, is the identity.
`MapInstance.root` is the outermost realised prototype a node lies in (`worldmodel/seal_demo_1/arch=arch`).

## 6. The name rule against the initial state

The diagnostic (`alternateDisagreement`, a line in the page's diagnostics) judges only the placements under a path a
map reference names (any init bit): the lamps' `nolight` and the `light_off` models are no `MZANIM` reference's, so
not zAnim's to judge here. On the fixtures, over the drawn placements:

- Frostfire: none (no line; its load stays diagnostic-free).
- Desert Glory: 54 hidden by name that the references leave active (the beer's `beer_parts`, under a path the
  references name, deactivated by none of them: the common set or the engine may), 13 shown that zAnim deactivates (the fuel barrels' `barrel_parts`,
  `access1/bad_parts`).
- Crossroads: 2 shown that zAnim deactivates: **both arches' `destroyed` subtree is drawn today** over the healthy
  arch (the name rule hides `parts`, not `destroyed`).

What the name rule hides outside the references (lamps, `light_off`) stays its own until MAP-02 decides it.

## 7. Readings and placeholders

| name | value | what it stands in for | what would settle it |
|---|---|---|---|
| `ACTION_PICK_LEVELS_READING` | was 6, an instance node and its realised prototype counted as two levels | how far up `FUN_005aa470`'s walk goes | resolved (MAP-01 review, 2026-10-04): no limit -- after its sixth node it recurses on that node's parent (D:L463945); the walk goes to the root, and the instance/prototype level question goes with it. Retired |
| `NODE_REF_SCOPE_READING` | search 0: beneath each placement of the animation's root first, else the world's first placement (SUP-02, research 210 s6; the world's first placement alone before it); 1: beneath each placement of the animation's root | the engine's node lookup for a zAnim reference (`node_search`, zanim.h:421) | the lookup's code (`CZAnim::Load` 0x26d370's resolver); an instanced root with a search-0 child (Frostfire's `door_slab`). *Read 2026-10-14 (research 319 §1.2, §1.5, PAR-92):* the resolver `FUN_0026f4e0` looks a parent-0 name up beneath the root first (D:L118191-118198), then over the world by search mode (`FUN_00269230` D:L114368-114413: search 0 the scene, search 1 nothing), as this row reads; a non-zero parent is `ZANIM_PARENT_SCOPE_READING` (research 319 §5). Open: the find-by-name's depth (research 319 U6) |

## 8. The world's state (MAP-02)

Written 2026-10-05 for web sprint 26, MAP-02 (plan `../plans/2026-10-04-three-maps-and-feel.md`, sprint 26 row MAP-02;
rulings PF.R10, PF.R12, PF.R15; the controller's lamp ruling of MAP-01's review). **Grade: reading** throughout.

`viewer/src/worldState.ts` `WorldState`: one per room (`match/src/room.ts` `Room.world`, built in the constructor beside
the doors) and one per page (`main.ts`, on the walk's hull and grid), never shared. It holds:

- **Each node's own active flag, by path.** A node is active when it and every ancestor are (`isActive`, the subtree
  test `under`): the engine's walks skip an inactive node and what hangs under it (`grid_main.cpp:303`; the probe's
  gate and its recursion into `+0x70`, research 23 §1.1). Crossroads' rubble is 8 polygons at `/destroyed` and 162 at
  `/destroyed/dia` (171 §3): `destroyed` turned on reaches `dia`; a descendant turned off on its own stays off when its
  parent comes back, as the engine's per-node flags do. A path repeats where a parent holds two children of one name
  (§5): such paths switch together (a port rule; none of them is a reference's on the three fixtures).
- **The collision.** Each owner's `CollisionOwner.flags` bit 0 (`m_active`) is set to its node's activity, the word's
  other bits as the hull has them -- the bit `modelGate` reads (`FUN_002d3030`, research 23 §1.1; `probe.ts`), so
  rays, probes and segments follow at once. Every node with polygons is active on the disc (counted 2026-09-28), so an
  active owner's bit is set, not copied: a hull copied from a turned one opens right.
- **The revision.** `Grid.revision` (`@s2u/scene`) moves at every change. The readers that cache the grid compare it:
  the mover's per-cell walls and its 3 x 3 neighbourhood (`mover.ts` `wallsNear`/`wallsOf`, which now also gate every
  atom through `modelGate`, the swinging leaves' "moving" set included). (Was: "and the climb's per-cell polygons
  (`climb.ts` `climbablesAround`)" -- removed 2026-10-16 by PB-3b: the climb's contact is the walk's own wall hit,
  research 281 §4.1.) The ladders are read once (`traversal.ts`): no ladder is switched this sprint.
- **The action valves and uses** (`valve`/`setValve`, `actionUsed`/`markUsed`): MAP-06's and XR-04's; the doors keep
  their own valves (`DoorSet`), on the same hull.
- **The drawing**, through its hooks: `visible(path, on)` for a subtree, which the page hands to
  `WorldView.setNodeActive` (§9).

**Initial state.** `applyInitial` makes every `MapMeta.initial` path with bit 31 inactive, then `save` keeps the own
flag of every path with bit 28 (`FUN_0026b5e0` D:L115740-115750). The room applies it in its constructor, before anyone
spawns. On Crossroads both arches open with `destroyed` and `parts` off and `healthy` on (171 §4); the raw node flags
alone would have the rubble in both streets (the parity test, without `applyInitial`, finds 4 hits on the intact street).

**The round's reset** (`Room.startRound`, after `clearAir`, before the spawn loop): `world.reset()` then
`doors.reset()`. `reset` puts each saved path back to its saved flag (`FUN_0026b430` D:L115690-115721, from
`FUN_002ac0e0` D:L151976-151991; `WORLD_RESET_SAVED_READING`), zeroes the valves and clears the uses (`FUN_002b5510`
D:L157445-157456), and moves the revision even when nothing changed (the round's epoch, for MAP-03). `DoorSet.reset`
(ruling PF.R10, `DOOR_ROUND_RESET_READING`): every valve 0, every running swing cut off, each leaf back at its disc
rotation, at rest, silently. The swing is relative to the rotation it starts from (research 92 §2), so the rotation must
come back with the valve. It is sourced where a reference saves the door's rotation: Frostfire's `action_reset` names
`bdoor_4`, `wdoor_1` and `wdoor_2` with bit 27, Desert Glory's the same for `cdoor1` (§4) -- the restore of a saved
rotation is the zAnim reset's. Nothing shuts a door by itself *within* a round (`doors.parity.test.ts`, narrowed).

**Per room.** `match/src/server.ts` `forkSimMap` forks every map now, doors or none: its own owners, points and
packed fields (`forkGround`) and the grid over them; the metadata, the slots and the doors' specs stay shared and read
only. The page's offline match (`net/loopback.ts` `simMapOfLoaded`) forks the page's hull the same way; the room builds
its own world from the shared `meta`, and the page's world follows the room's at every change
(`LoopbackOptions.world`: `apply(room.world.states())`) -- the loopback's stand-in for MAP-03's wire. `states()` lists
the placed nodes whose own flag differs from its flag after `applyInitial`, by instance id (§5, PF.R15); `apply` takes
such a list as the whole difference (every node not listed back at its opening flag).

**For MAP-03** (the wire's contract, as built; review 2026-10-05):

- `states()` is keyed by **path**: a node's own flag is kept per path, so a path that repeats (§5) has one state and
  is listed once, under its first instance id (`MapMeta.instanceByPath`). `apply()` with *any* id of such a path
  switches every node sharing the path.
- `apply()` treats its list as the **complete** set of differences from the opening state: every path not listed goes
  back to its flag after `applyInitial`. So the wire sends the full `states()` in every snapshot that carries the world
  and in the late join's welcome -- never a delta; a delta applied would undo every difference it does not repeat.
- A changed path with **no instance id** (a path no placement carries: a hand-built hull, a node only the collision
  names) is dropped by `states()` (`worldState.ts`, the `instanceByPath` lookup) and never reaches the wire. On the
  page, `apply()` cannot name such a path either, and because it rebuilds from the opening state, a page-side change to
  one (none is made today: the page's world only follows) is put back to its opening flag at the next `apply()`.

**The present world** (ruling PF.R12, `SHOT_GEOMETRY_LIVE_READING`): a round the room rewinds resolves against
the world at the room's present revision; the room rewinds the actors only and keeps no history of the geometry.
The original walks that world on the resolving frame (`FUN_003c9b70`, research 91 §23).

## 9. Drawing it: the initial state and the switches

`loadMap.ts`'s `alternate` (hidden as the map opens) is now zAnim's: a placement under a path a reference makes
inactive (bit 31) is hidden. The name rule (`ALTERNATE_STATE`) is kept for what the map's references do not name -- a
segment the rule matches hides the placement unless the path up to that segment is itself a reference's (the
controller's ruling: the lamps' `nolight` and `light_off` are no reference's). Against the name rule alone, over the
placements (counted on the three fixtures, 2026-10-05, after the fix round below): Frostfire draws the same 448;
Crossroads hides the two arches' `destroyed` (drawn over the healthy arch until now, §6); Desert Glory shows nothing
the rule hid and hides 78 more -- `access1/bad_parts`, the barrels' `barrel_parts`, the crates' `parts_bad` and the two
parked F-18s (`f18s/f18_N/f18_lowpoly=f18_lowpoly/f18_low`). The disagreement line (§6) is still written: it is the
diagnostic of where the rule and the references' words part.

**The animations that start with the map** (MAP-02 fix round, 2026-10-05; `AUTOSTART_INITIAL_READING` in `mapMeta.ts`).
The first build drew Desert Glory's 54 `beer_parts` placements at the opening: each `beerN` reference names
`beer_parts` with word 0x10080300 (bits 24-31 = 0001 0000: bit 28 save active only, no bit 31, `node_search` 1 under
the `beerN` root), so the references alone leave it on. The check ruling PF.R25 asked for first found the answer in the
map's own `MZANIM.ZAR`: each of the nine `beerN` roots carries two animations named `beerN`. The first has
`Anim_Params` flags 0x21 and one sequence (activation 1) whose only command is `OBJECT_ACTIVE_STATE beer_parts off`;
the second (flags 0x23, health 24) is the shot bottle's `call_parts` (`.GLS_BRK_VSMALL`, `beer_vis` and `beer_di` off,
`beer_parts` on, six `beer_part_flyN`). Flags `& 3` = 1 is the start-with-the-set bit research 115 R115.6 reads
(`FUN_0026c600` D:L116312-116387, `MENU_FADE_UP_AUTOSTART_READING`); 2 is started by an action (Crossroads'
`*_demo_site1`, Frostfire's `action_reset`, the door swings: 0x22, 0xa2) and 3 by damage (the health-keyed `door_slab`
0x823, `access1` 0x2b). So `readMapMeta` now also takes, from every animation whose flags read 1, the
`OBJECT_ACTIVE_STATE` commands that open its activation-1 sequences, in order, onto the opening state -- off adds a
deactivation, on cancels one a reference made. `DEBRIS_INITIAL_READING` (PF.R25's fallback) is therefore not needed and
not in the code. The same rule hides the crates' `parts_bad` (`setup_crateNN`, flags 0x21: `parts_good` on,
`parts_bad` off) and the F-18 pair (`mp6_parent`, 0x21: `f18_1`, `f18_2` off; the flyovers' `mp6_f18s_*`, 0x22, show
each jet only while it flies). Frostfire's and Crossroads' autostarting animations (objectives, lens effects, the sky,
the fans, the camera jiggle) open with no active-state command: nothing changes there. Held by `loadMap.test.ts`
("Desert Glory opens as zAnim has it: ..."), fixture MP6.

`WorldView.setNodeActive(path, on)` (`world.ts`) reaches every drawn placement at or under the path:

- a prop placement drawn as its own mesh (one placement, a LOD copy, a facade card): the mesh hidden;
- one member of an instanced draw (`InstancedMesh`, one draw per model-node): its instance matrix zeroed while hidden,
  the others drawn; a group mixing hidden and shown placements as the map opens is split in two (`loadMap.ts`'s group
  key carries the initial state), so each group opens right and switches member by member;
- a world chunk (the world model's own tree -- Desert Glory's `access1`, the switches) under a reference-named path:
  `loadMap.ts` merges such chunks only with their own path's (`LoadedMesh.switchPath`, the deepest named path over the
  chunk), so they can be switched. A switch on a path no reference names, over a merged chunk that holds more than it,
  does not reach that chunk (none is asked for this sprint).

`moveNode` (a door's swing) still moves a hidden placement, which shows where it was moved to. `setAlternate(true)`
is the debug view: everything drawn whatever the state; off, the state is drawn again. Line strips are not switched.
An instanced draw's matrices are put again and uploaded only when one of its members' hidden state, or the debug view,
has changed since the last put (a dirty flag a draw): the visibility refresh at every LOD band crossing uploads nothing.

**For MAP-06** (review 2026-10-05): `setNodeActive(path, true)` shows **everything** drawn under the path, including a
placement the name rule hid at the opening under a segment no reference names (a lamp's `nolight` below a node a
destroy program turns on). The world state re-hides only the paths *it* holds off (`WorldState` emits a
`visible(r, false)` for each of its own off paths under the one turned on); the name rule's hides are not in it. A
destroy program that turns on a subtree holding such a segment must turn that segment off itself (or the world must
learn the name rule's paths as off at `applyInitial`); none is known on the three fixtures.

## 10. Readings and placeholders (MAP-02)

| name | value | what it stands in for | what would settle it |
|---|---|---|---|
| `SHOT_GEOMETRY_LIVE_READING` | `'present'`: `roundPath` meets the grid as it stands when the room resolves the round (actors rewound only, `MAX_REWIND_MS`) | the walk: the resolving console meets its own live world (`FUN_003c9b70` D:L319922-320065, `FUN_003c8920` D:L319383, research 91 §23) -- reading, re-read at the decompilation by #441's takeover (2026-10-24), pending review. Where it is resolved is PF.R12's ruled departure: the original's resolving console is the shooter's, its copy lagging the host (`FUN_005abbc0` D:L464698); the room resolves geometry at its present | H100 (the owner's): a geometry history per revision, if a barrier opening inside the rewind window is ever seen to matter |
| `SHOT_GEOMETRY_REWIND_PLACEHOLDER` (retired 2026-10-22) | was the name of `SHOT_GEOMETRY_LIVE_READING` | the stand-in treated the live query as an open port decision | retired |
| `WORLD_RESET_SAVED_READING` | true: the round's reset restores only the nodes a reference saved (bit 28) | which nodes `FUN_002ac0e0` (D:L151976-151991) restores: `FUN_0026b430` (D:L115690-115721) restores per saved reference | read the rest of `FUN_002ac0e0`'s calls for another node restore; a capture of a round's start after a node no reference saves was switched |
| `AUTOSTART_INITIAL_READING` | `params.flags & 3 == 1`: the animation starts with its set at load; the `OBJECT_ACTIVE_STATE` commands opening its activation-1 sequences are part of the opening state, and the reset gives that state back | which animations run at the map's load and when their first commands take effect: `FUN_0026c600` (D:L116312-116387) starts the set's animations whose runtime bit is set, research 115 R115.6 reads the bit as `params.flags & 3` (`MENU_FADE_UP_AUTOSTART_READING`, *note only*); Desert Glory's `beerN`, `setup_crateNN`, `mp6_parent` (§9) | trace `FUN_0026c600`'s bit to `params.flags` (PLAT-07, research 106); and the reset: the port saves after the autostart (a `beer_parts` saved off), while `FUN_0026b5e0` saves at the reference's init, before the set starts (saved on) -- the two agree only if `FUN_002ac0e0` re-runs the autostarting animations; read that, or one look at a Desert Glory bottle in round 2 |
| `DOOR_ROUND_RESET_READING` | true: every door shut and at rest at the round's start, at once and silently (ruling PF.R10) | the doors' state across rounds: `FUN_002b5510` (D:L157445-157456) zeroes the valves; the rotation is restored where a reference saves it (Frostfire's `action_reset`, bit 27, §4) | that every map's doors are so named (the nine maps with doors, research 92 §2), and the order of the valve and rotation restores; a capture of an open door across a round's end |

**The order of the init bits** (review 2026-10-05). The port ORs every reference's bits per path (`readMapMeta`
`keep`), then `applyInitial` deactivates every bit-31 path and only then saves every bit-28 path. The original applies
each reference in turn, deactivate then save (`FUN_0026b5e0` D:L115740-115750), so the two differ when one node has an
earlier save-only reference and a later bit-31 one: the original saves it active (and the reset turns it back on), the
port saves it inactive. Over the three fixtures' `MZANIM.ZAR` references with an init bit, in archive order and
resolved as `readMapMeta` resolves them (2026-10-05): Frostfire 6 paths, 1 named by two references; Desert Glory 298
and 1; Crossroads 76 and none -- **no path has a save-only reference before a bit-31 one**, so the order is not changed.
The one place the port's order shows is the autostart above (`AUTOSTART_INITIAL_READING`'s row): an animation that
starts with the set runs after every reference's init.

## 11. The wire (MAP-03)

Written 2026-10-05 for web sprint 26, MAP-03 (plan `../plans/2026-10-04-three-maps-and-feel.md`, sprint 26 row MAP-03;
rulings PF.R12, PF.R15; the additions agreed with the online lane for ONL-18). **Grade: reading** for what it cites of
the original; the wire itself is the web's design (research 175 §7 "proposed"; 171 §9 Protocol/Lifecycle; 198 WP2:
"apply geometry before movement correction/replay; include ongoing phase; deltas/events are an optimization"). The
original reconstructs *valves* for a joiner -- `FUN_002b4440` D:L156767 replays every non-zero valve (research 92 §1) --
and the bridges and barriers write no valve (171 §4), so the web sends the instances' states.

**Protocol 10** (`viewer/src/net/protocol.ts` `PROTOCOL_VERSION`; its history line). The exact fields:

- `EnvWire { revision: number; epoch: number; states: { id: number; active: boolean }[] }` -- `revision` the room's
  `Grid.revision` (`WorldState.revision`: one more at every change and every round's reset; §8); `epoch` the round
  serial (`Room.roundSerial`: one more at every `startRound`, never reset; 0 before the first); `states` the full
  `WorldState.states()` -- every placed instance whose own flag differs from its flag after `applyInitial`, by instance
  id (PF.R15; a repeated path once, under its first id) -- never a delta, since `apply` takes its list as the whole
  difference (§8). Built by `WorldState.wireAll(epoch)`, laid by `WorldState.applyWire(env, silent)`.
- `Snapshot.env?: EnvWire` -- always on the wire, so `decodeSnapshot` always gives it.
- The welcome: `env: EnvWire`, `epoch: number`, `startTick?: number` (the room tick, `welcome.tick`'s clock, at which the
  current round began; **absent**, never 0, while no round has begun -- a classic room waiting for its sides, or after an
  abandon -- since tick 0 is a real tick: a respawn room's first round begins at its construction and says `startTick`
  0), `gameType?: GameType` (PF-12's `SimMap.gameType`; absent when the server did not read the map's type).
- `roundStart`: `epoch: number`, `startTick: number` (the tick `startRound` ran on).
- The client's `{ type: 'loaded' }` (the page's loading screen released): in the client union, ignored by the room
  whatever its shape and whenever it comes (`roomHostile`, `roomFuzz`); the round-1 hold is ONL-18b's.

**The binary layout** (`viewer/src/net/codec.ts`), appended after the doors (`u8` count, two bytes a door), little-endian:

| bytes | field | bound (server policy) |
|---|---|---|
| 4 | `u32` revision | wraps at 2^32 |
| 2 | `u16` epoch | the round serial mod 2^16; compared by `epochNewer` (serial arithmetic) |
| 2 | `u16` count | at most 65 535 instances |
| 3 a row | `u16` instance id, `u8` state (1 active, 0 not; read as non-zero) | ids under 65 536 |

Always present, count 0 on a static map: a protocol-9 frame (the doors last) is too short for a 10 reader, a 10 frame has
8 trailing bytes for a 9 one (`decodeSnapshot`'s trailing-bytes rule), and the hello names the mismatch ("protocol 9,
this server speaks 10"). The budget (re-measured, `netCodec.test.ts`): 15 bodies and one's own, no instance changed, 884
bytes on a map without doors and 890 on Frostfire (three doors), 26.7 KB/s at 30 Hz.

**The room** (`match/src/room.ts`): `hello()` sends `env: world.wireAll(roundSerial)`, `epoch`, `startTick` and
`gameType`; `snapshots()` puts the same `env` in every recipient's snapshot; `startRound()` keeps the tick it ran on
(`roundStartTick`) and broadcasts `epoch` and `startTick` with the round start; the client-message dispatch takes
`loaded` as nothing.

**The page** (`viewer/src/net/client.ts`, `viewer/src/netPage.ts`): `NetOptions.world` / `NetPageDeps.world` lend the
page's `WorldState` (the walk's hull, `main.ts` `pageWorld`; online only -- the offline match follows its room directly,
`net/loopback.ts`). In the snapshot handler the environment goes on the world (`applySnapshotWorld`) **before** the
snapshot's own state corrects the prediction (`reconcile`), so the correction and every later tick run against the
room's geometry; the room resolves against its present world (PF.R12, `SHOT_GEOMETRY_LIVE_READING`), and page and
room agree within one snapshot. The welcome's environment and the first snapshot's after it are applied silently
(`skip_effects`; `JOIN_SILENT_READING`), every later change with its effects. The round epoch: the welcome's, then each
`roundStart`'s -- and a snapshot's environment of an older epoch (overtaken by the round start: only the latency
injector reorders frames) is not applied. The round boundary is crossed in one place, `NetClient.newEpoch(epoch)`: an
epoch later than the page's becomes the page's and the page's world is reset (`WorldState.reset`, as the room's
`startRound` resets its own; no effect played). Both paths call it: the `roundStart` handler (`netPage.ts`), and the
snapshot handler when a snapshot's epoch is later than the page's (its round start not yet heard, the jitter's order)
-- there the reset runs BEFORE that snapshot's environment is laid on the world, so the last round's state never
carries into the new one and the restore is never applied as a change with its effects (review fix round,
2026-10-05; `envPage.test.ts`). The round start that arrives after such a snapshot finds its epoch not later and
does nothing more. `NetClient.env()` gives the newest snapshot's environment.

**Protocol 11 deltas** (NET-WIRE, 2026-10-07; the owner's OT.R38 / H118; [research 224](224-protocol-11.md)). The fields
of `EnvWire` and the section's layout are unchanged; what changed is when it rides:

| what | protocol 10 | protocol 11 |
|---|---|---|
| `Snapshot.env` | in every snapshot, always present | only in a snapshot whose `revision` or `epoch` differs from the last the connection was sent (`Room.envSent`; the welcome counts as sent) -- once after each change, once after each round's start |
| how a frame says so | its length (always 8 bytes and 3 an instance) | the sections byte's bit 1 (bit 0 the own state); an unknown bit refuses the frame |
| a frame's version | the trailing-bytes rule | the frame-type byte (the snapshot 0) and the hello's version ("protocol 10, this server speaks 11") |
| the welcome | `env` whole | `env` whole, unchanged |
| the page | laid every snapshot's | lays a named one; one without keeps the last (`NetClient.env()` the last taken); `epochNewer` still refuses an older round's, and within the epoch a revision not newer than the held one is dropped (the injector's jitter reorders) |
| the recorder's `snap` record | always | always (a replay seeks to any snapshot) |
| the budget (15 bodies, Frostfire's doors) | 890 bytes | 836 (844 in a snapshot that names an unchanged-count environment) |

## 12. Readings and placeholders (MAP-03)

| name | value | what it stands in for | what would settle it |
|---|---|---|---|
| `JOIN_SILENT_READING` | true: a joiner's world (the welcome's environment and its first snapshot's) is taken without its effects; later changes play theirs | what a late joiner sees and hears of the world's past: the original replays every non-zero valve to a joiner (`FUN_002b4440` D:L156767, research 92 §1), and whether that replay runs its sequences' sounds and effects or only their end state is not traced | read `FUN_002b4440`'s valve replay down to the sequence start (whether `skip_effects` or its like is set); a capture of a joiner entering after a Crossroads arch fell |

## 13. The scene's health (MAP-06)

Written 2026-10-05 for web sprint 26, MAP-06 (plan `../plans/2026-10-04-three-maps-and-feel.md`, sprint 26 row MAP-06;
rulings PF.R11, PF.R12, PF.R14). Sources: research 174 §3 (the block, the accept, the hit, the chain, the reset), 173
§4, 203 §7 (the per-map blocks), the three fixtures' `MZANIM.ZAR` read through `tools/dump-effects.ts`. **Grade:
reading** throughout; research 174's and 203's "PROVEN operands" are readings here (AGENTS.md, research 206).

**The block.** `@s2u/scene` `zanim.ts` decodes `Anim_Health` (24 bytes, a different length refused) to `AnimHealth`:
+0 u8 the target node reference (+1..+3 padding), +4 f32 health, +8 its reset, +0xc armour, +0x10 its reset, +0x14 the
shield (`FUN_002740e0` D:L121135-121218; `FUN_00273960` D:L120884-120888). `isDestructibleAnim` is `FUN_002713f0`'s
test (D:L119312-119335): state 1 or 5, `flags & 7 == 3`, a block. On the fixtures: Frostfire `door_slab` only (health 1,
shield 0, target `pane1`); Crossroads the two bases (2 / 21 on `basedi`); Desert Glory 50 placed (1/0 x32 -- tincups,
plates, lamps --, 80/0 the truck stop's gas, 1/9 x4, 1/9.9 x10, 150/150 the two fuel barrels, and one 1/17, `access1`;
its `access2-6` and `plankaccess1-3` blocks have no placement). Desert Glory's first `beerN` of each pair carries a block
too and is kind 1: not built.

**The binding** (`viewer/src/sceneHealth.ts` `destructiblesOf`, through `MapMeta.scene`): one destructible per kind-3
animation and per placement of its root reference, its references placed beneath that placement
(`SCENE_INSTANCE_SCOPE_READING`, §14): Frostfire's `door_slab` is placed three times, inside the doors' prototype
(`worldmodel/bdoor_4/door1=door1/door_slab`, instance 876; `wdoor_1` 910; `wdoor_2` 915), and each breaks its own `pane1`
(two polygons each). Without a target the block hangs on the root, as `FUN_002740e0` falls back; on Desert Glory 27 blocks
name their root as their target. Duplicate names are kept apart by the key `${anim}#${ordinal}@${path}`.

**The pre-dispatch reads** (owed by the brief; `npx tsx tools/dump-effects.ts MP2 door_slab breakapane --mission`,
`MP72 'destroy_*' --mission`, `MP6 access1 destroy_access1 --mission`):

- `EXECUTE_ACTION` is **set 0, command 87**, 8 bytes (`57 00 20 00 03 00 00 00` on Desert Glory's `access1`; the name
  index at +4, `set_access1`) -- the base set's numbering going on past `VALVE` (61), not a registered set as the brief
  expected. It is on none of Frostfire's or Crossroads' animations: Desert Glory's `MZANIM` holds nine (its `access1-6`
  and `plankaccess1-3`); Vigilance's `access1-6` (research 176 §7) are of the same form [not read here: MP51 is no
  fixture].
- Frostfire's chain is `door_slab -> CALL_ANIMATION breakapane` (no action): `breakapane`'s root is `pane1` (search 0) and
  its commands are `SOUND .GLS_BRK_VSMALL`, `DESTRUCTION_SOURCE` (node byte +4 = 0xf9, `NODE_ROOT`) and
  `OBJECT_ACTIVE_STATE NODE_ROOT off`. Crossroads' bases run their own sequences (`FIRE_WEAPON` `MPBOMB`, `basedi` and
  `healthy` off, `whats_left` and `parts` on, the debris and sounds): named references, search 1 under the root.
  Desert Glory's `destroy_access1` guards itself with its context valve (`IF valve(context) == 0`: `CALL_SEQUENCE
  access_destroy`, the context valve set to 1) and `access_destroy` turns `good_parts` and `di_good` off and `whats_left`
  on, then, under `IF skip_effects == 0` (a named valve, flags 2), `bad_parts`, the flying parts and `.WOOD_DEBRIS`. No
  destroy program read uses `NODE_CALLER` (-6); `NODE_ROOT` (-7) only `breakapane`.
- `roundPath` (`viewer/src/round.ts`): `segmentHits` returns the world's polygons nearest first; with the room's bodies
  (`extra`) the two lists are merged and sorted by distance, and `penetrate` walks them in that order. So a scene
  surface before the body comes first in `struck`, and the room (`fire`) walks `struck` in order: each world surface
  (carrying its owner's path, `RoundSurface.owner`) is handed the hit, and none ends the round -- the walk's own material
  cut does (P11, below; `agent/p11-room`, 2026-11-02). *Was* (MAP-06 to P11): the first whose destructible the round
  qualified against ended the round there, before any body -- the room's own departure.

**The rules** (`SceneHealth`):

- C4 (`accepts`, `c4TargetAt`; `FUN_002739b0`, 0x2739b0-0x2739ec): health above 0 and the shield at most the charge's
  damage -- the charge's `Explosion_Damage` (`C4_ACCEPT_DAMAGE_READING`, ruling PF.R14): C4 18 takes Desert Glory's and
  Vigilance's shield-17 barriers and refuses Crossroads' shield-21 bases; the bomb's 50 takes them. `equipment.ts`
  `c4Eligible` is the thin wrapper SUP-03 puts in place of `c4Targets`' type-less actions (unchanged here).
- A hit (`hitAt`; `FUN_003c7490` D:L318596-318640): applied when the rating plus the modifier reaches the shield; the
  damage is AD-5's (below: the falloff at the target's midpoint, the shield again, x14, the armour step, the health
  floored at 0); died when the health is then at or below 0, whatever it was before (`FUN_00273a50` D:L120978-121059: a
  health-0 block is a hit trigger, never a C4 target). The death runs the animation's own sequences once (a spent record
  changes nothing); `SCENE_DEATH_AUTHORITY_READING`: the 0.01-HP authority guard is never applied by the room. *Was*
  (MAP-06 to AD-4): the damage took the armour, then the health, at the full rating with no falloff, the health
  unfloored (`SCENE_BLAST_REACH_PLACEHOLDER` `'full-rating'`).
- A blast (`blastAt`, ruling PF.R11): reaches a destructible when the nearest point of its target's polygons' box (where
  they stand now: a pane in a swinging door is read where it is) lies inside the radius and the line from the blast to
  the box's midpoint passes the caller's `clear` (AD-5); it takes AD-5's damage at that midpoint. *Was:* the line to the
  nearest point, meeting nothing but the target; the full rating.
- The reset (`reset`, from `WorldState.reset`): every record to its reset health and armour, unspent, with the geometry
  (`FUN_00273960`, `FUN_00273ee0` from `FUN_002ac0e0`).

**The host** (`WorldState`, the `DoorSet` host its model): `runProgram` starts a program with its context
(`SceneRunContext`: the root and references placed, the caller, the context valve, `silent`); `OBJECT_ACTIVE_STATE` is
`setActive`; `VALVE` sets the world's valves (the context's with flag bit 0); `EXECUTE_ACTION` is `executeAction`: the
action whose valve the name is (`FUN_002b4e80`, `MapMeta.actions`), its first animation run with its node and valve as
the context (`FUN_002b44e0`), refused while that action's animation runs; `CALL_ANIMATION` runs the named program at the
caller's root; `SOUND` (a new play), `PARTICLE_SOURCE` and `DESTRUCTION_SOURCE` go to the hooks (`WorldHooks.sound`,
`particles`, `destruction`), which the page implements and the room does not. `skip_effects` reads 1 in a run started
`silent` (`SKIP_EFFECTS_VALVE`): MAP-03's join replay passes it. `step` runs the programs; `reset` stops them.

**In the room** (`match/src/room.ts`; nothing in its hello, snapshots, clock or round start): `fire` walks every struck
world surface, in the walk's order, through `world.health.hitAt(owner, { impact rating, the weapon's modifier })`, and
the round goes on by the walk's material cut alone (P11, below: the bodies past a destructible that took the hit are
struck; the shot's end, normal and material are the walk's; PF-26's count is unchanged; *was* the first that applied
stopped the round there); `blast`, after the players, calls `world.health.blastAt` with the record's `Explosion_Damage` plus its
modifier and radius, the line test the players' own (`segmentHits` from `sightFrom`, every hit the target's), and the
backblast's and the claymore's cones (outside them, no reach); `placeCharge`'s C4 branch, where the heuristic's target
action is one a destructible executes, refuses a charge that destructible would not take (`c4TargetAt`; PF-13 brings the
request's own node).

**Does a destructible that takes the hit end the round? No** (2026-11-02, the online-parity sweep's row P11, finding
SW-4; **grade: reading, pending review** -- transcribed from the decompilation, nothing measured running). In the
original a bullet that strikes a scene destructible goes on exactly as it would past any other surface of that
material; whether the destructible took the hit, died or refused it plays no part:

- *The walk* (`FUN_003c9b70`, `HandleIntersections`, D:L319918-320065): for the next surface of the round's hit list,
  nearest first, a material whose `PENETRATION` (material record `+0x24`) is exactly 1.0 is passed over with no call
  (D:L320025-320030); a launcher class or a flagged explosive round goes to `FUN_003c8f50` (D:L320031-320043); every
  other surface goes to `FUN_003c8920` (D:L320039). Its answer alone decides: 0 or 4 stops the walk, 1 stops it, 2 walks
  on to the next surface (D:L320044-320055).
- *The surface* (`FUN_003c8920`, D:L319339-319525): a surface past the remaining range (`projectile+0x94`, squared)
  answers 4 before anything runs (D:L319410-319411); otherwise the struck node's damage interface (node `+0x94`, its
  vtable slot +8) is called and **its return is discarded** (D:L319417-319418), then the mark (D:L319420-319421). What
  follows reads no result of that call: the dud test on the fired record's ArmingDistance (`FUN_003d2030`,
  D:L319439-319470; research 94 C1.5: only the launcher rounds carry one, 10 m, so a bullet's is 0 and the branch never
  runs), the impact detonation on the ammunition's radius under the round's flag bits (`FUN_003d4500`,
  D:L319477-319485), the launcher-class stop (`FUN_003c5d20`,
  classes 0xab and 0xb9, D:L319491-319493 and D:L319519-319522), and for every bullet the range cut
  `min(range, (range + range x Piercing x 0.1) x PENETRATION)` with the answer 2 while the surface lies within it, else
  4 (D:L319473-319476, D:L319506-319518). The PERSON same-body guard (`+0x78`, D:L319391-319404) skips neither the call
  nor the cut.
- *The callback* for a scene destructible: `FUN_002740e0` installs the interface with the vtable `PTR_PTR_00406090`
  (D:L121200), bound to the target node's `+0x94` by `FUN_003158b0` (D:L121213; the store at D:L215134). That vtable's
  slot +8 holds 0x00273a50 and its slot +0x10 0x002739b0 (the C4 accept) -- read from the words at 0x406098 and 0x4060a0 of
  the disc's `socom2_game.elf` by an ad-hoc read for this row, not one of the repository's readers, and matching
  research 174 s3 and 175 s6, which name `FUN_00273a50` the shared hit callback. `FUN_00273a50` (D:L120931-121066) runs
  `FUN_003c7490` (D:L120978; its shield test D:L318622, the damage D:L318623-318638) and the death's animation, and
  answers 0 on every path (D:L121065) -- a constant, discarded in any case. The fresh review of P11 (2026-11-02) re-read
  that word (0x406098, file offset 0x2f5698 by the third `PT_LOAD`, VMA 0x1e7000 at offset 0xd6600) and the other
  `+0x94` vtables' slot +8: 0x406390 (installed in `FUN_002b49f0` D:L157044 and `FUN_002b55e0` D:L157485) and 0x406a20
  (`FUN_0032ad20`, D:L227603) hold 0x2742f0, a `return -1` stub with no side effects; 0x4083f0 (installed in `FUN_003d4bc0`, D:L326990) is the
  projectile's own, `FUN_003d4b80` (D:L326964-326970), which detonates the struck charge through `FUN_003c69c0`
  (D:L318215-318216) and answers 0 -- none ends the round.

So the continuation is decided by the struck polygon's material `PENETRATION` against the round's remaining range (and,
for a launched round, rocket or explosive, by the weapon's class, its ArmingDistance and the ammunition's radius),
never by the node's
handler. **The room departed from this** until P11's room task (`agent/p11-room`, 2026-11-02; below): `fire`
(`room.ts:5060-5078` at `e181bf6c3`; `:5079-5097` on `agent/land-b195`) cut `path` at the first struck world surface
whose destructible applied (`hitAt(...).applied`), so the bodies past it were not struck and the shot's end was that
surface. Its comment's attribution to ruling PF.R12 was wrong: PF.R12 (plan
`../plans/2026-10-04-three-maps-and-feel.md`, its Rulings; HUMAN_TASKS H100) rules only *which* geometry a round meets
-- the present revision, actors rewound -- and says nothing of a destructible ending the round; MAP-06's row (174 s3,
173 s4) does not either. The stop has no source in the original. Where it shows: Frostfire's door panes are GLASS
(the `bdoor_4` pane's two polygons on the room test's witness segment read material byte 9, GLASS, `PENETRATION` 0.99,
from the fixture `RUN/MP2.ZDB` for this row), so a body behind a pane that a round breaks is struck in the original and
was unstruck in the room (`roomPenetration.test.ts`'s Frostfire case pinned the room's departure as "MAP-06
unchanged"); on a destructible of `PENETRATION` 0 the walk stops there anyway, and the cut changes nothing. The room's
material cut was a flat 0.5 at `e181bf6c3`; P1 (`agent/pen-material`, in B195) gave each surface its own material, after
which the truncation was the only thing stopping a round at a GLASS pane.

*Done* on `agent/p11-room` (2026-11-02; **reading, pending review**): the room applies `hitAt` to every struck world
surface in order, as the original calls the handler on each, and keeps `roundPath`'s `path` as it is -- the material cut
alone continues or stops the round, and the shot's end (`path.hit` / `path.end`, the first body's point when one was
struck) and the resting charges' `stopAt` follow the walk with nothing more. `roomPenetration.test.ts`'s Frostfire case
is flipped: a round through player 2 and `bdoor_4`'s pane (GLASS) strikes player 3 behind it, the pane dies, the shot's
`to` is player 2's point; `roomWorld.test.ts`'s SUP-02 case reads the first round's end inside the barracks (*was* at the
pane, 1117.26). *The pane's second polygon* (the witness segment crosses two): the room's walk is per polygon, so one
round hands the handler two calls; the second finds the record spent and its target off (`SceneHealth.hitAt`: `at` null)
and changes nothing -- no second death program, no second `actionDied`, no throw, pinned by the same case. The
original's second entry, if its hit list holds both polygons (the bullet's record per polygon or per model is not
traced here; the blast ray's type 2 keeps one per model, research 23 s1.1): `FUN_00273a50` at HP <= 0 re-enters its
death branch with no test of the old HP (D:L120980-120990), `FUN_003c7490` leaving the health floored at 0
(D:L318634-318638), and asks `FUN_00270ef0` for an instance of the death's animation (D:L120991-120992), which answers
0 while the first entry's instance runs and the animation allows no second (D:L119142-119216; `FUN_002734b0`'s call of a
running animation starts none, D:L120717-120801, as `WorldState.runDisplay` reads it); an action's points are once a
round (`+0x3f` bit 1, PF-14's `markUsed`). So one death and one action, as the room does. Not traced: whether the
instance started at the first entry reads busy within the same walk (`FUN_00269d10` and the tracks' running bytes,
D:L119147-119170), and the armour the second `FUN_003c7490` would wear again (D:L318629-318633; every fixture block
carries armour 0, so nothing shows). Nor -- the further reach of the same question (the P11 review's finding A) --
whether a destructible the first polygon does not exhaust is damaged again by its second in the one walk: before P11
the stop held a round to one hit on a destructible; now the room's per-polygon walk hands it one hit per polygon
crossed, and if the original's hit list keeps one entry per model (as the blast ray's does, research 23 s1.1) the room
deals such a destructible double damage a round. No fixture shows it: the pane dies on its first polygon, and a
destructible of `PENETRATION` 0 stops the walk at its first. What would settle it: the bullet's hit list's
construction (the projectile's `+0x28`, its entries `+0x48`, their count `+0x34`) read at the source, or a capture of
a round through a two-faced destructible of health above one hit. The shooter's own page already walks it so -- `fire.ts`'s `roundPath` with the page's materials and no
destructible test -- and is told nothing of the room's end (`broadcast(shot, id)` excludes the shooter; his `impact`
comes only with a body). What would raise it to proven: a capture of the original on Frostfire, a body behind a door
pane shot through it, and whether that body is hit by the round that breaks the pane.

**For SUP-02** (Frostfire's panes): `pane1`'s reference saves its active state (0x10000200, bit 28) with search 0, so
`MapMeta.initial` saves `bdoor_4`'s pane only (`NODE_REF_SCOPE_READING`): the round's reset gives back all three panes'
health but `bdoor_4`'s geometry alone: a broken `wdoor_1` or `wdoor_2` pane stays off, its destructible no one's to hit
(`at` null), which `sceneHealth.parity.test.ts` asserts as today's state. SUP-02 owes every placement's pane restored (one
reading for the saved reference per placement, or the destructible's own target saved); `world.json`'s
`world.health.reset` names it owed. Done by SUP-02 (research 210 s6): the search-0 reference resolved beneath each
placement, all three panes restored, the test flipped and the `owed` dropped.

**AD-5: the destructible's damage** (2026-10-16, web sprint 40 row AD-5, the reconciliation's C42: chunk 04's review of
the damage chain and chunk 10's caller and PENETRATION reads). **Grade: reading, pending review** -- transcribed from the
decompilation and unit-tested against the transcription; nothing measured running. In `viewer/src/sceneHealth.ts`:

- *The point.* `FUN_00273a50` (D:L120968-120978) takes the target node's bounds (`+0x40` / `+0x4c`, or `FUN_00262550`'s
  when its `+0x5f` bit 6 is set), their 0.5 lerp (`FUN_00308fc0` D:L120975), transformed up its parents (`FUN_00310980`
  D:L120976), and hands that midpoint to `FUN_003c7490` (D:L120978). The blast's reach ray aims at the same point
  (`FUN_003c7ee0` D:L319043-319056). The port: the midpoint of the target's polygons' box where they stand now
  (`SCENE_BOUNDS_MIDPOINT_READING`). *Was:* the box's nearest point.
- *The damage* (`FUN_003c7490` D:L318606-318640, `FUN_003c7600` D:L318650-318830). The first shield test on the rating
  plus modifier, at it qualifying (D:L318622). The falloff from the projectile's position to the midpoint: a blast's
  (kind 5 or 6) whole to half its radius, then `rating x (1 - (t - 0.5) x 2)`, `t = distance / radius`, 0 past it
  (D:L318708-318735; `blastFalloff`); a round's whole to `Effective_Range`, then linear to 0 at `Maximum_Range`, under 0
  past it, 0 past `Effective_Range` when the two are equal (D:L318737-318760; `rangeFalloff`, from the shot's start:
  `ROUND_SCENE_FALLOFF_READING`). The second shield test: 0, or under the shield (strictly), deals nothing; else x14
  (D:L318763-318767, `FUN_003c5950`; `scaledDamage`). The claymore's 1/32 outside its cone after it (D:L318769-318782)
  and the backblast's 0 outside its (D:L318784-318830) -- online (`DAT_0045a0c1`, `IsNetwork`, research 107); offline 0
  everywhere (D:L318785-318786): `blastAt`'s `cone` factor. The armour step: the damage less
  `armour x (10 - Piercing) / 10` floored at 0, the armour less a quarter of what it took floored at 0 (D:L318624-318633;
  `armourStep`; Piercing the round's `ZAMMO` `+0x14`). The health less the damage, floored at 0 (D:L318634-318638).
- *The reach gate* (`FUN_003c80e0` D:L319096-319143, from `FUN_003c7dd0` D:L318978): unless the round ignores
  explosion DI (D:L319096), the squared radius multiplied by each surface's material PENETRATION along the ray (`+0x24`,
  `FUN_002dde40` D:L181383-181385), skipping the target node and any node sharing its `+0x94` object
  (D:L319104-319108; each entry carries a node at `+0x1c`), one entry per model -- the blast ray's record is type 2
  (`FUN_0031dd90` D:L219888), which keeps the first hit per model in surface order (research 23 §1.1): one under 0.0001 refuses (D:L319117), the product under the ray's squared length refuses
  (D:L319133); no surface, or no material, passes -- the gate has no radius test of its own (`reachGate`, `blastLine`,
  `REACH_HITS_READING`). The room's `sceneBlast` takes it with the map's materials (`surfaceMaterial`, the map's
  default for byte 0) from the players' lift (`sightFrom`); *was* the players' line test, no material passing
  (`MATERIAL_ATTENUATION_PLACEHOLDER`).
- *Measured on the data* (the probe's polygon boxes; the tests pin each): Crossroads' terrorist base's basedi midpoint
  (531.15, 32.47, 1528.97) is 20.03 u from the terrorist tent's node and 18.89 u from the room's planted bomb; the SEAL
  base's (2003.51, 73.02, 1429.09) 19.20 u from its tent's -- the bomb's 50 whole (0.06-0.07 of 300 u); a base falls
  out to 0.79 of the radius (237 u), where the falloff's rating meets the shield 21. Vigilance's five barriers stand
  20.8-30.7 high; their midpoints are 1.2-17.7 u from their `access_actionN` nodes (a unit up) and 9.0-14.0 u from the
  witness segments' starts -- inside 0.528 of C4's 50 u (26.4 u), where its 18 still meets the shield 17. From the
  witness start the line to access4's and access5's midpoints crosses their own `good_parts` (STONE, PENETRATION 0): the
  gate refuses them there; from the action nodes all five are reached (access3's line crosses `wc19A/di_intwalls_hint_5`,
  WOOD_THIN 0.25: 625 >= 159). The three fixtures' blocks and Vigilance's five carry armour 0, so the armour step changes
  nothing on them today (Desert Glory's fuel barrels are health 150 behind shield 150, the list above's "150/150").
- *What moved* (each pinned with its old value): the MP72 base's health after the bomb 0 (was -48: 2 - 50, no x14, no
  floor); the synthetic room barriers 24 high with the charges 12 short (was 60 high and 28 short: 41 u from the
  midpoint, 18 x (1 - (0.82 - 0.5) x 2) = 6.5 under the shield 17 -- they would stand); Vigilance's disc blasts at the
  action nodes through `blastLine` (was the witness starts, the plain line); Desert Glory's `truck_stop_gas_hit` (80 / 0)
  falls to an M4A1's third round inside `Effective_Range` (36.4 each; was the 31st, 2.6 each).
- *In the room* (`match/src/room.ts`, the hunks the online seat cleared): `sceneBlast` hands `blastAt` the round's
  Piercing, the cones as `GetDamage`'s factor (the claymore's 1/32 outside its cone, the backblast's 0 outside its --
  *was* no reach) and `blastLine` with the map's materials as its `clear` (*was* the players' line test); a round's
  `hitAt` carries its Piercing and its range from the shot's start, `Effective_Range` and `Maximum_Range` in world
  units (*was* the full rating at any range). `bombBlast` takes the same gate for the bases: on MP12 the comm tower's
  `di3` refuses the SEAL base from a bomb planted behind the mast, and `di2` once the tower has died (213 §5; reading,
  pending review; §14's MP12 row). The room's tests pin each: a round past `Effective_Range` leaves a
  shield-2 barrier and one inside it opens it; an M67 opens a barrier through a WOOD_THIN kerb and not a METAL_THICK
  one; a claymore facing away opens a health-1 wall (7 at its midpoint); a backblast beside a health-0 wall runs its
  death. The comparison with the original running (a capture of a blast at a barrier and at a base) and a rendered
  check are owed.

## 14. Readings and placeholders (MAP-06)

| name | value | what it stands in for | what would settle it |
|---|---|---|---|
| `SCENE_BLAST_REACH_PLACEHOLDER` | `'clear-line'` (AD-5; was `'full-rating'`: the whole rating plus modifier, measured at the nearest point -- the damage is read now, §13's AD-5): which destructibles a blast reaches -- those whose target's box comes inside the radius, through the caller's `clear` on the line to the box's midpoint; the room's is `blastLine`, `FUN_003c80e0`'s material gate (D:L319096-319143) | the explosion's own list of struck objects (`FUN_003c7ee0` D:L319005-319073, its `+0x28`, built elsewhere); ruling PF.R11 | read where the explosion's list is filled (its broad test) |
| `SCENE_BLAST_REACH_PLACEHOLDER` (the claymore's cone) | resolved 2026-10-16 (AD-5): outside its cone a claymore deals a scene destructible 14 x its rating x falloff / 32 (`GetDamage` D:L318769-318782), the backblast 0 outside its (D:L318784-318830) -- the room's `cone` factor; was: no reach | -- | -- |
| `SCENE_BOUNDS_MIDPOINT_READING` | `'polygon-box'`: the point a hit is measured to and a blast's reach ray ends at is the midpoint of the target's polygons' box where they stand now | `FUN_00273a50` D:L120968-120978's transformed midpoint of the target node's own bounds (`+0x40` / `+0x4c`, or `FUN_00262550`'s) | compare the nodes' `+0x40` boxes (own geometry or subtree) with the polygons' boxes on the disc's maps; a rotated node's box |
| `ROUND_SCENE_FALLOFF_READING` | `'shot-start'`: a round's range falloff at a destructible is measured from the shot's start (`SceneHit.range.from`) to the target's midpoint | the projectile node's position `FUN_003c7600` measures from (`+0x20`'s `+0x30..+0x38`, D:L318741-318749) when the hit runs | trace where the round's node stands at the scene hit (its flight or its start); a capture of a far shot at a pane |
| Vigilance's `access4` and `access5` from the witness start (a reading, no constant) | AD-5: a blast at the start of 176 s7.2's witness segment no longer reaches them -- its line to their midpoints (12.0 and 14.0 u) crosses their own `good_parts` (STONE, PENETRATION 0), which `FUN_003c80e0` refuses (D:L319117); from the `access_actionN` nodes all five are reached; was: all five from the witness start | whether `good_parts` is on the blast ray's record and not skipped as sharing the target's `+0x94` object (D:L319104-319108; `REACH_HITS_READING`) | a capture on Vigilance would prove it: C4 set at the barrier's witness-segment side of access4 or access5, and whether the barrier opens |
| `REACH_HITS_READING` | `'first-per-owner-in-order'` (the F1 re-review, 2026-10-16): the reach gate walks, of the polygons the segment crosses whose owner is not at or under the target's path, one per owner object (sibling nodes of one name share a path, not an owner), the first crossed in the owner's surface order -- a two-faced wall or a shared edge counts once, an owner whose first polygon is METAL behind a nearer WOOD_THIN face refuses; *was* `'first-per-owner'` (F1's fold: the nearest per owner path) and before it `'every-crossing'` (every polygon: such a wall counted twice, C4 reaching 12.5 u past a WOOD_THIN one, not 25) | the blast ray's hit record (`FUN_003c80e0`'s `+0x48` / `+0x34`; each entry's node at `+0x1c`) and its exclusion of the target node and any node sharing its `+0x94` object (D:L319104-319108). Partly settled: the record is type 2 (`FUN_0031dd90` D:L219888, `*puVar3 = 2`), the first hit per model in surface order (research 23 s1.1) | compare the record's model unit with the port's per-node collision owners; and the record's surface test (the AD-5 final check, 2026-10-16, low): `FUN_002d2890` D:L174841-174856 records only a surface with bit 1 set and skips bit 18 or 19 by `DAT_0044d758` -- *settled* (LATER 416, 2026-10-26, reading, pending review): the blast ray runs in the collision world's batch at `DAT_0044d758` 0 (set to 1 only around the immediate `FUN_0031e1d0` queries and the camera's span at its setters -- `FUN_002d4fd0` D:L176021, D:L143370/143373 under `DAT_004161c0` with resets at D:L143656/143678, D:L441228-441284, D:L453962-453971, D:L464117-464125; the batch, `FUN_0031de30`, argued to run outside those windows, not traced; 413's front-only mode gap, `DAT_003df270` 0x20/0x30, holds for the batch too), so `blastLine` takes the round's class (`roundAdmits`: `SURFACE_SIDE` set, bit 18 clear -- the camera-only faces passed, a bit-19-alone face kept); *was* every polygon |
| `C4_ACCEPT_DAMAGE_READING` | `'explosionDamage'`: the accept's damage is the charge's ZWEAPON `Explosion_Damage` (C4 18) | the argument the plant passes to the destructible's `+0x10` (`FUN_002739b0`); research 203 s7 grades it believed (V5); ruling PF.R14 | trace the plant path's call (`FUN_005c77b0` L480274-480290, the kit's `+0x8a0`, research 94 C5.1) to the accept |
| `SCENE_DEATH_AUTHORITY_READING` | `false`: the room never applies the authority guard | `FUN_00273a50`'s branch that holds 0.01 HP when the animation's flag bit 3 is set and the projectile's `+4` bit 2 is absent (research 174 s3; bit 2 is `!controller virtual +0x34`, D:L479365-479374, D:L474038-474046) -- a network ownership flag | the host/remote replay contract (a runtime gate): two consoles, a barrier shot by the remote side |
| `SCENE_INSTANCE_SCOPE_READING` | within a destructible or a program its death or action starts, a reference is looked up beneath the placement first (the root at or above the scope; search 1 beneath the root only; search 0 beneath it, else the world's first); a called animation runs at its caller's root | the engine's node lookup per instance and `CALL_ANIMATION`'s context (its node byte at +4, `door_slab`'s 2 = `pane1`, not decoded) | `CZAnim::Load` 0x26d370's resolver and `FUN_0025d5c0` (the call's begin); one look at Frostfire's second door's pane after the first's is shot |
| `BLAST_LIST_ORDER_PLACEHOLDER` | `'binding-order'` (2026-10-22, PR #405): `blastAt` asks the destructibles in `SceneHealth.list`'s order -- the map's binding order (`sceneOf`) -- and a target that dies runs its program on the world before the next target's ray is asked, so a death can change a later target's line (MP12: the tower's `di2` on before the SEAL base's ray) | the explosion's list at the projectile's `+0x28` (`+0x48` entries, `+0x34` many), walked one target a call: `FUN_003c7ee0` (D:L319007-319073) builds the next entry's ray to its midpoint, `FUN_003c7dd0` gates it (`FUN_003c80e0`, D:L318978), hits it (D:L318992) and steps the index (D:L318999); the list is filled elsewhere and its order is unread | a trace of `FUN_003c7ee0`'s list order (the `+0x48` entries against the map's destructibles), e.g. the bomb's blast behind MP12's mast |
| A round past a destructible that takes the hit (a reading, no constant) | P11 (2026-11-02, the online-parity sweep's SW-4; reading, pending review): the original's bullet goes on by the struck polygon's `PENETRATION` alone, whatever the destructible did with the hit | the destructible's handler is called and its return discarded (`FUN_003c8920` D:L319417-319418, the continuation D:L319473-319518; `FUN_00273a50` answers 0, D:L121065; the walk D:L320044-320055) -- §13, "Does a destructible that takes the hit end the round?". The room departed (until `agent/p11-room`): `fire` stopped the round at the first destructible that applied (`room.ts:5060-5078` at `e181bf6c3`), an attribution to PF.R12 that PF.R12 does not make; a body behind a Frostfire door pane (GLASS, 0.99) that a round broke was unstruck online | done on `agent/p11-room` (2026-11-02, reading, pending review): the stop dropped, `hitAt` on every struck world surface in order, `roundPath`'s `path` the round; `roomPenetration.test.ts`'s Frostfire case flipped (player 3 behind the pane struck; the pane's second polygon kills it no second time), `roomWorld.test.ts`'s first round ends inside the barracks; proven by a capture of the original on Frostfire, a body behind a door pane shot through it. Open (the P11 review's finding A): the room hands a destructible one hit per polygon the round crosses -- double damage a round on a two-faced destructible its first polygon does not exhaust, if the original's bullet hit list keeps one entry per model (as the blast ray's, research 23 s1.1); no fixture shows it; settled by the hit list's construction (the projectile's `+0x28`, entries `+0x48`, count `+0x34`) read at the source, or a capture of a round through such a destructible |
| MP12's mast and the SEAL base (a reading, no constant) | PR #405 (2026-10-22, from the 2026-10-20 trace; reading, pending review): a bomb planted behind the comm tower does not reach `destroy_seal_base`. `FUN_003c80e0` skips only the target node and nodes sharing its `+0x94` damage interface (D:L319104-319108); the tower's interface is set on `tow_deux`'s whole subtree (`FUN_002740e0` D:L121213 binds a destructible's node through `FUN_003158b0` with its third argument 1: the `+0x94` set at D:L215134, the subtree walk D:L215135-215166), never `basedi`'s, so its faces count, and `di3` (METAL_THICK, PENETRATION 0) refuses (D:L319117). After the tower's death `di2`'s stump (METAL_THICK) refuses in its place, so the list's order does not rescue it (`BLAST_LIST_ORDER_PLACEHOLDER`). From `seal_tent`'s node the base is reached. The round is the planters' either way: the bomb's state 5 decides it (PF-14b), not the base's death. *Was* (PR #405 as opened, never on `main`): `BASE_BLAST_LINE_PLACEHOLDER`, the two bases let past the gate by animation name, dropped -- `FUN_003c80e0` has no branch by target kind | the reach gate on MP12's tower faces against the basedi ray (213 §5) | a capture of the original planting south-east of the mast (at (2143.0, 104.6, 2038.8), say), and whether the SEAL base falls |

## 15. Offline C4 delivery (2026-10-17, C4-BARRICADE)

The actual local plant and fuse produced an explosion without delivering damage to scene health. Only the server
called `SceneHealth.blastAt`; the offline thrower and its match listener produced presentation alone. The repair
connects a locally owned, offline C4 explosion to the existing scene-health path. Online and remote/replay
explosions remain presentation-only on the page, preserving the room's authority.

Source reading, independently reviewed on 2026-10-17: `FUN_003c7ee0` D:L319005-319073 builds the blast's per-object ray to
the transformed bounds midpoint; `FUN_003c80e0` D:L319096-319143 gates that reach, and `FUN_00273a50`
D:L120978-121059 delivers damage and starts the bound animation on death. These are the existing section 13
readings, not new damage rules. The C4 record comes through the repository's ZWEAPON reader: its `C4 Ammo`
`IgnoreExplosionDI` skips obstruction and its `Piercing` is zero (research 235 section 1). A non-ignoring record
uses the existing material gate and the same origin offset as the room. All existing bounds, reach and authority
readings/placeholders in section 14 remain; no new gameplay value or per-map override is introduced.

Regression coverage uses the real plant, placement and fuse, not a direct test-only damage call. Synthetic tests
hold geometry, collision, reset, online authority and remote presentation. Dev-disc coverage scans the available
retail maps and plants against their eligible access animation targets; the complete local set contains 27 access
barriers in nine of 22 maps. Test-camera candidate rays are instruments only. *Was (2026-10-17):* other explosive
types are outside this repair. **2026-10-19 (LATER 102):** every local offline explosion uses this same `blastAt`
path (`grenade.ts` `explode`; the `record.name === 'C4'` gate is gone). The rating and radius are the record's own
(research 94 §C4/§C5, research 176 §7.3): the RPG and the LAW HEAT 20 in 150 u, the M67 10 in 150 u, C4 18 in 50 u.
A shield of 17 takes the rocket and C4 and refuses the M67 before falloff. Online and remote explosions stay
presentation-only on the page. No original-running capture comparison or physical player confirmation is claimed.
The plan `../plans/2026-10-17-c4-barricades.md` records the C4 repair's runs and remaining checks.

**2026-10-22 (LATER 102 finished, Fuse's #398 taken over; reading, pending review).** Two corrections to what the
page's blast takes, both against `FUN_003c7490`/`FUN_003c7600` as the room's `sceneBlast` reads them:
- *The round's `Piercing`.* `FUN_003c7490` D:L318624-318625 takes `armour x (10 - piercing) / 10` off the damage.
  The page now passes the round's own (`grenade.ts` `piercings`): `BAKED_PIERCING` without the disc (research 91 §5:
  the M67 4, the HE 1, the rest 0 -- the room's `BAKED_THROWN`), else the kit table's `KitThrowable.piercing` and
  `KitRound.piercing`, which `matchThrow.ts` now hands `setRecords` / `setRounds` whole. *Was:* none (0) -- which
  leaves the page **more** armoured than the room, never less: an armoured block (armour 150, shield 10) stood an
  M67 on the page and died to it in the room. Vigilance's barriers have armour 0, so their deaths do not change.
- *The backblast.* `FUN_003c7600` D:L318784-318787 gives a backblast 0 everywhere offline (`DAT_0045a0c1` clear); its
  45-degree cone (D:L318789-318829) is online's. The page's blast runs offline only, so its factor is now 0 for a
  backblast. *Was:* 0 only outside the cone (the room's online rule), which no offline path reaches today. The room
  applies the cone on an offline loopback match too (LATER 270, `room.ts`'s).
The claymore's 1/32 outside its cone (D:L318769-318782) is unchanged. Corrections to our own review of 2026-10-20,
not to Fuse's work: the Piercing needed `matchThrow.ts`, not `grenade.ts` alone; the review had the armour's
direction reversed ("dies on the page and not in the room"); the backblast was code, not only its comment. Held by
`accessBarriers.test.ts` (the armoured twin, page and room alike) and `matchThrow.test.ts` (the fixture
`ZWEAPON.ZAR`'s table: the M67 4, the HE 1 and the RPG's round reach `blastAt`).

## 16. C4 surface placement (2026-10-18, C4-PLACE)

**Reading, independently reviewed 2026-10-18.** `FUN_005c1970` D:L476979-476985 passes the saved target-ray point
(`DAT_0066b6a8/ac/b0`) to `FUN_005bc730`. The separate ground-charge branch calls `FUN_005c2430` and
copies its accepted ground entry at D:L477001-477010. The viewer incorrectly used that ground branch for
C4 too, even though its plant event already carried the accepted wall hit. A hand-ground origin can lie
outside the shield's effective blast range while the aimed wall point is in range. The room likewise
launched from the submitted hand-ground point after validating the wall point.

The viewer now places C4 at its saved surface point. The authoritative room uses the point it validated,
including its target, reach, line and material checks, for the charge and both placement messages. Its
hand-ground checks remain for claymore/PMN; C4's own reach/line validation governs its wall point. The
existing fuse, inventory consumption, damage, falloff, shield, scene death, and online authority remain.
No direct kill, per-map exception or damage increase is introduced. Research 94 C5.1's setting citation
is corrected to the lines actually copying the saved point.

Synthetic regressions run the actual plant/fuse from an ordinary hand offset that previously left a
barrier standing, require the exact saved explosion point and one charge spent, and keep online damage
authoritative. The room regression requires its validated wall point in both messages and one-charge
death with the former hand-ground point outside effective shield reach. Existing malformed target,
missed/obstructed surface, reach, material and ground-charge regressions remain.

Dev-disc coverage now requires three approach distances and three lateral hand offsets per barrier;
every accepted plant must reach its fuse and match the saved point. A failed breach is not retried until
one succeeds. The plan records exact results, including any remaining bounds/falloff investigation;
these test-camera samples are instruments, not original-running capture evidence.

The expanded edge survey found a separate limit: 240 of 243 accepted plants destroyed their barrier;
Sujo (`MP61`) access2 survived the same edge hit for all three hand offsets. The hit was 29.189 units
from the midpoint, so `FUN_003c7600` D:L318708-318735 gives 14.984, below shield 17 at
D:L318763-318767. Source inspection of `FUN_00273a50` D:L120968-120978 identifies the transformed
node-parameter bounds midpoint. A data comparison of access2's authored node bounds and its collision
box agrees within 0.00003 units; changing bounds would not settle this case. No force-kill is justified.
The test retains this edge survival separately from a centred-ray run requiring one-charge death for
every barrier. The 45 original survey samples on Death Trap's two and Fish Hook's three barriers all
breached. The existing `C4_REACH_READING` (32 versus the original body distance gate of 396 in research
94 C5.1/202 s2.1) remains a separate uncertainty; this repair does not establish that every point the
browser currently accepts would be accepted by the original. Original-running comparison is still owed.

**The commit's recheck (2026-10-22, LATER 122; Fuse's #398 taken over; reading, pending review).** `FUN_005c1970`
D:L476938-476940 -- reached at the plant clip's callback and at the kit timer's 99 s fallback alike, both through
`+0x87c` at or under 0 (D:L476883-476905) -- gives up on exactly three things: the saved object (`DAT_0066b6a0`) or its
`+0x94` interface gone; that interface's `+0x10` refusing the charge (the kit's `+0x8a0`); or the object moved since
the save -- its position now (`+0x30` plus its parent's world translation, `FUN_003109f0` and `FUN_00309240`) less the
one saved at the plant's start (D:L475421-475440), any squared length above 0. Giving up returns the kit to the
firearm and clears the save (D:L476941-476964); the charge is not spent. Reach, the reticle and the line are not
asked again, and the charge goes to the saved point (D:L476979-476985). The tests after it (D:L476966-476980: the
saved hit's material index, `INVISIBLE_DI`, the material's flag bits) read the save, which the clip cannot change; the
page asks `INVISIBLE_DI` at the start instead and never the flags (LATER 268).

The page (`grenade.ts` `placeCharge`, `c4CommitOk`): `c4TargetAt` at the saved node and the charge's damage must still
give the saved target (gone and refusing alike; it resolves the deepest active destructible at the node's path, where
the original holds the object itself: LATER 269), and the polygon the plant struck must still be where it was
(`C4_TARGET_MOVED_READING`, below). *Was (2026-10-19, the first build of LATER 122):* reach (`c4InReach`), the
reticle still on the node and `c4Line` from the aim eye were asked again too, so turning the camera during the
1.098 s clip dropped a plant online that the room (which judges the start's eye, LATER 144) and the original accept.
Correction to our own review of 2026-10-20, not to Fuse's work: "moved" needed a named reading, which the review did
not ask for. Held by `grenade.test.ts` (the camera turned or the feet away mid-clip still plants at the saved point;
the pane slid in its own plane plants nothing; gone or refusing plants nothing; the 99 s fallback asks the same
three) and `accessBarriers.test.ts` (the barrier blown open mid-plant gives the C4 back). Not seen in a browser.

**The room's fallback (2026-10-22, #398's fresh review F1; reading, pending review).** Online, a plant knocked before its
callback falls to the kit's 99 s timer (`C4_KIT_TIMER_SECONDS`, `C4_FALLBACK_PLACEHOLDER`), and the page then plants at
the saved point wherever the SEAL is -- the original's block above. The room judged reach and the line from the feet and
head of the throw's arrival and refused it ('c4 reach', 'c4 walled'), so the page showed a charge the match did not have.
Now the room's own mover marks the placing hold `cut` when it comes off before the callback (`room.ts` `noteThrowHold`),
and a C4 throw arriving `C4_KIT_TIMER_SECONDS` after the hold's start is judged as the start saw it: reach from the
start's feet, `c4Line` from the start's head and camera eye -- the save's own tests (`FUN_005be9a0` D:L475399-475419).
The 99 s and the cut are counted in the player's own command ticks (`p.ran`, with the commands received and waiting),
as the page counts its kit timer on the same capped frame time as its mover's ticks (`main.ts`, `matchMount.ts`: a
frame's step at most 0.1 s), so a stalled or backgrounded page is not pushed out of the window by wall time. Counting
the received queue (up to about `QUEUE_MAX` + `CREDIT_MAX` + the unrun ticks) leaves the room's event clock the only
lower bound (#398's narrow check, F1): a throw is taken at most `FIRE_STALL_CREDIT_TICKS` + `FIRE_ARRIVAL_JITTER_TICKS`
(24 ticks) short of the 99 s on the event clock -- about 45 ticks (0.75 s) in wall time, as the start's `at` may sit up
to `FIRE_STALL_CREDIT_TICKS` under the server's clock -- and never sooner (a burst of the last second's commands sent
with the throw is refused: `roomBarriers.test.ts`). The charge goes down only with C4 still in the hand: the original's timer plants only when
the kit's current item is 0x97 at its end (D:L476887-476892); the room refuses ('c4 hand') once the firearm was
swapped, a launcher taken up or a throw laid since the start (`handOff`).

A forged page gains no point it could not name at the start and no earlier time. It needs no knock, though: it can end
the hold `replaced` at will by asking another hold over the placing -- a reload, a throw or the other placing
(`holdOverHold`, `HOLD_OVER_PLACE_READING` 'replaced', the port's reading) -- where the original pushes a throw or the
other placing over the placing and resumes it when it pops (`FUN_00588bc0` D:L446105-446291, `FUN_0028dc90`
D:L135150-135214) rather than falling back. Of those the throw takes the hand ('c4 hand') and the other placing
replaces the start (`placeStart`); a reload's `replaced` still hands the plant to the fallback, and what the original
does to a C4 placing under the reload's own clear (`FUN_005a82e0` -> `FUN_0058a4d0`, D:L462925-462926) is not read.
Nor does `handOff` see a weapon exchange or a pickup during the 99 s (named, not built: #398's narrow check, F3): the
room tracks only the firearm swap, a launcher taken up and a throw's hold, so a page that exchanges or picks up a
weapon and still sends the fallback's throw is planted -- only a forged page reaches it, and the original, its kit's
current item no longer 0x97 at the timer's end, would not plant. A launcher lowered by C4's own equip (the page's
order: the lower on the last command sent, the placing's hold on the next) is down by the hold's command and is no
hand change (`roomBarriers.test.ts`).
Residual: the line is judged against the geometry at the arrival, so a door shut across it during the 99 s refuses
where the page and the original plant (LATER 282). Held by `roomBarriers.test.ts`.

### 16.1 Readings (LATER 122)

| name | value | what it stands for | what settles it |
|---|---|---|---|
| `C4_TARGET_MOVED_READING` | `'struck-polygon'`: the polygon the plant struck no longer where it was (a coordinate off by more than 1e-4, the settle's own test, `C4Settle`, research 210) | `FUN_005c1970` D:L476913-476940's position test against the save (D:L475421-475440): the object's own `+0x30` plus its parent's world matrix's translation row alone -- `FUN_003109f0` builds the parent's matrix and `FUN_00309240` adds only that row (D:L476918-476919, D:L475430-475431), `FUN_00309200` subtracts -- compared strictly (any squared length above 0). No rotation enters it anywhere: a node turned in place, or a leaf under a turning parent, has not moved in the original. The page's hull keeps no node positions. **The port's departure:** a turned node's polygons move, so the page counts it moved and gives the charge back where the original plants it (a pane on a swinging door) | open: only whether a scene animation writes a node's `+0x30` (a translation key), the case both count as moved -- a read of what the scene animation's channels write to a node, or a capture's memory trace of `DAT_0066b6a0+0x30` while a C4-takeable node animates; the departure itself is settled by the read above, kept until a node-position test replaces the polygon's |

## 17. C4 fuse readout (2026-10-18, C4-BAR)

The owner explicitly requested a bar **after placement until explosion**, not a planting-progress bar.
**An adaptation by the owner's ruling, OT.R64** (MISSION): the original was not found to draw one, so the bar
is a labelled addition beside the original HUD, not a reading of it; its choices are `*_ADAPTATION`, not placeholders.
The projectile already owns the clock: C4's ZWEAPON `Timer1` through `ThrowableRecord.fuse`, with its
remaining `Grenade.fuse` advanced by the normal flight simulation. The readout returns their ratio;
it starts at one on placement and ends when the projectile detonates or is cleared. It creates no
second timer, changes no fuse, damage or inventory, and persists when the player returns to a firearm.
Both pages feed it through the shared `matchThrow` hands and `matchFirearm` HUD frame.

**Original presentation unknown.** The bounded source search of the C4 plant/commit/projectile path
(`FUN_005be9a0`, `FUN_005c1970`, `FUN_003c5310`) and HUD prompt update found no confirmed C4 fuse bar.
`FUN_00220350` D:L74426-74442 is the DEMOLITION action hold bar, not evidence of a C4 countdown.
Its existing port geometry and colours are reused provisionally, explicitly below; this is not a claim
that SOCOM II drew a C4 bar in that position or style. A capture of the original planting C4 through
its explosion, including weapon changes and multiple charges, would settle the presentation.

The separate `HudModel.c4FuseBar` and draw group leave `holdBar` intact. A live or fading bomb hold has
priority at the shared location. The C4 view hides with the prompt group under scoreboard, spectator,
START and round-screen suppression; ordinary HUD visibility applies too. The view is cleared at round
start/disposal and on the next shared HUD feed after the projectile clears. No game simulation depends
on this readout. Tests cover the real plant/fuse, remote and non-C4 exclusion, multiple own charges,
weapon switching, exact full/half fill geometry, suppression, independent hold state, and removal.

### 17.1 Adaptations (OT.R64)

| name | the choice and its scope | evidence that would revisit it |
|---|---|---|
| `C4_FUSE_BAR_SELECTION_ADAPTATION` | own local resting C4 only, smallest remaining fuse; excludes held, remote and detonated projectiles, switches to the next remaining charge | original-running HUD capture with two planted charges and another player's charge |
| `C4_FUSE_BAR_PRESENTATION_ADAPTATION` | reuse the DEMOLITION hold bar's geometry and colours; bomb hold including fade wins; immediate removal; hide with the hold-bar group | original C4 plant-to-explosion HUD capture, including spectator, scoreboard and overlapping bomb hold |
| `C4_SERVER_DETONATE_GRACE_S_ADAPTATION` | one second, sixty room ticks, past `Timer1` with no `detonate`, then the page's named C4 goes off; game frames when no room tick is wired | a capture of a lost blast message on the original, which has no such wait |
| `LOOPBACK_CATCHUP_TICKS_ADAPTATION` | sixty room ticks in one wake, only while a C4 is still live; every other wake runs at most five (`LOOPBACK_WAKE_TICKS`), the dedicated server's per-wake cap, the rest of a kept gap in the wakes after it (the server drops it). The stall bound is one second at 60 Hz, and a 250 ms stall is fifteen ticks, which five would leave behind | a step time on a shipped map. On this host a synthetic room (one player, no clips) took 0.43–0.73 ms for sixty steps |
| `LOOPBACK_STALL_MS_ADAPTATION` | a wake more than one second behind drops the gap; a frame loop quiet this long is no longer drawing, and a held `detonate` is published then | a measured stall the original recovers, which this clock does not try to match |

## 18. One blast frame for a placed C4 (2026-10-18, C4 clock)

**Reading, pending review.** A placed C4's `Timer1` and its blast are one detonation. `HandleTimers` (`FUN_003c99a0` D:L319885-319897: online, a non-host copy skips it, which is why the page waits for the room's `detonate`; D:L320191, where `PostTick` calls it, research 332 §1.2) sets the detonated state when `Timer1` is at or under zero (research 85 §5.1); `FUN_003c7600` then rates the blast (research 209 §13). Every access gate already read here is health 1, armour 0, shield 17, and C4's `Explosion_Damage` is 18, so one charge spends the gate on that detonation. The decompilation does not show `Timer1` and the blast in one frame. There is no second timer between the flash and the gate opening.

On the offline Test Room match the page's own copy went off on its fuse (the flash and the sound) while `explode()` left the barricade to the room, because a match is `online()`. The room already did the blast, the gate's death and the players' damage in the one tick (`flyGrenades` → `blast`). It never told the page. The in-page clock (`net/loopback.ts`) also ran at most five ticks a wake and dropped the rest, so at about 14 fps the room sat about 953 ms behind and the 362-tick fuse took about 6.95 real seconds. The gate and the damage arrived about 1.26 s after the page's flash. That delay is the port's two clocks, seen on head `8058ff615` before landing B77 (PR #340) brought #321's placement onto main. It is not a rule of the original. Landing the placement made the delay visible, because the charge now sticks to the barricade.

The room now broadcasts `{ type: 'detonate', pid, by: null }` to every page, the owner included, in the same tick as `blast` when a placed C4 explodes. The page already routes `detonate` to `detonateRemote`. While `online()`, a C4 the room has named holds its fuse one game frame above zero until that message sets `trigger`. About one second of room ticks with no message — sixty ticks, `C4_SERVER_DETONATE_GRACE_S_ADAPTATION` — the copy goes off anyway: a browser adaptation for a dropped connection, not a fuse and not a `*_PLACEHOLDER`. With no room tick wired (a remote server), the same second is still game frames. The page's frame drains the in-page clock first, and those ticks' frames are applied before the fallback is counted, so a stalled frame's wall time cannot open the flash ahead of the gate.

The clock's own timer still steps between frames. While the page is drawing, that wake holds only a `detonate` and the world follow for the next drain. Every other frame of the wake is published before the wake returns. A reply sent straight from the room while a `detonate` is still held — a `placed`, an armory reply, a Detonator, a score — joins that queue, so it cannot overtake the blast. A charge whose trigger is already set explodes in the drain's frame even when the frame is shorter than a game frame. A hidden tab, or a page whose last drain is more than a second ago (`LOOPBACK_STALL_MS_ADAPTATION`), has no frame waiting, so the timer publishes as it steps and the queue cannot grow without a drain.

`nomatch` is not online, so its local fuse still opens the barricade (§15). The fuse bar is still the projectile's own ratio (§17). With no C4 live, the in-page clock catches up at most five ticks a wake (`LOOPBACK_WAKE_TICKS`), the dedicated match server's per-wake cap; unlike the server, which drops what is left (`next = now`), the loopback's deadline advances only by the ticks run, so a kept gap is still replayed -- over several back-to-back wakes, not one long one (2026-10-19, the port's narrow review: was "so the round clock and the AI are not replayed past that"). While a C4 is live, a gap that is not dropped is replayed whole, up to sixty ticks (`LOOPBACK_CATCHUP_TICKS_ADAPTATION`): the stall bound is one second and the room is 60 Hz, and the offline spec's 250 ms stalls are fifteen ticks, which a five-tick cap would leave behind. On this host a synthetic room — one joined player, no clips, a flat floor and the same floor with one wall — took 0.43–0.73 ms for sixty steps (the median of twenty samples of each; the slowest sample was 3.0 ms). A shipped map was not measured here. The dedicated match server's five-step catch-up is unchanged (research 223).
