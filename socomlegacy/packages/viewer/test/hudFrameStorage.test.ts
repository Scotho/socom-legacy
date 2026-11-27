import { describe, expect, it } from 'vitest';
import { AT_REST, DEFAULT_MODEL, hudLayout, hudPass, type HudModel } from '../src/hud';
import { HudFrameStorage } from '../src/hudFrameStorage';

const frame = { width: 640, height: 448 };
const sizes = Object.fromEntries(['font_text_01.tif', 'newweapnbkrnd.tif', 'm4carbine_icon.tif', 'firemode.tif', 'compass_lo.tif', 'white'].map(name => [name, { width: 256, height: 256 }]));
const models: HudModel[] = [
  { ...DEFAULT_MODEL, name: 'PLAYER', timer: 123, fader: 0.5 },
  { ...DEFAULT_MODEL, name: 'TEAMMATE', timer: 61, health: 0.3, yaw: 38, fader: 0 },
  { ...DEFAULT_MODEL, name: 'TEST', spectator: { path: 'own', followed: null, stats: null } },
];

describe('owned HUD frame storage', () => {
  it('reuses draw records and colours while matching the unpooled layout across changing frames', () => {
    const storage = new HudFrameStorage();
    const initial = hudLayout(frame, models[0]!, sizes, AT_REST, storage);
    expect(initial.quads.length).toBeGreaterThan(5);
    const first = initial.quads[0]!, colour = first.rgba;
    for (let i = 0; i < 18; i++) {
      const model = models[i % models.length]!;
      expect(hudLayout(frame, model, sizes, AT_REST, storage)).toEqual(hudLayout(frame, model, sizes));
    }
    const again = hudLayout(frame, models[0]!, sizes, AT_REST, storage);
    expect(again.quads[0]).toBe(first);
    expect(again.quads[0]!.rgba).toBe(colour);
  });

  it('bounds retained records without dropping quads when a frame exceeds capacity', () => {
    const storage = new HudFrameStorage(2);
    const first = hudLayout(frame, models[0]!, sizes, AT_REST, storage);
    const second = hudLayout(frame, models[0]!, sizes, AT_REST, storage);
    expect(second).toEqual(hudLayout(frame, models[0]!, sizes));
    expect(second.quads[0]).toBe(first.quads[0]);
    expect(second.quads[1]).toBe(first.quads[1]);
    expect(second.quads[2]).not.toBe(first.quads[2]);
    storage.clear();
    expect(hudLayout(frame, models[0]!, sizes, AT_REST, storage).quads[0]).not.toBe(second.quads[0]);
  });

  it('keeps independent HUDs and pure snapshots independent, including filtered passes', () => {
    const storage = new HudFrameStorage(), other = new HudFrameStorage();
    const saved = hudLayout(frame, models[0]!, sizes);
    const savedBytes = JSON.stringify(saved);
    const independent = hudLayout(frame, models[0]!, sizes, AT_REST, other);
    for (const model of models) for (const tac of [false, true]) {
      expect(hudPass(frame, model, sizes, AT_REST, tac, null, 'ps2', storage)).toEqual(hudPass(frame, model, sizes, AT_REST, tac, null));
    }
    expect(JSON.stringify(saved)).toBe(savedBytes);
    expect(independent).toEqual(saved);
  });
});
