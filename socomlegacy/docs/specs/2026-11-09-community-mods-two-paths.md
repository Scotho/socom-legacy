# Community mods: two paths, Arma first -- the scoping spec

> **Status: draft for the owner.** Written 2026-11-09 by the Forge seat (ab) for the controller, seat 99. Documents
> only: no code, no plan, no `HUMAN_TASKS.md` or `LATER.md` row is changed here; the owner rows below are PROPOSED.
> **Base:** `agent/community-mods` at `7eee032f9` (`agent/mega`, which holds `origin/main` `8882b74b5`, tag v0.4.17).
> Every path is under `socomlegacy/` unless it starts `AGENTS.md` or `shared/`. A line cited `file:N` is at that base.
> Two documents not on the base are read from their branches: the pack-format 0.2 review (#750) at
> `origin/agent/fp-8` `15211f435`, cited **F8**, and the paused-sprint review (#755) at `origin/agent/fp-10`
> `2d5421767`, cited **SR**. **Evidence kind: source inspection only.** Tests named here were read, not run, unless
> section 12 says so. A rendered run is cited only where a plan's Log records it.
> **Track:** this document is product track (OT.R53). Rows below marked **sim** change what a round does.

## The owner's words

In seat 99, 2026-11-09, verbatim (the controller's brief, `agent-mail/evidence/server-mods-2026-11-09/BRIEF.md`):

> "I'd like to support to clear paths: one for simple map adjustments to existing maps with mods that do not require
> external assets or engine mods (i.e standard map, adjusted props straight from s2 disc, a few moved spawns or site
> locations to plant) and then these comprehensive mods. When scoping that work hand off where we are today and do
> consider client and server side mods (it would be nice if somebody could play zombies locally i.e)"

Earlier, in Discord: "More based off arma than rust." and "I think we have to keep our local and server mod packs
coherent because many i believe will be client and server mods".

**OT.R118** (`docs/MISSION.md:614`, added by the controller's `4d24bb6a1` after this spec's first commit). The owner's
answers to the brief's six gaps, in seat 99, verbatim:

> "1. yes fuse will be running a separate class of community servers with fewer restrictions and more freedom than our
> live ones
> 2. up to fuse, code does run now as this task specs
> 3. is the oxide model addetitive to what we built? does it fit with the arma inspired structure we started
> 4. yes out of rankings and that can be us or him, if he doesnt do it ensure its added as a handoff for us after hes done
> 5. see 4 kinda
> 6. modded servers are labelled and ranked separately"

Then, the same afternoon, the owner approved the controller's wording of the direction ("approved"); it is OT.R118's
last clause: **Arma first as the structure, Oxide-style plugins as a layer inside it.** One pack format, used by both
sides. The server declares its pack list, and a player who joins checks and loads it. A server plugin is one more pack
kind on the same manifest; it binds only to the rules contract's versioned events and actions, and runs on Fuse's
community servers. Player-side code stays undecided: only content and declarative rules reach players.

And on the handoff (seat 99, verbatim): "his handoff should be to approve him for the batch of work with authority to
improve and iterate it following our validation gates. the task is completed when he can run his zombie pack locally
and on the server, with room to grow it. changes must be reflected in docs and the modding wiki and be compatable with
existing systems (or those systems must be extended to make it so)"; corrected: "to be clear the validation gate i
meant is the zombie pack works locally and on the server, not our usual validation parioty stuff"; and on the
boundary: "that's right, without changing the engines core behaviour for standard s2 matches".

## 1. Summary (one screen)

- **Path 1 (simple map adjustments) is already built offline, and online in a Forge lobby.** A Forge layout on a disc
  map holds disc props placed, moved or hidden, moved spawns and moved bomb sites (section 3.1). It saves, shares by
  link and opens offline. Online, a pack-free layout plays in a Forge lobby, listed as a "Custom" match, with every
  placed kind admitted in the room since FP-1a (#745), and the room is uncounted. A layout that needs a pack, a creator
  mode or an authored map is refused online by one shared function, `onlineCreatorLayoutRefusal`.
- **Path 1's gap is small.** No join check of a declared pack list, no "Modded" label, no ranked/unranked mark a
  normal match could carry, and no way for a normal (non-Forge) game to carry a layout. Step 1 below closes the first
  three; the fourth is an owner question (CM-H3).
- **Path 2 (comprehensive mods) has its contract, not its loop.** The pack manifest (v2), the rules vocabulary, the
  room's rule host (offline), two example rules packs (paintball, capture the flag), the Forge map bundle and Custom
  Maps all exist. Missing: rules packs reaching the mode list, NPC seats in Forge Play, the zombie capability (reserved),
  any server-side pack loading, the join check, and any plugin kind.
- **Zombies today** are a test-room mode in TypeScript (Fuse's port of Project Phoenix, OT.R70), its waves hard-coded,
  its pack only a model and sounds, refused in any networked match.
- **Fuse's six pillars mostly match what we planned** (XT, the rules contract, the pack framework). His plugin layer is
  additive if a plugin is one more pack kind bound to our events and actions (section 7.3). What he raises that we never
  planned: join/leave events, server-side configuration and error reporting, persistent custom progression.
- **The build order** (OT.R118's last clause): (1) the join pack check, the modded label, the rankings separation --
  ours, Fuse taking a row only as far as his steps need it; (2) zombies locally as a pack; (3) the server plugin kind on
  Fuse's servers, Fuse leading; (4) zombies online on his servers through the join check.
- **The handoff to Fuse is an approval for steps 2-4** and what they need of step 1, given as a GitHub issue from our
  seat; he opens a pull request and asks there. His acceptance is one thing: his
  zombie pack runs locally and on his server, with room to grow. Our parity process does not bind his batch; what lands
  in our shared code may extend the engine but never changes its core behaviour for standard SOCOM II matches, and
  still keeps the leak check, the existing tests green, and the owner's controller's merge.
- **Open for the owner:** player-side code; how packs reach players; whether Path 1 needs a normal-match home; the
  community class beside HyperNode's terms; where a separate modded ranking lives (section 9).

## 2. The spine: Arma first, plugins inside

| Arma's piece | Ours | Where it stands |
|---|---|---|
| Client and server addons | one v2 pack format with `sides: client / server / both` | the field is validated (`packages/creator-contracts/src/packs.ts:99`, `:592`) and read by nothing (F8:136-137) |
| The server's addon list enforced on join | XT.R5: a match declares required / allowed / refused packs; joining gates on them (`docs/plans/2026-10-22-extensibility.md:52-55`) | planned: XT-9 (`:132`), FCW-18 (`docs/plans/2026-10-24-forge-creator-wishlist.md:473-478`); not built |
| Signed, approved server content | H274's research: the Arma 3 `verifySignatures` model (`extensibility.md:151-155`); F8 section 7's operator allowlist (F8:411-414) | proposed, not built |
| Mission content (map + mode) | the Forge map bundle carries a layout and its packs (`packages/creator-contracts/src/bundle.ts:7`, `:38-41`) | built offline (FP-4/5/6) |
| Server-side scripting | the rules contract's third level, "programmatic scripting", over "exactly the same versioned events, actions and permissions" (`docs/specs/2026-10-27-creator-rules-contract.md:92-96`) | designed, closed (H343) on our live servers; opened for Fuse's community class by OT.R118 |

What this means: a zombie mode is a server pack (waves, scoring), content packs (models, sounds) and a map bundle. The
join check tells a player which client-side packs he needs before he joins. Local and online play read the same packs.

## 3. Path 1 -- simple map adjustments

A disc map, no external assets, no engine mods: disc props placed, moved or hidden, a few spawns moved, plant sites moved.

### 3.1 What a layout holds today

| need | field | cite |
|---|---|---|
| the disc map | `base: {kind: "map", archive}` | `packages/creator-contracts/src/layout.ts:29-35` |
| a disc prop placed or moved | `Piece.asset` = `<archive>:<prototype>`, a 4x4 matrix | `layout.ts:87-94` |
| a disc prop removed | `hidden` (the base's own props, by placement key) | `layout.ts:138-142` |
| spawns | `spawns` | `layout.ts:133` |
| plant sites | `objectives.bomb.sites` (`BombObjectives`, `ForgeObjectives`) | `layout.ts:479-490` |
| doors, gates, C4 barriers, hostages, extraction zones, respawns, turrets, flares, views | the placed kinds | `layout.ts:1160-1161` |
| no pack, no mode | `requires?`, `mode?` absent | `layout.ts:232`, `:234` |

The file is `LAYOUT_VERSION = 1` (`layout.ts:27`); the saved record is `forge-layout` version 3 (`layout.ts:1140-1141`),
v2 read and migrated (`:1143`). Bounds: `RECORD_LIMITS` (2000 pieces, 48 spawns, coordinates within 100,000;
`layout.ts:1149`), 48 per placed kind (`:1164`).

### 3.2 Offline: built

- **Saves**: IndexedDB `s2u-forge` (`packages/viewer/src/forge/savesStore.ts:20`).
- **Share links**: the record gzipped into a `#forge=` fragment, up to 12,000 characters, else a file
  (`packages/viewer/src/forge/share.ts:5-13`). A pack travels as its reference only.
- **Custom Maps**: a group in the Forge's base picker holding installed bundles, bare content maps and saves
  (`packages/viewer/src/forge/customMaps.ts:10-17`), each with a readiness caption (`packages/viewer/src/packs/readiness.ts:24`);
  the test room walks a custom map offline only (`packages/viewer/src/customOffline.ts:1-10`, `packages/viewer/src/main.ts:2411-2413`).
  Built by FP-6, PR #756, merged into v0.4.17 (`066705eff`).
- **The bundle**: `forge-bundle.json`, `s2u.creator/forge-map-bundle` v1, the layout as a record v3 plus its v2 packs
  (`bundle.ts:7-17`, `:38-41`); validated by `validateForgeBundle` (`bundle.ts:167`). FP-4, PR #746. MODS imports one
  (FP-5, PR #748). **Nothing writes one from the Forge** (SR:157-160): a bundle is hand-made today.

### 3.3 Online today: a Forge lobby

- **Create**: `POST /lobby/forge/lobby` (`packages/central/src/forgeLobbyHttp.ts:46`, handler `:401-441`). Central
  parses the layout, checks its bounds and its online policy (`packages/central/src/forgeLobby.ts:621-636`): 413 past
  512 KiB (`forgeLobby.ts:83`), 400 `layout` for a parse failure, a bound broken or a creator layout.
- **What the room admits since FP-1a** (#745, merged into v0.4.16 at `57e232f2d`): the room composes the page's own
  placed kinds -- doors, turrets, gates and levers, C4 barriers, hostages, extraction zones, respawns
  (`packages/match/src/forgeSimMap.ts:40-50`, `:441-448`, `:529-566`); flares, tactical points and views are the page's
  only (`forgeSimMap.ts:46`; `layout.ts:162-165`, `:180-183`); a lobby's room seats no NPCs (`forgeSimMap.ts:60`).
  The sim-track review and the evidence are the plan's row (`docs/plans/2026-11-07-forge-path.md:57`): a rendered run of
  two clients on two local servers. **FP.R13 was proven in a browser on two pages, every placed kind, the hostage
  rescue in a placed zone included**: attempt 14 (Log 2026-11-08T18:22Z, `:227`), attempt 16 green (18:29Z, `:211`),
  its spec fixes reviewed PASS (18:40Z, `:197`). The row's "rescue leg owed" (`:57`) predates those entries.
- **Placement**: central gives the host the layout's SHA-256 (`packages/central/src/bridge.ts:1576-1578`,
  `forgeLayoutDigest`, `packages/central/src/forgeLayout.ts:40-41`); the host supervisor fetches it signed
  (`GET /hosts/forge-layout/<game>`, Ed25519, `forgeLayout.ts:22-36`, `:81`) and checks the digest
  (`packages/host/src/forgeLayout.ts:59`); the match process refuses a creator layout again
  (`packages/match/src/forgeProcess.ts:168-172`).
- **Joiners** receive the layout itself, not a digest to check (`forgeLobby.ts:918-922`). Disc props need no download:
  each player's own disc holds them.
- **Labels**: the "Custom" row says "not part of the original game" (`packages/viewer/src/console/render/rooms.ts:111-112`).
  On a community host it reads "unranked · HyperNode" (`rooms.ts:115-117`; the flag `forgeLobby.ts:342-346`).
- **Stats**: a Forge room is uncounted -- no hand-over, no round report, no recorder (`packages/match/src/forgeGame.ts:466-467`;
  `forgeLobby.ts:42`; ruled FG.R20/FG.R21). It never reaches a match row, the ladder or the career record.
- **Community hosts** may take a Forge lobby and never a ranked game (`packages/central/src/directory.ts:1095`;
  `deploy/host/COMMUNITY-HOSTS.md:6-9`); their results are refused (`packages/central/src/hostResults.ts:422`). This is
  Fuse's own CHT work, PR #668, landed in v0.4.11 (`57eac54f3`).

So **a pack-free adjusted disc map already plays online**, uncounted: labelled "Custom" on our servers, and
"unranked" / "HyperNode" on a community host (`rooms.ts:115-117`). This is source inspection plus the FP-1a rendered run; nobody has played Path 1 on a community host
that this spec found recorded.

### 3.4 Refused online, and by which code

One body, `onlineCreatorLayoutRefusal` (`layout.ts:2112-2123`), refuses three things, each in its own words
(`layout.ts:2129-2148`): an authored map's base (`record.ONLINE_CONTENT_MAP`), any pack the layout needs
(`record.ONLINE_PACKS`: its `requires`, its base's pack, a piece's `content.pack`) and a creator mode
(`record.ONLINE_MODE`). The same body (`onlineRefusal`) runs at four places: the Forge page before posting, through the
record's wrapper `onlineRecordRefusal` (`layout.ts:2108-2110`; called at `packages/viewer/src/forge/page.ts:7924`),
central's create (`forgeLobby.ts:633-636`) and restart (`forgeLobby.ts:558`), and the match process
(`forgeProcess.ts:171-172`). An authored map's loader refuses too (`packages/match/src/creator/contentMap.ts:114`).
The test room's guard is the class `CustomOffline` with the words "custom maps walk offline only"
(`customOffline.ts:10-13`). A bundle is never a lobby match (`packages/viewer/src/packs/customMaps.ts:1-10`).

### 3.5 The gap to "a normal match"

- **A normal game cannot carry a layout.** `PlacementRecord` has a map, a playlist and settings and no layout
  (`packages/central/src/controlLink.ts:648-660`); only `ForgePlacementRecord` carries `forge: {digest, bytes, archives}`
  (`controlLink.ts:642-646`). The supervisor refuses a map it does not serve (`packages/host/src/supervisor.ts:581`).
- **No match carries a declared pack list**, so nothing can check one at join.
- **No "Modded" label exists** (the agent's search of `viewer/src`, `central/src`, `match/src`: none).
- **No general "unranked" mark.** A match counts unless bots (BTL.R10, `docs/plans/2026-10-24-bots-land.md:79-80`;
  `packages/match/src/game.ts:993`), the results worker's limits (respawn, under five, password) or a community host
  stop it (`hostResults.ts:422`). The match rows' `reason` has no `modded` value (`packages/central/src/serviceStore.ts:1634-1635`).
  A Forge room avoids all of this by being uncounted.

The shortest route to Path 1 online in the owner's sense: keep the Forge lobby as its home and add the step-1 rows
(CM-1..CM-4). A layout in a normal game of the briefing-room list (CM-5) is a separate, larger piece; whether it is
wanted is CM-H3.

## 4. Path 2 -- comprehensive mods

### 4.1 Where we are

| piece | state | cite |
|---|---|---|
| Pack manifest v2 (`s2u-pack.json`) | built, validated: id, SemVer version, `target`, `contract` range, `kinds` content / rules / system, `sides`, dependencies, hashed files, intents, handler claims | spec `docs/specs/2026-10-25-pack-framework.md:15-28`; `packs.ts:14-25`, `:94-100`; `validatePack` `packs.ts:1040` |
| Identity | `PackRef {id, version, hash}`, hash over the manifest; "a hash shows compatibility, never that a client uses those bytes" | spec `:48-65` |
| Engine contract version | `0.1.2` | `packs.ts:25` |
| Rules vocabulary v0 | 21 events, 9 conditions, 26 actions; only presentation runs on a client | `packages/creator-contracts/src/rules.ts:77-96`; contract spec section 4 (`:98-127`) |
| Rule host | runs in the page's loopback room only; `RoomOptions.ruleHost` | `packages/match/src/creator/rules/host.ts:3-4`; `packages/match/src/room.ts:362-366`; Forge Play builds it (`packages/viewer/src/forge/match.ts:262`) |
| Retail unchanged with the host present | room-level tests | `packages/match/test/creator/rulesRetailParity.test.ts`, named in the contract spec `:199-202` (unit and room tests only) |
| Example rules packs | paintball, capture the flag, each with a scripted run | `packages/creator-contracts/examples/{paintball,capture-the-flag}/`, `examples/*.run.json`; `packages/creator-contracts/test/examplesPaintball.test.ts:10-19` |
| Rules from installed packs (FCW-35) | **not built**: the mode list's supplier is never passed | `packages/viewer/src/forge/page.ts:3336`; `layout.ts:2154-2159`; FCW-35 spec `:4`, owner's answer `:61-63` (H354) |
| NPCs as rule actions | `spawner.release` with a `brain`; brains `behaviour.npc.patrol`, `.sentry` | `rules.ts:205`; `packages/creator-contracts/src/handlers.ts:69-70` |
| NPC seats in Forge Play | **none**: a release seats nobody and says so | `host.ts:765-769`; `forge/match.ts:262` |
| Zombie capability | `behaviour.zombie.chase-melee` **reserved** | `handlers.ts:71` |
| v2 mesh and audio roles | validated, **never applied** | `docs/specs/2026-11-07-forge-path-design.md:131-135`; a v2 pack is "stored, not applied" (`docs/plans/2026-11-06-mods-loader.md:72-73`) |
| MODS (player-side loader) | texture packs apply everywhere, online included, under a fairness guard; data mods and model packs in the test room; v2 packs stored | ML.R5, ML.R13 (`mods-loader.md:104-118`, `:194-199`); `packages/viewer/src/packs/pagePacks.ts:3-6` |
| Server-side packs | **none**; FCW-17 (operator-installed, hash-pinned) parked | `forge-creator-wishlist.md:466-471`; SR:131, :219 |
| Third-party code | no pack code runs; level 3 closed | contract spec `:256`; H272 (`docs/HUMAN_TASKS.md:616`), H343 (`:747`) -- now opened for Fuse's community class by OT.R118 |
| Agent kit | the Forge's MCP gateway with rules operations; `forge.rules.test` runs a rules mode over a scripted run in a recording room | `packages/forge-agent/README.md:3-5`; `packages/forge-agent-protocol/src/forgeOperations.ts:27` (rules edits), `:186` (`rules.test`); contract spec `:20-25` |

### 4.2 Zombies: the worked example

- **The test-room mode** (OT.R70, `docs/MISSION.md:1147-1156` at `4d24bb6a1`): Fuse's port of Dustin's Project Phoenix, cleared,
  every build's test room, never a networked match. `packages/viewer/src/zombies/` (13 files, 1,940 lines; spec
  `docs/specs/2026-10-19-test-room-zombies.md`). Started by F6 on Crossroads (MP72) only, after walk mode, with its pack
  loaded (`packages/viewer/src/zombies/mode.ts:39-41`, `:264-270`); refused in a networked match (`mode.ts:266`;
  `main.ts:1311`). Mounted only by the test room (`main.ts:1302-1309`).
- **Its rules are code**: wave size (`packages/viewer/src/zombies/crowd.ts:5`), pace and health (`mode.ts:50-58`), the
  ten-second rest (`mode.ts:32`), weapon damage (`mode.ts:338`), kinds by wave (`packages/viewer/src/zombies/evolution.ts:9-21`).
- **Its pack is content only**: `s2u-zombies-pack` v1 inside an `s2u-mod` (`packages/viewer/src/zombies/pack.ts:14-17`);
  it "never runs anything in the pack" (`pack.ts:4`).
- **The plan**: FP.R8 -- zombies only through general primitives, no zombie code path in the engine
  (`forge-path-design.md:239-243`); FP-11, open, sim (`forge-path.md:68`); re-cut as SR's FS-10 (NPC primitives) and
  FS-11 (the capability unreserved, with a room handler shared with `viewer/src/zombies/`) (SR:213-214), after FS-4
  (rules from installed packs, SR:207). The contract's proof table names zombies + shop (`creator-rules-contract.md:280`).

### 4.3 The gaps

1. Rules packs never reach the mode list (FCW-35 / FS-4).
2. Forge Play seats no NPC a rule releases (FS-10).
3. The zombie chase and melee are reserved (FS-11).
4. v2 mesh and audio never apply, so the zombies' model and sounds cannot be a v2 content pack yet.
5. No bundle writer (FS-5).
6. No server loads any pack; no join check; no plugin kind; no plugin host.
7. Events Fuse names that the vocabulary lacks: `player.join` / `player.leave` (`rules.ts:77-81` has neither).

## 5. The rows, in build order

Ids `CM-n` (unused in `docs/`). Track: **product** unless **sim**. Owner of each row: **ab** (the Forge seat, ab/e5),
**AX** (the
agent-experience seat), **Fuse** (inside his approval, section 10). "Fuse may take" marks a step-1 row he may build
instead of us, as far as his steps 2-4 need it (OT.R118: "steps 2-4 and what they need of step 1"). Step 1 is shared.

| step | id | path | what | track | owner | needs |
|---|---|---|---|---|---|---|
| 1 | CM-1 | 1, 2 | **The server's pack list.** A Forge lobby's summary and a placement carry the layout's digest (already computed, `bridge.ts:1578`) and its declared packs `{id, version, hash, side, policy}` (XT-9's shape, `extensibility.md:132`); a community-class server adds its server packs' refs. No payload, metadata only (XT.R4, `extensibility.md:47-51`). | product | ab; Fuse may take | -- |
| 1 | CM-2 | 1, 2 | **The join pack check.** Before a seat is asked, the page compares the list with the MODS store (`missingPackRefs`, the readiness words `readiness.ts:24`), refuses by name with the host's "where to get it" text (`extensibility.md:165`), and checks the received layout's digest. A pack-free layout passes with nothing to load. | product | ab; Fuse may take | CM-1 |
| 1 | CM-3 | 1, 2 | **The "Modded" label** in both lists, on the `community?: true` model (`forgeLobby.ts:342-346`; `packages/central/src/lobby.ts:462-466`; `rooms.ts:111-117`): "Modded" whenever packs or plugins are declared or the server is the modded class. Whether a pack-free adjusted map shows "Custom" (today) or "Modded" is a product-track taste call, the controller's. | product | ab; ours unless Fuse's steps need it | CM-1 |
| 1 | CM-4 | 1, 2 | **Rankings separation.** A modded match never reaches the original ladder, stats or career record: a `modded` mark that central refuses as it refuses a community host's results (`hostResults.ts:422`) and bot matches (BTL.R10), and a `modded` reason if match rows track them (`serviceStore.ts:1634-1635`). Separate rankings are the modded class's own (OT.R118 6; CM-H5). **If Fuse does not build it, it is ours as LATER 797** (`docs/LATER.md:770`; OT.R118 4). | product | ab; Fuse may take | CM-1 |
| 1 | CM-5 | 1 | *Only if CM-H3 says so.* A layout in a normal game: an optional `forge`-style block on `PlacementRecord`, the supervisor and `makeRoom` composing it as `composeForgeSimMap` does (`packages/match/src/server.ts:1175-1181`), always CM-4's modded mark. | product (the room's composition already sim-reviewed under FP-1a) | ab | CM-1..4, CM-H3 |
| 2 | CM-6 | 2 | **Rules from installed packs** = SR's FS-4 (FCW-35 a, b, d, e, f): the mode list from the registry, the author's draft a local rules pack. | product | ab | H-FS-1 (SR:243) |
| 2 | CM-7 | 2 | **Fuse's starter: the zombie-wave rules pack + a Forge test map**, offline, on today's contract (section 10.2). | product | Fuse; ab reviews the contract fit | -- (runs today in a recording room and, as the layout's draft via `forge.rules.import`, in Forge Play; as an installed mode after CM-6; seats NPCs after CM-8) |
| 2 | CM-8 | 2 | **NPC primitives** = FS-10: `npc.hit` / `npc.damage`, per-kind health through spawner options, `RuleNpcSeats` passed by Forge Play (`forge/match.ts:262`). | **sim** where it acts in a round | ab, with Fuse | FS-6, FS-7 (SR:213); H-FS-1 |
| 2 | CM-9 | 2 | **The zombie capability** = FS-11's core: `behaviour.zombie.chase-melee` unreserved, one room handler shared with `viewer/src/zombies/`; the test-room mode then reads its waves from the CM-7 pack, not code (FP.R8). | **sim** for the room handler | Fuse and ab | CM-8 |
| 2 | CM-10 | 2 | **The zombies' content as a v2 content pack**: mesh and audio roles applied, or a companion asset pack; the `s2u-zombies-pack` read migrated, not broken (XT.R11, `extensibility.md:68-71`). | product | Fuse; ab reviews | FS-13 / H355 (SR:216, :234) for audio |
| 2 | CM-11 | 1, 2 | **The bundle writer** = FS-5: "Download as bundle", the layout with its content and rules packs. | product | ab (its Forge UI an addition Crispy is told of, OT.R112) | CM-6 |
| 2 | CM-12 | 2 | **Agent kit**: pack operations for agents (FS-8, SR:211) and the agent pages for rules packs and, at step 3, plugins. | product | AX | CM-6 |
| 3 | CM-13 | 2 | **The plugin kind in the manifest**: one more value of `kinds` (`packs.ts:94`), `sides: server` only, its capabilities as handler claims, a `contract` range, the same digest. A format change: it goes through the pack-format read (FP.R7; F8's H-FP8-a, F8:505). | product | Fuse proposes; ab reviews the format | H-FP8-a |
| 3 | CM-14 | 2 | **The plugin host on the community class**: the runtime is Fuse's design (OT.R118 2); it reaches the room only through `RoomOptions.ruleHost`'s seam (`room.ts:362-366`, `packages/match/src/creator/rules/seam.ts`), under budgets; a trusted host never loads one (CHT-1's `HOST_TIER`). | product in his packs; **sim** for any change to shared match or host code (`room.ts:362-366`; contract spec `:43-47`); the no-plugin retail proof stays green | Fuse; a fresh review where it touches `packages/match` or `packages/host` | CM-13 |
| 3 | CM-15 | 2 | **Server-side pack resolution** = FCW-17 on the community class: operator-installed, hash-pinned packs from the server's own disk; a client supplies no bytes or URL (`forge-creator-wishlist.md:466-471`; F8:411-414). | product on his class; **sim** for any change to shared match or host code (`room.ts:362-366`; contract spec `:43-47`) | Fuse | CM-1, CM-13 |
| 3 | CM-16 | 2 | **The modded class at central**: its tier, its listing, its results kept off the original rankings (CM-4) and routed to its own ranking if CM-H5 says so. | product | ab; Fuse may take | CM-4, CM-H4 |
| 4 | CM-17 | 2 | **Zombies online on Fuse's server**: the CM-7/9/10 packs plus a bundle, served by a community-class server, two clients through CM-2, a wave played to its end (FCW-19's GREEN shape, `forge-creator-wishlist.md:480-486`). | product on his class (OT.R118); **sim** only for any change to our shared room code | Fuse | CM-2, CM-9, CM-15 |

Rows this spec does not add: SR's FS-1 (0.1.2 completed), FS-2 (conformance fixtures) and FS-3 (parity paths) stay
SR's, waiting on the owner's reads (H-FP8-a, H-FS-1). CM-13 needs FS-1's forward-compatibility rule in place first.

## 6. Who owns what

- **ab** (the Forge seat): CM-1, CM-2, CM-3, CM-4, CM-5, CM-6, CM-8, CM-11, CM-16, every contract review of CM-7, CM-10,
  CM-13, and the review of CM-14 and CM-15. A row touching `packages/central`, `packages/match`, `packages/host` or the
  wire takes the normal path: a fresh review, the gate, the owner's controller's merge (AGENTS.md "Boundaries"). (Corrected
  2026-11-10: this spec first gave those rows to "Chris's online seat"; the owner: "no chris owning the online side, it's
  just wrong" -- the online work has been Craig's lanes since OT.R40, 2026-10-07, `plans/2026-10-02-online-path-target.md`.)
- **AX**: CM-12.
- **Fuse**: CM-7, CM-9 (with ab), CM-10, CM-13, CM-14, CM-15, CM-17; of step 1 and CM-16, what his steps need (CM-1,
  CM-2, CM-16 as far as they serve his servers). CM-3 stays ours unless his steps need it. CM-4 is his or
  ours (OT.R118 4); if not his, it is LATER 797 (`docs/LATER.md:770`).

## 7. Fuse's six pillars against what we have

### 7.1 Point by point

| # | Fuse proposes | what we have | verdict |
|---|---|---|---|
| 1 | Game events and supported actions | the rules vocabulary, versioned (`rules.ts:41`, `:77-96`), typed, budgeted (`rules.ts:49-71`), server-owned (contract spec section 5, `:129-141`) | **agree**. His examples map: round start = `round.start`, death = `player.death`, objective = `objective.change`, award points = `score.award`. "Spawn enemy" = `spawner.release` (seats nobody yet: CM-8). "End wave" is composed (`spawner.empty` + phases; contract spec `:280`). **Not planned:** player join / leave events. |
| 2 | A plugin loader for server owners | MODS is the player's loader (`mods-loader.md:9-14`); the manifest already has version, framework version (`contract`), dependencies and capabilities (handler claims) (pack framework spec `:15-28`); FCW-17 parked; F8's operator allowlist proposed (F8:411-414) | **agree on the manifest, gap on the server**: install / enable / disable / configure on a server is CM-14, CM-15. Configuration = the rules contract's level 1 (`mode.params`, contract spec `:84-87`). **Not planned:** a server owner's configuration file and admin surface (Fuse's own CHT build holds "no mod, plugin, or config-file load path", `docs/plans/2026-10-30-community-host-tier.md:94-95`). |
| 3 | A developer kit | the modding wiki (`shared/modding-wiki/`, FP-12a done, `forge-path.md:69`), two example packs with scripted runs, `validatePack` / `validateRules` diagnostics (XT.R7, `extensibility.md:59-62`), the MCP gateway and `forge.rules.test` | **agree**. Gap: plugin docs and a local plugin test harness (CM-12, CM-14). |
| 4 | Custom content support | v2 content packs; authored maps `maps/<mapId>.json` with a gameplay digest (pack framework spec `:214-243`); bundles and Custom Maps (FP-4..6); collision as a role | **agree, partly built**: offline only (`customMaps.ts:1-10`); mesh and audio roles never apply (CM-10). |
| 5 | Client and server coordination | XT.R5 (`extensibility.md:52-55`), XT-9, FCW-18 | **agree fully: this is the Arma half**, step 1 (CM-1, CM-2). Not built. |
| 6 | Compatibility and permissions | `ENGINE_CONTRACT_VERSION` with caret ranges (`packs.ts:25`; pack framework spec `:33-34`), the rules-pack floor (`:130-138`), refusal codes incl. `HANDLER_CONFLICT`, `DEPENDENCY_CYCLE` (`:117-128`), budgets that disable a pack for the round (contract spec `:185-187`) | **agree on versioning, limits, conflicts.** **Deliberately differ** on third-party code: declarative first (H272, H343); OT.R118 opens server code on his class only. **Not planned:** error reporting to a server's owner (diagnostics today are page-side). |

### 7.2 His other points

- **Modded servers clearly identified**: planned as a "Modded" badge (`extensibility.md:148-150`, `:165`); built only as
  "unranked · HyperNode" (`rooms.ts:115-117`). CM-3. **Agree.**
- **Custom progression separate from original rankings**: OT.R118 4 and 6; precedents BTL.R10 and CHT-2. CM-4. **Agree.**
  **Not planned:** persistent custom progression itself. The contract keeps rule state match-scoped and calls storage
  "an owner decision" (`creator-rules-contract.md:264`, `:300`); persistent cross-match state is out of its scope (`:317-318`).
  On his class that storage is his; nothing of it reaches central's stats.
- **An explicit agreement that this expands the parity-only scope**: OT.R118 is that agreement (section 8).
- **Start small: a small framework, one test map, a co-op zombie-wave mode through the same interfaces**: this is
  FCW.R18's and FP.R8's method (contract spec `:51-54`; `forge-path-design.md:239-243`). **Agree.** CM-7 is it.

### 7.3 The owner's question 3: is the Oxide model additive? Does it fit the Arma structure?

**Yes, with two conditions.** Checked against the contract and the format:

- **Additive if a plugin is one more pack kind on our one manifest.** The manifest already carries what a plugin needs:
  version, an engine `contract` range, dependencies, capability claims, a content digest (pack framework spec `:15-28`,
  `:48-65`). `kinds` is a closed list today (`packs.ts:94`), so a plugin kind is a format change (CM-13), not a new
  format.
- **Additive if a plugin binds only to the rules contract's versioned events and actions.** The contract already
  names this as its third level: "Constrained creator logic over **exactly** the same versioned events, actions and
  permissions ... a script sees what a rule sees and can do only what an action does" (`creator-rules-contract.md:92-96`).
  A mode that needs more gets a new general primitive, "never a mode-specific engine branch" (`:51-54`).
- **Then the zombie mode is**: a server plugin pack (waves, scoring), content packs (model, sounds) and a map bundle;
  the join check names the client-side packs. That is the Arma shape: client and server addons, the server's list
  enforced on join, mission content carried with the map.
- **It stops being additive if** a plugin patches engine internals outside the contract -- then each plugin pins one
  build and our updates break it, a fork in disguise -- **or if code runs in players' browsers without its own
  decision**. OT.R118 covers server-side code on Fuse's servers. Player-side code is undecided (CM-H1).

## 8. The parity rule and modded servers

- The rule's clause 5: an adaptation with no original is labelled and "never change[s] what the game does"
  (`docs/MISSION.md:57-60`). XT.R9: "The default SOCOM II experience is preserved; every change is an explicit opt-in"
  (`extensibility.md:65`). The contract: "with every rules pack off the game is unchanged: retail rounds run the
  existing per-type code, untouched" (`creator-rules-contract.md:43-47`), held by
  `packages/match/test/creator/rulesRetailParity.test.ts`
  (`:199-202`).
- **The scope ruling is OT.R118.** Modded play is a labelled, non-original mode on Fuse's community-server class,
  labelled and ranked separately. It never changes what an unmodded match does on our live servers, which keep today's
  rules: H273 and H274 stay as they are for them (`HUMAN_TASKS.md:617-618`).
- **What the ruling does not settle** (section 9): player-side code; how packs reach players; disc-derived content in
  community packs (RS.R8, H275 -- F8's `extracted` provenance refusal is the format half).
- **Shared code is still shared.** A change Fuse makes in our tree -- the events and actions surface, the join check,
  the loader, the wiki -- is code every live match runs. With no pack and no plugin, it must leave a standard match as
  it is: the owner's boundary, "without changing the engines core behaviour for standard s2 matches" (section 10.1).

## 9. Owner rows, PROPOSED (not filed; numbers are the controller's)

**Now ruled by OT.R118, so not asked:** the community class and who runs it (1); server-side plugin code on that class,
its design Fuse's (2 -- H272 and H343 answered for the community class, still open for our live servers and for
player-side code); modded matches out of the original rankings, built by Fuse or by us as LATER 797 (4, 5); modded
servers labelled and ranked separately (6); the direction, Arma first with plugins inside (the last clause).

| row | the ask | default meanwhile | blocks |
|---|---|---|---|
| CM-H1 | **Player-side code.** May any pack code ever run in a player's browser (a client plugin, a pack's UI script)? | **No.** Only content and declarative rules reach players (OT.R118's last clause); the client runs presentation actions only (`rules.ts:96`). | any client plugin |
| CM-H2 | **How packs reach players.** May a community server hand its packs to a joining player (Arma's mission download), or does the player always install them himself in MODS? XT.R4 hosts no payload without the rights (`extensibility.md:47-51`); H276 keeps requirements in the match record (`HUMAN_TASKS.md:620`); H342 fetches nothing from a store. | **The player installs them himself.** The join refusal names each pack and the host's "where to get it" text; nothing downloads. | CM-2's download half; CM-17's ease |
| CM-H3 | **Path 1's online home.** Is a Forge lobby ("Custom matches") enough for adjusted disc maps, or must one appear as a normal game in the briefing-room list or a rotation? | **The Forge lobby.** CM-5 is not built. | CM-5 |
| CM-H4 | **The community class beside HyperNode's terms.** CHT.R4 and H368 accepted "no match-server modifications" for HyperNode's community hosts (`community-host-tier.md:25-27`; `HUMAN_TASKS.md:788`), and Fuse's CHT build holds no plugin path (`community-host-tier.md:94-95`). Is the modded class its own tier, enrolled separately, or CHT's tier where the provider's terms allow it? | **Its own tier.** A CHT community host loads no plugin. | CM-14, CM-16 |
| CM-H5 | **Where a modded ranking lives.** Kept by Fuse's servers, or a separate ranking on our central? | **Fuse's servers.** Central keeps no modded ranking; modded results never reach central's ladder or stats. | CM-16's ranking half |

Already the owner's and unchanged: H-FP8-a (the pack-format read, FP.R7; blocks CM-13), H-FS-1 (stage D; blocks
CM-6, CM-8), H355 / OP-2 (pack audio; part of CM-10), H342 (Thunderstore), H273 and H274 for our live servers.

## 10. The handoff to Fuse

### 10.1 An approval for the batch

**Fuse is approved for the batch:** steps 2-4 (CM-7, CM-9, CM-10, CM-13, CM-14, CM-15, CM-17) and what they need of
step 1 (OT.R118): the parts of CM-1, CM-2 and CM-16 his servers need, and CM-4 if he takes it (else LATER 797). CM-3,
the label, stays ours unless his steps need it. He has authority to improve and iterate the work inside it.

**His acceptance gate is one thing:** his zombie pack runs locally and on his server, with room to grow (10.3).

**Our parity process does not bind this batch.** It is a labelled, non-original mode on his community-server class
(OT.R118): no per-value citations, no research notes or ledger rows, no per-task review chain.

**Craig's two conditions:**
1. **Docs and wiki.** Every change is reflected in our documents (the spec or plan it touches; this spec's rows) and
   in the modding wiki (`shared/modding-wiki/content/docs/`; e.g. `kinds/index.mdx:57` still says the Forge is paused).
2. **Compatible, or extended.** The work fits the existing systems -- the pack framework, the mods loader, the rules
   contract, the Forge map bundle, match stats -- or extends them to fit. No parallel system.

**The boundary: the engine's core behaviour for standard SOCOM II matches does not change** (the owner,
seat 99: "without changing the engines core behaviour for standard s2 matches"). His changes to our shared code may
extend the engine -- the events and actions, the join check, the loader -- but with every pack off, a standard match
plays exactly as before. The existing tests staying green is how that is shown. Anything that would change a standard
match goes back to the owner, and to the simulation track (OT.R53), instead.

**What protects everyone else** (his changes to our shared code that land on `main`):
- the leak check, which runs in the hooks and the gate and is never skipped (`AGENTS.md:67-74`);
- the existing tests stay green, so his change breaks nothing the live game does (the merging controller runs the gate
  on the pull request's head and the leak check over its range, `AGENTS.md:186-187`, and
  `packages/match/test/creator/rulesRetailParity.test.ts` holds a retail round unchanged);
- the merge by the owner's controller, after that seat's own checks (`AGENTS.md:245-253`, "Boundaries").

Code that lives only in his packs and runs only on his servers is his.

**Outside his authority:** our live servers' rules; `main` (a pull request, merged by the owner's controller);
releases and deploys; player-side code (CM-H1).

**How it is handed over and how questions go** (the owner, in seat 99, verbatim: "instruct fuse to open a pr for this
work and to reach out to you should it run into any blockers or questions, which you may respond to with my authority
where confidence is high based on insturction given so far."):
- The handoff is **a GitHub issue opened from our seat** (section 11 is its text), not a message Craig sends.
- Fuse **opens a pull request** for the batch.
- He raises **blockers and questions on that issue or on his pull request**. The Forge lane's seat answers there with
  the owner's authority where the instructions so far settle it with high confidence; anything else goes to Craig.

### 10.2 The starter task: CM-7

**What:** a zombie-wave rules pack and a Forge test map, offline, through the existing rules contract. Step 2's first
piece; it needs no engine change.

**Size:** days.

**Inputs:**
- The contract: section 4's vocabulary (`creator-rules-contract.md:98-127`), its validator (`rules.ts:1085`), the
  pack framework spec's rules-pack section (`2026-10-25-pack-framework.md:130-150`).
- The templates: `packages/creator-contracts/examples/paintball/` and `capture-the-flag/` (manifest, `rules/*.json`,
  README), their `*.run.json` scripted runs and tests (`packages/creator-contracts/test/examplesPaintball.test.ts`,
  `packages/creator-contracts/test/examplesCtf.test.ts`).
- The design reference for the waves: his own test-room mode (`crowd.ts:5`, `mode.ts:32`, `:50-58`, `evolution.ts:9-21`).
  These are the mode's values, not the original's: no citation owed.
- A Forge layout on Crossroads (MP72) with the zones, markers and spawners placed by authored id (the contract's
  authoring, `creator-rules-contract.md:14-19`), naming the pack as its mode and carrying its rules as the layout's
  draft, adopted with `forge.rules.import` (contract spec `:22-23`). Forge Play finds a rules spec only in that draft or
  in the installed packs (`packages/viewer/src/forge/matchRules.ts:71-75`), and the installed list is always empty today
  (`page.ts:3336`; `packages/viewer/src/pageEntry.ts:122-126` never passes it). The draft route works now; CM-6 is what
  makes "an installed pack as the mode" work (H354: the rules leave the layout then).

**The shape:** waves as phases, timers and variables: `spawner.release` per wave, `spawner.empty` to count a wave
cleared, `timer.start` for the rest, `npc.death` to `score.award` or a currency variable, `hud.value` for the wave
number, `message.show` for its start, `round.end` when no player is alive. The NPC brain is `behaviour.npc.patrol`
for now (`handlers.ts:69`); the zombie chase is reserved (`handlers.ts:71`) until CM-9.

**Deliverables:** `packages/creator-contracts/examples/zombie-waves/` (`s2u-pack.json`: kind `rules`, sides `server`,
contract `^0.1.1` or above; `rules/waves.json`; a README saying which parts are pack data and which are engine
capabilities), `examples/zombie-waves.run.json`, `test/examplesZombieWaves.test.ts`, the layout file, and the wiki
page for it.

**Acceptance for the starter:** `validatePack` and `validateRules` pass against the layout's entities; the scripted
run gives the expected wave trace through `forge.rules.test` (a recording room: actions recorded, none applied --
paintball's frame); the layout, its rules imported as its draft, opens in the Forge and Play runs its rules mode
offline. Live NPCs seat nobody in Forge
Play until CM-8 (`host.ts:765-769`): the README says so. A vocabulary gap is reported to ab as a proposed general
primitive, not patched.

**The boundary holds here too:** nothing in the starter changes a standard match; with the pack off, the Forge and
every match are as before.

**Must not touch in the starter:** `packages/match`, `packages/central`, `packages/host`, `packages/creator-contracts/src`
(the vocabulary moves with us at CM-8 / CM-9), anything online, any disc-derived bytes in git (RS.R8). The rest of the
batch is his under 10.1.

### 10.3 The batch's definition of done

1. **Locally:** his zombie pack runs offline -- the Forge's Play and the test room -- from packs (rules + content +
   bundle), with no zombie code path left in the engine (FP.R8).
2. **On his server:** the same packs run on a community-class server; two players join through the join pack check
   (CM-2) and play a wave to its end (CM-17).
3. **Room to grow:** it binds only to versioned events and actions and the pack manifest; no special case in the
   engine; a new need became a general primitive.
4. Docs and the modding wiki say what was built; the existing systems were kept or extended.
5. A standard SOCOM II match, every pack off, plays exactly as before; the existing tests are green.
6. If CM-4 is not his by then, it stays ours as LATER 797 (`docs/LATER.md:770`; OT.R118 4).

## 11. The handoff issue (opened from our seat)

The plain-words text of the GitHub issue that hands Fuse the batch. Nothing in it is our release dates or internal
state.

**Title:** Community mods: zombies as a pack, locally and on your community servers

**Body:**

> Hi Fuse -- thanks for your write-up on a modding framework. We went through it against what we have, and most of it
> is already there or planned: one pack format, the events and actions creators use, the Forge map bundle, MODS, the
> modding wiki.
>
> **Craig's decisions.**
> - You'll run a separate class of community servers, with fewer restrictions than our live ones. Our live servers
>   keep their current rules.
> - Plugin code runs on your servers, and its design is yours.
> - The shape: Arma first, plugins inside it. One pack format on both sides. A server says which packs it runs, and a
>   player's client checks them before joining. A plugin is one more kind of pack on our manifest, and it uses only our
>   versioned events and actions -- no patching the engine.
> - Code running in players' browsers is not decided. For now only content and rules reach players.
> - Modded servers are labelled and ranked separately. Modded matches stay out of the original rankings; you can
>   build that part, or we will after you're done.
>
> **You're approved for this whole batch, with authority to improve and iterate it.**
>
> **Done means one thing:** your zombie pack runs locally and on your server, players joining through the pack check,
> built so it can grow (our events and actions, our pack manifest, no special cases in the engine). Our usual parity
> process does not apply: this is a labelled modded mode on your servers.
>
> **Two conditions.**
> 1. Every change goes into our docs and the modding wiki.
> 2. It works with what exists -- packs, MODS, the rules contract, the map bundle, match stats -- or extends it. No
>    parallel system.
>
> **One boundary.** You can extend the engine (events, actions, the pack check, the loader), but not change how a
> standard SOCOM II match plays: with every pack off, a standard match plays exactly as before. If something would
> change that, ask first. What lands in our shared code still passes the leak check, keeps our existing tests green,
> and is merged by Craig's controller. Our live servers, `main`, releases, deploys and player-side code stay with us.
>
> **The order.**
> 1. The pack check on join, the "Modded" label and keeping modded matches out of the rankings -- mostly us;
>    take the parts your servers need.
> 2. Zombies as a local pack: rules plus content.
> 3. The server plugin kind, which you lead.
> 4. Zombies on your server, through the pack check.
>
> **A first piece you can start now:** a zombie-wave rules pack and a Forge test map on Crossroads, offline, on the
> rules we already have. Copy the paintball example in `socomlegacy/packages/creator-contracts/examples/`. Waves are phases,
> timers and spawners. In the Forge, import the rules into your layout with `forge.rules.import` so Play runs them. The
> zombie chase is still reserved, so use the patrol brain until we open it together. For this first piece, please don't
> touch the match server, central or the contract source: if the rules can't say something, tell us here and we'll add
> a general action. For step 3, a short design of the plugin kind and its runtime before code would help.
>
> **How we work together.** Open a pull request for the work. If you hit a blocker or a question, post it here or on
> your pull request. The Forge seat answers with Craig's authority where his instructions already settle it; anything
> else goes to Craig.
>
> The full scoping, with every file and row: `socomlegacy/docs/specs/2026-11-09-community-mods-two-paths.md`.

## 12. What this spec did and did not verify

- **Kinds of evidence.** Source inspection at `7eee032f9` and on the two branches named in the header. The FP-1a
  two-client run is a rendered browser run recorded in the Forge path plan's Log, not run here. No unit test was run
  for this spec; the docs tests run at its commit are reported with it.
- **OT.R118** is cited at `docs/MISSION.md:614` (`4d24bb6a1`); the rest of the tree is cited at `7eee032f9`, and
  MISSION's later lines moved by its insertion (OT.R70 is cited at the head).
- **Not verified:** creating a lobby from an installed Custom Maps bundle that carries no packs (the Forge's Create
  lobby reads the current layout, `page.ts:7915-7925`; no run or test of that case was found); Path 1 played on a
  community host (none recorded); the agent kit's operation names beyond `forgeOperations.ts:27` and `:186`.
- **Searched, not found:** a "modded" label or field (viewer, central, match sources); `player.join` / `player.leave`
  events (`rules.ts`); any server-side pack loader (`packResolver.ts` does not exist; F8:403-404 says the same); a
  client-to-server layout digest check for joiners.
