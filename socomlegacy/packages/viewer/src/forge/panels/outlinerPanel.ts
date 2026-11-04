import type { MenuItem } from '../padMenu';
import { builtPanel, forgeEl, revealRow, type ForgePanel } from '../shell/panel';

/**
 * FUI-1 (a browser adaptation, FG.R2): the Outliner, registered after the Inspector. Its markup is the page's as it was
 * (`.fx-outliner-tools` with its search and type filter, `ul.fx-outliner`); the page's closure keeps drawing its rows.
 */
export interface OutlinerDom {
  body: HTMLDivElement;
  list: HTMLUListElement;
  search: HTMLInputElement;
  filter: HTMLSelectElement;
}

/** FCW-32 step 4 (FUI.R23 D4): `rules`, the layout's zones, markers and spawners, each a row by its authored id. */
export const OUTLINER_FILTERS = [['all', 'All'], ['pieces', 'Pieces'], ['spawns', 'Spawns'], ['npcs', 'NPCs'], ['rules', 'Rules'], ['missing', 'Missing'], ['hidden', 'Hidden']] as const;

export function buildOutliner(doc: Document): OutlinerDom {
  const list = forgeEl(doc, 'ul', 'fx-outliner');
  const tools = forgeEl(doc, 'div', 'fx-outliner-tools');
  const search = forgeEl(doc, 'input', 'fx-search');
  search.type = 'search';
  search.placeholder = 'Search placed…';
  search.setAttribute('aria-label', 'Search the outliner');
  const filter = forgeEl(doc, 'select', 'fx-select');
  filter.setAttribute('aria-label', 'Filter the outliner by type');
  for (const [value, label] of OUTLINER_FILTERS) {
    const o = forgeEl(doc, 'option', '', label);
    o.value = value;
    filter.append(o);
  }
  tools.append(search, filter);
  const body = forgeEl(doc, 'div', 'fx-section');                    // FUI-22 (D2): the dock's one section style
  body.append(tools, list);
  return { body, list, search, filter };
}

/** Its pad path: a START row that shows it, with how many rows it lists. */
export function outlinerPanel(dom: OutlinerDom, reveal: (id: string) => void): ForgePanel {
  const menuSection = (): MenuItem[] => {
    const rows = dom.list.querySelectorAll('li:not(.fx-empty)').length;
    return [revealRow(reveal, 'outliner', 'Outliner', `${rows} listed`, 'What the layout places · ✕ shows it in the dock')];
  };
  return builtPanel({ id: 'outliner', title: 'Outliner', dock: 'right', order: 20, defaultOpen: true, tab: 'Edit',
    padLegend: [{ button: 'cross', label: 'Show' }], menuSection }, dom.body);
}
