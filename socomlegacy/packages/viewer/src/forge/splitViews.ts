/**
 * The Forge's split viewport (the owner, 2026-11-11: "a button ... that allows us to split the viewport into multiple sub
 * views", as Godot's View menu splits its 3D viewport). A browser adaptation with no original: the game draws one
 * picture and has no editor, so nothing here changes how the map draws -- each view draws the map with the game's own
 * camera-facing rules for its own camera (the facades, the LOD fades: `../world` `frame`).
 *
 * One to four views in the main viewport tab only, never panels: no tabs, never dragged out. Each keeps its own camera
 * (projection, pose, orthographic frame: `../camera` `ForgeViewState`), its own marks (the View dropdown's billboard
 * switches: `ViewLook`) and its own Draw switches that show or hide what is drawn (`ViewLook.draw`). Shared by every view: the selection and the transform gizmo, its mode and space, snapping and
 * the camera's speeds and lens.
 *
 * The camera has one controller (`FlyCamera`): the view last pressed is the active one and has it -- its menus, its
 * orbit gizmo, the page's pointer surface -- while each other view is drawn from what it kept. A press on another view
 * hands it the camera (an asset dragged over one too, for its drop); Walk, Play and a camera shot take the active view alone. The layout's
 * own camera (saved with it, opened with it) is the first view's. The global controls (gizmo modes, the snaps, camera settings) follow
 * the active view.
 */
import { OrthographicCamera, PerspectiveCamera, Quaternion, Vector3 } from 'three';
import type { FlyCamera, ForgeViewportView, ForgeViewState } from '../camera';

/**
 * The layouts (the owner, 2026-11-11, from a reference menu: one view; two stacked or side by side; three with the large
 * view at the top, bottom, left or right; four in a grid, with the large view at a side, stacked or side by side).
 */
export type SplitLayout =
  | '1' | '2-stack' | '2-side'
  | '3-top' | '3-bottom' | '3-left' | '3-right'
  | '4' | '4-top' | '4-bottom' | '4-left' | '4-right' | '4-stack' | '4-side';

/**
 * A layout's shape: `line`, its views in a row along `axis` (`x` side by side, `y` stacked); `big`, a large view at
 * `side` and the rest in a row along the other axis beside it; `grid`, two by two.
 */
type Shape =
  | { kind: 'single' }
  | { kind: 'line'; axis: 'x' | 'y'; n: number }
  | { kind: 'big'; side: 'top' | 'bottom' | 'left' | 'right'; n: number }
  | { kind: 'grid' };

export const SPLIT_LAYOUTS: readonly { id: SplitLayout; label: string; count: number; section: number; shape: Shape }[] = [
  { id: '1', label: 'Single View', count: 1, section: 0, shape: { kind: 'single' } },
  { id: '2-stack', label: '2 Views Stacked', count: 2, section: 1, shape: { kind: 'line', axis: 'y', n: 2 } },
  { id: '2-side', label: '2 Views Side-by-Side', count: 2, section: 1, shape: { kind: 'line', axis: 'x', n: 2 } },
  { id: '3-top', label: '3 Views Top Split', count: 3, section: 2, shape: { kind: 'big', side: 'top', n: 2 } },
  { id: '3-bottom', label: '3 Views Bottom Split', count: 3, section: 2, shape: { kind: 'big', side: 'bottom', n: 2 } },
  { id: '3-left', label: '3 Views Left Split', count: 3, section: 2, shape: { kind: 'big', side: 'left', n: 2 } },
  { id: '3-right', label: '3 Views Right Split', count: 3, section: 2, shape: { kind: 'big', side: 'right', n: 2 } },
  { id: '4', label: '4 Views', count: 4, section: 3, shape: { kind: 'grid' } },
  { id: '4-top', label: '4 Views Top Split', count: 4, section: 3, shape: { kind: 'big', side: 'top', n: 3 } },
  { id: '4-bottom', label: '4 Views Bottom Split', count: 4, section: 3, shape: { kind: 'big', side: 'bottom', n: 3 } },
  { id: '4-left', label: '4 Views Left Split', count: 4, section: 3, shape: { kind: 'big', side: 'left', n: 3 } },
  { id: '4-right', label: '4 Views Right Split', count: 4, section: 3, shape: { kind: 'big', side: 'right', n: 3 } },
  { id: '4-stack', label: '4 Views Stacked', count: 4, section: 3, shape: { kind: 'line', axis: 'y', n: 4 } },
  { id: '4-side', label: '4 Views Side-by-Side', count: 4, section: 3, shape: { kind: 'line', axis: 'x', n: 4 } },
];

const shapeOf = (layout: SplitLayout): Shape => SPLIT_LAYOUTS.find((l) => l.id === layout)?.shape ?? { kind: 'single' };
export const splitCount = (layout: SplitLayout): number => SPLIT_LAYOUTS.find((l) => l.id === layout)?.count ?? 1;

/**
 * A layout's split lines, each a fraction of the viewport along its axis (`splitCutAxes`): a line's cuts in order; a
 * large view's split first, then the lines between the smaller views; the grid's column line, then its row line.
 */
export type SplitRatios = number[];

/** The axis each of `layout`'s cuts runs along (`x`: a column line's place across the width). */
export function splitCutAxes(layout: SplitLayout): ('x' | 'y')[] {
  const s = shapeOf(layout);
  switch (s.kind) {
    case 'line': return Array.from({ length: s.n - 1 }, () => s.axis);
    case 'big': {
      const main = s.side === 'top' || s.side === 'bottom' ? 'y' : 'x';
      const rest = main === 'y' ? 'x' : 'y';
      return [main, ...Array.from({ length: s.n - 1 }, () => rest)];
    }
    case 'grid': return ['x', 'y'];
    default: return [];
  }
}

/** `layout`'s cuts as a new layout has them: its views even, a large view's split in the middle. */
export function splitDefaultRatios(layout: SplitLayout): SplitRatios {
  const s = shapeOf(layout);
  const even = (n: number): number[] => Array.from({ length: n - 1 }, (_, i) => (i + 1) / n);
  switch (s.kind) {
    case 'line': return even(s.n);
    case 'big': return [0.5, ...even(s.n)];
    case 'grid': return [0.5, 0.5];
    default: return [];
  }
}

/** A view's rectangle in CSS pixels, from the viewport's top-left corner. */
export interface ViewRect { x: number; y: number; w: number; h: number }

/** The gap between two views, CSS pixels: the divider drawn there. */
export const SPLIT_GAP_PX = 2;
/** The smallest a view is made by a divider's drag, CSS pixels: room for its menus. */
export const SPLIT_MIN_PX = 140;

/**
 * Cuts along one `length`, in order, held so every piece keeps `SPLIT_MIN_PX` (a cut moved past its neighbour pushes it
 * on); a length too short for them all: even pieces.
 */
export function clampCuts(cuts: readonly number[], length: number): number[] {
  const n = cuts.length;
  const L = Math.max(1, length);
  const edge = (SPLIT_MIN_PX + SPLIT_GAP_PX / 2) / L, step = (SPLIT_MIN_PX + SPLIT_GAP_PX) / L;
  if (2 * edge + (n - 1) * step > 1) return cuts.map((_, i) => (i + 1) / (n + 1));
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const c = cuts[i]!;
    const lo = i === 0 ? edge : out[i - 1]! + step;
    const hi = 1 - edge - (n - 1 - i) * step;
    out.push(Math.min(hi, Math.max(lo, Number.isFinite(c) ? c : (i + 1) / (n + 1))));
  }
  return out;
}

/** `ratio` held so both sides of a split along `length` keep `SPLIT_MIN_PX` (a viewport too small for both: the middle). */
export function clampRatio(ratio: number, length: number): number {
  return clampCuts([ratio], length)[0]!;
}

/** `layout`'s cuts held (`clampCuts`), each group of cuts along its own length; missing or broken ones the defaults. */
export function clampRatios(layout: SplitLayout, ratios: readonly number[], width: number, height: number): number[] {
  const s = shapeOf(layout);
  const def = splitDefaultRatios(layout);
  const r = def.map((d, i) => (Number.isFinite(ratios[i]) ? ratios[i]! : d));
  const len = (axis: 'x' | 'y'): number => (axis === 'x' ? width : height);
  switch (s.kind) {
    case 'line': return clampCuts(r, len(s.axis));
    case 'big': {
      const [mainAxis, restAxis] = s.side === 'top' || s.side === 'bottom' ? ['y', 'x'] as const : ['x', 'y'] as const;
      return [...clampCuts([r[0]!], len(mainAxis)), ...clampCuts(r.slice(1), len(restAxis))];
    }
    case 'grid': return [...clampCuts([r[0]!], width), ...clampCuts([r[1]!], height)];
    default: return [];
  }
}

/** Pieces of [`from`, `to`) at the pixel cuts `at`, the gap shared either side of each. */
const pieces = (from: number, to: number, at: readonly number[]): [number, number][] => {
  const g = SPLIT_GAP_PX / 2;
  const edges = [from, ...at, to];
  return edges.slice(0, -1).map((e, i) => [i === 0 ? e : e + g, i === edges.length - 2 ? edges[i + 1]! : edges[i + 1]! - g]);
};

/**
 * The views' rectangles of `layout` over a `width` by `height` viewport, in view order: a large view first, then the
 * smaller ones in reading order; a line or the grid in reading order.
 */
export function splitRects(layout: SplitLayout, ratios: readonly number[], width: number, height: number): ViewRect[] {
  const s = shapeOf(layout);
  const r = clampRatios(layout, ratios, width, height);
  const rect = (x0: number, y0: number, x1: number, y1: number): ViewRect => ({ x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) });
  const px = (f: number, axis: 'x' | 'y'): number => Math.round(f * (axis === 'x' ? width : height));
  switch (s.kind) {
    case 'line': {
      const at = r.map((f) => px(f, s.axis));
      return pieces(0, s.axis === 'x' ? width : height, at).map(([a, b]) => (s.axis === 'x' ? rect(a, 0, b, height) : rect(0, a, width, b)));
    }
    case 'big': {
      const vertical = s.side === 'top' || s.side === 'bottom';
      const main = px(r[0]!, vertical ? 'y' : 'x');
      const [first, second] = pieces(0, vertical ? height : width, [main]) as [[number, number], [number, number]];
      const [big, rest] = s.side === 'top' || s.side === 'left' ? [first, second] : [second, first];
      const at = r.slice(1).map((f) => px(f, vertical ? 'x' : 'y'));
      const small = pieces(0, vertical ? width : height, at);
      return vertical
        ? [rect(0, big[0], width, big[1]), ...small.map(([a, b]) => rect(a, rest[0], b, rest[1]))]
        : [rect(big[0], 0, big[1], height), ...small.map(([a, b]) => rect(rest[0], a, rest[1], b))];
    }
    case 'grid': {
      const cols = pieces(0, width, [px(r[0]!, 'x')]), rows = pieces(0, height, [px(r[1]!, 'y')]);
      return rows.flatMap(([y0, y1]) => cols.map(([x0, x1]) => rect(x0, y0, x1, y1)));
    }
    default: return [rect(0, 0, width, height)];
  }
}

/** A divider: the cuts it moves (by index; the grid's crossing moves both), along which axis, and where it is drawn. */
export interface SplitSash { moves: number[]; axis: 'x' | 'y' | 'xy'; rect: ViewRect }

/** The dividers of `layout` (its lines, and the grid's crossing), each `thick` CSS pixels across, centred on its gap. */
export function splitSashes(layout: SplitLayout, ratios: readonly number[], width: number, height: number, thick = 6): SplitSash[] {
  const s = shapeOf(layout);
  const r = clampRatios(layout, ratios, width, height);
  const half = thick / 2;
  const px = (f: number, axis: 'x' | 'y'): number => Math.round(f * (axis === 'x' ? width : height));
  const col = (x: number, y0: number, y1: number, i: number): SplitSash => ({ moves: [i], axis: 'x', rect: { x: x - half, y: y0, w: thick, h: y1 - y0 } });
  const row = (y: number, x0: number, x1: number, i: number): SplitSash => ({ moves: [i], axis: 'y', rect: { x: x0, y: y - half, w: x1 - x0, h: thick } });
  switch (s.kind) {
    case 'line': return r.map((f, i) => (s.axis === 'x' ? col(px(f, 'x'), 0, height, i) : row(px(f, 'y'), 0, width, i)));
    case 'big': {
      const vertical = s.side === 'top' || s.side === 'bottom';
      const main = px(r[0]!, vertical ? 'y' : 'x');
      // The smaller views' side of the large view's split: where their own lines run.
      const [from, to] = s.side === 'top' ? [main, height] : s.side === 'bottom' ? [0, main] : s.side === 'left' ? [main, width] : [0, main];
      return [
        vertical ? row(main, 0, width, 0) : col(main, 0, height, 0),
        ...r.slice(1).map((f, k) => (vertical ? col(px(f, 'x'), from, to, k + 1) : row(px(f, 'y'), from, to, k + 1))),
      ];
    }
    case 'grid': {
      const x = px(r[0]!, 'x'), y = px(r[1]!, 'y');
      return [col(x, 0, height, 0), row(y, 0, width, 1), { moves: [0, 1], axis: 'xy', rect: { x: x - thick, y: y - thick, w: thick * 2, h: thick * 2 } }];
    }
    default: return [];
  }
}

/** Each view's projection when it is first shown (Godot's four: the camera's own, then Top, Front, Right). */
export const SPLIT_VIEW_DEFAULTS: readonly ForgeViewportView[] = ['perspective', 'top', 'front', 'right'];

/**
 * A view's marks (the View dropdown's billboard switches, kept a view): billboards shown, the kinds switched off
 * (`./mapDataBillboards` `MAP_DATA_KIND_TOGGLES` ids), Only user data, the map's flare glows, the light rig's arrows.
 */
export interface ViewLook {
  on: boolean; off: string[]; onlyUser: boolean; glows: boolean; arrows: boolean;
  /**
   * The view's own Draw switches (the owner, 2026-11-11: "each viewport to be independent of other viewport draw
   * settings"), by the Draw menu's ids -- the page names which are a view's own; absent, the menus' own.
   */
  draw?: Record<string, boolean>;
}

const VIEWS: readonly ForgeViewportView[] = ['perspective', 'top', 'bottom', 'left', 'right', 'front', 'back'];
const isLayout = (v: unknown): v is SplitLayout => SPLIT_LAYOUTS.some((l) => l.id === v);
const isFinite3 = (v: unknown): v is [number, number, number] => Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === 'number' && Number.isFinite(n));

/** A kept camera read back, or null for anything else. */
export function parseViewState(raw: unknown): ForgeViewState | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const num = (k: string): number | null => (typeof r[k] === 'number' && Number.isFinite(r[k]) ? r[k] as number : null);
  const yaw = num('yaw'), pitch = num('pitch'), height = num('orthographicHeight'), focus = num('orthographicFocusDistance'), zoom = num('orthographicZoom');
  if (!VIEWS.includes(r['view'] as ForgeViewportView) || !isFinite3(r['position']) || yaw === null || pitch === null
    || height === null || height <= 0 || focus === null || focus <= 0 || zoom === null || zoom <= 0) return null;
  return { view: r['view'] as ForgeViewportView, position: [...r['position']] as [number, number, number], yaw, pitch,
    orthographicHeight: height, orthographicFocusDistance: focus, orthographicZoom: zoom };
}

/** Kept marks read back (`known`: the kind ids that may be named), or null. */
export function parseViewLook(raw: unknown, known: readonly string[]): ViewLook | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r['on'] !== 'boolean' || !Array.isArray(r['off'])) return null;
  return {
    on: r['on'], off: (r['off'] as unknown[]).filter((id): id is string => typeof id === 'string' && known.includes(id)),
    onlyUser: r['onlyUser'] === true, glows: r['glows'] !== false, arrows: r['arrows'] !== false,
    ...(r['draw'] && typeof r['draw'] === 'object'
      ? { draw: Object.fromEntries(Object.entries(r['draw'] as Record<string, unknown>).filter((e): e is [string, boolean] => typeof e[1] === 'boolean')) }
      : {}),
  };
}

/** The split as it is kept with the view (`FORGE_VIEW_KEY`'s `split`): cameras only for the map they were kept on. */
export interface SplitRecord {
  layout: SplitLayout;
  ratios: Partial<Record<SplitLayout, SplitRatios>>;
  /** The map the views' cameras stand in (`SplitViewsOptions.mapKey`); another map's views start again from the first. */
  map: string | null;
  views: { kind: ForgeViewportView; camera: ForgeViewState | null; look: ViewLook | null }[];
}

export function parseSplitRecord(raw: unknown, known: readonly string[]): SplitRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!isLayout(r['layout'])) return null;
  const ratios: Partial<Record<SplitLayout, SplitRatios>> = {};
  if (r['ratios'] && typeof r['ratios'] === 'object') {
    for (const [id, v] of Object.entries(r['ratios'] as Record<string, unknown>)) {
      // A layout's cuts, as many as it has, each inside the viewport (a split kept before the cuts were a list: none).
      if (isLayout(id) && Array.isArray(v) && v.length === splitDefaultRatios(id).length
        && v.every((f) => typeof f === 'number' && f > 0 && f < 1)) ratios[id] = [...v as number[]];
    }
  }
  const views = Array.isArray(r['views']) ? (r['views'] as unknown[]).slice(0, 4).map((v, i) => {
    const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
    return {
      kind: VIEWS.includes(o['kind'] as ForgeViewportView) ? o['kind'] as ForgeViewportView : SPLIT_VIEW_DEFAULTS[i]!,
      camera: parseViewState(o['camera']), look: parseViewLook(o['look'], known),
    };
  }) : [];
  return { layout: r['layout'], ratios, map: typeof r['map'] === 'string' ? r['map'] : null, views };
}

const VIEW_WORDS: Record<ForgeViewportView, string> = {
  perspective: 'Perspective', top: 'Top', bottom: 'Bottom', left: 'Left', right: 'Right', front: 'Front', back: 'Back',
};

/** What the split views need of the page. */
export interface SplitViewsOptions {
  doc: Document;
  viewport: HTMLElement;
  fly: FlyCamera;
  /** The page's pointer surface (picking, the gizmo, the camera's drags): laid over the active view only. */
  input: HTMLElement;
  /** The active view's own controls: its menus (top-left) and its orbit gizmo (bottom-right), moved onto it. */
  viewControls: HTMLElement;
  axisWidget: Element;
  /** The global controls (gizmo modes, the snaps, the camera's settings), kept on the active view's top-right. */
  globalControls: HTMLElement;
  /** The pad's cursor, kept at the active view's centre. */
  crosshair: HTMLElement;
  /** The PS2 picture is drawn at its own aspect over the whole viewport (`../renderer` PS2_FRAME): a view's share of it. */
  baseAspect: (width: number, height: number) => number;
  /** The active view's marks, as the menus have them now; and another view's put on the menus and the scene. */
  lookNow: () => ViewLook;
  setLook: (look: ViewLook) => void;
  /** Where a new orthographic view looks (`setForgeViewportView`'s focus). */
  focus: () => Vector3;
  /** Whether the camera may move to another view now (no drag, no gesture, no menu open, no load). */
  canSwitch: () => boolean;
  /** The view in the active seat changed (its menus are redrawn by the page). */
  onActive?: (index: number) => void;
  /** The views were laid again (a divider, a layout, the active view): the page fits its controls to the active one. */
  onLayout?: () => void;
  /** The layout, a divider or a view's camera changed: written with the view. */
  onChange: () => void;
  /** The layout's icon for the menu's rows. */
  icon: (layout: SplitLayout) => string;
  /** The maximize button's icon. */
  maximizeIcon: string;
}

export interface SplitViews {
  /** The split button's dropdown, placed by the page (beside the gizmo's World / Local). */
  menu: HTMLElement;
  layout(): SplitLayout;
  setLayout(layout: SplitLayout): void;
  /** The view that has the camera. */
  active(): number;
  /** The first view's camera, whichever view has the camera now (the layout's camera is the first view's). */
  mainState(): ForgeViewState;
  /** The first view takes the camera back (Walk, Play, a shot, a layout opening: they are the first view's). */
  activateMain(): void;
  /** Every view's rectangle laid again (the viewport resized, the picture's aspect changed). */
  relayout(): void;
  /**
   * The views to draw this frame (one or none: the page draws as before), the active one last so the scene is left as
   * its camera sees it: each with its camera posed, its rectangle as fractions, its marks (`null`: the menus' own).
   */
  drawList(): { index: number; camera: PerspectiveCamera | OrthographicCamera; rect: ViewRect; look: ViewLook | null }[];
  /** Under Walk, Play or a shot the viewport is one view: the active one, alone, until it ends. */
  setSuspended(on: boolean): void;
  /** The split, kept (`parseSplitRecord` reads it back). */
  record(): SplitRecord;
  restore(record: SplitRecord | null): void;
  /** A map opened (`key` names it): views kept on another map start again from the first view's camera. */
  mapOpened(key: string): void;
  dispose(): void;
}

/** The split views over `viewport` (see the module's note). */
export function createSplitViews(o: SplitViewsOptions): SplitViews {
  const { doc, viewport, fly } = o;
  // Maximize: the split menu's first row (the owner, 2026-11-11: "we only need a single button"), with a rule under it;
  // shown while the viewport is split.
  const maximize = doc.createElement('button');
  maximize.type = 'button';
  maximize.className = 'fx-split-row fx-split-maximize';
  maximize.setAttribute('role', 'menuitem');
  maximize.innerHTML = `${o.maximizeIcon}<span>Maximize this view</span>`;
  maximize.hidden = true;
  const maximizeRule = doc.createElement('div');
  maximizeRule.className = 'fx-split-rule';
  maximizeRule.setAttribute('role', 'separator');
  maximizeRule.hidden = true;
  let layout: SplitLayout = '1';
  const ratios: Partial<Record<SplitLayout, SplitRatios>> = {};
  const ratiosOf = (l: SplitLayout): SplitRatios => (ratios[l] ??= splitDefaultRatios(l));
  let mapKey: string | null = null;
  let active = 0;
  let suspended = false;
  /** A map has opened (`mapOpened`): before it the camera is no map's, and no other view is made from it. */
  let ready = false;
  const views = SPLIT_VIEW_DEFAULTS.map((kind) => ({
    kind,
    camera: null as ForgeViewState | null,
    look: null as ViewLook | null,
    cameras: { perspective: new PerspectiveCamera(), orthographic: new OrthographicCamera() },
  }));
  let rects: ViewRect[] = [];
  let size = { w: 1, h: 1 };

  // The layer over the picture: a frame a view (its outline, a name and an orbit gizmo while it is not active), and the
  // dividers. An inactive view's frame takes the pointer, which hands it the camera.
  const layer = doc.createElement('div');
  layer.className = 'fx-split';
  layer.hidden = true;
  const frames = views.map((_, i) => {
    const frame = doc.createElement('div');
    frame.className = 'fx-split-view';
    frame.dataset['view'] = String(i);
    const name = doc.createElement('span');
    name.className = 'fx-split-name';
    const axes = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
    axes.classList.add('fx-split-axes');
    axes.setAttribute('viewBox', '0 0 80 80');
    axes.setAttribute('aria-hidden', 'true');
    frame.append(name, axes);
    // A view becomes the active one when pressed, never when the pointer passes over it (the owner, 2026-11-11: "when I
    // click on it, not hover, it is distracting").
    // An asset dragged from the browser over a view: no pointer events then, so the drag's own hands it the camera, and
    // the drop is projected through this view (the page's drop reads the pointer surface's rectangle).
    frame.addEventListener('dragenter', () => take(i, true));
    frame.addEventListener('dragover', () => take(i, true));
    frame.addEventListener('pointerdown', (e) => {
      // A press on another view: it takes the camera, the press spent on that (any button: a right-press to fly too).
      if (i !== active) { e.preventDefault(); take(i, true); }
    });
    layer.append(frame);
    return { frame, name, axes };
  });
  const sashLayer = doc.createElement('div');
  sashLayer.className = 'fx-split-sashes';
  layer.append(sashLayer);
  viewport.append(layer);

  const shown = (): number[] => {
    if (suspended || !ready) return [active];
    return views.slice(0, splitCount(layout)).map((_, i) => i);
  };

  // An inactive view's orbit gizmo: its camera's axes, drawn when it is laid out (its camera holds still meanwhile).
  const drawAxes = (svg: SVGSVGElement, state: ForgeViewState | null): void => {
    svg.replaceChildren();
    if (!state) return;
    const inverse = new Quaternion().setFromEuler(fly.forgeDrawCamera(state, 1, views[0]!.cameras).rotation).invert();
    const ns = svg.namespaceURI;
    const ends: { axis: string; x: number; y: number; depth: number; positive: boolean }[] = [];
    for (const [axis, v] of [['x', new Vector3(1, 0, 0)], ['y', new Vector3(0, 1, 0)], ['z', new Vector3(0, 0, 1)]] as const) {
      const p = v.applyQuaternion(inverse);
      const line = doc.createElementNS(ns, 'line');
      line.classList.add(`fx-axis-${axis}`);
      line.setAttribute('x1', '40'); line.setAttribute('y1', '40');
      line.setAttribute('x2', String(40 + p.x * 25)); line.setAttribute('y2', String(40 - p.y * 25));
      svg.append(line);
      ends.push({ axis, x: 40 + p.x * 25, y: 40 - p.y * 25, depth: p.z, positive: true }, { axis, x: 40 - p.x * 25, y: 40 + p.y * 25, depth: -p.z, positive: false });
    }
    for (const e of ends.sort((a, b) => a.depth - b.depth)) {
      const g = doc.createElementNS(ns, 'g');
      g.classList.add('fx-axis-end', `fx-axis-${e.axis}`);
      g.setAttribute('transform', `translate(${e.x} ${e.y})`);
      g.setAttribute('data-sign', e.positive ? '1' : '-1');
      const c = doc.createElementNS(ns, 'circle');
      c.setAttribute('r', e.positive ? '8' : '6');
      g.append(c);
      if (e.positive) { const t = doc.createElementNS(ns, 'text'); t.textContent = e.axis.toUpperCase(); g.append(t); }
      svg.append(g);
    }
  };

  const aspectOf = (r: ViewRect): number => o.baseAspect(size.w, size.h) * (r.w / size.w) / (r.h / size.h);

  const place = (el: Element, x: number, y: number): void => {
    (el as HTMLElement | SVGElement).style.transform = x === 0 && y === 0 ? '' : `translate(${x}px, ${y}px)`;
  };

  const relayout = (): void => {
    size = { w: Math.max(1, viewport.clientWidth), h: Math.max(1, viewport.clientHeight) };
    const list = shown();
    const all = splitRects(list.length > 1 ? layout : '1', ratiosOf(layout), size.w, size.h);
    rects = views.map((_, i) => all[list.indexOf(i)] ?? { x: 0, y: 0, w: 0, h: 0 });
    const split = list.length > 1;
    layer.hidden = !split;
    viewport.classList.toggle('fx-is-split', split);
    maximize.hidden = maximizeRule.hidden = suspended || layout === '1';
    maximize.title = 'The active view alone: the layout back to one view (the others kept for this menu)';
    views.forEach((v, i) => {
      const f = frames[i]!;
      const r = rects[i]!;
      const on = split && list.includes(i);
      f.frame.hidden = !on;
      if (!on) return;
      Object.assign(f.frame.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` });
      f.frame.classList.toggle('is-active', i === active);
      f.name.textContent = VIEW_WORDS[v.camera?.view ?? v.kind];
      if (i !== active) drawAxes(f.axes, v.camera);
    });
    // The active view: the pointer surface, its menus and orbit gizmo, the pad's cursor; the first view the globals.
    const a = rects[active] ?? { x: 0, y: 0, w: size.w, h: size.h };
    const full = !split;
    Object.assign(o.input.style, full ? { left: '', top: '', width: '', height: '' }
      : { left: `${a.x}px`, top: `${a.y}px`, width: `${a.w}px`, height: `${a.h}px` });
    place(o.viewControls, full ? 0 : a.x, full ? 0 : a.y);
    place(o.axisWidget, full ? 0 : a.x + a.w - size.w, full ? 0 : a.y + a.h - size.h);
    place(o.crosshair, full ? 0 : a.x + a.w / 2 - size.w / 2, full ? 0 : a.y + a.h / 2 - size.h / 2);
    // The global controls (the gizmo's, the snaps', the camera's) at the active view's top-right (the owner, 2026-11-11:
    // "these buttons should move to which ever is the active viewport").
    place(o.globalControls, full ? 0 : a.x + a.w - size.w, full ? 0 : a.y);
    fly.setAspect(aspectOf(full ? { x: 0, y: 0, w: size.w, h: size.h } : a));
    drawSashes(split ? splitSashes(layout, ratiosOf(layout), size.w, size.h) : []);
    o.onLayout?.();
  };

  // The dividers: dragged, their ratio follows the pointer (held to `SPLIT_MIN_PX` each side); double-clicked, the middle.
  // Made again only when the layout changes: a relayout under a drag moves the dragged divider, never replaces it (its
  // pointer capture would go with it).
  let sashesOf = '';
  const drawSashes = (sashes: SplitSash[]): void => {
    const key = sashes.map((s) => `${s.moves}${s.axis}`).join() + layout;
    if (key === sashesOf) {
      sashes.forEach((s, i) => {
        const el = sashLayer.children[i] as HTMLElement | undefined;
        if (el) Object.assign(el.style, { left: `${s.rect.x}px`, top: `${s.rect.y}px`, width: `${s.rect.w}px`, height: `${s.rect.h}px` });
      });
      return;
    }
    sashesOf = key;
    sashLayer.replaceChildren(...sashes.map((s) => {
      const el = doc.createElement('div');
      el.className = `fx-split-sash fx-split-sash--${s.axis}`;
      Object.assign(el.style, { left: `${s.rect.x}px`, top: `${s.rect.y}px`, width: `${s.rect.w}px`, height: `${s.rect.h}px` });
      el.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        el.setPointerCapture(e.pointerId);
        const box = viewport.getBoundingClientRect();
        const move = (ev: PointerEvent): void => {
          const q = [...ratiosOf(layout)];
          const fx = (ev.clientX - box.left) / Math.max(1, box.width), fy = (ev.clientY - box.top) / Math.max(1, box.height);
          // Each cut it moves follows the pointer along that cut's own axis; the rest held (`clampRatios`) around it.
          const axes = splitCutAxes(layout);
          for (const i of s.moves) q[i] = axes[i] === 'x' ? fx : fy;
          ratios[layout] = clampRatios(layout, q, box.width, box.height);
          relayout();
        };
        const up = (ev: PointerEvent): void => {
          el.removeEventListener('pointermove', move);
          el.removeEventListener('pointerup', up);
          el.removeEventListener('pointercancel', up);
          try { el.releasePointerCapture(ev.pointerId); } catch { /* already let go */ }
          o.onChange();
        };
        el.addEventListener('pointermove', move);
        el.addEventListener('pointerup', up);
        el.addEventListener('pointercancel', up);
      });
      el.addEventListener('dblclick', () => {
        // The cuts it moves back where a new layout has them.
        const q = [...ratiosOf(layout)], def = splitDefaultRatios(layout);
        for (const i of s.moves) q[i] = def[i]!;
        ratios[layout] = clampRatios(layout, q, size.w, size.h);
        relayout();
        o.onChange();
      });
      return el;
    }));
  };

  /** View `i`'s camera, made from the first view's when it has none (or another map's): its default projection. */
  const ensureCamera = (i: number): ForgeViewState => {
    const v = views[i]!;
    if (v.camera) return v.camera;
    const main = active === 0 ? fly.forgeViewState() : views[0]!.camera ?? fly.forgeViewState();
    if (i === 0) return (v.camera = main);
    const now = fly.forgeViewState();
    fly.setForgeViewState(main);
    // The first view's camera turned to this view's projection, as its own menu would turn it (an orthographic view
    // from the perspective one looks at the map's middle).
    if (v.kind !== main.view) fly.setForgeViewportView(v.kind, v.kind !== 'perspective' && main.view === 'perspective' ? o.focus() : null);
    v.camera = fly.forgeViewState();
    fly.setForgeViewState(now);
    return v.camera;
  };

  /** View `i` takes the camera: the active view's kept, `i`'s put back, its marks on the menus. */
  const activate = (i: number): void => {
    if (i === active) return;
    const was = views[active]!;
    was.camera = fly.forgeViewState();
    was.look = o.lookNow();
    const next = views[i]!;
    const state = ensureCamera(i);
    active = i;
    fly.setForgeViewState(state);
    next.look ??= { ...was.look, off: [...was.look.off], ...(was.look.draw ? { draw: { ...was.look.draw } } : {}) };
    o.setLook(next.look);
    relayout();
    o.onActive?.(i);
  };
  const take = (i: number, force = false): void => {
    if (i === active || suspended || !shown().includes(i)) return;
    if (!force && !o.canSwitch()) return;
    activate(i);
  };

  // The split button's dropdown: a row a layout, its picture before its words.
  const menu = doc.createElement('details');
  menu.className = 'fx-split-menu';
  const summary = doc.createElement('summary');
  summary.className = 'fx-tool fx-split-summary';
  summary.title = 'Split the viewport into views · middle-click: maximize the active view';
  summary.setAttribute('aria-label', 'Viewport layout');
  const list = doc.createElement('div');
  list.className = 'fx-split-list';
  list.setAttribute('role', 'menu');
  const rows = new Map<SplitLayout, HTMLButtonElement>();
  list.append(maximize, maximizeRule);
  let section = 0;
  for (const l of SPLIT_LAYOUTS) {
    // A rule between the sections (one view; two; three; four), as the reference menu draws them.
    if (l.section !== section) { section = l.section; const hr = doc.createElement('div'); hr.className = 'fx-split-rule'; hr.setAttribute('role', 'separator'); list.append(hr); }
    const b = doc.createElement('button');
    b.type = 'button';
    b.className = 'fx-split-row';
    b.setAttribute('role', 'menuitemradio');
    b.innerHTML = `${o.icon(l.id)}<span>${l.label}</span>`;
    b.addEventListener('click', () => { setLayout(l.id); menu.open = false; o.onChange(); });
    rows.set(l.id, b);
    list.append(b);
  }
  menu.append(summary, list);
  const drawMenu = (): void => {
    summary.innerHTML = o.icon(layout);
    for (const [id, b] of rows) b.setAttribute('aria-checked', String(id === layout));
  };
  const onDocDown = (e: PointerEvent): void => { if (menu.open && !menu.contains(e.target as Node)) menu.open = false; };
  doc.addEventListener('pointerdown', onDocDown, true);

  // Maximize (the owner, 2026-11-11: "it should set the layout back to 1 view"): the active view takes the first seat --
  // the one view a single layout draws, the layout's camera -- the first view's going to its seat, and the layout one view.
  // A middle-click on the split button: Maximize at once (the owner, 2026-11-11), its menu left shut; the browser's
  // middle-press scroll kept off it.
  summary.addEventListener('pointerdown', (e) => { if (e.button === 1) e.preventDefault(); });
  summary.addEventListener('auxclick', (e) => {
    if (e.button !== 1) return;
    e.preventDefault();
    if (!maximize.hidden) maximize.click();
  });
  maximize.addEventListener('click', () => {
    menu.open = false;
    if (active !== 0) {
      const was = views[active]!;
      was.camera = fly.forgeViewState();
      was.look = o.lookNow();
      views[active] = views[0]!;
      views[0] = was;
      active = 0;
    }
    setLayout('1');
    o.onChange();
  });

  const setLayout = (next: SplitLayout): void => {
    if (splitCount(next) <= active) activateMain();
    layout = next;
    if (ready) for (let i = 1; i < splitCount(next); i++) ensureCamera(i);
    drawMenu();
    relayout();
  };
  const activateMain = (): void => {
    if (active !== 0) activate(0);
  };
  drawMenu();

  return {
    menu,
    layout: () => layout,
    setLayout,
    active: () => active,
    mainState: () => (active === 0 ? fly.forgeViewState() : views[0]!.camera ?? fly.forgeViewState()),
    activateMain,
    relayout,
    drawList: () => {
      const list = shown();
      if (list.length < 2) return [];
      const order = [...list.filter((i) => i !== active), active];
      return order.map((i) => {
        const r = rects[i]!;
        const rect = { x: r.x / size.w, y: r.y / size.h, w: r.w / size.w, h: r.h / size.h };
        if (i === active) return { index: i, camera: fly.viewportCamera(), rect, look: null };
        const v = views[i]!;
        return { index: i, camera: fly.forgeDrawCamera(ensureCamera(i), aspectOf(r), v.cameras), rect, look: v.look };
      });
    },
    setSuspended: (on) => {
      if (on === suspended) return;
      suspended = on;
      relayout();
    },
    record: () => ({
      layout, ratios: { ...ratios }, map: mapKey,
      views: views.map((v, i) => {
        const camera = i === active ? fly.forgeViewState() : v.camera;
        return { kind: camera?.view ?? v.kind, camera, look: i === active ? o.lookNow() : v.look };
      }),
    }),
    restore: (record) => {
      if (!record) return;
      activateMain();
      Object.assign(ratios, record.ratios);
      mapKey = record.map;
      record.views.forEach((r, i) => {
        const v = views[i];
        if (!v) return;
        v.kind = r.kind;
        if (i > 0) { v.camera = r.camera; v.look = r.look; }
      });
      layout = record.layout;
      drawMenu();
      relayout();
    },
    mapOpened: (key) => {
      activateMain();
      ready = true;
      if (key !== mapKey) {
        // Another map: the other views start again from the first view's camera, each its own projection.
        for (let i = 1; i < views.length; i++) { const v = views[i]!; v.kind = v.camera?.view ?? v.kind; v.camera = null; }
        mapKey = key;
      }
      views[0]!.camera = null;
      for (let i = 1; i < splitCount(layout); i++) ensureCamera(i);
      relayout();
    },
    dispose: () => {
      doc.removeEventListener('pointerdown', onDocDown, true);
      layer.remove();
      menu.remove();
    },
  };
}
