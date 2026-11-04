# Forge creator vision -- implementation alignment and scope

Written 2026-10-24 against `origin/main` `c9a4b60743233328661575b465e5f087a35c62f3`.
Planning only. [Delivery plan](../plans/2026-10-24-forge-creator-wishlist.md).

## Source and interpretation

Craig asked in this seat to compare [his creator vision](https://legacy-forge-creator-vision-20261024.rightsquid20.chatgpt.site/#1)
with the implementation and plan the full wishlist. The signed-in presentation and its twenty-example capability
appendix were read on October 24, 2026; Sites reported publication version 4. Its own source basis is draft PR #498
at `b66145404ecc2eef74b702e0a1be36dc21148194`. The later documentation-only head is
`7d6cf4eda5a8b0659c834bc446cbe331ad4c503f`. PR #498 is open and unmerged; Craig says Claude is reviewing it.
That review's separate working tree has unpublished changes and is not treated here as shipped or accepted code.

The first ten examples describe available draft building blocks, not ten completed acceptance demonstrations.
The remaining ten describe future experiences. Supplied screenshots/video and generated concept art are references,
not evidence that their systems have shipped. This assessment does not change the presentation or publish a site.

## Answer

The architecture supports this direction. The live MCP bridge supplies a useful creator control surface; it does
not supply a general extension engine, arbitrary new collision assets, a custom mode runtime, campaign authoring,
or durable overnight execution. Those are the substantial remaining layers. No fundamental impossibility was
found, but WebGPU integration, map eligibility and content availability need measured feasibility work. Online
community simulation content and public infrastructure also have unresolved owner decisions.

The recommended route is to finish the current creator loop, implement the existing XT shared-pack contracts,
and expose the reusable game systems through them. Do not build an MCP-only content format or a second zombies,
navigation, hostage, validation or capture engine. The complete wishlist is a programme of seven bounded sprints,
not one ordinary sprint. The plan maps every example to a closing task.

## What is already there

These are source-inspection findings unless the evidence column explicitly names a measured run.

| Foundation | Repository evidence | Meaning and limit |
|---|---|---|
| Live creator control | PR #498 `viewer/src/agent/{connection,forgeTarget,testroomTarget}.ts`, `forge/agent/{api,commands,play}.ts`; [operating evidence](https://github.com/Scotho/redotcom/blob/7d6cf4eda5a8b0659c834bc446cbe331ad4c503f/socomlegacy/docs/specs/2026-10-24-forge-agent-compatibility.md) | Guest login, page approval, native WebRTC, real edits/undo/receipts, canvas capture and bounded private normal input exist in the draft. Actual CLI OAuth login passed; full actual-client tool/image/reconnect onboarding remains unmeasured. |
| Layouts and existing props | `viewer/src/forge/{layout,record,page,validate}.ts`; draft `forge/agent/commands.ts` | Existing assets can be placed/transformed, base placement keys hidden/restored, spawns/NPCs/objectives authored and recipes saved. Hiding a separate placement removes its drawing/hull; it cannot promise arbitrary surgery on inseparable map geometry. |
| Atmosphere and room settings | `forge/layout.ts:LayoutSettings`, `forge/page.ts`, draft `settings.set` | Static brightness scale, fog distance and existing round/player/friendly-fire settings. Not dynamic weather or a new time-of-day lighting engine. |
| Existing local packs | `viewer/src/mods/{manifest,store,readPackage}.ts`, `modelPack{,Runtime}.ts`, `texturePack{,Store,Runtime}.ts`; draft `agent/localPacks.ts` | Existing formats and stores, with local file approval and distinct stored/enabled/applied states. Forge map import means recipe import; model replacement is not a collidable prop import. |
| Forge targets | `viewer/src/forge/npcs.ts:ForgeNpcs`, `forge/match.ts` | Stationary hostile targets turn/fire/reload/die through the private match. They are not creator-authored patrol guards. |
| Moving authored bots | `match/src/bots/{matchBots,navigation,sounds,botPlan}.ts` | Navigation, patrol/investigation/search states, sound reactions and contact memory already exist for authored multiplayer practice bots. Reuse candidates, not proof that Forge markers can configure them or that they reproduce retail campaign AI. |
| Local zombie prototype | `viewer/src/zombies/{mode,navigation,melee,spawns,crowd,pack}.ts` | A Crossroads-only, outside-match prototype already has chase, melee and waves. Its source explicitly excludes a shop/perks/economy. It is not a generic behaviour pack or network-authoritative co-op mode. |
| Hostage movement | `match/src/{hostageFollow,hostageActors,hostageAvoidance}.ts` and existing tests | Escort/pathing work can be reused. A custom mission graph, authored hostage roles and campaign outcomes are additional work. |
| Renderer foundation | `viewer/src/renderer.ts:createRenderer`, `ViewerRenderer`, `adapterWait.ts`, `experimentalRenderer.test.ts` | Already uses Three.js WebGPURenderer with backend reporting and a bounded WebGL2 fallback. Reuse that backend; a water extension and native-GPU acceptance are still missing. |
| Test evidence | `tools/{captureScore,captureRun,captureRefs,parityRegistry,console-compare}.ts` | Existing capture/reference tooling should back the job runner. A generic compatibility pass is not console parity. Reference prerequisites may be absent. |

Paths in that table are relative to `socomlegacy/packages/` unless prefixed `tools/`. Draft-only paths require PR #498.
The full data and no-data gates at `b66145404` were RED. The focused browser run was 29 passed / 3 failed / 1 skipped;
the three selected cases also failed on the exact base source, with the loading case failing at a later assertion.
These records remain failures, not release clearance. The previous plan's Log owns exact counts and limitations.

## All twenty examples

C1-C10 follow the appendix's current-draft order; F1-F10 follow its future-concept order. "Conditional" means the
API building blocks exist, but suitable local data and an actual end-to-end run are still needed.

| Example | Alignment now | Remaining acceptance / support | Closing tasks |
|---|---|---|---|
| C1 -- campaign-room arena layout | Conditional: cover/spawns/private Play. Paintball gameplay is absent. | Play a saved Stranglehold arena; add genuine paintball rules separately. | FCW-03, FCW-13 |
| C2 -- rearrange cover | Draft transforms and hide/restore exist. | Verify drawing AND collision restoration; diagnose inseparable geometry. | FCW-03, FCW-04 |
| C3 -- stacked-crate structure | Existing instances can be arranged. Exact scene untested. | Asset bounds/hulls, route/clearance check, playable saved recipe and undo. | FCW-03, FCW-04 |
| C4 -- tree-filled Frostfire | Conditional on suitable catalogue trees. | Find an actual suitable asset or report its absence; collidable imported trees need the new content path. | FCW-03, FCW-04, FCW-09 |
| C5 -- personal firing range | Static hostile markers and private Play exist. | Reproducible near/middle/far targets and editable cover; actual normal-input damage/readback. | FCW-03 |
| C6 -- Demolition rehearsal | Native authored-layout pickup/plant passed. | Complete an actual Crossroads navigation/pickup/plant route without Play teleport; save evidence. | FCW-03 |
| C7 -- static atmosphere/settings | Brightness/fog/round settings exist. | Save/reload/undo/readback plus Build/Play guard acceptance; no weather claim. | FCW-03 |
| C8 -- preserve work and inspect it | Saves/undo/capture exist. | Actual-client edit/undo/retry/readback/capture and migration acceptance. | FCW-01, FCW-02, FCW-03 |
| C9 -- private rehearsal | Draft normal-input scenarios exist. | Prove cancellation/input release and the real client workflow; retain 32-step/60-simulation-second/30-wall-second bounds. | FCW-01, FCW-02 |
| C10 -- existing local visual packs | Legacy pack loaders and solo Build drivers exist. | Full client/store/apply/uninstall acceptance; migrate through shared contracts without losing legacy data. | FCW-02, FCW-06, FCW-08 |
| F1 -- music/dance event with a hostage DJ | Reference captures; not a creator-ready mode. | Noncombat actor roles, compatible animations, local audio, event timeline, pause/stop/cleanup. | FCW-14 |
| F2 -- campaign-space battle royale | No reusable BR mode established. | Eligible map, seeded spawns/loot, authoritative shrinking zone/damage/winner, matching visual boundary. | FCW-11, FCW-16, FCW-17..19 |
| F3 -- zombie waves with purchases | Reusable local chase/melee/wave prototype; no shop. | Pack migration, mode lifecycle, authoritative economy/shop and co-op. | FCW-07, FCW-15, FCW-17..19 |
| F4 -- investigating guards | Reusable authored bot navigation/senses/memory; static Forge NPCs differ. | Creator profiles, patrol routes, stimuli/memory readback, correct collision and new-map navigation. | FCW-11, FCW-12 |
| F5 -- new Blender prop with collision | Visual model replacement is insufficient. | Shared asset IDs, units, collision payload, client/server compilation, palette/undo/save lifecycle. | FCW-05..09 |
| F6 -- completely authored map | Current Forge recipe overlays are not arbitrary map loading. | Versioned map definition, render/collision/nav/objective data, client and server loaders and eligibility checks. | FCW-07, FCW-10, FCW-11, FCW-17..19 |
| F7 -- WebGPU Frostfire ocean | Existing WebGPU-capable renderer; supplied ocean demo is not an installed extension. | Measure actual backend support, add water/render lifecycle hooks, then an ocean pack and cleanup/fallback. | FCW-07, FCW-24..26 |
| F8 -- authored missions and campaigns | Existing escorts/objectives are ingredients, not campaign authoring. | Goals/triggers/mission outcome graph, co-op escort demo, mission sequencing, versioned saved progression and editor/MCP support. | FCW-12, FCW-17..23 |
| F9 -- pack-based games with friends | Current private loopback Play is not this feature. | Hash/version/side requirements, trusted server gameplay bytes, precise join refusal and multiplayer authority. | FCW-17..19 |
| F10 -- unattended reference checks | Existing short page scenarios and capture harness are ingredients. | Persistent local jobs, isolated owned targets, checkpoint/restart/cancel, reference-aware scoring and dashboard. | FCW-27..29 |

## Design choices for the plan

- Reuse [the XT plan](../plans/2026-10-22-extensibility.md) as the canonical pack/extension work. FCW tasks are
  delivery slices of it plus the newly scoped experiences; they do not create competing implementations.
- Preserve the original with extensions off. New modes are explicitly authored experiences, never retail parity
  claims. Work touching original simulation paths moves to the simulation track and its source/review process.
- Keep runtime implementations engine-owned and reviewed. Pack-supplied data selects typed registered handlers;
  no uploaded JavaScript, shell or arbitrary execution. H272 is the existing decision if this proves insufficient.
- Keep all current MCP Build/Play/live-network restrictions. Friends may play declared custom experiences;
  that does not authorize an agent to control server-backed matches (H286).
- Keep payloads and preferences local. No project hosting of texture-pack payloads, including original-authored
  textures; no project distribution of disc-derived payloads. Friends obtain/install their own required packs.
  Central stores metadata; trusted simulation content on servers waits on H274. Hash claims are compatibility
  evidence, not proof that a client is honest.
- Proposed custom campaign progression starts in device-local, versioned storage with explicit export/import.
  Cloud saves, retail campaign restoration and a public campaign marketplace are not implied.
- Overnight jobs run on an explicitly configured, owner-provided local runner with durable records. They get fresh
  isolated test targets, not a longer-lived grant to a creator's existing tab. Hosted execution/spend is not inferred.
- The ocean is a visual system replacement. New swimming/buoyancy/wave damage are additional simulation scope.
  The renderer already uses `WebGPURenderer`; add extension hooks rather than rebuild that backend. Verify actual
  WebGPU separately from WebGL2 fallback, then measure water depth/compositing and disposal. The
  [Three.js renderer documentation](https://threejs.org/docs/pages/WebGPURenderer.html) describes backend selection.
  Source support is not an executed ocean/performance result; a WebGL effect cannot close a WebGPU task.

## Success and limits

A finished programme demonstrates all twenty rows using saved, versioned recipes/packs and repeatable fixtures.
Every new tool declares capability/permission/surface, reports structured failures, supports cancellation and
restores vanilla state on disable. Public availability needs its own owner-authorized deployment and measurements.

Current inference: the first ten are chiefly hardening, discoverability and fixture acceptance. The remaining ten
range from adapting substantial existing prototypes to building new cross-cutting systems. The ocean integration,
mission/campaign model and durable execution are the largest uncertainties. Sprint estimates are scope estimates,
not dates or a claim that the whole wishlist is already possible through today's MCP tools.
