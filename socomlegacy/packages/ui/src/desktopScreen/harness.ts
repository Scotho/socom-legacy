import type { DialogDesign } from '../dialog';
import type { UiDrawItem } from '../compositor/drawList';
import { UI_TICK_SECONDS } from '../clock/uiClock';
import { MenuInput } from '../input/menuInput';
import type { PadSlotName } from '../input/padStates';
import type { MovieService } from '../movie/movieCommands';
import type { TextFace } from '../text/face';
import { UiCommandHost } from '../uiCommands';
import { UiVarManager } from '../uiVars';
import type { ZAnimRtSet, ZAnimTraceEvent } from '../zanimRuntime';
import { DialogPartsHost } from '../screens/dialogParts';
import { FrontEndMachine } from '../screens/frontEndMachine';
import { MenuCommands, type MenuCardIo } from '../screens/menuCommands';
import { PopupSlot } from '../screens/popupSlot';
import { DesktopScreen } from './desktopScreen';
import { DESKTOP_SCREEN_HOOKS, DesktopScreenHooks, bindersOf, boundAnimation, type DesktopScreenHook } from './hooks';

/**
 * PLAT-28's per-hook harness (web research 142 §4): given a hook -- a dialog, a control, a press -- it checks that the
 * desktop-recompilation screen appears at that press and that CONTINUE returns to the same row with every valve, UI
 * variable and card byte unchanged, and that nothing of the chain the original's press would start is dispatched.
 * Every task that wires a hook (MENU-03, MENU-08, ONL-02, OPT-17, BOOT-09) registers it and runs this; none builds its
 * own check.
 *
 * "Unchanged" is measured against a **twin**: two identical front ends (`desktopHookRig`, a seeded generator) are
 * walked to the hook's row the same way; one gets the press and CONTINUE, the other the same frames untouched. The
 * dialog's own scripts keep running under the notice -- `has_memcard_changed` polls the card every 1.5 s and writes
 * `mc_changed_slot`, `PulseArrows` loops -- so the state a hook must not change is what the untouched twin has after
 * the same frames, not a snapshot taken before the press. The state compared: every valve (name, type, value), every
 * UI variable, the card's whole content (the rig's `cardState`), M's queue and history, the career record, the dialog
 * built, the focused row, the `POPUP` node's place. The commands compared: every row the hooked front end
 * dispatched, by name, that the twin did not (none is the bar), and the hook's `replaces` and `chain` (none
 * dispatched, none started).
 *
 * Pure: no DOM, no viewer, no `tools/` (web sprint 6 package boundaries).
 */

/** What a hook must leave as it was. */
export interface DesktopHookState {
  dialog: string;
  focused: string | null;
  valves: string[];
  uiVars: string[];
  card: string;
  queue: string;
  careerStats: string;
  /**
   * The dialog's `POPUP` node's place, `x,y` ('' with no node): the record's on the node (`FUN_003157d0`,
   * D:L266844-266848), M's popup's to draw at, so the notice hands it back as it found it (POPUP-PLACE).
   */
  popupPlace: string;
}

/** A front end the harness drives (`desktopHookRig` builds one over a dialog source; a page may build its own). */
export interface DesktopHookRig {
  readonly screen: DesktopScreen;
  /** `n` UI ticks (PLAT-12's `UI_TICK_SECONDS`). */
  run(n?: number): void;
  /** One press: the button down for a tick, then up for a tick. */
  press(button: PadSlotName): void;
  /** The control the menu's focus is on, or null. */
  focused(): string | null;
  state(): DesktopHookState;
  /** The bound functions dispatched and the animations started since the last call (each once per occurrence). */
  take(): { dispatched: string[]; started: string[] };
  /** The last tick's draw list. */
  last(): UiDrawItem[];
  /** The dialog design built now (its controls are the walk's targets). */
  design(): DialogDesign | null;
  /** A control's widget on the dialog built now (PLAT-15's), or null: what a list follows, not what the manager holds. */
  widget(name: string): unknown;
}

export interface DesktopHookRigOptions {
  /** A dialog by name (the disc's `dialogLookup`, or a test's designs). */
  dialog: (name: string) => DialogDesign | null;
  /** `run/uizanim.zar`'s sets. */
  sets: readonly ZAnimRtSet[];
  startDialog: string;
  /** MENU-01a's card (`MenuCardIo`); absent: every port empty. */
  card?: MenuCardIo;
  /** The card's whole content, serialised, for the diff (absent: ''). */
  cardState?: () => string;
  face?: (name: string) => TextFace | null;
  locText?: (id: number) => string | null;
  /** The hooks the rig's screen holds (default: `DESKTOP_SCREEN_HOOKS`); `null` makes a rig with no gate (the control). */
  hooks?: DesktopScreenHooks | null;
  /**
   * The UI variables MENU-01a's rows and the dialog's widgets share (absent: the rig's own). A task whose rows write
   * variables the dialog's lists follow (ONL-01's `NETCNF_DB`) hands its manager in and registers its rows over it.
   */
  uiVars?: UiVarManager;
  /**
   * Rows a later task registers in the host (another module's bodies: `host.setHandler(name, body)`), called after
   * MENU-01a's rows are in, so a later body replaces theirs; `machine` reaches the rig's front end (valves, queue);
   * `uiVars` is the manager the rig's rows and widgets share (the option's, else the rig's own).
   */
  register?: (host: UiCommandHost, machine: () => FrontEndMachine, uiVars: UiVarManager) => void;
}

/** The front end as the page connects it, without the page: PLAT-10/11/15/16, MENU-01a's rows, PLAT-28's screen. */
export function desktopHookRig(o: DesktopHookRigOptions): DesktopHookRig {
  let m!: FrontEndMachine;
  let seed = 1;
  const random = (): number => { seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff; return seed; };
  const uiVars = o.uiVars ?? new UiVarManager();
  const parts = new DialogPartsHost({ popupObject: () => m.queue.popupObject, face: o.face, locText: o.locText, uiVars });
  const host = new UiCommandHost({ node: parts.nodeCommand });
  const dispatched: string[] = [], started: string[] = [];
  const dispatch = host.dispatch.bind(host);
  host.dispatch = (cmd, time) => {
    const out = dispatch(cmd, time);
    if (out.kind === 'table' || out.kind === 'not-implemented') dispatched.push(out.row.name);
    return out;
  };
  const input = new MenuInput({ machine: () => m, parts });
  input.register(host);
  const held = new Set<PadSlotName>();
  input.source = { read: () => ({ down: new Set(held), stickX: 0, stickY: 0 }) };
  const commands = new MenuCommands({
    valves: () => m.valves, uiVars, inputString: (cmd) => m.shell()?.inputString(cmd.anim) ?? null,
    event: (kind) => { m.shell()?.event(kind); }, card: o.card,
  });
  commands.register(host);
  o.register?.(host, () => m, uiVars);
  const screen = new DesktopScreen({ machine: () => m, hooks: o.hooks ?? undefined });
  if (o.hooks !== null) screen.register(host);
  const slot = new PopupSlot();
  slot.connect(parts.makePopup);
  const movie = {
    service: { background: { on: () => true, off: () => true }, play: () => {} } as unknown as MovieService,
    frame: () => 'menu' as const, unload: () => {}, load: () => input.built(),
  };
  const trace = (e: ZAnimTraceEvent): void => { if (e.kind === 'start') started.push(e.anim); };
  m = new FrontEndMachine({
    dialog: o.dialog, sets: o.sets, random, host, popups: slot, startDialog: o.startDialog, trace,
    built: parts.built, draw: parts.draw, widgetsTick: parts.widgetsTick, setEnabled: parts.setEnabled,
    input: input.dispatch, pad: input.read, activate: input.activate, movie,
  });
  m.boot();
  let last: UiDrawItem[] = [];
  const run = (n = 1): void => { for (let i = 0; i < n; i++) last = m.frame(UI_TICK_SECONDS); };
  const valveLine = (v: { name: string; type: number; value: number }): string => `${v.name}:${v.type}=${v.value}`;
  return {
    screen,
    run,
    press: (b) => { held.add(b); run(); held.delete(b); run(); },
    focused: () => input.ring()?.focused?.name ?? null,
    state: () => ({
      dialog: m.shell()?.currentName ?? '',
      focused: input.ring()?.focused?.name ?? null,
      valves: m.valves.all().map(valveLine).sort(),
      uiVars: uiVars.all().map((v) => `${v.name}=${JSON.stringify(v.value)}`).sort(),
      card: o.cardState?.() ?? '',
      queue: JSON.stringify({ records: m.queue.records, count: m.queue.count, top: m.queue.top, history: m.queue.history }),
      careerStats: commands.careerStats.join(','),
      popupPlace: ((n) => (n ? `${n.x},${n.y}` : ''))(m.shell()?.screen.popup ?? null),
    }),
    take: () => ({ dispatched: dispatched.splice(0), started: started.splice(0) }),
    last: () => last,
    design: () => parts.current?.dialog.design ?? null,
    widget: (name) => parts.current?.widgets.get(name) ?? null,
  };
}

/** The ticks the harness waits: before the walk (the boot, ONSTART), between presses, and after CONTINUE. */
export interface DesktopHookTiming {
  /** From the boot to the walk (default 90: 3 s, the main menu's `SetMenuValve` and first card polls). */
  settle?: number;
  /** Between two steps of the walk (default 8: past `OnMenuBtnDown`'s 0.15-s suspend). */
  step?: number;
  /** The notice shown before CONTINUE (default 15). */
  hold?: number;
  /** After CONTINUE (default 15). */
  after?: number;
}

export interface DesktopHookCheck {
  hook: DesktopScreenHook;
  /** The animation the design's binding starts at the hook's press (null: the control or the binding is missing). */
  bound: string | null;
  /** The row was reached by the walk (DOWN presses, as the player would). */
  reached: boolean;
  /** The screen was up after the press, for this hook, drawn in the `POPUP` node with the template's panel. */
  shown: boolean;
  drawn: boolean;
  /** CONTINUE closed it. */
  closed: boolean;
  before: DesktopHookState;
  after: DesktopHookState;
  twin: DesktopHookState;
  /** The state's parts that differ from the twin's. */
  changed: (keyof DesktopHookState)[];
  /**
   * The design's other bindings of the hooked animation (`bindersOf`, the hook's own aside): each would open the screen
   * too, since a hook is per (dialog, animation). None is the bar.
   */
  shared: string[];
  /** The hook's `replaces` and `chain` names dispatched or started by the press (none is the bar). */
  chain: string[];
  /** Rows the hooked front end dispatched that the twin did not, by name (none is the bar). */
  extra: string[];
  /** Every failed condition, in words; empty: the acceptance met. */
  failures: string[];
}

const minus = (a: readonly string[], b: readonly string[]): string[] => {
  const left = [...b];
  const out: string[] = [];
  for (const x of a) { const i = left.indexOf(x); if (i >= 0) left.splice(i, 1); else out.push(x); }
  return out;
};

/**
 * PLAT-28's acceptance for one hook (the block's "per-hook test harness"): two rigs from `make`, walked to the hook's
 * row by DOWN presses; on one, the press and later CONTINUE (CROSS); the other untouched for the same ticks.
 */
export function checkDesktopHook(make: () => DesktopHookRig, hook: DesktopScreenHook, t: DesktopHookTiming = {}): DesktopHookCheck {
  const settle = t.settle ?? 90, step = t.step ?? 8, hold = t.hold ?? 15, after = t.after ?? 15;
  const a = make(), b = make();
  const failures: string[] = [];
  const both = (f: (r: DesktopHookRig) => void): void => { f(a); f(b); };
  both((r) => r.run(settle));
  const design = a.design();
  const bound = design ? boundAnimation(design, hook.control, hook.press) : null;
  if (bound === null) failures.push(`${hook.dialog} has no ${hook.press} binding on ${hook.control}`);
  else if (bound.toLowerCase() !== hook.replaces.toLowerCase()) failures.push(`${hook.control} ${hook.press} starts ${bound}, not ${hook.replaces}`);
  const own = `${hook.control} BUTTON ${hook.press}`.toLowerCase();
  const shared = design && bound !== null ? bindersOf(design, bound).filter((x) => x.toLowerCase() !== own) : [];
  for (const x of shared) failures.push(`${bound} is also bound on ${x}: a hook is per (dialog, animation), so that start opens the screen too`);
  // The walk: DOWN until the row has the focus, as the player reaches it (each press past the button's DOWN binding).
  const limit = 2 * (design?.controls.length ?? 0) + 2;
  for (let i = 0; i < limit && a.focused() !== hook.control; i++) both((r) => { r.press('DOWN'); r.run(step); });
  const reached = a.focused() === hook.control && b.focused() === hook.control;
  if (!reached) failures.push(`the walk did not reach ${hook.control} (focus ${a.focused()})`);
  both((r) => { r.run(step); r.take(); });
  const before = a.state();
  a.press(hook.press as PadSlotName); b.run(2);
  const up = a.screen.current;
  const shown = up !== null && up.dialog === hook.dialog && up.control === hook.control && up.press === hook.press;
  const drawn = a.last().some((d) => d.kind === 'sprite' && d.node === 'POPUP' && d.texture === 'popupOp.tif');
  if (!shown) failures.push(`the screen is not up after ${hook.press} on ${hook.control}`);
  if (!drawn) failures.push('the notice is not drawn in the POPUP node');
  both((r) => r.run(hold));
  a.press('CROSS'); b.run(2);
  const closed = a.screen.current === null;
  if (!closed) failures.push('CONTINUE did not close the screen');
  both((r) => r.run(after));
  const ta = a.take(), tb = b.take();
  const afterState = a.state(), twin = b.state();
  const changed = (Object.keys(afterState) as (keyof DesktopHookState)[])
    .filter((k) => JSON.stringify(afterState[k]) !== JSON.stringify(twin[k]));
  for (const k of changed) failures.push(`${k} differs from the untouched twin`);
  if (afterState.dialog !== hook.dialog) failures.push(`the dialog is ${afterState.dialog}, not ${hook.dialog}`);
  if (afterState.focused !== hook.control) failures.push(`the focus is on ${afterState.focused}, not ${hook.control}`);
  const names = [hook.replaces, ...(hook.chain ?? [])].map((n) => n.toLowerCase());
  const chain = [...ta.dispatched, ...ta.started].filter((n) => names.includes(n.toLowerCase()));
  for (const n of chain) failures.push(`${n} was dispatched`);
  const extra = minus(ta.dispatched, tb.dispatched);
  for (const n of extra) failures.push(`${n} was dispatched beside the twin's rows`);
  return { hook, bound, reached, shown, drawn, closed, before, after: afterState, twin, changed, shared, chain, extra, failures };
}

/** `checkDesktopHook` for every hook of the list (default: the page's, `DESKTOP_SCREEN_HOOKS`). */
export function checkDesktopHooks(make: () => DesktopHookRig, hooks: readonly DesktopScreenHook[] = DESKTOP_SCREEN_HOOKS, t?: DesktopHookTiming): DesktopHookCheck[] {
  return hooks.map((h) => checkDesktopHook(make, h, t));
}
