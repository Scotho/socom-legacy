# The Forge path -- design (FP)

> Written 2026-11-07T19:30Z by the planning seat (redotcom-ab) against `main` at `ad1e2ed3a`, from the owner's brief
> in that seat the same afternoon (quoted in section 1) and four read-only surveys of the repository, the worktrees
> `wt-mods` (PR #729) and `wt-forge-crispy` (PR #728), and the agent-mail evidence (`crispy-pr1/`, `mods-ml10-browser/`,
> `forge-scope-by-phase-2026-10-27.md`). It is a design, not a plan: it says what is wanted and why, what is decided,
> what is the owner's, and what is left to the builder. Its plan follows at `../plans/` once the owner approves it; its
> rows on the work board are the controller's record. Prefix `FP` (unused in the plans and specs). Product track
> throughout except where a row says otherwise (OT.R53): the Forge's Play, the room's rules and anything that changes
> what the game does stay on the simulation track.

## 1. Intent

The owner (Craig, 2026-11-07, seat redotcom-ab), the brief in his words, lightly ordered:

> scope out a full forge path that may span a few releases (crispys work, mod loader ui, pack extensions and
> confirmation for the HD pack and the test sample yard forge file, and then the wiki extensions to match it come
> first). -- our mod loader; crispies work onto the main private repo with all of the noted review and scoped work to
> integrate fully; our forge work ontop of crispies (fixes and adding full render scaling following his conventions)
> and any other fixes; the extension of our content pack import as previously spec'd, with the requirement that we
> must be able to import "sample-yard.forge.zip" as a mod, and then have it available as an option in forge or test
> room. In forge, it should be a new section "Custom Maps", as should any saved layouts that already exist, but the UI
> in forge must show a hint if one requires external assets or not in a nice way, perhaps when switching to that map
> or in the actual base dropdown area itself; an additional review of our pack format, as it stands currently and what
> we've previously spec'd up but not included in the pack yet; considerations for fuse's zombie pack as a full on
> generated mod pack; a full review of our paused forge sprint and whether the plan holds up to our ambitions, if any
> forward thinking suggestions should be taken before the pack sees wide use; a FULL refactoring of the wiki to be
> simple and human facing on the surface, visual where possible, but with full on agent instructions that are
> sophisticated and informative that an agent could pick up and read when viewing the page with ease, without
> stunlocking the human; also include an MCP connection guide in that UI, and a refactoring of the MCP connection UI
> and flow to meet or exceed crispies new ui standards.

**Why now.** Three threads meet this week: the Mods loader (B206, PR #729) gives players one place to drop a pack;
Crispy's Forge Overhaul (public PR #1, imported as PR #728) makes the Forge a contributor-owned editor (OT.R112); and
the pack format (v2, `s2u-pack.json`) is about to leave the repository through Thunderstore (H413) and the modding wiki.
What ships in the next few releases fixes the shape players and contributors build against. A format that spreads
before it is reviewed is a format we maintain forever.

**What success looks like.** A player drops a zip into MODS and it is a map in the Forge and the test room, saying
plainly whether it is ready to play. A contributor reads one page and makes a pack; their agent reads the same page
and makes the pack for them. Crispy's editor is the editor, with our fixes behind it and nothing of his overwritten.
The pack format has one canonical shape with a forward-compatibility rule before the first public upload.

## 2. Where things stand (the facts the design rests on)

Each line names its evidence; a builder re-reads the source, not this summary.

**The Mods loader (PR #729, `agent/mods` 6a6fc5b24).** ML-0..12 built; ML-10's review folded; the data view runs;
Codex left three unresolved threads (a P1: the Forge editor's HD runtime keeps match textures after a Forge lobby
match, `forge/page.ts:1139`; two P2s: a menus-manifest reload on pack replace, a reservation released before its
upload). The MODS screen reads five markers -- a GX `export.json`/PNGs, the HD `experimental-packs/hd/current.json`,
an `s2u-mod`'s `mod.json`, a model pack's `models.json`, a v2 `s2u-pack.json` -- and **a v2 pack is stored, never
applied** (`viewer/src/packs/registry.ts:527-535`; ML.R3). Only texture packs apply on every page (H414); data mods
and model packs apply in the test room (ML.R5). Forge layouts are not MODS rows (ML.R5). H417 (serving the HD pack
for the temporary button) and ML-13 (removing the served path) are the owner's.

**Crispy's import (PR #728, `agent/forge-crispy` 416ed4894).** His three commits with authorship kept, plus fifteen
of ours (the Breach `kind` fix, OT.R112, pins, eighteen test files re-pinned, the e2e helper `e2e/forgeBase.ts`,
pitch/roll/scale hidden -- FC-1 on the owner's word 17:22Z). Fixed on the branch: the stale tests, the gitleaks row,
the online refusals of placed respawns and flares, the escort scale as a reading, the sky dome as an adaptation.
**Still open** (`agent-mail/evidence/crispy-pr1/REVIEW-A/B/C.md`, `MISSING-TESTS.md`): the server half -- the
room's `match/src/forgeSimMap.ts:29-33,354` builds none of his placeables, so a lobby match refuses them at central
(`central/src/forgeLobby.ts:550,620`); the central-first contract order at deploy; the blank floor's AI grid still 32
(`forge/floorAi.ts:16`) against the disc's 10 (`AI-GRID.md`; OT.R112 excludes it from his ownership); no tests for
commits 2-3 (`blankPresets`, `lightRigEditor`, `skyDome`, `siteOutlines`, `breachReady`); round-trip tests for
`respawns`, `flares` and the six layout settings; forward-compatibility pins; the R/F fly keys leaking to every fly
camera (`camera.ts:760`); the night lens stored 0..255 where the disc's is 0..1 (`environment.ts:18`); the agent's
`bomb.place` refusing Breach (`forge/agent/commands.ts:299`); a `zone:` key clash (`commands.ts:118/131`); the turret
copy without collision polygons (`turrets.ts:15`); duplicated `beneath` helpers; six loose test pins; the in-app help
card still saying "1-8 Tools" after Q became select (`page.ts:1727`); Codex's three P2s (hostage count bound, the
perspective restore from an ortho view, Breach's bomb markers for the agent). **Three Play-changing items have no
owner ruling**: the escort zone marked on the compass from round start (`FORGE_ESCORT_ZONE_MARK_ADAPTATION`), the gate
lever sitting on the gate, Escort played on non-escort maps. OT.R112 covers the editor, not Play (MISSION:604-605).

**Render scaling.** The shared video keeper (`viewer/src/videoSettings.ts:6-56`, CPS.R7; presets Performance /
Balanced / Quality under `s2u.viewer.video`) drives matches (`matchMount.ts:855,884`, so Forge Play and lobby matches
too, `forge/match.ts:334`) and the test room; players set it in the launcher's Display section and the game's VIDEO
OPTIONS as RENDER SCALE. **The Forge editor's viewport reads none of it**: it makes its renderer at `forge/page.ts:2028`,
only resizes it, has no adaptive ratio and no `setPixelRatio`, so it draws at `min(devicePixelRatio, 2)` always. The
experimental 1x-6x slider (`experimentalGraphics.ts:192`) is the test room's.

**The content-map path in the Forge.** A content base (`base: "content:<stem>"`, `contentBase: {ref, mapId}`,
`requires`) is layout record v3 (`creator-contracts/src/layout.ts:858-864,1012-1034`), read by `loadContentWorld`
(`forge/page.ts:2596`) through a `ForgeContentSource` whose production value is `NO_CONTENT_SOURCE` (`page.ts:389-399`;
`pageEntry.ts:117` passes no `content` and no `availablePacks`). So today every content-base layout is refused at
open ("This layout needs pack … which is not here", `page.ts:428`), the base dropdown holds Multiplayer, Campaign and
Blank floor only (`page.ts:5692-5701`), and a content base appears only as a disabled "Authored map · name" row when
such a layout is opened (`page.ts:2567-2580`). `missingPackRefs` (`creator-contracts/src/content.ts`) already computes
what a layout lacks against `availablePacks`; the Check sheet lists each missing pack; Play and Create lobby are
refused with "waits for N packs not here" (`page.ts:3875,3961,4262`). The test room has no content-map path at all.

**The sample.** `sample-yard.forge.zip` (9,729 bytes; 2026-11-07 15:03 local) holds `forge-bundle.json` -- schema
`s2u.creator/forge-map-bundle` version 1, a `layout` that is a v3 record (`schema: "forge-layout", version: 3`,
`base: "content:MP2"`, `contentBase`, `requires: [ref]`, two spawns, `gameType: 5`) and `packs: [{ref, root:
"packs/0/"}]` -- and under `packs/0/` a valid-looking v2 pack: `s2u-pack.json` (`format: "s2u-pack"`, `formatVersion:
2`, `id: "example.sample-yard"`, `version: "0.1.1"`, `kinds: ["content"]`, `contract: ">=0.1.2 <0.2.0"`, five files
with sha256 and roles), `maps/sample-yard.json` (`s2u.creator/content-map` **version 2**: a walkable floor polygon,
two team spawns, three props by `assetId`, `visual.member` a GLB), `assets/cover.json` (`s2u.creator/asset-definition`
v1 with a convex hull), two tiny GLBs, `LICENSES.txt` (CC0, no game content). **Nothing in our repositories, their
history or agent-mail names `forge-map-bundle` or `forge-bundle.json`**; our engine contract is `0.1.1`
(`creator-contracts/src/packs.ts:25`) and our content-map schema is version 1 (`maps.ts:37-41`). Every importer we
have refuses the zip: MODS finds no marker at the root; the Forge's agent import (`rootedV2`) accepts `s2u-pack.json`
at the root or one folder deep, and `packs/0/` is two deep (`registry.ts:147-152`); the test room reads HD and GX only.
The zip was produced outside the repository against a schema one step ahead of ours (section 4.3 asks whose).

**The pack format and what was specified but not built.** The frozen v2 contract is `2026-10-25-pack-framework.md`
(FCW-05). Built: validation, storage, the Thunderstore store-file exception and checker (FCW-33), the rules contract
and its room host (FCW-30/31), authoring over MCP and the Rules panel (FCW-32). **Not built:** a production content
resolver (FCW-09/10, `NO_CONTENT_SOURCE`); any v2 apply driver (content, mesh, audio, rules from installed packs --
FCW-35, `installedRules` has no supplier, `page.ts:1551`); an export writer (FCW-33 item D); a human Forge import
button; the pack lifecycle UI (FCW-08, FUI-16); map eligibility guards (FCW-12); pack audio (FUI-24). The format has
**already forked** in practice: MODS applies the older payloads wrapped in Thunderstore's files (ML.R3) because v2
never applies, and the HD pack (1.58 GB) is three times v2's `PACK_BYTES_ADAPTATION` (512 MiB). The manifest refuses
unknown fields and `formatVersion !== 2` (`packs.ts:529,561`): no forward compatibility. No `license`, `authors` or
asset-provenance field exists. The digest covers `name` and `description`, so a rename is a new identity (PF:53-55).
`target` is pinned to SCUS-97275 while every retail release boots (H364). GLB and audio limits are per loader (model
pack 500 MiB / 200k triangles / 4096 px; zombies 48 MiB), with no shared sanitiser.

**The paused Forge sprint** (`2026-10-24-forge-creator-wishlist.md`, 35 tasks / 173 points): S1-S3's engine sides
landed (#520, v0.2.0); S4a's contract, host, authoring and Thunderstore shape landed (#546, #555, #563, #565); S4b's
paintball and CTF proofs landed (#570, #573). Paused at B172 on the owner's word ("pause forge work after the next
batch at the next natural stopping point", Log 23:34Z 2026-10-27). Untouched: S5 friends and authority (gated on
H273/H274), S6 missions and campaigns, S7 ocean and jobs. The resume list the Log left: FCW-31's parity paths, FCW-14,
FUI-24, FCW-35 (H354), LATER 542. Open PRs #507 (the 44/228 re-plan; superseded), #508 (S1's creator loop, 159
commits; the UI parts superseded by OT.R112, the readiness/acceptance specs possibly worth harvesting), #511 (one
stale commit; its spec is on main).

**Fuse's zombies.** The Project Phoenix prototype landed as a takeover in B135 (OT.R70: test room only, Crossroads,
F6/F7; `viewer/src/zombies/`, 1,940 lines; a private `s2u-zombies-pack` zip for the model and sounds). #587 (open) is
the FCW-15 design note: the room owns spawns, waves, chase, melee, damage and points; its owner rows H356-H360 collide
with numbers now taken on main. Under the current rules contract the capability `behaviour.zombie.chase-melee` is
**reserved** (`creator-contracts/src/handlers.ts:71`); Forge Play passes no `RuleNpcSeats` (`forge/match.ts:259`) so a
rules NPC release does nothing; there is no NPC health or hit event, no lay-at-point action, no damageable entity,
`item.give` is inventory only, `cue.play` plays disc sounds only, and the v2 mesh and audio roles never apply.

**The modding wiki** (`shared/modding-wiki/`, Fumadocs on Next 16, static export; MW-1..12 built; deployed
2026-11-07 ~07:50Z to `socom2legacy-modding.pages.dev`; the custom domain `modding.socomlegacy.com` owed, H410).
Fifteen prose pages, 735 to 2,186 words each, `defaultMdxComponents` only -- no Cards, Steps, Tabs, Callouts, images or
diagrams anywhere. No surface for agents: no `llms.txt`, no raw-markdown endpoint, no agent page; Next's own
`AGENTS.md` output is git-ignored. It uses the design system's tokens and fonts only (`sync-theme.mjs`), not
`base.css`, `components.css` or the icons. ML-11 (on `agent/mods`) edits thirteen pages for MODS.

**The MCP connection.** One "Connect your agent" panel (`viewer/src/agent/panel.ts`, 253 lines) in the Forge's right
dock and a `<details>` in the solo test room: a client picker (Claude Code, Codex, another MCP client -- **no Claude
Desktop**), a "Copy connection instructions" button with a five-minute countdown that copies one long block mixing the
human's commands with ~150 words of agent instructions (`connection.ts:91-105`), the gateway's **unstyled** consent page
(`forge-agent/src/oauth.ts:212`), a permissions list, then WebRTC. MC-12's "connection stepper: Add server ->
Authorize -> Pair this page -> Connected", a public setup route and `agentSetup.test.ts` were planned
(`2026-10-24-forge-agent-webrtc.md:223-230`) and **never built**. LATER 483 (the page closes "The invitation expired"
while the gateway still waits), 423 (the gateway address fixed at build time), no TURN (RUNBOOK:665). The gateway is
live at `agent.socom2legacy.com` (H284, H335 answered).

**Crispy's UI conventions** (the standard the owner names): five dock zones with movable tabs and drag-and-drop
docking (`shell/panel.ts`), resizable docks with keyboard-driven handles (`dockSizeKey`, `page.ts:1775-1847`),
`<details>`/`<summary>` dropdowns registered so one is open at a time (`page.ts:1616-1623`), the detail-distance
precedent for a shared keeper drawn as an `fx-range` row (`panels/viewPanel.ts:66-80`), keyboard hints in tooltips via
`key()` (`page.ts:370`), number scrubbing on every number input (`scrub.ts`), `.fx-field-row` three-column rows with
per-field reset, a 12 px minimum text size, every colour an `--fx-*` alias of an `--s2u-*` token (refused otherwise by
`tokens.test.ts`), `*_ADAPTATION` names with "a browser adaptation, FG.R2" comments.

## 3. Goals, non-goals, anti-goals

**Goals.**
1. Crispy's work on `main` whole: his three commits, every review finding closed or ruled, the server half built,
   the AI grid read, his tests written. The public PR's follow-up comment keeps him informed.
2. The Forge editor draws at the player's RENDER SCALE and offers it in his Draw dropdown, in his conventions.
3. `sample-yard.forge.zip` dropped into MODS becomes a map: in the Forge's base picker under **Custom Maps** beside the
   player's saved layouts, each row saying whether it is ready or needs packs not here; in the test room's map list.
4. One pack-format ruling before the first Thunderstore upload: canonical payload, forward compatibility, licence and
   provenance, identity, one bundle shape.
5. A written verdict on the paused Forge sprint and a re-cut plan the owner can approve or park.
6. Zombies scoped as a generated pack: the primitives it needs, in order, with the simulation-track rows named.
7. The wiki rebuilt in two layers -- a short visual human surface, a sophisticated agent surface -- without either
   getting in the other's way; an MCP connection guide in it.
8. The MCP connection flow rebuilt as MC-12's stepper in Crispy's conventions, with Claude Desktop added and the
   consent page styled.

**Non-goals.** S5 (friends and authority), S6 (missions and campaigns) and S7 (ocean and jobs) of the Forge sprint stay
parked. Fetching packs from Thunderstore in the page (H342) is not here. Data mods or model packs in lobby matches
(H414, H273/H274) are not here. A v2 *texture* role that applies (ML.R3) is not here; the HD pack stays the older
payload wrapped. PS2 crossplay, nothing.

**Anti-goals (a failure even if it works).** Overwriting a Crispy UI decision while "fixing" (OT.R112). A per-map or
per-pack switch that forces a code path (AGENTS.md "How to work" 4). A custom map that plays in a lobby match without
the room agreeing on its gameplay digest (FCW-17; H273). A wiki page where the agent text is the first thing a person
sees, or where a person has to scroll past it. A second bundle format beside the sample's. A disc asset, a Phoenix
asset or any third-party art in git or in a build (RS.R8, H275, OT.R92).

## 4. The decisions (the design's rulings, `FP.R<n>`; the owner's own marked)

- **FP.R1 -- the order.** The owner's words set it: Crispy's work, the mod loader, the pack extensions with the two
  confirmations (the HD pack, the sample yard), then the wiki extensions that match them -- that is the first slice.
  Zombies, the sprint review, the wiki refactor and the MCP flow follow; the wiki and MCP work run in a parallel lane
  because they live in `shared/modding-wiki/` and `viewer/src/agent/` -- the one file they share with the first slice,
  `forge/page.ts` (the old panel's removal in FP-14), is edited last, after stage B's `page.ts` rows (FP.R11).

- **FP.R2 -- one bundle format: the sample's.** We adopt `s2u.creator/forge-map-bundle` version 1 as the Forge map
  bundle: a zip whose root (or one folder) holds `forge-bundle.json` -- `{schema, version, layout: <record v3>, packs:
  [{ref: PackRef, root: "packs/<n>/"}]}` -- and each pack whole under its root. It is what FCW-35 already asked for
  ("a download that bundles a layout with its pack", wishlist :380) and it keeps the layout a sidecar of the packs, not a
  member of one, so one layout can require several packs and a pack can serve several layouts. The validator and its
  fixture (the sample yard, which holds no game content and is CC0) go into `@s2u/creator-contracts`; the engine contract
  moves to `0.1.2` (additive: the bundle schema and content-map v2) so the sample's `contract: ">=0.1.2 <0.2.0"` is met
  honestly rather than by editing the sample. *The owner confirms this (4.3's question 3) because the sample came from
  outside the repository.*

- **FP.R3 -- a content pack applies.** The production `ForgeContentSource` is the pack registry: MODS's v2 store supplies
  `availablePacks` and the map, asset and GLB members to the Forge and the test room. This is FCW-09/10's resolver, the
  one piece whose absence makes every content layout unopenable today. A content pack is listed in MODS with where it
  applies -- "Forge, test room" -- and never in a lobby match (H273; `onlineCreatorLayoutRefusal` stands).

- **FP.R4 -- Custom Maps is a section of Crispy's picker, built in his conventions, and he is told.** OT.R112 makes the
  picker his. We add one group, **Custom Maps**, to his new-layout card and to the base select: every content map an
  installed pack carries and every layout the player has saved. Each row carries a readiness hint drawn once, in one
  place: a caption under the name -- "Ready" / "Needs 2 packs not here: example.sample-yard 0.1.1, …" -- from
  `missingPackRefs`, and the same words as a toast when the player switches to it (the picker row for a glance, the
  toast for the moment of choice). The follow-up comment on public PR #1 names the addition so Crispy can object or
  improve it. *Taste on the product track, logged for the owner; the "or in the actual base dropdown area itself" of his
  brief is read as both.*

- **FP.R5 -- render scaling is the shared keeper, in the Forge too.** The Forge editor's viewport reads
  `videoSettingsKeeper()` and the adaptive ratio exactly as matches do; a RENDER SCALE row joins the Draw dropdown's
  Picture group beside detail distance, built on the detail-distance precedent (`fx-range`, the keeper bound, disabled
  under PS2), with the value named in the summary as the Camera dropdown does. No Forge-only value: the one setting
  the launcher, VIDEO OPTIONS and the Forge all read. *Reading of "full render scaling following his conventions";
  the owner confirms (question 1) -- the alternative reading, a UI scale, is noted.*

- **FP.R6 -- Crispy's Play-changing items are the owner's.** The escort zone marked from round start, the gate lever on
  the gate and Escort on non-escort maps change what Play does; the parity rule, not OT.R112, decides them. *Default
  until his word:* they apply to a Forge layout's own Play (creator content, no original to compare) and never to a
  disc map played unchanged; each labelled an adaptation. Question 2. *The controller (b6) files the owner row on
  `agent/forge-crispy` before #728 lands: H424 (pending the merge's number check).*

- **FP.R7 -- the pack-format review is a gate, not a note.** FP-8 (section 5) delivers a contract `0.2` proposal with
  the fixes section 2 lists; no pack of ours is uploaded to Thunderstore, and no wiki page says "publish", before the
  owner has read it. Fields a `0.1.x` reader may ignore (`extensions`, `license`, `authors`, provenance) can land in
  `0.1.2` under the forward-compatibility rule the review writes first.

- **FP.R8 -- zombies become a pack only through the general primitives.** No zombie code path in the engine (the
  wishlist's rule for CTF holds): the capability is unreserved with a room handler shared with the test-room code; NPC
  health and hit events, lay-at-point, a damageable entity, the kit gate are general actions any pack may use. The
  simulation track where a row touches a round. The proof is an agent producing the pack over MCP from the wiki's
  agent page alone.

- **FP.R9 -- two layers on every wiki page, by construction.** The page body is the human surface: under ~400 words
  before the first fold, one diagram or screenshot where a picture says it, Fumadocs Cards, Steps, Tabs and Callouts,
  the design system's components. The agent surface is (a) a collapsed **For agents** block at the end of every page
  holding the exact, complete instructions (schemas, refusal codes, commands, the MCP operations) -- closed by default,
  one click to open, never above the fold -- and (b) the same text served raw: `/llms.txt` (the index), `/llms-full.txt`
  (every page's agent block), and each page's `.md` beside it, so an agent fetches without rendering. One "Give this to
  your agent" copy button per guide copies a short prompt that points at those addresses rather than pasting the text.
  Generated from one source (the MDX) by the build; a drift test holds the agent blocks to the contract as MW.R5 holds
  the reference.

- **FP.R10 -- the MCP flow is MC-12's stepper, in Crispy's conventions.** Add server -> Authorize -> Pair this page ->
  Connected, as a panel in the Forge's dock and the test room, and as a public route `/agent` that works before the
  Forge is open; the client picker gains Claude Desktop (its `claude_desktop_config.json` snippet; measured in the
  compatibility record before it is listed as working); the copied text is the human's commands only -- the agent's
  instructions move to the wiki's agent page, whose address the pairing passes; the consent page is styled with the
  design system; LATER 483 and 423 are fixed in it. Pad-reachable (MCW.R10).

- **FP.R11 -- `forge/page.ts` has one writer at a time.** The file is 5,730 lines on `main` and larger on Crispy's branch;
  FP-1b, FP-2, FP-6 and FP-14's last commit all edit it. Order: FP-1b, FP-2, FP-6, then FP-14's removal -- each row's
  worktree takes the file when the previous row's branch is merged into the lane, never two open at once (one writer per
  worktree, AGENTS.md). FP-1a never touches it, so the server half runs beside FP-1b. The wiki and `agent/` work run in
  parallel because they touch no other first-slice file. *The planning seat's call.*

- **FP.R12 -- a bundle is an installed thing, not a save.** An imported bundle is a read-only custom-map record MODS owns
  (its layout and its pack refs, keyed by the bundle's digest): re-importing the same bundle changes nothing, removing
  the row removes it, and the Forge opens it as a read-only base; "Save as" copies it into the player's saves as an
  ordinary layout. Why: a save is mutable and autosaved, so a bundle copied into the saves would duplicate on every
  drop and strand when its pack is removed. *The planning seat's call.*

- **FP.R13 -- the test room's depth and stage B's evidence.** The test room walks a custom map (props, spawns,
  collision; a layout's static pieces on its base) and plays nothing: no rules, NPCs or objectives there -- Forge Play's
  machinery stays the Forge's. Stage B's gate evidence for FP-1a is a two-server lobby on the host (the local playtest
  setup: two servers, two accounts), not live central; live central carries it with the release under the central-first
  order FP-1a writes, which is the owner's deploy. *The planning seat's call.*

### 4.3 Questions only the owner can answer (defaults the work follows meanwhile)

1. **Render scaling.** FP.R5 reads it as the shared RENDER SCALE in the Forge's viewport and dropdown. If "UI scale"
   (his 12 px minimum, docks at DPI) was meant, FP-2 changes shape. *Default: FP.R5.*
2. **Crispy's three Play items** (FP.R6). Keep as Forge-layout-only adaptations, revert to the original's behaviour, or
   keep everywhere. *Default: Forge-layout-only, labelled.*
3. **The sample's origin and the bundle format** (FP.R2). Who produced `sample-yard.forge.zip` and its
   `forge-map-bundle` schema (Crispy's own export? an agent's draft against the wiki?); is it ours to adopt and publish
   as the bundle format? Neither this seat nor the controller knows it. *Default: adopt it as FP.R2 says; FP-4 waits
   for the answer.*
4. **Custom Maps in the test room too.** The brief says "forge or test room"; FP-6 does both. *Default: both.*
5. **Zombies' depth now.** FP-11's room work is simulation track and weeks; start it after FP-8's review or park it
   behind the wiki and MCP work. *Default: scoped and rowed now, dispatched after FP-8.*
6. **The release cut.** Section 6's five stages, or compress C into B. *Default: five.*
7. **Close #507, #508, #511** (branches kept; #508's acceptance specs harvested to `docs/specs/` first). *Default: wait
   for the word, as the board row says.*
8. **H342, the Thunderstore team name**, and H413's upload: both still gate every "publish" page. *Default: placeholders
   stay; no publish page says an address.*

## 5. The work (rows for the board and the plan)

Sizes: evening / days / week+. Track: product unless marked **sim**. Each row's brief at dispatch names its worktree,
files, failing test first, commit form and four-block report (AGENTS.md).

| id | what | depends on | size | track |
|---|---|---|---|---|
| FP-0 | The plan from this design (`../plans/2026-11-xx-forge-path.md`), the board rows (order 50-79), the release-scope lines handed to the controller, the owner rows H424+ for 4.3, OWNER-WORDS entry | approval | evening | docs |
| FP-1a | **Crispy integrated fully -- the server half.** `forgeSimMap` composes doors, turrets, gates/levers, C4 barriers, ladders, hostages, extraction zones, tactical points, spectator views, respawns and flares in a lobby match, central's refusals lifted kind by kind as each is built -- one task, one branch, a commit with its tests per kind, **one simulation-track review** of the whole (each kind cited where it acts in a round); the central-first contract order written into `deploy/README.md`'s release steps; the AI grid `FLOOR_AI_CELL` 32 -> the disc's 10 as a reading (research 75). Files: `match/`, `central/`, `creator-contracts/`, never `forge/page.ts` | #728 landed | week+ | sim |
| FP-1b | **Crispy integrated fully -- the editor findings.** Tests for commits 2-3 and the round trips; forward-compatibility pins; the eleven small findings (fly keys, night lens 0..1, `bomb.place` Breach, `zone:` clash, turret collision, helpers, loose pins, the help card, Codex's three P2s); FP.R6's default applied and labelled. Owns `forge/page.ts` for its turn (FP.R11) | #728 landed | days | product |
| FP-2 | **Forge render scaling** (FP.R5): the viewport on the shared keeper and the adaptive ratio; the RENDER SCALE row in Draw > Picture; the pad menu item as detail distance has; tests that the editor's pixel ratio follows each preset and that OFF pins hold. Takes `forge/page.ts` after FP-1b (FP.R11) | FP-1b | days | product |
| FP-3 | **The old Forge PRs closed**: #508's five creator specs harvested into `docs/specs/` where still true, LATER rows for anything else wanted (the Tools menu is Crispy's call now), #507/#511 closed, HANDOFF's FORGE-CRISPY claim released at #728's merge | owner's word (4.3 q7) | evening | docs |
| FP-4 | **The bundle contract** (FP.R2): `forge-map-bundle` v1 validator in `creator-contracts` (schema, one-folder tolerance, every pack root validated as v2, the layout as record v3, `requires` ⊆ packs carried or declared), content-map v2 read (what v2 adds over v1 is read from the sample and named), `ENGINE_CONTRACT_VERSION` 0.1.2 with its additive note, the sample yard as the fixture under `test-fixtures/` (CC0, listed in `MANIFEST.json`), the JSON Schema file published for the wiki | FP.R2 confirmed | days | product |
| FP-5 | **MODS imports a bundle and a content pack** (FP.R3, FP.R12): the classifier's sixth marker `forge-bundle.json`; each carried pack installed into the v2 store (de-duplicated by `PackRef`); the bundle itself an **installed, read-only custom-map record owned by MODS** (its layout + its pack refs, keyed by the bundle's digest, de-duplicated on re-import, removed with its row); a v2 `content` pack dropped alone also accepted; the row says "Custom map · Forge, test room"; the production `ForgeContentSource` and `availablePacks` fed from the registry (`pageEntry.ts`) -- the installed content packs' JSON members (maps, assets) read into memory when the Forge or the test room boots so `map()`/`asset()` stay synchronous, GLB members through the async `member()`; the builder makes the source async instead only if that preload exceeds a bound it names; the overlay's words for a bundle; refusals in words for a bundle whose pack hash mismatches or whose contract the engine does not meet | FP-4, #729 landed | week | product |
| FP-6 | **Custom Maps** (FP.R4, FP.R12): the group in Crispy's new-layout card and base select -- installed bundles (read-only; "Save as" copies one into the player's saves as an ordinary layout), bare content maps from installed packs, and the player's saved layouts -- each with its readiness caption from `missingPackRefs`, the toast on switch, the Check sheet's rows unchanged; the test room's map list gains the same group at the test room's depth: **it walks the content map with its props, spawns and collision, and a layout's static pieces on its base -- no rules, NPCs or objectives** (a test instrument; Forge Play's machinery is not ported); e2e: drop the sample, open it in both, Play it in the Forge on the blank-floor rules, walk it in the test room; the public PR #1 follow-up comment names the addition. Takes `forge/page.ts` after FP-2 (FP.R11) | FP-5, FP-2 | week | product |
| FP-7 | **The HD pack's confirmation, the part not yet run**: ML-10's browser checks on the 4070 already dropped ML-5's wrapped zip into MODS, applied it, played a two-seat lobby match and ran the model pack and e2e 7/7 (`agent-mail/evidence/mods-ml10-browser/REPORT.md`; WebGL2 within the pacing bar bar one 50.1 ms frame; the WebGPU 800 ms stall is LATER 741). Left: the pack under a WebGPU-default world once v0.4.14 flips the default (LATER 741 closed or ruled), and the temporary button's live run once H417 is done; the records in the HD plan's Log; H413's upload is the owner's | #729 landed; v0.4.14's WebGPU default; H417 | evening (host) | product |
| FP-8 | **The pack-format review and the 0.2 proposal** (FP.R7): one spec -- the forward-compatibility rule (`extensions`, minor versions older readers ignore), `license` (SPDX) / `authors` / per-member asset provenance (original, ZDB-derived refused), identity (team-owned ids, immutable versions, the digest's scope, Thunderstore name collisions), `target` sets for every retail release (H364), bytes and decode budgets shared by every loader (glTF validation, triangle/texture/audio limits, zip-bomb policy), withdrawal and operator approval (FCW-17), what of `0.1.x` payloads MODS keeps applying (ML.R3) and the path to a v2 texture role; conformance fixtures beside the schema; what lands in 0.1.2 now vs 0.2 | FP-4 | days | docs |
| FP-9 | **Wiki extensions to match the first slice**, written straight into FP-12a's new shape (never in the old one to be rewritten): a Custom Maps kind page (the bundle, the sample yard downloadable, the readiness hint explained), the MODS walkthrough with screenshots, the manifest reference regenerated for 0.1.2, the earlier-formats page saying what MODS applies; "publish" pages still hold placeholders (q8) | FP-4..6, FP-12a | days | docs |
| FP-10 | **The Forge sprint review**: a verdict document from section 2's survey -- what S1-S4 delivered against the wishlist's promises, which rulings still bind, what to resume (FCW-35, FCW-12, FCW-08/FUI-16, FCW-31's parity paths, the kit gate, lay-at-point, NPC health/hit, FUI-24) and what stays parked (S5-S7); a re-cut plan with points the owner approves or parks | FP-8 | days | docs |
| FP-11 | **Zombies as a generated pack** (FP.R8): #587's note renumbered (H424+ or the next free) and landed as the design; `behaviour.zombie.chase-melee` unreserved with the room handler shared with `viewer/src/zombies/` (**sim**); `RuleNpcSeats` in Forge Play; `npc.hit`/`npc.damage` events, kinds and health through spawner options (LATER 458), lay-at-point, entity health, the kit gate (**sim** where they act in a round); the v2 mesh and audio apply drivers or an explicit companion asset pack; FCW-35 (installed rules) first; the proof: an agent writes `s2u-pack.json` + `rules/zombies.json` from the wiki's agent page and plays it in Forge Play | FP-8, FP-10 | week+ ×2 | mixed |
| FP-12a | **The wiki's new shape** (FP.R9), started now on ML-11's pages: the information architecture (Start / Make a pack / Kinds / Custom maps / Connect an agent / Reference / Publish), the `For agents` block component, `llms.txt` / `llms-full.txt` / per-page `.md` generated at build, the "Give this to your agent" button, the drift test over the agent blocks, `components.css` and the icons adopted, the diagram pipeline (inline SVG from a script in the design system's tokens); two pages moved into it as the proof | #729 landed (ML-11's pages); parallel lane | week | product |
| FP-12b | **Every page rewritten** to the two layers in FP-12a's shape, the diagrams (pack anatomy, the MODS flow, the bundle, the pairing sequence), screenshots from a release build, the custom domain (H410) | FP-12a, FP-9 | week | product |
| FP-13 | **The MCP connection guide** in the wiki: one page per client (Claude Code, Codex, Claude Desktop, other) with the stepper's screenshots, the consent page, the permissions and what each allows, the operations an agent gets (from `forge-agent-protocol`), troubleshooting (expired invitation, UDP/TURN, the hidden-tab revoke), the agent block holding the exact pairing protocol | FP-12a's shape, FP-14's screens | days | docs |
| FP-14 | **The MCP connection flow** (FP.R10): the stepper panel in Crispy's shell conventions (a movable tab, `fx-field-row`, `<details>` steps, key hints, 12 px), the public `/agent` route, Claude Desktop added and measured in the compatibility record, the copied text split (commands only; the agent reads the wiki), the consent page styled, LATER 483 and 423 closed, `agentSetup.test.ts`; MCW.R10's pad reach. Files: `viewer/src/agent/`, `forge-agent/`; the old panel's one-line removal from `forge/page.ts` is its last commit, after FP-6 (FP.R11) | #728 landed; parallel lane | week | product |

**Left to the builder.** The exact words of refusals and captions (the repository's voice: plain, no jargon); the
diagram tool (inline SVG from a script is preferred so the drift test can read it); whether the test room's Custom Maps
entry is a group in its existing map select or a second select; the order of FP-1a's kinds; the preload bound in FP-5; FP-14's step copy; which
Fumadocs components. Anything that changes what the game does is not the builder's and comes back as a row.

## 6. The releases (a proposal for the controller's `releases/` docs)

| stage | release | holds | gate |
|---|---|---|---|
| A | v0.4.15 (the controller's, in flight) | #729 Mods, #728 Crispy + FC-1, #724/#725 public tooling, ML-11 wiki pages; FP.R6's default labelled | as the controller has it |
| B | v0.4.16 "Crispy whole" | FP-1a, FP-1b, FP-2, FP-3; FP-7's confirmation | the data view; the Forge e2e leg; a two-client lobby with placeables on the host's two local servers (FP.R13); live central carries it at the deploy, the owner's |
| C | v0.4.17 "Custom maps" | FP-4, FP-5, FP-6, FP-9; FP-8 read by the owner before any upload | the data view; the sample yard e2e in the Forge and the test room; the wiki's drift tests |
| D | v0.4.18+ "the creator platform resumed" | FP-10's re-cut plan dispatched; FP-11 in its slices | per slice; sim rows reviewed each |
| E | parallel lane, lands when ready (wiki deploys are not releases) | FP-12a (starts at stage A), FP-12b, FP-13, FP-14 | the wiki's checks; `agentSetup.test.ts`; a measured pairing per client |

## 7. Constraints that bind every row

The parity rule and the two tracks (AGENTS.md); OT.R112 (the Forge UI is Crispy's -- an addition, never a change to
his, and the public PR told); OT.R53 (product track: one review per batch); RS.R8 and H275 (no game or third-party
content in git or a build; the sample is CC0 and tiny); H273/H274 (creator content never in a normal lobby match
without the room's agreement); MW.R5 (the format is the source of truth; drift tests); MCW.R10 (pad reach); one
writer per worktree; heavy runs serial under the host rule; the board rows at order 50-79 written by this seat, the
release docs by the controller.
