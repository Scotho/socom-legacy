import { FORGE_GAME_TYPE_NAME, FORGE_GAME_TYPES, NPC_BEHAVIOURS, SETTINGS_BOUNDS, type LayoutSettings } from '../layout';
import type { MenuItem } from '../padMenu';
import { EQ_LIMIT_LABEL, FOG_SLIDER_STEPS, lightingLabel, NPC_BEHAVIOUR_LABEL, type NumericSetting, type SteppedSetting } from '../settings';
import { builtPanel, forgeEl, type ForgePanel } from '../shell/panel';
import { buildArsenalSection, type ArsenalSection } from './arsenalSection';
import { buildRosterSection, type RosterSection } from './rosterSection';
import { buildWorldSection, type WorldSection } from './worldSection';

/**
 * FUI-1 (the review's UX-10; FG-24, FG.R18; a browser adaptation, FG.R2): the Settings panel. The layout's map settings
 * are one list of rows (`MAP_SETTING_ROWS`), drawn twice from it -- as the dock's controls and as the START menu's
 * section -- with one value formatter (`formatSetting`), so a new setting is added once. The markup is the page's as it
 * was (`.fx-settings`, `.fx-setting`, `.fx-setting-nums`, `.fx-toggle`); the page's closure keeps wiring the controls and
 * writes every change as an edit of the layout, as before. The editor's snap settings live in the viewport dropdown.
 */
export type MapSettingId = 'gameType' | NumericSetting | 'friendlyFire' | 'npcBehaviour' | 'respawn';
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
  { id: 'timeOfDay', menuId: 'setting-timeOfDay', label: 'Night / day', control: 'range', note: '← → Night to Day · ✕ Original', menuAct: 'original' },
  { id: 'fogFar', menuId: 'setting-fogFar', label: 'Fog distance', control: 'fog', note: '← → a quarter nearer or farther · ✕ the map’s own', menuAct: 'reset' },
  { id: 'players', menuId: 'setting-players', label: 'Players', control: 'number', note: 'Above 16 a lobby seats them all, half a side; Play seats 8 a side',
    dockNote: 'Above 16 a lobby made from the map seats them all, half a side; Play here seats 8 a side.' },
  { id: 'rounds', menuId: 'setting-rounds', label: 'Rounds', control: 'number' },
  { id: 'roundSeconds', menuId: 'setting-roundSeconds', label: 'Round time', dockLabel: 'Round time (s)', control: 'number' },
  { id: 'friendlyFire', menuId: 'setting-friendlyFire', label: 'Friendly fire', control: 'toggle', menuAct: 'step' },
  // CREATE GAME's RESPAWN and EQlimit rows (research 348, 362): the room's own `rules` and `eqLimit`.
  { id: 'respawn', menuId: 'setting-respawn', label: 'Respawn', control: 'toggle', menuAct: 'step',
    dockNote: 'Respawn plays 1 round of 20 minutes by default, classic 11 rounds of 6; rounds and round time you set are kept.' },
  { id: 'eqLimit', menuId: 'setting-eqLimit', label: 'Equipment limit', control: 'choice', menuAct: 'step',
    dockNote: 'CREATE GAME’s restriction, applied over the weapons below.' },
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
    case 'respawn': return s.respawn ? 'On' : 'Off';
    case 'eqLimit': return EQ_LIMIT_LABEL[s.eqLimit] ?? String(s.eqLimit);
    case 'npcBehaviour': return NPC_BEHAVIOUR_LABEL[s.npcBehaviour];
    default: return String(s[id]);
  }
}

export interface SettingsDom {
  body: HTMLDivElement;
  /**
   * The layout's lighting rows -- Day / night and Fog distance (`LIGHTING_SETTINGS`) -- built from the same row list
   * and wired by the page as before, but mounted by the Environment panel (`./environmentPanel`), not in `body`.
   */
  lightingRows: HTMLElement[];
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
  respawnIn: HTMLInputElement;
  eqSel: HTMLSelectElement;
  /** The match's weapons and kits (`./arsenalSection`), drawn and wired by the page. */
  arsenal: ArsenalSection;
  /** The ARMORY's character types (`./rosterSection`), drawn and wired by the page. */
  roster: RosterSection;
  /** The default surface, the field of view, the reverb and the loading screen (`./worldSection`), drawn and wired by the page. */
  world: WorldSection;
}

type Parts = Omit<SettingsDom, 'body' | 'lightingRows' | 'arsenal' | 'roster' | 'world'>;

/** The settings whose dock rows live in the Environment panel (still the START menu's Map settings rows). */
export const LIGHTING_SETTINGS: readonly MapSettingId[] = ['timeOfDay', 'fogFar'];

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

function controls(doc: Document): Parts {
  const gameTypeSel = forgeEl(doc, 'select', 'fx-select fx-game-type');
  gameTypeSel.setAttribute('aria-label', 'Game type');
  const gameOpt = (value: string, label: string): HTMLOptionElement => { const o = forgeEl(doc, 'option', '', label); o.value = value; return o; };
  // No "Map's own" (the owner, 2026-11-06): a layout naming no type shows its base map's own, read off the disc.
  gameTypeSel.append(...FORGE_GAME_TYPES.map((t) => gameOpt(String(t), FORGE_GAME_TYPE_NAME[t])));
  const fogReset = forgeEl(doc, 'button', 'fx-chip fx-setting-reset', 'Map’s own');
  fogReset.type = 'button';
  fogReset.title = 'The map’s own fog distance, from the disc';
  const ffIn = forgeEl(doc, 'input');
  ffIn.type = 'checkbox';
  const npcSel = forgeEl(doc, 'select', 'fx-select fx-npc-behaviour');
  npcSel.setAttribute('aria-label', 'NPC behaviour');
  npcSel.append(...NPC_BEHAVIOURS.map((b) => gameOpt(b, NPC_BEHAVIOUR_LABEL[b])));
  const respawnIn = forgeEl(doc, 'input');
  respawnIn.type = 'checkbox';
  const eqSel = forgeEl(doc, 'select', 'fx-select fx-eq-limit');
  eqSel.setAttribute('aria-label', 'Equipment limit');
  eqSel.append(...EQ_LIMIT_LABEL.map((l, i) => gameOpt(String(i), l)));
  const num = (key: 'players' | 'rounds' | 'roundSeconds'): HTMLInputElement => numberIn(doc, SETTINGS_BOUNDS[key].min, SETTINGS_BOUNDS[key].max, SETTINGS_BOUNDS[key].step);
  const lightIn = range(doc, SETTINGS_BOUNDS.timeOfDay.min, SETTINGS_BOUNDS.timeOfDay.max, SETTINGS_BOUNDS.timeOfDay.step);
  lightIn.setAttribute('aria-label', 'Night to day');
  const lightReset = forgeEl(doc, 'button', 'fx-chip fx-setting-reset', 'Original');
  lightReset.type = 'button';
  lightReset.title = 'Restore original lighting';
  // Its ends' words on the slider's own line, each at the end it names (the owner, 2026-11-12: "use the same sides as
  // the slider values ... aligned to the slider"): Night at the left (0), Day at the right (1), then the reset.
  const lightWrap = forgeEl(doc, 'div', 'fx-setting-pair');
  lightWrap.append(forgeEl(doc, 'span', 'fx-slider-end', 'Night'), lightIn, forgeEl(doc, 'span', 'fx-slider-end', 'Day'), lightReset);
  const lightControls = forgeEl(doc, 'div');
  lightControls.append(lightWrap);
  return {
    gameTypeSel, lightIn, lightReset, lightControls,
    lightOut: forgeEl(doc, 'span', 'fx-setting-value'), fogIn: range(doc, 0, FOG_SLIDER_STEPS, 1), fogOut: forgeEl(doc, 'span', 'fx-setting-value'),
    fogReset, numIn: { players: num('players'), rounds: num('rounds'), roundSeconds: num('roundSeconds') }, ffIn, npcSel, respawnIn, eqSel,
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
    case 'toggle': { const w = forgeEl(doc, 'label', 'fx-toggle'); w.append(spec.id === 'respawn' ? p.respawnIn : p.ffIn, forgeEl(doc, 'span', '', label)); return w; }
    case 'choice': return settingRow(doc, label, spec.id === 'eqLimit' ? p.eqSel : p.npcSel);
  }
}

/**
 * The map settings in the dock: the spec's order, the numbers side by side in one group with their notes after it.
 * `rows` the specs drawn (the Settings panel's: all but the lighting ones; the Environment panel's: those).
 */
function mapRows(doc: Document, p: Parts, rows: readonly SettingRowSpec[]): HTMLElement[] {
  const out: HTMLElement[] = [];
  let group: HTMLDivElement | null = null;
  let notes: string[] = [];
  const close = (): void => {
    if (!group) return;
    out.push(group, ...notes.map((n) => forgeEl(doc, 'p', 'fx-dim fx-setting-note', n)));
    group = null; notes = [];
  };
  for (const spec of rows) {
    if (spec.control !== 'number') { close(); out.push(dockRow(doc, spec, p)); if (spec.dockNote) out.push(forgeEl(doc, 'p', 'fx-dim fx-setting-note', spec.dockNote)); continue; }
    group ??= forgeEl(doc, 'div', 'fx-setting-nums');
    group.append(dockRow(doc, spec, p));
    if (spec.dockNote) notes.push(spec.dockNote);
  }
  close();
  return out;
}

export function buildSettings(doc: Document): SettingsDom {
  const body = forgeEl(doc, 'div', 'fx-settings fx-section fx-prop-table');       // FUI-22 (D2): the dock's one section style
  const p = controls(doc);
  const lighting = (spec: SettingRowSpec): boolean => LIGHTING_SETTINGS.includes(spec.id);
  const arsenal = buildArsenalSection(doc), roster = buildRosterSection(doc), world = buildWorldSection(doc);
  body.append(forgeEl(doc, 'h3', '', 'Map'), ...mapRows(doc, p, MAP_SETTING_ROWS.filter((s) => !lighting(s))), roster.body, arsenal.body, world.body);
  return { body, lightingRows: mapRows(doc, p, MAP_SETTING_ROWS.filter(lighting)), arsenal, roster, world, ...p };
}

/** What the menu's rows read and do: the page's own settings, steps and refusals. */
export interface SettingsMenuHooks {
  settings(): LayoutSettings;
  discFar(): number;
  gameTypeLabel(): string;
  cycleGameType(by: 1 | -1): void;
  step(key: SteppedSetting, dir: 1 | -1): void;
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
 * Settings now sits under World with the Environment panel (the map-wide settings); the tab once called Edit is Object.
 * Before: FUI.R5's tabs: Settings sat under Edit with the Inspector and the Outliner (the layout's own values and the editor's
 * steps), so a dock past five panels still opens it with them -- forgeDemolition.spec drives its Game type while the
 * Outliner is checked; View alone is World. A deliberate grouping (the review named the tabs, not their panels).
 */
export function settingsPanel(dom: SettingsDom, hooks: SettingsMenuHooks): ForgePanel {
  // Under World, beside the Environment panel: the layout's map-wide settings, not an object's.
  // Titled Map Settings and first on the Map tab (the owner, 2026-11-06): above the View (30) and the Light rig (35).
  // Its id kept, so a saved dock layout and the tests still find it.
  return builtPanel({ id: 'settings', title: 'Map Settings', dock: 'right', order: 25, defaultOpen: true, tab: 'Map',
    padLegend: [{ button: 'dpad', label: 'Change' }, { button: 'cross', label: 'Reset' }], menuSection: () => settingsMenuSection(hooks) }, dom.body);
}
