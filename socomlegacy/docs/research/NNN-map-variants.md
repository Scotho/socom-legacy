# NNN -- Map variants: Abandoned (Day) as SOCOM (USA)'s own day bake

- Date: 2026-11-23. Branch `agent/day-p1b` (worktree `wt-day-p1b`), base `agent/day-mode` f2b83b4d80. Task DAY-P1b of the
  day-mode plan (`socomlegacy/docs/plans/2026-11-23-day-mode.md`); simulation track (DAY.R1): what a match on the variant
  draws.
- What it is: **a browser adaptation, never presented as the original** (NXS.R4). SOCOM II has no time-of-day variants;
  Abandoned (Day) draws SOCOM II's MP5 with the colours, light, fog and textures SOCOM (USA) v3.00 ships for its own MP5.
- Level: see section 3. The SOCOM II side is **reading, pending review** (the disc through the repository's readers). The SOCOM (USA)
  side was read through the parked other-titles readers (DAY.R10, PROPOSED): until DAY.R10 is adopted it is **not yet a
  reading under AGENTS.md**; once adopted, **reading, pending review**. Nothing here is proven.
- Sources: the builder's output (`tools/variants/buildAbandonedDay.ts`, DAY-P1a, run 2026-11-23T02:47Z at f2b83b4d80,
  its `provenance.json` pinning every input by sha256), checked in under
  `packages/viewer/src/variants/data/MP5-day/`; a fresh `loadMap` of SOCOM II's `RUN/MP5.ZDB` (sha256 `91bc90d4...`, in
  `provenance.json`).

## 1. What a variant is

DAY.R2 (ADOPTED): a variant is the pair (stem, time) -- `MP5 day`, `MP64 day`, `MP6 night` -- one table in
`packages/archive/src/mapNames.ts`; a pair not in the table is refused by every reader, and the map keeps its stem. Its
picture is a `VariantProfile` (`packages/viewer/src/variants/profile.ts`) applied once to the decoded map at load by
`withVariant` (DAY.R3, PROPOSED): world vertex colours, the night flag, the light rig, the camera's fog fields, texture
swaps. The profile is keyed to the decoded world (DAY.R4, PROPOSED: `worldKey`, vertex count and FNV-1a 64 over the
positions); a mismatch draws the base map with a diagnostic.

## 2. Abandoned (Day)'s sources

- **SOCOM (USA) v3.00, MP5** ("SOCOM (USA): ABANDONED"): its world vertex colours, positions and normals, its map settings
  (`MP5.ZED`: `NightMission`, `GlobalLighting`, `ShadowVector`, `LensFX_NVG`, the camera record's fog) and its decoded
  textures, extracted once through the parked readers into the input directory the builder pins (`SOCOM1_MP5_DIR`,
  `tools/variants/README.md`, "The input"; DAY.R10).
- **SOCOM II, MP5**: the match's own load (`loadMap` with no options), whose `LoadedMap.world` order the pack follows.

## 3. The values, their sources and levels

"S1" below: read from SOCOM (USA)'s disc through the parked other-titles readers (DAY.R10, PROPOSED); not yet a reading
under AGENTS.md (reading, pending review, once DAY.R10 is adopted). The data file and field are the builder's copy;
`settings.json` gives each value's path in the input (`s1-MP5.json settings....`).

| value | profile field | source | level |
|---|---|---|---|
| key: 19,914 vertices, fnv64 `d5c216948504814f` | `key` | `key.json`: `worldKey` of SOCOM II's MP5 load | reading, pending review (SOCOM II's disc through the repository's readers) |
| night flag off | `night.mission` | `settings.json` `nightMission` (`MP5.ZED` `NightMission` u32 0) | S1 |
| lens none | `night.lens` | S1's `LensFX_NVG` on MP5 is 12 bytes, three floats (0.2, 0.9, 0.2): an RGB tint, where SOCOM II's is four (RGBA; `loadMap.ts` `nightOf` reads it at 16 bytes or more). The parked readers' `loadMap` gave S1's MP5 `night.lens` null, and with the night flag off night vision is never offered, so no lens is drawn: null | S1 (the 12 bytes); null is what the flag implies |
| light rig: key (0.96, 0.93, 0.86), fill (0.11, 0.11, 0.10), third (0.04, 0.04, 0.02), ambient (0.06, 0.06, 0.05), and the three directions | `lightRig` | `settings.json` `globalLighting` (`MP5.ZED` `GlobalLighting`) | S1 |
| fog colour (150, 155, 165), near 100, far 800, on | `camera.fogColor/Near/Far/Enabled` | `settings.json` `fogColor`, `fogNear`, `fogFar`, `fogEnabled` (the camera record) | S1 |
| altitude band on, top 10, bottom 5; directional off | `camera.fogAltitude/Top/Bottom/Directional` | `settings.json` `fogAltitude`, `fogTop`, `fogBottom`, `fogDirectional` | S1 |
| world vertex colours | `colours` (`pack.rgb8`) | section 4 | exact: S1; nearest and graded: the adaptation of section 5; sky: S1 (its `sky` prop's colour) |
| no part keeps its colours (IQ-143; was `sky01.tif`) | `keepTextures` | the sky takes S1's sky colour from the pack (section 4) | -- |
| prop vertex colours (IQ-143) | `propColours` (`props.rgb8`, `props-key.json`) | section 4a | matched: S1; graded: the adaptation of section 5; own: SOCOM II's own bytes |
| SOCOM II's `sun` prop hidden (IQ-143) | `hideProps: ['sun']` (`ABANDONED_DAY_HIDDEN_PROPS`) | SOCOM II's MP5 `sun` prop draws `moon.tif` on both parts (a fresh `loadMap`, `props` `modelName` `sun`; colours 0.29-0.50, vertex alpha to 1.0, facade 2, at (2141, 903, 2918)) | SOCOM II reading (the probe of IQ-143, `abandonedDay.test.ts`'s dev-disc case) |
| `ground01.tif`, `stone01.tif`, `sky01.tif`, `leafbig.tif`, `thai3r_palmfrond1.tif` | `textureSwaps` | S1's decoded RGBA8 under the same name, where SOCOM II's MP5 holds other pixels (the builder's `textures.json`, "changed"; sha256 there) | S1 |
| ~~`moon.tif` drawn as S1's `sun.tif`~~ | removed (IQ-143) | drawn on the moon's geometry and night colours it read as a dark disc in the owner's stills; the prop is hidden instead (above) | -- |
| no texture hidden, no parts added | `hideTextures`, `addParts` | -- | -- |

Not applied though read: S1's `nearPlane` 4 and `farPlane` 800 (`settings.json`): `VariantProfile.camera` sets only the
fog fields (`VARIANT_CAMERA_FIELDS`).

## 4. The pack: its rule and coverage

One RGB8 triple a `LoadedMap.world` vertex (19,914), in part order then vertex order (`profile.ts`, the pack layout),
byte = colour x 128. **The file is the builder's pack behind an 8-byte header**: ASCII `S2UV`, then the vertex count as
a little-endian u32 (19,914 = `CA 4D 00 00`), then the builder's 59,742 bytes unchanged; each texture file likewise is
the builder's RGBA8 behind a 12-byte header (`S2UV`, u32 width, u32 height). `abandonedDay.ts` (`unpackPack`,
`unpackTexture`) checks the magic and the count against `key.json` (the size against `textures.json`), refuses a
mismatch (no profile, the reason said) and hands `withVariant` the bytes after the header, so `colours.rgb8` keeps
DAY-2's raw layout. The header is a browser adaptation of the file format (nothing of either game): it makes the files
self-describing and binary to the leak check (`workflow/release/leakcheck.py` `is_binary`: a NUL in the first 8 KB),
which read the headerless pack's random colour bytes as text. Since IQ-143 the builder writes the headers itself
(`withHeader`), so its output files are the ones checked in, byte for byte (at DAY-P1b they were added by a scratch
script outside the repository). Per vertex (the builder's rule, `tools/variants/README.md`, "What it does"):

- **sky** -- a `sky01.tif` part: S1's sky colour, the one vertex colour of its `sky` prop (187 vertices, every one
  (1, 1, 1); `s1-MP5.render.json` `props` `sky`), byte 128: **648** (IQ-143; before it, the part kept SOCOM II's own
  colours, 0 at the rim to 0.25, which drew a near-black rim under S1's day `sky01.tif`).
- **exact** -- the S1 vertices within 0.01 in position and 0.02 in vertex normal agree on one colour (within one PS2
  byte, 1/128, a lane): that colour: **16,641** (0.8638 of the non-sky 19,266; 0.8356 of all). A match of SOCOM (USA)'s
  colours by rule.
- **nearest** -- several colours among the candidates: the one nearest the gap-fill grade's prediction: **1,553**.
- **graded** -- no candidate: the gap-fill grade's prediction: **1,072**.

**4a. The props pack (IQ-143).** One RGB8 triple a `LoadedMap.props` vertex (**7,117**: every entry, its parts in
order, their vertices in order; `props-key.json` fnv64 `c65b8d70b8427b83`, `key.ts` `propsKey` over the model-space
positions), behind the same 8-byte header. Per vertex, in the prop's own space (`buildPropsPack`): **matched** -- S1's
props of the same model name, ranked by how many of SOCOM II's entry's vertices each holds, then by the nearest first
placement, then by index; the first holding a vertex within 0.01 in position and 0.02 in normal gives its colour:
**2,168** (the ranking by geometry is the fresh review's F1: the four `a_bridge` entries of both discs stand at one
placement, and by distance alone 13 vertices of one piece took a neighbour piece's colour, up to 24 bytes); **graded** -- no match on an unlit part: the gap-fill grade
at its own colour: **160** (SOCOM II's `worldmodel` wall pieces, 102, no S1 prop of that name; the hidden `sun`, 58);
**own** -- no match on a lit part: its own byte: **4,789** (the turrets, 4,384, and the lit foliage's parts S1 splits
otherwise). The unlit props of the owner's stills: `a_bridge` 348 of 348 matched (mean RGB 0.087 -> 0.265, measured on the fresh load through `withVariant`),
`a_jungletree3` 662 of 662 (0.117 -> 0.377); `worldmodel`, graded, 0.061 -> 0.177. One SOCOM II entry is drawn three
times where S1 bakes the third tree on its own (S1's entry at (1040, 130, 715)): all three take one bake (the review's F2:
one vertex differs by one byte from S1's own third tree).

The study (`pack.mjs`, over the parked readers' per-node order) counted 20,016 vertices: exact 16,743, the rest equal.
The 102 fewer vertices of `LoadedMap.world` and the 102 fewer exact matches are consistent with those 102 being exact in
the study (inferred from the counts; not measured which vertices they are).

## 5. Adaptations

| name | rule | where |
|---|---|---|
| `ABANDONED_DAY_FILL_GRADE_ADAPTATION` | the gap-fill grade: a 33^3 RGB LUT in DAY-2's grade layout, fitted on the 16,641 exact pairs (SOCOM II colour -> S1 colour) by a trilinear splat (each pair adds its target to the eight lattice points around its input with the trilinear weights; a point's value is the weighted mean; 46 of 35,937 points reached), the rest filled pass by pass with the mean of their already-filled six neighbours (83 passes). It chooses among several S1 candidates (nearest) and colours the unmatched vertices (graded). Baked into `pack.rgb8`; the LUT itself (`grade.lut33`) is not carried | `packages/viewer/src/variants/abandonedDay.ts` (the label); the fit, `tools/variants/buildAbandonedDay.ts` `fitGrade` |
| `VARIANT_DATA_ADAPTATION` | the data is fetched only when a variant is asked for, and only where `VITE_S2U_VARIANT_DATA` is on (development builds: dev and the test room); off, no profile and no data emitted (reasoned, not measured on a build) | `packages/viewer/src/variants/profiles.ts` |

Both are outside the shared sim, so `tools/test/placeholderLedger.test.ts` asks no row of them (OT.R53); they are listed
here for the reader.

## 6. Known gaps

- ~~**Props keep their night colours.**~~ Closed by IQ-143's props pack (section 4a), but for SOCOM II's `worldmodel`
  wall pieces (no S1 prop of that name: the gap-fill grade).
- **No S1 sun.** S1's MP5 `sun` prop (`sun.tif`, a glow of vertex alpha at most 0.16, at (2641, 1313, 2918)) is not
  carried; SOCOM II's `sun` prop (the moon) is hidden. A later task, with the light rays.
- **No light rays.** S1's MP5 draws seven `lightrays.tif` world parts (the builder's `parts.json`); no geometry of them is
  carried, so neither is `lightrays.tif`.
- **No shadow vector.** DAY-2's `VariantProfile` has no field for it; S1's MP5 `ShadowVector` (-0.6337, -0.6337, -0.4436)
  (`settings.json` `shadowVector`) differs slightly from SOCOM II's, so the drop shadows keep SOCOM II's direction. A
  later task.
- **The sky dome is SOCOM II's.** S1's `sky` prop geometry is not carried; SOCOM II's dome is drawn with S1's `sky01.tif`
  and S1's sky colour (section 4); its vertex alpha (0 to 1, the rim's fade) stays SOCOM II's.
- **Clip planes** are SOCOM II's (section 3).
- **The page wiring.** `profileFor` is synchronous (DAY-3's registry contract) and answers only a profile already loaded
  by `loadVariantProfile`; the test room's and the xbox-renderer page's call sites (`main.ts` `show`,
  `xboxPrototype/main.ts`) must await `loadVariantProfile(stem, variant)` before `testroomVariant` for the switch to show
  the variant. Not in DAY-P1b's files.

## 6a. CREATE GAME's variant row (DAY-4; simulation track)

The owner's departure (NXS.R4, OT.R139; accepted for Abandoned (Day) 2026-11-24, OT.R150), labelled as such: the
original has no variant rows. What the change keeps of the original, each **reading** (re-read by DAY-4's fresh
reviewer, 2026-11-24):

| what | source | how held |
|---|---|---|
| a row is `[number, name]`: the record's int at +0x10, then its name string | `FUN_00274940` D:L121538-121547 | unit test (`createGameCommands.test.ts`) |
| with RESPAWN on, only records of type 5 (SUPPRESSION) are listed; the variant row inherits its map's filter | `FUN_00274940` D:L121528-121530 | unit test |
| a row is listed only when its archive is present (`FUN_002c94f0`) | D:L121535 | unit test |
| MP5's disc name plus the table's word is `ABANDONED (DAY)`; the row follows `ABANDONED` | `missionlist.rdr` (`RUN/READERC.ZAR`) | dev-disc test |
| the disc's `dlgCreateGame` set moves the row to SELECTED MAPS and keeps its name in PLAYLISTVAR; CREATE sends `variants: [1]` | `dlgCreateGame.rdr` (`RUN/UIZANIM.ZAR`), `add_a_mission`, `accept_play_list` | dev-disc test |

GameStats bytes and `playListNumbers` are unchanged; the variant travels as additive play-list positions (DAY.R5). The
row is opt-in (`variantOffered`): accepted variants by default, every variant under the server's all-maps word (DAY.R7).

## 7. What would raise it to proven

A capture of SOCOM (USA)'s MP5 running on PCSX2 at fixed cameras (the Shadow idle queue's IQ-024), compared with the
variant drawn at the same cameras: the world colours, fog and light within a stated tolerance. Until then the S1 values
stand at the level of section 3, and the stills of the variant are rendered browser runs, not captures.

## The record layouts (seat-kill's review, F4)

The settings are read with SOCOM II's own record readers (`parseCameraParams`, `parseGlobalLighting`): the records'
sizes match on SOCOM (USA)'s MP5 (144 and 112 bytes) and the values read as plausible, but nothing proves SOCOM (USA)
lays the fields out at the same offsets, and its fog colour floats are not exact n/255 (e.g. 0.5883), as SOCOM II's are.
Until a capture or a read of SOCOM (USA)'s loader settles the layout, treat the field mapping as inferred.

## 8. Rat's Nest (Day) (DAY-RN1; simulation track; not accepted)

- Date: 2026-11-24. Branch `agent/day-rn1` (base `agent/day-mode` c10c29bbc7), on the owner's word (~17:52Z: "prepare
  the day version the same way we did abandoned"). The same pipeline as Abandoned (Day): the builder per stem
  (`buildAbandonedDay.ts --stem MP8`, DAY-RN1 B2, product track) and the profile `packages/viewer/src/variants/
  ratsNestDay.ts` (B3, this section). **A browser adaptation, never presented as the original.**
- **Not accepted, and its data is not in git**: `MAP_VARIANTS` (8, 'day') is `accepted: false`; the owner's exception
  (H490/H491, OT.R155) names MP5-day's data only, so MP8-day's files are built locally and copied untracked into
  `src/variants/data/MP8-day/` (git-ignored there) until he names them from stills. The profile's tests run on a
  synthetic data set (`ratsNestDay.test.ts`); its real-data case skips without the files.
- Sources: SOCOM (USA) v3.00's MP8 ("SOCOM (USA): RAT'S NEST"), the study's five-file package (pinned in
  `DAY_STEMS.MP8.inputs`; DAY.R10 as section 2); SOCOM II's `RUN/MP8.ZDB` (sha256 `677c9bd6d37cffd6...`) through a fresh
  `loadMap`. Levels as section 3: "S1" not yet a reading under AGENTS.md (DAY.R10, PROPOSED); SOCOM II's side reading,
  pending review.

| value | profile field | source | level |
|---|---|---|---|
| key: 52,203 vertices, fnv64 `106ade07deacd2cc` | `key` | `key.json`: `worldKey` of SOCOM II's MP8 load | reading, pending review |
| night flag off; lens none | `night` | `settings.json` `nightMission` (false) | S1 |
| light rig: key (0.94, 0.94, 0.94), second off, third (0.02, 0.02, 0.08), ambient (0.31, 0.31, 0.31) | `lightRig` | `settings.json` `globalLighting` | S1 |
| fog (17, 18, 23), near 500, far 599, on; directional on, altitude off, top 800, bottom 500 | `camera` | `settings.json` fog fields | S1 |
| world vertex colours: exact 36,800 (0.7085 of non-sky), nearest 10,816, graded 4,323 | `colours` (`pack.rgb8`) | section 4's rule (`tools/variants/README.md`, MP8) | exact: S1; nearest, graded: section 5's grade, fitted on MP8's own exact pairs |
| sky: SOCOM II's 264 `gen_cloudy_blue_sky.tif` vertices take 1.0 | `colours` | S1's `sky` prop is not one colour (0.40 / 0.54 / 0.70 / 1.0); the builder's `'mode'` rule takes the colour on most of its vertices (110 of 163) | S1 (the colours); the rule is an adaptation |
| prop colours: 1,005 `lightbulb` vertices, 319 matched, 686 graded | `propColours` | section 4a's rule | as section 3 |
| `cratewood1.tif`, `ground.tif`, `rockwall2.tif` | `textureSwaps` | S1's decoded RGBA8 under the same name, where SOCOM II's MP8 holds other pixels (`textures.json`, "changed") | S1 |
| ~~no sky texture swap~~ (replaced by the sky swap, 8.1): **the day sky was SOCOM II's own night dome, minus its stars** (B3 review F2) | -- | the dome's visible vertices are already 0.977 in SOCOM II, so the pack's 1.0 moves them by 3 in 128, and its 36 black rim vertices carry vertex alpha 0 (invisible); what shows is SOCOM II's `gen_cloudy_blue_sky.tif` (mean RGBA 125, 125, 154, 16) as at night. SOCOM II's dome texture `gen_cloudy_blue_sky.tif` (256 x 256, alpha below 128 on every texel) has no namesake in S1's MP8, whose dome is its `sky` prop over `gen_sky_top.tif`, `gen_sky_base.tif`, `gen_cloud_n_sun_256x256.tif` (carried by the builder, unread by the profile) | -- |
| `star.tif` world parts dropped | `hideTextures: ['star.tif']` | SOCOM II's MP8 draws 172 vertices of `star.tif` world parts, unfogged (the study's SOCOM II render set; S1's MP8 has no `star.tif`): night stars, dropped by day as MP5's moon prop is | SOCOM II reading (re-read by B3's reviewer) |
| no prop hidden | `hideProps: []` | SOCOM II's MP8 props are its 24 `lightbulb` entries (no sun or moon prop) | SOCOM II reading (re-read by B3's reviewer) |

**A risk for the owner's stills, read off the inputs:** S1's MP8 is lit, but its own sky textures are dark
(`gen_sky_base.tif` mean RGB 40, 40, 56; `gen_sky_top.tif` 80, 96, 120), its fog is near-black and closes by 599, just
inside its far plane of 600 (not applied: the clip planes stay SOCOM II's, far 720). Drawn so, the variant may read as
dusk rather than day. That is SOCOM (USA)'s own map; anything brighter would be the owner's preference, recorded as
his, not the original's (the parity rule). **Two choices the original does not settle, for the owner beside the stills**:
the sky (SOCOM II's own dome as above, or SOCOM (USA)'s `sky` prop drawn as an added dome -- its three textures are
already carried by the builder; `VariantProfile.addParts` would take it) and the dusk itself.

Known gaps as section 6 (no S1 sky dome, no shadow vector), plus (B3 review F4): S1's MP8 `ShadowVector` (0.13, -0.97,
0.22) is not carried; SOCOM II's `cavewall.tif` (10,336 vertices, the largest textured group) has no namesake in S1,
whose MP8 uses `cavewall1.tif` (256 x 256, near-identical mean colour, other bytes), so the same-name rule neither
compares nor swaps it; S1's `rockwallsnow.tif` world parts (904 vertices) and its 19 `oldtruck` props have no SOCOM II
counterpart. The `star.tif` and props rows were re-read at the source by B3's fresh reviewer (2026-11-24): readings.

### 8.1 Placeholders: the day sky (DAY-RN1 sky swap; a browser adaptation, not a reading)

SOCOM II's MP8 dome texture `gen_cloudy_blue_sky.tif` is its night sky. With it in place, the day variant drew a dark
dome (the owner's stills). The builder now writes another SOCOM II map's sky texture under that name. The texture is
read through `loadMap`'s `textures` and copied at its native size. The profile swaps it in (`textureSwaps`). **Nothing
in the original settles which sky**: SOCOM II has no daytime Rat's Nest. So the choice is an art choice of the browser
adaptation, a product-track preference recorded for the owner. It is not a reading of the original. The texture's
pixels are SOCOM II's own, decoded by the repository's reader. The dev-disc test compares them byte for byte.

| name | value | status / what settles it |
|---|---|---|
| `RATS_NEST_DAY_SKY_CHOICE_PLACEHOLDER` (`packages/viewer/src/variants/ratsNestDay.ts`) | `RUN/MP2.ZDB` `cuba1a_sky01.tif` drawn as `gen_cloudy_blue_sky.tif` | settled 2026-11-25 by the owner's pick from the sheet `next-sprint/day-stills/sky-sheet-ratsnest` (MISSION OT.R158, verbatim: "rats nest day: accepted, using 5. Sky MP2, foc current[17,18,23] option"): MP2's sky; the fog unchanged (`settings.json`'s `fogColor` [17, 18, 23]). It replaced the candidate built before the pick, `RUN/MP82.ZDB` `mp82_skycap.tif` (128 x 128); the other candidates were MP81 `clouds.tif` and MP10 `m19_skycap01.tif`. An art choice, not a reading: the name keeps its `_PLACEHOLDER` suffix as the ledger lists it |
