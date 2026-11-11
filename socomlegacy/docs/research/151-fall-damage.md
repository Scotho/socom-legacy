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
  speed) and saw a full bar. Fixed: the room sends `hurt` (part 3), reports it, and reads a blast knock's landing at
  x 1.2 as the game does (§3).
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
hair of health with no hurt voice; and the blast knock's landing was read at its plain speed where the game reads it at
x 1.2 (§2.6).

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
- **`FUN_00580360(speed, actor)` D:L441912-441950**, called from the same landing tick (D:L466914) when the SEAL is on
  the ground in `Fall forward` / `Fall backwards` (the blast knock, research 85 §12): with body `+0x105c` bit 3 clear
  (D:L441921) and the controller local, **`FUN_005ac1f0(speed x 1.2, actor)`** (D:L441929); the `Land forward` /
  `Land backwards` push (`FUN_005a0950(actor, 3, 2)`, D:L441946-441947) is the dead branch -- under the alive bit clear,
  returning 0 -- while an alive knocked SEAL returns 1 at D:L441949 with nothing pushed (the review of 2026-10-03; `mover.ts`
  takes the alive path's clip from `FUN_005805b0`, D:L441960-441985, unchanged). So a knock-down's landing hurts from a lower drop
  than a walk-off's: 142.3 a second (a 43-unit fall) instead of 170.7. What bit 3 of `+0x105c` means is not read (§5).

## 3. The port

### 3.1 The measurement

Unchanged: the room runs every player's `Walker` on the commands the page sends (`MoverSim`), and the walker's `land`
(`mover.ts`) records the landing -- `speed = max(0, -vy)` at contact, the class by `landingClass`, the clip -- the
same tick the page's own mover does on the same commands (research 91 §15, `netcode.test.ts`'s heavy landing: one clip
on both ends). The page sends nothing for a fall; there is nothing it could forge beyond the commands the room already
trusts. The room reads each landing once (`Player.lastLanding`, typed `Landing | null` now).

### 3.2 The damage and the `hurt` (`room.ts` `fallDamage`)

On a new landing: the speed (a knock's x 1.2, §3.4); `fallDamageFraction` (`damage.ts`); none, nothing more. Else
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

### 3.4 The knock's x 1.2

`Landing.knocked` (`mover.ts`: true for the landing of `Fall forward` / `Fall backwards`, the mover's `knockLanding_`)
and `KNOCK_LANDING_SPEED_FACTOR` = 1.2 (`damage.ts`): the room reads a knocked landing at `speed x 1.2`. The class, the
clip and the sound stay the mover's own at the contact speed (the game's `FUN_005ac1f0` call with x 1.2 would also
pick the sound by the scaled speed -- `landingSounds` with the scaled class -- which the page does not do: §6).

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
| `packages/viewer/test/fallDamage.test.ts` | the three speeds from the table, equal in the sound, the mover and the damage; the landing's class and the damage share the light speed; `f`'s shape; the six parts, no armour, the clamp; the knock factor | none |
| `packages/match/test/roomFall.test.ts` | the room: a landing over the light speed takes `max x f` and sends `hurt` (part 3, no flinch) to the victim alone; one under sends nothing; the deadly one kills as a fall (-2); one `hurt` a landing; the knock's x 1.2; the combat report | none |
| `packages/match/test/roomFall.test.ts`, "a fall on Frostfire" | on the MP2 fixture's own ground: a SEAL stood at (531, 202, 905) on the 202 level and walked west leaves its edge at the 15th tick and lands on the 100 floor 102 lower (219-223 a second, class 2, `Hit stomach`): the room takes `max x f` (f 0.72-0.79) and sends one `hurt`. The ledge comes from a scan of the fixture's collision for walkable edges over a 62-unit drop (2026-10-03; the probe was not kept): the 202 level's west edge at x ~525 over z 885-1065, and its east edge at x ~675 (z 885-1115) over the 142 deck or the 100 floor; the 230 level at x 771-945, z 805-989 falls 130 to the floor (deadly) | fixture |
| `packages/match/test/roomFall.test.ts`, "a wounded player killed by a light (class 1) / heavy (class 2) drop" (FALL-DEATH-LAND) | a wounded player (30 % / 50 % of every part) dropped 85 / 100 units: the speed's class 1 / 2, killed as a fall with no clip, the landing's clip `Land forward`, held on its last key, still held after 120 commands with the stick forward | none |
| `packages/viewer/test/walk.test.ts`, "a landing whose fall damage kills" and "told of its fall's death" (FALL-DEATH-LAND) | `fallKills` answering yes lands `Land forward` from a light and a heavy drop with no coin drawn, no as before; `diedOfFall` turns `Jump land hard`, `Hit` and `Hit stomach` into `Land forward` at the phase reached, held, the feet still | none |
| `packages/viewer/test/netClient.test.ts`, "its own fall's kill tells the walk it was a fall" (FALL-DEATH-LAND) | the own body's `kill` how 'fall' passes `fall: true` to the walk; a weapon's does not | none |
| `packages/viewer/test/roundDamage.parity.test.ts`, `netDamage.test.ts` (existing) | `applyFall`'s formula and speeds (loosened to 0.1 of the rounded values) | none |

Registry: [`../parity/registry/round.json`](../parity/registry/round.json) `round.fall.speeds`, `round.fall.damage-fraction`,
`round.fall.sound-and-damage-one-threshold`, `round.fall.reaction`, `round.fall.death`, `round.fall.knock-landing` (the
last with an `owed`: §5), all **reading**.

## 5. Placeholders and readings

None added by the 2026-10-03 task, one reading by FALL-DEATH-LAND (2026-11-11); one value is applied without its gate read:

| name | value | why | what settles it |
|---|---|---|---|
| `REMOTE_FALL_DEATH_POSE_READING` (`packages/viewer/src/net/deaths.ts`; FALL-DEATH-LAND) | every viewer's copy of a body that fell to its death is drawn from the room's mover, the victim's console's: `Land forward`, held (§3.6) | on another console `FUN_005ac1f0` lays no damage (D:L464929-464933) and returns class 0, so unless the death has already cleared the alive bit there the landing pushes clip 0xb, `Jump land hard` (D:L466674); how the death's state 8 then reaches that copy (whether it lies down, in what) is not read | **capture spec**: two consoles in one LAN game (PCSX2 x 2 or the recomp, PLAT-36) on Frostfire (MP2); the victim wounded first (one 85-unit drop, about 38 % off), then walked west off the 202 level at (531, 202, 905) onto the 100 floor (102 units, class 2, lethal at that health); record the OBSERVER's screen from the landing to 3 s after, and read the victim's actor on the observer's RDRAM at the landing and each frame after: the animation stack's top clip (the `FUN_00588bc0` push), the state word `+0x174` and `+0xe1` bit 4. Settled by the observer's clip sequence and when (if) state 8 lands; a `Jump land hard` that stands back up would retire this reading for a remote-copy rule |
| `KNOCK_LANDING_GATE_READING` (*note only*: no constant; the port applies x 1.2 to every knock's landing) | body `+0x105c` bit 3 clear (D:L441921) before `FUN_00580360` reads the knock's landing at x 1.2 | the bit's writer was not found in this task (research 84 §8 reads bit 2 of the same byte as the aim-point flag); every knock landing the port has is read at x 1.2 | the bit's writer in the decompilation, or a trace of a knock-down's landing on the recomp (PLAT-36) |

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
- **The knock's sound at x 1.2**: the game's scaled call picks the landing's sound and class by the scaled speed too
  (§2.6); the page plays the knock's landing at its contact speed (the room sends no landing). A difference only when
  the scaling crosses a class boundary: 172-206 a second plain (class 1) becomes 206-248 (class 2 or 3) scaled.
- **The exertion meter's landing raise** (+0.33 / +0.66, §2.4) is not ported (research 84 §8 reads the meter).
- **States 8 and 10** take no damage in the game (§2.2); the room applies the fall to living players only (state 8 is
  covered); state 10 is not modelled by the mover.
- **Proof**: a capture of the original -- a PCSX2 or recomp run with the RDRAM's `+0xffc..0x1010` read before and after
  a measured fall -- would raise §2.3 to proven. None exists.

- **The owner's eye, 2026-10-04** (HUMAN_TASKS H77): on his own run on the preview a fall deals its damage --
  "appear correct". The acceptance by the eye is met; the knock's gate bit and a capture of the original stay owed as
  above.

## 7. Settled, not settled

- Settled at the reading level: the quantity (the contact speed), the three speeds and their formula, the one
  threshold, the fraction, the six-part loop with no armour, the reaction's part and cause, the victim-local run, the
  suicide, the knock's x 1.2.
- Not settled: `+0x105c` bit 3 (§5); the damage voice's call site inside the reaction (research 81 §9's reading);
  whether `+0x1364`'s stored speed (D:L466844) ever differs from the contact speed the port measures.
