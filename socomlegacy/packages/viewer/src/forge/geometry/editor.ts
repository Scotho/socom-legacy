import { scrubbing } from '../scrub';
import { brushCursor, hexOf, sampleCursor } from '../paintCursor';
import { PaintToolBar, type PaintTool } from '../paintTools';
import { blockShapeIcon } from './blockShapeIcons';
import {
  Box3, BoxGeometry, BufferAttribute, BufferGeometry, Color, DataTexture, DoubleSide, Euler, Group, RepeatWrapping, RGBAFormat, InstancedMesh, InterleavedBufferAttribute, LineBasicMaterial, LineSegments, Matrix4, Mesh, MeshBasicMaterial, Object3D,
  OrthographicCamera, PerspectiveCamera, Points, PointsMaterial, Quaternion, Raycaster, Vector2, Vector3, type Camera, type Scene,
} from 'three';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { tightenGizmo } from '../gizmoPick';
import { vec4 } from 'three/tsl';
import { Line2NodeMaterial, MeshBasicNodeMaterial } from 'three/webgpu';
import { LineSegments2 } from 'three/examples/jsm/lines/webgpu/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import type { LoadedMap, LoadedMesh } from '../../loadMap';
import type { GroundData } from '../../mover';
import { buildWorld, type WorldView } from '../../world';
import { commonGroundSurface, FLOOR_NORMAL_Y_MIN, floorWordsOf, wallWordsOf } from './collision';
import { displacementGrid, makeDisplacement, sculpt } from './displacement';
import { add, cloneMesh, cross, dot, edgeKey, edgeMap, edgeOfKey, faceNormal, normalize, scale, sub, facePoints, faceVerts, length, liveFaces, polygonNormal, triangulate, vertPos, type EditMesh, type TextureMapping, type Vec3 } from './editMesh';
import { buildHullWith, CLIMB_FLAG_DEFAULT, CLIMB_FLAGS, LADDER_CLIMB_FLAG, climbFlagOf, COLLISION_TYPES, collisionTypeOf, followersOf, hullGeometryOf, moveFollower, twinIndexOf, withCollisionType, withTwins, wordsOf, type CollisionType } from './hullGeometry';
import { HULL_COLOURS, type HullViewPoly } from '../hull';
import { lastRefusal } from './topology';
/** Why the last tool was undone (`./topology` `transact`), as a message's tail; empty when it was not. */
const refusedWhy = (): string => (lastRefusal ? ` (refused: ${lastRefusal} -- the mesh is as it was)` : '');
import { BRIDGE_OPEN_ONLY, fillHoles, thickenFaces, THICKEN_NOT_OPEN, mergeVerts, mergeGroups, edgeMergeGroups, onFrameGrid, placeVerts, collapseEdgeGroups, collapseFaces, extendEdges, EXTEND_NOT_OPEN, loopCutAt, splitEdge, bevelEdges, bridgeEdgeRuns, bridgeEdges, bridgeEdgesBlocked, bridgeFaces, bridgeRunsBlocked, connectEdges, edgeFaceCount, extrudeClosedEdges, extrudeOrExtendVerts, isBent, joinFlatPairs, splitBentFaces, deleteEdges, extrudeEdges, extrudeFacesBy, insetFaces, knifeCut, loopCut, orientPulled, subdivideEdges, subdivideFaces, type KnifePoint, deleteFaces, deleteVerts, dissolveEdges, dissolveFaces, dissolveVerts, extrudeFaces, flipFaces, snapVerts, transformVerts } from './ops';
import { box, cylinder, plane, sphere, UNTEXTURED_FLOOR_COLOR_ADAPTATION, type PrimitiveOptions } from './primitives';
import { flatWorkplane, rayOnWorkplane, workplaneFrame, type Workplane } from '../mapGrid';
import { knifeSnapped, type KnifeFrame, type KnifePrev } from './knifeSnap';
import { BLOCK_PREVIEW_SIZE_ADAPTATION, BLOCK_SHAPE_GROUPS, BLOCK_SHAPES, cleanOutline, outlineCrosses, polygonMesh, SHAPE_SETTINGS, shapeSettings, type ShapeSetting, type ShapeSettings, blockKind, blockMakes, blockMesh, blockParts, frameToWorld, stairsRampMesh, stairsRun, worldToFrame, type BlockFrame, type BlockShape } from './blockShapes';
import { convertSelection, edgeLoop, edgeRibs, edgeRing, emptySelection, growSelection, pick, pickFace, PickIndex, selectedFaces, selectionCentre, selectionVerts, type PickOp, type Ray, type SelectMode, type Selection } from './selection';
import type { DrawSources } from './worldMesh';
import type { FloorLook } from './blank';
import type { Surface } from './collision';
import { adjustMapping, align, alignToView, applyTexture, fitMapping, justify, mappedUv, medianTexelScale, pasteLook, refreshUvs, resetMapping, sampleFace, setDetail, textureState, textureTexelScales, worldAligned, type DetailChange, type FaceLook, type Justify, type MappingChange, type TextureSize, type TextureState } from './texturing';
import {
  addObject, buildHull, cloneGeometry, compileDraws, duplicateObject, facesCopy, geometryOfMap, inPlaceCopy, markReshaped, mergeObjects, mul4, objectCopy, objectFaces, removeObject, separateFaces, transformObject, worldSectionsOf,
  type GeoObjectCopy,
  type GeoObject, type WorldGeometry,
} from './world';
import type { SavedWorld } from './geometryFile';

/**
 * The Forge's geometry mode (a browser adaptation, FG.R2; the owner, 2026-11-14: a full level-editor geometry editing
 * tool). Over a disc map's base it edits the map's world as `./world` holds it: object, point, edge and face modes,
 * the gizmo moving what is selected, primitives, extrude, delete, separate, flip, a level editor's texturing and displacement.
 * The edited world is drawn by a view of its own over the base's world, which is hidden while the geometry differs; the
 * hull is rebuilt only by Build (the owner, 2026-11-14: "collision should only be rebuilt with a rebuild button"), which
 * is where everything too slow for a drag goes.
 */

export interface GeometryEditorDeps {
  doc: Document;
  scene: Scene;
  /** The viewport's input surface (the canvas's overlay): the pointer the editor reads, the gizmo's element. */
  input: HTMLElement;
  /** The top toolbar's place for the selection modes (Object, Point, Edge, Face): shown only in Modelling mode. */
  modeTools: HTMLElement;
  /** The object bar's place for the rest of the tools (Create, Edit, Texture, ...): shown only in Modelling mode. */
  tools: HTMLElement;
  /** Where the status line goes (over the viewport). */
  statusHost: HTMLElement;
  /** The viewport's lower-left legend stack (the page's), for Create's settings panel; absent, the status host. */
  legendHost?: () => HTMLElement;
  /** The geometry's undo state changed (the toolbar's Undo and Redo answer for it in Geometry mode). */
  onHistory: () => void;
  /**
   * Bug 20 (one history across the modes): a geometry edit made, named `label` -- the page records it as a step of its
   * own in its one history, keeping the geometry as it now stands (`snapshot`) for an undo to put back (`restoreSnapshot`).
   */
  /** An edit made; `amend`: the same edit made again (a tool's setting changed) -- the current step, not a new one. */
  onEdit: (label: string, amend?: boolean) => void;
  /**
   * The selection drawn (the owner, 2026-11-15: "any selection pattern should be part of the undo"): the page records a
   * selection step when it differs from the step's (`selectionState`), once the gesture making it is over.
   */
  onSelect?: () => void;
  /**
   * Collision editing's hull to be drawn again (`collisionPolys`), `on` whether collision editing is on: the page's one
   * collision view (the Draw menu's Collision hull, which turning collision editing on turns on) draws it.
   */
  onCollisionView?: (on: boolean) => void;
  /**
   * A drag's collision as it would stand were the drag released now (`previewCollision`), for the collision view to
   * follow the drag; null when the drag ends (the edit's own rebuild then draws it).
   */
  onCollisionPreview?: (ground: GroundData | null) => void;
  /** The objects or the selection changed (an edit, an undo, a pick): the Outliner's Geometry section is drawn again. */
  onObjects?: () => void;
  camera: () => Camera;
  /** The camera is navigating (RMB fly, a pan, an orbit, a dolly): the fly letters are its, never the editor's. */
  navigating: () => boolean;
  say: (text: string, warn?: boolean) => void;
  /** The base's disc map, or null when the base is not one (a blank floor, an authored map). */
  map: () => LoadedMap | null;
  /** A new view's switches and light set as the base's are (the page's `applyWorld` and lighting). */
  prepareView: (v: WorldView) => void;
  /** The base view's world shown or hidden (the editor's own view stands in for it once the geometry differs). */
  baseWorldShown: (on: boolean) => void;
  /** The mode entered or left: the page lets go of its own selection and gizmo. */
  onActive: (on: boolean) => void;
  /** Build finished: the hull changed (the page redraws its hull overlay, and Play takes it). */
  onBuilt: () => void;
  /** The props (the map's, the layout's placed ones) drawn or not: hidden in Geometry mode unless View > Props is ticked. */
  propsShown: (on: boolean) => void;
  /**
   * The world drawn changed: the edited world's view `v` stands for the base's world from now on, or the base's own again
   * (null). Called before the old view goes, so the page can hand what it keeps on a world (a texture pack) across.
   */
  onViewSwap: (v: WorldView | null) => void;
  /**
   * A blank base's floor (bug 17): its size, its quads a side, and its look off the library map (`./blank`
   * `floorLookOf`) -- the plane an empty world opens with. Null on a disc map's base, whose world is its own.
   */
  defaultFloor?: () => { size: number; divisions: number; look: FloorLook } | null;
  /** The workplane (the page's Workplane menu, `../mapGrid`): the block tool drags its shapes out on it while it is shown. */
  workplane?: () => Workplane;
  /** The workplane shown (the Display menu's Workplane): the block tool's plane; hidden, the surface pressed on is. */
  workplaneShown?: () => boolean;
  /**
   * The Texture button pressed (the owner, 2026-11-16: "make it a button that opens the asset browser filtered to textures
   * only"): the page opens its asset browser on its Textures tab by `anchor`, a pick handed back through `setTexture`.
   */
  browseTextures?: (anchor: HTMLElement) => void;
  /** The Layer turned (Geometry, Collision, Texture): the page sets its view's locks for it (`isTexturing`, `isCollision`). */
  onLayer?: () => void;
}

/**
 * The selection modes, as the toolbar and the words name them: the point mode is "Vertex" (the owner, 2026-11-16: "use
 * vertex everywhere where we used point"; a level editor's word), its code name `point` kept.
 */
const MODES: { mode: SelectMode; label: string; plural: string; key: string }[] = [
  // The reference editor's keys (the owner, 2026-11-19: one to one with it): 1 Vertex, 2 Edge, 3 Face, 4 Object.
  { mode: 'point', label: 'Vertex', plural: 'vertices', key: '1' }, { mode: 'edge', label: 'Edge', plural: 'edges', key: '2' },
  { mode: 'face', label: 'Face', plural: 'faces', key: '3' }, { mode: 'object', label: 'Object', plural: 'objects', key: '4' },
];
/** A selection mode's thing, one or many, as the words say it ("vertex", "vertices"). */
const modeWord = (mode: SelectMode, n = 1): string => {
  const m = MODES.find((x) => x.mode === mode);
  return n === 1 ? (m?.label ?? mode).toLowerCase() : m?.plural ?? `${mode}s`;
};

const HIGHLIGHT = 0xffa630, HOVER = 0x7fd3ff;
/** The polygon edges' material: the world Wireframe's own (`../../world` `wireframeMaterial`), one each drawing. */
function edgeMaterial(): MeshBasicNodeMaterial {
  const m = new MeshBasicNodeMaterial();
  m.colorNode = vec4(1, 1, 1, 0.9);
  m.transparent = true;
  m.depthWrite = false;
  m.polygonOffset = true;
  m.polygonOffsetFactor = -1;
  m.polygonOffsetUnits = -1;
  m.wireframe = true;
  return m;
}
/** The hover over what is selected already: the hover's own colour (the owner, 2026-11-14), drawn a little stronger. */
const HOVER_SELECTED = HOVER;

type GizmoPointer = { x: number; y: number; button: number };

/**
 * The floor plane's surface words when the library map's hull has no walkable surface to read (a library with no hull):
 * walkable ground (`ditype` 3), material 0. Named, not read: no disc value stands behind it.
 */
const DEFAULT_FLOOR_SURFACE_PLACEHOLDER: Surface = [3, 0, 0, 0, 0];

/** The pointer moved this far (CSS pixels) from its press is a drag select, not a click (the page's own slop, `BOX_DRAG_PX`). */
const PAINT_DRAG_PX = 4;
/** A drag select samples its path this often (CSS pixels), at most `PAINT_SAMPLES_MAX` picks a pointer event (a browser adaptation). */
const PAINT_STEP_PX = 6;
const PAINT_SAMPLES_MAX = 6;
/** The block tool's outline colour while a shape is dragged out (a browser adaptation; the selection's gold family). */
const BLOCK_PREVIEW_COLOUR = 0xffc400;
/** How far along the pointer's ray the block tool still meets the workplane (game units; the page's `WORKPLANE_REACH`). */
const BLOCK_REACH = 20000;
/** How much nearer than the workplane, along the pointer's ray (game units), a face must be to take Create's press (`nearerOfWorkplane`'s `WORKPLANE_SEE_TOLERANCE` alike; a browser adaptation). */
const BLOCK_SEE_TOLERANCE = 0.5;
/** How near the outline's first point (CSS pixels) a Polygon click closes it (a browser adaptation, as a level editor's snap to it). */
const POLY_CLOSE_PX = 10;
/** A Texture State field's live drag redraws the world at most this often, milliseconds (a browser adaptation). */
const TEXTURE_PREVIEW_MS = 80;
/** Select floors / walls / ceilings: a face is a floor with its normal's up at least this, a ceiling at most minus it (as collision's `FLOOR_NORMAL_Y_MIN`). */
const FACING_UP_MIN = 0.7;
/** Select coplanar: within these of a selected face's plane -- its normal's dot, and its distance in world units. */
const COPLANAR_DOT = 0.999;
const COPLANAR_DIST = 0.5;
/** The Texture grid (browser adaptations): at most this many faces drawn, this many lines across one, this far off it, this colour. */
const TEXTURE_GRID_FACES = 400;
const TEXTURE_GRID_LINES = 64;
const TEXTURE_GRID_LIFT = 0.05;
const TEXTURE_GRID_COLOR = 0xffc94a;

/** A face as it stood before a preview: what `restoreFaces` puts back. */
interface FaceSnapshot { m: EditMesh; f: number; style: number; mapping: TextureMapping | undefined; uvs: [number, number][]; styles: number }
/** The Inspector's Texture State: the faces' shared mapping values, and the texture they wear with its size and natural size. */
export interface TextureStateView extends TextureState {
  texture: string | null; texSize: [number, number] | null; natural: number | null; metresPerUnit: number;
  /**
   * The detail pass over the faces whose texture binds one (the map's manifest `detail` record): how many such faces;
   * whether it is drawn over them (`vparams` bit 14, `LoadedMesh.detailOn`); its gate range, squared world units (the
   * face's draw's own, else the record's). Null where those faces differ.
   */
  detail: { faces: number; on: boolean | null; range: number | null };
}
/**
 * The toolbar's Displace group (Displace, Sculpt) shown: off for now (the owner, 2026-11-17: "remove the displacement
 * geometry stuff for now we will come back to it"). Its code stays; a displaced face already made still loads and draws.
 */
const DISPLACE_TOOLS_SHOWN = false;
/** The height of a shape made where none can be pulled, with no snap and none pulled before: a metre (10 game units; a browser adaptation). */
const BLOCK_DEFAULT_PULL_ADAPTATION = 10;
/** The resize handles' size on screen, how near a press must be to take one (CSS pixels), and the least extent a handle leaves (game units, snap off). */
const BLOCK_HANDLE_PX = 11;
const BLOCK_HANDLE_PICK_PX = 12;
const BLOCK_HANDLE_MIN = 0.01;
/** The preview's faces: how see-through, and their colour with no texture chosen (a browser adaptation). */
const BLOCK_SOLID_OPACITY = 0.8;
const BLOCK_SOLID_PLAIN = 0x9a9a9a;
/** The start marker's cross off the workplane (no snap step): its arm this share of the distance from the camera. */
const BLOCK_START_CROSS_SHARE = 0.02;

/** How many of the nearest points or edges a pick tests for being seen before it gives up (each test a ray). */
const VISIBLE_TESTS_MAX = 8;

/** How near the pointer (CSS pixels) a point or an edge is taken in point and edge mode (a browser adaptation). */
const PICK_PX = 12;
/** A point's handle, CSS pixels across (a browser adaptation, after a level editor's vertex squares). */
const HANDLE_PX = 9;
/**
 * The hover's and the selection's lines, CSS pixels wide (the owner, 2026-11-16: "make the edge hover/select line
 * thicker ... make it more obvious that it is hovered/selected. keep the same colors"; a browser adaptation): an edge's
 * own, and the outline of a face or an object -- drawn as screen-space lines (`thickLines`), the renderer's own a pixel.
 */
const EDGE_PX = 4;
const OUTLINE_PX = 3;
/** An object's outline is its feature edges (`featureEdges`); past this many it is left out (a world section's terrain). */
const OUTLINE_EDGES_MAX = 6000;
const HANDLE_GEOMETRY = new BoxGeometry(1, 1, 1);

/** Empties a drawing layer, freeing what each child made for itself (never the handles' shared cube). */
function clearGroup(g: Group): void {
  for (const c of [...g.children]) {
    g.remove(c);
    const m = c as Mesh;
    if (m.geometry && m.geometry !== HANDLE_GEOMETRY) m.geometry.dispose();
    (m.material as { dispose?: () => void } | undefined)?.dispose?.();
  }
}

/** An object's edges and points, drawable and pickable on screen. */
interface Cage { edges: Float32Array; points: Float32Array; verts: number[]; edgeKeys: string[] }

/** The geometry's selection as a step of the page's history keeps it: its mode, objects, and each object's items. */
/**
 * The selection modes each Edit tool works in, and is shown in: Fill Hole on edges; Thicken on faces; Merge on points or edges; Grow and Shrink Selection on points, edges or faces; Select Edge Loop and Ring on edges; Extrude and Separate on faces; Bridge on two faces or two edges; Flip on
 * faces or whole objects; Inset on faces; Loop Cut on edges; Bevel on edges or faces (their outline); Subdivide on faces or edges; the Knife (a tool
 * clicked on the mesh, no selection needed) in every mode but Object; Dissolve on points, edges or faces (an object has nothing round it to merge into); Delete on all.
 */
const EDIT_TOOL_MODES: Readonly<Record<string, readonly SelectMode[]>> = {
  fill: ['edge'], thicken: ['face'], mergemeshes: ['object'], merge: ['point', 'edge'], grow: ['point', 'edge', 'face'], shrink: ['point', 'edge', 'face'], loop: ['edge'], ring: ['edge'], ribs: ['edge'], connect: ['edge', 'point'], collapse: ['edge', 'face'], extend: ['edge'], loopcut: ['edge'], bevel: ['edge', 'face'], extrude: ['face'], inset: ['face'], subdivide: ['face', 'edge'],
  knife: ['point', 'edge', 'face'], bridge: ['face', 'edge'], separate: ['face'], flip: ['face', 'object'],
  snapgrid: ['point', 'edge', 'face'], snapvert: ['point'], snapedge: ['edge'],
  dissolve: ['point', 'edge', 'face'], delete: ['object', 'point', 'edge', 'face'],
};

/** The Edit menu's commands on the geometry (`GeometryEditor.command`): Ctrl+C, Ctrl+X, Ctrl+V, Ctrl+D and Delete. */
export type GeometryCommand = 'copy' | 'cut' | 'paste' | 'duplicate' | 'delete';
/** The Ctrl chords of `GeometryCommand`, by key code (the page's own, `../keys`). */
const CHORD_COMMANDS: Readonly<Record<string, GeometryCommand>> = { KeyC: 'copy', KeyX: 'cut', KeyV: 'paste', KeyD: 'duplicate' };

export interface GeometrySelectionState { mode: SelectMode; objects: string[]; items: [string, (number | string)[]][] }

/**
 * The geometry as one step of the page's history left it (bug 20): a copy, over the map it was made on, and the hull
 * objects of collision editing (`./hullGeometry`) as they stood, null before it was opened.
 */
/** An Outliner row of a geometry layer: an object, its kind ('world' a map section), and whether it is selected. */
export interface OutlineRow { id: string; name: string; kind: GeoObject['kind'] | 'world'; selected: boolean }

/** `authored`: a person's edit made it (bug 1's `savedGeometry`); absent, as `edited` says. */
export interface GeometrySnapshot { map: LoadedMap; geo: WorldGeometry; edited: boolean; authored?: boolean; hull?: WorldGeometry | null }


/** The camera's letters while it navigates, as the page's (`../keys` `FLY_LETTERS`). */
/** Meshes kept as they were before a tool touched them, to be put back whole where a later object refuses it. */
function meshSaver(): { save(m: EditMesh): void; restore(): void } {
  const was = new Map<EditMesh, EditMesh>();
  return {
    save: (m) => { if (!was.has(m)) was.set(m, cloneMesh(m)); },
    restore: () => { for (const [m, copy] of was) Object.assign(m, copy); },
  };
}

/** Dissolve's title in Point and Edge mode, and Combine Faces' in Face mode (the same button, the reference editor's names). */
const DISSOLVE_TITLE = 'Dissolve (Backspace): the selected points or edges go and the faces round them merge, no hole';
const COMBINE_TITLE = 'Combine Faces (Backspace): the edges between selected faces that lie flat together taken away, so they make one face (faces at an angle stay apart)';

/** A burst of edits settles this long before the collision is rebuilt (`buildSoon`): one rebuild for a run of keys. */
const BUILD_SETTLE_MS = 100;
/** Each collision type's colour, as the collision view draws it (`../hull` `HULL_COLOURS`): its tab, the brush's hover and cursor. */
const TYPE_COLOURS: Record<CollisionType, number> = { floor: HULL_COLOURS.floor, wall: HULL_COLOURS.wall, passthrough: HULL_COLOURS.skip, climbable: HULL_COLOURS.climb };
/** The collision view's preview during a drag is built at most this often (`previewSoon`): a build is 3-18 ms. */
const PREVIEW_MS = 60;
const IDENTITY4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

const FLY_CODES = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'KeyR', 'KeyF', 'KeyZ', 'KeyC']);

export class GeometryEditor {
  /** The geometry the tools work on: the drawn geometry, or the hull objects while collision editing is on. */
  private geo: WorldGeometry | null = null;
  /**
   * Collision editing (the owner, 2026-11-15: "a collision edit toggle in geometry mode ... like I was just editing another
   * geometry"; `./hullGeometry`): on, `geo` is the hull objects (`hullGeo`) and the drawn geometry waits in `drawGeo`.
   */
  private collisionOn = false;
  /**
   * The Texture layer (the owner, 2026-11-16: "a third button/layer/mode for textures. in this mode we can't edit
   * geometry, but only apply textures ... the active texture painting ux/workflow similar to how we do it for ai tile
   * painting"): the drawn geometry, its shape left alone -- no gizmo, no Create, Edit or Displace, no Delete -- and the
   * brush laying the chosen texture (`textureName`) on the faces a click or a drag passes over, as Apply lays it.
   */
  private textureOn = false;
  /** The textures as the brush's previews draw them (the hover, the stroke), one each by name. */
  private readonly brushTextures = new Map<string, DataTexture>();
  /** A stroke's painted faces, drawn textured until its end compiles the world (one rebuild a stroke, not a face). */
  private readonly strokeLayer = new Group();
  private editGroup!: HTMLElement;
  /** The Select section of the Edit tools (grow, shrink, loop, ring, ribs): beside Edit. */
  private selectGroup!: HTMLElement;
  private drawGeo: WorldGeometry | null = null;
  private hullGeo: WorldGeometry | null = null;
  private textureGroup!: HTMLElement;
  private displaceGroup!: HTMLElement;
  private surfaceGroup!: HTMLElement;
  /**
   * Collision painting (the owner, 2026-11-15: "more of a paint brush, click to paint the current type ... a collision
   * paint mode toggle in the collision layer settings ... a paint brush/sample tool ... not a dropdown, but more of a
   * quick tab ... in each tab it should show the collision type color"; the same UX texture painting will take): the
   * type tabs (`collisionType`) and Paint, the brush (a click or a drag paints the faces under it the active type; the
   * owner, 2026-11-15: no Apply, no Sample). A stroke is one undo step; a face's twins are painted with it.
   */
  private collisionType: CollisionType = 'floor';
  /** The climb flag the Climbable tab paints (its menu, `CLIMB_FLAGS`), shown on the tab. */
  private climbFlag: number = CLIMB_FLAG_DEFAULT;
  private climbFlagLabel: HTMLElement | null = null;
  /**
   * The cursor's words on the Collision layer (the owner, 2026-11-15: "show the current collision type as a cursor overlay
   * text (especially useful for climbable types)", "also when we are not in paint mode"): the face's type under the
   * pointer and, while painting and a click would change it, what it becomes -- `Floor -> Climbable 4 Crate`.
   */
  private paintTip: HTMLElement | null = null;
  private pointerClient: { x: number; y: number } | null = null;
  /** A face's words in the tip's words: its type, and a climbable one's flag. */
  private typeWords(s: Surface): string {
    const t = collisionTypeOf(s);
    const label = COLLISION_TYPES.find((x) => x.type === t)?.label ?? t;
    if (t !== 'climbable') return label;
    const f = climbFlagOf(s);
    return `${label} ${CLIMB_FLAGS.find((c) => c.flag === f)?.short ?? f}`;
  }
  private showPaintTip(text: string | null): void {
    const at = this.pointerClient;
    if (!text || !at) { if (this.paintTip) this.paintTip.hidden = true; return; }
    if (!this.paintTip) {
      this.paintTip = this.deps.doc.createElement('div');
      this.paintTip.className = 'fx-paint-tip';
      this.deps.doc.body.append(this.paintTip);
    }
    this.paintTip.hidden = false;
    this.paintTip.textContent = text;
    this.paintTip.style.left = `${Math.round(at.x + 18)}px`;
    this.paintTip.style.top = `${Math.round(at.y + 18)}px`;
  }
  private climbMenu: HTMLElement | null = null;

  /**
   * The Climbable tab's menu: the climb flags under the tab, the one painting marked (Esc stops painting). Placed
   * fixed under the tab (the toolbar may clip what hangs out of it); a press elsewhere or Esc closes it.
   */
  private toggleClimbMenu(tab: HTMLElement): void {
    if (this.climbMenu) { this.closeClimbMenu(); return; }
    const doc = this.deps.doc;
    const menu = doc.createElement('div');
    menu.className = 'fx-climb-menu';
    menu.setAttribute('role', 'menu');
    const item = (text: string, on: boolean, run: () => void): void => {
      const b = doc.createElement('button');
      b.type = 'button';
      b.className = `fx-climb-item${on ? ' is-on' : ''}`;
      b.setAttribute('role', 'menuitemradio');
      b.setAttribute('aria-checked', String(on));
      b.textContent = text;
      b.addEventListener('click', () => { this.closeClimbMenu(); run(); });
      menu.append(b);
    };
    const chosen = this.collisionType === 'climbable';
    for (const c of CLIMB_FLAGS) {
      item(c.label, chosen && c.flag === this.climbFlag, () => {
        this.climbFlag = c.flag;
        this.pickType('climbable');                            // the active type and its flag; Paint or Apply lays them
      });
    }
    const r = tab.getBoundingClientRect();
    menu.style.left = `${Math.round(r.left)}px`;
    menu.style.top = `${Math.round(r.bottom + 4)}px`;
    doc.body.append(menu);
    this.climbMenu = menu;
    const away = (e: Event): void => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !menu.contains(e.target as Node) && !tab.contains(e.target as Node)) {
        this.closeClimbMenu();
        if (e instanceof KeyboardEvent) e.stopPropagation();
      }
    };
    this.climbMenuAway = away;
    doc.addEventListener('pointerdown', away, true);
    doc.addEventListener('keydown', away, true);
  }
  private climbMenuAway: ((e: Event) => void) | null = null;
  private closeClimbMenu(): void {
    this.climbMenu?.remove();
    this.climbMenu = null;
    if (this.climbMenuAway) {
      this.deps.doc.removeEventListener('pointerdown', this.climbMenuAway, true);
      this.deps.doc.removeEventListener('keydown', this.climbMenuAway, true);
      this.climbMenuAway = null;
    }
  }
  /**
   * The paint tool's mode on the Collision and Texture layers (`../paintTools`; the owner, 2026-11-16: "We have 3 modes.
   * Select(default), Paint, Sample"): Select edits (the Collision layer) or picks faces for Apply; Paint lays what is
   * active (the collision type, the texture) on what the brush passes over; Sample takes it off a face. Select on any
   * other layer.
   */
  private tool: PaintTool = 'select';
  /** The mode a sample goes back to: Paint, or Select. */
  private toolBeforeSample: 'select' | 'paint' = 'select';
  private get paintOn(): boolean { return this.tool === 'paint'; }
  private get sampling(): boolean { return this.tool === 'sample'; }
  /** Shift held: a click while painting samples (the owner, 2026-11-16: "toggle to that mode by pressing shift+click"). */
  private shiftHeld = false;
  private toolBar!: PaintToolBar;
  private toolGroup!: HTMLElement;
  private readonly typeTabs = new Map<CollisionType, HTMLButtonElement>();
  /**
   * The geometry's twin index (`./hullGeometry` `twinIndexOf`: each face's coincident faces, which a collision dab paints
   * with it), kept for the geometry it was read off until an edit changes its shape (`edit`, but a paint stroke's).
   */
  private twinIndex: { geo: WorldGeometry; twins: ReturnType<typeof twinIndexOf> } | null = null;
  private twinsOf(): ReturnType<typeof twinIndexOf> {
    const geo = this.geo!;
    if (this.twinIndex?.geo !== geo) this.twinIndex = { geo, twins: twinIndexOf(geo) };
    return this.twinIndex.twins;
  }
  private stroke: {
    pointerId: number; lastX: number; lastY: number; done: Set<string>; faces: number;
    twins: (o: GeoObject, f: number) => { o: GeoObject; f: number }[];
  } | null = null;
  private strokeDrawQueued = false;
  /**
   * The Layer tabs, the object bar's first section (the owner, 2026-11-15: "in the second toolbar ... a geometry layer
   * and a collision layer"; then "like a quicktab, similar to ... the little tabs in the asset browser", their
   * `.fx-asset-tab` look): what Geometry mode's tools edit, the drawn geometry or the collision (`setCollision`).
   */
  private readonly layerTabs = new Map<'geometry' | 'collision' | 'texture', HTMLButtonElement>();
  private layerGroup!: HTMLElement;
  /** The drawn geometry, in either mode. */
  private get drawGeometry(): WorldGeometry | null { return this.collisionOn ? this.drawGeo : this.geo; }
  private forMap: LoadedMap | null = null;
  private sel: Selection = emptySelection('object');
  /** The object the last pick landed on: its points and edges drawn in point and edge mode, to pick from. */
  private focus: string | null = null;
  private drawn: WorldView | null = null;
  /** The Display menu's Wireframe, as the page has it (`setWireframe`). */
  private wireOn = false;
  /** The polygon edges drawn for the Wireframe in Geometry mode (`drawEdges`). */
  private readonly edges = new Group();
  /** Each drawn edge end's point (and its mesh), for the live drag; -1 for a displacement grid's. */
  private edgeRefs: { meshes: EditMesh[]; meshOf: Int32Array; verts: Int32Array } | null = null;
  private draws: LoadedMesh[] | null = null;
  private built: GroundData | null = null;
  private edited = false;
  /**
   * Bug 1 (saving): a person's edit made the geometry what it is -- an edit, an undo or a redo to one, or a saved one put
   * back (`restoreSaved`). Not set by a blank base's own floor (`edited` is: the floor is drawn from the start), so a
   * layout that never touched its geometry saves none (`savedGeometry`).
   */
  private authored = false;
  /**
   * The collision rebuilt by itself (the owner, 2026-11-15: no Build button, "update the collision mesh in real time";
   * measured 2026-11-15: a whole Build 3-18 ms on MP6, MP51 and MP72): after each edit, undo and redo, once a burst of
   * them settles (`BUILD_SETTLE_MS`), and at once when the walk or Play asks for the map (`editedMap`). A gizmo drag is
   * one edit, at its release. The AI grid is not rebuilt with it.
   */
  private stale = false;
  private buildTimer: ReturnType<typeof setTimeout> | null = null;
  private buildSoon(): void {
    this.stale = true;
    if (this.buildTimer) clearTimeout(this.buildTimer);
    this.buildTimer = setTimeout(() => { this.buildTimer = null; if (this.stale) this.build(); }, BUILD_SETTLE_MS);
  }
  /** A rebuild still waiting made now (the walk or Play reading the map in the settle's moment). */
  private buildNow(): void {
    if (this.buildTimer) { clearTimeout(this.buildTimer); this.buildTimer = null; }
    if (this.stale) this.build();
  }
  private cancelBuild(): void {
    if (this.buildTimer) { clearTimeout(this.buildTimer); this.buildTimer = null; }
    this.stale = false;
  }
  private sculpting = false;
  private active = false;
  private texelScale: number | null = null;
  private readonly overlay = new Group();
  /** What stays put while the gizmo drags: the selected objects' other handles, and the drag's live edges. */
  private readonly fixed = new Group();
  /** The drag's live preview: the edges at the moving points, their moving ends carried by the gizmo (`onDragMove`). */
  private preview: { lines: LineSegments; ends: { at: Vec3; moves: boolean }[] } | null = null;
  /** What the pointer is over, in the mode's terms (`drawHover`): drawn apart from the selection, rebuilt only when it changes. */
  private readonly hover = new Group();
  private hoverKey = '';
  private hoverAt: { x: number; y: number } | null = null;
  private hoverQueued = false;
  /** An object's triangles (world space), kept for its hover until the geometry changes. */
  private readonly trisCache = new Map<string, Float32Array>();
  private readonly pivot = new Object3D();
  private readonly gizmo: TransformControls;
  /** The gizmo's pointer entry points, which take the viewport pointer `{ x, y, button }` (NDC) the page also feeds it. */
  private get drive(): { pointerHover(p: GizmoPointer): void; pointerDown(p: GizmoPointer): void; pointerMove(p: GizmoPointer): void; pointerUp(p: GizmoPointer): void } {
    return this.gizmo as unknown as { pointerHover(p: GizmoPointer): void; pointerDown(p: GizmoPointer): void; pointerMove(p: GizmoPointer): void; pointerUp(p: GizmoPointer): void };
  }
  private dragStart: Matrix4 | null = null;
  /** The pick index (`./selection` `PickIndex`): every pick and visibility test, rebuilt when the geometry changes. */
  private index: PickIndex | null = null;
  /** A left press not on the gizmo: a click at its release, or a drag select once it moves past `PAINT_DRAG_PX`. */
  private press: { x: number; y: number; ndc: Vector2; pointerId: number; shift: boolean; ctrl: boolean; painting: boolean; lastX: number; lastY: number } | null = null;
  /** Where each drawn vertex came from (`compileDraws`' sources), for the live drag. */
  private sources: DrawSources = new Map();
  /**
   * The live drag (a level editor's: the faces bend as the gizmo moves): the drawn vertices and edge ends on a moving point, each
   * with where it stood, written each move into the buffers the view already has. Nothing is rebuilt until the release.
   */
  private live: { attr: BufferAttribute | InterleavedBufferAttribute; mesh: Mesh; at: number[]; base: number[] }[] = [];
  /**
   * The live drag's texture (the owner, 2026-11-17: "the live preview should always show the correct texture"): each
   * drawn vertex of a face partly moved that carries a mapping -- its uv attribute and index, the mapping, its texture's
   * size, the point it stands on (as read) and whether that point moves, and its uv as drawn (put back on Escape). Each
   * drag step lays its uv from the mapping at where the point now is, as the release's `transformVerts` will (a face
   * moved whole keeps its uvs under texture lock, so it needs none).
   */
  private liveUv: { attr: BufferAttribute | InterleavedBufferAttribute; i: number; map: TextureMapping; size: readonly [number, number]; at: Vec3; moves: boolean; uv: [number, number] }[] = [];
  /** The viewport's World / Local (`syncGizmo`): Local turns the pivot onto the selection's own axes (`localFrame`). */
  private space: 'world' | 'local' = 'world';
  /** The handle clouds drawn, each resized every frame to a fixed size on screen (`frameHandles`). */
  private readonly clouds = new Set<InstancedMesh>();
  private dragCopy = false;
  /** A Shift-drag on the move gizmo: an extrude, made as the drag starts (`beginDragExtrude`). */
  private dragExtrude = false;
  /**
   * The extrude a Shift-drag made at its start: the geometry and selection as they were (put back when the drag ends
   * where it began), and per object the new faces with their source's texel scale (world-aligned at the release).
   */
  private extruding: { objects: GeoObject[]; sel: Selection; made: Map<string, { faces: number[]; texel: number; sides?: number[][]; pairs?: [number, number][] }> } | null = null;
  /**
   * The collision view following a drag (the owner, 2026-11-15: "the collision geometry preview update in realtime as I
   * edit the world geometry ... to see the colors move"): the drag applied for a moment, the collision built from it
   * and shown, every value it touched put back as it was (`previewCollision`); at most every `PREVIEW_MS`, the last
   * place always shown. A Ctrl-drag copy is not previewed (its copy is made at the release).
   */
  private previewAt = 0;
  private previewTimer: ReturnType<typeof setTimeout> | null = null;
  private previewShown = false;
  private previewSoon(delta: Matrix4): void {
    if (this.dragCopy) return;
    const wait = PREVIEW_MS - (performance.now() - this.previewAt);
    if (this.previewTimer) clearTimeout(this.previewTimer);
    const run = (): void => { this.previewTimer = null; if (this.dragStart) this.previewCollision(delta.clone()); };
    if (wait <= 0) run(); else this.previewTimer = setTimeout(run, wait);
  }
  private previewCollision(delta: Matrix4): void {
    const geo = this.geo;
    if (!geo) return;
    this.previewAt = performance.now();
    const mat = delta.elements;
    const object = this.sel.mode === 'object';
    const kept: { o: GeoObject; verts: Map<number, [number, number, number]>; moved: GeoObject['moved']; reshaped: GeoObject['reshaped'] }[] = [];
    // C1: an object moved whole takes its hand-edited collision along, for the moment as at the release.
    const followers: { h: GeoObject; verts: Float64Array }[] = [];
    const done = new Map<EditMesh, Set<number>>();
    try {
      for (const id of this.sel.objects) {
        const o = this.objectById(id);
        if (!o) continue;
        const m = o.mesh;
        const seen = done.get(m) ?? new Set<number>();
        done.set(m, seen);
        const verts = new Map<number, [number, number, number]>();
        for (const v of selectionVerts(this.sel, o)) {
          if (seen.has(v)) continue;                           // a point two selected nodes share: moved once
          seen.add(v);
          const p = vertPos(m, v);
          verts.set(v, [p[0]!, p[1]!, p[2]!]);
          const q = new Vector3(p[0], p[1], p[2]).applyMatrix4(delta);
          m.verts[v * 3] = q.x; m.verts[v * 3 + 1] = q.y; m.verts[v * 3 + 2] = q.z;
        }
        kept.push({ o, verts, moved: o.moved, reshaped: o.reshaped });
        // As the release's edit leaves it: a node moved whole carries its read hull (`moved`), one reshaped its faces'.
        if (object) {
          if (o.group !== undefined) o.moved = mul4(Array.from(mat), o.moved ?? IDENTITY4);
          if (!this.collisionOn) for (const h of followersOf(this.hullGeo, o)) { followers.push({ h, verts: Float64Array.from(h.mesh.verts) }); moveFollower(h, mat); }
        } else markReshaped(o);
      }
      if (!kept.length) return;
      this.previewShown = true;
      if (this.collisionOn) this.deps.onCollisionView?.(true);    // the hull objects drawn as they stand this moment
      else this.deps.onCollisionPreview?.(buildHullWith(geo, this.hullGeo));
    } finally {
      for (const { h, verts } of followers) for (let i = 0; i < verts.length; i++) h.mesh.verts[i] = verts[i]!;
      for (const k of kept) {
        for (const [v, p] of k.verts) { k.o.mesh.verts[v * 3] = p[0]; k.o.mesh.verts[v * 3 + 1] = p[1]; k.o.mesh.verts[v * 3 + 2] = p[2]; }
        if (k.moved) k.o.moved = k.moved; else delete k.o.moved;
        if (k.reshaped) k.o.reshaped = k.reshaped; else delete k.o.reshaped;
      }
    }
  }
  /** The drag over: the preview's timer stopped, the view handed back to the collision as it stands. */
  private endPreview(): void {
    if (this.previewTimer) { clearTimeout(this.previewTimer); this.previewTimer = null; }
    if (!this.previewShown) return;
    this.previewShown = false;
    if (this.collisionOn) this.deps.onCollisionView?.(true);
    else this.deps.onCollisionPreview?.(null);
  }
  private readonly status: HTMLSpanElement;
  /** The texture Apply and a new shape lay (a key of the map's `textures`), or null for none. */
  private textureName: string | null = null;
  /** The Texture button: the texture's swatch and name, a press the asset browser's Textures (`browseTextures`). */
  private readonly textureBtn: HTMLButtonElement;
  private readonly textureSwatch: HTMLCanvasElement;
  private readonly textureLabel: HTMLSpanElement;
  private readonly buttons = new Map<string, HTMLButtonElement>();

  constructor(private readonly deps: GeometryEditorDeps) {
    const { doc } = deps;
    this.overlay.name = 'forge-geometry-overlay';
    this.overlay.matrixAutoUpdate = false;
    this.hover.name = 'forge-geometry-hover';
    this.fixed.name = 'forge-geometry-fixed';
    this.edges.name = 'forge-geometry-edges';
    this.edges.visible = this.wireOn;
    deps.scene.add(this.edges, this.overlay, this.fixed, this.hover, this.pivot, this.strokeLayer, this.knifeLayer);
    this.gizmo = new TransformControls(deps.camera(), deps.input);
    this.gizmo.disconnect();                                   // driven by the editor's own pointer handlers below
    tightenGizmo(this.gizmo);                                  // hit only near its handles, no negative-side handles (`../gizmoPick`)
    this.gizmo.addEventListener('dragging-changed', (e) => this.onDragging((e as unknown as { value: boolean }).value));
    this.gizmo.addEventListener('objectChange', () => this.onDragMove());
    deps.scene.add(this.gizmo.getHelper());
    deps.scene.add(this.blockPreview, this.blockHandles, this.blockSolid, this.blockStartDot, this.blockStartCross);
    this.gizmo.getHelper().visible = false;

    deps.tools.hidden = true;
    deps.modeTools.hidden = true;
    // A labelled section of the object bar, as its placing sections are (`.fx-mode-section`).
    const group = (label: string, ...kids: HTMLElement[]): HTMLDivElement => {
      const sec = doc.createElement('div'); sec.className = 'fx-mode-section fx-geo-section'; sec.setAttribute('role', 'group'); sec.setAttribute('aria-label', label);
      const name = doc.createElement('span'); name.className = 'fx-mode-section__label'; name.textContent = label;
      const g = doc.createElement('div'); g.className = 'fx-group'; g.append(...kids);
      sec.append(name, g); return sec;
    };
    // The selection modes on the top toolbar, beside the mode picker (the owner, 2026-11-15).
    deps.modeTools.classList.add('fx-group');
    deps.modeTools.setAttribute('role', 'group');
    deps.modeTools.setAttribute('aria-label', 'Select');
    // "Select" before the modes, "Layer" before the layers (the owner, 2026-11-16), as the second toolbar labels its sections.
    const label = (text: string, extra = ''): HTMLSpanElement => {
      const l = doc.createElement('span'); l.className = `fx-mode-section__label fx-bar-label${extra}`; l.textContent = text; return l;
    };
    deps.modeTools.append(label('Select'), ...MODES.map((m) => this.button(`mode-${m.mode}`, m.label, `Select ${m.plural} (${m.key})`, () => this.setMode(m.mode))));
    const layerRow = doc.createElement('div');
    layerRow.className = 'fx-asset-tabs fx-geo-layer-tabs';
    layerRow.setAttribute('role', 'tablist');
    layerRow.setAttribute('aria-label', 'Layer');
    for (const [v, label, title] of [
      ['geometry', 'Geometry', 'Edit the drawn geometry'],
      ['collision', 'Collision', 'Edit the collision with the same tools; Collision type sets what a face is'],
      ['texture', 'Texture', 'Paint textures on the faces: choose a texture, then click or drag over faces (the geometry is not edited here)'],
    ] as const) {
      const b = doc.createElement('button');
      b.type = 'button';
      b.className = 'fx-asset-tab';
      b.setAttribute('role', 'tab');
      b.textContent = label;
      b.title = title;
      b.addEventListener('click', () => {
        this.setLayer(v);
        this.collisionUi();                                    // the tabs as they stand (a refused turn left as it was)
        b.blur();                                              // the keys go back to the viewport
      });
      this.layerTabs.set(v, b);
      layerRow.append(b);
    }
    // On the top toolbar beside the selection modes (the owner, 2026-11-16: "move the layer switch from the second
    // toolbar to the top most toolbar next to the object/point/edge/face"), a gap between them.
    layerRow.classList.add('fx-geo-layer-top');
    deps.modeTools.append(label('Layer', ' fx-geo-layer-label'), layerRow);
    this.layerGroup = layerRow;
    // Two sections (the owner, 2026-11-20: "lets just go with a Edit and Select section"): the tools that change the
    // geometry, then those that change the selection. A section with no tool for the mode is hidden (`drawBar`).
    deps.tools.append(
      (this.editGroup = group('Edit',
        this.button('extrude', 'Extrude', 'Extrude the selected faces (then move them with the gizmo)', () => this.extrude()),
        this.button('inset', 'Inset', 'Inset (Shift+I) the selected faces: shrunk in by a grid step, a ring of new faces round them (then scale them with the gizmo for more or less)', () => this.inset()),
        this.button('bevel', 'Bevel', 'Bevel (Alt+F): each selected edge (between two faces) replaced by a face a grid step across; on faces, their outline bevelled', () => this.bevel()),
        this.button('extend', 'Extend', 'Extend (N): each selected open edge given a new face, a grid step out in the plane of its face (the Amount in the settings)', () => this.extendSelection()),
        this.button('thicken', 'Thicken', 'Thicken Faces (G): the selected faces given a back a grid step behind them and walls round their border -- a sheet, such as a plane, whose border is all open', () => this.thicken()),
        this.button('bridge', 'Bridge', 'Bridge (B): join two selected faces with new faces between them (the two removed), or two open edges (or two runs of open edges, as many in each) with faces', () => this.bridge()),
        this.button('fill', 'Fill Hole', 'Fill Hole: each hole a selected open edge lies on (a loop of edges with a face on one side only) capped with one face', () => this.fillSelection()),
        this.button('knife', 'Knife', 'Knife (C): click points on vertices, edges or across faces -- on the grid while snapping (Ctrl flips it; Shift: only in line with the last point; V: loop mode, a click cuts the loop through an edge); Enter cuts straight across the faces between them, Backspace takes a point back, Esc leaves', () => this.setKnife(!this.knifeOn)),
        this.button('loopcut', 'Loop Cut', 'Loop Cut: a new edge loop through the middle of the selected edges\u2019 rings (across the four-sided faces beside them)', () => this.loopCutSelection()),
        this.button('connect', 'Connect', 'Connect: the selected edges split at their middles and joined across the faces they share (select a ring, then Connect: a loop cut); in Point mode, the selected points joined in the order picked, straight across the faces between', () => this.connectSelection()),
        this.button('subdivide', 'Subdivide', 'Subdivide (Quad Slice): each selected four-cornered face cut in four through its sides\' middles (a face without four corners is left whole); each selected edge split at its middle', () => this.subdivide()),
        this.button('merge', 'Merge', 'Merge: the selected points made one where the last picked one is, or those within a range (the settings); in Edge mode, open edges welded together', () => this.mergeSelection()),
        this.button('collapse', 'Collapse', 'Collapse (Shift+O): each run of selected edges, or each selected face, made one point at its middle', () => this.collapseSelection()),
        this.button('mergemeshes', 'Merge Meshes', 'Merge Meshes: the selected objects made one object, the first picked (nothing welded: their shapes stay as they are, in one mesh)', () => this.mergeMeshes()),
        this.button('separate', 'Separate', 'Separate (Alt+N): make the selected faces an object of their own', () => this.separate()),
        this.button('flip', 'Flip', 'Flip all faces of the selected objects (in Face mode: of the objects the selected faces are in)', () => this.edit('Flip faces', () => this.forFaces((m, fs, o) => flipFaces(m, this.sel.mode === 'face' ? objectFaces(o) : fs)))),
        this.button('snapgrid', 'Snap to Grid', 'Snap to Grid (Ctrl+B): every selected point (or the points of the selected edges or faces) put on the grid of the snap step, on the workplane', () => this.snapToGrid()),
        this.button('snapvert', 'Snap to Vertex', 'Snap to Vertex (B): the selected points all moved onto the last one picked (they stay separate points; Merge joins them)', () => this.snapToVertex()),
        this.button('snapedge', 'Snap Edges', 'Snap Edges (I): the first selected edge moved onto the second, end to end the way they run', () => this.snapEdgeToEdge()),
        this.button('dissolve', 'Dissolve', DISSOLVE_TITLE, () => this.dissolveSelection()),
        this.button('delete', 'Delete', 'Delete the selection and the faces it is part of, leaving a hole (Delete)', () => this.deleteSelection()),
      )),
      (this.selectGroup = group('Select',
        this.button('grow', 'Grow Selection', 'Grow Selection (Numpad +): the points, edges or faces touching the selection added', () => this.growSelection('grow')),
        this.button('shrink', 'Shrink Selection', 'Shrink Selection (Numpad −): the selection’s border taken off', () => this.growSelection('shrink')),
        this.button('loop', 'Select Edge Loop', 'Select Edge Loop (L): the selected edges’ loops added (a double-click on an edge selects its loop)', () => this.selectEdges('loop')),
        this.button('ring', 'Select Edge Ring', 'Select Edge Ring (G): the selected edges’ rings added (across the even-sided faces beside them)', () => this.selectEdges('ring')),
        this.button('ribs', 'Select Ribs', 'Select Ribs (Ctrl+G): from a selected run or loop of edges, the edges across it on both sides, out through the four-sided faces', () => this.selectRibs()),
      )),
    );
    // The texture a button, not a list (the owner, 2026-11-16): the asset browser's Textures tab chooses it.
    this.textureBtn = doc.createElement('button');
    this.textureBtn.type = 'button';
    this.textureBtn.className = 'fx-tool fx-geo-texture';
    this.textureBtn.setAttribute('aria-haspopup', 'dialog');
    this.textureSwatch = doc.createElement('canvas');
    this.textureSwatch.className = 'fx-geo-texture-swatch';
    this.textureSwatch.width = this.textureSwatch.height = 32;
    this.textureLabel = doc.createElement('span');
    this.textureLabel.className = 'fx-geo-texture-name';
    const caret = doc.createElement('span');
    caret.className = 'fx-climb-caret';
    caret.textContent = '▾';
    this.textureBtn.append(this.textureSwatch, this.textureLabel, caret);
    this.textureBtn.addEventListener('click', () => { this.deps.browseTextures?.(this.textureBtn); this.textureBtn.blur(); });
    this.drawTextureButton();
    // The collision types as quick tabs, each with its colour in the collision view (`../hull` `HULL_COLOURS`).
    const typeRow = doc.createElement('div');
    typeRow.className = 'fx-asset-tabs fx-geo-layer-tabs';
    typeRow.setAttribute('role', 'tablist');
    typeRow.setAttribute('aria-label', 'Collision type');
    for (const t of COLLISION_TYPES) {
      const b = doc.createElement('button');
      b.type = 'button';
      b.className = 'fx-asset-tab';
      b.setAttribute('role', 'tab');
      b.title = `${t.label}: ${t.note}`;
      const sw = doc.createElement('span');
      sw.className = 'fx-type-swatch';
      sw.style.background = hexOf(TYPE_COLOURS[t.type]);
      const word = doc.createElement('span');
      word.textContent = t.label;
      b.append(sw, word);
      if (t.type === 'climbable') {
        // One button for Climbable and its climb flag (the owner, 2026-11-15: "merge this into a single button"): its
        // flag on it, a click opening the flags; choosing one paints Climbable with it.
        const flag = doc.createElement('span');
        flag.className = 'fx-climb-flag';
        const caret = doc.createElement('span');
        caret.className = 'fx-climb-caret';
        caret.textContent = '\u25be';
        b.append(flag, caret);
        b.title = 'Climbable: click to choose the climb flag (1 and 3 by height, 2 a ladder, 4 the crate climb, 5 always climb over); Paint or Apply lays it';
        b.setAttribute('aria-haspopup', 'menu');
        this.climbFlagLabel = flag;
        b.addEventListener('click', () => { this.toggleClimbMenu(b); b.blur(); });
      } else {
        // A type's tab is the active type (the owner, 2026-11-16: Select, Paint, Sample): Paint or Apply lays it.
        b.addEventListener('click', () => { this.pickType(t.type); b.blur(); });
      }
      this.typeTabs.set(t.type, b);
      typeRow.append(b);
    }
    this.toolBar = new PaintToolBar(doc, {
      onTool: (t) => this.setTool(t),
      onApply: () => (this.textureOn ? this.texturing('apply') : this.applyCollisionType()),
      titles: {
        select: 'Select: pick faces (or objects, edges, vertices) to Apply to; drag to select many (Esc)',
        paint: 'Paint: click or drag over faces to lay the active texture or collision type; Shift+click samples',
        sample: 'Sample: click a face to take its texture or collision type as the active one',
        apply: 'Apply the active texture or collision type to the selection',
      },
    });
    // Create last of the tools, its shape right beside it (the owner, 2026-11-17: "in collision mode, create button should
    // be next to the dropdown"): Select | Create on the Geometry layer; Select | Paint | Sample | Create on Collision.
    // Block beside Select (the owner, 2026-11-17: "bring back the select workflow to the geometry mode, it should be a tool
    // and turned on by default ... Tool Select | Block"), its shape beside the section while it is on.
    this.toolBar.addTab('block', 'Create', 'Create: drag a shape out -- press and drag a rectangle on the workplane (shown; on its grid while snapping) or on the surface pressed (by its normal, unsnapped), let go, move to set its height, click or Enter to make it. Esc cancels, then back to Select', 'apply', () => this.setBlockOn(true));
    this.toolBar.tabOf('block')?.after(this.blockToolUi());
    // The tools on the top toolbar, first, as Object mode's (the owner, 2026-11-17: "for all the tools section in geometry
    // and ai nav mode, move it to the top toolbar like the object mode, and call it Tools ... make sure the tools are the
    // first in the list(left)"): before the selection modes and the layers.
    this.toolGroup = this.toolBar.row;
    deps.modeTools.prepend(label('Tools'), this.toolBar.row);
    // The Geometry layer's from the start (the owner, 2026-11-17: "the paint/sample buttons shouldn't even be there in geo
    // layer"): Select and Create alone; the Collision and Texture layers show the rest (`collisionUi`).
    for (const k of ['paint', 'sample', 'apply']) this.toolBar.setShown(k, false);
    deps.tools.append(
      (this.surfaceGroup = group('Collision',
        typeRow,
      )),
      (this.textureGroup = group('Texture',
        this.textureBtn,
        // Select, Paint, Sample and Apply are the Tool section's (`toolBar`); aligning, scaling, shifting, rotating, fitting
        // and justifying are the Inspector's Texture State and Modify Texture (`textureStateNow`, `modifyTexture`).
      )),
      (this.displaceGroup = group('Displace',
        this.button('displace', 'Displace', 'Make the selected four-sided faces displacements', () => this.displace()),
        this.button('sculpt', 'Sculpt', 'Click a displacement to raise it (Shift lowers, Ctrl smooths)', () => { this.sculpting = !this.sculpting; this.drawBar(); }),
      )),
      (this.viewGroup = group('View', this.propsToggle())),
    );
    this.status = doc.createElement('span');
    this.status.className = 'fx-geo-status';
    this.status.hidden = true;
    deps.statusHost.append(this.status);

    deps.input.addEventListener('pointerdown', (e) => this.onPointerDown(e), true);
    deps.input.addEventListener('pointermove', (e) => this.onPointerMove(e), true);
    deps.input.addEventListener('pointerup', (e) => this.onPointerUp(e), true);
    deps.input.addEventListener('pointerleave', () => { this.hoverAt = null; this.drawHover(); this.drawBlockStart(null); });
    deps.input.addEventListener('pointercancel', () => { this.press = null; });
    // A double-click on an edge selects its loop (Edge mode; every modeller's): the second click picked the
    // edge (alone, or added with Shift), and its loop joins it.
    deps.input.addEventListener('dblclick', (e) => {
      if (!this.active || this.sel.mode !== 'edge' || this.blockOn || this.polyOn || !this.lastEdgePick || !this.geo) return;
      // The face under the pointer: the side a loop that cannot go on runs round (`edgeLoop`'s `side`).
      const hit = pickFace(this.geo, this.rayAt(this.ndc(e as PointerEvent), this.deps.camera()), this.index);
      this.selectEdges('loop', [{ ...this.lastEdgePick, ...(hit && hit.object.id === this.lastEdgePick.id ? { side: hit.face } : {}) }]);
    });
    const tick = (): void => { if (this.clouds.size) this.frameHandles(); requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    doc.addEventListener('keydown', (e) => this.onKey(e), true);
    // Shift held while painting: the sampler's cursor (a Shift+click samples); let go, or the window left, the brush's.
    doc.addEventListener('keydown', (e) => { if (e.key === 'Shift') this.setShiftHeld(true); if (e.key === 'Control' || e.key === 'Meta') this.setCtrlHeld(true); }, true);
    doc.addEventListener('keyup', (e) => { if (e.key === 'Shift') this.setShiftHeld(false); if (e.key === 'Control' || e.key === 'Meta') this.setCtrlHeld(false); }, true);
    doc.defaultView?.addEventListener('blur', () => this.setShiftHeld(false));
  }

  /* ---------- the page's hooks ---------- */

  /**
   * A new base: the geometry of the old one goes from here -- kept, when a person edited it, in the layout's saves (bug 1:
   * `savedGeometry`, the page's autosave and its "Save first?"), and put back by the open of a layout naming it.
   */
  reset(): void {
    this.setActive(false);
    if (this.drawn) this.deps.onViewSwap(null);
    this.disposeView();
    this.geo = null;
    this.forMap = null;
    this.draws = null;
    this.built = null;
    this.edited = false;
    this.authored = false;
    this.cancelBuild();
    this.texelScale = null;
    this.sel = emptySelection(this.sel.mode);
    this.leaveCollision();
    this.deps.baseWorldShown(true);
  }

  isActive(): boolean { return this.active; }
  /**
   * A test instrument's read (a development build's `__forgeCollision`, no game behaviour): the objects the tools work on
   * now, each with its collision words tallied by type, and the editor's state -- the layer, the brush, the last Build.
   */
  debugState(): {
    active: boolean; collision: boolean; painting: string | null; edited: boolean; stale: boolean; builtPolys: number | null;
    objects: { id: string; name: string; kind: string; hullNode?: number; hullOf?: string; manual: boolean; solid: boolean; faces: number; types: Record<string, number>; centre: number[] | null }[];
    pivot: number[] | null;
    live: { verts: number; overlay: number[] };
    selection: GeometrySelectionState | null;
    /** What the hover highlights under the pointer (its key; '' for nothing), and whether Create is on. */
    hover: string;
    creating: boolean;
    /** Create's previews shown: the shape's faces (with the texture they wear), its start marker, its resize handles. */
    createPreview: { solid: boolean; texture: string | null; start: boolean; handles: number };
    /** The Texture layer's selected faces' Texture State (`textureStateNow`), null off it. */
    texture: TextureState | null;
  } {
    return {
      selection: this.selectionState(),
      hover: this.hoverKey, creating: this.blockOn || this.polyOn, texture: this.textureStateNow(),
      createPreview: { solid: this.blockSolid.visible, texture: this.blockSolid.visible && (this.blockSolid.material as MeshBasicMaterial).map ? this.blockTex?.name ?? null : null, start: this.blockStartDot.visible, handles: this.blockHandles.visible ? this.blockHandleAt.length : 0 },
      active: this.active, collision: this.collisionOn, painting: this.paintOn ? this.collisionType : null, edited: this.edited, stale: this.stale,
      builtPolys: this.built ? this.built.fields.length / 6 : null,
      objects: (this.geo?.objects ?? []).map((o) => {
        const types: Record<string, number> = {};
        const words = wordsOf(o, null);
        const faces = liveFaces(o.mesh).filter((f) => o.group === undefined || o.mesh.faces[f]!.group === o.group);
        if (this.collisionOn) for (const f of faces) { const t = this.typeWords(words(f)); types[t] = (types[t] ?? 0) + 1; }
        return {
          id: o.id, name: o.name, kind: o.kind, ...(o.hullNode !== undefined ? { hullNode: o.hullNode } : {}), ...(o.hullOf !== undefined ? { hullOf: o.hullOf } : {}),
          manual: !!o.manual, solid: !!o.solid, faces: faces.length, types,
          // An object of its own mesh: the mean of its points (a node shares the world's mesh: none).
          centre: o.group === undefined && o.mesh.verts.length ? [0, 1, 2].map((k) => { let t = 0, n = 0; for (let i = k; i < o.mesh.verts.length; i += 3) { t += o.mesh.verts[i]!; n++; } return t / n; }) : null,
        };
      }),
      pivot: this.gizmo.object && this.gizmo.getHelper().visible ? [this.pivot.position.x, this.pivot.position.y, this.pivot.position.z] : null,
      // A live drag's state (the gizmo's or a Transform field's): the vertices it carries and the highlight's move.
      live: { verts: this.live.reduce((n, l) => n + l.at.length, 0), overlay: [this.overlay.matrix.elements[12]!, this.overlay.matrix.elements[13]!, this.overlay.matrix.elements[14]!] },
    };
  }

  /** A test instrument's read: the object and face a click at viewport point `ndc` would take, and the face's normal. */
  debugPick(x: number, y: number): { id: string; face: number; up: number } | null {
    if (!this.geo) return null;
    const hit = pickFace(this.geo, this.rayAt(new Vector2(x, y), this.deps.camera()), this.index);
    return hit ? { id: hit.object.id, face: hit.face, up: polygonNormal(facePoints(hit.object.mesh, hit.face))[1] } : null;
  }

  /** Collision mode (the mode picker's Collision mode): the tools on the collision, `setCollision`. */
  isCollision(): boolean { return this.active && this.collisionOn; }

  /**
   * The box F frames in Geometry mode (a level editor's frame selection): every point the selection moves -- an object's all, a
   * face's, an edge's two, a point -- with a metre of room round it, so one point frames close, not into it. Null with
   * nothing selected.
   */
  selectionBounds(): Box3 | null {
    if (!this.geo) return null;
    const box = new Box3();
    const p = new Vector3();
    for (const id of this.sel.objects) {
      const o = this.objectById(id);
      if (!o) continue;
      for (const v of selectionVerts(this.sel, o)) box.expandByPoint(p.set(...vertPos(o.mesh, v)));
    }
    if (box.isEmpty()) return null;
    return box.expandByScalar(1 / (this.forMap?.metersPerUnit || 1));
  }

  /**
   * View > Props (the owner, 2026-11-15): props cannot be edited in Geometry mode and stand in the way, so the mode hides
   * them, and the box shows them again to judge the geometry among them. The choice is kept while the page is open; out
   * of the mode the props are always drawn.
   */
  private showProps = false;
  /** View > Props again over the page's own drawing (a Display switch redraws the props). */
  applyProps(): void { if (this.active && !this.showProps) this.deps.propsShown(false); }
  private propsBox: HTMLInputElement | null = null;
  /**
   * The View group (Props), Geometry mode's and Collision mode's alike (the owner, 2026-11-15: World taken out, then
   * "in the collision settings, similar to geometry, add the show props toggle"): one setting for both modes. The world
   * draws in Collision mode as the Display menu has it (hiding it with Display's Geometry on was "a weird bug"); only the
   * picks are the collision's.
   */
  private viewGroup: HTMLElement | null = null;
  /** What draws in Collision mode: left to the Display menu and View > Props, as in Geometry mode. */
  private applyWorldShown(): void {
    if (this.viewGroup) this.viewGroup.hidden = false;
  }
  private propsToggle(): HTMLLabelElement {
    const row = this.deps.doc.createElement('label');
    row.className = 'fx-toggle fx-geo-check';
    row.title = 'Show the props (the map’s and the ones placed) while editing geometry; they cannot be edited here';
    const box = this.deps.doc.createElement('input');
    box.type = 'checkbox';
    box.checked = this.showProps;
    box.addEventListener('change', () => { this.showProps = box.checked; if (this.active) this.deps.propsShown(this.showProps); });
    const word = this.deps.doc.createElement('span');
    word.textContent = 'Props';
    row.append(box, word);
    this.propsBox = box;
    return row;
  }

  /** The edited world's own view (null until an edit), for the page's view switches (`applyView`). */
  view(): WorldView | null { return this.drawn; }

  /**
   * The Display menu's Wireframe in Geometry mode (the owner, 2026-11-15: "draw the real polygon edges"): the edges of
   * the faces as edited -- a box's quad as four edges, a disc triangle as three -- in place of the triangles the GPU draws,
   * which the page turns off while the mode is on, as a level editor's tools show a mesh's edges and never its triangulation.
   */
  setWireframe(on: boolean): void {
    if (on === this.wireOn) return;
    this.wireOn = on;
    // Shown or hidden, not drawn again: a split view's own Wireframe turns it for each view's draw, every frame.
    this.edges.visible = on;
  }

  /** The polygon edges of every visible object (displacements as their grids), hidden behind the geometry. */
  private drawEdges(): void {
    clearGroup(this.edges);
    this.edgeRefs = null;
    if (!this.active || !this.geo) return;
    const positions: number[] = [];
    const refMeshes: EditMesh[] = [], meshOf: number[] = [], vertOf: number[] = [];
    const meshes = new Map<EditMesh, Set<number | undefined> | null>();
    for (const o of this.geo.objects) {
      if (o.hidden) continue;
      const groups = meshes.get(o.mesh);
      if (o.group === undefined) meshes.set(o.mesh, null);
      else if (groups !== null) meshes.set(o.mesh, new Set([...(groups ?? []), o.group]));
    }
    for (const [m, groups] of meshes) {
      const faces = liveFaces(m).filter((f) => !groups || groups.has(m.faces[f]!.group));
      const mi = refMeshes.push(m) - 1;
      for (const e of edgeMap(m, faces.filter((f) => !m.faces[f]!.disp)).values()) {
        positions.push(...vertPos(m, e.a), ...vertPos(m, e.b));
        meshOf.push(mi, mi);
        vertOf.push(e.a, e.b);
      }
      for (const f of faces) {
        if (!m.faces[f]!.disp) continue;
        const g = displacementGrid(m, f);
        const side = Math.round(Math.sqrt(g.points.length));
        for (let j = 0; j < side; j++) for (let i = 0; i < side; i++) {
          const k = j * side + i;
          if (i + 1 < side) { positions.push(...g.points[k]!, ...g.points[k + 1]!); meshOf.push(mi, mi); vertOf.push(-1, -1); }
          if (j + 1 < side) { positions.push(...g.points[k]!, ...g.points[k + side]!); meshOf.push(mi, mi); vertOf.push(-1, -1); }
        }
      }
    }
    if (!positions.length) return;
    // Drawn as the world's own Wireframe is (`../../world` `wireframeMaterial`): the same white, opacity and depth offset
    // through the same wireframe path, so the lines read the same in every mode (the owner, 2026-11-15). Each edge a-b is
    // a triangle a-b-a, whose wireframe is the edge itself.
    const tri: number[] = [], triMesh: number[] = [], triVert: number[] = [];
    for (let k = 0; k < positions.length / 6; k++) {
      const a = positions.slice(k * 6, k * 6 + 3), b = positions.slice(k * 6 + 3, k * 6 + 6);
      tri.push(...a, ...b, ...a);
      triMesh.push(meshOf[k * 2]!, meshOf[k * 2 + 1]!, meshOf[k * 2]!);
      triVert.push(vertOf[k * 2]!, vertOf[k * 2 + 1]!, vertOf[k * 2]!);
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(Float32Array.from(tri), 3));
    const lines = new Mesh(geo, edgeMaterial());
    lines.frustumCulled = false;
    lines.renderOrder = 9;
    this.edges.add(lines);
    this.edgeRefs = { meshes: refMeshes, meshOf: Int32Array.from(triMesh), verts: Int32Array.from(triVert) };
  }

  /**
   * The viewport's transform controls, the page's one set for both gizmos (the owner, 2026-11-14: "unify it"): its
   * Move / Rotate / Scale, World / Local and the grid and turn snaps, as the page sets its own gizmo.
   */
  syncGizmo(s: { mode: 'translate' | 'rotate' | 'scale'; space: 'world' | 'local'; translationSnap: number | null; rotationSnap: number | null; surface?: { on: boolean; offset: number }; snapStep?: number; turnStep?: number; snapBy?: 'pivot' | 'centre' | 'bounds' }): void {
    if (s.surface) this.surface = { ...s.surface };
    if (s.snapStep !== undefined) this.snapStep = s.snapStep;
    if (s.turnStep !== undefined) this.turnStep = s.turnStep;
    if (s.snapBy) this.snapBy = s.snapBy;
    this.rotSnap = s.rotationSnap;
    this.gizmo.setMode(s.mode);
    this.gizmo.setSpace(s.space);
    const turned = s.space !== this.space;
    this.space = s.space;
    if (turned && this.active) this.drawSelection();
    this.gridSnap = s.translationSnap;
    this.applyDragSnaps();
  }

  /**
   * Snap by (the owner, 2026-11-17: "in object mode it should snap to center/pivot, and in geometry to edges"; then "both
   * modes should have the same settings"): Pivot -- where the gizmo sits lands on the grid (its own snap); Centre -- the
   * middle of what is moved (its box's, `boxSnapDrag`); Bounds -- a whole object lands its nearest edge on a grid line on
   * each moved axis (`boxSnapDrag`), points, edges and faces each moved point on the grid (`snapVerts`). The steps kept
   * apart from the snaps' switches, so Ctrl can turn a snap on in a drag (`ctrlHeld`).
   */
  private snapBy: 'pivot' | 'centre' | 'bounds' = 'bounds';
  private snapStep = 0;
  private turnStep = 0;
  private rotSnap: number | null = null;
  /**
   * Ctrl held (the owner, 2026-11-17: "make ctrl drag the snap"): the snaps the other way for the drag -- off while they
   * are on, on while off -- the gizmo's moves and turns, and Create's drag, pull and handles.
   */
  private ctrlHeld = false;
  /** The move snap's step as it stands now (Ctrl's flip in), or null when off. */
  private moveSnap(): number | null { return (this.gridSnap !== null) !== this.ctrlHeld && this.snapStep > 0 ? this.snapStep : null; }
  /** The turn snap's as it stands now (Ctrl's flip in), radians, or null when off. */
  private turnSnap(): number | null { return (this.rotSnap !== null) !== this.ctrlHeld && this.turnStep > 0 ? this.turnStep : null; }
  /** Whether the move snaps by the box itself (`boxSnapDrag`): Centre, or Bounds of whole objects; the World gizmo's moves. */
  private boxSnaps(): boolean {
    return (this.snapBy === 'centre' || (this.snapBy === 'bounds' && this.sel.mode === 'object')) && this.space === 'world' && this.gizmo.mode === 'translate';
  }
  /** The gizmo's own snaps as they stand: its move snap off where the box snaps itself (`boxSnapDrag`). */
  private applyDragSnaps(): void {
    const own = this.boxSnaps();
    this.gizmo.setTranslationSnap(own ? null : this.moveSnap());
    this.gizmo.setRotationSnap(this.turnSnap());
  }
  private setCtrlHeld(on: boolean): void {
    if (on === this.ctrlHeld) return;
    this.ctrlHeld = on;
    this.applyDragSnaps();
    if (this.dragStart) { this.onDragMove(); }                // a drag under way takes the flip at once
    if (this.knifeOn) { this.knifeHover = this.knifeAt(this.pointer); this.drawKnife(); }   // the Knife's point snapped or let go at once
  }
  /** Bounds for a whole-object move: where it began and the moved objects' box, at the drag's start. */
  private dragBounds: { from: Vector3; min: Vec3; max: Vec3 } | null = null;
  /**
   * Snap by Centre or Bounds (`snapBy`): the pivot moved so that, on each axis the gizmo moves along, the moved box's
   * middle (Centre) or its nearer edge to a grid line (Bounds, a level editor's: what is moved lines up by its edges) lands on it.
   */
  private boxSnapDrag(): void {
    const b = this.dragBounds;
    const step = this.moveSnap();
    if (!b || !step || !this.boxSnaps()) return;
    const axis = this.gizmo.axis ?? '';
    const p = this.pivot.position;
    const off = [p.x - b.from.x, p.y - b.from.y, p.z - b.from.z];
    for (let k = 0; k < 3; k++) {
      if (!axis.includes('XYZ'[k]!)) continue;
      const lo = b.min[k]! + off[k]!, hi = b.max[k]! + off[k]!;
      if (this.snapBy === 'centre') { const c = (lo + hi) / 2; off[k] = off[k]! + Math.round(c / step) * step - c; continue; }
      const dLo = Math.round(lo / step) * step - lo, dHi = Math.round(hi / step) * step - hi;
      off[k] = off[k]! + (Math.abs(dLo) <= Math.abs(dHi) ? dLo : dHi);
    }
    p.set(b.from.x + off[0]!, b.from.y + off[1]!, b.from.z + off[2]!);
    this.pivot.updateMatrixWorld(true);
  }

  /** The grid snap's step while it is on (`syncGizmo`): a new primitive's footing lands on it. */
  private gridSnap: number | null = null;
  /**
   * The block tool (Create's Block and its shape; the owner, 2026-11-17: "implement a Drag-out block tool on the grid", as a
   * level editor's block tool works): while on, a press drags a rectangle out on the plane --
   * the workplane, shown, on its grid while the snap is on; else the surface pressed on, by its normal, unsnapped -- the
   * release then pulls the height along the plane's normal until a click (or Enter) makes the shape. Esc cancels.
   */
  private blockOn = false;
  /**
   * The last height a shape was pulled to (Create's, Polygon's), this session: a shape made in a view that looks along
   * its plane's normal (an orthographic view's: no height to read off the pointer) takes it, else one snap step (the
   * owner, 2026-11-17: "in top/left/bottom/front ... I can't set the extrude height"; a browser adaptation, as a level editor's 2D
   * views keep the last depth).
   */
  private lastPull: number | null = null;
  /**
   * The Polygon tool (the owner, 2026-11-17: a Polygon tool in geometry mode, to create
   * custom shapes by drawing them line by line; a browser adaptation, after a level editor's): on,
   * and the outline being drawn -- its plane (the workplane, or the face first clicked, as Create's), its snap, its
   * points in the plane's frame, where the pointer is, and its phase: points clicked one by one, then the height pulled.
   */
  private get polyOn(): boolean { return this.blockOn && this.blockShape === 'polygon'; }
  private poly: { frame: BlockFrame; snap: number | null; pts: [number, number][]; cursor: [number, number] | null; phase: 'points' | 'height'; h: number } | null = null;
  private blockShape: BlockShape = 'block';
  private block: { phase: 'base' | 'height'; frame: BlockFrame; snap: number | null; a: [number, number]; b: [number, number]; h: number; pointerId: number; clicked?: true } | null = null;
  private readonly blockPreview = (() => {
    const l = new LineSegments(new BufferGeometry(), new LineBasicMaterial({ color: BLOCK_PREVIEW_COLOUR, depthTest: false, transparent: true }));
    l.renderOrder = 13;
    l.frustumCulled = false;
    l.visible = false;
    return l;
  })();
  private blockShapeSel: HTMLButtonElement | null = null;
  /** Create's menu: its button redrawn (the shape chosen), and closed; the shape its hover previews (`previewShape`). */
  private drawShapeButton: (() => void) | null = null;
  private closeShapeMenu: (() => void) | null = null;
  private hoverShape: BlockShape | null = null;
  /**
   * Each shape's settings as the user set them (`SHAPE_SETTINGS`' defaults under them; the owner, 2026-11-17: "would be
   * nice for each shape to have some settings we can predefine"), kept in this browser (`SHAPE_SETTINGS_KEY`: a browser
   * adaptation, FG.R2 -- a viewer's own preference, never the layout's).
   */
  private shapeSettingsStore: Partial<Record<BlockShape, ShapeSettings>> = readShapeSettings();
  /** Create's settings panel redrawn (the hovered shape's, else the chosen one's), the panel itself, and the menu opened or closed. */
  private drawShapeSettings: (() => void) | null = null;
  private createPanel: HTMLElement | null = null;
  /**
   * A setting being dragged (the owner, 2026-11-17: "when changing the settings via drag, it updates the preview in real
   * time"): its shape's settings with the dragged value, read by `settingsFor` until the release keeps it (`change`).
   */
  private liveSettings: { shape: BlockShape; settings: ShapeSettings } | null = null;
  private toggleShapeMenu: (() => void) | null = null;
  /**
   * The shape being made drawn as it will be (the owner, 2026-11-17: "when dragging to create it should show a live
   * preview of the geometry and texture"): its faces with the texture Create lays, a little see-through, under its outline.
   */
  private readonly blockSolid = (() => {
    const m = new Mesh(new BufferGeometry(), new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: BLOCK_SOLID_OPACITY, side: DoubleSide, depthWrite: false }));
    m.renderOrder = 12;
    m.frustumCulled = false;
    m.visible = false;
    return m;
  })();
  /** The texture the preview wears, by name (`blockTexture`): built from the map's own pixels once. */
  private blockTex: { name: string; tex: DataTexture } | null = null;
  /**
   * Where a press would start the shape (the owner, 2026-11-17: "when hovering in create mode show a preview of where the
   * start corner would be so that we know where it will initially snap to"): a dot at the corner, a cross along the
   * plane's two axes.
   */
  private readonly blockStartDot = (() => {
    const p = new Points(new BufferGeometry(), new PointsMaterial({ color: BLOCK_PREVIEW_COLOUR, size: BLOCK_HANDLE_PX, sizeAttenuation: false, depthTest: false, transparent: true }));
    p.renderOrder = 14;
    p.frustumCulled = false;
    p.visible = false;
    return p;
  })();
  private readonly blockStartCross = (() => {
    const l = new LineSegments(new BufferGeometry(), new LineBasicMaterial({ color: BLOCK_PREVIEW_COLOUR, depthTest: false, transparent: true }));
    l.renderOrder = 14;
    l.frustumCulled = false;
    l.visible = false;
    return l;
  })();
  /**
   * The shape Create made last, while it is selected alone and unchanged but for moves (`syncBlockHandles`): its frame and
   * its extent in it -- [x0, x1] along u, [y0, y1] along n, [z0, z1] along v -- the snap it was made with, its texture,
   * and its points as they stood (a move carries the frame along; any other change lets the handles go). Its handles
   * resize it (the owner, 2026-11-17: "would be nice to have handles that allow us to quickly change the size of the
   * shape after it is created").
   */
  private lastBlock: { id: string; shape: BlockShape; frame: BlockFrame; x: [number, number]; y: [number, number]; z: [number, number]; snap: number | null; textureName: string | null; verts: number[]; run: { alongZ: boolean; rev: boolean }; settings: ShapeSettings } | null = null;
  /** The handles drawn (`syncBlockHandles`): each its axis, which end, and where it is. */
  private blockHandleAt: { axis: 'x' | 'y' | 'z'; end: 0 | 1; at: Vec3 }[] = [];
  private readonly blockHandles = (() => {
    const p = new Points(new BufferGeometry(), new PointsMaterial({ color: BLOCK_PREVIEW_COLOUR, size: BLOCK_HANDLE_PX, sizeAttenuation: false, depthTest: false, transparent: true }));
    p.renderOrder = 14;
    p.frustumCulled = false;
    p.visible = false;
    return p;
  })();
  /** A handle being dragged: which, the extent as the drag began, where along its axis it was grabbed. */
  private handleDrag: { i: number; pointerId: number; x: [number, number]; y: [number, number]; z: [number, number]; grab: number } | null = null;
  /** The page's Surface snapping and its offset (`syncGizmo`): the centre handle's drag seats the objects (`surfaceSnapDrag`). */
  private surface = { on: true, offset: 0 };
  /** The pointer over the viewport (NDC), as the last move left it: where a surface-snapped drag seats the selection. */
  private pointer = new Vector2();
  /** The dragged objects' lowest point under the pivot at the drag's start (pivot y less it); null outside a drag. */
  private dragLift: number | null = null;

  /**
   * The base map as edited, for the walk and Play: the edited draws (the map's own while only its collision was edited:
   * collision editing compiles no draws), and the hull of the last Build (the disc's until one). The map itself when
   * nothing was edited.
   */
  /**
   * The edited world as drawn (the editor's own view, in place of the base's world it hides), or null with none: what the
   * page's surface picks strike once the geometry is edited -- placing, surface snapping, the camera's collision.
   */
  drawnWorld(): Object3D | null {
    return this.drawn?.group.parent ? this.drawn.group : null;
  }

  editedMap(map: LoadedMap): LoadedMap {
    if (map === this.forMap) this.buildNow();
    if (!this.edited || map !== this.forMap || (!this.draws && !this.built)) return map;
    return { ...map, world: this.draws ?? map.world, ...(this.built ? { ground: this.built } : {}) };
  }

  /**
   * The objects made here -- primitives, separated and merged pieces; not the map's own world (its nodes are the map's)
   * -- for the Outliner's Geometry section (the owner, 2026-11-15), each with whether it is selected now.
   */
  madeObjects(): { id: string; name: string; kind: GeoObject['kind']; selected: boolean }[] {
    return this.outlineObjects().filter((o) => o.kind !== 'world');
  }

  /**
   * Every geometry object for the Outliner (bug 18: "we need to see all the world geometry in the outliner. so all the map
   * sections"; a level editor's Outliner lists every object): the map's own world sections (`kind` 'world'), then the objects
   * made here. Before Geometry mode first opens the map, its sections read off the map itself (`worldSectionsOf`), with
   * the ids the opened geometry gives them, so a row's click opens the mode on that section.
   */
  /**
   * The Outliner's rows for a layer (the owner, 2026-11-15: "create another folder called collision ... always show both
   * these folders in all modes at all time"): the drawn geometry's objects, or the collision's, whichever layer the tools
   * are on -- the collision's made from the drawn geometry when its layer is not open (`hullGeometryOf`, kept until the
   * next change: `collisionOutline`). Before the editor has opened the map, its sections stand for both.
   */
  outlineObjects(layer: 'geometry' | 'collision' = this.collisionOn ? 'collision' : 'geometry'): OutlineRow[] {
    const row = (o: GeoObject, on: boolean): OutlineRow => ({
      id: o.id, name: o.name, kind: o.hullNode !== undefined ? 'world' as const : o.kind, selected: on && this.active && this.sel.objects.has(o.id),
    });
    if (this.geo) {
      if (layer === (this.collisionOn ? 'collision' : 'geometry')) return this.geo.objects.map((o) => row(o, true));
      const other = layer === 'geometry' ? this.drawGeo : this.collisionLayerNow();
      return (other?.objects ?? []).map((o) => row(o, false));
    }
    const map = this.deps.map();
    if (!map) return [];
    if (layer === 'collision') {
      // The map's collision as the Collision layer will open it (its objects' ids the same: a node's `hull:` and its
      // section's), made once a map.
      let hull = this.collisionOf.get(map);
      if (hull === undefined) { hull = map.ground ? hullGeometryOf(geometryOfMap(map), null) : null; this.collisionOf.set(map, hull); }
      return (hull?.objects ?? []).map((o) => row(o, false));
    }
    let sections = this.sectionsOf.get(map);
    if (!sections) { sections = worldSectionsOf(map); this.sectionsOf.set(map, sections); }
    return sections.map((s) => ({ ...s, kind: 'world' as const, selected: false }));
  }
  private readonly collisionOf = new WeakMap<LoadedMap, WorldGeometry | null>();

  /** The collision layer's objects while the drawn geometry is open: made once a change, for the Outliner. */
  private collisionOutline: WorldGeometry | null = null;
  private collisionLayerNow(): WorldGeometry | null {
    if (this.collisionOn) return this.geo;
    if (!this.collisionOutline && this.geo) this.collisionOutline = hullGeometryOf(this.geo, this.hullGeo);
    return this.collisionOutline;
  }

  /** The layer an object's id is on: the one whose objects hold it (an Outliner row of the other layer switches to it). */
  private layerOf(id: string): 'geometry' | 'collision' | null {
    if (this.objectById(id)) return this.collisionOn ? 'collision' : 'geometry';
    if (this.collisionOn) return this.drawGeo?.objects.some((o) => o.id === id) ? 'geometry' : null;
    return this.collisionLayerNow()?.objects.some((o) => o.id === id) ? 'collision' : null;
  }
  /** Onto the layer that holds `id`, when it is the other one. */
  private toLayerOf(id: string): void {
    const l = this.layerOf(id);
    if (l && (l === 'collision') !== this.collisionOn) this.setCollision(l === 'collision');
  }

  /** The map's world sections, read once a map (`outlineObjects`). */
  private readonly sectionsOf = new WeakMap<LoadedMap, { id: string; name: string }[]>();

  /**
   * An Outliner row's click: Geometry mode on (the editor's), object selection, the object `id` selected -- alone, or with
   * `add` added to the selection (taken out when it was in it).
   */
  selectObject(id: string, add: boolean): void {
    if (!this.active) this.setActive(true);
    this.toLayerOf(id);
    if (!this.active || !this.geo || !this.objectById(id)) return;
    if (this.sel.mode !== 'object') this.sel = convertSelection(this.geo, this.sel, 'object');
    if (!add) { this.sel.objects.clear(); this.sel.items.clear(); this.sel.objects.add(id); }
    else if (this.sel.objects.has(id)) this.sel.objects.delete(id);
    else this.sel.objects.add(id);
    this.focus = id;
    this.drawSelection();
  }

  /*
   * Object mode's own hold on the geometry (the owner, 2026-11-16: "allow to select meshes when in normal object mode ...
   * just be able to move the geometry with the transform gizmo ... it should move the linked collision object with it";
   * "ok to have mixed selection since we are only selecting whole objects"): the page's Select tool picks whole geometry
   * objects beside its placements (`objectAt`), boxes them (`objectBounds`), and its gizmo moves them with the rest -- live
   * (`beginMove`, `moveBy`), then once at the release (`endMove`), as Geometry mode's object move does (`transformObjects`:
   * the textures locked, the hand-edited collision carried, a node's own hull moved with it at Build). Geometry mode is not
   * opened for any of it; the drawn layer is the one moved.
   */

  /**
   * The geometry object a click at viewport point `ndc` strikes, and how far along the ray -- the drawn layer's, the base's
   * geometry opened for it (`openBase`). A blank base's own floor is the ground, never picked (a click on it is a click on
   * nothing, as before). Null over nothing, or while Geometry mode is on (its own picks are its own).
   */
  objectAt(ndc: { x: number; y: number }): { id: string; distance: number } | null {
    if (this.active) return null;
    if (!this.openBase() || !this.geo) return null;
    const hit = pickFace(this.geo, this.rayAt(new Vector2(ndc.x, ndc.y), this.deps.camera()), this.index);
    if (!hit || this.isBaseFloor(hit.object)) return null;
    return { id: hit.object.id, distance: hit.t };
  }

  /** A blank base's own floor plane (made at the open: `open`'s `defaultFloor`), the ground of a custom map. */
  private isBaseFloor(o: GeoObject): boolean {
    return !!this.forMap && this.forMap.world.length === 0 && o.kind === 'plane' && o.name === 'Floor';
  }

  /** Whether the drawn layer has the object `id` now (an undo may have taken it away). */
  hasObject(id: string): boolean { return !this.collisionOn && !!this.objectById(id); }

  /** The object `id`'s box over its live faces' points, or null. */
  objectBounds(id: string): { min: Vec3; max: Vec3 } | null {
    const o = this.collisionOn ? undefined : this.objectById(id);
    if (!o) return null;
    const min: Vec3 = [Infinity, Infinity, Infinity], max: Vec3 = [-Infinity, -Infinity, -Infinity];
    for (const v of selectionVerts(this.objectSelection([id]), o)) {
      const p = vertPos(o.mesh, v);
      for (let i = 0; i < 3; i++) { min[i] = Math.min(min[i]!, p[i]!); max[i] = Math.max(max[i]!, p[i]!); }
    }
    return Number.isFinite(min[0]) ? { min, max } : null;
  }

  private objectSelection(ids: readonly string[]): Selection {
    const s = emptySelection('object');
    for (const id of ids) if (this.objectById(id)) s.objects.add(id);
    return s;
  }

  /** The gizmo's drag takes the objects `ids` up: drawn where it carries them from now (`moveBy`), until `endMove`. */
  beginMove(ids: readonly string[]): void {
    if (this.active || !this.geo || !ids.length) return;
    this.startLive(this.objectSelection(ids));
  }

  /** The drag's carry since `beginMove` (a column-major change), drawn at once. */
  moveBy(delta: Matrix4): void { if (this.live.length) this.moveLive(delta); }

  /**
   * The drag let go: the objects `ids` moved by `mat` as one geometry edit -- their collision with them (`transformObjects`'
   * way) -- or, `mat` null (no move), put back as they were. The page's history takes the edit (`deps.onEdit`).
   */
  endMove(ids: readonly string[], mat: ArrayLike<number> | null): void {
    const geo = this.geo;
    const moved = !!mat && !new Matrix4().fromArray(Array.from(mat)).equals(new Matrix4());
    this.endLive(!moved);
    if (!geo || !moved || this.active) return;
    this.edit('Move geometry', () => {
      let any = false;
      for (const id of ids) {
        const o = this.objectById(id);
        if (!o) continue;
        transformObject(o, mat!, this.size);
        for (const h of followersOf(this.hullGeo, o)) moveFollower(h, mat!);
        any = true;
      }
      return any;
    }, { selectionTouched: false });
  }

  /*
   * Object mode's Delete, Copy, Paste and Duplicate on the geometry objects it picked (the owner, 2026-11-16: "make
   * Delete, Copy, Paste and Duplicate in Object mode"): whole objects of the drawn layer, as Geometry mode's Object
   * selection does them (`command`) -- Delete takes a made object out and a map section's faces away; Copy fills the one
   * clipboard Geometry mode's Paste reads too; Paste and Duplicate make the copies in place (the owner, same day: "keep it
   * in the same position"). Each an edit of its own (`edit`); the page folds one into the placements' step of the same
   * command where it can.
   */

  /** The objects `ids` deleted: a made one taken out, a map section's faces taken away (its hull with them at Build). */
  deleteObjects(ids: readonly string[]): void {
    const geo = this.geo;
    if (!geo || this.active || !ids.length) return;
    this.edit('Delete geometry', () => {
      let any = false;
      for (const id of ids) {
        const o = this.objectById(id);
        if (!o) continue;
        if (o.group === undefined) removeObject(geo, id); else deleteFaces(o.mesh, objectFaces(o));
        markReshaped(o);
        any = true;
      }
      return any;
    }, { selectionTouched: false });
  }

  /**
   * The objects `ids` to the clipboard, whole (Geometry mode's Paste reads it too), stamped `at` (the page's copy's time,
   * so a Copy of placements and geometry together pastes both: `clipAt`); how many.
   */
  copyObjects(ids: readonly string[], at: number): number {
    const geo = this.geo;
    if (!geo || this.active) return 0;
    const items = ids.flatMap((id) => { const o = this.objectById(id); return o ? [this.copyWithHull(geo, o)] : []; });
    if (items.length) this.clip = { layer: 'geometry', mode: 'object', items, at };
    return items.length;
  }

  /** Whether Object mode's Paste has geometry to make: a clipboard of the drawn layer's (faces or objects). */
  hasClip(): boolean { return this.clip?.layer === 'geometry'; }

  /** The clipboard's sets made in place (Object mode's Paste), one edit; the new objects' ids. */
  pasteObjects(): string[] {
    const items = this.clip?.layer === 'geometry' ? this.clip.items : [];
    return this.makeObjects(items, 'Paste geometry');
  }

  /** The objects `ids` copied in place (Object mode's Duplicate), one edit; the copies' ids. */
  duplicateObjects(ids: readonly string[]): string[] {
    const geo = this.geo;
    if (!geo) return [];
    return this.makeObjects(ids.flatMap((id) => { const o = this.objectById(id); return o ? [this.copyWithHull(geo, o)] : []; }), 'Duplicate geometry');
  }

  private makeObjects(items: readonly GeoObjectCopy[], label: string): string[] {
    const geo = this.geo;
    if (!geo || this.active || !items.length) return [];
    const made: string[] = [];
    this.edit(label, () => { for (const c of items) made.push(this.addCopy(geo, c).id); }, { selectionTouched: false });
    return made;
  }

  /** A drawn object's own collision (`hullOf`, edited: stairs' ramp, a ladder's box, a hand edit): a copy of it, or null. */
  private ownHullOf(o: GeoObject): GeoObject | null {
    if (this.collisionOn || !o.solid) return null;
    const h = followersOf(this.hullGeo, o).find((x) => x.hullOf === o.id);
    return h ? { ...h, mesh: cloneMesh(h.mesh) } : null;
  }

  /** `o` copied whole (`objectCopy`), its own collision with it (`ownHullOf`), for whatever makes the copy. */
  private copyWithHull(geo: WorldGeometry, o: GeoObject): GeoObjectCopy {
    const c = objectCopy(geo, o);
    const own = this.ownHullOf(o);
    if (own) copyHulls.set(c, own.mesh);
    return c;
  }

  /** A copy made in place (`inPlaceCopy`) and its own collision, if it carries one (`copyWithHull`), set on it. */
  private addCopy(geo: WorldGeometry, c: GeoObjectCopy): GeoObject {
    const o = addObject(geo, inPlaceCopy(c));
    const own = copyHulls.get(c);
    if (own && !this.collisionOn && o.solid) this.setShapeHull(o, cloneMesh(own));
    return o;
  }

  /**
   * The Inspector's Transform in Geometry mode (the owner, 2026-11-15: "show the transform for geometry objects, and allow
   * the user to edit these values, but only when in object mode ... basically equivalent to moving the gizmo"): the
   * object selection's -- its centre (the gizmo's pivot), the first object's own axes as angles (degrees, X Y Z: pitch,
   * yaw, roll) and its scale along them. Null outside object selection, or with nothing selected.
   */
  objectTransform(): { name: string; count: number; position: Vec3; rotation: Vec3; scale: Vec3 } | null {
    if (!this.active || !this.geo || this.sel.mode !== 'object' || this.textureOn) return null;   // the Texture layer moves nothing
    const objs = [...this.sel.objects].map((id) => this.objectById(id)).filter((o): o is GeoObject => !!o);
    const first = objs[0];
    const c = first ? selectionCentre(this.geo, this.sel) : null;
    if (!first || !c) return null;
    const e = new Euler().setFromRotationMatrix(new Matrix4().fromArray(first.basis ?? new Matrix4().elements), 'XYZ');
    const deg = (r: number): number => (r * 180) / Math.PI;
    return { name: first.name, count: objs.length, position: [c[0], c[1], c[2]], rotation: [deg(e.x), deg(e.y), deg(e.z)], scale: [...(first.scale ?? [1, 1, 1])] as Vec3 };
  }

  /**
   * A Transform row typed: the selection moved as the gizmo would move it -- to the position; turned about its centre to
   * the angles; scaled along the first object's axes about its centre to the scale. One edit (one undo step).
   */
  setObjectTransform(part: 'position' | 'rotation' | 'scale', v: Vec3): void {
    this.previewObjectTransform(part, null);                   // a field's live drag let go first: the edit from the start
    const mat = this.objectTransformMatrix(part, v, true);
    if (!mat || mat.equals(new Matrix4())) return;
    this.transformObjects(mat.elements, false);
  }

  /**
   * A Transform row's live drag (the owner, 2026-11-15: "dragging in the transform fields live updated the object in
   * real time ... all cases where we can live drag a gizmo"): the selection shown at `v` as a gizmo drag shows it -- its
   * faces, edges and highlight carried (`moveLive`), the gizmo with them, the collision view following (`previewSoon`) --
   * no edit made; null puts it all back as it was (Escape, or just before the release's one edit, `setObjectTransform`).
   * A browser adaptation, as the fields (FG.R2).
   */
  previewObjectTransform(part: 'position' | 'rotation' | 'scale', v: Vec3 | null): void {
    if (v === null) {
      const start = this.fieldDrag;
      if (!start) return;
      this.fieldDrag = null;
      this.dragStart = null;
      this.endPreview();
      this.endLive(true);
      this.pivot.matrix.copy(start).decompose(this.pivot.position, this.pivot.quaternion, this.pivot.scale);
      this.pivot.updateMatrixWorld(true);
      this.drawSelection();
      return;
    }
    if (this.gizmo.dragging || (this.dragStart && !this.fieldDrag)) return;   // a gizmo drag of its own going on
    const mat = this.objectTransformMatrix(part, v, false);
    if (!mat) return;
    if (!this.fieldDrag) {
      this.pivot.updateMatrixWorld(true);
      this.fieldDrag = this.pivot.matrixWorld.clone();
      this.dragStart = this.fieldDrag.clone();
      this.dragCopy = false;
      this.startLive();
      this.startPreview();
    }
    // The gizmo carried as its own drag would carry it (its place and turn; never its size).
    const at = mat.clone().multiply(this.fieldDrag);
    const sc = new Vector3();
    at.decompose(this.pivot.position, this.pivot.quaternion, sc);
    this.pivot.updateMatrixWorld(true);
    this.overlay.matrix.copy(mat);
    this.overlay.matrixWorldNeedsUpdate = true;
    this.moveLive(mat);
    this.previewSoon(mat);
  }
  /** The pivot as a field's live drag found it (`previewObjectTransform`), null with none going on. */
  private fieldDrag: Matrix4 | null = null;

  /**
   * The move a Transform row's value makes of the object selection, as the gizmo would make it (`setObjectTransform`):
   * null with no object selection or a value that is not a number, or a scale of 0 (said when `tell`).
   */
  private objectTransformMatrix(part: 'position' | 'rotation' | 'scale', v: Vec3, tell: boolean): Matrix4 | null {
    const t = this.objectTransform();
    const first = [...this.sel.objects].map((id) => this.objectById(id)).find((o): o is GeoObject => !!o);
    if (!t || !first || v.some((x) => !Number.isFinite(x))) return null;
    const [cx, cy, cz] = t.position;
    let mat: Matrix4;
    if (part === 'position') mat = new Matrix4().makeTranslation(v[0] - cx, v[1] - cy, v[2] - cz);
    else {
      const r0 = new Matrix4().fromArray(first.basis ?? new Matrix4().elements);
      let core: Matrix4;
      if (part === 'rotation') {
        const rad = (d: number): number => (d * Math.PI) / 180;
        core = new Matrix4().makeRotationFromEuler(new Euler(rad(v[0]), rad(v[1]), rad(v[2]), 'XYZ')).multiply(r0.clone().invert());
      } else {
        if (v.some((x) => Math.abs(x) < 1e-6)) { if (tell) this.deps.say('A scale of 0 would flatten it: not applied', true); return null; }
        const s0 = t.scale;
        core = r0.clone().multiply(new Matrix4().makeScale(v[0] / s0[0], v[1] / s0[1], v[2] / s0[2])).multiply(r0.clone().invert());
      }
      mat = new Matrix4().makeTranslation(cx, cy, cz).multiply(core).multiply(new Matrix4().makeTranslation(-cx, -cy, -cz));
    }
    return mat;
  }

  /** The object selection moved by the column-major `mat` (a gizmo's drag, a typed Transform): copies first with `copy`. */
  private transformObjects(mat: ArrayLike<number>, copy: boolean): void {
    const geo = this.geo;
    if (!geo) return;
    this.edit(copy ? 'Copy geometry' : 'Transform geometry', () => {
      const ids = [...this.sel.objects];
      this.sel = emptySelection('object');
      for (const id of ids) {
        const o = this.objectById(id);
        if (!o) continue;
        // Ctrl-drag in object mode copies (the Forge's way for every placed kind).
        const moved = copy ? duplicateObject(geo, o) : o;
        transformObject(moved, mat, this.size);
        // C1: its collision edited by hand moves with it; a copy takes its own copy of it (the owner, 2026-11-17: a
        // ladder's, stairs' ramp: "check to see if this happens in any other cases") -- else Build would make the copy's
        // from its faces (steps, no ladder).
        if (!this.collisionOn) {
          if (!copy) for (const h of followersOf(this.hullGeo, o)) moveFollower(h, mat);
          else { const own = this.ownHullOf(o); if (own) { moveFollower(own, mat); this.setShapeHull(moved, own.mesh); } }
        }
        this.sel.objects.add(moved.id);
      }
    });
  }

  /**
   * The Outliner's Shift range (the owner, 2026-11-15: "shift select ... make it work for all objects"): exactly the
   * objects `ids` selected, in object selection (Geometry mode on).
   */
  selectObjects(ids: readonly string[]): void {
    if (!this.active) this.setActive(true);
    if (ids[0]) this.toLayerOf(ids[0]);
    if (!this.active || !this.geo) return;
    if (this.sel.mode !== 'object') this.sel = convertSelection(this.geo, this.sel, 'object');
    this.sel.objects.clear();
    this.sel.items.clear();
    for (const id of ids) if (this.objectById(id)) this.sel.objects.add(id);
    this.focus = ids[ids.length - 1] ?? this.focus;
    this.drawSelection();
  }

  setActive(on: boolean): void {
    if (on === this.active) return;
    this.previewObjectTransform('position', null);             // a field's live drag let go: nothing left half-moved
    if (!on && this.tool !== 'select') this.setTool('select'); // the sampler's or the brush's cursor goes with the mode
    if (!on) this.setBlockOn(false);                           // and the block tool, a shape half-made let go
    if (!on && this.knifeOn) this.setKnife(false);
    if (!on && this.collisionOn) this.leaveCollision();       // and collision editing (its edits kept in the collision)
    // The mode left, what was selected in it let go (the owner, 2026-11-16: "when switching modes on the top bar,
    // deselect whatever we selected in that mode"), as Object mode's own selection is on entering this one.
    if (!on) this.sel = emptySelection(this.sel.mode);
    if (!on && this.textureOn) { this.setTool('select'); this.textureOn = false; this.collisionUi(); }   // the page's locks follow its onActive
    if (on) {
      const map = this.deps.map();
      if (!map) { this.deps.say('Geometry editing needs a disc map as the base', true); return; }
      if (map !== this.forMap) this.open(map);
    }
    this.active = on;
    this.deps.tools.hidden = !on;
    this.deps.modeTools.hidden = !on;
    this.status.hidden = !on;
    this.deps.onActive(on);
    this.deps.propsShown(on ? this.showProps : true);
    this.drawEdges();
    this.drawSelection();
  }

  /* ---------- state ---------- */

  private open(map: LoadedMap): void {
    this.disposeView();
    this.leaveCollision();
    // The map's geometry as read: its collision as read too, no collision edits carried over (a browser run, 2026-11-15:
    // an undo back to the read map left the last edit standing on the Collision layer, kept here by `leaveCollision`).
    this.hullGeo = null;
    this.collisionOutline = null;
    this.geo = geometryOfMap(map);
    this.index = PickIndex.build(this.geo);
    this.forMap = map;
    this.draws = null;
    this.built = null;
    this.edited = false;
    this.authored = false;
    this.cancelBuild();
    this.sel = emptySelection(this.sel.mode);
    this.texelScale = null;
    this.sampled = null;
    // The map's first texture by name, as the list it replaces opened on.
    this.textureName = Object.keys(map.textures).sort()[0] ?? null;
    // A blank base (bug 17): its floor a plane of its own, as a new map in a level editor starts from what is made in it.
    const floor = map.world.length === 0 ? this.deps.defaultFloor?.() ?? null : null;
    if (floor) {
      const { size, divisions, look } = floor;
      if (look.texelScale) this.texelScale = look.texelScale;
      if (look.texture) this.textureName = look.texture;
      // Untextured, mid grey (`UNTEXTURED_FLOOR_COLOR_ADAPTATION`): a white floor would drown the grid.
      const mesh = plane([0, 0, 0], size, size, divisions, { textureName: look.texture, size: this.size, scaleTexel: this.scaleTexel(), ...(look.texture ? {} : { color: UNTEXTURED_FLOOR_COLOR_ADAPTATION }) });
      addObject(this.geo, { name: 'Floor', kind: 'plane', mesh, solid: look.surface ?? DEFAULT_FLOOR_SURFACE_PLACEHOLDER });
      // The floor stands for the blank base's own from the start: drawn, and what Play draws, at once -- its collision
      // built from it as well (a custom map's collision is the floor's and the objects', the Collision layer's to edit).
      this.edited = true;
      this.redraw();
      this.buildSoon();
      this.deps.say(`Geometry: a floor plane of ${divisions}x${divisions} quads${look.texture ? `, textured ${look.texture}` : ''}`);
      return;
    }
    this.drawTextureButton();
    const tagged = this.geo.objects.length > 1;
    this.deps.say(`Geometry: ${map.name}, ${this.geo.objects.length} object${this.geo.objects.length === 1 ? '' : 's'}${tagged ? ' (one a node of its world model)' : ''}`);
  }

  /**
   * A blank base's edited geometry for Play and the walk (bug 17): its draws, and the hull of its last Build (null until
   * one: the blank floor's own hull, which the floor plane opens over). Null when the geometry is a disc map's, or unmade.
   */
  editedBlank(): { world: LoadedMesh[]; ground: GroundData | null } | null {
    this.buildNow();
    if (!this.edited || !this.draws || !this.forMap || this.forMap.world.length !== 0) return null;
    return { world: this.draws, ground: this.built };
  }

  private readonly size: TextureSize = (name) => {
    const t = name ? this.forMap?.textures[name] : undefined;
    return t ? [t.width, t.height] : null;
  };

  private scaleTexel(): number {
    if (this.texelScale === null) {
      const world = this.geo?.objects.find((o) => o.kind === 'world');
      this.texelScale = (world && medianTexelScale(world.mesh, this.size)) || 1 / (this.forMap?.metersPerUnit ?? 1) / 64;
    }
    return this.texelScale;
  }

  private objectById(id: string): GeoObject | undefined { return this.geo?.objects.find((o) => o.id === id); }

  /**
   * An edit named `label`: done, redrawn, and a step of the page's one history (bug 20: `onEdit`), one step an edit. The
   * collision rebuilt once the edits settle (`buildSoon`).
   */
  private edit(label: string, change: () => boolean | void, opts: { selectionTouched?: boolean; shapeKept?: boolean } = {}): void {
    if (!this.geo) return;
    const geo = this.geo;
    const nodesBefore = this.collisionOn ? new Map(geo.objects.map((o) => [o.id, o.hullNode])) : null;
    const solidsBefore = this.collisionOn ? new Map(geo.objects.map((o) => [o.id, o.hullOf])) : null;
    // An edit that leaves the selection alone (a paint stroke marks what it painted itself) marks no selected object.
    const selBefore = opts.selectionTouched === false ? [] : [...this.sel.objects];
    // The faces already bent before the edit (a torus's on an oval footprint): left as they are -- only a face this
    // edit bends, or a bent face it makes, is split (below).
    const bentBefore = new Map<string, { faces: Set<number>; count: number }>();
    if (!opts.shapeKept) for (const id of selBefore) {
      const o = this.objectById(id);
      if (o) bentBefore.set(id, { faces: new Set(objectFaces(o).filter((f) => isBent(o.mesh, f))), count: o.mesh.faces.length });
    }
    if (change() === false) {
      // A run again with settings the tool refuses: the geometry is where the tool started; the step kept so.
      if (this.rerun) { this.redraw(); if (this.rerun === 'amend') this.deps.onEdit(label, true); }
      return;
    }
    this.editCount++;
    // Any other edit ends the last tool's adjusting (its panel goes): only its own runs keep it.
    if (!this.rerun && !this.parametricRunning && this.lastOp) { this.lastOp = null; this.drawToolPanel(); }
    if (!opts.shapeKept) this.twinIndex = null;                 // the shape may have changed: its twins read again
    // A face the edit left bent (a corner off its plane) split into triangles, its fold a real edge -- every tool, every
    // move (the owner, 2026-11-19: "it is like an edge but it is invisible. Please fix on all the tools"); a selected face
    // split selects its triangles.
    if (!opts.shapeKept) {
      for (const id of new Set([...selBefore, ...this.sel.objects])) {
        const o = this.objectById(id);
        if (!o) continue;
        const was = bentBefore.get(id);
        if (!was) continue;                                    // made by this edit (Create's torus): as it was made
        const split = splitBentFaces(o.mesh, objectFaces(o).filter((f) => !was.faces.has(f) && isBent(o.mesh, f)));
        if (!split.size) continue;
        markReshaped(o);
        const items = this.sel.mode === 'face' ? this.sel.items.get(id) : undefined;
        if (items) for (const [f, tris] of split) if (items.delete(f)) for (const g of tris) items.add(g);
      }
    }
    if (nodesBefore) {
      // Collision editing: an object the edit touched (selected before or after it, or made by it) is its node's hull
      // from now on; a node's object deleted leaves the node no hull of its own.
      const now = new Set(geo.objects.map((o) => o.id));
      const selNow = opts.selectionTouched === false ? [] : [...this.sel.objects];
      const touched = new Set([...selBefore, ...selNow, ...[...now].filter((id) => !nodesBefore.has(id))]);
      for (const o of geo.objects) if (touched.has(o.id)) o.manual = true;
      for (const [id, n] of nodesBefore) if (!now.has(id) && n !== undefined) geo.clearedNodes = [...new Set([...(geo.clearedNodes ?? []), n])];
      for (const [id, s] of solidsBefore ?? []) if (!now.has(id) && s !== undefined) geo.clearedSolids = [...new Set([...(geo.clearedSolids ?? []), s])];
    }
    this.edited = true;
    this.authored = true;
    this.collisionOutline = null;
    this.redraw();
    if (this.rerun === 'quiet') return;                         // a live run again: nothing kept until the release
    this.buildSoon();
    this.deps.onEdit(label, this.rerun === 'amend');
  }

  /**
   * The geometry as it stands, for the page's history (bug 20): a copy, with the map it was made over; null before the
   * map was ever opened here (the map's own geometry, untouched).
   */
  snapshot(): GeometrySnapshot | null {
    const geo = this.drawGeometry;
    if (!geo || !this.forMap) return null;
    return { map: this.forMap, geo: cloneGeometry(geo), edited: this.edited, authored: this.authored, hull: this.hullGeo ? cloneGeometry(this.hullGeo) : null };
  }

  /**
   * Bug 1 (the owner, 2026-11-16: "Edits aren't saved"): the geometry as a layout saves it (`./geometryFile`) -- the drawn
   * layer, the collision layer when it was edited, and the texture names its faces wear (the page keeps which of them it
   * lent from other maps) -- or null when no edit of a person's made it (the base's own; a blank base's floor untouched).
   */
  savedGeometry(): { geo: WorldGeometry; hull: WorldGeometry | null; textures: string[] } | null {
    const geo = this.drawGeometry;
    if (!geo || !this.authored) return null;
    const textures = new Set<string>();
    for (const w of [geo, this.hullGeo]) for (const o of w?.objects ?? []) for (const s of o.mesh.styles) if (s.style.textureName) textures.add(s.style.textureName);
    return { geo, hull: this.hullGeo, textures: [...textures] };
  }

  /**
   * Bug 1: a saved geometry (`./geometryFile` `decodeGeometry`) put back over the base as it opens (its layout's
   * `geometry`): the base's geometry read afresh for what a file never holds -- the hull as read, the world's mesh as
   * read, the owners' nodes -- then the saved objects stood in its place, as an undo puts a step back (`restoreSnapshot`).
   * It is then the geometry the walk, Play and every mode draw.
   */
  restoreSaved(saved: { geo: SavedWorld; hull: SavedWorld | null }): boolean {
    const map = this.deps.map();
    if (!map) return false;
    this.open(map);
    const fresh = this.geo;
    if (!fresh) return false;
    const world = (w: SavedWorld): WorldGeometry => ({
      objects: w.objects, collision: w.collision ? fresh.collision : null, ownerNodes: fresh.ownerNodes,
      ...(w.original && fresh.original ? { original: fresh.original } : {}),
      ...(w.clearedNodes ? { clearedNodes: w.clearedNodes } : {}), ...(w.clearedSolids ? { clearedSolids: w.clearedSolids } : {}),
    });
    this.restoreSnapshot({ map, geo: world(saved.geo), edited: true, authored: true, hull: saved.hull ? world(saved.hull) : null });
    return true;
  }

  /**
   * An undo or a redo (bug 20): the geometry put back as `s` kept it, in any mode -- null, the base map's own as it was
   * read. A snapshot of another map than the base's now is left alone (the base changed under it).
   */
  /** The selection as a step keeps it (the mode, then each object's items in order); null before the map is opened here. */
  selectionState(): GeometrySelectionState | null {
    if (!this.geo) return null;
    return { mode: this.sel.mode, objects: [...this.sel.objects], items: [...this.sel.items].map(([id, set]) => [id, [...set]]) };
  }

  /** A step's selection put back (an undo or a redo): its mode, and what of it still stands. */
  setSelectionState(s: GeometrySelectionState | null): void {
    if (!this.geo) return;
    const sel = emptySelection(s?.mode ?? this.sel.mode);
    for (const id of s?.objects ?? []) if (this.objectById(id)) sel.objects.add(id);
    for (const [id, items] of s?.items ?? []) if (sel.objects.has(id)) sel.items.set(id, new Set(items));
    this.sel = sel;
    this.drawSelection();
  }

  restoreSnapshot(s: GeometrySnapshot | null): void {
    this.previewObjectTransform('position', null);             // an undo mid field drag: the drag's preview let go first
    if (!this.rerun) { this.lastOp = null; this.drawToolPanel(); }   // an undo or redo: the last tool's adjusting over
    const map = this.deps.map();
    // An undo or a redo leaves the layer and the brush as they are (the owner, 2026-11-15: "every stroke is ctrl z"):
    // undoing the first collision edit stays on the Collision layer, painting, its hull as Build makes it from the step's
    // drawn geometry (no collision edits yet).
    const onCollision = this.collisionOn, brush = this.tool;
    this.collisionOutline = null;
    // The selection let go before the step's geometry is drawn: it may name faces or points the step does not have (an
    // undo of a tool that made faces and selected them), and drawing it would read past them.
    this.sel = emptySelection(this.sel.mode);
    if (this.knifeOn) { this.knifePts = []; this.drawKnife(); }
    if (!s) {
      if (!this.forMap || this.forMap !== map) return;
      if (this.drawn) this.deps.onViewSwap(null);
      this.open(this.forMap);                                  // the map's geometry as read (a blank base: its floor again)
      if (!this.edited) this.deps.baseWorldShown(true);
      if (onCollision) this.setCollision(true, true);
    } else {
      if (s.map !== map) return;
      if (this.forMap !== s.map) this.open(s.map);
      const draw = cloneGeometry(s.geo), stepHull = s.hull ? cloneGeometry(s.hull) : null;
      const hull = this.collisionOn ? stepHull ?? hullGeometryOf(draw, null) : stepHull;
      if (this.collisionOn && hull) { this.drawGeo = draw; this.geo = this.hullGeo = hull; }
      else { if (this.collisionOn) this.leaveCollision(); this.geo = draw; this.hullGeo = stepHull; }
      this.edited = true;
      this.authored = s.authored ?? s.edited;
      this.redrawWorld();
      this.buildSoon();
    }
    if (this.collisionOn && brush !== this.tool) this.setTool(brush);
    this.sel = emptySelection(this.sel.mode);
    this.drawEdges();
    this.drawSelection();
  }

  /**
   * Collision editing on or off (`./hullGeometry`): on, the tools work on the hull as objects -- a node's polygons an
   * object, made from what Build would make of the drawn geometry now, with the objects already edited kept -- drawn in
   * the walk's colours over the world; off, on the drawn geometry again. The selection starts afresh either way.
   */
  setCollision(on: boolean, quiet = false): void {
    if (on === this.collisionOn || !this.geo || !this.active) return;
    this.previewObjectTransform('position', null);
    this.collisionOutline = null;
    if (on) {
      const hull = hullGeometryOf(this.geo, this.hullGeo);
      if (!hull) { this.deps.say('This base has no collision to edit', true); return; }
      this.drawGeo = this.geo;
      this.geo = this.hullGeo = hull;
      this.collisionOn = true;
    } else {
      this.hullGeo = this.geo;
      this.geo = this.drawGeo;
      this.drawGeo = null;
      this.collisionOn = false;
    }
    if (this.sampling) this.setTool('select');
    this.sculpting = false;
    this.sel = emptySelection(this.sel.mode);
    this.focus = null;
    this.trisCache.clear();
    this.cageCache.clear();
    this.hoverKey = '';
    if (this.geo) this.index = PickIndex.build(this.geo);
    this.collisionUi();
    this.drawHull();
    this.drawEdges();
    this.drawSelection();
    if (!quiet) this.deps.say(on ? 'Collision layer: every tool edits the collision; click a type to paint it' : 'Geometry layer');
  }

  /**
   * The Layer tabs' turn: the drawn geometry, the collision (`setCollision`), or the Texture layer -- the drawn geometry,
   * painted, not edited (`textureOn`). The selection starts afresh on the Texture layer, the brush down.
   */
  setLayer(v: 'geometry' | 'collision' | 'texture'): void {
    if (!this.geo || !this.active) return;
    const was = this.textureOn;
    if (this.tool !== 'select') this.setTool('select');        // a layer turned: Select, its default
    if (v !== 'texture' && was) this.textureOn = false;
    if (v === 'collision') { this.setCollision(true); if (!this.collisionOn && was) this.textureOn = false; this.collisionUi(); this.deps.onLayer?.(); return; }
    if (this.collisionOn) this.setCollision(false, v === 'texture');
    if (v === 'texture' && !was) {
      if (this.sculpting) this.sculpting = false;
      this.textureOn = true;
      this.sel = emptySelection(this.sel.mode);
      this.hoverKey = '';
      this.drawSelection();
      this.deps.say('Texture layer: select faces and Apply the texture, or Paint them (the texture: its button, or the asset browser)');
    } else if (v === 'geometry' && was) this.deps.say('Geometry layer');
    this.collisionUi();
    this.drawBar();
    this.deps.onLayer?.();
  }

  /** The Texture layer on (Geometry mode's): the geometry is painted, not edited, here. */
  isTexturing(): boolean { return this.active && this.textureOn; }

  /**
   * A texture chosen from the asset browser (a tile, or the Texture button's mini browser): the active texture -- what
   * Paint and Apply lay -- the mode left as it is.
   */
  pickTexture(name: string): void {
    this.setTexture(name);
    if (!this.textureOn) return;
    this.hoverKey = '';
    this.drawHover();
    this.deps.say(this.paintOn ? `Painting ${name}` : `Texture: ${name} (Apply lays it on the selection; Paint lays it as you click)`);
  }

  /**
   * The faces one dab at face `f` of `o` covers: the selection mode's (the owner, 2026-11-16: no Scope row, "too
   * complicated") -- Object mode the whole object, any other the face under the brush.
   */
  private scopeFaces(o: GeoObject, f: number): number[] {
    return this.sel.mode === 'object' ? objectFaces(o) : [f];
  }

  /** The sampler's cursor and hover: the Sample mode, or Shift held while painting. */
  private get sampleNow(): boolean { return this.active && (this.sampling || (this.shiftHeld && this.paintOn)); }
  private setShiftHeld(on: boolean): void {
    if (on === this.shiftHeld) return;
    this.shiftHeld = on;
    if (this.knifeOn) { this.knifeHover = this.knifeAt(this.pointer); this.drawKnife(); }   // Shift: the aligned places only
    if (!this.paintOn || !this.active) return;
    this.paintUi();
    this.hoverKey = '';
    this.drawHover();
  }

  /** Texture `name` for the brush's previews, made once. */
  private brushTexture(name: string): DataTexture | null {
    const had = this.brushTextures.get(name);
    if (had) return had;
    const rgba = this.forMap?.textures[name];
    if (!rgba) return null;
    const t = new DataTexture(new Uint8Array(rgba.data.buffer, rgba.data.byteOffset, rgba.data.length), rgba.width, rgba.height, RGBAFormat);
    t.wrapS = t.wrapT = RepeatWrapping;                        // as the world's draw: the uvs run past one repeat
    t.flipY = false;                                           // the decoder's row 0 is V = 0, as the world uploads it
    t.needsUpdate = true;
    this.brushTextures.set(name, t);
    return t;
  }

  /**
   * Faces of `o` drawn textured with `name`: their own uvs (a stroke's, already laid), or -- `asLaid` -- as Apply would
   * lay it (kept where the old one lay: the same texel mapping over the new texture's size), for the hover.
   */
  private texturedFaces(o: GeoObject, faces: readonly number[], name: string, asLaid: boolean, opacity = 1): Mesh | null {
    const map = this.brushTexture(name);
    if (!map) return null;
    const m = o.mesh;
    const to = this.size(name);
    const pos: number[] = [], uv: number[] = [];
    for (const f of faces) {
      const face = m.faces[f];
      if (!face || face.disp) continue;                        // a displacement shows at the stroke's end
      const ps = facePoints(m, f);
      const from = asLaid ? this.size(m.styles[face.style]?.style.textureName ?? null) : null;
      const kx = from && to ? from[0] / to[0] : 1, ky = from && to ? from[1] / to[1] : 1;
      for (const t of triangulate(ps)) for (const i of t) {
        pos.push(...ps[i]!);
        const c = face.corners[i]!;
        uv.push((m.cUv[c * 2] ?? 0) * kx, (m.cUv[c * 2 + 1] ?? 0) * ky);
      }
    }
    if (!pos.length) return null;
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(Float32Array.from(pos), 3));
    g.setAttribute('uv', new BufferAttribute(Float32Array.from(uv), 2));
    const mesh = new Mesh(g, new MeshBasicMaterial({ map, transparent: opacity < 1, opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, side: 2 }));
    mesh.renderOrder = 11;
    return mesh;
  }

  /** Collision editing ended without a word (a new base, an undo past it): the hull objects kept for the next time. */
  private leaveCollision(): void {
    if (this.collisionOn) {
      this.hullGeo = this.geo; this.geo = this.drawGeo; this.drawGeo = null; this.collisionOn = false;
      this.sel = emptySelection(this.sel.mode);
      if (this.geo) this.index = PickIndex.build(this.geo);
    }
    if (!this.forMap) this.hullGeo = null;
    this.collisionUi();
    this.drawHull();
  }

  /** The toolbar for the mode: Surface for collision, Texture and Displace for the drawn geometry. */
  private collisionUi(): void {
    for (const [v, b] of this.layerTabs) {
      const on = v === 'collision' ? this.collisionOn : v === 'texture' ? this.textureOn && !this.collisionOn : !this.collisionOn && !this.textureOn;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-selected', String(on));
    }
    this.layerGroup?.classList.toggle('is-collision', this.collisionOn);
    if (this.surfaceGroup) this.surfaceGroup.hidden = !this.collisionOn;
    if (!this.collisionOn && !this.textureOn && this.tool !== 'select') { this.endStroke(); this.tool = 'select'; }
    // The Tool section on every layer: Select and Block on the Geometry layer; Paint, Sample and Apply too on the
    // Collision layer; Select, Paint, Sample and Apply on the Texture layer (it makes no shape).
    if (this.textureOn && this.blockOn) this.setBlockOn(false);
    if (this.toolBar) {
      const paints = this.collisionOn || this.textureOn;
      for (const k of ['paint', 'sample', 'apply']) this.toolBar.setShown(k, paints);
      this.toolBar.setShown('block', !this.textureOn);
    }
    this.paintUi();
    // The Texture section the Texture layer's (the Geometry layer edits shape alone; a tile dropped still textures);
    // Create, Edit and Displace never on it -- the geometry is not edited there.
    if (this.textureGroup) this.textureGroup.hidden = !this.textureOn || this.collisionOn;
    if (this.displaceGroup) this.displaceGroup.hidden = !DISPLACE_TOOLS_SHOWN || this.collisionOn || this.textureOn;
    if (this.editGroup) this.editGroup.hidden = this.textureOn;
    if (this.selectGroup) this.selectGroup.hidden = this.textureOn;
    this.applyWorldShown();
  }

  /**
   * The hull objects as the page's one collision view draws them (`../hull`; the owner, 2026-11-15: "there should not be
   * two different ways to see collision"): each shown face a polygon with its words, null while collision editing is off.
   */
  collisionPolys(): HullViewPoly[] | null {
    if (!this.collisionOn || !this.geo) return null;
    const out: HullViewPoly[] = [];
    for (const o of this.geo.objects) {
      if (o.hidden) continue;
      const words = wordsOf(o, null);
      for (const f of liveFaces(o.mesh)) {
        const w = words(f);
        out.push({ points: facePoints(o.mesh, f).flat(), ditype: w[0], cameratype: w[2], appflags: w[4] });
      }
    }
    return out;
  }

  /** The hull objects changed (or collision editing turned): the page draws its collision view again. */
  private drawHull(): void { this.deps.onCollisionView?.(this.collisionOn); }

  private typeLabel(t: CollisionType): string { return (COLLISION_TYPES.find((x) => x.type === t)?.label ?? t).toLowerCase(); }

  /** A type's tab clicked (or a climb flag chosen): the active type, what Paint and Apply lay; the mode left as it is. */
  private pickType(t: CollisionType): void {
    this.collisionType = t;
    this.paintUi();
    this.hoverKey = '';
    this.drawHover();
    this.deps.say(`Collision type: ${this.typeLabel(t)}${t === 'climbable' ? `, flag ${this.climbFlag}` : ''}${this.paintOn ? '' : ' (Apply lays it on the selection; Paint lays it as you click)'}`);
  }

  /** The paint tool's mode (`../paintTools`): Paint and Sample on the Collision and Texture layers alone. */
  private setTool(t: PaintTool): void {
    if (this.blockOn) { this.blockOn = false; this.blockCancel(); }   // Select, Paint or Sample chosen: Block off
    if (this.poly) this.polyCancel();                               // and a polygon half-drawn
    if (!this.collisionOn && !this.textureOn) t = 'select';
    if (t === 'paint' && this.textureOn && !this.textureName) { this.deps.say('Choose a texture first (the Texture button, or the asset browser)', true); t = this.tool; }
    if (t === this.tool) { this.paintUi(); this.drawBar(); return; }   // Select again after Create: the select modes back
    this.endStroke();
    if (t === 'sample') this.toolBeforeSample = this.tool === 'paint' ? 'paint' : 'select';
    const was = this.tool;
    this.tool = t;
    // Paint and Sample: the gizmo stands aside, a click is the tool's; Select: the selection's gizmo again.
    if (t !== 'select') this.detachGizmo(); else if (was !== 'select') this.drawSelection();
    this.hoverKey = '';
    this.drawHover();
    this.paintUi();
    this.drawBar();
    const what = this.textureOn ? this.textureName ?? 'the texture' : this.typeLabel(this.collisionType);
    if (t === 'paint') this.deps.say(`Paint ${what}: click or drag over faces (${this.sel.mode === 'object' ? 'whole objects' : 'one face at a time'}); Shift+click samples; Esc selects`);
    else if (t === 'sample') this.deps.say(`Sample: click a face to take its ${this.textureOn ? 'texture' : 'collision type'}; Esc selects`);
  }

  /** Apply on the Collision layer: the active type (and climb flag) on the selected faces and their twins, one edit. */
  private applyCollisionType(): void {
    if (!this.geo) return;
    const sets = this.selectedFaceSets();
    if (!sets.length) { this.deps.say('Select faces first (Face mode), or objects, to Apply the collision type to', true); return; }
    let faces = 0;
    this.edit('Set collision type', () => {
      const twins = this.twinsOf();
      for (const { o, faces: fs } of sets) for (const f0 of fs) for (const { o: to, f } of twins(o, f0)) {
        const face = to.mesh.faces[f];
        if (!face) continue;
        const next = withCollisionType(wordsOf(to, null)(f), this.collisionType, this.climbFlag);
        if (face.surface && face.surface.every((v, i) => v === next[i])) continue;
        face.surface = next;
        to.manual = true;
        faces++;
      }
      if (!faces) { this.deps.say(`The selection is ${this.typeLabel(this.collisionType)} already`); return false; }
      this.deps.say(`${faces} face${faces === 1 ? '' : 's'} set ${this.typeLabel(this.collisionType)}`);
      return true;
    }, { shapeKept: true });
  }

  /**
   * The tabs and the cursor as the brush stands: the painting type's tab lit (none while the brush is down), the cursor
   * a ring in its colour while painting (the owner, 2026-11-15: "another cursor ... to indicate we are painting").
   */
  private paintUi(): void {
    for (const [t, b] of this.typeTabs) { const on = t === this.collisionType; b.classList.toggle('is-on', on); b.setAttribute('aria-selected', String(on)); }
    this.toolBar?.show(this.blockOn ? 'block' : this.tool);
    // Create's shape always shown beside it (the owner, 2026-11-17: "don't hide the create dropdown when the create button
    // is not active. I want to see the dropdown all the time"): gone with Create's own button on the Texture layer alone.
    if (this.blockShapeSel) { this.blockShapeSel.hidden = this.textureOn; if (this.textureOn) this.closeShapeMenu?.(); }
    if (this.createPanel) { const shown = this.active && this.blockOn && !this.textureOn; if (shown && this.createPanel.hidden) this.drawShapeSettings?.(); this.createPanel.hidden = !shown; }
    if (this.climbFlagLabel) this.climbFlagLabel.textContent = CLIMB_FLAGS.find((c) => c.flag === this.climbFlag)?.short ?? String(this.climbFlag);
    if (!this.collisionOn) this.closeClimbMenu();
    if (!this.collisionOn && !this.textureOn) this.showPaintTip(null);
    this.deps.input.style.cursor = this.blockOn || this.polyOn ? 'crosshair' : this.sampleNow ? sampleCursor() : this.paintOn ? brushCursor(this.textureOn ? HIGHLIGHT : TYPE_COLOURS[this.collisionType]) : '';
  }

  /** The face under `n` painted the current type, with its twins; whether anything new was painted. */
  private paintFaceAt(n: Vector2): boolean {
    const st = this.stroke;
    if (!st || !this.geo) return false;
    const hit = pickFace(this.geo, this.rayAt(n, this.deps.camera()), this.index);
    if (!hit) return false;
    if (st.done.has(`${hit.object.id}:${hit.face}`)) return false;
    if (this.textureOn) return this.dabTexture(hit.object, hit.face);
    let changed = false;
    for (const { o, f } of st.twins(hit.object, hit.face)) {
      st.done.add(`${o.id}:${f}`);
      const face = o.mesh.faces[f];
      if (!face) continue;
      const next = withCollisionType(wordsOf(o, null)(f), this.collisionType, this.climbFlag);
      if (face.surface && face.surface.every((v, i) => v === next[i])) continue;
      face.surface = next;
      o.manual = true;
      changed = true;
    }
    if (changed) st.faces++;
    return changed;
  }

  /**
   * A texture dab: the scope's faces (`scopeFaces`) not wearing the texture take it, laid as Apply lays it (kept where
   * the old one lay); drawn textured over the world (`strokeLayer`) until the stroke's end compiles it.
   */
  private dabTexture(o: GeoObject, f: number): boolean {
    const st = this.stroke!;
    const name = this.textureName;
    if (!name) return false;
    const faces = this.scopeFaces(o, f);
    for (const g of faces) st.done.add(`${o.id}:${g}`);
    const m = o.mesh;
    const fresh = faces.filter((g) => { const face = m.faces[g]; return !!face && m.styles[face.style]?.style.textureName !== name; });
    if (!fresh.length) return false;
    applyTexture(m, fresh, name, this.size, { align: 'keep', scaleTexel: this.scaleTexel() });
    const shown = this.texturedFaces(o, fresh, name, false);
    if (shown) this.strokeLayer.add(shown);
    st.faces += fresh.length;
    return false;                                              // drawn here already: nothing for the hull's redraw
  }

  /** The stroke's faces drawn in their new colour, once a frame at most. */
  private drawStrokeSoon(): void {
    if (this.strokeDrawQueued) return;
    this.strokeDrawQueued = true;
    requestAnimationFrame(() => { this.strokeDrawQueued = false; this.drawHull(); });
  }

  /** A stroke over: one undo step for all it painted (the faces already hold their new words), nothing for none. */
  private endStroke(): void {
    const st = this.stroke;
    this.stroke = null;
    if (!st || !st.faces) { clearGroup(this.strokeLayer); return; }
    if (this.textureOn) {
      // One rebuild for the stroke: the world compiled with its faces' new textures, the preview let go after.
      this.edit('Paint texture', () => {
        this.deps.say(`${st.faces} face${st.faces === 1 ? '' : 's'} painted ${this.textureName}`);
      }, { selectionTouched: false, shapeKept: true });
      clearGroup(this.strokeLayer);
      return;
    }
    this.edit('Paint collision', () => {
      this.deps.say(`${st.faces} face${st.faces === 1 ? '' : 's'} painted ${this.typeLabel(this.collisionType)}`);
    }, { selectionTouched: false, shapeKept: true });
  }

  /** How long the last rebuild took (ms): for a probe of the cost, not shown. */
  lastBuildMs = 0;

  private build(): void {
    const geo = this.drawGeometry;
    if (!geo) return;
    const started = performance.now();
    this.built = buildHullWith(geo, this.hullGeo);       // the hull from the draws, the collision edits over it
    this.stale = false;
    this.lastBuildMs = performance.now() - started;
    this.deps.onBuilt();
  }

  /* ---------- drawing ---------- */

  private disposeView(): void {
    if (!this.drawn) return;
    this.deps.scene.remove(this.drawn.group);
    this.drawn.dispose();
    this.drawn = null;
  }

  /** The edited world drawn: compiled, a view of its own built, the base's world hidden under it. */
  private redraw(): void {
    if (this.collisionOn) {
      // Collision editing: the hull objects drawn as their own view; the drawn world as it stands.
      this.trisCache.clear();
      this.cageCache.clear();
      this.hoverKey = '';
      if (!this.geo) return;
      this.index = PickIndex.build(this.geo);
      this.drawHull();
      this.drawEdges();
      this.drawSelection();
      return;
    }
    this.redrawWorld();
  }

  /** The drawn world compiled and drawn again (from the drawn geometry in either mode), then what the tools work on. */
  private redrawWorld(): void {
    this.trisCache.clear();
    this.cageCache.clear();
    this.hoverKey = '';
    const map = this.forMap;
    const dg = this.drawGeometry;
    if (!this.geo || !dg || !map) return;
    this.sources = new Map();
    this.draws = compileDraws(dg, this.sources, map.grid);                // bug 16: a moved draw refiled in its cells
    this.index = PickIndex.build(this.geo);
    this.drawHull();
    const v = buildWorld({ ...map, world: this.draws, props: [], lines: null });
    for (const task of v.revealWorld) task();
    this.deps.prepareView(v);
    this.deps.onViewSwap(v);
    this.disposeView();
    this.drawn = v;
    this.deps.scene.add(v.group);
    this.deps.baseWorldShown(false);
    this.drawEdges();                                          // the faces' edges as edited
    this.drawSelection();
  }

  private trianglesOf(o: GeoObject, faces: Iterable<number>): number[] {
    const out: number[] = [];
    for (const f of faces) {
      const face = o.mesh.faces[f];
      if (!face) continue;
      if (face.disp) {
        const g = displacementGrid(o.mesh, f);
        for (const t of g.triangles) for (const i of t) out.push(...g.points[i]!);
        continue;
      }
      const ps = facePoints(o.mesh, f);
      for (const t of triangulate(ps)) for (const i of t) out.push(...ps[i]!);
    }
    return out;
  }

  /** The selection's highlight, the focused object's points and edges, and the gizmo at the selection's middle. */
  private drawSelection(): void {
    this.syncBlockHandles();
    clearGroup(this.overlay);
    clearGroup(this.fixed);
    this.preview = null;
    this.overlay.matrix.identity();
    this.overlay.visible = this.active;
    this.fixed.visible = this.active;
    this.hover.visible = this.active;
    // The hover drawn again over what changed (an edit, a new mode, a selection), where the pointer is now.
    this.hoverKey = '';
    this.drawHover();
    this.drawTextureGrid();
    this.drawBar();
    this.deps.onObjects?.();
    this.deps.onSelect?.();                                    // a selection step, when it changed (the page compares)
    const geo = this.geo;
    if (!geo || !this.active) { this.detachGizmo(); return; }
    const add = (o: Object3D): void => { o.renderOrder = 10; this.overlay.add(o); };
    const faceMesh = (positions: number[], color: number, opacity: number): Mesh => {
      const g = new BufferGeometry();
      g.setAttribute('position', new BufferAttribute(Float32Array.from(positions), 3));
      return new Mesh(g, new MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, side: 2 }));
    };
    const lines = (positions: number[], color: number): LineSegments => {
      const g = new BufferGeometry();
      g.setAttribute('position', new BufferAttribute(Float32Array.from(positions), 3));
      return new LineSegments(g, new LineBasicMaterial({ color, depthTest: false, transparent: true }));
    };
    const points = (positions: number[], color: number, size: number): Points => {
      const g = new BufferGeometry();
      g.setAttribute('position', new BufferAttribute(Float32Array.from(positions), 3));
      return new Points(g, new PointsMaterial({ color, size, sizeAttenuation: false, depthTest: false, transparent: true }));
    };
    // Only what is selected is drawn here; the point or edge under the pointer is the hover's (`drawHover`).
    for (const id of this.sel.objects) {
      const o = this.objectById(id);
      if (!o) continue;
      // Collision mode: a lighter fill, the face's collision colour read through it (the collision view's own, under it).
      if (this.sel.mode === 'object') {
        add(faceMesh(this.trianglesOf(o, objectFaces(o)), HIGHLIGHT, this.collisionOn ? 0.12 : 0.3));
        const outline = this.featureEdges(o, objectFaces(o));
        if (outline) add(this.thickLines(outline, HIGHLIGHT, OUTLINE_PX));
      }
      const items = this.sel.items.get(id);
      if (!items) continue;
      // An object with points or edges selected keeps its cage and handles shown, as a level editor keeps a mesh's in its tools.
      if (this.sel.mode === 'point') this.fixed.add(this.handles(this.cageOf(o).points, HANDLE_PX, HOVER, true));
      if (this.sel.mode === 'face') {
        add(faceMesh(this.trianglesOf(o, items as Set<number>), HIGHLIGHT, this.collisionOn ? 0.15 : 0.45));
        // Each selected face's outline, on either layer (it was the Collision layer's alone).
        add(this.thickLines([...edgeMap(o.mesh, [...items as Set<number>]).values()].flatMap((e) => [...vertPos(o.mesh, e.a), ...vertPos(o.mesh, e.b)]), HIGHLIGHT, OUTLINE_PX));
      }
      if (this.sel.mode === 'edge') add(this.edgeHighlight([...items].flatMap((k) => edgeOfKey(k as string).flatMap((v) => vertPos(o.mesh, v))), HIGHLIGHT));
      if (this.sel.mode === 'point') add(this.handles([...items].flatMap((v) => vertPos(o.mesh, v as number)), HANDLE_PX + 5, HIGHLIGHT, true));
    }
    const centre = selectionCentre(geo, this.sel);
    if (centre && !(this.paintOn && this.collisionOn) && !this.textureOn) {   // painting, or the Texture layer: no gizmo
      this.pivot.position.set(centre[0], centre[1], centre[2]);
      if (this.space === 'local') this.pivot.quaternion.copy(this.localFrame());
      else this.pivot.quaternion.identity();
      this.pivot.scale.set(1, 1, 1);
      this.pivot.updateMatrixWorld(true);
      this.gizmo.camera = this.deps.camera();
      if (this.gizmo.object !== this.pivot) this.gizmo.attach(this.pivot);
      this.gizmo.getHelper().visible = true;
    } else this.detachGizmo();
  }

  private detachGizmo(): void {
    if (this.gizmo.object) this.gizmo.detach();
    this.gizmo.getHelper().visible = false;
  }

  private drawBar(): void {
    this.drawToolPanel();                                      // shown only while its tool's result stands, Create off
    // Create on: the selection modes off (the owner, 2026-11-18: "if we are in create mode for geometry, disable all the
    // select tools, as it doesn't make sense to select a face in create mode"); Esc or Select brings them back.
    for (const m of MODES) {
      const b = this.buttons.get(`mode-${m.mode}`);
      if (!b) continue;
      b.classList.toggle('is-on', this.sel.mode === m.mode);
      // An edit tool on (the Knife) does not lock them (the owner, 2026-11-19: "when we are using an edit tool, don't
      // disable the select mode"): choosing one leaves the tool (`setMode`).
      const busy = this.blockOn;
      b.disabled = busy;
      if (!b.dataset['title']) b.dataset['title'] = b.title;
      b.title = busy ? `${b.dataset['title']} -- not while Create is on (Esc leaves it)` : b.dataset['title'];
    }
    this.buttons.get('knife')?.classList.toggle('is-on', this.knifeOn);
    // The Edit tools a selection mode has no use for, not shown (the owner, 2026-11-18: "if an edit tool cannot even be used
    // in that mode, don't show it at all for that mode"); those it has, greyed while the selection gives them nothing to
    // do ("the edit tools should only be enabled ... if that operation can be done"), the reason in the title.
    // Dissolve is Combine Faces in Face mode, as the reference editor names it there (the owner, 2026-11-20).
    const dissolveButton = this.buttons.get('dissolve');
    if (dissolveButton) {
      const face = this.sel.mode === 'face';
      dissolveButton.textContent = face ? 'Combine Faces' : 'Dissolve';
      dissolveButton.dataset['title'] = face ? COMBINE_TITLE : DISSOLVE_TITLE;
    }
    for (const [id, modes] of Object.entries(EDIT_TOOL_MODES)) {
      const b = this.buttons.get(id);
      if (!b) continue;
      if (!b.dataset['title']) b.dataset['title'] = b.title;
      const shown = modes.includes(this.sel.mode);
      b.hidden = !shown;
      const why = shown ? this.toolBlocked(id) : null;
      b.disabled = !shown || why !== null;
      b.title = why === null ? b.dataset['title'] : `${b.dataset['title']} -- ${why}`;
    }
    // A section with no tool the mode has: hidden whole, its name with it.
    for (const sec of [this.editGroup, this.selectGroup]) {
      if (!sec) continue;
      const any = [...sec.querySelectorAll<HTMLButtonElement>('button.fx-tool')].some((b) => !b.hidden);
      sec.hidden = this.textureOn || !any;
    }
    this.buttons.get('sculpt')?.classList.toggle('is-on', this.sculpting);
    this.buttons.get('sample')?.classList.toggle('is-on', this.sampling);
    this.deps.onHistory();
    if (!this.geo) { this.status.textContent = ''; return; }
    let n = 0;
    if (this.sel.mode === 'object') n = this.sel.objects.size;
    else for (const s of this.sel.items.values()) n += s.size;
    const names = this.sel.mode === 'object' ? [...this.sel.objects].map((id) => this.objectById(id)?.name ?? id).slice(0, 2) : [];
    this.status.textContent = [
      `${this.geo.objects.length} objects`,
      n ? `${n} ${modeWord(this.sel.mode, n)} selected${names.length ? `: ${names.join(', ')}${n > 2 ? '...' : ''}` : ''}` : 'nothing selected',
    ].filter(Boolean).join(' / ');
  }

  private button(id: string, label: string, title: string, run: () => void): HTMLButtonElement {
    const b = this.deps.doc.createElement('button');
    b.type = 'button';
    b.className = 'fx-tool';
    b.textContent = label;
    b.title = title;
    b.addEventListener('click', () => run());
    this.buttons.set(id, b);
    return b;
  }

  /* ---------- the tools ---------- */

  /**
   * What a tool made, selected in the selection mode in force (the owner, 2026-11-18: "when bridging and or creating new
   * geometry don't switch the select mode for me"): its faces in Face mode, their edges or points in Edge or Point mode,
   * its objects in Object mode (`convertSelection`, as a level editor carries a selection across modes).
   */
  private madeSelection(parts: readonly { o: GeoObject; faces: readonly number[] }[]): Selection {
    const faces = emptySelection('face');
    for (const { o, faces: fs } of parts) { faces.objects.add(o.id); faces.items.set(o.id, new Set(fs)); }
    return this.sel.mode === 'face' || !this.geo ? faces : convertSelection(this.geo, faces, this.sel.mode);
  }

  /** Why an Edit tool can do nothing with the selection, in the mode it works in; null when it can. */
  private toolBlocked(id: string): string | null {
    if (id === 'knife') return null;                           // a tool clicked on the mesh: no selection needed
    const picked: { o: GeoObject; item: number | string }[] = [];
    for (const oid of this.sel.objects) {
      const o = this.objectById(oid);
      if (!o) continue;
      if (this.sel.mode === 'object') picked.push({ o, item: -1 });
      else for (const item of this.sel.items.get(oid) ?? []) picked.push({ o, item });
    }
    const what = { object: 'objects', point: 'vertices', edge: 'edges', face: 'faces' }[this.sel.mode];
    if (!picked.length) return `select ${what} first`;
    if (id === 'bridge') return this.bridgeBlocked(picked);
    if (id === 'connect' && picked.length < 2) return 'select two or more edges that share a face';
    if (id === 'connect' && this.sel.mode === 'point' && picked.length < 2) return 'select two or more vertices (joined in the order picked)';
    if (id === 'extend' && !picked.some((p) => edgeFaceCount(p.o.mesh, ...edgeOfKey(p.item as string)) === 1)) return EXTEND_NOT_OPEN;
    if (id === 'mergemeshes' && new Set(picked.map((p) => p.o.mesh)).size < 2) return 'select two or more objects (map sections are one mesh already)';
    if (id === 'snapvert' && picked.length < 2) return 'select two or more vertices (the last picked is where they go)';
    if (id === 'snapedge' && picked.length !== 2) return `select two edges (${picked.length} selected)`;
    if (id === 'separate') {
      // Faces that are already a whole object of their own have nothing to leave.
      const whole = [...this.sel.objects].every((oid) => {
        const o = this.objectById(oid);
        return !o || o.group !== undefined ? false : (this.sel.items.get(oid)?.size ?? 0) >= objectFaces(o).length;
      });
      return whole ? 'the selected faces are a whole object already' : null;
    }
    return null;
  }

  /** Why Bridge cannot join the selection (`./ops` `bridgeFaces`, `bridgeEdges` refuse the same); null when it can. */
  private bridgeBlocked(picked: readonly { o: GeoObject; item: number | string }[]): string | null {
    const what = this.sel.mode === 'face' ? 'faces' : 'edges';
    // Runs of open edges (more than two edges): one object's, as many in each run.
    if (this.sel.mode === 'edge' && picked.length > 2) {
      const o = picked[0]!.o;
      if (picked.some((p) => p.o !== o)) return 'bridge runs of edges within one object';
      return bridgeRunsBlocked(o.mesh, picked.map((p) => edgeOfKey(p.item as string)));
    }
    if (picked.length !== 2) return `select two ${what} (${picked.length} selected)`;
    const [one, two] = picked as [{ o: GeoObject; item: number | string }, { o: GeoObject; item: number | string }];
    if (one.o.mesh !== two.o.mesh && one.o.group !== undefined && two.o.group !== undefined) return 'the two are in different map meshes';
    if (this.sel.mode === 'edge') {
      // Open edges only (a level editor's): each edge read in its own object's mesh, before Bridge merges two objects.
      const e1 = edgeOfKey(one.item as string), e2 = edgeOfKey(two.item as string);
      if (one.o.mesh === two.o.mesh) return bridgeEdgesBlocked(one.o.mesh, e1, e2);
      const n1 = edgeFaceCount(one.o.mesh, e1[0], e1[1]), n2 = edgeFaceCount(two.o.mesh, e2[0], e2[1]);
      if (!n1 || !n2) return 'select two edges of faces';
      return n1 === 1 && n2 === 1 ? null : BRIDGE_OPEN_ONLY;
    }
    const a = one.o.mesh.faces[one.item as number] ? faceVerts(one.o.mesh, one.item as number) : [];
    const b = two.o.mesh.faces[two.item as number] ? faceVerts(two.o.mesh, two.item as number) : [];
    if (a.length !== b.length) return `the faces have ${a.length} and ${b.length} points: they need as many each`;
    if (one.o.mesh === two.o.mesh && a.some((v) => b.includes(v))) return 'the faces share a point';
    return null;
  }

  /** The edge the last click picked on screen (Edge mode), for a double-click's loop. */
  private lastEdgePick: { id: string; key: string } | null = null;

  /**
   * Loop or ring select (the owner, 2026-11-18: "implement the loop/ring select"; every modeller's): the
   * selected edges' loops (`./selection` `edgeLoop`) or rings (`edgeRing`) added to the selection -- or, given `from`,
   * those edges'. Edge mode only; each edge walks the faces of its own object.
   */
  selectEdges(how: 'loop' | 'ring', from?: readonly { id: string; key: string; side?: number }[]): void {
    if (!this.geo || this.sel.mode !== 'edge') { this.deps.say(`Select ${how === 'loop' ? 'Loop' : 'Ring'} works on edges: select one in Edge mode`, true); return; }
    const seeds: readonly { id: string; key: string; side?: number }[] = from ?? [...this.sel.objects].flatMap((id) => [...(this.sel.items.get(id) ?? [])].map((key) => ({ id, key: key as string })));
    const cam = this.deps.camera();
    const eye = new Vector3().setFromMatrixPosition(cam.matrixWorld).toArray();
    if (!seeds.length) { this.deps.say('Select an edge first', true); return; }
    let added = 0;
    const facesOf = new Map<string, number[]>();
    for (const seed of seeds) {
      const { id, key } = seed;
      const o = this.objectById(id);
      if (!o) continue;
      let faces = facesOf.get(id);
      if (!faces) { faces = objectFaces(o); facesOf.set(id, faces); }
      const [a, b] = edgeOfKey(key);
      // The side a loop runs round where it cannot go on: the face the pointer was on, else the edge's face turned most
      // toward the camera.
      const facing = (f: number): number => { const n = faceNormal(o.mesh, f), p = facePoints(o.mesh, f)[0]!; return dot(n, sub(eye, p)) / (length(sub(eye, p)) || 1); };
      const side = seed.side ?? (edgeMap(o.mesh, faces).get(key)?.faces ?? []).sort((x, y) => facing(y) - facing(x))[0];
      const walk = how === 'loop' ? edgeLoop(o.mesh, faces, a, b, side) : edgeRing(o.mesh, faces, a, b);
      let set = this.sel.items.get(id);
      if (!set) { set = new Set(); this.sel.items.set(id, set); }
      this.sel.objects.add(id);
      for (const k of walk) if (!set.has(k)) { set.add(k); added++; }
    }
    this.drawSelection();
    this.deps.say(added ? `${how === 'loop' ? 'Loop' : 'Ring'}: ${added} edge${added === 1 ? '' : 's'} added` : `No ${how} goes on from the selected edge${seeds.length === 1 ? '' : 's'}`);
  }

  /**
   * Grow or Shrink Selection (`./selection` `growSelection`): each selected object's points, edges or faces a step bigger
   * or smaller, within its own object. Point, Edge and Face mode; the change counted.
   */
  growSelection(how: 'grow' | 'shrink'): void {
    const mode = this.sel.mode;
    if (!this.geo || mode === 'object') { this.deps.say(`${how === 'grow' ? 'Grow' : 'Shrink'} works on points, edges or faces`, true); return; }
    let before = 0, after = 0;
    for (const id of [...this.sel.objects]) {
      const o = this.objectById(id);
      const items = this.sel.items.get(id);
      if (!o || !items) continue;
      before += items.size;
      const next = growSelection(o.mesh, objectFaces(o), mode, items, how);
      after += next.size;
      if (next.size) this.sel.items.set(id, next);
      else { this.sel.items.delete(id); this.sel.objects.delete(id); }
    }
    if (!before) { this.deps.say(`Select ${modeWord(mode, 2)} first`, true); return; }
    this.drawSelection();
    const d = Math.abs(after - before);
    this.deps.say(d ? `${how === 'grow' ? 'Grow' : 'Shrink'}: ${d} ${how === 'grow' ? 'added' : 'taken off'}, ${after} selected` : `${how === 'grow' ? 'Nothing more touches the selection' : 'The selection has no border to take off'}`);
  }

  private setMode(mode: SelectMode): void {
    if (!this.geo || this.blockOn) return;                                     // Create on: no selection mode to choose (`drawBar`)
    if (this.knifeOn) this.setKnife(false);                                    // a mode chosen mid-tool resets the tool
    if (this.lastOp) { this.lastOp = null; this.drawToolPanel(); }             // and ends the last tool's adjusting
    // Choosing a selection mode is choosing to select, not paint -- but on the Texture layer it is what a dab covers.
    if (this.tool !== 'select' && !this.textureOn) this.setTool('select');
    this.sel = convertSelection(this.geo, this.sel, mode);
    this.drawSelection();
  }

  /** Each selected object's faces the tools act on: a face selection's, or every face of an object selected whole. */
  private selectedFaceSets(): { o: GeoObject; faces: number[] }[] {
    if (!this.geo) return [];
    const out: { o: GeoObject; faces: number[] }[] = [];
    for (const id of this.sel.objects) {
      const o = this.objectById(id);
      if (!o) continue;
      const faces = this.sel.mode === 'object' ? objectFaces(o) : this.sel.mode === 'face' ? [...(this.sel.items.get(id) ?? [])] as number[] : [];
      if (faces.length) out.push({ o, faces });
    }
    return out;
  }

  private forFaces(run: (m: EditMesh, faces: number[], o: GeoObject) => void): boolean {
    const sets = this.selectedFaceSets();
    if (!sets.length) { this.deps.say('Select faces first (Face mode), or objects', true); return false; }
    for (const { o, faces } of sets) run(o.mesh, faces, o);
    return true;
  }

  private deleteSelection(): void {
    if (!this.geo) return;
    const geo = this.geo;
    this.edit('Delete geometry', () => {
      if (!this.sel.objects.size) return false;
      for (const id of this.sel.objects) {
        const o = this.objectById(id);
        if (!o) continue;
        const items = this.sel.items.get(id);
        if (this.sel.mode === 'object') { if (o.group === undefined) removeObject(geo, id); else deleteFaces(o.mesh, objectFaces(o)); }
        else if (this.sel.mode === 'face' && items) deleteFaces(o.mesh, items as Set<number>);
        else if (this.sel.mode === 'point' && items) deleteVerts(o.mesh, items as Set<number>);
        else if (this.sel.mode === 'edge' && items) deleteEdges(o.mesh, [...items].map((k) => edgeOfKey(k as string)));
        markReshaped(o);
      }
      this.sel = emptySelection(this.sel.mode);
      return true;
    });
  }

  /**
   * A level editor's dissolve (Backspace): in point mode each point goes and the faces round it merge (a point on a straight run
   * just leaves its edge); in edge mode each edge's two faces merge; in face mode the selected faces that touch merge.
   * Object mode has nothing to dissolve: Backspace deletes, as Delete does.
   */
  private dissolveSelection(): void {
    if (!this.geo) return;
    if (this.sel.mode === 'object') { this.deleteSelection(); return; }
    let kept = 0, made = 0;
    const after = emptySelection(this.sel.mode === 'face' ? 'face' : this.sel.mode);
    this.edit(this.sel.mode === 'face' ? 'Combine faces' : 'Dissolve', () => {
      if (!this.sel.objects.size) return false;
      for (const id of this.sel.objects) {
        const o = this.objectById(id);
        const items = this.sel.items.get(id);
        if (!o || !items?.size) continue;
        if (this.sel.mode === 'point') { const r = dissolveVerts(o.mesh, items as Set<number>); kept += r.kept; made += r.faces.length; }
        else if (this.sel.mode === 'edge') { const r = dissolveEdges(o.mesh, [...items].map((k) => edgeOfKey(k as string))); kept += r.kept; made += r.faces.length; }
        else {
          const left = dissolveFaces(o.mesh, [...items] as number[]);
          made += left.length;
          after.objects.add(id);
          after.items.set(id, new Set(left));
        }
        markReshaped(o);
      }
      this.sel = after;
      return made > 0;
    });
    const what = this.sel.mode === 'face' ? 'faces combined' : `${this.sel.mode === 'point' ? 'points' : 'edges'} dissolved`;
    if (kept) this.deps.say(`${what}; ${kept} left (on a border, or their faces would not make one face)${refusedWhy()}`, made === 0);
  }

  private extrude(): void { this.parametric('extrude', 'Extrude', () => this.extrudeRun()); }
  private extrudeRun(): void {
    if (this.sel.mode !== 'face') { this.deps.say('Extrude works on faces: select them in Face mode', true); return; }
    const unit = this.tp('extrude', 'distance');
    // The walls world-aligned (a level editor's new faces), at the extruded face's own texel scale where it has a mapping: each
    // wall's corners were its edge's, the same uv top and bottom, so its texture ran in stripes (the owner, 2026-11-17:
    // "When I extrude a face, there is no created geometry on the side walls"). The gizmo's move then keeps them mapped
    // (`transformVerts` rewrites a mapped face's uvs).
    this.edit('Extrude', () => this.forFaces((m, faces, o) => {
      const scaleOf = new Map(faces.map((f) => [f, m.faces[f]?.mapping?.scaleU ?? this.scaleTexel()] as const));
      const { walls } = extrudeFacesBy(m, faces, unit);
      if (!walls.length && lastRefusal) this.deps.say(`Extrude: nothing made${refusedWhy()}`, true);
      const texel = Math.min(...scaleOf.values());
      for (const w of walls) { const face = m.faces[w]; if (face) face.mapping = worldAligned(faceNormal(m, w), texel); }
      refreshUvs(m, walls, this.size);
      markReshaped(o);
    }));
  }

  /**
   * A level editor's Bridge (the owner, 2026-11-18: "lets start with a bridge tool first"; a browser adaptation): two selected
   * faces joined by new faces between them, the two removed (`./ops` `bridgeFaces`), or two selected edges joined by one
   * face (`bridgeEdges`). The new faces are world-aligned at the source face's texel scale, as an extrude's walls are,
   * and carry its object and collision. Two faces or edges of two objects: the objects merged into one first (a map's
   * section takes the other in; two sections already share the world's mesh). One edit; the new faces selected.
   */
  /** Bridge on two runs of open edges in one object (`./ops` `bridgeEdgeRuns`): the new faces world-aligned, selected. */
  private bridgeRuns(picked: readonly { o: GeoObject; item: number | string }[]): void {
    const o = picked[0]!.o;
    const blocked = this.bridgeBlocked(picked);
    if (blocked) { this.deps.say(`Bridge: ${blocked}`, true); return; }
    const texel = this.scaleTexel();
    let made = 0, error = '';
    this.edit('Bridge edges', () => {
      const r = bridgeEdgeRuns(o.mesh, picked.map((p) => edgeOfKey(p.item as string)));
      if ('error' in r) { error = r.error; return false; }
      for (const f of r.faces) { const face = o.mesh.faces[f]; if (face) face.mapping = worldAligned(faceNormal(o.mesh, f), texel); }
      refreshUvs(o.mesh, r.faces, this.size);
      markReshaped(o);
      made = r.faces.length;
      this.sel = this.madeSelection([{ o, faces: r.faces }]);
      return true;
    });
    if (error) this.deps.say(error, true);
    else this.deps.say(`Bridged: ${made} new face${made === 1 ? '' : 's'}`);
  }

  private bridge(): void { this.parametric(this.sel.mode === 'face' ? 'bridge' : 'bridgeEdges', 'Bridge', () => this.bridgeRun()); }
  private bridgeRun(): void {
    if (!this.geo) return;
    const mode = this.sel.mode;
    if (mode !== 'face' && mode !== 'edge') { this.deps.say('Bridge works on two faces (Face mode) or two edges (Edge mode)', true); return; }
    const picked: { o: GeoObject; item: number | string }[] = [];
    for (const id of this.sel.objects) {
      const o = this.objectById(id);
      for (const item of this.sel.items.get(id) ?? []) if (o) picked.push({ o, item });
    }
    const what = mode === 'face' ? 'faces' : 'edges';
    if (mode === 'edge' && picked.length > 2) { this.bridgeRuns(picked); return; }
    if (picked.length !== 2) { this.deps.say(`Bridge joins two ${what}: ${picked.length} selected`, true); return; }
    let [one, two] = picked as [{ o: GeoObject; item: number | string }, { o: GeoObject; item: number | string }];
    if (one.o.mesh !== two.o.mesh && one.o.group !== undefined && two.o.group !== undefined) {
      this.deps.say('Bridge joins two pieces of one mesh, or a map section and an object of its own', true);
      return;
    }
    const geo = this.geo;
    const scaleTexel = this.scaleTexel();
    let error = '';
    let merged = false;
    let made = 0;
    this.edit(`Bridge ${what}`, () => {
      // Two meshes: the second object into the first (a map's section always takes the other in), its items renumbered.
      if (one.o.mesh !== two.o.mesh) {
        if (two.o.group !== undefined) [one, two] = [two, one];
        const into = one.o, src = two.o.mesh;
        const faceBase = into.mesh.faces.length, vertBase = into.mesh.verts.length / 3;
        const faceAt = new Map<number, number>();
        let k = 0;
        src.faces.forEach((f, i) => { if (f) faceAt.set(i, faceBase + k++); });
        const item = mode === 'face' ? faceAt.get(two.item as number)! : edgeOfKey(two.item as string).map((v) => v + vertBase).join('_');
        if (!mergeObjects(geo, [into.id, two.o.id])) { error = 'The two objects could not be merged'; return false; }
        two = { o: into, item };
        merged = true;
      }
      const m = one.o.mesh;
      // The source face (the first face, or the face along the first edge): its texel scale, read before it goes.
      const src = mode === 'face' ? one.item as number : edgeMap(m).get(one.item as string)?.faces[0];
      const texel = (src !== undefined ? m.faces[src]?.mapping?.scaleU : undefined) ?? scaleTexel;
      const r = mode === 'face'
        ? bridgeFaces(m, one.item as number, two.item as number, this.tp('bridge', 'segments'))
        : bridgeEdges(m, edgeOfKey(one.item as string) as [number, number], edgeOfKey(two.item as string) as [number, number]);
      if ('error' in r) { error = r.error; return false; }
      // The new faces' texture: world-aligned at the source's texel scale (as an extrude's walls), their UVs laid.
      for (const f of r.faces) { const face = m.faces[f]; if (face) face.mapping = worldAligned(faceNormal(m, f), texel); }
      refreshUvs(m, r.faces, this.size);
      markReshaped(one.o);
      made = r.faces.length;
      this.sel = this.madeSelection([{ o: one.o, faces: r.faces }]);
      return true;
    });
    if (error) { this.deps.say(error, true); return; }
    this.deps.say(`Bridged: ${made} new face${made === 1 ? '' : 's'}${merged ? ' (the two objects merged into one)' : ''}`);
  }

  /**
   * A test instrument (the page's development build only, `__forgeCollision.geoMesh` / `geoSelect`; no game behaviour):
   * an object's points and face rings, and a selection set directly -- so a browser run can choose a box's top face or an
   * edge by its place, as a click would, without hunting for it on screen.
   */
  testMesh(id: string): { verts: number[]; faces: (number[] | null)[]; surfaces: (number[] | null)[] } | null {
    const o = this.objectById(id);
    if (!o) return null;
    const mine = new Set(objectFaces(o));
    return {
      verts: [...o.mesh.verts],
      faces: o.mesh.faces.map((f, i) => (f && mine.has(i) ? faceVerts(o.mesh, i) : null)),
      surfaces: o.mesh.faces.map((f, i) => (f && mine.has(i) && f.surface ? [...f.surface] : null)),
    };
  }
  testSelect(mode: SelectMode, picks: readonly { id: string; items: readonly (number | string)[] }[]): void {
    if (!this.geo || this.blockOn || this.knifeOn) return;
    this.sel = emptySelection(mode);
    for (const { id, items } of picks) { this.sel.objects.add(id); if (mode !== 'object') this.sel.items.set(id, new Set(items)); }
    this.drawSelection();
  }

  /** The step the made-to-measure tools use (Inset, Bevel): the grid's, else a metre. */
  private toolStep(): number {
    return this.snapStep > 0 ? this.snapStep : 1 / (this.forMap?.metersPerUnit ?? 1);
  }

  /* ---------- the Edit tools' settings, adjusted after the fact ---------- */

  /** The tools' settings the user set (kept in this browser), over their starting values. */
  private toolStore: Record<string, Record<string, number>> = readToolSettings();
  /**
   * The last parametric tool run (the owner, 2026-11-19: "parametric values ... in real time"; as a modeller's "adjust
   * last operation"): the geometry and selection it ran on, and how to run it again -- so a setting changed in the panel
   * runs it again over what it started from, in the same undo step. Gone on any other edit, an undo, a mode change.
   */
  private lastOp: { tool: string; title: string; before: GeoObject[]; sel: Selection; run: () => void } | null = null;
  /** A run again: `quiet` while a setting is dragged (no history, no build), `amend` at its release (the same step). */
  private rerun: 'quiet' | 'amend' | null = null;
  /** A parametric tool's first run is under way (its edit keeps `lastOp`). */
  private parametricRunning = false;
  private toolPanel: HTMLElement | null = null;
  /** The run the panel was built for. */
  private toolPanelFor: object | null = null;

  /** A tool's setting now: the user's, else its start (the grid step's or a metre's multiple where it says). */
  private tp(tool: string, key: string): number {
    const def = TOOL_SETTINGS[tool]?.find((d) => d.key === key);
    const v = this.toolStore[tool]?.[key];
    if (typeof v === 'number' && Number.isFinite(v)) return def ? Math.min(def.max, Math.max(def.min, v)) : v;
    if (!def) return 0;
    if (def.grid !== undefined) return this.toolStep() * def.grid;
    if (def.metre !== undefined) return def.metre / (this.forMap?.metersPerUnit ?? 1);
    return def.value ?? 0;
  }

  /** A parametric tool run: its first run made, then kept as `lastOp` for the panel; a run again goes straight through. */
  private parametric(tool: string, title: string, run: () => void): void {
    if (!this.geo) return;
    if (this.rerun) { run(); return; }
    const sel: Selection = { mode: this.sel.mode, objects: new Set(this.sel.objects), items: new Map([...this.sel.items].map(([k, v]) => [k, new Set(v)])) };
    const before = cloneGeometry(this.geo).objects;
    const edits = this.editCount;
    this.parametricRunning = true;
    try { run(); } finally { this.parametricRunning = false; }
    this.lastOp = this.editCount !== edits ? { tool, title, before, sel, run } : null;
    this.drawToolPanel();
  }
  /** Edits made so far (`parametric` tells whether a tool made one). */
  private editCount = 0;

  /** The last parametric tool run again over what it started from (a setting changed): `quiet` live, `amend` kept. */
  private rerunLast(mode: 'quiet' | 'amend'): void {
    const op = this.lastOp;
    if (!op || !this.geo) return;
    const fresh = cloneGeometry({ ...this.geo, objects: op.before }).objects;
    this.geo.objects.splice(0, this.geo.objects.length, ...fresh);
    this.sel = { mode: op.sel.mode, objects: new Set(op.sel.objects), items: new Map([...op.sel.items].map(([k, v]) => [k, new Set(v)])) };
    this.rerun = mode;
    try { op.run(); } finally { this.rerun = null; }
  }

  /**
   * The last parametric tool's settings, in a panel in the viewport's lower left (as Create's): a row each, changed live
   * as a value is dragged and kept at its release (`rerunLast`), Reset putting them back where they start. Shown while
   * the tool's result stands and nothing else has been done.
   */
  private drawToolPanel(rebuild = false): void {
    const op = this.lastOp;
    const defs = op ? TOOL_SETTINGS[op.tool] ?? [] : [];
    const shown = !!op && defs.length > 0 && this.active && !this.blockOn && !this.polyOn && !this.textureOn;
    if (!shown) { if (this.toolPanel) this.toolPanel.hidden = true; return; }
    // Built again only for another run (or Reset): a field being dragged is never taken from under the pointer.
    if (this.toolPanel && this.toolPanelFor === op && !rebuild) { this.toolPanel.hidden = false; return; }
    this.toolPanelFor = op;
    const doc = this.deps.doc;
    let panel = this.toolPanel;
    if (!panel) {
      panel = doc.createElement('div');
      panel.className = 'fx-ai-legend fx-create-panel fx-tool-panel';
      panel.setAttribute('role', 'group');
      panel.setAttribute('aria-label', 'Edit tool settings');
      (this.deps.legendHost?.() ?? this.deps.statusHost).append(panel);
      this.toolPanel = panel;
    }
    panel.hidden = false;
    panel.replaceChildren();
    const head = doc.createElement('div');
    head.className = 'fx-shape-settings-head';
    const title = doc.createElement('span');
    title.className = 'fx-create-panel-shape fx-tool-panel-title';
    title.textContent = op!.title;
    const reset = doc.createElement('button');
    reset.type = 'button';
    reset.className = 'fx-shape-reset';
    reset.textContent = 'Reset';
    reset.title = `Every ${op!.title} setting back to where it starts`;
    reset.addEventListener('click', () => { delete this.toolStore[op!.tool]; writeToolSettings(this.toolStore); this.rerunLast('amend'); this.drawToolPanel(true); });
    head.append(title, reset);
    panel.append(head);
    for (const d of defs) {
      if (d.when && this.tp(op!.tool, d.when.key) !== d.when.is) continue;
      const value = this.tp(op!.tool, d.key);
      const put = (v: number): void => { this.toolStore[op!.tool] = { ...this.toolStore[op!.tool], [d.key]: v }; };
      if (d.options) {
        const setting: ShapeSetting = { key: d.key, label: d.label, kind: 'choice', value: String(value), options: d.options.map((label, i) => ({ value: String(i), label })), note: d.note };
        // A choice can show or hide the settings that depend on it: the panel built again.
        panel.append(this.settingRow(setting, String(value), (v) => { put(Number(v)); writeToolSettings(this.toolStore); this.rerunLast('amend'); this.drawToolPanel(true); }));
        continue;
      }
      const setting: ShapeSetting = { key: d.key, label: d.label, kind: 'number', value, min: d.min, max: d.max, step: d.step, note: d.note, ...(d.unit ? { unit: d.unit } : {}) };
      panel.append(this.settingRow(setting, Math.round(value * 1000) / 1000,
        (v) => { put(v as number); writeToolSettings(this.toolStore); this.rerunLast('amend'); },
        (v) => { put(v); this.rerunLast('quiet'); }));
    }
  }

  /**
   * A level editor's Subdivide (the owner, 2026-11-18): in Face mode each selected face split in four round its middle (`./ops`
   * `subdivideFaces`; a triangle in three), its neighbours given the edge middles so nothing cracks; in Edge mode each
   * selected edge split at its middle. The new faces or half-edges selected, the mode kept. One edit.
   */
  private subdivide(): void {
    if (this.sel.mode === 'edge') this.parametric('subdivideEdges', 'Subdivide', () => this.subdivideRun());
    else this.parametric('subdivide', 'Quad Slice', () => this.subdivideRun());
  }
  private subdivideRun(): void {
    if (!this.geo || (this.sel.mode !== 'face' && this.sel.mode !== 'edge')) { this.deps.say('Subdivide works on faces or edges', true); return; }
    let made = 0;
    if (this.sel.mode === 'face') {
      this.edit('Subdivide faces', () => {
        const parts: { o: GeoObject; faces: number[] }[] = [];
        const ok = this.forFaces((m, faces, o) => {
          const out = subdivideFaces(m, faces, this.tp('subdivide', 'cutsX'), this.tp('subdivide', 'cutsY'));
          if (!out.length) return;
          refreshUvs(m, out, this.size);
          markReshaped(o);
          made += out.length;
          parts.push({ o, faces: out });
        });
        if (!ok || !made) return false;
        this.sel = this.madeSelection(parts);
        return true;
      });
      if (made) this.deps.say(`Subdivided: ${made} faces`);
      else this.deps.say(`Subdivide: nothing made${refusedWhy()}`, true);
      return;
    }
    this.edit('Subdivide edges', () => {
      const after = emptySelection('edge');
      for (const id of [...this.sel.objects]) {
        const o = this.objectById(id);
        const keys = [...(this.sel.items.get(id) ?? [])] as string[];
        if (!o || !keys.length) continue;
        const cuts = this.tp('subdivideEdges', 'cuts');
        const halves = new Set(subdivideEdges(o.mesh, keys.map((k) => edgeOfKey(k)), cuts));
        if (!halves.size) continue;
        made += halves.size / (cuts + 1);
        markReshaped(o);
        after.objects.add(id);
        after.items.set(id, halves);
      }
      if (!made) return false;
      this.sel = after;
      return true;
    });
    if (made) this.deps.say(`Subdivided: ${made} edge${made === 1 ? '' : 's'} cut`);
    else this.deps.say(`Subdivide: nothing split${refusedWhy()}`, true);
  }

  /**
   * every modeller's loop cut (the owner, 2026-11-18): for each selected edge, a new edge loop through the
   * middle of its ring (`./selection` `edgeRing`, `./ops` `loopCut`) -- across the four-sided faces beside it, round a
   * box or a cylinder, stopping where a face is not four-sided. The new loop selected (Edge mode). One edit.
   */
  private loopCutSelection(): void { this.parametric('loopcut', 'Loop Cut', () => this.loopCutRun()); }
  private loopCutRun(): void {
    if (!this.geo || this.sel.mode !== 'edge') { this.deps.say('Loop Cut works on edges: select one in Edge mode', true); return; }
    let cuts = 0, noRing = 0;
    this.edit('Loop cut', () => {
      const after = emptySelection('edge');
      for (const id of [...this.sel.objects]) {
        const o = this.objectById(id);
        const keys = [...(this.sel.items.get(id) ?? [])] as string[];
        if (!o || !keys.length) continue;
        const done = new Set<string>();
        const loop = new Set<string>();
        for (const k of keys) {
          if (done.has(k)) continue;
          const [a, b] = edgeOfKey(k);
          const ring = edgeRing(o.mesh, objectFaces(o), a, b);
          for (const r of ring) done.add(r);
          if (ring.length < 2) { noRing++; continue; }
          // The ring cut `cuts` times across, evenly (`./ops` `loopCutAt`; one cut is the ring connected).
          const cut = loopCutAt(o.mesh, a, b, this.tp('loopcut', 'cuts'), objectFaces(o));
          for (const [x, y] of cut) loop.add(edgeKey(x, y));
          if (cut.length) cuts++;
        }
        if (!loop.size) continue;
        const verts = new Set([...loop].flatMap((k) => edgeOfKey(k)));
        refreshUvs(o.mesh, objectFaces(o).filter((f) => faceVerts(o.mesh, f).some((v) => verts.has(v))), this.size);
        markReshaped(o);
        after.objects.add(id);
        after.items.set(id, loop);
      }
      if (!cuts) return false;
      this.sel = after;
      return true;
    });
    if (cuts) this.deps.say(`Loop cut: ${cuts} new loop${cuts === 1 ? '' : 's'}${noRing ? `; ${noRing} edge${noRing === 1 ? '' : 's'} with no even-sided face beside left` : ''}`);
    else this.deps.say(`Loop Cut needs an edge with an even-sided face beside it${refusedWhy()}`, true);
  }

  /**
   * Connect (the owner, 2026-11-19: one to one with the reference editor): the selected edges that share a face with
   * another selected edge split at their middles, and the new points joined across each face they share (`./ops`
   * `connectEdges`). The new edges selected. One edit.
   */
  private connectSelection(): void {
    if (this.sel.mode === 'point') { this.connectPoints(); return; }
    if (!this.geo || this.sel.mode !== 'edge') { this.deps.say('Connect works on edges: select two or more in Edge mode', true); return; }
    let made = 0;
    this.edit('Connect edges', () => {
      const after = emptySelection('edge');
      for (const id of [...this.sel.objects]) {
        const o = this.objectById(id);
        const keys = [...(this.sel.items.get(id) ?? [])] as string[];
        if (!o || keys.length < 2) continue;
        const cut = connectEdges(o.mesh, keys.map((k) => edgeOfKey(k)));
        if (!cut.length) continue;
        const verts = new Set(cut.flat());
        refreshUvs(o.mesh, objectFaces(o).filter((f) => faceVerts(o.mesh, f).some((v) => verts.has(v))), this.size);
        markReshaped(o);
        made += cut.length;
        after.objects.add(id);
        after.items.set(id, new Set(cut.map(([a, b]) => edgeKey(a, b))));
      }
      if (!made) return false;
      this.sel = after;
      return true;
    });
    if (made) this.deps.say(`Connected: ${made} new edge${made === 1 ? '' : 's'}`);
    else this.deps.say(`Connect needs two or more selected edges that share a face${refusedWhy()}`, true);
  }

  /**
   * Connect in Point mode (the reference editor's Connect Vertex Path; the owner, 2026-11-20): each object's selected
   * points joined in the order picked, each to the next by a straight cut across the faces between (`./ops` `knifeCut`,
   * the Knife's own cut through those points). All or nothing: a step with no way across refuses the whole connect.
   * The points stay selected. One edit.
   */
  private connectPoints(): void {
    const byObject = new Map<GeoObject, number[]>();
    for (const { o, item } of this.pickedInOrder()) (byObject.get(o) ?? byObject.set(o, []).get(o)!).push(item as number);
    if (![...byObject.values()].some((vs) => vs.length > 1)) { this.deps.say('Connect: select two or more vertices of one object (joined in the order picked)', true); return; }
    let made = 0, missed = false;
    this.edit('Connect vertices', () => {
      const saved = meshSaver();
      for (const [o, vs] of byObject) {
        if (vs.length < 2) continue;
        saved.save(o.mesh);
        const r = knifeCut(o.mesh, vs.map((v) => ({ v })));
        if (r.missed) { missed = true; saved.restore(); made = 0; return false; }
        if (!r.edges.length) continue;
        const verts = new Set(r.edges.flat());
        refreshUvs(o.mesh, objectFaces(o).filter((f) => faceVerts(o.mesh, f).some((v) => verts.has(v))), this.size);
        markReshaped(o);
        made += r.edges.length;
      }
      return made > 0;
    });
    if (made) this.deps.say(`Connected: ${made} new edge${made === 1 ? '' : 's'}`);
    else this.deps.say(missed ? 'Connect: no straight way across the faces between two of the points' : `Connect: the points are joined already${refusedWhy()}`, true);
  }

  /**
   * Merge Meshes (the reference editor's, Object mode; the owner, 2026-11-20: "add the merge mesh button"): the
   * selected objects made one -- each into the first picked (`./world` `mergeObjects`), nothing welded. A map's section
   * takes the others in (its mesh is the map's: a section is never merged away), and sections of the one map mesh are
   * one mesh already, so only one of them takes part. The merged object selected. One edit.
   */
  private mergeMeshes(): void {
    const geo = this.geo;
    if (!geo || this.sel.mode !== 'object') { this.deps.say('Merge Meshes works on objects: select them in Object mode', true); return; }
    const objs = [...this.sel.objects].map((id) => this.objectById(id)).filter((o): o is GeoObject => !!o);
    // One object a mesh, in the order picked; a map section first where there is one.
    const seen = new Set<EditMesh>();
    const parts = objs.filter((o) => (seen.has(o.mesh) ? false : (seen.add(o.mesh), true)));
    const section = parts.findIndex((o) => o.group !== undefined);
    if (section > 0) parts.unshift(...parts.splice(section, 1));
    if (parts.length < 2) { this.deps.say('Merge Meshes: select two or more objects (map sections are one mesh already)', true); return; }
    let into: GeoObject | null = null;
    this.edit('Merge meshes', () => {
      into = mergeObjects(geo, parts.map((o) => o.id));
      if (!into) return false;
      markReshaped(into);
      const sel = emptySelection('object');
      sel.objects.add(into.id);
      this.sel = sel;
      return true;
    });
    if (into) this.deps.say(`Merged ${parts.length} objects into ${(into as GeoObject).name ?? 'one'}`);
    else this.deps.say('Merge Meshes: the objects could not be merged', true);
  }

  /**
   * Collapse (the reference editor's Shift+O; the owner, 2026-11-20): in Edge mode each run of selected edges made one
   * point at the average of its points (`./ops` `collapseEdgeGroups`, `mergeVerts`); in Face mode each selected face in
   * turn made one point at its middle (`collapseFaces`). The selection cleared, as the reference clears it. All or
   * nothing; one edit.
   */
  private collapseSelection(): void {
    const mode = this.sel.mode;
    if (!this.geo || (mode !== 'edge' && mode !== 'face')) { this.deps.say('Collapse works on edges or faces', true); return; }
    let made = 0;
    this.edit('Collapse', () => {
      const saved = meshSaver();
      for (const id of this.sel.objects) {
        const o = this.objectById(id);
        const items = this.sel.items.get(id);
        if (!o || !items?.size) continue;
        saved.save(o.mesh);
        const k = mode === 'edge' ? mergeVerts(o.mesh, collapseEdgeGroups([...items].map((x) => edgeOfKey(x as string))), 'centre') : collapseFaces(o.mesh, [...items] as number[]);
        if (!k.length) { saved.restore(); made = 0; return false; }
        markReshaped(o);
        made += k.length;
      }
      if (!made) return false;
      this.sel = emptySelection(mode);
      return true;
    });
    if (made) this.deps.say(`Collapsed to ${made} point${made === 1 ? '' : 's'}`);
    else this.deps.say(`Collapse: nothing collapsed${refusedWhy()}`, true);
  }

  /**
   * Extend (the reference editor's N in Edge mode; the owner, 2026-11-20): each selected open edge given a new face,
   * its far edge the Amount out (a grid step to start, as the reference's) in the plane of the edge's face (`./ops`
   * `extendEdges`); the far edges selected. One edit; its Amount in the settings panel.
   */
  private extendSelection(): void { this.parametric('extend', 'Extend', () => this.extendRun()); }
  private extendRun(): void {
    if (!this.geo || this.sel.mode !== 'edge') { this.deps.say('Extend works on open edges in Edge mode', true); return; }
    const amount = this.tp('extend', 'amount');
    let made = 0;
    this.edit('Extend edges', () => {
      const after = emptySelection('edge');
      for (const id of this.sel.objects) {
        const o = this.objectById(id);
        const items = this.sel.items.get(id);
        if (!o || !items?.size) continue;
        const r = extendEdges(o.mesh, [...items].map((x) => edgeOfKey(x as string)), amount);
        if (!r.faces.length) continue;
        markReshaped(o);
        made += r.faces.length;
        after.objects.add(id);
        after.items.set(id, new Set(r.edges.map(([a, b]) => edgeKey(a, b))));
      }
      if (!made) return false;
      this.sel = after;
      return true;
    });
    if (made) this.deps.say(`Extended ${made} edge${made === 1 ? '' : 's'} by ${Math.round(amount * 1000) / 1000} units`);
    else this.deps.say(`Extend: ${lastRefusal ? `nothing made${refusedWhy()}` : EXTEND_NOT_OPEN}`, true);
  }

  /** Select Ribs (the reference editor's Ctrl+G in Edge mode; `./selection` `edgeRibs`): the ribs the new selection. */
  private selectRibs(): void {
    if (!this.geo || this.sel.mode !== 'edge') { this.deps.say('Select Ribs works on edges', true); return; }
    const next = emptySelection('edge');
    for (const id of this.sel.objects) {
      const o = this.objectById(id);
      const items = this.sel.items.get(id);
      if (!o || !items?.size) continue;
      const ribs = edgeRibs(o.mesh, objectFaces(o), [...items].map((x) => edgeOfKey(x as string)));
      if (ribs.size) { next.objects.add(id); next.items.set(id, ribs); }
    }
    const n = [...next.items.values()].reduce((t, x) => t + x.size, 0);
    if (!n) { this.deps.say('Select Ribs: select one run or loop of edges beside four-sided faces', true); return; }
    this.sel = next;
    this.drawSelection();
    this.deps.say(`Select Ribs: ${n} edges`);
  }

  /**
   * A level editor's Bevel on edges (the owner, 2026-11-18; one segment, a chamfer) -- or, on faces, their outline's edges: each edge between two faces
   * replaced by a face a grid step across (`./ops` `bevelEdges`), held under half its faces' edges. The bevel faces
   * world-aligned at their face's texel scale (as an extrude's walls), the faces they reshaped laid again. The bevels
   * selected, the mode kept. One edit.
   */
  private bevel(): void { this.parametric('bevel', 'Bevel', () => this.bevelRun()); }
  private bevelRun(): void {
    if (!this.geo || (this.sel.mode !== 'edge' && this.sel.mode !== 'face')) { this.deps.say('Bevel works on edges or faces', true); return; }
    const onFaces = this.sel.mode === 'face';
    const width = this.tp('bevel', 'width'), segments = this.tp('bevel', 'segments'), shape = this.tp('bevel', 'shape');
    const scaleTexel = this.scaleTexel();
    let made = 0, skipped = 0;
    this.edit('Bevel', () => {
      const parts: { o: GeoObject; faces: number[] }[] = [];
      for (const id of [...this.sel.objects]) {
        const o = this.objectById(id);
        const items = [...(this.sel.items.get(id) ?? [])];
        if (!o || !items.length) continue;
        const m = o.mesh;
        // Faces (the owner, 2026-11-18: "can a face have a bevel?" -- "yes"; Blender's face bevel): their outline -- each
        // edge between a selected face and one not selected -- bevelled; the edges between selected faces left.
        const keys = onFaces ? (() => {
          const chosen = new Set(items as number[]);
          return [...edgeMap(m, objectFaces(o)).entries()].filter(([, e]) => e.faces.length === 2 && e.faces.filter((f) => chosen.has(f)).length === 1).map(([k]) => k);
        })() : items as string[];
        if (!keys.length) continue;
        const texel = Math.min(scaleTexel, ...keys.map((k) => { const f = edgeMap(m).get(k)?.faces[0]; return (f !== undefined && m.faces[f]?.mapping?.scaleU) || scaleTexel; }));
        const r = bevelEdges(m, keys.map((k) => edgeOfKey(k)), width, segments, shape);
        skipped += r.skipped;
        if (!r.faces.length) continue;
        for (const f of r.faces) { const face = m.faces[f]; if (face) face.mapping = worldAligned(faceNormal(m, f), texel); }
        refreshUvs(m, [...r.faces, ...r.touched], this.size);
        markReshaped(o);
        made += r.faces.length;
        parts.push({ o, faces: r.faces });
      }
      if (!made) return false;
      this.sel = this.madeSelection(parts);
      return true;
    });
    if (made) this.deps.say(`Bevelled ${Math.round(width * 100) / 100} units${skipped ? `; ${skipped} edge${skipped === 1 ? '' : 's'} not between two faces left` : ''}`);
    else this.deps.say(`${onFaces ? 'Bevel needs faces with an outline between them and other faces' : 'Bevel needs edges between two faces'}${refusedWhy()}`, true);
  }

  /* ---------- the Knife ---------- */

  /** The Knife on (a level editor's knife: points clicked on the mesh, Enter cuts): its points so far, and where it would take one. */
  private knifeOn = false;
  private knifePts: { id: string; p: KnifePoint; at: Vec3 }[] = [];
  private knifeHover: { id: string; p: KnifePoint; at: Vec3 } | null = null;
  /**
   * The Knife's loop mode (the reference editor's, V while the Knife is on): before a point is made, the pointer on an
   * edge shows the loop through it -- across four-sided faces, at that place along each edge -- and a click cuts it.
   */
  private knifeLoop = false;
  /** The Knife is on (the page leaves it V, its loop mode's: `../keys`). */
  knifeActive(): boolean { return this.active && this.knifeOn; }
  private knifeLoopLines: { key: string; lines: number[] } | null = null;
  private readonly knifeLayer = new Group();

  /**
   * The Knife on or off (the owner, 2026-11-18: "implement ... Knife"; a level editor's): on, a click is a point of the cut -- a
   * point of the mesh, or a place along an edge -- Enter cuts between them in order, Backspace takes the last back, Esc
   * lets them go (then the tool). Create off, the gizmo aside, the selection modes held (`drawBar`).
   */
  private setKnife(on: boolean): void {
    if (on && !this.geo) return;
    if (on && this.blockOn) this.setBlockOn(false);
    this.knifeOn = on;
    this.knifePts = [];
    this.knifeHover = null;
    if (on) {
      this.detachGizmo();
      this.hoverKey = '';
      clearGroup(this.hover);
      this.deps.say('Knife: click points on vertices, edges or across faces of one object (start on an edge or a vertex); Enter cuts, Backspace takes a point back, Esc leaves');
    } else this.drawSelection();
    this.drawKnife();
    this.drawBar();
  }

  /**
   * Where a Knife click at `ndc` would put its point: the mesh's point within reach on screen, else the nearest place
   * along an edge (the view ray's closest to it) -- on the object the cut is on once it has a point, else on what the
   * pointer is over -- never one hidden behind the geometry. Null: nothing in reach.
   */
  private knifeAt(ndc: Vector2): { id: string; p: KnifePoint; at: Vec3 } | null {
    if (!this.geo) return null;
    const cam = this.deps.camera();
    const r = this.deps.input.getBoundingClientRect();
    const toPx = (x: number, y: number, z: number): [number, number] | null => {
      const v = new Vector3(x, y, z).project(cam);
      return v.z > 1 || v.z < -1 ? null : [((v.x - ndc.x) * r.width) / 2, ((v.y - ndc.y) * r.height) / 2];
    };
    const ray = this.rayAt(ndc, cam);
    const eye = new Vector3().setFromMatrixPosition(cam.matrixWorld).toArray();
    const seen = (p: readonly number[]): boolean => !this.index || this.index.visible(eye, p);
    let objects: GeoObject[];
    const first = this.knifePts[0];
    if (first) { const o = this.objectById(first.id); objects = o ? [o] : []; }
    else {
      const around = [[0, 0], [PICK_PX, 0], [-PICK_PX, 0], [0, PICK_PX], [0, -PICK_PX]].map(([dx, dy]) => pickFace(this.geo!, this.rayAt(new Vector2(ndc.x + (2 * dx!) / r.width, ndc.y + (2 * dy!) / r.height), cam), this.index)?.object ?? null);
      objects = [...new Set(around.filter((o): o is GeoObject => !!o))];
    }
    // The grid snap on (Ctrl flips it, as a move's): the nearest snap place on the face under the pointer (`./knifeSnap`).
    const step = this.moveSnap();
    if (step) {
      const snapped = this.knifeSnapAt(ndc, objects, step);
      if (snapped) return snapped;
    }
    let best: { id: string; p: KnifePoint; at: Vec3; d: number } | null = null;
    for (const o of objects) {
      const cage = this.cageOf(o);
      for (let i = 0; i < cage.verts.length; i++) {
        const at: Vec3 = [cage.points[i * 3]!, cage.points[i * 3 + 1]!, cage.points[i * 3 + 2]!];
        const q = toPx(at[0], at[1], at[2]);
        if (!q) continue;
        const d = Math.hypot(q[0], q[1]);
        if (d <= PICK_PX && (!best || d < best.d) && seen(at)) best = { id: o.id, p: { v: cage.verts[i]! }, at, d: d - PICK_PX };   // a point before an edge
      }
    }
    if (best) return { id: best.id, p: best.p, at: best.at };
    for (const o of objects) {
      const cage = this.cageOf(o);
      for (let i = 0; i < cage.edgeKeys.length; i++) {
        const e = cage.edges;
        const A: Vec3 = [e[i * 6]!, e[i * 6 + 1]!, e[i * 6 + 2]!], B: Vec3 = [e[i * 6 + 3]!, e[i * 6 + 4]!, e[i * 6 + 5]!];
        // The edge's place nearest the view ray.
        const u = sub(B, A), w0 = sub(ray.origin, A);
        const b = dot(ray.dir, u), c = dot(u, u), dd = dot(ray.dir, w0), ee = dot(u, w0);
        const den = c - b * b;
        const t = Math.min(0.98, Math.max(0.02, den > 1e-12 ? (ee - b * dd) / den : 0.5));
        const at: Vec3 = [A[0] + u[0] * t, A[1] + u[1] * t, A[2] + u[2] * t];
        const q = toPx(at[0], at[1], at[2]);
        if (!q) continue;
        const d = Math.hypot(q[0], q[1]);
        if (d > PICK_PX || (best && d >= best.d) || !seen(at)) continue;
        // The place along the edge from its key's first point, worked from the mesh's own points (the cage holds them
        // in single floats, so its ends need not equal them: a place read off it would land mirrored on the edge).
        const [a, bb] = edgeOfKey(cage.edgeKeys[i]!);
        const pa = vertPos(o.mesh, a), pb = vertPos(o.mesh, bb);
        const ab = sub(pb, pa), len2 = dot(ab, ab);
        const ta = len2 > 1e-18 ? Math.min(0.98, Math.max(0.02, dot(sub(at, pa), ab) / len2)) : 0.5;
        best = { id: o.id, p: { a, b: bb, t: ta }, at: add(pa, scale(ab, ta)), d };
      }
    }
    if (best) return { id: best.id, p: best.p, at: best.at };
    // No point or edge in reach: the place inside the face under the pointer (a cut across it, `./ops` `knifeCut`).
    const hit = pickFace(this.geo, ray, this.index);
    if (hit && objects.includes(hit.object) && !hit.object.mesh.faces[hit.face]?.disp) return { id: hit.object.id, p: { f: hit.face, at: hit.at }, at: hit.at };
    return null;
  }

  /**
   * The Knife's snapped point at `ndc` (`./knifeSnap` `knifeSnapped`): on the face of `objects` under the pointer (or
   * a pick's reach off it), the snap place nearest where the pointer meets it -- the cut's last point on that object
   * its alignments' start, Shift (with a point made) only the aligned places, on the workplane's frame. Null: no face.
   */
  private knifeSnapAt(ndc: Vector2, objects: readonly GeoObject[], step: number): { id: string; p: KnifePoint; at: Vec3 } | null {
    if (!this.geo) return null;
    const cam = this.deps.camera();
    const r = this.deps.input.getBoundingClientRect();
    for (const [dx, dy] of [[0, 0], [PICK_PX, 0], [-PICK_PX, 0], [0, PICK_PX], [0, -PICK_PX]]) {
      const hit = pickFace(this.geo, this.rayAt(new Vector2(ndc.x + (2 * dx!) / r.width, ndc.y + (2 * dy!) / r.height), cam), this.index);
      if (!hit || !objects.includes(hit.object) || hit.object.mesh.faces[hit.face]?.disp) continue;
      const m = hit.object.mesh;
      const last = [...this.knifePts].reverse().find((k) => k.id === hit.object.id);
      const prev: KnifePrev | null = last ? { at: last.at, ...('a' in last.p ? { edge: [last.p.a, last.p.b] as const } : {}) } : null;
      const { origin, q } = workplaneFrame(this.deps.workplane?.() ?? flatWorkplane(0));
      const axis = (x: number, y: number, z: number): Vec3 => new Vector3(x, y, z).applyQuaternion(q).toArray() as Vec3;
      const frame: KnifeFrame = { origin: origin.toArray() as Vec3, axes: [axis(1, 0, 0), axis(0, 1, 0), axis(0, 0, 1)] };
      const s = knifeSnapped(m, hit.face, hit.at as Vec3, step, frame, prev, this.shiftHeld && !!prev);
      if (s) return { id: hit.object.id, p: s.p, at: s.at };
    }
    return null;
  }

  /** The loop the Knife's loop mode would cut through hover `h` (on an edge), as line pairs; a copy cut to see it. */
  private knifeLoopPreview(h: { id: string; p: KnifePoint; at: Vec3 } | null): number[] | null {
    if (!h || !('a' in h.p)) return null;
    const o = this.objectById(h.id);
    if (!o) return null;
    const key = `${h.id}:${h.p.a}_${h.p.b}:${h.p.t.toFixed(5)}`;
    if (this.knifeLoopLines?.key === key) return this.knifeLoopLines.lines;
    const copy = cloneMesh(o.mesh);
    const lines = loopCutAt(copy, h.p.a, h.p.b, 1, objectFaces(o), h.p.t).flatMap(([x, y]) => [...vertPos(copy, x), ...vertPos(copy, y)]);
    this.knifeLoopLines = { key, lines };
    return lines;
  }

  /** The loop mode's click: the loop through the edge place `at` cut (`./ops` `loopCutAt` at its share), its edges selected. */
  private knifeLoopCut(at: { id: string; p: KnifePoint; at: Vec3 } | null): void {
    if (!at || !('a' in at.p)) { this.deps.say('Knife loop: point at an edge (beside a four-sided face)', true); return; }
    const o = this.objectById(at.id);
    if (!o) return;
    const { a, b, t } = at.p;
    let made = 0;
    this.edit('Loop cut', () => {
      const cut = loopCutAt(o.mesh, a, b, 1, objectFaces(o), t);
      if (!cut.length) return false;
      made = cut.length;
      const verts = new Set(cut.flat());
      refreshUvs(o.mesh, objectFaces(o).filter((f) => faceVerts(o.mesh, f).some((v) => verts.has(v))), this.size);
      markReshaped(o);
      const edges = emptySelection('edge');
      edges.objects.add(o.id);
      edges.items.set(o.id, new Set(cut.map(([x, y]) => edgeKey(x, y))));
      this.sel = this.sel.mode === 'edge' || !this.geo ? edges : convertSelection(this.geo, edges, this.sel.mode);
      return true;
    });
    this.knifeLoopLines = null;
    this.knifeHover = null;
    this.drawKnife();
    if (made) this.deps.say(`Knife loop: ${made} new edges (click another edge, V for points, Esc leaves)`);
    else this.deps.say(`Knife loop: no four-sided face beside that edge${refusedWhy()}`, true);
  }

  private knifeClick(n: Vector2): void {
    if (this.knifeLoop && !this.knifePts.length) { this.knifeLoopCut(this.knifeAt(n)); return; }
    const at = this.knifeAt(n);
    if (!at) { this.deps.say('Knife: click on a face, an edge or a vertex', true); return; }
    if (!this.knifePts.length && 'f' in at.p) { this.deps.say('Knife: start the cut on an edge or a vertex (then click across faces, edges or vertices)', true); return; }
    const last = this.knifePts[this.knifePts.length - 1];
    if (last && length(sub(last.at, at.at)) < 1e-6) return;     // the same place twice: one point
    this.knifePts.push(at);
    this.drawKnife();
  }

  /** The Knife's cut (Enter): `./ops` `knifeCut` through its points in order, one edit; the cut edges selected. */
  private knifeApply(): void {
    const pts = this.knifePts;
    const o = pts.length ? this.objectById(pts[0]!.id) : undefined;
    // One point on an edge: the edge split there, the new point selected (the reference editor's single cut point).
    const one = pts.length === 1 ? pts[0]!.p : null;
    if (o && one && 'a' in one) {
      let made = -1;
      this.edit('Knife', () => {
        made = splitEdge(o.mesh, one.a, one.b, one.t);
        if (made < 0) return false;
        markReshaped(o);
        const points = emptySelection('point');
        points.objects.add(o.id);
        points.items.set(o.id, new Set([made]));
        this.sel = this.sel.mode === 'point' || !this.geo ? points : convertSelection(this.geo, points, this.sel.mode);
        return true;
      });
      this.knifePts = [];
      this.drawKnife();
      this.deps.say(made >= 0 ? 'Knife: the edge split at the point (click on for another, Esc leaves)' : `Knife: no split${refusedWhy()}`, made < 0);
      return;
    }
    if (pts.length < 2) { this.deps.say('Knife: click at least two points, then Enter', true); return; }
    if (!o) return;
    let cuts = 0, missed = 0;
    this.edit('Knife', () => {
      const r = knifeCut(o.mesh, pts.map((x) => x.p));
      cuts = r.edges.length; missed = r.missed;
      if (!cuts) return false;
      const verts = new Set(r.edges.flat());
      refreshUvs(o.mesh, objectFaces(o).filter((f) => faceVerts(o.mesh, f).some((v) => verts.has(v))), this.size);
      markReshaped(o);
      const edges = emptySelection('edge');
      edges.objects.add(o.id);
      edges.items.set(o.id, new Set(r.edges.map(([a, b]) => edgeKey(a, b))));
      this.sel = this.sel.mode === 'edge' || !this.geo ? edges : convertSelection(this.geo, edges, this.sel.mode);
      return true;
    });
    this.knifePts = [];
    this.drawKnife();
    if (cuts) this.deps.say(`Knife: ${cuts} cut${cuts === 1 ? '' : 's'}${missed ? `; ${missed} step${missed === 1 ? '' : 's'} with no face in common left` : ''} (click on for another, Esc leaves)`);
    else this.deps.say(`Knife: no cut -- each two points in a row must share a face${refusedWhy()}`, true);
  }

  /** The Knife's points, the lines between them, and the place a click would take, with a line to it. */
  private drawKnife(): void {
    clearGroup(this.knifeLayer);
    if (!this.knifeOn) return;
    const pts = this.knifePts.map((x) => x.at);
    if (pts.length) this.knifeLayer.add(this.handles(Float32Array.from(pts.flat()), HANDLE_PX, HIGHLIGHT, false));
    const pairs: number[] = [];
    for (let i = 0; i + 1 < pts.length; i++) pairs.push(...pts[i]!, ...pts[i + 1]!);
    if (pairs.length) this.knifeLayer.add(this.thickLines(pairs, HIGHLIGHT, EDGE_PX));
    const h = this.knifeHover;
    if (this.knifeLoop && !pts.length) {
      const lines = this.knifeLoopPreview(h);
      if (lines?.length) this.knifeLayer.add(this.thickLines(lines, HOVER, 3));
    }
    if (h) {
      this.knifeLayer.add(this.handles(Float32Array.from(h.at), HANDLE_PX, HOVER, false));
      const last = pts[pts.length - 1];
      if (last) this.knifeLayer.add(this.thickLines([...last, ...h.at], HOVER, 2));
    }
  }

  /**
   * A Shift-drag's extrude, made as the drag starts (the owner, 2026-11-18: "do shift drag for faces and edges"; a browser
   * adaptation after ProBuilder's and Maya's): the selected faces extruded by nothing (`./ops` `extrudeFaces`,
   * their walls between the old place and the new), or the selected edges pulled out into new faces (`extrudeEdges`, the
   * selection then their copies) -- so the drag moves them out and the walls follow, live. Not an edit of its own: the
   * release's move is the one edit (labelled Extrude), and a drag let go where it began puts everything back.
   */
  private beginDragExtrude(): void {
    if (!this.geo) return;
    const geo = this.geo;
    const before = cloneGeometry(geo).objects;
    const sel: Selection = { mode: this.sel.mode, objects: new Set(this.sel.objects), items: new Map([...this.sel.items].map(([k, v]) => [k, new Set(v)])) };
    const made = new Map<string, { faces: number[]; texel: number; sides?: number[][]; pairs?: [number, number][] }>();
    const scaleTexel = this.scaleTexel();
    for (const id of [...this.sel.objects]) {
      const o = this.objectById(id);
      const items = this.sel.items.get(id);
      if (!o || !items?.size) continue;
      const m = o.mesh;
      if (this.sel.mode === 'face') {
        const faces = [...items] as number[];
        const texel = Math.min(...faces.map((f) => m.faces[f]?.mapping?.scaleU ?? scaleTexel));
        made.set(id, { faces: extrudeFaces(m, faces, 0).walls, texel });
      } else if (this.sel.mode === 'point') {
        // A point on an open border extended out of it (its copy moved by the drag, a face across its border edges);
        // any other pulled out into a spike (its corners cut a grid step round it, the point at the apex).
        const verts = [...items] as number[];
        const firstNew = m.faces.length;
        const { moving, pairs } = extrudeOrExtendVerts(m, verts, this.toolStep());
        // The faces the extend made (each holds a copy) world-aligned at the release; a spike's pieces keep their mapping.
        const copies = new Set(moving.filter((x) => !verts.includes(x)));
        const fresh: number[] = [];
        for (let f = firstNew; f < m.faces.length; f++) if (m.faces[f] && faceVerts(m, f).some((v) => copies.has(v))) fresh.push(f);
        made.set(id, { faces: fresh, texel: scaleTexel, pairs });
        this.sel.items.set(id, new Set(moving));
      } else {
        const keys = [...items] as string[];
        const texel = Math.min(scaleTexel, ...keys.map((k) => { const f = edgeMap(m).get(k)?.faces[0]; return (f !== undefined && m.faces[f]?.mapping?.scaleU) || scaleTexel; }));
        // An open edge (a face on one side) is pulled out into a new face; an edge between two faces raises a ridge --
        // bevelled a quarter step wide with itself kept in the middle, which the drag pulls out (the mesh stays closed,
        // never a fin standing on it).
        const all = keys.map((k) => edgeOfKey(k));
        const closed = all.filter(([a, b]) => edgeFaceCount(m, a, b) === 2);
        const open = all.filter(([a, b]) => edgeFaceCount(m, a, b) === 1);
        const faces: number[] = [];
        const kept = new Set<string>();
        if (closed.length) {
          const r = extrudeClosedEdges(m, closed, this.toolStep() / 4);
          faces.push(...r.faces);
          if (r.faces.length) for (const [a, b] of closed) kept.add(edgeKey(a, b));
        }
        let sides: number[][] | undefined;
        if (open.length) {
          const r = extrudeEdges(m, open);
          faces.push(...r.faces);
          sides = [...Array(faces.length - r.faces.length).fill([]), ...r.sides];
          for (const [a, b] of r.edges) kept.add(edgeKey(a, b));
        }
        made.set(id, { faces, texel, ...(sides ? { sides } : {}) });
        this.sel.items.set(id, kept);
      }
      markReshaped(o);
    }
    if (!made.size) return;
    this.extruding = { objects: before, sel, made };
    this.redraw();
  }

  /**
   * every modeller's Inset (the owner, 2026-11-18: "lets try to implement inset"; a browser adaptation): the
   * selected faces shrunk in by the grid step (a metre with no grid) -- held under half the shortest edge of their border,
   * so nothing crosses -- with a ring of new faces round them (`./ops` `insetFaces`). The faces stay selected, inside
   * the ring, for the gizmo's scale to make it more or less. One edit.
   */
  /** The selection's items in the order picked, across objects: each object's in turn (`sel.objects`' order). */
  private pickedInOrder(): { o: GeoObject; item: number | string }[] {
    const out: { o: GeoObject; item: number | string }[] = [];
    for (const id of this.sel.objects) { const o = this.objectById(id); if (o) for (const item of this.sel.items.get(id) ?? []) out.push({ o, item }); }
    return out;
  }

  /** Points moved to new places, by object, as one edit (`./ops` `placeVerts`): the selection kept. */
  private placeEdit(label: string, places: ReadonlyMap<GeoObject, ReadonlyMap<number, Vec3>>): boolean {
    let moved = 0;
    this.edit(label, () => {
      for (const [o, at] of places) {
        if (!at.size) continue;
        placeVerts(o.mesh, at, { size: this.size });
        markReshaped(o);
        moved += at.size;
      }
      return moved > 0;
    });
    return moved > 0;
  }

  /**
   * Snap to Grid (the reference editor's Ctrl+B, in Point, Edge and Face mode; the owner, 2026-11-20): every selected
   * point -- or each point of the selected edges or faces -- put on the grid of the snap step in the workplane's frame
   * (`./ops` `onFrameGrid`). A face it bends is split (the bent-face rule in `edit`). One edit.
   */
  private snapToGrid(): void {
    if (!this.geo || this.sel.mode === 'object') { this.deps.say('Snap to Grid works on vertices, edges or faces', true); return; }
    const step = this.toolStep();
    const { origin, q } = workplaneFrame(this.deps.workplane?.() ?? flatWorkplane(0));
    const o3 = origin.toArray();
    const axes = [[1, 0, 0], [0, 1, 0], [0, 0, 1]].map(([x, y, z]) => new Vector3(x, y, z).applyQuaternion(q).toArray());
    const places = new Map<GeoObject, Map<number, Vec3>>();
    for (const id of this.sel.objects) {
      const o = this.objectById(id);
      if (!o) continue;
      const at = new Map<number, Vec3>();
      for (const v of selectionVerts(this.sel, o)) {
        const p = vertPos(o.mesh, v), g = onFrameGrid(p, o3, axes, step);
        if (length(sub(g, p)) > 1e-9) at.set(v, g);
      }
      places.set(o, at);
    }
    if (this.placeEdit('Snap to grid', places)) this.deps.say(`Snapped to the grid (${Math.round(step * 1000) / 1000} units)`);
    else this.deps.say('Snap to Grid: already on the grid', true);
  }

  /** Snap to Vertex (the reference editor's B in Point mode): every selected point moved onto the last one picked. One edit. */
  private snapToVertex(): void {
    const picked = this.pickedInOrder();
    if (this.sel.mode !== 'point' || picked.length < 2) { this.deps.say('Snap to Vertex: select two or more vertices (the last picked is where they go)', true); return; }
    const last = picked[picked.length - 1]!;
    const to = vertPos(last.o.mesh, last.item as number);
    const places = new Map<GeoObject, Map<number, Vec3>>();
    for (const { o, item } of picked) {
      const at = places.get(o) ?? places.set(o, new Map()).get(o)!;
      if (length(sub(vertPos(o.mesh, item as number), to)) > 1e-9) at.set(item as number, [...to] as Vec3);
    }
    if (this.placeEdit('Snap to vertex', places)) this.deps.say(`Snapped ${picked.length - 1} vertices onto the last picked`);
    else this.deps.say('Snap to Vertex: they are there already', true);
  }

  /**
   * Snap Edges (the reference editor's I in Edge mode): the first of two selected edges moved onto the second -- each
   * end onto the second's end the same way along (the reference swaps the targets where the edges run opposite ways).
   * One edit.
   */
  private snapEdgeToEdge(): void {
    const picked = this.pickedInOrder();
    if (this.sel.mode !== 'edge' || picked.length !== 2) { this.deps.say('Snap Edges: select two edges, the one to move first', true); return; }
    const [one, two] = picked as [{ o: GeoObject; item: number | string }, { o: GeoObject; item: number | string }];
    const [a, b] = edgeOfKey(one.item as string), [c, d] = edgeOfKey(two.item as string);
    let ta = vertPos(two.o.mesh, c), tb = vertPos(two.o.mesh, d);
    const pa = vertPos(one.o.mesh, a), pb = vertPos(one.o.mesh, b);
    if (dot(sub(pb, pa), sub(tb, ta)) < 0) [ta, tb] = [tb, ta];
    const places = new Map<GeoObject, Map<number, Vec3>>([[one.o, new Map<number, Vec3>([[a, ta], [b, tb]])]]);
    if (this.placeEdit('Snap edges', places)) this.deps.say('Snapped the first edge onto the second');
  }

  /**
   * Fill Hole (the owner, 2026-11-19: "do fill hole"; a browser adaptation): each hole a selected open edge lies on
   * capped with one face (`./ops` `fillHoles`), its texture world-aligned; a cap off its plane split into triangles (the
   * bent-face rule in `edit`). The holes' edges stay selected. One edit.
   */
  private fillSelection(): void {
    if (this.sel.mode !== 'edge') { this.deps.say('Fill Hole works on edges: select an edge of the hole in Edge mode', true); return; }
    let made = 0, why = '';
    this.edit('Fill hole', () => {
      const saved = meshSaver();
      for (const id of this.sel.objects) {
        const o = this.objectById(id);
        const items = this.sel.items.get(id);
        if (!o || !items?.size) continue;
        saved.save(o.mesh);
        const r = fillHoles(o.mesh, objectFaces(o), [...items].map((k) => edgeOfKey(k as string)));
        if ('error' in r) { why = r.error; saved.restore(); made = 0; return false; }   // all or nothing
        refreshUvs(o.mesh, r.faces, this.size);
        markReshaped(o);
        made += r.faces.length;
        const set = items as Set<number | string>;
        for (const f of r.faces) { const vs = faceVerts(o.mesh, f); vs.forEach((v, i) => set.add(edgeKey(v, vs[(i + 1) % vs.length]!))); }
      }
      return made > 0;
    });
    if (made) this.deps.say(`Fill: ${made} hole${made === 1 ? '' : 's'} capped`);
    else this.deps.say(why || 'Fill: select an edge of a hole', true);
  }

  /**
   * Thicken Faces (the reference editor's, G; the owner, 2026-11-20: "remove the hollow and add the thicken faces"):
   * each selected island of faces with an all-open border given a back `amount` behind it and walls round it (`./ops`
   * `thickenFaces`); its faces stay selected; the new faces world-aligned. An island on a closed solid is left alone.
   * One edit; its Amount (a grid step to start, as the reference's) in the settings panel.
   */
  private thicken(): void { this.parametric('thicken', 'Thicken', () => this.thickenRun()); }
  private thickenRun(): void {
    if (this.sel.mode !== 'face') { this.deps.say('Thicken works on faces: select them in Face mode', true); return; }
    const t = this.tp('thicken', 'amount');
    let made = 0;
    this.edit('Thicken faces', () => {
      const ok = this.forFaces((m, faces, o) => {
        const r = thickenFaces(m, faces, t);
        if (!r.faces.length) return;
        refreshUvs(m, [...r.back, ...r.walls], this.size);
        markReshaped(o);
        made += r.faces.length;
      });
      return ok && made > 0;
    });
    if (made) this.deps.say(`Thicken ${Math.round(t * 100) / 100} units: ${made} face${made === 1 ? '' : 's'} given a back`);
    else this.deps.say(`Thicken: nothing made${lastRefusal ? refusedWhy() : ` -- ${THICKEN_NOT_OPEN}`}`, true);
  }

  /**
   * Merge, as the reference editor's (the owner, 2026-11-19: "always match hammer for all tools"). Point mode: each
   * object's selected points merged by the Range setting -- Everything (one point), Grid (points nearer each other than
   * the grid step) or Fixed (nearer than Distance) -- each group landing where its last picked point is (`./ops`
   * `mergeGroups`). Edge mode: open edges welded -- two into one, more at their touching ends (`edgeMergeGroups`). The
   * kept points (Point mode) or the edges between them (Edge mode) selected after. One edit.
   */
  private mergeSelection(): void {
    if (this.sel.mode === 'edge') this.parametric('mergeEdges', 'Merge', () => this.mergeRun());
    else this.parametric('merge', 'Merge', () => this.mergeRun());
  }
  private mergeRun(): void {
    const mode = this.sel.mode;
    if (mode !== 'point' && mode !== 'edge') { this.deps.say('Merge works on points or edges', true); return; }
    const range = this.tp('merge', 'range');
    const within = range === 1 ? this.toolStep() : range === 2 ? this.tp('merge', 'distance') : null;
    let merged = 0, why = '';
    const kept = new Map<string, number[]>();
    this.edit('Merge', () => {
      const saved = meshSaver();
      for (const id of this.sel.objects) {
        const o = this.objectById(id);
        const items = this.sel.items.get(id);
        if (!o || !items?.size) continue;
        let groups: number[][], at: 'centre' | 'last' = 'last';
        if (mode === 'point') groups = mergeGroups(o.mesh, [...items] as number[], within);
        else {
          const r = edgeMergeGroups(o.mesh, objectFaces(o), [...items].map((k) => edgeOfKey(k as string)));
          if ('error' in r) { why = r.error; saved.restore(); merged = 0; return false; }
          ({ groups, at } = r);
        }
        groups = groups.filter((g) => g.length > 1);
        if (!groups.length) continue;
        saved.save(o.mesh);
        const k = mergeVerts(o.mesh, groups, at);
        if (!k.length) { saved.restore(); merged = 0; return false; }   // all or nothing
        markReshaped(o);
        merged += groups.reduce((n, g) => n + g.length, 0);
        kept.set(id, k);
      }
      if (!merged) return false;
      const sel = emptySelection(mode);
      for (const [id, k] of kept) {
        const o = this.objectById(id)!;
        let items: Set<number | string> = new Set(k);
        if (mode === 'edge') {
          const at = new Set(k);
          items = new Set([...edgeMap(o.mesh, objectFaces(o)).values()].filter((e) => at.has(e.a) && at.has(e.b)).map((e) => edgeKey(e.a, e.b)));
          if (!items.size) continue;
        }
        sel.objects.add(id); sel.items.set(id, items);
      }
      this.sel = sel;
      return true;
    });
    if (merged && !lastRefusal) this.deps.say(`Merge: ${merged} points made ${[...kept.values()].reduce((n, k) => n + k.length, 0)}`);
    else if (why) this.deps.say(`Merge: ${why}`, true);
    else this.deps.say(`Merge: ${lastRefusal ? `nothing merged${refusedWhy()}` : mode === 'edge' ? 'select two or more open edges' : within === null ? 'select two or more points' : 'no selected points are within the range'}`, true);
  }

  private inset(): void { this.parametric('inset', 'Inset', () => this.insetRun()); }
  private insetRun(): void {
    if (this.sel.mode !== 'face') { this.deps.say('Inset works on faces: select them in Face mode', true); return; }
    const step = this.tp('inset', 'amount'), steps = this.tp('inset', 'steps');
    let made = 0, amount = step;
    this.edit('Inset', () => {
      const parts: { o: GeoObject; faces: number[] }[] = [];
      const ok = this.forFaces((m, faces, o) => {
        // Held under half the region's shortest border edge.
        const inside = edgeMap(m, faces);
        let shortest = Infinity;
        for (const e of inside.values()) if (e.faces.length === 1) shortest = Math.min(shortest, length(sub(vertPos(m, e.b), vertPos(m, e.a))));
        const d = Math.min(step, shortest * 0.45);
        amount = Math.min(amount, d);
        const r = insetFaces(m, faces, d, steps);
        if (!r.ring.length) return;
        refreshUvs(m, [...r.faces, ...r.ring], this.size);
        markReshaped(o);
        made += r.ring.length;
        parts.push({ o, faces: r.faces });
      });
      if (!ok || !made) return false;
      this.sel = this.madeSelection(parts);
      return true;
    });
    if (made) this.deps.say(`Inset ${Math.round(amount * 100) / 100} units: ${made} new face${made === 1 ? '' : 's'} round the selection; scale it with the gizmo for more or less`);
    else if (lastRefusal) this.deps.say(`Inset: nothing made${refusedWhy()}`, true);
  }

  private separate(): void {
    if (!this.geo || this.sel.mode !== 'face') { this.deps.say('Separate works on faces: select them in Face mode', true); return; }
    const geo = this.geo;
    this.edit('Separate faces', () => {
      const made: GeoObject[] = [];
      for (const id of [...this.sel.objects]) {
        const o = this.objectById(id);
        const items = this.sel.items.get(id);
        if (!o || !items?.size) continue;
        const piece = separateFaces(geo, o, [...items] as number[], `${o.name} piece`);
        if (piece) made.push(piece);
      }
      if (!made.length) return false;
      this.sel = this.madeSelection(made.map((p) => ({ o: p, faces: objectFaces(p) })));
      return true;
    });
  }

  /**
   * Copy, Cut, Paste, Duplicate and Delete on the geometry (the owner, 2026-11-16: "implement copy/paste/cut/duplicate/
   * delete when in geometry mode ... on faces"), as a level editor has them: they act on faces (Face mode) or whole
   * objects (Object mode). A vertex or an edge is part of the faces round it, not geometry of its own, so there is
   * nothing of it to copy -- a level editor copies none; Delete (a hole) and Backspace (dissolve) are what those modes have.
   * - Copy: the selected faces (or objects) to the clipboard, as they are now.
   * - Cut: Copy, then Delete -- one step.
   * - Paste: a new object made of each copied set, in place -- exactly where it was copied, so it moves off in the old
   *   one's plane -- and selected, so the gizmo moves it on.
   * - Duplicate: a copy in place, selected (a level editor's way: then drag it off).
   * A face set pasted or duplicated is an object of its own (a level editor's paste makes a new mesh): the faces it came from
   * stay as they were, and nothing is welded. The clipboard keeps its layer: Geometry faces paste on the Geometry layer,
   * Collision faces on the Collision layer. The Texture layer edits no shape.
   */
  command(c: GeometryCommand): void {
    if (!this.geo || !this.active) return;
    if (this.textureOn) { this.deps.say('The Texture layer paints textures only: switch to the Geometry or Collision layer to edit shapes', true); return; }
    if (c === 'delete') { this.deleteSelection(); return; }
    if (c === 'paste') { this.pasteClip(); return; }
    if (this.sel.mode === 'point' || this.sel.mode === 'edge') {
      this.deps.say(`${c[0]!.toUpperCase()}${c.slice(1)} works on faces or whole objects: vertices and edges are parts of faces (switch to Face or Object mode)`, true);
      return;
    }
    const copies = this.selectionCopies();
    if (!copies.length) { this.deps.say(this.sel.mode === 'face' ? 'Select faces first' : 'Select objects first', true); return; }
    if (c === 'copy' || c === 'cut') {
      this.clip = { layer: this.collisionOn ? 'collision' : 'geometry', mode: this.sel.mode, items: copies, at: performance.now() };
      const n = this.clipCount();
      if (c === 'cut') this.deleteSelection();
      this.deps.say(`${c === 'cut' ? 'Cut' : 'Copied'} ${n}`);
      return;
    }
    this.placeCopies(copies, this.sel.mode, 'Duplicate geometry');
    this.deps.say(`Duplicated ${this.clipCount(copies, this.sel.mode)} in place: drag it off with the gizmo`);
  }

  /** Whether `c` has anything to act on now (the Edit menu's rows). */
  canCommand(c: GeometryCommand): boolean {
    if (!this.geo || !this.active || this.textureOn) return false;
    if (c === 'paste') return !!this.clip && this.clip.layer === (this.collisionOn ? 'collision' : 'geometry');
    if (c === 'delete') return this.sel.objects.size > 0;
    return (this.sel.mode === 'face' || this.sel.mode === 'object') && this.sel.objects.size > 0;
  }

  /** The clipboard: the copied sets as new objects would be made of them, the layer they came from, and their mode. */
  private clip: { layer: 'geometry' | 'collision'; mode: 'face' | 'object'; items: GeoObjectCopy[]; at: number } | null = null;

  /** When the clipboard was last filled (`performance.now()`), -Infinity when it holds nothing Object mode can paste. */
  clipAt(): number { return this.clip?.layer === 'geometry' ? this.clip.at : -Infinity; }

  /** "3 faces" / "2 objects": what a set of copies holds, for the status line. */
  private clipCount(items = this.clip?.items ?? [], mode = this.clip?.mode ?? 'face'): string {
    if (mode === 'object') return `${items.length} object${items.length === 1 ? '' : 's'}`;
    const n = items.reduce((s, c) => s + c.mesh.faces.filter((f) => f).length, 0);
    return `${n} face${n === 1 ? '' : 's'}`;
  }

  /** The selection copied as new objects would be made of it: each object's selected faces, or each object whole. */
  private selectionCopies(): GeoObjectCopy[] {
    const geo = this.geo;
    if (!geo) return [];
    const out: GeoObjectCopy[] = [];
    for (const id of this.sel.objects) {
      const o = this.objectById(id);
      if (!o) continue;
      if (this.sel.mode === 'object') { out.push(this.copyWithHull(geo, o)); continue; }
      const faces = [...(this.sel.items.get(id) ?? [])] as number[];
      const c = faces.length ? facesCopy(geo, o, faces, `${o.name} faces`) : null;
      if (c) out.push(c);
    }
    return out;
  }

  /**
   * A Ctrl-drag of faces let go (as an object's Ctrl-drag copies it, `transformObjects`): the selected faces copied out,
   * each object's an object of its own (`facesCopy`, as Copy and Paste make them), moved by the drag's `mat` with their
   * textures locked to them; the faces they came from stay where they were. The copies' faces selected after, one step.
   */
  private copyFacesBy(mat: ArrayLike<number>): void {
    const geo = this.geo;
    if (!geo) return;
    this.edit('Copy faces', () => {
      const made: GeoObject[] = [];
      for (const id of this.sel.objects) {
        const o = this.objectById(id);
        const faces = [...(this.sel.items.get(id) ?? [])] as number[];
        const c = o && faces.length ? facesCopy(geo, o, faces, `${o.name} faces`) : null;
        if (!c) continue;
        const copy = addObject(geo, c);
        transformObject(copy, mat, this.size);
        made.push(copy);
      }
      if (!made.length) return false;
      this.sel = emptySelection('face');
      for (const o of made) { this.sel.objects.add(o.id); this.sel.items.set(o.id, new Set(objectFaces(o))); }
      return true;
    });
  }

  /** Paste: the clipboard's sets where the cursor points (`pasteOffset`), on the layer they were copied on. */
  private pasteClip(): void {
    const clip = this.clip;
    if (!clip) { this.deps.say('Nothing to paste: copy faces (Face mode) or objects first', true); return; }
    const layer = this.collisionOn ? 'collision' : 'geometry';
    if (clip.layer !== layer) { this.deps.say(`Those were copied on the ${clip.layer === 'collision' ? 'Collision' : 'Geometry'} layer: paste them there`, true); return; }
    this.placeCopies(clip.items, this.sel.mode === 'object' ? 'object' : 'face', 'Paste geometry');
    this.deps.say(`Pasted ${this.clipCount()} in place: drag it off with the gizmo`);
  }

  /**
   * New objects made of `items`, in place (the owner, 2026-11-16: "keep it in the same position, dont offset the copy.
   * this makes it easy to move in the same plane as the old one"), as one step: selected after, as `mode` selects --
   * Object mode the objects, else every face of them in Face mode (a paste in Vertex or Edge mode lands in Face mode).
   * Each is made from its own copy of the mesh, so the clipboard pastes again unchanged.
   */
  private placeCopies(items: readonly GeoObjectCopy[], mode: 'face' | 'object', label: string): void {
    const geo = this.geo;
    if (!geo || !items.length) return;
    this.edit(label, () => {
      const made = items.map((c) => this.addCopy(geo, c));
      this.sel = emptySelection(mode);
      for (const o of made) {
        this.sel.objects.add(o.id);
        if (mode === 'face') this.sel.items.set(o.id, new Set(objectFaces(o)));
      }
      this.focus = made[0]?.id ?? this.focus;
    });
  }

  /* ---------- the block tool ---------- */

  /** The block tool's shape (a level editor's Geometry Type), beside the Tool section while Block is on. */
  /**
   * Create's shape menu (the owner, 2026-11-17: "make the dropdown create menu a little nicer. Be nice to have a preview
   * image and it is categorized better"; a browser adaptation, FG.R2): a button wearing the shape's picture and word; its
   * panel the shapes by group, each a picture (`./blockShapeIcons`) -- a body-level popup, as the Select tool's settings
   * are (the toolbar would clip it). Hovering one previews it in the viewport (`previewShape`; "when hovering over an item
   * it shows a live preview of the shape in the viewport"); a click chooses it.
   */
  private blockToolUi(): HTMLButtonElement {
    const doc = this.deps.doc;
    const btn = doc.createElement('button');
    btn.type = 'button';
    btn.className = 'fx-tool fx-geo-block-shape';
    btn.setAttribute('aria-label', 'Create shape');
    btn.setAttribute('aria-haspopup', 'menu');
    btn.setAttribute('aria-expanded', 'false');
    btn.title = 'The shape Create makes: click for the shapes (hover one to preview it)';
    const menu = doc.createElement('div');
    menu.className = 'fx-tool-popup fx-shape-menu';
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', 'Create shape');
    menu.hidden = true;
    const items = new Map<BlockShape, HTMLButtonElement>();
    for (const group of BLOCK_SHAPE_GROUPS) {
      const title = doc.createElement('div');
      title.className = 'fx-tool-popup-title';
      title.textContent = group;
      const grid = doc.createElement('div');
      grid.className = 'fx-shape-grid';
      for (const { shape, label } of BLOCK_SHAPES.filter((x) => x.group === group)) {
        const b = doc.createElement('button');
        b.type = 'button';
        b.className = 'fx-shape-item';
        b.setAttribute('role', 'menuitemradio');
        b.dataset['shape'] = shape;
        b.title = label;
        b.innerHTML = `${blockShapeIcon(shape)}<span>${label}</span>`;
        b.addEventListener('pointerenter', () => this.previewShape(shape));
        b.addEventListener('focus', () => this.previewShape(shape));
        b.addEventListener('click', () => { close(); this.chooseShape(shape); });
        items.set(shape, b);
        grid.append(b);
      }
      menu.append(title, grid);
    }
    // The settings in a panel in the viewport's lower left while Create is on (the owner, 2026-11-17: "in create mode make
    // the settings a little window in the viewport (bottom left) similar to legend, so the user can easily adjust the
    // settings from the viewport ... the settings change as we hover each item ... simplify the workflow"): the shape
    // hovered in the menu's, else the chosen one's; its head the shape, a click opening the menu.
    const panel = doc.createElement('div');
    panel.className = 'fx-ai-legend fx-create-panel';
    panel.setAttribute('role', 'group');
    panel.setAttribute('aria-label', 'Create settings');
    panel.hidden = true;
    (this.deps.legendHost?.() ?? this.deps.statusHost).append(panel);
    this.createPanel = panel;
    this.drawShapeSettings = () => this.drawSettingsInto(panel);
    menu.addEventListener('pointerleave', () => this.previewShape(null));
    doc.body.append(menu);
    const draw = (): void => {
      const label = BLOCK_SHAPES.find((x) => x.shape === this.blockShape)?.label ?? 'Box';
      btn.innerHTML = `${blockShapeIcon(this.blockShape)}<span>${label}</span><span class="fx-climb-caret">\u25be</span>`;
      for (const [sh, b] of items) { b.classList.toggle('is-on', sh === this.blockShape); b.setAttribute('aria-checked', String(sh === this.blockShape)); }
      this.drawShapeSettings?.();
    };
    const outside = (e: PointerEvent): void => { if (!menu.contains(e.target as Node) && !btn.contains(e.target as Node)) close(); };
    const key = (e: KeyboardEvent): void => { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); close(); btn.focus(); } };
    const close = (): void => {
      if (menu.hidden) return;
      menu.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
      this.previewShape(null);
      doc.removeEventListener('pointerdown', outside, true);
      doc.removeEventListener('keydown', key, true);
    };
    const open = (): void => {
      draw();
      const r = btn.getBoundingClientRect();
      const width = doc.defaultView?.innerWidth ?? 1024;
      menu.hidden = false;
      menu.style.left = `${Math.max(8, Math.min(r.left, width - menu.offsetWidth - 8))}px`;
      menu.style.top = `${r.bottom + 6}px`;
      btn.setAttribute('aria-expanded', 'true');
      doc.addEventListener('pointerdown', outside, true);
      doc.addEventListener('keydown', key, true);
    };
    btn.addEventListener('click', () => { if (menu.hidden) open(); else close(); btn.blur(); });
    this.toggleShapeMenu = () => { if (menu.hidden) open(); else close(); };
    this.drawShapeButton = draw;
    this.closeShapeMenu = close;
    draw();
    btn.hidden = true;
    this.blockShapeSel = btn;
    return btn;
  }

  /** A shape's settings now: its defaults, the user's over them. */
  private settingsFor(shape: BlockShape): ShapeSettings {
    if (this.liveSettings?.shape === shape) return this.liveSettings.settings;
    return shapeSettings(shape, this.shapeSettingsStore[shape]);
  }

  /**
   * The chosen shape's settings in `box`: a row each -- a number field (its unit beside it), a choice, or a switch -- with
   * Reset; none for a shape without any. A change is kept (`setShapeSetting`).
   */
  private drawSettingsInto(box: HTMLElement): void {
    const doc = this.deps.doc;
    const shape = this.hoverShape ?? this.blockShape;
    const defs = SHAPE_SETTINGS[shape];
    const label = BLOCK_SHAPES.find((x) => x.shape === shape)?.label ?? 'Box';
    const now = this.settingsFor(shape);
    box.replaceChildren();
    box.classList.toggle('is-hover', this.hoverShape !== null && this.hoverShape !== this.blockShape);
    const head = doc.createElement('div');
    head.className = 'fx-shape-settings-head';
    const title = doc.createElement('button');
    title.type = 'button';
    title.className = 'fx-create-panel-shape';
    title.title = 'The shape Create makes: click for the shapes';
    title.innerHTML = `${blockShapeIcon(shape)}<span>${label}</span><span class="fx-climb-caret">\u25be</span>`;
    title.addEventListener('click', () => { this.toggleShapeMenu?.(); title.blur(); });
    head.append(title);
    if (!defs.length) {
      const none = doc.createElement('div');
      none.className = 'fx-tool-popup-note';
      none.textContent = shape === 'polygon' ? 'Click its points one by one, then the first again (or Enter) to close it, then pull its height' : 'No settings: its size is the drag and the pull';
      head.classList.add('is-alone');
      box.append(head, none);
      return;
    }
    const reset = doc.createElement('button');
    reset.type = 'button';
    reset.className = 'fx-shape-reset';
    reset.textContent = 'Reset';
    reset.title = `Every ${label} setting back to where it starts`;
    reset.addEventListener('click', () => { delete this.shapeSettingsStore[shape]; this.shapeSettingsChanged(shape); });
    head.append(reset);
    box.append(head);
    for (const d of defs) box.append(this.settingRow(d, now[d.key]!, (v) => this.setShapeSetting(shape, d.key, v), (v) => this.previewSetting(shape, d.key, v)));
  }

  /** One setting's row: its word, then its field. */
  private settingRow(d: ShapeSetting, value: number | string | boolean, set: (v: number | string | boolean) => void, live?: (v: number) => void): HTMLElement {
    const doc = this.deps.doc;
    const row = doc.createElement('label');
    row.className = 'fx-tool-popup-row fx-shape-setting';
    row.title = d.note;
    const word = doc.createElement('span');
    word.textContent = d.label;
    row.append(word);
    if (d.kind === 'number') {
      const wrap = doc.createElement('span');
      wrap.className = 'fx-shape-num';
      const input = doc.createElement('input');
      input.type = 'number';
      input.className = 'fx-num';
      input.min = String(d.min); input.max = String(d.max); input.step = String(d.step);
      input.value = String(value);
      input.setAttribute('aria-label', d.label);
      // Each value a drag (or a typed digit) passes shown live (`live`, no edit); the release or the typed value kept.
      input.addEventListener('input', () => { const v = Number(input.value); if (Number.isFinite(v)) live?.(v); });
      input.addEventListener('change', () => { const v = Number(input.value); if (Number.isFinite(v)) set(v); });
      wrap.append(input);
      if (d.unit) { const u = doc.createElement('span'); u.className = 'fx-shape-unit'; u.textContent = d.unit === 'u' ? 'units' : d.unit; wrap.append(u); }
      row.append(wrap);
    } else if (d.kind === 'choice') {
      const sel = doc.createElement('select');
      sel.className = 'fx-select';
      sel.setAttribute('aria-label', d.label);
      for (const o of d.options) { const opt = doc.createElement('option'); opt.value = o.value; opt.textContent = o.label; sel.append(opt); }
      sel.value = String(value);
      sel.addEventListener('change', () => set(sel.value));
      row.append(sel);
    } else {
      const box = doc.createElement('input');
      box.type = 'checkbox';
      box.checked = value === true;
      box.setAttribute('aria-label', d.label);
      box.addEventListener('change', () => set(box.checked));
      row.append(box);
    }
    return row;
  }

  /** A shape's setting set: kept (this browser), the menu, the shape being made and its preview redrawn. */
  private setShapeSetting(shape: BlockShape, key: string, value: number | string | boolean): void {
    const wasLive = this.liveSettings !== null;
    this.liveSettings = null;
    if (wasLive && !this.block && !this.hoverShape) { this.blockPreview.visible = false; this.drawBlockSolid(null); }
    this.shapeSettingsStore[shape] = shapeSettings(shape, { ...this.shapeSettingsStore[shape], [key]: value });
    // The panel left as it is: its field holds the value, and a held arrow keeps stepping the same field.
    this.shapeSettingsChanged(shape, false);
  }

  /**
   * A shape's settings changed: kept, the menu redrawn; the shape being made or previewed with them -- and the shape
   * Create made last, while it is that shape and selected, rebuilt with them (one edit).
   */
  private shapeSettingsChanged(shape: BlockShape, redraw = true): void {
    writeShapeSettings(this.shapeSettingsStore);
    if (redraw) this.drawShapeSettings?.();
    if (this.block) this.drawBlock();
    else if (this.hoverShape) { const h = this.hoverShape; this.hoverShape = null; this.previewShape(h); }
    const lb = this.lastBlock;
    if (lb && lb.shape === shape && this.sel.objects.size === 1 && this.sel.objects.has(lb.id)) {
      lb.settings = this.settingsFor(shape);
      const label = BLOCK_SHAPES.find((x) => x.shape === shape)?.label ?? 'Box';
      this.rebuildLastBlock(`${label} settings`);
    }
  }

  /**
   * A setting's value shown live as it is dragged, nothing kept (`liveSettings`): the shape being made with it; else the
   * shape Create made last, while it is that shape and selected, previewed rebuilt over itself; else the shape at the
   * viewport's centre. The panel is left as it is (its field is the one being dragged).
   */
  private previewSetting(shape: BlockShape, key: string, value: number): void {
    this.liveSettings = { shape, settings: shapeSettings(shape, { ...this.shapeSettingsStore[shape], [key]: value }) };
    if (this.block) { this.drawBlock(); return; }
    const lb = this.lastBlock;
    if (lb && lb.shape === shape && this.sel.objects.size === 1 && this.sel.objects.has(lb.id)) {
      // The shape itself rebuilt with the value, nothing kept (the owner, 2026-11-19: "the live sliders should show the
      // correct geometry, right now while I drag it shows a weird mixture of both"): never a preview drawn over the old
      // one. The release keeps it, one edit (`setShapeSetting`).
      lb.settings = this.liveSettings.settings;
      this.rerun = 'quiet';
      try { this.rebuildLastBlock(`${BLOCK_SHAPES.find((x) => x.shape === shape)?.label ?? 'Box'} settings`); } finally { this.rerun = null; }
      return;
    }
    this.showCentrePreview(shape);
  }

  /** A shape chosen in Create's menu: Create on, drawing it next (a shape half-made takes it at once). */
  private chooseShape(shape: BlockShape): void {
    if (shape !== this.blockShape) this.polyCancel();
    this.blockShape = shape;
    this.drawShapeButton?.();
    if (!this.blockOn) this.setBlockOn(true);                  // choosing a shape is choosing to draw one
    this.drawBlock();
  }

  /**
   * Create's menu hovered on `shape` (null: left): that shape shown in the viewport, its outline and its faces -- over
   * the rectangle being made; else at the viewport's centre, `BLOCK_PREVIEW_SIZE_ADAPTATION` a side.
   */
  private previewShape(shape: BlockShape | null): void {
    if (this.hoverShape === shape) return;
    this.hoverShape = shape;
    this.drawShapeSettings?.();                                // the panel the hovered shape's settings
    if (this.block) { this.drawBlock(); return; }
    if (this.poly) return;                                     // an outline being drawn keeps its own preview
    if (!shape || shape === 'polygon') { this.blockPreview.visible = false; this.drawBlockSolid(null); return; }
    this.showCentrePreview(shape);
  }

  /** `shape` previewed at the viewport's centre, `BLOCK_PREVIEW_SIZE_ADAPTATION` a side, by its settings now. */
  private showCentrePreview(shape: BlockShape): void {
    // At the viewport's centre (the owner, 2026-11-17: "the hover preview should be in the center of the viewport"): on
    // the workplane or the surface there, centred on that point, on its grid while snapping.
    const st = this.blockStart(new Vector2(0, 0));
    if (!st) { this.blockPreview.visible = false; this.drawBlockSolid(null); return; }
    const l = worldToFrame(st.frame, st.at);
    const size = Math.max(BLOCK_PREVIEW_SIZE_ADAPTATION, st.snap ?? 0);
    const f = st.frame;
    const a: [number, number] = [this.blockSnap(l[0] - size / 2), this.blockSnap(l[2] - size / 2)];
    const b: [number, number] = [a[0] + size, a[1] + size];
    const h = shape === 'quad' ? 0 : size;
    const run = stairsRun(a, b);
    this.drawOutline(this.outlineParts(shape, f, a, b, h, run));
    this.drawBlockSolid(this.shapeMesh(shape, f, a, b, h, { textureName: this.textureName, size: this.size, scaleTexel: this.scaleTexel() }, run), this.textureName);
  }

  /** The preview's outline (`blockPreview`): every face's edges. */
  private drawOutline(parts: { points: Vec3[]; rings: number[][] }): void {
    const pos: number[] = [];
    for (const ring of parts.rings) for (let i = 0; i < ring.length; i++) pos.push(...parts.points[ring[i]!]!, ...parts.points[ring[(i + 1) % ring.length]!]!);
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(Float32Array.from(pos), 3));
    const old = this.blockPreview.geometry;
    this.blockPreview.geometry = g;
    old.dispose();
    this.blockPreview.visible = true;
  }

  /** The block tool on (its tab lit in place of Select's, the crosshair, its shape shown) or off (Select's again); a shape half-made let go. */
  private setBlockOn(on: boolean): void {
    if (on && this.tool !== 'select') this.setTool('select');
    if (on && this.knifeOn) this.setKnife(false);
    this.polyCancel();
    this.blockCancel();
    const was = this.blockOn;
    this.blockOn = on;
    if (was && !on) this.drawSelection();                      // Select again: the selection's gizmo back
    this.drawHover();                                          // Create on: the hover off; Select again: back under the pointer
    if (!on) this.drawBlockStart(null);
    this.syncBlockHandles();
    this.paintUi();
    this.drawBar();
    if (on) this.deps.say(this.blockShape === 'polygon' ? 'Polygon: click its points one by one, then the first again (or Enter) to close it (Esc leaves the tool)'
      : this.deps.workplaneShown?.() ? 'Create: drag a rectangle out on the workplane (Esc leaves the tool)' : 'Create: drag a rectangle out on a surface (Esc leaves the tool)');
  }

  /**
   * The plane a press at `ndc` starts a shape on: the workplane, shown (its frame -- its grid's axes -- and the snap's
   * step); else the face pressed on, by its normal turned to the camera, its across-axes world X (Z where the face looks
   * along X) laid on it, no snap. Null: the pointer meets neither.
   */
  private blockStart(ndc: Vector2): { frame: BlockFrame; snap: number | null; at: Vec3 } | null {
    const ray = this.rayAt(ndc, this.deps.camera());
    const hit = this.geo && pickFace(this.geo, ray, this.index);
    if (this.deps.workplaneShown?.() && this.deps.workplane) {
      const w = this.deps.workplane();
      const p = rayOnWorkplane(w, new Vector3(...ray.origin), new Vector3(...ray.dir), BLOCK_REACH);
      const { origin, q } = workplaneFrame(w);
      const axis = (x: number, y: number, z: number): Vec3 => new Vector3(x, y, z).applyQuaternion(q).toArray() as Vec3;
      const wn = axis(0, 1, 0);
      const far = (x: Vec3): number => Math.hypot(x[0] - ray.origin[0]!, x[1] - ray.origin[1]!, x[2] - ray.origin[2]!);
      // Geometry in front of the workplane takes the press (the owner, 2026-11-17: "I want to be able to use the create
      // brush on top of other geometry i made ... a roof ... on top of the room ... with the workplane on. it goes through
      // the geometry"), as the Place tool's seat does (`nearerOfWorkplane`): a face nearer along the ray by more than
      // `BLOCK_SEE_TOLERANCE` -- one lying on the workplane itself keeps the workplane.
      const onSurface = hit && (!p || far(hit.at) < far([p.x, p.y, p.z]) - BLOCK_SEE_TOLERANCE);
      if (!onSurface) {
        if (!p) return null;
        return { frame: { origin: origin.toArray() as Vec3, u: axis(1, 0, 0), n: wn, v: axis(0, 0, 1) }, snap: this.moveSnap(), at: [p.x, p.y, p.z] };
      }
      // A face parallel to the workplane (a room's top on a flat one): the workplane's own frame and grid lifted to it,
      // so what is made there lines up with the grid below, snapping as on the workplane.
      let fn = normalize(faceNormal(hit.object.mesh, hit.face));
      if (dot(fn, ray.dir) > 0) fn = scale(fn, -1);
      if (dot(fn, wn) > 1 - 1e-6) {
        const lift = dot(sub(hit.at, origin.toArray() as Vec3), wn);
        return { frame: { origin: add(origin.toArray() as Vec3, scale(wn, lift)), u: axis(1, 0, 0), n: wn, v: axis(0, 0, 1) }, snap: this.moveSnap(), at: hit.at };
      }
    }
    if (!hit) return null;
    let n = normalize(faceNormal(hit.object.mesh, hit.face));
    if (dot(n, ray.dir) > 0) n = scale(n, -1);
    const ref: Vec3 = Math.abs(n[0]) > 0.9 ? [0, 0, 1] : [1, 0, 0];
    const u = normalize(sub(ref, scale(n, dot(ref, n))));
    // Off the workplane: unsnapped -- unless Ctrl asks for the snap.
    return { frame: { origin: hit.at, u, n, v: cross(u, n) }, snap: this.ctrlHeld && this.snapStep > 0 ? this.snapStep : null, at: hit.at };
  }

  /** Where the pointer at `ndc` meets the shape's plane, in its frame [along u, along v] (on the snap's step); null: it does not. */
  private blockPlaneAt(ndc: Vector2): [number, number] | null {
    const b = this.block;
    if (!b) return null;
    const ray = this.rayAt(ndc, this.deps.camera());
    const along = dot(ray.dir, b.frame.n);
    if (Math.abs(along) < 1e-6) return null;
    const t = dot(sub(b.frame.origin, ray.origin), b.frame.n) / along;
    if (!(t > 0)) return null;
    const l = worldToFrame(b.frame, add(ray.origin, scale(ray.dir, t)));
    return [this.blockSnap(l[0]), this.blockSnap(l[2])];
  }

  /** A length on the shape's snap step (none off the workplane). */
  private blockSnap(x: number): number {
    const g = this.block?.snap;
    return g ? Math.round(x / g) * g : x;
  }

  /** The height the pointer at `ndc` pulls: the nearest point of its ray to the normal through the rectangle's middle. */
  private blockHeightAt(ndc: Vector2): number | null {
    const b = this.block;
    if (!b) return null;
    const ray = this.rayAt(ndc, this.deps.camera());
    const c = frameToWorld(b.frame, (b.a[0] + b.b[0]) / 2, 0, (b.a[1] + b.b[1]) / 2);
    const nd = dot(b.frame.n, ray.dir), dd = dot(ray.dir, ray.dir);
    const denom = dd - nd * nd;
    if (denom < 1e-9) return null;                            // looking straight down the normal: no height to read
    const w0 = sub(c, ray.origin);
    const h = (nd * dot(ray.dir, w0) - dd * dot(b.frame.n, w0)) / denom;
    return this.blockSnap(h);
  }

  private blockDown(ndc: Vector2, e: PointerEvent): void {
    if (this.block?.phase === 'height') { this.blockCommit(); return; }
    // Clicked, not dragged: this click sets the far corner (the owner, 2026-11-17: "make the create tool also start
    // working when I click down, so that I don't have to do a drag while mouse is down").
    if (this.block?.phase === 'base' && this.block.clicked) { this.block.pointerId = e.pointerId; this.blockBaseDone(); return; }
    const s = this.blockStart(ndc);
    if (!s) {
      this.deps.say(this.deps.workplaneShown?.() ? 'Create: the pointer is off the workplane' : 'Create: press on a surface (or show the workplane)', true);
      return;
    }
    const l = worldToFrame(s.frame, s.at);
    this.drawBlockStart(null);
    this.block = { phase: 'base', frame: s.frame, snap: s.snap, a: [0, 0], b: [0, 0], h: 0, pointerId: e.pointerId };
    const a: [number, number] = [this.blockSnap(l[0]), this.blockSnap(l[2])];
    this.block.a = a;
    this.block.b = [...a];
    try { this.deps.input.setPointerCapture(e.pointerId); } catch { /* the release still arrives over the viewport */ }
    this.drawBlock();
  }

  private blockMove(ndc: Vector2): void {
    const b = this.block;
    if (!b) return;
    if (b.phase === 'base') { const p = this.blockPlaneAt(ndc); if (p) b.b = p; }
    else { const h = this.blockHeightAt(ndc); if (h !== null) b.h = h; }
    this.drawBlock();
    const w = Math.abs(b.b[0] - b.a[0]), d = Math.abs(b.b[1] - b.a[1]);
    const r = (x: number): number => Math.round(x * 100) / 100;
    this.deps.say(b.phase === 'base' ? `Create: ${r(w)} x ${r(d)}` : `Create: ${r(w)} x ${r(d)} x ${r(b.h)} (click or Enter to make it, Esc cancels)`);
  }

  private blockUp(e: PointerEvent): void {
    const b = this.block;
    if (!b) return;
    try { this.deps.input.releasePointerCapture(e.pointerId); } catch { /* already let go */ }
    // A click, not a drag: the first corner set, the rectangle following the pointer until the next click.
    if (!blockMakes('quad', b.a, b.b, 0)) {
      if (!b.clicked) { b.clicked = true; this.deps.say('Create: move to size it, then click to set the far corner (Esc cancels)'); }
      return;
    }
    this.blockBaseDone();
  }

  /** The rectangle set (a drag let go, or the second click): a quad made, else its height pulled next. */
  private blockBaseDone(): void {
    const b = this.block;
    if (!b || b.phase !== 'base' || !blockMakes('quad', b.a, b.b, 0)) return;
    if (this.blockShape === 'quad') { this.blockCommit(); return; }
    b.phase = 'height';
    // Looking along the plane's normal (an orthographic view): no height to pull -- made at once at the last one.
    if (this.cannotPull(b.frame)) { b.h = this.defaultPull(b.snap); this.blockCommit(); this.saidPull(b.h); return; }
    this.deps.say('Create: move to set its height, then click or Enter to make it (Esc cancels)');
  }

  /** Whether the view looks (nearly) along `f`'s normal -- an orthographic view facing the plane: a height cannot be pulled there. */
  private cannotPull(f: BlockFrame): boolean {
    const cam = this.deps.camera();
    const look = cam.getWorldDirection(new Vector3());
    return Math.abs(look.dot(new Vector3(...f.n))) > 0.98;
  }

  /** The height a shape made without a pull takes: the last pulled, else one snap step, else a metre. */
  private defaultPull(snap: number | null): number {
    return this.lastPull ?? (snap && snap > 0 ? snap : this.snapStep > 0 ? this.snapStep : BLOCK_DEFAULT_PULL_ADAPTATION);
  }

  private saidPull(h: number): void {
    const r = Math.round(Math.abs(h) * 100) / 100;
    this.deps.say(`Made ${r} high (${this.lastPull !== null ? 'the last height pulled' : 'one snap step'}): no height to pull in this view -- its handles resize it, or pull one in the perspective view`);
  }

  /**
   * A shape's mesh as Create makes it on this layer: stairs on the Collision layer are their ramp (the disc's stairs
   * collide as ramps; the owner, 2026-11-17: "a smooth collision box for it (not jagged)"), every other shape itself.
   */
  private shapeMesh(shape: BlockShape, f: BlockFrame, a: readonly [number, number], b: readonly [number, number], h: number,
    opts: PrimitiveOptions, run: { alongZ: boolean; rev: boolean }, settings: ShapeSettings = this.settingsFor(shape)): EditMesh {
    if (this.collisionOn) {
      const own = this.shapeHull(shape, f, a, b, h, opts, run, this.collisionGround());
      if (own) return own;
    }
    return blockMesh(shape, f, a, b, h, opts, run, settings);
  }

  /**
   * The collision a shape has of its own, not its faces': stairs' the ramp (the disc's stairs collide as ramps; the owner,
   * 2026-11-17: "a smooth collision box for it (not jagged)"), a ladder's the box of its footprint with every face a
   * ladder -- climbable, climb flag 2, `ditype` 2 (the owner, 2026-11-17: "it should also set bit flag for the ladder";
   * `./hullGeometry` `withCollisionType`, as the disc's ladder faces are) over the `ground` words; a Ramp's its slope
   * walkable however steep; a railing's and a column's their box. Null for the rest: their faces' (floors up, walls else).
   */
  private shapeHull(shape: BlockShape, f: BlockFrame, a: readonly [number, number], b: readonly [number, number], h: number,
    opts: PrimitiveOptions, run: { alongZ: boolean; rev: boolean }, ground: Surface): EditMesh | null {
    // Each face's words set: a floor's where `walk` says it is stood on, a wall's else.
    const worded = (m: EditMesh, walk: (n: Vec3) => boolean): EditMesh => {
      const floor = floorWordsOf(ground), wall = wallWordsOf(ground);
      for (const fc of liveFaces(m)) m.faces[fc]!.surface = [...(walk(faceNormal(m, fc)) ? floor : wall)] as Surface;
      return m;
    };
    // A ramp's slope always walkable however steep (the owner, 2026-11-17: "for floors and ramps, always make the ramp
    // area walkable"): stairs' ramp and the Ramp shape -- every face facing up at all a floor.
    if (shape === 'stairs' || shape === 'ramp') return worded(stairsRampMesh(f, a, b, h, opts, run), (n) => n[1] > 1e-3);
    // A railing's or a column's collision its box (the owner, 2026-11-17: "for railings collision just create a bounding
    // box around the rail, don't have to do individual poles. you can simplify most collisions"): its top a floor.
    if (shape === 'railing' || shape === 'column') return worded(blockMesh('block', f, a, b, h, opts, run), (n) => n[1] >= FLOOR_NORMAL_Y_MIN);
    if (shape !== 'ladder') return null;
    const m = blockMesh('block', f, a, b, h, opts, run);
    const ladder = withCollisionType(ground, 'climbable', LADDER_CLIMB_FLAG);
    for (const fc of liveFaces(m)) m.faces[fc]!.surface = [...ladder] as Surface;
    return m;
  }

  /** The ground words a made collision starts from: the drawn geometry's commonest floor, else a plain floor. */
  private collisionGround(): Surface {
    const geo = this.drawGeometry;
    return (geo?.collision ? commonGroundSurface(geo.collision) : null) ?? [3, 0, 0, 0, 0];
  }

  /**
   * A drawn object's collision set to `mesh`: its own hull object (`hullOf`, edited: `manual`), made or replaced -- Build
   * takes it over what its faces would make (`applyHullEdits`), and it moves with the object (`followersOf`).
   */
  private setShapeHull(o: GeoObject, mesh: EditMesh): void {
    const geo = this.geo;
    if (!geo) return;
    const hull = this.hullGeo ?? (this.hullGeo = { objects: [], collision: null, ownerNodes: geo.ownerNodes });
    const had = hull.objects.find((h) => h.hullOf === o.id);
    if (had) { Object.assign(had.mesh, mesh); had.manual = true; return; }
    hull.objects.push({ id: `hull:${o.id}`, name: o.name, kind: 'mesh', mesh, hullOf: o.id, manual: true });
  }

  /** A shape's outline as this layer makes it: stairs a ramp and a ladder a box on the Collision layer (`shapeHull`). */
  private outlineParts(shape: BlockShape, f: BlockFrame, a: readonly [number, number], b: readonly [number, number], h: number, run: { alongZ: boolean; rev: boolean },
    settings: ShapeSettings = this.settingsFor(shape)): { points: Vec3[]; rings: number[][] } {
    if (this.collisionOn && (shape === 'ladder' || shape === 'railing' || shape === 'column')) return blockParts('block', f, a, b, h);
    return blockParts(shape, f, a, b, h, settings, run, this.collisionOn && shape === 'stairs');
  }

  /** The shape made, as it is drawn; the tool stays on for the next. */
  private blockCommit(): void {
    const b = this.block;
    const geo = this.geo;
    if (!b || !geo) return;
    const shape = this.blockShape;
    if (!blockMakes(shape, b.a, b.b, b.h)) { this.deps.say('Create: pull it some height first', true); return; }
    const run = stairsRun(b.a, b.b);
    const opts = { textureName: this.textureName, size: this.size, scaleTexel: this.scaleTexel() };
    const settings = this.settingsFor(shape);
    if (shape !== 'quad' && Math.abs(b.h) > 1e-3 && !this.cannotPull(b.frame)) this.lastPull = Math.abs(b.h);   // the next shape's, where it cannot pull
    const mesh = this.shapeMesh(shape, b.frame, b.a, b.b, b.h, opts, run, settings);
    const surface = this.newSolidSurface();
    const label = BLOCK_SHAPES.find((x) => x.shape === shape)?.label ?? 'Box';
    const made = { frame: b.frame, x: [Math.min(b.a[0], b.b[0]), Math.max(b.a[0], b.b[0])] as [number, number], z: [Math.min(b.a[1], b.b[1]), Math.max(b.a[1], b.b[1])] as [number, number], y: [Math.min(0, b.h), Math.max(0, b.h)] as [number, number], snap: b.snap, run };
    this.blockCancel();
    this.edit(`Create ${label.toLowerCase()}`, () => {
      const o = addObject(geo, { name: label, kind: blockKind(shape), mesh, ...(surface ? { solid: surface } : {}) });
      // Stairs or a ladder drawn: their collision the ramp, or the ladder's box -- the object's own hull taken over by it,
      // so it goes where they go (`followersOf`) and with them when they are deleted.
      const hullOwn = this.collisionOn || !o.solid ? null : this.shapeHull(shape, b.frame, b.a, b.b, b.h, opts, run, o.solid);
      if (hullOwn) this.setShapeHull(o, hullOwn);
      this.sel = this.madeSelection([{ o, faces: objectFaces(o) }]);
      this.focus = o.id;
      this.lastBlock = { id: o.id, shape, ...made, textureName: this.textureName, verts: [...o.mesh.verts], settings: { ...settings } };
    });
    this.syncBlockHandles();
  }

  /**
   * The resize handles of the shape Create made last (`lastBlock`): drawn while Create is on and it is selected alone --
   * one at each side's middle (a quad's four edges), its top and its base -- after checking it is as made: moved whole,
   * the frame goes with it; changed any other way (turned, scaled, edited, undone), the handles go.
   */
  private syncBlockHandles(): void {
    const lb = this.lastBlock;
    const o = lb && this.geo?.objects.find((x) => x.id === lb.id);
    let ok = !!(lb && o && this.blockOn && !this.textureOn && this.sel.objects.size === 1 && this.sel.objects.has(lb.id));
    if (ok && lb && o) {
      const v = o.mesh.verts;
      if (v.length !== lb.verts.length) ok = false;
      else {
        const d = [v[0]! - lb.verts[0]!, v[1]! - lb.verts[1]!, v[2]! - lb.verts[2]!];
        for (let i = 0; i < v.length && ok; i++) if (Math.abs(v[i]! - lb.verts[i]! - d[i % 3]!) > 1e-4) ok = false;
        if (ok && (d[0] || d[1] || d[2])) { lb.frame = { ...lb.frame, origin: add(lb.frame.origin, d) }; lb.verts = [...v]; }
      }
      if (!ok && (!o || v.length !== lb.verts.length || !this.handleDrag)) this.lastBlock = null;
    }
    if (!ok || !lb) { this.blockHandles.visible = false; this.blockHandleAt = []; return; }
    const ext = this.handleDrag ?? lb;
    const [x0, x1] = ext.x, [y0, y1] = ext.y, [z0, z1] = ext.z;
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, cz = (z0 + z1) / 2;
    const at: { axis: 'x' | 'y' | 'z'; end: 0 | 1; at: Vec3 }[] = [
      { axis: 'x', end: 0, at: frameToWorld(lb.frame, x0, cy, cz) }, { axis: 'x', end: 1, at: frameToWorld(lb.frame, x1, cy, cz) },
      { axis: 'z', end: 0, at: frameToWorld(lb.frame, cx, cy, z0) }, { axis: 'z', end: 1, at: frameToWorld(lb.frame, cx, cy, z1) },
    ];
    if (lb.shape !== 'quad') at.push({ axis: 'y', end: 0, at: frameToWorld(lb.frame, cx, y0, cz) }, { axis: 'y', end: 1, at: frameToWorld(lb.frame, cx, y1, cz) });
    this.blockHandleAt = at;
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(Float32Array.from(at.flatMap((h) => h.at)), 3));
    const old = this.blockHandles.geometry;
    this.blockHandles.geometry = g;
    old.dispose();
    this.blockHandles.visible = true;
  }

  /** A press on a resize handle (within `BLOCK_HANDLE_PICK_PX` of it on screen): its drag begun. */
  private handleDown(ndc: Vector2, e: PointerEvent): boolean {
    const lb = this.lastBlock;
    if (!lb || !this.blockHandles.visible || !this.blockHandleAt.length) return false;
    const cam = this.deps.camera();
    const r = this.deps.input.getBoundingClientRect();
    let best = -1, bestD = BLOCK_HANDLE_PICK_PX;
    this.blockHandleAt.forEach((h, i) => {
      const s = new Vector3(...h.at).project(cam);
      if (s.z > 1) return;                                     // behind the camera
      const d = Math.hypot(((s.x - ndc.x) * r.width) / 2, ((s.y - ndc.y) * r.height) / 2);
      if (d < bestD) { bestD = d; best = i; }
    });
    if (best < 0) return false;
    const h = this.blockHandleAt[best]!;
    this.handleDrag = { i: best, pointerId: e.pointerId, x: [...lb.x], y: [...lb.y], z: [...lb.z], grab: this.handleAlong(h, ndc) ?? 0 };
    try { this.deps.input.setPointerCapture(e.pointerId); } catch { /* the release still arrives over the viewport */ }
    return true;
  }

  /** How far along handle `h`'s axis (from it) the pointer at `ndc` is: its ray's nearest point to the axis line. */
  private handleAlong(h: { axis: 'x' | 'y' | 'z'; at: Vec3 }, ndc: Vector2): number | null {
    const lb = this.lastBlock;
    if (!lb) return null;
    const dir = h.axis === 'x' ? lb.frame.u : h.axis === 'y' ? lb.frame.n : lb.frame.v;
    const ray = this.rayAt(ndc, this.deps.camera());
    const nd = dot(dir, ray.dir), dd = dot(ray.dir, ray.dir);
    const denom = dd - nd * nd;
    if (denom < 1e-9) return null;
    const w0 = sub(h.at, ray.origin);
    return (nd * dot(ray.dir, w0) - dd * dot(dir, w0)) / denom;
  }

  /** A handle dragged: its side moved along its axis (on the shape's snap step), never past the opposite side. */
  private handleMove(ndc: Vector2): void {
    const hd = this.handleDrag, lb = this.lastBlock;
    if (!hd || !lb) return;
    const h = this.blockHandleAt[hd.i];
    if (!h) return;
    // The handle's place as the drag began, its axis through it.
    const start = { ...h, at: frameToWorld(lb.frame, ...this.handleFrameAt(h, lb)) };
    const s = this.handleAlong(start, ndc);
    if (s === null) return;
    const ext = h.axis === 'x' ? lb.x : h.axis === 'y' ? lb.y : lb.z;
    // The step it was made with, Ctrl flipping it (off when it snapped, the step when it did not).
    const step = (lb.snap !== null) !== this.ctrlHeld ? lb.snap ?? (this.snapStep || null) : null;
    let v = ext[h.end] + (s - hd.grab);
    if (step) v = Math.round(v / step) * step;
    const min = step ?? BLOCK_HANDLE_MIN;
    v = h.end === 0 ? Math.min(v, ext[1] - min) : Math.max(v, ext[0] + min);
    const next: [number, number] = h.end === 0 ? [v, ext[1]] : [ext[0], v];
    if (h.axis === 'x') hd.x = next; else if (h.axis === 'y') hd.y = next; else hd.z = next;
    // The outline as it would stand; the handles with it.
    const f = { ...lb.frame, origin: frameToWorld(lb.frame, 0, hd.y[0], 0) };
    const parts = this.outlineParts(lb.shape, f, [hd.x[0], hd.z[0]], [hd.x[1], hd.z[1]], hd.y[1] - hd.y[0], lb.run, lb.settings);
    this.drawBlockSolid(this.shapeMesh(lb.shape, f, [hd.x[0], hd.z[0]], [hd.x[1], hd.z[1]], hd.y[1] - hd.y[0], { textureName: lb.textureName, size: this.size, scaleTexel: this.scaleTexel() }, lb.run, lb.settings), lb.textureName);
    const pos: number[] = [];
    for (const ring of parts.rings) for (let i = 0; i < ring.length; i++) pos.push(...parts.points[ring[i]!]!, ...parts.points[ring[(i + 1) % ring.length]!]!);
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(Float32Array.from(pos), 3));
    const old = this.blockPreview.geometry;
    this.blockPreview.geometry = g;
    old.dispose();
    this.blockPreview.visible = true;
    this.syncBlockHandles();
    const r = (x: number): number => Math.round(x * 100) / 100;
    this.deps.say(`Create: ${r(hd.x[1] - hd.x[0])} x ${r(hd.z[1] - hd.z[0])}${lb.shape === 'quad' ? '' : ` x ${r(hd.y[1] - hd.y[0])}`}`);
  }

  /** A handle's frame coordinates in the shape as made (`lastBlock`, before the drag). */
  private handleFrameAt(h: { axis: 'x' | 'y' | 'z'; end: 0 | 1 }, lb: NonNullable<typeof this.lastBlock>): [number, number, number] {
    const cx = (lb.x[0] + lb.x[1]) / 2, cy = (lb.y[0] + lb.y[1]) / 2, cz = (lb.z[0] + lb.z[1]) / 2;
    return h.axis === 'x' ? [lb.x[h.end], cy, cz] : h.axis === 'y' ? [cx, lb.y[h.end], cz] : [cx, cy, lb.z[h.end]];
  }

  /** A handle let go: the shape rebuilt at its new size, one edit (its texture as made). */
  private handleUp(e: PointerEvent): void {
    const hd = this.handleDrag, lb = this.lastBlock;
    this.handleDrag = null;
    try { this.deps.input.releasePointerCapture(e.pointerId); } catch { /* already let go */ }
    this.blockPreview.visible = false;
    this.drawBlockSolid(null);
    if (!hd || !lb) { this.syncBlockHandles(); return; }
    const same = hd.x.every((v, i) => v === lb.x[i]) && hd.y.every((v, i) => v === lb.y[i]) && hd.z.every((v, i) => v === lb.z[i]);
    if (same) { this.syncBlockHandles(); return; }
    const label = BLOCK_SHAPES.find((x) => x.shape === lb.shape)?.label ?? 'Box';
    lb.x = hd.x; lb.y = hd.y; lb.z = hd.z;
    this.rebuildLastBlock(`Resize ${label.toLowerCase()}`);
  }

  /**
   * The shape Create made last rebuilt as it stands (`lastBlock`: its extents and its settings) -- one edit: its mesh, and
   * its own collision with it (stairs' ramp, a ladder's box).
   */
  private rebuildLastBlock(label: string): void {
    const lb = this.lastBlock;
    const o = lb && this.geo?.objects.find((x) => x.id === lb.id);
    if (!lb || !o) { this.syncBlockHandles(); return; }
    const f = { ...lb.frame, origin: frameToWorld(lb.frame, 0, lb.y[0], 0) };
    const opts = { textureName: lb.textureName, size: this.size, scaleTexel: this.scaleTexel() };
    const a: [number, number] = [lb.x[0], lb.z[0]], b: [number, number] = [lb.x[1], lb.z[1]], h = lb.y[1] - lb.y[0];
    const mesh = this.shapeMesh(lb.shape, f, a, b, h, opts, lb.run, lb.settings);
    this.edit(label, () => {
      Object.assign(o.mesh, mesh);
      markReshaped(o);
      // The selection's faces, edges or points named the old mesh's (a cylinder's 18 faces, now 9): the shape's own again,
      // as Create left it -- else the selection drawn reads faces that are gone and the edit never lands.
      if (this.sel.mode !== 'object' && this.sel.objects.has(o.id)) this.sel = this.madeSelection([{ o, faces: objectFaces(o) }]);
      const hullOwn = this.collisionOn || !o.solid ? null : this.shapeHull(lb.shape, f, a, b, h, opts, lb.run, o.solid);
      if (hullOwn) this.setShapeHull(o, hullOwn);
      lb.verts = [...o.mesh.verts];
    });
    this.syncBlockHandles();
  }

  /**
   * The preview's faces (`blockSolid`): `m` triangulated as a fan a face, each corner its uv, wearing texture `name` (the
   * map's own pixels, `blockTexture`), plain grey without one; null hides it.
   */
  private drawBlockSolid(m: EditMesh | null, name: string | null = null): void {
    const old = this.blockSolid.geometry;
    if (!m) { this.blockSolid.visible = false; return; }
    const pos: number[] = [], uv: number[] = [];
    for (const f of liveFaces(m)) {
      const cs = m.faces[f]!.corners;
      // Each face cut into triangles by its outline (`triangulate`, ear by ear) -- a concave face (a Polygon's L) too, which
      // a fan from its first corner would bridge across its notch (the owner, 2026-11-17: "a weird face ... that shouldnt
      // be connected").
      for (const [i, j, k] of triangulate(facePoints(m, f))) {
        for (const c of [cs[i]!, cs[j]!, cs[k]!]) {
          const v = m.cVert[c]!;
          pos.push(m.verts[v * 3]!, m.verts[v * 3 + 1]!, m.verts[v * 3 + 2]!);
          uv.push(m.cUv[c * 2]!, m.cUv[c * 2 + 1]!);
        }
      }
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(Float32Array.from(pos), 3));
    g.setAttribute('uv', new BufferAttribute(Float32Array.from(uv), 2));
    this.blockSolid.geometry = g;
    old.dispose();
    const mat = this.blockSolid.material as MeshBasicMaterial;
    const tex = this.blockTexture(name);
    if (mat.map !== tex) { mat.map = tex; mat.color.setHex(tex ? 0xffffff : BLOCK_SOLID_PLAIN); mat.needsUpdate = true; }
    this.blockSolid.visible = true;
  }

  /** Texture `name` from the map's own pixels (rows as the world draws them), repeating; kept while it is the one in use. */
  private blockTexture(name: string | null): DataTexture | null {
    if (!name) return null;
    if (this.blockTex?.name === name) return this.blockTex.tex;
    const rgba = this.forMap?.textures[name];
    if (!rgba) return null;
    const tex = new DataTexture(new Uint8Array(rgba.data), rgba.width, rgba.height, RGBAFormat);
    tex.wrapS = tex.wrapT = RepeatWrapping;
    tex.needsUpdate = true;
    this.blockTex?.tex.dispose();
    this.blockTex = { name, tex };
    return tex;
  }

  /**
   * The start marker at the corner a press at `ndc` would start on (`blockStart`, on the snap's step): a dot, and a cross
   * along the plane's u and v a snap step long (a share of the distance off the workplane). Null, or nothing there: hidden.
   */
  private drawBlockStart(ndc: Vector2 | null): void {
    const s = ndc && !this.block && !this.handleDrag && !this.poly ? this.blockStart(ndc) : null;
    if (!s) { this.blockStartDot.visible = false; this.blockStartCross.visible = false; return; }
    const l = worldToFrame(s.frame, s.at);
    const snapTo = (x: number): number => (s.snap ? Math.round(x / s.snap) * s.snap : x);
    const at = frameToWorld(s.frame, snapTo(l[0]), 0, snapTo(l[2]));
    const cam = this.deps.camera().getWorldPosition(new Vector3());
    const reach = s.snap ?? Math.max(1e-3, cam.distanceTo(new Vector3(...at)) * BLOCK_START_CROSS_SHARE);
    const ends = [add(at, scale(s.frame.u, -reach)), add(at, scale(s.frame.u, reach)), add(at, scale(s.frame.v, -reach)), add(at, scale(s.frame.v, reach))];
    const dot = new BufferGeometry();
    dot.setAttribute('position', new BufferAttribute(Float32Array.from(at), 3));
    const cross = new BufferGeometry();
    cross.setAttribute('position', new BufferAttribute(Float32Array.from(ends.flat()), 3));
    const [od, oc] = [this.blockStartDot.geometry, this.blockStartCross.geometry];
    this.blockStartDot.geometry = dot;
    this.blockStartCross.geometry = cross;
    od.dispose(); oc.dispose();
    this.blockStartDot.visible = true;
    this.blockStartCross.visible = true;
  }

  /** The gizmo shown and one of its handles under `ndc` (the page asks, so Alt there is a copy's drag, not the orbit). */
  gizmoHovered(ndc?: Vector2): boolean {
    if (!this.active || !this.gizmo.object || !this.gizmo.getHelper().visible) return false;
    if (ndc) this.drive.pointerHover({ x: ndc.x, y: ndc.y, button: 0 });
    return this.gizmo.axis !== null;
  }

  /** The selected objects' box in the world (every point of each), for Snap by Bounds; null with nothing selected. */
  private selectionBox(): { from: Vector3; min: Vec3; max: Vec3 } | null {
    if (!this.geo || !this.sel.objects.size) return null;
    const min: Vec3 = [Infinity, Infinity, Infinity], max: Vec3 = [-Infinity, -Infinity, -Infinity];
    for (const id of this.sel.objects) {
      const o = this.objectById(id);
      if (!o) continue;
      for (const v of selectionVerts(this.sel, o)) for (let k = 0; k < 3; k++) {
        const x = o.mesh.verts[v * 3 + k]!;
        if (x < min[k]!) min[k] = x;
        if (x > max[k]!) max[k] = x;
      }
    }
    if (!Number.isFinite(min[0])) return null;
    return { from: this.pivot.position.clone(), min, max };
  }

  /** The Polygon tool's point under `ndc` on its plane, in the plane's frame, on its snap's step; null: the ray misses it. */
  private polyPlaneAt(ndc: Vector2): [number, number] | null {
    const p = this.poly;
    if (!p) return null;
    const ray = this.rayAt(ndc, this.deps.camera());
    const along = dot(ray.dir, p.frame.n);
    if (Math.abs(along) < 1e-6) return null;
    const t = dot(sub(p.frame.origin, ray.origin), p.frame.n) / along;
    if (!(t > 0)) return null;
    const l = worldToFrame(p.frame, add(ray.origin, scale(ray.dir, t)));
    const g = p.snap;
    return g ? [Math.round(l[0] / g) * g, Math.round(l[2] / g) * g] : [l[0], l[2]];
  }

  /** Whether the pointer at `ndc` is on the outline's first point (within `POLY_CLOSE_PX` on screen), a close then. */
  private polyOnFirst(ndc: Vector2): boolean {
    const p = this.poly;
    if (!p || p.pts.length < 3) return false;
    const first = new Vector3(...frameToWorld(p.frame, p.pts[0]![0], 0, p.pts[0]![1])).project(this.deps.camera());
    const r = this.deps.input.getBoundingClientRect();
    return Math.hypot(((first.x - ndc.x) / 2) * r.width, ((first.y - ndc.y) / 2) * r.height) <= POLY_CLOSE_PX;
  }

  /** A click with the Polygon tool: the first point (its plane taken as Create takes one), the next, the close, or the make. */
  private polyDown(n: Vector2): void {
    const p = this.poly;
    if (p?.phase === 'height') { this.polyCommit(); return; }
    if (!p) {
      const s = this.blockStart(n);
      if (!s) { this.deps.say(this.deps.workplaneShown?.() ? 'Polygon: the pointer is off the workplane' : 'Polygon: click on a surface (or show the workplane)', true); return; }
      const l = worldToFrame(s.frame, s.at);
      const g = s.snap;
      const first: [number, number] = g ? [Math.round(l[0] / g) * g, Math.round(l[2] / g) * g] : [l[0], l[2]];
      this.drawBlockStart(null);
      this.poly = { frame: s.frame, snap: s.snap, pts: [first], cursor: first, phase: 'points', h: 0 };
      this.drawPoly();
      this.deps.say('Polygon: click its next point (Backspace takes one back, Esc cancels)');
      return;
    }
    if (this.polyOnFirst(n)) { this.polyClose(); return; }
    const at = this.polyPlaneAt(n);
    if (!at) return;
    const last = p.pts[p.pts.length - 1]!;
    if (Math.abs(at[0] - last[0]) < 1e-6 && Math.abs(at[1] - last[1]) < 1e-6) return;   // the same point again: nothing
    p.pts.push(at);
    p.cursor = at;
    this.drawPoly();
    this.deps.say(`Polygon: ${p.pts.length} points${p.pts.length >= 3 ? ' -- click the first again, or Enter, to close it' : ''}`);
  }

  /** The pointer moved: the outline's next side follows it, or the height follows it once the outline is closed. */
  private polyMove(n: Vector2): void {
    const p = this.poly;
    if (!p) return;
    if (p.phase === 'points') { p.cursor = this.polyOnFirst(n) ? p.pts[0]! : this.polyPlaneAt(n) ?? p.cursor; }
    else {
      const ray = this.rayAt(n, this.deps.camera());
      const cx = p.pts.reduce((t, q) => t + q[0], 0) / p.pts.length, cz = p.pts.reduce((t, q) => t + q[1], 0) / p.pts.length;
      const c = frameToWorld(p.frame, cx, 0, cz);
      const nd = dot(p.frame.n, ray.dir), dd = dot(ray.dir, ray.dir), denom = dd - nd * nd;
      if (denom > 1e-9) {
        const w0 = sub(c, ray.origin);
        const h = (nd * dot(ray.dir, w0) - dd * dot(p.frame.n, w0)) / denom;
        p.h = p.snap ? Math.round(h / p.snap) * p.snap : h;
      }
      const r = (x: number): number => Math.round(x * 100) / 100;
      this.deps.say(`Polygon: ${p.pts.length} sides x ${r(p.h)} high (click or Enter to make it; at no height, a flat face)`);
    }
    this.drawPoly();
  }

  /** The outline closed (three points or more, not crossing itself): its height pulled next. */
  private polyClose(): void {
    const p = this.poly;
    if (!p || p.phase !== 'points') return;
    const pts = cleanOutline(p.pts);
    if (pts.length < 3) { this.deps.say('Polygon: it needs three points at least', true); return; }
    if (outlineCrosses(pts)) { this.deps.say('Polygon: its sides cross -- Backspace takes points back', true); return; }
    p.pts = pts;
    p.phase = 'height';
    p.h = 0;
    if (this.cannotPull(p.frame)) { const h = this.defaultPull(p.snap); p.h = h; this.polyCommit(); this.saidPull(h); return; }
    this.drawPoly();
    this.deps.say('Polygon: move to set its height, then click or Enter to make it (at no height, a flat face; Esc cancels)');
  }

  /** The last point taken back; the first taken back lets the outline go. */
  private polyBack(): void {
    const p = this.poly;
    if (!p) return;
    p.pts.pop();
    if (!p.pts.length) { this.polyCancel(); return; }
    this.drawPoly();
  }

  private polyCancel(): void {
    this.poly = null;
    this.drawPoly();
  }

  /** The shape made: the outline pulled to its height (a prism), or a flat face at none -- one step, selected; the tool stays on. */
  private polyCommit(): void {
    const p = this.poly;
    const geo = this.geo;
    if (!p || !geo || p.phase !== 'height') return;
    if (Math.abs(p.h) > 1e-3 && !this.cannotPull(p.frame)) this.lastPull = Math.abs(p.h);
    const mesh = polygonMesh(p.frame, p.pts, p.h, { textureName: this.textureName, size: this.size, scaleTexel: this.scaleTexel() });
    const surface = this.newSolidSurface();
    const flat = Math.abs(p.h) <= 1e-3;
    this.polyCancel();
    this.edit(flat ? 'Create polygon face' : 'Create polygon', () => {
      const o = addObject(geo, { name: 'Polygon', kind: 'mesh', mesh, ...(surface ? { solid: surface } : {}) });
      this.sel = this.madeSelection([{ o, faces: objectFaces(o) }]);
      this.focus = o.id;
    });
    this.deps.say(`Polygon made${flat ? ' (a flat face)' : ''}: click the next one's first point, or Esc to leave the tool`);
  }

  /** The outline drawn: its sides (and the side to the pointer while points are clicked), then the shape as it would be made. */
  private drawPoly(): void {
    const p = this.poly;
    const old = this.blockPreview.geometry;
    if (!p) { this.blockPreview.visible = false; this.drawBlockSolid(null); return; }
    const pos: number[] = [];
    const at = (q: readonly [number, number], y = 0): Vec3 => frameToWorld(p.frame, q[0], y, q[1]);
    if (p.phase === 'points') {
      const chain = p.cursor ? [...p.pts, p.cursor] : p.pts;
      for (let i = 0; i + 1 < chain.length; i++) pos.push(...at(chain[i]!), ...at(chain[i + 1]!));
      // Its corners marked: a small cross at each.
      const k = (p.snap ?? 1) * 0.25;
      for (const q of p.pts) { pos.push(...at([q[0] - k, q[1]]), ...at([q[0] + k, q[1]]), ...at([q[0], q[1] - k]), ...at([q[0], q[1] + k])); }
      this.drawBlockSolid(null);
    } else {
      const mesh = polygonMesh(p.frame, p.pts, p.h, { textureName: this.textureName, size: this.size, scaleTexel: this.scaleTexel() });
      for (const f of liveFaces(mesh)) { const cs = facePoints(mesh, f); for (let i = 0; i < cs.length; i++) pos.push(...cs[i]!, ...cs[(i + 1) % cs.length]!); }
      this.drawBlockSolid(mesh, this.textureName);
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(Float32Array.from(pos), 3));
    this.blockPreview.geometry = g;
    old.dispose();
    this.blockPreview.visible = true;
  }

  private blockCancel(): void {
    this.block = null;
    this.drawBlock();
  }

  /** The shape being made, drawn as its edges over everything: the flat rectangle while dragged, the shape while pulled. */
  private drawBlock(): void {
    const b = this.block;
    const old = this.blockPreview.geometry;
    if (!b) { this.blockPreview.visible = false; this.drawBlockSolid(null); return; }
    const pulled = b.phase === 'height' && Math.abs(b.h) > 1e-6;
    const hovered = this.hoverShape === 'polygon' ? null : this.hoverShape;
    const shown = pulled ? hovered ?? this.blockShape : 'quad';   // the menu's hovered shape previewed
    const parts = this.outlineParts(shown, b.frame, b.a, b.b, pulled ? b.h : 0, stairsRun(b.a, b.b));
    this.drawBlockSolid(blockMakes('quad', b.a, b.b, 0)
      ? this.shapeMesh(shown, b.frame, b.a, b.b, pulled ? b.h : 0, { textureName: this.textureName, size: this.size, scaleTexel: this.scaleTexel() }, stairsRun(b.a, b.b)) : null, this.textureName);
    const pos: number[] = [];
    for (const ring of parts.rings) for (let i = 0; i < ring.length; i++) pos.push(...parts.points[ring[i]!]!, ...parts.points[ring[(i + 1) % ring.length]!]!);
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(Float32Array.from(pos), 3));
    this.blockPreview.geometry = g;
    old.dispose();
    this.blockPreview.visible = true;
  }

  /**
   * The surface a new shape is solid on: the map's commonest floor words (a disc map's), else -- a custom map, whose read
   * hull is empty (the owner, 2026-11-15: "add a cube, then go to collision mode, the cube collision is not there") -- the
   * commonest of its solid objects' (its floor plane's), else the blank floor's own placeholder. Never none: a shape made
   * on the Geometry layer always has collision, on every map. On the Collision layer a new shape takes its words from
   * its facing (`wordsOf`), as before.
   */
  private newSolidSurface(): Surface | null {
    if (this.collisionOn) return null;
    const geo = this.drawGeometry;
    const read = geo?.collision ? commonGroundSurface(geo.collision) : null;
    if (read) return read;
    const tally = new Map<string, { s: Surface; n: number }>();
    for (const o of geo?.objects ?? []) {
      if (!o.solid) continue;
      const k = o.solid.join(','), e = tally.get(k);
      if (e) e.n++; else tally.set(k, { s: o.solid, n: 1 });
    }
    let best: { s: Surface; n: number } | null = null;
    for (const e of tally.values()) if (!best || e.n > best.n) best = e;
    return best ? [...best.s] as Surface : [...DEFAULT_FLOOR_SURFACE_PLACEHOLDER] as Surface;
  }

  /**
   * The sampler's click (a level editor's eyedropper, the Sample mode or a Shift+click while painting): what the face under `n` has -- its texture (and its look, which Apply lays), or on the Collision
   * layer its collision type and climb flag -- as the active one. Whether it took one.
   */
  private sampleAt(n: Vector2): boolean {
    const hit = this.geo && pickFace(this.geo, this.rayAt(n, this.deps.camera()), this.index);
    if (!hit) { this.deps.say('Sample: no face there', true); return false; }
    if (this.collisionOn) {
      const words = wordsOf(hit.object, null)(hit.face);
      const t = collisionTypeOf(words);
      if (t === 'climbable') this.climbFlag = climbFlagOf(words);
      this.collisionType = t;
      this.paintUi();
      this.deps.say(`Sampled ${this.typeWords(words)}`);
      return true;
    }
    const look = sampleFace(hit.object.mesh, hit.face, this.size);
    const name = look?.style.textureName;
    if (!look || !name) { this.deps.say('Sample: that face has no texture', true); return false; }
    if (!this.forMap?.textures[name]) { this.deps.say(`Sample: ${name} is not in this map's textures`, true); return false; }
    this.setTexture(name);
    this.sampled = look;
    this.deps.say(`Sampled ${name}`);
    return true;
  }

  /**
   * The texture Apply and a new shape lay: `name`, a key of the map's textures (the page lends one read off another map
   * into them first, `textureMap`), or null for none. A texture chosen by hand drops the last sample's look.
   */
  setTexture(name: string | null): void {
    this.textureName = name && this.forMap?.textures[name] ? name : null;
    this.sampled = null;
    this.drawTextureButton();
  }

  /**
   * A Textures tile dropped on the viewport at `n` (NDC; the owner, 2026-11-16: "allow drag and drop of textures onto
   * geometry faces/objects. This would be the same as we applied the texture"): `name` becomes the texture and is laid as
   * Apply lays it (kept where the old one lay) on what the drop lands on -- the selection, dropped on a selected face or
   * object; else the face under the pointer in Face mode, its whole object in any other. Not on the Collision layer.
   * `whole` (an Object-mode drop; the owner, 2026-11-16: "in object mode ... it should only apply to the whole object
   * geometry and not per face/edge/point"): every face of the object under the pointer, the selection aside -- the
   * base's geometry opened first where Geometry mode has not opened it yet.
   */
  dropTexture(n: Vector2, name: string, whole = false): boolean {
    if (whole && !this.openBase()) { this.deps.say('Textures are laid on a map\'s geometry', true); return false; }
    if (!this.geo || this.collisionOn) { this.deps.say('A texture is dropped on the Geometry layer\'s faces', true); return false; }
    const hit = pickFace(this.geo, this.rayAt(n, this.deps.camera()), this.index);
    if (!hit) { this.deps.say('Drop the texture on a face', true); return false; }
    this.setTexture(name);
    const o = hit.object;
    const perFace = this.sel.mode === 'face' && !whole;
    const onSelection = !whole && (perFace ? !!this.sel.items.get(o.id)?.has(hit.face) : this.sel.objects.has(o.id));
    const sets = onSelection ? this.selectedFaceSets() : [{ o, faces: perFace ? [hit.face] : [...objectFaces(o)] }];
    const scaleTexel = this.scaleTexel();
    this.edit('Texture faces', () => {
      for (const s of sets) applyTexture(s.o.mesh, s.faces, name, this.size, { align: 'keep', scaleTexel });
      return true;
    });
    const n2 = sets.reduce((k, s) => k + s.faces.length, 0);
    this.deps.say(`${name} on ${n2} face${n2 === 1 ? '' : 's'}${onSelection ? ' (the selection)' : perFace ? '' : ` (${o.name})`}`);
    return true;
  }

  /** The base's geometry opened (as entering the mode opens it) where it is not yet: its map, or null with none. */
  openBase(): LoadedMap | null {
    const map = this.deps.map();
    if (map && map !== this.forMap) this.open(map);
    return map;
  }

  /** The texture Apply lays now (a key of the map's textures), or null. */
  currentTexture(): string | null { return this.textureName; }

  /** The map whose textures the geometry draws with (a texture lent from another map goes into its tables), or null. */
  textureMap(): LoadedMap | null { return this.forMap; }

  /** The Texture button as the texture stands: its swatch (the texture drawn small) and its name. */
  private drawTextureButton(): void {
    const name = this.textureName;
    const rgba = name ? this.forMap?.textures[name] : undefined;
    this.textureLabel.textContent = name ?? 'No texture';
    this.textureBtn.title = `${name ? `Texture: ${name}` : 'No texture'} -- click to choose one from the asset browser's Textures`;
    const c = this.textureSwatch.getContext('2d');
    if (!c) return;
    c.clearRect(0, 0, this.textureSwatch.width, this.textureSwatch.height);
    this.textureSwatch.hidden = !rgba;
    if (!rgba) return;
    const full = this.deps.doc.createElement('canvas');
    full.width = rgba.width; full.height = rgba.height;
    full.getContext('2d')?.putImageData(new ImageData(new Uint8ClampedArray(rgba.data), rgba.width, rgba.height), 0, 0);
    c.imageSmoothingEnabled = true;
    // Its rows turned over, as the world draws it (the decoder's row 0 is GL's V = 0, the image's foot: `@s2u/gs` `decode`).
    c.setTransform(1, 0, 0, -1, 0, this.textureSwatch.height);
    c.drawImage(full, 0, 0, this.textureSwatch.width, this.textureSwatch.height);
    c.setTransform(1, 0, 0, 1, 0, 0);
  }

  /** The last sample's look, while the texture list still shows its texture (a texture picked by hand drops it). */
  private sampled: FaceLook | null = null;

  private texturing(_how: 'apply'): void {
    const scaleTexel = this.scaleTexel();
    const look = this.sampled && this.sampled.style.textureName === this.textureName ? this.sampled : null;
    this.edit('Texture faces', () => this.forFaces((m, faces) => {
      if (look) pasteLook(m, faces, look, this.size, scaleTexel);
      else applyTexture(m, faces, this.textureName, this.size, { align: 'keep', scaleTexel });
    }));
  }

  /* ---------- the Inspector's Texture State and Modify Texture (a level editor 2's face edit) ---------- */

  /**
   * The selected faces' Texture State (the owner, 2026-11-17: texturing as a level editor does it: Align,
   * Scale, Shift, Rotate, Fit, Justify; a browser adaptation): what they share, null where they differ; null off the
   * Texture layer or with nothing selected. The Inspector reads it whenever the selection or the geometry changes.
   */
  textureStateNow(): TextureStateView | null {
    if (!this.active || !this.textureOn) return null;
    const sets = this.selectedFaceSets();
    if (!sets.length) return null;
    const scaleTexel = this.scaleTexel();
    const parts = sets.map(({ o, faces }) => textureState(o.mesh, faces, this.size, scaleTexel));
    const pick = (k: keyof Omit<TextureState, 'count'>): number | null => {
      const v = parts[0]![k];
      return v !== null && parts.every((x) => x[k] !== null && Math.abs(x[k]! - v) < 1e-3) ? v : null;
    };
    // The texture they wear (one shared, else null): its size in texels and its natural size (`naturalScale`).
    const names = new Set(sets.flatMap(({ o, faces }) => faces.flatMap((f) => { const face = o.mesh.faces[f]; return face ? [o.mesh.styles[face.style]!.style.textureName] : []; })));
    const name = names.size === 1 ? [...names][0]! : null;
    const size = name ? this.size(name) : null;
    // The detail pass's words over the faces whose texture binds one.
    const records = this.forMap?.detail ?? {};
    let faces = 0, on: boolean | null | undefined, range: number | null | undefined;
    for (const { o, faces: fs } of sets) for (const f of fs) {
      const face = o.mesh.faces[f];
      const style = face && o.mesh.styles[face.style]!.style;
      const record = style?.textureName ? records[style.textureName] : undefined;
      if (!style || !record) continue;
      faces++;
      const fOn = style.detailOn !== false, fRange = style.detailRange ?? record.range;
      on = on === undefined ? fOn : on === fOn ? on : null;
      range = range === undefined ? fRange : range !== null && Math.abs(range - fRange) < 1e-6 ? range : null;
    }
    return {
      count: parts.reduce((n, x) => n + x.count, 0), scaleU: pick('scaleU'), scaleV: pick('scaleV'), shiftU: pick('shiftU'), shiftV: pick('shiftV'), rotate: pick('rotate'),
      texture: name, texSize: size ? [size[0], size[1]] : null, natural: name ? this.naturalScale(name) : null, metresPerUnit: this.forMap?.metersPerUnit ?? 0.1,
      detail: { faces, on: on ?? null, range: range ?? null },
    };
  }

  /** Each texture's natural size off the map's own faces (`textureTexelScales`), read once a map; null until asked. */
  private naturalScales: Map<string, number> | null = null;
  /** A texture's natural size, world units a texel: as the map's makers laid it, else the map's median (`scaleTexel`). */
  naturalScale(name: string | null): number {
    if (!this.naturalScales) {
      const world = this.geo?.objects.find((o) => o.kind === 'world');
      this.naturalScales = world ? textureTexelScales(this.geo?.original ?? world.mesh, this.size) : new Map();
    }
    return (name && this.naturalScales.get(name.toLowerCase())) || this.scaleTexel();
  }

  /** Reset (a level editor's): the selected faces world-aligned at their texture's natural size, shift and rotation zeroed. */
  resetTexture(): void {
    this.edit('Reset texture', () => this.forFaces((m, faces) => resetMapping(m, faces, this.size, (n) => this.naturalScale(n))));
  }

  /**
   * The Edit menu's face selections (the owner, 2026-11-17; the standard "select similar" of modelling tools): the
   * faces that lie in the plane of a selected face (coplanar), that wear a selected face's texture, or that face up
   * (floors), sideways (walls) or down (ceilings) -- coplanar and same texture over every visible object, by facing over
   * the selected objects (every visible object with none selected). Face selection after; the count said.
   */
  selectSimilar(how: 'coplanar' | 'texture' | 'floors' | 'walls' | 'ceilings'): void {
    if (!this.geo || !this.active) return;
    const visible = this.geo.objects.filter((o) => !o.hidden);
    const seeds = this.selectedFaceSets();
    let pool = visible;
    if (how === 'floors' || how === 'walls' || how === 'ceilings') { if (seeds.length) pool = seeds.map((x) => x.o); }
    else if (!seeds.length) { this.deps.say('Select a face first', true); return; }
    const planes = seeds.flatMap(({ o, faces }) => faces.map((f) => { const n = faceNormal(o.mesh, f); return { n, d: dot(n, facePoints(o.mesh, f)[0]!) }; }));
    const textures = new Set(seeds.flatMap(({ o, faces }) => faces.map((f) => (o.mesh.styles[o.mesh.faces[f]!.style]!.style.textureName ?? '').toLowerCase())));
    const take = (o: GeoObject, f: number): boolean => {
      const n = faceNormal(o.mesh, f);
      if (how === 'floors') return n[1] >= FACING_UP_MIN;
      if (how === 'ceilings') return n[1] <= -FACING_UP_MIN;
      if (how === 'walls') return Math.abs(n[1]) < FACING_UP_MIN;
      if (how === 'texture') return textures.has((o.mesh.styles[o.mesh.faces[f]!.style]!.style.textureName ?? '').toLowerCase());
      const p = facePoints(o.mesh, f)[0]!;
      return planes.some((q) => dot(q.n, n) > COPLANAR_DOT && Math.abs(dot(q.n, p) - q.d) < COPLANAR_DIST);
    };
    const sel = emptySelection('face');
    let n = 0;
    for (const o of pool) {
      const faces = objectFaces(o).filter((f) => take(o, f));
      if (!faces.length) continue;
      sel.objects.add(o.id);
      sel.items.set(o.id, new Set(faces));
      n += faces.length;
    }
    if (!n) { this.deps.say('No faces match', true); return; }
    this.sel = sel;
    this.drawSelection();
    this.deps.say(`${n} face${n === 1 ? '' : 's'} selected`);
  }

  /** The Overlays menu's Texture grid: the selected faces' texture repeats drawn over them, on the Texture layer. */
  setTextureGrid(on: boolean): void {
    if (this.textureGridOn === on) return;
    this.textureGridOn = on;
    if (this.active) this.drawSelection();
  }
  private textureGridOn = false;

  /**
   * The Texture grid (an overlay, as a modelling tool's UV checker): over each selected face (the first
   * `TEXTURE_GRID_FACES`) a line wherever one copy of its texture ends and the next begins, along both axes, just off the
   * face. Drawn into the selection's fixed layer, so it follows every selection and edit.
   */
  private drawTextureGrid(): void {
    if (!this.textureGridOn || !this.active || !this.textureOn) return;
    const pts: number[] = [];
    let faces = 0;
    for (const { o, faces: fs } of this.selectedFaceSets()) for (const f of fs) {
      if (faces++ >= TEXTURE_GRID_FACES) break;
      const m = o.mesh, face = m.faces[f];
      if (!face) continue;
      const sz = this.size(m.styles[face.style]!.style.textureName);
      if (!sz) continue;
      const map = face.mapping ?? fitMapping(m, f, sz);
      if (!map) continue;
      const n = faceNormal(m, f);
      const ps = facePoints(m, f).map((p) => [p[0] + n[0] * TEXTURE_GRID_LIFT, p[1] + n[1] * TEXTURE_GRID_LIFT, p[2] + n[2] * TEXTURE_GRID_LIFT] as Vec3);
      const uv = ps.map((p) => mappedUv(map, p, sz));
      for (const [a, b, c] of triangulate(ps)) for (const axis of [0, 1] as const) {
        const t = [uv[a]![axis], uv[b]![axis], uv[c]![axis]];
        const lo = Math.ceil(Math.min(...t)), hi = Math.floor(Math.max(...t));
        if (hi - lo > TEXTURE_GRID_LINES) continue;              // so many copies a line each would be noise
        const tri = [ps[a]!, ps[b]!, ps[c]!];
        for (let k = lo; k <= hi; k++) {
          const cut: Vec3[] = [];
          for (let e = 0; e < 3; e++) {
            const t0 = t[e]!, t1 = t[(e + 1) % 3]!;
            if ((t0 - k) * (t1 - k) > 0 || t0 === t1) continue;
            const s0 = (k - t0) / (t1 - t0);
            const p0 = tri[e]!, p1 = tri[(e + 1) % 3]!;
            cut.push([p0[0] + (p1[0] - p0[0]) * s0, p0[1] + (p1[1] - p0[1]) * s0, p0[2] + (p1[2] - p0[2]) * s0]);
          }
          if (cut.length >= 2) pts.push(...cut[0]!, ...cut[1]!);
        }
      }
    }
    if (!pts.length) return;
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(Float32Array.from(pts), 3));
    const lines = new LineSegments(g, new LineBasicMaterial({ color: TEXTURE_GRID_COLOR, transparent: true, opacity: 0.85 }));
    lines.renderOrder = 11;
    this.fixed.add(lines);
  }

  /**
   * A texture tile hovered in the asset browser (try before you apply, as modelling tools preview a material): `name`
   * shown on the selected faces, their mapping kept, no edit; null puts them back as they were.
   */
  previewTextureName(name: string | null): void {
    if (name === null) {
      if (!this.hoverPreview) return;
      this.restoreFaces(this.hoverPreview);
      this.hoverPreview = null;
      this.redraw();
      return;
    }
    if (!this.active || !this.textureOn || this.texturePreview) return;
    const sets = this.selectedFaceSets();
    if (!sets.length) return;
    if (this.hoverPreview) this.restoreFaces(this.hoverPreview); else this.hoverPreview = this.snapshotFaces(sets);
    const scaleTexel = this.scaleTexel();
    for (const { o, faces } of sets) applyTexture(o.mesh, faces, name, this.size, { align: 'keep', scaleTexel });
    this.redraw();
  }
  private hoverPreview: FaceSnapshot[] | null = null;

  /** How many faces of the map's world wear each texture, by lowercase name (the asset browser's sort by use). */
  textureUses(): Map<string, number> {
    const out = new Map<string, number>();
    const seen = new Set<EditMesh>();
    for (const o of this.geo?.objects ?? []) {
      if (seen.has(o.mesh)) continue;
      seen.add(o.mesh);
      for (const f of liveFaces(o.mesh)) {
        const name = o.mesh.styles[o.mesh.faces[f]!.style]!.style.textureName;
        if (name) out.set(name.toLowerCase(), (out.get(name.toLowerCase()) ?? 0) + 1);
      }
    }
    return out;
  }

  /** Each face of `sets` as it is: its draw style, its mapping (or none) and its corners' UVs by place, to put back. */
  private snapshotFaces(sets: { o: GeoObject; faces: number[] }[]): FaceSnapshot[] {
    return sets.flatMap(({ o, faces }) => faces.flatMap((f) => {
      const face = o.mesh.faces[f];
      if (!face) return [];
      const mp = face.mapping;
      return [{ m: o.mesh, f, style: face.style, mapping: mp ? { ...mp, u: [...mp.u] as Vec3, v: [...mp.v] as Vec3 } : undefined,
        uvs: face.corners.map((c) => [o.mesh.cUv[c * 2]!, o.mesh.cUv[c * 2 + 1]!] as [number, number]), styles: o.mesh.styles.length }];
    }));
  }
  private restoreFaces(snap: readonly FaceSnapshot[]): void {
    for (const { m, f, style, mapping, uvs } of snap) {
      const face = m.faces[f];
      if (!face) continue;
      face.style = style;
      if (mapping) face.mapping = { ...mapping, u: [...mapping.u] as Vec3, v: [...mapping.v] as Vec3 }; else delete face.mapping;
      face.corners.forEach((c, k) => { const uv = uvs[k]; if (uv) { m.cUv[c * 2] = uv[0]; m.cUv[c * 2 + 1] = uv[1]; } });
    }
    // The draw styles the preview made and no face now wears (a scrubbed distance makes one a value): dropped.
    const before = new Map<EditMesh, number>();
    for (const { m, styles } of snap) before.set(m, Math.min(before.get(m) ?? Infinity, styles));
    for (const [m, n] of before) {
      let worn = -1;
      for (const f of liveFaces(m)) worn = Math.max(worn, m.faces[f]!.style);
      if (m.styles.length > n) m.styles.length = Math.max(n, worn + 1);
    }
  }

  /** The step the Shift buttons move a texture by (the grid's, world units) and Rotate turns it by (the turn snap's, degrees). */
  textureSteps(): { shift: number; rotate: number } {
    return { shift: this.snapStep > 0 ? this.snapStep : 1 / (this.forMap?.metersPerUnit ?? 1), rotate: this.turnStep > 0 ? (this.turnStep * 180) / Math.PI : 15 };
  }

  /** The selected faces' mappings changed (`MappingChange`): one edit, their UVs rewritten; `label` its undo step's name. */
  modifyTexture(change: MappingChange, label = 'Modify texture'): void {
    this.previewTexture(null);                                 // a field's live drag let go first: the edit starts from as it was
    const scaleTexel = this.scaleTexel();
    this.edit(label, () => this.forFaces((m, faces) => adjustMapping(m, faces, change, this.size, scaleTexel)));
  }

  /**
   * A Texture State field dragged, shown live (the owner, 2026-11-17: "Live preview while scrubbing"; a browser
   * adaptation, as the Transform rows' `previewObjectTransform`): `change` (an absolute value: scale, shift or rotation
   * set) laid on the selected faces with no edit made, the world redrawn at most every `TEXTURE_PREVIEW_MS`; null puts
   * every face back as it was -- its mapping and its UVs -- for Escape, or just before the release's one edit
   * (`modifyTexture`). The history is untouched: its last step holds the faces as they were before the drag.
   */
  previewTexture(change: MappingChange | null): void {
    const scaleTexel = this.scaleTexel();
    this.previewFaces(change && ((m, faces) => adjustMapping(m, faces, change, this.size, scaleTexel)));
  }

  /**
   * The selected faces' detail pass set (`DetailChange`, `./texturing` `setDetail`): one edit; faces sharing a draw with
   * others are split into their own, as retexturing does.
   */
  setTextureDetail(change: DetailChange, label = 'Detail texture'): void {
    this.previewFaces(null);
    this.edit(label, () => this.forFaces((m, faces) => setDetail(m, faces, change)));
  }

  /** The detail distance field dragged, shown live as `previewTexture` shows a mapping field; null puts the faces back. */
  previewDetail(change: DetailChange | null): void {
    this.previewFaces(change && ((m, faces) => setDetail(m, faces, change)));
  }

  /** A Texture State field's live drag: `apply` laid on the selected faces from as the drag found them, no edit; null ends it. */
  private previewFaces(apply: ((m: EditMesh, faces: number[]) => void) | null): void {
    const was = this.texturePreview;
    if (apply === null) {
      if (!was) return;
      this.texturePreview = null;
      if (this.texturePreviewTimer) { clearTimeout(this.texturePreviewTimer); this.texturePreviewTimer = null; }
      this.restoreFaces(was);
      this.redraw();
      return;
    }
    const sets = this.selectedFaceSets();
    if (!sets.length) return;
    // From the faces as the drag found them each time, so a relative change (a turn) is the drag's whole, not summed.
    if (was) this.restoreFaces(was); else this.texturePreview = this.snapshotFaces(sets);
    for (const { o, faces } of sets) apply(o.mesh, faces);
    // The world drawn again no more often than the preview's step: a big map's draws take a while to rebuild.
    const wait = TEXTURE_PREVIEW_MS - (performance.now() - this.texturePreviewAt);
    if (this.texturePreviewTimer) return;
    const run = (): void => { this.texturePreviewTimer = null; if (!this.texturePreview) return; this.texturePreviewAt = performance.now(); this.redraw(); };
    if (wait <= 0) run(); else this.texturePreviewTimer = setTimeout(run, wait);
  }
  /** The faces as a Texture State field's drag found them (`previewTexture`); null with none going on. */
  private texturePreview: FaceSnapshot[] | null = null;
  private texturePreviewTimer: ReturnType<typeof setTimeout> | null = null;
  private texturePreviewAt = 0;

  /** a level editor's Align: to the world (the nearest axis plane), to the face's own plane, or to the view (upright as you look). */
  alignTexture(how: 'world' | 'face' | 'view'): void {
    const scaleTexel = this.scaleTexel();
    const cam = this.deps.camera();
    cam.updateMatrixWorld();
    const right = new Vector3().setFromMatrixColumn(cam.matrixWorld, 0), up = new Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
    this.edit(`Align texture to ${how}`, () => this.forFaces((m, faces) => {
      if (how === 'view') alignToView(m, faces, right.toArray(), up.toArray(), this.size, scaleTexel);
      else align(m, faces, how, this.size, scaleTexel);
    }));
  }

  /** a level editor's Fit (`repeat` X by Y across) and Justify; `together` is "Treat as one": the selected faces one surface. */
  justifyTexture(how: Justify, together: boolean, repeat: readonly [number, number] = [1, 1]): void {
    const scaleTexel = this.scaleTexel();
    this.edit(how === 'fit' ? 'Fit texture' : `Justify texture ${how}`, () => this.forFaces((m, faces) => justify(m, faces, how, this.size, scaleTexel, { repeat, together })));
  }

  private displace(): void {
    let made = 0, skipped = 0;
    this.edit('Displace faces', () => {
      const ok = this.forFaces((m, faces, o) => { for (const f of faces) if (makeDisplacement(m, f, 3)) { made++; markReshaped(o); } else skipped++; });
      if (ok) this.deps.say(`${made} face${made === 1 ? '' : 's'} made displacements${skipped ? `; ${skipped} not four-sided, left` : ''}`, made === 0);
      return ok && made > 0;
    });
  }

  /* ---------- the gizmo ---------- */

  private onDragging(on: boolean): void {
    if (on) {
      this.pivot.updateMatrixWorld(true);
      this.dragStart = this.pivot.matrixWorld.clone();
      this.dragBounds = this.selectionBox();
      this.applyDragSnaps();
      this.dragLift = this.lowestLift();
      if (this.dragExtrude) this.beginDragExtrude();
      // The live vertices first: building the view (the first edit) redraws the selection, which the preview then joins.
      this.startLive();
      this.startPreview();
      return;
    }
    const start = this.dragStart;
    this.dragStart = null;
    this.dragLift = null;
    this.dragBounds = null;
    this.endPreview();
    if (!start || !this.geo) return;
    this.pivot.updateMatrixWorld(true);
    const delta = this.pivot.matrixWorld.clone().multiply(start.clone().invert());
    const mat = delta.elements;
    const copy = this.dragCopy;
    this.dragCopy = false;
    this.dragExtrude = false;
    const extruding = this.extruding;
    this.extruding = null;
    if (delta.equals(new Matrix4())) {
      this.endLive(true);
      // A Shift-drag let go where it began: no extrude (its faces of no depth taken back), the selection as it was.
      if (extruding) { this.geo.objects.splice(0, this.geo.objects.length, ...extruding.objects); this.sel = extruding.sel; this.redraw(); }
      this.drawSelection();
      return;
    }                                                          // no move: the preview goes
    this.endLive(false);
    if (this.sel.mode === 'object') { this.transformObjects(mat, copy); return; }
    if (copy && this.sel.mode === 'face') { this.copyFacesBy(mat); return; }
    // Bug 5: a move with the grid snap on puts each moved point on the grid, along the axes it moved (a level editor snaps vertices),
    // not just the selection's centre by a whole step.
    const step = this.gizmo.mode === 'translate' && this.snapBy === 'bounds' ? this.moveSnap() : null;
    const pure = [0, 1, 2, 4, 5, 6, 8, 9, 10].every((i, j) => Math.abs(mat[i]! - (j % 4 === 0 ? 1 : 0)) < 1e-9);
    const axes = [0, 1, 2].map((k) => Math.abs(mat[12 + k]!) > 1e-9);
    this.edit(extruding ? 'Extrude' : `Transform ${modeWord(this.sel.mode, 2)}`, () => {
      for (const id of this.sel.objects) {
        const o = this.objectById(id);
        if (!o) continue;
        const vs = selectionVerts(this.sel, o);
        transformVerts(o.mesh, vs, mat, { textureLock: true, size: this.size });
        if (step && pure) snapVerts(o.mesh, vs, step, axes, { size: this.size });
        markReshaped(o);
      }
      // An extrude's new faces world-aligned at their source's texel scale (as the Extrude button's walls), now they
      // have their depth.
      for (const [id, { faces, texel, sides, pairs }] of extruding?.made ?? []) {
        const o = this.objectById(id);
        if (!o) continue;
        // Pulled edges: each new face carries on its edge's face that lies along the pull.
        if (sides) orientPulled(o.mesh, faces, sides, [mat[12]!, mat[13]!, mat[14]!]);
        // A lone border point's two triangles: one four-sided face where the pull left them flat together.
        if (pairs?.length) joinFlatPairs(o.mesh, pairs);
        const liveMade = faces.filter((f) => o.mesh.faces[f]);
        for (const f of liveMade) { const face = o.mesh.faces[f]; if (face) face.mapping = worldAligned(faceNormal(o.mesh, f), texel); }
        refreshUvs(o.mesh, liveMade, this.size);
      }
    });
  }

  /**
   * Surface snapping in Geometry mode (the owner, 2026-11-15: "add surface snapping in geometry mode when I am dragging a
   * geo object from the center of the gizmo, similar to object mode"; the Object mode's `surfaceSnapDrag`, a browser
   * adaptation, FG.R2): while the move gizmo's centre handle (`XYZ`) drags an object selection, the selection is seated
   * on the geometry under the pointer -- its lowest point on the surface (raised by the Surface Offset), across the floor
   * on the grid while the grid snap is on -- never on itself. An axis handle moves freely.
   */
  private surfaceSnapDrag(): void {
    if (!this.surface.on || this.dragLift === null || !this.geo || this.sel.mode !== 'object') return;
    if (this.gizmo.mode !== 'translate' || this.gizmo.axis !== 'XYZ') return;
    const ray = this.rayAt(this.pointer, this.deps.camera());
    const moving = this.sel.objects;
    const hit = this.index ? this.index.pick(ray, (o) => moving.has(o.id)) : null;
    if (!hit) return;
    let [x, y, z] = hit.at;
    // Across the surface on the grid by Snap by (the owner, 2026-11-17: "can we make the center transform drag also follow
    // the snap by settings?"): the pivot (Pivot), the moved box's middle (Centre) or its nearer edges (Bounds) on the grid
    // along x and z, Ctrl's flip in; its height the surface's.
    const g = this.moveSnap();
    const b = this.dragBounds;
    if (g && (this.snapBy === 'pivot' || !b || this.space !== 'world')) { x = Math.round(x! / g) * g; z = Math.round(z! / g) * g; }
    else if (g && b) {
      const across = (v: number, k: 0 | 2): number => {
        const off = v - (k === 0 ? b.from.x : b.from.z);
        const lo = b.min[k]! + off, hi = b.max[k]! + off;
        if (this.snapBy === 'centre') { const c = (lo + hi) / 2; return v + Math.round(c / g) * g - c; }
        const dLo = Math.round(lo / g) * g - lo, dHi = Math.round(hi / g) * g - hi;
        return v + (Math.abs(dLo) <= Math.abs(dHi) ? dLo : dHi);
      };
      x = across(x!, 0); z = across(z!, 2);
    }
    this.pivot.position.set(x!, y! + this.surface.offset + this.dragLift, z!);
    this.pivot.updateMatrixWorld(true);
  }

  /** The pivot's height over the selected objects' lowest point now (object selection), or null. */
  private lowestLift(): number | null {
    if (this.sel.mode !== 'object') return null;
    let low = Infinity;
    for (const id of this.sel.objects) {
      const o = this.objectById(id);
      if (!o) continue;
      for (const v of selectionVerts(this.sel, o)) low = Math.min(low, vertPos(o.mesh, v)[1]!);
    }
    return Number.isFinite(low) ? this.pivot.position.y - low : null;
  }

  private onDragMove(): void {
    if (!this.dragStart) return;
    this.boxSnapDrag();
    this.surfaceSnapDrag();
    this.pivot.updateMatrixWorld(true);
    const delta = this.pivot.matrixWorld.clone().multiply(this.dragStart.clone().invert());
    // The selection's own highlight rides the gizmo; the rest stays where it stands until the release applies the move.
    this.overlay.matrix.copy(delta);
    this.overlay.matrixWorldNeedsUpdate = true;
    this.moveLive(delta);
    this.previewSoon(delta);
    const pv = this.preview;
    if (!pv) return;
    const pos = pv.lines.geometry.getAttribute('position') as BufferAttribute;
    const v = new Vector3();
    pv.ends.forEach((e, i) => {
      v.set(e.at[0], e.at[1], e.at[2]);
      if (e.moves) v.applyMatrix4(delta);
      pos.setXYZ(i, v.x, v.y, v.z);
    });
    pos.needsUpdate = true;
  }

  /**
   * The live drag begins: the edited world drawn by the editor's own view (built now if nothing was edited yet), and every
   * drawn vertex and face edge end on a moving point found, with where it stands. Object mode moves an object's every point.
   */
  private startLive(sel: Selection = this.sel): void {
    this.live = [];
    if (!this.geo) return;
    if (!this.drawn) this.redraw();
    const view = this.drawn;
    if (!view) return;
    const moving = new Map<EditMesh, Set<number>>();
    for (const id of sel.objects) {
      const o = this.objectById(id);
      if (!o) continue;
      const vs = selectionVerts(sel, o);
      if (!vs.size) continue;
      const set = moving.get(o.mesh) ?? new Set<number>();
      for (const v of vs) set.add(v);
      moving.set(o.mesh, set);
    }
    if (!moving.size) return;
    // The faces only partly moved that carry a mapping: their corners, each with its face's mapping and texture size.
    const partial = new Map<EditMesh, Map<number, { map: TextureMapping; size: readonly [number, number] }>>();
    for (const [m, set] of moving) {
      const corners = new Map<number, { map: TextureMapping; size: readonly [number, number] }>();
      for (const f of liveFaces(m)) {
        const face = m.faces[f]!;
        if (!face.mapping || face.disp) continue;
        const vs = faceVerts(m, f);
        const n = vs.filter((v) => set.has(v)).length;
        if (n === 0 || n === vs.length) continue;
        const size = this.size(m.styles[face.style]!.style.textureName);
        if (!size) continue;
        for (const c of face.corners) corners.set(c, { map: face.mapping, size });
      }
      if (corners.size) partial.set(m, corners);
    }
    this.liveUv = [];
    const takeUv = (mesh: Mesh, src: { mesh: EditMesh; corners: Int32Array }): void => {
      const corners = partial.get(src.mesh);
      const attr = mesh.geometry.getAttribute('uv') as BufferAttribute | InterleavedBufferAttribute | undefined;
      if (!corners || !attr) return;
      const set = moving.get(src.mesh)!;
      for (let i = 0; i < src.corners.length; i++) {
        const c = src.corners[i]!;
        const hit = c >= 0 ? corners.get(c) : undefined;
        if (!hit) continue;
        const v = src.mesh.cVert[c]!;
        this.liveUv.push({ attr, i, map: hit.map, size: hit.size, at: vertPos(src.mesh, v), moves: set.has(v), uv: [attr.getX(i), attr.getY(i)] });
      }
    };
    const take = (mesh: Mesh, attr: BufferAttribute | InterleavedBufferAttribute, verts: ArrayLike<number>, meshOf: (i: number) => EditMesh | null): void => {
      const at: number[] = [], base: number[] = [];
      for (let i = 0; i < verts.length; i++) {
        const m = meshOf(i);
        if (!m || verts[i]! < 0 || !moving.get(m)?.has(verts[i]!)) continue;
        at.push(i);
        base.push(attr.getX(i), attr.getY(i), attr.getZ(i));
      }
      if (!at.length) return;
      mesh.frustumCulled = false;                            // the bound it was culled by no longer holds
      this.live.push({ attr, mesh, at, base });
    };
    view.group.traverse((o) => {
      const part = o.userData['worldPart'] as LoadedMesh | undefined;
      const src = part ? this.sources.get(part) : undefined;
      if (!src || !(o instanceof Mesh)) return;
      take(o, o.geometry.getAttribute('position') as BufferAttribute | InterleavedBufferAttribute, src.verts, () => src.mesh);
      takeUv(o, src);
    });
    // The faces' edges (the Wireframe) bend with them.
    const lines = this.edges.children[0] as Mesh | undefined;
    const refs = this.edgeRefs;
    if (lines && refs) take(lines as unknown as Mesh, lines.geometry.getAttribute('position') as BufferAttribute, refs.verts, (i) => refs.meshes[refs.meshOf[i]!] ?? null);
  }

  /** The live drag's vertices put where the gizmo's move takes them. */
  private moveLive(delta: Matrix4): void {
    const v = new Vector3();
    const touched = new Set<BufferAttribute | InterleavedBufferAttribute>();
    for (const u of this.liveUv) {
      v.set(u.at[0], u.at[1], u.at[2]);
      if (u.moves) v.applyMatrix4(delta);
      const [x, y] = mappedUv(u.map, [v.x, v.y, v.z], u.size);
      u.attr.setXY(u.i, x, y);
      touched.add(u.attr);
    }
    for (const a of touched) {
      if ('data' in a && a.data) (a.data as { needsUpdate: boolean }).needsUpdate = true;
      else (a as BufferAttribute).needsUpdate = true;
    }
    for (const l of this.live) {
      for (let k = 0; k < l.at.length; k++) {
        v.set(l.base[k * 3]!, l.base[k * 3 + 1]!, l.base[k * 3 + 2]!).applyMatrix4(delta);
        l.attr.setXYZ(l.at[k]!, v.x, v.y, v.z);
      }
      if ('data' in l.attr && l.attr.data) (l.attr.data as { needsUpdate: boolean }).needsUpdate = true;
      else (l.attr as BufferAttribute).needsUpdate = true;
    }
  }

  /** The live drag ends: `restore` puts its vertices back (no move made); else the release's rebuild replaces them. */
  private endLive(restore: boolean): void {
    if (restore) {
      this.moveLive(new Matrix4());
      // The texture as it was drawn (not as the mapping would lay it at rest: a disc uv a mapping only approximates).
      for (const u of this.liveUv) u.attr.setXY(u.i, u.uv[0], u.uv[1]);
      for (const a of new Set(this.liveUv.map((u) => u.attr))) {
        if ('data' in a && a.data) (a.data as { needsUpdate: boolean }).needsUpdate = true;
        else (a as BufferAttribute).needsUpdate = true;
      }
    }
    this.live = [];
    this.liveUv = [];
  }

  /**
   * The drag's live edges (point, edge and face mode), as a level editor stretches a mesh under its vertex tool: every edge of a
   * face at a moving point, its moving ends carried by the gizmo as it drags. The faces themselves follow at the release.
   */
  private startPreview(): void {
    if (!this.geo || this.sel.mode === 'object') return;
    const ends: { at: Vec3; moves: boolean }[] = [];
    for (const id of this.sel.objects) {
      const o = this.objectById(id);
      if (!o) continue;
      const moving = selectionVerts(this.sel, o);
      if (!moving.size) continue;
      const faces = objectFaces(o).filter((f) => faceVerts(o.mesh, f).some((v) => moving.has(v)));
      for (const e of edgeMap(o.mesh, faces).values()) {
        ends.push({ at: vertPos(o.mesh, e.a), moves: moving.has(e.a) }, { at: vertPos(o.mesh, e.b), moves: moving.has(e.b) });
      }
    }
    if (!ends.length) return;
    // A plain line, its points moved in place each drag step (`onDragMove`): the thick lines' geometry is rebuilt, not moved.
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(Float32Array.from(ends.flatMap((e) => e.at)), 3));
    const lines = new LineSegments(g, new LineBasicMaterial({ color: HIGHLIGHT, transparent: true, depthTest: false }));
    lines.renderOrder = 12;
    this.fixed.add(lines);
    this.preview = { lines, ends };
  }

  /* ---------- the input ---------- */

  private ndc(e: PointerEvent): Vector2 {
    const r = this.deps.input.getBoundingClientRect();
    return new Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  }

  private rayAt(ndc: Vector2, cam: Camera): Ray {
    const rc = new Raycaster();
    rc.setFromCamera(ndc, cam);
    return { origin: rc.ray.origin.toArray(), dir: rc.ray.direction.toArray() };
  }

  private onPointerDown(e: PointerEvent): void {
    if (!this.active || e.button !== 0 || !this.geo) return;
    // Alt + left drag is the camera's orbit (`../../camera`), as everywhere in the Forge -- but on the gizmo, a copy's drag
    // (the owner, 2026-11-17: "make the alt+drag to copy").
    if (e.altKey && !this.gizmoHovered(this.ndc(e))) return;
    this.setCtrlHeld(e.ctrlKey || e.metaKey);
    e.stopImmediatePropagation();
    const n = this.ndc(e);
    const cam = this.deps.camera();
    this.gizmo.camera = cam;
    // The sampler first: its click is a face's texture, never the gizmo's drag (the face sampled is often the selection's).
    if (this.sampling) { if (this.sampleAt(n)) this.setTool(this.toolBeforeSample); return; }
    if (this.knifeOn) { this.knifeClick(n); return; }           // the Knife: a click is a point of the cut
    // Create on: a resize handle of the shape just made first (`handleDown`); then the gizmo (the owner, 2026-11-17: "use
    // the gizmos after the shape is created"); else a new shape (`blockDown`, below).
    if (this.blockOn && !this.textureOn && this.block?.phase !== 'height' && this.handleDown(n, e)) return;
    if (this.blockOn && !this.textureOn && this.block?.phase === 'height') { this.blockCommit(); return; }
    // Shift+click while painting: a sample, the brush kept (the owner, 2026-11-16).
    if (this.paintOn && e.shiftKey && (this.collisionOn || this.textureOn)) { this.sampleAt(n); return; }
    // Collision painting: a click starts a stroke the drag carries on (`paintFaceAt`); never the gizmo's.
    if (this.paintOn && (this.collisionOn || this.textureOn)) {
      // A face's twins are the collision brush's alone, read when it first needs them (`twinsOf`): the Texture layer's
      // stroke never walks the map for them (a browser run, 2026-11-16: 0.6 s of every texture dab on Sujo).
      this.stroke = { pointerId: e.pointerId, lastX: e.clientX, lastY: e.clientY, done: new Set(), faces: 0, twins: (o, f) => (this.textureOn ? [{ o, f }] : this.twinsOf()(o, f)) };
      if (this.paintFaceAt(n)) this.drawStrokeSoon();
      try { this.deps.input.setPointerCapture(e.pointerId); } catch { /* the release still arrives over the viewport */ }
      return;
    }
    if (this.gizmo.object && this.gizmo.getHelper().visible) {
      this.drive.pointerHover({ x: n.x, y: n.y, button: 0 });
      if (this.gizmo.axis !== null) {
        // Alt-drag copies (the owner, 2026-11-17: "make ctrl drag the snap, and make the alt+drag to copy"; it was Ctrl):
        // objects whole, and faces (`copyFacesBy`). A vertex or an edge has nothing of its own to copy: it moves.
        this.dragCopy = e.altKey && (this.sel.mode === 'object' || this.sel.mode === 'face');
        // Shift-drag extrudes (the owner, 2026-11-18: "do shift drag for faces and edges"; ProBuilder's and
        // Maya's): faces, or edges pulled out into new faces, then moved with the drag -- one edit (`beginDragExtrude`).
        this.dragExtrude = e.shiftKey && !e.altKey && this.gizmo.mode === 'translate' && this.sel.mode !== 'object';
        this.drive.pointerDown({ x: n.x, y: n.y, button: 0 });
        try { this.deps.input.setPointerCapture(e.pointerId); } catch { /* the release still arrives over the viewport */ }
        return;
      }
    }
    // Create on, the gizmo not under the press: a new shape, never a pick.
    if (this.polyOn && !this.textureOn) { this.polyDown(n); return; }
    if (this.blockOn && !this.textureOn) { this.blockDown(n, e); return; }
    const ray = this.rayAt(n, cam);
    if (this.sculpting) { this.sculptAt(ray, e); return; }
    // A press: a click picks at its release; a drag past the slop paints the selection (`paintAt`).
    this.press = { x: e.clientX, y: e.clientY, ndc: n, pointerId: e.pointerId, shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey, painting: false, lastX: e.clientX, lastY: e.clientY };
    try { this.deps.input.setPointerCapture(e.pointerId); } catch { /* the release still arrives over the viewport */ }
  }

  /** A click's pick (its release with no drag): the item under the press alone, Shift's added, Ctrl's in or out (`PickOp`). */
  private clickPick(n: Vector2, op: PickOp): void {
    if (!this.geo) return;
    const ray = this.rayAt(n, this.deps.camera());
    const hit = pickFace(this.geo, ray, this.index);
    const tolerance = hit ? Math.max(0.05, hit.t * 0.015) : 1;
    if (hit) this.focus = hit.object.id;
    if (this.sel.mode === 'point' || this.sel.mode === 'edge') this.pickOnScreen(n, hit?.object ?? null, op);
    else pick(this.geo, this.sel, ray, tolerance, op, this.index);
    this.drawSelection();
  }

  /**
   * Drag select as a level editor's: what the pointer passes over while held is taken -- the face under it in face mode, the
   * object in object mode, the nearest point or edge on screen in point and edge mode -- added (a plain drag, after
   * starting the selection afresh, or Shift's), or taken out (Ctrl's). A quick sweep is sampled along its path every few
   * pixels, so what lies between two pointer events is not skipped. Returns whether anything changed.
   */
  private paintAt(ndc: Vector2, op: 'add' | 'remove'): boolean {
    const geo = this.geo;
    if (!geo) return false;
    const mode = this.sel.mode;
    let object: GeoObject | null = null;
    let item: number | string | null = null;
    if (mode === 'point' || mode === 'edge') {
      const under = pickFace(geo, this.rayAt(ndc, this.deps.camera()), this.index);
      const near = this.screenNearest(ndc, under?.object ?? null);
      if (near) { object = near.object; item = near.item; }
    } else {
      const hit = pickFace(geo, this.rayAt(ndc, this.deps.camera()), this.index);
      if (hit) { object = hit.object; item = hit.face; }
    }
    if (!object || item === null) return false;
    this.focus = object.id;
    if (mode === 'object') {
      const had = this.sel.objects.has(object.id);
      if (op === 'remove') this.sel.objects.delete(object.id); else this.sel.objects.add(object.id);
      return had !== (op === 'add');
    }
    let set = this.sel.items.get(object.id);
    if (!set) { if (op === 'remove') return false; set = new Set(); this.sel.items.set(object.id, set); }
    const had = set.has(item);
    if (op === 'remove') set.delete(item); else set.add(item);
    if (set.size) this.sel.objects.add(object.id); else { this.sel.items.delete(object.id); this.sel.objects.delete(object.id); }
    return had !== (op === 'add');
  }

  private sculptAt(ray: Ray, e: PointerEvent): void {
    const hit = this.geo && pickFace(this.geo, ray, this.index);
    if (!hit || !hit.object.mesh.faces[hit.face]?.disp) { this.deps.say('Sculpt: click a displacement (Displace a face first)', true); return; }
    const unit = 1 / (this.forMap?.metersPerUnit ?? 1);
    const o = hit.object;
    const faces = objectFaces(o).filter((f) => o.mesh.faces[f]!.disp);
    this.edit('Sculpt', () => { sculpt(o.mesh, faces, hit.at, 2 * unit, 0.25 * unit, e.ctrlKey || e.metaKey ? 'smooth' : e.shiftKey ? 'lower' : 'raise'); markReshaped(o); });
  }

  private onPointerMove(e: PointerEvent): void {
    if (!this.active) return;
    this.pointer = this.ndc(e);
    this.pointerClient = { x: e.clientX, y: e.clientY };
    this.setShiftHeld(e.shiftKey);                             // Shift pressed or let go away from the keys' focus
    this.setCtrlHeld(e.ctrlKey || e.metaKey);                  // and Ctrl, the snaps' flip
    if (this.block) { this.blockMove(this.pointer); return; }  // a shape being dragged out or pulled up
    if (this.poly) { this.polyMove(this.pointer); return; }    // an outline being drawn, or its height pulled
    if (this.knifeOn) { this.knifeHover = this.knifeAt(this.pointer); this.drawKnife(); return; }
    if (this.handleDrag && this.handleDrag.pointerId === e.pointerId) { this.handleMove(this.pointer); return; }
    this.drawBlockStart((this.blockOn || this.polyOn) && !this.textureOn ? this.pointer : null);
    const st = this.stroke;
    if (st && st.pointerId === e.pointerId) {
      // Sampled along the way from the last event, as a drag select is, so a quick sweep skips no face.
      const r = this.deps.input.getBoundingClientRect();
      const dist = Math.hypot(e.clientX - st.lastX, e.clientY - st.lastY);
      const steps = Math.min(PAINT_SAMPLES_MAX, Math.max(1, Math.ceil(dist / PAINT_STEP_PX)));
      let changed = false;
      for (let i = 1; i <= steps; i++) {
        const x = st.lastX + ((e.clientX - st.lastX) * i) / steps, y = st.lastY + ((e.clientY - st.lastY) * i) / steps;
        if (this.paintFaceAt(new Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1))) changed = true;
      }
      st.lastX = e.clientX;
      st.lastY = e.clientY;
      if (changed) this.drawStrokeSoon();
    }
    const press = this.press;
    if (press && press.pointerId === e.pointerId) {
      if (!press.painting && Math.hypot(e.clientX - press.x, e.clientY - press.y) >= PAINT_DRAG_PX) {
        press.painting = true;
        // A plain drag starts the selection afresh; Shift's adds to it, Ctrl's takes out of it.
        if (!press.shift && !press.ctrl) { this.sel.objects.clear(); this.sel.items.clear(); }
        this.paintAt(press.ndc, press.ctrl ? 'remove' : 'add');
      }
      if (press.painting) {
        // Sampled along the way from the last event, a few pixels apart (at most a handful a move: each is a pick).
        const r = this.deps.input.getBoundingClientRect();
        const dist = Math.hypot(e.clientX - press.lastX, e.clientY - press.lastY);
        const steps = Math.min(PAINT_SAMPLES_MAX, Math.max(1, Math.ceil(dist / PAINT_STEP_PX)));
        let changed = false;
        for (let i = 1; i <= steps; i++) {
          const x = press.lastX + ((e.clientX - press.lastX) * i) / steps, y = press.lastY + ((e.clientY - press.lastY) * i) / steps;
          const ndc = new Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
          if (this.paintAt(ndc, press.ctrl ? 'remove' : 'add')) changed = true;
        }
        press.lastX = e.clientX;
        press.lastY = e.clientY;
        if (changed) this.drawSelection();
        return;
      }
    }
    const n = this.ndc(e);
    if (this.gizmo.object) {
      if (this.gizmo.dragging) this.drive.pointerMove({ x: n.x, y: n.y, button: -1 });
      // The sampler leaves the gizmo dark: its click is never the gizmo's.
      else this.drive.pointerHover(this.sampling ? { x: 2, y: 2, button: -1 } : { x: n.x, y: n.y, button: -1 });
    }
    // The hover, once a frame at most: the pick walks every face.
    this.hoverAt = { x: n.x, y: n.y };
    if (this.hoverQueued) return;
    this.hoverQueued = true;
    requestAnimationFrame(() => { this.hoverQueued = false; this.drawHover(); });
  }

  /** Clears the hover's drawing. */
  private clearHover(): void {
    clearGroup(this.hover);
  }

  /**
   * What a click would take, lit under the pointer (the owner, 2026-11-14: "when I am in face mode and I am hovering over
   * a face it shows a highlight"): the object in object mode, the face in face mode, the nearest point or edge -- with the
   * object's own points or edges faintly, to see what is there -- in point and edge mode. Nothing while the gizmo is
   * dragged or hovered, or the camera navigates.
   */
  private drawHover(): void {
    const at = this.hoverAt;
    const geo = this.geo;
    // Create on: no hover on faces, edges, vertices or objects -- its press makes a shape, it picks nothing (the owner,
    // 2026-11-17: "when we are in create mode, it should not do the hover select").
    const off = !this.active || !geo || !at || this.blockOn || this.polyOn || this.gizmo.dragging || (!this.sampling && this.gizmo.object && this.gizmo.axis !== null) || this.deps.navigating();
    if (off) { this.showPaintTip(null); if (this.hoverKey) { this.hoverKey = ''; this.clearHover(); } return; }
    const ray = this.rayAt(new Vector2(at.x, at.y), this.deps.camera());
    const hit = pickFace(geo, ray, this.index);
    const tolerance = hit ? Math.max(0.05, hit.t * 0.015) : 1;
    let key = '';
    let draw: (() => void) | null = null;
    const mode = this.sel.mode;
    const chosen = (id: string, item: number | string): boolean => !!this.sel.items.get(id)?.has(item);
    // The face's collision type at the pointer on the Collision layer, painting or not (the owner, 2026-11-15).
    const textureAt = (o: GeoObject, f: number): string => { const face = o.mesh.faces[f]; return (face && o.mesh.styles[face.style]?.style.textureName) || 'no texture'; };
    if (!(hit && (this.collisionOn || this.textureOn))) this.showPaintTip(null);
    else if (!this.paintOn) this.showPaintTip(this.textureOn ? textureAt(hit.object, hit.face) : this.typeWords(wordsOf(hit.object, null)(hit.face)));
    if (hit && this.sampleNow) this.showPaintTip(`Sample: ${this.collisionOn ? this.typeWords(wordsOf(hit.object, null)(hit.face)) : textureAt(hit.object, hit.face)}`);
    if (hit && this.paintOn && this.textureOn && this.textureName && !this.sampleNow) {
      // The texture brush: what a click lays, drawn on the dab's faces as laid, with their outline; the tip old -> new.
      const name = this.textureName;
      const now = textureAt(hit.object, hit.face);
      this.showPaintTip(now === name ? name : `${now} → ${name}`);
      const faces = this.scopeFaces(hit.object, hit.face);
      key = `t:${hit.object.id}:${this.sel.mode === 'object' ? 'o' : hit.face}:${name}`;
      draw = () => {
        const shown = this.texturedFaces(hit.object, faces, name, true, 0.9);
        if (shown) this.hover.add(shown);
        const edges = [...edgeMap(hit.object.mesh, faces).values()].flatMap((e) => [...vertPos(hit.object.mesh, e.a), ...vertPos(hit.object.mesh, e.b)]);
        this.hover.add(this.hoverLines(edges, 1, HIGHLIGHT));
      };
    } else if (hit && this.paintOn && this.collisionOn && !this.sampleNow) {
      const now = this.typeWords(wordsOf(hit.object, null)(hit.face));
      const to = this.typeWords(withCollisionType(wordsOf(hit.object, null)(hit.face), this.collisionType, this.climbFlag));
      this.showPaintTip(now === to ? now : `${now} \u2192 ${to}`);
      // In the painting type's own colour (the owner, 2026-11-15), so the face shows what a click makes it.
      const colour = TYPE_COLOURS[this.collisionType];
      key = `p:${hit.object.id}:${hit.face}:${this.collisionType}`;
      draw = () => {
        this.hover.add(this.hoverFaces(Float32Array.from(this.trianglesOf(hit.object, [hit.face])), 0.55, colour));
        const ps = facePoints(hit.object.mesh, hit.face);
        this.hover.add(this.hoverLines(ps.flatMap((q, i) => [...q, ...ps[(i + 1) % ps.length]!]), 1, colour));
      };
    } else if (hit && this.sampleNow) {
      // The sampler: the face whose texture a click takes.
      key = `s:${hit.object.id}:${hit.face}`;
      draw = () => this.hover.add(this.hoverFaces(Float32Array.from(this.trianglesOf(hit.object, [hit.face])), 0.35, HOVER));
    } else if (hit && (mode === 'object' || this.sculpting)) {
      const o = hit.object;
      const on = mode === 'object' && this.sel.objects.has(o.id);
      key = `o:${o.id}:${on}`;
      draw = () => {
        let tris = this.trisCache.get(o.id);
        if (!tris) { tris = Float32Array.from(this.trianglesOf(o, objectFaces(o))); this.trisCache.set(o.id, tris); }
        this.hover.add(this.hoverFaces(tris, on ? 0.35 : 0.25, on ? HOVER_SELECTED : HOVER));
        const outline = this.featureEdges(o, objectFaces(o));
        if (outline) this.hover.add(this.thickLines(outline, on ? HOVER_SELECTED : HOVER, OUTLINE_PX));
      };
    } else if (hit && mode === 'face') {
      const on = chosen(hit.object.id, hit.face);
      key = `f:${hit.object.id}:${hit.face}:${on}`;
      draw = () => {
        this.hover.add(this.hoverFaces(Float32Array.from(this.trianglesOf(hit.object, [hit.face])), on ? 0.55 : 0.35, on ? HOVER_SELECTED : HOVER));
        // Its outline too, so a face over a selected one still reads as one face.
        const ps = facePoints(hit.object.mesh, hit.face);
        this.hover.add(this.hoverLines(ps.flatMap((q, i) => [...q, ...ps[(i + 1) % ps.length]!]), 1, on ? HOVER_SELECTED : HOVER));
      };
    } else if (mode === 'point' || mode === 'edge') {
      // As a level editor shows a mesh in its vertex and edge tools: the object under the pointer (or the one its nearest point or
      // edge is on) drawn with its edges and, in point mode, a square handle on every point; the one a click takes lit.
      const near = this.screenNearest(new Vector2(at.x, at.y), hit?.object ?? null);
      const shown = near?.object ?? hit?.object ?? null;
      const on = !!near && chosen(near.object.id, near.item);
      key = `${mode}:${shown?.id ?? '-'}:${near?.item ?? '-'}:${on}`;
      draw = () => {
        if (!shown) return;
        // Point mode: a handle on every point of the object (hidden where the geometry stands in front); edge mode: the
        // one edge alone (the owner, 2026-11-14: no other edges lit).
        if (mode === 'point') this.hover.add(this.handles(this.cageOf(shown).points, HANDLE_PX, HOVER, true));
        if (!near) return;
        if (mode === 'point') this.hover.add(this.handles(vertPos(near.object.mesh, near.item as number), on ? HANDLE_PX + 8 : HANDLE_PX + 6, on ? HOVER_SELECTED : HOVER, true));
        else {
          const [a, b] = edgeOfKey(near.item as string);
          this.hover.add(this.edgeHighlight([...vertPos(near.object.mesh, a), ...vertPos(near.object.mesh, b)], on ? HOVER_SELECTED : HOVER));
        }
      };
    }
    if (key === this.hoverKey) return;
    this.hoverKey = key;
    this.clearHover();
    draw?.();
  }

  /**
   * The selection's own axes, as a level editor's local space: a face selection's mean normal up and its first edge across; an
   * edge along itself, up its faces' mean normal; points up their faces' mean normal; an object its own (`GeoObject.basis`).
   */
  private localFrame(): Quaternion {
    const q = new Quaternion();
    const geo = this.geo;
    const first = [...this.sel.objects].map((id) => this.objectById(id)).find((o): o is GeoObject => !!o);
    if (!geo || !first) return q;
    if (this.sel.mode === 'object') return first.basis ? q.setFromRotationMatrix(new Matrix4().fromArray(first.basis)) : q;
    const m = first.mesh;
    const items = [...(this.sel.items.get(first.id) ?? [])];
    let up: Vec3 = [0, 0, 0];
    let across: Vec3 | null = null;
    const addN = (f: number): void => { const n = faceNormal(m, f); up = [up[0] + n[0], up[1] + n[1], up[2] + n[2]]; };
    if (this.sel.mode === 'face') {
      for (const f of items as number[]) if (m.faces[f]) addN(f);
      const f0 = (items as number[]).find((f) => m.faces[f]);
      if (f0 !== undefined) { const ps = facePoints(m, f0); across = [ps[1]![0] - ps[0]![0], ps[1]![1] - ps[0]![1], ps[1]![2] - ps[0]![2]]; }
    } else {
      const verts = new Set(this.sel.mode === 'point' ? items as number[] : (items as string[]).flatMap((k) => edgeOfKey(k)));
      for (const f of objectFaces(first)) if (faceVerts(m, f).some((v) => verts.has(v))) addN(f);
      if (this.sel.mode === 'edge' && items.length) {
        const [a, b] = edgeOfKey(items[0] as string);
        const pa = vertPos(m, a), pb = vertPos(m, b);
        across = [pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]];
      }
    }
    const Y = new Vector3(...up);
    if (Y.lengthSq() < 1e-12) return q;
    Y.normalize();
    const X = across ? new Vector3(...across) : new Vector3(1, 0, 0);
    X.addScaledVector(Y, -X.dot(Y));
    if (X.lengthSq() < 1e-12) X.set(0, 0, 1).addScaledVector(Y, -Y.z);
    X.normalize();
    // An edge's own direction is the gizmo's X; Y up its faces; Z completes them right-handed.
    const Z = new Vector3().crossVectors(X, Y);
    return q.setFromRotationMatrix(new Matrix4().makeBasis(X, Y, Z));
  }

  /**
   * Square handles on points, as a level editor draws a mesh's vertices: a small cube each, kept `px` pixels across on screen
   * (`frameHandles`). The renderer draws `Points` a pixel wide whatever their size, so handles are meshes.
   */
  private handles(points: ArrayLike<number>, px: number, color: number, depth: boolean): InstancedMesh {
    const n = points.length / 3;
    const mesh = new InstancedMesh(HANDLE_GEOMETRY, new MeshBasicMaterial({ color, depthTest: depth, transparent: !depth }), Math.max(1, n));
    mesh.count = n;
    mesh.frustumCulled = false;
    mesh.renderOrder = depth ? 11 : 13;
    mesh.userData['handles'] = { px, points: Float32Array.from(points) };
    this.clouds.add(mesh);
    this.sizeHandles(mesh);
    return mesh;
  }

  /** Each handle sized for the camera now: `px` pixels at its own range (a perspective view), or the view's scale (orthographic). */
  private sizeHandles(mesh: InstancedMesh): void {
    const { px, points } = mesh.userData['handles'] as { px: number; points: Float32Array };
    const cam = this.deps.camera();
    const h = Math.max(1, this.deps.input.clientHeight);
    const at = new Vector3(), s = new Vector3(), m = new Matrix4(), q = new Quaternion();
    const camPos = new Vector3().setFromMatrixPosition(cam.matrixWorld);
    for (let i = 0; i < mesh.count; i++) {
      at.set(points[i * 3]!, points[i * 3 + 1]!, points[i * 3 + 2]!);
      let perPx: number;
      if (cam instanceof PerspectiveCamera) perPx = (2 * at.distanceTo(camPos) * Math.tan((cam.fov * Math.PI) / 360)) / h;
      else if (cam instanceof OrthographicCamera) perPx = (cam.top - cam.bottom) / cam.zoom / h;
      else perPx = 0.01;
      s.setScalar(perPx * px);
      mesh.setMatrixAt(i, m.compose(at, q, s));
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  /** Every frame: the handles still drawn kept their size on screen as the camera moves. */
  private frameHandles(): void {
    for (const mesh of this.clouds) {
      if (!mesh.parent) { this.clouds.delete(mesh); continue; }
      this.sizeHandles(mesh);
    }
  }

  /** An object's edges and points as drawable arrays, kept until the geometry changes (`trisCache`'s life). */
  private readonly cageCache = new Map<string, Cage>();
  private cageOf(o: GeoObject): Cage {
    let c = this.cageCache.get(o.id);
    if (c) return c;
    const em = edgeMap(o.mesh, objectFaces(o));
    const edges: number[] = [], edgeKeys: string[] = [];
    for (const [k, e] of em) { edges.push(...vertPos(o.mesh, e.a), ...vertPos(o.mesh, e.b)); edgeKeys.push(k); }
    const verts = [...new Set(objectFaces(o).flatMap((f) => faceVerts(o.mesh, f)))];
    c = { edges: Float32Array.from(edges), points: Float32Array.from(verts.flatMap((v) => vertPos(o.mesh, v))), verts, edgeKeys };
    this.cageCache.set(o.id, c);
    return c;
  }

  /**
   * The point (point mode) or edge (edge mode) nearest the pointer on screen, within `PICK_PX` pixels, among the object
   * under the pointer and the objects with something selected: a level editor's screen-space pick, so a point is taken from
   * near it, not only from the face it stands on.
   */
  private screenNearest(ndc: Vector2, under: GeoObject | null): { object: GeoObject; item: number | string } | null {
    if (!this.geo) return null;
    const cam = this.deps.camera();
    const r = this.deps.input.getBoundingClientRect();
    const toPx = (x: number, y: number, z: number): [number, number] | null => {
      const v = new Vector3(x, y, z).project(cam);
      return v.z > 1 || v.z < -1 ? null : [((v.x - ndc.x) * r.width) / 2, ((v.y - ndc.y) * r.height) / 2];
    };
    // The objects under the pointer's reach too, not only under its one pixel: on an object's outline the pixel itself
    // can fall on what stands behind it (the floor beyond a box's corner), and the outline's edge would never be taken.
    const around: (GeoObject | null)[] = [];
    for (const [dx, dy] of [[PICK_PX, 0], [-PICK_PX, 0], [0, PICK_PX], [0, -PICK_PX]] as const) {
      const at = new Vector2(ndc.x + (2 * dx) / r.width, ndc.y + (2 * dy) / r.height);
      around.push(pickFace(this.geo, this.rayAt(at, cam), this.index)?.object ?? null);
    }
    const objects = [...new Set([under, ...around, ...[...this.sel.objects].map((id) => this.objectById(id))].filter((o): o is GeoObject => !!o))];
    // Every point or edge within reach, nearest first; then the first the camera sees (the occluded-pick fix: a point or
    // an edge behind a wall is neither hovered nor taken). An edge is seen when any of three points along it is.
    const found: { object: GeoObject; item: number | string; d: number; at: Vec3[] }[] = [];
    for (const o of objects) {
      const cage = this.cageOf(o);
      if (this.sel.mode === 'point') {
        for (let i = 0; i < cage.verts.length; i++) {
          const q = toPx(cage.points[i * 3]!, cage.points[i * 3 + 1]!, cage.points[i * 3 + 2]!);
          if (!q) continue;
          const d = Math.hypot(q[0], q[1]);
          if (d <= PICK_PX) found.push({ object: o, item: cage.verts[i]!, d, at: [[cage.points[i * 3]!, cage.points[i * 3 + 1]!, cage.points[i * 3 + 2]!]] });
        }
      } else {
        for (let i = 0; i < cage.edgeKeys.length; i++) {
          const e = cage.edges;
          const a = toPx(e[i * 6]!, e[i * 6 + 1]!, e[i * 6 + 2]!), b = toPx(e[i * 6 + 3]!, e[i * 6 + 4]!, e[i * 6 + 5]!);
          if (!a || !b) continue;
          const ax = b[0] - a[0], ay = b[1] - a[1];
          const t = Math.max(0, Math.min(1, -(a[0] * ax + a[1] * ay) / Math.max(1e-9, ax * ax + ay * ay)));
          const d = Math.hypot(a[0] + ax * t, a[1] + ay * t);
          if (d > PICK_PX) continue;
          const pa: Vec3 = [e[i * 6]!, e[i * 6 + 1]!, e[i * 6 + 2]!], pb: Vec3 = [e[i * 6 + 3]!, e[i * 6 + 4]!, e[i * 6 + 5]!];
          const along = (s: number): Vec3 => [pa[0] + (pb[0] - pa[0]) * s, pa[1] + (pb[1] - pa[1]) * s, pa[2] + (pb[2] - pa[2]) * s];
          found.push({ object: o, item: cage.edgeKeys[i]!, d, at: [along(t), along(0.25), along(0.75)] });
        }
      }
    }
    found.sort((x, y) => x.d - y.d);
    const eye = new Vector3().setFromMatrixPosition(cam.matrixWorld).toArray();
    for (const f of found.slice(0, VISIBLE_TESTS_MAX)) {
      if (!this.index || f.at.some((p) => this.index!.visible(eye, p))) return { object: f.object, item: f.item };
    }
    return null;
  }

  /** A click in point or edge mode: the screen's nearest taken (added, or flipped with `toggle`); a miss without it clears. */
  private pickOnScreen(ndc: Vector2, under: GeoObject | null, op: PickOp): void {
    const near = this.screenNearest(ndc, under);
    if (op === 'only') { this.sel.objects.clear(); this.sel.items.clear(); }
    if (!near) { this.lastEdgePick = null; return; }
    this.lastEdgePick = this.sel.mode === 'edge' ? { id: near.object.id, key: near.item as string } : null;
    let set = this.sel.items.get(near.object.id);
    if (!set) { set = new Set(); this.sel.items.set(near.object.id, set); }
    this.sel.objects.add(near.object.id);
    if (op === 'toggle' && set.has(near.item)) set.delete(near.item); else set.add(near.item);
  }

  /**
   * Edges lit (a hover's, a selection's) hidden behind the geometry as the Wireframe is: its depth offset through its own
   * wireframe path (each edge a-b a triangle a-b-a), in `color` -- not drawn over walls (the occluded-pick fix).
   */
  private edgeHighlight(pairs: number[], color: number): Object3D {
    return this.thickLines(pairs, color, EDGE_PX);
  }

  /**
   * Line segments `pairs` (xyz xyz each), `px` CSS pixels wide whatever the range (`Line2NodeMaterial`, screen space),
   * drawn over the geometry (`depth` false) so a hovered or selected line is never lost in it.
   */
  private thickLines(pairs: ArrayLike<number>, color: number, px: number, depth = false, opacity = 1): Object3D {
    const g = new LineSegmentsGeometry();
    g.setPositions(Float32Array.from(pairs));
    const m = new Line2NodeMaterial({ color, linewidth: px, worldUnits: false, transparent: true, opacity, depthTest: depth, depthWrite: false });
    const l = new LineSegments2(g, m);
    l.frustumCulled = false;
    l.renderOrder = 12;
    return l;
  }

  /**
   * An object's outline: the edges of `faces` that bound them (one face) or turn a corner (their two faces' normals more
   * than 20 degrees apart) -- a box's twelve, a wall's frame -- or null past `OUTLINE_EDGES_MAX` (a terrain's).
   */
  private featureEdges(o: GeoObject, faces: readonly number[]): number[] | null {
    const m = o.mesh;
    const edges = edgeMap(m, faces);
    if (edges.size > OUTLINE_EDGES_MAX * 4) return null;
    const out: number[] = [];
    let n = 0;
    for (const e of edges.values()) {
      if (e.faces.length === 2) {
        const a = faceNormal(m, e.faces[0]!), b = faceNormal(m, e.faces[1]!);
        if (a[0] * b[0] + a[1] * b[1] + a[2] * b[2] > 0.94) continue;
      }
      if (++n > OUTLINE_EDGES_MAX) return null;
      out.push(...vertPos(m, e.a), ...vertPos(m, e.b));
    }
    return out.length ? out : null;
  }

  private hoverFaces(positions: Float32Array, opacity: number, color = HOVER): Mesh {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(positions, 3));
    const m = new Mesh(g, new MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, side: 2 }));
    m.renderOrder = 11;
    return m;
  }

  /** `depth`: hidden behind the geometry (an object's cage), else drawn over all (the one edge a click takes). */
  private hoverLines(positions: ArrayLike<number>, opacity: number, color = HOVER, depth = false): Object3D {
    return this.thickLines(positions, color, OUTLINE_PX, depth, opacity);
  }

  /** Square handles (`PointsMaterial` draws a square a point); `depth` as `hoverLines`'. */
  private hoverPoints(p: ArrayLike<number>, size: number, color = HOVER, depth = false): Points {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(Float32Array.from(p), 3));
    const pts = new Points(g, new PointsMaterial({ color, size, sizeAttenuation: false, depthTest: depth, transparent: true }));
    pts.renderOrder = 12;
    return pts;
  }

  private onPointerUp(e: PointerEvent): void {
    if (!this.active) return;
    if (this.block && this.block.phase === 'base' && this.block.pointerId === e.pointerId) { this.blockUp(e); return; }
    if (this.handleDrag && this.handleDrag.pointerId === e.pointerId) { this.handleUp(e); return; }
    if (this.stroke && this.stroke.pointerId === e.pointerId) { this.endStroke(); return; }
    const press = this.press;
    if (press && press.pointerId === e.pointerId && e.button === 0) {
      this.press = null;
      if (press.painting) this.drawSelection();
      else this.clickPick(press.ndc, press.ctrl ? 'toggle' : press.shift ? 'add' : 'only');   // Ctrl toggles, Shift adds
      return;
    }
    if (!this.gizmo.dragging) return;
    const n = this.ndc(e);
    this.drive.pointerUp({ x: n.x, y: n.y, button: 0 });
  }

  private onKey(e: KeyboardEvent): void {
    if (!this.active || scrubbing(this.deps.doc)) return;     // a Transform field's drag: its keys are its own (`../scrub`)
    // A field being typed in keeps its keys; a box or a button (the mode's own Props, its tools) does not.
    const t = e.target as HTMLElement | null;
    const typing = !!t && (t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable
      || (t.tagName === 'INPUT' && !['checkbox', 'radio', 'button', 'range'].includes((t as HTMLInputElement).type)));
    if (typing) return;
    // As the page's own keys (`../keys` `FLY_LETTERS`): while the camera navigates, W A S D Q E R F Z C fly it.
    if (this.deps.navigating() && FLY_CODES.has(e.code)) return;
    const k = e.key.toLowerCase();
    const mod = e.ctrlKey || e.metaKey;
    // The block tool: Esc lets a shape half-made go (then the tool itself); Enter makes the shape being pulled.
    // Create's Polygon: Esc lets the outline go (then the tool), Enter closes it (then makes it), Backspace takes a point back.
    if (this.knifeOn && k === 'v' && !mod && !e.altKey && !e.shiftKey) {
      this.knifeLoop = !this.knifeLoop;
      this.deps.say(this.knifeLoop ? 'Knife loop mode: point at an edge to see the loop through it, click to cut it (V: back to points)' : 'Knife: points mode (V: loop mode)');
      this.drawKnife(); this.stop(e); return;
    }
    if (this.knifeOn && k === 'enter') { this.knifeApply(); this.stop(e); return; }
    if (this.knifeOn && k === 'backspace') { this.knifePts.pop(); this.drawKnife(); this.stop(e); return; }
    if (this.knifeOn && k === 'escape') { if (this.knifePts.length) { this.knifePts = []; this.drawKnife(); } else this.setKnife(false); this.stop(e); return; }
    if (k === 'escape' && this.poly) { this.polyCancel(); this.stop(e); return; }
    if (k === 'escape' && (this.block || this.blockOn)) { if (this.block) this.blockCancel(); else this.setBlockOn(false); this.stop(e); return; }
    if (k === 'enter' && this.poly) { if (this.poly.phase === 'points') this.polyClose(); else this.polyCommit(); this.stop(e); return; }
    if (k === 'backspace' && this.poly?.phase === 'points') { this.polyBack(); this.stop(e); return; }
    if (k === 'enter' && this.block?.phase === 'height') { this.blockCommit(); this.stop(e); return; }
    // The modes on the number keys by their place (`Digit1`..`Digit4`, as the page's tools read them), Shift or not; the
    // other number keys are nothing here, so never the page's placing tools (`../keys` `GEOMETRY_SHARED`).
    const digit = /^Digit([0-9])$/.exec(e.code);
    if (digit && !mod && !e.altKey) {
      const mode = MODES.find((m) => m.key === digit[1]);
      if (mode && !e.shiftKey) this.setMode(mode.mode);
      this.stop(e);
      return;
    }
    // Copy, Cut, Paste and Duplicate (Ctrl+C / X / V / D): the geometry's own in this mode (`command`); the page leaves
    // them to it (`../keys` `GEOMETRY_SHARED`), so none does two things.
    const chord = mod && !e.altKey && !e.shiftKey ? CHORD_COMMANDS[e.code] : undefined;
    if (chord) { if (!e.repeat) this.command(chord); this.stop(e); return; }
    // Ctrl+G: Select Ribs, the reference editor's, in Edge mode.
    if (mod && e.code === 'KeyG' && !e.altKey && !e.shiftKey && !this.textureOn && this.sel.mode === 'edge') {
      if (!e.repeat) this.selectRibs();
      this.stop(e);
      return;
    }
    // Ctrl+B: Snap to Grid, the reference editor's, in Point, Edge and Face mode.
    if (mod && e.code === 'KeyB' && !e.altKey && !e.shiftKey && !this.textureOn) {
      if (!e.repeat && this.sel.mode !== 'object') { const why = this.toolBlocked('snapgrid'); if (why) this.deps.say(`Snap to Grid: ${why}`, true); else this.snapToGrid(); }
      this.stop(e);
      return;
    }
    // Ctrl+Z and Ctrl+Y are the page's: its one history holds the geometry's steps too (bug 20).
    if (mod) return;
    // The tools' own keys, as the reference editor binds them (the owner, 2026-11-19), where the page has no use for the
    // key: C the Knife, L loop and G ring select and B Bridge in Edge mode, Alt+F Bevel, Shift+I Inset, Alt+N Separate,
    // Alt+B Bridge. (F, V, P, M and H stay the page's: frame, walk, play, menu, docks.)
    if (!this.textureOn && !e.repeat) {
      const tool = this.toolKey(e);
      if (tool) {
        const why = EDIT_TOOL_MODES[tool]?.includes(this.sel.mode) ? this.toolBlocked(tool) : `not in ${modeWord(this.sel.mode)} mode`;
        if (why !== null && tool !== 'knife') this.deps.say(`${this.buttons.get(tool)?.dataset['title']?.split(':')[0] ?? tool}: ${why}`, true);
        else this.buttons.get(tool)?.click();
        this.stop(e);
        return;
      }
    }
    // W / E / R and Q are the page's (its gizmo's mode and space), which it hands on here (`syncGizmo`).
    // A level editor's keys: Delete removes (a hole where faces went), Backspace dissolves (the faces round it merge).
    if ((k === 'delete' || k === 'backspace') && this.textureOn) { this.stop(e); }   // the Texture layer edits no shape
    else if (k === 'delete') { this.deleteSelection(); this.stop(e); }
    else if (k === 'backspace') { this.dissolveSelection(); this.stop(e); }
    else if (k === 'escape' && this.tool !== 'select') { this.setTool('select'); this.stop(e); }   // Paint or Sample: back to Select
    else if (k === 'escape' && !this.deps.doc.pointerLockElement) {
      // Esc steps back one thing at a time: a tool (above), then the selection, then -- nothing selected, no tool -- out of
      // Point, Edge or Face mode to Object mode (the owner, 2026-11-19: "nothing is selected and no tool is selected,
      // pressing esc should make us go to geometry object mode").
      const empty = [...this.sel.items.values()].every((s) => s.size === 0) && (this.sel.mode !== 'object' || this.sel.objects.size === 0);
      if (empty && this.sel.mode !== 'object') this.setMode('object');
      else { this.sel = emptySelection(this.sel.mode); this.drawSelection(); }
      this.stop(e);
    }
  }

  /** The Edit tool a key chooses in the current mode (`onKey`), or null. */
  private toolKey(e: KeyboardEvent): string | null {
    const m = this.sel.mode, c = e.code, alt = e.altKey, shift = e.shiftKey;
    if (c === 'NumpadAdd' && !alt && !shift && m !== 'object') return 'grow';
    if (c === 'NumpadSubtract' && !alt && !shift && m !== 'object') return 'shrink';
    if (c === 'KeyC' && !alt && !shift && m !== 'object') return 'knife';
    if (c === 'KeyL' && !alt && !shift && m === 'edge') return 'loop';
    if (c === 'KeyG' && !alt && !shift && m === 'edge') return 'ring';
    if (c === 'KeyG' && !alt && !shift && m === 'face') return 'thicken';
    if (c === 'KeyB' && !shift && !alt && m === 'point') return 'snapvert';
    if (c === 'KeyB' && !shift && (m === 'edge' || (alt && m === 'face'))) return 'bridge';
    if (c === 'KeyI' && !shift && !alt && m === 'edge') return 'snapedge';
    if (c === 'KeyO' && shift && !alt && (m === 'edge' || m === 'face')) return 'collapse';
    if (c === 'KeyN' && !shift && !alt && m === 'edge') return 'extend';
    if (c === 'KeyF' && alt && !shift && m === 'edge') return 'bevel';
    if (c === 'KeyI' && shift && !alt && m === 'face') return 'inset';
    if (c === 'KeyN' && alt && !shift && m === 'face') return 'separate';
    return null;
  }

  private stop(e: KeyboardEvent): void {
    e.preventDefault();
    e.stopImmediatePropagation();
  }
}

export type { Vector3 };

/**
 * An Edit tool's setting (the owner, 2026-11-19: "for each tool can you add parameteric values we can change ...
 * similar [to] the create objects ... in real time"): a number, starting at `value` -- or at the grid step times `grid`
 * (a metre with no grid), or a metre times `metre` -- in [`min`, `max`] by `step`.
 */
/** `options`: a choice, its value the option's index; `when`: shown only while another setting has that value. */
interface ToolSetting { key: string; label: string; min: number; max: number; step: number; note: string; unit?: 'u'; value?: number; grid?: number; metre?: number; options?: readonly string[]; when?: { key: string; is: number } }
/** Each parametric Edit tool's settings (a browser adaptation, FG.R2; the reference editor's tool panels' values). */
const TOOL_SETTINGS: Readonly<Record<string, readonly ToolSetting[]>> = {
  bevel: [
    { key: 'width', label: 'Width', min: 0.01, max: 10000, step: 0.25, unit: 'u', grid: 1, note: 'How far the bevel reaches from the edge, along each face (held under half their edges)' },
    { key: 'segments', label: 'Segments', min: 1, max: 16, step: 1, value: 1, note: 'Faces across each bevel: 1 a flat chamfer, more a curve' },
    { key: 'shape', label: 'Shape', min: 0, max: 1, step: 0.05, value: 1, note: 'With more than one segment: 0 straight across, 1 a round curve into the corner' },
  ],
  inset: [
    { key: 'amount', label: 'Amount', min: 0.01, max: 10000, step: 0.25, unit: 'u', grid: 1, note: 'How far the faces shrink in (held under half their border\'s shortest edge)' },
    { key: 'steps', label: 'Steps', min: 1, max: 8, step: 1, value: 1, note: 'Rings between the old outline and the new, the amount shared evenly' },
  ],
  extrude: [
    { key: 'distance', label: 'Distance', min: 0.01, max: 10000, step: 0.25, unit: 'u', metre: 1, note: 'How far the faces are pulled out along their normal' },
  ],
  subdivide: [
    { key: 'cutsX', label: 'Cuts X', min: 0, max: 16, step: 1, value: 1, note: 'Cuts across the face\'s first and third sides' },
    { key: 'cutsY', label: 'Cuts Y', min: 0, max: 16, step: 1, value: 1, note: 'Cuts across its second and fourth sides' },
  ],
  subdivideEdges: [
    { key: 'cuts', label: 'Cuts', min: 1, max: 16, step: 1, value: 1, note: 'New points along each edge, evenly spaced' },
  ],
  loopcut: [
    { key: 'cuts', label: 'Cuts', min: 1, max: 16, step: 1, value: 1, note: 'New loops across the ring, evenly spaced' },
  ],
  thicken: [
    { key: 'amount', label: 'Amount', min: 0.01, max: 10000, step: 0.25, unit: 'u', grid: 1, note: 'How thick: the back this far behind the faces' },
  ],
  extend: [
    { key: 'amount', label: 'Amount', min: 0.01, max: 10000, step: 0.25, unit: 'u', grid: 1, note: 'How far out the new edges go, in the plane of each edge\u2019s face' },
  ],
  merge: [
    { key: 'range', label: 'Range', min: 0, max: 2, step: 1, value: 0, options: ['Everything', 'Grid', 'Fixed'], note: 'Which selected points merge: all of them into one, those within the grid step of each other, or those within Distance' },
    { key: 'distance', label: 'Distance', min: 0.01, max: 10000, step: 0.1, unit: 'u', value: 0.1, when: { key: 'range', is: 2 }, note: 'With Range Fixed: points nearer each other than this merge' },
  ],
  bridge: [
    { key: 'segments', label: 'Segments', min: 1, max: 16, step: 1, value: 1, note: 'Rings along a bridge between two faces' },
  ],
};
/** Where the Edit tools' settings are kept in this browser (a browser adaptation, FG.R2: a viewer's own preference). */
const TOOL_SETTINGS_KEY = 's2u-forge-tool-settings';
function readToolSettings(): Record<string, Record<string, number>> {
  try {
    const raw = JSON.parse(globalThis.localStorage?.getItem(TOOL_SETTINGS_KEY) ?? 'null') as unknown;
    return raw && typeof raw === 'object' ? raw as Record<string, Record<string, number>> : {};
  } catch { return {}; }
}
function writeToolSettings(all: Record<string, Record<string, number>>): void {
  try { globalThis.localStorage?.setItem(TOOL_SETTINGS_KEY, JSON.stringify(all)); } catch { /* this visit's alone */ }
}

/** Where Create's shape settings are kept in this browser (a browser adaptation, FG.R2: a viewer's own preference). */
const SHAPE_SETTINGS_KEY = 's2u-forge-shape-settings';
/** The kept shape settings (none where the storage is shut or the record unreadable); `shapeSettings` checks each on use. */
function readShapeSettings(): Partial<Record<BlockShape, ShapeSettings>> {
  try {
    const raw = JSON.parse(globalThis.localStorage?.getItem(SHAPE_SETTINGS_KEY) ?? 'null') as unknown;
    return raw && typeof raw === 'object' ? raw as Partial<Record<BlockShape, ShapeSettings>> : {};
  } catch { return {}; }
}
function writeShapeSettings(all: Partial<Record<BlockShape, ShapeSettings>>): void {
  try { globalThis.localStorage?.setItem(SHAPE_SETTINGS_KEY, JSON.stringify(all)); } catch { /* this visit's alone */ }
}

/** The own collision a copy carries (`copyWithHull`) until it is made (`addCopy`): a copy's, by the copy, gone with it. */
const copyHulls = new WeakMap<GeoObjectCopy, EditMesh>();
