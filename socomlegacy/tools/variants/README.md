# tools/variants -- map variant builders

**A browser adaptation, product track** (the day-mode plan, `socomlegacy/docs/plans/2026-11-23-day-mode.md`, DAY.R1). The
original SOCOM II has no time-of-day variants; these tools write, outside the repository, the data a variant profile
(`packages/viewer/src/variants/profile.ts`) would carry. What a match draws with that data is DAY-P1b's, on the
simulation track, with its own review and research note. Nothing here changes what the game does.

## `buildAbandonedDay.ts` (DAY-P1a): Abandoned (Day)

```
SOCOM_DISC=<SOCOM II disc tree> SOCOM1_MP5_DIR=<input dir> npx tsx tools/variants/buildAbandonedDay.ts [--out <dir>]
```

From `socomlegacy/`. `--out` defaults to `<OS temp>/redotcom-variants/MP5-day`; a directory inside the repository is
refused (the outputs are DAY-P1b's to check in, under DAY.R9, and never before). The test is
`tools/test/variantsAbandonedDay.test.ts` (dev-disc: skipped, and said so, without `SOCOM_DISC` or `SOCOM1_MP5_DIR`).

### A change to the brief (decided by the day lane's seat, 2026-11-22)

The plan's brief reads SOCOM (USA)'s MP5 "through the repository's readers" from a `SOCOM1_ISO`. Those readers
(`looseMapSource.ts`, `looseMapAsZdb.ts` and their helpers, about 1,700 lines) exist only on the parked branch
`origin/agent/xs-seat`, not on `agent/next`, and bringing them in is out of DAY-P1a's scope. So the builder takes the
SOCOM 1 side as an **input directory**, extracted once by the day-mode study through those parked readers, and pins
every file of it by sha256 (`S1_INPUT_SHA256`; a changed file is refused). The environment variable is
`SOCOM1_MP5_DIR`, not `SOCOM1_ISO`. **Re-producing the input needs the parked readers.**

### The input (`SOCOM1_MP5_DIR`)

Produced on the owner's hub by the study's scripts (`D:/s2u-scratch/s1-light-2026-11-22/scripts/`: `dump.mts`,
`dump2.mts`, `dump3.mts --render`), run with tsx against the parked readers imported from a worktree of `agent/xs-view`
at `ea7458da5f`, over the SOCOM (USA) v3.00 disc image. Today it is `D:/s2u-scratch/s1-light-2026-11-22/out/` on that
host. Every file is SOCOM (USA)'s MP5 ("SOCOM (USA): ABANDONED"):

| file (relative) | written by | what | sha256 |
|---|---|---|---|
| `s1-MP5.world-verts.f32` | `dump.mts` | 6 f32 a vertex: world x y z, then r g b (1.0 = the PS2's byte 128, unclamped); 18,955 vertices, per-node order (`placeInstances(geo, 'worldmodel')` facade 0, chunks, meshes) | `9b65fb56f75171eca47c05198430c4a06be9ff2f04c21603d012e48c65c193e3` |
| `s1-MP5.world-attrs.f32` | `dump.mts` | 5 f32 a vertex: the vertex normal carried by the placement's 3x3 (as `loadMap.ts` `placeMesh` rotates it; not renormalised), then u v | `24bbc907391572a2c5e30979ab7f26457a65116ee0ab399e946299124e351f15` |
| `s1-MP5.world-tex.u16` | `dump2.mts` | a vertex's texture, an index into `s1-MP5.geom.json` `textures` | `d2b22b7d44cd890d6da5ac44e85c92fa0accd98bc2ce7398125ae3d6b7b50d24` |
| `s1-MP5.world-flags.u8` | `dump2.mts` | bit 0 fogged, bit 1 vertex alpha below unity, bit 2 alpha pass (pinned; not used by the rule) | `a9d57d327aee3725e0fab08a4971fe6a8b5a0bf08272c0c5462a55d60170b615` |
| `s1-MP5.world-idx.u32` | `dump2.mts` | triangle indices into the same order (pinned; not used: the rule takes vertex normals, not face normals) | `dac36cdbfc884f4ea68e1ee04dffaa9c20fb47a4badaa06d45e229c67c8fef3f` |
| `s1-MP5.geom.json` | `dump2.mts` | the vertex count and the texture list `world-tex.u16` indexes | `af664a9f7ac633046313945935a6fdfbbe98bbbf5ce1888a4b30c84dfe4062cb` |
| `s1-MP5.json` | `dump.mts` | the map's settings as the readers decode them: `settings.camera` (fog), `settings.globalLighting`, `settings.worldRoot` (`shadowVector`, `nightMission`) | `e54202d5807a5d61584e8c4c77f734078863da805a5605277b9730d69234f059` |
| `day-mode/dumps/s1-MP5.render.json` | `dump3.mts --render` | `loadMap`'s world parts, props and the textures they draw (offsets into the `.bin`) | `c2b8c6365f8b60ef00b537e9cef9c730b16bf90bc4063127969dbfeebf36139f` |
| `day-mode/dumps/s1-MP5.render.bin` | `dump3.mts --render` | those arrays; each texture as decoded RGBA8 | `660c3c80fc43440c0f879cd446e8a580b88eaf54fc487720a6f5a66f7199c30e` |

`s1-MP5.world-verts.f32` and `-attrs.f32` are byte-identical to `day-mode/dumps/s1-MP5.pn.f32` and `.pn-attrs.f32`, the
files the study's `pack.mjs` read.

### What it does

SOCOM II's MP5 is a fresh `loadMap(FsAssetSource(SOCOM_DISC), 'RUN/MP5.ZDB')` with no `LoadMapOptions` (DAY.R4: the
match's own load). For each `LoadedMap.world` vertex, in part order then vertex order (the pack layout, `profile.ts`):

- **sky** (IQ-143): a part textured `sky01.tif` takes SOCOM 1's sky colour -- the vertex colour of its `sky` prop
  (`s1-MP5.render.json` `props`, 187 vertices), one colour on every vertex (checked; the build is refused otherwise):
  1.0 on each lane, byte 128. Not a match by position: the two domes differ (SOCOM 1's is a prop, SOCOM II's thirteen
  world parts). Before IQ-143 the part kept SOCOM II's own colours (0 at the rim to 0.25), the study's choice, which
  under SOCOM 1's day `sky01.tif` drew a near-black rim in the owner's stills. The profile lists no `keepTextures`.
- **exact**: the SOCOM 1 vertices within 0.01 in position and 0.02 in normal (both Euclidean; the study's `pack.mjs`
  `EPS`, `N_EPS`) are the candidates; if every candidate is within one PS2 byte (1/128) of the first on each lane (the
  study's test of "one colour"), the first's colour (the lowest SOCOM 1 index: the study's grid order, made
  deterministic).
- **nearest**: several colours -> the candidate nearest (Euclidean RGB) the gap-fill grade's prediction at the vertex's
  own colour; a tie goes to the lowest index.
- **graded**: no candidate -> the gap-fill grade's prediction.

**`ABANDONED_DAY_FILL_GRADE_ADAPTATION`** (named here only; the constant is DAY-P1b's): a 33^3 LUT in DAY-2's layout
(`profile.ts`: red fastest, domain 0..2 in PS2 units, output byte / 128), fitted on the exact pairs (SOCOM II colour ->
SOCOM 1 colour): each pair adds its target to the eight lattice points around its input with the trilinear weights, and
a reached point's value is the weighted mean; every point no pair reached is then filled pass by pass with the mean of
its already-filled six neighbours (a pass reads only the points filled before it). Sampled with `withVariant.ts`
`gradeSample`, as a profile would. An adaptation: the study's own grade (`grades.json`, a 16^3 LUT in a sqrt domain) is
not this one, so the nearest/graded colours differ from the study's pack while the exact ones agree.

### The outputs (`--out`)

**The props pack** (IQ-143; `buildPropsPack`): one RGB8 triple a SOCOM II prop vertex, `LoadedMap.props` order, each
entry's parts in order, each part's vertices in order, keyed by `propsKey` (the world key's count and FNV-1a 64 over the
props' model-space positions). Per vertex, in the prop's own space: **matched** -- SOCOM 1's props of the same model
name are the candidates, ranked by how many of SOCOM II's entry's vertices each holds (the review's F1: the four
`a_bridge` entries stand at one placement), then by the nearest first placement, then by index; the
first candidate holding a vertex within 0.01 in position and 0.02 in normal gives its colour; **graded** -- no match on
an unlit part (a night bake): the gap-fill grade at its own colour; **own** -- no match on a lit part (the light rig
carries the night there): its own byte. The owner's stills showed the unlit `a_bridge` and `a_jungletree3` props black
and dark: both match in full (348 of 348, 662 of 662 vertices).

**The headers** (IQ-143): the binaries checked in -- `pack.rgb8`, `props.rgb8` and each `textures/<name>.rgba` -- are
written behind an `S2UV` header (ASCII magic, then little-endian u32s: the vertex count for a pack, width and height
for a texture), the layout `packages/viewer/src/variants/abandonedDay.ts` reads (`unpackPack`, `unpackTexture`). So the
builder's output files are the check-in, byte for byte; `grade.lut33` stays headerless (not checked in). The check-in is a subset: `grade.lut33`, `coverage.json`,
`parts.json`, `textures/lightrays.tif.rgba` and `textures/sun.tif.rgba` stay out (no profile reads them), while
`textures.json` keeps its rows for those two textures (the builder's list, unread by the profile).

| file | what |
|---|---|
| `pack.rgb8` | the `S2UV` header (8 bytes), then 3 bytes a world vertex, the stored byte (colour x 128) |
| `props.rgb8`, `props-key.json` | the `S2UV` header (8 bytes), then 3 bytes a prop vertex; `propsKey` of the load (IQ-143) |
| `grade.lut33` | the gap-fill grade, 3 x 33^3 bytes |
| `key.json` | `worldKey` of the load (DAY.R4) |
| `settings.json` | SOCOM 1's MP5 values from `s1-MP5.json`, each `{ value, source }` with its field path |
| `coverage.json` | sky / exact / nearest / graded counts, shares of every vertex and of the non-sky ones, the sky colour and its source, the rule, normal lengths, the grade's fit, the props pack's counts by model, the study's counts |
| `textures/<name>.rgba`, `textures.json` | the `S2UV` header (12 bytes), then SOCOM 1's decoded RGBA8 from the render set: every texture whose name SOCOM II's MP5 also has with other pixels, and the SOCOM 1 only ones the sky and sun props or the light-ray parts draw; width, height, bytes, sha256, why |
| `parts.json` | sizes only of SOCOM 1's light-ray world parts and its sky and sun props (no geometry carried) |
| `provenance.json` | every input's sha256, `RUN/MP5.ZDB`'s, the base commit, the run's date |

Deterministic: every output but `provenance.json` (which holds the run's date) is byte-identical across runs and
whether the caller hands in its own fresh load or the builder loads MP5 itself.

### Measured (the GREEN run, 2026-11-22, base `c93419c811`)

`LoadedMap.world` holds **19,914** vertices (key `d5c216948504814f`), not the study's 20,016 (`dump3.mts` per-node
order): 102 fewer, and the exact count is 102 under the study's (16,641 against 16,743) while nearest (1,553), graded
(1,072) and kept (648) equal it -- consistent with the 102 being exact matches in the study (inferred from the
counts; which vertices they are is not measured). Exact:
0.8638 of the non-kept vertices (0.8356 of all). SOCOM 1: 18,955 vertices, none textured `sky01.tif`. Normal lengths run
0..0.99999 on both sides (zero normals exist; they match only a zero normal).

## `buildAbandonedDay.ts --stem MP8` (DAY-RN1 B2): Rat's Nest (Day)

```
SOCOM_DISC=<SOCOM II disc tree> SOCOM1_MP8_DIR=<input dir> npx tsx tools/variants/buildAbandonedDay.ts --stem MP8 [--out <dir>]
```

On the owner's word (2026-11-24 ~17:52Z: "prepare the day version the same way we did abandoned"). The same builder,
per stem (`DAY_STEMS`): MP5 runs as it did (every pin, rule and output string unchanged; `buildAbandonedDay` is
`buildDayVariant('MP5', ...)`), and MP8 beside it. **Its output stays outside the repository**: the owner's exception
(H490/H491, OT.R155) names Abandoned (Day)'s MP5-day data only, so MP8-day's data is built locally and never
committed until he names it from stills (seat-merge's condition on the DAY-RN1 claim). The tests are
`tools/test/variantsDayStems.test.ts` (no disc) and `tools/test/variantsRatsNestDay.test.ts` (dev disc; skipped, and
said so, without `SOCOM_DISC` or `SOCOM1_MP8_DIR`).

**The input** (`SOCOM1_MP8_DIR`): SOCOM (USA) v3.00's MP8 ("SOCOM (USA): RAT'S NEST") as the same study wrote it on
the owner's hub (`dump.mts`, `dump3.mts --render`), five files, each pinned (`DAY_STEMS.MP8.inputs`):
`s1-MP8.world-verts.f32`, `s1-MP8.world-attrs.f32` (layouts as MP5's), `s1-MP8.json`, `dumps/s1-MP8.render.json`,
`dumps/s1-MP8.render.bin`. There is no per-vertex texture file (`dump2.mts` was not run for MP8): SOCOM 1's world is
checked for a sky part through the render set's world parts instead (the same 52,640 vertices in another order; none
is a sky part, so none is left out, and a build that finds one is refused).

**Two differences from MP5, both browser adaptations:**
- **the sky**: SOCOM II's MP8 draws its dome as world parts textured `gen_cloudy_blue_sky.tif` (264 vertices, colours
  0 at the rim to 0.977); SOCOM 1's is its `sky` prop (163 vertices over three textures), which is **not one colour**
  (0.40, 0.54, 0.70 and 1.0). The rule `'mode'`: the colour on most of the prop's vertices (a PS2 byte counts as one
  colour), 1.0 on 110 of 163 (0.675) -- as MP5's 1.0. MP5 keeps `'one'` (refused unless one colour).
- **no light rays**: SOCOM 1's MP8 has no light-ray part; the sky prop's three textures are carried as MP5's are.

**The sky swap (a browser adaptation's art choice; the owner's pick, MISSION OT.R158).** SOCOM II's MP8 dome texture
`gen_cloudy_blue_sky.tif` is its night sky. The builder writes another SOCOM II map's sky texture as
`textures/gen_cloudy_blue_sky.tif.rgba` with a `textures.json` row (why "sky swap: ..."; the source ZDB's sha256 is in
`provenance.json` `skySwap`), and the profile draws it under that name. The pick is the one constant
`RATS_NEST_DAY_SKY_CHOICE_PLACEHOLDER` (`packages/viewer/src/variants/ratsNestDay.ts`; `DAY_STEMS.MP8.skySwap`). The
pick is MP2's `cuba1a_sky01.tif`, read through `loadMap(FsAssetSource(SOCOM_DISC), 'RUN/MP2.ZDB')` `textures` and copied
at its native size; a missing texture is refused by name. 2026-11-25: the owner's word (MISSION OT.R158, verbatim: "rats
nest day: accepted, using 5. Sky MP2, foc current[17,18,23] option") replaced the candidate built before it, MP82's
`mp82_skycap.tif` (128 x 128), picked from the sheet `next-sprint/day-stills/sky-sheet-ratsnest`; the fog stays
`settings.json`'s. Changing the pick is one line, then a rebuild. MP5 has no sky swap: its output is unchanged.

### Measured (PC 5, 2026-11-24, base `17546a885c`; reading the study's package)

`LoadedMap.world` holds **52,203** vertices (key `106ade07deacd2cc`); SOCOM 1: 52,640. Exact **0.7085** of the
non-sky vertices (36,800), nearest 0.2082 (10,816), graded 0.0832 (4,323), sky 264 -- lower than MP5's 0.8638, as
the study measured (72% one colour by position). The grade fits on 36,800 pairs but reaches only 299 of 35,937
lattice points (the night palette is narrow); the rest are filled in 50 passes. Props: 1,005 `lightbulb` vertices,
319 matched, 686 graded. Textures carried: three that SOCOM II's MP8 also has with other pixels (`cratewood1.tif`,
`ground.tif`, `rockwall2.tif`) and the sky prop's three.

**For the owner's stills (a risk, not a finding against the build):** SOCOM 1's MP8 is a lit map (night off; key 0.94,
ambient 0.31) but its own sky textures are dark (`gen_sky_base.tif` mean RGB 40,40,56; `gen_sky_top.tif` 80,96,120)
and its fog is near-black (17,18,23) from 500 to 599 -- read off the study's package. Drawn as SOCOM 1 draws it, Rat's
Nest (Day) may read as dusk; whether that is the day the owner wants is his call from the stills.
