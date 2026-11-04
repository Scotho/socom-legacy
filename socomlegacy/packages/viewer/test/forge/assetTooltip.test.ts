// @vitest-environment jsdom
import { BoxGeometry, Group, Mesh, MeshBasicMaterial } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PreviewAsset } from '../../src/forge/assetPreview';
import { ASSET_TIP_HOVER_MS, ASSET_TIP_LONG_PRESS_MS, createAssetTooltip } from '../../src/forge/assetTooltip';

/**
 * FUI-22 (D1, the owner 2026-10-27: "The Asset Viewer should dissapear, but keep the object preview and add it as a
 * tooltip overlay on any of the hovered or active Assets"; a browser adaptation, FG.R2 -- the game has no editor): the
 * asset list's one tooltip. Shown beside a hovered tile after a short delay and beside the active one (focused, or
 * picked for placement) at once; never over the tile; one renderer across every tile; hidden on leave, blur, scroll and
 * on `hide()` (the page's Escape); a touch long press shows it and the lift keeps it until the next tap, a tap still the
 * list's own; off while the Forge setting is off.
 */
afterEach(() => { document.body.replaceChildren(); vi.useRealTimers(); vi.restoreAllMocks(); });

function asset(name: string): PreviewAsset {
  const object = new Group(); object.add(new Mesh(new BoxGeometry(20, 10, 30), new MeshBasicMaterial()));
  return { object, name, source: 'MP2', collision: 'Collision checked in the world', dispose: vi.fn() };
}
function rig(allowed = () => true) {
  const list = document.createElement('ul');
  const tiles = ['crate', 'container', 'barrel'].map((name, i) => {
    const li = document.createElement('li'); li.dataset['asset'] = `MP2:${name}`;
    const pick = document.createElement('button'); pick.type = 'button'; pick.textContent = name; li.append(pick);
    // A row of the dock's list: 250 px wide, 26 px tall, from y = 100.
    li.getBoundingClientRect = () => ({ left: 0, right: 250, top: 100 + i * 26, bottom: 126 + i * 26, width: 250, height: 26, x: 0, y: 100 + i * 26, toJSON: () => ({}) });
    list.append(li);
    return li;
  });
  document.body.append(list);
  const view = { render: vi.fn(), resize: vi.fn(), dispose: vi.fn() };
  const renderer = vi.fn(async () => view);
  const handles: PreviewAsset[] = [];
  const resolve = vi.fn(async (id: string) => { const a = asset(id.split(':')[1]!); handles.push(a); return a; });
  const tip = createAssetTooltip(document, { resolve, renderer, allowed });
  const off = tip.attach(list);
  const name = (): string | null => tip.root.querySelector('.fx-preview-name')?.textContent ?? null;
  const pointer = (type: string, target: Element, over: Partial<PointerEventInit> = {}): PointerEvent => {
    const e = new (globalThis.PointerEvent ?? MouseEvent)(type, { bubbles: true, cancelable: true, pointerType: 'mouse', ...over } as PointerEventInit) as PointerEvent;
    if (!('pointerType' in e) || (e as PointerEvent).pointerType !== (over.pointerType ?? 'mouse')) Object.defineProperty(e, 'pointerType', { value: over.pointerType ?? 'mouse' });
    target.dispatchEvent(e);
    return e;
  };
  return { list, tiles, tip, off, view, renderer, resolve, handles, name, pointer };
}

describe('FUI-22 D1: the asset list\'s one tooltip preview', () => {
  it('hovering a tile shows the overlay with that asset\'s name after a short delay, beside the tile, never over it', async () => {
    vi.useFakeTimers();
    const r = rig();
    expect(r.tip.root.hidden).toBe(true);
    r.pointer('pointerover', r.tiles[0]!.firstElementChild!);
    vi.advanceTimersByTime(ASSET_TIP_HOVER_MS - 1);
    expect(r.tip.root.hidden, 'not before the delay').toBe(true);
    expect(r.resolve).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(r.tip.root.hidden).toBe(false);
    await vi.waitFor(() => expect(r.name()).toBe('crate'));
    expect(r.tip.root.getAttribute('role')).toBe('tooltip');
    expect(r.tiles[0]!.getAttribute('aria-describedby')).toBe(r.tip.root.id);
    // Beside the tile: its left edge past the tile's right (the focus ring sits inside the row).
    expect(parseFloat(r.tip.root.style.left)).toBeGreaterThanOrEqual(250);
    expect(r.tip.shown()).toBe('MP2:crate');
  });

  it('a focused tile (keyboard or pad) shows it at once, with no hover; blur hides it', async () => {
    const r = rig();
    r.tiles[1]!.querySelector('button')!.focus();
    expect(r.tip.root.hidden).toBe(false);
    await vi.waitFor(() => expect(r.name()).toBe('container'));
    r.tiles[1]!.querySelector('button')!.blur();
    expect(r.tip.root.hidden).toBe(true);
    expect(r.tip.shown()).toBeNull();
  });

  it('the asset picked for placement is shown beside its tile at once (activate)', async () => {
    const r = rig();
    r.tip.activate('MP2:barrel');
    expect(r.tip.root.hidden).toBe(false);
    await vi.waitFor(() => expect(r.name()).toBe('barrel'));
    expect(parseFloat(r.tip.root.style.top)).toBeGreaterThanOrEqual(100 + 2 * 26 - 1);
  });

  it('hides on leave, on the list\'s scroll and on hide() (the page\'s Escape)', async () => {
    vi.useFakeTimers();
    const r = rig();
    const show = (i: number): void => { r.pointer('pointerover', r.tiles[i]!.firstElementChild!); vi.advanceTimersByTime(ASSET_TIP_HOVER_MS); };
    show(0);
    expect(r.tip.root.hidden).toBe(false);
    r.pointer('pointerout', r.tiles[0]!.firstElementChild!, { relatedTarget: document.body });
    expect(r.tip.root.hidden, 'leave').toBe(true);
    show(0);
    r.list.dispatchEvent(new Event('scroll'));
    expect(r.tip.root.hidden, 'scroll').toBe(true);
    show(0);
    r.tip.hide();
    expect(r.tip.root.hidden, 'Escape').toBe(true);
    // A leave before the delay never shows it.
    r.pointer('pointerover', r.tiles[2]!.firstElementChild!);
    r.pointer('pointerout', r.tiles[2]!.firstElementChild!, { relatedTarget: document.body });
    vi.advanceTimersByTime(ASSET_TIP_HOVER_MS * 2);
    expect(r.tip.root.hidden).toBe(true);
  });

  it('one renderer instance across several tiles, each staged handle released when the next is shown', async () => {
    const r = rig();
    for (const tile of r.tiles) {
      tile.querySelector('button')!.focus();
      await vi.waitFor(() => expect(r.name()).toBe(tile.textContent));
    }
    expect(r.renderer).toHaveBeenCalledOnce();
    expect(r.handles).toHaveLength(3);
    expect(r.handles[0]!.dispose).toHaveBeenCalledOnce();
    expect(r.handles[1]!.dispose).toHaveBeenCalledOnce();
    expect(r.handles[2]!.dispose).not.toHaveBeenCalled();
    expect(document.querySelectorAll('canvas')).toHaveLength(1);
    r.tip.dispose();
    expect(r.handles[2]!.dispose).toHaveBeenCalledOnce();
    expect(r.view.dispose).toHaveBeenCalledOnce();
    expect(r.tip.root.isConnected).toBe(false);
  });

  it('touch: a long press shows it; the lift keeps it and is not a tap; the next tap hides it and is the list\'s own', async () => {
    vi.useFakeTimers();
    const r = rig();
    const clicks = vi.fn();
    r.list.addEventListener('click', clicks);
    const target = r.tiles[0]!.firstElementChild!;
    r.pointer('pointerdown', target, { pointerType: 'touch' });
    vi.advanceTimersByTime(ASSET_TIP_LONG_PRESS_MS - 1);
    expect(r.tip.root.hidden).toBe(true);
    vi.advanceTimersByTime(1);
    expect(r.tip.root.hidden, 'the long press').toBe(false);
    r.pointer('pointerup', target, { pointerType: 'touch' });
    target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(clicks, 'the lift after a long press places nothing').not.toHaveBeenCalled();
    expect(r.tip.root.hidden, 'kept after the lift').toBe(false);
    // The next tap: it hides, and the tap is the list's (a tap places as today).
    const other = r.tiles[1]!.firstElementChild!;
    r.pointer('pointerdown', other, { pointerType: 'touch' });
    expect(r.tip.root.hidden).toBe(true);
    r.pointer('pointerup', other, { pointerType: 'touch' });
    other.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(clicks).toHaveBeenCalledOnce();
    // A short tap shows nothing.
    r.pointer('pointerdown', other, { pointerType: 'touch' });
    vi.advanceTimersByTime(ASSET_TIP_LONG_PRESS_MS / 2);
    r.pointer('pointerup', other, { pointerType: 'touch' });
    vi.advanceTimersByTime(ASSET_TIP_LONG_PRESS_MS * 2);
    expect(r.tip.root.hidden).toBe(true);
  });

  it('off (the Forge setting, or no placement admitted): a hover, a focus or an activate shows nothing', () => {
    vi.useFakeTimers();
    let on = false;
    const r = rig(() => on);
    r.pointer('pointerover', r.tiles[0]!.firstElementChild!);
    vi.advanceTimersByTime(ASSET_TIP_HOVER_MS * 2);
    r.tiles[1]!.querySelector('button')!.focus();
    r.tip.activate('MP2:barrel');
    expect(r.tip.root.hidden).toBe(true);
    expect(r.resolve).not.toHaveBeenCalled();
    on = true;
    r.tip.activate('MP2:barrel');
    expect(r.tip.root.hidden).toBe(false);
  });

  it('unbinds from the list: no listener left after attach\'s release', () => {
    vi.useFakeTimers();
    const r = rig();
    r.off();
    r.pointer('pointerover', r.tiles[0]!.firstElementChild!);
    vi.advanceTimersByTime(ASSET_TIP_HOVER_MS * 2);
    r.tiles[1]!.querySelector('button')!.focus();
    expect(r.tip.root.hidden).toBe(true);
  });
});
