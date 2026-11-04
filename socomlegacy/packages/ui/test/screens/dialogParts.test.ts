import { describe, expect, it, vi } from 'vitest';
import type { DialogDesign } from '../../src/dialog';
import type { UiDrawItem } from '../../src/compositor/drawList';
import { UiCommandHost } from '../../src/uiCommands';
import type { ZAnimRtSet, ZAnimUiCommand } from '../../src/zanimRuntime';
import { Popup } from '../../src/popup/popup';
import { SlotPopup } from '../../src/popup/slotPopup';
import { widgetPad } from '../../src/widgets/pad';
import { DialogPartsHost } from '../../src/screens/dialogParts';
import { FrontEndMachine } from '../../src/screens/frontEndMachine';
import { PopupSlot } from '../../src/screens/popupSlot';
import { ButtonWidget } from '../../src/widgets/button';
import { textFace } from '../text/fixtures';
import { design as widgetDesign, nodeCmd, r, rec } from '../widgets/fixtures';
import { animation, popupRecord, uiFn } from './zanimAsm';

/**
 * Sprint 9's connecting lines (S9-WIRE; the plan's W9.R4 and "Where two tasks meet"): PLAT-16's popup component in
 * PLAT-10's overlay slot. The popup object M+0xe40 is made at each dialog build (`FUN_0027f190` D:L126907-126934),
 * hung hidden as the node `POPUP` after MENUFADER (D:L263666-263688); a `ui::UI_COMMAND` on `POPUP` is its record
 * (`FUN_0036da20`, through the node's object, `FUN_002745a0` D:L121370-121385); `PopUpDialog` shows the node
 * (`FUN_0027eff0` D:L126884-126903), `KillPopUp` hides it (`FUN_0027d190` D:L125846-125859); the foreplane's walk draws
 * it last (`FUN_00369170`). Synthetic dialogs and animations; nothing measured on the original running.
 */

const NAMES = ['NA', 'PopUpDialog', 'KillPopUp', 'popupOp.tif', 'Are you sure?', 'ANSWER'];
const show = animation('show', NAMES, ['POPUP'], [
  popupRecord(NAMES, 1, { text: 'Are you sure?', panel: 'popupOp.tif', x: 150, y: 180, w: 340, h: 130, valve: 'ANSWER', w1: 50 }),
  uiFn(NAMES, 'PopUpDialog'),
]);
const SETS: ZAnimRtSet[] = [{ name: 'test.rdr', anims: [show] }];
const design = (): DialogDesign => ({
  libraries: [], usesMemcard: false, font: null, fontLib: true, background: null,
  bindings: [{ kind: 'event', name: 'ONSTART', code: 0, state: 1, animation: 'show', argument: null }],
  controls: [], objects: [], scripts: ['test.rdr'], models: [], dropped: [],
});

/** The front end as the page connects it, without the page: the parts' host on the machine's hooks. */
function rig(dialog: () => DialogDesign = design) {
  const slot = new PopupSlot();
  let m!: FrontEndMachine;
  const sounds: string[] = [];
  const face = textFace();
  const parts = new DialogPartsHost({ popupObject: () => m.queue.popupObject, face: () => face, sound: (n) => sounds.push(n) });
  const host = new UiCommandHost({ node: parts.nodeCommand });
  slot.connect(parts.makePopup);
  m = new FrontEndMachine({
    dialog: (n) => (n === 'dlgMenu.rdr' ? dialog() : null), sets: SETS, host, popups: slot, startDialog: 'dlgMenu.rdr',
    built: parts.built, draw: parts.draw, widgetsTick: parts.widgetsTick, setEnabled: parts.setEnabled,
  });
  m.boot();
  let last: UiDrawItem[] = [];
  const run = (n: number): UiDrawItem[] => { for (let i = 0; i < n; i++) last = m.frame(1 / 60); return last; };
  return { m, host, parts, run, sounds };
}
const cmd = (fn: string, arg = 'NA'): ZAnimUiCommand =>
  ({ anim: 'show', sequence: 'main', nodeIndex: 0, node: null, opcodeByte: 0, fn, arg, loc: 0, bytes: new Uint8Array(0x10) });
const popupItems = (items: UiDrawItem[]): UiDrawItem[] => items.filter((i) => 'node' in i && i.node === 'POPUP');

describe('PLAT-16\'s popup in PLAT-10\'s overlay slot', () => {
  it('each build makes PLAT-16\'s component, attached to the dialog\'s POPUP node, hidden', () => {
    const { m, run } = rig();
    run(2);
    const shell = m.shell()!;
    const object = m.queue.popupObject;
    expect(object).toBeInstanceOf(SlotPopup);
    expect((object as SlotPopup).node).toBe(shell.screen.popup);
    expect((object as SlotPopup).popup).toBeInstanceOf(Popup);
  });

  it('the dialog\'s script fills the record on POPUP and PopUpDialog shows it, drawn last over MENUFADER; KillPopUp removes it', () => {
    const { m, host, run } = rig();
    const items = run(4);
    const shown = popupItems(items);
    expect(shown.length).toBeGreaterThan(0);
    // The panel at the record's place (150, 180), 340 x 130, textured with its bitmap; button 1 under it (a valve).
    expect(shown[0]).toMatchObject({ kind: 'sprite', texture: 'popupOp.tif', x0: 150, y0: 180, x1: 490, y1: 310 });
    // Drawn after everything else: the foreplane's last node, after MENUFADER.
    const fader = items.findIndex((i) => 'node' in i && i.node === 'MENUFADER');
    expect(fader).toBeGreaterThanOrEqual(0);
    expect(items.indexOf(shown[0]!)).toBeGreaterThan(fader);
    expect(items.slice(items.indexOf(shown[0]!)).every((i) => 'node' in i && i.node === 'POPUP')).toBe(true);
    expect(m.shell()!.screen.popup!.x).toBe(150);                 // the record places the node (FUN_003157d0)
    expect(host.dispatch(cmd('KillPopUp'))).toMatchObject({ kind: 'table', answer: true });
    expect(popupItems(run(1))).toEqual([]);
    expect(m.shell()!.screen.popup!.visible).toBe(false);
  });

  it('a record on POPUP is taken by the node\'s object (no table row reached); without a popup object it falls to the table', () => {
    const { m, host, run } = rig();
    run(2);
    const rec: ZAnimUiCommand = { ...cmd('NA'), node: 'POPUP', nodeIndex: 1, opcodeByte: 0xe8, bytes: popupRecord(NAMES, 1, { text: 'Are you sure?', panel: 'popupOp.tif', x: 1, y: 2, w: 3, h: 4 }) };
    expect(host.dispatch(rec)).toEqual({ kind: 'node', answer: true });
    m.queue.popupObject = null;
    expect(host.dispatch(rec).kind).not.toBe('node');
  });
});

describe('SlotPopup', () => {
  it('draws at the node\'s place and the walk\'s opacity; nothing when the node or a plane above it is hidden', () => {
    const { m, run } = rig();
    run(4);
    const shell = m.shell()!;
    const p = m.queue.popupObject as SlotPopup;
    shell.screen.popup!.x = 20;                                   // a script moves the node: the node's place is the popup's
    shell.screen.foreplane.opacity = 0.5;
    const items = p.drawIn(shell.screen);
    expect(items[0]).toMatchObject({ kind: 'sprite', x0: 20, y0: 180 });
    expect((items[0] as Extract<UiDrawItem, { kind: 'sprite' }>).rgba[3]).toBe(64);   // FUN_0036d8b0: 0.5 x 128
    shell.screen.foreplane.visible = false;
    expect(p.drawIn(shell.screen)).toEqual([]);
    shell.screen.foreplane.visible = true;
    shell.screen.popup!.visible = false;
    expect(p.drawIn(shell.screen)).toEqual([]);
  });

  it('the input (the head of FUN_00368650, for PLAT-11): CROSS answers into the valve and hides the node itself', () => {
    const { m, run } = rig();
    run(4);
    const p = m.queue.popupObject as SlotPopup;
    const sounds: string[] = [];
    expect(p.input(widgetPad({ CROSS: 'FALLING' }), { sound: (n) => sounds.push(n) })).toBe(true);
    expect(m.valves.find('ANSWER')?.value).toBe(1);
    expect(m.shell()!.screen.popup!.visible).toBe(false);
    expect(sounds).toEqual(['SELECTION']);
    expect(p.input(widgetPad({ CROSS: 'FALLING' }), { sound: () => {} })).toBe(false);   // hidden: the menu's own input
  });
});

/** A dialog with PLAT-15's widgets: a BUTTON whose ONACTIVATE starts `show`, and a TEXT object. */
const withWidgets = (): DialogDesign => ({
  ...widgetDesign([rec('b', 'BUTTON', 256, 330, r(
    'XSIZE', '256', 'YSIZE', '30', 'XOFFSET', '55', 'YOFFSET', '22', 'SCALE', '0.6', 'CAPTION', 'AB',
    'NORMAL', [r('IMAGE', 'n.tif', 'TEXT_COLOR', ['30', '30', '50'], 'SCALE', '0.6')],
    'ACTIVE', [r('IMAGE', 'a.tif', 'TEXT_COLOR', ['12', '68', '78'], 'SCALE', '0.75')],
    'DISABLED', [r('IMAGE', 'd.tif', 'TEXT_COLOR', ['15', '30', '45'], 'SCALE', '0.6')],
    'ANIMATIONS', [r('EVENT', 'ONACTIVATE', 'ANIMATION', 'show')],
  ))], [rec('msg', 'TEXT', 40, 60, r('CAPTION', 'A'))]),
  bindings: [], scripts: ['test.rdr'],
});

describe("PLAT-15's widgets drawn, ticked and commanded where PLAT-10's entry builds and draws a dialog", () => {
  it("the dialog's draw list holds the widgets' quads and glyphs in their items' places: no widget item is left", () => {
    const { m, run } = rig(withWidgets);
    const items = run(2);
    expect(m.shell()!.design!.controls).toHaveLength(1);
    expect(items.filter((i) => i.kind === 'widget')).toEqual([]);
    const body = items.find((i) => i.kind === 'sprite' && i.node === 'b');
    expect(body).toMatchObject({ texture: 'n.tif', x0: 256, y0: 330 });                // the NORMAL state's body
    expect(items.some((i) => i.kind === 'glyphs' && i.node === 'b')).toBe(true);       // its caption, in the face
    const b = items.indexOf(body!), models = items.findIndex((i) => i.kind === 'models');
    expect(b).toBeLessThan(models);                                                    // the backplane, before the 3D pass
  });

  it("A7 ticks the widget set with the clamped step; a node command reaches the named widget (FUN_002745a0's node first)", () => {
    const { m, host, parts, run } = rig(withWidgets);
    run(2);
    const set = parts.of(m.shell()!.screen)!.widgets;
    const tick = vi.spyOn(set, 'tick');
    run(1);
    expect(tick).toHaveBeenCalledTimes(1);
    expect(host.dispatch(nodeCmd('msg', 1, 'AB'))).toEqual({ kind: 'node', answer: true });   // Caption by name
    expect(host.dispatch(nodeCmd('nobody', 1, 'AB')).kind).not.toBe('node');
  });

  it("the widget host starts the dialog's animations, plays SELECTION and TELETYPE, fires the screen's events", () => {
    const { m, parts, run, sounds } = rig(withWidgets);
    run(2);
    const p = parts.of(m.shell()!.screen)!;
    (p.widgets.get('b') as ButtonWidget).setActive(p.widgetHost);                     // ONACTIVATE -> show
    expect(p.dialog.scripts!.runtime.isRunning('show')).toBe(true);
    expect(p.widgetHost.hasAnimation('show')).toBe(true);
    expect(p.widgetHost.hasAnimation('nothing')).toBe(false);
    p.widgetHost.sound('SELECTION');
    p.widgetHost.sound('TELETYPE');
    expect(sounds).toEqual(['SELECTION', 'TELETYPE']);
  });

  it("DisableButton and EnableButton (record types 8, 7) reach the control's +0x4c", () => {
    const { m, host, parts, run } = rig(withWidgets);
    run(2);
    const b = parts.of(m.shell()!.screen)!.widgets.get('b') as ButtonWidget;
    host.dispatch(cmd('DisableButton', 'b'));
    run(1);
    expect(b.enabled).toBe(false);
    host.dispatch(cmd('EnableButton', 'b'));
    run(1);
    expect(b.enabled).toBe(true);
  });
});
