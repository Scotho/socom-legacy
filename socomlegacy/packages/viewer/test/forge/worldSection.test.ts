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

    const fov = q<HTMLInputElement>('[data-world="fov"]');
    expect(Math.round(Number(fov.value))).toBe(49);
    // The readout follows the drag (`input`), before the setting is written (`change`); each end says what it does.
    const fovRow = fov.closest('.fx-setting')!;
    fov.value = '60'; fov.dispatchEvent(new Event('input'));
    expect(fovRow.querySelector('.fx-setting-value')!.textContent).toBe('60°');
    expect(patches).toEqual([]);
    expect([...fovRow.querySelectorAll('.fx-world-ends span')].map((e) => e.textContent)).toEqual(['Narrow (zoomed in)', 'Wide']);
    fov.dispatchEvent(new Event('change'));
    expect(patches.pop()!.fov!.v).toBeCloseTo((60 * Math.PI) / 360, 6);

    const depth = q<HTMLInputElement>('[data-world="reverb"][data-list="indoor"][data-zone="1"][data-part="depth"]');
    expect(depth.value).toBe('0.2');
    depth.value = '0.5'; depth.dispatchEvent(new Event('input'));
    expect(depth.closest('.fx-world-slider')!.nextElementSibling!.textContent).toBe('50%');
    expect([...depth.closest('.fx-world-slider')!.querySelectorAll('.fx-world-ends span')].map((e) => e.textContent)).toEqual(['Dry', 'Echoey']);
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
    s.body.querySelector<HTMLButtonElement>('[data-world-reset="fov"]')!.click();
    expect(patches.pop()).toEqual({ fov: null });
    s.body.querySelector<HTMLButtonElement>('[data-world-reset="reverb"]')!.click();
    expect(patches.pop()).toEqual({ reverb: null });
    s.draw(view({}, true));
    expect([...s.body.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>('input, select, button')].every((e) => e.disabled)).toBe(true);
  });
});
