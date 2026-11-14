/**
 * FORGE CUTS, the names a placed door's copies stand under (a browser adaptation, FG.R2): its node, its frame's node
 * beside it (never swung with the leaf), and its doorway lining's world chunks. One place builds them and reads them
 * back, so `../placedDoors` and this folder cannot drift apart.
 */

/** A placed door's node in the match's scene, numbered in the layout's order from 1. */
export const placedDoorName = (i: number): string => `forge_door_${i + 1}`;
/** A placed door's frame's node: beside the door's, so it never swings with the leaf. */
export const placedFrameRoot = (name: string): string => `worldmodel/${name}_frame`;
/** A placed door's doorway lining's node (`LoadedMesh.node` of its world chunks). */
export const placedRevealNode = (name: string): string => `${name}_reveal`;

/** A placed door's node name (`placedDoorName`). */
export const PLACED_DOOR_NODE = /^forge_door_\d+$/;
/** Any path under a placed door's node or its frame's: what no cut ever takes. */
export const PLACED_DOOR_PATH = /^worldmodel\/forge_door_\d+(_frame)?(\/|=|$)/;
/** A path under a placed door's frame (`placedFrameRoot`). */
export const PLACED_FRAME_PATH = /^worldmodel\/forge_door_\d+_frame\//;
/** A placed door's lining's node (`placedRevealNode`). */
export const PLACED_REVEAL_NODE = /^forge_door_\d+_reveal$/;
/** The hull owner the holes' generated linings stand under (`./caps`). */
export const LINING_PATH = 'worldmodel/forge_cut_lining';
