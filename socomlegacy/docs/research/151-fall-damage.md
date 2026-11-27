# 151 -- Fall damage: the landing's speed, its sound and its damage from one rule (FALL-DAMAGE)

Written 2026-10-03 for the owner's defect on the playable page, the match: "fall damage makes the fall damage sound but
deals no damage" (the owner, 2026-10-03), and his rule for it: "something we must try our utmost to derive from the
original, if not we place a placeholder and note loudly as such based on inferences". Sources: the retail
decompilation `C:/Projects/socom_pc/game/analysis/socom2_game.elf.decomp.c` (`D:L<n>` = its line; `FUN_<addr>` its
functions; cited, never pasted); the seal tuning table (`RUN/READERC.ZAR` `dynamics.rdr`, research 17 §8 of the desktop
project as [research 80](80-the-jump.md) and `packages/viewer/src/physics.ts` carry it: `FALLING_DAMAGE_LIGHT/HEAVY/DEATH`
6.2 / 9.1 / 12 metres, the world's x 10, at gravity 235); reCOM for the names (`research/recom/src/gamez/zCharacter/
char_dyn.cpp:21-35`, `zSeal/zseal.h:448-452`). It stands on [research 80](80-the-jump.md) (the landing, `FUN_005af590`),
[81 §6 and §9](81-sounds.md) (the landing's sounds), [85 §12](85-grenades.md) (the blast knock), [91 §5, §6, §21](91-the-round.md)
(the round's damage), [127](127-the-combat-report.md) (the combat report). **Confidence: reading, pending review** -- every
value below is transcribed from the decompilation and the table and held by unit tests; none is measured against the
original running (§7 says what would).

Amended 2026-11-11 (FALL-DEATH-LAND, §3.6) for the owner's v0.4.18 report: "when players fall to their death their
character just crouches where they fell instead of being a dead body on the ground". **Confidence: reading, pending
review.**

Amended 2026-11-24 (R4P-104; seat-kill's re-read at r0004): **the x 1.2 is the dive's landing's, not the knock's**, in
both builds (§2.6, §3.4). `FUN_00580360` (r0004 0x585900) is reached only with `dive_to_prone` in play; a knock's landing
calls `FUN_005ac1f0` at the plain contact speed. The port read the knock at x 1.2 and the dive at its plain speed: both
corrected; an escortee's landing online plays class 0's clip (§3.4). **Confidence: reading, pending review**; capture
Q-104 / IQ-073 (§6) makes it proven.

Amended 2026-11-24 (R4P-104's fold of the non-author second read, `r4p104-fall.second-read.md`; reading, pending
review): (C1) the dive's landing pops and pushes on its DEAD branch only, a living body returning 1 with nothing pushed --
the wording R4P-104 had replaced was right (§2.6, §6); (C2) body `+0x105c` bit 3 has more than one setter, so "a
player's dive never carries it" is not established (§2.6, §5, §7); the online AI spare covers any AI-controlled body, the
port's flag standing for "is an escortee" (§3.4). No behaviour of the port changes with this fold.

## 0. Answers

- **What the original measures**: the landing's **contact speed** (units a second, downward) -- the value `FUN_005af590`
  / `FUN_005af930` hand `FUN_005ac1f0` (D:L466656, D:L466836-466844) -- against three speeds the table's loader computes
  from the three `FALLING_DAMAGE_*` heights (§2.1). Not the apex's height, not the airborne time.
- **One threshold for the sound and the damage**: the light speed `DAT_0044c280` = 170.70 a second (a 62-unit fall).
  Over it the landing is class 1 and up, hurts, and the hurt SEAL's `CHRSND_DAMAGE` voice plays (research 81 §9); at or
  under it the landing is soft, free, and only the material's `LANDSOUND` plays (§2.2-2.3).
- **The damage**: every one of the six parts, the head too, loses `max x f`, `f = (v - 170.70) / (237.49 - 170.70)`
  clamped to [0, 1] -- linear, no table, no armour step, lethal at 237.49 (120 units) where every part is 0 (§2.3).
- **The hit's effect**: the health bar (the reaction `FUN_005a54d0(actor, 3, 7)`: part 3 BODY, cause 7 a fall), **no
  flinch** (cause 7 is excluded), the hit clips come from the landing itself (class 2: `Hit` / `Hit stomach`; class 3
  `Land forward` and the death), the exertion meter +0.33 / +0.66 (§2.4).
- **Who runs it**: the victim's own console only (the controller's `+0x34` false), as a blast's damage is (§2.5). In
  the port the room runs every player's mover, so the room is every victim's console: it reads the landing it measured.
- **The defect's cause** (§1): the room already applied the damage (`applyFall`) but told no one -- the page's health bar
  learns its health from the `hurt` event alone -- so the owner heard the voice (the page's own landing, the same
  speed) and saw a full bar. Fixed: the room sends `hurt` (part 3) and reports it (§3). (The 2026-10-03 fix also read
  a blast knock's landing at x 1.2; R4P-104 moved the factor to the dive's landing, §2.6, §3.4.)
- **Placeholders added**: none. One gate not read (§5), registered as `owed`. FALL-DEATH-LAND (§3.6) adds one reading,
  `REMOTE_FALL_DEATH_POSE_READING` (§5).
- **The landing that kills** (FALL-DEATH-LAND, §3.6): `FUN_005af590` runs the damage BEFORE it picks the clip
  (D:L466656), so a body the fall kills -- a wounded one from a light or heavy drop as well as anyone from a deadly one --
  is class 3: `Land forward` in the death state 8, no coin, held (D:L466658-466664).

## 1. The defect and its cause

The page sounds its own landing from its own mover (`main.ts` `play.onEvent` -> `walkSounds.playEvent` ->
`GameAudio.onLand(speed, material)`, `audio.ts`): `@s2u/sound`'s `landingClass(speed, landSpeeds(g, h))` picks the
class, `landingSounds` the material's `LANDSOUND` / `.BONE_BRK_1`, and `landingHurts(cls)` (class 1 and up) adds the
character's `CHRSND_DAMAGE` (`.SEAL_DAMAGE`) -- the "fall damage sound" the owner heard. The room (`packages/match/src/
room.ts`, `run`) read the same mover's landing on the same commands and called `applyFall(p.health, landing.speed)`
(the health lowered, a death killed) -- and that was all: no `hurt` to the victim's page, whose HUD bar moves only on
`hurt` (`netPage.ts`: `case 'hurt': hud.setHealth(...)`), no combat report (research 127 §6 listed the fall under "not
reported"). So the bar stayed full until the next bullet, which then showed a health already lowered.

Two smaller faults found on the way: `damage.ts` held the two speeds as rounded literals (170.7 and 237.5) while the
sound used the exact `g x sqrt(2h / g)` (170.7044..., 237.4868...), so a landing between 170.7000 and 170.7044 took a
hair of health with no hurt voice; and the x 1.2 of §2.6, which the 2026-10-03 task put on the blast knock's landing
(corrected by R4P-104: it is the dive's).

## 2. The rule in the original

### 2.1 The three speeds (`FUN_0059ba80`, D:L456671-456682)

The seal table's loader reads `FALLING_DAMAGE_LIGHT`, `FALLING_DAMAGE_HEAVY`, `FALLING_DAMAGE_DEATH` into the table's
`+0x24..0x2c` over static defaults `0x3fa66666` / `0x40266666` / `0x41000000` (1.3, 2.6, 8.0 -- reCOM's own defaults,
`char_dyn.cpp:21-23`), multiplies each by the world scale `DAT_003dfe10` (10: metres to units), then writes
`+0x30..0x38` = `g x sqrt(2h / g)` with `g` the table's `+0x00` (`DAT_0044c250`, 235). reCOM names them `m_fallDist[3]`
and `m_landSpeed[3]` (`char_dyn.cpp:24-35`, the same formula). The retail disc's heights are 6.2 / 9.1 / 12 metres
(research 91 §5's row; `physics.ts` reads them by name): **62, 91, 120 units**, so the speeds are:

| | height (units) | speed (units/s) | `DAT_` |
|---|---|---|---|
| light | 62 | sqrt(2 x 235 x 62) = **170.704** | `0044c280` |
| heavy | 91 | sqrt(42770) = **206.809** | `0044c284` |
| deadly | 120 | sqrt(56400) = **237.487** | `0044c288` |

(`g x sqrt(2h / g)` = `sqrt(2gh)`; the loader's form is kept in `damage.ts` `fallSpeeds`.) The port computes them from
`SEAL_TUNING.gravity` and `SEAL_TUNING.fallingDamage` (`@s2u/scene`, research 17 §8's values) in three places --
`@s2u/sound` `landSpeeds`, `mover.ts` `landingClass`, `net/damage.ts` `fallSpeeds` -- and `packages/viewer/test/
fallDamage.test.ts` pins the three equal.

### 2.2 The class and the sounds (`FUN_005ac1f0`, D:L464866-464927)

`FUN_005ac1f0(speed, actor)`: the material under the actor (`FUN_002dc1d0(actor+0x400)`, clamped to the soils count
`DAT_0044f354`) gives its `LANDSOUND` handle (the soils table `DAT_0044f358`, `+0x14`; research 81 §4). With the actor
in state 8 (dead) or 10, the fraction and the class are 0 (D:L464887-464888, D:L464898-464899). Else the class
(D:L464900-464907): 0 at or under the light speed; 1 over it; 2 over the heavy; **3 at or over the deadly** (`<=`). The
sounds (D:L464908-464927): class 0 and 1 the `LANDSOUND`; class 2 `.BONE_BRK_1` alone (`DAT_0044d580`); class 3 both --
as research 81 §9 has it and `@s2u/sound` `landingSounds` plays it. No damage voice is in this function: the hurt voice
is the reaction's (research 81 §9, `landingHurts`; the call inside the reaction is not traced -- traced since: research 205
§2.2, `FUN_005477a0` -> `FUN_00597b00` for a body left alive; `landingHurts` removed 2026-10-04).

### 2.3 The fraction and the loop (D:L464889-464897, D:L464941-464950)

`f` = 0 at or under the light speed; 1 at or over the deadly; `(speed - light) / (deadly - light)` between. The heavy
speed is not in `f`: it only picks the class (the clip, the sound, the meter). Then, for each of the six parts
(`actor+0xffc + 4i`, i = 0..5; the order of research 91's vocabulary: head, rarm, larm, body, rleg, lleg), `health -=
max x f` with `max` at `+0x1014 + 4i` (the part's maximum, `character.rdr`'s MP rows: 8 / 30 / 30 / 50 / 30 / 30), and a
result under 0 is written 0. **No armour step** (the bullet's `FUN_003c7400` is not called), **the head included**, and
the subtraction is from the maximum, not the health left: two landings of the same speed take the same amount twice.
Dead when the head or the body reaches 0 (`FUN_005a54d0`'s test, D:L461376-461380) -- at the deadly speed every part is 0.

### 2.4 The reaction (D:L464951; `FUN_005a54d0` D:L461370-461411)

`FUN_005a54d0(actor, 3, 7)`: part 3 (BODY), cause 7 (a fall; research 91 §3's cause codes). Alive: `FUN_005477a0(overall,
actor, 0)` -- the health bar (research 91 §6: the only HUD damage cue) -- and, with the overall health (`+0x1044`) lower,
a flinch **unless the cause is 7 or 4** (D:L461402): a fall plays no flinch; its clips are the landing's own
(`FUN_005af590` by the class: 2 `Hit` / `Hit stomach` on a fair coin, 3 `Land forward` and state 8, research 80 §2.4 and
§6c, `mover.ts` `LANDING_HIT_DRAW_READING`). Dead: `FUN_005477a0(0, actor, cause)`, no flinch either. Before the loop
(D:L464933-464940) class 2 raises the exertion meter by 0.66 and class 1 by 0.33 (`FUN_00578150`; research 84 §8 --
the raise is read there, the landing's call is not ported: §6).

### 2.5 Who runs it, and the death (D:L464928-464931, D:L464952-464957)

Before any of the meter, the loop or the reaction, the function asks the actor's controller (`actor+0xc0`, vtable
`+0x34`): true, and it returns class 0 having played the sound only -- **the damage runs on the victim's own console**
(research 91 §21 reads the same `+0x34` as "the controller is remote"; §15 lists falls and blasts as victim-local,
bullets as shooter-resolved). A death the fall caused (alive before, dead after, `f` > 0) sets the actor's killer to the
local player (`FUN_00547aa0(actor, localId, 0)`) and the cause to 0xfd (`FUN_00547a90`): "%s falls to their death",
the weapon name "falling damage", a suicide's -2 (research 91 §5, §8, §10).

### 2.6 The callers

- `FUN_005af590(speed, actor)` D:L466656 -- the landing on the floor (research 80 §2.4): the class back decides the clip.
- `FUN_005af930` D:L466836 / D:L466844 -- the fall's own tick on contact, with the contact speed (`uStack_4`) or the
  stored `+0x1364`.
- **The blast knock's landing** (`Fall forward` / `Fall backwards` in play at the contact, research 85 §12; r0004
  0x5b5a64-0x5b5a88 and 0x5b5e64-0x5b5e88): `FUN_005ac1f0` directly, at the **plain** contact speed (r0004
  0x5b5aa8-0x5b5aac) or the kept `+0x1368` (0x5b5b60-0x5b5b64) -- r0001 D:L466836, D:L466844, D:L466929, D:L466937. No
  factor (R4P-104).
- **`FUN_00580360(speed, actor)` D:L441912-441950 (r0004 0x585900) -- the dive's landing.** Its two callers are both
  under `dive_to_prone` (the clip word r0001 `DAT_003def08` / r0004 0x40a0d8, matched by each build's registration:
  r0001 D:L495336, r0004 the store at 0x5ea248): the landing dispatcher with that clip in play at the contact
  (D:L466908-466914; r0004 0x5b5ce4-0x5b5cfc), and the body's tick with the dive's clip on top and the velocity zero
  (D:L418158-418166; r0004 0x556490-0x55649c), with the kept speed `+0x1364` (r0004 `+0x1368`), then zeroed. With body
  `+0x105c` bit 3 clear (D:L441923; r0004 0x585938-0x585948) and the controller local, **`FUN_005ac1f0(speed x 1.2,
  actor)`** (D:L441929; r0004 0x585980-0x585994, the literal 0x3f99999a). After the call the pop of the stack, the
  `+0x375 = 2` write and the push (`FUN_005a0950(actor, 3, 2)`, then `FUN_00588bc0`) are the **dead** branch -- under the
  alive bit `+0xe1` bit 4 clear, returning 0 (D:L441930-441946) -- while a **living** body returns 1 with nothing pushed
  (D:L441948; r0004 0x585998-0x5859a4 -> 0x585a20-0x585a4c). The dispatcher's call (D:L466914) is the `else` of the
  ordinary landing `FUN_005af590` (D:L466910), so a living dive's landing plays no landing clip at all. (R4P-104 had
  written this as the alive branch; the non-author second read corrected it, C1: the wording before R4P-104 was right.)
  So a dive carried off an edge hurts from a lower drop than a walk-off's: 142.3 a second (a 43-unit fall) instead of
  170.7. Until R4P-104 this note (and `damage.ts`) read the function as the knock's (LEADS L16); seat-kill's r0004
  re-read (2026-11-24) matched the clip words by each build's registration. **Bit 3 of `+0x105c` has more than one
  setter** (the second read's C2; reading, pending review): `FUN_005594b0` (r0004 0x55e7d0, its store at
  0x55e870-0x55e884), `CAiSRescued`'s event 0 online, on an AI state's body (research 179 s8.13, research 180 U13);
  r0001 `CMission::LoadVehicle` (`FUN_002b28d0`, the store at 0x2b2c94; D:L155873-155876), on a non-AI body (its
  controller's vtable +0x38 answering 0) loaded as the first `vehicles.rdr` entry when the mission flags `+0x140` hold
  0x1000 -- in r0004 the same (0x2b46b4) -- and in r0004 a third, `CRemoteCtrl::SetAiNetState` (0x5749e4), a once-only
  latch when a remote AI copy is rescued. That first entry looks like the local player's SEAL (inferred, not traced): if
  so, a player's dive takes no damage in any mission with that flag. Which missions set 0x1000, and whether an online
  player loads through that path, are not traced, so "a player's dive never carries it" is **not established** (§5,
  `DIVE_LANDING_BIT3_READING`).

## 3. The port

### 3.1 The measurement

Unchanged: the room runs every player's `Walker` on the commands the page sends (`MoverSim`), and the walker's `land`
(`mover.ts`) records the landing -- `speed = max(0, -vy)` at contact, the class by `landingClass`, the clip -- the
same tick the page's own mover does on the same commands (research 91 §15, `netcode.test.ts`'s heavy landing: one clip
on both ends). The page sends nothing for a fall; there is nothing it could forge beyond the commands the room already
trusts. The room reads each landing once (`Player.lastLanding`, typed `Landing | null` now).

### 3.2 The damage and the `hurt` (`room.ts` `fallDamage`)

On a new landing: the speed (a dive's x 1.2, §3.4); `fallDamageFraction` (`damage.ts`); none, nothing more. Else
`applyFall` (every part `max x f`, no armour), then **`hurt` to the victim's page** -- `{ health, from: the feet, part: 3 }`,
the reaction's part and the message a round's hit sends (research 91a §7) -- the page's `netPage.ts` moves the bar on
it as it always has; **no `flinch`** (cause 7); the combat report (§3.3); a death `kill(p, null, null, 'fall')` as
before ("%s falls to their death", -2, the body held in `Land forward`: `Walker.dead`). The protocol is unchanged
(`hurt` existed, every field as before; `CombatReport.request` is a string): no bump, nothing additive. An older page
receives a `hurt` it already understood.

### 3.3 The combat report (research 127)

When the room's `combatReport` option is on: one `applied` report to the faller alone, `request: 'fall'`, `part: 3`,
`attacker` = `target` = the player (`selfDamage: true`; the game sets a fall's killer to the player, §2.5),
`rawDamage` the loop's take before the clamp (`sum(max x f)`; no armour, so it equals `damageApplied` while every part
stays over 0), `point` the feet, `distance` null, `weapon` null. Research 127 §6's "not reported" line is retired.

### 3.4 The dive's x 1.2 (R4P-104, 2026-11-24; was "the knock's x 1.2")

`Landing.dived` (`mover.ts`): true for the landing of a dive carried off an edge -- the traversal's dive ends with the
walker in the air (`traversal.ts`, the dive's end) and marks it (`Walker.markDiveFall`); the walker's next landing, if
not a knock's, is the dive's, the mark cleared at every landing, placing and knock. `DIVE_LANDING_SPEED_FACTOR` = 1.2
(`damage.ts`): the room reads a dived landing at `speed x 1.2` (`room.ts` `fallDamage`), and the walker asks its
`fallKills` at the same scaled speed (the room's closure unchanged). A knock's landing (`Landing.knocked`) is read at its
plain speed. The class, the clip and the sound stay the mover's own at the contact speed (the game's `FUN_005ac1f0` call
with x 1.2 would also pick the sound by the scaled speed, which the page does not do: §6). The port's dive landing goes
through the walker's ordinary landing (its clip by class), where the original's 0x585900 pushes the dive's end; that
clip difference is not this row's (§6). `KNOCK_LANDING_SPEED_FACTOR` is removed. (The second read's C1, checked against
the code at this fold: R4P-104 adds no clip to a living body's dive landing -- `Landing.dived` changes only the speed
the room's damage and the walker's `fallKills` ask read; a body that ask kills is the dead branch's.)

**Online AI bodies (R4P-104; research 391 §2.11).** r0004's `FUN_005ac1f0` twin (0x5b1e80) returns class 0 after the
landing's sounds for an AI-controlled body in a network game (0x5b2168-0x5b21a4): no damage, and the ordinary landing
picks class 0's clip, `Jump land hard` (D:L466676-466678). The rule covers **any** AI-controlled body (its controller
`CSealCtrlAi`) on the console that runs it, in a network game -- not a named set of bodies. The port's flag
(`Walker.onlineAi`, set by match `hostageFollow.ts` alone) stands for "is an escortee" (Extraction's hostages; Escort's
VIPs are the same followers): that the original's online AI bodies are exactly those is an inference (the `vehicles.rdr`
NPCs, research 175 / 193; no other online AI spawn was checked; the second read's "PARTLY"). Their damage half was
already r0004's -- the room's `fallDamage` runs over players' landings alone -- and is held since this fold by match
`hostageFall.test.ts`'s room case (a hostage dropped 130 units in a running room: alive, health unchanged); their
living landing over the hard rate plays `landHard` (`AI_ONLINE_LANDING_CLASS`), the landing's `cls` (the sound's)
kept. The CPU seats keep fall damage (`MATCH_BOT_FALL_ADAPTATION`, §5): the spare
keys on the controller's class, never on `sim.ai`. r0004's online landing has no 10-second grace (0x5b52d8-0x5b5300;
research 391 §6.1) and the room has none.

### 3.5 The sound (unchanged) and the one-quantity test

`GameAudio.onLand` is untouched. `packages/viewer/test/fallDamage.test.ts` holds that the damage's speeds are the
sound's (`landSpeeds`) and the mover's (`landingClass`) exactly, and that over a sweep of speeds a landing is classed
hurt (`landingClass(v) >= 1`; until 2026-10-04 `landingHurts`, voiced hurt, removed with the voice moved to the damage
reaction, research 205 §2.2) exactly when `applyFall` takes health.

### 3.6 The landing that kills (FALL-DEATH-LAND, 2026-11-11)

**The defect.** The owner, v0.4.18: "when players fall to their death their character just crouches where they fell
instead of being a dead body on the ground". The mover's `land` picked the clip from the speed alone; the room's
`fallDamage` ran after the command's step and killed. A wounded player killed by a light drop (62-91 units) landed
`Jump land hard` (`seal_land_hard`, a crouch), by a heavy one (91-120) `Hit` or `Hit stomach`; the `dead` setter turned
only a get-up into the held `Land forward`, so when the clip ran out the corpse went back to the ground state. The kill
names no clip for a fall (`deaths.ts` `deathClip`), so every viewer drew that pose: the page's own body (its own mover),
the others (the room's mover through the snapshots) and the replays (`replay/fold.ts` holds only `Land forward` /
`Land backwards`).

**The original's order.** `FUN_005af590` calls `FUN_005ac1f0(speed, actor)` first (D:L466656); on the victim's console
it lays the damage and runs the reaction `FUN_005a54d0(actor, 3, 7)` (D:L464954), which kills a body left at 0. Back in
`FUN_005af590` a body whose alive bit (`+0xe1` bit 4) is clear is forced to class 3 (D:L466658-466660), and over the
hard rate class 3 pushes `Land forward` (`DAT_003deee8`) in state 8 (D:L466663-466664) -- the coin of class 2
(D:L466667-466669) is never drawn. Cause 7 plays no death clip of its own (D:L461387).

**The port.** The order is kept on the console that applies the damage: the mover asks `Walker.fallKills(speed)` before
its pick, and a yes is a corpse's class 3 (`Land forward`, no coin); the room answers it on every living player's mover
(`p.sim.walker.fallKills ??=`, beside `lookContext`) with `damage.ts` `fallKills` -- `applyFall` on a copy of the same
health, the deathless seat never -- and `fallDamage` then lays the damage and the kill as before, on the same command.
The landing's `cls` stays the speed's class: it is `FUN_005ac1f0`'s, the one the sound is picked by (D:L464896-464925);
only the clip follows the forced class. The kill sets `Walker.dead` on that command, so `Land forward` holds its last key
and the stick never cuts it (`runClocks`, `interrupted`). The page has no `fallKills` (its health is the room's word,
heard after the landing): its own mover lands as the living do, and the `kill` (how 'fall') reaches it through
`WalkMode.setDead(true, { fall: true })` -> `Walker.diedOfFall`, which turns a `Jump land hard`, `Hit` or `Hit stomach`
still playing into `Land forward` at the phase reached (both started on the same command) and holds it. A kill heard
once that clip is off -- run out (`Jump land hard` 0.9025 s, the hits 2.8-3.5 s) or cut by the stick past its
NoInterrupt (`Jump land hard` from 0.3325 s; the review's F1) -- finds the ground state: while that hard landing is
still the mover's latest (on the floor since, no landing after it) the body lies in `Land forward` at its last key, as
the room's has by then (`Land forward` runs 0.33 s). The others' copies and the replays follow the room's mover
unchanged (`bodyOf`'s action; `heldLanding`).

**Why the hook and not the `dead` setter alone.** Turning the clip in the setter when the room's kill arrives would draw
the same pose, but after the pick: the room's landing record would name the living's clip, and the class-2 coin would be
drawn for a body the original never draws it for. The hook keeps `FUN_005af590`'s order -- the damage's answer, then the
pick -- on the console that applies the damage; the page's `diedOfFall` is the round trip's correction, not a second
rule.

## 4. Tests and the registry

| test | holds | data |
|---|---|---|
| `packages/viewer/test/fallDamage.test.ts` | the three speeds from the table, equal in the sound, the mover and the damage; the landing's class and the damage share the light speed; `f`'s shape; the six parts, no armour, the clamp; the dive factor, no knock factor (R4P-104) | none |
| `packages/match/test/roomFall.test.ts` | the room: a landing over the light speed takes `max x f` and sends `hurt` (part 3, no flinch) to the victim alone; one under sends nothing; the deadly one kills as a fall (-2); one `hurt` a landing; a knock's landing at its plain speed, and a dive carried off a 50-unit edge at x 1.2 beside a walk-off that takes 0 (R4P-104); a match bot (`sim.ai`) keeps fall damage; no grace at the round's first tick; the combat report | none |
| `packages/match/test/hostageFall.test.ts` (R4P-104) | the landing clip: an escortee's walker (`onlineAi`) dropped 130 / 100 lands `landHard` alive, its `cls` 3 / 2 kept for the sound; a player's walker still lands `landDeath` from 130; and (the second read's fold) the damage: a hostage dropped 130 units in a running Extraction room lands alive, its health unchanged | none |
| `packages/match/test/roomFall.test.ts`, "a fall on Frostfire" | on the MP2 fixture's own ground: a SEAL stood at (531, 202, 905) on the 202 level and walked west leaves its edge at the 15th tick and lands on the 100 floor 102 lower (219-223 a second, class 2, `Hit stomach`): the room takes `max x f` (f 0.72-0.79) and sends one `hurt`. The ledge comes from a scan of the fixture's collision for walkable edges over a 62-unit drop (2026-10-03; the probe was not kept): the 202 level's west edge at x ~525 over z 885-1065, and its east edge at x ~675 (z 885-1115) over the 142 deck or the 100 floor; the 230 level at x 771-945, z 805-989 falls 130 to the floor (deadly) | fixture |
| `packages/match/test/roomFall.test.ts`, "a wounded player killed by a light (class 1) / heavy (class 2) drop" (FALL-DEATH-LAND) | a wounded player (30 % / 50 % of every part) dropped 85 / 100 units: the speed's class 1 / 2, killed as a fall with no clip, the landing's clip `Land forward`, held on its last key, still held after 120 commands with the stick forward | none |
| `packages/viewer/test/walk.test.ts`, "a landing whose fall damage kills" and "told of its fall's death" (FALL-DEATH-LAND) | `fallKills` answering yes lands `Land forward` from a light and a heavy drop with no coin drawn, no as before; `diedOfFall` turns `Jump land hard`, `Hit` and `Hit stomach` into `Land forward` at the phase reached, held, the feet still | none |
| `packages/viewer/test/netClient.test.ts`, "its own fall's kill tells the walk it was a fall" (FALL-DEATH-LAND) | the own body's `kill` how 'fall' passes `fall: true` to the walk; a weapon's does not | none |
| `packages/viewer/test/roundDamage.parity.test.ts`, `netDamage.test.ts` (existing) | `applyFall`'s formula and speeds (loosened to 0.1 of the rounded values) | none |

Registry: [`../parity/registry/round.json`](../parity/registry/round.json) `round.fall.speeds`, `round.fall.damage-fraction`,
`round.fall.sound-and-damage-one-threshold`, `round.fall.reaction`, `round.fall.death`, `round.fall.knock-landing` (the
last's claim corrected by R4P-104 to the dive's x 1.2 and the knock's plain speed -- reading, pending review -- with an
`owed`: §5), all **reading**.

## 5. Placeholders and readings

None added by the 2026-10-03 task, one reading by FALL-DEATH-LAND (2026-11-11), one by LATER 1176 (2026-11-18), two readings and one browser adaptation by R4P-104 (2026-11-24); the dive's x 1.2 is applied without its gate read:

| name | value | why | what settles it |
|---|---|---|---|
| `REMOTE_FALL_DEATH_POSE_READING` (`packages/viewer/src/net/deaths.ts`; FALL-DEATH-LAND) | every viewer's copy of a body that fell to its death is drawn from the room's mover, the victim's console's: `Land forward`, held (§3.6) | on another console `FUN_005ac1f0` lays no damage (D:L464929-464933) and returns class 0, so unless the death has already cleared the alive bit there the landing pushes clip 0xb, `Jump land hard` (D:L466674); how the death's state 8 then reaches that copy (whether it lies down, in what) is not read | **capture spec**: two consoles in one LAN game (PCSX2 x 2 or the recomp, PLAT-36) on Frostfire (MP2); the victim wounded first (one 85-unit drop, about 38 % off), then walked west off the 202 level at (531, 202, 905) onto the 100 floor (102 units, class 2, lethal at that health); record the OBSERVER's screen from the landing to 3 s after, and read the victim's actor on the observer's RDRAM at the landing and each frame after: the animation stack's top clip (the `FUN_00588bc0` push), the state word `+0x174` and `+0xe1` bit 4. Settled by the observer's clip sequence and when (if) state 8 lands; a `Jump land hard` that stands back up would retire this reading for a remote-copy rule |
| `KNOCK_LANDING_GATE_READING` (*note only*; retired 2026-11-24 by R4P-104: `FUN_00580360` is the dive's landing, not the knock's) | -- | -- | replaced by `DIVE_LANDING_BIT3_READING` |
| `DIVE_LANDING_BIT3_READING` (`packages/viewer/src/net/damage.ts`; R4P-104, reading, pending review) | `'ignored'`: every dive's landing the walker marks (`Landing.dived`) is read at x 1.2 | body `+0x105c` bit 3 set skips the dive's landing whole (r0004 0x585938-0x585948; D:L441923). It has more than one setter (the second read's C2; §2.6): `FUN_005594b0` (r0004 0x55e7d0, its store at 0x55e870-0x55e884), `CAiSRescued`'s event 0 in a network game, on an AI state's body (D:L422305-422314; research 179 s8.13, 180 U13); `CMission::LoadVehicle` (r0001 `FUN_002b28d0`, the store at 0x2b2c94, D:L155873-155876; r0004 0x2b46b4) on a non-AI body loaded as the first `vehicles.rdr` entry under mission flags `+0x140` & 0x1000; and in r0004 `CRemoteCtrl::SetAiNetState` (0x5749e4), a once-only latch when a remote AI copy is rescued. "A player's dive never carries it" is **not established**: the first entry looks like the local player's SEAL (inferred), and which missions set 0x1000 is untraced. `'ignored'` reads every marked dive at x 1.2, which holds for a player's dive only where no setter reaches it (research 84 §8 reads bit 2 of the same byte as the aim-point flag) | which missions' flags `+0x140` hold 0x1000 and whether an online player loads through `LoadVehicle`'s first entry; the setters re-read at r0004 (the register-masked writers of `+0x105c` included); a trace of `+0x105c` on a player's body in such a mission |
| `DIVE_KEPT_SPEED_READING` (`packages/viewer/src/net/damage.ts`; R4P-104, reading, pending review) | `'contact'`: the dive's landing reads the walker's contact speed | the dive's landing has a second caller, the body's tick with the dive's clip on top and the velocity zero, reading the kept `+0x1368` (r0004 0x556490-0x55649c; r0001 `+0x1364`, D:L418158-418166); the walker keeps no separate speed | a trace of `+0x1368` beside the contact speed on a dive off an edge (r0004), or capture Q-104 / IQ-073 (d), §6 |
| `MATCH_BOT_FALL_ADAPTATION` (`packages/viewer/src/net/damage.ts`; R4P-104, a browser adaptation: switches nothing) | the port's CPU seats take fall damage as players do | the original has no match bots online; r0004's online spare (0x5b2168-0x5b21a4) keys on the controller's class (`CSealCtrlAi`), which the port gives the escortees alone (`Walker.onlineAi`); the owner's AS-09 note keeps the bots' fall damage | the owner's word, if he rules the CPU seats r0004's AI for this rule |
| `LANDING_FRAME_READING` (`packages/viewer/src/mover.ts`; LATER 1176) | `'next-frame'`: a fall under the flag (`FALL_FLAG_READING`, a walk-off) that reaches the floor on a game frame -- its store strictly under it -- has its feet put there, still airborne; the next frame adds g dt and lands (section 8.6; FLE-1) | `FUN_0057e050`'s bit 0x02 (D:L440727-440728) keeps `FUN_0059b440` off its strict landing until `FUN_0059ad30`'s clamp clears it (D:L456314-456323, D:L456496, D:L456515-456528); the capture and the r0004 trace fit it exactly (sections 8.1, 8.4, 8.5) | a fresh review re-reading the source; the r0004 twins of the two routines re-read; a capture of a jump whose launch has popped |
| `FALL_FLAG_READING` (`packages/viewer/src/mover.ts`; FLE-1) | `'walk-off'`: the walk-off's fall under +0x1061 bit 1, set on the tick ending its first air frame after that tick's floor test; under it the floor test, the lift and the hand-off only on frame-end ticks; a frame-end probe miss clears it (lands at K) | `FUN_0057e050` D:L440726-440728 from `FUN_005af930` D:L466967-466969; `FUN_0059b440` D:L456505-456510; `FUN_0059ad30` D:L456314-456321; `FUN_005b0420` D:L467096-467097 (section 9.4; the plan's item 2-4) | a reading, pending review; the write-watch measured the order (section 9.5) |
| `FALL_POSE_ROOT_READING` (`packages/viewer/src/mover.ts`; FLE-1) | `seal_run` 10.3047, `seal_crouchwalk` 9.3281, the fall clip 10.5977: air frame 1's pose step -0.2930 (the crouched full-stick run) and -1.2695 (the crouched settled walk) | `FUN_0059b870` D:L439111-439116, D:L456611-456612; the disc's `MOTION_P.ZAR` (every key: `fallRootsDisc.test.ts`) | a reading; the rig measured -0.2929 and -1.2695 (section 9.5) |
| `FALL_ROOT_BLENDED_GAITS_READING` (`packages/viewer/src/mover.ts`; FLE-1) | `'no step'`: every other gait at the edge takes no pose step (the standing walk measured +0.4200) | the page animator's `bandPick`, unread for the room | FLE-1B: `bandPick` read against `motion.rdr`, the combination rule, the writer of `+0x14c4` |
| `FALL_FLAG_PLACED_READING` (`packages/viewer/src/mover.ts`; FLE-1) | `'not flagged'`: a placing, a let-go, a seat (`setAirborne`) lands at K, as before | parity clause 7: (a) the branch's condition predicts the flag; (b) the placed 56 u row measured no loss | the plan's open row 1: a write-watch of a placed drop |
| `FALL_ROOT_CROUCH_BAND_READING` (`packages/viewer/src/mover.ts`; FLE-1) | the crouch walk's step on the forward, settled case, level or downhill, dry | `FUN_00584c60` D:L444159-444169 | FLE-1B; a rig walk-off on a slope |
| `FALL_FLAG_OTHER_PATHS_READING` (`packages/viewer/src/mover.ts`; FLE-1; the plan's two names for the peek states and the other writers, as one constant) | `'not followed'`: the peek states' walk-off (`FUN_0057df20`) and the two other clears of bit 1 keep today's behaviour | D:L440678-440679, D:L418164-418165, D:L419830-419831 | reading those functions and r4 0x5a0954 (the plan's open row 5) |
| `FALL_FLAG_GLIDE_READING` (`packages/viewer/src/mover.ts`; FLE-1, the fresh review's F1) | `'not armed'`: a glided move's walk-off (the dive's carry; the navigation probe; the hostage follower) does not arm the flag | the push skipped while the dive (`DAT_003def08`, "dive_to_prone", research 80) is current, D:L466957; the other glides not read | the hostage: two readings (parity clause 7) -- the source predicts its walk-off flagged (`FUN_00550ef0` -> `FUN_005af930` D:L418169; research 334, 433), the AI controller's terms of `FUN_0057e130` / `FUN_00589900` unread; kept unchanged. Settles it: that read, or a rig walk-off of a hostage |
| `LANDING_FOOT_STEP_OFFSET_READING` (`packages/viewer/src/mover.ts` `soilY`; FLE-2, 2026-11-19, reading, pending review) | a standing, placed or landing body held at the floor's y plus its soil's `FOOT_STEP_OFFSET` (-0.8 on GRASS, BROKEN GLASS, LEAVES, ICE, SNOW, GRAVEL; byte 0 by the map's `DefaultMaterial`), s9.1; the falling floor test against the bare floor; a glided move (the dive) on the bare floor. Only the dive's carry stands bare (D:L456503; bare at D:L456544-456559); the hostage's and the probe's glides take the offset. The flagged fall's K lift takes it too: D:L456314-456321 writes the bare floor and sets bit 2 (D:L456320) and bit 0 (D:L456321), and the bit-0 lift path D:L467105-467118 writes floor + offset the same frame; the rig's frame tables (q29, MP12) agree, reaching 42.575 on frame K | a rig row standing on each of the other five soils |

Named stand-ins this rule touches, owned elsewhere: `LANDING_HIT_DRAW_READING` and `DEATH_LANDING_GETUP_PLACEHOLDER`
(`mover.ts`; research 86 §7.2, research 80 §6c and §7) -- the class-2 coin and the offline death landing; unchanged here.

## 6. Not done, and owed

- **FALL-DEATH-LAND: which class the reporter saw** is not known. The report says "crouches", which reads most like
  `Jump land hard`'s pose (class 1, a 62-91 unit drop from a wounded body), but a heavy drop (91-120) ended the same way
  once its hit ran out; the fix covers both, and the owner's run is its acceptance. The report names no map or ledge.
- **FALL-DEATH-LAND: the page's own body after a slow kill.** A `kill` heard after the hard landing's clip is off
  (`Jump land hard` 0.9025 s, or 0.3325 s with the stick held) lays the page's mover in `Land forward` at its last key
  where it stands: a stick held through the round trip has walked the page's body on from the landing point the
  room's corpse lies at (the review's F1; the place is the own-body correction's, not this task's). Recordings made
  before the fix keep the old pose (their snapshots carry the room's mover as it was).

- **A browser spec** (a fall from a known ledge lowering the bar): not written this task. The ledge is now known (§4:
  Frostfire's 202 level at (531, 202, 905), west; the deck `walk.test.ts` uses is 42 over the floor and free), but in
  the match the room's spawn stands the SEAL at its slot and the page has no developer switch to stand it elsewhere
  (`setMode('walk')` from the fly camera places the page's mover, which the room's authority corrects back), so a spec
  would first need the route from a slot to the 202 level or a developer placement the room honours. The headless
  fixture test above holds the same fall on the same ground; the owner's run on the playable page is the acceptance of
  the fix.
- **The others' landings are not heard** by a page (as the footfalls were not before research 91 §22.3): `walkSounds`
  plays the page's own landing only. Not a damage matter; owed to the sound lane.
- **The dive's sound at x 1.2** (R4P-104; was "the knock's"): the game's scaled call picks the landing's sound and class
  by the scaled speed too (§2.6); the page plays the dive's landing at its contact speed (the room sends no landing). A
  difference only when the scaling crosses a class boundary: scaled, 142.3-172.3 a second plain is class 1 (class 0 under
  170.7 plain), 172.3-197.9 class 2 (plain class 1) and over 197.9 class 3 (plain class 1 or 2).
- **The dive's landing clip** (R4P-104; corrected at the second read's fold, C1): the original's 0x585900 pops the stack
  and pushes its clip (`FUN_005a0950(actor, 3, 2)`) on its **dead** branch alone (D:L441930-441946); a living body
  returns 1 with nothing pushed (D:L441948), and the dispatcher does not then run the ordinary landing (D:L466910 /
  D:L466914). The port's dive carried off an edge lands through the walker's ordinary landing (its clip by class: `land`,
  `landHard`, `hit`, `hitStomach`), as it did before R4P-104: a living body's dive landing plays a clip the original's
  does not. A departure older than R4P-104, which adds none (§3.4); owed to the dive's stance work (the R4P-104 review's
  F4), not this row.
- **Capture Q-104 / IQ-073** (R4P-104; owed; makes §3.4 proven): r0004 online, Extraction or Escort, the host's view, the
  drop's height read: (a) a hostage or VIP led off a drop over 120 units: health unchanged, alive, `Jump land hard`, the
  landing sound; (b) a player dropped over 62 units in the round's first 10 s: damage taken (no grace online); (c) a
  player's fatal fall: `<name> falls to their death`, deaths +1, score -2, no kill to anyone; (d) a dive off a 45-55
  unit edge beside a walk-off from the same edge: only the dive hurts; (e) a knock-down from the same height: no damage.
- **The dive case's 157 a second is the port's** (the R4P-104 review's F5): the test's contact speed is the PORT's fall
  after a dive leaves an edge (`roomFall.test.ts`), not a read of the original's contact speed after a dive's own
  descent; Q-104 (d)'s "only the dive hurts" is a prediction from the port's fall, which the capture settles.
- **The exertion meter's landing raise** (+0.33 / +0.66, §2.4) is not ported (research 84 §8 reads the meter).
- **States 8 and 10** take no damage in the game (§2.2); the room applies the fall to living players only (state 8 is
  covered); state 10 is not modelled by the mover.
- **Proof**: a capture of the original -- a PCSX2 or recomp run with the RDRAM's `+0xffc..0x1010` read before and after
  a measured fall -- would raise §2.3 to proven. None exists.

- **The owner's eye, 2026-10-04** (HUMAN_TASKS H77): on his own run on the preview a fall deals its damage --
  "appear correct". The acceptance by the eye is met; the dive's gate bit (`DIVE_LANDING_BIT3_READING`, §5; was "the
  knock's") and a capture of the original stay owed as above.

## 7. Settled, not settled

- Settled at the reading level: the quantity (the contact speed), the three speeds and their formula, the one
  threshold, the fraction, the six-part loop with no armour, the reaction's part and cause, the victim-local run, the
  suicide, the dive's x 1.2 (R4P-104: was "the knock's"; reading, pending review).
- Not settled: `+0x105c` bit 3 (§5, `DIVE_LANDING_BIT3_READING`): it has more than one setter, one of them
  `CMission::LoadVehicle`'s on the first `vehicles.rdr` entry under mission flag 0x1000, so whether a player's dive can
  carry it is open (the second read's C2); the damage voice's call site inside the reaction (research 81 §9's reading);
  whether `+0x1364`'s stored speed (D:L466844) ever differs from the contact speed the port measures.

## 8. Measured on the original, 2026-11-15, and the landing's frame (LATER 1176, folded into FLE-1 2026-11-18)

Added 2026-11-15 (R145). **Level: measured on the original running, one match, by placement -- a body set at rest in
the air by a set-up write and left to fall -- pending review, and a placement can itself add a frame or a height
offset (the frame the body is released on, its first step), so the thresholds of §2.1 are NOT re-filed from it.** Every
claim above keeps its level and its text. The record: `evidence/weekend-mega-2026-11-14/rig/RELAY1-mp12-B3-fall-damage-B1-closed-1302Z.md`
on the sprint's hub (MP12, the emulator rig; the placement logged, the six healths read every row, the armour never
changed; the 56 u and 75 u rows added by the main controller's relay of the same session).

The loss is one fraction of each part's maximum, the same on all six -- the shape of §2.3 (`max x f` on every part, the
head included, no armour step). Beside it, the port's own drop from rest over a flat synthetic floor
(`packages/viewer/test/fallDrop.test.ts`, the real `Walker`; unit test, synthetic geometry):

| drop (units) | measured loss (original) | port's contact speed (units/s) | port's game frames in the air (speed / g dt) | port's loss | test |
|---|---|---|---|---|---|
| 50 | 0 | 156.83 | 20 | 0 | passes |
| 56 | 0 | 164.67 | 21 | 0 | passes (the open one, below) |
| 62 | 0.143 (every health x 0.857) | 172.51 | 22 | 0.027 | fails, off 0.116 |
| 75 | 0.381 (x 0.619) | 188.19 | 24 | 0.262 | fails, off 0.119 |
| 90 | 0.614 (x 0.386) | 203.87 | 26 | 0.497 | fails, off 0.117 |
| 120 | dead (all six 0) | 235.24 | 30 | 0.966, alive | fails |

The test is a red kept on the branch (R145): no cure is opened from it.

**The order, read (source inspection, 2026-11-15; reading, pending review):** the port's order is the original's. Each
game frame `FUN_0059b440` adds g dt to the fall speed (D:L456496-456497), moves the altitude by the new speed
(D:L456498), tests the floor (D:L456513) and, landing, writes that speed -- this frame's g dt in it -- to the caller's
local before zeroing the stored one (D:L456514-456516); `FUN_005af930` hands the local to `FUN_005af590` (D:L466910)
and so to `FUN_005ac1f0` (D:L466656). The port's air step and `land` do the same (`packages/viewer/src/mover.ts`). So a
body at rest h over a floor lands on the first frame k with h <= g dt^2 k (k + 1) / 2 carrying k g dt, in both: the
port's 20 / 21 / 22 / 24 / 26 / 30 frames above. Exceptions read in the original and not compared here: inside the
step-down tolerance the speed is not zeroed and keeps accumulating (D:L456499-456502, D:L456526-456528); a landing
onto a slide keeps the speed from before the step (D:L456525); the knock and the dive use the stored `+0x1364`.

**What the capture then says (two readings, neither established):** its losses are the curve of §2.3 at ONE FRAME MORE
than that -- k + 1 = 23 / 25 / 27 / 31 frames at 62 / 75 / 90 / 120 units give 0.144, 0.379, 0.614 and dead, each within
0.01 of the measured. (a) The placed body's true drop was more than the stated height by 4.196 to 4.439 units (the 62 u
row needs more than 4.196, the 56 u row at most 4.439): this fits all six rows, the 56 u row too. What would make it
so is not read. The snap offset the original adds to the floor's height on landing (a runtime table's `+0x38`,
D:L456518-456523; the port snaps to the bare floor) is NOT a good candidate: the floor test is against the bare floor
(D:L456513) and after the snap the airborne bit clears only at or below it (D:L456525-456527), so the offset is zero
or negative wherever a landing works, and a height measured from the standing body would make the drop shorter, not
longer (the fresh review, 2026-11-15). What the placement wrote, and from which datum the height was stated, are. (b) The original's fall starts with one g dt
already on: this fits 62 to 120 units and MISSES 56 u (a loss of about 0.03 where none was measured). Under (a) the
red of `fallDrop.test.ts` is the placement's and the port is right; under (b) the port's fall start is one frame
short. Nothing is changed on either.

**What would settle it:** the read of where the original detects the landing and which speed it hands `FUN_005ac1f0`
(`FUN_0059b440`'s fall step, `FUN_005af930`'s contact test and its stored `+0x1364`, `FUN_005af590`; §7's open
question on `+0x1364` is the same one); and on the rig either a walk-off drop from a real ledge (no placement), or the
58 u and 61 u placements with the release frame logged.

The walk-offs from real ledges have since been logged, and reading (b) as stated does not fit all three of them: §9.3.

**The landing's frame: why the stair cap hurts in the original and not in the port (LATER 1176, X8; coreB, 2026-11-18).** *(Was its own section 8 on `agent/later-1176`; merged here on the main controller's ruling (A), 2026-11-18: LATER 1176's late landing is FLE-1's first half, FLE.R4.)*

Level: **reading, pending review** (source inspection; a fresh review owed), backed by a **capture comparison** of the
original (relay-3, PC 3, r0004, MP51 Vigilance, a LAN room, placed by a position write, then the original's own walk:
`agent-mail/evidence/later1176-sweep/`) and a dev-disc replay of the port (unit tier, `agent/next` bb4a86da62). The
threshold and the fraction of section 2 are NOT in question: they hold exactly once the speed handed over is the one
below.

### 8.1 What the original does (C)
- On MP51's stair wall cap (x 634-640, y ~117) the original is unhurt for last full free-fall steps of 139.0-152.9 u/s
  and hurt from 156.83 (every part x 0.9730), 164.67 (x 0.8556), and the parapet controls at 168.60 (x 0.7968). The step
  is the last whole 30 Hz frame's fall (`(y[k-1] - y[k]) / dt`, the y word; the velocity words read 0 on r0004), each
  frame's increment 235 dt^2 = 0.2616 with dt = 525/15734 (`GAME_FRAME_DT`).
- Every drop's frame that reaches the street leaves the body ON the street with the airborne bit (`+0x105e` bit 0x20)
  still set; the landing (the bit clear, action 11) is the NEXT frame, which adds g dt once more, so the speed the damage
  reads is the last full step + 2 g dt (g dt = 7.841): 156.83 -> 172.51 -> 0.9730 (run-z526, run-z540, walk-z540),
  164.67 -> 180.35 -> 0.8556 (run45-z536), 168.60 -> 184.28 -> 0.7967 (the parapet), all against the measured fractions
  to 1e-4; 152.9 -> 168.6, under 170.70, unhurt (walk-z510, walk-z534). Only + 2 g dt fits (+ 1 leaves every hurt drop
  unhurt, + 3 hurts walk-z510). The three drops that seemed to land on the contact frame (walk-z510, walk-z534,
  run45-z536) have a two-frame gap before the first grounded row, the row inside it a torn read: their contact frame was
  not recorded (the review's finding 3).

### 8.2 Why, at the source (D)
- `FUN_005af930` takes the frame's starting fall speed (`+0x133c`, r0001's offset) into its local (D:L466790) and hands
  its address to `FUN_0059b440` (D:L466809). A walk-off's damage takes that local through `FUN_005af590` (D:L466910),
  which calls `FUN_005ac1f0` (D:L466656). (D:L466833-466836 is the blast knock's own branch -- the fall forward /
  backwards states -- not a walk-off's.)
- What decides the landing's frame is a bit of `+0x1061`, not the floor record. `FUN_0057e050`, which pushes the fall
  action (9), sets `+0x1061` bit 0x02 and clears 0x04 (D:L440727-440728). While 0x02 is set, `FUN_0059b440` takes the
  branch at D:L456506-456511, which does nothing with 0x04 clear, and its strict landing (D:L456513-456516) is not
  reached. `FUN_0059ad30`'s last block (D:L456314-456323) fires only with 0x02 set and 0x04 clear: it clamps the
  altitude `+0x2e4` to the frame-end probe's floor (the floor `FUN_005b0420` hands it, D:L467105), clears 0x02 and sets
  0x04 | 0x01 -- and leaves the fall speed and the airborne bit alone (`FUN_005b0c10` touches neither). On the next frame
  `FUN_0059b440`'s other branch adds g dt (D:L456496), takes the speed into the local and zeroes it (D:L456515-456516)
  and clears the airborne bit (D:L456528). So a walk-off always lands ONE FRAME AFTER the frame that reaches the floor.
- The reading is r0001's code against an r0004 capture; r0004 inserts a field at `+0x1334`, so r0001's `+0x133c`,
  `+0x1340`, `+0x1360`, `+0x1364` are r0004's `+0x1340`, `+0x1344`, `+0x1364`, `+0x1368` (DEEP-LADDER-RULE-SHEET, the
  `FUN_005a21b0` row). The r0004 twins of `FUN_0059b440` / `FUN_0059ad30` / `FUN_005af930` were not checked; the exact
  fit of 8.1 is strong indirect evidence they behave the same.

### 8.3 What the port does (U; a dev-disc replay of the sweep's step-offs)
The port's drops match the original's within ~0.5 u (48.6-57.4 against 48.95-57.95), but the port ends the fall on the
frame-end floor test itself (`Walker`'s air step: one g dt and the step, then `land` as soon as `s.y <= floor.y`, taking
`-vy`): it hands the last full step + 1 g dt (164.67 at z 526-540 where the original hands 172.51) -- class 0, no damage.
The bug is the landing's FRAME, not the speed's formula nor the threshold. (The air step's comment reading
D:L456502-456512 as the branch that zeroes the fall speed misreads it; the fix corrects it.)

### 8.4 The r0004 trace (C; a memory trace of the original, relay-2, PC 2, MP51 LAN, 5 trials, every frame; 2026-11-18)
The internal words on r0004 (the fall speed at `+0x1340`, r0001's `+0x133c` moved by the field at `+0x1334`) confirm
8.2 on the build the capture and the spec are: the word grows 7.841 every falling frame (a walk-off's first step 3.928);
on the frame that reaches the floor it is still non-zero (168.595 at run-z540, 156.826 crouched / 164.667 STANDING at
walk-z534) with the airborne bit set (`+0x105e` 0x29); the next frame it reads 0 (the bit clear, 0x09; action 9 -> 11):
g dt added, handed and zeroed within that frame. The damage is the word + g dt: run-z540 0.0859 predicted / 0.0858
measured (twice); walk-z534 crouched none (164.67 < 170.70); walk-z534 STANDING 0.0271 / 0.0270. No trial landed on the
contact frame. `+0x2e4` equals y on every frame. One detail differs from the r0001 reading: on the clamp `+0x1061` goes
0x02 -> 0x04 with 0x01 CLEAR (8.2 read 0x04 | 0x01); it does not move the frame.
So the player's report holds STANDING: a standing walk-off from the cap at z 534 hurts in the original (x 0.973).

### 8.5 The standing rerun (C; relay-3, PC 3, r0004 MP51, posture 0 at the step-off row, 2026-11-18)
The fall speed (`+0x1340`) on the last airborne frame + g dt against the measured fraction: run-z510 156.83 -> 164.67,
unhurt (unhurt); run-z526 and run-z540 164.67 -> 172.51, 0.9730 (0.9730); run45-z536 172.51 -> 180.35, 0.8556 (0.8556).
Standing hurts exactly as crouched (the same fractions); the two walk drops were invalid (the body slid off while standing
up). `+0x2e4` = y at the step-off and the landing.

### 8.6 Built (LATER 1176, folded into FLE-1, coreB, 2026-11-18; reading, pending review)
- On the main controller's ruling (A) (2026-11-18) LATER 1176's late landing is FLE-1's first half (FLE.R4: the walk-off's
  pose step and late landing one task), built to the fall-leave-edge plan (`docs/plans/2026-11-15-fall-leave-edge.md`,
  "FLE-1, what is built"): the walk-off alone falls under the flag (`FALL_FLAG_READING`); frame K -- the first store
  strictly under the floor -- lifts the body, airborne, the speed kept; K+1 adds g dt and lands; a frame-end probe miss
  clears the flag (lands at K); the pose step (`FALL_POSE_ROOT_READING`) on air frame 1 for the two single-clip crouched
  gaits. A placed body and a let-go are NOT flagged (`FALL_FLAG_PLACED_READING`): they land at K as before (agent/later-1176's
  first build delayed every `Jump fall`; reverted).
- Held by `viewer/test/fallPoseStep.test.ts` (the plan's tests 1-6, the strict lift and the glide pin), `match/test/fallLedgeRoom.test.ts` (test 7, the room: 63.48 / 69.64 u green, 99.61 u red until FLE-2), `fallRootsDisc.test.ts` (test 0, every key),
  `landingFrame.test.ts` (MP51's run-z540 172.51 class 1, run-z510 164.67 class 0, dev disc), `fallLedge.test.ts`'s 63.48 u
  and 69.64 u rows (green with FLE-1), and the re-pinned walk-offs of `jump.parity.test.ts` / `walk.test.ts`.
- Red until FLE-2 (the soil offset, LATER 1095), named: `fallLedge.test.ts`'s two 99.61 u rows (K 28 on a floor at the rest
  height against the original's 27) -- their green before FLE-1 was an accident of two errors that cancel (the missing late
  landing and the test floor 0.8 under the bare floor). `fallDrop.test.ts`'s 62 / 75 / 90 / 120 u rows stay red, unchanged
  (the plan's open row 1, placed drops).

### 8.7 Owed
- FLE-2 (the soil's `FOOT_STEP_OFFSET`, LATER 1095): its step 0 (the box diff of a scratch standing offset) and its rig row
  (`l-fle2-soil`, MP12's soils, PC 3) are queued; FLE-1 and FLE-2 go to the merge seat together (the plan's gate).
- FLE-1J (the running jump under the flag) and FLE-1B (the blended gaits): their own reads first.
- Not modelled: a flagged body that rises into ground (the clamp clears the bit there in the original); the r0004 twins
  of `FUN_0059b440` / `FUN_0059ad30` not re-read.
- Reviews: reviews/later1176-landing-review.md (the reading); the fix's first review (PASS WITH FINDINGS) on
  agent/later-1176n, its findings carried; FLE-1's own fresh review owed.

## 9. Found, not fixed: the ground offset, the bar's loss trail, the ledge series (R145 follow-ups, 2026-11-15)

Added 2026-11-15 (R145). Three findings beside §8. **Each is found, not fixed: no constant yet, and the build waits for
a claim** (the controller's ruling: this section is text only, so the two names below are proposed, not added, and each
is `*note only*` until a claim builds it). Every claim above keeps its level and its text.

### 9.1 The ground offset (LATER 1095)

**Level: reading, reviewed PASS WITH FINDINGS (source inspection, then a fresh review of it); the six values by the
port's golden.**

**Built (FLE-2, 2026-11-19, reading, pending review):** `packages/viewer/src/mover.ts` `soilY` -- the port no longer stands
every body on the bare floor (the paragraph below is the state before it); `LANDING_FOOT_STEP_OFFSET_READING` in the list above. The read and its review, on the sprint's hub: `evidence/bug-reports-review-2026-11-15/R145-offset-and-bar-read-2026-11-15.md`
and `.../R145-offset-and-bar-read-review-2026-11-15.md`; where they differ, the review's reading is the one kept.

The `+0x38` that §8 calls "a runtime table's" is the soil record's `FOOT_STEP_OFFSET`: `FUN_002dde40` fills the soils
table from `materials.rdr`'s `SOILS` list and stores that key's float at `+0x38` (D:L181399-181401), the record made
with 0 there first (`FUN_002deb30` D:L181788), so a soil without the key has no offset; entry 0 takes the map's default
material's record, offset included (`FUN_002ddc30` D:L181208). The index is the floor polygon's material byte
(`FUN_002dc1d0` D:L180305-180320). The altitude is up-positive, so a negative offset holds the body under the floor's
height.

Where the original applies it: the every-frame hold on the ground is `FUN_0059b440` D:L456513-456523 -- with the
altitude at or under the bare floor it writes floor y plus the offset, and with a negative offset the result is still
under the floor, so the next pass writes it again. (`FUN_005b0420` D:L467105-467118 writes the same sum once, at a
lift transition, not every frame: the review's finding 1.) The same function leaves the body on the BARE floor in three
cases: both bits 1 and 2 of `+0x1061` set (D:L456509); a dive (`FUN_00577e40` with `DAT_003def08`, ending at
D:L456559; the name "dive" is a port note's, research 92); and the whole floor block skipped when its two checks are both
true (D:L456491, else D:L456563). So "the original stands 0.8 low on those soils" holds on the ordinary walking path
only. The port stands every body on the bare floor (`packages/viewer/src/mover.ts` `s.y = floor.y`, about :5261); the
offset is applied only to the climb's height (`packages/viewer/src/climb.ts` `footStepOffset`; research 281).

The values: -0.8 on GRASS, BROKEN GLASS, LEAVES, ICE, SNOW and GRAVEL, and no offset on every other soil -- by the port's
golden (`packages/sound/test/golden/materials.json`, pinned against a `READERC.ZAR` fixture by
`packages/sound/test/walkTables.parity.test.ts` where the fixture is present), not by a decode in this read or its
review. The re-read off the real disc is the dev-disc test `packages/sound/test/soilsFootStepOffset.devdisc.test.ts`
(every soil logged, the six asserted at -0.8 and every other at 0 or absent), **run 2026-11-15 on the sprint's hub
against the disc tree** (a dev-disc test, 1 passed, not skipped): 46 materials, those six soils each -0.8, and no other
soil carries the key (it reads `null`, not 0) -- the values are a reading of the disc, pending review. The rig's walk-offs (§9.3) are consistent with it -- `+0x404` reads 43.375 under the falling
body and the body rests at 42.575, 0.8 below -- but which soil MP12's lower floor is was not read, so that is not
taken as the value's proof.

Not the cause of §8's extra frame: the offset is zero or negative and the landing's floor test is against the bare floor
(§8). The proposed name, **not added**: `LANDING_FOOT_STEP_OFFSET_READING` (*note only*; no constant yet) -- the height
a standing or landing body is held at, floor y plus the floor soil's `FOOT_STEP_OFFSET`, with the three bare-floor
cases above. What settles and builds it: the dev-disc test's run; the term applied through the climb's soil lookup
(with LATER 959's default for byte 0) on the ordinary path only; a unit test on a grass floor and one on a dive; and a
rig row of `+0x2e4` against the floor y standing on a known soil.

### 9.2 The health bar's loss trail (LATER 1096)

**Level: reading, reviewed PASS WITH FINDINGS (the same read and review as §9.1, part B); the units inferred.** In the
original the bar's fill steps to the new health at once (`FUN_00241cc0` D:L89996-90008); on a drop a third quad is laid
over the span just lost (D:L90009-90015; a further drop widens it, D:L90016-90026), held 0.6, then drained toward the
new edge at 0.54054 bar widths per unit of the step it is ticked with until it is gone (`FUN_00242050`
D:L90085-90117; the 0.6 and 0.54054 are the ELF's initialised data words the read and the review each read). The units
"seconds" and "per second" are INFERRED -- consistent with the colour fade beside it -- not traced to a clock: the
ticking callers have no direct caller in the decompilation (the review's finding 3). The quads' colours are unread
(uninitialised data, no writer found), so the reporter's "yellow to red" is not confirmed. The port draws two quads, the
health and the lost share, and no trail (`packages/viewer/src/hud.ts` about :1655-1660; the room's `hurt` sets the bar at
once, `packages/viewer/src/netPage.ts` about :2339-2345). The proposed name, **not added**:
`HEALTH_BAR_LOSS_TRAIL_PLACEHOLDER` (*note only*; no constant yet). What settles it: the clock the bar's tick is
handed, the colours' initialiser, or one captured frame sequence of a hit on the original.

### 9.3 The ledge series

**Level: captures of the original by walk-off, pending review** (one match, q29 on MP12, two rounds; the records, on the
sprint's hub: `evidence/weekend-mega-2026-11-14/rig/RELAY1-q29-R145-real-ledges-first-1520Z.md` and
`.../rig/RELAY1-q29-R145-half-frames-six-falls-1526Z.md`, the second superseding the first's counts). Bodies placed on
a ledge's top 25 u back from the edge walked off it crouched by their own stick, the fall speed and the root read every
row. At true drops of 63.4758 / 69.6398 / 99.6125 u (the top's root y on the frame the body leaves the edge down to the
rest root) the original's whole-step runs land after 23 / 24 / 28 steps, every health x 0.856 / 0.738 / 0.268. Its own
clock occasionally takes a half frame, and those runs lose differently off the same ledge (63.48 u: 21 whole and one
half, x 0.914; 69.64 u: 22 whole and one half, x 0.797); the port steps whole frames only, so it is compared with the
whole-step runs.

The port's crouched walk-off over synthetic ledges of those heights (unit test `packages/viewer/test/fallLedge.test.ts`;
the hub's run, 2026-11-15 15:31Z: 2 failed, 2 passed) gives 22 / 23 / 28 -- one step short on the two low ledges, right at
99.61 u. A plain "one step of speed before the height moves" (reading (b) of §8) would give 23 / 24 / 29, so it does not
fit all three. No cure is opened and the mover is not changed; both reds, `fallDrop.test.ts` and `fallLedge.test.ts`, are
kept on the branch.

### 9.4 The leave-the-edge path, read in both builds (found, not fixed)

Level: **reading**, re-read by a fresh reviewer (source inspection of the r0001 decompilation and of the r0004 image
at its native addresses, OT.R97; the clips' root heights from the disc's `RUN/MOTION_P.ZAR`, byte-identical in both
trees, read outside the repository's test readers). Nothing in THIS section is proven. (A pointer, this section's level
unchanged, 2026-11-15: a write-watch measurement of three walk-offs exists and its per-hit files have been read --
section 9.5, with its own level; the files hold no registers. This section is not re-filed on it: it stays the
reading, and section 9.5 says what of it the measurement confirms. The cure's plan is
`../plans/2026-11-15-fall-leave-edge.md`.) No constant
is added and no source file changes; the cure is its own task after the release (the controller's ruling, 2026-11-15).

**The frame tables.** The rig's two whole-step tables (99.61 u and 63.48 u; a capture of the original, pending review)
beside the port's own (`packages/viewer/test/fallLedge.test.ts`; the hub's run 2026-11-15T15:55:59Z, 4 failed, 2
passed): the port's fall speed equals the capture's on every air frame; its root is 0.2930 high from AIR FRAME 1 on
(the original's first air frame drops 0.5546, the port's 0.2617); at 99.61 u the port takes 28 air frames against 27,
at 63.48 u both take 22 and the original's loss is for 23 steps.

**Two rules explain it, and they share one flag** (actor `+0x1061` bit 1):
- *The pose step.* On the first air frame `FUN_005af930`'s airborne branch pushes Jump fall (action 9) through
  `FUN_0057e050` (D:L440726; r4 0x5832c0), which sets the bit (D:L440727; r4 0x583348-0x58336c; bit 2's clear,
  D:L440728, is the next store, r4 0x58337c), before the animation
  pass (`FUN_0057a330`, D:L418454 after D:L418169; r4 0x556ff4 after 0x5564ac). Under the bit, `FUN_0059b870` adds
  last frame's skeleton-root y minus this frame's to the altitude (D:L456584, D:L456612; r4 0x5a14e4-0x5a14f8; the
  root passed from `+0x14c0`, D:L439111-439116; r4 0x580200-0x580220). The root sits 10.3047 over the feet in
  `seal_run` and 10.5977 in `seal_runningjump_in_air`: 75/256 = 0.29297, and 0.2617 + 0.2930 = 0.5546. The rig's body
  left the edge at 65 u/s, the run's speed.
- *The late landing.* While the bit is set `FUN_0059b440` skips its floor test (D:L456505-456510; r4
  0x5a1198-0x5a11e0): frame K goes under the floor; `FUN_0059ad30` lifts the body to it and clears the bit
  (D:L456314-456321; r4 0x5a0a38-0x5a0ab8, the last store setting bit 0); `FUN_005b0420` snaps it to the floor plus
  the soil's offset
  (D:L467105-467118; r4 0x5b62c8-0x5b6320; §9.1) with the speed still K steps; frame K+1 adds one more g dt, finds the
  body at or under the floor (a plain `<=`, r4 0x5a11e8-0x5a11f4) and hands K+1 steps to the loss (D:L456513-456523;
  r4 0x5a120c-0x5a1278). K = 22 / 23 / 27 on the three ledges gives the captured 23 / 24 / 28. The K+1 step, GIVEN K,
  does not depend on the soil's offset; K ITSELF DOES, through the drop's datum (corrected 2026-11-15, the plan's fourth
  and fifth reviews): the drops of section 9.3 are stated to the REST root, the fall is tested against the BARE
  floor, and on the 63.48 u ledge the lower floor's word reads 0.8 over the rest height while the top's equals the
  altitude (section 9.5; "no offset on the top" is an inference from that). The 99.61 u ledge ends on a
  lower floor at the same heights (rest 42.575, the floor word 43.375) and its top's floor word also equals its root, 142.1875 (section
  9.3's relays, `RELAY1-q29-R145-two-frame-tables-R142-sample1-1537Z.md`). So there the body goes under the bare
  floor on frame 27; against a floor placed at the rest height it would on frame 28. As section 9.1 says, which soil
  these floors are is not read, so none of this is the offset's proof.

**Their scope.** The bit is set by more than a walk-off -- the running jump among them (`FUN_0057e1b0`, D:L440824;
`FUN_0057df20`, D:L440678) -- so both rules hold for every fall begun under it; a cure for walk-offs alone would not
be the transcription. On the three ledges the frame counts are the same with or without the pose step: the losses rest
on the late landing, the pose step on the heights (the tables; the 39.56 below-floor write).

**Not settled.** The placed 56 u row of §8 (the late landing alone gives a loss of 0.027 there, 0 was measured; every
placed row fits only with a drop 1.06 to 1.56 u shorter than stated); the run's posed root (research 80 records an
r0004 trace of a crouch run's root moving 10.02-10.79, below `seal_run`'s constant); the fall clip's `+0x4a` flag; a
new r0004 refusal of the push in `FUN_0057e130`'s twin (r4 0x583450-0x583470, two terms unread). The rig's write-watch
(the program counter of every write to `+0x2e4`, the fall speed r4 `+0x1340` and the byte `+0x1061`; the root's y; a
standing walk-off, predicted to RISE 0.4141 on air frame 1, and a slow crouch walk-off, predicted 1.2695) settles them.

**What a cure would be** (a proposal; nothing built): the pose step on every game frame while the flag is set -- the
mover carries no posed root today, and the room computes the damage, so the root's height must reach both; the landing
handed on the next game frame with one more step, which also moves the landing's clip, sound class, still test and
jump lock; the soil's offset at the snap (LATER 1095). A constant 0.293, an unconditional extra step or a walk-off
switch would be fitted to the capture, not transcribed.

### 9.5 The write-watch of three walk-offs (measured on the original, 2026-11-15; re-read twice at the files)

**Level: a memory trace of the original running, compared value for value with section 9.4's reading and re-read at
the files by two fresh reviewers (2026-11-15; the second, of this text as it stands, PASS WITH FINDINGS). NOT YET
PROVEN: that the traced image is the original at the cited addresses rests on the rig's own comparison, unread here
(the LEVELS paragraph at this section's end, by the main controller's ruling of 2026-11-15). Until it is read the
level is "reading, measured, the image comparison unread", and nothing may lean on this section as proven.**
Tolerance: the files' four decimals
(0.0001); a value is "equal" below only when it agrees to that. Nothing is built on it and no constant is added.

**The source.** The rig's record and its per-hit files, on the sprint's hub:
`evidence/weekend-mega-2026-11-14/rig/q30-r145-r141/RECORD.md` (section 2) and `cases/X1run-`, `X2run-`, `X3walk-`,
`X4crouch-wwatch.csv` (r0004 on the rig's emulator; by the rig's record the running image compared equal, in a 128-word
window round every address cited here, with the r0004 PINE dump this project's r4 reads use (section 9.6: sha256
08be8ce7...ae9bd; a dump of
r0004 running, `plans/r0004-option-b.md` R4B.R4; r0004 is the online revision and is not on the disc, which holds
r0001); write watchpoints on the altitude `+0x2e4`, the fall speed r4
`+0x1340` and the byte `+0x1061`, armed round the edge and round the landing only; each hit's program counter and the
state before and after its one stepped instruction). The ledge: MP12, top 106.0508, the floor below 43.375, the rest
height 42.575 -- the 63.48 u ledge of section 9.3. Three gaits: a crouched full-stick run (X1run, X2run), a standing
light-stick walk (X3walk), a crouched light-stick walk (X4crouch).

**Read by this note's author from the four files** (a script over every hit row; not the record's tables copied) **and
compared one for one with RECORD.md's tables: no value differs.** What the files add or qualify:
- The files hold 18 columns a row (the program counter, the return address, the clock, the state and the state after
  the step); they do NOT hold the 32 registers the record's method names.
- X1run is partial: its watch was armed a frame late and stopped before the landing (27 hits; air frame 1 from the
  altitude store on, no frame K). Its byte read 0x80 on the top and 0x80 -> 0x82 at the push, where the other three
  read 0x84 and 0x84 -> 0x86 -> 0x82: on that walk-off bit 2 was CLEAR on the ground before the edge. Why is not read
  (X1run was the first walk-off after the body was placed).
- On the top the floor word `+0x404` EQUALS the altitude (106.0508) on every row of all four files before the
  edge frame (on the edge frame the word already reads the floor below, 43.375, the altitude still the top's). Read as
  the
  bare floor's height under the body (an INFERENCE: the lift at r4 0x5a0a64 writes exactly this word's value, the
  floor record's y, D:L456319), that says the top's soil carries no offset. Below, the
  floor reads 43.375 and the body rests at 42.575 (section 9.1's 0.8).

**Air frame 1, the same order in X2run, X3walk and X4crouch** (r4 program counters; X1run from the second line on):
1. r4 0x5a1068: the fall speed 0 -> 7.8413 (g dt).
2. r4 0x5a107c: the altitude 106.0508 -> 105.7891 (-0.2617, g dt squared).
3. r4 0x58336c: the byte `+0x1061` 0x84 -> 0x86 (bit 1 set); r4 0x58337c: 0x86 -> 0x82 (bit 2 cleared).
4. r4 0x5a14f8, the bit-1 add: the altitude changes by the root's copy `+0x14c4` before the frame minus 10.5977.

| walk-off | `+0x14c4` before | the altitude at the add | the step | section 9.4's reading | equal |
|---|---|---|---|---|---|
| crouched full-stick run (X1run, X2run) | 10.3047 | 105.7891 -> 105.4962 | -0.2929 | -0.2930 (`seal_run` 10.3047) | yes |
| crouched light-stick walk (X4crouch) | 9.3281 | 105.7891 -> 104.5196 | -1.2695 | -1.2695 (`seal_crouchwalk` 9.3281) | yes |
| standing light-stick walk (X3walk) | 11.0176 | 105.7891 -> 106.2091 | +0.4200 | +0.4141 (`seal_walk_alert` 11.0117) | NO: 0.0059 |

The gated add (r4 0x5a1574) appears in none of the four files. On every later watched air frame the bit-1 add leaves
the altitude unchanged (`+0x14c4` 10.5977 against 10.5977) -- write-watched on air frames 2 and 3 (X1run: 2 to 4) and on
frame K. Between them the plain row samples, at least one a clock value, read `+0x14c4` at 10.5977 on every air frame
and each
altitude step as gravity alone (within 0.0002): so "10.5977 through the fall" is supported by the samples on this
ledge, beside the clip's reading.

**The landing, the same in X2run, X3walk and X4crouch.** Frame K: r4 0x5a107c takes the altitude under the floor
(48.1259 -> 42.5003 the run; 48.8387 -> 43.2132 the standing walk; 47.1493 -> 41.5237 the crouch walk); 0x5a14f8 no
change; 0x5a0a64 lifts it to 43.375; 0x5a0a98, 0x5a0aa8, 0x5a0ab8 take the byte 0x82 -> 0x80 -> 0x84 -> 0x85;
0x5b62b8 -> 0x84; 0x5b6320 snaps the altitude to 42.575 -- the fall speed 168.5953 on every one of those hits. Frame
K+1 (the next clock value): 0x5a1068 168.5953 -> 176.4366 (one whole g dt more); 0x5a107c 42.575 -> 36.6878;
0x5a1228 the speed -> 0; 0x5a1278 the altitude -> 42.575; and the health cell read beside them changes between K+1's
hits (45.71 -> 41.42, 41.42 -> 37.12, 37.12 -> 32.83: a loss of 4.29, 4.30 and 4.29 -- the same at the file's two
decimals, which is all that cell
holds).

**What it confirms of section 9.4, and what it does not.**
- CONFIRMED, measured: the flag set on air frame 1 by the fall's push, after that frame's altitude store; the bit-1
  add as the root's change, exact for the two crouched gaits; the gated add not run; the lift, the flag's clear and
  the snap on frame K with the speed kept; one more whole g dt and the speed's hand-off on frame K+1; the health
  changing in K+1.
- THE FRAME COUNT IS SHOWN; THE SPEED IS NOT A WHOLE-STEP ONE. In X2run, X3walk and X4crouch frame K is the 22nd
  clock value counting air frame 1 as the first -- K = 22, section 9.4's K for this ledge -- 21 game frames after
  it, ONE OF THEM SHORT (0.0167 s against 0.0334 s; ending at clock 90.9738, 144.0187 and 178.1088, a different air
  frame in each). So the speed at K, 168.5953, is 21 whole steps and one short step (3.928; a half step is 3.921),
  and the loss is a short-frame run's (section 9.3's x 0.914 kind), not the whole-step x 0.856. The short frame is
  the game clock's own pattern -- one about every 1.9 s on the ground too, with no watch armed -- not the watch's.
  (Corrected on this section's review: it first said "20.5 game frames", dividing the clock difference by a whole
  frame's length.)
- NOT CONFIRMED: the standing walk's root. It read 11.0176, not `seal_walk_alert`'s 11.0117; whether that is a blend
  with the jog's clip is not read (the cure's plan names it and leaves that gait unbuilt).
- The three gaits land on the SAME frame with the same speed though their altitudes at frame K differ by 1.69 (the
  pose step's whole range): on this ledge the pose step does not move K.
- Not write-watched: `+0x105e` (the airborne bit); the frames between air frame 3 and frame K (the row samples
  cover them, above); any placed drop; a running jump. Section 9.4's "Not settled" rows all stand.
- LEVELS, after two fresh reviews at the files (2026-11-15; the first withheld its PASS on two wordings, corrected
  here; the second, of the corrected text, PASS WITH FINDINGS, notes only; their records are on the sprint's hub,
  `evidence/bug-reports-review-2026-11-15/R145-research151-s95-review-c466d19a8d.md` and
  `FLE-plan-review7-and-s95-rereview-249b6cc19a.md`).
  MEASURED VALUE FOR VALUE on this one ledge (tolerance 0.0001; the health cell 0.01): the order of the writes at
  their program counters; the bit-1 add equal to the change of `+0x14c4` for the two crouched gaits; the gated add
  not run; the lift, the flag's clear and the snap on frame K with the speed kept; one more whole g dt and the
  hand-off on frame K+1; the health changing in K+1; the same K and speed for the three gaits; and K = 22 here, on a
  run with one short frame.
  THEIR LEVEL (the main controller's ruling, 2026-11-15): **reading, measured, the image comparison unread.**
  "Proven" is a trace of THE ORIGINAL, and that the traced image IS r0004 at the cited addresses rests on the rig's
  statement (its record's section 1 and `RELAY1-elf-compare-and-fault2-1947Z.md`), whose comparison files
  (`citedcmp-B.txt`, `elfcmp-B.txt`) have since been read (section 9.6): they compare CONSOLE B's image, not the
  traced console C's. They are PROVEN ONCE BOTH LINKS of section 9.6 are read
  by a reviewer (the running image equal to the dump; the dump equal to the served image); not before. A fresh reviewer
  of the record alone (2026-11-15; `evidence/bug-reports-review-2026-11-15/R145-s95-image-compare-review.md`) found
  it supports the coverage (all 14 program counters lie in a segment whose only differing words are 455 KB above
  them) but that the reference file is itself a dump of r0004 running, not the served image R4B.R4 calls pristine --
  so the rig's comparison is one dump against another. The controller then ruled the reference (section 9.6), and
  what closes the chain is there: the running image equal to the dump (the rig's raw file, owed) and the dump equal
  to the served image (ours, made). (Two of the cited program counters, 0x5a107c (a branch) and 0x5a0ab8 (a
  jump-and-link), are transfers whose
  delay slots hold the
  stores; the rig's emulator reports such a store at the branch's address.)
  A READING or an inference still: `+0x404` as the bare floor (so "no offset on the top"), the 99.61 u extension,
  and the push being `FUN_0057e050` (taken from the program counter's range). Measured with no source: the standing
  walk's 11.0176. Section 9.4 keeps its own level: what is proven here is these writes, not the functions' reading.

### 9.6 The r0004 reference image, and the two comparisons section 9.5's level waits on

**The ruling** (the main controller, 2026-11-15, by session message; a choice between readings, logged in the cure's
plan for the owner, his to overturn): the reference for "the original" at r0004 is THE SERVED DECRYPT -- "the image
as served, with no emulator and no pnach in it"; the PINE dump "is a running image OF it and is evidence only as far
as it is shown equal". (r0004 is the online revision, OT.R97; the disc holds r0001. Section 9.5 first called the
dump "the disc's r0004 image": wrong, corrected.)

**The two files, pinned** (read-only, under the desktop tree `SOCOM_PC_ROOT` on the sprint's hub; neither is in git;
no note pinned either before this one):

| file | bytes | sha256 | what it is |
|---|---|---|---|
| `game/r0004/served/socom2_game_served.elf` | 5,016,064 | `ce5e7717444dfffb4abb5ef2695d9af7d7ef0f814aa744bbe1ae182ee3d200ec` | THE REFERENCE: the ELF assembled by the desktop project's tools from the served r0004 decrypts (see below; its `.repair.json` lists no repair) |
| `game/disc_r0004/socom2_game.elf` (the same bytes as `game/overlays_r0004/socom2_game_r0004.elf`) | 5,016,016 | `08be8ce7940a976690d5f6593ec643b177a3d4f9b569e4e466aa45d86b7ae9bd` | the PINE dump: r0004 as it ran on an emulator (R4B.R4); it differs from the served image in 124 words of the ranges both files hold, none near a cited address (below); the file the rig compared its running image with |

**The chain, and where it stands.** Section 9.5's listed claims are PROVEN -- on its one ledge -- when both links are
read by a reviewer:
1. *The running image equals the dump at every cited program counter.* The rig's own comparison. Its raw output is
   on the sprint's hub and was READ by a fresh reviewer (2026-11-16; PASS WITH FINDINGS;
   `evidence/bug-reports-review-2026-11-15/R145-link1-and-kept-runs-review-e8a4a12ffd.md`, which also read the
   `r4seg` and `r4prov` runs and this section's provenance: PASS, PASS, PASS WITH FINDINGS). WHAT THE FILES SHOW:
   `elfcmp-B.txt` (console B, port 28012, against the dump of the sha above, 2026-11-15T19:42:48Z to 19:45:39Z, in
   match-q30) lists every differing range of the segment 0x4c5380-0x6699b8 -- 710 words in 31 ranges, the first at
   0x627f68 -- and all 14 program counters lie in that segment, the nearest differing word 465,992 bytes above the
   highest: EVERY ONE EQUAL. (`citedcmp-B.txt` has no header and gives each of its 59 windows only as a label and
   "128 words, 0 differ": by it alone 13 of the 14 are covered however the windows are anchored, 0x5b62b8 only if
   they are centred.) WHAT THEY DO NOT SHOW: THE COMPARED CONSOLE IS NOT THE TRACED ONE. The write-watch ran on
   console C in match-q30b (launched 19:47Z); no file compares console C's image in any match. That C's image was
   r0004 at the cited program counters is a good INFERENCE (the same rig, emulator build and package; C's hits at the
   predicted program counters with the predicted effects) and not a measurement.
   **STILL OWED, and the one thing between section 9.5 and "proven"** (the main controller's ruling, 2026-11-16):
   the same comparison run ON THE CONSOLE THAT IS TRACED, in the SAME session as a write-watch, its output kept with
   a header (port, console, match, the dump's sha256, stamps). It rides with the cure's open rows (the placed
   drop's watch); the ask is in the rig's ask file for this lane.
2. *The dump equals the served image at every cited program counter.* OURS, MADE 2026-11-15T23:09:56Z by a script
   (`r4cmp.py`, kept with its output on the sprint's hub:
   `evidence/bug-reports-review-2026-11-15/tools/r4cmp.py` and `.../R145-s95-r4cmp-dump-vs-served.txt`): the 14
   program counters of section 9.5 (every `0x5.....` token of its text), 256 bytes either side of each, compared as
   32-bit words through each file's own program headers -- 1,806 words, NONE differs. READ by a fresh reviewer
   (2026-11-15, PASS WITH FINDINGS, notes only: it re-ran the script, got the same output line for line, and checked
   the 14 words and four windows with its own code;
   `evidence/bug-reports-review-2026-11-15/R145-s96-r4cmp-review-e9554e0c5f.md`). THIS LINK IS CLOSED.
   Beyond the windows (the reviewer's point: they leave out the rest of each function, the callees and section 9.4's
   other ranges), a second kept run, `tools/r4seg.py` -> `.../R145-s95-r4seg-dump-vs-served.txt`
   (2026-11-15T23:19:56Z; not yet read by a reviewer), compares every range both files hold: 0x100000-0x1d5600, 0
   words differ; 0x1e7000-0x434d88, 77 of 604,002 differ (0x1e70cc to 0x4282b4); 0x4c5380-0x669980, 47 of 430,464
   differ (0x659638 to 0x65f130). Every r4 address sections 9.4 and 9.5 cite (30, range ends included) and the
   lift's call target 0x5b6a60 holds an EQUAL word, the nearest differing word 666,584 bytes away.
Until both links are read, section 9.5 stays "reading, measured, the image comparison unread".

**What the reference is, exactly -- its own provenance** (derived from the desktop project at its pinned commit;
`desktop@be5578311f` is the `ref/desktop` submodule's pin, an ancestor of the desktop's pushed `main`; a reading,
pending review; the byte checks by a kept script, `evidence/bug-reports-review-2026-11-15/tools/r4prov.py` ->
`.../R145-s96-r4prov-served-elf.txt`, 2026-11-15T23:26:27Z, on the sprint's hub, not yet read by a reviewer).
- **The served package.** `game/r0004/served/APACHE00.ZDB` (1,605,944 bytes, sha256
  `d9f67b53a984d15ace0650e2ab26bac2d53885d05760a7f25a43b484e6e696a0`) -- the code package as served. WHERE it was
  fetched from and when is cited by no note here: A GAP, LATER 1109 (a).
- **The decrypt.** `desktop@be5578311f:tools_py/decrypt_apache.py:1-18`: the game's decryption routines (the boot ELF's
  loader and its DNAS overlay) are run under an emulator HARNESS to decrypt the package, the result inflated and
  written out as the plain overlays. Said exactly (the link-1 review's finding): the harness is not the bare game --
  3,172 R5900-only instructions of the boot ELF and 324 of the DNAS overlay are replaced by traps and emulated by the
  tool (`decrypt.log`); the DNAS overlay is loaded ALREADY DECRYPTED and its self-decryptors stubbed
  (`desktop@be5578311f:tools_py/decrypt_apache.py:116-123`); the kernel, the start-up and the IOP calls are the
  tool's stand-ins (`:163-166`, `:287`). What backs the output: both entries inflated without error (the zlib
  stream's own checksum held) and the log's "data reads hitting patched words: 0". Its two outputs: `ftscore.bin`
  (2,416,128 bytes, sha256
  `b04fdb31368d407be884748bc502212d5d6a4f96e13f7dd1bd080e099f22a6c5`) and `zsealetc.bin` (1,721,856 bytes, sha256
  `c125f2465fb9f2ee714621cb5b66c4bc6efdd3a83d395db4acc1a18e392bfa53`) -- R4B.R4's "pristine served decrypt". The
  `decrypt.log` beside them is that run's; it names no commit, so THE RUN ITSELF IS NOT PINNED (the tool's bytes in
  the desktop tree today equal the pin's): a gap, LATER 1109 (b).
- **The assembly.** `desktop@be5578311f:tools_py/make_overlay_elf.py:1-17`: the decrypted overlays and the boot
  ELF's own segment are wrapped into one ELF, each overlay one loadable segment at its header's load address, and
  nothing is rewritten unless the repair is asked for. The ELF's sidecar (`.repair.json`) lists NO repair and names
  three tools by sha256 -- `tools_py/make_overlay_elf.py` 3e468dca..., `tools_py/overlay_repair.py` 5b92631a...,
  `tools_py/r0004/capsule.py` 4318a549... -- each equal, byte for byte, to that file at `desktop@be5578311f`.
- **WHICH BYTES ARE WHOSE** (the script's output): the first 4,096 bytes are the ASSEMBLER's (the ELF header and
  program headers); segment 0 (0x100000-0x1d5600, 873,984 bytes) is THE BOOT ELF's own segment, equal in every one
  of its 218,496 words to the disc's image (r0001's: the boot code is not what r0004 changes); segment 1
  (0x1e7000-0x434e00) is `ftscore.bin` WHOLE, byte for byte; segment 2 (0x4c5380-0x669980) is `zsealetc.bin` WHOLE,
  byte for byte; nothing follows. So every program counter sections 9.4 and 9.5 cite -- all in 0x4c5380-0x669980 --
  is a byte of the served `zsealetc.bin` itself, untouched by the assembler.
- **What that makes it.** The best image this project holds of r0004 as served: the served package, decrypted by
  the game's own decryption routines under that harness, then wrapped with no rewrite. Not a file a server sent as it
  stands,
  and not a disc image. Its standing as "the original" is the controller's ruling above, with the two gaps in LATER 1109
  (the package's source; the decrypt run's commit).
- The dump's 124 differing words are NOT all the "pnach contamination" R4B.R4 lists (its 0x2cc670 / 0x2cc674 do not
  differ here; 0x1e70cc does): most look like run-time data of a running image. Not read further.
