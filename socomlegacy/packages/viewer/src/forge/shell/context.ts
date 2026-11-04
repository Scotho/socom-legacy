import type { Object3D } from 'three';
import type { ForgeAgentApi } from '../agent/api';
import type { ExtensionHost } from '../../packs/systems/host';
import type { CardHandle, CardOptions } from './cards';
import type { ForgePulseKind, NotifyHandle, NotifyOptions } from './notify';
import type { StatusChipHandle, StatusChipSpec } from './statusBar';
import type { ForgeShellState } from './state';

/**
 * FUI-1 (the review's UX-2; a browser adaptation, FG.R2): what a registered panel is handed. A panel changes the layout
 * only through `forge` (the revision-guarded facade the agent uses) or `editor` (FUI-1b: the same facade, with the real
 * piece staged beside it), reads the surface and the edit rule through `state()`, and keeps its per-viewer conveniences
 * in `store`; `signal` aborts when the panel is unregistered or the page is torn down, so a listener or a timer tied to it
 * comes off with it.
 */
export interface ForgeUi {
  /**
   * FUI-4 (`./notify`): a notice -- the status line's lasting word by default, `{ kind: 'toast' }` a passing event,
   * `'error'` / `'refusal'` kept in the line until replaced; `true` is the older `error` flag. Every notice reaches the
   * message log and the live region.
   */
  notify(message: string, options?: boolean | NotifyOptions): NotifyHandle | void;
  /** A passing event: the toast (never the status line). */
  toast(message: string): void;
  /**
   * FUI-4 (FUI-1b's prerequisite): an action accepted -- `pulse('accept')`, and its words, when given, as a passing toast.
   * Absent in a rig.
   */
  accepted?(message?: string): void;
  /**
   * R4 (the UI seat's ruling to dot, 2026-10-25 11:34Z): the one haptic path (`./notify` `ForgePulseKind`) -- a panel's
   * accepted d-pad move or section jump is `pulse('navigate')`, with no toast. Absent in a rig.
   */
  pulse?(kind: ForgePulseKind): void;
  /** FUI-4: an action refused, with the reason a person reads -- kept in the status line until replaced. Absent in a rig. */
  refused?(message: string): void;
  /** FUI-4: a status chip in the status bar's strip (`./statusBar`). Absent in a rig with no page. */
  registerStatusChip?(spec: StatusChipSpec): StatusChipHandle;
  /** Show a registered panel: its dock shown, the panel opened and brought into view. */
  reveal(panelId: string): void;
  /** Fold a registered panel. */
  collapse(panelId: string): void;
  /** FUI-2: push a card on the page's one card stack (`./cards`); its handle's `close` pops it. Absent in a rig with no page. */
  open?(card: HTMLElement, options: CardOptions): CardHandle;
  /** FUI-2: the focus lease (`ForgeFocus`). Absent in a rig with no page. */
  focus?: ForgeFocus;
}

/**
 * FUI-2 (FUI-1b's named prerequisite; a browser adaptation, FG.R2): the focus lease. While a panel holds it the editor's
 * keys, its camera and its pad lanes are held, and the pad goes to that panel's `pad()`; START still opens the Forge
 * menu. One holder at a time: a second `take` supersedes the first, whose release then lets go of nothing. A panel that
 * is not shown is refused (the release is a no-op). The lease is let go when the panel is hidden or folded, disposed or
 * its signal aborts. (A drop staged through `editor` is cancelled once `state().canPlace` turns false, held or not: R3-A.)
 * R3-A: Escape and M let it go from the keyboard (`../keys` `forgeLeaseExit`), as the pad's Circle does, unless the
 * holding panel's own key handler takes the key first.
 */
export interface ForgeFocus {
  /** Take the focus for `panelId`; the function lets it go (a second call, or one after a supersede, is nothing). */
  take(panelId: string): () => void;
  /** The panel holding the lease, or null. */
  holder(): string | null;
}

/** What the page's lease reads: whether a panel is shown now, and a change of holder (the page holds its keys and camera). */
export interface FocusLeaseOptions {
  shown(panelId: string): boolean;
  onChange?(holder: string | null): void;
}

/** The page's lease: `ForgeFocus`, plus `sync` (let go of a holder no longer shown) and `releaseAll` (teardown). */
export interface FocusLeases extends ForgeFocus {
  sync(): void;
  releaseAll(): void;
}

export function createFocusLeases(options: FocusLeaseOptions): FocusLeases {
  let held: { id: string; token: number } | null = null;
  let tokens = 0;
  const set = (next: { id: string; token: number } | null): void => {
    const was = held?.id ?? null;
    held = next;
    if ((next?.id ?? null) !== was) options.onChange?.(next?.id ?? null);
  };
  return {
    take(panelId) {
      if (!options.shown(panelId)) return () => undefined;
      const token = ++tokens;
      set({ id: panelId, token });
      return () => { if (held?.token === token) set(null); };
    },
    holder: () => held?.id ?? null,
    sync() { if (held && !options.shown(held.id)) set(null); },
    releaseAll() { if (held) set(null); },
  };
}

/**
 * A panel's own `ui`: the page's, with the card stack and the lease always there (the lease bound to the panel's signal).
 * FUI-4: `notify` always answers a handle; `accepted`, `refused` and (R4) `pulse` are the panel's only feedback (a panel
 * pulses or refuses through them, nothing else pulses); its status chips come off with its signal.
 */
export interface ForgePanelUi extends ForgeUi {
  notify(message: string, options?: boolean | NotifyOptions): NotifyHandle;
  open(card: HTMLElement, options: CardOptions): CardHandle;
  focus: ForgeFocus;
  accepted(message?: string): void;
  refused(message: string): void;
  /** R4: the page's one haptic path; nothing in a rig. */
  pulse(kind: ForgePulseKind): void;
  registerStatusChip(spec: StatusChipSpec): StatusChipHandle;
}

/** A notice's handle where the page keeps none (a test's rig). */
const NO_NOTICE: NotifyHandle = Object.freeze({ id: 0, dismiss: () => undefined });

/** The page's settings path (`../../pageStore` `pageSettings`), as narrow as a panel needs it. */
export interface ForgeStore {
  get(key: string): string | null;
  set(key: string, value: string): unknown;
}

/**
 * FUI-1b: a piece built for a drop before it is placed -- the real piece, through the page's own piece path, off the
 * scene until its `show` (R3-B: the ghost is the staged piece; a panel never draws a clone of it) -- and a panel may
 * let it go (`dispose`). The page
 * disposes it in every other case (R3-A, LATER 451): `place` disposes it whether it placed or refused; the page cancels a
 * staged drop once a placement is no longer admitted (`state().canPlace` false: its `place` then answers
 * `ADMISSION_LOST`); and a panel's staged pieces are disposed when its registration ends (its `signal` aborts). The
 * JSON facade never carries it.
 */
export interface StagedPiece {
  readonly asset: string;
  readonly object: Object3D;
  /** True once disposed: placed, refused, or let go by its panel. */
  readonly disposed: boolean;
  dispose(): void;
  /**
   * R3-B (the UI seat's ruling to dot, 2026-10-25 09:59Z: the ghost IS the staged piece): the page puts `object` in its
   * scene at `at` (game units), turned `yaw` (radians), translucent and tinted as the pad's placement ghost is --
   * `admitted` or refused. Hidden until the first call; a disposed piece shows nothing. `place` consumes it (the ghost
   * becomes the piece, one history step); `dispose` takes it out of the scene.
   */
  show(at: readonly [number, number, number], yaw: number, admitted: boolean): void;
  /** R3-B: hides the ghost (it stays staged; the next `show` draws it again). */
  hide(): void;
}

/**
 * R3-B: where a drop over the view would land -- the ray's `point`, the page's own grid / surface snap of it (`snapped`,
 * `../placement` `restingPoint` as the pad's ghost uses it) and the page's placement turn (`yaw`, radians: the tool's
 * turn state, snapped to the turn step when snap is on) -- or the refusal's words (`FORGE_REFUSALS` where one applies).
 * A caller places at `snapped` and `yaw`, never its own rounding.
 */
export type ForgeDropProjection =
  | { point: [number, number, number]; snapped: [number, number, number]; yaw: number }
  | { reason: string };

/** FUI-1b: what `ForgeEditor.place` answers: the facade's own result, narrowed (`ADMISSION_LOST`, `NOT_STAGED`, its codes). */
export interface ForgePlaceResult { ok: boolean; code?: string; revision: number }

/** FUI-1b: the editor seam a feature panel builds a drop on (the creator's asset drop, FCW-03). */
export interface ForgeEditor {
  /** The real piece of `asset`, staged off the scene; null when it does not build here or a placement is not admitted now. */
  stagePiece(asset: string): Promise<StagedPiece | null>;
  /**
   * Place a staged piece at `at` (game units), turned `yaw` (radians), as the facade's `piece.place`: one revision-guarded
   * edit, one history step. A staged piece whose admission has lapsed (`state().canPlace` false at the call) is refused
   * with `ADMISSION_LOST`; one the page did not stage, or already disposed, with `NOT_STAGED`.
   */
  place(staged: StagedPiece, at: readonly [number, number, number], yaw?: number): Promise<ForgePlaceResult>;
  /** R3-B (the viewport adapter, the UI seat's ruling to dot 2026-10-25 09:37Z): the view's element, a drop's target. */
  viewport(): HTMLElement;
  /** R3-B: a drop at the client point, projected through the page's camera (`ForgeDropProjection`). */
  projectDrop(clientX: number, clientY: number): ForgeDropProjection;
  /**
   * R3-B: an opaque object standing for the source `asset` is read from -- the same object while that source stays
   * loaded, another once it is read again; null when it is not loaded here. A caller compares it, never reads it.
   */
  sourceIdentity(asset: string): object | null;
}

/**
 * R6 (the UI seat's palette seam to dot, 2026-10-25 17:23Z / 17:24Z; a browser adaptation, FG.R2): one row of the page's
 * prop palette as its own list shows it -- after the page's search and its All / Favourites filter, in the page's order.
 */
export interface PaletteRow {
  /** `<archive>:<prototype>` (`../layout` `parseAssetId`). */
  readonly assetId: string;
  /** The prototype's name, as the page's list shows it. */
  readonly name: string;
  readonly archive: string;
  /** The page's section the row sits in ("Favourites" above the page's separator), or null. */
  readonly group: string | null;
  /** How often its archive's map places it; null for a favourite from an archive not in the palette now (`../favourites`). */
  readonly placed: number | null;
  readonly favourite: boolean;
  /** The row the page's Place tool places. */
  readonly chosen: boolean;
}
/** R6: an archive the page's palette select offers (its value and its words), and whether it fills the palette now. */
export interface PaletteArchive { readonly id: string; readonly label: string; readonly chosen: boolean }
/** R6: one of the base's characters (its player models, FG-21) the page's NPC tool places. */
export interface CharacterRow {
  /** `<side>:<type>`. */
  readonly id: string;
  /** The page's label ("SEAL 1 · <character>"). */
  readonly name: string;
  readonly side: 'seal' | 'terrorist';
  /** The page's section: "SEALs" or "Terrorists". */
  readonly group: string;
  /** Its type on the map (`LoadedMap.types`, `chartype.rdr` order). */
  readonly type: number;
  /** The body's model name, or null where the map names none. */
  readonly model: string | null;
  /** The character the page's NPC tool places. */
  readonly chosen: boolean;
}
/**
 * R6: the page's palette, owned by the page -- its state, its filter, its favourites store, its chosen row and its tools;
 * a panel renders it and asks through it. `choose` and `chooseCharacter` take the page's own paths (the toolbar list's:
 * the Place tool, the NPC tool). `subscribe` hears any change of the rows, the filter, the favourites, the chosen row or
 * character, the archive and the loading state; its return lets go (a panel's subscription also comes off with its
 * signal).
 */
export interface ForgePalette {
  rows(): PaletteRow[];
  filter(): { query: string; favouritesOnly: boolean };
  setQuery(query: string): void;
  setFavouritesOnly(on: boolean): void;
  favourite(assetId: string, on: boolean): void;
  choose(assetId: string): void;
  chosen(): string | null;
  archives(): PaletteArchive[];
  chooseArchive(id: string): void;
  characters(): CharacterRow[];
  chooseCharacter(id: string): void;
  /** Loading while the chosen archive is read; the page's own words when no row shows, else null. */
  state(): { loading: boolean; emptyReason: string | null };
  subscribe(listener: () => void): () => void;
}

/** What the page provides once; the shell adds each panel's own `signal`. */
export interface ForgePageContext {
  /** The editor's facade. Read lazily: the page builds it after the docks. */
  readonly forge: ForgeAgentApi;
  /** FUI-1b: the editor seam; absent where no editor is mounted (a test's rig). */
  readonly editor?: ForgeEditor;
  /** R6: the page's palette (`ForgePalette`); absent where no page is mounted (a test's rig). */
  readonly palette?: ForgePalette;
  /**
   * R7-2 (owed by FCW-07b-2): the page's extension host (`../../packs/systems/host`), composed with its renderer's seam
   * and engine handlers -- FCW-08's registrant reads `catalogue()` and calls `register`; nothing is registered by the
   * page. Disposed with the page (every later call answers HOST_DISPOSED); absent where no page is mounted (a test's rig).
   */
  readonly host?: ExtensionHost;
  ui: ForgeUi;
  state(): ForgeShellState;
  store: ForgeStore;
  doc: Document;
}

export interface ForgePanelContext extends ForgePageContext {
  ui: ForgePanelUi;
  signal: AbortSignal;
}

/**
 * R3-A (LATER 451): the editor seam as one panel's registration holds it -- the page's, with the pieces this panel staged
 * and has not placed disposed when its signal aborts (the panel unregistered, the page torn down); a piece staged after
 * that is let go at once. R4 (the round 3 review): every other member is the page's editor's own, read through to it --
 * `viewport`, `projectDrop`, `sourceIdentity` and any the page adds later -- so a panel sees the whole editor; only
 * `stagePiece` and `place` are this registration's (a method is called on the page's editor, never on the wrapper).
 */
function panelEditor(editor: ForgeEditor, signal: AbortSignal): ForgeEditor {
  const live = new Set<StagedPiece>();
  signal.addEventListener('abort', () => { for (const s of [...live]) s.dispose(); live.clear(); }, { once: true });
  const own: Pick<ForgeEditor, 'stagePiece' | 'place'> = {
    async stagePiece(asset) {
      const staged = await editor.stagePiece(asset);
      if (!staged) return null;
      if (signal.aborted) { staged.dispose(); return null; }
      for (const s of [...live]) if (s.disposed) live.delete(s);
      live.add(staged);
      return staged;
    },
    place(staged, at, yaw) {
      live.delete(staged);
      return editor.place(staged, at, yaw);
    },
  };
  return new Proxy(editor, {
    get(target, key) {
      if (key === 'stagePiece' || key === 'place') return own[key];
      const value: unknown = Reflect.get(target, key, target);
      return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(target) : value;
    },
  });
}

/** R6: the page's palette as one panel's registration holds it -- the page's, its subscriptions let go with the signal. */
function panelPalette(palette: ForgePalette, signal: AbortSignal): ForgePalette {
  return {
    ...palette,
    subscribe(listener) {
      if (signal.aborted) return () => undefined;
      const off = palette.subscribe(listener);
      const gone = (): void => off();
      signal.addEventListener('abort', gone, { once: true });
      return () => { signal.removeEventListener('abort', gone); off(); };
    },
  };
}

/**
 * A panel's context: the page's, read through (so `forge` and `editor` stay lazy), with the panel's own signal. FUI-2:
 * its `ui.focus.take` lets the lease go when that signal aborts (the panel unregistered, the page torn down); its
 * `ui.open` is the page's card stack (refused where the page has none, a test's rig). R3-A: its `editor` disposes the
 * pieces the panel staged when that signal aborts (`panelEditor`).
 */
export function panelContext(page: ForgePageContext, signal: AbortSignal): ForgePanelContext {
  let editorOf: { from: ForgeEditor; held: ForgeEditor } | null = null;
  let paletteOf: { from: ForgePalette; held: ForgePalette } | null = null;
  const ui: ForgePanelUi = {
    notify: (m, options) => (page.ui.notify(m, options) as NotifyHandle | undefined) ?? NO_NOTICE,
    toast: (m) => page.ui.toast(m),
    accepted: (m) => { if (page.ui.accepted) page.ui.accepted(m); else if (m) page.ui.toast(m); },
    pulse: (kind) => { page.ui.pulse?.(kind); },
    refused: (m) => { if (page.ui.refused) page.ui.refused(m); else page.ui.notify(m, true); },
    registerStatusChip: (spec) => {
      const chip = page.ui.registerStatusChip?.(spec) ?? { update: () => undefined, remove: () => undefined };
      const remove = (): void => chip.remove();
      if (signal.aborted) { remove(); return chip; }
      signal.addEventListener('abort', remove, { once: true });
      return { update: () => chip.update(), remove: () => { signal.removeEventListener('abort', remove); remove(); } };
    },
    reveal: (id) => page.ui.reveal(id),
    collapse: (id) => page.ui.collapse(id),
    open: (card, options) => {
      if (!page.ui.open) throw new Error('The Forge has no card stack here');
      return page.ui.open(card, options);
    },
    focus: {
      take: (panelId) => {
        const release = page.ui.focus?.take(panelId) ?? (() => undefined);
        if (signal.aborted) { release(); return release; }
        signal.addEventListener('abort', release, { once: true });
        return () => { signal.removeEventListener('abort', release); release(); };
      },
      holder: () => page.ui.focus?.holder() ?? null,
    },
  };
  return {
    get forge() { return page.forge; },
    get host() { return page.host; },                        // R7-2: the page's own, read through
    get editor() {
      const from = page.editor;
      if (!from) return undefined;
      if (editorOf?.from !== from) editorOf = { from, held: panelEditor(from, signal) };
      return editorOf.held;
    },
    get palette() {
      const from = page.palette;
      if (!from) return undefined;
      if (paletteOf?.from !== from) paletteOf = { from, held: panelPalette(from, signal) };
      return paletteOf.held;
    },
    ui, state: () => page.state(), store: page.store, doc: page.doc, signal,
  };
}
