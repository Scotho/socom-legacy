// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { ForgePad, type PadAction, type PadSnapshot } from '../../src/forge/pad';
import { crossHoldsIn } from '../../src/forge/pad';
import {
  drawLegend, LEGEND_BUTTONS, legendFor, padGlyph, type LegendContext, type LegendPrompt, type PadGlyphName,
} from '../../src/forge/shell/legend';

/**
 * FUI-3 (the review's PAD-5 and VP-11's menu half; FUI.R6; a browser adaptation, FG.R2): one legend from one function.
 * Every context's pad prompts are pinned here against the pad's own edge and repeat map (`../../src/forge/pad`
 * `ForgePad`): a prompt's glyph names the buttons it stands for, and pressing each of them gives the action the prompt
 * says the context reads -- so a legend can never name a press that does something else, or nothing.
 */

const rest = (): PadSnapshot => ({ buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })), axes: [0, 0, 0, 0] });
/** The actions one tap of `button` gives (pressed a frame, released a frame), on a pad armed at rest. */
const tap = (button: number, crossHolds = false): PadAction[] => {
  const pad = new ForgePad();
  pad.crossHolds = crossHolds;
  pad.frame(rest(), 0);
  const down = rest();
  (down.buttons as { pressed: boolean; value: number }[])[button] = { pressed: true, value: 1 };
  return [...pad.frame(down, 16).actions, ...pad.frame(rest(), 32).actions];
};

/** The table: each context the page draws, and the prompts it must show, glyph and word. */
const CONTEXTS: [string, LegendContext, [PadGlyphName, string][]][] = [
  ['Build, the Select tool, nothing selected', { kind: 'build', tool: 'select', selection: 0 },
    [['cross', 'Select'], ['cross', 'Hold: add'], ['dpad-v', 'Prop'], ['l1r1', 'Tool'], ['lstick', 'Fly'], ['rstick', 'Look'], ['select', 'Undo'], ['start', 'Menu']]],
  ['Build, the Select tool, a selection', { kind: 'build', tool: 'select', selection: 1 },
    [['cross', 'Select'], ['circle', 'Deselect'], ['circle', 'Hold: move'], ['square', 'Duplicate'], ['triangle', 'Delete'], ['dpad-h', 'Turn'], ['l1r1', 'Tool'], ['start', 'Menu']]],
  ['Build, the Place tool', { kind: 'build', tool: 'place', selection: 0 },
    [['cross', 'Place'], ['dpad-v', 'Prop'], ['l1r1', 'Tool'], ['r3', 'Snap'], ['lstick', 'Fly'], ['select', 'Undo'], ['start', 'Menu']]],
  ['Build, the NPC tool', { kind: 'build', tool: 'npc', selection: 0 },
    [['cross', 'Place'], ['dpad-v', 'Character'], ['l1r1', 'Tool'], ['lstick', 'Fly'], ['select', 'Undo'], ['start', 'Menu']]],
  ['Build, a marker tool (spawn, bomb, site)', { kind: 'build', tool: 'spawnA', selection: 0 },
    [['cross', 'Place'], ['l1r1', 'Tool'], ['lstick', 'Fly'], ['select', 'Undo'], ['start', 'Menu']]],
  ['Walk', { kind: 'walk' },
    [['lstick', 'Move'], ['rstick', 'Look'], ['cross', 'Jump'], ['circle', 'Stance'], ['square', 'Doors'], ['start', 'Build']]],
  ['the menu, a row', { kind: 'menu', depth: 0, sections: 4, item: { id: 'save', label: 'Saves' } },
    [['dpad-v', 'Choose'], ['cross', 'Select'], ['l1r1', 'Section'], ['circle', 'Close'], ['start', 'Close']]],
  ['the menu, a value row', { kind: 'menu', depth: 0, sections: 4, item: { id: 'snap', label: 'Snap', value: 'On', left: () => undefined } },
    [['dpad-v', 'Choose'], ['dpad-h', 'Change'], ['cross', 'Select'], ['l1r1', 'Section'], ['circle', 'Close'], ['start', 'Close']]],
  ['the menu, a sub-screen row with its own presses', { kind: 'menu', depth: 1, sections: 1,
    item: { id: 'o', label: 'crate', secondary: { label: 'Lock', act: () => undefined }, remove: { label: 'Hide', act: () => undefined } } },
    [['dpad-v', 'Choose'], ['cross', 'Select'], ['square', 'Lock'], ['triangle', 'Hide'], ['circle', 'Back'], ['start', 'Close']]],
  ['the menu, a row that opens a sub-screen', { kind: 'menu', depth: 0, sections: 1, item: { id: 'props', label: 'Props', page: () => [] } },
    [['dpad-v', 'Choose'], ['cross', 'Open'], ['circle', 'Close'], ['start', 'Close']]],
  ['the menu, a greyed row', { kind: 'menu', depth: 0, sections: 1, item: { id: 'x', label: 'x', disabled: true } },
    [['dpad-v', 'Choose'], ['circle', 'Close'], ['start', 'Close']]],
  ['a card', { kind: 'card' }, [['dpad-v', 'Choose'], ['cross', 'Press'], ['circle', 'Back']]],
  ['a panel holding the pad', { kind: 'panel' }, [['dpad-v', 'Choose'], ['cross', 'Select'], ['circle', 'Back'], ['start', 'Menu']]],
  ['the lobby\'s window', { kind: 'lobby' }, [['start', 'Hide the lobby']]],
  ['a match (its own HUD)', { kind: 'match' }, []],
];

describe('FUI-3: the legend, one function of the context', () => {
  it.each(CONTEXTS)('%s', (_, ctx, want) => {
    const got = legendFor(ctx);
    expect(got.map((p) => [p.glyph, p.label])).toEqual(want);
  });

  it.each(CONTEXTS.filter(([, , want]) => want.length > 0))('%s: each prompt\'s buttons give the actions it names, on the pad\'s own map', (_, ctx) => {
    for (const p of legendFor(ctx)) {
      const buttons = LEGEND_BUTTONS[p.glyph!];
      if (p.hold || !p.actions) { expect(p.actions ?? [], `${p.label}: a hold or a stick names no tap`).toEqual([]); continue; }
      expect(p.actions.length, `${p.glyph} ${p.label}: one action a button`).toBe(buttons.length);
      // Cross is a tap-or-hold in the build (FG-47): its act comes at the release there, at the press elsewhere.
      const holds = ctx.kind === 'build' ? crossHoldsIn({ playing: false, card: false, menu: false, lobbyWindow: false }) : false;
      p.actions.forEach((a, i) => expect(tap(buttons[i]!, holds), `${p.glyph} ${p.label}: button ${buttons[i]}`).toContain(a));
    }
  });

  it('the glyph map is the pad\'s standard mapping: face buttons 0-3, L1 R1 4-5, L2 R2 6-7, SELECT 8, START 9, L3 R3 10-11, d-pad 12-15', () => {
    expect(LEGEND_BUTTONS).toEqual({
      cross: [0], circle: [1], square: [2], triangle: [3], l1r1: [4, 5], l2r2: [6, 7], select: [8], start: [9], l3: [10], r3: [11],
      'dpad-v': [12, 13], 'dpad-h': [14, 15], lstick: [], rstick: [],
    });
  });

  it('keys, not glyphs, without a pad: the keyboard and mouse words of the same context (OT.R68)', () => {
    const keys = legendFor({ kind: 'build', tool: 'select', selection: 0 }, 'keys');
    expect(keys.map((p) => [p.key, p.label])).toEqual([['Click', 'Select'], ['Shift+click', 'Add'], ['Right-drag', 'Look'], ['WASD', 'Fly'], ['F', 'Frame'], ['M', 'Menu']]);
    expect(legendFor({ kind: 'menu', depth: 1, sections: 1, item: undefined }, 'keys').map((p) => [p.key, p.label]))
      .toEqual([['↑ ↓', 'Choose'], ['← →', 'Change'], ['Enter', 'Select'], ['PgUp PgDn', 'Section'], ['Esc', 'Back'], ['M', 'Close']]);
    expect(legendFor({ kind: 'walk' }, 'keys').map((p) => p.key)).toEqual(['WASD', 'Mouse', 'Space', 'C', 'X', 'P / Esc']);
  });
});

describe('FUI-3: the design system\'s glyphs (padGlyph) and the strip', () => {
  it('a face button is the system\'s prompt glyph, an SVG in its class; the Circle is marked for its red (FUI.R6)', () => {
    for (const g of ['cross', 'circle', 'square', 'triangle'] as const) {
      const host = document.createElement('div');
      host.innerHTML = padGlyph(g);
      const svg = host.querySelector('svg')!;
      expect(svg.getAttribute('class')).toBe(`s2u-prompt__glyph s2u-prompt__glyph--${g}`);
      expect(svg.getAttribute('aria-hidden')).toBe('true');
    }
    const host = document.createElement('div');
    host.innerHTML = padGlyph('dpad-v');
    expect(host.querySelector('svg')!.getAttribute('class')).toBe('s2u-prompt__glyph s2u-prompt__glyph--dpad');
    host.innerHTML = padGlyph('l1r1');
    expect([...host.querySelectorAll('.s2u-prompt__key')].map((k) => k.textContent)).toEqual(['L1', 'R1']);
    host.innerHTML = padGlyph('start');
    expect(host.querySelector('.s2u-prompt__key')!.textContent).toBe('START');
  });

  it('draws `.s2u-prompts.fx-legend`: is-pad with a pad; a prompt that presses is a touch button running its action; a note first', () => {
    const host = document.createElement('ul');
    const pressed = vi.fn<(a: PadAction) => void>();
    const prompts: LegendPrompt[] = legendFor({ kind: 'build', tool: 'select', selection: 1 });
    drawLegend(document, host, prompts, { pad: true, onPress: pressed, note: 'Choose a prop first' });
    expect(host.className).toBe('s2u-prompts fx-legend is-pad');
    expect(host.getAttribute('aria-label')).toBe('Controls here');
    expect(host.firstElementChild!.className).toBe('fx-legend-note');
    expect(host.firstElementChild!.textContent).toBe('Choose a prop first');
    const items = [...host.querySelectorAll('.s2u-prompt')];
    expect(items.map((i) => i.tagName)).toEqual(['BUTTON', 'BUTTON', 'LI', 'BUTTON', 'BUTTON', 'BUTTON', 'BUTTON', 'BUTTON']);
    const del = items[4] as HTMLButtonElement;
    expect(del.textContent).toBe('Triangle:Delete');
    expect(del.dataset['padPress']).toBe('delete');
    del.click();
    expect(pressed).toHaveBeenCalledWith('delete');
    (items[6] as HTMLButtonElement).click();                              // L1 / R1: a tap is R1's, the next tool
    expect(pressed).toHaveBeenLastCalledWith('nextTool');
    drawLegend(document, host, legendFor({ kind: 'build', tool: 'select', selection: 0 }, 'keys'), { pad: false, onPress: pressed });
    expect(host.classList.contains('is-pad')).toBe(false);
    expect(host.querySelector('.fx-legend-note')).toBeNull();
    expect([...host.querySelectorAll('.s2u-prompt__key')].map((k) => k.textContent)[0]).toBe('Click');
  });

  // R7-A R2 (the Forge batch's first rendered pass, case 7): every host was `.fx-legend`, the strip absolute at the
  // bottom of its positioned ancestor -- the menu header's prompts left the header for the bottom of the menu's window,
  // a second strip under the viewport's (and `.fx-legend` matched two strips). The header takes the inline form.
  it('the inline form: its own class, never `.fx-legend`; the strip stays the default', () => {
    const host = document.createElement('ul');
    const prompts = legendFor({ kind: 'menu', item: { id: 'a', label: 'A' }, depth: 0, sections: 2 });
    drawLegend(document, host, prompts, { pad: true, placement: 'inline', onPress: () => undefined });
    expect(host.className).toBe('s2u-prompts fx-legend-inline is-pad');
    expect(host.querySelectorAll('button.s2u-prompt').length).toBeGreaterThan(0);
    drawLegend(document, host, prompts, { pad: false, placement: 'inline' });
    expect(host.className).toBe('s2u-prompts fx-legend-inline');
    drawLegend(document, host, prompts, { pad: true, placement: 'strip' });
    expect(host.className).toBe('s2u-prompts fx-legend is-pad');
    drawLegend(document, host, prompts, { pad: true });
    expect(host.className).toBe('s2u-prompts fx-legend is-pad');
  });

  it('the stylesheet: the strip absolute at the bottom; the inline form static, no strip veil or rule', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const css = readFileSync(resolve(here, '../../src/forge/forge.css'), 'utf8').replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '');
    const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ selectors: m[1]!.trim().split(/\s*,\s*/), body: m[2]! }));
    const ruleOf = (selector: string): string => rules.filter((r) => r.selectors.includes(selector)).map((r) => r.body).join(';');
    expect(ruleOf('.fx-legend')).toMatch(/position:\s*absolute/);
    const inline = ruleOf('.fx-legend-inline');
    expect(inline).toMatch(/position:\s*static/);
    expect(inline).toMatch(/background:\s*none/);
    expect(inline).toMatch(/border:\s*0/);
    expect(inline).not.toMatch(/absolute|bottom:/);
    // Its prompt buttons take the pointer, as the strip's do.
    expect(ruleOf('.fx-legend-inline button.s2u-prompt')).toMatch(/pointer-events:\s*auto/);
  });
});
