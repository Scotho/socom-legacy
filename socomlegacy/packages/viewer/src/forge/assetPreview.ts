import './assetPreview.css';
import { Box3, Group, Mesh, PerspectiveCamera, Scene, Vector3, type BufferGeometry, type Object3D } from 'three';

/**
 * Browser adaptation: an isolated visual inspection of a real staged prototype, with borrowed source materials. FUI-22
 * (D1, the owner 2026-10-27: "keep the object preview and add it as a tooltip overlay"): the preview is the body of the
 * asset list's one tooltip (`./assetTooltip`) -- the canvas, the name and the source/collision line, turning slowly
 * unless reduced motion is asked for; a tooltip takes no input, so it has no orbit, no buttons and no keys of its own.
 * Its renderer and its disposal discipline are the panel's as they were: one lazy renderer, the asynchronous (WebGPU)
 * shutdown observed, a private view of each staged handle, every late handle released.
 */
export interface PreviewRenderer {
  render(scene: Scene, camera: PerspectiveCamera): void;
  resize(width: number, height: number): void;
  dispose(): void | Promise<void>;
}
export interface PreviewAsset {
  object: Object3D;
  name: string;
  source: string;
  collision: string;
  /** Release the staged handle, not a borrowed Object3D clone. */
  dispose(): void;
}
export interface AssetPreviewOptions {
  resolve(asset: string): Promise<PreviewAsset | null>;
  renderer?(canvas: HTMLCanvasElement): Promise<PreviewRenderer>;
}
/** The preview's slow turn, radians a second (the panel's Rotate as it was); never while reduced motion is asked for. */
export const PREVIEW_SPIN_RATE = .35;
/** Shutdown may be asynchronous (WebGPU). Observe both late creation and ordinary teardown without reopening UI. */
function disposeRenderer(renderer: PreviewRenderer): void {
  try { void Promise.resolve(renderer.dispose()).catch(() => undefined); }
  catch { /* A renderer shutdown failure does not retain the staged handle or resurrect its detached view. */ }
}
/** Bounds/culling caches and instance buffers belong to this private view, never the page's staged object. */
function privateView(source: Object3D): { object: Object3D; dispose(): void } {
  const object = source.clone(true), geometries = new Map<BufferGeometry, BufferGeometry>();
  object.traverse(child => {
    if (!(child instanceof Mesh)) return;
    const borrowed: BufferGeometry = child.geometry;
    let geometry = geometries.get(borrowed);
    if (!geometry) { geometry = borrowed.clone(); geometries.set(borrowed, geometry); }
    child.geometry = geometry;
  });
  return { object, dispose() {
    object.removeFromParent();
    object.traverse(child => child.dispose());
    for (const geometry of geometries.values()) geometry.dispose();
  } };
}

export type AssetPreview = ReturnType<typeof createAssetPreview>;

/** The preview mounted in `host` (the tooltip's overlay): its root, `show`, `frame`, `setActive` and `dispose`. */
export function createAssetPreview(host: HTMLElement, options: AssetPreviewOptions) {
  const doc = host.ownerDocument;
  const root = doc.createElement('div'); root.className = 'fx-asset-preview';
  const canvas = doc.createElement('canvas'); canvas.setAttribute('aria-hidden', 'true');
  const name = doc.createElement('p'); name.className = 'fx-preview-name';
  const detail = doc.createElement('p'); detail.className = 'fx-preview-detail';
  const status = doc.createElement('p'); status.className = 'fx-preview-status'; status.setAttribute('role', 'status');
  root.append(canvas, name, detail, status); host.append(root);
  const scene = new Scene(), pivot = new Group(), camera = new PerspectiveCamera(38, 1, .1, 10000);
  scene.add(pivot);
  let renderer: PreviewRenderer | null = null, creating: Promise<PreviewRenderer> | null = null;
  let disposed = false, active = true, generation = 0, shown: string | null = null;
  let current: { handle: PreviewAsset; view: ReturnType<typeof privateView> } | null = null;
  const pending = new Set<PreviewAsset>(), released = new WeakSet<PreviewAsset>();
  let radius = 1, yaw = Math.PI / 5, widthNow = 0, heightNow = 0;
  const pitch = Math.PI / 10;
  const reduced = doc.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)');
  const releaseHandle = (handle: PreviewAsset): void => {
    pending.delete(handle);
    if (!released.has(handle)) { released.add(handle); handle.dispose(); }
  };
  const clear = (): void => {
    if (current) { const old = current; current = null; old.view.dispose(); releaseHandle(old.handle); }
    for (const handle of [...pending]) releaseHandle(handle);
  };
  const position = (): void => {
    const aspect = Math.max(.2, camera.aspect);
    const distance = radius * 1.18 / Math.sin(Math.atan(Math.tan(camera.fov * Math.PI / 360) * Math.min(1, aspect)));
    camera.position.set(Math.sin(yaw) * Math.cos(pitch) * distance, Math.sin(pitch) * distance, Math.cos(yaw) * Math.cos(pitch) * distance);
    camera.near = Math.max(.01, distance / 1000); camera.far = distance + radius * 8;
    camera.lookAt(0, 0, 0); camera.updateProjectionMatrix();
  };
  const resetView = (): void => { yaw = Math.PI / 5; position(); };
  const getRenderer = (): Promise<PreviewRenderer> => {
    if (!creating) creating = (options.renderer ?? (async (element: HTMLCanvasElement) => {
      const view = await (await import('../renderer')).createRenderer(element);
      view.setClearColor([11, 20, 24]);
      return { render: (s: Scene, c: PerspectiveCamera) => view.render(s, c), resize: (w: number, h: number) => view.resize(w, h), dispose: () => view.renderer.dispose() };
    }))(canvas).then(value => {
      if (disposed) disposeRenderer(value); else renderer = value;
      return value;
    }).catch((error: unknown) => { creating = null; throw error; });
    return creating;
  };
  canvas.hidden = true;
  return {
    root,
    /** The asset shown, or null. */
    shown: (): string | null => shown,
    async show(asset: string | null): Promise<void> {
      if (disposed || !active || asset === shown) return;
      shown = asset; const token = ++generation; clear();
      canvas.hidden = true; name.textContent = ''; detail.textContent = '';
      if (!asset) { status.textContent = ''; return; }
      status.textContent = 'Preparing preview…';
      let handle: PreviewAsset | null = null, view: ReturnType<typeof privateView> | null = null;
      try {
        handle = await options.resolve(asset);
        if (disposed || !active || token !== generation) return;
        if (!handle) { status.textContent = 'This asset is not loaded. Choose a prop from the current palette.'; return; }
        pending.add(handle);
        await getRenderer();
        if (disposed || !active || token !== generation) return;
        view = privateView(handle.object); view.object.updateMatrixWorld(true);
        const bounds = new Box3().setFromObject(view.object, true);
        if (bounds.isEmpty()) { status.textContent = 'This asset has no visible geometry to preview.'; return; }
        radius = Math.max(.01, bounds.getSize(new Vector3()).length() / 2);
        view.object.position.sub(bounds.getCenter(new Vector3())); pivot.add(view.object);
        name.textContent = handle.name; detail.textContent = `${handle.source} · ${handle.collision}`;
        status.textContent = '';
        current = { handle, view }; pending.delete(handle); handle = null; view = null;
        canvas.hidden = false; resetView();
      } catch {
        if (!disposed && token === generation) status.textContent = 'Preview unavailable. You can still choose this asset in the list.';
      } finally { view?.dispose(); if (handle) releaseHandle(handle); }
    },
    frame(dt: number, visible: boolean): void {
      if (disposed || !active || !visible || doc.visibilityState === 'hidden' || !root.getClientRects().length || !renderer || !current) return;
      const width = Math.max(1, canvas.clientWidth), height = Math.max(1, canvas.clientHeight);
      if (camera.aspect !== width / height) { camera.aspect = width / height; position(); }
      if (width !== widthNow || height !== heightNow) { widthNow = width; heightNow = height; renderer.resize(width, height); }
      if (!reduced?.matches) { yaw += Math.min(dt, .1) * PREVIEW_SPIN_RATE; position(); }
      try { renderer.render(scene, camera); }
      catch { clear(); canvas.hidden = true; status.textContent = 'Preview unavailable. You can still choose this asset in the list.'; }
    },
    /** Inactive outside admitted Build: what it holds released, nothing shown until it is active again. */
    setActive(enabled: boolean): void {
      if (active === enabled || disposed) return;
      active = enabled; root.inert = !enabled; root.setAttribute('aria-disabled', String(!enabled));
      if (!enabled) { generation++; shown = null; clear(); canvas.hidden = true; name.textContent = ''; detail.textContent = ''; status.textContent = ''; }
    },
    dispose(): void {
      if (disposed) return;
      disposed = true; generation++; clear();
      if (renderer) disposeRenderer(renderer);
      renderer = null; root.remove();
    },
  };
}
