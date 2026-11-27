# 436 -- A sky a scene program holds at the camera (LATER 951)

- Date: 2026-11-15. Branch `agent/wm-effects-sky` (worktree `wt-wm-effects-sky`), base `origin/agent/next`
  fe5e110f94; the weekend mega sprint's effects lane, at the main controller's word (15:30Z), from LATER 951.
- Track: simulation (what the game draws). Status: **reading, pending review** -- section 1 is transcribed from the r0001
  decompilation (`socom2_game.elf.decomp.c`, cited `FUN_<addr>` and `D:L<line>`, never pasted) by the author; a fresh
  reviewer who re-reads it at the source is owed (section 7). **Nothing here is measured on the original running.**
- Evidence kinds, kept apart: **(D)** source inspection of the decompilation; **(M)** the disc's data through the
  repository's readers (`test/skyFollow.devdisc.test.ts`, which reads `SOCOM_DISC` and skips without it); **(U)** unit
  tests of the port (`test/skyFollow.test.ts`); **(O)** the original running -- none; **(B)** a rendered browser run --
  owed (section 5).
- New names: `CAMERA_NODE_READING`, `SCENE_TRANSLATE_TICK_ORDER_READING`, `SCENE_TRANSLATE_OFFSET_FRAME_READING` (LATER 1183; was `_PLACEHOLDER`)
  (section 6). Narrowed: `SCENE_NODE_TRANSFORM_PLACEHOLDER` (research 237 s6) -- `OBJECT_TRANSLATE_STATE` at the camera
  leaves it; its other cases stay. Unchanged: `SCENE_SOUND_CAMERA_NODE_PLACEHOLDER` (a sound at such a node still plays
  unplaced; LATER 894 is its owed build).

## 0. The answer

1. **The original stands each of these skies at the camera every tick** (D; section 1): a looped autostart's
   `OBJECT_TRANSLATE_STATE` (command 18) whose reference node is `camera` sets the sky node's translation to the camera's
   world place (plus the command's vector, where it has one), an axis kept where flag 0x10 says so.
2. **The port ran nothing** (`worldState.ts`: `case 'translate': ... return`): every such sky stood where the map placed
   it, so walking toward its edge, or far from the map's middle, showed a dome off-centre, its rim or its seam.
3. **Which maps** (M; section 3): 26 commands on 13 multiplayer maps (MP6, MP8, MP9, MP12, MP51, MP52, MP53, MP71, MP72,
   MP73, MP81, MP82, MP83) and 8 campaign maps (M51, M52, M53, M62, M63, M71, M72, M81) -- the row's list, confirmed.
   Not only domes: MP52's dust and M52's rain follow the camera the same way, and MP73's flashes, MP53's sun, M71's
   moon reflection and MP8's stars.
4. **The fix, for every map** (U): the page tells the world the camera's place each frame; the world runs the command
   when its reference is the camera; the drawing moves the node's placements by the change from their rest -- a prop by
   `WorldView.moveNode` as a door's leaf is moved, a world chunk drawn apart for it (`LoadedMesh.movePath`) and moved
   the same way. No map is named in the code.

## 1. The tick, read (D)

`FUN_00263890` (D:L111263-111350) is command 18's tick:

- D:L111288-111289: the target (+6) and the reference (+7) from the run's node slots (`FUN_0026f4e0(.., 0)`: with its
  third argument 0 it only reads the slot, D:L118145ff; the lookup happened at the run's start).
- With a target (D:L111290): a vector `v` = 0. Flag 4 (D:L111302-111307): `v` = the target's own translation (+0x30,
  +0x34, +0x38) + the record's vector (+8), by `FUN_00309240` (D:L207508-207515, a three-float add). Otherwise flag 1
  (D:L111297-111300): `v` = 0 + the vector. Flag 2 (D:L111309-111328): `v` += the place of the context's type-5 entry
  (`FUN_00272720(ctx, 5)`) when there is one; with none, nothing is added and the tick goes on.
- D:L111329-111332: with a reference, `FUN_00310980(ref, &v)` (D:L212139-212147): for the node and each parent (+0x64)
  up to a node of type 6, `FUN_00308640(node, v, 1)` (D:L206996-207030), a full 4x4 point transform by the node's own
  matrix. So `v` becomes the point `v` in the reference's frame, carried to the world. With no reference and nothing
  set, nothing is written.
- D:L111333-111345: the new translation is `v` on each axis, except where flag 8 (X), 0x10 (Y) or 0x20 (Z) keeps the
  target's own; `FUN_003157d0` (called at D:L111346; D:L215063-215074) writes +0x30..+0x38, calls the node's update and marks it changed
  (+0xa1 bit 1).
- It returns 1 on every path: the command ends in the tick it runs. The programs loop it (an endless `LOOP`), which the
  port's runner runs once a tick (`effectRunner.ts`, `case 'loop'`).

**The camera** (`CAMERA_NODE_READING`): the world makes its camera object (`FUN_0031fd20` D:L221095-221122: a 0x570-byte
object kept at the world's +0x128 and in `DAT_004b4810`) and names it `camera` (`FUN_00314ee0` D:L214567ff writes the
name at +0x90; the string at 0x3f6e70). At the level's start the camera is placed (`FUN_001f4860`, D:L54811-54817).
The scene's name lookup, `FUN_00269230` (D:L114366-114405), compares the world's own name, then calls the world's
find-by-name (vtable +0x24), then walks the other roots at +0x6ba0. Read elsewhere: the camera's +0x30 is the eye's place
(D:L307417-307419). Not read: that the world's find-by-name reaches the object at +0x128.

**The vector's frame** (`SCENE_TRANSLATE_OFFSET_FRAME_READING`, LATER 1183): through `FUN_00308640` the vector turns with the
camera node's 3x3. **Read since (LATER 1172, 2026-11-18, section 8; reading, pending review):** that 3x3 is the view's
whole turn, yaw and pitch -- the game builds its view matrix from it every frame -- with the node's local -Z ahead and
+Y up, as a three.js camera's world matrix. So the original's frame is `'cameraTurn'`; the port still adds the vector
unturned (`'cameraPositionOnly'`) until LATER 1183 changes what MP81's and M72's sky planes do (a player-visible
change of its own, not LATER 1172's).

## 2. The port before (U)

`WorldState`'s host (`worldState.ts`) returned at `case 'translate'` (SCENE_NODE_TRANSFORM_PLACEHOLDER, research 237 s6).
`cameraFollowers` already found these nodes from the data, for the sound rule only. The effect runner (`effects.ts`)
runs command 18 on an effect's own nodes (the muzzle, a hit), not on map nodes, and is not changed here.

## 3. The disc (M)

Every `RUN/M*.ZDB` and `RUN/MP*.ZDB`'s `MZANIM.ZAR`, every program decoded (`@s2u/scene` `decodeEffectProgram`, command
18 at +4 flags, +6 node, +7 reference, +8 vector -- the tick's offsets above). Held by `test/skyFollow.devdisc.test.ts`:

| Map | Program | Node | Flags | Vector | Drawn as |
| --- | --- | --- | --- | --- | --- |
| MP6, MP71, MP83 | `translate_sky` | `mp6_skydome` / `skydome` | 0 | -- | world chunks; MP71's sun under its dome a facade prop (`worldmodel/skydome/flare`) |
| MP8 | `translate_sky` | `skydome`, `stars` | 0x10 | -- | world chunks |
| MP9, MP12 | `translate_sky` | `sky` | 0x10 | -- | world chunks |
| MP51 | `translate_sky` | `mp51_skydome` | 0 | -- | world chunks |
| MP52 | `translate_dustfollow` | `mp52_dustfollow` | 0 | -- | prop |
| MP53 | `translate_sky` | `sky`, `thesun` | 0x10 | -- | `sky`: nothing drawn; `thesun`: a facade prop (`worldmodel/thesun/flare`, `sunglow.tif`) |
| MP72 | `translate_sky` | `mp72_sky`, `dust` | 0x10 | -- | nothing drawn under either name |
| MP73 | `translate_sky` | `skydome`, `flashes` | 0x10 | -- | world chunks |
| MP81 | `translate_sky` | `skyplane` | 1 | (0, -220, 0) | prop (`sky_follow`) |
| MP82 | `move_sky` | `sky` | 0 | -- | world chunks |
| M51, M53 | `translate_sky` | `sky` | 0 | -- | prop |
| M52 | `translate_rainfollow` | `m52_rain_follow` | 0 | -- | prop |
| M62 | `translate_sky` | `horizon` | 0x10 | -- | prop (`sky`) |
| M63 | `translate_sky` | `skydome` | 0 | -- | world chunk |
| M71 | `translate_sky` | `skydome`, `moonreflect` | 0x10 | -- | world chunks |
| M72 | `translate_sky` | `sky_m72` | 1 | (0, 550, 0) | prop |
| M81 | `translate_sky` | `skydome` | 0x10 | -- | world chunk |

Every one is in a looped autostart (program flags 0x21). None sets flag 2 or flag 4; only MP81 and M72 carry a vector.
"Drawn as" is the port's placement of the node's visuals (`placeInstances`: under `worldmodel`, a world chunk; another
model, a prop). Other command-18 uses on map nodes, NOT taken up here (section 6): M61's `reset_blinds` and
`down_blinds` (no reference, flag 1, the blinds' `blind_cinema` props), M52's `m52obj5..8` (references
`savestate01..03`), M61's own `translate_sky` (reference `player`, flags 0) and the campaign's orbit and crane cameras
(their nodes not placed).

## 4. The build (U)

- `MapMeta.motion.translated` (`mapMeta.ts`): every placement of a node a program's command 18 holds at the camera,
  framed (`motion.frames`, its own and world matrices).
- `LoadedMesh.movePath` (`loadMap.ts`): a world chunk under such a node, the deepest such path; the merge keeps those
  chunks apart by it (as `switchPath` and `scrollPath` do) and the level pieces leave them in the disc's draw.
- `WorldView` (`world.ts`): those chunks join `moveNode`'s list, their base the identity (their vertices are already in
  world space), so `moveNode(path, delta)` carries them as it carries a prop. A facade placement under such a node -- a
  world-model node with facade bits goes to the facade props (`loadMap.ts` `place`): MP53's and MP71's suns -- joins it
  too, as a crane's facade does (the fresh review's F1: without it MP71's dome slid away from its own sun, and MP53's sun
  stood still). Every other prop placement was already in the list.
- `WorldState` (`worldState.ts`): `setCamera(eye)` each frame; `translateTick` runs the tick when the reference is the
  camera -- flag 4's sum or flag 1's vector (or none), plus the camera's place, the kept axes -- keeps the translation
  (`nodeTranslation`) and hands the drawing the change from rest through the node's frame (`WorldHooks.translate`).
- The pages (`main.ts`, `matchMount.ts`, `matchWorld.ts`): the camera's place set before the world's step; the hook
  wired to `moveNode`.

Not changed: a placed node's other transforms (rotate, from-to flights), any other reference, the effect runner's own
command 18, the sound rule, any value of the disc's.

Left open: **MP72's and MP53's sky draw nothing in the port** (M; section 3) -- a gap of its own, not this build's.
Sandstorm's sibling MP72 holds `mp72_sky` and `dust` at the camera, and MP53 holds `sky` (beside `thesun`, which is
drawn), but no placement the port draws (`placeInstances`) lies under any of those three names: the port shows no sky
there at all, standing or following. Whether the disc's scene graph gives those nodes visuals the port's walk drops, or
the original draws their sky otherwise, is not read (note only; LATER 951's remainder). Settled by a read of those
nodes in `MP72_GEO.ZED` and `MP53_GEO.ZED` and a frame of either map's sky.

Also left open: a sky drawn in the alpha pass is keyed by its rest centroid (`Drawn.centre`), not where it stands; a dome
around the camera is drawn by that key as it was at rest. Not observed; settled by a rendered run (section 5).

## 5. Owed

- (B) a rendered run on Shadow PC 3's GPU: Desert Glory (MP6) from two places far apart, the dome centred over the
  camera at both, with screenshots; and one prop sky (M72 or MP81).
- (U) the viewer suite whole and the workspace typecheck, by box through the main controller.
- (O) "proven" would need a capture of the original's sky from two camera places (Shadow PC 1's rig).

## 6. Placeholders and readings

| Name | Value | What it stands for | What settles it |
| --- | --- | --- | --- |
| `CAMERA_NODE_READING` | `'theGameCamera'` | A program's node `camera` is the game's camera object (`FUN_0031fd20` names it; `FUN_00269230` searches the world by name); the page's camera place is taken for it. Reading, pending review. | A read of the world's find-by-name (its vtable +0x24) reaching +0x128. |
| `SCENE_TRANSLATE_TICK_ORDER_READING` | `'cameraOfThisFrame'` | The page sets the camera before the world's step each frame, so a sky stands at this frame's eye; the game's order of the scene tick against the camera's update is not read. Reading, pending review. | A read of the frame loop's order, or a capture of a sky's seam while the camera moves fast. |
| `SCENE_TRANSLATE_OFFSET_FRAME_READING` | `'cameraTurn'` | LATER 1183: MP81's (0, -220, 0) and M72's (0, 550, 0) are turned by the camera's 3x3 -- the view's whole turn (section 8: `FUN_00294070` builds the view from it; PC 1's capture logged it pitching with the view) -- and added at the eye; the page hands its camera's matrix (`WorldState.setCamera(eye, matrixWorld)`). Only the translation is written: the plane slides and rises, never tilts. PROVEN (a memory read of the original, section 8): reviewed (PASS WITH FINDINGS, high, `reviews/later-1183-review-0cdc14203b.md`), then measured -- the original's skyplane node stands at eye - 220 x the camera's row 1 within 0.002 u at three pitches. | Settled. The camera's parent (+0x64) read 0 at every pose, so its own matrix is its world matrix (the dependency the review named). |
| Flag 2 at the camera | -- | *note only*: the context's type-5 place is added when the run has that entry (D:L111309-111328); the port's world runs give none -- whether an autostart's run has one in the game is not read -- so the port adds nothing and goes on, as the game does with no entry (D:L111315). No disc command at the camera sets the flag (section 3). | A read of which runs give an autostart a type-5 entry, if a map ever sets it. |
| MP72's and MP53's sky drawn nowhere | -- | *note only*: `mp72_sky`, `dust` (MP72) and `sky` (MP53) are held at the camera by the data, but no placement the port draws lies under them (section 4, "Left open"). | A read of those nodes' visuals in the maps' scene graphs, and a frame of either map's sky. |
| `SCENE_NODE_TRANSFORM_PLACEHOLDER` | `'drawsNothing'` | Narrowed (research 237 s6 holds its row): command 18 at the camera leaves it; M61's blinds, M52's objective items, M61's `player`-referenced sky, rotations and flights stay. | As research 237 s6 says, for what stays. |

## 7. Reviews

- The fresh review of this task (a reviewer agent of this lane, at 071d7c8061, 2026-11-15 about 15:50Z; source
  inspection only, nothing run): **FAIL** on F1 (a facade sun under a held node never moved: MP71's sun left behind by
  its dome, MP53's sun still), with F2 (the tick's inner line numbers off by 2-6, corrected above), F3 (flag 2 dropped the
  whole command where the game goes on; now followed), F4 and F5 (stale comment, a JSDoc misplaced). Every other
  citation held at the source. All folded in the next commit; the re-review of the fold is owed.

## 8. The camera node's 3x3, and a particle source's spawn box (LATER 1172, 2026-11-18)

Branch `agent/later-1172`, base `origin/agent/next` a909613646; the weather seat, at the main controller's word (X5:
the owner's "sparse rain on Ruins", snow on Blizzard). Simulation track. **Reading, pending review** (D) by the author;
(U) `packages/viewer/test/particlesSpawnBox.test.ts`; (O) none yet -- Shadow PC 1's capture of Ruins and Blizzard,
level, down and up (`evidence/bugs-2026-11-18/x5-weather-capture/`), is the owed comparison.

**The camera node's 3x3** (D). `FUN_00294070` (called from the frame loop at D:L50817 with the camera `DAT_00488de8`;
also at the level's start, D:L54814) copies the camera node's row 0 (+0x00) to +0x2f0 (`FUN_001bfeb0`), writes -row 1
and -row 2 (+0x10, +0x20; `FUN_001bfe68` by -1.0) to +0x300 and +0x310, the eye (+0x30) to +0x320, inverts that in place
(`FUN_001bfd48`) and multiplies it by its projections into the draw's matrices (`FUN_001bfc30`, the `+0x3f0` packet's +0x20
and +0x60). It turns the frustum's normals (+0x420..+0x46c, the near one local (0, 0, -1)) by the same node matrix
(`FUN_001bfc00`). So the view is the inverse of the node's matrix, Y and Z flipped to the screen's axes: the node's 3x3
is the view's whole turn, its local -Z ahead and +Y up. A vector carried by it (`FUN_003085c0`: x row 0 + y row 1 +
z row 2 + row 3) is the same point a three.js camera's `matrixWorld` gives -- which is what the port's particles already
did with the offset.

**A source's spawn box** (D). `FUN_00329b40`: with a node at +0x50, `FUN_003109f0` (D:L212153ff) builds the node's world
matrix (its parents at +100 up to the type-6 root) and `FUN_003085c0` carries the source's offset (+0x54) through it
(D:L226869-226877); the tick's end keeps the result as the place (+4..+0xc, D:L227152-227156). Each particle spawns at
the place plus a uniform draw in [+0x60, +0x64], [+0x68, +0x6c], [+0x70, +0x74] on the world's x, y, z, plus the tick's
sub-step share of the source's move (D:L227084-227100). No matrix touches the box (copied from the command's +0x50..+0x64
by `FUN_00266830` D:L113141-113155).

**The port before** (U, red kept): `ParticleSystem.spawn` carried the place AND the box through the followed node's
matrix, so the box turned with the camera's yaw and pitch: MP12's `rain_falling1` (box +-70 / +-10 / +-70) at 15 deg
down spread +-28 instead of +-10 vertically, the half ahead spawning ~18 lower, under the floor for most of its fall.
The red: 10 of 11 cases failed (every pitch, both sources; even level, the 35 deg yaw turned the box on x and z).
**After:** the place through the node's matrix (`placeOf`), the box added on the world's axes -- every source that follows
its node, on every map (the rule is the source's, not a map's). The context's random position block (`positionBlock`)
is added to the offset before the node's matrix, as the game adds +0xc4's block into the offset before it stores +0x54,
and only when a place was set (D:L112933-112946; the review's re-read) -- the port already matches.

**Left open (note only):** (a) the sub-step place. The game spawns from +4 while it still holds the LAST tick's place
(the new one is stored at D:L227152) and adds `fVar13` times the source's move per tick plus its velocity terms
(D:L226886-226888, D:L227094-227099); the port spawns from this tick's place and adds the particle's `velocity * sub`
only, with no share of the source's move. A camera moving within a tick puts the port's later sub-step drops up to one
tick's camera travel ahead of the game's -- small beside a +-70 box; older than this task; unchanged here. (b) The
particle tick carries the offset by `FUN_003109f0`'s WORLD matrix (the node's own times its parents' at +100), while
`FUN_00294070` builds the view from the camera object's OWN matrix; they are the same 3x3 only if the camera's parent
is the type-6 root or none, which is not read -- the "view's whole turn" reading for the particles rests on it.
(c) That `FUN_001ebed0`, `FUN_00294070`'s caller at D:L50817, runs every frame is inferred (it takes the frame's dt and
draws; no direct caller in the decompilation, a pointer call).

**What it does and does not settle.** The offset still turns with the view (the original's too): looking 45 deg down,
MP12's rain place is 10.6 below the eye, so the count of drops on screen looking down need not equal level's in the
original either; the capture decides the counts. Blizzard's snow is sparse in the disc's own numbers (~58 alive).

**The original running (O), PC 1's capture, 2026-11-18 05:52-06:51Z** (shadow-relay-1; PCSX2 r0004, online through our
local server, no memory writes, inputs as posted keys; `evidence/bugs-2026-11-18/x5-weather-capture/`, NOTE.md and
summary.csv; agent-mail, not this repository). Two findings:
- *The camera's 3x3 carries the view's pitch.* The camera object (r0004: `*(*(0x45f750)+0x128)`, r0001's world+0x128)
  read every game-clock value: at level its row 2 is (0, 0.03, -1.00) and its row 1 (0, 1.00, 0.03); pitched down to the
  70-degree clamp, row 2 (0, 0.94, -0.34) and row 1 (0, 0.34, 0.94); up 58 degrees, row 2 (-0.02, -0.85, -0.53). So the
  matrix the offset goes through turns with the view's pitch, rows as the camera's axes, -Z ahead -- measured on one
  build (r0004) and three poses at four spawns; the yaw part is consistent (Blizzard A faces +z: row 0 (-1, 0, 0)).
  Not yet a value-for-value comparison against the page's camera at the same pose (the comparison job below).
- *The original's own precipitation thins looking down.* Visible moving drops per frame (`count_drops.py`: blobs of
  frame-to-frame brightening, >= 2 px, HUD / minimap / soldier masked; a count of drops on screen, not the engine's
  particle count), LEVEL / DOWN (70 degrees) / UP (58-60 degrees): The Ruins, SEAL spawn 19.1 / 1.5 / 11.8; Blizzard
  spawn A 18.9 / 0 / 10.3; spawn B 23.2 / 0 / 13.8 (the Ruins terrorist spawn is under a roof: 0.1 / 0 / 0, not
  evidence). This is what the reading predicts: the place pitches with the view (at 70 degrees down MP12's rain place is
  29 below the eye, so its drops start under the floor); the world-axes box does not change that.
- *Owed:* the port at the same nine poses, scored by the same script (the runner's job
  `handoffs/stage2/JOB-weather-1172-port-blobcount.md`, build 91d9aa4985, the 'ps2' presentation) -- the comparison,
  at LEVEL first (the pose the owner judges by), then DOWN and UP.

**The comparison (capture comparison, 2026-11-18 07:57-08:00Z):** the port at agent/later-1183 35b2efbf7c (LATER 1172's
world-axes box; 1190 at s = 1 in the 'ps2' view), a rendered browser run on Shadow PC 2 (Playwright Chromium, ANGLE
D3D11, an RTX A4500; relay-2), at PC 1's nine poses (read back within 0.01 u / 0.1 degree), a clean context with every
overlay hidden, the canvas box 640 x 480 scaled to the native 640 x 448, a CDP screencast (16.7 ms frames) resampled to
30 fps by timestamp (no slot repeated), scored by the capture's own `count_drops.py` unchanged
(`evidence/bugs-2026-11-18/x5-weather-capture/port-35b2efbf7-r2.zip`, sha256 64c09b2be4a3...). Drops per frame, port /
original, LEVEL -- DOWN -- UP:
- Blizzard spawn A: 20.3 / 18.9 -- 0.4 / 0.0 -- 10.7 / 10.3;
- Blizzard spawn B: 23.5 / 23.2 -- 0.0 / 0.0 -- 15.1 / 13.8;
- The Ruins SEAL spawn: 25.4 / 19.1 -- 1.5 / 1.5 -- 9.7 / 11.8.
Blizzard's snow follows the original within 10% at every pose (the largest, up at B, +9%): with LATER 1172 the port's
snow matches the original's on screen, level, down and up. The Ruins' rain matches looking down and is within 18% looking
up, and at level reads 25.4 against PC 1's one take of 19.1 (+33%). **Settled by two more takes of the original** (Shadow
PC 2, relay-2, 2026-11-18 ~08:20Z; a capture of the original running, scored by `count_drops.py` as is;
`ruins-b-orig2-pc2.zip`, sha256 f27252b8456d...): 15.6 (round 2) and 25.2 (round 4, about 2.5 min later), both at the
Ruins SEAL spawn (2041.1, 42.6, 1117.2) and level (cam+0x24 0.029 and 0.024, 1.65 and 1.38 degrees down), the body and
pitch steady through each grab. The original's three level takes there span **15.6-25.2** (mean about 20.0): the port's
25.4 sits at the top of the original's own take-to-take spread -- noise between takes, not a difference shown. Its method
is NOT PC 1's, and is said so: one console (PCSX2 2.8.2, r0004) in a LAN game on The Ruins from a saved slot, its round
started alone by one memory write (the launch byte 0x00c2e5d8, 0 to 1) BEFORE the takes -- no write during them; the
window's client was 640 x 480 (the 640 x 448 picture at 4:3), scaled bilinear to 640 x 448 before the script (PC 1 grabbed
640 x 448 directly). Kept and not counted: a take that caught a round starting mid-grab (mean 44.1). Ruins up (9.7
against 11.8) rests on one original take each; not re-taken.

**MP81's skyplane, measured (O; a memory read of the original, Shadow PC 3, relay-3, 2026-11-18 08:46Z; `evidence/bugs-2026-11-18/x5-weather-capture/mp81-memread/`, sha256 c269c9e3...; held by `test/skyFollow.test.ts` "proven: MP81's skyplane ...", the three poses value for value):** PCSX2 2.8.2,
r0004 (guest clock 0x00442fd0 advancing), one console in a LAN round on Chain Reaction (MP81) started by the launch byte
(a write before the read; none during), the body standing at the SEAL spawn (1253.50, 246.15, 1231.57), pitch only by the
right stick, a savestate at each pose and its EE RAM read offline. The camera: the world `*0x0045f750` = 0x0167a8e0, the
camera `*(world+0x128)` = 0x017650b0; its parent (+0x64) **0** at every pose. The `skyplane` node at 0x01674240 (found by
its name pointer at +0x90; identity 3x3): its translation against eye - 220 x row 1 --
- level (the spawn's own pitch, about 9.2 degrees): eye (1253.495, 263.905, 1256.447), row 1 (0, 0.987227, -0.159319):
  predicted (1253.495, 46.715, 1291.497), the node (1253.4952, 46.7147, 1291.4967);
- up: eye (1253.495, 246.791, 1241.610), row 1 (0, 0.500737, 0.865599): predicted (1253.495, 136.628, 1051.178), the node
  (1253.4951, 136.6295, 1051.1776);
- down: eye (1253.495, 274.338, 1229.384), row 1 (0, 0.341233, -0.939979): predicted (1253.495, 199.267, 1436.179), the
  node (1253.4951, 199.2649, 1436.1785).
All within 0.002 u: the sky is held at eye + R x vector through the camera's own matrix, as LATER 1183 builds it --
proven, value for value. The parent 0 also settles LATER 1172's open point (b) above (own = world for the camera). (A first page run, with the dev panel over the canvas, the canvas squashed and 100-200 ms
frame gaps, read every count low -- a floor only, `port-35b2efbf7.zip`; superseded.) The owner judges at LEVEL: the snow
there is the original's; the rain is denser than the original's, not sparser.

**The camera-held sources (M, a census through the repository's readers, 2026-11-18; every RUN/*.ZDB's CZANIM and
MZANIM): twelve** PARTICLE_SOURCE commands follow node `camera` (flag A 0x10), all in ambient MZANIM programs --
`rain_falling`: MP12 `rain_falling1` and `rain_falling2` (box +-70 / +-10 / +-70), MP52 and M52 `rain_falling1` and MP61
`rain_drops` (+-90 / +-10 / +-90); `snow_falling`: `snow_flakes` on MP1, MP82 and M82 (+-50 / -15..5 / -25..15);
`wind_effect`: MP12 `fog_mist` (alpha 0 at every key -- invisible, research 89); `bugs_flying`: M51 `dragonflys1` and
`dragonflys2`, MP64 `dragonflys1`, `dragonflys2` and `butterflies1`. LATER 1172's world-axes box applies to all twelve;
LATER 1190's wide-view widening (a browser adaptation, product track) to all twelve as well -- the flying bugs included,
by the main controller's taste call of 2026-11-18 (anything spawned about the view fills a wide screen at the original's
drops per unit of ground), logged for the owner.

