# 92 -- Doors: what the action button does to a door, and the viewer's (2026-09-29; §2 corrected and §4 extended 2026-10-23: the presser's `Open door` clip)

Written 2026-09-29 after the owner's play test ("opening doors: I can see the action but they do not open or close").
Sources: the SOCOM II decompilation `analysis/socom2_game.elf.decomp.c` (cited `FUN_x` and its line), reCOM
(`recom/src/gamez/zAnim/zanim.h`) for the zAnim structures, and the disc: each map's `READERM.ZAR/actions.rdr`,
`MZANIM.ZAR` and `MP*_GEO.ZED`. Values marked [reading] are the viewer's interpretation where the decompilation
stops.

## 1. The game's door

A door is a **map action**. `READERM.ZAR/actions.rdr` (loader `FUN_002b4230`, registered by `FUN_002b4190` as
`EXECUTE_ACTION`, 0x3f2070) lists records with `node`, `valve`, `anim`, `type`, `range`, `elevation`, `bitmap`
(the keys are the strings at 0x3f20f0-0x3f2130). A `CZAction` holds (from its uses below):

| offset | field | use |
|---|---|---|
| +0x08 / +0x0c | the animation count and list (`anim`) | `FUN_002b44e0` 156787 picks one by index |
| +0x10 | the running animation, or 0 | `FUN_002b44e0` refuses while it runs (`FUN_00270e40`); cleared by its end callback `LAB_002b46d0` |
| +0x14 | the scene node (`node`) | passed to the animation as context type 3 |
| +0x18 | the `CValve` (`valve`): its short at +4 is the door's state | 0 shut, non-zero open (`FUN_002b4760` 156891: "Open/Close target door under reticule"; `FUN_002b4820`: "OPEN DOOR"/"CLOSE DOOR"); 99 locked (`FUN_002b46f0` 156872, `FUN_005aa240` 463830) |
| +0x1c / +0x20 | `range` / `elevation` (-1 none) | the reach test in `FUN_005aa240` |
| +0x24 | the type: 0 door, 2 switch, 3 defuse, 4 MP bomb, 5 breach, 6 satchel, 7 take item | `FUN_002b4820` |
| +0x3c | the net log id | `FUN_002bb5b0` |

**The pick** (`FUN_005aa240`, 463830-463905): the node under the reticle (actor +0x3fc, else +0x3dc), or one of its
parents up to six levels (`FUN_005aa470`), names an action; the action is refused when its valve reads 99 or its type
is 8; then the reticle's point on it (actor +0x3c0 / +0x3e0) against the SEAL's place (actor +0x1c): the ground-plane
distance squared under `range` squared, and when `elevation` is not -1, the height difference squared under
`elevation` squared.

**The button** (`FUN_00592d50`, the `0x2000` branch at 452002-452022): with an action picked and offered
(`FUN_002b46f0`: no animation of it running, not locked; the team mask +0x30 against the actor's), a non-MP-bomb
action runs `FUN_002b44e0(action, actor, FUN_005ec4e0(...))` and the branch ends -- the press goes to nothing else.

**The use** (`FUN_002b44e0`, 156787-156865): refused while its animation still runs; else animation `index` starts
through `FUN_00272bb0(anim, 1, 3, node, 4, valve, 1, actor+0x3b0)`: the node and the valve are its context. `index`
is `FUN_005ec4e0` (500519): 1 only when the action has two animations, is a door, a float of the controller (+0x120)
is at least `DAT_00650ae8`, the controller or the actor's +0x264 bit says so, a netlog record's kind is 1 and
`FUN_00519080` on the actor is positive -- the `kick_door` animations of Sandstorm, Chain Reaction, Guidance and
Requiem; else 0. Online the use is logged to the net (`FUN_002bb5b0`), and every valve that is non-zero is replayed
to a joiner (`FUN_002b4440` 156767).

**Nothing shuts a door by itself**: no timer or valve watch touches the door's valve outside its own animation.

## 2. The door animations on the disc

Frostfire's three doors all run `MZANIM.ZAR`'s `singleDoor_right` (dumped with `npx tsx tools/dump-effects.ts MP2
--mission 'singleDoor*'`). Its sequences:

- `seq_0` (activation 1, runs at the start): `IF VALVE == 0` -> `CALL_SEQUENCE open`, `ELSE` -> `CALL_SEQUENCE close`.
  The `VALVE` command's flags byte (+13) is 3: bit 0 takes the valve from the animation's context (`FUN_00353fd0`
  252128-252150: `FUN_002721c0(context, ref)`), which is the door's own valve; bit 1 would be a name index.
- `open` (activation 2, called): three commands of the `ai` namespace (set 2 -- `FUN_0026a8e0` splits a registered name
  at `::`, D:L115284-115295, so the high byte is the namespace and the low byte the place in `FUN_005de320`'s
  registrations, D:L493405-493471; research 214 §8), **corrected 2026-10-23** (the first reading took all three for AI
  notices by their payloads; research 199 §6 had named them): `ai::MOVE` (16), `ai::ANIMATE` (20) and `ai::EVENT` (5),
  all with `select` 0 -- the actor that started the program, `FUN_002b44e0`'s tag-1 context `actor+0x3b0`, the SEAL who
  pressed. In order: `ai::MOVE`, `ai::ANIMATE`, `VALVE` set 1 (0x0b) on the context valve, `ai::EVENT`, `SOUND
  .DOOR_WOOD_OPEN` at the caller's node, then `OBJECT_MOTION_FROM_TO` with flags 0x61 on the caller's node: the rotation
  form (0x40), relative (1): from the node's rotation now, to `(0, -0.766, 0, 0.643)` (100 degrees about -y) after it,
  over 0.7 s (+0x34).
  - `ai::MOVE` (parser `FUN_005d64b0` D:L488996-489058, begin `FUN_005d5d00` D:L488725-488994): mode 1 `node`, node
    0xfa (the first tag-3 context: the door's node), `dist` 18.0, `pos` (0, 0, -13), `dir` (0, 0, -1); not `blocking`.
    The goal is the point 18 units from the node toward the actor, facing the node, written on the actor's navigation
    goal (`FUN_0056daa0(3.0, actor+0xc0, 3, point)`, `FUN_0056d920`, D:L488972-488977). Its `blocking` bit (+0x28 bit
    0x20) is not the disc's alone: the begin overwrites it with whether that `+0xc0` object answers (D:L488983-488989),
    and a blocking MOVE's tick waits while the object's `+0x3f4` is 5 (D:L488702-488714) -- so where the presser has such
    an object the MOVE holds the ANIMATE and the swing until the walk is done. Whether a pad-controlled SEAL follows that
    goal, and whether its MOVE blocks, is not read: `DOOR_MOVE_ORDER_READING` (§7), the port moves no body and takes no
    time for it.
  - `ai::ANIMATE` (parser `FUN_005d3c80` D:L487461-487553, begin `FUN_005d3740` D:L487286-487458, tick `FUN_005d2f30`
    D:L487009-487284): one type at +0x30, **63** -- `Open door` in the ELF's static anim-type table at 0x661060
    (`FUN_005e3ff0`; 1 `Stand`, 132 `Pistol open door`) -- the pre-wait at +8 **0**, the post-wait at +0x10 **0.25 s**
    (their random ranges +0xc / +0x14 zero; the begin draws them into +0x18 / +0x1c), flags +0x23 zero (`blocking` is
    bit 1, `skip_end` bit 0). The stance the push takes is the byte at +0x21, 0 in the bytes (the parser's 0x0b default
    and its `stance` keyword land at +0x22, research 214 §9): a literal 0. The tick spends one game frame on the
    pre-wait (phase 0), one on the push (phase 1: `FUN_00588bc0(actor, 63, 0, 0, 0)` D:L487256-487260, unless the
    actor's top motion is already that type), then counts the post-wait down (phase 3; each phase zeroes the frame's dt,
    D:L487280) and ends, not blocking, without waiting for the clip. On the game frame (`GAME_FRAME_DT`, 525/15734 s):
    the push one frame after the press, 0.25 s is 7.5 frames so 8 are counted, and the valve, the sound and the swing
    follow at the ninth frame, **0.300 s** after the press. The press's console sends the push itself (`FUN_00588bc0`'s
    5th argument 0, D:L446413-446414 -- where its other conditions hold, `DAT_0045a0c1` and the actor's `+0xc0`
    controller's `+0x34` answer, D:L446408-446414: the local actor online -- a Push Blend to every console; research
    179 §11.5), so every console sees the clip. `animset.rdr` maps `Open door` to **`seal_open_door`** in `GLOBAL`,
    which the Seal anim set includes (`READERC.ZAR`; `motion.rdr` playback 0.8 s, **`NoInterrupt` 0.5**; `MOTION_P.ZAR`
    14 keys), and no set names a `Pistol open door`, so the pistol in the hand plays the same clip (`FUN_0058c820`'s
    pair swap finds no pistol type in the set, as research 85 §8.1's crouched throws; the type is no registered pair
    either, `FUN_005e1cf0`). The push sets no motion flag 0x4 or 0x2 (the flinch's `FUN_005a2690` does,
    D:L460021-460024), so no reload is refused under it -- a flinch still on the stack loses its refusal, which reads
    the top motion's flag (`FUN_005b4340` D:L469494-469504); the stick cuts it as it cuts the flinch (`FUN_00550ef0`
    D:L418174-418185: a top one-shot without flag 0x40, past 0.1 on an axis; research 230 §5.2.1) but only once its
    phase is strictly past its `NoInterrupt` (`FUN_00587c20` D:L445550-445556): from half the clip, the 23rd command
    after the push on the port's clock (`noInterruptCommands`: 0.5 x 0.8 x 13/14 x 60 = 22.3), where the flinches
    (none) are cut from the first frame.
  - **The body under the door clip** (2026-11-07, `agent/door-open-lock`; the owner: "opening door animation still isnt
    right / u shouldnt be able to open then move right away"; reading, pending review -- source inspection and the
    disc's data through the repository's readers, no game run). *What the original does.* `seal_open_door` is a
    full-body one-shot on the action stack: `motion.rdr` looped 0, no `BlendOverlay`, no `NoTurn`, no `NoFire`
    (`READERC.ZAR`; the NoTurn count is read by eye off the bytes, not through `motionTable.ts`, which does not read
    the flag -- the review's F1; the turn is governed by the driver's action-id zeroes below either way). While a non-looped play is on top the ground
    driver `FUN_00550ef0` runs no ground state -- its top-is-one-shot branch (D:L418171-418203) asks only the stick's
    cut (D:L418180-418190) and the end test (D:L418193), and `FUN_005870e0` (D:L418203), which hands the body back to
    the ground state, runs only on one of them -- and the tick's advance feeds the **top** play's root velocity to the
    actor (`FUN_0057a330` -> `FUN_0028c250` D:L438910, the scale D:L438985; research 217's "The speed the test reads",
    proven by capture for the walk's own top). So the stick is read and not obeyed: the presser's body moves by the
    clip's root alone -- the same rule as the throws' and the still reloads' holds (`mover.ts` `HOLD_CLIPS`, whose
    header said "a door moves the leaf, not the SEAL": true of the leaf, wrong since this section's 2026-10-23
    correction found the push) -- until the stick or the turn past 0.1 cuts it, which `FUN_00587c20` allows only past
    `NoInterrupt` 0.5 (D:L445550-445556): commands 1-23 of the push held whatever the stick asks, the 24th the first
    the stick may cut (`pushedWindow`'s `cutFrom`, `start + 23`), the ground state running on that command; with no
    stick, the whole clip -- 42 commands, 0.69 s, `oneShotSeconds(0.8, 14)`. The kick holds the same way: 1.55 s and
    cut from `start + 37` (`seal_kickopendoor`, playback 1.7, 22 keys, `NoInterrupt` 0.38; `seal_p_kickopendoor` 43
    keys, no root track). The root (`MOTION_P.ZAR`, keys 0-13, z behind): the open lunges the body about 5.0 ahead by
    key 8 and back to 0.29 ahead at key 13; the kick steps 6.5 ahead. *Turning, shooting, being pushed.* The turn
    stays free -- the turn is laid every frame (D:L418340) unless the action is one the zeroes name
    (D:L418302-418337: climbs, ladders and the `NoTurn` clips, research 83's table), and the door's is none -- and a
    turn past 0.1 cuts the clip as the stick does (D:L418182-418185). No round is refused (no `NoFire`). The body's
    collision still runs on the root's step (a leaf swinging into it pushes it out, `slideOrMove`). *When the door
    moves.* Unchanged (above): the push one game frame after the press, the valve, the sound and the swing at the
    ninth, 0.300 s -- inside the hold. *Whose decision.* The push is the presser's own console's (`FUN_00588bc0`'s 5th
    argument 0, D:L446413-446414), sent to every console; the port's room is the authority: it pushes the clip
    (`room.ts` `doorMotion`), keeps the window and holds its mover's body on it, so a page that walks under the clip is
    corrected by the room, never believed. *Built (PTW.R3, room and page on one commit).* `mover.ts` `PUSHED_CLIPS` (the
    three clips' `motion.rdr` and `MOTION_P.ZAR` values, pinned by `doorHold.test.ts`), their root keys in
    `actionRoots`, and `Walker.pushedOnTop`: while a push stands on top of the window on the command run and that
    command's stick does not cut it, the step moves the body by the clip's root along the facing (as `HOLD_CLIPS`'), the
    stick read and not obeyed. The room's hook (`room.ts` `watchMoves`, the clip in `Player.flinchClip` from
    `doorMotion`) and the page's (`walk.ts` `pushedTop`, the clip in `setFlinchPose`'s `clip`) read the one-shot slot
    `oneShotOnTop` reads, a push's only (a flinch's window holds nothing: below). The bare page's own press (`main.ts`,
    `matchMount.ts` `pushClip`) lays the window on its next command, so it holds at once. In a match the page hears the
    room's push a round trip after its first command (the room pushes at its doors' step, `from` = the presser's next
    command, `Room.step`): `WalkMode.pushHeard` runs the commands since again from the state kept before the window
    (`rerunFrom`, the knock's and the dance's way, the flinch stepped on the re-run's commands), and the net client
    drops their predictions (`NetClient.replayed`), so the page stands where the room's mover does -- no snap back; a
    record that does not reach back (past `KEPT_COMMANDS`) leaves the snapshots' correction, as before. Tests:
    `doorHold.test.ts` (viewer; the disc's values, the mover, the bare page, the late page against the on-time page)
    and `roomDoorHold.test.ts` (match; the room ignores the move commands in the window), RED first.
    *Not built, recorded* (LATER 731): (1) the flinch's own body hold -- the same rule holds a flinch's victim on the
    flinch's root until its cut (none of the six has `NoInterrupt`: the third command at the earliest,
    `FLINCH_CUT_COMMANDS`), and the port lets the stick walk under the flinch; (2) the phase of the root after a
    clipless landing hands the push back (`flinchLanded`) restarts from the window's new start, where the original's
    covered play keeps its phase (`FUN_0028da00` D:L135098-135110) -- a push covered by a fall is rare (pushed in the
    air or carried off a ledge, which the hold now prevents); (3) a mover action under the push (a stance transition,
    a landing's carry) keeps its own clock, where the original's covered play is frozen (only the top advances,
    D:L438874, D:L438901) -- the port's flinch slot has always stood beside the mover's own actions; (4)
    `DOOR_MOVE_ORDER_READING` (§7) is unchanged: the `ai::MOVE` to the point 18 units from the node is not run, and
    whether a pad-controlled SEAL's MOVE blocks the ANIMATE is unread. Settles (1)-(3): a capture of a SEAL pressing a
    door with the stick held (its position and top action per frame); (4): §7's.
  - `ai::EVENT` (5): an AI noise -- a radius 100 over 0.25 s at the node -- which online no AI hears (research 199 §6:
    the event masks are 0). Not run: there is no AI in a round.
- `close`: `ai::MOVE` and `ai::ANIMATE` (no `ai::EVENT`), then the valve set 0, the turn `(0, 0.766, 0, 0.643)` and
  `.DOOR_WOOD_CLS` after the swing.

`singleDoor_left` turns the other way. So the valve changes at the start of the swing, the swing is a slerp
(`FUN_0025f9b0` 108850: `FUN_00306ae0` by elapsed / +0x34, the end set exactly; begin `FUN_0025fe70` 109034 reads the
node's rotation into +0x10 for flag 1, `FUN_003070c0(+0x20, +0x10)` makes the end), and the door's collision is the
node's: the leaf's `di` polygons hang under the node (`worldmodel/bdoor_4/door1=door1/door_slab`, 20 polygons, and
`.../pane1`, 2), so the engine's hull turns with the node.

The 22 maps hold 43 `DOOR` actions on 10 maps: Blizzard 6 (`singleDoor`, 1.0 s, with an `ELSEIF`), Frostfire 3
(0.7 s), Vigilance 4, Desert Glory 1 (`.DOOR_METAL_OPN`), Fish Hook 6, Sandstorm 7, Chain Reaction 2, Guidance 9,
Requiem 5 (1.0 s each). Sandstorm, Guidance, Requiem and Chain Reaction name a second animation (`kick_door`,
`kick_Door_left`/`_right`); Chain Reaction's two are not in its `MZANIM.ZAR`. The first animation of every door
swings its leaf 16-32 units out at its far edge and back to within 0.0002 (the survey in section 5).

## 3. What the viewer did, and why the doors never moved

Before this change the viewer read `actions.rdr` only for the HUD's prompt (`./mapActions`, research 87 section 5):
within 30 of a door's node the door icon showed. Nothing else read a door. The action button went to the traversal
(the climb, the ladder's slide) and nothing answered it at a door; the zAnim door animations were never decoded for
their rotation (`OBJECT_MOTION_FROM_TO` was read in its scale form only, for the muzzle flashes); the leaf was drawn
as a static prop (`door1` placed under the door node, one mesh per placement), and its collision polygons were baked
into the static hull the grid files once and the mover caches per cell. So the prompt showed and nothing moved.

## 4. What the viewer does now

- **Read** (`./doors` `readDoors`, from `./loadMap` and `./simMap`): each `DOOR` record on its scene node, its valve,
  range and elevation, its animations out of `MZANIM.ZAR` decoded (`decodeEffectProgram`, whose `fromTo` now carries
  the rotation form's two quaternions and whose `VALVE` carries the context flag), the collision owners under the node
  and the box the leaf can reach round its hinge. The owners are marked (`CollisionOwner.sweep`) before the hull is
  packed: the grid files them under the whole swing (so a polygon can be turned in place without relinking) and the
  mover reads their walls fresh every step instead of from its per-cell cache (`Walker.wallsNear`).
- **Run** (`DoorSet`, headless: the page and the server): the action starts the door's first animation on the effects'
  sequencer (`./effectRunner`) with a host that knows one node, one valve and the presser -- the `IF` on the valve, the
  calls, the `ai::ANIMATE` (its pre-wait tick, its push to `DoorHooks.animate` with the presser, its 0.25 s post-wait:
  `aiAnimate`, decoded since 2026-10-23), the valve set, the sound, the slerp -- and each step turns the leaf's polygons
  in the hull the movers read, from their rest positions through the node's rest-to-now matrix. Refused while it runs,
  as `FUN_002b44e0`. The kick is not run; `ai::MOVE` and `ai::EVENT` are stepped over (§2).
- **The presser's clip** (2026-10-23; the owner: "Animation for opening doors is non existent"): the push of `Open door`
  (type 63, `OPEN_DOOR_TYPE`; the clip `openDoorClip`, `seal_open_door` with either hand) reaches the body as the
  flinch's clip does -- whole-body over the body's play (FLINCH_LAYER_PLACEHOLDER's layering, research 91 §21.1), on the
  one-shot clock, cut by the stick as the flinch is but only past its `NoInterrupt` 0.5 (`FlinchCut.cutFrom`,
  `noInterruptCommands`). The ANIMATE's phases step at the game frame whatever the page or the room steps the door with
  (`GAME_FRAME_DT`, ruling PF.R8): the push at the first whole frame after the press, the valve at the ninth. In a
  match the room's `DoorSet` names the presser (`use(i, feet, id)`) and sends a `motion` event to every page, the
  presser's own included, with the clip's window on its commands and the cut's first command (`Room.doorMotion`,
  `pushedWindow`). **The one-shot slot** (#485's fresh review, 2026-10-24, F1 and F2): page and room hold the clip in
  the slot the flinch uses -- the page's `setFlinchPose`, the room's `flinchFrom` .. `flinchUntil` with
  `flinchCutFrom` and `flinchGatesReload` false -- since the push puts it on top as the flinch's push does. So the
  jump is refused under it on both (a one-shot on top, `FUN_00550ef0` D:L418119-418132; research 230 §5.2.5: the
  page's `flinchOnTop`, the room's `jumpRefused`), the stick cuts it past its `NoInterrupt` on both (`flinchCut`), a
  fall covers it and a clipless landing hands it back (PAR-65, PAR-71: `flinchLanding`, the page's `flinchDown`), and
  a death or a new body clears it. No reload is refused under it, the hand-back included: the push sets no motion flag
  0x4 (`FUN_005b4340` D:L469494-469504 reads the top's), so the page's `flinching()` answers false for the slot when
  it holds a push (`reloadGate` false) and the room skips its 'flinch' drop; a flinch's refusal still open ends at the
  push -- that the flinch is the top again after the door clip is not modelled (LATER 363; 0.69 s and 0.6 s) -- while
  the room keeps the cut flinch's span before the push refused (`flinchKeptFrom` .. `flinchKeptUntil`; the re-read's
  N1: a reload named on a command the flinch was on top for is still the flinch's), and a flinch after the push takes
  the slot back with its refusal from its own command. No round is refused under the clip: `seal_open_door`'s
  `motion.rdr` row has no `NoFire` (read 2026-10-24 through `motionTableFromArchive` on `READERC.ZAR`: `noFire` null,
  where the claymore's and the wall plant's read 1; the re-read's N6). The jump in the clip's first round trip is taken
  on the page, which has not heard the `motion` event yet, and refused in the room, which pushed the clip -- the
  flinch's own case (PAR-78, research 230 section 5.2.5), corrected by the room's snapshot. The others' bodies play it
  (`RemotePlayers.pushMotion`), the own page through the walk as a program's push (`WalkMode.setFlinchPose(...,
  { reloadGate: false, pushed: true })`): neither asks `FUN_005a2690`'s gate (an ANIMATE push has none) nor pops a
  running climb; what pops the stack takes it off (`pushPopped`, F3: a knock and Prone cover, `FUN_0057e770` ->
  `FUN_0058a4d0` D:L440997 -- corrected on the re-read, which found D:L461713 the second channel's clear; a ladder's mount,
  D:L441547-441558; a climb's start, D:L442186-442214) and a swap does not. With no room (the bare viewer), `DoorPage`
  plays it on the own body itself (`pushClip`), its window sized from the walk's own next command (`pushedWindowOf`,
  F4), so the stick cuts it there too; a swing followed off the wire (`'wire'`) plays none, the event having carried
  it; one already under way on the server is run through its head to the swing, heard, and set to the server's phase.
  The clip is loaded where it plays (`DOOR_CLIPS`): in the room's `SIM_CLIPS` (the window's keys and `motion.rdr`
  row) and both pages' asks of the worker (the pose's keys) -- found missing by the browser check of 2026-10-24, where
  the own body drew no clip and the room sized no window, which the unit tests (their own clips) could not show.
- **Pick** (`pickDoor`): the view's segment from the eye to the aim point (`WalkMode.fireAim`), bit-18 surfaces passed
  over [reading], the first polygon a door's (a tie within 0.05 unit with a frame's wall goes to the door:
  `PICK_TIE_READING`, section 7), the feet within `range` on the ground plane and `elevation` in height, the door not
  swinging (`FUN_002b46f0`). The HUD's door prompt is this pick now, not the distance to the node.
- **Button** (`WalkMode.setActionFilter`, `./doorPage`): a door picked takes the press before the traversal does, as
  the game's branch does.
- **Draw** (`WorldView.moveNode`): every prop placement at or under the door's node path is drawn at the node's
  rest-to-now matrix after its own -- the leaf, its pane, the frame model's root -- so no copy is left where it was.
  The sound goes to the audio catalog by name (`.DOOR_WOOD_OPEN`, `.DOOR_WOOD_CLS`, `.DOOR_METAL_OPN`).
- **Multiplayer** (protocol 2): the client sends `{ type: 'door', seq, door }`; the server (`Room.useDoor`) checks the
  player's reach to the leaf as it stands (range and elevation plus 8, `doorInReach`) and runs the same `DoorSet` on
  the hull every player's mover reads; each snapshot carries every door in two bytes (`DoorWire`: the valve, the
  swing's phase 0-254, 255 at rest). A page follows: a swing the server began is run here too, heard and caught up to
  its phase; a door at rest with another valve (a late join) is run out silently.
- **The round's start on the page** (HOTFIX DOOR-RESET, 2026-11-02; reading, pending review; the owner's Vigilance
  playtests): the room's `startRound` resets its doors (`DoorSet.reset`, PF.R10, DOOR_ROUND_RESET_READING); the page
  had no reset and leaned on the run-out above, which runs the door's program from the page's last state -- a round
  started mid-swing left the page's leaf swinging open where the room's stood shut (the player walked into a door the
  room held shut), and a press in the new round's first ticks ran the last round's close. `DoorPage.frame` now runs
  the same `DoorSet.reset` when the client's round epoch changes (`NetClient.newEpoch`: the `roundStart`, or a
  snapshot that overtook it), skipping the snapshot held at that moment. The lever gates and Chain Reaction's cranes
  follow the snapshot's pose or phase absolutely (`GateSet.applyWire`, `CraneSet.applyWire`), not by re-running a
  program, so they are not the same bug and are unchanged. The room's door refusals are now named in its drop log
  only (`door: dead`, `reach`, `busy`, `locked`, `noprogram`, `shape`; `Room.dropped`'s `logOnly`: never the seat's
  `signals.refused`, which central's moderation flag counts -- the review's F2, F3). The review's F1 (the page's offer
  against the room's reach): on MP51's four door_ft doors, shut, no position and facing has the page offer a door the
  room refuses on reach -- the page offers at 8-14 u from the leaf, the room accepts to ~36 -- so reach is not the
  playtest's cause (`viewer/test/doorReachAgree.test.ts`, first-person eye; the third person's not probed). Unit test,
  loopback with the disc: `viewer/test/doorRoundReset.test.ts` (MP51 `door_ft_4`, 50 ms each way);
  `match/test/roomDoorRefusals.test.ts`.
- **A flinch under the push** (LATER 363, 2026-10-27; reading, pending review; source inspection of the decompilation, the
  gameplay seat): the reload's refusal asks the top of the actor's motion stack -- `FUN_005b4340(actor, 3)` reads
  `FUN_00555170(actor + 0x1c0)` and its flag 0x4 (D:L469494-469504); `FUN_00555170` returns the entry at the stack's
  top index (D:L419945-419955). The flag is the pushed entry's own: `FUN_005a2690` sets it on the entry
  `FUN_00588bc0` returned (D:L460019-460022), and the door's `ai::ANIMATE` push sets none: the push's entry is set up by
  `FUN_0028dc90` (D:L135119), which zeroes its +0x28 (D:L135183) and sets only 0x40 (D:L135187-135189) and bit 1
  (D:L135192-135196) -- the review's F3; *was* cited at the push's send to the consoles, D:L446413-446414.
  So a door pushed inside a flinch's window covers the flinch and its 0x4 with it -- a reload is taken under the door
  clip, as the port does (#485 F1) -- but does not pop it. Only the top play advances (D:L438702, D:L438874,
  D:L438901; research 230 section 5.2.4), so the flinch keeps the phase it reached at the push. The door clip's end
  (`FUN_00582540` D:L418193, then `FUN_005870e0` D:L418203) or the stick's cut pops one play: `FUN_005870e0` ->
  `FUN_00589aa0` (D:L446479; the pop `FUN_0028da00` D:L135025, whose loops free the popped play's blends, one play
  off), and the play below is set up again with its phase kept (D:L135098-135110: the initial skip, bit 8, set; the
  driver's peek spends it before the tick's advance, D:L134241-134257, as at PAR-71's hand-back). The flinch is the
  top again: its 0x4 refuses a reload for the commands it had left at the push, from the pop's command (the
  `flinchLanded` count, at least one), and the stick cuts it from there (`flinchCutAt`). A later flinch takes the slot
  from both: `FUN_005a2690` pops the stack to the stance's base first (`FUN_0058a4d0` D:L460018); so does what else pops
  it to its base, and the covered flinch goes with the push -- a landing with a clip (`FUN_0058a5e0` D:L466897,
  `FUN_005af590` D:L466691-466693), a knock (`FUN_0057e770` -> `FUN_0058a4d0` D:L440997), a ladder's mount (`FUN_0057f880`
  D:L441547-441558), a climb's start (`FUN_00580b70` D:L442186-442214) (the review's F1). Open (LATER 512): the
  handed-back flinch is not drawn on the page (a phase-held pose); a second push over the first (two `Open door` plays over
  the flinch: the port keeps only the flinch under, not read); a door clip covered by a fall is handed back at the door's
  planned end in the air, where the original's covered clip does not advance and plays its rest after a clipless
  landing -- room and page agree (the review's F2).
  **LATER 512's reading** (2026-10-27; source inspection, the gameplay seat; reading, pending review). *The drawn flinch.* The
  covered flinch keeps the phase it reached at the push (only the top advances, D:L438702, D:L438874, D:L438901) and the
  pop sets it up again as it stood (`FUN_0028da00` D:L135098-135110: its play's blend chain re-entered; only when both
  plays loop does it take the phase of the popped, newer play, D:L135105-135110 -- a flinch is a one-shot, so its own
  phase stands (*was* written "restored from an older one", backwards: the review's F4) -- and the initial skip set,
  which the next tick's peek spends, D:L134241-134257): the body plays the flinch's
  clip again from the phase it was covered at, for the rest of the clip -- what LATER 363's `flinchLanded` count gives
  the reload's refusal. The port draws it so (LATER 512): the page's own flinch pose has a settable clock and
  `WalkMode.flinchUncover` sets it to the commands the flinch had run at the push (`at - start`), plus those since the pop
  when the push's event comes after it (the review's F1); another's body keeps
  the covered flinch (`stepFlinch`'s `under`) and plays it on from its frozen time when the door clip ends or is cut; a
  pop to the base -- a knock, a ladder, a climb, and a landing that plays a clip (the review's F2) -- takes both.
  *The climb's pop* (LATER 363's re-look): `FUN_00580b70` pops to one play when the actor's state `+0x174` is 0 and to
  two otherwise (D:L442186-442213; `+0x174` the actor state, 4 a hang, 5 a ladder: research 218). With the door clip on
  top that state is the door play's own (*corrected* by LATER 512b, below: neither the flinch's nor the door's push writes it): a pop writes the revealed play's `+0x2b` back as the state through the actor's
  vtable (D:L135104; that the call writes `+0x174` is not verified -- the folds' re-look), and the push stores
  `FUN_00588bc0`'s third argument there (D:L135204; *was* cited D:L135200, which zeroes `+100`) -- for the door's
  `ai::ANIMATE` the command's byte `+0x21`, or the actor's own state when that byte is 0xb (`FUN_005d2f30`
  D:L487194-487196, D:L487254, D:L487259). That byte is **0 on every door program on the disc**: read 2026-10-27 through
  `readActionRecords` and `parseAnimSets` (the raw command's byte, which `decodeEffectOp` does not keep) off the 9
  `MP*.ZDB` that hold doors (MP1, MP2, MP51, MP6, MP71, MP73, MP81, MP82, MP83): 16 door programs, the opens and the
  kicks alike, 29 `ai::ANIMATE` commands; held by `doorClip.test.ts`'s dev-disc case 'LATER 512: the door programs'
  ai::ANIMATE byte +0x21' (the review's F3; the folds' re-look): state 0, so the climb leaves one play and
  the covered flinch goes with it, as the port clears it (`stackPopped('climb')`). A flinch kept second from the base is possible only where
  `FUN_0058a4d0` stopped popping early -- it stops while the current action is 1, 0x12 or 0x1a (`FUN_00577e40`,
  D:L446753-446765) -- unread which those are. *The mount* pops every play: `FUN_0058c4a0` -> `FUN_0058c350` calls
  `FUN_0058a5e0(actor, 0, 1)` (D:L447984), whose loop pops while the stack holds more than 0 (D:L446796-446798; *was*
  written "to its base": the review's F4; research 215's "The pop"): the covered flinch goes with the door clip there too (built with LATER
  512: the room's mount take, `room.ts` beside its `mountPop`, and the walk's `mountTake` clear it).

  **LATER 512b's reading** (2026-10-27; source inspection of the decompilation, the type names off the ELF through the
  repository's reader; the gameplay seat bf's implementer; reading, re-read by the LATER 512b review 2026-10-27). *(a) The climb's loop.* The stack is
  the actor's `+0x1c0` array with its top index at `+0x1c8`, -1 when empty (`FUN_00555170` D:L419945-419955), so "while
  index + 1 > n" pops until n plays stand. `FUN_00580b70` pops to one play when the posture word `+0x174` is 0 and to two
  otherwise (D:L442186-442199, D:L442201-442214; `+0x174` 0 stand, 1 crouch, 2 prone: research 211, 368). The bound is
  the depth of the posture's base: `FUN_00588bc0` pushes `Crouch` (0x12), `Prone` (0x1a) and `Hang` (0x22) only after
  popping to one play (D:L446105-446118), so a crouched or prone body's base is two plays -- slot 0 the standing base,
  slot 1 its `Crouch` or `Prone` -- and a standing body's is slot 0 alone. (The names: the ELF's static type table at
  0x661060 read through `tools/elfImage.ts`: 1 `Stand`, 0x11 `Stand -> Crouch`, 0x12 `Crouch`, 0x13 `Crouch -> Prone`,
  0x19 `Stand -> Prone`, 0x1a `Prone`, 0x21 `Stand -> Hang`, 0x22 `Hang`, 0x23 `Hang -> Climb`, 0x2a `Climb crate`; the
  climb's registered types `DAT_003dec80` `Step up`, `DAT_003dec90` `Climb medium`, `DAT_003deca0` `Climb over`,
  D:L495255-495259.) *(b) The flinch through a climb.* The flinch is pushed above that base: `FUN_005a2690` first calls
  `FUN_0058a4d0(actor, 0)` (D:L460018), which pops while more than one play stands and the current type (`+0x534`, which
  `FUN_00577e40` compares, D:L437398-437410; written at each push and pop, D:L446299, D:L446525) is none of 1 `Stand`,
  0x12 `Crouch`, 0x1a `Prone` (D:L446762-446765 -- the three types LATER 512 left unread), then pushes the flinch at the
  body's posture (D:L460019). Crouched or prone the flinch is at slot 2 or above, standing at slot 1 or above, and the
  door's `Open door` over it. Neither the flinch's push nor the door's writes `+0x174`: `FUN_0028dc90` stores the
  posture in the play alone (`+0x2b`, D:L135204), and only a pop hands a play's word to the actor (D:L135104;
  `FUN_005870e0` D:L445142-445147). (Not every push leaves it: `FUN_00588bc0` calls the actor's vtable `+0x90` with 5
  for `Ladderslide`, D:L446304-446305, D:L446405 -- the review's F1.) So at a
  climb under the door clip `+0x174` is still the stance the body flinched in (*corrects* LATER 512's "that state is the
  door play's own", above; its conclusion stands for a standing body): standing, the climb pops to one play; crouched or
  prone, to two -- the base -- and in every stance the door clip and the flinch under it go. The port clears it at the
  climb's start in every stance (the walk's `stackPopped('climb')`, the room's `climbStart`, the remote copy's
  `pushPopped` on a climb's clip): already matched, pinned by `doorClip.test.ts` 'LATER 512b' (a green pin). *(d) The
  ladder* is another path: `FUN_0057f880` pops to one play in every posture (D:L441547-441558) before it pushes the
  ladder's two plays at posture 5 (D:L441559-441561), and the `Climb over` start `FUN_00580a80` pops to one as well
  (D:L442151-442162): the flinch goes there too, as the port has it. *(c) The mount* is research 215 section 8.6, "The
  flinch at the take": every play popped, the take and the release alike. *Open* (named here, not a port value: the port
  keeps no stack): the climb would keep a flinch only at slot 1 under a posture other than 0 -- the base's `Crouch` or
  `Prone` gone from under it. `FUN_00588bc0` pops before it pushes `Stand -> Crouch` (0x11) or `Stand -> Prone`
  (0x19) forward (D:L446120-446150, D:L446152-446182): to two plays when its fourth argument is 0, else to one
  (D:L446121 against D:L446136; D:L446153 against D:L446168; the review's F2). Only the pop to two, over
  `[base, flinch, Open door]`, takes the door clip and leaves the flinch; whether a stance press under the door clip reaches that push, whether `+0x174`
  changes before the transition's end pushes `Crouch` or `Prone` (popping to one again), and whether a climb can start
  in between, are unread -- and the port does not pop the door clip at a stance press at all (LATER 512's row, left
  open). Settled by reading the stance press's push (its caller and the fourth argument it passes) and the posture's writer, or a
  capture (a crouch pressed under the door clip, a flinch below it).

  **LATER 512c's reading** (2026-10-27; source inspection of the decompilation; the gameplay seat bf's implementer;
  reading, re-read by the LATER 512c review 2026-10-27). It settles 512b's *Open* above and research 230 section 5.2.5's "The stance under a flinch".
  *(1) The stance press's push.* The press writes the request `+0x374` (`FUN_00594cf0` D:L453331-453430), and
  `FUN_00552d60` asks it of the gate `FUN_00552ec0` once a frame (D:L418609 in `FUN_00551ec0`; D:L418875); taken, it
  runs the stance's function (D:L418877-418906) -- prone `FUN_00581660`, crouch `FUN_00581990`, stand `FUN_00581dc0`
  -- and then `FUN_00581ed0(actor, target)` (D:L418896, D:L418901, D:L418906). **Each function pops the stack to one
  play before any push** (prone D:L442454-442466, crouch D:L442562-442574, stand D:L442664-442676), then pushes the
  posture's base and the transition: from standing, crouch pushes `Crouch` (0x12) at posture 1 and then, by the body's
  speed, type 2, 0x14 or `Stand -> Crouch` (0x11) forward, fourth argument 0 (`FUN_005817d0` D:L442494-442513); prone
  pushes `Prone` (0x1a) and `Stand -> Prone` (0x19) at posture 2, fourth argument 0 (`FUN_00581540`
  D:L442422-442423), or from crouched `Prone` and `Crouch -> Prone` (0x13) (D:L442426-442427); from prone, crouch pushes
  `Crouch` and 0x13 with fourth argument 1 (D:L442517-442518); stand from crouched pushes 0x11 at posture 0 with fourth
  argument 1 (`FUN_00581c10` D:L442640), or type 2 when moving (D:L442635). So the pop to two inside `FUN_00588bc0` for
  a forward 0x11 or 0x19 (D:L446121-446135, D:L446153-446167) only meets `[Stand, Crouch]` or `[Stand, Prone]`, just
  laid: whatever stood above the base when the press was taken -- a flinch, a door clip -- is gone already, at the
  function's own pop to one. *(2) The gate under the door clip.* `FUN_00552ec0` takes a request only when the top
  play's `+0x28` bit 0x40 is set or the current type (`+0x534`) is a stance transition, 0x11, 0x13 or 0x19
  (`FUN_00588080` D:L445716-445734), and `FUN_00579ea0` is clear and the posture is not 7 (D:L418927-418930); else it
  returns 0 and leaves `+0x374` for the next frame (D:L419015). The play's bit 0x40 is copied at its push from the
  motion's flag byte `+0x49` bit 6 (`FUN_0028dc90` D:L135187-135189), research 251's looped bit (`motion.rdr`
  `looped`). `seal_open_door` is `looped` 0 (`doorClip.test.ts`'s dev-disc case, "has no NoFire ... NoInterrupt 0.5
  and playback 0.8"), and the door's type 63 is no transition (`+0x534` is written at its push, D:L446298-446299). So a
  stance press under the door clip is **refused and kept pending**; the door clip's pop hands the flinch back on top
  (above), a one-shot as well (research 230 section 5.2, `looped` 0), which refuses it in turn; the request is taken
  only once both have ended or been cut, with the base on top -- and then the function's pop to one finds nothing
  above the base. The door clip is never popped by a stance press. *(3) The posture word.* `+0x174` is written by
  `FUN_0058a6b0` (D:L446814-446825, through `FUN_0028dfb0`), the actor's vtable `+0x90` (research 251, "the pop calls
  the stack's vtable"): at the press by `FUN_00581ed0` with the target (D:L442697), right after the transition's push,
  and at each end pop with the ENDED play's `+0x2b` (D:L445118, D:L445145), and with the uncovered play's only when the
  ended one is 6 or the uncovered one is 3 (`FUN_005870e0` D:L445141-445148; the stack's `+0x14`, D:L135104). So the word is the target from the press on, before the transition ends. *(4) A climb in between.* A
  flinch taken during a transition is pushed after `FUN_0058a4d0(actor, 0)` pops the transition (its type is none of
  1, 0x12, 0x1a, D:L446762-446765; D:L460018-460019): crouched or prone it lies at slot 2 above the new base, standing
  (posture 0, the word already written) at slot 1 above `Stand` -- the depth the climb's pop takes (512b's (a)). No
  stance press leaves a flinch at slot 1 under a posture other than 0, so the climb keeps none on this path. *The port
  differs* in (2): the mover's gate (`Walker.bodyRefuses`) sees its own one-shots only, and the flinch and the door
  clip are the walk's and the room's windows, so the press is taken at once under either. Built (LATER 512c; `doorClip.test.ts`,
  `roomDoorClip.test.ts` 'LATER 512c'): the mover asks the window (`Walker.oneShotOnTop`), the page's flinch slot (`WalkMode.flinchCut`) and the room's
  (`flinchFrom` .. `flinchUntil`) on the command the press is asked on, as the jump asks it (`flinchOnTop`), but read
  after the pop (`[start, until)`, `PENDING_STANCE_RETRY_READING`'s `'afterClocks'`); a window the fall covers
  (`flinchAir`) is not on top -- the fall's own play is, and whether it refuses a stance is the mover's question as
  before. *Left open:* where a stick's cut ends the window the press is taken a command after the cut (the room learns
  the cut after the command ran, `watchCut`; the page the same, `flinchStep`), where the mover's own one-shot cut lets
  it through on the cut's tick -- the port's own order, one command late (LATER 543, settled below: the original's order too; not
  `PENDING_STANCE_RETRY_READING`, which names the original's unread order of the retry against the clocks); whether the
  fall's play refuses a stance (its `looped` flag) is not read here; other writers of a flinch at slot 1 under a
  posture other than 0 than a stance press were not surveyed; the stance paths around the gate (the standing still
  reload's clip, the dive, the handed-back holds) are LATER 544. *The round trip (the review's F4; a network gap, not a
  value of the original):* until the `flinch` event arrives the page knows no window, so it predicts the press taken
  (the stance word and the transition clip start); the room refuses it under its window, and its reconcile snaps the
  page back about a round trip later -- a visible flicker, the twin of research 230 section 5.2.5's "The press in the
  round trip" (the jump's case).

  **LATER 543's reading** (2026-10-27; source inspection of the decompilation, the ELF's words as research 230 section
  5.2.3 read them; the gameplay seat bf's implementer; reading, pending review). *The question:* at the stick's cut of
  the flinch or the door clip, is a waiting stance taken on the cut's own frame or on the next? *The frame's order.*
  The stance gate has one path: `FUN_00552ec0` is called only from `FUN_00552d60` (D:L418875), and `FUN_00552d60` only
  from `FUN_00551ec0` (D:L418609; no other caller of either in the decompilation), under the controller's tick's yes
  (`FUN_00594cf0`, the controller's slot +0xc, D:L418526, kept at D:L418527 and asked at D:L418531; the press writes
  `+0x374` in that tick, D:L453331-453430) and a top
  whose state is not 8 (D:L418606-418608). The cut has one place: the ground driver `FUN_00550ef0` asks `FUN_00587c20`
  (D:L418180; `NoInterrupt`, D:L445550-445556), tests the three axes past 0.1 (D:L418181-418185) and pops the top
  (`FUN_005870e0`, D:L418203) -- the end test `FUN_00582540` beside it (D:L418193) and the advance (`FUN_0057a330`,
  D:L418454) in the same function. The two are different slots of the SEAL's table 0x6691a0 (`CZSealBody`):
  `FUN_00551ec0` at +0x14, `FUN_00550ef0` at +0x18 (the ELF's words at 0x6691b4, 0x6691b8; research 230 section 5.2.3,
  research 194 A09), and the world's scheduler runs them as two tasks once a frame in their priority's order:
  `entity_pre_tick` 1.0 (`FUN_0029f510`, D:L50922; it calls slot +0x14, D:L145113-145126) before `entity_tick` 4.6
  (`FUN_0029f430`, D:L50925; slot +0x18, D:L145096-145108), each over every object on the list (research 230 section
  5.2.3: `FUN_0034e6b0` joins a task before the first of a greater priority, `FUN_0034e070` walks the list once a
  frame). **So within a frame the gate runs before the stick's cut**: on the cut's frame the gate still sees the
  one-shot on top (the play is popped later in that frame, D:L418203) and refuses, keeping `+0x374` (D:L418927-418930,
  D:L419015); the next frame's gate sees the base and takes it. A press made on the cut's frame itself is the same: the
  controller's tick writes it before the gate in that frame's pre-tick, and the gate refuses it. *The order
  matches; the count is OPEN* (the review's F1): the page's flinch slot (`WalkMode.flinchCut`) and the room's window
  (`flinchFrom` .. `flinchUntil`) learn the cut after the command ran (`flinchStep`, `watchCut`), so the press is held
  on the cut's command and taken on the next -- the same ORDER as the original's (the gate before the cut; reading).
  What is not read is the COUNT: the original's "next frame" is one 30 Hz game frame (about 33 ms), the port's "next"
  is one 60 Hz command, and the port's own constants map one original frame to `GAME_FRAME_DT` (525/15734 s, about
  2.002 commands) on the command clock, not to one command (`FLINCH_CUT_DELAY_READING`, `flinchReload.ts` ~58;
  `RELOAD_PUSH_LAG`, `mover.ts` ~931; `RELOAD_CUT_DELAY_READING`, `reloadLock.ts` ~133; research 230 section 5.2.3, "two
  game frames"). So whether one command or `GAME_FRAME_DT` in commands is faithful here is open, and under the
  `GAME_FRAME_DT` convention the port is early by one game frame; the pins `doorClip.test.ts` and
  `roomDoorClip.test.ts` 'LATER 512c review F5 (pin) -- the cut's command' hold the order, not a proven count (LATER
  546 owns the count and moves them if it moves). No behaviour changed. *What it shows beside the row* (not built here):
  the same order answers what `PENDING_STANCE_RETRY_READING` (`mover.ts`) calls unread -- its doc and research 101's
  row still say the applier's and the driver's order is not read, but research 230 section 5.2.3 (PAR-64) read it as
  above: the applier first. Under that order a one-shot the mover owns, cut or run out on a frame, lets the stance
  through on the next frame, where the port's `'afterClocks'` takes it on the same tick (the mover's cut and end in
  `runClocks` before `retryStance`) -- one game frame early in order, the command count open (one command, or
  `GAME_FRAME_DT` in commands; LATER 546); and the flinch slot's own natural end
  (`[start, until)`, read after the pop) carries the same question at its end edge. Settling it moves the mover's
  retry and the pins that hold the `'afterClocks'` edge (a stance after a crouched reload's last key, the victory
  dance's end, the door clip's end above, and the two cut-edge pins of the flinch slot's cut): LATER 546, with the
  capture that settles the count (a crouch pressed under a crouched reload, the frame its stance clip starts after the
  reload's last key, research 230 section 7).

  **LATER 544's reading** (2026-10-27; source inspection of the decompilation; the gameplay seat bf (redotcom-7c), its
  implementer; reading, pending review). LATER 512c put the flinch's slot in front of the stance request
  (`Walker.oneShotOnTop`); its review's F3 named three stance paths that might go around it. Each read at the source:
  *(1) The standing still reload's clip (research 251 R251.2, D02).* In the original a still reload and a flinch never
  share the stack. The flinch's push pops to the base first -- `FUN_0058a4d0(actor, 0)` before `FUN_00588bc0`
  (`FUN_005a2690` D:L460011-460019 under a one-shot top; under a looped top it pushes only over a base, D:L460032-460042),
  and `FUN_0058a4d0` pops every play until the current type is 1, 0x12 or 0x1a (D:L446762-446765) -- so a still clip
  (`seal_reload`, a crouched or prone reload, an after-shot: one-shots, research 251 D02) goes at the flinch; and no still
  reload begins under a flinch (`FUN_005b4340(actor, 3)` on the flinch's motion flag 0x4, D:L469494-469504,
  D:L460021-460024). A stance under a flinch therefore meets only the gate (`FUN_00552ec0` D:L418927-418930): there is
  no reload's own stance handling to reach -- the stance functions' first step is the same pop to one play
  (D:L442454-442466, D:L442562-442574, D:L442664-442676), whatever was above the base. *The port* asks the gate on every
  reload path: the standing still reload lays no hold (D02), so its press goes `changeStance` -> `retryStance`, which asks
  `oneShotOnTop`; the crouched and prone reloads are holds, refused by `bodyRefuses` first and `oneShotOnTop` after. So
  under the window the port and the original agree: the request waits. *They differ after it:* the port's flinch ends no
  still reload (the room's `flinch` and the page's `setFlinchPose` leave the mover's hold, the room's `reloadLife`, the
  page's `StillReloadLife` and `Fire`'s lock running; only a reload named inside the window is dropped, PF-18), so a
  crouched or prone reload's hold keeps a stance waiting past the flinch's end until its own, where the original, its
  clip popped at the flinch, takes it at the flinch's end -- research 251's open "flinch's end of an accepted reload"
  (section 6), now a row: LATER 548. *`+0xeb8`, read for LATER 548 (2026-10-27; reading, re-read by the LATER 547/548 readings review 2026-10-27):* the push's last refusal is the turret: `+0xeb8` is the mounted turret -- written at the take (`FUN_005463c0` D:L412315), the take refused while it is set (D:L412131), cleared at the release (`FUN_00545ee0` D:L411967-411973) and zeroed at creation (`FUN_00553ea0` D:L419713, word 0x3ae) -- so `FUN_005a2690` pushes no flinch on a mounted body (D:L460017; the same test under a looped top, D:L460040) -- LATER 524's open question answered, the original does not flinch a mounted body. Still open in LATER 548: whether the reload completes or is lost with its clip (the kit's timer `FUN_005c0fd0` D:L476549-476561 against the clip's end callbacks). (The standing still reload keeps no stance waiting in the port at all, under a
  flinch or not: research 251 D02's named gap, "a stance press during a standing still reload is not deferred".)
  *(2) The dive.* The full press dives in `FUN_00594cf0` itself: from a stand or a crouch with the press past 0.3,
  `FUN_00584b00` yes -> `FUN_0057e540` (D:L453387-453389) -- no gate. `FUN_00584b00` (D:L443977-444017) asks no flinch:
  not already diving (`FUN_00577e40` with `DAT_003def08`, "dive_to_prone"), `+0xeac`, the water (D:L443990-443992), no swap
  (`FUN_005a7980`, its list the swaps and the turret's take, D:L462492-462499), 30 a second (D:L443998) and
  `FUN_00589900` (D:L444001; D:L446425-446474), whose refusals are, each with its qualifier: the death's bit (`+0x1061` 0x20,
  only under `DAT_0045a0c1`, D:L446439-446440, written beside a push at posture 8, `FUN_00543f70` D:L410520-410535), a fall or a
  landing under `+0x1060`'s bit (D:L446441-446451), a top at posture 8 (D:L446453-446461; skipped at posture 10, or for
  `DAT_003deed0` / `DAT_003deed8`) and the slide (`DAT_003dead8`, D:L446464-446466); an empty stack answers yes
  (D:L446436-446437). The direct posture guard is at D:L460015 (the flinch is pushed only at a posture other than 8). The flinch's play carries the posture word as its
  `+0x2b` (`FUN_005a2690` D:L460019 passes `+0x174`; `FUN_00588bc0` -> `FUN_0028dc90` D:L446292; written D:L135204), never 8
  on a living body, so a flinch on top refuses no dive. **The port agrees** on the decision: the page's `setStance` and
  the room's `MoverSim.stance` try `Traversal.dive` before `changeStance`, and `canDive` has no flinch test (pinned:
  `doorClip.test.ts`, `roomDoorClip.test.ts` 'LATER 544 (pin)'). *They differ after it:* `FUN_0057e540` pops the whole
  stack before its pushes (D:L440882-440885, then `Prone` and the dive, D:L440896-440897) -- the flinch, and a door clip
  over it, go at the dive -- while the port's flinch slot (the page's `flinchCut`, the room's `flinchFrom` ..
  `flinchUntil`) runs on through the dive: it keeps refusing the reload (`flinching()`, the room's `reload` drop) -- which the original also refuses DURING the dive
  (`FUN_005a82e0` asks `FUN_005b4340(actor, 3)`, D:L462816, which answers 0 while the current type is the dive
  `DAT_003def08`, D:L469334-469335, D:L469541-469542), so for the dive's own span the two agree and the divergence is only
  the window's tail after the dive lands -- keeps
  OT.R67's pop out of the dive refused (`cancelDive` -> `stanceGate` -> `oneShotOnTop`; LATER 512c's review F1 assumed
  the flinch could be on top under a dive), and a door clip's window with it. Not small (the page's dive is predicted, the
  room's window is told a round trip later, as LATER 523-525 found for the turret's take): LATER 547. Beside it, not
  read then: a flinch pushed during a dive. *Read for LATER 547 (2026-10-27; reading, re-read by the LATER 547/548 readings review 2026-10-27):* **a flinch pushed during a dive is taken, and it ends the dive.** *The posture word:* `FUN_0057e540` pushes `Prone` and the dive with the play's posture word 2 (D:L440896-440897; stored as the play's `+0x2b`, `FUN_0028dc90` D:L135204) and sets the body's `+0x174` to 6 through its vtable +0x90 (D:L440898; the body's vtable 0x6691a0 is set at creation, D:L419421; that its slot +0x90 is `FUN_0058a6b0` is an inference backed by the decompilation, not re-read from the ELF here: `FUN_0058a6b0` (D:L446812-446825) is, besides the body init (D:L419566), the only caller of `FUN_0028dfb0` (D:L446823; D:L135230-135233), the only setter of `+0x174`, so it is the vtable target that writes the posture word, and research 251 (~2879) and research 202 section 2.4 already record the slot at 0x669230); no other writer of `+0x174` runs while the dive's play stays on top, bar the pop that precedes the flinch (below) (the pops' `FUN_005870e0` D:L445115-445147 and `FUN_00589aa0` D:L446527, the slide's `FUN_0054edf0` D:L417088-417100, the stance presses, the knock's landing `FUN_005af590`). *Bit 4 of `+0xe1`* is the alive bit (set at the node's construction, `FUN_0029ee10` D:L145030; cleared at the death, `FUN_00547af0` D:L413024 -> `FUN_0029e8b0` D:L144775; research 180 U8, cited and not re-read here: `FUN_00547af0`'s "at the death"): in `FUN_005a2690` it is a condition of the push (D:L460013), not a refusal of the dive. *So:* on a living, unmounted, diving body none of `FUN_005a2690`'s refusals (D:L459837-460010: the knock's fall `FUN_00588030`, the CQB and restraint types, postures 5, 8, 9 and 10, the swaps `FUN_005a7980`, the restrained and turret anim sets) names the dive `DAT_003def08` or posture 6; the dive's clip `seal_dive2prone` is a one-shot (the disc's `motion.rdr`, looped false: `packages/viewer/test/golden/motion-rdr.json`, reader `motionTable.ts`; the play's 0x40 is the motion's `+0x49` bit 6, D:L135187-135189; the action's clip, research 86 section 6.1; `DAT_003def08` = `seal_dive2prone` is cited from research 86 section 6.1 and not re-read here), so the one-shot branch runs (D:L460011-460012): the top's word 2 and the posture 6 are not 8 (D:L460013-460015), `FUN_0058a4d0(actor, 0)` pops the dive down to its `Prone` base (D:L460018; the pop stops at type 0x1a, D:L446762-446765) and the flinch is pushed (D:L460019) with posture word **2, not 6**, which `FUN_00589900` does not refuse (D:L446425-446474). The refusal tests at D:L460013-460015 run before the pop and still read the top's word 2 and the posture 6, so the verdict stands; but the pop (`FUN_0058a4d0` -> `FUN_00589aa0` -> `FUN_0028da00` on the stack at body+0x170, D:L446515) calls the stack's vtable +0x14 with the uncovered play's `+0x2b` (D:L135104), and the uncovered play is the `Prone` of `FUN_0057e540`, word 2 (D:L440896), so `+0x174` is 2 when D:L460019 reads it (the slot +0x14 writing `+0x174` as research 251 ~2877-2879 records it, an inference like the +0x90 above). *The terms LATER 549's review named, each read on a diving body:* `+0x5e1` bit 4 (`FUN_005a7980(actor, 1)`, D:L462482) is the kit's change flag (the kit at `+0x5e0`, set by a kit change, `FUN_005c50b0` D:L478992-479008, or by a pickup, `FUN_0059f0c0` D:L458293-458294; research 251) -- the dive starts only with it clear (`FUN_00584b00` asks `FUN_005a7980(actor, 1)`, D:L443995) and `FUN_0057e540` does not write it, so it refuses a flinch during a dive only when a kit change or a pickup comes during the dive, as it does anywhere (its clearers unread); `+0x528` against the restrained and turret sets `DAT_0044d400` / `DAT_0044d410` (D:L460010): the dive does not write it (no write in `FUN_0057e540`, D:L440870-440929); `+0xe1` bit 4 is set on a living body, the top's `+0x2b` is 2 and the posture 6, neither 8 (D:L460013-460015); and the dive's play is a one-shot (D:L460011), so the looped branch's base test (types 1, 0x12, 0x1a, D:L460033-460035) is not reached. The port takes the flinch (`flinchRefused` has no dive) and keeps the dive running (`Traversal.flinchPop` pops
  climbs only): LATER 547's divergence runs both ways. Unread: the dive's own state on that pop (D:L440899-440910)
  and the posture after the flinch ends (with the popped word 2, a reading of the same chain has `FUN_005870e0` write 2, prone, at D:L445145 and not take D:L445146-445147; the flinch's end itself unread).
  *(3) LATER 529's and 530's handed-back clips.* The original's take is refused before its steps (`FUN_005463c0`
  D:L412131-412166; the pop, `FUN_0058c350` D:L447983-447992, is in the take block), so the throw's or the reload's clip
  never left the stack: a one-shot there (looped 0), under which the gate keeps a request (D:L418927-418930). The page's
  refusal lays the mover's state after M - 1 back (`Walker.restoreState`, LATER 526) with its hold and its request, and
  re-runs the commands since through `MoverSim`, whose `retryStance` asks `bodyRefuses` on the hold: **the request waits
  under the handed-back hold**, as on the room's mover, which never took the body (pinned, the throw's and the reload's:
  `doorClip.test.ts` 'LATER 544 (pin) -- ... at a refused take'). *Found beside it:* the re-run does not ask the flinch's
  slot per command. `WalkMode.oneShotOnTop` reads the live slot at `taps + 1`, and the refusal lays the kept flinch back
  only after the re-run (`mountUntake`; the take had ended it, `endFlinch`), so a request kept under a flinch at the take
  is taken on the re-run's first command on the page while the room, whose window the refused take never cut, keeps it
  to the window's end (LATER 526's rig, now `doorClip.test.ts` 'RED: LATER 549 -- a crouch pressed 18 commands into a
  39-command flinch window, the take refused': the page crouched, the room's mover standing with the request pending, 18
  commands in, a 39-command window). Every `rerunFrom` (the dance's replay, the knock's) read the slot the same way.
  LATER 549, done 2026-10-27 (reading, re-read by the LATER 549 review 2026-10-27; its folds reading, pending review):
  inside a re-run `oneShotOnTop` answers for the command the sim runs (`MoverSim.seq`), as the room's mover on `sim.seq`;
  the refusal lays the kept flinch before the re-run and steps it on each command run again (its relogged `cutLog`
  entry), each event heard in the wait laid before its window's first command; the dance's and the knock's re-runs read
  each command's slot as `cutLog` last kept it. The review's
  folds: (F1) a flinch pushed at or after M, heard in the wait, no longer drops the flinch the take kept -- it is kept as
  heard and laid at its own first command, where its pop to the base (`FUN_005a2690` -> `FUN_0058a4d0`
  D:L460018-460019) replaced the room's, so a window open at the take and ending in the wait is still asked up to its end
  (`doorClip.test.ts` 'RED: LATER 549 review F1'); (F2) the laying inside the re-run pinned (its `rerunAt` record the fold's cover) and the knock's re-run
  slot pinned as a pin of 549's first change, not of the fold (it passes on 76f2c2fb6 too)
  with a walker, in LATER 526's rig ('LATER 549 review F2 (pin)'), LATER 530's pins named the path with no re-run;
  (F5) what the order changes beside the slot: a pushed event pops no climb (a program's push has none,
  D:L487256-487260), so laying a door push inside the re-run moves no body, but its cover (`flinchUnder`) now stands while
  the commands after its start run again, and a climb's start or a ladder's mount among them drops it (`stackPopped`), as
  the room's `moves.on` does -- the old order laid the push after them and kept it; a flinch pushed before M and heard in
  the wait is laid at M - 1 and pops a climb there (the room at its `cut.start - 1`): closer, not the room's (NU-1b's
  late-flinch gap). Left open, rows of their own: the knock's and the dance's re-runs relog and step no flinch (LATER
  551), the re-run's other per-command hooks read the live command (LATER 552), the mounted body's flinch (LATER 553).
- **LATER 551** (done 2026-10-27; reading, pending review; the row is on `agent/later-547-548-reads`): the knock's re-run
  (`replayKnock`) and the dance's (`replayVictory`, `stopVictoryMotionAfter`) now relog `cutLog` and step the flinch per
  command, as the room's mover ran them (`room.ts` `watchCut` after each command, `oneShotOnTop` on `sim.seq`). The page
  keeps the flinch after each command (`KeptCommand.flinch`, rewritten when an event heard later is replayed over it or a
  re-run steps it again) and what was laid between two commands (`flinchLaid`: a told window before its first command,
  the take's end at M, a death's, a refused take's hand-back); `rerunFrom` lays the one after `from` back, lays each of
  the others again before its command, and steps each relogged entry. A knock's fall then covers the window from the
  first command its body runs in the air inside it (PAR-71, `flinchCovered`: `FUN_005af930` D:L466956-466970), and the
  landing pops it with its clip or hands it back with the commands it had left (`flinchLanded`: `FUN_00589aa0`
  D:L466900-466901, `FUN_0028da00` D:L135104-135107). A Prone-cover knock ends the window at the knock, on the room and
  the page, since LATER 555 (done 2026-10-28; reading, pending review): the original pops the flinch on top
  (`FUN_0057e770` -> `FUN_0058a4d0(actor, 0)` D:L440997, which pops while depth > 1 and the top is not type 1/0x12/0x1a,
  Stand, Crouch, Prone: D:L446762-446768; a prone body pops again at D:L441003-441004 before Prone cover at
  D:L441017-441018), so the room's model pops it too -- `layKnock` cuts `flinchUntil` to `sim.seq + 1`, and the page's
  `knockPops` ends its flinch on the live knock and in `replayKnock`'s `between` (was: both kept the window to its end,
  `layKnock` clearing `flinchUnder` alone). Every knock `FUN_0057e770` lays reaches the pop; fall knocks are unaffected in
  the model (the fall's cover, then the landing's clip, pops the window either way). Held by `doorClip.test.ts` 'RED:
  LATER 555' (replayed and live, page against room per command) and `roomDoorClip.test.ts` 'RED: LATER 555'. LATER 549's
  "pin of the first change" asserted the old model; re-aimed, it holds a window told before a Prone cover knock from
  before it is heard (the told-entry order, as (b) below), so it still tells the per-command slot from the live one. A told window laid inside the re-run reads its cover from the re-run's body after the command before it
  (`setFlinchPose`'s `before`, PAR-65). A take standing keeps the flinch the knock's
  re-run steps to M - 1 (`takeKept`), so a knock heard in the wait at a < M - 1 is laid back on the refusal with the
  fall's cover (LATER 549's review F3, "the same family"). Held by `doorClip.test.ts` 'RED: LATER 551 (a)' (a knock
  replayed into an open window, the get-up over before its end: a crouch pressed after it taken at once, as the room's;
  was: kept to the window's end), '(b)' (a window handed back on the live run, a knock replayed from before the jump: the
  room's pop; was: the hand-back kept -- a pin of the told-entry mechanism, not a reachable order: LATER 551's review F3,
  the blast's `after` being the room's `sim.seq` at the blast and a push's first command its `sim.seq + 1`, so on one
  ordered stream a window starting after the knock's command is always told after the knock) and '(c)' (the take's case; was: the slot true from M, the room's false), page
  against room per command (stance and slot). Unread or not driven, said here: a knock's landing always carries a clip
  (`Walker.land`'s knocked branch, `FUN_005805b0`), so a knock's re-run hands nothing back by itself -- the hand-back
  direction comes from the dance's re-run (the room's jump where the page's dance refused it), which LATER 526's rig does
  not drive (a standing jump never leaves the floor, and the stick ends the dance on both): the dance's re-runs take the
  same path, pinned only by `victoryReplay.test.ts` still passing (a rig airborne under a dance: LATER 556); and a
  window's end a re-run changes is not told again to `./netPage`'s reload undo (`setFlinchPose`'s answer is not asked
  here; LATER 557). LATER 551's review folds (reading, pending review): F1 -- a flinch pushed before the take's M and
  heard after it (`setFlinchPose`'s popped branch, `mountRekey`'s re-judged events) replays `cutLog` and wrote the clamped
  window, still standing, into the flinch kept after each command from M; each is now rewritten with the ended flinch, so
  a knock's or a dance's re-run from a >= M lays none back (the room's take popped it at M: `FUN_0058c350` ->
  `FUN_0058a5e0(actor, 0, 1)` D:L447984, D:L446796-446798) -- rewritten rather than the replay bounded to M - 1, which
  would leave what an earlier judgement against an earlier M wrote there; F2 -- the room derives a push's cover at the push
  from its own flinch (`room.ts` `doorMotion`) and its knock drops it (`layKnock`), in the order the wire tells them: the
  told entries laid after `from` are laid ahead of `between` (the page's own entries there, a take's end, a death's, a
  refused take's hand-back, after it as before), and a told push's cover is read again from the re-run's flinch by
  `setFlinchPose`'s rule; F5 -- the stepped run is taken by every re-run that relogs without a flinch hook of its own,
  `mountUntake`'s too when the take kept no flinch (superseded), which now steps the flinch kept after M - 1 where it read
  `cutLog`'s slots (named in `rerunFrom`'s comment; not pinned). Held by `doorClip.test.ts` 'RED: LATER 551 review F1'
  (the take, the re-key) and 'RED: LATER 551 review F2 (i)', '(ii)'.
- **LATER 560** (2026-10-28; source inspection of the decompilation; the gameplay seat bf (redotcom-7c), its
  implementer; reading, pending review). *The question:* can a climb's start, a `Climb over` start or a ladder's mount
  begin while a flinch (or a door clip) is on top, in the original and in the port? Each pops the stack to its base --
  `FUN_00580b70` to one play standing and to two otherwise (D:L442186-442214), `FUN_00580a80` to one (D:L442151-442163),
  `FUN_0057f880` to one (D:L441547-441558) and the top mount `FUN_0057f690` to one (D:L441466-441477) -- and LATER 512b's
  (a)-(b) put the flinch above that base in every stance, so where the start is reachable the flinch goes with it.
  *The original: reachable, all three.* (1) *The driver.* Under a one-shot top (the play's `+0x28` bit 0x40 clear,
  D:L418119; the flinch's `looped` is 0, research 230 section 5.2) the ground driver `FUN_00550ef0` calls the start
  `FUN_005b4b40` on the controller's bit (D:L418121-418132), the jump taking it only when no contact is held and the
  jump request is set (D:L418123-418129). `FUN_005b4b40` asks no top: the jump request, the contact, the facing and the
  in-front test (D:L469594-469654), the controller's `+0x34` stub (D:L469655-469662). Under a flinch the start comes
  from the Action's release, not the jump's press (LATER 560's review, re-read 2026-10-28): the jump's press sets the
  jump request with the controller's bit (D:L453214-453215), and `FUN_005b4b40` only clears a request already set and
  returns (D:L469594-469596), while the Action's release sets the controller's bit alone (D:L452182-452183; research 313
  R313.3), which reaches the start. (2) *The offer* (research 313
  sections 1.2-1.3) that sets the climb's selection: on the ground the common gate `FUN_005a7de0(actor, 1, 0)`
  (from D:L462594: the postures, `+0x1060`'s bits, a top at posture 8, a throw or toss, the reload lock, a swap, `CQB
  attack` / `Stab` / `Apply restraints`, posture 9, the get-up, the second channel, the carry; with its third argument 0
  no `NoFire` is read, D:L462695-462696), then `FUN_005b4340(actor, 2)` (D:L469320-469334 for every code, D:L469404-469458
  for codes 2 to 7 and 8, D:L469466-469475 for code 2's prone and the launcher's and the turret's sets). None names a
  flinch: the flinch's motion flag 0x4 is code 3's test alone (D:L469494-469505), the reload's. The HUD's `+0xee0` timer
  (D:L452241) is written by `FUN_00597740` at a change of the controller's `+0x221` to 0 (D:L454344) and zeroed by the
  actor's initializer `FUN_00553ea0` (D:L419537), counted down by the driver (D:L418071-418072): not by the flinch's push. (3) *The start's
  own gates.* `FUN_005b2620` refuses postures 9 and 10 (D:L468349) and asks the anim set's six types (D:L468322-468347);
  by class it runs `FUN_00580b70` (D:L468435, D:L468489, D:L468500), `FUN_00580a80` for `Climb over` (D:L468485; refused
  only while `Climb over` plays, D:L442147), or for a ladder `FUN_0057f7d0` / `FUN_0057f9c0` (D:L468440-468449: `180` on
  top, the ladder's posture 5, and the push gate `FUN_00589900`, D:L441512-441519, D:L441593-441600; that gate's
  refusals are the death's bit, a top at posture 8, the knock's falls and landings and `Slide`, D:L446425-446474) and
  then the reservation's mount, `FUN_005b1c80` -> `FUN_0057f880` (D:L468189) or `FUN_0057f690` (D:L468218). No gate on
  the path asks for a flinch, so a press of Cross with the climb or the ladder selected starts it under the flinch and
  pops it. (Prone is refused by the offer, D:L469467: a prone flinch reaches no climb and no ladder.) *The port:
  reachable, all three.* The climb and `Climb over` start on the Action's command (`Traversal.step` -> `startClimb`)
  when `keepContact` holds a plan, and the plan's gate `climbOffered` (`CLIMB_OFFER_GATE_READING`) asks no flinch --
  `Walker.climbLock` is the room's `watchMoves` lock and the page's `climbLocked`, neither with a flinch term -- nor do
  the page's `action()` and `MoverSim`'s Action (the dance alone); LATER 512c's `oneShotOnTop` and `bodyRefuses` are the
  stance gate's, not the climb's. The ladder mounts on touch (`Traversal.touchLadder`: the stick toward the quad, no
  gate at all; the touch against the original's press is research 313 section 2.4's `LADDER_PRESS_READING`, a candidate
  not built): its stick cuts a flinch from `FLINCH_CUT_COMMANDS` past its push (`flinchCutAt`), so the ladder's case
  shows on a mount inside a flinch's first commands or under a door clip's `NoInterrupt` (its `cutFrom`), and a climb's
  for the whole window (the press needs no stick). So nothing is unreachable and no port gate refuses what the original
  allows. *The divergence and the fix (built, 73ac89fe7):* the room's `watchMoves` and the page's `stackPopped` cleared only the
  covered flinch (`flinchUnder`), so the window ran on -- its reload refusal ('flinch'), its stance slot, a door clip's
  slot. Now the room ends `flinchUntil` at `sim.seq` for the start or the mount heard inside command `sim.seq`'s run
  (`flinchAir` off; marked in `watchMoves` as `basePopAt`, laid after the command by `watchCut`'s `basePopCut`), and the
  page marks the pop (`stackPopped` 'climb' / 'ladder') on the command's `cutLog` entry (`pop`), whose step
  (`flinchLogStep` -> `basePopStep`) ends its window at the command the same way before the stick's cut is asked, then
  ends it (`endFlinch`) -- live, in the late-told replay of `setFlinchPose`, and in a stepped re-run (`rerunFrom` relogs
  the entry's `pop` from the re-run's own moves; a re-run that does not relog drops the mark: LATER 552's family; no
  caller today, all four pass `relog`). *The window's end at the command itself* (LATER 560's review F1, 2026-10-28; the
  first build ended it at `sim.seq + 1`): the frame order is read -- the pop comes in the driver's pass (`FUN_00550ef0`
  D:L418132), and the reload's flag 0x4 is asked after it, from the kit's frame `FUN_005c0fd0` that the actor's post-tick
  calls (D:L417907; research 230, PAR-67), as the stick's cut in the same pass (D:L418174-418190) ends the window at its
  own command (`flinchCut`: `flinchUntil = sim.seq`). So a reload named at the command is no longer the flinch's, page
  and room alike (was: the page took it, the room dropped it 'flinch'). The slot on the command itself stands: the
  stance is asked before the driver in the original (LATER 543's reading), and the port lays the end after the command,
  so a pending stance waits on it and is taken at the next (this holds for the mechanism pins; a real start owns the tick (`Walker.step60` returns on an owned tick before `retryStance`, mover.ts ~3228-3231; `startClimb`/`touchLadder` own it, traversal.ts ~1121/~1125/~1789), so `retryStance` waits for the climb's end; LATER 560's re-look). Held by `doorClip.test.ts` 'RED: LATER 560' (a real ladder
  mounted in the rig, told live and told late; a climb's start heard from the moves) page against room per command,
  'RED: LATER 560 review F1' (a ladder mounted on a flinch's second command, a reload the frame after: taken on the page,
  no drop at C by the room) and 'review F4' (a respawn's replay that mounts leaves no mark, `basePopped`), and
  `roomDoorClip.test.ts` 'RED: LATER 560' and 'review F1' (the real room). The climb pins (and the room's ladder one)
  are mechanism pins (the review's F3, as LATER 551 (b)): a real `startClimb` clears a standing body's pending crouch
  (`requestStance(null)`) and the climb's one-shot holds the stance (R313.6 / B3), so the crouch taken after the start
  never happens with a real climb. Open from the review: LATER 561 (`touchLadder` asks none of the offer's gates and
  mounts on the touch), LATER 562 (the reload on a ladder: refused by the original in state 5 / posture 5, not by the
  port), LATER 563 (a relogging re-run across a start inside a window, unpinned). Not read here: the kit's delay
  between a reload's press and its ask (research 313 section 5).

## 5. Checks

- `scene/test/aiCommands.test.ts` (2026-10-23): the `ai` names in `FUN_005de320`'s order; the ANIMATE's fields off the
  door's bytes and off a hand-edited copy (the offsets and the `blocking` bit); Frostfire's `singleDoor_right` `open`
  and `close` each MOVE, ANIMATE 63 for 0.25 s, then the valve, the sound and the swing.
- `test/doorClip.test.ts` (2026-10-23, Frostfire): the push one tick after the use (once, to the presser named), the
  valve, the sound and the swing 0.25 s after it; a wire-followed swing's actor `'wire'`; the clip the type names; the
  `DoorPage`'s own clip offline and none off the wire; a pushed motion on a remote body not dropped by the flinch's gate;
  the walk's reload gate not held by a pushed clip. `test/flinch.test.ts`: the `motion` event on another's body and on the
  own. `match/test/roomDoorClip.test.ts`: the room's `motion` to every page, once a use, after the ANIMATE's wait, none
  for a refused use.
- `test/doors.test.ts` (Frostfire): the three doors read; `bdoor_4` stops the SEAL shut, swings open on the action,
  refuses a second press mid-swing, lets the SEAL through, shuts on the next and stops it again; the sound and the
  drawn move, back to the identity when shut; the pick (on the leaf, not looking away, not past the range, `wdoor_2`
  from `hud.spec.ts`'s stand, not while swinging); the wire followed by a page.
- `test/doorPage.test.ts`: offline use, a match's `door` event and the snapshot-driven swing heard once, a spectator's
  press refused, a late joiner's silent catch-up.
- `test/worldDoors.test.ts`: `moveNode` on an own mesh and on one instance of a shared draw, and back.
- `central/test/room.test.ts`: the server's door on a synthetic map -- out of range refused, the swing's phase in the
  snapshots, open at rest, the leaf turned in the hull every mover reads.
- `test/netCodec.test.ts`: the doors on the wire, clamped, and the frame one byte longer without them.
- The survey of the 43 doors (every one swings and comes back) was a scratch script, not a test: the fixtures hold
  only MP2, MP6 and MP72.
- Owed: `e2e/doors.spec.ts` (X at `bdoor_4`, through, X again) and the full e2e (the HUD's prompt at `wdoor_2` is the
  pick now), in a browser window the host rule allows.

## 6. Not done

- The kick (`kick_door`, `FUN_005ec4e0`'s second animation): its conditions are read below and built by LATER 362b (the
  side's navigation record, LATER 362c, open). **LATER
  362** (2026-10-23, a playtester's observation relayed by the owner, on Sandstorm and Guidance; Requiem holds the
  animation too): the door can be kicked down instead -- a different clip (`animset.rdr`: `Kick open door` -> `seal_kickopendoor`, `Pistol kick open door` ->
  `seal_p_kickopendoor`), and the gun comes back up quicker after it (to be read: the kick clip's length and its
  ANIMATE's post-wait); holding X kicks, a tap opens -- `DAT_00650ae8` is 0.5 (the ELF's data at 0x650ae8), a hold
  threshold in seconds if the controller's +0x120 counts the action button's hold (its writer unread). Open with it:
  whether the game decides the use at the release or the threshold rather than at the press, which would make the open's
  own timing on a tap wait for the release (§4 runs it at the release, the action lifecycle's edge: below). Settled by decoding a `kick_door` program off the
  disc and reading the four conditions' sources.
  **Read 2026-10-27** (LATER 362's reading; source inspection of the decompilation and the ELF's data, the gameplay seat;
  reading, pending review):
  - *When.* The use runs at the action button's **release**: the player controller's update `FUN_00594cf0` (D:L453025)
    calls the controller's `vtbl[0x78]` = `FUN_00592d50` on Action's state 3 (D:L453222, D:L453243; research 86 §3.4),
    and state 3 is the pad's "first up" (`FUN_002d9ff0` D:L179137-179169: 0 rest, 1 first down, 2 held, 3 first up;
    research 230's input table). State 1 only marks the prompt (D:L453226-453238). The door branch is the request word's
    bit 0x2000 (`FUN_00592d50` D:L452003-452020): request 13, written every frame by the action prompt's list as its
    current prompt's kind (`FUN_0021d9d0` D:L73401, through `FUN_00544c80` D:L411185-411188) -- the prompt shown, not
    the press. The port already uses it there: `./actionContext` fires every one-shot context on the release edge (its
    header cites `FUN_00594cf0` D:L453194-453243), so §4's "press" is the use, at the release (*was* written here, the
    same day, as "early by the press's length" -- wrong, corrected on the second reading).
  - *The pick.* `FUN_00592d50` hands `FUN_002b44e0(action, actor, pick)` the pick `FUN_005ec4e0` answers (D:L452017-
    452018): the action's second animation (1) or its first (0). A bot's own use asks it with 1.0 (D:L502652).
  - *The float is the action button's smoothed pressure, not a held time.* `FUN_00594cf0` keeps the controller's
    `+0x120` as Action's pressure chased each frame at 3 a second rising and 1.5 falling (D:L453194-453203:
    `DAT_006505e0` 3.0, `DAT_006505d8` 1.5 off the ELF's data, the grenade power's rates, research 85 §2;
    `FUN_002c63f0(0, pad)` the pad's float for logical Action through the config's map, D:L166851-166865). At the
    release it is compared with `DAT_00650ae8` 0.5 (D:L500537), after the release frame's own falling step: chased once a
    game frame (`GAME_FRAME_DT` -- that `FUN_00594cf0` runs once a game frame is LATER 362b's review's assumption, read
    from its `dt` argument, not measured), a full press held 8 game frames (0.267 s) or longer kicks, a tap
    or a light press opens -- the playtester's "holding X kicks, a tap opens". A browser pad's button is on or off: a
    hold stands in for the full press, as Triangle's (`./gamepad` 'stance', `STANCE_HOLD_S_PLACEHOLDER`) -- here the
    rates are read, so the held commands chased as the throw's power is (`@s2u/scene` `stepThrowPower`) give the value.
  - *The other conditions* (`FUN_005ec4e0` D:L500521-500567): the action holds two animations or more (+8 >= 2: the loader
    appends an animation only when the map's `MZANIM.ZAR` holds it, `FUN_0026a250` D:L157381-157400 -- Chain Reaction's
    records name a kick its archive lacks, so they hold one and are always opened, LATER 362b's review F1); it is
    a door (+0x24 == 0); the actor's controller answers its `vtbl+0x2c` (the same call gates the prompt, `FUN_0021d9d0`
    D:L73317-73319) or the object its `vtbl+0x38` returns has `+0x264` bit 1; and the door's record in the navigation
    graph at 0x66a1b0 (`FUN_0052daa0` D:L397139, keyed by the action's +0x3c; the A* graph, research 189) is of kind 1
    with a zero sub-field, and the actor stands toward its direction nibble: `FUN_00518ae0` (D:L386202) takes the
    compass octant from the record's cell to the actor's, and `FUN_00519080` (D:L386449) answers 1 for the same octant,
    `DAT_0065ab38` for a neighbour, 0 two apart, negative beyond -- the kick is from one side, within an octant of its
    direction. **Unread:** the port has no reader of the disc's navigation graph (the bots build their own,
    `match/src/bots/buildNavigation.ts`), so the door records' kind and direction are not available yet; `vtbl+0x2c`'s
    and `+0x264`'s meanings (a player's controller answers the prompt's same call, so it is taken as true for a player).
  - *The maps and the kick's programs* (decoded 2026-10-27 off the disc through `readActionRecords`, `parseAnimSets` and
    `decodeEffectProgram`, every `MP*.ZDB`): two-animation doors are on MP73 Sandstorm (7, `singleDoor_left` +
    `kick_door`), MP82 Guidance (9, `singledoor_left` + `kick_Door_left`), MP83 Requiem (5, `singledoor_*` + `kick_Door`)
    and MP81 Chain Reaction (2, whose `kick_Door_left` / `kick_Door_right` are not in its `MZANIM.ZAR`: the kick is not
    run there, the swing is). Each kick program is an open with no close branch (its `IF` on the valve calls `open`
    alone): `ai::MOVE`, then `ai::ANIMATE` of type **284** (pre-wait 0; post-wait 0.65 on Sandstorm, 0.25 on Guidance and
    Requiem), the valve, `ai::EVENT`, its sound (Sandstorm `.DOOR_KICK`, Requiem `SND_WOODEN_DOOR_KICKED_OPEN`, Guidance
    the open's `.DOOR_METAL_OPN`), and its swing (`OBJECT_MOTION_FROM_TO` 0.3 s on Sandstorm, 0.35 s on Requiem, 1 s on
    Guidance, against the opens' 1 s; Requiem's `hq_door1` kick swings the leaf the other way from its open). The opens on
    these maps wait 0.65 s after their push, Frostfire's 0.25 s.
  - *Type 284 is "Kick open door"* [reading]: the ELF's static type table at 0x661060 holds 137 names (0-136; the
    138th pointer is 0), and the name is not in the ELF; `animset.rdr` (`READERC.ZAR`) lists 473 `type_name` entries
    whose names past those 137, numbered from 137 in first appearance, put `Kick open door` (-> `seal_kickopendoor`) at
    exactly 284 and `Pistol kick open door` (-> `seal_p_kickopendoor`) at 285 -- the registration is read off the data's
    consistency (284 exact), not traced in the lookup `FUN_005e3ff0` (D:L495984). Unlike the open (no `Pistol open
    door` in any set), the set holds the kick's pistol type, so with the pistol in the hand the pair swap plays
    `seal_p_kickopendoor` (`FUN_0058c820`, research 85 §8.1's rule).
  - *The kick's side, read* (LATER 362c's reading, 2026-10-27; source inspection of the decompilation, the ELF's data and the
    disc through `aiMapsFromZdb`; reading, pending review). The door's record in the graph at 0x66a1b0 is a sub-map
    **marker**: `FUN_0052daa0` (D:L397139) asks each sub-map's `FUN_00530bd0` (D:L398972), which walks the table at
    `+0x100` (counted at `+0xfc`) of 40-byte records -- the `AIMAPS.MPS` markers `scene/src/aimaps.ts` reads as
    `{ loc, word, flags }` -- for one whose word's bits 4-19 equal the action's `+0x3c`; `FUN_005ec4e0` then reads that
    record's direction (the word's low nibble), its kind (`(word >>> 16 & 0xfff) >> 7`, 1), a zero sub-field
    (`(word >>> 16 & 0x7f) >> 4`) and `flags` bit 0x10 clear. The octants: `FUN_00519130` (D:L386470) gives octant k's
    unit vector (0 = -z, 2 = +x, 4 = +z, 6 = -x, the odd ones the diagonals at `DAT_0065ab38`, set at run time to
    0x3f3504f3 = 0.7071, D:L565197 -- the ELF's file holds 0), `FUN_00518b60` (D:L386222) the octant nearest the
    actor-to-marker vector in cells (`FUN_00518ae0` D:L386202), and `FUN_00519080` (D:L386449) 1 for the same octant,
    0.7071 for a neighbour, 0 two apart, negative beyond, with no wrap (7 against 0 is -1).
    **But no marker is ever bound to a door.** Every kind-1 marker on the disc carries id 65535 (MP73 Sandstorm 6
    markers for 7 doors, MP82 Guidance 9 for 9, MP81 Chain Reaction 2 for 2, MP2 Frostfire 3 for 3; MP83 **Requiem
    holds none**); the map load writes every marker's id to `DAT_0065ab30` = 0xffff (D:L395962, the ELF's data) and the
    table's grow defaults a new record to the same (`FUN_0051c6d0` D:L388449); no other write of a marker's bits 4-19 is
    in the decompilation (the other `& 0xfff0000f | id << 4` writes, D:L144757, D:L152277, D:L410164, D:L473700, set
    HUD and message objects from `FUN_002a28f0`); and an action's `+0x3c` is the action list's count at its insertion
    (D:L157310, `DAT_00440c58`; no other write), never 0xffff. So the lookup never matches and `FUN_005ec4e0` answers 0
    for a player and a bot alike (D:L452017, D:L502652): **by this reading the original never kicks a door**. The
    markers of kind 1 are read elsewhere by their cell (`FUN_00530c60` D:L398997 from the path smoothing `FUN_00525810`
    D:L392683, with kinds 4 and 7): door cells a smoothed path keeps, not the kick's side. This contradicts the
    playtester's kicks on Sandstorm and Guidance (LATER 362, H344): either the reading misses a writer the
    decompilation does not show (a block copy of the records, a path through code Ghidra did not lift), or the kick
    the playtester remembers is another (an open's clip, a breach charge, a bot's). What settles it: a capture of the
    original on Sandstorm, X held over 0.3 s at each door from both sides (an H337-style ask; the owner's row). Under
    either reading Requiem's doors, with no markers, are never kicked. Until it is settled the port keeps 362b's kick
    with the side allowed (`KICK_SIDE_PLACEHOLDER`), the observed behaviour, and names the conflict (parity clause 7).
  - *The kick's clips* (LATER 362d's reading, 2026-10-27; `motion.rdr` in `READERC.ZAR` through `readMotionTable`, the keys
    through `parseMotionZar` on `RUN/MOTION_P.ZAR`; reading, pending review): both are on the disc.
    `seal_kickopendoor`: playback 1.7 s, 22 keys, `NoInterrupt` 0.38, no `NoFire`, a `seal_thud` callback at 0.32 s;
    `seal_p_kickopendoor`: playback 1.7 s, 43 keys, `NoInterrupt` 0.38, no `NoFire`, no callback. Against
    `seal_open_door`'s 0.8 s, 14 keys, `NoInterrupt` 0.5: the one-shot's end (PAR-58, `T x ((n - 1) / n)^2`) is
    1.55 s for the kick (1.62 s with the pistol) against the open's 0.69 s, and the stick may cut it from its
    `NoInterrupt` at 0.65 s (`0.38 x 1.7`) against the open's 0.40 s. **So the kick's clip is longer, not shorter**: the
    playtester's "the gun comes back up quicker" is not its length. What the room gates on the clip is what it gates
    on the open's, sized from these rows since 362b loads them (`DOOR_CLIPS` in `SIM_CLIPS`, `Room.doorMotion`): a
    one-shot on top refuses the jump to its end (D:L418119-418132), the stick cuts it from its `NoInterrupt`
    (D:L445550-445556), no reload is refused (the push sets no 0x4), nothing refuses a round (no `NoFire`). The
    ANIMATE's post-wait (0.65 s on Sandstorm's kick, 0.25 s on Guidance's and Requiem's; the opens' 0.65 s on all
    three) delays the program -- the valve, the sound, the swing -- not the body. What the playtester may have seen
    quicker: the leaf out of the way (Sandstorm's kick swings in 0.3 s, Requiem's in 0.35 s, the opens in 1 s; Guidance's
    kick 1 s like its open, with the post-wait 0.25 s against 0.65 s -- the swing begins 0.4 s sooner), or the pose
    itself (whether the kick keeps the weapon raised where the open lowers it is in the clips' parts, unread). Open:
    the clip's `seal_thud` callback (the port plays no door clip's callbacks); which of those the playtester meant (a
    question for the owner's playtester).
- ~~The set-2 commands of the door animations (AI notices by their payloads) are skipped: there is no AI in a round.~~
  **Corrected 2026-10-23** (§2): they are `ai::MOVE`, `ai::ANIMATE` and `ai::EVENT`; the ANIMATE's clip and wait are
  run (§4, "The presser's clip"), the MOVE's order on a pad-controlled SEAL is `DOOR_MOVE_ORDER_READING` (§7), the
  EVENT is an AI noise no round has an AI to hear.
- The climb's per-grid polygon caches (`./climb`) do not know a leaf moves; a door is not a climb (its top is 23 up).
- ~~The client does not predict its own door: the swing starts when the server's snapshot says so (a round trip).~~
  **Built 2026-11-02 (P7, the online-parity sweep's DMA-2; reading, pending review):** the page predicts its own press
  and the room's snapshot settles it -- `DOOR_PREDICT_ADAPTATION` (§7). The original's own client swings the door at
  the press: the button runs `FUN_002b44e0` on the pressing console (`FUN_00592d50`'s 0x2000 branch, 452002-452022;
  §1), which starts the animation there and only logs the use to the net (`FUN_002bb5b0`); the receiving side of that
  log is not read here. Left: the presser's `Open door` clip, still the room's `motion` event's, a round trip late,
  until the room sends the presser's own push as an echo the page can drop (the online lane's half of P7).

Done since (launch fix PL-5, B5): **a mark on a leaf swings with it.** The game files each kept triangle in the hit
visual's own decal list (`FUN_003b3800` 306396-306416; corrected 2026-10-24, LATER 277's review: `FUN_003b2ea0`
306133-306135, cited here before as the draw, is the LOADER -- one empty list head per part -- and no draw site of the
list is cited yet): the decal is node-local, by inference. The page hangs a mark clipped onto a moving node (a leaf) on that node
(`FireSource.attachToNode`, `fire.ts`), and takes it off when the pool drops it; the world's own node never moves. Pinned by `viewer/test/doorMarks.test.ts`.

Done since (LATER 277, 2026-10-24; reading, pending review): **a node switched off takes its marks and scorches.** Each is
held on its hit node (`WorldView.holdOnNode`), and `setNodeActive(path, false)` -- a pane broken, a bridge or a base
blown, a ghost door -- recycles those at or under it, both kinds freeing their pools' room (`FUN_003b36f0`
D:L306336-306342 frees a visual's marks and blasts together). Whether the original's switch removes them or only hides
the node is unread: `NODE_OFF_MARKS_READING` (§7). Unit tests only (`doorMarks.test.ts`); the bridge, the bomb site,
the ghost doors and Fish Hook's panes are not tested on map data, and Frostfire's pane check waits on LATER 413.

Done since (OBF-22, 2026-10-30; reading, pending review): **a mark is its scene node's, not its model's.** The game marks
the hit node's own visuals (`FUN_003139e0` D:L213931-213935) and files each kept triangle in that visual's list
(`FUN_003b3800` D:L306396-306416); a node's lists go with its children's (`FUN_00313620` D:L213798-213827). The port's
clip keyed a prop's node by its model name and place (`markClip.ts` `entryOf`), so the placements one model draws at one
place were one node and a mark took whichever path was indexed last: Frostfire's `door1` draws the door's root, its
`door_slab` and its `pane1` at one place (a pane's mark was filed on the root, and stayed in the air when the pane broke),
and Desert Glory's crates draw `parts_good/visual`, `/shadow` and `/dinode` so (a crate's mark filed on its shadow).
Now a placement's scene path and place are its node; and a world chunk the world's state switches (MAP-02's
`switchPath`, Desert Glory's `access1/good_parts`) is its switch path's, where before it was the world's and held on
nothing. On the maps (the MP2 and MP6 fixtures): a mark square on each pane, three crates and the chunk reports its own
path (`markNodes.test.ts`, RED first). Crossroads' bridges (`seal_demo_1/arch=arch/healthy`) and bases
(`crates_hospital=crates_hospital/healthy`) are props with their own paths. The switch itself (vtable `+0x38`) writes only
the node's active bit (research 183 §19), so the original frees no decal at the switch: `NODE_OFF_MARKS_READING` (§7).
A known edge (OBF-22's review, 2026-10-30; low risk): a world chunk's mark reports its switch path, and `attachToNode`
binds a mark to any movable with that exact path -- so were a prop ever to share a switched chunk's exact path, a mark on
the chunk would ride the prop's moves. None is known: MP72 has no switched world chunk, and MP2's (`fan1/*`) and MP6's
(`access1/*`, the sky dome's flashes) were not checked against every prop path -- a check for when one is suspected.

## 7. Readings (named in the code, 2026-09-30)

| name | value | the game |
|---|---|---|
| `PICK_TIE_READING` (`doors.ts` `pickDoor`) | 0.05 unit along the view | a leaf flush with its frame's wall meets the view where the wall's edge does (Frostfire's `wdoor_2` and `warehouse/wintdi`, both at 20.0 along), so a hit within this of the first goes to the door; the reticle pick's own tie rule (`FUN_005aa240`) is not traced |
| `NODE_OFF_MARKS_READING` (`world.ts`; LATER 277, 2026-10-24) | `'removed'` | a node switched off (`setNodeActive`) recycles the marks and scorches filed on it, both pools' room freed. The original can free a node's decals (`FUN_003b36f0` D:L306328-306347, both kinds together; `FUN_00313620` D:L213798-213827 for a node and its children; callers the round's clears and `FUN_00315e70`), but the switch (`FUN_00263aa0` D:L111355-111369) calls vtable `+0x38`, which writes only the node's `+0x5c` bit 0 (research 183 §19, `FUN_001ec450` / `FUN_00312a70` from the disassembly; OBF-22, 2026-10-30): the switch frees no decal, and whether an inactive node's list is drawn is unread -- if not, the port departs only in the pool's room and a node switched back on mid-round (LATER 589). Settles: the decal list's draw site (whether it runs for an inactive node), or a capture of a node switched off and on in one round; reading, pending review |
| `DOOR_PREDICT_ADAPTATION` (`doors.ts` `DoorSet.predict` / `applyWire`, `doorPage.ts` `action`; P7, 2026-11-02; a network adaptation, reading, pending review) | `'predicted'` | no original value: the original runs a use on the pressing console (`FUN_002b44e0` from `FUN_00592d50`'s 0x2000 branch, §1; logged by `FUN_002bb5b0`), the port's room is the authority a round trip away. The page runs its own press at once -- the valve, the sound, the leaf drawn and its polygons in the page's hull -- in the room's order (the use between the press's command and the next; the door's step after the walker's tick, `main.ts`'s frame as `Room.step`; the presser not moved, `DOOR_MOVE_ORDER_READING`), so the page's leaf stands where the room's stands one up-link delay later (DOOR-PIN's 1.5 u disagreement in a swing was the round trip; `doorPage.test.ts` against `LoopbackMatch`'s `delayMs`, `LOOPBACK_DELAY_ADAPTATION`). The snapshot settles it: a swing begun there, or its valve changed at rest, is this run (never run again, the room's `doorUse` pick taken as this run's); a snapshot acking a command past the press's (`NetClient.acked`) with the door at rest on its old valve is a refusal, run back at once and silently (the valves the run set and the leaf's rotation as before); so is one with no own body (the review's F1: a dead seat's snapshot carries none, and `Room.useDoor` refuses a dead presser); a swing the room told (`doorUse`) with another pick than this press's is another's press, so this one is run back and that swing followed with its pick (the review's F2: an open and a kick turn a leaf different ways). The "one ordered socket" the ack rule rests on (the `door` event after its command, before the next) holds for the real transport; `NetClient`'s `simulate` injector (`?lag=` with jitter, a development instrument) can let a command overtake the event, so one snap-back is possible there (the review's F3). Costs: a refused press was heard opening; a second press while the first waits for the room is sent unpredicted. Not predicted: the presser's clip (the room's `motion`, actor `'wire'`), until the room echoes the presser's own push. Retired as a gap by P7: §6's "the client does not predict its own door" |
| `LOOPBACK_DELAY_ADAPTATION` (`loopback.ts` `LoopbackOptions.delayMs`; P7 374b309bec, taken by DOOR-RESET 6bf6340cf6, 2026-11-02; a browser/network adaptation with no original) | `'delayMs'` | no original value: the test room's loopback match holds each up-link and down-link message `delayMs` so a page and its room disagree by a round trip as an online pair does; `doorRoundReset.test.ts` uses it to show the page's doors reset with the room's after a round start (HOTFIX DOOR-RESET). A test instrument: it adds nothing to the game's own behaviour. |
| `DOOR_MOVE_ORDER_READING` (`doors.ts`; 2026-10-23) | `'not run'` | the door program's `ai::MOVE` writes a goal 18 units from the door's node, facing it, on the presser's navigation object (`FUN_0056daa0` / `FUN_0056d920` on actor `+0xc0`, D:L488972-488977; §2), and blocks the sequence while that object walks when it answers (D:L488983-488989, D:L488702-488714); whether a pad-controlled SEAL's walk reads that goal, or only an AI controller does, is not read, so the port moves no body and takes no time for it. Settles it: a capture of the original's SEAL pressed at a door from off its axis |
| `KICK_DOOR_TYPE_READING` (`doors.ts`; LATER 362, 2026-10-27; reading, pending review) | 284 | the anim type every kick program's `ai::ANIMATE` pushes, `Kick open door` (-> `seal_kickopendoor`; the pistol's pair `seal_p_kickopendoor`): past the ELF's 137 static names (0x661060) the types are `animset.rdr`'s `type_name`s numbered from 137 in first appearance, which puts it at exactly 284 (`Pistol kick open door` 285) -- the data's consistency, not the registration in `FUN_005e3ff0` (D:L495984), which settles it (section 6) |
| `KICK_SIDE_PLACEHOLDER` (`doors.ts` `doorPick`; LATER 362, 2026-10-27) | `'allow'` | `FUN_005ec4e0` kicks only from within an octant of the door's navigation record's direction (the graph at 0x66a1b0, `FUN_0052daa0` D:L397139, kind 1; `FUN_00518ae0` D:L386202, `FUN_00519080` D:L386449 > 0); LATER 362c's reading (section 6): the door's record is an `AIMAPS` marker the load binds to no door (every id 0xffff, D:L395962), so by the decompilation the lookup never matches and the original never kicks -- against the playtester's kicks; the kick is allowed from any side meanwhile, the observed behaviour (parity clause 7), until a capture of the original on Sandstorm settles it |
