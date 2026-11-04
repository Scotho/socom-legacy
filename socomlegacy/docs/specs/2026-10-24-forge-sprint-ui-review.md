# Forge creator sprint plan review and Forge UI audit

Written 2026-10-24T21:21Z against `agent/forge-creator-s1` `e32202806` (plan head `6e81f42ee`, #498 head
`7d6cf4eda`). Product track. Branch `agent/forge-ui-review`. Source inspection only: no build, no browser, no test
was run (the host carried the lane's gate). Every claim about what a page renders or how a pad behaves is a reading
of the source and needs a rendered check before anyone acts on it; those rows say so.

The owner's ask, verbatim: "review it's new sprint and coordinate the same review pass for each completed sprint.
Same as last time, but with an added focus on ensuring existing UI can express the new features in an intuitive way,
extending and improving the polish of the entire forge where possible (production quality ideally, open for future
extensibility)."

Under review: the [sprint programme](../plans/2026-10-24-forge-creator-wishlist.md) (FCW-01..29, S1..S7) and its
[assessment spec](2026-10-24-forge-creator-wishlist-assessment.md); the MCP work it stands on
([plan](../plans/2026-10-24-forge-agent-webrtc.md), [design](2026-10-24-forge-agent-webrtc-design.md),
[compatibility](2026-10-24-forge-agent-compatibility.md)); the Forge sources under
`socomlegacy/packages/viewer/src/forge/` and `socomlegacy/packages/viewer/src/agent/`; the design system
(`shared/ds/README.md`, `shared/ds/chrome.md`). Paths below are relative to `socomlegacy/` unless they start `shared/`.
"plan:" is the wishlist plan; "page.ts" is `packages/viewer/src/forge/page.ts`.

Eight plan readers (one per sprint and one architecture reader) and five UI lenses (information architecture,
controller and pad, visual polish, agent integration, UI extensibility) produced the input. A skeptic re-read every
UI finding at the source; only confirmed findings are listed as findings. Duplicates across readers are merged and
cross-referenced.

## 1. Summary

- **Plan verdict.** S1 passes with findings. S2, S3, S6 and S7 are not ready to dispatch. S4 and S5 pass with
  findings but each has a blocking fix. The direction (one pack framework, engine-owned handlers, typed contracts)
  is sound. The gaps repeat across sprints: no task owns the Forge UI; no task owns the saved-format change (record
  v3: stable IDs, pack refs, mode field); diagnostics would take four shapes; the pad cannot reach what the plan
  adds; lobbies are not refused precisely while pack or mode content is in a layout; owner rows are not stated per
  task.
- **UI verdict.** 59 UI findings confirmed, 2 unverifiable by source inspection, 0 refuted. One blocking: a pad
  cannot leave the Saves card (page.ts:3084-3146, :3376). The Forge has no panel, menu, tool, inspector or
  diagnostics contract, so FCW-08, FCW-23 and FCW-29 would each hand-edit the 4,012-line `mountForge` closure.
- **Workstream.** Section 4 proposes FUI-1..21: eight infrastructure tasks (shell, cards and pad focus, menu
  sections, status model, diagnostics viewer, operation registry and history, UI kit and tokens, on-screen keyboard)
  that precede FCW-08/23/29; five S1 polish tasks; eight per-sprint UI tasks derived from the readers' uiNeeds.
- **Owed.** A rendered pass (section 5c) over every finding marked "rendered check", and the owner's word on the
  FUI tasks and the calls in section 6.

## 2. The sprint plan review

Severity: blocking (do not dispatch until fixed), major (fix before the task closes), minor. Kind: scope, standards,
evidence, dependency, extensibility, ui-expressiveness.

### 2.1 FCW-S1 -- reliable creator loop (FCW-01..04)

**Verdict: PASS WITH FINDINGS; revise before dispatching FCW-03 and FCW-04.** Give FCW-04's catalogue stable asset
IDs, extend `forge.catalogue` and `validate.ts` instead of building them again, freeze the asset and example formats
in `creator-contracts`, split FCW-03, name a fresh reviewer for the FCW-01 fixes, and give every task a
creator-facing pointer and pad surface.

| Task | Sev. | Kind | Claim | Citation | Recommendation |
|---|---|---|---|---|---|
| FCW-01 | major | standards | The seat that reviewed #498 also writes the FCW-01 fixes; no fresh reviewer is named for them. | plan:43-46 (FCW.R7), :117, :122-127; AGENTS.md "How to work" 8 | Name the fresh reviewer for the fix commits; record its verdict on the final #498 head in the Log before 02/03/04 depend on its API. |
| FCW-01 | minor | scope | A process step, not a player-visible behaviour; #498's gates were RED and the finding count is unknown, so M is a guess. | AGENTS.md "Two tracks"; assessment:50-53; plan:122-127 | Reword as a creator behaviour on the reviewed head; add a split rule (more than N findings or a new RED family means re-estimate, FCW.R1). |
| FCW-02 | major | ui-expressiveness | The consent prompt and Disconnect sit in a collapsed `<details>`; docks hide in Walk, Play and docks-off; the match overlay covers the page during agent-started Play. The approve, denial and disconnect cases can happen with no visible prompt. | agent/install.ts:197-198; agent/panel.ts:97; forge.css:139, :467; page.ts:2286, :3691-3703 | RED list: approval while collapsed, while docks hidden, during agent Play or Walk. Presence chip in the status bar; auto-open on approval (FUI-11). Rendered check required. |
| FCW-02 | major | dependency | Overlaps MC-12 (four-stage stepper, controller focus and Disconnect usable) and MC-8 (clean-profile matrix) without taking their acceptance. | forge-agent-webrtc.md:216-223, :236-240; agent/panel.ts:31-35, :48-50; plan:130-134 | State that FCW-02 closes MC-12 and MC-8 or that it leaves them open; never close them implicitly. |
| FCW-02 | minor | dependency | Owner rows under-stated: H283 (measured topology), H284 (TURN budget), H285 (test-room helper limit), H286 (loopback only). | plan:130, :134; HUMAN_TASKS.md:634-637; agent/install.ts:200; agent/testroomInstall.ts:16 | Needs line names all four; TURN and separate-network rows stay "blocked: H284". |
| FCW-02 | minor | ui-expressiveness | File staging accepts .json/.zip/.glb/.png on every page and says "ready" although the Forge allows only `map`. | agent/panel.ts:76-77, :139-142; agent/install.ts:200 | Pass accepted kinds into the panel; per-file "not usable here" line; add the case to FCW-02 RED. |
| FCW-02 | minor | scope | Nine RED cases, two clients, a new e2e spec and a network matrix exceed M. | plan:129-134; e2e/ (no forgeAgentOnboarding.spec.ts) | Make the network matrix a follow-up row on H284; FCW-02 closes on single-host and LAN runs. |
| FCW-03 | major | scope | Six authored experiences plus the uncompleted Crossroads route is L at least, and it depends on FCW-04. | plan:136-141; compatibility:114; plan:21-24 | Split: 03a format, chooser UI and five fixtures; 03b the Crossroads route as rendered evidence. Re-total S1 at 15. |
| FCW-03 | major | evidence | The route must run "without Play teleport" under a 32-step/60 s/30 s scenario budget; method and evidence kind unstated. | plan:30-31, :141; forge/agent/api.ts:126-128 | State chained scenarios with `scenario.status` observations at each hand-off; name the evidence kind as a rendered run. |
| FCW-03 | major | evidence | Acceptance drops the spec's closing conditions (C5 damage readback, C7 Build/Play guard, C1 named Stranglehold base). | assessment:61, :65, :67; plan:140 | Copy the spec's conditions into GREEN. |
| FCW-03 | major | extensibility | Examples become a third format beside LayoutRecord and FCW-05's PackManifest. | forge/record.ts:53, :212-215; plan:66-69, :138-139; FCW.R2 :25-27 | Each example is a LayoutRecord plus a data-only manifest `{id, version, title, base, requires, covers, blockedReason?}` in `creator-contracts`; FCW-05 adopts it as a recipe pack kind. |
| FCW-03 | minor | evidence | Disc-backed asset checks cannot pass without SOCOM_DISC; tiers not separated. | plan:138-141, :61-62; AGENTS.md "How to work" 3 | Two tiers: synthetic unit tests always run; dev-disc tier reports SKIP; the Log quotes both. |
| FCW-04 | major | extensibility | "Revision-bound IDs" would break recipes; asset identities are already stable `archive:model`. | plan:146, :327; forge/layout.ts:218-222; forge/agent/api.ts:4 | Return stable assetIds plus a revision-bound cursor; RED: a recipe saved at revision N resolves at N+k. |
| FCW-04 | major | extensibility | Builds twice: `forge.catalogue` pages already exist; `checkMap` already reports float/buried/overlap; `catalog.ts` already exists beside the proposed `catalogue.ts`. | agent/forgeTarget.ts:17-29, :79-98; forge/validate.ts:50-52, :232-234; forge/catalog.ts:11-26; forge/library.ts:60-67 | New `forge.catalogue` section `assets` reusing `page()`; `checkPlacement` in or on `validate.ts` extending `MapIssueKind`; a non-colliding module name. |
| FCW-04 | major | extensibility | The asset result is what FCW-07 AssetDefinition and FCW-09 need; not frozen in `creator-contracts`. | plan:15, :70-73, :178-183, :146 | Freeze `CreatorAssetSummary {assetId, source, bounds, collision, roles, version}` now, no DOM or Node imports. |
| FCW-04 | major | standards | The hot-file claim names no file; FCW-01 edits the same agent facade and `api.ts` from another seat. | HANDOFF.md:239-241; COLLABORATION.md:69-71; plan:145, :119; page.ts:3501-3720; forge/agent/api.ts:63-130; forge-agent-protocol/src/index.ts:52-121 | One claim line per file (page.ts facade hunk, api.ts, forgeTarget.ts, protocol index.ts); order FCW-04's edits after FCW-01's fixes. |
| FCW-04 | minor | standards | Clearance and traversable-stack thresholds are adaptations; reuse of walk constants not required. | forge/validate.ts:18-38; mover.ts:157 | Use BODY_RADIUS and REACH_*; every new threshold an exported `*_ADAPTATION` constant with a pin test. |
| FCW-04 | minor | scope | A cross-archive query implies decoding every archive; loads unbounded. | page.ts:1434-1441; plan:146-147 | Scope "loaded archives" by default; report unloaded archives as "not searched"; RED case. |
| S1 (all) | major | ui-expressiveness | No S1 task delivers a surface a creator can use; FCW-03/04 Files name no Forge UI file; FCW-04 accepts "through MCP" only. | assessment:112; plan:138, :145, :148; page.ts:3226-3265 | One UI acceptance line each (FUI-14, FUI-15); Forge UI files in Files with claims; a pad-menu route per capability (OT.R52). |
| S1 (all) | major | ui-expressiveness | Existing pad gaps S1 inherits: no Check row in the pad menu; Check modal Jump unreachable; the Saves card is a pad dead end. | page.ts:3226-3265, :2534-2540, :3376, :3084-3146, :2074 | FUI-2 and FUI-3 before FCW-03's chooser lands in the Saves card. Rendered pad check. |
| S1 (all) | minor | ui-expressiveness | The agent dock is a third visual vocabulary beside fx-* and s2u-*. | agent/panel.css:2-8; shared/ds/README.md:165-192, :370-400 | FUI-7 maps the tokens; S1 surfaces use s2u-chip and s2u-slot. |

### 2.2 FCW-S2 -- extension foundation (FCW-05..08)

**Verdict: NOT READY.** S2 would build the registry and diagnostics twice beside #498's `LocalPackApi` and `MapIssue`.
FCW-07 slips an unclaimed `room.ts` seam under the product track and is larger than L. No task owns the layout-to-pack
reference or a lobby policy for applied packs. FCW-08 has no controller-reachable surface and its MCP operations have
no permissions or versions.

| Task | Sev. | Kind | Claim | Citation | Recommendation |
|---|---|---|---|---|---|
| FCW-06 | blocking | extensibility | #498 already ships a device-local pack manager (stage/list/import/remove, states, CAS removal, progress). FCW-06's new PackRegistry never says what happens to `LocalPackApi`. | agent/localPacks.ts:22-60, :106-137, :291-360; plan:72-73, :157-162, :26-28; assessment:41 | Name `LocalPackApi` as the starting point; PackRegistry takes over its adapters; `agent/localPacks.ts` becomes a facade. RED: old summaries for `map:`/`mod:`/`model:current`/`texture:` ids still resolve. |
| FCW-05 | blocking | extensibility | Three diagnostic shapes (MapIssue, LocalPackDiagnostic, PackDiagnostic) and FCW-05 unifies none; XT-3's claim that `checkMap` already has that shape is wrong. | forge/validate.ts:50-65; agent/localPacks.ts:23; extensibility plan:102; plan:68-71, :195-197 | One versioned CheckReport/Diagnostic with severity, namespaced code and a locator; adapters from MapIssue and LocalPackDiagnostic; notes become `skipped`; correct XT-3. (FUI-5.) |
| FCW-07 | blocking | standards | The rules fixture hooks into the vanilla match Room that Forge Play runs; `room.ts` is hot and the simulation; Files name no seam or claim; pack-off identity is treated as an ordinary check. | net/loopback.ts:1, :18; COLLABORATION.md:46-54; plan:119, :164-169; AGENTS.md "Two tracks" | List the seams with claims; build on `gameRules.ts`/`forgeGame.ts`; fresh task review for the `room.ts` seam; close on a pack-off byte-identical replay. |
| FCW-07 | major | scope | One L carries XT-2, XT-5/6/7 proofs, part of XT-8, a viewer and a match runtime; drops XT-5/XT-7 evidence; overlaps FCW-25. | plan:164-169, :290-295, :22-25; extensibility plan:105-107 | Split 07a (contracts, host, viewer runtime, rendered captureScore restore) and 07b (match rules runtime, room seam, replay identity). One home for system handlers. |
| FCW-07 | major | extensibility | No S2 task owns the record field that declares a layout's required packs; record v2 refuses unknown fields and the asset grammar allows only disc stems. | forge/record.ts:41, :53-74, :76-78, :83; plan:74-77, :178-183 | Freeze record v3 `requires: PackRef[]` and a pack-asset id form with the v2->v3 reader and a refusal reason; model on `missingArchives` (page.ts:2956-2957). |
| FCW-07 | major | extensibility | ExtensionHost has no contract version, capability catalogue, state model or subscription. | plan:68-76, :151-152; agent/localPacks.ts:33-36, :61 | `capabilities()`, per-ref `status()` state, `subscribe()`; `validatePack` takes the handler catalogue from the host. |
| FCW-08 | major | ui-expressiveness | No human surface for packs; the Forge allows only `map`; the right dock and START menu are closure-local with no seam; Files omit page.ts, padMenu.ts, install.ts. | agent/install.ts:51-63; agent/panel.ts:76-84; page.ts:351-358, :483, :3226-3262; forge/padMenu.ts:9-25; pageEntry.ts:107-114; MISSION.md:267; plan:171-176 | Mount Packs through the shell (FUI-1); a START entry and pad card (FUI-16); page.ts and padMenu.ts in Files with a claim; a pad case in `creatorPacks.spec.ts`. |
| FCW-08 | major | standards | No task says what an enabled pack does when the creator opens or joins a lobby (H273). | page.ts:897, :2956-2957; main.ts:1620-1623; HUMAN_TASKS.md:616; plan:349 | Per-surface activation policy: loopback may enable packs; Create lobby and join refuse while a non-cosmetic pack is applied, through the check modal. |
| FCW-08 | major | extensibility | `packs.import apply:true` contradicts "importing never auto-enables"; new ops have no permission, surface or version; the consent label understates. | forge-agent-protocol/src/index.ts:18-24, :174-191, :193-202; compatibility:66-69; agent/panel.ts:27-29; plan:158, :172-174 | validate/diagnostics are `diagnose`; enable/disable are `import`, Build-only; retire or define `apply:true`; relabel consent; add every op to the guard matrix. |
| FCW-05 | major | evidence | "Deterministic canonical hashes" rests on `localeCompare` ordering; Node cannot show browser identity. | agent/localPacks.ts:78-83, :221, :225; plan:150-155 | Byte ordering, NFC, exact serialisation; golden vectors in `creator-contracts` tests; the same vector asserted in the rendered spec. |
| FCW-06 | major | ui-expressiveness | Legacy stores do not fit install/list/remove: the model store is exclusive, textures per map, mods ordered behind a master switch; the test room keeps its own mods panel. | agent/localPacks.ts:143-152, :245; mods/panel.ts:95-140, :182, :207; main.ts:1624; plan:157-162 | Per-kind slot rule reported by `list()`; the test room mods panel becomes a view over the registry (FUI-16); `mods.spec.ts` stays green. |
| FCW-05/06 | major | standards | A validator library and a storage registry have no visible outcome until FCW-08; FCW.R7's "minimum shared S2 work" leaves contract ownership ambiguous. | AGENTS.md "Two tracks"; plan:43-46, :150-162 | Visible closes (a "Check pack" verdict; migrated packs listed), or fold into FCW-08; Log which FCW-05 types S1 froze. |
| FCW-05..08 | major | dependency | Owner rows not stated per task (H272, H273, H275, H276, H285, H286). | plan:150, :157, :164, :171, :345-356; HUMAN_TASKS.md:615-619, :636-637 | An "Owner rows" line on each task with the default followed. |
| FCW-08 | major | scope | A panel in two surfaces, three pack kinds, four guarded ops, gateway metadata, unit and e2e is L, not M. | plan:22-25, :93, :171-176; agent/install.ts:56 | Re-estimate as L or split 08a (ops) and 08b (panel with pad path, rendered). |
| FCW-06 | minor | evidence | Two-tab and quota cases can run on fake-indexeddb; the plan does not say so; the busy flag is per instance. | package.json:31-41; agent/localPacks.ts:115-117, :137; plan:159-162 | Unit tests with two instances and a cross-instance lock; label any Playwright two-tab check as rendered evidence. |
| FCW-05 | minor | standards | New undated spec and a schema path that contradicts XT-1; the new package must join the typecheck list. | plan:152; extensibility plan:100-102; package.json:15 | Write XT-1's planned spec as FCW-05's; amend XT-1's path in the XT Log; name the typecheck wiring. |

### 2.3 FCW-S3 -- authored worlds and actors (FCW-09..12)

**Verdict: NOT READY.** The points add up (24, 3 L), but: no task owns the saved-format change; the collision path
would be built twice; lobbies with pack content are not refused precisely (H273/H274); FCW-12's reuse of MatchBots
skips H314 and the cost of navigation on composed maps; no task names the Forge UI it uses.

| Task | Sev. | Kind | Claim | Citation | Recommendation |
|---|---|---|---|---|---|
| FCW-09/10/12 | blocking | extensibility | Layout v1 and record v2 are closed: base only `map`/`blank`, asset ids only `ARCHIVE:model`, NPC markers without IDs; `checkRecord` is also central's PUT check. Three tasks would extend it three ways; none lists layout.ts, record.ts, share.ts or central's validation. | forge/layout.ts:12, :14-18, :198-206, :283-288; forge/record.ts:14-15, :32, :41, :74, :77, :80, :212-221; plan:180, :187, :201 | FCW-09 owns one record v3 (namespaced refs, base kind `content`, stable IDs on every entity, per-entity extension block) with v1/v2 adapters and round-trip tests; central refuses pack refs for now under H274. |
| FCW-09 | major | extensibility | A new `match/src/creator/collision.ts` sits beside a path that already composes collision once for page and server. | forge/ground.ts:91-130; forge/matchMap.ts:112; match/forgeSimMap.ts:17-40, :272-292; forge/match.ts:164-165; plan:180, :183 | A polygon provider returning the same WorldPoly[]/PieceHull; GREEN as hull equality page vs server plus a mover probe. |
| FCW-09/10 | major | scope | Lobbies with pack content are not refused; the server skips unknown pieces with a log count; `parseAssetId` would read a pack prefix as an archive. | page.ts:2911-2930, :2956; forge/lobbyClient.ts:578; forge/layout.ts:217-221; match/forgeSimMap.ts:286; match/forgeProcess.ts:248; plan:179, :186 | RED: a layout with any pack ref cannot create a lobby; refusal names pack, version, H273/H274 in the lobby button title, a check-modal row and the pad lobby rows; `checkRecord` refuses. |
| FCW-12 | major | dependency | MatchBots reuse is far larger than one L: RoomBots imports node:fs, needs a prepared navigation graph for a disc map whose stem matches; a Forge layout changes the hull; H314 limits bots to Frostfire. | match/bots/matchBots.ts:14, :24; match/roomBots.ts:1-7, :16-30; match/bots/buildNavigation.ts:10-13, :55-56; HUMAN_TASKS.md:713; forge/npcs.ts:19-36; net/loopback.ts:217; plan:200, :204 | Add H314 to Needs; split 12a (bots on the in-page Room with a composed-layout graph under a named budget) and 12b (ActorSpec, profiles, authoring UI); coordinate with BOTS-LAND. |
| FCW-09..12 | major | ui-expressiveness | None names the Forge surface; FCW-11 ships a module and a CLI only. | page.ts:246-334, :351-470, :1145-1173, :1202, :1402-1430, :2527-2580, :3226-3265, :3976-3984; plan:119, :180, :187, :194, :201 | Register through the shell (FUI-1) and FUI-17; list UI files and the rendered spec per task. |
| FCW-11 | major | extensibility | A third check model, duplicated in viewer and match, with a closed capability list that FCW-12/16/21 must edit. | forge/validate.ts:10-16, :50-69, :232; extensibility plan:102; plan:194-197, :200 | One pure readiness module imported by the server; an open ExperienceRequirement registry; MapIssue mapped once (FUI-5). |
| FCW-10 | major | ui-expressiveness | No surface for opening an authored map; base picker lists disc archives only; abort/partial load has no visible state. | forge/layout.ts:14-18; page.ts:256-257, :304-311, :496-500, :603, :3237, :3976-3984; COLLABORATION.md:55; plan:187-190 | `LayoutBase {kind:'content', ref}` under a "Your maps" optgroup; loading overlay stages with Cancel; failures as diagnostics; claim loadMap.ts/simMap.ts. |
| FCW-09 | major | extensibility | Overlaps XT-5 and XT-13 at different paths; bundles the Blender importer and the ZDB route. | extensibility plan:104, :112; plan:26-28, :180, :183 | Use XT's paths or Log the move; leave ZDB to XT-13. |
| FCW-09 | minor | scope | Scale and tilt are in scope but placements are yaw-only end to end. | forge/record.ts:26-28, :109; page.ts:1197; plan:181-182 | Bake units and axis into AssetDefinition; placement stays yaw-only; test that reload keeps the hull. |
| FCW-09/10/12 | minor | evidence | GREEN lines merge evidence kinds. | plan:183, :190, :204; net/loopback.ts:217; forge/validate.ts:10-16 | One line per kind: unit, rendered e2e, physical; name the gate records. |
| FCW-09..12 | minor | standards | The MCP operations S3 changes are in no Files block. | forge/agent/api.ts:72, :77, :92, :108, :114; plan:30-32 | List them per task with guard RED, or defer to FCW-23 in writing. |
| FCW-12 | minor | extensibility | ActorSpec stable IDs have nothing to bind to; routes break on delete or reorder. | forge/layout.ts:198-206; forge/record.ts:14-15, :120-124; match/forgeSimMap.ts:291; plan:202, :327 | IDs from the record v3 change; RED: delete a predecessor waypoint, reload, the route survives. |
| FCW-11 | minor | ui-expressiveness | The pad cannot reach Check; the brief's "keyboard dev-only" premise is outdated (OT.R68 gives the Forge editor keyboard and mouse in every build). | page.ts:296, :3226-3265; MISSION.md:470-474 | "Check the map" pad row with experience cycling (FUI-5); UI serves pad and pointer equally. |
| FCW-10/12 | minor | standards | Hot files unnamed for a claim (loadMap.ts, simMap.ts, room.ts, npcs.ts beside BOTS-LAND). | COLLABORATION.md:53, :55, :69; plan:119, :187, :201 | Per-task claim lines. |

### 2.4 FCW-S4 -- custom modes (FCW-13..16)

**Verdict: PASS WITH FINDINGS, two blocking.** FCW-13 must freeze one versioned, schema-validated `mode` field in the
layout and record with a generic ModeSpec-driven UI, and custom-mode layouts must be refused for lobbies until S5.
FCW-15 needs a split and OT.R70 reconciled; FCW-14 an authoring surface and ActorSpec reuse; FCW-16 a sides model.

| Task | Sev. | Kind | Claim | Citation | Recommendation |
|---|---|---|---|---|---|
| FCW-13..16 | blocking | extensibility | No task fixes where a layout records its mode; record and settings refuse unknown fields while `objectives` silently keeps unknown keys. | forge/record.ts:80, :214, :20-22; forge/layout.ts:117-120, :331-353; plan:208-209, :215-216, :222-223, :229-230 | FCW-13 freezes one additive optional `mode: {id, version, params}` across Layout, LayoutRecord, `checkRecord` and `parseLayout`, validated against the ModeSpec registry (FG-51 precedent). |
| FCW-13..16 | blocking | standards | Between S4 and FCW-18 a mode layout reaches a lobby and plays vanilla silently (H273/H274). | central/forgeLobby.ts:597; match/forgeSimMap.ts:15, :328; page.ts:296-297; HUMAN_TASKS.md:616-617; plan:349-350 | RED in FCW-13: Create lobby and central's create route refuse a layout that names a mode; the pad lobby rows show the reason. |
| FCW-13..16 | major | standards | The authoritative outcomes need a room rule seam; no S4 Files name room.ts, page.ts, match.ts, loopback.ts or commands.ts. | HANDOFF.md:269-354, :272; forge/agent/commands.ts:8-10; plan:59-62, :208, :215, :222, :229 | One S4 "mode host in Forge Play" slice owned by FCW-13; claims filed before the edit. |
| FCW-13..16 | major | standards | MCP can write unknown keys through `objectives.set`; 14/15/16 name no operations. | forge/agent/commands.ts:101-109; forge/layout.ts:331-353; plan:30-32, :209 | Guarded `mode.set`/`mode.state` and `event.*`; `objectives.set` refuses unknown keys; short-round fixtures for the scenario budget. |
| FCW-15 | major | standards | "The local authoritative room owns outcomes" contradicts OT.R70 (zombies runs outside any match, refused in networked matches); the Phoenix credit and H272 are not carried. | MISSION.md:606-615; zombies/mode.ts:1-5, :40-42; e2e/zombiesArmory.spec.ts:10-17; HUMAN_TASKS.md:615; plan:220-225 | Name the surface; record the controller's reading of OT.R70 for private loopback; online co-op needs the owner's word; keep the credit header. |
| FCW-15 | major | scope | Four pieces of work in one L; the prototype depends on Walker, Scene and DOM HUD, so it is a port. | zombies/mode.ts:6-21; zombies/obstacle.ts:5-8; zombies/hud.ts:10-40; plan:12-13, :223 | 15a (M) package the existing mode under ExtensionHost unchanged; 15b (L) authoritative waves, economy, shop. |
| FCW-14 | major | scope | No authoring surface; declares its own actor schemas although FCW-12 exports ActorSpec; surface (Walk or Play) unstated. | plan:199-204, :213-218; match/hostageActors.ts; page.ts:294, :298-300 | Needs 07/12; extend ActorSpec with noncombat roles; name Walk; re-size to L or limit to a cue list. |
| FCW-16 | major | extensibility | Opponents and sides undefined: spawns are A/B only, NPCs stationary; loot passes through reading-level drops. | forge/layout.ts:29-36; forge/settings.ts:113-117; assessment:43; match/pickups.ts:8-12; match/worldDrops.ts:27-55; plan:227-232 | Settle the sides model; name the opponents (Needs +12 or human-only); loot calls the drop path unchanged with a pack-off scenario check; drop Needs 10 for retail bases. |
| FCW-13 | minor | dependency | Depends on 10 although C1's arena is on a retail base. | plan:207; assessment:61 | Needs 07 only (11 if readiness gating is wanted). |
| FCW-13..16 | minor | evidence | Checks mix evidence kinds; no pad-only path asked. | plan:210-211, :217-218, :224-225, :231-232, :333-337; MISSION.md:267 | Tag every check (unit, dev-disc, rendered, physical pad); one pad-only e2e per mode. |
| FCW-13..16 | minor | standards | Mode parameters are adaptations with no naming convention. | plan:211; zombies/mode.ts:2 | `*_ADAPTATION` constants in `creator-contracts/src/modes/*` with SETTINGS_BOUNDS-shaped bounds. |
| FCW-14 | minor | dependency | User music is a payload; the share link, saves and lobby record cannot carry it. | forge/record.ts:36-37; plan:24-26, :218 | Reference audio by local hash and label; "music missing: add your own"; cite FCW.R4, H275, H284. |

### 2.5 FCW-S5 -- friends and authority (FCW-17..19)

**Verdict: PASS WITH FINDINGS.** S5 is entirely H274-gated and blocks S6's co-op through FCW-19: split it into an
ungated recipe-mode half and a gated server-pack half. FCW-17/18 must name the server-split host path, one shared
requirements contract, one digest function and the Custom matches and join-refusal surfaces. FCW-19 must keep
today's refuse-everything agent block.

| Task | Sev. | Kind | Claim | Citation | Recommendation |
|---|---|---|---|---|---|
| FCW-17..19 | major | dependency | Under H274's default none of S5 can close; FCW-21 needs 19; the plan never says whether an engine-owned ModeSpec in the recipe is "recipe" or "community content". | plan:96, :235, :239, :242, :245, :249, :263, :110, :350; HUMAN_TASKS.md:617; central/forgeLobby.ts:31-34 | S5a ungated (recipe-carried modes on retail bases through the existing lobby path), S5b H274-gated; one owner question (section 6); point FCW-21 at S5a. |
| FCW-17 | major | extensibility | Files omit the host path: since the split a Forge room is built on central and in a host's forge process booted by layout digest. | match/forgeProcess.ts:16-27, :245; match/server.ts:1093; central/forgeLobby.ts:639; central/forgeLayout.ts:5-17; plan:236 | Name server.ts, forgeProcess.ts, pipe.ts, host supervisor/forgeLayout and central's place; a versioned requirements record beside the digest; a typed `pack:<code>` bootFailed reason. |
| FCW-17 | major | extensibility | No task owns the canonical gameplay digest; three sides would drift. | plan:239, :67-70, :78-79 | `gameplayDigest(def, packs)` in `creator-contracts`, called on every side, with a fixture constant. |
| FCW-17 | minor | extensibility | `resolveGameplayPack(ref)` is per ref; server install may duplicate FCW-06; the create refusal is a closed string union. | plan:237-238, :67-72; central/forgeLobby.ts:345 | `resolveGameplayPacks(requirements)` returning a CheckReport; a `pack` member on ForgeCreateRefusal. |
| FCW-18 | major | ui-expressiveness | Files omit the Custom matches list, the Forge join flow and the viewer's lobby summary; the summary is declared twice. | console/render/lobbies.ts:56-70; console/adapters/lobbies.ts:28-51; page.ts:2944-3003; forge/lobbyClient.ts:59, :578; central/forgeLobby.ts:317-335; plan:243 | One versioned `MatchRequirements` in contracts; `requirementsGap()` extends `missingArchives`; FUI-19. |
| FCW-18 | minor | standards | Where "refuses before spawn" runs is unstated; the setup text needs plain-text handling and a host editor. | match/forgeProcess.ts:27-33; extensibility plan:48-54, :140-142; plan:244-246 | Three gate layers (client registry, central `/seat`, authoritative server); bounded plain text rendered with textContent. |
| FCW-19 | major | standards | "Mutating/test calls remain refused" reads as allowing reads online; today every op is BLOCKED and the connection closes. | plan:251; forge/agent/api.ts:205, :212; page.ts:3520; agent/connection.ts:734-737, :794-796; agent/forgeTarget.ts:59, :182; HUMAN_TASKS.md:637 | Reword: every operation refused and the connection closed on entry; no relaxation before H286. |
| FCW-19 | minor | dependency | Cites H286 only; also H273, H274 and H285. | plan:249, :253; HUMAN_TASKS.md:636 | Needs line names them; harness input through the existing test-only path. |
| FCW-19 | minor | standards | Forge rooms are uncounted; "stable IDs for results" could leak into stats or the ladder. | central/forgeLobby.ts:26-29; match/forgeProcess.ts:34; plan:251 | Results room-local, never handed over (FG.R20); RED: no stats/ladder/replay record. |
| FCW-19 | minor | standards | Mode sync in shared `room.ts`/`net/protocol.ts` must leave the retail event set unchanged when no mode is active. | plan:250-251; AGENTS.md "Two tracks" | RED: pinned welcome/snapshot shapes with no mode active. |
| FCW-19 | minor | evidence | Only a Playwright spec listed for deterministic room behaviour; host departure semantics (FG-48c) not cited. | plan:250, :252; central/forgeLobby.ts:41-49 | `match/test/creator/multiplayer.test.ts` for every RED; e2e for the GREEN only. |
| FCW-18/19 | minor | evidence | Two-client specs need a real central plus host; the repository's harness is not named. | e2e/forgeJoinerAutosave.spec.ts:14-34; playwright.split.config.ts:4-9; plan:243, :250 | Name `tools/local-stack.ts --split`; ports from 5303; serial under the host lock; no data means skipped. |
| FCW-17..19 | minor | standards | Hot seams unclaimed (page.ts, forgeLobby.ts, server.ts, room.ts, pipe.ts, forgeProcess.ts, protocol.ts). | plan:119, :236, :243, :250; HANDOFF.md:249-251 | Claim lines per task. |
| FCW-17/18 | minor | ui-expressiveness | No wording rule for requirement UI; "verified" would break FCW.R4/XT.R6. | plan:33-36; extensibility plan:52-54 | Fix the words: Modded, Needs X vN, Compatible, Not compatible; never verified, secure, anti-cheat; pin in a label test. |
| FCW-17/18 | minor | extensibility | A third diagnostic shape; XT-9 cites a stale page.ts line (:2747, now :2956). | forge/validate.ts:50-61; page.ts:2581-2590, :2917, :2956; extensibility plan:108 | S5 emits CheckReport only; one adapter to the check modal; refresh XT-9. |
| FCW-19 | minor | scope | M holds only if S4's modes already ride the room's protocol in loopback with late-join snapshots. | forge/match.ts:1-8; plan:216, :223, :248 | State the precondition or re-estimate. |

### 2.6 FCW-S6 -- missions and campaigns (FCW-20..23)

**Verdict: NOT READY.** FCW-21 is blocked by the Forge lobby's both-sides launch rule and duplicates
ExtractionAuthority unless it only subscribes to it. FCW-21 and FCW-23 are undersized and omit the authoring surfaces;
re-sizing both breaks FCW.R1's three-L limit, so FCW-23 must split. The contracts need versioned data-only
MissionSpec/CampaignSpec on FCW-07's IDs, one undo stack, one diagnostics shape and the H273/H274/H286 gates stated.

| Task | Sev. | Kind | Claim | Citation | Recommendation |
|---|---|---|---|---|---|
| FCW-21 | blocking | scope | The co-op GREEN cannot launch: the imported pre-match refuses unless both sides are seated; gameLobby.ts is the online lane's. | match/gameLobby.ts:413, :494-495; forge plan 2026-10-12:199-200, :205; plan:264 | Seats requirement in MissionSpec enforced in the Forge room's own launch wrapper; test that the game's lobbies keep the rule; claim or route through the controller. |
| FCW-21 | major | standards | The adapter names only hostageFollow.ts; rescue, death and leader credit live in extraction.ts and hostageOrders as readings. | match/extraction.ts:50-224, :154; match/hostageOrders.ts; plan:28, :264-265 | escort.ts subscribes read-only to existing events; any edit to those files is simulation track with its own review. |
| FCW-21 | major | ui-expressiveness | No Forge surface authors a hostage, a zone or the escort goal; escortees are a pass-through key; the tool set is a fixed record mirrored in `tool.set`. | page.ts:645-646, :858-862, :269-278; forge/objectives.ts:75-79; forge/layout.ts:75-76; forge/agent/api.ts:108; plan:264 | Hostage and Zone as ActorSpec roles plus a region through one tool registry (FUI-20); re-size. |
| FCW-21 | major | dependency | Owner gates inherited but unstated (H274, H273, H286). | plan:242, :263; HUMAN_TASKS.md:617, :637 | Needs line; say what may close meanwhile. |
| FCW-20 | major | extensibility | MissionSpec zones, points and triggers overlap XT-2 and FCW-07's declarative events. | extensibility plan:101; plan:74-77, :167, :258 | Data-only, versioned; references ContentMapDefinition regions and FCW-07's action allowlist by name. |
| FCW-20 | major | extensibility | Persistent actor IDs do not exist; no task owns record v3. | forge/record.ts:49-51; forge/objectives.ts:21-24; forge/agent/api.ts:4; plan:166, :327 | Name the owner (FCW-07 or FCW-09, see 2.3); RED: a renumbering delete keeps goal references. |
| FCW-20 | major | ui-expressiveness | Closes headless only; nothing shows goals or outcome. | AGENTS.md "Two tracks"; plan:257, :260 | A labelled goal readout in Play plus diagnostics in the Check modal (FUI-20), or state it is closed by FCW-23. |
| FCW-20 | minor | extensibility | Forge Play runs the room in-page, so a viewer runtime is a second one. | forge/match.ts:26-32, :168; plan:257 | MissionRuntime only in match/; the viewer reads `snapshot()`. |
| FCW-20 | minor | standards | "Trigger storm" has no bound. | plan:31-32, :259; forge/saves.ts:19 | Named `MISSION_*_ADAPTATION` bounds. |
| FCW-22 | major | extensibility | CampaignStore mixes authored content with progress; the saves store pattern is not reused. | plan:72, :81, :272, :281; forge/saves.ts:38, :84-150 | CampaignSpec stays in PackRegistry; a CampaignProgressStore on saves.ts's Store with set-aside semantics. |
| FCW-22 | major | scope | Device-local progress with two-person missions: which device commits is undefined. | plan:37, :251, :266-267, :272 | Each participant commits idempotently from FCW-19's result ID; define the joiner's view. |
| FCW-22 | major | ui-expressiveness | No surface to start, resume, restart, export or import a campaign. | plan:271, :274 | A Campaigns card (FUI-20) or state that FCW-23 closes it. |
| FCW-22 | minor | evidence | Tier unstated; the share link (12,000 chars) cannot carry a campaign; saves cap at 40. | forge/share.ts:11; forge/saves.ts:22; plan:273-274 | Unit tier with a Store fake and quota failure; export as file or pack only. |
| FCW-23 | major | scope | M for a mission editor, a campaign graph editor and MCP ops; page.ts and api.ts unclaimed; re-sizing breaks the three-L limit. | plan:22-25, :97, :278; forge/agent/api.ts:63-134, :75; HANDOFF.md:272 | Split 23a (mission editor plus hostage/zone authoring, L, S6) and 23b (campaign graph and MCP ops). |
| FCW-23 | major | extensibility | "Atomic undo" unspecified; History holds layout text only. | forge/history.ts:1-26; forge/layout.ts:72-78; plan:279 | Embed the mission in the Layout; the campaign card gets its own History (FUI-6 domains). |
| FCW-23 | major | dependency | The agent cannot play a two-person mission inside H286 and the scenario budget. | HUMAN_TASKS.md:637; forge/agent/api.ts:117-131; plan:31-32, :281 | Split the GREEN: the agent creates, repairs, validates, exports; a human plays co-op. |
| FCW-23 | major | extensibility | "Same diagnostics as runtime" has no common shape. | forge/validate.ts:50-65; page.ts:2527-2575; forge/agent/api.ts:67; plan:68-69, :279 | FUI-5's diagnostic with a stable-ID target; Jump selects it. |
| FCW-23 | minor | evidence | GREEN merges e2e, agent and real-client evidence. | plan:281 | Agent half headless through the facade; UI half in e2e; real client separate. |
| FCW-23 | minor | dependency | Export goes through packs but 08 is not in Needs. | plan:171-176, :277, :281 | Add 08; reuse the packs panel. |
| FCW-23 | minor | ui-expressiveness | The outliner has an `objectives` kind but no Objectives filter. | page.ts:384 vs :1210-1212 | Filter options from one marker-kind registry (FUI-10). |

### 2.7 FCW-S7 -- ocean and unattended evidence (FCW-24..29)

**Verdict: NOT READY.** The ocean half (24-26) can proceed once the water-surface reading, an owner row for a native
WebGPU device, XT-7's capture-equal check and the world.ts claim are added. The jobs half (27-29) repeats the
owner-blocked PH-F1 (PH.R12/H277) and must be re-filed as its slice; FCW-29 is undersized.

| Task | Sev. | Kind | Claim | Citation | Recommendation |
|---|---|---|---|---|---|
| FCW-27/28/29 | blocking | dependency | The job runner, reference batches and dashboard repeat PH-F1, which the owner confirmed as a separate follow-up (H277, PH.R12); never cited. | parity harness plan:462-464, :499; HUMAN_TASKS.md:624; plan:26-28, :304-323 | Re-file as PH-F1's delivery slice with its milestone as Needs; cross-link Trello frMZW66S. |
| FCW-27 | major | extensibility | A second job vocabulary beside ScenarioJob; JobSpec has no schema version. | forge-agent-webrtc.md:73, :91-92; plan:82-86 | One versioned JobState/JobSpec in contracts with an adapter or a stated subset/superset mapping. |
| FCW-28 | major | standards | CheckReport cannot carry evidence kind, reference provenance or `incomplete`. | plan:66-68, :313; AGENTS.md "The truth rule"; parity harness plan:446-452 | Freeze in FCW-05: `evidence`, `incomplete`, `reference`, `tolerance`; versioned. |
| FCW-25/26 | major | standards | No loaded metadata says which surfaces are water; water exists in the env-map pass and the collision water line, which drives wading, claymores and the launcher. | world.ts:755-762; traversal.ts:1098-1104; equipment.ts:637-642; effects.ts:134-143; plan:293, :300 | A derive-from-desktop water reading or a named placeholder; invariant: visual mean height equals `probeWater`; the simulation line never changes. |
| FCW-25 | major | standards | Edits hot world.ts without a claim; pack-off asks only "stable resource counts" where XT-7 asks a captureScore-equal restored frame. | COLLABORATION.md:54; plan:117-118, :292-295; extensibility plan:106 | Claims for world.ts (and effects.ts); XT-7's capture check in GREEN; the seam's pack-off path held by capture comparison. |
| FCW-25/26 | major | extensibility | The system registry is placed in three different trees; the renderer's `setExperimental` off-equals-original seam is not reused. | extensibility plan:106, :111; plan:166, :292, :299; renderer.ts:57-58, :244, :264-267; experimentalGraphics.ts:7-10, :324-337 | XT-7's path; ExtensionHost the only registry; model on `setExperimental`. |
| FCW-24/26/27/28 | major | dependency | Owner prerequisites not tied to rows: native GPU device, H277-H281, PH.R12. | plan:287, :311-313, :345-356; renderer.ts:128-131; HUMAN_TASKS.md:624-628 | Cite H277-H281 and PH.R12; one new row for a native WebGPU session (section 6). |
| FCW-25/26 | major | evidence | Headless e2e reaches WebGL2 via SwiftShader; device loss is new renderer API. | renderer.ts:35-58, :128-137, :163; plan:292-302 | Tier each check; device-loss handling as a ViewerRenderer change under the renderer claim. |
| FCW-29 | major | scope | A UI module, MCP ops needing a new Surface and Permission, runner endpoints and e2e is L; S7 would then hold four L. | plan:23, :98, :318-323; forge-agent-webrtc.md:81-82 | Split dashboard and job-ops; move 27-29 into PH-F1's sprint. |
| FCW-29 | major | standards | Job authorization is "separate from page pairing" but rides MCP's pairing; "Run tests" already means page-bounded jobs. | plan:320-321; agent/panel.ts:5-6, :27-30, :70-80; forge-agent-webrtc.md:81-82, :91-92 | A distinct `jobs` permission and `creator-jobs` surface with its own revocable consent; a matrix test both ways. |
| FCW-24..29 | major | ui-expressiveness | No task says where a creator sees, starts or undoes the ocean or a job; 25/26 do not depend on 08. | plan:173, :290-323; page.ts:351-358, :464, :3226-3266; forge/padMenu.ts:1-6 | Add 08 to 25/26 Needs; name the surfaces (FUI-21); a pad-reachability e2e. |
| FCW-24 | minor | dependency | Needs FCW-11 (and so FCW-10) for a GPU probe. | plan:100-101, :192-197, :284 | Needs 07 only. |
| FCW-24/27/28 | minor | standards | Measurements and infrastructure are steps, not features. | AGENTS.md "Two tracks"; plan:283-316 | Fold 24 into 25; treat 27+28+29 as one feature with one demonstration. |
| FCW-26 | minor | extensibility | Whether the ocean is a lobby requirement is unstated. | HUMAN_TASKS.md:616; plan:299-302 | Client-only visual system, never a match requirement. |
| FCW-27/29 | minor | standards | Runner endpoints name no port, bind address or SETUP row; a runner is a heavy run under the host lock. | CLAUDE.md "Ports"; AGENTS.md "Layout" 5; plan:306-308, :320 | Loopback only, a port from 5303, a SETUP.md row, the lock read with `check`, one job at a time. |

### 2.8 Architecture (cross-sprint)

| Task | Sev. | Kind | Claim | Citation | Recommendation |
|---|---|---|---|---|---|
| PLAN (all) | blocking | ui-expressiveness | The plan has no UI workstream: no task names page.ts or forge.css; pad, controller, keyboard, touch, accessibility and the design system are never mentioned; the Review focus has no UI item. OT.R52 and OT.R68 bind. | plan:119, :173, :209, :216, :278-281, :320, :325-331; MISSION.md:267, :470 | Section 4's FUI tasks; a fixed UI acceptance line on every task that touches UI; a sixth Review focus item: "a feature the agent can drive but a person cannot see or drive". |
| FCW-08/23/29 | blocking | extensibility | page.ts cannot host new panels without hand-editing the closure: four hard-wired panels, a flat pad menu, a closed tool union, one modal slot, a string if-chain for agent ops, private helpers; the agent dock enters by `querySelector('.fx-right')`. | page.ts:232, :472, :3226-3264, :122, :265-274, :539, :549-595, :2527-2576, :3557-3723, :146-195; agent/install.ts:50-53 | FUI-1..3 before FCW-08; the four existing panels and the agent dock are the first registrants, pinned by the existing forge*.spec.ts. |
| FCW-08/23 | major | extensibility | History knows no actor or domain; the design's agent-labelled undo step is missing; pack and mission state cannot be undone. | design:54; page.ts:1042-1049, :3632-3643; forge/history.ts:6-60, :68-71, :77; plan:176, :279 | FUI-6: HistoryEntry with domain, actor, label, requestId and composite steps. |
| FCW-05/08/23/29 | major | standards | Five places must agree per agent operation (protocol OPERATIONS, FORGE_AGENT_OPERATIONS, the play allowlist, forgeTarget's switch, page.ts's if-chain); human UI bypasses them all. | forge-agent-protocol/src/index.ts:39-51, :174-192; forge/agent/api.ts:59-63, :216; agent/forgeTarget.ts:68-112, :158-167; forge/agent/commands.ts:8; page.ts:3557-3723 | FUI-6: one OperationRegistry; protocol list, discovery and the play allowlist derived from it; panels call the same `execute()` as actor `person`. |
| FCW-05/07/20/27 | major | standards | Most contracts have no version; ExtensionHost has no API version; record v2 refuses unknown fields and central validates with the same checker; no task owns v3. | plan:68-69, :74-77, :80-85; extensibility plan:100; forge/record.ts:41, :80, :213-215, :33; forge/layout.ts:12, :46-79 | A `{schema, version}` discriminator on every contract; `ENGINE_CONTRACT_VERSION`; record v3 as an explicit FCW-07 (or FCW-09) deliverable with the share-link budget (share.ts:11). |
| FCW-05/07/15/25 | major | dependency | FCW moves XT-1..12's files and drops XT-2's spec; the two plans disagree on every path. | extensibility plan:100-111; plan:27, :152, :166, :222, :292 | Amend the XT table in the same PR ("delivered by FCW-nn at <paths>"); add the XT-2 spec to FCW-07's Files; one home for system handlers. |
| FCW-05/11 | major | evidence | XT-3's claim about `checkMap`'s shape is wrong; CheckReport lacks severity and location, which the check UI's Jump depends on. | extensibility plan:102; forge/validate.ts:50-65; agent/localPacks.ts:23; plan:68-69; page.ts:2535-2543, :2570 | FUI-5. |
| FCW-06/08 | major | scope | A third pack UI beside the 454-line mod panel and the agent dock's staging; the Forge's Open is a fourth way in. | mods/panel.ts:1-30; main.ts:1624; agent/panel.ts:73-81; plan:28, :173; page.ts:259-264 | FUI-16: one PackList over PackRegistry mounted in the test room and the Forge. |
| FCW-07/11/12/13..16 | major | extensibility | The same logic placed in parallel viewer and match modules with no canonical side. | plan:166, :194, :201, :208, :222, :229; forge/record.ts:33 | Decision logic is one pure module imported by the viewer; a test asserts the shared import. |
| FCW-13/15/16/18 | major | ui-expressiveness | The UI cannot express custom modes; the XT "Modded" badge is planned nowhere; zombies starts on F6. | page.ts:439-441, :3254; plan:209, :244; extensibility plan:141-142; zombies/mode.ts:40 | FUI-18: a mode picker fed by enabled ModeSpecs with a Modded badge; every start/stop/reset a registered operation with a pad row. |
| FCW-09/12/14/20 | major | ui-expressiveness | The inspector is X/Y/Z/Yaw plus Lock and the tools a closed union of eight. | page.ts:363-385, :122, :265-274; plan:181, :202, :216, :258 | FUI-1 (schema-driven inspector sections) and FUI-10 (tool registry). |
| FCW-01/02 | major | ui-expressiveness | A person often cannot see that an agent is connected (see 2.1 FCW-02 and 3.4). | agent/install.ts:52-53; page.ts:3012, :3247; forge.css:384-387; design:53; forge-agent-webrtc.md:220-222; agent/panel.ts:7, :83-84 | FUI-11. |
| all panels | major | standards | One status line, a 1.8 s toast, no aria-live or dialog roles anywhere in forge/*.ts; agent colours hard-coded. | page.ts:482, :608-615; agent/panel.ts:48; agent/panel.css:21-23, :52-53 | FUI-4 and FUI-2. |
| FCW-06/07/27/29 | major | standards | No shared lifecycle vocabulary (five booleans, three state sets, nine panel states). | agent/localPacks.ts:24-27; plan:69, :75, :84, :160; agent/panel.ts:7 | Freeze PackLifecycle and the ExtensionHost status type with one label and token table. |
| FCW-23/29 | major | scope | No surface for the two largest UIs; a graph cannot fit a 290 px dock; the jobs dashboard needs a permission the protocol lacks. | forge.css:9, :387; plan:278-281, :320-321; forge-agent-protocol/src/index.ts:19-38 | A `workspace` slot in the shell (FUI-1); FCW-29 its own route (FUI-21). |
| FCW-03 | minor | ui-expressiveness | Starter examples have no place a person finds them. | page.ts:257; forge/savesPanel.ts:37; plan:138-141 | FUI-14. |
| FCW-04/09 | minor | ui-expressiveness | Collision and placement diagnostics planned for MCP only. | plan:145-148, :181; page.ts:331-348, :1402 | FUI-15. |
| new | minor | extensibility | Helpers and icons are private to the closure; copies exist in menuView.ts and agent/panel.ts; forge.css takes only gold from the system. | page.ts:146-195, :238-245, :352-358, :427-445; forge/menuView.ts:19; agent/panel.ts:39; forge.css:10-21 | FUI-7. |
| PLAN | minor | evidence | Line citations into page.ts go stale (XT-9 :2747 vs :2956). | extensibility plan:108 | Cite page.ts by symbol. |

## 3. The Forge UI audit

### 3.1 Principles (merged from the five lenses)

1. Pad is the floor (OT.R52, OT.R68): every panel, card and row is reachable, usable and closable by pad, pointer,
   touch and key; a feature that lacks one is not done. One scheme: d-pad or stick moves focus, Cross acts, Circle
   backs out and never acts, L1/R1 change section, Square and Triangle are the focused item's secondary and remove
   actions, START opens the Forge menu outside a match.
2. One focus ring (`.is-pad-focused`, the system's ring) from one shared walker; one legend from the binding map,
   never hand-written prose.
3. Every lasting state (save, Build/Walk/Play, lobby lock, agent, issues, packs, jobs) has one always-visible chip
   with a word, never colour alone; toasts carry passing events only; anything needing attention surfaces at page
   level whether or not the docks are open.
4. One dialog stack on the system's dialog: one owner, focus trapped and returned, the safe choice focused first on
   destructive or consent actions.
5. One command layer for people and agents: panels change the layout only through the revision-guarded operations,
   so undo, autosave, refusals and diagnostics are the same in the UI and over MCP; every change names its actor.
6. One diagnostics model (CheckReport) in one Issues surface, each row with Select, Jump or Fix; skipped or blocked
   is never green.
7. New features register panels, menu sections, tools, inspector sections, chips and diagnostics through shared
   contracts; `mountForge` shrinks and never grows.
8. Tokens only, one kit: every colour, size, radius, shadow, z-index and duration reads a `--s2u-*` token or a
   `--fx-*` alias of one; the same names everywhere (Build, Walk, Play; Map settings vs Editor settings); stable
   `data-forge-*` hooks so restyling never breaks the specs.

### 3.2 Confirmed findings

Severity: blocking, major, minor, polish. "Rendered" marks a finding whose source reading the skeptic confirmed but
whose on-screen effect still needs a rendered check (listed again in 3.4). Sprint: `infra` = FUI-1..8, `S1` = FUI-9..13
or the S1 per-sprint tasks.

#### Information architecture

| Id | Sev. | Claim | Citation | Impact | Proposal | Size | Sprint |
|---|---|---|---|---|---|---|---|
| IA-1 | major | One shared modal slot with no owner. The check card sets `fx-check-modal` (pointer-events none) on the slot; the toolbar stays clickable behind it; Saves or New then replace the card without clearing the class or `answering`; the new card cannot be clicked and `checking` stays true, so Play, Create lobby and Check return silently. New overwrites the check's resolver, so Esc does not recover. (Rendered: the click-through is inferred from pointer-events.) | page.ts:505, :2527-2528, :2546-2551, :2581-2589, :2658-2659, :3084-3085, :3145-3147, :551, :2074; forge.css:441-442 | A creator gets a card they cannot click and Play stops responding with no message. | FUI-2 card stack; the check list a non-modal sheet outside it; toolbar actions that open a card refused while one is open. | M | S1 |
| IA-2 | major | Neither a pad nor Esc can operate or close the Saves card: `openSaves` never sets `answering`; pad input on an open modal goes only through `answering`; `closeCard` calls `answering?.(false)`; START still offers Saves. | page.ts:3084-3147, :3376, :2074, :3262; forge/keys.ts:60; forge/savesPanel.ts:147-152 | A controller-only creator is stuck behind a card. | FUI-2: pad-walkable rows; Circle and Esc close; an e2e opens Saves from START and leaves with Circle. | M | S1 |
| IA-3 | major | Base Apply opens `emptyLayout` with no discard confirmation; New asks; `openLayout` resets history and autosave overwrites 300 ms later. | page.ts:3296-3310, :3030-3036, :1744, :1069-1071, :308-314 | A creator who tries another base loses all work; Undo cannot bring it back. | FUI-9: Apply through `confirmDiscard()`; keep the outgoing autosave aside; "Undo: back to <name>" in the toast. | S | S1 |
| IA-4 | major | Save state is never shown: no dirty tracking, New always says "Save first", the Saves card marks no current row and offers only Save as, the name field's tooltip says it is the download name. | page.ts:302-307, :3033, :3125-3135; forge/savesPanel.ts:41-43, :52-70, :147-152 | A first-time creator cannot tell whether work is kept or what New and Open drop. | FUI-9: `currentSave {id, hash}`; a save-state chip; Save (Ctrl+S, START row) that overwrites; highlight the current row; ask only when dirty. | M | S1 |
| IA-5 | major | Walk and Play blur: walking sets the Play button's red `is-on`; Play during a Walk does nothing (`startMatch` returns when `playing`); the status cell says PLAY while walking; the help says "Play to walk it". (Rendered.) | page.ts:2284-2288, :2591-2592, :2653-2656, :1304, :512, :514, :294, :742-743; forge.css:123 | Creators cannot tell walking from a match; the red Play looks like an exit but does nothing. | FUI-10: three named modes in one segmented control; Play during Walk ends the Walk; status BUILD/WALK/PLAY; rename `playing` to `walking`. | S | S1 |
| IA-6 | major | At 1440 px and below every `.fx-tool` label is hidden; Spawn A, Spawn B and Walk share one glyph, the three objective tools another, Saves and Save map a third; only colour differs. (Count corrected: 9 groups plus Play. Rendered.) | forge.css:374-376, :81-90; page.ts:260-262, :269-278, :294, :315-328 | On common laptops a colour-blind creator cannot tell the tools apart without hovering. | FUI-10: unique glyphs with letter badges; labels kept on Play, Walk, Check, Lobby, Saves; rarer tools in an overflow; room for FCW tools to register. | M | S1 |
| IA-7 | major | Persistent states have no lasting indicator: the lobby lock is a toast plus disabled inputs; 89 `say` calls overwrite one line; issues exist only when Check is pressed; agent state sits in a collapsed details. (The lobby button does relabel and light, but never says "edits locked" and its label hides at 1440 px.) | page.ts:896-903, :608-615, :2692-2700, :2904, :487-494; agent/install.ts:52-53; shared/ds/README.md:105-117 | A creator cannot see at a glance that the layout is locked, an agent is waiting, or the map has issues. | FUI-4: a status-chip strip (save, mode, lobby, agent, issues) on s2u-chip and s2u-lamp, with `registerStatusChip()`. | M | infra |
| IA-8 | major | The agent dock is prepended as a closed details above the Inspector; an approval can sit unseen; docks hide in Walk and Play; two titles; a rounded card inside a square panel; agent edits produce no forge-side message. | agent/install.ts:49-53; agent/panel.ts:42-47, :93-97, :110-113; agent/panel.css:8-9; forge.css:139, :191-195; page.ts:742 | Creators miss approvals and see changes appear with no sign who made them. | FUI-11: mount through the shell with a badge; auto-open and pulse on approval; one title; a receipt toast with Undo; flash touched rows. | M | infra |
| IA-9 | major | The docks and inspector cannot be extended: one hard-coded append each; the inspector is a fixed form; site range and elevation have no field; the plan names no place for packs, actors, modes, events, missions or jobs. | page.ts:348, :352-358, :359-375, :472, :1145-1176; forge/objectives.ts:23; plan:173, :201, :209, :216, :278, :320 | Each feature bolted on differently; creators find things in unpredictable places. | FUI-1. | L | infra |
| IA-10 | major | Objectives are split across the toolbar, Settings below Grid step, and " · cannot play yet" inside an option's text; nothing lists what is missing. | page.ts:275-277, :442-445, :471, :875-884, :1284-1286, :1145-1176 | A Demolition rehearsal (FCW-03) means guessing three tools and where the reason hides. | FUI-10: a "Mode & objectives" panel with the game type and a live checklist from `forgeTypeUnplayable`; FCW-13 modes appear in the same picker. | M | S1 |
| IA-11 | minor | Settings mixes editor preferences (under "Placement") with map settings under no heading; Snap is also in the toolbar; the START menu says "Map settings" but the dock does not; all four panels open by default. | page.ts:281, :352-354, :466-472, :3253 | Creators cannot tell which settings are saved with the layout. | FUI-10: grid, turn and snap into View under "Editor (this browser)"; "Map settings (saved with the layout)" with a disc reset; View collapsed by default. | S | S1 |
| IA-12 | minor | Feedback channels follow no rule: refusals in a 1.8 s non-interactive toast, errors in an 11 px ellipsis line, "Saved <file>" before the browser confirms, no history, no Undo action. (Rendered.) | page.ts:608-615, :901, :3054, :3066, :3155, :2641; forge.css:315-329, :368-369 | Refusals and errors disappear or are cut off. | FUI-4 `notify()`. | M | infra |
| IA-13 | minor | Dialogs lack role=dialog, aria-modal, a focus trap and focus return; the primary is focused first even on "Delete this save?"; Cross answers yes. | page.ts:505-506, :540-555, :3121, :3376; shared/ds/README.md:235-248 | One accidental Cross or Enter deletes a save; keyboard users lose their place. | FUI-2: s2u-dialog markup; Cancel focused first on destructive confirms; a danger style. | S | S1 |
| IA-14 | minor | The map check is modal, on demand, and an issue carries only a point (no placement ref), so Jump moves the camera but cannot select; rows not pad-reachable; no live count. (Citation corrected: CheckReport is plan:69 and :195.) | page.ts:2527-2578, :2658-2664; forge/validate.ts:50-66; plan:69, :195 | Creators hunt for each piece; later diagnostics arrive in a separate place. | FUI-5: `ref` on MapIssue; one Issues panel with Select, Jump, Fix; pad-walkable; a count chip. | M | S2 |
| IA-15 | minor | Hidden features: Delete hides a map prop (inspector text only); hidden rows carry a trash icon that shows the prop again; the NPC tool needs a character chosen under Characters, explained only by a hint. | page.ts:1162, :1289, :1249-1263, :274, :344-347, :1302-1303, :1343-1349 | First-time creators do not learn hide/restore; a trash icon that restores invites mistakes. | FUI-10: an explicit "Hide in this layout" button with eye icons; a "Hidden map props (n)" group with Show; the NPC tool opens Characters and picks the first. | S | S1 |

#### Controller and pad

| Id | Sev. | Claim | Citation | Impact | Proposal | Size | Sprint |
|---|---|---|---|---|---|---|---|
| PAD-1 | blocking | The Saves card is a pad dead end: START > Saves opens it; `openSaves` never sets `answering`; while the modal shows, `padAction` swallows every press including START and blocks the camera; nothing on the card is reachable and it cannot be closed. | page.ts:3262, :3084-3146, :3376, :3451, :3179, :2074; forge/savesPanel.ts:61-69, :139-152 | A pad-only player cannot leave Saves without a mouse or touch. | FUI-2 (smallest fix: Circle and START close the card); a pad-stubbed e2e. | S | S1 |
| PAD-2 | major | Destructive confirms say yes on Cross: `askConfirm` focuses the primary; two Cross presses from the Base row drop the placed pieces. The footer is already No first; only the focus is wrong. The lobby's CLOSE LOBBY card does it right. | page.ts:540-555, :3376, :3237, :3030-3037, :3033; shared/ds/README.md:238-241; forge/lobby/lobbyView.ts:29-30, :602-605 | A double tap wipes the layout in progress. | FUI-2: a `danger` flag; focus on Cancel; Cross presses the focused button; glyphs on both choices. | S | S1 |
| PAD-3 | major | No text can be typed with a pad: `askText`'s only pad path is Cross, which submits the prefill; the password prefill is blank, so a locked lobby cannot be joined; the console's on-screen keyboard is not reused. (Rendered: whether a system OSK reaches the native field.) | page.ts:560-584, :2929-2930, :2977, :3109, :3127, :3173, :3376; console/grammar.ts:95-111, :1185-1192; shared/ds/README.md:57, :252-256 | Every name a creator gives, and password lobbies, are out of reach on a pad. | FUI-8: the console OSK as a shared module, opened from `askText` when the press came from a pad. | M | infra |
| PAD-4 | major | Four pad navigation schemes and no shared ring: the START menu's `li.is-on`, the lobby's `is-focus`, the modal's fixed yes/no, `:focus-visible` on DOM controls; `.is-pad-focused` appears nowhere under forge/ or agent/. | forge/menuView.ts:34; forge/lobby/lobbyView.ts:478-520, :549-583; page.ts:3375-3376; forge.css:91-93; shared/ds/README.md:71-80 | Each surface moves and looks different; every FCW panel would add a fifth. | FUI-2: one pure `PadFocus` walker over `[data-pad-item]`, tested like padMenu; applied to every card and the docks; the panel contract. | M | infra |
| PAD-5 | major | No button legend: pad guidance is prose with inline glyph characters mixed with pointer words; the hint is hidden at 760 px; the Play tooltip says "pad START" but START opens the menu. (Rendered.) | page.ts:1288-1297, :1298-1304, :300, :3404; forge.css:396, :384; forge/menuView.ts:12; shared/ds/README.md:165-180; console/render/legend.ts:1-30 | A pad player must remember a 15-binding scheme; on a phone with a pad there is no guidance. | FUI-3: a legend strip on `.s2u-prompts` from one context function; prompts are touch buttons; a unit table pins them against pad.ts. | M | infra |
| PAD-6 | major | The START menu is a flat list of about 24 rows plus the lobby's; it holds 4 of 13 view switches, no grid or turn step, no Check, Lock or Frame; in the menu L1/R1, Square and Triangle do nothing (`PAD_MENU_INPUT` maps neither); MenuItem has no section or sub-screen. (Line numbers corrected: padMenu.ts:9-25, :36-38.) | page.ts:3226-3265, :3248-3251, :129-141, :464-471; forge/padMenu.ts:9-25, :36-38; plan:171-176, :192-197, :276-281, :318-323 | Each feature lengthens the one list or is left off the pad (OT.R52). | FUI-3: sections paged with L1/R1, sub-screens pushed with Cross and popped with Circle, a Square secondary, `registerMenuSection()`; add the missing rows now. | M | infra |
| PAD-7 | major | Lock, unlock, show-again, framing and selecting anything off the centre ray are pointer-only; a pad can hide a prop but never show it again (hidden props are not drawn, so the ray cannot pick them). | page.ts:1289, :2216-2230, :1254-1261, :371-375, :3018-3025, :1227-1238, :1245, :3386-3388, :3226-3265 | A hide is reversible only by undo; locked, distant or occluded placements cannot be picked. | FUI-3: the outliner as a START sub-screen (Cross selects and frames, Square locks, Triangle deletes/hides/shows); "Lock selection" and "Frame selection" rows. | M | S1 |
| PAD-8 | major | The map check is not in the START menu; a pad reaches it only through Play, where Cross means "Play anyway" (`askMapCheck` focuses `.fx-primary`); Jump is pointer-only. | page.ts:3226-3265, :2658-2664, :2529-2578, :2539-2542, :2553-2560, :2577-2578, :3376, :2655; plan:192-197 | A pad player cannot check a map alone and is one Cross from playing a broken one. | FUI-5: a "Check the map" row; issues as pad-focus rows; Go back focused first. | S | S1 |
| PAD-9 | major | The agent dock's Copy, Approve, Decline, Disconnect and checkboxes are DOM buttons in a collapsed details; no toast, chip or card consumes `approval` outside the panel; docks start hidden at 760 px and hide in Play; no pad path. (Rendered.) | agent/install.ts:49-53; agent/panel.ts:58-88, :97, :133-135; page.ts:3196; forge.css:139 | A creator on a pad or phone cannot approve, refuse or disconnect, and may not know one is waiting. | FUI-11: an Agent menu section; a page-level approval card with Decline focused first; a chip and a toast. | M | infra |
| PAD-11 | minor | Props are chosen one step at a time over the whole shown list (100 ms repeat); search is a native field the pad cannot reach. | page.ts:3341-3352, :337-339, :3241-3245; forge/pad.ts:54-55; plan:143-148 | Finding a specific crate means scrolling hundreds of entries. | FUI-3 sub-screen: a grid with page jumps, FCW-04 filters as tabs, recents and favourites, search through FUI-8. | M | S1 |
| PAD-13 | minor | The 44 px touch rule covers only the START menu: tools 28 px, chips 24 px, outliner rows 24 px, Lock 18 px; one `(pointer: coarse)` block exists. (Rendered: how it feels to tap.) | forge.css:75, :152, :218, :246, :525-529 | Outliner Lock and its row are easy to mis-tap on a phone. | FUI-12: one coarse-pointer block on a `--fx-control-h` token read by every control. | S | S1 |
| PAD-14 | minor | No forge e2e drives the editor with a pad; the only gamepad stub checks the match Back button's words; pad coverage is unit tests of the pure mappers. | e2e/forgeMenuPointer.spec.ts:29-32, :169; test/forge/pad.test.ts, padMenu.test.ts, menuView.test.ts | Dead ends like PAD-1 pass every check. | FUI-13: a scripted gamepad helper; one spec walks every START row and opens and closes every card with Cross and Circle. | S | infra |

#### Visual polish

| Id | Sev. | Claim | Citation | Impact | Proposal | Size | Sprint |
|---|---|---|---|---|---|---|---|
| VP-1 | major | The Forge's colours are a hand-made palette: 12 `--fx-*` hex colours not aliased to any `--s2u-*` token (only gold is); 42 hex and 9 rgba literals in forge.css, 58 hex in lobby.css, 17 in panel.css; `#1d3038` repeated six times. (Rendered: the look next to the launcher.) | forge.css:2-3, :10-21, :79, :154, :179, :221, :320, :506; shared/ds/tokens.css:7-20; modern/overlay/overlay.css:1-5; forge/lobby/lobby.css:18-185; agent/panel.css:3-7 | Moving from the launcher into the Forge feels like a different product; every new panel copies or invents hex. | FUI-7: one `forge/tokens.css` aliasing every `--fx-*` to a system token; team and side hues as tokens with contrast pairs; keep the `--fx-*` names for the source pins; a guard test refuses hex outside tokens.css. | M | S1 |
| VP-2 | major | Focus is drawn four ways and pad focus three more: rings at -1 px, +2 px and a gold 3 px offset; `outline:none` on the chat input; a fill plus left rule in the menu; gold border plus shadow and a gold outline in the lobby; the menu reuses `.is-on`, the toolbar's selected class. (Rendered.) | forge.css:91-94, :270, :503, :506; agent/panel.css:29; forge/lobby/lobby.css:134, :155, :174; forge/lobby/lobbyView.ts:520, :582; forge/menuView.ts:34; page.ts:1345; shared/ds/README.md:71-80 | A pad or keyboard user loses track of focus and mistakes it for selection. | FUI-7: one rule for `:focus-visible, .is-pad-focused` on the system tokens; rename the pad-focus classes; `.is-on` for selection only. | M | S1 |
| VP-3 | major | At 1440 px tool labels hide and tools differ only by colour (see IA-6); Team A `#d8a640` against the selection gold `#c4a04a` is 1.11:1; selection is class and colour only, no aria-pressed anywhere in page.ts. (Rendered.) | forge.css:17-21, :79, :81-90, :374-376; page.ts:259-262, :268-277, :294, :1345; shared/ds/README.md:188, :280-281 | Colour-blind creators cannot tell spawn and site tools apart; FCW-13/16/20 add more. | FUI-10: own marks (A/B, S/T, a Walk icon); selection as a bottom rule plus aria-pressed; team A distinct from the selection gold by a difference test. | M | S1 |
| VP-4 | major | The agent panel looks like a separate app: a 7 px-radius 16 px-padded card inside the dock, a 20 px display h2 under the section title, 36 px/4 px buttons against 28 px/3 px, a second full-width gold primary on the screen, a `wait` cursor on disabled, the comparison code in the condensed face, hard-coded status colours, a Unicode ↔ mark. (Corrections: Play is in the toolbar, not the dock; View and Settings h3 are 10 px. Rendered.) | agent/install.ts:52-53; agent/panel.css:8-9, :15, :21-23, :27-30, :35, :47, :52-53, :57; agent/panel.ts:44-46; forge.css:72, :75, :107-121, :141-149, :232, :243; shared/ds/README.md:278, :283-284 | The consent surface reads as foreign chrome; the code is harder to compare (0/O, 1/l). | FUI-11: a dock context that drops the frame; the shared button kit; the code in mono with letter-spacing; state tokens; an icon from the Forge set. | M | infra |
| VP-5 | major | Nothing shows an agent is connected unless the section is open; the dock hides with docks-off and during Play, which the agent can drive; toolbar, status bar and the match Back control show nothing. | agent/install.ts:52-53; forge.css:139, :467-478; page.ts:739, :2627, :487-493; forge/agent/api.ts:117-118; agent/panel.ts:3 | An agent can edit or play with no visible sign or a one-press disconnect. | FUI-4/FUI-11: a persistent chip (lamp plus word) in the status bar, mirrored beside `.fx-match-back`. | S | infra |
| VP-6 | major | No component for a status or diagnostic row: check rows carry `data-kind` but no selector styles it; no severity mark, no state word; the plan forbids a green badge for skipped. (Rendered.) | page.ts:2534-2544, :2567-2571; forge.css:441-445; plan:68-69, :318-322; shared/ds/README.md:480-487 | Each new panel invents its own severity colours. | FUI-5: one `fx-report` row (mark, status word, message, disclosure, one tertiary action); Skipped and Blocked on `--s2u-state-wait`. | M | S2 |
| VP-7 | minor | Disabled is drawn four ways across six sites, none using `--s2u-disabled`; the resting favourite star is 2.83:1, below 3:1. (Correction: text-dim `#8a9a9c` is 6.46:1.) | forge.css:80, :184, :199, :253, :507; forge/lobby/lobby.css:154; agent/panel.css:28; shared/ds/tokens.css:96; shared/ds/README.md:283-284 | Users cannot tell unavailable from busy; the star is hard to find. | FUI-7: one disabled rule; a `.fx-why` reason line; busy as aria-busy plus cursor:progress; the star at text-dim. | S | S1 |
| VP-8 | minor | Ten font sizes in forge.css (8-22 px), 10-16 in lobby.css, 11-29 in panel.css; dim text at 10-11 px against the 13 px token rule; the EXPERIMENT badge is 8 px; no `--s2u-type-*` role used. (Rendered.) | forge.css:27, :64, :66, :144, :150, :183, :206, :229, :232, :243, :257, :364-365, :412, :438, :452, :494, :508-512; forge/lobby/lobby.css:47, :82-83, :93, :141; agent/panel.css:15, :31, :35; shared/ds/tokens.json:25; modern/tokens.css:45-50 | Captions and hints are hard to read at distance on a TV with a pad. | FUI-7: five `--fx-type-*` roles mapped to system roles; floor 12 px (13 px dim); compact density instead of smaller fonts. | M | S1 |
| VP-9 | minor | Input and list borders are below 3:1: `--fx-edge` 1.46:1 on the ground and 1.35:1 on the panel; `--fx-edge-hi` 1.81:1; the agent input edge 1.95:1. | forge.css:13-14, :95-105, :164; forge/lobby/lobby.css:87, :114, :118, :129; agent/panel.css:4, :26; shared/ds/README.md:287 | Fields and dropdowns are hard to tell from the panel behind them. | FUI-7: `--fx-divider` and `--fx-control-edge` (text-dim), hover in gold, the pair in `shared/ds/contrast.ts`. | S | S1 |
| VP-10 | minor | Buttons in lists and dialogs have no affordance and no danger style: `.fx-tool` has a transparent border; Delete looks like Open; the primary is used for Close; confirms focus yes. (Rendered.) | forge.css:67-75, :446-448; forge/savesPanel.ts:61-70, :86-91, :116-118; page.ts:529, :589-598, :2539, :2543-2554, :2562, :2578; shared/ds/README.md:238-239, :273-284 | Destructive actions are easy to hit by mistake; primary stops meaning "the next step". | FUI-7: `fx-btn`, `--primary` (one per card, never Close), `--tertiary`, `--danger`; FUI-2 focuses No. | M | S1 |
| VP-11 | minor | Two menu looks on one page: the hand-drawn `.fx-menu` (3 px gold rule, 34 px rows) against the overlay's console look; pad buttons written as text characters instead of the system's glyph SVGs with the owner's red Circle. (Citation corrected: the glyph prose is at page.ts:513-518, :282-283, :1289-1300 and menuView.ts:12. Rendered.) | forge.css:389-393, :489-529; modern/overlay/overlay.css:1-5; page.ts:513-518, :282-283, :1289-1300; forge/menuView.ts:12, :27; shared/ds/README.md:165-180, :553-562, :643-660; modern/tokens.css:17-77 | A pad user switches between two navigation languages. | FUI-3/FUI-7: draw `.fx-menu` in the console vocabulary with settle motion; a shared `padGlyph(name)`. | M | S1 |
| VP-12 | minor | Icons mix systems: the Forge SVG set inside page.ts drawn at 12, 13 and 16 px beside Unicode ▸▾ × ●○ ★ ↔. (Rendered.) | page.ts:145-176, :186; forge.css:30, :153, :185, :194-195, :222; forge/lobby/window.ts:84; forge/lobby/lobbyView.ts:367, :373; agent/panel.ts:44; shared/ds/base.css:33-36; shared/ds/README.md:334 | Glyph weight varies by platform; no shared place to add icons. | FUI-7: `forge/icons.ts` with two sizes and the missing icons; replace every Unicode glyph. | S | S1 |
| VP-13 | minor | Status cells styled by position (`nth-of-type`); one toast style, fixed 1800 ms, no role; no role, aria-live or progressbar anywhere in page.ts; empty states (bar the favourites one) give no next step. | forge.css:315-329, :352-371, :395, :400-415; page.ts:488-494, :603-615, :1252, :1399, :1428; shared/ds/README.md:662-669 | Errors and agent or pack events are easy to miss; adding a cell moves the gold one. | FUI-4: named cells plus `statusSlot()`; toast variants with roles; progressbar role; next-step lines. | M | S1 |
| VP-14 | minor | Hit targets are mouse-sized in the touch layout: chips 24 px, star and reset 20 px, Lock 18 px, toggles 14 px; only the menu grows on coarse pointers; lobby buttons have 4 px padding on 11 px text. (Rendered.) | forge.css:75, :152, :184, :218, :233-234, :246, :252, :384-397, :525-529; forge/lobby/lobby.css:138-150, :180-185; shared/ds/base.css:66; MISSION.md:267 | Dock controls are hard to hit on a tablet or phone. | FUI-12 (with PAD-13). | S | S1 |
| VP-15 | polish | Token housekeeping: drifted var() fallbacks (lobby gold `#d8b45a`, `#101a1f`, `#8aa0a8`, the agent's gold fallback is the team-A colour, `#8a94a0`); the test-room dock hard-codes sans-serif; radii 3/4/7/12 px; four hand-written shadows; raw z-indexes 2, 3, 12, 20, 25, 30, 180, 1100; five !important on `.fx-empty`; the page title says "SOCOM II Legacy" where the public name is "SOCOM 2 Legacy". | forge/lobby/lobby.css:21-22, :50, :166, :170; agent/panel.css:7, :9, :60-61; forge.css:49, :72, :135, :152, :189, :229, :388, :424, :436, :467, :475, :487, :490; page.ts:233; shared/ds/chrome.md:3-4 | Small inconsistencies add up to an unfinished feel and make overlap bugs likely. | FUI-7: `--fx-radius`, `--fx-lift`, a named z ladder on `--s2u-z-overlay`; delete the fallbacks; `.fx-empty` its own class; fix the title. | S | S1 |

#### Agent integration

| Id | Sev. | Claim | Citation | Impact | Proposal | Size | Sprint |
|---|---|---|---|---|---|---|---|
| AI-1 | major | An agent's edit is not recorded as the agent's: HistoryStep is `{text, picked}`; the agent commits through the same `edit()`; Undo/Redo tooltips are fixed strings. | forge/history.ts:68-71, :79-80; page.ts:1042-1050, :3550-3561, :286-287, :1005; design:54, :162 | Ctrl+Z or SELECT undoes an unnamed change; the person cannot tell their steps from the agent's. | FUI-6: HistoryStep gains `label` and `actor`; `edit(before, meta)`; "Undo: <label>" titles; the pad menu shows the same words. | M | S1 |
| AI-2 | major | The only sign of a connected agent is inside a closed details; docks-off and Play hide it while the agent can drive Play; the status line is overwritten by every message. (Rendered: the match overlay covering the page.) | agent/install.ts:52-53; forge.css:139, :467; agent/connection.ts:560; page.ts:487-494, :608 | The person cannot see or stop an agent once the dock is collapsed or a match runs. | FUI-4/FUI-11: an always-visible agent cell on s2u-chip; the same chip with Stop beside `.fx-match-back`. | M | infra |
| AI-3 | major | Recent activity is an 8-entry ring written by every request, reads included; every `forge.edit` is "Updated map"; `forge.check` falls through to "Read session"; refusals say only "needs attention"; QUEUE_FULL, RATE_LIMITED and STOP_IN_FLIGHT never reach the log. | agent/connection.ts:88-103, :157-166, :411-430, :458-463; agent/panel.ts:110-113 | Useful rows are lost under read noise. | FUI-11: typed entries, merged reads, nested-operation labels, codes as sentences, pre-dispatch refusals logged, about 50 entries. | M | S1 |
| AI-4 | major | After approval the panel never shows what was granted: `render()` reads only `pending.permissions`. | agent/panel.ts:91-114; agent/connection.ts:518-520; design:53 | The person cannot check whether the agent may edit, import, test or capture. | FUI-11: an "Allowed: …" chip row from `state.permissions`; the status chip's tooltip lists the same. | S | S1 |
| AI-5 | major | Permission labels understate: "Edit the map" also covers deleting and renaming named saves (outside undo), camera, tool, search and favourites; "Import local packs" gates `layout.import`; "Run tests" drives the player. | agent/panel.ts:27-30; forge/agent/api.ts:59-61, :70, :97-113; page.ts:3681-3689 | Approving "Edit the map" can lose a named save that undo cannot bring back. | FUI-11: labels and consequences from the operations table; irreversible actions marked; saves.delete/rename in their own grant or confirmed in the page. | S | S1 |
| AI-6 | major | Approval gaps: Allow with nothing ticked does nothing silently; inspect starts ticked against "all off"; the code is 6 ungrouped characters that can include 0/O and 1/I; no countdown for the 5-minute expiry. (Rendered.) | agent/connection.ts:879-888; agent/panel.ts:66, :105, :69; forge-agent/src/sessions.ts:196-199; design:51, :105, :140 | A person can mis-compare the code or get no response from Allow. | FUI-11: Allow disabled until one box is ticked ("Allow 2 of 4"); a look-alike-free grouped code; time left; inspect unticked or labelled required. |  S | S1 |
| AI-7 | minor | The reason a connection ended is not shown: `close()` with default status leaves `error` undefined, so expiry and SURFACE_DENIED read "Disconnected"; "Paused with this page" suggests resume but hiding the tab closes fully; the copy button keeps "Copied" after a disconnect. | agent/connection.ts:180-232, :561-565, :720-727, :736; agent/panel.ts:34, :91-96, :116-131; design:192 | The person cannot tell why the agent stopped or that they must pair again. | FUI-11: `state.reason`; "Paused when you left this tab. Pair again to continue."; `render()` sets the copy text. | S | S1 |
| AI-8 | major | Two separate map-check results: the person's Check never writes `agentIssues`; the agent's `checkMap` writes it unseen; `forge.issues` returns [] after a human check; agent `play.start allowIssues` skips the "Play anyway" confirmation with raw JSON. | page.ts:2527-2545, :2585, :2658-2663, :3502, :3539, :3580, :3646-3649, :3690-3693; agent/forgeTarget.ts:100 | The person and the agent work from different lists; the person never sees issues the agent accepted. | FUI-5: one `latestCheck {revision, by, issues, notes}`; an issues-count chip; "Agent started Play with 3 issues". | M | S1 |
| AI-9 | major | No shared diagnostics model for FCW-04/05/08/23/29; each names its own UI file; the only list with Jump is the check modal. (FCW-05's type is reused by FCW-27, but no UI list and no link to MapIssue.) | plan:68-69, :81-86, :143-148, :171-176, :276-281, :318-323; forge/validate.ts:54-65; page.ts:2527-2545 | Each feature shows problems in a different panel. | FUI-5 `forge/diagnostics.ts`. | M | infra |
| AI-10 | major | An agent commit takes over the person's context: `applyPicked` with the agent's refs; an import with a camera moves the view; camera.*, tool.set and palette.search change the person's state silently; `edit()` clears `keepEarlier` as "the player's own edit". (Rendered.) | page.ts:1042-1044, :3550-3556, :3606-3619, :3705-3717 | Selection and camera change under the person; a protected autosave can be overwritten. | FUI-6/FUI-11: keep the person's selection; `is-agent-recent` rows; a receipt toast with Select and Undo; camera ops save the prior pose; `keepEarlier` cleared only by the person. | M | S1 |
| AI-11 | major | The person cannot see a scenario's progress: "Play test: complete" is logged when `scenario.start` is accepted; transitions happen in `frame()` and reach only the agent while the docks are hidden. (Rendered.) | agent/connection.ts:96, :458-463; forge/agent/play.ts:70-75, :110-116, :126-153; forge.css:139 | The person cannot tell an agent is driving their player or whether the test passed. | FUI-11: job events into the activity store; the Play overlay chip "Agent test · step 4/12 · Stop"; the final outcome with observations. | M | S1 |
| AI-12 | minor | Canvas captures and pack imports leave a generic row: no viewport cue when an image leaves the device; "Local pack: complete" with no name, kind or applied state even when it replaced the layout. (Rendered: the fix.) | agent/install.ts:9-21, :56-59; agent/panel.ts:87; agent/connection.ts:89, :95; plan:176 | The person does not learn when their view was sent or what a pack did. | FUI-11/FUI-16: "Agent took a picture of the view"; pack rows with name and undo policy from the operation table. | S | S2 |
| AI-13 | minor | The dock's styling diverges (see VP-4) and it is prepended above the Inspector in every build with no DEV gate. (Rendered: the aesthetic claim.) | agent/panel.css:2-12, :15, :21-23, :52-53, :57; agent/panel.ts:42-47; agent/install.ts:52-53; pageEntry.ts:110-115; shared/ds/base.css:48-51 | The panel reads as foreign and pushes the Inspector down in a 290 px dock. | FUI-11: drop the frame and duplicate heading; state tokens; append after Settings or open from the chip. | S | S1 |
| AI-14 | minor | The pad cannot reach the agent: no agent entry in padMenu.ts; Approve, Decline and Disconnect are click listeners; no agent e2e spec exists. (Rendered.) | forge/padMenu.ts; agent/panel.ts:133-135; forge-agent-webrtc.md:220-222; e2e/ | A person on a pad cannot answer a pairing request. | FUI-11: a pad row wired to approve, deny and disconnect; covered in FCW-02's spec. | S | infra |
| AI-15 | major | The rest of the page cannot subscribe to agent state: AgentPanelState is a status enum plus an untyped text list; STALE_REVISION and REVISION_CONFLICT name the same condition; FCW-08/23/29 states have no typed place. | agent/panel.ts:6-21; forge/agent/api.ts:213-214; agent/forgeTarget.ts:22, :60, :86, :131, :136, :153; plan:81-83, :323 | Each feature invents its own status display; the person sees codes. | FUI-4/FUI-11: `agent/activity.ts` store and `agent/codes.ts` table; merge the conflict codes. | M | infra |

#### UI extensibility

| Id | Sev. | Claim | Citation | Impact | Proposal | Size | Sprint |
|---|---|---|---|---|---|---|---|
| UX-1 | major | No way to register a panel: `mountForge` returns `Promise<void>` with `onAgentReady` as its only hook; the agent dock enters by a DOM query. (Plan citations corrected: FCW-23 is plan:278, FCW-29 plan:320.) | page.ts:232, :3734, :352-358, :472; pageEntry.ts:112-113; agent/install.ts:49-53; plan:173, :278, :320 | New features arrive as one-off widgets and each risks a regression in the shared closure. | FUI-1: `ForgePanel` and `ForgeShell`; `panel()` becomes the registry's renderer; the agent dock re-registered first. | M | infra |
| UX-2 | major | `ForgeAgentApi` is already a revision-guarded facade and should be the panel context, but `catalogue`, `issues` and `view` are typed `unknown`, the snapshot JSON-stringifies the whole layout every 250 ms with no subscriber, and many closure variables a panel needs are not exposed. (Rendered: the cost needs a profile.) | forge/agent/api.ts:5-30, :12-14; page.ts:3521-3543, :3522-3524, :3526-3540, :3741-3748, :3563; page.ts:975, :962, :1042, :1069, :899, :897, :1004-1005, :719-720, :1330, :1336, :1343, :736, :741-742, :2413, :2415, :2486 | Panels duplicate closure logic or drift from what the agent sees. | FUI-1: `ForgePanelContext {forge, ui, state(), store, doc}`; type the unknown fields before FCW-04; a dirty flag instead of the 250 ms stringify. | M | infra |
| UX-3 | major | One `modal` and one `answering` slot (see IA-1, IA-2, PAD-1); the disc card is a third user; nested prompts rebuild Saves by hand; no card sets role=dialog. | page.ts:505, :539, :551, :579, :596, :2577, :3084-3146, :3091, :3111, :3113, :3121, :3129, :3838-3840, :2074, :3376; forge/keys.ts:60 | A controller player is stuck behind Saves (OT.R52). | FUI-2 card stack; Saves migrated first. | S | S1 |
| UX-4 | major | Map check is a transient modal whose Jump a pad cannot reach; no START row; `MapCheck` does not match CheckReport; `proceedIfClear` goes straight on when only notes exist, so a skipped check can look like a pass. | page.ts:2527-2578, :2533-2541, :3376, :2658-2664, :3226-3266, :2581-2588; forge/validate.ts:50-65; forge.css:441; plan:68-69, :143-149, :171-177, :192-198, :318-324 | Four differently shaped problem lists, none pad-usable. | FUI-5 `reportView.ts` as a Problems panel and the pre-Play gate; `mapCheckToReport()`. | M | infra |
| UX-5 | minor | Feedback is one status line and one toast with no queue, severity or aria-live; status cells are fixed closure variables; the agent dock keeps its own activity list. (Citation corrected: FCW-29 states at plan:323, :84. Rendered.) | page.ts:482, :487-494, :608, :609-616; agent/panel.ts:83-84; plan:84, :323 | Long-job and agent messages are overwritten in under two seconds. | FUI-4 `ui.notify()` and `ui.statusCell()`; `say()` kept as a wrapper for the 22 e2e reads of `.fx-status-msg`. | S | infra |
| UX-6 | major | The START menu is one flat list with headings only; padMenu.ts claims every dock control is reachable, but Check, outliner rows, Lock/Unlock, hidden-prop restore, the inspector's fields and the agent dock are not; the lobby window is the one surface that owns the pad. (Rendered.) | page.ts:3226-3266, :3253, :1227-1239, :1240-1244, :1257-1260, :368-372, :3420-3425; forge/padMenu.ts:2-4, :9-25, :38-40; forge/lobby/lobby.ts:51 | Packs, missions, jobs and readiness would be unreachable or buried. | FUI-3 `menuSection()` per panel; "Open <panel>" hands the pad to `pad(snapshot)`; drill-in submenus; remove the false sentence. | M | infra |
| UX-7 | minor | The right dock is a 290 px column of four details all open by default; the agent dock is prepended; no order, no remembered open state; no toggle listener. (Rendered: the Inspector pushed off-screen.) | page.ts:352-358, :472; agent/install.ts:52-53; forge.css:9, :138, :384-390 | The selected object's fields scroll away as panels are added. | FUI-1: `order`, `defaultOpen`, open state per viewer; Inspector first; icon tabs past five panels; checked at 1280, 1100, 760 px. | S | S1 |
| UX-8 | minor | Four DOM-helper styles (page.ts `el`, menuView `el`, lobbyView's local `el`, panel.ts `node`); savesPanel defines a button helper three times; the agent dock has its own classes and sizes; forge.css has its own hexes; the Forge icon set sits beside the shared one (different marks, not duplicates). (Rendered.) | page.ts:188, :146; forge/menuView.ts:18; forge/lobby/lobbyView.ts:129; agent/panel.ts:39; forge/savesPanel.ts:61, :114, :139; agent/panel.css:2-8, :28; forge.css:10-21; shared/ds/tokens.css:9-20; shared/ds/README.md:165-177; shared/ds/icons.ts:15 | Each new panel looks and behaves slightly differently. | FUI-7 `forge/ui/kit.ts`. | S | infra |
| UX-9 | minor | The e2e specs find elements by presentational classes and title prefixes (`.fx-modal` 19, `.fx-outliner li.fx-missing` 17, `.fx-check-card` 8, `button[title^="Undo"]` 3); only three controls carry `data-forge`. | e2e/forge*.spec.ts (14 files); page.ts:261, :264, :292 | Polish turns into test churn. | FUI-13: `data-forge-panel`, `data-forge-action`, `data-forge-card`; migrate specs one at a time; a lint test for new panels. | S | infra |
| UX-10 | major | Settings is split three ways: pure logic in settings.ts, DOM inline in the closure, pad rows written a second time in the START menu with their own formatting. | forge/settings.ts:77-120; page.ts:407-471, :814, :830, :905, :3223-3225, :3253-3261, :640 | Each new setting (FCW-13 modes, FCW-20 missions) is added in two places that drift. | FUI-1 proof migration: `settingsPanel.ts` driven by `SettingRowSpec[]` rendered as dock rows and as its menu section; writes through `ctx.forge.execute`. | M | infra |
| UX-11 | minor | The outliner assigns kind `objectives` but its filter has no such option; kinds, icons and labels are hard-coded branches; rows are clickable `<li>` with no tabindex or role. (Plan citations corrected: stable IDs plan:74-77, review focus plan:327. Rendered.) | page.ts:382-386, :1210-1215, :1240-1244, :1257-1260; plan:74-77, :276-282, :327 | Creators cannot list just their objectives; mission and pack entities would be bolted onto an unfilterable list. | FUI-10 now (Objectives option, focusable rows); then `OutlinerProvider {kind, label, icon, rows}`; rows show stable authored IDs only. | M | S1 |
| UX-12 | minor | Page lifecycle is unreachable by panels: `teardown` disposes two listeners and the agent API; `frame` has no per-panel tick; the agent dock wires its own pagehide. (Citations corrected: lobby setShown :57, dispose :59; FCW-29 cancel cases plan:322.) | page.ts:3486, :3487-3491, :3741; forge/lobby/lobby.ts:49, :57, :59; agent/install.ts:39-46; plan:322 | Pollers would leak or keep running on a hidden tab (FCW.R5). | FUI-1: `frame?`, `visibility?`, `dispose()` and `ctx.signal`. | S | infra |
| UX-13 | major | Whether an action is allowed is derived ad hoc from scattered flags (`editsLocked`, `busy`, `checking`, `playing`, `match`, `matchOfLobby`, `agentMode`), each with its own wording. (Citations corrected: menu note :3229; FCW-08 RED plan:175; FCW-23 RED plan:280.) | page.ts:897, :899-903, :736, :744, :2486, :2413, :2415, :3520, :3229, :2581-2582; plan:175, :280 | New panels let an edit fail silently or show a different reason than the toolbar. | FUI-1: `ctx.state(): {surface, canEdit, reason, revision}`; `agentMode` and `refuseEdit` routed through it; panels declare `availableIn`. | S | infra |
| UX-14 | minor | Tools are a closed union: adding one edits `Mode`, `modeBtns`, `TOOLS`/`TOOL_NAMES`, `KEY_HINTS`/`PAD_HINTS`, the key switch and a hand-written Controls card. (Citation corrected: key switch :2085.) | page.ts:269-278, :3315-3316, :1278-1297, :2085, :511-530; forge/keys.ts:38-42 | The Controls card goes stale; creators cannot learn a new tool with a pad. | FUI-10 `ToolSpec` registry generating buttons, names and hints; the Controls card from specs and legends. | M | S3 |
| UX-15 | major | The plan gives each panel its own files under `viewer/src/creator/` but no task owns how a panel mounts; FCW-04 (S1) and FCW-08 (S2) hit it first; page.ts has 113 commits. (Citations corrected as UX-1.) | plan:118-120, :145-146, :173, :278, :320, :88-98 | Each sprint pays the integration cost again. | FUI-1..3 as one owned task group before FCW-08; FCW-04/08/11/23/29 then name a ForgePanel as their UI deliverable. | M | infra |

### 3.3 Withdrawn

None. The skeptic refuted no finding. It corrected line numbers, counts or a citation in IA-6, IA-7, IA-13, IA-14,
PAD-2, PAD-6, VP-4, VP-7, VP-8, VP-9, VP-11, VP-15, UX-1, UX-5, UX-8, UX-9, UX-11, UX-12, UX-13, UX-14, UX-15; each
row above carries the correction.

### 3.4 Needs a rendered pass

Unverifiable by source inspection, listed as plausible only:

| Id | Claim | What the pass checks |
|---|---|---|
| PAD-10 | On a touch phone without a pad the editor camera has no way to fly or look: `.fx-input` covers the canvas, drag-look listens on the canvas, only the wheel is forwarded, no touch stick is mounted. (forge.css:283-284; camera.ts:150-151, :245-249; page.ts:2049-2052, :3452-3453; e2e/forgePhoneDock.spec.ts:29-31) | A phone-emulated run with touch: can the view move at all. If not, FUI-12 mounts the match's touch stick and a one-finger drag-look. |
| PAD-12 | A gamepad press may not count as the user activation the clipboard needs; the fallbacks (status line, the dead Saves card, a textarea) are where a pad cannot reach. (page.ts:3005-3009, :3160-3166; agent/panel.ts:121-128) | A real pad in Chrome and Firefox: does `clipboard.writeText` succeed from a pad press. If not, a pad-closable card with the link and a second step. |

Confirmed findings whose on-screen effect still needs the rendered pass (marked "Rendered" above): IA-1, IA-5, IA-6,
IA-7, IA-8, IA-12, PAD-3, PAD-5, PAD-9, PAD-13, PAD-14, VP-1, VP-2, VP-3, VP-4, VP-6, VP-8, VP-10, VP-11, VP-12,
VP-14, AI-2, AI-6, AI-10, AI-11, AI-12, AI-13, AI-14, UX-2 (profile), UX-3, UX-4, UX-5, UX-6, UX-7, UX-8, UX-11. The
pass is section 5c: desktop at 1920, 1440 and 1280 px, phone at 390 px, a pad stub, a screenshot of every panel and
card.

## 4. The UI workstream (FUI-1..21)

Product track. Each task is a labelled browser adaptation (FG.R2); none changes the game's behaviour. Sizes S/M/L
as the plan uses them. Every task carries this acceptance line: reachable by pointer, by pad (START menu or a pad
route) and by key (OT.R68); works at 760 px and below; uses design-system state tokens; one rendered e2e. Files are
relative to `packages/viewer/src/` unless stated. page.ts is claimed once in HANDOFF §3 for FUI-1..3; later tasks
touch it only through the seams those three add. Order: FUI-1..8 (infra) precede FCW-08, FCW-23 and FCW-29, and
FUI-2, FUI-5 and FUI-7 precede FCW-03 and FCW-04's UI; FUI-9..13 land in S1; FUI-14..21 are the per-sprint UI tasks.

### Infrastructure (before FCW-08)

#### FUI-1 -- Forge shell: panel registry, context, lifecycle (L, S1/S2)
**Needs:** none. **Closes:** IA-9, UX-1, UX-2, UX-7, UX-10, UX-12, UX-13, UX-15; ARCH blocking 2.
**Files:** new `forge/shell/{panel,context,state}.ts`, `forge/panels/{inspector,outliner,view,settings}Panel.ts`;
page.ts (`panel()` at :352, the right-dock append at :472, `mountForge` options at :232, `frame` :3741,
`teardown` :3487); `pageEntry.ts:107-114`; `agent/install.ts:49-53`; `forge/agent/api.ts:12-14`; tests
`test/forge/shell.test.ts`; existing `e2e/forge*.spec.ts` unchanged.
**Interfaces:** `ForgePanel {id, title, dock:'left'|'right'|'workspace', order, defaultOpen, padLegend,
availableIn?, menuSection?(), mount(host, ctx) -> {update?, pad?, frame?, visibility?, dispose}}`;
`ForgePanelContext {forge: ForgeAgentApi (typed snapshot), ui, state(): {surface, canEdit, reason, revision},
store, doc, signal}`; `mountForge(doc, {panels?}) -> ForgeShell {register, unregister, dispose}`. `agentMode` and
`refuseEdit` read `ctx.state()`. A `workspace` dock is a full-viewport surface with a breadcrumb and Back on Circle.
Pad path: each registered panel declares `menuSection()` or `pad()`; a unit test refuses one without either.
- [ ] RED: a panel registered without a pad path fails the registry test; `unregister` leaves no listener or timer;
  the snapshot is not rebuilt when nothing changed (dirty flag replaces the 250 ms stringify, page.ts:3741-3748);
  `catalogue`, `issues`, `view` are typed; open state survives a reload under one `PAGE_SETTING_KEYS` entry.
- [ ] GREEN: Inspector, Outliner, View, Settings and the agent dock are registrants with no DOM class change;
  all 14 forge*.spec.ts stay green (rendered, under 5c); Settings is rendered from `SettingRowSpec[]` in the dock
  and as its menu section with one value formatter (UX-10); the Inspector is first and the agent dock after
  Settings, collapsed; screenshots at 1280, 1100 and 760 px.

#### FUI-2 -- Card stack and pad focus walker (M, S1; before FCW-03's chooser)
**Needs:** none (FUI-1 preferred). **Closes:** IA-1, IA-2, IA-13, PAD-1, PAD-2, PAD-4, UX-3; VP-10's focus half.
**Files:** new `forge/shell/cards.ts`, `forge/shell/padFocus.ts`; page.ts (`modal`/`answering` :505/:539,
`askConfirm` :540, `askText` :560, `tellCard` :586, `askMapCheck` :2527, `openSaves` :3084, `padAction` :3376,
`closeCard` :2074, the disc card :3838); `forge/savesPanel.ts`; `forge/keys.ts:60`; forge.css:441-448;
tests `test/forge/{cards,padFocus}.test.ts`; e2e `forgeSaves.spec.ts` (pad).
**Interfaces:** `ui.open(card, {onBack, onAct?, initialFocus, label, danger?}) -> handle` pushes; `close()` pops;
Esc and Circle call the top card's `onBack`; every card has role=dialog, aria-modal, aria-labelledby, a focus trap
and focus return; `danger` focuses Cancel and Cross presses the focused button. `PadFocus` walks `[data-pad-item]`
in DOM order with MenuStick's repeat and sets `.is-pad-focused`. The `.fx-modal` and `.fx-card` classes stay.
Pad path: d-pad moves, Cross runs the focused row, Circle backs out, Square and Triangle are the row's secondary
and remove actions (Saves: Open, Rename, Delete).
- [ ] RED: Saves opened from START closes on Circle and Esc (pad stub); a check card followed by Saves leaves
  `checking` false and the new card clickable; `askConfirm` with `danger` starts on Cancel and a second Cross does
  not confirm; a nested rename reopens Saves at the same scroll; the toolbar refuses Saves while a card is open.
- [ ] GREEN: Saves, Confirm, Text, Tell, Check and the disc card are stack cards; the check list is a non-modal
  sheet; rendered pad run of every card (5c).

#### FUI-3 -- Pad menu sections, sub-screens and legend (M, S1)
**Needs:** FUI-2. **Closes:** PAD-5, PAD-6, PAD-7, PAD-11, UX-6; VP-11's menu half; the S4 reader's page stack.
**Files:** `forge/padMenu.ts` (MenuItem :9-25, PAD_MENU_INPUT :36-38), `forge/menuView.ts`, new
`forge/shell/legend.ts`, page.ts (`menuItems` :3226-3266, `PAD_HINTS` :1288-1297, `playBtn.title` :300),
forge.css:489-529, :396; tests `test/forge/{padMenu,menuView,legend}.test.ts`; e2e `forgeMenuPointer.spec.ts`.
**Interfaces:** `MenuItem.section`, `MenuItem.page?: () => MenuItem[]` (Cross pushes, Circle pops, breadcrumb in
the header), `MenuItem.secondary?` on Square; `registerMenuSection({id, label, items(ctx)})` composed by the
shell; sub-screens for the Outliner (Cross selects and frames, Square locks, Triangle deletes/hides/shows), Props
(grid, page jumps, filter tabs, recents, search through FUI-8) and Check. A legend strip on `.s2u-prompts.is-pad`
at the status bar from one `legendFor(context)`; each prompt is a touch button; the glyphs are the system's SVGs
(`padGlyph(name)`), the Circle red. Keyboard M opens the same menu (OT.R68).
- [ ] RED: a unit table pins every context's prompts against pad.ts's EDGE/REPEAT map; L1/R1 page sections;
  Circle pops a sub-screen before closing the menu; the Play tooltip no longer says START; rows for Check, Lock
  selection, Frame selection, grid step, turn step and the nine missing view toggles exist.
- [ ] GREEN: the flat list is gone; the Outliner and Props sub-screens drive selection and placement from a pad
  stub in e2e; the legend hides nothing at 760 px; `.fx-menu` drawn in the console vocabulary (rendered, 5c).

#### FUI-4 -- Status and notification model, status chips (M, S1)
**Needs:** FUI-1. **Closes:** IA-7, IA-12, VP-5, VP-13, UX-5, AI-2 (page half), AI-15 (store).
**Files:** new `forge/shell/notify.ts`, `forge/shell/statusBar.ts`, `agent/activity.ts`, `agent/codes.ts`; page.ts
(`toast` :482, status cells :487-494, `say`/`pop` :608-616); forge.css:315-329, :352-371, :395; `agent/forgeTarget.ts`
(REVISION_CONFLICT) and `forge/agent/api.ts:213-214` (STALE_REVISION merged); tests `test/forge/notify.test.ts`.
**Interfaces:** `ui.notify({level:'info'|'ok'|'warn'|'error', source, text, action?, sticky?, progress?}) -> handle`
feeding an aria-live region (polite; assertive for errors), the toast and the status bar; `say()` a thin wrapper;
named cells `.fx-cell--mode|counts|cam|speed|fps` plus `registerStatusChip({id, render, onOpen})` on s2u-chip and
s2u-lamp with the word always shown (`--s2u-state-live/ready/wait/alert`); a click opens a message log. The agent
chip shows Connected / Approval needed / Acting / Paused and mirrors beside `.fx-match-back` during Play with Stop.
Pad path: the chip strip is read-only; each chip's panel is reached through its menu section.
- [ ] RED: two notices in 200 ms both reach the log and the live region; an error outlives 1.8 s until dismissed;
  the chips keep their styles when a sixth is added (no `nth-of-type`); the loading bar has role=progressbar;
  "Nothing placed yet" and "No props match" name the next step; the lobby chip says "edits locked".
- [ ] GREEN: 22 e2e reads of `.fx-status-msg` still pass; the agent chip is visible with docks off and in Play
  (rendered, 5c).

#### FUI-5 -- Diagnostics model and CheckReport viewer (M, S1; before FCW-04)
**Needs:** FUI-2. **Closes:** IA-14, PAD-8, VP-6, UX-4, AI-8, AI-9; S2 FCW-05 blocking, S3 FCW-11, S6 FCW-23, S7
FCW-28, ARCH FCW-05/11.
**Files:** new `packages/creator-contracts/src/diagnostics.ts` (owned with FCW-05), `forge/diagnostics.ts`,
`forge/shell/reportView.ts`; `forge/validate.ts:50-66` (`ref` on MapIssue, `mapCheckToReport`); page.ts
(`askMapCheck` :2527, `proceedIfClear` :2581, `agentIssues` :3502, `checkBtn` :2658); `agent/forgeTarget.ts:100`;
tests `test/forge/{diagnostics,reportView}.test.ts`; e2e `forgeMapCheck.spec.ts` (pad).
**Interfaces:** `Diagnostic {schema:'s2u.creator/diagnostic', version:1, source:'check'|'placement'|'pack'|
'readiness'|'mission'|'job', severity:'error'|'warning'|'note', status?:'pass'|'fail'|'skipped'|'blocked'|
'incomplete', code, text, at?, id? (stable authored ID, never a revision ref), file?, field?, expected?, actual?,
hint?, evidence?, reference?, revision}`; `CheckReport {status, diagnostics, evidence}`; `ReportView(report, {jump,
select, fix?, openFile?})` grouped by severity and subject with an `fx-report` row (mark, status word, message,
disclosure, one tertiary action); skipped and blocked on `--s2u-state-wait`, never green; one `latestCheck
{revision, by:'you'|'agent', report}` written by the person's Check and the agent's `checkMap`. Pad path: a "Check
the map" menu row (←/→ cycles the experience once FCW-11 registers them); rows walked by FUI-2's walker, Cross
jumps, Go back focused first.
- [ ] RED: notes-only results are shown as skipped before Play, not passed through; the human Check updates
  `forge.issues`; agent `play.start allowIssues` posts "Agent started Play with N issues"; Jump selects the piece
  by `ref`; a skipped row never carries the ready token; the adapter from `LocalPackDiagnostic` round-trips.
- [ ] GREEN: the Check modal, the pre-Play gate and `issues.read` all render one report; an issues-count chip
  (FUI-4) goes stale on the next revision; rendered pad run (5c).

#### FUI-6 -- Operation registry and history entries with actor and domain (M, S1/S2)
**Needs:** FUI-1. **Closes:** AI-1, AI-10 (history half); ARCH history and five-places findings; S6 FCW-23 undo.
**Files:** new `forge/shell/operations.ts`; `forge/history.ts:68-80`; page.ts (`edit` :1042, `agentStage`
:3550-3561, `agentPrepare` :3557-3723, Undo/Redo :286-287, `refreshUndo` :1005); `forge/agent/api.ts:59-134`;
`agent/forgeTarget.ts:68-112, :158-167`; `packages/forge-agent-protocol/src/index.ts:39-51, :174-192`; tests
`test/forge/{history,operations}.test.ts` and the existing guard/receipt matrix.
**Interfaces:** `OperationRegistry.register({name, version, permission, surfaces, inputSchema, mutates,
prepare(ctx, args, guard), historyDomain})`; the protocol list, MCP discovery and the play allowlist derived from
it; panels call `ctx.forge.execute(op, args)` as actor `person` with no grant; `HistoryEntry {domain:'layout'|
'packs'|'mission'|'campaign', actor:'you'|'agent'|'system', label, requestId?, before, after}` with a composite
step; `encode/decodeHistoryStep` backward compatible (absent means `you`, `layout`). Undo and Redo titles and the
pad menu read "Undo: <label>". `keepEarlier` is cleared only by a `person` edit. Pad path: SELECT undo unchanged;
an undo-history list as a menu sub-screen.
- [ ] RED: an agent batch of three places undoes as one labelled step; the operation enum, the protocol list and
  the allowlist are generated from one table (a diff test); a human Settings write and the agent's `settings.set`
  produce the same receipt and refusal; an agent edit leaves `keepEarlier` true.
- [ ] GREEN: the existing guard matrix passes by name; the undo list shows an agent glyph on agent rows (rendered).

#### FUI-7 -- Forge UI kit and token pass (M, S1)
**Needs:** none. **Closes:** VP-1, VP-2, VP-7, VP-8, VP-9, VP-10 (styles), VP-12, VP-15, UX-8; ARCH kit finding.
**Files:** new `forge/tokens.css`, `forge/ui/kit.ts`, `forge/icons.ts`; forge.css, `forge/lobby/lobby.css`,
`agent/panel.css`; page.ts (`ICON` :145-176, `el` :188, `panel` :352, `settingRow`/`range` :427-445, title :233);
`forge/menuView.ts:18`, `forge/savesPanel.ts:61, :114, :139`, `agent/panel.ts:39`; `shared/ds/contrast.ts`
(new pairs); `test/forge/toolbarScroll.test.ts` and `test/modern/overlayTouchMenu.test.ts` (source pins kept);
new `test/forge/tokens.test.ts`.
**Interfaces:** every `--fx-*` an alias of a `--s2u-*` token (ground, panel, surface-card, highlight, text,
text-dim, surface-hover, focus, state-*, viewer-lift, z-overlay ladder, radius chosen once); `--fx-team-a/b`,
`--fx-side-seal/terrorist` with contrast pairs; `--fx-control-edge` (text-dim) and `--fx-divider`; five
`--fx-type-*` roles, floor 12 px (13 px dim); one focus rule `:is(:focus-visible, .is-pad-focused)`; one disabled
rule with `.fx-why`; `fx-btn`, `--primary` (one per card, never Close), `--tertiary`, `--danger`; `kit.ts` exports
`el, button, chip, settingRow, field, emptyState, cardFooter, promptRow`; `icons.ts` with 16 and 20 px and the
chevron, close, ready, host, agent, pack, mission, trigger, job and water marks. The guard test refuses a hex or
rgba literal in the three stylesheets outside tokens.css and a font size under 12 px.
- [ ] RED: the token test is red on today's 117 literals; `#1d3038` appears once; contrast pairs for the new
  tokens pass 3:1 (edges) and 4.5:1 (text); the title reads "SOCOM 2 Legacy".
- [ ] GREEN: no visual regression in forge*.spec.ts screenshots beyond the token change itself (rendered, 5c,
  before/after sheets for the owner, section 6).

#### FUI-8 -- On-screen keyboard for pad text (M, S1/S2)
**Needs:** FUI-2. **Closes:** PAD-3.
**Files:** new `shared/osk/{grammar,view}.ts` extracted from `console/grammar.ts:95-111, :1185-1192` (the console
keeps importing it); page.ts `askText` :560-584; `forge/pad.ts` (input source); tests `test/osk.test.ts`; e2e
`forgeLobby*.spec.ts` (password by pad).
**Interfaces:** `askText` opens the OSK when the opening press came from a pad (tracked like `menuByPointer`);
native field for touch and keys; Square delete, Triangle space, L2 shift, R2 Done, Circle cancel, as the console.
- [ ] RED: a pad names a save, renames it, names a lobby and enters a password with no keyboard (pad stub).
- [ ] GREEN: the console's OSK tests pass unchanged against the shared module; rendered pad run (5c).

### S1 polish

#### FUI-9 -- Save state, discard confirmation, base Apply (M, S1)
**Needs:** FUI-4. **Closes:** IA-3, IA-4. **Surface:** toolbar name field and chip, Saves card, START Saves row.
**Files:** page.ts (`newBtn` :3030, base Apply :3296-3310, `openLayout` :1744, name field :302-307), `forge/saves.ts`
(keptAside), `forge/savesPanel.ts:41-70, :147-152`, `forge/keys.ts` (Ctrl+S, dev builds); tests `test/forge/saves.test.ts`;
e2e `forgeSaves.spec.ts`.
**Interfaces:** `currentSave {id, hash}` compared with `recordOfLayout` on each edit; a save chip ("Saved as X",
"Unsaved · autosaved", "Lobby copy"); Save overwrites, Save as prompts; `confirmDiscard()` shared by New, Open and
base Apply, asked only when dirty; the outgoing autosave kept aside with "Undo: back to <name>". Pad path: a Save
row in the Saves section; the confirm is a FUI-2 danger card.
- [ ] RED: base Apply on a dirty layout asks and can be cancelled; Apply on a clean layout does not ask; the
  discarded layout is in Kept aside; the current row is marked.
- [ ] GREEN: the name field's tooltip names saves, file and lobby; rendered run (5c).

#### FUI-10 -- Modes, tools and objectives made legible (M, S1)
**Needs:** FUI-7. **Closes:** IA-5, IA-6, IA-10, IA-11, IA-15, VP-3, UX-11 (now), UX-14 (registry, S3 at the latest).
**Surface:** toolbar, Settings and View panels, a new "Mode & objectives" panel, the outliner, the inspector's
map-prop and NPC sections.
**Files:** page.ts (`playing` :742-744 renamed `walking`, `setPlaying` :2284-2288, `togglePlay` :2653, `sMode` :1304,
help :509-530, `modeBtns` :269-278, `settingsBody` :466-471, outliner filter :382-386 and `drawOutliner` :1202-1263,
`setMode` :1343, inspector :1145-1176), new `forge/tools.ts` (`ToolSpec` registry), `forge/panels/objectivesPanel.ts`,
forge.css:81-90, :374-376; tests `test/forge/tools.test.ts`; e2e `forgeEditor.spec.ts`, `forgeDemolition.spec.ts`.
**Interfaces:** one segmented Build/Walk/Play control, status BUILD/WALK/PLAY, Play during Walk ends the Walk;
`ToolSpec {id, label, icon, side?, keyHint, padHint, digitKey?, place}` generating `modeBtns`, `TOOLS`, the hints,
the pad L1/R1 cycle and `tool.set`'s enum; unique glyphs with A/B and S/T badges, selection as a bottom rule plus
aria-pressed, labels kept on Play, Walk, Check, Lobby and Saves at every width, rarer tools in an overflow;
"Mode & objectives" panel: game type at the top and a live checklist from `forgeTypeUnplayable` with Place buttons
that arm the tool, ready for FCW-13's ModeSpec rows; grid, turn and snap under "Editor (this browser)" in View;
Settings retitled "Map settings (saved with the layout)" with a disc reset; the map-prop inspector gets "Hide in
this layout" with eye icons and hidden rows a "Hidden map props (n)" group with Show; the NPC tool opens Characters
and picks the first; an Objectives outliner filter; rows focusable (tabindex, role=option). Pad path: FUI-3 rows for
the segmented control, the checklist and the hidden group.
- [ ] RED: Play while walking starts the match; the Spawn A glyph differs from the selection gold by the
  difference test; the outliner lists only objectives under the filter; a hidden prop shows again from the pad.
- [ ] GREEN: the Controls card is generated from `ToolSpec` and the legends; rendered at 1366 and 1440 px (5c).

#### FUI-11 -- Agent presence, approval and activity in the Forge (M, S1)
**Needs:** FUI-2, FUI-4, FUI-6. **Closes:** IA-8, PAD-9, VP-4, VP-5, AI-2..7, AI-10 (context), AI-11, AI-12 (cue),
AI-13, AI-14, AI-15 (dock); S1 FCW-02 UI; MC-12's stepper and controller focus.
**Surface:** the agent panel (re-registered through FUI-1, after Settings, collapsed), the status-bar chip, a
page-level approval card, the Play overlay, a pad Agent section.
**Files:** `agent/panel.ts`, `agent/panel.css`, `agent/install.ts`, `agent/connection.ts` (:88-103, :157-166,
:180-232, :411-430, :458-463, :720-727, :879-888), `agent/activity.ts` (FUI-4), `forge/agent/play.ts:70-153`,
`packages/forge-agent/src/sessions.ts:196-199`, page.ts (`agentStage` :3550-3561, camera ops :3705-3717); tests
`test/agent/*.test.ts`; e2e new `forgeAgentOnboarding.spec.ts` (shared with FCW-02).
**Interfaces:** the dock drops its frame and second title, uses the kit's buttons and state tokens, draws the code
in mono grouped from a look-alike-free alphabet with the time left; a 4-stage stepper (Add server, Authorize, Pair
this page, Connected) highlighting the failed stage; Allow disabled until one box is ticked, inspect unticked or
"required", labels and one-line consequences from the operations table with irreversible actions marked;
"Allowed: …" chips when connected; `state.reason` in every final state and "Pair again" on paused; typed activity
entries (merged reads, nested labels, codes as sentences, pre-dispatch refusals, about 50); the chip pulses and the
approval card opens on `approval` regardless of dock state, Decline focused first; the Play overlay chip reads
"Agent test · step 4/12 · Stop"; agent commits keep the person's selection, flash `is-agent-recent` rows, post a
receipt toast with Select and Undo, and camera ops offer "Back"; "Agent took a picture of the view"; staged files
marked usable here or test room only. Pad path: an Agent menu section (Status, Approve…, Decline, Copy
instructions, Disconnect) and the approval card walked by FUI-2.
- [ ] RED: an approval arriving with the dock collapsed, the docks hidden and during agent Play is answered from
  a pad stub; Allow with nothing ticked is disabled; the connected state lists the grants; SURFACE_DENIED shows a
  reason; `forge.edit` rows name the nested operation and count; a scenario's final outcome reaches the log.
- [ ] GREEN: MC-12's checks pass in the new spec; rendered run of every state with docks on, off and in Play (5c).

#### FUI-12 -- Touch targets and phone camera (S, S1)
**Needs:** FUI-7. **Closes:** PAD-13, VP-14; PAD-10 if the rendered pass confirms it.
**Files:** forge.css (a `(pointer: coarse)` block on `--fx-control-h`), `forge/lobby/lobby.css:138-150`; page.ts
`:2049-2052, :3452-3453` and `../touch` only if PAD-10 is confirmed; e2e `forgePhoneDock.spec.ts`.
- [ ] RED: on a coarse pointer tools, chips, outliner rows, Lock, the star, toggles and lobby buttons measure at
  least `--s2u-hit-min`; (if confirmed) a one-finger drag on empty viewport looks and the touch stick flies.
- [ ] GREEN: a phone-emulated e2e taps Lock and a row without mis-hits; the camera moves by touch (rendered, 5c).

#### FUI-13 -- Pad e2e helper and stable test hooks (S, S1)
**Needs:** FUI-2. **Closes:** PAD-14, UX-9.
**Files:** new `e2e/helpers/pad.ts` (a scripted `navigator.getGamepads` stub), new `e2e/forgePad.spec.ts`; the shell
stamps `data-forge-panel`, `data-forge-action`, `data-forge-card`; a lint test under `test/forge/hooks.test.ts`;
specs migrated one file at a time as their panel moves.
- [ ] RED: the spec walks every START row and opens and closes every card with Cross and Circle; it is red on
  today's Saves card.
- [ ] GREEN: new creator panels must add their row; the lint test refuses a class selector in a new creator spec.

### Per-sprint UI tasks (from the readers' uiNeeds)

#### FUI-14 -- Examples gallery (S, S1; with FCW-03a)
**Surface:** an "Examples" section above the named saves in the Saves card, "New from example" in New, a pad row.
**Files:** `forge/savesPanel.ts`, `creator/examples/` (FCW-03's manifest), page.ts via FUI-2's card.
**Interfaces:** s2u-slot rows with title, base, covered examples and a state (Ready, or Blocked with the reason,
`.is-error`); Open applies through `openLayout` as one undoable edit named in the toast. Pad path: "Start from an
example" row (←/→ cycles, the note shows the requirement, Cross opens, disabled when blocked).
- [ ] RED: a blocked example cannot be opened and says which archive or asset is missing; opening is one undo step.
- [ ] GREEN: the same list is MCP's catalogue; rendered (5c).

#### FUI-15 -- Asset badges, placement feedback and the Check row (M, S1; with FCW-04)
**Surface:** Assets dock rows and chips, the Place ghost and `fx-hint`, the Inspector, the Check modal.
**Files:** page.ts (`drawAssets` :1402-1430, chips :333-350, ghost :1824-1840, hint :480), `forge/favourites.ts:16`
(`AssetFilter` + `solid`), `forge/validate.ts` (`checkPlacement` kinds), `forge/hull.ts`.
**Interfaces:** a collision badge (solid / walk-top / visual) per row from `CreatorAssetSummary`; a Solid chip; the
ghost tinted by `checkPlacement` (normal / amber note / red refusal) with the first diagnostic in the hint; an
Inspector "Placement" row with Jump shared with the Check modal; the same diagnostics feed `forge.issues`. Pad
path: "Props shown" cycles All, Favourites, Solid; the Check row from FUI-5.
- [ ] RED: a visual-only prop shows its badge and refuses a walkable role in the hint; a floating placement is
  tinted before the click commits; the pad's centre placement shows the same hint.
- [ ] GREEN: Check groups the new kinds under count headings; rendered (5c).

#### FUI-16 -- Pack list, Packs panel and lobby refusal (L, S2; with FCW-05..08)
**Surface:** a Packs panel in the right dock (shell-registered), a START "Packs" entry (value "N on") with a pad
card, the test room mods panel as a view over the same list, a status cell "Packs: N on" / "Base game", the Check
modal for pack diagnostics, the Create lobby refusal.
**Files:** new `creator/packs/{packList,packsPanel}.ts`, `mods/panel.ts:95-207`, `agent/panel.ts:73-81` (staging
routes through the list), page.ts via FUI-1/3/4 seams, `forge/lobbyClient.ts`, e2e `creatorPacks.spec.ts`,
`mods.spec.ts` kept green.
**Interfaces:** one row per PackRef (kind icon, name, id@version, short hash, lifecycle chip with the word, slot
note "Replaces the current model pack" / "Only on MP51", diagnostics count) with Check, Turn on, Turn off, Test in
Play, Remove (s2u-dialog, No first, a recovery copy); "Recovered copies" on the Kept aside pattern; pack on/off
outside layout undo, said in the help line; agent pack actions in the row ("Turned on by your agent"); toasts
"Turned on <pack>", "<pack> could not start: rolled back (see Check)"; the loading veil "Applying <pack>…"; Play's
pre-launch check lists applied packs; Create lobby with a non-cosmetic pack shows the check row "Turn off <pack> to
open a lobby (H273)" with a Turn off action, and the lobby button's title says the same. Pad path: the START card
(d-pad selects, ←/→ toggles, Cross opens actions, Circle backs out).
- [ ] RED: a pad imports, checks, enables, disables and removes a pack; the test room and the Forge show the same
  state after a change in the other; the lobby refusal names the pack and H273; a skipped validation is not green.
- [ ] GREEN: the three old pack UIs are gone or views over the list; rendered two-surface run (5c).

#### FUI-17 -- Authored assets, content bases, readiness and actors (L, S3; with FCW-09..12)
**Surface:** palette "Imported" optgroup and badges; the base picker's "Your maps" group and the loading overlay with
stages and Cancel; the Check modal's experience chips (Play here, Lobby, Guards, later BR/Escort) with one row per
capability and a status chip "Ready: Play ✓ · Guards ✗"; an Inspector "Behaviour" section (Stand labelled as today's
default / Patrol, Profile, Edit route) with a `route` tool (Cross adds a waypoint at the reticle, Triangle deletes,
Circle exits, a numbered polyline) and nested waypoint rows in the outliner; an "Actor state (adaptation)" overlay
toggle, read-only, off by default, hidden in lobbies; an inspector section for pack pieces ("Pack foo@1.2 · Solid")
with "Open Packs"; missing rows "pack foo@1.2 not installed"; the lobby button and check row "Lobby: not available,
this layout uses pack content (H274)".
**Files:** `forge/panels/*` through the seams, `forge/tools.ts` (route), `forge/npcs.ts`, `forge/layout.ts`,
page.ts base select :256, :3976-3984 and loading :496-500 through FUI-1.
Pad path: the palette and Base rows unchanged; "NPC behaviour" row; the Check row cycles experiences; the overlay
toggle a View row.
- [ ] RED: a content map is chosen and cancelled mid-load keeping the current world; a route survives a deleted
  predecessor; the lobby refusal appears in three places; readiness rows are pad-walkable.
- [ ] GREEN: rendered run per experience (5c); the actor overlay matches `npcs()` state.

#### FUI-18 -- Custom modes in the picker, mode markers and mode HUD rows (L, S4; with FCW-13..16)
**Surface:** a "Custom" group in the Game type select (Paintball, Zombies, Battle royale, each greyed with its
readiness reason) with a "Mode rules" sub-section generated from ModeSpec parameter descriptors (SETTINGS_BOUNDS
steps, the DS roller for enums) and a matching pad page; one "Mode markers" tool with a "Mode" chip listing the
active ModeSpec's marker kinds, a Mode outliner filter and a count; a Modded badge in the toolbar; an "Event" panel
(track with "Add music…", label, "missing: add your own", a bounded cue list, Play/Pause/Stop; NPC Role and Clip
rollers with incompatible clips greyed); the zombies shop prompt on the match's action button (`□ Buy M4 · 1,500`),
a funds line and a refusal line in the zombies HUD, "Restart waves" in the pad menu; BR Seed with Reroll, a "Zone
preview" View toggle from the room's pure zone function, HUD zone timer and alive count; the status bar "PLAY ·
PAINTBALL · A 3 – B 2", "EVENT ▶ 0:42 / 3:00", "PLAY · BR · seed 1234 · phase 2/4 · 5 alive"; Create lobby disabled
with "Custom modes play in private Play until match requirements land (H273/H274)" on the tooltip and the pad row.
**Files:** `forge/panels/settingsPanel.ts` rows from `creator-contracts/src/modes/*`, `forge/tools.ts`,
`creator/events/*`, `zombies/hud.ts`, `matchMount.ts:721` (caption), page.ts through the seams.
Pad path: "Mode rules ›" page; mode start, stop and reset rows; the event transport rows.
- [ ] RED: a pad selects a mode, sets a parameter, plays, reads the state and undoes with no keyboard (one e2e per
  mode); a mode layout cannot create a lobby; autoplay denial shows "press ✕ to start the music".
- [ ] GREEN: the picker takes a fourth mode with no page.ts edit; rendered (5c).
- The rules half (FCW-32 step 4, FUI.R23, 2026-10-27; "ModeSpec" here is a rules pack's `RulesSpec` since #532), written
  pending 91's run and review: the Game type select's Custom group from `forgeModeChoices` (a mode Play cannot run
  greyed with its reason), the "Mode rules" as the right dock's Rules panel (its configuration from the `config`
  descriptors -- the stepper, the switch, the select -- and the menu's Rules section's rows for the pad), the mode's
  markers as zones, markers and spawners placed from the panel, drawn in the editor only and listed in the Outliner
  (filter Rules), "PLAY · <mode name>" in Play, and Create lobby refused with H273/H274's words on its tooltip and pad
  row. Not this step: the Event panel, the zombies shop and HUD, BR's seed and zone preview, the Modded badge, the
  status's live score and phase.

#### FUI-19 -- Requirements, join refusal and online state (M, S5; with FCW-17..19)
**Surface:** the Game type option's second reason line "Private Play only: this server does not load <pack>"; a
"Requirements" block in the Create lobby card (per PackRef: name, version, short hash, side, policy, the server's
answer Runs here / Not on this server / Wrong version) and a bounded plain-text "Setup notes" field; a requirements
card on join (Have / Missing / Wrong version / Refused here, the host's notes as text, "Open packs" pre-selecting the
missing refs, "Try again", "Back"); the console's Custom matches rows "Modded · <mode> · Needs N packs" with a pack
icon; the lobby window's mode label, a "Requirements" control and a host "notes" card, `LOBBY_CONTROLS` made
data-driven; the agent dock state "Off for online play" with Copy setup disabled and a typed reason on
SURFACE_DENIED; `sMode` "Lobby · <mode> · Rejoined (wave 3)" and "Host passed to <name>"; a read-only "Round result"
card labelled "Custom game: not counted". Words fixed: Modded, Needs X vN, Compatible, Not compatible; never
verified, secure, anti-cheat (a label-table test).
**Files:** page.ts :2911-2941, :2944-3003 through FUI-2 cards; `console/render/lobbies.ts:56-70`;
`forge/lobby/lobbyView.ts:80-84, :327-348`; `forge/lobbyPage.ts:39-55`; `agent/panel.ts`.
Pad path: all cards walked by FUI-2; a "Requirements" row in `lobbyMenuItems`.
- [ ] RED: a join refusal is actionable from a pad; the notes render with textContent and no link; the console row
  and the Forge card come from one `requirementsGap()`.
- [ ] GREEN: two-client rendered run under `tools/local-stack.ts --split` (5c), recorded as skipped without data.

#### FUI-20 -- Missions and campaigns authoring (L, S6; with FCW-20..23)
**Surface:** a "Mission" dock panel (name, on/off, goals as an s2u-list--check with "after: goal X" and the trigger
summary, rows link to their actor; read-only in FCW-20, editable in FCW-23); a "Forge mission" corner card over
Play outside the HUD with the current goals and, at the end, success or failure with Restart and Back; mission
issues in the Check modal with Jump/Select on stable IDs and "· mission: N goals, K issues" in the counts; Hostage
(an ActorSpec role) and Zone (a region with radius) tools through the `ToolSpec` registry, objective tools folded
into one rail button with a popover on narrow toolbars; a per-kind "Properties" inspector section (role, radius,
"completes goal"); the lobby popup's mission line and seats refusal ("Needs 2 players on SEALs"); a Campaigns card
modelled on savesCard (s2u-slot rows: title, version, hash state, current mission, retained outcomes; Resume,
Restart, Export, Delete; a kept-aside section; Import); the mission-end card ("Outcome: hostage rescued → next: B";
Continue, Save & quit, Retry; shown only after a successful commit); a pad mission editor as a MenuItem page stack
(Goals: add, remove, reorder; each goal: trigger roller, target by crosshair, Mandatory); a list-based campaign graph
(one row per mission, per outcome a "then →" roller) with its own History and inline errors; activity rows naming
the stable ID with a Show action; Objectives and Mission outliner entries from the marker-kind registry.
**Files:** `forge/panels/{mission,campaigns}Panel.ts`, `forge/tools.ts`, `forge/savesPanel.ts` pattern,
`forge/lobby/lobbyView.ts:38, :161`, `forge/match.ts:41-42`, `agent/panel.ts:12`, the `workspace` dock from FUI-1
for the editors.
Pad path: the Mission and Campaigns menu sections and page stacks; the corner card dismissed by a pad chord.
- [ ] RED: a goal re-targets after a renumbering delete; the corner card never changes the game's HUD (a DOM
  test); a release-build pad adds, reorders and links goals; the campaign graph refuses a cycle inline and in
  Check.
- [ ] GREEN: rendered desktop and phone runs of both editors (5c); the agent half headless through the facade.

#### FUI-21 -- Graphics, water and jobs surfaces (M, S7; with FCW-24..29)
**Surface:** the fps cell's title with the adapter name and a "software" marker; a read-only "Graphics" group in
View and the pad menu ("Renderer: WebGPU / WebGL2 (fallback)", "Ocean: supported / not supported: <reason>"); a
"Water" heading ("Ocean: On/Off", bounded parameter rows, an "Original water" chip mirroring fogReset); a Check note
"Water: N surfaces matched / none on this base / refused: <diagnostic>"; the packs panel system-pack row with
"Restore original"; the toast "Ocean needs WebGPU: showing the original water" and the status cell "ocean off"; a
lobby line "visual pack: ocean (optional)", never a refusal; a "Report" card shaped like the Check card with one
section per evidence kind, status against tolerance, the reference id with provenance, no aggregate percentage and
no green for skipped or blocked; a "Jobs" dock panel shown only when a runner is paired (state chip, attempt count,
checkpoint time, Cancel through the modal, Resubmit, each row opening the Report card), a pad "Jobs" heading with the
five most recent, a "Local runner" section in the agent dock with its own consent and revoke, and a status cell
"runner: idle / 2 queued / interrupted / lock held"; `creator-runner status` prints the same JobState words.
**Files:** page.ts :493-494, :128-142, :393-404 through the seams; `experimentalGraphics.ts:324-337` (the same
line); `forge/panels/{jobs,report}Panel.ts`; `agent/panel.ts`.
Pad path: the Graphics, Water and Jobs sections; the Report card walked by FUI-2.
- [ ] RED: the ocean row is disabled with its reason on WebGL2; revoking the page grant does not cancel runner
  jobs and the reverse holds; a skipped reference line never carries the ready token.
- [ ] GREEN: a native-GPU rendered run recorded separately from the SwiftShader e2e (5c); nothing shown in a
  release build without a configured runner.

## 5. The standing review pass per completed sprint

Each FCW sprint, once its lane PR head is published, goes through the five items below in order. Nothing from this
pass lands on `main` without the controller's checks of `web-close` 4.3, and nothing that changes the rules or the
layout (AGENTS.md, MISSION rulings, the plan's rulings, the design system's grammar) lands without the owner's word
said in the seat (AGENTS.md "Boundaries").

**(a) This workflow: the plan and UI lenses re-run against the sprint's PR head.** The controller's seat dispatches
the same set as this review: one plan reader per sprint touched (scope, standards, evidence, dependency,
extensibility, ui-expressiveness) plus the architecture reader, and the five UI lenses (information architecture,
controller and pad, visual polish, agent integration, UI extensibility) with a skeptic that re-reads every UI
finding at the source and marks it confirmed, refuted or unverifiable-static. Input: the PR head, the plan's Log,
this spec's open rows. Output: a dated section appended to this spec (or a successor spec for the sprint), each
finding `id, severity, claim, citation, impact, proposal, size, sprint`, refuted findings withdrawn with the
skeptic's note, and the plan's Log entry. It runs by source inspection and says so; it never claims a rendered
result.

**(b) The standards and correctness pass with a fix worktree.** As run on #498: fresh reviewers who did not write
the sprint (the other developer's agent where possible, AGENTS.md "How to work" 8) read the diff for correctness,
the parity rule's labelling of adaptations, hot-file claims, evidence kinds kept apart, and the leak rules. Accepted
findings are grouped into fix groups; an implementer takes them in a script-made fix worktree (`agent/<lane>-fix-NN`)
with a reproducer per accepted finding; a reviewer distinct from the fixer re-reads the fixes at the source; the
documents (plan Log, HANDOFF claims, HUMAN_TASKS rows) are updated in the same worktree. Output: the review verdict
(PASS, PASS WITH FINDINGS, FAIL) on the final head, the fix-group list with commit hashes, and the fresh reviewer's
verdict on the fixes recorded in the Log before any dependent task opens (the FCW-01 finding, 2.1).

**(c) The rendered pass under web-gate.** The controller runs `web-gate` on the sprint head with `--e2e` (or
`--e2e-per-file`) under the host rule (the lock read with `check`, serial per host, nothing beside a gate), covering
every `forge*.spec.ts`, the pad spec (FUI-13) and the two-client split config where S5+ is in scope, plus a screenshot
set of every Forge panel, card and menu page at 1920, 1440, 1280 and 390 px, with docks on, off and in Play, and with
a pad stub connected. The set is stored under the lane's evidence folder and linked from the Log. Each UI finding
marked "rendered" in 3.2 and each row of 3.4 is checked against the set and moved to confirmed, refuted or still
open. Output: the gate record and the screenshot index; a run without game data or without a browser is recorded as
skipped, never as a pass.

**(d) The gate record with data and `--no-data`.** The controller runs `bash workflow/gate.sh` twice on the same
head: once with `SOCOM_PC_ROOT`, `SOCOM_DISC` and `SOCOM_ISO` set in the same shell command, once with `--no-data`.
Both records (tree hash, each step's result, tests passed, failed and skipped, prerequisites present, steps not run)
are quoted in the PR and the plan's Log as printed; no number is copied from an earlier run. Reds are compared
against the same base on `main`, by family; a historical red is named, never waived silently.

**(e) The batch review before the lane PR.** On the product track one fresh review covers the sprint's batch
(OT.R53): the reviewer reads the lane's whole diff against `origin/main`, the Log entries since the last landing, the
claims released in HANDOFF §3, and the outputs of (a)-(d), and gives PASS or PASS WITH FINDINGS with the findings as
rows. Any part found to touch the game's behaviour is named and moved to the simulation track with its own fresh
review before the PR opens. Output: the review in the PR description with the gate records, the evidence kinds kept
apart, skipped runs listed, and the open owner calls; the owner's Claude controller lands it after `web-close` 4.3
when nothing in it is the owner's to decide.

## 6. Owner calls

Matters of taste or scope only Craig can settle. None is added to `HUMAN_TASKS.md` by this review; the controller
files the rows he confirms. Each names the default followed meanwhile.

- **Dock layout direction.** Keep the right dock a stacked column of collapsible panels (today's shape, FUI-1 adds
  order and remembered state), or move to icon tabs (Edit / World / Content / Agent) once more than five panels
  register, with a full-viewport `workspace` for the mission and campaign editors. Default: stacked until five
  panels, then tabs, workspace for editors; FUI-1 builds both slots.
- **The agent dock as a release feature.** It mounts in every build today (`pageEntry.ts:110-115`). Ship "Connect
  your agent" in release with a controller route (FUI-11), or gate it to development builds like the keyboard look
  (OT.R29/OT.R38). Default: release, pad-reachable, because OT.R52 binds whatever ships.
- **Pad legend style.** The design system's SVG glyphs with the red Circle (`shared/ds/README.md:553-562`) in a
  `.s2u-prompts` strip at the status bar, or keep text glyphs in the hint line. Default: the system's glyphs
  (FUI-3), the hint line retired.
- **Palette move.** FUI-7 re-points the Forge's grey-teal `--fx-*` colours onto the system's teal tokens; the Forge
  will look like the launcher and the overlay. Approve on a before/after screenshot sheet from pass 5c, or keep the
  current hues as named tokens. Default: the system's tokens, screenshots before merge.
- **Save semantics.** FUI-9 adds Save (overwrite the current named save, Ctrl+S in dev builds, a START row) beside
  Save as, and asks before discarding only when dirty. Default: as proposed.
- **Mode names.** Build / Walk / Play as the three words everywhere (FUI-10), renaming the code's `playing`.
  Default: as proposed.
- **FUI authorization and sequencing.** The eight infrastructure tasks (about 5 M + 2 L + 1 M, roughly 29 points) sit
  before FCW-08; FUI-2, FUI-5 and FUI-7 before FCW-03/04's UI. This delays S2 by roughly one sprint. Default: the
  work is proposed only; nothing is dispatched until the word is given; the S1 Codex tasks proceed with their UI
  acceptance lines added.
- **Phone camera scope.** If pass 5c confirms PAD-10, mount the match's touch stick in the editor (FUI-12) or state
  that the phone layout is for viewing and joining only. Default: mount it.
- **FCW-27..29 re-filed under PH-F1.** The jobs half of S7 waits on PH-F1's milestone (H277, PH.R12). Default:
  planned/blocked.
- **H274 and recipe-carried modes.** Is a recipe that selects engine-owned handlers with authored parameters still
  "the Forge recipe" under H274's default, so S5a can go online on retail bases? Default: no; S5 stays blocked
  until answered.
- **OT.R70 and zombies in Forge loopback.** Does a private Forge loopback count as a "normal match" OT.R70 refuses?
  Default: the controller's reading that it does not, recorded in the Log; online co-op waits for the word.
- **A native WebGPU device and session** for FCW-24/26 and the ocean's rendered evidence. Default: blocked; nothing
  claimed from SwiftShader.
- **FUI-2's smallest fix now.** PAD-1 (a pad cannot leave Saves) is blocking in a release input path. Land the
  two-line fix (Circle and START close the card) on the S1 lane ahead of FUI-2, or wait for the stack. Default:
  land the small fix in S1 with its e2e.

### 6.1 Decided (2026-10-24T21:41Z)

The owner, in the seat, after reading the calls above: "I trust your judgement based on the project standards and
our vision." The controller decides each call on that word, records it here (AGENTS.md "How to work" 9; the
owner can overturn any of them), and files no HUMAN_TASKS row for them. An open owner row (H274, H277) is not
overridden by a ruling here.

- **FUI.R1 -- the UI workstream is authorized.** FUI-1..8 precede FCW-08, FCW-23 and FCW-29; FUI-2, FUI-5 and
  FUI-7 precede FCW-03 and FCW-04's UI; FUI-9..13 land in S1. S2 moves back by about one sprint. The S1 Codex
  tasks (FCW-02/03/04) proceed now with the UI acceptance line of section 4 added to each. Implementation runs in
  a script-made worktree (`agent/forge-ui`, off `agent/forge-creator-s1` with `agent/forge-mcp-fixes` merged in so
  the page's agent seams are current), one writer, page.ts claimed in HANDOFF §3 for FUI-1..3; each task gets a
  fresh review; the batch gets the pass of section 5 before its PR.
- **FUI.R2 -- PAD-1 first.** The Saves card's pad exit (Circle and START close it, Esc as today) is the first
  commit of that worktree, with its e2e, ahead of FUI-2's stack.
- **FUI.R3 -- the agent dock ships in release, pad-reachable** (OT.R52 binds whatever ships); FUI-11 gives it its
  pad route and badge. It is never development-only.
- **FUI.R4 -- the palette moves onto the design system's tokens** (FUI-7): every `--fx-*` colour an alias of a
  `--s2u-*` token; the before/after screenshot sheet from the rendered pass (5c) is attached to the PR before merge.
- **FUI.R5 -- dock layout:** stacked collapsible panels until five register, then icon tabs; a full-viewport
  `workspace` dock for the mission and campaign editors; FUI-1 builds both slots.
- **FUI.R6 -- pad legend:** the design system's SVG glyphs with the red Circle in a `.s2u-prompts` strip at the
  status bar; the hint line retired (FUI-3).
- **FUI.R7 -- save semantics** as FUI-9 proposes: Save overwrites the current named save (Ctrl+S in development
  builds, a START row), Save as beside it, a discard question only when dirty.
- **FUI.R8 -- mode names:** Build, Walk, Play everywhere (FUI-10); the code's `playing` renamed to `walking`.
- **FUI.R9 -- phone camera:** if the rendered pass confirms PAD-10, the match's touch stick is mounted in the editor
  (FUI-12); the phone layout is not declared view-only.
- **FUI.R10 -- FCW-27..29 are re-filed as PH-F1's slice** and stay planned/blocked until H277's milestone; no job
  runner, schedule or host is created meanwhile.
- **FUI.R11 -- H274 stands as the owner's row:** a recipe that selects engine-owned handlers is NOT treated as "the
  Forge recipe" for online play; S5 stays blocked until H274 is answered in its own row.
- **FUI.R12 -- OT.R70 reading:** a private Forge loopback match is not a "normal match" OT.R70 refuses; the zombies
  prototype may run there offline (FCW-15) once packaged; online co-op waits for the owner's word with H274.
- **FUI.R13 -- a native WebGPU device** is a prerequisite for FCW-24/26's evidence; nothing is claimed from
  SwiftShader; the task is blocked until the owner names a device and a session.
- **FUI.R14 -- the plan revisions the review asks for** (sections 2.1-2.8: record v3's owner, the registry and
  diagnostics built once beside #498, precise lobby refusal with pack or mode content, owner rows per task, the
  splits of FCW-03/07/12/15/23) are owed by the planning seat on `agent/forge-creator-plan` before S2 opens; S1
  continues.
