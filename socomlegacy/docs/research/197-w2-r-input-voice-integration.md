# 197 -- W2-R: input, options and voice integration

- Research date: 2026-10-04 (research wave 2; the index is [178](178-the-research-wave-of-2026-10-04.md)).
- Origin: `research-wave-2026-10-04/wave-2/W2-R-input-voice-integration.md` on the owner's host, in the evidence archive ([178](178-the-research-wave-of-2026-10-04.md) gives its root). A relative `scratch/...` path below is under `research-wave-2026-10-04/wave-2/`; the per-cluster `ledger-*` files it names are merged in [`ledgers/2026-10-04/`](ledgers/2026-10-04/README.md).
- Trees compared: **PORT** = `agent/online` at 2026-10-04 (written `$PORT`; `$PORT/..` is that branch's root, `$WEBISSUES` the `agent/web-issues` checkout); **WT** = the old-layout checkout (`$WT`, the clone's pre-restructure web project). WT-96..102 are notes 171-177 here; PORT's own notes 96-102 are other notes.
- **Status: reading, pending review -- not adopted.** Nothing in it is adopted until a sprint task takes it and a reviewer re-reads it at the source.
- Grades: wave 2 normalised its own work as "source reading" (= **reading**, pending review), "inference" and "unresolved"; a first-wave grade it quotes keeps the first wave's words (PROVEN = **reading**; STRONG = reading with one interpretive step; BELIEVED = inference). Nothing here was measured running.
- Verification: no separate verifier's file; the wave's cross-review ([198](198-wave-2-review-and-implementation-plan.md) §2) and its `VALIDATION.json` (in the archive) are its checks. Landed with the wave.
- Edits on import: the headings are numbered for the corpus; home-directory paths are replaced by `$PORT`/`$PORT/..`/`$WEBISSUES`/`$NPX_TSX`; the archive's absolute root is dropped; references to the other reports are links to their notes. The substance is verbatim.

This extends PORT-R170 and the first wave's C5a/C5b input/options work. It does not rediscover voice as a missing feature: OT.R23 already requests it, and OT.R24 already selects Opus narrowband at 6 kbit/s. The additions close concrete ambiguities, identify a competing input consumer, and correct a state-object interpretation that could lead to the wrong implementation.

`PORT` and `WT` are the separately pinned trees in BRIEF.md (`research-wave-2026-10-04/wave-2/BRIEF.md`). `D` is the r0001 decompilation. All conclusions below are source readings; no original runtime or browser was run. W2-A independently checked the TeamCommand object/tick, RUN AND TALK swap suppression and side predicate against the native source. See [cross-review scope](198-wave-2-review-and-implementation-plan.md). Byte reads are not gameplay parity certification.

| ID | Finding | Novelty | Proposed sequence |
|---|---|---|---|
| W2-R-01 | RADIO menu uses TEAM 0, OFFENSE 2, DEFENSE 1; the +4 predicate is the Terrorist predicate | Extends PORT-R170; corrects its provisional row ordering | P1, with SVC-20c/MATCH-05 |
| W2-R-02 | RUN AND TALK consumes the configured SwapWeapon2 action and suppresses its weapon swap; TeamCommand follows the preset | Extends C5b and PORT-R170; adds the consumer conflict | P1, before voice input integration |
| W2-R-03 | R170's states 4/5 belong to the TeamCommand menu object, not the actor's life/stance state | Extends and corrects PORT-R170; removes a false premise from the dead-talk investigation | P1 |
| W2-R-04 | HUD channel-count query traced into library channel records; lifecycle semantics still owed | Extends PORT-R170's note-only count question | P2 |
| W2-R-05 | M1's unidentified objective commands are MP DEFUSE BOMB (0x2e), MP PROTECT (0x2f) | Extends M1 presentation/command reading | P2 |

## 1. Radio label, payload and side agreement

PORT-R170 §10 assigns provisional numbers using menu order: 1 OFFENSE, 2 DEFENSE. It explicitly notes the HUD disagrees and asks for the menu-event read. That read is now complete:

| Label at r0001 address | Registration at `FUN_002344e0` | Payload to `FUN_0022f950` | HUD |
|---|---|---|---|
| TEAM, `0x3e61b0` | D83790 | 0 | `action_tune_team.tif` |
| OFFENSE, `0x3e61e0` | D83791 | 2 | `action_tune_offense.tif` |
| DEFENSE, `0x3e6210` | D83792 | 1 | `action_tune_defense.tif` |

The action handler validates 0..2, applies `FUN_002c2c20`, and remembers the returned base channel (D81576–81592). The HUD selects texture fields +0x84/+0x88/+0x8c using bases 0/2/1 (`FUN_002393f0`, D85908–85916; texture loads `FUN_00239570`, D85966–85971). This closes `VOICE_OFFENSE_DEFENSE_NUMBER_READING` at source-reading level. Do not swap the artwork to compensate for the prior provisional menu order.

The +4 side predicate in `FUN_002c2c20` D164449–164458 equals `FUN_002c30b0`'s actor team predicate D164664–164704. PORT-R94 already identifies that predicate as Terrorist, with weapon-side masks and player_team writes. Independently, `FUN_002c3330` D164835–164855 writes player_team 0 for its complement and 8 for this predicate; those values are the existing R94 SEAL/Terrorist consumer contract. The ordinary alive/dead side-channel reading is therefore SEAL 0..3 and Terrorist 4..7, even when the underlying team-word constants swap with `DAT_004412d8`. This is a cross-connection of existing side evidence, not a new team definition.

Precisely, `FUN_0030fcd0` D211584–211595 stores the requested base at voice+0x2c, combines it with the side selector using **bitwise OR**, then updates effective channel +0x24/+0x28 only after the library accepts the change. For bases 0..3 and selector 4 this equals addition. Do not generalize it into arithmetic for every base or infer successful state changes from a requested value alone. Lobby/spectator/null-actor guards remain the original R170 runtime-capture obligations; this trace does not settle them.

Implementation: one semantic channel enum shared by command rows, HUD icons and room-side routing; base and effective channel kept distinct. Preserve the known channel-change release rule. Acceptance: each menu choice selects its matching icon and exact channel, both sides and both side-word assignments; failed channel changes do not falsely report success. Cross-team, dead/alive, spectator and lobby transitions need the original two-instance comparison already owed by R170.

## 2. Presets and the competing secondary-weapon consumer

The r0001 action-name table at `0x3f2be0` has 13 entries. Index 10 is SwapWeapon2; index 11 is TeamCommand. `FUN_002c67f0` D167137–167154 finds a result name in that table and stores the configured button at config+0x12+action. `FUN_002c64e0` D166923–166929 reads that configured slot; sentinel 0x10 means unmapped. These action numbers are **not physical pad slot numbers**.

The disc's `RUN/READERC.ZAR/controller.rdr` gives:

| Preset | SwapWeapon2 (action 10) | TeamCommand (action 11) |
|---|---|---|
| Default | L2 | Circle |
| Reverse | L2 | Circle |
| Config4 | L2 | Circle |
| Goldeneye | unmapped in this data | Square |

The new direct disc read reproduces all four configurations and preserves conditional mappings, including Goldeneye's AimMode-dependent axis behavior. The first wave had already dumped these presets; the new result is their connection to voice and weapon consumers.

`FUN_002351a0` D83895–83920 reads action 10 when RUN AND TALK is enabled, multiplayer is active and the TeamCommand controller is in state 4. Meanwhile `FUN_00594cf0` D453301–453310 checks **RUN AND TALK disabled** before processing action 10's rising edge as a weapon swap. Adding a talk handler while retaining the unconditional swap would trigger two actions. `FUN_002359a0` D84267–84281 uses action 11's held state for the other talk route; the disc mapping makes this Square on Goldeneye, not Circle.

PORT currently models a fixed Default layout: `packages/viewer/src/gamepad.ts:46` has no talk/TeamCommand input lane, L2 maps to swap2 at 186, and Circle's viewer-only boost is documented at 213. `packages/viewer/src/main.ts:1584`–1587 consumes swap2 to select the pistol without a RUN AND TALK gate. This is an integration dependency on the already planned options/preset and voice tasks, not a claim that voice is implemented incorrectly today.

Implementation: resolve physical inputs through the selected preset, then arbitrate semantic actions using the original gates. Do not implement voice by globally binding L2/Circle independently of presets. Preserve the owner-selected keyboard/touch adaptation separately. Unmapped actions must remain unmapped unless an explicit browser adaptation is chosen; this source does not authorize inventing a Goldeneye RUN AND TALK key.

Acceptance: RUN AND TALK off gives a secondary swap and no talk; on suppresses that swap and uses the talk route; TeamCommand hold and short-release behavior share one state machine; controller preset changes while a button is held do not synthesize a second action. Run all four presets. Add release tests for controller loss, focus loss, leaving a game, changing channels and opening a consuming menu when implemented. These are proposed browser integration tests, not assertions about original hardware behavior.

Owed: runtime timing/animation, exact Goldeneye experience, controller preset-option application through UIStoreOptions, and original talker captures. Existing C5b/R116 menu-pad flush work and the general options roadmap are already covered and should not be reissued as new discoveries.

## 3. The talk state is a menu state

PORT-R170 §10 asks whether dead players can talk because the setter runs only from "player state 4"; it also calls state 5 a talk stance. The source object identity narrows that uncertainty:

- `FUN_00232bc0` constructs the command controller at the fixed address `0x413120` (caller D57448).
- The per-frame caller invokes `FUN_00236430(dt, 0x413120)` at D56689, then `FUN_002360d0(dt, 0x413120, pad)` at D56691 when its separate mode gate permits.
- Those functions inspect **that object's +0x750**, `0x413870`, and `FUN_00236250` simply writes its state byte (D84448–84454). The same object's menu-row/vector fields, selection depth +0x758, transition fades and open/close paths appear in `FUN_00231690` D82454–82504.
- The caller's alive check sends input to living/dead actor handlers at D56656–56660, but the TeamCommand tick at D56689 is outside that alive/dead branch. It still requires the surrounding non-null actor and other gates; this does not prove all dead/spectator cases reachable.

States 4 and 5 must therefore be represented as command-controller states, separately from actor life, locomotion or animation enums. The old wording is not evidence that a dead actor must attain a living player state before talking. State 5 may affect movement through calls on the actor controller, but its number alone is not an animation/stance ID.

Feasibility: straightforward state separation; exact behavior still requires tracing/capturing the downstream controller lock and transitions. Acceptance captures: one same-side pair, kill one, inspect command byte `0x413870`, voice pointer `DAT_0045b718` and +0x24/+0x2c/+0x4a while pressing each talk route; compare with living and spectator states. Keep `VOICE_DEAD_TALK_READING` and `VOICE_TALK_STANCE_READING` open with this corrected premise.

## 4. What the HUD count reads

New trace: `FUN_0030ec10` D211004 queries into voice+0x54. `FUN_00623ae8` D532853–532877 calls `FUN_006432c8` D556960–556989. That queries channel records through `FUN_0062bfd0` → `FUN_00611b08` D520675–520699. The callback `FUN_00644c90` D558074–558079 matches the channel ID, takes the record's second ushort and stores it at session+0x214. The query copies that value into result+8, i.e. voice+0x5c. The record producer `FUN_00624b88` D533725–533729 gets this field from `FUN_0062a2e8(channel+0x50)`, whose body D537979–537982 returns the collection header's count.

This establishes that the HUD number follows a channel collection count, not the floor-owner table or the HUD's visible teammate rows. `FUN_00238ac0` D85707–85714 formats it or uses `?` outside 0..99. It does **not yet establish** every membership lifecycle rule, local-member inclusion in all states, muted-member treatment, or stale-query presentation on failure. R170's existing idle frames showing 1 remain useful but are not a new capture by this wave.

Implementation: derive a channel-member count from authoritative membership, separately from floor occupancy and local mute state; preserve uncertainty on the exact original membership filter until resolved. Acceptance: same channel with 1/2 members, split offense/defense, mute one, death, spectator join, leave, reconnect; inspect the original field and image on each transition. Do not infer zero members from a failed query.

## 5. Mode-conditioned command identifiers

M1's unresolved 0x2e/0x2f labels are registered at D83771–83772: `0x3e5ff8` is **MP DEFUSE BOMB**, `0x3e6030` is **MP PROTECT**. Both call `FUN_0022fc00` and use `FUN_0022fa90` as their visibility gate. The gate D81626–81684 permits 0x2e for mode bytes 1/2 (Breach/Demolition) and 0x2f for 3/4 (Escort/Extraction), consistent with M1's mode byte read.

These are command identifiers. This finding does not claim that clicking a message performs a bomb defuse or protects an NPC. Preserve the command consumer's behavior and localize its display separately. Add both labels/gates to the planned TeamCommand table tests; no new game-objective mechanic is implied.

## 6. Reproduction and limitations

- voice_evidence.py (`research-wave-2026-10-04/wave-2/scratch/W2-R/voice_evidence.py`) reads the ELF strings/action table, extracts menu registrations, asserts label/payload pairs and records hashes/enclosing functions. Output: voice-evidence.json (`research-wave-2026-10-04/wave-2/scratch/W2-R/voice-evidence.json`).
- controller_probe.ts (`research-wave-2026-10-04/wave-2/scratch/W2-R/controller_probe.ts`) reads the original archive with PORT's existing Zar reader; output: controller-evidence.json (`research-wave-2026-10-04/wave-2/scratch/W2-R/controller-evidence.json`), including archive/member hashes and every mapping.
- voice_probe.py (`research-wave-2026-10-04/wave-2/scratch/W2-R/voice_probe.py`) supports scoped decomp, word, pointer-reference and instruction reads. Its ELF VA mapping uses PT_LOAD segments. MIPS/R5900 instructions unsupported by Capstone remain explicit undecoded words.

No browser/device validation took place during this research-only wave. Earlier launch-page work is a separate change in WT. Physical mobile controller/microphone permission and audio-route behavior cannot be certified by this source analysis. HDD map assets remain unavailable and were not requested again.

The first wave's completed [184](184-c5b-frontend-dialogs-input-boot.md) appeared during this review and was checked after publication. Its 68-row menu/input/boot scope is retained; it does not close the voice/TeamCommand/SwapWeapon2 consumer chain above. The already dumped controller presets remain prior coverage.
