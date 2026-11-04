# Pack framework v2 -- the frozen contract (FCW-05)

Product adaptation, 2026-10-25 (OT.R53 product track; `PACK_FRAMEWORK_ADAPTATION`). A creator pack has no original:
it is opt-in, its bytes stay on the user's device (XT.R4, H275), and with no pack enabled the game is unchanged
(XT.R9). This is XT-1's manifest and XT-3's diagnostics as code: `socomlegacy/packages/creator-contracts`
(`@s2u/creator-contracts`), browser-safe (no DOM, renderer or Node API). The plan of record is
`docs/plans/2026-10-24-forge-creator-wishlist.md`, FCW-05 and "Shared interfaces"; the direction is
`docs/plans/2026-10-22-extensibility.md` (XT.R1-R12).

## The manifest -- `s2u-pack.json`

The manifest is the pack's member `s2u-pack.json` (`pack.json` is already a texture upload's metadata member).
Unknown fields are refused.

| field | rule |
|---|---|
| `format`, `formatVersion` | `"s2u-pack"`, `2` |
| `id` | 1-64 of `a-z 0-9 . -`, starting and ending with a letter or digit, no `..`; a legacy namespace (`mod.`, `model.`, `texture.`) sits outside the 64, so every valid `s2u-mod` v1 id maps; those three prefixes are reserved for the legacy adapters: a v2 manifest's own `id` beginning with one is refused (`FIELD_INVALID`), while an `{id, range}` dependency may name an adapted pack by its namespaced id |
| `version` | SemVer 2.0.0 |
| `name`, `description?` | printable ASCII, 1-48 and 0-400 (the `s2u-mod` v1 bounds) |
| `target` | the disc revision; must equal the build's (`PACK_TARGET_US`, `SCUS-97275`); an alias is refused (`FIELD_INVALID`, naming the canonical value) |
| `contract` | a range the build's engine contract version must satisfy |
| `kinds` | each of `content`, `rules`, `system` at most once (XT-1's "behaviour" is spelled `rules`: declarative only, H272) |
| `sides` | `client`, `server` or `both` |
| `dependencies` | `{id, range}` (another pack) or `{archive, sha256}` (the user's own disc archive) |
| `files` | `{path, sha256, size, role}`; the roles and payload types are below |
| `intents` | XT.R12: `{kind: cosmetic / gameplay-value / new-behaviour, files}`; every member is covered, and a `collision`, `gameplay` or `rules` member never by `cosmetic` alone |
| `handlers?` | `{slot, handler, actions?, options?}` claims on engine-owned handlers; no pack code runs; `options` a plain JSON object the contract bounds in shape and the handler checks in content (LATER 458, `2026-10-25-extension-contracts.md`) |

Roles and the payload types each carries: `mesh` (glb, gltf), `texture` (png, ktx2, rgba), `audio` (ogg, wav),
`collision` (json, glb), `gameplay`, `rules`, `system` and `legacy-manifest` (json), `data` (any).

Ranges: `*`, `1.2.3` / `=`, `>`, `>=`, `<`, `<=`, `^` (left-most non-zero part fixed), `~` (minor fixed), sets
separated by spaces, alternatives by `||`. Pre-release versions compare by SemVer precedence and are not excluded.

**The three earlier loaders** (XT.R11) map onto v2 `content` through `context.legacy`, each parsed first by its own
viewer parser: `s2u-mod` v1 becomes `mod.<id>` (role `data`, intent `gameplay-value`, a non-SemVer version kept as
`0.0.0+legacy.<version>`); the model pack becomes `model.current` 1.0.0 (role `mesh`, cosmetic); a texture pack
becomes `texture.<map>` 1.0.0 (role `texture`, cosmetic, its entries' own sha256 and sizes, and its
`provenance.archiveSha256` as an archive dependency when present). Each is `sides: client`, `contract: *`.

Published runtime values: `ENGINE_CONTRACT_VERSION` `0.1.1` (FCW-30's rules vocabulary, additive; was `0.1.0`) and `PACK_TARGET_US` `SCUS-97275`; the contract owns the
target aliases, `PACK_TARGET_ALIASES` (`socom2-us-r0001`, the `s2u-mod` v1 spelling, -> `SCUS-97275`), and
`canonicalPackTarget(raw)` (the canonical value or an alias's, exactly, else null): only the `s2u-mod` adapter resolves
one (a v1 target neither canonical nor an alias is `TARGET_MISMATCH`; the literal stays in its `legacy.manifest` member),
and the registry never rewrites a target.

## Identity -- `PackRef {id, version, hash}`

`hash` is `packDigest(manifest)`: SHA-256 (lower-case hex) of the canonical JSON of
`{"digest":"s2u.pack","manifest":...,"version":1}`, the manifest's `files` rows NFC and in UTF-8 byte order of their
paths, and its sets in canonical order (each element by its canonical JSON in UTF-8 byte order): `kinds`,
`dependencies`, `intents` and each one's `files`, `handlers` and each one's `actions`. The author's order never
changes the hash; every other field does, `name` and `description` included (a choice left open for the registry,
FCW-06, to confirm). `memberDigest` is the same over
`{"digest":"s2u.pack-members","members":[[path,sha256]...],"version":1}`.
Canonical JSON: plain data only, object keys in UTF-8 byte order (never `localeCompare`, never UTF-16 units), no
whitespace, undefined properties left out, non-finite numbers refused. SHA-256 is WebCrypto `subtle` in the browser
and Node, or an injected function (`setSha256Fallback`, or `context.sha256`). Two golden vectors are pinned in
`test/digest.test.ts`, computed outside the package and asserted through WebCrypto and `node:crypto`.
`createSha256()` is the incremental form (`update(chunk)`, `digestHex()` once, then `STREAM_DONE`), so a member is hashed
from a store cursor without being reassembled: an explicit factory, else `setSha256StreamFallback`'s, else
`node:crypto`'s where the host has it synchronously, else the pure-JS FIPS 180-4 `sha256Pure` (the browser's path:
WebCrypto has no streaming digest), each tested on the FIPS vectors, both golden vectors and a 64-bit length.
A hash shows compatibility, never that a client uses those bytes (XT.R6).

## The check -- `validatePack(files, context): Promise<PackValidation>`

`files` are approved members, each whole (`{path, bytes}`) or streamed (`{path, size, read()}`, "Streamed
members" below); `context` is the build (`target`, `contract`) and, each optional, the
available packs, the user's disc archives by path and sha256, the engine's handler catalogue `{id, slot, actions}`
and the slots already held. Only a `pass` returns `{ok: true, manifest, ref, report}`, the manifest frozen; anything
else is `{ok: false, report}`. A check whose context is absent is a `pack.CHECK_SKIPPED` note with status `skipped`,
and the report is `incomplete`, never `pass`.

Paths: relative, forward slashes, NFC; refused: a drive or leading slash or `..` (`PATH_ESCAPE`); a scheme
(`EXTERNAL_URI`); a backslash, control character, colon, percent sign, empty, `.`-led, trailing dot or space,
`<>"|?*` or reserved device segment, over 240 characters or 16 deep (`PATH_INVALID`); two paths equal after NFC or
case folding (`PATH_COLLISION`). Any manifest string holding `scheme://`, or starting `data:`, `javascript:`,
`vbscript:`, `blob:`, `file:`, `about:` or `mailto:`, is `EXTERNAL_URI`.

## The bounds (named constants, `*_ADAPTATION`)

| constant | value | source |
|---|---|---|
| `PACK_FILES_ADAPTATION` | 8192 members | `viewer/src/agent/localFiles.ts` `LOCAL_FILE_LIMITS.files` |
| `PACK_BYTES_ADAPTATION` | 512 MiB | `LOCAL_FILE_LIMITS.bytes` |
| `PACK_MEMBER_BYTES_ADAPTATION` | 500 MiB | `viewer/src/modelPack.ts` `MODEL_PACK_LIMITS.glbBytes` |
| `PACK_MANIFEST_BYTES_ADAPTATION` | 1 MiB | `viewer/src/texturePack.ts` `PACK_LIMITS.manifestBytes` |
| `PACK_PATH_CHARS_ADAPTATION`, `PACK_PATH_DEPTH_ADAPTATION` | 240, 16 | `LOCAL_FILE_LIMITS.path`, `.depth` |
| `PACK_ID_CHARS_ADAPTATION`, `PACK_NAME_CHARS_ADAPTATION`, `PACK_DESCRIPTION_CHARS_ADAPTATION` | 64, 48, 400 | `viewer/src/mods/manifest.ts` |
| `PACK_DEPENDENCIES_ADAPTATION`, `PACK_INTENTS_ADAPTATION` | 64, 64 | this spec's choice (no earlier loader names one) |
| `PACK_HANDLERS_ADAPTATION`, `PACK_HANDLER_ACTIONS_ADAPTATION` | 32, 64 | this spec's choice |

For a v2 manifest, sizes are checked against the declared `size` before any member is hashed. A legacy pack
(`context.legacy`, no `s2u-pack.json`) has no manifest sizes to check first: its adapter bounds each member it names
by the member's own size (`PACK_MEMBER_BYTES_ADAPTATION`) before hashing it (a texture pack's entries keep their own
sha256 and sizes, compared and hash-verified like a v2 row), and the result is then bounded like any manifest.

### Streamed members

`PackFile` is `BufferedPackFile` (`{path, bytes}`) or `StreamedPackFile` (`{path, size, read()}`: `size` is the byte
count the store declares, `read()` an `AsyncIterable<Uint8Array>` of the bytes in order, once per call;
`isStreamedPackFile` tells them apart), so a store holding a 500 MiB member as chunks is validated without
reassembling it. Every bound and comparison runs on the declared sizes before any read: the pack's total and the
manifest's own bound (`PACK_BYTES_ADAPTATION`, `PACK_MANIFEST_BYTES_ADAPTATION`) on the stored sizes, the member bound
(`PACK_MEMBER_BYTES_ADAPTATION`) on the manifest's sizes (a legacy adapter's on the stored size), and the stored size
against the manifest's (`MEMBER_INFLATED` / `MEMBER_TRUNCATED`); a stored size that is not a non-negative integer is
`FIELD_INVALID`. A member's bytes are then read through one path, `memberHash`: whole bytes hashed at once, a stream's
chunks fed to `createSha256()` with a running count, never concatenated or kept, each member read at most once per
validation. The first chunk that carries the count past `size` stops the read (the iteration is broken, so the
store's cursor closes) and is `MEMBER_INFLATED`; a stream that ends short is `MEMBER_TRUNCATED`. Only the manifest
member (`s2u-pack.json`), bounded first, is gathered whole (`memberText`), into a buffer of its declared size and never
past it. The ref is the same as the buffered form's: the pack hash is over the manifest, not over how its bytes were
held.

## The refusal codes (`PACK_CODES`, namespace `pack.`)

`MANIFEST_MISSING`, `MANIFEST_TOO_LARGE`, `MANIFEST_INVALID`, `LEGACY_INVALID`, `FIELD_UNKNOWN`, `FIELD_INVALID`,
`FORMAT_VERSION`, `TARGET_MISMATCH`, `CONTRACT_MISMATCH`, `PATH_INVALID`, `PATH_ESCAPE`, `PATH_COLLISION`,
`EXTERNAL_URI`, `TOO_MANY_FILES`, `TOO_LARGE`, `LIMIT_EXCEEDED`, `MEMBER_TOO_LARGE`, `MEMBER_INFLATED` (more bytes
than declared), `MEMBER_TRUNCATED`, `MEMBER_MISSING`, `MEMBER_HASH_MISMATCH`, `MEMBER_UNLISTED`, `ROLE_MISMATCH`,
`INTENT_MISSING`, `INTENT_MISMATCH`, `DUPLICATE_ID`, `DEPENDENCY_MISSING`, `DEPENDENCY_ARCHIVE_MISMATCH`,
`DEPENDENCY_CYCLE` (by id, through the available packs), `HANDLER_CONFLICT` (two claims on a slot, or a slot another
pack holds), `HANDLER_UNKNOWN`, `ACTION_UNKNOWN`; FCW-33's `STORE_FILE` (a `files` row naming a Thunderstore root
file), `CONTRACT_FLOOR` (a rules pack admitting an engine before 0.1.1), `RULES_MEMBER_INVALID` and
`CAPABILITY_MISMATCH` (below); and the note `CHECK_SKIPPED`. Each error carries `file` or
`field`, and `expected` / `actual` / `hint` where they help a repair.

## Rules packs: the contract floor and the capabilities (FCW-33, FCW-30's review F4)

`RULES_PACK_CONTRACT_FLOOR` is `0.1.1`, the first engine contract carrying the rules vocabulary (FCW-30); it stays
`0.1.1` when `ENGINE_CONTRACT_VERSION` moves on. A pack whose `kinds` include `rules` states a `contract` whose every
`||` alternative holds a lower bound -- `>=v`, `>v`, `^v`, `~v`, `=v` or a bare `v` -- with `v` at or above `0.1.1` by
SemVer precedence; otherwise `CONTRACT_FLOOR` at `contract`. The rule is sufficient, and stated so: `*`, an
alternative bounded only from above (`<0.2.0`), or one whose floor is below (`^0.1.0`, `>=0.1.0`, `>0.1.0`, which
admits `0.1.1-rc.1`, and `>=0.1.1-rc.1` itself) is refused even where nothing below 0.1.1 is ever published. A
content or system pack's range is unchanged (`>=0.1.0` validates).

A `rules` member is bounded by `PACK_RULES_MEMBER_BYTES_ADAPTATION` (the manifest's 1 MiB) and read once: gathered
whole, hashed from those bytes and, once every member's bytes have verified, parsed for its `RulesSpec.capabilities`
(`RULES_MEMBER_INVALID` when it is not a UTF-8 JSON object, or its `capabilities` are not a list of
`{slot, handler, actions?}`). The claims agree (`CAPABILITY_MISMATCH` otherwise): each capability a rules member
names is a manifest `handlers` claim on that slot with that handler, its actions among the claim's (at the member,
`capabilities[i]`); each manifest claim on a `behaviour.*` slot (the behaviour slot family, `handlers.ts`
`BEHAVIOUR_SLOTS`) is named by some rules member's capabilities (at `handlers[i]`). A claim outside the family -- a
presentation tint -- is the manifest's alone. The rest of a spec is `validateRules`'. One gap is FCW-30's design, not
closed here: a manifest claims one handler per slot (`HANDLER_CONFLICT`), while a spec may name two capabilities on
one shared slot (`behaviour.npc.patrol` and `.sentry`); such a spec cannot be packed until the manifest takes more
than one claim on a shared slot.

## Thunderstore's package format (FCW-33; the format only, H342)

Thunderstore's wiki, "Creating a package", as the rules spec §8 quotes it (read 2026-10-26; nothing fetched, no store
page). Held as data: `THUNDERSTORE_PACKAGE_RULES` (the root files `manifest.json`, `icon.png`, `README.md`, optional
`CHANGELOG.md`; the store manifest's keys `name` `[A-Za-z0-9_]` to 128, `version_number` strictly Major.Minor.Patch,
`website_url`, `description` to 250, `dependencies` `Team-Name-x.y.z`; the icon 256x256). The wiki's ~5 GB package
bound is not checked: ours (512 MiB) is below it. Research 370 lists the one placeholder.

**The store files: a defined exception, not members.** Beside a v2 pack's own `s2u-pack.json`, the four root files
(`THUNDERSTORE_STORE_FILES`, those exact spellings at the root) are not `MEMBER_UNLISTED`, are never hashed, and a
`files` row naming one is `STORE_FILE`. Chosen over listing them as members because the pack hash is `packDigest`
over the manifest: as members their sha256 rows would change the pack's identity at every README, changelog, icon or
store-manifest edit; as the exception the pack's `PackRef` is the same with them, without them, and across their
edits (pinned in `test/thunderstore.test.ts`). They still count toward the pack's file and byte bounds. With no
`s2u-pack.json` there is no exception: a texture pack's root `manifest.json` stays its legacy manifest (the viewer's
`install` routes it so, `registry.ts`, and keeps doing so). Our own `name` and `description` stay in the digest; the
store's copies are outside it.

**The export identity.** `thunderstoreName(id)`: our id with `.` and `-` as `_` (our grammar is `a-z 0-9 . -` to 64
past a legacy namespace, theirs `[A-Za-z0-9_]` to 128), null for what is not a pack id. The map is not one-to-one
(`a.b` and `a-b` meet), so an export refuses any two ids that meet -- among the pack's own and its dependency closure (the
device's given packs' own dependencies, followed; an installed pack the export does not reach never blocks it) -- as `store.NAME_COLLISION`; nothing is renamed to fit. `thunderstoreIdentity(id, team)` is
`Team-Name`, the team `THUNDERSTORE_TEAM_PLACEHOLDER` until H342 names it (a stand-in that is a valid store name).
`thunderstoreVersion(v)`: a store version is ours when strictly Major.Minor.Patch -- a pre-release or build is
`store.VERSION_INVALID` at export (ours still validates it: SemVer).

**The export.** `thunderstoreManifest(manifest, {team?, packs?, websiteUrl?, description?})` writes the store's
`manifest.json` from a validated v2 manifest, its keys in the wiki's order. The resolution rule: each `{id, range}`
dependency becomes the exact pin `Team-Name-x.y.z`, its version the highest release among the given packs with that
id inside the range (pre-releases are not store versions and are never pinned); none -- or no packs given -- is
`store.DEPENDENCY_UNRESOLVED`. A disc archive dependency has no store form: it stays in `s2u-pack.json`
(`store.ARCHIVE_DEPENDENCY`, a note). `website_url` is the option (our manifest cannot carry an address:
`EXTERNAL_URI`), empty or an http(s) address (`store.WEBSITE_INVALID`); the description is the option or our own,
never cut (`store.DESCRIPTION_TOO_LONG` past 250).

**The checker.** `checkThunderstorePackage(files, {pack?})` tests a zip's members against the rules as data, with no
network: each required root file present at the root (`store.FILE_MISSING`; a file inside a folder is not at the
root), the store manifest a UTF-8 JSON object within the manifest bound whose keys keep their rules
(`store.MANIFEST_INVALID` at the key), `icon.png` a PNG whose IHDR says 256x256 (`store.ICON_INVALID`; the header
only, no image decoded), and, given the pack's own manifest, the store name and version its (`store.MANIFEST_MISMATCH`).
A pack bound for the store passes both this and `validatePack`.

**Import.** The viewer's local-pack API imports kind `pack` (`registry.ts` `importPack`): a granted path or staged pick,
a lone zip unpacked, `s2u-pack.json` at the root or in the one folder a zipped directory adds, then the one install path
(`installFiles`, which `install` also reaches) -- validated, stored in the framework records, never enabled or applied
(`apply` is refused: no live driver applies a v2 pack). Staging names a pick holding `s2u-pack.json` kind `pack` before
a root `manifest.json` or a PNG reads as a texture pack. The local import reads, for kind `pack` only (the legacy imports refuse them, `legacyExtensions`), `.md`, `.gltf`, `.ktx2`, `.ogg` and
`.wav` members as bytes (`localFiles.ts`). The agent's `packs.import` takes kind `pack` (`forgeTarget.ts`); a surface's
`allowedSurface` still decides (the solo room's and the Forge editor's, `forgePacks.ts`, both admit it, for storage).

## The diagnostics model (FUI-5's, extended once)

`Diagnostic {schema: "s2u.creator/diagnostic", version: 1, source, severity: error / warning / note, status?, code,
text, at?, id?, file?, field?, expected?, actual?, hint?, evidence?, reference?, revision?}`; `PackDiagnostic` is a
`Diagnostic` from source `pack`. `CheckReport {schema: "s2u.creator/check-report", version: 1, status, diagnostics,
evidence?, revision?}`; status `pass` / `fail` / `skipped` / `blocked` / `incomplete`: an error fails, then a blocked
check blocks, a check that never ran is skipped, a skipped or incomplete part makes the whole incomplete, and only
then pass. `isReady` is `pass` alone. Adapters: `fromMapIssue` / `fromMapCheck` (forge `MapIssue` -> `map.<kind>`
error with its Jump point; a note -> `map.check-skipped`, skipped), `fromLocalPackDiagnostic` (`local.<code>`
warning, incomplete, the count as `actual`) and `fromLocalPackError` (`local.<code>` error). The viewer's shapes are
redeclared structurally: importing them would pull the viewer into this package and make a cycle.

## Content -- an authored map (`maps/<mapId>.json`, FCW-10)

A pack's `content` may carry a complete authored map as the member `maps/<mapId>.json`
(`s2u.creator/content-map` version 1, `maps.ts`), read by `readContentMapDefinition(json, ref, options)`.

**Identity (S3c).** The member names its map by `mapId` (and a display `name`) only, never by a `ContentRef`: the
pack's hash is `packDigest` over a manifest that lists the member's own sha256, so a writer cannot know it before the
bytes are written. The reader attaches the caller's `ref` to the definition, as `readAssetDefinition` does for an
asset member; `map.REF_MISMATCH` compares the member's `mapId` with `ref.assetId` alone, a missing or malformed `mapId`
is `map.REF_INVALID`, and a member that still carries a `ref` field (a writer from before S3c) is refused
`map.REF_IN_MEMBER`, never read past. `contentMapMember(def)` gives back the member a writer writes. The map's
`gameplayDigest` (canonical version 3 since S3c; 2 since S3b) hashes its units, axis, bounds (they lay out the hull's
grid), regions, spawns, objectives, navigation and props -- never the map's own reference (its pack's id, version and
hash, its map id), and each prop by its pack's id and version and its asset id, never its pack's hash -- so a pack
re-published with the same gameplay keeps its digest. The hash pins a prop's bytes where its pack is resolved (the
map's `dependencies`, checked against the device's packs), not in the digest.

**A prop of the map's own pack (S3d).** For the same reason a map member cannot name its own pack's hash, a prop it
places from its own pack names no pack: its `content` is `{assetId}` (or `{kind: "pack", assetId}`, `pack` absent),
and the reader attaches the caller's `ref.pack` to it as it attaches the map's `ref`. Such a prop needs no entry in
`dependencies` (the map's own pack is implied). A prop that names a pack keeps the full `ContentRef` rule, its pack
listed in `dependencies` (`map.DEPENDENCY_UNDECLARED` otherwise); one that names the map's own pack -- `ref.pack`'s id
and version, with whatever hash -- is refused `map.PROP_OWN_PACK_REF`, never read, so no writer tries. Since
2026-10-26 (LATER 459) the own pack is that id and version, not the id alone: a dependency naming it (any hash) is
refused `map.DEPENDENCY_OWN_PACK` at `dependencies[i]` (the own pack is the reader's reference, never listed, and is
not checked against the device's packs), while another version of the same pack id is an ordinary pack, its prop a
full reference declared in `dependencies`. `contentMapMember(def)` writes a
prop whose pack is `ref.pack` back as `{assetId}`. The gameplay digest names an own-pack prop by the map's reference's
pack id and version and its asset id, so it canonicalises as a foreign prop of that same pack id, version and asset id
does in another map, whatever hash that one names: intended, the digest keys on `id@version` + `assetId`.

## Not in this contract

The registry and lifecycle (FCW-06), the extension host and handler catalogue (FCW-07b), the servers' resolution of
gameplay packs and their agreement on a pack's gameplay digest (FCW-17; an authored map's own `gameplayDigest` is in
the contract, "Content" above), the JSON schema files under `viewer/src/packs/schema/`, and the rendered-browser run of
the golden vectors.
