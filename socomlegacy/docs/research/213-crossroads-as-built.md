# 213 -- Crossroads as built (web sprint 27: XR-01, XR-04, XR-08)

- Date: 2026-10-05 (web sprint 27, "Crossroads"). XR-01 wrote sections 1-3 and 6: the measured baseline, the static
  pre-reads the sprint's later tasks build on, and the owner's capture script for session B (H94). Sections 4 and 5 are
  XR-04's and XR-08's.
- Status: **reading, pending review.** Every value below is a read of the disc's bytes (the MP72 fixture,
  `test-fixtures/RUN/MP72.ZDB` and `READERC.ZAR`) or of the decompilation (`D:L<n>` of `socom2_game.elf.decomp.c`);
  section 1 is measured by the repository's probe. Nothing here is a capture of the original.
- Sources: research [171](171-crossroads-demolition-and-bridges.md) s3-s10 (the bridges, the bomb, the script, the
  gates), [173](173-demolition-map-audit.md) s2-s3 and s10, [192](192-m1-mp-modes-rules.md) s2.1 and s3.1,
  [206](206-verification-overrides-and-the-waves-close.md) s1 (no override touches Crossroads),
  [209](209-the-mutable-world.md) s8-s14 and [210](210-modes-panes-barriers-and-the-c4-gates.md) (the mutable world
  and `skip_effects` as built in sprint 26). Reproduce from `socomlegacy/`:
  `npx tsx tools/dump-effects.ts MP72 seal_demo_site1 terrorist_demo_site1 seal_callstrike1 base_explosion1 destroy_seal_base --mission`
  and `npx tsx tools/probe-crossroads.ts`.

## 1. The measured baseline

`npx tsx tools/probe-crossroads.ts` on the MP72 fixture, 2026-10-05, unchanged from research 171 s5 (the source path
written relative):

```json
{"source":"test-fixtures/RUN/MP72.ZDB","kind":"bridge geometry probe","switches":2}
{"switch":"seal_callstrike_1","valve":"seal_strike1","animation":"seal_demo_site1","range":30,"elevation":"default -1","points":2,"bitmap":"action_pull_lever.tif","triggerAt":[1094.486,100.268,1831.161],"bridgeRoot":"worldmodel/seal_demo_1","bridgeAt":[879.408,62.9,1489.049],"states":[{"name":"destroyed","path":"worldmodel/seal_demo_1/arch=arch/destroyed","word":"0x90080900","initiallyInactive":true,"saveActive":true,"polygons":170},{"name":"parts","path":"worldmodel/seal_demo_1/arch=arch/parts","word":"0x90080a00","initiallyInactive":true,"saveActive":true,"polygons":0},{"name":"healthy","path":"worldmodel/seal_demo_1/arch=arch/healthy","word":"0x10080b00","initiallyInactive":false,"saveActive":true,"polygons":54}]}
{"switch":"terrorist_callstrike_1","valve":"terrorist_strike1","animation":"terrorist_demo_site1","range":30,"elevation":"default -1","points":2,"bitmap":"action_pull_lever.tif","triggerAt":[1298.432,99.25,1174.333],"bridgeRoot":"worldmodel/terrorist_demo_1","bridgeAt":[1682.044,62.899,1404.012],"states":[{"name":"destroyed","path":"worldmodel/terrorist_demo_1/arch=arch/destroyed","word":"0x90080900","initiallyInactive":true,"saveActive":true,"polygons":170},{"name":"parts","path":"worldmodel/terrorist_demo_1/arch=arch/parts","word":"0x90080a00","initiallyInactive":true,"saveActive":true,"polygons":0},{"name":"healthy","path":"worldmodel/terrorist_demo_1/arch=arch/healthy","word":"0x10080b00","initiallyInactive":false,"saveActive":true,"polygons":54}]}
{"bridge":"worldmodel/seal_demo_1","from":[812.408,54,1488.049],"to":[932.408,54,1488.049],"results":[{"state":"intact","hits":[]},{"state":"destroyed","hits":[{"point":[851.434,54,1488.049],"path":"worldmodel/seal_demo_1/arch=arch/destroyed"},{"point":[855.143,54,1488.049],"path":"worldmodel/seal_demo_1/arch=arch/destroyed/dia"},{"point":[895.143,54,1488.049],"path":"worldmodel/seal_demo_1/arch=arch/destroyed"},{"point":[895.143,54,1488.049],"path":"worldmodel/seal_demo_1/arch=arch/destroyed/dia"}]}]}
{"bridge":"worldmodel/terrorist_demo_1","from":[1615.044,54,1403.012],"to":[1735.044,54,1403.012],"results":[{"state":"intact","hits":[]},{"state":"destroyed","hits":[{"point":[1654.069,54,1403.012],"path":"worldmodel/terrorist_demo_1/arch=arch/destroyed"},{"point":[1657.778,54,1403.012],"path":"worldmodel/terrorist_demo_1/arch=arch/destroyed/dia"},{"point":[1697.778,54,1403.012],"path":"worldmodel/terrorist_demo_1/arch=arch/destroyed"},{"point":[1697.778,54,1403.012],"path":"worldmodel/terrorist_demo_1/arch=arch/destroyed/dia"}]}]}
```

Read: two SWITCH records (range 30, elevation absent so -1, points 2, `action_pull_lever.tif`); each arch's
`destroyed` (170 collision polygons), `parts` (0) and `healthy` (54) with the reference words of research 171 s4
(`destroyed`/`parts` initially inactive, all three saving their active state); the street segment at y 54 meets
nothing under an intact arch and the rubble 4 times under a destroyed one, first at x 851.434 (`seal_demo_1`) and
1654.069 (`terrorist_demo_1`). Registry: `world.crossroads.street-rubble`.

## 2. The pre-reads

### 2.1 The bridges' programs and `skip_effects` (decides PF.R29)

**Not guarded.** Neither `seal_demo_site1` nor `terrorist_demo_site1` holds an `IF`, `ELSEIF`, `ELSE`, `ENDIF` or
`WHILE` anywhere; `parts` on (offset 248) and the per-part loop (284-332) run on every run of the program, heard or
silent. No animation of MP72's `MZANIM.ZAR` (77 of them) has `skip_effects` in its name table at all. Test:
`packages/scene/test/effects.parity.test.ts` "the parts' activation and flyparts do not sit under IF skip_effects ==
0: neither *_demo_site1 holds an IF, and no MP72 mission program names skip_effects" (registry
`world.crossroads.bridge-debris-unguarded`).

Each program has two sequences, both `_zsequence` word 0x102 (activation 1: both start at the call and run side by
side). The offsets are the program's `Seq_Data` offsets (research 171 s4's):

| Offset | Sequence | Command | What it does |
|---|---|---|---|
| 28 | 1 (@0) | `FIRE_WEAPON` 44 B | MPBOMB / MPBOMB Ammo at ref 2 `damage_point2`, 0.001 / 0.01 (s2.2) |
| 72 | 1 | `WAIT` 0.1 s | |
| 84 | 1 | `FIRE_WEAPON` 44 B | the same at ref 3 `damage_point` |
| 156 | 2 (@128) | `CALL_ANIMATION` 32 B, T | `fire_explode_med`, ref 3 `damage_point` in its payload, the f32 30 at +0x18 (research 171 s4: 30 up) |
| 188 | 2 | `CALL_ANIMATION` 32 B, T | `fire_explode_med`, ref 3 in its payload |
| 220 | 2 | `CALL_ANIMATION` 20 B, T | `dust_explode_long`, ref 3 in its payload |
| 240 / 248 / 256 | 2 | `OBJECT_ACTIVE_STATE` 8 B, T | `destroyed` on, `parts` on, `healthy` off |
| 264 | 2 | `CALL_ANIMATION` 20 B, T | `seal_callstrike1` / `terrorist_callstrike1`: hides the switch node (its one command) |
| 284 | 2 | `FOR_CHILDREN` 12 B, T | over ref 5 `parts`, binding each child to ref 7 (`NA`, the loop variable) |
| 296 | 2 | `OBJECT_MAKE_WORLDCHILD` 8 B, T | ref 7 reparented to the world, its world transform kept |
| 304 | 2 | `OBJECT_ACTIVE_STATE` 8 B, T | ref 7 on |
| 312 | 2 | `CALL_ANIMATION` 20 B, T | `flyparts` with ref 7 as its context |
| 332 | 2 | `END_FOR_CHILDREN` 8 B, T | back to 284 |
| 340-516 | 2 | `SOUND` x5, `WAIT` x4 | `.EXP_1`, 0.15, `.EXP_1`, 0.5, `.EXP_DISTANT`, 0.7, `.EXP_DISTANT`, 0.9, `.EXP_DISTANT` |

Every command from 156 to 340 is timeless (T): the swap, the switch's hide and the debris's launch land on the call's
first tick, with the first `FIRE_WEAPON`; the second follows 0.1 s later; the sounds land at 0, 0.15, 0.65, 1.35 and
2.25 s (each at ref 3 `damage_point`, the i8 at +16; flags 0x82). Test: "seal_demo_site1 / terrorist_demo_site1: destroyed on, parts on, healthy off
at 240/248/256; the two .EXP_1 and three .EXP_DISTANT follow waits 0.15/0.5/0.7/0.9" (registry
`world.crossroads.bridge-timeline`).

So PF.R29's condition holds: a silent run (the room's, `ROOM_SKIP_EFFECTS_READING`; a joiner's, `JOIN_SILENT_READING`)
turns `parts` and every `part_1..15` on exactly as a heard one does, and the debris's state changes are not separable
by the guard the access barriers use (research 210 s8). By the end of a full run, `parts` is on and each part is off
again (`flyparts` turns its context off at about 4 s, s2.3), reparented to the world. Two facts for XR-04: the
decoder still reads `FOR_CHILDREN`, `OBJECT_MAKE_WORLDCHILD` and `END_FOR_CHILDREN` as `other`. A runner that falls
through them runs the loop's body once, on ref 7, which is unbound outside the loop.

The bases follow the same pattern. `destroy_seal_base` and `destroy_terrorist_base` hold no `IF` or `WHILE` either:
after `WAIT 0.15` they turn `healthy` off and `whats_left` and `parts` on, then after `WAIT 0.1` they run the same
`FOR_CHILDREN` loop over `parts` with `flybaseparts`. They differ in one place, which XR-08 inherits:
`destroy_terrorist_base` opens with its own `FIRE_WEAPON` (offset 28, MPBOMB / MPBOMB Ammo, node byte 3 = ref 3
`healthy`, 0.001 / 0.01), and `destroy_seal_base` has none.

### 2.2 `FIRE_WEAPON` (set 0 command 57): the layout and what the two floats are

The 57th registration of `FUN_0025bc20` (D:L106921) is `FUN_0025ccb0` (D:L107153-107326), no begin and no tick. The
command's 44 bytes:

| Offset | Field | Read at | Crossroads' values |
|---|---|---|---|
| +0 | header: command 0x39, set 0, size 44 (`<< 18`) | | `39 00 b0 00` |
| +4 | u8 flags: bit 0 adds the vector at +0x14 to the start; bit 1 starts at the context's type-5 node (`FUN_00272720(ctx, 5)`) | D:L107206-107228 | 0 |
| +5 | u8 the ammunition's name index (`FUN_003c4f70(0x4b5310, ...)`) | D:L107199 | `MPBOMB Ammo` |
| +6 | u8 the weapon's name index (`FUN_003c4c40(0x4b5210, ...)`) | D:L107197 | `MPBOMB` |
| +8 | i8 the start node (0 none; `FUN_0026f4e0`, its world position by `FUN_00310980`), written to the round's +0x3c/+0x48/+0x54 | D:L107229-107244 | bridges 2 `damage_point2`, 3 `damage_point`; `base_explosion1` 0xfa = -6, `NODE_CALLER` |
| +9 | i8 the direction's node: 0 takes the vector at +0x20 as it is, else transforms it by that node (`FUN_00269170`) | D:L107266-107281 | 0 |
| +10 | u8 bit 0: `FUN_003c82f0(round, 1)` after the fire | D:L107318 | 0 |
| +0xc | f32 written over the round's +0x8c unless -1 | D:L107312-107313 | 0.001 |
| +0x10 | f32 written over the round's +0x90 unless -1 | D:L107315-107316 | 0.01 |
| +0x14 | vec3 the start's offset (flag bit 0) | | (0, 0, 0) |
| +0x20 | vec3 the direction | | (-0, 0, -1) |

The round is made by `FUN_003cbdf0(DAT_004b5220, weapon, ammo)` (D:L107202) and fired through the weapon's vtable
+0xc with the start, the direction and an owner: `FUN_002b3580()`'s, replaced by the context's type-9 entry when it
resolves (through `FUN_0029e4e0(0x4362e0, ...)`) to one whose +0x10 is 2 (D:L107285-107300). Whether a switch's
presser is that context is not traced. *(Since read, 2026-11-14: it is -- LATER 1038's re-read, below.)*

**A switch's blast, measured on the original running (proven for the kill feed's line; 2026-11-14).** Q14 (the capture rig on the original running, r0004, Crossroads MP72, two clients, 2026-11-14; its files `gate-runner/shadow/out/2026-11-14/q10-hitreg/q14-bridge-b/`, uploaded to the private bucket 2026-11-14, 32 files: the pictures, `times.txt` and `setup.log` stand; its mp4s are frozen stills, `FROZEN.txt` beside them):
the SEAL `<the presser>` used `seal_callstrike_1` ("FLIP SWITCH", Cross once, under the reticle, 10:36:50.698Z) while
the Terrorist `<the victim>` stood under `seal_demo_1`'s arch (879.4, 42.5, 1489.0). Read: `<the victim>` at full
health at +0.165 s, all six parts 0 by +1.13 s, posture 8 (dead) by +2.36 s; `<the presser>` unhurt; on both consoles
the kill feed's line "`<the presser>` fragged `<the victim>` with MPBOMB" (the "%s fragged %s with %s" form, research
91 §10), then "ALL TERRORISTS ELIMINATED" / "SEALS VICTORIOUS!"; `<the victim>`'s screen "You have died." Not read:
the score and the suicide and team-kill counters (no address cited for them), which console's round did the damage,
and the round's owner word itself (`+0xac`); one switch, one map, one victim. **This contradicts the code reading**
the port runs (`SCENE_ROUND_OWNER_READING` `'victim'`, research 386 §8: the switch's round each console's own SEAL's,
so its victim dies his own death; and the trace in `match/src/room.ts` beside it, `FUN_002b44e0` building the switch
program's context with entries of types 3, 4 and 1, no 9): the original credits the presser. The capture decides
(parity clause: when two disagree the original decides); the reading is kept here as it was and is re-read next --
where the presser reaches the round's owner or the kill's credit -- LATER 1038.

**The re-read: the presser is the switch program's type-9 entry (LATER 1038; reading, reviewed 2026-11-14 by an independent decode).**
`FUN_00272bb0` takes its context entries as a variable list of (type, value) pairs after the program and a flag,
ended by a 0 type (`FUN_00272c30`'s loop, D:L120362-120622; type 9 kept as an entry whose +0xc is the value,
D:L120570-120593, and read back by `FUN_00272640` / `FUN_00272560`, D:L120013-120075). The R5900 passes eight
arguments in registers (a0-a3, t0-t3) and the rest on the stack, and the decompilation shows the registers only. In
`FUN_002b44e0` the registers carry the program, 1, and the types 3, 4 and 1 with their values (the action's +0x14 and
+0x18, unread here, and the presser's +0x3b0) -- what the trace above read as the whole context
(D:L156826-156838). The machine code (`socom2_game.elf`, hand-decoded at 0x2b4598-0x2b4624) loads the presser's id
(`+4`) and branches on its sign (`bltz` at 0x2b45a8): when it is not negative it stores 9, the id and 0 at 0(sp),
8(sp) and 16(sp) before the call at 0x2b45e0, so the context's list goes on to a type-9 entry naming the presser and
then ends; when it is negative (no presser) only the 0 at 0(sp) (0x2b45f4), no type 9. `FUN_0025ccb0` then takes that
entry: the id resolves to a player (`FUN_0029e4e0(0x4362e0, ...)`, its +0x10 2), and he is the round's owner over
the console's own SEAL (D:L107285-107300), written to the round's `+0xac`; at a hit that kills,
`FUN_005a0e70` reads `+0xac` and credits that player with the death (D:L459286-459300), and `FUN_0059ee20` scores it
as his (D:L458059-458147: a kill of the other side, a team kill of his own side, a suicide if he is the victim). A
peer's copy of the press (D:L160543) calls `FUN_002b44e0` with the presser the message names, so every console's
round is the presser's -- as Q14's two feeds read. Every caller of `FUN_002b44e0` passes the actor who used the
action (D:L81236, D:L451513, D:L452018, D:L452207, D:L502654). Not carried further: a `CALL_ANIMATION`'s callee gets a
context of the command's own entries (`FUN_0025d5c0`, D:L107755-107768). And a destructible's death has no presser:
its five calls (`FUN_00273a50`, D:L121010-121060) end in a register or `sd zero, 0(sp)` (0x273dcc-0x273e8c), no type
9 -- its round stays each console's own SEAL's (`SCENE_ROUND_OWNER_READING`). **Built** (LATER 1038,
`agent/later-1038-scene-owner`): the room's press passes its presser to the run (`viewer/src/worldState.ts`,
`WorldRunContext.by`; a `CALL_ANIMATION`'s callee is not given him), the `fire` hook hands him to `Room.sceneRound`,
which resolves him when the command runs (as `FUN_0025ccb0` does, D:L107287-107297) and holds the player, never the
id; `fireSceneRounds` makes him the owner at every victim (`SCENE_ROUND_PRESSER_READING`, `match/src/room.ts`; test
`match/test/sceneRoundPresser.test.ts`). A victim of the other side is the presser's kill (`enemy`; proven for the
feed's line by Q14). **A teammate: the presser's team kill, friendly fire off and on -- proven by Q18 (b) (off,
n = 1) and Q18-b2 (on, n = 2), below** (`teammate` `'presser'`). *Was (the main controller's ruling, seat 67, 2026-11-14, on the review
of 077e8ec19c; reading, pending Q18 (b)):* a teammate of the presser under the arch meets the friendly-fire gate as
the presser's round -- spared with friendly fire off (the room's default), and with it on killed as the presser's
team kill (`FUN_00545c10`, D:L458112-458113). The presser under his own arch dies his own death either way (killer and
victim one, D:L458084-458085). A presser who leaves between the command and the blast (`departed` `'orphan'`): the
original's death still carries the round's `+0xac` id (`FUN_005a0e70` passes it on whether or not the lookup finds a
player, D:L459286-459300), and what it makes of a gone id is unread; the room takes the projectile's rule for a
departed thrower -- no one present credited or charged, his name kept in the line. Owed, both and the counters:
the rig's Q18 (the next rig session, date not set) -- each console's round block (actor `+0x58c`: kills `+0x598`, deaths `+0x59e`, suicides `+0x5a0`,
team kills `+0x5a2`, score `+0x5c8`; research 155 §1.2, 91 §8) before the press and after the death, with (a) the
other side, (b) a teammate and (c) the presser himself under `seal_demo_1`'s arch. *(Taken 2026-11-15 for (a) and (b),
below; (c) not run.)*

**Q18: the counters and the teammate, measured on the original running (WM-SWITCH, 2026-11-15).** Q18 (the capture rig
on the original running, r0004, Crossroads MP72, three clients on a local server, 2026-11-15; the room's CREATE GAME
default "Friendly Fire is disabled", Medius RulesSet 0; reads only, the set-up writing placements and yaw alone; its
files in the private bucket under `gate-runner/shadow/out/2026-11-15/q10-hitreg/q18-bridge-counters/`: `score.txt`,
`README.txt`, `setup.log` and a zip of the rows, the pictures and ten videos). SEALs: the presser (the host) and a
teammate; Terrorists: the third. Every body CROUCHED (posture 1) through every case here, Q18-b2 included (the rig's
correction of 2026-11-15: its relay had the posture word reversed); the stance was not varied, so a standing body's case is unmeasured. The switch `seal_callstrike_1` used under the
reticle as in Q14; each console's round block read (`+0x58c`: kills `+0x598`, deaths `+0x59e`, suicides `+0x5a0`,
team kills `+0x5a2`, the round score `+0x5c8` read as a signed halfword), which resets at each round's start. One run
each, as the rig reported it and seat 67 filed it (`agent-mail/evidence/q18-bridge-counters-2026-11-15/READ.md`; 67 did
not open the bucket's files, so a reviewer re-reads `score.txt` and the zip's rows against these):
- **(b) the same side, friendly fire disabled** (round 2): the teammate under the arch KILLED -- health 0, posture 8 by
  +1.86 s after the press; the feed "`<the presser>` fragged `<the teammate>` with MPBOMB"; the presser's kills 0,
  deaths 0, suicides 0, **team kills 0 -> 1**, **round score 0 -> -1**; the teammate's **deaths 0 -> 1**, suicides 0;
  the third unchanged.
- **(a) the other side** (round 5; round 4 the same kill and feed, its after-reads late): the victim dead at +1.13 s,
  posture 8; the feed "`<the presser>` fragged `<the victim>` with MPBOMB", then "ALL TERRORISTS ELIMINATED" and "SEALS
  VICTORIOUS!"; the presser's **kills 0 -> 1**, round score 0 -> 3; the victim's **deaths 0 -> 1**, suicides 0. The
  round ended on this kill, so the 3 holds whatever its end awarded (the rig's caveat).
- Not taken in this match: (b) with friendly fire ON (taken since, Q18-b2 below); (c) the presser under his own arch;
  an enemy kill in a round that does not end on it. Five presses in rounds 1 and 3 brought no blast and no counter
  change (all recorded; why not known).
- **Q18-b2: (b) with friendly fire ENABLED** (the rig on the original running, r0004, a new MP72 match, three clients,
  friendly fire enabled through the game's own CREATE GAME row, 2026-11-15; shadow-relay-1's report as relayed by the
  controller; files in the private bucket under `gate-runner/shadow/out/2026-11-15/q10-hitreg/q18-bridge-counters/`,
  `score.txt` extended and `b2-files.zip`; this note's author did not open them). The presser and the victim both
  SEALs, an enemy left alive so the round GOES ON. Run 1: the teammate under the arch KILLED; the presser's **team
  kills 0 -> 1**, **round score 0 -> -1**, kills 0; the victim's deaths 1, suicides 0; the feed "`<the presser>`
  fragged `<the teammate>` with MPBOMB". Run 2 (another round): the same.

**Proven** (the original running, r0004): a switch's blast kills a teammate of the presser with friendly fire off
(n = 1, Q18 (b)) and on (n = 2, Q18-b2), booked to the presser as a team kill and to the victim as a death, not a
suicide, the presser's round score moving -1 each time -- and in Q18-b2 the round went on, so that -1 is **not** a
round-end effect; an enemy it kills is the presser's kill and the victim's death (n = 1, Q18 (a)); the feed names the
presser and MPBOMB in every case. **Not proven:** the enemy kill's own score (Q18 (a)'s round ended on it); where the
team kill's -1 comes from against the source's values (below).

**Why the gate lets it through (reading; WM-SWITCH; re-read at the source by its review, 2026-11-15).** r0004's `CZSealBody::OnWeaponHit` (0x5b2360,
the twin of r0001's `FUN_005ac670`, which the decompilation omits) is r0001's gate with one more condition: after
"owner != victim" it loads the round's flag byte `+4` and takes the friendly-fire return only when bit 4 is clear
(r4 0x5b243c-0x5b2448: `lbu`, the shift pair that keeps bit 4, `bnez` past the return); r0001 returns at once
(0x5ac74c). Both read again for this task with capstone over `game/overlays_r0004/socom2_game_r0004.elf` and
`game/disc/socom2_game.elf`, agreeing with the r0004 investigation's cluster note
(`agent-mail/evidence/r0004-investigation/cluster-ff-projectile-exception.md`, 2026-11-01, §1; archived 2026-11-14) and
research 398 §6. Bit 4 is set by `FUN_003c6ac0` (D:L318232-318235; r4 0x3e8c40), which `FUN_0025ccb0` calls
on its round online (D:L107308, D:L107322; r4 0x25d79c with `a1` 1, 0x25d84c with 1, both behind the online byte
0x45d481) -- the console-local round every scene `FIRE_WEAPON` makes, its fuse counted online and never sent (research
332 §1.2). So the gate is skipped for **every scene program's `FIRE_WEAPON` round** (and the launcher's Backblast
child, `FUN_003d2d70` D:L325639, which the 0x9f rule after the gate refuses where it is reached, research 377), not
for blasts in general: a grenade, a rocket, a claymore, a mine or a C4 charge a player sets off carries no bit 4 and
meets the gate as before.
Before LATER 1038 no scene round had a teammate owner (each console's own SEAL owns it; the cluster note found no
type-9 launch, missing the stack argument 1038 read), which is why the bypass showed nothing; with the presser as
owner it is the case that kills the teammate. The spectator test before the gate still holds. **Built** (WM-SWITCH,
`agent/wm-switch`): `ffRefuses`' `localRound` (`match/src/room.ts`), passed by `fireSceneRounds` alone; a scene round
with no presser (owner the victim) changes nothing. With friendly fire ON the room books the same team kill: the
bypass does not read the switch (the death, its owner and the team-kill count proven with it on by Q18-b2, n = 2; the
score an open reading, below). Test: `match/test/sceneRoundPresser.test.ts`.
Not ruled out by the reading: a whole-byte copy of `+4` from a network packet (the review's note 3); the control below
separates the cases it would blur.

**The control: Q23, an M67 at a teammate (WM-SWITCH, 2026-11-15).** The capture rig on the original running (MP2, three
clients, friendly fire disabled; reads only; every body CROUCHED, posture 1, by the rig's correction), legs 1 and 2 as the rig reported them (shadow-relay-1's report, relayed in
`agent-mail/evidence/weekend-mega-2026-11-14/INTAKE.md` §21; its files in the private bucket under
`gate-runner/shadow/out/2026-11-15/q10-hitreg/q23-explosives-teammate/`; this note's author did not open them, so a
reviewer re-reads the rows against these): an M67 bursting 1.04 u from an enemy and 1.82 u from a teammate of the
thrower KILLED the enemy and left the teammate UNHARMED -- the thrower's kills 0 -> 1, team kills 0, round score 0 -> +2
in a round that ended on that kill; the thrower's own M67 killed him as a SUICIDE (suicides 1, score -2). **Proven**
(the original running, the rig's reads of each console's round block, n = 1 each; the same kind of evidence as Q18):
with friendly fire off an ordinary grenade spares a teammate and kills its thrower as his own suicide. So the port's
friendly-fire gate holds for a grenade, and the bypass is the scene round's alone, as the reading has it. **Leg 5,
friendly fire ENABLED** (the same rig, r0004, the friendly-fire-on match relayed with Q18-b2 -- one match by the relay's heading, not said outright -- 2026-11-15; its distances to two decimals as the main controller's relay gave them, INTAKE section 23 saying only "about 7 u"; files under
`gate-runner/shadow/out/2026-11-15/q10-hitreg/q23-explosives-teammate/`, `score.txt` extended and `L5-files.zip`): an
M67 bursting 7.04 u from the thrower's teammate and 6.80 u from an enemy killed BOTH; the thrower's kills 1, team
kills 1, round score 0 net, the round ending on it; two "fragged ... with M67" feed lines. Proven, n = 1. With leg 1
this is the pair: the friendly-fire switch governs a grenade (spared off, killed on) and does not govern the switch's
blast (killed off and on). The grenade's net 0 fits the source's kill +2 and team kill -2 (fits, not proves: the round
ended on it). Not run: legs 3 and 4.

**Unmeasured, named (the WM-SWITCH review's notes 5 and 6).** (1) A presser who is dead but still in the room keeps
ownership (`fireSceneRounds`' `live` tests only that he is the same player in the room), and since WM-SWITCH his round
kills his teammates with friendly fire off too; whether the original's lookup (`FUN_0029e4e0` in `FUN_0025ccb0`,
D:L107287-107297) still finds a dead SEAL is unread, and no capture has a presser die between the press and the blast.
(2) With friendly fire off a teammate's Backblast is refused by the port's gate with the reason 'friendly fire'
(`ffRefuses`), where in r0004 that child round carries bit 4 (`FUN_003d2d70` D:L325639), passes the gate and is refused
at the Backblast rule after it (r4 0x5b25b0-0x5b25fc): the outcome is the same (no hit), the reason differs; true
before WM-SWITCH, unmeasured; no consumer of the reason on the wire is known to this note.

**The score (`SCENE_ROUND_TEAM_KILL_SCORE_READING`).** The room books a team kill -2 for every cause: `FUN_00545c10`
(the only team-kill scorer `FUN_0059ee20` calls, D:L458112-458113) adds 1 to `+0x16` and -2 to `+0x3c` (the round
score, `+0x5c8` of the actor) on the killer's own console (D:L411864-411865); r0004's twin (0x54a630) is the same, its
-2 at 0x54a684. The press itself scores its record's `points` (2 for both switches, §4) through `FUN_00545530`
(D:L411589-411591, from `FUN_002bb5b0` D:L160645; r0004's twin unchanged), and a kill +2 (`FUN_00545290` D:L411491).
With these source values every captured case of the switch comes out exactly one point under the port: Q18 (a) 3
against the room's 4 (press 2 + kill 2), Q18 (b) and both Q18-b2 runs -1 against the room's 0 (press 2 - team kill 2).
**The gap is in what the press is worth with that kill, not in the -2** (the controller's reading of the rows, 8f,
2026-11-15; reading, the score open): Q18-b2's -1 came in a round that went on, so it is no round-end effect; Q23
leg 5's grenade nets 0 over a kill and a team kill, fitting the source's +2 and -2 (fits, not proves, its round ended
on it); and a press worth +1 with a -2 team kill fits both Q18 (b) rows and Q18 (a) (3 = +1 press + 2 kill). The
source reads the switch record's points as 2 in full (`FUN_00545530` D:L411589-411591, §4), so something halves or
offsets the press's 2 in these cases -- not found. *Was (this note, earlier on 2026-11-15):* "one shared -1 points at
the press (or at something the scene round's death does), not at the -2". Readings for what offsets it, none
confirmed: the press's points not counted on the presser's own console (a peer applies the host's score message
through `FUN_002bb770`, D:L160668, research 176; Q18's presser was the host, whose own press scores through
`FUN_002bb5b0`, so this reading needs the host's path to differ); the record's `points` differing in r0004 from the
r0001 value read in §4; something the scene round's death books beside the kill. Not changed (the controller,
2026-11-15): `SCENE_ROUND_TEAM_KILL_SCORE_READING` stays -2 and the room's booking as it is; the ordinary -2 and the
press's 2 are the source's, and nothing read books -1 for this cause.

**Where the point goes: Q18's per-poll rows read, not settled** (source inspection of a capture of the original: the
runner seat's read of the bucket's `score.txt`, `README.txt` and the zip's `case-a-r5/times.txt`, `case-b-r2/times.txt`
and `rows-b.txt`, 2026-11-15, `agent-mail/evidence/weekend-mega-2026-11-14/box/q18-presser-score-read/READ.md`; nothing
re-measured). The rows are the driver's PINE polls of memory, not game ticks: pairs about 265 ms apart, a pair every
1.3-1.9 s, wall-clock ms from the press and no tick numbers. (a), round 5: the presser's round score 0 at -3.8 s, and 3
at the first poll after the press, +1.129 s, together with kills 1 and the victim already dead; no poll falls between
the press and the death; 3 at every poll to +24.7 s; the round ended on that kill, so the 3 may still hold a round-win
award. (b), round 2: the per-poll rows hold the victim's health only (whole at +157 ms, 0 and posture 8 at +1.861 s);
the counters were read only at -8.7 s and at +32 s (the presser, 0 -> -1 with team kills 0 -> 1) and +75 s (the
victim, score 0 -> 0, deaths 0 -> 1). In both cases the score is first seen changed together with the kill counter --
an inference from where the polls fall, not a reading. **Where the point goes stays unread.** The presses of rounds 1
and 3 changed no counter, but the switch did not take them (no blast), so they do not test a taken press without a
kill. **Owed rig leg, in these words:** a taken press with no one in the blast (no kill), the presser's counters polled
through it; or polls under 100 ms apart between the press and the victim's health reaching 0. And the remaining leg of
the switch: an enemy kill by the switch in a round that goes on (the rig could not run it without a side change in the
lobby).

**+0x8c and +0x90 are timers, in seconds.** The round's tick `FUN_003c5310` (D:L316819-316918) counts +0x8c down by
the frame's time unless it is 9999999.0 ("never"). At or below 0, with +0xc5 and +0xc6 clear, it sets +0xc4, and
+0xc4 runs `FUN_003c8740` and puts the round in state 2 (D:L316893-316905). It counts +0x90 down while the round's
phase (+10) is 6, moving it to phase 7 when the timer runs out (D:L316880-316890). `FUN_003c99a0` (D:L319878-319910)
and `FUN_003c9fb0` (D:L320068-320135) read and count them the same way. The reading: **+0x8c is the round's fuse**,
so 0.001 s detonates the MPBOMB round on its first update at the node **where the fuse counts at all**: it counts
down only while bit 2 of the round's +4 is set or `DAT_0045a0c1` (the online flag) reads 0 (D:L316893-316895), and
`FIRE_WEAPON`'s handler clears that bit when online (D:L107303, `& 0xfb`), so online this fuse does not run on the
console that fired it (XR-01's review, 2026-10-05; what detonates the round online is not traced). **+0x90 is a
second, post-impact phase timer** (10 ms). The floats are not a damage or radius scale. Nothing is built on either
(PF.R32).

**Corrected 2026-10-16** (BOMB-DAMAGE, research 332 §1.2; reading, pending review): `FUN_003c5310` is the placed
charge's tick (it reads `+0xc4`-`+0xd0`, past the pool's 0xc4-byte slot), not this round's. The FIRE_WEAPON round is a
pool round (`FUN_003cbdf0`), ticked by `CZProjectile`'s `PostTick` `FUN_003c9fb0`, which counts `+0x8c` every frame
with no online test (D:L320127-320129); `HandleTimers` (`FUN_003c99a0` D:L319884-319901) then detonates it online
through `+4` bit 4, which the handler sets after the fire (D:L107320-107322). So the round goes off on every machine,
online too, and its explosion meets the bodies as a grenade's (research 332 §1.3). *Was:* online the fuse does not
run on the console that fired it (above).

What the detonation (`FUN_003c8740` on) does to players, bodies and the scene (the ammunition's raw 50 damage and 30
units, research 171 s4; falloff, occlusion, attribution, friendly fire) is traced by research 332 §1.3 (2026-10-16,
BOMB-DAMAGE). *Was:* "is not traced". Capture B item 3 settles what
the original shows (`BRIDGE_FIRE_WEAPON_READING`, s6). The port decodes the command as
`{ op: 'fireWeapon', weapon, ammo, node, f1, f2 }` (`@s2u/scene` `effects.ts`), with the floats uninterpreted. The
page's and room's runners fall through it (`effectRunner.ts`, `worldState.ts` `default`), so it builds no blast.
Test: "FIRE_WEAPON (57) names MPBOMB / MPBOMB Ammo with its two float overrides 0.001 and 0.01 on both *_demo_site1
and base_explosion1; nothing is read as damage" (registry `world.crossroads.fire-weapon-decoded`).

### 2.3 `FOR_CHILDREN`, `OBJECT_MAKE_WORLDCHILD`, `END_FOR_CHILDREN` and `flyparts`

| Command | Size | Handler | Layout |
|---|---|---|---|
| `FOR_CHILDREN` (41) | 12 B | `FUN_0025e360` (D:L108011) and its step `FUN_0025e3f0` (D:L108029-108072) | +4 i8 the parent's ref (5 `parts`); +5 i8 the loop variable's ref (7); +6 u8 the child index (runtime); +7 bit 0 restart (runtime); +8 u16 the sequence offset of its `END_FOR_CHILDREN` (0xcc = 204 = 332 - 128), jumped to when no child is left |
| `END_FOR_CHILDREN` (42) | 8 B | `FUN_0025e2d0` (D:L107987) | +6 u16 the sequence offset of its `FOR_CHILDREN` (0x9c = 156 = 284 - 128): it jumps back, steps, and leaves by the `FOR_CHILDREN`'s +8 |
| `OBJECT_MAKE_WORLDCHILD` (6) | 8 B | `FUN_00263b30` (D:L111373-111398) | +4 i8 the node's ref: unless already under the world root `DAT_0045c380`, it takes the node's world matrix, removes it from its parent (vtable +0x1c), adds it to the world root (+0x18) and sets the matrix back |

The step does not move the index on when the last child left its parent: `OBJECT_MAKE_WORLDCHILD` takes each part
out of `parts`' list, so the same index finds the next one (the index moves on only while the bound child is still the parent's, D:L108043-108050).

`flyparts` (MZANIM, one set) holds two sequences, both word 0x102. Sequence 1 is `OBJECT_MOTION` (172 B) on the
context (0xfa), the part's flight: flags 0x2d2, the f32 pairs 45/150, 270, 45/50 and the turn rates 0.2618/-0.05236
among them, left to the motion decoder. Sequence 2 is `WAIT 2`, `OBJECT_OPACITY_FROM_TO` (24 B: 1 -> 0, rate -0.5,
2 s), the context off, and `OBJECT_OPACITY_FROM_TO` 0 -> 1 in 0.001 s, which restores the part for the next round.

Under the loop hang only the part's parent, its active bit, its motion and its opacity. `parts` and the parts carry no
collision (s1: 0 polygons), so nothing under them is gameplay. The state they leave is node state (s2.1), which is why
PF.R29 rules on it: H99 stays, extended to the bridges.

### 2.4 The objective's messages and sounds (the table XR-06 transcribes)

`objectives` (MZANIM, 344 commands); a sequence's offset is its header's, its commands start 28 bytes on. Every
condition's valve is named (flags 0x02 at +13) and every operand is literal. The locale texts are
`READERC.ZAR/mp72LOC.rdr`'s:

| id | text |
|---|---|
| 7203 | SEALS VICTORIOUS! |
| 7205 | TERRORISTS WIN! |
| 7206 | BOMB DEFUSED |
| 7207 | TACTICAL: |
| 7208 | THE SEALS HAVE PLANTED THE BOMB |
| 7209 | THE TERRORISTS HAVE PLANTED THE BOMB |
| 7210 | THE BOMB WILL DETONATE IN 30 SECONDS UNLESS DEFUSED |
| 7211 | THE BOMB HAS BEEN DROPPED |
| 7212 | THE BOMB HAS BEEN PICKED UP |
| 7213 | DEMOLITION SUCCESSFUL |

`MESSAGE (id, scale)`; the sounds' flags: 0x80 a new placed play at ref 0; 0x880 the priority slot at 3, the `MUS_*`
cues the viewer drops (`SOUND_PRIORITY_SLOT_READING`). `player_team` is the viewer's own team: 0, 8 or 16. 16 resolves
with 8 in every branch below.

| Sequence (offset, word) | Trigger | Branch | Commands in order (command offsets) |
|---|---|---|---|
| `switch_timer` (3844, 0x102; `WHILE` forever) | `mp_bomb == 3` (3880) | always | stop `start`, stop `mission_timer` (3904-3912) |
| | | `bomb_owner == 1` (3920) | 7207 0.9, `^PH_0005` (0x80), 7208 0.7 (3944-3992) |
| | | `bomb_owner == 2` (4008) | 7207 0.9, `^PH_0005`, 7209 0.7 (4032-4080) |
| | | always, after | 7210 0.7 (4104), `WAIT 2` (4120), `MUS_BOMB_PLANTED` (0x880, 4132), call `bomb_timer`, call `defuse`, stop `switch_timer` (4164-4180) |
| `bomb_pickup` (4344, 0x102; forever) | `mp_bomb == 2` (4380) | always | `MUS_BOMB_PU` (0x880, 4404), 7207 0.9, 7212 0.7 (4436-4452); `bomb_owner == 1`: call `pulse_terrorist` (4492), `== 2`: `pulse_seal` (4536); call `bomb_drop`, stop `bomb_pickup` (4564-4572) |
| `bomb_drop` (4204, 0x104; forever) | `mp_bomb == 1` (4240) | always | 7207 0.9, 7211 0.7 (4264-4280), stop animations `pulse_terrorist`, `pulse_seal`, call `bomb_pickup`, stop `bomb_drop` (4296-4320) |
| `defuse` (1960, 0x104; `WHILE mission_complete == 0 AND mission_failure == 0`) | `mp_bomb == 4 AND bomb_owner == 1 AND player_team == 0` (2036) | SEALs defused, SEAL viewer | stop `mission_timer`, `bomb_timer`; `mp_score00 += 1`; `mp_winner = 0`; stop `start`; `^PH_0003`; `WAIT 3`; 7206 0.7; 7203 0.9; `^PH_0014`; `MUS_MP_SEAL_WIN_ALG` (0x880); call `success`; stop `defuse` (2108-2312) |
| | `... bomb_owner == 1 AND player_team == 16` (2320) | | the same, `failure` (2392-2596) |
| | `... bomb_owner == 1 AND player_team == 8` (2604) | | the same, `failure` (2676-2880) |
| | `... bomb_owner == 2 AND player_team == 8` (2888) | Terrorists defused | `mp_score08 += 1`; `mp_winner = 8`; `^PH_0003`; `WAIT 3`; 7206 0.7; 7205 0.9; `^PH_0002`; `MUS_MP_TERR_WIN_ALG`; `success` (2960-3164) |
| | `... bomb_owner == 2 AND player_team == 16` (3172) | | the same, `success` (3244-3448) |
| | `... bomb_owner == 2 AND player_team == 0` (3456) | | the same, `failure` (3528-3732) |
| `bomb_timer` (4596, 0x102; forever) | `mp_bomb == 5 AND bomb_owner == 1 AND player_team == 0` (4632) | SEALs' bomb went off, SEAL viewer | stop `start`; `mp_score00 += 1`; `mp_winner = 0`; `WAIT 2`; 7213 0.7; `^PH_0004`; `WAIT 2`; 7203 0.9; `^PH_0014`; `MUS_MP_SEAL_WIN_ALG`; `success`; stop `bomb_timer` (4704-4904) |
| | `... bomb_owner == 1 AND player_team == 8` (4912) | | stop `start`; score; `WAIT 2`; `^PH_0004`; 7213 0.7; `^PH_0004`; `WAIT 2`; 7203 0.9; `^PH_0014`; `MUS_MP_SEAL_WIN_ALG`; `failure` (4984-5216) |
| | `... bomb_owner == 1 AND player_team == 16` (5224) | | as 4912, `failure` (5296-5528) |
| | `... bomb_owner == 2 AND player_team == 0` (5536) | Terrorists' bomb | stop `start`; `mp_score08 += 1`; `mp_winner = 8`; `WAIT 2`; `^PH_0004`; 7213 0.7; `^PH_0004`; `WAIT 2`; 7205 0.9; `^PH_0002`; `MUS_MP_TERR_WIN_ALG`; `failure` (5608-5840) |
| | `... bomb_owner == 2 AND player_team == 8` (5848) | | as 5536, `success` (5920-6152) |
| | `... bomb_owner == 2 AND player_team == 16` (6160) | | as 5536, `success` (6232-6464) |

Readings for XR-06: in the defuse branches `bomb_owner` is the defuser's team (research 171 s6), and in the detonation
branches it is the planter's. The first `bomb_timer` branch (SEAL bomb, SEAL viewer) plays `^PH_0004` once, after
7213, where the other five play it before and after. The announcement delays are `WAIT 3` (defuse) and `WAIT 2` +
`WAIT 2` (detonation), before `success`/`failure`'s own 20 + 1 s (research 171 s7; PF.R27).

### 2.5 What the brief's table holds that this note did not re-read

The switches' positions and collision bounds, the node-reference words and StartBomb's cell are research 171 s3-s4 and
173 s2, measured or read there and unchanged by this note. XR-08 re-reads StartBomb in s5.

## 3. The capture script for owner session B

**Setup.** Two consoles on our own local Horizon only (R293), one Crossroads Demolition round per block, both players
named. Console A runs PCSX2 with a frame dump at the native 640x448 and a frame counter. Console B is the second
player. A **timing** is a count of frames between two marked frames, divided by 59.94 (NTSC fields): each item says
which frame opens and which closes it. An **RDRAM read** is PCSX2's debugger on console A: a watched address or a read
at a breakpoint, noted with its frame number. The addresses:

- **The bomb's node:** the pointer `DAT_0044d4a0` gives the bomb's world node; its translation is +0x30/+0x34/+0x38
  (the row `FUN_003c5310` takes after `FUN_00315820`, D:L316856), world while its parent is the world root
  `DAT_0045c380`; otherwise compose up the parents as `FUN_00310980` (D:L212139) does.
- **The actor:** body +0xe84, standing against walking (H103); aim +0x1450 (the drop needs it below -0.25,
  D:L452465).
- **The planter's kit:** +0x87c, the placement timer, set to 2.25 at the commit (`FUN_005be9a0` D:L475479-475488).

Expected values are this note's and research 171's readings. A capture that disagrees overturns the reading, and the
note's row says so.

1. **Labels** (`BRIDGE_LABELS_READING`). From each spawn, walk to each upstairs switch. Take one frame that shows the
   switch and the building's landmarks, and one third-person frame of each intact street from under the arch. Expect:
   `seal_callstrike_1` at (1094.49, 100.27, 1831.16) over `seal_demo_1`'s street (arch at x 879.4, z 1489.0), and
   `terrorist_callstrike_1` at (1298.43, 99.25, 1174.33) over `terrorist_demo_1`'s (x 1682.0, z 1404.0). Record which
   one is Fish Market and which Red Room.
2. **Switch A, nobody under it.** Frames: the press (open), the arch's swap (expect the same frame as the program's
   start, s2.1: every command 156-340 is timeless), and each explosion sound. Expect `.EXP_1` at 0 and 0.15 s and
   `.EXP_DISTANT` at 0.65, 1.35 and 2.25 s from the swap. Then the debris: it flies, starts to fade at 2 s, and is gone
   by about 4 s (`flyparts`, s2.3). Walk the street and try to pass the rubble (research 171 s5: segments at y 44 to 59 meet the
   rubble 4 times, at 64 twice, at 69 not at all; the street floor is at 42.5), then take the stairs/railing route.
3. **Switch B with console B's player under the arch** (`BRIDGE_FIRE_WEAPON_READING`). Record console B's HUD health
   before and after, and whether B is hurt or killed. Note whether the kill line names A or nobody, and whether the
   damage lands before or after the swap (expect the first `FIRE_WEAPON` on the swap's frame and the second 0.1 s,
   about 6 frames, later). Repeat with B on the street just outside the arch.
4. **Both switches, the other order:** each arch falls alone; a second press on a used switch does nothing and shows
   no prompt (the switch node is hidden at offset 264).
5. **Bomb pickup.** Approach from 25 u. Mark the frame the satchel appears (expect at 20 u: squared distance under
   400, `FUN_005aa110` D:L463792). Expect `MUS_BOMB_PU`, then 7207 "TACTICAL:" and 7212 "THE BOMB HAS BEEN PICKED
   UP". Record the compass marks (`ret_bomb`, `ret_base`) for the carrier, a teammate and a defender, and which base
   pulses (expect `pulse_terrorist` when SEALs carry).
6. **Manual drop** (`DROP_AIM_READING`). Stand still, aim down more than 14 degrees (expect the threshold at +0x1450 <
   -0.25, about 14.5 degrees; RDRAM-read it at the frame the prompt appears) and press Action. Record the prompt, 7207
   and 7211 "THE BOMB HAS BEEN DROPPED", the pulse stopping, and the frames until a re-pickup is allowed (expect 4 s).
7. **Plant timing** (`PLANT_PLACEMENT_CANCEL_READING`, `PLANTED_CLOCK_FUSE_READING` -- was `PLANTED_CLOCK_DISPLAY_READING`). At the enemy tent, aim at
   the tent node and HOLD Action. Frames: the press; the hold complete (expect 5 s); state 3 (expect 2.25 s after
   that, RDRAM kit +0x87c counting down from 2.25); the "MP DEFUSE BOMB" timer's first frame and value (expect 30 s);
   7207, `^PH_0005`, 7208 or 7209, 7210 "THE BOMB WILL DETONATE IN 30 SECONDS UNLESS DEFUSED", then 2 s later
   `MUS_BOMB_PLANTED`. Repeat with:
   (a) a release at 4.5 s (expect the hold reset to 0);
   (b) a release at 5.5 s, inside the placement (does the 2.25 s run to completion? PF.R30 rules that it does);
   (c) console B killing the planter at 6 s (expect the placement cancelled and the bomb dropped).
   Also record whether the HUD round clock keeps counting after the plant.
8. **Defuse** (`DEM_SAME_TICK_READING`). Console B holds Action within 15 u horizontally and 20 u vertically of the
   planted bomb (expect a 5 s hold, reset on release). Steps: release at 4.5 s; then defuse on the frame before the
   fuse ends. Expect `^PH_0003`, then 3 s later 7206 "BOMB DEFUSED", 7203 or 7205, the voice and the music. Record the
   result screen's first frame (expect 20 s, then the next round 1 s later).
9. **Detonation with a player beside the bomb** (`MPBOMB_BLAST_OWNER_READING`, research 332; was
   `MPBOMB_PLAYER_BLAST_PLACEHOLDER`). Record that player's health or death, his death line and his score, the base's swap to `whats_left`, and `base_explosion1`. Expect 2 s, then 7213 "DEMOLITION SUCCESSFUL" and
   `^PH_0004`, then 2 s, then 7203 or 7205. Read the scoreboard after: expect the planter +2 for the plant and +2 for
   the detonation, the defuser +2, and the team score carried.
10. **Pre-plant time-out at 00:00** with the bomb carried (a draw). Then **a plant on the clock's last second**
    (`DEM_SAME_TICK_READING`; PF.R28 rules that the plant stops the time-out).
11. **Carrier leaves** (unplug console B while it carries). Record where the bomb reappears (expect the carrier's last
    position, `FUN_002bef60` D:L162527; RDRAM-read the node).
12. **Late join** (`JOIN_SILENT_READING`), after one arch fell and with the bomb planted. Record what the joiner sees:
    the arch destroyed; `parts` debris or none (s2.1: unguarded); the compass; the defuse timer's value. Record what it
    hears (expect no explosion sounds replayed).
13. **Turrets (MAP-10).** Mount `mp72_turret01` from in front (22 u, 35 degrees) and from behind. Record the mount
    pose and camera, yaw to both stops (-10/+110), pitch (-45/+35), fire until empty, dismount, be killed while
    mounted, and have console B mount while A is on it.
14. **The OBJECTIVE post.** Frame of the Crossroads objective line: expect 3.36 s (H95; `start`'s `WAIT 3`, then
    7200/7201).
15. **Round 2.** Expect both arches intact, the switches back, and the bomb at StartBomb: RDRAM-read its exact XYZ
    through `DAT_0044d4a0`'s node. Expect XZ (1279.762, 1446.111) and Y 47.334 before any `FUN_00516920` correction
    (research 173 s2).

## 4. The switches (XR-04)

As built, web sprint 27 (XR-04). Sources: s2.1-s2.3 above; research 171 s3-s5; research 209 s8-s14 (the world's
programs) and 210 s8 (the room's silent world, the page's presentation runs).

**The press.** The page's `ActionPage` (`viewer/src/actionPage.ts`, the `doorPage.ts` precedent) takes the node the aim
ray strikes (`aimPick`, as C4's pick) and the game's pick over it (`actionAtPick`, `FUN_005aa240` D:L463830-463905):
the node or a parent names the action, its valve not 99, the feet within its `range` (30) of the struck point along the
ground, strict (D:L463895); only a SWITCH record (type code 2). Its prompt is the record's `bitmap`,
`action_pull_lever.tif`, read back through `ACTION_ICONS` (`hud.ts` `promptOfBitmap`: `lever`). The action button
sends `{ type: 'action', seq, action, surface: { path, point } }` to the room (additive under protocol 10, PF.R33) and
runs nothing itself: offline the loopback's Room answers it.

**The press, predicted (P8, 2026-11-02; reading for the original's side, the prediction a network adaptation, pending
review).** The original runs a switch's use on the pressing console, as it runs a door's: the button's `0x2000` branch
(`FUN_00592d50`, D:L452002-452022) takes the record from the actor's pick and calls `FUN_002b44e0`
(D:L156787-156865), which starts the action's animation there and only logs the use to the net (`FUN_002bb5b0`,
D:L156852) -- research 92 s1, the same branch for every non-MP-bomb action, so for Crossroads' call strikes, for the
lever gates (research 174 s5.1, SWITCH records) and for Chain Reaction's crane controls (research 176 s9, SWITCH
records). The port's room is the authority a round trip away, so the page presents its own press at once
(`SWITCH_PREDICT_ADAPTATION`, `viewer/src/actionPage.ts`; P7's `DOOR_PREDICT_ADAPTATION` is the pattern): the
presentation run the room's `action` event would start (`.EXP_1` and the `call` hook at the press), a gate lever's slide
as a pose (`GATE_PREDICT_ADAPTATION`, research 174 s5.1.1) and a crane's swap and pause (`CRANE_PREDICT_ADAPTATION`,
research 176 s11). The room's `action` event naming this seat is the run's echo and runs nothing again (the use marked on
the page's world, the room's `used`; never a crane's); another seat's for the same switch while this one waits is that
press's and keeps the run; a snapshot acking a command past the press's with no echo, or one with no own body (a dead
seat's: `Room.useAction` refuses 'not alive'), is a refusal, and the run is dropped where it stands
with every run it started -- a program of the set it called, an action it executed -- and the opacity it wrote put
back (`WorldState.dropTree`; the P8 review's F2). The cost, the owner's Q7 (the online-parity sweep's section 6, its default followed): a
refused press's sounds up to the room's word were heard -- predicted only where the page's own pick passed the reach
gate -- and the common effects it called are not taken back. Tests: `viewer/test/actionPage.test.ts` (P8 cases against
`LoopbackMatch`'s `delayMs` on the fixture, and by hand for the gate and the crane). Was: "runs nothing itself" -- the
page now presents the press, the room still decides it.

**The room's checks** (`match/src/room.ts` `useAction`), each refusal tallied by why (`dropped('action', why)`):
`not alive` (dead, or the round over); `no switch` (an index that is no SWITCH record: a door goes by `door`, the
tents are XR-05's); `no action` (the struck node is not the record's or under it); `reach` (`actionAtPick([record])`
from the struck point: the record's own strict reach); `walled` / `missed` (the head's line to the point, `c4Line` as
PF-13's C4 uses it); `busy` / `used` (`WorldState.actionRefusal`, `FUN_002b46f0`: busy while the action's program runs,
`FUN_002b44e0` D:L156787; used only for a `one_shot` record after a completed run, or a used Forge switch -- LATER 976,
2026-11-20: there is no once-a-round use of a disc switch; `actionUsed` is the score's once, `+0x3f` bit 1). A malformed event (a
non-whole index, a surface whose path is not a string or whose point is not three finite numbers) is ignored before
any of these. On success the room marks the use, broadcasts `{ type: 'action', action, by }`, and calls `scored`, the
hook PF-14 fills (the record's `points` 2, `FUN_00545530`).

**The build (OT.R97; the LATER 976 delta review, 2026-11-22, a decode of r0004's ELF by its reviewer; reading, pending
review).** The citations above are r0001's. In r0004 `FUN_002b46f0` is 0x2b6160 (the same rule; the offsets `+0x3f` /
`+0x3e` become `+0x43` / `+0x42`), `FUN_002b44e0` is 0x2b5ef0 and `LAB_002b46d0` is 0x2b6100, and r0004 CHANGES the
last two: 0x2b5ef0 takes a fourth argument and, refusing a use while the action's program runs, stores it at the action's
`+0x30` (-1 otherwise); the end callback 0x2b6100, after clearing `+0x10` and counting `+0x42`, calls 0x2b5ef0 again
(no actor, index 0) when `+0x30` is not -1 and equals the valve record's value. Only the NETWORKED use passes a real
fourth argument (the counterpart of r0001's `FUN_002bb310` call, at 0x2bd0ec; 7 of 8 callers pass -1). **The deferred
use, not built (a named unknown):** a networked use that arrives while the program runs is kept and run at the program's
end in r0004; the port refuses it `busy` (`room.ts` `useAction`, `actionPage.ts`). Its reach: about one latency around a
run's end (MP73's radios, 30 s). What would settle it: the 0x2bd0ec caller's message read, and a capture of two presses
of an MP73 radio across its run's end.

**The run.** `executeAction` runs `*_demo_site1` on the room's world, silent (`ROOM_SKIP_EFFECTS_READING`; silent is now
`executeAction`'s default on a world whose `skipEffects` is set), and refuses an action whose program runs (or a
`one_shot` record's after a completed run; LATER 976). Every command from 156 to 340 is timeless, so on the press's own tick `destroyed` and `parts` turn
on and `healthy` off (240/248/256), the switch's node is hidden (`seal_callstrike1` at 264), the rubble's 170 polygons
are live and the street's witness segment meets them 4 times (s1); the other arch is untouched. The program's own run
ends at 2.25 s (the sound tail). The state reaches every page in the next snapshot's `env` and a late joiner's welcome
(MAP-03); a fallen arch (and its hidden switch) is the only Crossroads entry there. The round's reset restores both
arches from their saved references (bit 28) and clears the use.

**What the room's run leaves out.**

- `FIRE_WEAPON` (offsets 28 and 84): **built** (corrected 2026-11-14). The world hands the command to its `fire` hook
  (`viewer/src/worldState.ts`, `WorldHooks.fire`), and the room fires the round: `Room.sceneRound` queues it at the
  command's node past its fuse, and `fireSceneRounds` sets it off on the tick it is due (research 386 §3.2, LATER 63;
  `match/src/room.ts`). Its blast follows the bomb's path, which hurts the players (research 332 §2). A player of the
  presser's other side it kills is the presser's kill ("fragged ... with MPBOMB", as Q14 measured on the original
  running, §2.2; `SCENE_ROUND_PRESSER_READING`, LATER 1038, 2026-11-14; its counters Q18 (a), 2026-11-15); a teammate of
  the presser is the presser's team kill, friendly fire off as on -- the gate passes a scene round (proven for friendly
  fire off by Q18 (b) and on by Q18-b2, 2026-11-15; the score an open reading; §2.2, WM-SWITCH). *Was (LATER 1038 until WM-SWITCH):* a
  teammate spared with friendly fire off. *Was (until LATER 1038):* every victim's own death, a suicide
  (`SCENE_ROUND_OWNER_READING`). *Was:* "the world's
  host falls through it: no blast, no damage, no hook (`BRIDGE_FIRE_WEAPON_READING`, PF.R32) ... read, not built here".
- `CALL_ANIMATION`s of the common set's `fire_explode_med` (twice) and `dust_explode_long`: the map's set does not hold
  them, so the world hands them to the page's `call` hook, at the calling program's root (`worldmodel/seal_demo_1`),
  on a presentation run only (`COMMON_EFFECT_CALL_READING`); the room's silent run reaches nothing.
- The parts' loop (284-332): `FOR_CHILDREN`, `END_FOR_CHILDREN` and `OBJECT_MAKE_WORLDCHILD` are now decoded
  (`@s2u/scene` `effects.ts`: `forChildren { parent, variable }`, `endForChildren`, `makeWorldChild { node }`, the
  runtime fields not kept), and the runner (`effectRunner.ts`) skips the block whole in every run kind. Before this, a
  runner falling through them as `other` ran the body once with ref 7 unbound: `flyparts` then ran with the switch
  action's path as its caller (the `call` op keeps the outer context), its `OBJECT_MOTION` on the switch and, after
  `WAIT 2`, the switch turned off a second time at +2 s (XR-01's review). No state flips at +2 s now; the run ends at
  2.25 s.
- Flown debris (`DEBRIS_NODE_READING`, PF.R29): a node whose reference saves its parent (bit 29) -- `part_1..15` under
  each arch's `parts` (0xbc08xx00), the bases' crate parts -- is never turned on by a silent run. Today the skipped loop
  keeps them off anyway; **once `FOR_CHILDREN` runs its body (a later decode of the flight), all 15 `part_N` of an arch
  would reach the wire without this rule**, and the rule is what keeps them off it. `parts` itself (no save-parent bit)
  turns on, harmless: its children stay off and it holds no polygons (s1). No page draws debris (H99, extended to the
  bridges by PF.R29).

**The page's presentation run.** On the room's `action` event the page runs the same program
(`executeAction(valve, false, true)`, PF.R26): `.EXP_1` at 0 and 0.15 s, `.EXP_DISTANT` at 0.65, 1.35 and 2.25 s
through the world's sound hook at `damage_point` (placed by `SCENE_SOUND_PLACE_READING`), the three common effects
through the `call` hook, and no node or valve changed. A late joiner gets no event and plays nothing
(`JOIN_SILENT_READING`).

**Owed to the controller (the held `main.ts`):** construct `ActionPage` beside `doors`; the action filter chain
`doors.action() || actions.action() || grenade.plantC4()`; `nearby:` asks `actions.prompt()`; the page world's hooks
gain `call: (name, path) => effects.play(name, world.placeOf(path))`; and the room's `action` event reaches
`actions.event(ev)` (`net.client.on`).

Tests: `viewer/test/worldState.parity.test.ts`, `worldState.test.ts`, `actionPage.test.ts`;
`match/test/roomWorld.test.ts`, `roomHostile.test.ts`, `roomFuzz.test.ts` (registry `world.crossroads.switch-once`,
`switch-pick`, `rubble-closes`, `reset-both`).

## 5. The bases and StartBomb (XR-08)

As built, web sprint 27 (XR-08). Sources: s2.1 above (the bases' programs); research 173 s2-s3, 171 s4 and s8; research
209 s13-s14 (MAP-06's `SceneHealth`, PF.R11's reach), 214 s1 (XR-05's `BombAuthority` and its `detonated` hook). Every
value is a reading of the MP72 and `ZWEAPON.ZAR` fixtures or of the decompilation; nothing here is a capture.

**The bases' blocks.** `MZANIM.ZAR` binds two kind-3 destructibles (`isDestructibleAnim`), one per base, each on its
`healthy/basedi` node: `destroy_terrorist_base` on `worldmodel/terrorist_base/crates_weapons=crates_weapons/healthy/basedi`
and `destroy_seal_base` on `worldmodel/seal_base/crates_hospital=crates_hospital/healthy/basedi`, each health 2, armour
0, shield 21 (173 s3). The polygons: the terrorist base 77 under `basedi` and 30 under `whats_left`; the SEAL base 28
under `healthy` (10 of them under `basedi`) and 15 under `whats_left` (173 s3's counts, re-read from the fixture).

**The weapon.** `readKitTable(ZWEAPON.ZAR)` reads `MPBOMB` as item 154, class explosive, ammunition `MPBOMB Ammo` (19):
`Explosion_Damage` 50 and `Explosion_Radius` 30 raw, which `throwableRecord` scales by `WORLD_SCALE` (10) to **300 u**,
as it does C4's 5 to 50 u (C4: damage 18). The brief's "radius 30" is the raw value; the room uses the record (300 u).
The outcome does not depend on it: the bomb is never more than about 17 u from its base's box (below), and the other
base is about 1465 u off.

**The detonation.** `FUN_002c1c30` (D:L163920) runs `base_explosion1` at the planted bomb's node; its one `FIRE_WEAPON`
fires the MPBOMB definition there (s2.2). How that round reaches the bases' damage interface is untraced (173 s3), so
PF.R11's rule decides reach (`SCENE_BLAST_REACH_PLACEHOLDER`, H102). The room (`match/src/room.ts`) listens on
`BombAuthority`'s `detonated` and calls `bombBlast(e.pos)`. That calls `sceneBlast(point, MPBOMB's record)`, a method
taken out of `blast()`'s MAP-06 block. `blast()` now calls it with the backblast's and the claymore's cones as a
`reaches` filter. `sceneBlast` runs `SceneHealth.blastAt` at the record's rating plus modifier (50) and radius (300 u).
The rule: the target's box comes within the radius, and the line from the point (lifted 0.1 toward the target,
`sightFrom`) to the box's nearest point meets nothing outside the target. 50 meets shield 21 (`FUN_003c7490`). With
armour 0 the health goes 2 -> -48, and `FUN_00273a50` runs the death on the room's silent world
(`ROOM_SKIP_EFFECTS_READING`). `destroy_*_base` turns `healthy` off (and `basedi` with it), `whats_left` and `parts`
on. The `parts/part1..15` stay off (`DEBRIS_NODE_READING`). The `FIRE_WEAPON` at the head of `destroy_terrorist_base`
is fired by the room (`Room.sceneRound`, research 386 §3.2; corrected 2026-11-14, *was:* "falls through
(`BRIDGE_FIRE_WEAPON_READING`)"). The next snapshot's `env` carries the change.

**Player damage** (BOMB-DAMAGE, 2026-10-16; research 332): the detonation hurts the players in MPBOMB's reach --
`bombBlast` deals `blast()`'s player path (`blastPlayers`) first, each victim the owner of his own hit
(`MPBOMB_BLAST_OWNER_READING`: friendly fire spares no one, a death is his own), then the scene blast as below.
*Was* (PF.R32, 2026-10-05): **No player damage.** `MPBOMB_PLAYER_BLAST_PLACEHOLDER` stayed `'none'` (XR-05's row, research 214 s6):
`bombBlast` never called `blast()`'s player loop, so no one is rung, hurt, knocked or killed, the planter and a
defender standing at the bomb included. No `actionDied` either: neither base's program runs `EXECUTE_ACTION`, and the
detonation's points are PF-14b's, on the bomb's transition. Without the kit table (a server with no `ZWEAPON.ZAR`)
there is no MPBOMB record, and the detonation reaches nothing.

**Only one base dies.** A tent's node sits at or beside its own base: `terrorist_tent` (526.023, 13.812, 1523.773) lies
inside the terrorist base's `basedi` box (x 488.7-573.6, y 13.8-51.1, z 1495.3-1562.7). `seal_tent` (2018.595, 63.187,
1422.437) is 2.5 u east of the SEAL base's (x 1990.9-2016.1, y 63.2-82.8, z 1411.8-1446.3). The SEALs plant at
`terrorist_tent` and destroy the terrorist base; the Terrorists plant at `seal_tent` and destroy the SEAL base. A
side's own base stays up.

**The line (the brief's risk).** A probe ran the room's line test from the floor under every point of a 2 u grid
inside either tent's 15 u plant reach (177 points a tent; the floor is the first surface down). It went to the target
box's nearest point and met nothing but `basedi` on all 354. The tents' own polygons occlude nothing, so on MP72 the
`clear` callback stays on the target path (MAP-06's rule, unchanged), and AD-5's material gate (`blastLine`, to
basedi's midpoint 18.89 u off) meets nothing else either. No `BASE_BLAST_LINE_READING` was needed.

**The Ruins (MP12): the mast stands between some plants and the SEAL base** (PR #405, finished 2026-10-22 from the
2026-10-20 trace). **Reading, pending review**: the decompilation re-read at the lines below and MP12 read through
`simMapFromBytes`; nothing here is measured on the original running. `tower_hitme` (173 §8: `tow_deux` at
(2144.131, 104.047, 2053.887)) stands inside the SEAL base's footprint, about 12 u from `seal_tent` (2134.010, 104.6,
2047.821). The reach gate (`FUN_003c80e0`, called from `FUN_003c7dd0` D:L318978) counts every surface on the ray but
the target node's and those of nodes sharing its `+0x94` damage interface (D:L319104-319108). The tower's interface is
set on `tow_deux`'s whole subtree (`FUN_002740e0` D:L121213 binds a destructible's node through `FUN_003158b0` with its third argument 1: the `+0x94` set at D:L215134, the subtree walk D:L215135-215166), never on `basedi`'s, so the tower's faces count on the
base's ray, and `di3` is METAL_THICK (PENETRATION 0), which refuses (D:L319117) -- as the port's `blastLine` does. The
order the explosion's list is walked in does not rescue it. The original takes one target a call (`FUN_003c7ee0`
D:L319007-319073 builds the next ray; `FUN_003c7dd0` hits it and steps the index, D:L318999), so a tower that dies
first does change the base's ray: its program turns `di1` and `di3` off and `di2` on (173 §8), and `di2`'s stump is
METAL_THICK too, over the whole footprint (to y 125, the trace's reading), so it shadows more spots, not fewer. From
the tent's node the base is reached; from spots behind the mast inside the plant reach, (2143.0, 104.6, 2038.8)
among them, it is refused, and from more of them once the tower has died. **So, by this reading, the original also
leaves the SEAL base standing for a bomb planted behind the mast.** The round is the planters' all the same: its
result is the bomb's state 5 (PF-14b, 214 s1), not the base's death. What would prove it: a capture of the original
planting south-east of the mast. The list's own order is `BLAST_LIST_ORDER_PLACEHOLDER` (209 §14). A base that falls
whatever stands between would be a preference the original does not support: an owner row if one is asked for, not
code. *Was* (PR #405 as opened, 2026-10-19/20, never on `main`): `BASE_BLAST_LINE_PLACEHOLDER`, which let a
`destroy_*_base` skip the gate by animation name when its box was inside the radius, and called the original's MP12
outcome unread; dropped, as `FUN_003c80e0` has no branch by target kind (its one gate-wide skip is the round's
`IgnoreExplosionDI`, D:L319096). Tests: `central/test/roomBombRuins.parity.test.ts` (the disc's MP12: the tent's node
reaches the base; the spot behind the mast is refused by `di3`, then by `di2` after the tower's program; the round
still the planters'), and `central/test/roomBomb.test.ts`'s synthetic STONE wall on the ray (no data: the base
refused, the wall dead, a crate behind it standing, the round the planters').

**The reset.** `MapMeta.initial` covers both bases' nodes. `healthy` is saved active (bit 28). `whats_left`, `parts`
and each `part1..15` are deactivated at initialisation and saved (part *n* also saves its transform and parent). So
`WorldState.reset` lays them back at the next round with `SceneHealth.reset` (health 2, unspent), and the bomb is back
at StartBomb (state 1). The Frostfire-pane gap (209 s13, a reference saved for its first placement only) does not
arise: each base is placed once, under its own root.

**StartBomb.** XR-05 computed `SimMap.bombStart` (`simMap.ts` `bombStartOf`). XR-08 pins it on the fixture: named point
`StartBomb`, sub-map 0 `ground`, cell (95, 112), cell word 0x83c1fe41, `aiCellY` 47.334, centre (1279.762, 1446.111).
The server's parse and the page's `loadMap` agree (`BOMB_GROUND_READING`, XR-05's; 173 s2).

**Owner row** (an unnumbered draft; the controller carries it to `HUMAN_TASKS.md` at the main merge, numbered after
sprint 17): standing on the bomb at detonation hurts you, since BOMB-DAMAGE (2026-10-16, research 332; H107 answered).
*Was:* "does not hurt you yet (PF.R32)".

Tests: `central/test/roomBomb.test.ts`, "detonation at terrorist_tent runs destroy_terrorist_base through blastAt at
MPBOMB's 50 / 30 (shield 21, HP 2): basedi and healthy off, whats_left on in the next env; the SEAL base stands; a C4
(18) at the base is refused", "the detonation hurts the players in MPBOMB's reach through the blast's player path --
the defender and the planter, friendly fire off -- each death the victim's own; the planting side still wins" (was "no
player is hurt by the bomb's blast this sprint", until 2026-10-16) and
"the next round restores the base (saved references) with the bomb"; `viewer/test/sceneHealth.parity.test.ts`,
"Crossroads' two bases are the kind-3 blocks on basedi, 2 / 0 / 21; the bomb's 50 qualifies, C4's 18 does not";
`viewer/test/simMap.test.ts`, "MP72's StartBomb is cell (95,112) of submap 0 'ground': (1279.762, 47.334, 1446.111)
from the cell word 0x83c1fe41 (173 s2; BOMB_GROUND_READING)" (registry `world.crossroads.base-destroyed-by-bomb`,
`world.crossroads.start-bomb-grounded`).

## 6. Readings and placeholders

| Name | What it stands for | Settles it | Status |
|---|---|---|---|
| `BRIDGE_FIRE_WEAPON_READING` (`viewer/src/worldState.ts`, `match/src/room.ts`: the host's `fireWeapon` fall-through) | what a bridge's (and a base's) `FIRE_WEAPON` does to a player: the reading is that +0x8c is the round's fuse (0.001 s, counted only with +4 bit 2 set or offline, D:L316893-316895, D:L107303) and +0x90 a post-impact phase timer (0.01 s), not a damage scale (s2.2); MPBOMB's 50 / 30 u, its falloff, occlusion and attribution are untraced, and no blast is built (PF.R32): XR-04's host ignores the command. Narrowed 2026-10-16 (research 332 §1.2, §2): the fuse counts online too (the pool round's `PostTick`), and the explosion meets the bodies as the bomb's -- the build and a switch's round's owner are open | capture B item 3; a trace of `FUN_003c8740` on | open; narrowed 2026-10-16 (research 332); in code since XR-04 (s4); **retired 2026-11-07** (V13-3b, research 386 §3.2: the room fires the round, LATER 63 built) |
| `DEBRIS_NODE_READING` (`viewer/src/worldState.ts`) | `'saveParent'`: a node whose reference saves its parent (bit 29, `MapInitial.saveParent`) is flown debris -- the arches' `part_1..15`, the bases' crate parts -- and a silent run never turns one on (PF.R29; s2.1, s4) | that every save-parent node is presentation, read on Crossroads only; capture B item 12 (what a joiner sees of the debris) | open |
| `COMMON_EFFECT_CALL_READING` (`viewer/src/worldState.ts`) | `'callerRoot'`: a `CALL_ANIMATION` the map's set lacks (`fire_explode_med`, `dust_explode_long`: `CZANIM`'s) goes to the page's `call` hook at the calling program's root, on a presentation run only; the command's own node byte (ref 3 `damage_point`) and its +0x18 f32 (30 up) are not decoded (s2.1, s4) | a read of `CALL_ANIMATION`'s payload (`FUN_0025d5c0`); capture B item 2 (where the fire and dust stand) | open |
| `SWITCH_REACH_POINT_PLACEHOLDER` (*note only*; PLANT-AIM's review F5, 2026-11-02) | the switches' reach (XR-04, `actionReachNote`, `useAction`) is measured from the feet; the original's `FUN_005aa240` measures every action's from the actor's position plus `+0x14b0`, the posed firepoint's offset (D:L463874-463881) -- the plant's is `PLANT_PICK_FIREPOINT_READING` (research 214 §2) -- so the port's switch reach is about 9 u short ahead of a standing SEAL. Not changed: no constant stands for it yet | an RDRAM read of `actor+0x14b0` (research 217 §1.3) and capture A's switch from its reach's edge | open, note only |
| `SWITCH_PREDICT_ADAPTATION` (`viewer/src/actionPage.ts`; P8, 2026-11-02; a network adaptation, reading, pending review) | `'predicted'`: no original value -- the original runs a switch's use on the pressing console (`FUN_002b44e0` from `FUN_00592d50`'s 0x2000 branch, D:L452002-452022, D:L156787-156865; logged by `FUN_002bb5b0`, D:L156852; research 92 s1); the page presents its own press at once and the room's word settles it (s4, "The press, predicted"). Costs: a refused press's sounds up to the word were heard (the owner's Q7) and its common effects are not taken back; a second press while one waits is sent unpredicted | no original to settle; retired if the room's authority moves to the presser | adaptation |
| `BRIDGE_LABELS_READING` (*note only*) | which arch is Fish Market and which Red Room: unassigned; the code keeps the authored ids `seal_demo_1` / `terrorist_demo_1` | capture B item 1 | open, note only |
| `PLANT_PLACEMENT_CANCEL_READING` | a release inside the 2.25 s placement: PF.R30 rules `'runs-to-completion'`; the planter's death or leave cancels | capture B item 7b/7c (script written here) | in code: viewer `net/objective.ts` (XR-05, research 214 s6); open |
| `DEM_SAME_TICK_READING` | a plant on the clock's last tick stops the time-out; a defuse on the fuse's tick defuses (PF.R28) | capture B items 8 and 10 (script written here) | in code: viewer `net/objective.ts` (XR-05, research 214 s6); open |
| `MPBOMB_PLAYER_BLAST_PLACEHOLDER` (retired; was viewer `net/objective.ts`; XR-05's row, research 214 s6) | was `'none'`: the detonation hurts no player (PF.R32). XR-08's `bombBlast` reached the scene only (s5) and never called `blast()`'s player loop | capture B item 9 | retired 2026-10-16 (BOMB-DAMAGE, research 332): `MPBOMB_BLAST_OWNER_READING` |
| `SCENE_BLAST_REACH_PLACEHOLDER` (viewer `sceneHealth.ts`; MAP-06's row, research 209) | PF.R11's reach: XR-08's detonation goes through it (`sceneBlast`). AD-5 (2026-10-16, 209 §13): the base takes 50 x 14 at its basedi's midpoint, 18.89 u from the planted bomb, its health floored at 0, through `FUN_003c80e0`'s material gate (`blastLine`); a base falls with the bomb out to 237 u (0.79 of 300 u). *Was:* "the full 50 against health 2 kills at any falloff, so the rule decides reach only" (s5) | a trace of the blast's path to the damage interface (173 s3); H102 | open; kept (H102), cross-reference |
| `BOMB_GROUND_READING` (viewer `net/objective.ts`; XR-05's row, research 214 s6) | `'cellY'`: StartBomb at its AI cell's quantised height, pinned by XR-08 on the fixture: cell (95, 112) of `ground`, word 0x83c1fe41, y 47.334 (s5) | capture B items 5, 11 and 15 (RDRAM: the bomb node's position) | open; cross-reference, the row is 214 s6's |
| `SCENE_ROUND_TEAM_KILL_SCORE_READING` (match `room.ts`; WM-SWITCH, 2026-11-15) | `-2`: the score a switch's blast books its presser for a teammate it kills -- the room's ordinary team kill (`FUN_00545c10` D:L411864-411865; r0004 0x54a684), not applied apart; with the press's own points (2, `FUN_00545530`) the room nets 0 over the press and the kill where Q18 (b) (friendly fire off) and both Q18-b2 runs (friendly fire on, the round going on) read the presser's round score 0 -> -1 (the original running, r0004, MP72, 2026-11-15; `gate-runner/shadow/out/2026-11-15/q10-hitreg/q18-bridge-counters/`, `score.txt`, `b2-files.zip`) (§2.2) | a taken press with no one in the blast (no kill), the presser's counters polled through it, or polls under 100 ms apart between the press and the victim's health reaching 0 (Q18's per-poll rows, read 2026-11-15, do not settle it, §2.2); an enemy kill by the switch in a round that goes on | open: the room's value is the source's, kept (the controller, 2026-11-15); every captured switch case is one under the room -- Q18 (a) 3 against 4, Q18 (b) and Q18-b2's two runs (friendly fire on, the round going on) -1 against 0 -- so the gap is in what the press is worth with that kill, not in the -2; Q23 leg 5's grenade nets 0 over a kill and a team kill, fitting the source's +2 and -2 (§2.2) |
| `BLAST_LIST_ORDER_PLACEHOLDER` (viewer `sceneHealth.ts`; MAP-06's row, research 209) | the order the explosion's list is walked in: the port asks `SceneHealth.list` in the map's binding order, a death run before the next target's ray (`FUN_003c7ee0` D:L319007-319073, `FUN_003c7dd0` D:L318999); on MP12 it does not decide the SEAL base behind the mast (s5) | a trace of `FUN_003c7ee0`'s list order | open; cross-reference, the row is 209 §14's. *Was* (PR #405 as opened, never on `main`): `BASE_BLAST_LINE_PLACEHOLDER`, dropped 2026-10-22 (s5) |

owner row (unnumbered draft, XR-08; the controller numbers it at the main merge after sprint 17): standing on the bomb at detonation hurts you, since BOMB-DAMAGE (2026-10-16, research 332; H107 answered). *Was:* "does not hurt you yet (PF.R32)".
