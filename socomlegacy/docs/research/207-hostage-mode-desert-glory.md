# 207 -- Hostage mode on Desert Glory: what the original does, and what it takes to port it

- Research date: 2026-10-04 (research wave 1, round 2 and the close; the index is [178](178-the-research-wave-of-2026-10-04.md)).
- Origin: `research-wave-2026-10-04/HOSTAGE-MODE-DESERT-GLORY.md` on the owner's host, in the evidence archive ([178](178-the-research-wave-of-2026-10-04.md) gives its root). A relative `scratch/...` path below is under `research-wave-2026-10-04/`; the per-cluster `ledger-*` files it names are merged in [`ledgers/2026-10-04/LEDGER-ALL.tsv`](ledgers/2026-10-04/README.md).
- Trees compared: **PORT** = `agent/online` at 2026-10-04 (written `$PORT`; `$PORT/..` is that branch's root, `$WEBISSUES` the `agent/web-issues` checkout); **WT** = the old-layout checkout (`$WT`, the clone's pre-restructure web project). WT-96..102 are notes 171-177 here; PORT's own notes 96-102 are other notes.
- **Status: reading, pending review -- not adopted.** Nothing in it is adopted until a sprint task takes it and a reviewer re-reads it at the source.
- Grades, translated to AGENTS.md's levels: the synthesis's "source-read" (the first wave's PROVEN) = **reading**; "strong" = reading with one interpretive step; "believed" = inference; "open" = unresolved. The text keeps the synthesis's words.
- Verification: a synthesis of H1-H5, M1-M2 and V2, V3, V5, V6 (research 189-193, 199, 200, 206), written after their corrections; it adds no evidence of its own and already carries research 206 §1's overrides.
- Edits on import: the headings are numbered for the corpus; home-directory paths are replaced by `$PORT`/`$PORT/..`/`$WT`; the archive's absolute root is dropped; references to the other reports are links to their notes; the claims research 206 §1 overrides are named under this header. The substance is verbatim.

Synthesis of H1 ([189](189-h1-hostage-ai-animation.md)) (the hostage as an actor), H2 ([190](190-h2-hostage-mode-rules-map.md)) (mode, rules, map), H3 ([191](191-h3-hostage-net-sync.md)) (network sync), H4 ([199](199-h4-hostage-closures.md)) (round-2 closures), M1 ([192](192-m1-mp-modes-rules.md))/M2
(modes and replication) and H5 ([200](200-h5-ai-pathfinding.md)) (the path planner), verified adversarially by V2 (hostage), V3 (modes/net), V5 (H4) and
V6 (clip rates); H5 is validated against routes the console itself computed. Every behaviour below is sourced in those reports, which carry
the `FUN_`/`D:L` citations, the data offsets and the reproducible scripts (`scratch/H1|H2|H3|V2|V3/`). Nothing here is
implemented. Where a point is not sourced, it is listed as open with the evidence that would settle it -- **no mechanic
in this document is invented**.

Grades: "source-read" = read exactly from the disc data or the code (the first wave called this PROVEN); "strong" =
code read and consistent across two lines of evidence; "believed" = one line, interpreted; "open" = not settled. No
hostage behaviour has been **measured on a running console**: there is no capture of any hostage map with actor data
(V2 H3-g). A runtime capture is the last gate before calling any of this parity.

---

## 1. What the mode is

| fact | value | grade | source |
|---|---|---|---|
| Map | Desert Glory = `RUN/MP6.ZDB` | source-read | `missionlist.rdr` NUMBER 6; H2 A1; V2 #1 |
| Mode | **EXTRACTION**, game type 4 (game `+0x111`); scoreboard caption **"EXTRACT"** | source-read | `FUN_002c9540` D:L168883; 0x3e5848; H2 #2 |
| Other maps, same rules | Blood Lake MP10, Death Trap MP11, Fish Hook MP71 (identical `objectives` script; zone/music/locale ids differ; MP71 has two zones) | source-read | H2 "Sourced but not implemented"; M1 G2 |
| Respawn | none (respawn exists only for SUPPRESSION) | source-read | `FUN_002a7560` D:L149418 |
| Not a mode | `hostage_rescue` / `escortee_extract` are AI valve names, not mode names | source-read | H2 #2 |

## 2. The map data (MP6)

| object | value | grade |
|---|---|---|
| Hostages | 3 escortees in `READERM.ZAR/vehicles.rdr`: `Hostage` (`mp_fem1` = `thai_biologist01`), `Hostage2` (`mp_fem2` = `thai_biologist02`), `Hostage3` (`mp_fem3` = `thai_wife`); team list `17 30 31` -> body `+200` = **0xC0020000** | source-read (V2 #2 settled H2's U8) |
| Spawns | AIMAPS named points: `hostageStart` (1750.26, 49.99, 1179.72), `hostage2Start` (1770.26, 49.99, 1169.72), `hostage3Start` (1770.26, 49.99, 1239.72) -- in the jail | x,z source-read; y strong (cell-height formula, validated on the 2026-09-17 capture's spawn) |
| Cell door | `cdoor1` at (1732.56, 50.5, 1218.42), DOOR, range 30; it swaps two collision nodes `nohostagerescue`/`okhostagerescue` | data source-read; **what the swap blocks is open** (H2 U2) |
| Extraction zone | `Safety`, AI-map zone kind 1 = EXTRACT_ZONE; corner cell (6,76), 8x15 cells = x 765.26..845.26, z 1884.72..2034.72, floor y -30.08; containment test `FUN_0052a200` | source-read (V2 #4) |
| Team spawns | the usual AIMAPS slots: SEALs 24 by the zone; Terrorists 24 in two groups (by the jail, and north-east) | source-read (H2 #7) |
| Spawn height | `y = min_y + (max_y-min_y)/1024 * ((cell >> 9) & 0x3ff)` (+1.0 lift for players) -- **the port says AIMAPS has no y; it does** | strong; also fixes `aimaps.ts`'s slot estimates for every map |

## 3. The rules (MP6's `objectives` zAnim script, decoded twice independently: H2 and V2)

- **SEALs win**: `rescuecount >= 2` **and** all three hostages resolved (rescued or dead). `rescuecount` = rescued +
  hostages the **Terrorists** killed. With two out and the third still in the cell, the round goes on.
- **Terrorists win**: the SEALs kill 2 hostages (`mp_hostages_by_seals >= 2`), or the SEALs are eliminated.
  Evaluation order: elimination first (Terrorists, then SEALs), then rescue, then SEAL kills. **Hostages never count
  toward elimination** (also seen in the 2026-09-17 capture: `aiteam_00 = aiteam_08 = 1` in a 1v1).
- **Time-out: a draw** (`mp_winner` 99), even with two hostages out.
- **A SEAL kills a hostage**: the killer -2 points (applied on the killer's own console); "escortees killed" +1 and the
  team recount on every console; **no kill line** (an auto radio cue 0x44 instead); the host cuts **60 s off the round
  total**, or to **1 s** when 60 s or less remains (`mp_penalty`, `FUN_002a6960`, host only; game `+0x40` bound to
  the name at D:L149589). Nobody is kicked. Nothing is counted unless the killer is a body (a type-2 entity).
- **A Terrorist kills a hostage**: the killer -2; the SEALs are credited with that hostage (it counts toward
  `rescuecount`).
- **Rescue**: a hostage that has been led (its last-leader id `+0x5d8` valid) standing in a kind-1 zone cell enters
  state 0x11; the **last leader** -- a SEAL -- gets **+3** and "brought out" +1 (stats `+0x1c`); each living teammate
  adds +1 to the team score. Credit stays with the last leader even after a HOLD. If the last leader no longer exists,
  there is no rescue.
- **Holds before the round ends**: a rescue win waits 25 s (WAIT 2 before "SEALS VICTORIOUS!"), the other wins 23 s.
  The result watch starts at 17 s on a SEAL console, 15 s on others; **only the host's result ends the round**
  (`FUN_002a9b30`), so the host's side decides which (SEALs by default).
- **Round clock**: the create-game round time (default 6 min), no mode-specific change but the penalty. Round-end bonuses
  as classic (+5 winners, +1 living), match to 6 of 11, plus an EXTRACTION **primary objective** for living SEALs when
  their team brought out >= 2.
- **Objective lines and cues**: every line, its scale and its sound are listed in H2 §C (20 sequences), e.g. "LOCATE
  AND EXTRACT THE HOSTAGES", then at 7 s "MOVE AT LEAST TWO…", "A HOSTAGE HAS BEEN RESCUED"; voice streams
  `^PH_0006/7/8/13`.

## 4. The hostage as an actor

### 4.1 States (the factory `FUN_005f6550`, class names from the vtables and a second name table -- V2 #15)

```
spawn (host only) --> CAiSHostage 0x17
   sub 3 RESTRAINED: stand; 2 s -> sub 2
   sub 2 HOLD: crouch (civ_stand2crouch -> civ_crouch); 5 s -> sub 5
   sub 5 WATCH: every 5 s, look at the nearest living body within 250 units
                (PANIC/HELPME cries exist in code but cannot fire online -- see 4.4)
 --FOLLOW (cmd 4) from a player--> CAiSFollow 9
   --HOLD (cmd 5) from the leader's unit--> CAiSHostage sub 2 (crouch, then watch)
   --leader dies or disconnects--> released; the per-frame UnitTick then sends HOLD,
        which returns the hostage to the escortee unit (YES cue) -> FOLLOW is offered again
   --in EXTRACT zone with a valid last leader--> CAiSRescued 0x11 (leader credited +3)
        -> stands, stops, fades out at 0.75/s, then its node is switched off (<= 1.33 s)
           -> no longer hit, picked or ordered
 any state --health 0--> dead
```

Round-2 corrections (H4, verified V5):
- **Leader death/disconnect is not a dead end.** H4 read that the hostage stays in the dead leader's unit and can never
  be led again; V5 found the per-frame UnitTick (`FUN_005e8060`) sends HOLD to every escortee whose unit has no living
  member, which puts it back in unit 0x11 with a YES cue. The release itself: `FUN_005998b0` -> `FUN_005477a0(0)` ->
  OnDeath `FUN_00547af0` (disconnect too). Capture owed to confirm the visible sequence.
- **The rescued fade.** `CAiSRescued` sub-state 2 fades the body (node `+0x9c`) at 0.75/s, then `SetActive(false)`; ray
  queries skip inactive nodes (`FUN_002d6260` D:L176893). Every console follows via AI-word bits 24-27 (opacity).
- **`Hostage_start` "Cower" does run on the host** at each level start and online round restart (`FUN_002a7d40` calls
  slot +0x4c on every object; V5 overturned H4's "never online"). Whether it is visible beyond the state machine's own
  crouch needs a capture.

### 4.2 Orders (FOLLOW! / HOLD POSITION)

- Context actions **0xe "FOLLOW!"** and **0xf "HOLD POSITION"**, both drawn with `action_escortee.tif`
  (`FUN_0021ded0`).
- Offered when the hostage is **the entity under the player's crosshair**, is alive, shares a team bit with the player
  (the hostage's 0xC0020000 overlaps both sides' masks, so **both SEALs and Terrorists** pass), and is within
  **Manhattan distance < 20 AI-map cells** (1 cell = 10 units = 1 m; `sltiu 0x14` at 0x591f94; distance read from
  body `+0xe8`, ignoring the sub-map -- V2 #18 correction).
- FOLLOW only while the hostage is not led (in the escortee unit 17); HOLD only to a player in the hostage's unit (in
  practice its leader).
- **Terrorists can lead a hostage** (no side check anywhere on the offer, forward or host path -- V2 #24, strong). A
  Terrorist-led hostage reaching the zone still counts as a **SEAL** rescue in the script.
- On FOLLOW, the hostage says YES (`^CO_0343`), joins the leader's unit, and the host broadcasts radio 0x2b ("A HOSTAGE IS
  BEING ESCORTED"). `TryControlHostage`/`ControlHostageAction` (Harry's names; r0001 `FUN_005fd010`/`FUN_005fcf10`)
  store the leader and keep the leader's `NumberOfHostagesControlled`.

### 4.3 Following (`CAiSFollow::Tick` `FUN_005fb1c0`)

- The leader records a trail of up to **75 cells**. The hostage targets the trail point `depth` entries back, shifted
  `lateral` cells sideways by the formation table: (2,2) (3,-2) (4,-3) (5,-2) (6,3) (7,5) (8,-4) (9,-5) by slot.
- It plans with the AI map's A* when the trail does not reach. It arrives within **18.75 units** (1.25 x 15). Within 67.5
  units it matches **1.2x the leader's speed**, clamped to [0.25x leader throttle, 1].
- **The hostage always stands** while following; it does not mirror crouch/prone.
- WAIT_UP beyond 100 units **from the goal**; beyond 600 **from the leader** the hostage holds; both, and the arrival
  look, apply only when **the host's own player** leads (H4 #4, V5). WAIT_UP is silent anyway (4.4).
- **Speeds** (H4 #3, V5 read them in the PCSX2 dump): hostage top speed forward **65 u/s** (6.5 m/s; the SEAL's is
  also 65), backward 11, strafe 8, crouch 0. Clip bands: walk 0-29, jog 12-56, run 34-65. Throttle t = t x 65. Follow
  throttle = clamp(|1.2 x leaderSpeed / leader's top speed|, min(leader cap, 0.25), 1).
- **Threshold roles** (H4 #4): 10/15 decide when the route is stale; 7 gates the replan; 3 is the shortcut margin; 0.1
  pauses the route near the goal; 8/5 are the range and threshold of the arrival look probe; the other 3 is the
  restart distance after a turn. Sub-states 4 arrived, 5 turning, 7 idle, 8 path-failure wait (2.5 s).
- **Doors**: followers never open doors; the door animations do not repaint the AI map (H4 #6).
- **The path planner** (H5; transcribed and replayed against 8 routes found in console RDRAM: 6 exact, 2 one node off at
  equal cost). The A* is `FUN_00510ff0`, run per frame by the "ai_route_planner" task (H1's `FUN_00526540` is the
  per-floor leg split and second smoothing, not the A*):
  - 8 neighbours per 10-unit cell, no corner-cutting check;
  - step cost = trunc(10 x float cost); a hostage online uses the BASIC model (ground 25 straight / 27 diagonal, climb
    75 / 82, an occupied cell 2.5x) -- **the PS2 FPU rounds toward zero, so a diagonal step is 12 not 13**, which the
    captures prove;
  - heuristic 10 x Manhattan; binary-heap open list (1024), closed list 24,576; ~2.1 ms a frame shared by all AIs; a
    route fails after 200 frames (codes 2/3/4/6), then the follower waits 2.5 s and replans;
  - smoothing: greedy shortcuts along a 2-unit line walk refusing blocked, collision, occupied and steep-uphill cells;
  - cell bits 0-4 terrain type (0 nogo, 1 default, 6 climb, 7 stairs, 9 trans, 10 noalt, 11 steep...; 0/8/9/10 not
    walkable), 5 occupied (every body marks its cell), 6 name, 7 action, 8 link, 9-18 altitude, 28-31 A* parent;
  - zone kinds never change a multiplayer route.
  - **MP6**: each hostage exits through the cell-block doorway (103,10) -> (102,10) [the DOOR action cell] -> (101,10),
    then the north-west opening, then south-west to Safety: from `hostageStart` to the zone centre, 146 cells, 1,658 units
    after smoothing, 28 waypoints. The jail bars' cells are type 9 (not walkable) whatever their collision material.
  - **Open**: nodes per frame slice (a long plan's frame count), steering gains, whether remote players mark cells
    occupied on the host, part of the floor-to-floor search (H5 §unresolved).

### 4.4 Corrections that matter online (V2 #16, #17)

- The 3 s watch period and HELPME need a flag nothing sets online; PANIC needs a body sharing no team bit with the
  hostage, and every MP actor shares one. **So online a hostage only looks around; it never cries.** And
  `mp_hostage_extract` has no sound table for RESTRAINED, HELPME, PANIC, WAIT_UP or NO, and there is no fallback bank:
  they are silent. **Only YES, DAMAGE and DEATH play** (H4 #8, V5).
- **The jail bars** (H4 #6, V5 raw byte diff): `nohostagerescue`/`okhostagerescue` are identical 9-polygon walls that
  differ only in material, 28 METAL_GRATE (penetration 0.4) vs 3 INVISIBLE_DI. With the cell door shut, the bars block
  the crosshair (no order through them) and bullets hit the grate. The swap does not touch the AI map, whose bar cells
  are type 9 (not walkable) either way (H5).
- **Friendly fire off never protects a hostage**: they are the one teammate target still hittable (0x5ac720-0x5ac74c;
  the 0x20000 escortee bit, R2-MN ([203](203-r2-mn-match-modes-net.md))).
- "Get down" (prone 10 s) is unreachable online: the only MP orders are FOLLOW and HOLD, and the hostage's animation set
  has no prone clip.
- Online, all AI event masks are zero (`FUN_00572d70`): **hostages do not react to gunfire or explosions**.

### 4.5 The body

| item | value | grade |
|---|---|---|
| Models | `thai_biologist01/02`, `thai_wife` (+ `_1`/`_2` LODs at 160/260; wife 150/250), texture `thcivpow` | source-read |
| Skeleton | 26 parts, same names and topology as the SEAL: the port's skinning works unchanged | source-read (mesh decode H1) |
| Animation set | "No_weapon anim set": `civ_stand` 0.233 s, `civ_stand2crouch` 0.400 s, `civ_crouch` 1.400 s, `civ_walk` 0.700 s, `civ_jog` 0.733 s, `civ_run` 0.733 s, `civ_walk_bw`, `civ_rstep`/`lstep`, `civ_step`; **root travel is not 0** (V6 corrected H1: `civ_walk` moves 11.72 u a cycle, K 5.97; `civ_jog` 25.00, K 2.93; `civ_run` 40.62, K 1.81) -- play them through the port's `motionOf` with K, as the SEAL's locomotion | source-read (`MOTION_P.ZAR`, `motion.rdr`) |
| Health | head 8, body 40, arms 10/10, legs 15/15, armor 0 (`mp_hostage_extract`) | source-read |
| Death | TEAMMATE ("buddy") death lists on every console: `death_buddy_stand01-03`, `crouch01`, `prone01`; voice `.FEMALE_DEATH`, `.FEMALE_DAMAGE` | strong |
| Captive pose | none online (no tied hands); the "Restrained" set is single-player | source-read |

## 5. Network: how the original syncs it (H3, verified V2/V3)

- **The host simulates the hostages**; nobody else spawns them (spawner runs only offline or on the host, D:L156005).
  Each is an ordinary **SealObject** (no hostage net type exists; 7 object types in all). Other consoles draw a
  `CRemoteCtrl` body with no AI.
- A client's FOLLOW/HOLD goes to the host as an 8-byte **AI Orders** message (cmd 4/5); the host executes it without
  re-checking. Authority never moves.
- The hostage's state replicates in the **AI word** (object `+0x10`): bits 0-7 AI state (0x17/9/0x11), bits 8-23 the
  leader's or rescuer's id. Position, heading and health go in the same object, at most every **100 ms online** per
  field on change (V3 corrected M2 ([193](193-m2-mp-net-replication.md)): online is 100 ms, LAN 200 ms). Remote copies ease with `expf(-50*dt)` and snap
  beyond sqrt(1000) units or 5 in height.
- Hits: the shooter's console detects and broadcasts `Hit`; damage applies only where the hostage is local (the host).
  Kill counters run on every console; the score change only on the killer's.
- Rescue: the host's tick sets state 0x11 with the rescuer's id; every console credits only its own player.
- Leader dies: the host releases. Host leaves: the hostages migrate to the new host, which rebuilds their AI from the
  AI word. Late join: objects arrive whole, in their current state.
- What a remote console plays (H4 #9, V5): the clip comes from the replicated stance byte (0x7f) and speed --
  `civ_stand` for the first 2 s, then `civ_stand2crouch` -> `civ_crouch`; following: standing, `civ_walk/jog/run` by
  speed; rescued: stands, stops, fades. AI-word bits 24-27 = opacity, 29 = the friendly compass mark, 28 = the offline
  order flag. The hands byte 0x7e and the unit (field 0x74) also replicate (H3 said 0x74 was not applied; H4/V5 found it
  is).

## 6. What the port has, and what it lacks

**Reusable** (in `agent/online`): the classic round machine (`match/src/room.ts`: clock, end, watch, holds, draws,
+5/+1, match end), AIMAPS spawns and zones (`scene/src/aimaps.ts`, `tacMap.ts`), doors (research 92: `cdoor1` opens),
the message window, compass nav marks (research 87 §10), the scoreboard, the round-stream resolver and `roundCues.ts`
(already decodes MP6's intro/elimination cues), the SEAL skeleton/skinning, the clip player, the server-side hit cones.

**Missing** (H2 G1-G17, H1 suggestions 1-5, H3 §7): the room never reads a map's game type (every room plays
SUPPRESSION); no AI actors at all; no zone test; no hostage scoring/penalty/cues/marks/prompts; scoreboard says
"EXTRACTION" not "EXTRACT"; no hostage messages on the wire.

## 7. The implementation plan (proposed; tests first; nothing implemented)

The port's server plays the original's host (MISSION parity rule 5: the server architecture is an adaptation; what
players see must match). Phases are ordered by dependency; each lists its first failing test.

| # | work | first test | depends on |
|---|---|---|---|
| P1 | **Game type per map** from `missionlist.rdr` TYPE (also unblocks Demolition/Breach/Escort, M1 G3) | "MP6 is EXTRACTION, MP2 SUPPRESSION" | -- |
| P2 | **AIMAPS cell height** reader `aiCellY`; named points and zones in 3-D | the four KNOWN spawns within 1.5 | -- |
| P3 | **Zone test** on an actor's cell (kind 1) | "(6,76) in, (14,76) out, (13,90) in, (13,91) out" | P2 |
| P4 | **Escortee actors in the room**: three named actors from `vehicles.rdr` at their points, team 0xC0020000, hit volumes and health from `mp_hostage_extract`, excluded from elimination, in snapshots as bodies with a `kind` | "MP6 spawns Hostage, Hostage2, Hostage3 at …"; "elimination ignores hostages" | P1, P2 |
| P5 | **Hostage AI on the server** (H1's state machine at the game's 30 Hz frame): spawn -> stand -> 2 s crouch -> watch; FOLLOW/HOLD; leader death/leave -> release, then the UnitTick's HOLD back to the escortee unit (YES); rescued fade (0.75/s, then untargetable) | "spawn, 2 s later crouch"; "leader killed -> released, FOLLOW offered again"; "rescued -> untargetable after 1.33 s" | P4 |
| P6 | **Orders**: client `hostageOrder {hostage, cmd 4|5}` (reliable); server validates exactly the original's offer rule (crosshair entity, alive, team bit, < 20 cells, FOLLOW unled / HOLD from the unit; both sides); radio 0x2b broadcast; HUD prompts with `action_escortee.tif` | "SEAL at 19 cells offered, 20 not"; "Terrorist may lead" | P5 |
| P7 | **Follow**: 75-cell leader trail, formation slots, the original's A* (H5's pseudocode and its eight first tests, incl. MP6 and M51 golden routes and the round-toward-zero step cost), arrive 18.75, speed rule (top 65 u/s; throttle formula §4.3), always STAND; the body plays `civ_*` by speed band | "leader walks 30 m straight; hostage arrives within 18.75 of its slot" | P5, A* on the AI map |
| P8 | **Rescue and kill scoring**: zone + last leader -> 0x11, +3, brought-out, team +1s; kill attribution by side, -2, no feed line, `mp_hostages_by_*`, the 60 s / 1 s penalty | G5-G8 tests in H2 §E | P3, P5 |
| P9 | **Round rules**: the objectives logic (win/loss/draw, evaluation order, 25/23 s holds, 17/15 s watch, primary objective) | "two rescued + third in cell + time-out = draw"; "two rescued + Terrorists kill third = SEAL win"; "SEALs kill two = Terrorist win" | P8 |
| P10 | **Presentation**: compass marks (hostage type 4, zone type 6, always on, pulsing, H2 §D colours), objective lines, cues `^PH_0006/7/8/13`, scoreboard "EXTRACT", HOSTAGES RESCUED in stats | layout/caption tests | P8 |
| P11 | **Client rendering**: remote hostage bodies with the `thai_*` models, clip from the stance byte and speed (§5), the rescued fade, buddy deaths, only the YES/DAMAGE/DEATH voices | e2e: MP6 room shows three crouched hostages | P4 |

P1-P3 are small and also serve every other mode. P5-P7 are the bulk; the A* is no longer a research risk (H5 transcribed
and validated it) but is new code in the port. The whole is a sprint of its own; P1-P4 + P8-P9 (hostages that stand, can be shot, and score) could
ship before a perfect follower.

## 8. Decisions for the owner

1. **Double rescue credit (now source-read, H4 #1, V5):** during the <= 1.33 s fade after a rescue, a HOLD (or
   FOLLOW then HOLD) pops CAiSRescued (`FUN_00555900`, unwind at D:L420253) and the next post-tick re-rescues and awards
   +3 again. After the fade the hostage cannot be picked. Copy the quirk (it is the original's), or gate it and record
   the deviation? Capture owed to see it on screen.
2. **Shootable during the fade (H4 #2, V5):** the body stays a target until its node switches off (<= 1.33 s); a kill
   in that window counts both as rescued and as killed (double count). Same choice: copy or gate.
3. **Leader disconnect: settled** -- released through the death path, then the UnitTick's HOLD returns the hostage to
   the escortee unit (V5). No adaptation needed.
4. **Smoothness:** the original's remote hostages updated at <= 10 Hz with exponential easing; the port's 30 Hz snapshot
   with interpolation is smoother. M2 and H3 recommend keeping the port's (players are already done that way).

## 9. Owed evidence (one PCSX2 session on MP6 settles most of it)

One hosted two-console Desert Glory round, with RDRAM dumps at chosen moments and the recomp's net trace:
- round start: the three hostages' positions, `+0xc8` team word (0xC0020000), facing quaternion (H2 U10);
- a SEAL leads a hostage: follower `+0x34` sub-state, goal `+0x104`, position per frame (H1 U4, U5);
- the leader is killed, and separately the leader's console quits, mid-follow: the YES cue, the hostage's unit, FOLLOW
  offered to another SEAL (V5 H4-5b); a client orders FOLLOW (the AI Orders record, the transport, H3 §8.1);
- after a rescue: the fade time (expected <= 1.33 s); shoot the hostage inside the window; press HOLD inside it and read
  the leader's score (expected +3 twice) (H4 #1-2);
- round start on the host: whether `Hostage_start` "Cower" plays visibly (V5 H4-7);
- with the cell door shut, lead a hostage to the bars (H2 U2);
- a SEAL kills a hostage: game `+0xe0` before/after (-60000) and the message window.
