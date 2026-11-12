# 80 — The jump, the landings and the locomotion blend: how SOCOM II plays the SEAL's clips (2026-09-28)

The motion workstream of the browser walk (the owner's playtest: "the jump height and duration is way off", "jumps are
floaty", "the walk sideways animation is off"). Everything below is read from `game/analysis/socom2_game.elf.decomp.c`
(cited as `FUN_<address>` and the file's line numbers), the ELF's data (`game/disc/socom2_game.elf`, read with capstone
where the decompilation lost an argument), and the disc's `RUN/READERC.ZAR` (`motion.rdr`, `animset.rdr`,
`dynamics.rdr`) and `RUN/MOTION_P.ZAR`. No console run: §8 lists what one would confirm. The viewer's code is
`socomlegacy/packages/viewer/src/{walk,locomotion,animator,play,playerCamera}.ts`; the tests pin every number here.

## 0. The answers

- **There are two jumps, chosen by speed** (`FUN_0057e1b0`, 440776-440867): at **15 units a second or more**
  (`225 <= |v|^2`, the local velocity) the **running jump** -- a real leap off the floor; under it the **standing
  jump** -- a clip on the floor, the feet never leaving it.
- **The running jump's rise is an impulse, not a clip**: `actor+0x1364 = jump_factor x gravity x -0.4` (0.85 x 235 x
  0.4 = **79.9 units a second up**), written into the fall speed **0.1 s after the take-off** (`actor+0x1360`), then
  `dynamics.rdr`'s 235 a second squared. The top is **13.58 units (1.36 m)** in closed form, **12.27 at the game's
  30 Hz frame** (525/15734 s; the fall speed takes `g dt` before it moves the height) over where the rise began --
  which is **0.785 under the floor**, the wind-up's sink over two frames (§6b), so **11.485 over the floor**; **22
  frames (0.734 s)** from take-off to landing on flat ground, which the port's 60 Hz tick 45 (0.75 s) runs
  ([research 208](208-the-game-frame.md) §4, PF-03; the 60 Hz figures this note first gave -- 12.9, 0.98, 11.95 --
  assumed a 60 Hz frame).
  The take-off's velocity is carried through the air with **no stick** (`FUN_0054d9a0`).
- **The standing jump's rise is the clip's skeleton root only**: `seal_jump` (20 keys, `playback` 1.1) lifts the
  root from 10.51 to **15.08** at key 12; the actor's height comes from a clip only for `UseVelY` motions
  (`FUN_0059afd0`), and `seal_jump` is none. It lasts **0.993 s** (`1.1 x (19/20)^2`, §3). While it plays the stick
  drives the SEAL at each set's top speed -- the only air control in the game (`FUN_0057a330`).
- **The landing** (`FUN_005af590`): over `land_hard_fall_rate` 115 `seal_land_hard`; else with the stick at rest (or
  the last airborne velocity under 20) `seal_land_soft`; else **no landing clip** -- the run goes on at once. No jump
  for 0.4 s after a landing (`actor+0x135c`).
- **Prone cannot jump** (`FUN_005b4340(.., 0xb)`); crouched can (the same `Jump` clip, the stance kept).
- **The camera reads the posed root** (`FUN_0029a950` through `FUN_002869d0`): it rises with the standing jump's
  clip and sinks through a crouch; the running jump lifts the whole actor.
- **The locomotion is a pick-and-blend, every clip rate-matched with no clamp** (`FUN_0058bdf0`, `FUN_00583030`): the
  forward set (`seal_walk_alert`, `seal_jog_alert`, `seal_run` -- the player's `Seal anim set`, not `seal_walk`/`seal_jog`,
  which are the guards') and the strafe set (`seal_rstrafe`, `seal_rstrafe_fast`, `seal_run_90r`, and the left three)
  share the weight by the stick's angle; inside a set the clip whose band holds `m x 65` plays, two split across an
  overlap. **At full sideways stick the game plays `seal_run_90r`/`_90l`** (a 55-a-second root, at 1.18x), never the
  slow strafe (a 14.6-a-second root) the viewer was flailing at 3x.

## 1. The actions and their names

The SEAL's animation is an action stack (`actor+0x1c0`) over plays on the skeleton (`actor+0x170`). An action is a
`short`: the ELF's name table at **0x661060** lists them in order -- 0 Reference, 1 Stand, 2 Walk, 3 Jog, 4 Run, 5 Walk
backwards, 6 Jog backwards, 7 Die, **8 Jump launch, 9 Jump fall, 10 Jump land, 11 Jump land hard**, 12 Strafe right,
13 Strafe left, 14 Strafe right fast, 15 Strafe left fast, 16 Step, 17 Stand -> Crouch, 18 Crouch, 19 Crouch -> Prone,
20 Crouch walk, 21 Crouch step, 22 Crouch strafe right, 23 Crouch strafe right fast, 24 Crouch walk backwards, 25 Stand
-> Prone, 26 Prone, 27 Prone crawl ... Later ones are looked up by name at start-up (`FUN_005e4f90`, 495177-495418):
`DAT_003deae8` is **"Jump"** (the string at 0x661510, too short for the strings dump), `DAT_003decc0`/`d0` the prone
strafes, `DAT_003def08` "dive_to_prone", `DAT_003def50` "Ladderslide". `READERC.ZAR/animset.rdr` maps each action to
clips per anim set; `character.rdr` gives `mp_seal` the **`Seal anim set`** (with `include (GLOBAL SOLDIER)`), whose
default modes are: Stand `seal_stand`, Walk **`seal_walk_alert`**, Jog **`seal_jog_alert`**, Run `seal_run`, Walk
backwards `seal_walk_bw`, Jog backwards `seal_run_bw`, the strafes, Run right/left `seal_run_90r/l`, Crouch **one of
`seal_crouch` 0.3 / `seal_crouch_alert01` 0.3 / `seal_crouch_alert02` 0.4** (drawn), the crouch walks and strafes, Prone,
Prone crawl, Prone rstrafe/lstrafe, Prone turn; `GLOBAL` gives Jump `seal_jump`, Jump launch
`seal_runningjump_launch`, Jump fall `seal_runningjump_in_air`, Jump land `seal_land_soft`, Jump land hard
`seal_land_hard`. The network replay `FUN_005880e0` (445738-446012) re-starts the same actions for a remote SEAL --
case 1 the standing jump, case 2 the running jump (with the same `0.1`, `0.4` and `jump_factor x gravity x -0.4`),
case 3 the fall -- which confirms the reading of the local path.

## 2. The jump, step by step

### 2.1 The request and its gates

- **The press** sets `actor+0x105e` bit 2 (`FUN_005469c0`, a controller command); `FUN_00550ef0` (418100-418160)
  takes it on the next update, when the current action is a locomotion one (the stack entry's flag 0x40), and calls
  `FUN_0057e1b0`.
- **`FUN_0057e1b0`** (440776-440867) refuses: an AI-controlled actor; `actor+0x105e` bit 5 (airborne);
  `actor+0x135c > 0` (the lock); the floor's normal y `actor+0x1348` under `DAT_0044c268` (cos `max_slope`,
  0.643: not walkable); `FUN_005b4340(actor, 0xb)` false; states 9 and 10 (`actor+0x174`); a carry (`+0xeac`).
- **`FUN_005b4340(.., 0xb)`** (469305-469561): among its tests, **stance 2 (prone) returns 0** -- prone cannot jump;
  stances 0 and 1 can.

### 2.2 The running jump (`speed^2 >= 225`)

`FUN_00588bc0(actor, 8, 6, 0, 0xd)` -- action 8 `Jump launch` -- then `actor+0x1360 = 0.1`, `actor+0x135c = 0.4`,
`actor+0x1364 = DAT_0044c258 x DAT_0044c250 x -0.4` (the tuning table's `+0x08` `jump_factor` and `+0x00` `gravity`),
`actor+0x1061` bit 1 set (the jump's own airborne flag) and bit 2 cleared, and `actor+0x1350..0x1358 = actor+0x38..0x40`
(the world velocity at take-off). Then each tick:

- **`FUN_005af930`** (466729-467019): `0x135c -= dt` (floored at 0); while `0x1360 > 0` it counts down and, **on the
  tick it reaches 0, `0x133c = 0x1364`** -- the fall speed becomes -79.9 (up). The airborne bit 5 is set, then
  `FUN_0059b440` clears it on a floor.
- **`FUN_0059b440`** (456467-456570): `0x133c += g x dt; height -= 0x133c x dt` (the fall speed first, so at the 30 Hz
  game frame the rise is `sum(79.9 - k g dt) dt`, 12.27 over the sunk feet -- research 208 §4, PF-03), `g x 0.8` only in `Ladderslide`. With bit 1 set there is no floor
  clamp here; the landing is **`FUN_0059ad30`** (456261-456327): the height under the floor, bit 1 set, bit 2 clear and
  **`0x1360 <= 0`** -- so no landing during the 0.1 s wind-up.
- **`FUN_0054d9a0`** (416501-416555): in actions 8 or 9 (or falling, or the dive) the local velocity is `(0, -0x133c,
  0)` and the world velocity's x and z are `0x1350`/`0x1358`: **the take-off velocity, carried, no stick**. After a
  landing, while a landing action plays, the same carried velocity runs down by `dt x 150`.
- **The clip**: `seal_runningjump_launch` (25 keys, `looped 0`, `playback` 2.4, `max_velocity` 6.5, `BlendTime` 0.2,
  `jump_whoosh` at 0.1). Its root height is constant (10.57): the rise is the actor's. A one-shot of 2.4 s runs its
  keys at `(n-1)/(playback (n-1)/n)`... in practice about 10.9 keys a second, so a flat running jump lands about key 8.

### 2.3 The standing jump (`speed^2 < 225`)

`FUN_0058a4d0(actor, 0)` (pops the stack to the stance's base) and `FUN_00588bc0(actor, "Jump", stance, 0, 0xd)`. No
impulse, no airborne bit: **the actor's height stays on the floor**. `FUN_0059afd0` (456328-456466) takes the actor's
height from the clip only when the motion carries `UseVelY` (`seal_stand2hang`, `seal_stand2ladder`: there the root's y
over 11.487 is moved into the actor); `seal_jump` has no `UseVelY`. Its root, per key: 10.51 ... 10.77 (key 8), 11.46,
13.09, 14.55, **15.08 (key 12)**, 14.94, 14.33, 12.83, 11.27 (key 16) -- the body leaps and lands inside the clip.
**Air control** (`FUN_0057a330`, 438955-438985): in the `Jump` action, with the stick off rest, the throttle ramp
(`FUN_00586c10`) and then `x = lateral x (top of the side sets)`, `z = -forward x (top of the forward set, or the back
set's backing up)`, the tops from `FUN_0058bb50` / `FUN_0058bc00` (447619-447686) by stance -- the per-stance table
`FUN_005e0450` (494496-494629) fills with each set's highest band end: **65 ahead, 37 back, 65 aside standing; 20 each
way crouched**. `DAT_0064fc80` is 1 here (no renormalisation). At rest the velocity is the clip's root motion:
`seal_jump`'s root does not travel. *Kept by the owner's ruling OT.R108 (2026-11-06): r0004's standing jump drives the
forward axis alone (R4B-12, research 385 §2, reading), and the port knowingly keeps this air control instead.*

### 2.4 The landing

The landing branch of `FUN_005af930` (bit 5 now clear, set the tick before): `0x135c = 0.4` (no jump for 0.4 s), and
**`FUN_005af590`** (466641-466728) with the contact's fall speed:

- `FUN_005ac1f0` (464864-464968) classes it against `m_landSpeed[3]` (`+0x30..0x38`, reCOM's
  `sqrt(2 g h)` of `FALLING_DAMAGE_LIGHT/HEAVY/DEATH` 62 / 91 / 120 units: 170.7 / 206.8 / 237.5) and plays the
  surface's landing sound for every class;
- **over `land_hard_fall_rate` (`DAT_0044c260`, 115)**: class 3 `Land forward` (death), class 2 a hit clip, else action
  11 **`Jump land hard`**;
- **else**, when `|actor+0x38|^2 <= 400` (the world velocity of the last airborne tick, the fall included:
  `FUN_005483d0` 413963) or the stick is at rest: action 10 **`Jump land`**;
- **else no clip**: the blend times set to 0.4 and the ramp skipped (`actor+0x248 = +0x244`) -- the run goes on.

`land_fall_rate` (`+0x0c`, 40) is not read here. A walk-off becomes airborne in `FUN_0059b440` and plays **`Jump
fall`** (`FUN_0057e130` / `FUN_0057e050`, 440716-440775; the gate `actor+0x1044 > 0` is not read); a 42-unit drop
lands at 140 -- the hard landing.

### 2.5 The camera

`FUN_0029a950` (142412-142562) takes the root through `FUN_002869d0(actor+0x170, *(actor+0x2e8), 0, &root, 0)`
(142450-142460): the **posed** skeleton root in model space, after the animation update. So the target
`rootY + ramp(rootY)` rises 3.6 with the standing jump's root, moves through the stance transitions' clips and drops
1.2 running (`seal_run`'s root is 10.30 against the stand's 11.48); the running jump carries the whole actor up. The
prone clips' root, 2.17, is exactly the ramp's floor `2.169155`.

## 3. The motion player

**A loaded motion** (the clip reader `FUN_0028a5c0` keeps the file's duration at `+0x10` and its 1.0 at `+0x14`; the
`motion.rdr` loader **`FUN_00287620`**, 131191-131653, then; `FUN_0028ab10` / `FUN_0028aa20`, 133194-133292):

| field | value |
|---|---|
| `+0x49` bit 6 / bit 7 | `looped` / `max_velocity < 0` (then read as 0) |
| `+0x1c` V | looped: `max_velocity x 10 / 100`, or 1 when that is 0; one-shot: 1 |
| `+0x10` T | one-shot or bit 7: `playback`; a looped locomotion clip: `duration / playback` |
| `+0x18` D | the root's travel key 0 to key n-1 in x and z, x `n/(n-1)` looped |
| `+0x14` K | looped with D > 0.2: `(bit 7 ? T : 100 T) / D`; else 1 |
| `+0x20` | `BlendTime`, **0.4** when absent (`0x3ecccccd`) |
| callbacks | `time > 1 ? time / (T (n-1)/n) : time`, the phase |
| transitions | `(motion, A, B)` kept in file order when A or B is not 0 |

**A play** (`FUN_0028dc90`, 135117-135227) is a list of nodes -- motion, weight `+0x08`, speed `+0x24`, phase offset
`+0x0c` -- and one phase. `FUN_0028d570` sets a speed x K on a looped motion. **`FUN_0028c4f0`** (134223-134280) moves
the phase by `dt x sum(w x speed / (T x a))`, `a = 1` looped and `(n-1)/n` otherwise (`FUN_0028ada0`), wrapping a loop
and stopping a one-shot at `(n-1)/n`; `FUN_0028d670` samples key `phase x n`. So **a one-shot plays keys 0 to n-1 in
`playback x ((n-1)/n)^2`** (`seal_jump` 0.993 s, `seal_land_soft` 0.632, `seal_land_hard` 0.903, the transitions 0.603,
0.846, 0.945) and **a locomotion cycle turns at `target / D` cycles a second** -- its root travels exactly the target
speed. The velocity (`FUN_0028c250`, 134145-134183, through `FUN_00289bb0`) is the weighted root motion x speed:
research 25's traced `+0x24` **1.1265** for the full run is `0.65 x 63.3 / 36.54` here. `FUN_0028bef0` (133997-134079)
swaps a play's nodes with no blend; a new play snapshots the pose (`FUN_0028e3e0`, 135387-135414) and blends over the
new motion's `BlendTime`, the phase kept between two loops; `FUN_0028c160` plays a one-shot backwards from its end.
`FUN_0028c9e0` / `FUN_0028c7c0` (134311-134449) fire a callback when the phase steps over it (forward
`from <= t <= to`; a wrapped loop `from - 1 <= t <= to`).

## 4. The locomotion

- **The sets** (`FUN_005e30f0` 495581 walks `motion.rdr`'s transition records in file order into `FUN_005e0030`,
  494313-494495, which multiplies A and B by 10 and files each action): `+0x60` Walk, Jog, Run; `+0x90` Walk/Jog
  backwards; `+0xf0` Strafe right, Strafe right fast, Run right (0x42); `+0xc0` the left three; `+0x120` Crouch walk;
  `+0x150` Crouch walk backwards; `+0x180` Crouch strafe left; `+0x1b0` Crouch strafe right (fast). Only an action's
  default-mode motion matches, so the Walk band is `seal_walk_alert`'s 0-4 m/s.
- **`FUN_0058bdf0(m, weight, set)`** (447743-447913): `v = |m| x 100 x V` of the set's first clip (units a second,
  `m x 65`); every clip whose `[A, B]` holds v is taken at speed `m x V_i` (x K_i); two taken split by `f = (v - max A)
  / (min B - max A)`, the earlier `(1 - f) weight`, the later `f weight`; none: under all bands the lowest-starting clip
  at `min A / 100`, over all the highest-ending at `max B / 100`. `weight < 1` first scales the play's nodes by
  `1 - weight` (`FUN_0028cfc0`). The back and left sets are called with `-m` and their speeds negated back
  (`FUN_0058bab0(-1)`): they play forward.
- **Standing, `FUN_00583030`** (443246-443323) with **`FUN_00583350`** (443324-443368: `m = min(1, |s|)`, the forward
  axis dead within 0.03, `w = asin(|lat| / |s|) x 2/pi`, `DAT_0064fc80 = 1/sqrt(w^2 + (1-w)^2)`): the forward (or back)
  set at weight **1.0** -- the decompilation drops the argument; the disassembly loads `$f13 = 1.0` at 0x5830b8 -- when
  `|fwd| > 0.03` and `w < 1`, then the strafe set at weight `w`, leaving the forward clips `1 - w`. The idle-to-move
  change pushes the `Walk` action first (`FUN_00586570`, 444793-444954): a cross-fade of 0.4.
- **Crouched, `FUN_00582d10`** (443164-443245): one set by the direction class at weight 1; the `+0x1b0` (right) clips
  half a cycle on; a class change snapshots and blends over the new clip's `BlendTime`.
- **Prone, `FUN_00583500`** (443369-443496): the class keeps one axis; `Prone crawl` at `max(|f|, |l|) x V`, negative
  (the crawl backwards) backing up, or `Prone rstrafe`/`lstrafe`; each its own action. Turning in place prone plays
  `seal_prone_turn` (web research 83).
- **The stance changes** (`FUN_005817d0`, `FUN_00581c10`, `FUN_00581540`, 442170-442660): to crouch, `Stand -> Crouch`
  unless moving (`speed^2 > 400` goes straight to the crouch's run, `> 100` to the crouch walk); to stand from crouch,
  the same clip backwards (`FUN_00588bc0`'s fourth argument, `FUN_0028c160`) unless `speed^2 > 100`; to prone
  `Stand -> Prone` / `Crouch -> Prone`; out of prone those backwards. The ground state runs only on a locomotion
  action (`FUN_005870e0` 445089-445250 tests the entry's flag 0x40): a transition holds the mover.
- **The footfalls** (`FUN_005a3570`, 460266-460382): on a locomotion action, moving (stance 0: `FUN_0058a820() > 1`;
  crouched or prone: `|v|^2 > 0.25`) and not airborne, the left foot's sound when the play's phase is in (0, 0.5) and
  was not, the right's in (0.5, 1); the surface's step sound at the foot node (`actor+0x2f0` / `+0x2f4`, `lfoot` /
  `rfoot`).

**Why the sideways walk looked wrong.** The viewer played `seal_lstrafe`/`seal_rstrafe` at every speed by a 45-degree
split, rate-matched and clamped at 3x: the full strafe (65) ran a clip whose root travels 14.8 at 3x -- 44 -- so the feet
slid. The game plays `seal_run_90r/l` at full stick (1.18x), `seal_rstrafe_fast` between, the slow strafe only under
28 (right) / 23 (left), and mixes them with the forward set by the stick's angle.

## 5. What the viewer does

- `walk.ts`: `Walker.jump` (the gates, the two jumps), the running jump's delayed impulse (`runningJumpSpeed`,
  `JUMP_DELAY`, `JUMP_LOCK`), the carried velocity and its run-down (`CARRY_DECAY`), the landing's clip, the standing
  jump's stick (`jumpControl`, `./locomotion` `airBands`), the walk-off's `Jump fall`, the stance transitions
  (`changeStance`, `ACTION_CLIPS` / `ACTION_SECONDS`); the snapshot carries the ground state (`GroundMotion`) and the
  action (`MoverAction`); `WalkMode.setPosedRoot` feeds the camera. The walk has no sprint: the mover never reads the
  boost.
- `locomotion.ts`: the motion constants (`motionOf`), the sets (`SEAL_SETS`, `SEAL_ANIMS`, `CROUCH_IDLES`, pinned
  against `animset.rdr`), `bandPick`, `standPlay`, `crouchPlay`, `pronePlay`, `oneShotSeconds`.
- `animator.ts`: the plays, the shared phase, the cross-fades, the events (`onEvent`: `callback`, `footfall`, `play`).
- `play.ts`: the posed root to the walk; `onEvent` for the page (the animator's, a footfall's world point, `takeoff`,
  `land`).
- `playerCamera.ts`: `tick(.., posed)` takes the posed root as it is.

## 6. The second round: what the game does after the clip (2026-09-28, later)

- **`NoInterrupt`** (`FUN_00587c20`, decomp 445514-445576; the stick test in `FUN_00550ef0`, 418180-418190): an action
  whose play is not ending this tick and whose phase is past its motion's `NoInterrupt` (`+0x30`: the loader's 0 when
  the key is absent, 1 when bare) gives way when a move axis passes 0.1 -- `FUN_005870e0(actor, 1)` runs the ground
  state. So the soft landing (no `NoInterrupt`) is cut the moment the stick moves, the hard landing past 0.35 of its
  phase (0.33 s), the standing jump past 0.7 (0.73 s), the hits and the get-up past 0.8; the launch (`NoInterrupt ()`)
  never. When the controller's `+0x30` answers ~~(read as the player's)~~ -- *corrected 2026-10-31 (SEP-POP, §6f):
  `+0x30` is `IsAi`, the AI's controller answers and the player's does not* -- actions 100, 99, 25 (Stand -> Prone), 19
  (Crouch -> Prone), 17 (Stand -> Crouch) and `Pistol stand -> Prone` are never cut. ~~A transition played backwards
  (getting up) has its node's bit 1 cleared (`FUN_00580b70`, `FUN_00581c10`): never cut either.~~ *Corrected
  2026-10-31 (§6f): only prone -> stand (`FUN_00581c10` D:L442626-442629) and `FUN_00580b70`'s own pushes clear it; the
  press's prone -> crouch (`FUN_005817d0` D:L442517-442518) and crouch -> stand keep it.* The third axis the
  test reads (`actor+0x23c`, the turn): applied in the third round (§6b).
- **The heavy falls** (`FUN_005af590` with `FUN_005ac1f0`): over `land_hard_fall_rate` the class decides -- 3 (at or
  over `m_landSpeed[2]` 237.5, a 120-unit fall) `Land forward` (`seal_landforward01`) and the actor's death, 2 (over
  206.8, 91 units) `Hit01` (`guard_hit01`, 3.7 s) or `Hit stomach01` (`guard_hit_stomach01`, 2.9 s) by a draw
  (`FUN_00197740 x 4.656613e-10 <= 0.5` the stomach), 0 or 1 `Jump land hard`. `m_landSpeed[i] = g sqrt(2 h_i / g)`
  (reCOM `char_dyn.cpp:32-35`). The viewer has no death: after `Land forward` it plays `Get up forward`
  (`seal_getupforward01`, named). The hits, the death landing and the transitions move the actor by their clips' root
  motion (the velocity is `FUN_0028c250`'s for every action but the jumps and the landings); key by key since the
  third round (§6b).
- **`actor+0x1044`** is the actor's health: `FUN_005477a0` (412819-412844) writes it and calls the death when it reaches 0.
  `FUN_005af930`'s in-air clip starts only for a living SEAL -- always, in the walk.
- **`FUN_0058a820`** (446874-446894) is the speed class: 1 under 0.5 a second (`|v|^2 < 0.25`), 2 under 20, 3 from 20. The
  standing footfall wants a class over 1: moving at 0.5 or more, as the animator had it.
- **The engine's node blend** (`FUN_00577ea0` 437415-437474 samples each node with `FUN_005777d0`, 437177-437297; `FUN_00577000`
  436853-437136 merges them): the translations a weighted sum (six parts only take the clip's: the root, `hips`, the
  biceps and the shoulder weights -- the rest keep the skeleton's own; applied in the third round, §6b); the rotations two at a time -- first the `Lateral` motions among themselves, then the
  others, then what is left -- each pair by `FUN_00576e30`: the engine's slerp at `wb / (wa + wb)`, the weights summed.
  `FUN_00306ae0`, the slerp, takes a normalised lerp over a dot of 0.95. And the player's own actor (the LOD bit 3 of
  `actor+0xe0`, set for it) samples between keys with `FUN_00289570` (slerp) and `FUN_002898a0`: the blend-or-hold
  question of research 77 §7 is answered -- blended (distant actors take the nearest key, `FUN_00289470`).
- **The turn in place exists standing and crouched** (web research 83 said it does not): `FUN_00586570` with the move
  stick at rest and the turn axis `actor+0x23c` off rest calls `FUN_00586050`, which pushes action 16 **Step**
  (`seal_step`; `seal_alert_step` in the ready mode) -- crouched `FUN_00584c60` pushes 21 **Crouch step**
  (`seal_crouch_step`), prone `FUN_005845c0` the Prone turn -- and `FUN_00583960` (443497-443545) sets its speed to
  `|axis| x 0.6` (0.3 crouched, 0.35 prone, 0.6 for states 9 and 10), capped there, negative for a positive (left) axis.
  The axis is the turn over `turn_maxrate`. Entering from a loop whose phase x 60 is in 17..47, the step starts at
  phase 0.5.
- **The spine's nodes** (`FUN_00553ea0` 419595-419660, the ELF's names at 0x65c4c0...): `actor+0x2e8` skel_root,
  `+0x2ec` aimnodes, `+0x2f0` lfoot, `+0x2f4` rfoot, `+0x2f8` lhand, **`+0x2fc` spinelo**, `+0x300` rhand, `+0x304`
  hips (the headroom ray's start), `+0x308` head, `+0x30c` neck, `+0x310` spinehi, then the thighs, calves, arms,
  scapulae, the shoulder weights and the toes.
- **The run's bank** (`FUN_0057a330` 439197-439204): with the near-LOD bit 4 of `actor+0xe0` (set for the player), on
  the floor, `spinelo`'s rotation is pre-multiplied by a turn about z of `-0.000375 x actor+0x48 x actor+0x34` (the
  turn, rad/s left positive, and the local z speed): 3.1 degrees into a full turn at the run, leaning into the turn.
- **The aim's twist** (`FUN_005aca70`, 465019-465336; gated in `FUN_0057a330` 439152 by the aim envelope and
  `FUN_00587a30`, 445445-445479, which reads `NoPitchtwist` off the play's nodes): not prone; the aim (`actor+0x144c`,
  into model space) and the model's forward (`DAT_003f6500`, set at start-up: (0, 0, -1) read) are carried into each
  spine node's frame; their cross, times the envelope `FUN_00286b80(actor+0x1160)` and 0.1 (`spinelo`) or 0.4
  (`spinehi`), is a rotation vector turned into `(v sin|v| / |v|, cos|v|)` (`FUN_003067b0`) and pre-multiplied into
  the node. For a pitch p the two turn by 0.2 sin p and 0.8 sin p: about the whole pitch. The envelope is the weapon's
  raise (`FUN_005dfc80` over `actor+0xf74`); the walk's rifle being up, the viewer takes it at 1 (named).

## 6b. The third round: the feel's last readings closed (2026-09-29)

- **The turn axis cuts too** (`FUN_00550ef0` 418180-418190): the interrupt test reads `actor+0x23c` beside the two move
  axes -- the turn over `turn_maxrate` -- with the same 0.1. Turning the view past a tenth of the full rate cuts an
  interruptible landing, hit or get-up as the stick does. Applied (`Walker.turn`, set from the look each frame).
- **The actions move by their root key by key** (`FUN_0057a330` about 438957: the velocity is `FUN_0028c250`'s, which
  `FUN_00289bb0` reads as the root's change between the key the phase is on and the next -- the last key paired with
  the one before -- times keys over the play's length): the hits, the death landing, the get-up and the transitions
  carry the mover by that, so the SEAL stands still where the clip's root does and slides only while it moves; played
  backwards (getting up), the phase runs from the end and the motion turns round. Applied (`Walker.actionVelocity`,
  fed the pack's root keys through `WalkMode.setActionRoots`; the clip's mean stands in when the pack has none). **The
  landings' drift is not applied by the game**: `FUN_0054d9a0` (416501-416555) sets actions 10 and 11's velocity to
  the carried take-off velocity running down by `dt x 150`, so the soft landing's 3.3-unit root drift never moves the
  SEAL -- the viewer already did so.
- **The within-stride shape does not exist on the disc**: the same per-key velocity drives the ground locomotion, but
  every locomotion clip in the sets and the crawl moves its root the same distance each key (to 1.5 %, a fixture
  test): the per-key velocity is the constant target speed the mover already runs at. The weight is the clips' and
  the speed rules' (§4), not a surge within the stride.
- **The translations the engine takes** (`FUN_005777d0`, 437177-437297): only `skel_root`, `hips`, `lbicep`, `rbicep`,
  `lshoulder_wgt` and `rshoulder_wgt` take the clip's translation; the other 20 body parts keep the skeleton's own.
  A part outside the body (the rifle node, the props) keeps the clip's. After the update the root's x and z are zeroed
  (`FUN_0057a330` 439110-439130): the root's travel is the mover's, never the pose's. Applied (`BODY_PARTS`,
  `SAMPLED_TRANSLATIONS`), in the pose layers too.
- **The wind-up sinks** (`FUN_005af930` 466729-467019, `FUN_0059b440` 456467-456570, `FUN_0059ad30` 456261-456327):
  through the 0.1 s the fall integrates from rest and the landing is gated off by `0x1360 > 0`. At the 30 Hz game
  frame (525/15734 s; [research 208](208-the-game-frame.md) §4, PF-03) the delay reads 0.0666, 0.0333, then -0.0001,
  so the feet sink 0.785 over two frames; on the third the fall speed becomes -79.9 before the step, so the rise
  starts from -0.785 (+1.619 after that frame). The top is 11.485 over the floor, the flight 22 frames (0.734 s; the
  port's 60 Hz tick 45). Applied; the floor test lets the sunk feet move on through the wind-up.
- **The player plays the default mode**: the anim mode `actor+0x1336` is written only by `FUN_0057d710`, which only
  the AI and script paths reach (`FUN_005604c0`, `FUN_0056fd00` through `FUN_0058c5d0`); the player's actor is set up
  in mode 0 (`FUN_00553ea0`, 419517) and nothing on its path changes it. `ready`'s alert clips are the bots'.
- **The pistol's action set** (`FUN_0058c9e0` / `FUN_0058c820`, 448153-448283): with the item byte `actor+0xf79` at 2
  each node's action maps through the anim set's table (`+0x5c`, `FUN_005e1a50`) to its `Pistol ...` action where
  there is one, a sub-node at weight 1 that `FUN_00576bb0` lays over the parts it carries before the nodes are merged
  (`FUN_00577ea0`). Applied per node (`PISTOL_ANIMS`, pinned against `animset.rdr` by the `Pistol <action>` name
  rule); `Animator.setWeapon` switches with a cross-fade over the playing motion's `BlendTime` [reading].
- **The launch covers a flat flight; the fall is for what outlasts it** (research 90 issue 10): `FUN_005af930`'s
  airborne branch pushes `Jump fall` (`FUN_0057e130` -> `FUN_0057e050`, action 9) only with neither action 8 nor 9
  current, and the launch (`NoInterrupt ()`) ends only with its play (`FUN_00582540` on `FUN_0028c6e0`, 2.21 s) or the
  landing's pop. A flat running jump (0.734 s, 22 game frames; research 208 §4) lands in the launch, about its key 8; `seal_runningjump_in_air` plays on
  a walk-off and after 2.21 s of a running jump's flight. At a landing with no clip, `FUN_00589aa0` pops the launch
  and `FUN_0028da00` hands back the play it was pushed over -- the run -- so no frame of the stand shows; the viewer
  showed one (the landing tick's ground state was at rest) and now poses the run it left in. The game pushes the fall
  the tick after the launch's pop; the viewer on the same tick [reading].

## 6c. The fourth round: the head look, the raise weight, the jump's rule, death, the swap (2026-09-29, later)

- **The head look** (`./headLook`; `FUN_005ad400`, named in round 3, turns out to be the **eyelids**: the rotation from
  the forward to `actor+0x1280` into the `right_lid` / `left_lid` nodes, with `FUN_005ad4d0` the eyeballs and blinks
  every 0-6 s -- the SEAL's skeleton has no eye or lid nodes, so none of that runs). The head is `FUN_005ad5b0`: the
  head node `actor+0x308` and its parents neck, spinehi and spinelo, each post-multiplied by `FUN_005ae730`'s turn for
  the look's yaw fraction (over 90 degrees) and pitch fraction (over 80; `FUN_00287210`). The turn per node comes from
  `FUN_005ae980`: nine Euler poses a node in the ELF (0x650820, 0x6507b0, 0x650740, 0x6506d0; `Z Y X`,
  `FUN_00287550`), the axis `forward x rotate(conj(P_rest) P_edge, forward)` for right, left, up and down -- a full
  right yaw turns the SEAL's head 64 degrees, left 48; the pitch poses barely move it. The look is a rotator at
  `actor+0x1190` (`FUN_005ad9d0` / `FUN_005ad920`: eased, at a set angular speed) fed by the player's controller
  (`CSealCtrl`, vtable 0x6694b0): `FUN_00596f10` asks for `(sin p, 0, -cos p)`, `p = -1.5 x 0.349 x` the turn axis,
  while the axis is past 0.05 -- **the head leads the turn by 30 degrees at the full rate**, at 2.9 rad/s -- and
  otherwise the look is ahead, with a **glance aside every 4-7 s** of 16-22 degrees, left and right in turn
  (`FUN_00601400`, `FUN_00600550`), at 0.8-1.4 rad/s. `FUN_0057a330` (439152-439191) runs it with the rifle's raise
  weight 0 or the rotator still turning, not prone, not in states 8-10 (`FUN_00587b40`; `Land forward` is pushed in
  state 8), no SEAL clip carrying `NoHeadlooks`.
- **The raise weight** (`FUN_00286b80(actor+0x1160)`, the WEAPON workstream's `./weaponRaise`) now reaches the
  animator (`MoverSnapshot.aimWeight`): the twist runs only over 0 (439192) and is scaled by it; with the rifle down --
  5 s after the trigger, or after the last enemy the perception marked (research 321 s4.1.1 point 7) -- the upper body no longer takes the pitch, and the head look runs. The launcher anim set
  (`DAT_0044d408`) forces 1 (not the SEAL's).
- **The jump's rule** (`FUN_0057e1b0`): the top action's entry must play a **looped** motion
  (`FUN_005551a0(entry+0x28, 0x40)`; bit 0x40 is the motion's looped bit, set by `FUN_0028dc90` from `+0x49` bit 6).
  `FUN_00550ef0` takes the press during a one-shot too (`ctrl+0x170` bit 2, set with the press by `FUN_00592d50`), so it
  is spent and refused. `FUN_005b4340(actor, 0xb)` adds: not prone, not in the knock-downs `Fall forward` /
  `backwards`, the death landings `Land forward` / `backwards`, `180`, `dive_to_prone`, states 5 and 8, the launcher
  sets. Every action the walk plays is a one-shot and the idles, locomotion and turn steps are looped, so the viewer's
  rule was already the game's; the fall's exception is gone.
- **Death** (`FUN_005af590`): at 237.5 or more (`m_landSpeed[2]`) `Land forward` pushed in state 8 and the death (the
  vtable's +0x90, `FUN_005a5da0`); the class also goes to 3 for an actor without `actor+0xe1` bit 4. The controller's
  `FUN_005979a0` (454470-454495) then spectates, or in a respawn game fades the body out (alpha 0 at 0.1 a second) and
  `FUN_00599b60` (455695) fades the new SEAL in at a spawn (1.0 at 4 a second) -- research 90 §5. No get-up: the
  viewer's `Get up forward` after the death landing stays a named placeholder; the head look is off in it.
- **The rifle <-> pistol swap** (`FUN_005a64c0`, 461850-462030): to the pistol, prone `Prone rifle -> Pistol` (0x37),
  crouched or standing at 20 a second or under `Crouch rifle -> Pistol` (0x36) / `Rifle -> Pistol` (0x35), faster
  `Moving rifle -> Pistol` -- a `BlendOverlay` motion on the second play channel (`FUN_0028d860(anim+0x60)`), over the
  locomotion; to the rifle the same clips backwards (`FUN_00588bc0`'s fourth argument, `FUN_0028c160`). The standing
  swap is `NoInterrupt ()` yet `FUN_00550ef0` tests the stick on action 0x35 all the same, and continues it as the
  moving overlay at the phase reached (418226-418245). Ported as `Walker.swapWeapon` / `WalkMode.swapWeapon` (the
  full-body ones as actions holding the mover, the moving one as `MoverOverlay`, laid by the animator over the parts
  it carries): the WEAPON workstream calls it and `Animator.setWeapon` at the hand-off.

## 6d. Letting go of a diagonal (2026-09-29, the owner's play test)

The owner: "run forward -> run forward-left -> let go of left causes a janky animation cancel". The diagonal is one
play, not a separate clip: with W+A the stick is (1, -1), `w = 0.5`, and `FUN_00583030` plays `seal_run` x 0.5 and
`seal_run_90l` x 0.5 at one shared phase. Letting go of A is **`FUN_00586c10`'s snap** (decomp 445037-445050): an
axis whose last value is past 0.78 (the `+0x248` axis; 0.9 for `+0x24c`) and whose wish moves faster than 7.8 (9) a
second takes the wish at once -- so `w` goes from 0.5 to 0 in one tick. The game covers that tick: on a snap it calls
**`FUN_0028e3e0(actor+0x170)`**, the pose snapshot (135387-135414: each node's shown translation and rotation copied to
its blend source), and writes **0.2** (`0x3e4ccccd`) to `actor+0x178` and `+0x17c` (445051-445055) -- the same two play
fields `FUN_0028dc90` fills with a new motion's `BlendTime` (`iVar9 + 8`, `+0xc`, after its own `FUN_0028e3e0`). So
the play runs on (same nodes, same phase: the gait keeps its foot) and the body cross-fades into it from the pose on
screen over 0.2 s. reCOM names the fields only (`zBody` `m_take_snapshot`, `zAnim` `m_blendtime`).

The viewer took the snap (`throttleStep`) and not the cross-fade (the mover's header listed "the clips' own blend-in
(0.2 s)" as not modelled). Measured with the real clips and `motion.rdr` (`test/stickSnap.test.ts`, 60 Hz): the
release tick moved a joint **3.56** units (the mirror 3.56; strafe right then forward 5.94) against a steady stride's
largest 1.55; now the largest move over the fade is 1.39 (1.40; 1.60 against that script's 1.80), the play and its
phase unbroken. The press's tail snaps too (the ramp at 5 a second reaches 0.833, and 0.833 -> 1 is 10 a second, past
7.8), so a 0.2 s fade also starts on the 11th tick of pressing a full side -- as the game's. A crouch walk's diagonal
(0.669 an axis after the 14 / 14.8 rescale) never snaps; the crouch at full keys runs the standing blend, and snaps.

Ported: `throttleSnaps`, `STICK_SNAP_BLEND`, `Walker.stickSnaps` (every `FUN_00586c10` caller: the stand, the crouch
walk, the jump's stick), `PlaySnapshot.stickSnaps`; the animator snapshots and fades when the count changes (a new play
the same tick keeps its own `BlendTime`, as `FUN_0028dc90` writes after); the wire carries its low bit in the body's
packed byte (bit 7, no size change), so the other screens fade on the same tick.

## 6e. The movement locks, the scoped stick and R3 (2026-09-29, the owner's play test)

The owner: "SOCOM should lock your movement when throwing a grenade or planting certain equipment"; reload on R3; and
research 84 section 17's finding that the scoped SEAL moved at full speed.

- **What locks, and how.** `FUN_00550ef0` (418172-418246) runs the ground state (`FUN_005870e0(actor, 0)`) only while
  the entry on top of the action stack (`actor+0x1c0`) plays a looped motion (`FUN_005551a0(entry+0x28, 0x40)`); with a
  one-shot there it runs it only when `FUN_00587c20` lets the stick cut the one-shot. The kit's one-shots are pushed
  there by `FUN_00588bc0`, and none is a `BlendOverlay` motion (the second channel over the locomotion): the throw
  (`FUN_005802b0`, 441900-441903: `GetThrowAnim`'s clip, pushed when the button is let go), the claymore
  (`Place claymore`, `seal_place_claymore`), and the reload (`FUN_005a82e0`, 462786-462930) when it starts still
  crouched (`|v|^2 <= 400`: `Rifle crouch reload`, else `Moving rifle reload`, the overlay) or prone (`Rifle prone
  reload` always), each with its `Pistol ...` twin. While one holds, the SEAL moves by its clip's root alone
  (`FUN_0028c250`): not at all on a throw, whose clips have one root key; 0.4 units over the claymore's 2.4 s. A
  **full lock**: the move axes are not scaled, they are not read.
- **The turn stays free**: `FUN_00551ec0` zeroes the turn axis only in its listed states and for a clip carrying
  `NoTurn` (`FUN_00587e00`, 418689-418692); no throw, placing or reload clip carries it. Turning past 0.1 of
  `turn_maxrate` once the phase is past `NoInterrupt` cuts the clip, as the stick does (418183-418186).
- **When it ends**: a move axis (or the turn) past 0.1 with the phase past the clip's `NoInterrupt`, or the clip's
  end. `motion.rdr`: the standing throw 0.49 (0.76 s), the toss 0.75, the crouched throw 0.8, the prone throw and toss
  and both peeks' tosses 0.9, the claymore 0.9 (2.39 s), the crouched reload 0.35, the prone 0.5. Every throw's release
  fraction (research 85 section 3) is under its `NoInterrupt`: the grenade is always out before the stick can move.
- **What does not lock**: the throw's hold (the power's chase in `FUN_00594cf0`, 0x595ea0-0x595f28, touches no move
  axis; the clip is pushed at the let-go); the standing reload (`seal_reload` has no `NoInterrupt`, so the first push
  cuts it, and `FUN_00550ef0` 418202-418214 carries it on as `Moving rifle reload` over the locomotion); a reload begun
  moving; the Detonator (`CZKit_DetonateRemoteExplosives` plays no SEAL clip); the door (`FUN_00592d50` 452017-452018
  runs the door's zAnim, `FUN_002b44e0`; `singleDoor_right` moves the leaf only, research 92 section 2). The jump is
  refused while a lock holds (`FUN_0057e1b0` wants a looped entry on top).
- **Ported** as `Walker.hold` / `HOLD_CLIPS` (`viewer/src/mover.ts`, the mover the server runs): the page starts a hold
  from the grenade's `throwStart` (the throws and the claymore) and the fire's `reloadStart` (`reloadHold`: crouched and
  prone only); each rides the next command in four bits over `HOLD_SHIFT` (`net/protocol.ts`, protocol 3), so the
  server's mover holds on the same tick. The body's clip is still the grenade's and the weapon's pose layers
  (`throwPose.ts`, `weaponPose.ts`): the lock stops the legs' locomotion, it plays no clip of its own. [reading: when the
  stick cuts a throw the game pops its clip; the viewer's throw layer plays on to its end.]
- **The scoped stick**: `FUN_005966a0` (453818-453821) multiplies both move axes by 0.2 (a literal; `DAT_00650638` is the look's factor, 453813-453817) in the 9x view
  (`FUN_005b9990`) or a scope (`FUN_005b90f0`) before it stores them -- so before the ramp, the ground state and the
  cut test read them. Ported in the mover (`Walker.scoped`: the axes clamped, then x 0.2); the page sets it from the
  zoom's state 4 and up (not the night vision, which `Button.Aim` covers too) and sends `Button.Scope`.
- **R3** is the game's `Reload`: `READERC.ZAR/controller.rdr`'s Default binds it (research 85 section 9.1), the pad
  result 6 `FUN_00594cf0` reads with `FUN_002c64e0(6)` (453459-453463) to arm the reload timer. So the owner's ruling and
  the game agree. R3 held the fly camera's boost (assumed) before; the boost moved to Circle (the game's `TeamCommand`,
  which the viewer does not have), so no button carries two actions.

## 6f. SEP-POP: the stick cuts the player's stance transitions (2026-10-31; reading, pending review)

The owner, Craig, 2026-10-31 in the gameplay seat (MISSION OT.R93): SEPARATE identical to the original, COMBINED as it
is. The source audit (`agent-mail/evidence/prone-pop/AUDIT.md`, the gameplay lane) re-read here at the source, and the
EPH capture (`agent-mail/evidence/eph-tilt-measured-2026-10-31/FINDINGS.md` Q3, runs 20261031T162343Z, 162421Z,
162455Z, 162531Z, 162614Z: the original running, **proven** for the figures it gives).

- **`+0x30` is `IsAi`.** `FUN_00587c20` (D:L445533-445546) refuses ids 100, 99, 0x19, 0x13, 0x11 and `DAT_003dec50` only
  when the controller's slot `+0x30` answers. The player's `CSealCtrl` vtable (0x6694b0) holds 0x5499d0 there, which
  returns 0; `CSealCtrlAi` (0x6693f0) holds 0x575c40, which returns 1 (research 191 section 4, STRONG; research 313 and
  87's `STANCE_WORD_DIVE_REQUEST_READING` already read it so). §6's "read as the player's" had it backwards, and the port
  held the three transitions whole for every SEAL on it (`ACTION_CLIPS` hand-set `noInterrupt` 1; LATER 598 rested its
  conclusion on that 1 -- wrong, corrected on its own branch by the lane).
- **The cut** (D:L445527-445565 with `FUN_00550ef0` D:L418176-418190): the top play not ending this tick
  (`FUN_0028c6e0`); its node's bit 0x2 set (D:L445532); 0x11 refused while the actor holds a partner at `+0xeac`
  (D:L445533; `STANCE_CUT_ESCORT_READING`); then, by the play's reversed bit 0x20 (D:L445549), forward: cut when the
  phase (`+0x1c`) is past the motion's `NoInterrupt` (`+0x30`, D:L445552-445557); reversed: when the phase is under 1 -
  `NoInterrupt` (D:L445559-445563) -- a reversed play's phase runs down from its end, `(n - 1) / n`, and ends under 0
  (`FUN_0028c6e0` D:L134298-134305). The driver takes it when a move axis or the turn axis passes 0.1 (D:L418181-418185)
  and `FUN_005870e0` (D:L445113-445170) pops the play, sets the posture from the play left on top (+0x2b), and -- that
  play looped, bit 0x40 (D:L445158-445160) -- runs the stance's ground state (D:L445161-445168).
- **The disc's `NoInterrupt`** (`motion.rdr` through `motionTable.ts`, the fixture): `seal_stand2crouch` absent (0),
  `seal_crouch2prone` absent (0), `seal_stand2prone` 0.9, `seal_dive2prone` bare (1: never). `ACTION_CLIPS` now holds
  them, pinned by `locomotion.test.ts` and `movementTables.parity.test.ts` with no exemption.
- **The bit.** Pushed forward by `FUN_00581540` (D:L442405-442431) and `FUN_005817d0` (D:L442494-442518) it is kept;
  `FUN_00581c10` clears it on prone -> stand (D:L442626-442629), so that one is never cut; `FUN_00580b70`'s 0x13 reversed
  (from D:L442174, called at D:L468435-468500) clears it too -- not the press's path.
- **So**, for the player: crouch -> prone (0x13 forward) and stand -> crouch (0x11) give way to the stick a frame after
  their push; prone -> crouch (0x13 reversed, `FUN_005817d0` D:L442517-442518) and crouch -> stand (0x11 reversed,
  D:L442639-442640) on their push's frame; stand -> prone (0x19) past 0.9; prone -> stand never. **The quick drop**
  (STM.R3) and **the pop** are this one rule. Q3 (proven): on the first frame after the light press from prone at full
  lateral, posture 1, request 1, action 2, top 0x42 "Run right"; the reversed 0x13 never on top; 0.963 x 65 = 62.7 u/s.
  Below 0.838 of a stick `FUN_00584c60` gives the crouch walk (D:L444150-444170; unmeasured, a reading).
- **The ground state after the cut** is the port's own already: `FUN_00584c60`'s run test, `FUN_0057efe0`'s headroom ray
  (D:L441190-441245, read and ported: `Walker.headroom`, research 217) -- the audit's "FUN_0057efe0's body unread" is
  not so, and no new name stands in for it.
- **The blend** (item 3): the new play's cross-fade takes its main motion's `BlendTime` (`FUN_0028dc90`,
  `Animator.start`); the standing right set's three clips have none, so `FUN_00287620`'s 0.4. Q3's 1.7 -> 10.0 root rise
  in about 0.35 s fits, and EPH round 4 (`agent-mail/evidence/eph-round4-2026-10-31/`, runs 20261031T170731Z-171148Z,
  capture, unscored) measures it: every stick case's first 12 frames follow 2(k/12)^2 to k = 6, then 1 - 2(1 - k/12)^2 --
  a 0.400 s quadratic ease-in-out, the traced node ease (`blendWeight`) over 0.4 exactly; the tilt's return follows it.
  Pinned by `locomotion.test.ts` (the disc) and `animator.test.ts`; no new name.
- **The moving branches** (item 4): to crouch, `|v|^2` > 400 the run, > 100 the crouch walk, else 0x11 (D:L442495-442515);
  to stand, > 100 the run, else 0x11 reversed (D:L442632-442640). The port's "over 10 a second, no clip" and the ground
  state the next tick give the same; the pushes write no velocity, where the port zeroed it at a clip's start -- now
  zeroed in COMBINED and on the bots' movers only (`applyStance`, `Walker.stanceSeparate` off), with no step's
  difference (the clip's root or the cut's ground state sets it).
- **The port** (`viewer/src/mover.ts`): `Walker.stanceCut` -- on for the player in both stance modes since COMBINED-CUT
  (below; the page each tick, the room on every command that states its mode, `MoverSim.ai` false), off for the bots
  (the original's `IsAi` refusal: `MoverSim.ai`, marked by the room on a CPU connection's seat and by the bots' brain on
  a seat it adopts while it drives it, a Forge NPC on patrol; the bots' trace pinned position by position to
  main's by `stanceCutSeparate.test.ts`). `Walker.stanceSeparate` carries SEPARATE's own apart from the cut: the
  velocity left at a push, and the room's ignoring of the pop's code (STM.R2a). `pastNoInterrupt` is the phase test,
  read a game frame behind the clock (`STANCE_CUT_TICK_READING`).
- **COMBINED-CUT** (2026-10-31; reading, pending review -- the cut's reading is this section's, applied to one more
  walker): the owner, MISSION OT.R93's note of 2026-10-31, "3 + 4": COMBINED stays the default and takes the stick's
  cut of its stance transitions, its hold flow unchanged. The cut is the same path (`stanceCut`), and nothing else of
  COMBINED's moves: the 0.4 s hold (`STANCE_HOLD_S_PLACEHOLDER`; the page's full press still takes 26 frames to put the
  stance word prone, as before), main's zero at a push, the pop's code 3, the dive cancel, prone -> stand whole (bit
  0x2). No wire change: the room marks the AI, not a new bit -- a CPU's connection at its seat (`room.ts` `newSim`,
  `Conn.cpu`; carried over a respawn) and a seat the bots' brain adopts (`MatchBots.adopt`, cleared at `release`: the
  fresh review's F1, a Forge NPC on patrol); every other seat is a player's (`roomStanceAi.test.ts`). One consequence is the window's own rule, not a change to it: OT.R76's pop window is the drop's life
  (`WalkMode.popMotion`), so a drop the stick cuts (a game frame after it is on top) closes it, and a Square after the
  cut is the native jump; without the stick, and in the dive, the window is main's (`stanceCutRoomPage.test.ts`,
  `triangleSquarePop.test.ts`). On the pad, COMBINED's tap from prone stands (`stanceOnTap`), a clip never cut; the
  crouch pop into the run is the keyboard's and touch C's tap from prone (`stanceKeyOnTap`) or a crouch asked otherwise.
  The owner kept both as they are (MISSION OT.R93's note: "Leave it (stand)").
- **The live confirmation of SEPARATE** (capture plus the owner's visual check, **unscored**): Craig's repro of the
  quick drop and the pop (`agent-mail/evidence/eph-crouch-pop-repro-20261031T212625Z/`: the original beside page
  a260cc775, on his own pad; the headless replay's analysis in its `analysis/`) failed on the page before SEP-POP. Its
  replay on the B193 page (`agent-mail/evidence/eph-crouch-pop-replay-b193-20261031T214307Z/`, SEPARATE, page build
  5c853e02a) he watched and said, verbatim: "it is PERFECT". Not scored by the harness: the figures above stay at
  their levels (Q3's proven, the rest reading).
- **EPH round 4** (runs 20261031T170731Z-171148Z, capture, unscored): the pop lands on the first frame after the light
  press's release; half a stick (pad 0.40) gives action 0x14, the crouch walk, its lateral climbing 0.167 a frame
  (`FUN_00586c10`'s 5 a second) to 0.911: 8.5, 11.0, 13.4, then 13.68 u/s -- the port's axis goes to 14 / 14.8 = 0.946,
  14.19 u/s aside: **open**, why the original settles at 0.911; no stick, the reversed 0x13 plays whole, 25-26 frames
  (0.834-0.851 s; the port's 0.846), its phase from 0.931 down (a frame past (n - 1) / n = 0.970: the reversed play
  starts at its end, as read); full stick, action 2 / 0x42 from frame 1 at 62.6 u/s. Pinned by
  `stanceCutSeparate.test.ts`.
- **Not ported, seen in Q3 and round 4:** with a full stick let go after the pop, 0x11 plays 0.58-0.60 s (the root 10.04
  to 5.50), then 0x12; with half a stick let go, 0x12 at once -- the crouch's own return from the run (`FUN_00584c60`'s
  idle branch); the port's crouch at rest takes the crouch idle at once in both. It runs in COMBINED too, so it is left
  for its own task under OT.R93's gate (the posture word the run carries is the same question: Q3 reads posture 1, the
  port's `posture` is `stand` while the crouch runs).

## 6g. MOVE: the drop's travel, the crouched diagonal and the stance cancels (2026-11-02; reading, pending review)

B196, the gameplay lane's MOVE items, SEPARATE only (OT.R93: `Walker.stanceSeparate`; COMBINED and the bots as main has
them). Every cite is r0001's decompilation (`D:L`) and the r0004 twin at its own address, read by disassembly
(capstone) against the r0001 code: where r0004 differs, r0004 decides (OT.R97). The evidence that found them is the
EPH hunt's capture comparison (`agent-mail/evidence/eph-hunt-2026-11-01/rerun-sep-pop/RESULTS.md`, r0004 on PCSX2
beside page v0.4.2 in SEPARATE, 3 trials each; capture, unscored).

### MOVE-1: the crouch <-> prone root travel

- **The original.** While action 0x13 (`Crouch -> Prone`, `seal_crouch2prone`) is current (`FUN_00577e40(actor,
  0x13)`), the body tick `FUN_0054d9a0` replaces the top play's vector with (0, 0, 8 / T) -- (0, 0, -8 / T) when the
  node's flags hold 0x20, the reverse flag (`FUN_0028c160` sets it as it reverses a play, D:L134094) -- and adds it to
  the velocity `+0x2c` (D:L416435-416455). T is the clip's `anim+0x10` (its `playback`) times `FUN_0028ada0`'s
  (n - 1) / n (D:L133349-133366): 0.9 x 32/33 = 0.8727 s. r0004: `FUN_0054d9a0`'s twin is 0x552790, the block at
  0x552800-0x5528b8 the same instructions (the 8.0 and -8.0 at 0x552880 and 0x55285c); `FUN_0028ada0`'s is 0x28c130,
  unchanged.
- **What it does.** 8 / T of local z (behind) each second the clip is current, against the clip's own root travel
  (-8.39 forward, `MOTION_P.ZAR`). Over the port's one-shot (`ACTION_SECONDS`, playback x ((n - 1) / n)^2 = 0.8463 s)
  that is 7.76 u: net (0.99, -0.63), about 1.17 u. Capture: 0.9-1.1 u in each 0x13 on r0004 (crouch-then-full-mid,
  pop-left-020), the page 7.6-8.1 u. **1.17 u sits just outside the capture's 0.9-1.1 u**: recorded as it is, not tuned
  to the capture (review F1, 2026-11-02; the first commit divided by `ACTION_SECONDS` and gave 1.06 u, against the
  source). The trace owed below settles where the 0.07-0.27 u goes.
- **The port.** `CROUCH_PRONE_PUSH_READING` (8, `mover.ts`): under a held `crouchToProne` in SEPARATE the root-motion
  branch adds 8 / (playback x (n - 1) / n) of local z, signed by `reversed`, each tick the clip is current -- a cut
  clip carries its share. Pinned by `test/moveParitySeparate.test.ts`, with COMBINED's whole travel.
- **Why a reading.** One inference: `+0x2c` already holds the clip's root when the vector is added (`FUN_0057a330`'s
  `FUN_0028c250` writes it earlier in the frame). T and the flag are the decompilation's (above).
  Owed: a PINE trace of `+0x2c..+0x34` and the top node's +0..+8 through a drop and a pop.

### MOVE-4: the crouched diagonal

- **The original.** The crouch walk `FUN_00582d10` stores the stick at `+0xf60` (lateral) and `+0xf64` (forward), and
  `FUN_00583350`'s w and 1 - w at `+0xf68` / `+0xf6c` (D:L443197-443200). `FUN_00583350` (D:L443326-443370): the
  forward axis zeroed within `DAT_003f3428` (0.03) for the measure, w = (2 / pi) asin(|lateral| / r) clamped to [0, 1],
  and `DAT_0064fc80` = 1 / sqrt(w^2 + (1 - w)^2). `FUN_0057a330`, once the class clip's root velocity is in `+0x2c`
  (`FUN_0028c250`), splits it when `+0xf68` is not the sentinel -99 (D:L438911-438955): by the class (`+0x1338`), the
  class axis's component times w goes to x and times 1 - w to z, the class axis keeping its own sign and the other
  axis taking the stick's (`+0xf60` for the forward and back classes, `+0xf64` for the side ones); then it writes the
  sentinel back (D:L438956) and scales `+0x2c` by `DAT_0064fc80` (`FUN_00309180`, D:L438985). So w always goes to x:
  the walk keeps the class band's speed, along atan2(w, 1 - w) off the forward axis -- 45 degrees at 45, 26.57 at 30.
  Only `FUN_00582d10` writes `+0xf68` (D:L443199): the crouch walk alone; the standing blend (`FUN_00583030`) never
  reaches the split.
- **r0004.** `FUN_0057a330`'s twin is 0x57f580: the split's block is the same code from 0x57fba8 (the class read at
  `+0x133c`, the struct's +4 shift); its one code change in that stretch is the Jump block (`DAT_003deae8`, r1
  0x57aa88-0x57ab3c, the air control), not the walk. `FUN_00582d10` -> 0x588310 and `FUN_00583350` -> 0x588950 are the
  same code (field offsets only).
- **The port's old reading, superseded.** `mover.ts`'s header and the crouch branch of `Walker.locomote` ran the whole
  speed along the class axis, scaled by `DAT_0064fc80`: 19.8 u/s along the axis at 45 degrees (research 101 A5; the
  page in the capture: 180 degrees at 17.45 u/s). In SEPARATE the branch now splits as the original does; COMBINED and
  the bots keep the old reading under OT.R93 -- the original runs this whatever the button's mode, so carrying it to
  COMBINED is the owner's question (HUMAN_TASKS H392).
- **Capture.** D1 (forward 0.5 + left 0.5, crouched): r0004 heads 225 degrees with yaw 180 (45 degrees off the facing)
  at 12.93 u/s; r0001 225 / 13.14; forward alone 14.00 against the page's 13.78. Run 085408Z's steady step reads 14.0
  u/s at 45 degrees. *Corrected 2026-11-02 (ac's acceptance at bd96f2044, eph-hunt-2026-11-01/move-acceptance, capture
  comparison, 3 trials):* the original walks D1 at 225 degrees at **12.94 u/s**, the page at 225 degrees at **12.80 u/s**
  (spread 0.30); forward 0.5 alone 14.00 against 13.86. ~~The reading's "band speed 14.0" at 45 degrees~~ was wrong: it
  is not what the original does, and the page, which runs the split on its own stick path, matches the original. The
  unit test's 14 (`moveParitySeparate.test.ts`, a full ramp at a 0.6 stick) pins the split's arithmetic, not the
  capture's speed. Owed: `+0xf60..+0xf6c` traced through a crouched diagonal, for why the diagonal runs at 12.9.
- Pinned by `test/moveParitySeparate.test.ts` (45 and 30 degrees, the back-left mirror, forward alone, COMBINED).

### MOVE-2: the stance and dive cancels

- **The original.** The press toggles the request `+0x374` (`FUN_00594cf0` D:L453360-453425; r0004 0x59a6e0, the
  toggle block 0x59b49c-0x59b6a8 the same code). `FUN_00552d60` asks `FUN_00552ec0` (D:L418927-419015): a request
  passes only under a looped top or a stance transition (D:L418927-418930, `FUN_00588080` D:L445716-445734), and each
  transition refuses one target -- 0x11 prone (D:L418932), 0x19 crouch (D:L418953), 0x13 stand (D:L418995); a refused
  request is kept. Taken, the handler -- `FUN_00581dc0` stand (D:L442650+), `FUN_00581660` prone (D:L442436+),
  `FUN_00581990` crouch (D:L442526+) -- pops the stack above its base and picks from the posture word `+0x174` the
  previous take wrote (`FUN_00581ed0`, vtable +0x90, D:L442697): `FUN_00581c10` from 2 plays 0x19 reversed
  (D:L442627) and from 1 tests `|+0x2c|^2 > 100` -- the type-2 idle at posture 0, the cut clip's time copied, else 0x11
  reversed (D:L442633-442640); `FUN_00581540` from 0 plays 0x1a then 0x19, from 1 0x1a then 0x13 (D:L442421-442427);
  `FUN_005817d0` from 0 tests the same speed (400 the run, 100 the crouch walk 0x14, else 0x11, D:L442495-442511), from
  2 plays 0x12 then 0x13 reversed (D:L442516-442518). A reversed one-shot starts at its end (`FUN_0028c160`
  D:L134092-134100). r0004 twins: `FUN_00552ec0` 0x558080 -- the three refusals unchanged (0x5581e4, 0x55827c,
  0x558474); r0004 adds, online only (`m_bNetwork` 0x45d481), a re-arm of the request to the posture when the crouch
  and prone branches' controller tests fail (0x5583a4-0x5583d8, 0x558524-0x558558), and clears the request and the
  obstacle slot on an obstacle refusal (0x558334-0x558364, 0x5584d4-0x5584e4); and, on the outer gate's refuse path
  (a top neither looped nor a transition -- where a press under the dive goes), 0x5580c0-0x558180: an unconditional
  `0x5b69e0(actor, 0)` (`FUN_005b0bb0`'s twin: the obstacle slot cleared), then, with `+0x174` == 3 and a prone peek on
  top (0x409cd0 / 0x409cd8), the request written 1 and the peek left (0x582e60), returning 1 (the r0004 movement
  cluster's item 4; review of bd96f2044, F1). None of these changes the outcomes below -- the dive's posture is not 3,
  and the slot is not read on these paths -- and none is ported here. `FUN_00581dc0` 0x5873c0, `FUN_00581660` 0x586c10, `FUN_00581990` 0x586f90, `FUN_00581c10` 0x587210,
  `FUN_00581540` 0x586af0, `FUN_00581ed0` 0x5874d0, `FUN_0028c160` 0x28d4f0, `FUN_00588080` 0x58d6b0: the same code.
  `FUN_005817d0`'s twin is 0x586d80: cases 0 and 2 unchanged; r0004's one change is a new default case (vtable +0x90,
  then treated as case 0 -- the r0004 movement cluster's item 3, the crouch press while peeking), not on these paths.
- **The cases** (capture: eph-hunt rerun-sep-pop, r0004, 3 trials each; the port, SEPARATE only, `Walker.applyStance`):
  - **C1b / S6** -- stand pressed during the drop to prone: 0x19 reversed from its end, 0.90-0.92 s. The port replaces
    the held drop with `standToProne` reversed (the page played a 0.50-0.62 s get-up).
  - **C1c** -- prone pressed during the pop: 0x13 forward from 0, 0.80-0.82 s, 0.9-1.0 u. The port replaces the pop
    with `crouchToProne` forward (MOVE-1's push keeps it near 1 u).
  - **The clip lengths** (review of bd96f2044, F4): the port plays the get-up in 0.945 s and the restarted drop in
    0.846 s (`ACTION_SECONDS`) against the capture's 0.90-0.92 s and 0.80-0.82 s -- about 0.03-0.04 s long, probably
    the capture's measurement offset (the frame the clip is first and last seen on top); recorded as it is, as MOVE-1's
    1.17 u is, not tuned. Settled by ac's rerun timing the same clips on the page and the original by one rule.
  - **C1d** -- stand pressed during the pop: refused and kept, then 0x11 reversed at the pop's end (the 0.57-0.58 s
    rise). The port's gate already kept it (`TRANSITION_REFUSES`); the page snapped because the pop's carried 8 u gave
    the moving return its speed -- MOVE-1 leaves about 1.4 u/s, so `standToCrouch` reversed plays.
  - **C1a** -- stand pressed during stand -> crouch, early or late: back to the standing idle, no second clip. The
    speed test reads `+0x2c`, the clip's 3D root velocity: ac's capture logs |+0x2c|^2 of 115-141 at the cancel with
    about 7 u/s horizontal, so the vertical part passes it. The port takes the test as passed under a held transition
    (`STANCE_CANCEL_CLIP_SPEED_READING`: its keys carry no root y) and ends the clip with no new one. Not ported: the
    idle continuing the cut clip's phase (the type-2 play's copied time, 0.240 -> 0.246 in the capture), a drawing
    matter (note only).
  - **S3** -- crouch pressed during a dive: the dive's one-shot fails the outer gate, the request waits; at the dive's
    end, from the prone word, 0x12 then 0x13 reversed; ends crouched (3/3). The port keeps the press as the request
    while `Traversal.inDive()` (`stanceButton` -> `Walker.requestStance`) and asks it when the dive ends -- not through
    `topOneShot`, which would refuse `cancelDive`, COMBINED's OT.R67/OT.R76 adaptation. The page ended prone.
  - **jump-after-pop** -- 1.1-1.3 u on r0004 against the page's 7.8-8.0: MOVE-1's.
  - **S6, spam-mixed** (ac's acceptance at bd96f2044: FAIL, 3/3; runs 20261102T143637Z, 143746Z, 144009Z). The script:
    Triangle full at 500 ms (released 650), light 700-800, full 1100 (released 1250), light 1300-1400. The original's
    request byte `+0x374` (pcsx2.csv `stanceRequest`): 2 at about 500 (the drop, 0x19), 0 at about 1096 (stand, the
    full press's 2 -> 0, D:L453393-453425: 0x19 reversed from phase 0.937), the standing idle at 2033-2052 ms -- **the
    two light presses never taken** (the byte unchanged at 800 and at 1400, 3/3; in the hunt's earlier r0001 runs the
    800 light never, the 1400 one once in two). The page took both: its harness feeds the light on the Crouch bind
    (L3), a second button, so the 800 light asked crouch under the drop (kept, 0x19 refusing it), the 1100 full asked
    prone (`stanceOnHold` of the pending crouch -- what the original's toggle does from request 1, 1 -> 2), and the
    1400 light crouch again: the drop whole, then `crouchToProne` reversed, crouched. Fed only the two presses the
    original took, the walker plays the original's sequence (pinned: `moveParitySeparate.test.ts`, "spam-mixed"); fed
    all four, the original by its own toggle would end crouched as the page does. So the divergence is the press, not
    the gate or the handler: why the original took neither light, each starting 50 ms after a full press's release,
    when the read of `FUN_00594cf0` (D:L453332-453349: re-armed at the first rest, then the peak followed) takes them.
    S3's light, 150 ms after its full's release, was taken. **Closed by MOVE-S6 (2026-11-02, B200; reading, pending
    review).** The delivery probe (r0004 slot 5, PCSX2 alone, `tools/eph/probe.ts` scripts `probe-s6-light-after-{50,100,150}.txt`, 3 trials each (agent-mail `evidence/eph-hunt-2026-11-01/probes/S6-DELIVERY.md`, data `r0004-s6-delivery/probe.csv`)) shows PCSX2 delivers the 0.2 press, and the pad record's `+7` is a
    press state: 1 on the press frame, 2 held, 3 on the release frame, then 0. `FUN_00594cf0` re-arms only on 0
    (D:L453332-453333; r0004's twin 0x59a6e0 the same test, 0x59b448-0x59b458): at 50 ms the light arrives with no
    idle frame (0) before it -- on the release frame itself, `+7` still 3 with pressure 0.2 (t3), or on the next frame,
    3 -> 1 (t2) -- and is dropped either way (2/2); at 100 and 150 ms taken (3/3 each). The port:
    `StancePress` re-arms after `STANCE_PRESS_REARM_READING` idle frames past the release frame, stepped once a 30 Hz
    game frame (`ControllerInput.pressClock`; the match pages' `GamePad` gives it `performance.now`) -- SEPARATE only, as
    the pressure press is (COMBINED reads no `StancePress`, OT.R93). Spam-mixed on one pressure Triangle now takes the
    two full presses and ends standing (`stancePressRearm.test.ts`). A 50 ms rest holds one or two 30 Hz frames by
    where they fall, so the original's own outcome there depends on the phase; the probe's frames are pinned. The press
    clock's 30 Hz phase is its own (`ControllerInput`'s accumulator), not the simulation's game frame: the idle count is
    unaffected, but which frames a 50 ms rest catches depends on that phase, as the original's depends on its own.
    Owed: ac's rerun of S6 on one pressure Triangle (the harness's L3 bind is a second button, which the rule does not
    reach). *The 67 ms probe, done 2026-11-03 (S6-PROVEN; `STANCE_PRESS_REARM_READING` proven; was: owed, "1 rather
    than 2 rests on the reading of D:L453332-453333 alone"):* ac's one-idle-frame probe (r0004 slot 5, PCSX2 alone,
    `probe-s6-light-after-67.txt` and `-50.txt`, 4 trials each; `S6-DELIVERY.md` section "2026-11-03", data
    `r0004-s6-idle/probe.csv`) takes the light press about 67 ms after the full release 4/4 (request 2 -> 1, crouched)
    and refuses it at about 50 ms 4/4 (request 2, prone): the timing boundary is proven, within one 30 Hz frame, and 1
    fits it. The byte-level rule is narrower (ac's correction, `S6-DELIVERY.md` lines 51-52): a single release frame
    (`+7` 3) followed directly by the press is refused, a press after an idle (0) frame is taken, and a [3, 3] prefix
    splits -- 50 ms t2 refused, 67 ms t3 taken, differing only in the light press's first byte (2 refused, 1 taken).
    "Re-arm after one idle frame" fits every trial whose sampled byte shows the idle frame; the 30 Hz sampled byte
    alone does not decide [3, 3] (its sampling phase against `FUN_00594cf0`'s test).
- **COMBINED and the bots** keep main's early return (`stanceSeparate` off), pinned by `moveParitySeparate.test.ts`;
  H392 asks the owner whether MOVE-1 and MOVE-4 go to COMBINED (this one is the same question).
- **A seat the bots adopt** (review F3, 2026-11-02; it predates MOVE): the room's walker kept the human's last stated
  mode -- the bots' commands state none (`MoverSim.prepare` lays `stanceCut` / `stanceSeparate` only from a command that
  states it) -- so SEP-POP and MOVE-1/2/4 reached a bot-driven body until a respawn. `MatchBots.adopt` now lays the
  bots' words on the walker (both off, the refusal by id and main's flow); the human's next command after a release
  states its mode again. Pinned by `match/test/roomStanceAi.test.ts`.
- **Owed:** ac's rerun of C1a-d, S3 and S6 at this head; the clips' root y in the port's keys, to test
  `STANCE_CANCEL_CLIP_SPEED_READING` frame by frame (a cancel on a transition's first or last frames is not captured).

## 7. Readings and placeholders (named in the code)

- **`STANCE_CUT_TICK_READING`** (`mover.ts`, `'a frame behind'`; SEP-POP §6f): the port reads a transition's phase
  `RELOAD_PUSH_LAG` behind its clock, so a press's forward clip with `NoInterrupt` 0 stays on top one game frame and a
  reversed one goes on its press's tick (Q3: never on top). Not read: whether the press reaches its own frame's
  pre-tick; a request taken late (`retryStance`) is cut a tick later than a press. Owed: EPH case C (the frame the
  forward 0x13 leaves the top).
- **`CROUCH_WALK_AXIS_READING`** (`mover.ts`; §6f, the review's N2 (a); shared with COMBINED): the crouch walk's axis
  0.946 (14.19 u/s aside) against round 4's 0.911 (13.68 u/s) at pad 0.40. Owed: `+0x244` traced through the first
  crouched frames.
- **`CROUCH_RUN_RETURN_READING`** (`mover.ts`; §6f, the review's N2 (b); shared with COMBINED): the original's 0x11 then
  0x12 after a full-stick pop let go, and its posture crouch through the run. The release is built (LATER 678,
  2026-11-04, 'stand-to-crouch': `FUN_00584c60`'s idle branch, research 217 §2.9; SEPARATE only, OT.R93's gate);
  the posture stand through the run is not (the hull and hit volumes follow it). Owed: the run's posture write.
- **`STANCE_PRESS_REARM_READING`** (`stanceButton.ts`, 1; MOVE-S6 §6g; SEPARATE only; research 373's row): a new
  stance press needs one idle game frame after its release frame (`FUN_00594cf0` D:L453332-453333, `+7` at 0; r0004
  0x59b448-0x59b458). **Proven** by capture 2026-11-03 (S6-PROVEN, §6g: the light press about 67 ms after the full
  release taken 4/4, at about 50 ms refused 4/4: the timing boundary; the byte-level caveat there). Owed: ac's S6 rerun on one pressure Triangle.
- **`CROUCH_PRONE_PUSH_READING`** (`mover.ts`, 8; MOVE-1 §6g; SEPARATE only): the push `FUN_0054d9a0` adds under 0x13,
  8 / (playback x (n - 1) / n) of local z a second, signed by the reverse flag: 7.76 u over the port's clip, the drop
  and the pop about 1.17 u (the capture 0.9-1.1 u: just outside, recorded, not tuned). Owed: a PINE trace of
  `+0x2c..+0x34` and the top node's +0..+8 through a drop and a pop (that `+0x2c` holds the clip's root).
- **`STANCE_CANCEL_CLIP_SPEED_READING`** (`mover.ts`, `'clip root 3D over 10 under a held transition'`; MOVE-2 §6g;
  SEPARATE only): the stand <-> crouch speed test (`FUN_00581c10` D:L442633-442637, `FUN_005817d0` D:L442495-442511)
  reads `+0x2c`, the clip's 3D root velocity; the port, without root y, takes it as passed under a held stance
  transition, in both directions. Only one is captured: a stand pressed during a forward `standToCrouch` (C1a, ac's
  r0004 capture, |+0x2c|^2 115-141 at the cancel). The other -- a crouch pressed during a reversed `standToCrouch` --
  goes to `FUN_005817d0` case 0: 0x12, then over 400 the run, over 100 0x14, else 0x11; the port's no clip matches only
  over 100. **Uncaptured** (review of bd96f2044, F3). Owed: a capture of a crouch press during the rise (stand from
  crouch, then the crouch press at 100 and 300 ms, `+0x2c..+0x34` and the top's type logged), and the clips' root y,
  frame by frame.
- The peek (the review's N3): `STANCE_CUT_TICK_READING`'s lag reaches it too -- `peekHeld` asks
  `actionInterruptible`, which reads `pastNoInterrupt`; the timing of `FUN_005b4340(seal, 1)`'s site in the frame is
  unread.
- **`STANCE_CUT_ESCORT_READING`** (`mover.ts`, `'not ported'`; §6f): `FUN_00587c20` never cuts 0x11 while the actor holds
  a partner at `+0xeac` (D:L445533); the walker holds no such link. Owed: what `+0xeac` links, by its writers
  (D:L437926, D:L438447), carried on the walker.

- **Death** (`DEATH_LANDING_GETUP_PLACEHOLDER`, `mover.ts`; research 86 section 7.2): in the free walk (`&nomatch`,
  `&fly`) the viewer gets up after `Land forward` (the game dies there: §6c), since nothing kills there. In a match --
  online, or the offline match the page runs by default (research 91 section 20) -- the server's fall death is the
  game's: the net client's `kill` sets `Walker.dead` and `Land forward` holds at its last key.
- **The weapon switch's blend**: the playing motion's `BlendTime`; the overlay swap eased in and out over its own.
- **The swap's gates**: refused in the air and during an action (the caller's gate not read); the moving swap
  backwards to the rifle.
- **The head look**: the controller's `FUN_005e0010` test (forward at priority 3) is not read; the rotator's clamp
  (`FUN_005ae040`) is left out -- no request reaches behind the shoulder.
- **Not applied**: the eyes and lids (no nodes); the bots' modes (§6b).
- **`AIR_SEGMENT_DIRECTION_READING`** (`mover.ts`, `'velocity'`; Craig's loose jump batch, 2026-11-08; reading,
  pending review): the airborne body's records lie along the tick's move with the body's vertical speed in it on every
  60 Hz tick (`fall`), where the 30 Hz height step (PF-03) left half the ticks with a level `dy` and laid the records flat
  and low. The original's one tick a game frame always carries the fall in its displacement (`FUN_0054d9a0`
  D:L416501-416530), normalised in three axes for the records (`FUN_0054aa30` D:L415134-415166). Capture comparison
  (r0004 jump-near-wall, M51 g19733; `agent-mail/evidence/eph-hunt-2026-11-01/segment-body/jump-near-wall/RESULTS.md`):
  pressed 17.43 out (the port's run-up presses at 16.66) the port clears the 14-tall face in one arc: the hard landing
  (type 11) about 1.08 s after the press against the capture's 1067 ms, apex +16.18 against +15.77, 50.78 past the face
  against 49.09 (pinned in `weaponLine.test.ts`'s JUMP-AIR cases); before, it met the face on a level tick and climbed it. Moves the pins of
  `bridgeWedge.test.ts` (the crossing-frame fin and rim, the MP2 walk hash, the Crossroads slot case x 1672, which now
  lands in the slot -- as LATER 620 reads the original -- and walks out in 7 of 8 headings), `segmentBridgeWedge.test.ts`
  (its fin, held at -2.5 from the first tick; the playtest fall landing at 57.55, farther back before the fin) and
  `segmentBody.test.ts`'s step-up during a fall (feet 7 and over land on the rim; feet 6 from 2.1 short only) --
  re-pinned 2026-11-08 with these reasons in each test. Owed: a capture of a fall past a rim.
- **`AIR_STEP_UP_READING`** (`traversal.ts`, `'not-in-launch'`; the same batch; **proven** for the running jump's launch
  at one face by the capture-scored spec, the code's cause unread): the automatic step-up (class 4, 5 < h <= 10) does
  not start in the launch; the press's jump-grab is unchanged. The capture's 6.95 case swept the whole band with the
  contact set (`+0x10ac` every airborne frame) and CLIMB offered and never stepped up (types 8, 10, 2), though
  `FUN_00593500` D:L452279-452290 -> `FUN_0059d980` -> `FUN_005b3ce0` D:L469263-469276 -> `FUN_005b2620` ->
  `FUN_00580b70` would push it; what refuses it is unread (upstream; perhaps the stored contact's life in the air,
  `FUN_005483d0` D:L413618-413671). Scoped to the launch (review 1 F3): a walk-off fall, a dive, a knock and the bots
  keep the step-up, unevidenced either way. Pinned by `weaponLine.test.ts`'s two JUMP-AIR cases (red with `'any'`:
  the port steps up mid-air and lands on the top). Owed: the refusal read, or a trace of an airborne approach.
- **`AIR_PROBE_LIFT_READING`** -- retired 2026-11-09 by PROBE-ORIGIN (below; was `mover.ts`, `'r0004-floor'`; the same batch; **proven** for the launch: a memory trace
  of r0004 compared value for value over 2034 frames to 0.0001, held by `jumpAir.test.ts`'s pin of the traced 11.480 and
  the r0004 code read below; review 2 N2): in the running jump's launch the airborne floor pick's origin sits 11.48 over the feet
  (`PROBE_LIFT_FLOOR_STAND_R0004`), not the port's former step lift 5.5. `FUN_005b0840` (D:L467221-467228) adds the
  skeleton root's posed height (the translation row of the matrix at `vtbl[0x88]() + 0xc`; socom_pc research 23 s1.2);
  r0004's twin (0x5b6620) floors it by posture (0x5b67f8-0x5b6844: 11.48, `0x4137ae14`, standing; 5.0 crouched; else
  0), so the lift is max(the root, the floor); r0001 has no floor (D:L467252-467257). The launch's root is 10.57 on
  every key (`RUNNING_JUMP_ROOT`, pinned against the disc in `jumpAir.test.ts`), under the floor. The trace (PCSX2 r0004
  slot 5, 3 trials, `agent-mail/evidence/jump-air/ORIGIN-TRACE.md`; the harness column on `agent/eph-origin`) read
  11.480 in every launch frame, 11.480 standing, walking and running, 5.504 crouched, up to 15.06 in the standing jump
  (its clip's root over the floor), and the rule fits all 2034 frames to 0.0001. *History:* this batch's first text
  took the root alone (10.57) and called the spawn image's 5.5 decayed (review 1 F2: it is the crouched player's root,
  `STANCE` 5.504); the trace refuted the 10.57. The window reaches the feet + 12.48. The rule holds for every state, but
  JUMP-AIR takes it in the launch alone: the ground and the other airborne states keep 5.5, a named departure, LATER
  785. Crossroads' cart1 (top 56.0) to tent_beige's edge (76.9, 19.4 away) is out of reach under 5.5 (highest feet
  67.5, window 74.0; 0 of 156 swept runs) and within reach under the launch's lift -- a geometry sweep, no capture
  (`agent-mail/evidence/jump-air/probes/zzProbeCart.test.ts`: 25 of 156 swept runs land on the tent at 11.48; 19 of 156
  at the first text's 10.57); whether
  the console makes the jump is not captured. The M51 captures' pins hold under it. Pinned by `jumpAir.test.ts` (the
  lift 11.48; a plank 20 over the feet taken in the launch, not in `fall`; red with `'step'`).
- **PROBE-ORIGIN: the floor probe's origin for the ground and every airborne pick** (LATER 785; 2026-11-09,
  `agent/probe-origin`, Craig's word in seat redotcom-99, "Own batch in mega"; simulation track; reading (the movement seat's review, four rounds, final PASS high, per the merge dc4ac5222)
  for the code, the posture 0 and 1 values **proven** by the r0004 memory trace). The rule, r0004's twin of
  `FUN_005b0840` (0x5b6620) at 0x5b67f8-0x5b6844: the probe's origin over the feet is max(the skeleton root's posed
  height on the previous frame, C(posture)), C = 11.48 (`0x4137ae14`) when posture (`actor+0x174`) is 0, 5.0 when 1,
  else 0; r0001 has no floor (D:L467252-467257) and r0004 is the spec (OT.R97). The trace
  (`agent-mail/evidence/jump-air/ORIGIN-TRACE.md`, PCSX2 r0004 slot 5, 3 trials, the trials identical; the rule fits all
  2034 frames to 0.0001) reads 11.480 standing still, walking and running and in the running jump's launch (root 10.05
  -> 10.57, under the floor), 5.504 crouched (posture 1, the crouch root over 5.0), up to 15.059 in the standing jump
  (its clip's root, one frame lagged) and 5.508-10.863 through stand -> crouch. The port (`mover.ts`
  `PROBE_LIFT_FLOOR_R0004` `{ stand: 11.48, crouch: 5.0, prone: 0 }`, `probeLiftOf(posture, root)`, `Walker.probeLift`)
  takes it at every pick the mover makes -- the ground step, the spawn (`place`), the slide, the tilt's normal, the
  push-out, the fall and the airborne sub-step -- and the page's and the room's picks for a standing body
  (`probeLiftOf('stand')`: the spawns, `floorUnder`, the drops' settle, the turret's steer and hold; a remote body's tilt
  by its drawn stance, `REMOTE_PROBE_STANCE_READING`; the climb's settle by the walker's posture). The mover runs on the room with no posed skeleton,
  so the root term is the mover's own: standing on the ground under the floor (the trace), so 11.48; crouched
  `STANCE.crouch.rootY` 5.504; the launch `RUNNING_JUMP_ROOT` 10.57 under the floor, so 11.48 (as JUMP-AIR). A standing
  body's window now reaches the feet + 12.48 where the port's former 5.5 reached 6.5: it takes a floor polygon up to
  12.48 over its feet that no wall face stops (a top with no face toward it, a stair's side edge), and a standing spawn's
  record lifted a unit takes a top up to 13.48 over it. The root's one frame of lag matters only where the root term
  changes, which with the terms below is only at a stance transition and a crouch run's start, so the port carries no lag
  of its own. *The key (fold of review 1 F2):* the floor is keyed on the stance word `actor+0x174`, the port's `stance_`
  (OBF-23's label, `mover.ts` `PlaySnapshot.stanceState`; a crouch run keeps the word at 1, D:L444175-444187), not the
  drawn `posture_`; the build's first text keyed it on `posture_`, which lifted a crouch run by 11.48. A crouch run (word 1
  on the standing run's body) lifts by max(`CROUCH_RUN_PROBE_ROOT_READING` 10.02, 5.0) = 10.02. *What moved on the maps*
  (the implementer's all-maps spawn sweep, a dev-disc probe kept as a scratch file: every start and respawn record of the
  22 multiplayer maps, 4,591 records (an earlier report gave 6,029: a mis-added total, not a double count -- the same
  probe's per-map lines, 16 maps of 96 and MP2 572, MP5 433, MP51 393, MP64 476, MP8 722, MP81 459, sum to 4,591), placed as the room places them -- the record lifted a unit, then the pick -- under
  the base 6.5 window and the new 13.48, and each that moves stepped 2 s as a standing walker): FOUR records are
  affected -- 3 place differently, only one of them onto a near-vertical face (normal y under `MAX_SLOPE_COS` 0.643) or an
  invisible material, and MP8 respawn 0/326 places the same but rests elsewhere
  (`MP8_RESPAWN_326_READING`, below; note only). *Method:* a sweep of LATER 785's effect compares placements AND rests -- a standing walker placed as the room
  places the record and stepped 240 ticks (still stick) on each build -- so a changed rest is not missed. The rest
  comparison over all 4,591 records (the base mover, 447cec264's, against the merged head ee68361ab; a dev-disc probe kept
  as a scratch file, 2026-11-09) finds 4 rests that differ by more than 0.5, exactly these four: MP64 respawn 0/181
  (88.23), MP8 respawns 0/300 (12.83), 0/326 (93.11) and 0/330 (13.40); no record that moved on base rests in place now.
  MP8 respawns 300 and 330 (59.37 -> 72.19, 61.13 -> 74.53) snap onto `di_crates_land27` (mat 19 WOOD_THICK, normal y
  0.975), 12.82 and 13.40 over the record, and rest there: the original snaps too (`FUN_005b5d40` D:L470198-470240 filters
  by material and owner only). MP64 respawn 181 is `MP64_RESPAWN_181_READING` (below; note only). MP51's bot graph loses 4 directed
  edges (`navigationGraphIdentity.test.ts`, re-pinned). Pinned by `probeOrigin.test.ts` (the values, a standing
  floor taken at 12.4 and not 12.6, crouched 6.502 and not 6.51, prone 3.1 and not 3.25, a standing fall onto a plank 12
  over its feet, a crouch run taking 10.9 and not 11.5, the air's stance roots, a transition's target value) and
  `jumpAir.test.ts`.
- **`MP64_RESPAWN_181_READING`** (*note only*: no constant holds it; PROBE-ORIGIN, the controller's word): MP64 respawn
  181's record (1386.04, 9.32, 2435), under water at 9.32, is placed by the standing lift on `inv_di` at 18.16 (mat 3
  INVISIBLE_DI, normal y 0.067), 8.84 over it, inside the window the record + 13.48. The code keeps the face as read: the
  floor query's polygon test is 0x2dd130, which runs the VU0 microprogram vcallms 0x70 (the seat's source read:
  FUN_002dd130 loads three polygon rows by _lqc2 and calls _vcallms(0x70); no function entry for 0x2dd150 in the
  decompilation), so CDIPoly::GetIntersect is VU0 microcode outside the decompilation and the source cannot say whether
  the original hits a near-vertical polygon there. In the port a body placed there is pushed off the face in its first
  tick (r0004's near-vertical push, 0x554180-0x554354: 4.19 units) and, since LATER 833 (2026-11-10: the push is a
  displacement, never a velocity, research 217 s2.8, reading), carries no speed: a bare walker, still, moves a further
  2.30 units across in its second tick (airborne, velocity 0, at the face's height; that move's mechanism is not traced),
  then falls straight down to the floor under the record, first grounded after its 18th tick, and rests at
  (1391.30, 9.321, 2438.80), about 6.5 from the record, 6.42 under the water line (pinned by `probeOrigin.test.ts`; the
  room's rest is not re-measured). Before LATER 833 the push's 4.19 units were carried as a 251 u/s take-off and the
  body flew about 89 units to (1474.96, 15.105, 2438.84), 0.47 under the line (the room's (1472.73, 14.88, 2437.30),
  about 0.66 under) -- the launch LATER 833 removed. The respawn ends wet either way, and the rest now differs from the
  alternative, where r0004's GetIntersect skips near-vertical faces and the spawn stands in the water at 9.32, by those
  6.5 units across. The
  exchange fixture (`e2e/weaponExchangePlacement.ts`, a product-track fixture adaptation) settles a walker on a candidate
  and refuses one that does not stay or rests wet, so it refuses respawn 181. Settled by an r0004 respawn capture at MP64 respawn 181 (filed for the two-client session
  beside run 8), or the VU0 microprogram (vcallms 0x70 at 0x2dd130) disassembled.
- **`MP8_RESPAWN_326_READING`** (*note only*: no constant holds it; PROBE-ORIGIN, the controller's word): MP8 respawn
  0/326's record (1065.85, 102.86, 484.24) stands on a near-vertical floor, `land35/g3341` (mat 19, normal y 0.054); on both
  builds the body is placed there at 102.86, slides and takes r0004's near-vertical push (0x554180-0x554354), and leaves it
  in the air. Under the standing window (the feet + 12.48) the air pick takes `land35/g3343` (mat 0, normal y 0.611, the
  same terrain chunk's steep face beside the record's) and the body rests on it at (1067.64, 111.92, 479.97), grounded and
  dry. That face's normal y 0.611 is under `MAX_SLOPE_COS` 0.643, but the body rests on it because the face's column span
  under the feet is 0.16, under `SLIDE_SPAN_MIN` 4 (`steepSlide.ts`, `slideEligible`; 0x54f3c8, research 201 s3), by
  `SLIDE_SPAN_MEASURE_READING` `'column'`. Under `'vertices'` the polygon's extent is 10.52 and the body would slide, so
  this rest also rests on that reading (`FUN_002dbfb0`'s two points), beside the VU0 question. Under the former +6.5 it fell to `land36/g3344` (mat 0, normal y 0.982, the ground below) at
  (1066.56, 18.83, 478.52), grounded and dry: a 93-unit difference. Whether the original's floor query hits the
  near-vertical record floor (VU0 GetIntersect, vcallms 0x70 at 0x2dd130, unread) and where its body ends are unknown; the
  push's carried speed is unmeasured. Settled by an r0004 respawn capture at MP8 respawn 0/326, filed for the two-client
  session beside run 8 and MP64 181. Pinned by `probeOrigin.test.ts`.
- **PLANT-PROBE: B194's plant sweep under LATER 785** (a plain note, no reading: the name first filed for it,
  MP9_SEAL_BASE_TOP_READING, was retired at the fresh review, 2026-11-09 -- nothing unread is left). The sweep
  (`central/test/bombPlantSweep.parity.test.ts`) walks the room's own mover, whose floor probe is `FUN_005b0840`'s (queued
  by the body tick `FUN_005506a0`, D:L417826); the base mover with the old 5.5 reproduces the old table exactly (a scratch
  comparison). Only walks that start inside an object's footprint changed: the sweep places each 6 out at tent+5, and
  MP9's plant node is inside its SEAL base (103 of 120 targets under `seal_base/tnt_shack_group/healthy/basedi`). From
  inside, the one-sided side walls are never met, so the standing window takes the top: 27 MP9 walks end on basedi's top
  (mat 19, 30.11, 12.28 over the shack floor 17.83; spots 58 -> 36), 2 of MP1's on the comshack stove
  (`alaska4d_stove01`, mat 25, 272.73, 10.26 over the floor; the hand's ground fails the feet test, D:L477005, for 23
  plants) and 3 more of MP1's end airborne, all started inside. A body walking in from outside meets the side walls in the
  port (basedi 13 wall faces, the stove 12, all `isWallSurface`; the fresh review). The open part is the sweep's starts
  inside solids, older than LATER 785: LATER 812. *The outside callers, audited* (source inspection, 2026-11-09; cites
  corrected at the review): the room's spawn (`Walker.place` from the record + 1, `FUN_002b8100` D:L158793) and the
  turret's steer and hold (`FUN_0059afd0` D:L456328+, the height the body's probe left, called from `FUN_005483d0`
  D:L413943-413946) take the height the body's own probe gives -- the probe-take stage `FUN_00550570` (`FUN_005b0800`,
  then `FUN_005b0420` at D:L417771) and the queue in `FUN_005506a0` (`FUN_005b0840`, D:L417826); the climb's settle reads
  `+0x2e4` as the climb tick leaves it, and the copy `+0x2e4 = +0x404` is in `FUN_005af930` (D:L466784), called from
  `FUN_00550ef0` (D:L418169) -- `FUN_00589aa0`'s own range (D:L446582-446648) shows no probe call; that `+0x404` is the
  probe record's hit is the port's earlier reading (research 86 s6.3), not re-read here. The remote tilt is the same pick
  on the remote's body (`REMOTE_PROBE_STANCE_READING`); `floorUnder` (a page instrument) and the drops' settle
  (`DROP_SETTLE_ADAPTATION`) have no original. The only other ground query through `FUN_005b5d40` is the slide's downward
  search `FUN_005b4f30` (D:L469684-469710, from `FUN_0054edf0` D:L417179), which the port stands in for with `move`'s
  snap and does not route through the lift.
  *LATER 812, done 2026-11-10* (`agent/plant-starts`; a test instrument, pending review): the sweep now starts each
  walk where a placed body stays (`displaced`: its ground step's floor pick over 2 above the feet, or moved in still ticks;
  else the next start around the spot). Found on the way: the AI grid is 2D and blind to solid boxes (`locate` FUN_0052dc70,
  `traversable` FUN_0052c5c0 call all 73 basedi and 7 stove starts walkable). Re-pinned at d4d43c097 from the runner's dev-disc run (B194 and the
  LATER 812 case green, 2/2); MP9's 5 starts inside basedi under a top beyond the window stay and are kept (LATER 812's row).
- **`REMOTE_PROBE_STANCE_READING`** (`remotePlayers.ts`, `'drawn'`; PROBE-ORIGIN, review 2): a remote body's tilt pick
  keys the lift on the snapshot's drawn stance, since the stance word does not reach a remote body (`snapshotOf`,
  `net/body.ts` `bodyOf` carry the drawn stance and the Crouched flag only). A remote crouch-runner lifts by 11.48 where
  the local mover takes 10.02; it moves only the drawn tilt's floor normal. Owed: the stance word on the wire.
- **`CROUCH_RUN_PROBE_ROOT_READING`** (`mover.ts`, 10.02; PROBE-ORIGIN fold): the crouch run's root term, the lowest run
  root the origin trace reads (case (a), action 2 frames: 10.02-10.79), under max() with the crouched floor 5.0, so 10.02.
  The run root moves through its frames. Owed: the run clip's `skel_root` y per frame carried to the mover, one tick
  lagged.
- **`PROBE_LIFT_PRONE_READING`** (`mover.ts`, `PRONE_ROOT` 2.168; PROBE-ORIGIN): the prone body's root term, the prone
  stance's root over r0004's prone floor 0, so the prone lift is 2.168 and its window the feet + 3.168. Untraced: the
  origin trace has no prone row. Owed: a prone case of the same r0004 trace (`probe.ts --origin`, a sixth case script).
- **`STANDING_JUMP_PROBE_ROOT_READING`** (`mover.ts`, `'floor'`; PROBE-ORIGIN): the standing jump (`seal_jump`, the feet
  on the floor) lifts by the standing floor, 11.48. The trace reads its clip's root rising over the floor to 15.059 (one
  frame lagged; ORIGIN-TRACE.md case (d)), but the mover carries no clip's root height (`actionRoots` keeps x and z; the
  room has no posed skeleton), and a new animation path in the mover was out of the batch's scope. Owed: `seal_jump`'s
  `skel_root` y per frame (a disc-pinned table) under max(), one tick lagged.
- **`AIR_PROBE_ROOT_READING`** (`mover.ts`, `'stance-root'`; PROBE-ORIGIN, re-worded at the fold of review 1 F3): every
  airborne state but the running jump's launch (a walk-off fall, a dive, the jump after its launch) keeps the stance's
  ground root under max() -- standing under the floor, 11.48; crouched 5.504; prone 2.168 -- though the air clips' own
  roots are not carried; only the launch was traced airborne (case (a)). Owed: a trace of a walk-off fall and a dive
  (`probe.ts --origin`).
- **`PROBE_LIFT_TRANSITION_READING`** (`mover.ts`, `'target'`; PROBE-ORIGIN): a stance transition (`standToCrouch`,
  `crouchToProne`, `standToProne`, either way) lifts by the target stance's value from its first tick (the stance word
  the mover wrote at the press, `stance_`). Owed: the root's own curve (the trace's 5.508-10.863 through stand -> crouch, case (e)) carried
  per frame, one tick lagged.
- **`JUMP_AIM_ROOT_BODIES_READING`** (`net/shotCone.ts`, `'crouched'`; JUMP-AIM-ROOT, 2026-11-11; reading, pending
  review): which bodies' aim frames in the room stand on the posed root (`aimRoot`): a crouched body -- in the jump
  action and, since the fold (the controller's blend-out ruling, 2026-11-11), whenever its posed root stands above the
  crouch root 5.504, so the ease back to the crouch idle after the clip is covered (the capture below). Its reach: the
  crouch walk's root (5.50-9.33 on the fixture disc's clips) and a stance change into the crouch (stand -> crouch from
  11.484) stand on the posed root too, as the page's camera does; a still crouch does not move (the crouch idles pose
  at 5.5039, 5.0313 and 4.7070, never above 5.504; its grid pinned unchanged). The page's start body
  (`WalkMode.startBody`, OT.R80) takes the same rule on its own `Play` animator's root. The standing jump keeps the
  stance's measured root 11.484, which `ROOT_POSE_SLACK_PLACEHOLDER` (4) was sized to cover (`seal_jump`'s
  10.51-15.08), so its verdicts are the base's (pinned by `test/jumpAimRoot.test.ts`'s grids). Owed: the room's root
  slack re-sized against the posed root on every body (the slack is the port's own tolerance; no original).
- **`JUMP_AIM_ROOT_CLOCK_READING`** (match `room.ts`, `'last-tick'`; JUMP-AIM-ROOT): the instant of that root -- the
  room's `HitPoser` as the last tick's `remember` posed it, one tick behind the command (a burst's commands share one);
  the crouched jump's posed root moves at most 0.52 u a tick (the A = B walk). Owed: a capture of the page's eye against
  the room's root through a crouched jump, or the pose stepped per command.

**JUMP-AIM-ROOT (2026-11-11; reading, pending review).** The ghost-bullet report on live v0.4.18 (game 4180, MP6, room
seat 3; agent-mail `evidence/ghost-bullets/`): a crouched, still body pressed jump, and its rounds at ticks 23117,
23126 and 23133 were refused `cone: eye` (the claimed eye 5.2-9.4 u over the room's locus) and 23142 `cone: cone`,
each dropped silently (LATER 876). The original plays `seal_jump` from a crouch with the stance kept (§0) and its
camera reads the posed root (`FUN_0029a950` through `FUN_002869d0`, §0, §2.5); the page's camera rides its animator's
posed root (`play.ts` `setPosedRoot`, `walk.ts`), so the page's eye rose with the clip's root while the room's aim frame
stood on the crouch's measured root 5.504 with `ROOT_POSE_SLACK_PLACEHOLDER`'s 4 u (`net/shotCone.ts` `rigOf`, the
frame's `moveRoot` null outside a traversal move). The room now carries the clip's root at the action's clock, as this
section's "the clip's skel_root y per frame carried to the mover" asks for the probe: not by a table sampled in the
mover but by the root the room already poses -- HIT-POSE's `HitPoser` (research 217 §3.6), the page's own `Animator` on
the room's snapshot of the body, whose root is the clips' blended root by the page's own rule (the cross-fade from the
crouch idle over the jump's `BlendTime`, `FUN_00287620`; `animator.ts`); `HitPoser.rootY`, read by `Room.aimRootOf` for
`Room.aim`'s frame, `startBody` and `orderOrigin`'s fallback (the same body at the same instant). Chosen over sampling
`seal_jump` in the room because the blend would be a second copy of the animator's rule, and the pose costs nothing more
(the poser steps every body each tick already). The eye is bounded as before: the root is the clips' (at most
`seal_jump`'s top, 15.08), plus the same slack, and only while the jump action plays on a crouched body. Unit tests (the
fixture disc's MP2, `MOTION_P.ZAR`, `READERC.ZAR`; match `test/jumpAimRoot.test.ts`, viewer `test/aimRoot.test.ts`): the
four recorded claims fired at the room's commands of the recorded jump clock are refused `eye` at the base and taken at
the head (frame roots 10.603, 11.869, 14.974, 14.275 at 0.350, 0.500, 0.633, 0.750 s; the page copy's 10.629, 12.388,
15.061, 13.797 a tick later); the room's root equals the page copy's posed root of the tick before over 58 jump commands
(difference 0); a claim 12 u over the eye at 15.08 stays `eye`; the standing jump's, the still crouch's and the still
stand's verdict grids are the base's. Still a reading: the two constants above. The jump's end that popped the
recorded body to stand (LATER 873) and the `STANDING_JUMP_PROBE_ROOT_READING` probe lift (which this does not touch:
the mover still carries no clip root) are unchanged.

**JUMP-AIM-ROOT FOLD: the capture of the original (2026-11-11; the root's rise and fall from a crouch and the rounds
mid-clip proven; the rest reading, pending review).** Shadow's capture (PCSX2 r0004, PINE reads, one client offline,
3 trials, identical; the EPH scripts `tools/eph/scripts/ghost-*.txt` on `agent/ghost-bullet` 075c154f4; the
evidence in the gate-runner's `shadow/out/2026-11-11/ghost-bullet/` folder, `probe1/probe.csv`): a SEAL crouched and
still ~1.5 s presses Square once with R1 held. What it shows, **proven** (measured on the original running, compared
value for value below):
- **X while crouched and still plays the Jump clip with the stance kept**: actionId 18 (the crouch idle) -> 178
  (`Jump`) at the first frame after the press, back to 18 at frame 30 (~1.0 s); stanceRequest 1 and posture 1
  throughout; no pop to stand and no get-up clip; the feet never leave the floor (airborne 0, the height unchanged).
  So the end of LATER 873's recorded jump (a pop to stand) is not the original's for a still player.
- **The posed root (actor+0x2e8's node y) rises with `seal_jump`'s root and eases back to the crouch idle's after the
  clip**: 5.504 -> 15.059 (frame 18) -> 11.258 (the clip's end) -> 5.504 (frame 44, ~1.5 s); from frame 9 (~0.33 s)
  the standing jump's capture (10.797 -> 15.059 -> 11.258) reads the same root frame for frame -- the cross-fade from
  the idle over by then.
- **Rounds fire mid-clip**: the taps case (`ghost-crouch-jump-taps.txt`, `probe2/`: R1 pulsed at +300, +600 and +900
  ms after the press, the rise, the peak and the way down) fired three rounds, the magazine 30 -> 27 (shadow's read of
  the case's frames, 3/3); the original refuses no round for the jump.
Not measured: the camera eye itself (cam+0xd8; r0004's camera pointer is not known) and where the rounds land -- the
eye following the posed root stays the reading of §0 and §2.5 (`FUN_0029a950` through `FUN_002869d0`).

**15.08 against the capture's peak.** The summary relayed with the capture gave 14.812 "at ~+600 ms" as the peak; the
probe's per-frame rows give **15.059** at frame 18 in every trial (14.812 is frame 17): the summary's series was
sub-sampled (its reader prints a frame only when the state changes or the clock's ms mod 100 is under 34, which skipped
frame 18). 15.059 against `seal_jump`'s key 12, 15.08 (§0): the frame sampling between keys, not the blend -- frame 18
is the game's frame (18 + 1)/30 = 0.633 s into the clip, key 12 sits at 12 x 0.993/19 = 0.627 s (20 keys over the
clip's 0.993 s, §0), so the frame is 0.006 s on toward key 13's 14.94 (15.08 - 0.14 x 0.006/0.052 = 15.064); the
cross-fade from the crouch idle (`FUN_00287620`'s `BlendTime`) is over by frame 9 (the crouched and standing captures
agree from there). The room's root at the same instant is 15.061.

**The room against the capture** (match `test/jumpAimRoot.test.ts`, the fixture `CAPTURE_CROUCH_JUMP_ROOT`; unit-test
evidence on the fixture disc's clips beside a capture of the original). Capture frame k (trials 2 and 3; trial 1 read
the same curve one frame later) is the game's frame (k + 1)/30 s into the clip (its first frame's playPhase is one
frame of the clip); the room's jump clock reads 1/60 s at the press's tick, so frame k is the room's tick 2k + 2 after
it. The tolerance: the room's root (`Room.aimRootOf`) at frame k's tick within the capture's frames k - 1 .. k + 1
(one capture frame either way: the capture's own timing is known to a frame, trial 1 against 2 and 3) plus 0.01 u (the
probe writes three decimals); the peak within 0.01 of 15.059; the jump's end within two ticks of frame 30's. Nothing is
tuned to it. Sample by sample (the room's at tick 2k + 2):

| frame (ms into the clip) | capture | room | room - capture | frame | capture | room | room - capture | frame | capture | room | room - capture |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 0 (33) | 5.613 | 5.531 | -0.082 | 15 (533) | 13.408 | 13.393 | -0.015 | 30 (1033) | 11.207 | 11.207 | +0.000 |
| 1 (67) | 5.940 | 5.749 | -0.191 | 16 (567) | 14.341 | 14.325 | -0.016 | 31 (1067) | 11.053 | 11.053 | +0.000 |
| 2 (100) | 6.487 | 6.186 | -0.301 | 17 (600) | 14.812 | 14.806 | -0.006 | 32 (1100) | 10.797 | 10.797 | +0.000 |
| 3 (133) | 7.255 | 6.842 | -0.413 | 18 (633) | 15.059 | 15.061 | +0.002 | 33 (1133) | 10.438 | 10.439 | +0.001 |
| 4 (167) | 8.235 | 7.719 | -0.516 | 19 (667) | 14.970 | 14.971 | +0.001 | 34 (1167) | 9.977 | 9.979 | +0.002 |
| 5 (200) | 9.133 | 8.707 | -0.426 | 20 (700) | 14.687 | 14.695 | +0.008 | 35 (1200) | 9.413 | 9.417 | +0.004 |
| 6 (233) | 9.816 | 9.499 | -0.317 | 21 (733) | 14.254 | 14.275 | +0.021 | 36 (1233) | 8.747 | 8.752 | +0.005 |
| 7 (267) | 10.282 | 10.076 | -0.206 | 22 (767) | 13.296 | 13.319 | +0.023 | 37 (1267) | 8.004 | 8.010 | +0.006 |
| 8 (300) | 10.532 | 10.437 | -0.095 | 23 (800) | 12.318 | 12.342 | +0.024 | 38 (1300) | 7.340 | 7.345 | +0.005 |
| 9 (333) | 10.604 | 10.603 | -0.001 | 24 (833) | 11.320 | 11.345 | +0.025 | 39 (1333) | 6.777 | 6.783 | +0.006 |
| 10 (367) | 10.655 | 10.654 | -0.001 | 25 (867) | 11.254 | 11.254 | +0.000 | 40 (1367) | 6.318 | 6.322 | +0.004 |
| 11 (400) | 10.733 | 10.732 | -0.001 | 26 (900) | 11.249 | 11.249 | +0.000 | 41 (1400) | 5.960 | 5.964 | +0.004 |
| 12 (433) | 10.981 | 10.975 | -0.006 | 27 (933) | 11.256 | 11.256 | +0.000 | 42 (1433) | 5.706 | 5.708 | +0.002 |
| 13 (467) | 11.420 | 11.414 | -0.006 | 28 (967) | 11.258 | 11.258 | +0.000 | 43 (1467) | 5.554 | 5.555 | +0.001 |
| 14 (500) | 12.404 | 12.388 | -0.016 | 29 (1000) | 11.258 | 11.258 | +0.000 | 44 (1500) | 5.504 | 5.504 | +0.000 |

Read: the clip (frames 9-24) within 0.025 u; the ease-down after the clip (frames 25-44) within 0.006 u, the room's
animator easing from `seal_jump` to `seal_crouch` as the original does; the cross-fade in from the crouch idle (frames
0-8) **one 60 Hz tick behind** the capture's -- the room's root at tick 2k + 3 is the capture's frame k there (5.613,
5.940, 6.487, 7.253, 8.230, 9.130, 9.815, 10.284, 10.539), the largest gap 0.516 u at frame 4, inside the one-frame
tolerance and under `ROOT_POSE_SLACK_PLACEHOLDER`. Whether the original's cross-fade starts on the press's own frame
(`FUN_0028dc90`'s blend fields written before the frame's pose) or the port's a tick late is not read; owed with the
cross-fade's first frame read there, or a capture at 60 reads a second. The room's jump action ends at tick 60, the
capture's at frame 30 (tick 62).

**The blend-out** (the controller's ruling on the capture): a crouched body's aim frame stands on the posed root
whenever that root stands above the crouch root, not only in the jump action, so the ~0.5 s ease-down after the clip
(5.7 u at its start) is covered (`aimRoot`; `JUMP_AIM_ROOT_BODIES_READING` above, its reach named there). Claims from
the camera at the capture's post-clip roots (frames 30-34: 11.207, 11.053, 10.797, 10.438, 9.977) are taken at the
fold's head (the frame roots 11.207, 11.053, 10.797, 10.439, 9.979); at the first build's (3d34f03572), whose frame
stood on the crouch root once the action ended, the first three are refused `eye` and the last two fall inside the
slack (the seat-box runs jf-3 and jf-5b). The anti-cheat bound is the clips' own root plus the same slack: a claim 12 u over the eye at 15.08 stays
`eye`. A still crouch is unchanged (its idles never pose above 5.504; its grid pinned); a traversal move's root still
wins (its grid pinned at the first build's and the fold's heads). The page's start body (`WalkMode.startBody`, the
start lines `Fire.ray` measures, OT.R80 -- the first build's review, finding 3) now takes the same rule on its own
`Play` animator's root (`setPosedRoot`, the camera's), as the room's `startBody` on its `HitPoser`'s: viewer
`test/walkStartBodyRoot.test.ts`, match `test/jumpAimRoot.test.ts`. Still readings: the eye on the posed root (§0), the
two constants above, the cross-fade's first tick; LATER 873 (the port's pop at the jump's end, now known a defect) and
LATER 874 (the fourth recorded claim's `cone` refusal) stay open.

## 8. The numbers the tests pin

79.9 up, 0.1 s wind-up (two game frames, a 0.785 sink), 12.27 rise and 11.485 top at the 30 Hz game frame (13.58
closed form), landing on frame 22 (0.734 s; the 60 Hz tick 45) -- research 208 §4, PF-03 -- the carried 65, no landing clip with
the stick held and `seal_land_soft` without, 0.4 s lock; the standing jump on the floor 0.993 s, its stick 65 / 37 /
65 / 20; a 42-unit walk-off lands hard, glides 13.5 to a stop and runs on after 0.903 s; the full run `seal_run` at
1.1265; full aside `seal_run_90r` its root at 65; a 0.3 stick aside the slow and fast strafes split, both at 19.5; the
crouch right strafe half a cycle on; the crawl backwards; the one-shots' `playback x ((n-1)/n)^2`; `jump_whoosh` at
0.418 s; the footfalls alternating; the transitions by stance and speed. The second round: the soft landing cut at
once, the hard at 0.35 and the jump at 0.7 of their phases, a transition never; 170.7 / 206.8 / 237.5; a 100-unit fall a
hit by the draw, 130 the death landing and the get-up; the hit's root travel; the lateral-first merge; the step at
0.6 / 0.3 / 0.35 and backwards to the left; the twist 0.2 sin p + 0.8 sin p; the bank 3.1 degrees. The third round:
the turn axis's cut at 0.1; a transition carried key by key, backwards when getting up, the mean without keys; the
six translated parts and the zeroed root; the locomotion roots flat to 1.5 %; the 0.785 sink and the 11.485 top at the
game frame (research 208 §4, PF-03); the
pistol table and its per-node overlay. The fourth round: the look axes (64 / 48 degrees at a full yaw), the fractions, the turn lead
(30 degrees at 2.9 rad/s), the glances (4 s, 0.8 of 0.349 rad, alternating), the gate on the raise weight, the twist
scaled by it; the jump refused through every one-shot; the swap's pick by stance and speed, the standing one cut into
the overlay.

## 9. What a console run would settle

The flight time and top of a flat running jump (22 game frames, 0.734 s; 11.485 over the floor -- research 208 §4,
PF-03); the wind-up's 0.785 sink over two frames; the standing
jump's 0.99 s; the landing clip choice with the stick held; the transitions' holds; the crouch idle's draw.
