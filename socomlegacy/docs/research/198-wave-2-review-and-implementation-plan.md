# 198 -- Wave 2: the review, the cross-review, the candidate dispositions and the implementation plan

The four documents follow as §1-§4, each verbatim apart from the import's edits (its `##` headings are numbered `### N.M` under the document's own section).

- Research date: 2026-10-04 (research wave 2; the index is [178](178-the-research-wave-of-2026-10-04.md)).
- Origin: `research-wave-2026-10-04/wave-2/{REVIEW,CROSS-REVIEW,CANDIDATE-DISPOSITION,IMPLEMENTATION-PLAN}.md` on the owner's host, in the evidence archive ([178](178-the-research-wave-of-2026-10-04.md) gives its root). A relative `scratch/...` path below is under `research-wave-2026-10-04/wave-2/`; the per-cluster `ledger-*` files it names are merged in [`ledgers/2026-10-04/`](ledgers/2026-10-04/README.md).
- Trees compared: **PORT** = `agent/online` at 2026-10-04 (written `$PORT`; `$PORT/..` is that branch's root, `$WEBISSUES` the `agent/web-issues` checkout); **WT** = the old-layout checkout (`$WT`, the clone's pre-restructure web project). WT-96..102 are notes 171-177 here; PORT's own notes 96-102 are other notes.
- **Status: reading, pending review -- not adopted.** Nothing in it is adopted until a sprint task takes it and a reviewer re-reads it at the source.
- Grades: wave 2 normalised its own work as "source reading" (= **reading**, pending review), "inference" and "unresolved"; a first-wave grade it quotes keeps the first wave's words (PROVEN = **reading**; STRONG = reading with one interpretive step; BELIEVED = inference). Nothing here was measured running.
- Verification: these are the wave's own review documents; the cross-review is §2. Landed with the wave.
- Edits on import: the headings are numbered for the corpus; home-directory paths are replaced by `$PORT`/`$PORT/..`/`$WEBISSUES`/`$NPX_TSX`; the archive's absolute root is dropped; references to the other reports are links to their notes. The substance is verbatim.

## 1. Review of the first wave and the additional scope (`REVIEW.md`)

The first wave is a substantial source-recovery effort. Its original 427-name inventory matches all 427 PLACEHOLDER/READING names in the inspected newer PORT source tree. The useful second wave is therefore **integration and omitted consumers**, not another list of those same names.

The first wave was still publishing during this review. At the initial baseline, BRIEF and M1 were its only top-level Markdown files, with evidence spread across 15 scratch lanes. C4, C9 and M2 reports subsequently appeared and M1 changed. The review reads both scratch evidence and the later reports; a missing final report is never counted as missing research. BASELINE.json (`research-wave-2026-10-04/wave-2/BASELINE.json`) pins the initial census. The final validation inventory records additions, removals and changed files separately; this review does not pretend the parent directory is a frozen release.

### 1.1 What the census does and does not establish

| Inspection | Initial result | Meaning |
|---|---|---|
| First-wave code-name ledger | 427 rows, 427 unique names | No duplicate names in that inventory |
| PORT source scan | 470 TypeScript source/tool files, 427 names, zero absent from the first-wave ledger | The named-code inventory is complete for this scan's file selection |
| PORT research notes | 83 files | Includes newer work through PORT-R170 |
| WT source scan | 287 files, 190 names | Older layout and implementation; not interchangeable with PORT |
| WT research notes | 29 files | Includes the newer Crossroads/all-map audit under WT-R96..102 |
| Supplemental research-table scan | 209 rows, 137 unique names absent from PORT's code-name census | Candidates only: includes repeated, retired, planned and unresolved entries; **not 137 new missing features** |
| PORT-R170 within that scan | 24 note-only rows, including one explicitly retired codec placeholder | A concrete example of scope missed by a code-name-only inventory |

The scan includes `packages/*/src/**/*.ts` and tool TypeScript outside test directories and temporary `zz-` files. It excludes installed dependencies/build output. It is an inventory of those artifacts, not a completeness proof for every mechanic or every programming language. The supplemental name search also looks for prior text mentions; absence of an exact name does not establish absence of the underlying research.

Reproduction: inventory.py (`research-wave-2026-10-04/wave-2/scratch/W2-R/inventory.py`), coverage.py (`research-wave-2026-10-04/wave-2/scratch/W2-R/coverage.py`), note-only-candidates.json (`research-wave-2026-10-04/wave-2/scratch/W2-R/note-only-candidates.json`). The latter retains row text, original note/line and prior mention paths so later work can distinguish a new question from an obsolete label.

### 1.2 Breadth and duplication review

| Area / first-wave lane | Existing work retained | Additional wave focus / disposition |
|---|---|---|
| Match / C1, M1 | Objective modes, scoring, friendly fire, match configuration, round flow, chat/votes | W2-B traces production service admission and state restoration; W2-R resolves two unidentified mode-conditioned command labels |
| Movement and actor / C2 | Actor/motion naming, flags, knock/orbit and locomotion evidence | W2-A traces firing eligibility from motion data into actual consumers; no blanket airborne firing ban |
| Combat, HUD and effects / C3 | Damage, animation, rockets/backblast and effect evidence | W2-A rechecks pickup ownership and actor lifecycle and closes explosion-flag, C4 surface, shotgun-reset and damage-triggered mine consumers; body-blood projection remains partial. W2-B owns missing dead-body hydration |
| Armory / C4 | Kit masks, loadout selection, ammo and slot rules | Existing recovery retained; pickup is an in-round lifecycle extension, not a second armory project |
| Screens/options / C5a | Screen commands, variables, missing option/store consumers | General options work remains covered. W2-R adds the voice/preset/secondary-swap dependency |
| Dialog/input / C5b | Physical slots, menu state transitions, preset data, input flush | W2-R joins the existing preset data to voice and weapon action consumers; identifies the TeamCommand state object |
| UI compositor / C6 | Layout, text, widgets, titlebar and pixel/capture questions | Covered; no invented values to fill unresolved visual evidence |
| Audio/movie / C7 | Sound tuners, UI/music/movie questions, animation-instance sound identity and stop/fade/detach cleanup | W2-C extends existing identity/cleanup work into authored moving-world/update-only sound consumers and exact MP bindings; W2-B closes the retail pitch-driver distinction; W2-R extends voice channel evidence |
| Card/services / C8 | Card codec, persistence, accounts/clans/texts/stats service recovery | W2-B studies room/session/account identity integration. Known card emulation and owner adaptations remain covered |
| World/render/platform / C9 | Camera, culling/LOD, zoom, render/platform ledger | W2-C adds actor-disturbed clutter and foliage audio plus live sound transforms. Camera clipping is explicitly not promoted from a data label alone |
| Hostage / H1, H2, H3 | Hostage animation, stop/follow/death/state/network research | Retained as prerequisites; not repeated as a newly discovered feature |
| Replication / M2 | Original state structures, creation/apply paths and object identities | W2-B compares those findings with web join/reconnect contracts and persistent object ownership |
| All 22 available retail maps / WT-R96..102 | Crossroads bridge/bomb plan, Demolition/Breach/NPC/Suppression/turret audit | Retained. New entity/lifecycle contracts must support the planned switches, rubble collision, objectives and turrets |
| HDD maps | Three unavailable assets | Deferred explicitly; no conclusions about their geometry, switches or implementation parity |

Every area received a coverage/duplication check. Deep new source recovery is concentrated where it produced additional evidence; this report does not claim to have rerun every prior probe or certified every prior finding.

The later C3, C5a, C6 and H1–H3 final reports were also checked against the relevant additions. C3's rocket, launcher and C4 timing work is retained as prior coverage; its broad statement that no other note-only combat questions remain is not supported by PORT-R94's C4-surface, blast-flag and shotgun-reset rows. W2-A closes those specific questions. C5a's screen/admission work and C6's compositor/widget/timing work do not close W2-R's action/voice consumers. The final C7 report does cover generic sound identity and cleanup, so those are credited to it; W2-C's addition is their moving-world integration, exact map bindings and receiver correction. H1–H3's NPC AI/state/late-join work remains prior scope, not a newly discovered feature. Their AI follow radii do not establish which NPCs influence foliage.

### 1.3 Corrections and interpretation hazards

1. **Static evidence and runtime parity have different labels.** The parent brief allows PROVEN for a direct byte/code read. PORT's current parity rule reserves proven for an original-runtime measurement. New reports say source reading, inference or unresolved. Reproducing a constant with Capstone/Unicorn still does not certify its behavior in a match.
2. **The research directories are different versions.** A bare `R96` can refer to different topics in PORT and WT. New references always qualify the tree. Old WT absences cannot be reported as present-day PORT defects: newer combat health, flinch, fall-damage, first-person, NVG and environment palette work already exists.
3. **Pickup authority is not generically the host.** W2-A corrects C1/A2's may-I/OK account by following the specific recipient lookup through the dropped weapon's owner. Browser authority is a deliberate replacement architecture and must be named as such.
4. **Menu order is not its payload.** W2-R resolves the provisional OFFENSE/DEFENSE inversion in PORT-R170 using registrations plus ELF strings; the menu sends 2/1 respectively.
5. **An offset's owner matters.** The voice-related state at command object +0x750 is not the actor's life or stance enum. W2-R corrects that premise while leaving dead-talk runtime evidence owed.
6. **Parsed or authored data is not effective behavior.** W2-A finds NoFire discarded by the motion reader; W2-C follows dynamic clutter and moving sound transforms past their parsed fields. A deeper receiving-driver check found that the traced automatic Doppler value is ignored by command mask5. An authored flag, an active scene and even a calculated value are insufficient if the final consumer ignores the argument. Audible Doppler is not promoted as a required missing feature.
7. **Native packet structs are evidence, not a drop-in browser protocol.** Persistent entity identity, authoritative admission, full-state restoration, round epochs and reconnect ownership need explicit contracts in the web architecture. Proposed schema choices are design inferences, separate from native rules.
8. **Known deferrals stay known deferrals.** Missing service wiring and voice exist on the roadmap; this wave contributes integration constraints and source closures. It does not label the anonymous prototype as a newly discovered defect merely because a planned authenticated service exists in another module.

### 1.4 Handoff standard

Each additional finding carries prior coverage, source anchors, current PORT consumers, implementation requirements, tests and exact owed evidence. The normalized ledger distinguishes `new`, `extends`, `covered`, `superseded`, `deferred` and `adaptation`. Its P0/P1/P2 values propose implementation order; they do not assert that every source gap must block launch.

Review the [implementation plan](198-wave-2-review-and-implementation-plan.md) alongside the four lane reports. Original runtime captures, physical mobile controller/mic tests, gameplay implementation and unavailable HDD assets remain separate work. This wave writes only under `wave-2` and does not run games, servers, browsers or builds.

## 2. Cross-review record (`CROSS-REVIEW.md`)

This records independent source samples and material corrections. It is not an exhaustive replay of the first wave, a browser test run, or an original-runtime parity certification.

| Report | Independent reviewer | Checked evidence | Result |
|---|---|---|---|
| W2-A combat/actor | W2-C; root editorial/integration review | Retail NoFire parser/consumer and `0058a8c0` strict comparator instructions; pickup `0059f610` → `002ba2c0` → owner actor+0xfc8; respawn death-drop exclusion | Core findings agree. Blended-leaf aggregation remains owed. Missing draft README and abbreviated source addresses were returned for correction |
| W2-B multiplayer | Root | PORT map/rules room key; welcome/score/snapshot fields; single-use account ticket; retained Player-object ownership versus numeric observer ownership; remote corpse clock; native caseless comparator | Core gaps agree. Requested separate retained smoke/effect state where Flying has already ended; explicit correction to M2's broad implemented/hydration wording; research-scope wording clarified. Incorporated in final B report |
| W2-C world/audio | W2-B; root scope review | Independent replay of all 22 MP world rows; exact 4,759 dynamic instances/11 maps; nine maps name FoliageSound, eight match their own AM bank directly and MP11 remains unresolved; PORT dropped fields, fixed emitter coordinates/no pitch interface; native sound lifetime/update and pitch helper; native clutter influence selection and radius; retail pitch receiver | Core findings agree. Native bend allocation first selects an influence passing axis bounds; no extra sphere/nearest-influence gate may be invented before creation/rustle. Incorporated. Retail receiver ignores automatic Doppler; separate explicit-pitch units/conversion are sourced, with audible runtime comparison owed |
| W2-R input/voice | W2-A | D56645–56701/57432–57453 fixed `0x413120` command object and tick outside alive/dead branch; D83895–83920 vs D453301–453310 talk/swap arbitration; D164439–164458/164664–164704/164835–164855 side predicate and player_team writes | No material disagreement in these sampled core traces. Dead-talk reachability, state5 movement and membership lifecycle remain open. Root's ELF/registration and direct controller archive probes supply reproducible label/preset evidence |

### 2.1 Reconciliation performed during the review

- The parent wave continued publishing. New C1, C2, C3, C4, C5a, C5b, C6, C7, C8, C9, H1–H3 and M2 reports were incorporated into relevant lane novelty checks to the inspected extent. Initial report absence is not treated as research absence. C8's ordinary-create defaults and suffix, C1's departed-owner rule, C3's C4 timing, and C7's generic sound identity/cleanup remain prior coverage; narrower consumer closures and integration gaps remain additional work.
- M2's packet/object schemas remain prior evidence. Its broad current-port status for round state/late join is narrowed by B's demonstrated missing phase, projectile and corpse fields; the native schemas were not rediscovered and renamed.
- C1/A2's host-arbitrated pickup shorthand is corrected by following the specific owner-recipient path. A web server arbiter remains a proposed adaptation.
- The completed C1 report showed that the flinch/reload flag consumer was already covered, so A retained it as an integration dependency rather than a new source discovery. It also corrected the interpretation of blast helper `005a5da0`: pending weapon/launcher switch completion, not ladder release. Exact ladder/hang teardown remains a capture/source gate.
- PORT-R170's provisional menu-order assignment is corrected by native registration payloads. Its command-state wording is corrected by the object address, while its original capture gates remain.
- A focused second pass followed audio into the **disc's own** 989SND.IRX. The traced EE call forwards mask0x05 through RPC0x21; the receiving handler requires mask0x08 for modifier and mask0x10 for bend. Thus the computed automatic Doppler argument is ignored on this route. Moving-position/lifetime remains an implementation finding; audible automatic Doppler is removed as a parity requirement. The separate active SOUND absolute note/fine path and LIBSD conversion were traced without generalizing them to every fresh sound start. Reproduction: pitch follow-up findings (`research-wave-2026-10-04/wave-2/scratch/W2-B/pitch-followup.md`), probe (`research-wave-2026-10-04/wave-2/scratch/W2-B/pitch-followup.py`) and actual output (`research-wave-2026-10-04/wave-2/scratch/W2-B/pitch-followup.json`).
- A's final note-only pass located the guarded shotgun hit reset, exact C4 material-name refusal and two `IgnoreExplosionDI` consumers. C independently reread the latter two; root sampled those consumers and retained the update-order, material and runtime bounds. Body penetration, raw online pellet damage and flinch/reload remain credited to C1.
- B independently traced the final `Volitile` consumer from its ammo mask through the model damage interface, direct/blast dispatch, callback, local-owner gate and optional sender. Review corrected the mask to bit0, retained GetDamage's minimum1.0 argument, distinguished target state from incoming kind, and verified the sender's unsigned subtype test (0 passes; 1/2 fail). A incorporated these details. The authored census contains Claymore/PMN; collision reach, queue timing and original runtime remain owed. Independent review (`research-wave-2026-10-04/wave-2/scratch/W2-B/crossreview-A21.md`), probe (`research-wave-2026-10-04/wave-2/scratch/W2-B/crossreview-A21.py`) and instruction evidence (`research-wave-2026-10-04/wave-2/scratch/W2-B/crossreview-A21.json`).
- Root independently replayed B's four retail UI consumers and read the bounded create-failure/callback branches at D190603–190664. The decoded reset and conditional Lock enable/activation agree with B07; broader named-game entry and GameLock semantics remain unresolved. Decoded review copy (`research-wave-2026-10-04/wave-2/scratch/W2-R/crossreview-ui-consumers.json`).
- C independently reviewed the four root synthesis documents. It confirmed the corrected sound/clutter boundaries and caught two wording leftovers: unused Doppler distance history was removed from the required browser sound record, and the nine named foliage-sound maps were distinguished from eight resolved own-bank bindings. Both corrections are incorporated.
- Camera/LOD/render work already covered by C9, offline-only action affordances, owner-decided codec/transport policies, deferred career posting and unavailable HDD assets do not become additional missing-feature claims.

### 2.2 Validation layers kept separate

1. **Artifact checks:** JSONL schema/unique IDs, local links, hashes and baseline delta. These certify a usable research handoff.
2. **Probe reproduction:** direct archive reads, source assertions, bounded disassembly and isolated scalar instruction/model checks. These measure source artifacts and extracted predicates.
3. **Implementation acceptance:** codec/room/client tests proposed in the plan; not run because this wave makes no gameplay changes.
4. **Original/runtime/device comparison:** required captures and physical controller/mic scenarios named in the reports; not performed by this wave.

The final validation output (`research-wave-2026-10-04/wave-2/VALIDATION.json`) records artifact status and the final manifest. A source-only claim is never promoted to runtime-proven merely because another reviewer agreed with it.

## 3. Disposition of unmatched note-only names (`CANDIDATE-DISPOSITION.md`)

The supplemental scan found 36 unique note-table names absent from a literal search of the inspected first-wave text. That is not a missing-feature count. The table below reconciles every one; retirement or replacement is taken from the current PORT notes, not inferred from absence.

This is the unmatched-name subset of the 137 unique supplemental candidates. Candidates with prior text hits remain in the full scan (`research-wave-2026-10-04/wave-2/scratch/W2-R/note-only-candidates.json`); those hits do not themselves certify complete research. See the [combat report](194-w2-a-combat-actor-gaps.md) for consumer closures, bounded follow-ups and exact remaining work.

| Name | Disposition | Evidence / next obligation |
|---|---|---|
| `ARMORY_BETWEEN_ROUNDS_READING` | already settled/retired/replaced in current notes | settled: retired 2026-10-02 (the owner's ruling, INT.R3; INT-SWAP): nothing in the match opens the ARMORY; the constant and `inventoryOpensArmory` removed (research 95 §9) PORT 101-the-rounds-open-gaps.md:562 (`$PORT/docs/research/101-the-rounds-open-gaps.md:562`) |
| `ARMORY_LIST_FILTER_PLACEHOLDER` | prior coverage | W2-A-22 credits PORT-R95 section3.4 and C4 dump_scroll side-specific Enable predicates; existing armory work, not a new world-inventory feature. PORT 101-the-rounds-open-gaps.md:298 (`$PORT/docs/research/101-the-rounds-open-gaps.md:298`) |
| `BODY_BLOOD_MARK_PLACEHOLDER` | partial source trace; unresolved | W2-A-17 follows the impact mark into primitive projection, but character-versus-wall destination and lifetime remain unresolved. Existing blood particles do not close this question. PORT 101-the-rounds-open-gaps.md:162 (`$PORT/docs/research/101-the-rounds-open-gaps.md:162`) |
| `C4_SURFACE_READING` | extended source closure | W2-A-10: exact INVISIBLE_DI equality refuses final placement; full target/ray conditions remain owed. PORT 101-the-rounds-open-gaps.md:168 (`$PORT/docs/research/101-the-rounds-open-gaps.md:168`) |
| `CIGWS_METHOD_MAP_READING` | already settled/retired/replaced in current notes | settled: no effect: the class is dead PORT 101-the-rounds-open-gaps.md:570 (`$PORT/docs/research/101-the-rounds-open-gaps.md:570`) |
| `DEFAULT_CHARTYPE_PLACEHOLDER` | already settled/retired/replaced in current notes | settled: resolved (R95.5), retired in web sprint 5 S2 PORT 101-the-rounds-open-gaps.md:576 (`$PORT/docs/research/101-the-rounds-open-gaps.md:576`) |
| `EXPLODE_ON_IMPACT_READING` | prior partial coverage | W2-A-18 credits C1 impact-sight/body-penetration conversion; retains below-arming return and material/flag conditions rather than promising every impact detonates. PORT 101-the-rounds-open-gaps.md:182 (`$PORT/docs/research/101-the-rounds-open-gaps.md:182`) |
| `FOURTH_CHAR_AOP_READING` | already settled/retired/replaced in current notes | settled: resolved by the capture and the source PORT 101-the-rounds-open-gaps.md:582 (`$PORT/docs/research/101-the-rounds-open-gaps.md:582`) |
| `FRAGMENT_PART_TABLE_PLACEHOLDER` | already settled/retired/replaced in current notes | settled: resolved (research 91 section 20) PORT 101-the-rounds-open-gaps.md:583 (`$PORT/docs/research/101-the-rounds-open-gaps.md:583`) |
| `FRIENDLY_FIRE_DEFAULT_PLACEHOLDER` | already settled/retired/replaced in current notes | settled: resolved by research 91b PORT 101-the-rounds-open-gaps.md:584 (`$PORT/docs/research/101-the-rounds-open-gaps.md:584`) |
| `HELP_GLYPH_LEAD_PLACEHOLDER` | already settled/retired/replaced in current notes | settled: retired (web sprint 4 M8) PORT 101-the-rounds-open-gaps.md:593 (`$PORT/docs/research/101-the-rounds-open-gaps.md:593`) |
| `HOLD_PLACEHOLDER` | already settled/retired/replaced in current notes | settled: retired: the weapon hangs from its own clip track PORT 101-the-rounds-open-gaps.md:595 (`$PORT/docs/research/101-the-rounds-open-gaps.md:595`) |
| `IGNORE_EXPLOSION_DI_READING` | extended source closure | W2-A-11: two specific obstruction/material consumers plus separate script flag producer; not a global collision bypass. PORT 101-the-rounds-open-gaps.md:195 (`$PORT/docs/research/101-the-rounds-open-gaps.md:195`) |
| `INVENTORY_HELD_MENU_READING` | renamed | PORT-R94 identifies this as the previous name of INVENTORY_MENU_READING, already present in the code/prior inventory. The rename does not settle its remaining input/draw questions. PORT 94-the-arsenal.md:1647 (`$PORT/docs/research/94-the-arsenal.md:1647`) |
| `L2_SLOT_PLACEHOLDER` | already settled/retired/replaced in current notes | settled: retired: L2 is sourced PORT 101-the-rounds-open-gaps.md:597 (`$PORT/docs/research/101-the-rounds-open-gaps.md:597`) |
| `LAUNCHER_RELOAD_CONDITION_READING` | prior coverage with cross-connection | W2-A-19 connects C1/C3 launcher animation-set identity to actor+0x528 and reload selection; this is current animation-set state, not simply carrying a launcher. PORT 101-the-rounds-open-gaps.md:204 (`$PORT/docs/research/101-the-rounds-open-gaps.md:204`) |
| `LIMB_SPILL_PIERCING_PLACEHOLDER` | already settled/retired/replaced in current notes | settled: resolved (research 91 section 20) PORT 101-the-rounds-open-gaps.md:599 (`$PORT/docs/research/101-the-rounds-open-gaps.md:599`) |
| `LIMB_SPILL_SCALE_PLACEHOLDER` | already settled/retired/replaced in current notes | settled: resolved (research 91 section 20) PORT 101-the-rounds-open-gaps.md:600 (`$PORT/docs/research/101-the-rounds-open-gaps.md:600`) |
| `LISTBOX_UIVAR_WIDTH_PASS_READING` | already settled/retired/replaced in current notes | replaced by research 144 §3's `LISTBOX_REBUILD_CONTENT_PASS_READING` at the merge with ONL-01 PORT 147-select-universe.md:230 (`$PORT/docs/research/147-select-universe.md:230`) |
| `LOFT_TOLERANCE_READING` | already settled/retired/replaced in current notes | settled: resolved (web sprint 4 M7) PORT 101-the-rounds-open-gaps.md:602 (`$PORT/docs/research/101-the-rounds-open-gaps.md:602`) |
| `MATCH_WIN_COMPARE_PLACEHOLDER` | already settled/retired/replaced in current notes | settled: resolved (research 91 section 18.2.2) PORT 101-the-rounds-open-gaps.md:607 (`$PORT/docs/research/101-the-rounds-open-gaps.md:607`) |
| `PERSONA_SHARED_VALUES_READING` | already settled/retired/replaced in current notes | removed 2026-10-01 with `writePersonas` (R7); the observation stays in §5 and §6 as research PORT 102-the-card-file-codec.md:262 (`$PORT/docs/research/102-the-card-file-codec.md:262`) |
| `RELOAD_BLEND_PLACEHOLDER` | already settled/retired/replaced in current notes | Current note explicitly records resolution; keep its linked source task instead of reopening the old name. PORT 101-the-rounds-open-gaps.md:233 (`$PORT/docs/research/101-the-rounds-open-gaps.md:233`) |
| `RESPAWN_OPTION_DEFAULT_PLACEHOLDER` | already settled/retired/replaced in current notes | settled: resolved by research 91b PORT 101-the-rounds-open-gaps.md:627 (`$PORT/docs/research/101-the-rounds-open-gaps.md:627`) |
| `RESPAWN_POINT_PLACEHOLDER` | already settled/retired/replaced in current notes | settled: resolved by research 91a PORT 101-the-rounds-open-gaps.md:628 (`$PORT/docs/research/101-the-rounds-open-gaps.md:628`) |
| `RESPAWN_WAIT_CAMERA_PLACEHOLDER` | already settled/retired/replaced in current notes | settled: resolved 2026-09-29: the death camera PORT 101-the-rounds-open-gaps.md:629 (`$PORT/docs/research/101-the-rounds-open-gaps.md:629`) |
| `SHOTGUN_HIT_GUARD_RESET_READING` | extended source closure | W2-A-09 locates guarded actor-update reset; volley/shooter/update ordering remains owed. PORT 101-the-rounds-open-gaps.md:242 (`$PORT/docs/research/101-the-rounds-open-gaps.md:242`) |
| `SHOTGUN_PELLET_RANGE_SQ_PLACEHOLDER` | already settled/retired/replaced in current notes | settled: resolved (research 91 section 20) PORT 101-the-rounds-open-gaps.md:635 (`$PORT/docs/research/101-the-rounds-open-gaps.md:635`) |
| `SHOT_RANGE_PLACEHOLDER` | already settled/retired/replaced in current notes | settled: replaced: the record's Maximum_Range PORT 101-the-rounds-open-gaps.md:634 (`$PORT/docs/research/101-the-rounds-open-gaps.md:634`) |
| `SLOT_OF_LAUNCHER_READING` | prior coverage | W2-A-20 credits PORT-R95 sections3.7/4.3: M79/MGL primary, LAW/RPG equipment carriers, partner allocation separate. PORT 101-the-rounds-open-gaps.md:244 (`$PORT/docs/research/101-the-rounds-open-gaps.md:244`) |
| `SOUND_RADIUS_MP_USE_READING` | known unresolved scope | W2-A-15 retains PORT-R94 stimulus evidence and H1 NPC perception; full multiplayer subscriber/lifecycle census remains open. PORT 101-the-rounds-open-gaps.md:250 (`$PORT/docs/research/101-the-rounds-open-gaps.md:250`) |
| `SPAS_SP_VALVE_PLACEHOLDER` | already settled/retired/replaced in current notes | settled: not needed for MP: the 22 MP maps say Enable_spas PORT 101-the-rounds-open-gaps.md:637 (`$PORT/docs/research/101-the-rounds-open-gaps.md:637`) |
| `SUPPRESSION_ROUND_END_PLACEHOLDER` | already settled/retired/replaced in current notes | settled: resolved (research 91 section 18.2.2) PORT 101-the-rounds-open-gaps.md:642 (`$PORT/docs/research/101-the-rounds-open-gaps.md:642`) |
| `TITLEBAR_VERTICAL_READING` | already settled/retired/replaced in current notes | settled: retired: replaced by UI_TEXT_ORIGIN (source) PORT 101-the-rounds-open-gaps.md:643 (`$PORT/docs/research/101-the-rounds-open-gaps.md:643`) |
| `VIEWER_ACTOR_PLACEHOLDER` | already settled/retired/replaced in current notes | settled: retired with shot.ts (2026-09-29) PORT 101-the-rounds-open-gaps.md:660 (`$PORT/docs/research/101-the-rounds-open-gaps.md:660`) |
| `VOLATILE_READING` | extended source closure | W2-A-21: authored Volitile on Claymore/PMN binds a damage interface and permits source-qualified incoming damage to queue detonation. Geometry, queue timing and original capture remain owed. PORT 101-the-rounds-open-gaps.md:257 (`$PORT/docs/research/101-the-rounds-open-gaps.md:257`) |

The machine-readable dispositions (`research-wave-2026-10-04/wave-2/scratch/W2-R/candidate-dispositions.json`) preserve every duplicate note row and its source text. Generator (`research-wave-2026-10-04/wave-2/scratch/W2-R/candidate_disposition.py`). No settled row here is a fresh original-runtime certification.

## 4. Implementation plan from the additional research wave (`IMPLEMENTATION-PLAN.md`)

The additions are feasible with the available retail data and current web architecture. The largest work is coordinating existing subsystems: one admitted game must own its actors, settings and persistent state; actor action rules must reach both local prediction and server validation; animation/world state must reach its visual and sound consumers. None of the tasks below requires the unavailable HDD maps.

This is a proposed implementation sequence, not gameplay implementation or a runtime-parity sign-off. Detailed citations and owed evidence remain in [combat/actor](194-w2-a-combat-actor-gaps.md), [multiplayer](195-w2-b-multiplayer-integration.md), [world/audio](196-w2-c-world-presentation.md) and [input/voice](197-w2-r-input-voice-integration.md). Existing Crossroads/all-map, hostage, options, service and presentation tasks stay in their existing plans; these tasks extend them.

### 4.1 Work packages and feasibility

| Package | Concrete result | Complexity / available evidence | Depends on | Evidence still needed for complete parity |
|---|---|---|---|---|
| WP1: game identity and effective configuration | An authenticated service world admits one seat to its own match; settings/counts actually reach the simulation | Large integration; account, lobby and match modules already exist. W2-B-01/02 define the missing contract | Existing SVC-07a account/lobby work | Remaining original option ranges and admission/host-exit captures; browser reconnect policy remains a deliberate adaptation |
| WP2: coherent current-state restoration | Join/reconnect reconstructs phase/results, existing projectiles/effects and corpses without replaying history | Medium-to-large protocol/client work; concrete gaps and native creation/apply references available, W2-B-03/04/05 | Stable game/round/seat identity from WP1; can prototype pure record/codec work independently | Class-specific original late-join projectile behavior, corpse/result presentation |
| WP3: actor action permission | Authored NoFire thresholds and actor gates determine accepted fire/reload at the command's time | Medium data/rule work with larger motion-state integration; retail field and scalar comparator recovered, W2-A-02 | Existing motion parser and client/server actor state | Remaining raw flags, blended leaf traversal and equipment exception classification |
| WP4: damage/action transitions | Integrate the already sourced flinch reload gate and blast/action-stack transitions | Medium-to-large shared state-machine integration, W2-A-03/04; prior C1 work retained | WP3; existing flinch, blast and traversal code | Exact ladder/hang interruption, priorities, prone cover and animation boundaries |
| WP5: in-round dropped inventory | Eligible classic deaths create actual remaining items/ammo; pickup atomically changes live kit and world objects | Large feature spanning world entities, inventory, HUD and replication; no basic pickup art shortage, W2-A-01 | WP2 stable entities and kit revisions; WP3 eligibility | Exact capacity redistribution, launcher cases, lifetime, settling, owner departure and prompt tie-break |
| WP6: voice/preset consumers | Radio payloads/icons agree; configured talk actions do not also switch weapons; command state stays separate from actor life | Small source corrections plus existing large voice implementation; W2-R-01/02/03/04/05 | Existing SVC-20/21/22, ONL-16b/MATCH-05; WP1 identity; preset/options integration | Dead-talk reachability, indicators/stance, channel membership count transitions and physical devices |
| WP7: interactive clutter | Nearby eligible actors bend the correct instances and trigger the authored rustle on bend-state creation | Medium scene/render/audio consumer; 4,759 dynamic instances on 11 retail maps, W2-C-01 | Existing clutter instancing and audio; stable local instance IDs | Live bounds used by the now-sourced radius formula, bend trajectory, remote/offscreen participation and reset/retrigger timing |
| WP8: persistent positional audio | World/animation sound references update existing voices, follow moving nodes, stop/fade/clean up, and preserve effective command controls | Medium interface work plus larger animation integration, W2-C-02. Traced automatic Doppler is ignored by native command mask5; separate active SOUND pitch update/driver conversion is now sourced | Existing world animation/SoftImage plans and audio backend | Original pitch range/sample-rate captures, 30-tick auto-pan timing, discontinuities/fades and some map caller gates |
| WP9: bounded list/lock consumers | Game list uses its own sort priority; persistent-game UI uses the sourced lock/fallback branches | Small-to-medium online UI extension, W2-B-06/07 | Existing game-list/lobby pages and WP1 service data | Broader persistent-game entry/lock paths and visual reference |
| WP10: explosive and pellet eligibility | Preserve the authored explosion obstruction flag, refuse C4 placement on the exact prohibited surface, and close the shotgun guard's reset interval | Small data/predicate changes with medium collision/update integration; W2-A-09/10/11 close specific source gates in existing combat work | Existing C1 damage/C4 targeting, Breach targets, WP2 projectile state and WP3 action eligibility | Material/interface exclusions and attenuation order, target ray correspondence, volley/actor-update scheduling and original boundary captures |
| WP11: damage-triggered mine detonation | Eligible Claymore/PMN entities receive incoming damage and enter the sourced queued detonation state | Medium-to-large collision/entity integration; W2-A-21 traces the authored `Volitile` field to the native damage interface. Current fire/blast target queries omit these entities | WP2 stable projectile state and ownership; existing damage/visibility rules and model geometry | Which authored geometry reaches the callback, queue timing, chain ordering, owner departure and original bullet/blast captures |

Complexity is relative, not a calendar promise. WP5 and WP8 must not be declared parity-complete by inserting guessed ammo lifetime or inventing audible pitch behavior from a computed but ignored argument. Interface/data-preservation work can proceed while narrow source/capture questions remain open.

### 4.2 Shared state contract

These are proposed browser records. Native functions establish behavior; they do not mandate a TypeScript schema or transport.

| State owner | Stable key | State needed by consumers | Reset / cleanup boundary |
|---|---|---|---|
| Service game | worldId | validated settings revision, membership, current map selection and world status | Explicit world end/logout/host policy; socket replacement is a separate transition |
| Live match | worldId + map/round generation | phase, authoritative phase start/deadline, counters and current result representation | New map/round; reject prior-generation events |
| Player seat | stable membership/seat + incarnation | active role, transient actor wire ID, live kit revision, actor action/life state | Replacement transfers only approved state; reused wire IDs do not transfer identity |
| Corpse | actor incarnation + death generation | selected death representation, death time, eligible physical motion | Original lifecycle policy, separate from unspawned ghost and independent of dropped inventory |
| Projectile/charge | generation + entity ID | kind, owner/credit policy, position/orientation, motion/rest state, phase clock and removal | Source-consistent explosion/removal plus map/round reset |
| Persistent effect | generation + effect ID | enough current phase/time/transform to reconstruct smoke or other lasting visuals | Effect end/reset; may outlive the projectile simulation object |
| Pickup | generation + entity ID | item/bundle contents, actual ammunition, transform, claim/residual state | Accepted transaction, original expiry policy when sourced, reset |
| Environmental switch/object | authored map object ID + generation | intact/triggered/destroyed state, geometry/collision activation and relevant timeline | Existing per-map round reset; Crossroads bridge state remains separate from bomb state |
| Sound reference | animation/effect instance + reference ordinal | definition, live playback handle, current source transform, effective volume/pan/authored-pitch controls and cleanup flags | Start replacement, stop/fade, owner exit, map unload |
| Clutter instance | map archive record/model ordinal | base/live transform, active bend/retention and local influence set | Native mission/actor cleanup; round relationship still to verify |

Do not use a recyclable player ID as world-entity identity or career identity. Do not share mutable sound state merely because two voices use the same sample. Do not add network replication to clutter just because actors can disturb it: no such original protocol has been established by this wave.

### 4.3 Order of implementation

1. **Publish explicit contracts before wiring more entry points.** Resolve world/account/page/seat ownership and genuine-leave versus replacement transitions; define one effective match-settings record. Reuse the existing services. Add tests for two separately created games on the same map, one-use login tickets, old-socket close after replacement, watch/password admission, role/count changes and failed loading cleanup.
2. **Deliver one versioned join-state envelope.** Reconstruct current state idempotently. A fresh observer and an existing observer should agree on current phase/result, persistent objects and corpse age/pose. A snapshot must not replay prior killfeed entries, damage, score awards or blast sounds. Keep reliable deltas and snapshots under the same generation contract. The exact native late-join look remains a separate comparison gate.
3. **Build the shared actor permission layer.** Parse authored NoFire; preserve phase/direction and necessary raw flags. Evaluate permission for the command being validated. Connect both local effects/ammo and room acceptance; do not simply copy current visual pose into historical validation. Then add flinch/reload and surviving blast/traversal transitions.
4. **Add world inventory transactions.** Use the stable entity contract, exact residual ammunition and correct slot replacement. Request/acceptance must be atomic and idempotent. Saved loadout preferences remain separate from the in-round kit. Close ammo capacity/lifetime uncertainties rather than filling them with default magazines.
5. **Connect voice through semantic actions and room state.** Apply TEAM0/DEFENSE1/OFFENSE2, side mapping and exact-channel rules from the existing voice plan. RUN AND TALK consumes configured SwapWeapon2 and suppresses its ordinary swap. Default/Reverse/Config4 use Circle for TeamCommand; Goldeneye uses Square. The command object's states4/5 are not actor life or animation IDs. Preserve OT.R24's codec decision.
6. **Implement shared world presentation consumers.** Preserve clutter dynamic fields/identity; add actor influence and bend-state creation events. Add animation-owned sound references and live transform updates. This supports the already planned helicopters, airstrikes and destruction without each map inventing its own audio lifecycle.
7. **Integrate with the prior all-map plan.** Every bridge/gate, objective, NPC and turret state uses appropriate shared ownership/reset/restoration contracts. Add map-specific authored IDs and acceptance routes from WT-R96..102. Crossroads gets its two independent bridge detonators and ordinary shared Demolition bomb according to that existing plan; no new shared-bomb dependency is introduced.
8. **Finish the newly closed combat consumers within the existing damage work.** Carry `IgnoreExplosionDI` from ammo and script-produced explosions into the two sourced blast obstruction/material decisions. Continue checking radius, target eligibility and team rules. Refuse final C4 set-down on an exact `INVISIBLE_DI` material-name match; that refusal alone does not authorize any other surface. The shotgun guard reset is located, but its relation to volley scheduling must be established before choosing a server guard interval.
9. **Add damageable mine entities after establishing collision reach.** Read the retail `Volitile` field (present on Claymore and PMN ammo in the 39-row census), retain the existing projectile identity, and route eligible incoming direct-hit/blast damage to its sourced transition. The original callback evaluates incoming damage with minimum1.0, excludes already-exploding target states5/6 and gates local ownership online before queuing kind3/stage2. Central server arbitration is a browser adaptation; it must preserve the effective transition and avoid duplicated explosion/scoring. Do not make every projectile or every charge damageable because a generic flag name exists.

WP3 and the data-preservation portions of WP7/WP8 can begin independently of service wiring. Full match tests require the connected architecture. WP9 can proceed with online UI work once game-list data ownership is clear.

### 4.4 Acceptance that catches integration mistakes

| Scenario | Required observation |
|---|---|
| Two service games select the same map/rules | Separate members, score, objects, doors, bans and settings |
| Old socket closes after replacement | New seat remains admitted; account/world are not erroneously logged off |
| Late observer joins while grenade flies, charge waits or smoke persists | Sees current objects/effect phase; no historical blast, ammo expenditure or score replay |
| Charge owner changes or wire ID is reused | Server decision and all observers refer to the same entity/ownership policy |
| Join halfway through each result panel | Current panel/result and remaining time agree with existing observer |
| Join after an old corpse has faded | Does not restart a fresh corpse or invent a death clip; ghost stays distinct |
| Fire at NoFire threshold exactly / just beyond | Strict native comparator holds; reverse play uses its own boundary; jump is not blanket-disabled |
| Reload during an eligible short flinch | Uses the sourced action gate; no unintended universal trigger/look/movement lock |
| Nonlethal blast during hang/ladder/turret | Source-closed switch/turret/stack operations occur once; ladder/hang attachment and mover outcome follow the owed capture, with no invented force-idle rule |
| Flagged/unflagged explosion behind the same material | Only the sourced obstruction/attenuation decisions change; outside-radius, team and target-health exclusions still hold |
| C4 set-down at exact prohibited name, case variation and ordinary surface | Exact `INVISIBLE_DI` is refused; other names proceed through all remaining target/action checks |
| Multiple pellets, two shooters and impacts spanning actor updates | Correct native guard interval after scheduling is closed; no permanent latch and no assumed once-per-trigger equivalence |
| Authored Claymore/PMN receives a bullet or nearby blast | Eligible geometry reaches the shared damage consumer; damage failing its minimum leaves the target unchanged; sourced queue/state/ownership gates hold |
| Two flagged mines, fuse/hit race, owner departure and new round | Source-consistent chain timing and authority; no duplicate explosion/score, stale entity hit or revived prior-round mine |
| Two players claim one drop; acceptance repeats | One transfer; actual ammo conserved; residual bundle and remote kit agree |
| RUN AND TALK on/off under all presets | Correct talk/menu action, no competing secondary swap; unmapped action remains explicit |
| Leave/change channel/disconnect while talking | Floor, input and microphone lifecycle stop according to the implemented contract; no stuck transmission |
| Two same-model clutter instances and two same-sample sound instances | Independent state, no accidental sharing by name/path |
| Remain in foliage, exit, settle, re-enter | Native creation/retrigger semantics; no rustle every frame; silent map bindings stay silent |
| Aircraft sound update, cleanup and map change | Existing voice follows current node; no replay on update and no orphan voice |
| New round with bridges/drops/charges/actors already changed | Correct authored reset; no old-generation command alters the new round |

These tests are future implementation acceptance, not tests already passed in this research wave. First run meaningful data/rule/codec tests; then controlled local multi-client scenarios; finally compare original captures at defined moments/tolerances. Do not equate a passing transcription test with original runtime behavior.

### 4.5 Narrow source/capture work still owed

- Pickup: trace `005bb000`/`005ba770` capacity redistribution, launcher compatibility, lifetime/settling and owner departure. Capture classic death, exchange and contention with actual ten-slot magazine contents. Retain the already read respawn death-drop suppression without enabling owner-disabled respawn in the product.
- Actor action: complete blended-leaf and raw link/flag interpretation; capture threshold boundaries and interruption priorities for flinch/reload, blast/traversal and prone cover. `005a5da0` completes a pending weapon/launcher switch; it is not a ladder-release helper. Exact ladder/hang attachment, actor state and mover outcome remain owed. Preserve jump/short-flinch negative cases.
- Explosives/pellets: retain A11's two distinct blast consumers and the script-set flag producer; capture material attenuation and player/destructible boundary cases. A10 closes exact-name C4 refusal, while final ray/target correspondence remains owed. A09 closes the guarded actor-update reset at `00550f9c`, while ordering across pellet contacts, shooters and actor updates remains owed. The raw online pellet-damage path and body penetration are already covered by C1, not new discoveries here.
- Damageable mines: A21 closes the authored flag → model damage interface → incoming-damage callback → queued detonation chain, including direct and blast dispatch. Close geometry reach, queue ordering and lifetime/ownership behavior before certifying Claymore/PMN chain reactions. Keep `Volitile` distinct from C4's `IgnoreExplosionDI`; they serve different consumers and have different authored records. A17's lasting body-blood mark remains a partial projection trace; settle character-versus-wall destination and lifetime before specifying a missing visual feature.
- State restoration: original two-console joins at controlled grenade/charge/corpse/result phases. Record what state exists at creation/apply and what the viewer actually draws; native structs alone do not close presentation.
- Voice: inspect command byte `0x413870` and voice fields through living/dead/spectator transitions, channel changes and talk presses. Capture indicators/audio, channel-count membership changes and Goldeneye behavior. Physical mobile controller/mic and permission/audio-route checks remain device tests, separate from viewport emulation or source review.
- World/audio: use the sourced clutter radius formula and actual live model bounds; capture bend trajectories, offscreen/remote influence, discontinuities and cleanup. Follow effective receiving-driver command masks for pitch; the traced automatic Doppler argument is ignored and must not become an invented audio effect. The retail-driver follow-up (`research-wave-2026-10-04/wave-2/scratch/W2-B/pitch-followup.md`) closes the separate active SOUND absolute note/fine path, relative modifier units and LIBSD conversion; original audible range/sample-rate behavior and fresh-start correspondence remain capture gates. MP11's foliage name lacks a direct own-bank binding; MP52/53 chopper callers still need the specific activation read. MP72/82 bank reuse alone is not proof of an audible helicopter.
- Service/list: close the remaining persistent-game entry/lock paths and original option picker ranges. Preserve known browser policy choices and existing deferred career/rank posting rather than inventing new original rules.

The review excludes campaign-only melee/restraint/body-carry affordances from online scope, preserves existing visual gaps already covered by C9, and leaves the three HDD maps explicitly unavailable. No implementation estimate assumes those assets exist.
