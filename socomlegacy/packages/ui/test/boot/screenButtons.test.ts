import { describe, expect, it } from 'vitest';
import { SCREEN_BUTTONS_STEP_READING, fireScreenButtons } from '../../src/boot/screenButtons';
import { BINDING_DEFAULT_CODE, DIALOG_BUTTONS, type DialogBinding } from '../../src/dialog';
import { widgetPad } from '../../src/widgets/pad';

/**
 * Step 4 of the menu's input dispatch (`FUN_00368650` D:L263865-264123; web research 116 §3): the screen's BUTTON
 * bindings against the pad record -- the first whose STATE equals the pad's byte for its button fires, one a frame;
 * a match whose animation is missing still consumes (R116.16); an EVENT record and an untouched slot never match.
 */

const button = (name: string, animation: string | null, state = 1, argument: string | null = 'dlgMenu.rdr'): DialogBinding =>
  ({ kind: 'button', name, code: DIALOG_BUTTONS[name]!, state, animation, argument });

describe('fireScreenButtons', () => {
  const bindings: DialogBinding[] = [
    { kind: 'event', name: 'ONMPEGEND', code: 3, state: 1, animation: 'goto_menu_silent', argument: 'dlgMenu.rdr' },
    button('START', 'goto_menu'), button('CROSS', 'goto_menu'), button('TRIGGER_L2', 'goto_menu'),
    { kind: 'button', name: null, code: BINDING_DEFAULT_CODE, state: 1, animation: null, argument: null },
  ];
  const started: string[] = [];
  const start = (animation: string, argument: string | null): boolean => { started.push(`${animation}(${argument})`); return true; };

  it('is step 4 alone (SCREEN_BUTTONS_STEP_READING)', () => {
    expect(SCREEN_BUTTONS_STEP_READING).toBe('step 4 alone');
  });

  it('fires the first binding whose state the pad holds, with its ARGUMENT, and consumes the frame', () => {
    started.length = 0;
    expect(fireScreenButtons(bindings, widgetPad({ CROSS: 'FALLING' }), start)).toBe(true);
    expect(fireScreenButtons(bindings, widgetPad({ TRIGGER_L2: 'FALLING' }), start)).toBe(true);
    expect(fireScreenButtons(bindings, widgetPad({ START: 'FALLING', CROSS: 'FALLING' }), start)).toBe(true);
    expect(started).toEqual(['goto_menu(dlgMenu.rdr)', 'goto_menu(dlgMenu.rdr)', 'goto_menu(dlgMenu.rdr)']);
  });

  it('matches the binding\'s STATE, not any press: a held (DOWN) or released (RISING) key does not fire a FALLING binding', () => {
    started.length = 0;
    expect(fireScreenButtons(bindings, widgetPad({ CROSS: 'DOWN' }), start)).toBe(false);
    expect(fireScreenButtons(bindings, widgetPad({ CROSS: 'RISING' }), start)).toBe(false);
    expect(fireScreenButtons([button('CROSS', 'repeat', 2)], widgetPad({ CROSS: 'DOWN' }), start)).toBe(true);
    expect(started).toEqual(['repeat(dlgMenu.rdr)']);
  });

  it('a key the screen does not bind (SELECT), an EVENT record and an untouched slot never match', () => {
    started.length = 0;
    expect(fireScreenButtons(bindings, widgetPad({ SELECT: 'FALLING' }), start)).toBe(false);
    expect(fireScreenButtons(bindings, widgetPad({}), start)).toBe(false);
    expect(started).toEqual([]);
  });

  it('a match with no animation, or one no set defines, still consumes the frame (R116.16)', () => {
    started.length = 0;
    expect(fireScreenButtons([button('CROSS', null)], widgetPad({ CROSS: 'FALLING' }), start)).toBe(true);
    expect(fireScreenButtons([button('CROSS', 'NONE')], widgetPad({ CROSS: 'FALLING' }), () => false)).toBe(true);
    expect(started).toEqual([]);
  });
});
