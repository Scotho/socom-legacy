# Original prop fixture preparation (FCW-09)

These are original-authored browser adaptation fixtures: a small colored signal
crate, with explicit collision source geometry. They contain no disc data, copied
game geometry, texture, third-party model, decompilation, or fetched resource.
The source, generator and generated assets are supplied under **GPL-3.0-only**,
the repository's [license](../../../../../LICENSE). The geometry and colors
were authored for this task by Codex (GPT-6). No Blender export was performed:
`generate.py` writes the GLB directly with Python's standard library.

This is **preparation only**. It does not complete FCW-09, certify solidity, or
introduce AssetDefinition, content-pack wire types, a provider or an importer.
Runtime adaptation is owed to the shared FCW-05/FCW-09 contract and engine work.
The plan's requested Blender workflow still needs its own actual export and
acceptance evidence. No original-game parity claim is made for this authored prop.

## Source and coordinates

`source.json` is the human-readable source of every vertex, outward face, color
and variant. Its authored box measures **2 x 1.5 x 1 metres** (X/Y/Z), with origin
at its bottom centre. Coordinates are right-handed, +Y up; +Z is the cyan marker
face. Orange marks the top and purple the remaining sides. This asymmetry makes
orientation visible without any textures. Each GLB has 24 face-local vertices,
12 indexed triangles, six materials, flat normals and face-local UVs. There are
no animations, skins, lights, cameras, extensions, pivot extras or compression.

For valid inputs all dimensions are baked into positions and the node transform
is identity. Placement assumptions are translation and yaw about +Y only, with
unit positive scale; pitch, roll, negative/nonuniform scale are outside this
fixture's valid-placement contract. The mirrored variant intentionally violates
the baked-transform requirement. GLB and collision coordinates are both metres;
the engine adapter must perform one explicit, identical conversion on both paths
using the reviewed engine unit contract. No engine-unit conversion is baked here.

The six source quads form a closed convex hull. Winding is counterclockwise when
viewed from outside, matching the render triangles; each edge has exactly one
opposite edge and volume is 3 cubic metres. Collision sidecars list source
vertices and face indices separately from render tessellation. A `nodeMatrixColumnMajor`
records the GLB node transform without applying it to the hull twice.

## Cases

Every `.glb` has a matching `.collision-source.json`. The words valid/invalid
below describe authored input properties and future expectations, **not observed
runtime outcomes**.

| Stem | Render data | Explicit collision source | Intended future behavior |
|---|---|---|---|
| `solid` | Embedded buffers, identity transform | Closed convex box, eight vertices, six quads | May become solid only after reviewed import/provider validation |
| `visual-only` | Same geometry/colors as solid, distinct node name | Explicit empty `hulls`, intent `none` | Remains visual-only; cannot claim solidity or acquire an inferred box |
| `degenerate-hull` | Valid full-height render box | All Y coordinates collapsed to zero, four duplicate pairs, four zero-area faces, zero volume | Refuse collision precisely; render bounds must not rescue the hull |
| `mirrored-transform` | Node scale `[-1,1,1]`, determinant -1 | Healthy local hull plus the same negative-determinant node matrix; `transformsBaked: false` | Refuse mirrored input before publishing either render or collision |
| `external-uri` | Embedded mesh plus a used image URI under `example.invalid` | Healthy box | Refuse the external reference before loader/fetch; never request the deliberately nonexistent image |

`solid` and `visual-only` intentionally differ only in node name and the sidecar
collision intent. The external image is used by the cyan face material, with
UVs present, to exercise a real dependency. **Do not load the external-URI case
directly with an unguarded glTF loader.** It is intended for the repository's
pre-parse refusal path (`viewer/src/modelPackRuntime.ts` `refuseOutsideUris`), which
inspects image/buffer URIs before `GLTFLoader.parse`.

## Neutral sidecar boundary

The `purpose` in each sidecar explicitly says it is neutral fixture source data.
`sourceSha256` binds the exact `source.json` bytes and `renderSha256` the paired
GLB. `inventory.json` records byte counts and SHA-256 digests of every generated
GLB and sidecar; it is an audit inventory, **not an import manifest**. It avoids a
self-referential hash of itself. The generator and this README are ordinary
reviewed source files, outside that generated-output inventory.

No game-specific surface word, ditype, camera type, material ID, owner/path,
region, pack ID, asset ID or schema version is invented here. The current
`scene/src/collision.ts` `WorldPoly` requires those typed fields and a flat
`Float32Array` of points. `viewer/src/forge/ground.ts` `PieceHull` requires an
owner, runtime polygons and a placement matrix, and `layoutGround` carries those
polygons into the placed frame. A reviewed adapter must resolve those fields,
unit conversion and the final contract before feeding either client or match.
Neither sidecar is directly consumable by those interfaces today.

## Reproduce and inspect

From this directory:

```text
python generate.py
python generate.py --check
```

Generation writes only this directory. `--check` writes nothing: it regenerates
in memory, repeats generation for determinism, decodes every GLB header/chunk and
accessor, checks alignment/bounds/finite floats/indices/material colors/source
positions, checks the expected URI and transform, checks hull winding/convexity/
edge closure/volume or the deliberate degeneracy, then compares all generated
files and inventory byte-for-byte. `.gitattributes` locally marks GLBs binary to
override the parent workspace's text normalization. No install or network is used.

These checks are structural preparation checks, not a full glTF validator,
Three loader run, unit/dev-disc test, rendered/browser check, physical playtest,
capture comparison or engine acceptance. Bad scale, nonfinite data, absent saved
asset identity and missing dependencies still need contract-specific test inputs.

## Acceptance owed after contracts and host window

- Exercise the existing guarded generic GLB loader with the valid files and the
  external-URI refusal; assert zero external requests.
- Adapt the neutral sidecars to the reviewed asset/collision contract. Test empty
  versus absent collision, degenerate hull and mirrored-transform refusals, plus
  scale/nonfinite/missing-asset validation supplied at the actual contract layer.
- Compare client and match hulls/digests under identity, translated and yawed
  placement; verify dimensions, normals and unit conversion together.
- Place, duplicate, undo, save/reopen, remove, and verify no orphan hull remains.
- Demonstrate normal-player movement/shots against the solid fixture in client
  and loopback simulation, and unhindered motion through the visual-only one.
- Perform the actual Blender export workflow, fresh review and FCW-09 rendered
  acceptance before describing the feature as complete.
