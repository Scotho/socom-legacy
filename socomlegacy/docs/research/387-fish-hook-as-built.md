# 387 -- Fish Hook as built: the planks, the barriers, the doors, the panes and a joiner's snapshot (DF-8)

- Date: 2026-11-08. Task DF-8 of the Desert Glory and Fish Hook plan draft
  (`agent-mail/evidence/dg-fishhook-readiness-2026-11-08/PLAN-DRAFT.md`, the readiness report `REPORT.md` beside it; the
  plan is not on `main` when this is written, so this note's own Log (§11) carries the task's record). Branch
  `agent/df-8-fh-note`, cut from `agent/v0415` at `68ecb7316`. The map's first research note: research 175 §5.4 was an
  audit of the data, not a note on the map as the port builds it.
- Track: simulation. It reads what the original does with MP71's twelve placed blocks -- three planks, three barriers,
  four panes -- and its six doors, and pins the port's common paths on MP71's own data. **It changes no behaviour**: every
  class runs on a path built and pinned on another map (Blizzard's windows for an HP-0 block, Vigilance's barriers,
  Frostfire's panes, the door path of research 92); this task found the port already doing what the reading says and
  pinned it. What the port does not do is listed in §8 under the placeholders that own it.
- Status: **reading** (DF-8's and DF-9's reviews PASS WITH FINDINGS, high, folded: `agent-mail/evidence/dg-fishhook-readiness-2026-11-08/REVIEW-DF-8-1.md`, `agent-mail/evidence/dg-fishhook-readiness-2026-11-08/REVIEW-DF-9-1.md`; the DF lane batch review, `agent-mail/evidence/mega/REVIEW-DF-TASKS-AND-BATCH.md`). Nothing here is measured running: no capture of the original shows a Fish Hook
  plank, barrier or pane broken (H431 asks for one: "a plank shot and a pane shot on MP71"; H421's shape). Every disc value below was read
  through the repository's readers (`@s2u/scene` `parseAnimSets`, `decodeEffectProgram`; viewer `loadSimMap`, its
  `MapMeta`, `readDoors`) on `RUN/MP71.ZDB` -- `MZANIM.ZAR` set `mission`, `READERM.ZAR`'s `actions.rdr` -- on this host's
  disc (`SOCOM_DISC`); MP71 is not a committed fixture (DF-2 adds it), so the pins skip without the disc. The code is
  cited `FUN_<addr>` / `D:L<line>` of `game/analysis/socom2_game.elf.decomp.c`; no decompiled text is pasted.
- Sources beside the disc and the decompilation: research 175 §5.4, §6, §9 (the audit; its sha-256 of `MP71.ZDB` at
  :42), 174 §3 (the destructible damage path, `FUN_002739b0`'s C4 gate read from its recompiled body against the ELF's
  words), 209 §13 and its readings table (`SCENE_DEATH_AUTHORITY_READING`), 210 §6-§8 (panes and barriers), 386 (Blizzard:
  the HP-0 window, the told death, `SCENE_NODE_MOTION_PLACEHOLDER`), 92 (the doors), 213 §2.3 (`FOR_CHILDREN`), 383 §4
  (r0004's `b1`).

## 0. The answers

| # | What | The original (the reading) | The port at `68ecb7316` | This task |
|---|---|---|---|---|
| F1 | What breaks a plank | any hit that reaches it: `FUN_00273a50` runs the death check on the health after the damage step (D:L120978-120990) whether or not the shield let the damage through, so a block at HP 0 dies on the first hit -- the shield (0 here) does not decide it; on the console whose round it is (§2.3) | the same, on the room (the one authority) | pinned (§9) |
| F2 | What a plank does when it breaks | `EXECUTE_ACTION set_plankN` -> `plank_actionN` (type 8, points 0) -> `destroy_plankN`, once a round: `good_parts` and `di_good` off (the four polygons out), `whats_left` on; under `IF skip_effects == 0` `bad_parts` on, its seven parts flown (`FOR_CHILDREN`, `plank_part_fly`) and `.WOOD_DEBRIS` at the root | the node changes, on the wire; the page plays `.WOOD_DEBRIS` and turns `bad_parts` on; **the parts do not fly** (`FOR_CHILDREN` skipped, H99) | pinned; the flight listed (§8) |
| F3 | Is a plank a C4 target | never: `FUN_002739b0` takes only HP above 0 (research 174 §3) | the same (`accepts`) | pinned |
| F4 | The barriers | Vigilance's class: 1 / 17 on `good_parts/di_good` (flags 0x2b); C4 (18) and an RPG round (20) open each, an M67 (10) does not; `access_actionN` points 2, once a round; `access4..6` stored, unplaced | the same | pinned (§9) |
| F5 | The doors' reach: a height term? | **none** on any of the six: each `DOOR` record's `elevation` is -1, and `FUN_005aa240` tests height only when it is not -1 (D:L463895-463899). `door_ft_2` (floor y 179) and `door_ft_5` (y 222) are kept apart by the pick's ray, which meets the floor between first | the page's pick the same; the room's check (an adaptation) on the ground plane alone, as the original's reach | pinned; `doors.ts` unchanged |
| F6 | The panes | Frostfire's class: `wframe` (flags 0x823, as Frostfire's `door_slab`) 1 / 0 / 0 on its own `wglass`, two polygons; at HP 0 `breakapane` -- `.GLS_BRK_MD`, `DESTRUCTION_SOURCE`, `wglass` off -- one placement at a time | the same; fragments drawn none (`GLASS_FRAGMENTS_PLACEHOLDER`) | pinned |
| F7 | A joiner | the state, silently (`skip_effects`): an open door, a broken pane, a blown barrier and the three hostages together | the same: the welcome's `env` and `hostages`, the first snapshot's `doors` and bodies | pinned |
| F8 | r0004 | switches `b1` off (its two `barrel_green_closed`, four owners; research 383 §4) | the same (`switchedOff`) | cited; the owners' state checked in the plank pin |

## 1. The map's scene on the disc

`RUN/MP71.ZDB` -> `MZANIM.ZAR`, one set (`mission`), read with `parseAnimSets`; placed through `loadSimMap`
(`MapMeta.scene`, `MapMeta.actions`, `SimMap.doors`). The ten destructibles bound, in binding order:

| Animation (flags) | HP / shield / armour | Root -> target (placed) | Target polygons | Sequence |
|---|---|---|---:|---|
| `wframe` x4 (0x823) | 1 / 0 / 0 | `worldmodel/<house>/window01=window01/wframe` -> `.../wframe/wglass`, `<house>` = `h8wc1`, `h7wc4`, `h7wc3`, `h7wc2` | 2 each | `CALL_ANIMATION breakapane` |
| `access1` (0x2b) | 1 / 17 / 0 | `worldmodel/access1` -> `access1/access_fencegate=access_fencegate/good_parts/di_good` | 2 | `EXECUTE_ACTION set_access1` |
| `access2` (0x2b) | 1 / 17 / 0 | `worldmodel/access2` -> `access2/access_point=access_point/good_parts/di_good` | 7 | `EXECUTE_ACTION set_access2` |
| `access3` (0x2b) | 1 / 17 / 0 | `worldmodel/access3` -> `access3/access_frontgate=access_frontgate/good_parts/di_good` | 4 | `EXECUTE_ACTION set_access3` |
| `plankaccess1..3` (0x2b) | 0 / 0 / 0 | `worldmodel/plankaccessN` -> `plankaccessN/wood_planks=wood_planks/good_parts/di_good` | 4 each | `EXECUTE_ACTION set_plankN` |

`access4..6` (0x2b, 1 / 17) are stored and placed nowhere (`SceneMeta.unplaced`; one diagnostic each). The set holds no
`FIRE_WEAPON` and no scene `CALL_ANIMATION` into another node's set (the readiness report's scene review, confirmed by the
program dump of 2026-11-08). The twelve placed actions of `actions.rdr`:

| Action | Type | Valve | Animation | Range / elevation | Points | Place |
|---|---|---|---|---|---:|---|
| `door_ft_2`, `door_ft_3`, `door_ft_5`, `door_ft_6` | DOOR (0) | its own name | `singleDoor_left` | 30 / -1 | 0 | (2135.5, 179, 602), (2342, 179, 393), (2123.5, 222, 622), (2466.5, 179, 598) |
| `door_rg_1`, `door_rg_2` | DOOR (0) | its own name | `singleDoor_right` | 30 / -1 | 0 | (2192, 179, 782.025), (2157.975, 222, 812) |
| `access_action1..3` | type-less (8) | `set_accessN` | `destroy_accessN` | 32 / -1 | 2 | (1937.5, 151.561, 1167.451), (1707.307, 149.028, 824.467), (2280, 191.5, 840) |
| `plank_action1..3` | type-less (8) | `set_plankN` | `destroy_plankN` | 32 / -1 | 0 | (2349.746, 218.567, 874.611), (2065.543, 184.735, 1163.659), (2370.46, 176.255, 1174.632) |

The saved references (`MapMeta.initial`, the node-reference words' bits 31 and 28, `FUN_0026b5e0`): every barrier's and
plank's `good_parts`, `good_parts/di_good`, `whats_left` (deactivated at load), `bad_parts` (deactivated at load) save
their active state, and each `bad_parts/part1..7` its active state and transform; each pane's `wglass` its active state;
each door node its transform. So the round's reset (`FUN_002ac0e0` D:L151976-151991, `FUN_0026b430`) gives every one
back. No `MZANIM` animation autostarts with an `OBJECT_ACTIVE_STATE` (`MapMeta.autostart` empty); the boats' and the
shore's autostarts are display runs, DF-9's.

## 2. The planks (F1-F3)

### 2.1 The data

`plankaccess1..3`: state 1, flags 0x2b, root reference 1 (`plankaccessN`), health reference 2 (`di_good`, search 1),
`Anim_Health` HP 0 / reset 0, armour 0 / 0, shield 0. The placed root holds `plank_actionN` and the prototype
`wood_planks`, whose `good_parts/di_good` owns four polygons whose normals stand within 6-12 degrees of the vertical:
the planks are boards one stands on, not a wall. `whats_left` owns no collision (research 175 §5.4: "no remains
collision"). `plank_actionN` is the type-less record (8) on valve `set_plankN`, animation `destroy_plankN`, range 32,
elevation -1, points 0.

### 2.2 The trigger

A round or a blast reaching a plank calls the destructible's hit (`FUN_00273a50`). Its damage step `FUN_003c7490`
compares the shield (its first argument, the record's `+0x10`) with the round's rating plus the weapon's modifier and
qualifies at or above it (D:L318622); qualified, the health falls by the damage, floored at 0 (D:L318634-318638);
refused, nothing changes. `FUN_00273a50` calls that step (D:L120978) and then reads the health (D:L120980) **whatever
the step did**: at or below 0, the death runs -- with no test of the health before the hit (research 174 §3, 175 §6) and
none of the shield's verdict. So the deciding fact is the health, not the shield: a block at HP 0 dies on the first hit
that reaches it, even one its shield refuses. (A plank's shield is 0, so on MP71 the shield passes every rating anyway.)
**The port differs there**: `SceneHealth.apply` returns "not applied, not died" when the shield refuses
(`!(d.shield <= base)`), before the death check -- the same on MP71's planks (shield 0), different for an HP-0 block with
a shield above 0 on another map: LATER 776. A blast reaches a plank as it reaches any destructible; pinned, an M67 thrown
at `access_action3`'s node breaks `plankaccess1` 83 u off -- **the port's reach, not a reading of the original's**: which
destructibles a blast asks is `SCENE_BLAST_REACH_PLACEHOLDER` (viewer `sceneHealth.ts`: the nearest point of the target's
box inside the radius, then the line to its midpoint -- the original's struck-object list is unread) and the line is
two-sided (`BLAST_REACH_LINE_SIDES_READING`).
The death runs the plank's own sequence, `EXECUTE_ACTION set_plankN`, once: `FUN_00273a50` starts it with entries of
types 2, 6 and 5 (D:L121004-121059), and the record is spent.

### 2.3 The authority guard (the flag's bit 3)

Flags 0x2b carry bit 3. `FUN_00273a50`'s branch at D:L120981-120987: with the animation's flag bit 3 set and the round's
`+4` bit 2 clear, the death does **not** run (a record whose health was above 0 is held at 0.01). Bit 2 is
`!controller virtual +0x34` (D:L479365-479374, D:L474038-474046; research 174 §3): the round is the local console's
own. So in the original a plank breaks on the console whose player's round (or charge) reached it, and on no other
console from its copy of that round -- an HP-0 block has no health to hold, it simply does not die there. How the other
consoles then learn of it is not read: the plank's flags have no bit 4 (no type-8 broadcast, `FUN_002734b0`
D:L120782-120797, research 376 §3), and `FUN_002b44e0`'s use log (`FUN_002bb5b0`, D:L156845-156854, read
2026-11-08) is sent only for a record with `+0x3f` bit 0 and an actor -- whether the `EXECUTE_ACTION` tick passes one is
unread. The port's room is the one authority for every scene death and tells it to every page
(`SCENE_DEATH_AUTHORITY_READING`, `false`: the guard is never applied; `SCENE_DEATH_ON_WIRE_READING`), so any round
the room accepts breaks the plank for everyone. This is the first offered map with a placed bit-3 HP-0 block; the
cross-reference row in §10 names it under its owner, research 209.

### 2.4 The death's program

`destroy_plankN` (flags 0x22, root `plankaccessN`; references `good_parts`, `di_good`, `whats_left`, `bad_parts`, the
loop variable, `part1..7`, each search 1 under the root):

1. Sequence 1, under `IF` the context valve is 0: `CALL_SEQUENCE access_destroy`, then the context valve := 1 -- once a
   round (`FUN_002b5510` clears the valves at the reset, D:L151991).
2. `access_destroy`: `good_parts` off, `di_good` off, `whats_left` on; then under `IF skip_effects == 0`: `bad_parts`
   on, `FOR_CHILDREN` of `bad_parts` (variable 6) -> `OBJECT_MAKE_WORLDCHILD` of the child -> `CALL_ANIMATION
   plank_part_fly` with the child as its caller (flag 4) -> `END_FOR_CHILDREN`; `SOUND .WOOD_DEBRIS` at the root (-7).
3. `plank_part_fly` (flags 0xa2): an `OBJECT_MOTION` of -6 (flags 723: a random launch -- azimuth 90 +/- 100, zenith 45
   +/- 45, speed 50 +/- 30 -- gravity 1, bounce 0.3, tumble 0.26 rad/s, lifetime 8 s); beside it: wait 2 s, opacity
   1 -> 0 over 2 s, -6 off, opacity back to 1. So each part flies, fades from 2 s and is gone at 4 s.

The barriers' `destroy_accessN` is the same program on `access_part_fly` (speed 100 +/- 80; the rest alike).

**The port.** The room's world runs the death with `skip_effects` 1 (`ROOM_SKIP_EFFECTS_READING`): the three node
changes, on the wire (`EnvWire`); no sound, `bad_parts` stays off. A page's own run (offline) and a page's presentation
of a told death (V13-3c, research 386 §3.5) run with `skip_effects` 0: `.WOOD_DEBRIS` at the root, `bad_parts` on --
but the `FOR_CHILDREN` loop is skipped (`effectRunner.ts`, research 213 §2.3, H99), so the seven parts are drawn at rest
under the plank's place and never fly, fade or go until the round's reset. That is H99's gap on this map (§8).

### 2.5 Not a C4 target

`FUN_002739b0` accepts a charge only on a record whose health is above 0 and whose shield is at most the charge's
damage (research 174 §3, read from its recompiled body against the ELF's words at 0x2739b0-0x2739f0; the export holds
no `FUN_002739b0` header). A plank's health is 0: never a C4 target, before or after its death. The port: `accepts`,
`c4TargetAt` -> null (pinned).

### 2.6 No points

`plank_actionN`'s record holds 0 points, so the room's `actionDied` scores nothing (`FUN_00545530` adds the record's
points; `actionPoints`); pinned.

## 3. The barriers (F4)

Vigilance's class (research 210 §8, SUP-03; research 176 §7) on MP71's own data: `access1..3`, flags 0x2b, 1 / 17 / 0 on
`good_parts/di_good` under the placed prototype (`access_fencegate`, `access_point`, `access_frontgate` -- not the root
itself, as Vigilance's `accessN=accessN`); their sequence `EXECUTE_ACTION set_accessN`; `access_actionN` type 8, points
2; `destroy_accessN` as §2.4 with `access_part_fly`. From `access_actionN`'s node a unit up (the spot of
`accessBarriers.test.ts`'s AD-5 block) C4 (18, 50 u) and an RPG round (20, 150 u) open each; an M67 (10) does not reach
the shield. The witness segment through each `di_good`'s first polygon (8 u either side along its normal) meets two
polygons intact and none open. The remains: `whats_left` owns 14 polygons on `access1` and `access3` and none on
`access2` (research 175 §5.4); none of them crosses the witness segments. `access_actionN`'s 2 points are scored once a
round to the charge's owner (`actionDied`, `markUsed`; `ACTION_POINTS_ACTOR_READING`). The flag's bit 3 is the
planks' guard (§2.3) on a record with health 1: on another console the barrier would be held at 0.01 -- the room
decides (`SCENE_DEATH_AUTHORITY_READING`).

## 4. The doors and the reach's height term (F5)

Six `DOOR` records (§1), each one node, its `door_slab` five polygons, range 30 and **elevation -1**. The action pick
`FUN_005aa240` (D:L463830-463905; research 92 "The pick") takes the node under the reticle -- the first polygon of the
crosshair's ray (`FUN_0031e160`) -- or a parent of it naming an action; refuses a valve of 99 or a type-8 record
(D:L463872); then measures from the reticle's point to the SEAL: the ground-plane distance squared under `range`
squared (D:L463895-463896), and **only when `elevation` (`+0x20`) is not -1**, the height difference squared under its
square (D:L463897-463898). So on Fish Hook the reach has no height term: `FUN_002b46f0`, which the plan asked about,
tests no position at all (an animation of the door running, the record's bits, the valve not 99: D:L156872-156887).
What keeps `door_ft_2` (its floor y 179) and `door_ft_5` (one floor up, y 222, 23 u off on the ground) apart is the
pick's ray: from either side of `door_ft_2` the ray toward `door_ft_5`'s leaf meets the floor between first
(`worldmodel/h7wc2/door_frame01`, `int71_1`), and from `door_ft_5`'s floor the ray down meets `roof71_1` -- or, from its
far side, `door_ft_5`'s own leaf. The port's page (`pickDoor`) does the same and is pinned so; no height term is added
to `doors.ts` (none is read).

Two differences, named (§10): (1) the port's room cannot see the reticle; its own check (`doorInReach`: the feet to the
leaf, range plus 8, the elevation term when the record has one) is an adaptation with no original, and on these
records it is the ground plane alone, so a packet for `door_ft_5` from `door_ft_2`'s floor passes it --
`DOOR_ROOM_FLOOR_READING` (*note only*). This is a gap in the port's own adaptation, not an unknown of the original:
only a forged packet meets it, since the page never picks across the floor; closing it is product-track hardening. (2) The
original measures from the SEAL's place plus its firepoint offset (`+0x1c` + `+0x14b0`, or `DAT_003f64c0` when that
is zero; `FUN_00309240` adds them, D:L463874-463881), not from the feet; research 92 says "the SEAL's place".
On an elevation -1 record only the offset's ground-plane part counts -- `DOOR_REACH_ORIGIN_READING` (*note only*).

The swing (research 92 §2): `singleDoor_left` / `_right` -- `ai::MOVE`, `ai::ANIMATE` 63 (pre 0, post 0.65 s), the
valve, `ai::EVENT`, the sound (`.DOOR_WOOD_OPEN` / `.DOOR_WOOD_CLS` at -6), a one-second rotation slerp to
(0, +/-0.9962, 0, 0.0872) -- the common path, pinned on MP71 from two seats (one opens, the other shuts, each door) and
through the round's reset (every valve 0, every leaf back where it stood).

## 5. The panes (F6)

Frostfire's class (research 210 §6, SUP-02): `wframe` carries the same flags as Frostfire's `door_slab` (0x823; bit 3
clear, so no guard) and a 1 / 0 / 0 block on its own `wglass` (health reference 2), two polygons a pane; its sequence
`CALL_ANIMATION breakapane`; `breakapane` (flags 0x22, root `wglass`): `SOUND .GLS_BRK_MD` at -7 (flags 0x82, volume
1), `DESTRUCTION_SOURCE` at -7, `OBJECT_ACTIVE_STATE` -7 off -- research 386 §2's window sequence with the medium glass
sound. The four placements, their boxes' centres (`SCENE_SOUND_PLACE_READING`): (2497.076, 198, 599.265),
(2190, 198, 839.265), (2130, 241, 839.265), (2159.265, 198, 630) -- each pane 0.08 u thick, research 175 §5.4's places
offset by the frame. One round (2.3 + 0.3) breaks one pane: its sound once at its box centre, its two polygons out of a
witness segment, the other three standing (`SCENE_INSTANCE_SCOPE_READING`: the called `breakapane` runs at its caller's
root). While it stands a pane is a C4 target (health 1, shield 0); broken, not. Flag bit 11 (0x800) is on both maps'
pane blocks and its meaning is not read (`ANIM_FLAG_0X800_READING`, *note only*).

## 6. A joiner's snapshot (F7)

Research 175 §5.4's last acceptance line: "Late join must reproduce doors, glass, access state and NPC state together."
In the port a late joiner takes (pinned on MP71, one room): the welcome's `env` -- the world's node states, applied
silently (`applyWire(env, true)`: no sound, no debris; the original's joiner replays with `skip_effects` 1, research 386
§6) -- so a broken pane is off and the other three on, a blown `access2` has `good_parts` off, `whats_left` on and
`bad_parts` off; the welcome's `hostages` -- `Hostage`, `Hostage2`, `Hostage3` (`mp_algerian_h1..3`) as bodies 240-242
at (2114.579, 179.776, 761.809), (2124.579, 179.776, 791.809), (2094.579, 179.776, 781.809), alive and unled; and the
first snapshot's `doors` (`door_ft_2` open at rest, the five others shut) and bodies 240-242. A joiner does not see a
told death's motion (LATER 766): on this map nothing moves at a death but the parts the loop would fly (§2.4), which
the port does not fly anyway.

## 7. r0004's `b1`

r0004 switches off MP71's `worldmodel/b1` (0x2d4f14; research 383 §4 and its table): its two `barrel_green_closed`
placements, four collision owners, off from the opening state through every reset, never drawn (LATER 707). The
port carries it (`collisionOwners` `switchedOff`; `r0004WorldState.test.ts`); the plank pin checks the four owners
are marked.

## 8. The placeholders this map inherits, under their owners

- **H99 / research 213 §2.3 -- the `FOR_CHILDREN` debris flight** (PF.R26): `FOR_CHILDREN` and
  `OBJECT_MAKE_WORLDCHILD` are decoded but not run (`effectRunner.ts` skips the loop), so on a page the barriers' and
  the planks' seven parts are drawn at rest once `bad_parts` turns on, and stay until the reset; the original flies,
  fades and turns them off within 4 s (§2.4). Settled by running the loop on the page's presentation run (the part's
  own `plank_part_fly` turns it off at 4 s, so `SCENE_NODE_MOTION_PLACEHOLDER`'s fade would not be needed for it) and
  a capture of a plank and a barrier broken (H431).
- **`SCENE_NODE_MOTION_PLACEHOLDER`** (research 386 §8): the parts' `OBJECT_MOTION`, should the loop run.
- **`GLASS_FRAGMENTS_PLACEHOLDER`** (research 210 §6): the panes' `DESTRUCTION_SOURCE` draws nothing.
- **LATER 766**: a joiner and a seek do not run a told death's motion.
- **`SCENE_DEATH_AUTHORITY_READING`** (research 209): the guard of §2.3 never applied; the room decides.
- **`SCENE_DEATH_ON_WIRE_READING`** (research 210 §6): the death on the wire, told and inferred.
- **`SCENE_BLAST_REACH_PLACEHOLDER`** (research 209 §14, 210, 235): which destructibles a blast asks -- the port's
  nearest-point-in-radius stand-in for the original's struck-object list (unread); the barriers' and the planks' reach,
  and the M67-at-`access3` plank break (§2.2), rest on it.
- **`BLAST_REACH_LINE_SIDES_READING`** (research 386 §8): the blast's line to a destructible held two-sided; the
  barriers' and the planks' reach is measured on it.
- **LATER 776**: the port's death check skipped after a refused shield (§2.2).
- **LATER 782**: the boats' rock, the wash strokes and the shore's texture scroll built (§12).
- **H226 / research 330** (the water) and the boats and shore (DF-9): not this note's.

## 9. Tests

Each a dev-disc test: it reads `RUN/MP71.ZDB` through `SOCOM_DISC` (the match file also `SOCOM_PC_ROOT`'s
`game/disc`) and **skips** without it -- MP71 is no committed fixture until DF-2.

- `packages/match/test/fishHookScene.devdisc.test.ts` (new): (1) the six doors bind with their programs (range 30,
  elevation -1, five leaf polygons, each node's transform saved), the page's pick takes `door_ft_2` and `door_ft_5`
  only from their own floors, the room's check passes both from either (§4), each door opened from seat 1 and shut from
  seat 2 in the room, all six shut and back in place at the round's reset; (3) the planks: flags 0x2b, HP 0 / shield 0
  on four polygons, `plank_actionN` type 8 / points 0; each breaks on a round of rating 0 (its two witness polygons out,
  `whats_left` on, `bad_parts` off in the room, no sound), spent after; never a C4 target; no points; a page's own run
  plays `.WOOD_DEBRIS` at each root with `bad_parts` on; the reset restores each with HP 0; `b1`'s four owners switched
  off; (5) the joiner: a door open, a pane broken, `access2` blown (its +2 scored once) and the three hostages in one
  late joiner's welcome and first snapshot.
- `packages/viewer/test/accessBarriers.test.ts`, its MP71 block (2): the three bind (1/17 on `di_good`, 2/7/4
  polygons), `access4..6` unplaced diagnostics, `access_actionN` type 8 / points 2, every barrier node saved; C4 and the
  RPG open each, the M67 does not (witness 2 -> 0, `whats_left` on); an M67 at `access_action3` breaks `plankaccess1`;
  once a round; a joiner silent; a page's `.WOOD_DEBRIS` once; the reset restores all four nodes and the health.
- `packages/viewer/test/panes.parity.test.ts`, its MP71 block (4): the four bind one per placement, each saved; each in
  turn broken by one round -- `.GLS_BRK_MD` and the `DESTRUCTION_SOURCE` once at its box centre, its two polygons out,
  the other three standing, spent, no longer a C4 target; a joiner silent; the reset restores all four.

Nothing here changed the port's behaviour, so no pin was red on the head as written. Each was shown to bite by a
mutation of `sceneHealth.ts`'s death check to the old-HP-positive requirement research 175 §9 asked about (an HP-0 block
never dies): the plank pin and the barrier block's plank case went red, the rest stayed green; the mutation was
reverted (the task's report holds both runs).

## 10. Readings and placeholders

| Name | Value / gap | Settled by | Status |
|---|---|---|---|
| `DOOR_ROOM_FLOOR_READING` (*note only*) | not an unknown of the original: a gap in the port's own adaptation, recorded for product-track hardening -- the room's door check (`doorInReach`; the original has no server) on an elevation -1 record is the ground plane alone, so it passes a packet for `door_ft_5` from `door_ft_2`'s floor (§4); the page's pick never offers it, as the original's ray does not | a product-track hardening if wanted (the room re-casting the pick, or a floor test), never a height term the original does not have | open, note only |
| `DOOR_REACH_ORIGIN_READING` (*note only*) | `FUN_005aa240` measures the reach from the SEAL's place plus its firepoint offset (`+0x1c` + `+0x14b0`, else `DAT_003f64c0`; D:L463874-463881), the port from the feet; on elevation -1 records only the offset's ground-plane part differs (§4) | a read of `+0x14b0`'s writer at rest and `DAT_003f64c0`'s value; research 92's "the pick" re-filed with it | open, note only |
| `ANIM_FLAG_0X800_READING` (*note only*) | the meaning of `Anim_Params` flag bit 11, set on MP71's `wframe` and Frostfire's `door_slab` (0x823) and on no other destructible read here (§5) | the readers of the flags word (`FUN_002713f0` D:L119312-119335 and the hit path) traced for bit 11 | open, note only |
| `SCENE_DEATH_AUTHORITY_READING` (cross-reference; research 209) | `false`: the guard of §2.3 (flag bit 3, the round's `+4` bit 2 clear) never applied -- on Fish Hook it decides where a plank breaks in the original (only on the shooter's console) and is unread how the others learn of it | the host/remote replay contract: two consoles, a plank shot by the remote side (H431) | open |
| `SCENE_BLAST_REACH_PLACEHOLDER` (cross-reference; research 209 §14) | `'clear-line'`: a blast asks every destructible whose target's box has its nearest point inside the radius, gated by the line to its midpoint -- the port's stand-in for the original's struck-object list; the M67 at `access_action3` breaking `plankaccess1` (§2.2) is this reach, not the original's behaviour | the original's struck-object list (the projectile's `+0x28`, `FUN_003c7ee0`) read; a capture of a grenade beside a plank (H431) | open |
| `GLASS_FRAGMENTS_PLACEHOLDER` (cross-reference; research 210 §6) | the panes' `DESTRUCTION_SOURCE` draws nothing (§5) | a decode of the command's payload; a capture of a pane shot | open |
| `SCENE_NODE_MOTION_PLACEHOLDER` (cross-reference; research 386 §8) | the parts' flight on a page (§2.4, §8) | the page-side flight of a placed node; H99's loop run first | open |

## 11. Log

- **2026-11-08T12:30Z** -- DF-8 (`agent/df-8-fh-note`, the controller's implementer; the plan is a draft in
  agent-mail, so the record is here). Read: §1-§7 at reading, pending review -- the disc through the repository's
  readers on this host's disc, the decomp at `FUN_003c7490`, `FUN_00273a50`, `FUN_005aa240`, `FUN_002b46f0`,
  `FUN_002b44e0`, `FUN_00309240`/`FUN_00309200`, `FUN_002ac0e0`; `FUN_002739b0` through research 174 §3 (not re-read:
  the export has no header for it). Built: nothing -- every class already as the reading says. Pinned: five dev-disc
  pins (doors, barriers, planks, panes, the joiner) on MP71, skipped without the disc. Named: three note-only readings
  (§10). Research 175 §9's "Before Fish Hook plank parity" row re-worded to point here. Evidence kinds: dev-disc and
  source inspection; no rendered browser run, no capture.
- **2026-11-08T16:30Z** -- the fresh review (PASS WITH FINDINGS) folded, docs only: F1 the M67-at-`access3` plank break
  said to be the port's reach (`SCENE_BLAST_REACH_PLACEHOLDER`, §2.2, §8, §10); F2 the trigger's reason re-worded -- the
  original's death check runs whatever the shield did, the port's does not (LATER 776 filed); F3 the capture is H431; F4
  `DOOR_ROOM_FLOOR_READING` said to be the port's adaptation's gap, product-track hardening.

## 12. The boats and the shore (DF-9)

- Date: 2026-11-08. Task DF-9 of `docs/plans/2026-11-08-desert-glory-fish-hook.md` (on `agent/df-plan` when this is
  written). Branch `agent/df-9-fh-boats`, cut from `agent/v0415` at `68ecb7316`, with `agent/df-8-fh-note` merged in for
  this note. Track: simulation. Status: **reading, pending review** -- nothing here is measured running (no capture of
  Fish Hook's boats or shore exists: H226, H431).
- Sources: the disc through the repository's readers on this host's disc (`SOCOM_DISC`; MP71 is no committed fixture
  until DF-2) -- `RUN/MP71.ZDB`'s `MZANIM.ZAR` set `mission` (`parseAnimSets`, `decodeEffectProgram`), its
  `MP71_GEO.ZED` scene graph (`parseSceneGraph`, `flattenScene`) and its hull (`loadSimMap`'s `ground.owners`); the code
  as `FUN_<addr>` / `D:L<line>` of `game/analysis/socom2_game.elf.decomp.c`, never pasted. Beside them: research 92 §2
  (the doors: the same command), research 330 §6-§8 (the water's draw), research 237 §0.2 (the autostarts).
- **What changed in the port:** the decoder only. `@s2u/scene` reads `SCROLL_MOTION` (command 24, until now `other`) as
  op `scroll`, and `OBJECT_MOTION_FROM_TO`'s speed profile (flags 0x800 / 0x1000) as `fromTo.profile`. Nothing runs
  either: the three motions are named placeholders (§12.4) in viewer `worldState.ts`, whose scene host now names the
  two ops in its own case and still ends each in the tick it begins, as before. H434's default (the plan): the
  placeholders named, the build owed.

### 12.1 The answers

| # | What | The original (the reading) | The port at `68ecb7316` | This task |
|---|---|---|---|---|
| B1 | The boats' rock | `boat_rocker1` / `boat_rocker2` (autostarts) wait 1 s plus a random 1 s, then loop for ever a 4 s slerp of the rocker's rotation between two absolute quaternions, 1.36 and 1.31 degrees off no turn (a 2.67 degree swing), and back | the two programs run on the page's world (AS-1), their `fromTo` ends at once and moves nothing: the boats stand still | decoded and pinned; `BOAT_ROCK_PLACEHOLDER` |
| B2 | The boats' heading | the rotation setter writes the rocker's own rotation whole, so the first begin replaces each rocker's disc yaw -- 26.86 degrees (`boat_rocker1`) and 147.03 (`boat_rocker2`) -- with the rock about no turn: both boats end up headed one way, about the world's x (§12.3) | each boat drawn and collided at its disc yaw | read; `BOAT_ROCK_PLACEHOLDER`'s first evidence to settle |
| B3 | Does the hull follow? | each rocker holds `boat_red` (identity under it) with 57 collision polygons; the doors' leaves turn by the same command and the same setter and their collision is the node's (research 92 §2), so the deck would turn with the rocker -- the transform the collision query reads is **not traced** here | the 57 polygons stand where the disc places them, in two owners per boat, `boat_red` and `boat_red=boat_red`, 57 each: `worldDi`'s documented double (`scene/src/buildScene.ts:340-356`; reCOM `zNode/node_io.cpp:46-51`; research 24 §1.1) -- the instance node keeps the prototype's `di` and the realised model root under it (`=`) holds the same, both in the world the engine holds -- so the build turns BOTH with the rocker; players stand on a still deck at the disc yaw | named inside `BOAT_ROCK_PLACEHOLDER`, with what settles it |
| B4 | The wash's motion | `washup1..6` and `water` (autostarts) stroke an empty node (`water_node*`: no visual, no collision) out along x and back, 2.75 s a stroke on a speed profile: 1, 0.5 or 0.75 u by a 0.333 `RANDOM_WEIGHT` twice (the water always 0.5) | not run; the nodes draw nothing, so nothing visible differs by it alone | decoded and pinned; `WASHUP_MOTION_PLACEHOLDER` |
| B5 | `SCROLL_MOTION` | the visuals under `water_wash*` / `water` have their texture coordinates moved by the stroke's signed travel times (-0.2, 1) or (0.3, 1) (the water (0, 1)): the wash slides up the beach and back, one texture repeat per 1 u stroke | no scroll: the washes and the water drawn still | decoded and pinned; `SCROLL_MOTION_PLACEHOLDER` |
| B6 | Another user of command 24 | the common `bullet_advance` (every map's `CZANIM`, the vehicle gun's belt): flag 1, 0.1 s, (0.2, 0) along (0, -1, 0) of `bulletmover` on `bullet_scroll` | no viewer source runs `bullet_advance` | decoded only (op `scroll` with `seconds`) |

### 12.2 The data

Read through the readers (dev-disc pins, `packages/viewer/test/fishHookMotion.devdisc.test.ts`):

| Program (flags) | Nodes | Commands |
|---|---|---|
| `boat_rocker1`, `boat_rocker2` (0x821) | `NA`, `boat_rockerN` | sequence 0: `WAIT` 1 s, range 1 (flags 0x29), `CALL_SEQUENCE` 2; sequence 1: `WHILE` for ever, `OBJECT_MOTION_FROM_TO` on -7 (the root), flags 0x60, 56 bytes, 4 s, from (0.00606, -0.00876, 0.00529, 0.99993) to (-0.00528, 0.00870, -0.00519, 0.99993), then the same back, `END_WHILE` |
| `washup1`, `washup3`, `washup5` (0x21) | `NA`, `water_wash` / `water_wash2` / `water_wash4`, `water_node` / `water_node3` / `water_node5` | sequence 0: `SCROLL_MOTION` node 1, mover 2, flags 0, axis (-1, 0, 0), uv (-0.2, 1); sequence 1: `WAIT` 0.07 / 0.07 / 1.07 s, `WHILE` for ever: `IF` random 0.333 a 1 u stroke out and back, `ELSEIF` random 0.333 a 0.5 u one, `ELSE` a 0.75 u one |
| `washup2`, `washup4`, `washup6` (0x21) | `NA`, `water_wash1` / `water_wash3` / `water_wash5`, `water_node2` / `water_node4` / `water_node6` | the same with uv (0.3, 1); `washup6` waits 1 s first, the other two not at all |
| `water` (0x21) | `NA`, `water`, `water_node1` | `SCROLL_MOTION` uv (0, 1); `WHILE` for ever a 0.5 u stroke out and back; `WAIT` 2 s after the loop (never reached) |

Each stroke: `OBJECT_MOTION_FROM_TO` on node 2, flags 0x180a, 156 bytes, 2.75 s; its position block at +0x70 (the start
given, flag 2: (0, 0, 0) to (d, 0, 0), or back), its profile at +0x38: speeds (0, d/2, 0), acceleration d/2, deceleration
-d, times (1, 1.25, 0.5) -- which cover the stroke's distance d in its 2.75 s (pinned for every stroke). The scene graph:
`boat_rocker1` at (1208.713, 50.762, 1636.356), yaw 26.86 degrees; `boat_rocker2` at (1091.984, 50.762, 1530.136), yaw
147.03; each `boat_rockerN/boat_red` identity. The water nodes and the washes are all identity children of
`worldmodel`: siblings, so a stroke moves nothing drawn; `water_node*` carries no visual and no collision, `water_wash*`
and `water` draw (`water_washup.tif`, research 330 §6) and carry no collision.

Flag bit 11 of the boats' programs (0x800) starts them through `FUN_00271250` (the set's first start, `FUN_0026c600`
D:L116360-116362) rather than `FUN_002713f0` (D:L116370): it walks the scene graph and starts a copy on every node
named as the animation's root (`FUN_00271110` D:L119222ff, the name compare `FUN_00198f18` at D:L119234). MP71 holds
one node of each rocker's name, so one run each, as the port's AS-1 start.

### 12.3 What the commands do

- **The rotation** (`OBJECT_MOTION_FROM_TO`, flag 0x40; research 92 §2): the begin `FUN_0025fe70`, with flag 0x20 and
  flag 1 clear, sets the node's rotation to the quaternion at +0x10 (D:L109293-109297, `FUN_00315790`); the tick
  `FUN_0025f9b0` slerps from +0x10 to +0x20 by the elapsed time over +0x34 (`FUN_00306ae0`, D:L109016-109017) and at
  its end sets +0x20 (D:L108955); the command lasts its +0x34 (D:L108911). `FUN_00315790` hands the quaternion to
  `FUN_00307170` (D:L206170ff), which writes a pure rotation into the node's own 3x3 -- the rotation the node had (the
  disc's yaw) is not kept -- and marks the node changed (+0xa1 bit 1). The node's translation is untouched. So B1 and
  B2.
- **The speed profile** (flags 0x800 / 0x1000): the begin takes the block at the u16 +0x0e (D:L109097-109098), sets
  the phase to the first of the three times above 0, the speed to the start speed and the unit direction from start to
  target (D:L109263-109289); recomputes the times from the distance (`FUN_00260910`, called at D:L109259) only when it
  took the start or the target from a node -- not on MP71 (flag 2 given, the block's first byte 0). The tick moves the
  node by `FUN_002606f0` (D:L108997; D:L109348-109434): phase 1 adds the acceleration to the speed for its time, phase
  2 holds the cruise speed for its time, phase 3 adds the deceleration until the command's time is up, the node moved by
  the speed along the direction; at the end the target is set unless flag 0x2000 (D:L108958-108972).
- **`SCROLL_MOTION`** (command 24: `FUN_0025bc20`'s 24th registration, D:L106888, begin `0x260fb0`, tick `0x260b40`):
  the begin `FUN_00260fb0` (D:L109681-109703) stores the mover's (+7) world place at +8 and registers every visual at and
  under the node (+6) in the texture-scroll table at 0x4b50d0 (`FUN_003134c0` D:L213767ff, recursing into the
  children), resetting its offset (`FUN_003c0340`). Each tick `FUN_00260b40` (D:L109507-109676) takes the mover's
  world place again; the travel since the last tick, its length signed by the axis at +0x14 carried through the
  mover's matrix (the x and z of the dot, D:L109635-109655), times (+0x38, +0x3c) is handed to `FUN_003c0280`
  (D:L109659), which moves each registered visual's vertex texture coordinates by it (`FUN_003bfee0` D:L313770ff, in
  1/4096ths of a repeat, the fraction carried). Flag 8 measures the travel projected through the node's matrix instead
  (the point at +0x20, the axis at +0x2c with flag 0x10, else up; D:L109576-109631); flags 2 and 4 pick the table's
  walk (unread); flag 1 ends it after +0x44 s (D:L109663-109674), else it runs until its animation stops. On MP71 the
  mover moves along its x and the axis is its -x, so a stroke out moves v by -d (and u by 0.2 d or -0.3 d) and the
  stroke back undoes it.

### 12.4 Placeholders and readings

| Name | Value / gap | Settled by | Status |
|---|---|---|---|
| `BOAT_ROCK_PLACEHOLDER` | `'still'` (viewer `worldState.ts`): a scene program's `OBJECT_MOTION_FROM_TO` rotation on a placed node is not run -- Fish Hook's two boats drawn and collided at their disc yaws (26.86, 147.03 degrees), still, where the original (B1-B3) replaces the yaw with a 4 s rock about no turn and, by the doors' structure, turns the 57 deck polygons with it; the command ends at once (the loop spins to the effect runner's guard each tick) | a capture of both boats from the shore over 8 s (their headings and the rock) and a stand on a boat in PCSX2 (whether the body rides the tilt) -- H431's shape, filed by the controller; the collision query's polygon transform read (what reads the node's +0xa1 change); then a `fromTo` case in the world's host, the node's rotation drawn (the world's drawing has no per-node transform today) and the owners turned in the hull as `DoorSet` turns a leaf | open |
| `WASHUP_MOTION_PLACEHOLDER` | `'still'` (viewer `worldState.ts`): a scene program's `OBJECT_MOTION_FROM_TO` translation (the rate form or the speed profile) on a placed node is not run -- the seven `water_node*` stand; nothing drawn moves by it alone (B4) | the motion run on the page's world (the node's place only), with `SCROLL_MOTION_PLACEHOLDER`; a capture of the shore (H226) | open |
| `SCROLL_MOTION_PLACEHOLDER` | `'none'` (viewer `worldState.ts`): `SCROLL_MOTION` draws no scroll -- the six washes and the water drawn still (B5) | a texture offset per visual on the page's world (the material system holds none for a scene program today), driven by the washup motion; a capture of the shore (H226) | open |

### 12.5 Tests

- `packages/scene/test/scrollMotion.test.ts` (unit): command 24's fields, its timed form (the common `bullet_advance`'s
  shape) and its projected form; the profile under 0x800, 0x1000 and both, none without them; a 0 offset read at the command itself (the original takes the block unconditionally, D:L109097-109098).
- `packages/viewer/test/fishHookMotion.devdisc.test.ts` (dev-disc; **skips** without `SOCOM_DISC` / `SOCOM_PC_ROOT`):
  the boats' programs (B1), the rockers' yaws and the 57-polygon owners (B2, B3), the seven shore programs with every
  stroke's profile covering its distance (B4, B5), and the port today -- the nine programs running on a page's world
  after 10 s, no hull polygon moved, the three placeholders' values.

### 12.6 Log

- **2026-11-08** -- DF-9 (`agent/df-9-fh-boats`). Read: §12.1-§12.3 at reading, pending review (the disc through the
  readers on this host's disc; the decomp at `FUN_0025fe70`, `FUN_0025f9b0`, `FUN_002606f0`, `FUN_00260910`,
  `FUN_00260fb0`, `FUN_00260b40`, `FUN_003134c0`, `FUN_003c0280` / `FUN_003bfee0`, `FUN_00315790` / `FUN_00307170`,
  `FUN_00271250` / `FUN_00271110`). Built: the decoder's `scroll` op and `fromTo.profile` (no behaviour). Named: three
  placeholders (§12.4; research 101's DF-9 rows). Not built: the rock, the wash and the scroll (H434's default; the
  build is owed: LATER 782). Evidence kinds: unit, dev-disc, source inspection; no rendered
  browser run, no capture.
