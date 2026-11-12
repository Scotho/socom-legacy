import { describe, expect, it } from 'vitest';
import { CLASS_START_ADAPTATION } from '../src/autoQuality';
import { classGraphics, XBOX_GRAPHICS_ADAPTATION, type DeviceClass } from '../src/deviceClass';
import type { GraphicsBackendPreference } from '../src/graphicsBackend';

/**
 * S2 (the controller's level-3 review of mega, confirmed by the GPU menus lane holder; the video settings plan's Log,
 * 2026-11-10; VS-7's Xbox class, a browser adaptation, product track): the Xbox class draws on WebGL2 under every preset,
 * not only Automatic. A named preset's rows carry `graphics: 'auto'` (`./videoSettings`), and the test room's and the
 * Forge's renderers read `readGraphicsBackend()` ('auto' unless a pick is saved), and 'auto' asks WebGPU
 * (`./graphicsBackend` `asksForWebGPU`); only Automatic's start rows gave the Xbox class its `webgl2`
 * (`./autoQuality` `CLASS_START_ADAPTATION`). `classGraphics` is the one rule `./renderer`'s `createRenderer` applies:
 * a resolved 'auto' on the Xbox class is WebGL2, unless an address override (`?renderer=`) named it; a player's
 * 'webgpu' or 'webgl2' and the Xbox pick ('xbox') are kept. Unit test (the table). `createRenderer`'s use of it is held by
 * `./rendererOptions.test.ts`'s S2 block (F3 of the S1/S2 review, gmxbox1c, removed the source-text pins here).
 */

const CLASSES: readonly DeviceClass[] = ['xbox', 'software', 'touch', 'lowMemory', 'standard', 'high'];
const CHOICES: readonly GraphicsBackendPreference[] = ['auto', 'webgpu', 'webgl2', 'xbox'];

describe('S2: classGraphics, the backend a resolved choice asks for on a device class', () => {
  it('the Xbox class\'s backend is WebGL2', () => {
    expect(XBOX_GRAPHICS_ADAPTATION).toBe('webgl2');
  });

  it("F2 (the S1/S2 review, gmxbox1c): Automatic's Xbox start row draws on the same backend as classGraphics", () => {
    expect(CLASS_START_ADAPTATION.xbox.graphics).toBe(XBOX_GRAPHICS_ADAPTATION);
  });

  it('the table, with no address override: only Automatic on the Xbox class changes, to WebGL2; every other cell is the choice itself', () => {
    const table = Object.fromEntries(CLASSES.map((c) => [c, Object.fromEntries(CHOICES.map((g) => [g, classGraphics(g, c, false)]))]));
    expect(table).toEqual({
      xbox: { auto: 'webgl2', webgpu: 'webgpu', webgl2: 'webgl2', xbox: 'xbox' },
      software: { auto: 'auto', webgpu: 'webgpu', webgl2: 'webgl2', xbox: 'xbox' },
      touch: { auto: 'auto', webgpu: 'webgpu', webgl2: 'webgl2', xbox: 'xbox' },
      lowMemory: { auto: 'auto', webgpu: 'webgpu', webgl2: 'webgl2', xbox: 'xbox' },
      standard: { auto: 'auto', webgpu: 'webgpu', webgl2: 'webgl2', xbox: 'xbox' },
      high: { auto: 'auto', webgpu: 'webgpu', webgl2: 'webgl2', xbox: 'xbox' },
    });
  });

  it('an address override wins as today: every class and choice is kept', () => {
    for (const c of CLASSES) for (const g of CHOICES) expect(classGraphics(g, c, true), `${c}/${g}`).toBe(g);
  });
});
