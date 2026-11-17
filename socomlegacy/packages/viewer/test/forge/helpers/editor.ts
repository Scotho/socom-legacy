/**
 * FC2-4 (product track: a test harness, no original -- the Forge has none, FG.R2): how a test of the MOUNTED Forge page
 * finds and presses things in the contributor's editor (`e8acb4d970`, MISSION OT.R112: the Forge's UI is his, so the
 * tests bend to it). Each function reaches one affordance BY HIS UI -- the element a person sees, the menu or the key
 * they would use -- and names its row of `./EDITOR-MAP.md`. Where his UI has no such thing the function throws an Error
 * naming that row, so a test fails with a sentence, never a null click. Nothing here clicks an element that is not on
 * the page, and nothing reaches into the page's internals to fake a press.
 */

/**
 * FC2-7 (a test-environment gap, not a defect of his; product track): jsdom has no `CSS`, and his dock shell's
 * `focusTab` (`src/forge/shell/dockShell.ts`) calls `CSS.escape` after a tab is activated -- in a browser it is there; in
 * jsdom his click handler threw (8 uncaught TypeErrors in the FC2-7 run at `0a63f33db9`, which vitest warns may hide a
 * false pass). Every mounted-page test that presses his tabs imports this file, so the shim lives here, before any page
 * mounts: only when `CSS.escape` is absent, an identifier serialised as CSSOM's `CSS.escape` does it (each character
 * outside `[a-zA-Z0-9_-]` and ASCII escaped with a backslash; a control character, or a digit leading the identifier
 * or following a leading `-`, as a code-point escape; a lone `-` escaped; NUL as U+FFFD).
 */
{
  const g = globalThis as { CSS?: { escape?: (value: string) => string } };
  if (typeof g.CSS?.escape !== 'function') {
    const escape = (value: string): string => {
      const chars = [...String(value)];
      return chars.map((ch, i) => {
        const cp = ch.codePointAt(0) ?? 0;
        if (cp === 0) return '�';
        const leadingDigit = /[0-9]/.test(ch) && (i === 0 || (i === 1 && chars[0] === '-'));
        if ((cp >= 0x1 && cp <= 0x1f) || cp === 0x7f || leadingDigit) return `\\${cp.toString(16)} `;
        if (i === 0 && ch === '-' && chars.length === 1) return '\\-';
        if (cp >= 0x80 || /[a-zA-Z0-9_-]/.test(ch)) return ch;
        return `\\${ch}`;
      }).join('');
    };
    g.CSS = { ...(g.CSS ?? {}), escape };
  }
}

/** An Error naming the map's row (`./EDITOR-MAP.md`). */
export class EditorMapError extends Error {
  constructor(row: string, words: string) {
    super(`EDITOR-MAP ${row}: ${words}`);
    this.name = 'EditorMapError';
  }
}

/**
 * Whether an element is on the page and drawn: connected, and not waiting in the dock shell's stash of tabs not shown
 * (`.fx-dg-stash`, hidden; map D8).
 */
export function drawn(el: Element | null | undefined): el is HTMLElement {
  return !!el && el.isConnected && !el.closest('.fx-dg-stash');
}

/** Each panel's dock tab (its `tab` slugged, else its id; map, "The panels and their tabs"). */
export const PANEL_TAB: Readonly<Record<string, string>> = {
  'asset-browser': 'assets', viewport: 'viewport', outliner: 'object', inspector: 'inspector',
  settings: 'map', environment: 'map', rules: 'map', starters: 'map', 'creator-assets': 'content', agent: 'agent',
};

/* ---------------- docks and tabs (map D1-D11) ---------------- */

/** The tab keys drawn now, for an Error's words. */
const drawnTabs = (doc: Document): string[] =>
  [...doc.querySelectorAll<HTMLElement>('.fx-dg-tab[data-forge-tab]')].filter(drawn).map((b) => b.dataset['forgeTab'] ?? '');

/** Map D6: a dock tab's button (`.fx-dg-tab[data-forge-tab]`), drawn. `world` is his `map`. */
export function tabButton(doc: Document, key: string): HTMLButtonElement {
  if (key === 'world') throw new EditorMapError('D6', "his dock has no World tab: World's panels are under the Map tab (key 'map')");
  const b = [...doc.querySelectorAll<HTMLButtonElement>(`.fx-dg-tab[data-forge-tab="${key}"]`)].find(drawn);
  if (!b) throw new EditorMapError('D6', `no dock tab '${key}' is drawn (drawn: ${drawnTabs(doc).join(', ') || 'none'})`);
  return b;
}

/** Map D6: a dock tab pressed (its group shows it); its group returned. */
export function showTab(doc: Document, key: string): HTMLElement {
  tabButton(doc, key).click();
  return dockOf(doc, key);
}

/** Map D1, D3, D5: the dock group holding a tab (`.fx-dg-group`): `assets` the old left dock, `viewport` the centre. */
export function dockOf(doc: Document, key: string): HTMLElement {
  const g = tabButton(doc, key).closest<HTMLElement>('.fx-dg-group');
  if (!g) throw new EditorMapError('D5', `the tab '${key}' is in no dock group`);
  return g;
}

/**
 * Map D2: the old right dock has no one element in his shell (a column of the Object / Map / Content / Agent group over
 * the Inspector's) -- reach a panel by `panel` or `showPanel`.
 */
export function rightDock(_doc: Document): never {
  throw new EditorMapError('D2', 'his dock shell has no one right dock: reach a panel by panel(doc, id) or showPanel(doc, id)');
}

/** Map D8: a panel's host (`[data-forge-panel]`), whether drawn or waiting in the stash -- for a read that needs no press. */
export function panelMounted(doc: Document, id: string): HTMLElement {
  const host = doc.querySelector<HTMLElement>(`[data-forge-panel="${id}"]`);
  if (!host) throw new EditorMapError('D8', `no panel '${id}' is registered`);
  return host;
}

/** Map D8: a panel's host, drawn now (its tab its group's active one). */
export function panel(doc: Document, id: string): HTMLElement {
  const host = panelMounted(doc, id);
  if (!drawn(host)) {
    throw new EditorMapError('D8', `the panel '${id}' is not drawn: its tab '${PANEL_TAB[id] ?? '?'}' is not its group's active one (showPanel(doc, '${id}') presses it)`);
  }
  return host;
}

/**
 * Map D8: the panels drawn now (each `details.fx-panel` in a drawn tab's body, `.fx-dg-body`), in the page's order: the
 * workbench's groups left to right, top to bottom. A panel waiting in the stash is not among them.
 */
export function drawnPanels(doc: Document): string[] {
  return [...doc.querySelectorAll<HTMLElement>('.fx-dg-root .fx-dg-body > details.fx-panel[data-forge-panel]')]
    .filter(drawn).map((d) => d.dataset['forgePanel'] ?? '');
}

/** Map D6, D8: a panel's tab pressed, then its host (drawn). */
export function showPanel(doc: Document, id: string): HTMLElement {
  const key = PANEL_TAB[id];
  if (!key) throw new EditorMapError('D8', `no tab is known for the panel '${id}'`);
  showTab(doc, key);
  return panel(doc, id);
}

/* ---------------- the toolbar and the menu bar (map T1-T12, D11) ---------------- */

/** The old toolbar buttons his toolbar dropped, and where each went. */
const OFF_THE_TOOLBAR: Readonly<Record<string, readonly [string, string]>> = {
  New: ['T2', 'File > New... (pressNew)'],
  Open: ['T3', 'File > Open... (pressOpen)'],
  Saves: ['T4', 'File > Saves... (pressSaves)'],
  Duplicate: ['T7', "Edit > Duplicate (pressMenubar(doc, 'Edit', 'Duplicate'))"],
  Delete: ['T7', "Edit > Delete (pressMenubar(doc, 'Edit', 'Delete'))"],
  'Reset layout': ['D11', "Window > Reset layout (pressMenubar(doc, 'Window', 'Reset layout'))"],
};

/**
 * Map T5-T10: a toolbar or tools-row button by its word (its text, else its aria-label: an icon-only tool's word),
 * drawn. A button his toolbar dropped throws its row and where it went.
 */
export function toolbarButton(doc: Document, label: string): HTMLButtonElement {
  const off = OFF_THE_TOOLBAR[label];
  if (off) throw new EditorMapError(off[0], `his toolbar has no ${label} button: ${off[1]}`);
  const b = [...doc.querySelectorAll<HTMLButtonElement>('.fx-top button.fx-tool, .fx-tools-row button.fx-tool')]
    .find((x) => drawn(x) && (x.textContent?.trim() === label || x.getAttribute('aria-label') === label));
  if (!b) throw new EditorMapError('T5-T10', `no toolbar button '${label}' is on the page`);
  return b;
}

/** Map T1: the old forge-menu button, not on his page (built, never attached: page.ts:961-963, 1030-1044). */
export function menuButton(_doc: Document): never {
  throw new EditorMapError('T1', "his toolbar has no forge-menu button (page.ts:1032-1033): pressForgeMenu (Controls > 'Forge menu (M)') or menuKey (M)");
}

/** Map T12: a menu bar row (File, Edit, Window), its menu opened first if it is shut; the row returned, unpressed. */
export function menubarRow(doc: Document, menu: string, label: string): HTMLButtonElement {
  const title = [...doc.querySelectorAll<HTMLElement>('.fx-top .fx-menubar summary.fx-menubar-title')].find((s) => drawn(s) && s.textContent?.trim() === menu);
  if (!title) throw new EditorMapError('T12', `no menu bar menu '${menu}'`);
  const d = title.closest('details');
  if (!d?.open) title.click();
  const row = [...doc.querySelectorAll<HTMLButtonElement>('.fx-menubar-list .fx-menubar-row')]
    .find((r) => r.isConnected && r.querySelector('.fx-menubar-label')?.textContent?.trim() === label);
  if (!row) throw new EditorMapError('T12', `the ${menu} menu has no row '${label}'`);
  return row;
}

/** Map T12: a menu bar row pressed (a greyed row's press does nothing, as a person's would). */
export function pressMenubar(doc: Document, menu: string, label: string): void {
  menubarRow(doc, menu, label).click();
}

/** Map T2, C2: New (File > New...). */
export const pressNew = (doc: Document): void => pressMenubar(doc, 'File', 'New…');
/** Map T3, C3: Open (File > Open...). */
export const pressOpen = (doc: Document): void => pressMenubar(doc, 'File', 'Open…');
/** Map T4, C1: Saves (File > Saves...). */
export const pressSaves = (doc: Document): void => pressMenubar(doc, 'File', 'Saves…');

/* ---------------- the forge menu (map T1, M1-M3) ---------------- */

/**
 * Whether the forge menu is open: its card in the menu's host shown (`.fx-padmenu`, page.ts:12286). A shut menu leaves its last card in its
 * hidden host (`drawMenu` only hides the host), so a card alone does not say the menu is open.
 */
const OPEN_MENU = '.fx-padmenu:not([hidden]) .fx-menu';
export const menuOpen = (doc: Document): boolean => drawn(doc.querySelector(OPEN_MENU));

/**
 * Map T1, M3: the pointer's way to the forge menu in his UI -- Controls, then the card's "Forge menu (M)" -- which presses
 * the menu's own button: the same toggle as the old toolbar button (a second press shuts the menu) and its pointer hint.
 */
export function pressForgeMenu(doc: Document): void {
  toolbarButton(doc, 'Controls').click();
  const way = doc.querySelector<HTMLButtonElement>('.fx-help footer button[data-help-menu]');
  if (!drawn(way) || way.closest<HTMLElement>('[hidden]')) throw new EditorMapError('T1', "the Controls card's 'Forge menu (M)' button is not shown");
  way.click();
}

/** Map T1, M1: the forge menu opened by the pointer's way (`pressForgeMenu`); its card returned. */
export function openMenu(doc: Document): HTMLElement {
  if (menuOpen(doc)) throw new EditorMapError('M1', 'the forge menu is open already (pressForgeMenu would shut it)');
  pressForgeMenu(doc);
  const card = doc.querySelector<HTMLElement>(OPEN_MENU);
  if (!drawn(card)) throw new EditorMapError('M1', 'the forge menu did not open (a walk or a match holds the menu button disabled)');
  return card;
}

/** Map T1: the keyboard's way to the forge menu (M), as a person presses it. */
export function menuKey(): void {
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyM', key: 'm', bubbles: true, cancelable: true }));
}

/** Map M1, M2: an open menu's row by its id (`data-forge-menu-row`). */
export function menuRow(doc: Document, id: string): HTMLElement {
  const li = doc.querySelector<HTMLElement>(`${OPEN_MENU} li[data-forge-menu-row="${id}"]`);
  if (!drawn(li)) throw new EditorMapError('M2', `the forge menu shows no row '${id}'${menuOpen(doc) ? '' : ' (the menu is shut)'}`);
  return li;
}

/** Map M1: an open menu's row by its label (`.fx-menu-label`). */
export function menuRowLabelled(doc: Document, label: string): HTMLElement {
  const li = [...doc.querySelectorAll<HTMLElement>(`${OPEN_MENU} li[data-forge-menu-row]`)].find((r) => r.querySelector('.fx-menu-label')?.textContent === label);
  if (!drawn(li)) throw new EditorMapError('M1', `the forge menu shows no row labelled '${label}'`);
  return li;
}

/* ---------------- the assets list (map A1-A4) ---------------- */

/** Map A1: the one asset list (`ul.fx-assets`) in the Assets panel. */
export function assetList(doc: Document): HTMLUListElement {
  const ul = panel(doc, 'asset-browser').querySelector<HTMLUListElement>('ul.fx-assets');
  if (!ul) throw new EditorMapError('A1', 'the Assets panel holds no ul.fx-assets');
  return ul;
}

/** Map A1: the list's tiles (`li[data-asset]`). */
export const assetTiles = (doc: Document): HTMLElement[] => [...assetList(doc).querySelectorAll<HTMLElement>(':scope > li[data-asset]')];

/** Map A1: one tile by its asset id. */
export function assetTile(doc: Document, asset: string): HTMLElement {
  const li = assetList(doc).querySelector<HTMLElement>(`:scope > li[data-asset="${asset}"]`);
  if (!li) throw new EditorMapError('A1', `the asset list has no tile '${asset}'`);
  return li;
}

/* ---------------- the outliner (map O1-O5) ---------------- */

/** Map O1: the outliner's tree (`ul.fx-outliner`), its panel drawn. */
export function outliner(doc: Document): HTMLUListElement {
  const ul = panel(doc, 'outliner').querySelector<HTMLUListElement>('ul.fx-outliner');
  if (!ul) throw new EditorMapError('O1', 'the Outliner panel holds no ul.fx-outliner');
  return ul;
}

/** Map O2, O3: one of the tree's two section rows -- 'user' (User Objects) or 'map' (Map Objects); its click folds it. */
export function outlinerSection(doc: Document, id: 'user' | 'map'): HTMLLIElement {
  const li = outliner(doc).querySelector<HTMLLIElement>(`:scope > li.fx-outliner-section[data-outliner-section="${id}"]`);
  if (!li) throw new EditorMapError('O2', `the outliner has no '${id}' section row`);
  return li;
}

/** Map O6: the outliner's Filter (`details.fx-outliner-filter`, its summary the word Filter), where the old type select was. */
export function outlinerFilter(doc: Document): HTMLDetailsElement {
  const d = panel(doc, 'outliner').querySelector<HTMLDetailsElement>('.fx-outliner-tools > details.fx-outliner-filter');
  if (!d) throw new EditorMapError('O6', 'the Outliner has no Filter dropdown (details.fx-outliner-filter)');
  return d;
}

/** Map O4: the placements' rows (`li[data-user-prop]`). */
export const userRows = (doc: Document): HTMLElement[] => [...outliner(doc).querySelectorAll<HTMLElement>('li[data-user-prop]')];

/** Map O2: the old tree's branch by kind -- his tree has none. */
export function treeBranch(_doc: Document, kind: string): never {
  throw new EditorMapError('O2', `his outliner has no branch '${kind}' (no row sets data-tree-branch): its tree is two section rows, outlinerSection(doc, 'user' | 'map')`);
}

/** Map O3: the old branch's fold toggle -- his section row folds on its own click. */
export function treeToggle(_doc: Document, kind: string): never {
  throw new EditorMapError('O3', `his outliner has no .fx-tree-toggle (for '${kind}'): a section row's own click folds it`);
}

/* ---------------- the Inspector (map I1-I3) ---------------- */

/** Map I1: the Inspector's panel (its own tab, drawn by default). */
export const inspector = (doc: Document): HTMLElement => panel(doc, 'inspector');

/** Map I2: an Inspector field by its `data-label`. */
export function inspectorField(doc: Document, label: string): HTMLInputElement {
  const i = inspector(doc).querySelector<HTMLInputElement>(`input[data-label="${label}"]`);
  if (!i) throw new EditorMapError('I2', `the Inspector has no field '${label}'`);
  return i;
}

/* ---------------- the viewport's snaps (map V1) ---------------- */

/** Map V1: a viewport snap pill's on / off toggle ('Workplane snap' or 'Rotation snap'); `is-on` while that snap is on. */
export function snapToggle(doc: Document, label: 'Workplane snap' | 'Rotation snap'): HTMLButtonElement {
  const b = doc.querySelector<HTMLButtonElement>(`.fx-snap-pill[aria-label="${label}"] > .fx-snap-toggle`);
  if (!drawn(b)) throw new EditorMapError('V1', `the viewport has no '${label}' pill`);
  return b;
}

/* ---------------- the status bar (map S1) ---------------- */

/** Map S1: the status line (`.fx-status-msg`). */
export function statusLine(doc: Document): HTMLElement {
  const s = doc.querySelector<HTMLElement>('.fx-status .fx-status-msg');
  if (!s) throw new EditorMapError('S1', 'the status bar has no .fx-status-msg');
  return s;
}

/** Map S1: a status chip's word as shown; null when the chip is absent or hidden. */
export function chipWord(doc: Document, id: string): string | null {
  const chip = doc.querySelector<HTMLElement>(`.fx-status [data-forge-chip="${id}"]`);
  return chip && !chip.hidden ? chip.querySelector('.s2u-chip__word')?.textContent ?? null : null;
}
