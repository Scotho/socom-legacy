# 211 -- The weapon swap by carry state ("guns hot" against "guns down"): one clip per case, and the port's layering

Written 2026-10-05 for web sprint 25 (the plan `../plans/2026-10-04-three-maps-and-feel.md`), from the research run
that answered the owner's report: "there are weapon swap issues not related to speed ... it really only works well when
swapping in 'guns hot' state, and it looks off when guns are down". The branch read was `agent/s25-feel` at `4c0f5c43`.
The scripts and raw outputs are kept in the research scratch (`rdr.ts`, `animset.ts`, `pose.ts`, `look.ts`, the headless
probe `swap.probe.ts`, `out1.txt`, `out2.txt`); they are not in the tree. It stands on
[150 §3](150-the-reload-while-running.md) (the second channel), [181 §2.7 and §3.5](181-c3-combat-hud-effects.md) (the
hand-off phases, the re-parent), [201 §1, §5, §17 and §27.5](201-r2-c2-movement.md) (the swap's gate, the raise, the
head look), [202 §3.11](202-r2-c3-combat.md) (the mount blend) and
[206 §1](206-verification-overrides-and-the-waves-close.md) (the overrides, which win where they disagree).

Grades: **reading** = a source read (the decomp, the disc through the repository's readers, the port's code; "measured"
is a number the repository's own readers or a headless run of the port's code produced); **inference** = one or more
interpretive steps; **unresolved** = not settled without a capture.

## 0. Answers

1. The original has **no carry-state swap variants**. There is one clip per stance (stand, crouch, prone) and one
   moving overlay, and the disc holds no relaxed or hot form of them. The selector `FUN_005a64c0` reads only the item in
   hand, the target class, the stance word and `|v|^2 <= 400`; it never reads the raise state `+0xf74` / `+0x1160`
   (reading, §1-§2).
2. All four swap clips are **authored from the lowered pose**: key 0 sits 10-17 degrees (mean over the parts) from
   `seal_stand` / `seal_crouch` / `seal_prone` and 22-46 degrees from the Fire poses; the last key matches `seal_p_*`
   within 1.6-4.7 degrees (reading, measured). From the hot pose the original covers the gap with the body's 0.4 s
   cross-fade (§3).
3. The swap does not raise or lower the rifle first: no `FUN_005dfe30` call lies on the swap path, and no Fire version
   is blended during the swap, because the swap types have none (reading, §3).
4. **Port defect G1 (moving, hot):** the Fire pose layer was applied *after* the moving-swap overlay, at weight 1
   (`animator.ts:826-875` at `4c0f5c43`). With the rifle hot the arms never played `seal_mv_rifle2pistol`: 30-45 degrees
   off it for the whole swap (measured). The original lays the second channel over the merged main channel at 1.0,
   Fire sub-nodes included ([150 §3.5](150-the-reload-while-running.md)).
5. **Port defect G2 (moving, both states):** the overlay faded out over the clip's last 0.4 s, inside the clip
   (`animator.ts:831`), and ran on the one-shot clock (1.197 s) instead of the second channel's 1.257 s. The pistol
   hand-off at 0.79 landed while the arms were already drifting back. Visible only with the rifle down: hot, G1 hid it.
6. **Port defect G3 (standing, hot):** the aim twist was dropped in one frame at a `NoPitchtwist` clip's start. It is
   not in the frozen pose (`animator.ts:906-911`, `942`): a 9-degree spine pop at level aim, more aiming up or down.
7. Standing with the rifle down, the rifle visibly jumps 2.9-4.3 units at the swap's start and end while the body is
   still (measured). The reading of the node flag `+0x42` bit 0 (§3.5) says the original does the same: the instant
   re-parent the owner ruled for on 2026-10-04 is the original's. A capture is owed to see it (§7, C1).
8. The corpus already held the facts behind G1-G2 (150 §3.5, R150.5), the 206 §1.2 override that the local player's
   head-look turn lead and glances never run, and the gates of 201 §1 / 206 A27 (refused at zoom >= 4, allowed during
   a stance change). The code did otherwise in each case (§5).
9. New here: the `+0x42` flag mechanics (an exact reading behind the instant re-parent); the player's anim mode is
   always "default" (the "ready" idles are the AI's); `seal_swaprifle` is the weapon pick-up's clip, not the swap's.
10. Plan (§6): lay the swap overlay after the Fire layer, on the second channel's clock, with snapshot cross-fades;
    carry the twist into the frozen pose; then the gates; the head-look removal is the owner's call.

## 1. Every swap-related clip on the disc

Sources: `MOTION_P.ZAR` read with `tools/dump-motion.ts --pack`; `READERC.ZAR/motion.rdr` and `animset.rdr` read with
`@s2u/archive`. All readings.

The pack's 334-name list contains **no** `seal_swappistol`, no `*_relaxed_*`, no `*_ready_*` swap, no `seal_p_*2rifle`,
no crouch or prone moving swap and no fire-pose swap. The swap family is complete as listed.

| clip | animset type (Seal set / SOLDIER) | keys | `playback` | flags in `motion.rdr` | `BlendTime` | callbacks | parts |
|---|---|---|---|---|---|---|---|
| `seal_rifle2pistol` | `Rifle -> Pistol` (0x35) | 32 | 1.32 | NoPitchtwist, NoFire, NoInterrupt (bare = 1), max_velocity -1, looped 0 | absent -> 0.4 (`FUN_00287620` D:L131465) | `pack_rustle` @ 0.44 | 27 (whole body) |
| `seal_crouch_rifle2pistol` | `Crouch rifle -> Pistol` (0x36) | 23 | 1.0 | same | absent -> 0.4 | `pack_rustle` @ 0.44 | 27 |
| `seal_prone_rifle2pistol` | `Prone rifle -> Pistol` (0x37) | 38 | 1.8 | same + `Normalize` (not parsed by the port) | absent -> 0.4 | `pack_rustle` @ 0.53 | 27 |
| `seal_mv_rifle2pistol` | `Moving rifle -> Pistol` (`DAT_003dec68`) | 21 | 1.32 | same + **BlendOverlay** | absent (never read on the second channel, R150.5) | `pack_rustle` @ 0.44 | 16: `do_not_use rifle spinehi lbicep lforearm lhand rbicep rforearm rhand pistol r/lshoulder_wgt l/rscap neck head` (no root, hips, `spinelo`, legs) |
| `seal_rifle2launcher` / `seal_pistol2launcher` | `Rifle -> Launcher` / `Pistol -> Launcher` | 35 / 24 | 1.5 | NoPitchtwist, NoFire, NoInterrupt | absent | -- | 28 |
| `seal_mv_rifle2launcher` / `seal_mv_pistol2launcher` | `moving_rifle_to_launcher` / `moving_pistol_to_launcher` | 35 / 24 | 1.5 | NoPitchtwist, NoFire, BlendOverlay (**no** NoInterrupt, no max_velocity) | absent | -- | 16 |
| `seal_swaprifle` | `Swap rifle` (`DAT_003dec78`) | 31 | 1.1 | NoPitchtwist, NoFire, NoInterrupt | absent | -- | 28 |
| `seal_rifle2handsfree` / `seal_pistol2handsfree` | `rifle_to_handsfree` / `pistol_to_handsfree` (`DAT_003df120/128`) | 13 / 5 | 0.78 / 0.55 | NoPitchtwist, NoFire, NoInterrupt | absent | -- | 14 / 15 |

The hand-off phases (reading):
- The stance clips: `FUN_00588bc0` sets the action's trigger at 0.72 / 0.82 / 0.62 (D:L446304-446398;
  [181 §2.7](181-c3-combat-hud-effects.md)).
- The moving overlay: `FUN_0057a010` sets `+0x1f4` = 0.79 (`0x3f4a3d71`) for kind 6 (rifle in hand, `FUN_005a7730`)
  and kind 5 (pistol in hand, run backwards, `FUN_005a75d0`) (D:L438603-438624).
- The launcher overlays: kinds 8 / 10 at 0.27 / 0.13 (D:L438583-438600).

The lengths (the one-shot rule is `playback x ((n-1)/n)^2`; the second channel's is `playback x (n-1)/n`, R150.5):
stand 1.239 s, crouch 0.915 s, prone 1.707 s, moving **1.257 s on the second channel** (the port used 1.197 s, §4).

- `seal_swaprifle` is **not** the L1/L2 swap: the weapon pick-up `FUN_0059f0c0` pushes it (D:L458198-458214,
  `FUN_00588bc0(…, DAT_003dec78, …)`), and `FUN_0057d5e0` skips its pistol remap while it plays (D:L440371) (reading;
  that `FUN_0059f0c0` is the pick-up is an inference from its body).
- The handsfree types have no code reference besides their registration (D:L495416-495417) (reading: no other use
  found).

**Start and end poses** (reading, measured: the rotation difference per part between keys, the mean over the shared
parts, then the largest arm parts):

| comparison | mean | notable |
|---|---|---|
| `seal_rifle2pistol` key 0 against `seal_stand` (lowered) | **9.9 deg** | lhand 39, rhand 11, spine 1 |
| … against `seal_fp_stand` (hot) | 32.7 deg | arms 67-71, spinelo 33, hips 27 |
| last key against `seal_p_stand` | **1.6 deg** | rhand 18 |
| last key against `seal_pfp_stand` | 28.0 deg | arms 57-87 |
| crouch key 0 against `seal_crouch` / `seal_fp_crouch` | 17.1 / 22.3 | crouch idles `_alert01/02` (70 % of crouches): 28.5 / 29.4 (hips 27-39) |
| crouch last against `seal_p_crouch` / `seal_pfp_crouch` | 4.7 / 38.1 | |
| prone key 0 against `seal_prone` / `seal_fp_prone` | 14.5 / 24.1 | |
| prone last against `seal_p_prone` / `seal_pfp_prone` | 2.4 / 28.4 | |
| `seal_mv_rifle2pistol` key 0 against `seal_walk_alert` / `seal_fp_walk` | 28.7 / 46.0 | |
| mv last against `seal_p_walk` / `seal_pfp_walk` | 18.0 / 56.2 | |

So every swap clip is authored to start from and end on the lowered set (inference from the numbers).

## 2. How the original picks the swap clip

The chain (all reading):

1. **The press.** `FUN_00594cf0` (D:L453288-453312) reads actions 9 and 10 (L1/L2). Each passes the gate
   (`FUN_005a8cb0`, `FUN_005bdc30`, `FUN_005be030`, `FUN_005c4fd0`; [201 §1](201-r2-c2-movement.md)), then calls
   `FUN_005c4b10`.
2. **`FUN_005c4b10`** (D:L478779-478937) sets the kit slot `+0x824`; resets the raise *times* by class
   (`FUN_005dffc0` for firearms, `FUN_005dfff0` otherwise -- the times only, not the raise state); classes the old and
   new items (1 rifle, 2 pistol, 4 launcher, 3 items 0x79/0x97, 0 other); and calls `FUN_005c50b0`, which sets the
   kit's "swap pending" bit (byte 1, 0x10) and clears the "instant" bit (0x20) (D:L478979-479010).
3. **`FUN_005dfc80`** (the raise tick, D:L494179-494230) ends every tick with `FUN_005c1660`. Its early `return`
   cannot trigger (it masks with 0xef, then compares with 0x10), so the swap waits on nothing in the raise state.
4. **`FUN_005c1660`** (D:L476695-476740): with bit 0x10 set it calls `FUN_005a64c0(seal, from = +0xf79, to = class,
   instant = bit 0x20)`.
5. **`FUN_005a64c0`** (D:L461852-462044), the instant flag clear, reads `+0xf79` (the item in hand), the target class,
   whether the rifle or pistol node's parent is the hand (`piVar8[0xd4]/[0xd5]+0x1c == piVar8[0xc0]`), **the stance word
   `+0x174`** (`piVar8[0x5d]`: 0 stand, 1 crouch, 2 prone) and **the speed** `vx^2+vy^2+vz^2 <= 400`
   (D:L461923-461925). The branches:

   | to | stance | still (<= 20/s) | moving |
   |---|---|---|---|
   | pistol | prone | `0x37` forward (re-parent `FUN_005a7260`, `FUN_0057d5e0(2)`), D:L461933-461936 | same |
   | pistol | crouch | `0x36` forward, D:L461939-461942 | `DAT_003dec68` overlay, D:L461945 |
   | pistol | stand | `0x35` forward, D:L461949-461952 | overlay, D:L461955 |
   | pistol | other posture | no clip: `FUN_005a7260(1)` + `FUN_005a60d0(2)` instant, D:L461958-461961 | |
   | rifle | prone / crouch / stand | `0x37` / `0x36` / `0x35` with the 4th argument 1 = backwards, D:L461974/79/88 | overlay, D:L461982/91 |
   | rifle | other posture | instant `FUN_005a70f0(1)` + `FUN_005a60d0(1)` | |
   | same class already in hand (from 2/3 to 2; from 1/3 to 1) | | instant re-mount, no clip, D:L461927-461929 / 461966-461968 | |
   | to class 3/0 (items) | | no clip: a body snapshot cross-fade of 0.3 s (`FUN_0028e3e0`, `piVar8[0x5e/0x5f]` = 0.3), D:L461917-461920 | |

6. **The overlay's direction** is decided in `FUN_00587780` (D:L445370-445400), not by `FUN_00588bc0`'s 4th argument,
   which the overlay path ignores: `+0xf79 == 1` gives kind 6, played forward; `+0xf79 == 2` gives kind 5, started at
   the clip's end (`+0x1ec` = length) and run backwards by `FUN_0028d3f0(…, 1)` (D:L438618). The ends:
   `FUN_0057a010` (D:L438576-438640) runs the re-parents at the overlay's start and arms the hand-off at 0.79;
   `FUN_00579ef0` (D:L438515-438550) mounts the final weapon (`FUN_005a60d0(seal, 2|1, 0)`) at the last key; both set the
   body's 0.4 s snapshot cross-fade (`+0x10d0`).

**State words read by none of steps 1-6** (reading of each function body): `+0xf74` (`m_weapon_state`, SOCOM 1's
DWARF name; desktop research 50 L267), the raise envelope `+0x1160`, the anim mode `+0x1336`, the zoom state, the
reload, traversal. The last three act only as **gates** before the swap starts ([201 §1](201-r2-c2-movement.md), a
reading):
- refused at zoom >= 4 (`FUN_005c4fd0`);
- refused during any reload or swap (`FUN_005a7ab0` / `FUN_005a7980`);
- refused on a ladder, a hang, a peek, a carry, in the air, on the slide, in a knock-down, landing, get-up, `180` or
  dive (`FUN_005b4340(actor, 4)`); refused in a vehicle;
- **allowed during a stance transition and a throw**. The throw half is corrected in 206 §1.2: `FUN_005a7de0(actor,1,1)`
  may add refusals.

Aiming does not change the clip; aiming down a scope is refused outright.

The four tests answer for the whole press, before `FUN_005c4b10` acts: refused, nothing of it acts -- no throwable put
away, no launcher lowered (reading of the order in `FUN_00594cf0`; the port's `kit.ts` `pressShoulder` on the page's
`shoulderGate`: the body free, the mover's `WalkMode.swapGate`, the slot usable).

The player update reads its presses in one order (reading): the jump (Square, D:L453208-453217), the Action (Cross,
D:L453218-453243), the shoulders (D:L453288-453312), the zoom (D:L453313-453323), the stance (Triangle,
D:L453331-453430). So a swap is weighed against the view before that update's zoom step, after its jump and Action and
before its stance. The switch writes the new slot `+0x824` at once (`FUN_005c4b10` D:L478842), and the zoom step reads its
record through it (`FUN_005445b0` -> `FUN_005c3780`), so a step in the same update counts against the new slot: the rifle
at first person, Up and L2 in one update, ends at the binoculars (4), and that view stays up through the swap -- the
switch drops only the night vision (201 §2 A31). The port's room takes a command's presses in that order
(`MoverSim.prepare`; its view is the command's `Scope`, set after the swap); its page, whose presses land between ticks,
keeps it within a tick: a jump pressed after an Action, a swap or a stance, or an Action pressed after a swap or a
stance, waits for the next tick; a swap pressed after a stance is refused; the swap weighs the view the last tick left
(`WalkMode.swapGate`), and at its press the tick's zoom steps go again against the new slot's record and hold -- its
own fire mode, so a launcher round stays at first person (`Zoom.switchWeapon`, `main.ts` `zoomHold`) -- with the view's
effects following the replay: the tick's first-pass scope raise and knock clear taken back, the replay's applied
(`Accuracy.undoViewTick`, `applyViewPath`). The page and the room then agree on the weapon, the clip and the view
whatever the order of the presses inside a tick (inference: a tick stands for the update; the reviews of the swap
layering, 2026-10-05).

Unresolved here:
- when the original's actor tick executes the jump request (`+0x105e` bit 2, `FUN_005469c0`) against the swap's clip
  (not traced);
- the peek's place in the room's order: the update reads it after the stance (D:L453431-453458), the room still takes
  the lean first (`MoverSim.prepare`); owed.
- a replay rewinds the view to the tick's start, so another zoom change set earlier in that tick (an L3 round mode's
  drop) is lost: the page's view, not the room's, can differ from the original's (the L3 order is not traced).

## 3. What "guns down" is in the original

### 3.1 The state (reading)

- `seal+0xf74`: 1 raised, 2 lowered, the 0x10 bit "in transition". Written only by `FUN_005dfe30` / `FUN_005dfc80`
  (D:L494179-494290; [201 §5](201-r2-c2-movement.md)).
- The envelope at `+0x1160`: in 0.1 s, hold 100000 s, out 0.5 s (`FUN_005dffc0`).
- The player's controller asks for "up" on a trigger edge, or in a scope (201 §17), and for "down" 5 s after the
  trigger goes idle (`FUN_00594cf0` D:L453560-453650; `FUN_00598280` sets 5.0).

### 3.2 Its clips (reading)

- "Down" is the anim set's base clips at weight 0 of the Fire blend: `seal_stand`, `seal_walk_alert`,
  `seal_jog_alert`, `seal_run`, the crouch's three idles, `seal_prone`, and `seal_p_*` with the pistol.
- "Hot" is the same play with each slot's Fire version (`seal_fp_*` / `seal_pfp_*`) blended in at the envelope's weight
  as a sub-node: `FUN_0057a330` D:L438828-438860 for slots flagged 0x40, through `FUN_0058c820` -> `FUN_0058c970` ->
  `FUN_005e1a10` / `FUN_005e19d0`.
- The anim set's **"ready" mode** (`Stand`: `seal_stand_alert01/02`; `Walk`: `seal_walk_alert02`) is written only by
  `FUN_0057d710` from `FUN_0058c5d0`, whose callers sit in the `CSealCtrlAi` code range (0x5604c0, 0x56fd00, next to
  `SetupAnimations__11CSealCtrlAi` 0x567e10 in Harry62's labels); the constructor zeroes it (D:L419517). So the player is
  always in "default" (reading of the writes; the AI attribution is an inference).

### 3.3 A swap asked for while down

- **Same clip, same selector, same blend.** The SEAL does not raise first: nothing on the swap path calls
  `FUN_005dfe30` (reading).
- The swap types have no Fire version, so no Fire sub-node is blended while the swap action is on top: in
  `FUN_0057a330` `FUN_005e3d90` returns 0 and the sub-node is cleared (D:L438830-438858) (reading for the code path;
  that the swap types are absent from `FUN_005e0690`'s 12 pairs is a reading of the port's transcription,
  `weaponPose.ts:59-81`).

### 3.4 What differs between hot and down

- **At the start.** Down starts within about 10-17 degrees of the clip's key 0; hot crosses 23-46 degrees in the body's
  0.4 s cross-fade from the Fire pose (`FUN_0028dc90`; `BlendTime` default 0.4) (reading plus measurement).
- **At the end.** Down returns to `seal_p_*`, about the last key, so it is seamless; hot re-blends `seal_pfp_*` at
  weight 1 over the returning play's cross-fade (0.5 s for `seal_stand`) (inference from the same mechanisms).
- **The head look** may run only while down (`FUN_0057a330` D:L439154-439160; the swap clips carry no `NoHeadlooks`,
  `FUN_00587b40` D:L445479-445510, bit 0x20 from the loader D:L131348-131353). For the **local player**, though, the
  rotator gets no requests: the turn lead and the glances sit behind `DAT_0066b3e0`, which nothing writes
  ([201 §27.5](201-r2-c2-movement.md), adopted in [206 §1.2](206-verification-overrides-and-the-waves-close.md)). So in
  the original the head stays ahead (reading through 206).
- **The twist.** The stance clips are `NoPitchtwist`, so there is no twist during them either way. The moving overlay
  is not read by `FUN_00587a30` (the main channel's last node is the locomotion), so the twist stays on under it when
  hot (reading, D:L445447-445476; [150 §3.6](150-the-reload-while-running.md)). What the twist does at a
  `NoPitchtwist` play's start is the body's snapshot's: it freezes the drawn pose, the twist in it (inference: the
  snapshot `FUN_0028e3e0` copies the nodes as drawn; the order against the twist's write was not traced line by line).

### 3.5 The re-parent is instant in both states, and the body eases (a new exact reading)

- Every re-parent clears bit 0 of the weapon node's `+0x42` (D:L462222, 462233, 462261, 462272, 462299, 462321,
  462344, 462368, 462390, 462413).
- That bit gates the per-node snapshot blend (`FUN_0028e0d0` / `FUN_0028e040`, D:L135262-135300).
- The body's blend tick `FUN_00576860` re-arms it on the rifle and pistol nodes (`+0x350`, `+0x354`) and the other
  props only when the cross-fade has run out (D:L436690-436701).
- So the moved weapon takes the clip's local in its new parent's frame at once, while the body cross-fades.

This upgrades [181 §3.5](181-c3-combat-hud-effects.md) and [202 §3.11](202-r2-c3-combat.md) to a reading, and backs the
owner's ruling of 2026-10-04 (the instant re-parent and its cut blend).

## 4. The port's behaviour at `4c0f5c43`, case by case

The port's "hot/down" (reading): `WeaponRaise` (`weaponRaise.ts:117-205`) ports `+0xf74` / `+0x1160`, fed the trigger
and `aiming: walk.view() === 'scope'` (`main.ts:1182`). Its weight drives the Fire layer (`weaponPose.ts:282-319`, a
pose layer added at `play.ts:511`) and the aim twist and the head-look gate (`play.ts:364-371` ->
`animator.ts:918-942`). The swap pick ignores it (`mover.ts:1054-1068`), as the original does.

Measured with the port's own code, headless, on the disc's clips (the probe; `out2.txt`). "Fid" is the mean rotation
difference between the drawn upper body and the swap clip's own key, over `spinehi`, the arms, the neck and the head:

| case | port behaviour (file:line) | measured | against the original |
|---|---|---|---|
| stand, still, down -> pistol | `Rifle -> Pistol` action (`mover.ts:1059-1063`); rifle to the `swap` mount and `m_item` 2 at once (`kit.ts:124-131`); 0.4 s cross-fade (`animator.ts:661-686`); head look runs (`animator.ts:924`) | frame 0: muzzle +4.09 units, hands still (0.00); fid 12-19 deg for 0.3 s, then 0.0 to the end | matches (same clip, instant re-parent, body ease); the frame-0 jump is the original's mechanics too (inference, capture owed) |
| stand, still, hot -> pistol | the same; the Fire layer null on the swap clip (`weaponPose.ts:296-300`); **twist dropped in one frame** (`animator.ts:942`, not in the frozen pose `animator.ts:906-911`) | frame 0: muzzle +4.71, hand step 0.85 (twist 0.16 rad -> 0); fid 34-35 deg -> 0 by f24 | the twist pop is **a gap** (G3; inference) |
| stand -> rifle (backwards), down / hot | the same clip backwards; the end re-parent to the hand (`kit.ts:178-189`) | end: muzzle +2.88 (down, hands still) / +4.11 (hot, hands moving) | matches (inference) |
| moving (> 20/s), down -> pistol | overlay `seal_mv_rifle2pistol` (`mover.ts:1065-1066`), **weight ramp in and out inside the clip** (`animator.ts:829-831`), **one-shot clock** 1.197 s (`mover.ts:678-679, 1065`, `oneShotSeconds`) | fid 18-21 deg at start, 0.0 mid-clip, **16-23 deg over its last 0.2 s** (f54-f66) while the pistol is handed at 0.79 | **gap** (G2): the original lays it at 1.0 to the last key at 1.257 s, then cross-fades 0.4 s from the pose on screen (R150.5) |
| moving, hot -> pistol / rifle | the Fire layer applied **after** the overlay (`animator.ts:845-875` after `826-844`) at weight 1: the arms stay in `seal_pfp_run` | fid **30-45 deg throughout, up to 134 deg** (rbicep); end jump +10.4 (to the rifle) | **gap** (G1, the biggest): the original's overlay overrides the merged main channel, Fire sub-nodes included (150 §3.5, D:L437456-437461) |
| crouch still / moving | `swapCrouch` action / the overlay over crouch locomotion (`mover.ts:1058-1067`) | not run (same code paths) | matches the selector; the crouch idles are 28-29 deg from key 0 (the original's too) |
| prone | `swapProne` whatever the speed (`mover.ts:1059`) | -- | matches |
| standing swap cut by the stick | goes on as the overlay at the phase reached (`mover.ts:1466-1471`) | the rifle held on `spinelo` across the cut (`swapContinuity.test.ts`) | matches the selector; inherits the overlay's gaps |
| scope / binoculars (zoom >= 4) | **accepted**; a scope >= 5 dropped to 1, the binoculars kept (`main.ts:659, 672-673`) | -- | **gap** (G4): refused at >= 4 (`FUN_005c4fd0`, 201 §1, §2 A31) |
| during a stance transition | **refused** (`mover.ts:1055`: any action) | -- | **gap** (G4): allowed (206 §1.3 A27); which clip then plays is unresolved |
| mid-reload / throwing | refused (`main.ts:659`) | -- | matches (`FUN_005a7ab0`; the throw: unresolved) |
| ladder, climb, lean (traversal) | refused (`walk.ts:462`, `moves.busy()`) | -- | matches |
| head look while down | turn lead and glances requested every tick (`animator.ts:533`, `headLook.ts:198-225`), applied at raise weight 0 | up to head 8, neck 5, spine 2 deg | **gap** (G5, minor): never requested for the local player (206 §1.2) |

**The gaps, ranked by how much they change the swap's look:** G1 the Fire layer over the moving overlay (moving +
hot); G2 the overlay's timing (a weight ramp inside the clip instead of 1.0 to the last key plus a 0.4 s snapshot
after; the one-shot clock instead of the second channel's); G3 the twist pop at a `NoPitchtwist` start (hot); G4 the
gates (zoom >= 4, stance transitions); G5 the head-look requests (down, minor). **Not gaps:** the selector, the instant
re-parent, the start and end jumps when down.

## 5. What the corpus recorded and the code did not follow

| the note says (source) | the code at `4c0f5c43` did |
|---|---|
| The second channel is laid **over the merged main channel at 1.0**, sub-nodes merged first; the body cross-fades from the pose on screen over 0.4 s **at its start and after its end**; its clock is t/playback x n, freed at playback x (n-1)/n ([150 §3.4-§3.5](150-the-reload-while-running.md), R150.2, R150.5) | `weaponPose.ts` applies all of it to the moving **reload** only. The moving **swap** in `animator.ts:826-844` sat under the pose layers (Fire won), ramped `min(in, out)` inside the clip (`:831`), and `mover.ts:1065` gave it `oneShotSeconds` |
| `animator.ts:822-825`'s own comment: "the body cross-fading from the pose on screen over 0.4 s at its start and its end" | the code beneath (`:831`) faded the overlay's weight out over the clip's last 0.4 s, before its end |
| The local player's head-look forcing, turn lead and glances never run (201 §27.5; **206 §1.2 wins**) | `headLook.ts:198-225` requests both every tick (`animator.ts:533`); its header still describes them as the player's |
| The swap is refused at zoom >= 4 and allowed during a stance transition (201 §1; 206 §1.3 A27) | `mover.ts:1055` refused any action; `main.ts:659` had no zoom test; `main.ts:672-673` dropped a scope and kept the binoculars "through the swap" -- 201 §2 A31: unreachable |
| The hand-off phases are read: 0.72 / 0.82 / 0.62 (181 §2.7) and 0.79 for the overlay (`FUN_0057a010` D:L438613/438624, §1) | `kit.ts:27-29, 53-58` still called them "not settled" |
| `animator.ts:906-911`: the twist and bank are "not kept in the pose the next cross-fade leaves (the game's snapshot would carry them; a tenth of a degree's difference)" | true of the bank, not of the twist at a `NoPitchtwist` start: 0.16 rad gone in one frame at level aim (measured) |
| 202 §3.11 decides the mount blend from "`seal_swaprifle`, the swap clip of `Swap rifle`" | that is the pick-up's clip (§1); the swap's four clips also lack `BlendTime`, so its conclusion stands |
| `mover.ts:1048-1050`: "[reading for the moving one, pushed forward both ways]" | the code (`reversed` on the overlay) is right; the citation is `FUN_00587780` kind 5 + `FUN_0028d3f0(…,1)` (D:L445380-445398, 438618), which run it backwards |

## 6. The plan, and what sprint 25 takes

Tests first; each fails on `4c0f5c43`. T1, T3 and T4 use the disc fixtures, as `swapContinuity.test.ts` does.

1. **T1, the overlay over Fire:** moving, raise weight 1, swap to the pistol; from 0.45 s to the last key the overlay's
   arm parts equal `seal_mv_rifle2pistol`'s key within 0.5 degrees. At `4c0f5c43`: 30-45 degrees.
2. **T2, the clock:** the overlay's seconds are `1.32 x 20/21` = 1.2571, its key at `t` is `t / 1.32 x 21`;
   `SwapProgress` reaches 1 at the last key. At `4c0f5c43`: 1.1973.
3. **T3, the overlay's end:** at phase 0.9 the overlay's parts are at weight 1 (under 0.5 degrees); after the last key
   the body eases from the frozen pose over 0.4 s, smoothstep. At `4c0f5c43`: 16-23 degrees before the end.
4. **T4, the twist** (hot, standing, aiming up): on the swap's first frame no spine part steps more than the
   cross-fade's own step. At `4c0f5c43`: the twist vanishes in one frame.
5. **T5, the gates:** the swap refused at zoom 4 and 5 with no zoom change; accepted during `standToCrouch`. The clip
   then waits on capture C3; until then the stance word is the mover's (the new stance at once, `FUN_005817d0` and
   kin), a reading of the stance change, not of the swap during it.
6. **T6, the head look** (only once the owner rules, since it changes the idle look): turn axis 1 for 2 s and 12 s
   idle leave the rotator at (0, 0, -1).

The code, in order:
- **G1+G2:** `animator.ts` `pose()`: the swap overlay below the pose-layer loop, in the reload layer's slot (the second
  channel holds one node; the gates make the moving reload and the moving swap exclusive, `FUN_005a7ab0`,
  `FUN_005b4340`), at weight 1 on its parts; the 0.4 s ease from `snapshot(OVERLAY_BLEND)` at the overlay's start and at
  its last key (the body's `+0x10d0`), not a weight ramp; `overlaid` / `heldShown`'s frame logic as it is.
- `mover.ts:679, 1065, 1469-1471`: the second channel's clock, `playback x (n-1)/n`, its key `t/playback x n`; the
  cut's carry-over on the same clock.
- **G3:** `animator.ts`: when `start()` freezes the pose for a play whose last node is `NoPitchtwist`, freeze it with
  the twist applied.
- **G4:** gate the swap in `mover.ts:1055` (201 §1); refuse at zoom >= 4 (`main.ts:659`) and drop the unreachable scope
  drop (`main.ts:673`); mirror both in the room (201 §1: "the room must refuse the same switches").
- **G5** (the owner's call): stop `HeadLook.request`'s turn lead and glances for the local player (`animator.ts:533`);
  keep the rotator and the clamp for remotes and the AI (201 §27.5).
- Then re-run `swapContinuity.test.ts`; its `CLIP_STEP` bound may move at the overlay's end.
- Docs (the controller's, by its doc procedure): KNOWN, the `+0x42` reading behind the instant re-parent; research 84
  §11, the hand-off phases are readings; 202 §3.11's clip name.

Landed in sprint 25 (the swap-layer task, which wrote this note): G1-G4 with T1-T5 (`swapOverlay.test.ts`,
`walk.test.ts`, `room.test.ts`) and the `kit.ts` comments; the stance-change half of G4 is the plan's PF-39 (sprint 28),
pulled forward because it is the same code. The review's two lows followed: the gate weighs the view the last command
left, on the page and in the room (`netSwap.test.ts`), and gates the whole shoulder press (`kit.test.ts`), §2. The docs:
research 84 §11 and 202 §3.11 rewritten. G5 waits on the owner (HUMAN_TASKS H98).

## 7. Owed captures

These cannot be settled by reading. PCSX2 with PINE, one MP map, offline, our own build; no server.

- **C1, standing, lowered against hot, L2 then L1.** Lowered: wait more than 5 s after the last shot; hot: fire one
  shot, then swap within 5 s. 60 fps video; poll per frame `+0xf74`, the envelope (`+0x1160`, four floats), the top
  anim id `+0x534`, the rifle node's world matrix (`+0x350` -> node). Settles whether the original's rifle also jumps
  about 4 units on frame 0 with a still body when lowered (§0 item 7), and how the hot start's cross-fade looks.
- **C2, running (stick full), lowered against hot, L2 and back:** the same polls plus the overlay record `+0x1e4` /
  `+0x1ec` / `+0x1f2`. Settles G1 (do the arms play the overlay when hot?) and G2 (weight 1 to the last key at about
  1.257 s, then a 0.4 s ease).
- **C3, L2 pressed during `Stand -> Crouch` and during `Crouch -> Prone`:** accepted or denied, and which of 0x35 /
  0x36 / 0x37 plays (`+0x534`, `+0x174`). Settles A27's clip.
- **C4, L2 while turning hard with the rifle lowered:** does the head lead the turn (`+0x11a0`)? Confirms 206 §1.2
  visually before G5.
- **C5, L2 in a scope (state 5) and the binoculars (state 4):** the denied sound and no zoom change, per 201 §1.

## 8. Placeholders and readings

None added by this note before §10 (§10.5 names three, TRIGGER-SWAP, 2026-11-09). The hand-off phases the port names
`HAND_OFF_READING` (`packages/viewer/src/kit.ts`) are the
code's own constants (§1), a reading pending review; the name keeps its suffix under the grading rule:

| name | value | status |
|---|---|---|
| `HAND_OFF_READING` | stand 0.72, crouch 0.82, prone 0.62, moving 0.79 | a reading: `FUN_00588bc0` D:L446304-446398 (181 §2.7), `FUN_0057a010` D:L438603-438624 (§1) |

## 9. Settled, not settled

- Settled (readings): the swap family on the disc (§1); the selector and its inputs (§2); that the raise state never
  enters the swap (§2-§3); the instant re-parent (§3.5: the `+0x42` bit -- this repository's record of it, there being no
  KNOWN-style file in `socomlegacy/docs`; it upgrades 181 §3.5 and 202 §3.11); the second channel's composition and clock
  (150 §3.4-§3.5); the gates at zoom >= 4 and during a stance change (201 §1), the whole press gated before it acts.
- Not settled (unresolved without a capture or more reading): what `+0x174` holds during a stance transition, and so
  which swap clip plays there (C3); what `Normalize` does on `seal_prone_rifle2pistol` (the loader key is not traced);
  whether `FUN_005a7de0(actor,1,1)` refuses a swap mid-throw (206 §1.2); how the lowered swap's frame-0 rifle jump
  looks on the original (C1).

## 10. The fire button held through a swap (TRIGGER-SWAP, 2026-11-09)

Added 2026-11-09 for Craig's report: "When swapping from grenades to primary weapon I have to lift my trigger finger and
repress the button to get it to shoot." Simulation track, `agent/bug-trigger-swap` (from `agent/v0417` at `802b7e037`).
Every line here is a **reading** (TRIGGER-SWAP's review PASS WITH FINDINGS, per the merge 604917dd1): the decompilation read, not measured running.

### 10.1 The original (reading)

- **The trigger is the pad's level, whatever is in the hand.** The player's controller `FUN_00594cf0` steps the trigger
  state at controller +0x118 each frame from the fire button (`FUN_002c60c0(2, pad)`), D:L453543-453567: 0 up, 2 the
  press, 1 held, 3 the let-go (the same machine as `FUN_00597790` D:L454354-454384). Only while a throwable's wind-up
  bits (+0x170 0x40 / 0x80) are set is it stepped by the pressure branch instead (D:L453481-453537).
- **The slot change leaves it.** `FUN_005c4b10` (D:L478779-478936) writes the new slot +0x824, zeroes +0x810
  (D:L478836-478839, D:L478926-478929), clears the wind-up bit 0x40 (D:L478914) and zeroes the throw's power +0x11c
  (`FUN_00592d40`, D:L478915 -> D:L451961-451965); it touches neither the trigger state +0x118 nor the kit's pull count
  +0x818. (Bit 0x10 of +0x170, set at D:L478907, is the HUD's redraw: `FUN_00592c30` D:L451912-451921, read by the HUD
  `FUN_001f7ff0` D:L56666 -- not a trigger latch.)
- **The firearm fires on a held trigger.** Its kit frame (`FUN_005c0fd0`, D:L476565-476569) asks `FUN_005c0ae0` each
  frame: states 1 and 2 pass (D:L476420), refused while the count +0x818 is at the limit (`FUN_005c0940`'s 1, 3 or
  10000, D:L476439-476441), under NoFire (`FUN_005a7de0`, D:L476442), below a full raise for a bullet class
  (D:L476423-476438) and while the rate's timer runs (D:L476446-476448). So once the drawn firearm's gates lift it fires
  with the button still held -- no new press -- in every fire mode while the count is under the limit.
- **The count is the kit's.** Only a frame whose trigger reads 0 or 3 zeroes it (D:L476380-476382, D:L476399-476400).
  The throwable's own use (class 'y', `FUN_005be9a0` D:L475490-475512) raises none; a hand throw's end raises it by one
  (`FUN_005c1970` D:L477023-477025) and a launcher's round its round branch's (D:L475514-475516). So a trigger held
  from before a throw's hand opened (pressed again in the throw's clip) into the firearm comes with a count of 1: a
  single refuses until the let-go, a burst gives two rounds, an automatic runs on.
- **The reverse.** From the firearm to a throwable with the button held, the wind-up bit is set only on the press state
  2 (D:L453624-453637); a held state 1 only raises the body (`FUN_005dfe30`, D:L453612-453613), so no wind-up, no throw, until a new press.

### 10.2 The port before the fix, and the verdict

`Fire.pull` heard only the edge (`packages/viewer/src/matchFirearm.ts` `trigger`: `if (down) fire.pull()`), and a press
the throwable or the launcher took (`FirearmHands.trigger`, `./matchThrow`) was never the firearm's, so after the put-away
`Fire.held` stayed false and the held button fired nothing until let go and pressed again. The room has no press latch
for the firearm (`packages/match/src/room.ts` carries the command's trigger bit, `p.trigger`, and gates rounds by rate).
**Our bug**: the original fires on the held button.

### 10.3 The fix

`./matchFirearm` keeps a press the hands took and not let go (`triggerOwed`); each `fireFrame` asks the hands
(`FirearmHands.heldPulls`, `./matchThrow`) and, once nothing there owns the trigger (no item up, the launcher neither up
nor coming down, not mounted), pulls the firearm with the count the hands' item raised in the hold (`Fire.pull(carried)`:
0 for a press under a throw, made while it is pending or after the hand opened, last grenade or not (research 326 §2.1, §7.2, GRENADE-RETHROW; capture GR-1) -- 1 for a rocket that left, else 0; *was:* 1 for a press while pending, settled to 0 at the pop with a grenade left and `LAST_GRENADE_PENDING_PRESS_PULLS_READING` (retired 2026-11-09) on the slot's last; *was:* 1 after any press in a throw's clip). Out of the walk, under the round screens, behind a
screen holding the input or dead, nothing is owed. The reverse is unchanged (the throwable still waits for a press).
Tests: `fire.test.ts`, `matchFirearm.test.ts`, `matchThrow.test.ts` ("TRIGGER-SWAP").

### 10.4 The fold (2026-11-09, the review's follow-up): the firearm swap, the dismount, the rocket's timer

Reading (the merge 604917dd1's review). The kit's three fields the switch leaves, carried through each slot change the port makes:

- **The firearm swap** (`SWAP_HELD_TRIGGER_READING`, resolved): `Kit`'s `started` no longer lets the trigger go, and
  `Fire.setWeapon` keeps the pull count (`pulled`, +0x818) and the rate's timer (`wait`, +0x81c) -- `FUN_005c4b10`
  (D:L478779-478936) zeroes +0x810 (D:L478836-478839, D:L478926-478929) and the throw's power +0x11c (`FUN_00592d40`,
  D:L478915), neither of those. A button held through L1 / L2 fires the drawn firearm once the swap (`ready`) and the raise
  allow, refused at the count's limit (D:L476439-476441: a single already fired waits for the let-go). The bloom's count
  (`Accuracy.trigger`, `burst`) is left as its own rule has it: with no let-go at the swap it is not zeroed, and the
  command's trigger bit stays set on the wire, so the room's cone (`net/shotCone.ts`, zeroed on the bit's edge) agrees.
  A spawn's kit is still `Fire.refill`'s (the trigger let go, the timer 0). *LATER 792 (§10.7):* a held trigger (the
  edge 1) refuses the swap itself, so this case is reached only by a press on the swap's own update (the edge 2).
- **An item up over a held firearm trigger**: the grenade's and the launcher's equip suspend the firearm
  (`MatchFirearm.suspendTrigger`): let go, the hold owed back with its count once the item is put away -- was "a slot
  change lets a held trigger go", the misreading. The items' own latches (the placing's `placingDown`, the launcher's
  `launcherDown`) still let go at the change: a launcher or a placing raised over a held trigger waits for a press, as
  the throwable's press-only wind-up does (D:L453624-453637); for the launcher, whose class `FUN_005c0ae0` passes on a
  held state too, that is the port's, not settled here.
- **The dismount** (`MOUNT_HELD_TRIGGER_DISMOUNT_READING`, resolved): the turret is a kit slot (the mount: `FUN_005463c0`
  keeps the slot in the hand at +0xebc and changes to the turret's, D:L412214-412218 -> `FUN_005c4b10`) whose rounds raise
  the same count (`FUN_005be9a0` D:L475514-475516). The dismount (`FUN_00545ee0`) changes back to the kept slot,
  `FUN_005c4b10(kit, +0xebc)` at D:L412005, then clears the turret's slot with `FUN_005b9bb0` at D:L412006 (its record and
  ring, D:L472372-472471; `FUN_005b9a00` D:L472290-472372 beneath it) -- neither writes +0x818 or +0x81c. So a turret
  press held through the dismount is the rifle's once the release clip ends, with the turret's rounds of the hold counted
  (`matchActions` `pageHands.heldPulls`, through `./matchThrow`'s `heldPulls`). A press the release clip or the dance took
  (`triggerTaken`) stays theirs until let go: `heldPulls` is null for it, and the rifle is handed nothing (the review's F1,
  `matchActions.test.ts`).
- **A weapon taken from the ground** (the review's F2): the pickup into the slot (`FUN_0059f0c0`, called at once offline by
  `FUN_0059f610` D:L458316 and by the accept's apply `FUN_0059dfb0` D:L457706) takes its same-family branch when the slot
  exists (D:L458278-458282: `FUN_005b8fc0`, `FUN_005b8f20`, `FUN_005bc410`) -- no slot change, no `FUN_005c4b10` (that is
  only the no-slot branch's, D:L458275). `FUN_005bc410` (D:L473809-473875) writes the slot's record (D:L473829) and, for
  the hand's slot (D:L473852), zeroes the throw's power (`FUN_00592d40`, D:L473854) and +0x810 (D:L473865-473868); the
  drops before it (`FUN_0059fd50` D:L458535-458632 -> `FUN_005ba040` D:L472559-472704; `FUN_0059f730`
  D:L458351-458460) and `FUN_005b8fc0` (D:L471903-471915) / `FUN_005b8f20` (D:L471883-471903) write neither +0x818 nor
  +0x81c. `Fire.takeWeapon` keeps the count and the timer for the same weapon too (was: zeroed on a same-name pickup;
  another name already kept them through `setWeapon`); the reload stopped and the kick restarted are as before.
- **The rocket's timer**: `FUN_005c0ae0`'s rate refusal reads the kit's +0x81c (D:L476446-476448), the one field the
  launch writes with the round's FireWait (D:L475514-475517; the RPG's and the LAW's 3 s) and the kit frame runs down
  (`FUN_005c0fd0` D:L476643-476647). So the firearm's first round after a rocket waits it out: the lower hands what is left
  to `Fire.holdWait` (the longer stands). `KIT_TIMER_TICK_READING`: the port runs it down on the page's clock through the
  lower clip, as the launcher's own wait; the original runs it down only on kit frames `FUN_005c1970` lets through
  (D:L476565-476569), unread for the lower clip -- if it does not tick there, the original's first round waits longer.
- Owed: a capture of the original -- a grenade up, R1 held, L1 to the rifle (single and automatic); a grenade thrown,
  R1 pressed again before the hand opens, the last one gone; R1 held through L1 / L2 after a single's round and after
  none; R1 held through a dismount after one turret round; the rifle's first round after an RPG, lowered at once; R1 held
  through a ground pickup of the weapon in the hand after a single's round.

### 10.5 Readings (TRIGGER-SWAP's names; also research 101's TRIGGER-SWAP rows)

- `SWAP_HELD_TRIGGER_READING`: resolved by the fold (§10.4).
- `MOUNT_HELD_TRIGGER_DISMOUNT_READING`: resolved by the fold (§10.4).
- `KIT_TIMER_TICK_READING`: the kit timer +0x81c run down on the page's clock through the launcher's lower (§10.4).
- `SWAP_HELD_EDGE_READING`: 1 -- the controller's trigger edge `+0x118` at which the kit's swap gate `FUN_005a8cb0`
  refuses (D:L463174-463181), read by the port off the raise's edge (`Play.triggerEdge`); the gate's clause the code's
  reading, its outcomes measured, upload pending (§10.7, LATER 792).

### 10.6 GR-1, 2026-11-09: §10.3's case measured on the original

Capture GR-1 (research 326 §7.2, where the run, its tolerances and the item's substitution are set out: agent-mail
`evidence/gr-1-2026-11-09/`, r0004 on PCSX2 2.8.2, the MARK141, class 0x79, in place of the M67), compared value for value
by a reader who wrote neither the fix nor the capture. A live memory trace of the original running; kept apart from the
readings above.

- **§10.3's case, proven for the class-0x79 path** (the primary leg, 3/3): a throwable re-armed under a held R1 (a
  press after the hand opened, held through the pop), L1 to the primary, R1 still held: the next row the wind-up's bit
  0x40 and the power clear and the edge reads 2 (the held button a fresh press on the firearm), then 1; the kit count
  `+0x818` rises 1, 2, 3 from 0 under the held button and stays at 3 to the let-go (the count's limit refusing more,
  D:L476439-476441), then 0 at the edge 3. So the held trigger is the firearm's after the put-away, and the count a press
  after the hand opened hands it is 0 -- the fix's `Fire.pull(carried)` with 0. The rate timer `+0x81c` reads 0.0786,
  0.0453, 0.0119, 0 between rounds, one 1/30 s step a kit frame.
- **The count after a press while pending** (§10.3's "1 ... on the slot's last grenade it is
  `LAST_GRENADE_PENDING_PRESS_PULLS_READING`"): measured 0 on the last grenade (3/3): the press stays at the edge 0 until
  the slot is empty and the launch's kit frame zeroes the count; the reading's value 1 is contradicted, the name kept
  with the finding (research 326 §7.2, research 101's GRENADE-RETHROW row). L1 under the held R1 after the last grenade
  fired nothing (3/3), not explained by the count. The port's fold done 2026-11-09: 0 from the launch, the name
  retired; the port so fires there (research 326 §7.2), the no-round outcome open.
- **Not exercised by GR-1**: the firearm-to-firearm swap (`SWAP_HELD_TRIGGER_READING`'s own case), the dismount
  (`MOUNT_HELD_TRIGGER_DISMOUNT_READING`), and the launcher's timer through its lower (`KIT_TIMER_TICK_READING`) -- each
  stands as §10.4 files it.

### 10.7 LATER 792, 2026-11-11: the swap refused under a held trigger

Asked by the main controller after research 326 §7.3's isolation legs (`agent/last-grenade` 58cbcf94d) found the port
taking L1 under a held R1 where the original does not. Simulation track; the code's reading **reading, pending review**,
the outcomes measured (upload pending).

- **The gate (reading).** Every swap passes `FUN_005a8cb0` (D:L463150-463189): L1 and L2 in the player control
  (`FUN_00594cf0` D:L453288-453312, buttons 9 and 10 on the slots kept at `ctrl+0x224` / `+0x228`; refused, the denied
  sound `FUN_003419c0`) and the inventory menu's take (`FUN_0021bda0` D:L72684-72693; `FUN_0021c6f0`'s at D:L72830). Its
  last clause (D:L463174-463181): with `+0xeb8` 0 it passes only when the body has no controller (`body+0xc0`, set with
  its back pointer `ctrl+4` by `FUN_002a26f0` D:L146774-146781) or the controller's edge `+0x118` is not 1; at 1, held, it
  answers 0. The swap's test runs before the update's trigger step (D:L453288-453312 before D:L453543-453567), so it
  reads the edge the last update left: a press is 2 on its own update -- passed -- and 1 from the next.
- **Where a held R1 is not the edge 1 (reading; the primary leg measured).** A hand grenade up (the selected slot's class
  'y', `FUN_005c8040` D:L480686-480696) with one in its slot (`FUN_005bdb00` D:L474543-474549) takes the press into the
  wind-up and remaps it 2 -> 3 -> 0 (D:L453633-453661); the wind-up's chase (D:L453507-453518) does not step the edge.
  So R1 held over a throwable that can still be thrown reads 0 -- research 326 §7.2 measured the edge 0 at the primary
  leg's L1 (3.30) "under the double remap", and the swap was taken there (case (b) of the brief). Once the slot is empty
  `FUN_005bdb00` finds none, the press stays 2 and then 1 (D:L453633-453634; measured 2 then 1 after the last launch,
  research 326 §7.2). A firearm, the launcher (class 0x91) and a placing (0x97) are not 'y': held, 1.
- **Measured** (research 326 §7.3: r0004 on PCSX2 2.8.2, PINE reads, 3 trials a leg, re-read by a fresh reader; proven
  for those legs once the rows are uploaded, until then a live memory trace held on the owner's second PC):

  | leg | the press at L1 | `+0x824` | the gate's edge |
  |---|---|---|---|
  | the empty MARK141, R1 held since before the last launch (16.15), L1 at 19.0 | held | 4 throughout: not taken | 1 |
  | the same, R1 let go at 16.0 | up | 4 -> 0: taken | 0 |
  | the pistol up, R1 up, L1 at 2.0 | up | 1 -> 0: taken | 0 |
  | the pistol up, R1 held 1.0-5.0 (one round), L1 at 3.0 | held | 1 throughout: not taken | 1 |
  | the rifle up, R1 up or held | -- | 0 throughout: L1 from the primary is no swap | 0 / 1 |
  | a grenade left, R1 held since 2.00, the re-armed wind-up, L1 at 3.30 | held | 4 -> 0: taken, the rifle's rounds on the held R1 | 0 |

  Among the logged columns the edge alone separates the grenade pair (research 326 §7.3); that the clause above is what
  refuses stays the code's reading.
- **The port before.** `kitFree` (the page's half of `FUN_005a8cb0`) had no edge clause, so L1 from the emptied grenade
  under the held R1 put it away and drew the rifle, which took the held trigger (`triggerOwed`, §10.3) and fired -- one
  round for a single, three for a burst; the pistol's L1 under its own held trigger swapped as well (§10.4's firearm
  case); and any slot (L2, keys 1-5, the inventory) was taken under a held firearm trigger.
- **The fix.** `kitFree` refuses while `Play.triggerEdge()` reads `SWAP_HELD_EDGE_READING` (1): the edge the port
  already steps for the rifle's raise (`./weaponRaise` `WeaponRaise`, once a game frame, with the class 'y' remap, the
  wind-up and the throw's release), the same `+0x118`. Every swap source passes it: `selectFirearm` (L1 / L2, keys 1 and
  2), `takeSlot` (keys 3-5), the inventory's open (`kitChangeGate`) and take (`shoulderGate`), and `Kit.select`'s
  `canSwap`. Tests: `throwAgain.test.ts` ("LATER 792", and the GRENADE-RETHROW fold's two last-grenade cases, whose
  "the firearm taken" was the stand-in firearm's, corrected), on the page's assembly (the one firearm, a real `Play`).
- **Consequences.** §10.4's firearm swap under a held button and an item taken up over a held firearm trigger
  (`suspendTrigger`) are reached now only through a press on the swap's own update (the edge 2), as in the original.
  The room (`packages/match/src/room.ts` `swapRefused`) has no edge clause and needs none here: the page is the authority
  over the swap's ask (`Button.Swap` is sent only once `canSwap` passes), so under a held edge neither the swap nor the
  drawn firearm's rounds reach it; the command's trigger bit is the firearm's alone (`./matchActions`), so the room could
  not read a throwable's held press to mirror the clause.
- **Open.** (1) The pop's remap: at a throw's pop with R1 held the original moves the edge 1 -> 3 (D:L453484-453501),
  then 3 -> 2 -> 1 (measured, research 326 §7.2: "At the pop ... the edge 3, 2, 1"), so for the two updates after the last
  grenade's pop it would take an L1; the port's raise runs that branch only for the pistol hand's ungated throw
  (`lowerNext`), so its edge stays 1 and refuses there -- about 67 ms, not built (the same pop as
  `THROW_LAST_GRENADE_RAISE_READING`). (2) The port counts the edge's updates on game frames, as its raise does
  (`RAISE_ENVELOPE_STEP_READING`). (3) Route B (the Action quick-use of the charges, `+0x828`) and the M67's own pass are
  not in the capture's rows.
