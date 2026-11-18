import { scrubbing } from '../scrub';
import { brushCursor, hexOf, sampleCursor } from '../paintCursor';
import { PaintToolBar, type PaintTool } from '../paintTools';
import { blockShapeIcon } from './blockShapeIcons';
import {
  Box3, BoxGeometry, BufferAttribute, BufferGeometry, Color, DataTexture, DoubleSide, Euler, Group, RepeatWrapping, RGBAFormat, InstancedMesh, InterleavedBufferAttribute, LineBasicMaterial, LineSegments, Matrix4, Mesh, MeshBasicMaterial, Object3D,
  OrthographicCamera, PerspectiveCamera, Points, PointsMaterial, Quaternion, Raycaster, Vector2, Vector3, type Camera, type Scene,
} from 'three';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { vec4 } from 'three/tsl';
import { Line2NodeMaterial, MeshBasicNodeMaterial } from 'three/webgpu';
import { LineSegments2 } from 'three/examples/jsm/lines/webgpu/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import type { LoadedMap, LoadedMesh } from '../../loadMap';
import type { GroundData } from '../../mover';
import { buildWorld, type WorldView } from '../../world';
import { commonGroundSurface, FLOOR_NORMAL_Y_MIN, floorWordsOf, wallWordsOf } from './collision';
import { displacementGrid, makeDisplacement, sculpt } from './displacement';
import { add, cloneMesh, cross, dot, edgeMap, edgeOfKey, faceNormal, normalize, scale, sub, facePoints, faceVerts, liveFaces, polygonNormal, triangulate, vertPos, type EditMesh, type TextureMapping, type Vec3 } from './editMesh';
import { buildHullWith, CLIMB_FLAG_DEFAULT, CLIMB_FLAGS, LADDER_CLIMB_FLAG, climbFlagOf, COLLISION_TYPES, collisionTypeOf, followersOf, hullGeometryOf, moveFollower, twinIndexOf, withCollisionType, withTwins, wordsOf, type CollisionType } from './hullGeometry';
import { HULL_COLOURS, type HullViewPoly } from '../hull';
import { deleteEdges, deleteFaces, deleteVerts, dissolveEdges, dissolveFaces, dissolveVerts, extrudeFaces, flipFaces, snapVerts, transformVerts } from './ops';
import { box, cylinder, plane, sphere, UNTEXTURED_FLOOR_COLOR_ADAPTATION, type PrimitiveOptions } from './primitives';
import { rayOnWorkplane, workplaneFrame, type Workplane } from '../mapGrid';
import { BLOCK_PREVIEW_SIZE_ADAPTATION, BLOCK_SHAPE_GROUPS, BLOCK_SHAPES, cleanOutline, outlineCrosses, polygonMesh, SHAPE_SETTINGS, shapeSettings, type ShapeSetting, type ShapeSettings, blockKind, blockMakes, blockMesh, blockParts, frameToWorld, stairsRampMesh, stairsRun, worldToFrame, type BlockFrame, type BlockShape } from './blockShapes';
import { convertSelection, emptySelection, pick, pickFace, PickIndex, selectedFaces, selectionCentre, selectionVerts, type PickOp, type Ray, type SelectMode, type Selection } from './selection';
import type { DrawSources } from './worldMesh';
import type { FloorLook } from './blank';
import type { Surface } from './collision';
import { adjustMapping, align, alignToView, applyTexture, justify, medianTexelScale, pasteLook, refreshUvs, sampleFace, textureState, worldAligned, type FaceLook, type Justify, type MappingChange, type TextureSize, type TextureState } from './texturing';
import {
  addObject, buildHull, cloneGeometry, compileDraws, duplicateObject, facesCopy, geometryOfMap, inPlaceCopy, markReshaped, mul4, objectCopy, objectFaces, removeObject, separateFaces, transformObject, worldSectionsOf,
  type GeoObjectCopy,
  type GeoObject, type WorldGeometry,
} from './world';
import type { SavedWorld } from './geometryFile';

/**
 * The Forge's geometry mode (a browser adaptation, FG.R2; the owner, 2026-11-14: "a full on hammer like geometry editing
 * tool"). Over a disc map's base it edits the map's world as `./world` holds it: object, point, edge and face modes,
 * the gizmo moving what is selected, primitives, extrude, delete, separate, flip, Hammer's texturing and displacement.
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
  onEdit: (label: string) => void;
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
 * vertex everywhere where we used point"; Hammer's word), its code name `point` kept.
 */
const MODES: { mode: SelectMode; label: string; plural: string; key: string }[] = [
  { mode: 'object', label: 'Object', plural: 'objects', key: '1' }, { mode: 'point', label: 'Vertex', plural: 'vertices', key: '2' },
  { mode: 'edge', label: 'Edge', plural: 'edges', key: '3' }, { mode: 'face', label: 'Face', plural: 'faces', key: '4' },
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
/** How near the outline's first point (CSS pixels) a Polygon click closes it (a browser adaptation, as Hammer's snap to it). */
const POLY_CLOSE_PX = 10;
/** A Texture State field's live drag redraws the world at most this often, milliseconds (a browser adaptation). */
const TEXTURE_PREVIEW_MS = 80;
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
/** A point's handle, CSS pixels across (a browser adaptation, after Hammer's vertex squares). */
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
   * The live drag (Hammer's: the faces bend as the gizmo moves): the drawn vertices and edge ends on a moving point, each
   * with where it stood, written each move into the buffers the view already has. Nothing is rebuilt until the release.
   */
  private live: { attr: BufferAttribute | InterleavedBufferAttribute; mesh: Mesh; at: number[]; base: number[] }[] = [];
  /** The viewport's World / Local (`syncGizmo`): Local turns the pivot onto the selection's own axes (`localFrame`). */
  private space: 'world' | 'local' = 'world';
  /** The handle clouds drawn, each resized every frame to a fixed size on screen (`frameHandles`). */
  private readonly clouds = new Set<InstancedMesh>();
  private dragCopy = false;
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
    deps.scene.add(this.edges, this.overlay, this.fixed, this.hover, this.pivot, this.strokeLayer);
    this.gizmo = new TransformControls(deps.camera(), deps.input);
    this.gizmo.disconnect();                                   // driven by the editor's own pointer handlers below
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
    deps.tools.append(
      (this.editGroup = group('Edit',
        this.button('extrude', 'Extrude', 'Extrude the selected faces (then move them with the gizmo)', () => this.extrude()),
        this.button('separate', 'Separate', 'Make the selected faces an object of their own', () => this.separate()),
        this.button('flip', 'Flip', 'Flip the selected faces', () => this.edit('Flip faces', () => this.forFaces((m, fs) => flipFaces(m, fs)))),
        this.button('dissolve', 'Dissolve', 'Dissolve the selection: vertices, edges or faces go and the faces round them merge, no hole (Backspace)', () => this.dissolveSelection()),
        this.button('delete', 'Delete', 'Delete the selection and the faces it is part of, leaving a hole (Delete)', () => this.deleteSelection()),
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
   * The box F frames in Geometry mode (Hammer's frame selection): every point the selection moves -- an object's all, a
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
   * which the page turns off while the mode is on, as Hammer's tools show a mesh's edges and never its triangulation.
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
  }
  /** Bounds for a whole-object move: where it began and the moved objects' box, at the drag's start. */
  private dragBounds: { from: Vector3; min: Vec3; max: Vec3 } | null = null;
  /**
   * Snap by Centre or Bounds (`snapBy`): the pivot moved so that, on each axis the gizmo moves along, the moved box's
   * middle (Centre) or its nearer edge to a grid line (Bounds, Hammer's: what is moved lines up by its edges) lands on it.
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
   * The block tool (Create's Block and its shape; the owner, 2026-11-17: "implement a Drag-out block tool on the grid ...
   * It should work very similar to the hammer source 2 tool"): while on, a press drags a rectangle out on the plane --
   * the workplane, shown, on its grid while the snap is on; else the surface pressed on, by its normal, unsnapped -- the
   * release then pulls the height along the plane's normal until a click (or Enter) makes the shape. Esc cancels.
   */
  private blockOn = false;
  /**
   * The last height a shape was pulled to (Create's, Polygon's), this session: a shape made in a view that looks along
   * its plane's normal (an orthographic view's: no height to read off the pointer) takes it, else one snap step (the
   * owner, 2026-11-17: "in top/left/bottom/front ... I can't set the extrude height"; a browser adaptation, as Hammer's 2D
   * views keep the last depth).
   */
  private lastPull: number | null = null;
  /**
   * The Polygon tool (the owner, 2026-11-17: "add the polygon tool similar to how hammer does it in geometry mode. This
   * allows me to create custom shapes by drawing them line by line"; a browser adaptation, after Source 2 Hammer's): on,
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
   * sections"; Hammer's Outliner lists every object): the map's own world sections (`kind` 'world'), then the objects
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
    // A blank base (bug 17): its floor a plane of its own, as a new map in Hammer starts from what is made in it.
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
    if (change() === false) return;
    if (!opts.shapeKept) this.twinIndex = null;                 // the shape may have changed: its twins read again
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
    this.buildSoon();
    this.deps.onEdit(label);
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
    const map = this.deps.map();
    // An undo or a redo leaves the layer and the brush as they are (the owner, 2026-11-15: "every stroke is ctrl z"):
    // undoing the first collision edit stays on the Collision layer, painting, its hull as Build makes it from the step's
    // drawn geometry (no collision edits yet).
    const onCollision = this.collisionOn, brush = this.tool;
    this.collisionOutline = null;
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
    if (t === this.tool) { this.paintUi(); return; }
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
      // An object with points or edges selected keeps its cage and handles shown, as Hammer keeps a mesh's in its tools.
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
    for (const m of MODES) this.buttons.get(`mode-${m.mode}`)?.classList.toggle('is-on', this.sel.mode === m.mode);
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

  private setMode(mode: SelectMode): void {
    if (!this.geo) return;
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
   * Hammer's dissolve (Backspace): in point mode each point goes and the faces round it merge (a point on a straight run
   * just leaves its edge); in edge mode each edge's two faces merge; in face mode the selected faces that touch merge.
   * Object mode has nothing to dissolve: Backspace deletes, as Delete does.
   */
  private dissolveSelection(): void {
    if (!this.geo) return;
    if (this.sel.mode === 'object') { this.deleteSelection(); return; }
    let kept = 0, made = 0;
    const after = emptySelection(this.sel.mode === 'face' ? 'face' : this.sel.mode);
    this.edit('Dissolve', () => {
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
    const what = this.sel.mode === 'face' ? 'faces merged' : `${this.sel.mode === 'point' ? 'points' : 'edges'} dissolved`;
    if (kept) this.deps.say(`${what}; ${kept} on the border left (nothing to merge with)`, made === 0);
  }

  private extrude(): void {
    if (this.sel.mode !== 'face') { this.deps.say('Extrude works on faces: select them in Face mode', true); return; }
    const unit = 1 / (this.forMap?.metersPerUnit ?? 1);
    // The walls world-aligned (Hammer's new faces), at the extruded face's own texel scale where it has a mapping: each
    // wall's corners were its edge's, the same uv top and bottom, so its texture ran in stripes (the owner, 2026-11-17:
    // "When I extrude a face, there is no created geometry on the side walls"). The gizmo's move then keeps them mapped
    // (`transformVerts` rewrites a mapped face's uvs).
    this.edit('Extrude', () => this.forFaces((m, faces, o) => {
      const scaleOf = new Map(faces.map((f) => [f, m.faces[f]?.mapping?.scaleU ?? this.scaleTexel()] as const));
      const { walls } = extrudeFaces(m, faces, unit);
      const texel = Math.min(...scaleOf.values());
      for (const w of walls) { const face = m.faces[w]; if (face) face.mapping = worldAligned(faceNormal(m, w), texel); }
      refreshUvs(m, walls, this.size);
      markReshaped(o);
    }));
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
      this.sel = emptySelection('object');
      for (const p of made) this.sel.objects.add(p.id);
      return true;
    });
  }

  /**
   * Copy, Cut, Paste, Duplicate and Delete on the geometry (the owner, 2026-11-16: "implement copy/paste/cut/duplicate/
   * delete when in geometry mode ... on faces"), as Source 2 Hammer has them: they act on faces (Face mode) or whole
   * objects (Object mode). A vertex or an edge is part of the faces round it, not geometry of its own, so there is
   * nothing of it to copy -- Hammer copies none; Delete (a hole) and Backspace (dissolve) are what those modes have.
   * - Copy: the selected faces (or objects) to the clipboard, as they are now.
   * - Cut: Copy, then Delete -- one step.
   * - Paste: a new object made of each copied set, in place -- exactly where it was copied, so it moves off in the old
   *   one's plane -- and selected, so the gizmo moves it on.
   * - Duplicate: a copy in place, selected (Hammer's way: then drag it off).
   * A face set pasted or duplicated is an object of its own (Hammer's paste makes a new mesh): the faces it came from
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

  /** The block tool's shape (Hammer's Geometry Type), beside the Tool section while Block is on. */
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
      const f = { ...lb.frame, origin: frameToWorld(lb.frame, 0, lb.y[0], 0) };
      const a: [number, number] = [lb.x[0], lb.z[0]], b: [number, number] = [lb.x[1], lb.z[1]], h = lb.y[1] - lb.y[0];
      const settings = this.liveSettings.settings;
      this.drawOutline(this.outlineParts(shape, f, a, b, h, lb.run, settings));
      this.drawBlockSolid(this.shapeMesh(shape, f, a, b, h, { textureName: lb.textureName, size: this.size, scaleTexel: this.scaleTexel() }, lb.run, settings), lb.textureName);
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
    this.polyCancel();
    this.blockCancel();
    const was = this.blockOn;
    this.blockOn = on;
    if (was && !on) this.drawSelection();                      // Select again: the selection's gizmo back
    this.drawHover();                                          // Create on: the hover off; Select again: back under the pointer
    if (!on) this.drawBlockStart(null);
    this.syncBlockHandles();
    this.paintUi();
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
      this.sel = emptySelection('object');
      this.sel.objects.add(o.id);
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
      this.sel = emptySelection('object');
      this.sel.objects.add(o.id);
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
   * The sampler's click (Hammer's eyedropper, the Sample mode or a Shift+click while painting): what the face under `n` has -- its texture (and its look, which Apply lays), or on the Collision
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

  /* ---------- the Inspector's Texture State and Modify Texture (Hammer 2's face edit) ---------- */

  /**
   * The selected faces' Texture State (the owner, 2026-11-17: "add texturing the same way source hammer 2 does it. Align,
   * Scale, Shift, Rotate, Fit, Justify"; a browser adaptation): what they share, null where they differ; null off the
   * Texture layer or with nothing selected. The Inspector reads it whenever the selection or the geometry changes.
   */
  textureStateNow(): TextureState | null {
    if (!this.active || !this.textureOn) return null;
    const sets = this.selectedFaceSets();
    if (!sets.length) return null;
    const scaleTexel = this.scaleTexel();
    const parts = sets.map(({ o, faces }) => textureState(o.mesh, faces, this.size, scaleTexel));
    const pick = (k: keyof Omit<TextureState, 'count'>): number | null => {
      const v = parts[0]![k];
      return v !== null && parts.every((x) => x[k] !== null && Math.abs(x[k]! - v) < 1e-3) ? v : null;
    };
    return { count: parts.reduce((n, x) => n + x.count, 0), scaleU: pick('scaleU'), scaleV: pick('scaleV'), shiftU: pick('shiftU'), shiftV: pick('shiftV'), rotate: pick('rotate') };
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
    const was = this.texturePreview;
    if (change === null) {
      if (!was) return;
      this.texturePreview = null;
      if (this.texturePreviewTimer) { clearTimeout(this.texturePreviewTimer); this.texturePreviewTimer = null; }
      for (const { m, f, mapping, uvs } of was) {
        const face = m.faces[f];
        if (!face) continue;
        if (mapping) face.mapping = { ...mapping, u: [...mapping.u] as Vec3, v: [...mapping.v] as Vec3 }; else delete face.mapping;
        face.corners.forEach((c, k) => { const uv = uvs[k]; if (uv) { m.cUv[c * 2] = uv[0]; m.cUv[c * 2 + 1] = uv[1]; } });
      }
      this.redraw();
      return;
    }
    const sets = this.selectedFaceSets();
    if (!sets.length) return;
    if (!was) {
      // Each face as the drag found it, to put back: its mapping (or none) and its corners' UVs, by place (a corner split
      // off a neighbour keeps its place in the face, `ownCorners`).
      this.texturePreview = sets.flatMap(({ o, faces }) => faces.flatMap((f) => {
        const face = o.mesh.faces[f];
        if (!face) return [];
        const mp = face.mapping;
        return [{ m: o.mesh, f, mapping: mp ? { ...mp, u: [...mp.u] as Vec3, v: [...mp.v] as Vec3 } : undefined,
          uvs: face.corners.map((c) => [o.mesh.cUv[c * 2]!, o.mesh.cUv[c * 2 + 1]!] as [number, number]) }];
      }));
    }
    const scaleTexel = this.scaleTexel();
    for (const { o, faces } of sets) adjustMapping(o.mesh, faces, change, this.size, scaleTexel);
    // The world drawn again no more often than the preview's step: a big map's draws take a while to rebuild.
    const wait = TEXTURE_PREVIEW_MS - (performance.now() - this.texturePreviewAt);
    if (this.texturePreviewTimer) return;
    const run = (): void => { this.texturePreviewTimer = null; if (!this.texturePreview) return; this.texturePreviewAt = performance.now(); this.redraw(); };
    if (wait <= 0) run(); else this.texturePreviewTimer = setTimeout(run, wait);
  }
  /** The faces as a Texture State field's drag found them (`previewTexture`); null with none going on. */
  private texturePreview: { m: EditMesh; f: number; mapping: TextureMapping | undefined; uvs: [number, number][] }[] | null = null;
  private texturePreviewTimer: ReturnType<typeof setTimeout> | null = null;
  private texturePreviewAt = 0;

  /** Hammer's Align: to the world (the nearest axis plane), to the face's own plane, or to the view (upright as you look). */
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

  /** Hammer's Fit (`repeat` X by Y across) and Justify; `together` is "Treat as one": the selected faces one surface. */
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
    if (delta.equals(new Matrix4())) { this.endLive(true); this.drawSelection(); return; }   // no move: the preview goes
    this.endLive(false);
    if (this.sel.mode === 'object') { this.transformObjects(mat, copy); return; }
    if (copy && this.sel.mode === 'face') { this.copyFacesBy(mat); return; }
    // Bug 5: a move with the grid snap on puts each moved point on the grid, along the axes it moved (Hammer snaps vertices),
    // not just the selection's centre by a whole step.
    const step = this.gizmo.mode === 'translate' && this.snapBy === 'bounds' ? this.moveSnap() : null;
    const pure = [0, 1, 2, 4, 5, 6, 8, 9, 10].every((i, j) => Math.abs(mat[i]! - (j % 4 === 0 ? 1 : 0)) < 1e-9);
    const axes = [0, 1, 2].map((k) => Math.abs(mat[12 + k]!) > 1e-9);
    this.edit(`Transform ${modeWord(this.sel.mode, 2)}`, () => {
      for (const id of this.sel.objects) {
        const o = this.objectById(id);
        if (!o) continue;
        const vs = selectionVerts(this.sel, o);
        transformVerts(o.mesh, vs, mat, { textureLock: true, size: this.size });
        if (step && pure) snapVerts(o.mesh, vs, step, axes, { size: this.size });
        markReshaped(o);
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
    });
    // The faces' edges (the Wireframe) bend with them.
    const lines = this.edges.children[0] as Mesh | undefined;
    const refs = this.edgeRefs;
    if (lines && refs) take(lines as unknown as Mesh, lines.geometry.getAttribute('position') as BufferAttribute, refs.verts, (i) => refs.meshes[refs.meshOf[i]!] ?? null);
  }

  /** The live drag's vertices put where the gizmo's move takes them. */
  private moveLive(delta: Matrix4): void {
    const v = new Vector3();
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
    if (restore) this.moveLive(new Matrix4());
    this.live = [];
  }

  /**
   * The drag's live edges (point, edge and face mode), as Hammer stretches a mesh under its vertex tool: every edge of a
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
   * Drag select as Hammer's: what the pointer passes over while held is taken -- the face under it in face mode, the
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
      // As Hammer shows a mesh in its vertex and edge tools: the object under the pointer (or the one its nearest point or
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
   * The selection's own axes, as Hammer's local space: a face selection's mean normal up and its first edge across; an
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
   * Square handles on points, as Hammer draws a mesh's vertices: a small cube each, kept `px` pixels across on screen
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
   * under the pointer and the objects with something selected: Hammer's screen-space pick, so a point is taken from
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
    const objects = [...new Set([under, ...[...this.sel.objects].map((id) => this.objectById(id))].filter((o): o is GeoObject => !!o))];
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
    if (!near) return;
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
    // Ctrl+Z and Ctrl+Y are the page's: its one history holds the geometry's steps too (bug 20).
    if (mod) return;
    // W / E / R and Q are the page's (its gizmo's mode and space), which it hands on here (`syncGizmo`).
    // Hammer's keys: Delete removes (a hole where faces went), Backspace dissolves (the faces round it merge).
    if ((k === 'delete' || k === 'backspace') && this.textureOn) { this.stop(e); }   // the Texture layer edits no shape
    else if (k === 'delete') { this.deleteSelection(); this.stop(e); }
    else if (k === 'backspace') { this.dissolveSelection(); this.stop(e); }
    else if (k === 'escape' && this.tool !== 'select') { this.setTool('select'); this.stop(e); }   // Paint or Sample: back to Select
    else if (k === 'escape' && !this.deps.doc.pointerLockElement) { this.sel = emptySelection(this.sel.mode); this.drawSelection(); this.stop(e); }
  }

  private stop(e: KeyboardEvent): void {
    e.preventDefault();
    e.stopImmediatePropagation();
  }
}

export type { Vector3 };

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
