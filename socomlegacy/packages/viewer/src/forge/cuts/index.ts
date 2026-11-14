/**
 * FORGE CUTS (a browser adaptation, FG.R2): holes in a map. A placed door opens its own doorway and brings its map's
 * frame and doorway lining; a free cut box opens any box-shaped hole, taking the surfaces its X / Y / Z switches name;
 * a door dropped by a wall snaps square into it. `README.md` in this folder says what each file does and where the page
 * calls it.
 */
export { ALL_FACES, CUT_SLIVER_AREA_ADAPTATION, cutMesh, cutPolygon, makeCutBox, newell, subtractBox, type CutBox, type CutFaces } from './geometry';
export {
  DOOR_CUT_FACES_ADAPTATION, DOOR_CUT_FLOOR_CLEAR_ADAPTATION, DOOR_CUT_HALF_DEPTH_ADAPTATION, DOOR_CUT_PAD_ADAPTATION,
  doorCutAt, doorCutBox, leafFrame, placedDoorCuts, pointsOf, type LeafFrame,
} from './doors';
export { CUT_DEFAULT_SIZE_ADAPTATION, facesOf, freeCutBox, wordOf } from './free';
export { withCuts, withLayoutCuts } from './apply';
export {
  CUT_CAP_LEVEL_ADAPTATION, CUT_CAP_LOOK_REACH_ADAPTATION, CUT_CAP_SQUARE_ADAPTATION, CUT_CAP_TEXELS_ADAPTATION,
  CUT_CAP_THICKEST_ADAPTATION, CUT_CAP_THINNEST_ADAPTATION, cutCaps, type CutCaps,
} from './caps';
export {
  DOOR_SNAP_ALONG_SLACK_ADAPTATION, DOOR_SNAP_FOOT_ADAPTATION, DOOR_SNAP_OPPOSED_ADAPTATION, DOOR_SNAP_REACH_ADAPTATION,
  DOOR_SNAP_THICKEST_ADAPTATION, DOOR_SNAP_THINNEST_ADAPTATION, DOOR_SNAP_UPRIGHT_ADAPTATION, faceOf, snapDoor, wallFaces,
  type WallFace,
} from './snap';
export {
  LINING_PATH, PLACED_DOOR_NODE, PLACED_DOOR_PATH, PLACED_FRAME_PATH, PLACED_REVEAL_NODE, placedDoorName, placedFrameRoot,
  placedRevealNode,
} from './names';
