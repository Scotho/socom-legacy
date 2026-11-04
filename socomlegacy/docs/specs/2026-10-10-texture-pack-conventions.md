# Texture pack conventions -- redotcom's test-room texture packs

2026-10-10. For someone outside the project who wants to make a pack by hand or with the generator. It describes the
graphics lane's code (`agent/gfx-upscale`): `packages/viewer/src/texturePack.ts` (the format and its validator),
`texturePackRuntime.ts` (the loader), `texturePackSources.ts` (which textures are eligible), `tools/
writeLocalTexturePack.ts`, `tools/localTexturePack.ts` and `tools/png.ts` (the generator), and research note 260 §4 and
§7-9. What the code does not read yet (§6's `method` grammar) is marked "proposed"; `packs.json` (§2) is read since GX-21. Sizes are bytes
unless written MiB.

## 1. What a pack is and is not

A pack is a set of replacement images for some of one map's textures, served to the browser from a directory the
repository ignores, and applied only in the test room (`/testroom`) while the Experimental view is on and its "Texture
pack" chooser names a pack (GX-21; it was the "Local upscaled textures" checkbox). It exists under the owner's exception H135 (`docs/HUMAN_TASKS.md`) to the parity
rule: an upscaled texture departs from the original's look, allowed there and nowhere else (plan
`2026-10-09-web-graphics-upscale-pack.md`, GX.R1, GX.R8, GX.R9).

- It replaces texels only. The draw's material -- blend, alpha test, depth, wrap, vertex alpha, the pass -- stays the
  original's; a pack cannot change what is drawn or how, only what colour a solid texel is.
- It is local data. `public/experimental-packs/` is git-ignored (the root `.gitignore`); no pack, exported image or
  model weights are committed, uploaded or built. The originals are every build's default; off, nothing is fetched.
- It replaces opaque textures of one map archive -- a multiplayer map's `RUN/MP<n>.ZDB` or, since GX-27, a campaign
  mission's `RUN/M<n>.ZDB` (`M51` ... `M83`; `packMap`, `MAP_ARCHIVE` in `texturePack.ts`, `mapIdOf` in the
  generator): every texel of every level has alpha 255, before
  and after. Characters, weapons, grenades, detail layers, environment maps, lines and every sky, scrolling or
  reflective draw are never eligible (`texturePackSources.ts`, `packSourcesFor`). `roles` picks the set:

| roles   | eligible                                                                                                 |
|---------|----------------------------------------------------------------------------------------------------------|
| `world` | fogged, unblended world draws whose texture no prop also draws (no `vertexAlpha`, no `alphaPass`)        |
| `wide`  | `world` plus prop textures and blended or alpha-pass world draws; the texture itself must still be opaque |

## 2. Directory layout

```
socomlegacy/public/experimental-packs/
  <map>/                      the map id lower case: mp51, mp2, mp72, ...
    current.json              the pointer the loader reads: which pack is the default
    packs.json                the library index the chooser reads (GX-21)
    <packId>/                 the pack, named by the sha256 of its manifest.json bytes
      manifest.json
      0.rgba  1.rgba  ...     one raw RGBA8 file per entry, numbered from 0
```

`packRoot` (`texturePack.ts`) is the served path `/experimental-packs/<map lower case>/`. The loader reads
`current.json` there, at most 1024 bytes: `{"version":1,"packId":"<64 hex>"}`, then fetches `<packId>/manifest.json`
and refuses a manifest whose sha256 is not `packId` (`texturePackRuntime.ts`, `LocalTexturePacks.start`). A pack
directory is therefore immutable: a changed byte is a new id. The generator refuses an existing id
(`writeLocalTexturePack.ts`, `publishTexturePack`), stages under `.staging-<uuid>`, renames the finished directory
into place and only then replaces `current.json` by an atomic rename: a failed publish never points at half a pack.

**`packs.json`, the library** (GX-21; `validatePackIndex` in `texturePack.ts`, read by `LocalTexturePacks`):

```json
{ "version": 1, "packs": [ {
  "id": "<packId, 64 hex>", "name": "Crossroads 4x (Real-ESRGAN)", "kind": "textures",
  "method": "<the manifest's method>", "scale": 4, "roles": "wide", "generatedAt": "2026-10-09T18:05:00Z",
  "textures": 30, "bytes": 27104592, "notes": "printable ASCII" } ] }
```

The index is the library: a pack on disk but not in it is not offered. Its bounds (`PACK_INDEX_LIMITS`), each a
refusal with its reason:

| field / bound   | rule                                                                                                   |
|-----------------|--------------------------------------------------------------------------------------------------------|
| the file        | at most 64 KiB; JSON; `version` 1; `packs` a list of at most 32; every `id` unique                     |
| `id`            | the pack's id, 64 lower-case hex                                                                       |
| `name`          | printable ASCII (0x20-0x7e), 1-48 characters: the chooser's label                                      |
| `kind`          | matches `^[a-z][a-z0-9-]{0,31}$`; `textures` is the only kind with a loader (GX.R11). An entry of another kind is checked for `id`, `name`, `kind`, `generatedAt` and `notes` only (its other fields are not read) and is listed but never applied: the chooser shows "<name> (<kind>, refused)", choosing it reads "<name>: refused -- no loader for kind <k>" with nothing fetched, and `--set-default` refuses it |
| `generatedAt`   | ISO-8601 UTC as `Date.toISOString` writes it (`2026-10-09T18:05:00Z`, milliseconds optional), a real date |
| `notes`         | printable ASCII (0x20-0x7e), 0-240 characters; absent or `null` is read as `""` (`p.notes ?? ''`); any other non-string is refused |
| `method`, `scale`, `roles` | as the manifest's (§3); `roles` required here, `world` or `wide`                            |
| `textures`, `bytes` | the manifest's entry count (1-256) and `totalBytes` (4 .. 192 MiB)                                 |

A malformed file refuses the whole library ("packs.json: refused -- <reason>"); a chosen entry whose `method`,
`scale`, `roles`, `textures` or `bytes` disagree with its manifest is refused ("<name>: refused -- the index entry
does not match its manifest"). The chooser (the test room's Experimental panel, "Texture pack") lists Original and
each entry as "<name> (<scale>x, <method>)"; its default is the pack `current.json` names if the index lists it, else
Original. Choosing restores the originals, then applies the chosen pack; `current.json` is not written by the
chooser, only by the generator. Without a `packs.json` the library is `current.json`'s pack alone, named by its
method. Every read of `current.json`, `packs.json` and a manifest asks for `application/json`, and an HTML answer
(an SPA dev server's fallback for a missing file) counts as absent. The generator (`--name`, `--notes`,
`--no-default`) adds or replaces the pack's entry and writes the index by a staging file and a rename before
`current.json`; the first index of a map that already has a `current.json` pack lists that pack first. A pack is never
re-published (its id is immutable), so the default is moved with `tsx tools/writeLocalTexturePack.ts <MPn>
--set-default <packId | name>`: no archive is read; it rewrites `current.json` (staging and rename) to a pack the index
lists whose manifest is whole and matches its id, and otherwise refuses with the reason. The chooser's "Map's default
pack" option follows `current.json` on every map; a map with no packs leaves the choice as it was.

## 3. The manifest, field by field

Every field is checked by `validateManifest` (`texturePack.ts`) unless another function is named; every failure is one
refusal (§5). A real example: `public/experimental-packs/mp51/<id>/manifest.json`.

| field                            | type / bound                                                                | meaning                                                                   |
|----------------------------------|-----------------------------------------------------------------------------|---------------------------------------------------------------------------|
| `format`, `version`, `localOnly` | `"s2u-local-texture-pack"`, `1`, `true`                                     | the format; `localOnly` is a reminder the loader insists on               |
| `mapArchive`                     | `RUN/MP<n>.ZDB`; must equal the loaded map's (`start`)                      | the archive the sources were read from                                    |
| `method`                         | printable ASCII (0x20-0x7e), 1 to 512 chars (`packMethod`)                  | how the base levels were made (§6)                                        |
| `scale`                          | 2 or 4 (`packScale`)                                                        | every authored level is `source edge x scale`                             |
| `roles`                          | `world` or `wide`, or absent (= `world`) (`packRoles`)                      | the eligible set the pack was made from and is applied to (§1)            |
| `provenance.archiveSha256`, `.archiveBytes` | 64 lower-case hex; integer 1 .. 128 MiB                          | the archive file's hash and size                                          |
| `provenance.toolCommit`, `.toolSha256`      | 40 hex; 64 hex                                                   | the generator's git commit and source digest (§6)                         |
| `totalBytes`                     | the sum of every entry's `bytes`; at most 192 MiB                           | the payload total                                                         |
| `entries[]`                      | 1 to 256                                                                    | one per replaced texture                                                  |
| `entries[].key`                  | lower case, 1-128 chars, unique                                             | the texture's name in the map (`wood_dark.tif`)                           |
| `entries[].file`                 | `(0\|[1-9][0-9]{0,2}).rgba`, index < 256, unique                            | the payload's name; the only manifest string ever used in a URL           |
| `entries[].bytes`                | integer 4 .. 16 MiB; the file's length and the levels' sum                  | the payload's size                                                        |
| `entries[].sha256`               | 64 hex; checked against the fetched bytes (`start`)                         | sha256 of the whole `.rgba` file                                          |
| `entries[].sourceDigest`         | 64 hex; recomputed two ways at load (`start`, §4)                           | binds the entry to the decoded source's key, flags and level hashes       |
| `entries[].sourceFlags`          | copied `TextureFlags`; no validator of its own -- bound at load by `descriptorDigest` (`start`, §4) | `bilinear`, `transparent`, `graded`, `opaque`, `gs` (blend, wrap, mips)   |
| `entries[].sourceLevels[]`       | 1 to 10 of `{width, height, sha256}`; powers of two 1..512; each halves     | the decoded source's levels, base first                                   |
| `entries[].library`, `.record`   | strings, unchecked                                                          | where the source lives on the disc, for the reader                        |
| `entries[].mipmaps`              | boolean; must equal the source's `gs.mipmaps` (`start`)                     | whether the payload carries a chain down to 1x1                           |
| `entries[].levels[]`             | `sourceLevels.length` .. 12 of `{width, height, offset, bytes, sourceLevel}` | the payload's layout (§4): powers of two 1..2048, each halving the one above; `offset` the running sum, `bytes = width*height*4`; `sourceLevel` the index for the authored levels, `null` for the tail |

Unknown fields are ignored by the validator but change the manifest's bytes, and so the id.

**`sourceFlags`, exactly.** A copy of the decoded source's `TextureFlags` (`materialSpec.ts`), not a setting: the
loader never applies it -- the draw's material stays the original's. `bilinear` (linear magnification), `transparent`,
`graded` (the alpha is a ramp, not a switch), `opaque` (every sampled texel solid; a pack's source must be opaque and
not transparent or graded, `validateSource`) and `gs`, the decoded GS state of the texture's bind packet
(`packages/gs/src/gsState.ts`, `GsState`: `blend`, `alphaTest`, `depthTest`, `bilinear`, `mipmaps` and `levels` from
`TEX1`, `wrapS`/`wrapT` from `CLAMP`, and the optional `lodK`/`lodL` and `mipTbp`), or `null`. It enters
`sourceDigest` (§4), so a pack binds to the source's flags as well as its pixels; `entries[].mipmaps` must equal
`gs.mipmaps`, and the source must have `gs.levels + 1` levels when mipmapped. No function checks `sourceFlags` on its own:
`validateManifest` never reads it; the manifest's copy is bound at load, when `descriptorDigest` over the key, these flags
and `sourceLevels` must equal `sourceDigest`, which is also recomputed from the decoded source (`start`).

## 4. An entry's byte layout

An entry's file is raw RGBA8, 4 bytes a texel, top row first, no header, no padding, every level's rows packed one
after another. Every fourth byte is 255: `validateSource` refuses a source with any other alpha, `buildImportedPack`
leaves out an import with any other alpha (`alpha`), and the loader refuses a payload with any other alpha (`start`).

1. **The authored levels.** The source has `sourceLevels.length` levels (1 without mipmaps; `gs.levels + 1` with).
   Level `i` is `sourceLevels[i].width x scale` by `sourceLevels[i].height x scale` with `sourceLevel: i`. The named-key
   mode resamples each authored source level itself (`lanczos2x`); the import mode takes the imported image as level 0
   and makes each lower authored level by a Lanczos-3 2x reduction of the level above (`lanczosHalf`, premultiplied,
   wrap from the source's flags). Authored indices are never shifted: the level the shader selects at a distance stays
   the one the artist authored (research 260 §4).
2. **The tail.** With `mipmaps` true the chain continues from the last authored level to 1x1 (4 bytes) by a 2x2 box
   average (`materialSpec.ts`, `mipChain`), each with `sourceLevel: null`. Without mipmaps: one level, one source level.
   **Exactly one 1x1.** `mipChain` halves while either edge is over 1, so the generator writes the tail down to the
   first 1x1 level and stops (no tail at all when the last authored level is already 1x1). The validator enforces the
   same (`validateManifest`): `levels` holds `sourceLevels.length` to 12 entries, each `max(1, w >> 1)` by
   `max(1, h >> 1)` of the one above, the last 1x1 when `mipmaps`, and no level after the first 1x1 -- an entry whose
   levels continue past it is refused, "levels past the first 1x1" (the reason the chooser shows for that pack).

The hashes: `sha256` is over the whole file; `sourceLevels[i].sha256` is over the decoded source level's raw RGBA
(as the repository's readers decode it), not the pack's; `sourceDigest` is
`sha256(JSON.stringify(canonical({version:1, map: mapArchive, key, flags: sourceFlags, levels: sourceLevels})))`,
`canonical` sorting object keys recursively and dropping `undefined` (`texturePack.ts`, `descriptorDigest`). At load
it is computed from the manifest's fields and from the decoded source; both must equal the entry's or it is skipped.

## 5. Caps and refusals

The caps are one object, `PACK_LIMITS` (`texturePack.ts`), read by the validator, the generator and the loader:

| cap             | value   | where it bites                                                                              |
|-----------------|---------|---------------------------------------------------------------------------------------------|
| `entries`       | 256     | manifest entries, export count, payload file index                                          |
| `sourceEdge`    | 512     | each source level's width and height; the PNG reader's edge bound is `3 x 512 x 4`          |
| `outputEdge`    | 2048    | each payload level's width and height                                                       |
| level count     | 12      | a full 2048 chain to 1x1 (`MAX_LEVELS`)                                                     |
| `entryBytes`    | 16 MiB  | one payload file; also its fetch's streaming bound. A mipmapped 512x512 at 4x (21.3 MiB) is left out; a 512x512 without mips (16 MiB exactly) and a mipmapped 512x256 fit (research 260 §9) |
| `totalBytes`    | 192 MiB | the pack; also what `TexturePackTarget.apply` will keep in memory for restoration           |
| `manifestBytes` | 1 MiB   | `manifest.json`; the generator refuses to write a larger one (`finish`)                     |
| `methodLength`  | 512     | the `method` string. Outside the object: `current.json` 1024 (`start`), the archive 128 MiB |

**Refusals.** Every check in `texturePack.ts`, the loader and the publisher goes through `requirePack`, whose one
message is `Invalid or unsupported local texture pack`. A fetch that is not `ok` or has no body throws
`Local pack unavailable` (`boundedBytes`). The PNG reader's messages begin `PNG:` (`not a PNG`, `truncated <chunk>`,
`bad CRC in <chunk>`, `bad IHDR`, `size WxH outside 1..<max>`, `only 8-bit RGBA/RGB, not interlaced`, `IDAT before
IHDR`, `unknown critical chunk <type>`, `incomplete`, `image data is the wrong length`, `filter <n>`; the browser's
decoder, GX-27, also `image data does not inflate`). The library and
the chooser refuse with a reason (`PackRefusal`, §2): a refused index lists nothing ("packs.json: refused --
<reason>"), and so does a `current.json` the server cannot give within 1 KiB ("current.json: refused -- unreadable or
over 1 KiB"). A `current.json` that is present but malformed -- `not JSON`, `not version 1`, `packId is not a sha256`
-- is refused with that reason ("current.json: refused -- <reason>", the library's `pointerRefused`), gives no default,
and leaves a valid `packs.json` listed and selectable; an absent one (404, or an SPA server's `text/html` answer) is
the ordinary no-default case and says nothing. A refused pack applies nothing ("<name>: refused -- <reason>"). A
refused entry keeps its original and is reported with its key and reason (`LocalTexturePacks.skipped()`, the status
report's `skipped`): `not eligible on this map`, `source not eligible (not opaque, or a malformed chain)`, `source
digest mismatch`, `source levels do not match`, `payload missing or over its declared size`, `payload hash mismatch`,
`payload alpha is not 255`, `not applied (no such texture, or over the 192 MiB cap)`, `malformed entry`. The import mode leaves a bad texture
original and reports why in `leftOut` -- `missing`, `changed`, `unreadable`, `size`, `alpha`, `layout`, `entryBytes`,
`totalBytes`, and for an upload `untouched` and, for a plain pack, `notEligible` (§10) (`texturePackBuild.ts`, `LeftOut`) -- and refuses only when nothing is left, when `export.json` names
another archive, or when `--roles` disagrees with the export's.

## 6. Provenance

- `provenance.archiveSha256` and `archiveBytes` are the archive file's sha256 and size: provenance, not the
  compatibility check. The loader binds each entry to the decoded source pixels, level sizes and flags (§4), so a pack
  made from one copy of the disc applies to another with the same textures.
- `provenance.toolCommit` is `git rev-parse HEAD` of the generator's checkout. `provenance.toolSha256` is a sha256
  over the generator's sources, each fed as `<relative name>\0<file bytes>`, in order: `writeLocalTexturePack.ts`,
  `localTexturePack.ts`, `png.ts`, `../packages/viewer/src/texturePackBuild.ts`, `../packages/viewer/src/png.ts`,
  `../packages/viewer/src/texturePack.ts`, `texturePackSources.ts`, `mapTextures.ts`, `materialSpec.ts`
  (`generateLocalTexturePack`; the two viewer files since GX-27 moved the builder and the PNG reader's core there, so
  the upload shares them, §10). An uploaded pack records `sha256("s2u-texture-pack-upload/1")` (`UPLOAD_TOOL`) and the
  export's own `toolCommit` (§10). A hand-made pack records its own tool's commit and digest; the
  validator checks only their form.
- `sourceLevels[].sha256` and `sourceDigest` are §4. The export's sidecar carries the base level's hash as
  `sourceSha256`; an import whose sidecar does not match the archive's texture is left out as `changed`.
- `method` says how the base levels were made: any printable ASCII of 1-512 characters; `lanczos3` from the named-key
  mode, the `--method` text from an import. The lane's real packs predate any grammar (`realesrgan-x4plus
  ncnn-vulkan-20220424 weights-sha256:<64 hex> pad3x3`). **Proposed grammar**: `<tool>-<model>-<scale>x[-<variant>]`,
  then space-separated facts, then the `enhance:` suffix the generator writes (GX-22):

  ```
  method  = tool "-" model "-" scale "x" [ "-" variant ] *( " " fact ) [ enhance ]
  tool    = lower-case letters, digits, "."       (realesrgan, chainner, lanczos)
  model   = lower-case letters, digits, "_", "."  (x4plus, lanczos3, 4x_foolhardy_remacri)
  fact    = key ":" value                         (release:20220424, weights-sha256:<64 hex>, pad:3x3, tile:0)
  variant = "from-4x"                              (--scale 2 --from 4x: 4x results reduced to 2x)
          / lower-case letters, digits            (any other variant: free, by the pack's maker)
  enhance = " enhance:" op *( ";" op )            (one space, then the ops in the order applied)
  op      = "unsharp=" num "," num "," num        (radius 0.5-4, amount 0.1-2, threshold 0-32)
          / "contrast=" num "," num               (amount 0.1-0.6, radius 8-32)
          / "saturation=" num                     (factor 0.5-1.5)
  num     = the number as JavaScript's String(n) prints it (1.50 -> 1.5)
  ```

  Example: `realesrgan-x4plus-4x release:ncnn-vulkan-20220424 weights-sha256:713ee7...cddf pad:3x3
  enhance:unsharp=1,0.5,0`. The generator's `--enhance "<op>=<args>[;...]"` (on `--import` and the named-key mode)
  writes every argument, an omitted one at its default (unsharp's threshold 0, contrast's radius 16), and refuses an
  out-of-range or malformed argument -- or a `--method` that already holds ` enhance:`, one that would pass 512
  characters with its suffix, or one whose first word `--from 4x` cannot rewrite -- before anything is read or written
  (`plannedMethod`, right after the options are taken); a repeated option is refused by its name. The ops (`tools/localTexturePack.ts`, `enhanceLevel`) work on the stored 8-bit RGB, alpha untouched, past
  an edge by the texture's wrap: unsharp `v' = v + amount (v - G(v))` where `|v - G(v)| >= threshold`, `G` a Gaussian
  of sigma = radius texels cut at ceil(3 sigma); contrast the same at a wide radius, threshold 0; saturation in
  linear light (the sRGB transfer, IEC 61966-2-1) about the Rec. 709 luminance, `c' = Y + factor (c - Y)`. On an
  import the ops run on the cropped base before the lower levels are rebuilt from it; in the named-key mode on each
  authored level after its Lanczos resample (each is the disc's own level), the tail built from them.
  `--scale 2 --from 4x` on `--import` takes PNGs 4x the padded export, reduces each crop by `lanczosHalf` and builds
  the pack at scale 2 (the ops, if any, after the reduction); the method's first word becomes
  `<tool>-<model>-2x-from-4x` (a trailing `-4x` replaced, a word with no scale extended, any other scale or variant
  refused), and an import with no 4x PNG at all refuses.
  A model's weights are recorded by name and the weights file's sha256 (GX.R2); the file itself is never in git.
  `lanczos3` stays the named-key mode's string.

## 7. Making a pack

Both paths need the map archive (`RUN/MP<n>.ZDB` from the disc), decode disc data and run in the owner's resource window
(research 260 §4). Nothing here downloads or runs a model.

**With the generator** (`tsx tools/writeLocalTexturePack.ts`, from `socomlegacy/`). Export and import directories must
be outside the repository: the images are decoded disc data.

```
# 1. Export every eligible texture as a 3x3-padded PNG with a sidecar JSON, and export.json
tsx tools/writeLocalTexturePack.ts <path>/RUN/MP51.ZDB --export <outside>/mp51-src --roles wide
# 2. Upscale each <stem>.png with your tool at exactly 2x or 4x, keeping the stem, into another directory.
#    The export is 3w x 3h; your output must be exactly scale x that. 8-bit RGBA or RGB, not interlaced.
<your tool> -i <outside>/mp51-src -o <outside>/mp51-4x -s 4 ...
# 3. Import, naming the method and the scale; the sidecars come from the export directory
tsx tools/writeLocalTexturePack.ts <path>/RUN/MP51.ZDB --import <outside>/mp51-4x --method "<method>" --scale 4 --sidecars <outside>/mp51-src
```

The import crops each image's centre tile (`cropImport`), rebuilds the lower authored levels and the tail (§4),
validates the manifest, publishes under `public/experimental-packs/mp51/<packId>/` and points `current.json` at it
(`publishTexturePack`), then prints one JSON line: `packId`, `method`, `scale`, `textures`, `keptOriginal` (a count
per reason), `leftOut` (each key and reason), `payloadBytes`, timings and RSS. The padding (GX.R3, `padForExport`) is
the generator's: a repeating axis is tiled, a clamped axis has its edge texels extended, so the model sees a seam's
neighbours and tiling survives. The named-key mode, `tsx tools/writeLocalTexturePack.ts <MPn.ZDB> <key,key>
[--dry-run]`, makes a Lanczos-3 2x pack of up to four named textures with no external tool; `--dry-run` only prints
the selected keys and level sizes.

**By hand.** Make `public/experimental-packs/<map lower case>/<tmp>/`, then:

1. Decode each texture you replace through the repository's readers (`tools/dump-textures.ts` or `mapTextures.ts`)
   for its key, `TextureFlags` and every authored level's raw RGBA; confirm it is in the eligible set for your `roles`
   (`packSourcesFor`). Hash each level's raw bytes (`sourceLevels[i].sha256`).
2. Make the replacement levels: each authored level at `scale x` its size, then the box-filtered tail to 1x1 if the
   source has mipmaps (§4), every alpha 255. Concatenate them into `<i>.rgba`; record each level's `offset` and
   `bytes`; hash the file (`sha256`); its length is `bytes`.
3. Compute `sourceDigest` from `{version:1, map, key, flags, levels}` as §4 describes (sorted keys, no whitespace).
4. Hash the archive (`archiveSha256`, `archiveBytes`); record your tool's commit and a digest of its sources.
5. Write `manifest.json` (§3), sum `totalBytes`, and run it through `validateManifest` (a one-line `tsx` script
   importing `packages/viewer/src/texturePack.ts`) until it passes.
6. Hash the manifest file's exact bytes and rename the directory to that hash (the pack's id).
7. **List it in `packs.json`** -- the index is the library: a pack on disk but not in the index is never offered by
   the chooser, and `--set-default` refuses it. Add one entry (§2): `id` the hash, `name` (1-48 printable ASCII),
   `kind` `"textures"`, `method`, `scale`, `roles` and `textures` (the entry count) and `bytes` (`totalBytes`) exactly
   as the manifest has them (a disagreement refuses the pack when chosen), `generatedAt` (ISO-8601 UTC), `notes`
   (0-240 printable ASCII, or omit it). Keep every other entry as it was, at most 32 in all, the file at most 64 KiB,
   and run it through `validatePackIndex`. Write it atomically: the whole file to a temporary name in the same
   directory (the generator uses `.packs-<uuid>.json`), then rename it onto `packs.json`, so a reader never sees half
   an index. The first `packs.json` of a map whose `current.json` already names a pack should list that pack too, or
   the default disappears from the chooser.
8. To make it the default, write `{"version":1,"packId":"<hash>"}` to a temporary name and rename it onto
   `current.json` the same way -- or, once the pack is listed, run `tsx tools/writeLocalTexturePack.ts <MPn>
   --set-default <hash | name>`, which checks it first.

## 8. What the loader guarantees, and what it does not

Guaranteed (`texturePackRuntime.ts`):

- **Nothing fetched when off.** `LocalTexturePacks` exists only when the document's body has the `test-room` class
  (`mountLocalTexturePacks`); with no Experimental view, its effects switch off, or a map that is not `MP<n>`, `start`
  returns before any request. With the chooser on Original the library is read (to list it) but no pack is applied and
  no payload is fetched. Leaving the test room, a new map, page hide or the world's disposal aborts the request in
  flight and restores (`stopApply`, `endSession`, `dispose`); a new choice restores first, then applies; a late
  response is dropped by the generation counter (`current()`).
- **Bounded streaming.** One request at a time, `cache: 'no-store'`, `redirect: 'error'`. `boundedBytes` refuses a
  `Content-Length` over the limit and stops the moment the body exceeds it, whatever the header said: 1024 for the
  pointer, 1 MiB for the manifest, the entry's declared `bytes` for its payload.
- **Everything checked before use.** The manifest's hash is its id; it is validated field by field; its map must be the
  loaded one; each entry's source must be eligible and match `sourceDigest` both ways, the mip flag, level count, sizes
  and level hashes; the payload must match `bytes` and `sha256` with every alpha 255. Any failure keeps the original,
  and says why (§5).
- **Exact restoration.** `TexturePackTarget.apply` keeps the original `image`, `mipmaps` and `generateMipmaps` of the
  three.js `DataTexture` it replaces, disposes the GPU allocation and uploads the new levels; `restore` puts the
  originals back and re-uploads. One texture object serves world and prop draws, so one swap covers both. The rendered
  checks of research 260 §7 observed OFF after ON restoring pixel-exact on WebGPU and WebGL2.
- **The status line** (`#exp-pack-status`, `packStatusText`) names what the "Texture pack" chooser applied:
  `Original textures active.`; `<name>: <n> of <m> texture(s) applied.` (`loading, ...` while it runs), followed by
  `Kept original: <key> (<reason>), <key> (<reason>) and <k> more.` when entries were refused (the first two in full);
  `<name>: refused -- <reason>` for a refused pack; `packs.json: refused -- <reason>` or `current.json: refused --
  <reason>` for a refused library; and, while no pack is chosen, `current.json: refused -- <reason>` (`not JSON`, `not
  version 1`, `packId is not a sha256`) for a present but malformed pointer, the index's packs still listed and
  selectable. An absent `current.json` (404 or `text/html`) gives `Original textures active.` with no reason. The
  scale and method are in the chooser's option, "<name> (<scale>x, <method>)".

Not guaranteed:

- No proof of visual quality: the loader proves a pack loads and applies (GX.R7), not that it looks right; that is the
  owner's judgement in the test room (H135). A model invents detail the original does not have (research 260 §8).
- No change to the menu path, the match or any build without the test room: outside the Experimental view nothing
  changes and the shaders compile the original graph (H135).
- No VRAM or frame-cost measurement (`retainedBytes` counts CPU payload bytes); no pack for a texture outside the
  eligible set, and none for alpha-cut textures (fences, foliage) in this slice.

## 9. Licences and sharing

- **Model weights never enter git**, nor any export or import directory inside the repository tree (GX.R2; the
  generator refuses one under the repository root). The manifest records a weights file by name and sha256 only. Each
  model's licence is the maker's to read and follow (Real-ESRGAN's weights are BSD-3 at their release; a community model
  carries its own terms).
- **A pack is the maker's local data**, under the ignored `public/experimental-packs/` of one checkout, served to that
  host's own browser; nothing of it is committed, uploaded, deployed or shared (RS.R8, OT.R31, OT.R34; research 260 §4, §7).
- **The disc's textures remain the owner's.** The exported PNGs are decoded disc data; a pack made from them is a
  derivative and is not redistributed, posted or offered for download. Someone who wants the same pack makes it from
  their own disc with the same tool, model and `method`; two such manifests' hashes agree when the inputs do.

## 10. Uploading a pack in the test room

GX-27 (the owner's word, 2026-10-15; plan `2026-10-10-web-graphics-slice-4-packs.md`): the Experimental panel's
"Import pack (.zip)" button, beside the "Texture pack" chooser, builds a pack in the page from a **base pack's zip**
whose PNGs an artist replaced. A browser adaptation under H135 like every pack: the button is enabled only while the
Experimental view is on, and the upload changes texels only, never what is drawn or how.

**The base pack** is the generator's export (§7, step 1, `--export --roles wide`) zipped: `export.json`, and per
texture `<stem>.png` (the 3x3-padded image, `paddedWidth` x `paddedHeight`) and `<stem>.json` (its sidecar). The
owner's base packs are named `<name>-mp<n>-basetextures.zip` (`vigilance-mp51-basetextures.zip`), and the all-maps
package holds one folder a map, `<name>-mp<n>/`. Those names are for people: **the map is always the `mapArchive` of
the folder's `export.json`, never a file or folder name.**

**The upload** (`texturePackUpload.ts`, `readUpload`):

- Files flat at the zip's root, or under folders of any name and depth; every folder holding an `export.json` is one
  map's part (`__MACOSX/` ignored; other files, a README, ignored). Two folders whose `export.json` name the same
  archive refuse the upload ("<a> and <b> both export RUN/MP51.ZDB").
- Each `<stem>.png` is either untouched -- its export's own size: the texture keeps its original, left out as
  `untouched` -- or replaced by an image exactly **2x or 4x** the padded size. Every replaced PNG of the zip is at one
  scale ("mixed scales" refuses); another size is left out as `size`; 8-bit RGB or RGBA, not interlaced, every alpha
  255 (§4; a bad one is left out with its reason, `unreadable` or `alpha`). No PNG replaced refuses ("no texture was
  replaced"). Keep `export.json` and every sidecar as exported.
- `pack.json` (optional; the folder's own, else the nearest one above it): `{"name": "<1-48 printable ASCII>",
  "notes": "<0-240 printable ASCII>", "method": "<1-512 printable ASCII>"}`, each optional, at most 4096 bytes. The
  name defaults to the zip's file name without `.zip` (anything not printable ASCII as `_`, cut to 48), the method to
  `uploaded`, the notes to empty. A malformed one refuses with its reason ("pack.json: name is not 1-48 printable
  characters").
- The pack is built by the generator's own import core (`texturePackBuild.ts`, `importExport`, §4 and §7) against the
  loaded map's eligible sources for the export's roles: the same PNGs and the same provenance give the same `packId`
  as `--import` (`tools/test/localTexturePackUpload.test.ts`). Its provenance is the export's `archiveSha256`,
  `archiveBytes` and `toolCommit`, and `toolSha256 = sha256("s2u-texture-pack-upload/1")`; a source without a library
  takes its `library` and `record` from its sidecar.
- A part for the loaded map is built at once, listed and chosen ("<name>: <n> textures imported, <k> kept original
  (<count> <reason>, ...)."); a part for another map is stored **staged** and built the next time that map is loaded
  with the Experimental view on. A part with no PNG replaced (an all-maps package's untouched maps) is skipped, with one
  line for all of them ("15 maps unchanged, skipped."). A staged part is bounded before anything of it is read: the
  sizes its zip declares for `export.json`, the sidecars and the replaced PNGs must fit the room left in the store.
- **The page stalls while it builds.** The decode, the crop and the Lanczos reductions run on the page's main thread
  (no worker yet): the test room can stop responding for seconds on an import, and again when a map whose upload was
  staged loads -- longest for 4x images of 512-texel textures.

**Plain packs.** A zip with no `export.json` and at least one `.png` is a plain pack. A zip that has an `export.json`
stays on the path above; the two are never mixed in one zip. The PNGs sit at the zip's root or in folders of any name
and depth (`__MACOSX/` ignored). A file's key is its basename without `.png`, lower-cased, and a name with no dot gains
`.tif` (`ak47.tif.png` is `ak47.tif`; `road_cobble.png` is `road_cobble.tif`). Two files that give one key refuse the
upload, and both are named. The pack is for the loaded map only: it names no archive, it is built at once, and it is
never staged. `pack.json` at the zip's root stays optional (`name`, `notes`, `method` as above) and may also say
`"roles": "world"` or `"wide"` (the default is `wide`) and `"mapArchive"` (`RUN/MP72.ZDB`), which when present must be
the loaded map or the upload is refused, naming both. Each PNG whose key is an eligible source for those roles
(`packSourcesFor`) is replaced when its header is exactly 2x or 4x that source's base level, all at one scale ("mixed
scales" refuses, as above); any other size is left out as `size`. A PNG whose key is not an eligible source on this map
is kept original and counted as `notEligible`. The image is not padded and is not cropped. Nothing replaced refuses
("no PNG names an eligible texture on <map> at 2x or 4x"); more than a pack's 256 replaced refuses ("more than 256
replaced textures"). The decode keeps §5's caps as it goes: each image is sized off its header first, and once the next
would take the decoded total past 192 MiB it is left out as `totalBytes` without being decoded and every PNG after it unread, the pack built
from what is held -- refused only when nothing is left, as §5 says. Provenance is the loaded map archive's own sha256 and size
(read through the page's disc source), `toolCommit` the build's full commit (`git rev-parse HEAD`, `__VIEWER_COMMIT__`;
the About line's short revision is not 40 hex), and `toolSha256 = sha256("s2u-texture-pack-upload/1")`.

**The bounds** (`zipReader.ts` `ZIP_LIMITS`, `texturePackUpload.ts` `UPLOAD_LIMITS`, `texturePackStore.ts`; the
instrument's, not console values): the zip at most 2 GiB, read by ranges (never held whole); at most 8192 members and
a 4 MiB central directory; a member at most 160 MiB inflated (a PNG of the largest padded image the import decodes,
6144 x 6144 RGBA, stored); `export.json` 1 MiB, a sidecar 64 KiB, `pack.json` 4096 bytes. Stored (0) and deflated (8)
members only, sizes and CRC-32 checked; a member whose declared compressed size passes the bound, or a stored one whose
two sizes differ, is refused before it is read; inflation is fed 16 KiB at a time (`INFLATE_SLICE_BYTES`) and stops
as soon as the output passes the member's declared size, so a deflate bomb's overshoot is bounded by the slices in
flight (deflate expands a 16 KiB slice to about 16.5 MiB at most). **A named difference:** a PNG whose zlib stream is
followed by extra bytes inside its IDAT is accepted by the generator (`--import`, node's `inflateSync` ignores them)
but refused by the upload (the browser's `DecompressionStream` refuses them): that texture is left out as
`unreadable` and keeps its original -- re-save the PNG with an ordinary image tool (`png.test.ts` pins both). A
sidecar whose `paddedWidth` x `paddedHeight` is not 3x its texture leaves that texture out as `changed`, whether its
map is built at once or staged. Zip64, a multi-part zip, encryption, another method, a duplicate name and a
name that would leave the archive (`..`, absolute, a drive, a backslash) are refused with the reason. The import
itself keeps every cap of §5.

**Where it is kept.** In the browser's IndexedDB for the page's own origin -- the database `s2u.texturePacks`, a record
per map and pack id (its library entry) and its files (`manifest.json`, `<i>.rgba`; a staged part keeps its zip files)
-- at most 32 uploads a map and 512 MiB in all (`UPLOADED_PACKS_PER_MAP_LIMIT`, `UPLOADED_PACKS_BYTES_LIMIT`); over
either, the import is refused with the reason. **Nothing leaves the browser**: no upload to a server, no file written
to disk; clearing the site's data removes them. Where IndexedDB is missing, refused or blocked by another tab, the
served library (§2) works as before and the panel says "Uploads are unavailable: <reason>.", the button disabled.

**The chooser.** The library is `packs.json`'s entries (or `current.json`'s pack) and then the loaded map's uploaded
packs, each listed "<name> (<scale>x, <method>, uploaded)"; an uploaded pack of another map is not listed. Choosing one
applies it through the same checks as a served pack (§8: the manifest's sha256 is its id, every entry bound to the
decoded source, refusals keep the original and are reported). "Remove", enabled while an uploaded pack is chosen,
deletes it from the store and returns the chooser to Original.

**Campaign maps** (the merge controller's word, 2026-10-15): the rules of this document cover the twelve campaign
archives `RUN/M51.ZDB` ... `RUN/M83.ZDB` as they cover `RUN/MP<n>.ZDB` -- the generator's export and import, the
manifest's `mapArchive`, the runtime and the upload. Where a campaign pack applies: wherever a campaign map is loaded
under the test room's pack loader with the Experimental view on. Today that is nowhere: the test room's map list is the
multiplayer archives only (`packages/archive/src/mapIndex.ts`, `MAP_ARCHIVE`), and the forge, which builds campaign
worlds (each with its pack target), mounts no Experimental panel and no pack loader. A campaign upload is therefore
stored staged until such a page exists (GX-27's report).
