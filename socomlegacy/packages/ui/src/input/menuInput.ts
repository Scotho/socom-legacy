import type { DialogDesign, DialogRecord, DialogWidget } from '../dialog';
import { findNode, type UiNode, type UiScreen } from '../compositor/scene';
import type { UiCommandHandler, UiCommandHost } from '../uiCommands';
import { SlotPopup } from '../popup/slotPopup';
import type { DialogParts, DialogPartsHost } from '../screens/dialogParts';
import type { MenuQueue } from '../screens/menuQueue';
import type { MenuShell } from '../screens/menuShell';
import { INPUT_STRING } from '../screens/screenCommands';
import type { Widget } from '../widgets/host';
import { RadioStripWidget } from '../widgets/radioStrip';
import { SliderWidget } from '../widgets/slider';
import type { WidgetPad } from '../widgets/pad';
import { menuDispatch, type MenuDispatchResult } from './dispatch';
import { FocusRing, type RingControl } from './focusRing';
import { MenuPad, NO_PAD, type PadSlotName, type PadSnapshot } from './padStates';
import { MenuStick } from './stick';

/**
 * The menu input connected to the front end (PLAT-11; web research 116): the pad read at the menu state's tick step 2
 * (`CMenuState_Tick` 0x1f4640 -> `FUN_002d9e40` -> `FUN_002da930`) and flushed at its init (`FUN_001f4860` D:L54799 ->
 * `FUN_002d9e00`); the dispatch (`FUN_00368650`) as the dialog host's input (A1); the focus ring of each built dialog
 * (its load focus, D:L263735-263745, and `ActivateButton`'s record 6, `FUN_00366b60`); `SuspendMenuInput`'s row in
 * PLAT-08's table. The physical pad is the caller's `MenuInputSource` (the page's keyboard, pad and touch adapter,
 * `packages/viewer/src/menuInput.ts`).
 *
 * The held repeat is the widgets' (PLAT-15: `LISTBOX_HOLD_REPEAT`, `SLIDER_HOLD_REPEAT`, 0.4 s, their hold clocks
 * advanced by the A7 tick's clamped step); the framework has none (R116.6). ACCEL is the MAPCONTROL's `PAN`
 * (MENU-16's control, R116.12), not a menu repeat. NOSELECT and PADHOG are the list's (PLAT-15's `ListboxWidget`).
 *
 * Pure: no DOM, no viewer, no `tools/` (web sprint 6 package boundaries).
 */

/** PLAT-17's soft keyboard as the dispatch reaches it: its step 2 (`FUN_0038dc00`) and its taps (`SKB_TOUCH_READING`). */
export interface MenuSoftKeyboard { input(pad: WidgetPad): boolean; tap(x: number, y: number): 'key' | 'lost' | 'none' }

/** The physical pad, read once per menu frame. */
export interface MenuInputSource {
  read(): PadSnapshot;
  /** One key of the USB keyboard's queue (`FUN_002dbd90`), or null (PLAT-17's adapter). */
  usbKey?(): number | null;
}

/**
 * MENU_TICK_RATE_READING (research 116 §10): the front end ticks at 30 Hz, two NTSC fields a frame -- `DAT_003e1400` is
 * 30 in the ELF (the cap loop `FUN_003aff30` D:L304747; a movie's start sets 30, D:L207813) and dt is measured from
 * timer 0 (D:L304762-304764). PLAT-12's clock (`UI_TICK_SECONDS`, 100/2997 s) is the one that steps the dispatch: at
 * it the 0.4 s hold repeats first on the 12th tick after the press and then on every tick, and `SuspendMenuInput(0.15)`
 * skips 5 dispatches. [reading]
 */
export const MENU_TICK_RATE_READING = 30 as const;

/**
 * MENU_TOUCH_READING (research 116 §11; the owner's default 1): the PS2 had no pointer. A tap or a click on a control
 * of the ring steps the focus to it as `ActivateButton` does (the focused control deactivated, the tapped one
 * activated, `SELECTION`), then CROSS is pressed for one frame; a tap on the focused control is CROSS alone; a tap off
 * every control is CROSS alone. **While the popup shows** the controls are not hit-tested: a tap on one of its buttons'
 * bodies (where its draw places them, `SlotPopup.buttonRects`; a button with no width is none) answers that button --
 * on the unfocused one the popup's own LEFT / RIGHT step (`Popup.step`, D:L268528-268541: the answer, the buttons'
 * states, `SELECTION`), then CROSS one frame; on the focused one CROSS alone -- and a tap off both is CROSS alone, the
 * popup's focused answer (the player's report of 2026-11-02: AskToOverwrite's NO is button 1 and focused, so a click
 * on YES answered NO; research 118: 36 of the 58 two-button records are NO-first). A tap on a disabled control is
 * lost -- no step, no `SELECTION`, no CROSS -- as the pad cannot focus one (the ring steps past it, `FUN_003670d0`), and
 * a CROSS there would fall to the screen's binding (the disabled button takes no pad). The box is the control's body:
 * XSIZE x YSIZE from its node's place (centred on it with `HCENTERED`), a list's `IMAGE` size. Like a pad press, a tap
 * whose frame is suspended is lost. The ARMORY's `ARMORY_TOUCH_READING` is the precedent. [reading]
 * **A strip's box** (the merge controller's ruling of 2026-10-23 for CTL-1, a matter of taste on the product track: "a
 * click on a strip's box chooses that box"): a tap on a `RADIOSTRIP`'s subordinate steps to the strip as above, then
 * chooses that box (`RadioStripWidget.choose`: its `ONACTIVATE`, the check, `SELECTION`) with no CROSS -- so SEAL clicked
 * is SEAL, not one box on; on the chosen box, nothing; on a disabled strip, lost; on a parked strip (OT.R8) the step
 * alone, nothing chosen, as its pad is refused. The pad's CROSS on a strip still steps
 * one box forward (FUN_00370f60, the original's), and a tap on the strip's own body is step and CROSS as for any control.
 */
export const MENU_TOUCH_READING = 'step to the control, then CROSS one frame' as const;

/** The `SuspendMenuInput` row (`FUN_00277220`, id 187 in PLAT-08's table). */
export const SUSPEND_MENU_INPUT = 'SuspendMenuInput';

/**
 * DPTOFP_ROUNDING_READING: `dptofp` (`FUN_001a12d8`, the compiler's soft-float double-to-float, named by fingerprint in
 * `recomp/socom2_names.csv`) rounds to nearest, as the soft-float library does -- not the EE FPU's chop
 * (`EE_FPU_ROUNDING_READING`); its body was not read line by line. So `SuspendMenuInput 0.15` is the float nearest 0.15,
 * the value the compiler gives the literal. [reading]
 */
export const DPTOFP_ROUNDING_READING = 'to nearest' as const;

/** `atof` (`FUN_00191478` -> `FUN_0019a9b0(s, 0)`) then `dptofp`: the leading number of the text, else 0. */
export const atofF32 = (s: string): number => Math.fround(Number.parseFloat(s) || 0);

export interface MenuInputOptions {
  /** The front end (read when a hook runs: the machine is made after this object). */
  machine: () => { shell(): MenuShell | null; menu: { shell: MenuShell | null }; queue: MenuQueue };
  /** The dialogs' parts (PLAT-15's widgets, PLAT-16's popup). */
  parts: DialogPartsHost;
  /** `SELECTION` (`DAT_00408564`), PLAT-23's cue; absent: silent. */
  selection?: () => void;
}

/** A ring control with the widget made of its record (undefined: a type no widget is made of -- its +0x44 takes no pad here). */
interface MenuRingControl extends RingControl { readonly widget: Widget | undefined }

export class MenuInput {
  readonly pad = new MenuPad();
  readonly stick = new MenuStick();
  /** The page's adapter (none: a pad with nothing down). */
  source: MenuInputSource = { read: () => NO_PAD };
  /** PLAT-17's soft keyboard (`SoftKeyboardFrontEnd.connect`); null: none. */
  softKeyboard: MenuSoftKeyboard | null = null;
  /** The last dispatch's outcome. */
  last: MenuDispatchResult | 'suspended' = 'none';
  private ringFor: DialogParts | null = null;
  /** The host `register` was given: its control gates (`UiCommandHost.controlParked`). */
  private host: UiCommandHost | null = null;
  private ringNow: FocusRing | null = null;
  /** The menu state's G the pad was last flushed for. */
  private flushedFor: MenuShell | null = null;
  /** A tap waiting for the next read (`MENU_TOUCH_READING`): the control's name, or null for CROSS alone. */
  private tapPending: MenuTap | undefined;
  private pointerSlider: { name: string; screen: UiScreen } | null = null;
  private tapNow: MenuTap | undefined;

  constructor(private readonly o: MenuInputOptions) {}

  /** The current dialog's ring (made when the dialog built last changed; focused by `built`). */
  ring(): FocusRing | null {
    const parts = this.o.parts.current;
    if (!parts) return null;
    if (parts !== this.ringFor) {
      this.ringFor = parts;
      this.ringNow = new FocusRing(focusRingRecords(parts.dialog.design).map((r) => this.control(parts, r.name, r.widget)), () => this.o.selection?.());
    }
    return this.ringNow;
  }

  /**
   * A control as the ring drives it, from its record. Enabled is the element's bit (+0x48, 0x1fe270 for every class;
   * `WidgetSet.enabled`: what the class's creation left, `ENABLED_AT_BUILD`, or a record 7 / 8 wrote since), so an IMAGE
   * or a TEXT listed under `CONTROLS` is on the ring and passed over until a script enables it (research 116 §17).
   * Activate and deactivate are the widget's (+0x50 / +0x54; the base's are empty, 0x1fe290 / 0x1fe2a0). `spec`
   * undefined: a node no record made (`ActivateButton` finds any node).
   */
  private control(parts: DialogParts, name: string, spec: DialogWidget | undefined): MenuRingControl {
    const widget = spec ? parts.widgets.of(spec) : undefined;
    return {
      name, widget,
      enabled: () => spec !== undefined && parts.widgets.enabled(spec),
      activate: () => { widget?.setActive(parts.widgetHost); },
      deactivate: () => { widget?.setNormal(); },
    };
  }

  /** Build step D:L263735-263745 (after `ONSTART`, before the movie background): the new dialog's focus. */
  built = (): void => { this.ring()?.start(); };

  /** `MenuState`'s and `LoadState`'s tick step 2: the pad read, flushed first when the menu state's init ran since. */
  read = (): void => {
    this.tapNow = this.tapPending;
    this.tapPending = undefined;
    let snap = this.source.read();
    if (this.tapNow && this.tapNow.box === undefined && this.tapNow.position === undefined) snap = { ...snap, down: new Set<PadSlotName>([...snap.down, 'CROSS']) };   // a box's click presses nothing
    const g = this.o.machine().menu?.shell ?? null;
    if (g !== null && g !== this.flushedFor) {
      this.flushedFor = g;
      this.pad.flush(snap);
    }
    this.pad.read(snap);
  };

  /** The dialog host's A1 input: `FUN_00368650` over the dialog built now. */
  dispatch = (): void => {
    const shell = this.o.machine().shell(), parts = this.o.parts.current, ring = this.ring();
    const tap = this.tapNow;
    this.tapNow = undefined;
    if (!shell || !parts || !ring) { this.last = 'none'; return; }
    const popupShown = (): boolean => shell.popups.shown(shell.screen);
    const queue = this.o.machine().queue;
    if (tap?.popupSlot !== undefined && popupShown()) {                              // a popup's button: its own step, then CROSS
      const p = queue.popupObject;
      if (p instanceof SlotPopup && p.popup.answer !== tap.popupSlot) p.popup.step(this.o.parts.popupHost);
    }
    if (tap?.name && !popupShown() && ring.focused?.name !== tap.name) this.activate(tap.name);
    // A parked strip's box chooses nothing (OT.R8: drawn and inert, as its pad is refused below).
    if (tap?.name && tap.box !== undefined && !popupShown() && !this.host?.controlParked({ dialog: shell.currentName, control: tap.name })) {
      const strip = parts.widgets.get(tap.name);
      if (strip instanceof RadioStripWidget) strip.choose(tap.box, parts.widgetHost);
    }
    // Pointer adaptation: a slider uses its track position, never CROSS (which sliders do not handle).
    if (tap?.name && tap.position !== undefined && !popupShown() && !this.host?.controlParked({ dialog: shell.currentName, control: tap.name })) {
      const slider = parts.widgets.get(tap.name);
      if (slider instanceof SliderWidget) slider.seek(tap.position, parts.widgetHost);
    }
    this.last = menuDispatch(this.pad, this.stick, {
      popupShown,
      popup: (pad) => {
        const p = (queue.popupObject ??= shell.popups.make());                       // FUN_0027f190(FUN_00274930())
        if (p instanceof SlotPopup) p.input(pad, this.o.parts.popupHost);
      },
      focused: (pad) => {
        const c = ring.focused as MenuRingControl | null;
        if (c !== null && this.host?.controlParked({ dialog: shell.currentName, control: c.name })) return false;   // a parked control takes nothing
        return c !== null && (c.widget?.input(pad, parts.widgetHost, 0) ?? false);
      },
      bindings: parts.dialog.design.bindings,
      start: (anim, arg) => parts.widgetHost.animation(anim, arg),
      ring,
      softKeyboard: this.softKeyboard ? (pad) => this.softKeyboard!.input(pad) : undefined,
      usbKey: this.source.usbKey ? () => this.source.usbKey!() : undefined,
      event: (code) => { shell.event(code); },
    });
  };

  /** The queue's record 6 (`ActivateButton`, `FUN_00366b60`): the named control, found anywhere in the dialog. */
  activate = (name: string): void => {
    const parts = this.o.parts.current, ring = this.ring();
    if (!parts || !ring) return;
    const spec = parts.widgets.specOf(name);
    const found = spec !== undefined || findNode(parts.dialog.screen.root, name) ? this.control(parts, name, spec) : null;
    ring.activateNamed(name, found);
  };

  /**
   * `SuspendMenuInput` (`FUN_00277220` D:L122805-122823): the argument (`INPUT_STRING` replaced by the running
   * animation's first string input), `atof`, to float, written over the menu state's G+0x900 (`FUN_001f3bb0`
   * D:L54349-54358: MS's G only, when it exists). No argument: nothing (`INPUT_STRING_NULL_READING`). Answers 1.
   */
  suspendMenuInput: UiCommandHandler = (cmd) => {
    const m = this.o.machine();
    const a = cmd.arg === INPUT_STRING ? m.shell()?.inputString(cmd.anim) ?? null : cmd.arg === '' ? null : cmd.arg;
    if (a !== null) m.menu?.shell?.suspendInput(atofF32(a));
    return true;
  };

  /** The row's body in PLAT-08's host (W9.R4: the table is a registry). */
  register(host: UiCommandHost): void { this.host = host; host.setHandler(SUSPEND_MENU_INPUT, this.suspendMenuInput); }

  /** A tap at a frame point (640 x 448): `MENU_TOUCH_READING`. Answers the control it stepped to, or null. */
  tap(x: number, y: number): string | null {
    const skb = this.softKeyboard?.tap(x, y) ?? 'none';                                  // SKB_TOUCH_READING: a keyboard up takes it
    if (skb !== 'none') { if (skb === 'key') this.tapPending = { name: null }; return null; }
    const parts = this.o.parts.current, shell = this.o.machine().shell();
    let name: string | null = null, box: number | undefined, position: number | undefined;
    if (parts && shell && shell.popups.shown(shell.screen)) {
      const p = this.o.machine().queue.popupObject;
      const rects = p instanceof SlotPopup ? p.buttonRects(shell.screen) : [null, null];
      const on = (k: 0 | 1): boolean => { const r = rects[k]; return !!r && x >= r[0] && x < r[2] && y >= r[1] && y < r[3]; };
      const slot = on(1) ? 2 : on(0) ? 1 : undefined;
      this.tapPending = slot === undefined ? { name: null } : { name: null, popupSlot: slot };
      return null;
    }
    if (parts && shell) {
      const onBox = stripBoxAt(parts.dialog.design.controls, shell.screen, x, y);
      const onSlider = sliderAt(parts.dialog.design.controls, shell.screen, x, y);
      // Preset checkbox bodies overlap the first controller slider; the visible slider takes its track.
      if (onSlider) ({ name, position } = onSlider);
      else if (onBox) ({ name, box } = onBox);
      else name = controlAt(parts.dialog.design.controls, shell.screen, x, y);
    }
    const spec = name !== null && parts ? parts.widgets.specOf(name) : undefined;
    if (spec !== undefined && !parts!.widgets.enabled(spec)) return null;               // a disabled control: lost
    this.tapPending = { name, box, position };
    return name;
  }

  /** Browser pointer adaptation: capture only the slider that the press hit. */
  pointerDown(x: number, y: number): string | null {
    this.pointerUp();
    const name = this.tap(x, y);
    const shell = this.tapPending?.position !== undefined ? this.o.machine().shell() : null;
    if (name && shell) this.pointerSlider = { name, screen: shell.screen };
    return name;
  }

  pointerMove(x: number, _y: number): void {
    const drag = this.pointerSlider, shell = this.o.machine().shell(), parts = this.o.parts.current;
    if (!drag || !shell || !parts) return;
    if (shell.screen !== drag.screen || shell.popups.shown(shell.screen)) { this.pointerUp(); return; }
    const spec = parts.widgets.specOf(drag.name);
    const node = findNode(shell.screen.root, drag.name);
    if (!spec || !node || !parts.widgets.enabled(spec) || !placeOf(node).shown) { this.pointerUp(); return; }
    const record = parts.dialog.design.controls.find(r => r.name === drag.name);
    const track = record ? sliderTrack(record, shell.screen) : null;
    if (track) this.tapPending = { name: drag.name, position: (x - track.x) / track.width };
  }

  pointerUp(): void { this.pointerSlider = null; }
}

/**
 * The ring's records (`CGameMenu`+0x290): every `CONTROLS` entry in file order -- but a record hidden by an adaptation
 * (`DialogRecord.hidden`, CPS-4b: VIDEO OPTIONS' HELP WINDOWS), which stays built for the disc's scripts and is never
 * focused. A disc design has none, so its ring is the original's.
 */
export function focusRingRecords(design: Pick<DialogDesign, 'controls'>): DialogRecord[] {
  return design.controls.filter((r) => !r.hidden);
}

/** A node's place in the frame and whether every node up to the root is shown (`NODE_MATRIX_READING`'s translation). */
function placeOf(node: UiNode): { x: number; y: number; sx: number; sy: number; shown: boolean } {
  const chain: UiNode[] = [];
  for (let n: UiNode | null = node; n; n = n.parent) chain.unshift(n);
  let a = 1, d = 1, tx = 0, ty = 0, shown = true;
  for (const n of chain) {
    if (!n.visible) shown = false;
    tx += a * n.x; ty += d * n.y;
    a *= n.scale[0]; d *= n.scale[1];
  }
  return { x: tx, y: ty, sx: a, sy: d, shown };
}

/**
 * A tap waiting for its frame: the control's name (null: CROSS alone) and, on a strip's box, that box's index; on a
 * shown popup's button, that button's slot (1 or 2).
 */
interface MenuTap { name: string | null; box?: number; popupSlot?: 1 | 2; position?: number }

/** Browser pointer adaptation: the drawn track and knob, including the node hierarchy's scale. */
function sliderTrack(r: DialogRecord, screen: UiScreen) {
  if (r.widget.type !== 'SLIDERBAR') return null;
  const node = findNode(screen.root, r.name);
  if (!node) return null;
  const p = placeOf(node), w = r.widget;
  if (!p.shown || p.sx <= 0 || p.sy <= 0 || w.button.size[0] <= 0) return null;
  return { x: p.x, y: p.y, width: w.button.size[0] * p.sx,
    knobWidth: w.knobSize[0] * p.sx, height: Math.max(w.button.size[1], w.knobSize[1]) * p.sy };
}

function sliderAt(controls: readonly DialogRecord[], screen: UiScreen, x: number, y: number): { name: string; position: number } | null {
  let hit: { name: string; position: number } | null = null;
  for (const r of controls) {
    const t = sliderTrack(r, screen);
    if (t && x >= t.x - 0.5 && x <= t.x + t.width + t.knobWidth && y >= t.y && y < t.y + t.height) {
      hit = { name: r.name, position: (x - t.x) / t.width };
    }
  }
  return hit;
}

/**
 * The strip box a frame point is on (`MENU_TOUCH_READING`, its strip rule): each `RADIOSTRIP`'s subordinates, their
 * bodies as a control's (XSIZE x YSIZE from the node's place, centred with `HCENTERED`), shown ones only; the last in
 * file order winning. Null when none.
 */
export function stripBoxAt(controls: readonly DialogRecord[], screen: UiScreen, x: number, y: number): { name: string; box: number } | null {
  let hit: { name: string; box: number } | null = null;
  for (const r of controls) {
    if (r.widget.type !== 'RADIOSTRIP') continue;
    r.widget.subordinates.forEach((sub, i) => {
      const node = findNode(screen.root, sub.name);
      const w = sub.widget;
      if (!node || !('button' in w)) return;
      const p = placeOf(node);
      if (!p.shown) return;
      const [wd, ht] = w.button.size;
      const x0 = w.button.hcentered ? p.x - Math.trunc(wd / 2) : p.x;
      if (x >= x0 && x < x0 + wd && y >= p.y && y < p.y + ht) hit = { name: r.name, box: i };
    });
  }
  return hit;
}

/** The control a frame point is on (`MENU_TOUCH_READING`'s box), the last in file order winning; null when none. */
export function controlAt(controls: readonly DialogRecord[], screen: UiScreen, x: number, y: number): string | null {
  let hit: string | null = null;
  for (const r of controls) {
    const node = findNode(screen.root, r.name);
    if (!node) continue;
    const p = placeOf(node);
    if (!p.shown) continue;
    const w = r.widget;
    let x0: number, y0 = p.y, wd: number, ht: number;
    if (w.type === 'LISTBOX') { [wd, ht] = w.image.size; x0 = p.x; }
    else if ('button' in w) { [wd, ht] = w.button.size; x0 = w.button.hcentered ? p.x - Math.trunc(wd / 2) : p.x; }
    else continue;
    if (x >= x0 && x < x0 + wd && y >= y0 && y < y0 + ht) hit = r.name;
  }
  return hit;
}
