# Pack format 0.2 -- the review and the proposal (FP-8; DRAFT for the owner's read)

> **Superseded 2026-11-11** by [`2026-11-11-pack-format-0.2-and-forge-io.md`](2026-11-11-pack-format-0.2-and-forge-io.md)
> (the FX sprint, FX.R1). Kept as the record the Forge path plan's FP-8 Log entries cite: the review of what 0.1.x did
> and the first 0.2 proposal. Nothing here is a ruling. Carried from `agent/fp-10` `2d54217678` (PRs #750 and #755,
> both closed unmerged) into `agent/forge-v4`.

> Written 2026-11-08T14:33Z on `agent/fp-8`, over the first draft of 14:17Z (`393219fa6`), which it replaces. The
> tree is `agent/fp-4` at `c7cfdcb1d` (PR #746: contract `0.1.2`, the bundle validator, content map v2, the sample
> fixture, the bundle's JSON Schema). FP-5's import is not in this tree. It is cited at `agent/fp-5` `88d1dde31` as
> `<file>@88d1dde31:<line>`, read with `git show`. Every other path is `socomlegacy/packages/<pkg>/src/...` at `c7cfdcb1d`.
> Row FP-8 of [the Forge path plan](../plans/2026-11-07-forge-path.md). Design: [section 2 and FP.R7](2026-11-07-forge-path-design.md).
> **FP.R7 makes this a gate.** No pack of ours goes to Thunderstore, and no wiki page says "publish", before the owner
> has read this. **An adaptation:** the port's own pack formats. Nothing here describes or changes what the original
> game does (product track, OT.R53), so it has no research note and no ledger entry. Every number is the code's, cited
> to its constant. A value this document proposes is marked *proposed*: no code holds it yet.

## For the owner, in one paragraph

**If a modder already has a 0.1.1 pack, nothing changes for him until 0.2.** Contract `0.1.2` (PR #746, not yet on
`main`, which is still at `0.1.1`) is additive. A pack that states `^0.1.0` or `^0.1.1` (a *caret range*: any version from that one up to,
but not including, the next minor, `0.2.0`) loads on a 0.1.2 build as it
did (`rules.test.ts:549-554`, `bundle.test.ts:109-115`). 0.1.2 adds the Forge map bundle, content map v2 and, under
this proposal, four optional fields: `extensions` (anything a reader may skip), `license` (an *SPDX id*: the short standard name of a licence from the SPDX list, such as `CC0-1.0` or `MIT`), `authors`, and
`provenance` on each member (`original`, `derived` or `extracted`; an `extracted` member is refused). These go into
0.1.2 because a 0.1.x reader refuses every field it does not know (`packs.ts:551-555`). Each one has to land before
the first pack uses it, and before 0.1.2 is published. **0.2 changes how packs are read**:
- the build accepts a pack under a *set* of contracts, so `^0.1.x` packs keep loading after the bump;
- `target` becomes a list of retail releases;
- a pack may name the pack it replaces (`supersedes`); a rename stays a new identity (the controller, 2026-11-08);
- operator approval for servers arrives (withdrawal changes no format and can come in any build);
- a licence becomes required for anything published.

Section 10 lists the decisions that are yours, each with the default the work follows meanwhile, and the two the
controller ruled on 2026-11-08.

## How to read the tables

Each section ends with a **proposal table**: the field or rule, what it does, **when** (`0.1.2` = lands before 0.1.2 is
published: an additive field, or a new refusal, which only an unpublished contract may still take, since a stricter
patch would break section 2's additive rule; `0.2` = a change in how packs are read, after which older builds refuse
what uses it; `any build` = changes no format, so it can land in whichever build is ready; `later` = after 0.2), why, and what breaks if it is not done. A row in a table is a
proposal, not a ruling. A row marked **owner** waits for section 10.

## 1. What 0.1.x is today

### 1.1 The kinds and where each applies

| kind | marker | format | applies where | evidence |
|---|---|---|---|---|
| texture pack, HD | `experimental-packs/hd/current.json` under any folder | `s2u-hd-texture-pack` v1, keyed by the SHA-256 of the decoded RGBA (`hdTexturePack.ts:8-9`) | every page (ML.R5, H414) | `classify.ts:113`; `hdTexturePackStore.ts:108` |
| texture pack, GX | a built pack's own root `manifest.json`, `export.json` folders, or plain PNGs | `s2u-local-texture-pack` (`texturePack.ts:41`, checked `:84`) | every page (ML.R5, H414) | `classify.ts:116-122`; `texturePack.ts:9` (its bounds) |
| data mod | `mod.json` at the root or one folder down | `s2u-mod` v1 (`mods/manifest.ts:7-8`) | the test room only (ML.R5; H414 answered 2026-11-06) | `classify.ts:114`; `mods/manifest.ts:12-15` (its bounds) |
| model pack | `models.json` | `s2u-model-pack` v1 (`modelPack.ts:16`) | the test room only (ML.R5; H414) | `classify.ts:115`; `modelPack.ts:20-33` (its bounds) |
| v2 pack | `s2u-pack.json` at the root or one folder down | `s2u-pack`, `formatVersion` 2 | **stored, never applied** (ML.R3) | `classify.ts:112`; `registry.ts:600` ("A v2 pack is stored, not applied") |
| Forge map bundle | `forge-bundle.json` at the root or one folder down, with no `s2u-pack.json` beside it | `s2u.creator/forge-map-bundle` v1 | its packs stored as v2; its layout kept read-only for the Forge and the test room (FP-5, FP-6) | `classify.ts@88d1dde31:123-125`; `customMaps.ts@88d1dde31:1-26` |

A v2 pack declares `kinds` from `content`, `rules`, `system` (`packs.ts:94`). The three earlier loaders (`mod`, `model`,
`texture`) are read onto v2 by legacy adapters (`packs.ts:97`). Those adapters own the id prefixes `mod.`, `model.` and
`texture.`: a v2 manifest's own id may not start with one (`packs.ts:404`, `:566-568`). Every kind can arrive wrapped
in Thunderstore's root files: `unwrapThunderstore` (`packs.ts:1454`) sets them aside before the classifier reads the
payload (`classify.ts:6-10`, `:101-105`). Under ML.R3 the payload stays the earlier format as it is.

### 1.2 The v2 manifest, as the validator enforces it

The manifest takes exactly the fields of `TOP_KEYS` (`packs.ts:529`). It refuses any other top-level key with
`pack.FIELD_UNKNOWN` (`:551-555`), and any other key in a `files` row the same way (`ROW_KEYS`, `:530`, `:641`). It
refuses any `formatVersion` but 2 (`pack.FORMAT_VERSION`, `:561-563`). No string anywhere in the manifest may be a URI
(`scanUris`, `:518-527`).

| field | rule | refusal | evidence |
|---|---|---|---|
| `format` | `"s2u-pack"` | `FIELD_INVALID` | `packs.ts:14`, `:560` |
| `formatVersion` | exactly `2` | `FORMAT_VERSION` | `:15`, `:561-563` |
| `id` | 1-64 of `a-z0-9.-`, starts and ends with a letter or digit, no `..`; a legacy prefix is refused | `FIELD_INVALID` | `:67`, `:399`, `:411-416`, `:564-570` |
| `version` | SemVer 2.0.0, at most 64 characters | `FIELD_INVALID` | `:571`; `semver.ts:18-28` |
| `name` | 1-48 printable ASCII | `FIELD_INVALID` | `:68`, `:572` |
| `description` | optional, 0-400 printable ASCII | `FIELD_INVALID` | `:69`, `:573-575` |
| `target` | exactly the build's (`PACK_TARGET_US` = `SCUS-97275`); an alias is refused with its canonical spelling | `TARGET_MISMATCH` / `FIELD_INVALID` | `:27`, `:33`, `:576-583` |
| `contract` | a SemVer range the build's single version satisfies | `CONTRACT_MISMATCH` | `:25`, `:584-587` |
| `kinds` | a non-empty set of `content` / `rules` / `system` | `FIELD_INVALID` | `:94`, `:588-591` |
| `sides` | `client` / `server` / `both` | `FIELD_INVALID` | `:99`, `:592` |
| (rules floor) | a `rules` pack's range admits no engine before `0.1.1` | `CONTRACT_FLOOR` | `:77`, `:593-596` |
| `dependencies` | at most 64; `{id, range}` or `{archive, sha256}`; no duplicate, not itself | `FIELD_INVALID`, `LIMIT_EXCEEDED` (`:603`), `DUPLICATE_ID`, `DEPENDENCY_CYCLE` | `:52`, `:598-627` |
| `files` | 1-8192 rows `{path, sha256, size, role}`; the payload type set by the role; not the manifest; not a store file | `FIELD_INVALID`, `TOO_MANY_FILES` (`:634`), `PATH_COLLISION` (`:652`), `ROLE_MISMATCH`, `STORE_FILE`, `PATH_*` | `:41`, `:107-117`, `:630-666` |
| `intents` | at most 64 `{kind, files}`; every member covered; a `collision`/`gameplay`/`rules` member not covered by `cosmetic` alone (XT.R12) | `INTENT_MISSING`, `INTENT_MISMATCH` | `:53`, `:119`, `:669-705` |
| `handlers` | optional, at most 32 claims `{slot, handler, actions?, options?}`; options at most 4096 bytes, 2 deep | `FIELD_INVALID`, `HANDLER_CONFLICT` | `:54-62`, `:707-749` |

After the manifest come the members:
- each listed member is present, at its declared size and its SHA-256 (`:1129-1160`);
- each present file is listed, bar the Thunderstore root files beside an own `s2u-pack.json` (`:1161-1167`);
- with a context, the dependencies resolve (a skip is said, never passed), the disc-archive dependencies match the
  player's archives, and the handler claims match the catalogue (`contextChecks`, `:957-1024`).

### 1.3 The digest's scope

`PackRef = {id, version, hash}`, where `hash = packDigest(manifest)` (`digest.ts:277-286`): SHA-256 of the canonical
`{"digest":"s2u.pack","manifest":...,"version":1}`. The manifest is hashed whole, as the validator read it:
- `files` rows are NFC and in UTF-8 path order;
- `kinds`, `dependencies`, `intents` and `handlers` are taken as sets (`digest.ts:258-286`), so the author's order
  never moves the hash (`digest.test.ts:98`);
- the members enter only through their `sha256` rows.

So **every byte of every member is covered, through its hash; the zip's own bytes are not.** The pack framework spec
leaves one choice open: `name` and `description` are inside the digest, so renaming a pack makes a new identity
([pack framework, "Identity"](2026-10-25-pack-framework.md), lines 48-55). Thunderstore's root files are outside it:
changing only them keeps the hash (`packs.ts:85-91`; `thunderstore.test.ts:114`).

### 1.4 The bundle envelope and content map v2

- **`forge-bundle.json`** is exactly `{schema: "s2u.creator/forge-map-bundle", version: 1, layout, packs}`
  (`bundle.ts:38-45`, `:221-230`).
  - `layout` is a record v3 read by `readCreatorRecord` (`:287-302`).
  - Each `packs[i]` is `{ref, root}`. The pack is validated whole under its root, as any v2 pack, against the build and
    every carried pack (`:304-339`), and its digest must equal `ref` (`bundle.PACK_REF_MISMATCH`, `:329-335`).
  - Roots may not nest (`:257-261`), and a file outside every root is refused (`bundle.FILE_OUTSIDE`, `:278-285`).
  - When the base pack is carried, its `maps/<mapId>.json` must read as a content map v1 or v2 (`:341-360`).
  - What the layout requires and the bundle does not carry is **listed** in `missing`, not refused (`:364-366`;
    `bundle.test.ts:117`).
  - Bounds: all the entries together, `BUNDLE_MAX_BYTES_ADAPTATION` = `PACK_BYTES_ADAPTATION`, 512 MiB, whose comment
    says "FP-8 ... replaces it" (`:47-51`, checked before any byte is parsed, `:169-174`); the envelope, 1 MiB (`:53`);
    at most 64 packs (`:55`).
- **Content map v2** (`maps.ts:29-35`, `:44-51`) adds exactly one field over v1: `visual.includesProps`, a boolean
  (`CONTENT_MAP_V2_FIELDS`).
  - A v1 member that carries it is refused `map.VERSION_FIELD` (`:337-338`).
  - A reader that takes v1 only refuses a v2 member `map.VERSION_UNSUPPORTED` (`:308`).
  - A v1 copy and a v2 copy of one map have the same `gameplayDigest` (`:679`).

### 1.5 The schemas

There is **one** JSON Schema file: `creator-contracts/schemas/forge-map-bundle.v1.schema.json`. It is the envelope's
shape for editors, and its own description says the validator is the authority. `bundle.test.ts:515-593` holds it
level with the validator. `s2u-pack.json` has **no** JSON Schema, and neither do the content map
(`s2u.creator/content-map`) or the asset definition. The brief says "the two schemas"; this tree holds one.

### 1.6 Four gaps FP-4's review left

1. **`s2u.creator/asset-definition` is checked by no contract.** The viewer reads it (`viewer/src/packs/content/assets.ts:26`,
   `readAssetDefinition` `:226`). FP-5's content source calls that reader (`content/source.ts@88d1dde31:176-179`). Neither
   `validatePack` nor `validateForgeBundle` opens an `assets/*.json` member.
2. **Top-level `sides` is validated (`packs.ts:592`) but read by nothing.** A search of the viewer, match, host and
   creator-contracts sources finds no reader of `.sides` on a pack manifest.
3. **A carried pack's unresolved dependency is refused, not listed missing.** The bundle validates each carried pack
   with `packs: available` (`bundle.ts:309-323`), so a `{id, range}` the device and the bundle cannot satisfy is
   `pack.DEPENDENCY_MISSING`, then `bundle.PACK_INVALID`. A *layout's* missing pack, by contrast, is only listed
   (`:364-366`).
4. **`visual.includesProps` is read by nothing.** The contract reads and keeps it (`maps.ts:331-339`); no viewer
   source names it (a search of `viewer/src`, `match/src`, `forge-agent/src`).

| field / rule | rule | when | why | what breaks if not |
|---|---|---|---|---|
| asset definition | move `ASSET_DEFINITION_SCHEMA` and `readAssetDefinition` into `creator-contracts`, and have `validateForgeBundle` read every `assets/<id>.json` the base map's props name (section 6) | 0.1.2, before it is published (a new refusal) | a pack's props are part of the map a bundle promises | a bundle passes FP-4 and then draws stand-in boxes in FP-6 |
| `sides` | keep validating it; state in the contract's comment and the wiki that no reader acts on it until FCW-17 | 0.1.2 (words only) | a validated field nobody reads invites authors to rely on it | a `client` pack is assumed kept off servers; nothing enforces that |
| carried dependency | keep the refusal (a carried pack is a pack, validated as one) and say so in the bundle's header and the wiki | 0.1.2 (words only) | `missing` is the layout's caption (FP.R4), not a pack's dependency closure | an author reads `missing` as covering dependencies and ships a bundle that is refused |
| `includesProps` | FP-6 draws the props only when it is false or absent | 0.1.2 (FP-6) | it is the one field v2 adds | props drawn twice over a visual that already has them |
| `s2u-pack.json` schema | publish `schemas/s2u-pack.v2.schema.json`, held level with `TOP_KEYS`/`ROW_KEYS` by a test like `bundle.test.ts:515-593` | 0.1.2 | an agent writes the manifest from a schema; the wiki's reference has one source (MW.R5) | agents guess the manifest from prose |

## 2. Forward compatibility

**Today there is none.** A reader refuses:
- every top-level key it does not know, and every row key (`packs.ts:551-555`, `:641`);
- every `formatVersion` but 2 (`:561`);
- every pack whose `contract` range its one version does not satisfy (`:585`).

It checks against one version, `ENGINE_CONTRACT_VERSION` (`:25`), not a set.

**What an older reader does with a newer pack, measured (FP-4's tests):**
- A 0.1.1 build refuses a pack stating the sample's `>=0.1.2 <0.2.0` (`CONTRACT_MISMATCH`, `rules.test.ts:556-559`).
- A 0.1.2 build takes `^0.1.0`, `^0.1.1`, `>=0.1.1` and the sample's range (`rules.test.ts:540-554`;
  `bundle.test.ts:109-115`, `:437`).
- An **exact** pin (`0.1.1`, `=0.1.1`) is admitted only by a 0.1.1 build: the comment and test at
  `rules.test.ts:587-594` check it on a 0.1.1 context because the 0.1.2 build does not satisfy it.

In short, **a caret range holds across a patch and an exact pin breaks**. Under the repository's SemVer, `^0.y.z`
fixes the minor (`semver.ts:1-5`), so every `^0.1.x` pack fails on a `0.2.0` build unless the build checks a set.

**Content map v2 is the worked case.** A v1-only reader refuses a v2 member by name (`map.VERSION_UNSUPPORTED`), and a
pack carrying one states `>=0.1.2`, so a 0.1.1 build refuses it by contract first. That is the shape this section
generalises: a change that needs a new reader carries a contract floor, and an older reader refuses it by name.

**`main` is at 0.1.1** (`git show origin/main:.../packs.ts`, line 25), so every build players run today refuses any
new field. Two consequences:
- A pack that uses a 0.1.2 field must state `>=0.1.2`, and a 0.1.1 build then refuses it by contract.
- The forward-compatibility rule itself has to be in the **first** 0.1.2 build. If it is not, 0.1.2 builds refuse
  0.1.3's fields the way 0.1.1 refuses 0.1.2's.

**The proposed rule** (0.1.2):
1. **`extensions`**, a new optional top-level object. Its keys are reverse-dotted names (`org.example.tool`), and each
   value is plain JSON. Every 0.1.2+ reader **skips** the content of a name it does not know and never refuses it.
   `scanUris` still applies inside, so no URI is allowed. Its size is bounded: *proposed*
   `PACK_EXTENSIONS_BYTES_ADAPTATION`, 16 KiB of its JSON, four times the handler options' 4096 (`packs.ts:61`). It
   enters the digest, as every manifest field does.
2. **Everything outside `extensions` stays strict.** A future additive top-level field is a patch bump. A pack that
   uses it states `>=0.1.N`, and an older reader refuses that pack by contract with a clear code. It is never parsed
   wrong.
3. **`formatVersion` changes only when the manifest is reshaped**, for example `target` becoming `targets` (section 5).
   The **contract** changes for engine capability. The two are not coupled: a 0.2 build reads `formatVersion` 2 and
   whatever 3 adds.
4. **0.2: a set of contracts.** The build publishes `ENGINE_CONTRACTS_SUPPORTED` (*proposed*: `["0.1.2", "0.2.0"]` at
   0.2). A pack passes when any version in the set satisfies its range. A `^0.1.x` pack keeps loading on the 0.2 build
   for as long as the build implements 0.1.x's surface.
5. **The wiki tells authors to write `^0.1.N`** (the lowest patch whose features they use), never an exact pin.

| field / rule | rule | when | why | what breaks if not |
|---|---|---|---|---|
| `extensions` | optional object; unknown names skipped; no URI; 16 KiB *proposed*; in the digest | 0.1.2 | the only place a future tool can add data a 0.1.2 reader tolerates | every later addition refuses on every 0.1.2 build in the field |
| strict elsewhere | an unknown top-level or row key stays `FIELD_UNKNOWN` | 0.1.2 (unchanged) | a mis-typed field must stay an error; additive fields come with a contract floor | lenient parsing would accept `licence` for `license` |
| contract set | `ENGINE_CONTRACTS_SUPPORTED`; a pack passes if any member satisfies its range | 0.2 | `^0.1.x` cannot admit `0.2.0` (`semver.ts:1-5`) | every published pack fails `CONTRACT_MISMATCH` the day 0.2 ships |
| `formatVersion` | bumps only on a manifest reshape; a reader lists the format versions it reads | 0.2 (with `targets`) | separates manifest shape from engine capability | one number carries two meanings, and a reshape is mistaken for a capability |
| authoring advice | caret ranges, never exact pins (wiki's manifest reference) | 0.1.2 (words) | `rules.test.ts:587-594` | an exact pin breaks at the next patch |

## 3. Provenance and licence

**Today the manifest carries no licence, author or provenance field** (`TOP_KEYS`, `packs.ts:529`; `ROW_KEYS`, `:530`).
The sample yard carries its licence as an ordinary member, `LICENSES.txt` (CC0, "no game assets";
`test-fixtures/MANIFEST.json`, the `creator/sample-yard.forge.zip` row). What binds:
- **"No game data ships"** (MISSION:26) and its one exception, OT.R34 (the setup page's background video): a
  build, and so anything we publish, carries no disc data. RS.R8 (MISSION, "Game data in git") is the private
  repository's permissive rule (disc files as test fixtures), not a licence to ship them.
- **The public-repo rule** (the `public-release` procedure, `workflow/public_release.sh`): the public export proves it
  holds no game data.
- **OT.R92, ML.R3 and ML.R16**: the HD pack is third-party art, never shipped by us in a build or a release. ML.R4's
  removal of the served path is superseded by ML.R16 (the owner, 2026-11-06; [MODS loader plan](../plans/2026-11-06-mods-loader.md)
  lines 28-40): the served path stays for now, and H413 is answered -- the owner uploads the built pack to
  Thunderstore and players download it there.
- **H275's default**: the ZDB import tool's output is device-local only, with no sharing path.
- **The leak rule** (AGENTS.md, "What never goes in git"): no e-mail addresses or home paths.

One thing in the code works against provenance. The local import's extension list admits the disc's own formats
(`zar|zdb|zed|bnk|vag|adp|zam|zan|zmo|zmd`, `viewer/src/agent/localFiles.ts:37`). That is correct for an `s2u-mod`,
which substitutes disc files, but nothing records where such a file came from. The legacy GX texture manifest's
optional `provenance.archiveSha256` (`packs.ts:277`, `:830`) is the only provenance field in any format.

**Proposal.**
- **`license`** (0.1.2 optional; 0.2 required for export and for the public listing): an SPDX expression
  (`CC0-1.0`, `CC-BY-4.0`, `MIT OR Apache-2.0`), checked against an SPDX id list the contract carries as data. Our
  fixtures state `CC0-1.0`.
- **`authors`** (0.1.2 optional): 1-16 display names of 1-48 printable characters. No contact field at all: a URL is
  already refused, and an e-mail is personal data. A name that looks like an e-mail is refused.
- **`files[i].provenance`** (0.1.2 optional per row; 0.2 required on `mesh`, `texture`, `audio` and `collision` rows):
  - `original`: made by the authors.
  - `derived`, with `derivedFrom`: either a `PackRef`, or the literal `"zdb-import"` for XT-13's output from the
    player's own disc. A `derived` pack inherits its source's licence terms. The validator accepts `zdb-import` for a
    **local install**; `thunderstoreManifest` and the public listing refuse it (H275's default).
  - `extracted`: game content read off a disc. **Refused by the validator** in every context ("No game data ships",
    MISSION:26; OT.R34; H275; the public-repo rule), with a new code `pack.PROVENANCE_REFUSED`.
- The validator cannot prove a declaration true. What it can do is refuse a member whose SHA-256 equals a known disc
  file's. That needs a hash list of the disc's files shipped with the build, which RS.R8 allows in the repository (decoded data, not disc
  bytes) but no code holds today. Listed as `later`.
- **The Thunderstore wrapping** has no licence key (`THUNDERSTORE_PACKAGE_RULES.manifestKeys`, `packs.ts:1200`).
  The export writes `license` and `authors` into the generated `README.md`. For a wrapped v2 pack,
  `checkThunderstorePackage` (`:1365`) requires `s2u-pack.json` to state a `license` (0.2). A wrapped **earlier-format**
  payload (ML.R3; the HD pack) has no `s2u-pack.json`. The upload itself is settled (H413, ML.R16); what its README
  says of the art's licence is the owner's question (section 10).

| field / rule | rule | when | why | what breaks if not |
|---|---|---|---|---|
| `license` | SPDX expression from a list in the contract | 0.1.2 optional; 0.2 required for export | a public listing must say what a player may do with a pack | packs go up with no stated terms; the fixture's CC0 is invisible to tools |
| `authors` | 1-16 names, 1-48 printable characters, no contact data | 0.1.2 optional | credit without personal data (the leak rule) | credit drifts into README prose, e-mails included |
| `files[i].provenance` | `original` / `derived` (+`derivedFrom`) / `extracted` | 0.1.2 optional; 0.2 required on art and collision rows | MISSION:26 ("No game data ships"); H275; XT-13's output must stay local | nothing distinguishes a modder's mesh from a ripped one |
| `extracted` refused | `pack.PROVENANCE_REFUSED` in every context | 0.1.2 | MISSION:26 ("No game data ships"), OT.R34, H275; the public-repo rule | a declared rip installs and can be re-shared |
| `zdb-import` | accepted locally, refused by the export and the listing | 0.1.2 | H275's default (device-local only) | XT-13's output reaches the store |
| disc-hash deny list | refuse a member whose SHA-256 is a disc file's | later | catches a rip declared `original` | relies on the declaration alone |
| store wrapping | README carries licence and authors; wrapped v2 requires `license` | 0.2 | the store's manifest has no licence key | the store page shows no terms |

## 4. Identity

**Ids.** `id` is 1-64 of `a-z0-9.-` (`packs.ts:399`, `:411-416`). Nothing ties a prefix to a publisher, and the
legacy prefixes are the adapters' alone (`:404`). **Versions are immutable on one device**: installing different
content under an id and version the device already holds is `registry.REVISION_CONFLICT`, "Remove ... first"
(`registry.ts@88d1dde31:588-597`). Nothing outside one device enforces it.

**The digest's scope** (1.3) covers the manifest whole and each member's bytes through its `sha256`. That has three
consequences:
- **A re-zipped pack keeps its hash.** Compression, member order in the zip, the top folder's name and the store files
  are all outside the hash.
- A **re-serialised** `s2u-pack.json` keeps it too, because the JSON is hashed canonically.
- A renamed pack (`name`, `description`) does not.

**The bundle's key is a different digest.** FP-5 keys a custom map by `digest(entries)` (`registry.ts@88d1dde31:169-193`,
`:1182`): SHA-256 over the JSON of `[path, sha256(bytes)]` pairs for every entry, sorted with `localeCompare`, after the
one top folder is stripped (`:1256-1259`). A re-zip keeps it, and so does a renamed top folder. **Re-indenting
`forge-bundle.json` changes it**, because the envelope is one entry, its raw bytes' SHA-256, not its canonical form. `localeCompare`
is also locale-dependent, and the contract's own rule is UTF-8 byte order (`digest.test.ts:60`). Two copies of one map
can therefore be two custom maps.

**Thunderstore names.** `thunderstoreName` turns `.` and `-` into `_` (`packs.ts:1236-1245`). The map is not
one-to-one, so the export refuses two ids that would meet (`store.NAME_COLLISION`, `:1307-1315`;
`thunderstore.test.ts:171`, `:177`). The team is `THUNDERSTORE_TEAM_PLACEHOLDER` until H342 (`:1188`). [2026-11-11: answered -- `THUNDERSTORE_TEAM = "SOCOM_Legacy"` (H342, the owner's word in FX.R2),
in `packages/creator-contracts/src/packs.ts`; the placeholder is gone.]

| field / rule | rule | when | why | what breaks if not |
|---|---|---|---|---|
| team-owned ids | an id is `<team>.<name>`, where `<team>` is the publisher's Thunderstore team lower-cased; the export refuses an id whose first segment is not the exporting team | 0.2; **owner** (H342 names our team) | two publishers cannot hold one id | two packs `zombies` from two teams collide on every device |
| immutable versions | a published `id@version` never changes bytes; the listing refuses a second hash | 0.2; **owner** (the listing's rule) | `REVISION_CONFLICT` is per device only | one `id@version`, two packs in the wild, and joins that disagree |
| display stays in the digest | **ruled (the controller, 2026-11-08 15:10Z; section 10):** the digest keeps covering `name` and `description`; a renamed pack is a new identity, installed beside the old until the old is removed | 0.1.2 (unchanged) | the registry's call (FCW-06), now taken | -- |
| `supersedes` | optional digest (a `PackRef.hash`) of the pack this one replaces; MODS may say "replaces <old name>" only when the pack's own manifest names its predecessor so, never by guessing from a matching id or name | 0.2 | the controller's ruling: a rename is a new pack, and only the pack itself may claim to replace another | a renamed pack and its predecessor sit side by side with nothing linking them, or MODS links them by a guess |
| bundle key | `bundleDigest` in the contract: canonical `{"digest":"s2u.bundle","layout":<canonical>,"packs":[refs],"version":1}` | 0.1.2 (FP-5 is unreleased) | the contract's canonical JSON and UTF-8 order, not raw bytes and `localeCompare` | a re-indented envelope imports as a second custom map |
| store collisions | unchanged: refuse, never rename | 0.1.2 (unchanged) | `thunderstore.test.ts:171` | -- |

## 5. Targets

**Today a manifest names one `target`, and the build accepts exactly `PACK_TARGET_US`** (`packs.ts:27`, `:576-583`).
The registry passes that constant whatever disc the player has (`registry.ts:224`). Since H364 ("Allow fully",
2026-10-29), the page boots every retail release. `SOCOM2_RELEASES` lists five, by the executable each boots
(`archive/src/discIdentity.ts:22-28`):

| boot | serials | region |
|---|---|---|
| `SCUS_972.75` | SCUS-97275, SCUS-97275GH | USA |
| `SCES_519.04` | SCES-51904 (and /GER, /P) | Europe |
| `SCES_523.06` | SCES-52306 | Australia |
| `SCPS_150.65` | SCPS-15065 | Japan |
| `SCKA_200.20` | SCKA-20020, SCKA-20053 | Korea |

The European releases are SCES, not SLES. So a pack today refuses `TARGET_MISMATCH` against nothing real: the
registry's target is the US code even on a European disc. The three HDD maps (MP54, MP63, MP74) are not on the r0001
disc (`archive/src/mapNames.ts:12-14`). This host holds them from an HDD image, outside the repository. **Whether the
five releases' map and texture files are byte-equal is not measured.** Until it is, a pack cannot claim one release's
data serves another's.

**Proposal.**
- **`targets`** (0.2, `formatVersion` 3): a non-empty set of canonical serials from `SOCOM2_RELEASES` (the first serial
  of each row). A `formatVersion` 2 `target` is read as a one-element set.
- **The build's target comes from the disc**: `discIdentity` gives the boot name, and its release's first serial is
  the context's `target`, replacing the `PACK_TARGET_US` constant (`registry.ts:224`).
- **A pack for an HDD map** states its targets and pins the map's file with an `{archive, sha256}` dependency, which
  already exists (`packs.ts:617-626`). It is then checked against what the player's disc or HDD image holds.
- **What MODS does with a mismatch.** Today `install` refuses it. Proposed: install is still allowed (the pack is
  kept), the row says "For another release of the game", and the pack is never enabled. Swapping discs brings it back.

| field / rule | rule | when | why | what breaks if not |
|---|---|---|---|---|
| `targets` | non-empty set of canonical serials from `SOCOM2_RELEASES`; **ruled (the controller, 2026-11-08 15:10Z):** it lists only the releases the pack was built from, or whose textures were measured equal (the HD plan's equality check); a wider claim is a placeholder until measured | 0.2 (`formatVersion` 3) | H364: every retail release boots; no claim beyond measurement | a European player's pack refuses for the wrong reason, or a pack claims releases nobody checked |
| build target | from `discIdentity`, not a constant; **ruled:** the default target is the build's release (r0004 today, in the controller's words) | 0.2 (code; no manifest change) | `registry.ts:224` passes the US code whatever the disc | every pack checks against the US release |
| HDD maps | `{archive, sha256}` on the map's file | 0.1.2 (already valid) | `packs.ts:617-626` | -- |
| MODS on mismatch | kept, labelled, never enabled | 0.2 | a disc swap should not delete packs | today's refusal makes a player re-download after a swap |
| release equality | measure the five releases' map files; one target per release until then | later | not measured | a pack claims releases it was never checked on |

## 6. Budgets and safety

**What exists, by loader.** All are adaptations, none a console value.

| bound | value | where |
|---|---|---|
| v2 members / bytes / one member / manifest | 8192 / 512 MiB / 500 MiB / 1 MiB | `packs.ts:41-47`, checked `:1041-1072`, `:1117-1127` |
| v2 path | 240 characters, 16 levels | `packs.ts:49-50`, `packPath` `:478-500` |
| a `rules` member | 1 MiB | `packs.ts:83` |
| bundle (all entries) / envelope / packs | 512 MiB / 1 MiB / 64 | `bundle.ts:51-55`, `:169-174` |
| local import (granted folder, picked files, a zip) | 8192 files, 512 MiB, depth 16, path 240; a zip's declared sizes summed before any inflate | `agent/localFiles.ts:4`, `:71-80`, `:167-185` |
| zip reader | 2 GiB archive, 8192 members, 4 MiB central directory, 160 MiB one inflated member; no zip64, no encryption, stored or deflate only; inflation stops at the declared size | `zipReader.ts:12-20`, `:42-99`, `:92-94` |
| MODS drop (a zip) | `ZIP_LIMITS` as above, then 8192 members and 512 MiB declared before reading | `registry.ts@88d1dde31:1101-1124` |
| model pack | 500 MiB pack, 500 MiB GLB, 200,000 triangles, 4096 px, 128 models, 64 KiB manifest | `modelPack.ts:20-33` |
| HD pack | 8192 entries, 8 GiB, 256 MiB one entry, 8 MiB manifest, 1.5 GiB applied | `hdTexturePack.ts:12-13` |
| GX pack | 256 entries, 192 MiB, 16 MiB one entry | `texturePack.ts:9` |
| data mod | 32 files, 64 KiB manifest | `mods/manifest.ts:12-15` |
| zombies pack | 48 MiB zip, 32 MiB model, 2 MiB a sound, 64 sounds, 64 MiB inflated | `zombies/pack.ts:20-29` |
| GLB parse | outside URIs refused; triangles and texture edge checked **after** three's `GLTFLoader` has decoded the scene | `modelPackRuntime.ts:202-231`, `:350-380` |
| asset hulls | `ASSET_CHECK_BUDGET_ADAPTATION` work units; 255 points a face | `packs/content/assets.ts:43`, `:49`, `:160` |

**What this shows.**
1. **One member, three bounds.** The v2 contract allows 500 MiB (`packs.ts:45`) and the local zip import 512 MiB
   (`localFiles.ts:170`). The MODS drop reads through the default `ZIP_LIMITS` at 160 MiB (`zipReader.ts:19`), so a
   legal v2 member over 160 MiB is refused when dropped in MODS and accepted from a granted folder.
2. **Decode is not budgeted before it runs.** The GLB caps are checked on the parsed scene. The v2 `audio` role has no
   length, sample-rate or decoded-size cap anywhere: zombies call `decodeAudioData` on whatever their pack holds
   (`zombies/assets.ts:112`). The v2 `texture` role (`.png`/`.ktx2`/`.rgba`, `packs.ts:109`) has no edge cap, because
   no v2 driver reads one.
3. **Zip bombs.** Memory is already bounded: declared sizes are summed and checked before inflating (`localFiles.ts:79`;
   the MODS drop's read), and inflation stops at the declared size (`zipReader.ts:92-94`). **No inflate-to-compressed
   ratio is checked anywhere.** A 1 KiB member that declares 500 MiB passes the **local import's** preflight (it raises the member bound to 512 MiB,
   `localFiles.ts:170`) and is inflated in full. The **MODS drop** refuses that member, but only because it is over
   160 MiB (`zipReader.ts:80`), not for its ratio: a 1 KiB member declaring 150 MiB passes there.
4. **No glTF validation** beyond what three's loader accepts and the outside-URI refusal (`modelPackRuntime.ts:350`).

**Proposal.** One module, `creator-contracts/src/budgets.ts`, read by every loader (the v2 validator, the bundle, the
model pack, the zombies pack, the HD importer):
- **Bytes.** One member's bound is one value, 500 MiB (`PACK_MEMBER_BYTES_ADAPTATION`), for the MODS drop as for the
  local import. The zip reader's 160 MiB becomes a GX/HD per-image bound inside those formats, not a reader-wide one.
- **Ratio.** *Proposed* `ZIP_RATIO_ADAPTATION`, the largest inflated/compressed ratio one deflated member may declare.
  Its value is taken by measuring the sample yard and the HD pack's zip before it is fixed (no number is guessed
  here). It applies before inflating, from the central directory.
- **Decode, before the decoder.**
  - A GLB's accessor counts and image dimensions are read from its JSON chunk and checked against the triangle and
    texture caps **before** `GLTFLoader.parse`.
  - Audio: *proposed* `AUDIO_SECONDS_ADAPTATION` and `AUDIO_DECODED_BYTES_ADAPTATION`, from the header (OGG/WAV) before
    `decodeAudioData`.
  - Textures: the model pack's 4096 px edge, read from the PNG/KTX2 header.
- **glTF validation.** The checks the import tool already makes (`tools/creator-import`, cited in `assets.ts:10-23`)
  run on the page's read too: one GLB, no external buffers, no extensions outside a listed set.
- **`BUNDLE_MAX_BYTES_ADAPTATION`.** Keep 512 MiB of entries. Add the ratio and the per-member bound above, which FP-4's
  comment asked FP-8 for (`bundle.ts:47-51`).
- **The asset definition.** Move the reader into the contract with a JSON Schema `schemas/asset-definition.v1.schema.json`.
  `validateForgeBundle` reads every `assets/<id>.json` the base map's props name. Removing the format is not proposed:
  the sample and FCW-09's props depend on it.

| field / rule | rule | when | why | what breaks if not |
|---|---|---|---|---|
| one member bound | 500 MiB in every reader | any build (changes no format) | a valid pack's acceptance must not depend on how it was dropped | a pack valid from a folder is refused from MODS |
| `ZIP_RATIO_ADAPTATION` | refuse a member over the ratio, from the central directory | 0.1.2, before it is published (a new refusal); value measured first | the one bomb check missing (`zipReader.ts`) | a tiny zip makes the page inflate 512 MiB |
| decode before decoder | GLB, audio and texture caps from headers | any build (the same caps, checked earlier) | caps checked after decode do not protect the decode (`modelPackRuntime.ts:202`) | a hostile GLB or OGG costs the page its memory before the cap fires |
| shared `budgets.ts` | one module, every loader | any build (moves constants; changes no format) | six loaders, six tables today | caps drift between loaders |
| asset definition | in the contract, with a schema, checked by the bundle | 0.1.2, before it is published (a new refusal) | gap 1 (section 1.6) | a bundle passes and its props draw as boxes |

## 7. Withdrawal and operator approval

**Today there is neither.** No pack code names withdrawal (a search of `packages/*/src`; the only "withdraw" is
central's announcements, `central/src/announcementsFile.ts:81`). What the plans say:
- **FCW-17** ([the Forge plan](../plans/2026-10-24-forge-creator-wishlist.md), lines 466-472): servers resolve
  "operator-installed approved hash-pinned gameplay members"; clients supply no fetch URL; "archive bomb" and "removal
  mid-room" are among its RED cases. It is owner-gated on H274.
- **H274's default** is "no": only the player's disc data and the Forge recipe reach a server.
- **H273's default**: packs refused in normal lobby matches, bar client-only texture packs (OT.R110).
- **H342**: the page fetches nothing from a store.

**Proposal.**
- **Operator approval (servers).** An operator approves a pack by adding its `PackRef` hash to the room host's allowlist
  file. FCW-17's `resolveGameplayPack` loads only listed hashes, from the operator's own disk. A client never supplies
  bytes or a URL. Not before H274.
- **Approval for the public listing.** The public listing *is* Thunderstore (H342, H413), and its moderation is the
  store's. Our part is that the export refuses what our rules refuse: `extracted` and `zdb-import` provenance, a missing
  licence (section 3). Whether we also keep a list of packs "recommended" by the project is the owner's call.
- **Withdrawal.** Withdrawal reaches a page through something we serve, never a store fetch. Proposed:
  - a `withdrawn.json` of `{hash, reason}` shipped with each release;
  - and, where the page is online, the same list from our central (our server, so no Boundaries issue).

  A withdrawn pack already installed stays in MODS. It is **disabled and cannot be enabled**, its row says
  "Withdrawn: <reason>", and the player may remove it. A server refuses it at join (FCW-18). Who may withdraw (the
  author through the store, the operator for a server, the project for a rule breach) is the owner's.

| field / rule | rule | when | why | what breaks if not |
|---|---|---|---|---|
| operator allowlist | room host loads only listed hashes, from its own disk | 0.2; **owner** (H274) | FCW-17 | a server could load a pack nobody approved |
| export refusals | the export refuses what our rules refuse | any build (the export tool, not the format) | the store moderates its listing; we moderate our output | our tool helps publish what MISSION:26 forbids |
| `withdrawn.json` | `{hash, reason}`, with each release and from central | any build, once the owner answers (a list beside the packs, not a manifest field); **owner** (who withdraws) | a pack found to carry game data (MISSION:26) must stop applying | a withdrawn pack keeps applying on every device that has it |
| MODS on withdrawn | kept, disabled, labelled, removable | any build, with `withdrawn.json` (MODS behaviour, no format change) | the player's device is his; the page stops applying it | a silent delete, or a silent keep |

## 8. The v2 texture role

**Today.** The `texture` role exists (`packs.ts:101`, `:109`), but no v2 driver applies anything (`registry.ts:600`).
The texture packs that do apply everywhere are the earlier formats, wrapped (ML.R3). The HD pack:
- is keyed by the SHA-256 of the decoded RGBA, so one entry serves every site that draws that image
  (`hdTexturePack.ts:8-9`, HD.R3);
- is 1.58 GB in its all-maps form, about three times `PACK_BYTES_ADAPTATION` (1.58 GB / 512 MiB = 2.94; ML.R3: the v2 bound "is a third of" it).

ML.R3 makes the wrapped earlier format the path for this batch and states that the v2 texture role is "not in this
batch".

**The path, for after 0.2:**
1. **A mapping member.** `textures/map.json`, role `data`, in the HD manifest's own shape: entries keyed by the decoded
   image's SHA-256, each naming a `texture` member and its placement (`hdTexturePack.ts:34-39`, HD.R9). One shape for
   both, so the HD builder (ML-5) can write either.
2. **An apply driver per page.** It reuses the HD runtime that already applies on every page (ML.R5). A v2 pack is
   applied only when its `intents` are `cosmetic` alone and its `kinds` are `content`. ML.R3's exception rule becomes
   checkable: only cosmetic, client-only texture content applies outside the test room.
3. **Size.** Either a per-kind bound for texture-only packs, up to the HD pack's 8 GiB (`hdTexturePack.ts:13`), or the
   pack split per map across dependencies, each under 512 MiB. The second keeps one bound for every pack. The first
   keeps one download. Recommended: the split, because it needs no new bound.
4. **What MODS keeps applying.** The four earlier formats stay accepted in 0.2, wrapped or bare, and are never
   rewritten as v2 on disk (ML.R3). A v2 texture pack and an HD pack follow the same choice rule in MODS
   (`modsState.ts:4-5`: one texture choice, ML.R8).

| field / rule | rule | when | why | what breaks if not |
|---|---|---|---|---|
| earlier formats | accepted in 0.2, wrapped or bare, never rewritten | 0.2 (unchanged) | ML.R3; packs in players' hands | the HD pack stops applying |
| `textures/map.json` | the HD manifest's shape, keyed by decoded SHA-256 | later | one shape for both formats | two texture keyings drift |
| v2 texture driver | applies `cosmetic`-only `content` packs on every page | later | ML.R3's exception made a rule | v2 stays "stored, never applied" for textures |
| size | split per map across dependencies | later | keeps one pack bound | an all-maps v2 texture pack cannot be made |

## 9. Conformance fixtures

**Owed, not added here.** This seat runs the documents' tests only (its brief). A fixture without its test proves
nothing, and `creator-contracts/test/fixtures/` does not exist (the brief names it). The one creator fixture is
`test-fixtures/creator/sample-yard.forge.zip`, listed in `test-fixtures/MANIFEST.json` and read by `bundle.test.ts:384-451`.
Proposed home: `creator-contracts/conformance/` beside `schemas/`. Each fixture is small, synthetic and CC0, with no game
data, listed in a `conformance/MANIFEST.json`, and every one is read by one test, `conformance.test.ts`, which asserts
its verdict and its first code.

| fixture | proves | verdict, first code |
|---|---|---|
| `pack/minimal-content` | the smallest valid v2 pack (one `gameplay` member, `gameplay-value` intent) | pass |
| `pack/unknown-field` | strict top level | `pack.FIELD_UNKNOWN` |
| `pack/format-version-3` | `formatVersion` exact | `pack.FORMAT_VERSION` |
| `pack/contract-exact-0.1.1` | an exact pin breaks on 0.1.2 | `pack.CONTRACT_MISMATCH` |
| `pack/contract-caret-0.1.1` | a caret range holds | pass |
| `pack/target-alias` | the alias refused with its canonical spelling | `pack.FIELD_INVALID` |
| `pack/member-unlisted`, `pack/member-hash`, `pack/member-inflated` | the member checks | `MEMBER_UNLISTED`, `MEMBER_HASH_MISMATCH`, `MEMBER_INFLATED` |
| `pack/cosmetic-collision` | XT.R12 | `pack.INTENT_MISMATCH` |
| `pack/store-files` | Thunderstore files beside `s2u-pack.json` outside the digest | pass, same hash as `minimal-content` |
| `pack/uri-in-description` | no URI anywhere | `pack.EXTERNAL_URI` |
| `pack/rules-floor` | a rules pack admitting 0.1.0 | `pack.CONTRACT_FLOOR` |
| `bundle/minimal` | an envelope and one pack | pass, `missing` empty |
| `bundle/missing-required` | a required pack not carried | pass, `missing` = [ref] |
| `bundle/ref-mismatch`, `bundle/file-outside`, `bundle/two-roots`, `bundle/nested-roots` | the envelope's refusals | `PACK_REF_MISMATCH`, `FILE_OUTSIDE`, `ROOT_AMBIGUOUS`, `PACK_ROOT_INVALID` |
| `bundle/carried-dep-missing` | gap 3: a carried pack's dependency refused, not listed | `bundle.PACK_INVALID` |
| `map/v1-with-includes-props` | the v2 field on a v1 member | `map.VERSION_FIELD` |
| `zip/ratio-bomb` | section 6's ratio | (owed with `ZIP_RATIO_ADAPTATION`) |
| `pack/extensions-unknown`, `pack/license-spdx`, `pack/provenance-extracted` | sections 2 and 3 | (owed with the 0.1.2 fields) pass, pass, `pack.PROVENANCE_REFUSED` |

Several of these exist today as inline cases in `packs.test.ts`, `bundle.test.ts`, `maps.test.ts` and `rules.test.ts`.
The conformance set makes them files that another implementation (a CLI, the wiki's checker, an agent) can run.

## 10. The decision list for the owner, and the controller's two

Drafted as `HUMAN_TASKS.md` rows. **They are not filed**: the numbers are the controller's, and `H-FP8-a` and the rest
are stand-ins. Each states the default the work follows meanwhile. Nothing here involves money. The publishing gate is
FP.R7 itself.

| H | the question | default meanwhile | blocks |
|---|---|---|---|
| H-FP8-a | **Read this spec (FP.R7).** Approve sections 2-9 item by item, amend, or park. | no pack of ours is uploaded and no wiki page says "publish"; FP-8's row stays `open` | every upload of ours; FP-9's publish pages |
| H-FP8-b | **Licence policy for the public listing.** Is an SPDX `license` required on everything we help publish? Which licences do we accept (any SPDX id, or an open-licence list)? | `license` optional in 0.1.2; the export warns, not refuses, until 0.2 | 0.2's export rule; the wiki's publish page |
| H-FP8-c | **The licence wording of the HD pack's Thunderstore README.** The upload is settled (H413 answered 2026-11-06, ML.R16: the owner uploads the built pack; the served path stays for now). Open is only what the README says of the art's licence: the all-maps HD pack is third-party art (OT.R92). | the README names the community pack and its authors as the source and claims no licence of ours | the README of the owner's upload |
| H-FP8-d | **What the public listing accepts.** Which kinds we help publish (texture, model, data mod, v2 content/rules, bundles), and whether derived-from-ZDB (XT-13) ever leaves the device. | every kind but `zdb-import` and `extracted`; H275's device-local default stands | 0.2's export refusals |
| H-FP8-f | **Team-owned ids.** Must a published id start with its Thunderstore team (`<team>.<name>`), ours being H342's? | ids free-form; the export maps them (`thunderstoreName`) and refuses collisions | 0.2's id rule; H342 |
| H-FP8-g | **Withdrawal.** Who may withdraw a pack (the author, the operator, the project for a rule breach), and does MODS disable a withdrawn pack already installed or only label it? | no withdrawal exists; nothing is disabled | section 7's `withdrawn.json` |

**The controller decides and logs** (not the owner's: the first is the registry's technical call, the second a choice
between readings; each logged in the plan's Log when taken):

- **Is a rename a new pack?** Whether `name` and `description` leave the digest at 0.2 is the registry's call, left
  open by the pack framework spec (lines 54-55: "a choice left open for the registry, FCW-06, to confirm"). Today: yes,
  a rename is a new identity. Blocks 0.2's digest.
  - *Ruled -- the controller's call, 2026-11-08 15:10Z:* **a rename IS a new pack.** The digest covers `name` and
    `description`, so a renamed pack installs as a new identity beside the old until the old is removed. The MODS list
    may say "replaces <old name>" only when the pack's own manifest names its predecessor, by an optional `supersedes`
    digest (section 4's table, 0.2).
- **One pack, several releases.** Whether one pack may name several retail releases before their files are measured
  equal is a choice between readings. Default: one release per pack (today's single `target`), the US release, until
  the measurement (section 5's `release equality`). Blocks 0.2's `targets`.
  - *Ruled -- the controller's call, 2026-11-08 15:10Z:* **no claim beyond measurement.** `targets` lists only the
    releases the pack was built from, or whose textures were measured equal (the HD plan's equality check); a wider
    claim is a placeholder until measured. The default target is the build's release (r0004 today). Section 5's table
    carries it.

## Agent notes (FP.R9: the agent layer)

The files an agent edits to build each item, and the wiki page whose **For agents** block must change with it (the
drift test holds those blocks to the contract, as MW.R5 holds the reference):

| item | code | tests | wiki (body and For agents block) |
|---|---|---|---|
| `extensions`, `license`, `authors`, `provenance` (0.1.2) | `creator-contracts/src/packs.ts` (`TOP_KEYS`, `ROW_KEYS`, `readManifest`, `PACK_CODES`), `src/index.ts` | `creator-contracts/test/packs.test.ts`, `digest.test.ts`; `tools/test/moddingWikiReference.test.ts` (the generated field list) | `reference/manifest.mdx`, `reference/codes.mdx`, `anatomy.mdx`, `changelog.mdx`; `tools/moddingWikiReference.ts` regenerates `reference/reference.json` |
| `s2u-pack.json` JSON Schema | `creator-contracts/schemas/s2u-pack.v2.schema.json` | a schema-versus-validator test like `bundle.test.ts:515-593` | `reference/manifest.mdx` links it |
| contract set (0.2) | `packs.ts` (`ENGINE_CONTRACT_VERSION` -> `ENGINE_CONTRACTS_SUPPORTED`, `readManifest` `:584-587`), `bundle.ts:110-113`, `viewer/src/packs/registry.ts:224` | `rules.test.ts:536-596`, `bundle.test.ts:109` | `reference/manifest.mdx` (the `contract` row), `changelog.mdx` |
| `targets` and the disc's target (0.2) | `packs.ts:27-37`, `:576-583`; `archive/src/discIdentity.ts`; `viewer/src/packs/registry.ts:224` | `packs.test.ts`; a registry test with a European context | `reference/manifest.mdx`, `rules-and-limits.mdx` |
| digest without display fields (0.2) | `creator-contracts/src/digest.ts:277-286` | `digest.test.ts` (the golden vectors move, recomputed outside the package) | `anatomy.mdx`, `reference/manifest.mdx` |
| `bundleDigest` (0.1.2) | `creator-contracts/src/bundle.ts` (new export), `viewer/src/packs/registry.ts` `importBundle` | `bundle.test.ts`; `viewer/test/packs/forgeBundleImport.test.ts` (FP-5's, on `agent/fp-5`) | the Custom Maps kind page (FP-9) |
| asset definition in the contract | `creator-contracts/src/assets.ts` (new), `bundle.ts`; `viewer/src/packs/content/assets.ts` re-exports it | `bundle.test.ts`; `viewer/test/packs/contentAssets.test.ts` | the Custom Maps kind page; `reference/codes.mdx` |
| budgets, ratio, decode-before-decoder | `creator-contracts/src/budgets.ts` (new); `viewer/src/zipReader.ts`, `agent/localFiles.ts`, `modelPackRuntime.ts`, `zombies/pack.ts`, `packs/registry.ts` `dropSource` | `viewer/test/zipReader*.test.ts`, `viewer/test/modelPack*.test.ts`; `conformance.test.ts` | `reference/bounds.mdx`, `rules-and-limits.mdx` |
| withdrawal, operator allowlist (0.2) | `viewer/src/packs/registry.ts`, `console/adapters/mods.ts`; `match/src/creator/packResolver.ts` (FCW-17's, to be created) | registry tests; FCW-17's RED list | `troubleshooting.mdx`, `publishing/thunderstore.mdx` |
| v2 texture role (later) | `viewer/src/packs/` (a texture driver), `hdTexturePack*.ts` | the HD tests, kept green | `kinds/earlier-formats.mdx`, a v2 textures page |
| conformance fixtures | `creator-contracts/conformance/**`, its `MANIFEST.json` | `creator-contracts/test/conformance.test.ts` | `reference/` links the set |
