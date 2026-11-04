# 206 -- Verification overrides and the wave's close: the overrides, the loop-rate rescale, the sprint options, the owed captures, the ledger's counts

Five documents of the wave's close follow as §1-§5, each verbatim apart from the import's edits (its `##` headings are numbered `### N.M` under the document's own section, its own numbers kept). **§1 wins over every report and every ledger value**: where a claim in 179-205 or a row of `LEDGER-ALL.tsv` disagrees with it, §1 is right, and each note it overrides names the claim under its header.

- Research date: 2026-10-04 (research wave 1, round 2 and the close; the index is [178](178-the-research-wave-of-2026-10-04.md)).
- Origin: `research-wave-2026-10-04/{VERIFICATION-OVERRIDES,V6-loop-rate-rescale,SPRINT-OPTIONS,OWED-CAPTURES,LEDGER-counts}.md` on the owner's host, in the evidence archive ([178](178-the-research-wave-of-2026-10-04.md) gives its root). A relative `scratch/...` path below is under `research-wave-2026-10-04/`; the per-cluster `ledger-*` files it names are merged in [`ledgers/2026-10-04/LEDGER-ALL.tsv`](ledgers/2026-10-04/README.md).
- Trees compared: **PORT** = `agent/online` at 2026-10-04 (written `$PORT`; `$PORT/..` is that branch's root, `$WEBISSUES` the `agent/web-issues` checkout); **WT** = the old-layout checkout (`$WT`, the clone's pre-restructure web project). WT-96..102 are notes 171-177 here; PORT's own notes 96-102 are other notes.
- **Status: reading, pending review -- not adopted.** Nothing in it is adopted until a sprint task takes it and a reviewer re-reads it at the source.
- Grades, translated to AGENTS.md's levels: the wave's PROVEN = an exact source read = **reading**; STRONG = reading with one interpretive step; BELIEVED = inference; UNRESOLVED = unresolved. The text keeps the wave's words.
- Verification: §1 is the verifiers' collected verdicts (V1-V7); §2 is V6 itself, a verifier's report, landed with the wave; §3-§5 are the wave's own synthesis.
- Edits on import: the headings are numbered for the corpus; home-directory paths are replaced by `$PORT`/`$PORT/..`/`$WT`; the archive's absolute root is dropped; references to the other reports are links to their notes; the claims research 206 §1 overrides are named under this header. The substance is verbatim.

## 1. Verification overrides: read this before using a report's value

The cluster reports and their ledgers are as their agents wrote them. Verifiers V1-V7 re-derived about 150 claims by
independent routes. Where a verifier or a later round found a claim wrong or corrected it, **the correction below wins**
over the report and over `LEDGER-ALL.tsv`.

### 1.1 Wrong (do not implement the original claim)

| claim (report) | correction | by |
|---|---|---|
| M2 ([193](193-m2-mp-net-replication.md)): position sent at most every 200 ms online, 100 ms LAN; health every 50 ms | **Swapped.** Online: position, heading and health at most every 100 ms; score, life, killer and cause every pass. LAN: 200 ms / 50 ms. Health was never sent at 50 ms | V3 #7 (and H3 ([191](191-h3-hostage-net-sync.md))) |
| M2: follow state in field 0x74; rescue scored by "Action Points" | Follow state is in the AI word (+0x10); rescue scoring comes from the state switch to 0x11. Field 0x74 (the unit) **is** applied on receive (H4 ([199](199-h4-hostage-closures.md))/V5), contrary to H3 | V3 #11, V5 |
| M2: game +0xcc = "staging lobby" | It is the `late_joiner` setting | R2-AV ([205](205-r2-av-audio-card-world.md)) |
| C3 ([181](181-c3-combat-hud-effects.md)) / V1: hand grenades do not spin in flight (`SPIN_PLACEHOLDER` -> 0) | They tumble: the free-flight step `FUN_003c9530` rotates the model by the distance moved, up to 50 half-turns/s | R2-C3 ([202](202-r2-c3-combat.md)), V5 |
| R2-C2 ([201](201-r2-c2-movement.md)): ladder climb 7.594 u/s | **13.5 u/s** (loop-rate factor K 1.7778); the port's 7.59 is the bug | V5, V6 |
| V5: "every looped clip in the port is affected" by the loop-rate rescale | Only the ladder (2 clips); the port already applies K to the other 122 | V6 |
| H1 ([189](189-h1-hostage-ai-animation.md)): root travel 0 on every `civ_*` clip | `civ_walk/jog/run` move 11.72 / 25.00 / 40.62 u a cycle | V6 |
| H4: a released hostage stays stranded in the dead leader's unit | The UnitTick (`FUN_005e8060`) sends HOLD, returning it to unit 0x11 (YES cue); FOLLOW is offered again | V5 |
| H4: `Hostage_start` "Cower" never runs online | It is reached on the host at each level start and round restart (`FUN_002a7d40` slot +0x4c); visibility owed | V5 |
| H1: the A* is `FUN_00526540`; `FUN_00524760`/`FUN_0052a090` test lateral steps | The A* is `FUN_00510ff0` ("ai_route_planner"); `FUN_00526540` splits and re-smooths the route; `FUN_00524760` tests the leader's trail corridor, `FUN_0052a090` cell walkability | H5 ([200](200-h5-ai-pathfinding.md)) (validated on console routes) |
| H4 #6: the jail bars do not change walkability | True of the material swap, but the bars' AI-map cells are type 9 (not walkable) regardless | H5 |
| C7 ([186](186-c7-audio-movie.md)) / research 122: two boot `.METAL` popups | They never fire on a normal boot; the boot popups come from the card check | R2-AV |
| C1 ([179](179-c1-match-server.md)) / research 91: friendly fire is "game-info bit 0" | True of the lobby's RulesSet only; in-game it is bit 0x20 of byte 0x19 | V3 |
| Port research 170: OFFENSE = 1, DEFENSE = 2; a talk stance (state 5) | OFFENSE sends 2, DEFENSE 1; "state 5" is the command menu's own state, not a stance | R2-AV, W2-R ([197](197-w2-r-input-voice-integration.md)) |

### 1.2 Corrected (value stands, a detail changed)

| claim | correction | by |
|---|---|---|
| C5b ([184](184-c5b-frontend-dialogs-input-boot.md)): `CheckTeamStatus` answers 0 because no game exists | Answer 0 is right today, but implement the game's test: game object && (team byte \|\| word 0x441470) | V4 #14 |
| C5b: menu tick 30 Hz | 29.97 Hz (525 HBLANKs) | V4 #17 |
| C5a ([183](183-c5a-frontend-screens.md)): `lanUp` hook wrong in three places | Four sites: two in code (`personaCommands.ts:552`, `:615`), two in comments | V4 #8 |
| C2 ([180](180-c2-movement-body-camera.md)): horizontal wall probes | The prone probe tilts with the body on a slope; the 6.5 step height is 4.0 in the ELF and 6.5 from the title screen on (written at boot) | V1 #3 |
| C1: friendly-fire default conflict | Both true: a new setting starts at 0 ("disabled", capture A_49); RESTORE DEFAULTS sets 1 ("enabled"); the create-game script's default is on | V1 #5, R2-MN ([203](203-r2-mn-match-modes-net.md)) |
| C3: C4 readiness 0.2 s | The timer also resets when the target object moves; the SEAL's own movement is not tested. The 3.2 depth limit also guards item 0x9e (a mine) | V1 #9 |
| C1: hit packet type 0x40 | 0x40 is passed by every send; the hit's type is `DAT_00440e00` | V1 #7 |
| V2: HOLD on a rescued hostage pops via `FUN_005f5f20` | It is `FUN_00555900`'s unwind (D:L420253); the double credit stands, only within the <= 1.33 s fade | H4, V5 |
| V2: the order range distance from body +0xe4 | +0xe8, ignoring the sub-map; "HOLD only to the leader" = "issuer in the hostage's unit" | V2 #18 |
| H1: PANIC/HELPME, "get down" online | Unreachable online; only YES, DAMAGE and DEATH sounds exist for the hostage | V2 #16-17, H4 #8 |
| R2-C2: swap gate | `UseVelY` belongs to reload; a throw not refusing a swap is unproven (`FUN_005a7de0(actor,1,1)` adds refusals) | V5 |
| R2-C2: head-look forcing | The clamp stands; the forcing/turn lead never runs for the local player (its flag is never written) | V5 |
| C6 ([185](185-c6-frontend-compositor-text.md)): focal 457.0076 | 457.0074 | V4 #2 |
| R2-C3: flashbang glow timeline | Starts 0.2 s after the flash (level 3 full 0.2-8.2 s, clear 10.2 s) | V7 #1 |
| R2-C3: NVG iris values; NVG colour | Those values last only 0.4 s, then thresholds 0.3 / -0.05 at 0.7 s rates; the (200,255,200) colour is never used: no green tint | V7 #2 |
| R2-UI ([204](204-r2-ui-frontend.md)): profile upload with its MD5 | Order: list, create if missing, upload. The MD5 is never sent; it is compared at login with the server's checksum and the file downloads only when they differ. Stock Horizon cannot serve it (no file list, no checksum, refuses re-create) | V7 #5 |
| R2-UI: grid walk capped at 1,600 cells | The cap is checked between rings; the last ring can overshoot | V7 #6 |
| H4 #1: mask 0x190c48c6 has bit 17 | It has bits 18 and 19 (no effect on the conclusion) | V5 |

### 1.3 Confirmed without change

Everything else the verifiers checked: V1 (11 claims), V2 (34), V3 (11 + 4 disputes), V4 (34), V5 (22), V6 (1), V7 (10). See each V
report's opening table. Claims no verifier checked are as their author graded them.

## 2. V6 -- The looped-clip rate rescale (`FUN_0028aa20`): what it computes, and which port clips it affects

Verifier V6, 2026-10-04. Read-only. Scripts and outputs are in `scratch/V6/` (see its `README.md`).

### 2.0 Summary

| question | status | grade | answer |
|---|---|---|---|
| What `FUN_0028aa20` computes | RESOLVED | PROVEN | For a looped clip with stride D > 0.2, `K = +0x14 = T × 100 / D`. When `max_velocity` < 0 it is `T / D`. Every other clip gets 1.0. It runs once per clip when `motion.rdr` is loaded. |
| Disc re-derivation vs RDRAM | RESOLVED | PROVEN | All **124** looped clips were re-derived from the disc. Each one equals its in-RAM clip object in `spawn_pcsx2`, `postload_pcsx2` and `title_pcsx2`. 49 of them have K ≠ 1. The ladder's 1.7778 is reproduced exactly. |
| Does the port apply it? | RESOLVED | PROVEN | **Yes**, in `motionOf` (`$PORT/packages/viewer/src/locomotion.ts:191`), with `nodeSpeed` (`:213-215`). The port's own code gives the right K for **122 of 124** looped clips. It misses only the two `VerticalMotion` clips, `seal_climbladder` and `seal_p_climbladder`. |
| "Every looped clip in the port is affected" (V5) | NOT-A-GAP, except the ladder | PROVEN | The claim is false. Every locomotion clip the animator plays (walk, jog, run, back, strafes, crouch, prone) already runs at the rescaled rate. **Only the ladder is wrong.** |
| The ladder's climb | RESOLVED | rate PROVEN; rise STRONG | Original: **21.6 keys/s = 1.35 cycles/s = 13.5 u/s** at full stick. Port: 12.15 keys/s = **7.59 u/s** (`traversal.ts:121`, `:1108`). The port is too slow by exactly K = 1.7778. |
| Hostage `civ_*` clips | RESOLVED | PROVEN | K matches disc and RAM (civ_walk 5.97, civ_jog 2.93, civ_run 1.81, civ_walk_bw 3.85, civ_rstep 13.00, civ_lstep 12.80; stand/crouch/step 1). The port plays no civ clip today. `motionOf` would give the right K once it does. |

### 2.1 What `FUN_0028aa20` computes

**When.** The `motion.rdr` loader `FUN_00287620` handles one record per clip. At its end it calls `FUN_0028ab10` (the stride) and then `FUN_0028aa20` (K), at D:L131630-131631. By then the record's flags are already set, `VerticalMotion` (+0x4a bit 1) among them, at D:L131368-131373 (key string `0x3ef9c8` = "VerticalMotion"). So K is fixed at load and is never recomputed per frame.

**Inputs.** All of these are clip-object fields:

- **`+0x49` bit 6 = looped** (`looped` key, D:L131290-131295).
- **`+0x49` bit 7 = `max_velocity` < 0** (D:L131298-131304).
- **`+0x10` T, the in-memory duration** (D:L131315-131323):
  - a one-shot, or a clip with bit 7 set: T = `playback`;
  - a looped clip with `max_velocity` ≥ 0: T = file duration / `playback`.
  - The file duration is frames / 30, so the 30 keys/s enters only through T.
- **`+0x1c` V** (D:L131305-131314): looped ? (mv × 10 / 100, or 1 when that is 0) : 1.
- **`+0x18` D, the stride, from `FUN_0028ab10`** (D:L133249-133292):
  - Track `+0x44` is the `skel_root` part (key `0x3efa48`, D:L131614-131627). D is computed from it as `root(key n−1) − root(key 0)`.
  - On a looped clip with n > 1 this is multiplied by `n/(n−1)`.
  - With `VerticalMotion` set, D is the **signed y** component; otherwise it is `sqrt(x² + z²)`.
  - With no root track, D is 1.0 if the `refPt` vector is non-zero and 0.0 if it is zero.

**The formula** (D:L133196-133219):

```
K = +0x14 = looped ? (D > 0.2 ? (bit7 ? T / D : T × 100 / D) : 1.0) : 1.0
```

`FUN_0028aac0` (D:L133224-133240) returns the matching unit factor (100, or 1).

**What K does.** `FUN_0028d570` (D:L134834-134842) sets a node's speed to `x × K` on a looped clip. `FUN_0028c4f0` (D:L134249-134252) then moves the phase by `weight × speed / T` per second (the `FUN_0028ada0` factor is 1 when looped). Locomotion passes `x = stick × V`, through `FUN_0058bdf0` (D:L447845) and the ladder's `FUN_00584240` (D:L443765). That gives:

- **cycles/s = stick × V × 100 / D**;
- **root speed = stick × max_velocity × 10 u/s**, independent of the clip.

Two things follow:

- **K is a foot-lock.** It makes each loop's root advance at the commanded speed.
- **The root velocity agrees.** `FUN_0028c250` / `FUN_00289bb0` (D:L134149-134177, D:L132697-132755) compute the velocity as `(key[k+1] − key[k]) × n / T × speed`. That is the same root speed by a second route. `FUN_0057a330` writes it to `actor+0x2c` (D:L438876, D:L438910).

**Re-derivation from the disc.** `clips.ts` → `rescale.py` → `table.py`:

- 124 looped clips; K ≠ 1 on 49.
- The clip objects were found in RAM by `+0 → name` and `+4 & 0x3ff == frames`.
- RAM K equals the derivation on all 124 in all three PCSX2 dumps.
- `seal_turret_poses` shows one extra non-clip hit at 0xcadbdc, a name-table entry with T = 0. Its real object, at 0xa479e0, matches.
- `frostA/B` are recompiler dumps and were not used.

**The ladder.**

- n = 16, file duration 0.5333, `playback` 3, so T = 0.17778.
- mv 1.35, so V = 0.135.
- `skel_root` y rises 0.625 per key: 9.375 over keys 0..15, × 16/15 = D = 10.000.
- K = 0.17778 × 100 / 10 = **1.77778**. RAM: 1.7778 at 0xa37fb0 in `spawn_pcsx2`.

### 2.2 The table

Columns:

- **K disc** is derived from MOTION_P.ZAR plus `motion.rdr`.
- **K RDRAM** is read from `spawn_pcsx2.rdram`. The other two PCSX2 dumps are identical (`out_summary.txt`).
- **K port motionOf** is the port's own code (`$PORT` `locomotion.ts`) run on the disc (`portk.ts`).
- **K used by port** is what actually drives the play.

The table lists every looped clip with K ≠ 1, plus all `civ_*` clips. Generated by `mdtable.py` → `scratch/V6/out_table.md`.

| clip | n | file dur | playback | mv | T | D | K disc | K RDRAM | K port motionOf | port plays it via | K used by port | match |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| seal_walk_alert | 17 | 0.5667 | 1 | 6.5 | 0.5667 | 18.7100 | 3.0287 | 3.0287 | 3.0287 | animator, motionOf | 3.0287 | yes |
| seal_jog_alert | 19 | 0.6333 | 1 | 6.5 | 0.6333 | 29.8648 | 2.1207 | 2.1207 | 2.1207 | animator, motionOf | 2.1207 | yes |
| seal_run | 19 | 0.6333 | 1 | 6.5 | 0.6333 | 36.5445 | 1.7330 | 1.7330 | 1.7330 | animator, motionOf | 1.7330 | yes |
| seal_walk_bw | 16 | 0.5333 | 1 | 3.7 | 0.5333 | 17.3513 | 3.0737 | 3.0737 | 3.0737 | animator, motionOf | 3.0737 | yes |
| seal_run_bw | 18 | 0.6000 | 1 | 3.7 | 0.6000 | 20.2459 | 2.9636 | 2.9636 | 2.9636 | animator, motionOf | 2.9636 | yes |
| seal_p_walk_bw | 16 | 0.5333 | 1 | 3.7 | 0.5333 | 17.3513 | 3.0737 | 3.0737 | 3.0737 | animator, motionOf | 3.0737 | yes |
| seal_p_run_bw | 16 | 0.5333 | 1 | 3.7 | 0.5333 | 19.0833 | 2.7948 | 2.7948 | 2.7948 | animator, motionOf | 2.7948 | yes |
| seal_rstrafe | 23 | 0.7667 | 1 | 6.5 | 0.7667 | 11.1896 | 6.8516 | 6.8516 | 6.8516 | animator, motionOf | 6.8516 | yes |
| seal_lstrafe | 22 | 0.7333 | 1 | 6.5 | 0.7333 | 10.8486 | 6.7597 | 6.7597 | 6.7597 | animator, motionOf | 6.7597 | yes |
| seal_rstrafe_fast / lstrafe_fast | 27 | 0.9000 | 1 | 6.5 | 0.9000 | 23.4262 | 3.8418 | 3.8418 | 3.8418 | animator, motionOf | 3.8418 | yes |
| seal_run_90r / run_90l | 18 | 0.6000 | 1 | 6.5 | 0.6000 | 32.9766 | 1.8195 | 1.8195 | 1.8195 | animator, motionOf | 1.8195 | yes |
| seal_crouchwalk | 28 | 0.9333 | 1 | 1.48 | 0.9333 | 12.1730 | 7.6672 | 7.6672 | 7.6672 | animator, motionOf | 7.6672 | yes |
| seal_crouchwalk_bw | 34 | 1.1333 | 1 | 1.35 | 1.1333 | 11.4742 | 9.8772 | 9.8772 | 9.8772 | animator, motionOf | 9.8772 | yes |
| seal_crouchstrafe_right_fast | 33 | 1.1000 | 1 | 1.5 | 1.1000 | 13.6318 | 8.0693 | 8.0693 | 8.0693 | animator, motionOf | 8.0693 | yes |
| seal_crouchstrafe_left | 39 | 1.3000 | 1 | 1.5 | 1.3000 | 14.0196 | 9.2727 | 9.2727 | 9.2727 | animator, motionOf | 9.2727 | yes |
| seal_prone_crawl | 26 | 0.8667 | 1 | 1.1 | 0.8667 | 8.6084 | 10.0676 | 10.0676 | 10.0676 | animator, motionOf | 10.0676 | yes |
| seal_prone_rstrafe | 22 | 0.7333 | 0.6 | 0.55 | 1.2222 | 6.0698 | 20.1362 | 20.1362 | 20.1362 | animator, motionOf | 20.1362 | yes |
| seal_prone_lstrafe | 22 | 0.7333 | 0.6 | 0.55 | 1.2222 | 5.1513 | 23.7267 | 23.7267 | 23.7267 | animator, motionOf | 23.7267 | yes |
| **seal_climbladder (VerticalMotion)** | 16 | 0.5333 | 3 | 1.35 | 0.1778 | 10.0000 | **1.7778** | **1.7778** | 1.0000 | traversal.ts own phase (`LADDER_RATE`) | **1.0000** | **NO** |
| seal_p_climbladder (VerticalMotion) | 16 | 0.5333 | 3 | 1.35 | 0.1778 | 10.0000 | 1.7778 | 1.7778 | 1.0000 | not played | - | n/a |
| seal_walk / seal_jog | 25 / 22 | 0.8333 / 0.7333 | 1 | 6.5 | = dur | 14.9455 / 22.5565 | 5.5758 / 3.2511 | same | same | not played (the port's forward set is walk_alert/jog_alert/run) | - | n/a |
| seal_fp_*, seal_pfp_*, seal_walk_alert02, seal_buddycarry_walk, seal_p_buddycarry_walk, seal_fp_crouchwalk(_bw) | | | | | | | (see `out_table.md`) | equal | equal | not played | - | n/a |
| civ_walk | 21 | 0.7000 | 1 | 6.5 | 0.7000 | 11.7223 | 5.9715 | 5.9715 | 5.9715 | not played | - | n/a |
| civ_jog | 22 | 0.7333 | 1 | 6.5 | 0.7333 | 24.9996 | 2.9334 | 2.9334 | 2.9334 | not played | - | n/a |
| civ_run | 22 | 0.7333 | 1 | 6.5 | 0.7333 | 40.6239 | 1.8052 | 1.8052 | 1.8052 | not played | - | n/a |
| civ_walk_bw | 16 | 0.5333 | 1 | 1.1 | 0.5333 | 13.8515 | 3.8504 | 3.8504 | 3.8504 | not played | - | n/a |
| civ_rstep | 30 | 1.0000 | 1.2 | 0.8 | 0.8333 | 6.4114 | 12.9976 | 12.9976 | 12.9976 | not played | - | n/a |
| civ_lstep | 23 | 0.7667 | 1.2 | 0.8 | 0.6389 | 4.9894 | 12.8049 | 12.8049 | 12.8049 | not played | - | n/a |
| civ_stand / civ_crouch / civ_step / civ_sitting01-02 | 7 / 42 / 8 / 1 | | 4.6 / 5.06 / 0.65 / 1 | <0 | 4.6 / 5.06 / 0.65 / 1 | 0 | 1 | 1 | 1 | not played | - | n/a |
| guard_restrained_walk/jog/run/walk_bw/rstep/lstep, torturer_walk | | | | | | | 5.97 / 2.93 / 1.81 / 3.85 / 6.43 / 8.24 / 4.71 | equal | equal | not played | - | n/a |

The other 75 looped clips have K = 1 and match in all three columns. They are the idles (mv < 0, no root travel), the pistol forward and strafe clips (`seal_p_walk`/`jog`/`run`/`rstrafe` and the rest, which carry no `skel_root`, so D = 0), `seal_step`, `seal_crouch_step`, `seal_prone_turn`, `seal_ladderslide` and `seal_hang`.

### 2.3 Does the port apply it?

**Yes. Research 80 §3 already read it** (`$PORT/docs/research/80-the-jump.md:134-152`, the `+0x14 K` row). `locomotion.ts` implements it:

- `motionOf` (`:179-201`) computes `velocity` (V), `period` (T), `travel` (D, from `cycleTravel` at `:165-173`) and `scale = looped && travel > 0.2 ? (locomotion ? period × 100 : period) / travel : 1` (`:191`). That is `FUN_0028aa20` exactly.
- `nodeSpeed` (`:213-215`) multiplies by K.
- `phaseRate` (`:221-225`) divides by T.
- The animator plays every ground clip this way: `animator.ts:496` builds the motions with `motionOf`; `:551-552` advances the play; `bandPick`, `crouchPlay` and `pronePlay` set the speeds.

Research 80 also checks K against research 25's traced node speed: 1.1265 = 0.65 × 1.733 for the full run. The port's K comes from the disc's root keys, not from console-measured speeds. Its foot-locked result, root speed = stick × mv × 10 (65 u/s forward), is the same law that research 79 (`socom_pc/docs/research/79-seal-speed-on-the-console.md`) sets out to measure.

**R2-C2 §8** said "head +0x14 = 1.0, the port can treat it as 1". That is true of the file head only. The port never reads that file field; it computes K. So there is no defect there.

**The port's one gap in `motionOf`.** `cycleTravel` (`locomotion.ts:164-173`) always takes x/z. Its own comment says "the `VerticalMotion` flag's y is no SEAL clip's", but `seal_climbladder` and `seal_p_climbladder` carry `VerticalMotion` (`clips.json`). For them `motionOf` gives D ≈ 0, so K = 1 instead of 1.7778. That value is not actually used to play the climb (see §4), but it is a latent bug.

### 2.4 The ladder

**The port.** `traversal.ts`:

- `:121` sets `LADDER_RATE = 0.135`.
- `climbLadder` (`:1101-1130`) drives its own phase: `keysPerSecond = LADDER_RATE × keys / shape.seconds` (`:1108`) = 0.135 × 16 / 0.17778 = **12.15 keys/s**.
- The rise is 0.625 per key (`perKey`), giving `s.vy` = **7.594 u/s** at full stick. The header comment `:47-49` documents 7.59.
- The animator shows this same phase (`traversal.ts:427` → `animator.ts:567-596`, "no advance of its own"). So both the body's rise and the clip on screen are slow.

**The original** (`ladder.py`), at full stick:

- `FUN_00584240` passes `stick × V` = 0.135 (D:L443765).
- `FUN_0028d570` multiplies by K = 1.7778, giving node speed 0.24.
- That is 0.24 / 0.17778 = **1.35 cycles/s = 21.6 keys/s**.
- Rise = 1.35 × D 10 = **13.5 u/s** (0.45 u per 30 Hz frame).
- The root-velocity route gives the same: 0.625 × 16 / 0.17778 × 0.24 = 13.5 u/s.
- In general the climb runs at mv × 10 × stick, the same law as the ground cycles.

**Grades.**

- The playback rate (21.6 keys/s) is **PROVEN**: instruction operands plus the RAM K.
- The rise of 13.5 u/s is **STRONG**: two code routes agree. One step remains, that the climbing actor's y integrates that root velocity (`UseVelY`, research 86 §1.1). I did not re-read it to the actor's position store.

**Implementation.** One change fixes both the body and the animation:

1. In `traversal.ts:1108`, multiply by K: `keysPerSecond = LADDER_RATE × K × keys / T`. Better still, take V, K and T from `motionOf`.
2. Give `cycleTravel` the `VerticalMotion` branch: the signed y, and K only when D > 0.2. This needs `MotionEntry` to carry `verticalMotion` from `motion.rdr`.
3. Add the test first:
   - `motionOf(seal_climbladder)` gives T 0.17778, D 10.0, K 1.77778;
   - a 1 s full-stick climb rises 13.5 ± 0.05 and turns 21.6 keys.
4. Update the `:47-49` header and research 86 §2.3, and R2-C2's U-LADDER-7.59 becomes **13.5**.
5. The rung callbacks still fire at 0.01 and 0.5 of each cycle. They simply come 1.78× more often.

**Owed evidence.** A PINE read of `actor+0x20` (y) through a 2 s full-stick climb on a ladder, for example MP82's guard tower. Expect 13.5 u/s, or 0.225 u per 60 Hz tick. That is R2-C2's owed capture with the expectation corrected.

### 2.5 Verdict

- **Exactly one behaviour plays at the wrong rate today: the ladder climb** (`seal_climbladder`, through `traversal.ts`). It runs at 0.5625× the original: 7.59 vs 13.5 u/s, and 12.15 vs 21.6 keys/s.
- Every other looped clip the port plays is already at the rescaled, foot-locked rate. That is 122 of 124 looped clips by the port's own `motionOf`, and all of the locomotion clips.
- V5's "every looped clip in the port is affected" is wrong. V5's ladder number (13.5) is right.

### 2.6 Leads for other workstreams

- **H1 §7 is wrong that "root travel is 0 on every civ clip".** H1's `clips.ts` compared key 0 with the closing key n, which wraps back to key 0. The engine uses key n−1. For example, civ_walk's root moves −0.5586 z per key, giving D = 11.72 and K = 5.97. A hostage port must play civ locomotion through `motionOf`, with foot-locked K, and **not** "in place by speed".
- `seal_p_climbladder` exists with the same K. The port plays only `seal_climbladder` on the ladder, even with the pistol out. This is a separate parity question and was not investigated here.

## 3. Sprint options from the 2026-10-04 research wave

For review with Craig. Nothing here is implemented or adopted. Every item names the report (and section) that sources it;
each was either verified adversarially (V1-V7) or is marked unverified. "Source-read" = an exact read of the disc, code or
`.data`, which is not a runtime measurement. The parity rule (`MISSION.md`) still wants a capture before calling a
behaviour parity; `OWED-CAPTURES.md` groups those captures into sessions.

Five candidate sprints follow, smallest and most certain first. They are independent except where noted.

### 3.1 Option A -- "The original's numbers": fix what the port does differently today (small items, high certainty)

Each row is a value or rule the port has wrong today, sourced and (unless marked) verified. Each is a one-test,
one-constant change. Several are visible in play.

| # | change | from -> to | report | verified |
|---|---|---|---|---|
| A1 | **The game frame is 30 Hz.** Per-frame constants built on 1/60 | look ramp 2.334 -> **1.553/s**; camera easing (0.03/frame) time constant 0.55 -> 1.09 s; screen-shake decay; `accuracy.ts` TICK 1/60 -> **1/30** (bloom opens twice as fast as the game's today); grenade `FLIGHT_TICK` 1/60 -> 1/30; `mover.ts` TICK comment | C2, C3, C1 | V1 #1 (all 25 dumps) |
| A2 | Eye height for scope/first person | 18.3 -> **15.88** standing, **9.90** crouched (prone 5.77, formula) | C2 | V1 #2 (one interpretive step) |
| A3 | Prone root / headroom ray | `PRONE_ROOT_READING` -> **2.1680**; headroom ray from hips+2 = **7.504** (code has 14) | C2 | V1 #2 |
| A4 | Corpse landing | a dead body takes `Land forward`, never `Hit` | C2 | unverified |
| A5 | Online shotgun pellets | scaled -> **raw 2.5 per pellet** (much weaker online; playtest before adopting) | C1 | V1 #7 |
| A6 | Round-screen columns | KILLS, DEATHS, SCORE -> **SCORE, KILLS, DEATHS** (layout from `RUN/UI/READERX.ZAR`) | C1 | V1 #8 |
| A7 | Respawn match length | "6 min, 4-10" -> **1 round of 1200 s** ("ROUND 1 OF 1") | C1 | V1 #4 |
| A8 | C4 | plant time 1.3 -> **1.098 s**; readiness "standing still" -> **crosshair rests 0.2 s on the target** | C3 | V1 #9 |
| A9 | Claymore/launcher refusal | refuses a moving player -> refuses only **wading deeper than 3.2** (claymore, also mine 0x9e) / **8.5** (launcher) (`room.ts:1762`, `grenade.ts:898`) | C3 | V1 #9 |
| A10 | Grenades | the port's fixed 14 rad/s spin -> **the original's tumble**: the free-flight step `FUN_003c9530` rotates the model by the distance moved each frame (up to 50 half-turns/s about one axis, a wobble when rolling slowly). C3/V1's "no spin" checked only the orientation function | R2-C3 | V5 (dispute ruled for R2-C3) |
| A11 | Flashbang | white overlay -> mainly a **blur glow** (2-3 additive passes at full strength) **starting 0.2 s after the flash** (level 3: full from 0.2 to 8.2 s, clear at 10.2 s), over a **colour wash x 0.75 + 60.5** | C3, R2-C3 | V1 #10, V7 #1 (0.2 s correction) |
| A11b | Ringing ears / thermal / NVG / scope | the blast duck (to 0.35) skips volume group 4, so `.RINGING_EARS`, UI sounds and headset voice stay at full (the port ducks everything); thermal scope = 4-pass glow of a blurred half-res copy scaled by screen brightness, plus **black hardware fog**; the NVG is a plain auto-gain **brightening, not a green tint**, settling at thresholds 0.3 / -0.05 with 0.7 s rates after 0.4 s; the scope has a zoom-in blur | R2-C3 | V5 (ears), V7 #2 (NVG correction) |
| A11c | Lean | the lean starts above 0.03 pressure; its clearance ray (9.5 right / 7.84 left) is re-tested **every frame** (the port tests it once at the start); the lean throw comes from the lean state, retiring `PEEK_THROW_READING` | R2-C3 | V7 #3 |
| A12 | Backblast | cone along reversed aim -> **behind the body**, spawned at the muzzle | C3 | V1 #10 |
| A13 | Empty weapon slot | blank -> **"&lt;NONE&gt;"** ("-------" for a two-slot item's second half) | C3 | unverified |
| A14 | Friendly-fire enforcement placeholder | retire: the gate is `FUN_005ac670` (0x5ac70c), teammate damage refused when off, self/hostage/VIP never | M1 ([192](192-m1-mp-modes-rules.md)), C1 | V1 #5, V3 |
| A15 | Game abandon | "ABANDONED" text -> **popup UIMnLOC #528** then back to World of SOCOM; triggers: a leave with too few consoles left, or the host left with only spectators | V3 #10 | V3 |
| A16 | ARMORY preview camera | focal 540.8 -> **457.007** (35 deg FOV, D:L217205); models 18% too large today | C4, C6 | V4 #1-2 |
| A17 | ARMORY confirm popup | opens on YES -> **opens on NO**; Triangle inert | C4 | V4 #3 |
| A18 | Menu runtime | `atofF32` rounds -> **truncates**; `IsNetwork` 1 -> **0 offline**; `CheckTeamStatus` -> **the game's own test** (game object && (team byte || 0x441470)) | C5b | V4 #12-14 |
| A19 | LAN check | the `lanUp` hook -> **the `ComeFromLan` valve** (`personaCommands.ts:552`, `:615`) | C5a | V4 #7-8 |
| A20 | Menu draw | depth writes from transparent texels (no alpha test); full-screen black clear each menu frame; teletype cursor 50% grey; three UIVARs typed float | C6 | V4 #18-21 |
| A21 | Movie audio | gain 1 -> **0.1774 (-9.0 dB)**: movies play ~15 dB too loud today | C7 | V4 #23 |
| A22 | Fades | linear 1.5 s -> the console's **step schedule**, silent at 1.058 s | C7 | V4 #24 |
| A23 | Sound defaults | `DEFAULT_RANGE_PLACEHOLDER` -> **160-430** (reuse `uiSounds.ts:44`); `globalRegister2` floor bug in `render.ts` | C7 | V4 #25-26 |
| A24 | Card / netcnf | interface type `eth` -> **`nic`**; `withPersona` key gains **PORT**; card driver allows **3** open files (4th -> -7), not 32 | C8 ([187](187-c8-card-online-services.md)) | V4 #27-29; **partly taken up already** on `agent/online` (`43e51a36`, `a9770103`) |
| A25 | View range | NV / binoculars / scopes extend fog end and far clip by **+200 / +200 / +300**; zoom divides squared LOD range by the magnification; the last LOD copy is culled too (owner call: Frostfire's vanishes at 500 units) | C9 ([188](188-c9-world-render-platform.md)) | V4 #31-34 |
| A26 | Spawn heights | AIMAPS cells carry floor height: `y = min_y + (max_y-min_y)/1024 * ((cell>>9)&0x3ff)`; retires `aimaps.ts`'s estimates | H2 ([190](190-h2-hostage-mode-rules-map.md)), C1 | V1 #6, V2 #3 |
| A27 | Weapon swap gate | the port refuses a swap during any action -> the original's list (refused dead/airborne/sliding/ladder/hanging/peek/carry/knock/landing/get-up/180/dive/swap/reload/CQB/zoom >= 4; **allowed during stance changes**) | R2-C2 | V5 (with corrections: `UseVelY` is reload's; throws unproven) |
| A28 | Steep-ground slide | `g*sin(a)` -> on ground > 50 deg whose polygon is >= 4 tall (any height prone): speed += (1-n_y)*g per second (g 235); `seal_slide` above 58.75; leaving faster than 40 is a landing | R2-C2 | V5 |
| A29 | Head look | clamp pitch -60..+80, yaw +-89 (`dynamics.rdr`); **no** forward-forcing or turn lead for the local player (its flag is never set) | R2-C2 | V5 (correction) |
| A30 | C4 reach | the squared distance from the root bone to the aimed point < 396 (19.9 units), written every frame by the HUD tick `FUN_00215c10` | R2-C3 | V5 |
| A31 | Far culling | the game culls at the camera's far plane, per grid cell (frustum footprint, near-to-far rings, <= 1,600 cells) and per object box; the port clips at max(2000, 1.6 x diagonal). Visible on fogless MP51/MP81 | R2-UI | V7 #6 (the 1,600 cap is checked between rings) |
| A32 | Footsteps of others | only the 3 nearest players within 500 units are heard (distance-sorted list) | R2-MN | V7 #10 |
| A33 | Ladder climb | 7.59 -> **13.5 u/s** at full stick: `traversal.ts:1108` never applies the loop-rate factor K = 1.7778 (`FUN_0028aa20`), because `cycleTravel` (`locomotion.ts:164-173`) ignores `VerticalMotion`. The other 122 looped clips are already right | R2-C2, V5, V6 | V6 (rate source-read; rise strong) |

Size: about 34 small changes, each with a test first. Several (A1, A5, A9) change how play feels; Craig should play
them. Many more resolved READINGs sit in the ledgers (292 resolved rows in all); the rows above are the visible ones.

### 3.2 Option B -- "Five modes": the mode foundation, then Demolition on Crossroads

Today every room plays SUPPRESSION rules on every map (M1 G3, verified V3 #1).

1. **Game type per map** from `missionlist.rdr` (G1-G2), per-mode objective lines (G4), the time-out outcome by mode
   (draw SUP/DEM/EXT, SEALs ESCORT, Terrorists BREACH; G5) and the guard waits (13/15/17 s; G6). V3 #2.
2. **Objective scoring** (plant +2, defuse +2, destroy +2 / +4 Breach, rescue +3, VIP +3/-2, +1 team per living
   teammate to the side's team score; G14/G26). V3 #4.
3. **Per-game settings** (round count/time, EQlimit, friendly fire ON, respawn only on SUPPRESSION maps, the GameStats
   'D' record; G13, G15, G17-G21). The ranges are now read (R2-MN, V5): PLAYERS 2-16 step 2, ROUND TIME 4-10 min, ROUND
   COUNT 3/5/7/9/11, respawn forces 20 min x 1, spectators 0/8, EQ 0-4; `mp_game_sort_order` sorts the game list (127) and **play-list rotation** (Medley / Random; G16). V3 #3, #5.
4. **C4 targets** per map (R2-MN, V5): a block accepts a hit when health > 0 and damage >= threshold -- access doors 17
   (C4's 18 opens them), team bases 21 and MP9's depots 45 (the MP bomb), MP6's fuel 150/150 (indestructible).
5. **Demolition on Crossroads**, a first-release map: the owner's own working tree already holds the traced
   bomb/bridge plan (WT-96 ([171](171-crossroads-demolition-and-bridges.md)), WT-98 ([173](173-demolition-map-audit.md)), `docs/plans/2026-10-04-crossroads-demolition-and-bridges.md`); M1 cross-checked its
   mode-level claims. Breach (WT-99 ([174](174-breach-map-audit.md))) follows the same machinery.

Dependencies: wave-2's WP1 (one game owns its settings and actors) is the integration seam. B1 is also P1 of Option C.

### 3.3 Option C -- "Extraction": hostage mode on Desert Glory

The full account is `HOSTAGE-MODE-DESERT-GLORY.md` (H1-H3, verified V2 with no wrong values). Phases P1-P11 there:
game type, AIMAPS heights, zone test, escortee actors, server-side hostage AI (the server plays the original's host),
orders (FOLLOW!/HOLD POSITION), following, rescue/kill scoring and the 60 s penalty, round rules, presentation, client
rendering. A shippable cut is P1-P4 + P8-P9: hostages that stand in the jail, can be shot, and score, before a perfect
follower. The same work gives Blood Lake, Death Trap and Fish Hook. Two owner decisions are listed there (double rescue
credit; rescued hostage still shootable).

Depends on B1 (game type). The path planner is the largest single piece of new code, but no longer a research risk: H5
transcribed the original's A* and replayed it against routes the console computed (6 of 8 exact). The same planner
serves Escort's VIPs and any future AI.

### 3.4 Option D -- "The match's missing messages": multiplayer presentation the original has and the port lacks

Sourced in M2 (verified V3), C1, M1 and wave-2:
- **Vote kick** at the round-complete screen (team majority), then #539/#541/#540 for 4 s; the HUD line "Voting: You
  have %d votes against you." No idle/lag kick exists in the original (C7 §1, C8 peer questions). The online lane
  already proposed this as SVC-23d and host handover as SVC-07b (`agent/online` `c9a741fd`).
- **Spectating rule**: teammates only when dead; everyone when a spectator (lead for `SPECTATOR_PAD_PLACEHOLDER`).
- The **radio menu** tree is read in full (R2-MN, V5): Tactical (HOLD FIRE, FIRE AT WILL, CLEAR AREA, COVER ME, DEFUSE
  BOMB in bomb modes, PROTECT in Escort/Extraction, POINT), Taunts, Messages, Radio, Teammates (vote, mute), Spectators.
- **Voice** (R2-AV, for the online lane's research 170): channels SEALs 0-3 / Terrorists 4-7 / spectators 10; OFFENSE 2,
  DEFENSE 1; respawn deaths keep their channel; timers 1.3/1.0 s, 0.3 s tap, 10 s on / 10 s off; `hud_talk.tif` marker.
- In-match **chat and quick-chat/radio** messages, **team switch**, the **spectator vote**, **one-at-a-time ladders**
  (host-arbitrated), **turrets** (Platform objects), **dropped-weapon pickup** (wave-2 WP5, the largest).
- Late joiners sit out as a ghost until the next round (port: verify current behaviour).

### 3.5 Option E -- "Captures": one evidence sprint (owner/loop-scheduled; needs the host lock)

`OWED-CAPTURES.md` groups every owed measurement into a few PCSX2/recomp sessions (boot and front end at full frame rate,
a Suppression map, a hosted two-console Desert Glory round, a Demolition map, the lobby against our own Horizon, card
states). One hosted MP6 session alone settles most hostage unknowns. This sprint turns "source-read" into "measured" for
the items above and settles about 100 UNRESOLVED rows. It is the loop's or Craig's to run; no research agent ran a game.

### 3.6 Recommendation

Start with **A** (the frame-rate and visible-value fixes are cheap, certain and felt in every match), run **B1** alongside
it (the game type per map unblocks every mode), then choose between **B** (Demolition on Crossroads, already planned in
the owner's tree) and **C** (Extraction), with **E** scheduled whenever the lock is free. **D** is a backlog to draw from.

### 3.7 Owner decisions collected from the wave

1. 30 Hz: convert per-frame constants only, or also move the server's 60 Hz mover step to the game's 30 Hz (C2/C1)?
2. Online shotgun damage at the original's raw 2.5 per pellet (C1 A5): play it first.
3. The original's wall probe (no column; a standing player could walk under low overhangs) vs the port's column (C2).
4. Cull the last LOD copy like the original (C9 A25)?
5. The friendly-fire default: a fresh setting shows "disabled"; RESTORE DEFAULTS sets "enabled" (V1 #5). Both are the
   original's.
6. Ban duration: the original's ban request carries 120, most likely **minutes** (2 hours; the field is `BanMinutes` in a public Horizon emulator -- a belief, R2-MN); the port bans 10 minutes.
7. Hostage: copy the double-rescue quirk or not; rescued hostage still shootable (HOSTAGE-MODE §8).
8. Filter direction: the client's two text filters read in opposite directions (C8).

## 4. Owed captures -- the wave's capture plan, by session

Harvested 2026-10-04 from every top-level `C*.md`, `H*.md`, `M*.md`, `V*.md`, `HOSTAGE-MODE-DESERT-GLORY.md`, the
UNRESOLVED/PARTIAL rows of `ledger-*.tsv`, and `wave-2/IMPLEMENTATION-PLAN.md` "Narrow source/capture work still owed"
(those items are marked **[W2]**). Nothing here was run: this is the list of runs to schedule. Every line cites the
report section that asked for it. No measurement is added that a report did not ask for. Where a report gave a
prediction, it is under **Expect**.

How it was harvested (reproducible): `scratch/owed/extract.py` (every "owed" paragraph with its heading),
`scratch/owed/ledger_open.sh` (the open ledger rows). The reports' tables (H1 "Unresolved", H2 §F, H3 §8, M2 §9,
HOSTAGE ([207](207-hostage-mode-desert-glory.md)) §9, V2 "Owed evidence added by V2") were read in full by hand. `scratch/owed/README` says what each prints.

### 4.1 The sessions at a glance

| session | setup | items settled | top three by gameplay impact |
|---|---|---|---|
| **S1** boot + offline front end, full frame rate | PCSX2, the US disc, "fast CDVD" off; every frame at 59.94 Hz with audio; RDRAM/GS dumps at named screens (recomp `PS2X_MPEG_TRACE` for the movie timings) | 18 | MENU_STICK (menu stick thresholds); BUTTON_START_STATE (every text-button dialog's first look); the boot timings LOADER_START & co. (presentation only) |
| **S2** Suppression round, measured on one console | two instances on our Horizon (the game starts no one-sided round: C1 SOLO_ROUND_PLACEHOLDER), Frostfire MP2 first, then Rat's Nest MP8, Vigilance MP51, Chain Reaction MP81; PINE/RDRAM/GS dumps and breakpoints on instance A | 43 + 3 [W2] | the scoped eye height (moves the scoped round's origin, C2 §1.3); the 30 Hz grenade flight (C1 FLIGHT_TICK); the 870's network damage and blowback (C1 Part B) |
| **S3** Desert Glory MP6 hosted, two consoles (three for marked items) | two (or three) recomp instances on our own Horizon, `PS2X_SOCOM2_NET_TRACE=1 PS2X_SOCOM2_NET_TRACE_ALL=1`, RDRAM dumps/peeks on both, host SEAL then host Terrorist | 49 + 2 [W2] | is a rescued hostage still killable (H1 U1); the double rescue credit through HOLD (V2 §26); how FOLLOW/HOLD and hostage state cross the wire (H3 §8.1, M2 §9.4) |
| **S4** Demolition map | two instances on our Horizon, any DEM map (MP1, 7, 9, 12, 72, 83); a write breakpoint and RDRAM reads on A | 2 + 1 [W2] | C4 plant reach (C3 C4_REACH); C4 settle gate (C1 C4_STILL); blast attenuation/destructible boundaries [W2] |
| **S5** online front end and lobby against our own Horizon | PCSX2 (and a second instance where marked) on the local Horizon, DNAS bypass pnach, frame dumps at 59.94 Hz; Medius/DME logs on our server | 23 | CREATE GAME's PLAYERS/ROUND COUNT ranges (M1 G19); Medley's rotation (M1 G16); the ARMORY when the host launches (C9 L6) |
| **S6** memory card states | PCSX2 with a card holding a saved profile, and a fresh card | 2 | the Create Game friendly-fire default with a card (V1 §5); the SaveConfig dummy files' size (C5a §35) |
| **S7** campaign M51 Seeding Chaos | PCSX2 savestate at the slot-8 pose; recomp `PS2X_MPEG_TRACE` | 2 | the water pass 20 % high (C9 U15); M51IG07's start tick (C7 ledger) |
| **S8** voice, two instances (**blocked** until the recomp sends voice, research 170 §11 "Q5") | two recomp instances on our Horizon, `PS2X_PEEK` on the voice object, a Medius/DME log, audio | 18 + 1 [W2] | the channel map (who hears whom); the floor's 10 s/15 s hold; the dead player's channel |

Counts are ledger names or report item ids settled (a measurement that settles three ids counts three). The
optional confirmations (§ "Optional") and the static reads are not counted.

### 4.2 Constraints (read before scheduling any of this)

- **Every game run takes the host lock.** In `C:/Projects/socom_pc` a build or a game (PCSX2 or the recomp) runs only
  through `scripts/loop_lock.sh run` (or `scripts/run_detached.sh`), one at a time, host-wide (its `CLAUDE.md`, "The
  lock"; the header of `scripts/loop_lock.sh` is the reference). These sessions are **the owner's or the loop's to
  schedule**; this research wave ran none of them (BRIEF rule 2).
- **Only our own server.** Every online session (S2-S5, S8) is against our own Horizon instance on the local stack.
  Never a PSRewired or any other server that is not ours (SOCOM Legacy `CLAUDE.md` "Boundaries", R293: a PSRewired
  connection only by the owner's hand, named and permitted each time). The existing `logs/parity/pcsx2_psrewired*`
  captures are not to be repeated.
- **Two instances minimum on an MP map.** The original has no one-sided round (C1 SOLO_ROUND_PLACEHOLDER, TEAM_UNBALANCE);
  "one console" below means "measured on one console while a second instance holds the other side". Items marked
  **(3 inst.)** need two teammates and an opponent.
- **PCSX2 vs the recomp.** The reports name PCSX2 for most RDRAM/PINE/breakpoint reads and the recomp for the net trace
  (`PS2X_SOCOM2_NET_TRACE*` are the recomp's flags, desktop `docs/DEVELOPING.md` "Online"), `PS2X_MPEG_TRACE` and the
  PLAT-36 trace window (`PS2X_RDRAM_DUMP`, `PS2X_CALL_TRACE`, `PS2X_PEEK`). Where a report says "PCSX2/recomp" either
  serves; where it names PCSX2 alone, a recomp reading is a second-best that `docs/KNOWN.md`'s rules must accept.
- **Already on disk, do not re-capture:** the 2026-09-17 two-console MP6 peeks (`out_capture_0917.txt`, V2 "H3-g")
  already settle the host byte, the SEAL/Terrorist team words at body `+0xc8`, the spawn cell centre and +1.0 lift,
  `aiteam_00/08` = 1 on the host and `player_team` 0/8. They hold no hostage body.

### 4.3 S1 -- boot and the offline front end, at full frame rate

Setup: PCSX2, real CDVD speed ("fast CDVD" off), frame dumps of every frame (or >= 10 Hz with frame indices) from the
disc's ELF start, audio recorded; RDRAM and GS dumps at the screens named. No network.

1. **Boot to the Sony card.** Do: boot the disc. Record: frame index of the black before the panel, the panel's first
   non-black and full-ALP frames, the panel's hold, the LOADING logo's first frame and its hold until the Sony card;
   optionally a trace of the `sceSifLoadModule` calls. Settles: LOADER_START_PLACEHOLDER, RAW_UPLOAD_PLACEHOLDER,
   PULOADGP_HOLD_PLACEHOLDER, LOADING_HOLD_PLACEHOLDER (C5b "LOADER_START ... UNRESOLVED", BOOT-01, H19);
   MOVIE_FIRST_PICTURE_TICK_READING (ledger-C7; research 120 §9, "owed to BOOT-04 timing").
2. **SONY448 into INTRO_2.** Do: let the boot movies play. Record: 60 fps frames with audio across SONY448's first and
   last pictures and INTRO_2's first; or a recomp `PS2X_MPEG_TRACE`. Settles: MOVIE_END_LATENCY_READING,
   MOVIE_HOLD_READING (frames with no new picture), MOVIE_AUDIO_START_LATENCY_READING (audio of SONY448's first
   picture), MOVIE_PICTURE_PERIOD_READING (busy-frame overruns) (C7 §3.3 "Unresolved, with what is owed"; ledger-C7).
3. **The boot's card-search popup.** Do: on `boot.card-searching` (popup 827), press LEFT. Record: one frame. Settles:
   whether the toggled labels show on a buttonless popup, POPUP_STALE_FOCUS_READING (C5b).
4. **Main menu, pad.** Do: from boot, hold a write watchpoint on `pad+0x288`. Record: the writer's PC of stick 0's
   0.3 / 0.65 / 0.75. Settles: MENU_STICK_READING (C5b; alternative static read in the list below).
5. **Main menu, GS.** Do: a GS dump (`gs_dump`) of the main menu with an all-culled roller face. Settles:
   UI_MESH_BIND_READING (C6).
6. **Main menu, the zAnim instance.** Do: an RDRAM dump on the main menu; read a menu zAnim instance's `+0x3c`.
   Expect: 0 (written 0 at creation, D:L117159). Settles: UI_SOUND_PLACE_READING (C7 §3.1). Note: C7 says "any
   front-end dump"; the existing `logs/parity/menu*.rdram` (used by C4) may already answer it -- try that first.
7. **The menu fader.** Do: a write watch on an instance of `menu_fade_up` between `FUN_00268250` and `FUN_0026c600`.
   Record: the writer of instance byte `+5` bit 3. Settles: MENU_FADE_UP_AUTOSTART_READING (C5a §58).
8. **The front-end music wrap.** Do: stay on the menu until MUUI0003 wraps. Record: audio across the wrap. Settles:
   STREAM_LOOP_HISTORY_READING (C7 §3.1, "the capture of MUUI0003's wrap that research 152 already names").
9. **OPTIONS entry.** Do: open `dlgOptions`; then move the focus over a caption and off it. Record: the entry frame
   and the frames after. Expect: an unfocused, never-focused caption white at ~89.6 alpha, changing when the focus
   passes and leaves. Settles: BUTTON_START_STATE_READING (C6).
10. **A fading WRAPPEDTEXT.** Do: a dialog holding a WRAPPEDTEXT while the menu fader runs (e.g. a briefing text).
    Record: frames through the fade. Expect: under a node at opacity 0.5 the lines draw at 89.6. Settles:
    WRAPPED_LINE_ALPHA_READING (C6).
11. **A list dialog, button + stick.** Do: hold a button and the stick on a list dialog. Record: RAM dump of
    `DAT_0044f108`'s object. Settles: PAD_PAST_BUTTONS_READING (C6).

### 4.4 S2 -- a Suppression round, measured on one console

Setup: two instances on our Horizon (the online harness's default map is Frostfire, desktop DEVELOPING "The online
harness"); PCSX2 with PINE on instance A where named; RDRAM, GS and VU1 dumps on A. Instance B is the opponent and,
for 2.12-2.13, the shooter or the victim. Then change map for 2.19-2.22.

Entering the round
1. **READY through loading into the round.** Record: >= 10 fps frames from READY through the loading screen into the
   round, and a frame of `dlgLoad` mid-load. Expect: the fade-in duration = frames from the first non-black frame to
   ratio 1 (the 1-fps series shows one frame at x0.423/x0.386). Settles: LOADING_FADE_READING (C5b), and whether the
   bar is full from the first frame, PROGRESSBAR_UNSET_READING (C6). (Any map; S3's entry serves too.)

Body, camera, traversal (Frostfire)
2. **First person, standing and prone.** Record: PINE `cam+0xd8` (the placed eye) in state 1 against actor
   `+0x1c..+0x24`. Expect: eye 15.884 standing, 9.904 crouched, 5.768 prone on flat ground (C2 §1.3 derived).
   Settles: HEAD_HEIGHT_READING and PRONE_HEIGHT_READING's eye use (C2 §1.3).
3. **Peeks (one PINE poll, per frame: actor `+0x174`, `+0x375`, top anim id `+0x534`).** Do: (a) a prone press while
   holding the d-pad peek; (b) R pressed mid-peek, crouched; (c) a peek started during a get-up; (d) a dump during a
   lean, to see where `+0x174` becomes 3. Settles: PEEK_STANCE_ENDS_PEEK_READING (C2 §1.12), PEEK_HOLD_CONTINUES_READING
   (C2 §1.13), PEEK_CUTS_ACTION_READING (C2 §1.14), PEEK_THROW_READING (C3).
4. **Binoculars.** Do: R1/L1 raise and lower. Record: PINE `actor+0x534` (top id) and `anim+0x180` (second channel).
   Settles: BINOCULAR_LOWER_READING, BINOCULAR_BODY_READING (C2 §1.15).
5. **The timed console runs.** Do: research 79's harness holds (`--seal-speed`), a standing jump, a 1 s right-stick
   hold, a 2 s run, the W+D standing jump, the crouch diagonal; PINE poll actor position (`*0x408c58+0x1c:3`),
   `actor+0x48`, `cam+0xd8`, read at the 30 Hz frame. Expect (research 88 §5): `half_fwd` 26.0, `--light 0.75` 59.0,
   `crouch_walk` at 0.75 stands and runs at 59.0, t90 0.18 s plus pad latency, roots 11.48 / 5.50 / ~2.17; standing
   jump 92 (C2 §3); crouch diagonal 19.8 at 45 deg is the port's value under test. Settles: U-R88-CONSOLE-RUNS,
   U-CROUCH-DIAGONAL-A5 (C2 §3; ledger-C2).
6. **A kerb.** Do: walk a SEAL off/onto a 6.25 kerb over a lower floor (W2.2c's capture). Record: actor `+0x1c` y before
   and after the step. Settles: STEP_PROBE_LIFT_READING (C1 Part C; alternative static route below).
7. **A ladder** (on a map that has one; the reports name no map). Do: climb and measure; then a blast beside the
   laddered actor. Record: the ladder's step (C2's "console measure"); `+0x174` after the fall (5 kept?). Settles:
   U-LADDER-7.59 (C2 §3), KNOCK_IN_MOVE_PLACEHOLDER (C1 Part E); with it **[W2]** "exact ladder/hang attachment, actor
   state and mover outcome remain owed" (IMPLEMENTATION-PLAN, Actor action bullet).
8. **Hit while running** (B shoots A while A runs). Record: a PLAT-36 trace of the posed root's track against
   `seal_flinch_*`. Settles: FLINCH_LAYER_PLACEHOLDER and the remotePlayers.ts:155-162 row (C1 Part E; ledger-C1).
   **[W2]** in the same sitting: threshold boundaries and interruption priorities for flinch/reload, blast/traversal
   and prone cover; keep jump and short-flinch as negative cases (Actor action bullet).
9. **A knock-down's landing.** Record: a trace of the landing (who sets/clears body `+0x105c` bit 3). Settles:
   KNOCK_LANDING_GATE_READING (C2 §3; ledger-C2).

Grenades (one block; throw several M67s)
10. **Flight per frame.** Record: projectile `+0x54` every frame. Expect: steps of about 1/30 s of travel. Settles:
    FLIGHT_TICK_READING (C1 Part C).
11. **Spin.** Record: an RDRAM series of a thrown M67's model matrix. Settles: SPIN_PLACEHOLDER (C3).
12. **The arc over terrain.** Record: a GS dump with the arc over terrain (`tools_py/gsdump_extract.py`); read the line
    prims' `TEST_1` ZTE/ZTST. Settles: ARC_DEPTH_TEST_PLACEHOLDER (C3 "Unresolved").
13. **The thrower's controller.** Record: PEEK of the thrower's controller `+0x264` / `+0x42c` during a throw.
    Settles: the friendly-fire grenade branch's two flags (M1 G12).
14. **A grenade in the air at round end.** Record: a PLAT-36 trace: does `FUN_001ea720` or `FUN_001eb8c0` run before
    `FUN_00223680`? Settles: ROUND_START_PROJECTILES_READING, PROJECTILE_TEARDOWN_CALLS (C1 Part A2; ledger-C1).

Flash, launchers, M203, shotgun, ammo
15. **Level-3 flash on Frostfire.** Record: a frame 1 s in; RDRAM `0x4b4d30..0x4b4d3c`. Expect: (0.75, 0.75, 0.75,
    60.5). Settles: BLIND_FULL_READING (C3).
16. **Launcher aimed up.** Record: the node at `body+0x28`'s matrix rows. Expect: row 1 = (0, 1, 0) (no pitch).
    Settles: BACKBLAST_CONE_AXIS_READING (C3).
17. **Launcher slung (RPG or LAW).** Record: the `launcher` node's local matrix after `CZSealBody` set-up. Settles:
    HOLSTER_TRACK_READING (C9 L4) and PLAY_TS_REST_HOLDS (ledger-C9, "same owed read as HOLSTER_TRACK").
18. **M203 carbine held.** Record: what node `body+0x14bc` names, its world position against the weapon's `firepoint`;
    then fire HE at a wall and trace `projectile+0x48` against the hit point at `FUN_003c8920`'s entry. Settles:
    FIREPOINT_203_READING (C3), IMPACT_SIGHT_READING (C1 Part B).
19. **870 on B (read on the victim's console).** Do: a hit at 5 m; a point-blank hit. Record: victim `+0xffc..+0x1040`
    before and after; victim `+0x1320` / `+0x1324`. Settles: SHOTGUN_MP_PELLET_DAMAGE_SCALE_READING,
    BLOWBACK_CONSUMER_READING (C1 Part B).
20. **Stun.** Record: a memory watchpoint on one ammo record's `+0x10` for a round (any read). Settles:
    STUN_EFFECT_PLACEHOLDER (C1 Part B).
21. **Inventory menu.** Do: hold R2 in the round. Record: a frame (the `CWeaponSel` layout). Settles:
    INVENTORY_MENU_READING's draw (C9 L2).
22. **Dead.** Do: die. Record: a frame of the dead player's prompt. Settles: SPECIAL_GLYPH_PLACEMENT_READING
    (ledger-C3; research 95 L1059). (C4's SPECIAL_GLYPH_179 also wants "a capture of a line that uses it"; whether
    that line is this prompt is not established.)
23. **Reload while running, with respawn on.** Record: the original's running reload, clip by clip, beside the port's.
    Settles: research 150 §5's owed capture, which the RESPAWN_REPLAY_HOLD row points to (C1 misc rows; H77).
24. **A skinned draw, VU1.** Record: a VU1 dump of a skinned character draw. Settles: U-R78-COLOUR-LIT,
    U-R78-MATRIXID-LIDS (C2 §3; ledger-C2).
25. **[W2] World/audio.** Capture foliage bend trajectories, offscreen/remote influence, discontinuities and cleanup;
    the pitch path's audible range/sample-rate and fresh-start correspondence (World/audio bullet).
26. **A door pick tie** (where `wdoor_2` is; map not named). Record: a recomp trace of `FUN_0031e160`'s hit-list order
    for two hits at equal distance. Settles: PICK_TIE_READING (C1 Part E). Low priority.

Other Suppression maps
27. **Rat's Nest (MP8).** Do: walk the `DIRT` floors (85 % of them; `MP8_am` has no `.STEP_DIRT`). Record: audio.
    Settles: whether the console is silent where the port borrows, SOUND_FALLBACKS / `borrowMissing` (C7 §3.5;
    research 81 §12).
28. **Vigilance (MP51).** Do: (a) a posed savestate at spawn A, the camera at `0x415ff0 -> cam+0x2c/+0x38`; (b) a frame
    where a node-flag-bit-7 node (`metalgrate_door`, `water_wc11`) overlaps another transparent draw. Settles:
    VIGILANCE_GRASS_D7, NODE_ALPHA_LIST_AND_DEFERRED_LAYERS (C9 U15-U18; research 82).
29. **Chain Reaction (MP81).** Do: look along the map's longest axis. Record: a frame. Settles: FAR_CLIP (C9 U6;
    alternative static read below).

### 4.5 S3 -- Desert Glory (MP6), hosted, two consoles

Setup: two recomp instances on our own Horizon (A host, B client; instance B with `PS2X_SOCOM2_UDP_SHIFT=2` and its own
RSA key, desktop DEVELOPING "Online"), `PS2X_SOCOM2_NET_TRACE=1 PS2X_SOCOM2_NET_TRACE_ALL=1`, RDRAM dumps/peeks on both
at the moments named. First rounds with the host on SEAL, then on Terrorist. HOSTAGE §9 is the hostage half in one list.

Round start (dump both consoles)
1. **The hostages.** Record: the three hostages' `+0x1c..+0x24`, `+0xc8`, quaternion `+0x70`. Expect: positions
   (1750.26, ~50, 1179.72) ... (H2 §F), team word 0xC0020000. Settles: H2 U8, H2 U10 (HOSTAGE §9).
2. **Does a client spawn hostages?** Record on B: entity list (head `DAT_004362e8`, kind byte `+0x10` == 2) bodies with
   flag word `+200 & 0x20000`, each controller's vtable. Expect: only 0x669590 (CRemoteCtrl), as many as the host's
   0x6693f0. Settles: H3 §8.4 (and §1's "owed check").
3. **Valves and globals.** Peek `DAT_0045a1b4`, `DAT_00651178` (H3 §8.1) and the `ComeFromLan` short
   `*(*(0x450058))+4` (expect 0 on a hosted-server round). Settles: H3 §8.2, M2 §9.2 (hosted half; M2 also wants the
   same peek in a LAN round for the direction, a separate LAN setup).
4. **Start slots.** Record: each PlayerObject's `+0xfc8` (r0004 layout, Harry) and its position; check against
   `AIMAPS.MPS` key list record `+0xfc8`. Settles: START_SLOT_LINK_PLACEHOLDER; RESPAWN_BLOCK_PLACEHOLDER's client
   index (C1 Part C).
5. **Who starts `Hostage_start` / `Hostage_special`.** Record: a zAnim call trace (`FUN_0025d550`,
   `PS2X_CALL_TRACE`) at round start. Settles: H1 U3.

Hostages
6. **A non-host SEAL orders FOLLOW, later HOLD.** Record: in the net trace, the class-2 "AI Orders" record from B to
   the host and the socket it rides (DME TCP, aux-UDP 50000/50001, or peer UDP); the host's class-0 FieldUpdates for the
   hostage; the message window. Expect: one 8-byte record, byte 4 = 4 (FOLLOW; 5 = HOLD, `FUN_0058ef80`); FieldUpdates
   <= 10/s per field. Settles: H3 §8.1, M2 §9.4; the FOLLOW cue `FUN_005e7f20(issuer,0x2b,0)` (H1 U7; V2 "H3-b" traced
   the call to `FUN_002bad40`).
7. **Follow.** Do: the leader walks, runs, stops. Record: follower ctrl `+0x34`, its goal `+0x104`, the hostage's
   position each frame; its speed at throttle 1. Settles: H1 U4, H1 U5 (with the static read of `FUN_0058bc00`).
8. **The remote hostage.** Record on B: a remote hostage's AI word while kneeling and while following. Settles: the
   meaning of AI-word bits 28/29 and the remote's clip for states 0x17/0x11 (H3 §8.5).
9. **A Terrorist leads.** Do: a Terrorist aims at a hostage within 20 m. Record: body `+0xed0` bit 14; the hostage
   ctrl `+0x5d4`. Expect (code verdict, STRONG): it can lead; into Safety it pushes 0x11 with no points, the script
   still counts `rescuecount`. Settles: H1 U2, H2 U6 (first half), V2 §24 (grade PROVEN).
10. **The cell door.** Do: door shut, lead a hostage to the bars. Record: whether it is stopped; its position. Settles:
    H2 U2 (`nohostagerescue` / `okhostagerescue`).
11. **HOLD on a rescued hostage.** Do: lead one into Safety, then press HOLD on it. Record: the leader's score
    (`+0x58c+0x3c`) and the hostage AI's top state. Expect (BELIEVED): 0x11 pushed again and a second +3 on the host,
    clients crediting too. Settles: V2 §26 (owed #3).
12. **Shoot a rescued hostage, from the host and from the client.** Record: body `+0x1044`, `+0xe1` bit 4, `+0x105c`
    before and after. Settles: H1 U1, H3 §2.7 (the client-shooter half), V2 §25 (owed #4), H2 U6 (second half),
    HOSTAGE §8 item 2.
13. **A SEAL kills a hostage.** Record: game object `+0xe0` before and after; the message window text after each
    event. Expect: -60000 (one minute off). Settles: H2 §F "capture owed overall", HOSTAGE §9.
14. **The leader quits mid-follow.** Do: the leader's console quits while a hostage follows. Record on the host:
    the hostage ctrl `*(body+0xc0)` `+0x5d4` / `+0x5d8`. Settles: H3 §8.3, HOSTAGE §8 item 3.
15. **Elimination timing.** Do: (a) host on SEAL, a Terrorist dies at 16 s: does the SEAL win post at 16 or 17 s?
    (b) host on Terrorist, the first elimination at 15-17 s. Settles: H2 U7, M1 §2.1 (the note under the mode table),
    M1 G5/G6 (which perspective's grace governs on ESC/EXT).

The wire and the other console's view (any MP map; MP6 serves)
16. **Positions on the wire.** Do: B walks. Record: class-0 id 3 FieldUpdate records per second; whether each field
    carries its index byte. Expect: <= 5 per axis per second online. Settles: M2 §9.1, V3 §7, and whether
    `ONLINE_POS_INTERVAL_MS`/`LAN_POS_INTERVAL_MS` are swapped (H3 §0.2 item 1).
17. **One hit's payload.** Record: the 8 payload bytes at `FUN_002bbda0`'s `FUN_0030cef0` call (packet type
    `DAT_00440e00`, V1 "carry forward" 4). Settles: NET_DAMAGE_CLAMP_PLACEHOLDER's use (C1 Part B).
18. **A remote reload.** Do: A reloads by hand with a full magazine minus one. Record: B's audio. Settles:
    REMOTE_RELOAD_SOUND_READING (C1 Part A2).
19. **Remote footsteps.** Record on B: A's `*(actor+0xc0)+8..+0x10` while A walks and while A stands; B's `+0xe0` bit 2
    on A. Settles: REMOTE_STEP_STICK_READING (C9 L5), the remotePlayers.ts:186-188 footfall gate row (C1 Part E;
    ledger-C1).
20. **A claymore whose owner leaves.** Do: A sets a claymore and quits. Record on B: is it still drawn; can anything
    set it off. Settles: DEPARTED_CHARGES_READING (C1 Part A2).
21. **The TCM.** Do: open the command menu (Circle) online. Record: a frame. Settles: RADIO_MENU_PLACEHOLDER's look
    (C1 Part A1; alternative static read below).
22. **A match's end.** Record: a FINAL ROUND frame (both `TitleBar` objects drawn, or one hidden?); both clients from
    GAME COMPLETE into the lobby. Expect: clients switch at once, the master after 10 s. Settles: TITLE_PLACEHOLDER
    (C1 Part D §1), CLIENT_FINAL_EXIT_PLACEHOLDER (C1 Part A1 and Part D §12; research 91 §18).
23. **A vote-kick (3 inst. at least: the ban needs more than half the side).** Do: vote a player out. Record: our
    Horizon's 0x8A `MediusBanPlayer` handler logging fields `+0x28..+0x34` (the 120 word); a write/read watch on
    `0x44fb48` during the vote. Settles: VOTE_BANSELF_REQUEST, VOTE_BAN_SCOPE_PLACEHOLDER, VOTE_ALERT_BROADCAST (C1
    Part A1).
24. **Idle through a round.** Do: one player idle for longer than a round. Record: does `dlgNetBanned` or
    `dlgNetError` appear, and when. Settles: the idle-kick question (C7 §1.1 "Not held"; C8 Q1).
25. **A player quits a live game.** Record: which screen each console shows; who sets `mission_abort`. Settles: C8 Q4
    (#529's online writer).
26. **2v1, one leaves (3 inst.).** Record: does `dlgNetAbandoned` fire; `FUN_0030d510`'s result before and after.
    Settles: M2 §9.3, V3 §10, M2 §6 / `disconnect_abandon` (ledger-M2).
27. **Late join.** Do: B joins a started round as a ghost; then **[W2]** joins at controlled grenade, charge, corpse and
    result phases. Record: the scoreboard with the ghost seated; what state exists at creation/apply and what the
    viewer draws. Settles: GHOST_ROW_PLACEHOLDER (C1 Part A1; ONL-19); **[W2]** State restoration bullet.
28. **Friendly fire off, a teammate's M4 hit (3 inst.).** Record: breakpoints at 0x5ac74c (expect taken) and 0x5ab850
    (expect not reached). Settles: FRIENDLY_FIRE_ENFORCEMENT_PLACEHOLDER (C1 Part B; M1 G12).
29. **[W2] Pickups.** Capture classic death, exchange and contention with the actual ten-slot magazine contents
    (Pickup bullet).

### 4.6 S4 -- a Demolition map

Setup: two instances on our Horizon, any DEM map (C1 Part C mode table: MP1, 7, 9, 12, 72, 83); breakpoints/RDRAM on A.

1. **Walk up to a C4 target.** Record: a PCSX2 write breakpoint on `body+0x208` (body = `*(0x440c38)`); the writer's
   PC. Expect: 396 is about 19.9 squared (a squared distance through another base). Settles: C4_REACH_READING (C3
   "Unresolved").
2. **Standing vs walking at the target.** Record: the local body's `+0xe84` (actor at PlayerObject `+0x0`, Harry).
   Settles: C4_STILL_READING's `+0xe84 == 0` term (C1 Part E).
3. **[W2] Blasts.** Capture material attenuation and the player/destructible boundary cases (Explosives/pellets
   bullet).

### 4.7 S5 -- the online front end and lobby, against our own Horizon

Setup: PCSX2 on the local Horizon with the DNAS bypass pnach, frame dumps at 59.94 Hz; a second instance where marked
(2 inst.); Medius/DME logging on our server.

1. **LOGIN and DNAS.** Record: (a) LOGIN's first 30 frames after `SWITCHMENU(dlgNetLogin.rdr)`: is #572/#573 ever
   drawn? (b) the DNAS screen from build to switch: first frame `_533`/`_446` or #448/#534? (c) `DNASLogo`'s opacity
   across `TurnOnLogo`/`TurnOffLogo`; RDRAM `DAT_00414e40+0x5c`. Settles: NETLOGIN_CHECKING_POPUP_READING,
   DNAS_FIRST_FRAME_READING, DNAS_LOGO_OVERLAP_READING (C5a §60-62).
2. **#614 across the switch.** Settles: C5a U4 (research 153; ONL-07's connection).
3. **The persona screen.** Do: break at 0x27b364 for 20 consecutive idle ticks on `dlgNetPlayerName`. Record: `lw
   0x3c($sp)` beside the valve `mc_changed_slot`. Settles: MC_CHANGED_SLOT_UNWRITTEN_READING (C5a §39).
4. **The persona name keyboard.** Record: 60 fps across the keyboard opening; press LEGEND and capture across the 0.2 s
   slide. Settles: SKB_SCALE_READING (ledger-C5b; research 119 §13), SKB_LEGEND_ORDER_READING (C5b).
5. **An online list.** Do: RIGHT on an online list. Settles: the LISTBOX capture (C6 "LISTBOX"; research 117).
6. **The ARMORY** (online lobby -> ARMORY; C4 names Crossroads or any MP map). Record: (a) a native 640x448 frame of
   the weapon row with WEAPON TIPS and a one-line label (expect a ~1.6 px vertical frame border); (b) the F2000
   selected (is line 5 absent?); (c) a GS dump (RGBAQ per vertex) of the preview model; (d) a 989snd log over one
   description typing (count the `.TYPE` plays); (e) two frames of the preview 0.2 s apart. Settles:
   MULTILINE_LIFT_READING, UI_TEXT_ORIGIN_RESIDUAL_READING, ACT_FRAME_BORDER_READING, WRAPPEDTEXT_CLIP_READING,
   UI_MODEL_LIT_READING, ARMORY_MENU_TICK_RATE (C4 ([182](182-c4-armory.md)) "Owed captures, to batch for the owner"), SPIN_SCREEN_SENSE_READING
   (C6).
7. **CREATE GAME.** Do: cycle PLAYERS and ROUND COUNT through their ends; create a respawn game and open its details.
   Settles: G19 PLAYERS/SPECTATORS ranges and G15's per-game record (M1 G15/G19/G20; ledger-M1), and V1 §4's
   external check of the create-game decode.
8. **Medley (2 inst.).** Do: two matches of a Medley game. Record: the lobby's call point; the first map of a fresh
   Medley (the s4 game showed VIGILANCE first). Settles: M1 G16.
9. **The host leaves the game lobby before launch (2 inst.).** Record: the new host's screen. Settles: C7 §1.4
   ("owed to a capture"); C8 Q4 confirms the migration path.
10. **The ARMORY open when the host launches (2 inst.).** Record: what the client does with an unsent change.
    Settles: ARMORY_WAITING_LAUNCH_READING (C9 L6; ONL-17).
11. **A ladder post and the login-to-menu transcript.** Record: the wire of one stats post on the local stack; the
    ONL-32 transcript (does a session reaching AUTOPLAY enter a room first?). Settles: LADDER_STATS_COUNT_READING
    (C8 §20), FILTER_ID_READING (C8 §32; or the static read below).

### 4.8 S6 -- memory card states

1. **Fresh boot with a card holding a profile.** Record: the Create Game screen's friendly-fire caption on first show.
   Expect: "disabled" (0) unless the card restores the valve. Settles: V1 §5's residual (and C1's reconciliation of
   FF's default, "Reconciliations between parts").
2. **A fresh SaveConfig on PCSX2.** Record: a card dump of `BASCUS-97275SOCOMII/SaveGame0..6`. Expect: 1,952 B each, as
   the recomp wrote on the f0 card. Settles: SAVE_GAME_DUMMY_BYTES_READING (C5a §35).

### 4.9 S7 -- campaign M51, Seeding Chaos

1. **The stream at the slot-8 pose.** Record: a PCSX2 frame; the water pass's alpha from `logs/vu1dump3`. Settles:
   WATER_PASS_20PCT (C9 U15-U18; research 82 §5).
2. **M51IG07.** Record: a `PS2X_MPEG_TRACE` of the in-game movie's start. Settles: M51IG07 start tick (ledger-C7;
   research 137 §7).

### 4.10 S8 -- voice, two instances (blocked: the recomp must send voice first, research 170 §11)

Setup: two recomp instances on our Horizon; `PS2X_PEEK` on the voice object; a Medius/DME log of a talker; audio; one
player per side, then a spectator, then a late joiner. Or, sooner, one instance with the talk flag forced and the table
peeked (research 170 §11). Every row is research 170 §10's own "what would settle it", carried by ledger-C7 and C7 §4.

1. Hold talk past 10 s; peek `+0x6c` and the table's expiries: VOICE_FLOOR_HOLD_READING. A second presser, requests
   logged: VOICE_FLOOR_RETRY_READING. Past the cap, then press at 5 s and at 11 s: VOICE_CUTOFF_LOCKOUT_READING.
2. Read `voice+0x24` / `+0x2c` in the lobby, alive, dead, spectating and radio off: VOICE_CHANNEL_MAP_READING,
   VOICE_SIDE_BIT_READING (one player each side), VOICE_DEAD_CHANNEL_READING (across a death),
   VOICE_SPECTATOR_CHANNEL_READING, VOICE_OFFENSE_DEFENSE_NUMBER_READING (choose each RADIO row),
   VOICE_DEAD_TALK_READING.
3. Join a started game: VOICE_LATE_JOINER_READING. Two players on one channel: VOICE_CHANNEL_COUNT_READING.
4. Each held talk control in a round: VOICE_ROUND_TALK_BUTTON_READING (with the `controller.rdr` read below);
   VOICE_LOBBY_BUTTON_EDGE_READING; VOICE_TALK_STANCE_READING (a capture).
5. A capture of the game lobby and a round with a talker, with audio of press, busy and release:
   VOICE_INDICATOR_LOOK_PLACEHOLDER, VOICE_WHO_IS_TALKING_MARKER_PLACEHOLDER, VOICE_TALK_SOUND_READING.
6. The Medius/DME log of the talker: VOICE_WIRE_FRAMING_PLACEHOLDER.
7. **[W2]** Voice bullet: command byte `0x413870` and the voice fields through living/dead/spectator transitions,
   channel changes and talk presses; indicators/audio, channel-count membership changes and Goldeneye behaviour.
   Physical mobile controller/mic checks are device tests, not this session.

### 4.11 Merges and asks already answered elsewhere in the wave

- One MP6 session (S3) carries H1 U1-U5, H2 §F, H3 §8.1-8.5, M2 §9.1-9.4, V2 owed #3-#4, V3 §7/§10 and HOSTAGE §9:
  those reports asked for the same round more than once; each ask is one numbered line above with every id listed.
- M2 §6's "which pad bits set `+0xfcd/+0xfce`" is answered statically by C1 SPECTATOR_PAD_PLACEHOLDER (STRONG: d-pad
  Right/Left on release); no capture is scheduled for it.
- H2 U6's code question ("can a Terrorist lead") is answered by V2 §24 (STRONG); only the PROVEN capture remains (S3.9).
- H1 U7's call is traced by V2 "H3-b"; S3.6 only records the cue it produces.
- C1's "per-frame grenade capture" (summary, the 30 Hz section) and FLIGHT_TICK_READING are one line (S2.10).
- M2 §9.4 and H3 §8.1 differ on the record's label (M2: "id 5 (AI Orders)"; H3: "class-2 record, byte 4 = 4"); both are
  read off the same trace in S3.6.

### 4.12 Optional confirmations (the reports say no capture is needed; take them only if the session is already there)

- S3/S2: the 0.5 s before `dlgNetBanned` (C1 VOTE_ROUND_END_KICK); the respawn banner screen (C1
  RESPAWN_BANNER_PLACEHOLDER); the knock's model axis (C1 KNOCK_SIDE_READING); a standing SEAL's `+0x20` against the
  floor y (C1 CLAYMORE_CONE_POINT_READING); a longer PCSX2 run of frame counts for UI tick jitter (C6
  UI_TICK_HZ_READING); a trace of `NoFire`'s reader to raise LAUNCHER_RAISE_READING to PROVEN (C1 Part E).

### 4.13 Not settleable by any capture of ours

Sony's server rules are unobservable on our stack; they are owner's calls, not captures: NAME_KEY_CASE_FOLD_PLACEHOLDER,
FILTER_COMPARISON_READING, LOBBY_WORLD_FILTER_READING, SPECTATOR_PASSWORD_READING, LADDER_TIE_ORDER_PLACEHOLDER,
LADDER_ENTRY_READING (ledger-C8; C8 §21, §33-35, U8-U10). VOICE_RECORD_GAIN_STEER_READING waits on the codec
(research 170 §10). Wave-2's three HDD maps stay unavailable (IMPLEMENTATION-PLAN closing paragraph).

### 4.14 Static reads still owed (no capture needed)

Each is a read of the decomp/ELF/disc. Where a capture above is the alternative, it says so.

**Match, combat, bodies (C1, C3, C2)**
- `FUN_002c509c` area (Harry "save player team var"): the meaning of the `+0x20000` team bit (C1
  FRIENDLY_FIRE_ENFORCEMENT).
- The Medius SDK's `MediusBanPlayerRequest` layout (+0x28..+0x34), what the word 120 means (C1 VOTE_BANSELF_REQUEST;
  C7 §1.1). Alternative: S3.23.
- `mp_persistent`, `mp_prog_timer1` and `mp_game_sort_order`'s meaning (`FUN_002a76d0` D:L149487-149674;
  `FUN_002f7c40`, D:L150770-150771) (C1 GAME_OBJECT_MISC_VALVES; M1 G31).
- `FUN_002344e0`'s draw of the TCM and the TCM row table behind `FUN_0022fa90` D:L81626-81650 (C1 RADIO_MENU; M1
  G27-G30). Alternative: S3.21.
- `late_joiner`'s message codes (C1 LATE_JOINER).
- `FUN_003c9b70`: how a skinned character's collision polygons map to nodes (C1 SPINELO_RADIUS; low).
- The probe origin from the bone `FUN_005b0840` reads, posed per stance from `MOTION_P.ZAR` (C1 STEP_PROBE_LIFT;
  alternative S2.6).
- How the dialog loader treats two objects with one NAME (C1 TITLE_PLACEHOLDER; alternative S3.22).
- The anim-type names of states 9/10, motion kinds 1/0x12/0x1a and 0x11/0x13/0x19 (`FUN_005e4f90`'s list) (C1
  FLINCH_GATE, FLINCH_STANCE). Lead: C2 §5's static table at 0x661060 (`scratch/C2/nametable.py`) names any anim id.
- Kind-3 damage blocks in each `MPxx.ZDB:MZANIM.ZAR`: node names, hp, threshold (C1 C4_TARGET).
- REMOTE_KIT_APPLY's record: its two extra shorts (C1 Part E).
- Whether the `+0xd8` list `FUN_00552850` walks is distance-sorted (C1 footfall gate).
- The `CMPExitState` -> game state link (C1 ROUND_START_PROJECTILES; alternative S2.14).
- `ctrl+0x138`'s writer in the controller tick, for its unit (C3 STICK_FOLLOW).
- `FUN_00240e60`'s callers (vtable), per opening or per round (C3 PULSE_PHASE).
- Not attempted in C3: `FUN_00237760` with the redirect (HUD_ROUND_MODE_COUNT); `FUN_005c2430`'s column and
  `FUN_005bc730`'s height (PLACE_CAST_LIFT, PLACE_REST_LIFT); `FUN_0031df50`/`FUN_002d4c20`, `FUN_003b3800`
  (SCORCH_PROBE, SCORCH_PARTIAL_ORDER); the handlers `FUN_00264610`/`FUN_00266320`/`FUN_00264a40`/`FUN_002642f0`
  (THERMAL_LENS_FX); the Designator's fire (NO_FIREARM_RECORD); UI_MODEL_FORM; which lights `FUN_003b54e0` recolours
  (C9 NV_LIGHT_LIST).
- C2 §3, not attempted: `CZSIObject_Read` 0x289380 and `FUN_0028a100` (R77 head f32s, flag bits, pad lane, playback);
  `FUN_005e0010`, `FUN_005ae040`, the swap caller of `FUN_005a64c0` (R80 switch blend, swap gates, head look, rotator
  clamp); `FUN_005c4b10`, `FUN_005445b0` (zoom A31-A34); `FUN_005b56c0` and `min_jump_height`'s readers (A6);
  `FUN_00296f10` D:L140630-140830 (the `+0x45` blend, nudge, last target z); `FUN_0057dc20`'s sixth posture
  (RELOAD_POSTURE_SIX); `FUN_002c6110`/`FUN_002c6290` (A29 bob sign); the packer D:L179819-179861 (gamepad
  "assumed"); the readings named in `animator.ts`, `weaponPose.ts`, `weaponRaise.ts`, `throwPose.ts`, `mover.ts`
  (each comment names its function); the class of vtable 0x669268 (KNOCK_LANDING_GATE).
- `FUN_0054aa30`'s remaining branches (C2 §1.6 CROUCH_TOP/PRONE_TOP); `FUN_0058c820`'s mapping table for 0x38 (C2
  §1.15 binoculars); the look pitch term `cam+0xb4 +0x24` (C2 §1.3).
- C9 ledger MAIN_TS_ZOOM_COMBAT_READINGS: the dead zoom gate `FUN_005a8da0` D:L463193, kit `+0x20/+0x24` clear, the
  claymore message line text 0x65f880.

**Hostage (H1, H2, H3, V2)**
- `FUN_0058bc00` (and `FUN_0058bb50`): throttle to speed for AI (H1 U5; with S3.7).
- Name hunt in r0004/Harry objects for body `+0x375`, `+0x1060` bit 2, unit 18 (H1 U6); the filler of `FUN_00569c60`'s
  list (H1 U8); `FUN_005f0b30(ctrl, pos, 4,5,6)` (H1 U9).
- H1's state table for AI states 9 and 0x11 by name (H2 U1); the scene-graph collision flags of `di_`-style nodes (H2
  U2; alternative S3.10); loads of offset 0x38 on vtable-0x406390 objects (H2 U3 `access_action1` points); H1's event
  table for 0x44 (H2 U4).
- `FUN_005ed7b0` (unit removal) and body vtable `+0x90` (H3 §8.3; alternative S3.14); `FUN_005434b0`/`FUN_00543480`
  (H3 §8.5); that zone type 1 of `FUN_0052a200(0x66a1b0, 1, pos)` is MP6's extraction zone (H3 §8.6); `FUN_005e7960`'s
  de-duplication of the double CMD_MP_HOSTAGE_KILLED (H3 §8.7); the intersect routine feeding `FUN_005a5a80` (H3 §2.7).
- V2: the online player unit assignment (`FUN_005ef2f0`/`FUN_005ee250` callers at spawn; does HOLD = leader only?)
  (§18, owed #1); ctrl vtable `+0x24` for a missing CHRSND entry (are RESTRAINED/PANIC/HELPME audible?) (§16, owed #2;
  HOSTAGE §4.4); `FUN_005f5f20`'s pop (§26, owed #3; with S3.11).

**Modes and net (M1, M2)**
- Decode the 256 GameStats bytes already captured (`logs/parity/s4_pcsx2/slice-Medius.log` line 14) with M1's 'D'
  layout; read `SetMPMissionSeq(PLAYLISTVAR)` (M1 G21).
- The `dlgCreateGame` cycle scripts through the port's `dump-dialogs.ts` (M1 G15/G19; alternative S5.7). **[W2]**
  "the original option picker ranges" (Service/list bullet) is the same read.
- The r0004 twin of `FUN_002ce930` and its load of 0x475afc (M2 §9.5).
- `FUN_00623330(0x2000,0x8000)` / `(0x8000,0x8000)`: units and consumer (ledger-M2 `bandwidth_caps`).

**Front end, text, input, boot (C4, C5a, C5b, C6)**
- `FUN_0033eb70` / `FUN_0033e7f0` (`WeapProfile_%d.dat`), SaveCharacterProfile modes 3/4 (C4 ARMORY_MEMCARD_SAVE).
- `fonts.rdr` `font_special_01` code 179's record (C4 SPECIAL_GLYPH_179; the capture half is uncertain, S2.22).
- The UI world's draw (`FUN_00318da0` light setup, the UI model packets' ADC/colour words) for the 0.56 (C4
  UI_MODEL_LIT; alternative S5.6c).
- The game-lobby caption parse that builds `dlgGameLobby` (C5a §24 COMPARE_AFTER_FORMATTING).
- A search of the dialog flow graph (`$PORT/tools/dialogInventory.ts` edges) for 33 forward switches without
  `PREVIOUS_SCREEN`/`FlushMenuHistory` (C5a §49 MENU_HISTORY_OVERFLOW).
- Whether both `DescFieldMid` (and the other duplicated names) are OBJECTS entries (C5a U7).
- The in-game options' writer of the `stick_preset` valve (C5b MENU_STICK; alternative S1.4).
- The scan for `UIVAR` specs without `VALUE` whose name a temporary held (C5b UIVAR_REUSED_VALUE).
- The parent's vtable `+0x28` (head or tail insert) with the draw walk (C5b SKB_LEGEND_ORDER; alternative S5.4).
- The unit of `sceUsbKbSetRepeat(0, 20, 6)`: the libusbkb reference or `usbkeybd.irx` on the disc (C5b
  PHYSICAL_TYPING).
- The callers of `FUN_00320ea0` and `FUN_00320d70` at boot (C5b UI_TEXTURE_BANKS).
- Not attempted in C5b: VALVE_POOL, UIVAR_ELEMENT_EQUAL (`FUN_003352f0`'s non-array branches), MENU_EVENT_RECORDS,
  EXIT_*_READING (5 rows), the draw's use of bit 0 (UNHELD_BITMAP), SKB_CLOSE_SOUND (C7's table).
- The frustum test in `FUN_00339de0`'s grid walk D:L236851-236945: the far compare (C9 U6; alternative S2.29) **and**
  the ring direction (C6 ENGINE_ORDER_RING_DIRECTION) -- one read settles both.

**Audio, movies, card, services (C7, C8, C9)**
- The animation definition record's `+4` from `parseAnimSets`' raw records (C7 §3.2 BED_FADE).
- `FUN_005a54d0`'s CHRSND_DAMAGE play (`landingHurts`); the emitter clamp at 127; EXIT_STATE_GROUPS,
  KEYBOARD_SOUND_TRIGGERS, BOOT_POPUP_METAL; research 81 §12's list (FALLSOUND, `.GUN_EMPTY`, the LFO grain, Gaussian
  interpolation, PLAYER_INDOORS' writer, the activation-1 scripts) (C7 §3.5).
- Which lines carry HQ and what releases the duck `DAT_0048de20` (C7 §5).
- The binding record's edge byte `+0x704` for `dlgArtGal2` / `dlgPlayTutMovies` (C7 MOVIE_SKIP_CARRY).
- `dump-dialogs --dialog` of the persona-creation dialog and its `GetTextInput` extra bytes (C7 §1.3).
- MCMAN export #21 (0x9b4) through 0xa794 for type 2 with -5, and the card script's branch on `memcard_error_code == 6`
  (C8 §3-4); mcman's GetDir entry fill, export #12 0x14f8 -> 0x8020 (C8 U11-U12).
- The login-to-menu path: does a session reaching AUTOPLAY enter a room first (C8 §32; alternative S5.11).
- The remote seal controller's tick and its writes to `+8/+0xc/+0x10`; `FUN_005a3570`'s `+0xe0` bit 2 gate (C9 L5;
  alternative S3.19).
- The scheduler's `dT` unit (`FUN_0034e070` D:L248515) and the band flags `+0x16`/`+0x19` against
  `TextureScroll_Object` (C9 U7).
- `droppedMax` of the top-4 skin influences, measured over the disc's meshes (ledger-C9 SKIN_TOP4_INFLUENCES).
- Research 170: `controller.rdr` presets for actions 0x0a/0x0b (VOICE_ROUND_TALK_BUTTON); the rows' glyphs
  (VOICE_ROW_MARK); `FUN_0030e5a0`'s codec parameters (VOICE_MODULATION, plus a recorded sample SVC-22);
  `FUN_00236250`'s state 5 (VOICE_TALK_STANCE).

**[W2] wave-2 (IMPLEMENTATION-PLAN "Narrow source/capture work still owed")**
- Pickup: trace `005bb000`/`005ba770` capacity redistribution, launcher compatibility, lifetime/settling and owner
  departure.
- Actor action: blended-leaf and raw link/flag interpretation.
- Explosives/pellets: final ray/target correspondence; ordering across pellet contacts, shooters and actor updates.
- Damageable mines: geometry reach, queue ordering, lifetime/ownership; the body-blood mark's destination
  (character vs wall) and lifetime.
- World/audio: MP52/53 chopper callers' activation read; MP11's foliage own-bank binding.
- Service/list: the remaining persistent-game entry/lock paths.

## 5. The ledger's counts after round 2

From `research-wave-2026-10-04/LEDGER-counts.md`; the 697 rows themselves are [`ledgers/2026-10-04/LEDGER-ALL.tsv`](ledgers/2026-10-04/README.md). §1 wins over any row of it.

Rows after round 2 (a row re-researched in round 2 carries round 2's status; `updated_by` in LEDGER-ALL.tsv).

| cluster | resolved | partial | unresolved | not a gap | other | rows |
|---|---|---|---|---|---|---|
| C1 | 67 | 18 | 3 | 44 | 0 | 132 |
| C2 | 35 | 7 | 3 | 14 | 0 | 59 |
| C3 | 34 | 0 | 0 | 21 | 0 | 55 |
| C4 | 41 | 4 | 0 | 9 | 0 | 54 |
| C5a | 35 | 5 | 5 | 29 | 0 | 74 |
| C5b | 31 | 7 | 6 | 24 | 0 | 68 |
| C6 | 52 | 6 | 1 | 7 | 0 | 66 |
| C7 | 39 | 12 | 5 | 21 | 0 | 77 |
| C8 | 21 | 4 | 7 | 18 | 0 | 50 |
| C9 | 9 | 5 | 8 | 8 | 0 | 30 |
| R2-AV | 8 | 2 | 2 | 0 | 0 | 12 |
| R2-C3 | 0 | 1 | 0 | 0 | 0 | 1 |
| R2-MN | 14 | 2 | 1 | 0 | 0 | 17 |
| R2-UI | 2 | 0 | 0 | 0 | 0 | 2 |
| **all** | 388 | 73 | 41 | 195 | 0 | 697 |

Round 2 updated 107 existing rows and added 32 new rows (items not on a round-1 ledger).

M1 (31 items) and M2 (39 items) are gap matrices with port-status columns; see their ledgers.
