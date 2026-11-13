import { createAssetPreview, type PreviewRenderer } from '../forge/assetPreview';
import { createAssetTooltip, type AssetTooltip } from '../forge/assetTooltip';
import { ASSET_DRAG_MIME, createAssetDrag } from '../forge/assetDrag';
import { agentCodeWords } from '../agent/codes';
import type { LocalPackApi } from '../agent/localPacks';
import { DROPZONE_BLOCKED_BUILD } from '../agent/fileDropzone';
import { mountAssetFileStaging } from './assetFileStaging';
import type { ForgeAgentCatalogue } from '../forge/agent/api';
import type { ForgeEditor, ForgePanelContext, StagedPiece } from '../forge/shell/context';
import type { ForgePanel, ForgePanelInstance } from '../forge/shell/panel';

/** Controller's 10:00 staged-ghost proposal; page implementation and canonical shell types are still owed. */
export interface AssetGhostStage extends StagedPiece {
  show(at: [number, number, number], yaw: number, admitted: boolean): void;
  hide(): void;
}
export type AssetDropProjection = {
  point: [number, number, number]; snapped: [number, number, number]; yaw: number;
} | { reason: string };
export interface AssetViewportEditor extends ForgeEditor {
  stagePiece(asset: string): Promise<AssetGhostStage | null>;
  previewPiece?(asset: string): Promise<Pick<StagedPiece, 'object' | 'dispose'> | null>;
  hoverSound?(asset: string | null): void;
  soundProgress?(asset: string): number | null;
  viewport(): HTMLElement;
  projectDrop(clientX: number, clientY: number): AssetDropProjection;
  projectCentre?(): AssetDropProjection;
  sourceIdentity(asset: string): object | null;
}

/**
 * Browser adaptation: loaded prototype inspection and guarded placements through the page-owned editor seam. FUI-22
 * (D5, FUI.R21: one asset list on the left): the creator's own chip grid of the palette's names is gone; what it did is
 * bound to the one list's tiles (`createAssetTiles` -- the page's `[data-asset]` rows): the drag onto the world, its
 * staged ghost and its hint, and (D1) the tooltip preview of the hovered or active tile. Its pack loading is the Local
 * files panel (`assetsForgePanel`), the right dock's Content tab.
 */
export interface AssetTilesOptions {
  renderer?(canvas: HTMLCanvasElement): Promise<PreviewRenderer>;
  /** The Forge setting (D1: "a setting to turn it off"): whether a tile's tooltip shows; always when absent. */
  tips?(): boolean;
}
export interface AssetTiles extends Required<Pick<ForgePanelInstance, 'update' | 'visibility' | 'dispose'>> {
  frame(dt: number): void;
  /** The asset picked for placement (the list's click, the pad's step): its tooltip beside its tile at once. */
  activate(asset: string | null): void;
  /** The list was redrawn: the tooltip follows its tile. */
  redrawn(): void;
  /** The page's Escape: the tooltip goes, and an unplaced drag with it. */
  escape(): void;
  /** A static image rendered by the shared thumbnail preview. */
  thumbnail(asset: string, width: number, height: number): Promise<string | null>;
  /** The tile drag in flight that can still be dropped (its token, as the drag's data carries it), or null. */
  dragToken(): string | null;
  /** The asset of the tile drag in flight that can still be dropped (the Inspector's drop, a browser adaptation), or null. */
  dragAsset(): string | null;
  /**
   * The drag in flight dropped at the centre of the view, as the camera sees it (the Outliner's drop, a browser
   * adaptation): placed through the same guarded path as a drop on the world, or refused and said.
   */
  dropAtCentre(token: string): Promise<boolean>;
  readonly tooltip: AssetTooltip;
}

export function createAssetTiles(list: HTMLElement, ctx: ForgePanelContext, options: AssetTilesOptions = {}): AssetTiles {
  const doc = ctx.doc;
  const events = new ((doc.defaultView as (Window & typeof globalThis) | null)?.AbortController ?? AbortController)();
  const documentVisible = (): boolean => doc.visibilityState !== 'hidden';
  const candidate = ctx.editor as Partial<AssetViewportEditor> | undefined;
  const editor = candidate && ['stagePiece', 'place', 'viewport', 'projectDrop', 'sourceIdentity'].every(key =>
    typeof candidate[key as keyof AssetViewportEditor] === 'function') ? candidate as AssetViewportEditor : null;
  const viewport = editor?.viewport() ?? null;
  const hint = doc.createElement('p'); hint.className = 'fx-asset-drop-hint'; hint.dataset.assetDropPreview = '';
  hint.setAttribute('role', 'status'); hint.hidden = true; viewport?.append(hint);
  const released = new WeakSet<AssetGhostStage>(), previewStages = new Set<AssetGhostStage>();
  let disposed = false, visible = true;
  let viewportDepth = 0, previewRequest = 0;
  let previewSource: object | null = null;
  let palette: ForgeAgentCatalogue['palette'] = [];
  type Placement = Extract<AssetDropProjection, { snapped: unknown }>;
  type Session = {
    asset: string; token: string; revision: number; source: object; ready: Promise<AssetGhostStage | null>;
    handle: AssetGhostStage | null; last: Placement | null; projection: AssetDropProjection | null;
    cancelled: boolean; pending: boolean; placing: boolean; consumed: boolean; refused: boolean;
  };
  let session: Session | null = null;
  const blockReason = (): string | null => {
    if (disposed || ctx.signal.aborted) return 'The Forge has closed';
    if (!visible || doc.visibilityState === 'hidden') return 'Show the assets to place them';
    const state = ctx.state();
    if (state.surface !== 'build' || !state.canPlace) return state.reason ?? 'Return to Build to place assets';
    return editor ? null : 'Asset placement is not ready on this page';
  };
  const releaseStage = (handle: AssetGhostStage): void => {
    previewStages.delete(handle);
    if (released.has(handle)) return;
    released.add(handle);
    if (!handle.disposed) {
      try { if (typeof handle.hide === 'function') handle.hide(); }
      catch { /* A failed hide must not strand this piece or stop the other panels' cleanup. */ }
      finally { try { handle.dispose(); } catch { /* Other owned resources still have to be released. */ } }
    }
  };
  const ghostCapable = (handle: AssetGhostStage): boolean => typeof handle.show === 'function' && typeof handle.hide === 'function';
  const staleReason = (s: Session): string | null => blockReason()
    ?? (s.cancelled ? 'Asset placement was cancelled' : editor?.sourceIdentity(s.asset) !== s.source ? 'This asset is no longer loaded'
      : ctx.state().revision !== s.revision ? 'The layout changed — drag the asset again' : null);
  const clearHint = (): void => { hint.hidden = true; hint.textContent = ''; if (viewport) delete viewport.dataset.assetDrop; };
  const finish = (s: Session): void => {
    s.cancelled = true;
    if (!s.placing && !s.consumed && s.handle) releaseStage(s.handle);
    if (session !== s) return;
    session = null; viewportDepth = 0; drag.cancel(s.token); clearHint();
  };
  const refuse = (s: Session, reason: string): void => {
    if (!disposed && !s.refused) { s.refused = true; ctx.ui.refused(reason); }
  };
  const renderProjection = (s: Session): void => {
    if (!s.projection || session !== s || s.cancelled) return;
    const admitted = !staleReason(s) && !('reason' in s.projection);
    if (s.handle && !s.handle.disposed && s.last) s.handle.show([...s.last.snapped], s.last.yaw, admitted);
    if (viewport) viewport.dataset.assetDrop = admitted ? 'valid' : 'blocked';
    hint.hidden = false;
    hint.textContent = 'reason' in s.projection ? s.projection.reason
      : `Release to place at ${s.projection.snapped.join(', ')} · yaw ${s.projection.yaw}. Undo removes it.`;
  };
  const project = (s: Session, x: number, y: number): Placement | null => {
    const reason = staleReason(s);
    s.projection = reason ? { reason } : editor!.projectDrop(x, y);
    if (!('reason' in s.projection)) s.last = s.projection;
    renderProjection(s);
    return 'reason' in s.projection ? null : s.projection;
  };
  const drag = createAssetDrag({
    snapshot: asset => ({ revision: ctx.state().revision, source: editor?.sourceIdentity(asset) ?? null, blocked: blockReason() }),
    create: async (_asset, point) => {
      const s = session;
      if (!s) return null;
      const handle = await s.ready;
      if (!handle || staleReason(s)) { if (handle) releaseStage(handle); return null; }
      return {
        async commit() {
          if (staleReason(s)) return false;
          s.placing = true;
          try {
            const result = await editor!.place(handle, point.at, point.yaw);
            s.consumed = result.ok;
            if (!result.ok) refuse(s, result.code ? agentCodeWords(result.code) : 'Asset was not placed. Try again in Build.');
            return result.ok;
          } finally { s.placing = false; }
        },
        dispose() { if (!s.consumed) releaseStage(handle); },
      };
    },
  });
  // D1: the one tooltip, its preview the panel's as it was -- the real staged piece, its admission checked first.
  const stagePreview = async (asset: string, currentRequest: () => boolean, accepted?: (source: object) => void) => {
    if (blockReason() || !editor || !currentRequest()) return null;
    const revision = ctx.state().revision, source = editor.sourceIdentity(asset);
    if (!source) return null;
    // The tooltip draws the preview's own build where the editor has one (the owner, 2026-11-11: previews textured, with
    // their geometry, never the Draw menu's wireframe or overlays), as the thumbnails do; a staged piece otherwise.
    if (editor.previewPiece) {
      const shown = await editor.previewPiece(asset);
      if (!shown) return null;
      if (!currentRequest() || blockReason() || ctx.state().revision !== revision || editor.sourceIdentity(asset) !== source) {
        shown.dispose();
        return null;
      }
      accepted?.(source);
      const at = asset.indexOf(':');
      return {
        object: shown.object,
        name: palette.find(entry => entry.asset === asset)?.model ?? (at > 0 ? asset.slice(at + 1) : asset),
        source: at > 0 ? asset.slice(0, at) : asset,
        collision: 'Collision checked in the world',
        dispose: shown.dispose,
      };
    }
    const handle = await editor.stagePiece(asset);
    if (!handle) return null;
    if (!currentRequest() || blockReason() || ctx.state().revision !== revision || editor.sourceIdentity(asset) !== source) {
      releaseStage(handle);
      return null;
    }
    if (!ghostCapable(handle)) {
      releaseStage(handle);
      if (!blockReason()) ctx.ui.refused('This page cannot preview the prepared asset yet.');
      return null;
    }
    previewStages.add(handle);
    accepted?.(source);
    const id = asset.indexOf(':');
    return {
      object: handle.object,
      name: palette.find(entry => entry.asset === asset)?.model ?? (id > 0 ? asset.slice(id + 1) : asset),
      source: id > 0 ? asset.slice(0, id) : asset,
      collision: 'Collision checked in the world',
      dispose: () => releaseStage(handle),
    };
  };
  const tooltip = createAssetTooltip(doc, {
    ...(options.renderer ? { renderer: options.renderer } : {}),
    clearColor: [64, 64, 64],
    allowed: () => !blockReason() && (options.tips?.() ?? true),
    // Its hover sound (an ambient effect's, the owner 2026-11-11): played while its preview shows, stopped when it goes.
    onShown: (asset) => { editor?.hoverSound?.(asset); },
    // Its sound's timeline under the picture while it plays (an ambient effect's).
    progress: (asset) => editor?.soundProgress?.(asset) ?? null,
    resolve: async asset => {
      const request = ++previewRequest;
      return stagePreview(asset, () => request === previewRequest, source => { previewSource = source; });
    },
  });
  const resolveThumbnail = async (asset: string) => {
    if (disposed || !visible || !documentVisible() || !editor?.previewPiece) return null;
    const revision = ctx.state().revision;
    const handle = await editor.previewPiece(asset);
    if (!handle) return null;
    const source = editor.sourceIdentity(asset);
    if (disposed || !visible || !documentVisible() || ctx.state().revision !== revision || editor.sourceIdentity(asset) !== source) {
      handle.dispose();
      return null;
    }
    if (!source) { handle.dispose(); return null; }
    const id = asset.indexOf(':');
    return {
      object: handle.object,
      name: palette.find(entry => entry.asset === asset)?.model ?? (id > 0 ? asset.slice(id + 1) : asset),
      source: id > 0 ? asset.slice(0, id) : asset,
      collision: 'Collision checked in the world',
      dispose: handle.dispose,
    };
  };
  const thumbnailHost = doc.createElement('div');
  thumbnailHost.className = 'fx-asset-thumbnail-host';
  thumbnailHost.setAttribute('aria-hidden', 'true');
  doc.body.append(thumbnailHost);
  const thumbnailPreview = createAssetPreview(thumbnailHost, {
    ...(options.renderer ? { renderer: options.renderer } : {}),
    clearColor: [64, 64, 64],
    resolve: resolveThumbnail,
  });
  const offTips = tooltip.attach(list);
  // No picture under the cursor while a tile is dragged (the owner, 2026-11-10: "don't show the image on the cursor"):
  // the browser's drag image a transparent pixel, made at once so it is ready by the first drag; the world's ghost shows it.
  const blankDragImage = doc.createElement('img');
  blankDragImage.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
  const start = (asset: string, event: DragEvent): void => {
    const reason = blockReason();
    if (reason || !event.dataTransfer || !editor) { event.preventDefault(); if (reason) ctx.ui.refused(reason); return; }
    if (session?.pending) { event.preventDefault(); return; }
    if (session) finish(session);
    tooltip.hide();                                                    // the drag's ghost is the preview now
    const token = drag.begin(asset), source = editor.sourceIdentity(asset);
    if (!token || !source) { event.preventDefault(); ctx.ui.refused('This asset is no longer loaded'); return; }
    const s: Session = { asset, token, source, revision: ctx.state().revision, ready: Promise.resolve(null), handle: null,
      last: null, projection: null, cancelled: false, pending: false, placing: false, consumed: false, refused: false };
    session = s;
    event.dataTransfer.setData(ASSET_DRAG_MIME, token); event.dataTransfer.effectAllowed = 'copy';
    try { event.dataTransfer.setDragImage(blankDragImage, 0, 0); } catch { /* a browser without it shows its own */ }
    s.ready = editor.stagePiece(asset).then(handle => {
      if (!handle) { if (!s.cancelled) refuse(s, ctx.state().reason ?? 'This asset could not be prepared for placement.'); finish(s); return null; }
      if (!ghostCapable(handle)) {
        releaseStage(handle); if (!s.cancelled) refuse(s, 'This page cannot show the prepared placement yet.'); finish(s); return null;
      }
      if (staleReason(s) || session !== s) { releaseStage(handle); return null; }
      s.handle = handle; renderProjection(s); return handle;
    }, () => { if (!s.cancelled) refuse(s, 'This asset could not be prepared for placement.'); finish(s); return null; });
  };
  const listen = <K extends keyof HTMLElementEventMap>(element: HTMLElement, type: K, handler: (event: HTMLElementEventMap[K]) => void): void => {
    element.addEventListener(type, handler, { signal: events.signal });
  };
  const tileOf = (target: EventTarget | null): HTMLElement | null => {
    const el = target as Element | null;
    const tile = typeof el?.closest === 'function' ? el.closest<HTMLElement>('[data-asset]') : null;
    return tile && list.contains(tile) ? tile : null;
  };
  listen(list, 'dragstart', event => { const tile = tileOf(event.target); if (tile?.dataset['asset']) start(tile.dataset['asset'], event); });
  listen(list, 'dragend', () => { if (session && !session.pending) finish(session); else drag.end(); });
  const update = (): void => {
    if (disposed) return;
    if (session && staleReason(session)) finish(session);
    const admitted = !blockReason(); if (!admitted) previewRequest++;
    tooltip.setActive(admitted);
    thumbnailPreview.setActive(!disposed && visible && documentVisible());
    if (!admitted) for (const handle of [...previewStages]) releaseStage(handle);
    const catalogue = ctx.forge.read().catalogue;
    palette = Array.isArray(catalogue.palette) ? catalogue.palette as ForgeAgentCatalogue['palette'] : [];
    const shown = tooltip.shown();
    if (shown && admitted && previewSource && (editor?.sourceIdentity(shown) ?? null) !== previewSource) {
      // The same id from a reloaded source: let the old staged piece go, stage the new one.
      previewRequest++; previewSource = null;
      for (const handle of [...previewStages]) releaseStage(handle);
      if (editor?.sourceIdentity(shown)) tooltip.restage(); else tooltip.hide();
    }
  };
  const escape = (): void => { if (session) finish(session); tooltip.hide(); };
  listen(list, 'keydown', event => { if (event.key === 'Escape') escape(); });
  if (viewport) {
    listen(viewport, 'dragenter', event => {
      if (!session || session.pending || !event.dataTransfer?.types.includes(ASSET_DRAG_MIME)) return;
      event.preventDefault(); viewportDepth++;
    });
    listen(viewport, 'dragover', event => {
      if (!event.dataTransfer?.types.includes(ASSET_DRAG_MIME)) return;
      event.preventDefault();
      const point = session && !session.pending ? project(session, event.clientX, event.clientY) : null;
      event.dataTransfer.dropEffect = point ? 'copy' : 'none';
    });
    listen(viewport, 'dragleave', event => {
      const NodeType = doc.defaultView?.Node;
      if (NodeType && event.relatedTarget instanceof NodeType && viewport.contains(event.relatedTarget)) {
        viewportDepth = Math.max(0, viewportDepth - 1); return;
      }
      viewportDepth = event.relatedTarget ? 0 : Math.max(0, viewportDepth - 1);
      // Out of the view: its ghost and hint put away, the drag kept (it may still drop on the Outliner); `dragend` ends it.
      if (viewportDepth === 0 && session && !session.pending) {
        if (session.handle && !session.handle.disposed) session.handle.hide();
        session.projection = null;
        clearHint();
      }
    });
    listen(viewport, 'drop', event => {
      if (event.dataTransfer?.types.includes('text/uri-list')) {
        event.preventDefault(); event.stopPropagation(); ctx.ui.refused('URL drops are not supported. Add local files in the Content tab.'); return;
      }
      if (!event.dataTransfer?.types.includes(ASSET_DRAG_MIME)) return;
      event.preventDefault(); event.stopPropagation();
      const s = session, token = event.dataTransfer.getData(ASSET_DRAG_MIME);
      if (!s || s.pending || token !== s.token) return;
      const point = project(s, event.clientX, event.clientY);
      s.pending = true;
      void drag.drop(token, point ? { at: [...point.snapped], yaw: point.yaw } : null).then(ok => {
        if (disposed) return;
        if (ok) ctx.ui.accepted(); else refuse(s, staleReason(s) ?? ('reason' in (s.projection ?? {}) ? (s.projection as { reason: string }).reason : 'Asset was not placed. Drag it onto a supported surface in Build.'));
      }, () => refuse(s, 'Asset could not be placed. Try again in Build.')).finally(() => finish(s));
    });
  }
  const dropAtCentre = async (token: string): Promise<boolean> => {
    const s = session;
    if (!s || s.pending || token !== s.token || !editor) return false;
    const reason = staleReason(s);
    const projection = reason ? { reason } : editor.projectCentre ? editor.projectCentre() : { reason: 'Asset placement is not ready on this page' };
    s.projection = projection;
    s.pending = true;
    try {
      const ok = await drag.drop(token, 'reason' in projection ? null : { at: [...projection.snapped], yaw: projection.yaw });
      if (!disposed) {
        if (ok) ctx.ui.accepted();
        else refuse(s, staleReason(s) ?? ('reason' in projection ? projection.reason : 'Asset was not placed. Try again in Build.'));
      }
      return ok;
    } catch {
      refuse(s, 'Asset could not be placed. Try again in Build.');
      return false;
    } finally { finish(s); }
  };
  const onVisibility = (): void => { update(); };
  doc.addEventListener('visibilitychange', onVisibility);
  const unsubscribe = ctx.forge.subscribe(update);
  const dispose = (): void => {
    if (disposed) return;
    disposed = true; if (session) finish(session); offTips(); tooltip.dispose(); thumbnailPreview.dispose(); thumbnailHost.remove();
    for (const handle of [...previewStages]) releaseStage(handle);
    unsubscribe(); events.abort(); doc.removeEventListener('visibilitychange', onVisibility); ctx.signal.removeEventListener('abort', dispose);
    clearHint(); hint.remove();
  };
  ctx.signal.addEventListener('abort', dispose, { once: true });
  if (ctx.signal.aborted) dispose(); else update();
  return {
    tooltip, update, dispose, escape,
    frame(dt) { if (session && staleReason(session)) finish(session); tooltip.frame(dt); },
    visibility(shown) { visible = shown; if (!shown) tooltip.hide(); update(); },
    activate(asset) { if (!disposed) tooltip.activate(asset); },
    thumbnail(asset, width, height) {
      return disposed || !visible || !documentVisible() ? Promise.resolve(null) : thumbnailPreview.capture(asset, width, height);
    },
    redrawn() { if (!disposed) tooltip.reanchor(); },
    dragToken: () => (session && !session.pending && !session.cancelled ? session.token : null),
    dragAsset: () => (session && !session.pending && !session.cancelled ? session.asset : null),
    dropAtCentre,
  };
}

/** Browser adaptation: the page's local packs staged from local files -- the Local files panel, the Content tab. */
export interface AssetsForgePanelOptions {
  /** The page's existing instance, also used by its agent target. Its common owner disposes it. */
  packs?: Pick<LocalPackApi, 'stage'>;
}
export function assetsForgePanel(options: AssetsForgePanelOptions = {}): ForgePanel {
  return {
    id: 'creator-assets', title: 'Local files', dock: 'right', order: 70, defaultOpen: true, tab: 'Content',
    availableIn: ['build'], padLegend: [{ button: 'cross', label: 'Choose files' }, { button: 'circle', label: 'Back' }],
    mount(host, ctx) {
      const doc = ctx.doc;
      const root = doc.createElement('section'); root.className = 'fx-creator-assets fx-section';
      host.append(root);
      let disposed = false, visible = true;
      const allowed = (): boolean => {
        if (disposed || ctx.signal.aborted || !visible || doc.visibilityState === 'hidden') return false;
        const state = ctx.state();
        return state.surface === 'build' && state.canPlace;
      };
      // LATER 799: in Build behind another tab the panel is only hidden, so the words name its tab, not Build.
      const blockedReason = (): string => {
        const state = ctx.state();
        return !visible && state.surface === 'build' && state.canPlace ? 'Open Content to add local files.' : DROPZONE_BLOCKED_BUILD;
      };
      const files = options.packs ? mountAssetFileStaging(root, {
        packs: options.packs, allowed, blockedReason, refresh: () => ctx.forge.refreshExternalState(), signal: ctx.signal,
      }) : null;
      if (!files) { const none = doc.createElement('p'); none.className = 'fx-empty'; none.textContent = 'Local files are not available here.'; root.append(none); }
      const update = (): void => { if (!disposed) files?.refresh(); };
      const unsubscribe = ctx.forge.subscribe(update);
      const dispose = (): void => {
        if (disposed) return;
        disposed = true; files?.dispose(); unsubscribe(); ctx.signal.removeEventListener('abort', dispose); root.remove();
      };
      ctx.signal.addEventListener('abort', dispose, { once: true });
      if (ctx.signal.aborted) dispose(); else update();
      return { update, visibility(shown) { visible = shown; update(); }, dispose };
    },
  };
}
