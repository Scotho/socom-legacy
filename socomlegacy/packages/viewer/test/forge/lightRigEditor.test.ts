// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { buildLightRigEditor, colourOf, directionOf, headingOf, rgbOf, type Atmosphere, type LightRigHooks } from '../../src/forge/panels/lightRigEditor';

/**
 * A new empty map's environment editor (a browser adaptation, FG.R2; `buildLightRigEditor`'s doc): the six settings --
 * the light rig, the sky, the fog, the night, the shadows (and the flares' count, read only) -- drawn from the hooks, a
 * field's `input` previewing and its `change` committing one whole `Atmosphere`. Where it is shown (a blank base only)
 * is the page's, pinned on the mounted page (`pagePanels.test.ts`).
 */
const ATMOSPHERE: Atmosphere = {
  rig: {
    directions: [directionOf(90, 45), directionOf(180, 30), directionOf(270, 10)],
    colours: [[1, 0.5, 0.25], [0.5, 0.5, 0.5], [0, 0, 1]],
    ambient: [0.3, 0.3, 0.3],
  },
  sky: 'MP6',
  fog: { on: true, colour: [10, 20, 30], near: 100, far: 5000, height: { on: false, top: 50, bottom: 0 } },
  night: { mission: true, lens: [0.2, 0.898, 0.2, 0.24] },   // the disc's LensFX_NVG, 0..1 (research 84 s14)
  shadow: [0, -2, 0.0001],
};

function editor(over: Partial<LightRigHooks> = {}) {
  let now = structuredClone(ATMOSPHERE);
  const hooks: LightRigHooks = {
    get: () => now, own: () => false, from: () => 'MP2',
    skyChoices: () => [['MP6', 'Crossroads · MP6'], ['MP51', 'Desert · MP51']],
    flares: () => 3, preview: vi.fn(), commit: vi.fn((a: Atmosphere) => { now = a; }), reset: vi.fn(), preset: vi.fn(), ...over,
  };
  const e = buildLightRigEditor(document, hooks);
  document.body.replaceChildren(e.top, e.body);
  e.draw(true);
  const field = (label: string): HTMLInputElement => e.body.querySelector<HTMLInputElement>(`[aria-label="${label}"]`)!;
  return { e, hooks, field };
}

describe('the light rig editor (lightRigEditor)', () => {
  it('headingOf / directionOf and colourOf / rgbOf are each other\'s inverse', () => {
    for (const [h, el] of [[0, 45], [90, 10], [270, -30], [359, 80]] as const) {
      const back = headingOf(directionOf(h, el));
      expect(back.heading).toBeCloseTo(h, 6);
      expect(back.elevation).toBeCloseTo(el, 6);
    }
    expect(colourOf([1, 0.5, 0.25])).toEqual({ hex: '#ff8040', intensity: 1 });
    const rgb = rgbOf('#ff8040', 2);
    expect(rgb[0]).toBeCloseTo(2, 6);
    expect(rgb[1]).toBeCloseTo(2 * 0x80 / 255, 6);
  });

  it('draws each of the six settings from the hooks', () => {
    const { e, field } = editor();
    expect(field('Light 1 colour').value).toBe('#ff8040');
    expect(field('Light 1 heading (°)').value).toBe('90');
    expect(field('Light 1 elevation (°)').value).toBe('45');
    expect(field('Ambient intensity').value).toBe('0.3');
    expect(e.body.querySelector<HTMLSelectElement>('[aria-label="Sky"]')!.value).toBe('MP6');
    expect([...e.body.querySelectorAll<HTMLOptionElement>('[aria-label="Sky"] option')].map((o) => o.value)).toEqual(['', 'MP6', 'MP51']);
    expect(field('Fog on').checked).toBe(true);
    expect(field('Fog colour').value).toBe('#0a141e');
    expect(field('Fog near (u)').value).toBe('100');
    expect(field('Fog far (u)').value).toBe('5000');
    expect(field('Height fog bottom (u)').disabled).toBe(true);
    expect(field('Night mission').checked).toBe(true);
    expect(field('Night vision lens colour').value).toBe('#33e533');           // the disc's 0..1, shown as a colour
    expect(field('Night vision lens alpha').value).toBe('0.24');
    expect(field('Shadows fall this steeply (° down)').value).toBe('90');
    expect(e.body.textContent).toContain('3 placed · the Flare tool places them');
    // Not its own yet: Reset hidden, the note names the built-from map.
    expect(e.top.querySelector<HTMLButtonElement>('.fx-setting-reset:not([title^="Copy"])')!.hidden).toBe(true);
    expect(e.top.textContent).toContain("MP2's environment");
  });

  it('a field moved previews, a field set commits, the whole environment each time', () => {
    const { hooks, field } = editor();
    const near = field('Fog near (u)');
    near.value = '250';
    near.dispatchEvent(new Event('input'));
    expect(hooks.preview).toHaveBeenCalledTimes(1);
    expect(hooks.commit).not.toHaveBeenCalled();
    near.dispatchEvent(new Event('change'));
    expect(hooks.commit).toHaveBeenCalledTimes(1);
    const a = vi.mocked(hooks.commit).mock.calls[0]![0];
    expect(a.fog).toEqual({ on: true, colour: [10, 20, 30], near: 250, far: 5000, height: { on: false, top: 50, bottom: 0 } });
    expect(a.sky).toBe('MP6');
    expect(a.night.mission).toBe(true);
    // The lens stays in the disc's range (REVIEW-A 12): the colour field's bytes converted back, never stored as 0..255.
    expect(a.night.lens.map((n) => Math.round(n * 1000) / 1000)).toEqual([0.2, 0.898, 0.2, 0.24]);
    // A value past its field's bounds is held to them.
    const far = field('Fog far (u)');
    far.value = '5';
    far.dispatchEvent(new Event('change'));
    expect(vi.mocked(hooks.commit).mock.calls[1]![0].fog.far).toBe(100);
  });

  it('Reset and Preset are the hooks\'; Reset shows once the map holds its own', () => {
    const { e, hooks } = editor({ own: () => true });
    const [preset, reset] = [...e.top.querySelectorAll<HTMLButtonElement>('.fx-setting-reset')];
    expect(reset!.hidden).toBe(false);
    reset!.click();
    preset!.click();
    expect(hooks.reset).toHaveBeenCalledTimes(1);
    expect(hooks.preset).toHaveBeenCalledTimes(1);
  });
});
