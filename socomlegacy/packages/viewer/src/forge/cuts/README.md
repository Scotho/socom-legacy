# Forge cuts: doorways, frames, linings, wall snapping and free cut boxes

A Forge feature, and a browser adaptation (FG.R2). The original has no editor, places no doors and cuts nothing, so
nothing here changes what a disc map does. A layout with no placed doors and no cut boxes composes exactly as before.

## What it does

| Feature | In the editor and in Play |
|---|---|
| **Door openings** | A placed door cuts its doorway out of what it stands in: the map's walls, any prop or placed piece it overlaps, and the collision. A door's opening never cuts floors or ceilings. |
| **Frames** | A placed door brings its source map's own door frame when that map draws one as a separate prop (Frostfire `dfram*`, Vigilance `door_frame`, Fish Hook `door_frame01`, Requiem `door_pointy`). The frame is drawn and solid, never swings, and is never cut. Only collision that stands at that frame is copied, because a map's frames can share one node name. |
| **Linings** | A placed door also copies its source doorway's lining: the world faces round the opening across the wall's thickness (Frostfire's are five `a_steel23` quads: two jambs, the head and a threshold plate). Any other hole gets a generated lining: jambs, head, and a sill or threshold plate, in the cut wall's texture, with the plate in the floor's. Every lining is solid. |
| **Wall snapping** | A door placed, moved or turned within about 60 cm of a wall turns square to it, centres its frame (or its leaf when it has none) in the wall's thickness, and sets its foot on the wall's foot. Where it stands along the wall stays where it was put. The **Snap doors into walls** switch in the Select tool's settings turns this off. |
| **Free cut box** | The **Cut** tool in Objects (`Shift+9`) places a box you move, turn and size (Width / Height / Depth in the Inspector), cutting what it holds out of the map. **Cut X / Y / Z faces** pick which surfaces it takes, by the axis of the box their normals run along: XYZ for everything, XZ for walls only, Y alone for a hatch. Clicking a box or its X mark selects it. Cut boxes are listed in the Outliner. |
| **Live preview** | The editor shows every hole and generated lining as Play will cut it, updated as doors and boxes change. Holes are previewed in the map's own walls only; a hole through a prop or a placed piece shows in Play. |

## How it works (this folder)

| File | Job |
|---|---|
| `geometry.ts` | The cut. A `CutBox` is a frame, an extent and three face switches. `cutMesh` and `cutPolygon` split anything crossing a box into the convex pieces outside it (Sutherland–Hodgman, one plane at a time), carrying UVs, colours, normals and centroids along the cut. Anything no box reaches comes back as the same object. `worldPart` redraws a prop's placement as a world chunk, keeping its node path so the world's state can still hide it. |
| `doors.ts` | A placed door's opening. `leafFrame` finds a leaf's (or its frame's) plane. `doorCutBox` builds the box: the leaf's size, squared and centred through the wall by the frame when there is one. `placedDoorCuts` finds the placed doors in a composed map. |
| `free.ts` | A free cut box from its layout marker, and the faces word (`"xyz"`, `"xz"`, …). |
| `caps.ts` | `cutCaps`: generated linings. The wall is read off the hull (its upright faces along the box's axis, between `CUT_CAP_THINNEST_ADAPTATION` and `CUT_CAP_THICKEST_ADAPTATION` apart); a quad goes across its thickness on each side the wall carries past. A sill takes the neighbouring floor's surface fields (region, material) so the walk counts it as that floor. |
| `apply.ts` | `withLayoutCuts(map, layout.cuts)`: every placed door's opening and every free box, applied to a composed map. World chunks are cut in place; a prop or placed-piece placement a box reaches is redrawn as world chunks with its own geometry cut; static hull polygons are cut and each owner's range re-based; generated linings go under their own hull owner (`LINING_PATH`), because the collision grid files a polygon only by its owner. Moving owners (door leaves, gates, hooks) and the placed doors' own leaves, frames and linings are never cut. |
| `snap.ts` | `wallFaces` (a hull's upright static faces) and `snapDoor`. |
| `names.ts` | The names a placed door's copies stand under (`forge_door_<n>`, `…_frame`, `…_reveal`), built and read in one place. |
| `index.ts` | The folder's exports. |

### Adaptation values

Every value with no source in the original is an exported `*_ADAPTATION` constant, pinned by `test/forge/cuts/commands.test.ts`:

- `geometry.ts`: `CUT_SLIVER_AREA_ADAPTATION`
- `doors.ts`: `DOOR_CUT_PAD_ADAPTATION`, `DOOR_CUT_FLOOR_CLEAR_ADAPTATION`, `DOOR_CUT_HALF_DEPTH_ADAPTATION`, `DOOR_CUT_FACES_ADAPTATION`
- `free.ts`: `CUT_DEFAULT_SIZE_ADAPTATION`
- `caps.ts`: `CUT_CAP_THICKEST_ADAPTATION`, `CUT_CAP_THINNEST_ADAPTATION`, `CUT_CAP_SQUARE_ADAPTATION`, `CUT_CAP_LOOK_REACH_ADAPTATION`, `CUT_CAP_LEVEL_ADAPTATION`, `CUT_CAP_TEXELS_ADAPTATION`
- `snap.ts`: `DOOR_SNAP_REACH_ADAPTATION`, `DOOR_SNAP_THICKEST_ADAPTATION`, `DOOR_SNAP_THINNEST_ADAPTATION`, `DOOR_SNAP_FOOT_ADAPTATION`, `DOOR_SNAP_UPRIGHT_ADAPTATION`, `DOOR_SNAP_ALONG_SLACK_ADAPTATION`, `DOOR_SNAP_OPPOSED_ADAPTATION`
- `../placedDoors.ts`: `DOOR_FRAME_FIT_ADAPTATION`, `DOOR_FRAME_REACH_ADAPTATION`, `DOOR_FRAME_SIZE_ADAPTATION`, `DOOR_REVEAL_FACING_ADAPTATION`
- `creator-contracts/src/layout.ts`: `CUT_SIZE_MIN_ADAPTATION`
- `../page.ts`: `DOOR_CUT_PREVIEW_MS_ADAPTATION`, `CUT_BOX_OPACITY_ADAPTATION` (editor-only)

## Where it plugs in (outside this folder)

| File | Change |
|---|---|
| `creator-contracts/src/layout.ts` | New layout field `cuts?: CutMarker[]` (`at` its centre, `yaw`, `size`, `faces?`, `locked?`), in the file parse, the record (`CutRow`), `checkCreatorRecord`, `V3_FIELDS` and `PLACED_KINDS`. Additive: a layout without cuts is unchanged. |
| `viewer/src/forge/composeLayout.ts` | One step after the placed doors: `withLayoutCuts(doored.map, layout.cuts)`. |
| `viewer/src/forge/placedDoors.ts` | `DoorTemplate.frame` (`doorFrames`, its hull limited to what stands at that frame) and `DoorTemplate.reveal` (`doorReveal`), copied with each door; `doorFramePoints` for the snap and the preview. |
| `viewer/src/world.ts` | `WorldView.recutWorld(cut)` redraws only the world chunks whose cut changed, keeping each chunk's original geometry to put back; `WorldView.setExtraWorld(parts)` draws the generated linings. Both optional on the interface. |
| `viewer/src/forge/page.ts` | The Cut tool (mode `cut`: button, marker, ghost, placing, picking, save and load, Inspector fields, Outliner group), the live preview (`previewDoorCuts`), the door snap on place and on gizmo release, and its switch (`snapDoors`, kept with the view). |
| `viewer/src/forge/pieces.ts` | `forgeRootOf` knows a cut box, so a click picks it. |
| `viewer/src/forge/agent/*`, `shell/operations.ts`, `forge-agent-protocol/src/forgeOperations.ts` | The operation `cut.place`; `placement.set` fields `width`, `height`, `depth`, `faces` on `cut:<n>`, each checked against the record's bounds. A new height keeps the box's foot where it stands. |
| `mapDataBillboards.ts`, `keys.ts`, `validate.ts` | The cut box's mark (`X`, `userCuts`), its tool key (appended last, so no other tool's key moves) and its count's word. |

### Server-side work for the maintainers (not in this repository)

- **The lobby's room** (`match/src/forgeSimMap.ts`) composes Forge maps for online play. It must take the same step, `withLayoutCuts(map, layout.cuts)` after the placed doors, so the server's collision has the same holes, frames and linings as the page. Until it does, online players see doorways that the server still treats as walls, and **layouts saved before this change that have placed doors also behave differently in Play** (their doors now cut, frame and line their doorways).
- **The central service's layout check** (`central/src/forgeLobby.ts`) must admit the new `cuts` field and bound its count like the other placed kinds (`PLACED_KINDS` already lists it).

## Tests (`viewer/test/forge/cuts/`)

- `doors.test.ts`: the clipping maths (area kept, nothing left inside, UVs carried, untouched meshes returned as the same object), the face switches in the box's own frame, and on the disc a door set into Frostfire's barracks wall: shut it blocks, opened a SEAL walks through, it brings its frame and its doorway's lining, the floor stays, a door sunk 3 cm still gets a threshold plate.
- `everyDoor.test.ts`: all 43 doors of the disc's 9 door maps, set into the same wall: each snaps, cuts, blocks shut, opens, and lets a body walk through both ways. A second test checks that a door copies only its own frame's collision.
- `snap.test.ts`: squaring, centring between two faces or onto one, no snap out of reach, and a framed door's frame centred in the barracks wall.
- `free.test.ts`: the cut box's record and file round trip and their refusals, its box, and on the disc a walls-only box walked through with the floor kept while an all-faces box takes the floor.
- `commands.test.ts`: `cut.place` and `placement.set` on a cut box (bounds, faces, height keeping the foot), every adaptation value pinned, and a redrawn prop keeping its node path.

Disc-backed tests read `SOCOM_ISO` and skip without it.

## Known limits

- The editor previews holes in the map's own walls only; holes through props and placed pieces appear in Play.
- Generated linings are flat quads across the wall's thickness: a wall built of several layers, or thicker than `CUT_CAP_THICKEST_ADAPTATION`, is not lined.
- Snapping reads the map's own hull, not placed pieces, so a door won't snap into a wall built from pieces.
- The Forge's scale gizmo is still a stub (`FC-1`), so a cut box is sized in the Inspector, and a door can't be scaled.
