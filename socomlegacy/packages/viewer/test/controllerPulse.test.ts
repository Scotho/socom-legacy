import { describe, expect, it } from 'vitest';
import { MenuPad, NO_PAD, PAD, UiClock, UI_TICK_SECONDS } from '@s2u/ui';
import { createControllerPulse, EDITOR_PULSE_MS, controllerPulseScript } from '../e2e/controllerPulse';
import { TauntMenu } from '../src/tauntMenu';

/** Real UI clock, simulated display polls; a microtask release happens after the
 * same rendering stack as TauntEditor.frame, never before its advance call.
 */
function sampleUi(hz: number, holdMs: number, startFrame = 1) {
  const clock = new UiClock(), pad = new MenuPad(), pulse = createControllerPulse(holdMs);
  let down = false, presses = 0, releases = 0, releasedAt: number | null = null;
  const samples: boolean[] = [];
  pad.flush(NO_PAD); // Ready after neutral input, as the fixture requires.
  clock.advance(0);
  for (let frame = 1; frame <= 30; frame++) {
    const now = frame * 1000 / hz;
    if (frame === startFrame) down = true;
    const releaseAfterPoll = down && pulse.sample(now);
    clock.advance(now, () => {
      samples.push(down);
      pad.read({ down: new Set(down ? ['CROSS'] : []), stickX: 0, stickY: 0 });
      if (pad.state('CROSS') === PAD.FALLING) presses++;
      if (pad.state('CROSS') === PAD.RISING) releases++;
    });
    if (releaseAfterPoll) { down = false; releasedAt = now; }
  }
  return { presses, releases, samples, releasedAt };
}

describe('controller editor pulses across render and original UI clocks', () => {
  it.each([60, 144])('reproduces the old single-poll loss at %s Hz', hz => {
    expect(sampleUi(hz, 0)).toMatchObject({ presses: 0, releases: 0 });
  });
  it('uses the exported original UI tick for editor hold time', () => {
    expect(EDITOR_PULSE_MS).toBe(UI_TICK_SECONDS * 1000);
  });
  it.each([60, 144])('the editor receives one press and its release across display phases at %s Hz', hz => {
    for (let startFrame = 1; startFrame <= 8; startFrame++) {
      expect(sampleUi(hz, EDITOR_PULSE_MS, startFrame)).toMatchObject({ presses: 1, releases: 1 });
    }
  });
  it('anchors duration at the first pressed poll, not at the browser-driver request', () => {
    const pulse = createControllerPulse(EDITOR_PULSE_MS);
    expect(pulse.sample(1000)).toBe(false);
    expect(pulse.sample(1000 + EDITOR_PULSE_MS - 1)).toBe(false);
    expect(pulse.sample(1000 + EDITOR_PULSE_MS)).toBe(true);
  });
  it('keeps a non-editor tap released after its first pressed poll', () => {
    expect(createControllerPulse(0).sample(1000)).toBe(true);
  });
  it.each([60, 144])('keeps Circle as one Chat tap without a held confirmation at %s Hz', hz => {
    const sent: unknown[] = [];
    const menu = new TauntMenu({ send: choice => sent.push(choice), sound: () => {}, unsupported: () => {}, custom: () => [] });
    const pulse = createControllerPulse(0);
    menu.frame(0, new Set(['Circle']), true);
    expect(pulse.sample(0)).toBe(true);
    for (let frame = 1; frame <= 30; frame++) menu.frame(frame / hz, new Set(), true);
    expect(menu.state()).toMatchObject({ open: true, root: 0, depth: 0, voiceHeld: false });
    expect(sent).toEqual([]);
  });
  it('injects the same standalone factory without depending on module variables', () => {
    const target = {} as { __s2uCreateControllerPulse: typeof createControllerPulse };
    new Function('window', controllerPulseScript())(target);
    const pulse = target.__s2uCreateControllerPulse(EDITOR_PULSE_MS);
    expect(pulse.sample(0)).toBe(false);
    expect(pulse.sample(EDITOR_PULSE_MS)).toBe(true);
    expect(target.__s2uCreateControllerPulse(0).sample(0)).toBe(true);
  });
});
