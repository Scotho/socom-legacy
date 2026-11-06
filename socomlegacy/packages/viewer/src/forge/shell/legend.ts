import { dpad, GLYPH } from '../../console/icons';
import type { PadAction } from '../pad';
import type { MenuItem } from '../padMenu';

/**
 * FUI-3 (the review's PAD-5 and VP-11's menu half; FUI.R6; OT.R68; a browser adaptation, FG.R2 -- the game has no editor,
 * so nothing here is the original's): the Forge's button legend, one function of what the pad is doing (`legendFor`),
 * drawn as the design system's prompts (`shared/ds` README, "s2u-prompts -- glyph + verb") in a strip at the status bar
 * (`drawLegend`), and in the menu's header. It replaces the hint line's prose. Each prompt names the buttons its glyph
 * stands for and the actions a press of them gives (`./../pad` `ForgePad`'s edge and repeat map, pinned by
 * `test/forge/legend.test.ts`), so the legend can never say a press the context does not read; a prompt that presses is
 * a touch button doing what the press does. The glyphs are the system's SVGs (`padGlyph`; the console launcher's
 * `GLYPH` and D-pad), the Circle in the owner's red (`--s2u-glyph-circle`, forge.css). Without a pad the same contexts
 * give the keyboard and mouse words (OT.R68: every build's editor takes them).
 */

/** The pad's marks a prompt draws: the four face buttons, the D-pad's pairs, the shoulders, SELECT and START, the sticks. */
export type PadGlyphName =
  | 'cross' | 'circle' | 'square' | 'triangle' | 'dpad-v' | 'dpad-h' | 'l1r1' | 'l2r2' | 'select' | 'start' | 'l3' | 'r3' | 'lstick' | 'rstick';

/** The standard mapping's buttons each glyph stands for (`../pad`: Cross 0 ... START 9, L3 10, R3 11, the d-pad 12-15). */
export const LEGEND_BUTTONS: Readonly<Record<PadGlyphName, readonly number[]>> = {
  cross: [0], circle: [1], square: [2], triangle: [3], l1r1: [4, 5], l2r2: [6, 7], select: [8], start: [9], l3: [10], r3: [11],
  'dpad-v': [12, 13], 'dpad-h': [14, 15], lstick: [], rstick: [],
};

/** A glyph's words for a screen reader (the system's `.s2u-visually-hidden` before the verb). */
const SPOKEN: Readonly<Record<PadGlyphName, string>> = {
  cross: 'Cross', circle: 'Circle', square: 'Square', triangle: 'Triangle', 'dpad-v': 'D-pad up and down', 'dpad-h': 'D-pad left and right',
  l1r1: 'L1 and R1', l2r2: 'L2 and R2', select: 'SELECT', start: 'START', l3: 'L3', r3: 'R3', lstick: 'Left stick', rstick: 'Right stick',
};

/** The text keys of the shoulders, SELECT, START and the sticks (the system's `.s2u-prompt__key`). */
const KEYS: Partial<Record<PadGlyphName, readonly string[]>> = {
  l1r1: ['L1', 'R1'], l2r2: ['L2', 'R2'], select: ['SELECT'], start: ['START'], l3: ['L3'], r3: ['R3'], lstick: ['L'], rstick: ['R'],
};

/** One prompt: a pad glyph or a keyboard key, its verb, and what a press gives (one action a button of the glyph). */
export interface LegendPrompt {
  glyph?: PadGlyphName;
  /** Without a pad: the key or the mouse's way, as words. */
  key?: string;
  label: string;
  /** The actions the glyph's buttons give, in `LEGEND_BUTTONS` order; a tap on the prompt presses the last (R1, down, right). */
  actions?: readonly PadAction[];
  /** A hold (Circle's grab, Cross's add): said, never pressed by a tap. */
  hold?: boolean;
}

/** What the pad is doing, as the legend reads it. */
export type LegendContext =
  /** The editor: the tool (`./../page` `Mode`) and how many placements are picked. */
  | { kind: 'build'; tool: string; selection: number }
  | { kind: 'walk' }
  /** The START menu: the row under the cursor, how deep in its sub-screens, how many sections the screen has. */
  | { kind: 'menu'; item: MenuItem | undefined; depth: number; sections: number }
  /** A card on the stack (`./cards`): its walker. */
  | { kind: 'card' }
  /** A panel holding the focus lease or the dock's focus. */
  | { kind: 'panel' }
  /** The lobby's window, which reads the pad itself. */
  | { kind: 'lobby' }
  /** A match: its own HUD; the legend says nothing. */
  | { kind: 'match' };

export type LegendInput = 'pad' | 'keys';

const p = (glyph: PadGlyphName, label: string, ...actions: PadAction[]): LegendPrompt => ({ glyph, label, ...(actions.length ? { actions } : {}) });
const hold = (glyph: PadGlyphName, label: string): LegendPrompt => ({ glyph, label: `Hold: ${label}`, hold: true });
const k = (key: string, label: string): LegendPrompt => ({ key, label });

/** The tools the pad steps with L1 / R1 that place a marker (`./../page` `TOOLS`). */
const MARKERS = new Set(['spawnA', 'spawnB', 'bomb', 'siteSeal', 'siteTerrorist']);

function padPrompts(ctx: LegendContext): LegendPrompt[] {
  switch (ctx.kind) {
    case 'build': {
      const tool = p('l1r1', 'Tool', 'prevTool', 'nextTool'), menu = p('start', 'Menu', 'menu'), undo = p('select', 'Undo', 'undo');
      const fly = p('lstick', 'Fly');
      if (ctx.tool === 'select' && ctx.selection > 0) {
        return [p('cross', 'Select', 'act'), p('circle', 'Deselect', 'deselect'), hold('circle', 'move'), p('square', 'Duplicate', 'duplicate'),
          p('triangle', 'Delete', 'delete'), p('dpad-h', 'Rotate', 'turnLeft', 'turnRight'), tool, menu];
      }
      if (ctx.tool === 'place') return [p('cross', 'Place', 'act'), p('dpad-v', 'Prop', 'prevAsset', 'nextAsset'), tool, p('r3', 'Snap', 'snap'), fly, undo, menu];
      if (ctx.tool === 'npc') return [p('cross', 'Place', 'act'), p('dpad-v', 'Character', 'prevAsset', 'nextAsset'), tool, fly, undo, menu];
      if (MARKERS.has(ctx.tool)) return [p('cross', 'Place', 'act'), tool, fly, undo, menu];
      return [p('cross', 'Select', 'act'), hold('cross', 'add'), p('dpad-v', 'Prop', 'prevAsset', 'nextAsset'), tool, fly, p('rstick', 'Look'), undo, menu];
    }
    case 'walk':
      return [p('lstick', 'Move'), p('rstick', 'Look'), p('cross', 'Jump', 'act'), p('circle', 'Stance', 'deselect'), p('square', 'Doors', 'duplicate'), p('start', 'Build', 'menu')];
    case 'menu': {
      const it = ctx.item, live = !!it && !it.disabled && !it.heading;
      return [
        p('dpad-v', 'Choose', 'prevAsset', 'nextAsset'),
        ...(live && (it.left || it.right) ? [p('dpad-h', 'Change', 'turnLeft', 'turnRight')] : []),
        ...(live ? [p('cross', it.page ? 'Open' : 'Select', 'act')] : []),
        ...(live && it.secondary ? [p('square', it.secondary.label, 'duplicate')] : []),
        ...(live && it.remove ? [p('triangle', it.remove.label, 'delete')] : []),
        ...(ctx.sections > 1 ? [p('l1r1', 'Section', 'prevTool', 'nextTool')] : []),
        p('circle', ctx.depth > 0 ? 'Back' : 'Close', 'deselect'),
        p('start', 'Close', 'menu'),
      ];
    }
    case 'card': return [p('dpad-v', 'Choose', 'prevAsset', 'nextAsset'), p('cross', 'Press', 'act'), p('circle', 'Back', 'deselect')];
    case 'panel': return [p('dpad-v', 'Choose', 'prevAsset', 'nextAsset'), p('cross', 'Select', 'act'), p('circle', 'Back', 'deselect'), p('start', 'Menu', 'menu')];
    case 'lobby': return [p('start', 'Hide the lobby', 'menu')];
    case 'match': return [];
  }
}

function keyPrompts(ctx: LegendContext): LegendPrompt[] {
  switch (ctx.kind) {
    case 'build': {
      const look = k('Right-drag', 'Look');
      if (ctx.tool === 'select') {
        return [k('Click', 'Select'), k('Shift+click', 'Add'), k('Shift+drag', 'Box'), look, k('WASD', 'Fly'), k('F', 'Frame'), k('M', 'Menu')];
      }
      if (ctx.tool === 'place') return [k('Click', 'Place'), k('[ ]', 'Prop'), k('1', 'Select tool'), look, k('M', 'Menu')];
      return [k('Click', ctx.tool === 'npc' ? 'Place the NPC' : 'Place'), k('1', 'Select tool'), look, k('M', 'Menu')];
    }
    case 'walk': return [k('WASD', 'Move'), k('Mouse', 'Look'), k('Space', 'Jump'), k('C', 'Stance'), k('X', 'Doors'), k('P / Esc', 'Build')];
    case 'menu': return [k('↑ ↓', 'Choose'), k('← →', 'Change'), k('Enter', 'Select'), k('PgUp PgDn', 'Section'), k('Esc', ctx.depth > 0 ? 'Back' : 'Close'), k('M', 'Close')];
    case 'card': return [k('Tab', 'Choose'), k('Enter', 'Press'), k('Esc', 'Back')];
    case 'panel': return [k('Tab', 'Choose'), k('Esc', 'Back')];
    case 'lobby': return [k('M', 'Forge menu')];
    case 'match': return [];
  }
}

/** FUI-3: the one legend -- the prompts for what the pad (or, without one, the keyboard and mouse) does here. */
export function legendFor(ctx: LegendContext, input: LegendInput = 'pad'): LegendPrompt[] {
  return input === 'pad' ? padPrompts(ctx) : keyPrompts(ctx);
}

/**
 * FUI-3 (FUI.R6): the design system's mark for a pad glyph, as markup: a face button the system's prompt glyph (an SVG in
 * `s2u-prompt__glyph s2u-prompt__glyph--<name>`, the console's `GLYPH` shape), the D-pad the console's with its live pair
 * lit, the shoulders, SELECT, START and the sticks the system's text keys.
 */
export function padGlyph(name: PadGlyphName): string {
  if (name === 'cross' || name === 'circle' || name === 'square' || name === 'triangle') {
    return `<svg class="s2u-prompt__glyph s2u-prompt__glyph--${name}" viewBox="6 6 14 14" aria-hidden="true">${GLYPH[name]}</svg>`;
  }
  if (name === 'dpad-v' || name === 'dpad-h') {
    return dpad(name === 'dpad-v' ? 'v' : 'h').replace('class="cx-dpad"', 'class="s2u-prompt__glyph s2u-prompt__glyph--dpad"');
  }
  return (KEYS[name] ?? []).map((t) => `<span class="s2u-prompt__key" aria-hidden="true">${t}</span>`).join('');
}

export interface DrawLegendOptions {
  /** A pad is live: the strip shows on a touch screen too (the system's `.is-pad`). */
  pad: boolean;
  /** A prompt's tap: the press it stands for (the page's `padAction`). */
  onPress?(action: PadAction): void;
  /** A line before the prompts (the tool waits for a choice: "Choose a prop in the assets first"). */
  note?: string;
  /**
   * R7-A R2: where the prompts sit. `'strip'` (the default): the viewport's strip, `.fx-legend`, absolute at the bottom of
   * its positioned ancestor. `'inline'`: in the flow of its host (the menu's header), `.fx-legend-inline` -- never
   * `.fx-legend`, so it never leaves its header for the bottom of the window and two strips never both match.
   */
  placement?: LegendPlacement;
}

/** R7-A R2: the legend's two forms -- the viewport's strip, or inline in a header. */
export type LegendPlacement = 'strip' | 'inline';

/**
 * FUI-3: the prompts drawn into `host` (a `ul`, the system's `.s2u-prompts`; `.fx-legend` for the strip,
 * `.fx-legend-inline` inline): a prompt that presses is a `button.s2u-prompt` in its `li` (a touch target doing what the
 * press does), a hold or a stick an `li.s2u-prompt`; the glyph's spoken name first for a screen reader, then the verb.
 */
export function drawLegend(doc: Document, host: HTMLElement, prompts: readonly LegendPrompt[], o: DrawLegendOptions): void {
  host.className = `s2u-prompts ${o.placement === 'inline' ? 'fx-legend-inline' : 'fx-legend'}${o.pad ? ' is-pad' : ''}`;
  host.setAttribute('aria-label', 'Controls here');
  const items: HTMLElement[] = [];
  if (o.note) {
    const note = doc.createElement('li');
    note.className = 'fx-legend-note';
    note.textContent = o.note;
    items.push(note);
  }
  for (const pr of prompts) {
    const press = !pr.hold && pr.actions?.length ? pr.actions[pr.actions.length - 1]! : null;
    const item = doc.createElement(press && o.onPress ? 'button' : 'li');
    item.className = 's2u-prompt';
    if (item instanceof HTMLButtonElement && press) {
      item.type = 'button';
      item.dataset['padPress'] = press;
      item.addEventListener('click', () => o.onPress?.(press));
    }
    if (pr.glyph) {
      item.insertAdjacentHTML('beforeend', padGlyph(pr.glyph));
      const spoken = doc.createElement('span');
      spoken.className = 's2u-visually-hidden';
      spoken.textContent = `${SPOKEN[pr.glyph]}:`;
      item.append(spoken);
    } else if (pr.key) {
      const key = doc.createElement('span');
      key.className = 's2u-prompt__key';
      key.textContent = pr.key;
      item.append(key);
    }
    item.append(doc.createTextNode(pr.label));
    if (item instanceof HTMLButtonElement) {
      const li = doc.createElement('li');                       // a list's child is an item; the button inside it
      li.className = 'fx-legend-item';
      li.append(item);
      items.push(li);
    } else items.push(item);
  }
  host.replaceChildren(...items);
}
