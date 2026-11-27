import {
  DIALOG_BUTTON_STATES, DIALOG_BUTTONS, type DialogBinding, type DialogDesign, type DialogRecord, type DialogWidget, type UiBindingGate,
} from '@s2u/ui';
import { PAD_GLYPH } from '@s2u/scene';
import { SCORE_LAYOUT } from './scoreboard';
import { startMenuLauncher } from './startMenuLauncher';

/**
 * **WM-6A: the native settings screens' ADVANCED entry -- a browser adaptation, no original** (product track; the owner's
 * approved look 6A and his words, "a new button in all of the original settings pages that have an equivalent launcher
 * settings page", MISSION OT.R131; the main controller's rulings of 2026-11-15). It changes nothing the game does: an
 * added entry opens the launcher overlay (`./modern/overlay`, through `./startMenuLauncher`) at Settings on the screen's
 * matching tab (`SETTINGS_ADVANCED_TABS`).
 *
 * - **Where.** OPTIONS (`dlgOptions_Menu.rdr`), VIDEO OPTIONS (`dlgOptions_Video.rdr`), AUDIO OPTIONS
 *   (`dlgOptions_Audio.rdr`), CONTROLLER PRESETS (`dlgControllerPresets.rdr`), passed through the front end's dialog
 *   lookup (`settingsAdvancedLookup`), as `@s2u/ui` `videoSettingsRows.ts` adds VIDEO's own rows (CPS-4b): the disc's
 *   records cloned with a literal caption in the disc's font, no disc script behind them.
 * - **The look** (the approved mock, `origin/agent/spc-mega-mock` `megaMockSettings.ts`, commits 310f5d7cfd, a1587ecb85,
 *   dd7e28a2a5, eda9540dcc; the ruling: "an added entry never moves, squeezes or covers anything the disc's own screen
 *   draws"): the disc's rows never move. OPTIONS gets a **row** -- its RETURN (`SaveAndLeaveBtn`) cloned, captioned
 *   "ADVANCED", in the free 30 px slot above RETURN (RETURN's height is the disc's pitch). VIDEO and AUDIO get a
 *   **prompt** in the prompt line (`eq_Lower_back`, y 403..435): the screen's own prompt text cloned, "<SQUARE>
 *   ADVANCED", left at the checkbox column's x (225, 217) less the pen's `inkOffset`; CONTROLLER PRESETS the same prompt
 *   centred in the line's free run (284..464). The added text is green -- the scoreboard's left-column green
 *   (`./scoreboard` `SCORE_LAYOUT.left.headerRgb`, the mock's `green` colouring) -- and the glyph is always the disc's
 *   SQUARE (`@s2u/scene` `PAD_GLYPH.SQUARE`), whatever the controller-labels setting.
 * - **The keys.** CROSS on the OPTIONS row (RETURN's own CROSS binding, its animation and argument replaced); SQUARE on
 *   the other three, a SCREEN binding added after the disc's. A reading of the disc's data (`npx tsx
 *   tools/dump-dialogs.ts --dialog <name>`; the binding fields BUTTON / EVENT + ANIMATION + ARGUMENT + STATE,
 *   `tools/dialogInventory.ts`, `@s2u/ui` `dialog.ts` `DialogLoader.binding`; SQUARE is pad code 8, `DIALOG_BUTTONS`):
 *   SQUARE is bound on none of the three -- VIDEO binds SCREEN TRIANGLE and CROSS on ScreenAdjustBtn / Default /
 *   SaveAndLeaveBtn; AUDIO SCREEN TRIANGLE and CROSS on Default / SaveAndLeaveBtn; CONTROLLER PRESETS SCREEN TRIANGLE,
 *   SCREEN UP / DOWN -> NULL and LEFT / RIGHT / CROSS on Preset1Btn..Preset4Btn; no screen has a global SQUARE handler.
 *   Both bindings name `SETTINGS_ADVANCED_ANIMATION` (no disc set holds it) with the tab as argument; a binding gate
 *   (`settingsAdvancedGate`, `UiCommandHost.setBindingGate`; the screen's scripts ask it before a start,
 *   `@s2u/ui` `screenScripts`' `startBinding`) takes the start.
 * - **Only where a launcher is offered** (a green prompt that does nothing is not shipped): the lookup's caller says
 *   when (`offered`, default not offered). The front end's (`settingsAdvancedFrontEndOffered`): a document whose front
 *   end has registered (`settingsAdvancedFrontEnd`) and that offers a launcher -- so the front end page's menus and its
 *   round's START > SETTINGS draw it; `/testroom` and the forge (no front end) never do.
 * - **The mouse.** A click off every control is lost (`@s2u/ui` `MenuInput.tap`, B-21); a tap inside the prompt's box
 *   (`settingsAdvancedPromptAt`) presses SQUARE instead (`./menuInput` `attachMenuPointer`). The OPTIONS row is a control:
 *   a tap on it is the ring's step and CROSS, as any row's.
 */
export const SETTINGS_ADVANCED_ADAPTATION = 'WM-6A, a browser adaptation: an ADVANCED entry on OPTIONS, VIDEO, AUDIO and CONTROLLER PRESETS opens the launcher at the matching tab' as const;

/** The screens, by the disc's dialog names. */
export const SETTINGS_ADVANCED_DIALOGS = {
  options: 'dlgOptions_Menu.rdr', video: 'dlgOptions_Video.rdr', audio: 'dlgOptions_Audio.rdr', controller: 'dlgControllerPresets.rdr',
} as const;
export type SettingsAdvancedScreen = keyof typeof SETTINGS_ADVANCED_DIALOGS;
type PromptScreen = Exclude<SettingsAdvancedScreen, 'options'>;

/**
 * Each screen's launcher tab (`./console/adapters/options` `optionsAdapter`'s groups: `display`, `audio`, `controller`).
 * OPTIONS opens the first tab, Display.
 */
export const SETTINGS_ADVANCED_TABS = { options: 'display', video: 'display', audio: 'audio', controller: 'controller' } as const satisfies Record<SettingsAdvancedScreen, string>;
export type SettingsAdvancedTab = (typeof SETTINGS_ADVANCED_TABS)[SettingsAdvancedScreen];
const TABS: readonly string[] = [...new Set(Object.values(SETTINGS_ADVANCED_TABS))];
const isTab = (t: string | null): t is SettingsAdvancedTab => t !== null && TABS.includes(t);

/** The entry's caption (the owner, 2026-11-15: "just use "ADVANCED" though everywhere"). */
export const SETTINGS_ADVANCED_TEXT = 'ADVANCED' as const;
/** The OPTIONS row's name (no disc script knows it). */
export const SETTINGS_ADVANCED_ROW = 'S2uAdvancedBtn' as const;
/** The bindings' animation: a name no disc set holds, taken by `settingsAdvancedGate`. */
export const SETTINGS_ADVANCED_ANIMATION = 's2u_settings_advanced' as const;
/** The gate's name in a host (`UiCommandHost.setBindingGate`). */
export const SETTINGS_ADVANCED_GATE = 'WM-6A settings advanced' as const;
/** The added text's colour: the scoreboard's left-column green (the mock's `green` colouring). */
export const SETTINGS_ADVANCED_GREEN: readonly [number, number, number] = SCORE_LAYOUT.left.headerRgb;
/** The disc's SQUARE glyph as a caption carries it (`PAD_GLYPH.SQUARE`, `font_special_01`). */
export const SETTINGS_ADVANCED_GLYPH = String.fromCharCode(PAD_GLYPH.SQUARE);

/**
 * The prompt's placement, as the approved mock measured it on the port's own frames (product track, no game value): TEXT
 * at y 430, the disc's prompts' own (`InfoTextT`, `DescriptionTextLow`); the band y 405..435 on the bar `eq_Lower_back`
 * (y 403..435) -- from 405, where CONTROLLER PRESETS' pictures end (`ContPic1`..`ContPic4`, y 115..405), so the box meets
 * none of them (the mock's measured ink band began at 404).
 * - VIDEO (`left`): the glyph's ink starts at the checkbox column's left x, 225 (the bottom bar's segment right of RETURN
 *   from x 185, the checkbox's window too: 40 px of padding in both); TRIANGLE BACK's ink starts at x 480.
 * - AUDIO (`left`): STEREO's checkbox, x 217; its prompts' ink from x 475.
 * - CONTROLLER PRESETS (`centre`): "View Controller Presets with <d-pad>" ends at x 283, "X SELECT" starts at x 465: the
 *   run 284..464, centre 374.
 * A left prompt's pen sits `inkOffset` (5) left of its glyph's ink (the disc's InfoTextT at x 475 draws its TRIANGLE from
 * x 480; SQUARE's cell is TRIANGLE's size). `leftBudget` / `centreBudget` are the width the entry may take ("<glyph>
 * ADVANCED" draws about 96): the box kept clear of the disc's, and the box a tap presses SQUARE in.
 */
export const SETTINGS_ADVANCED_PROMPT = {
  name: 'S2uAdvancedPrompt', y: 430, band: { y0: 405, y1: 435 }, inkOffset: 5,
  left: { video: 225, audio: 217 }, leftBudget: 100,
  centre: { controller: 374 }, centreBudget: 120,
  template: { video: 'InfoTextT', audio: 'InfoTextT', controller: 'DescriptionTextLow' },
} as const satisfies { template: Record<PromptScreen, string> } & Record<string, unknown>;

/** The disc's RETURN on OPTIONS, VIDEO and AUDIO (CONTROLLER PRESETS has none). */
const RETURN = 'SaveAndLeaveBtn';

type Button = Extract<DialogWidget, { type: 'BUTTON' }>;
type Text = Extract<DialogWidget, { type: 'TEXT' | 'SECURETEXT' | 'CLOCK' }>;
type Rgb = [number, number, number];
export interface SettingsAdvancedBox { x0: number; x1: number; y0: number; y1: number }

/** The screen a dialog name is, or null. */
export function settingsAdvancedScreen(name: string): SettingsAdvancedScreen | null {
  const n = name.toLowerCase();
  return (Object.keys(SETTINGS_ADVANCED_DIALOGS) as SettingsAdvancedScreen[]).find((k) => SETTINGS_ADVANCED_DIALOGS[k].toLowerCase() === n) ?? null;
}

/** The prompt's box on the 640 x 448 frame: its budget from its ink's left (VIDEO, AUDIO) or about its centre, the band's height. */
export function settingsAdvancedPromptBox(screen: PromptScreen): SettingsAdvancedBox {
  const P = SETTINGS_ADVANCED_PROMPT, y = { y0: P.band.y0, y1: P.band.y1 };
  if (screen === 'controller') return { x0: P.centre.controller - P.centreBudget / 2, x1: P.centre.controller + P.centreBudget / 2, ...y };
  return { x0: P.left[screen], x1: P.left[screen] + P.leftBudget, ...y };
}

/** A button's three states' text colour set to the green. */
function green(w: Button): Button {
  const b = w.button, t = (s: typeof b.normal) => ({ ...s, textColor: [...SETTINGS_ADVANCED_GREEN] as Rgb });
  return { ...w, button: { ...b, normal: t(b.normal), active: t(b.active), pressed: t(b.pressed) } };
}

/** The y of the free slot one pitch above RETURN with no row moved, or null. */
function freeSlot(controls: readonly DialogRecord[], ret: DialogRecord, pitch: number): number | null {
  const above = controls.filter((c) => !c.hidden && c !== ret && c.widget.type !== 'IMAGE' && c.x === ret.x && c.y < ret.y)
    .reduce<DialogRecord | null>((a, c) => (!a || c.y > a.y ? c : a), null);
  return above && above.y + pitch <= ret.y - pitch ? ret.y - pitch : null;
}

/**
 * A screen's design with its ADVANCED entry (see the module's note); any other design, or one the entry cannot be laid on
 * (no RETURN or no free slot on OPTIONS, no prompt text to clone), as it was. Nothing of the disc's records changes: the
 * row is inserted before RETURN, the prompt appended to the objects, the SQUARE binding after the screen's own.
 */
export function settingsAdvancedDesign(name: string, design: DialogDesign): DialogDesign {
  const screen = settingsAdvancedScreen(name);
  if (!screen || design.controls.some((c) => c.name === SETTINGS_ADVANCED_ROW) || design.objects.some((o) => o.name === SETTINGS_ADVANCED_PROMPT.name)) return design;
  const tab = SETTINGS_ADVANCED_TABS[screen];
  if (screen === 'options') {
    const ret = design.controls.find((c) => c.name === RETURN);
    if (!ret || ret.widget.type !== 'BUTTON') return design;
    const w = ret.widget;
    const slot = freeSlot(design.controls, ret, w.button.size[1]);
    const cross = w.button.bindings.filter((b) => b.kind === 'button' && b.name === 'CROSS');
    if (slot === null || cross.length === 0) return design;
    const bindings: DialogBinding[] = cross.map((b) => ({ ...b, animation: SETTINGS_ADVANCED_ANIMATION, argument: tab }));
    const row: DialogRecord = { ...ret, name: SETTINGS_ADVANCED_ROW, y: slot, childOf: null, widget: green({ ...w, button: { ...w.button, caption: SETTINGS_ADVANCED_TEXT, bindings } }) };
    const controls = [...design.controls];
    controls.splice(controls.indexOf(ret), 0, row);
    return { ...design, controls };
  }
  const P = SETTINGS_ADVANCED_PROMPT;
  const from = design.objects.find((o) => o.name === P.template[screen] && o.widget.type === 'TEXT');
  if (!from) return design;
  const t = from.widget as Text;
  const centred = screen === 'controller';
  const prompt: DialogRecord = {
    ...from, name: P.name, x: centred ? P.centre.controller : P.left[screen] - P.inkOffset, y: P.y, childOf: null, hidden: false,
    widget: { ...t, uivar: null, text: { ...t.text, caption: `${SETTINGS_ADVANCED_GLYPH} ${SETTINGS_ADVANCED_TEXT}`, hcentered: centred, rightJustified: false, color: [...SETTINGS_ADVANCED_GREEN] as Rgb } },
  };
  const square: DialogBinding = {
    kind: 'button', name: 'SQUARE', code: DIALOG_BUTTONS.SQUARE!, state: DIALOG_BUTTON_STATES.FALLING!, animation: SETTINGS_ADVANCED_ANIMATION, argument: tab,
  };
  return { ...design, objects: [...design.objects, prompt], bindings: [...design.bindings, square] };
}

/**
 * A dialog lookup with the four screens passed through `settingsAdvancedDesign` while `offered()` holds (asked at each
 * look-up: an entry is drawn only where a launcher is offered); otherwise the design as the lookup gave it. Made once per
 * design the lookup answers (it caches its own).
 */
export function settingsAdvancedLookup(lookup: (name: string) => DialogDesign | null, offered: () => boolean = () => false): (name: string) => DialogDesign | null {
  const made = new Map<string, { from: DialogDesign; to: DialogDesign }>();
  return (name) => {
    const d = lookup(name);
    if (!d || !settingsAdvancedScreen(name) || !offered()) return d;
    const k = name.toLowerCase(), had = made.get(k);
    if (had?.from === d) return had.to;
    const to = settingsAdvancedDesign(name, d);
    made.set(k, { from: d, to });
    return to;
  };
}

/**
 * The binding gate for the entry (`UiBindingGate`): on one of the four screens, the entry's animation with a tab takes the
 * start and calls `open` with the tab; nothing for any other binding.
 */
export function settingsAdvancedGate(open: (tab: SettingsAdvancedTab) => void): UiBindingGate {
  return (b) => {
    if (b.animation !== SETTINGS_ADVANCED_ANIMATION || !settingsAdvancedScreen(b.dialog) || !isTab(b.argument)) return false;
    open(b.argument);
    return true;
  };
}

/** The entry's box on the 640 x 448 frame (the row's body, or the prompt's), or null where the design has none. */
export function settingsAdvancedEntryBox(design: DialogDesign | null): SettingsAdvancedBox | null {
  if (!design) return null;
  const row = design.controls.find((c) => c.name === SETTINGS_ADVANCED_ROW);
  if (row?.widget.type === 'BUTTON') {
    const [w, h] = row.widget.button.size;
    return { x0: row.x, x1: row.x + w, y0: row.y, y1: row.y + h };
  }
  const p = design.objects.find((o) => o.name === SETTINGS_ADVANCED_PROMPT.name);
  if (!p || p.hidden || p.widget.type !== 'TEXT') return null;
  const P = SETTINGS_ADVANCED_PROMPT;
  const x0 = p.widget.text.hcentered ? p.x - P.centreBudget / 2 : p.x + P.inkOffset;
  return { x0, x1: x0 + (p.widget.text.hcentered ? P.centreBudget : P.leftBudget), y0: P.band.y0, y1: P.band.y1 };
}

/** Whether a frame point falls in the design's ADVANCED prompt's box (a prompt only: the row is a control of the ring). */
export function settingsAdvancedPromptAt(design: DialogDesign | null, x: number, y: number): boolean {
  if (!design?.objects.some((o) => o.name === SETTINGS_ADVANCED_PROMPT.name)) return false;
  const b = settingsAdvancedEntryBox(design);
  return !!b && x >= b.x0 && x < b.x1 && y >= b.y0 && y < b.y1;
}

/** What a pointer needs to press SQUARE on the prompt: the design shown now, and the press. */
export interface SettingsAdvancedTap {
  design(): DialogDesign | null;
  square(): void;
}

/** The front end's documents that registered (`settingsAdvancedFrontEnd`), and each session input's design reader. */
const frontEnds = new WeakSet<object>();
const designs = new WeakMap<object, () => DialogDesign | null>();

/**
 * The front end's "launcher offered" condition: the document's front end has registered and the document offers a
 * launcher (`./startMenuLauncher`). No document (Node), none registered, or no launcher: not offered.
 */
export function settingsAdvancedFrontEndOffered(doc: Document | undefined = (globalThis as { document?: Document }).document): boolean {
  return !!doc && frontEnds.has(doc) && startMenuLauncher(doc) !== null;
}

/** The front end's lookup: `settingsAdvancedLookup` with `settingsAdvancedFrontEndOffered`. */
export function settingsAdvancedFrontEndLookup(lookup: (name: string) => DialogDesign | null): (name: string) => DialogDesign | null {
  return settingsAdvancedLookup(lookup, () => settingsAdvancedFrontEndOffered());
}

/** What of the front end's session the entry uses. */
export interface SettingsAdvancedSession {
  host: { setBindingGate(owner: string, gate: UiBindingGate | null): void };
  input: object;
  machine: { shell(): { design: DialogDesign | null } | null };
}

/**
 * The front end's wiring (`./frontEnd` `mountFrontEnd`, once its session is made): the document registered (so its
 * lookup draws the entry while a launcher is offered), the session's input's design readable by the page's pointer
 * (`settingsAdvancedDesignOf`), and the gate: the launcher opened at the tab. The menus are left as they stood -- the
 * gate takes the start, so no script runs and the screen, its focus and its draft are unchanged under the overlay, and
 * the overlay's close lands on the same screen.
 */
export function settingsAdvancedFrontEnd(doc: Document, s: SettingsAdvancedSession): void {
  frontEnds.add(doc);
  designs.set(s.input, () => s.machine.shell()?.design ?? null);
  s.host.setBindingGate(SETTINGS_ADVANCED_GATE, settingsAdvancedGate((tab) => {
    try { startMenuLauncher(doc)?.open({ settings: tab }); } catch (e) { console.error('settings: the launcher did not open', e); }
  }));
}

/** The design a front end's input shows now (registered by `settingsAdvancedFrontEnd`), or null. */
export function settingsAdvancedDesignOf(input: object): DialogDesign | null {
  return designs.get(input)?.() ?? null;
}
