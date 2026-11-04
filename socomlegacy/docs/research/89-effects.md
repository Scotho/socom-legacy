# 89 — The gunplay's effects: the zAnim effect commands, the casing, the particles, the impacts and the marks (2026-09-28)

The EFFECTS workstream of the walk mode (the owner: "1:1 feel of SOCOM 2"). Everything a round shows around the
rifle: the muzzle effect a weapon record names (`FireAnimName`), the ejected casing, the smoke, the bullet's impact
per surface and its mark. Read-only on the disc (`game/disc/RUN/`, the owner's extraction under `socomlegacy/public/maps/RUN`)
and on the decomp (`game/analysis/socom2_game.elf.decomp.c`, cited as `decomp <line>` with the `FUN_` address);
reCOM (`research/recom/src/gamez/zAnim/zanim.h`) for the structures' names. No game run. The disc bytes stay out of
the tree; `npx tsx tools/dump-effects.ts MP2 <animation> [--mission] [--decoded]` prints what this note reads.

## 0. The answers

- **The command numbers are the registration order** (§1). `FUN_0025bc20` (decomp 106863) registers the zAnim base
  set one command after another; a command's number in the data is its place, from 1: `IF` 2 … `OBJECT_MOTION` 21,
  `OBJECT_MOTION_FROM_TO` 22, `PARTICLE_SOURCE` 27, `SOUND` 30, `LIGHT` 32, `CALL_ANIMATION` 45, `STOP_SEQUENCE` 51;
  `VALVE` (61) comes from a later module. SOCOM 1's numbers (reCOM's `DATATYPE_*`) are not these.
- **The M4A1 SD's round** (§4): `muzzle_m4SD` calls `shell_eject` and `shell_smoke_med` -- no flash. The casing flies
  to the rifle's right and up at 18.6-26.1 units a second, falls at -98, tumbles, bounces on the hull by its
  material's coefficient with its material's sound (`.BUL_CASE_METAL` on metal …), and **vanishes at rest or at 1.2 s**.
  At most four casings at once take the bouncing flight (the `bullet_ejecting` valve); the rest fly 0.7 s through
  everything. In the aim view (`muzzle_m4SD_zoom`) the casing is `shell_eject_first_person`, **hidden** (it still
  bounces and sounds).
- **The smoke is switched off** (§3). `shell_smoke_med` -- the rifles' and pistols' muzzle smoke -- carries a whole
  particle configuration with flag A `0x1` set and `0x2` clear: "set the source's state to off". It never emits.
  The retail game draws no smoke from the M4A1 SD; the viewer draws none either. `shell_smoke_big` (the shotgun's) is on.
- **The M4A1's flash** (§4): `flash_fire_hider` shows the `muzzle_flash_hider` model at the muzzle along the barrel,
  turned about the barrel by one of eight angles, scaled from 0.1 to 0.9-1.3 over 0.05 s, gone a frame later; a
  dynamic light beside it. **No tracer** for the M4A1 SD: tracers are every fourth round of the SMGs, rifles and MGs,
  the suppressed ones excluded (§4).
- **The impacts are the map's** (§5). A bullet's hit plays `<HitAnimName>_<material>` -- `bullet_hit_metal_thick`,
  `bullet_hit_stone` … -- which live in each map's **`MZANIM.ZAR`** (only the glass ones are in `CZANIM`): sparks and a
  flame linger on metal, dust spurts and spinning chunks on stone, dirt and gravel, a splash and a ring on water, each
  with its sound (`.BUL_METAL`, `.BUL_STONE` …). No C code draws an impact.
- **The marks are per material with no default** (§5): the weapon's `DecalSet` row for the polygon's material, none
  when the material has no row (METAL_GRATE, GRAVEL, WATER, MUD, LEAVES …); square to the round, projected along it onto
  the surface, no turn; 150 kept, oldest recycled; no fade. A polygon whose material byte is 0 takes the map's
  `DefaultMaterial` (Frostfire `METAL_THICK`).
- **A mark is as dark as the wall under it** (§13). The game draws a mark with the world vertices' own colours: the GS
  modulates its texel by the wall's baked light. The viewer drew the bitmap bare (texel x 1.0) on walls lit at
  0.1-0.5 of unity, so its marks were light grey smudges, two to eight times lighter than the game's.

## 1. The zAnim command set

**Numbering** (`FUN_0025bc20`, decomp 106863-106924; `FUN_0026a8e0(0x414bb0, name, parser, begin, tick, end)`):

| # | name | begin / tick | # | name | begin / tick |
|---|---|---|---|---|---|
| 1 | QUAD_ALIGN | – / 0x2679e0 | 19 | OBJECT_ROTATE_STATE | – / 0x263730 |
| 2 | IF | – / 0x25e7a0 | 20 | OBJECT_AIM | 0x2634a0 / 0x2633a0 |
| 3 | ELSEIF | – / 0x25e6d0 | 21 | OBJECT_MOTION | 0x262690 / 0x261370 |
| 4 | ELSE | – / 0x25e6d0 | 22 | OBJECT_MOTION_FROM_TO | 0x25fe70 / 0x25f9b0 |
| 5 | ENDIF | – / 0x25e6a0 | 25 | OBJECT_OPACITY_FROM_TO | 0x25f960 / 0x25f880 |
| 9 | RANGE_TEST | – / 0x25de90 | 27 | PARTICLE_SOURCE | – / 0x266830 |
| 10 | RANDOM_WEIGHT | – / 0x25dcf0 | 30 | SOUND | – / 0x2659c0 |
| 11 | FAIL | – / 0x25dce0 | 32 | LIGHT | – / 0x264cb0 |
| 14 | LOOP | – / 0x25ede0 | 43 | EXPRESSION | – |
| 15 | WAIT | 0x25ed50 / 0x25ec50 | 45 | CALL_ANIMATION | 0x25d5c0 / 0x25d550 |
| 17 | OBJECT_ACTIVE_STATE | – / 0x263aa0 | 51 | STOP_SEQUENCE | – / 0x25d230 |
| 18 | OBJECT_TRANSLATE_STATE | – / 0x263890 | 61 | VALVE | – / 0x353d00 |

The full list is `ZANIM_COMMAND_NAMES` in `@s2u/scene`'s `effects.ts`. 59-60 are `RESET_BODY_PARTS` and
`BODY_FALL_ON_MATERIAL_SOUND` (`FUN_0059ac60`), 61-63 `VALVE`, `VBIT`, `VWATCH` (`FUN_00354470`, decomp 252347).

**Control flow.**
- `IF`/`ELSEIF` carry a u32 count, then their conditions as whole sub-commands.
- `RANDOM_WEIGHT` holds when `rand()·2⁻³¹ <= p` (the f32 at +4; decomp 107783). The flash's eight turns chain them at
  1/8, 1/7, 1/6, 1/5, 1/4: each branch one eighth.
- `RANGE_TEST` compares the squared distance between two points against +0x24 (flags 0x40-0x800 pick the
  comparison, 0x100 "farther than"; decomp 107820). The whole decode (0x40 `<`, 0x80 `<=`, 0x100 `>`, 0x200 `>=`, 0x400
  `==`, 0x800 `!=`; the points by 0x01-0x20) and `bullet_hit_person`'s close and far blood: research 238 §8 (2026-10-07).
- `VALVE` (tick `FUN_00353fd0`, decomp 252128): a valve reference (+4; flag 2 at +13 makes it a name index), an
  operand (+8) and an operation (+12): 0 true, 1 !=, 2 ==, 3 >, 4 <, 5 >=, 6 <=, 0x0b set, 0x0c add, 0x0d subtract
  (floored at 0), 0x0e multiply.
- `WAIT` (begin `FUN_0025ed50`): seconds in the f32 at +8, or frames with flag 0x10; flag 0x20 adds a random range.
- `LOOP` (`FUN_0025ede0`): back to the sequence's start until a count (flag 1; -1 never) or a time (flag 2).
- `FAIL` returns 0 from its tick, which stops the animation.
- A sequence's word (`_zsequence`): bits 1-7 its activation. 1 runs at the start. 2 is the activation gate
  `Anim_Params`' second offset names (`FUN_002734b0`, decomp 120743): `shell_eject`'s is "if the camera is more than
  100 units from the caller, FAIL", so no casing is thrown out of sight.

**The context** (`FUN_00272bb0`, typed arguments; `FUN_00272720` reads them):
- Type 3 is the caller's node: the commands' node byte 0xFA (-6). 0xF9 (-7) is the animation's own instance (its root
  model, copied per play: `create_instance`, `Anim_Params` flags bit 7).
- Type 5 is a position, 6 a velocity, 7 a direction.
- The round's muzzle animation (`FUN_005c5340`, decomp 479430-479480) gets
  `(3, the weapon's node, 5, firepoint+0x30, 6, the fire direction)`. `firepoint+0x30` is the firepoint's place in the
  weapon: `OBJECT_TRANSLATE_STATE` with flag 2 adds it and carries it through the reference node's matrix
  (`FUN_00310980`), which puts the flash at the muzzle.
- A hit (`FUN_003c8920`, decomp 319339) gets `(5, the hit, 7, the surface normal, 6, the round's velocity)`.

**Node state.**
- `OBJECT_ACTIVE_STATE` (+4 u16 1 shows, else hides; node u16 +6).
- `OBJECT_TRANSLATE_STATE` / `OBJECT_ROTATE_STATE`: node +6, reference node +7 (whose world place or rotation the node
  takes), flags +4 (1 set, 2 add, 4 keep), xyz or euler at +8.
- `OBJECT_MOTION_FROM_TO` as the flashes use it (flags 0x300): the time at +0x34, from at +0x38, to at +0x44, the rate
  at +0x50. On all three of `flash_fire_hider`'s the rate is exactly (to − from) / time, which pins the reading.
- `LIGHT`: an RGB in 0..255 at +0x20 and a radius at +0x2c (`zoom_flash_fire`'s muzzle light: 204, 173, 120; 51.2).
- `CALL_ANIMATION`: the name index in the byte at +7.
- `SOUND`: the name index in the u16 at +6 (research 81 §6).

## 2. `OBJECT_MOTION` (21): the thrown node

Begin `FUN_00262690` (decomp 110463), tick `FUN_00261370` (decomp 109820). Offsets from the command's start.

| Off | Type | Meaning |
|---|---|---|
| +4 | u32 | flags (below) |
| +8 | u8 | the node moved (0xF9 the instance, 0xFA the caller) |
| +9 | u8 | the launch frame's node; 0 the world |
| +0xa / +0xb | u8 | a sequence / sound name index for a bounce whose material names none |
| +0xc | f32 | the impact speed at full volume (0: always full) |
| +0x10 | f32 | gravity scale, times the main gravity (-98: `Anim_Main_Params`, 77 §9) |
| +0x14 | f32 | the terminal-velocity k (flag 0x2) |
| +0x18 | f32 | times the caller's velocity (type 6, flag 0x800) |
| +0x1d / +0x1e | s8 / s16 | the material table's count and self-relative offset (12 bytes an entry) |
| +0x20 / +0x22 | s16 | block A `[azimuth°, zenith°, speed, accel]`, block B their random ranges |
| +0x60 | f32 | the default bounce coefficient |
| +0x64 | f32 | the ground tolerance, a fraction of the object's height |
| +0x74 / +0x76 / +0x78 / +0x7a | s16 | the tumble block, the angular velocity block, the scale-rate block, an extra random block |
| +0x7c | f32 | lifetime, seconds (flag 0x1) |

Flags: 0x1 lifetime, 0x2 terminal velocity, 0x8 fixed launch, 0x10 random launch, 0x20 impact sound, 0x40 floor probe,
0x80 swept line probe, 0x100 angular velocity, 0x200 roll, 0x400 tumble, 0x800 add the caller's velocity, 0x1000 /
0x2000 the direction from the caller's type 7 / 6.

**The launch.**
- The direction is `FUN_0025cb00` (decomp 107097): `(−sin az·(1−|e|), e, −cos az·(1−|e|))` with `e = zenith/90`,
  **not normalised**.
- The velocity is that direction times the speed, rotated into the frame node's world matrix, plus the caller's
  velocity times +0x18.
- A material entry is a u32 code, then the reference speed at +4 and the bounce coefficient at +8. The code: bit 0
  uses the reference speed, bit 1 the bounce coefficient; bits 2-9 the material, bits 10-17 the sound's name index,
  bits 18-25 a sequence's. The first match wins.

**The tick.**
- The step is explicit Euler: the position moves `v·dt`, then `v += a·dt`. While falling with flag 0x2, `v.y`'s step
  is scaled by the terminal table `1 − (e^(x) − 1)/(e^10 − 1)`, `x = 0.25·clamp(int(40·v.y·k), 0, 40)`.
- The line probe (flag 0x80, used rising or moving mostly sideways) reflects `v` about the normal and scales it by the
  coefficient `e`.
- The floor probe (0x40, falling) reflects `v` and scales it by `1 − (1 − e)|v̂·n|`, then sets `a.y` back to gravity.
- Each bounce plays the entry's sound (flag 0x20) at volume `min(1, speed/ref)`, full when the reference is 0.
- The command is done when the lifetime runs out, when a bounce leaves the speed under `0.08·|a|` (7.84 at -98), or
  when the object is found below the floor.
- Tumble (0x400): the euler angles (from 0: the rotation the sequence copied from the caller is overwritten) gain
  `dt·rate·(n̂z, 0, −n̂x)`, and the rate gains its acceleration.

**`shell_eject`** (both flights; `effects.test.ts` pins them):

| | the full flight (flags 0x0cf3) | the cheap flight (flags 0x0c13) |
|---|---|---|
| launch | az 170-190°, zenith 30°, speed 25-35 in the caller's frame | the same |
| gravity | 1 × -98 | the same |
| terminal k | -1/980 | the same |
| bounce | 0.30 default; the table below | none: no probes |
| lifetime | 1.2 s | 0.7 s |
| tumble | 30°/s, -5°/s² | the same |

The full flight's material table:

| material | sound | coefficient |
|---|---|---|
| 25-26 metal | `.BUL_CASE_METAL` | 0.35 |
| 7 stone, 22 asphalt | `.BUL_CAS_STONE` | 0.25 |
| 4 grass | `.BUL_CAS_DIRT` | 0.10 |
| 8 dirt | `.BUL_CAS_DIRT` | 0.15 |
| 5 sand | `.BUL_CAS_SAND` | 0.15 |
| 19-20 wood | `.BUL_CAS_WOOD` | 0.27 |

Its sequence: `bullet_ejecting += 1`; show the instance; place and turn it at the caller; if `bullet_ejecting < 5`
the full flight, else the cheap one; `bullet_ejecting -= 1`; hide the instance. So the casing is gone the moment it
stops. The casing model is `EFFE_GEO`'s `bullet_shell_9m`, 0.45 units long (4.5 cm at ten units to the metre),
`shell_gold.tif`. `shell_eject_first_person` (the aim view's) launches at zenith 50° ±20° at 15-20 a second for
0.75 s, and shows nothing: its `OBJECT_ACTIVE_STATE` is 0 at both ends.

## 3. `PARTICLE_SOURCE` (27): the emitters

Tick `FUN_00266830` (decomp 112759); the manager: `FUN_00329b40` emission (226782), `FUN_00327cd0` spawn,
`FUN_003282b0` step, `FUN_003251b0` sprite draw (223925), `FUN_00326350` streak draw (224624). Every field is an
override applied when its bit of flags A (+4) is set; the source's defaults are `FUN_0032ab20`'s (227362).

**Fields.**

| Off | Flag | Meaning |
|---|---|---|
| +0x0c | – | the source's name index (one source per animation and name, `FUN_0026ea20`) |
| +0x0d | A 0x10 / 0x20 | its node (0xFA the caller); 0x10 follows the node, 0x20 adds its origin |
| +0x0e | A 0x10000 | particles per emission event |
| +0x10-0x12 | – | the counts of textures, colour keys, scale keys |
| +0x13 | – | type (low nibble): 0 sprite, 1 rotated, 2 xz, 3 streaked, 4 unchanged |
| +0x14 | A 0x4 | position offset |
| +0x20 | A 0x40 / B | the base velocity in the node's frame; or its f32 scales a context vector (B 0x2 the normal; B 0x40 the velocity; B 0x100 that reflected about the normal; B 0x400 the velocity made a unit) |
| +0x2c | A 0x80 / B | a world velocity, the same with B 0x4 / 0x80 / 0x200 / 0x800 |
| +0x38-0x4c | A 0x100-0x400 | the random velocity box per axis (world; local with B 0x80000) |
| +0x50-0x64 | A 0x800-0x2000 | the random spawn box per axis |
| +0x80 | A 0x8000 / 0x4000 | the emission interval, per second / per unit moved |
| +0x84 | A 0x20000 | acceleration |
| +0x90 | A 0x40000 | friction k |
| +0x9c / +0xa4 / +0xac | A 0x100000 / 0x200000 / 0x400000 | the size (a half-width, units), the starting age, the lifetime (s): min, max |
| +0xb4 / +0xbc | A 0x800000 / 0x1000000 | the near and far fades (distances; compared squared) |
| +0xc4 | B 0x8 | offset of a random position block (base xyz, range xyz) |
| +0xc6 | B 0x1 | the emission events allowed (-1 unlimited) |
| +0xc8 | A 0x4000000 / 0x8000000 | offset of the texture list (`u16` name, f32 t): one at random, or stepped through the life |
| +0xca | A 0x10000000 | offset of the colour keys (t, r, g, b, a) |
| +0xcc | A 0x20000000 | offset of the scale keys (t, multiplier) |
| +0xd0 | type 3 | offset of the streak's two numbers (default 1.0, 0.3) |

Flag A 0x1 sets the source active to A 0x2 (`FUN_00329ac0`); A 0x8 places it at the context's position (type 5).

**Running.**
- The first tick after activation records the source's place and emits nothing.
- Then an accumulator counts events (`int(acc × rate)`), each of `perEvent` particles spread over the frame, until
  the events allowed are spent or the animation ends.
- A particle's size, lifetime and starting age are drawn from their ranges. Its velocity is `Node·base + world +
  U(box)`.
- Each tick: `pos += v·dt`, then `v += a·dt`, then the friction `v = w + (v − w)/P(k·dt)`, where
  `P(x) = 1 + x/2 + x²/3 + … + x⁶`, halved and squared back (about `e^(−k dt/2)`); `w` is the wind, 0 here. It dies at
  its lifetime.

**Drawing.**
- A particle is a GS **sprite**: a screen-aligned square `2·size·scale(t)` across (PRIM 0x0F6, decomp 224013).
- Its colour keys times 128 are the vertex colour, so `MODULATE` leaves the texel at 1.0 and the alpha may go over 1.
  With no keys it is white with alpha `1 − t`.
- The alpha is times the camera fade, linear in d² across the far pair. The particles draw back to front, depth-tested
  with no depth write.
- The blend is the texture's own bind packet: `cloudpuff01.tif` and `effect_dustpuff01.tif` source alpha,
  `effect_spark01.tif`, `explosion2.tif` and `effect_muzzle01.tif` additive.
- A streaked particle (type 3) is a band from where it was a tick ago to where it is. The head is pushed `size` on,
  the tail `size × streak[0]` back, and the tail's alpha is times `streak[1]`. The metal sparks' streak is 10 and 0.7.

**`shell_smoke_med`**: `IF RANDOM_WEIGHT(0.5)`, then source `blue_smoke01` with flags A `0x37ffbfd1`, then `WAIT
0.25`. Bit 1 set with bit 2 clear switches it off (decomp 112833-112838). The configuration it would have run is two
puffs of `cloudpuff01.tif`: 60 units a second along the caller's +x, 0.5-1 s, grey-blue 0.4/0.4/0.5, a half-width of
2-3 growing ×20, out to a 40-60 unit cloud. It looks abandoned. `shell_smoke_big` (the shotgun's `muzzle_shotgun`) is
the same role switched on: `effect_dustpuff01.tif` every 0.03 s for 0.2 s, 1 s each, rising at 20.

## 4. The muzzle and the tracer

**The muzzle effect.** `FUN_005c5340` (decomp 479059, gated on `DAT_003e1538`) plays the weapon's `FireAnimName` per
round, or `<name>_zoom` when the view mode `char+0x200` is above 0 (the aim view; the names are built by
`FUN_003c4700` with `%s_zoom`, and a turret's `%s_zoom_TT`). The M4A1 family:

| animation | calls |
|---|---|
| `muzzle_m4SD` | `shell_eject`, `shell_smoke_med` |
| `muzzle_m4SD_zoom` | `zoom_fire_silent` (= `shell_eject_first_person`), `shell_smoke_med` |
| `muzzle_m4` | `shell_eject`, `flash_fire_hider`, `shell_smoke_med` |
| `muzzle_m4_zoom` | `zoom_flash_fire` (a `LIGHT`), `shell_smoke_med` |

**`flash_fire_hider`** runs four sequences side by side:
- `fire_fix` holds the instance at the caller, turned as the weapon and shown, once a tick (a `LOOP` forever).
- `fire_rotate` turns the `rotate` node about the barrel by ±45°, ±22.5°, 77.5° or 0 (the chained random weights).
- `fire_scale` scales the `scale` node from 0.1 to 1.2, 0.9 or 1.3 (weights 0.33, 0.5, the rest) over 0.05 s, waits
  one frame, stops `fire_fix` and hides the instance.
- `light_at_muzzle` lights the muzzle.

The model, `EFFE_GEO`'s `muzzle_flash_hider`, is five `effect_muzzle01.tif` quads (additive), 6.16 units along +x: an
end-on star and four fins.

**The tracer.**
- The tracer weapons are the SMGs (ids 31-50), assault rifles (51-80), MGs (91-100), heavy (141-144) and turrets
  (205-229) (`FUN_003cb1a0`, decomp 320657).
- The suppressed ids 16, 33, **62 (M4A1 SD)**, 67 and 105 are excluded (`FUN_003c5ac0`, 317147).
- Of the tracer weapons, a round draws one when the shooter's round count is a multiple of 4 (`FUN_003cabe0`, 320545).
- The tracer flies from the muzzle to the hit, accelerating: 400/s², pool 100 (`FUN_003d5030`, 327160).

## 5. The impacts and the marks

**The hit path.**
- `FUN_003c9b70` (decomp 319920) walks a round's hits nearest first. It skips the shooter's own nodes and the materials
  whose `PENETRATION` is 1.0 (ACTION, INVISIBLE_DI, ITEM, the `*_VOL`s), whose hits pass without effect or mark.
- `FUN_003c8920` takes each remaining hit:
  - beyond the remaining range the round stops;
  - the node's damage callback runs;
  - **the mark** (`FUN_003d0ba0`, decomp 323789);
  - an AI noise;
  - **the impact**: the weapon's hit animation for the material, played at the hit with the normal and the round's
    velocity (gated on `DAT_003e1540`, 1 on the disc);
  - the penetration: the range shrinks by the material's `PENETRATION`, and a round through glass goes on to the wall
    behind.
- `RICOCHET` is read and never used; nothing on the disc makes a ricochet.

**The names** (`FUN_003c4700`, decomp 316255): `sprintf("%s_%s", HitAnimName, material)` for every material, looked
up without regard to case in every animation set (`FUN_0026a250`). Every gun's `HitAnimName` is `bullet_hit`
(`zweapon.rdr`), so the M4A1 SD's hits are the map's `bullet_hit_<material>`.

**The mark.**
- The weapon's `DecalSet` (`BULLET_MARK_SMALL`) row for the raw material index; a row without a texture is no mark.
  There is **no default**.
- The size is `min + rand·(max − min)` units across.
- The square is square to the round's direction, its up the world axis least aligned with the normal
  (`FUN_00307810`, decomp 206429): **no random turn**. It is projected along the round onto the surface and clipped
  to the triangles facing the round.
- It goes to the temporary pool: `TEMP_DECAL_POOL` base 150, overflow 50, trimmed back to 150 oldest-first each frame
  (`FUN_003bf110`). A set flagged `PERMENANT` (the grenade's blast) goes to the permanent one. No timed fade was found.
- The permanent pool is `PERM_DECAL_POOL` base 30, overflow 0 (`decals.rdr`; read into `0x4b5050`, decomp
  324141-324148). `FUN_003b3800` takes one entry per kept world triangle (306401-306417); `FUN_003bf1a0` refuses once
  the count reaches base + overflow (313254-313262); `FUN_003bf110` trims the temporary pool only (218207, 219048,
  236776) and `FUN_003bf050` empties both at the level's teardown (`FUN_0031af70` 218218-218219) and at each MP
  round's end (CMPExitState `FUN_00223970` L76084 -> `FUN_0031c880` 219059-219060). The page clears both (`newRound`,
  `netPage.ts`) on the next `roundStart`, under the round screens, and on `abandoned` (protocol 7: an abandoned round
  leaves the level in the original, so the waiting room starts clean). So a round keeps its first 30 scorch
  triangles, the one that only partly fits partly drawn, and refuses the rest; nothing is recycled
  (`PERM_DECAL_TRIANGLES`, `viewer/test/grenadeScorchPool.test.ts`). [Reading, the viewer's: a scorch with nothing
  drawn under it yet stands in as the bare square and charges the pool its **2** entries (`grenade.ts`
  `squareEntries`) until the late clip (`clipLate`) swaps them for the clipped count; the game would take no entry for
  a mark over no triangle. The candidates' order in the clip is the viewer's walk, not the game's list.]
- Its colour is the colour of the world vertices it is clipped to, per vertex (§13).

**The material table** (SOILS index = the polygon's `material` byte, research 81 §4; 0 takes the map's
`DefaultMaterial` from `READERM.ZAR/<map>.rdr`'s `world_params` -- `FUN_002dc1d0` reads `DAT_0044f310`,
`FUN_002ddc30` sets it at the load, decomp 152110):

| # | material | mark (BULLET_MARK_SMALL) | impact | its sound | its particles |
|---|---|---|---|---|---|
| 4 | GRASS | sand 1-1.5 | bullet_hit_grass | .BUL_GRASS | firepuff, spinning grass, grass spurts |
| 5 | SAND | sand 1-1.5 | bullet_hit_sand | .BUL_SAND | firepuff, droplets, vapour, streak |
| 6 | MUD | -- | bullet_hit_mud | .BUL_MUD | firepuff, dirt pieces, streaks |
| 7 | STONE | stone 1-1.8 | bullet_hit_stone | .BUL_STONE | firepuff, sparks, spinning rocks ×3, dust spurts |
| 8 | DIRT | sand 1-1.5 | bullet_hit_dirt | .BUL_DIRT | firepuff, dirt pieces, dirt spurts, streaks |
| 9-10, 44-45 | GLASS … | glass 1.1-1.3 | bullet_hit_glass (CZANIM) | .BUL_GLASS | -- |
| 11 | WATER | -- | bullet_hit_water | .BUL_WATER | droplets, vapour, streak, the ripple |
| 13 | PERSON | blood 2-3 | bullet_hit_person | .BUL_INTO_BODY | red flashes and streaks |
| 15 | LEAVES | -- | bullet_hit_leaves | .BUL_LEAVES | grass pieces and spurts |
| 16 | ICE | glass 1.8-3.3 | bullet_hit_ice | .BUL_ICE | ice spurts |
| 17 | SNOW | sand 1-1.8 | bullet_hit_snow | .BUL_SNOW | firepuff, dirt pieces and spurts |
| 18 | GRAVEL | -- | bullet_hit_gravel | .BUL_GRAVEL | as stone |
| 19 / 20 | WOOD_THICK / THIN | wood 2-3.4 | bullet_hit_wood_* | .BUL_WOOD_L_SPL / .BUL_WOOD_SMALL | firepuff, puff, pieces, dirt spurts |
| 21 | RUBBER | -- | bullet_hit_rubber | .BUL_RUBBER | sand spurts |
| 22 | ASPHALT | stone 0.75-1.5 | bullet_hit_asphalt → stone | .BUL_STONE | as stone |
| 23 | LEAFY_TREE | -- | bullet_hit_leafy_tree | .BUL_LEAVES | pieces, grass |
| 25 / 26 | METAL_THICK / THIN | metal 0.75-1.8 | bullet_hit_metal_* | .BUL_METAL / .BUL_TIN | firepuff, sparks ×2-3 (streaked), flame linger |
| 30 | FABRIC_HEAVY | metal 0.75-1.2 | bullet_hit_fabric_heavy | .BUL_FABRIC | blue_smoke01 |
| 31 / 32 | PIPE_STEAM / GASTANK | metal 1.2-1.7 | bullet_hit_pipe_steam / gastank | .BUL_BARREL | steam / gas squirt |
| 35 | THATCH | -- | bullet_hit_thatch | .BUL_WOOD_L_SPL | firepuff, puff, pieces |
| 37 | LEATHER | metal 0.75-1.2 | bullet_hit_leather | .BUL_WOOD_SMALL | puff, pieces |
| 38 | BARREL | metal 0.75-1.8 | bullet_hit_barrel | .BUL_BARREL | as metal |
| 39 / 40 | PLASTER / CARPET | wood 1.2-2.2 / sand 1-1.8 | bullet_hit_plaster / carpet → stone | .BUL_PLASTER + .BUL_STONE | as stone |
| 12, 14, 24, 27-29, 34, 36 | UNDERWATER, BROKEN GLASS, SNOWY_TREE, METAL_RAILING, METAL_GRATE(_THIN), CAMO_NET, CHAINLINK_FENCE | -- | -- | -- | nothing |

The metal, stone, dirt and grass impacts carry a leading `lensfx == 5` gate (the NVG view) for an `NVGPUFF` sprite.
The flash they open with (`fire_flash`: `firepuff`, `explosion2.tif`) is additive.

## 6. In the viewer

- **`@s2u/scene`**:
  - `effects.ts`: the numbering, `decodeEffectProgram` (every command of an animation to an `EffectOp`),
    `decalSetRows`, `tracerRound`;
  - `effectMotion.ts`: `decodeObjectMotion`, `launchMotion`, `stepMotion`, the terminal table;
  - `effectParticles.ts`: `decodeParticleSource`, the keys, the fade, the friction, the context velocities;
  - `effectModels.ts`: the `EFFE_GEO`/`EFFE_MDL` models, each chunk in the position form whose vertices fill its
    node's box -- the casings in the weapons' `0x70` form, the flat quads in the world's `0x68` form;
  - `zanim.ts`: each command now carries its bytes.
- **The viewer**:
  - `effectData.ts` (the worker): both zAnim archives' programs, the effect models, the `EFFE`/`ALPH` textures with
    their GS state, the SOILS names, the `DefaultMaterial`, the `BULLET_MARK_SMALL` rows, the `HitAnimName`s;
  - `effectRunner.ts`: the sequencer (§1's control flow);
  - `effects.ts`: `Effects` -- `onRound`, `play(name, place)`, `marks()`, the casings' flight on the walk's hull;
  - `particles.ts`: the particle manager;
  - `effectMaterials.ts`: the GS arithmetic, `(texel × vertex) clamped × (1 + FIX/128)`, blended by the texture's
    packet.
  - `fire.ts` takes the per-material marks (`setMarks`: the row, the projected square, 150 kept) and the tracer rule
    (`setTracerRule`: none for the M4A1 SD). `main.ts` wires `Fire.subscribe` to `effects.onRound`.
- **The grenades' door**: `effects.play(name, { node?, position?, velocity?, normal? })` runs any animation of the
  map's zAnim archives -- `frag_grenade_stone`, `he_grenade`, `grenade_hit_snow`, `dust_explode_med` -- and answers
  false for a name the map lacks. `impactAnimation(hitAnim, material)` builds the per-material name, and
  `effects.materialName(byte)` resolves a polygon's byte (0 → `DefaultMaterial`).
- **Readings and placeholders**:
  - `MARK_GRAZE_FLOOR` (0.2) bounds a slanting mark's stretch where the game clips to the polygon.
  - The casing's floor probe is the walk's segment test straight down, standing in for `FUN_002a2eb0`'s terrain query.
  - `LIGHT` is drawn as the engine's second pass over the lit world (§10); the body is not re-drawn.
  - The zoom mode is read as the first-person view.
  - The rotated (1) and flat (2) particle types are drawn as the engine draws them (§11).
  - A tracer, where one is due and the map holds the kind's zAnim (`tracer_ally_anim` / `tracer_enemy_anim`, §19), is
    that zAnim on an object the flight carries from a little down the shot toward its end; no model is drawn for it.
    Without the zAnim, `Fire` still draws the one-frame line.

## 7. Verification

- `scene/test/effects.test.ts`: the numbering; the small commands from their bytes; the launch direction, the terminal
  table, a casing's flight and bounces on a synthetic floor; the keys, fades, friction and context velocities; the
  tracer rule. On Frostfire's archives: the M4A1 family's calls, `shell_eject`'s every number and table,
  `shell_smoke_med` switched off, the metal sparks' streak.
- `scene/test/effectModels.test.ts`: the form choice (a collapsed point fills nothing), the casing 0.45 long, the
  flash hider's five quads.
- `viewer/test/effectRunner.test.ts`: branches, nesting, waits, loops, timed commands, `FAIL`.
- `viewer/test/effects.test.ts`: on the game's data end to end. A round's casing goes right and up, bounces on a
  metal deck with `.BUL_CASE_METAL` and is gone by 1.2 s. The smoke emits nothing. The flash is at the muzzle along
  the barrel and hides. `bullet_hit_metal_thick` and `BULLET_HIT_STONE` (any case) emit with their sounds.
- `scene/test/tracerFlight.test.ts`: the launch (none under 70 units, the start roll, speed 0, the range) and the
  flight a game frame at a time (`dt x 400`, steps of `speed + 1`, the snap at the end, the retirement past the range,
  the steer back from a start past the end); the anims by kind (§19).
- `viewer/test/tracers.test.ts`: the zAnim launched only where the map holds it (the model never drawn), the start,
  the stepping at whole game frames, one frame at the end, a full pool launching none, the default range, `tracerhold`,
  and the round's weapon range in world units against the disc's M4A1 record. No disc data beyond the pinned records.
  `viewer/test/turretTracerCount.test.ts`: the mount's count runs across pulls.
- `viewer/test/fire.test.ts`: the pool of 150; the one-frame line, and none when the effects take the streak.
- `e2e/effects.spec.ts` (Playwright, `?redotcom`, walk mode):
  - Frostfire at spawn A: a casing in the air, a burst's casings bouncing and gone, the sparks and the metal marks on
    the container (`test-fixtures/screens/effects/frostfire-*.png`).
  - Desert Glory at spawn A: the stone wall's dust, sparks and grey marks against the sand's puff and mark, and the
    M4A1's flash held for its picture (`desert-glory-*.png`).

## 8. Open

- The tracer (§19): the roll of its object about the shot (`TRACER_ORIENTATION_READING`), whether a retired tracer's
  follow source still emits (`TRACER_RETIRED_ANIM_READING`), and whether another console sees the shooter's round
  number (`TRACER_REMOTE_COUNT_READING`). `redpuffs` is the particle source inside `tracer_ally_anim` and
  `tracer_enemy_anim`; whether a followed source's particles scale with its object's 7.5 is unread.
- Whether a mark's or a footprint's 100.0 lifetime is ever counted down.
- The body (skinned) under a light's pass; the lit visuals' own gate (visual flags 0x4000 and 0x10).
- A `WHILE` with conditions (only the endless form is on the effects' path).
- Why the owner's 2026-10-07 Desert Glory session drew its particles without their bitmaps (§17): not reproduced.
- A source with neither texture flag (A 0x4000000, 0x8000000): whether its particle holds the first bitmap at the
  spawn or asks `FUN_00328a50` each frame (the viewer keeps the first).
- Closed since: the round's own path. `Fire` walks it with `round.ts` `roundPath` (research 84 section 13, the walk the
  match server re-runs): the `PENETRATION` 1.0 materials passed over, a second surface struck when the piercing beats
  the first.

## 9. The grenades' explosions and bounces (round two)

- **The explosion** runs the material's variant, `frag_grenade_<material>`: its own 0.05 s puff, then a call to
  `frag_grenade`. That fires the parts: `FRAG_sparks` (a bare root node thrown by a fixed launch with streaked sparks
  hung on it), `dust_explode_long`, `light_flash_large` (§10), `bsmoke_explode_large`, `dust_ground_roll` and
  `.GREN_MED`. The HE runs `HE_grenade`.
- The grenade's page (`grenade.ts`) emits `explode` and `bounce`. `main.ts` plays their `anim` through `effects.play`
  with a node at the point; the `EXPLOSION_READING` sprites stay only for a map without effect data.
- **`OBJECT_MOTION`'s fixed launch** (flag 0x8, decomp 110654-110911) is block A's speed and pull along the stored
  direction at +0x54. That direction is `FUN_0025cb00` of the block's angles: `FRAG_sparks`' (0, 0.556, -0.444) is
  azimuth 0, zenith 50, pulled at -200 against it.
- An animation rooted at no model still has an instance node (`NODE_ROOT`), which the viewer makes empty. A particle
  source with flag A 0x10 follows its node every tick.

## 10. The lights (`LIGHT`, 32; tick `FUN_00264cb0`, decomp 111906-112214)

**The fields.**

| Off | Flag | Meaning |
|---|---|---|
| +4 | – | flags (u16) |
| +6 | – | the light's node |
| +8 | 0x2 | the node it sits at (0xFA the caller) |
| – | 0x8 | at the context's position |
| +9 | 0x100 | the GS ALPHA selector (default 0x44) |
| +0xc / +0x10 | 0x10 | a static min/max range |
| +0x14 | 0x4 | an offset |
| +0x20 | 0x40 | RGB, 0..255 |
| +0x2c | 0x80 | the pass's opacity, over 128 (default 64); **not a radius** |
| +0x34 / +0x36 | 0x20 | the count and offset of `(t, min, max)` keys, linear, the last held |
| +0x3c | – | the command's length |
| – | 0x400 | on the world's light list |

**The lights on the disc.**

| Light | Colour | Blend | Ranges |
|---|---|---|---|
| `light_flash_large` (frag) | 214, 242, 217 | 0x48, additive | 100/190 shrinking to nothing at 0.5 s |
| `HE_light_flash_large` | 230, 217, 166 | additive | to nothing at 0.7 s |
| `zoom_flash_fire` (a muzzle, at the caller) | 204, 173, 120 | 0x44 | 5/12 -> 15/60 -> 0 in 0.1 s |
| `flash_fire_hider`'s `light_at_muzzle` | the same | 0x44 | 6/26 -> 50/100 |

The M4A1 SD's own muzzle has none.

**How the engine draws a light.** It does not light the vertex colours. It draws a **second pass of every lit
visual in reach**, world, characters and weapons alike:
- `FUN_00339660` gives a node the lights whose sphere meets its own, at most six. `FUN_003b5b90` emits VU1 command
  0x3a once a light.
- The handler at 0x23d8 re-draws the triangles with `light_map.tif` (`EFFE_TXR`: white, alpha 0.94 at the centre
  to 0 at the rim) projected on the surface.
- `L = light - P`, `h = max(L.N, 0)`, `f = 0.5 clamp((max - h)/(max - min))`, `gate = min(h, 1)`, and
  `uv = 0.5 + (L.T, L.B)/max`: a spot `max/2` in radius under the light.
- The colour is `min(1, 2 rgb/255 f)` and the alpha `At opacity f gate / 128`. The blend is the light's:
  `dst += Cs As` for the explosions.
- None of the grenade or muzzle animations uses `BLUR3D`, `IRIS_EFFECT` or `TRUE_COLOR_SCALE`. The flashbang's
  blinding is code (`FUN_00597c00`).

**The viewer** (`effectLights.ts`) draws the pass as overlays sharing the world's, the held weapon's and the SEAL's
geometry (the body on its own skeleton), per fragment, with the face's normal. The overlays are pooled (§12).

## 11. Particle types, water, footprints, sounds, the pre-warm

**Particle types.**
- **Rotated** (type 1, `FUN_00325580`): a screen square turned by its angle, its half-diagonal the size.
  - Its corner i is at `C + size (cos(t + i pi/2) right + sin(t + i pi/2) down)`.
  - The angle is spun by the source's spin block (+0xce: spin and acceleration min/max). The spin is stopped where it
    would change sign.
  - The starting angle is the pool slot's stale one, random here.
  - The fire, smoke and explosion dust, and the dirt, stone and wood impacts, are this type.
- **Flat** (type 2, `FUN_00325cc0`): a square in the world XZ plane at the particle's height, `2 size` across, u along
  +z. The ripples, the splash's rings and `bullet_hit_water`'s ring are this type.
- **`WHILE`/`END_WHILE`** (39/40): the ripples loop forever until the engine stops them.

**Water** (`FUN_005b52b0`, decomp 469808-469920). The SEAL's ground probe calls it over LIQUID water:
- With the water line across the body, `big_ripple_anim[_walk|_run]` plays by speed class (`|v|^2` at 0.25 and 400).
  With it up to 10 over the top, `small_ripple_anim*`.
- The ripples play on a node moved each frame to the water under the SEAL.
- The first frame in the water in the air plays `seal_fall_in_water` at the water point: the traversal's `waterLand`.
- Walking into water splashes nothing.
- A round on water is `bullet_hit_water` (its flat `theripple`), nothing special.
- The viewer stops the ripples when the SEAL leaves the water. The game's loops ran on where they were: its call
  comes only over water.

**Footfalls.**
- `FUN_005a49f0` looks up `seal_footfall_<MATERIAL>` for every material. **None exists on any map**, so a footfall
  plays no effect.
- `FUN_005a3280` (decomp 460186) prints `decals.rdr`'s `FOOTSTEP_DECALS` (SAND `stamp_footprint01.tif`, SNOW
  `stamp_footprint_snow.tif`) at each footfall, not prone. It is 3.5 across, flat along the ground's normal, and runs
  along the SEAL's forward, in the temporary pool.

**Sounds.** The game resolves a sound by its name's CRC among the loaded banks' sounds: a binary search over one sorted
table (`FUN_00344f30` -> `FUN_00344bf0`), with no fallback bank and no alias. So two effect sounds are silent on the
console. The viewer departs from it deliberately (`SOUND_NAME_FIXES`, `SOUND_FALLBACKS`, `soundFor` in
`@s2u/sound`'s `catalog.ts`, for every path: §12):
- The casings' metal bounce is named `.BUL_CASE_METAL` in `shell_eject`, `shell_eject_60` and
  `shell_eject_first_person`. No bank and no `sounds.rdr` entry carries it, while `.BUL_CAS_METAL` sits in 16 banks,
  Frostfire's among them. The viewer plays the latter.
- Grass and dirt casings ask for `.BUL_CAS_DIRT`, which Blood Lake's banks lack beside their own `.BUL_CAS_GRASS`.
  The viewer plays the first of `.BUL_CAS_GROUND`, `.BUL_CAS_GRASS`, `.BUL_CAS_SAND` the map holds.
- Night Stalker's `.BUL_STONE` is in `MP7_am` and plays: 4 of 4 stone hits heard at spawn A.

**The pre-warm** (research 90 item 16). When the map's effect data arrives, every effect's program is compiled and
its bitmaps uploaded (`Effects.warmUp`, `renderer.compileAsync`): the models, a particle group per texture, the marks'
and footprints' materials, and the light pass's two programs (its colour and opacity are uniforms). A software-rendered
headless browser measured the first frag's first frame at 127 ms warmed against 400 ms cold on Desert Glory. The
blast's overdraw, not its first use, is the rest there.

## 12. Round three: the smoke screen, the characters lit, the ambient effects, the light pool, the casing names

**The smoke grenade.** `smoke_grenade` runs `smoke_stream` on the canister's node: two sources, 2.5 puffs a second
each, a puff living 5-7 s and growing about tenfold, for 20 s of emission. Played through `effects.play` with the
grenade's node (`grenadePlace`), it stands as a grey wall: dense at 6 and 12 s, thinning from about 22 s
(`e2e/effects.spec.ts`: `desert-glory-smoke-screen.png`, `desert-glory-smoke-inside.png`). The game's Timer2 is 40 s.
Whether that re-runs the zAnim was not traced. The grenade workstream's `SMOKE_ALWAYS_PLACEHOLDER` can go.

**The characters take the lights.** The receivers are the world, the held weapon and the SEAL's body. A skinned mesh
is re-drawn as a `SkinnedMesh` bound to the body's own skeleton, beside it, so the pass bends with the pose. The body
has no bounds that follow the pose, so every light reaches it.

**The `_zoom` muzzles.** Every `muzzle_*_zoom` (the turrets, the LAW and the M203 aside) calls only
`shell_smoke_med`, `zoom_fire_silent` or `zoom_flash_fire`. The aim view shows no flash model: it shows a light
(`zoom_flash_fire`, 0x44) and a hidden casing. The M4A1's zoomed round starts one light and shows nothing
(`test/effects.test.ts`).

**Commands 46, 47, 50.**
- `STOP_ANIMATION` (46) and `PAUSE_ANIMATION` (47) name an animation at +4, a name index. Index 0 (`NA`) is the
  running animation itself.
- A paused animation stays alive: its sources keep emitting and its nodes stay. The torches' `loop_torch*` pause
  themselves once lit.
- `CALL_SEQUENCE` (50) starts the animation's own sequence named at +4 -- the first of that name not running; a running
  one is left alone (`FUN_00269b00` D:L114714-114760, research 106 §5). *(Corrected 2026-10-19 by LATER 138: this line
  said "restarts".)*
- **The activation rule** [reading]: a sequence of activation 2 waits when its own animation's `CALL_SEQUENCE` names
  it. Frostfire's `firey_flames` switches its vent lights on and off that way. A sequence of activation 2 that no
  call names runs from the start, as the activation gate does (`shell_eject`'s range test).

**The ambient effects.**
- The mission's ambient effects are the `MZANIM` animations that start themselves (`params.flags & 3 == 1`) and
  draw something: a particle source or a light, directly or through a call.
- They start with the map (`EffectData.ambient`). Their nodes are the scene graph's (`<ARCHIVE>_GEO.ZED`,
  `flattenScene`: `EffectData.sceneNodes`). The node `camera` is the camera: the snow and the rain fall around it.
- Their looping (`~`) sounds are left to the audio's emitters.
- The textures come from the effect libraries, the map's own, `CLIB` and `FLIB`: the snow and the butterflies live in
  the map's.
- A source that follows its node keeps its offset and its box in the node's local space.
- Seen: Frostfire's tower flames (`firey_flames` at `r_tower_flames`: `frostfire-tower-flames.png`), Blizzard's snow,
  Shadow Falls' 30 (torches, bugs, drips) and The Ruins' 9 (rain; the streaks are faint by the data).

**The light pool** (research 90 item 19: a 500-850 ms frame about 0.6 s after every blast, on every map).
- **The cause, measured.** Every `LIGHT` made a new material and an overlay for every receiver mesh in reach (about
  170 on Frostfire), and the light's end disposed them. The frame that first drew them built their programs in the
  frame. Headless Chromium (ANGLE D3D11, WebGL2) measured a 285-300 ms `render` on every blast, not only the first.
- **Now.** Six fixed light slots of shared-group uniforms feed two materials a map: the additive pass (0x48) and the
  lerped one (0x44).
  - Each pass sums its blend's slots in one draw. The additive pass is `C = Σ Cs As`, `A = min(Σ As, 1)`.
  - The lerped pass folds its slots in turn: `C = C (1 − As) + Cs As`, `keep = keep (1 − As)`, `A = 1 − keep`.
  - Both output `C / A` at alpha `A` under `SrcAlpha`, so one light is the single pass of §10 exactly.
- **Overlays.** A receiver mesh gets its two overlays once and keeps them. A light only sets its slot's uniforms and
  shows the overlays in its reach.
- **The pre-warm.** The map's effects pre-warm rides the world's own warm-up after the props are in
  (`ViewerRenderer.warm`: the PS2 frame's target, stand-ins for the hidden meshes). It makes the overlays and shows
  them for the compile call's synchronous projection.
- **Taken out of the scene at once.** The overlays and the warm-up group then leave the scene: a frame drawn while
  the programs built would otherwise build them itself, synchronously. On Desert Glory that was a 2.2 s frame, because
  three keys an instanced mesh's program by its uuid (about 45 receivers there).
- **Measured after** (a headless blast probe, 4 blasts a map, and `tools/playtest.ts`'s grenade scenario): no frame
  over 45 ms at any blast on Frostfire, Desert Glory or Sujo. Desert Glory's six ambient lights were live throughout.
  The load then shows no frame over 125 ms after the reveal on Desert Glory and Frostfire.

**The casing names everywhere** (research 90 item 18).
- The audio's list of wanted names took `shell_eject`'s names raw, so `.BUL_CASE_METAL` was asked for and reported
  missing on every map.
- One table (`@s2u/sound`'s `catalog.ts`: `SOUND_NAME_FIXES`, `SOUND_FALLBACKS`, `soundFor`) now serves the effects'
  plays, the audio's callback plays and the wanted list:
  `.BUL_CASE_METAL` is `.BUL_CAS_METAL`.
- `.SG_SHELL_TIN` is in MP8's and MP61's banks only. On Frostfire the borrowing's six-bank limit does not reach it, so
  it stands in as the map's `.SG_SHELL_METAL`.
- `.SG_SHELL_SAND` (MP6, MP7, MP73) stands in as `.BUL_CAS_SAND`, else `.SG_SHELL_STONE`, which every `_am` bank
  holds.
- A name whose stand-in the map holds is not reported missing. Frostfire, Desert Glory and every map in the audio
  sweep now miss none.

## 13. Round four: the marks' colour (the owner's 2026-09-29 report)

The owner, after playing: the bullet marks show up much lighter and fainter than in the game.

**The cause: the viewer drew a mark's bitmap bare; the game modulates it by the wall's vertex colour.**
- `FUN_003d0ba0` (decomp 323789) hands the hit node to `FUN_003139e0` (213891). It walks every visual of the node
  flagged `0x10000` and clips the mark to each through `FUN_003b3950` → `FUN_003b3ab0` (306470).
- For each world triangle facing the round, `FUN_003b3ab0` keeps its three vertices only if each projects within
  **4.8 units** of the mark's plane (`fabs(z) <= 4.8`). With each vertex it stores a pointer to the world vertex's own
  32-bit colour: the vertex walk's `+0x3c` (`FUN_003ba9a0`, 310593: the colour array plus the index times 4).
- `FUN_003b3800` (306384) takes a pool entry and `FUN_003beca0` (313065) writes the mark's VIF packet. `STCYCL 1,3`,
  then `UNPACK V4-8` (`0x6e038006 | 0x4000`) of the three colour words: RGBA bytes, 0x80 unity. Then the `GIFtag`
  (`PRIM` triangle, `TME`, `FGE`, `ABE` from the texture's flag; `REGS` ST, RGBAQ, XYZF2), the positions and uvs, the
  normal (`V3-16`, `0x6901800e`), and `MSCNT`: the visual's own VU program finishes the draw.
- So `RGBAQ` for every mark vertex is the wall vertex's baked colour, lit as the wall is lit. The GS modulates:
  `C = (Ct x Cv) >> 7`, alpha the same product, blended source alpha over (the `bullet_mark_*.tif` bind packets).
- The same packet draws a footprint (`FUN_005a3280` calls `FUN_003139e0`, decomp 460209) and the grenade's scorch
  (`FUN_003d0ba0`, the permanent pool).

**What was right.**
- The texture's alpha: `@s2u/gs` rescales 0..0x80 to 0..255 (`PS2_ALPHA_FULL`). `bullet_mark_stone.tif`'s alpha
  peaks at 0x52 (163/255): 0.64, as the GS reads it.
- The blend: source alpha on all six `bullet_mark_*.tif`, read off their bind packets.
- The depth offset, the fog (`FGE` is set), the frame's brighten (1.0 in multiplayer). No fade: none in the game.

**What was wrong, with numbers.**
- `markMaterial` drew `texel.rgb x brighten`: no vertex colour. The bitmaps are light grey: stone mean RGB 160, metal
  183, sand 119, wood 208/197/181.
- World vertex colours are well under unity, mean luminance per vertex:
  - Frostfire 0.29, Desert Glory 0.25 (no world vertex is above 128 on any map, `@s2u/mesh`);
  - measured under the marks: Frostfire's container 0x41 (0.508), Desert Glory's stone wall at spawn A 0x10 (0.126),
    Bitter Jungle's dirt 0.25 and its wooden stairs 0.29-0.32, Vigilance's cobbles and rock walls 0.13-0.53.
- A stone mark on Desert Glory's wall drew at grey 160 where the game draws 160 x 0.126 = 20: eight times lighter. On
  Frostfire's container, twice. Every surface was wrong the same way.

**The fix (one rule, every surface).**
- `effectMaterials.markMaterial` is the effects' GS graph, `clamp(texel x vertex colour) x brighten`, alpha the same
  product.
- Each mark and footprint carries its own four-corner `color` attribute (`fire.markGeometry`, `paintMark`).
- `surfaceShade.ts` fills it from the drawn world, which holds the game's colour in each draw's `color` attribute
  (`applyLighting`). A probe runs along the surface normal, `MARK_DEPTH` (4.8, the game's clip depth) either side of
  the hit, over the visible draws. It takes:
  - the drawn surface nearest the hit, skipping the blended draws where a solid one is met;
  - of its coplanar layers, the most opaque. On Vigilance, `ground_grassy.tif` fades out by vertex alpha over
    `cobble_road.tif`; the game puts a copy of the mark on each visual, so the one that shows is the opaque layer's.
  - its triangle's colours, interpolated at the hit.
- `Fire.setShade` and `Effects.setShade` take it (`main.ts`, per map).
- A mark that lands before its wall is drawn (the props stream in after the map shows) is asked again each frame,
  four a frame, until the wall is drawn.
- `FireState.lastShade` reports the colour the last mark took.

**Readings.**
- One colour for the whole mark stands in for the game's per-vertex colours over the clipped triangles. A mark is
  0.75-3.4 units across, and a world triangle's colour barely changes over that.
- The collision hull and the drawn world are separate meshes. The probe's 4.8 units cover the gap between them.
- The grenade's scorch (`grenade.ts`, the grenades' file) still draws bare. It should take `surfaceShade` the same
  way.
- A viewer mark was not clipped to its polygon, so on a stair's edge it hung past the step. Closed in §14.

**Evidence.**
- Pictures, in `test-fixtures/screens/effects/` (git-ignored, game data):
  - `marks-before-*.png`: the tree before the fix;
  - `marks-after-*.png`: after it;
  - `marks-pair-*.png`: the two side by side, for Frostfire's metal container, Desert Glory's stone wall, Bitter
    Jungle's dirt and Bitter Jungle's wooden stairs.
- Before, every mark is a light grey smudge with a pale rim. After, the holes are dark and the rim is the wall's own
  tone.
- No console frame of a mark was found. `logs/parity/s4_pcsx2` is two clients idle in a round (30/30 throughout).
  The evidence is the packet above.

**Verification.**
- `viewer/test/markShade.test.ts` pins:
  - the colour under a point, interpolated;
  - hidden draws ignored;
  - the solid base under a blended overlay;
  - the 4.8-unit reach;
  - the most opaque coplanar layer;
  - `markMaterial`'s graph reading the vertex colour, blended source alpha over, with no depth write;
  - a round's mark painted with the colour under it;
  - a late wall painted a frame later;
  - unity without a shade.
- `e2e/effects.spec.ts` ("the marks take the colour of the wall they are on"): Frostfire's container marks take
  (0.508, 0.508, 0.523, 1) and Desert Glory's stone marks (0.126, 0.123, 0.110, 1), with their pictures.

## 14. Round five: the mark clipped to the world, shaded per vertex (2026-09-29)

**The game's build, read whole** (`FUN_003b3ab0`, decomp 306491-306670). For each visual of the hit node flagged
`0x10000` (`FUN_003139e0` 213893), each triangle of the visual:
- **faces the round**: its stored normal (the visual's normal stream, `+0x40`, s16/32768) dotted with the round's
  direction brought into the node's frame (`FUN_003b3950` 306426) is below **-0.01** (306534); else it is skipped;
- **lies within 4.8** of the mark's plane: all three vertices, projected by the mark's matrix (`FUN_00307810` 206431:
  a look-at along the round, x and y scaled by `(w - 1) / (size * w)` and offset 0.5 -- the bitmap's u and v -- z the
  depth along the round), have `fabs(z) <= 4.8` (306632);
- **meets the square**: `FUN_003bf290` (313290) -- the projected triangle's u range and v range each overlap the
  square's (`DAT_004b5070`..`DAT_004b5068`; not initialised in the decomp, 0 and 1 by the matrix's offset).
- The triangle then goes **whole** to `FUN_003b3800` (306386) with its three vertices' colour words -- one pool entry a
  triangle (`iVar11 == 1`, 306654) -- and the GS draws it with the bitmap clamped.

**The budget.** None per mark: the loop has no cap. The cap is the pool's, and the pool counts **triangles**:
`FUN_003b3800` takes one entry from `FUN_003bf1a0` (313254: refused past `base + overflow`) for each triangle, and
`FUN_003bf110` (313233) trims whole entries back to the base, oldest first, each frame. `TEMP_DECAL_POOL` `BASE 150`,
`OVERFLOW 50`: 150 world triangles of bullet marks and footprints together. A mark over 1-5 triangles leaves 30-150
marks standing, not 150.

**In the viewer** (`viewer/src/markClip.ts`):
- `MarkClipper` walks the drawn world (the map group `surfaceShade` reads: visible meshes with a `color` attribute,
  less the detail and reflection passes and the flares), takes the triangles in the square's box, `MARK_DEPTH` either
  side along the round, and applies the three tests above. The facing normal is the winding's (CCW front, mesh
  SEMANTICS §6), turned by a mirroring placement.
- Each kept triangle is clipped to the square (Sutherland-Hodgman on u and v in [0, 1]); each output vertex takes the
  triangle's colour interpolated there, which is the gouraud colour the GS gives that pixel. The same pixels as the
  game's whole triangle under a clamped bitmap, drawn with less fill.
- **The node.** The game marks the hit node's visuals only. The viewer's world is one mesh per texture over the whole
  map, and a prop a mesh or instance per placement; so the node is "the world" or one prop placement, the one whose
  triangle lies nearest the hit under the square's centre (solid before blended). A mark on the ground by a crate stays
  off the crate.
- Every layer of the node takes its copy, as the game's per-visual copies do; a fading terrain layer's copy fades
  with its vertex alpha. `lastShade` is the most opaque layer's colour under the centre.
- One small mesh a mark, in world space, its buffers made once (`MARK_CLIP_MAX_TRIANGLES_READING` 32 world triangles, a
  buffer bound and not the game's). Nothing drawn under it yet: the bare square at unity, clipped again four a frame.
- Fire's temporary pool counts triangles (`TEMP_DECAL_TRIANGLES` 150), oldest marks hidden first. The footprints keep
  their own pool of meshes [the game shares one; not joined here]. The grenade's scorch (permanent pool) is clipped
  the same way, framed on the probed ground's normal negated (research 85 section 7.3; since 8a4e853e, §15).

**Readings.**
- The `(w - 1) / w` texel-centre scale of the uv is not applied (a 16-texel bitmap: 6 %).
- The viewer's node rule stands in for the game's node: a world chunk in the game can be smaller than "the world".
- A big triangle sloping away along the round is dropped whole, as the game drops it: at a grazing angle the far
  vertices pass 4.8.

**Cost** (`viewer/test/markClip.bench.ts`, a 1024 x 1024 world of 131k triangles in 96 world meshes plus 300 props,
512 random hits, 5.4 world triangles kept a mark): **0.08-0.12 ms a mark** mean (p99 0.2-0.4 ms) on the host under a
game run's load. Each geometry's cell index is built on the first mark that reaches it: 60 ms for that whole world,
once.

**Verification.** `viewer/test/markClip.test.ts`: a mark on a stair's edge stops at the edge; a lower step within reach
takes the part past it on its own surface; a mark in a corner covers both faces, each with its own colour; each clipped
vertex's colour equals the world's interpolated at that point; the facing and 4.8 tests; instanced props through each
instance's matrix, hidden draws skipped; the lift and the reused buffers; `Fire.setClip` (the clip, `lastShade`, a wall
drawn late); the pool counting triangles; a footprint and a scorch over a step's edge.

## 15. Round six: the clipped mark never clipped in the page (2026-09-29)

**The report.** Controller, the integration head: on Frostfire, walk, `setCamera({ yaw: 100, pitch: -3 })`, every
round on the container (material 25) left `lastShade` null and a light bare square -- `squareInto`, nothing kept;
`e2e/effects.spec.ts` "the marks take the colour of the wall they are on" timed out on it; the MP71 release sweep's
magazine at the nearest wall left no mark (not this cause: see the end of this section).

**Not the streaming.** `MarkClipper` walks the live group on every clip; nothing is snapshotted. With every world and
prop draw revealed, as `main.ts` builds it, the clip still kept nothing (`viewer/test/markClipMaps.test.ts`, RED).

**The cause: the frame looked along the round.** The container side the round meets is two triangles 20 x 15 units
(`container_blue01`, from (786.5, 115, 599.7) to (783.1, 130, 619.4)). The round comes in about 13 degrees off the
wall's normal; along it, one vertex lies 4.88 units from the plane through the hit, past 4.8, and the 4.8 test drops
the triangle whole. Every wall of the maps' size hit at any slant went the same way; the synthetic tests' small
triangles square to the round never did. §14's reading "a big triangle sloping away along the round is dropped whole,
as the game drops it" is **retracted**: the game shows these marks.

**The game's vector is the hit's normal.** `FUN_003d0ba0` (323919) hands `FUN_003139e0` `&uStack_20`, the hit
record's +0x10 scaled by -1 (`FUN_00309180(-1.0, record + 0x10)`, 323891); the record is `point, t, normal, node`
(+0x1c the node, 323818; 0x20 a record, `FUN_002d4c20`). `FUN_00307810` looks along that one vector and picks its up by it
(206461-206476), and `FUN_003b3950` tests facing against it: a triangle is kept when its normal is within 90 degrees
of the hit's (`n . -N < -0.01`). So the square lies flat on the hit surface, and a flat wall is at depth 0 whatever its
size and whatever the round's slant. [Reading: +0x10 as the normal rests on the record's layout and on the facing test
making sense only so; the round's direction there would keep back faces.]

**The fix.** `Fire.placeClipped` builds the frame along the hit normal negated (`markFrame(point, n, -n, side)`); the
footprints already did (`Effects.footfall`). Verified: `markClipMaps.test.ts`, Frostfire's container four rounds at
yaw 96.25-103.75 (0.508, 0.508, 0.523) and Desert Glory's stone at 36.25-43.75 (0.126, 0.124, 0.110), each equal to
the probe's colour there to 5 places and the mark's own vertices that colour.

**The grenade's scorch: done 2026-09-29 (8a4e853e).** `grenade.ts` `groundUnder` probes the game's column under the
blast (`FUN_003c7af0` 318876 -> `FUN_002d4c20`) and `scorchClipped` frames the scorch on that record's normal negated
(`FUN_003d0ba0` 323891), as the marks are; pinned by `viewer/test/grenadeScorchSlope.test.ts` (MP6's hillside `g157`).

**The MP71 "no mark" was not this.** The release sweep chose its heading by the least walk reach (yaw 135 from spawn
(1199, 45.7, 1450)); a level round from the eye along it meets only `INVISIBLE_DI` (72.1, 124.1, 147.4 units) to the
M4A1's range, and `INVISIBLE_DI`'s `PENETRATION` is 1, which `HandleIntersections` passes over by rule (`FUN_003c9b70`
320028-320030: `if (fVar15 != 1.0)`), so nothing was struck and no mark is the game's answer. The sweep's heading was
the defect: `tools/sweepHeading.ts` now picks the nearest first strikable surface (`PENETRATION` != 1) and records
`noSurface` when there is none (launch fix PL-1; `tools/test/sweepHeading.test.ts` pins the MP71 numbers).

## 16. Readings (named in the code, 2026-09-30)

| name | value | the game |
|---|---|---|
| `MARK_CLIP_MAX_TRIANGLES_READING` (`markClip.ts`) | 32 world triangles a mark | `FUN_003b3ab0` has no cap per mark (306654-306659): each kept triangle is a pool entry; 32 bounds the mesh's buffers (a mark is at most 3.4 units across) |
| `CANDIDATE_MAX_READING` (`markClip.ts`) | 256 candidates a clip | a buffer bound of the viewer's; the game walks the node's visuals (306470-306483) |
| `SCORCH_PARTIAL_ORDER_READING` (`grenade.ts` `scorchClipped`) | the clipper's candidate order | a scorch that only partly fits the permanent pool keeps its first triangles in the viewer's order (oversized list, then the cell walk), not the game's visual walk (`FUN_003b3800` 306401-306417) |
| `ZANIM_UNREAD_OPERAND_PLACEHOLDER` (`effectRunner.ts`; LATER 310, ruling R2 as narrowed by the review's F1, 2026-10-22) | `'decidedElseFalse'` | an IF / ELSEIF holding an operand the reader keeps undecoded (`EffectCondition` `other`) is folded with every answer of those operands: one result stands (the sourced operands decide it); a result the unread answer turns keeps the pre-fold false; no host answers set 0 commands 66, 70, 72 (nor set 1's command 1, set 2's) from a source, and their ticks' own acts are not modelled: settled by reading their registering modules and ticks (§18) |
| `UNTEXTURED_PARTICLE_BLEND_READING` (`effectMaterials.ts`) | source alpha | `FUN_003251b0`'s untextured branch (D:L223980-223983) sends PRIM 0xE6 (a sprite, `ABE` on, no texture) and no bind packet, so the `ALPHA_1` in force is the last bind's; which bitmap drew before is the frame's sort (§17) |
| `TRACER_START_ROLL_READING` (`tracerFlight.ts`) | the page's effects generator | the start's roll is `rand() % 990` (`FUN_00197740`, D:L327213-327214; the start `(roll + 1) / 10` units down the shot, D:L327214-327223). The page rolls it with its effects' own generator (`Math.random` in the match pages), not the console's `rand()`: a cosmetic offset no other page or the room needs to share (#425's takeover, the merge controller's note) |
| `TRACER_SIDE_READING` (`tracerFlight.ts`) | `viewer-team` | ally is the viewer's own side, enemy the other; the anim is the ally's (`DAT_004b5340`) unless the round's model is the enemy's (`DAT_004b5330`), then the enemy's (`DAT_004b5348`) (D:L327204-327207), the round setting its model by `+0xb4` (D:L320544-320548). Confirmed against D:L479356-479360 by #425's first review |
| `TRACER_ORIENTATION_READING` (`effects.ts`) | x along the shot, rolled to the world up | the round builds the object's matrix -- an identity scaled by 7.5 (`TRACER_OBJECT_SCALE`, D:L320498-320502) times a rotation taking +x to the shot (`FUN_00306d40`, `FUN_00307170`, D:L320508-320514) -- and the launch sets it (`FUN_00315820`, D:L327256-327257); the roll about the shot (`FUN_00306d40`'s construction) is unread, the port's the world's up. Was: "the launch writes the place only" (#425's second review, finding 1) |
| `TRACER_RETIRED_ANIM_READING` (`effects.ts`) | runs out | the launch keeps the anim's handle in the slot's `+4` (D:L327210) and then writes 0 there (D:L327224), so the slot's free (`FUN_003d4ed0`, which stops a non-zero `+4`, D:L327136-327137) never stops a tracer's anim: it plays to its end (the `redpuffs`, the 0.3 s wait). Whether a follow source on the freed object still emits is unread; the port keeps the object where the flight left it until the run ends (#425's second review, finding 2) |
| `TRACER_REMOTE_COUNT_READING` (`netPage.ts`) | the shots this page saw this round | another player's every-fourth round is counted on the shots of that player this page has seen this round; the original counts the shooter's own `+0xb8` (`FUN_003cabe0`), and whether another console sees that number or counts its own is unread |

## 17. Round seven: the particles' bitmaps (the owner's Desert Glory report, 2026-10-07)

The owner's playtest frame of Desert Glory (main `003477bc`, an online match) showed the rubble's smoke as flat
opaque grey squares stacked into steps, and a dark square at the burn barrel. Every block pixel is `(102, 102, 102)`
out to its edge: the rubble smoke's colour key 0.4 times 255, fully opaque, unfogged and unbrightened. That is exactly
the viewer's untextured effect material (vertex colour, alpha 1, no blend, depth written) drawing
`smoldering_rubble`'s particles, so in that session the particles were drawn **without their bitmap**, and the
fallback drew each one as an opaque block.

**What the original draws** (`FUN_00327910`, D:L225440-225608, the per-particle draw record; `FUN_003251b0`, D:L223927):
- The record's bitmap is the particle's own (`+8`, set at the spawn for a random-mode source, flag A 0x4000000), or,
  when it holds none, `FUN_00328a50(t)` (D:L225586-225589): the entry of the source's list whose `t` is the last at
  or under the life fraction, clamped to the list (D:L226050-226083). A life-stepped source (flag A 0x8000000) changes
  bitmap through each particle's life.
- No bitmap (`uVar7 = 0`, D:L225590-225591) is not "skip": `FUN_003251b0` draws the untextured sprite, PRIM 0xE6 --
  `ABE` on, no texture (D:L223980-223983) -- blended by its RGBA's alpha. The colour is the key times 128
  (D:L225585) as the GS's own 8-bit value, so a key of 1.0 is 128 of 255 untextured, and 1.0 of the texel textured.

**The port deviated twice.**
1. The untextured fallback was opaque (`effectMaterial(null)`: blend none, alpha 1, depth write) where the game's is
   a blended sprite. Now a particle with no bitmap is the GS's untextured sprite (`effectMaterial`'s `vertexAlpha`):
   its colour the key times 128/255, its alpha the key, blended (`UNTEXTURED_PARTICLE_BLEND_READING`), no depth
   write. A bitmap no library holds is real on every map: `fire_very_large`'s `fire101.tif` and `fire102.tif`.
2. A life-stepped source drew only its first bitmap. Frostfire's tower flames (`firey_flames` at `r_tower_flames`,
   both sources flags A `0x3a7fbfd3`) step `fire_hardedge.tif` (additive) from 0, `cloudpuff01.tif` (source alpha)
   from 0.4 and `effect_mist.tif` from 0.8; the viewer drew additive fire for the whole life, a bright blob with no
   smoke. Now `particleTextureAt` picks the bitmap each frame (`@s2u/scene`; `particles.ts` groups by it).

**The release maps.** Frostfire (MP2): its one ambient effect is `firey_flames` -- deviation 2 applies (fixed);
the before/after pictures are in the change's report. Vigilance (MP51): `water_drain`'s spray
(`waterspray.tif`, random mode, source alpha) -- neither applies. Crossroads (MP72): no ambient particle source.
Desert Glory's smoke (`fire_smoker1`, `smoldering_rubble`, `cig_smoke`) is random mode, one `cloudpuff01.tif`,
source alpha, and the libraries hold it on the served tree and the disc image alike (`test/particleTextures.test.ts`).

**Not reproduced.** Why the owner's session drew those particles without their bitmap was not found. On this host
the bitmaps load and the smoke draws soft in every run tried (headless, WebGL2 and WebGPU): `/testroom` offline in fly
and walk mode, `/testroom` online with two pages and the match server, the front end's match on Frostfire, and the
effect data read through the served tree, the extracted disc and the `.iso`. With the fallback fixed, a particle that
loses its bitmap is a translucent sprite, not an opaque block; the cause in the owner's session is open (§8).

## 18. The IF's condition: the effects fold it as the menus do (LATER 310, 2026-10-22; reading, pending review)

**The function.** The effects' `IF` is the menus' `IF`: one zAnim command table, registered once into the context at
0x414bb0 (`FUN_0025bc20`, D:L106866: `IF`'s tick 0x25e7a0; `ELSEIF` and `ELSE` 0x25e6d0, D:L106867-106868; §1), one
dispatcher reading that table (`FUN_0026a6e0`, the table at the context's +0x30, D:L115192), and the instance tick that
steps every sequence of every animation with that context (`FUN_00270220`, D:L118642; research 106 §2). `IF`'s tick
`FUN_0025e7a0` puts the pc on the condition's first token (+8, D:L108217) and evaluates it with `FUN_0025e960`
(D:L108218), the evaluator research 106 §3 reads for the menus and the round's cues use (`viewer/src/roundCues.ts`
`evaluateCondition`); a `WHILE` the same (`FUN_0025e630`, D:L108140). So the effect runner's rule is research 106 §3's:

- the operands left to right, each folded into the value by the operator pending before it -- 3 OR, 2 AND
  (D:L108339-108351 for a group, D:L108398-108409 for an operand); a pending 0 or any other byte gives false
  (D:L108335-108337, D:L108394-108396); the first operand is the value. **No precedence, no short circuit**: every
  operand reached runs (D:L108380, D:L108389), so a `RANDOM_WEIGHT` draws whatever the value so far;
- 1 NOT flags the next operand or group (D:L108369-108372, D:L108329-108332, D:L108383-108386);
- 4 `(` evaluates up to its 5 `)` as one operand (D:L108325-108327); `)` returns the value (D:L108366-108368);
- **the end**: an operand met with a value and no operator pending puts the pc back on the token before it and returns
  the value, before running it (D:L108375-108379). That is how every condition ends -- on the command after the IF --
  and it is the edge: two operands with no operator between them end the condition at the first. The second is not
  asked; when the condition holds, `FUN_0025e7a0` returns done (D:L108276-108280) with the pc on the first, the step
  moves past it, and the second and every token after it run as statements before the branch.

**The port.** `EffectRun.holds` (`viewer/src/effectRunner.ts`) folds through `evaluateCondition` (the cherry-pick of
PR #427's 44ad46966, d7c2ca898). Before, it asked every token -- an operator answered false by every host (the world's,
the doors', the effects') -- so a condition with an operator always took its else branch, and two operands with no
operator between them were both required. Two rulings of the seat (2026-10-22, endorsed by the merge controller under
OT.R53 as a choice between readings; reading, pending review) bound it:

- **R1: the adjacent pair is recorded, not modelled.** The disc holds one: MP64's `bugs_flying`, sequence `NA`, IF @1,
  `set 0 cmd 66 set 0 cmd 72` -- M51's copy of the same program reads `set 0 cmd 66 OR set 0 cmd 72`, so MP64's lost its
  OR. In the original, when cmd 66 holds the condition is true and cmd 72 runs as a statement before the branch
  (D:L108375-108379); the port's condition is cmd 66's value, the second never asked (`effectRunner.test.ts`), and the
  statement run is not modelled. Unreachable today: cmd 66 is an unread operand (R2), so the IF reads false before and
  now. What settles it: M51's copy against MP64's (the pair is MP64's data, not a second form), and cmd 66's host read
  -- what it answers on MP64's bugs.
- **R2: an unread operand decides nothing on its own** (`ZANIM_UNREAD_OPERAND_PLACEHOLDER`, `effectRunner.ts`; narrowed
  by the review's F1, the seat's ruling, 2026-10-22). An operand the reader keeps as an undecoded command
  (`EffectCondition` `other`) has no host that answers it from a source: every host (the world's, the doors', the
  effects') answers it false, unread. Before LATER 310 that guess was masked -- a condition with an operator read false
  whatever it held -- and the fold's `NOT` would make it a taken branch. So a condition holding one is folded with every
  answer of its unread operands, true and false, its sourced operands asked once each, in order, as the fold reaches
  them. **Where every answer gives one result, the sourced operands decide it and it stands** -- `Corpse_Found`'s
  `set 2 cmd 33 OR valve_aware == 1` holds at `valve_aware` 1 whatever cmd 33 answers (D:L108398-108402). **Where the
  unread answer turns it, the condition keeps the runner's pre-fold result, false.** A condition with more than 8 unread
  operands is not tried and reads false (a bound of the port's; the disc's conditions stay under it, the dev-disc test).
  **A caveat neither form models:** the original runs every operand (D:L108380, D:L108389), so an unread command's tick
  may act -- set a value, start something -- whatever its answer; the port runs none of them. What settles it: the hosts
  of set 0 commands 66, 70 and 72 (their registering module and ticks; numbered past `FUN_0025bc20`'s base set,
  `ZANIM_COMMAND_NAMES` ends at 61), and of set 1's command 1 and set 2's commands below. The conditions R2 keeps at the
  pre-fold false (38 of the 463 rows that changed before it; the operand, why no host answers it, where):

  | unread operand | why the hosts cannot answer it | rows | programs (archive) | maps |
  |---|---|---|---|---|
  | set 0 cmd 70 | registered past the base set, its module and tick unread | 1 | `shell_smoke_med` (CZANIM; `IF NOT set 0 cmd 70` -> `FAIL`, called by every muzzle) | all 34 |
  | set 0 cmd 72 | the same | 1 + 24 | `check_camera_inside_state1` (CZANIM, all 34; MZANIM, 16 maps), `badhelo_anims` (M62), `helo_anims` (M82): `ELSEIF NOT set 0 cmd 72` | 17 + all |
  | set 0 cmd 66 | the same | 2 | `check_camera_inside_state` (MZANIM): `ELSEIF NOT set 0 cmd 66` | MP1, MP2 |
  | set 1 cmd 1 | the UI set's bound function (`ui::UI_COMMAND`, research 106 §4): the menu's host, not the effect runner's | 3 | `exit_load_screen`, `intro_onstart` (LDZANIM, the loading screen's; not the effect runner's) | all 34 |
  | set 2 cmd 22 | a third registered set, unread | 5 + 2 | `SE_Soldier2_start`, `SE_Soldier3_start` (M71: `NOT set 2 cmd 22`), `moreobj` (M51: `alarm >= 3 AND NOT set 2 cmd 22`); the round script on M51, M81 | 3 |

  Given back to the fold by F1 (36 rows): `Dead_Guy_1` and `Dead_Guy_2`'s `Corpse_Found` (`set 2 cmd 33 OR
  valve_aware == 1`, `== 3`) on M61, M62, M63, M71, MP64 and MP82 (24), and 12 of the round script's (set 2 commands 11,
  18 and 22 beside a sourced operand that decides). The table is the sweep's (`tools/effectConditionSweep.ts`): a row
  LATER 310 changed before R2 and leaves unchanged after it, by its `set N cmd M` tokens (each sub-command's header,
  `conditionHeaders`).

The other edges the sweep counts are unreachable by the runner today: seven trailing operators, all campaign `WHILE`s
(`NOT set 2 cmd 22 AND NOT` on M51's `TurretComment`, M52's `Stealthover`, M83's `bottom1_start` / `bottom2_start`
`ambient`; a bare `NOT` on M63's `VO_Call19`, M71's `AIRSTRIKE`, M83's `Cargo_Hold`), where the original reads the body's
first command as the last operand and the runner reads a conditional `WHILE` as false (§8); and ten empty `()` groups,
all round scripts (`( set 2 cmd 22 ) OR ( )` on MP6's, MP10's and MP11's `Rescue1-3`; `POBJ5 != 1 AND ( )` on M63's
`VO_Call13`), where the original returns its saved register (research 190 U9) and roundCues' fold false. No leading
operator, operator byte outside 1..5, unbalanced group, or condition followed by an `EXPRESSION` or by nothing.

**The sweep** (`tools/effectConditionSweep.ts`, printed by `tools/sweep-effect-conditions.ts`, held by
`tools/test/effectConditionSweepDisc.test.ts`): every zAnim archive of every map archive of the disc's `RUN` (34),
read through `@s2u/archive` and `@s2u/scene` (`parseAnimSets`, `decodeEffectProgram`) and the viewer's
`readActionRecords`; each IF and ELSEIF whose tokens carry an operator, or two operands and more, run through the
viewer's `EffectRun` before (the base's every-token truth) and now, at the initial state (every valve 0: the world and
the doors clear their valves at the round's reset) and at every state of the valves it names (each test's operand and
its neighbours, and every value a program of the map sets), a draw or a range test either way. "Who runs it" is the
data's: the `actions.rdr` record that names it, a destructible, an autostart, the program that calls it.

**What it found** (2026-10-22, the dev-disc test's run, R2 as narrowed in): 15,183 IF / ELSEIF conditions on the 34
maps' zAnim archives; the ones the change can reach -- an operator, or two operands and more -- make **617 grouped rows**
(a condition per map, the identical ones grouped across maps; the common `CZANIM.ZAR` and `LDZANIM.ZAR` on all 34).
LATER 310 changed 463 of them before R2, 389 after its first form, **425 after F1** (76 at the initial state, 349 at a
state a valve reaches); 3 more are **not enumerated** -- M51's round-script `FailRecon` @1, `PRIMARY_5` @19 and
`PRIMARY_2b` @12, past the sweep's 256-state cap, which likely change and are counted apart -- and 189 never change. Of
the 425: **393 in the round script `objectives`**, which the effect runner does not run (roundCues' reading; the room
owns the round), counted, not pinned -- `LDZANIM.ZAR`'s four rows are all unchanged; **32 where the runner can reach
them**, pinned (`CHANGED`): the 24 `Corpse_Found` checks R2's F1 gave back (above; each now takes its branch at
`valve_aware` 1 or 3, where it ran else) and these 8, what changes visibly first:

| map | program, sequence, op | who runs it (the data's) | condition (our reader's tokens) | before | now | its branch / else |
|---|---|---|---|---|---|---|
| MP62 | `gate_openclose2`, `NA`, IF @0 | SWITCH `epanel_di2` (valve `woodgate`), SWITCH `epanel_di3` (valve `woodgate2`) | `woodgate == 0 OR woodgate2 == 0` | else at every state | its branch at the initial state and with either valve 0; else with both off 0 | sets both valves 1, `.SWITCH_SMALL`, `relatedopen`, the handle's motion, `gateopen` when `set_access2 == 0` / the same with 0 and `relatedclose`, `gateclose`: **Enowapi's wood gate takes its open branch on the first pull** (research 174: up 35 over 3 s) where it took `gateclose` |
| M51 | `moreobj`, `Sleeper4`, IF @1 | autostart (campaign) | `Patrol1_valve_alive == 0 OR Patrol2_valve_alive == 0 OR Patrol3_valve_alive == 0 OR Roadwatch2_valve_alive == 0` | else | its branch while any is 0 (the initial state) | `set 2 cmd 1`, `stopSequence Sleeper4` / an ELSEIF on `set 2 cmd 22` (R2: false) |
| MP53 | `chopper_rescue1`, `start`, IF @1 | called by the round script | `mp_round_count == 1 OR mp_round_count == 3 OR mp_round_count == 5` | else | its branch on rounds 1, 3, 5 | `OBJECT_MOTION_SI_SCRIPT`, `call chop_hover` on both sides (the scripts differ by their payload) |
| MP53 | `chopper_rescue2`, `start`, IF @1 | the same | the same | else | the same | the same |
| M63 | `int_low7_start`, `on_aware4`, IF @2 | named by no data (the C code's, by name) | `Int_Main_Amb == 1 OR Int_Main_Amb == 2` | else | its branch at 1, 2 | `set 2 cmd 28`, `set 2 cmd 10`, wait 3 s / nothing |
| M63 | `int_main1_start`, `on_aware4`, IF @2 | the same | `Int_Main_Amb == 1 OR Int_Main_Amb == 3` | else | its branch at 1, 3 | the same |
| M63 | `int_main2_start`, `on_aware4`, IF @2 | the same | `Int_Main_Amb == 1 OR Int_Main_Amb == 3` | else | its branch at 1, 3 | the same |
| M63 | `int_main6_start`, `on_aware4`, IF @2 | the same | `Int_Main_Amb == 1 OR Int_Main_Amb == 2` | else | its branch at 1, 2 | the same |

Of the 32 only the first is a program today's port runs: an action's animation through the world
(`WorldState.executeAction`), the gate's motion PR #427's to draw; the campaign maps' programs, the AI's `Corpse_Found`
(named by no data; the C code's, by name) and the round script's calls are not run. The whole table, every row and state, is the tool's
output (`SOCOM_PC_ROOT=<desktop tree> npx tsx tools/sweep-effect-conditions.ts`).

## 19. The tracer: the zAnim on a flying object (2026-10-21; rewritten 2026-10-23, #425's takeover; reading, pending review)

**Which round.** The round's tracer branch (`FUN_003cabe0` D:L320537-320553) draws one when the weapon's round count
(`+0xb8`) is a multiple of 4 (§4's `tracerRound`). It sets the round's model by its kind `+0xb4` -- 0 the ally's
(`DAT_004b5338`), 1 the enemy's (`DAT_004b5330`); the turret's round is 1 (D:L300350, research 215 §7.6) -- launches it
(`FUN_003d5030`, acceleration `DAT_003e1570` = 400, the pool `0x4b5260` of 100), and puts the model back
(`DAT_004b5328`).

**The launch** (`FUN_003d5030`, D:L327184-327240). No free slot: nothing (D:L327184-327185). A shot shorter than 70
units: nothing (D:L327195-327196). Then, with `DAT_003e1568` set -- it is 1 in the disc's ELF -- the object's model is
cleared (`FUN_003178a0(obj, 0)`) and the zAnim is started on the object (`FUN_00272bb0(anim, 1, 3, obj, 0)`): the ally's
`DAT_004b5340` unless the model is the enemy's, then the enemy's `DAT_004b5348` (D:L327199-327211). So the original draws
no line-strip model for a tracer at all; what is seen is `tracer_ally_anim` or `tracer_enemy_anim` (each a `redpuffs`
source, `effect_spark01.tif`, then a 0.3 s wait: `scene/test/effects.test.ts`), the turret's round the enemy's. The
object starts `(rand() % 990 + 1) / 10` units -- 0.1 to 99.0 -- down the shot from its origin (D:L327213-327223;
`TRACER_START_ROLL_READING`), at speed 0 (D:L327231), its end the round's end, its range the weapon's
(`FUN_003d27f0`: the record's `+0x3c`, Maximum_Range in world units, research 91) or 300 without one (D:L327232-327236).

**The flight** (`FUN_003d4bf0`, D:L327055-327093), once a game frame from the world's projectile tick (`FUN_003d1f90` ->
`FUN_003cc990`): the speed grows by `dt x 400`; past the range the tracer retires where it is; otherwise it steps
`speed + 1` units toward its end -- the direction taken afresh (`FUN_003090a0`), the step not scaled by `dt` -- and a step
that would pass the end puts it there and retires it. A retired one is freed on the next frame (`FUN_003d4ed0`,
D:L327043), so it is drawn at its end for a frame.

**The object.** The round builds the tracer object's matrix -- an identity scaled by 7.5 times a rotation taking +x to
the shot (`FUN_003cabe0` D:L320498-320514) -- and the launch sets it (D:L327256-327257). A retired tracer's zAnim is
never stopped: the launch zeroes the slot's anim handle after starting it (D:L327210, D:L327224), so the free
(`FUN_003d4ed0` D:L327136-327137) has nothing to stop and the anim runs out (`TRACER_RETIRED_ANIM_READING`).

**The port.** `scene/src/tracerFlight.ts` is that launch and flight; `viewer/src/effects.ts` starts the kind's zAnim on
the flight's object and steps the flight in whole game frames of the page's time, freeing the retired ones first; the
object is turned along the shot and scaled 7.5 (`TRACER_ORIENTATION_READING`, `TRACER_OBJECT_SCALE`); a retired one's
anim runs out where the flight left it. The round's weapon carries its range
(`FireWeapon.range`, `Maximum_Range x UNITS_PER_METRE`). A map without the kind's zAnim draws no tracer from the
effects, and `Fire` keeps its one-frame line. `?devmode&tracerhold` (`tracerHold`) is a dev instrument, not the
original's: a tracer is put at its end and kept, off unless that URL flag is set.

**Was (#425 as filed, refuted by its review, 2026-10-23).** The map's line-strip model (`tracer`, `tracer_ally`,
`tracer_enemy`: one 30-unit strip, `white8x8.tif`, alpha only at the tip) cloned and flown from the muzzle at `½·a·t²`
per page frame, the turret on `tracer` and an absent `tracer_anim`, no 70-unit minimum, no start offset, a full pool
evicting its oldest, with a near-plane clip and a tip clearance for the line. The model decoding (`effectModels.ts`'s
line strips) stays: the strips are the disc's, though no tracer draws them.

**The turret's count across pulls.** The port's tracer number is `TurretPage.fired`, from 1 at the mount, passed as
`round().count` into `tracerRound`. It is zeroed in `setHeld` when the held turret changes, and not when the trigger
is released (turret `+0x2b0`, D:L300351-300353, research 215 §7.6; whether a release clears it is unread).

**Who sees which.** The page's own round is ally (`tracerKindFor` with the viewer's side). A turret weapon, ids
205-229, is the turret's kind, another player's included. A remote shot uses the same every-fourth rule, counted on the
shots this page has seen of that player this round (`netPage`), ally when that player's team is the viewer's
(`TRACER_REMOTE_COUNT_READING`: the original counts the shooter's own `+0xb8`; whether another console sees that number
or counts its own is unread). A through-surface copy of the round plays the impact only.

## 20. Smoke visibility: original distance fade and sorting (2026-10-27)

The reported see-through smoke prompted a current-main investigation at `b21f4c2b2`; the record and rendered
diagnostic limits are in [the investigation plan](../plans/2026-10-27-smoke-visibility-investigation.md).

**Distance fade is original behavior [reading].** Re-read from the original game ELF's decompilation:
`FUN_00266830` squares the command's near/far endpoint fields and stores their reciprocal spans
(D:L113213-113243). `FUN_00327910` computes the particle's camera-relative distance squared
(D:L225490-225494), passes it directly to `FUN_003286d0` (D:L225506), and multiplies the sampled particle alpha
by that fade before GS colour conversion (D:L225579-225585). `FUN_003286d0` returns zero outside its endpoint
limits, a linear-in-squared-distance fade across each transition, and one between them (D:L225901-225919).
The caller does not draw when the multiplier is at most 0.01 (D:L225507). There is no explicit zoom multiplier
in this per-particle fade call; this does not establish every scope path's complete rendered result.

The disc reader decoded the MP2 and MP6 `smoke_stream` large-puff sources with near `[0,0]` and far `[100,500]`.
For those fields, the far multiplier is one through 100 units, `(250000 - distanceSquared) / 240000` between
100 and 500, and zero from 500 onward. This is not the puff's final opacity: texture alpha, lifetime colour keys,
overlap and camera position also matter. Source-alpha blending and these fade rules do not specify a completely
opaque wall at every distance. The earlier investigation's distance-dependent visibility is therefore not, on
its own, a demonstrated departure from the original. Removing this fade would need an explicit adaptation decision.

**Sorting [reading].** The original constructs a single particle pointer list and sorts it by each particle's
distance (`FUN_00326a00`, D:L224884-224922; comparator `FUN_00325080`, D:L223890-223893).
`FUN_00336cb0` interleaves particle drawing with its other render list (D:L235146-235180), draining particles
through `FUN_00324c70`/`FUN_003250b0`. The exact interleave threshold call requires disassembly: the callee
declares two floats (D:L223751) while the decompiler prints only one argument at D:L235152. This note does
not settle that missing argument.

The browser instead groups puffs by texture and sorts within each group (`ParticleSystem.draw`). At the investigated
baseline, its cached geometry bounding sphere included unused capacity and was not refreshed as particles moved. The investigation
reproduced a fully visible transparent test target behind otherwise dense smoke when the cached sorting centre
fell behind the target. That browser diagnostic establishes a sorting defect in the tested path, not the exact
conditions of the user's player report. The default MP2/MP6 SEAL body materials sampled were opaque.

**Browser correction (2026-10-27; a browser adaptation: three's per-object transparent sort; the original sorts per particle (§20)).** `ParticleSystem.draw` now refreshes each visible batch's bounding sphere from
only the vertices actually drawn that frame. This supplies Three's transparent sorter with the current cloud's
location, excluding unused and retired slots. It preserves source alpha, depth testing, distance fade, emission
and lifetime. Four regression tests failed on baseline and pass with this correction. A rendered WebGL2 probe
using MP2/MP6 smoke data verifies background concealment and foreground visibility in the reproduced setup;
the investigation plan records the measurements. One texture remains one batch: clouds spanning other transparent
objects still cannot interleave particle by particle as in the original. This correction does not settle that
separate architectural limitation or establish original-console visual parity.

**Evidence level.** Independent source review passed for the fade arithmetic, absence of an explicit zoom factor
in that call, and the sorting structure above. The reviewer did not independently decode the disc values or run
the rendering probe. No original-console smoke capture was compared; visual parity, complete concealment of
players in a live match, and exact scope behavior remain unmeasured. One small boundary difference was found:
the original returns zero at exactly zero camera-to-particle distance with near `[0,0]`, whereas the browser skips
that near-fade branch. This single-point case does not explain broad see-through smoke.

### 20.1 The marks against the alpha pass (OBF-32, 2026-10-31; reading, pending review)

Craig's playtest (2026-10-31, MP2 at night): bullet holes stayed sharp inside a smoke grenade's cloud. #566 had fixed
only the smoke batch's sorting sphere (above); the marks were outside its scope.

**The original [reading, pending review].** Re-read at the decompilation for OBF-32:
- `FUN_003b3800` links each mark packet `FUN_003beca0` writes (§13) into the struck visual's own chain: the list at
  `*(visual+0x2c)` indexed by the instance context, appended at its tail (D:L306396-306413).
- A visual is drawn through its table's slot `+0xc` (`FUN_003b5340`, D:L307371-307380; research 318 §1.1) from the walk's
  `FUN_003374c0` (D:L235435), or handed to the alpha list (`FUN_003371b0`, D:L235438) and drawn from the alpha pass
  `FUN_00336cb0` (D:L235172). Both reach `FUN_003b4580`.
- `FUN_003b4580` first builds each part's command list with `FUN_003b5f20` (D:L306946, D:L306993, D:L307040,
  D:L307083); that list carries the reflection (`FUN_003b5b90`, D:L307913, D:L307973; research 330 R330.2) and the
  detail pass. Then, for a visual whose byte `+4` is not 1, it walks the chain
  `FUN_003b52b0(visual+0x24, context)` = `*(visual+0x2c) + context*4` (D:L307165-307190; the context is the top of
  `0x4b4a40`, `FUN_003b52c0`) -- the list `FUN_003b3800` fills. So a mark goes out right after its visual's base,
  reflection and detail pass, in the same pass as its visual.
- **The outer branch (D:L307119-307127).** A visual whose byte `+4` is 1 takes the other branch: it ships the list at
  `visual+0x6c`, and only when the context's entry in `visual+0x38` is LOD 0's geometry (`FUN_003b9480(visual, 0)`,
  `*(visual+0x80)+8`; D:L307125-307127). Byte `+4` is the visual's kind: `FUN_003c4190` reads it from the data
  (D:L316022-316045): 2 builds the skinned visual (`FUN_003b8cd0`, `+4` = 2 at D:L309636), 1 the LOD visual
  (`FUN_003b9760`, `+4` = 1 at D:L309959; its distance table at `+0x80`), 0 the plain one (`FUN_003c4390`), and an
  absent key (-1) the plain one too (D:L316045-316050). The decal walk sends kind 2 to
  `FUN_003b8680` (D:L213925-213928), not to `FUN_003b3800`; kind 1 does reach `FUN_003b3800` through `FUN_003b3950`, but
  its `+0x2c` list is not walked by this function, which walks `+0x6c` instead. So a world wall of kind 0 (or with no
  key) always takes the chain path. Whether a mark on a kind-1 visual is drawn is open: what the `+0x6c` list holds is
  not read, nor which map visuals are kind 1 (below). In no branch is a mark drawn after the particles of its own pass.
- The particles drain in the alpha pass `FUN_00336cb0` (D:L235146-235180), called at the end of RenderWorld
  (`FUN_00339de0` D:L237235), with `ZMSK` 1 (no depth write) from D:L235137 to D:L235185 (research 82 D9).
- So a mark on a wall drawn in the walk goes out before every particle, and the smoke blends over it exactly as over
  the wall under it. The rule is the walk's, not a map's: it holds for every map.

**The port.** Two named orders in three's transparent list, between the walk and the world's alpha pass:
`viewer/src/fire.ts` `WALK_DECAL_RENDER_ORDER` (0.875) for the bullet marks (`Fire.place`), the footprints
(`Effects.footfall`) and the grenade's scorch (`GrenadeThrower.keepScorch`, the clipped and the bare square), and
`viewer/src/particles.ts` `PARTICLE_BATCH_RENDER_ORDER` (0.9375) for every particle batch. In three's order (the default,
`world.ts` `engineOn` false) the world's transparent draws are: a blended walk draw at `order * 2^-24`
(`REST_WALK_SCALE`, `restOrder`), its detail pass at +0.5 and its env pass at +0.75 (`detailRenderOrder(base, true)`,
`addDetail`, `addEnv`), the alpha pass and the shadows at 1 (`ALPHA_PASS_REST_ORDER`), their detail and env passes at
1.5 and 1.75. So: walk base < detail < env < decal < particles < alpha pass and shadows -- the original's base,
reflection, detail, then mark (above), then the particles after the walk. The gap holds while a walk order stays under
2^21: a placement rank under 8192 (`loadMap.ts` `orderOf`, rank * 256 + 255; the `REST_WALK_SCALE` comment says a few
hundred, and the parity-2 review compared 18,342 placements over 34 maps); `walkDecalOrder.test.ts` pins an env pass at
rank 8191. The polygon offsets and blends are unchanged; the wall's depth still hides a mark behind it.

Was: the marks and footprints at 1 (W2.5, uncited), the scorch and the batches at 0 -- every mark after every puff, at
any distance. OBF-32's first cut (-1, under the batches at 0) drew a mark under its own wall's blended packet, detail
and reflection -- a mark on reflective glass, ice or a car panel washed by the env pass, a footprint on a vertex ramp
(research 82 D8) faded by its own packet; the review's F1, folded here.

**What moved.** Both sides moved, so that every relation the original orders the same way holds:
- **Decals against the walk's blended draws and their passes**: after them, as at 1. For a mark on its own visual that
  is the walk's order. One case stays off it, as it was at 1: a blended draw of a later visual (an overlay laid over a
  marked base) goes out after the mark in the walk, and sorts before it here.
- **Decals against the alpha pass and the shadows**: were z-sorted with them at 1, now always before -- the original's
  order for a mark on a walk visual.
- **Particles against the walk's blended draws and their passes**: were before them (0), now after -- the original
  drains the particles after the whole walk.
- **Particles against the alpha pass, the shadows and their passes** (1, 1.5, 1.75): before, as at 0 (LATER 593).
- **The viewer's other transparent draws left at 0** (the tracer, the effect models): were z-sorted with the batches
  (both at 0) and before the marks; now before both -- a tracer crossing in front of a dense cloud has the cloud blended
  over it (LATER 593). The original draws a tracer or an effect model as a visual, in the walk or on the
  alpha list (research 318 §1.1's rule) -- in the walk it goes before the particles and before or after the mark by
  the walk; on the alpha list it interleaves with the particles by distance. Which list each one takes is not read
  here, so neither the old order nor the new is shown to be the original's for them.
- **The engine order on** (`setEngineOrder`): the walk is in the opaque list and the alpha pass at `base + i`, above
  both values, so the decals and the particles stay before the alpha pass. The walk's env passes (always transparent)
  sit at `i + 0.75`: after the decals and the particles for every walk index past 0, as they were after the marks at 1
  -- the engine order's own numbering, unchanged here.
A mark on a visual of the alpha list (a window) goes out with that visual inside the alpha pass, interleaved with the
particles by distance; the port draws it before them. That is LATER 593's case too.

`viewer/test/walkDecalOrder.test.ts`: the first cut's RED 5 of 5 then GREEN 5 of 5; the fold's RED 5 failed, 7 passed of
12 (the decals at -1 before a vertex ramp at 256 * 2^-24; the batches at 0 before it), GREEN 12 of 12.

**Evidence.** Source inspection and a unit test of the sort (three's `reversePainterSortStable`). Not run on this host
(the owner's playtest): the viewer's typecheck and a rendered check -- #566's harness, the mark's contrast behind dense
MP2 smoke under 1% -- owed off it. No console capture compared.

**Open.** For a kind-1 (LOD) visual `FUN_003b4580` walks `+0x6c`, not the `+0x2c` list `FUN_003b3800` fills
(D:L307119-307127); what `+0x6c` holds is not read, so whether a mark on one is drawn is not settled. Which disc visuals
are kind 1 is not read either (`FUN_003c4190`'s key at `0x3fc4e8`, over every map's visuals); the `+0x6c` list's writer
read, or a frame of the original with a round fired into one, would settle it. The port draws a mark on whatever the clipper finds.
