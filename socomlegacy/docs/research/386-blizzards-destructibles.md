# 386 -- Blizzard's destructibles: the two outhouses and the three snow windows (V13-3a/3b)

- Date: 2026-11-07. Tasks V13-3a (the reading) and V13-3b (the outhouse's build) of the v0.4.13 plan
  (`docs/plans/2026-11-07-v0413-maps-and-destruction.md`, on `agent/v0413-plan`, PR #723 -- not on `main` when this was
  written, so this note's own Log (§9) carries the task's record). Branch `agent/v13-3a`.
- Track: simulation. It reads what the original does with MP1's `outhouse1/2` and `snow_window01..03` and changes three
  things the port does, each on the common path for every map: the room refuses a door whose node is off (§4); a scene
  program's `FIRE_WEAPON` round goes off in the room (§3.2; LATER 63); a `CALL_ANIMATION`'s caller node is the callee's
  `NODE_CALLER` (§3.3).
- Status: **reading, pending review.** Nothing here is measured running: no capture of the original shows an outhouse
  blown or a window broken (H421 asks for one). Every disc value below was read through the repository's readers
  (`@s2u/scene` `parseAnimSets`, `decodeEffectProgram`; viewer `loadSimMap`) on `RUN/MP1.ZDB`'s `MZANIM.ZAR`, set
  `mission`; the code is cited `FUN_<addr>` / `D:L<line>` of `game/analysis/socom2_game.elf.decomp.c`. No decompiled
  text is pasted.
- Sources beside the disc and the decompilation: research 173 §5 (the inventory and a proposal -- not a reading of what
  the game does), 376 §3 (r0004's two outhouse bits), 209 §13-§14 and 210 §6-§8 (the common destructible path), 213
  §2.1-§2.2 and 332 §2 (the scene's `FIRE_WEAPON`), 149 R149.2 (`NODE_CALLER`), 230 §5.2.5 (the collision visitor's gate),
  179 (the action pick), 174 §3 (the weapons' ratings), the readiness report
  (`agent-mail/evidence/readiness-mp1-mp12/REPORT.md`, `DESK-CHECK.md`: "NOT BUILT").

## 0. The answers

| # | What | The original (the reading) | The port at `ad1e2ed3a` | This task |
|---|---|---|---|---|
| A1 | Do the five bind? | yes: state 1, flags 0x23 (`isDestructibleAnim`, `FUN_002713f0` D:L119312-119335); outhouses HP 1 / shield 10 / armour 0 on child `hitthecan` (node reference 2); windows HP 0 / shield 0 on their roots | the same (`sceneOf`) | pinned (dev disc) |
| A2 | What breaks a window | anything that reaches it: shield 0 passes every rating (`FUN_003c7490` D:L318622), and HP 0 is "at or below 0 after the hit" (`FUN_00273a50` D:L120978-121059) -- a hit trigger; a blast whose reach gate passes (`FUN_003c80e0`) the same; never a C4 target (`FUN_002739b0`: HP above 0) | the same (`hitAt`, `blastAt`, `accepts`) | pinned |
| A3 | What a window does when it breaks | `.GLS_BRK_MD` at its root, a `DESTRUCTION_SOURCE` at its root, its root off (both polygons out of collision, sight and the drawing) | the same; the fragments are `GLASS_FRAGMENTS_PLACEHOLDER` (nothing drawn) | pinned |
| A4 | What breaks an outhouse | a round or blast on `hitthecan`'s polygons (28 of the root's 57; `base`'s 29 take nothing) whose rating plus modifier reaches 10: the M67's 10, the RPG's 20 and C4's 18 qualify, the M4A1's 2.6 does not (174 §3; C4 is disabled in MP1's armory, 173 §5) | the same | pinned (9 refused, 10 kills) |
| A5 | What the outhouse's death does | `outhousedoor1/2` (the door's node off), `hitthecan` off, `vishealthy` off, `toilet` on, a `C4 Ammo` round fired at `toilet`, fifteen calls of `toilet_flypart1/2`, each on its own `partN` (§3) | the node changes, on the wire; **no** C4 round (LATER 63); the parts never fly or go (§3.3) | **built**: the C4 round goes off a tick on at the toilet (blast, effects, sound; §3.2); each part fades from 1 s and is off at ~2 s (§3.3). Not built: the parts' flight (§3.3) |
| A6 | The door after the blow | its node off: no pick reaches it, so no console swings it (§4) | the page could not pick it; **the room swung it** on any packet | **built**: the room refuses (`door: inactive`) |
| A7 | The reset | every node a reference saves comes back: `hitthecan`, `vishealthy`, `base`, `visbase`, the door's node (active and transform) on, `toilet` off (saved after its opening deactivation), each window on | the same (`WorldState.reset`) | pinned |
| A8 | The wire | the room decides; the node states travel in `EnvWire` (`SCENE_DEATH_ON_WIRE_READING`); r0004's broadcast and authority bits are moot (376 §3) | the same | cited |

## 1. The five blocks on the disc

`RUN/MP1.ZDB` -> `MZANIM.ZAR`, set `mission`, read with `parseAnimSets` (the `Anim_Params` and `Anim_Health` keys) and
`decodeEffectProgram`; placed through `loadSimMap` (`MapMeta.scene`):

| Animation | state / flags | HP / reset | shield | armour | node ref | bound target (placed) |
|---|---|---|---:|---:|---:|---|
| `outhouse1` | 1 / 0x23 | 1 / 1 | 10 | 0 | 2 (`hitthecan`) | `worldmodel/outhouse1/alaska4d_outhouse_nodoor_2=alaska4d_outhouse_nodoor_2/hitthecan` |
| `outhouse2` | 1 / 0x23 | 1 / 1 | 10 | 0 | 2 (`hitthecan`) | the same under `worldmodel/outhouse2` |
| `snow_window01..03` | 1 / 0x23 | 0 / 0 | 0 | 0 | 1 (the root) | `worldmodel/snow_window01..03` |

`hitthecan`'s collision owners are the node itself (10 polygons) and `hit1..hit3` under it (2, 11, 5): 28; `base`
carries 29. Each window root owns two polygons. Nothing else on MP1 binds under these names (the probe's list held
exactly these five; `unplaced` empty). The flags are r0001's; r0004 sets bits 4 and 3 on the outhouses (0x3b, 376 §3).

## 2. The windows' sequence

One sequence of three commands (each window alike): `SOUND .GLS_BRK_MD` at node -7 (flags 0x82, volume 1),
`DESTRUCTION_SOURCE` at node -7, `OBJECT_ACTIVE_STATE` node -7 off. Node -7 is `NODE_ROOT` (`@s2u/scene` `effects.ts`
`NODE_ROOT = -7`), the animation's own root reference -- the window -- **not** a context node: research 173 §5's "context
node -7" is corrected here. The port runs it as read: in the room the root goes off (on the wire); a page that takes the
death off the wire plays the sound at the window node's world origin (`SCENE_SOUND_PLACE_READING`; until 2026-11-10 the polygons' box centre) and logs the
`DESTRUCTION_SOURCE` (`GLASS_FRAGMENTS_PLACEHOLDER`: its payload past the node byte is not decoded, so no fragments are
drawn). The window reference's word 0x10000100 saves the active state (bit 28), so the reset puts the pane back.

## 3. The outhouse's sequence

Twenty commands, one sequence, in order (decoded; the raw command bytes read through `ZAnimCommand.bytes`):

1. `CALL_ANIMATION outhousedoor1` (`outhousedoor2` for the second): that animation's one command turns its root
   reference `door_outhouse1` off (word 0x10000100).
2. `OBJECT_ACTIVE_STATE` node 2 (`hitthecan`) off; node 3 (`vishealthy`) off; node 4 (`toilet`) on.
3. `FIRE_WEAPON` weapon `c4`, ammo `C4 Ammo`, at node 4 (`toilet`), floats 0.001 and 0.01 (the round's fuse and its
   second timer, research 213 §2.2 as corrected by 332 §1.2).
4. Fifteen `CALL_ANIMATION toilet_flypart1` (`_flypart2`), 20 bytes each, flags 0x0d, their +9 and +10 bytes naming node
   references 5..19 -- `part1` .. `part15`, one each.

### 3.1 The node changes (built, pinned)

The room runs the sequence through its world (`SceneHealth.apply` -> `WorldState.runProgram`): door node, `hitthecan`,
`vishealthy` off and `toilet` on, all four on the wire. `toilet`'s reference (0x90080500: bit 31 deactivates at load,
bit 28 saves) keeps it off until the death and off again at the reset. The dev-disc pin is
`match/test/blizzardDestructibles.devdisc.test.ts` (and, before this task, `viewer/test/sceneObjectsR0004.test.ts`'s
MP1 case).

### 3.2 The C4 round (built; LATER 63)

`FIRE_WEAPON` (`FUN_0025ccb0`, D:L107153-107326) fires the `C4 Ammo` record's round at the toilet: by research 332
§1.1-§1.3 the same pool round and body path as the bomb's -- started at its node's world position (D:L107229-107244), its
fuse +0x8c the command's 0.001 s and its second timer +0x90 0.01 s (D:L107312-107316), counted online too (`FUN_003c9fb0`
D:L320127-320129, 332 §1.2), so it goes off on the next game frame and its explosion meets the bodies and the scene's
destructibles as the bomb's (`FUN_003c7dd0` D:L318992). Its owner is the console's own SEAL (`FUN_002b3580`, D:L107285)
unless the program's context holds a type-9 entry (D:L107286-107297): `SCENE_ROUND_OWNER_READING` = `'victim'` (§8).
The values are C4 Ammo's own, read by the room's kit table from `RUN/ZWEAPON.ZAR` (`zweapon.rdr`; research 174 §3,
182): `Explosion_Damage` 18, `Explosion_Radius` 5 m = 50 u, `IgnoreExplosionDI` set (research 235 §1).

**Built (V13-3b), for every map's programs:** the world hands a non-presentation run's `FIRE_WEAPON` to its `fire` hook
(`WorldHooks.fire`; a page's presentation run fires none, PF.R26); the room (`Room.sceneRound`) places it at the node's
world matrix (`MapMeta.fireNodes`, from `flattenScene`) through the command's offset, queues it for its fuse (at least one
tick), and at that tick (`fireSceneRounds`) blasts the players (`blastPlayers`, each his own), the hostages, the resting
charges and the scene (`sceneBlast`), and tells every page (`sceneRound { kind, at }`); the page explodes a copy of the
item's round there (`GrenadeThrower.fireScene`: its trigger set, so `explode` plays the record's effects and sound, no
page blast). A round on its fuse is dropped at the round's reset (`clearAir`). The weapon is matched case aside (the
command names `c4`, the arsenal `C4`). This retires `BRIDGE_FIRE_WEAPON_READING` and builds LATER 63: Crossroads'
bridges' and the bases' `MPBOMB` rounds go off the same way (each at its node; the bomb's own `base_explosion1` is not
the room's world's and is unchanged).

**What else now goes off (the reviews of `c35cce894` F2 and of `be41a797a` A-D; pinned in
`match/test/sceneRoundsCrossroads.devdisc.test.ts` and `blizzardDestructibles.devdisc.test.ts`).**
- *The terrorist base, on every Demolition map read.* `destroy_terrorist_base` opens on `FIRE_WEAPON MPBOMB` /
  `MPBOMB Ammo` (fuse 0.001) at its `healthy` node, then `WAIT 0.15`, then the model swap (research 332 §2); its round
  therefore goes off with the healthy hull still there (pinned: the healthy node still active when the round is told).
  `destroy_seal_base` fires none. Read one map at a time through `loadSimMap` (the node's world origin; the hull's
  surfaces over it):

  | Map | node y | surfaces over the node (lowest first, near it) |
  |---|---:|---|
  | MP1 Blizzard | 97.405 | 97.395, 97.705 (0.3 u under the deck's top) |
  | MP7 | 90.000 | 90.000, 90.300 |
  | MP9 | 4.500 | 4.500, 4.800 |
  | MP12 The Ruins | 104.000 | 104.000, 104.600 |
  | MP72 Crossroads | 13.812 | 14.300 (0.5 u under it) |
  | MP83 | 87.000 | 87.000, 87.522 |

  Each node sits at the bottom of (or under) the base's own floor slab. **The blast's line to a head is one-sided**
  (the review's A, read): `FUN_005ac070` queues the line from the round (+0x48) to the body (D:L464853) through
  `FUN_0031dd90`; the batch runs it under `FUN_002d3030` (class 0), which sets the crossing mode `DAT_003df270` from the
  collider's +0x80 bit 1 (D:L175276-175281) -- 0x20 for the hull's colliders, whose bit 1 `FUN_00316e30` clears
  (D:L215827-215828) -- and the micro's 0x20 mode meets a face only from its front (research 281 §4.3, micro 288-333,
  reviewed by LATER 250). So a round under an upward-facing floor is not stopped by it: the blast's line to a head
  (`blastSeen`) is now one-sided (`segmentHits`' `frontOnly`) for every blast. Two lines run in the same batch and so
  are one-sided in the original by the same reading, but stay two-sided in the port, named for the controller: the
  blast's line to a destructible (`blastLine`, `FUN_003c80e0` via `FUN_003c7ee0` D:L319056;
  `BLAST_REACH_LINE_SIDES_READING`, §8 -- made one-sided it re-pinned B194's base-reach sweeps on every Demolition map
  (more spots reach: e.g. M53's vases 127-174 -> 160-190 of 192, MP12's bases 134/144 -> 192/174), opened Vigilance's
  access4 and access5 from their witness spots (AD-5's pin) and needed the room's one-faced barrier fixtures given back
  faces, so it was not landed here) and a round's own segment (`BULLET_LINE_ONE_SIDED_READING`, §8).
  Many disc faces have no back face (review 3's count of near-vertical faces with no opposite face within 40 u: MP2
  449/1868, MP7 1102/2620, MP51 2221/4772, MP72 1719/6976): a blast from behind such a face now passes it, as the
  original's does by this reading (a capture of a grenade behind MP72's one-faced `b1_wc05` settles it, H421). Pinned: on MP72 a body 160 u south of the base is reached
  by the bomb's blast and again by the base's round (two `blast` events), and the base's round alone takes 178 -> 170
  off it (random 0.01); on MP1 the base's round alone takes 178 -> 170 off a body 30 u east on the surface at 96.395.
  The round does not reach everywhere around a base: review 3's probe (heads 60 u out, 50 u up, four directions, the
  raw grid) found MP1, MP7, MP9, MP12 and MP72 blocked in all four (the base's own `healthy/basedi` met from inside, or
  MP1's deck underside) and MP83 reached east and west only; the pins are the spots above. MP7's, MP9's, MP12's and
  MP83's node heights (the table) are measured, not pinned.
  A player it kills dies his own death (`SCENE_ROUND_OWNER_READING`).
  By this reading the base's round also plays `satchel` and its sound (`.MK138_SAT_CHRG`) a second time after the
  bomb's own: the same detonation (`FUN_003c8330`) starts the record's explosion animation for any round at
  D:L319245-319246 (research 332 §7), so a page sees two (`demolitionBlast.spec.ts`, MP7; reading, pending review, no
  capture yet).
- *Crossroads' bridges.* Each switch (`seal_demo_site1` / `terrorist_demo_site1`) fires MPBOMB at the arch's
  `damage_point2`, then 0.1 s on at `damage_point` (research 213 §2.1-§2.2). Pinned for both switches: exactly the two
  rounds, at those two points in that order; a body on the ground 200 u off takes exactly both (no fragment drawn at
  random 0.5: 178 kept), one 20 u off dies of the first (178 -> 8);
  the presser at the switch, over 300 u from both points, is not reached. The arch's fall itself deals no damage in the
  port (only the two rounds do); whether the original's swap to the fallen arch hurts a body inside it is not read
  (`ARCH_FALL_DAMAGE_READING`, §8). Who owns a switch's round stays unread (`SCENE_ROUND_OWNER_READING`).
- *Not read by `sceneRound`:* FIRE_WEAPON's flag 2 (`atContext`, the context's position added) and its +10 flag (read by
  `FUN_003c82f0`, per the review). The outhouses' commands carry neither (byte +4 is 0x00); the review found no
  consumer on these maps (`FIRE_WEAPON_FLAGS_UNREAD_READING`, §8).
- *A round at the context root (DF-5, 2026-11-08; reading, its review PASS WITH FINDINGS, high, `agent-mail/evidence/dg-fishhook-readiness-2026-11-08/REVIEW-DF-5-1.md`).* `FUN_0025ccb0` hands the command's i8 +8
  to `FUN_0026f4e0` (D:L107229-107230) and starts the round at the node it answers (`FUN_00310980`, D:L107232). For
  0xf9 (-7, `NODE_ROOT`) `FUN_0026f4e0` answers the context's instance (+0x3c), else the node reference at the
  animation's root index (byte +1; D:L118170-118180): the program's own root, the placement its run is on. Desert Glory's
  `destroy_fuel1/2` (read through `readMapMeta` / `loadSimMap` on the `RUN/MP6.ZDB` fixture) fire `exploding_fuel` /
  `explosive_stuff` at -7 (f1 0.001, f2 0.01), their roots `worldmodel/barrel_fuel1` / `barrel_fuel2`. The world
  already resolved -7 to the run's root (`WorldState`'s `at`), but `MapMeta.fireNodes` held named nodes only (`op.node
  > 0`), so `Room.sceneRound` found no matrix for the root's path and dropped the round. **Built, for every map:**
  `fireNodeNames` (viewer `mapMeta.ts`) names the program's root reference for a round at -7, so `fireNodes` carries each
  placement of it and the room fires at the root's world matrix; the room is unchanged. -6 (`NODE_CALLER`, 0xfa,
  D:L118164-118169) is the context's caller, not a node of the program, and still names none: a room-world round at
  the caller fires nothing (the bomb's `base_explosion1` is not the room's world's, above). The room's matrix is the
  placement's (`flattenScene`); where a program whose root is placed moves it before it fires, the round goes off at
  the placed position, not the moved one (`FIRE_ROOT_PLACED_MATRIX_READING`, §8). Breach's `knockdown_everything`
  (research 174:228; MP61/MP62) is not such a program: its root index is 0 and its node table empty, so
  `fireNodeNames` names nothing and the room still drops its round -- in the original -7 resolves there through the
  +0x3c instance the calling `CALL_ANIMATION` hands over (D:L118170-118172), which the port does not model (Breach is
  not offered). Pinned: `viewer/test/mapMetaFireRoot.test.ts` (synthetic: -7 names the
  root, a named node its own, 0 and -6 none; MP6's fixture: both barrels' roots and the gastank in `fireNodes` with their
  `flattenScene` matrices) and `match/test/sceneRoundsDesertGlory.test.ts` (MP6's fixture: each barrel's death queues
  `exploding_fuel` at its own root's origin, told on the wire a tick on; the gastank's `node=gastank` round unchanged).
- *Whether a weapon kills a barrel (DF-5; reading, DF-5's review).* Each barrel's block reads health 150 behind shield
  150 (research 175 §5.1). `FUN_00273a50` runs the program only at health <= 0 after the hit, or on any hit when the
  animation's damage sequence offset (`+0x10`, reCOM's `_zanim_anim_params.m_damage_seq_offset`) is set
  (D:L120980-120992); both barrels' offsets read 0 (`Anim_Params` `seqOffsets`). The health moves only when the rating
  plus the weapon's modifier reaches the shield (`FUN_003c7490` D:L318606-318622). Over `RUN/ZWEAPON.ZAR`'s
  `zweapon.rdr` (fixture) the highest rating is MPBOMB Ammo's `Explosion_Damage` 50 and the highest `Damage_Modifier`
  0.4 (SR-25): 50.4 < 150; r0004 edits no MP6 shield (`R0004_SHIELD_EDITS`); no program of the set calls
  `destroy_fuel1/2` and no action executes them. So in the original, by this reading, no weapon blows a barrel and its
  round never fires in play: a finding, said, not fixed (`FUEL_BARREL_UNREACHABLE_READING`, §8). The test drives the
  death with a hit of rating 150 (an instrument) to show where the round goes. The question the readiness report asked
  -- whether an armory rating reaches the FIRE_WEAPON round's damage -- is the same gate: the round's own `exploding_fuel`
  rates 8 (research 174:266), under the shield too.

### 3.3 The flying parts (the context node built; the flight not)

`CALL_ANIMATION`'s begin, `FUN_0025d5c0`: flag bit 2 resolves the node at +9 (`FUN_0026f4e0`) and hands it to the callee
as a type-3 context entry (`FUN_00272a60(.., 3, node)`, D:L107605-107613); flag bit 3 resolves the node at +10 and takes
its world position (`FUN_00310980`, D:L107620-107629) for the call; bit 0 copies the caller's inputs (research
106, D:L107577-107592). The callee's `NODE_CALLER` (-6) is answered from the type-3 context (D:L118164-118168; research
149 R149.2). `FUN_00272390` answers -6 with the **first** type-3 entry of the run's context list (D:L118164-118168),
so the part is the callee's caller only while the calling run's own context holds no type-3 entry ahead of it. A
destructible's death starts its program (`FUN_00273a50`, D:L121010-121060, its `FUN_00272bb0` calls) with entries of
types 2 (the node), 6 and 5 only: no type 3, and no type 9 either -- which also settles the death half of
`SCENE_ROUND_OWNER_READING` (a death's round is the console's own SEAL's; a switch's stays unread). So each of the
fifteen calls runs `toilet_flypart1` with **its own `partN` as -6**. `toilet_flypart1`'s
sequences, decoded: `OBJECT_DELETE_CHILD` (54) and `OBJECT_ADD_CHILD` (53) -- by name only (376 §4) -- around a
rotate/translate of -6, an `OBJECT_MOTION` of -6 (launch azimuth 0 +/- 350, zenith 35 +/- 55, speed 50 +/- 80, gravity
1, bounce 0.3); a second sequence: wait 1 s, opacity 1 -> 0 over 1 s, -6 off, opacity back to 1; two more: at a 25%
chance each, `gas_fire1` and `gen_smoke1` particles following -6. So in the original the parts fly out, burn or smoke,
fade and are gone about two seconds after the blow.

Was (to V13-3b): the port's `call` passed its own caller on, so -6 was the outhouse's `hitthecan` in every flypart run
and the fifteen parts stood drawn at rest under the toilet until the reset. **Built (V13-3b):** `decodeEffectOp` reads
flag 4's node (+9) as `caller` and flag 8's (+10) as `place`; the world's `call` hands the callee the placed `caller` as
its `NODE_CALLER` (none when it names no placed node: no entry is made). So in the room each part fades from 1 s and is
off at ~2 s, on the wire, and every page hides it; a page's presentation run fades it (`opacity`). Dev-disc pins
(`match/test/sceneDebris.devdisc.test.ts`): MP1's fifteen parts on at 1.9 s, off at 2.2 s; MP6's `hit_crate01` nine
parts (`crate_part_fly`: wait 2 s, a 2 s fade, off) on at 3.9 s, off at 4.2 s; MP12's `tower_hitme` names part1..3 and
`tower_part_fly` only flies them (no fade, no off), so nothing changes there. **The flight is not built**:
`OBJECT_MOTION` on a placed map node has no consumer (the effects player flies only its own spawned objects, the
casings), so a part stands where it is until it goes -- `SCENE_NODE_MOTION_PLACEHOLDER` (§8). The scope of the change,
before it was built: the same flags (0x0d, a node at +9) are on the
death calls of at least MP6's crates, pallets, bottles, tyres, barrels and truck, MP7's `ant_base1/2`, `sealtable1/2`
and `crate_hitme_now1..6`, MP9's shacks, depot and crates, MP12's `ant_base1` and `tower_hitme`, MP61's `coop_blast`,
MP73's `destroy_comm_wall` and M81's `fly_fuel1..3` (a byte scan of every `MZANIM.ZAR`'s `CALL_ANIMATION` flags,
2026-11-07; the callee names in that scan were read through the wrong name table and are not cited). The controller
(seat b6, 2026-11-07) sized it: build it on the common `call` path for every map, pinned on MP1, MP6 and MP12 (the three
re-read through the repository's readers, not the whole disc). Crossroads' arches call `flyparts` with flag 4 on the
`FOR_CHILDREN` variable (node 7): the parity pin now says so (`effects.parity.test.ts`).

### 3.4 After a reset (unknown)

The parts' references save nothing (no `MapInitial` entry for `part1..15`), so `FUN_002ac0e0`'s restore (D:L151976;
`FUN_0026b430`) gives them nothing back: in the original a part flown, reparented to the world and turned off in round 1
would, by this reading, stay off in round 2, and a second blow would show the toilet without its parts. Whether the
set's restart (`FUN_0026c600`) or `OBJECT_ADD_CHILD`'s own bookkeeping restores them is not read:
`OUTHOUSE_PARTS_RESET_PLACEHOLDER` (§8). The port now does the same: a part its flypart run turned off stays off at the reset (no saved reference); the
outset's `toilet` is off again, so nothing shows until a second blow, whose parts are already off.

### 3.5 The Ruins' antenna: the death told, the motion faded (V13-3c)

Craig, live v0.4.14 (2026-11-08): on The Ruins (MP12) the SEAL's bomb at `terrorist_tent` swaps the terrorist base, but
the small antenna beside it, `worldmodel/s_tower/ant_base1`, "did not change state" (the finding and its repro:
`viewer/test/ruinsBaseWire.test.ts`, `viewer/e2e/ruinsBaseBlast.spec.ts`). Read through `simMapFromBytes` (2026-11-08):

- `ant_base1`'s death program (flags 0x23): `CALL_ANIMATION spinner_hit`; `ant_good` off; `ant_parts` on; five
  `CALL_ANIMATION ant_part_fly1`, flags 0x0d, each naming `part1..5` at +9 (§3.3's caller node).
- `ant_part_fly1` (flags 0xa2): `OBJECT_DELETE_CHILD`, a rotate and a translate of -6, `OBJECT_ADD_CHILD`, and an
  `OBJECT_MOTION` of -6 (launch zenith 35 +/- 55, speed 80 +/- 60, gravity 1, bounce 0.3, lifetime 5 s). **No wait, no
  opacity and no off**: unlike `toilet_flypart1` (§3.3), the original never fades or turns a part off; the part flies
  and stays where it lands.
- `spinner_hit` (root `spinner_ant`): `STOP_ANIMATION spinner_ant_start` (the autostart spin, an `OBJECT_MOTION` with an
  angular velocity, looped), `SOUND .BUL_MET_PING_M` at its root, an `OBJECT_MOTION` of -7 (`spinner_ant`, lifetime 4 s,
  gravity 1), `INVALIDATE_ANIMATION`.
- `ant_good` holds the nine collision polygons and no model; the drawn mast is `ant_parts`' five parts and
  `spinner_ant`'s `spinner_vis`. So the original's visible change is motion only, and the port drew none of it.

Two gaps, both built:

1. **The page never heard the death.** `SCENE_DEATH_ON_WIRE_READING` 'targetOff' takes a death from the wire only when
   its target goes off; `ant_base1`'s target is its own root, which stays on (research 210 §7, "its limit", names MP12).
   The original's own path for a flagged scene death is a told death, not a state: `FUN_002734b0` (D:L120782-120797)
   builds a type-8 record naming the animation and hands it to `DAT_00414bfc` = `FUN_002bb880`, which online sends
   message 0x40 to every console (research 376 §3) -- for the animations whose flag bit 4 is set (r0004 sets it on MP1's
   outhouses). `ant_base1` (0x23) has no bit 4: there every console kills its own copy from the replicated blast. The
   port's room is the one authority (`SCENE_DEATH_AUTHORITY_READING`), so it tells both kinds the same way: each death
   its world runs (`WorldHooks.died`, from `SceneHealth`'s hit or blast) goes to every page as `{ type: 'sceneDeath',
   id, epoch }` (additive under protocol 13), and a joiner's welcome names the round's dead (`sceneDead`, taken
   silently: `JOIN_SILENT_READING`). The page takes it (`NetClient.takeSceneDeath` -> `applySceneDeath` ->
   `WorldState.takeDeath`): the record spent and its program run for presentation (PF.R26). The state inference stays
   for a state with no told death (a `.s2r` recorded before this). The reading is renamed in value only:
   `SCENE_DEATH_ON_WIRE_READING` = `'targetOffOrTold'` (§8; research 210 §7). The replay plays a told death live and does
   not fold it on a seek (`fold.ts`: transient).
2. **The motion is not drawn.** `SCENE_NODE_MOTION_PLACEHOLDER` (§8; now a constant, viewer `worldState.ts`): where
   the program that moves a placed node never turns it off itself, a page's presentation run draws, in the flight's
   stead, the node fading from 1 to 0 over the motion's own `lifetime` and gone from the drawing at its end -- the
   page's drawing only (`WorldState.drawn`; the world's flags, the room's and the wire's, untouched), drawn back at the
   round's reset. So on a page the five parts fade over 5 s and `spinner_ant` (with `spinner_vis`) over 4 s, and the
   mast is gone. **A flight only** (the review's F1): the motion must carry a launch -- `MOTION.FIXED_LAUNCH` (0x8),
   `RANDOM_LAUNCH` (0x10) or `CALLER_VELOCITY` (0x800), the flags under which `effectMotion.ts`'s tick moves the node
   (`FLIGHT_FLAGS`); `ant_part_fly1` is 0x2d3, `spinner_hit`'s 0xaeb. A spin or a turn in place draws nothing: MP6's
   gas tank (`truck_stop_gas_hit` -> `truck_stop_hitme` -> `truck_rotate_parts`, flags 259 / 291: lifetime and angular,
   no launch, no off) leaves the truck drawn, as the original tips it and leaves it (`viewer/test/sceneMotionFadeDisc.test.ts`,
   dev disc; RED on `83307b4bd`: `body_truck` taken from the drawing), and the bases' `fire_effects` spin likewise.
   **Offline play** (the review's F2): the page's own death -- `SceneHealth.apply` on its own world, `skipEffects`
   false, not a presentation run -- takes the same fade (one line: the `motion` case asks only that the run be neither
   a display run nor silent; the room's runs are silent). **A joiner and a seek** (the review's F3): the welcome's
   `sceneDead` is taken silently and the replay fold keeps `sceneDeath` transient, so both still draw the mast standing;
   the original's joiner replays the death with `skip_effects` 1 and the motion is under no `IF skip_effects`, so its
   parts would be moved -- LATER 766. Where the program turns the node off (Blizzard's `toilet_flypart1`, MP6's `crate_part_fly`) nothing
   changes. The room's run, a display run (`spinner_ant_start`'s spin) and a joiner's silent death draw no fade. It also
   reaches MP12's comm tower (`tower_part_fly` only flies its three parts: they now fade on a page too) and every
   other death a page now hears whose part-fly holds no off. **Not the original's look**: the original's parts fly out
   and stay on the ground; the fade is the brief's chosen stand-in (V13-3c, seat b6, for Craig's ask that the mast
   visibly change), not a reading. `STOP_ANIMATION` on the page's run is not applied (the spin is not drawn either).

Tests: `viewer/test/ruinsBaseWire.test.ts` (dev disc; RED on `7d3f3a1e8`: no `sceneDeath` told), and
`viewer/test/sceneDeathTold.test.ts` (synthetic, no data: the room's `died`, the page's fade with and without the
program's own off, the joiner and the display run, the reset; RED on the same head: 3 failed).

## 4. The door after the blow (built)

The action button takes the node under the reticle and its ancestors (`FUN_005aa240` D:L463830-463905) from the
crosshair pick (`FUN_005aa6e0` D:L464097-464290, its ray query at D:L464123). The query, `FUN_0031e160`
(D:L220105-220119), runs `FUN_002d4780` (D:L220118), whose visitor `FUN_002d2890` tests the owner's `m_active` (`+0x5c`
bit 0) and `m_hasDI` first (D:L174789-174790; research 230 §5.2.5). A door whose node is off has no polygon the ray can
meet, so its action is never taken, on any console, until the reset turns it back on. 173 §5's requirement ("a
subsequent door packet must not reopen or re-enable it") is this.

The port: the page's `pickDoor` already passes no inactive owner (`segmentHits` -> `modelGate`); the room's `useDoor`,
which sees no view and checks the reach alone, swung the door on any packet -- a late one, a forged one, or a bot's
(bots press through the same `useDoor`). It now refuses a door whose spec node is off in its world, logged as
`door: inactive` (`tools/test/refusalMirrors.test.ts` lists its page mirror, `doors.ts:pickDoor`). The rule is the
door path's, for every map: any door whose node a program turns off. A door already open at the blow stays where it is,
off.

Not changed: the four other `door_outhouse3..6` (no outhouse controller, 173 §5) swing as before (pinned).

## 5. The reset

`FUN_002ac0e0` (D:L151976-151991) restores the saved references (`FUN_0026b430`) and the records (`FUN_00273960`,
`FUN_00273ee0`, D:L120884, D:L121071-121085). MP1's saved references (`MapMeta.initial`): `hitthecan`, `base`, `visbase`,
`vishealthy` (active), `toilet` (deactivated, active saved off), `door_outhouse1/2` (active and transform), the three
windows (active). The port's `WorldState.reset` does the same; pinned in the dev-disc test (the door used again after).

## 6. The wire and r0004

The room decides every scene death and its node states go out whole in `EnvWire` (`SCENE_DEATH_ON_WIRE_READING`); a
page takes the target off as the death and runs the sequence for presentation only (PF.R26). r0004's bits 4 and 3 on the
outhouses (376 §3: a broadcast of the death and an authority guard) are moot for the same reason. A joiner sees the
state, hears nothing (`skip_effects`).

## 7. Tests

- `packages/match/test/roomDoorBlown.test.ts` (new; synthetic, no disc): a door packet on a door whose node, or an
  ancestor, is off is refused and logged `door: inactive`; the other door swings; the node back on gives the door back.
  RED on `ad1e2ed3a` (2 failed: `doorUse` sent), GREEN after.
- `packages/match/test/blizzardDestructibles.devdisc.test.ts` (new; dev disc, skips without `SOCOM_DISC` /
  `SOCOM_PC_ROOT`): the five blocks as §1; each window dies on a round of 1 and its root goes off; each outhouse refuses
  9 and dies on 10, its four node changes on the wire; both blown doors refused, `door_outhouse3` swings; the reset
  restores every node and the door. RED on `ad1e2ed3a` at the blown door (accepted), GREEN after.
- `tools/test/refusalMirrors.test.ts`: the new refusal's mirror entry.
- V13-3b's second round: `scene/test/effects.test.ts` (the CALL flags' nodes from the bytes), `viewer/test/worldState.test.ts`
  (the room's run hands `FIRE_WEAPON` to `fire`, a presentation run none -- was "ignored"; the caller node is the callee's
  `NODE_CALLER`), `match/test/roomSceneRound.test.ts` (synthetic: the round a tick on, told, a player there killed his own
  death; none from a presentation run or an unplaced node; dropped at the reset), `viewer/test/grenade.test.ts`
  (`fireScene` explodes the item's round where told), `match/test/sceneDebris.devdisc.test.ts` (MP1's parts and C4, MP6's
  crate, MP12's tower), the Frostfire golden (`scene/test/golden/effectsFrostfire.json`: the effect library's calls now
  carry their `caller` / `place`, -7) and the Crossroads pin re-derived. Each RED on the first round's head, GREEN after.
- DF-5 (§3.2, the context root): `viewer/test/mapMetaFireRoot.test.ts` (new; synthetic, and the MP6 fixture) and
  `match/test/sceneRoundsDesertGlory.test.ts` (new; the MP6 fixture, skips without `test-fixtures/`). RED on `68ecb7316`
  (`fireNodeNames` absent; the barrels' roots not in `fireNodes`; no `sceneRound` after a barrel's death), GREEN after.

## 8. Readings and placeholders

| Name | Value / gap | Settled by | Status |
|---|---|---|---|
| `CALL_CONTEXT_NODE_READING` (*note only*) | `CALL_ANIMATION` flag bit 2 hands the callee the node at +9 as its type-3 context (`NODE_CALLER`), bit 3 starts it at the node at +10 (§3.3, `FUN_0025d5c0` D:L107605-107629, D:L118164-118168) | built 2026-11-07 (V13-3b: `decodeEffectOp`'s `caller` / `place`, the world's `call`) | resolved, reading pending review |
| `SCENE_NODE_MOTION_PLACEHOLDER` | `'fadeOverLifetime'` (viewer `worldState.ts`, since V13-3c): a death's `OBJECT_MOTION` with a launch (`FLIGHT_FLAGS`: 0x8, 0x10, 0x800; never a spin or a turn in place, MP6's truck) on a placed map node is not flown; on a page (a told death, or its own offline), where its program never turns the node off itself, a page's presentation run fades it from 1 to 0 over the motion's `lifetime` and takes it from the drawing at its end (the page's drawing only; back at the reset) -- the Ruins' antenna parts (5 s) and spinner (4 s), the comm tower's parts; where the program turns it off (the outhouse's, the crates') the part stands until then, as before (§3.3, §3.5). Was (*note only*): the part stood where it was until its program turned it off, forever where none did | a page-side flight of a placed node from the decoded motion (`effectMotion.ts`; the world's drawing has no per-node transform); a capture of the Ruins' antenna and an outhouse blown (H421) | open |
| `SCENE_ROUND_OWNER_READING` | `'victim'` (match `room.ts`): a scene program's `FIRE_WEAPON` round is each console's own SEAL's (`FUN_0025ccb0` D:L107285), so a player it kills dies his own death, as the bomb's (§3.2; research 332 §1.4). For a destructible's death this is read: its context holds types 2, 6 and 5 only (`FUN_00273a50` D:L121010-121060; §3.3) | whether a switch's press starts its program with a type-9 context entry (D:L107286-107297); a capture of a player killed by a bridge's blast (H421) | open (the switch's half) |
| `BASE_ROUND_UNDER_FLOOR_READING` (*note only*) | was: MP72's terrorist-base round, 0.5 u under the floor, reached no body on the port's two-sided line | the blast line's mode read: one-sided (`FUN_002d3030` D:L175276-175281, `FUN_00316e30` D:L215827-215828, research 281 §4.3); the round goes off before the base's swap (`WAIT 0.15`) | resolved 2026-11-07 (`blastSeen` one-sided; the round reaches the bodies, pinned on MP72 and MP1) |
| `BLAST_REACH_LINE_SIDES_READING` | `'two-sided'` (viewer `sceneHealth.ts` `blastLine`): by the reading one-sided (the same `FUN_0031dd90` batch, `FUN_003c7ee0` D:L319056, `FUN_002d3030` D:L175276-175281); kept two-sided because the one-sided line re-pins B194's sweeps (`blastSkipWiden`, `bombPlantSweep`), Vigilance's access4/access5 from their witness (`accessBarriers`) and `roomBarriers`' fixtures (§3.2) | a capture of the original (H421-style): a C4 charge behind a one-faced surface, with a barrier and a player on the other side -- if the barrier breaks, the destructible line is one-sided and the four pins re-pin together | open (held two-sided by the controller) |
| `BULLET_LINE_ONE_SIDED_READING` | `'two-sided-departure'` (viewer `round.ts`): a round's segment runs in the same `FUN_002d3030` mode as the blast's lines -- one-sided for a hull collider (D:L175276-175281, D:L215827-215828; research 281 §4.3) -- but the port's round stays two-sided (§3.2) | the build on the round's walk (`roundPath`), simulation track; a capture of a round fired from behind a one-faced wall (H421) | open |
| `ARCH_FALL_DAMAGE_READING` (*note only*) | whether the Crossroads arch's swap to its fallen model hurts a body inside it in the original; in the port only the two rounds deal damage (§3.2) | a read of the swap's geometry against a body (the mover's push or a kill), or a capture of a player under an arch at its fall (H421) | open, note only |
| `FIRE_WEAPON_FLAGS_UNREAD_READING` (*note only*) | `sceneRound` ignores FIRE_WEAPON's flag 2 (`atContext`) and its +10 flag (`FUN_003c82f0`); no consumer known on these maps (§3.2) | a read of both flags' effect where a map's program sets them | open, note only |
| `FIRE_ROOT_PLACED_MATRIX_READING` (*note only*) | a scene round at -7 (or a named node) starts at the node's placed world matrix (`MapMeta.fireNodes`, `flattenScene`); the original's `FUN_00310980` (D:L107232) reads the node's matrix as it stands, so a placed root a program moved before it fires is fired from where it was placed (§3.2, DF-5). It holds for a program whose root is placed; Breach's `knockdown_everything` (research 174:228; root index 0, no node table on MP61/MP62) names no node, so its round is dropped -- the original resolves its -7 through the +0x3c instance the CALL hands over (D:L118170-118172), not modelled (Breach not offered) | a per-node transform in the room's world (the motion's begin and tick on a placed node; DF-6's transform gap); for the Breach case, the CALL's +0x3c instance modelled; a capture of a Breach airstrike's blast | open, note only |
| `FUEL_BARREL_UNREACHABLE_READING` (*note only*) | Desert Glory's `barrel_fuel1/2` (health 150, shield 150, damage sequence 0): no `zweapon.rdr` rating plus modifier reaches the shield (50.4 at most; `FUN_003c7490` D:L318622, `FUN_00273a50` D:L120980-120992), so no weapon blows one and their `exploding_fuel` round never fires in play (§3.2, DF-5; research 175 §5.1) | a capture of the original: a barrel shot and C4'd (H-DF3's `barrel_fuel1` item); a damage channel to a destructible besides `FUN_00273a50` found; or a melee or other hit whose rating is not a ZAMMO record (the 50.4 ceiling assumes every hit carries a ZAMMO/ZWEAPON record) | open, note only |
| `OUTHOUSE_PARTS_RESET_PLACEHOLDER` (*note only*) | what a second round shows of the parts flown in the first: by the saved references, nothing restores them, and the port now keeps them off (§3.4) | a read of `FUN_0026c600`'s restart and `OBJECT_ADD_CHILD`'s (cmd 53) begin; a capture of an outhouse blown in two rounds | open, note only (kept: no source settles it) |
| `BRIDGE_FIRE_WEAPON_READING` (cross-reference; research 213 §6) | was: a scene `FIRE_WEAPON` fell through -- no blast, damage, explosion or sound (§3.2) | LATER 63's build | retired 2026-11-07 (V13-3b) |
| `GLASS_FRAGMENTS_PLACEHOLDER` (cross-reference; research 210 §6) | the windows' `DESTRUCTION_SOURCE` draws nothing (§2) | a decode of the command's payload; a capture of a pane shot | open |
| `SCENE_DEATH_ON_WIRE_READING` (cross-reference; research 210 §6) | `'targetOffOrTold'` since V13-3c: the room tells each death it runs (`sceneDeath`; the welcome's `sceneDead`), as the original's flagged death sends its type-8 record (`FUN_002734b0` D:L120782-120797, research 376 §3); the node states' inference kept for a state with none; the page's presentation run (§3.5, §6) | a two-console capture of an unflagged scene death (no bit 4: each console's own) agreeing with the told one | open |

## 9. Log

- **2026-11-07T19:37Z** -- V13-3a/3b (`agent/v13-3a`, the controller's implementer; the plan's Log is on
  `agent/v0413-plan`, PR #723, so the record is here). Read: §1-§6 at reading, pending review. Built: the room's
  `door: inactive` refusal (§4). Found already as the original: the binding, the windows' break, the outhouses' node
  changes, the wire and the reset (pinned on the dev disc). Not built, for the owner and the controller: the C4 round at
  the toilet -- the silent swap is the most visible gap (LATER 63, §3.2); the flying parts (`CALL_CONTEXT_NODE_READING`,
  §3.3: a cross-map change the plan leaves the owner to size); the glass fragments. Evidence kinds: unit (synthetic),
  dev-disc and source inspection; no rendered browser run, no capture.
- **2026-11-07T19:54Z** -- V13-3b's second round, on the controller's call (seat b6: "the two gaps you left are exactly
  the fixes to outhouse the owner means"): built the scene `FIRE_WEAPON` round (§3.2; LATER 63 done, `BRIDGE_FIRE_WEAPON_READING`
  retired, `SCENE_ROUND_OWNER_READING` new) and the `CALL_ANIMATION` caller node (§3.3), both on the common path; the
  parts fade and go at ~2 s (MP1) / ~4 s (MP6) in the room's state. Not built: the parts' flight
  (`SCENE_NODE_MOTION_PLACEHOLDER`), the glass fragments. Evidence: unit, dev-disc, source inspection; no rendered run.
- **2026-11-07T20:41Z** -- the review of `c35cce894` folded: F1 (`sceneRound` in `PART_DEPS.throwables`), F2 (the
  terrorist base's and the bridges' rounds disclosed and pinned on MP72: the base's under the floor reaches no body there),
  F3 (§3.3: the first type-3 entry; a death's context holds 2, 6, 5 -- the owner's death half read), F4 (the two
  FIRE_WEAPON flags `sceneRound` does not read, §8).
- **2026-11-07T21:01Z** -- the re-review of `be41a797a` folded: A (the blast line to a head is one-sided, read;
  `blastSeen` takes `frontOnly`; the base round now reaches the bodies; `BASE_ROUND_UNDER_FLOOR_READING` resolved; the
  round goes off before the swap), B (the claims cut to what the tests pin), C (six maps' base nodes measured; MP1
  pinned; MP9's and MP83's bases fire the round too), D (the bridge pin: two rounds at both points, both switches, a
  body on the ground, a health value; `ARCH_FALL_DAMAGE_READING` named).
- **2026-11-07T21:18Z** -- review 3 folded: F1 (`blastLine` made one-sided, then held two-sided as `BLAST_REACH_LINE_SIDES_READING`: it re-pinned four reviewed sweeps -- the controller's to size), F2 (`BULLET_LINE_ONE_SIDED_READING` named: the round's
  segment stays two-sided), F3 (the roomBlast wall's comment narrowed; the one-faced disc faces said), F4 (the bridge pin
  exact: two blasts, 178 kept at 200 u, 178 -> 8 at 20 u; the base round's reach said to be directional). The controller held the destructible line two-sided: AD-5's Vigilance access4/access5 pin came from witnessed
  behaviour and B194's sweeps were accepted as pinned, so reversing them needs evidence from the original (the capture
  named in §8), not a same-function inference.
- **2026-11-08T03:37Z** -- V13-3c (`agent/v13-3c`, stacked on `agent/v13-3a` 7fb421c46; the controller's implementer,
  seat b6's brief for Craig's live report): the Ruins' antenna (§3.5). Built: the told death (`sceneDeath`, the welcome's
  `sceneDead`; `SCENE_DEATH_ON_WIRE_READING` 'targetOffOrTold') and `SCENE_NODE_MOTION_PLACEHOLDER`'s fade, both on the
  common path. Read: `ant_base1`, `ant_part_fly1`, `spinner_hit` and `spinner_ant_start` through `simMapFromBytes` --
  reading, pending review. Departure from the brief, said: the brief asked the parts to fade "exactly as
  `toilet_flypart1` does"; the disc's `ant_part_fly1` holds no fade and no off, so the fade is the named placeholder's,
  over each motion's own lifetime, on the page's drawing only. Evidence: unit (synthetic), dev disc, source inspection,
  one rendered run (§3.5's e2e, on the owner's host); no capture.
- **2026-11-08T16:20Z** -- DF-5 (`agent/df-5-fire-root`, cut from `agent/v0415` `68ecb7316`; the DF plan's implementer):
  §3.2's two DF-5 bullets. Built: `fireNodeNames` (a round at -7 starts at the program's root placement), on the common
  path. Read: the barrels' unreachable shield, said in research 175 §5.1. Two note-only names (§8). Reading, pending
  review. Evidence: unit (synthetic), fixture (MP6), source inspection; no capture.
