// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { attachMenuInput } from '../src/menuInput';

let detach = () => {};
beforeEach(() => {
  vi.stubGlobal('matchMedia', () => ({ matches: true }));
  vi.stubGlobal('navigator', { getGamepads: vi.fn(() => []) });
});
afterEach(() => { detach(); document.body.replaceChildren(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function mount() {
  const canvas = document.createElement('canvas'); document.body.append(canvas);
  const a = attachMenuInput(canvas, window); detach = a.detach;
  const button = (id: string) => document.querySelector<HTMLButtonElement>(`#menu-touch #${id}`)!;
  const pointer = (id: string, type: string) => {
    const event = new MouseEvent(type, { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'pointerId', { value: 1 }); button(id).dispatchEvent(event);
  };
  return { a, canvas, button, pointer, root: () => document.getElementById('menu-touch')! };
}
it('mounts the pad before a session connects and reads a quick touch once without keyboard input', () => {
  const t = mount();
  expect(t.button('tw-cross')).not.toBeNull();
  expect(t.root().hidden).toBe(false);
  t.pointer('tw-down', 'pointerdown'); t.pointer('tw-down', 'pointerup');
  expect([...t.a.page.read().down]).toEqual(['DOWN']);
  expect(t.a.page.read().down.size).toBe(0);
  t.pointer('tw-cross', 'pointerdown');
  expect(t.a.page.read().down.has('CROSS')).toBe(true);
  window.dispatchEvent(new Event('blur'));
  expect(t.a.page.read().down.size).toBe(0);
});
it('cancels touches at match entry, restores them on return, and removes the overlay at detach', async () => {
  const t = mount(); t.pointer('tw-start', 'pointerdown');
  t.canvas.hidden = true; await Promise.resolve();
  expect(t.root().hidden).toBe(true);
  expect(t.a.page.read().down.size).toBe(0);
  t.canvas.hidden = false; await Promise.resolve();
  expect(t.root().hidden).toBe(false);
  t.pointer('tw-start', 'pointerdown'); t.pointer('tw-start', 'pointercancel');
  expect(t.a.page.read().down.size).toBe(0);
  t.a.detach(); expect(document.getElementById('menu-touch')).toBeNull();
});
it('hides for a connected controller and restores touch after disconnect without a held button', () => {
  const t = mount(); t.pointer('tw-cross', 'pointerdown');
  vi.mocked(navigator.getGamepads).mockReturnValue([{ id: 'test', index: 0, connected: true, mapping: 'standard', timestamp: 1, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) } as unknown as Gamepad]);
  expect(t.a.page.read().down.size).toBe(0); expect(t.root().hidden).toBe(true);
  vi.mocked(navigator.getGamepads).mockReturnValue([]);
  expect(t.a.page.read().down.size).toBe(0); expect(t.root().hidden).toBe(false);
  t.pointer('tw-cross', 'pointerdown'); expect(t.a.page.read().down.has('CROSS')).toBe(true);
});
it('stays hidden on a mouse-only desktop and appears on a hybrid device first touch', () => {
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  const t = mount(); expect(t.root().hidden).toBe(true);
  window.dispatchEvent(new Event('touchstart'));
  expect(t.root().hidden).toBe(false);
  t.pointer('tw-cross', 'pointerdown'); t.pointer('tw-cross', 'pointerup');
  expect(t.a.page.read().down.has('CROSS')).toBe(true);
});
it('the visible menu joystick navigates through the pad source and releases on blur', () => {
  const t = mount();
  const zone = t.root().querySelector('#stick-zone')!;
  const point = (type: string, y: number) => {
    const e = new MouseEvent(type, { clientX: 30, clientY: y, bubbles: true, cancelable: true });
    Object.defineProperty(e, 'pointerId', { value: 2 }); zone.dispatchEvent(e);
  };
  point('pointerdown', 30); point('pointermove', 80);
  expect(t.a.page.read().stickY).toBeLessThan(-0.6);
  window.dispatchEvent(new Event('blur'));
  expect(t.a.page.read().stickY).toBe(0);
});
