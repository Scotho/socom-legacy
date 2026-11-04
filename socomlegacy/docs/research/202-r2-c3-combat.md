# 202 -- R2-C3 -- combat, HUD, effects: round 2 on C3's open rows

- Research date: 2026-10-04 (research wave 1, round 2 and the close; the index is [178](178-the-research-wave-of-2026-10-04.md)).
- Origin: `research-wave-2026-10-04/R2-C3-combat.md` on the owner's host, in the evidence archive ([178](178-the-research-wave-of-2026-10-04.md) gives its root). A relative `scratch/...` path below is under `research-wave-2026-10-04/`; the per-cluster `ledger-*` files it names are merged in [`ledgers/2026-10-04/LEDGER-ALL.tsv`](ledgers/2026-10-04/README.md).
- Trees compared: **PORT** = `agent/online` at 2026-10-04 (written `$PORT`; `$PORT/..` is that branch's root, `$WEBISSUES` the `agent/web-issues` checkout); **WT** = the old-layout checkout (`$WT`, the clone's pre-restructure web project). WT-96..102 are notes 171-177 here; PORT's own notes 96-102 are other notes.
- **Status: reading, pending review -- not adopted.** Nothing in it is adopted until a sprint task takes it and a reviewer re-reads it at the source.
- **Adopted in part (2026-10-16, web sprint 40 AD-4, at reading):** §2.2's filter (no penetration test) and §3.4's PROBE (the scorch's column and selector), after the reconciliation's chunk 08 re-read them at the source (C11, C12); see the "Adopted" lines of §2.2 and §3.4. The rest of the note stays as above.
- Grades, translated to AGENTS.md's levels: the wave's PROVEN = an exact source read = **reading**; STRONG = reading with one interpretive step; BELIEVED = inference; UNRESOLVED = unresolved. The text keeps the wave's words.
- Verification: V5 (the grenade-spin dispute, the C4 reach, the ringing ears) and V7 (claims 1-4) have landed and are folded in as §7 and §8. V5 settled the spin dispute for R2-C3 against C3 and V1; V7 corrected the flashbang and NVG timelines.
- Edits on import: the headings are numbered for the corpus; home-directory paths are replaced by `$PORT`/`$PORT/..`/`$WT`; the archive's absolute root is dropped; references to the other reports are links to their notes; the claims research 206 §1 overrides are named under this header. The substance is verbatim.

**Overridden in part (research 206 §1):** the flashbang glow timeline (item 13) -- it starts 0.2 s after the flash: level 3 is at full glow 0.2-8.2 s and clear at 10.2 s (V7 #1, §8.2).

**Overridden in part (research 206 §1):** the NVG iris values and colour (item 11) -- those values last only 0.4 s, then thresholds 0.3 / -0.05 at 0.7 s rates; the (200,255,200) colour is never used: no green tint (V7 #2, §8.3).

Research agent R2-C3, 2026-10-04. Scope: every `ledger-C3.tsv` row with status UNRESOLVED or PARTIAL, plus C3's ([181](181-c3-combat-hud-effects.md))
"not attempted" list. That list covers the grenade launcher's HUD count, the charge-placement heights, the scorch marks,
the ringing-ears volume, the sound priority slot, the pad-glyph placement, the thermal scope's remaining effects, the
menu model form, and the grenade's spin after a bounce. It also takes the owed backblast pitch.

Ground rules:
- Read-only. Every script is in `scratch/R2-C3/`, and its `README.md` says what each one prints.
- `scratch/R2-C3/cites.out` reprints every decomp window cited below (61 windows), so a reviewer can re-read them
  without searching.
- `D:L<n>` is a line of `socom2_game.elf.decomp.c` (r0001). Addresses are r0001.
- `$PORT` is the `agent/online` snapshot.
- The frame is 30 Hz (settled).

**Wave-2 check.** `wave-2/W2-A-combat-actor-gaps.md` covers three things: the explosion obstruction flag
(`IgnoreExplosionDI`, A11), the C4 prohibited surface (`INVISIBLE_DI`, A10) and the shotgun guard (A09). None of them is
re-derived here. C4 targeting appears below only for the reach (`body+0x208`), which W2-A ([194](194-w2-a-combat-actor-gaps.md)) does not read.

**One correction to round 1.** `SPIN_PLACEHOLDER` was RESOLVED by C3 as "0 in flight", and V1 confirmed it. That
answer is wrong.
- V1 confirmed only that `SetModelOrientation` (`FUN_003cabe0`) never turns category 0x79. That much is true.
- But the projectile tick's free-flight step, `FUN_003c9530`, turns the model of every hand grenade on every step it
  moves freely, through its own Euler angles (section 20).
- The README's headline "grenades that spin" should therefore read "grenades that spin the wrong way". The port's
  14 rad/s random tumble is a placeholder for a sourced rule, not for zero.

## 1. Summary

| # | Item | Status | Grade | One-line answer |
|---|---|---|---|---|
| 1 | ARC_DEPTH_TEST_PLACEHOLDER | RESOLVED | PROVEN | Depth-tested. The arc's line packet writes `TEST_1 = 0x5000c` (ZTE on, GEQUAL). The port's `true` is right. |
| 2 | C4_REACH_READING | RESOLVED | STRONG | `body+0x208` = \|aim hit − skel_root\|², written each frame by `FUN_00215c10`. C4 needs < 396 (19.9 u). |
| 3 | HUD_ROUND_MODE_COUNT_READING | RESOLVED | PROVEN | The round slot's magazine / its item's `Ammo_Capacity`. MAGS = non-empty magazines − 1, hidden below 1. M203 HE: `6/6`, no MAGS. |
| 4 | PLACE_CAST_LIFT_READING | RESOLVED | STRONG | 0. Highest surface at or below the hand. If none, the lowest in the column. No penetration filter. |
| 5 | PLACE_REST_LIFT_READING | RESOLVED | STRONG | 0. The charge sits exactly on the column's hit point. |
| 6 | RING_VOLUME_READING | RESOLVED | PROVEN | The ring is the only sound in volume group 4, the one group the duck leaves alone. UI (14) and headset (7) are also untouched. |
| 7 | SCORCH_PARTIAL_ORDER_READING | RESOLVED | STRONG | Node-tree walk from the hit's decal root. Visuals with vparams bit 16 in list order, then children. Triangles in packet order. A full pool drops the rest. |
| 8 | SCORCH_PROBE_READING | RESOLVED | PROVEN | Above 10. Below unbounded. No material filter in the choice. |
| 9 | SOUND_PRIORITY_SLOT_READING | RESOLVED | PROVEN | Unreachable on retail data. All 417 such commands are `MUS_*` objective cues (0x880), already routed to `playMusic`. |
| 10 | SPECIAL_GLYPH_PLACEMENT_READING | RESOLVED | STRONG | One glyph emitter for HUD and dialogs (`FUN_00361bd0`, its only caller `FUN_003635c0`). The dialog-frame match carries over. |
| 11 | THERMAL_LENS_FX_READING | RESOLVED | STRONG | The IRIS is a 4-pass auto-gain glow (half-res copy × 0x55/128 × FIX/128 added). The CAMERA sets fog colour (0,0,0.01). The restore sequence is decoded. |
| 12 | UI_MODEL_FORM_READING | RESOLVED | STRONG | Data bit, not a fit: vparams bit 17 selects VU command 0x70 (`scale`), else 0x68 (`bias`). UI 0/133, weapons 212/212. |
| 13 | BLIND_FULL_READING | RESOLVED | STRONG | The white-out is a BLUR3D glow (2–3 additive half-res passes at FIX up to 255) on top of the `TRUE_COLOR_SCALE` lift. Per-level timelines are read. |
| 14 | FIREPOINT_203_READING | RESOLVED | STRONG | The fallback `body+0x14bc` is the held model's `firepoint` (the muzzle), refreshed at each mount. |
| 15 | MOUNT_BLEND_READING | RESOLVED | STRONG | No weapon ease. Only the pose cross-fade, 0.4 s: the swap's four clips (`seal_rifle2pistol` and kin) have no `BlendTime` key, so the parser default applies; the re-parent is instant by the `+0x42` reading (research 211 §3.5). Landed by the owner's ruling, 2026-10-04. |
| 16 | NO_FIREARM_RECORD_PLACEHOLDER | RESOLVED | STRONG | The Designator (11) fires nothing: no projectile and no round used. The fallback should be "no shot". |
| 17 | PEEK_THROW_READING | RESOLVED | STRONG | State 3 comes from StartPeek whenever a lean side is set. The player's side needs pad pressure > 0.03 and a clearance ray (9.5 u R / 7.84 u L). |
| 18 | PULSE_PHASE_READING | RESOLVED | STRONG | The picker's Init runs once, when the HUD is built, not per opening. Every pulse carries over between openings. |
| 19 | STICK_FOLLOW_PLACEHOLDER | RESOLVED | STRONG | `ctrl+0x138` is the pad pitch axis, clamped to [−1, 1]. Follow = 0.04 × max(0, axis) per frame. |
| 20 | SPIN_PLACEHOLDER (bounce/roll; **corrects C3**) | RESOLVED | STRONG | Hand grenades tumble on every free step. The rates depend on the step's displacement; slow rolling settles with a wobble. |
| 21 | BACKBLAST_CONE_AXIS pitch (C3 owed) | PARTIAL | STRONG | The body node is yaw-only in both Frostfire dumps. An aim-up dump is still owed. |

**Counts:** 21 rows. RESOLVED 20, PARTIAL 1, UNRESOLVED 0. Grades: PROVEN 5, STRONG 16. The ledger is
`ledger-R2-C3.tsv`, produced by `scratch/R2-C3/write_ledger.py`.

---

## 2. Gameplay items

### 2.1 Item 2: C4_REACH_READING (`$PORT/packages/viewer/src/equipment.ts:143`)
- **What it stands for**: C4 readiness's distance gate, `body+0x208 < 396` (D:L452032, 452386, 475402).
- **Current value**: none. "The target's own reach stands for it."
- **Prior search** (C3):
  - `scan_store.py 0x208` over the seal-body code found only the init store of 100000 (`FUN_00553ea0`).
  - Four dumps read 100000.
  - Owed: a write breakpoint.
- **What I did**:
  - `scan_208.py` scans the whole code segment for every store that can reach `+0x208`.
  - Besides stack stores, it finds `FUN_00215c10` (D:L69906). That is the HUD's per-frame tick for the local body, whose
    `$s4` comes from `FUN_001fcd70`.
    - At 0x215c8c it stores 100000.0 to `0x208($s4)`.
    - At 0x215f08 (a delay slot) it stores `|v|²`.
  - Decomp D:L69993-70063 shows how `v` is built. `FUN_005aa6d0(body)` is the aim ray's hit record. If the hit
    object's `+0x94` interactor accepts the kit's current item (vtable +0x10), `v = hit − P`. `P` is the world position
    of the node returned by CZSealBody vtable slot +0x88.
  - Slot +0x88 (vt 0x6691a0) is `0x553db0: lw v0, 0x2e8(a0)`, which returns `body+0x2e8` = `skel_root` (V1: the ctor's
    `FindPart("skel_root")`).
  - `P` is computed as `FUN_002869d0` (the skeleton point) → `FUN_00306fd0` (the body quaternion `+0x50`) → plus the body
    position (`+0x1c`).
- **Answer**:
  - `body+0x208` is the squared distance from the SEAL's `skel_root` to the point his aim ray hits.
  - It is 100000 when the aim hits nothing, or hits something that refuses the held item.
  - C4 can be set when it is below 396, so the aimed point is within 19.90 units (about 2 m) of the root.
  - STRONG: the store and the slot are read exactly. The interpretive step is the hit record's layout (its first vec3
    is the point), the same use the C4 settle timer makes of it.
- **Implementation suggestion**:
  - `c4InReach = distSq(skelRootWorld, aimHitPoint) < 396`, evaluated only when the aimed object accepts C4. This
    replaces "the target's own reach".
  - Test: aim hit at 19.8 u from the root → ready; at 20.0 u → not; aim at a non-plantable surface → never.
- **Owed evidence**: a dump while aiming at a demolition target within 2 m. Expect `body+0x208` to equal the squared
  distance from `skel_root` to the hit, below 396.

### 2.2 Item 4–5: PLACE_CAST_LIFT_READING / PLACE_REST_LIFT_READING (`$PORT/packages/viewer/src/net/placing.ts:19`, `:25`)
- **What they stand for**: the page's cast starts 1 above the hand, and the charge is set 0.1 above the surface found.
- **Prior search**: not attempted. The notes name `FUN_005c2430`'s column and `FUN_005bc730`'s height (R85 L615-616).
- **What I did**:
  - `FUN_005c2430` (D:L477195-477250) builds the right hand's world point and then calls `FUN_0031dea0`.
    `FUN_0031dea0` (D:L220004-220023) arms the world's query object as a type-2 vertical column at the point's x, z,
    and `FUN_002d49c0` fills it with every surface the vertical line crosses (0x20-byte entries, height at `+4`).
  - The loop keeps two surfaces from the filtered entries:
    - the highest whose height is at or below the hand's y;
    - the lowest overall.
  - It returns the first, or if there is none, the second.
  - The filter accepts no material, or a material with `+0x3c` bit 0 (VOLUMETRIC) clear and bit 1 (LIQUID) clear
    (the caller passes 0). The bits are the port's own `projectile.ts:309` names.
  - The placing branch (D:L476999-477010) tests `feet − 10 < height`. It then passes the entry's x, y, z unchanged to
    `FUN_005bc730`, with the body's orientation (`+0x50`).
  - `FUN_005bc730` (D:L473998-474004) puts the model there (`FUN_003157d0`), and `FUN_003cb1a0`/`FUN_003cabe0` start the
    projectile at the same point.
- **Answer**:
  - CAST_LIFT = **0**: surfaces up to the hand's height, not 1 over. If none lies at or below the hand, the original
    takes the **lowest** surface in the column, even if it is above the hand. The feet test still applies.
  - REST_LIFT = **0**: the charge's origin is exactly on the surface.
  - The original's filter has no penetration test. The port's extra `penetration !== 1` is its own.
  - STRONG: the code is unambiguous. The interpretive step is the query type 2 being a full vertical line, inferred
    from its x, z-only setup and its use here and for the scorch.
- **Implementation suggestion**:
  - Set `PLACE_CAST_LIFT = 0` and `PLACE_REST_LIFT = 0`.
  - Make the cast span the whole column. Select "highest ≤ hand, else lowest", then the feet test.
  - Drop `penetration` from `restsOn` for this use.
  - The room check (`chargeRests`) changes with them: `ground = from[1]`. The slack placeholder stays the network
    tolerance.
  - Tests:
    - a ledge 0.5 above the hand is not chosen when a floor lies below;
    - under a table with nothing below the hand inside the column, the lowest surface is chosen;
    - the charge's y equals the surface's y.
- **Adopted, the filter (2026-10-16, web sprint 40 AD-4; reading -- the reconciliation's chunk 08 re-read it at the source, C11):** `FUN_005c2430` D:L477228-477230 keeps an entry whose material slot is empty, or whose `+0x3c` bit 0 (VOLUMETRIC) and bit 1 (LIQUID) are clear (LIQUID allowed only by the argument, which the placing branch passes as 0, D:L477002); no penetration test. Built: `net/placing.ts` `restsOn` (the page's placing, the room's `chargeRests`, the bomb's ground); `placing.test.ts` over the disc's 44 SOILS (exactly ACTION, INVISIBLE_DI and ITEM newly accepted), `roomEquipment.test.ts` and `roomBomb.test.ts` ("AD-4"). *Was:* also `penetration !== 1`, the port's own (LATER 38).
- **Adopted, the selection and the cast lift (2026-10-16, web sprint 40 AD-4; reading, C11):** the world column (`FUN_0031dea0` D:L220004-220023 -> `FUN_002d49c0` D:L175812-175818, +/-50000 at the hand's x and z); of the accepted entries the highest at or below the hand (D:L477231-477235), else the lowest (D:L477236-477239, D:L477247-477249) -- at equal heights the later entry in both (an earlier best is kept only on a strict `<`); the feet test after (D:L477005). CAST_LIFT = 0. Built: `net/placing.ts` `placeGround` (the page's `placeCharge`), `chargeRests` (the room: the ground at or under the eye, or over it the column's lowest accepted surface), `room.ts`'s hand path at feet + `CHARGE_HAND_HEIGHT_PLACEHOLDER` (was + 1); `placing.test.ts`, `roomEquipment.test.ts`. *Was:* a cast from 1 over the hand down to the feet less 10, its first accepted surface. REST_LIFT = 0, adopted with it: the charge sits on the entry's point (D:L477007-477010 -> `FUN_005bc730` D:L473998-474004); `room.ts` `startRefused`'s drop now stops `CHARGE_GROUND_SLACK_PLACEHOLDER` short of the point on the side it comes from, and is none when the point is level with the hand (the online seat's clearance), so the surface a charge rests on is no wall; `placing.test.ts`, `roomEquipment.test.ts` (a ledge at the hand's height, a table over the hand with nothing under it). *Was:* `PLACE_REST_LIFT_READING` 0.1, the page's own (retired).

### 2.3 Item 16: NO_FIREARM_RECORD_PLACEHOLDER (`$PORT/packages/viewer/src/loadout.ts:51`)
  - *A known edge, unbuilt (AD-4's review, F1, low):* the room's line across at the hand's height (`room.ts`
    `startRefused`) grazes the top edge of a ledge's riser when the ledge's top is exactly at the hand (feet + 8):
    `segment.ts` counts the edge as crossed, so such a ledge is refused 'hand walled' where the page takes it. Not new in
    kind -- before AD-4 the same graze fell at feet + 9; the test's ledge (`slab()`) has no riser. The fix (a crossing on
    a polygon's edge at exactly the line's height ignored) is the room's, the online seat's hunk.
- **What it stands for**: what a firearm slot fires when its item has no firearm record (the Designator, 11).
- **Prior search** (C3): empty and 0xfe slots are never selectable. "The Designator's fire is not read."
- **What I did**:
  - In the body fire `FUN_005c5340`, `bVar1` is the fired item's ID (`piVar23 = lVar15`, `+0x7c`, D:L479228-479229).
  - The projectile is allocated only when the item exists and `bVar1 != 0xb` (D:L479345-479349). Otherwise the
    projectile pointer is 0.
  - The round-use test (`bVar4`, D:L479325-479338) excludes ID 0xb as well. It also excludes 0xff, 0xfe, 0xc3, 0xc2,
    0x91, 0x8d, 0x92, 0xc1 and 0xbe.
  - `zweapon.rdr`'s Designator has an empty `AMMO_TYPES`, `Ammo_Capacity 10`, `ModelName laser_designator`
    (C3 `zweapon.txt` L1242-1292). The UI library has its preview `LasDes` (`ui_models.out`).
- **Answer**: the Designator fires nothing. No round is created and no ammunition is spent. STRONG (the ID test is the
  operand; what the shot's sound or animation do without a projectile was not read).
- **Implementation suggestion**:
  - Replace the baked-record fallback with a "no shot" record (fires nothing, consumes nothing) for item 11. Keep the
    baked pair only for a missing `ZWEAPON.ZAR`.
  - Test: `slotRecord(table, [11, …], 0)` fires no projectile, and its ring is unchanged.

### 2.4 Item 17: PEEK_THROW_READING (`$PORT/packages/viewer/src/grenade.ts:139`)
- **What it stands for**: when a throw becomes the lean toss. The port uses a peek value past 0.5.
- **Prior search** (C3): `GetThrowAnim` takes state `+0x174 == 3` and the playing lean clip. Where the state becomes 3
  was not found (no store with that immediate).
- **What I did**:
  - `scan_off.py 0x174` and `scan_misc.py` find no `sh`/`sw`/`sd`/`sq` to `+0x174` in the seal code. The short is the
    anim component's `+4`: `body+0x170` is that component, and `FUN_0028dfb0` (`jr ra; sh a1, 4(a0)`) is its setter.
  - The setter's only non-init caller is `FUN_0058a6b0`. Its address sits at `0x669230` = CZSealBody vtable slot +0x90
    (`SetBodyState`, which also notifies the controller, vt +100).
  - The vt +0x90 calls with 3 are all in `FUN_0057d810` (D:L440451-440508). That function is called every body tick
    (D:L418610), so it is StartPeek:
    - when the lean side byte `body+0x375` is not 2, it starts the lean clip (right 0x1e/0x20, left 0x1d/0x1f, and the
      prone leans `DAT_003deb08`/`DAT_003deb00`, chosen by the previous state 1/2/else);
    - it then sets state 3.
  - The player's controller (`FUN_00594cf0`, D:L453431-453457) writes `+0x375` every frame:
    - first 2 (none);
    - then, unless the state is 8, pad input 0xc is held, or a flag blocks it:
      - with pad input 7: left (0xff), if its pressure (channel 0x15)/255 > 0.03 and `FUN_00596d60(7.8375, …, −1)`
        passes;
      - otherwise, with input 5: right (1), if pressure (0x14)/255 > 0.03 and `FUN_00596d60(9.5, …, +1)` passes;
      - otherwise `FUN_0057dc80` (leave the peek).
  - `FUN_00596d60` (D:L453937-453975) is a clearance ray in body space from (0, h, 0) to (±d, h, 0), with
    h = min(8, the skel_root node's +4). It passes when it hits nothing, or a material of class 1.
- **Answer**:
  - There is a magnitude, but it is 0.03 of full pressure, not 0.5.
  - The lean also needs room: 9.5 u to the right, 7.8375 u to the left, at up to 8 u height.
  - While a lean side is set, StartPeek holds state 3. `GetThrowAnim` then picks the toss by the lean clip playing, or
    returns no throw (C3).
  - STRONG. Which physical buttons are pad inputs 5 and 7 (and pressure channels 0x14/0x15) is the controls map's
    business (C2 ([180](180-c2-movement-body-camera.md))/C5b).
- **Implementation suggestion**:
  - The lean starts above 0.03 of input and only when `leanClear(side)` (a ray of 9.5/7.8375 u at the hip height) is
    true.
  - The lean throw follows the lean state, not `|peek| > 0.5`.
  - Tests: input 0.05 with room → lean, and a throw tosses; input 0.02 → no lean; a wall at 5 u on the right → no
    right lean.

### 2.5 Item 19: STICK_FOLLOW_PLACEHOLDER (`$PORT/packages/viewer/src/rifleKick.ts:38`)
- **Prior search** (C3): 0.04 × `ctrl+0x138` per frame, positive only. The unit of `ctrl+0x138` was not read.
- **What I did**:
  - `ctrl+0x138` is written by `FUN_005966a0` (D:L453773) as `FUN_002c6280(pad)`.
  - That getter wraps `FUN_002c65b0` (D:L166969-167006). It sums the pad's `+0x224` and/or `+0x22c`, chosen by the
    control configuration's bit mask (with an inverted variant), and clamps the sum to [−1, 1].
  - The same value, × `DAT_00650628` = 1.72 (and × `DAT_003df198` = 1.0), is the look-pitch input.
- **Answer**: the follow is `0.04 × max(0, pitchAxis)` per 30 Hz frame, where `pitchAxis` ∈ [−1, 1] is the stick
  deflection that also drives look pitch. STRONG (the sign convention of `+0x224`, which way is positive, is the pad
  normaliser's, not read here).
- **Implementation suggestion**:
  - Gamepad only: `rest += 0.04 * Math.max(0, pitchAxis)` per 30 Hz frame, capped at the pitch, using the same axis
    (and sign) the port feeds its look pitch before the 1.72 scale. The mouse stays 0.
- **Owed evidence** (minor): one dump with the right stick held up and one held down. Read `ctrl+0x138` to fix the sign.

### 2.6 Item 20: SPIN_PLACEHOLDER: bounce and roll, and in flight (`$PORT/packages/viewer/src/grenade.ts:57`) -- corrects C3
- **What it stands for**: the thrown grenade's tumble. The port uses 14 rad/s about a random axis.
- **Prior search**:
  - C3 said "0 in flight; bounce/roll not read".
  - V1 confirmed that `FUN_003cabe0` never turns category 0x79. That part stands.
- **What I did**:
  - The projectile tick `FUN_003c9fb0` (dt = `param_1`; the fuse timers count down by it, D:L320127-320131) calls
    `FUN_003c9b70` for every non-hitscan round (D:L320162).
  - `FUN_003c9b70` sweeps the step against the column of surfaces. When nothing is hit (D:L320015-320016), it calls
    `FUN_003c9530(dt, proj, &out)`, the free step. A hit goes to `FUN_003c8f50` (the hand grenades' bounce) or
    `FUN_003c8920`.
  - `FUN_003c9530` (D:L319776-319845): for a projectile whose record casts to category `'y'` (0x79, the hand grenades)
    and whose state `+10 != 2`, it computes `d = |pos_new − pos_old|` for this step (`+0x54 − +0x48`), then three rates
    (half-turns a second):
    - `d ≥ 0.5` (≥ 15 u/s):
      - if `d > 15` (> 450 u/s): x 10, y 2.5, z 50;
      - else, with `t = (d − 0.5)/15`: x = 10 − 9.5t, y = 2.5 − 2t, z = 50 − 49.5t. At d = 1 that is (9.68, 2.43,
        48.4); at d = 10, (3.98, 1.23, 18.65); at d = 15, (0.82, 0.57, 2.15). The jump back to the maximum above 15 is
        the code's.
    - `0 < d < 0.5` (rolling slowly):
      - `v` = `FUN_003156a0(model)` (C3: the model's Euler angles through `FUN_00308020`);
      - if `|v.y| > 0.2` (`fabs` + compare with 0.2 as a double), the rates are `(1 − v.y) × (x 0.1, y 0.4, z 0.02)`;
      - otherwise 0.
    - The stuck flag `+0xb` gives no rates.
  - The angles at `+0x9c` (x), `+0xa0` (y), `+0xa4` (z) each grow by `rate × π × dt` and wrap at 2π.
  - They are built into a matrix by `FUN_00307360` and set on the model by `FUN_00315790(proj+0x20, m)`
    (0x3c9870-0x3c9898, `cites.out`).
  - `FUN_003cabe0`, called afterwards, writes only the position for 0x79 (C3), so the rotation stands.
- **Answer**:
  - A hand grenade tumbles on every free step. At throwing speeds it spins about z at roughly 18–50 half-turns a second
    (57–157 rad/s), much faster about z than about x and y.
  - The spin slows as the step shortens and then settles with a wobble until `|v.y| ≤ 0.2`.
  - Bounces (`FUN_003c8f50`) do not run this step. The next free step resumes it with the new displacement.
  - STRONG. The code is unambiguous. Two steps remain: `FUN_00307360`'s Euler order, and `v.y` being the Euler
    angle's y (C3's reading of `FUN_00308020`).
- **Implementation suggestion**:
  - Replace `SPIN_PLACEHOLDER` with `grenadeSpinRates(dPerStep, euler)` returning the three rates above. On each 30 Hz
    step: `euler += rates * Math.PI * dt`, wrapped at 2π; `model.rotation` from the Euler (x, y, z order until
    `FUN_00307360` is read).
  - Tests:
    - `d = 20` → (10, 2.5, 50);
    - `d = 0.5` → (10, 2.5, 50);
    - `d = 15.5` → (0.5, 0.5, 0.5) (just under the jump);
    - at rest with `|v.y| ≤ 0.2` → no change.
  - The ledger row for C3's SPIN must flip back from "0".
- **Owed evidence**:
  - An RDRAM series of a thrown M67 over about 10 frames: the projectile's `+0x9c..+0xa4` and `+0x48`/`+0x54`.
  - The angles should advance by `rate(d) × π / 30` a frame.
  - The model matrix shows the composition order.

### 2.7 Item 21: BACKBLAST_CONE_AXIS: the pitch C3 owed (`$PORT/packages/scene/src/projectile.ts:237`)
- **Prior search** (C3, STRONG): the cone's axis is the +z row of the shooter's body node (`body+0x28`), copied at
  spawn. Owed: whether that node carries the aim pitch.
- **What I did** (`body_matrix.py`):
  - In `frostA_probe600` and `frostB_probe600`, the body node's 3×3 at `node+0x0` has row 1 = (0, 1, 0) exactly. It is
    a pure yaw (rows (−1,0,0)/(0,1,0)/(0,0,−1) and (0,0,1)/(0,1,0)/(−1,0,0)).
  - In all four game dumps, `body+0x50` is a yaw-only quaternion (x = z = 0: (0, 1, 0, 0) and (0, −0.7071, 0, 0.7071)).
    `FUN_005c2430`/`FUN_00215c10` use it as the body's rotation.
  - The aim pitch reaches the skeleton through the pitch twist (the motion table's `NoPitchtwist` keys), not through
    the root.
- **Answer**: the body node carries yaw only, so the cone axis is horizontal, behind the body, whatever the aim pitch.
  PARTIAL / STRONG: no dump shows the SEAL aiming up.
- **Implementation suggestion**: as C3. `backblastAxis = bodyBack(yaw)`, with a test that a target behind at feet
  height is hit when aiming 30° up.
- **Owed evidence**: one dump while aiming a LAW 30° up. Expect `node+0x10` = (0, 1, 0).

---

## 3. HUD, menu and effects items

### 3.1 Item 1: ARC_DEPTH_TEST_PLACEHOLDER (`$PORT/packages/viewer/src/grenade.ts:1625`)
- **Prior search** (C3): `FUN_003373b0` queues the arc's segments into the translucent list 0x488df8. The list's draw
  state was not found; a GS dump was owed.
- **What I did**:
  - The list draw `FUN_00336cb0` (D:L235161-235163) draws an entry whose `+0x4c` is 0 through
    `FUN_00360030(entry, +0x10, +0x20, +0x30)`. `FUN_003373b0` zeroes `+0x4c` (`puVar2[0x13]`).
  - `FUN_00360030` (D:L259309-259315) builds its own GIF packet (`arc_packet.py`):
    - tag 1: NLOOP 1, PRE 1, PRIM 0x49 (LINE, Gouraud, alpha blend), one A+D pair: register 0x47 TEST_1 = 0x5000c;
    - tag 2: two packed RGBAQ/XYZF2 vertices.
  - Decoded, TEST_1 = 0x5000c is ATE 0, **ZTE 1, ZTST 2 (GEQUAL)**.
- **Answer**: the arc is depth-tested against the scene, so the port's `ARC_DEPTH_TEST_PLACEHOLDER = true` is the
  original's. The depth write is not set by this packet (inherited). PROVEN: the operand is in the very packet.
- **Implementation suggestion**: rename to `ARC_DEPTH_TEST = true` with this citation. No behaviour change.

### 3.2 Item 3: HUD_ROUND_MODE_COUNT_READING (`$PORT/packages/viewer/src/fire.ts:531`)
- **Prior search**: not traced (R94 L1555).
- **What I did**:
  - `FUN_00237760` (D:L85150-85187) formats `"%d/%d"` (string 0x3e66b8) from `FUN_005c3890(kit)` and
    `FUN_005c3ce0(kit)`, and `"%d MAG%c"` (0x3e66c0) from `FUN_005c49b0(kit) − 1`:
    - hidden when below 1, or when the kit or controller blocks it;
    - `'S'` unless the count is 1.
  - In a round mode (`FUN_005bd7f0`: the slot's round byte `kit+0x6fc[s] ≥ 4` and the item is a carrier) all three walk
    the kit for the first slot whose item ID equals that round ID and has any magazine with rounds. If none has rounds,
    the last matching slot is used.
    - Rounds = that slot's current magazine (`kit + s·0x28 + 0x1d4 + 4·kit[0x684+4s]`).
    - Capacity = `FUN_003d2810(item)` = `item+0x28`.
    - MAGS counts that slot's non-empty magazines.
  - The parser's setters (disassembled) are `0x3d2a10: sw a1, 0x2c(a0)` for NumMags and `0x3d2a20: sw a1, 0x28(a0)` for
    Ammo_Capacity (D:L322436-322471). So `+0x28` is `Ammo_Capacity`.
- **Answer**:
  - The box shows the round slot's current magazine over its round item's `Ammo_Capacity`. MAGS is the round slot's
    non-empty magazines less one.
  - For the M203 HE (ID 171: NumMags 1, Ammo_Capacity 6) that is `6/6` with no MAGS line, `5/6` after a shot, and
    `0/6` when empty (the last matching slot).
  - PROVEN: code plus the parser's offsets plus disc data. The port's reading matches.
- **Implementation suggestion**:
  - Rename to a sourced comment. Add a test: round mode with 171 shows `6/6` and hides MAGS; after one shot `5/6`; at
    zero `0/6`.
  - If the kit ever holds two slots of the same round item, the HUD shows the first with rounds left.

### 3.3 Item 6: RING_VOLUME_READING (`$PORT/packages/viewer/src/ringingEars.ts:15`; volume `net/blast.ts:28`)
- **What it stands for**: which channels the blast's ring ducks, and whether the ring itself is ducked.
- **Prior search**: not attempted (C7's ([186](186-c7-audio-movie.md)) lane).
- **What I did**:
  - The blast plays `.RINGING_EARS` (bank sound, `+0x1c` play) and then calls `FUN_003412f0(5.0, 0.35, 0,2,1,3,5,6,−1)`
    (D:L459230-459234).
  - `FUN_003412f0` (D:L241197) stores each listed group's current master volume through 989snd's
    `SL_GETMASTERVOL` (10) and sets it to × 0.35 through `SL_SETMASTERVOL_A` (9). These are the commands
    `FUN_003404b0`/`FUN_003404e0` send (`989snd-ziemas/common/common.h:14-15`). The numbers are master-volume groups.
  - `bank_groups.ts` reads every `.bnk` in `BNKSTORE.ZAR`. `.RINGING_EARS` is in the 38 banks that hold it, always
    with **VolGroup 4**, Vol 35. It is the **only** sound on the disc in group 4.
  - C7's `tuner_groups.out` maps SOUND to 0, 3, 4, 5, 14; MUSIC to 1; DIALOG to 2, 6; HEADSET to 7. The bank histogram
    agrees: footsteps in 3, ambience loops in 5, front-end and NVG switch sounds in 14.
- **Answer**:
  - The duck lowers effects (0, 3), ambience (5), music (1) and dialogue (2, 6) to 0.35.
  - It leaves group 4 (the ring itself), 14 (UI and goggles sounds) and 7 (headset voice) at full.
  - So the ring plays at its own level (Vol 35/127 × the SOUND master), above a ducked world.
  - The port holds and fades its whole mix, the ring included. PROVEN: the disc field plus the call's operands.
- **Implementation suggestion**:
  - Give `GameAudio` a duckable bus and a separate one for the ring, UI and headset sounds.
  - `RingingEars` ducks only the first. The ring plays on the second, at its bank volume.
  - Test: during the hold, the ring's gain is 1 × bank and a footstep's gain is 0.35 × bank.

### 3.4 Item 7–8: SCORCH_PROBE_READING / SCORCH_PARTIAL_ORDER_READING (`$PORT/packages/viewer/src/grenade.ts:145`, `:1439`)
- **Prior search**: not attempted (R85 L605, R89 L770).
- **What I did**:
  - The explosion (D:L318876) calls `FUN_0031df50(10.0, world, pos)`. That is the same type-2 vertical column (no type
    reset; it reuses the query object), then `FUN_002d4c20` (D:L175870-175900).
  - `FUN_002d4c20` returns the entry with the greatest height `≤ pos.y + 10`. It has no lower bound and no material
    test. `FUN_003d0ba0` frames the decal on it.
  - The decal walk:
    1. `FUN_003d0ba0` (D:L323818-323826) climbs from the hit's node (`entry+0x1c`) to the nearest ancestor with node
       byte `+0x5e` bit 7 (the decal root).
    2. `FUN_003139e0` (D:L213906-213946) walks that node's visuals in list order. It uses only those whose vparams
       word 0 has bit 16 (0x10000); skinned visuals go through `FUN_003b8680`. Then it recurses into the children
       (`+0x70`, count `+0x6c`), unless a skinned visual was met.
    3. Per visual, `FUN_003b3ab0` iterates the packets' triangles in stream order. It skips triangles facing away
       (`n·dir ≥ −0.01`, D:L306534), keeps those whose three projected depths are ≤ 4.8 (D:L306630-306634), and
       allocates one pool entry per kept triangle (`FUN_003b3800`).
    4. The pool allocator `FUN_003bf1a0` (D:L313254-313265) returns 0 when the pool is full. That triangle, and every
       later one while it stays full, is dropped.
- **Answer**:
  - PROBE: above = 10 (PROVEN), below = **unbounded**. No material filter. The port's below = 10 and its
    volumetric/penetration/liquid filter are its own.
  - PARTIAL ORDER: the game keeps the first triangles of the walk above (decal root, DFS, visuals with bit 16, packet
    order, front-facing, depth ≤ 4.8). STRONG: `FUN_003b8680` (skinned) was not read.
- **Implementation suggestion**:
  - `SCORCH_PROBE = { above: 10, below: Infinity }`, and select the first hit by height alone.
  - In `markClip`, walk the hit node's decal-root subtree in the scene graph's order, filter visuals by vparams bit 16,
    keep packet order, and stop at the pool's room.
  - Tests:
    - a blast 30 u above a floor still scorches the floor;
    - a visual without bit 16 receives no scorch;
    - with room for 3 triangles, the first 3 in node/packet order are kept.
- **Adopted (2026-10-16, web sprint 40 AD-4; reading -- the wave's PROVEN is a source read; the reconciliation's chunk 08 re-read it independently, C12):** the PROBE half. `FUN_0031df50` (D:L220029-220045) runs the query `FUN_002d49c0` sets from y = +50000 to y = -50000 (D:L175812-175818, 0x47435000 / 0xc7435000) at the blast's x and z; `FUN_002d4c20` (D:L175857-175892) keeps the highest entry at or below `pos.y + 10`, and at equal heights the first (a later entry replaces only a strictly higher one, the `<=` at D:L175888); `FUN_003c7af0` makes the decal only on a hit (D:L318876-318880). Built: `grenade.ts` `SCORCH_ABOVE` (10), `scorchHit`, `groundUnder` over `net/placing.ts` `worldColumn` (`WORLD_COLUMN_HALF` 50000), the scorch's call on a hit only; `grenadeScorchColumn.test.ts`. *Was:* `SCORCH_PROBE_READING` `{ above: 10, below: 10 }`, the placement's material filter (VOLUMETRIC, PENETRATION 1, LIQUID) and a flat scorch at the blast when none was found. Not adopted here: the suggestion's `below: Infinity` cast from the blast (the column is the world's whole line, above the blast too), the PARTIAL ORDER (`SCORCH_PARTIAL_ORDER_READING`, open), the query's own admission (`FUN_002d2890`'s classes; the port's is the throw's hull) and the decal's visibility (the port marks a grenade at rest only). Owed: the original's visible decal beside the page's (a capture).

### 3.5 Item 9: SOUND_PRIORITY_SLOT_READING (`$PORT/packages/scene/src/effects.ts:254`)
- **What it stands for**: the effects runner drops `SOUND` commands with flag 0x400/0x800 (the music priority slot).
- **Prior search**: "the slot's MP cues are streamed music the viewer's banks do not hold" (a reading; R81 L469).
- **What I did** (`prio_sounds.ts`):
  - It scanned 4,528 SOUND commands in every ZDB's MZANIM/CZANIM and the UI archives.
  - All **417** with 0x400 or 0x800 have flags exactly 0x880 (priority 3). All are `MUS_*` cues (29 names: intro, win,
    bomb, breach, VIP).
  - They all sit in `mission/objectives` of the MP maps. None is in any bank. **0x400 (priority 1) never occurs.**
  - `FUN_002659c0` hands exactly these flags to `FUN_00348dc0` (D:L112478-112486), the music slot (`DAT_0048e0a0`
    intensity levels).
- **Answer**:
  - The effects/doors runner never meets such a command on retail data.
  - The round's objectives cues are already played by `roundCues`/`GameAudio.playMusic` (research 124).
  - The "drop" is unreachable; the mask stays as the source's. PROVEN (an exhaustive disc scan).
- **Implementation suggestion**: rename to `SOUND_PRIORITY_SLOT_MASK` (sourced). Add a test over the parsed effects
  of all maps asserting that no effect program contains such a command.

### 3.6 Item 10: SPECIAL_GLYPH_PLACEMENT_READING (`$PORT/packages/viewer/src/hudFont.ts:160`)
- **Prior search** (R95 L1059): the placement is the code's, relative to the letters' fit. It was matched on the
  dialog frame `A_54_gamelobby2.png`. The HUD's lines are unmeasured; the dead player's prompt is owed.
- **What I did**:
  - `FUN_00361bd0` (the glyph emitter) has one caller, `FUN_003635c0` (D:L261134).
  - `FUN_003635c0` is reached by `FUN_003639c0` (11 callers: the HUD's lines, e.g. 0x40a940, 0x40da40, 0x40f410) and by
    `FUN_00363a70` (9 callers: the UI widgets' text) (D:L261251-261290).
- **Answer**:
  - HUD and dialog text go through the same emitter, so the glyph rule verified on the dialog frame is the HUD's rule.
  - What differs per line is only the line's own origin, which the HUD's letters already use.
  - RESOLVED / STRONG. The capture becomes a confirmation, not a source.
- **Implementation suggestion**: rename to a sourced constant. Keep the owed HUD frame on the low-priority capture
  list.

### 3.7 Item 11: THERMAL_LENS_FX_READING (`$PORT/packages/viewer/src/lensFx.ts:22`)
- **What it stands for**: the parts of `to_thermal_lens_fx` the port does not run:
  - `IRIS_EFFECT`;
  - `CAMERA`;
  - the `restore_lensfx` sequence (`CAMERA_PARAMS`/`BLUR3D`/`TRUE_COLOR_SCALE`).
- **What I did**:
  - **Command numbering.** `zanim_cmds.py` gives the set-0 numbers in registration order.
    - `FUN_0026b1a0` runs `FUN_0025bc20` first (58 names; the two `ui::` names go to their own namespace because
      `FUN_0026a8e0` splits at `::`, D:L115285-115294).
    - `FUN_002ad290` (D:L152548-152570) then adds `RESET_BODY_PARTS` 59, `BODY_FALL_ON_MATERIAL_SOUND` 60, `VALVE` 61,
      `VBIT` 62, `VWATCH` 63, the camera group 64-69 (`CAMERA_PARAMS` 69), `CAMERA_3RD_PERSON` 70, `CAMERA_SHAKE` 71,
      `PLAYER_*` 72-74, `WIND` 75, `HUD_*` 76-86, `EXECUTE_ACTION` 87 and `REMOVE_DECALS` 88.
    - This reproduces the port's `VALVE` 61 and `SOUND` 30, and names the thermal's `cmd 69` as `CAMERA_PARAMS`.
  - **The thermal anim**, identical in all 22 MP ZDBs (`lens_anims.out`, `iris_decode.out`):
    - Sequence `restore_lensfx` (auto-start, word 0x102):
      1. `VALVE lensfx = 4`;
      2. `CAMERA_PARAMS` flag 2: its tick restores the camera saved by `init_lens_fx`'s flag-1 save (begin 0x2922a0
         copies `+0xd0..+0xdc`, fog range, FOV to `+0x200..`; `FUN_002915f0` copies them back, D:L137866);
      3. if not `blinded`: `BLUR3D` passes = 0;
      4. `TRUE_COLOR_SCALE` row 3 = neutral (1,1,1,0).
    - Sequence `NA`:
      1. stop `lightning_flash_bright` and `fog_color_indoors_mp62`;
      2. the four `SCALE_COLOR` rows (ported);
      3. `VALVE irismode = 1`;
      4. **`IRIS_EFFECT`**;
      5. **`CAMERA`**.
  - **IRIS_EFFECT** (handler `FUN_00264610`, D:L111744-111831; flags 0x10008fff) loads the iris block 0x488e48:

    | field | value |
    |---|---|
    | enable | on |
    | measured frames (`e68`) | 16 |
    | thresholds (`e4c` / `e50`) | 0.9 / 0.8 |
    | passes (`e48`) | 4 |
    | colour (`e5c`) | 0xff555555 |
    | gain (`e54`) | 255 |
    | curve (`e58`) | 0 |
    | fall / rise rates | −1/0.1 each |
    | measurement mode (`e7a`) | 0 (the 40-px grid) |
    | ALPHA | A/B/C/D = Cs/0/FIX/Cd (0x68) |

    The iris works as follows:
    - Each frame `FUN_0033cd50` (D:L238585-238663) reads `b`, the 16-frame mean of the screen luma. The luma is
      sampled by the GS-readback thread, `(0.4901 R + 0.4657 G + 0.0441 B)/(256·n)` (D:L305722-305724).
    - When `b < 0.9`, it eases a level toward `(0.9 − b)/0.1` with `L = t + (L − t)·exp(−dt/0.1)`
      (`FUN_0033d1e0`).
    - It averages the level over 3 frames and sets FIX = min(255, round(255 × level)).
    - The draw (`FUN_0033b5b0` → `FUN_003b0d70`, the packet at 0x3e0c40, `iris_rdram.py`) runs **4 passes**, each one:
      - downsampling the frame into a 320×224 buffer (bilinear, TEX1 0x60);
      - drawing it back full-screen, modulated by RGBAQ 0x55 (× 0.664), and **adding** it at FIX/128
        (`Cs·FIX + Cd`).
    - A dark thermal image (b ≤ 0.8) gets full gain: each pass adds about 1.32 × a blurred copy, compounding over 4
      passes. That is a bright, haloed "glow".
    - A caveat: when `b ≥ 0.9`, the target is an uninitialised local (the code's).
  - **CAMERA** (`FUN_00266320`/`FUN_00265f20`, flags 0x8000, node 1, 0.001 s) moves the camera's `+0xd0..+0xd8` to
    (0, 0, 0.01).
    - `+0xd0` is the fog colour (the port's `nightVision.ts` names it).
    - `+0x124`/`+0x128` are the fog start and end (D:L139078-139079), which this command does not touch.
    - The thermal view fogs to black at once.
  - In a multiplayer round the iris is otherwise off: passes 0 in both Frostfire dumps (`iris_rdram.out`; research 82
    D1). The thermal lens turns it on.
- **Answer**: as above. STRONG: every field is read from the handler and the disc. The look needs one frame.
  - The held weapon taking row 2 is already sourced (`lensFx.ts`, L480099) and simply unimplemented.
- **Implementation suggestion**:
  - Add a post-pass `IrisGlow { passes, colour, fix }` driven by `FUN_0033cd50`'s rule: thresholds, exp ease, 3-frame
    average, and the 16-frame luma mean over the frame.
  - Each pass: `frame += bilinearHalf(frame) * colour/128 * FIX/128`.
  - The thermal also sets the fog colour to (0, 0, 0.01).
  - Tests:
    - with `b` held at 0.5, FIX reaches 255 within about 0.5 s;
    - with 4 passes at FIX 255 and a 0.1-grey frame, the output is the compounded 0.1 × (1 + 1.32)^4, clamped;
    - leaving the scope restores the fog.
- **Owed evidence**:
  - A PCSX2 frame through a thermal scope on any MP map, plus RDRAM `0x488e48..0x488eaf`.
  - Expect e48 = 4, e5c 0xff555555, e98 FIX near 0xff.

### 3.8 Item 12: UI_MODEL_FORM_READING (`$PORT/packages/scene/src/weapon.ts:89`)
- **Prior search** (R95 L1053): `bias` was chosen by fitting the bboxes, "not from the EE command list".
- **What I did**:
  - Both packet builders choose the VU1 position command from the visual record's byte `+2` bit 1, which is vparams
    word-0 bit 17 (0x20000): 0x70 (the weapons' `scale`) when set, 0x68 (the world's `bias`) when clear.
    - `FUN_003b4580`: D:L307216-307228.
    - `FUN_003b5f20`: D:L307836-307845.
    - Byte `+4 == 1` sends a visual to 0x52/0x66 instead.
  - `vparams_form.ts` histograms bit 17 over the disc:

    | archive | bit 17 set |
    |---|---|
    | `UI_GEO.ZED` | 0 of 133 |
    | `WEAP_GEO.ZED` | 212 of 212 |
    | `MP2_GEO`/`MP6_GEO` (world) | 0 |
    | `CLIB_GEO` (characters) | 0 |
    | `FLIB_GEO` (eyes) | 16 of 16 / 12 of 12 |
    | `EFFE_GEO` | 4 of 23 |

- **Answer**: the form is a per-visual data bit, and it gives `bias` for every UI visual. That agrees with the fit on
  84/85 nodes. STRONG: the identity of the packet builder's record with the parsed vparams word is inferred, and is
  supported by the perfect split.
- **Implementation suggestion**:
  - Let `interpretChainPartsAs` take the form from each visual's `visualParams` bit 17, and retire
    `UI_MODEL_FORM_READING` and the weapons' hard-coded `scale`.
  - The same bit settles `effectModels.decodeFitted`'s fitted choice for the 4 EFFE visuals.
  - Test: every UI visual decodes as `bias` and every weapon visual as `scale` from the bit alone, with the bboxes
    still enclosing.

### 3.9 Item 13: BLIND_FULL_READING (`$PORT/packages/viewer/src/flash.ts:18`)
- **Prior search** (C3, PARTIAL): `blinded` is `TRUE_COLOR_SCALE`, `c × 0.75 + 60`. "Not a full white." The look needed
  a frame.
- **What I did** (`iris_decode.out`, `iris_rdram.out`):
  - The `blindplayerNN` anims also run `BLUR3D` (handler `FUN_00264a40`, D:L111838-111903):
    - `fadein` (auto): passes 2 (level 1) or 3 (levels 2, 3), ALPHA `Cs·FIX + Cd` (0x68), FIX keyed 0 → 2.0 (256,
      clamped to 255) over 0.2 s (`FUN_0025c5f0`: (t, value) pairs × 128);
    - then `fadeout_normal`, with FIX keys:
      - level 1: (0, 2.0), (1, 0.5), (2, 0);
      - level 2: (0, 2.0), (1.5, 2.0), (4, 0);
      - level 3: (0, 2.0), (8, 2.0), (10, 0);
    - then passes 0.
  - The blur's colour word `0x488ea4` is never set by any zAnim (`blur_all.out`: no BLUR3D carries flag 2 or colour
    keys). It reads 0x80808080 (unity) in all five dumps.
  - The pass is the same downsample/upsample packet as the iris (`FUN_0033b570` → `FUN_003b0d70`). Each pass therefore
    adds about 1.99 × a blurred copy (≈ × 3), and 3 passes ≈ × 27, which saturates everything not black.
  - The `TRUE_COLOR_SCALE` row-2 keys:
    - level 1: (0.9, 0.9, 0.9, +25) easing to neutral by 2 s;
    - level 2: (0.75, +60) held to 1.5 s, neutral at 4 s;
    - level 3: (0.75, +60) held to 8 s, neutral at 10 s.
- **Answer**:
  - The white-out is the BLUR3D glow (a near-white, haloed wash), with the colour lift under it.
  - The timelines above are the source's. "Full white" is close in look but not in mechanism: bright areas bloom,
    and dark ones are lifted by +25/+60.
  - STRONG. The look can now be modelled. A frame remains good confirmation.
- **Implementation suggestion**:
  - Drive the flash with the same `IrisGlow`-style pass: passes per level, colour unity, FIX from the keys above.
  - Drop the DOM overlay and `BLIND_FULL_READING`. Keep C3's `TRUE_COLOR_SCALE` row.
  - Test: at t = 0.1 s of level 3, FIX = 128; from t = 0.2 to 8 s, 255; at 9 s, 128; at 10 s, 0, and passes then 0.
- **Owed evidence**: as C3 (a level-3 frame at 1 s). Also RDRAM `0x488ea0..0x488eaf`: passes 3, ALPHA FIX 0xff.

### 3.10 Item 14: FIREPOINT_203_READING (`$PORT/packages/viewer/src/fire.ts:108`)
- **Prior search** (C3): the code falls back to `body+0x14bc` when the model lacks `firepoint_203`. What `+0x14bc`
  holds was not read.
- **What I did**:
  - Every mount path calls CZSealBody slot +100 (`0x5dfad0`: find a named node in the held weapon's model) twice, with
    `"aimpoint"` (0x65f658) → `+0x14ac` and `"firepoint"` (0x65f668) → `+0x14bc`.
  - The paths are `FUN_005a60d0`, `FUN_005a64c0`, `FUN_005a6b70` and `FUN_005a6d30` (D:L461842-461846, 462014-462015,
    462089-462090, 462130-462131).
- **Answer**: the fallback is the held weapon's `firepoint`, the muzzle. That is the port's own fallback. STRONG.
- **Implementation suggestion**: rename to a sourced constant. Test: a carrier model without `firepoint_203` launches
  from `firepoint`.

### 3.11 Item 15: MOUNT_BLEND_READING (`$PORT/packages/viewer/src/heldItem.ts:109`)
- **Prior search** (C3, BELIEVED): the re-parent is instant. "The only smoothing is the pose cross-fade (0.4 default)."
- **What I did**:
  - The motion parser `FUN_00287620` writes 0.4 to `+0x20` before reading `BlendTime` (0x3efa10) (D:L131465-131466).
  - In C3's `motion.txt`, the L1/L2 swap's four clips -- `seal_rifle2pistol`, `seal_crouch_rifle2pistol`,
    `seal_prone_rifle2pistol`, `seal_mv_rifle2pistol` -- have no `BlendTime` key. (`seal_swaprifle`, `Swap rifle`, which
    this section first named, is the weapon pick-up's clip, `FUN_0059f0c0`, not the swap's: research 211 §1. It has no
    `BlendTime` either.)
  - Every re-parent clears bit 0 of the weapon node's `+0x42`, which gates the per-node snapshot blend, and the body's
    blend tick re-arms it only once the cross-fade has run out (`FUN_00576860` D:L436690-436701): research 211 §3.5.
- **Answer**: the weapon snaps to its new mount. What eases is the body's 0.4 s cross-fade into the swap clip, which
  carries the hand and so the weapon. A reading (research 211 §3.5).
- **Implemented**: the owner's ruling, 2026-10-04 -- the weapon's re-parent at once (`heldItem.ts` `HeldMounts`), the
  0.4 s on the pose only; `MOUNT_BLEND_READING` retired (research 101 §5).

### 3.12 Item 18: PULSE_PHASE_READING (`$PORT/packages/viewer/src/weaponSelect.ts:197`)
- **Prior search** (C3): the picker resets in Init `FUN_00240e60`. "Per opening or per round" was owed.
- **What I did**:
  - `FUN_00240e60` has one caller, the HUD's init `FUN_001fa360` (D:L57437-57440, online only).
  - The weapon-select ctor `FUN_00241a90` is called from the HUD's ctor `FUN_001fcd80` (D:L58375).
  - Both run once, from `FUN_001ec480` (D:L50900-50914), which allocates the 0x1acd0-byte HUD and initialises it when
    the in-game state is entered.
- **Answer**:
  - Opening WEAPON EXCHANGE does not reset any pulse. The picker and the block's pulses start at 0 rising when the HUD
    is built and carry their value from one opening to the next (each advancing only while its part shows, C3).
  - STRONG. Whether `FUN_001ec480` re-runs between rounds of one match was not read; it is an Enter-type function.
- **Implementation suggestion**:
  - Keep the pulses' accumulators across openings and reset them only when the match's HUD is created.
  - Test: open, close at phase 0.3, reopen; the pulse continues from 0.3.
- **Owed evidence** (minor): a breakpoint on 0x240e60 across a round restart.

---

## 4. Sourced but not implemented (multiplayer-relevant)

- **Grenade tumble** (item 20): every client sees other players' grenades. The source rule is deterministic, given
  the projectile path.
- **C4 reach** (item 2): within 19.9 u of the SEAL's root, to the aimed point. This joins C3's 0.2 s aim-settle and the
  1.098 s plant.
- **Lean availability** (item 17): pressure above 0.03 plus clearance of 9.5 u (right) / 7.84 u (left). Near walls this
  decides whether a lean, and so a lean toss, exists.
- **Remote lean is replicated.** `FUN_002be150` (D:L162212) writes `+0x375` from a received record's byte `+0x80`.
  The original sends the lean side, so remote bodies run StartPeek too (lead for M2 ([193](193-m2-mp-net-replication.md))).
- **The ringing ears' own channel** (item 6): the ring is not ducked, and neither are UI or headset voice.
- **Charge placement** (items 4–5): exact surface height. Lowest-surface fallback. No penetration filter.
- **The Designator fires nothing** (item 16).
- **Post-process effects the port lacks entirely**, all per client:
  - the thermal iris glow and black fog (item 11);
  - the flash's blur glow (item 13);
  - the NVG auto-gain: `to_nvg_lens_fx` IRIS 4 passes, ALPHA 0x69 (`Cd·FIX + Cd`, a pure screen multiply), colour
    (200, 255, 200), thresholds 0.3/0.2, rates 0.05 s, measurement mode 1; NVG fog colour (0, 0.02, 0) (`iris_decode.out`);
  - the scope zoom-in blur: `to_scope_lens_fx`/`to_starlight_scope_lens_fx` BLUR3D replace-mode (ALPHA 0x05, `Cs`)
    at passes 8 → 0 over WAITs 0.2, 0.025, 0.025, then 0.05 each, then a 1-2-3-2-1-0 "focus" pulse;
  - the binoculars blur: 8 passes, ALPHA 0x64 (lerp), FIX 128 → 0 between 0.2 and 1 s.

## 5. Leads for other workstreams

- **C7 (audio):**
  - A second, open-ended duck, `FUN_003412f0(1e9, 0.6, groups 0-5)` (D:L241892). It fires when a VAG stream whose
    definition byte `+0x1c` has bit 4 set plays; the same bit puts that stream in group 6. `FUN_00341010` releases it.
    So a flagged (group-6) stream ducks groups 0-5 to 0.6 while it plays.
  - The music slot's intensity `DAT_0048e0a0` (0-3) is set by `FUN_00348ce0` from a value with thresholds 1, 3 and 5
    (D:L245347-245372).
- **C9 ([188](188-c9-world-render-platform.md)) / effects:**
  - Decals land only on visuals with vparams bit 16, under the nearest node with `+0x5e` bit 7.
  - The bullet marks use the same walk (`FUN_003139e0` callers D:L460209, 460256: sizes 100/3.5).
  - `effectModels.decodeFitted` can read vparams bit 17 instead of fitting.
- **C2 (movement):**
  - The body state short `body+0x174` is the anim component's `+4`, set only through CZSealBody slot +0x90
    (`FUN_0058a6b0`). Observed: 1 at a crouched spawn. 3 is the peek; 2, 4, 5, 7, 8 and 9 are tested in many places
    (`scan_174.out` readers).
  - The lean's pad inputs are 5/7, with pressure channels 0x14/0x15 and the 0.03 threshold.
  - The lean clearance rays are 9.5 u and 7.8375 u.
- **zAnim numbering, for everyone:** `zanim_cmds.out` is the full 1-88 set-0 table. Research 85's "particle command
  (set 0, 0x27)" is decimal 27 (`PARTICLE_SOURCE`). Hex 0x27 = 39 is `WHILE`.
- **Research 82 (post-process):** the iris that research 82 D1 turned off for multiplayer is turned back on by the
  thermal and NVG lenses, with a different blend:
  - the thermal's 0x68 adds a blurred copy;
  - the NVG's 0x69 multiplies;
  - the campaign's default is 2 passes, 0x69.
- **V1:** its spin confirmation covered `FUN_003cabe0` only. The in-flight rotation lives in `FUN_003c9530`.

## 6. Owed captures (consolidated)

| Item | Capture | What to read |
|---|---|---|
| C4 reach | A dump aiming at a demolition target within 2 m | `body+0x208` = \|hit − skel_root\|² < 396 |
| Spin | ~10 frames of an M67 in flight | Projectile `+0x9c..+0xa4` and `+0x48`/`+0x54`; model matrix (Euler order) |
| Backblast | Aim a LAW 30° up | Body node `+0x10` row = (0, 1, 0) |
| Stick follow | Right stick up, then down | `ctrl+0x138` sign |
| Thermal | A thermal-scope frame on any MP map | RDRAM `0x488e48..0x488eaf`; the frame's look |
| Blind | Level-3 flash, 1 s in | `0x488ea0..af` (3 passes, FIX 0xff) and `0x4b4d40` rows; a frame |
| Pulse | Breakpoint on 0x240e60 across a round restart | Whether the HUD init re-runs |
| Pad glyph (low) | The dead player's prompt | Confirmation of the shared rule |

## 7. Verification (V5, 2026-10-04)

The verifier's file: `research-wave-2026-10-04/V5-verify-hostage-closures-round2.md` (its scripts and outputs under `research-wave-2026-10-04/scratch/V5/`). V5 verified H4 ([199](199-h4-hostage-closures.md)), round 2's R2-C2 ([201](201-r2-c2-movement.md)) and R2-MN ([203](203-r2-mn-match-modes-net.md)), two R2-C3 items and the grenade-spin dispute between C3/V1 and R2-C3. What follows is the verifier's own text for this report's claims, verbatim; its claims about the other reports are in their notes ([178](178-the-research-wave-of-2026-10-04.md) has the table).

Verifier V5, wave 2026-10-04. Read-only; no builds, runs, git writes or network. `D:L<n>` is a line of
`C:/Projects/socom_pc/game/analysis/socom2_game.elf.decomp.c` (r0001). I used my own tools, not the authors' helpers.
- `scratch/V5/v5.py` reads `game/disc/socom2_game.elf` through pyelftools, disassembles with capstone and prints the
  decomp.
- The jal, word, lui and store scanners are mine.
- Second-route values come from the PCSX2 RDRAM dump `logs/parity/spawn_pcsx2.rdram` and from raw disc bytes.

Every script and output is in `scratch/V5/`; its `README.md` lists them.

### 7.1 Verdicts

| # | claim | verdict | one-line reason |
|---|---|---|---|
| Dispute: grenade spin | C3/V1 "0 in flight" vs R2-C3 "tumbles each free step" | **R2-C3 is right** (CONFIRMED-WITH-CORRECTION) | `FUN_003c9530` writes a rotation into the same node (proj+0x20) that `FUN_003cabe0` then only positions, so the drawn model turns. Correction: `FUN_00307360` builds a **quaternion**, and `FUN_00307170` turns it into the node's 3×3. |
| R2-C3 C4 reach | body+0x208 = \|aim hit − skel_root\|², < 396 (19.9 u) | **CONFIRMED** | Stores at 0x215c8c (100000) and 0x215f08 (\|v\|²); slot +0x88 = `lw v0,0x2e8(a0)`; 396.0 at D:L452032. |
| R2-C3 ringing ears | Group 4 skips the blast duck | **CONFIRMED** | `FUN_003412f0(5.0, 0.35, 0,2,1,3,5,6,−1)` (D:L459234) lists no 4; `.RINGING_EARS` (0x65f160) is VolGroup 4 in every bank (989snd `SFX2` +1). |

### 7.2 Disputes

**Grenade spin — R2-C3 is right; C3 and V1 were incomplete.**
- `FUN_003c9b70` calls the free step `FUN_003c9530` when the sweep hits nothing (D:L320015-320016).
- For category 'y' (0x79) with state ≠ 2, `FUN_003c9530` (D:L319776-319845) does three things:
  - computes d = \|+0x54 − +0x48\|;
  - sets the rates: d ≥ 0.5 → x/y/z = 10 − 9.5t, 2.5 − 2t, 50 − 49.5t with t = (d − 0.5)/15, or 10/2.5/50 when d > 15;
    d < 0.5 → (1 − v.y) × (0.1, 0.4, 0.02) when the test against 0.2 passes;
  - advances +0x9c/+0xa0/+0xa4 by rate × π × dt, wrapping at 2π.
- It then calls `FUN_00307360(x, y, z, out)` and `FUN_00315790(proj+0x20, out)` (disassembly 0x3c9870-0x3c989c).
- **Is it what is drawn?** Yes:
  - `FUN_00315790` → `FUN_00307170` writes a 3×3 rotation into node +0x00..+0x28 (stride 0x10) and sets the dirty bit
    +0xa1|2 (D:L215054-215060);
  - for 0x79, `FUN_003cabe0` afterwards only calls `FUN_003157d0(pos, proj+0x20)`, which writes +0x30..+0x38 and calls
    the node's update (D:L215065-215074; D:L320557-320558);
  - it is the same node at proj+0x20, so the rotation survives, and the node the game positions every frame is the
    grenade's model.
- C3 and V1 checked only `FUN_003cabe0`.
- **Correction to R2-C3:** `FUN_00307360` builds a **quaternion** from half-angles (D:L206242-206268), not a matrix.
  The Euler order is fixed by that formula, so the port should use the same quaternion composition.
- Grade STRONG; R2-C3's owed RDRAM series stands.

**C4 reach and ringing ears** are CONFIRMED (table). The reach is read from D:L69993-70063 plus disassembly
0x215c8c/0x215f08; slot 0x6691a0 + 0x88 = 0x553db0 returns body+0x2e8.

## 8. Verification (V7, 2026-10-04)

The verifier's file: `research-wave-2026-10-04/V7-verify-round2-remaining.md` (its scripts and outputs under `research-wave-2026-10-04/scratch/V7/`). V7 verified ten round-2 claims nobody had checked, in R2-C3, R2-UI ([204](204-r2-ui-frontend.md)), R2-AV ([205](205-r2-av-audio-card-world.md)) and R2-MN. What follows is the verifier's own text for this report's claims, verbatim; its claims about the other reports are in their notes ([178](178-the-research-wave-of-2026-10-04.md) has the table).

Verifier V7, 2026-10-04. Read-only. Every script is under `scratch/V7/`, and its `README.md` says what each one prints.
`D:L<n>` is a line of `socom2_game.elf.decomp.c` (r0001). `$PORT` is the `agent/online` snapshot.

**Method.** Each claim is re-derived by a route the author did not use, where one existed:
- V7's own ELF reader (`elf.py`, pyelftools) and disassembler, instead of the authors' `elfutil.py`;
- the console's own state in the PCSX2 RDRAM dumps, read directly. No replay or simulation stands in for it;
- V7's own Python `.rdr` reader;
- the raw zAnim bytes, decoded by hand against the handler's field reads.

Where the only route was the author's own (a decomp read), V7 re-read the code and says so.

### 8.1 Verdicts

| # | claim | verdict | one-line reason |
|---|---|---|---|
| 1 | Flashbang white-out = blur glow (2-3 additive passes, full strength, up to 8 s at level 3) + colour wash; three timelines | **CONFIRMED-WITH-CORRECTION** | Mechanism, passes, FIX keys and the colour-wash keys all re-read from the raw bytes and the handler. But the blur keys run from `fadeout_normal`, which starts 0.2 s after the flash. Level 3 is at full glow from 0.2 s to 8.2 s and clears at 10.2 s; R2-C3's test times are 0.2 s early. |
| 2 | Thermal iris (4-pass glow of a blurred half-res copy, scaled by measured brightness); CAMERA turns the fog black; NVG auto-gain; scope zoom-in blur | **CONFIRMED-WITH-CORRECTION** | Thermal and scope confirmed exactly. FIX = gain, and the camera field +0xd0 is GS FOGCOL (reg 0x3d). Two NVG corrections: (a) 0.3/0.2 thresholds at 0.05 s rates are only the first 0.2 s; the NVG settles at 0.3 / -0.05 with 0.7 s rates; (b) its blend 0x69 is `Cd*FIX + Cd`, so the (200,255,200) colour is never used. |
| 3 | Lean starts above 0.03 pressure and needs 9.5 u right / 7.84 u left of clearance | **CONFIRMED** | 0x41180000 = 9.5 and 0x40facccd = 7.8375, the operands of the calls; the pressure test is `> 0.03`. The ray is horizontal at h = min(8, node+4). The port already has the ray, but tests it only when a lean starts; the original tests it every frame. |
| 4 | ARMORY model form = per-visual data bit (UI 0/133, weapons 212/212) | **CONFIRMED** | Byte +2 bit 1 (word bit 17) picks 0x70 / 0x68 in both builders. Second route: the disc's vparams words occur verbatim in RDRAM, and no bit-17 word is present on the menu or title screens. |

Tally: 10 claims. CONFIRMED 6, CONFIRMED-WITH-CORRECTION 4, WRONG 0, UNVERIFIABLE 0.

### 8.2 Claim 1: Flashbang white-out (R2-C3 item 13, `$PORT/packages/viewer/src/flash.ts:18`)

**Claim.** The white-out is mainly a BLUR3D glow: 2 passes (level 1) or 3 (levels 2-3), additive, at FIX up to 255,
over the `TRUE_COLOR_SCALE` colour wash. Level 3 holds the glow to 8 s and clears it by 10 s.

**What V7 did.**
- Decoded the raw `blindplayer03` bytes (from `scratch/R2-C3/lens_anims.out`) by hand against the handler
  `FUN_00264a40` (D:L111838-111903).
  - `fadein`'s BLUR3D carries flags +4 = 0x0d (passes, ALPHA, FIX keys), passes +5 = 3 and ALPHA +6 = 0x68.
  - Its FIX scale +8 is 2.0, i.e. 256, clamped to 255 by the handler's `0xff < iVar3` test.
  - Its key count is +0x14 = 2, with keys (0, 0) and (0.2, 2.0); duration +0x18 = 0.2.
  - `fadeout_normal` has 3 keys: (0, 2.0), (8, 2.0), (10, 0); duration 10.
  - The colour word is written only on flag 2 or when the colour-key count +0x10 is non-zero. Both are absent, so it
    stays 0x80808080.
- Keys go through `FUN_0025c5f0` (D:L106931): linear interpolation, then `x 128`, clamped to 0..255, into the FIX
  byte.
- **The draw.** The frame calls `FUN_0033b570(0x4887c0)` (D:L50849), which reads base+0x6e0/+0x6e4/+0x6e8, i.e.
  0x488ea0 passes, 0x488ea4 RGBAQ and 0x488ea8 ALPHA: exactly what the handler writes.
- **The pass packet**, decoded from `.data` by V7 (`gifpkt.out`), has two draws:
  - draw 1: the frame (TBW 10) is drawn into a 320x224 buffer (FRAME FBP 0x118, FBW 5), bilinear (TEX1 0x60), with
    no blending (PRIM 0x116);
  - draw 2: that buffer is drawn back full screen with PRIM 0x15e (ABE on), modulated by RGBAQ and blended by the
    patched ALPHA.
- ALPHA 0x68 decodes as A = Cs, B = 0, C = FIX, D = Cd, i.e. `Cs*FIX/128 + Cd`: additive, as claimed.

**Correction.**
- `fadein` and the colour-wash sequence `NA` both start with the flash (word 0x102).
- `fadeout_normal` (word 0x104) starts only when `fadein` ends (its `CALL_SEQUENCE 4`, 0.2 s later), and its key times
  are its own.
- So, measured from the flash:

  | level | glow at FIX 255 | glow cleared |
  |---|---|---|
  | 1 | until 0.2 s, then 64 at 1.2 s | 2.2 s |
  | 2 | 0.2 s to 1.7 s | 4.2 s |
  | 3 | 0.2 s to 8.2 s | 10.2 s |

- The colour wash (row 2) runs from t = 0: level 3 holds (0.75, +60) to 8 s and is neutral at 10 s.
- R2-C3's suggested test ("at 9 s, 128; at 10 s, 0") is right in `fadeout_normal`'s time, not in flash time. In flash
  time the right values are 128 at 9.2 s and 0 at 10.2 s.

**Port.** `flash.ts` draws a DOM opacity overlay (`BLIND_FULL_READING = 60`). It has no blur glow, as R2-C3 said.

### 8.3 Claim 2: Thermal iris, CAMERA fog, NVG auto-gain, scope zoom blur (R2-C3 item 11 and "Sourced but not implemented")

**What V7 did.**
- Hand-decoded the thermal `IRIS_EFFECT` bytes against `FUN_00264610` (D:L111744-111831):
  - the flags word is 0x10008fff;
  - byte +7 = 0x10 = 16 frames (the flags word's top byte doubles as e68);
  - +8 = 4 passes and +9 = ALPHA 0x68;
  - thresholds 0.9 / 0.8 and gain 255.0;
  - rates -1/0.1 each;
  - +0x24 = 1.992 -> FIX 255;
  - colour +0x28 = 0xff555555;
  - flag 0x800 is set with 0x1000 clear, so measure mode e7a = 0.
- Re-read the iris tick `FUN_0033cd50` (D:L238585-238663):
  - b = `FUN_003b1bf0`(16), the mean of a 16-slot ring of `(0.4901 R + 0.4657 G + 0.0441 B)` samples (D:L305722);
  - when b < 0.9, the target is (0.9 - b)/(0.9 - 0.8), not clamped;
  - the ease `L = t + (L - t)*exp(rate*dt)` (`FUN_0033d1e0`);
  - a 3-frame mean;
  - FIX = min(255, round(mean x gain 255));
  - e90 = passes, e94 = colour, e98 = (FIX << 32) | ALPHA.
  - The draw is the same two-draw packet as §1. So "4-pass glow of a blurred half-res copy, scaled by measured
    brightness" is right.
- **CAMERA.** The handler `FUN_00266320` writes cam +0xd0/+0xd4/+0xd8 from the command's +0x60/+0x6c/+0x78, over the
  duration at +0x80.
  - The raw bytes give (0, 0, 0.01) over 0.001 s.
  - V7 checked independently that +0xd0..+0xd8 is the fog colour: the render setup multiplies it by 255 and writes it
    to GS register 0x3d, FOGCOL (`FUN_003b10c0(0x3d, ...)`, D:L236766-236774). Thermal fog is therefore black.
- **Scope zoom blur.** Raw bytes, guarded by `IF blinded == 0`:
  - BLUR3D `05 08 05 00`: flags 5, 8 passes, ALPHA 0x05 (A = Cd, B = Cd, C = As, D = Cs, so the output is Cs: replace);
  - then passes 7..0 with WAITs 0.2, 0.025, 0.025, then 0.05 each;
  - then 1, 2, 3 (WAIT 0.1), 2, 1, 0.
  - Confirmed as written.
- **NVG**, raw `to_nvg_lens_fx` `NA` sequences:
  1. IRIS 0x10009fff: 4 passes, ALPHA 0x69, thresholds 0.3/0.2, rates 0.05, colour 0xffc8ffc8, mode 1;
  2. WAIT 0.2, then IRIS 0x618: thresholds 0.2/0, rates 0.3;
  3. WAIT 0.2, then `CALL_SEQUENCE set_final_iris`: thresholds **0.3 / -0.05**, rates **0.7** each;
  4. `check_blinded` loops: while `blinded` is set, rates go to -1/257, which nearly freezes the iris.

**Corrections (NVG only).**
- (a) The values R2-C3 lists are the NVG's first 0.2 s. Its steady state is thresholds 0.3 / -0.05 with 0.7 s rates.
- (b) ALPHA 0x69 decodes as A = Cd, B = 0, C = FIX, D = Cd, i.e. `Cd*FIX/128 + Cd`. The texture colour Cs does not
  appear, so the RGBAQ colour (200, 255, 200) and the blurred copy have **no effect**. Each pass multiplies the screen
  by (1 + FIX/128); "a pure screen multiply" is right, the colour is not.
- (c) Minor: R2-C3 says the iris is off in Frostfire with "passes 0". In the frostA/B dumps e48 = 2, but the enable
  byte e79 = 0, so the draw passes e90 = 0.

**Port.** `lensFx.ts` ports only the `SCALE_COLOR` rows. Its header says `IRIS_EFFECT` and `CAMERA` are not decoded,
which matches the claim that the port lacks them.

### 8.4 Claim 3: Lean throw: pressure 0.03 and clearance 9.5 / 7.84 (R2-C3 item 17)

**What V7 did.**
- Re-read `FUN_00594cf0` (D:L453431-453457). The only route not used before was the disassembly of the ray function
  (`dis_596d60.out`).
- The player's controller writes +0x375 = 2 every frame, then tests in this order:
  - pad input 7 (left) with pressure channel 0x15: `(float)p/255 <= 0.03`, or the ray `FUN_00596d60(0x40facccd = 7.8375, -1)` fails -> `FUN_0057dc80` (leave the peek); otherwise 0xff;
  - else input 5 (right) with channel 0x14 and the ray `0x41180000 = 9.5`.
- The ray: V7 disassembled `FUN_00596d60`. The decomp shows the start as (0, 0, 0), which is wrong. The stack stores
  at sp+0x50/0x54/0x58 give start = (0, h, 0), and end = a copy of it with x +- d. So R2-C3's horizontal ray at
  h = min(8.0, (vt+0x88 node)+4) is right.
- The ray passes on no hit, or on a hit whose material byte +10 has (bits 2-3) == 1.

**Verdict.** CONFIRMED.

**Port (new).** `$PORT/packages/viewer/src/traversal.ts:139` already has `PEEK_RIGHT = 9.5, PEEK_LEFT = 7.8375,
PEEK_RAY_TOP = 8`, and `sideClear` (:546) implements the ray. So half of R2-C3's implementation suggestion is done.
Two gaps remain:
- `grenade.ts:139` still takes the toss from `|peek| > 0.5` rather than from the lean state;
- `leanTick` calls `sideClear` only when a lean starts (the continuing branch at :530 skips it), while the original
  re-tests the ray every frame.

The pressure threshold matters only for an analogue pad; keyboard input is 0/1.

### 8.5 Claim 4: UI model form: a per-visual data bit (R2-C3 item 12)

**What V7 did.**
- Re-read both builders: `FUN_003b4580` (D:L307216-307228) and `FUN_003b5f20` (D:L307836-307845).
  `(byte+2 << 62) < 0` tests bit 1 of byte +2, i.e. word bit 17, and selects 0x70 when set, else 0x68.
  Byte +4 == 1 sends the visual to 0x52/0x66.
- Second route: are the runtime records really the disc's vparams words? `vparams_rdram.out`:

  | dump | weapons' 0xbc0fa (bit 17 set) | 0xbc0f2 (set) | 0x9c0fa (clear) |
  |---|---|---|---|
  | spawn | 136 | 115 | 1410 |
  | frostA | 126 | 107 | 2271 |
  | menu / title | **0** | **0** | 1145 / 1083 |

  The bit-17 words appear only once weapons are loaded. The front end, which holds the UI models, has none.
- R2-C3's per-archive counts reproduce: UI 48 + 85 = 133 with bit 17 clear; WEAP 100 + 112 = 212 with it set.

**Verdict.** CONFIRMED. `$PORT/packages/scene/src/weapon.ts:89` still chooses `'bias'` by fit, as R2-C3 said.

### 8.6 For SPRINT-OPTIONS / the README (items 1, 2, 4 of the verifier's list)

- **A11 (flashbang).** Implement the glow on the 0.2 s offset. In flash time, level 3 is at full glow from 0.2 s to
  8.2 s, at 128 at 9.2 s and clear at 10.2 s.
- **A11b (NVG).** Use the settled iris: thresholds 0.3 / -0.05 with 0.7 s rates, after a 0.4 s transient. The NVG is
  a destination multiply `Cd*(1 + FIX/128)` per pass; do not tint it (200, 255, 200).
- **Lean (A-row from claim 3).** The ray exists in `traversal.ts`. The remaining work is to (a) re-test it every frame
  while the lean is held, and (b) derive the toss from the lean state instead of `PEEK_THROW_READING`.

## 9. Frostfire flash: the background clear takes the wash too (2026-10-24)

**Reading, independently re-read; browser reproduction, not original-console capture parity.**
The report was a white flash with a blue-purple band on Frostfire. The page applied the wash to lit colors and
fog but retained the unwashed framebuffer clear RGB. The native and PS2 rendered regression measured a base
clear of `(7,7,12)`, still `(7,7,12)` during the level-3 color wash; three maximum glow passes produced
`(189,189,255)`. A real Mark141 throw reproduced a similar band; the picture returned to normal after the blind.

The original source connects the missing clear to the same transformed color as the fog:

- `FUN_00339de0`, D:L236765-L236774: camera fog RGB times 255 goes through `FUN_003b5a10`; the transformed
  integer channels go both to GS FOGCOL (`FUN_003b10c0`, register 0x3d) and `FUN_003b0760`.
- `FUN_003b0760`, D:L304935-L304941: packs these RGB channels into the RGBAQ word addressed by `DAT_004a43c4`.
- `FUN_003b1180`, D:L305246-L305255: that pointer is initialized to 0x3e0a30 in the clear-sprite packet at
  0x3e0a00 (research 185, clear packet). Gameplay calls `FUN_003b1160(1)` at D:L50822; its implementation
  D:L305236-L305241 submits this clear packet. RenderWorld follows at D:L50840, BLUR3D at D:L50849.

The renderer now keeps the map/lens/brightness-adjusted base clear color, applies the current color-scale row
before clearing each world frame, and restores the base when the row ends. Offset units are 0..255, as fog uses,
not the lit-color path's 128. The base is not overwritten by its washed value, so the wash cannot compound across
frames. Native and PS2 share this correction. Glow gain, passes, durations and texture modulation order are unchanged.

**Timing limit (`FLASH_CLEAR_FRAME_READING`, section 11):** original clear submission precedes RenderWorld's packet
update. DMA/copy timing could make a transition use a previous-frame value; exact onset-frame parity is not established. Sustained flashes must have
the transformed clear prepared. A matching original Frostfire capture is still owed for visual parity.

Tests and delivery: [flashbang investigation](../plans/2026-10-24-flashbang-investigation.md).

## 10. Full flash envelope and audio review (2026-10-24)

The follow-up requested review of onset, recovery and sound, not just the final clear time. No visual duration or
audio implementation is changed by this review. The background-clear fix in section 9 remains separate.

**Visual envelope.** Section 8.2's two clocks still match the port: wash starts immediately, glow rises over 0.2 s,
then its recovery sequence starts. Color-wash endpoints are 2/4/10 s; glow endpoints are 2.2/4.2/10.2 s. A new
rendered regression samples all three levels in native and PS2 presentation. Saturation means a linearly declining
FIX does not give a linearly declining visible white. On the Frostfire background color `(7,7,12)`, level 3 stays
white at 8.2, 8.45, 8.7 and 8.95 s; at 9.2 s it is `(248,248,255)`, at 9.45 s `(122,122,150)`, at 9.7 s
`(54,54,69)`, and at 10.2 s the original background returns. These are measured port pixels, not console goldens.
The onset test allows one FIX unit at fractional timestamps: JS double arithmetic truncated 0.15 s to 191 rather
than the mathematical 192. Exact PS2 float/frame quantization and perceived fade still require a matched capture.

**Audio finding A: wrong recipients.** `RingingEars.start` changes `GameAudio.setVolume`, the entire output master.
It consequently attenuates the ringing sound and UI sounds routed through GameAudio as well as world sounds
(the frontend has a separate output path). The original instead plays
`.RINGING_EARS` and ducks groups 0,2,1,3,5,6; it excludes ring group 4, headset group 7 and UI group 14
(`FUN_005a0e70`, EE D:L459229-L459235; bank identities in section 3.3). The bank sound and detonation are distinct:
Frostfire's `.RINGING_EARS` is group 4 / volume 35; `.MARK_141_FLASH` is group 0 / volume 121, triggered by
`flashcrash_grenade` at command volume 2.0. Existing disc-backed audio tests check the sample lookup and command.

**Audio finding B: wrong amplitude/recovery curve.** Section 3.3's suggested *linear PCM* gain of 0.35 was too
simple. Fresh EE and IOP source reading establishes that the 0.35 acts on an integer group master **before** the
square-law voice stage:

- `FUN_003412f0`, EE D:L241197-L241249, saves each selected master and stores `trunc(saved * 0.35)`.
  An overlapping hold takes the longer remaining/requested duration; a blast in recovery restores and re-ducks.
- `FUN_003410d0`, EE D:L241137-L241173, recovers linearly in master value over five seconds after the five-second hold.
- `FUN_00019b7c`, **989SND.IRX** D:L15274-L15302, applies the group master to voice volume, then squares it.
  Master 1024 becomes 358: the approximate output ratio is `(358/1024)^2 = 0.12223`, not 0.35. Exact voice output
  also includes integer rounding; a squared post-render bus is only an approximation.
- `FUN_000190fc`, IRX D:L14873-L14915, and `FUN_00019c44`, IRX D:L15308 onward, update live matching voices too.
  Changing only future sound renders would miss already-playing one-shots, beds, streams and reverb sends.

These are independently reviewed **readings**, not an original-console audio comparison. A proper correction must
separate the selected groups, preserve the player's output controls, update live sounds and reproduce the master
curve. Merely boosting the ring or changing one final gain would not resolve both defects. Audio recovery is its
own ten-second envelope; the original evidence does not tie it to the shorter visual levels.

**Review disposition at this stage (audio correction follows in section 11):** visual duration/key transcription supported; exact visible fade parity unresolved without
original capture. Audio identity supported, but attenuation routing and amplitude curve fail source parity and
remain implementation work. Passing existing tests does not clear those findings: their present assertions encode
the whole-mix behavior and do not test the excluded groups or the IOP master stage.

## 11. Flash sound correction (2026-10-24)

The user authorized correcting section 10's audio findings. `RingingEars` now requests the original six group
masters, not the user output master. `GameAudio` snapshots their option masters, truncates the 0.35 duck and
interpolates/truncates their recovery over five seconds after the five-second hold. Multiply/add stages use float32
like the EE: saved masters 180 and 720 duck to 63 and 252, not JavaScript double's 62 and 251. The ring is played first,
in group 4, which is never ducked. A shorter overlapping hold cannot shorten the existing one; a blast during
recovery starts a fresh hold. The timer uses elapsed monotonic time, so a delayed browser callback does not add
unearned recovery time. Browser scheduling remains a 50 ms sampling adaptation with a 5 ms de-click time constant.

Each WebAudio output has group buses for dry sound and reverb **input** sends. All one-shots (including restarts),
beds, emitters, ladder loops, dialogue streams and music slots retain their bank/stream group. Already-playing
voices change through those buses without restarting samples or envelopes; subsequent voices use the same gains.
Existing convolver tails, the ring, UI group 14 and headset group 7 are not lowered via a shared wet return.
The player's output volume/mute remain independent, including changes made during the flash. The frontend's
separate output is unaffected. Group buses retain gain before preparation/unlock and disconnect on disposal.

### Readings

- `BLAST_PCM_GROUP_READING`: **squared-integer-master-ratio**. The original integer master is reproduced, but
  the gain is applied to already mixed PCM as `(current / saved)^2` rather than re-rounding every live voice.
  Current buffers have no separate voice stems; re-rendering would restart grains/random state. This is a bounded
  source-derived approximation, not bit-exact audio parity. Bank one-shots and streams retain their existing baked
  option levels; cached beds/emitters/ladder loops retain their preexisting rendering without a current option
  modifier. The duck is not also baked into the render modifier. Ratios use masters saved at blast onset.
  Zero saved masters yield zero during the duck, without division; the group multiplier restores to unity afterward.
  Option changes continue using the port's existing option behavior; this does not add a general live option mixer.
  `blastAudio.test.ts` compares all 32,767 nonnegative voice levels, seven masters (0/1/64/256/512/757/1024), and five
  fade positions against `voiceLevel`/the original integer stage: maximum absolute error normalized by 0x3fff
  was **0.000106215** (about **0.0107% of full scale**). This bounds that measured domain when the baseline PCM
  was rendered at the saved master, not every possible mix, cached-loop absolute option level, or mid-duck option change.
  Real Frostfire PCM comparisons at saved master 1024 and recovery positions 0/0.5/1 measured maximum absolute
  sample differences of **0.000056785** for `.MARK_141_FLASH` and **0.000042186** for `.M4A1_SIL` against
  separately rendered integer masters (deterministic grain inputs). A real-browser mixer test also covers 90
  active/new voice combinations across one-shots, loops, streams, music and reverb sends, including excluded groups.
  These supplement the arithmetic check. Exact per-voice
  quantization requires a live voice mixer; console capture/listening parity is not claimed.
- `FLASH_CLEAR_FRAME_READING`: **current-frame** (`renderer.ts`). The original submits the clear packet
  (`FUN_003b1160(1)`, D:L50822) before this frame's `FUN_00339de0` writes the washed colour into it (D:L50840), so
  the console's clear likely carries the previous frame's wash: one frame later at a flash's onset and end. The
  port clears with the current frame's. Owed: a capture of the original's onset frame (section 9).
- `BLAST_OPTION_CHANGE_READING`: **kept** (`blastAudio.ts`). At t = 1 the original's last `FUN_003410d0` step
  writes the masters saved at the blast (D:L241153-241162; the table cleared D:L241163-241173), and every step
  before it writes the curve over them, so an option moved during the duck is undone. The port's buses return to
  unity and keep the moved option, its renders baking the option level at play. Owed: read how the original's
  option write meets a duck in progress.

The source references for group selection, overlap and master math are section 10's independently re-read EE and
989SND.IRX functions. Tests and final verification are recorded in the investigation plan.
