# 219 -- The bullet as built (web sprint 28, PF-22 / PF-23 / PF-24 / PF-25)

- Date: 2026-10-05 (web sprint 28), amended 2026-11-02 by SG-RAW. Bullets and launched rounds' direct hits apply
  quantised packet values; shotgun receiver pellets use raw ammo floats (superseding PF-22's scaled/quantised
  pellet implementation, section 2). The room's three team tests made one friendly-fire predicate
  transcribing `CZSealBody::OnWeaponHit`; the backblast's cone about the firer's body's back. Sections 2-4 are PF-23's,
  PF-24's and PF-25's (the sprint's dispatch); this note opens with PF-22's.
- Status: **reading, pending review.** Every value below is a read of the decompilation (`D:L<n>` of
  `socom2_game.elf.decomp.c` r0001), of the ELF's `.data` or of its disassembly (`FUN_005ac670` is absent from the decomp
  text), as research 179 s8.2-s8.3, 181 s2.3 and 192 G12 give it; nothing here is a capture. Research 179 grades the
  packet's values PROVEN; under AGENTS.md a source read is a reading until reviewed (research 206).
- Sources: research [179](179-c1-match-server.md) s8.2 (FRIENDLY_FIRE_ENFORCEMENT_PLACEHOLDER) and s8.3
  (NET_DAMAGE_CLAMP_PLACEHOLDER); [181](181-c3-combat-hud-effects.md) s2.3 (the backblast's axis) and s9.3 (its
  verification); [192](192-m1-mp-modes-rules.md) s3.4 (G12) and s3.5 (G13); [206](206-verification-overrides-and-the-waves-close.md)
  s1.1 (V3: the in-game flag is bit 0x20 of byte 0x19); [91](91-the-round.md) s1, s5, s16, s23. Ruling PF.R40 (the
  controller, 2026-10-05).
- Code: `packages/viewer/src/net/damage.ts` (`quantiseHit`), `packages/match/src/room.ts` (`ffRefuses`,
  `DEPARTED_OWNER_FF_READING`, `RoomOptions.allowFriendlyFire`, `fire`, `volleyHit`, `directHit`, `blast`,
  `launchRocket`), `packages/central/src/bridge.ts` (`roomOptions`, FRIENDLY-FIRE 2026-10-18: the switch's wire),
  `packages/scene/src/projectile.ts` (`backblastAxis`, `BACKBLAST_CONE_AXIS_READING`); PF-24:
  `packages/match/src/room.ts` (`BODY_PENETRATION`, `fire`, `bulletHit`, `BODY_PASS_FRIENDLY_READING`,
  `BODY_ONE_SURFACE_READING`, `SHOT_EVENT_BODIES_READING`).

## 0. The answers

| question | answer | source |
|---|---|---|
| What a packet carries | integer damage: `min(255, trunc(dmg))`, piercing `min(255, trunc(p x 20)) / 20`; shotgun receiver uses the positive damage byte only as its admission gate | `FUN_002bd220` D:L161655-161672; `.data` 0x3de728-0x3de740; `FUN_005a1b80` D:L459543-459566 |
| Which hits apply packet values | bullets and launched rounds' direct hits; shotgun receiver pellets, blast fragments and falls use local floats | `FUN_005a5a80` D:L461619-461629; `FUN_005a1b80`, `FUN_005a0e70`, `FUN_005ac1f0`; research 94 C2.1 |
| The friendly-fire gate | one predicate, the owner's team at the hit, the owner looked up live | `FUN_005ac670` 0x5ac6b8-0x5ac750; 179 s8.2; 192 G12 |
| A departed owner | his hit lands on anyone (the lookup fails, the gate does not apply) | 179 s8.2 (a); PF.R40 |
| A spectator | takes nothing | `FUN_002c2fd0` in `FUN_005ac670`; 179 s8.2 |
| The backblast | never hurts its firer or his side, the switch on or off | 0x5ac840-0x5ac8fc; 179 s8.2; 192 G12 |
| The backblast's axis | the firer's body's +z, behind the body, `[sin(yaw), 0, cos(yaw)]` | `FUN_003cb1a0` 0x3cb308-0x3cb35c; `GetDamage` 0x9f D:L318784-318826; 181 s2.3 |
| A bullet meeting a body (PF-24) | goes on, its range cut to `min(range, (range + range x piercing x 0.1) x 0.97)` (PERSON); each body damaged once; launched rounds and rockets stop | `FUN_003c8920` D:L319391-319518; `FUN_003c5d20` D:L317260-317274; 179 s8.12; PF.R42 |

## 1. Integer damage and the friendly-fire gate (PF-22)

### 1.1 The hit packet

Online the shooter's console runs the hit (`FUN_005abbc0` -> `FUN_005a5a80`). It applies the float `GetDamage` itself
only when the victim's controller is local (`FUN_005a5a80` D:L461619-461629, vtable +0x34); otherwise it sends message
0x40, 8 bytes (`FUN_005a1ff0` -> `FUN_002bbda0` D:L160852-160892), and the victim's own console applies what arrives
(`FUN_002bbbd0` D:L160807-160847 -> `FUN_005a1b80` D:L459490-459620 -> `FUN_005a5830`). The packet's fields, each clamped
by `FUN_002bd220` (D:L161655-161672, an int clamp to [lo, hi]):

| field | value sent | clamp `.data` | received |
|---|---|---|---|
| damage | `(int)GetDamage` (already x 14) | 0x3de728 = 0, 0x3de730 = 255 | the integer |
| piercing | `(int)(piercing x 20.0)` | 0x3de738 = 0, 0x3de740 = 255 | x 0.05 |
| part | 0..5 (3 for a volley) | 0x3de748 = 0, 0x3de750 = 15 | low 4 bits |

The room is every console at once, and every victim is remote to someone: it applies what the victim's console applies.
`quantiseHit(dmg, piercing)` (`net/damage.ts`) truncates the damage toward zero as given (`cvt.w.s`; a single chopped
toward zero never crosses an integer, so the damage needs no single of its own -- rounding it to the nearest single first
would carry 35.9999999 up to 36). The piercing is the table's single times 20.0 by `mul.s`, which on the EE's FPU rounds
**toward zero** ("chop", not IEEE nearest-even: `PIERCE_ROUNDING_READING = 'chop'`, `chopSingle`), then truncated. Where it
shows: the single 0.35 (0.34999999) x 20 is 6.9999999, chopped to 6.9999995 -- 6 steps (0.30), not 7; the single 2.1
(2.0999999046) x 20 is exactly 42 - 2^-19, chopped to 41.999996 -- 41 steps (2.05), not 42 (the nine weapon records with
piercing 2.1). `chopSingle` is exact for this product: a single's 24-bit significand times 20's three significant bits
fits in a double's 53, so the double holds the real product; `Math.fround` gives the nearest single, and when that lies
farther from zero the single one step toward zero (its bit pattern less one) is the chopped one. The first build rounded
to nearest (7 steps for 0.35); the review of 2026-10-05 found it. An M4A1 round at the falloff distance that leaves
27.6 takes 27; the full 36.4 takes 36.

The room quantises before `applyHit` in `fire` (a bullet) and `directHit` (a launched round's struck body).
The earlier scaled/quantised shotgun pellet implementation is superseded by SG-RAW (2026-11-02): `volleyHit`
uses raw ammo floats after a positive packet-damage admission gate (research 94 C2.1; section 2 below).
A blast's fragments (`FUN_005a0e70`, the blast queue applied on the victim's own console) and a fall
(`FUN_005ac1f0`, the victim's own) also stay float. The combat report's `rawDamage` is the damage actually
applied before armour, including fractional shotgun damage; its wire field remains a number.

### 1.2 The gate: `ffRefuses`

`CZSealBody::OnWeaponHit` (`FUN_005ac670`, 0x5ac670-0x5aca04; the only caller of `FUN_005ab850`, which alone reaches
`FUN_005abbc0` and the blast queue `FUN_005ac070`), in its order (179 s8.2, by disassembly):

1. Online, a spectator victim (`FUN_002c2fd0`): dropped.
2. `victim+0xfb8 = projectile+0xac` (the owner's id).
3. Online and owner id != 0 and `DAT_0044cdb8 == 0` (friendly fire off; in game bit 0x20 of the game-state byte
   `+0x19`, 206 s1.1 V3) and the owner found live (`FUN_0029e4e0(0x4362e0, id)`, `+0x10 == 2`) and
   `(victim+0xc8 & owner+0xc8) != 0` and `(victim+0xc8 & 0x20000) == 0` and owner != victim: return 0 -- no damage, no
   blast queue, no knock, no flinch (0x5ac6b8-0x5ac750).
4. Whatever the switch (0x5ac840-0x5ac8fc): item 0x9f (the Backblast) from the victim himself or a teammate: dropped;
   items 0x79 (M67) / 0x7e (HE) likewise when the vtable+0x38 object's `+0x42c & 0x400` is set (unidentified).

The room's `ffRefuses(attacker, victim, itemId, allow, spectator)` transcribes 1, 3 and 4's backblast branch, and every
hit the room lays on a body goes through it once: `fire` (bullets and volleys), `directHit`, `blast`. `attacker` is the
live owner (`Room.thrower`: the same player object still in the room) or null when he has left; the team compared is his
**at the hit**, never the side he threw for (the `Flying.team` field is gone). The switch is `RoomOptions.allowFriendlyFire`
(default off, the create-game default, W3.R11); its wire from the create-game row is the online lane's (ONL-13). A
teammate's refused hit is told the requester as `'friendly fire'` (INT.R5's combat report) as before; a backblast's
own-side refusal is silent, as its cone's miss is.

What changes against the room before PF-22:
- **A departed owner's hit lands** (`DEPARTED_OWNER_FF_READING = 'lands'`, ruling PF.R40): the lookup by id fails, the
  gate does not apply. Review 2's m-13 kept the side "as it threw" and spared the teammate; `roomBlast.test.ts`'s pin is
  retitled to the original's fact. The kill stays the orphan's (no one scores; the line names the thrower).
- **The backblast never hurts its firer or his side**, the switch on or off. Before, the firer's own backblast hurt him
  (the owner passed the team test) and with friendly fire on there was no switch at all.
- **The team is read at the hit.** No path in the room changes a seated player's side mid-flight (SWITCH TEAMS re-seats
  a new player object, which is a departure here), so this shows only where a test moves it; `roundStats.test.ts`'s
  team kill now runs with friendly fire on (192 G13: the gate opens, team kills happen).
- **A spectator takes nothing**: the room's bodies are its seated players, so this is defence in depth (the lobby's role
  read at the hit).

Not built: the escortee bit (no escortees), the M67 / HE branch (its flag unidentified) -- both note only (s5). The
owner looked up by id would, in the original, find a new player handed the departed one's id; the room keeps m-13's
identity (the player object), so the next holder of an id is never taken for the thrower.

### 1.3 The backblast's axis

At spawn `FUN_003cb1a0` (0x3cb308-0x3cb35c) gives a 0x9f round with an owner the owner node's rotation
(`FUN_003156a0(owner node, &angles)` -> `FUN_00315760`; the node is `body+0x28`, D:L479492-479494); `GetDamage` for 0x9f
(D:L318784-318826) turns (0,0,1) by that model's matrix for the cone's axis, half-angle pi/4 (0x3f490fdb); the model's
forward is -z (`DAT_003f6500` = (0,0,-1) in the RDRAM dumps). So the axis is the body's +z: behind the body, following
its facing, with no aim pitch if the node carries yaw only (181 s2.3, STRONG; s9.3 CONFIRMED).

`backblastAxis(yawDeg)` = `[sin(yaw), 0, cos(yaw)]` in the port's convention (yaw 0 faces -z; the actor frame's +z
through `actorToWorldDir`), and `launchRocket` lays the backblast's `facing` from the body's yaw at the launch, no longer
the launch direction reversed. The aim reversed tilts the cone down behind a shooter aiming up and up behind one aiming
down: aiming 30 degrees down, a target 50 units behind at the feet (the muzzle 15.4 over them) is 17 degrees off the
body's axis and 47 off the aim reversed -- inside one cone, outside the other. (The dispatch's test title had the shooter
aim up; aiming up, the reversed aim's cone tilts toward the feet and takes that target too, so the test aims down.)
The page deals no backblast of its own (the room's `blast` does; `rocket.ts` only draws it).

## 2. The shotgun online and the blowback (PF-23)

Not written by PF-22. Follow-up SG-RAW (2026-11-02): research 94 C2.1 records the independently re-read
retail ammo parser, raw receiver and positive packet gate, plus the fractional-damage correction submitted
at the developer's request. H92 records PF-23's earlier held implementation. This correction covers player
seats, including bots; it preserves the existing hostage path and does not implement shotgun blowback.
Native/served r0004 verification and original-console comparison remain owed, not claimed as passed.

## 3. Bodies passed (PF-24)

Ruling PF.R42; the owner's word, HUMAN_TASKS H92 (2026-10-04): "bullets through bodies **yes**" -- built at the
original's behaviour, no flag. Sources: research 179 s8.12 (BODY_PENETRATION_READING, STRONG), 194 s8 (the same
consumers reread), 84 s13 (PERSON's 0.97, `materials.rdr`), 91 s23 (the impact on every console).

### 3.1 The walk past a body

`FUN_003c8920` (D:L319342-319525), for each surface of the round's walk (`HandleIntersections` 0x3c9b70), nearest first:

1. A PERSON polygon (`DAT_003e14f8`, D:L319391): a body. A second hit on the same body by one round is not damaged
   again (`+0x78`, D:L319398).
2. The struck node's handler runs (D:L319418) -- the body's `OnWeaponHit`, the friendly-fire gate inside it (s1.2).
3. Then (D:L319473-319518) the material's record (`+0x24`, its PENETRATION): for a launched round (class 0xab) or a
   rocket (0xb9), `FUN_003c5d20` (D:L317260-317274) is true and the round stops (range 0, return 4) unless the material's
   flag bit 1 is set; for every other class -- the bullets -- the range becomes `min(range, (range + range x piercing x
   0.1) x PENETRATION)` and the round goes on (return 2) while the surface is within it.

PERSON's PENETRATION is 0.97 (`materials.rdr` SOILS, research 84 s13). So a piercing above 0.31 keeps the whole range:
a body barely slows a bullet; a piercing of 0 leaves 0.97 of what was left.

### 3.2 As built

- **The room** (`room.ts` `fire`): each living body near the round (`nearRay`, `rayBody` on its rewound volumes) is an
  extra surface of the round's walk (`roundPath`) at `BODY_PENETRATION` -- PERSON's, read from the materials table
  (`materialTable()` by name), not a number of the room's -- no longer 0 ("a body stops the round"). `penetrate`
  (`../../viewer/src/accuracy`, the walk the world's materials already took; the registry's `weapons.penetration`)
  cuts the range by the same law at every surface, so a body is one more surface. One surface a body, at the nearest of
  its volumes the round enters (`BODY_ONE_SURFACE_READING`): the range is cut once a body; the original walks each node
  polygon it crosses. The review of PF-24 read the guard: the `+0x78` slot holds the actor's top model node compared against the LAST
value only, and the same-body flag skips `FUN_003d0ba0` (L319421), the block at L319423 and the impact effects (L319499, L319503) -- NOT the
handler call at L319418 and NOT the range cut at L319505-319515, which runs on every call. What is open is how many calls one body
produces from the caller's polygon walk and which call (the handler or `FUN_003d0ba0`) applies the damage -- that decides whether the
original damages a body once; the port's once-per-body is PF.R42's ruling (no difference shows above a piercing of 0.31).
- **The bodies, in order.** After the walk, MAP-06's destructible pass (`FUN_003c7490`, research 209 s13) hands every
  struck world surface the hit, in order, and ends nothing (P11, `agent/p11-room`, 2026-11-02, reading, pending review;
  research 209 s13): the handler's return is discarded (D:L319417-319418) and the round goes on by the material's
  `PENETRATION` alone (D:L319473-319518), as past a body -- the bodies past a destructible that took the hit are struck.
  *Was* (PF-24 to P11): a scene destructible that took the hit ended the round there, the bodies before it struck, those
  past it not -- the room's stop, not the original's. Then every body the round struck, in the walk's order, once a round (the
  room's guard, as `+0x78`): `bulletHit` -- the gate (`ffRefuses`, PF-22), then the bullet's quantised damage (PF-22's
  `quantiseHit`) or, for a shotgun ray, `volleyHit` (once a victim a shell, its `hit` set; the pellets drawn for each
  victim at its own distance), the `hurt`, the combat report, the flinch or the kill. A body dead since the shooter
  saw it is a miss ('not alive'), as before.
- **A refused teammate is passed** (`BODY_PASS_FRIENDLY_READING = 'through'`): the handler at D:L319418 precedes the
  continuation at D:L319473, which reads nothing the handler returns -- an inference from the lines' order, named. The
  teammate is told the requester as 'friendly fire' (INT.R5's report) and the round goes on to the enemy behind.
- **One hit counted a shell** (PF.R20, `countShot`): a round through two enemies counts one shot and one hit; through
  a teammate into an enemy, the enemy's is the hit.
- **The events** (`SHOT_EVENT_BODIES_READING = 'first body'`): one `shot` to the other pages and the shooter's `impact`,
  both of the first body struck -- its point as `to`, the normal back along the round, the PERSON byte, `body` its id
  -- the same shape as before PF-24 (protocol 10, nothing added). Every body struck gets its own `hurt`, `flinch` or
  `kill` and combat report. The dispatch read `to` as the round's end; the pages draw a round's impact at `to` by its
  material (`netPage` `shot` / `impact` -> `roundEffects` / `roundImpact`), so `to` at the round's end would have played
  the PERSON impact at the wall, or, with the wall's material, no blood at the body on any other page. The first body's
  impact is kept. The later bodies' impacts are drawn on no page (owed). Past the bodies, P12 (below) closed the
  shooter's page in full (its marks, impacts and tracer) and the others' impacts; P12b (below) the others' tracer. The
  others place no marks (owed, s5).
- **P12, the round's presentation** (2026-11-02, the online-parity sweep's SW-2, SW-3 (= EP-6b) and SW-4's page half;
  `agent/p12-round-presentation`; reading, pending review):
  - *The shooter's page* (SW-2): `fire.ts` walks its round past every body on the line -- each a surface at
    `BODY_PENETRATION`, PERSON's 0.97 taken from the scene's materials table by name as the room's is
    (`FUN_003c8920` D:L319473-319518) -- tagged `BODY_STOP` only to take no mark and make no through-surface (the
    room's `impact` brings the blood). The bodies are `FireSource.bodyDistances` (`RemotePlayers.aimBodies`, the room's
    capsules, down the round's own leg; the firearm's and the turret's `drawRound`), else the nearest
    (`targetDistance`). So the wall behind an enemy is marked and its impact played, the tracer runs to the round's
    end, and a second body in line cuts the range as the room's does. *Was* (INT-NET-2 to P12): penetration 0, the
    page's round ending at the body under its reticle while the room's went on. Without the penetration table (no
    effects data) the nearest body still ends the page's round unmarked: that fallback has no material law at all.
  - *The others' pages* (SW-3, `SHOT_EVENT_THROUGH_READING`): the room's `shot` carries `through`, every world surface
    the round struck that `to` does not name, in the walk's order (point, normal toward the shooter, material byte;
    bodies never): the surfaces it pierced and, when `to` is the first body, the one it stopped at past it. Additive
    JSON (protocol 13 kept, `protocol.ts`'s header rule; absent when empty; an older page ignores it, the shooter's
    `impact` never carries it). The page (`netPage` `shot`) plays the round as before and then one impact per entry
    through `roundImpact` -- no second muzzle, tracer or report -- as the shooter's page plays its own through-surfaces
    (the review of P12: the others' tracer still flies to `to`, the first body when there is one, so an impact on the wall
    behind it is one no tracer reaches -- a difference between the pages the original, every console walking the round,
    would not show (closed by P12b, below); and the others place no bullet mark for anyone's round, `FUN_003d0ba0`
    D:L319421, a gap older than P12: owed, s5)
    (`matchFirearm`). The original's route: every console walks the round and plays an impact at each surface
    (`FUN_003c8920` D:L319383, D:L319497-319500); that a remote console walks it at all is research 91 s23's inference
    from the local-only damage gate (`FUN_005abbc0` D:L464698) -- hence a reading.
  - *P12b, the others' tracer* (2026-11-02, `agent/p12b-shot-end`; reading, pending review; `SHOT_EVENT_BODIES_READING`'s
    tracer half): when `to` is the first body the room's `shot` carries `end`, the round's end -- `path.hit`'s point,
    else `path.end`, the range spent: the point the shooter's page draws its own tracer to (P12, above) -- and only then
    (absent when the round ended at `to`; never on the shooter's `impact`). Additive JSON (protocol 13 kept, an older
    page draws to `to` as before). The page (`netPage` `shot`) gives another's tracer round `tracerTo` = `end`, and
    `effects` `onRound` launches the tracer from the muzzle to `tracerTo ?? to`; the impact, its normal and material,
    the body hit and the report stay `to`'s. *Since LATER 644* (2026-11-02; reading, pending review): the page keeps
    `end` as `tracerTo` on every round, tracer or not, and the passing sound tests the round's path to it
    (`matchFirearm` `roundEffects`, research 81 s5). So the tracer reaches the wall whose impact P12 plays, as on every console
    walking the round to its end (research 91 s23; the same inference, no new value). *Was* (P12 to P12b): the others'
    tracer flew muzzle -> the first body. Tests: `roomPenetration.test.ts` "P12b" (a body before a STONE wall: `end` at
    the wall, no `end` on the `impact`; a body before a spent SHORT round: `end` 300 x 0.97 = 291 from the muzzle; no
    body: no `end`), `confirmedBlood.test.ts` (another's fourth M4A1 shot with `end`: its tracer at `end`, the round at
    `to`; without: at `to`).
  - *SW-4's page half*: nothing to change. The page's walk never had a destructible stop -- `fire.ts`'s `ray` and
    `drawRound` call `roundPath` (`round.ts`) with the page's materials only, and `roundPath` / `penetrate` read no
    scene health -- and since P11 the room's walk does not stop at a destructible either (research 209 s13), so the
    page and the room agree and the page needs no `stopsAt`.
- **Launched rounds and rockets** stop at the first body as they did (`flyGrenades` -> `bodyCast` -> `directHit`, the
  `BodyHit` path): an impact round goes off or bounces at the body it meets; `directHit`'s once-a-body guard
  (`Flying.struck`) is unchanged.
- **The dead**: the room keeps the dead out of the walk (no surface). Whether a corpse's nodes meet a round in the
  original is unresolved (194 s6): `CORPSE_HIT_READING`, note only. A shotgun's later rays at the same command pass a
  body its first ray killed, as before PF-24.
- **The page** (`../../viewer/src/round.ts`): unchanged -- `penetrate` already cuts by `(1 + piercing x 0.1) x
  PENETRATION` for any surface; the room's tests pin it for bodies. Its `Fire` passes bodies since P12 (above).

### 3.3 The tests

`packages/match/test/roomPenetration.test.ts` (new): two SEALs in line under one M4A1 round (both at 36; one `shot`
with the first body; one hit), and a no-piercing 300-unit rifle (a body at 296 -- entered at about 294 -- untouched
behind a body at 100, its range cut to 291, and struck alone); a teammate in front of an enemy (refused, passed, the
enemy hurt); an M203 FRAG and a LAW HEAT at a body 150 away with another at 190 behind (only the first's direct hit); a
round through a side-on SEAL's arm into its torso (one report, the arm's part); a 12-gauge shell through two bodies
(its first ray hurts both; four rays, one hurt each, one hit); on Frostfire (the fixture), a body, `bdoor_4`'s pane and
a body behind it (P11: the pane takes the hit and dies, the round goes on into the second body; the pane's second
polygon kills it no second time; the next round, the pane spent and off, reaches it again -- *was* the pane stopped the
round before the second body). Mutation: `BODY_PENETRATION` -> 0 turns four of the six red (the launched-round and same-body tests pin
behaviour PF-24 keeps).

## 4. The footfall cap (PF-25, PF.R43)

**The source** (research 179 §11.20; a reading, never proven). `FUN_005a3570` (D:L460266-460378), the footfall clock,
sounds a step only when the actor's `+0xe0` has bit 2 set (D:L460295). `FUN_00552850` (D:L418748-418861) sets that bit
per viewer: on the viewer's own actor always (L418860), and on the other actors of its list (`+0xd8`, each entry's
distance squared at +0x10) whose distance squared is under 250000.0 (500 units; the compare is strict), up to
`DAT_0064fc78` = 3 of them (`consts.out`), skipping a remote player's flagged actor (`+0x265` bits 0/1).

**As built** (`packages/viewer/src/remotePlayers.ts`):

- `footfallsHeard(bodies, listener)` -- the living bodies of the snapshot whose feet are under 250000 (distance squared,
  three axes) from the listener, sorted nearest first (a stable sort: ties keep the snapshot's order), the first three;
  `null` (every living body) when there is no listener.
- `RemotePlayers.setListener(feet)` -- the page's own feet; `frame()` makes the choice once, before any body's play runs,
  and a body's footfall reaches the `steps` hook only if its id is in the frame's set. A dead body takes no slot -- the port's choice under PF.R43: `FUN_00552850` has no alive test (only the entry's type byte +0x10 == 2 and the +0x265 bits), so whether a corpse stays in `+0xd8` and spends a slot in the original is open; the three-axis distance is likewise an assumption (the original reads a distance squared stored at the entry's +0x10 by an unread builder) -- (it
  is skipped before the ranking) and is not heard anyway (`remoteFootfall` is only asked for a living body's).
- The page's own steps go through `./walkSounds` and are never ranked (L418860): the cap is the others' alone.
- Without a listener -- the map viewer's watcher, or a page that has not wired one -- every living body is heard, which
  is the behaviour before PF-25.

**Wiring owed (held file).** The page's listener is not set until the controller adds one line beside the existing
`net?.frame(...)` call in `packages/viewer/src/main.ts` (about line 2250), before it:
`remote.setListener(net ? walk.feet() : null);` -- `main.ts` is held by the online lane. Until then the page hears
every living body, as before. (`netPage.ts:862`, the `remote.frame(...)` call, is held too; `main.ts` is the one place
with both `remote` and `walk`.) *Wired (sprint 28 wave 4, 2026-10-06), as written.* **Owed:** the front end's match
(`matchMount.ts`) sets no listener -- it has no step before the net's frame to put it in (an older gap than PF-25), so
a menu-launched match hears every living body's footfalls until one is added.

**Not reproduced.** The `+0x265` skip (a remote player's flagged actor, bits 0/1) is not modelled: what the flags mean
on another console is unread. The `+0xd8` list's order is owed: FOOTFALL_NEAREST_READING takes the nearest three.

**Tests.** `packages/viewer/test/remoteFootsteps.test.ts` ("the page hears at most three other living bodies'
footfalls, ..."; "a dead body among the nearest three does not take a slot; ...") and `packages/viewer/test/audio.test.ts`
("the page's own footfalls are never capped (L418860)"). Registry: `sound.footstep.cap`. A mutation of the cap
3 -> 4 fails both cap tests.

## 5. Readings and placeholders

| name | where | status |
|---|---|---|
| `DEPARTED_OWNER_FF_READING` | server `room.ts` | `'lands'`: a departed owner's hit lands on his former teammate (179 s8.2 (a); PF.R40). Owed: a recomp capture of a grenade whose thrower quits before the fuse, a teammate in its radius, friendly fire off |
| `BACKBLAST_CONE_AXIS_READING` | scene `projectile.ts` (+ server `room.ts`) | `'body-back'` (181 s2.3); was `'backwards'` (the aim reversed). Owed: whether `body+0x28`'s matrix carries pitch (an RDRAM read of the node's rows aiming a launcher up; expect row 1 = (0,1,0)) |
| `PIERCE_ROUNDING_READING` | viewer `net/damage.ts` | `'chop'`: the EE FPU's `mul.s` rounds toward zero (general PS2 knowledge -- PCSX2's EE FPU defaults to Chop for it -- not this project's capture). Owed: a capture of a 2.1-piercing hit, the packet's piercing byte (41 under chop, 42 under nearest) |
| `ESCORTEE_TEAM_BIT_READING` (*note only*) | -- | the team word's `0x20000` bit lets a teammate's hit through the gate (0x5ac6b8-0x5ac750; read as the escortee / hostage bit, 192 G12). No escortees yet; owed: a read of the team word's writers (the `FUN_002c509c` area) |
| `GRENADE_TEAM_FLAG_READING` (*note only*) | -- | an M67 (0x79) / HE (0x7e) hit from one's own side dropped when the vtable+0x38 object's `+0x42c & 0x400` is set (0x5ac840-0x5ac8fc); the object and the flag unidentified, unbuilt. Owed: a PEEK of a thrower's controller `+0x264` / `+0x42c` during a throw |
| `NET_DAMAGE_CLAMP_PLACEHOLDER` | *note only* | resolved 2026-10-05 (PF-22): `quantiseHit` (`FUN_002bd220` D:L161655-161672, `.data` 0x3de728-0x3de740; 179 s8.3) |
| `FRIENDLY_FIRE_ENFORCEMENT_PLACEHOLDER` | *note only* | resolved in kind 2026-10-05 (PF-22): `ffRefuses` with `RoomOptions.allowFriendlyFire` (179 s8.2, 192 G12); the create-game row's wire built 2026-10-18 (FRIENDLY-FIRE, below): a lobby game's room takes the switch from the game's RulesSet bit 0. Was (2026-10-05 to 2026-10-18): "the create-game row's wire is ONL-13's" -- unbuilt, so every lobby game's room refused friendly damage whatever its host chose |
| `FOOTFALL_CAP_READING` (`viewer/src/remotePlayers.ts`) | `{ others: 3, range2: 250000 }`: `DAT_0064fc78` = 3 others and the strict 250000.0 (500 u) of `FUN_00552850` D:L418748-418861; the `+0x265` skip is not modelled | a read of `+0x265`'s writers (what bits 0/1 mean on a remote player's actor) | in code; open |
| `FOOTFALL_NEAREST_READING` (`viewer/src/remotePlayers.ts`) | `'nearest'`: the three heard are the nearest by distance squared (PF.R43) | a read of the `+0xd8` list's builder (sorted by distance or not) or a capture: four others walking inside 500 u at known distances | in code; open |
| `BODY_PASS_FRIENDLY_READING` | server `room.ts` | `'through'`: a body the friendly-fire gate refuses is passed as any other (the handler D:L319418 before the continuation D:L319473-319518; an inference from the lines' order, 179 s8.2, s8.12; PF.R42). Owed: a capture of a teammate in front of an enemy, friendly fire off |
| `BODY_ONE_SURFACE_READING` | server `room.ts` | `'per body'`: one PERSON surface a body, at the nearest volume the round enters, the range cut once; the original walks each node polygon crossed (`+0x78`, D:L319398, sparing a re-damage). Owed: a read of whether each crossing cuts the range |
| `SHOT_EVENT_BODIES_READING` | server `room.ts` | `'first body'`: one `shot` and one shooter's `impact` a round, of the first body struck (its point, normal, PERSON byte, id); every body its own `hurt`, `flinch` / `kill` and report (PF.R42; s3.2 says why `to` is not the round's end). Owed: the later bodies' impacts on the pages; the others' bullet marks (no page marks another's round, `FUN_003d0ba0` D:L319421; older than P12). Closed by P12 (2026-11-02; reading, pending review): the shooter's page in full past the bodies (its walk past every body, `fire.ts` `BODY_PENETRATION`: the marks, impacts and tracer), and the others' impacts on the world surfaces past them (`SHOT_EVENT_THROUGH_READING`). Closed by P12b (2026-11-02; reading, pending review): the others' tracer to the round's end (the `shot`'s additive `end` when `to` is the first body; `netPage` `tracerTo`, `effects` `onRound`; s3.2) |
| `SHOT_EVENT_THROUGH_READING` | server `room.ts` | `'struck world surfaces'` (P12, SW-3; reading, pending review): the `shot`'s additive `through`, every world surface the round struck that `to` does not name, in order (point, normal, material byte; no body); each page plays an impact at each through `roundImpact`. The original's consoles each walk the round (`FUN_003c8920` D:L319383, D:L319497-319500); that a remote console walks it is research 91 s23's inference from `FUN_005abbc0` D:L464698. Owed: a trace of how a remote player's round reaches a console (the message that starts its projectile there, research 91 s23) and a two-console capture of a round through a fence: the far console's impacts |
| `CORPSE_HIT_READING` (*note only*) | -- | whether a dead body's nodes meet a round and cut its range (194 s6); the room passes the dead (no surface). Owed: a read of `FUN_003c8920`'s body test on a dead actor |
| `BODY_PENETRATION_READING` | *note only* | resolved 2026-10-05 (PF-24, the owner's H92, PF.R42): a bullet goes on past a body at PERSON's 0.97 (`FUN_003c8920` D:L319473-319518; 179 s8.12) -- server `room.ts` `BODY_PENETRATION` from the materials table |

**FRIENDLY-FIRE (2026-10-18, web sprint 41; reading, pending review).** The create-game FRIENDLY FIRE row reaches the
match: `bridge.ts` `roomOptions` passes `allowFriendlyFire = (game.rulesSet & RULES_SET.FriendlyFire) !== 0`. The
host's world report packs `mp_friendly_fire` as RulesSet bit 0 (`FUN_002ef590` D:L191375-191384; the page's report,
`gameLobbyCommands.ts` `report`, already sent it); the host's valve is the match's -- its game-state send sets
`DAT_0044cdb8` and bit 0x20 of byte +0x19 from it (`FUN_002c00f0` D:L163092-163099), every other console copies that
bit (`FUN_002c0850` D:L163354-163369) -- so one switch per room, every seat's (a late joiner, a resumed or taken-over
seat, the next match after GAME COMPLETE: the same `Room`). Off when no report set it: CreateGame1 sends RulesSet 0
(D:L190575), and CREATE GAME's first arrival shows `global_valves.rdr`'s `mp_friendly_fire` 0 (`RUN/READERC.ZAR`,
the `valves` row, no type word: not PERSIST, so no card restores it). The forge (`forgeLobby.ts`, its layout's
setting), the server's rooms per map and the page's solo room (no rules set: off) are unchanged. **Read once, at the
room's make** -- a known edge, not refused: nothing of the original writes the host's valve after CREATE GAME
(`dlgCreateGame.rdr`'s `set_FF_valve` and `SetDefaultStatus` are the only scripts that do, the online chapter's dump;
the code's other writers are a joiner's, through either branch of the join dispatcher `FUN_0027d730` -- JoinMPGame
`FUN_002f83b0` D:L197219-197232 and `FUN_003039b0` D:L204116 -- and the receiving consoles' copy; the review's F2), so a modified page's later world report flipping bit 0 changes the record (GAME DETAILS, the filters) and not
the room. `room.ts` unchanged. Tests: `central/test/bridge.test.ts` "FRIENDLY-FIRE: ..." (bit 0 on: the room's gate
passes a teammate's rifle round and the room's body hit lowers his health, one `hurt`; report 0, and no report bit
over CreateGame1's 0: refused, health unchanged, no `hurt`); the whole path from a page's `fire` stays
`roomDamage.test.ts`'s "friendly fire off" and "friendly fire on" cases.

## 6. Owed

- A two-console recomp capture of one hit: the 8 payload bytes at `FUN_002bbda0`'s `FUN_0030cef0` call (179 s8.3).
- A recomp trace with `mp_friendly_fire` 0: a teammate's M4 hit, breakpoints at 0x5ac74c (taken) and 0x5ab850 (not
  reached) (179 s8.2).
- The backblast node's pitch (s5).
- ~~The create-game FRIENDLY FIRE row's wire to `RoomOptions.allowFriendlyFire` (ONL-13, the online lane).~~
  *(built 2026-10-18, FRIENDLY-FIRE: `bridge.ts` `roomOptions`, the game's RulesSet bit 0, s5; was owed here since
  2026-10-05.)*
- PF-24: a capture of a teammate in front of an enemy (`BODY_PASS_FRIENDLY_READING`); a read of whether each node
  crossing cuts the range (`BODY_ONE_SURFACE_READING`) and of a corpse's part in the walk (`CORPSE_HIT_READING`); the
  later bodies' impacts on the pages and the others' bullet marks (`SHOT_EVENT_BODIES_READING`; P12 closed the
  shooter's page in full and the others' impacts, P12b the others' tracer to the round's end, s3.2);
  the remote console's walk of a round (`SHOT_EVENT_THROUGH_READING`).
