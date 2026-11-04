# 196 -- W2-C — world and presentation integration

- Research date: 2026-10-04 (research wave 2; the index is [178](178-the-research-wave-of-2026-10-04.md)).
- Origin: `research-wave-2026-10-04/wave-2/W2-C-world-presentation.md` on the owner's host, in the evidence archive ([178](178-the-research-wave-of-2026-10-04.md) gives its root). A relative `scratch/...` path below is under `research-wave-2026-10-04/wave-2/`; the per-cluster `ledger-*` files it names are merged in [`ledgers/2026-10-04/`](ledgers/2026-10-04/README.md).
- Trees compared: **PORT** = `agent/online` at 2026-10-04 (written `$PORT`; `$PORT/..` is that branch's root, `$WEBISSUES` the `agent/web-issues` checkout); **WT** = the old-layout checkout (`$WT`, the clone's pre-restructure web project). WT-96..102 are notes 171-177 here; PORT's own notes 96-102 are other notes.
- **Status: reading, pending review -- not adopted.** Nothing in it is adopted until a sprint task takes it and a reviewer re-reads it at the source.
- Grades: wave 2 normalised its own work as "source reading" (= **reading**, pending review), "inference" and "unresolved"; a first-wave grade it quotes keeps the first wave's words (PROVEN = **reading**; STRONG = reading with one interpretive step; BELIEVED = inference). Nothing here was measured running.
- Verification: no separate verifier's file; the wave's cross-review ([198](198-wave-2-review-and-implementation-plan.md) §2) and its `VALIDATION.json` (in the archive) are its checks. Landed with the wave.
- Edits on import: the headings are numbered for the corpus; home-directory paths are replaced by `$PORT`/`$PORT/..`/`$WEBISSUES`/`$NPX_TSX`; the archive's absolute root is dropped; references to the other reports are links to their notes. The substance is verbatim.

| ID | Finding | Novelty | Proposed priority | Evidence status |
|---|---|---|---|---|
| W2-C-01 | Interactive clutter loses its bend state and world rustle event between parsing and rendering | Extends C9's root-key inventory; new native consumer/integration closure | P1 | Source reading, independently reviewed; disc inventory measured |
| W2-C-02 | Persistent positioned sounds need an animation-owned handle, moving source coordinates and cleanup | Extends C7 §3.1 / PORT-81 shared sound rules into world-animation consumers and exact MP bindings | P1 | Source reading, independently reviewed; disc/instruction inventory measured |
| W2-C-03 | Camera/LOD/detail/zoom and related render omissions | Covered by the newly published C9 report | P2 | Prior source/capture claims retained with their limits |
| W2-C-04 | Existing map objectives, collision mutations, environmental animations and turrets | Covered by WT-96 ([171](171-crossroads-demolition-and-bridges.md)) through WT-102 ([177](177-emplaced-weapons-audit.md)) | P1 | Separate prior map audit; no duplicate work item here |
| W2-C-05 | Automatic Doppler candidate is not an audible retail requirement on the traced route: the receiving driver ignores its computed pitch argument under mask 5 | Supersedes the initial W2-C candidate after deeper receiver review | P2 | Native EE and IOP source/instruction reading, independently reviewed |

These are implementation sequencing priorities, not a claim that each blocks launch. No browser, server, game or new original-runtime comparison was run. Parsing game files and executing small instruction models measures those artifacts; it does not establish visual or audio parity.

## 1. Scope, snapshots and prior coverage

`PORT` is `$PORT`. `WT` is `$WT`. `D:L` names a line of `C:/projects/socom_pc/game/analysis/socom2_game.elf.decomp.c`; every EE address below is **r0001**. The ELF is `C:/projects/socom_pc/game/disc/socom2_game.elf`; retail archives are under its sibling `RUN/`. IOP D:L names `game/analysis/989SND.IRX.decomp.c`, whose addresses refer to the shipped `game/disc/RUN/IRX/SOUND/989SND.IRX` module.

Inspected PORT and WT files, native inputs, all 22 MP archives and both sound archives are pinned in fingerprints.json (`research-wave-2026-10-04/wave-2/scratch/W2-C/fingerprints.json`), produced by source-evidence.py (`research-wave-2026-10-04/wave-2/scratch/W2-C/source-evidence.py`). The ELF SHA-256 is `06b83684719a78ad0580f236bd0eddd40453f87d9c30c0d39021331915798872`; D is `b9e863762f08d55602c4310c9491286879cfcf2947683e723bc2905e1aaa42d4`. This matters: PORT audio, main and loadMap differ materially from WT, although the two clutter.ts files and worldRoot.ts files are byte-identical.

Prior work reviewed includes C7's tuner/ELF/sound sweep scratch, C9's camera/root-key/detail/prop-track scratch, the subsequently published [C9-world-render-platform.md](188-c9-world-render-platform.md), PORT-81/82/84/94/101 and WT-96 ([171](171-crossroads-demolition-and-bridges.md))..102. The initially absent or partial reports were not treated as evidence that a lane did no work. A final focused reconciliation reread the expanded C7 report and the completed H1/H2/H3 reports at **2026-10-04 06:59:45 UTC**. The exact inspected versions are pinned in final-prior-reconciliation.json (`research-wave-2026-10-04/wave-2/scratch/W2-C/final-prior-reconciliation.json`), including modification time, line count, relevant search anchors and the then-current 41-file C7 scratch census.

| Final prior report inspected | Bytes | SHA-256 |
|---|---:|---|
| [C7 audio/movie](186-c7-audio-movie.md) | 36,463 | `54eeb3c313bc0e56c9f7a5ee9a5b41094ce6968bb6f0ac0daddf916986d71922` |
| [H1 hostage actor](189-h1-hostage-ai-animation.md) | 31,838 | `d3ad39f007ea2a0a844b6820c807ffcdeae007c28f35f4f63ce5269fb3428a85` |
| [H2 hostage rules/map](190-h2-hostage-mode-rules-map.md) | 44,374 | `517f83113fcb52d33cedbbafb3f82dc4ba92155b0cfa9a16441946a722fd259e` |
| [H3 hostage networking](191-h3-hostage-net-sync.md) | 48,527 | `fbab23279d4f8d16c134dc2c4e5ee036c409e56c04ad3fa2011c6f9f22c66505` |

C7 §3.1 already closes **animation-instance sound identity** (`STREAM_NAME_SLOT_READING`, lines 284–288) and **stop/fade/detach on animation exit** (`STOP_ON_EXIT_FLAG_READING`, lines 275–282). Those shared native rules are prior coverage, not unique W2-C discoveries. W2-C-02's addition is their missing integration with world-node transforms, update-only SOUND commands and the actual MP10/MP11/MP52/MP53/MP73 program bindings. C7's fades, group levels/options, beds, register-2 rounding, default range, streams and movie findings remain in C7/root's plan; this report does not duplicate them. Its completed text contains no foliage consumer or automatic-Doppler receiver closure, so W2-C-01 and the corrected W2-C-05 retain their scope.

H1's actor state, following, damage, body and clip sections do not trace the clutter effector registration/consumer. Its follow base radius 15 and arrived radius 18.75 (§2/§4) are **AI navigation values**, distinct from W2-C-01's body-bounds-derived foliage radius. H2's objective voice/music bindings and H3's hostage control/sound commands cover NPC behavior/networking, not world foliage or moving-emitter lifetime. None establishes that an NPC enrolls in the traced clutter path; NPC/remote actor participation remains an explicit acceptance/source-integration gate rather than an inferred new feature.

| Area reviewed | Disposition |
|---|---|
| C9 root-key census: FoliageSound present on all 34 shipped maps | Extended below to actual MP values, instance records, actor consumer, sound lookup and missing port seam |
| C9 camera, LOD, detail, zoom, clipping, shadow/default fields and texture scrolling | Covered; C9 closes several source questions. Its U6 and PORT-82 explicitly retain far-cull uncertainty and a skydome counterexample |
| Untextured Material_Palette comment in worldRoot.ts | Stale comment; kind-2 implementation already exists, as C9 U11 also observes |
| NVG/thermal world colouring | Substantial PORT implementation exists in nightVision.ts/lensFx.ts. Do not report it as absent from a world-key grep |
| LensFX_StarlightScope | Prior PORT-84 already names a scope-night-map gap. Not promoted as new: field presence alone does not settle which current view-state path consumes it |
| C9 launcher/other weapon attachment tracks, remote footstep throttle | Existing C9 coverage and W2-A/B ownership; not a new world omission |
| Render passes, detail texture gates, skin influence truncation, grass/water capture discrepancies | Existing C9/PORT-82 coverage, with its explicit unresolved capture gates |
| Destructible bridges/accesses, door/gate transforms, cranes, airstrikes, hostage/escort objectives and turrets | Existing WT-96 ([171](171-crossroads-demolition-and-bridges.md))..102; W2-C-02 supplies a shared audio dependency rather than reopening those map inventories |
| Sound MED/FAR flags | Not a missing native consumer: PORT script.ts documents these authored flags are not in the native key table. Remote weapon distance variants are handled separately |
| C7 shared sound identity and stop-on-exit | Covered by C7 §3.1; W2-C-02 extends these rules into world animation integration, not a second independent feature |
| C7 audio levels, fades, beds, streams, register rounding and movies | Covered by completed C7 §§3–5; preserve its grades/capture gates and root's options integration |
| H1/H2/H3 hostage actor, rules, voices and replication | Covered by completed hostage reports; do not equate AI follow radii with clutter influence or infer NPC enrollment from model sharing |
| Listener basis | Already camera-based in PORT; native 00342670 uses camera transform 0x48dd40. No defect claimed |
| UI sound/music/dialog tuners, voice routes/markers, input and page settings | Root W2-R ownership; C7 scratch supplies tuner leads |
| Late-join projectile/charge/smoke state | W2-B ownership. Network hazard snapshots must not be conflated with the persistent sound handle below |
| Campaign, browser transport, touch/keyboard support, test tolerances | Owner-deferred or deliberate adaptations according to PORT MISSION/owner rulings; no defect inferred |

## 2. W2-C-01 — interactive clutter and rustle events

### 2.1 Current seam

PORT `packages/scene/src/clutter.ts:61,67,92,98` reads `dynamic` and `repelMaxAngle`. `placeClutter` at 202–231 converts each record to a placed model but drops both controls and the live bend quaternion. `packages/viewer/src/loadMap.ts:1203` feeds that placement result into ordinary rendering. `packages/scene/src/worldRoot.ts` has no FoliageSound field or reader, and the viewer audio data has no event from this world subsystem. A static placement is therefore all this path can produce.

The placement path also uses `clutter/<model>` as its path; multiple instances of one model share it. A future dynamic consumer needs stable per-instance identity (archive record/ordinal plus model), not merely that nonunique path. This is a proposed port requirement, not an original network identifier.

The same seam exists in WT: clutter.ts and worldRoot.ts match PORT's hashes. This is not a regression inferred from comparing two different main.ts versions.

### 2.2 Closed native consumer chain

| Source | Reading |
|---|---|
| `00318da0`, D:L217161,217183–186; `0031b0c0`, D:L218257–268 | The world loader reads FoliageSound (ELF string 0x3f6c60), storing the name at world+0x134. Missing field uses `none` (0x3f6cc0) |
| Clutter instance layout and `002d93a0`, D:L178693–728 | Base quaternion +0x00, live bend quaternion +0x10, position +0x20, scale +0x2c, max angle +0x30; dynamic is flag bit 1 at +0x4c. Matrix construction combines the base and live quaternions, then scale and placement |
| `002d7f30`, D:L178017–044; actor setup D:L455842–855; instructions 0x59a2b0–0x59a378 | Registers an influence with actor identity, model-position pointer at model+0x30, actor-velocity pointer at actor+0x38 and a radius. The instructions resolve D's suspicious comparison: obtain bounds at node+0x40 (following instance links through `00541510` when node+0x5f bit 0x40 is set), compute `delta = bounds[+0x0c] - bounds[0]` via `00309200`, then radius `0.5 * max(abs(delta.x), delta.z)`. No Y extent is used |
| `002d8fe0`, D:L178577–608 | The dynamic clutter path calls `002d8330`; frame stamp bits prevent repeating its work for the same instance in one frame |
| `002d8330`, D:L178152–297 | Selects the first registered influence passing absolute axis-delta bounds. It then computes 3D distance but does not apply a second `distance <= radius` rejection before allocating the per-instance active bend state at instance+0x68. On creating that state, lazily resolves world+0x134 via `00344f30` and plays a positioned sound if lookup succeeds |
| `002d8c60`, D:L178469–573 | Moving influences feed horizontal direction and strength; source contains the speed gate 0.01, target `(1-distance/radius)*maxAngle` and smoothing bounded by `min(dt*5,1)`. This does not authorize replacing all eligibility with a guessed sphere-only test |
| `002d8040`, D:L178058–147; `002d8330` | Tracks retention and oscillation, derives velocity when an explicit velocity pointer is absent, relaxes strength when not influenced, and eventually frees the record. The retention immediate is 0x40a051ec = 5.010000228881836, refreshed while influenced; it is not a proven continuous audio cooldown |
| Actor deletion D:L419163, `002d7ea0` | Unregisters the actor's influence |
| `002ac0e0`, D:L151960–961 | Mission-reopen cleanup calls `002d88c0` to clear influence registration and `002d8950(...,1)` to clear bend state. Name-table label is CMission_ReOpen_Unload1; this report does not claim an independently measured every-round reset |

The sound trigger is creation of an active bend record, not a footstep, every intersecting frame or every plant. The record can persist beyond the 5.01 timer until the bend has settled. Do not substitute nearest/strongest-influence selection or add a spherical rejection: the native first axis-qualified influence and later strength computation are separate. These distinctions prevent a superficially plausible implementation from producing different foliage response or constant rustle spam.

### 2.3 Measured retail MP inventory

world-consumers.ts (`research-wave-2026-10-04/wave-2/scratch/W2-C/world-consumers.ts`) reads each MP archive's `CLUTTER.ZAR` and `<map>.ZED/FoliageSound`. world-consumers.jsonl (`research-wave-2026-10-04/wave-2/scratch/W2-C/world-consumers.jsonl`) includes per-model counts, angles and two example placements per map. All 22 retail MP archives were parsed.

| Map | Total instances | Dynamic instances | FoliageSound |
|---|---:|---:|---|
| MP1 | 211 | 0 | none |
| MP2 | 0 | 0 | none |
| MP5 | 363 | 324 | .MOVING_THRU_FO |
| MP6 | 110 | 0 | none |
| MP7 | 193 | 193 | .MOVING_THRU_FO |
| MP8 | 0 | 0 | none |
| MP9 | 92 | 92 | none |
| MP10 | 439 | 424 | none |
| MP11 | 397 | 392 | .MOVING_THRU_FO |
| MP12 | 471 | 347 | .MOVING_THRU_FO |
| MP51 | 0 | 0 | none |
| MP52 | 344 | 344 | .MOVING_THRU_FO |
| MP53 | 0 | 0 | none |
| MP61 | 103 | 0 | none |
| MP62 | 1,128 | 1,128 | .MOVING_THRU_FO |
| MP64 | 482 | 473 | .MOVING_THRU_FO |
| MP71 | 0 | 0 | none |
| MP72 | 0 | 0 | none |
| MP73 | 1,142 | 759 | .MOVING_THRU_FO |
| MP81 | 0 | 0 | none |
| MP82 | 482 | 283 | .MOVING_THRU_FO |
| MP83 | 0 | 0 | none |

Result: **4,759 dynamic instances on 11 maps**, with a named foliage sound on nine maps. Eight of those nine maps' own AM banks contain `.MOVING_THRU_FO`; **MP11's does not**. Bank presence elsewhere does not license borrowing it into MP11. PORT's existing `borrowMissing` is an explicitly named departure and cannot establish native MP11 audibility.

The bank/script join in sound-consumers.jsonl (`research-wave-2026-10-04/wave-2/scratch/W2-C/sound-consumers.jsonl`) gives the directly bound sound `ONESHOT`, RANGE `[80,130]`, volume group 3, bank volume 70 except MP62/MP64 volume 80. Conversely, MP9/MP10 have dynamic foliage but world sound `none`: visible bending and audible rustling must stay separate. Several other banks contain the sound without a dynamic/named world binding; bank presence alone is not activation.

### 2.4 Proposed work and acceptance

Preserve instance ordinal, authored angle and base/live transforms through scene loading. Add a dedicated clutter update consumer with per-instance state, actor influence registration/unregistration and mission cleanup. Update only affected instance transforms, preserving existing batching and culling. Carry FoliageSound as optional world data and emit its native positioned start event on state creation when the loaded sound registry resolves it. Do not add clutter collision or a replicated bend protocol without separate source evidence.

Meaningful checks: static instances remain unchanged; two same-model instances bend independently; entry creates one sound event and remaining inside does not repeat it every frame; settled re-entry can create a fresh event; MP9/MP10 remain silent through this world key; MP11 unresolved sound stays unresolved; actor removal and mission reopen leave no orphan influence/state. Offline tests should use authored MP62 and MP9 records plus source constants, not only mock values mirroring the implementation.

Owed original-runtime acceptance: bend angle/direction and interpolation at matched positions/speeds; live actor model bounds supplied to the sourced radius formula; remote actor participation/audibility; offscreen processing and visibility gates; sound creation/retrigger interval; mission versus round lifecycle. No foliage network event is inferred from the native consumer traced here.

## 3. W2-C-02 — persistent positional sound integration

### 3.1 Current seam and why another map script is insufficient

PORT `viewer/src/soundData.ts:264–275` resolves each self-starting emitter's node through the scene graph once and serializes a position. `viewer/src/audio.ts:777` copies that fixed position into its live emitter. `updateEmitters` at 826–838 recomputes gain and pan as the listener moves, but has no moving-node binding. `LoopHandle` at line 137 exposes only `setGains` and `stop`. Separately, `packages/sound/src/script.ts:22,75` parses DOPPLER without a playback consumer; **receiver review below shows that this absence alone is not a retail mismatch**.

The point-sound `play` path renders a complete event with its initial pan/range, whereas native managed voices can be updated through persistent identity. A source-backed port needs to distinguish initial play, update, stop, fade and animation cleanup. C7 §3.1 already establishes the generic identity/exit semantics; the missing world binding and source-position updates are the additional consumer here. A generic callback that simply calls `audio.play(name)` for every SOUND command would restart update-only sounds. This is an integration requirement separate from W2-B's snapshot protocol for server hazards.

WT has the same basic omission, despite different audio.ts/soundData.ts hashes. The new requirement applies to either snapshot; implement against its own API, not copied line numbers.

### 3.2 Native voice and animation chain

| Source | Reading |
|---|---|
| `003435c0`, D:L242313–560 | Loader handles DOPPLER (ELF string 0x3f7760), setting sound definition+0x1d bit 0 |
| `0026e7c0`, D:L117651–699 | Animation sound references retain name identity, definition handle and voice instance; an existing sound name returns its reference rather than allocating a new one on every command |
| `002659c0`, D:L112349–407 | With flag 0x80 clear, SOUND updates an existing voice. Node flag 2 transforms position through the current node hierarchy; `00347420` writes it. Volume/pan/pitch controls have their own flags |
| `002659c0`, D:L112446–486 | New-play flag 0x80 replaces any previous voice for that reference, starts one positioned or unpositioned, and retains its handle |
| `002659c0`, D:L112359–361 and 112490–510 | Flag 0x200 marks the sound reference for animation-exit cleanup; it is not itself the moving-position flag. Flag 0x100 stops/fades the voice according to the reference's fade value |
| `0026fd20`, D:L118431–477 | Cleanup reads that reference+2 flag: flagged instances stop or fade according to reference+4; unflagged instances use the native detach/release path. Handles and the flag are cleared. This is not permission to stop every unflagged voice abruptly |
| `00347420`, D:L244477–486 | Writes voice+0x10/+0x14/+0x18 source coordinates, subject to sound-disabled state |
| `00342670`, D:L241912–955 | Uses current camera transform to compute source range/pan and authored attenuation |
| `00346ea0`, D:L244310–389; `00347120`, D:L244397–433 | Managed-voice update stores previous distance at voice+0x0c, current source position at +0x10 and sound definition at +0x04. Positioned voices with DOPPLER set and nonzero previous distance compute a pitch argument, then replace previous distance. Computation does not prove the receiver applies it |
| `00340fa0`, D:L241098–107; instructions 0x340fa0–0x341004 | Computes integer `floor(((previousDistance-currentDistance)/1609.343994140625)/(dt/60))` using float arithmetic before the floor conversion |
| Instructions 0x347058–0x3470cc; ELF data 0x3e0078 | That integer is converted to float, multiplied by 10.0, floored and passed to `0033f050`; the result is forwarded as the fifth argument to `00340110` with **parameter mask 5**, alongside volume/pan |
| `0033f050`, D:L239788–795, instructions 0x33f050–0x33f088 | Signed integer conversion uses multiplier 1524 and division by 741 with truncation correction. native-consumers.py (`research-wave-2026-10-04/wave-2/scratch/W2-C/native-consumers.py`) models the literal instructions and records representative positive/negative results |
| `00340110`, D:L240487–506; retail `989SND.IRX` `0000090c`, IOP D:L515–525, and `0000bcbc`, IOP D:L7402–7436 | EE sends RPC 0x21 carrying handle, mask, volume, pan, pitch-modifier and bend. IRX table 0x1b070 entry 0x21 resolves to 0x90c. The receiver applies volume under mask0x01, direct pan under 0x02, AutoPan under 0x04 (arguments include 30 and mode4), pitch modifier under 0x08, bend under 0x10. **Mask5 applies volume and AutoPan; it does not apply the computed fifth argument** |

### 3.3 W2-C-05 — corrected automatic Doppler conclusion

The formula above is present in the EE, but this route's driver mask disables its result. W2-B caught the receiver distinction after the first source review; this report now includes that closure rather than proposing audible Doppler from a parsed flag. The retail IOP instructions are saved alongside the EE instructions in `native-consumers.json`. Later 989snd source (`research/989snd-ziemas/iop/playsnd.c:299–340`) independently agrees with the mask meanings, but the shipped IRX is the primary evidence.

Do **not** add automatic Doppler as a parity fix from these bank flags or formulas. Explicit authored pitch commands use other entry points: W2-B's driver follow-up (`research-wave-2026-10-04/wave-2/scratch/W2-B/pitch-followup.md`) closes active SOUND flag0x40 through `00347450 -> 00340160 -> RPC0x1e` to absolute note/fine units, 128 fine steps per semitone. It also traces the actual LIBSD routine and cautions that PORT render.ts includes extra extreme-range/clamping behavior, so an arbitrary playbackRate conversion is not established parity. This W2-C-05 exclusion remains bounded to the automatic positioned-voice update route. Native AutoPan timing and the applied volume/pan trajectory remain useful acceptance work for W2-C-02.

### 3.4 Authored MP bindings and negative results

`RUN/SOUNDRDR.ZAR/sounds.rdr` plus `RUN/SOUNDS/BNKSTORE.ZAR` binds DOPPLER to `~CHOP_JET` (range 75–320) and `~CHOP_ENG` (100–750) in **MP10, MP11, MP52, MP53, MP72, MP73, MP82** AM banks. Both are non-ONESHOT. Campaign-only script blocks in the probe are explicitly not MP bindings.

sound-scene-bindings.ts (`research-wave-2026-10-04/wave-2/scratch/W2-C/sound-scene-bindings.ts`) joins all 22 maps' common/mission animations and prints command metadata, not extracted assets. Its output (`research-wave-2026-10-04/wave-2/scratch/W2-C/sound-scene-bindings.jsonl`) narrows actual references:

| Map/program | Activation | Actual authored use |
|---|---:|---|
| MP10 `mp10copter` | 1, self-starting | `soundseq` starts the three chopper loops, then calls forever `translate_sound`; jet/engine start at Seq_Data +860/+892, updates +1000/+1032 |
| MP11 `mp11copter` | 1, self-starting | `copter_loop` contains OBJECT_MOTION_SI_SCRIPT. `soundseq` starts jet/engine at +972/+1004, calls `translate_sound`; updates +1112/+1144. The chop loop updates at +1176 |
| MP52/MP53 `chopper_blades` | 2, called | Programs contain the loop starts and update commands. Program presence alone does not prove their caller executes in a round; that caller/placement gate remains |
| MP73 `airstrike` | 2, called | Existing WT-99 ([174](174-breach-map-audit.md)) airstrike activation/path audit supplies the gameplay context. SOUND starts use flags 642 (0x282), followed by update commands; live handles are an audio dependency of that plan |
| MP72/MP82 | — | Banks contain these Doppler entries but no common/mission animation name reference to either loop in this census. Do not claim an audible Crossroads helicopter from bank reuse |

The self-starting MP10/MP11 SOUND commands begin with flags 130 (0x82: new play at node), then use 514 (0x202: update at node and mark cleanup). The `translate_sound` sequence is a forever loop. These concrete consumer sites establish a missing live position/lifetime binding; the DOPPLER entries do not establish audible pitch motion.

### 3.5 Proposed work and acceptance

Introduce a sound-reference API keyed by effect/animation instance plus sound reference ordinal/name. The animation executor must issue create/update/stop/fade operations and dispose owned handles. Source position comes from current world-node matrices, including the same scripted transforms as the rendered aircraft. Apply the sourced volume/pan route and close AutoPan timing before claiming smooth pan parity. Shared sample/loop buffers can remain cached; live position, playback control and ownership cannot be shared merely by sound name. Automatic Doppler pitch is excluded from this implementation requirement by W2-C-05.

Dependencies: WT's SoftImage/world-animation plan must produce current transforms; W2-B decides authoritative event/timeline reconstruction where a room needs it; the audio layer consumes those events without inventing its own network authority. Listener movement already updates emitter gain/pan in PORT, but that does not update a moving emitter's source position.

Meaningful checks: update commands retain one playing instance; two aircraft/animations sharing a sound have independent ownership and positions; cleanup cancels queued starts and handles according to stop/detach semantics; a node update moves range/pan without replay; mask5 does not apply a pitch modifier; map replacement leaves no old emitters. Parse MP10/MP11 script fixtures to ensure forever update sequences are not flattened into one initial start. The helper's approaching/receding values remain artifact tests of dead-for-pitch arithmetic, not acceptance targets for audible pitch.

Owed original-runtime acceptance: source/listener volume/pan trajectory and AutoPan timing; actual cleanup/fade timing; MP52/MP53 caller/placement gates; MP11 foliage missing-bank behavior. Explicit SOUND pitch commands are outside this automatic-update closure. No new rendering/audio comparison was performed.

## 4. Reproduction and remaining gates

All new outputs live under `scratch/W2-C`. The TypeScript probes use the existing local cached tsx runner with caching disabled; no install or network request is needed:

```powershell
$env:TSX_DISABLE_CACHE='1'
node $NPX_TSX/dist/cli.mjs research-wave-2026-10-04/wave-2/scratch/W2-C/world-consumers.ts | Out-File -Encoding utf8 research-wave-2026-10-04/wave-2/scratch/W2-C/world-consumers.jsonl
node $NPX_TSX/dist/cli.mjs research-wave-2026-10-04/wave-2/scratch/W2-C/sound-consumers.ts | Out-File -Encoding utf8 research-wave-2026-10-04/wave-2/scratch/W2-C/sound-consumers.jsonl
node $NPX_TSX/dist/cli.mjs research-wave-2026-10-04/wave-2/scratch/W2-C/sound-scene-bindings.ts | Out-File -Encoding utf8 research-wave-2026-10-04/wave-2/scratch/W2-C/sound-scene-bindings.jsonl
python -B research-wave-2026-10-04/wave-2/scratch/W2-C/source-evidence.py
python -B research-wave-2026-10-04/wave-2/scratch/W2-C/native-consumers.py
python -B research-wave-2026-10-04/wave-2/scratch/W2-C/reconcile-final-priors.py
python -B research-wave-2026-10-04/wave-2/scratch/W2-C/verify-report.py
```

All seven completed with exit code 0. The Python probes write `fingerprints.json`/`source-evidence.json`, `native-consumers.json`, `final-prior-reconciliation.json` and `verification.json` beside themselves. Actual outputs: 22 world rows; 4,759 dynamic instances; 11 Doppler script blocks of which seven bind to MP banks; 22 animation-census rows of which five contain the target sounds; 68 source/input fingerprints plus four final prior-report fingerprints; 141 decoded EE and 66 IOP instructions. Native helper samples include input -10 -> result -20, 0 -> 0, +10 -> +20; these are discarded fifth-argument values under this path's mask5, not audible pitch targets.

Implementation can begin by preserving data/identity and adding lifetime-aware interfaces; it must not silently add mask-disabled pitch behavior or invent runtime acceptance. Runtime sign-off requires original captures for the two new consumers.

W2-B independent review completed: replayed the 22-map clutter census with exact row equality; reread PORT placement/audio consumers and native 002d8330, 002d8c60, 002659c0, 00346ea0 and pitch helpers. Its initial pass found no contradiction and clarified first axis-qualified influence selection. A deeper receiver review then found the material **mask5 Doppler correction**, now incorporated as W2-C-05. It also independently checked the actor-radius instructions. No additional spherical rejection or nearest/strongest selection is implied. Review evidence is `scratch/W2-B/crossreview-C.json` and `pitch-followup.md/.py/.json` (17 instruction windows/1,059 instructions, receiver/dispatch assertions). Independent source review does not elevate these findings to original-runtime parity.

Reciprocal W2-A review completed: independently reread the NoFire loader at D:L131397–429, its actor consumer D:L462612–705 and the strict comparator instructions at 0x58a8c0–0x58a914; independently checked pickup routing through 0059f610 and 002ba2c0 to pickup owner actor+0xfc8, and the respawn death-drop exclusion at D:L458658–664. A later A10 check confirms the INVISIBLE_DI C4 placement exclusion (D:L476975, ELF string 0x65f8c8) and IgnoreExplosionDI's two narrow blast-visibility consumers (D:L319096–143,459192), without inferring general projectile penetration. No material correction found. The existing blended-leaf aggregation gate must remain explicit; the decompiled loop overwrites its result, so an AND-of-all-leaves rule cannot be presumed. A missing draft README link was reported to W2-A for repair. Review anchors are saved in `scratch/W2-C/crossreview-A.json`.
