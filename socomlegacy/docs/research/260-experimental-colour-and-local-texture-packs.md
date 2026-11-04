# 260 -- Experimental colour and optional local texture packs

By Craig's dot, 2026-10-08. Base: web e50e086a0c2926a37904235446c1944ae301ab26.

**Confidence: browser adaptation, source inspection, synthetic/committed-fixture unit tests and offline shader tests;
no console reading, GPU appearance claim or performance claim.** Craig authorized continuing
the optional graphics experiment and local asset upscaling on 2026-10-08; the merge controller
accepted build ownership for dot and integration ownership for itself at 22:48 UTC. This continues
the test-room exception recorded in HUMAN_TASKS H135. These are chosen picture experiments,
not replacements for original asset data or changes to gameplay.

## 1. First slice: optional colour controls

The controls mount only in the existing Experimental panel on /testroom. No new persistence,
asset input, downloads, HUD pass, menu-match UI or front-end UI is introduced. The base's approved
defaults are kept, including mip bias enabled at -1, detail adjustment enabled at strength 1.5
and distance 2 (the owner's defaults since 2026-10-11 are strength 0.55 and distance 1.60, section 11), and character lighting enabled at ambient 0.8 and directional 1.25. All three
new groups start OFF with neutral values; Reset restores them to neutral/off.

The formulas below are hand-picked browser adaptations implemented in
`packages/viewer/src/experimentalColour.ts` and `experimentalPass.ts`; they are not values read
from SOCOM II. The existing GS display-value convention stays unchanged, with no sRGB conversion.

| Group | Controls and chosen range | Operation |
|---|---|---|
| Warmth and tint | warmth w and tint t, each -1 to 1; both initially 0 | RGB gains: 2^((w+t)/4), 2^(-t/4), 2^((t-w)/4). Positive w is warmer; positive t is magenta. This is not calibrated Kelvin white balance. |
| Shadow / highlight balance | each -1 to 1 stop, initially 0 | For display luma y clamped to [0,1], shadow weight is 1-smoothstep(0,0.5,y); highlight weight is smoothstep(0.5,1,y). Multiply RGB by 2^(shadowWeight*shadows + highlightWeight*highlights). Both weights are zero at middle grey. Black remains black. |
| Bloom colour | red/green/blue gains 0 to 2, initially 1 | Multiply only the existing bloom contribution before addition to the world. Requires Soft bloom and positive bloom strength. Extraction threshold and blur are unchanged. |

Order: existing sharpening, tinted bloom addition, existing exposure/saturation/contrast,
optional warmth/tint, optional tonal balance, optional existing highlight roll-off, final clamp.
This can clip bright output or shift its brightness; it cannot recover already clipped source detail.
Bloom, including its tint, still pauses during gameplay flash glow. Other explicitly enabled picture
adjustments continue as they did before; this is not a claim of original appearance while effects are on.

## 2. Off means the previous graph

`experimentalPostVariant` chooses a small graph key from four feature bits (including the existing
roll-off). A new group contributes no bit when disabled or exactly neutral. Bloom tint contributes
no bit without active bloom. The global bypass selects no experiment pass, as before.

The renderer's existing lazy experiment resources cache variants by this key. Returning to an earlier
key reuses its materials; moving a non-neutral slider updates uniforms without creating another key.
There are at most 16 keys, each with the existing with-bloom/without-bloom pair. This may add cached
materials and first-use shader compilation; it adds no render target, draw, or texture sample.
The existing renderer disposal owns all cached screen materials. No ordinary world/body graph changed.

The with/without-bloom shader pair matters during flash glow: even an active tint variant's world-only
pass has no bloom texture or tint binding. The original flash buffer lifetimes remain unchanged.

## 3. Verification and limits

The baseline in `test/experimentalColourOriginal.json` was generated from git-show of the pinned
base's own `src/experimentalPass.ts`, using `experimentalPostFixture.ts`. It covers both shader stages,
GLSL/WGSL, bloom present/absent and roll-off on/off: eight hashes. Identifier normalization in the
shared fixture matches nothing in these unskinned post shaders. These are generated shader sources,
not executed GPU images.

Focused regressions cover the eight old shaders with new options off, each optional graph, all 16
combinations on both backends, unchanged texture-sample counts, numeric colour gains, neutral keys,
UI defaults/Reset/A-B behavior, isolated effect activation, cached bypass and flash bloom suppression.
Existing world/rig baseline, highlight, resolution and resource-lifetime regressions remain in the set.
Focused note checks passed 134/134 (conventions 105, placeholder ledger 13, docs 16).
Reproduce those checks from `socomlegacy/tools` with:

```sh
node ../../node_modules/vitest/vitest.mjs run --config vitest.config.ts --maxWorkers=1 test/conventions.test.ts test/placeholderLedger.test.ts test/docs.test.ts
```

Viewer typechecking is `node node_modules/typescript/bin/tsc --noEmit -p
socomlegacy/packages/viewer/tsconfig.json --incremental false` from the repository root. No
failing-first or graphics-test count is asserted from a private artifact.

No browser/GPU assessment or full landing gate is claimed here. The controller owns its window,
fresh review and integration gate. The local preview is a playtest surface; HTTP availability or
DOM controls tests do not establish rendered appearance, VRAM use, load cost or frame rate.

## 4. Local 2x texture pack: implemented plumbing, processing still owed

The controller accepted this bounded slice on 2026-10-08 at 23:23 UTC. The generator, manifest,
publisher, loader and checkbox are implemented. **No real MP51 pack source has been decoded or
upscaled, no pack has been published, and no browser/GPU validation has run.** Missing pack data
keeps the originals. The processing window remains the controller's to assign after the queued gates.

`tools/writeLocalTexturePack.ts` accepts a local MP51.ZDB and an explicit comma-separated list of
at most four texture keys. Even `--dry-run` reads and decodes selected disc data and needs that window.
The actual ground/wall keys have not been selected or classified against the map yet. The generator
uses repository archive/texture readers through `src/mapTextures.ts`, extracted without changing the
ordinary map-loading semantics. It resolves each texture's original library and authored mip addresses.
It refuses non-opaque sources, any non-255 alpha, invalid/incomplete mip chains and source edges over
512 pixels. The runtime additionally limits eligible names to MP51 world bases and excludes names
shared with props, characters, weapons, grenade models, detail layers, environment maps or lines;
sky, scrolling, reflective and transparent world draws are excluded too. This is a conservative role
filter, not a claim that every eligible name has been visually classified as ground or wall.

`tools/localTexturePack.ts` performs a local, dependency-free, separable Lanczos3 resample at exactly
2x per axis, preserving each authored level's index. Repeat/clamp edge treatment follows the source
flags. RGB is filtered in premultiplied-alpha form; the first pack only admits opaque textures.
Missing tail mips after the last authored level are generated without shifting authored indices.
The method can ring around contrast edges; it does not reconstruct original fine detail. No model
weights, downloads or remote service are involved, and source pixels are never modified.

Output is raw RGBA plus a content-addressed manifest beneath the ignored
`socomlegacy/public/experimental-packs/mp51/`. Four entries, 1024-pixel replacement edges, 6 MiB per
entry and 24 MiB total are hard caps. The manifest records the source archive hash/size, map ID,
tool commit and source-code digest, source library/record, each decoded source level's hash and
dimensions, source flags, output hashes/offsets/dimensions, authored mip associations, method, scale
and local-only status. It contains no absolute source path. The archive hash is provenance; runtime
compatibility is checked against the actual decoded source pixels, level dimensions and flags.

Publication refuses symlink/junction output ancestors and an existing immutable pack directory.
It writes a unique staging directory, publishes the complete pack, then replaces `current.json`.
A failed publication may leave an ignored, unselected staging directory; it never points the loader
at an incomplete pack. No generated pack bytes belong in a commit or upload.

`LocalTexturePacks` mounts only in the test room, and is enabled only by the selected Experimental
view, global effects switch and Local upscaled textures checkbox (ON by default within the Experimental view since
GX.R8, section 9). OFF makes no pack request. Pointer,
manifest and payload responses are bounded while streaming; redirects, arbitrary filenames, remote
paths, invalid hashes/dimensions/layouts and changed source semantics are refused. Every output
alpha must remain 255. Invalid or missing entries fall back independently. Generation tokens and
abort signals reject late responses after OFF, a new map, page departure or world disposal.

The target reuses the original DataTexture objects and material users, retaining the original image
and mip references for exact restoration. Sampler flags, wrap, colour convention and alpha/blend
rules stay unchanged. A size-changing swap disposes the old GPU allocation before marking the new
image for upload; the behavior of that recreation on both WebGL and WebGPU is **not yet validated**.
CPU payload bytes are bounded; calculated texel bytes are not a driver VRAM measurement. At 2x,
each replaced level has four times its original texels, with original CPU pixels retained for A/B.

The synthetic tests use tiny fabricated images and archive records only. They cover first-library
resolution, authored mip addresses, deterministic resampling and provenance, alpha/wrap behavior,
manifest and streaming limits, source/output mismatch, partial fallback, OFF with zero I/O, exact
object restoration, late responses, map/disposal lifecycle and atomic local publication.

The generator reports read/decode/generate/write timings, payload bytes and process RSS. Actual
asset selection, generation, loading cost, on/off frame cost and both-backend resource behavior are
owed in the controller's window. If driver VRAM cannot be measured, report that limitation and a
separate calculated allocation estimate. A preview that reads maps through another tree's public
directory must also serve this tree's own ignored pack directory before testing the checkbox;
never write generated output into that other tree. The 5410 preview was stopped at Craig's request
on 2026-10-08; this delivery does not restart it.

## 5. Optional HUD, reticle and menu sampling

Craig's follow-up was accepted by the controller on 2026-10-08 at 23:28 UTC. It extends the experiment
to UI presentation with no original console counterpart, under the same H135 exception. HUD/reticle
and menu are separate groups, both OFF by default. They do not alter game state, inputs, timing,
reticle spread/aim/size, text layout or menu transitions. The match page's own HUD remains untouched.

| Choice | HUD/reticle | Menu |
|---|---|---|
| Nearest neighbour | Point-sample existing bitmap textures. | Point-sample sprite/glyph texels in the existing 640x448 software frame, then request pixelated browser scaling. |
| Bilinear | Linear texture sampling. | Existing bilinear sprite/glyph raster sampling and ordinary browser scaling. |
| Integer nearest | Fit uniformly scaled bitmap content at the largest whole multiple inside its original layout box; keep its centre and mesh transforms. Untextured fills and stretched quads retain their full geometry. | Point-sample sprite/glyphs and fit the whole 640x448 menu frame at a whole physical-pixel multiple, centred in the window. |
| Nearest + sharpening | Same-sized CPU RGB unsharp bitmap followed by point sampling. | The same RGB treatment before point-sampling menu sprite/glyphs. |

The original reticle already uses nearest sampling, while the original HUD uses linear sampling;
OFF restores each layer's own original sampler, not one common filter. Sharpen amount is 0..1,
initially 0.5, and affects only the sharpening choice. It uses a four-neighbour alpha-weighted RGB
unsharp mask, keeps alpha unchanged and ignores hidden RGB from transparent neighbours. One result
per live source bitmap is cached and recomputed only when its amount changes; source pixels are
immutable. This can emphasize existing edges and halos, not add missing detail.

Integer step is 1..4, initially 1. The largest fitting whole scale is quantized downward to a multiple
of the selected step. If that step cannot fit, use the largest fitting whole scale; if even 1x cannot
fit, fall back to proportional downscaling without cropping. HUD content may have internal empty
space; its layout boxes and reticle's recorded position/size are unchanged. HUD WHITE fills (health
bars and full-screen fades included), and quads stretched to an aspect different from their source
crop, bypass the integer inset. This keeps panel and coverage geometry equal to OFF. The reticle uses temporary
private geometry for that inset and restores the exact original geometry on OFF. Scope, binocular
and night-vision coverage masks keep their full box to avoid uncovering the scene; their sampling
still follows the choice. Integer texel steps do not claim to snap original moving centres to an
absolute physical-pixel grid.

At device pixel ratio 1, a 1920x1080 window fits the menu at 2x (1280x896), and a 2560x1440 window
at 3x (1920x1344), centred with unused space around it. Step 2 chooses 2x in both windows. A normal
64x64 reticle bitmap whose original height scales with the 448-line frame similarly fits at 2x/3x
inside its existing box at 1080p/1440p. HUD glyphs and cropped sprites use their own source crop and
box, so their integer choice can differ. Device-pixel ratio is included for menu fitting; these
examples name physical pixels, not an unqualified CSS viewport size. No appearance or speed claim
is made for a particular browser/display.

The test-room panel applies its HUD choice directly and writes the menu choice into an Open menu
preview link. The front end accepts `expMenu`, `expMenuSharp` and `expMenuSnap` only when `devmode`
is present; invalid, duplicate, non-finite or out-of-range settings are ignored as a whole. This is
deliberately a query gate on any build, not an `import.meta.env.DEV` gate, under the repository's
non-deployed OT.R31 setup. A normal address has no experiment. It uses
no storage. Master OFF and group OFF produce an ordinary menu link. Existing menu tabs keep the
preferences in their own address; open the updated link to change them. The front-end dependency
remains THREE-free. Menu 3D model sampling, movie source pixels and the logical 640x448 frame stay
unchanged; the final browser scaling of that composed frame naturally includes all of its contents.

`experimentalUiOriginal.json` pins main's HUD/reticle submission state at `713680b5a` (its
`sourceCommit`, which the test titles read) at 1080p and 1440p with synthetic bitmaps: OFF must equal
main as it is, not one old commit. It was first pinned at `8181ebab7`; main's HUD then changed
(`96114392f`, `8cc2f851f`, `d252f1a18`, `a8d143802`; the reticle did not), and the pin was regenerated
by running `experimentalUiFixture.ts`'s `snapshot()` over git-archive `713680b5a`'s viewer sources in a
scratch tree -- the same run over `8181ebab7`'s sources reproduces the first pin byte for byte. A
re-pin after a later HUD change is the same run and a new json. The fixture captures render
submissions, visible mesh geometry/transforms,
material properties, texture pixels and actual samplers (including HUD texture nodes). These are
CPU submission checks, not measured GPU draw calls or screenshots. Tests exercise every mode,
OFF restoration of object identities/state, repeated frames without re-upload, bitmap replacement,
integer resize behavior, menu raster pixels/clipping, query parsing, link/reset behavior and mounted
canvas sizing. `experimentalMenuOriginal.json` separately pins a 640x448 RGBA frame and undrawn
metadata from git-show `8181ebab7`'s own compositor, using `experimentalMenuFixture.ts`'s fabricated
sprite, clipped glyph, model, movie and missing-texture cases. Absent and OFF options must match it.
Menu comparisons check all bytes with native Buffer comparison or SHA-256, retaining pixel assertions
and the default test timeout. `experimentalHudCoverage.test.ts` compares actual submitted geometry
for five health values, full-screen fades, resize/step changes and stretched panels against OFF;
it also checks that ordinary bitmap content still receives the integer inset.
The first-slice review's active-group slider and variant-zero cache cases are also
included. The controller owns fresh review and the landing gate; Craig owns visual judgment.

Verification classification: the new pack/UI tests use synthetic pixels and fabricated archive records.
The broader existing front-end regression files also read the repository's committed game-data
fixtures; they are fixture-backed unit evidence, not synthetic-only evidence or a live-disc run.
Six existing tests requiring the external disc were skipped. No pack generation CLI was run.

## 6. Control prerequisites and rendered checks still owed

The panel disables its controls until Experimental is selected and its master switch is on. Each
group's numeric controls require its checkbox; UI sharpness requires Nearest + sharpening, and
Integer step requires Integer nearest. Values remain available for A/B when re-enabled. The new
colour status distinguishes off, neutral and active values. This fixes a misleading interactive
panel state; it does not prove the cause of the owner's broad report that controls did nothing.

Useful comparisons are labelled beside the controls: warmth/tint and tonal balance -1 versus +1;
bloom channels 0 versus 2 with Soft bloom, positive strength and bright extracted pixels; UI RGB
sharpness 0 versus 1 on textured colour detail. Neutral defaults intentionally change no colour.
The original reticle is already nearest; an alpha-edged uniform-RGB icon cannot change under RGB-only
sharpening. At 1920x1080 physical pixels all menu integer steps yield 2x. HUD/reticle changes need a
visible in-game HUD; menu changes need a newly opened generated preview link, not the HTML settings
panel or an already-open menu tab. A pack checkbox loads a previously generated pack; it does not
generate one. Missing packs retain the originals.

CPU checks confirm settings reach the colour variants, uniform updates and sampling objects. No
stale-source discrepancy was found in the preview before closure. Actual renderer OFF/ON/OFF
captures, a classified real MP51 sample and applied-pack identity/count remain owed. The preview
stays closed until the controller's explicit GPU window, and the owner is invited only after those
captures and both reviews pass. A conditional future window is not a current resource grant.

## 7. Rendered checks delivered (2026-10-09, the controller's GPU window)

The captures owed by section 6 were made in the controller's bounded GPU window (12:1xZ to 12:46Z, the
host held for it) by the experiment's Codex seat and read by its independent reviewer: **PASS WITH
FINDINGS**, bounded to the rendered execution and restoration of the selected controls; no application
defect demonstrated. The packet is outside the repository, in the owner's Documents/Codex/2026-10-08/
task-2/graphics-validation/ folder (index.html, README.md, independent-review.md, validation-summary.json,
capture-sha256.json over 252 PNGs, pack-manifest.json, pack-verification.json); each capture has its
settings, pose and backend JSON beside it. What it shows, at the evidence kind "rendered browser run":

- **Backends.** Installed Edge 154 drove actual WebGPU (renderer stats webgpu; adapter NVIDIA/Lovelace)
  and then actual WebGL2 (ANGLE, RTX 4070 SUPER, D3D11), serially. Playwright's bundled Chromium could not
  create a WebGPU device (dxil.dll, Windows error 87), fell back and is not counted as a WebGPU pass.
- **Restoration.** OFF after ON restores pixel-exact for the master, the real pack, the settled
  character light, every menu mode and the integer health-bar geometry on both backends. Two retained
  exceptions: WebGPU settled HUD sharpen restores with 4 body pixels at 1/255; WebGL2 bright-bloom-tint
  with 2 pixels at 1/255. No universal exactness is claimed.
- **Controls.** Sharpen, resolution, colour grade, warmth/tint and tone balance on the stucco wall; mip
  and detail in the MP51 context (they need authored levels/layers); bloom, highlight and bloom tint on a
  bright fixture with the original brighten held fixed; the settled master and HUD/menu sampling modes.
  Menu bilinear equals the original. The dark wall has no bloom prerequisite: WebGPU no change; WebGL2
  entering the postprocess path moves 2514 edge pixels by at most 14/255, an observed backend/path
  difference, not a demonstrated shader defect (a report for the next slice).
- **The real pack.** stucco_mp51.tif, opaque 128x128 to 256x256 by Lanczos3, one 262,144-byte RGBA
  payload, identity and payload hashes in the manifest; both backends observed one local texture applied
  and OFF restoring 0 pixels; ON changed about 449k pixels, subtle resampling with no recovered source
  detail. The pack stays in the graphics checkout's ignored `public/experimental-packs/mp51/`, never
  shared data. Generator cost 140 ms all in (7 ms read, 7 ms decode, 121 ms processing with provenance and
  hashing, 5 ms write); sampled RSS about 121 MiB; toggle to observed-applied about 26 ms on either
  backend. Host free memory stayed above 8.0 GiB; the desktop lock was checked FREE throughout.
- **Not covered.** All endpoints, other maps, motion and gameplay, GPU performance, and whether the look
  is right: that last is the owner's to judge (H135). The preview was stopped at the window's end and
  reopened for the owner on his word at 13:04Z in a second window.

This closes section 6's owed captures; the applied-pack identity and count are observed; the two
1/255 restoration exceptions and the WebGL2 postprocess-path edge difference are the next slice's
first items.

## 8. The model-upscale look (2026-10-09, report only)

After the owner's verdict on the Lanczos pack (section 7; H135), the controller ran the twenty-minute
check he asked for, on his word, from the controller's seat: six MP51 world textures decoded through the
repository's own dump tool (`tools/dump-textures.ts` over the map archive; the raster pixel order with
the default CLUT is the order that renders the door correctly) and upscaled offline by Real-ESRGAN's
ncnn-vulkan build (release 20220424 of v0.2.5.0, the x4plus and x4plus-anime weights, hashes in the
controller's record) on the host's GPU. Nothing was published, loaded or committed; the sheets are in a
private page for the owner, each texture shown as the original, the Lanczos 4x, the x4plus 4x and the
anime 4x at one display size, with a 2x2 tiling sheet. Evidence kind: an offline image comparison, not a
rendered run.

- **The gain is real and large** on the surfaces that fill the screen: the stucco gains plaster grain,
  the dry-stone wall resolves into stones with shadows, the rough ground into soil; the door's panels
  and rust streaks read as a door. The Lanczos column shows only softening, which is section 7's result.
- **The model invents.** The cobble road gains mortar veins between its stones that the original does
  not have; the door's colour shifts toward grey; every output is the model's reading of the artist's
  texture. Under the parity rule this is a departure, allowed only in the owner's H135 exception, test
  room only and OFF by default (the Experimental view itself is off by default; within it the pack is on, GX.R8,
  section 9); it never changes behaviour.
- **The anime weights are not a candidate**: smeared, flattened, contours drawn in.
- **Tiling is broken by the model** (a band at the seam on the stucco, broken stones across it on the
  cobbles and the rock): the pipeline must upscale a 3x3-tiled source and crop the centre, or every
  repeating wall shows a grid. Alpha-cut textures (fences, foliage) were not tried and need alpha-aware
  handling.
- **Cost**: about 3 s for the six textures at 4x on the RTX 4070 SUPER; 100-160 KB per 512x512 PNG.
- **No community pack exists** for SOCOM II's environments (searched 2026-10-09: one Xbox-button pack),
  and PCSX2 packs are keyed by GS-upload hashes, so the repository's readers stay the source.

What a slice would be, if the owner orders it: the generator gains an export and an import mode (section
4's manifest records the method as the tool, the model and the weights hash instead of "lanczos3"); the
whole MP51 world set goes through x4plus with wrap padding; the caps of section 4 are lifted and the pack
is served GPU-compressed; the owner judges it in the test room; characters and weapons after, if the
walls earn it. The weights and the packs never enter git. Nothing is scoped until he says.

## 9. The import path (graphics slice 3, GX-1, 2026-10-09)

Plan `docs/plans/2026-10-09-web-graphics-upscale-pack.md`, rulings GX.R1-R5, under the owner's exception H135: a
browser adaptation that changes no game behaviour. Evidence kind: synthetic unit tests only (fabricated 8x8 and 8x4
sources, a nearest-neighbour stand-in for the model); no disc data was decoded, no model run, no pack published.

- **Two modes** of `tools/writeLocalTexturePack.ts`, both with the local `RUN/MP51.ZDB` and both writing outside the
  repository only (exported images are decoded disc data). `--export <dir>`: every eligible MP51 world texture --
  the runtime's own role filter (`packSourcesFor`, section 4) over the map as `loadMap` reads it from the archive's
  directory -- written as its base level in PNG, a sidecar JSON beside it (key, library, record, size, wrap, mip flag
  and level count, the base level's sha256, the padding) and `export.json` (the archive's sha256 and size, the tool
  commit, the entries' stems). `--import <dir> --method <text> --scale <2|4> [--sidecars <export dir>]`: the PNGs an
  image tool wrote under the same stems, read back by the dependency-free `decodePng` (8-bit RGBA or RGB).
- **Padding (GX.R3)**, the generator's own: each axis is padded by one source length on both sides -- a repeating
  axis tiled, a clamped axis its edge texels extended -- so every export is 3w x 3h. The import requires exactly
  scale x that size and crops the centre tile. The source in the sidecar must still match the archive's (size, wrap,
  hash), or the texture stays original.
- **Levels**: the cropped image is level 0; each lower authored level is a separable Lanczos-3 2x reduction
  (`lanczosHalf`, section 4's kernel stretched) of the level above, at its authored index; the tail past the
  authored levels is generated as before (`mipChain`). Section 4's rule that authored indices are never shifted holds.
- **Left original, counted (GX.R5)**: a missing, changed, unreadable, mis-sized, non-opaque (any alpha under 255 in
  the cropped levels) or over-cap result is left out with its reason in the tool's report (`keptOriginal`,
  `leftOut`); only an import with nothing left, or an export of another archive, refuses.
- **Caps (GX.R4)**, `PACK_LIMITS`, the one object the validator, the generator and the runtime's streaming bounds
  read: 256 entries (a sanity bound; GX.R4 sets no entry cap), source edge 512, replacement edge 2048, 16 MiB an
  entry, 192 MiB in all, 12 levels (a full 2048 chain), and the manifest 1 MiB (was 128 KiB: a 256-entry manifest
  does not fit the old bound). Section 4's four entries, 1024 edge, 6 and 24 MiB are superseded. A consequence for
  GX-2: a mipmapped 512x512 source at 4x is about 21.3 MiB and is left out as `entryBytes`; a 512x512 without mips
  (16 MiB exactly) and a mipmapped 512x256 fit.
- **`method`** records how the base levels were made: `lanczos3` for the named-key mode, and for an import the text
  given -- the tool, its release, the model and the weights' sha256 (GX.R2) -- printable ASCII, 1 to 512 characters.
  `scale` is 2 or 4 and binds every authored level (`width = source width x scale`). A 4x entry takes the same
  size-changing swap as 2x (`TexturePackTarget.apply`, dispose then replace); the runtime hard-codes no limit.
- **Two role sets (GX-1b).** The first export over the real MP51 archive gave 11 textures: the 'world' set bans
  every name a prop draws and every world draw with `vertexAlpha` or `alphaPass`, which removes the ground
  (cobble_road, ground_dirt_rough, grass, road_cobble) and most of what the owner looks at. `packSourcesFor(map,
  roles)` now takes 'world' (that set, unchanged) or 'wide', which also admits prop textures and blended or alpha-pass
  world draws. 'wide' is safe for the same reason the first slice is: the texture itself must be opaque at every
  level (`validateSource`), the pack replaces only texels, and the material -- blend, alpha test, depth, the vertex
  alpha ramp, the draw's pass -- is the draw's own and untouched. Characters, weapons, grenades, detail layers,
  environment maps and lines stay out of both, and so does every sky (unfogged), scrolling or reflective draw, prop or
  world. A prop draws through the same per-name texture object as the world (`world.ts`, `materialFor` over one
  `textures` map), so its swap is the same DataTexture reuse. The manifest carries `roles` (absent = 'world'); the
  runtime asks the map for that set; `--roles wide` on the export is written to `export.json`, and the import takes
  the manifest's roles from there (a disagreeing `--roles` refuses).
- **The three lobby maps (GX-1c).** The generator takes `RUN/MP2.ZDB`, `MP51.ZDB` or `MP72.ZDB` (the CREATE GAME
  list, OT.R42), takes the map id from the archive (its table of contents must hold `<map>.ZED`), writes the manifest's
  `mapArchive` and the source digests with it and publishes to `public/experimental-packs/<map>/`; the runtime asks
  `experimental-packs/<map>/current.json` for the loaded map and refuses a manifest of another map, and the role
  filter was already map-generic (`packSourcesFor` over `loadMap`), its MP51 gate now the three-map list.
- **MP2 and MP72, and the pack on with Experimental (GX-1d, GX.R8).** The owner's look found the packs applied on MP51
  only: the page (`main.ts`) set a pack target only when `map.archive === 'MP51'`, a first-slice line, so MP2's and
  MP72's worlds never had one while the runtime, the digests and the role filter already took the loaded map's id. The
  rule is now the runtime's `packTargetFor` (a target for any pack map), held by an MP2 end-to-end unit test. On his
  word (GX.R8) the Local upscaled textures checkbox is checked by default: the pack applies as soon as the Experimental
  view and its switch are on, unticking turns it off, and outside the Experimental view nothing changes. Its label
  reads "Local upscaled textures (<scale>x)" from the loaded manifest's scale.
- **Every map (GX-1e, GX.R9).** On the owner's word "Looking good. keep up the good work. Let's scale this to all
  maps." (2026-10-09), a pack serves any `MP<n>` archive: the generator takes the map id from the archive name and its
  root member, the runtime asks `/experimental-packs/<map>/current.json` for whatever map is loaded and refuses
  another map's manifest, and the role filter computes for a map with no props or fittings without throwing.
- **Owed**: GX-3 (the owner's look in the test room; under GX.R7 the acceptance is that a pack loads and applies). GX-2
  is done (the plan's Log).

## 10. The library and the chooser (graphics slice 4, GX-21, 2026-10-10)

The pack's conventions for anyone making one -- the layout, the manifest field by field, the entry's bytes, the caps and refusals, provenance and the `method` grammar, the generator and hand-made paths, the loader's guarantees, licences -- are `docs/specs/2026-10-10-texture-pack-conventions.md` (GX-20; written before the chooser landed, so it says `packs.json` is read by no code: GX-21 made the loader read it).

Plan `docs/plans/2026-10-10-web-graphics-slice-4-packs.md`, rulings GX.R10-R14, under the owner's exception H135: a
browser adaptation that changes no game behaviour; with the Experimental view not selected nothing is fetched and
nothing changes. Evidence kind: synthetic unit tests only (fabricated 1x1 and 2x2 packs); no pack was published, no
map decoded, no browser run. The conventions for anyone making a pack are GX-20's document.

- **The index is the library.** `public/experimental-packs/<map>/packs.json`: `{version: 1, packs: [...]}`, at most
  32 packs and 64 KiB, each `{id, name, kind, method, scale, roles, generatedAt, textures, bytes, notes}` -- the id the
  manifest's sha256, the name 1-48 printable ASCII, notes 0-240, `generatedAt` an ISO-8601 UTC time, `method`,
  `scale`, `roles` the manifest's, `textures` its entry count, `bytes` its payload bytes (`validatePackIndex`,
  `PACK_INDEX_LIMITS`). A pack on disk but not in the index is not offered. `current.json` stays the default's pointer.
- **Kinds (GX.R11).** `kind` is `textures` now; an entry of any other kind is listed refused -- "no loader for kind
  <k>" -- and never applied, so a later loader is a new kind, not a new format. A malformed index (not JSON, another
  version, a bad field, a duplicate id, over 32 packs or 64 KiB) refuses the whole library with its reason.
- **The generator** (`publishTexturePack`, `--name`, `--notes`, `--no-default`) settles the next index before writing
  anything (an index it cannot read refuses the publication), writes the pack, then the index through a staging file
  and a rename, then -- unless `--no-default` -- `current.json` the same way. A republished id replaces its entry in
  place. Without `--name` the pack is listed as `<method's first word>-<scale>x`.
- **The chooser.** The panel's "Texture pack" select replaced the "Local upscaled textures" checkbox: Original, then
  one option per library entry, "<name> (<scale>x, <method>)" (a method over 40 characters is cut; the full one is the
  option's title). Its default is the map's default pack (`current.json`'s, if the index lists it; else Original), so
  the pack is still on with the Experimental view (GX.R8). The loader reads `current.json`, then `packs.json`
  (without one, the library is `current.json`'s pack alone, named by its method), once per map and switch-on; a choice
  restores the originals first, as OFF does, then applies the chosen pack; Original applies nothing and reads no
  payload. The chosen entry must match its manifest (method, scale, roles, count, bytes) and the manifest its id and
  map. The status line names the applied pack and its count ("<name>: n of m textures applied.") or a refusal
  ("<name>: refused -- <reason>").
- **The panel's table.** Its groups are one table (`EXPERIMENTAL_GROUPS`: id, label, controls, prerequisites, the
  OFF value) from which the markup and the settings object are built; `experimentalPanelTable.test.ts` holds today's
  groups to the markup and settings of before (whitespace between tags aside, the pack group cut). The settings key
  `localTexturePack` now carries the choice (an id, `PACK_CHOICE_DEFAULT`, or null); its key order follows the table.
- **After the review (GX-21's second round).** Every read of `current.json`, `packs.json` and a manifest asks for
  `application/json` and takes an HTML answer as absent: the dev server is an SPA, and a missing `packs.json` came
  back 200 with `index.html`, which refused every map's library. `notes` may be absent (= ""). The first index the
  generator writes on a map that already has a `current.json` pack lists that pack first. The bounds are in the
  conventions' §2.
- **The third round (review 2).** The chooser keeps a permanent "Map's default pack" option whose value survives map
  changes (the runtime resolves it per map); an empty library (a map with no packs) neither moves nor sends the
  choice, so MP51 -> MP3 -> MP2 still lands on MP2's default; a chosen pack another map does not list moves to that
  option, sent as a change. The generator's `--set-default <packId | name>` moves `current.json` to a listed pack
  without reading an archive (re-importing a known id is refused by the immutable-pack rule); the recorded method
  (`--from 4x`'s word, `--enhance`'s suffix, 512 characters) is checked right after the options, before the archive;
  a repeated option is refused by its name.
- **The independent review (GX-25, dot) and its rounds.** A refused entry keeps its original and is reported with its
  key and reason (`skipped`, the status line's "Kept original: ..."); a present but malformed `current.json` is refused
  with its reason while an absent one stays silent. The conventions now say how to list a hand-made pack in
  `packs.json` (the index is the library; an atomic write), that `notes` may be absent or `null` (read as ""), what
  `sourceFlags` is (a copy of the source's `TextureFlags`, bound by `sourceDigest`, never applied), how an unknown
  `kind` is listed but never applied, and that the generator ends a mip chain at its first 1x1 level while the
  validator also accepts repeated terminal 1x1 levels (a validator gap recorded there, not a convention).
- **More kinds of pack, no model (GX-22).** The generator's `--enhance` (unsharp, local contrast, linear-light
  saturation, chained in order, recorded as the method's ` enhance:` suffix) and `--scale 2 --from 4x` (4x results
  reduced by `lanczosHalf`, the method's `-2x-from-4x` variant) are the conventions' §6; a browser adaptation, tested on
  fabricated images only (`tools/test/localTexturePackEnhance.test.ts`), no pack generated.
- **Owed**: the owner's look at the chooser in the test room (GX-23, GX-26).

## 11. GX-24: the renderer's easy wins (graphics slice 4, 2026-10-10)

Plan `docs/plans/2026-10-10-web-graphics-slice-4-packs.md` (GX-24, GX.R12), dot's work at `4899631b2`, merged into
`agent/gfx-packs` at `68a4a1831`. Five rows of the panel's group table (`EXPERIMENTAL_GROUPS`, section 10), each a
browser adaptation under the owner's exception H135: **none claims an original value or behaviour**, each was OFF by
default and is labelled "(adaptation)" in the panel, and with any of them off the original's graph is drawn. Since
the owner's A/B of 2026-10-11 (H135: "some new experimental defaults ... texture pack approved") FXAA and the resolve
filter at bicubic are ON by default inside the Experimental view (his chosen values, not readings; the resolve filter
applies while the render scale is above 1, as the default 1.5 is), and the map detail adjustment's defaults are
strength 0.55 and distance 1.60; the three world groups stay OFF. Evidence
kind: synthetic CPU/jsdom tests and offline GLSL/WGSL shader generation; no rendered browser or GPU run, no capture,
no performance or VRAM measurement. dot's handoff report is outside the repository (the owner's Documents folder,
`Codex/2026-10-10/task/GX24-HANDOFF.md`), cited, not copied.

| group (row id) | what it does | OFF value | prerequisites |
|---|---|---|---|
| World anisotropic filtering (`worldAnisotropy`) | the device's maximum anisotropy (`renderer.getMaxAnisotropy`) on eligible world base textures, through derivative LOD and trilinear filtering | `worldAnisotropy: false` | a device above 1x (else the panel says unsupported and the switch stays disabled); existing mip chains only |
| World trilinear filtering (`worldTrilinear`) | derivative (screen-space) LOD with `LinearMipmapLinearFilter` instead of the original's depth-based LOD, on eligible mipmapped world bases | `worldTrilinear: false` | mipmapped textures; names a prop, line, detail layer, environment map, weapon, grenade or body also uses stay original (`worldSamplingNames`) |
| World derivative LOD bias (`worldLodBias`, `worldLodBiasValue` -2..2) | a bias on that derivative path; 0 is neutral | `worldLodBias: false` (bias 0) | World trilinear, or supported anisotropy |
| FXAA (`fxaa`) | three r186's FXAA node on the final world picture, after colour and resolve, before the HUD; one display-sized intermediate, released when off | `fxaa: false` | none; no original equivalent |
| Render-scale resolve filter (`resolveFiltering`, `resolveFilter`) | the supersampled picture's resolve as nearest, bilinear (the existing filter, the same shader) or Catmull-Rom bicubic (16 taps a lookup; may ring) | `resolveFiltering: false` | render scale above 1 |

- **The OFF pins.** `experimentalQuality.test.ts` (the world switches start OFF and FXAA and the bicubic resolve ON,
  the owner's defaults of 2026-10-11; each row has an explicit OFF value;
  the world graph restored exactly, GLSL and WGSL; sampler and image identities restored with no OFF upload),
  `experimentalRenderer.test.ts` (FXAA alone frees its target and bypasses exactly; resolve graphs only while
  supersampling, the exact OFF scene back), `experimentalQualityShaders.test.ts` (offline generation of every resolve
  and the FXAA node), `experimentalQualityUi.test.ts` (unsupported anisotropy shown, prerequisites gated, Reset returns
  them to the owner's defaults, nothing outside the test room); the panel-table test cuts these rows and holds every other group to the
  markup of before.
- **The mip tail (GX-25 round 8).** The world's mip chain is the disc's authored levels up to `MXL` and then the
  loader's 2x2 box-filtered tail to 1x1 (`materialSpec.ts`, `mipChain`; `world.ts`); the GS's explicit depth LOD is
  clamped to `0..MXL` and never samples that tail, while derivative sampling (trilinear, anisotropy) can. The two
  rows' panel notes say so.
- **Owed**: the rendered window. The owner's A/B verdict is in (H135, GX-26, 2026-10-11: the defaults above, the pack
  approved, the plain `x4plus-4x` each map's default).
