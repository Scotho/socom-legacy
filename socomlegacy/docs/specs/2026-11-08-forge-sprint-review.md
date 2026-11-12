# The paused Forge sprint -- the verdict and the re-cut plan (FP-10)

> **Carried 2026-11-11** from `agent/fp-10` `2d54217678` (PR #755, closed as superseded by PR #787) into
> `agent/forge-v4`, so the review stands beside the plan that followed it,
> [`plans/2026-11-11-forge-export-sprint.md`](../plans/2026-11-11-forge-export-sprint.md). The pack-format proposal it
> was cut beside is [`2026-11-08-pack-format-0.2.md`](2026-11-08-pack-format-0.2.md), itself superseded. The owner
> rows drafted in this document carry links written relative to `docs/` (as they would sit in `HUMAN_TASKS.md`), so
> they do not resolve from `specs/`.

> Written 2026-11-08T15:55Z on `agent/fp-10`, cut from `agent/fp-8` at `15211f435`. That tree carries Crispy's import
> (`agent/forge-crispy` at `c09254ae8`, brought in through `agent/v0416`, `ba3f305d1`), the Mods loader (`agent/mods`,
> PR #729) and FP-4's contract (`agent/fp-4` `c7cfdcb1d`, PR #746: engine contract `0.1.2`, the bundle validator).
> FP-5 and FP-6 are not in this tree. They are cited at `agent/fp-6` `bbe1217f8` as `<path>@bbe1217f8:<line>`. Row FP-10
> of [the Forge path plan](../plans/2026-11-07-forge-path.md) (`plans/2026-11-07-forge-path.md:67`). Design:
> [section 2's survey and the FP-10 row](2026-11-07-forge-path-design.md) (`:119-126`, row FP-10).
> The owner's question (2026-11-07, seat redotcom-ab, `agent-mail/OWNER-WORDS.md` "the Forge path brief"): "a full review
> of our paused forge sprint and whether the plan holds up to our ambitions, if any forward thinking suggestions should
> be taken before the pack sees wide use".
> **Documents only. The workflow and the port's own creator tools are product track (OT.R53).** This document changes no
> plan, row, LATER line, HUMAN_TASKS row or code. Rows marked **sim** below would change what a round does: each one names
> the reading it needs before it is built, and a row like that takes the whole process. Short citation keys:
> **W** = `plans/2026-10-24-forge-creator-wishlist.md`; **D** = `specs/2026-11-07-forge-path-design.md`; **P** =
> `plans/2026-11-07-forge-path.md`; **F8** = `specs/2026-11-08-pack-format-0.2.md`; **H3** =
> `agent-mail/evidence/forge-path/fp-3-later-proposals.md` (the FP-3 harvest, LATER 761-765 proposed, not filed at this
> head); **SC** = `agent-mail/evidence/forge-scope-by-phase-2026-10-27.md`. PR merges are cited as `#N` with their merge
> commit.

## For the owner, in one paragraph

**The paused sprint delivered its platform. It did not deliver its showcase.** S1-S3 landed their engine halves in #520
(v0.2.0). S4a landed the rules contract, the room's rule host, authoring and the Thunderstore shape (#546, #555, #563,
#565). S4b proved the platform with two example modes, paintball and an independent capture-the-flag (#570). Four kinds
of work did not land:
- **acceptance runs**: real agent clients, playable starters;
- **the person- and agent-facing pack lifecycle**;
- **the authored-actor and mode examples**: guards, party, zombies, battle royale;
- **all of S5-S7**.

Two later events changed the plan's footing. Crispy's Overhaul made the Forge editor his (OT.R112), so every FUI task
is now his call, not ours. The Forge path made content packs apply and bundles import (FP-4..6). Rules packs still do
not apply: FCW-35 is half done.

**The plan holds up to your ambitions in its contract. It does not yet hold up in its loop.** A player can import a
custom map, but nobody can export one from the Forge. A creator can write a mode, but cannot ship it inside the bundle.
I would take four steps before the format sees wide use:
1. finish 0.1.2's additive fields;
2. add a Forge bundle writer;
3. make rules come from installed packs;
4. publish conformance fixtures.

I would keep S5-S7 parked. Three points below are yours (section 4.2); everything else is the controller's.

## 1. The verdict

### 1.1 What S1-S4 promised, and what landed

The promise of each sprint is the wishlist's own "Demonstration" cell (W:108-115). Each row says:
- **state**: delivered, partial, dropped, or superseded (by Crispy's Overhaul under OT.R112, by the Mods loader, or by a
  Forge path row);
- **evidence**: the PR and its merge commit, or the branch and sha, and the test that holds it.

The wishlist's own row states at the pause are W:142-146 (S1) and the batch-plan table W:847-859 (S2-S3). SC section 1
is the same survey compiled at the pause.

| sprint, promise (W) | task | state | evidence | what did not land, and why |
|---|---|---|---|---|
| **S1** "Real clients and saved, reproducible current examples; compact advanced Tools" (W:108) | FCW-01 settle #498 | delivered | #498 merged 2026-10-25, `ef4bb5e63` | -- |
| | FCW-02 real-client matrix | partial | the probe harness `tools/forge-agent-probe/` landed (H3, "Dropped"); W:143 "first actual-client execution failed" | the measured matrix of real clients was never run. It moves to FP-14's compatibility record (P row FP-14). |
| | FCW-03 starter experiences | partial | six recipes on `main` (`viewer/src/creator/examples/index.ts`; H3, "Dropped") | "actual saved/rendered/playable examples, Crossroads route" were owed at the pause (W:144). `agent/fcw-starter-apply` was never merged (SC 2.0). This is evidence owed, not scope (H3). |
| | FCW-04 asset catalogue | delivered (engine) | `viewer/src/creator/catalogue.ts:23` (H3); `viewer/test/creator/catalogue.test.ts` | the source/MCP demonstration run was owed (W:145) |
| | FCW-S1-UX compact Tools | superseded (OT.R112) | the menu lived only on #508's branch, closed under H426 (H3, "Dropped") | the toolbar is Crispy's |
| **S2** "Shared registry; tiny content/rules/system packs enable and fully disable" (W:109) | FCW-05 pack format | delivered | #520 `28dc4ed6a`; `creator-contracts/src/packs.ts`, `test/packs.test.ts`, `digest.test.ts` | F8 reviews it for 0.2 |
| | FCW-06 registry | delivered | #520; LATER 460 closed (W Log 2026-10-26T06:04Z); `viewer/test/packRegistry.test.ts`, `viewer/test/creatorRegistry.test.ts` | -- |
| | FCW-07a record v3 / 07b extension host | delivered (07b's step 4 cut) | `3e3a08047` (record v3, `creator-contracts/src/layout.ts`); 07b engine `857f717e0`, `511bf9ad1`, `b7e6e0d46` (W:851-852); tests `creator-contracts/test/layout.test.ts`, `viewer/test/forge/recordV3.test.ts` (07a), `viewer/test/packs/extensionHost.test.ts`, `viewer/test/forge/pageExtensionHost.test.ts` (07b) | 07b's `visualTint` step was cut on the owner's "cut 4" (W:852). The `system` kind is still "Planned" on the wiki (`kinds/index.mdx`, "`system`"). |
| | FCW-08 pack lifecycle in Forge/MCP | partial; human half superseded | no Packs panel on `main` or Crispy's branch (H3, row 762) | **human half:** the MODS screen (#729, ML-1..12; D:48-55 describes it) is the place a player manages packs; treating it as the one pack list is this review's reading, a controller's call (4.3). **agent half:** never built; proposed as LATER 762 (H3). |
| **S3** "Solid imported prop, custom map, investigating guard" (W:110) | FCW-09 solid authored prop | delivered (engine); resolver superseded by FP-5 | engine `30896f811`, `0e6af7718`, page wiring `dbfcd4331` (W:854); tests `viewer/test/packs/contentAssets.test.ts`, `viewer/test/forge/pageContent.test.ts` | there was no production resolver (`NO_CONTENT_SOURCE`, W:854). FP-5 supplies one: `viewer/src/pageEntry.ts@bbe1217f8:120-126`, PR #748, open. |
| | FCW-10 authored map | delivered (engine); open path superseded by FP-4..6 | `e684d224b`, `1718e05a4`, `0921f3e83`, `771527201` (W:855); tests `creator-contracts/test/maps.test.ts`, `viewer/test/packs/contentMap.test.ts`, `viewer/test/forge/pageContentBoot.test.ts` | before FP-5, every content-base layout was refused at open (D:82-90). FP-6's Custom Maps opens one (`agent/fp-6`, not yet a PR). |
| | FCW-11 readiness by experience | partial | `creator-contracts/src/readiness.ts`, `test/readiness.test.ts`; nothing imports it but its own test (H3, row 763) | the adapter, profiles and audit matrix were never built. Proposed as LATER 763 and 764 (H3). |
| | FCW-12 patrolling guards | dropped at the pause (not started) | only the actor base exists (`creator-contracts/src/actors.ts:1-5`, "FCW-12b builds guard profiles"); SC section 1 "FCW-12 guards not started" | it waited on FCW-11 and BOTS-LAND (W:857) |
| **S4a** "One public rules contract, the room's rule host, authoring/MCP, v2 import in Thunderstore's format" (W:111) | FCW-30 rules contract | delivered | #546 `01a916ef8`; `creator-contracts/src/rules.ts`, `test/rules.test.ts` | -- |
| | FCW-31 room rule host | partial | #555 `a485296b2`; `match/src/creator/rules/host.ts`; `match/test/creator/rulesHost.test.ts`, `rulesRetailParity.test.ts` | **parity:** the retail-parity proof covers the bullet path only (two cases, respawn and classic: `rulesRetailParity.test.ts:24-41`). The parity-paths branch `agent/fcw-31-parity-paths` holds no commit past its base `534769843`. **CTF primitives:** the three from FCW-34's finding (b) were never built (W:261-267). **kit gate:** never built (W:268-272). |
| | FCW-32 authoring + Rules panel | delivered | #555, #563 `cd02f3264`, #565 `826148b21`; tests `viewer/test/forge/pageRulesPanel.test.ts`, `viewer/test/forge/rulesAuthoring.test.ts`; the page's seam `viewer/src/forge/page.ts:3268` (`installedRules`, FCW-32 round 2) | the panel's look is Crispy's under OT.R112 |
| | FCW-33 v2 import, Thunderstore shape | delivered; no export writer | #555; `creator-contracts/test/thunderstore.test.ts` | "a command that builds a Thunderstore package from a v2 pack" is still "Not yet in any version" (`shared/modding-wiki/content/docs/changelog.mdx:114-118`; D:108-112) |
| | FCW-35 rules from installed packs | partial; its bundle half superseded by FP-4..6 | H354 answered 2026-10-28 (W:677-680) | see 2.1: there is still no supplier for `installedRules`, no bundle writer, and F2 has not moved into `validateRules` |
| **S4b** "Paintball, party, zombies/shop and BR built only on S4a in private loopback; an independent CTF" (W:112) | FCW-13 paintball | delivered, its loadout half owed | #570 `0f507b918`; `creator-contracts/test/examplesPaintball.test.ts`, `viewer/test/forge/paintballExample.test.ts` | P3's loadout half waits on the kit gate (W:414-419) |
| | FCW-34 independent CTF | delivered | #570 (`0fe949266` is an ancestor of `0f507b918`); the run `viewer/test/forge/ctfExample.test.ts`; the pack's data `creator-contracts/test/examplesCtf.test.ts` | its findings (b) are FCW-31's three primitives and FCW-35's contract gaps |
| | FCW-14 party | held at the pause | W:956 ("FCW-14 ... held") | needs approved local audio (FUI-24) |
| | FCW-15 zombies + shop | not built; superseded by FP-11 | PR #587 (design note, open); `behaviour.zombie.chase-melee` still `reserved` (`creator-contracts/src/handlers.ts:71`) | #587's owner rows H356-H360 now collide with `main`'s numbers (`HUMAN_TASKS.md:772`, H356 is the 24/7-room sleep). FP-11 renumbers them. |
| | FCW-16 battle royale | not built | -- | needs a player winner in `round.end` (W:462-463) and the zone primitives' live run |
| UI workstream (W:558-596) | FUI-1..4, 6, 1b, 22; FUI-23, FUI-25 | delivered, then superseded where Crispy changes them | #520; #555 (FUI-22); #573 `5ee8b0f3f` (FUI-23, FUI-25) | OT.R112 (`MISSION.md:618-627`) supersedes FUI-22 D4, FUI.R21 and FUI.R22 where his work changes them (`MISSION.md:621`) |
| | FUI-16 Packs panel, FUI-17 authoring UI | not built; FUI-16 superseded by MODS | -- | FUI-17's content-base half is FP-6's Custom Maps |
| | FUI-24 pack audio | held | H355 answered "a future task, not now" (W:822-823) | see 2.1 |

**One correction to D section 2.** D:119-126 says S4b's paintball and CTF proofs landed in "#570, #573". Both are in #570
(B171). #573 (B172) carried FUI-23 and FUI-25. This correction is logged here; the design itself is not edited.

### 1.2 The paused sprint's rulings: what still binds, what lapsed, and what is superseded

| ruling (W line) | state | successor or why it binds |
|---|---|---|
| FCW.R3 boundaries: data-only packs, no uploaded code (W:32-35) | **binds** | H272 and H343 keep level 3 (pack code) closed; FP.R8 (D:239-243) is a different rule that sits beside it: zombies only through general primitives, no zombie code path in the engine |
| FCW.R4 authority and data: H273/H274/H275 (W:36-39) | **binds** | D section 7 lists them for every FP row; F8 section 7's operator allowlist is the format half of H274 |
| FCW.R5 campaign progress device-local; no paid runner (W:40-43) | **binds, parked** | applies to S6/S7, both parked |
| FCW.R6 one renderer (W:44-45) | **binds** | FP.R5 extends the shared video keeper to the Forge (D:221-226) |
| FCW.R7-R17 the two seats' working agreement, fast mode, one integration branch (W:594-650) | **lapsed** | the UI seat, dot and seat 91's box no longer run this lane. The successor is the Forge path plan's host rules and lane (P "Host rules", "The integration branch") under AGENTS.md. |
| FCW.R8 controller scope (W:50-57) / FUI.R18 pad reach (W:641-645) | **binds** | as OT.R87 (`MISSION.md:889`); FP.R10 keeps it (MCW.R10) |
| FCW.R18 S4 is the rules platform, modes are its examples (#532) (W:651-672) | **binds** | FP.R8 makes zombies its next example; issue #532 stays open as the canonical request |
| FCW.R19 + H354 rules from installed packs; a download = layout + pack (W:673-680) | **binds** | FP.R2 (D:197-205) gives the "one bundle" its shape (`forge-map-bundle` v1). The rest is FCW-35's remainder (2.1). |
| FUI.R1-R9, FUI.R14 (`specs/2026-10-24-forge-sprint-ui-review.md:877-897`, `:906`): R1 the UI workstream authorized, R2 PAD-1 first, R3 the agent dock in release, R4 the palette on the design system's tokens, R5 dock layout, R6 pad legend, R7 save semantics, R8 mode names, R9 phone camera, R14 the plan revisions | **superseded where Crispy's work changes them**, bar R3's "the agent dock ships in release, pad-reachable", which binds through OT.R52 and FP.R10 | OT.R112 (editor UI and its workflow) |
| FUI.R10 -- FCW-27..29 re-filed as PH-F1's slice, blocked until H277; no job runner, schedule or host meanwhile (`:898-899`) | **binds** | not editor UI, so OT.R112 does not reach it; it is the ground for parking S7's jobs (2.1, section 3) |
| FUI.R11 -- H274 stands; a recipe selecting engine-owned handlers is not "the Forge recipe" online; S5 blocked until H274 (`:900-901`) | **binds** | not editor UI; S5 stays parked on it (2.1); SC still cites it as live |
| FUI.R12 -- the OT.R70 reading: a private Forge loopback match is not a "normal match"; packaged zombies may run there offline; online co-op waits for H274 (`:902-903`) | **binds** | not editor UI; it is the ground FS-11 (zombies in Forge Play) stands on |
| FUI.R13 -- a native WebGPU device is a prerequisite for FCW-24/26's evidence; nothing claimed from SwiftShader (`:904-905`) | **binds** | not editor UI; S7's ocean stays parked on it (2.1); SC still cites it as live |
| FUI.R19 refusal toast, FUI.R20 one scrolled pad menu (W:681-690) | **his to keep or change** | OT.R112. They stay as built until his work changes them. The design's FP.R4 asks for a toast on switch (D:212-219) and does not name FUI.R19; that it follows FUI.R19 is this review's reading. |
| FUI.R21 one asset list, FUI.R22 tab filters (W:691-702) | **superseded where his work changes them** | OT.R112 names them (`MISSION.md:621`), as section 1.1's UI row says |
| FUI.R23 Rules panel D1-D5 (W:297-317) | **D1-D4: Crispy's look; D5's lobby refusal binds** | D5's refusal of Create lobby for a rules layout is H273, `onlineCreatorLayoutRefusal` |
| FUI.R24 cue limits, the disc's sounds only (W:796-809) | **binds** | until FUI-24; F8 section 6 ("decode before decoder") is FUI-24's prerequisite |
| FUI.R25 every permission shown (W:703-710) | **binds** | the owner's word. FP-14's stepper must keep it (P row FP-14). |
| FG.R2 the Forge is a labelled adaptation | **binds** | every FP row cites it |

## 2. Resume or park, item by item

Sizes are the plan's: evening / days / week / week+ (P "The tasks"). Track: product unless **sim**. A **sim** row says
which reading it needs.

### 2.1 The named items

| item | what it is | state at this head | evidence | call | size | track |
|---|---|---|---|---|---|---|
| **FCW-35** | A layout's rules mode comes from an installed rules pack, and a download carries the layout and its packs as one bundle. | **Done by FP-4..6 (open PRs):** the bundle format and validator (#746, in this tree), its import into MODS and the content source (#748), Custom Maps (`agent/fp-6`). **Remaining:** (a) nothing supplies `installedRules`: `pageEntry.ts@bbe1217f8:126` passes `content` and `availablePacks` only, and the page's default is `[]` (`forge/page.ts@bbe1217f8:3326`), so an installed rules pack is not a mode; (b) the author's draft is not yet a local rules pack (FCW.R19 item 2); (c) no bundle writer and no share-code reference: `shareRefusal` still refuses a rules layout (`forge/rulesAuthoring.ts:96`); (d) F2 has not moved into `validateRules`: the Forge's copy remains (`rulesAuthoring.ts:42`, `:134`); (e) the authoring envelope and `NamedSave.rules` are not migrated; (f) FCW-34's and FCW-13's contract gaps are not published (W:385-400) | the FCW-35 note (`specs/2026-10-27-fcw-35-rules-from-installed-packs.md`) | **resume** as FS-4 (a, b, d, e, f) and FS-5 (c) | week + days | product (where rules come from changes no round; Forge Play of a rules layout is unchanged) |
| **FCW-12** | Authored guards that patrol, investigate and return, on the bots' own navigation. | Not started. Only `ActorSpecBase` exists (`creator-contracts/src/actors.ts:1-5`). | W:226-231, W:857 | **park until FS-10 lands, then resume** as FS-12 | week+ | **sim**: an authored NPC's movement and senses in a round. Reading: the bots' patrol, hearing and memory readings as the bot code already cites them. Any new value is a named `*_READING` in the bots' note. |
| **FCW-08 / FUI-16** | Pack validation, diagnostics, enable and disable, for a person and for an agent. | **The person's half is superseded:** MODS lists, enables and removes packs (#729), and FP-6 adds the readiness words (the #732 Log on `agent/forge-path-plan` `602ea9dd7`, 2026-11-08T14:57Z). **The agent's half is not built:** `packs.list/import/remove` are the whole surface (H3, row 762). | H3 row 762 | **resume the agent half** as FS-8; **drop** the Forge Packs panel (MODS as the one list is this review's reading, a controller's call in 4.3) | days | product |
| **FCW-31's parity paths** | The room's retail parity with an idle rule host, proved beyond the bullet path: volley, direct, blast, door, action, objective. | Not built. The test has two cases (`rulesRetailParity.test.ts:24-41`), and the branch has no commit past its base. The brief exists (`agent-mail/evidence/brief-fcw-31-parity-paths.md`). | W:956-957 (the resume list) | **resume first** as FS-3. FP-1a (#745) now drives door, gate and objective paths in lobby rooms, so the proof matters more now. | days | **sim**: tests only. Each case cites the room's retail path by `room.ts` line and copies the room's own decompilation citations, never new ones. Parity is the equality of the two runs. |
| **The kit gate** | `loadout.restrict` acts on the room's kits instead of being held as rule state only. | Held only: `host.ts:666-669` stores the restriction. The wiki says so: `rules-and-limits.mdx:56-57`. | W:268-272; FCW-13 P3 (W:414-419) | **resume** as FS-7 | days | **sim**: it changes a round's kits under a rules pack. Reading: the room's kit and armory path, cited where it hands kits, and a pack-off parity case added to FS-3's test. |
| **Lay-at-point** (with the other two FCW-34 primitives) | An item laid at a player's place, not only at a spawner. Also: a pickup a rule can refuse, and a player respawned by name. | Not built. `spawner.release` lays at a spawner (`creator-contracts/src/rules.ts:205`). There is no `item.pickup` answer like `purchase.refuse` (`rules.ts:149`). | W:261-267 | **resume** as FS-6 | days | **sim** where it acts in a round. Reading: the room's item and pickup path and its respawn path, by file and line. Retail never runs it, which FS-3's parity case proves. |
| **NPC health / hit** | Rules events and actions for hitting and damaging an NPC, per-kind health through spawner options, and the NPC seats passed to Forge Play's rule host. | Not built. The only NPC event is `npc.death` (`rules.ts:79`, `:145`). Forge Play builds its rule host with no `npcs` (`forge/match.ts:259`; `RuleNpcSeats` at `match/src/creator/rules/host.ts:56`). LATER 458 (claim options) is closed, so the options seam exists. | D:128-134; FP.R8 | **resume** as FS-10 (FP-11's first slice) | week | **sim**. Reading: NPC damage and health as the room's NPC code cites them. A pack's own health value is authored pack data, labelled, never presented as retail. |
| **FUI-24** | A rules pack's own audio members played as cue sounds. | Held. H355: "packs may bring their own audio files but that should be scoped as a future task and not taken on now" (W:822-823). | `HUMAN_TASKS.md:759` | **owner point** OP-2 (4.2): resume after F8's budgets and provenance land (FS-1, FS-13), or keep held | days | product (client-only presentation, FUI.R24) |
| **S5** (FCW-17..19) | Server-resolved approved packs, joins with precise requirements, friends' custom games. | Not started. Owner-gated on H273/H274 (W:467, `HUMAN_TASKS.md:617-618`). | SC section 1 row 5 | **park** (FUI.R11). F8 section 7's operator allowlist is its format prerequisite; H274's default stands. | week+ x3 | **sim** (server-owned outcomes online). Parked, reading owed: the room's join and requirement path (`central/src/forgeLobby*.ts`, the match server's lobby admission) cited where a pack-carrying room would refuse or admit a seat, and a two-client parity proof that a pack-off lobby equals today's |
| **S6** (FCW-20..23) | Authored missions and a saved, branching campaign. | Not started. FCW-21 needs FCW-19 (S5) and FCW-20 (W:496), and FCW-20 needs FCW-12 (W:488), so S6 waits on FCW-12 indirectly. | W:487-514 | **park**. The vocabulary is already shared (FCW-30, W:490), so nothing is lost by waiting. | week+ x2 | mixed |
| **S7** (FCW-24..29) | A WebGPU ocean pack, and durable unattended reference jobs. | Not started. 24 and 26 were blocked on a native WebGPU device (SC row 7). | W:516-556 | **park**. Two premises have moved: v0.4.14's WebGPU default (P row FP-7), and the project's own runner and parity harness (`specs/2026-10-30-emulator-parity-harness-design.md`), which now cover what FCW-27..29 asked for. **Owner point** OP-3 on keeping S7 in the programme. | week+ x3 | product (ocean: visual only, FCW.R6); the jobs are workflow |

### 2.2 The rest of the paused programme, for completeness

| item | call | why |
|---|---|---|
| FCW-02 / FCW-03 / FCW-04 acceptance runs | **fold into FP-14 and FP-6's e2e** | the client matrix is FP-14's compatibility record. The starters' rendered run belongs in the Forge e2e leg the stage gates already run (P "The gate"). |
| FCW-11 readiness | **resume** as FS-9 (LATER 763, 764) | Custom Maps' readiness words (FP.R4) cover packs present or missing. FCW-11 covers whether a map can host a mode, which FS-12 (guards) and FCW-16 need. |
| FCW-14 party | **park behind FS-13** | it needs approved local audio and hostage clips (W:440-443) |
| FCW-15 zombies | **FP-11** (FS-11) | FP.R8; #587 renumbered at its landing (P row FP-11) |
| FCW-16 battle royale | **park** | needs a player winner in `round.end` (W:462-463), FS-6, FS-7 and FS-9. It is a stage-E-or-later example. |
| FCW-33's export writer | **FS-5** | one writer for the bundle and the store wrapping |

## 3. Does the plan hold up to the ambitions?

**The ambition** is #532's: players make experiences the team never built, from public, versioned mechanisms, with no
special-case engine path. The wishlist's goal line is "all twenty creator examples ... while preserving vanilla SOCOM II"
(W:7-8).

**The contract holds up.** CTF was the independence test, and an implementer who built none of the platform passed it
(#570). Paintball runs on the same contract. The rules vocabulary is shared with S6's missions by design (W:490). The
bundle (FP.R2) carries any v2 pack kind, rules included, because it validates each carried pack as v2 (#746).

**The loop does not hold up yet.** Four gaps:
1. **No way out.** A player can import a custom map (FP-5, FP-6), but the Forge cannot write one. The design lists
   "an export writer" as not built (D:108-112), and no viewer code writes `forge-bundle.json` at `bbe1217f8` (only
   `packs/classify.ts` reads it). The first bundles in the wild will therefore be hand-made, as Phil's sample is (H425).
   A format that spreads by hand drifts.
2. **Modes do not travel.** Rules packs are stored but never reach the mode list (`installedRules` has no supplier), so
   a bundle can carry a rules pack that the Forge then ignores. FP-11's row says "FCW-35 first" (P:68), but no row
   in the plan builds FCW-35.
3. **The editor's roadmap is no longer ours.** The UI workstream (FUI-*) assumed a UI seat that owned `forge/page.ts`.
   Under OT.R112 every remaining FUI item is a proposal to Crispy: on the public PR, or as an addition he can object
   to, as FP.R4 does.
4. **The wiki still says "paused".** `kinds/index.mdx:55`: "The Forge's development is paused, so this is where rules
   packs stay for now." That line becomes false the day stage D starts.

**What I would take before the pack format sees wide use** (each tied to F8 or to a new row):

| # | suggestion | tied to | why before wide use |
|---|---|---|---|
| 1 | **Finish 0.1.2's additive fields before v0.4.17 ships the bundle import.** That means `extensions`, `license`, `authors`, `provenance`, the `extracted` refusal, `bundleDigest`, the asset definition in the contract, and `ZIP_RATIO_ADAPTATION` measured. | F8 section 2 (`extensions`), section 3 (`license`, `authors`, `provenance`, `extracted` refused), section 4 (bundle key), section 6 (`ZIP_RATIO_ADAPTATION`, asset definition); **FS-1** | A 0.1.x reader refuses every field it does not know (F8:20-22). Each field must land before the first pack uses it. FP-5 opens a new drop path for strangers' zips, and no zip reader checks an inflate ratio yet (P Log 14:38Z). |
| 2 | **A Forge bundle writer.** "Download as bundle" writes FP-4's v1 with its carried packs, fills suggestion 1's fields, and the share code carries a reference instead of refusing. | FCW-35 item 2 (W:380); FCW.R19; FCW-33's writer; **FS-5** (new) | One writer makes one canonical shape. Without it, every tool invents its own (gap 1). |
| 3 | **Rules from installed packs.** The registry's rules packs become the mode catalogue, and the author's draft becomes a local rules pack. | FCW-35 (2.1); **FS-4** (new) | Without it, a bundle cannot carry a mode (gap 2). The zombies proof (FP-11) needs it first. |
| 4 | **Conformance fixtures and the `s2u-pack.json` JSON Schema**, published beside the contract and linked from the wiki | F8 section 9 and its agent notes (rows "`s2u-pack.json` JSON Schema", "conformance fixtures"); **FS-2** | Third-party tools (Phil's, an agent's) test against our bytes, not our prose. The wiki's drift test (FP.R9) can read the same set. |

**What I would not take, and why:**
- **A v2 texture role now.** F8 section 8 puts it "later". ML.R3 keeps the HD pack on the older payload, wrapped, and
  the HD pack is about three times v2's 512 MiB bound (D:113-114). Doing it now reshapes the largest pack in players'
  hands for no new capability.
- **Programmatic or sandboxed pack code.** H272 and H343 keep level 3 closed (W:889-897). The declarative contract
  passed its independence test, so nothing in the FS list needs code.
- **Reopening S5 (packs on match servers) before H274.** That is the owner's trust decision. Building the resolver
  first would pre-empt it.
- **A Forge Packs panel (FUI-16).** MODS (D:48-55) is where a player manages packs; keeping it the one place is this
  review's reading, a controller's call (4.3). A second list would split the state words.
- **The rules node editor.** FUI.R23 leaves it "later" on the frozen semantics (W:582), and it is editor UI, so it is
  Crispy's (OT.R112).
- **Reviving S7's jobs as a Forge feature.** FUI.R10 keeps FCW-27..29 blocked with no job runner, schedule or host
  meanwhile (`specs/2026-10-24-forge-sprint-ui-review.md:898-899`), and the project's runner and parity harness
  already exist outside the Forge.

## 4. The re-cut plan

### 4.1 Rows (stage D, after FP-8's read; the plan's table shape)

Track: product unless **sim**. A **sim** row takes the whole process (OT.R53): every value cited, the ledger, its own
fresh review.

| id | what | depends on | size | track |
|---|---|---|---|---|
| FS-1 | **0.1.2 completed.** F8's 0.1.2 rows: `extensions`; `license` / `authors` / `provenance` (optional); `extracted` refused; `zdb-import` refused at export; `bundleDigest`; the asset definition in the contract; `ZIP_RATIO_ADAPTATION` measured and then refused; the shared `budgets.ts` (any build). | the owner's read of F8 (H-FP8-a); FP-4 landed | days | product |
| FS-2 | **Conformance fixtures + `s2u-pack.v2.schema.json`** (F8 section 9), with their `MANIFEST.json`, a schema-versus-validator test, and the wiki's reference linked | FS-1 | days | product |
| FS-3 | **FCW-31's parity paths.** Tests only: volley, direct, blast, door, action and objective, each with a path-presence assertion and the two-run equality (the brief already written). Divergence STOPs and is reported as a game-behaviour finding. | -- (FP-1a's placed kinds help) | days | **sim** |
| FS-4 | **Rules from installed packs** (FCW-35 a, b, d, e, f): the page's `installedRules` supplied from the registry; the author's draft a local rules pack; F2 moved into `validateRules` and the Forge's copy deleted; the envelope and `NamedSave.rules` migrated once; the contract gaps published in the rules spec and the wiki's agent block | FP-5 landed | week | product |
| FS-5 | **The bundle writer**: "Download as bundle" (FP-4 v1, the layout plus its content and rules packs, FS-1's fields filled); the share code carries a pack reference instead of refusing; the Thunderstore wrapping (FCW-33's writer). Takes `forge/page.ts` after FP-14's removal (FP.R11's order extended); its UI is an addition Crispy is told of (FP.R4's precedent). | FS-1, FS-4, FP-6 | days | product |
| FS-6 | **FCW-34's three primitives**: a refusable pickup (`pickup.refuse`), an item laid at a player's place (drop on death included), a player respawned by name; each a general action, none a CTF path; CTF's workarounds removed from its pack | FS-3 | days | **sim** |
| FS-7 | **The kit gate**: the room's kit and armory path reads the host's `loadout.restrict`; FCW-13's P3 loadout half closed; a pack-off parity case in FS-3's test | FS-3 | days | **sim** |
| FS-8 | **Pack operations for agents** (FCW-08's agent half, LATER 762 as H3 drafts it): `packs.validate` / `diagnostics` / `enable` / `disable` under the grant matrix, through the one registry | FS-4 | days | product |
| FS-9 | **Readiness wired and audited** (LATER 763, 764): the adapter over the Forge's `MapCheck`, the experience profiles, `tools/creator-map-audit.ts` over every available archive and the committed fixtures (a disc-backed heavy run, skipped and said without the disc) | FP-6 | days | product |
| FS-10 | **NPC primitives** (FP-11's first slice): `npc.hit` / `npc.damage`, per-kind health through spawner claim options, `RuleNpcSeats` passed by Forge Play (`forge/match.ts:259`), a damageable entity | FS-6, FS-7 | week | **sim** |
| FS-11 | **Zombies as a generated pack** (FP-11's remainder): `behaviour.zombie.chase-melee` unreserved with the room handler shared with `viewer/src/zombies/`; the shop on FS-7; the proof an agent writing the pack from the wiki's agent page | FS-4, FS-10 | week+ | **sim** (it unreserves `behaviour.zombie.chase-melee` with a room handler, as P's FP-11 marks `open (sim)`; FUI.R12 is its ground) |
| FS-12 | **Authored guards** (FCW-12): patrol, investigate, return, on the bots' navigation | FS-9, FS-10 | week+ | **sim** |
| FS-13 | **Pack audio** (FUI-24): audio members as cue sounds, decoded under FS-1's budgets ("decode before decoder"), licence and provenance shown | FS-1; **OP-2** | days | product |
| FS-14 | **The wiki says where the Forge is**: the "paused" line (`kinds/index.mdx:55`) and the `system` and rules status lines updated as FS rows land, written in FP-12a's two-layer shape | with FS-4 | evening | docs |

**Parked** (not rowed): S5 (FCW-17..19, H273/H274), S6 (FCW-20..23), S7 (FCW-24..29, OP-3), FCW-14 (behind FS-13),
FCW-16 (behind FS-6, FS-7, FS-9).

**Order.** FS-1 and FS-3 first, in parallel: one is the format, the other a tests-only sim row. Then FS-4 and FS-2. Then
FS-5, FS-6 and FS-7. Then FS-8 and FS-9. Then FS-10, FS-11 and FS-12. FS-13 runs when OP-2 allows it; FS-14 runs with
each landing.

### 4.2 Points the owner approves or parks

These touch scope, publishing or a call already his. No point involves money. Each draft row below is **not filed**:
the numbers are the controller's.

| point | question | default meanwhile |
|---|---|---|
| **OP-1** | Approve FS-1..FS-14 as stage D's content and order, or park stage D | nothing in FS is dispatched; FP-11 waits as P orders it |
| **OP-2** | FUI-24 (a pack's own audio): take it into stage D after FS-1, or keep H355's "not now" | H355 stands; cues play the disc's sounds (FUI.R24 C1) |
| **OP-3** | The programme's scope: keep "all twenty creator examples" (W:7) as the goal, S5-S7 parked but owed; or retire S7 (ocean and jobs) and FCW-16/FCW-14 from the goal | S5-S7 parked, still listed as owed |

Already the owner's, unchanged by this document: H274 and H273 (S5), H342 and H-FP8-a (every upload), H424 (Crispy's
Play items), H410 (the wiki's domain).

**Draft `HUMAN_TASKS.md` rows** (columns: id | the question | source | what it blocks):

```
| H-FS-1 | **Stage D of the Forge path: the re-cut creator plan (FP-10).** The paused Forge sprint's platform landed (S1-S4a, paintball, CTF); its loop did not (no bundle writer, rules packs never reach the mode list). Approve rows FS-1..FS-14 (0.1.2 completed, conformance fixtures, FCW-31's parity paths, rules from installed packs, the bundle writer, the three CTF primitives, the kit gate, agent pack operations, readiness, NPC primitives, zombies, guards, pack audio, the wiki's status lines) in their order, amend, or park stage D. *Default meanwhile:* nothing of FS is dispatched; FP-11 waits as the Forge path plan orders it. | [the sprint review](specs/2026-11-08-forge-sprint-review.md), sections 3-4; the Forge path plan, row FP-10 | stage D (v0.4.18+); FP-11 |
| H-FS-2 | **Pack audio members (FUI-24) in stage D?** H355 (2026-10-28) said a pack may bring its own audio "as a future task, not now". The re-cut plan places it after 0.1.2's budgets and provenance (FS-1) as FS-13. Take it now in that order, or keep it held. *Default meanwhile:* held; cues play only the disc's sounds (FUI.R24 C1). | the sprint review, 2.1 (FUI-24) and FS-13; H355 | FS-13; FCW-14 (the party) |
| H-FS-3 | **The creator programme's goal.** The wishlist plan's goal is "all twenty creator examples" (S1-S7). The review parks S5 (packs on match servers, H273/H274), S6 (missions, campaigns) and S7 (WebGPU ocean, unattended jobs; the project's own runner and parity harness now cover the jobs). Keep all twenty as the goal with S5-S7 owed, or retire S7 and the battle royale / party examples from it. *Default meanwhile:* parked and still owed. | the sprint review, 2.1 (S5-S7) and 2.2 | the programme's close (the wishlist plan's "Programme close") |
```

### 4.3 The controller's calls (logged, not the owner's)

- The order of the FS rows, and FS-3 before FS-6 and FS-7, because a primitive lands only on a parity proof that already
  covers its path.
- Where FS-5 falls in FP.R11's `page.ts` order: after FP-14's removal. Its UI is an addition Crispy is told of.
- A rules pack travels inside a bundle with no new format: the bundle already carries any v2 kind (#746).
- MODS stays the one pack list (this review's reading; the design describes MODS, D:48-55, but does not rule this).
  The Forge Packs panel is dropped (FUI-16).
- D section 2's "#570, #573" for S4b's proofs is read as #570 (1.1). The plan's FP-10 row names the file
  `2026-11-xx-forge-sprint-verdict.md` and lets the row edit the wishlist plan's Log. This document follows its brief
  instead: the file is `-forge-sprint-review.md`, and no plan is edited.
- LATER 761-765 (FP-3's harvest) are filed by FP-3. FS-8 and FS-9 cite them as H3 drafts them.

## 5. Agent notes (FP.R9: the files an agent touches per row)

| row | code | tests | docs / wiki |
|---|---|---|---|
| FS-1 | `creator-contracts/src/{packs,bundle,digest}.ts`, new `src/assets.ts`, new `src/budgets.ts`, `src/index.ts`; `viewer/src/zipReader.ts`, `agent/localFiles.ts`, `modelPackRuntime.ts`, `zombies/pack.ts`, `packs/registry.ts` | `creator-contracts/test/{packs,digest,bundle}.test.ts`; `viewer/test/zipReader*.test.ts`, `modelPack*.test.ts`; `tools/test/moddingWikiReference.test.ts` | F8's agent notes; wiki `reference/manifest.mdx`, `reference/codes.mdx`, `reference/bounds.mdx`, `anatomy.mdx`, `changelog.mdx` |
| FS-2 | new `creator-contracts/conformance/**` + `MANIFEST.json`, `creator-contracts/schemas/s2u-pack.v2.schema.json` | new `creator-contracts/test/conformance.test.ts`; a schema-versus-validator test like `bundle.test.ts`'s | wiki `reference/` links the set |
| FS-3 | none (no src change; a script helper in `match/test/creator/rulesHarness.ts` only if needed) | `match/test/creator/rulesRetailParity.test.ts` | HANDOFF section 3 claim; `agent-mail/evidence/brief-fcw-31-parity-paths.md` is the brief |
| FS-4 | `creator-contracts/src/{rules,layout,packs}.ts`; `viewer/src/pageEntry.ts`; `viewer/src/packs/registry.ts`; `viewer/src/forge/{rulesAuthoring,saves,matchRules}.ts`; `forge/page.ts` only where `installedRules` is read (FP.R11's turn) | `creator-contracts/test/rules.test.ts`; `viewer/test/forge/` rules and saves tests; `pageRulesPanel` | `specs/2026-10-27-creator-rules-contract.md`; the FCW-35 note; wiki `kinds/index.mdx` (rules), `rules-and-limits.mdx` |
| FS-5 | new `viewer/src/packs/bundleWriter.ts` (or `creator-contracts/src/bundle.ts`'s writer); `forge/rulesAuthoring.ts` (`shareRefusal`); `forge/page.ts` (one menu entry, after FP-14); `creator-contracts/src/thunderstore` export | `creator-contracts/test/bundle.test.ts` (round trip: write, validate, import); `viewer/test/packs/forgeBundleImport.test.ts` (FP-5's, on `agent/fp-6`); an e2e beside `e2e/forgeCustomMaps.spec.ts` | the Custom Maps kind page (FP-9); `publishing/thunderstore.mdx` stays placeholder (H342) |
| FS-6 | `creator-contracts/src/rules.ts` (vocabulary), `match/src/creator/rules/host.ts`, the room's item, pickup and respawn seams (claims on `room.ts`) | `match/test/creator/rulesHost.test.ts`, `rulesSemantics.test.ts`, FS-3's parity cases; `creator-contracts/test/examplesCtf.test.ts` | the rules spec section 5; `examples/capture-the-flag/README.md`; wiki `rules-and-limits.mdx` |
| FS-7 | `match/src/creator/rules/host.ts`, the room's kit and armory path (claims on `room.ts`) | `rulesHost.test.ts`; `viewer/test/forge/paintballExample.test.ts` (P3's loadout half); FS-3's pack-off case | wiki `rules-and-limits.mdx:56-57` |
| FS-8 | `forge-agent-protocol/src/index.ts` (operations), `viewer/src/agent/localPacks.ts`, `viewer/src/packs/registry.ts` | `viewer/test/agentLocalPacks.test.ts`; the guard and receipt matrix tests | FP-13's operations list |
| FS-9 | `creator-contracts/src/readiness.ts` (consumer only), new `viewer/src/creator/mapReadiness.ts`, new `tools/creator-map-audit.ts` | `creator-contracts/test/readiness.test.ts`; a new viewer adapter test; a disc-backed audit test (skips without `SOCOM_DISC`) | -- |
| FS-10 | `creator-contracts/src/{rules,handlers}.ts`, `match/src/creator/rules/host.ts`, `viewer/src/forge/match.ts`, `forge/matchRules.ts` | `match/test/creator/rulesHost.test.ts`; a Forge Play test with NPC seats | the research note named by the row for NPC health and damage readings |
| FS-11 | P row FP-11's list (`match/src/creator/rules/**`, `creator-contracts/src/{handlers,rules}.ts`, `viewer/src/forge/match.ts`, `viewer/src/zombies/`) | P row FP-11's | #587's note, renumbered |
| FS-12 | `creator-contracts/src/actors.ts`, new `viewer/src/creator/actors.ts`, new `match/src/creator/actors.ts`, `forge/npcs.ts` seams | W:230-231's RED and GREEN lines | the bots' research note |
| FS-13 | `viewer/src/forge/rulesCues.ts`, `match.ts` audio wiring, FS-1's `budgets.ts` | `viewer/test/forge/rulesCues.test.ts`; `e2e/forgeCues.spec.ts` | wiki `rules-and-limits.mdx`, `changelog.mdx` ("Not yet in any version") |
| FS-14 | none | the wiki's drift test (FP-12a) | `shared/modding-wiki/content/docs/kinds/index.mdx`, `index.mdx`, `changelog.mdx` |
