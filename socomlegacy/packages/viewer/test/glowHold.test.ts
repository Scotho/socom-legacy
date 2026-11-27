import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { glowHeld } from '../src/glowHold';

/** LATER 938 (product track, a renderer adaptation): when the Xbox class holds the glow twin's prepare compiles. */
describe('LATER 938: the glow hold’s policy and its wiring', () => {
  it('held only on the Xbox class, in play, with no flashbang in the air', () => {
    expect(glowHeld({ xbox: true, playing: true, flashInAir: false })).toBe(true);
    expect(glowHeld({ xbox: true, playing: true, flashInAir: true }), 'a flash in the air: released (WM-17 promotes)').toBe(false);
    expect(glowHeld({ xbox: true, playing: false, flashInAir: false }), 'an idle point: dead, spectating, between rounds').toBe(false);
    expect(glowHeld({ xbox: false, playing: true, flashInAir: false }), 'every other class: as before').toBe(false);
  });

  it('the match asks it each frame, beside the flash promotion', () => {
    const m = readFileSync(new URL('../src/matchMount.ts', import.meta.url), 'utf8');
    expect(m).toMatch(/holdGlow\?\.\(glowHeld\(/);
    // The delta review's finding: the idle point's terms -- dead, a spectator's seat, the round screens up (a survivor).
    expect(m).toMatch(/playing: walk\.mode\(\) === 'walk' && !walk\.isDead\(\) && \(!net \|\| \(net\.client\.role === 'player' && !net\.screenUp\(\)\)\)/);
  });
});
