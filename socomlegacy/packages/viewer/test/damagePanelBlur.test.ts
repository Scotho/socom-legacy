// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { damagePanelFrame, damagePanelKey, stageDamageWindow } from '../src/damagePanel';
import { noInput, type PadButton } from '../src/gamepad';

/**
 * The review's F2 (WM-13, a browser adaptation): the keyboard's I taken by the panel is recorded as held until its keyup;
 * a page left (the window's blur, the document hidden) never sends that keyup, so the record and the taken state are
 * cleared there -- else R2 and the inventory stay taken in every later frame, live rounds included.
 */
afterEach(() => { stageDamageWindow(undefined); });

const hudSpy = () => { const set: unknown[] = []; return { set, setDamagePanel: (p: unknown) => { set.push(p); } }; };

const blur = (): void => { window.dispatchEvent(new Event('blur')); };
const hide = (): void => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
  document.dispatchEvent(new Event('visibilitychange'));
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
};

describe("the panel's I let go when the page loses focus", () => {
  for (const [name, lose] of [["the window's blur", blur], ['the document hidden', hide]] as const) {
    it(`${name}: after a taken I, the next frame's R2 reaches the inventory and WEAPON EXCHANGE`, () => {
      const hud = hudSpy();
      stageDamageWindow({ kind: 'round', report: null });
      damagePanelFrame(hud, null, new Set(), { ...noInput(), scoreboard: true }, true, 'keyboard');
      expect(damagePanelKey(hud, null, 'KeyI', true, true)).toBe(true);          // taken: the panel
      lose();                                                                     // the keyup never comes
      stageDamageWindow(null);                                                    // back in a live round
      const down = new Set<PadButton>(['R2']);
      const input = { ...noInput(), inventory: true };
      const out = damagePanelFrame(hud, null, down, input, false, 'pad');
      expect(out).toBe(input);
      expect(out.inventory).toBe(true);
      expect(down.has('R2')).toBe(true);
    });
  }
});

describe("the re-check's finding: a PAD binding taken stays taken across a focus loss until let go", () => {
  for (const [name, lose] of [["the window's blur", blur], ['the document hidden', hide]] as const) {
    it(`${name}: SELECT + R2 taken, R2 held through the loss -> still taken; let go -> untaken`, () => {
      const hud = hudSpy();
      stageDamageWindow({ kind: 'round', report: null });
      damagePanelFrame(hud, null, new Set(), { ...noInput(), scoreboard: true }, false, 'pad');
      const first = new Set<PadButton>(['Select', 'R2']);
      expect(damagePanelFrame(hud, null, first, { ...noInput(), scoreboard: true, inventory: true }, false, 'pad').inventory).toBe(false);
      expect(first.has('R2')).toBe(false);                                       // taken: the panel
      lose();
      const held = new Set<PadButton>(['R2']);                                   // R2 still held, SELECT let go
      const out = damagePanelFrame(hud, null, held, { ...noInput(), inventory: true }, false, 'pad');
      expect(out.inventory, 'never handed over before it is let go').toBe(false);
      expect(held.has('R2')).toBe(false);
      const free = { ...noInput() };
      expect(damagePanelFrame(hud, null, new Set(), free, false, 'pad')).toBe(free);   // let go
      const again = new Set<PadButton>(['R2']), press = { ...noInput(), inventory: true };
      expect(damagePanelFrame(hud, null, again, press, false, 'pad')).toBe(press);   // a fresh press without SELECT: today's
      expect(again.has('R2')).toBe(true);
    });
  }
});
