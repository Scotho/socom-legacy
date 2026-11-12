import './assetPreview.css';
import {
  Box3, DataTexture, Group, LinearFilter, Mesh, MeshBasicMaterial, PerspectiveCamera, PlaneGeometry, RGBAFormat, Scene, SRGBColorSpace,
  UnsignedByteType, Vector3, type BufferGeometry, type Object3D,
} from 'three';

/**
 * Browser adaptation: an isolated visual inspection of a real staged prototype, with borrowed source materials. FUI-22
 * (D1, the owner 2026-10-27: "keep the object preview and add it as a tooltip overlay"): the canvas, name and
 * source/collision line power the asset list's tooltip and the grid's static captures. A tooltip takes no input, so it
 * has no orbit, no buttons and no keys of its own. Its renderer and disposal discipline stay panel-owned: one lazy
 * renderer per preview surface, the asynchronous (WebGPU) shutdown observed, and each staged handle released.
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
  clearColor?: [number, number, number];
  /**
   * Where the shown asset's sound stands, 0 to 1 (an ambient effect's while it plays), or null: drawn as a thin bar under
   * the picture, never pressed (the owner, 2026-11-11: "a little slider (non interactable) ... of the sound timeline").
   */
  progress?(asset: string): number | null;
}
/** The preview's slow turn, radians a second (the panel's Rotate as it was); never while reduced motion is asked for. */
export const PREVIEW_SPIN_RATE = .35;
/**
 * The preview's ground (the owner, 2026-11-11: "make it pop and stand out" -- the checkerboard was "very jarring"): a
 * neutral mid-grey, lightest behind the prop and darkening to the corners -- a dark prop's silhouette against the light
 * middle, a pale one against the grey, no pattern to fight its detail, no tint to shift its colours. A browser
 * adaptation's own look, as the content browsers of engine editors draw theirs.
 */
const GROUND_SIZE = 128;
// Lighter than a mid-grey (the owner, 2026-11-11: still no pop, the props "quite dark"): it draws darker than its
// numbers on the page's picture, and a dark prop wants a light ground behind it.
const GROUND_CENTRE = 168;                                     // #a8a8a8 behind the prop
const GROUND_EDGE = 92;                                        // #5c5c5c in the corners
function groundTexture(): DataTexture {
  const pixels = new Uint8Array(GROUND_SIZE * GROUND_SIZE * 4);
  const half = (GROUND_SIZE - 1) / 2;
  for (let y = 0; y < GROUND_SIZE; y++) {
    for (let x = 0; x < GROUND_SIZE; x++) {
      // A touch above the middle (the prop's light from above); eased, so the middle stays wide and bright.
      const d = Math.min(1, Math.hypot((x - half) / half, (y - half * 0.9) / half) / Math.SQRT2);
      const shade = Math.round(GROUND_CENTRE + (GROUND_EDGE - GROUND_CENTRE) * d * d * (3 - 2 * d));
      const offset = (y * GROUND_SIZE + x) * 4;
      pixels[offset] = pixels[offset + 1] = pixels[offset + 2] = shade;
      pixels[offset + 3] = 255;
    }
  }
  const texture = new DataTexture(pixels, GROUND_SIZE, GROUND_SIZE, RGBAFormat, UnsignedByteType);
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = texture.magFilter = LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}
/** A soft round shadow under the prop (its contact shadow): black, its alpha falling from the middle to nothing. */
function shadowTexture(): DataTexture {
  const size = 64, half = (size - 1) / 2;
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.min(1, Math.hypot((x - half) / half, (y - half) / half));
      const offset = (y * size + x) * 4;
      pixels[offset + 3] = Math.round(150 * (1 - d) * (1 - d));
    }
  }
  const texture = new DataTexture(pixels, size, size, RGBAFormat, UnsignedByteType);
  texture.minFilter = texture.magFilter = LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}
/**
 * What of a staged prop is drawn: its visible meshes' bounds alone -- an unseen pick box, a hidden guide or an editor
 * mark would make a small prop a speck in its tile (the owner, 2026-11-11: small props "hard to see").
 */
function drawnBounds(object: Object3D): Box3 {
  const box = new Box3(), part = new Box3();
  object.updateMatrixWorld(true);
  // A preview that names its own frame (an effect's: its particles come and go) is framed on that.
  let framed: Object3D | null = null;
  object.traverse((child) => { if (!framed && child.userData['forgePreviewFrame'] === true) framed = child; });
  if (framed) return new Box3().setFromObject(framed, true);
  const seen = (o: Object3D): boolean => { for (let at: Object3D | null = o; at; at = at.parent) if (!at.visible) return false; return true; };
  object.traverse((child) => {
    if (!(child instanceof Mesh) || !seen(child)) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    if (materials.every((m) => !m || m.visible === false)) return;
    part.setFromObject(child, true);
    if (!part.isEmpty()) box.union(part);
  });
  return box.isEmpty() ? new Box3().setFromObject(object, true) : box;
}/** Shutdown may be asynchronous (WebGPU). Observe both late creation and ordinary teardown without reopening UI. */
function disposeRenderer(renderer: PreviewRenderer): void {
  try { void Promise.resolve(renderer.dispose()).catch(() => undefined); }
  catch { /* A renderer shutdown failure does not retain the staged handle or resurrect its detached view. */ }
}
/** Bounds/culling caches and instance buffers belong to this private view, never the page's staged object. */
function privateView(source: Object3D): { object: Object3D; dispose(): void } {
  // A live preview (an ambient effect's particles, `./previewAssets` `ambientPreview`): drawn as itself -- it is the
  // preview's own already, made for it alone, and a copy would freeze it (its buffers apart, its step hook lost). Its
  // handle's `dispose` lets it go.
  if (source.userData['forgeLivePreview'] === true) return { object: source, dispose() { source.removeFromParent(); } };
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

/** The preview mounted in `host`: its root, live `show`/`frame`, static `capture`, `setActive` and `dispose`. */
export function createAssetPreview(host: HTMLElement, options: AssetPreviewOptions) {
  const doc = host.ownerDocument;
  const root = doc.createElement('div'); root.className = 'fx-asset-preview';
  const canvas = doc.createElement('canvas'); canvas.setAttribute('aria-hidden', 'true');
  const name = doc.createElement('p'); name.className = 'fx-preview-name';
  const detail = doc.createElement('p'); detail.className = 'fx-preview-detail';
  const status = doc.createElement('p'); status.className = 'fx-preview-status'; status.setAttribute('role', 'status');
  // The sound's timeline (progress): a track and its fill, shown while the asset's sound plays.
  const timeline = doc.createElement('div'); timeline.className = 'fx-preview-timeline'; timeline.hidden = true;
  timeline.setAttribute('aria-hidden', 'true');
  const timelineFill = doc.createElement('span'); timeline.append(timelineFill);
  // The picture and, over its lower left, the tile's own badges (an ambient effect's particles, sound: show's adges).
  const stage = doc.createElement('div'); stage.className = 'fx-preview-stage';
  const badgeSlot = doc.createElement('div'); badgeSlot.className = 'fx-preview-badges'; badgeSlot.setAttribute('aria-hidden', 'true');
  stage.append(canvas, badgeSlot);
  root.append(stage, timeline, name, detail, status); host.append(root);
  const drawTimeline = (): void => {
    const f = shown && options.progress ? options.progress(shown) : null;
    timeline.hidden = f === null || canvas.hidden;
    if (f !== null) timelineFill.style.width = `${Math.round(Math.max(0, Math.min(1, f)) * 1000) / 10}%`;
  };
  const scene = new Scene(), pivot = new Group(), camera = new PerspectiveCamera(38, 1, .1, 10000);
  const background = groundTexture();
  scene.background = background;
  scene.add(pivot);
  // The contact shadow under the prop: laid flat at its foot, as wide as its footprint (show).
  const shadowMap = shadowTexture();
  const shadow = new Mesh(new PlaneGeometry(1, 1), new MeshBasicMaterial({ map: shadowMap, transparent: true, depthWrite: false, fog: false }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.renderOrder = -1;
  shadow.visible = false;
  pivot.add(shadow);
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
    shadow.visible = false;
    for (const handle of [...pending]) releaseHandle(handle);
  };
  const position = (): void => {
    const aspect = Math.max(.2, camera.aspect);
    // Close on the prop (its drawn bounds' sphere, a little margin): a small prop fills its tile as a large one does.
    const distance = radius * 1.04 / Math.sin(Math.atan(Math.tan(camera.fov * Math.PI / 360) * Math.min(1, aspect)));
    camera.position.set(Math.sin(yaw) * Math.cos(pitch) * distance, Math.sin(pitch) * distance, Math.cos(yaw) * Math.cos(pitch) * distance);
    camera.near = Math.max(.01, distance / 1000); camera.far = distance + radius * 8;
    camera.lookAt(0, 0, 0); camera.updateProjectionMatrix();
  };
  const resetView = (): void => { yaw = Math.PI / 5; position(); };
  const renderFrame = (dt: number, visible: boolean, captureSize?: { width: number; height: number }): boolean => {
    if (disposed || !active || !visible || doc.visibilityState === 'hidden' || !renderer || !current
      || (!captureSize && !root.getClientRects().length)) return false;
    const width = captureSize?.width ?? Math.max(1, canvas.clientWidth);
    const height = captureSize?.height ?? Math.max(1, canvas.clientHeight);
    if (camera.aspect !== width / height) { camera.aspect = width / height; position(); }
    if (width !== widthNow || height !== heightNow) { widthNow = width; heightNow = height; renderer.resize(width, height); }
    if (dt > 0 && !reduced?.matches) { yaw += Math.min(dt, .1) * PREVIEW_SPIN_RATE; position(); }
    try { renderer.render(scene, camera); return true; }
    catch {
      clear(); canvas.hidden = true; status.textContent = 'Preview unavailable. You can still choose this asset in the list.';
      return false;
    }
  };
  const nextFrame = (): Promise<void> => new Promise(resolve => {
    const request = doc.defaultView?.requestAnimationFrame;
    if (request) request.call(doc.defaultView, () => resolve());
    else setTimeout(resolve, 16);
  });
  const getRenderer = (): Promise<PreviewRenderer> => {
    if (!creating) creating = (options.renderer ?? (async (element: HTMLCanvasElement) => {
      const view = await (await import('../renderer')).createRenderer(element);
      view.setClearColor(options.clearColor ?? [11, 20, 24]);
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
    /** `info`: the tile's own words (its kind and map, what it does), shown before the source and collision line. */
    async show(asset: string | null, info: string | null = null, badges: readonly Node[] = []): Promise<void> {
      if (disposed || !active || asset === shown) return;
      shown = asset; const token = ++generation; clear();
      canvas.hidden = true; name.textContent = ''; detail.textContent = '';
      badgeSlot.replaceChildren(...badges);
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
        const bounds = drawnBounds(view.object);
        if (bounds.isEmpty()) { status.textContent = 'This asset has no visible geometry to preview.'; return; }
        const size = bounds.getSize(new Vector3());
        radius = Math.max(.01, size.length() / 2);
        view.object.position.sub(bounds.getCenter(new Vector3())); pivot.add(view.object);
        // Its shadow at its foot, a little wider than it, never wider than the frame.
        const foot = Math.max(size.x, size.z, size.y * .35) * 1.35;
        shadow.scale.set(foot, foot, 1);
        shadow.position.set(0, -size.y / 2 + Math.max(.001, size.y * .002), 0);
        shadow.visible = true;
        name.textContent = handle.name;
        detail.textContent = info ? `${info} · ${handle.collision}` : `${handle.source} · ${handle.collision}`;
        status.textContent = '';
        current = { handle, view }; pending.delete(handle); handle = null; view = null;
        canvas.hidden = false; resetView();
      } catch {
        if (!disposed && token === generation) status.textContent = 'Preview unavailable. You can still choose this asset in the list.';
      } finally { view?.dispose(); if (handle) releaseHandle(handle); }
    },
    async capture(asset: string, width: number, height: number): Promise<string | null> {
      if (disposed || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
      const captureWidth = Math.round(width), captureHeight = Math.round(height);
      root.style.width = `${captureWidth}px`;
      root.style.height = `${captureHeight}px`;
      canvas.style.width = `${captureWidth}px`;
      canvas.style.height = `${captureHeight}px`;
      await this.show(asset);
      if (disposed || shown !== asset || !current) return null;
      if (!renderFrame(0, true, { width: captureWidth, height: captureHeight })) return null;
      await nextFrame();
      if (disposed || shown !== asset || !current || canvas.hidden) return null;
      return canvas.toDataURL('image/png');
    },
    frame(dt: number, visible: boolean): void {
      renderFrame(dt, visible);
      drawTimeline();
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
      background.dispose(); shadowMap.dispose(); shadow.geometry.dispose(); (shadow.material as MeshBasicMaterial).dispose();
      if (renderer) disposeRenderer(renderer);
      renderer = null; root.remove();
    },
  };
}
