import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ARMORY_VIEW_CLASS } from '../../src/forge/lobby/lobbyArmory';

/**
 * FG-44 (FG-30c's remainder, the rendered browser run, 2026-10-14): START, the menu's "Hide the lobby" and the toolbar's
 * toggle set the window's `hidden` (`setShown`), but `.fx-window { display: flex }` beat the attribute's own
 * `display: none`, so the window stayed drawn over the editor and the forge's START menu. Every element of the popup the
 * code hides by `hidden` and whose class rule sets a `display` carries its own `[hidden] { display: none }`.
 */
const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../src/forge/lobby/lobby.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '');

/** The rules as [selectors, body]. */
const rules = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].map((m) => [m[1]!.split(',').map((s) => s.trim()), m[2]!] as const);
const displayOf = (selector: string): string | null => {
  let out: string | null = null;
  for (const [sels, body] of rules) {
    if (!sels.includes(selector)) continue;
    const d = /(?:^|;)\s*display\s*:\s*([^;]+)/.exec(body);
    if (d) out = d[1]!.trim();
  }
  return out;
};

/** The popup's elements hidden by `hidden`: the window (`setShown`), the lobby's view (the ARMORY's screen), the ARMORY's
 *  canvas, the buttons (LAUNCH for a joiner), the countdown and the refusal. */
const HIDDEN_BY_CODE = ['fx-window', 'fx-lobby', ARMORY_VIEW_CLASS, 'fx-lobby-btn', 'fx-lobby-countdown', 'fx-lobby-refused'];

describe('FORGE lobby: a hidden part of the window is not drawn (FG-44)', () => {
  it('the window has its [hidden] rule', () => {
    expect(displayOf('.fx-window')).toBe('flex');
    expect(displayOf('.fx-window[hidden]')).toBe('none');
  });

  it('every part hidden by code whose rule sets a display has its [hidden] rule', () => {
    for (const cls of HIDDEN_BY_CODE) {
      if (displayOf(`.${cls}`) === null) continue;
      expect(displayOf(`.${cls}[hidden]`), cls).toBe('none');
    }
  });
});
