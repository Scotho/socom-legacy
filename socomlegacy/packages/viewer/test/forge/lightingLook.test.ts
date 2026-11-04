// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { lightingLook } from '../../src/forge/lightingLook';

const pointer = (type: string, x = 0, y = 0, options: { button?: number; shiftKey?: boolean; pointerType?: string } = {}) => {
  const e = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, ...options });
  Object.defineProperties(e, { pointerId: { value: 7 }, pointerType: { value: options.pointerType ?? 'mouse' } });
  return e;
};
const setup = () => {
  const input = document.createElement('div'); document.body.append(input);
  input.setPointerCapture = vi.fn(); input.releasePointerCapture = vi.fn();
  const look = vi.fn(), editor = vi.fn(); let enabled = true;
  const dispose = lightingLook(input, () => enabled, look);
  input.addEventListener('pointerdown', editor);
  return { input, look, editor, dispose, disable: () => { enabled = false; } };
};
describe('lighting preview left-drag look (browser adaptation)', () => {
  it('delegates ordinary selection/placement clicks once, including slight motion, without turning', () => {
    const s = setup(), release = vi.fn(); s.input.addEventListener('pointerup', release);
    s.input.dispatchEvent(pointer('pointerdown', 100, 100));
    s.input.dispatchEvent(pointer('pointermove', 102, 101));
    expect(s.editor).not.toHaveBeenCalled();
    s.input.dispatchEvent(pointer('pointerup', 102, 101));
    expect(s.editor).toHaveBeenCalledOnce(); expect(release).toHaveBeenCalledOnce();
    expect(s.editor.mock.calls[0]![0].clientX).toBe(100);
    expect(s.look).not.toHaveBeenCalled(); s.dispose();
  });
  it('turns a left drag without starting editor selection and stops on release', () => {
    const s = setup();
    s.input.dispatchEvent(pointer('pointerdown', 100, 100));
    s.input.dispatchEvent(pointer('pointermove', 140, 80));
    expect(s.editor).not.toHaveBeenCalled();
    expect(s.look).toHaveBeenCalledWith(40, -20);
    s.input.dispatchEvent(pointer('pointerup', 140, 80));
    s.input.dispatchEvent(pointer('pointermove', 200, 80));
    expect(s.look).toHaveBeenCalledTimes(1);
    expect(s.input.releasePointerCapture).toHaveBeenCalledWith(7);
    s.dispose();
  });
  it('keeps right click, Shift selection, touch, and the disabled toggle on the editor path', () => {
    const s = setup();
    for (const options of [{ button: 2 }, { shiftKey: true }, { pointerType: 'touch' }]) s.input.dispatchEvent(pointer('pointerdown', 0, 0, options));
    s.disable(); s.input.dispatchEvent(pointer('pointerdown'));
    expect(s.editor).toHaveBeenCalledTimes(4);
    expect(s.input.setPointerCapture).not.toHaveBeenCalled();
    s.dispose();
  });
  it('ends cancelled drags, and removing the helper restores normal selection', () => {
    const s = setup();
    s.input.dispatchEvent(pointer('pointerdown'));
    s.input.dispatchEvent(pointer('pointercancel'));
    s.input.dispatchEvent(pointer('pointermove', 40, 40));
    expect(s.look).not.toHaveBeenCalled();
    s.dispose(); s.input.dispatchEvent(pointer('pointerdown'));
    expect(s.editor).toHaveBeenCalledOnce();
  });
});
