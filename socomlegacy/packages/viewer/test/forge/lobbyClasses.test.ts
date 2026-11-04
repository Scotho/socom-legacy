import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ARMORY_VIEW_CLASS } from '../../src/forge/lobby/lobbyArmory';
import { LOBBY_CONTROLS } from '../../src/forge/lobby/lobbyView';

/**
 * FG-30 (the rendered browser run, 2026-10-14): the ARMORY button took the ARMORY canvas's class (`fx-lobby-${name}`
 * for the control `armory` = the canvas's `fx-lobby-armory`), so it drew as a full-height black block and pushed LAUNCH
 * and LEAVE out of the window. No lobby button's class may be the canvas's.
 */
describe('FORGE lobby: the ARMORY canvas and the buttons keep apart classes', () => {
  it("no control's class is the ARMORY view's", () => {
    for (const name of LOBBY_CONTROLS) expect(`fx-lobby-${name}`).not.toBe(ARMORY_VIEW_CLASS);
  });

  /**
   * FG-48's browser look (2026-10-16, 1280x720): the READY button took the roster's ready mark's class
   * (`fx-lobby-ready`, `width: 12px`), its flex basis 12 px. With six controls the row's spare width grew it; FG-48's
   * nine left none, so READY drew 35 px wide over 65 px of text, "READY (11)" clipped under SWITCH SIDES. No bare rule
   * may style a control's class (the roster's marks are scoped to their row; LAUNCH's own gold is the one meant), and
   * no control shrinks below its text: the row wraps instead.
   */
  const css = readFileSync(new URL('../../src/forge/lobby/lobby.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].map((m) => ({ selectors: m[1]!.split(',').map((s) => s.trim()), body: m[2]! }));

  it("no bare rule styles a control's class but LAUNCH's colour (the READY clip)", () => {
    for (const name of LOBBY_CONTROLS) {
      for (const r of rules.filter((r) => r.selectors.includes(`.fx-lobby-${name}`))) {
        expect({ name, body: r.body.trim() }).toEqual({ name: 'launch', body: 'color: var(--fx-gold);' });
      }
    }
  });

  it('every control keeps its text whole: no control below its content width, the row wrapping', () => {
    const btn = rules.find((r) => r.selectors.includes('.fx-lobby-btn') && r.selectors.length === 1 && /flex:/.test(r.body))!;
    expect(btn.body).toMatch(/min-width:\s*max-content/);
    expect(rules.find((r) => r.selectors.includes('.fx-lobby-buttons'))!.body).toMatch(/flex-wrap:\s*wrap/);
  });
});
