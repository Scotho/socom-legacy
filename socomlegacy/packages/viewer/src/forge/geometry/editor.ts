import { scrubbing } from '../scrub';
import { brushCursor, hexOf, sampleCursor } from '../paintCursor';
import { PaintToolBar, type PaintTool } from '../paintTools';
import {
  Box3, BoxGeometry, BufferAttribute, BufferGeometry, Color, DataTexture, Euler, Group, RepeatWrapping, RGBAFormat, InstancedMesh, InterleavedBufferAttribute, LineBasicMaterial, LineSegments, Matrix4, Mesh, MeshBasicMaterial, Object3D,
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
import { commonGroundSurface } from './collision';
import { displacementGrid, makeDisplacement, sculpt } from './displacement';
import { edgeMap, edgeOfKey, faceNormal, facePoints, faceVerts, liveFaces, polygonNormal, triangulate, vertPos, type EditMesh, type Vec3 } from './editMesh';
import { buildHullWith, CLIMB_FLAG_DEFAULT, CLIMB_FLAGS, climbFlagOf, COLLISION_TYPES, collisionTypeOf, followersOf, hullGeometryOf, moveFollower, twinIndexOf, withCollisionType, withTwins, wordsOf, type CollisionType } from './hullGeometry';
import { HULL_COLOURS, type HullViewPoly } from '../hull';
import { deleteEdges, deleteFaces, deleteVerts, dissolveEdges, dissolveFaces, dissolveVerts, extrudeFaces, flipFaces, transformVerts } from './ops';
import { box, cylinder, plane, sphere, type PrimitiveOptions } from './primitives';
import { convertSelection, emptySelection, pick, pickFace, PickIndex, selectedFaces, selectionCentre, selectionVerts, type Ray, type SelectMode, type Selection } from './selection';
import type { DrawSources } from './worldMesh';
import type { FloorLook } from './blank';
import type { Surface } from './collision';
import { align, applyTexture, justify, medianTexelScale, pasteLook, sampleFace, type FaceLook, type TextureSize } from './texturing';
import {
  addObject, buildHull, cloneGeometry, compileDraws, duplicateObject, geometryOfMap, markReshaped, mul4, objectFaces, removeObject, separateFaces, transformObject, worldSectionsOf,
  type GeoObject, type WorldGeometry,
} from './world';

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
export interface GeometrySelectionState { mode: SelectMode; objects: string[]; items: [string, (number | string)[]][] }

/**
 * The geometry as one step of the page's history left it (bug 20): a copy, over the map it was made on, and the hull
 * objects of collision editing (`./hullGeometry`) as they stood, null before it was opened.
 */
/** An Outliner row of a geometry layer: an object, its kind ('world' a map section), and whether it is selected. */
export interface OutlineRow { id: string; name: string; kind: GeoObject['kind'] | 'world'; selected: boolean }

export interface GeometrySnapshot { map: LoadedMap; geo: WorldGeometry; edited: boolean; hull?: WorldGeometry | null }


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
  private createGroup!: HTMLElement;
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
      (this.createGroup = group('Create',
        this.button('box', 'Box', 'A new box in front of the camera', () => this.addPrimitive('box')),
        this.button('plane', 'Plane', 'A new plane in front of the camera (a displacement base)', () => this.addPrimitive('plane')),
        this.button('sphere', 'Sphere', 'A new sphere in front of the camera', () => this.addPrimitive('sphere')),
        this.button('cylinder', 'Cylinder', 'A new cylinder in front of the camera', () => this.addPrimitive('cylinder')),
      )),
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
    deps.tools.append(
      (this.toolGroup = group('Tool', this.toolBar.row)),
      (this.surfaceGroup = group('Collision',
        typeRow,
      )),
      (this.textureGroup = group('Texture',
        this.textureBtn,
        // Select, Paint, Sample and Apply are the Tool section's (`toolBar`); World, Face and Fit align what is selected.
        this.button('world', 'World', 'World-align the selected faces\' textures', () => this.texturing('world')),
        this.button('face', 'Face', 'Face-align the selected faces\' textures', () => this.texturing('face')),
        this.button('fit', 'Fit', 'Fit one repeat of the texture across the selected faces', () => this.texturing('fit')),
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
    deps.input.addEventListener('pointerleave', () => { this.hoverAt = null; this.drawHover(); });
    deps.input.addEventListener('pointercancel', () => { this.press = null; });
    const tick = (): void => { if (this.clouds.size) this.frameHandles(); requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    doc.addEventListener('keydown', (e) => this.onKey(e), true);
    // Shift held while painting: the sampler's cursor (a Shift+click samples); let go, or the window left, the brush's.
    doc.addEventListener('keydown', (e) => { if (e.key === 'Shift') this.setShiftHeld(true); }, true);
    doc.addEventListener('keyup', (e) => { if (e.key === 'Shift') this.setShiftHeld(false); }, true);
    doc.defaultView?.addEventListener('blur', () => this.setShiftHeld(false));
  }

  /* ---------- the page's hooks ---------- */

  /** A new base: the geometry of the old one goes (not saved yet: a later phase keeps it in the layout). */
  reset(): void {
    this.setActive(false);
    if (this.drawn) this.deps.onViewSwap(null);
    this.disposeView();
    this.geo = null;
    this.forMap = null;
    this.draws = null;
    this.built = null;
    this.edited = false;
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
  } {
    return {
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
  syncGizmo(s: { mode: 'translate' | 'rotate' | 'scale'; space: 'world' | 'local'; translationSnap: number | null; rotationSnap: number | null; surface?: { on: boolean; offset: number } }): void {
    if (s.surface) this.surface = { ...s.surface };
    this.gizmo.setMode(s.mode);
    this.gizmo.setSpace(s.space);
    const turned = s.space !== this.space;
    this.space = s.space;
    if (turned && this.active) this.drawSelection();
    this.gizmo.setTranslationSnap(s.translationSnap);
    this.gizmo.setRotationSnap(s.rotationSnap);
    this.gridSnap = s.translationSnap;
  }

  /** The grid snap's step while it is on (`syncGizmo`): a new primitive's footing lands on it. */
  private gridSnap: number | null = null;
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
        // C1: its collision edited by hand moves with it (a copy's is made by Build from the copy, as any new shape's).
        if (!copy && !this.collisionOn) for (const h of followersOf(this.hullGeo, o)) moveFollower(h, mat);
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
      const mesh = plane([0, 0, 0], size, size, divisions, { textureName: look.texture, size: this.size, scaleTexel: this.scaleTexel() });
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
    return { map: this.forMap, geo: cloneGeometry(geo), edited: this.edited, hull: this.hullGeo ? cloneGeometry(this.hullGeo) : null };
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
    if (this.toolGroup) this.toolGroup.hidden = !this.collisionOn && !this.textureOn;
    this.paintUi();
    // The Texture section the Texture layer's (the Geometry layer edits shape alone; a tile dropped still textures);
    // Create, Edit and Displace never on it -- the geometry is not edited there.
    if (this.textureGroup) this.textureGroup.hidden = !this.textureOn || this.collisionOn;
    if (this.displaceGroup) this.displaceGroup.hidden = this.collisionOn || this.textureOn;
    if (this.createGroup) this.createGroup.hidden = this.textureOn;
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
    this.toolBar?.show(this.tool);
    if (this.climbFlagLabel) this.climbFlagLabel.textContent = CLIMB_FLAGS.find((c) => c.flag === this.climbFlag)?.short ?? String(this.climbFlag);
    if (!this.collisionOn) this.closeClimbMenu();
    if (!this.collisionOn && !this.textureOn) this.showPaintTip(null);
    this.deps.input.style.cursor = this.sampleNow ? sampleCursor() : this.paintOn ? brushCursor(this.textureOn ? HIGHLIGHT : TYPE_COLOURS[this.collisionType]) : '';
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
    this.edit('Extrude', () => this.forFaces((m, faces, o) => { extrudeFaces(m, faces, unit); markReshaped(o); }));
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

  private addPrimitive(kind: 'box' | 'plane' | 'sphere' | 'cylinder'): void {
    if (!this.geo) return;
    const geo = this.geo;
    const unit = 1 / (this.forMap?.metersPerUnit ?? 1);
    const textureName = this.textureName;
    const opts: PrimitiveOptions = { textureName, size: this.size, scaleTexel: this.scaleTexel() };
    // In front of the camera: on what the middle of the view looks at, else 10 m ahead.
    const cam = this.deps.camera();
    const ray = this.rayAt(new Vector2(0, 0), cam);
    const hit = pickFace(geo, ray, this.index);
    const at: Vec3 = hit && hit.t < 200 * unit ? hit.at : [ray.origin[0]! + ray.dir[0]! * 10 * unit, ray.origin[1]! + ray.dir[1]! * 10 * unit, ray.origin[2]! + ray.dir[2]! * 10 * unit];
    // Snap on: its footing on the world grid (absolute, Hammer's), across the floor; its height the surface's.
    const g = this.gridSnap;
    if (g) { at[0] = Math.round(at[0] / g) * g; at[2] = Math.round(at[2] / g) * g; }
    const s = 2 * unit;
    const mesh = kind === 'box' ? box([at[0] - s / 2, at[1], at[2] - s / 2], [at[0] + s / 2, at[1] + s, at[2] + s / 2], opts)
      : kind === 'plane' ? plane([at[0], at[1] + 0.01 * unit, at[2]], 4 * s, 4 * s, 1, opts)
        : kind === 'sphere' ? sphere([at[0], at[1] + s / 2, at[2]], s / 2, 16, 10, opts)
          : cylinder(at, s / 2, s, 16, opts);
    const surface = this.newSolidSurface();
    this.edit(`Create ${kind}`, () => {
      const o = addObject(geo, { name: kind[0]!.toUpperCase() + kind.slice(1), kind, mesh, ...(surface ? { solid: surface } : {}) });
      this.sel = emptySelection('object');
      this.sel.objects.add(o.id);
      this.focus = o.id;
    });
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

  private texturing(how: 'apply' | 'world' | 'face' | 'fit'): void {
    const scaleTexel = this.scaleTexel();
    const look = this.sampled && this.sampled.style.textureName === this.textureName ? this.sampled : null;
    this.edit('Texture faces', () => this.forFaces((m, faces) => {
      if (how === 'apply' && look) pasteLook(m, faces, look, this.size, scaleTexel);
      else if (how === 'apply') applyTexture(m, faces, this.textureName, this.size, { align: 'keep', scaleTexel });
      else if (how === 'fit') justify(m, faces, 'fit', this.size, scaleTexel);
      else align(m, faces, how, this.size, scaleTexel);
    }));
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
      this.dragLift = this.lowestLift();
      // The live vertices first: building the view (the first edit) redraws the selection, which the preview then joins.
      this.startLive();
      this.startPreview();
      return;
    }
    const start = this.dragStart;
    this.dragStart = null;
    this.dragLift = null;
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
    this.edit(`Transform ${modeWord(this.sel.mode, 2)}`, () => {
      for (const id of this.sel.objects) {
        const o = this.objectById(id);
        if (!o) continue;
        transformVerts(o.mesh, selectionVerts(this.sel, o), mat, { textureLock: true, size: this.size });
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
    const g = this.gridSnap;
    if (g) { x = Math.round(x! / g) * g; z = Math.round(z! / g) * g; }
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
  private startLive(): void {
    this.live = [];
    if (!this.geo) return;
    if (!this.drawn) this.redraw();
    const view = this.drawn;
    if (!view) return;
    const moving = new Map<EditMesh, Set<number>>();
    for (const id of this.sel.objects) {
      const o = this.objectById(id);
      if (!o) continue;
      const vs = selectionVerts(this.sel, o);
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
    // Alt + left drag is the camera's orbit (`../../camera`), as everywhere in the Forge: left to it.
    if (!this.active || e.button !== 0 || e.altKey || !this.geo) return;
    e.stopImmediatePropagation();
    const n = this.ndc(e);
    const cam = this.deps.camera();
    this.gizmo.camera = cam;
    // The sampler first: its click is a face's texture, never the gizmo's drag (the face sampled is often the selection's).
    if (this.sampling) { if (this.sampleAt(n)) this.setTool(this.toolBeforeSample); return; }
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
        this.dragCopy = (e.ctrlKey || e.metaKey) && this.sel.mode === 'object';
        this.drive.pointerDown({ x: n.x, y: n.y, button: 0 });
        try { this.deps.input.setPointerCapture(e.pointerId); } catch { /* the release still arrives over the viewport */ }
        return;
      }
    }
    const ray = this.rayAt(n, cam);
    if (this.sculpting) { this.sculptAt(ray, e); return; }
    // A press: a click picks at its release; a drag past the slop paints the selection (`paintAt`).
    this.press = { x: e.clientX, y: e.clientY, ndc: n, pointerId: e.pointerId, shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey, painting: false, lastX: e.clientX, lastY: e.clientY };
    try { this.deps.input.setPointerCapture(e.pointerId); } catch { /* the release still arrives over the viewport */ }
  }

  /** A click's pick (its release with no drag): the item under the press, Shift or Ctrl adding or taking out. */
  private clickPick(n: Vector2, toggle: boolean): void {
    if (!this.geo) return;
    const ray = this.rayAt(n, this.deps.camera());
    const hit = pickFace(this.geo, ray, this.index);
    const tolerance = hit ? Math.max(0.05, hit.t * 0.015) : 1;
    if (hit) this.focus = hit.object.id;
    if (this.sel.mode === 'point' || this.sel.mode === 'edge') this.pickOnScreen(n, hit?.object ?? null, toggle);
    else pick(this.geo, this.sel, ray, tolerance, toggle, this.index);
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
    const off = !this.active || !geo || !at || this.gizmo.dragging || (!this.sampling && this.gizmo.object && this.gizmo.axis !== null) || this.deps.navigating();
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
  private pickOnScreen(ndc: Vector2, under: GeoObject | null, toggle: boolean): void {
    const near = this.screenNearest(ndc, under);
    if (!toggle) { this.sel.objects.clear(); this.sel.items.clear(); }
    if (!near) return;
    let set = this.sel.items.get(near.object.id);
    if (!set) { set = new Set(); this.sel.items.set(near.object.id, set); }
    this.sel.objects.add(near.object.id);
    if (toggle && set.has(near.item)) set.delete(near.item); else set.add(near.item);
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
    if (this.stroke && this.stroke.pointerId === e.pointerId) { this.endStroke(); return; }
    const press = this.press;
    if (press && press.pointerId === e.pointerId && e.button === 0) {
      this.press = null;
      if (press.painting) this.drawSelection();
      else this.clickPick(press.ndc, press.shift || press.ctrl);
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
    // The modes on the number keys by their place (`Digit1`..`Digit4`, as the page's tools read them), Shift or not; the
    // other number keys are nothing here, so never the page's placing tools (`../keys` `GEOMETRY_SHARED`).
    const digit = /^Digit([0-9])$/.exec(e.code);
    if (digit && !mod && !e.altKey) {
      const mode = MODES.find((m) => m.key === digit[1]);
      if (mode && !e.shiftKey) this.setMode(mode.mode);
      this.stop(e);
      return;
    }
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
