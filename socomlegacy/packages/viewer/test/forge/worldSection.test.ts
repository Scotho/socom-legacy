// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, type LayoutSettings } from '../../src/forge/layout';
import { buildWorldSection, type WorldView } from '../../src/forge/panels/worldSection';

/** The Map Settings panel's Surface, sound & view section (`../../src/forge/panels/worldSection`, over `./worldSettings`). */
const view = (o: Partial<LayoutSettings> = {}, locked = false): WorldView => ({
  settings: { ...DEFAULT_SETTINGS, ...o }, locked, maps: [['MP2', 'MP2 · Frostfire'], ['MP61', 'MP61 · Night Stalker']],
  own: { material: 'METAL_THICK', reverb: { indoor: [[0.45, 1], [0.2, 1]], outdoor: [[0.07, 1]] }, fov: { hfov: 0.6109, vfov: 0.4276 }, title: 'FROSTFIRE' },
});

describe('Map Settings: surface, sound & view', () => {
  it('shows the map\'s own values until set, and each control writes its setting', () => {
    const s = buildWorldSection(document);
    const patches: Partial<LayoutSettings>[] = [];
    s.onChange((p) => patches.push(p));
    s.draw(view());
    const q = <T extends Element>(sel: string): T => s.body.querySelector<T>(sel)!;
    const surface = q<HTMLSelectElement>('[data-world="surface"]');
    expect(surface.value).toBe('');
    expect(surface.options[0]!.textContent).toMatch(/METAL_THICK/);
    surface.value = 'SAND'; surface.dispatchEvent(new Event('change'));
    expect(patches.pop()).toEqual({ defaultMaterial: 'SAND' });

    // No field of view row (the owner, 2026-11-25): no slider, no reset of it.
    expect(s.body.querySelector('[data-world="fov"]')).toBeNull();
    expect(s.body.querySelector('[data-world-reset="fov"]')).toBeNull();

    const depth = q<HTMLInputElement>('[data-world="reverb"][data-list="indoor"][data-zone="1"][data-part="depth"]');
    expect(depth.value).toBe('0.2');
    depth.value = '0.5'; depth.dispatchEvent(new Event('input'));
    // A zone one row: its name, the depth slider, the percent beside it, the ease-in seconds.
    expect(depth.nextElementSibling!.textContent).toBe('50%');
    expect(depth.closest('.fx-prop-row')!.querySelector('.fx-prop-label')!.textContent).toBe('Indoor 2');
    expect(depth.title).toMatch(/dry to wet/i);
    depth.dispatchEvent(new Event('change'));
    expect(patches.pop()).toEqual({ reverb: { indoor: [[0.45, 1], [0.5, 1]], outdoor: [[0.07, 1], [0, 1]] } });

    const title = q<HTMLInputElement>('[data-world="loading-title"]');
    expect(title.placeholder).toBe('FROSTFIRE');
    title.value = 'COLD FRONT'; title.dispatchEvent(new Event('change'));
    expect(patches.pop()).toEqual({ loading: { from: null, title: 'COLD FRONT', description: null } });
    const from = q<HTMLSelectElement>('[data-world="loading-from"]');
    from.value = 'MP61'; from.dispatchEvent(new Event('change'));
    expect(patches.pop()).toEqual({ loading: { from: 'MP61', title: null, description: null } });
    // A custom picture: not supported yet (a placeholder) -- it says so and writes nothing.
    const custom = q<HTMLButtonElement>('[data-world="loading-custom"]');
    const error = s.body.querySelector<HTMLElement>('.fx-world-error')!;
    expect(error.hidden).toBe(true);
    custom.click();
    expect([error.hidden, error.getAttribute('role')]).toEqual([false, 'alert']);
    expect(error.textContent).toMatch(/not supported yet.*ask a developer/i);
    expect(patches).toEqual([]);
  });

  it('Map\'s own clears a setting; a lock disables every control', () => {
    const s = buildWorldSection(document);
    const patches: Partial<LayoutSettings>[] = [];
    s.onChange((p) => patches.push(p));
    s.draw(view({ fov: { h: 0.7, v: 0.5 }, reverb: { indoor: [], outdoor: [] } }));
    s.body.querySelector<HTMLButtonElement>('[data-world-reset="reverb"]')!.click();
    expect(patches.pop()).toEqual({ reverb: null });
    s.draw(view({}, true));
    expect([...s.body.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>('input, select, button')].every((e) => e.disabled)).toBe(true);
  });
});
