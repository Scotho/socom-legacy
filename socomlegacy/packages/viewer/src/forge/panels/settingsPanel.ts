import { FORGE_GAME_TYPE_NAME, FORGE_GAME_TYPES, NPC_BEHAVIOURS, SETTINGS_BOUNDS, type LayoutSettings } from '../layout';
import type { MenuItem } from '../padMenu';
import { DEFAULT_GRID_STEP, DEFAULT_TURN_STEP, GRID_STEP_MAX, GRID_STEP_MIN, TURN_STEP_MAX, TURN_STEP_MIN } from '../placement';
import { FOG_SLIDER_STEPS, lightingLabel, NPC_BEHAVIOUR_LABEL, type NumericSetting } from '../settings';
import { builtPanel, forgeEl, type ForgePanel } from '../shell/panel';

/**
 * FUI-1 (the review's UX-10; FG-24, FG.R18; a browser adaptation, FG.R2): the Settings panel. The layout's map settings
 * are one list of rows (`MAP_SETTING_ROWS`), drawn twice from it -- as the dock's controls and as the START menu's
 * section -- with one value formatter (`formatSetting`), so a new setting is added once. The markup is the page's as it
 * was (`.fx-settings`, `.fx-setting`, `.fx-setting-nums`, `.fx-toggle`); the page's closure keeps wiring the controls and
 * writes every change as an edit of the layout, as before. The editor's own steps (grid, turn, snap) head the panel.
 */
export type MapSettingId = 'gameType' | NumericSetting | 'friendlyFire' | 'npcBehaviour';
export type SettingControl = 'select' | 'range' | 'fog' | 'number' | 'toggle' | 'choice';

export interface SettingRowSpec {
  id: MapSettingId;
  /** The START menu's row id (the menu's cursor follows it). */
  menuId: string;
  label: string;
  /** The dock's label where it differs (a unit). */
  dockLabel?: string;
  control: SettingControl;
  /** The menu row's line. */
  note?: string;
  /** The dock's line under the control (or its group). */
  dockNote?: string;
  /**
   * Cross on the menu row: the map's own value back (`reset`, the fog), the original lighting back (`original`, the
   * saved Night -> Day adaptation), or one step (a toggle). Else Cross does nothing.
   */
  menuAct?: 'reset' | 'original' | 'step';
}

export const MAP_SETTING_ROWS: readonly SettingRowSpec[] = [
  { id: 'gameType', menuId: 'gametype', label: 'Game type', control: 'select', note: 'The layout\'s own mode. Map\'s own keeps the base\'s.' },
  // Saved Forge Night -> Day (a browser adaptation, no original): the row the legacy dimmer (`light`) held.
  { id: 'timeOfDay', menuId: 'setting-timeOfDay', label: 'Day / night', control: 'range', note: '← → Night to Day · ✕ Original', menuAct: 'original' },
  { id: 'fogFar', menuId: 'setting-fogFar', label: 'Fog distance', control: 'fog', note: '← → a quarter nearer or farther · ✕ the map’s own', menuAct: 'reset' },
  { id: 'players', menuId: 'setting-players', label: 'Players', control: 'number', note: 'Above 16 a lobby seats them all, half a side; Play seats 8 a side',
    dockNote: 'Above 16 a lobby made from the map seats them all, half a side; Play here seats 8 a side.' },
  { id: 'rounds', menuId: 'setting-rounds', label: 'Rounds', control: 'number' },
  { id: 'roundSeconds', menuId: 'setting-roundSeconds', label: 'Round time', dockLabel: 'Round time (s)', control: 'number' },
  { id: 'friendlyFire', menuId: 'setting-friendlyFire', label: 'Friendly fire', control: 'toggle', menuAct: 'step' },
  // NPB-6 (NPB.R6): how the layout's NPCs play in Play here -- sentries, or the lobby bots' brain where the map has its graph.
  { id: 'npcBehaviour', menuId: 'setting-npcBehaviour', label: 'NPC behaviour', control: 'choice', menuAct: 'step',
    dockNote: 'Patrol needs the map’s navigation file (tools/prepare-bot-navigation.ts); without it the NPCs stand as sentries.' },
];

/** The one value formatter: what the dock's value line and the menu's value show (the game type is its option's label). */
export function formatSetting(id: Exclude<MapSettingId, 'gameType'>, s: LayoutSettings, discFar: number): string {
  switch (id) {
    case 'timeOfDay': return lightingLabel(s);
    case 'light': return `${Math.round(s.light * 100)}%`;
    case 'fogFar': return `${s.fogFar ?? Math.round(discFar)} u${s.fogFar === null ? ' · map’s' : ''}`;
    case 'roundSeconds': return `${Math.floor(s.roundSeconds / 60)}:${String(s.roundSeconds % 60).padStart(2, '0')}`;
    case 'friendlyFire': return s.friendlyFire ? 'On' : 'Off';
    case 'npcBehaviour': return NPC_BEHAVIOUR_LABEL[s.npcBehaviour];
    default: return String(s[id]);
  }
}

export interface SettingsDom {
  body: HTMLDivElement;
  gridIn: HTMLInputElement;
  turnIn: HTMLInputElement;
  snapIn: HTMLInputElement;
  /** FUI-22 (D1: "a setting to turn it off"): the asset list's tooltip preview, an editor setting of this browser. */
  tipsIn: HTMLInputElement;
  gameTypeSel: HTMLSelectElement;
  lightIn: HTMLInputElement;
  /** Original: the saved Night -> Day cleared, the map's authored lighting back. */
  lightReset: HTMLButtonElement;
  /** The slider, its Original button and its Night / Day ends, the dock's control for the row. */
  lightControls: HTMLDivElement;
  lightOut: HTMLSpanElement;
  fogIn: HTMLInputElement;
  fogOut: HTMLSpanElement;
  fogReset: HTMLButtonElement;
  numIn: Record<'players' | 'rounds' | 'roundSeconds', HTMLInputElement>;
  ffIn: HTMLInputElement;
  npcSel: HTMLSelectElement;
}

type Parts = Omit<SettingsDom, 'body' | 'gridIn' | 'turnIn' | 'snapIn' | 'tipsIn'>;

function settingRow(doc: Document, label: string, control: HTMLElement, value: HTMLElement | null = null): HTMLLabelElement {
  const w = forgeEl(doc, 'label', 'fx-setting');
  const head = forgeEl(doc, 'span', 'fx-setting-head');
  head.append(forgeEl(doc, 'span', '', label));
  if (value) head.append(value);
  w.append(head, control);
  return w;
}

function range(doc: Document, min: number, max: number, step: number): HTMLInputElement {
  const i = forgeEl(doc, 'input', 'fx-range');
  i.type = 'range';
  i.min = String(min);
  i.max = String(max);
  i.step = String(step);
  return i;
}

function numberIn(doc: Document, min: number, max: number, step: number): HTMLInputElement {
  const i = forgeEl(doc, 'input', 'fx-num fx-setting-num fx-stepper');   // FUI-22 (D2): the dock's one stepper
  i.type = 'number';
  i.min = String(min);
  i.max = String(max);
  i.step = String(step);
  return i;
}

function stepInput(doc: Document, min: number, max: number, value: number, title: string): HTMLInputElement {
  const i = numberIn(doc, min, max, 1);
  i.value = String(value);
  i.title = title;
  return i;
}

function controls(doc: Document): Parts {
  const gameTypeSel = forgeEl(doc, 'select', 'fx-select fx-game-type');
  gameTypeSel.setAttribute('aria-label', 'Game type');
  const gameOpt = (value: string, label: string): HTMLOptionElement => { const o = forgeEl(doc, 'option', '', label); o.value = value; return o; };
  gameTypeSel.append(gameOpt('', 'Map’s own'), ...FORGE_GAME_TYPES.map((t) => gameOpt(String(t), FORGE_GAME_TYPE_NAME[t])));
  const fogReset = forgeEl(doc, 'button', 'fx-chip fx-setting-reset', 'Map’s own');
  fogReset.type = 'button';
  fogReset.title = 'The map’s own fog distance, from the disc';
  const ffIn = forgeEl(doc, 'input');
  ffIn.type = 'checkbox';
  const npcSel = forgeEl(doc, 'select', 'fx-select fx-npc-behaviour');
  npcSel.setAttribute('aria-label', 'NPC behaviour');
  npcSel.append(...NPC_BEHAVIOURS.map((b) => gameOpt(b, NPC_BEHAVIOUR_LABEL[b])));
  const num = (key: 'players' | 'rounds' | 'roundSeconds'): HTMLInputElement => numberIn(doc, SETTINGS_BOUNDS[key].min, SETTINGS_BOUNDS[key].max, SETTINGS_BOUNDS[key].step);
  const lightIn = range(doc, SETTINGS_BOUNDS.timeOfDay.min, SETTINGS_BOUNDS.timeOfDay.max, SETTINGS_BOUNDS.timeOfDay.step);
  lightIn.setAttribute('aria-label', 'Night to day');
  const lightReset = forgeEl(doc, 'button', 'fx-chip fx-setting-reset', 'Original');
  lightReset.type = 'button';
  lightReset.title = 'Restore original lighting';
  const lightWrap = forgeEl(doc, 'div', 'fx-setting-pair');
  lightWrap.append(lightIn, lightReset);
  const lightLabels = forgeEl(doc, 'div', 'fx-setting-head');
  lightLabels.append(forgeEl(doc, 'span', '', 'Night'), forgeEl(doc, 'span', '', 'Day'));
  const lightControls = forgeEl(doc, 'div');
  lightControls.append(lightWrap, lightLabels);
  return {
    gameTypeSel, lightIn, lightReset, lightControls,
    lightOut: forgeEl(doc, 'span', 'fx-setting-value'), fogIn: range(doc, 0, FOG_SLIDER_STEPS, 1), fogOut: forgeEl(doc, 'span', 'fx-setting-value'),
    fogReset, numIn: { players: num('players'), rounds: num('rounds'), roundSeconds: num('roundSeconds') }, ffIn, npcSel,
  };
}

/**
 * FCW-32 step 4 (FUI.R23 D2; product track, a browser adaptation): the Game type select's **Custom** group -- the rules
 * modes of the Forge's mode list (`../rulesAuthoring` `forgeModeList`: `forgeModeChoices` over the layout's draft, then
 * the installed packs'), each an option of value `mode:<id>@<version>`, one Play cannot run greyed with its reason (its
 * title). The page draws it on every change of the layout; the pad's cycle (`cycleSelect`) steps through the same options.
 */
export const CUSTOM_MODES_GROUP = 'Custom';
export const MODE_OPTION_PREFIX = 'mode:';
export const modeOptionValue = (m: { id: string; version: string }): string => `${MODE_OPTION_PREFIX}${m.id}@${m.version}`;
export interface CustomModeOption { id: string; version: string; name: string; reason: string | null }

export function drawCustomModes(sel: HTMLSelectElement, modes: readonly CustomModeOption[]): void {
  const doc = sel.ownerDocument;
  let group = sel.querySelector<HTMLOptGroupElement>(':scope > optgroup[data-forge-modes]');
  if (modes.length === 0) { group?.remove(); return; }
  const stamp = JSON.stringify(modes);
  if (group?.dataset['forgeModes'] === stamp) return;            // unchanged: the options (and the selection) kept
  if (!group) {
    group = doc.createElement('optgroup');
    group.label = CUSTOM_MODES_GROUP;
    sel.append(group);
  }
  group.dataset['forgeModes'] = stamp;
  group.replaceChildren(...modes.map((m) => {
    const o = forgeEl(doc, 'option', '', m.reason === null ? m.name : `${m.name} · can't play yet`);
    o.value = modeOptionValue(m);
    o.disabled = m.reason !== null;
    o.title = m.reason ?? `${m.id}@${m.version}`;
    return o;
  }));
}

/** One spec row as the dock's control. */
function dockRow(doc: Document, spec: SettingRowSpec, p: Parts): HTMLElement {
  const label = spec.dockLabel ?? spec.label;
  switch (spec.control) {
    case 'select': return settingRow(doc, label, p.gameTypeSel);
    case 'range': return settingRow(doc, label, p.lightControls, p.lightOut);
    case 'fog': { const pair = forgeEl(doc, 'div', 'fx-setting-pair'); pair.append(p.fogIn, p.fogReset); return settingRow(doc, label, pair, p.fogOut); }
    case 'number': return settingRow(doc, label, p.numIn[spec.id as 'players' | 'rounds' | 'roundSeconds']);
    case 'toggle': { const w = forgeEl(doc, 'label', 'fx-toggle'); w.append(p.ffIn, forgeEl(doc, 'span', '', label)); return w; }
    case 'choice': return settingRow(doc, label, p.npcSel);
  }
}

/** The map settings in the dock: the spec's order, the numbers side by side in one group with their notes after it. */
function mapRows(doc: Document, p: Parts): HTMLElement[] {
  const out: HTMLElement[] = [];
  let group: HTMLDivElement | null = null;
  let notes: string[] = [];
  const close = (): void => {
    if (!group) return;
    out.push(group, ...notes.map((n) => forgeEl(doc, 'p', 'fx-dim fx-setting-note', n)));
    group = null; notes = [];
  };
  for (const spec of MAP_SETTING_ROWS) {
    if (spec.control !== 'number') { close(); out.push(dockRow(doc, spec, p)); if (spec.dockNote) out.push(forgeEl(doc, 'p', 'fx-dim fx-setting-note', spec.dockNote)); continue; }
    group ??= forgeEl(doc, 'div', 'fx-setting-nums');
    group.append(dockRow(doc, spec, p));
    if (spec.dockNote) notes.push(spec.dockNote);
  }
  close();
  return out;
}

export function buildSettings(doc: Document): SettingsDom {
  const body = forgeEl(doc, 'div', 'fx-settings fx-section');       // FUI-22 (D2): the dock's one section style
  // FG-49: the snap's grid and turn, settings of the editor (kept with the view switches, not in the layout).
  const gridIn = stepInput(doc, GRID_STEP_MIN, GRID_STEP_MAX, DEFAULT_GRID_STEP, 'Grid step, in game units');
  const turnIn = stepInput(doc, TURN_STEP_MIN, TURN_STEP_MAX, DEFAULT_TURN_STEP, 'Turn step, in degrees');
  const snapIn = forgeEl(doc, 'input');
  snapIn.type = 'checkbox';
  const snapRow = forgeEl(doc, 'label', 'fx-toggle');
  snapRow.append(snapIn, forgeEl(doc, 'span', '', 'Snap'));
  // FUI-22 (D1): the asset list's tooltip preview, on unless turned off here (an editor setting, not the layout's).
  const tipsIn = forgeEl(doc, 'input');
  tipsIn.type = 'checkbox';
  tipsIn.checked = true;
  tipsIn.dataset['forgeSetting'] = 'assetTips';
  const tipsRow = forgeEl(doc, 'label', 'fx-toggle');
  tipsRow.title = 'A preview beside the asset under the pointer or the focus';
  tipsRow.append(tipsIn, forgeEl(doc, 'span', '', 'Asset preview on hover'));
  const p = controls(doc);
  body.append(forgeEl(doc, 'h3', '', 'Placement'), settingRow(doc, 'Grid step', gridIn), settingRow(doc, 'Turn step (°)', turnIn), snapRow, tipsRow, ...mapRows(doc, p));
  return { body, gridIn, turnIn, snapIn, tipsIn, ...p };
}

/** What the menu's rows read and do: the page's own settings, steps and refusals. */
export interface SettingsMenuHooks {
  settings(): LayoutSettings;
  discFar(): number;
  gameTypeLabel(): string;
  cycleGameType(by: 1 | -1): void;
  step(key: NumericSetting | 'friendlyFire' | 'npcBehaviour', dir: 1 | -1): void;
  resetFog(): void;
  /** Original: the saved Night -> Day cleared (`./settings` `timeSetting(s, null)`), as the dock's button. */
  resetLighting(): void;
  /** True while the layout's edits are locked (a lobby open): the lighting row is shown disabled. */
  locked(): boolean;
}

/** The START menu's "Map settings" section from the same rows: ← → a step each, Cross where the row says. */
export function settingsMenuSection(hooks: SettingsMenuHooks, rows: readonly SettingRowSpec[] = MAP_SETTING_ROWS): MenuItem[] {
  const s = hooks.settings(), far = hooks.discFar();
  const item = (spec: SettingRowSpec): MenuItem => {
    if (spec.id === 'gameType') {
      return { id: spec.menuId, label: spec.label, value: hooks.gameTypeLabel(), ...(spec.note ? { note: spec.note } : {}), keepOpen: true,
        left: () => hooks.cycleGameType(-1), right: () => hooks.cycleGameType(1) };
    }
    const key = spec.id;
    const act = spec.menuAct === 'reset' ? { act: () => hooks.resetFog() } : spec.menuAct === 'original' ? { act: () => hooks.resetLighting() }
      : spec.menuAct === 'step' ? { act: () => hooks.step(key, 1) } : {};
    return { id: spec.menuId, label: spec.label, value: formatSetting(key, s, far), keepOpen: true, left: () => hooks.step(key, -1), right: () => hooks.step(key, 1),
      ...(spec.note ? { note: spec.note } : {}), ...(spec.menuAct === 'original' && hooks.locked() ? { disabled: true } : {}), ...act };
  };
  return [{ id: 'settings', label: 'Map settings', heading: true }, ...rows.map(item)];
}

/**
 * FUI.R5's tabs: Settings sits under Edit with the Inspector and the Outliner (the layout's own values and the editor's
 * steps), so a dock past five panels still opens it with them -- forgeDemolition.spec drives its Game type while the
 * Outliner is checked; View alone is World. A deliberate grouping (the review named the tabs, not their panels).
 */
export function settingsPanel(dom: SettingsDom, hooks: SettingsMenuHooks): ForgePanel {
  return builtPanel({ id: 'settings', title: 'Settings', dock: 'right', order: 40, defaultOpen: true, tab: 'Edit',
    padLegend: [{ button: 'dpad', label: 'Change' }, { button: 'cross', label: 'Reset' }], menuSection: () => settingsMenuSection(hooks) }, dom.body);
}
