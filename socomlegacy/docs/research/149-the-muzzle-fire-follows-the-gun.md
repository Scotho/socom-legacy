# 149 -- The muzzle fire follows the gun: how a zAnim effect is placed at its caller on every frame (MUZZLE-TRACK)

Written 2026-10-03 for MUZZLE-TRACK, on the owner's report of that day on the playable page: "when running/jumping and
shooting, muzzle fire does not track exactly with the gun -- it remains at the source of origin and causes a graphical
regression." Sources: the retail decompilation `C:/Projects/socom_pc/game/analysis/socom2_game.elf.decomp.c` (`D:L<n>`
= its line; `FUN_<addr>` its functions; cited, never pasted); the common effect set's animations as `MP2.ZDB`'s
`CZANIM.ZAR` carries them, decoded through `@s2u/scene`'s `effects.ts` (the ops below are decoded data, RS.R8); reCOM
(`C:/Projects/socom_pc/research/recom/src/gamez/zAnim/zanim.h`) for the shape of a node reference only -- its
`OBJECT_TRANSLATE_STATE` tick is declared and not written (`anim_main.cpp:313` commented out; `zanim.h:886`, `:960`),
so reCOM is evidence for nothing of the tick itself. It stands on research 89 (the effects: §1 the sequencer and the
play call's parameters, §4 the muzzle animations), 79 (the weapon table, `firepoint`), 77 §9 (zAnim) and 84 (the
recoil), and does not restate them.

The code: `packages/viewer/src/effects.ts` (`EffectPlace.node` takes the node itself, `callerMatrix`, the `LIGHT`
place, `flashAt`), `effectLights.ts` (a light re-placed each update), `main.ts` and `remotePlayers.ts` (`weaponFrame`
hands the node, not a copy of its matrix). The tests: `packages/viewer/test/muzzleTrack.test.ts` (CI, and one case on
the MP2 fixture); `packages/viewer/e2e/effects.spec.ts` ("the M4A1 flash rides the muzzle while the SEAL runs and
fires"). The registry: `docs/parity/registry/combatfx.json`, `combatfx.muzzle.flash-follows-the-gun` and
`combatfx.muzzle.casing-world-launch`. Confidence: **reading, pending review** for every transcription below; what the
owner sees in his own run is the acceptance (§5).

## 0. Answers

| # | finding | where | section |
|---|---|---|---|
| R149.1 | **The muzzle animation is handed the weapon's node by pointer and the fire point by value.** `FUN_005c5340` plays the weapon's `FireAnimName` with three typed parameters: type 3 the weapon's node (the body's `vtbl+100` look-up, D:L479453), type 5 the address of the `firepoint` node's translation (`+0x14bc`'s node, `+0x30`, D:L479461, D:L479478), type 6 the velocity. `FUN_00272c30` builds the animation's context from them: a type-3 entry stores the pointer itself (D:L120469, D:L120478); a type-5/6/7 entry copies the three floats (D:L120520-120531) | `effects.ts` `onRound`, `EffectPlace.node` | §2.1 |
| R149.2 | **The caller node is resolved afresh on every tick that uses it.** `FUN_0026f4e0` answers node index 0xfa (`NODE_CALLER`, -6) by calling `FUN_00272390` on the animation's context (D:L118164-118168), which walks the context list for the first type-3 entry and returns its pointer (D:L119952-119970) -- no matrix is cached in the animation | `effects.ts` `callerMatrix` | §2.2 |
| R149.3 | **`OBJECT_TRANSLATE_STATE`'s tick places the node at the caller as the caller is now.** `FUN_00263890` resolves the node (+6) and the reference node (+7) each tick (D:L111288-111289); with flag 2 it reads the context's type-5 position (D:L111309-111316), transforms it through the reference node's matrix (`FUN_00310980`, D:L111330-111331) and sets the node's translation (D:L111346). `flash_fire_hider`'s `fire_fix` is `rotate(-7, ref -6, flag 2)`, `translate(-7, ref -6, flag 2)`, `active`, `LOOP -1`: once a tick, every tick it lives, the flash is re-placed at the muzzle of the gun as posed that frame | `fire_fix` (decoded), `effectRunner.ts` `loop`, `effects.ts` `translate` / `rotate` | §2.3 |
| R149.4 | **The casing does not follow.** `OBJECT_MOTION`'s begin `FUN_00262690` resolves the moved node (D:L110635) and the launch frame (+9, the caller, D:L110660) once, writes the launch into the command's own state (D:L110681, D:L110713) with the context's velocity and direction (D:L110726, D:L110741); its tick `FUN_00261370` resolves the moved node only (D:L109963) and integrates that state. `shell_eject` is `translate(-7, ref -6, flag 0)` then `motion(node -7, frame -6)`: launched where the gun was at the shot, flown in the world | `effects.ts` `motion` (unchanged) | §2.4 |
| R149.5 | **The light is re-placed each tick too, and at the muzzle.** `FUN_00264cb0`'s tick recomputes the place every frame: the context's position with flag 8 (D:L111995-112013), plus the offset with flag 4 (D:L112014-112026), transformed through the node with flag 2 (D:L112027-112029). `light_at_muzzle` carries flags 0x4ea (8 and 2: the `firepoint` through the weapon node -- the muzzle), `zoom_flash_fire` 0x4e2 (2 alone: the weapon node's origin). The port placed a light once, at the node's origin when it had a node: `light_at_muzzle` sat 7.8 units back at the grip and stayed there | `effects.ts` `light`, `effectLights.ts` `begin(..., where)` | §2.5 |
| R149.6 | **The port's defect was a copy.** Both `weaponFrame()`s handed `object.matrixWorld.clone()` -- the gun's matrix at the shot -- as the caller's node; `fire_fix` re-read it faithfully every tick and found the same matrix, so the flash stayed where the gun was. The fix hands the node itself (`Object3D`) and reads its world matrix on every call, as the engine reads the pointer | `main.ts`, `remotePlayers.ts` `weaponFrame` | §3 |

## 1. The defect, in the port

A round plays the weapon's muzzle animation through `Effects.onRound` (research 89 §4) with a place: the caller's node,
the `firepoint`'s position in the weapon's frame, the fire direction. Until this task `EffectPlace.node` was a
`Matrix4`, and the page's `weaponFrame()` (`main.ts`) and `RemotePlayers.weaponFrame()` made it by
`object.updateWorldMatrix(true, false)` then `object.matrixWorld.clone()`: a snapshot of the gun at the shot.
`flash_fire_hider`'s `fire_fix` sequence loops once a tick (research 89 §4) and re-ran its translate and rotate against
that snapshot, so the flash was drawn, for the four frames it lives, where the muzzle had been when the round left.
Standing still that is the muzzle; running at the SEAL's speed, or on the jump's rise, the gun is a unit or more on by
the second frame and the flash hangs behind it -- the owner's "remains at the source of origin". The casing and the
smoke were right: both leave the gun with their own velocity (R149.4).

## 2. What the original does

### 2.1 The play call and its context (R149.1)

`FUN_005c5340` (D:L479059; research 89 §4) plays the round's animation at D:L479478 with the typed parameter list
`(3, node) (5, firepoint + 0x30) (6, velocity)`: the node is the body's item node for the held weapon (`vtbl+100`,
D:L479453 -- the `rifle` / `pistol` `CNode` of `heldItem.ts`), the position is the address of the `firepoint` node's
local translation (`+0x14bc`'s node, research 79 §3.1; a launcher's `firepoint_203` when `FUN_003c5d20` finds one,
D:L479455-479461). `FUN_00272bb0` (D:L120335) hands the list to `FUN_00272c30` (D:L120364), which makes the
animation's context (`anim+0x18`) one entry a parameter: for type 3 the entry's `+0xc` is the pointer passed
(D:L120469, D:L120478); for types 5, 6 and 7 the entry is 0x18 bytes and holds the three floats copied from the
address passed (D:L120520-120531). So the node is held by reference and the position by value -- the `firepoint`'s
constant place in the weapon (`(7.785, 0.834, 0)` for the M4A1, research 79 §2.2), which only means something through
the node.

### 2.2 Resolving the caller (R149.2)

Every command names its nodes by index; `FUN_0026f4e0` (D:L118147) turns an index into a `CNode*`. Index 0xfa (the
commands' `NODE_CALLER`, -6; research 89 §1) is answered at D:L118164-118168: when the animation has a context, by
`FUN_00272390(context, 0xfa)` (D:L119945), which walks the context's list for the first type-3 entry and returns its
`+0xc` -- the pointer stored at the play (D:L119952-119970). Index 0xf9 (`NODE_ROOT`, -7) is the animation's own
instance (`+0x3c`, D:L118170-118179). Nothing is cached: each tick that asks for the caller gets the live node. reCOM's
`_zanim_node_ref` holds its node as `zdb::CNode* node_ptr` (`zanim.h:417-437`), the same shape.

### 2.3 `OBJECT_TRANSLATE_STATE`, `OBJECT_ROTATE_STATE` and `fire_fix` (R149.3)

`FUN_00263890` (D:L111265; the translate command's tick, research 89 §1) resolves the moved node (+6) and the reference
node (+7) through `FUN_0026f4e0` at D:L111288-111289, on every call. Then (D:L111296-111346): flag 4 starts from the
node's own translation (`+0x30..+0x38`), flag 1 adds the command's offset (+8); flag 2 adds the context's type-5
position (`FUN_00272720(context, 5)`, D:L111313-111316); with a reference node the vector is transformed through it
(`FUN_00310980`, D:L111330-111331); the result is written to the node (`FUN_003157d0`, D:L111346), flags 8/0x10/0x20
keeping an axis of the node's own. `FUN_00263730` (D:L111211, the rotate) takes the reference node's world rotation the
same way (research 89 §1).

`flash_fire_hider` (MP2's `CZANIM`, decoded by `@s2u/scene`; research 89 §4) runs `fire_fix` beside `fire_rotate`,
`fire_scale` and `light_at_muzzle`:

```
fire_fix:   OBJECT_ROTATE_STATE    node -7  ref -6  flags 2  (0, 0, 0)
            OBJECT_TRANSLATE_STATE node -7  ref -6  flags 2  (0, 0, 0)
            OBJECT_ACTIVE_STATE    node -7  on
            LOOP -1
fire_scale: ... OBJECT_MOTION_FROM_TO scale 0.1 -> 1.2 | 0.9 | 1.3 over 0.05 s; WAIT 1 frame; STOP_SEQUENCE fire_fix; OBJECT_ACTIVE_STATE -7 off
```

The `LOOP` returns to the sequence's start once a tick (`FUN_0025ede0`; `effectRunner.ts`), so on each of the flash's
frames the instance is turned as the weapon and put at `weapon x firepoint`, as the weapon is posed on that frame. The
flash follows the gun because it is placed again every frame, not because anything attaches it.

### 2.4 `OBJECT_MOTION`: the casing is launched once (R149.4)

`FUN_00262690` (D:L110463; the motion command's begin, research 89 §2) resolves the moved node at D:L110635 and the
launch frame node (+9) at D:L110660 -- once -- and writes the launch (the direction through the frame's rotation, the
speed, the acceleration) into the command's own state (D:L110681, D:L110713), adding the context's velocity (type 6,
D:L110726) and direction (type 7, D:L110741). The tick `FUN_00261370` (D:L109820) resolves only the moved node (+8,
D:L109963) and steps that state; the frame is never read again. `shell_eject`'s sequence is `translate(-7, ref -6,
flag 0)` -- the instance at the caller's origin -- then `motion(node -7, frame -6, flags 0xcf3)` and, with five casings
out, the cheap `0xc13` flight (research 89 §2): a casing leaves where the gun was at the shot and flies on in the world.
`shell_smoke_med`'s particle source would follow its node (flag A 0x10, `FUN_00329b40`; `particles.ts`) but is switched
off in the retail data (research 89 §3); the shotgun's `shell_smoke_big` follows the caller for its 0.2 s (`node -6`,
`follow`), and the port already did that.

### 2.5 `LIGHT`: re-placed each tick, at the muzzle (R149.5)

`FUN_00264cb0` (D:L111906; the light command's tick, research 89 §10) computes where the light is on every call
(D:L111991-112031): a zero vector; with flag 8 the context's type-5 position (`FUN_00272720(context, 5)`,
D:L111995-112013); with flag 4 plus the command's offset (+0x14, D:L112014-112026); with flag 2 transformed through
the node at +8 (`FUN_0026f4e0` then `FUN_00310980`, D:L112027-112029). `flash_fire_hider`'s `light_at_muzzle` carries
flags 0x4ea: 8 and 2 both set, node -6 -- the `firepoint` through the weapon's node, the muzzle, every tick for its
0.07 s. `zoom_flash_fire` (the aim view's) carries 0x4e2: flag 2 alone -- the weapon node's origin. The port had read
"its node's place, else the context's point" (research 89 §10's gloss) and placed the light once at the node's origin
when it had a node: `light_at_muzzle` therefore lit the grip, 7.8 units behind the muzzle, and stayed where the gun was.

## 3. The fix in the port

- `EffectPlace.node` is a `CallerNode`: the `Object3D` itself (the engine's pointer) or a `Matrix4` its owner moves in
  place (the wading ripples' node, `rippleNode`, unchanged). `Effects.callerMatrix` brings an `Object3D`'s world matrix
  up to date and reads it on every call; every command that resolves `NODE_CALLER` -- `translate`, `rotate`, the
  `motion`'s launch frame, a particle source's node and its `follow`, the `light`, a `sound`'s place, the range test --
  goes through it. `fire_fix`'s loop therefore re-places the flash at the posed muzzle each frame with no other change.
- `Effects.onRound` takes `{ node, muzzle }`; `main.ts`'s `weaponFrame()` and `RemotePlayers.weaponFrame()` hand the
  held weapon's object (`heldKit.rifle.object` / the remote's `weapon` or `sidearm`) and the model's `firepoint`. The
  page poses the local body (`play.frame`) and the others (`net.frame`) before `effects.update` runs, and `fire.update`
  fires after `play.frame`, so the first tick's pose and every later tick's are the frame's own.
- The `light` command computes its place as the tick does -- the context's position (flag 8), the offset (flag 4),
  through the node (flag 2) -- and hands `EffectLights.begin` a `where` the pass re-reads on every update
  (`LivePass.where`, `step`). `light_at_muzzle` now lights the muzzle and moves with it. [reading: the receiver meshes a
  pass reaches are still those its widest sphere met at the begin; a 0.07 s light moves under a unit while the SEAL
  runs, and the body and the gun are skinned receivers taken whole.]
- `EffectStats.flashAt`: the drawn `muzzle_flash_*` instance's world origin, for the browser spec; `EffectLights.stats().at`
  the live passes' places, for the unit test.
- Nothing is tuned: no constant was added or changed; `animator.ts`, `heldItem.ts` and `fire.ts` are untouched.

## 4. What holds it

`packages/viewer/test/muzzleTrack.test.ts` (CI, data `none`, with hand-built programs copied from the decoded ops):
a flash program with `fire_fix`'s four ops is drawn at `node x firepoint` on each of three frames while the node strides,
rises and turns, turned as the node, and is gone with its run; a casing launched from the node keeps its own world path
after the node has moved a hundred units; a light with `light_at_muzzle`'s flags sits at the muzzle, not the grip, and
is re-placed after the node moves; `onRound` with `{ node, muzzle }` plays the flash at the moving node. On the MP2
fixture: `muzzle_m4`'s `muzzle_flash_hider` instance sits on the muzzle, moves 30 units with the node between two frames
while `shell_eject`'s casing moves under 5. The mutation check: the test is red when `callerMatrix` hands a stale copy
(the code before this task) and when the light's place is computed once. The registry entries name these tests.

`packages/viewer/e2e/effects.spec.ts`, "the M4A1 flash rides the muzzle while the SEAL runs and fires": Frostfire at
spawn A with the M4A1 (`kit=54,...`: `muzzle_m4` draws a flash; the SD's does not), the forward key held, a round from
the hook each 150 ms, `flashAt` and the posed `muzzle` read in the same frame one page frame after the round (the body a
stride on; the flash alive at any frame rate): each flash within 0.05 units of the muzzle -- the same matrix, float
error only; a flash left at the shot would sit a stride back, 0.3 units a frame at 60 fps -- while the feet moved over 4
units from where the SEAL stood.

## 5. Evidence ledger

- **Source inspection**: the decomp lines cited in §2, read for this note; the decoded `CZANIM` ops of `flash_fire_hider`,
  `shell_eject`, `shell_eject_first_person`, `zoom_flash_fire`, `shell_smoke_big` (MP2's fixture, through the viewer's
  `effectsFromDisc`).
- **Unit test**: `npx vitest run packages/viewer/test/muzzleTrack.test.ts ...` -- RED 5 failed of 5 on the code before
  the change; GREEN 188 passed over the nine files of the verification command (the brief's two missing files replaced
  by `heldWeapon`, `remoteKit`, `remoteAim`, `play`).
- **Rendered browser run**: `E2E_PORT=5380 npx playwright test packages/viewer/e2e/effects.spec.ts -g "rides the muzzle"`
  on 2026-10-03 (Chromium headless, the page's own backend, the forward key held by Playwright, the rounds from the hook):
  1 passed in 8.2 s with a 1.5-unit tolerance two frames after the shot; then the whole file, 7 passed in 1.7 min, with
  the final form (one frame after the shot, 0.05 units): every lit sample's flash on the posed muzzle, the feet over 4
  units from where the SEAL stood. Two earlier forms are recorded: pressing W without the canvas hovered and measuring
  the feet between lit samples found the flash on the muzzle and the SEAL still (the spec now holds W as `accuracy.spec`
  does and measures from the standing feet); sampling two frames after the shot went flaky once the page ran slower
  late in the file (two frames can outlive a 0.05 s + 1 frame flash). The spec was not run against the code before the
  change (the old `onRound` type does not build with it); the unit RED is the mutation evidence.
- **Physical playtest**: none by the implementer; the owner's eye on his own run is the acceptance (HUMAN_TASKS, the
  controller's row if one is written).
- **Capture comparison**: none -- what would move the claim to proven (§7).

- **The owner's eye, 2026-10-04** (HUMAN_TASKS H77): on his own run on the preview the flash and its light ride the
  gun while running, jumping and shooting -- "appear correct". The acceptance by the eye is met; the proven level
  (a capture of the original) stays owed as above.

## 6. Placeholders and readings

No `*_READING` or `*_PLACEHOLDER` constant was added or resolved. Readings in prose, held by the tests above:

- R149.1-R149.5 are transcriptions of the cited functions and of the decoded data, pending a reviewer's re-read at the
  lines.
- The light pass's reach set fixed at its begin (§3): the engine re-evaluates the visuals a light touches each frame
  (research 89 §10); the port's passes are pooled per receiver and the set is taken at the begin. For a muzzle light
  moving under a unit in 0.07 s the difference is not drawn; a long-lived moving light (none on the gunplay's path) would
  show it.

## 7. Owed

- A capture of the original firing while running (PCSX2 or the recomp), scored frame by frame for the flash's place
  against the gun, to move `combatfx.muzzle.flash-follows-the-gun` from reading to proven.
- A reviewer's re-read of D:L111288-111346, D:L118164-118168, D:L119952-119970, D:L120469-120531, D:L111995-112031 and
  D:L479453-479478.
- Research 89 §10's gloss ("its node's place (flag 0x2: the caller), else the context's point (0x8)") is superseded by
  §2.5 here; the note is re-filed when it is next edited.
