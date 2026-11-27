# 442 -- The shooter's body bends with each round (RecoilPct, FUN_0057b550; LATER 1144)

- Date: 2026-11-17. Branch `agent/wm-swap-recoil`, base `origin/agent/next` 9e80907b9a. INTAKE 129 (the owner: "The
  shooter's body. The original bends the character with each shot; ours reads that value and does nothing with it").
  The main controller's go (2026-11-17 ~02:40Z): the bend as the picture; the hit volumes after a capture.
- Track: simulation. Status: **reading, pending review**. Source inspection of the r0001 decompilation
  (`socom2_game.elf.decomp.c`, cited `FUN_<addr>` and `D:L<line>`) and of the ELF's bytes. A fresh reviewer's re-read
  of the functions and the six tables at the source is owed. Section 6a's capture of the original running (relay-1,
  2026-11-17) measured the value's rise, decay and peak; it is held by no capture-scored spec or golden trace in the tree,
  so the code and the ledger keep those values as readings (`RECOIL_BEND_TIME_BASE_READING` stays owed) until one is.
  The fresh re-read (2026-11-18, the port onto agent/next): every row of the six tables and every `D:L` of
  `recoilBend.ts` re-read at the source; PASS WITH FINDINGS.
- Evidence kinds, kept apart:
  - **(D)** source inspection of the decompilation;
  - **(E)** the r0001 and r0004 ELFs' bytes (the constants' and the functions' words, read with a throwaway reader);
  - **(P)** source inspection of the port.
- New names (section 7): four constants, `RECOIL_BEND_TIME_BASE_READING`, `RECOIL_BEND_REMOTE_READING`,
  `RECOIL_BEND_ROOT_TO_CAMERA_READING` and `RECOIL_BEND_MUZZLE_READING` (`viewer/src/recoilBend.ts`); four note-only
  names (`RECOIL_BEND_HAND_READING`, `RECOIL_BEND_GATE_READING`, `RECOIL_BEND_EMPLACED_PLACEHOLDER`,
  `RECOIL_BEND_HIT_VOLUMES_PLACEHOLDER`). R4P-256 SCOPED-RECOIL (2026-11-24, reading, pending review) adds a fifth,
  `RECOIL_BEND_VIEW_GATE_READING` (`viewer/src/recoilBend.ts`, `recoilAdds`): the bend's add takes `CZKit::Recoil`'s
  view gate, so a scoped pull's first round and every binoculars round add none.

## 0. The answers

1. **Each round a player's body fires in a view of 0-3 adds the weapon's `RecoilPct` to a value on the shooter's body,
   clamped at 10** (D; section 1): an AI's round adds nothing, nor does a binoculars or scope view's (`+0x200` 4 or 5
   and up) -- so a scoped pull's first round adds none. The value falls back each tick at about 1.1 a second.
2. **That value turns 15 to 17 of 21 bone slots** by one of six tables (stance by the hand's rifle or pistol), and
   moves a few (D, E; section 2). Each bone turns by `2 v |a|`: with the rifle tables' largest axis (`rscap` standing,
   |a| 0.0457) about 1° per 0.2 of the value and about 6.7° at the 1.286 a held 15-round burst peaked at (section 6a);
   the pistol's largest (`rhand` crouched, 0.0805) about 1.8° per 0.2.
3. **For a rifle it moves the picture only** (D; section 3). The camera's node and the eye are `skel_root`'s, which no
   rifle table moves, so no round goes elsewhere. The hit volumes are left as they are until a capture (the main
   controller's ruling).
4. **The port read the field and drew nothing** (P; section 4). It now bends the page's own body in the animator's
   after-clip block, between the aim's twist and the run's bank, as the original orders it.

## 1. The value (D)

- `FUN_0057d510` (D:L440319-440327): `body+0x378 += a`; if the sum is at least 10.0 it is set to 10.0. Its one caller
  is the round's fire `FUN_005c3360` (D:L477806-477807): `a = FUN_003d2000(weapon)`, which returns weapon `+0x6c`
  (D:L324561-324565). That is `RecoilPct` (the port's `WeaponRecord.recoilPct`, `scene/src/weapons.ts`). The body is the
  kit's owner (`kit+0x830`). The add sits behind two gates in `CZKit::Recoil` `FUN_005c3360`: the owner's controller
  (`+0xc0`) answering its virtual `+0x2c` (a null controller counts false, D:L477714-477721; "IsPlayer" is atlas-parity's
  label, from what the slot answers per controller class, not a symbol), and the body's
  `+0x200` (the zoom state) below 5 and not 4 (D:L477752-477753). So an AI's round adds nothing, and a round fired in
  the binoculars (4) or a scope (5 and up) adds nothing -- in practice a scoped pull's first round, since `CZKit::Fire`
  drops the view to 1 before the later rounds of a pull (r0004's twins the same; atlas-parity's reading,
  `docs/atlas/readings/r4p-256-scoped-round-recoil-bend.md` on `agent/spc-atlas`).
- `FUN_0057b550` (D:L439231-440316) runs from `CZSealBody_Tick_0` `FUN_0057a330` (D:L439196) inside three
  tests: an outer one (D:L438703), `param_1[0x3ab] == 0` or its alternatives (D:L439107-439109), and body `+0x105f`
  bit 7 (D:L439150). Bit 7 is set by the constructor `FUN_00553ea0` (D:L419724) and again at every pre-tick by
  `CZSealBody::PreTick` `FUN_00551ec0` (D:L418490), and nothing in the r0001 export clears it, so in effect only the
  first two decide (what they test is unread here). That is
  after the head look (D:L439152-439191) and the aim's twist (`FUN_005aca70`), and before the run's bank
  (D:L439197-439204).
  - It runs only while body `+0xe0` bit 5 is set (D:L439621; unread, section 7).
  - Under 0.01 the value is set to 0 (D:L439623-439624).
  - Otherwise `v = v + v · −1.1 · body[+0x2e0]` (D:L439627), and under 0.01 again it is 0 (D:L439629-439630).
  - `+0x2e0` is read as the tick's seconds (`RECOIL_BEND_TIME_BASE_READING`), which gives a decay of 1.1/s. Under a held
    automatic at r rounds a second the value settles near `RecoilPct · r / 1.1`.
- **The emplaced branch** (D:L439633-439642): if the item at `+0xeb8` is of type 3, the function calls
  `FUN_003a7330(v · π/180)` and returns, posing no bone. Not built (section 7).
- (E) r0004, the build the rig runs: `FUN_0057d510` is byte-identical at 0x5826f0, and `FUN_0057b550` at 0x580730
  reads the same `+0xe0`, `+0x378` and `+0x2e0`.

## 2. The pose (D, E)

- **The hand.** Only with `+0xf79` 1 (the rifle) or 2 (the pistol) (D:L439683). With anything else the function returns
  having decayed the value.
- **The stance.** From `+0x174`: 0 stand, 1 crouch, 2 prone. For any other value it uses `+0x374`: 0 stand, 1 crouch,
  2 prone; anything else returns (D:L439666-439681).
- **Six tables.** Stand, crouch and prone, each for the rifle and the pistol:
  - stand/rifle D:L439718-439792, stand/pistol D:L439795-439871;
  - crouch/rifle D:L439879-439952, crouch/pistol D:L439955-440024;
  - prone/rifle D:L440037-440110, prone/pistol D:L440113-440179.
- **The bones.** Each table has a row for each of **21 bone slots**, and gives an axis `a` (three float words) to 15
  to 17 of them -- 17 standing, 16 crouched and prone with the rifle, 15 prone with the pistol (the others are the rows
  with no axis, below; counted from `RECOIL_BEND_TABLES`, held word for word to D:L439718-440179) -- and for a few an offset
  per unit of `v`.
  - The bones are the body's `FindPart` slots (the constructor, D:L419606-419652; the names from the ELF's strings).
  - They are applied in this order (D:L440183-440316): `skel_root`, `hips`, `spinelo`, `spinehi`, `lbicep`,
    `lforearm`, `lhand`, `rbicep`, `rforearm`, `rhand`, `lshoulder_wgt`, `rshoulder_wgt`, `rscap`, `neck`, `head`,
    `lthigh`, `lcalf`, `lfoot`, `rthigh`, `rcalf`, `rfoot`.
  - `lscap` (+0x330) is looked up but never bent.
- **The turn.** `FUN_003066d0(v, q, a)` builds `q = (sin(v|a|) â, cos(v|a|))`. Its `FUN_003070c0(q, node+0x20, out)` is
  the Hamilton product `q · node` (the bend first in the product), and `FUN_003072e0` normalises the result into the
  node's rotation.
- **The offset.** `FUN_00309240(node, v · offset, node)` adds the offset to the node's translation.
- **Rows with no axis.** A bone the table gives no axis keeps the default buffer `DAT_003f6460`:
  - root, hips, neck and head in most tables;
  - `rhand` crouched and prone with the rifle; `rscap` crouched with the pistol; the spine prone.
  - (E) The r0001 ELF holds 0.0 in all four words at 0x3f6460, a value set at run time. (D) The node constructor takes
    `DAT_003f6460` as a node's default rotation (`param_1[8..0xb]`, D:L135856-135859), and D:L438123 writes it into
    `skel_root`'s rotation, so it is the identity: the bone keeps its own rotation (the reviewer's finding 1).
- **The offsets.**
  - The hips: stand/rifle (0.011489, 0, 0.075324)·v.
  - The right biceps and the right shoulder weight: stand/rifle (−0.102813, −0.130555, −0.039765)·v.
  - `skel_root`: **stand/pistol only**, (0.005375, 0.059233, 0.075169)·v.
  - The full transcription is `viewer/src/recoilBend.ts` `RECOIL_BEND_TABLES`, the axes as the source's hex words,
    held by `viewer/test/recoilBend.test.ts` word for word.
- **The bones' frames** are the disc's (the port's skeleton is the disc's, research 78), so the axes are used as they
  stand.

## 3. What a player sees, and what it changes (D)

- **The picture.** The shooter's body kicks: the right shoulder and the arms go back, the spine and the legs turn a
  little, and the gun moves with `rhand`.
- **No round moves for a rifle** (the main controller's ruling (B), 2026-11-17: the muzzle, the tracer's start, the pip's muzzle ray and the launch point are taken from the unbent arm chain, `RECOIL_BEND_MUZZLE_READING`; the review found the drawn gun's muzzle moving them). The camera's node is `skel_root` (research 180 s1.3), and the first-person eye is its
  posed place plus an offset from `FUN_0029ae50` (D:L142575-142618), which has several branches: when the camera's
  `+0xc0` is not its `+0xbc` it answers a fixed global point at once (D:L142575-142580); otherwise it starts from the
  camera's part's posed place (`FUN_002869d0`, the default point without one, D:L142581-142590), then prone (`+0x174`
  2) adds a lift from the look and `+0x1348`, and else y +4.4 with z −2.5, or z 0 when either of two body tests
  (`FUN_005a78d0`, `FUN_005a77e0`) answers -- then a lean term in x. No rifle table offsets `skel_root` or gives it an axis, so the
  camera, the eye and the aim are unchanged, and so is where rounds go.
- **The pistol standing.** It moves `skel_root` by up to (0.0054, 0.059, 0.075)·v, under about 0.03 u at a pistol's
  rates. Whether the camera reads it in the same tick is unread (`RECOIL_BEND_ROOT_TO_CAMERA_READING`, not handed over).
- **Unread:**
  - whether the others' bodies bend on each console (`RECOIL_BEND_REMOTE_READING`, not built);
  - whether the muzzle flash or the tracer start at the bent gun;
  - the hit volumes: the original's hits are per posed part (research 179), so a bending shooter's own parts move a
    little. The room's `HitPoser` does not take the bend (the main controller's ruling: after a capture).

## 4. The port

- **Before.** `RecoilPct` was read into `WeaponRecord.recoilPct` (`scene/src/weapons.ts`) and used nowhere.
  `viewer/src/weaponPose.ts` said "the body's kick is `./rifleKick`'s". `rifleKick` is the aim's climb
  (`FireRifleKick*`), not the body's bend.
- **Now** (the change, section 5): `viewer/src/recoilBend.ts` holds the value, the turn and the tables. The page's own
  body takes them in the animator's after-clip block.

## 5. The change

1. `recoilBend.ts`:
   - `RecoilBend` (`add` per round: `FUN_0057d510`; `step` per tick: D:L439621-439636);
   - `bendQuat` (`FUN_003066d0`);
   - `RECOIL_BEND_TABLES` and `bendTable(stance, hand)`;
   - `layBend` (`FUN_003070c0`, `FUN_003072e0`, `FUN_00309240`).
2. The animator lays the bend after the head look and the twist and before the run's bank (`FUN_0057a330`
   D:L439196-439204), on the page's own body only (`RECOIL_BEND_REMOTE_READING`).
3. Each round the page's firearm fires in a view of 0-3 adds the weapon's `RecoilPct` (the fire, `FUN_005c3360`
   D:L477806; its view gate D:L477752-477753, section 1): `matchFirearm.ts`'s own-round handler calls `Play.recoilShot`
   when `recoilAdds(zoom.state())` passes (R4P-256, `RECOIL_BEND_VIEW_GATE_READING`). The gun's `round` has already
   dropped a later scoped round to view 1 (`FUN_005c5340` D:L479399-479406, LATER 233), so only a scoped pull's first
   round, and every binoculars round, adds none -- was: every round added, the scoped first round a departure. The
   view gate's other work in `FUN_005c3360` -- the reticle knock, its clamps and the bloom -- the port's
   `Accuracy.round` already takes on the same test (`zoomState < 5 && zoomState !== 4`), so nothing else changed. `Play` steps the value each body frame and hands it,
   with the firearm in use (`Play.item`, the rifle or the pistol), to the animator (`MoverSnapshot.recoilBend`). The
   original reads the hand's item at the tick (`+0xf79`, D:L439683), so with a grenade or C4 in the hand it poses
   nothing; the port takes the firearm in use, so a bend still decaying when a throwable is raised keeps posing until
   it falls under 0.01 -- 2.70 s from 0.2, 4.34 s from 1.286 and 6.17 s from the cap of 10 (the decay
  `v += v · -1.1 · dt` with the 0.01 floor, D:L439621-439631, stepped frame by frame at the captured `+0x2e0` of
  0.03337 s, section 6a: 81, 130 and 185 frames); a reading of the hand at the tick is owed with the rig's read.
4. `weaponPose.ts`'s comment corrected.

## 6. What would make it proven

The rig's per-frame read, ordered by the main controller. Over a single rifle round, a held automatic burst (standing,
crouched, prone) and three pistol rounds (r0004: actor at 0x00435618, the clock at 0x00442fd0), it logs body `+0x378`,
`+0x2e0`, `+0xe0`, `+0x174` and `+0xf79`. Expected by this reading:
- +0.2 a rifle round and +0.1 a pistol round, clamped at 10;
- `v` falling by 1.1 · v · `+0x2e0` a frame, with `+0x2e0` the frame's seconds.

Then a third-person frame comparison of the burst, and the same read on a second, firing actor (the remote bodies).

## 6a. Measured (relay-1's capture of the body's recoil value, 2026-11-17)

**The capture.** relay-1, r0004 on PCSX2, MP6 live, client A, 04:39-04:44Z:
- the 552 SD on automatic, standing, crouched and prone: a tap, then a 2 s held burst of 15 rounds;
- the M9 standing: three presses.

One row per distinct game clock, torn rows dropped. Hub
`evidence/weekend-mega-2026-11-14/bugs/captures/recoil-bend/` (recoil-bend.zip, 6,471,472 B, sha256 5dd44566...). The
rows read here came via the runner (text sha256 247b9544...); this seat read them with its own script. **Proven**
(a memory trace of the original compared value for value):
- **The rise.** +0.2000 a rifle round (552 SD; 0.19999-0.20000 on every isolated round) and +0.1000 a pistol round
  (M9): `FUN_0057d510` adds the round's weapon's `RecoilPct`.
- **The time base.** Body `+0x2e0` = 0.03337, the frame's seconds (one half-frame 0.01672 seen prone). Between rounds
  the value falls ×0.96329 a frame, which is `1 - 1.1 × 0.03337` to five decimals: `RECOIL_BEND_DECAY` and
  `RECOIL_BEND_TIME_BASE_READING` (1) hold.
- **The peak.** 1.275-1.286 after a 15-round burst, so the cap of 10 is not reached.
- **The gate.** Body `+0xe0` reads 125 in every row: bit 5 is set on the firing body.
- **The hand.** `+0xf79` is 1 in every rifle row and 2 in every pistol row.
- A press that only raises the gun (the rifle's tap, the pistol's first press) fires no round, and the value does not
  move.

**The firepoint against the value: read, pending the fresh reader's recount and the port's magnitudes.** The rig's
summary read "`+0x14b0` does not follow `+0x378`" from the run's first row, with the gun lowered. Measured instead from
the raised pose just before the burst (v = 0), after the burst with the climb `kit+0x24` already back at 0:
- **prone:** |fp − ref| / v = 0.407, constant over six samples (v 0.75 to 0.14);
- **crouched:** the displacement decays with v, 0.35 u at v 0.91 to 0.04 u at 0.17 (the ratio 0.38 to 0.22, a second,
  slower term);
- **standing:** it decays with v to about 0.08 u, then levels off;
- **pistol:** it decays with v (the ratio 1.3 to 1.5).

The stored firepoint therefore moves with the bend. The main controller's ruling: (B) stays in the code until a fresh
reader recounts this and the port's bent-gun muzzle is compared, per stance, with these magnitudes.

## 7. Readings

| name | value | what it stands in for | what would settle it |
|---|---|---|---|
| `RECOIL_BEND_TIME_BASE_READING` (`viewer/src/recoilBend.ts`) | 1: body `+0x2e0` read as the tick's seconds, so the value falls at 1.1/s | `FUN_0057b550` D:L439627's multiplier; its writer is `CZSealBody::PreTick` `FUN_00551ec0`, which stores its time argument there (D:L418488; r0004 D4:L457192) -- the lines once named here (D:L85635, D:L138776, D:L406314) are `CMPInfoBox::Init`, a camera constructor and `CCharacterType::Parse` and write no body; whether that argument is seconds is the caller's, unread | the rig's per-frame read of `+0x378` and `+0x2e0` over a burst (section 6) |
| `RECOIL_BEND_REMOTE_READING` (`viewer/src/recoilBend.ts`) | false: only the page's own body bends | whether each console runs `FUN_005c3360` (so `FUN_0057d510`) for a remote shooter, and body `+0xe0` bit 5's gate for remote bodies | the same read on a second, firing actor |
| `RECOIL_BEND_ROOT_TO_CAMERA_READING` (`viewer/src/recoilBend.ts`) | false: the stand-pistol table's `skel_root` offset is not handed to the camera or the eye | the order in the tick of `FUN_0057b550` and the camera's read of `skel_root` (`FUN_0029ae50`) | the read of the camera's eye against `skel_root` over pistol rounds |
| `RECOIL_BEND_MUZZLE_READING` (`viewer/src/recoilBend.ts`; `play.ts` `Play.unbent`) | false: the muzzle, the tracer's start, the pip's muzzle ray and the launch point keep the unbent arm chain's (the main controller's ruling (B)); the drawn gun bends | whether the original's firepoint `+0x14b0` is posed after `FUN_0057b550` (unread) | the rig's per-update read of `+0x14b0` through a held pull **beside** `+0x378`. Evidence so far (relay-1's LATER 1141 inputs capture, r0004 MP6, 552 SD crouched, run A-d100b): the raised firepoint drifts from (11.39, 8.07, 2.06) to (10.99, 8.35, 2.08) through a 16-round burst, and after the release, with the climb `kit+0x24` already back at 0, returns over about 0.9 s. That leans to the firepoint following the bent body, but does not settle it: `+0x378` was not logged, it is one crouched rifle run, and the decay from two points is about 1.6-1.9/s, not 1.1/s |
| `RECOIL_BEND_VIEW_GATE_READING` (`viewer/src/recoilBend.ts`; `matchFirearm.ts` through `recoilAdds`) | true: a round adds its `RecoilPct` only when body `+0x200` (the zoom state) at Recoil's time is below 5 and not 4 -- a scoped pull's first round (kit `+0x818` < 2 keeps the scope) and every binoculars round add none; a later scoped round, dropped to 1 first, adds. Reading, pending review (R4P-256, 2026-11-24) | `CZKit::Recoil` `FUN_005c3360` D:L477752-477753 around the add D:L477806-477807 (r0004 `FUN_005ca830` D4:L519757-519758, D4:L519811-519812, identical with its callees mapped); the drop `FUN_005c5340` D:L479399-479406 (D4:L521470-521476); static, both exports (atlas-parity's reading, `docs/atlas/readings/r4p-256-scoped-round-recoil-bend.md` on `agent/spc-atlas`); D:L lines re-read by the implementer, the D4 lines not | capture Q-256 (BOTH): body `+0x378` beside `+0x200`, `+0x201` and kit `+0x818` per frame through an unscoped single round, a scoped single round (`+0x378` stays 0, `+0x200` stays 5), a scoped burst (round 2's drop to 1 and its rise on one frame) and a night-vision round |
| `RECOIL_BEND_HAND_READING` (*note only*) | the firearm in use (`Play.item`) stands for the hand's item at the tick (`+0xf79`, D:L439683), so a bend still decaying when a grenade or C4 is raised keeps posing (2.70 s from 0.2, up to 6.17 s from the cap; section 5) | the hand read at the tick | the rig's log of `+0xf79` with the value |
| `RECOIL_BEND_GATE_READING` (*note only*) | not modelled: body `+0xe0` bit 5 gates the bend (D:L439621); the capture shows it set (125) on the firing body in every row (s6a) | what sets the bit | the rig's log of `+0xe0` |
| `RECOIL_BEND_EMPLACED_PLACEHOLDER` (*note only*) | not built: with an emplaced weapon (`+0xeb8` type 3) the value drives `FUN_003a7330(v · π/180)` instead of the pose (D:L439633-439642) | what `FUN_003a7330` turns | a read of `FUN_003a7330` and a capture on an emplaced gun |
| `RECOIL_BEND_HIT_VOLUMES_PLACEHOLDER` (*note only*) | not built: the room's hit volumes (`HitPoser`) do not take the bend | the original's per-part hits on a bent body (research 179) | a capture of hits on a firing body; the main controller's ruling: after a capture (LATER 1144) |
