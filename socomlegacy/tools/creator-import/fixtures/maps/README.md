# Original courtyard fixture preparation

This is an **original-authored browser adaptation**, authored for FCW-10's future
independent map acceptance. It contains no disc payload, borrowed level layout,
external asset, texture, executable content, or network reference. Its shapes and
colors are authored fixture choices, not readings of the original game.

These files are neutral authoring data. `neutral-authoring-source-1` is a local
fixture format, **not** a published `ContentMapDefinition`, pack manifest, import
API, navigation format, or working custom-map loader. The owning engine task must
adapt it after its reviewed types are published. No runtime feature is added here.

## Files

| File | Purpose |
|---|---|
| `generate.py` | Python standard-library authoring source and bounded structural checker. |
| `courtyard.source.json` | Complete geometry and semantic source, including explicit collision polygons. |
| `courtyard.glb` | Deterministic glTF 2.0 binary render geometry with one embedded buffer. |
| `courtyard.variants.json` | Four small source mutation recipes for future negative acceptance checks. |
| `courtyard.files.json` | SHA-256 and byte counts for the three generated data files above. Fixture bookkeeping only. |
| `.gitattributes` | Treats GLB bytes as binary without end-of-line conversion. |

Run from the repository root:

```text
python socomlegacy/tools/creator-import/fixtures/maps/generate.py
python socomlegacy/tools/creator-import/fixtures/maps/generate.py --check
```

The first command regenerates only the four named generated files in this
directory. `--check` performs the same structural checks and compares committed
bytes without writing. Neither command installs dependencies or uses the engine,
disc, renderer, server, or network. This is artifact preparation, not a claimed
runtime RED/GREEN cycle or a substitute for the project's gate.

## Exact authored properties

- Source and GLB positions are metres, right handed, +Y up, +X east, -Z north.
  All dimensions and transforms are baked into positions; each GLB node has an
  identity matrix and source scale is `[1, 1, 1]`. The adapter's conversion into
  runtime coordinates is owed; no universal original-game scale is asserted.
- The floor is 40 by 32 metres at Y = 0. Render/collision bounds are
  `[-20.5, 0, -16.5]` to `[20.5, 4, 16.5]`. Four outer wall boxes are 0.5 metres
  thick and 4 metres high. A central divider is 1 by 16 by 3 metres, leaving
  routes around its north and south ends.
- Collision has 31 explicit convex planar quads: one upward floor and all six
  outward faces of each of five wall boxes. Wall tops and bottoms deliberately
  remain wall-role surfaces; this fixture offers one walkable elevation only.
  Quads share the render's solid faces exactly. Three small colored marker quads
  sit at Y = 0.01 and are explicitly visual only.
- The GLB has 9 named meshes, 9 identity nodes, 9 untextured material entries, 136
  vertices, and 68 triangles. Materials use their authored base colors, zero
  metallic factor, roughness 1, and outward-facing geometry. It has no images,
  textures, extensions, external buffers, cameras, lights, animations, or skins.
- Four feet-position spawns stand at Y = 0: A at `[-15, 0, -3]` and `[-15, 0, 3]`,
  facing +X; B at `[15, 0, -3]` and `[15, 0, 3]`, facing -X. A/B are fixture team
  labels; their runtime team/side representation awaits the adapter.
- Five named regions are `courtyard`, `west-staging`, `east-staging`,
  `north-route`, and `south-route`. Region boxes intentionally overlap their
  enclosing courtyard. Marker references use stable authored IDs, not revisions.
- Demolition source includes one shared bomb pickup at `[0, 0, -12]`, one site
  for planting team A at `[14, 0, 0]`, and one for planting team B at
  `[-14, 0, 0]`. Two sites are supplied because the current engine's Demolition
  path requires both planting teams (`viewer/src/forge/objectives.ts`,
  `bombReady`; `match/src/bomb.ts`, `BombAuthority.of`). This source supplies roles
  and floor positions only; the engine retains timing, range, scoring and damage.
- Two route polylines connect the teams around opposite divider ends. A ray
  across Z = 0 at Y = 1.5 hits the divider; one across Z = -12 at the same height
  is clear. These are geometry expectations, not movement or shot executions.

## Structural checks performed here

The checker asserts finite, convex, planar nondegenerate quads; floor height and
upward winding; six outward wall faces per box; unique authored IDs; containment
of all collision/render positions; valid marker region references; exact floor
height for every spawn/objective; unit horizontal spawn facing; and two teams'
planting sites. A small analytic 1-metre lattice flood checks that every marker
shares a floor component with 0.5-metre horizontal wall clearance. The supplied
route segments avoid wall boxes, and both ray/box expectations are checked.

The GLB checker reads its chunks and position/index buffers: magic, version,
length, chunk alignment, buffer bounds, finite position values, contained
positions, valid indices, identity nodes, embedded buffer, and the expected mesh
and triangle counts. The generator compares bytes on `--check`. It does not run
a third-party glTF conformance validator or render the file.

The negative recipes are fixture-local mutations, not patch APIs. They are each
checked to produce one distinct structural diagnostic:

| Case | Source mutation | Expected structural diagnostic |
|---|---|---|
| `unsafe-bounds` | Replace declared bounds with a small box. | `bounds-containment` |
| `disconnected` | Add a full-depth wall between the team areas. | `disconnected-team-spawns` |
| `missing-region` | Give the bomb pickup an absent region ID. | `unknown-region-reference` |
| `missing-team-site` | Remove B's planting site. | `incomplete-demolition-sites` |

The disconnected case adds corresponding explicit collision faces when checked;
it is a negative gameplay-source case and does not claim a corresponding render.
Do not import the base GLB plus a negative mutation as a complete playable map.

## Typed adaptation and acceptance still owed

The existing expectations inspected while preparing these data are:

- `viewer/src/mover.ts`: `GroundData`, `packGround`, `groundGrid` require a
  runtime grid, contiguous collision owner spans, packed points and six fields
  per polygon. `scene/src/collision.ts` defines floor/wall classification
  (`ditype` ground bit and side bit), probe flags and polygon-normal semantics.
- `viewer/src/loadMap.ts`: `LoadedMap` needs render data, grid/ground, textures,
  spawn slots and other load metadata. A GLB alone is not that object.
- `viewer/src/simMap.ts`: `SimMap` needs the same gameplay ground/grid and spawn
  representation; Demolition additionally needs its bomb start and action data.
- `viewer/src/forge/matchMap.ts`: `spawnOnFloor` probes the runtime floor;
  `slotsOfSpawns` derives side/index/facing. Source coordinates have not yet been
  passed through these functions.

After `ContentMapDefinition` is published and reviewed, the owning task must
implement and test one explicit coordinate conversion for **all** render,
collision, bounds, region, spawn, objective and route values; map stable region
IDs and wall/floor roles into the approved representation; create grid/owner
metadata; derive team spawn slots and Demolition actions through the accepted
seams; and validate the resulting typed definition. The neutral mutation recipes
must be adapted to the published validation API rather than treated as engine
diagnostic codes or a frozen schema.

Still owed: typed adapter/unit acceptance, engine floor and clearance probes,
actual reachability/navigation, objective/action readiness, viewer/match gameplay
digest equality, load/abort/rollback refusal tests, and a rendered run exercising
normal movement, shots, bomb pickup/plant/defuse, save/reopen, and return to a
retail map. No rendered, physical, disc-backed, parity, or gate result is claimed.
