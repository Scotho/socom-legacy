// @vitest-environment jsdom
import { BoxGeometry, Group, InstancedMesh, Mesh, MeshBasicMaterial, Scene } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAssetPreview, type PreviewAsset } from '../src/forge/assetPreview';

afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks(); });
function asset(name = 'crate'): PreviewAsset {
  const object = new Group(); object.add(new Mesh(new BoxGeometry(20, 10, 30), new MeshBasicMaterial()));
  return { object, name, source: 'MP2', collision: 'Source collision available', dispose: vi.fn() };
}
function rig() {
  const host = document.createElement('div'); document.body.append(host);
  const first = asset(), second = asset('container');
  const resolve = vi.fn(async (id: string) => id === 'crate' ? first : second);
  const view = { render: vi.fn((_scene: Scene, _camera?: unknown) => {}), resize: vi.fn(), dispose: vi.fn() };
  const renderer = vi.fn(async () => view);
  const preview = createAssetPreview(host, { resolve, renderer });
  return { host, first, second, resolve, view, renderer, preview };
}
/** A native rejected Promise whose explicit rejection handler is observable without subclass assimilation.
 * The fixture's baseline handler prevents an intentionally broken implementation from leaking a global rejection;
 * it bypasses the instance observer so it cannot satisfy the production handler assertion itself.
 */
function rejectingCleanup() {
  const observed = vi.fn();
  const promise = Promise.reject<void>(new Error('RENDERER_CLEANUP_FAILED'));
  void Promise.prototype.then.call(promise, undefined, () => undefined);
  // Preserve the native constructor: Promise.resolve(promise) must return it without calling this observer.
  Object.defineProperty(promise, 'then', { value: function<TResult1 = void, TResult2 = never>(
      fulfilled?: ((value: void) => TResult1 | PromiseLike<TResult1>) | null,
      rejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ): Promise<TResult1 | TResult2> {
      if (rejected) observed();
      return Promise.prototype.then.call(promise, fulfilled, rejected) as Promise<TResult1 | TResult2>;
    } });
  return { promise, observed };
}

describe('real staged-handle preview adaptation', () => {
  it('does not mistake Promise.resolve of its native cleanup promise for a rejection handler', () => {
    const cleanup = rejectingCleanup();
    expect(cleanup.promise.constructor).toBe(Promise);
    expect(Promise.resolve(cleanup.promise)).toBe(cleanup.promise);
    expect(cleanup.observed).not.toHaveBeenCalled();
    void cleanup.promise.catch(() => undefined);
    expect(cleanup.observed).toHaveBeenCalledOnce();
  });
  it('resolves actual objects and reuses one lazy renderer across selected assets', async () => {
    const r = rig(); expect(r.renderer).not.toHaveBeenCalled();
    await r.preview.show('crate');
    expect(r.resolve).toHaveBeenCalledWith('crate'); expect(r.renderer).toHaveBeenCalledOnce();
    expect(r.host.textContent).toContain('crate'); expect(r.host.textContent).toContain('MP2');
    expect(r.host.textContent).toContain('Source collision available');
    await r.preview.show('container'); expect(r.renderer).toHaveBeenCalledOnce();
    expect(r.first.dispose).toHaveBeenCalledOnce();
    r.preview.dispose(); expect(r.second.dispose).toHaveBeenCalledOnce(); expect(r.view.dispose).toHaveBeenCalledOnce();
  });
  it('releases the handle rather than disposing borrowed geometry or materials', async () => {
    const r = rig(), mesh = r.first.object.children[0] as Mesh;
    const geometry = mesh.geometry, material = mesh.material as MeshBasicMaterial;
    const gd = vi.spyOn(geometry, 'dispose'), md = vi.spyOn(material, 'dispose');
    await r.preview.show('crate');
    expect(r.resolve).toHaveBeenCalledOnce(); expect(geometry.boundingBox).toBeNull();
    r.preview.dispose(); r.preview.dispose();
    expect(r.first.dispose).toHaveBeenCalledOnce(); expect(gd).not.toHaveBeenCalled(); expect(md).not.toHaveBeenCalled();
    expect(material.opacity).toBe(1); expect(material.transparent).toBe(false);
  });
  it('keeps instanced source bounds private and releases only the owned staged handle', async () => {
    const host = document.createElement('div');
    const source = new InstancedMesh(new BoxGeometry(20, 10, 30), new MeshBasicMaterial(), 1);
    const geometry = source.geometry, material = source.material as MeshBasicMaterial;
    const positions = Array.from(geometry.getAttribute('position').array);
    const geometryDispose = vi.spyOn(geometry, 'dispose'), materialDispose = vi.spyOn(material, 'dispose');
    const clone = source.clone(), dispose = vi.fn();
    const resolve = vi.fn(async () => ({ object: clone, name: 'crate', source: 'MP2', collision: 'Unknown', dispose }));
    const preview = createAssetPreview(host, { resolve, renderer: async () => ({ render() {}, resize() {}, dispose() {} }) });
    await preview.show('crate'); expect(resolve).toHaveBeenCalledOnce();
    expect(source.geometry).toBe(geometry); expect(source.material).toBe(material);
    expect(geometry.boundingBox).toBeNull(); expect(geometry.boundingSphere).toBeNull();
    expect(Array.from(geometry.getAttribute('position').array)).toEqual(positions);
    expect(material.opacity).toBe(1); expect(material.transparent).toBe(false);
    preview.dispose(); expect(dispose).toHaveBeenCalledOnce();
    expect(geometryDispose).not.toHaveBeenCalled(); expect(materialDispose).not.toHaveBeenCalled();
  });
  it.each(['replacement', 'disposal'] as const)('releases a late staged handle after %s', async kind => {
    const host = document.createElement('div'), late = asset('old');
    let finish!: (value: PreviewAsset) => void;
    const resolve = vi.fn((_id: string) => new Promise<PreviewAsset>(done => { finish = done; }));
    const renderer = vi.fn(async () => ({ render() {}, resize() {}, dispose() {} }));
    const preview = createAssetPreview(host, { resolve, renderer });
    const pending = preview.show('old'); expect(resolve).toHaveBeenCalledOnce();
    if (kind === 'replacement') await preview.show(null); else preview.dispose();
    finish(late); await pending; expect(late.dispose).toHaveBeenCalledOnce(); expect(renderer).not.toHaveBeenCalled();
  });
  it('disposes a late renderer once after teardown', async () => {
    const host = document.createElement('div'), staged = asset();
    let finish!: (value: { render(): void; resize(): void; dispose(): void }) => void;
    const dispose = vi.fn(), renderer = vi.fn(() => new Promise<{ render(): void; resize(): void; dispose(): void }>(done => { finish = done; }));
    const preview = createAssetPreview(host, { resolve: async () => staged, renderer });
    const pending = preview.show('crate'); await Promise.resolve(); expect(renderer).toHaveBeenCalledOnce();
    preview.dispose(); finish({ render() {}, resize() {}, dispose }); await pending;
    expect(dispose).toHaveBeenCalledOnce(); expect(staged.dispose).toHaveBeenCalledOnce();
  });
  it('observes a rejected asynchronous renderer cleanup during ordinary teardown', async () => {
    const host = document.createElement('div'), staged = asset(), cleanup = rejectingCleanup();
    // A vi.fn returning this promise would attach its own rejection observer to track settledResults.
    let disposals = 0;
    const dispose = () => { disposals++; return cleanup.promise; };
    const preview = createAssetPreview(host, { resolve: async () => staged,
      renderer: async () => ({ render() {}, resize() {}, dispose }) });
    expect(Promise.resolve(cleanup.promise)).toBe(cleanup.promise); expect(cleanup.observed).not.toHaveBeenCalled();
    await preview.show('crate'); preview.dispose();
    await Promise.resolve(); await Promise.resolve();
    expect(disposals).toBe(1); expect(cleanup.observed).toHaveBeenCalled();
    expect(staged.dispose).toHaveBeenCalledOnce();
  });
  it('observes a rejected asynchronous cleanup from a renderer created after teardown', async () => {
    const host = document.createElement('div'), staged = asset(), cleanup = rejectingCleanup();
    let disposals = 0;
    const view = { render() {}, resize() {}, dispose() { disposals++; return cleanup.promise; } };
    let finish!: (value: typeof view) => void;
    const renderer = vi.fn(() => new Promise<typeof view>(done => { finish = done; }));
    const preview = createAssetPreview(host, { resolve: async () => staged, renderer });
    expect(Promise.resolve(cleanup.promise)).toBe(cleanup.promise); expect(cleanup.observed).not.toHaveBeenCalled();
    const pending = preview.show('crate'); await Promise.resolve(); expect(renderer).toHaveBeenCalledOnce();
    preview.dispose(); finish(view); await pending; await Promise.resolve();
    expect(disposals).toBe(1); expect(cleanup.observed).toHaveBeenCalled();
    expect(staged.dispose).toHaveBeenCalledOnce();
  });
  // FUI-22 (D1): the pin of the panel's input (its focused canvas let go outside Build) moved: a tooltip takes no input,
  // so what holds is that it goes inert and lets its staged handle go outside admitted Build.
  it('becomes inert outside admitted Build and lets its staged handle go', async () => {
    const r = rig(); await r.preview.show('crate');
    expect(r.host.querySelector<HTMLCanvasElement>('canvas')!.hidden).toBe(false);
    r.preview.setActive(false); expect(r.preview.root.inert).toBe(true);
    expect(r.first.dispose).toHaveBeenCalledOnce(); expect(r.host.querySelector<HTMLCanvasElement>('canvas')!.hidden).toBe(true);
    await r.preview.show('container'); expect(r.second.dispose).not.toHaveBeenCalled(); expect(r.resolve).toHaveBeenCalledOnce();
    r.preview.dispose();
  });
  it('FUI-22 D1: is a tooltip\'s body -- the canvas, the name and the source line; no heading, orbit, buttons or keys', async () => {
    const r = rig(); await r.preview.show('crate');
    expect(r.host.textContent).not.toContain('Asset preview');
    expect(r.host.querySelector('h3, button, [aria-label="Asset preview"]')).toBeNull();
    const canvas = r.host.querySelector<HTMLCanvasElement>('canvas')!;
    expect(canvas.hasAttribute('tabindex'), 'no orbit: the canvas takes no focus').toBe(false);
    expect(r.host.querySelector('.fx-preview-name')!.textContent).toBe('crate');
    expect(r.host.querySelector('.fx-preview-detail')!.textContent).toBe('MP2 · Source collision available');
    // A drag on the canvas turns nothing and is not swallowed: the tooltip is not an input.
    const down = new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 });
    canvas.dispatchEvent(down); expect(down.defaultPrevented).toBe(false);
    r.preview.dispose();
  });
  it.each([false, true])('FUI-22 D1: turns slowly by itself unless reduced motion is asked for (reduced %s)', async reduce => {
    vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({ matches: reduce && query.includes('reduce'), media: query, onchange: null,
      addEventListener: () => undefined, removeEventListener: () => undefined, addListener: () => undefined, removeListener: () => undefined,
      dispatchEvent: () => false }) as MediaQueryList);
    const r = rig(); await r.preview.show('crate');
    r.preview.root.getClientRects = () => [new DOMRect(0, 0, 200, 150)] as unknown as DOMRectList;
    const at: number[] = [];
    r.view.render.mockImplementation((_scene: Scene, camera?: unknown) => { at.push((camera as { position: { x: number } }).position.x); });
    r.preview.frame(.05, true); r.preview.frame(.05, true); r.preview.frame(.05, true);
    expect(at).toHaveLength(3);
    if (reduce) expect(new Set(at).size).toBe(1); else expect(new Set(at).size).toBe(3);
    r.preview.dispose();
  });
});
