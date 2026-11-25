/**
 * Edit > Preferences: the shortcut editor (the owner, 2026-11-20: "a shortcut editor in the preferences ... fully
 * customize what shortcuts they can use for each command ... a warning if they are overriding another shortcut or
 * conflicts with another shortcut ... a single button that resets the shortcuts to our default settings ... a per
 * command reset button. If the reset conflicts with another command, ask the user if they are sure"; "if they try to
 * have a shortcut that conflicts with their native browser shortcut, give a warning"). A browser adaptation, the game
 * has no editor. Every command of the shortcut list (`./shortcuts`), two keys each, set by pressing them; the list's
 * clash and browser checks before a key is kept; Undo, Export and Import; the keys that are not commands listed, greyed.
 */
import {
  chordLabel, chordOf, clashesFor, customCount, exportShortcuts, FIXED_KEYS, importShortcuts, isCustom, keyIssues, keysLabel,
  keysOf, onShortcutsChange, pauseKeys, resetAllKeys, setKeysTogether, SHORTCUT_COMMANDS, undoKeyChange, canUndoKeyChange,
  type ShortcutCommand, type ShortcutScope,
} from './shortcuts';
import {
  baseOf, CUSTOM_TOKENS, customTheme, exportCustomTheme, FORGE_THEMES, forgeTheme, importCustomTheme, onForgeThemeChange,
  paintCustom, setCustomTheme, setForgeTheme, tokenValueOk, type BaseTheme, type CustomTheme, type ForgeTheme,
} from './theme';
import { propRow, subsection } from './panels/propGrid';

/** Where a command applies, as the list says it. */
const SCOPE_WORDS: Record<ShortcutScope, string> = {
  forge: 'Forge editor', 'geo:object': 'Object', 'geo:point': 'Vertex', 'geo:edge': 'Edge', 'geo:face': 'Face', walk: 'Walk / Play',
  fly: 'Camera, right mouse held', outliner: 'Outliner', 'tool:knife': 'Knife', 'tool:line': 'Clip and Mirror', 'tool:clip': 'Clip',
  'tool:create': 'Create', 'tool:polygon': 'Polygon', 'tool:paint': 'Paint',
};
export function whereWords(cmd: ShortcutCommand): string {
  const geo = cmd.scopes.filter((s) => s.startsWith('geo:'));
  const rest = cmd.scopes.filter((s) => !s.startsWith('geo:'));
  if (cmd.scopes.includes('forge') && geo.length === 4) return 'Everywhere in the editor';
  const parts = rest.map((s) => SCOPE_WORDS[s]);
  if (geo.length === 4) parts.push('Geometry: every mode');
  else if (geo.length) parts.push(`Geometry: ${geo.map((s) => SCOPE_WORDS[s]).join(', ')}`);
  return parts.join(' · ');
}

let open: { close: () => void } | null = null;

/** The editor opened over the page (one at a time; opening it again brings it to the front). */
export function openShortcutEditor(doc: Document): void {
  if (open) return;
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] => {
    const e = doc.createElement(tag);
    if (cls) e.className = cls;
    if (text) e.textContent = text;
    return e;
  };
  const button = (text: string, title: string, run: () => void, cls = 'fx-tool'): HTMLButtonElement => {
    const b = el('button', cls, text);
    b.type = 'button';
    b.title = title;
    b.addEventListener('click', run);
    return b;
  };

  const modal = el('div', 'fx-modal fx-prefs-modal');
  const card = el('div', 'fx-card fx-prefs');
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-label', 'Preferences');
  const head = el('header');
  const title = el('h2', '', 'Preferences');
  // Two pages (the owner, 2026-11-24: "a dark mode setting in the preferences"): Appearance, then the shortcuts.
  const tabs = el('div', 'fx-prefs-tabs');
  tabs.setAttribute('role', 'tablist');
  const tabButton = (label: string): HTMLButtonElement => {
    const b = el('button', 'fx-prefs-tab', label);
    b.type = 'button';
    b.setAttribute('role', 'tab');
    tabs.append(b);
    return b;
  };
  const appearanceTab = tabButton('Appearance');
  const shortcutsTab = tabButton('Shortcuts');
  const changed = el('span', 'fx-prefs-count');
  head.append(title, tabs, changed);

  // Appearance: the themes, each a card with the editor drawn small in its own colours (`./themes.css`).
  const appearance = el('div', 'fx-prefs-pane fx-prefs-appearance');
  appearance.setAttribute('role', 'tabpanel');
  appearance.append(el('h3', 'fx-prefs-group', 'Theme'));
  const themeRow = el('div', 'fx-theme-cards');
  themeRow.setAttribute('role', 'radiogroup');
  themeRow.setAttribute('aria-label', 'Theme');
  const themeCards = new Map<ForgeTheme, HTMLButtonElement>();
  const swatches = new Map<ForgeTheme, HTMLDivElement>();
  for (const t of FORGE_THEMES) {
    const c = el('button', 'fx-theme-card');
    c.type = 'button';
    c.setAttribute('role', 'radio');
    c.title = t.note;
    const sw = el('div', 'fx-theme-swatch');
    sw.dataset['theme'] = t.id === 'custom' ? baseOf('custom') : t.id;
    sw.setAttribute('aria-hidden', 'true');
    swatches.set(t.id, sw);
    // A toolbar, a dock of rows (one selected), the viewport with a selected box, a dock of fields.
    const top = el('div', 'sw-top');
    top.append(el('i', 'sw-logo'), el('i', 'sw-pill'), el('i', 'sw-pill'), el('i', 'sw-pill sw-accent'));
    const left = el('div', 'sw-dock');
    for (let i = 0; i < 6; i++) left.append(el('i', i === 2 ? 'sw-row is-on' : 'sw-row'));
    const view = el('div', 'sw-view');
    view.append(el('i', 'sw-box'));
    const right = el('div', 'sw-dock');
    for (let i = 0; i < 4; i++) right.append(el('i', 'sw-field'));
    const body = el('div', 'sw-body');
    body.append(left, view, right);
    sw.append(top, body);
    const words = el('div', 'fx-theme-words');
    words.append(el('span', 'fx-theme-name', t.label), el('span', 'fx-theme-note', t.note));
    c.append(sw, words);
    c.addEventListener('click', () => { setForgeTheme(doc, t.id); });
    themeCards.set(t.id, c);
    themeRow.append(c);
  }
  appearance.append(themeRow, el('p', 'fx-theme-help', 'Kept in this browser, never in a map. The game\u2019s own screens (Play, the menus) keep their look.'));

  // The custom theme's editor (the owner, 2026-11-25: "a custom mode where we can edit our own custom styles for colors,
  // etc. Like the shortcuts allow the user to import/export their stylesheet via json"): its base, then a row a token --
  // its colour picked or typed, its reset -- and Import, Export and Reset all. Shown while Custom is the theme.
  const customPane = el('div', 'fx-theme-custom');
  const customHead = el('div', 'fx-prefs-bar');
  const baseSel = el('select', 'fx-select');
  baseSel.setAttribute('aria-label', 'Custom theme: start from');
  for (const t of FORGE_THEMES.filter((x) => x.id !== 'custom')) { const o = el('option', '', t.label); o.value = t.id; baseSel.append(o); }
  baseSel.addEventListener('change', () => { setCustomTheme(doc, { ...customTheme(), base: baseSel.value as BaseTheme }); });
  const themeFile = el('input');
  themeFile.type = 'file';
  themeFile.accept = '.json,application/json';
  themeFile.hidden = true;
  const themeMsg = el('p', 'fx-theme-msg');
  themeMsg.setAttribute('role', 'status');
  const tell = (text: string, kind: 'info' | 'error' = 'info'): void => { themeMsg.textContent = text; themeMsg.dataset['kind'] = kind; };
  themeFile.addEventListener('change', () => {
    const f = themeFile.files?.[0];
    themeFile.value = '';
    if (!f) return;
    void f.text().then((text) => {
      const r = importCustomTheme(text);
      if (!r.ok) { tell(r.error, 'error'); return; }
      setCustomTheme(doc, r.theme);
      setForgeTheme(doc, 'custom');
      const n = Object.keys(r.theme.vars).length;
      tell(`Imported: ${n} value${n === 1 ? '' : 's'} over ${nameOf(r.theme.base)}${r.dropped ? ` (${r.dropped} not recognised, left out)` : ''}`);
    });
  });
  const themeImport = button('Import…', 'Read a theme from a file you exported (it becomes your custom theme)', () => themeFile.click());
  const themeExport = button('Export…', 'Save your custom theme to a file, to keep it or use it in another browser', () => {
    const blob = new Blob([exportCustomTheme()], { type: 'application/json' });
    const a = el('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'forge-theme.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    tell('Exported to forge-theme.json');
  });
  const themeReset = button('Reset all', 'Every value back to the base theme\u2019s', () => { setCustomTheme(doc, { ...customTheme(), vars: {} }); tell('Every value back to the base theme\u2019s'); }, 'fx-tool fx-danger');
  const startLabel = el('label', 'fx-prefs-filter', 'Start from ');
  startLabel.append(baseSel);
  customHead.append(startLabel, el('span', 'fx-prefs-spacer'), themeImport, themeExport, themeReset, themeFile);
  const customGroups = el('div', 'fx-subfolds fx-theme-tokens');
  /** The base theme's own values, read off a hidden miniature of it (`./themes.css` swatch scopes), never the page's. */
  const probe = el('div', 'fx-theme-swatch fx-theme-probe');
  probe.setAttribute('aria-hidden', 'true');
  customPane.append(el('h3', 'fx-prefs-group', 'Custom theme'), customHead, themeMsg, customGroups, probe);
  appearance.append(customPane);
  const nameOf = (b: BaseTheme): string => FORGE_THEMES.find((t) => t.id === b)?.label ?? b;
  const baseValue = (name: string): string => getComputedStyle(probe).getPropertyValue(name).trim();
  /** A colour as the picker's `#rrggbb` (its alpha dropped), through the canvas's own parser. */
  const ctx = doc.createElement('canvas').getContext('2d');
  const hexOf = (v: string): string => {
    if (!ctx) return '#000000';
    ctx.fillStyle = '#000000';
    ctx.fillStyle = v;
    const f = String(ctx.fillStyle);
    if (f.startsWith('#')) return f.slice(0, 7);
    const m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)/.exec(f);
    return m ? `#${[m[1], m[2], m[3]].map((x) => Math.round(Number(x)).toString(16).padStart(2, '0')).join('')}` : '#000000';
  };
  const setVar = (name: string, value: string | null): void => {
    const c: CustomTheme = customTheme();
    const vars = { ...c.vars };
    if (value === null) delete vars[name]; else vars[name] = value;
    setCustomTheme(doc, { ...c, vars });
  };
  const drawCustom = (): void => {
    const c = customTheme();
    baseSel.value = c.base;
    probe.dataset['theme'] = c.base;
    const tables = new Map<string, HTMLElement>();
    customGroups.replaceChildren();
    for (const t of CUSTOM_TOKENS) {
      let table = tables.get(t.group);
      if (!table) { const sub = subsection(doc, t.group); customGroups.append(sub.fold); table = sub.table; tables.set(t.group, table); }
      const own = c.vars[t.name];
      const value = own ?? baseValue(t.name);
      const text = el('input', 'fx-search fx-theme-value');
      text.type = 'text';
      text.value = value;
      text.spellcheck = false;
      text.setAttribute('aria-label', `${t.label}: value`);
      text.title = t.kind === 'length' ? 'A length in px, as 6px' : 'Any CSS colour: #rrggbb, #rrggbbaa, rgb(), hsl()';
      text.addEventListener('change', () => {
        const v = text.value.trim();
        if (!tokenValueOk(t, v)) { text.classList.add('is-bad'); tell(`${t.label}: ${t.kind === 'length' ? 'a length in px, as 6px' : 'not a colour'}`, 'error'); return; }
        text.classList.remove('is-bad');
        setVar(t.name, v);
      });
      const controls: HTMLElement[] = [];
      if (t.kind === 'colour') {
        const pick = el('input', 'fx-theme-colour');
        pick.type = 'color';
        pick.value = hexOf(value);
        pick.setAttribute('aria-label', t.label);
        // A preview while it moves; kept on its release.
        pick.addEventListener('input', () => { text.value = pick.value; doc.body.style.setProperty(t.name, pick.value); });
        pick.addEventListener('change', () => setVar(t.name, pick.value));
        controls.push(pick);
      }
      const reset = button('Reset', `Back to ${nameOf(c.base)}\u2019s value`, () => setVar(t.name, null), 'fx-chip fx-setting-reset fx-theme-reset');
      reset.disabled = own === undefined;
      controls.push(text, reset);
      const row = propRow(doc, t.label, ...controls);
      row.classList.toggle('is-own', own !== undefined);
      table.append(row);
    }
  };
  const drawThemes = (): void => {
    const now = forgeTheme();
    for (const [id, c] of themeCards) { c.classList.toggle('is-on', id === now); c.setAttribute('aria-checked', String(id === now)); }
    // The Custom card's miniature in its own colours: its base's, its values over them.
    const sw = swatches.get('custom');
    if (sw) { sw.dataset['theme'] = baseOf('custom'); paintCustom(sw, customTheme()); }
    customPane.hidden = now !== 'custom';
    if (now === 'custom') drawCustom();
  };
  drawThemes();
  const offTheme = onForgeThemeChange(drawThemes);

  // The bar: search, find by key, filters, then Undo, Import, Export, Reset all.
  const bar = el('div', 'fx-prefs-bar');
  const search = el('input', 'fx-search');
  search.type = 'search';
  search.placeholder = 'Search commands or keys…';
  search.setAttribute('aria-label', 'Search the shortcuts');
  let findChord: string | null = null;
  const findBtn = button('Find by key', 'Press a key or chord to list every command on it', () => record({ find: true }));
  const filterBox = (label: string, tip: string): HTMLInputElement => {
    const l = el('label', 'fx-prefs-filter');
    l.title = tip;
    const i = el('input');
    i.type = 'checkbox';
    i.addEventListener('change', draw);
    l.append(i, doc.createTextNode(label));
    bar.append(l);
    return i;
  };
  bar.append(search, findBtn);
  const onlyChanged = filterBox('Changed only', 'Only the commands whose keys you changed');
  const onlyClashes = filterBox('Conflicts only', 'Only the commands that share a key with another command live at the same time');
  const spacer = el('span', 'fx-prefs-spacer');
  const undoBtn = button('Undo', 'Take back the last change (up to ten)', () => { if (undoKeyChange()) say('The last change taken back'); });
  const fileIn = el('input');
  fileIn.type = 'file';
  fileIn.accept = '.json,application/json';
  fileIn.hidden = true;
  fileIn.addEventListener('change', () => {
    const f = fileIn.files?.[0];
    fileIn.value = '';
    if (!f) return;
    void f.text().then((text) => {
      const r = importShortcuts(text);
      if (r.ok) say(`Imported: ${r.count} command${r.count === 1 ? '' : 's'} set from the file, every other one at its default (Undo takes it back)`);
      else say(r.error, 'error');
    });
  });
  const importBtn = button('Import…', 'Read a shortcut set from a file you exported', () => fileIn.click());
  const exportBtn = button('Export…', 'Save your shortcut set to a file (your changes only), to keep it or use it in another browser', () => {
    const blob = new Blob([exportShortcuts()], { type: 'application/json' });
    const a = el('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'forge-shortcuts.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    say('Exported to forge-shortcuts.json');
  });
  const resetAllBtn = button('Reset all to defaults', 'Every command back to its default keys', () => {
    const n = customCount();
    if (!n) { say('Every command is at its default already'); return; }
    ask(`Put all ${n} changed command${n === 1 ? '' : 's'} back to their default keys? Undo takes it back.`, [['Reset all', () => { resetAllKeys(); say('Every command back to its default keys'); }, true]]);
  }, 'fx-tool fx-danger');
  bar.append(spacer, undoBtn, importBtn, exportBtn, resetAllBtn, fileIn);

  // The line for what just happened, and for a question (a clash, a browser key, a reset that takes a key back).
  const msg = el('div', 'fx-prefs-msg');
  msg.setAttribute('role', 'status');
  msg.hidden = true;
  const say = (text: string, kind: 'info' | 'warn' | 'error' = 'info'): void => {
    msg.replaceChildren(el('span', '', text));
    msg.dataset['kind'] = kind;
    msg.hidden = false;
  };
  const ask = (text: string, choices: readonly (readonly [string, () => void, boolean?])[]): void => {
    msg.replaceChildren(el('span', '', text));
    msg.dataset['kind'] = 'ask';
    msg.hidden = false;
    const row = el('span', 'fx-prefs-ask');
    for (const [label, run, danger] of choices) row.append(button(label, label, () => { msg.hidden = true; run(); }, danger ? 'fx-tool fx-danger' : 'fx-tool fx-primary'));
    row.append(button('Cancel', 'Leave it as it was', () => { msg.hidden = true; }));
    msg.append(row);
    (row.firstElementChild as HTMLButtonElement | null)?.focus();
  };

  const list = el('div', 'fx-prefs-list');
  const footer = el('footer');
  footer.append(button('Close', 'Close (Esc)', () => close(), 'fx-tool fx-primary'));
  const shortcutsPane = el('div', 'fx-prefs-pane fx-prefs-shortcuts');
  shortcutsPane.setAttribute('role', 'tabpanel');
  shortcutsPane.append(bar, msg, list);
  /** A page shown: its tab marked, the other page hidden; the shortcuts' key recording only while they show. */
  const showPage = (page: 'appearance' | 'shortcuts'): void => {
    const shortcuts = page === 'shortcuts';
    appearance.hidden = shortcuts;
    shortcutsPane.hidden = !shortcuts;
    // No veil and no blur over the editor while Appearance shows (the owner, 2026-11-25: "I want to see the changes in the
    // editor"): a theme chosen or a colour edited shows on the page behind at once.
    modal.classList.toggle('is-appearance', !shortcuts);
    changed.hidden = !shortcuts;
    appearanceTab.classList.toggle('is-on', !shortcuts);
    shortcutsTab.classList.toggle('is-on', shortcuts);
    appearanceTab.setAttribute('aria-selected', String(!shortcuts));
    shortcutsTab.setAttribute('aria-selected', String(shortcuts));
    // The search field on the shortcuts' page; the Appearance tab itself on its own (a card focused would ring it as chosen).
    if (shortcuts) search.focus(); else appearanceTab.focus({ focusVisible: false } as FocusOptions);
  };
  appearanceTab.addEventListener('click', () => showPage('appearance'));
  shortcutsTab.addEventListener('click', () => showPage('shortcuts'));
  card.append(head, appearance, shortcutsPane, footer);
  modal.append(card);
  doc.body.append(modal);

  /* ---------- recording a key ---------- */

  let recording: { id: string; slot: number; btn: HTMLButtonElement } | { find: true } | null = null;
  const stopRecording = (): void => {
    if (recording && 'btn' in recording) recording.btn.classList.remove('is-recording');
    findBtn.classList.remove('is-recording');
    recording = null;
  };
  function record(r: { id: string; slot: number; btn: HTMLButtonElement } | { find: true }): void {
    stopRecording();
    recording = r;
    if ('btn' in r) { r.btn.classList.add('is-recording'); r.btn.textContent = 'Press keys…'; r.btn.focus(); }
    else { findBtn.classList.add('is-recording'); findBtn.textContent = 'Press keys…'; }
    say('Press the key or chord. Click anywhere else to cancel.');
  }
  /** A key pressed while recording: shown live for a modifier, kept for anything else. */
  const onKey = (e: KeyboardEvent): void => {
    if (!recording) {
      if (e.key === 'Escape' && !(e.target instanceof HTMLInputElement && e.target.type === 'search' && e.target.value)) { e.preventDefault(); e.stopImmediatePropagation(); if (!msg.hidden && msg.dataset['kind'] === 'ask') msg.hidden = true; else close(); }
      return;
    }
    e.preventDefault();
    e.stopImmediatePropagation();
    const chord = chordOf(e);
    const live = `${e.ctrlKey || e.metaKey ? 'Ctrl+' : ''}${e.altKey ? 'Alt+' : ''}${e.shiftKey ? 'Shift+' : ''}…`;
    if (!chord) { if ('btn' in recording) recording.btn.textContent = live; else findBtn.textContent = live; return; }
    const r = recording;
    stopRecording();
    findBtn.textContent = 'Find by key';
    if ('find' in r) { findChord = chord; search.value = ''; draw(); say(`Commands on ${chordLabel(chord)}`); return; }
    choose(r.id, r.slot, chord);
  };
  const onKeyUp = (e: KeyboardEvent): void => { if (recording) { e.preventDefault(); e.stopImmediatePropagation(); } };
  const onPointer = (e: PointerEvent): void => {
    if (!recording) return;
    const t = e.target as Node | null;
    if ('btn' in recording && t && recording.btn.contains(t)) return;
    if ('find' in recording && t && findBtn.contains(t)) return;
    stopRecording();
    findBtn.textContent = 'Find by key';
    draw();
    say('Cancelled');
  };
  const win = doc.defaultView ?? globalThis;
  win.addEventListener('keydown', onKey, true);
  win.addEventListener('keyup', onKeyUp, true);
  doc.addEventListener('pointerdown', onPointer, true);
  pauseKeys(true);

  /** Key `chord` for command `id`'s slot `slot`: checked against the browser, the system and the other commands first. */
  function choose(id: string, slot: number, chord: string): void {
    const cmd = SHORTCUT_COMMANDS.find((c) => c.id === id)!;
    const issues = keyIssues(id, chord);
    const refused = issues.find((i) => i.level === 'refuse');
    if (refused) { draw(); say(refused.text, 'error'); return; }
    const now = [...keysOf(id)];
    if (now.includes(chord) && now.indexOf(chord) !== slot) { draw(); say(`${chordLabel(chord)} is already ${cmd.label}'s`); return; }
    const next = [...now];
    next[slot] = chord;
    const keys = next.filter(Boolean);
    const clashes = clashesFor(id, chord).filter((c) => c.kind === 'clash');
    const strong = issues.find((i) => i.level === 'strong');
    const warn = issues.find((i) => i.level === 'warn');
    const notes = issues.filter((i) => i.level === 'note').map((i) => i.text);
    const shadows = clashesFor(id, chord).filter((c) => c.kind === 'shadow').map((c) => `${c.command.label} (${whereWords(c.command)})`);
    const apply = (): void => {
      setKeysTogether([{ id, keys }, ...clashes.map((c) => ({ id: c.command.id, keys: keysOf(c.command.id).filter((k) => k !== chord) }))]);
      const parts = [`${cmd.label}: ${chordLabel(chord)}`];
      if (clashes.length) parts.push(`taken from ${clashes.map((c) => c.command.label).join(', ')}, now ${clashes.length === 1 ? 'without it' : 'each without it'}`);
      if (shadows.length) parts.push(`also ${shadows.join(', ')} -- only one of them is live at a time`);
      if (warn) parts.push(warn.text);
      if (notes.length) parts.push(notes.join(' '));
      say(parts.join('. '), warn ? 'warn' : 'info');
    };
    const why: string[] = [];
    if (clashes.length) why.push(`${chordLabel(chord)} is already ${clashes.map((c) => `${c.command.label} (${whereWords(c.command)})`).join(', ')}, live at the same time: moving it here takes it off ${clashes.length === 1 ? 'that command' : 'those commands'}.`);
    if (strong) why.push(strong.text);
    if (why.length) { draw(); ask(why.join(' '), [[clashes.length ? 'Move it here' : 'Use it anyway', apply, !!strong]]); return; }
    apply();
  }

  /** A command's keys back to its defaults -- asked first where another command now has one of them. */
  function reset(cmd: ShortcutCommand): void {
    const takers = cmd.defaults.flatMap((k) => clashesFor(cmd.id, k).filter((c) => c.kind === 'clash').map((c) => ({ k, c: c.command })));
    const go = (): void => {
      setKeysTogether([{ id: cmd.id, keys: cmd.defaults }, ...takers.map(({ k, c }) => ({ id: c.id, keys: keysOf(c.id).filter((x) => x !== k) }))]);
      say(`${cmd.label}: back to ${keysLabel(cmd.id) || 'no key'}`);
    };
    if (!takers.length) { go(); return; }
    ask(`${cmd.label}'s default ${takers.map(({ k, c }) => `${chordLabel(k)} is now ${c.label}'s`).join('; ')}. Reset anyway? ${takers.map(({ c }) => c.label).join(', ')} will lose it.`, [['Reset anyway', go, true]]);
  }

  /* ---------- the list ---------- */

  function draw(): void {
    const n = customCount();
    changed.textContent = n ? `${n} changed` : 'All defaults';
    undoBtn.disabled = !canUndoKeyChange();
    const q = search.value.trim().toLowerCase();
    if (q) findChord = null;
    const groups = new Map<string, ShortcutCommand[]>();
    for (const cmd of SHORTCUT_COMMANDS) {
      const keys = keysOf(cmd.id);
      const clash = keys.some((k) => clashesFor(cmd.id, k).some((c) => c.kind === 'clash'));
      if (onlyChanged.checked && !isCustom(cmd.id)) continue;
      if (onlyClashes.checked && !clash) continue;
      if (findChord && !keys.includes(findChord)) continue;
      if (q && !`${cmd.label} ${cmd.group} ${whereWords(cmd)} ${keysLabel(cmd.id)}`.toLowerCase().includes(q)) continue;
      (groups.get(cmd.group) ?? groups.set(cmd.group, []).get(cmd.group)!).push(cmd);
    }
    const out: HTMLElement[] = [];
    if (findChord) {
      const chip = el('div', 'fx-prefs-findline');
      chip.append(el('span', '', `Commands on ${chordLabel(findChord)}`), button('Show all', 'Show every command again', () => { findChord = null; draw(); }));
      out.push(chip);
    }
    for (const [group, cmds] of groups) {
      out.push(el('h3', 'fx-prefs-group', group));
      for (const cmd of cmds) out.push(rowOf(cmd));
    }
    if (!groups.size) out.push(el('p', 'fx-prefs-empty', findChord ? `No command is on ${chordLabel(findChord)}.` : 'No command matches.'));
    if (!q && !findChord && !onlyChanged.checked && !onlyClashes.checked) {
      out.push(el('h3', 'fx-prefs-group', 'Fixed keys (not commands)'));
      for (const f of FIXED_KEYS) {
        const r = el('div', 'fx-prefs-row is-fixed');
        const what = el('div', 'fx-prefs-cmd');
        what.append(el('span', 'fx-prefs-name', f.label));
        r.append(what, el('div', 'fx-prefs-fixedkeys', f.keys));
        out.push(r);
      }
    }
    list.replaceChildren(...out);
  }

  function rowOf(cmd: ShortcutCommand): HTMLElement {
    const keys = keysOf(cmd.id);
    const row = el('div', 'fx-prefs-row');
    row.classList.toggle('is-custom', isCustom(cmd.id));
    const what = el('div', 'fx-prefs-cmd');
    what.append(el('span', 'fx-prefs-name', cmd.label), el('span', 'fx-prefs-where', whereWords(cmd)));
    const notes = el('div', 'fx-prefs-notes');
    for (const k of keys) {
      for (const c of clashesFor(cmd.id, k)) {
        const n = el('div', c.kind === 'clash' ? 'is-clash' : 'is-shadow',
          c.kind === 'clash' ? `${chordLabel(k)} is also ${c.command.label}'s, live at the same time: one of them will not work` : `${chordLabel(k)} is also ${c.command.label} (${whereWords(c.command)})`);
        notes.append(n);
        if (c.kind === 'clash') row.classList.add('has-clash');
      }
      for (const i of keyIssues(cmd.id, k)) if (i.level === 'warn' || i.level === 'strong') notes.append(el('div', 'is-warn', i.text));
    }
    if (notes.childElementCount) what.append(notes);
    const slots = el('div', 'fx-prefs-keys');
    for (let i = 0; i < 2; i++) {
      const k = keys[i];
      const slot = el('span', 'fx-prefs-slot');
      const b = button(k ? chordLabel(k) : 'Add key', k ? `Click, then press the new key for ${cmd.label}` : `Click, then press a key for ${cmd.label}`, () => record({ id: cmd.id, slot: k ? i : keys.length, btn: b }), `fx-prefs-key${k ? '' : ' is-empty'}`);
      slot.append(b);
      if (k) slot.append(button('×', `Take ${chordLabel(k)} off ${cmd.label}`, () => { setKeysTogether([{ id: cmd.id, keys: keys.filter((x) => x !== k) }]); say(`${cmd.label}: ${chordLabel(k)} taken off${keys.length === 1 ? ' -- it has no key now' : ''}`); }, 'fx-prefs-clear'));
      slots.append(slot);
      if (!k) break;                                         // one empty slot at most
    }
    const resetBtn = button('↺', `Reset ${cmd.label} to its default (${cmd.defaults.map((d) => chordLabel(d)).join(', ') || 'no key'})`, () => reset(cmd), 'fx-prefs-reset');
    resetBtn.hidden = !isCustom(cmd.id);
    row.append(what, slots, resetBtn);
    return row;
  }

  search.addEventListener('input', draw);
  const off = onShortcutsChange(draw);
  function close(): void {
    win.removeEventListener('keydown', onKey, true);
    win.removeEventListener('keyup', onKeyUp, true);
    doc.removeEventListener('pointerdown', onPointer, true);
    pauseKeys(false);
    off();
    offTheme();
    modal.remove();
    open = null;
  }
  modal.addEventListener('pointerdown', (e) => { if (e.target === modal) close(); });
  open = { close };
  draw();
  showPage('appearance');
}

/** The editor closed, where it is open (a page torn down). */
export function closeShortcutEditor(): void { open?.close(); }
