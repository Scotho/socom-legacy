import './sheet.css';
import { pageSettings } from '../pageStore';
import { StartupNavigation } from '../startupNavigation';
import type { PadLike } from '../gamepad';
import { extractionState } from '../discExtractRecord';
import type { ExtractionState } from '../discExtract';
import { LAUNCH_SETTINGS_ADAPTATION, launchParam, PARAM_GROUPS, type LaunchParam } from './params';
import {
  choiceOfValues, cliCommand, PLAYTEST_DEFAULTS, PLAYTEST_SERVICE_PORT, playtestAddress, playtestOptionRows, probeService, sheetRows,
  testRoomAddress, valuesOfChoice, valuesOfSearch, type LaunchValues,
} from './address';
import { servedTree } from '../console/launcherEntry';
import { launchMaps } from './maps';
import { activeMode, applyMode, isLaunchMode, LAUNCH_MODES, type LaunchModeId } from './modes';
import { LaunchPresets, type LaunchSheetKind, type PresetStore } from './presets';

/**
 * The launch settings sheet (web sprint 37 PTT-9, W37.R6: the owner's "include a host of launch settings on /playtest
 * and /testroom please pre-launch for things that the params control as launch settings that save locally for
 * reusability"; research 243 §9). LAUNCH_SETTINGS_ADAPTATION: a browser adaptation with no original, on a development
 * build only -- `../pageEntry` imports this module under a literal `import.meta.env.DEV`, so a release and the demo
 * carry none of it (as the keyboard's sites, OT.R29). It builds an address of the page's own switches and goes to it;
 * it never reads or changes a game value.
 *
 * It takes the page before `../main` is imported (the viewer's markup is removed: nothing here drives it, and Launch
 * loads the page anew):
 * - **The test room** (`/testroom`, no parameter, or `?launch`): the same fields as before (`./params`, `./address`),
 *   reached by mode cards (`./modes`), map tiles (`./maps`) and the few switches used most often. Everything else,
 *   the presets included, is under Advanced, each field still carrying its meaning. The address, Launch and Copy are
 *   the same contract. Recent launches are chips on the sheet's own preset record (`./presets`).
 * - **The playtest** (`/playtest`): the session's choice -- target, map, online, the CLI's options -- and the exact
 *   command that starts it (`cliCommand`). The sheet asks the lane's session service (`GET 127.0.0.1:5303/status`,
 *   quietly, never holding the sheet, and only a session's record counts). An online session answering is joined as
 *   it is (the merge controller's ruling on PTT-9's review): the button reads "Join the running session (<id>)" and goes
 *   to the record's own `launch.url`, the address the CLI printed (its map, options and server); the fields still build
 *   the command for a new session. An offline session answering offers no join (its page is the one `start` opened),
 *   and with none answering Launch opens the test room on this page with no session in it (`playtestAddress`).
 * - **Presets** (`./presets`): named, saved, loaded, deleted, and the last used (written at Launch, the sheet's start
 *   when the address names no field), on the page's storage through `../pageStore` `pageSettings`; without storage
 *   they last the visit.
 * Native controls in the design system's classes (no inline style), so Tab and Enter work as a form does; the pad walks
 * them as the setup page's does (`../startupNavigation`: up and down move, left and right change a value, cross
 * presses, circle backs out of an open disclosure). One column at a phone's width (`.s2u-cards--2`, `.s2u-tiles`).
 */

export interface LaunchSheetOptions {
  doc: Document;
  mode: LaunchSheetKind;
  /** The address's search: the fields it names open the sheet (`?launch&map=MP2`). */
  search: string;
  /** The page's base (`/` in development, `/socomlegacy/` on the site). */
  base: string;
  /** The presets' store; absent, the page's (`pageSettings`); null, none (the presets last the visit). */
  store?: PresetStore | null;
  /** Goes to an address; absent, the window's `location.assign`. */
  navigate?: (address: string) => void;
  /** The probe's fetch; absent, the window's; null, none (no service is asked for). */
  fetch?: typeof fetch | null;
  /** The clipboard; absent, the browser's; null, none (Copy selects the text instead). */
  clipboard?: { writeText(text: string): Promise<void> } | null;
  /** The pads; absent, `navigator.getGamepads()`. */
  pads?: () => ArrayLike<PadLike | null>;
  /** The kept disc's state; absent, `extractionState`. The strip reads it and never waits on it. */
  disc?: () => Promise<ExtractionState>;
  /**
   * Whether `maps/index.json` answers; absent, a HEAD of it under `base` (`servedTree`). A boolean is read at once.
   * When served maps are on and this is false, the sheet says so beside that switch and Launch stays here.
   */
  maps?: () => boolean | Promise<boolean>;
}

export interface LaunchSheetMount {
  root: HTMLElement;
  /** The address Launch goes to now. */
  address(): string;
  /** /playtest's command now; null on /testroom. */
  command(): string | null;
  /** Whether a session service answered (/playtest); false at once on /testroom. */
  service: Promise<boolean>;
  launch(): void;
  stop(): void;
}

type Control = HTMLInputElement | HTMLSelectElement;

/** The switches kept in view. Every other test-room row is under Advanced. Map has its own tiles. `devmode` is the three. */
const PRIMARY_KEYS = new Set(['served', 'flyok', 'devtools', 'view', 'fly', 'noarmory']);

/** `devmode` is not a checkbox: the three switches are, and all three write `devmode`. */
const DEV_BUNDLE = 'devmode';
const DEV_SPLIT = ['served', 'flyok', 'devtools'] as const;

/**
 * What the sheet says when served maps are on and `maps/index.json` does not answer. The command is SETUP's
 * (`socomlegacy/docs/SETUP.md`, "Your disc"): from `socomlegacy/`, with `SOCOM_DISC` set.
 */
export const SERVED_MAPS_MISSING = 'Served maps were asked for, but maps/index.json did not answer. From socomlegacy/, with SOCOM_DISC set, run npm run extract-maps -- --with-streams.';

/** A shorter line for a switch kept in view. The field still carries the table's full meaning. */
const HINTS: Readonly<Record<string, string>> = {
  served: 'Extracted maps from this server, skipping the disc.',
  flyok: 'The fly toggle is allowed in Play.',
  devtools: 'Taunt editor, kit, teleport, playtest tools, replay.',
  view: 'Modern picture, or the PS2 frame.',
  fly: 'Play opens in the fly camera, and the offline match is off.',
  noarmory: 'The pre-round armory stays shut.',
  map: 'The map by its archive stem. A tile sets it; any other stem can be typed.',
};

/** The visible name of a test-room field. The control's key is unchanged. */
const TITLES: Readonly<Record<string, string>> = {
  served: 'Served maps', flyok: 'Fly in Play', devtools: 'Dev tools',
  map: 'Map stem', mode: 'Mode', view: 'Picture', fly: 'Fly camera', nomatch: 'No match',
  noarmory: 'No armory', kit: 'Kit', rules: 'Rules', online: 'Online', server: 'Server', mp: 'Match server',
  lag: 'Lag', loss: 'Loss', playtest: 'Playtest', 'retest-at': 'Retest at', replay: 'Replay', replayview: 'Replay view',
  tick: 'Tick', embedder: 'Embedder',
};

/** `devmode` in `values` checks all three switches. The checkboxes themselves are what the sheet draws. */
function expandDev(values: Readonly<Record<string, string>>): Record<string, string> {
  const out: Record<string, string> = { ...values };
  if (out[DEV_BUNDLE] !== undefined) {
    for (const key of DEV_SPLIT) out[key] = '';
    delete out[DEV_BUNDLE];
  }
  return out;
}

/** All three switches on is the bare `devmode` flag, so an old link and a mode card keep that address. */
function collapseDev(values: Readonly<Record<string, string>>): Record<string, string> {
  const out: Record<string, string> = { ...values };
  if (DEV_SPLIT.every((key) => out[key] !== undefined)) {
    for (const key of DEV_SPLIT) delete out[key];
    out[DEV_BUNDLE] = '';
  } else delete out[DEV_BUNDLE];
  return out;
}

/** The /playtest sheet's own fields (the CLI's, not the page's): target, map and online. */
const PLAYTEST_FIELDS: readonly { key: string; kind: 'flag' | 'string'; meaning: string; absent: string }[] = [
  { key: 'target', kind: 'string', meaning: 'What the session runs: current (this checkout), main, or a branch or ref with its own worktree.', absent: PLAYTEST_DEFAULTS.target },
  { key: 'map', kind: 'string', meaning: 'The map, by its name or its stem; the CLI resolves a name (the address needs the stem).', absent: PLAYTEST_DEFAULTS.map },
  { key: 'online', kind: 'flag', meaning: 'The session\'s own match server, which records every room, with its own accounts: one per window, made at the page (--online).', absent: 'offline' },
];

export function mountLaunchSettings(o: LaunchSheetOptions): LaunchSheetMount {
  const doc = o.doc;
  const view = doc.defaultView;
  const playtest = o.mode === 'playtest';
  const presets = new LaunchPresets(o.store === undefined ? pageSettings : o.store, o.mode);
  const navigate = o.navigate ?? ((a: string) => view?.location.assign(a));
  const fetchFn = o.fetch === undefined ? (view && typeof view.fetch === 'function' ? view.fetch.bind(view) : null) : o.fetch;
  const clipboard = o.clipboard === undefined ? (view?.navigator.clipboard ?? null) : o.clipboard;

  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] => {
    const e = doc.createElement(tag);
    if (cls) e.className = cls;
    if (text) e.textContent = text;
    return e;
  };
  const option = (text: string, value: string): HTMLOptionElement => {
    const opt = el('option', '', text);
    opt.value = value;
    return opt;
  };
  const button = (action: string, text: string, type: 'button' | 'submit' = 'button'): HTMLButtonElement => {
    const b = el('button', 's2u-tab', text);
    b.type = type;
    b.dataset['action'] = action;
    return b;
  };
  const panel = (group: string, title: string): { section: HTMLElement; body: HTMLElement } => {
    const section = el('section', 's2u-panel');
    section.dataset['group'] = group;
    const head = el('h2', 's2u-panel__head', title);
    const body = el('div', 's2u-panel__body');
    section.append(head, body);
    return { section, body };
  };
  const controls = new Map<string, Control>();
  const noteText = (p: { meaning: string; absent: string; needsDevmode?: true }): string =>
    `${p.meaning}${p.needsDevmode ? ' With devmode, or with flyok for fly and devtools for the tools.' : ''} Not set: ${p.absent}.`;
  /** A field for a row: a check for a flag, a select for an enum, a text box else; its meaning and its default under it. */
  const field = (p: Pick<LaunchParam, 'key' | 'kind' | 'meaning' | 'absent'> & { values?: readonly string[]; needsDevmode?: true }, opts?: { title?: string; hint?: string }): HTMLElement => {
    const box = el('div', 's2u-field');
    const id = `launch-settings-${p.key}`;
    const title = opts?.title ?? p.key;
    let control: Control;
    if (p.kind === 'flag') {
      const label = el('label', 's2u-check');
      const input = el('input');
      input.type = 'checkbox';
      label.append(input, el('span', '', title));
      box.append(label);
      control = input;
    } else {
      const label = el('label', 's2u-field__label', title);
      label.htmlFor = id;
      if (p.kind === 'enum') {
        const select = el('select');
        select.append(option(`(not set: ${p.absent})`, ''), ...(p.values ?? []).map((v) => option(v, v)));
        control = select;
      } else {
        const input = el('input');
        input.type = 'text';
        if (p.kind === 'number') input.inputMode = 'decimal';
        input.placeholder = `not set: ${p.absent}`;
        input.spellcheck = false;
        input.autocomplete = 'off';
        control = input;
      }
      box.append(label, control);
    }
    control.id = id;
    control.dataset['key'] = p.key;
    const shown = el('p', 's2u-field__note', opts?.hint ?? noteText(p));
    shown.id = `${id}-note`;
    control.setAttribute('aria-describedby', shown.id);
    box.append(shown);
    if (opts?.hint) {
      const more = el('details', 's2u-disclosure');
      more.append(el('summary', '', 'Full description'), el('p', 's2u-field__note', noteText(p)));
      box.append(more);
    }
    controls.set(p.key, control);
    return box;
  };

  // ---- the page
  for (const child of Array.from(doc.body.children)) child.remove();
  const root = el('div');
  root.id = 'launch-settings';
  root.dataset['adaptation'] = LAUNCH_SETTINGS_ADAPTATION;
  root.dataset['mode'] = o.mode;
  const main = el('main', 's2u-section');
  main.setAttribute('aria-labelledby', 'launch-settings-title');
  const head = el('header', 's2u-head');
  const title = el('h1', 's2u-title', 'Launch settings');
  title.id = 'launch-settings-title';
  head.append(title, el('p', 's2u-kicker', playtest ? 'Playtest · development build' : 'Test room · development build'));
  let servedNote: HTMLElement | null = null;
  let discChip: HTMLElement | null = null;
  let discWord: HTMLElement | null = null;
  let onlineChip: HTMLElement | null = null;
  let onlineWord: HTMLElement | null = null;
  if (!playtest) {
    const strip = el('div', 's2u-tabs');
    strip.dataset['role'] = 'status-strip';
    strip.setAttribute('role', 'group');
    strip.setAttribute('aria-label', 'Status');
    discChip = el('span', 's2u-chip is-reading');
    discChip.dataset['role'] = 'disc-status';
    discWord = el('span', 's2u-chip__word', 'Disc: checking');
    discChip.append(el('span', 's2u-lamp s2u-lamp--small s2u-chip__lamp'), discWord);
    onlineChip = el('span', 's2u-chip is-wait');
    onlineChip.dataset['role'] = 'online-status';
    onlineWord = el('span', 's2u-chip__word', 'Online: not set');
    onlineChip.append(el('span', 's2u-lamp s2u-lamp--small s2u-chip__lamp'), onlineWord);
    strip.append(discChip, onlineChip);
    head.append(strip);
  }
  head.append(el('p', 's2u-lede', playtest
    ? 'A playtest session\'s choices, the command that starts it, and a launch into the session when its service answers. A browser adaptation: the page\'s own switches, nothing of the game.'
    : 'Choose a mode and a map, then launch. The other switches are under Advanced, each with what it does. A browser adaptation: the page\'s own switches, nothing of the game.'));
  const form = el('form');
  form.noValidate = true;

  // ---- launch: the address, (the command), the buttons, the lines
  const addressBox = el('div', 's2u-field');
  const addressLabel = el('label', 's2u-field__label', 'Address');
  const addressOut = el('input');
  addressOut.type = 'text'; addressOut.readOnly = true; addressOut.id = 'launch-settings-address'; addressOut.dataset['role'] = 'address';
  addressLabel.htmlFor = addressOut.id;
  addressLabel.classList.add('s2u-visually-hidden');
  addressBox.dataset['density'] = 'compact';
  addressBox.append(addressLabel, addressOut);
  const launchButton = button('launch', 'Launch', 'submit');
  const copyButton = button('copy', 'Copy address');
  const status = el('p', 's2u-status');
  status.dataset['role'] = 'status';
  status.setAttribute('role', 'status');
  let commandOut: HTMLInputElement | null = null;
  let serviceLine: HTMLElement | null = null;
  let recentList: HTMLElement | null = null;
  let recentsWrap: HTMLElement | null = null;

  // ---- presets (their own form: Enter in "Save as" saves, and never launches)
  const presetPanel = panel('presets', 'Presets');
  const pickBox = el('div', 's2u-field');
  const pickLabel = el('label', 's2u-field__label', 'Preset');
  const pick = el('select');
  pick.id = 'launch-settings-presets'; pick.dataset['role'] = 'presets';
  pickLabel.htmlFor = pick.id;
  pickBox.append(pickLabel, pick);
  const nameBox = el('div', 's2u-field');
  const nameLabel = el('label', 's2u-field__label', 'Save as');
  const name = el('input');
  name.type = 'text'; name.id = 'launch-settings-preset-name'; name.dataset['role'] = 'preset-name'; name.autocomplete = 'off';
  nameLabel.htmlFor = name.id;
  nameBox.append(nameLabel, name);
  const presetForm = el('form');
  presetForm.id = 'launch-settings-presets-form';
  presetForm.noValidate = true;
  name.setAttribute('form', presetForm.id);
  const saveButton = button('save', 'Save', 'submit');
  saveButton.setAttribute('form', presetForm.id);
  const presetButtons = el('div', 's2u-tabs');
  presetButtons.append(button('load', 'Load'), saveButton, button('delete', 'Delete'));
  presetPanel.body.append(pickBox, nameBox, presetButtons);

  if (playtest) {
    const launchPanel = panel('launch', 'Launch');
    launchPanel.body.append(addressBox);
    const box = el('div', 's2u-field');
    const label = el('label', 's2u-field__label', 'Command (run from socomlegacy/)');
    commandOut = el('input');
    commandOut.type = 'text'; commandOut.readOnly = true; commandOut.id = 'launch-settings-command'; commandOut.dataset['role'] = 'command';
    label.htmlFor = commandOut.id;
    box.append(label, commandOut);
    serviceLine = el('p', 's2u-status', `Asking for a session service on ${PLAYTEST_SERVICE_PORT} ...`);
    serviceLine.dataset['role'] = 'service';
    const buttons = el('div', 's2u-tabs');
    buttons.append(launchButton, copyButton, button('copy-command', 'Copy command'));
    launchPanel.body.append(box, serviceLine, buttons, status);
    const grid = el('div', 's2u-cards--2');
    grid.append(launchPanel.section, presetPanel.section);
    const session = panel('session', 'Session');
    for (const f of PLAYTEST_FIELDS) session.body.append(field(f));
    const options = panel('options', 'Options (--opt)');
    for (const p of playtestOptionRows()) options.body.append(field(p));
    grid.append(session.section, options.section);
    form.append(grid);
  } else {
    launchButton.classList.add('s2u-start', 's2u-start--large', 'is-armed');
    const modes = panel('modes', 'Mode');
    const modeList = el('ul', 's2u-tiles');
    modeList.dataset['role'] = 'modes';
    modeList.setAttribute('aria-label', 'Mode');
    for (const mode of LAUNCH_MODES) {
      const control = button('mode', '');
      control.dataset['mode'] = mode.id;
      control.setAttribute('aria-pressed', 'false');
      control.append(el('span', 's2u-visually-hidden', `${mode.title}. ${mode.hint}`));
      const text = el('div', 's2u-tile__text');
      text.setAttribute('aria-hidden', 'true');
      text.append(el('h3', '', mode.title), el('p', '', mode.hint));
      const li = el('li', 's2u-tile');
      li.append(text, control);
      modeList.append(li);
    }
    modes.body.append(modeList);

    const maps = panel('where', 'Map');
    maps.section.dataset['panel'] = 'maps';
    const mapList = el('ul', 's2u-tiles');
    mapList.dataset['role'] = 'maps';
    mapList.setAttribute('aria-label', 'Map');
    for (const map of launchMaps()) {
      const control = button('map', '');
      control.dataset['map'] = map.stem;
      control.setAttribute('aria-pressed', 'false');
      control.append(el('span', 's2u-visually-hidden', `${map.name}, ${map.mode}, ${map.stem}`));
      const frame = el('div', 's2u-tile__frame is-blank');
      frame.setAttribute('aria-hidden', 'true');
      frame.append(el('span', '', map.name));
      const li = el('li', 's2u-tile');
      li.append(frame, control);
      mapList.append(li);
    }
    const mapRow = sheetRows().find((p) => p.key === 'map')!;
    maps.body.append(mapList, field(mapRow, { title: TITLES['map'], hint: HINTS['map'] }));

    const options = panel('where', 'Options');
    options.section.dataset['panel'] = 'options';
    const optionGrid = el('div', 's2u-cards--2');
    optionGrid.dataset['role'] = 'options';
    for (const row of sheetRows()) {
      if (row.key === DEV_BUNDLE || !PRIMARY_KEYS.has(row.key)) continue;
      const box = field(row, { title: TITLES[row.key] ?? row.key, hint: HINTS[row.key] });
      if (row.key === 'served') {
        servedNote = el('p', 's2u-field__note', SERVED_MAPS_MISSING);
        servedNote.dataset['role'] = 'served-warning';
        servedNote.hidden = true;
        box.append(servedNote);
      }
      optionGrid.append(box);
    }
    options.body.append(optionGrid);

    const advanced = el('details', 's2u-disclosure');
    advanced.dataset['role'] = 'advanced';
    const advancedCount = sheetRows().filter((p) => p.key !== 'map' && p.key !== DEV_BUNDLE && !PRIMARY_KEYS.has(p.key)).length;
    const summary = el('summary', '', 'Advanced');
    summary.append(el('span', 's2u-field__note', `${advancedCount} more switches, and presets`));
    advanced.append(summary);
    for (const g of PARAM_GROUPS) {
      const rows = sheetRows().filter((p) => p.group === g.id && p.key !== 'map' && p.key !== DEV_BUNDLE && !PRIMARY_KEYS.has(p.key));
      if (rows.length === 0) continue;
      const group = panel(g.id, g.title);
      for (const row of rows) group.body.append(field(row, { title: TITLES[row.key] ?? row.key }));
      advanced.append(group.section);
    }
    advanced.append(presetPanel.section);

    const bar = el('section', 's2u-panel');
    bar.dataset['role'] = 'launch-bar';
    bar.setAttribute('aria-label', 'Launch');
    const barBody = el('div', 's2u-panel__body');
    const addressLine = el('div');
    addressLine.dataset['role'] = 'address-line';
    addressLine.append(addressBox, copyButton);
    recentsWrap = el('div');
    recentsWrap.dataset['role'] = 'recents';
    recentsWrap.hidden = true;
    recentsWrap.append(el('p', 's2u-kicker', 'Recent'));
    recentList = el('div', 's2u-tabs');
    recentList.dataset['role'] = 'recent-list';
    recentsWrap.append(recentList);
    barBody.append(launchButton, addressLine, recentsWrap, status);
    bar.append(barBody);
    const stage = el('div');
    stage.dataset['role'] = 'stage';
    stage.append(maps.section, options.section);
    form.append(modes.section, stage, advanced, bar);
  }
  main.append(head, form, presetForm);
  root.append(main);
  doc.body.append(root);

  // ---- the values
  const read = (): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const [key, c] of controls) {
      if (c instanceof HTMLInputElement && c.type === 'checkbox') { if (c.checked) out[key] = ''; }
      else if (c.value.trim() !== '') out[key] = c.value.trim();
    }
    return playtest ? out : collapseDev(out);
  };
  const fill = (values: Readonly<Record<string, string>>): void => {
    const src = playtest ? values : expandDev(values);
    for (const [key, c] of controls) {
      const v = src[key];
      if (c instanceof HTMLInputElement && c.type === 'checkbox') c.checked = v !== undefined && v !== 'off';
      else c.value = v ?? '';
    }
  };
  /** Served maps are on: the bare `devmode` (all three) or the served switch alone. */
  const servedOn = (values: LaunchValues): boolean => values['devmode'] !== undefined || values['served'] !== undefined;
  /** `maps/index.json`: true answers, false does not, null not asked yet. */
  let mapsAnswer: boolean | null = null;
  let mapsWait: Promise<boolean> | null = null;
  const paintServed = (): void => {
    if (!servedNote) return;
    servedNote.hidden = !(servedOn(read()) && mapsAnswer === false);
  };
  const ensureMaps = (): boolean | Promise<boolean> => {
    if (mapsAnswer !== null) return mapsAnswer;
    if (mapsWait) return mapsWait;
    const ask = o.maps ?? (() => servedTree(o.base));
    try {
      const result = ask();
      if (result instanceof Promise) {
        mapsWait = result.then((ok) => {
          mapsAnswer = ok === true;
          if (!stopped) paintServed();
          return mapsAnswer;
        }, () => {
          mapsAnswer = false;
          if (!stopped) paintServed();
          return false;
        });
        return mapsWait;
      }
      mapsAnswer = result === true;
      return mapsAnswer;
    } catch {
      mapsAnswer = false;
      return false;
    }
  };
  /** The running online session's page (its record's `launch.url`), once the probe has found one: the join. */
  let join: { id: string; url: string } | null = null;
  const address = (): string => (join ? join.url : playtest ? playtestAddress(o.base, choiceOfValues(read())) : testRoomAddress(o.base, read()));
  const command = (): string | null => (playtest ? cliCommand(choiceOfValues(read())) : null);
  const onlineLine = (values: LaunchValues): string => {
    if (values['server']) return `Server: ${values['server']}`;
    if (values['mp'] !== undefined) return 'Online: this host';
    if (values['online'] === 'local') return 'Online: local';
    if (values['online'] === 'shared') return 'Online: shared';
    if (values['online'] === 'off') return 'Online: off';
    return 'Online: not set';
  };
  const paintOnline = (values: LaunchValues): void => {
    if (!onlineChip || !onlineWord) return;
    const line = onlineLine(values);
    onlineWord.textContent = line;
    onlineChip.title = line;
    onlineChip.classList.remove('is-live', 'is-empty', 'is-wait');
    if (values['server'] || values['mp'] !== undefined || values['online'] === 'local' || values['online'] === 'shared') onlineChip.classList.add('is-live');
    else if (values['online'] === 'off') onlineChip.classList.add('is-empty');
    else onlineChip.classList.add('is-wait');
  };
  const paintModes = (values: LaunchValues): void => {
    const on = activeMode(values);
    for (const b of root.querySelectorAll<HTMLButtonElement>('[data-mode]')) b.setAttribute('aria-pressed', String(b.dataset['mode'] === on));
    const stem = (values['map'] ?? '').toUpperCase();
    for (const b of root.querySelectorAll<HTMLButtonElement>('[data-map]')) b.setAttribute('aria-pressed', String(b.dataset['map'] === stem));
  };
  const recentLabel = (values: LaunchValues): string => {
    const stem = (values['map'] ?? '').toUpperCase();
    const map = launchMaps().find((m) => m.stem === stem);
    const where = map ? map.name : (values['map'] || 'No map');
    const mode = activeMode(values);
    const how = mode ? LAUNCH_MODES.find((m) => m.id === mode)!.title : (values['mode'] || 'Custom');
    return `${where} · ${how}`;
  };
  const listRecents = (): void => {
    if (!recentList || !recentsWrap) return;
    const items = presets.recent();
    recentList.replaceChildren();
    recentsWrap.hidden = items.length === 0;
    for (const [i, values] of items.entries()) {
      const b = el('button', 's2u-tab s2u-chip');
      b.type = 'button';
      b.dataset['action'] = 'recent';
      b.dataset['recent'] = String(i);
      b.title = testRoomAddress(o.base, values);
      b.append(el('span', 's2u-chip__word', recentLabel(values)));
      recentList.append(b);
    }
  };
  const refresh = (): void => {
    addressOut.value = address();
    if (commandOut) commandOut.value = command() ?? '';
    if (playtest) launchButton.textContent = join ? `Join the running session (${join.id})` : 'Launch without a session';
    else {
      const values = read();
      paintModes(values);
      paintOnline(values);
      if (servedOn(values)) ensureMaps();
      paintServed();
    }
  };
  const listPresets = (): void => {
    const chosen = pick.value;
    pick.replaceChildren(option('(choose a preset)', ''), ...presets.names().map((n) => option(n, n)));
    pick.value = presets.names().includes(chosen) ? chosen : '';
  };
  status.hidden = true;
  const say = (text: string): void => { status.textContent = text; status.hidden = text === ''; };

  // The start: the fields the address names, else the last used, else nothing set (the page's own defaults).
  const rows = playtest ? [launchParam('map')!, launchParam('online')!, ...playtestOptionRows()] : sheetRows();
  const asked = valuesOfSearch(o.search, rows);
  const start = Object.keys(asked).length > 0 ? asked : presets.lastUsed() ?? {};
  fill(playtest ? valuesOfChoice(choiceOfValues(start)) : start);
  listPresets();
  listRecents();
  refresh();

  form.addEventListener('input', refresh);
  form.addEventListener('change', refresh);
  const go = (values: Record<string, string>): void => {
    presets.setLastUsed(values);
    if (!playtest) { presets.remember(values); listRecents(); }
    navigate(address());
  };
  const refuseServed = (): void => {
    paintServed();
    say('Served maps were asked for, but maps/index.json did not answer. Launch stays on this page.');
  };
  const launch = (): void => {
    const values = read();
    if (!playtest && servedOn(values)) {
      const ready = ensureMaps();
      if (ready === false) { refuseServed(); return; }
      if (ready !== true) {
        void ready.then((ok) => { if (stopped) return; if (ok) go(read()); else refuseServed(); });
        return;
      }
    }
    go(values);
  };
  form.addEventListener('submit', (e) => { e.preventDefault(); launch(); });
  const save = (): void => {
    const n = name.value.trim() || pick.value;
    if (!n) { say('Name the preset first.'); return; }
    const kept = presets.save(n, read());
    listPresets();
    pick.value = n;
    say(kept ? `Preset "${n}" saved.` : `Preset "${n}" kept for this visit only: the browser's storage did not take it (not kept).`);
  };
  presetForm.addEventListener('submit', (e) => { e.preventDefault(); save(); });
  const copy = (text: string, box: HTMLInputElement, what: string): void => {
    const done = (): void => say(`${what} copied.`);
    const select = (): void => { box.focus(); box.select(); say(`${what} selected: copy it with the browser's copy.`); };
    if (!clipboard) { select(); return; }
    try { clipboard.writeText(text).then(done, select); } catch { select(); }
  };
  const chooseMode = (id: LaunchModeId): void => { fill(applyMode(id, read())); refresh(); };
  form.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement | null)?.closest<HTMLButtonElement>('button[data-action]');
    if (!b || b.type === 'submit') return;
    const action = b.dataset['action'];
    if (action === 'copy') copy(new URL(address(), view?.location.href ?? doc.baseURI).href, addressOut, 'Address');
    else if (action === 'copy-command' && commandOut) copy(command() ?? '', commandOut, 'Command');
    else if (action === 'mode' && b.dataset['mode'] && isLaunchMode(b.dataset['mode'])) chooseMode(b.dataset['mode']);
    else if (action === 'map' && b.dataset['map']) {
      const map = controls.get('map');
      if (map) { map.value = b.dataset['map']; refresh(); }
    }
    else if (action === 'recent') {
      const values = presets.recent()[Number(b.dataset['recent'])];
      if (!values) return;
      fill(values);
      refresh();
      launch();
    } else if (action === 'load') {
      const v = pick.value ? presets.load(pick.value) : null;
      if (!v) { say('Choose a preset to load.'); return; }
      fill(playtest ? valuesOfChoice(choiceOfValues(v)) : v);
      name.value = pick.value;
      refresh();
      say(`Preset "${pick.value}" loaded.`);
    } else if (action === 'delete') {
      const n = pick.value;
      if (!n) { say('Choose a preset to delete.'); return; }
      const kept = presets.remove(n);
      listPresets();
      say(kept ? `Preset "${n}" deleted.` : `Preset "${n}" deleted for this visit only (not kept).`);
    }
  });

  // ---- /playtest: the service, asked quietly; the sheet works before (and without) its answer
  let stopped = false;
  const service = playtest ? probeService(fetchFn, PLAYTEST_SERVICE_PORT).then((found) => {
    const up = found !== null;
    if (stopped) return up;
    join = found && found.online && found.url ? { id: found.id, url: found.url } : null;
    if (serviceLine) {
      serviceLine.textContent = !found
        ? `No session service answers on ${PLAYTEST_SERVICE_PORT}: run the command above from socomlegacy/ to start one, then reopen this page -- or launch the test room without a session.`
        : join
          ? `Session ${found.id} answers on ${PLAYTEST_SERVICE_PORT}: Join opens its page as the CLI printed it -- its map, its options and its server. The command above starts a new session instead.`
          : !found.online
            ? `Session ${found.id} answers on ${PLAYTEST_SERVICE_PORT}, and the running session is offline: its page is the one \`start\` opened. The command above starts a new session.`
            : `Session ${found.id} answers on ${PLAYTEST_SERVICE_PORT}, but its record names no page on this host to join. The command above starts a new session.`;
    }
    refresh();
    return up;
  }) : Promise.resolve(false);

  const paintDisc = (state: ExtractionState | 'unknown'): void => {
    if (!discChip || !discWord) return;
    const word = state === 'whole' ? 'Disc loaded' : state === 'partial' ? 'Disc partial' : state === 'evicted' ? 'Disc evicted' : state === 'unknown' ? 'Disc unknown' : 'No disc loaded';
    discWord.textContent = word;
    discChip.classList.remove('is-reading', 'is-ready', 'is-empty', 'is-error');
    discChip.classList.add(state === 'whole' ? 'is-ready' : state === 'partial' ? 'is-reading' : state === 'none' ? 'is-empty' : 'is-error');
  };
  if (!playtest) {
    const readDisc = o.disc ?? (() => extractionState());
    void Promise.resolve().then(readDisc).then((state) => { if (!stopped) paintDisc(state); }, () => { if (!stopped) paintDisc('unknown'); });
  }

  // ---- the pad, in the setup page's way
  const nav = new StartupNavigation(root, () => false);
  const pads = o.pads ?? ((): ArrayLike<PadLike | null> => (view?.navigator.getGamepads?.() ?? []) as ArrayLike<PadLike | null>);
  let raf = 0;
  const frame = (): void => {
    if (stopped) return;
    let pad: PadLike | null = null;
    try { pad = Array.from(pads()).find((p): p is PadLike => !!p?.connected && p.mapping === 'standard') ?? null; } catch { pad = null; }
    nav.frame(pad, view?.performance.now() ?? Date.now(), false);
    raf = view?.requestAnimationFrame(frame) ?? 0;
  };
  if (typeof view?.requestAnimationFrame === 'function') raf = view.requestAnimationFrame(frame);

  return {
    root, address, command, service, launch,
    stop: () => { stopped = true; if (raf) view?.cancelAnimationFrame?.(raf); },
  };
}
