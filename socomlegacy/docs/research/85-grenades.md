# 85 — The frag grenade: the hold, the throw, the flight, the fuse and the explosion (2026-09-28)

The grenades workstream (the owner's "if time, grenades can be added"). Everything the viewer's M67 does is read here
from the game: the weapon record on the disc, the throw's code and `.data` in the SOCOM II ELF, the materials table,
the motion clips and the effect scripts. The decompilation is reference only: functions are cited by address and
`socom2_game.elf.decomp.c` line (`decomp :n`), never copied; the `.data` values were read out of
`game/disc/socom2_game.elf` by virtual address; short hex constants are quoted as the instructions load them. Names
in quotes after an address are the SOCOM 1 demo's symbol for the function's twin (`SCUS_972.05`, research 44) or
`recomp/socom2_names.csv`'s. No game run, no PCSX2.

Code: `@s2u/scene`'s `packages/scene/src/projectile.ts` (pure, tested in `test/projectile.test.ts`), the viewer's
`packages/viewer/src/grenade.ts` and `grenadeAssets.ts`, the e2e `packages/viewer/e2e/grenade.spec.ts`.

## 0. The answers

- **The throw's power is the fire button's pressure, not a timer** — but a held digital button is pressure 1, so it
  becomes how long it was held (§2). The player controller's update chases the pressure with the power at 3/s rising,
  1.5/s falling, and throws when the pressure falls under 0.15 of the power. Held 0.25 s: power 0.54; 0.5 s: 0.78;
  1 s: 0.95.
- **The aim pitch picks the clip and lifts the arc** (§3, §4): power under 0.6 with `sin(aim)` under 0.3 is the
  underhand toss; the launch pitch is the aim clamped to 0..55 degrees plus 10..12 degrees by power; the speed runs
  from 5 % to 100 % of `ComputeMaxVel`, the speed that carries a 45-degree throw 600 units standing (300 otherwise).
- **The flight is a point under gravity 98 u/s^2 against the hull** (§5): each frame one segment; the nearest hit
  that is not a penetrable material reflects the velocity about the normal and scales it by the material's
  `ELASTICITY_COEFF` (x0.75 more on the first bounce); slower than 5 u/s after a bounce that turned a fall upward, it
  stops. There is **no rolling and no friction term**: a grenade on the ground skids to rest in ever-smaller hops.
- **The fuse is `Timer1` = 3 s from the release** (the grenade cannot be cooked); `Timer2` = 3.1 s removes it (§6).
- **The explosion** (§7): `Explosion_Damage` 10 in full to half of `Explosion_Radius` 15 m = 150 units, falling
  linearly to 0 at 150. Its picture is the zAnim `frag_grenade`: sparks, a long dust, a light flash (radius 100 -> 190
  over 0.5 s), black smoke with a fireball, a ground dust roll, the sound `.GREN_MED`; the scorch `grenade_mark.tif`.
- **The model** is `WEAP_GEO`'s `grenade` (81 vertices, 82 triangles, `G11b.tif` + `m79.tif`), held on the right
  hand's item node through the throw clip, released from the posed hand (§8).
- **The slots** (§9.1): SOCOM II selects a grenade with R2's inventory, or with L1/L2 (`SwapWeapon1/2`) swapping to the
  slot assigned to them. Every hand grenade -- the M67, the HE, the AN-M8 smoke, the Mark141 flashbang -- bounces
  (§9.2); the smoke screens for 40 s (§9.6), the flashbang whites the screen out by distance and facing (§9.5), the
  claymore is set down and waits (§9.7).
- **The claymore is remote** (§9.7.1): no tripwire, no proximity (only the PMN mine has `ProximityDistance`), no fuse.
  R1 plays `seal_place_claymore`; 1.3 s in it is down under the right hand and the kit's **Detonator** (ID 193) comes
  up; R1 with the Detonator sets off the SEAL's claymores within 500 units. Four down at most.
- **The yellow arc** (§11) is the player controller's draw `FUN_005970b0`: from the fire press to the let-go, with a
  hand grenade, outside the 9x view and the scopes, the throw's own parabola from `GetThrowAnim`'s table point at the
  power of the moment -- 100 steps from 1 s before the hand to twice the fall to the feet, (0.78, 0.78, 0) fading from
  alpha 0.75 to 0.1 ((1, 1, 0.8) in the night vision); no collision, no bounce, no impact marker.
- **The bounce materials** (§9.9) resolve on all 22 maps with the archive's own names; the silent metal and asphalt
  bounces are the game's data (MP2's banks have no `.GREN_METAL`; no bank has `.GREN_ASPHALT`).

## 1. The record: `RUN/ZWEAPON.ZAR/zweapon.rdr`

The M67's `ZWEAPON` record and its `ZAMMO` round (`M67 Ammo`, `ID 11`), and what the weapon loader (decomp
322395-322700; the key strings at 0x3fc9f0.. 0x3fcd00) does with each field. `DAT_003dfe10` is `CWorld::m_scale` =
1 / the map's `MetersPerUnit` (set at decomp 217166) = **10**: the loader multiplies the distance fields by it.

| key | M67 | loaded as | where it lands / what reads it |
|---|---|---|---|
| `ID` | 121 (`0x79`, `'y'`) | the type byte `weapon+0x7c` | `HandleIntersections` sends type `'y'` (and 0x97, 0xac, 0xad, 0xb2, 0xb9, 0xba) to `HandleBounce`, every other type to `HandleImpact` (decomp 320032-320041) |
| `Timer1` | 3 | seconds, absent -> 9999999 (never) | `SetProjectile` puts it at the projectile's `+0x8c` (decomp 0x3cb1a0) |
| `Timer2` | 3.1 | seconds | `+0x90` |
| `Muzzle_Velocity` | 0.1 | x10 = **1** (`weapon+0x44`) | `SetProjectile`: `vel = velscale x this + vel` -- the throw's velocity passes unchanged |
| `Gravity_Acceleration` | absent | **9.8 x10 = 98** (decomp 322410-322415) | `weapon+0x48`; `PreTick` subtracts it from `vel.y` each frame |
| `ImpactRadius` | 45 | x10 = 450 (`+0x4c`) | `HandleImpact`'s alert sphere (times the material's `IMPACT_RADIUS_MOD`); not a bounce term |
| `Effective_Range` | 40 | x10 = 400 (`+0x40`) | -- |
| `Maximum_Range` | 10000 | x10 = 100000 (`+0x3c`) | the projectile's `+0x94`: hits beyond it are ignored |
| `Ammo_Capacity` / `NumMags` | 3 / 1 | | three grenades |
| `Sound_Radius` | 700 | raw | -- |
| `ModelName` | `grenade` | | §8 |
| `FireAnimName` | `frag_start` | zAnim | `CZANIM.ZAR` `frag_start`: the sound `.THROW_OBJECT` |
| `HitAnimName` | `grenade_hit` | zAnim stem | `grenade_hit_<material>`: the bounce sounds (§5.4) |
| `DefaultSpecialAnimName` | `frag_grenade` | zAnim | the explosion (§7) |
| `DecalSet` | `GRENADE_BLAST` | | `decals.rdr` (§7.3) |
| `M67 Ammo` `Explosion_Damage` | 10 | raw (`ammo+0x18`) | §7.1 |
| `M67 Ammo` `Explosion_Radius` | 15 | x10 = **150** (`ammo+0x1c`) | §7.1 |
| `M67 Ammo` `ImpactDamage`, `Piercing` | 0.2, 4 | | not read here |

The record's `Reticule_Modifiers` and `FireWait 0.1` are the rifles' shape carried along; nothing in the throw reads
them. The HE grenade (`HE`, `ID 126`, `Explosion_Radius 10`, `Explosion_Damage 11`, model `HEgrenade`) is not in
`HandleIntersections`' bounce list -- it takes `HandleImpact` [reading: not followed further].

`test/projectile.test.ts` proves `M67` (the transcription) equals `throwableRecord` of the fixture's `ZWEAPON.ZAR`.

## 2. The power: the player controller's update `FUN_00594cf0`

`FUN_00594cf0` is the player controller's per-frame update (research 21 names it the `PlayerUpd` dispatch target);
its float argument is the frame's `dt` (`mov.s $f20, $f12` at 0x594d40). While a throw is held (0x595ea0-0x595f28):

1. `pressure = FUN_002c6350(pad) x DAT_00650660`: the pad's **pressure byte** for the fire button (0..255; 0x2c6350
   reads byte 0x1d or 0x1a of the pad buffer by the controller config) times `1/255` (`0x3b808081`).
2. **The release**: if `pressure <= power x DAT_00650668` (0.15, `0x3e19999a`) the throw goes (`FUN_005dfe30(body,
   1)` at 0x595f34, the weapon state set to fire; the power is kept).
3. Otherwise the power chases the pressure: `rate = pressure <= power ? DAT_006505d8 (1.5) : DAT_006505e0 (3.0)`,
   `f = dt x rate`, `power = power x (1 - f) + pressure x f` (`MULA.S`/`MADD.S` at 0x595f18-0x595f1c), stored at
   the controller's `+0x11c`.

The power starts at 0 (0x596020 zeroes `+0x11c`, as does `FUN_00592d40`). `CZKit_TickExplosives` reads it back
from `body->controller+0x11c` (decomp 477024). The SOCOM 1 demo did it differently -- `GetThrowAverage__9CSealCtrlFv`
(demo 0x2844a0) returns the peak of the last pressure samples over 255 -- so SOCOM II replaced the peak with this lag.

**What it means for a key or a mouse button**: pressure 1 while held, 0 let go. At 60 Hz the power after n frames is
`1 - 0.95^n`: 0.265 at 0.1 s, 0.537 at 0.25 s, 0.785 at 0.5 s, 0.954 at 1 s, 0.998 at 2 s. On a PS2 pad a light
press holds the power low however long it is held.

`THROW_PARAMS`' `abort_threshold` (0.15) is loaded but its reader was not found by offset; the release's 0.15 is the
`.data` constant above, not the dynamics field [reading]. *Found since (OBF-8, §4.1): the release request `FUN_005be9a0` reads it at
D:L475497 -- a power under it is refused and zeroed (D:L475498).* The flag-bit path at 0x595fc0 (the `+0x170` bit 7 case)
zeroes the power and calls `FUN_005dfe30(body, 2)` -- read as the throw's cancel; not modelled.

## 3. The clip: `GetThrowAnim` (0x57fce0; demo `GetThrowAnim__10CZSealBodyFfR8AnimTypeRfRfR6CPnt3D`)

Arguments: the power, the body; out: the animset type, the release fraction, a zeroed float, the hand's point in
the actor frame. The toss test (decomp 441723-441726): `power < dynamics+0x1a4` and `body+0x1450 < dynamics+0x1a8`, i.e.
`toss_power_threshold` and `toss_aim_threshold` (§3.1). `body+0x1450` is the aim's **sine**: `CZKit_TickExplosives`
takes `asinf` of it (`FUN_001b38c8` -> `FUN_001af178`, a fdlibm `asinf`), and a loaded `toss_aim_threshold` passes
through `sinf` (`FUN_001b3720`) at load.

The body's state short `+0x174` selects the row. The types (`DAT_003deb20`..`DAT_003debe8`) are set at run time from
the animset names (decomp 495211-495236), which fixes the states' meaning: **0 stand, 1 crouch, 2 prone, 3 peek**.

| state | condition | animset type | clip (`MOTION_P.ZAR`) | frames | `motion.rdr` playback | release | hand (x right, y up, z behind) | `.data` |
|---|---|---|---|---|---|---|---|---|
| 0 stand | throw | Throw grenade | `seal_throwgrenade` | 28 | 1.6 | 0.46 | (3.3438, 19.3478, 3.9138) | 0x66b310 |
| 0 stand | toss | Toss grenade | `seal_tossgrenade` | 30 | 1.6 | 0.69 | (3.13, 13.8, -10.5) | 0x66b328 |
| 1 crouch | still (speed^2 <= 225) | Crouch throw grenade | `seal_crouch_throwgrenade` | 19 | 1.1 | 0.70 | (6.05, 15.59, 1.96) | 0x66b340 |
| 1 crouch | moving | Throw grenade | `seal_throwgrenade` | 28 | 1.6 | 0.46 | the standing throw's | 0x66b310 |
| 2 prone | throw | Prone throw grenade | `seal_prone_throwgrenade` | 27 | 1.6 | 0.66 | (6.29, 15.05, -0.97) | 0x66b358 |
| 2 prone | toss | Prone toss grenade | `seal_prone_tossgrenade` | 27 | 1.1 | 0.56 | (2.39, 7.87, -8.53) | 0x66b370 |
| 3 peek | right lean | Peek right toss | `seal_toss_rlean` | 35 | 1.25 | 0.55 | (7.8, 10.13, -5.31) | 0x66b388 |
| 3 peek | left lean | Peek left toss | `seal_toss_llean` | 28 | 1.2 | 0.87 | (-8.83, 11.47, -6.48) | 0x66b3a0 |

The crouch's moving test is `|m_velM|^2 <= DAT_00650578` (225, `0x43610000`: 15 u/s). The peek row tests which lean
clip is playing (`FUN_00577e40` with 0x1d/0x1f and 0x1e/0x20). Clips run at 30 frames a second (research 77).

**The release time.** `FUN_005802b0` returns `0 + fraction x clip(+0x10) x FUN_0028ada0(clip)`. The motion
workstream read both factors (research 80, `viewer/src/locomotion.ts`): a one-shot's `+0x10` is `motion.rdr`'s
`playback` (`FUN_00287620`), `FUN_0028ada0` is `(n - 1) / n`, and the phase runs at `1 / (playback (n - 1) / n)` a
second (`FUN_0028c4f0`) -- so the release is the moment the clip's own phase reaches the fraction:
`release x playback x (n - 1) / n`. The standing throw lets go **0.71 s** after the button (0.46 x 1.6 x 27/28), the
toss 1.07 s, the crouched throw 0.73 s; the whole clip plays in `playback ((n - 1) / n)^2` (1.49 s standing).
`motion.rdr`'s `throw_whoosh` callback (the grunt `.MALE_GRUNT`) at phase 0.45 fires one frame before the 0.46.
`NoInterrupt` (0.49 on the throw, 0.75 on the toss) is not modelled.

`FUN_005499e0` is a line-of-sight check from the hand to a second point per row (e.g. (1.155, 13.354, -15.75)
standing) through the hull (`FUN_0031e250`). *Was: "its caller was not traced, so the viewer does not refuse a blocked
throw".* Its caller is the release request `FUN_005be9a0` (D:L475491-475494, asked only when `FUN_0059d830` answers):
a blocked hand is refused and the power zeroed as a short tap is (D:L475497-475498). The port has built that refusal
since PAR-20 D12 (`throwCommit.ts` `throwClear`, `grenade.ts` `startThrow`'s `'clear'`; the query's surfaces
`THROW_CLEARANCE_QUERY_PLACEHOLDER`; OBF-8's review, §4.1).

### 3.1 `THROW_PARAMS`

`CharacterDynamics_Load` (0x59ba80) reads a `THROW_PARAMS` list (key at 0x65ecb0) into the dynamics block at
`+0x198..+0x1a8` (decomp 456874-456884). The shipped `READERC.ZAR/dynamics.rdr` **has no `THROW_PARAMS`**, so the
defaults the static constructor (decomp 328441) sets through `FUN_002ce1a0` stand:

| key (string) | default | bits |
|---|---|---|
| `abort_threshold` (0x65ecc0) | 0.15 | `0x3e19999a` |
| `max_distance_stand` (0x65ecd0) | 600 | `0x44160000` |
| `max_distance_crouch` (0x65ecf0) | 300 | `0x43960000` |
| `toss_power_threshold` (0x65ed10) | 0.6 | `0x3f19999a` |
| `toss_aim_threshold` (0x65ed30) | 0.3 (a sine; loaded values are degrees through `sinf`) | `0x3e99999a` |

The dynamics block is the global at 0x44c250 (`FUN_0058ce60` returns it); `CAMERA_WIGGLE`'s defaults beside it
(`FUN_002ce1e0`: 22, 0.6, 0.1) equal the file's values, which checks the mapping.

## 4. The launch: `CZKit_TickExplosives` (0x5c1970) and `CDynGrenade`

At the release frame (decomp 477024-477130; instructions 0x5c20f8-0x5c22f4):

1. **The hand's point**: `FUN_002869d0(body+0x170, bone, (2, 0, 0), &out, 0)` carries the point (2, 0, 0) in the hand
   bone's frame (`body+0x300`; `+0x2f8` for the left-lean toss) up the skeleton into the actor frame. The yellow arc
   the held throw shows (`FUN_005970b0`, §11 -- not a debug draw: `DAT_003df1b0` is the player's control flag, 1 in
   `.data`) uses `GetThrowAnim`'s table point instead.
2. **The farthest distance**: `max_distance_stand` when the state is 0, `max_distance_crouch` otherwise.
3. **`ComputeMaxVel`** (0x5976e0, demo `ComputeMaxVel__11CDynGrenadeFffPf`): `t = sqrt(2 (h + 1 x d) / 98)`,
   `speed = d / (0.707107 t)` with `h` the hand's height; `DAT_006505b8` = 1, `DAT_006505c0` = 0.707107. It is the
   speed a 45-degree throw needs to land `d` away from `h` up. Standing (hand 19.35): **238.66 u/s**; crouched (15.59):
   167.2.
4. **The pitch**: `asinf(body+0x1450)` clamped to [0, 0.959931] (0x65e630/0x65e638: 0 and 55 degrees, `FUN_00539b70`),
   plus **`ComputeElevOfs`** (0x5976a0): `(12 power + 10 (1 - power))` degrees (`DAT_006505b0` = 12, `DAT_006505a8` = 10).
5. **The power's speed**: `lerp(0.05 max, max, power)` (`FUN_00597630`, the 0.05 is `0x3d4ccccd`).
6. **`ComputeTimeToImpact`** (0x5975d0): the later root of `-49 t^2 + vy t + h = 0` (`FUN_0050de20` with `0xc2440000`,
   `FUN_00575c50` the max), times `vh`: the range over the ground from the hand.
7. **The aimed correction** (`DAT_006505c8` = 1 in `.data`, never written): the target is the range straight ahead of
   the actor's **origin**, `(0, -range)`; the ground-plane direction turns from the hand to it (`FUN_00309110`
   normalise, `FUN_0050df10` puts `sin p` in y and scales x, z by `cos p`); **the speed becomes the hand's distance to
   that target**, `sqrt(range^2 + 2 range z + x^2 + z^2)` (`ADDA.S`/`MADD.S` at 0x5c220c/0x5c221c), clamped to
   [0, max]. (Branch 0, unused: direction `(0, sin p, -cos p)` at the power's speed.)
8. The direction goes through the body node's rotation (`FUN_00597530`), the hand through its matrix
   (`FUN_003085c0`), and `FUN_005c5340` fires the weapon with them; `SetProjectile` (0x3cb1a0) takes the velocity x
   `Muzzle_Velocity` (1).

**Step 7's consequence** (a faithful port, worth confirming on a console): the speed is a distance, so the landing
point matches the power's prediction only when the flight lasts about a second -- at low pitch it nearly does. Some
standing throws, the hand's height 19.35 (`throwVelocity`, `impactRange`):

| held | power | aim | launch pitch | speed | power's range | where it lands |
|---|---|---|---|---|---|---|
| tap | 0.000 | 0 | 10.0 | 12.0 | 7.6 | 7.7 |
| 0.1 s | 0.265 | 0 | 10.5 | 59.0 | 55.0 | 43.4 |
| 0.25 s | 0.537 | 0 | 11.1 | 127.6 | 123.6 | 116.0 |
| 0.5 s | 0.785 | 0 | 11.6 | 213.9 | 209.9 | 252.2 |
| 1 s | 0.954 | 0 | 11.9 | 238.7 | 284.0 | 305.3 |
| 1 s | 0.954 | 30 deg | 41.9 | 238.7 | 549.1 | 598.7 |
| 2 s | 0.998 | 30 deg | 42.0 | 238.7 | 596.5 | 598.8 |

A level full throw lands about 305 units out; aimed 30 degrees up it reaches the 600 of `max_distance_stand`. At
mid power and a high aim the speed reaches the max early (0.25 s held, 30 degrees: 443 units).

### 4.1 The crouch-run quick throw (OBF-8, 2026-10-30)

The report (plan `2026-10-30-overnight-bugfix`, OBF-8; Trello xNAdEL9i, a player's clip of the original on an emulator,
not reachable from this seat): stand throws "~99% close", crouched "~70%"; the crouch-run quick throw -- "crouch, but
running, and then lightly pressing it and releasing quick ... kinda like throwing it behind you as long as you keep
running forward" -- is "missing 1 sec". Status: **reading, pending review**. Source inspection only: the decompilation
(`D:L` of `socom2_game.elf.decomp.c`) and the ELF's bytes at 0x3f64c0, 0x650578, 0x650668, 0x6505d8, 0x6505e0 (read by
virtual address through the program headers, a scratch script); the port's code read; one vitest file run
(`viewer/test/crouchRunThrow.test.ts`). No clip was measured, no game, emulator, recompilation or browser was run.

Each step of the throw, the original against the port:

| step | the original | cite | the port |
|---|---|---|---|
| the power while held | `power = power (1 - f) + pressure f`, `f = dt x` 3 rising / 1.5 falling; the release when `pressure <= 0.15 power` | `FUN_00594cf0` D:L453481-453541; ELF 0x6505e0 = 3.0, 0x6505d8 = 1.5, 0x650668 = 0.15 | `stepThrowPower`: agrees |
| the tap | the release request refuses, and zeroes the power, when the power is under `abort_threshold` (dynamics `+0x198`, 0.15) **or** the hand's clearance fails (`cVar4`, `FUN_005499e0`'s line from the hand, run only when `FUN_0059d830` answers, D:L475491-475494): nothing is pushed or spent. *This is the reader §2 did not find by offset.* A digital tap of three 60 Hz frames (0.143) is refused, four (0.185) throws | `FUN_005be9a0` D:L475490-475498 | both tests: `releasePowerClears` and `throwClear` (`grenade.ts` `startThrow`, refused `'power'` / `'clear'`), the clearance's world query under `THROW_CLEARANCE_QUERY_PLACEHOLDER`: agrees. *Was: "`releasePowerClears`: agrees" -- the clearance half was left out (OBF-8's review)* |
| the clip, crouched | state 1 reads the body's velocity `+0x2c..+0x34` squared against 225 (ELF 0x650578): moving, the standing `Throw grenade` (fraction 0.46, the standing table point) whatever the power -- no toss crouched | `FUN_0057fce0` D:L441827-441843 | `throwAnim` (`CROUCH_MOVING_SPEED_SQ`): agrees; the port reads the ground's two axes, `vy` 0 on the floor (research 251 §12.6). *Was wrong at its caller (OBF-23, §4.2): the port handed it the drawn posture, 'stand' through the crouch-run, so a tap tossed* |
| the hand opens | the kit's timer `fraction x playback x (n - 1) / n` = **0.710 s** (the crouched still throw's 0.729 s: 0.020 s apart), counted down by the frame's dt | `FUN_005802b0` D:L441904; `FUN_005c1970` D:L476883-476886 | `releaseSeconds`: agrees. *Was wrong at its input (OBF-23, §4.2): the port's clip was the standing toss, its hand at 1.067 s* |
| the body | the throw on the stack, its root one key: the SEAL stops; the held stick cuts it at `NoInterrupt` 0.49 (the 48th command, 0.80 s), the run resuming at its kept phase | research 251 §12.5, §12.6, §12.9 | the hold and `holdCut` (PAR-70, PAR-85): agrees. *Was wrong at its input (OBF-23, §4.2): the toss's hold, cut at 0.75, the stop 0.36 s longer* |
| the reach | `max_distance_crouch` 300, the state being 1 at the hand-open | `FUN_005c1970` D:L477069-477075 | `maxThrowDistance(releaseStance)`: agrees. *Was wrong (OBF-23, §4.2): `releaseStance` read the posture, the standing 600* |
| the run's velocity | **not carried**: the hand-open fires with the vector at 0x3f64c0 (D:L477133), whose 12 bytes are zero in the ELF; `SetProjectile` adds that vector to `Muzzle_Velocity x dir` (`FUN_003cb1a0` D:L320727-320731), passed through `FUN_003d2d70` D:L325643 (its seventh argument from the caller's sixth); the call is the weapon's vtable slot `+0xc` (D:L479493, D:L479502), and the ELF's word at 0x4083bc and at 0x4083ec -- slot `+0xc` of the vtables at 0x4083b0 and 0x4083e0, which the constructors store at D:L316989, D:L317878 and D:L326109, D:L326200 -- is 0x003d2d70. *Was: "one step of inference" (OBF-8's review)* | as cited | `launchOf` adds nothing: agrees |
| the room's windows (online; no original: the game has no server) | -- | `match/src/room.ts` | checked: `THROW_START_WINDOW_S` (:1107, the pistol toss's 1.334 s) bounds only the death drop's look-back (:7607), and the rate and tail tests (:6682-6684) drop a request; none delays a throw or its hand |

**So the second is not traced to the source**: no step of the throw differs, and the clip switch is 0.020 s. *Corrected
by §4.2 (OBF-23): the port's throw read the drawn posture, so its crouch-run tap was the standing toss -- the clip, the
hand-open, the hold and the reach all differed; 0.357 s of the second is that.* What the
player's "behind you" describes the read also gives -- a low-power throw lands a few tens of units ahead of the stopped
SEAL, with none of the run in it, and the stick resumes the run 0.09 s after the hand opens. The second is named,
`CROUCH_RUN_QUICK_THROW_READING` (`@s2u/scene` `projectile.ts`: the clip, the 0.710 s, the 300, no thrower velocity,
and the reported second, applied nowhere), pinned by `viewer/test/crouchRunThrow.test.ts`. Not read here: a light
press's pressure byte on the emulator's pad (`FUN_002c6350`) against the browser's digital 1 -- a lighter press holds
the power lower, never later; the crouch-run's speed (OBF.R7: out of this sprint). Settles: the clip measured frame
by frame (the press, the let-go, the hand opening, the landing, the SEAL's travel) beside the port on the same input.

**Prone, checked the same way** (no report: "prone untested"): state 2 reads the power and the aim, never the speed --
the toss (`Prone toss grenade`, fraction 0.56, release 0.593 s) under power 0.6 at an aim's sine under 0.3, else the
throw (`Prone throw grenade`, 0.66, 1.017 s), the reach 300 (`FUN_0057fce0` D:L441797-441825; D:L477069-477075). The
port's `throwAnim` and `releaseSeconds` agree; pinned in the same file.

### 4.2 The crouch-run tap's throw: the state, not the posture (OBF-23, 2026-10-30)

The report (the owner, 2026-10-30, seat 0b): "in the original client, it seemed to do a short overhand grenade. in ours
we do a short lob and stop" -- "a running crouch quick nade". Status: **reading, pending review**. Source inspection
(`socom2_game.elf.decomp.c`) and one vitest file (`viewer/test/crouchRunThrow.test.ts`); no game, emulator or browser
was run.

- **The crouch-run is the crouched state.** The body's ground state switches on `actor+0x174` (`FUN_005870e0`
  D:L445162-445168: 1 runs `FUN_00584c60`). There a stick past 12.4 / 14.8 (`153.76 <= |s|^2 x 219.04`, D:L444145),
  with the headroom, sets `+0x21c` bit 2 and pushes the standing run's motion (type 2) with the stance argument
  `+0x174` itself (D:L444172-444192, `FUN_00588bc0(.., 2, +0x174, ..)`, then `FUN_00583030`, the standing blend); no
  write to `+0x174` in the branch. The state stays 1; only the body runs.
- **Every throw read takes that state.** `GetThrowAnim` switches on `+0x174` (`FUN_0057fce0` D:L441773): 1 and moving
  past 15 u/s, the standing `Throw grenade` (fraction 0.46, the standing table point), never the toss
  (D:L441827-441843); the release request's clearance takes the crouched end (`FUN_005499e0` D:L414024-414034); the
  hand-open's reach is `max_distance_crouch` (`FUN_005c1970` D:L477069-477075).
- **The port read the posture.** The snapshot's `stance` is `Walker.posture` (`mover.ts` `moverSnapshot`), which is
  'stand' through the crouch-run (`locomote`: "headroom: stands and runs the standing blend"); the throw took it for
  the state, so a tap (power under 0.6, a level aim) was the standing **toss** -- `Toss grenade`, the underhand lob,
  the hand at 0.69 x 1.6 x 29/30 = 1.067 s, the stick's cut at `NoInterrupt` 0.75 -- from the standing reach 600, and
  the clearance asked the toss's end. The original: the overhand `Throw grenade`, the hand at 0.710 s, the cut at 0.49,
  the reach 300. That is the owner's "lob" against "overhand", and his "stop": the throw holds the SEAL in both (§4.1,
  research 251 §12.5), the toss 0.36 s longer. It is also 0.357 s of OBF-8's "missing 1 sec" (§4.1, which took the
  port's clip as agreeing: it was the caller that differed).
- **The fix** (every throwable: the choice is the body's, not the item's): the snapshot carries the state where it
  differs from the posture (`PlaySnapshot.stanceState`, present only then), and the throw reads it (`throwCommit.ts`
  `releaseStance`, `grenade.ts` `GrenadeThrower.stance`): the clip, the clearance, the arc and the reach. The room's
  launch check (`room.ts` `throwLaunchAllowed`) allows a standing posture both reaches already; the drawn body, the
  room's posture and the wire are unchanged. Pinned by `viewer/test/crouchRunThrow.test.ts` (OBF-23: a crouch-run
  Walker's snapshot, its clearance, and a six-frame tap for the M67, HE, AN-M8 and Mark141).
- **Not settled here:** whether the rest of OBF-8's second is elsewhere (the reading `CROUCH_RUN_QUICK_THROW_READING`
  stands); the original's crouch-run speed against the port's (OBF.R7). Settles both: the emulator harness (EPH) on
  the same input -- crouch, stick full forward, a six-frame tap -- sampling `+0x174`, the pushed type at the request,
  the kit's timer and the grenade's first position.

## 5. The flight: `CZProjectile`

The projectile methods, matched by order and shape to the demo's `CZProjectile` (demo 0x318230-0x319ff0):
`HandleImpact` 0x3c8920, `HandleBounce` 0x3c8f50, `HandleTimers` 0x3c99a0, `HandleIntersections` 0x3c9b70,
`PostTick` 0x3c9fb0 (names.csv), `PreTick` 0x3ca5a0, `SetProjectile` 0x3cb1a0. Fields: `+0x48` the frame's start,
`+0x54` its end, `+0x60` the velocity, `+8` the grenade state, `+10` the projectile state (reCOM's
`PROJECTILE_STATE`: 1 flying, 2 at rest, 3 to be detonated ...), `+0xb` the resting flag, `+4` bit 1 "first bounce".

### 5.1 A frame

1. **`PreTick`** (flying states 1 and 6, a normal shot type): `vel.y -= gravity x dt`; start = the last end; end =
   start + `vel x dt` (`FUN_00309180` scale, `FUN_00309240` add): symplectic Euler. The segment is registered as the
   projectile's intersection query (`FUN_0031dd90`). At rest (state 2) nothing moves.
2. **`PostTick`**: both timers lose `dt`; then `HandleIntersections`.
3. **`HandleIntersections`**: over the query's hits nearest first, beyond the last one handled; a hit on a material
   with PENETRATION exactly 1 is passed over (`fVar15 != 1.0`). The M67's type goes to `HandleBounce`; its answer 1
   ends the frame there, 2 (passed through) searches on; no hit, `FUN_003c9530` takes the segment's end.
4. **`HandleTimers`**: `Timer1 <= 0` sets state 3 (to be detonated, grenade state 2); then `Timer2 <= 0` removal.

Online, a copy started late is flown these frames, not moved along its arc: the room's late hand throw (§6.1, 2.) and,
since LATER 643, every page's copy of another's throw started at the room's age (§6.1, 4.; `GrenadeThrower.startAged`,
one `stepLive` a frame, the step `fly` takes).

### 5.2 The bounce (`HandleBounce` 0x3c8f50)

The material is the table's entry for the polygon's byte (`FUN_002dc1d0`, §5.3). If it is **not LIQUID and its
PENETRATION is under 0.99**:

- `r = v - 2 (v.n) n` (`FUN_00308ef0`, the normal from the intersect record; zero if already resting);
- `v = r x ELASTICITY_COEFF`, and **x 0.75 more on the first bounce** (flag bit 1 of `+4`, set by `SetProjectile`,
  cleared here);
- faster than 10 after it (`10.0 < fVar15`) and not UNDERWATER: the material's hit zAnim plays at the point
  (`FUN_003d22e0` then `FUN_00272bb0`);
- slower than **5** and not already at rest: on PERSON (`DAT_003e14f8`, looked up by name) the damping is undone;
  otherwise, **if the fall was downward before and the new velocity is upward, it stops**: `v = 0`, state 2, `+0xb = 1`;
- the new position is the hit point plus the unit normal x **0.1** (`0x3dcccccd`).

Otherwise (LIQUID, or PENETRATION >= 0.99): `v x= ELASTICITY_COEFF`, and the position is the point plus `v x 0.0001`
(`0x38d1b717`); the search continues along the segment.

No other term touches the velocity: **there is no friction and no rolling**. A grenade on flat ground loses
`1 - e` of its speed at every hop; the hops shorten until one ends under 5 going up. The viewer's normal comes from
the hull polygon, either side; it is turned to face the grenade [reading: the engine's intersect record's normal].

### 5.3 The materials

The table (`DAT_0044f358`, `DAT_0044f354` entries) is built by `FUN_002dde40` from `READERC.ZAR/materials.rdr`'s
`SOILS`: first `FUN_002de4b0` adds **`UNKNOWN`** (ELASTICITY 0.3) and **`PARTICLE_SYSTEM`** (PENETRATION 1,
VOLUMETRIC), then the 44 SOILS in file order -- so a polygon's material byte `i >= 2` is SOILS entry `i - 2`. The fields
(decomp 181349-181420): `+0x20` OPACITY, `+0x24` PENETRATION, `+0x28` RICOCHET, `+0x2c` ELASTICITY_COEFF, `+0x30`
IMPACT_RADIUS_MOD, `+0x34` STEALTH_FACTOR, `+0x38` FOOT_STEP_OFFSET, `+0x3c` bit 0 VOLUMETRIC, bit 1 LIQUID, bit 2
UNDERWATER; the constructor `FUN_002deb30` defaults PENETRATION and ELASTICITY to 0. **Byte 0** is the map's
default (`DAT_0044f310`, set by `FUN_002ddc30` from a name looked up by `FUN_002de9e0`): the world root's
`DefaultMaterial` (`MP*.ZED`, decomp 217160; `METAL_THICK` on Frostfire). The hull's bytes bear it out: Frostfire's
3,318 polygons are 936 byte 0, 1,357 byte 25 (METAL_THICK), 326 byte 7 (STONE), 242 byte 3 (INVISIBLE_DI)...;
Crossroads' 22 is ASPHALT (1,262) and 19 WOOD_THICK.

What a grenade does on each (ELASTICITY / PENETRATION): STONE, METAL_THICK, PLASTER, CARPET, BARREL 0.5; ASPHALT
0.45; DIRT, WOOD 0.3; GRASS 0.2; SAND, MUD 0.1; SNOW, ICE, GRAVEL, LEAVES 0.15; GLASS_THICK, GLASS_OPAQUE 0.8.
Through it goes only WATER (LIQUID, x0.25) and GLASS (PENETRATION 0.99, x0.8); everything under 0.99 bounces, even
GLASS_MEDIUM (0.985), CAMO_NET and CHAINLINK_FENCE (0.98) and METAL_RAILING (0.95); and it never sees the PENETRATION-1
ones (ACTION, INVISIBLE_DI, ITEM, the `*_VOL` vegetation, PARTICLE_SYSTEM). `SOILS` in `projectile.ts` is tested equal to the file's.

### 5.4 The bounce sounds

`CZANIM.ZAR` holds `grenade_hit_<material>` per surface, each one sound: `.GREN_STONE`, `.GREN_SAND`, `.GREN_DIRT`,
`.GREN_GRAVEL`, `.GREN_GRASS`, `.GREN_ICE`, `.GREN_SNOW` (plus effects), `.GREN_TIN` (metal thin), `.GREN_METAL`
(thick, grate), `.GREN_WOOD`, `.GREN_LEAVES`, `.GREN_WATER` (a ripple, spray), `.GREN_CARPET`, `.GREN_ASPHALT`,
`.GREN_PLASTER` (a puff), `.GREN_GRATING`; person, fabric, leather, barrel, rubber borrow bullet sounds. The event
`bounce` carries `anim: grenade_hit_<material>` and `sound` (faster than 10).

## 6. The fuse

`Timer1` 3 s is set at `SetProjectile` -- **the release** -- and counted down in `PostTick`; `HandleTimers`
detonates at 0 wherever the grenade is, in the air or at rest. There is no cooking: the hold only builds power.
`Timer2` 3.1 s removes it. (reCOM's `CZProjectile` layout agrees: `m_time`, `m_removaltime`,
`zWeapon/zweapon.h:588-660`.)

### 6.1 Online: the room's fuse on the bodies' clock (HOTFIX grenade fuse, 2026-11-02)

*Reading, pending review* (the original's clock is a source read; the room's two constants are network adaptations,
no original). The owner's report online: a player's own M67 bursts on his page, he walks toward it, and the room kills
him about a second **after** the blast he saw. The original has one clock: the projectile tick (`FUN_003c9fb0`, §5.1)
and the bodies run on the same frame's dt, and the blast is judged at the detonation's frame against the bodies as
they stand then (`FUN_005a0e70` D:L459070; the reach D:L459207-459227). The page keeps that: it flies and bursts its
own copy on its wall time (`GrenadeThrower.fly`, release + `Timer1`). The room did not:

- its bodies are credited a stall's wall time (`Room.creditStep`, LOW-12, research 223 §2.2: counted once, at the
  stall's first step), but its flight took one tick a step (`flyGrenades`: `advance(1 / TICK_HZ)`), so a step the server
  loop dropped (`MatchServer.loop` drops a stall past five periods) or a loop slower than 60 steps a second left the fuse
  behind the bodies for good -- 1 s after a 1 s stall;
- a throw that reached it late (its line held) was flown from the room's decision, not from the page's release; the
  rounds and locks are dated back by their command's lateness (`eventClock`), the throw's flight was not.

The room now (`packages/match/src/room.ts`):

1. **Both the fuse and the flight keep wall time.** `flyGrenades` advances the game-frame accumulator by the step's
   credit (`creditStep / TICK_HZ`), not a tick; every projectile it steps -- the hand throws, the launched rounds and
   rockets, the charges (C4's `Timer1`, the claymore's and PMN's held fuses, their proximity), the backblast. Not the
   fuse alone: `PostTick` counts the timers by the dt the flight steps by (§5.1), and the page flies both on its wall
   time, so a fuse ahead of a lagging flight would go off where no page's grenade is. The stall is counted once: the
   steps after a stall's first in one loop callback carry no credit and fly nothing. At most
   `ROOM_FLIGHT_MAX_FRAMES_ADAPTATION` (300 frames: the queue's 10 s, `QUEUE_MAX`) a step.
2. **A late hand throw is flown its own age.** `throwGrenade` counts the throw's age as `eventClock` dates an event --
   the room's clock less its command's count (`ShotFrame.count`) and the line's best offset (`Player.lagFloor`) -- and
   its first `flyGrenades` flies it that age before the step's frames (`Flying.late`), so its fuse runs from the
   release. The part dated back past the room's own credit is at most `THROW_DATE_BACK_TICKS_ADAPTATION` (60 ticks, the
   second the bodies' credit runs at once, `CREDIT_MAX`; above `FIRE_STALL_CREDIT_TICKS`' 21, which a 1 s hold needs and
   which is not raised). A throw decided between steps is flown its age (at most the cap), then the step's credit. A
   throw decided **inside** a step (its command run in the step's burst: `Room.creditOpen`, from the credit to
   `flyGrenades`) already has the step's credit in its age (the review's F1, 2026-11-02: it was flown its age and the
   stall again, 1 s early after a 1 s stall): it is flown the part of its age past the credit (at most the cap), then the
   step's frames; or, its age under the credit by a tick or more (a throw late in a stall's burst), its age's frames
   alone and none of the step's. The age is floored at a tick, so in a healthy room a throw takes the step's frames as
   before the hotfix. The date-back alone never reaches the shortest hand fuse (the Mark141's 1.5 s); a throw still
   goes off at its first flight when the room's own stall around its arrival covers its fuse -- at its true age, as the
   page's did.

   **The owner's ruling** (2026-11-02, Craig's own word in the controller seat ef, the review's F2): 60. It was given
   accepting that a page holding its line could fly its grenade up to 1 s early while the other pages saw a full fuse
   (cooking; the original has none) until the throw's age was on the wire; since LATER 643 (4., below) the others'
   pages see the shortened fuse too, so that vector -- the thrower's grenade early against the others' full fuse -- is
   closed, and the owner's 60 stays as ruled. What the 60 is still judged against (LATER 643's review, F2): a held
   line still makes the others' copy appear up to 1 s into its flight, mid-arc, with up to 1 s less of its fuse to see.
   Not new -- the room's blast already reached them that early -- but it is the cost that remains.
3. **Every projectile the room creates is flown its own age** (the re-review's gap, Codex, 2026-11-02: a rocket fired
   on the last command of a 1 s stall's burst was flown the step's whole second, including time before it left). Every
   creation site stamps its projectile through one helper (`Room.born`), its age the command it left on
   (`Room.commandAge`: the room's clock less that command's count and the line's best offset, signed -- a launched
   round decided at its arrival may name a command still to run, its age then less than none) and whether it was made
   inside a step's credit (`creditOpen`); `flyGrenades` flies it as item 2 flies the throw, but only the hand throw is
   dated back past the step's credit (`born`'s `dateBack`, the owner's ruling's trust): any other is flown its own age
   where that falls inside the step's credit and the step's frames otherwise -- never further on than before the
   hotfix (`roomBarriers.test.ts`' C4, planted on a command run half a second before, keeps its 6 s). The sites: the hand throw
   (`throwGrenade`); the launched round (`launchRound`, the M203's and the MGL's, decided at its arrival); the rocket
   (`launchRocket`, decided at its command) and its backblast (the rocket's command and age); the turret's launched round
   (`turretLaunch`, the MGL FRAG TURRET's, at its round's command); a charge set down (`placeCharge`: C4 at its command,
   its `Timer1` counted on the flight's frames; the claymore and the PMN at their arrival, the PMN's arming on its fuse);
   and a death's dropped grenade (`deathDrop`), which leaves on no command of its own -- age 0, flown from the step it
   was made in (inside a stall's burst, none of that step's earlier credit); one made while another projectile is
   flown its own age (that projectile's kill, Codex P2 on PR #646) is flown beside it the own frames after its birth,
   then as that projectile is -- not the step's whole credit, time before the death. The Detonator and a chain make no
   projectile (they set `trigger` on one at rest). A healthy room is unchanged: a trace of each kind made in a step and
   between steps (an M67, a LAW HEAT, an M203 FRAG named on a command run and on one still to run, C4), hashed position,
   state and fuse a tick for 3-4 s, matches the base (`main` c15928e75) hash for hash.
4. **The release instant on the wire** (LATER 643, 2026-11-02; *reading, pending review*). The room judges a throw at
   its command's frame (`p.cone.frame(seq)`; a throw whose frame is gone is refused 'no frame'), so the page's `throw`
   `seq` already names the release tick: no new field on the throw. The room's `grenade` event (the others' pages; the
   thrower is skipped) gains `age` (additive, `PROTOCOL_VERSION` kept): the throw's age at its decision on the room's
   clock, whole ticks, as the room flies it (`Room.throwAge`, from `dateBack` and `dateBackFrames`, the rule
   `flyGrenades` flies by) -- decided between steps, the date-back alone (the next step's credit is time still to
   come); inside a step, the date-back and that step's credit, or its age alone (`alone`). It is made from the room's
   frame count (`round(frames x TICK_HZ x GAME_FRAME_DT)`), so the page's `round(age / TICK_HZ / GAME_FRAME_DT)` is that
   count exactly (the review's F1: rounding the fractional age to ticks first left the page a frame behind for an age in
   (2k + 1.03, 2k + 1.5) ticks); exact between steps and when flown alone, within a frame inside a step not alone (the
   step's own accumulator can give a frame more or less than its credit rounds to). At most 300 frames
   (`ROOM_FLIGHT_MAX_FRAMES_ADAPTATION`; the review's F3: only past a stall of about 9.5 s can the room fly more, when
   every hand fuse has burst). Absent under a game frame (a healthy throw: a tick's credit), so a healthy room's event
   is as before. Every page starts its copy `age` ticks into its flight (`GrenadeThrower.launchRemote`'s `ageTicks`,
   `startAged`): `round(age / TICK_HZ / GAME_FRAME_DT)` game frames, each the step `fly` takes on the hull
   (`stepLive`: a bounce, a rest, a burst; a PMN's trip), at most `REMOTE_AGE_MAX_FRAMES_ADAPTATION` (the room's own
   300); the page's frame clock is not moved.
   A bounce or a burst on the way is handled as in flight, heard at the copy's start. An older page ignores `age` and
   starts its copy at the event. The thrower's own page is unchanged: it flies its copy from its own release (the
   broadcast skips it). So the room and every page share one release instant; what is left between their blasts is
   each page's line latency (the event's one-way trip, and the thrower's line to the room), filed below.

Held by `packages/central/test/roomGrenadeFuse.test.ts`: a 1 s stall of the room mid-fuse, and a throw whose line held
it 1 s -- the room's blast 3.017 s after the release in both (was 4.000 s and 4.017 s), B walking at it 180 units out
and unhurt (he was inside and hurt); and a throw named on the first and on the last command of a 250, 500 and 1000 ms
stall's step -- 3.000 s after the release (2.983 s on the last command at 500 and 1000 ms), where the hotfix's first
head flew it 2.767 / 2.767, 2.533 / 2.517 and 2.033 / 2.017 s and the base 3.233 / 3.000, 3.483 / 3.000 and
3.983 / 3.000 s (the review's probe); and a LAW HEAT fired on the first and on the last command of a 1 s stall's step,
an M203 FRAG launched and a C4 planted on its last -- each its own age after that step (0.983 s and about none), the
rocket and the round still at the muzzle, where the three on the last command had flown 0.968 s before item 3; and a
LAW HEAT fired 0.4 s before a 1 s stall step's end killing a thrower mid-throw inside that age -- his dropped M67 flown
only since the death, where before it had flown 0.968 s. LATER 643's cases in the same file: a healthy throw's event carries no `age`; a
throw whose line held it 0.5 s carries about 30, 1.5 s the cap's 60; one named on a 500 ms stall step's first command
about 30, on its last none, on a 1000 ms step's first about 60; and (the review's F1) the page's copy at the room's
own frame count, no tolerance, for a line held 0.5 and 1.5 s, the stall cases, and fractional ages (3.2, 12.6, 29.17,
41.4, 59.3 ticks between steps; 3.2, 29.17, 41.4, 57.3 inside a 1000 ms stall's step, flown alone);
`REMOTE_AGE_MAX_FRAMES_ADAPTATION` pinned to `ROOM_FLIGHT_MAX_FRAMES_ADAPTATION`. The page's half:
`packages/viewer/test/grenade.test.ts` 'LATER 643' (a copy told 30 stands where the flight is 15 game frames on, two
bounces off the floor on the way; it bursts 15 game frames (29-31 page frames at 60 Hz) sooner than one told none, at
the same point), `netPageRound.test.ts` (the event's `age` reaches `remoteGrenade`, a malformed one is none). What it
leaves:

- (LATER 643's half 2, filed as LATER 648) every page still bursts its copy on its own fuse: the thrower's at its
  release + `Timer1`, ahead of a room that runs behind by its line's latency, and the others' by the `grenade` event's
  one-way trip after the room's; the page does not hold its burst for the room's blast as it holds C4's
  (`C4_SERVER_DETONATE_GRACE_S_ADAPTATION`);
- the review's F3: for a room stall between 1 and 10 s the flight runs the whole stall in one step while the bodies are
  credited at most `CREDIT_MAX` (60) commands and the catch-up a step, so a blast in that step is judged against bodies
  up to the stall less 1 s behind their pages; and the proximity's `origins` (the living bodies' feet, `flyGrenades`)
  are taken once a step and stay fixed across its catch-up frames;
- a launched round, a rocket or a charge set down that reaches the room late (its line held) is not dated back past
  its step's credit (item 3): it runs late by its line's hold, as before the hotfix (the page's `ageTicks` would start a
  launched round's copy too, but the room tells none); the doors, gates, cranes, the world's step, the bomb and the
  round's clock still step a tick a step (LATER 643, left open for these).

## 7. The explosion

### 7.1 The damage (`CZProjectile::GetDamage`, 0x3c7600, decomp 318700-318760)

For an exploded projectile (states 5, 6): `damage = ammo+0x18 (Explosion_Damage) + weapon+0x64`; `r = distance /
ammo+0x1c (Explosion_Radius)`; `r > 1` -> 0; `r > 0.5` -> `damage x (1 - (r - 0.5) x 2)`; else full. For the M67:
10 out to 75 units, 5 at 112.5, 0 at 150. (`weapon+0x64` is a key not in the M67's record; 0.) The query is a sphere
of the explosion radius registered at the point in `PreTick` state 3 (`FUN_0031dc90` with `FUN_003d4500(ammo)`).
The page's own `explode` event carries the damage at the player's feet for its looks; the damage itself is the room's
(the match server's, and offline the same room in the page): section 12.

### 7.2 The picture: the zAnim `frag_grenade` (`RUN/CZANIM.ZAR`, the set `common`)

`frag_grenade` calls `FRAG_sparks`, `dust_explode_long`, `light_flash_large`, `bsmoke_explode_large`,
`dust_ground_roll` and plays `.GREN_MED`. Per material there are `frag_grenade_<material>` variants (stone: a flash
and `firepuffStone` with `explosion2.tif`; dirt, grass: dirt thrown up; snow: snow puffs; underwater: `.EXP_WTR` and a
water column), most calling `frag_grenade` or `frag_grenade_stone`.

The particle emitters are set-0 command 0x27 (~300 bytes each), **not decoded field by field**. Read from the floats
that stand out (the viewer's `EXPLOSION_READING`, labelled a reading):

| part | bitmaps (`ALPH_TXR.ZED`) | velocity x / y / z | size | life | grey |
|---|---|---|---|---|---|
| `light_flash_large` (command 0x32) | -- | -- | radius 100 -> 190 | 0.5 s | (214.2, 242.25, 216.75), 64 |
| `bsmoke_explode_large` fire | `explosion2.tif` | +-70 / 0..240 / +-70 | 8-10 | -- | -- |
| its `GreyDustCloudUp`, `BlackDustCloudUp` | `effect_dustpuff01.tif` | -40..40 / 50..100 | 10-12 | 6.5-7.5, 9.5-10.5 | 0.5 -> 0.2 |
| `dust_explode_long` | `effect_dustcloud.tif` | +-15 | 5-10 | 6.5-9.5 | 0.6 |
| `FRAG_sparks` `spark_streak` | `effect_spark01.tif` | +-200 / 110..180 / +-200, pulled by (-560, -1000, -560) | 0.5-0.8 | 0.63-0.65 | -- |
| `dust_ground_roll` `DustRoll` | `cloudpuff01.tif` | +-140 along the ground | 12-15 | 2.6-3.0 | 0.4 |

The flash is a light in the game; the world's materials take no three.js light, so the viewer draws a glow a fifth
of the radius across instead [placeholder].

### 7.3 The scorch: `decals.rdr` `GRENADE_BLAST`

`grenade_mark.tif` (`EFFE_TXR.ZED`) per material, `MIN_SIZE`-`MAX_SIZE` across: SAND 30-50; DIRT, STONE 20.2-30.9;
SNOW, METAL_THICK, METAL_THIN, WOOD_THICK 10.2-20.9; WOOD_THIN, ASPHALT 10.2-16; GLASS 10-13. The viewer lays one
under a grenade that went off at rest (STONE's size for an unlisted material). Its colour: a `FUN_003139e0` decal like a bullet mark (`FUN_003d0ba0`, the permanent pool), so the GS
modulates its texel by the vertex colour of the world triangles under it (research 89 §13, `FUN_003b3ab0` /
`FUN_003beca0`). The viewer draws it with the marks' material (`markMaterial`: texel x vertex colour, brightened) and
paints its corners with `surfaceShade`'s colour straight down under the blast (the 4.8-unit window), asking again each
frame while the ground there is not drawn yet (`GrenadeThrower.setShade`, `stats().scorchShade`).

**The placement (traced 2026-09-29).** `FUN_003c7af0` (decomp 318876, the explosion's damage query, when
`Explosion_Radius` > 0) probes a vertical column at the blast's x and z, `FUN_0031df50(10.0, world, pos)` (a type-2
`DiIntersect`, research 23 §1.3), and `FUN_002d4c20` takes the **highest** candidate whose y is no more than **10**
over the blast's (no floor below). That candidate record -- `point, t, normal, node` -- is `FUN_003d0ba0`'s `param_3`:
the decal set by the candidate surface's material (`FUN_002dc1d0`, the record's `+0xc0` table), the square centred on
the candidate's point, framed along its normal negated (323891, `FUN_00307810`), the node its walk. So the scorch lies
flat on the ground under the blast whatever the slope, as a bullet mark lies on its wall (research 89 §15). The viewer
(`GrenadeThrower.groundUnder`) casts the throw's hull from 10 over the blast to 10 under it, takes the first solid
hit, and frames the clipped scorch on its point along its normal negated; its random turn about the normal is kept
[reading: `FUN_00307810` takes none]. Straight down, as before, Desert Glory's `g157` hillside (39.9 degrees at z
1700) dropped every scorch whole at the 4.8 test (`viewer/test/grenadeScorchSlope.test.ts`). Not followed: the game
marks under a blast in the air too (the column has no floor) and takes the probed surface's material for the size;
the viewer still marks at rest only, sized by the material it lay on.

## 8. The model and the hold

`WEAP_GEO.ZED`'s `grenade` (every map carries it with the weapons, research 79 §2's form): 81 vertices, 82 triangles,
`G11b.tif` and `m79.tif`, bbox (-0.60, -0.80, -0.52)-(0.67, 1.03, 0.52). `character.rdr`'s `body_items` list a
`grenade` attachment part beside `rifle` and `pistol` (research 78 §3.1); the skeleton's hands are `rhand` (17) and
`lhand` (24). The throw clips animate the held item's node `rifle` under `rhand` (`seal_throwgrenade` and the rest
carry a `rifle` track; the crouched and prone ones SOCOM 1's `weapon`), so the viewer hangs the grenade on that node
(`Play.heldNode`, the weapon workstream's `rifle` node) while it is up -- the rifle stowed -- and it rides the hand
through the clip. The release point is the **posed** right hand's (2, 0, 0) (`Play.partPoint('rhand', ...)`; the left
hand's for the left lean), carried into the actor frame for `throwVelocity`: standing, about 23 over the feet at the
release frame, against the table's 19.35. Without a posed body the table's point stands in (`HAND_PLACEHOLDER` for the
hold).

The HE (`HEgrenade`: 56 vertices, 50 triangles, `HEgrenade.tif`, `smoke_grenade02.tif`) is decoded beside it.

### 8.1 The equipment's hand pass (2026-10-07, the owner's playtest of 2026-10-06)

The owner: "We appear to be missing animations for equipment ... grenades and mines and claymores etc, do the same pass
for animations relating to those as we have accurately done for mainhand and offhand." The method is the swap's
(research 211): read which type the original pushes and which hand it plays in, then pin each clip to the disc. All
readings, **pending review** (the author's; not re-read by a second reader yet).

1. **The firearm stays in the hand while an item is up.** `FUN_005a64c0` from a firearm (class 1 or 2) to an item (class
   3: the hand grenades 0x79, the charges 0x97) or class 0 (the Detonator) takes the `bVar6` branch: the body's 0.3 s
   snapshot cross-fade and nothing else -- no re-parent, `+0xf79` unchanged (D:L461887-461920); the branch that stores
   the target class in `+0xf79` (D:L462010) is reached only for class 1 or 2 (`bVar6` is false only then). Measured on `MOTION_P.ZAR` (the `rifle` / `weapon` node in the posed
   clip's frame): in `seal_crouch_throwgrenade` the `weapon` node keeps the left hand at (-1.1, -0.2, -0.6) in its frame
   on every key while the right hand travels 7 units -- the rifle passes into the left hand; in the standing throw, the
   toss, `seal_place_claymore` and `seal_put_onwall` the `rifle` node leaves the right hand by 4-7 units mid-clip and
   is back on its grip (-1.2, -0.2, 0.4) at the end, as `seal_stand`'s (-1.3, -0.2, 0.2). The clips carry the firearm
   apart from the throwing hand: the port's stow (the rifle hidden, the grenade on the `rifle` node) put the grenade in
   the left hand through the crouched throw. Now `./matchThrow` stows only for the launcher.
2. **The item rides a `grenade` node under `rhand`.** `FUN_00553290` (D:L419019-419052) builds the body's attachment
   nodes: class 3 is a node named `grenade` (0x65c4a8) under body `+0x300` (`rhand`; research 80's offsets), class 2
   `pistol` and class 1 `rifle` under the hand or their carry. No clip has a `grenade` track: the node sits at the
   hand's origin (`ITEM_NODE`, `Play.itemNode`; its local matrix `ITEM_NODE_LOCAL_READING`). Open: `FUN_005c6980`
   (D:L479740-479760, called from `FUN_005c50b0` at the take-up, D:L478994) looks a node up by the name `aimnodes` and
   adds a kit model to it; which model and for how long is not traced.
3. **The pistol's versions.** `FUN_00588bc0` pushes every one-shot through `FUN_0058c820(body, type, +0xf79)`
   (D:L446077); with the sidearm in the hand the type becomes its registered pair (`FUN_005e1cf0`, D:L494720-494772):
   `Throw grenade` -> `Pistol throw grenade` (`seal_p_throwgrenade`), `Toss grenade` -> `Pistol toss grenade`
   (`seal_p_tossgrenade`, playback **2.0**), the two lean tosses -> `seal_p_toss_rlean` / `seal_p_toss_llean`, `Place
   claymore` -> `seal_p_place_claymore`, type 0x3e `Put on wall` -> 0x83 `Pistol put on wall` (`seal_p_put_onwall`; the
   ELF's type table at 0x661060). The crouched and prone throws' pistol types (ELF 0x6617e0, 0x6617a0, 0x661820) are
   not in the Seal anim set: the rifle's clip plays. `FUN_005802b0` times the release on the pushed motion, so the
   pistol's toss lets go at 0.69 x 2.0 x 29/30 = **1.334 s** (the rifle's 1.067 s); `GetThrowAnim`'s fraction and hand
   point stand. `@s2u/scene` `PISTOL_HAND_ANIMS`, `handAnim`. Three of the pistol clips are upper-body only (16, 15 and
   16 parts): the layer lays the parts they carry (`PISTOL_ONESHOT_PARTS_READING`).
4. **C4's own clip.** `FUN_005be9a0`'s C4 branch (type -0x69) pushes action 0x3e, `Put on wall` (D:L475420), with the
   charge down at its trigger phase 0.45 (D:L475444): `seal_put_onwall`, 42 keys, playback 2.5, `NoInterrupt ()` bare.
   The claymore (-0x67), the PMN (-0x62) and types -0x68, -0x66 push `Place claymore` (D:L475322, 475354, 475371,
   475481): the PMN's clip was right. The port played the claymore's clip for C4 (research 210 s9's owed item).
5. **The others see them.** SOCOM II's remote console runs the owner's weapon state (research 193 s4.1, offset 0x7e) and
   pushes the clip itself; the port's room carries the mover's hold instead: the hold's `HOLD_CODES` index in
   `BodyState.flags` bits 11-14 (`BODY_HOLD_SHIFT`, additive, the version kept), and the others' bodies start the
   throw's or the placing's clip when it appears (`ThrowPose.follow`, `./remotePlayers`) -- the pistol's version when
   that body holds the sidearm. A reload's hold starts nothing there.
6. **The mover's holds.** Three codes appended, the first twelve unchanged: `seal_put_onwall` (its root's 1.8 along
   z), `seal_p_tossgrenade` (2.0, `NoInterrupt` 0.8) and `seal_p_put_onwall` (no root: in place). The pistol's other
   versions hold on their rifle type's code: the same playback, keys, `NoInterrupt` and travel on the disc
   (`test/equipmentAnim.test.ts`). The four bits are now full (15 codes).

Not done in this pass (the report's scope items): the others' item model in the hand, the remote throw's grunt
(`throw_whoosh` on another body), the first person (the page's own body is not drawn there; SOCOM II draws no hands),
the Detonator's own node, `Return throw grenade` / `Kick grenade` (no player path found), the mines' arming.

## 9. What the viewer does, and asks

### 9.1 How SOCOM II selects a grenade

`READERC.ZAR/controller.rdr`'s `ControllerConfigs` `Default` (and `Reverse`) bind **L1 `SwapWeapon1`, L2
`SwapWeapon2`, R2 `Inventory`**, R1 `Fire`, X `Action`, Square `Jump`, Circle `TeamCommand`, Select `TACMAP`, L3
`FireMode`, R3 `Reload`. The digital results are indexed in the order of the name table at 0x3f2bdc (0 `Action`, 1
`AimMode`, 2 `Fire`, 3 `FireMode`, 4 `Inventory`, 5 `Jump`, 6 `Reload`, 7/8 the strafes, 9 `SwapWeapon1`, 10
`SwapWeapon2`, 11 `TeamCommand`, 12 `TACMAP`); `FUN_002c64e0(result, pad)` answers a result's button state through
the config's byte at `+0x12 + result`.

- **L1 / L2** (the player update `FUN_00594cf0`, 0x595728 and 0x5957d4): a press of result 9 or 10 takes the kit slot
  the controller keeps at `+0x224` (L1) or `+0x228` (L2) -- `FUN_005bdc30` (the slot holds an item), `FUN_005c4fd0`
  (a change is allowed), `FUN_005c4b10(kit, slot)` (the change) -- or plays `FUN_003419c0`'s refusal. `CSealCtrl`'s
  constructor (0x598280) sets them to **slot 0 (the primary) and slot 1 (the sidearm)**.
- **R2** opens the inventory (`FUN_0021bda0`, reached from result 4 in the UI code at 0x219ce4/0x21c2cc): the kit's
  slots listed; in it, the pad's button 0xd assigns the highlighted slot to L1 (`+0x224`), 0xe to L2 (`+0x228`) --
  refused when it is the other's -- and 7 takes it up. So a grenade is selected from the inventory, or put on L1 or
  L2 there and swapped to with one press.
- The kit (`character.rdr` `mp_seal1`): 0 M4A1, 1 Mark 23, 2 M67, 3 HE, 4 Double Ammo Load.

**The viewer** (since the WEAPON workstream's round 3, the owner 2026-09-29): **L1** is the game's `SwapWeapon1`, the
rifle, and **L2** its `SwapWeapon2`, the sidearm (the controller's default slots 0 and 1; `./kit`); R2 was the inventory
as one press a step -- rifle, M67, HE, AN-M8, Mark141, claymore, Detonator (only while a claymore is down) -- in place
of the menu, until 2026-10-04: R2 now opens the menu itself (`inventoryMenu.ts`, research 94 §4.6). The PC's number keys: `1` the main weapon, `2` the sidearm, `3` and `4` the kit's first and
second equipment slots in kit order (`equipmentSlots`: the M67 and the HE for `mp_seal1`); the rest of the pouch
(AN-M8, Mark141, claymore, Detonator) is reached through R2's inventory only. The HUD's box shows the item's
HUDW icon (`IconTextureName`: `grenade_frag_icon.tif`, `grenade_he_icon.tif`) and its count.

### 9.2 The HE

**Corrected in round 3.** `HandleIntersections` does not test the ID itself but its **category**: `FUN_003d1e10`
passes the weapon's `+0x7c` through `FUN_003d1a60`, which maps an ID to the first ID of its range (121-140 -> 0x79, the
hand grenades; 151-170 -> 0x97, the charges; `weaponCategory`). So the HE (126), the AN-M8 (122) and the Mark141 (123)
bounce exactly as the M67 does; `HandleImpact` (0x3c8920) -- which does set an explosive round to detonate at its first
non-liquid hit -- is the launched rounds' (0xab-0xb8 but 0xac, 0xad, 0xb2) and the bullets'. Round 2's "the HE goes
off where it lands" was wrong. The HE: `Explosion_Radius` 10 (100 units), `Explosion_Damage` 11, its zAnims `HE_start`
(`.THROW_OBJECT`) and `HE_grenade`.

**Which zAnim goes off** (`HandleDetonateExplosion`, 0x3c8330, decomp 319195-319290): for the AN-M8, 0x7d, 0x7f-0x80,
0xac-0xad, 0xb2, 0xb6 and the claymore, the record's `DefaultSpecialAnimName` on the projectile's own node (the smoke
stays with its canister); for the others a vertical probe under the point (`FUN_0031df50`): with ground less than 10
under it, the material's variant (`FUN_003d2320`: `SpecialMaterialAnimName_<material>`, `frag_grenade_stone` ...), else
the default -- the viewer takes the material the grenade came to rest on [reading]. Then the damage query
(`FUN_003c7af0`, when `Explosion_Radius` > 0), the claymore's model hidden, state 5.

**Since round 3 the explosions run through the EFFECTS workstream's zAnim runner** (`effects.play`: the game's own
particles and models); `GrenadeThrower.setEffectPlayer` takes the door, and a run it starts replaces this file's
placeholder sprites (`ExplosionInfo.byEffects`). The placeholders stay for a map or name the effects cannot play.

### 9.3 The sounds on Frostfire

- `.THROW_OBJECT` is `MP2_am.bnk`'s `.THROW_OBJECT ` -- with a trailing blank the zAnims' name lacks; the audio's
  lookup now finds a bank name by its trimmed form too (`audio.ts`).
- `grenade_hit_metal_thick` (and `_metal_grate`) play `.GREN_METAL`, which **no MP2 bank holds** (`MP2_am` has
  `.GREN_TIN`, `.GREN_STONE`, `.GREN_SNOW`, `.GREN_WOOD`): silent on the console too, where `FUN_00344f30` answers no
  handle. Frostfire's default material is METAL_THICK, so most of its bounces are silent.
- The material explosions (`frag_grenade_metal_thick` ...) reach `.GREN_MED` through a call (set 0 command 0x45) to
  `frag_grenade_stone` and on to `frag_grenade`; the audio's zAnim map lists direct sounds only, so the page falls back
  to the base zAnim (`ExplosionInfo.baseAnim`). Following the calls in `@s2u/sound`'s `callbackSounds` would be the
  audio workstream's fix.
- `MP2_fx.bnk` also holds `.GREN_PIN_PULL1`, `.GREN_NEAR`, `.GREN_FAR`; no zAnim on the disc names them (the ELF may,
  by a computed name): not played.

### 9.5 The flashbang: the white-out's rule

The Mark141 (`FLASHBANG`, ID 123): `Timer1` 1.5 s, `Timer2` 1.6, six carried, no damage, `Explosion_Radius` 15 (150
units), its zAnim `flashcrash_grenade` (`.MARK_141_FLASH`, a dust puff, `explosion_light`, `PhosExplode.tif`). No MP
default kit (`character.rdr`) carries it.

The player controller's flash reaction (vtable slot at 0x669500 -> `FUN_00597c00`, decomp 454528-454585):

- only inside `d^2 < 22500` (150 units); a falloff of 1 to 80 units (`d^2 <= 6400`), `1 - (d^2 - 6400) x 6.2e-5` past;
- `facing` = the actor node's z row against the unit body-to-flash difference -- the SEAL's forward against the
  direction to the flash; `s = 1 - facing x falloff`;
- facing away (`facing <= DAT_0065e640` = 0, or a flag in the body's `+0x104c` object) is level 1; else `s < 0.3`
  level 3, `s < 0.6` level 2, level 1 past it (`flashLevel`);
- it starts the map's `MZANIM.ZAR` animation `blindplayer0<level>` (`FUN_001988d0` with 0x65e668, `FUN_0026a250` on
  the zAnim main at 0x414bb0).

The three animations' `blinded` command (set 0, 0x24) reads [reading of its floats]: a start colour (1, 1, 1), then
keys of (seconds, grey, strength): level 1 (0, 0.9, 25) -> (2, 1, 0); level 2 (0, 0.75, 60), (1.5, 0.75, 60) -> (4, 1,
0); level 3 (0, 0.75, 60), (8, 0.75, 60) -> (10, 1, 0) (`BLIND_KEYS`); their `fadein` (0x21) rises over 0.2 s. The
viewer (`./flash`, `WhiteOut`) draws a white layer over the frame: 60 as full white, 25 as 25/60 [reading], 0.2 s in,
held, back by 2 / 4 / 10 s. The AI's cower (`Flashbang cower` clips, `CAiSStunResponse`) is not the viewer's.

**Who is whited out (P2, the online-parity sweep's TB-1/DHD-1, 2026-11-02; reading, pending review).** The reaction is
reached only inside the queued blast. `FUN_00597c00` is the controller's `+0x50`, which `FUN_005a5250` calls with slot 0
for the flashbang's weapon class `{` alone (D:L461271-461278; the smoke's `z`/`0x7f` take slot 3, `}` slot 1, anything
else slot 4). `FUN_005a5250` has three callers: `FUN_005a0b60` with `}` (D:L458970), `FUN_005a0bb0` with `z`
(D:L458981), and `FUN_005a0e70` with the queued round's class (D:L459228) -- so a flashbang's white-out comes only from
`FUN_005a0e70`, which returns at once with no round queued at `+0x104c` (D:L459113-459115), drops it when the ray to
the head meets a blocker the round does not pass (D:L459192-459193) and when the reach factor is 0 (D:L459207-459227).
The queue is filled by `FUN_005ac070` (D:L464808-464861: a flashbang queued with no damage, `{` at D:L464839), whose
only caller is `FUN_005ab850` (D:L464620), reached only from `CZSealBody::OnWeaponHit` (`FUN_005ac670`, not in the
decompilation; research 179 s8.2 read it by disassembly: friendly fire off, a live owner sharing a team bit -- no
blast queued); the explosion's walk reaches each body through that handler (`FUN_003c7dd0` calls the node's `+0x94`
handler, D:L318991-318993). So a flash behind a wall whites out no one, and with friendly fire off a teammate's flash
whites out no one -- the second half resting on 179 s8.2's call graph, filed as `FLASH_FRIENDLY_FIRE_READING`
(section 12.1). The port: the room resolves the flash with every blast (`blastPlayers`) and sends the level on the
victim's `blast` event (`flash`, `net/blast.ts` `blastFlashLevel`: this section's rule from the feet and the facing;
additive, no protocol bump); `NetPage` starts `WhiteOut` from it; the page's own `explode` reckons a level only with
no room (the `&nomatch` free walk, an instrument); the bots blind on their own `blast` (`MatchBots.flashed`). Was
(LATER 399, 2026-10-24 to 2026-11-02): the page's ungated rule on screens and bots, the room's gate on its blast.

### 9.6 The smoke

The AN-M8 (`SMOKE`, ID 122, `mp_seal2`/`mp_seal4`): `Timer1` 3, `Timer2` 40, no explosion. At 3 s `smoke_grenade`
plays on the canister (sparks, a flash, `!SMK_CANISTER`, and a call to `smoke_stream`), whose two `large_smoke`
particle sources (`cloudpuff01.tif`) throw puffs +-20 across and 0-17 up, 3-4.5 across, living 5-7 s, grey 0.6 and 0.4,
for 20 s twice over -- the 40 s of `Timer2` [reading of the 0x1b commands]. The effects run it; its puffs do not yet
read as a screen there, so the viewer also draws `SMOKE_PLACEHOLDER` (the same numbers, x10 in size, a puff every 0.2 s)
until the EFFECTS workstream's does (`SMOKE_ALWAYS_PLACEHOLDER`). What the smoke hides from the AI (a sight query) is not
the viewer's.

### 9.7 The claymore (and the C4)

The claymore (`mp_seal4`'s kit; ID 153, category 0x97): `Muzzle_Velocity` 0 -- placed, not thrown: `CZKit_TickExplosives`'
branch for 0x98-0x9a and 0x9e calls `FUN_005c2430` (the right hand's point through the vertical probe: the highest
ground at or under it, not VOLUMETRIC) and `FUN_005bc730` (`SetProjectile` there, still, the SEAL's facing); `c4_start`
(`.PLACE_CHARGE`); four carried; no `Timer1`; `Explosion_Damage` 16 to `Explosion_Radius` 25 (250 units), and
`GetDamage` divides it by 32 outside its cone (`FUN_003c7280` with `0x3fbc7edd`: ahead within `along x tan 1.47261`,
84.4 degrees, to the radius; `claymoreCone`). Its zAnim `claymore` (`.M18_CLAYMORE`, sparks, dust, fire, flying bits).

#### 9.7.1 Its trigger: the Detonator (round 4)

The claymore has **no trigger of its own** -- no tripwire, no proximity, no fuse. It is **remote**: the kit's
**Detonator** (`zweapon.rdr` ID 193 = 0xc1, `ModelName detonator`, `IconTextureName detonator_icon.tif`,
`MaxFireMode` 1, no ammo), fired with the fire button (R1).

- **No proximity.** `ProximityDistance` (0x3fcd70) is read by the weapon loader into the ammo's `+0x3c` as its square
  (`FUN_003d4440`, getter `FUN_003d4430`); only `PMN Ammo` carries it (1, i.e. 10 units). The proximity list 0x4b5238
  that the actor tick `FUN_00543930` walks (decomp 410280-410310: an actor within the distance sets `+0xc4` through
  `FUN_003c5730`) gets only type 0x9e (the PMN, `FUN_005bc730` at decomp 474105).
- **No fuse.** `FUN_005bc730` sets the placed charge's `+0xc5` (`FUN_003c51c0`) to `type == 0x99` and `+0xc6`
  (`FUN_003c51a0`) to "has a proximity"; the placed-explosive tick (0x3c5310, decomp 316893-316900) counts `Timer1`
  down and sets `+0xc4` (go off) only when both are clear. The claymore's `Timer1` is 9999999 anyway.
- **The kit.** `FUN_005c74e0` (decomp 480165-480200) appends the Detonator (`FUN_005bdfb0(..., 0xc1)`) to a kit that
  carries a claymore. `FUN_005bdc30` (decomp 474637) makes it selectable only while `FUN_003cc1f0(0x4b5220, owner)`
  -- the SEAL's claymores down (the entries marked `+0xc5`, the claymore's alone, decomp 474101; research 256 §8.1,
  PAR-96, 2026-10-16) -- is not 0. *(Was: "the SEAL's charges down".)*
- **Placing** (the fire handler `FUN_005be9a0`, type -0x67 = 0x99, decomp 475306-475337): with 4 or more of the SEAL's
  claymores down (`FUN_003cc1f0(...) < 4`; PAR-96: a PMN or C4 down never counts, research 256 §8; *was:* "the SEAL's
  charges down") it shows `Unable To Deploy: Max Equipment Items Placed (4)` (0x65f880) with a
  2 s hold (`+0x8` = 2.0); while moving faster than `DAT_003dfe10 x 0.32` (3.2 units/s; `+0xf88`) it does nothing; else
  `FUN_0057d540(actor, DAT_003deb48)` -- the action `Place claymore` (0x661628, resolved at decomp 495216; the pistol's
  `Pistol place claymore` is 0x661640) -- and the timer `+0x87c` = 0x3fa66666 = **1.3 s**. When it runs out (decomp
  476883-477015) `FUN_005c2430` takes the right hand's node (`+0x300`, the one the throw releases from) and the grid
  column's surfaces under it (the highest at or below the hand), and if that ground is above the feet (`+0x404`) less
  `DAT_003dfe10` (10), `FUN_005bc730` sets the charge there with the SEAL's orientation (`+0x50`), counts one off the
  slot, and **selects the Detonator** (`FUN_005c8a20(param_1, 0xc1)`, decomp 474129).
- **Firing the Detonator** (type -0x3f, decomp 475477): `CZKit_DetonateRemoteExplosives` (0x5c0130) walks the placed
  list 0x4b5220 and, for each charge of this SEAL's (`+0xac` = the actor's id) with `+0xc5` up (a claymore) within
  **500 units** of the SEAL (`FUN_003c71d0(0x43fa0000, charge, actor + 0x1c)`), sets `+0xc4` (`FUN_003c5730`): the
  next tick detonates it (`FUN_003c8740`). Then `FUN_005c8a20(param_1, 0x99)` selects the claymore slot again.
- **No `FireWait` between its fires** (P38, the online-parity sweep's TB-13, 2026-11-02; reading, pending review). The
  fire hands `FUN_005be9a0` the record's wait, by fire mode (`FUN_005c09f0` D:L476323-476340: the record's `FireWait`
  `+0x50`, 0.1 with no record, scaled by the slot's mode `+0x6fc` -- mode 0 1.0 s, 1 the `FireWait`, 2-3 x0.8, 4 and up
  x0.2), but its branch (type -0x3f, D:L475477-475478) calls `FUN_005c0130` alone and never sets the kit's fire timer
  `+0x81c` -- only the 0x9a branch (D:L475488) and a firearm's round (D:L475517) do -- nor does `FUN_005c0130`
  (D:L476006-476032: the walk, the claymore slot `FUN_005c8a20(0x99)` D:L476031, the shot count `+0x818` D:L476032).
  That timer is the gate `FUN_005c0ae0`'s only *timed* refusal (D:L476446). The original's actual limit between presses
  is the per-press count: the gate refuses while `+0x818 >= FUN_005c0940` (rounds a pull, D:L476439), the count raised
  by `FUN_005c0130` and reset only when the trigger is let go (state 0 or 3, D:L476382, D:L476400) -- one fire a press.
  So a press straight after a fire is the claymore's (the Detonator is down), and the Detonator taken up again fires at
  once. The switch's timing: no timer (read: `FUN_005c8a20` -> `FUN_005c50b0` / `FUN_005c6980` sets none, and `+0x820`
  is set only through `FUN_005c32b0` from `FUN_005c5340`, a branch that excludes -0x3f); the gate's animation checks
  (`FUN_00286b80(+0x1160) < 1.0` behind `FUN_003d1e20`, D:L476424, D:L476434) unread. The page holds this
  (`GrenadeThrower.pull` -> `detonateCharges`, no wait; `viewer/test/grenade.test.ts` "P38"). The room's `detonate`
  refused `throw: rate` inside the record's `FireWait` (`room.ts` `detonate`, `p.detonateAt`) until P38-room, below,
  dropped it: that gate had no source in the original and was never mirrored on the page.
  **The room takes a detonate at its command, no `FireWait`** (P38-room, 2026-11-02; reading, pending review): the
  branch (type -0x3f, D:L475477-475478) calls `FUN_005c0130` alone and sets no fire timer -- the kit's `+0x81c` is
  written only at D:L475488 and D:L475517 -- and `FUN_005c0130` re-selects the claymore (`FUN_005c8a20(0x99)`,
  D:L476031). The original's limits between presses are the per-press count (`+0x818 >= FUN_005c0940`, D:L476439,
  reset at the trigger's release) and that re-select, both the page's; `FUN_005c74e0` (D:L480156-480202) only adds the
  Detonator to a kit with a claymore, the room's `no claymore` refusal. So `room.ts` `detonate` no longer refuses
  `throw: rate` inside the record's `FireWait` (was: `Player.detonateAt`, the record's 0.1 s): every detonate is taken
  when it arrives (a `throw` reaches `Room.text` on its arrival, `server.ts:1442`, not on the room's tick, so several
  within one tick are all taken); the socket's text rate is its only bound (`RATE.text`, 40 a second, `server.ts:317`,
  plus its bank, `:1350`) (`roomEquipment.test.ts`, "no FireWait between its fires (P38-room)"). The
  page-side row (the gate's `FUN_005c09f0` wait never applied, `grenade.test.ts` "P38") lands with
  `agent/p38-detonator-wait`.
- **The clip**: `motion.rdr`'s `seal_place_claymore` -- 55 keys (`MOTION_P.ZAR`), `playback` 2.7, `NoInterrupt` 0.9,
  `NoFire` -- so 2.60 s in all (`playback ((n - 1) / n)^2`), the charge down at 1.3 s (phase 0.49).

`DAT_003dfe10` is not a constant: the world root's load (decomp 217163-217170) sets it to `1 / <key 0x3f6c70>`; its
static 10 is what every MP map gives (the viewer's units are the game's).

**The viewer** (`CLAYMORE_RULES`, `PLACE_CLAYMORE_ANIM` in `projectile.ts`; `grenade.ts`): R2's inventory takes the
claymore up (the number keys reach only the kit's first two equipment slots, §9.1); the trigger starts the placing --
`throwStart` with `PLACE_CLAYMORE_ANIM`, so the page's throw pose layer plays `seal_place_claymore` on the body -- and 1.3 s in the charge goes down under the posed right hand (the
hull cast from the hand to the feet less 10; none there, nothing is placed) and the Detonator comes up (its model on
the held node, its HUDW icon); the trigger with the Detonator sets off the SEAL's claymores within 500 units and puts
the claymore back up (the rifle when none is left -- the game selects the empty slot [reading]). Four down at most:
the fifth is refused with the game's message (the `refuse` event; both pages post it on the HUD's message window, the
game's message line, through `./matchMessages` `refusalLine` -- `/testroom` since PARITY-2 PAR-36 (c)); not while moving. R2's inventory offers the Detonator while a claymore is down. `detonateCharges()` (the
hook) is the Detonator's fire.

The C4 (ID 151, `Timer1` 6, `Explosion_Radius` 5, `IgnoreExplosionDI`) is in no MP SEAL kit: not in the viewer.

#### 9.7.2 Online: the room's ground check, the Detonator's owner, the cone's point (2026-10-02, INT-NET-1)

Ported from Chris's browser-beta-v5 (`chris/browser-beta-integration` d578f347, his `room.ts` `placeCharge` and
`grenade.ts` `placeRemote`/`detonateRemote`), onto web sprint 4 M7's wire (a charge is the `throw` of its item; his
`placeCharge` / `detonateCharges` / `chargePlaced` / `chargeDetonated` messages are not taken, and his charge list,
keyed by the numeric owner id and kept across a leave, does not replace the room's -- the room's keys them by the
player object, `DEPARTED_CHARGES_READING`).

- **The ground under a charge.** The room took a claymore or a PMN anywhere within `MUZZLE_SLACK` of the eye on the
  body's side of the walls -- one in mid-air at head height among them. It now takes it only on a surface it can rest
  on under the point (`viewer/src/net/placing.ts` `chargeRests`, `restsOn`: not VOLUMETRIC and not LIQUID as `FUN_005c2430`
  skips (research 202 §2.2) -- *was* also not passed through (PENETRATION 1), the page's own with no source in the original,
  dropped 2026-10-16 by web sprint 40 AD-4, so an ACTION, INVISIBLE_DI or ITEM face now holds a charge; LATER 38), the point on the surface (AD-4; *was* 0.1 above it, the page's own rest lift) to
  within `CHARGE_GROUND_SLACK_PLACEHOLDER`; above the feet less `placeDrop` (the placing's test, 476883-477015); and one
  `placeGround` could give from a hand at or under the eye -- at or under the eye, or over it the world column's lowest
  accepted surface (AD-4, research 202 §2.2; *was* no higher than the eye plus the page's cast lift, 1). His version also refused a charge above the
  feet + 1; the original's column takes the highest surface at or under the **hand** (`FUN_005c2430`, D:L477163-477250,
  `fVar14 <= fVar4`), so a ledge or a crate top under the hand is a placing the original makes: the room takes it
  (the triage's challenge; `match/test/roomEquipment.test.ts`, a ledge 4 up taken, the floor 15 below a platform
  refused). A refusal is counted (`dropped('throw', 'ground')`). The page's lift and rest offsets were bare literals;
  they are named in `net/placing.ts`, which the page's placing and the room's check both read. Not done: his facing-yaw
  slack (the wire carries a unit facing, not a yaw); a facing far from level is still taken.
- **The Detonator's owner.** `CZKit_DetonateRemoteExplosives` (0x5c0130) sets off the charges whose `+0xac` is the
  firing actor's id. The room did so already (`detonate`, by the player); the page did not: another player's
  Detonator set off every remote claymore within 500 units of him, a third player's included -- drawn exploding and
  removed while the room kept it live. The page's copy now keeps the thrower's id (the `grenade` event's `id`,
  `GrenadeThrower.launchRemote`'s `owner`) and a Detonator sets off its owner's only (`viewer/test/equipmentPage.test.ts`,
  `netPageRound.test.ts`; the room's own scoping pinned in `roomEquipment.test.ts`). Left open: a session takeover
  (`TAKEOVER_ROW_READING`) reaches the other pages as a `left` and a `joined` under a new id, so their copies of the
  old seat's claymores keep the old id and its new Detonator does not set them off there, while the room does.
- **The cone's point** (`CLAYMORE_CONE_POINT_READING`, open; no value changed). The room tests a victim against the
  claymore's cone at the feet (`room.ts` `blast`, with the record's `Explosion_Radius`); the page's own blast at the
  feet + 10 (`grenade.ts` `damageAt`, with the baked `CLAYMORE` radius), and Chris's room at the feet + 10. Neither
  side cites the 10. `GetDamage` (`FUN_003c7600`, D:L318646) hands its `param_3` to the cone test (`FUN_003c7280`,
  D:L318779); its damage callers pass the actor's `+0x1c` (D:L459241, L459270, L461587, L461612, L464712), the actor's
  position (research 79's table, `+0x1c..+0x24`) -- which leans to the feet, the room's. To settle: that `+0x1c` is
  the feet (not a raised root) on the SEAL; then the page's preview follows the room's point and radius.

### 9.8 The page's API

- **Input**: the fire trigger (left button captured, the touch fire button, R1) holds and throws while a grenade is
  up. R1's analog value is not read (a browser pad's R1 is on or off): the pressure is 1 while held.
- **Events** (`GrenadeThrower.on`): `equip(equipped, item)` -- the rifle stowed while true (`Play.setRifleStowed`);
  `throwStart({ anim, power, releaseIn })` -- the throw clip on the body (`./throwPose`, a pose layer the page adds
  with `Play.addPoseLayer`);
  `place({ item, pos, yaw, fireAnim })` -- the claymore down (audio `c4_start`: `.PLACE_CHARGE`);
  `refuse({ item, text, seconds })` -- the claymore's `Max Equipment Items Placed (4)` (the HUD's message window on both pages);
  `detonate({ count, from })` -- the Detonator fired;
  `throw(info)` -- audio `.THROW_OBJECT`; `bounce({ material, pos, speed, sound, anim })` -- audio
  `grenade_hit_<material>` when `sound`; `explode({ pos, radius, anim, material, damageToPlayer, distanceToPlayer })`
  -- audio `.GREN_MED`, and the look workstream's shake by distance (a marked `MERGE(look)` call in `main.ts`).
- **Hook**: `grenade()` (the slot, `held` -- what is in the hand, `'Detonator'` included -- `placed`, `placing`,
  `message`, phase, power, left, the grenades in the air, the last throw, bounces, explosions,
  the M67's numbers, `arc` -- the held throw's yellow arc, §11), `throwGrenade(holdSeconds = 1, immediate = true)` (`immediate` false: the clip plays and the
  hand lets go at its release), `equipGrenade(on?)`, `selectItem(item)` (`'rifle'`, a throwable, `'Detonator'`),
  `detonateCharges()` (the Detonator's fire), `throwClip()`, `grenadeTrail(on)` (a debug
  line along each flight), `resetGrenades()`.
- **Asks**: the peek state, for the lean tosses (the table and clips are in; the walk has no lean yet); the particle
  command 0x27's layout, to replace `EXPLOSION_READING`; ~~`SetModelOrientation` (0x3cabe0) for the grenade's spin in
  flight~~ (answered: the free-flight step `FUN_003c9530` tumbles it, research 202 §2.6; PF-07a retired the 14 rad/s
  stand-in); the inventory menu's own picture.

### 9.9 The bounce materials on all 22 maps (round 4)

`tools/grenade-materials.ts` runs every `RUN/MP*.ZDB`: each material byte of the hull (`worldCollision`) resolved as
`gridCast` does, the zAnim names built from it, whether the map's `CZANIM.ZAR` holds them, the sounds those play and
whether the map's banks hold them. The game builds the names exactly so: the weapon loader (decomp 316340-316355)
formats `"%s_%s"` (0x3fc540) of `HitAnimName` and each material's name (`FUN_002de440`, which would follow a
`WEAPONANIM` redirect -- `materials.rdr` has none) and looks it up in the zAnim registry (0x414bb0); the bounce plays
the one for the hit's material (`FUN_003d22e0`), none when the lookup failed. The fixture maps (MP2, MP6, MP72) are
tested: every hull byte in the table, byte 0 their `DefaultMaterial`, every `grenade_hit_*` of the archive a name the
code builds (but `grenade_hit_grating`, which no material names).

What it found:

- **The strings match.** Every material the hulls use resolves (no byte past the table), and `grenade_hit_<material>`
  / `frag_grenade_<material>` are the archive's names wherever the archive has them.
- **The silent bounces are the game's own data**, not a name mismatch:
  - **metal**: `grenade_hit_metal_thick` / `_metal_grate` play `.GREN_METAL`, which MP2 (Frostfire, `DefaultMaterial`
    METAL_THICK: 2 293 of its polygons), MP5-MP12, MP62, MP73 and MP83 do not have in their banks (`MP2_am.bnk`
    has `.GREN_TIN` and `.GREN_STONE` only). The maps whose banks have it (MP1, MP51-53, MP61, MP71-72, MP81-82)
    sound it.
  - **asphalt**: `grenade_hit_asphalt` names `.GREN_ASPHALT` with command 45 (0x2d), not the play-sound command 30 the
    audio's `callbackSounds` reads -- and no bank of `BNKSTORE.ZAR`'s 115 holds `.GREN_ASPHALT`. Silent in the game.
  - likewise `.GREN_DIRT`, `.GREN_SAND`, `.GREN_GRASS`, `.GREN_PLASTER`, `.BUL_FABRIC`, `.GREN_LEAVES`, `.GREN_SNOW`
    are missing from some maps' banks (the tool lists each).
- **No anim at all** for ACTION, INVISIBLE_DI (PENETRATION 1: never hit), UNDERWATER (LIQUID: passed through), GLASS,
  GLASS_THICK, GLASS_MEDIUM, GLASS_OPAQUE, METAL_RAILING, METAL_GRATE_THIN, CHAINLINK_FENCE, MUD, SNOWY_TREE, GASTANK: the game
  looks up `grenade_hit_glass` etc., finds none, and plays nothing; so does the viewer.
- **MP11**'s world root says `DefaultMaterial none` and **MP64**'s `stone` (lower case). The table's keys are `materials.rdr`'s names as
  written and the lookup is a byte compare (`FUN_002de9e0` -> `FUN_002ded30` -> `FUN_002dee30` -> `FUN_00195768`,
  memcmp), so the game finds neither, leaves slot 0 UNKNOWN (`FUN_002ddc30(0)`), and byte-0 polygons there (69 and 80)
  bounce as UNKNOWN (ELASTICITY_COEFF 0.3) with no anim. `surfaceMaterial` does the same [reading: `FUN_002396f0`, the string's constructor, was
  not read for a case fold].

## 10. The placeholders and readings, by name

| name | value | stands for |
|---|---|---|
| `HAND_PLACEHOLDER` | (3.5, 12.5, -4) | the hold, only without a posed body |
| release point | `GetThrowAnim`'s table | the posed hand, only without a posed body |
| `L2_SLOT_PLACEHOLDER` (retired) | was the M67 | L2 is sourced: the controller's default slot 1.0, the Mark 23 (`FUN_00598280` 454786; `kit.ts`, `gamepad.ts`) |
| R2 (resolved 2026-10-04) | was one press a step | the inventory menu, built: `inventoryMenu.ts` (research 94 §4.6, research 188 §1.2) |
| the throw clip's blend out | 0.4 s | the play after a throw |
| `SMOKE_PLACEHOLDER` / `SMOKE_ALWAYS_PLACEHOLDER` | §9.6 | the effects' `large_smoke` as a screen |
| the white-out's scale (`BLIND_FULL_READING`, `flash.ts`; retired, PF-07b) | was 60 = a full white DOM overlay | resolved: `blinded` is the `TRUE_COLOR_SCALE` wash `c x 0.75 + 60.5` of the lit colours and the fog under a `BLUR3D` glow of 2-3 additive half-size passes, FIX to 255, from 0.2 s after the flash (research 181 §3.7, V1 #10; 202 §3.9, V7 §8.2; 206 §1.2); `flash.ts`, `trueColourScale.ts`, `renderer.ts` `setGlow` |
| the glow's buffer in the native picture (`renderer.ts`, PF-07b) | half the canvas | the console's 320 x 224 of its 640 x 448 (the PS2 picture keeps it): at a high resolution the native blur is narrower on screen than the console's -- owed: a playtest look at a level-3 flash beside a PCSX2 frame (research 202 §3.9's owed capture) |
| `PEEK_THROW_READING` (retired, PF-20) | was 0.5, the peek value past which a throw was the lean's toss | retired 2026-10-05 (web sprint 28, PF-20): `GetThrowAnim` (D:L441773-441796) tests state 3 and the lean clip playing, no magnitude -- the right toss from 0x1e / 0x20 at 0.55, the left from 0x1d / 0x1f at 0.87, neither: no throw (research 181 §2.10; 217 §3.3; `grenade.ts` `stance`) |
| `SCORCH_PROBE_READING` (retired, AD-4) | was 10 over, 10 under, through the placement's material filter, a flat scorch at the blast on none | resolved 2026-10-16 (web sprint 40 AD-4; reading, research 202 §3.4): the world column at the blast's x and z, +50000 to -50000 (`FUN_002d49c0` D:L175812-175818), the highest surface no more than 10 over the blast, the first of equal heights, no lower bound, no material test (`FUN_002d4c20` D:L175857-175892), the decal on a hit only (`FUN_003c7af0` D:L318876-318880); `grenade.ts` `SCORCH_ABOVE`, `scorchHit` |
| the Detonator after the last claymore | the rifle | the game selects the empty claymore slot |
| the refusal's message | the HUD's message window on both pages (`./matchMessages` `refusalLine`; `/testroom` since PARITY-2 PAR-36 (c), 2026-10-11) | the game's message line (0x65f880, colour 2) |
| `FLIGHT_TICK_READING` (retired, PF-04) | was 1/60; now `GAME_FRAME_DT` = 525/15734 s, page and room (research 208; 179 §9.13, 181 §6.4 X4) | resolved: the projectile tick `FUN_003c9fb0` runs once per game frame at its dt |
| `SPIN_PLACEHOLDER` (retired, PF-07a) | was 14 rad/s about a random axis | resolved: the free-flight step `FUN_003c9530` tumbles a hand grenade by its step's distance, up to 50 half-turns a second (research 202 §2.6 item 20, V5 §7.2; research 206 §1.1); `@s2u/scene` `grenadeSpinRates`, `tumbleQuaternion`. Research 202 §2.6's suggested test "d = 15.5 gives (0.5, 0.5, 0.5)" is wrong: the code's test is `15.0 < d`, so any step past 15 takes the most, (10, 2.5, 50) -- `grenadeTumble.test.ts` holds the code's rule (202 is kept as imported) |
| `TUMBLE_START_PLACEHOLDER` (`projectile.ts`) | (0, 0, 0) | the tumble's angles `+0x9c..+0xa4` at the release: `SetProjectile` (0x3cb1a0) writes none of them; the pool's leftover and the hand's turn before the first free step are not read (PF-07a) |
| `EXPLOSION_READING` | §7.2 | the particle commands |
| the flash glow | a fifth of 100 -> 190 | the light |
| the scorch | at rest only, the rest material's size; STONE's for a material `GRENADE_BLAST` does not list (`decals.rdr` has no row for it; `GrenadeThrower.scorch`, review 4) | the column under any blast, its surface's material (§7.3); what the game draws for a material with no row is not traced |
| hull surfaces | bit 18 skipped (`isShotSurface`) | the projectile query's class |
| `ARC_DEPTH_TEST_PLACEHOLDER` | true | the translucent line list's (`FUN_003373b0`) Z test (§11) |
| `PLACE_CAST_LIFT_READING` (retired, AD-4) | was 1: the page's cast started over the hand | resolved 2026-10-16 (web sprint 40 AD-4; reading, research 202 §2.2): no lift -- `FUN_005c2430` keeps, of the world column's accepted surfaces (+/-50000 at the hand's x and z), the highest at or under the hand, else the lowest, the later of equal heights (D:L477228-477249); `net/placing.ts` `placeGround`, the page's `placeCharge` and the room's `chargeRests` and hand path (`room.ts`, feet + `CHARGE_HAND_HEIGHT_PLACEHOLDER`) |
| `PLACE_REST_LIFT_READING` (retired, AD-4) | was 0.1: the charge set over the surface found, the page's own | resolved 2026-10-16 (web sprint 40 AD-4; reading, research 202 §2.2): 0 -- `FUN_005bc730` sets the charge on the column entry's point (D:L477007-477010, D:L473998-474004); the room's hand path stops its drop `CHARGE_GROUND_SLACK_PLACEHOLDER` short of the point (`room.ts` `startRefused`) |
| `CHARGE_GROUND_SLACK_PLACEHOLDER` (`net/placing.ts`) | 0.25 | the room's tolerance for a charge's point over its surface: a browser network check, no original (§9.7.2; Chris's value) |
| `CLAYMORE_CONE_POINT_READING` (`room.ts`, `grenade.ts`) | feet (room), feet + 10 (page) | the point `GetDamage` tests the claymore's cone at, and the radius (§9.7.2) |
| `ITEM_NODE_LOCAL_READING` (`heldItem.ts`) | identity | the `grenade` node's local matrix under `rhand`: `FUN_00553290`'s new node is given none before it is hung (D:L419019-419052); the node class's default and `FUN_005c6980`'s `aimnodes` model are not traced (§8.1) |
| `PISTOL_ONESHOT_PARTS_READING` (`throwPose.ts`) | beneath (*since PAR-85: `{ throw: 'push', place: 'beneath' }`, research 251 §7*) | the parts an upper-body pistol one-shot (`seal_p_throwgrenade`, `seal_p_tossgrenade`, `seal_p_put_onwall`) does not carry keep the pose beneath it; how the action stack fills them is not traced (§8.1) |
| `CROUCH_RUN_QUICK_THROW_READING` (`projectile.ts`) | the standing throw, 0.710 s, reach 300, no thrower velocity; the reported second applied nowhere | the crouch-run quick throw's "missing 1 sec" (Trello xNAdEL9i): every step read at the source agrees with the port (§4.1); settles: the clip measured frame by frame beside the port (OBF-8, reading, pending review) |
| `THROW_DATE_BACK_TICKS_ADAPTATION` (`match/src/room.ts`) | 60 ticks (1 s, `CREDIT_MAX`'s) | a network adaptation, no original (§6.1): the most a late hand throw is dated back -- flown from the page's release, not the room's decision; past it the throw runs late by the rest; the part of a throw's age past the room's own credit (§6.1). The owner's ruling (2026-11-02, Craig's own word in the controller seat ef): 60, and it stays. Since LATER 643 the `grenade` event carries the throw's age as the room flew it (§6.1, 4.), so every page sees the shortened fuse: the vector the ruling first accepted -- a page flying its grenade up to 1 s early against the others' full fuse -- is closed. What remains, the cost the 60 is judged against (LATER 643's review, F2): a held line still makes the others' copy appear up to 1 s into its flight, mid-arc, with up to 1 s less of its fuse to see (not new: the room's blast already reached them that early) |
| `ROOM_FLIGHT_MAX_FRAMES_ADAPTATION` (`match/src/room.ts`) | 300 game frames (the queue's 10 s, `QUEUE_MAX`) | a server guard, no original (§6.1): the most frames the room's flight runs in one step on its credit; a longer stall's surplus is dropped, as the page's accumulator drops a stalled tab's (`GAME_FRAME_MAX_STEPS`) |
| `REMOTE_AGE_MAX_FRAMES_ADAPTATION` (`viewer/src/grenade.ts`) | 300 game frames | a browser guard, no original (§6.1, 4.; LATER 643): the most frames a page starts another's copy into its flight at once from the `grenade` event's `age`; the room's own bound, pinned equal by `roomGrenadeFuse.test.ts` |

## 11. The yellow arc (round 5)

The owner's request: while a grenade is held, a yellow arc shows where it will go. It is the player controller's own
draw, not a debug aid, and it is the throw's parabola, not a trace.

**Who draws it.** `FUN_005970b0` is a slot of `CSealCtrl`'s vtable (the pointer at 0x6694ec, beside the flash
reaction's 0x669500; also at 0x40630c and 0x669a2c), the per-frame draw of the player's controller. Its gate
`DAT_003df1b0` is **1 in `.data`**; `FUN_00598840` writes it, cleared when a scripted camera takes the player's
control (decomp 78454) and set back after (78609, `FUN_005cf800`) -- the same flag gates `FUN_00596f10` beside it. The
draw proper is `FUN_00598860`, the SOCOM 1 demo's `ai::DrawFunc<CDynGrenade>(LINE_TYPE, float, float, uint,
CDynGrenade)` (research 44's matches); its lines go through `FUN_005fff40` (the running point `DAT_0066bac8`, the colour
`DAT_0066bae0`, the alpha `DAT_00650d48`) to `FUN_0033b5f0`, the renderer's line (clipped to the view by
`FUN_0035f9c0`; an alpha under 0.992 goes to the translucent line list `FUN_003373b0` at 0x488df8, else
`FUN_00360030`'s packet: `PRIM` 0x49 -- a Gouraud line, blended, no fog -- and `TEST_1` 0x5000c, the Z test on).

**When.** Every frame, if all hold (the instructions 0x5970d4-0x597130, 0x597424):

- `DAT_003df1b0` (the player has control) and `DAT_006505f0` (the segment count, 100) are not 0;
- the controller's `+0x170` **bit 6 is set and bit 7 is clear**. Bit 6 is set in the player update (`FUN_00594cf0`,
  decomp 453627) on the fire button's press (the fire state 2) when the item is a hand grenade (category `'y'` = 0x79,
  §9.2) with one left (`FUN_005bdb00`); bit 7 is set at the release (decomp 453534, where the pressure falls under
  0.15 of the power and `FUN_005dfe30(body, 1)` fires); a weapon switch clears bit 6 (decomp 473853, 478914, 481592).
  So **the arc shows from the press to the let-go** -- through the whole power build-up, and gone as the throw clip
  starts, before the hand opens. The claymore (0x97) and the Detonator never show it; there is no cooking (§6).
- the view mode (`body+0x200`, research 83 §4) is **under 4** (`FUN_005b90f0`: not 4; `FUN_005b9990`: not above 4):
  third person and first person, not the 9x view nor a scope.

**What.** The throw the release would make now, worked out as `CZKit_TickExplosives` does (§4, instruction for
instruction: `GetThrowAnim` at 0x597178, `ComputeMaxVel` 0x597194, the aim's `asinf` clamped and `ComputeElevOfs`,
`lerp(0.05 max, max, power)`, `ComputeTimeToImpact`, the aimed correction under `DAT_006505c8`), from the controller's
power `+0x11c` as it is this frame -- **except the point**: `GetThrowAnim`'s table point (§3) through the body node's
matrix, where the release takes the hand bone's (2, 0, 0). Then (0x59732c-0x5974b0):

- `t_fall` = the later root of `-49 t^2 + vy t + h = 0` (`FUN_0050de20` with `0xc2440000`, `FUN_00575c50`), with
  `vy` the world velocity's y (sp+0x70) and `h` the table point's height: the time to fall to the feet's level.
- The impact point `p + v t_fall + (0, -49 t_fall^2, 0)` is worked out (sp+0xb0) and **never read**: no marker.
- `FUN_00598860(-1.0, 2 t_fall, 0, 100, {p, v})`: the curve `p + v t + (0, -49 t^2, 0)` from **t = -1 s** (the
  `lui 0xbf80` at 0x597498) to **`DAT_00650608` (2) x t_fall**, in `DAT_006505f0` = **100** steps. It is the analytic
  parabola: **no hull query, no bounce, no stop at the first collision**; it runs on under the ground to twice the
  fall, and starts a second back down the curve, behind and below the SEAL -- the Z test hides what is underground.
- The step is a float added up while under 1 (`add.s` 0x598a9c, `c.lt.s` 0x598aac): 100 steps of 0.01 reach
  0.99999934, and a closing segment ends on `t1` -- 101 segments. Each segment takes the alpha of its far end,
  `FUN_006000a0(f)` = `0.1 f + 0.75 (1 - f)` (`FUN_006000f0(DAT_006505f8 0.75, DAT_00650600 0.1)`), clamped to 0..1:
  **0.75 at the start fading to 0.1 at the end**.
- **The colour** (0x59742c-0x59747c): **(0.78, 0.78, 0)** -- `0x3f47ae14` twice and 0: the yellow -- or **(1, 1,
  0.8)** when the view mode is 3, the night vision (`FUN_005c80f0`). The colour is pushed (`FUN_00600190`) and popped
  (`FUN_00600150`) around the draw.

**The viewer** (`@s2u/scene` `throwArc.ts`: `THROW_ARC`, `throwArcTime`, `arcPoint`, `throwArc`; `viewer/src/grenade.ts`
`drawArc`): the same gate (holding, a thrown throwable with one left, `GrenadeSource.viewState` -- `./zoom`'s state --
under 4, pale in 3), the same launch as the release's through one function (`launchOf`, which `letGo` now uses too)
with the table point, and the strip as a `LineSegments` of 101 segments with per-vertex RGBA, blended, depth-tested,
unfogged, one pixel wide as the GS draws a line. The hook's `grenade().arc` gives its colour, segments, launch and ends.

**Does the toss follow it?** `test/throwArc.test.ts` flies `stepGrenade` from the arc's launch over an empty hull: every
frame's x and z are the arc's to 1e-6, and y sits exactly `g t dt / 2` under it (the flight is symplectic Euler, the
arc the closed form -- 0.8 units a second into the flight at 60 Hz, as in the game); the drawn strip is within 1.5
units of every frame to the fall. Without a posed body the throw that follows the let-go leaves from the arc's point at
its velocity (`test/grenade.test.ts`). With the posed body the release is the hand bone's, as in the game, so the toss
starts a few units off the arc's start (about 23 over the feet at the release frame against the table's 19.35, §8) --
the game's own mismatch, kept.

**Not found / not traced**: no console frame of the arc is in `scripts/parity/refs/` or `logs/parity/` (no grenade
frame at all); reCOM has no `CDynGrenade` or arc code. The translucent line list's own Z test (`FUN_003373b0`'s
renderer) is taken from the opaque path's (`ARC_DEPTH_TEST_PLACEHOLDER`). The line is one pixel of the PS2's 512x448
frame, which reads thinner on a large canvas; WebGL lines are one pixel wide, so the viewer's is thinner still at
high resolution. `FUN_005c9b30`, called first in the draw, was not read (it does not touch the arc's inputs).

## 12. The blast on the player: damage, the thrower, the wall, the knock, the ears (2026-09-29)

The owner, playing offline: "should grenades be doing damage? they do not appear to be to myself, nor are they knocking
me." They were not. **Before this round:** offline, the page had no health at all -- `GrenadeThrower.explode` computed
`damageToPlayer` and nothing read it; the HUD's bar stayed full. Online, the match server's room applied the fragments to
every living SEAL in the radius with a line to its head, the thrower included and its team spared (friendly fire off),
and the page showed it (`hurt` -> the bar, `kill` -> the death); nothing moved the body, anywhere. The screen shake by
distance (research 83, `explosionShake`) was the only reaction, offline and on.

**The game's rules**, per actor a blast reaches (all in `socom2_game.elf.decomp.c`; the `.data` words read from
`game/disc/socom2_game.elf`, file offset = va - 0x4c5380 + 0x2f7a80):

| rule | value | source |
|---|---|---|
| who is reached | every actor whose `GetDamage` at its origin is over 0 (or any, for the flashbang `{`), with the line from the blast to its head node clear; in MP each client resolves its own SEAL (controller `+0x34`) -- **nothing asks who threw it: the thrower is hurt as anyone** | `FUN_005ac070` L464806-464850 |
| occlusion | the ray query from the projectile's point to the head node's world position (`FUN_0031dd90`); a hit on a blocker ends it unless `FUN_003c8310` lets the round through | `FUN_005ac070`; `FUN_005a0e70` L459110-459158 |
| the reach factor | `f = 1 - d^2 / r^2`, `d` from the actor's origin (the feet), `r` the ammo's `Explosion_Radius`; nothing at f <= 0 | `FUN_005a0e70` L459207-459224 (the factor L459221) |
| the effect timer | a frag sets the actor's slot-4 effect timer to `5 f` s (decaying at `recovery_factor` 2 a second, `FUN_005a50a0`); the flashbang slot 0 (2 s), the smoke `z` and `0x7f` slot 3, `}` slot 1; each is handed to the controller's `+0x50` -- the player's (`FUN_00597c00`) acts on slot 0 only (the white-out, section 9.5): **a frag's timer has no player effect** | `FUN_005a5250` L461250-461292; vtable 0x6694b0 + 0x50 = 0x597c00 |
| the ringing ears | the player (controller `+0x2c`: `FUN_005431f0` returns 1), any weapon but the shotguns `Q`-`T`: `.RINGING_EARS` played from the banks (`FUN_00344f30(0x65f160)`, not a zAnim) and channels 0-3, 5 and 6 (4 untouched) at **0.35 for 5 s**, then a linear 5 s return to full (`FUN_003410d0` L241137-241172: `t += dt/5`) | gate L459194-459206, ring L459229-459235, `FUN_003412f0(0x40a00000, 0x3eb33333, 0,2,1,3,5,6,-1)` L241197 |
| the fragments | `FUN_005a18b0`'s count (research 91 section 5); each `GetDamage` at the feet (full to r/2, 0 at r, x 14) at the round's piercing | L459236-459256 |
| the part a fragment strikes | the first of `DAT_006508e0` = 0.3, 0.6, 0.7, 0.8, 0.9, 1.0 over a draw names `DAT_006508d0` = bytes 00 03 02 01 05 04: **head 30 %, body 30 %, left arm, right arm, left leg, right leg 10 % each** (was `FRAGMENT_PART_PLACEHOLDER`) | L459240-459252; `.data` |
| the push, stored | when fragments struck and `GetDamage` at the feet is over 0: the blast point, `dmg / 14`, `r` (`FUN_0057ed10`; stored for the player: its controller's `+0x34` is `FUN_00544200`, returning 0) | L459261-459281; `FUN_0057ed10` L441094-441127 |
| the push, applied | from the root (the origin plus the y of `actor+0x2e8` = `skel_root`, bound at L419606): inside the radius (or dead), `f = clamp(1 - len^2 / r^2)`; **prone: no push, the `Prone cover` action in place**; standing or crouched: `Fall forward` or `Fall backwards` (`FUN_005807d0`) and the velocity `min(100, f x (DAT_0044c250 / 98.1) x (dmg/14) x DAT_0044c254 / mass)` along the unit line, its y at least `50 f`; `DAT_0044c250` = 98.1, `DAT_0044c254` = 120 (L328368-328369), mass `actor+0xf84` = 90 (L419803) | `FUN_0057e770` L440940-441092 |
| the root's height | `skel_root` y at key 0 of `seal_stand` 11.48, `seal_crouch` 5.50, `seal_prone` 2.17 (`MOTION_P.ZAR`) | the clips |
| the knock's clips | on the ground in `Fall forward` / `Fall backwards`, `Land forward` / `Land backwards` (`FUN_005805b0`, via L441960-441985); at its end, alive, `Get up forward` / `Get up backwards` (L446653-446700); dead, state 8. The get-up leaves the SEAL standing whatever the stance: `FUN_00589aa0` pops the stack to its bottom (action 1, state 0) before it pushes the get-up (L446653-446677), and the get-up's pop writes `actor+0x174` from the top's state (`FUN_0028da00` L135104, vtable 0x406100 +0x14 = `FUN_0028dfb0`) -- stand (`mover.ts` `endAction`, review 2 m-1) | as cited; `animset.rdr` `Seal anim set`: `seal_fallforward01`, `seal_landforward01`, `seal_getupforward01`, `seal_fallbackwards01`, `seal_landbackwards01`, `seal_getupbackwards01` |
| the other throwables | the smoke (AN-M8): `Explosion_Damage` 0 -- nothing (not queued); the flashbang: reached without damage, the white-out (section 9.5) and the ringing, no fragments, no push -- the white-out only through this queue, past the line and the friendly-fire gate (P2, section 9.5: `FUN_005a5250`'s slot 0 from D:L459228 alone) | `FUN_005ac070` D:L464837-464840; `FUN_005a0e70` D:L459228; zweapon.rdr |
| camera shake, blur | the shake by distance is research 83's (kept); no blur or other screen effect in these functions | `FUN_005a0e70` |

For an M67 standing 20 units off: `f` from the root (11.48 up) is 0.976, the push 13.0 u/s away and **48.8 u/s up** --
the knock is mostly a hop (about 0.4 s in the air) and the fall clip, not a throw across the map.

**What the viewer does now** (`packages/viewer/src/net/blast.ts`, behind the shared sim; `packages/match/src/room.ts`
`blast`):
- `resolveBlast`: the reach, the line (the room's `segmentHit` to the head, as before), the factor, the ringing, the
  fragments on `fragmentPart`'s table, the knock. `blastKnock`: `FUN_0057e770` as above. `applyKnock`: lays it on a
  `Walker` (`Walker.knock` in `mover.ts`: off the ground at the velocity in the fall clip; the landing plays `Land
  forward` / `Land backwards`, then the get-up; `ACTION_CLIPS` and `SEAL_ANIMS` carry the four new clips, pinned to the
  disc's `motion.rdr`, `MOTION_P.ZAR` and `animset.rdr` by `test/locomotion.test.ts`).
- The room resolves each blast on every living SEAL (the thrower too; the thrower's team spared: friendly fire off,
  W3.R11), lays the knock on its own mover and sends the victim `blast` (the ring, the knock, the command it followed);
  the page's `NetClient` lays the same knock on its prediction (`WalkMode.knock`), and `NetPage` rings the ears
  (`../src/ringingEars.ts`: `.RINGING_EARS` played from the banks, the whole mix at 0.35 for 5 s, then faded back to full
  over `RING_FADE_SECONDS` = 5, `FUN_003410d0` L241137-241172).
- **Offline** the page now runs the same room in the page (`net/loopback.ts`, research 91 section 20): a grenade hurts,
  knocks and kills the player through exactly this path.

Tests: `test/netBlast.test.ts` (an M67 at 2, 5, 10, 20 units: 9-15 fragments of 140, dead; 50 and 100 units; the HE;
out of reach; the wall; the ringing; the knock's numbers and sides; prone), `test/knock.test.ts` (the mover's knock and
its clips, two movers agreeing), `match/test/roomBlast.test.ts` (a survivor knocked in the room, the thrower killed by
its own, the wall), `test/netDamage.test.ts` (the part table), `test/ringingEars.test.ts`.

### 12.1 Placeholders and readings (named in the code)

- `FLASH_FRIENDLY_FIRE_READING` (P2, 2026-11-02; `viewer/src/net/blast.ts`; research 101 s4): 'spared' -- friendly
  fire off, a teammate's flashbang whites out no one: the room's PF-22 gate (`ffRefuses`) for the flash as for any
  blast, the page and the bots following the room (`blast.flash`). Rests on research 179 s8.2's disassembly and call
  graph (`OnWeaponHit`'s gate before `FUN_005ab850` -> `FUN_005ac070`, the only filler of the queue the white-out is
  reached from; section 9.5). Owed: a two-console capture of a teammate's Mark141 with friendly fire off.
- `KNOCK_SIDE_READING`: which of the two fall clips -- the game puts the line through a VU0 matrix routine
  (`FUN_00306fd0`) on a stack copy of the actor's negated first row (L441044-441051) and takes `Fall backwards` for a
  positive third component; read as "pushed against the facing falls backwards".
- `PRONE_COVER_PLACEHOLDER` -- **retired 2026-10-05** (web sprint 28, PF-19): the clip is on the disc -- `GLOBAL` maps
  `Prone cover` (`DAT_003dece0`) to `guard_prone_cover` (research 179 §11.9); a living prone SEAL plays it in place and
  the others are sent it as an action code (`proneCover`, research 218 §3.2). Before: nothing played.
- `KNOCK_IN_MOVE_PLACEHOLDER` -- **retired 2026-10-05** (web sprint 28, PF-19; ruling PF.R38): `FUN_0057e770` has no
  state gate; the knock now releases the move, completes a pending swap and leaves a turret before the reaction
  (`KNOCK_LADDER_STATE_READING`, research 179 §11.7, 218 §3.1). Before: the viewer skipped the knock while a traversal
  move held the mover.
- `CORPSE_KNOCK_PLACEHOLDER` -- **retired 2026-09-29**: the game pushes the dead too (`FUN_0057e770` L440981: inside the radius *or dead*; state 8 at L441001; prone dead, `FUN_005a0950(actor, 3, 2)` L441013-441015), and so does the viewer now: `blastKnock(..., dead)` throws the SEAL the blast kills (the room sends the knock before the `kill`), the corpse lands in `Land forward` / `Land backwards` and stays down (`Walker.dead`), and a prone one plays the BODY list's prone death clip (`deathClip('blast', ...)`). Tests: `test/localDeath.test.ts`, `match/test/roomBlast.test.ts`.
- `KNOCK_REPLAY_PLACEHOLDER` -- **retired 2026-10-22**: the page replays from the mover it kept after command `after`
  (`WalkMode.replayKnock` / `rerunFrom`), the knock laid by `applyKnock` (`FUN_0057e770` D:L440981-441027) and the commands
  since run again. The same tick, and a command no longer kept, are still laid on arrival. Was: laid when the event came,
  the ticks between left to reconciliation.
- `RING_VOLUME_READING`: **retired 2026-10-24**. Research 202 sections 10–11 resolves group selection and the
  pre-square-law master curve. The implementation now leaves ring group 4, headset 7 and UI 14 untouched and keeps
  output volume/mute independent. The residual mixed-PCM quantization approximation has its own named reading there.
