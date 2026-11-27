import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The review's F3 (WM-13, a browser adaptation): main.ts's one gate call, pinned by text as matchMount.test.ts pins
 * matchMount's -- after the pad's buttons are read, before WEAPON EXCHANGE's edges and the R2 inventory's frame -- and
 * its keyboard I ahead of WEAPON EXCHANGE's and the inventory's keys, its release ahead of the exchange's keyup.
 */
const src = (f: string): string => readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../src', f), 'utf-8');

describe("main.ts wires the damage panel's gate in order", () => {
  const main = src('main.ts');
  const at = (needle: string): number => { const i = main.indexOf(needle); expect(i, needle).toBeGreaterThan(-1); return i; };

  it("padFrame: the buttons read, then the gate, then WEAPON EXCHANGE's edges, then the R2 inventory's frame", () => {
    const order = [
      'const down = new Set([...padButtonsDown(polled), ...padButtonsDown(touch.pad)]);',
      'input = damagePanelFrame(hud, net, down, input, scoreboardKeys.held(), promptDevice());',
      'const edges = exchangePart.edges(down);',
      'const game = menu || !walking ? input : inventory.frame(padMerged, input, dt, frameTime.real());',
    ].map(at);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(main.split('damagePanelFrame(').length - 1, 'one frame call').toBe(1);
  });

  it("the keys: I to the panel before WEAPON EXCHANGE and the inventory; its release before the exchange's keyup", () => {
    const down = at('if (damagePanelKey(hud, net, e.code, true, scoreboardKeys.held()))');
    expect(down).toBeLessThan(at('let taken = e.repeat ? open : exchange.key(e.code, exchangeGate());'));
    expect(down).toBeLessThan(at(': inventory.key(e.code);'));
    const up = at('damagePanelKey(hud, net, e.code, false, scoreboardKeys.held());');
    expect(up).toBeGreaterThan(at("globalThis.addEventListener('keyup', testroomKeys("));
    expect(up).toBeLessThan(at('if (exchangeInput.key(e.code, false, false))'));
  });
});
