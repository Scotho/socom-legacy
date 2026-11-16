// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { browserStoredControllerConfig, controllerConfigs, ControllerConfigs, storedControllerConfig } from '../src/controllerConfigs';
import { codModernChosen, COD_MODERN_LABEL, setCodModernChosen } from '../src/controllerModern';
import { CONTROLLER_LAYOUTS, controllerLayoutDescription } from '../src/controllerSettings';
import { localStartMenuOptions } from '../src/startMenu';
import { PAD_BUTTON, PAD_FLAGS, padInput, type PadButton, type PadFlag } from '../src/gamepad';

const select = (value: number) => controllerConfigs.store(name => name === 'SelectedControllerConfig' ? value : 0);
// V20.R4 (the owner, 2026-11-11): COD Modern is chosen in the page's own store, never as a card value -- the card keeps an original layout.
const cod = (card = 1) => { setCodModernChosen(true); select(card); };
const press = (...buttons: PadButton[]) => padInput({ axes: [0, 0, 0, 0], buttons: Array.from({ length: 16 }, (_, i) => ({ pressed: buttons.some(b => PAD_BUTTON[b] === i), value: buttons.some(b => PAD_BUTTON[b] === i) ? 1 : 0 })) });
afterEach(() => { setCodModernChosen(false); localStorage.clear(); controllerConfigs.reset(); });

describe('COD Modern browser layout', () => {
  it('is the fifth shared choice, labelled as not the original\'s, while the original four-config reader remains unchanged', () => {
    expect(CONTROLLER_LAYOUTS.map(x => x.label)).toEqual(['Precision Shooter', 'Lefty', 'Scout', 'Sure Shot', 'COD Modern (not the original\'s)']);
    expect(COD_MODERN_LABEL).toBe('COD Modern (not the original\'s)');
    expect(storedControllerConfig(5)).toBe('Default');
    const original = new ControllerConfigs();
    original.store(name => name === 'SelectedControllerConfig' ? 5 : 0);
    expect(original.active).toBe('Default');
    select(5);                                                     // V20.R4: a card value of 5 is no choice of COD Modern
    expect(controllerConfigs.active).toBe('Default');
    expect(browserStoredControllerConfig(5)).toBe('Default');
    cod(3);
    expect(codModernChosen()).toBe(true);
    expect(controllerConfigs.active).toBe('CODModern');
    expect(controllerLayoutDescription(5)).toMatch(/^A browser adaptation, not one of SOCOM II's layouts/);
    expect(controllerLayoutDescription(5)).toContain('SOCOM');
  });

  it('applies every Home layout to the live match without reverting COD Modern', () => {
    const local = localStartMenuOptions();
    // The card's value as Home's write leaves it: COD Modern keeps the original layout last chosen (V20.R4).
    for (const [chosen, card, name] of [[2, 2, 'Reverse'], [5, 2, 'CODModern'], [4, 4, 'Goldeneye'], [5, 4, 'CODModern'], [3, 3, 'Config4'], [1, 1, 'Default'], [5, 1, 'CODModern']] as const) {
      setCodModernChosen(chosen === 5);
      local.committed('SelectedControllerConfig', card);
      expect(controllerConfigs.active).toBe(name);
      expect(local.value('SelectedControllerConfig')).toBe(card);
    }
    local.committed('FIREMODESWAP_CONTROLLER', 1);
    expect(controllerConfigs.active).toBe('CODModern');
    expect(controllerConfigs.fireModeSwap).toBe(true);
    expect(press('Select').fireMode).toBe(true);
  });

  const expected: Record<PadButton, PadFlag[]> = {
    Cross: ['jump'], Circle: ['stance', 'boost'], Square: ['action', 'reload'], Triangle: ['swap1'],
    L1: ['swap2'], R1: ['inventory'], L2: ['zoom'], R2: ['fire'], Select: ['scoreboard'], Start: ['mode'],
    L3: ['fireMode'], R3: [], Up: ['zoom'], Down: ['zoomOut'], Left: ['leanLeft'], Right: ['leanRight'],
  };
  for (const [button, lanes] of Object.entries(expected)) {
    it(button + ' drives exactly its modern actions and releases cleanly', () => {
      cod();
      const input = press(button as PadButton);
      expect(PAD_FLAGS.filter(flag => input[flag])).toEqual(PAD_FLAGS.filter(flag => lanes.includes(flag)));
      expect(PAD_FLAGS.filter(flag => press()[flag])).toEqual([]);
    });
  }

  it('switches repeatedly to every original layout without keeping modern actions', () => {
    for (const value of [1, 2, 3, 4, 1]) {
      cod(); expect(press('R2').fire).toBe(true); expect(press('Triangle').stance).toBe(false);
      controllerConfigs.select(storedControllerConfig(value));     // an original layout chosen (the native PRESETS press) ends it
      expect(codModernChosen()).toBe(false);
      select(value); expect(controllerConfigs.active).toBe(['Default', 'Reverse', 'Config4', 'Goldeneye'][value - 1]);
      if (value !== 4) { expect(press('R1').fire).toBe(true); expect(press('R2').fire).toBe(false); }
      expect(press('Triangle').stance).toBe(true);
    }
  });

  it('keeps movement and look on separate standard sticks', () => {
    cod();
    const input = padInput({ axes: [1, -1, -.5, .5], buttons: [] });
    expect(input.moveX).toBeGreaterThan(0); expect(input.moveY).toBeGreaterThan(0);
    expect(input.lookX).toBeLessThan(0); expect(input.lookY).toBeLessThan(0);
  });
});
