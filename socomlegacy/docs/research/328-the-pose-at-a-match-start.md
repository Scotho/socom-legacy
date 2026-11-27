# 328 -- The pose at a match's start: what the body plays at a round's spawn after the end screen, against the port (NU-12, PARITY-2)

- Date: 2026-10-15 (01:00Z). The next-update checklist's row NU-12 (the owner's second batch, NU.R4; split to the
  gameplay lane by NU.R5), folded into [PARITY-2](../plans/2026-10-08-web-sprint-parity-2.md). **A read alone**
  ([brief](../plans/briefs/2026-10-15-nu12-match-start-pose-read.md)): the build is a later brief, from section 5.
  Branch `agent/nu12-read` from `a434f180a`.
- Review: a fresh review of `d943bd428` returned **PASS WITH FINDINGS (high)**: the cause holds at the source, and
  B2's `startTick` mark catches a survivor (the room's `clock()` runs before `snapshots()`). F1 (the no-blend's lines),
  F2 (the copy's respawn path) and F5 (which case the owner saw) are folded here, each with the text it corrected kept
  beside ("was: ..."); F3 and F4 go to the build brief. The status is unchanged.
- Build (2026-10-15, [brief](../plans/briefs/2026-10-15-nu12-spawn-pose-build.md), branch `agent/nu12` from
  `d7089b674`): **B1 built** (the own body: `Play.respawn` at the walk's spawn, `WalkMode.spawns`; the posed root
  dropped at `respawn`); **B2's page side built** (`RemotePlayers.frame`: the copy rebuilt and its binoculars stopped
  at its seat's `spawn` as the client counts it on the body drawn, and at a dead-to-alive change where none is counted);
  **T1 pinned** (`packages/central/test/roomSpawnPose.test.ts`, passing on the code as it stood). B2 is keyed on the
  room's `spawn` event for every seat (the build brief's F3), not on `startTick` (§5 B2's (b), kept below as written).
  **The net client's hunk built** once the online seat cleared it (`net/client.ts` is its hot file): `NetClient.bodies`
  counts each seat's spawns on the body it draws (`spawns`; `markSpawn`, `spawnsAt`, the old marks folded) and draws a
  body spawned between its two snapshots whole from the newer, no lerp of the feet (D6); the room's order it rests on
  (a seat's `spawn` before the first snapshot drawing it, on one socket) pinned by
  `packages/central/test/roomSpawnOrder.test.ts`. *Was: "Held: ... waits on the online seat's clearance".* A replay
  counts no spawns (`ReplayClient.bodies`, not built): its copies take the dead-to-alive rebuild alone
  (`REMOTE_RESPAWN_REBUILD_READING`). Not built: B4. Reading, pending review.
- Status throughout: **reading, pending review.** Source inspection only: the decompilation and the game ELF's bytes
  were read, the committed golden was read, and the port's code was read. No game, emulator, reader, test or browser was
  run (no node process at all). Where the port's behaviour is stated it is read off its source, not run. Nothing here is
  proven, and nothing counts as a reading until a reviewer who did not write this note re-reads it at the source. A step
  marked *inference* is one interpretive step past the code.
- Sources. `D:L<n>` is a line of `game/analysis/socom2_game.elf.decomp.c` (SHA256
  `B9E863762F08D55602C4310C9491286879CFCF2947683E723BC2905E1AAA42D4`, re-hashed for this note). The ELF
  `game/disc/socom2_game.elf` (read only, by its program headers, through a scratch script): 0x65c4c0 `skel_root` (the
  root node the initializer binds, D:L419599-419607). The disc's data: the committed golden only --
  `packages/viewer/test/golden/motion-rdr.json` (`motion.rdr`: `looped`, `playback`, `BlendTime`, `NoInterrupt`). No
  reader was run. The desktop: none read (`desktop@be5578311ff2dd33a814d39e7d6d4f2255da4da3` is the pin, unused). The
  port's lines are this branch's base `a434f180a`.
- Evidence read first, not restated (cited, built on, not re-derived): research [91](91-the-round.md) §4.1-§4.3 and its
  respawn table (the round's reload, the rebuild, the 4/s fade-in); [317](317-bodies-and-drops-on-the-ground.md) §1.5
  and R317.4 (the body is its player's actor, rebuilt at the respawn and at the round's reload; PAR-91's own corpse,
  NU-4's others'); [323](323-picking-up-dropped-weapons.md) §3 (the round's reload re-places every player, alive or
  dead, and the rebuild is whole); [324](324-the-equipped-weapon-on-others-bodies.md) R324.9 (another console's player
  is re-placed by the same `FUN_00598b90`); [251](251-the-effective-action-life-model.md) R251.2 (`+0x374`, the stance
  request) and §12.1 (`Stand` is base kind 1); [326](326-the-throw-animations.md) §1.4 (`FUN_00588bc0` ->
  `FUN_0028dc90`, the push's snapshot and `BlendTime`); [322](322-the-hud-before-the-first-spawn.md) (the load and the
  first spawn's HUD: no pose read there); [303](303-original-victory-dances.md) (the dance; the room's offer).
  `FUN_005a5da0` (the death's and the knock's reset: research 230 §5, 251 §12.1, 313 §4) is **not** the spawn's reset:
  the spawn's is the rebuild (§1.2).

## The owner's item (NU.R4)

From the checklist's NU.R4 (the owner, 2026-10-15 ~01:00Z, from a local two-window playtest on `main` 0dd5aebc1),
the sentence verbatim: "when matches start just after the match end screen, players are doing a stand up animation
instead of already being ready."

The row (NU-12, verbatim): "**The stand-up at a match's start.** When the next match starts right after the match-end
screen, players play a stand-up animation instead of starting ready. Read the original's spawn pose and clip at a round's
start after the end screen (the idle entry, no transition from the previous pose; research 230's anim-set rows), room and
page on the same spawn."

## 0. Answers

| # | finding | the port | section |
|---|---|---|---|
| R328.1 | **The original rebuilds every body at a round's start, alive or dead, its own and the others' copies alike.** The round's reload runs `FUN_00598b90(actor, 0)` over every actor not marked `+0xfd1` (`FUN_00223680` D:L75920-75931), which online always calls `FUN_00599b60(actor, 0)` (D:L455070, D:L455158), the teardown and the initializer: `(*vtable+8)(actor, -1)` (D:L455659), `FUN_00553ea0` (D:L455663) -- a new animation stack (`FUN_0028edd0`, D:L419420) whose state word is set to 0, stand (`FUN_0028dfb0(stack, 0)`, D:L419566) | the room makes a new mover (`room.ts` `spawn`, `newSim`, L2727-2744); **the page keeps the body's `Play` and `Animator` across the spawn**, its own (`matchMount.ts:382`, `main.ts:391`) and the others' (`remotePlayers.ts`, kept by id) | §1.1, §1.2 |
| R328.2 | **The rebuilt body's first clip is `Stand`, with no blend from the last pose.** The initializer's set selection `FUN_0058c600(actor, 0)` (D:L419723) clears the stack's record at `+0x74` (`FUN_0028d940`, D:L447983, D:L134994-135017), pops every play (`FUN_0058a5e0(actor, 0, 1)`, D:L447984), pushes type 1 -- `Stand`, the set's `seal_stand` -- in state 0 (`FUN_00588bc0(actor, 1, 0, 0, 0)`, D:L447989), writes the stance request 0 (`+0x374`, D:L447992) and snapshots the stack (`FUN_0028e3e0`, D:L447993); then hands the top's nodes to `FUN_00577df0` and snapshots again (D:L448128-448133). **No blend runs**: the push sets the blend timer (actor `+0x178` / `+0x17c`, the stack's `+8` / `+0xc`) to the clip's `BlendTime` (D:L446292 -> D:L135218-135220), which `FUN_00576860` counts down (D:L436621-436635), and `FUN_0058c600` zeroes both words (D:L448130-448131); the 0.4 s second timer `+0x10d0` is zeroed by the initializer (D:L419725). *Was (d943bd428): "clears the stack's blend (`FUN_0028d940` ...) ... Any blend that runs is from `Stand` to `Stand`" -- the review's F1: `FUN_0028d940` clears the record at `+0x74`, not the timer.* No transition clip (no `seal_getupforward01`, no reversed `seal_stand2crouch` or `seal_stand2prone`) is pushed. The first frame's pose is `SPAWN_FIRST_POSE_READING` (§6) | the page's first frame after the spawn asks `idle:stand` of an animator still on the last pose, and `Animator.start` freezes the pose on screen and **cross-fades it into `seal_stand` over its `BlendTime`, 0.5 s, eased** (`animator.ts:745-775`, L986; the golden's row: `seal_stand` looped, playback 6, `BlendTime` 0.5) | §1.3, §2 |
| R328.3 | **Which "stand-up" the owner sees: no clip at all -- the port's spawn cross-fade.** A body that died in the round lies on its death clip's last key (`death_stand_*`, `death_crouch_*`, `death_prone_chest01`; `remotePlayers.ts` `deathPose`) until the spawn; at the spawn it is placed at its new slot and eased from that lying pose into `seal_stand` over 0.5 s: the body rises from the floor to standing at the spawn point, its root (`skel_root`) with it, and the own camera, which stands on the posed root (`walk.ts` `cameraTick` L1642-1647, `follow` L1690), rises with it in third person and first person. A body that ended crouched or prone eases from `seal_crouch` or `seal_prone` up to `seal_stand` the same way; a body that ended in the pistol's hand eases from the pistol's versions too (`Animator.setWeapon`, L838-846). Most visible on the dead: in classic every round ends with one side all dead | the original shows `seal_stand` from the first frame, the own body fading in from alpha 0 at 4 a second (D:L455690-455695) | §2 |
| R328.4 | **Nothing carries over from the end screen in the original**: no stance (the state word and the stance request are 0, D:L419566, D:L447992 -- *superseded at the spawn by §9 (R4P-R3, 2026-11-24): the rebuild then writes the request 1, crouch, D:L455673; was: "the stance request 0" as the spawn's last word; the port does not follow it, OT.R156*), no death pose, no dance, no clip on the stack, no blend (D:L447983) | **the stance and the death pose carry over as a 0.5 s blend** (above); **no victory dance carries over**: the room refuses the offer in the round-end interval (`room.ts:1225`, `phase === 'over'`) and the room's spawn stops one (`stopVictory`, L2728); a dance cut by the spawn blends out over the same 0.5 s | §1.5, §4 |
| R328.5 | **A round's start, a match's start and a respawn are one rebuild in the original**: the round's reload (`FUN_00598b90(p, 0)`, D:L75931), the next match after GAME COMPLETE (the same reload) and a respawn (`FUN_00598b90(actor, 1)`, research 91 §4.2) all run `FUN_00599b60` (D:L455158; the record pick differs, D:L455229-455241) | the room: one `spawn` for all three (`startRound`, L5302-5335; `respawn`). The page: the carry-over shows at **every spawn inside one mounted match** -- a classic match's rounds 2 on, a respawn game's every respawn and its next match (the room goes straight on, `room.ts:5010-5011`) -- and **not** at a classic game's next match from its lobby (ONL-20b returns the room to its lobby, L5010; the next launch mounts a fresh match, `frontEnd.ts` -> `mountMatch`, whose new `Play` draws its first play with no blend) | §3 |
| R328.6 | **The room already agrees** (*the stance clause: R4P-R3 (§9) made the room ask crouch at every spawn, `runSpawnFrame`; reverted on agent/next by 6de549133c under OT.R156, so the stance stand with no request holds again in the port*): a fresh mover stood on its floor with no action, no hold, no overlay, no dance, the ground idle, the stance stand (`Walker.place`, `mover.ts:2495-2516`; `newSim`, `room.ts:1985-1991`), every seat spawned with it at a round's start (`startRound`) -- what the snapshots send for a fresh seat is a standing idle body | no room change; pinned (T1) | §4.1 |
| R328.7 | **Another console's copy is placed, not slid**: the copy is rebuilt and placed at its record by the same `FUN_00598b90` on each console (D:L455070-455081 takes the owner's kit for a copy; the placement follows the rebuild, D:L455245-455324) | the others' feet are interpolated between the two snapshots around the view tick (`client.ts` `bodies`, L751-770), across the spawn too: for up to one snapshot interval (1/30 s) a respawned body is drawn on the line from where it lay or stood to its spawn point | §4.3 |

## 1. The original at a round's spawn

### 1.1 The round's reload and the respawn

- **The round's reload** (`FUN_00223680`, the MP exit state, states 3 and 5): for every actor of kind 2 in the actor
  list not marked `+0xfd1`, `FUN_00598b90(actor, 0)` (D:L75920-75931), then the turrets and the team scores (D:L75934-
  75935; research 91 §19). The list is every actor on the console, the copies of the other consoles' players included:
  `FUN_00598b90` itself takes a copy's owner's kit list when the actor's controller is not the console's own (D:L455072-
  455081, the controller's `+0x2c` answering 0; research 324 R324.9).
- **The respawn**: `FUN_00598b90(actor, 1)` from the actor's update when `+0xfcf` is set (`FUN_00547350`
  D:L412722-412726; research 91 §4.2, research 317 §1.5). `+0xfcf` has three writers (D:L410562, D:L432710,
  D:L451725); on another console the copy's is `FUN_00544210`'s (§6, `REMOTE_RESPAWN_REBUILD_READING`). *Was:
  "from the respawn press" -- the review's F2.* The two differ in the spawn record (keys 0/2 against 1/3, D:L455229-455241; research 91's table) and
  nothing else of the rebuild.
- **Online only**: the whole of `FUN_00598b90` sits under the online byte (`DAT_0045a0c1`, D:L455070-455339). The
  offline single-player's mission restart is not this path and is not read here.

### 1.2 The rebuild

`FUN_00598b90` saves the stats (D:L455083-455157), calls `FUN_00599b60(actor, 0)` (D:L455158) unconditionally inside
the online branch, writes the stats back (D:L455159-455227) and places the body at its record (D:L455245-455324).
`FUN_00599b60` (D:L455604-455711):

- saves the kit's two words (`FUN_005c4960`, `FUN_005c4890`, D:L455643-455644) and the body's matrix (D:L455645);
- runs the actor's teardown, `(*vtable+8)(actor, -1)` (D:L455659), makes the type's model (`FUN_0059a7f0`, D:L455661)
  and runs the initializer `FUN_00553ea0(actor, model, type)` (D:L455663) on the same memory;
- fills the kit (`FUN_00599f00`, D:L455674; research 323 §3) and puts the matrix back (D:L455679);
- for the console's own player online, not spectating: a new camera (`FUN_00299150`, D:L455694) and the body faded in
  from 0 at 4 a second (`FUN_00552780(1.0, 4.0, actor, 2)`, D:L455691-455695; research 91, research 317 §1.5); a
  spectator's is hidden (`FUN_00543d50`, D:L455698).

The initializer re-makes the body's animation state whole (D:L419402-419907): the stack constructed (`FUN_0028edd0`,
D:L419420), its state word 0 (`FUN_0028dfb0`, D:L419566, D:L135230-135235), the set word `+0x528` cleared
(`param_1[0x14a] = 0`, D:L419719), the hand word `+0xf79` 1 (the primary, D:L419661), the raise's envelope at rest
(the envelope at `seal+0x1160` cleared, `FUN_00286d70(param_1 + 0x458)` D:L419499; the state at `+0xf74` set down,
`param_1[0x3dd] = 2` D:L419662 -- `weaponRaise.ts`'s offsets. *Was: "`FUN_005dffc0`, D:L419710 -> D:L494283-494286"*
-- the build review's note: that call sets the envelope's times only, not its state; *then: "D:L419534-419537;
`FUN_00598280`"* -- the re-review's N2: those lines write `+0xed0`-`+0xee0`, the action offer's state, and
`FUN_00598280` is the controller's constructor, off the rebuild's path), the model bound from `skel_root` (D:L419599-419660).

### 1.3 The first clip on the stack

`FUN_0058c600(actor, 0)` (D:L419723; D:L448073-448150) finds the character's anim set (`+0x540` -> `+0x2d0`,
D:L448114-448119) and calls `FUN_0058c350(actor, set, 1, 0, 0)` (D:L448124). The set differs from the cleared
`+0x528` (D:L447965), so `FUN_0058c350` (D:L447957-447996):

1. clears the stack's record at `+0x74` (`FUN_0028d940`, D:L447983: zeroed and detached, D:L134994-135017) -- not the
   blend timer (§1.3 below). *Was: "clears the stack's blend record" -- the review's F1.*
2. pops every play (`FUN_0058a5e0(actor, 0, 1)`, D:L447984: pops while more than none remain, D:L446796-446798) --
   on a new stack, nothing;
3. writes the set (D:L447985-447986) and pushes **type 1 in state 0** (`FUN_00588bc0(actor, 1, 0, 0, 0)`, D:L447989):
   `Stand` (base kind 1, research 251 §12.1), the Seal set's `seal_stand` (the port's `SEAL_ANIM_SET.stand`,
   `locomotion.ts:42`; research 230 §5's set rows) -- the rifle's, the hand word being the primary's;
4. sets a field of the top play's node to 1.0 (`FUN_0028c1f0`, D:L447991, D:L134125-134133: `+8` of the node record;
   which field is not read);
5. writes the stance request `+0x374` = 0, stand (D:L447992; research 251 R251.2);
6. snapshots the stack (`FUN_0028e3e0`, D:L447993: each node's live translation and rotation copied into its snapshot
   slots, D:L135389-135412).

Back in `FUN_0058c600` with `param_2` 0 (D:L448127-448134): the top play's node set is handed to `FUN_00577df0`
(D:L448128-448132; D:L437381-437392 -> `FUN_005777d0`, `FUN_00577700`), and the stack is snapshot again
(`FUN_0028e3e0`, D:L448133). The push's own snapshot blend is cancelled before any frame: `FUN_0028dc90` (reached from
`FUN_00588bc0` at D:L446292) set the blend timer -- actor `+0x178` and `+0x17c`, the stack's `+8` and `+0xc` -- to the
clip's `BlendTime` (D:L135218-135220; research 326 §1.4), and `FUN_00576860` blends only while `+0x178` is above 0,
counting it down (D:L436621-436635); `FUN_0058c600` zeroes both words (D:L448130-448131), and the initializer zeroed
the 0.4 s second timer `+0x10d0` (D:L419725). **No blend runs: the first frame draws `Stand` alone**, and nothing of
the last round's pose can reach it (the nodes are the new model's besides, D:L455661, D:L419599-419660).
*Was (d943bd428): "The push's own snapshot blend ... therefore starts from what the nodes hold after that call.
Inference: that `FUN_00577df0` evaluates the stack into the nodes ..., so ... any blend is `Stand` into `Stand` ...
`FUN_005777d0` was not read whole; that step is `SPAWN_FIRST_POSE_READING`" -- the review's F1: the timer is zeroed,
a direct reading; no inference is needed.*

### 1.4 What the first frames draw

`seal_stand` (the golden: looped, playback 6 s, `BlendTime` 0.5, `cold_breath@0.1`), from its first key (a new push's
phase), at the record, in the type's model, the rifle in the hand, the stance stand; the own body fading in over 0.25 s;
the camera new. The controller's first update finds the stance request 0 against the state word 0: no stance change is
asked (research 251 R251.2's request is the stand).

### 1.5 What does not carry over

| state at the end screen | the original at the next round's first frame | cite |
|---|---|---|
| dead, on the death clip's last key | `seal_stand` at the record, no blend | §1.2-§1.3 |
| crouched (`seal_crouch` or its alerts) or prone (`seal_prone`) | `seal_stand`: state word 0, stance request 0 | D:L419566, D:L447989, D:L447992 |
| a victory dance, a reload, a throw, a flinch, any one-shot on the stack | gone: the stack is new and popped | D:L419420, D:L447984 |
| a blend running | none: the timer zeroed (*was: "cleared", D:L447983 -- the record at `+0x74`, the review's F1*) | D:L448130-448131, D:L419725 |
| the pistol in the hand | the primary (hand word 1) | D:L419661 |
| the rifle raised | the envelope at rest | D:L419499 (`+0x1160` cleared), D:L419662 (`+0xf74` = 2, down) (*was: D:L419710, `FUN_005dffc0`: its times only; then D:L419534-419537, `FUN_00598280`: the action offer and the controller, N2*) |
| the binoculars up | *inference*: the initializer's flags cleared with the rest (the binocular state's word not traced here) | D:L419402-419907 |

## 2. Which "stand-up" the owner sees

**No stand-up clip is played anywhere on the spawn path.** The port's mover is new at the spawn and stands idle with no
action (`walk.ts` `respawn` L1042-1074: `new Walker`, `place`, `stance_ = 'stand'`; `Walker.place` clears the action,
the hold, the overlay, the dance and the ground state, `mover.ts:2495-2516`), so no `getUp`, no reversed stance
transition and no landing is asked. What the owner sees is the animator's cross-fade at the spawn:

- **The body's `Play` outlives the spawn.** The page's own is made once per mounted match (`matchMount.ts:382`;
  `main.ts:391` for the map viewer's match) and rebuilt only with a new body (`Play.setBody`, `play.ts:259`, a map, a
  side or a type); the others' are kept by id (`remotePlayers.ts` `add`, L934-935, L975-976). Nothing on the spawn path
  resets the animator: the own spawn clears the death pose (`netPage.ts:1400`, `walk.setDeathPose(null)`) and re-makes
  the kit (`matchNet.ts:182` -> `matchFirearm.ts` `spawnKit`, which calls `play.setItem('rifle')`); the others' clear
  the death clip on the first alive snapshot (`remotePlayers.ts:729-738`).
- **The play changes on the first frame after the spawn**: from the death's traversal play (`trav:<death clip>`, the
  clip held on its last key, `walk.ts:1370`, `remotePlayers.ts:754`), the crouch idle (`idle:crouch`), the prone idle
  (`idle:prone`) or a locomotion play, to `idle:stand` (`Animator.wanted`, `animator.ts:680-725`).
- **`Animator.start` freezes the pose on screen and cross-fades** (`animator.ts:745-775`): `this.from` the frozen pose
  (L767; `freeze`, L1136-1139: every part's local, the root's translation included), the blend's length the new main
  motion's `BlendTime` (L769) -- `seal_stand`'s **0.5 s** -- weighed by the ease `blendWeight` (L252-256, L986: 2s^2 to
  the middle, its mirror after). So for half a second the body is drawn between its corpse (or its crouch or prone
  idle) and `seal_stand`, at its new spawn point.
- **The root rises with it, and the own camera on it.** The root's height over the feet is the blended pose's
  (`Animator.rootY`, L1163-1166); `Play.frame` hands it to the walk each frame (`play.ts:521`), whose third-person camera
  stands its target on it (`walk.ts` `cameraTick`, L1642-1647, called by `restart` at the respawn itself with the last
  posed root still set) and whose first-person eye is set from it (`follow`, L1690). So on the owner's own screen the
  view rises from the corpse's root height to standing over the same half second. *Inference*: the camera's own
  smoothing over the posed root (`PlayerCamera.tick`'s last argument) is not read here.
- **The pistol's hand adds a second freeze**: a body that died with the sidearm in the hand is re-kitted to the rifle
  (`spawnKit` -> `play.setItem('rifle')` -> `Animator.setWeapon`, `animator.ts:838-846`), which freezes the pose and
  cross-fades over the playing motion's `BlendTime`; the play's change on the next frame freezes again (`start`).

Which clip the owner sees is therefore **the frozen last pose of the round eased into `seal_stand`**: for a body that
died, its death clip's last key (`death_stand_head01`-`04`, `death_stand_chest01`-`03`, `death_stand_groin01`/`02`,
`death_stand_larm01`/`02`, `death_stand_rarm01`, `death_crouch_*`, `death_prone_chest01`; `net/deaths.ts` L18-29),
lying; for a survivor who ended low, `seal_crouch` (or its alerts, the crouch's three idles) or `seal_prone`. The lying
case reads as a get-up: the body lifts from the floor to standing in 0.5 s. Classic rounds end with one side all dead
(the elimination), so at every classic round's start half the bodies or more do it; a respawn game's dead at the clock do
it at the next match, and every respawned player does it at his respawn point.

**Which case the owner saw** (the review's F5): a classic game's round 2 onward is at least as likely as a respawn
game's next match. The same NU.R4 message reports a ghost spawn, which is classic play, and in a two-window 1v1
classic every round ends with a corpse that rises at the next round. A classic game's next match is excluded: ONL-20b
is in 0dd5aebc1, so it is a fresh mount (§3). B1 and B2 cover both cases.

## 3. Round start against match start; online against offline

| case | the original | the room | the page |
|---|---|---|---|
| the next round of a classic match | the round's reload: every body rebuilt (§1.1) | `endRound` -> `startRound(false)` -> `spawn(p, 'start')` for every seat (L5302-5335, L5011) | the same mounted match: **the carry-over** (§2) |
| the next match after GAME COMPLETE, a respawn game | the same reload (D:L75920-75931) | `startRound(true)` (L5011: a respawn room goes on, ONL-20b) | the same mounted match: **the carry-over** |
| the next match after GAME COMPLETE, a classic game launched from its lobby | the return to the game's lobby and a new launch (`MATCH_END_RETURN_READING`, `lobbyMatch.ts:85-90`): a new level, new actors (not read past research 309) | `returnToLobby` (L5010) | a fresh mount (`LobbyMatch.matchOver` releases the client, `lobbyMatch.ts:459-468`; the next launch's `mountMatch`, `frontEnd.ts` `start`): a new `Play`, whose first play starts with no frozen pose (`start`'s `prev` null, L761): **no carry-over** |
| a classic room with no game lobby (`/testroom`, the maps' rooms) | -- | `startRound(true)` (L5011) | the same mount: **the carry-over** |
| a respawn mid-match | `FUN_00598b90(actor, 1)`: the same rebuild on the owner's console (§1.1); on the other consoles the copy's state field -> `+0xfcf` -> `FUN_00547350` -> `FUN_00598b90(copy, 1)`, one inference
(`REMOTE_RESPAWN_REBUILD_READING`, §6; *was: "not read"*, the review's F2) | `spawn(p, 'respawn')` | the same mount: **the carry-over** (the own corpse hidden past `BODY_FADE_S` in a respawn game, PAR-91, but still the animator's pose; the others' corpses lie until alive, NU-4) |
| the first round of a launch | the level's actors made for the round | `firstRound` -> `startRound(true)` | a fresh mount: no carry-over |
| offline | `FUN_00598b90` does nothing offline (D:L455070) | the solo match is the same room over the loopback (`SOLO_IS_NETWORK_READING`) | the same as online |

So "match start" and "round start" are one mechanism on both sides; the owner's case is the first row or the second
(§2, the review's F5): a round or a match that starts in the page that showed the end screen. *Was: "the second row
(or, read loosely, the first)".*

## 4. The port against the read

The port's tree is `a434f180a`. Rows marked "--" agree.

### 4.1 The room

| # | the original | the room | difference |
|---|---|---|---|
| -- | every body rebuilt at the round's reload, alive or dead, at a round-start record (§1.1) | `startRound` spawns every seat (L5321-5323); `spawn` makes a new mover (`newSim`, L1985-1991) | none |
| -- | the new body stands, no stance request, nothing on the stack (§1.3) | `Walker.place`: the ground idle, no action, hold, overlay or dance; the stance stand (`mover.ts:1557`, L1567, L2495-2516) -- the body's first snapshot is a standing idle | none |
| -- | no dance survives the rebuild | `spawn` stops one (L2728-2729); the offer is refused in the interval (L1225) | none |

### 4.2 The page: the own body

| # | the original | the page | difference |
|---|---|---|---|
| D1 | `seal_stand` from the first frame, no blend from the last pose (§1.3-§1.4) | the animator kept: the last pose frozen and eased into `seal_stand` over 0.5 s (§2) | **the body rises from its corpse (or its crouch or prone idle) to standing over 0.5 s at the spawn point** -- the owner's stand-up |
| D2 | the camera new, on the rebuilt body's posed root (`FUN_00299150`, D:L455694) | the camera's target and the first-person eye ride the blended root (`walk.ts` L1642-1647, L1690) | **the view rises from the floor with the body** (part of D1: the same blend) |
| D3 | the stance request and every one-shot cleared; the hand the primary's; the raise at rest (§1.5) | the mover new (agrees); the hand re-kitted to the rifle with a second freeze (`setWeapon`); the raise (`WeaponRaise`) and the reload and throw layers reset only with a new body (`Play.setBody` L271-273) | the extra freeze (part of D1); the raise's carried countdown runs out in the end screens' seconds in practice (the 5 s countdown in real time against the interval's screens, about 29 s, research 91 §2.4), not seen |
| D4 | the body faded in from 0 at 4 a second (D:L455691-455695) | drawn whole at once: the material has no opacity (`BODY_FADE_PLACEHOLDER`, research 317 §1.8) | **no 0.25 s fade-in** -- a neighbour; waits on the material |

### 4.3 The page: the others' bodies

| # | the original | the page | difference |
|---|---|---|---|
| D5 | each copy rebuilt at the round's reload with the rest (§1.1): `seal_stand`, no blend | the copy's `Play` kept by id; its death clip dropped on the first alive snapshot (`remotePlayers.ts:738`) and its play changed to `idle:stand` with the same 0.5 s freeze (`r.play.frame`, L792) -- a survivor's crouch or prone too, with no dead-to-alive change at all | **the others rise from their corpses over 0.5 s at their spawn points**, the same as D1 |
| D6 | the copy placed at its record after the rebuild (D:L455245-455324) | the feet lerped between the snapshots around the view tick (`client.ts:751-770`) across the spawn | **a respawned body is drawn on the line from where it lay or stood to its spawn for up to 1/30 s** (low) |
| -- | a copy's respawn mid-match: rebuilt (`REMOTE_RESPAWN_REBUILD_READING`, one inference; *was: "not read"*, the review's F2) | as D5 at the dead-to-alive change | as D5 |

## 5. The build list

Each row is RED first, on the simulation track. The room changes in none (§4.1); "room and page on the same spawn" is
the page meeting the room's spawn: the own body at its `spawn` event (the walk's `respawn`, the same moment the room's
mover is made), the others' at the first snapshot that draws their spawn.

- **B1 -- the own body starts its new life on `Stand` (D1, D2, D3; page).** At the own spawn (`NetPage`'s `spawn` for
  the page's id, `netPage.ts:1398-1401`, beside `walk.setDeathPose(null)`), the body's `Play` drops its animation state as
  the rebuild does: the animator's play, its frozen pose and its blend cleared, so the next `Animator.step` starts
  `idle:stand` with no `from` (`start`'s `prev` null) -- `seal_stand` at phase 0, weight 1 from the first frame; the hand
  set to the rifle before that frame so `setWeapon` freezes nothing; the walk's posed root dropped (`setPosedRoot(null)`)
  so `restart`'s camera stands on the stance's root until the first posed frame; the raise, the reload and the throw
  layers reset as `setBody` resets them (L271-273). The original's first-frame pose is `SPAWN_FIRST_POSE_READING`'s
  (`'stand at once'`).
  - *RED, pinning the original's behaviour* (`play.test.ts`, with a stand-in walk): a body dead on `death_stand_head01`
    at its last key, then a spawn -> on the next frame `animStats()` gives the clip `seal_stand`, `from` null, blend 1,
    and `rootY()` equals `seal_stand`'s root at key 0 (today: `from` `death_stand_head01`, blend 0 on that frame -- the
    frozen corpse whole, `start` advancing no blend on its own frame -- and about 0.002 on the next at 60 Hz, the root
    near the floor); the same from `seal_crouch` (a survivor crouched at the end) and from `seal_prone`
    (today: the 0.5 s ease); the same with the pistol in the hand at the death (today: two freezes); the walk's posed
    root at the spawn's `restart` is not the corpse's.
- **B2 -- the others' bodies start theirs on `Stand` (D5, D6; page).** `RemotePlayers` resets a body's `Play` as B1 at
  its spawn: (a) the first snapshot that has it alive after a dead one (a respawn: `wasDead`, L729), and (b) the first
  snapshot at or past the round's start tick (`roundStart.startTick`, protocol 10: every seat is spawned in that tick,
  survivors included, `room.ts:5321-5325`); and `NetClient.bodies` does not lerp a body's feet across either mark (the
  newer snapshot's feet). No wire change is needed: (b) is the round's tick the page already has.
  - *RED* (`remotePlayers.test.ts`, `netClient.test.ts`): a copy dead on `death_stand_chest01` at its last key, then an
    alive snapshot at a new place -> its `Play` draws `seal_stand` with `from` null (today: the 0.5 s ease); a copy
    prone and alive at the end, then a snapshot past `startTick` standing at its slot -> `seal_stand`, no `from` (today:
    the ease from `seal_prone`); `bodies()` at a view tick between a snapshot with the body at A and the next with it
    spawned at B gives B (today: the lerp).
  - *Built (2026-10-15), the build brief's F3:* keyed on the room's `spawn` event for every seat (`room.ts` `spawn`,
    broadcast for each), counted by the net client on the bodies it draws at the view tick (`SpawnedBodyState.spawns`),
    so a living seat re-placed by `abandon` or `rebuildWaiting` is caught too; (a) kept where no spawn is counted
    (`REMOTE_RESPAWN_REBUILD_READING`); (b) `startTick` not used. The copy's binoculars layer is stopped with it (F4).
    The client's count and the feet's skip across the spawn: built once cleared (the header's Build line; *was: "the
    held hunk"*).
- **T1 -- the room's spawn pinned (no behaviour change).** `room.test.ts` (or a `roomSpawnPose.test.ts`): a classic
  room's next round and a respawn room's next match after GAME COMPLETE, with one seat dead, one prone, one crouched and
  one standing at the end -> every body's first snapshot after `roundStart` is alive, stance stand, no action, no hold,
  no traversal, the ground idle; a victory request in the interval is refused (`'unsupported-state'`). A fresh mount's
  first frame draws `seal_stand` with no `from` (pinned beside B1).
- **Not built here -- B4, the own body's fade-in (D4).** `FUN_00552780(1.0, 4.0, actor, 2)` at the rebuild
  (D:L455691-455695): 0 to 1 at 4 a second, the own body online, not spectating. It waits on the skinned material's
  opacity (`BODY_FADE_PLACEHOLDER`'s owner, research 317); when that lands, the spawn's fade is the same layer run
  upward.

## 6. Readings and placeholders (candidates for the build)

| name | where it would go | status |
|---|---|---|
| `SPAWN_FIRST_POSE_READING` (*note only*; built as the reset, no constant -- was: "candidate, B1") | viewer `play.ts` (`Play.respawn`, whose doc names it; `walk.ts` `spawns`), `remotePlayers.ts` (B2) | `'stand at once'`: built 2026-10-15 (NU-12 B1, B2) as the reset itself, no value standing in; the rebuilt body's first frame is `seal_stand` with no blend (the stack new, D:L419420; `Stand` pushed in state 0, D:L447989; the push's blend timer `+0x178` / `+0x17c` zeroed, D:L448130-448131, the second timer `+0x10d0` zeroed, D:L419725; `FUN_00576860` blends only while `+0x178` is above 0, D:L436621-436635) -- a direct reading; *was: "its blend cleared, D:L447983 ... the one unread step is that `FUN_00577df0` -> `FUN_005777d0` evaluates the stack into the nodes ... (else the push's 0.5 s blend would start from the new model's bind pose ...)"* (the review's F1); proven by capture NU12-1 |
| `SPAWN_CROUCH_UPDATE_READING` (*note only*: a named reading of the original, not in the port's code, OT.R156) | none (was: viewer `spawnCrouch.ts`, `runSpawnFrame`, R4P-R3; reverted on agent/next by 6de549133c) | *note only* -- named, unused (OT.R156: the port spawns standing). The original's value `'first'` (reading, pending review; §9); R4P-R3 built it 2026-11-24 and the build was reverted. The reading: the spawn's crouch request is taken in the first update after the placement, R4P-R3's seed frame -- a whole game frame (`Walker.runSeedFrame`: two or three 60 Hz ticks of the clip's root, applied at the frame's end), where PC2 shows one 1/60 s step on the first placed row (the fresh review's F4) -- the rebuild's store precedes every update (r0004 0x59f858; `FUN_00599b60` D:L455673) and the request is asked in the actor's update (r0004 0x557f20; `FUN_00552d60` D:L418865) -- in one arm only, skipped at posture 8, a `+0x1061` flag, online with `+0xfcf` (dead-to-alive) set (D:L418511-418513) or the top play's `+0x2b` at 8 (D:L418607-418609); `+0xfcf` a possible cause of MP64's one standing update (inferred), `'first'` still holds (the second read, §9.3); MP64's round start and SPAWNDRIFT-PC2's round restarts agree (unscored); MP64's respawn shows one update standing first (`'second'`). Settles: a scored r0004 capture with `+0x374` and `+0x534` per update (§9.4) |
| `REMOTE_RESPAWN_REBUILD_READING` (was: "*note only*; candidate, B2") | viewer `remotePlayers.ts` (`RemotePlayers.frame`: B2's case (a), beside the seat's `spawn`) | `'rebuilt'`: built 2026-10-15 (NU-12 B2; reading, pending review): the page rebuilds the copy's animation (`Play.respawn`) and stops its binoculars at its seat's `spawn`, and at a dead-to-alive change where none is counted; another console rebuilds a copy at its owner's respawn mid-match: a player record's state field (`FUN_002be150` D:L162349-162350) -> `FUN_00544210` (D:L410551-410563) sets `+0xfcf` on a dead (2 or 3) to alive (1) change when the controller's `+0x34` answers true -> `FUN_00547350` (D:L412722-412726) -> `FUN_00598b90(copy, 1)`; the round's reload is read for every actor on every console (D:L75920-75931, D:L455072-455081). The one inference: `+0x34`'s meaning (the copy's controller), and `FUN_00547350` as the actor's per-frame update reached through the vtable; *was: "the respawn's network path is not [read]; built as the round's until read"* (the review's F2); settles: `+0x34` read, or capture NU12-2 |

Found by the build's review (2026-10-15), one line each:
- F2, *built* (was a known deviation): a copy's flinch and its hands' (throw) layer are dropped at its seat's spawn with
  the rest (`RemotePlayers.frame`; the new stack D:L419420, the pops D:L447984); before, they ran on over the new body
  for under a second, seen only for a living seat re-placed by `abandon` or `rebuildWaiting`. The own body's throw still
  fades rather than vanishing (`matchThrow.ts` `holdOn`, not this build's file): a known deviation.
- F3, a known deviation of an instrument: the lag injector (`?lag=`, `net/client.ts` `delayed`) delays each message on
  its own, so a `spawn` can come after its first snapshot -- the body slides one interval and its copy is rebuilt a
  snapshot late (a corpse's twice: the dead-to-alive change, then the count); real sockets keep the order
  (`roomSpawnOrder.test.ts`).

Readings the code holds that this note leans on, unchanged: `SOLO_IS_NETWORK_READING`, `MATCH_END_RETURN_READING`,
`OWN_BODY_FADE_READING`.

## 7. The captures

The original running, 60 fps video, two consoles, third person on both:

- **NU12-1**: a classic online round won by elimination with, at its end, one player dead, one prone, one crouched and
  one standing; the next round's first second on both consoles; then a respawn game's GAME COMPLETE and the next match's
  first second. Settles the first-frame pose (no blend, the 0.25 s fade-in on the own console) and proves R328.2.
- **NU12-2**: a respawn game, a player dying and respawning, filmed on his console and another. Settles the copy's
  rebuild at a respawn and the copy's placement (D6).

## 8. Evidence, apart

- Source inspection: the decompilation (the lines cited, the file's hash in the header) and one ELF string; the
  committed golden read as JSON; the port's source read. No capture, no browser run, no unit test run, no dev-disc test
  run, no reader run, no node process. Nothing here is proven.
- What a reviewer should re-read first: §1.3 (the push of type 1 in state 0 and the two snapshots, D:L447983-447993,
  D:L448124-448133), §1.1 (the reload's loop over every actor and the online gate, D:L75920-75931, D:L455070-455158),
  and §2's claim that nothing on the page's spawn path resets the animator (`netPage.ts:1398-1406`, `matchNet.ts:182`,
  `remotePlayers.ts:717-806`, `animator.ts:745-775`).

## 9. The spawn crouch (R4P-R3; LATER 1402 / ATLAS L205; 2026-11-24)

**DIVERGENCE (OT.R156, the owner, 2026-11-25).** The port places a spawned body standing and does not play the spawn's
crouch: an intentional divergence, the owner's rule, never "as the original does". This section records the original;
the port's code does not implement it (R4P-R3, which built it, is reverted on agent/next by 6de549133c, with its test
folds). `SPAWN_CROUCH_UPDATE_READING` stays a named reading of the original (§6, *note only*), not in the port's code.
Where this section says "the port" does something with the crouch, it is R4P-R3's build, historical: R4P-R3 did it;
reverted.

- Status: **reading, pending review.** Built on a fresh non-author read for seat-walls (Fable, key job 1402, 2026-11-24,
  "spawn drift", agent-mail `planning/mega-2026-11-21/pilot/kill/keyjob-1402-spawndrift.md`; read-only, itself a second
  read of ATLAS's) -- one reader of the store, two with ATLAS's. This note's author wrote none of it; the build cites it
  and adds no reading of its own. Nothing here is proven: no capture in it is scored by the harness.
- Second read (patches-contrib, non-author, 2026-11-24; agent-mail
  `planning/mega-2026-11-21/pilot/movement/r4pr3-spawn.second-read.md`). UPHELD: the unconditional store of `+0x374` = 1
  after the constructor's 0 (r0001 D:L419436 then D:L455673; r0004 constructor store 0x5592b8, rebuild store 0x59f858 /
  D4:L496691, the 1 set at 0x59f844 and stored in a delay slot); the same reach in both builds (the round's reload calls
  the rebuild, D:L455158 / D4:L496177, gated only on online; the rebuild and its direct callees write `+0x374` no
  more, one level deep); the clip pick of §9.1 (row 18, then motion 2 if v^2 > 400, 0x14 if > 100, else 0x11;
  D:L442491-442513, r0004 0x586e48-0x586f30). CORRECTED: deep water (§9.4). PARTLY: "asked every update" (§9.3),
  "always the 0x11 band" (§9.1), the refusal list (§9.4) -- each folded where it stands.

### 9.1 The reading

| what | source | level |
|---|---|---|
| the respawn rebuild writes the stance request `+0x374` = 1 (crouch), unconditionally, after the constructor's 0 | r0004 0x59f660, the store at 0x59f858 (the constructor 0x5591c0 writes 0 at 0x5592b8 first); r0001 `FUN_00599b60` D:L455673, the constructor's 0 `FUN_00553ea0` D:L419436 (called at D:L455663) | reading, pending review |
| the request, on a still standing body, starts motion 0x11 `seal_stand2crouch` forward (state 1); the squared 3D velocity (`+0x2c..+0x34`) over 400 picks motion 2, over 100 motion 0x14 | r0004 0x557f20 (reads `+0x374` at 0x557f2c / 0x557f40; r0001 `FUN_00552d60` D:L418865) -> its gate 0x558080 (r0001 `FUN_00552ec0` D:L418914) -> 0x586f90 (called at 0x557fb8; "may crouch" true) -> 0x586d80 (called at 0x5871e8) = r0001 `FUN_005817d0` D:L442479, the stand -> crouch pick: row 18 pushed (0x586e48), over 400 motion 2 (0x586e54-0x586e94), over 100 motion 0x14 (0x586ec8-0x586ef0), else 0x11 forward at 0x586f24 (0x586f20-0x586f30); r0001 the same three bands, D:L442497-442513. *Was (50a3e60215): "-> 0x587210 ... 0x11 at 0x5872c8; motion 2 on a moving one" -- the fresh review's F1: 0x587210 (r0001 `FUN_00581c10` D:L442605) is the crouch -> stand pick, the arm 0x586f90 takes when it may NOT crouch.* A placed body is still at its first update (`Walker.reset` zeroes the velocity; R4P-R3 took the request in the seed frame, run still -- reverted), so the spawn takes the 0x11 band -- "always" is inferred: it holds only with zero velocity at placement, which is unread for the original (§9.4, TeleportTo; the second read's PARTLY, 2026-11-24); the other two bands would matter only to a request taken on a moving body -- the port's no-clip rule above `STANCE_MOVING` is older than this task, a LATER row of its own | reading, pending review (the consumer path re-read at r0004 by the fresh reviewer, 2026-11-24) |
| the ~1.7 u spawn drift is that clip's root motion, in the facing frame; the body stays crouched with no input | SPAWNDRIFT-PC2 (13 placements, four maps) and the MP64 spawn record (`docs/atlas/captures/mp64-spawn-r0004.md`): net 1.63-1.72 u, +0.60 s, the clip's step series; posture 1 to the end of every window (up to 42.4 s) | observation of the original, **unscored** |
| `seal_stand2crouch`: 27 keys, playback 0.65, one-shot; root net (-1.195, +1.270) x/z, 1.744 | `MOTION_P.ZAR` / `motion.rdr` through `clipsFromPack` (the read's own run; ATLAS's `docs/atlas/readings/root-motion-settle-and-turn.md` counts the same) | reading (the disc through the readers) |

So R328.4's "the stance request 0" is the constructor's word, and the rebuild's last word is crouch: a spawned body is
**placed standing with crouch requested**; R4P-R3 played the port's own transition (`ACTION_CLIPS.standToCrouch`, travel
(-1.2, 1.27)) from the placement (reverted, OT.R156). A body spawned already crouched would rest 1.7 u wrong (the read's §5).

### 9.2 What R4P-R3 built (historical: reverted on agent/next by 6de549133c, OT.R156)

*Kept as the record of the reverted build; none of it is in the port's code. The present tense below is R4P-R3's.*

- viewer `src/spawnCrouch.ts`: `runSpawnFrame(w)` stands the body (the constructor's state word 0, r0001 `FUN_00553ea0`
  -> D:L419566; r0004 0x5591c0 -- a walker re-seeded crouched or prone keeps its stance word through `Walker.reset`, so
  the dev teleport's room body is stood here as a new walker is: the fold's F3b), writes the request through the stance
  request path (`Walker.requestStance('crouch')`, `actor+0x374`) and runs the seed frame (`Walker.runSeedFrame`), in the
  order `SPAWN_CROUCH_UPDATE_READING` names. `mover.ts` is not changed: its `retryStance` already asks a pending request
  each tick and `applyStance` already refuses the transition clip to a body moving over `STANCE_MOVING` (an older port
  rule than this task; the original's bands are 0x586d80's, §9.1).
- `Room.spawn` (match `room.ts`): every spawn path -- a record's seed, an explicit placement (the rule spawner's
  respawns, `rebuildWaiting`), a round's start, a respawn, a seat back from a hold -- ends on `runSpawnFrame` (the
  rebuild's store is unconditional); an explicit placement is not seeded, so its request is taken on the body's first
  tick (held by `spawnPageRoomAgree`, "the walls' P1", and `respawnSpawn`'s explicit-placement case). `WalkMode.respawn`
  (viewer `walk.ts`): the seeded re-run and the adopted body alike, the frame run AFTER the moves are on the body
  (`attachMoves`), as the room's (`Room.newSim` attaches its Traversal before `spawn`): the fold's F3c, so a crouch the
  water turns to stand (`stanceFor`, over 8.5 deep) plays no clip on either side. The dev teleport (viewer `main.ts`)
  seeds the room's body the same way, so the page and the room carry one body.
- A resume (OT.R59, a labelled adaptation; `WalkMode.resume`): the fold's F3a. A seat back alive from a hold
  (NET-RES.R11 b) is told `spawn` and then `resume` in one room step, while the room's body plays the spawn's
  Stand -> Crouch from its seed frame; the page's respawn re-ran that frame to the same point and posture, so the resume
  KEEPS that body, clip and all (was: re-placed with no clip, 1.7 u from the room's until the reconciliation). Any other
  resume -- a reload's (a page with no body), a takeover inside the window -- stands the room's told posture at once, as
  before: a clip running on the room's body there is not carried (the resume event carries no action; named, not built).
- Not changed: the free walk's `stand` (no match spawn; the page's own drop), the bots' controller (the room's spawn is
  every seat's, the bots' included; every placement captured so far is the local player's), the dead-at-load entry
  (`enterDeadAtLoad`: a `place`, no spawn, no frame and no request -- a dead actor runs no update).
- Not read -- the waiting room (the fresh review's F6): `rebuildWaiting` (a port ruling, 2026-10-01, not the original's
  code) rebuilds a living waiting body through `Room.spawn` at each ARMORY change, so the body re-asks the crouch and
  travels the clip's 1.7 u each time. Whether the original rebuilds a waiting body at an ARMORY close through 0x59f660
  (and so re-asks the stance) is not in the read: named here, built as the spawn's until read. Bots: a bot wanting
  stand presses it on its first command, its stance word goes to stand with no new clip and the running clip still
  holds it about 0.6 s and 1.7 u (a bot's clip is not cut by the stick) -- every bot leaves its spawn 0.6 s later than
  before; both are what the reading gives, for the owner's Log.

### 9.3 The starting update -- `SPAWN_CROUCH_UPDATE_READING` = `'first'`

The records disagree by up to one update (the read's §3.4): MP64's round start has posture 1 and action 17 in the first
update; PC2's round restarts show the first placed row already a 1/60 s step into the clip, posture 1; MP64's respawn
holds one update standing (posture 0, action 1) before 17. **Chosen: `'first'`** -- the code's order (the store is in
the rebuild, before any update, and `FUN_00552d60` asks the request in the actor's update) and two of the three records.
"Every update" is partly so (the second read, 2026-11-24; reading, pending review): the request is asked in one arm of
the update only -- skipped at posture 8, with a `+0x1061` flag set, or online with `+0xfcf` set (D:L418511-418513), and
when the top play's `+0x2b` is 8 (D:L418607-418609); r0004 the same, on its online byte. `+0xfcf` is the dead-to-alive
flag (§6, `REMOTE_RESPAWN_REBUILD_READING`), a possible cause of the one standing update MP64's respawn record shows
(inferred; where it is cleared is not traced). None of this overturns `'first'` (the second read's word); the respawn's
lag stays the named alternative. The respawn record's lag may be its own placement order (the update's
gate on a state byte, not read); until scored it is `'second'`, one constant away. It moves which frame the body first moves on, not where it rests. R4P-R3's "first update"
was its seed frame (reverted), a whole game frame of two or three 60 Hz ticks whose root lands at the frame's end -- so the spawn
told carries 0.05-0.3 u of the clip's root off the record, where PC2's first placed row shows one 1/60 s step.

### 9.4 What would settle it, and what is not read

- Proven needs one scored capture of r0004 with, per update, the actor's xz, yaw, `+0x174`, `+0x374` and `+0x534` across a
  round start, a respawn after a death and a round restart on a dry map (to settle the original's reading; the port spawns standing, OT.R156). Two more
  rows: a respawn with the stick held (0x586d80's velocity bands, §9.1) and a bot's or a remote player's spawn.
- The refusals of 0x558080 from posture 0 (the fresh reviewer's r0004 re-read, 2026-11-24; reading, pending review):
  a top play neither looped (flag 0x40) nor a transition (0x5580a0-0x5580bc), refused but in posture 3; 0x57f0f0 true;
  posture 7; action 25 on (0x55827c); the obstacle test 0x552410 (0x5582b0-0x558330); a non-remote controller with "may
  crouch" false (0x558390-0x5583a0). No stick test and no airborne test on the path. *Added by the second read
  (patches-contrib, 2026-11-24; reading, pending review):* in r0004 the obstacle test does not only refuse -- if 0x552410
  fires while the `+0x1160` timer is 0, the request is OVERWRITTEN with the current posture, dropping the crouch
  (0x558338-0x558364, D4:L457707-457714); r0001 only refuses and keeps it (D:L418964-418967). Whether the test can fire
  at a spawn is unread.
- Deep water (*corrected* by the second read, 2026-11-24; reading, pending review). In water over 8.5 deep, 0x558080
  online DROPS the crouch: 0x45d481 is r0004's is-online byte (the twin of r0001's `DAT_0045a0c1`), and online r0004
  resets `+0x374` to the current posture and returns 1 when that posture is 0 or 2, standing or prone
  (0x5583a8-0x5583d8, D4:L457721-457727); a crouched body keeps its request. The request is KEPT (0x558080 returns 0 at
  0x5583e0, `+0x374` stays 1, taken once the water is 8.5 or less) only offline in r0004, and in r0001 online and
  offline alike (D:L418973-418974). So a spawn standing in water over 8.5 deep drops the crouch online, as R4P-R3's
  build did (reverted, OT.R156; the port now asks no crouch at a spawn): `Traversal.stanceFor` (viewer `traversal.ts:1696-1702`) turns the crouch to stand and `Walker.retryStance`
  (`mover.ts:3443-3444`) drops a request equal to the posture. The port has no offline branch -- every match in it is
  online (`SOLO_IS_NETWORK_READING`) -- so r0004's offline keep has no counterpart to differ from. *Was: "the original
  KEEPS the local SEAL's request ... the port drops it: a difference older than this task" -- withdrawn; it read
  0x45d481 as something other than the online byte.*
- Not read: the bodies of 0x57f0f0 and 0x552410; 0x5874d0; the push 0x58e160; the animation step 0x57f580 (r0001
  `FUN_0057a330`); what calls the rebuild at a round start against a respawn; whether TeleportTo zeroes the velocity
  (the port's `reset` does).
- (Historical, R4P-R3; reverted under OT.R156, the owner's playtest.) The change was large and visible (the first 0.6 s of every life: the eye, the hit volumes, the accuracy state, the
  first snapshot crouched); it rests on unscored captures and a store read by two readers.
- Tests (historical: R4P-R3's, reverted with it by 6de549133c): viewer `test/spawnCrouch.test.ts`, `test/spawnPageRoomAgree.test.ts` ("R4P-R3 fold": F3a, F3b, F3c, an explicit
  placement, and the cell-seeded SEAL start 0 of the tracked fixtures MP2 / MP6 / MP71 / MP72 -- a dev-fixture test of
  the port, no capture scored); match `test/respawnSpawn.test.ts` ("R4P-R3"; the record picks re-pinned to the `seed`,
  the placement, since the told `at` now carries the seed frame's root), `test/netcode.test.ts` (its page model); central
  `test/roomSpawnPose.test.ts` (the pins re-said), `test/roomResume.test.ts` (the resumed posture crouch: nothing pressed
  since the spawn). Fixtures that spawn and then `place` a body state their stance (`roomDamage`, `hitPoseRoom`,
  `roomStillClipStance`): `Walker.reset` keeps the stance word.
