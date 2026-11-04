import { describe, expect, it } from 'vitest';
import { buildDialogScreen, type UiDrawItem } from '../../src/index';
import { CheckboxWidget, RadioStripWidget, WidgetSet, widgetPad } from '../../src/widgets/index';
import { textFace } from '../text/fixtures';
import { RecordingHost, design, nodeCmd, r, rec } from './fixtures';

// Web research 117 §5: the RADIOSTRIP (`CRadioStrip`, vtable 0x407430) -- its pad `FUN_00370f60` (D:L268669-268722),
// apply `FUN_00370d10` (D:L268592-268613), check `FUN_00370db0` (D:L268618-268666), first tick `FUN_00370cb0`
// (D:L268577-268587), `Selection` (`FUN_003710d0`, ELF; parse `FUN_003711a0` D:L268737-268764) -- and the CHECKBOX
// (`CCheckBox`, vtable 0x4074c0): set-up `FUN_00371550` (D:L268862-268891), draw `FUN_003713a0` (D:L268819-268857), pad
// `FUN_00371680` (D:L268896-268937). dlgOptions_Menu's HDD strip shape: two flat-form checkboxes.

const box = (name: string, x: number) => r(
  'NAME', name, 'TYPE', 'CHECKBOX', 'XPOS', String(x), 'YPOS', '0', 'SPEC', r(
    'XSIZE', '35', 'YSIZE', '35', 'XOFFSET', '35', 'YOFFSET', '30', 'CAPTION', name,
    'NORMAL', 'op_checkbox.tif', 'ACTIVE', 'op_checkbox.tif', 'PRESSED', 'op_checkbox.tif', 'ACTIVE_COLOR', ['91', '72', '36'],
    'CHECK_TEXTURE', 'op_check.tif', 'CHECK_OFFSET', ['7', '7'], 'CHECK_SIZE', ['25', '25'],
    'ONCHECK', r('BUTTON', 'NONE', 'ANIMATION', `${name}_on`), 'ONUNCHECK', r('BUTTON', 'NONE', 'ANIMATION', `${name}_off`, 'ARGUMENT', 'u'),
    'ANIMATIONS', [r('EVENT', 'ONACTIVATE', 'ANIMATION', `${name}_act`)],
  ));
const strip = () => rec('HDDOnOff', 'RADIOSTRIP', 16, 279, r(
  'XSIZE', '160', 'YSIZE', '30', 'CAPTION', 'HDD',
  'NORMAL', [r('IMAGE', 'brown_back.tif')], 'ACTIVE', [r('IMAGE', 'brown_back_real.tif')],
  'ANIMATIONS', [r('BUTTON', 'CROSS', 'ANIMATION', 'NeverRead')],
  'SUBORDINATES', [box('HDD_On', 192), box('HDD_Off', 330), box('HDD_Maybe', 460)],
), 'CHILDOF', 'HDDOnOff');
const make = () => {
  const d = design([strip()]);
  const face = textFace();
  const set = WidgetSet.build(d, buildDialogScreen(d), { face: () => face });
  return { set, s: set.get('HDDOnOff') as RadioStripWidget, boxes: ['HDD_On', 'HDD_Off', 'HDD_Maybe'].map((n) => set.get(n) as CheckboxWidget) };
};
const states = (boxes: CheckboxWidget[]) => boxes.map((b) => `${b.look.state}${b.checked ? '+' : ''}`);

describe('RADIOSTRIP (R117.9)', () => {
  it('the first tick applies and checks the selection (0): that box ACTIVE (its ONACTIVATE runs) and checked (ONCHECK)', () => {
    const { set, boxes } = make(), h = new RecordingHost();
    expect(states(boxes)).toEqual(['NORMAL', 'NORMAL', 'NORMAL']);
    set.tick(0.016, h);
    expect(states(boxes)).toEqual(['ACTIVE+', 'NORMAL', 'NORMAL']);
    expect(h.take()).toEqual(['anim HDD_On_act', 'anim HDD_On_on']);
    set.tick(0.016, h);
    expect(h.take()).toEqual([]);                                     // once (the mark +0x444 cleared)
  });

  it('RIGHT and CROSS step forward, LEFT back, both wrapping; the old box unchecked (ONUNCHECK) before the new is checked', () => {
    const { set, s, boxes } = make(), h = new RecordingHost();
    set.tick(0.016, h); h.take();
    expect(s.input(widgetPad({ LEFT: 'FALLING' }), h)).toBe(true);    // 0 -> the last
    expect(s.selection).toBe(2);
    expect(states(boxes)).toEqual(['NORMAL', 'NORMAL', 'ACTIVE+']);
    expect(h.take()).toEqual(['anim HDD_Maybe_act', 'anim HDD_On_off(u)', 'anim HDD_Maybe_on', 'sound SELECTION']);
    expect(s.input(widgetPad({ RIGHT: 'FALLING' }), h)).toBe(true);   // the last -> 0
    expect(s.selection).toBe(0);
    expect(s.input(widgetPad({ CROSS: 'FALLING' }), h)).toBe(true);   // as RIGHT
    expect(s.selection).toBe(1);
    expect(states(boxes)).toEqual(['NORMAL', 'ACTIVE+', 'NORMAL']);
  });

  it('press edges only, no PRESSED, and the strip\'s own BUTTON bindings are never read', () => {
    const { set, s } = make(), h = new RecordingHost();
    set.tick(0.016, h); h.take();
    expect(s.input(widgetPad({ RIGHT: 'DOWN' }), h)).toBe(false);
    expect(s.input(widgetPad({ TRIANGLE: 'FALLING' }), h)).toBe(false);
    expect(s.look.state).toBe('NORMAL');
    expect(h.take()).toEqual([]);
  });

  it('Selection INDEX n (op 4, the u16 at +8): apply and check, no sound; an index past the last is ignored', () => {
    const { set, s, boxes } = make(), h = new RecordingHost();
    set.tick(0.016, h); h.take();
    expect(set.nodeCommand(nodeCmd('HDDOnOff', 4, '', 1), h)).toEqual({ answer: true });
    expect(s.selection).toBe(1);
    expect(states(boxes)).toEqual(['NORMAL', 'ACTIVE+', 'NORMAL']);
    expect(h.take()).toEqual(['anim HDD_Off_act', 'anim HDD_On_off(u)', 'anim HDD_Off_on']);
    set.nodeCommand(nodeCmd('HDDOnOff', 4, '', 3), h);
    expect(s.selection).toBe(1);
    expect(h.take()).toEqual([]);
  });

  it('the children follow the selection, not the focus: set-normal on the strip leaves its checked box ACTIVE', () => {
    const { set, s, boxes } = make(), h = new RecordingHost();
    set.tick(0.016, h);
    s.setActive(h); s.setNormal();
    expect(states(boxes)).toEqual(['ACTIVE+', 'NORMAL', 'NORMAL']);
  });
});

describe('CHECKBOX (R117.10)', () => {
  it('the check image at the node + CHECK_OFFSET, CHECK_SIZE, colour 255, alpha 100, drawn only while checked', () => {
    const { set, boxes } = make(), h = new RecordingHost();
    const check = (items: UiDrawItem[]) => items.filter((i) => i.kind === 'sprite' && i.texture === 'op_check.tif')
      .map((i) => (i.kind === 'sprite' ? [i.x0, i.y0, i.x1, i.y1, ...i.rgba] : []));
    expect(check(boxes[0]!.draw(208, 279, 1))).toEqual([]);
    set.tick(0.016, h);
    expect(check(boxes[0]!.draw(208, 279, 1))).toEqual([[215, 286, 240, 311, 255, 255, 255, 100]]);
  });

  it('alone, CROSS falling toggles it and starts ONCHECK / ONUNCHECK (FUN_00371680); nothing else is handled', () => {
    const { boxes } = make(), h = new RecordingHost();
    const b = boxes[1]!;
    expect(b.input(widgetPad({ CROSS: 'FALLING' }), h)).toBe(true);
    expect(b.checked).toBe(true);
    expect(b.input(widgetPad({ CROSS: 'FALLING' }), h)).toBe(true);
    expect(b.checked).toBe(false);
    expect(h.take()).toEqual(['anim HDD_Off_on', 'anim HDD_Off_off(u)']);
    expect(b.input(widgetPad({ RIGHT: 'FALLING' }), h)).toBe(false);
  });
});
